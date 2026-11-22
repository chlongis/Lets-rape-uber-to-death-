# Zilch

**Drivers own their record.**

A rideshare driver's 6,000 trips at 4.97 stars is the single most valuable thing they have, and it isn't theirs. It lives inside an app they don't control, it can't be taken anywhere else, and it disappears the day they get deactivated by an algorithm with no appeal.

Zilch is a portable reputation layer for gig drivers, with a commission-free job board attached. Drivers mint a profile they own, hand it out however they like, and get found directly. No cut is taken from anything.

Static HTML, no build step, one free database. **Fork it and run it in your city in an afternoon.**

---

## What's in it

| Page | What it does |
|---|---|
| `claim.html` | A driver builds a profile — stats, vehicle, area, contact method, optional proof screenshot. Mints a permanent handle. |
| `d.html?h=<handle>` | The public profile. Stats, verification badge, one-tap contact, QR code, vCard, printable card. |
| `find.html` | Searchable directory by name, vehicle, bio and area. |
| `board.html` | Peer-to-peer job board. Post a ride or delivery, name your price, a driver claims it. |
| `offer.html` | Offer check. Enter an offer's payout, miles and minutes, or read them from a screenshot (on-device OCR with Tesseract.js; `offer-parse.js` pulls the numbers out; Android can share a screenshot straight to the installed app), and get Take it / Maybe / Skip based on the driver's own car costs and floors. Logs the shift. Nothing is uploaded. |
| `receipt.html` | "Where the money went" card. Customer paid vs. counter price vs. driver pay, drawn as a square image to post. Runs on the phone only. |
| `deact.html` | Anonymous deactivation tracker. Fixed-choice reports, live stats on how many came with no reason. |
| `paycheck.html` | Checks a pay period against the legal minimum in Minnesota, Washington, Seattle and New York City. |
| `pledge.html` | Launch-area pledges with per-suburb thresholds. |
| `index.html` | Landing page. |

---

## Run it in your city

You need a free [Supabase](https://supabase.com) account and a GitHub account. No build tools, no server, no npm.

**1. Fork this repo.**

**2. Create a Supabase project.** Copy the project URL and the **anon** key from Settings → API. The anon key is meant to be public and safe in client code — row level security is what protects the data. Never use the `service_role` key.

**3. Point the code at your project:**

```bash
./setup.sh https://yourproject.supabase.co your-anon-key
```

**4. Create the tables.** Paste all of `schema.sql` into the Supabase SQL Editor and run it once.

**4b. Already ran an older `schema.sql`?** Run the new one anyway. It migrates in place and is safe to re-run.

**5. Create two storage buckets** in the Supabase dashboard: `proof` and `insurance`. Both private, 5 MB limit, allowing `image/jpeg`, `image/png` and `application/pdf`. The policies are already in `schema.sql`.

**6. Set your own areas.** The suburb lists are hardcoded near the top of the script block in `pledge.html`, `claim.html`, `find.html` and `board.html`. Swap in your own. In `pledge.html` each area also has a `need` value — the number of drivers required before that area goes live. Smaller areas need fewer.

**7. Enable GitHub Pages.** Settings → Pages → Source: `main`, folder `/root`. Live in about a minute.

**8. Check it works.** Open `pledge.html`, submit a pledge, and watch the bar move. If it doesn't, the SQL in step 4 never ran.

---

## Install it like an app

The site is a progressive web app. On Android, Chrome offers an **Install** button; on iPhone, Safari's Share → **Add to Home Screen**. It opens full-screen with its own icon, and the offer check and receipt card keep working with no signal (`sw.js` caches the pages; database calls are never cached). `pwa.js` handles the install prompt and the phone nav.

## Accounts

Sign-in is by email link (Supabase Auth, no passwords) on `account.html`. The profile form asks for an email as its last field, not up front: the profile goes live right away, the email is saved with it (`remember_email`), and a sign-in link is sent. Opening that link in any browser claims the profile, because pending links are matched by email, not by browser. Setting up payouts needs an account; browsing, the tools and the job board work without one.

Ownership is checked by `zilch_me()` in `schema.sql`: a signed-in person's account, otherwise the browser key. The first time someone signs in on a browser, `link_browser()` moves everything that browser's key owned onto the account. The payments function reads the account from the request's login token.

Setup in Supabase: **Authentication → URL Configuration**, set the Site URL to your GitHub Pages address and add `https://<you>.github.io/<repo>/**` to Redirect URLs. Supabase's built-in email sender only allows a few emails an hour; before launch, add your own SMTP under **Authentication → Emails** (Resend and similar have free tiers).

## Card payments (Stripe) and messages

**Messages** work as soon as you run the latest `schema.sql`. Once a driver claims a job, the poster and the driver each get a **Messages** button on the card. Only those two can read the thread.

**Card payments** need a Stripe account and two Supabase Edge Functions. Until they're set up, the board just says payments aren't set up and everything else keeps working.

How the money moves: a driver connects a free Stripe account once (Stripe Accounts v2, with their own full Stripe Dashboard). When a driver claims a job, the poster taps **Pay by card** and goes through Stripe Checkout. The charge is made on the driver's own Stripe account, so the money is the driver's from the start, Stripe's fee comes out of the driver's side, and Zilch takes nothing and never holds funds. The card is only authorized at checkout. It's captured when the poster taps **Done, release**, or dropped if they tap **Cancel payment**. An authorization that's never released expires after 7 days.

Setup, about 20 minutes:

1. **Stripe account.** Sign up at stripe.com. In the dashboard, open **Connect** and finish the platform setup. Do your testing in a **sandbox** (Stripe's isolated test environment) until everything works.
2. **Supabase CLI.** Install it (`npm i -g supabase` or see supabase.com/docs/guides/cli), then from this repo:
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   ```
3. **Secrets.** Create a **restricted key** (`rk_...`) with write access to Connect, Checkout Sessions and PaymentIntents, and use that rather than the full secret key. `SITE_URL` is your GitHub Pages address, which stops anyone pointing the Stripe redirects at another site.
   ```bash
   supabase secrets set STRIPE_SECRET_KEY=sk_test_xxx SITE_URL=https://<you>.github.io/<repo>
   ```
4. **Deploy the functions.**
   ```bash
   supabase functions deploy payments
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```
5. **Webhook.** In Stripe → Developers → Webhooks, add an endpoint that listens to **events on Connected accounts**, URL `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`, events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `account.updated` and `payment_intent.canceled`. Copy its signing secret and run:
   ```bash
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
   ```
6. **Test.** In driver mode tap **Set up payouts** and use Stripe's test data. Post a job from another browser, claim it, pay with card `4242 4242 4242 4242`, then tap **Done, release**. The payment shows up on the connected account in Stripe.
7. **Go live** by repeating steps 3 and 5 with your live keys.

**Sales tax:** Stripe Tax is not switched on. With direct charges the driver is the seller, so any tax obligation is theirs, not Zilch's. Whether a ride or delivery fee is taxable depends on the state; have a tax advisor confirm before turning on `automatic_tax`, and remember it only collects where an active registration exists.

Payouts need an account, so they follow the driver to any device.

## How some of it works

**Nothing secret is in a public table.** The anon key is public, so anything it can read is public. Job-post contact details and ownership records live in private tables with no policies, and every write goes through a `SECURITY DEFINER` function in `schema.sql`. Each browser makes a random secret (`zilch.secret.v1` in localStorage) and only its SHA-256 hash is stored. Holding the secret is what lets you edit or delete your profile and see the contact for jobs you claimed. Clear your browser data and you lose that access.

**Claiming is locked at the database.** `claim_request` only matches a row that is still `open`. Two drivers hitting the same job at the same moment: one wins and the other gets `taken` from Postgres. Only the winner gets the poster's contact back.

**Verification is set by the server, and labelled honestly.** A profile shows *Verified* only when a stats screenshot named after that profile actually exists in the `proof` bucket. Editing trips or rating without a new screenshot drops it back to *Self-reported*. Screenshots can still be doctored, so the label appears on the profile and on every directory card and riders can weigh it themselves.

**Uploaded files aren't readable with the public key.** The `proof` and `insurance` buckets allow uploads only. View them in the Supabase dashboard.

## Pay rates

`paycheck.html` holds a `RATES` object. These change — Minnesota's adjust annually from 2027 alongside the state minimum wage. Update them when they move.

| | Per mile | Per minute | Per trip | Measured |
|---|---|---|---|---|
| Minnesota 2025–26 | $1.28 | $0.31 | $5.00 | pay period |
| Minnesota 2027+ | $1.33 | $0.32 | $5.20 | pay period |
| Seattle 2026 | $1.63 | $0.70 | $6.12 | per trip |
| Washington 2026 | $1.38 | $0.40 | $3.55 | per trip |
| NYC 2026 | $1.283 | $0.681 | — | per trip |
| NYC wheelchair-accessible | $1.601 | $0.681 | — | per trip |

Sources: Minn. Stat. § 181C.03, RCW 49.46.300, 35 RCNY § 59B-23.

---

## Not built yet

- DKIM-verified stats — driver forwards their weekly platform summary as an attachment, a worker validates the signature against the platform's DNS key, and the numbers become near-unfakeable. Needs a domain and a mail worker.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Running it in a new city and reporting what broke is the most useful contribution there is.

## Licence

MIT. Do what you want with it, including running your own. See [LICENSE](LICENSE).

## Not legal advice

Pay rates, statutory citations and regulatory notes in this repo are provided as-is and change often. Whether operating this in your jurisdiction requires licensing, insurance or registration depends entirely on where you are and how you run it. Verify before relying on any of it.
