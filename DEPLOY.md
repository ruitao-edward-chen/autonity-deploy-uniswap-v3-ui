# Mori Deployment Guide

Deploy the Mori (森) Uniswap V3 UI to an AWS EC2 instance with nginx and SSL.

## Prerequisites

- AWS EC2 instance (Amazon Linux 2023)
- Elastic IP assigned to EC2
- Domain registered (e.g., morifi.xyz)
- SSH access to EC2

## EC2 Instance Setup

### 1. Install Dependencies

```bash
# Update system
sudo yum update -y

# Install git and nginx
sudo yum install -y git nginx

# Install Node.js 20.x
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# Verify installation
node -v   # Should show v20.x.x
npm -v    # Should show 10.x.x
```

### 2. Clone and Build

```bash
# Clone repository
cd ~
git clone https://github.com/ruitao-edward-chen/autonity-deploy-uniswap-v3-ui.git

# Install dependencies and build
cd ~/autonity-deploy-uniswap-v3-ui
npm ci
npm run build
```

### 3. Configure Nginx

```bash
# Remove default config
sudo rm -f /etc/nginx/conf.d/default.conf

# Create web directory and copy build files
sudo mkdir -p /var/www/morifi.xyz
sudo rsync -a --delete ~/autonity-deploy-uniswap-v3-ui/dist/ /var/www/morifi.xyz/

# Create nginx config
sudo tee /etc/nginx/conf.d/morifi.xyz.conf > /dev/null <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name morifi.xyz www.morifi.xyz;

    root /var/www/morifi.xyz;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(?:js|css|png|jpg|jpeg|gif|svg|ico|webp|woff2?)$ {
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
        try_files $uri =404;
    }
}
EOF

# Test and start nginx
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl restart nginx
```

## DNS Configuration

Add these A records in your domain registrar (IONOS, Namecheap, GoDaddy, etc.):

| Type | Host/Name | Value           | TTL |
|------|-----------|-----------------|-----|
| A    | @         | 18.181.73.214   | 300 |
| A    | www       | 18.181.73.214   | 300 |

Wait 5-15 minutes for DNS propagation.

### Verify DNS

```bash
dig morifi.xyz +short
# Should return: 18.181.73.214

dig www.morifi.xyz +short
# Should return: 18.181.73.214
```

## SSL Certificate (Let's Encrypt)

### 1. Install Certbot

```bash
sudo yum install -y certbot python3-certbot-nginx
```

### 2. Obtain Certificate

```bash
sudo certbot --nginx \
  -d morifi.xyz -d www.morifi.xyz \
  --redirect --agree-tos -m your-email@example.com --non-interactive
```

### 3. Enable Auto-Renewal

```bash
sudo systemctl enable --now certbot-renew.timer

# Test renewal
sudo certbot renew --dry-run
```

## Updating the Site

When you push changes to the repository:

### On Local Machine (Windows PowerShell)

```powershell
cd C:\Work\Clearmatics\Uniswap-V3-UI\ui
git add .
git commit -m "Your commit message"
git push
```

### On EC2

```bash
cd ~/autonity-deploy-uniswap-v3-ui
git pull
npm run build
sudo rsync -a --delete ~/autonity-deploy-uniswap-v3-ui/dist/ /var/www/morifi.xyz/
```

## Quick Deploy Script

Create a deploy script on EC2 for convenience:

```bash
cat > ~/deploy.sh << 'EOF'
#!/bin/bash
set -e
cd ~/autonity-deploy-uniswap-v3-ui
git pull
npm run build
sudo rsync -a --delete ~/autonity-deploy-uniswap-v3-ui/dist/ /var/www/morifi.xyz/
echo "✅ Deployed successfully!"
EOF

chmod +x ~/deploy.sh
```

Then just run `~/deploy.sh` to update the site.

## Troubleshooting

### Check nginx status
```bash
sudo systemctl status nginx
sudo nginx -t
```

### Check nginx logs
```bash
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

### Check certbot logs
```bash
sudo cat /var/log/letsencrypt/letsencrypt.log
```

### Restart nginx
```bash
sudo systemctl restart nginx
```

### Check if port 80/443 are open
Ensure your EC2 Security Group allows inbound traffic on:
- Port 80 (HTTP)
- Port 443 (HTTPS)
- Port 22 (SSH)

## Infrastructure Details

| Resource      | Value                                              |
|---------------|----------------------------------------------------|
| EC2 IP        | 18.181.73.214                                      |
| Domain        | morifi.xyz                                         |
| Web Root      | /var/www/morifi.xyz                                |
| Nginx Config  | /etc/nginx/conf.d/morifi.xyz.conf                  |
| SSL Certs     | /etc/letsencrypt/live/morifi.xyz/                  |
| Repo Path     | ~/autonity-deploy-uniswap-v3-ui                    |
