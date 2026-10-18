# Securing the CRM server

This guide is for the person who looks after the server (AWS EC2 or the older
VPS). It explains, in plain words, what `deploy/harden-server.sh` does, how to
run it, how to check it worked, and how to get back in if something goes
wrong. You don't need to be a Linux expert to follow it.

The script works on Ubuntu 22.04 and 24.04. You can run it as often as you
like: if something is already set up, it leaves it alone.

## What the script does

| Step | What it means for you |
|---|---|
| **Automatic security updates** | Ubuntu installs security fixes by itself every day. It never reboots the server on its own. Docker is not upgraded automatically, so containers are not restarted by surprise. |
| **Firewall (UFW)** | Blocks everything coming in except SSH (22), HTTP (80) and HTTPS (443). Outgoing traffic (emails, Google, Exotel, AI) still works. |
| **Docker firewall fix** | Docker normally slips past UFW: a container port like `5432:5432` would be open to the whole internet even with UFW on. The script adds the well-known [ufw-docker](https://github.com/chaifeng/ufw-docker) rules so that from the internet only the nginx container on 80/443 can be reached. It also lists any container or compose file that publishes a port publicly. |
| **fail2ban** | If an address gets the SSH login wrong 5 times in 10 minutes, it is blocked for 1 hour. Your own current address is never blocked. |
| **SSH hardening** | Turns off password logins (keys only), stops direct `root` logins, allows only 3 tries per connection and turns off X11. **Password login is only turned off if your account already has an SSH key.** Otherwise it is left on and the script tells you why. The settings are checked (`sshd -t`) before they are used. |
| **Kernel/network settings** | Standard protections against spoofed and redirected network packets and SYN floods. Packet forwarding stays on because Docker needs it. |
| **Swap** | If the server has less than 4 GB RAM and no swap, it adds a 2 GB swap file so builds and the AI model don't run out of memory. |
| **Docker clean-up** | Every night at 04:30 it removes stopped containers, unused networks, dangling images and build cache (`docker system prune -f`). **It never deletes volumes**, so the database and uploads are safe. |
| **Docker log limits** | Container logs are capped at 3 x 10 MB per container so they can't fill the disk (`/etc/docker/daemon.json`). Docker is **not** restarted for you (see "After running it"). |
| **Summary** | At the end it prints the open ports, the firewall rules and fail2ban status, followed by a "To do" list and any warnings. |

Files it creates or changes (each change is easy to undo, see below):

```
/etc/apt/apt.conf.d/20auto-upgrades
/etc/ufw/after.rules                        (block between "BEGIN/END UFW AND DOCKER"; backup saved next to it)
/etc/fail2ban/jail.d/crm.local
/etc/ssh/sshd_config.d/01-crm-hardening.conf
/etc/sysctl.d/99-crm-hardening.conf
/etc/cron.d/crm-docker-prune
/etc/docker/daemon.json                     (merged, backup saved next to it)
/swapfile + a line in /etc/fstab            (only if swap was added)
```

The SSH file is named `01-...` on purpose. SSH uses the **first** value it
finds, and files in that folder are read in name order. A later name (like
`99-...`) would lose to files such as `50-cloud-init.conf`, which on some
servers says `PasswordAuthentication yes`.

## Before you run it (5 minutes, important)

1. **Make sure you log in with an SSH key, not a password.** On your own
   computer:
   ```bash
   ssh -i your-key.pem ubuntu@<server-ip>
   ```
   If that logs you in without asking for a password, you're fine. On AWS this
   is normal (the `.pem` file from the key pair). On the old VPS, if you use a
   password today, add a key first. From your computer:
   ```bash
   ssh-keygen -t ed25519            # once, if you don't have a key yet
   ssh-copy-id user@<server-ip>     # copies your key to the server
   ssh user@<server-ip>             # must now log in without a password
   ```
2. **Set a password for your user** (it is not used for SSH, only for the
   emergency serial console below): `sudo passwd ubuntu`.
3. **Know your way back in** if you get locked out (see
   [Locked out?](#locked-out-how-to-get-back-in)). On AWS, check that the EC2
   Serial Console is enabled: EC2 > Settings > EC2 Serial Console > Allow.
4. If the SSH port is not 22, tell the script: `sudo SSH_PORT=2222 bash ...`.
   (The script also detects the port SSH really uses and keeps it open.)

## How to run it

On the server, from the CRM folder:

```bash
cd /var/www/crm
git pull
sudo bash deploy/harden-server.sh
```

Or copy just the script from your computer:

```bash
scp -i your-key.pem deploy/harden-server.sh ubuntu@<server-ip>:~
ssh -i your-key.pem ubuntu@<server-ip>
sudo bash ~/harden-server.sh
```

It takes a minute or two. Read the **To do** and **Warnings** lists at the end.

Optional settings go in front of `bash`, for example
`sudo SSH_PORT=2222 SWAP_SIZE=4G bash deploy/harden-server.sh`:

| Setting | Default | Use |
|---|---|---|
| `SSH_PORT` | 22 | Extra SSH port to keep open |
| `ADMIN_USER` | the user who ran `sudo` | The account you log in with |
| `EXTRA_PORTS` | none | More ports to open to the internet, e.g. `"8443/tcp"` |
| `PERMIT_ROOT_LOGIN` | automatic | `no` or `prohibit-password` (key-only root) |
| `DOCKER_UFW` | 1 | `0` skips the Docker firewall rules |
| `SWAP_SIZE` | 2G | Size of the swap file (`0` = never add one) |

About root login: the script turns it off completely (`no`) when you log in
with your own sudo account. If `root` has its own SSH key (some VPS deploys log
in as root), it allows root **with a key only** so those deploys keep working.
Add `PERMIT_ROOT_LOGIN=no` if nothing logs in as root.

## After running it

1. **Keep your current SSH window open.** Open a second terminal and log in
   again (`ssh -i your-key.pem ubuntu@<server-ip>`). If that works, you can
   close the first one. If it doesn't, use the first window to undo the SSH
   change (see below).
2. Open the CRM in a browser (https://crm.eleviq.buzz) and sign in.
3. Turn on the Docker log limits when a minute of downtime is OK (at night,
   for example):
   ```bash
   sudo systemctl restart docker
   cd /var/www/crm
   sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --force-recreate
   ```
   The containers come back by themselves after the restart. The second
   command applies the new log limits to them.

## Checking that everything is on

```bash
sudo ufw status verbose                 # firewall: 22, 80, 443 allowed, rest denied
sudo fail2ban-client status sshd        # who is currently blocked
sudo ss -tlnp                           # what is listening (5432/6379/11434 must not be on 0.0.0.0)
sudo sshd -T | grep -Ei 'passwordauth|permitroot|maxauth'
systemctl status unattended-upgrades    # automatic updates running
ls /var/run/reboot-required 2>/dev/null && echo "reboot when convenient"
sudo docker ps --format '{{.Names}}  {{.Ports}}'   # only nginx should show 0.0.0.0:80/443
```

From your own computer you can also check that the database isn't reachable
(this should time out): `nc -vz -w 5 <server-ip> 5432`.

Running the script again prints the same checks.

## AWS security group (the cloud firewall)

The security group is a second firewall in front of the server, managed in the
AWS console: EC2 > Instances > your instance > Security > Security groups >
Edit inbound rules.

| Type | Port | Source | Why |
|---|---|---|---|
| SSH | 22 | **My IP** (your office/home address) | Admin logins |
| HTTP | 80 | Anywhere (0.0.0.0/0 and ::/0) | HTTPS certificates and redirect |
| HTTPS | 443 | Anywhere (0.0.0.0/0 and ::/0) | The CRM |

Do **not** add 3000, 5000, 5432, 6379 or 11434.

About SSH from "My IP" only: the automatic deploy from GitHub
(`.github/workflows/deploy-aws.yml`) connects over SSH from GitHub's servers,
whose addresses change all the time. So you have two choices:

- **Most secure:** SSH only from your IP, and deploy by hand (`git pull` +
  `docker compose ... up -d --build`), or run the deploy from a fixed address.
- **Keeps auto-deploy working:** SSH from anywhere. This is acceptable
  **only** after this script has turned password login off (keys only) and
  fail2ban is on.

If your home/office IP changes, update the rule ("My IP" button) or you won't
be able to SSH in. You can still use the browser console (below).

On the old VPS, use the provider's firewall panel the same way if it has one.

## Locked out? How to get back in

Nothing the script does touches the CRM data. Being locked out only affects
SSH, and there are ways in that don't use SSH.

**AWS:**

1. **EC2 Serial Console** (works even with a broken SSH or firewall): EC2 >
   Instances > select the instance > Connect > EC2 serial console > Connect.
   Log in as `ubuntu` with the password you set with `sudo passwd ubuntu`.
2. **EC2 Instance Connect** (Connect > EC2 Instance Connect) works if port 22
   is open to AWS and SSH itself is fine (for example you lost your key).
3. **Last resort:** stop the instance, detach its disk (EBS volume), attach it
   to a temporary instance, delete
   `/etc/ssh/sshd_config.d/01-crm-hardening.conf` on it, then put the disk
   back and start the instance. Before stopping, attach an Elastic IP so the
   address doesn't change.

**Old VPS:** use the provider's web console (often called "VNC console",
"Console" or "Rescue mode") in their control panel.

Once you have a shell, these commands undo each part:

```bash
# SSH back to how it was (passwords and root allowed again per the main config)
sudo rm /etc/ssh/sshd_config.d/01-crm-hardening.conf && sudo systemctl reload ssh

# Firewall off (Docker rules stay in the file but do nothing while UFW is off)
sudo ufw disable
# ...and remove the Docker block for good: restore the backup made by the script
ls /etc/ufw/after.rules.bak-crm-*          # pick the oldest, then:
sudo cp /etc/ufw/after.rules.bak-crm-<date> /etc/ufw/after.rules

# Unblock an address banned by fail2ban
sudo fail2ban-client set sshd unbanip <ip-address>

# Kernel settings
sudo rm /etc/sysctl.d/99-crm-hardening.conf && sudo sysctl --system

# Docker log limits (then restart docker when convenient)
ls /etc/docker/daemon.json.bak-crm-*       # restore the backup, or delete daemon.json if there was none

# Nightly Docker clean-up
sudo rm /etc/cron.d/crm-docker-prune
```

## Rotating secrets in `.env`

The secrets live in `/var/www/crm/.env`. Keep that file private:
`sudo chmod 600 /var/www/crm/.env`. Never commit it or paste it into chat.
Make new secrets with `openssl rand -hex 48`.

Change them if they may have leaked, when someone with access leaves, or if
you are still using any value that was ever written in the code. (Older
versions of `docker-compose.yml`, still on the `master` branch used by the old
VPS, had a fallback JWT secret, database password and admin password written
in them. If your `.env` doesn't set its own values, the server uses those, and
anyone who has seen the code knows them.)

After any `.env` change, apply it with:

```bash
cd /var/www/crm
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

(Use only `-f docker-compose.yml` on the old VPS, as its deploy does.)

**JWT_SECRET** (signs login sessions)
: Put the new value in `.env` and apply. **Everyone is signed out** and has to
  log in again. Nothing else breaks, except the next point.

**SETTINGS_ENCRYPTION_KEY** (encrypts provider secrets saved in Settings, such as Vi calling passwords)
: When it's empty, the CRM uses `JWT_SECRET` for this. So changing
  `JWT_SECRET` (or setting this key for the first time) means those saved
  provider secrets can't be read any more and must be **typed in again** in
  Settings. Tip: set both at the same time, so you re-enter them once. After
  that you can rotate `JWT_SECRET` on its own.

**DB_PASSWORD** (Postgres)
: Postgres keeps its own copy of the password, so change it there **first**,
  then in `.env`. Otherwise the backend can't connect.
  ```bash
  NEW=$(openssl rand -hex 24)
  sudo docker exec -it crm_postgres psql -U postgres -c "ALTER USER postgres PASSWORD '$NEW';"
  echo "$NEW"        # copy this into DB_PASSWORD= in .env, then apply as above
  ```
  Use the hex value as-is (no quotes or special characters needed).

**SUPER_ADMIN_PASSWORD**
: Also change the admin password inside the CRM (profile / change password),
  not only in `.env`.

**Third-party keys** (Google, Meta, Exotel, email app password, Anthropic)
: Create a new key in that provider's dashboard, put it in `.env`, apply,
  then delete the old key at the provider.

## Backups (don't skip this)

Security also means being able to recover. At minimum:

- **AWS:** daily EBS snapshots (AWS Backup or Data Lifecycle Manager, keep 7),
  plus a daily database dump to S3. See
  [deploy-aws.md, section 8](./deploy-aws.md#8-backups-and-monitoring).
- **Any server:** a daily database dump copied **off** the server:
  ```bash
  sudo docker exec crm_postgres pg_dump -U postgres crm_db | gzip > crm_$(date +%F).sql.gz
  ```
  Also back up the uploads and call recordings (the `backend_uploads` volume)
  and a copy of `.env` kept somewhere safe (a password manager).
- Every few months, **try a restore** on a spare server. A backup you've
  never restored isn't a backup yet.

## What else protects the CRM

These are already in the code and need no action:

- Postgres, Redis and Ollama aren't published at all. The backend (5000) and
  frontend (3000) are bound to `127.0.0.1`, so only nginx on the same server
  can reach them.
- nginx (`nginx/templates/crm.conf.template`) serves HTTPS only (TLS 1.2/1.3)
  and sends HSTS, `X-Content-Type-Options`, `X-Frame-Options` and
  `frame-ancestors` (clickjacking), `Referrer-Policy`, and hides its version.
  Uploads are capped at 15 MB. Sign-in, sign-up and password-reset requests
  are limited per address (a burst of 20, then 30 per minute; after that "Too
  many attempts").
- The backend has its own stricter limits on login and password-reset
  attempts.

The old VPS uses its own, separate nginx container, so check that its config
has the same headers.
