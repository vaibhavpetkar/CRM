# Production checklist

Work through this list before going live, and again after any major server change.
The details are in [deployment.md](deployment.md), [deploy-aws.md](deploy-aws.md) and
[server-security.md](server-security.md).

## Before the first deploy

- [ ] `.env` on the server sets its own `DB_PASSWORD`, `JWT_SECRET` (64+ random characters)
      and `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`. Never reuse a value that has
      been in git, a chat or a screenshot.
- [ ] `SETTINGS_ENCRYPTION_KEY` is set (random, kept safe). It encrypts saved provider
      passwords (Vi, Exotel). If it is left blank they are encrypted with `JWT_SECRET`,
      and rotating `JWT_SECRET` would then make them unreadable. If you add this key
      after provider passwords were saved, enter those passwords again in Settings.
- [ ] `CLIENT_URL` is the real `https://` address, so invite and reset links work.
- [ ] SMTP (`EMAIL_*`) is configured, so invites and password resets are emailed.
- [ ] `BACKUP_DAILY_AT` is set (for example `02:30`, India time) to take a daily automatic backup.

## Server

- [ ] Run `sudo bash deploy/harden-server.sh` once (firewall, fail2ban, SSH, automatic
      security updates). Keep your SSH session open and test a second login before
      closing it.
- [ ] AWS: the security group opens only 22 (ideally your IP), 80 and 443. IMDSv2 is
      set to required on the instance.
- [ ] Only nginx publishes ports. `docker-compose.dev.yml` is never used on a server.

## Deploying

- Automatic deploy (GitHub Actions) needs the `AWS_HOST`, `AWS_USER`, `AWS_SSH_KEY` and
  `AWS_DEPLOY_PATH` repository secrets. Until they are set, deploy by hand:

  ```bash
  cd /var/www/crm
  git pull origin real-estate
  sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
  sudo docker compose exec -T backend npm run migrate
  ```

## After each deploy

- [ ] Sign in, open Leads, and add a lead without an email.
- [ ] Place a test call and hear the ringing sound.
- [ ] Settings > Backups: click "Back up now" and check it appears in the list.
- [ ] Download a backup now and then and keep a copy off the server. A backup that
      only lives on the same server is lost with it.

## Known limits

- The `xlsx` package used for spreadsheet import/export has open advisories with no
  npm fix. It runs only in the user's browser on files they choose.
- Passwords now need at least 8 characters. Existing passwords keep working.
- Changing or resetting a password signs that account out on its other devices.
