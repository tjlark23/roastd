# Roastd.ai — Cloudflare Pages Deployment Guide

## Project Structure

```
roastd/
├── index.html              ← Frontend (static, served by Pages)
├── _redirects              ← Cloudflare routing
└── functions/
    └── api/
        └── roast.js        ← Backend Worker function (POST /api/roast)
```

## How It Works

- Cloudflare Pages serves `index.html` as the static frontend
- The `functions/` directory automatically creates Cloudflare Workers
- `functions/api/roast.js` becomes the endpoint `POST /api/roast`
- No build step needed — it's all vanilla HTML/JS + a Worker function

## Deploy Steps

### 1. Create GitHub Repo
- Go to github.com → New Repository → name it `roastd`
- Upload all 3 files maintaining the folder structure above

### 2. Connect to Cloudflare Pages
- Go to dash.cloudflare.com → Pages → Create a project
- Connect your GitHub account → Select the `roastd` repo
- Build settings:
  - **Framework preset**: None
  - **Build command**: (leave empty)
  - **Build output directory**: `/` (just the root)
- Click "Save and Deploy"

### 3. Add Environment Variables
- In Cloudflare Pages → your project → Settings → Environment variables
- Add these for **Production** (and Preview if you want):

| Variable | Value |
|----------|-------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key (sk-ant-...) |
| `GOOGLE_API_KEY` | `AIzaSyDDaiO511War1ZgpQUQI9WK1r9Hr216Y84` |

- **Encrypt** both values (toggle the lock icon)
- Redeploy after adding variables

### 4. Connect Domain
- In Cloudflare Pages → your project → Custom domains
- Add `roastd.ai`
- If domain is already on Cloudflare DNS, it'll configure automatically

## Models Used

| Model | ID | Purpose |
|-------|-----|---------|
| Claude Opus 4.6 | `claude-opus-4-6` | Analyzes image, writes roast copy |
| Nano Banana 2 | `gemini-3.1-flash-image-preview` | Generates annotated image with hand-drawn red marker roasts |

## Cost Per Roast

- Claude Opus 4.6 vision: ~$0.02-0.05
- Nano Banana 2 image gen: ~$0.07
- **Total: ~$0.10-0.12 per roast**

## Troubleshooting

- **Function not working**: Make sure the file path is exactly `functions/api/roast.js`
- **API key errors**: Check environment variables are set in Cloudflare Pages settings (not wrangler.toml)
- **CORS issues**: Cloudflare Pages Functions on the same domain don't have CORS issues
- **Deploy shows wrong commit**: Check Cloudflare Pages deploy log for the commit hash — sometimes GitHub upload creates issues
- **Gemini returns no image**: The model sometimes returns text-only. The error handling will catch this and tell the user to retry.
