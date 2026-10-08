# Deploying the CRM to a cloud server

The CRM runs as Docker containers: PostgreSQL, Redis, Ollama (free local AI),
the Express backend and the Next.js frontend. Any Linux cloud VM works (AWS
EC2, Google Compute Engine, Azure VM, DigitalOcean Droplet, Hetzner, a VPS).
Production domain: **crm.eleviq.buzz**.

## What you need

- A Linux server with at least 2 vCPU and 4 GB RAM (Ollama uses ~2 GB; set
  `AI_PROVIDER`/`ANTHROPIC_API_KEY` and drop Ollama if the box is smaller).
- Docker Engine with the Compose plugin.
- A DNS `A` record for `crm.eleviq.buzz` pointing at the server.
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
sudo certbot certonly --standalone -d crm.eleviq.buzz
sudo mkdir -p /var/www/certbot
```

Start everything, then apply database migrations:

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
sudo docker compose exec -T backend npm run migrate
```

On a brand-new database the backend creates the tables on its first start,
which is why migrations run after `up`.

Open https://crm.eleviq.buzz and sign in with `SUPER_ADMIN_EMAIL` /
`SUPER_ADMIN_PASSWORD` and company code `my-company` (rename the company in
Settings > Company).

Certificate renewal (add to root's crontab):

```bash
0 3 * * * certbot renew --webroot -w /var/www/certbot --quiet && docker exec crm_nginx nginx -s reload
```

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
curl -s https://crm.eleviq.buzz/api/health
```

## Backups

```bash
sudo docker exec crm_postgres pg_dump -U postgres crm_db | gzip > crm_$(date +%F).sql.gz
```

Uploaded files and call recordings live in the `backend_uploads` volume; back
it up too.
