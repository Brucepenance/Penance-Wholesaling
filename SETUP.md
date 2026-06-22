# Setting up Penance CRM with accounts & subscriptions

This turns the app from "one file you open locally" into a real website
people sign up for. Three free accounts, in this order. Should take about
20-30 minutes total, none of it requires writing code.

---

## Part 1 — Supabase (accounts + database)

1. Go to **supabase.com** → Sign up (free) → "New project"
   - Name it anything (e.g. "penance-crm")
   - Set a database password — save it somewhere, you won't need it again for this setup
   - Pick the region closest to you → Create project (takes ~2 min to provision)

2. Once it's ready, go to **SQL Editor** (left sidebar) → **New query**
   - Open `supabase-schema.sql` from this folder, copy the whole thing, paste it in, click **Run**
   - This creates the two tables the app needs and locks them down so users can only ever see their own data

3. Go to **Project Settings → API** (left sidebar, gear icon)
   - Copy the **Project URL**
   - Copy the **anon public** key
   - Copy the **service_role** key too (different from anon — keep this one private, never put it in the HTML file)

4. Open `index.html` in a text editor, find these two lines near the top:
   ```
   const SUPABASE_URL='YOUR_SUPABASE_PROJECT_URL';
   const SUPABASE_ANON_KEY='YOUR_SUPABASE_ANON_KEY';
   ```
   Paste in your Project URL and anon key. Save the file.

5. (Optional but recommended) Go to **Authentication → Settings** in Supabase and turn **off** "Confirm email" while you're testing, so new accounts work immediately without checking an inbox. Turn it back on before sharing this with real users.

At this point, accounts and cloud sync work. You can open `index.html` locally
in a browser and create an account to test it — you don't need Stripe or
Vercel yet for that part.

---

## Part 2 — Stripe (subscription billing)

1. Go to **stripe.com** → Sign up (free)

2. **Product catalog → Add product**
   - Name: "Penance CRM" (or whatever you want shown on the receipt)
   - Pricing: set your monthly price, billing period = monthly
   - Save, then click into the price you just created and copy the **Price ID** (starts with `price_...`)

3. **Developers → API keys**
   - Copy the **Secret key** (starts with `sk_...`) — this goes in Vercel, never in the HTML file

4. **Developers → Webhooks → Add endpoint** — you'll finish this step after Part 3, once you have a live URL. Come back here then.

---

## Part 3 — Vercel (hosting)

1. Go to **vercel.com** → Sign up (free, you can use your GitHub account or email)

2. Put this whole `penance-saas` folder into a GitHub repository (or use Vercel's CLI / drag-and-drop deploy — either works)

3. In Vercel: **Add New → Project** → import this repo → Deploy

4. Once deployed, go to your project's **Settings → Environment Variables** and add:
   | Name | Value |
   |---|---|
   | `STRIPE_SECRET_KEY` | the `sk_...` key from Stripe |
   | `STRIPE_PRICE_ID` | the `price_...` ID from Stripe |
   | `STRIPE_WEBHOOK_SECRET` | (you'll get this in step 6 below) |
   | `SUPABASE_URL` | same Project URL from Part 1 |
   | `SUPABASE_SERVICE_ROLE_KEY` | the **service_role** key from Part 1 (NOT the anon key) |
   | `APP_URL` | your Vercel URL, e.g. `https://penance-crm.vercel.app` |

5. Redeploy (Vercel → Deployments → ⋯ → Redeploy) so the new environment variables take effect.

6. Back in Stripe → **Developers → Webhooks → Add endpoint**:
   - Endpoint URL: `https://YOUR-VERCEL-URL/api/stripe-webhook`
   - Events to send: `checkout.session.completed`, `invoice.payment_failed`, `customer.subscription.deleted`, `customer.subscription.updated`
   - Save, then copy the **Signing secret** (starts with `whsec_...`) and add it as the `STRIPE_WEBHOOK_SECRET` environment variable in Vercel (step 4), then redeploy one more time.

---

## You're live

Visit your Vercel URL — that's the real signup page now. Each person who
signs up gets their own account, their own pipeline, a 3-day free trial,
and a "Subscribe" screen once that trial runs out.

## Testing payments without real money

Stripe gives you test card numbers for exactly this — `4242 4242 4242 4242`,
any future expiry date, any 3-digit CVC, works in test mode without
charging anything. Switch Stripe out of test mode (top-left toggle in the
Stripe dashboard) only once you're ready to take real payments — you'll
need to swap in your live API keys at that point too.
