# Deploying the CRM on AWS (EC2 + Docker)

The CRM runs on one EC2 instance with Docker Compose: the same containers as
the current VPS, plus an nginx container for HTTPS. This is the cheapest AWS
setup and needs no code changes. The generic steps are in
[deployment.md](./deployment.md); this page covers the AWS parts.

## 1. Pick a region and instance

| Item | Recommended |
|---|---|
| Region | `ap-south-1` (Mumbai), closest to Indian users |
| AMI | Ubuntu Server 24.04 LTS (x86_64) |
| Instance type | `t3.medium` (2 vCPU, 4 GB) to start. Use `t3.large` if many people use the AI Assistant at once |
| Storage | 30 GB gp3 EBS |
| Key pair | Create one and keep the `.pem` file safe; GitHub Actions needs it later |

`t3.small` (2 GB) works only if you turn off the local Ollama AI and use
`ANTHROPIC_API_KEY` instead.

## 2. Security group

Inbound rules:

| Port | Source | Why |
|---|---|---|
| 22 (SSH) | Your IP only (and GitHub Actions, see step 7) | Admin and deploys |
| 80 (HTTP) | 0.0.0.0/0, ::/0 | Let's Encrypt and redirect to HTTPS |
| 443 (HTTPS) | 0.0.0.0/0, ::/0 | The CRM |

Do not open 3000, 5000, 5432, 6379 or 11434. Compose binds them to localhost.

## 3. Launch

In the EC2 console, Launch instance with the settings above. Under
**Advanced details > User data**, paste the contents of
[`deploy/aws/ec2-user-data.sh`](../deploy/aws/ec2-user-data.sh). It installs
Docker, Compose, certbot and git, adds swap, and clones the repo to
`/var/www/crm`.

If the GitHub repo is private, the clone in user data fails. In that case SSH
in after launch and clone with a
[deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys)
or a fine-grained token:
`git clone git@github.com:vaibhavpetkar/CRM.git /var/www/crm`.

## 4. Elastic IP and DNS

1. EC2 > Elastic IPs > Allocate, then Associate it with the instance, so the
   address survives stop/start.
2. At your DNS provider (or Route 53), create an `A` record:
   `crm.eleviq.buzz -> <Elastic IP>`. Wait until `dig +short crm.eleviq.buzz`
   returns the Elastic IP.

## 5. Configure and start

```bash
ssh -i your-key.pem ubuntu@<Elastic IP>
cd /var/www/crm
git checkout master            # or the branch you are deploying
nano .env                      # set DB_PASSWORD, JWT_SECRET, SUPER_ADMIN_PASSWORD (+ email, Google, Exotel...)

sudo certbot certonly --standalone -d crm.eleviq.buzz
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
sudo docker compose exec -T backend npm run migrate
```

Generate secrets with
`openssl rand -hex 48`. Then open https://crm.eleviq.buzz.

Certificate renewal (`sudo crontab -e`):

```
0 3 * * * certbot renew --webroot -w /var/www/certbot --quiet && docker exec crm_nginx nginx -s reload
```

## 6. Moving data from the current VPS (optional)

```bash
# on the old server
sudo docker exec crm_postgres pg_dump -U postgres -Fc crm_db > crm.dump
sudo docker run --rm -v crm_backend_uploads:/u -v $PWD:/b alpine tar czf /b/uploads.tgz -C /u .
# copy both files to EC2 (scp), then on EC2, after `up -d`:
sudo docker exec -i crm_postgres pg_restore -U postgres -d crm_db --clean --if-exists < crm.dump
sudo docker run --rm -v crm_backend_uploads:/u -v $PWD:/b alpine tar xzf /b/uploads.tgz -C /u
```

Use the same `JWT_SECRET` as the old server if you don't want everyone signed
out. The volume name prefix (`crm_`) follows the folder name; check with
`docker volume ls`.

## 7. Automatic deploys from GitHub

`.github/workflows/deploy.yml` deploys over SSH and works with EC2 unchanged.
In GitHub > Settings > Secrets and variables > Actions, point the secrets at
the instance:

| Secret | Value |
|---|---|
| `VPS_HOST` | The Elastic IP |
| `VPS_USER` | `ubuntu` |
| `VPS_SSH_KEY` | Contents of the key pair's `.pem` file |
| `VPS_DEPLOY_PATH` | `/var/www/crm` |

GitHub-hosted runners use changing IP addresses, so port 22 must accept them
(0.0.0.0/0 with key-only SSH, which is the Ubuntu default), or use
EC2 Instance Connect / SSM instead.

The workflow runs `docker compose` with `docker-compose.yml` only. On EC2,
nginx comes from `docker-compose.prod.yml`, so add the override to the two
compose lines in the workflow, or add this line to `/var/www/crm/.env`:
`COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml`, which makes plain
`docker compose` pick up both files.

## 8. Backups and monitoring

- **EBS snapshots:** AWS Backup or Data Lifecycle Manager, daily, keep 7.
- **Database dumps to S3:** create a bucket, attach an IAM role with
  `s3:PutObject` on it to the instance, install the AWS CLI, then
  `sudo crontab -e`:
  ```
  30 2 * * * docker exec crm_postgres pg_dump -U postgres -Fc crm_db | aws s3 cp - s3://<bucket>/crm/crm_$(date +\%F).dump
  ```
- **Alarms:** CloudWatch alarm on `StatusCheckFailed` and CPU > 80% for 15
  minutes, with an SNS email.

## Rough monthly cost (ap-south-1, on-demand)

`t3.medium` about $30, 30 GB gp3 about $3, Elastic IP free while attached
(public IPv4 is billed about $3.6), snapshots a few dollars. A 1-year Savings
Plan cuts the instance cost by about 35%. Check current prices in the AWS
Pricing Calculator.

## Growing later

When one server is not enough: move Postgres to **RDS** (set `DB_HOST`),
Redis to **ElastiCache** (set `REDIS_URL`), uploads to a shared volume, and
put the frontend and backend behind an **Application Load Balancer** with an
ACM certificate. The containers need no code changes for this.
