# Deployment Guide — WebLingo to Public IP (http://117.102.26.14)

## Prerequisites on the Server
- Node.js 18+ (LTS recommended)
- PostgreSQL 15+ (running, accessible)
- (Optional) LibreTranslate for neural MT quality

## Option A: Full Project Deploy (Recommended)

### 1. Upload the project
Upload the entire project folder (excluding `node_modules`, `.next`, `.env`) to the server:
```
/var/www/weblingo/   (or C:\inetpub\weblingo\ on Windows)
```

### 2. Install dependencies
```bash
cd /var/www/weblingo
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
nano .env   # Edit with your values:
```
```
NODE_ENV=production
APP_URL=http://117.102.26.14
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/weblingo
JWT_SECRET=your-64-char-random-secret
COOKIE_SECURE=false
LIBRETRANSLATE_URL=http://127.0.0.1:5000   # optional
```

### 4. Set up database
```bash
npm run db:push    # Creates all 13 tables
npm run db:seed    # Seeds demo data
```

### 5. Build and start
```bash
npm run build
npm run start       # Starts on port 3000
```

### 6. (Optional) Start LibreTranslate
```bash
pip install libretranslate
libretranslate --host 0.0.0.0 --port 5000
```

### 7. Configure reverse proxy (if needed)
If you want WebLingo on port 80 instead of 3000, use nginx/Apache:
```
# nginx example:
server {
    listen 80;
    server_name 117.102.26.14;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Option B: Standalone Deploy (No npm install needed)

The `.next/standalone/` directory contains a pre-built server with all dependencies.

### 1. Upload standalone directory
Upload `.next/standalone/` contents to the server:
```
/var/www/weblingo/
├── server.js
├── package.json
├── .env
├── .next/
├── public/
└── node_modules/
```

### 2. Configure .env on server
Edit `.env` with production values (see Step 3 above).

### 3. Set up database (need drizzle-kit)
```bash
npm install -g drizzle-kit tsx
cd /var/www/weblingo
npx drizzle-kit push
npx tsx src/db/run-seed.ts   # Need src/ folder too
```
Note: For standalone, you also need `src/` folder for seed scripts. Or run seed from your dev machine pointing at the production DB.

### 4. Start server
```bash
node server.js
# Or with PM2 for persistence:
pm2 start server.js --name weblingo
```

## Accessing the App
- Dashboard: `http://117.102.26.14:3000/` (or port 80 with reverse proxy)
- Client demo: `http://117.102.26.14:3000/client-demo`
- Health check: `http://117.102.26.14:3000/api/health`
- Widget: `http://117.102.26.14:3000/widget.js`

## Template Site Deployment
Upload the `public/demo/` folder contents to your shared hosting:
```
public_html/taha/weblingo/
├── index.html
├── about.html
├── services.html
├── products.html
├── blog.html
├── contact.html
├── faq.html
├── privacy.html
└── widget.js   (copy from WebLingo server)
```

Then:
1. Open `http://117.102.26.14/taha/weblingo/index.html` in browser
2. In WebLingo dashboard, create a project with base URL `http://117.102.26.14/taha/weblingo/`
3. Add `117.102.26.14` to allowed domains
4. Translate the site (single page or whole website)
5. Copy the generated script tag
6. Paste into the template's `<head>` section
7. Re-upload and test

## Important Notes
- `.env` is gitignored — create it on the server
- `NODE_ENV=production` disables dev-mode SSRF bypass (localhost blocked in production)
- `COOKIE_SECURE=false` for HTTP (set to `true` if using HTTPS)
- LibreTranslate is optional — falls back to MyMemory if unavailable
- The widget.js can be served from the same origin as the template (no PNA issues)
