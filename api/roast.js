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
              text: `You write roasts for the internet. Not corporate comedy. Not "ha that's clever." The kind of shit people screenshot and send to group chats. The kind that makes someone go "OH NO" and then laugh for 10 seconds.

STEP 1 — LOOK AT THIS IMAGE AND LIST EVERYTHING YOU SEE:
Read every word of text. Note every number. Describe what the person is wearing, doing, where they are. What are they trying to project? What does the background reveal? What details did they NOT realize were visible? Write this list in your head before doing anything else.

${categoryPrompt}

STEP 2 — FIND THE FUNNIEST ANGLES:
For each detail you noticed, ask: "What's the meanest, funniest thing I could say about this?" The best roasts take something the person is PROUD of and flip it into something embarrassing.

THE FORMULA: [specific detail from the image] + [unexpected reframe that makes it embarrassing/devastating]

EXAMPLES OF ACTUALLY FUNNY ROASTS:
- "59k followers and every single one is watching you fumble this"
- "'View my newsletter' is doing more work than whatever beehiiv does"
- "Paid for LinkedIn Premium like that's gonna fix the headshot"
- "178 mutual connections and not one of them would hire you"
- "University of Maryland on the profile like that's the flex you think it is"
- "That astronaut meme as your banner tells me everything about your marketing budget"

EXAMPLES OF UNFUNNY GARBAGE (do NOT write like this):
- "Interesting profile!" (not a joke)
- "Cofounder/CEO is giving unemployed" (barely English, no punchline)
- "59,600 followers watching someone cosplay" (too wordy, no punch)
- "Slowly run out of runway mate" (vague, not specific enough)
- Any sentence that just DESCRIBES what you see without adding a twist

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

BEFORE YOU OUTPUT: Read every joke. Is it actually funny or just a description with attitude? If you're not sure, it's not funny. Rewrite it until it hits.`,
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
    const framedBuffer = await sharp({
      create: { width: canvasW, height: canvasH, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
    })
    .composite([{ input: imgBuffer, left: padX, top: padTop }])
    .png()
    .toBuffer();
    
    const framedBase64 = framedBuffer.toString('base64');

    // ═══════ STEP 3: Gemini — Write annotations on the pre-framed image ═══════
    
    const callout = roastData.callout || {};
    
    const frameAnnotations = (roastData.frame || [])
      .map((a, i) => `  ${i + 1}. "${a.text}" — draw an arrow from this text into the photo pointing at ${a.points_to}`)
      .join("\n");

    const geminiPrompt = `This image shows a photo centered on a large white background. Your job: annotate it like someone printed this photo and went at it with a red Sharpie while laughing.

THE PHOTO = the image in the center.
THE WHITE SPACE = the wide white border around the photo.

=== THINGS THAT GO ON THE PHOTO ITSELF ===
Do these directly on top of the photo:
1. Write "${callout.text || ''}" in MESSY red marker handwriting. Add a thick white outline/shadow behind each letter so it pops against any background color. Draw a sloppy curved arrow pointing to ${callout.points_to || 'the most obvious thing'}.
2. Draw a small funny sketch/doodle in an open area of the photo: ${roastData.sketch_idea || "a small funny doodle"}. Red ink, white outline. Keep it small but visible — like a quick Sharpie scribble.
3. Circle or underline one thing on the photo that's funny.
These three things MUST appear on the actual photo, not in the white space.

=== THINGS THAT GO IN THE WHITE SPACE ===
Write these jokes in the white border around the photo. Spread them evenly — 1-2 on the left side, 1-2 on the right side, 1 near the top. Draw messy curved arrows from each joke into the photo:
${frameAnnotations}

=== BOTTOM OF WHITE SPACE ===
Write the headline in bigger messy letters: "${roastData.overall_burn || ''}"

=== HANDWRITING STYLE (critical) ===
Make ALL text look like SLOPPY real handwriting. NOT neat. NOT professional. Think:
- A drunk person scrawling with a fat red Sharpie
- Letters different sizes, some tilted left, some tilted right
- Words not perfectly straight — they drift up or down
- Some letters connected, some not
- Arrows are wobbly curved lines that look hand-drawn
- Circles are imperfect ovals
- It should look HUMAN and MESSY, not like a handwriting font

=== BANNED (do not do any of these) ===
- Do NOT write "roastdai" or "roastdai.com" or any website URL anywhere
- Do NOT add any watermarks, stamps, or logos anywhere on the image
- Do NOT use computer fonts, printed text, or neat handwriting
- Do NOT use any color besides red for text and arrows
- Do NOT make arrows straight`;

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${GOOGLE_API_KEY}`,
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

    // Add roastdai.com watermark via code (bottom-right corner)
    try {
      const resultBuffer = Buffer.from(generatedImageBase64, 'base64');
      const resultMeta = await sharp(resultBuffer).metadata();
      const rW = resultMeta.width || 800;
      const rH = resultMeta.height || 800;
      const fontSize = Math.max(16, Math.round(rW * 0.025));
      const padding = Math.round(fontSize * 0.8);
      
      // Create a small image with the watermark text using SVG with embedded font
      const svgWatermark = Buffer.from(`<svg width="${rW}" height="${rH}" xmlns="http://www.w3.org/2000/svg">
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Patrick+Hand');
          .wm { font-family: 'Patrick Hand', 'Comic Sans MS', cursive, sans-serif; }
        </style>
        <text x="${rW - padding}" y="${rH - padding}" class="wm" font-size="${fontSize}" fill="#cc0000" text-anchor="end" opacity="0.6" font-style="italic">roastdai.com</text>
      </svg>`);
      
      const watermarkedBuffer = await sharp(resultBuffer)
        .composite([{ input: svgWatermark, top: 0, left: 0 }])
        .png()
        .toBuffer();
      
      generatedImageBase64 = watermarkedBuffer.toString('base64');
      generatedMimeType = 'image/png';
    } catch (wmErr) {
      console.error("Watermark error (non-fatal):", wmErr.message);
      // Continue without watermark if it fails
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
