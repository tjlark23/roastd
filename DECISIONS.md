# Architecture Decisions

## 2026-03-09: Image Generation Approach
**Decision:** Use Sharp for frame layout + Gemini for handwriting annotations
**Why:** Gemini cannot reliably create precise layouts from scratch. Sharp guarantees consistent frame sizing. Gemini only handles the creative part (handwriting, arrows, sketches).

## 2026-03-09: No Database for V1
**Decision:** Track credits in localStorage, verify payments via Stripe API
**Why:** Speed to ship. No user accounts needed. Stripe sessions provide server-side verification. Can add Supabase later if needed.

## 2026-03-09: Claude Sonnet 4.5 for Comedy
**Decision:** Use Sonnet over Opus for roast writing
**Why:** Opus was too slow (10-20 second response times). Sonnet is fast enough for real-time UX. Comedy quality difference is minimal.

## 2026-03-09: Gemini Model Selection
**Decision:** Using Nano Banana 2 (gemini-3.1-flash-image-preview)
**Why:** Tested Nano Banana (2.5-flash), Nano Banana Pro (3-pro-image-preview), and Nano Banana 2 (3.1-flash). Pro was inconsistent with layout rules on complex images. Nano Banana 2 follows instructions most reliably.

## 2026-03-09: Free Tier Strategy
**Decision:** 3 free roasts per day, then paywall ($3/3-pack, $7/10-pack)
**Why:** Free first roast maximizes virality and shareability. Low price point ($1/roast) is an impulse buy. Cost per roast ~$0.10-0.15 means strong margins.

## 2026-03-09: Single HTML File Frontend
**Decision:** Everything in one index.html file
**Why:** Simple deployment, no build step, fast iteration. Can refactor to React/Next.js later if the project grows.

## 2026-04-28: Migrated image generation from Gemini to OpenAI gpt-image-1
**Decision:** Replaced Gemini Nano Banana 2 with OpenAI gpt-image-1 (`/v1/images/edits` endpoint) for the annotation step. Sharp pipeline still produces a square 1024x1024 white-framed canvas; OpenAI only paints the handwritten annotations on top.
**Why:** Gemini consistently failed on layout, garbled handwriting, and unwanted watermarks despite ~6 prompt revisions. Manual ChatGPT testing showed gpt-image-1 produces dramatically better handwriting, zone placement, and instruction-following. Cost ~$0.18/roast at quality=high vs ~$0.10 with Gemini — still well inside the $0.50/roast ceiling and well under the $1/roast paid revenue.
