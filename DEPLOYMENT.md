# Young Vinnies Tracker - Production Deployment Guide

This guide covers deploying the Young Vinnies Tracker application to production environments.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Security Checklist](#security-checklist)
- [Deployment Options](#deployment-options)
- [SSL/HTTPS Setup](#sslhttps-setup)
- [Backup & Restore](#backup--restore)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Before deploying to production, ensure you have:

- Node.js 14.x or higher
- npm or yarn package manager
- A server or cloud platform account
- Domain name (optional but recommended)
- SSL certificate (for HTTPS)

## Environment Setup

### 1. Install Dependencies

```bash
npm install --production
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory (never commit this file):

```bash
cp .env.example .env
```

Edit `.env` and set your values:

```env
NODE_ENV=production
PORT=3000
SESSION_SECRET=<generate-strong-random-string>
COOKIE_SECURE=true
COOKIE_MAX_AGE=86400000
RATE_LIMIT_MAX=100
LOG_LEVEL=combined
```

**Generate a secure session secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Update User Passwords

Before deploying, ensure all default passwords in `users.json` are changed to strong, unique passwords.

## Security Checklist

Before going live, verify:

- [ ] Environment variables are set (especially `SESSION_SECRET`)
- [ ] `NODE_ENV=production` is set
- [ ] `COOKIE_SECURE=true` (if using HTTPS)
- [ ] Default passwords have been changed
- [ ] `.env` file is in `.gitignore`
- [ ] HTTPS/SSL is configured
- [ ] Rate limiting is enabled
- [ ] Security headers (helmet) are active
- [ ] Regular backups are scheduled

## Deployment Options

### Option 1: Vercel (Recommended)

**Best for:** Quick deployment, automatic HTTPS, free tier

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**
   ```bash
   vercel login
   ```

3. **Deploy from Project Directory**
   ```bash
   vercel
   ```
   
   Follow the prompts:
   - Set up and deploy? Yes
   - Which scope? Select your account
   - Link to existing project? No
   - Project name? young-vinnies-tracker (or your choice)
   - Directory? ./ (current directory)
   - Want to override settings? No

4. **Set Environment Variables**
   ```bash
   # Generate a strong session secret
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   
   # Add environment variables
   vercel env add SESSION_SECRET production
   # Paste the generated secret when prompted
   
   vercel env add COOKIE_SECURE production
   # Enter: true
   
   vercel env add NODE_ENV production
   # Enter: production
   ```

5. **Deploy to Production**
   ```bash
   vercel --prod
   ```

6. **Custom Domain (Optional)**
   ```bash
   vercel domains add your-domain.com
   ```

**Notes:**
- Vercel automatically provides HTTPS
- Environment variables are set per environment (production, preview, development)
- Vercel uses serverless functions - JSON file storage works but consider upgrading to a database for scale
- Free tier includes: 100GB bandwidth, unlimited requests

**Post-Deployment:**
1. Visit your Vercel URL (shown after deployment)
2. Login with default admin credentials (username: `admin`, password: `vinnies2024`)
3. **Immediately change admin password** via Settings page
4. Login as sam (username: `sam`, password: `sam2024secret`)  
5. **Immediately change sam password** via Settings page
6. Test all functionality

⚠️ **Security Warning:** Default passwords must be changed immediately after first deployment. Do not use default credentials in production.

### Option 2: Heroku

1. **Install Heroku CLI**
   ```bash
   npm install -g heroku
   ```

2. **Login and Create App**
   ```bash
   heroku login
   heroku create young-vinnies-tracker
   ```

3. **Set Environment Variables**
   ```bash
   heroku config:set NODE_ENV=production
   heroku config:set SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
   heroku config:set COOKIE_SECURE=true
   ```

4. **Deploy**
   ```bash
   git push heroku main
   ```

5. **Open Application**
   ```bash
   heroku open
   ```

### Option 3: Railway

1. **Install Railway CLI**
   ```bash
   npm install -g @railway/cli
   ```

2. **Login and Initialize**
   ```bash
   railway login
   railway init
   ```

3. **Add Environment Variables**
   ```bash
   railway variables set NODE_ENV=production
   railway variables set SESSION_SECRET=<your-secret>
   railway variables set COOKIE_SECURE=true
   ```

4. **Deploy**
   ```bash
   railway up
   ```

### Option 4: DigitalOcean App Platform

1. **Create a New App** in DigitalOcean dashboard
2. **Connect your GitHub repository**
3. **Configure App:**
   - Build Command: `npm install`
   - Run Command: `npm start`
   - Port: `3000`

4. **Add Environment Variables** in App Settings:
   ```
   NODE_ENV=production
   SESSION_SECRET=<your-secret>
   COOKIE_SECURE=true
   ```

5. **Deploy** - DigitalOcean will auto-deploy

### Option 5: VPS (Ubuntu/Debian)

1. **Setup Server**
   ```bash
   # Update system
   sudo apt update && sudo apt upgrade -y
   
   # Install Node.js
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt install -y nodejs
   
   # Install PM2 (process manager)
   sudo npm install -g pm2
   ```

2. **Clone and Setup Application**
   ```bash
   cd /var/www
   git clone <your-repo-url> young-vinnies-tracker
   cd young-vinnies-tracker
   npm install --production
   ```

3. **Create .env File**
   ```bash
   nano .env
   # Add your environment variables
   ```

4. **Start with PM2**
   ```bash
   pm2 start index.js --name young-vinnies-tracker
   pm2 save
   pm2 startup
   ```

5. **Setup Nginx Reverse Proxy**
   ```bash
   sudo apt install nginx
   sudo nano /etc/nginx/sites-available/young-vinnies-tracker
   ```
   
   Add configuration:
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
   
   Enable site:
   ```bash
   sudo ln -s /etc/nginx/sites-available/young-vinnies-tracker /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

## SSL/HTTPS Setup

### Using Let's Encrypt (Free SSL)

1. **Install Certbot**
   ```bash
   sudo apt install certbot python3-certbot-nginx
   ```

2. **Obtain Certificate**
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```

3. **Auto-renewal**
   ```bash
   sudo certbot renew --dry-run
   ```

### After SSL Setup

Update your `.env`:
```env
COOKIE_SECURE=true
```

Restart the application to apply changes.

## Backup & Restore

### Create Backup

```bash
npm run backup
```

This creates a timestamped backup in the `backups/` directory containing:
- `data.json` (members and sessions)
- `users.json` (user accounts)
- `audit_log.json` (activity logs)

### Restore from Backup

```bash
npm run restore
```

Follow the prompts to select a backup to restore.

### Automated Backups

**Setup daily backups with cron:**

```bash
crontab -e
```

Add line:
```cron
0 2 * * * cd /var/www/young-vinnies-tracker && /usr/bin/npm run backup
```

This runs backup daily at 2 AM.

## Monitoring

### Health Check Endpoint

The application includes a health check endpoint:

```bash
curl https://your-domain.com/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-03-20T10:30:00.000Z",
  "uptime": 3600.5
}
```

### View Logs

**With PM2:**
```bash
pm2 logs young-vinnies-tracker
```

**View HTTP Request Logs:**
Application logs HTTP requests using Morgan logger.

### Monitor with PM2

```bash
pm2 monit
```

Shows:
- CPU usage
- Memory usage
- Logs in real-time

## Troubleshooting

### Application Won't Start

1. **Check Node.js version:**
   ```bash
   node --version  # Should be 14.x or higher
   ```

2. **Check dependencies:**
   ```bash
   npm install
   ```

3. **Check environment variables:**
   ```bash
   cat .env
   ```

4. **Check logs:**
   ```bash
   pm2 logs young-vinnies-tracker --lines 100
   ```

### Session/Login Issues

1. **Verify SESSION_SECRET is set:**
   ```bash
   echo $SESSION_SECRET
   ```

2. **Check cookie settings:**
   - If using HTTP (development), set `COOKIE_SECURE=false`
   - If using HTTPS (production), set `COOKIE_SECURE=true`

3. **Clear browser cookies and try again**

### High Memory Usage

1. **Restart application:**
   ```bash
   pm2 restart young-vinnies-tracker
   ```

2. **Monitor memory:**
   ```bash
   pm2 monit
   ```

3. **Check for memory leaks in logs**

### Database Issues

1. **Backup current data:**
   ```bash
   npm run backup
   ```

2. **Check file permissions:**
   ```bash
   ls -la *.json
   chmod 644 *.json
   ```

3. **Restore from backup if needed:**
   ```bash
   npm run restore
   ```

### Rate Limiting

If legitimate users are being rate limited:

1. **Increase limit in .env:**
   ```env
   RATE_LIMIT_MAX=200
   ```

2. **Restart application**

### SSL Certificate Issues

1. **Check certificate expiration:**
   ```bash
   sudo certbot certificates
   ```

2. **Renew if needed:**
   ```bash
   sudo certbot renew
   ```

3. **Restart Nginx:**
   ```bash
   sudo systemctl restart nginx
   ```

## Performance Optimization

### Enable Compression

Already enabled via `compression` middleware. Verify with:

```bash
curl -I -H "Accept-Encoding: gzip" https://your-domain.com
```

Should see: `Content-Encoding: gzip`

### Database Optimization

The application uses JSON files for simplicity. For high-traffic deployments:

1. **Consider MongoDB or PostgreSQL** for better performance
2. **Implement caching** with Redis
3. **Use a CDN** for static assets

## Maintenance

### Update Application

```bash
# Backup data first
npm run backup

# Pull latest changes
git pull origin main

# Install dependencies
npm install --production

# Restart application
pm2 restart young-vinnies-tracker
```

### Monitor Disk Space

```bash
df -h
```

Regular backups can fill disk. Set up automatic cleanup:

```bash
# Keep only last 30 days of backups
find backups/ -type d -mtime +30 -exec rm -rf {} \;
```

## Support

For issues or questions:
1. Check this deployment guide
2. Review application logs
3. Check the main README.md
4. Review GitHub Issues

## Production Checklist

Before launch:
- [ ] Environment variables configured
- [ ] Strong passwords set for all users
- [ ] HTTPS/SSL enabled
- [ ] Backup system configured
- [ ] Monitoring set up
- [ ] Rate limiting tested
- [ ] Error handling verified
- [ ] Health check endpoint working
- [ ] Domain name configured
- [ ] User acceptance testing completed

## Post-Deployment

After successful deployment:
1. Test all features with real data
2. Verify backup system works
3. Monitor logs for errors
4. Set up regular maintenance schedule
5. Document any custom configurations
6. Train users on the system

---

**Ready to deploy?** Follow the steps above for your chosen platform. Good luck! 🚀
