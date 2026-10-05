# Production Deployment Guide (Phase 17)

This document provides step-by-step instructions to deploy **Personal Cash Flow Tracker** to production with HTTPS, custom domain, and secure database connections.

---

## 1. Pre-Flight Checklist

Before deploying, prepare the following:

- [ ] **Domain Name**: Point your DNS A record (e.g., `cashflow.yourdomain.com`) to your server's public IP.
- [ ] **MongoDB Database**: Either MongoDB Atlas cluster or a self-hosted MongoDB instance (v6+).
- [ ] **SSL / HTTPS**: Let's Encrypt Certbot SSL certificate (mandatory for PWA installation & secure cookies).
- [ ] **JWT Secret**: Generate a cryptographically secure random secret:
  ```bash
  openssl rand -base64 48
  ```

---

## 2. Deployment Options

### Option A: VPS Deployment (Ubuntu / Debian + Node.js + PM2 + Nginx)

#### Step 1: Install Node.js 20+ and PM2
```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx certbot python3-certbot-nginx

# Install PM2 globally
sudo npm install -g pm2
```

#### Step 2: Clone Repository & Install Dependencies
```bash
# Clone to /var/www
sudo mkdir -p /var/www/personal-finance
sudo chown -R $USER:$USER /var/www/personal-finance
git clone <your-repo-url> /var/www/personal-finance
cd /var/www/personal-finance

# Install production dependencies
npm install --omit=dev --prefix server
```

#### Step 3: Configure Environment Variables
```bash
cp .env.production.example .env
nano .env
```
Fill in your production values:
```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/personal_finance?retryWrites=true&w=majority
JWT_SECRET=your_generated_secret_key
FRONTEND_URL=https://yourdomain.com
COOKIE_SECURE=true
```

#### Step 4: Start Application with PM2
```bash
# Start cluster with PM2
pm2 start ecosystem.config.js --env production

# Ensure PM2 restarts on server reboot
pm2 save
pm2 startup
```

#### Step 5: Configure Nginx & Let's Encrypt SSL
1. Copy `nginx.conf` to `/etc/nginx/sites-available/cashflow`:
   ```bash
   sudo cp nginx.conf /etc/nginx/sites-available/cashflow
   sudo nano /etc/nginx/sites-available/cashflow  # Replace yourdomain.com with your actual domain
   sudo ln -s /etc/nginx/sites-available/cashflow /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```
2. Obtain SSL Certificate:
   ```bash
   sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
   ```

---

### Option B: Docker Compose Deployment

1. On your VPS with Docker & Docker Compose installed:
   ```bash
   git clone <your-repo-url>
   cd personal-finance-tracker
   cp .env.production.example .env
   # Edit .env with your production values
   nano .env
   ```
2. Build and launch:
   ```bash
   docker compose up -d --build
   ```
3. Verify running containers:
   ```bash
   docker compose ps
   docker compose logs -f app
   ```

---

### Option C: Cloud PaaS (Render / Railway / DigitalOcean App Platform)

1. **Root Directory**: `./`
2. **Build Command**: `cd server && npm ci --omit=dev`
3. **Start Command**: `node server/server.js`
4. **Environment Variables**:
   - `NODE_ENV`: `production`
   - `PORT`: `5000` (or injected `$PORT`)
   - `MONGODB_URI`: `<Atlas Connection String>`
   - `JWT_SECRET`: `<Secure Random Secret>`
   - `FRONTEND_URL`: `https://<your-app-domain>`
   - `COOKIE_SECURE`: `true`

---

### Option D: Vercel Deployment

1. **Push your code to GitHub** (already configured with `vercel.json` and `api/index.js`).
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → Import your `PAW` repository.
3. Configure **Project Settings**:
   - **Framework Preset**: `Other`
   - **Root Directory**: `./` (leave default)
4. Add **Environment Variables** in the Vercel Dashboard:
   - `NODE_ENV`: `production`
   - `MONGODB_URI`: `mongodb+srv://<user>:<password>@cluster0.dozji1l.mongodb.net/?appName=Cluster0`
   - `JWT_SECRET`: `<your_long_random_jwt_secret>`
   - `FRONTEND_URL`: `https://<your-vercel-domain>.vercel.app`
   - `COOKIE_SECURE`: `true`
5. Click **Deploy**. Vercel will build and assign an HTTPS URL with auto SSL and global CDN.

---


## 3. Post-Deployment Verification Checklist (PRD §59 Phase 17 & §62)

Test each of the following flows on the live URL:

- [ ] **Health Endpoint**: Visit `https://yourdomain.com/api/health` — returns `{ "status": "ok", "db": "connected" }`.
- [ ] **Registration & Login**: Create a user, verify authentication cookie is set with `HttpOnly` and `Secure`.
- [ ] **Opening Balance**: Set starting balance in Settings and verify it reflects in Dashboard.
- [ ] **Transaction CRUD**: Add income, add expense, edit transaction, delete transaction.
- [ ] **Balance Calculation**: Verify balance formula `Current = Opening + Total Income - Total Expenses`.
- [ ] **Reports**: View Monthly summary, Category breakdown, and Custom date ranges.
- [ ] **PWA Installation**: Open on mobile Safari / Chrome → Share / Menu → "Add to Home Screen". Verify standalone launch.
- [ ] **Data Backup**: Export CSV, Export JSON, and test JSON import.
