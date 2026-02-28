export default async function handler(req, res) {
  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
  if (!GOOGLE_API_KEY) return res.status(500).json({ error: "No Google key" });
  
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "say hello in 3 words" }] }] }),
      }
    );
    const data = await resp.text();
    return res.status(resp.status).json({ status: resp.status, body: data.substring(0, 500) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
