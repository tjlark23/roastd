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
**Note:** Supersedes the 2026-03-09 "Image Generation Approach" entry (Gemini for handwriting). That decision still describes WHY we use Sharp for layout — only the annotator changed.

## 2026-04-29: OpenAI quality tier set to `high`
**Decision:** Always send `quality: high` to gpt-image-1 (env-overridable via `OPENAI_IMAGE_QUALITY`).
**Why:** Side-by-side A/B at `high` vs `medium` showed `medium` produced visibly garbled handwriting ("Smile'rh s big", "grow nair", "in luencer") that kills the joke when screenshot-shared. `high` is ~$0.17/image vs `medium` ~$0.04, but still inside the cost ceiling and far below per-roast revenue. Env var lets us flip later without a code change if quality at lower tiers improves.

## 2026-04-29: OpenAI moderation set to `low`
**Decision:** Pass `moderation: 'low'` to the gpt-image-1 edits call.
**Why:** Default moderation rejected legitimate roast content (e.g. gym × Jewish Mom on a normal headshot returned "Your request was rejected by the safety system"). Roastd is an insult product by design — false-positive blocks are a UX killer. `low` keeps OpenAI's safety floor in place for actual harm but stops blocking ordinary edginess.

## 2026-04-29: Sharp framing — resize source first, then composite
**Decision:** Resize the user's upload so its longer side is ~569px BEFORE compositing onto the fixed 1024×1024 canvas. Apply `.rotate()` (no args) so EXIF orientation is respected.
**Why:** The previous chain (`create longer*1.8 canvas → composite → resize 1024`) hit Sharp's "Image to composite must have same dimensions or smaller" error on every input larger than 1024px in any dimension — i.e., every real phone photo and screenshot. The new order avoids the error AND keeps memory bounded (no longer allocates a 9000×9000 RGBA buffer for big inputs). `.rotate()` keeps portrait phone shots from being composited sideways.

## 2026-04-29: Roast function `maxDuration` bumped from 60s to 90s
**Decision:** `export const config = { maxDuration: 90 }` in api/roast.js.
**Why:** OpenAI gpt-image-1 at `quality: high` typically completes in 47–55s but tail cases push past 60s and tripped `FUNCTION_INVOCATION_TIMEOUT` once during verification (60.3s). Pro plan supports up to 300s, so 90s gives 30s of headroom without changing the user-facing happy path.
