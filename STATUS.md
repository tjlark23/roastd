# Project Status

## Last Updated: 2026-04-29
## Repo: https://github.com/tjlark23/roastd
## Live URL: https://roastdai.com (also roastd-ecru.vercel.app)
## Stack: Static HTML + Vercel Serverless + Claude Sonnet 4.5 + OpenAI gpt-image-1 + Sharp + Stripe

## Current State
- Working: Full roast flow (upload → analyze → generate → display → download)
- Working: OpenAI gpt-image-1 image annotation (replaced Gemini Apr 29)
- Working: Stripe payment flow (3-pack $3, 10-pack $7)
- Working: Rate limiting (3 free/day per IP + localStorage)
- Working: Debug bypass (?debug=roastd2026)
- Working: Domain roastdai.com connected via Vercel
- Working: Share buttons (X, LinkedIn)
- Working: og:image, favicon, footer (shipped earlier in April)
- Issue: Roast generation now takes 47-59s (was ~15-20s with Gemini) — function timeout bumped to 90s
- Issue: OpenAI occasionally duplicates a single joke on the same canvas (cosmetic, low frequency)
- Issue: Comedy quality still inconsistent — Claude prompt needs ongoing tuning (separate from this migration)
- Issue: No analytics installed

## Last Session (2026-04-29)
- Migrated `/api/roast` image step from Gemini Nano Banana 2 → OpenAI gpt-image-1 (`/v1/images/edits`)
- Reworked Sharp framing to resize source first, then composite into fixed 1024×1024 canvas (fixes "composite must be same dimensions or smaller" on every real phone upload)
- Added `.rotate()` so EXIF orientation is respected
- Set OpenAI `quality: high` (env-overridable), `moderation: 'low'`
- Bumped function `maxDuration` 60s → 90s to absorb OpenAI tail latency
- Verified 5/5 matrix combos on preview, smoke-tested production at roastdai.com
- Merge commit: `6fc072e`

## Architecture Notes
- Single HTML file frontend (public/index.html) — all CSS/JS inline
- Three serverless functions in api/ directory
- Sharp resizes the upload to ~569px longer side, then composites centered on a 1024×1024 white canvas before sending to OpenAI
- OpenAI gpt-image-1 paints handwritten annotations on top of the framed canvas
- Credits tracked client-side in localStorage (no database)
- Stripe sessions verified server-side to prevent credit spoofing

## Next Steps
- [ ] Add analytics (Fathom or Plausible)
- [ ] Continue tuning Claude comedy prompt — currently ~5-6/10, target 8/10
- [ ] Consider a more patient-feeling loading state in the frontend (47-59s wait now)
- [ ] Test payment flow end-to-end with real card
- [ ] Investigate duplicate-joke issue — may be a prompt structure thing or OpenAI quirk
- [ ] Watch OpenAI bill for first week to confirm ~$0.18/roast estimate

## Known Issues
- See KNOWN-ISSUES.md
