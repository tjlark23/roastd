# Known Issues

## Roast generation latency: 47-59s end-to-end
- **Since:** 2026-04-29 (OpenAI gpt-image-1 migration)
- **Cause:** OpenAI gpt-image-1 at `quality: high` is just slow. Nothing we control on our side.
- **Mitigation:** Function `maxDuration` is 90s, so requests don't time out under normal conditions.
- **UX impact:** Users wait noticeably longer than the old Gemini path (~15-20s). The frontend loading state should be patient — consider adding a "this can take up to a minute" hint or a fake-progress animation if it becomes a complaint driver.
- **Cost-tier alternative:** `quality: medium` is faster (~33s) and ~75% cheaper but produces visibly garbled handwriting. Not viable today. Re-test if OpenAI improves the medium tier.

## OpenAI occasionally duplicates one of the joke annotations on a single canvas
- **Since:** 2026-04-29
- **Cause:** OpenAI gpt-image-1 quirk — sometimes treats one of the four frame jokes as if it were two and writes it in two different positions.
- **Frequency:** Low — observed on 1 of ~10 verification runs.
- **Impact:** Cosmetic. The roast is still funny and shareable, just has a repeated line.
- **Possible fixes (not yet tried):** Tighten the prompt to enumerate "exactly four jokes, no repetition." Or move the joke list out of the prose prompt and into a numbered structure OpenAI parses more strictly.

## Function memory cold-start jitter
- **Since:** Pre-existing
- **Cause:** Vercel cold starts on `/api/roast` add 1-3s on the first hit after idle.
- **Impact:** Users on the very first roast of the day may see 50-62s instead of 47-59s. Not actionable.

## In-memory rate limit resets on cold starts
- **Since:** Pre-existing
- **Cause:** `ipUsage` Map lives in process memory, wiped on every Vercel cold start.
- **Impact:** Determined free-tier abusers can clear their daily limit by triggering a cold start.
- **Acceptable for V1:** Most users hit the paywall on first day, abuse vector is small. Move to Redis/Upstash if it becomes material.

## Debug bypass key is hardcoded (`roastd2026`)
- **Since:** Pre-existing
- **Cause:** Constant in api/roast.js for fast iteration.
- **Impact:** Anyone who reads the source can skip rate limits and paywall.
- **Acceptable:** Source is public on GitHub anyway; the key is just a soft gate. Rotate if abuse appears.
