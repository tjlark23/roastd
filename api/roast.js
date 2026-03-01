// api/roast.js — Roastd AI v3
// Claude Opus 4.6 (extended thinking + deep analysis) → Gemini (framed annotated image)

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
  linkedin: `This is a LinkedIn profile screenshot. Study it CAREFULLY. Read every word. Look at:
- Their headline: what buzzwords are they using? What do they ACTUALLY do vs what they claim?
- Their photo: corporate headshot? Casual? Arms crossed power pose? Weird background?
- Follower/connection count: flex or embarrassing?
- Any "Open to Work" banner?
- Job title inflation ("Chief Synergy Officer")
- Humble brags in the about section
- Endorsements, featured posts, anything cringe
The comedy goldmine is the GAP between who they ARE and who they're PRETENDING to be on LinkedIn.`,

  twitter: `This is a Twitter/X profile screenshot. Study every detail:
- Bio: what personality are they performing? "Thought leader"? Emoji soup? Podcast link?
- Follower/following ratio: are they desperate? Or are they getting ratio'd?
- Display name vs handle: cringe mismatch?
- Pinned tweet energy
- Blue checkmark (paid for clout?)
- Header image choices
The comedy is in their desperate need for engagement and the persona they've constructed.`,

  dating: `This is a dating profile screenshot. Analyze everything:
- Photo choices: bathroom mirror selfie? Group photo where you can't tell who they are? Fish pic? Machu Picchu pic everyone has?
- Bio cliches: "love tacos", "fluent in sarcasm", "The Office", "looking for partner in crime"
- Prompt answers that reveal too much or too little
- Height listed (or conspicuously not listed)
- "Just ask" energy
The comedy is in the universal dating app desperation and the cliches they think make them unique.`,

  pet: `This is a photo with a pet. The twist: WRITE FROM THE PET'S PERSPECTIVE roasting their owner.
- What is the pet's expression saying about their owner?
- Is the pet in a costume? (The pet has opinions about this)
- What does the background reveal about the owner's life?
- Is this pet clearly the more attractive one in the household?
The pet is smarter than the owner and wants everyone to know it.`,

  selfie: `This is a selfie. Analyze the full scene:
- Location: bathroom? Car? Gym? Bedroom chaos in background?
- Angle: the chin-up "hide the double chin" angle? The "I'm looking away pretending I don't know there's a camera" angle?
- Filter usage level
- What's happening in the background they didn't notice?
- The lighting they think is good
The comedy is in the desperate need for external validation through selfies.`,

  room: `This is a photo of someone's room/living space. CSI-level analysis:
- Cleanliness disaster areas they probably didn't notice
- Decoration choices that reveal their personality
- The gaming setup vs the rest of the room ratio
- Cable management (or lack thereof)
- What does this room say about their dating life?
- Anything on the walls? Tapestries? LED strips? Live Laugh Love?
The room is a crime scene of life choices.`,

  wedding: `This is a wedding photo. Look for:
- Pinterest-board-come-to-life energy
- Pose choices (the dip, the forehead touch, the looking-different-directions)
- Bridesmaids/groomsmen suffering
- Venue flex or budget reveal
- Mason jars, burlap, "love is sweet take a treat"
- Sparkler exit that took 45 minutes to set up
The comedy is in the industrial wedding complex, not the actual couple's relationship.`,

  gym: `This is a gym/fitness photo. Full analysis:
- The pump is temporary but the photo is forever
- Are they flexing but pretending they're not?
- What equipment are they near? (Using the machines wrong?)
- Mirror selfie with phone covering face
- Outfit choices: full matching set or ratty college shirt?
- "Just finished" sweat performance
The comedy is in their need to document exercise instead of just doing it.`,

  resume: `This is a resume screenshot. Read it like a detective:
- Job title inflation ("Led cross-functional synergies")
- Skills section hilarity (Microsoft Word in 2024?)
- Employment gaps they're trying to hide
- Font and formatting crimes
- "References available upon request" (nobody asked)
- Objective statement that means nothing
The comedy is in professional embellishment and resume theater.`,

  car: `This is a car photo. Full personality analysis:
- What does this car say about who they WANT to be?
- How they photographed it (golden hour? Gas station?)
- Modifications or accessories that tell a story
- Interior cleanliness (or dashboard archaeology)
- Is this a "just washed it" flex?
- Bumper stickers? Air freshener? Steering wheel cover?
The car is a personality test they didn't know they were taking.`,
};

const STYLE_PROMPTS = {
  genz: `VOICE: Gen Z roasting their elders. Use: lowkey, no cap, fr fr, giving, delulu, bruh, it's giving, ick, slay (sarcastic), the way I screamed, I can't, bestie (condescending), rent free, that's so cheugy. Short sentences. Lowercase energy. Like you're texting your group chat screenshots of this person.`,

  boomer: `VOICE: A confused, disappointed Boomer Dad who just discovered the internet. References: mowing the lawn, firm handshakes, "back in my day we had REAL jobs", Vietnam or "the war", newspapers, his buddy Gary from the lodge. He's genuinely baffled by modern life. Deadpan delivery. Everything reminds him of something that was better in 1978.`,

  shakespeare: `VOICE: Shakespeare writing his most savage play yet. Use thee, thou, verily, forsooth, doth, hath, methinks, pray tell, villain, knave, varlet, wretch. The insults should sound like lost passages from his lesser-known works. Dramatically over-the-top disgust delivered in perfect iambic rhythm.`,

  asian_parent: `VOICE: Disappointed Asian Parent at the dinner table. Compare EVERYTHING to cousins, doctor neighbors, anyone doing better. "Why not doctor?" "Your cousin bought house already." Short devastating comparisons. Mix in some guilt: "I sacrifice everything and THIS is what you do?" The disappointment should be PALPABLE. Love expressed only through criticism.`,

  jackson: `VOICE: Samuel L. Jackson personally offended by this image. Use "motherfucker" naturally (not forced). Pulp Fiction meets a comedy roast. He's ANGRY but articulate. "Say what one more time" energy. Bold, confrontational, personally insulted that this image exists. Capital letters for emphasis. He can't believe what he's looking at.`,

  coworker: `VOICE: Your passive-aggressive coworker who's "just trying to help." Uses: "Per my last email...", "Just circling back...", "Not sure if you saw my message...", "No worries at all! :)", "That's certainly ONE way to do it..." Backhanded compliments dripping with fake niceness. CC's your manager on the roast. Corporate speak delivering absolute devastation.`,

  jewish_mom: `VOICE: Jewish Mother who only wants the best for you (and for you to know how much she suffers). Guilt wrapped in love. "I'm not saying anything, I'm just saying..." Compares you to the Goldstein's son (the doctor). Mentions her health whenever criticized. "You don't call, you don't write, and NOW this?" Every roast ends with offering food.`,

  british: `VOICE: British Royalty who's been forced to look at something frightfully common. Words: dreadful, ghastly, quite, rather, how vulgar, one simply doesn't, good heavens, I do declare, positively medieval. Maximum condescension with perfect manners. They'd never stoop to actual anger; they're simply... deeply, quietly appalled. Dry wit that cuts without raising its voice.`,

  aussie: `VOICE: Australian Bogan at the pub seeing this image for the first time. Use: mate, yeah nah, get fucked, cooked, drongo, bloody hell, fair dinkum, strewth, no wuckas, she'll be right, chuck a sickie, bogan, have a go ya mug. ZERO filter. Blunt Australian honesty delivered while holding a VB. Not mean-spirited, just absolutely no filter between brain and mouth.`,

  redneck: `VOICE: Redneck on his porch with a beer, philosophizing about what he's seeing. Use: boy, what in tarnation, I tell you what, I reckon, dang, ain't, bless your heart (devastating), fixin' to, yonder, down yonder, like a [animal] doing [thing]. Southern observations that are accidentally profound. He means well but has no chill. References his truck, his cousin, church on Sunday.`,
};

export const config = {
  maxDuration: 120,
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
          message: "You've used your 3 free roasts today.",
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

    // ═══════ STEP 1: Claude Opus 4.6 — Deep Analysis + Comedy Writing ═══════
    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 16000,
        thinking: {
          type: "enabled",
          budget_tokens: 10000,
        },
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mimeType || "image/png", data: image },
            },
            {
              type: "text",
              text: `You are a PROFESSIONAL ROAST COMEDIAN writing material for a comedy special. This isn't a casual joke — this is your career. Every line needs to LAND.

STEP 1 — DEEP IMAGE ANALYSIS (use your thinking to study this):
${categoryPrompt}

Read every visible word. Count followers. Read bios. Note specific details. The SPECIFICITY is what makes roasts funny. "Nice photo" isn't funny. "You spent $200 on a ring light and THIS is the result" is funny.

STEP 2 — WRITE THE ROAST
${stylePrompt}

Write exactly 7 roast annotations. Here's how they'll be used on the image:
- Annotations 1-2: These go DIRECTLY ON the image as hand-drawn red text. Keep these punchy (under 12 words). These should reference something visually obvious.
- Annotations 3-7: These go in a WHITE FRAME around the image with arrows pointing to specific things. These can be longer (up to 20 words) and more detailed/funny since they have space.

Also write:
- 1 "overall_burn" headline (max 12 words) — goes at the bottom of the frame. This is the TITLE of the roast. Make it devastating.
- 1 "sketch_idea" — a tiny funny doodle to add to the image (e.g., "thought bubble above their head saying 'I peaked in 2019'", "a trophy labeled 'World's Most Average'", "a Yelp star rating: 2.5 stars"). Keep it simple enough to draw.

COMEDY RULES:
- Be SPECIFIC to what you see. Generic = death. Reference exact things in the image.
- Setup + punchline structure. Don't just describe — make a JOKE.
- Punch UP on their choices, not DOWN on their appearance.
- Go harder than you think you should. Milquetoast is worse than too far.
- Weird, unexpected angles are funnier than obvious ones.
- If something is genuinely impressive, roast the flex itself.
- Pop culture references that fit = gold.
- Each annotation should make someone laugh out loud, not just smirk.

Return ONLY valid JSON, no markdown, no backticks:
{
  "on_image": [
    {"text": "...", "location": "specific area of image this points to"},
    {"text": "...", "location": "specific area"}
  ],
  "in_frame": [
    {"text": "...", "location": "what the arrow points to in the image"},
    {"text": "...", "location": "..."},
    {"text": "...", "location": "..."},
    {"text": "...", "location": "..."},
    {"text": "...", "location": "..."}
  ],
  "overall_burn": "devastating headline summary",
  "sketch_idea": "simple funny doodle description"
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
    
    // Extract text from response (may have thinking blocks)
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
    
    // Build annotation instructions for ON the image
    const onImageAnnotations = (roastData.on_image || [])
      .map((a, i) => `ON-IMAGE ${i + 1}: Write "${a.text}" with arrow pointing to ${a.location}`)
      .join("\n");

    // Build annotation instructions for IN the frame
    const inFrameAnnotations = (roastData.in_frame || [])
      .map((a, i) => `FRAME ${i + 1}: Write "${a.text}" with arrow from the white frame pointing into the image at ${a.location}`)
      .join("\n");

    const geminiPrompt = `TASK: Create a roast image with a WHITE FRAME around the original photo, with hand-drawn annotations.

LAYOUT INSTRUCTIONS:
1. Place the uploaded image in the CENTER, slightly reduced in size (about 70-75% of the total canvas)
2. Surround it with a WHITE BORDER/FRAME on all sides (like a photo in a white picture frame or matte)
3. The white frame should be wide enough to write text in — about 15-20% of the image width on each side

ANNOTATIONS ON THE IMAGE (red marker, hand-drawn style):
${onImageAnnotations}

ANNOTATIONS IN THE WHITE FRAME (written in the white border area, with arrows pointing into the image):
${inFrameAnnotations}

SKETCH/DOODLE (small, funny, hand-drawn):
${roastData.sketch_idea || "a small funny doodle"}

BOTTOM OF FRAME:
Write the headline: "${roastData.overall_burn}" in larger hand-drawn text at the bottom of the white frame.
In the bottom-right corner of the white frame, write "roastdai.com" in small neat text.

STYLE REQUIREMENTS:
- ALL text must be hand-drawn red marker/sharpie style (NOT computer font)
- Slightly messy, tilted, varying sizes — like someone actually scribbled on a printed photo
- Arrows should be hand-drawn, not straight
- Circle or underline 1-2 things on the actual image
- The white frame should be CLEAN white — text and arrows only
- Keep the original image fully visible and clear
- The sketch/doodle should be simple and small`;

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
