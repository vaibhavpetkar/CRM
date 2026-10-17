#!/usr/bin/env bash
# Basic security hardening for the CRM server (Ubuntu 22.04 / 24.04, Docker
# Compose stack in /var/www/crm). Safe to run more than once: every step
# checks what is already there and only changes what is missing.
#
#   sudo bash deploy/harden-server.sh
#
# Plain-language guide (what it does, how to undo it): docs/server-security.md
#
# Optional settings (put them before the command, e.g. `sudo SSH_PORT=2222 bash ...`):
#   SSH_PORT=22        extra SSH port to keep open (the port sshd really uses is always kept open)
#   ADMIN_USER=ubuntu  the account you log in with (default: the user who ran sudo)
#   EXTRA_PORTS="8080/tcp"  more ports to open to the internet (space separated)
#   DOCKER_UFW=1       0 = don't add the Docker firewall rules (see step 2)
#   SWAP_SIZE=2G       swap file size to create when there is none and RAM < 4 GB (0 = never)
#   CRM_DIR=/var/www/crm   where docker-compose*.yml live (only read, never changed)

set -euo pipefail

SSH_PORT="${SSH_PORT:-22}"
EXTRA_PORTS="${EXTRA_PORTS:-}"
DOCKER_UFW="${DOCKER_UFW:-1}"
SWAP_SIZE="${SWAP_SIZE:-2G}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -z "${CRM_DIR:-}" ]; then
  if [ -f /var/www/crm/docker-compose.yml ]; then CRM_DIR=/var/www/crm; else CRM_DIR="$(dirname "$SCRIPT_DIR")"; fi
fi

SSHD_DROPIN=/etc/ssh/sshd_config.d/01-crm-hardening.conf
SYSCTL_DROPIN=/etc/sysctl.d/99-crm-hardening.conf
F2B_JAIL=/etc/fail2ban/jail.d/crm.local
PRUNE_CRON=/etc/cron.d/crm-docker-prune
DOCKER_DAEMON_JSON=/etc/docker/daemon.json
UFW_AFTER_RULES=/etc/ufw/after.rules

WARNINGS=()
NOTES=()

# ── output helpers ───────────────────────────────────────────────────────────
if [ -t 1 ]; then B=$'\033[1m' BL=$'\033[1;34m' G=$'\033[32m' Y=$'\033[33m' R=$'\033[31m' N=$'\033[0m'
else B='' BL='' G='' Y='' R='' N=''; fi
step() { printf '\n%s==> %s%s\n' "$BL" "$*" "$N"; }
info() { printf '    %s\n' "$*"; }
ok()   { printf '    %s[ok]%s %s\n' "$G" "$N" "$*"; }
warn() { printf '    %s[warn]%s %s\n' "$Y" "$N" "$*"; WARNINGS+=("$*"); }
note() { NOTES+=("$*"); }
die()  { printf '%s[error]%s %s\n' "$R" "$N" "$*" >&2; exit 1; }

# Write $2 to file $1 only if the content differs. Returns 0 if it changed.
write_if_changed() {
  local path="$1" content="$2"
  if [ -f "$path" ] && [ "$(cat "$path")" = "$content" ]; then
    return 1
  fi
  mkdir -p "$(dirname "$path")"
  printf '%s\n' "$content" > "$path"
  return 0
}

apt_install() {
  local missing=()
  local pkg
  for pkg in "$@"; do
    dpkg-query -W -f='${Status}' "$pkg" 2>/dev/null | grep 'install ok installed' >/dev/null || missing+=("$pkg")
  done
  if [ "${#missing[@]}" -eq 0 ]; then
    ok "already installed: $*"
    return 0
  fi
  info "installing: ${missing[*]}"
  if [ -z "${APT_UPDATED:-}" ]; then
    DEBIAN_FRONTEND=noninteractive apt-get update -qq
    APT_UPDATED=1
  fi
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${missing[@]}" >/dev/null
  ok "installed: ${missing[*]}"
}

# ── 0. pre-checks ────────────────────────────────────────────────────────────
step "Pre-checks"
[ "$(id -u)" -eq 0 ] || die "Run as root: sudo bash $0"
if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-}:${VERSION_ID:-}" in
    ubuntu:22.04|ubuntu:24.04) ok "OS: ${PRETTY_NAME:-$ID $VERSION_ID}" ;;
    ubuntu:*) warn "Tested on Ubuntu 22.04/24.04 only; this is ${PRETTY_NAME:-$VERSION_ID}. Continuing." ;;
    *) die "This script is for Ubuntu (found ${PRETTY_NAME:-unknown})." ;;
  esac
else
  die "Cannot read /etc/os-release; is this Ubuntu?"
fi

ADMIN_USER="${ADMIN_USER:-${SUDO_USER:-}}"
if [ -z "$ADMIN_USER" ]; then
  ADMIN_USER="$(logname 2>/dev/null || true)"
fi
ADMIN_USER="${ADMIN_USER:-root}"
id "$ADMIN_USER" >/dev/null 2>&1 || die "ADMIN_USER '$ADMIN_USER' does not exist."
ADMIN_HOME="$(getent passwd "$ADMIN_USER" | cut -d: -f6)"
info "admin user: $ADMIN_USER (home $ADMIN_HOME)"
info "compose folder checked: $CRM_DIR"

[[ "$SSH_PORT" =~ ^[0-9]+$ ]] || die "SSH_PORT must be a number (got '$SSH_PORT')."

# has_keys HOME [unrestricted]: true if HOME/.ssh/authorized_keys has a usable
# key. With "unrestricted", keys limited by command="..." (like the EC2 root
# stub that only prints "Please login as ubuntu") don't count.
KEY_RE='(^|[[:space:]])(ssh-(rsa|ed25519|dss)|ecdsa-sha2-nistp[0-9]+|sk-(ssh-ed25519|ecdsa-sha2-nistp256)@openssh\.com)[[:space:]]+AAAA'
has_keys() {
  local f="$1/.ssh/authorized_keys"
  [ -s "$f" ] || return 1
  if [ "${2:-}" = "unrestricted" ]; then
    grep -Ev '^[[:space:]]*(#|$)' "$f" | grep -v 'command=' | grep -E "$KEY_RE" >/dev/null
  else
    grep -Ev '^[[:space:]]*(#|$)' "$f" | grep -E "$KEY_RE" >/dev/null
  fi
}

# sshd -t / -T need this folder; on Ubuntu 24.04 (socket-activated ssh) it can
# be missing while no SSH session is being set up.
[ -d /run/sshd ] || install -d -m 0755 /run/sshd

# Ports sshd really listens on (sshd -T and live sockets), plus SSH_PORT.
SSH_PORTS="$SSH_PORT"
if command -v sshd >/dev/null 2>&1; then
  for p in $(sshd -T 2>/dev/null | awk '$1=="port"{print $2}'); do SSH_PORTS="$SSH_PORTS $p"; done
fi
for p in $(ss -tlnpH 2>/dev/null | awk '/"sshd"/ {n=split($4,a,":"); print a[n]}'); do SSH_PORTS="$SSH_PORTS $p"; done
# shellcheck disable=SC2086 # word splitting wanted: one port per line
SSH_PORTS="$(printf '%s\n' $SSH_PORTS | sort -un | tr '\n' ' ' | sed 's/ $//')"
ok "SSH port(s) that will stay open: $SSH_PORTS"

# ── 1. automatic security updates ────────────────────────────────────────────
step "1. Automatic security updates (unattended-upgrades)"
apt_install unattended-upgrades
if write_if_changed /etc/apt/apt.conf.d/20auto-upgrades 'APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";'; then
  ok "wrote /etc/apt/apt.conf.d/20auto-upgrades (daily security updates)"
else
  ok "/etc/apt/apt.conf.d/20auto-upgrades already set"
fi
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true
systemctl enable --now apt-daily.timer apt-daily-upgrade.timer >/dev/null 2>&1 || true
ok "unattended-upgrades is $(systemctl is-active unattended-upgrades 2>/dev/null || echo unknown)"
info "Only Ubuntu security updates are installed automatically (Docker's own repo is not), and"
info "the server never reboots by itself. If /var/run/reboot-required exists, reboot when convenient."

# ── 2. firewall (UFW) ────────────────────────────────────────────────────────
step "2. Firewall (UFW): deny incoming except SSH, 80, 443"
apt_install ufw
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
for p in $SSH_PORTS; do
  ufw allow "$p/tcp" comment 'SSH' >/dev/null
  ok "allow $p/tcp (SSH)"
done
ufw allow 80/tcp comment 'HTTP (Lets Encrypt + redirect)' >/dev/null && ok "allow 80/tcp"
ufw allow 443/tcp comment 'HTTPS' >/dev/null && ok "allow 443/tcp"
for p in $EXTRA_PORTS; do
  ufw allow "$p" comment 'EXTRA_PORTS' >/dev/null && ok "allow $p (EXTRA_PORTS)"
done

# Docker publishes container ports through its own iptables rules, which run
# before UFW's, so `ufw deny` alone does NOT protect a port published by a
# container (e.g. "5432:5432"). The ufw-docker approach below adds UFW's checks
# to Docker's DOCKER-USER chain: traffic from the internet to a container is
# dropped unless it is allowed with `ufw route allow`. Traffic between
# containers, from private networks and replies to outgoing connections keep
# working. Source: https://github.com/chaifeng/ufw-docker
if [ "$DOCKER_UFW" = "1" ]; then
  UFW_DOCKER_BLOCK='# BEGIN UFW AND DOCKER (added by deploy/harden-server.sh)
*filter
:ufw-user-forward - [0:0]
:ufw-docker-logging-deny - [0:0]
:DOCKER-USER - [0:0]
-A DOCKER-USER -j ufw-user-forward

-A DOCKER-USER -j RETURN -s 10.0.0.0/8
-A DOCKER-USER -j RETURN -s 172.16.0.0/12
-A DOCKER-USER -j RETURN -s 192.168.0.0/16

-A DOCKER-USER -p udp -m udp --sport 53 --dport 1024:65535 -j RETURN

-A DOCKER-USER -j ufw-docker-logging-deny -p tcp -m tcp --tcp-flags FIN,SYN,RST,ACK SYN -d 192.168.0.0/16
-A DOCKER-USER -j ufw-docker-logging-deny -p tcp -m tcp --tcp-flags FIN,SYN,RST,ACK SYN -d 10.0.0.0/8
-A DOCKER-USER -j ufw-docker-logging-deny -p tcp -m tcp --tcp-flags FIN,SYN,RST,ACK SYN -d 172.16.0.0/12
-A DOCKER-USER -j ufw-docker-logging-deny -p udp -m udp --dport 0:32767 -d 192.168.0.0/16
-A DOCKER-USER -j ufw-docker-logging-deny -p udp -m udp --dport 0:32767 -d 10.0.0.0/8
-A DOCKER-USER -j ufw-docker-logging-deny -p udp -m udp --dport 0:32767 -d 172.16.0.0/12

-A DOCKER-USER -j RETURN

-A ufw-docker-logging-deny -m limit --limit 3/min --limit-burst 10 -j LOG --log-prefix "[UFW DOCKER BLOCK] "
-A ufw-docker-logging-deny -j DROP

COMMIT
# END UFW AND DOCKER'
  [ -f "$UFW_AFTER_RULES" ] || die "$UFW_AFTER_RULES not found (is ufw installed correctly?)"
  current_block="$(sed -n '/^# BEGIN UFW AND DOCKER/,/^# END UFW AND DOCKER/p' "$UFW_AFTER_RULES")"
  if [ "$current_block" = "$UFW_DOCKER_BLOCK" ]; then
    ok "Docker firewall rules already in $UFW_AFTER_RULES"
  else
    cp -a "$UFW_AFTER_RULES" "$UFW_AFTER_RULES.bak-crm-$(date +%Y%m%d%H%M%S)"
    sed -i '/^# BEGIN UFW AND DOCKER/,/^# END UFW AND DOCKER/d' "$UFW_AFTER_RULES"
    printf '\n%s\n' "$UFW_DOCKER_BLOCK" >> "$UFW_AFTER_RULES"
    ok "added Docker firewall rules to $UFW_AFTER_RULES (backup saved next to it)"
  fi
  # Let the internet reach the nginx container on 80/443 (and EXTRA_PORTS).
  ufw route allow proto tcp from any to any port 80 comment 'Docker: nginx HTTP' >/dev/null && ok "route allow 80/tcp to containers"
  ufw route allow proto tcp from any to any port 443 comment 'Docker: nginx HTTPS' >/dev/null && ok "route allow 443/tcp to containers"
  for p in $EXTRA_PORTS; do
    port="${p%%/*}"; proto="${p#*/}"; [ "$proto" = "$p" ] && proto=tcp
    ufw route allow proto "$proto" from any to any port "$port" comment 'EXTRA_PORTS' >/dev/null && ok "route allow $port/$proto to containers"
  done
else
  warn "DOCKER_UFW=0: Docker firewall rules skipped. Ports published by containers bypass UFW."
fi

if ufw status | grep '^Status: active' >/dev/null; then
  ufw reload >/dev/null
  ok "UFW was already active; reloaded"
else
  ufw --force enable >/dev/null
  ok "UFW enabled"
fi
if [ "$DOCKER_UFW" = "1" ] && command -v iptables >/dev/null 2>&1; then
  if iptables -S DOCKER-USER 2>/dev/null | grep ufw-user-forward >/dev/null; then
    ok "DOCKER-USER chain is filtered by UFW"
  else
    warn "DOCKER-USER rules not active yet. Run 'sudo ufw reload' (or reboot) after Docker is running."
  fi
fi

# Report container ports that are published to the whole internet.
step "2b. Checking published Docker ports"
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  exposed=0
  while IFS=$'\t' read -r name ports; do
    [ -n "$ports" ] || continue
    IFS=',' read -ra maps <<< "$ports"
    for m in "${maps[@]}"; do
      m="${m# }"
      case "$m" in
        0.0.0.0:*|'[::]:'*|:::*)
          hostport="${m##*:}"; hostport="${hostport%%-*}"
          case "$hostport" in
            80|443) ;;
            *) warn "container $name publishes $m to the internet (expected 127.0.0.1:...)"; exposed=1 ;;
          esac ;;
      esac
    done
  done < <(docker ps --format '{{.Names}}\t{{.Ports}}')
  [ "$exposed" -eq 0 ] && ok "running containers: only 80/443 are public; everything else is on 127.0.0.1 or not published"
else
  info "Docker is not running (or not installed); skipped the running-container check."
fi

shopt -s nullglob
compose_files=("$CRM_DIR"/docker-compose*.yml "$CRM_DIR"/docker-compose*.yaml "$CRM_DIR"/compose*.yml)
shopt -u nullglob
if [ "${#compose_files[@]}" -gt 0 ]; then
  for f in "${compose_files[@]}"; do
    # Print every entry under a `ports:` key that doesn't bind to 127.0.0.1/::1
    # and isn't 80/443.
    bad="$(awk '
      /^[[:space:]]*#/ {next}
      /^[[:space:]]*ports:[[:space:]]*$/ {inports=1; match($0,/^[[:space:]]*/); ind=RLENGTH; next}
      inports {
        match($0,/^[[:space:]]*/);
        if ($0 ~ /^[[:space:]]*-/ && RLENGTH > ind) {
          v=$0; sub(/^[[:space:]]*-[[:space:]]*/,"",v); gsub(/["\047]/,"",v); sub(/[[:space:]]+#.*/,"",v)
          if (v ~ /^(127\.0\.0\.1|\[::1\]|localhost):/) next
          if (v ~ /^(0\.0\.0\.0:)?(80|443):(80|443)(\/tcp)?$/) next
          print "      line " NR ": " v
          next
        }
        if ($0 !~ /^[[:space:]]*$/) inports=0
      }' "$f")"
    if [ -n "$bad" ]; then
      case "$f" in
        *dev*) info "$(basename "$f") (local development only) publishes ports on all interfaces:"; printf '%s\n' "$bad"
               info "  never run the dev compose file on the internet-facing server." ;;
        *) warn "$(basename "$f") publishes ports on all interfaces:"; printf '%s\n' "$bad" ;;
      esac
    else
      ok "$(basename "$f"): no internal ports published to the internet"
    fi
  done
else
  info "no docker-compose*.yml found in $CRM_DIR; skipped the compose check."
fi

# ── 3. fail2ban ──────────────────────────────────────────────────────────────
step "3. fail2ban (bans IPs that keep failing SSH logins)"
apt_install fail2ban python3-systemd
IGNORE_IP="127.0.0.1/8 ::1"
CLIENT_IP="${SSH_CLIENT:-}"; CLIENT_IP="${CLIENT_IP%% *}"
if [ -z "$CLIENT_IP" ]; then
  CLIENT_IP="$(who -m 2>/dev/null | sed -n 's/.*(\([0-9a-fA-F.:]*\)).*/\1/p' | sed -n 1p || true)"
fi
if [ -n "$CLIENT_IP" ]; then
  IGNORE_IP="$IGNORE_IP $CLIENT_IP"
  info "your current IP $CLIENT_IP is never banned (ignoreip)"
fi
F2B_CONTENT="# Managed by deploy/harden-server.sh. Re-running the script rewrites this file.
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
ignoreip = $IGNORE_IP

[sshd]
enabled  = true
port     = $(echo "$SSH_PORTS" | tr ' ' ',')
backend  = systemd
maxretry = 5"
if write_if_changed "$F2B_JAIL" "$F2B_CONTENT"; then
  ok "wrote $F2B_JAIL"
  F2B_CHANGED=1
else
  ok "$F2B_JAIL already up to date"
fi
systemctl enable fail2ban >/dev/null 2>&1 || true
if fail2ban-client -t >/dev/null 2>&1 || fail2ban-client -d >/dev/null 2>&1; then
  if [ -n "${F2B_CHANGED:-}" ] || ! systemctl is-active --quiet fail2ban; then
    systemctl restart fail2ban
  fi
  ok "fail2ban is $(systemctl is-active fail2ban)"
  sleep 2
  if fail2ban-client status sshd >/dev/null 2>&1; then
    ok "sshd jail is running"
  else
    warn "fail2ban sshd jail is not running; check 'sudo journalctl -u fail2ban -n 50'"
  fi
else
  warn "fail2ban config test failed; check 'sudo fail2ban-client -d'"
fi
info "No nginx jail: nginx runs in a container and logs to 'docker logs', not to a host file,"
info "and host bans don't apply to Docker-forwarded traffic anyway. Sign-in brute force is limited"
info "by nginx (limit_req on /api/auth/*) and by the backend's own rate limits instead."

# ── 4. SSH hardening ─────────────────────────────────────────────────────────
step "4. SSH hardening ($SSHD_DROPIN)"
command -v sshd >/dev/null 2>&1 || die "sshd not found (openssh-server not installed?)"
if ! grep -Eqi '^[[:space:]]*Include[[:space:]]+/etc/ssh/sshd_config\.d/\*\.conf' /etc/ssh/sshd_config; then
  warn "/etc/ssh/sshd_config has no 'Include /etc/ssh/sshd_config.d/*.conf'; the drop-in may be ignored (checked below)."
fi

SSHD_LINES=("MaxAuthTries 3" "X11Forwarding no" "PermitEmptyPasswords no" "LoginGraceTime 30")

# Root login: 'no' only when there is a separate sudo admin account to log in
# with. If root has its own real SSH key (some VPS deploys log in as root),
# keep key-only root login so that keeps working. PERMIT_ROOT_LOGIN overrides.
in_sudo_group() { id -nG "$1" 2>/dev/null | tr ' ' '\n' | grep -Ex 'sudo|admin|wheel' >/dev/null; }
if [ -n "${PERMIT_ROOT_LOGIN:-}" ]; then
  case "$PERMIT_ROOT_LOGIN" in no|prohibit-password) ;; *) die "PERMIT_ROOT_LOGIN must be 'no' or 'prohibit-password'";; esac
  SSHD_LINES+=("PermitRootLogin $PERMIT_ROOT_LOGIN")
  ok "root login: $PERMIT_ROOT_LOGIN (PERMIT_ROOT_LOGIN)"
elif [ "$ADMIN_USER" != "root" ] && in_sudo_group "$ADMIN_USER" && ! has_keys /root unrestricted; then
  SSHD_LINES+=("PermitRootLogin no")
  ok "root login: disabled (you log in as $ADMIN_USER and use sudo)"
elif has_keys /root unrestricted; then
  SSHD_LINES+=("PermitRootLogin prohibit-password")
  ok "root login: key only (prohibit-password); root has its own SSH key, which may be used by deploys"
  info "if nothing logs in as root, re-run with PERMIT_ROOT_LOGIN=no"
elif [ "$ADMIN_USER" != "root" ]; then
  SSHD_LINES+=("PermitRootLogin no")
  ok "root login: disabled"
  [ "$(id -u "$ADMIN_USER")" -ne 0 ] && ! in_sudo_group "$ADMIN_USER" && warn "$ADMIN_USER is not in the sudo group; make sure it can still become root (sudo -v)"
elif has_keys /root; then
  SSHD_LINES+=("PermitRootLogin prohibit-password")
  ok "root login: key only (prohibit-password); $ADMIN_USER is root or not in the sudo group"
else
  warn "root login left unchanged: you seem to log in as root with a password. Create a sudo user with an SSH key, then re-run."
fi

# Password login: off only if the admin account already has an SSH key.
if has_keys "$ADMIN_HOME"; then
  SSHD_LINES+=("PasswordAuthentication no" "KbdInteractiveAuthentication no")
  ok "password login: disabled ($ADMIN_HOME/.ssh/authorized_keys has a key)"
else
  warn "password login left ON: $ADMIN_HOME/.ssh/authorized_keys has no SSH key, so turning passwords off would lock '$ADMIN_USER' out. Add a key (ssh-copy-id), test it, then re-run."
fi

SSHD_CONTENT="# Managed by deploy/harden-server.sh (see docs/server-security.md).
# Named 01-... because sshd uses the FIRST value it reads, and files in this
# folder are read in name order (so this beats e.g. 50-cloud-init.conf).
$(printf '%s\n' "${SSHD_LINES[@]}")"

SSHD_BACKUP=""
if [ -f "$SSHD_DROPIN" ]; then
  SSHD_BACKUP="$(mktemp)"
  cp -a "$SSHD_DROPIN" "$SSHD_BACKUP"
fi
if write_if_changed "$SSHD_DROPIN" "$SSHD_CONTENT"; then
  chmod 644 "$SSHD_DROPIN"
  if sshd -t; then
    ok "sshd -t: config is valid"
    if systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null; then
      ok "sshd reloaded (your current session stays open)"
    else
      info "sshd service not running as a daemon (socket activation); new logins pick up the config."
    fi
    note "SSH settings changed. KEEP THIS SESSION OPEN and test a new login in a second terminal: ssh $ADMIN_USER@<server>"
  else
    warn "sshd -t failed; restoring the previous SSH settings."
    if [ -n "$SSHD_BACKUP" ]; then cp -a "$SSHD_BACKUP" "$SSHD_DROPIN"; else rm -f "$SSHD_DROPIN"; fi
    sshd -t || true
  fi
else
  ok "$SSHD_DROPIN already up to date"
fi
[ -n "$SSHD_BACKUP" ] && rm -f "$SSHD_BACKUP"

SSHD_EFFECTIVE="$(sshd -T 2>/dev/null || true)"
info "effective SSH settings (sshd -T):"
printf '%s\n' "$SSHD_EFFECTIVE" | grep -Ei '^(port|permitrootlogin|passwordauthentication|kbdinteractiveauthentication|maxauthtries|x11forwarding) ' | sed 's/^/      /' || true
for line in "${SSHD_LINES[@]}"; do
  key="$(echo "${line%% *}" | tr '[:upper:]' '[:lower:]')"; want="${line#* }"
  [ "$want" = "prohibit-password" ] && want="without-password" # sshd -T prints the old name
  have="$(awk -v k="$key" '$1==k && !f {print $2; f=1}' <<< "$SSHD_EFFECTIVE")"
  if [ -n "$have" ] && [ "$have" != "$want" ]; then
    warn "sshd: $key is '$have', not '$want'. Another file in /etc/ssh/sshd_config or sshd_config.d sets it earlier."
  fi
done

# ── 5. kernel / network settings ─────────────────────────────────────────────
step "5. Kernel and network settings ($SYSCTL_DROPIN)"
SYSCTL_CONTENT="# Managed by deploy/harden-server.sh
# SYN flood protection
net.ipv4.tcp_syncookies = 1
# Drop packets with spoofed source addresses (2 = loose mode, safe with Docker)
net.ipv4.conf.all.rp_filter = 2
net.ipv4.conf.default.rp_filter = 2
# Ignore ICMP redirects and source-routed packets; don't send redirects
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.secure_redirects = 0
net.ipv4.conf.default.secure_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_source_route = 0
net.ipv6.conf.default.accept_source_route = 0
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.icmp_ignore_bogus_error_responses = 1
# Docker needs packet forwarding between containers and the internet: keep it ON
net.ipv4.ip_forward = 1
# Hide kernel pointers / logs from non-root users
kernel.kptr_restrict = 2
kernel.dmesg_restrict = 1
fs.protected_hardlinks = 1
fs.protected_symlinks = 1
# Use swap only when RAM is really short
vm.swappiness = 10"
if write_if_changed "$SYSCTL_DROPIN" "$SYSCTL_CONTENT"; then
  ok "wrote $SYSCTL_DROPIN"
else
  ok "$SYSCTL_DROPIN already up to date"
fi
# -e: skip keys this kernel doesn't have (e.g. IPv6 switched off)
if sysctl -e -q -p "$SYSCTL_DROPIN" >/dev/null; then
  ok "applied (ip_forward = $(sysctl -n net.ipv4.ip_forward))"
else
  warn "some sysctl settings could not be applied (see: sudo sysctl -p $SYSCTL_DROPIN)"
fi

# ── 6. swap ──────────────────────────────────────────────────────────────────
step "6. Swap"
mem_kb="$(awk '/^MemTotal:/{print $2}' /proc/meminfo)"
mem_mb=$((mem_kb / 1024))
if [ -n "$(swapon --noheadings --show 2>/dev/null)" ]; then
  ok "swap already on: $(swapon --noheadings --show=NAME,SIZE | tr '\n' ' ')"
elif [ "$SWAP_SIZE" = "0" ]; then
  info "SWAP_SIZE=0; skipped"
elif [ "$mem_mb" -ge 3900 ]; then
  ok "RAM is ${mem_mb} MB (>= 4 GB); no swap needed"
elif [ -e /swapfile ]; then
  warn "/swapfile exists but is not active; not touching it (check: sudo swapon /swapfile)"
else
  free_mb="$(df -Pm / | awk 'NR==2{print $4}')"
  if [ "$free_mb" -lt 4096 ]; then
    warn "only ${free_mb} MB free on /; skipped creating a $SWAP_SIZE swap file"
  else
    info "RAM is ${mem_mb} MB and there is no swap: creating /swapfile ($SWAP_SIZE)"
    fallocate -l "$SWAP_SIZE" /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count="$(numfmt --from=iec "$SWAP_SIZE" | awk '{print int($1/1048576)}')" status=none
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    ok "swap on: /swapfile ($SWAP_SIZE), kept after reboot"
  fi
fi

# ── 7. Docker housekeeping ───────────────────────────────────────────────────
step "7. Docker housekeeping (daily prune, log size limits)"
PRUNE_CONTENT='# Managed by deploy/harden-server.sh: daily clean-up of stopped containers,
# unused networks, dangling images and build cache. Volumes (database, uploads)
# are NEVER removed (no --volumes).
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
30 4 * * * root command -v docker >/dev/null 2>&1 && docker system prune -f >/var/log/crm-docker-prune.log 2>&1'
if write_if_changed "$PRUNE_CRON" "$PRUNE_CONTENT"; then
  chmod 644 "$PRUNE_CRON"
  ok "wrote $PRUNE_CRON (04:30 every day, log: /var/log/crm-docker-prune.log)"
else
  ok "$PRUNE_CRON already up to date"
fi

# Limit container log files to 3 x 10 MB each (they otherwise grow forever).
# Merges into an existing daemon.json and keeps every other setting.
mkdir -p /etc/docker
daemon_result="$(python3 - "$DOCKER_DAEMON_JSON" <<'PY'
import json, os, sys, shutil, time
path = sys.argv[1]
data = {}
if os.path.exists(path) and os.path.getsize(path) > 0:
    try:
        with open(path) as f:
            data = json.load(f)
    except ValueError as e:
        print("invalid:%s" % e); sys.exit(0)
if not isinstance(data, dict):
    print("invalid:top level is not an object"); sys.exit(0)
driver = data.get("log-driver", "json-file")
if driver not in ("json-file", "local"):
    print("otherdriver:%s" % driver); sys.exit(0)
before = json.dumps(data, sort_keys=True)
data.setdefault("log-driver", "json-file")
opts = data.setdefault("log-opts", {})
opts.setdefault("max-size", "10m")
opts.setdefault("max-file", "3")
if json.dumps(data, sort_keys=True) == before:
    print("unchanged"); sys.exit(0)
if os.path.exists(path):
    shutil.copy2(path, path + ".bak-crm-" + time.strftime("%Y%m%d%H%M%S"))
tmp = path + ".tmp"
with open(tmp, "w") as f:
    json.dump(data, f, indent=2); f.write("\n")
os.replace(tmp, path)
print("changed")
PY
)"
case "$daemon_result" in
  unchanged) ok "$DOCKER_DAEMON_JSON already limits log size" ;;
  changed)
    ok "updated $DOCKER_DAEMON_JSON: log-driver json-file, max-size 10m, max-file 3 (backup saved next to it)"
    if command -v dockerd >/dev/null 2>&1 && dockerd --help 2>/dev/null | grep -- '--validate' >/dev/null; then
      if dockerd --validate --config-file "$DOCKER_DAEMON_JSON" >/dev/null 2>&1; then ok "dockerd --validate: OK"; else warn "dockerd --validate rejected $DOCKER_DAEMON_JSON; fix it before restarting Docker"; fi
    fi
    note "Docker was NOT restarted. The log limits apply after: sudo systemctl restart docker (the CRM is down ~1 minute; containers come back by themselves), and only to containers created after that: cd $CRM_DIR && sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --force-recreate" ;;
  otherdriver:*) ok "Docker uses log driver '${daemon_result#otherdriver:}'; left as is" ;;
  invalid:*) warn "$DOCKER_DAEMON_JSON is not valid JSON (${daemon_result#invalid:}); not changed. Fix it by hand." ;;
  *) warn "could not update $DOCKER_DAEMON_JSON ($daemon_result)" ;;
esac

# ── 8. summary ───────────────────────────────────────────────────────────────
step "Summary"
info "Listening TCP ports (ss -tlnp):"
ss -tlnp | sed 's/^/      /'
public_listen="$(ss -tlnH | awk '$4 !~ /^(127\.|\[::1\]|::1)/ {n=split($4,a,":"); print a[n]}' | sort -un | tr '\n' ' ')"
for p in $public_listen; do
  case " $SSH_PORTS 80 443 $EXTRA_PORTS " in
    *" $p "*|*" $p/tcp "*) ;;
    *) case "$p" in 53) ;; *) info "port $p listens on a public address: blocked by UFW unless allowed above (check what it is)";; esac ;;
  esac
done
echo
info "UFW:"
ufw status verbose | sed 's/^/      /'
echo
info "fail2ban:"
fail2ban-client status 2>/dev/null | sed 's/^/      /' || info "  fail2ban not responding"
fail2ban-client status sshd 2>/dev/null | sed 's/^/      /' || true
echo
info "automatic updates: $(systemctl is-enabled unattended-upgrades 2>/dev/null || echo unknown)"
[ -f /var/run/reboot-required ] && info "a reboot is pending for earlier updates (sudo reboot when convenient)"

if [ "${#NOTES[@]}" -gt 0 ]; then
  echo
  printf '%sTo do:%s\n' "$B" "$N"
  for n in "${NOTES[@]}"; do printf '  - %s\n' "$n"; done
fi
if [ "${#WARNINGS[@]}" -gt 0 ]; then
  echo
  printf '%sWarnings:%s\n' "$Y" "$N"
  for w in "${WARNINGS[@]}"; do printf '  - %s\n' "$w"; done
fi
echo
echo "Done. Safe to run again at any time."
