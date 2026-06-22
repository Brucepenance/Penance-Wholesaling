// POST /api/create-checkout-session
// Called from the app's "Subscribe" button once a trial has ended.
// Creates a Stripe Checkout session for the subscription and hands back
// the URL to redirect the browser to. The actual "mark this user as
// subscribed" step happens later, in stripe-webhook.js, once Stripe
// confirms the payment actually went through — never trust the client
// redirect alone for that.

const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, email } = req.body;
    if (!userId || !email) {
      return res.status(400).json({ error: 'Missing userId or email' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      client_reference_id: userId, // how the webhook maps this back to a Supabase user
      allow_promotion_codes: true, // shows a "Add promotion code" box on the Checkout page
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID, // create this in the Stripe Dashboard, see SETUP.md
          quantity: 1,
        },
      ],
      success_url: `${process.env.APP_URL}?checkout=success`,
      cancel_url: `${process.env.APP_URL}?checkout=cancelled`,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('create-checkout-session error', err);
    res.status(500).json({ error: err.message });
  }
};
