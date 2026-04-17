// api/roast.js — Roastd AI v4
// Claude Sonnet 4.5 (step-by-step comedy writing) → Gemini (framed annotated image)

const ipUsage = new Map();
const FREE_LIMIT = 3;

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
         req.headers['x-real-ip'] || 
         req.socket?.remoteAddress || 
         'unknown';
}

function checkRateLimit(ip) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const entry = ipUsage.get(ip);
  
  if (!entry || (now - entry.firstUse) > dayMs) {
    ipUsage.set(ip, { count: 1, firstUse: now });
    return { allowed: true, remaining: FREE_LIMIT - 1 };
  }
  
  if (entry.count >= FREE_LIMIT) {
    return { allowed: false, remaining: 0 };
  }
  
  entry.count++;
  return { allowed: true, remaining: FREE_LIMIT - entry.count };
}

let requestCount = 0;
function cleanOldEntries() {
  requestCount++;
  if (requestCount % 100 !== 0) return;
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  for (const [ip, entry] of ipUsage) {
    if ((now - entry.firstUse) > dayMs) ipUsage.delete(ip);
  }
}

const CATEGORY_PROMPTS = {
  linkedin: `SUBJECT: LinkedIn profile screenshot.
LOOK FOR: Headline buzzwords, inflated titles, corporate headshot pose, "Open to Work" banner, follower count, humble brags, endorsements nobody asked for, the gap between who they ARE and who they PRETEND to be. Read every visible word.`,

  twitter: `SUBJECT: Twitter/X profile screenshot.
LOOK FOR: Display name cringe (real name + descriptor like "🚀 builder" or "✝️ dad"), bio as personality resume, follower-to-following ratio (following thousands with 200 followers = desperate), blue checkmark (paid $8 to be ignored harder), "opinions are my own" disclaimer nobody asked for, pinned tweet (THE one they thought would go viral — it didn't), joined date vs follower count (years of posting, nothing to show), header image (usually a sunset or quote they didn't write), location field lies, every link in bio. Read every visible word, every number, every emoji. The gap between how seriously they take themselves and how seriously anyone else takes them is where the jokes live.`,

  dating: `SUBJECT: Dating profile screenshot.
LOOK FOR: Photo count if visible, group photos where you can't tell which one is them (on purpose), the one gym mirror pic, fish held up as personality, Machu Picchu/Bali/airport photo that signals "traveled once", bathroom mirror selfie, sunglasses-in-every-pic face blocking, dog that is not theirs, bio cliches ("fluent in sarcasm", "love to laugh", "partner in crime", "work hard play hard"), job listed as "Entrepreneur" / "CEO" / "Consultant" with no company, height listed suspiciously precisely OR conspicuously absent, prompt answers that reveal more than intended, age gap between oldest and newest photo (how long ago was the good one?). Read every word. The gap between the life they're advertising and the life in the background of photo 4 is where the jokes live.`,

  pet: `SUBJECT: Photo with a pet. TWIST: Write everything FROM THE PET'S PERSPECTIVE roasting their owner.
LOOK FOR: Pet's eyes (the resignation, the 1000-yard stare of an animal who has been through things), any costume/outfit on the pet (non-consensual fashion crime), the owner trying to make the pet THEIR whole personality, what the pet can see in the background that the owner forgot (mess, wine glasses, unpaid bills, another pet ignored), owner's grip on the pet (too tight? dangling? held like a prop?), how many takes this clearly took, the pet's body language screaming "let me go." Read everything visible. The pet understands this person better than anyone and is tired. The jokes come from the pet being smarter, more dignified, and more over it than the human.`,

  selfie: `SUBJECT: Selfie.
LOOK FOR: Location (bathroom tile, car interior, gym mirror, office cubicle, bedroom with unmade bed visible), camera angle (chin-up to hide a double, chin-down for cheekbones, 3/4 "candid" from way too high), what's reflected in their eyes or behind them that gives it all away, filter tells (smoothed skin but blurry ears, eye color that wasn't that yesterday), ring light halos, phone held visibly in the mirror, expression effort (the practiced smize, the closed-mouth smirk rehearsed in 200 takes), accessories used as props (AirPods, sunglasses, coffee cup positioned just so), what they're wearing that doesn't match the location. The gap between the casual "just took this" energy and the clearly staged reality is where every joke lives.`,

  room: `SUBJECT: Room/apartment photo.
LOOK FOR: Unmade bed half-cropped out, cable nest behind the desk, the one weirdly expensive item surrounded by thrift-store chaos (gaming chair next to a folding table, $2000 monitor on a $20 Walmart desk), dust on the ceiling fan, plants that are clearly dying, LED strip lights (age tell), tapestry choice (Bob Marley? constellation map? "Live Laugh Love"?), laundry pile artfully ignored, what's on the monitor screen if visible, what's on the nightstand, posters still up from college, single person's bed size, empty bottles/cans, how many monitors vs life achievements, floor visibility percentage, what they tried to hide by angling the camera. The gap between the "vibe" they think they have and what the room actually says about their life is the material.`,

  wedding: `SUBJECT: Wedding photo. FUNNY ABOUT THE WEDDING, NEVER THE RELATIONSHIP.
LOOK FOR: Pinterest-core pose (the forehead touch, the dip kiss, the walking-away-laughing shot), venue tell (barn = 2018 brain, all-white modern = finance, destination = someone's parents paid), dress/suit trend that will date this photo exactly (slicked buns, mullet groomsmen, cathedral veil, sage green everything), one guest in the background whose face reveals the truth, matchy-matchy bridesmaids who clearly had opinions, flower wall, neon sign with their names in cursive, the signature cocktail sign, forced "candid" laughing, drone shot flex, dad dancing cropped out, the one kid crying. Read every sign, menu, or text visible. The wedding industry lives in the gap between "authentic" and "Instagram", and the jokes live there too.`,

  gym: `SUBJECT: Gym/fitness photo.
LOOK FOR: Mirror angle (low angle for fake height, worm's-eye for fake quads), pump timing (just did one curl), phone positioning (the practiced "casually checking" lean), outfit (matching set costs more than the gym membership, Gymshark logo tax), headphones as personality, shaker bottle in frame as proof of protocol, what's on the screen of the cardio machine (rest timer of 5 minutes means they're not doing cardio), other gym-goers in the background doing actual work while this photo is happening, veins flexed for one second, the selected weight vs the actual rep weight just done, supplement brand stack barely visible on the bench, caption-ready poses. The irony: the time spent setting up this photo could have been another set. That gap is the joke.`,

  resume: `SUBJECT: Resume screenshot.
LOOK FOR: Objective statement cringe ("results-driven self-starter seeking opportunity to leverage"), job titles inflated 2–3 levels (an internship becomes "Strategic Operations Lead"), action verb abuse (spearheaded, architected, orchestrated, revolutionized — for tasks that were sending emails), "Microsoft Office" listed as a skill in 2026, "Fluent in English" when English is their first language, employment gaps disguised as "Independent Consulting" or "Sabbatical", GPA listed because it's the last impressive thing that happened, hobbies section ("traveling, reading, trying new restaurants"), the one actually impressive line buried at the bottom, formatting crimes (Times New Roman, centered everything, 3 fonts, a photo), bullet points that are just the job description copy-pasted, certifications from weekend online courses listed with the same weight as a degree, length (one page = competent, two = stretching, three+ = delusional). Read every line. The gap between who the resume says they are and who they obviously are is every joke.`,

  car: `SUBJECT: Car photo.
LOOK FOR: How they photographed it (low angle like a manufacturer ad, clearly trying to hide something, sunset lighting for a 2014 Civic), cleanliness mismatch (waxed body but filthy wheels, or vice versa), aftermarket mods that clash (sport exhaust on an economy car, massive wing on FWD), debadging inconsistency, stickers (JDM stickers on a Corolla, "salt life", Punisher skull, stick-figure family), vanity plate attempt at cleverness, what's hanging from the rearview (fuzzy dice, graduation tassel from 2015, rosary, air freshener tree), lift kit reasoning, rims that cost more than the car, license plate frame slogans, dealer frame still on, the car that's clearly a lease photographed like it's owned, what's visible through the window (McDonald's cups, a baby seat, a full apartment's worth of trash), whether the car is photographed in motion or static, location (empty parking lot at golden hour — who took this?). The gap between what the car costs and the personality it's supposed to project is the joke.`,
};

const STYLE_PROMPTS = {
  genz: `VOICE: Gen Z. Use: lowkey, no cap, fr fr, giving, delulu, bruh, its giving, slay (sarcastically), ate (sarcastically), the way that, im screaming, help. Casual lowercase energy. Short devastating sentences. Sound like an actual 19-year-old, not a corporation trying to sound young.`,

  boomer: `VOICE: Disappointed Boomer Dad. "Back in my day" energy. References: mowing lawns, firm handshakes, real jobs, getting up at 5am, newspapers. Genuinely confused by modern choices. Deadpan delivery. Not angry, just... deeply let down.`,

  shakespeare: `VOICE: Shakespearean. Use: thee, thou, verily, forsooth, doth, hath, methinks, prithee, knave, cur, wretched. Dramatically insulting iambic energy. Literary wit meets genuine disgust. Insult like the Bard at his most savage.`,

  asian_parent: `VOICE: Disappointed Asian Parent. Compare everything to doctor/lawyer cousins. "Why not doctor?" Short devastating comparisons. Guilt that cuts to bone. Maximum guilt per word.`,

  jackson: `VOICE: Samuel L. Jackson in Pulp Fiction mode. Aggressive, intense, personally offended. Use "motherfucker" where it hits hardest. Bold, confrontational. Like this photo ruined his whole day.`,

  coworker: `VOICE: Passive-Aggressive Coworker. "Per my last email" energy. Backhanded compliments hiding nuclear devastation. Corporate speak delivering maximum damage with a smile.`,

  jewish_mom: `VOICE: Jewish Mother. Guilt trips wrapped in love. "I'm not saying anything, I'm just saying." Compares to neighbors' children, cousins, anyone doing better. "You know what, it's fine. I'll just sit here. In the dark."`,

  british: `VOICE: British Royalty. "How frightfully common." Dry, withering, delivered while barely glancing up from tea. Words: dreadful, ghastly, quite, rather, vulgar, pedestrian. Maximum condescension with impeccable manners.`,

  aussie: `VOICE: Australian Bogan. Use: mate, yeah nah, get fucked, cooked, drongo, bloody hell, fair dinkum, dead set. Blunt no-filter Australian pub energy. Says what everyone's thinking but louder.`,

  redneck: `VOICE: Redneck on a porch with a beer. Use: boy, what in tarnation, I tell you what, dang, reckon, ain't, bless your heart (devastating). Southern observations. Folksy wisdom meets brutal honesty.`,
};

export const config = {
  maxDuration: 60,
};

// ─── Handwriting engine selection ─────────────────────────────────────────────
// HANDWRITING_ENGINE env var: 'fonts' (new font+Rough.js renderer, default) or
// 'gemini' (legacy Gemini + Vision OCR path kept as a fallback). Request body
// may override via `engine` when debug mode is on.
function resolveEngine({ envEngine, requestEngine, isDebug }) {
  const allowed = new Set(['fonts', 'gemini']);
  if (isDebug && allowed.has(requestEngine)) return requestEngine;
  if (allowed.has(envEngine)) return envEngine;
  if (envEngine && !allowed.has(envEngine)) {
    console.warn(`Unknown HANDWRITING_ENGINE='${envEngine}', falling back to 'fonts'`);
  }
  return 'fonts';
}

// ─── Watermark post-processing helpers ────────────────────────────────────────

// Patterns that identify Gemini-added watermarks. Checked against each detected
// text block (not substring — the whole block must normalize to one of these).
function isWatermarkText(raw) {
  if (!raw) return false;
  const norm = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!norm) return false;
  if (/^roast(d|ed|ing|dai|dailogo)?$/.test(norm)) return true;
  if (/^roastdai(logo|stamp|watermark|official)?$/.test(norm)) return true;
  if (/^roastdaicom$/.test(norm)) return true;           // unbranded copy of our URL
  if (/^(roastd)?take\d+$/.test(norm)) return true;
  if (/^(roastd)?scene\d+$/.test(norm)) return true;
  if (/^clapperboard$/.test(norm)) return true;
  if (/^roastdai?(ai)?(inc|llc|corp|studios?|official)$/.test(norm)) return true;
  return false;
}

// Bounding box + rotation from a Vision API boundingPoly (4 vertices in reading order).
function analyzePoly(vertices) {
  const xs = vertices.map(v => v.x || 0);
  const ys = vertices.map(v => v.y || 0);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  // Angle of the top edge (v0 -> v1) vs horizontal
  const dx = (vertices[1]?.x || 0) - (vertices[0]?.x || 0);
  const dy = (vertices[1]?.y || 0) - (vertices[0]?.y || 0);
  let angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
  // Normalize to [-90, 90]
  if (angleDeg > 90) angleDeg -= 180;
  if (angleDeg < -90) angleDeg += 180;
  return { left, top, right, bottom, width: right - left, height: bottom - top, angleDeg };
}

function rectsOverlap(a, b) {
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

function rectContains(outer, inner) {
  return (
    inner.left >= outer.left &&
    inner.top >= outer.top &&
    inner.right <= outer.right &&
    inner.bottom <= outer.bottom
  );
}

function clampRect(r, maxW, maxH) {
  const left = Math.max(0, Math.floor(r.left));
  const top = Math.max(0, Math.floor(r.top));
  const right = Math.min(maxW, Math.ceil(r.right));
  const bottom = Math.min(maxH, Math.ceil(r.bottom));
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

async function removeGeminiWatermarks(geminiBuffer, cleanBuffer, geometry, apiKey) {
  const sharp = (await import('sharp')).default;

  // Normalize dimensions between Gemini output and our clean reference.
  const geminiMeta = await sharp(geminiBuffer).metadata();
  const gemW = geminiMeta.width;
  const gemH = geminiMeta.height;
  if (!gemW || !gemH) return { buffer: geminiBuffer, flaggedCount: 0 };

  let cleanResized = cleanBuffer;
  const cleanMeta = await sharp(cleanBuffer).metadata();
  if (cleanMeta.width !== gemW || cleanMeta.height !== gemH) {
    cleanResized = await sharp(cleanBuffer).resize(gemW, gemH, { fit: 'fill' }).png().toBuffer();
  }

  // Map known photo and branding regions from canvas space into Gemini-output space.
  const sx = gemW / geometry.canvasW;
  const sy = gemH / geometry.canvasH;
  const photoRegion = {
    left: geometry.padX * sx,
    top: geometry.padTop * sy,
    right: (geometry.padX + geometry.imgW) * sx,
    bottom: (geometry.padTop + geometry.imgH) * sy,
  };
  // Generous bottom-right branding zone (wider than the stamp itself to absorb OCR bbox variance).
  const brandingZone = {
    left: gemW * 0.62,
    top: gemH - geometry.padBottom * sy,
    right: gemW,
    bottom: gemH,
  };

  // OCR
  const visionRes = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: geminiBuffer.toString('base64') },
          features: [{ type: 'TEXT_DETECTION', maxResults: 50 }],
        }],
      }),
    }
  );

  if (!visionRes.ok) {
    const errTxt = await visionRes.text().catch(() => '');
    console.warn('Vision API non-OK, skipping watermark removal:', visionRes.status, errTxt.substring(0, 200));
    return { buffer: geminiBuffer, flaggedCount: 0 };
  }

  const visionData = await visionRes.json();
  const all = visionData.responses?.[0]?.textAnnotations || [];
  // Index 0 is the concatenated full-text block; per-word entries follow.
  const words = all.slice(1);
  if (words.length === 0) return { buffer: geminiBuffer, flaggedCount: 0 };

  const flagged = [];
  for (const w of words) {
    const verts = w.boundingPoly?.vertices || [];
    if (verts.length < 3) continue;
    const box = analyzePoly(verts);
    if (box.width < 4 || box.height < 4) continue;

    // Keep anything fully inside the branding zone — that's our pre-stamped footer.
    if (rectContains(brandingZone, box)) continue;

    const text = (w.description || '').trim();
    const isWatermark = isWatermarkText(text);
    const onPhoto = rectsOverlap(box, photoRegion);
    const absAngle = Math.abs(box.angleDeg);

    // Rule 1: any watermark-pattern text anywhere outside the branding zone.
    // Rule 2: large diagonal text (>= 18deg) overlapping the photo — catches ghost stamps
    //         even when Vision misreads the exact letters.
    const largeDiagonalOnPhoto =
      onPhoto &&
      absAngle >= 18 &&
      box.width >= gemW * 0.18;

    if (isWatermark || largeDiagonalOnPhoto) {
      // Pad the bbox so we fully cover the rendered stroke + halo.
      const padW = Math.max(6, Math.round(box.width * 0.08));
      const padH = Math.max(6, Math.round(box.height * 0.15));
      flagged.push({
        left: box.left - padW,
        top: box.top - padH,
        right: box.right + padW,
        bottom: box.bottom + padH,
      });
    }
  }

  if (flagged.length === 0) return { buffer: geminiBuffer, flaggedCount: 0 };

  // For each flagged rect, extract the same region from the clean buffer and composite it
  // over the Gemini output. This surgically reverts the region to its pre-annotation state
  // (minus our intended pre-stamped branding, which is also in the clean buffer).
  const composites = [];
  for (const rect of flagged) {
    const c = clampRect(rect, gemW, gemH);
    if (c.width === 0 || c.height === 0) continue;
    const patch = await sharp(cleanResized)
      .extract({ left: c.left, top: c.top, width: c.width, height: c.height })
      .png()
      .toBuffer();
    composites.push({ input: patch, left: c.left, top: c.top });
  }

  if (composites.length === 0) return { buffer: geminiBuffer, flaggedCount: 0 };

  const finalBuffer = await sharp(geminiBuffer)
    .composite(composites)
    .png()
    .toBuffer();

  return { buffer: finalBuffer, flaggedCount: composites.length };
}

// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image, mimeType, category, style, isPaid } = req.body;

    if (!image || !category || !style) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Rate limit check (skip if paid or debug mode)
    const isDebug = req.body.debug === 'roastd2026';
    if (!isPaid && !isDebug) {
      cleanOldEntries();
      const ip = getClientIP(req);
      const limit = checkRateLimit(ip);
      
      if (!limit.allowed) {
        return res.status(429).json({ 
          error: "free_limit_reached",
          message: "You've used your 3 free roasts today. Buy more to keep the destruction going.",
          remaining: 0,
        });
      }
      
      req._remaining = limit.remaining;
    }

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

    const resolvedEngine = resolveEngine({
      envEngine: process.env.HANDWRITING_ENGINE,
      requestEngine: typeof req.body?.engine === 'string' ? req.body.engine : null,
      isDebug,
    });

    if (!ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "API keys not configured (ANTHROPIC_API_KEY)" });
    }
    if (resolvedEngine === 'gemini' && !GOOGLE_API_KEY) {
      return res.status(500).json({ error: "API keys not configured (GOOGLE_API_KEY)" });
    }

    const categoryPrompt = CATEGORY_PROMPTS[category] || CATEGORY_PROMPTS.selfie;
    const stylePrompt = STYLE_PROMPTS[style] || STYLE_PROMPTS.genz;

    // ═══════ STEP 1: Claude Sonnet 4.5 — Step-by-Step Comedy Writing ═══════
    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mimeType || "image/png", data: image },
            },
            {
              type: "text",
              text: `You write roasts for the internet. Not corporate comedy. Not "ha that's clever." The kind of shit people screenshot and send to group chats. The kind that makes someone go "OH NO" and then laugh for 10 seconds.

STEP 1 — LOOK AT THIS IMAGE AND LIST EVERYTHING YOU SEE:
Read every word of text. Note every number. Describe what the person is wearing, doing, where they are. What are they trying to project? What does the background reveal? What details did they NOT realize were visible? Write this list in your head before doing anything else.

${categoryPrompt}

STEP 2 — FIND THE FUNNIEST ANGLES:
For each detail you noticed, ask: "What's the meanest, funniest thing I could say about this?" The best roasts take something the person is PROUD of and flip it into something embarrassing.

THE FORMULA: [specific detail from the image] + [unexpected reframe that makes it embarrassing/devastating]

EXAMPLES OF ACTUALLY FUNNY ROASTS (notice how each one takes a SPECIFIC detail and TWISTS it):
- Detail: person has 59k followers → Twist: "59k people subscribed to watch a man lose money in public"
- Detail: banner shows astronauts → Twist: "even the astronaut in your banner is trying to escape this profile"
- Detail: Premium badge visible → Twist: "Paid for Premium because the free version wasn't embarrassing enough"
- Detail: University of Maryland listed → Twist: "Maryland on the resume doing heavy lifting for a company nobody's heard of"
- Detail: 178 mutual connections → Twist: "178 people know you personally and still won't share your posts"

Notice the pattern: DETAIL + UNEXPECTED REFRAME that reveals something the person didn't mean to show. Every joke needs that twist. If you remove the twist and it still makes sense, it's not a joke.

ALSO: Do NOT reuse these example jokes. They're here to show the PATTERN. Write completely original material based on what you actually see.

EXAMPLES OF UNFUNNY GARBAGE (do NOT write like this):
- "Interesting profile!" (not a joke, just a comment)
- "59k followers watching you explain newsletters" (this is just a DESCRIPTION with attitude — there's no twist, no punchline, no surprise. SAYING WHAT YOU SEE IS NOT A JOKE.)
- "Cofounder is giving unemployed" (barely English, no punchline, too vague)
- "Nice headshot bro" (who cares? where's the joke?)
- Any sentence that just describes what's in the image but in a snarky tone — that's NOT comedy, that's just being snarky. A JOKE needs an unexpected connection, comparison, or reframe that the reader didn't see coming.
- In-group-only jokes that require background knowledge the average person doesn't have (e.g. niche company names, obscure sports rosters, industry acronyms). If the reader needs to know ONE extra thing before the joke lands, kill it. Jokes must work on someone who just saw the image for the first time with zero context.
- Jokes that are mean without being SPECIFIC to the image. "You look bad" is not a roast. "You look bad BECAUSE [specific visible detail]" is.

STEP 3 — WRITE THE FINAL ROAST:
${stylePrompt}

IMPORTANT: Stay in character but make sure every joke still makes grammatical sense and is easy to understand. If a joke requires explanation, it's bad. Kill it.

Return exactly this JSON. No markdown, no backticks, nothing else:
{
  "callout": {"text": "MAX 8 WORDS — short devastating one-liner for ON the photo", "points_to": "what the arrow points at"},
  "frame": [
    {"text": "8-15 word joke with a real punchline", "points_to": "what to point at"},
    {"text": "completely different angle from joke 1", "points_to": "what to point at"},
    {"text": "the meanest one — make them feel it", "points_to": "what to point at"},
    {"text": "your closer — the one they remember", "points_to": "what to point at"}
  ],
  "overall_burn": "max 10 words — devastating headline. The thing people screenshot.",
  "sketch_idea": "tiny doodle for the photo — a price tag, star rating, small speech bubble, trophy, etc. Must be contextually funny and dead simple to draw"
}

BEFORE YOU OUTPUT — run this check on every joke:
1. Does it name a SPECIFIC visible detail from the image? If no, rewrite.
2. Does it end with a TWIST the reader didn't see coming? If no, rewrite.
3. Would someone with zero context laugh at it? If no, rewrite.
4. If I delete the twist, does the sentence still make sense as a plain description? If yes, it was never a joke — rewrite.

Pay extra attention to frame jokes 1 and 4 — those are the ones people remember. If either of those is weaker than jokes 2 and 3, swap them or rewrite them. The closer (joke 4) should hit hardest. If "overall_burn" reads like a tweet and not a punch, rewrite it.`,
            },
          ],
        }],
      }),
    });

    if (!claudeResponse.ok) {
      const errText = await claudeResponse.text();
      console.error("Claude error:", claudeResponse.status, errText.substring(0, 300));
      return res.status(500).json({ error: `Claude API error ${claudeResponse.status}: ${errText.substring(0, 200)}` });
    }

    const claudeData = await claudeResponse.json();
    
    // Extract text from response
    let claudeText = "";
    for (const block of claudeData.content || []) {
      if (block.type === "text") {
        claudeText = block.text;
        break;
      }
    }

    if (!claudeText) {
      console.error("No text in Claude response:", JSON.stringify(claudeData.content?.map(b => b.type)));
      return res.status(500).json({ error: "Claude had nothing to say. Try again." });
    }

    let roastData;
    try {
      roastData = JSON.parse(claudeText.replace(/```json\n?|\n?```/g, "").trim());
    } catch (e) {
      console.error("Parse error. Raw text:", claudeText.substring(0, 500));
      return res.status(500).json({ error: "Claude was too brutal to be contained. Try again." });
    }

    // ═══════ STEP 2: Build white frame around photo using Sharp ═══════
    const sharp = (await import('sharp')).default;
    
    // Decode the uploaded image
    const imgBuffer = Buffer.from(image, 'base64');
    const imgMeta = await sharp(imgBuffer).metadata();
    const imgW = imgMeta.width;
    const imgH = imgMeta.height;
    
    // Add 40% padding on sides and 30% top/bottom for big white frame
    const padX = Math.round(imgW * 0.40);
    const padTop = Math.round(imgH * 0.25);
    const padBottom = Math.round(imgH * 0.35); // extra room for headline
    const canvasW = imgW + padX * 2;
    const canvasH = imgH + padTop + padBottom;
    
    // Create white canvas with photo centered
    const baseFramedBuffer = await sharp({
      create: { width: canvasW, height: canvasH, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
    })
    .composite([{ input: imgBuffer, left: padX, top: padTop }])
    .png()
    .toBuffer();

    // Pre-stamp "roastdai.com" in the bottom-right of the white margin BEFORE sending to Gemini.
    // This gives Gemini's "sign the image" instinct nothing to do — the branding is already on
    // the canvas when it sees it. The Gemini prompt is updated to match.
    const brandingFontPx = Math.max(16, Math.round(canvasH * 0.013));
    const brandingRightInset = Math.round(canvasW * 0.025);
    const brandingBottomInset = Math.round(padBottom * 0.22);
    const brandingSvg = Buffer.from(
      `<svg width="${canvasW}" height="${canvasH}" xmlns="http://www.w3.org/2000/svg">
        <text x="${canvasW - brandingRightInset}" y="${canvasH - brandingBottomInset}"
              font-family="Helvetica, Arial, sans-serif"
              font-size="${brandingFontPx}"
              fill="#888888"
              text-anchor="end"
              font-weight="400">roastdai.com</text>
      </svg>`
    );

    const framedBuffer = await sharp(baseFramedBuffer)
      .composite([{ input: brandingSvg, top: 0, left: 0 }])
      .png()
      .toBuffer();

    // This is our authoritative clean reference used later to surgically erase any watermarks
    // Gemini adds. It already contains the branding, so replacing a flagged region near the
    // bottom-right preserves branding correctly.
    const cleanFramedBuffer = framedBuffer;

    // ═══════ STEP 3 — ENGINE BRANCH ═════════════════════════════════════════════
    // Default engine renders annotations with bundled fonts + Rough.js (fully
    // deterministic, no external image-gen call). Legacy Gemini path stays
    // available behind HANDWRITING_ENGINE=gemini.
    if (resolvedEngine === 'fonts') {
      try {
        const { renderAnnotations } = await import('./lib/handwriting.js');
        const finalBuffer = await renderAnnotations({
          framedBuffer: cleanFramedBuffer,
          roastData,
          style,
          canvasGeometry: { canvasW, canvasH, padX, padTop, padBottom, imgW, imgH },
        });
        return res.status(200).json({
          success: true,
          image: `data:image/png;base64,${finalBuffer.toString('base64')}`,
          roastData,
          remaining: req._remaining ?? null,
        });
      } catch (err) {
        console.error('Font engine render failed:', err);
        return res.status(500).json({ error: 'Annotation render failed. Try again.' });
      }
    }

    const framedBase64 = framedBuffer.toString('base64');

    // ═══════ STEP 3 (GEMINI PATH) — Write annotations on the pre-framed image ═
    
    const callout = roastData.callout || {};
    
    const frameAnnotations = (roastData.frame || [])
      .map((a, i) => `  ${i + 1}. "${a.text}" — draw an arrow from this text into the photo pointing at ${a.points_to}`)
      .join("\n");

    const geminiPrompt = `You are annotating a photo that has already been placed on a white background. Read every rule below before drawing anything.

════════ ABSOLUTE BANS — read these FIRST ════════
Violating any of these ruins the image. Apply these filters to everything you draw.

1. NO URLs, domains, or web addresses ANYWHERE on the image EXCEPT the one required branding line in the bottom-right corner (see BRANDING section below). No ".com" anywhere else. No website name anywhere else. No URL hidden inside a joke, written diagonally across the photo, stamped over the photo, or placed in any corner other than bottom-right.
2. NO watermarks, signatures, logos, stamps, brand marks, copyright notices, or "signed by" marks anywhere on the photo or floating across it. The ONLY branding allowed is the small "roastdai.com" text in the bottom-right corner of the white margin described below. If you feel the urge to "sign" this image elsewhere — redirect that urge into the bottom-right branding line and nowhere else.
3. NO caption bars, title cards, banners, footers, or black strips of any kind.
4. NO text along the top, left, or right edges of the image that isn't one of the specific jokes listed below. The bottom-right corner is the only exception and only for the "roastdai.com" branding line.
5. NO modifying the photo itself. Do not add people, objects, furniture, backgrounds, or any new content inside the photo. You are only drawing ON TOP of the existing photo.
6. NO color other than red for handwriting, arrows, circles, and the doodle. Only red.
7. NO text written diagonally across the photo at 45 degrees. No diagonal "ROASTD AI" stamps, no diagonal watermarks, no diagonal anything.
8. NO computer fonts, printed text, typewriter text, or "neat" calligraphy — except the small "roastdai.com" branding line, which may be a clean simple sans-serif (see BRANDING section).

════════ UNIVERSAL WHITE HALO RULE ════════
EVERY red letter, word, arrow, circle, and doodle line you draw anywhere on this image — on the photo AND in the white margins — must have a thin white halo/outline tracing its shape.

Why this is universal: on the white margins the halo is invisible (white on white), so it costs nothing. On top of the photo — especially over busy, dark, or reddish areas — the halo is what makes red text readable instead of getting lost. Making the rule universal removes any judgment call about which text gets the halo.

Halo spec:
- Roughly 2–3x the stroke width of the red letter/line itself.
- Thick enough to clearly separate the red ink from whatever color is behind it.
- Thin enough that the result still looks hand-drawn, not like a sticker or cut-out outline.
- Soft edges OK, but visible enough to do its job against dark or red-ish backgrounds.
Apply to: every letter of every word, every arrow line and arrowhead, every circle, every underline, every doodle stroke. No exceptions.

════════ HANDWRITING — LEGIBLE FIRST, MESSY SECOND ════════
The single most common failure on this task is handwriting that is either (a) too clean and font-like, or (b) so scribbled it's unreadable. Neither is what we want.

CORRECT REFERENCE: a stand-up comic backstage with a red Sharpie, marking up a printed photo of themselves in a rush. They write FAST but they write CLEARLY because they want to read it back later. Every letter is formed correctly. Words are readable at a glance from 3 feet away. The messiness comes from speed, not chaos.

Specifically:
- Every word must be 100% readable. If a viewer has to squint or guess a letter, the handwriting failed.
- Letters are FORMED correctly — not scribbles, not loops, not decorative.
- Letter sizes vary slightly. Baselines drift a little up or down across a line. Some letters lean left, some right.
- Line weight varies a tiny bit — red Sharpie ink, not a pencil, not a fine pen.
- Mix of print and casual cursive is fine. Pure cursive is not (harder to read).
- Arrows are curved, wobbly, hand-drawn — not straight, not perfect. Each arrow has a clear arrowhead.
- Circles are imperfect ovals drawn in one or two strokes.
- The whole thing should look like a human in a hurry with a Sharpie, NOT a handwriting font and NOT a drunk person scrawling.

════════ LAYOUT ════════
THE PHOTO = the image in the center of the canvas.
THE WHITE SPACE = the wide white margins around the photo.

ON THE PHOTO (remember: every red element gets the universal white halo described above):
A. Write this callout in messy red Sharpie: "${callout.text || ''}"
   Draw a wobbly curved red arrow from the callout text to ${callout.points_to || 'the most obvious thing in the photo'}.
B. Draw one small red doodle in an open area of the photo: ${roastData.sketch_idea || "a small funny doodle"}.
   Keep it small, quick, clearly hand-drawn. Not detailed, not shaded.
C. Circle or underline ONE specific thing in the photo that relates to one of the jokes. Red, imperfect oval or squiggly underline.

IN THE WHITE SPACE (NOT on the photo):
Spread these 4 jokes around the white margins — roughly 1 top, 1-2 left side, 1-2 right side. Each joke gets its own red handwritten block with a wobbly curved arrow pointing from the text INTO the relevant part of the photo.
${frameAnnotations}

BOTTOM OF WHITE SPACE:
Write this headline in BIGGER messy red Sharpie letters, centered in the bottom white margin: "${roastData.overall_burn || ''}"

════════ BRANDING — ALREADY HANDLED, DO NOT TOUCH ════════
The image processor has ALREADY placed the text "roastdai.com" as a small gray footer credit in the bottom-right corner of the white margin. It is there before you touched this image.

You must:
- NOT add any URL, domain, ".com", website name, or any text resembling "ROASTD", "ROASTD AI", "ROASTED", "TAKE [number]", "SCENE [number]", clapperboard text, or any watermark of any kind anywhere on the image.
- NOT re-draw, duplicate, overwrite, or modify the existing "roastdai.com" footer. Leave that exact pixel region alone.
- NOT write the word "ROASTD" anywhere. Not diagonally, not in a corner, not as a stamp, not inside a joke, not in handwriting, not faded, not ghosted. Zero instances.

The branding is complete. The signing urge must be ignored entirely. There is nothing left for you to add in terms of branding or attribution. Any text resembling a watermark will be automatically detected and erased by a post-processor — so adding one is wasted effort that also damages your output.

════════ FINAL SELF-CHECK BEFORE OUTPUT ════════
Scan the entire image once more:
- Did you add any text containing "ROASTD", "ROASTED", "TAKE N", "SCENE N", or a URL anywhere? If yes, REMOVE IT. The only "roastdai.com" on the image is the pre-existing footer in the bottom-right — do not add a second one, do not modify the first one.
- Do you see any watermark, signature, logo, stamp, or "made by" mark across the photo or floating diagonally? Remove it.
- Does every red letter, arrow, circle, and doodle stroke have a thin white halo around it? If any red element lacks a halo, add one.
- Is any word of handwriting hard to read? Rewrite that word more clearly.
- Did you add anything INSIDE the photo that wasn't there before (new objects, people, backgrounds)? Remove it.
- Is any text in a color other than red (except the pre-existing gray branding footer which you did not draw)? Make it red.
Only output the image after every check passes.`;

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: "image/png", data: framedBase64 } },
              { text: geminiPrompt },
            ],
          }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const gemErr = await geminiResponse.text();
      console.error("Gemini error:", geminiResponse.status, gemErr.substring(0, 300));
      return res.status(500).json({ error: `Gemini API error ${geminiResponse.status}: ${gemErr.substring(0, 200)}` });
    }

    const geminiData = await geminiResponse.json();
    const candidates = geminiData.candidates;

    if (!candidates?.length) {
      return res.status(500).json({ error: "No image generated. Try again." });
    }

    let generatedImageBase64 = null;
    let generatedMimeType = "image/png";

    for (const part of candidates[0].content.parts) {
      const d = part.inline_data || part.inlineData;
      const mt = d?.mime_type || d?.mimeType;
      if (d && mt?.startsWith("image/")) {
        generatedImageBase64 = d.data;
        generatedMimeType = mt;
        break;
      }
    }

    if (!generatedImageBase64) {
      return res.status(500).json({ error: "No image in response. Try again." });
    }

    // ═══════ STEP 4: Post-process — detect and surgically remove Gemini watermarks ═══════
    // Prompt-layer bans don't fully stop Gemini from stamping "ROASTD" / "TAKE N" across the
    // photo. We OCR the output via Google Cloud Vision, classify each detected text block,
    // and composite the clean pre-Gemini buffer over any region that matches a watermark
    // pattern. Fails open: any error here returns the Gemini image unchanged.
    let finalImageBase64 = generatedImageBase64;
    let finalMimeType = generatedMimeType;
    try {
      const cleaned = await removeGeminiWatermarks(
        Buffer.from(generatedImageBase64, 'base64'),
        cleanFramedBuffer,
        { canvasW, canvasH, padX, padTop, padBottom, imgW, imgH },
        GOOGLE_API_KEY
      );
      if (cleaned && cleaned.buffer) {
        finalImageBase64 = cleaned.buffer.toString('base64');
        finalMimeType = 'image/png';
        if (cleaned.flaggedCount > 0) {
          console.log(`Watermark post-process: removed ${cleaned.flaggedCount} region(s).`);
        }
      }
    } catch (err) {
      console.warn('Watermark post-process failed (returning Gemini image as-is):', err.message);
    }

    return res.status(200).json({
      success: true,
      image: `data:${finalMimeType};base64,${finalImageBase64}`,
      roastData,
      remaining: req._remaining ?? null,
    });
  } catch (error) {
    console.error("Roast error:", error);
    return res.status(500).json({ error: "Something went wrong. Try again." });
  }
}
