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
LOOK FOR: Bio personality performance, follower/following ratio (desperate?), display name cringe, blue checkmark (paid for validation?), pinned tweet energy, header image choices, emoji usage in bio, "thought leader" delusions.`,

  dating: `SUBJECT: Dating profile screenshot.
LOOK FOR: Photo choices (bathroom selfie? fish pic? Machu Picchu everyone has?), bio cliches ("love tacos", "fluent in sarcasm", "looking for partner in crime"), prompt answers, height listed or conspicuously missing, "just ask" energy.`,

  pet: `SUBJECT: Photo with a pet. TWIST: Write everything FROM THE PET'S PERSPECTIVE roasting their owner.
LOOK FOR: Pet's expression (judging?), any pet costume (the pet did NOT consent), background mess, what the pet clearly thinks of this person's life choices. The pet is smarter than the owner.`,

  selfie: `SUBJECT: Selfie.
LOOK FOR: Location (bathroom? car? gym?), the angle (chin-up to hide something? looking away "candidly"?), filters, ring light reflection, background disasters, facial expression performance, accessories.`,

  room: `SUBJECT: Room/apartment photo.
LOOK FOR: Cleanliness level, decoration choices (or lack thereof), cable management horror, furniture from college that never got replaced, what the room reveals about this person's inner life, LED strips, tapestries, gaming setup.`,

  wedding: `SUBJECT: Wedding photo.
LOOK FOR: Pinterest-inspired poses, venue choice, fashion decisions, forced candid moments, matching outfits, wedding party expressions, over-the-top details. Funny about the WEDDING not the relationship.`,

  gym: `SUBJECT: Gym/fitness photo.
LOOK FOR: The flex pose, outfit choices, mirror selfie angle, pump timing, equipment in frame, other gym-goers in background, the desperate need to document working out instead of just working out.`,

  resume: `SUBJECT: Resume screenshot.
LOOK FOR: Inflated job titles, buzzword density, "proficient in Microsoft Office" energy, formatting crimes, skills section delusions, employment gaps, objective statement cringe, font choices.`,

  car: `SUBJECT: Car photo.
LOOK FOR: What this car says about personality, how they photographed it (like it's a model?), modifications, cleanliness, vanity plate, air freshener choices, what they're compensating for.`,
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image, mimeType, category, style, isPaid } = req.body;

    if (!image || !category || !style) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Rate limit check (skip if paid)
    if (!isPaid) {
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

    if (!ANTHROPIC_API_KEY || !GOOGLE_API_KEY) {
      return res.status(500).json({ error: "API keys not configured" });
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
              text: `You are a HEADLINING ROAST COMEDIAN. You've been hired to absolutely destroy whoever uploaded this photo. Your reputation depends on every single line being laugh-out-loud funny.

IMPORTANT: Follow these steps IN ORDER before writing the final output.

═══ STEP 1: FORENSIC IMAGE ANALYSIS ═══
Study this image like a detective. Identify:
- Every piece of text visible (read it ALL word for word)
- Specific objects, clothing, setting details
- What the person is clearly trying to project vs. what's actually happening
- The single most roastable thing in this image
- Any background details that are unintentionally funny
- Numbers: follower counts, dates, stats, anything specific

${categoryPrompt}

═══ STEP 2: FIND THE COMEDY ANGLES ═══
Based on what you observed, brainstorm 6-8 possible comedy angles. For each one, ask:
- What's the SETUP? (the observation)
- What's the PUNCH? (the unexpected twist, comparison, or exaggeration)
- Is this SPECIFIC to THIS image or could it apply to anyone? (if anyone, discard it)

Good: "Your headline says 'Disrupting the Future of Synergy' but your background is a Panera Bread"
Bad: "Nice profile pic" (generic, could be anyone)

═══ STEP 3: WRITE THE FINAL ROAST ═══
${stylePrompt}

From your comedy angles, pick the BEST and write:

1. ONE "callout" (max 8 words) — goes directly ON the photo with an arrow. Pick the single funniest visual detail. Short, punchy, devastating.

2. FOUR "frame" jokes (8-15 words each) — go in a white border AROUND the photo. These are your A-material. Each must be a complete joke, not just an observation. Setup + punch in one line.

3. ONE "overall_burn" headline (max 10 words) — the title. The thing people screenshot and share.

4. ONE "sketch_idea" — a tiny doodle for an empty area of the photo. Dead simple (stick figure, speech bubble, star rating, small symbol). Must be funny in context. Examples: a small "2/10", a thought bubble saying something short, a tiny award ribbon.

QUALITY CHECK before outputting:
- Would each line make a room of comedians laugh? If not, rewrite it.
- Is every joke SPECIFIC to this exact image? If it could apply to anyone, cut it.
- Are you roasting choices/behavior (good) or appearance (bad)?
- Did you go hard enough? Too safe = failure.
- NEVER repeat the same joke, reference, or word across multiple annotations. Every line must be a completely different angle.
- Use simple words everyone knows. No niche/obscure vocabulary. Write at a 7th grade reading level. If your mom wouldn't get the joke, rewrite it.
- The callout text is MAX 8 words. Count them. If it's over 8, shorten it.

Return ONLY this JSON. No markdown, no backticks, no other text:
{
  "callout": {"text": "short punchy line", "points_to": "what the arrow points at"},
  "frame": [
    {"text": "joke with setup and punch", "points_to": "what arrow points at"},
    {"text": "joke with setup and punch", "points_to": "what arrow points at"},
    {"text": "joke with setup and punch", "points_to": "what arrow points at"},
    {"text": "joke with setup and punch", "points_to": "what arrow points at"}
  ],
  "overall_burn": "devastating headline",
  "sketch_idea": "simple doodle description"
}`,
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
    
    // Add 25% padding on ALL sides (equal spacing)
    const padX = Math.round(imgW * 0.25);
    const padY = Math.round(imgH * 0.25);
    const canvasW = imgW + padX * 2;
    const canvasH = imgH + padY * 2;
    
    // Create white canvas with photo centered
    const framedBuffer = await sharp({
      create: { width: canvasW, height: canvasH, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
    })
    .composite([{ input: imgBuffer, left: padX, top: padY }])
    .png()
    .toBuffer();
    
    const framedBase64 = framedBuffer.toString('base64');

    // ═══════ STEP 3: Gemini — Write annotations on the pre-framed image ═══════
    
    const callout = roastData.callout || {};
    
    const frameAnnotations = (roastData.frame || [])
      .map((a, i) => `  ${i + 1}. "${a.text}" — draw an arrow from this text into the photo pointing at ${a.points_to}`)
      .join("\n");

    const geminiPrompt = `This image is a photo with a wide white border around it. Your job is to write funny roast annotations on it using red marker handwriting.

THE IMAGE HAS TWO ZONES:
- THE PHOTO (the image in the center)
- THE WHITE BORDER (the wide white space surrounding the photo on all four sides)

=== WRITE ON THE PHOTO (25% of content — keep it minimal) ===
1. Write "${callout.text || ''}" in red handwriting with a white outline around each letter (so it's readable on any color). Draw a hand-drawn arrow pointing to ${callout.points_to || 'the most obvious thing'}.
2. Draw one tiny simple doodle in an open area of the photo: ${roastData.sketch_idea || "a small funny doodle"}. Keep it tiny.
3. Circle or underline one funny detail.
That is ALL that goes on the photo. Keep it clean.

=== WRITE IN THE WHITE BORDER (75% of content) ===
Write these jokes in the white border space around the photo. Spread them out — some on left, some on right, one on top. Draw hand-drawn arrows from each one pointing into the photo:
${frameAnnotations}

IMPORTANT: This text goes ONLY in the white space. Do NOT write any of these on top of the photo. Only the arrows cross into the photo.

=== BOTTOM OF WHITE BORDER ===
Write in bigger text: "${roastData.overall_burn || ''}"
Bottom-right corner, small: "roastdai.com"

=== HANDWRITING RULES ===
- ALL text must look like real RED SHARPIE handwriting — wobbly, uneven, tilted, different letter sizes
- On the photo: red text with visible WHITE OUTLINE so it pops against any background
- In the white border: plain red text (no outline needed on white)  
- Arrows are wobbly hand-drawn curves, never straight lines
- NEVER use computer fonts, printed text, or typed-looking text anywhere
- Do NOT write any watermarks or stamps across the photo
- Do NOT use any colors besides red for text`;

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

    return res.status(200).json({
      success: true,
      image: `data:${generatedMimeType};base64,${generatedImageBase64}`,
      roastData,
      remaining: req._remaining ?? null,
    });
  } catch (error) {
    console.error("Roast error:", error);
    return res.status(500).json({ error: "Something went wrong. Try again." });
  }
}
