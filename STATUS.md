# Project Status

## Last Updated: 2026-03-09
## Repo: https://github.com/tjlark23/roastd
## Live URL: https://roastdai.com (also roastd-ecru.vercel.app)
## Stack: Static HTML + Vercel Serverless + Claude + Gemini + Sharp + Stripe

## Current State
- Working: Full roast flow (upload → analyze → generate → display → download)
- Working: Stripe payment flow (3-pack $3, 10-pack $7)
- Working: Rate limiting (3 free/day per IP + localStorage)
- Working: Debug bypass (?debug=roastd2026)
- Working: Domain roastdai.com connected via Vercel
- Working: Share buttons (X, LinkedIn)
- Issue: Comedy quality inconsistent — prompt needs ongoing tuning
- Issue: Gemini handwriting style varies between runs (sometimes too clean, sometimes garbled)
- Issue: Gemini occasionally adds unwanted watermark stamps despite instructions not to
- Issue: No og:image meta tag (social preview won't show image)
- Issue: No favicon
- Issue: No analytics installed
- Missing: TJ footer / calling card

## Last Session (2026-03-09)
- Rewrote Claude comedy prompt multiple times (v5 through v5.3)
- Switched between Gemini models (Flash → Pro → Nano Banana 2)
- Built Sharp-based white frame compositing (40% side padding)
- Added Stripe integration (products, checkout, verification)
- Added rate limiting + debug bypass
- Removed broken SVG watermark code
- Added Build Bible compliance docs (README, STATUS, DECISIONS)

## Architecture Notes
- Single HTML file frontend (public/index.html) — all CSS/JS inline
- Three serverless functions in api/ directory
- Sharp does image framing server-side before sending to Gemini
- Credits tracked client-side in localStorage (no database)
- Stripe sessions verified server-side to prevent credit spoofing

## Next Steps
- [ ] Add og:image for social sharing previews
- [ ] Add favicon
- [ ] Add analytics (Fathom or Plausible)
- [ ] Build and add TJ footer/calling card
- [ ] Continue tuning comedy prompt
- [ ] Test across all 10 categories (only LinkedIn tested heavily)
- [ ] Test payment flow end-to-end with real card

## Known Issues
- Gemini image generation is inherently unpredictable — layout and handwriting quality varies
- In-memory rate limiting resets on Vercel cold starts (acceptable for V1)
- Debug bypass key is hardcoded (low risk, change if needed)
