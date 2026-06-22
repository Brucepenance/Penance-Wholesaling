// POST /api/stripe-webhook
// Stripe calls this directly (not the browser) whenever something happens
// to a subscription — payment succeeded, failed, canceled, etc. This is the
// ONLY place subscription status actually gets updated to "active" — never
// trust the checkout success redirect alone, since a user could just visit
// that URL without actually paying.
//
// Needs the raw request body for signature verification, so Vercel's
// automatic JSON body-parsing is turned off below.

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
// Service-role key — full access, bypasses Row Level Security. Only ever
// used here, server-side, never sent to the browser.
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports.config = { api: { bodyParser: false } };

function buffer(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on('data', (chunk) => chunks.push(chunk));
    readable.on('end', () => resolve(Buffer.concat(chunks)));
    readable.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    const rawBody = await buffer(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id;
        await supabaseAdmin
          .from('subscriptions')
          .update({
            status: 'active',
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
          })
          .eq('user_id', userId);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await supabaseAdmin
          .from('subscriptions')
          .update({ status: 'past_due' })
          .eq('stripe_customer_id', invoice.customer);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await supabaseAdmin
          .from('subscriptions')
          .update({ status: 'canceled' })
          .eq('stripe_customer_id', sub.customer);
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        if (sub.status === 'active') {
          await supabaseAdmin
            .from('subscriptions')
            .update({ status: 'active' })
            .eq('stripe_customer_id', sub.customer);
        }
        break;
      }
      default:
        break; // ignore events we don't care about
    }
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook handler error', err);
    res.status(500).json({ error: err.message });
  }
};
