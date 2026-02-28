// Roastd.ai — Cloudflare Pages Function
// Path: functions/api/roast.js
// Handles: POST /api/roast
// Flow: Claude Opus 4.6 (analyze + write roast) → Nano Banana 2 (generate annotated image)

const CATEGORY_PROMPTS = {
  linkedin: `Analyze this LinkedIn screenshot. Look for:
- Headline (buzzwords, vague claims, pipe-separated title spam)
- Job titles (inflated, meaningless, startup nonsense)
- Profile photo (corporate try-hard, casual try-hard, background choices)
- About section if visible (humble brags, "passionate about")
- Any banners, CTAs, or "open to work" energy
Write 4 brutal roast annotations targeting their professional cringe. Mock their choices, not their appearance.`,

  twitter: `Analyze this Twitter/X screenshot. Look for:
- Bio (personality claims, links, what they're selling)
- Profile photo energy, follower ratio if visible
- Display name and handle (cringe, try-hard, or desperate)
- Any badges, subscriptions, or clout chasing signals
Write 4 brutal roast annotations targeting their Twitter personality. Mock their choices, not their appearance.`,

  dating: `Analyze this dating profile screenshot. Look for:
- Photo choices (group photos, mirror selfies, fish pics)
- Bio cliches ("tacos", "The Office", "fluent in sarcasm")
- Prompt answers that reveal too much or too little
Write 4 brutal roast annotations targeting their dating profile cliches. Mock desperation, not appearance.`,

  pet: `Analyze this pet photo. Look for:
- The pet's expression (judging the owner, done with life)
- Outfit/costume if any (the pet did NOT consent)
- Setting, accessories
Write 4 brutal roast annotations FROM THE PET'S PERSPECTIVE roasting their owner.`,

  selfie: `Analyze this selfie. Look for:
- Setting (bathroom mirror, car, gym)
- Angles, filters, expression
- Background disasters
Write 4 brutal roast annotations about their selfie game and need for validation. Mock choices, not appearance.`,

  room: `Analyze this room/apartment photo. Look for:
- Cleanliness, decoration choices
- Cable management nightmares
- Furniture that tells a story about their life stage
Write 4 brutal roast annotations about their life choices as shown by their living space.`,

  wedding: `Analyze this wedding photo. Look for:
- Pinterest-inspired poses
- Venue/setting, fashion choices
- Any props or themed elements
Write 4 brutal roast annotations about the wedding Pinterest board energy. Funny, not mean about the relationship.`,

  gym: `Analyze this gym/fitness photo. Look for:
- The flex pose or "casual" flex
- Outfit, equipment, mirror selfie quality
- Background gym-goers who definitely noticed
Write 4 brutal roast annotations about their need to document working out.`,

  resume: `Analyze this resume screenshot. Look for:
- Inflated job titles, outdated skills
- Formatting choices, buzzwords
- Any gaps or suspicious timelines
Write 4 brutal roast annotations about their resume and professional history.`,

  car: `Analyze this car photo. Look for:
- What the car says about the owner
- How they photographed it
- Modifications, accessories, cleanliness
Write 4 brutal roast annotations about their car and what it reveals about their personality.`,
};

const STYLE_PROMPTS = {
  genz: `Write in Gen Z slang: lowkey, no cap, fr fr, giving, delulu, bruh, it's giving, rent free, ick. Casual lowercase energy. Short punchy observations. Sound like a real person, not a parody.`,
  boomer: `Write as a confused, disappointed Boomer Dad. "Back in my day" energy. References mowing lawns, real jobs, firm handshakes. Deadpan. Genuinely baffled by this person's choices.`,
  shakespeare: `Write in Shakespearean English. Use thee, thou, verily, forsooth, doth, hath, methinks. Dramatically insulting. Literary wit mixed with genuine disgust.`,
  asian_parent: `Write as a Disappointed Asian Parent. Compare to cousins who are doctors. Question every life choice. "Why not doctor?" energy. Short, devastating comparisons. Palpable guilt.`,
  jackson: `Write as Samuel L. Jackson. Aggressive, intense. Use "motherfucker" naturally. Bold, confrontational. Every annotation feels like SLJ is personally offended. Pulp Fiction energy.`,
  coworker: `Write as a Passive Aggressive Coworker. "Per my last email" energy. Backhanded compliments. Fake niceness masking judgment. Corporate speak delivering devastating observations.`,
  jewish_mom: `Write as a Jewish Mother. Guilt trips wrapped in love. Compare to cousins, neighbors' children. "I'm not saying anything, I'm just saying." Concerned disappointment.`,
  british: `Write as British Royalty. "How frightfully common" energy. Dry, withering observations. Words like: dreadful, ghastly, quite, rather, how vulgar. Maximum condescension with perfect manners.`,
  aussie: `Write as an Australian Bogan. Use: mate, yeah nah, get fucked, cooked, drongo, bloody hell, fair dinkum. Blunt, no-filter Australian honesty. Casual brutality.`,
  redneck: `Write as a Redneck. Use: boy, what in tarnation, I tell you what, dang, reckon, ain't, bless your heart. Southern observations from a porch with a beer.`,
};

export async function onRequestPost(context) {
  try {
    const { image, mimeType, category, style } = await context.request.json();

    if (!image || !category || !style) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const ANTHROPIC_API_KEY = context.env.ANTHROPIC_API_KEY;
    const GOOGLE_API_KEY = context.env.GOOGLE_API_KEY;

    if (!ANTHROPIC_API_KEY || !GOOGLE_API_KEY) {
      return new Response(JSON.stringify({ error: "API keys not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const categoryPrompt = CATEGORY_PROMPTS[category] || CATEGORY_PROMPTS.selfie;
    const stylePrompt = STYLE_PROMPTS[style] || STYLE_PROMPTS.genz;

    // ═══════════════════════════════════════════
    // STEP 1: Claude Opus 4.6 — Analyze + Write Roast
    // ═══════════════════════════════════════════
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
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mimeType || "image/png",
                  data: image,
                },
              },
              {
                type: "text",
                text: `You are a brutal but hilarious roast comedian. Your job is to analyze this image and write devastating roast annotations.

${categoryPrompt}

STYLE INSTRUCTIONS:
${stylePrompt}

For each of your 4 annotations:
- Keep it SHORT (max 10 words each)
- Be specific to what you actually see in the image
- Be mean about their choices and behavior, not physical appearance
- Make it genuinely funny, not just mean

Also write one "overall burn" — a single devastating summary line (max 15 words).

Return ONLY valid JSON in this exact format, no markdown, no backticks:
{
  "annotations": [
    {"text": "annotation text here", "location": "where it points - e.g. headshot, headline, bio, top-left area"},
    {"text": "annotation text here", "location": "where it points"},
    {"text": "annotation text here", "location": "where it points"},
    {"text": "annotation text here", "location": "where it points"}
  ],
  "overall_burn": "the devastating summary line"
}`,
              },
            ],
          },
        ],
      }),
    });

    if (!claudeResponse.ok) {
      const errText = await claudeResponse.text();
      console.error("Claude API error:", errText);
      return new Response(
        JSON.stringify({ error: "Claude couldn't process this image. Try again." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const claudeData = await claudeResponse.json();
    const claudeText = claudeData.content?.[0]?.text || "";

    let roastData;
    try {
      const cleanedText = claudeText.replace(/```json\n?|\n?```/g, "").trim();
      roastData = JSON.parse(cleanedText);
    } catch (e) {
      console.error("Failed to parse Claude response:", claudeText);
      return new Response(
        JSON.stringify({ error: "Claude was too brutal to be contained. Try again." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // ═══════════════════════════════════════════
    // STEP 2: Build Nano Banana 2 Prompt
    // ═══════════════════════════════════════════
    const annotationList = roastData.annotations
      .map((a, i) => `${i + 1}. "${a.text}" — draw this with an arrow pointing to ${a.location}`)
      .join("\n");

    const geminiPrompt = `Take this uploaded image and add hand-drawn red marker annotations roasting it.

Add these specific annotations with arrows pointing to the relevant areas:

${annotationList}

At the bottom or in a clear space, write in larger text: "${roastData.overall_burn}"

Style requirements:
- Messy, actual handwriting style — like someone's real handwriting with a red sharpie, NOT a computer font
- Slightly tilted text, imperfect letters, varying sizes like real human writing
- Draw arrows from the text to the specific areas mentioned
- Circle one or two things for emphasis
- Keep the original image fully visible underneath
- The vibe is: your funniest friend got drunk, printed this photo, and scribbled all over it with a red marker
- Add small "Roastd.ai" text in the bottom-right corner`;

    // ═══════════════════════════════════════════
    // STEP 3: Nano Banana 2 (gemini-3.1-flash-image-preview)
    // ═══════════════════════════════════════════
    const geminiRequestBody = {
      contents: [
        {
          parts: [
            {
              inline_data: {
                mime_type: mimeType || "image/png",
                data: image,
              },
            },
            { text: geminiPrompt },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    };

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiRequestBody),
      }
    );

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error("Gemini API error:", errText);
      return new Response(
        JSON.stringify({ error: "Nano Banana 2 couldn't generate the image. Try again." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const geminiData = await geminiResponse.json();
    const candidates = geminiData.candidates;

    if (!candidates || candidates.length === 0) {
      return new Response(
        JSON.stringify({ error: "No image generated. The roast was too powerful." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Find the image in the response
    let generatedImageBase64 = null;
    let generatedMimeType = "image/png";

    for (const part of candidates[0].content.parts) {
      if (part.inline_data && part.inline_data.mime_type?.startsWith("image/")) {
        generatedImageBase64 = part.inline_data.data;
        generatedMimeType = part.inline_data.mime_type;
        break;
      }
      // Also check camelCase variant (API inconsistency)
      if (part.inlineData && part.inlineData.mimeType?.startsWith("image/")) {
        generatedImageBase64 = part.inlineData.data;
        generatedMimeType = part.inlineData.mimeType;
        break;
      }
    }

    if (!generatedImageBase64) {
      return new Response(
        JSON.stringify({ error: "No image in response. Try again." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        image: `data:${generatedMimeType};base64,${generatedImageBase64}`,
        roastData: roastData,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Roast error:", error);
    return new Response(
      JSON.stringify({ error: "Something went wrong. Try again." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
