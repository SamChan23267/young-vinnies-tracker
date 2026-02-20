# ⚡ Quick Start: Deploy to Vercel in 5 Minutes

The absolute fastest way to get your Young Vinnies Tracker online.

## 🚀 Method 1: One-Click Deploy (Easiest)

### Step 1: Click the Deploy Button

Click this button to deploy directly to Vercel:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/SamChan23267/young-vinnies-tracker)

### Step 2: Configure in Vercel

1. **Login/Sign up** with GitHub
2. **Repository name:** Keep default or customize
3. **Environment Variables:** Add these:
   - `SESSION_SECRET` = Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `COOKIE_SECURE` = `true`
4. Click **Deploy**

### Step 3: Secure Your App

1. Visit your new URL (shown after deployment)
2. Login as `admin` / `vinnies2024`
3. Go to Settings → Change Password
4. Logout
5. Login as `sam` / `sam2024secret`
6. Go to Settings → Change Password

✅ **Done! Your app is live and secure!**

---

## 💻 Method 2: CLI Deploy (5 Commands)

### Quick Commands

```bash
# 1. Install Vercel
npm install -g vercel

# 2. Login
vercel login

# 3. Deploy
vercel

# 4. Set environment variables
vercel env add SESSION_SECRET production
# Paste: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

vercel env add COOKIE_SECURE production
# Enter: true

# 5. Deploy to production
vercel --prod
```

### Then Secure Your App

1. Visit the production URL shown
2. Change admin password (login: admin/vinnies2024)
3. Change sam password (login: sam/sam2024secret)

✅ **Done!**

---

## ⚙️ Environment Variables Explained

**SESSION_SECRET** (Required)
- What: Secret key for encrypting session data
- Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Example: `a1b2c3d4e5f6789abcdef...` (long random string)
- Why: Keeps user sessions secure

**COOKIE_SECURE** (Required for production)
- What: Ensures cookies only sent over HTTPS
- Value: `true`
- Why: Prevents session hijacking

**NODE_ENV** (Optional)
- What: Tells app it's in production mode
- Value: `production`
- Why: Enables production optimizations

---

## 🔐 Default Credentials (CHANGE THESE!)

**⚠️ IMPORTANT: Change these immediately after first login!**

- Admin: `admin` / `vinnies2024`
- Sam: `sam` / `sam2024secret`

---

## 📋 Post-Deployment Checklist

- [ ] App is accessible via Vercel URL
- [ ] Login page loads
- [ ] Changed admin password
- [ ] Changed sam password
- [ ] Dashboard shows 0 members, 0 sessions
- [ ] Can add a test member
- [ ] Can create a test session
- [ ] Can mark attendance
- [ ] Can export CSV
- [ ] No errors in browser console

---

## 🆘 Troubleshooting

**Can't login?**
- Check SESSION_SECRET is set in Vercel environment variables
- Make sure COOKIE_SECURE is `true`
- Clear browser cookies and try again

**App not deploying?**
- Check build logs in Vercel dashboard
- Verify all dependencies are in package.json
- Run `npm install` locally to test

**Need detailed help?**
- See full guide: [VERCEL_DEPLOYMENT_GUIDE.md](VERCEL_DEPLOYMENT_GUIDE.md)
- See general deployment: [DEPLOYMENT.md](DEPLOYMENT.md)

---

## 🎯 What's Next?

1. Share the URL with your team leaders
2. Have them create accounts (you add them via User Management)
3. Add your volunteer members
4. Create sessions
5. Start tracking hours!

**Your Young Vinnies Tracker is now live!** 🌟

---

## 📞 Quick Links

- **Vercel Dashboard:** https://vercel.com/dashboard
- **Vercel Docs:** https://vercel.com/docs
- **Full Deployment Guide:** [VERCEL_DEPLOYMENT_GUIDE.md](VERCEL_DEPLOYMENT_GUIDE.md)
- **App Documentation:** [README.md](README.md)
