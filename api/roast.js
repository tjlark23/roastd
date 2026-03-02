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

    // ═══════ STEP 2: Gemini — Generate Framed Annotated Image ═══════
    
    const callout = roastData.callout || {};
    const calloutInstruction = `Write "${callout.text || ''}" with a wobbly hand-drawn arrow pointing to ${callout.points_to || 'the center of the photo'}`;

    const frameAnnotations = (roastData.frame || [])
      .map((a, i) => `  ${i + 1}. "${a.text}" with arrow pointing to ${a.points_to}`)
      .join("\n");

    const geminiPrompt = `You are creating a funny roast image. Follow these instructions EXACTLY.

=== CANVAS LAYOUT (critical — get this right first) ===
Create a large canvas. The uploaded photo goes in the CENTER and should be SMALL relative to the total canvas — only about 45-50% of the total area. Surround the photo with a VERY WIDE pure white border:
- Left border: 25% of total canvas width
- Right border: 25% of total canvas width  
- Top border: 15% of total canvas height
- Bottom border: 20% of total canvas height (extra room for the headline)

The photo should look like a printed photo sitting on a big white desk/poster with tons of white space around it for writing.

=== ZONE 1: ON THE PHOTO (very minimal) ===
Only these things go on the actual photo itself:
1. ${calloutInstruction} — use RED text with a THICK WHITE OUTLINE around every letter so it's readable on any background color. The white outline should be visible and make the red text pop against any image color.
2. One tiny simple sketch/doodle in an open area: ${roastData.sketch_idea || "a small funny doodle"}. Red ink with white outline. Keep it very small.
3. One circle or underline around something funny.

That's IT on the photo. Nothing else. Keep the photo clean.

=== ZONE 2: IN THE WHITE BORDER (this is where the main jokes go) ===
ALL of these annotations go ENTIRELY within the white border area. Do NOT let any of this text overlap onto the photo. The text stays in the white space, and only the arrows cross into the photo to point at things:
${frameAnnotations}

Spread them around: 1-2 on the left side, 1-2 on the right side, and maybe one on top. Each one has a hand-drawn arrow that reaches from the text in the white border INTO the photo pointing at the target.

=== ZONE 3: BOTTOM OF WHITE BORDER ===
In the bottom white border area, write bigger: "${roastData.overall_burn || ''}"
In the bottom-right corner, write small: "roastdai.com"

=== TEXT STYLE (follow strictly) ===
ALL text everywhere must look like authentic RED SHARPIE HANDWRITING on paper:
- Every letter slightly different size, slightly tilted, slightly wobbly
- Natural handwriting imperfections — some letters bigger, some smaller, not on a straight line
- Like a real person actually scrawled this with a marker, not like a computer handwriting font
- Arrows are curved wobbly hand-drawn lines, never straight
- For text ON the photo: red handwriting with a visible WHITE OUTLINE/STROKE around each letter (so it reads on any background)
- For text IN the white border: plain red handwriting (no outline needed since it's on white)
- NEVER use any computer font, typed text, or digital-looking text. If it looks printed, you've failed.

=== ABSOLUTE RULES ===
- The white border must be VERY WIDE — at least 25% of canvas width on left and right
- Text in the white border must stay ENTIRELY in the white border, not creep onto the photo
- Only the arrows cross from the white border onto the photo
- The photo should look relatively clean with minimal writing on it
- Do NOT use any computer/printed/digital fonts anywhere
- Do NOT make arrows perfectly straight
- Do NOT put text in boxes, speech bubbles, or banners`;

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mimeType || "image/png", data: image } },
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
