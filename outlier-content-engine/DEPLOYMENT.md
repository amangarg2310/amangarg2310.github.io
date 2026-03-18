# ScoutAI Deployment Guide

## Deploying to scoutaiapp.com with Render

### Prerequisites
- GitHub account
- Render account (free tier works)
- Domain scoutaiapp.com (you already have this)
- All API keys ready (OpenAI, Apify)

### Step 1: Push Code to GitHub

Your code is already connected to GitHub. Make sure the latest changes are pushed:

```bash
cd /Users/amangarg2310/Documents/amangarg2310.github.io/outlier-content-engine
git add .
git commit -m "Add deployment configuration for Render"
git push origin master
```

### Step 2: Create Render Account & Deploy

1. Go to [https://render.com](https://render.com) and sign up with your GitHub account
2. Click "New +" → "Web Service"
3. Connect your GitHub repository: `amangarg2310/amangarg2310.github.io`
4. Configure the service:
   - **Name**: `scoutai`
   - **Root Directory**: `outlier-content-engine`
   - **Environment**: Python 3
   - **Build Command**: `pip install -r requirements.txt && python database_migrations.py`
   - **Start Command**: `gunicorn dashboard:app --bind 0.0.0.0:$PORT --timeout 300 --workers 2`
   - **Plan**: Free (or paid if you need always-on)

### Step 3: Add Environment Variables

In Render dashboard, go to Environment tab and add these variables:

**Required:**
- `OPENAI_API_KEY` - Your OpenAI API key
- `APIFY_API_TOKEN` - Your Apify API token (Instagram + TikTok)
- `FLASK_SECRET_KEY` - Generate with: `python -c "import secrets; print(secrets.token_hex(32))"`

**Optional (for full features):**
- `IG_GRAPH_ACCESS_TOKEN` - Instagram Graph API (own channel)
- `EMAIL_ADDRESS` - Gmail for sending reports
- `EMAIL_APP_PASSWORD` - Gmail app password
- `EMAIL_RECIPIENTS` - Comma-separated emails
- `GOOGLE_CLIENT_ID` - Google OAuth (from GOOGLE_AUTH_SETUP.md)
- `GOOGLE_CLIENT_SECRET` - Google OAuth secret
- `ACTIVE_VERTICAL` - Default vertical name (e.g., "Streetwear")

### Step 4: Add Persistent Disk (Important!)

Your SQLite database needs persistent storage:

1. In Render dashboard, go to "Disks" tab
2. Add a new disk:
   - **Name**: `scoutai-data`
   - **Mount Path**: `/opt/render/project/src/data`
   - **Size**: 1 GB (free tier)

### Step 5: Connect Your Domain

1. In Render dashboard, go to "Settings" → "Custom Domain"
2. Add `scoutaiapp.com` and `www.scoutaiapp.com`
3. Render will provide DNS records (A and CNAME records)
4. Go to your domain registrar (where you bought scoutaiapp.com)
5. Add the DNS records Render provides:
   - **A Record**: `@` points to Render's IP
   - **CNAME Record**: `www` points to your Render URL

**DNS Records (typical Render setup):**
```
Type: A
Name: @
Value: 216.24.57.1 (Render's IP - check dashboard for exact value)

Type: CNAME
Name: www
Value: scoutai.onrender.com (your Render URL)
```

### Step 6: Wait for Deployment

- Render will automatically deploy when you push to GitHub
- First deployment takes 5-10 minutes
- SSL certificate (HTTPS) is automatically provisioned
- DNS propagation can take up to 48 hours (usually much faster)

### Step 7: Update Google OAuth Redirect URI

If using Google login, update your OAuth redirect URIs:

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Edit your OAuth 2.0 Client ID
3. Add authorized redirect URIs:
   - `https://scoutaiapp.com/auth/google/callback`
   - `https://www.scoutaiapp.com/auth/google/callback`

### Testing Your Deployment

Once deployed, visit:
- https://scoutaiapp.com (primary domain)
- https://www.scoutaiapp.com (www subdomain)
- https://scoutai.onrender.com (Render default URL)

### Monitoring & Logs

- **Logs**: Render dashboard → "Logs" tab
- **Metrics**: Render dashboard → "Metrics" tab
- **Database**: Download from "Disks" tab if needed

### Updating Your App

Just push to GitHub:
```bash
git add .
git commit -m "Update feature X"
git push origin master
```

Render auto-deploys on every push to master branch.

### Cost Breakdown

**Free Tier (Render):**
- Web service sleeps after 15 min inactivity
- 750 hours/month free
- 1 GB disk storage
- Automatic HTTPS

**Paid Tier ($7/month recommended):**
- Always on (no sleep)
- Better performance
- More disk storage options

### Troubleshooting

**App won't start:**
- Check logs in Render dashboard
- Verify all environment variables are set
- Ensure disk is mounted correctly

**Domain not working:**
- Wait up to 48 hours for DNS propagation
- Check DNS records with: `dig scoutaiapp.com`
- Verify DNS records match Render's requirements

**Database missing:**
- Ensure disk is mounted to `/opt/render/project/src/data`
- Check that `database_migrations.py` ran during build

**Google OAuth failing:**
- Verify redirect URIs include production domain
- Check `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set

### Alternative: Railway.app

If Render doesn't work, try Railway:

1. Go to [https://railway.app](https://railway.app)
2. Deploy from GitHub
3. Add environment variables
4. Connect domain in Railway settings
5. Similar process, different platform

---

**Support Resources:**
- Render Docs: https://render.com/docs
- Railway Docs: https://docs.railway.app
- Your project README: See CLAUDE.md for technical details
