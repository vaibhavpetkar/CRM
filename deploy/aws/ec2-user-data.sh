#!/bin/bash
# EC2 user data for the CRM (Ubuntu 24.04 LTS). Paste into
# "Advanced details > User data" when launching the instance. It installs
# Docker + Compose, certbot and git, adds 2 GB swap, and clones the repo to
# /var/www/crm. Secrets are NOT set here: fill in /var/www/crm/.env after
# the first SSH login (see docs/deploy-aws.md).
set -euxo pipefail

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git certbot

# Docker Engine + Compose plugin from Docker's official repository
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
usermod -aG docker ubuntu

# Swap keeps the Next.js build and Ollama from running out of memory on small instances
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

mkdir -p /var/www/certbot
if [ ! -d /var/www/crm/.git ]; then
  git clone -b real-estate https://github.com/vaibhavpetkar/CRM.git /var/www/crm
  cp /var/www/crm/.env.example /var/www/crm/.env
  chmod 600 /var/www/crm/.env
  chown -R ubuntu:ubuntu /var/www/crm
fi
