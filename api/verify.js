import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'Missing session ID' });

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid') {
      const credits = parseInt(session.metadata?.credits || '0');
      return res.status(200).json({ valid: true, credits });
    }

    return res.status(200).json({ valid: false });
  } catch (error) {
    console.error('Verify error:', error);
    return res.status(500).json({ error: 'Verification failed' });
  }
}
