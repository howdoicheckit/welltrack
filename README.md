# Wellness Tracker

Single-patient daily health monitoring app.

**Frontend:** GitHub Pages → `howdoicheckit.github.io/welltrack`  
**Backend:** Express API on DigitalOcean Droplet  
**Side effects:** openFDA (free, no API key)  
**Security:** CORS origin lock + API key header (no user auth)

## Setup

### 1. Generate an API key

```bash
node -e "console.log(crypto.randomUUID())"
```

Save this — you'll use the same key in both places.

### 2. Backend (Droplet)

SSH into your Droplet and run:

```bash
# Clone and build
git clone https://github.com/howdoicheckit/welltrack.git
cd welltrack
docker build -t welltrack-api .

# Run (replace YOUR_API_KEY)
docker run -d --name welltrack-api \
  -p 127.0.0.1:3001:3001 \
  -v /opt/welltrack-data:/app/data \
  -e API_KEY=YOUR_API_KEY \
  -e ALLOWED_ORIGIN=https://howdoicheckit.github.io \
  --restart unless-stopped \
  welltrack-api
```

Set up Caddy for HTTPS (replace `api.yourdomain.com`):

```
# /etc/caddy/Caddyfile
api.yourdomain.com {
    reverse_proxy localhost:3001
}
```

```bash
sudo systemctl restart caddy
```

### 3. Frontend (GitHub Pages)

In your repo **Settings → Secrets and variables → Actions**, add:

| Secret | Value |
|---|---|
| `VITE_API_URL` | `https://api.yourdomain.com` (your Droplet's HTTPS URL) |
| `VITE_API_KEY` | Same API key from step 1 |

Then in **Settings → Pages**, set source to **GitHub Actions**.

Push to `main` — the workflow builds and deploys automatically.

### 4. Local development

```bash
cp .env.example .env
# Edit .env with your API URL and key
npm install
npm run dev
```

## Data management

Export/import is in the History tab (bottom). Use before redeployments.

## Architecture

```
Browser (GitHub Pages)
  ↓ HTTPS + x-api-key header
Droplet (Express API)
  ├── /api/data         GET/PUT patient data (JSON file)
  ├── /api/side-effects POST → openFDA
  └── /api/health       GET health check
```

Security: CORS allows only `howdoicheckit.github.io`. Every request requires a matching `x-api-key` header. The key is baked into the frontend at build time via GitHub Actions secrets and is not committed to the repo.
