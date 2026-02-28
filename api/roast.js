// api/roast.js — Vercel Serverless Function
// POST /api/roast
// Claude Opus 4.6 (analyze + write) → Nano Banana 2 (generate annotated image)

const CATEGORY_PROMPTS = {
  linkedin: `Analyze this LinkedIn screenshot. Look for: Headline buzzwords, inflated job titles, corporate try-hard photos, humble brags, "open to work" energy. Write 4 brutal roast annotations targeting professional cringe. Mock choices, not appearance.`,
  twitter: `Analyze this Twitter/X screenshot. Look for: Bio personality claims, follower ratio, display name cringe, badges, clout chasing. Write 4 brutal roast annotations targeting their Twitter personality.`,
  dating: `Analyze this dating profile screenshot. Look for: Photo choices (group photos, mirror selfies, fish pics), bio cliches ("tacos", "The Office", "fluent in sarcasm"), prompt answers. Write 4 brutal roast annotations targeting dating profile cliches.`,
  pet: `Analyze this pet photo. Look for: Pet's expression, outfit/costume, setting, accessories. Write 4 brutal roast annotations FROM THE PET'S PERSPECTIVE roasting their owner.`,
  selfie: `Analyze this selfie. Look for: Setting (bathroom mirror, car, gym), angles, filters, background disasters. Write 4 brutal roast annotations about their selfie game and need for validation.`,
  room: `Analyze this room/apartment photo. Look for: Cleanliness, decoration choices, cable management, furniture. Write 4 brutal roast annotations about their life choices as shown by their living space.`,
  wedding: `Analyze this wedding photo. Look for: Pinterest-inspired poses, venue, fashion choices, props. Write 4 brutal roast annotations about the wedding Pinterest board energy. Funny, not mean about the relationship.`,
  gym: `Analyze this gym/fitness photo. Look for: Flex pose, outfit, equipment, mirror selfie quality, background gym-goers. Write 4 brutal roast annotations about their need to document working out.`,
  resume: `Analyze this resume screenshot. Look for: Inflated job titles, outdated skills, formatting choices, buzzwords, gaps. Write 4 brutal roast annotations about their resume.`,
  car: `Analyze this car photo. Look for: What the car says about the owner, how they photographed it, modifications, cleanliness. Write 4 brutal roast annotations about their car and personality.`,
};

const STYLE_PROMPTS = {
  genz: `Write in Gen Z slang: lowkey, no cap, fr fr, giving, delulu, bruh, it's giving. Casual lowercase. Short punchy. Sound real, not parody.`,
  boomer: `Write as confused, disappointed Boomer Dad. "Back in my day" energy. References mowing lawns, real jobs, firm handshakes. Deadpan, genuinely baffled.`,
  shakespeare: `Write in Shakespearean English. Use thee, thou, verily, forsooth, doth, hath, methinks. Dramatically insulting. Literary wit + genuine disgust.`,
  asian_parent: `Write as Disappointed Asian Parent. Compare to doctor/lawyer cousins. Question every choice. "Why not doctor?" Short devastating comparisons. Palpable guilt.`,
  jackson: `Write as Samuel L. Jackson. Aggressive, intense. Use "motherfucker" naturally. Bold, confrontational. Pulp Fiction energy. Personally offended.`,
  coworker: `Write as Passive Aggressive Coworker. "Per my last email" energy. Backhanded compliments. Fake niceness masking judgment. Corporate speak delivering devastation.`,
  jewish_mom: `Write as Jewish Mother. Guilt trips wrapped in love. Compare to cousins, neighbors' children. "I'm not saying anything, I'm just saying." Concerned disappointment.`,
  british: `Write as British Royalty. "How frightfully common" energy. Dry, withering. Words: dreadful, ghastly, quite, rather, how vulgar. Maximum condescension with perfect manners.`,
  aussie: `Write as Australian Bogan. Use: mate, yeah nah, get fucked, cooked, drongo, bloody hell, fair dinkum. Blunt no-filter Australian honesty.`,
  redneck: `Write as Redneck. Use: boy, what in tarnation, I tell you what, dang, reckon, ain't, bless your heart. Southern observations from a porch with a beer.`,
};

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image, mimeType, category, style } = req.body;

    if (!image || !category || !style) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

    if (!ANTHROPIC_API_KEY || !GOOGLE_API_KEY) {
      return res.status(500).json({ error: "API keys not configured" });
    }

    const categoryPrompt = CATEGORY_PROMPTS[category] || CATEGORY_PROMPTS.selfie;
    const stylePrompt = STYLE_PROMPTS[style] || STYLE_PROMPTS.genz;

    // ═══════ STEP 1: Claude Opus 4.6 — Analyze + Write Roast ═══════
    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mimeType || "image/png", data: image },
            },
            {
              type: "text",
              text: `You are a brutal but hilarious roast comedian. Analyze this image and write devastating roast annotations.

${categoryPrompt}

STYLE: ${stylePrompt}

Rules:
- 4 annotations, max 10 words each
- Be specific to what you SEE
- Mock choices/behavior, not physical appearance
- Genuinely funny, not just mean
- One "overall burn" summary line (max 15 words)

Return ONLY valid JSON, no markdown:
{"annotations":[{"text":"...","location":"where it points"},{"text":"...","location":"..."},{"text":"...","location":"..."},{"text":"...","location":"..."}],"overall_burn":"devastating summary"}`,
            },
          ],
        }],
      }),
    });

    if (!claudeResponse.ok) {
      console.error("Claude error:", await claudeResponse.text());
      return res.status(500).json({ error: "Claude couldn't process this image. Try again." });
    }

    const claudeData = await claudeResponse.json();
    const claudeText = claudeData.content?.[0]?.text || "";

    let roastData;
    try {
      roastData = JSON.parse(claudeText.replace(/```json\n?|\n?```/g, "").trim());
    } catch (e) {
      console.error("Parse error:", claudeText);
      return res.status(500).json({ error: "Claude was too brutal to be contained. Try again." });
    }

    // ═══════ STEP 2: Nano Banana 2 — Generate Annotated Image ═══════
    const annotationList = roastData.annotations
      .map((a, i) => `${i + 1}. "${a.text}" — arrow pointing to ${a.location}`)
      .join("\n");

    const geminiPrompt = `Take this uploaded image and add hand-drawn red marker annotations roasting it.

Annotations with arrows:
${annotationList}

At the bottom write in larger text: "${roastData.overall_burn}"

Style: Messy real handwriting with red sharpie (NOT computer font). Slightly tilted, imperfect letters, varying sizes. Draw arrows to specific areas. Circle one or two things. Keep original image fully visible underneath. Add small "Roastd.ai" in bottom-right corner.`;

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
      console.error("Gemini error:", await geminiResponse.text());
      return res.status(500).json({ error: "Image generation failed. Try again." });
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
    });
  } catch (error) {
    console.error("Roast error:", error);
    return res.status(500).json({ error: "Something went wrong. Try again." });
  }
}
