# Roastd AI

Upload any screenshot. Pick who roasts you. Get destroyed in seconds.

## Stack
- Frontend: Static HTML/CSS/JS
- Backend: Vercel Serverless Functions (Node.js)
- AI: Claude Sonnet 4.5 (comedy writing) + Gemini 3.1 Flash Image / Nano Banana 2 (image generation)
- Image Processing: Sharp (white frame compositing)
- Payments: Stripe Checkout
- Deployment: Vercel (auto-deploy from GitHub main)

## Live URL
- https://roastdai.com
- https://roastd-ecru.vercel.app (Vercel default)

## Environment Variables (Vercel)
- `ANTHROPIC_API_KEY` — Claude API key
- `GOOGLE_API_KEY` — Google Gemini API key
- `STRIPE_SECRET_KEY` — Stripe secret key (Roastd AI account under Local Media HQ org)

## How It Works
1. User uploads screenshot, picks category + roast style
2. Frontend sends base64 image to `/api/roast`
3. Claude Sonnet 4.5 analyzes image, writes roast jokes as JSON
4. Sharp creates white-framed canvas with photo centered (40% side padding)
5. Gemini Nano Banana 2 writes handwritten annotations on the framed image
6. Result returned to frontend for display/download

## Pricing
- 3 free roasts per day per user (IP + localStorage tracking)
- 3-pack: $3 (price_1T6GXzD93Ym1rVftjMTUXCm7)
- 10-pack: $7 (price_1T6GY5D93Ym1rVftfwYvhxdL)
- Cost per roast: ~$0.10-0.15

## Testing
Add `?debug=roastd2026` to URL to bypass rate limits and paywall.

## Repo Structure
```
roastd/
├── README.md
├── STATUS.md
├── DECISIONS.md
├── api/
│   ├── roast.js        # Main roast endpoint (Claude + Sharp + Gemini)
│   ├── checkout.js     # Stripe Checkout session creator
│   └── verify.js       # Stripe payment verification
├── public/
│   └── index.html      # Full frontend (single file)
├── package.json
└── vercel.json
```
