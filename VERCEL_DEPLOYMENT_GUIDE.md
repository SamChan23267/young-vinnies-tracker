# 🚀 Vercel Deployment Guide - Young Vinnies Tracker

This guide will walk you through deploying the Young Vinnies Tracker to Vercel, step by step.

## 📋 What You'll Need

Before you begin, make sure you have:
- ✅ A GitHub account (with this repository)
- ✅ A free Vercel account (sign up at https://vercel.com)
- ✅ Node.js installed on your computer (version 14 or higher)
- ✅ A terminal/command prompt

## 🎯 Deployment Method: Choose One

### Method A: Deploy via Vercel Website (Easiest - Recommended for Beginners)
### Method B: Deploy via Vercel CLI (For Advanced Users)

---

## 📱 Method A: Deploy via Vercel Website (Easiest)

This is the simplest method and requires no command-line knowledge.

### Step 1: Sign Up for Vercel

1. Go to https://vercel.com
2. Click "Sign Up"
3. Sign up with your GitHub account
4. Authorize Vercel to access your repositories

### Step 2: Import Your Repository

1. Once logged in, click "Add New..." → "Project"
2. In the "Import Git Repository" section:
   - Find "SamChan23267/young-vinnies-tracker"
   - Click "Import"
   
3. If you don't see your repository:
   - Click "Adjust GitHub App Permissions"
   - Select the repository
   - Click "Install"

### Step 3: Configure Project

1. **Project Name:** Keep the default or change to something memorable
2. **Framework Preset:** Select "Other" (it will auto-detect)
3. **Root Directory:** Leave as `./` (default)
4. **Build Command:** Leave empty or use `npm install`
5. **Output Directory:** Leave empty
6. **Install Command:** `npm install`

### Step 4: Add Environment Variables

**CRITICAL STEP:** Click "Environment Variables" section and add:

1. **SESSION_SECRET**
   - Name: `SESSION_SECRET`
   - Value: Generate a secure random string
   - To generate: Open a terminal and run:
     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```
   - Copy the output (a long random string like `a1b2c3d4e5f6...`)
   - Paste it as the value
   - Click "Add"

2. **COOKIE_SECURE**
   - Name: `COOKIE_SECURE`
   - Value: `true`
   - Click "Add"

3. **NODE_ENV** (optional, set automatically)
   - Name: `NODE_ENV`
   - Value: `production`
   - Click "Add"

### Step 5: Deploy

1. Click "Deploy" button
2. Wait for the build to complete (1-3 minutes)
3. Once complete, you'll see "Congratulations!" with your deployment URL

### Step 5b: Add Vercel KV Storage (Required to prevent data loss)

Vercel runs multiple simultaneous function instances. Without a shared
database each instance keeps its own private copy of your data, causing
members, sessions and audit-log entries to randomly disappear on refresh
("parallel universes"). Vercel KV (powered by Upstash **Redis**) fixes
this by giving all instances a single shared store.

1. In your Vercel project dashboard click **Storage** in the left sidebar.
2. Click **Create Database**.
3. Select **KV** from the list of database types.
4. On the Upstash product-selection screen choose **Redis**
   *(not Vector, Queue, or Search)*.
5. Give it a name (e.g. `young-vinnies-kv`) and click **Create & Continue**.
6. On the "Connect to Project" screen select your project and click
   **Connect**.  Vercel automatically adds `KV_REST_API_URL` and
   `KV_REST_API_TOKEN` to your project's environment variables.
7. Go back to your project's **Deployments** tab and click **Redeploy**
   on the latest deployment so the new env vars take effect.

Your data will now persist correctly across all requests.

### Step 6: Post-Deployment Security

**⚠️ CRITICAL: Change Default Passwords Immediately!**

1. Click on your deployment URL (e.g., `your-app-name.vercel.app`)
2. You'll see the login page
3. Login with default credentials:
   - Username: `admin`
   - Password: `vinnies2024`
4. Navigate to Settings page (⚙️ in navigation)
5. Change the password to something secure
6. Logout
7. Login again as sam:
   - Username: `sam`
   - Password: `sam2024secret`
8. Change sam's password in Settings
9. Done! Your app is now secure.

### Step 7: Configure Custom Domain (Optional)

1. In Vercel dashboard, go to your project
2. Click "Settings" → "Domains"
3. Add your custom domain
4. Follow Vercel's instructions to update DNS records
5. Wait for DNS propagation (can take up to 48 hours)

---

## 💻 Method B: Deploy via Vercel CLI

This method uses the command line and gives you more control.

### Step 1: Install Vercel CLI

Open your terminal and run:

```bash
npm install -g vercel
```

This installs the Vercel command-line tool globally.

### Step 2: Navigate to Your Project

```bash
cd /path/to/young-vinnies-tracker
```

Replace `/path/to/` with the actual path to where you cloned the repository.

### Step 3: Login to Vercel

```bash
vercel login
```

This will:
- Open a browser window
- Ask you to verify your email
- Confirm authentication
- Return you to the terminal

### Step 4: Initial Deployment (Development)

```bash
vercel
```

You'll be prompted with several questions:

1. **"Set up and deploy?"** → Type `y` and press Enter
2. **"Which scope?"** → Select your account (use arrow keys, press Enter)
3. **"Link to existing project?"** → Type `n` and press Enter
4. **"What's your project's name?"** → Press Enter (accept default) or type a custom name
5. **"In which directory is your code located?"** → Press Enter (use `./`)

Vercel will now:
- Build your project
- Deploy to a preview URL
- Show you the URL (e.g., `young-vinnies-tracker-xxxx.vercel.app`)

⚠️ **This is a preview deployment, not production yet!**

### Step 5: Add Environment Variables

Now we need to add the required environment variables for production:

#### Generate Session Secret

First, generate a secure random string:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output (it will look like: `a1b2c3d4e5f6789...`)

#### Add SESSION_SECRET

```bash
vercel env add SESSION_SECRET production
```

When prompted:
1. Paste the secret you generated above
2. Press Enter

#### Add COOKIE_SECURE

```bash
vercel env add COOKIE_SECURE production
```

When prompted:
1. Type: `true`
2. Press Enter

#### Add NODE_ENV (Optional)

```bash
vercel env add NODE_ENV production
```

When prompted:
1. Type: `production`
2. Press Enter

### Step 6: Deploy to Production

Now deploy to production with the environment variables:

```bash
vercel --prod
```

Vercel will:
- Build your project again
- Use the production environment variables
- Deploy to your production URL
- Show you the production URL

🎉 **Your app is now live!**

### Step 6b: Add Vercel KV Storage (Required to prevent data loss)

Vercel runs multiple simultaneous function instances. Without a shared
database each instance keeps its own private copy of your data, causing
members, sessions and audit-log entries to randomly disappear on refresh.
Vercel KV (powered by Upstash **Redis**) fixes this.

1. Open your Vercel project in the browser dashboard.
2. Click **Storage** in the left sidebar → **Create Database** → **KV**.
3. On the Upstash product-selection screen choose **Redis**
   *(not Vector, Queue, or Search)*.
4. Name it (e.g. `young-vinnies-kv`) and follow the wizard.
5. On the "Connect to Project" screen select your project and click
   **Connect**.  Vercel automatically adds `KV_REST_API_URL` and
   `KV_REST_API_TOKEN` to your project's env vars.
6. Redeploy to pick up the new variables:
   ```bash
   vercel --prod
   ```

### Step 7: Post-Deployment Security

**⚠️ CRITICAL: Change Default Passwords!**

1. Visit your production URL (from the previous step)
2. You'll see the login page
3. Login with default admin credentials:
   ```
   Username: admin
   Password: vinnies2024
   ```
4. Navigate to Settings (⚙️ icon in navigation)
5. Under "Change Password", enter:
   - Current Password: `vinnies2024`
   - New Password: (choose a strong password)
   - Confirm Password: (same as new password)
6. Click "Change Password"
7. Logout (button at bottom of Settings page)
8. Login as sam:
   ```
   Username: sam
   Password: sam2024secret
   ```
9. Change sam's password in Settings
10. Logout

✅ **Your application is now secure and ready to use!**

---

## 🔧 Managing Your Deployment

### View Your Deployments

```bash
vercel ls
```

This lists all your deployments.

### View Project Details

```bash
vercel inspect
```

Shows details about your current deployment.

### View Logs

```bash
vercel logs
```

Shows real-time logs from your production deployment.

### Add More Environment Variables

```bash
vercel env add VARIABLE_NAME production
```

### Remove Environment Variables

```bash
vercel env rm VARIABLE_NAME production
```

### Redeploy

After making changes to your code:

1. Commit and push to GitHub
2. Run: `vercel --prod`

Or, if connected to GitHub, Vercel will auto-deploy when you push to main branch.

---

## 🌐 Custom Domain Setup

### Step 1: Add Domain in Vercel

1. Go to your project in Vercel dashboard
2. Click "Settings" → "Domains"
3. Click "Add Domain"
4. Enter your domain (e.g., `youngvinnies.com`)

### Step 2: Configure DNS

Vercel will show you DNS records to add. In your domain registrar (GoDaddy, Namecheap, etc.):

**For apex domain (youngvinnies.com):**
- Type: `A`
- Name: `@`
- Value: `76.76.21.21` (Vercel's IP)

**For www subdomain:**
- Type: `CNAME`
- Name: `www`
- Value: `cname.vercel-dns.com`

### Step 3: Wait for DNS Propagation

- Can take 24-48 hours
- Check status in Vercel dashboard
- Once verified, SSL certificate is automatically issued

---

## 🔍 Testing Your Deployment

### 1. Health Check

Visit: `https://your-app-name.vercel.app/health`

You should see:
```json
{
  "status": "healthy",
  "timestamp": "2024-03-20T10:30:00.000Z",
  "uptime": 123.45,
  "environment": "production"
}
```

### 2. Test Login

1. Visit your deployment URL
2. Login with your admin credentials (after changing from default)
3. Verify all pages load correctly

### 3. Test Features

- ✅ Add a member
- ✅ Create a session
- ✅ Mark attendance
- ✅ Export CSV
- ✅ View audit log (super admin/sam)
- ✅ Manage users (super admin/sam)

---

## 🐛 Troubleshooting

### Issue: "Session secret is not set" Warning

**Solution:** Make sure SESSION_SECRET environment variable is set:
```bash
vercel env add SESSION_SECRET production
```

### Issue: Login doesn't work / Sessions not persisting

**Cause:** Vercel's serverless functions are stateless

**Solution:** 
1. Verify COOKIE_SECURE is set to `true`
2. Make sure you're accessing via HTTPS
3. Check browser cookies are enabled

### Issue: "Cannot find module" errors

**Solution:** Ensure all dependencies are in package.json:
```bash
npm install --save express express-session helmet compression express-rate-limit morgan dotenv
```

Then redeploy:
```bash
vercel --prod
```

### Issue: Static files (CSS/JS) not loading

**Solution:** Verify vercel.json routes are correct:
```json
{
  "src": "/public/(.*)",
  "dest": "/public/$1"
}
```

### Issue: File writes not persisting (data.json, users.json)

**Limitation:** Vercel's serverless functions have read-only file systems.

**Solutions:**
1. **For small-scale use:** Files stored in serverless function memory (works for current session)
2. **For production scale:** Consider:
   - Vercel Postgres (database add-on)
   - MongoDB Atlas (free tier available)
   - Supabase (PostgreSQL + authentication)
   - Railway (persistent file system)

**Note:** For the Young Vinnies group's scale (< 100 members), the current JSON file approach may work short-term, but consider upgrading to a database for reliability.

### Issue: Application is slow or times out

**Solutions:**
1. Check Vercel function logs: `vercel logs`
2. Verify you're on a paid plan if needed (free tier has limits)
3. Optimize large data queries
4. Consider caching strategies

---

## 📊 Monitoring Your Application

### Vercel Analytics

1. Go to your project in Vercel dashboard
2. Click "Analytics" tab
3. View traffic, performance, and errors

### View Logs in Real-Time

```bash
vercel logs --follow
```

Press Ctrl+C to stop.

### Check Deployment Status

```bash
vercel ls
```

Shows all deployments with their status.

---

## 🔄 Updating Your Application

### Automatic Deployments (Recommended)

1. Push changes to your GitHub repository
2. Vercel automatically detects the push
3. Builds and deploys the new version
4. No manual intervention needed

### Manual Deployments

```bash
vercel --prod
```

Manually triggers a production deployment.

---

## 💾 Backup Important Data

**Before making major changes, backup your data:**

```bash
# If you can SSH to the deployment (not typical with Vercel)
# Instead, regularly export your data via the app:
# 1. Login as super admin
# 2. Go to Export page
# 3. Export all data to CSV
# 4. Save the CSV file locally
```

For proper backups, consider:
- Regular CSV exports from the app
- Database migration (recommended for production)
- External backup service

---

## 🎓 Next Steps After Deployment

1. **Change All Passwords**
   - Login and change admin password
   - Login and change sam password

2. **Add Team Leader Accounts**
   - Login as super admin or sam
   - Go to User Management
   - Add admin accounts for team leaders

3. **Add Initial Members**
   - Go to Members page
   - Add your volunteer members

4. **Create Sessions**
   - Go to Sessions page
   - Create your first volunteer sessions

5. **Start Tracking**
   - Use Session pages to mark attendance
   - Track volunteer hours
   - Export data as needed

---

## 🆘 Getting Help

### Vercel Documentation
- https://vercel.com/docs

### Vercel Support
- https://vercel.com/support

### Application Issues
- Check the GitHub repository issues
- Review DEPLOYMENT.md for general deployment help
- Check TROUBLESHOOTING section above

---

## 📞 Support Checklist

If you encounter issues:

1. **Check Vercel build logs:**
   - Vercel dashboard → Your project → Deployments → Click latest → View logs

2. **Check function logs:**
   ```bash
   vercel logs
   ```

3. **Verify environment variables:**
   - Vercel dashboard → Your project → Settings → Environment Variables

4. **Check your code:**
   - Make sure all changes are committed and pushed
   - Verify vercel.json is in the root directory
   - Check package.json has all dependencies

5. **Test locally first:**
   ```bash
   npm install
   npm start
   # Visit http://localhost:3000
   ```

---

## ✅ Post-Deployment Checklist

After successful deployment:

- [ ] Application is accessible via Vercel URL
- [ ] Login page loads correctly
- [ ] Can login with admin credentials
- [ ] Changed admin password
- [ ] Changed sam password
- [ ] Dashboard loads and shows statistics
- [ ] Can add members
- [ ] Can create sessions
- [ ] Can mark attendance
- [ ] Can export CSV
- [ ] Audit log is accessible (super admin/sam)
- [ ] User management works (super admin/sam)
- [ ] All navigation links work
- [ ] No console errors in browser

---

## 🎉 Congratulations!

Your Young Vinnies Tracker is now live and accessible to your team! 

**Your URL:** `https://your-project-name.vercel.app`

Share this URL with your team leaders and start tracking volunteer hours!

---

## 📌 Quick Reference

### Default Credentials (Change Immediately!)
- **Admin:** username: `admin`, password: `vinnies2024`
- **Sam:** username: `sam`, password: `sam2024secret`

### Important Commands
```bash
vercel login              # Login to Vercel
vercel                    # Deploy (preview)
vercel --prod            # Deploy (production)
vercel env ls            # List environment variables
vercel logs              # View logs
vercel ls                # List deployments
```

### Key Features
- 👥 Member management
- 📅 Session management with hours
- ✅ Attendance tracking
- 📊 CSV export
- 👤 User management (super admin/sam)
- 📝 Audit log with hide capability
- ⚙️ Settings and password change

---

**Need Help?** Check the DEPLOYMENT.md file for more detailed deployment options and troubleshooting.
