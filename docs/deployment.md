# Deploying the CRM to a cloud server

Before going live, work through the [production checklist](production-checklist.md).

The CRM runs as Docker containers: PostgreSQL, Redis, Ollama (free local AI),
the Express backend and the Next.js frontend. Any Linux cloud VM works (AWS
EC2, Google Compute Engine, Azure VM, DigitalOcean Droplet, Hetzner, a VPS).
Production domain: **crm.shreemahalaxmirealty.in**.

Deploying on AWS? Follow [deploy-aws.md](./deploy-aws.md) for the EC2-specific steps.

## What you need

- A Linux server with at least 2 vCPU and 4 GB RAM (Ollama uses ~2 GB; set
  `AI_PROVIDER`/`ANTHROPIC_API_KEY` and drop Ollama if the box is smaller).
- Docker Engine with the Compose plugin.
- A DNS `A` record for `crm.shreemahalaxmirealty.in` pointing at the server.
- Ports 80 and 443 open in the cloud firewall / security group. Keep 3000,
  5000, 5432 and 6379 closed: Compose binds them to 127.0.0.1 only.

## First deploy on a fresh server

```bash
git clone https://github.com/vaibhavpetkar/CRM.git /var/www/crm
cd /var/www/crm
cp .env.example .env        # then fill in DB_PASSWORD, JWT_SECRET, SUPER_ADMIN_PASSWORD
```

Get the HTTPS certificate once (nothing may be listening on port 80 yet):

```bash
sudo apt install -y certbot
sudo certbot certonly --standalone -d crm.shreemahalaxmirealty.in
sudo mkdir -p /var/www/certbot
```

Start everything, then apply database migrations:

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
sudo docker compose exec -T backend npm run migrate
```

On a brand-new database the backend creates the tables on its first start,
which is why migrations run after `up`.

Open https://crm.shreemahalaxmirealty.in and sign in with `SUPER_ADMIN_EMAIL` /
`SUPER_ADMIN_PASSWORD` and company code `my-company` (rename the company in
Settings > Company).

Certificate renewal (add to root's crontab):

```bash
0 3 * * * certbot renew --webroot -w /var/www/certbot --quiet && docker exec crm_nginx nginx -s reload
```

Then secure the server (firewall, SSH keys only, fail2ban, automatic
security updates) with `sudo bash deploy/harden-server.sh`. See
[server-security.md](./server-security.md).

## Updating

```bash
cd /var/www/crm
git pull
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --remove-orphans
sudo docker compose exec -T backend npm run migrate
sudo docker image prune -f
```

## The existing VPS pipeline

`.github/workflows/deploy.yml` deploys `master` to the current VPS on every
push. That server already has its own nginx container on ports 80/443, so the
workflow runs `docker compose up` with `docker-compose.yml` only and does not
use `docker-compose.prod.yml`.

`docker-compose.yml` no longer carries built-in fallback secrets. The
server's `.env` must set `DB_PASSWORD`, `JWT_SECRET` and
`SUPER_ADMIN_PASSWORD`; if one is missing, Compose stops with
"required variable ... is missing" before touching the running containers.

## Environment variables

| File | Used by |
|---|---|
| `.env.example` (repo root) | Docker Compose, all services |
| `backend/.env.production.example` | Running the backend without Docker (PM2) |
| `frontend/.env.production.example` | Building the frontend without Docker |

`NEXT_PUBLIC_*` values are compiled into the frontend, so changing them needs a
rebuild (`up --build`), not just a restart.

Extra browser origins that may call the API (for example a marketing site) go
in `CORS_ORIGINS`, comma-separated. In production only `CLIENT_URL` and those
origins are accepted; localhost is allowed only outside production.

## Health and logs

```bash
sudo docker compose ps                 # backend shows (healthy) once /api/health answers
sudo docker compose logs -f backend
curl -s https://crm.shreemahalaxmirealty.in/api/health
```

## Backups and restore

### From the app (super admin)

Sign in as the super admin and open **Settings > Backups**
(`/settings/backups`). Nobody else can see or call it, not even a company
Administrator.

- **Back up now** saves the whole database (every company) with
  `pg_dump -Fc`, plus a `.tar.gz` of the uploads folder (attachments, PDFs,
  call recordings). Files are named with the UTC time, e.g.
  `crm-manual-20261017-023000Z.dump` and
  `crm-manual-20261017-023000Z.uploads.tar.gz`.
- **Download** saves a copy to your computer. Keep copies off the server too:
  the backups live in the `backups_data` Docker volume on the same machine.
- **Restore** replaces all current data with the chosen backup. You must type
  `RESTORE`. A safety backup (`crm-pre-restore-…`) of the current data is
  always taken first, so a wrong restore can be undone by restoring that one.
  Tick "Also restore uploaded files" to unpack the uploads archive too.
- **Upload a backup and restore** takes a `.dump` file (up to 2 GB), keeps it
  as `crm-uploaded-…` and restores it the same way.

The restore runs `pg_restore --clean --if-exists --no-owner --single-transaction`:
if anything fails, nothing is changed. After a restore, users may need to
sign in again.

Settings (in `.env`):

| Variable | Default | Meaning |
|---|---|---|
| `BACKUP_KEEP` | `30` | Newest backups kept; older ones are deleted after each new backup. `0` keeps all. |
| `BACKUP_DAILY_AT` | blank (off) | `HH:MM` in IST, e.g. `02:30`, for a daily automatic backup (`crm-auto-…`). |

The backend image includes the PostgreSQL 15 client tools (`pg_dump`,
`pg_restore`); the Backups page shows the installed version. nginx allows
large uploads and long timeouts only on `/api/admin/backups`
(`nginx/templates/crm.conf.template`, `nginx/crm.shreemahalaxmirealty.in.conf`). If your
server uses a different nginx config, add the same `location` block there.
The backend accepts an upload for at most 5 minutes (Node's request
timeout); for a very large file over a slow link, copy it onto the server
and use the command line below or put it in the backups volume and restore
it from the list.

### From the command line

Backups are in the `backups_data` volume, mounted at `/usr/src/app/backups` in
the backend container.

```bash
# Take a backup (same format as Back up now). The single quotes make the
# container's own DB_* variables fill in, so no password is typed here.
sudo docker exec crm_backend sh -c 'PGPASSWORD="$DB_PASSWORD" pg_dump -Fc -h "$DB_HOST" -U "$DB_USERNAME" -d "$DB_NAME" \
  -f /usr/src/app/backups/crm-manual-$(date -u +%Y%m%d-%H%M%SZ).dump'

# Uploaded files
sudo docker exec crm_backend tar -czf /usr/src/app/backups/uploads-$(date -u +%F).tar.gz -C /usr/src/app/uploads .

# List and copy backups to this machine
sudo docker exec crm_backend ls -lh /usr/src/app/backups
sudo docker cp crm_backend:/usr/src/app/backups/crm-manual-20261017-023000Z.dump .

# Restore a .dump (replaces all data; take a backup first)
sudo docker cp crm-manual-20261017-023000Z.dump crm_backend:/usr/src/app/backups/
sudo docker exec crm_backend sh -c 'PGPASSWORD="$DB_PASSWORD" pg_restore --clean --if-exists --no-owner \
  --single-transaction -h "$DB_HOST" -U "$DB_USERNAME" -d "$DB_NAME" /usr/src/app/backups/crm-manual-20261017-023000Z.dump'

# Restore uploaded files
sudo docker exec crm_backend tar -xzf /usr/src/app/backups/crm-manual-20261017-023000Z.uploads.tar.gz -C /usr/src/app/uploads
```

A `.dump` copied into
`/usr/src/app/backups` with a name like `crm-manual-YYYYMMDD-HHMMSSZ.dump`
also shows up in Settings > Backups, where it can be restored.

Without Docker, the same `pg_dump -Fc` / `pg_restore` commands work against
any PostgreSQL 15 server; the PostgreSQL data itself is in the
`postgres_data` volume.
