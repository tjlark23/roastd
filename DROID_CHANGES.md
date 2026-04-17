# Droid Changes — Roastd prompt tuning pass

**Branch:** `droid-test`
**File touched:** `api/roast.js` only.
**Model used for this task:** Claude Opus 4.7 (single model — planning and editing).

Mission: fix two quality issues preserved in `STATUS.md`:
1. Comedy quality inconsistent across the 10 categories (only LinkedIn was heavily tuned).
2. Gemini handwriting unreliable — sometimes too clean, sometimes garbled, occasional unwanted URLs/watermarks.

No architectural changes. Model IDs unchanged (`claude-sonnet-4-5-20250929`, `gemini-3.1-flash-image-preview`). Claude JSON response shape unchanged. No frontend, Stripe, or rate-limit code touched.

---

## 1. CATEGORY_PROMPTS — raised the other 9 to LinkedIn's level

### Why the LinkedIn prompt worked
It had three properties the others lacked:
- **Density of observation targets.** Specific, observable stuff (follower count, banner, endorsements) instead of vibes.
- **"Gap between projection and reality"** as the explicit joke engine — who they ARE vs who they PRETEND to be.
- **"Read every visible word"** directive — forces Claude to ground jokes in actual image content instead of generic category tropes.

The other 9 were short and vague. Claude was doing generic category jokes (gym = flex, car = compensating, etc.) instead of specific jokes tied to the uploaded image. Result: LinkedIn produced sharp roasts; everything else produced middling snark.

### What I changed per category
Each of the 9 other prompts now has: explicit SUBJECT line, a dense LOOK FOR list (12–18 specific, observable targets), and an ending "gap between X and Y is the joke" directive matching LinkedIn's structure.

- **twitter** — added display-name cringe, follower/following ratio tells, pinned-tweet-that-never-went-viral, "opinions are my own" disclaimer, joined-date vs follower-count math. Explicit read-every-word line.
- **dating** — added group-photo hide-yourself tell, fish-pic archetype, Bali/Machu Picchu, sunglasses-every-pic face blocking, "Entrepreneur" with no company, suspiciously precise height, age gap between oldest and newest photo.
- **pet** — kept the pet-perspective twist. Added pet's 1000-yard stare, non-consensual costume framing, owner's grip as prop, what pet can see in background owner forgot, "pet is smarter and more over it" directive.
- **selfie** — added what's reflected in eyes/behind them, filter tells (smooth skin but blurry ears), ring light halos, phone visible in mirror, practiced-200-takes expressions. Gap = casual energy vs obvious staging.
- **room** — added the one weirdly expensive thing among chaos, dying plants, LED strips as age tell, tapestry choice, monitor count vs life achievements, floor-visibility percentage.
- **wedding** — explicit "funny about the wedding, never the relationship" guardrail kept. Added venue-as-class-signal (barn = 2018, all-white modern = finance, destination = parents paid), the one guest whose face reveals the truth, dated-trend tells.
- **gym** — added mirror-angle tells (low = fake height), cardio-screen rest timer (proof they aren't doing cardio), matching set cost vs gym membership, headphones-as-personality, the irony that setup time = another set skipped.
- **resume** — added objective-statement cringe quote, action-verb abuse list, "Microsoft Office" in 2026, "Fluent in English" when it's their first language, employment-gap euphemisms, the one impressive line buried at the bottom, length-as-delusion-meter.
- **car** — added cleanliness mismatch (waxed body dirty wheels), mod mismatch (sport exhaust on econo car), sticker inventory, what's hanging from rearview, dealer frame still on, what's visible through the window (trash, baby seat), lease-photographed-as-owned.

All prompts kept roughly consistent length — denser, not bloated.

---

## 2. Main Claude comedy prompt — light refinements

Kept the step-by-step structure (STEP 1 → STEP 2 → STEP 3) and the JSON schema exactly as-is. Two small additions:

### Added two more "unfunny garbage" failure modes
- **In-group-only jokes** that require background knowledge (niche brand names, industry acronyms, obscure sports rosters). If the reader needs to know one extra fact before the joke lands, kill it. This was aimed partly at the "Maryland doing heavy lifting" example in the old prompt — it works only if you know Maryland is mid-tier, which a general audience won't.
- **"Mean but not specific"** — `You look bad` is not a roast. `You look bad BECAUSE [specific visible detail]` is. Forces every insult to point at a concrete image element.

### Replaced the "before you output" line with a 4-step self-check
Old line was a single vague "is this funny" prompt. New version runs an explicit checklist:
1. Does it name a SPECIFIC visible detail?
2. Does it end with a TWIST?
3. Would someone with zero context laugh?
4. If I delete the twist, does it still make sense as a plain description? (If yes, it was never a joke.)

Plus an explicit "joke 1 and joke 4 matter most — swap or rewrite if weaker than 2 and 3" instruction, because people remember first and last in a 4-item list.

### What I did NOT change
- JSON keys: `callout`, `frame`, `overall_burn`, `sketch_idea` — all preserved. Frontend stays happy.
- Word limits on each field — preserved.
- STYLE_PROMPTS block — left alone. It's working.

---

## 3. Gemini prompt — restructured for reliability

Three failure modes to address:
- URLs/domain names appearing in the output.
- Watermark/stamp/signature additions.
- Handwriting oscillating between too-clean-font and garbled-illegible.

### (a) Reordered sections: BANS → HANDWRITING → LAYOUT → SELF-CHECK
Old prompt put bans at the bottom. By the time the model read them, it had already visualized a finished annotated image in its activations, and the bans were weaker than "rewrite the plan." New prompt puts absolute bans at the top so they shape the rest of the generation.

### (b) Concretized bans with examples of what to avoid
Old: `Do NOT write any website URLs`. Model ignored it because it wasn't sure what counted.
New: explicit `Not ".com", not "www.", not "roastd", not any website name. None. Anywhere. Not in the corner, not as a watermark, not hidden in a joke.` Names the specific token shapes to suppress.

Same treatment for watermarks — explicitly lists signatures, logos, stamps, "copyright notices", "signed by" marks, corner text, edge text, caption bars, title cards, banners, footer strips.

### (c) Rewrote the handwriting directive — positive reference instead of negative chaos
Old prompt said `A drunk person scrawling with a fat red Sharpie`. Gemini read this as "make it chaotic" and sometimes produced unreadable scribbles.

New reference: **a stand-up comic backstage with a red Sharpie marking up a photo in a rush — writing FAST but CLEARLY because they want to read it back.** The new framing makes legibility the primary goal and messiness a side-effect of speed, not the point. Added explicit rule: *every word must be 100% readable. If a viewer has to squint or guess a letter, the handwriting failed.*

Also added: mix of print and casual cursive OK, pure cursive NOT (harder to read). This removes a common failure mode where Gemini defaults to overly loopy cursive.

### (d) Added explicit photo-grounding
New line: **Do not modify the photo itself. Do not add people, objects, furniture, backgrounds, or any new content inside the photo. You are only drawing ON TOP.** Gemini sometimes hallucinates extra photo content when asked to annotate. This makes the constraint explicit.

### (e) Added final self-check block
Before output, scan for URLs, watermarks, unreadable handwriting, added photo content, non-red text. Remove any violation. Mirrors the Claude prompt's self-check pattern — the model is more likely to comply when the check is explicitly the last thing it does.

### (f) Kept unchanged
- Sharp-based frame layout (Gemini never lays out the canvas).
- Response modalities (`["TEXT", "IMAGE"]`).
- The callout/doodle/circle-on-photo + jokes-in-white-space + headline-on-bottom layout — this structure was working when Gemini followed it; the problem was compliance, not the design.

---

## Files changed
- `api/roast.js` — prompts only.
- `DROID_CHANGES.md` — this memo (new file at repo root).

## Files not changed
- `public/index.html`
- `api/checkout.js`
- `api/verify.js`
- `DECISIONS.md`, `STATUS.md`, `README.md`
- `package.json`, `vercel.json`

No commits, no pushes, no API calls. Ready for manual review and testing.
