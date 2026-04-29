# Session 2026-04-29 — OpenAI gpt-image-1 migration

## Summary
Replaced the Gemini Nano Banana 2 image annotation step in `/api/roast` with OpenAI gpt-image-1 (`/v1/images/edits`). Fixed a Sharp pipeline bug that broke every real phone upload, bumped the function timeout, and shipped to production at roastdai.com.

**Branch:** feature-openai-migration → merged to main as `6fc072e`
**Status:** Live on production. Smoke test verified at https://roastdai.com.

## What was done

### 1. The migration itself
- Swapped Gemini call (lines ~272–362 of api/roast.js) for an OpenAI multipart `fetch` to `https://api.openai.com/v1/images/edits` using Node-native `FormData` + `Blob` (no new SDK dependency).
- Reused the existing Gemini prompt structure (zone instructions, handwriting style, banned list) and prepended a "preserve the photo, do not redraw" directive at the top.
- Added `OPENAI_API_KEY` to the env-var check; left `GOOGLE_API_KEY` removed from the code path but kept in Vercel for rollback.
- Set `quality: high`, `size: 1024x1024`, `output_format: png`, `moderation: low`.
- Bumped `package.json` to 4.3.0.

### 2. Sharp framing rework
**Before:** `create longer*1.8 canvas → composite imgBuffer → resize 1024 → png`
**After:** `resize imgBuffer to ~569px longer side → create 1024 canvas → composite resized → png`

Added `.rotate()` (no args) so EXIF orientation flags on iPhone photos are respected. The new ordering also keeps memory bounded — a 5000×3000 input no longer briefly allocates a 9000×9000 RGBA buffer.

### 3. Function timeout bump
`maxDuration` raised from 60s → 90s. Pro plan supports up to 300s, so 90s gives 30s of headroom. OpenAI gpt-image-1 typically takes 47–55s but tail cases push past 60s.

## Files touched
- `api/roast.js` — core migration + Sharp fix + timeout bump
- `package.json` — version bump to 4.3.0
- `DECISIONS.md` — five new entries (migration, quality tier, moderation, Sharp framing, timeout)
- `STATUS.md` — full rewrite of "Last Session" + stack + state
- `KNOWN-ISSUES.md` — created (latency, duplicate jokes, cold starts, rate limit, debug key)

## The Sharp bug — root cause
Vercel runtime logs on the first preview deploy showed `Error: Image to composite must have same dimensions or smaller at Sharp.toBuffer (api/roast.js:268)` on every real upload. Local testing only used a 400×400 headshot, which fits inside 1024×1024, so the bug was invisible during local A/B testing.

The chain `create canvas(W,H) → composite(input, ...) → resize(1024,1024) → toBuffer()` was getting evaluated by Sharp as a composite-against-1024 check. Inputs wider or taller than 1024px in any dimension hard-failed. Real phone photos and screenshots are always 1170+ on at least one side, so production would have been broken on essentially every upload.

The fix (resize first, then composite into a fixed canvas) sidesteps the check entirely and is also more memory-efficient.

## The moderation false-positive
First non-headshot smoke test (gym × Jewish Mom) was rejected by OpenAI's safety system with a generic "Your request was rejected" error. Setting `moderation: 'low'` on the request resolved it. Roastd is an insult product by design — false-positive blocks are a UX killer. The `low` tier still enforces the actual safety floor.

## Trade-offs and surprises

- **Latency went up.** ~15-20s with Gemini → 47-59s with gpt-image-1. There's no way around this — the model is just slower at high quality. Acceptable because handwriting quality is dramatically better.
- **Cost went up.** ~$0.10/roast → ~$0.18/roast. Still inside the $0.50/roast ceiling and well under the $1/roast paid revenue.
- **Vercel CLI 51 had a real bug** with `vercel env add ... preview --value ... --yes` — wouldn't accept the args without a specific git branch. CLI 52 was no better. Worked around by adding the env var with a specific branch name (which required the branch to exist on GitHub first, so chicken-and-egg sorted by pushing first).
- **Two clones of the same repo on disk.** Started editing `/Users/TJ/roastd` (a stale duplicate); TJ corrected to `/Users/TJ/ai-projects/roastd` (the canonical one). Migrated the in-progress branch via patch-and-apply.
- **Vercel preview is SSO-protected** by default for this project. Created a temporary Protection Bypass for Automation key to run scripted curls past the auth wall during verification. Revoked after.

## Verification matrix (preview deploy `cb9e942`)
All five passed end-to-end with synthetic test images sized like real screenshots:

| Combo | Time | Headline |
|---|---|---|
| LinkedIn × Boomer Dad | 47.8s | Chief Synergy Evangelist: Neither Chief, Synergy, nor Employed |
| Dating × Aussie Bogan | 59.4s | 32 and still writing bios like a year 10 dropout |
| Selfie × Asian Parent | 59.2s | Your parents wanted grandchildren. Got hard-boiled disappointment instead. |
| Gym × Samuel L Jackson | 49.8s | Flexing so hard the image had to censor it |
| Resume × Shakespeare | 51.3s | Three generations hath failed to produce employable offspring |

Production smoke test (selfie × aussie at https://roastdai.com): PASS in 63.4s, 1.6 MB PNG, valid `roastData`.

## Known issues out of this session
Captured in `KNOWN-ISSUES.md`:
- 47-59s latency
- Occasional duplicate joke on canvas
- Pre-existing: cold-start jitter, in-memory rate-limit resets, hardcoded debug key

## Rollback
Gemini code path is gone from `api/roast.js`. To revert: `git revert 6fc072e` (the merge commit), push to main. `GOOGLE_API_KEY` is still in Vercel env vars from before, so the old path would work immediately on a revert if we ever needed it.
