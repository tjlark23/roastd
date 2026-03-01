import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICES = {
  '3pack': { priceId: 'price_1T6GXzD93Ym1rVftjMTUXCm7', credits: 3 },
  '10pack': { priceId: 'price_1T6GY5D93Ym1rVftfwYvhxdL', credits: 10 },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { pack } = req.body;
    const selected = PRICES[pack];
    if (!selected) return res.status(400).json({ error: 'Invalid pack' });

    const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, '') || 'https://roastdai.com';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: selected.priceId, quantity: 1 }],
      mode: 'payment',
      success_url: `${origin}?session_id={CHECKOUT_SESSION_ID}&credits=${selected.credits}`,
      cancel_url: `${origin}?canceled=true`,
      metadata: { credits: String(selected.credits) },
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
