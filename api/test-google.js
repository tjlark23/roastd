export default async function handler(req, res) {
  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
  if (!GOOGLE_API_KEY) return res.status(500).json({ error: "No Google key" });
  
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "say hello in 3 words" }] }] }),
      }
    );
    const data = await resp.text();
    
    // Also test the image model
    const resp2 = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "draw a red circle" }] }], generationConfig: { responseModalities: ["TEXT","IMAGE"] } }),
      }
    );
    const data2 = await resp2.text();
    
    // Also test gemini-3.1-flash-image-preview (the one we use)
    const resp3 = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "draw a red circle" }] }], generationConfig: { responseModalities: ["TEXT","IMAGE"] } }),
      }
    );
    const data3 = await resp3.text();

    return res.status(200).json({
      flash_exp: { status: resp.status, body: data.substring(0, 200) },
      image_gen: { status: resp2.status, body: data2.substring(0, 200) },
      nano_banana: { status: resp3.status, body: data3.substring(0, 200) },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
