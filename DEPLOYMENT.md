# Deployment Guide — Jungle Raj

Jungle Raj is a pure static website with no build step. Any static host works.

---

## GitHub Pages

```bash
# 1. Push to GitHub
git init && git add . && git commit -m "Initial commit"
git remote add origin https://github.com/your-org/jungleraj.git
git push -u origin main

# 2. In GitHub Settings → Pages → Source: Deploy from branch → main / root
# Your site will be live at: https://your-org.github.io/jungleraj/

# 3. If deploying to a subdirectory, update service-worker.js CACHE paths
#    and api.js jrDataPath() to reflect the subdirectory prefix.
```

**Custom domain:** Add a `CNAME` file containing `jungleraj.in` to the project root.

---

## Netlify (recommended)

```bash
# 1. Push to GitHub/GitLab
# 2. New site from Git → select repo
# 3. Build command: (leave blank)
# 4. Publish directory: . (root)
# Done — automatic deploys on push.
```

Netlify `_headers` file (create at root):
```
/*
  X-Frame-Options: DENY
  X-XSS-Protection: 1; mode=block
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(self), geolocation=()
  Content-Security-Policy: default-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com https://cdn.jsdelivr.net; script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none';
```

---

## Vercel

```bash
# 1. vercel login
# 2. vercel (from project root)
# Framework preset: Other
# Output directory: . (root, same as src)
```

`vercel.json`:
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    }
  ]
}
```

---

## Self-hosted (Nginx)

```nginx
server {
  listen 80;
  server_name jungleraj.in www.jungleraj.in;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name jungleraj.in;
  root /var/www/jungleraj;
  index index.html;

  # Gzip
  gzip on; gzip_types text/html text/css application/javascript application/json;

  # Cache static assets
  location ~* \.(css|js|json|woff2|svg|png)$ {
    expires 7d; add_header Cache-Control "public, immutable";
  }

  # HTML — no cache (data may update)
  location ~* \.html$ {
    expires 0; add_header Cache-Control "no-cache";
  }

  # SPA fallback → custom 404
  error_page 404 /pages/404.html;

  # Security headers
  add_header X-Frame-Options DENY;
  add_header X-Content-Type-Options nosniff;
  add_header Referrer-Policy strict-origin-when-cross-origin;
}
```

---

## Refreshing Data

After running the Python crawler to update JSON files, simply redeploy (or just push the updated `data/*.json` files). No rebuild required.

```bash
cd tools && python crawler.py all
# Then commit data/*.json and push
```
