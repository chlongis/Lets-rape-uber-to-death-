// Zilch payments. Drivers connect a Stripe account once (Accounts v2, full
// Stripe Dashboard, Stripe collects fees and owns loss liability); posters pay
// for a claimed job by card. The charge is made on the driver's own Stripe
// account (a "direct charge"), so the money goes to the driver, Stripe's fee
// comes out of the driver's side, and Zilch takes nothing. The card is only
// authorized at checkout and captured when the poster confirms the job is done.
//
// Body: { action, secret, request_id?, return_url? }
//   onboard  -> { url }    Stripe onboarding link for this driver
//   status   -> { ready }  whether this driver's payouts are switched on
//   checkout -> { url }    Stripe Checkout for a claimed job (poster only)
//   release  -> { ok }     capture the held payment (poster only)
//   cancel   -> { ok }     drop the hold (poster only)

import { canAcceptCards, cors, db, json, stripe } from "../_shared/stripe.ts";

function safeReturn(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url);
    const allowed = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
    if (allowed && !u.href.startsWith(allowed)) return null;
    return u.protocol === "https:" || u.hostname === "localhost" ? u.href : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const action = String(body.action ?? "");
  const requestId = body.request_id ? String(body.request_id) : "";

  // Who is asking: a signed-in account if the request carries a user token,
  // otherwise the browser key. Matches zilch_me() in schema.sql.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: who } = token ? await db.auth.getUser(token) : { data: { user: null } };
  const userId = who?.user?.id ?? null;
  const browserKey = String(body.secret ?? "");
  if (!userId && (browserKey.length < 32 || browserKey.startsWith("user:"))) return json({ error: "bad secret" }, 400);
  const secret = userId ? `user:${userId}` : browserKey;

  try {
    if ((action === "onboard" || action === "status") && !userId) {
      return json({ error: "Sign in to set up payouts." }, 401);
    }
    if (action === "onboard" || action === "status") {
      let { data: account } = await db.rpc("pay_get_account", { p_secret: secret });

      if (action === "status") {
        if (!account) return json({ ready: false, started: false });
        const ready = await canAcceptCards(account);
        await db.rpc("pay_mark_ready", { p_account: account, p_ready: ready });
        return json({ ready, started: true });
      }

      const back = safeReturn(body.return_url);
      if (!back) return json({ error: "bad return_url" }, 400);
      if (!account) {
        // Direct charges: the driver is the merchant of record and keeps the
        // customer relationship, so they get the full Stripe Dashboard and
        // Stripe (not Zilch) bills fees and covers negative balances.
        const acct = await stripe.v2.core.accounts.create({
          dashboard: "full",
          identity: { country: "us", entity_type: "individual" },
          defaults: { responsibilities: { fees_collector: "stripe", losses_collector: "stripe" } },
          configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
        });
        account = acct.id;
        const { error } = await db.rpc("pay_set_account", { p_secret: secret, p_account: account });
        if (error) throw error;
      }
      const link = await stripe.v2.core.accountLinks.create({
        account,
        use_case: {
          type: "account_onboarding",
          account_onboarding: { refresh_url: back, return_url: back },
        },
      });
      return json({ url: link.url });
    }

    if (action === "checkout") {
      const back = safeReturn(body.return_url);
      if (!back || !requestId) return json({ error: "missing request_id or return_url" }, 400);
      const { data, error } = await db.rpc("pay_prepare", { p_secret: secret, p_request: requestId });
      if (error) throw error;
      const job = data?.[0];
      if (!job) return json({ error: "Only the person who posted a claimed job can pay for it." }, 403);
      if (job.pay_status === "held" || job.pay_status === "paid") return json({ error: "Already paid." }, 409);
      if (!job.driver_account) return json({ error: "This driver hasn't switched on card payouts yet." }, 409);
      // Re-check with Stripe right before charging, not just our cached flag.
      if (!(await canAcceptCards(job.driver_account))) {
        await db.rpc("pay_mark_ready", { p_account: job.driver_account, p_ready: false });
        return json({ error: "This driver's Stripe account can't take card payments right now." }, 409);
      }

      const cents = Math.round(Number(job.offer) * 100);
      if (!(cents >= 500)) return json({ error: "Offer too low to pay by card." }, 400);

      const sep = back.includes("?") ? "&" : "?";
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        integration_identifier: "zilch-job-payment-qwmrtzkb",
        line_items: [{
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: cents,
            product_data: {
              name: `${job.kind === "ride" ? "Ride" : "Delivery"}: ${job.pickup} → ${job.dropoff}`.slice(0, 120),
              description: "Paid directly to your driver. Held until you confirm it's done.",
            },
          },
        }],
        payment_intent_data: { capture_method: "manual", metadata: { request_id: requestId } },
        metadata: { request_id: requestId },
        success_url: `${back}${sep}paid=${requestId}`,
        cancel_url: back,
      }, { stripeAccount: job.driver_account });

      await db.rpc("pay_record_session", { p_request: requestId, p_session: session.id, p_account: job.driver_account });
      return json({ url: session.url });
    }

    if (action === "release" || action === "cancel") {
      if (!requestId) return json({ error: "missing request_id" }, 400);
      const { data, error } = await db.rpc("pay_lookup", { p_secret: secret, p_request: requestId });
      if (error) throw error;
      const row = data?.[0];
      if (!row) return json({ error: "Only the person who posted the job can do that." }, 403);
      if (row.pay_status !== "held" || !row.payment_intent) return json({ error: "There's no held payment on this job." }, 409);

      const opts = { stripeAccount: row.driver_account };
      if (action === "release") {
        await stripe.paymentIntents.capture(row.payment_intent, {}, opts);
        await db.rpc("pay_set_status", { p_request: requestId, p_status: "paid" });
      } else {
        await stripe.paymentIntents.cancel(row.payment_intent, {}, opts);
        await db.rpc("pay_set_status", { p_request: requestId, p_status: "canceled" });
      }
      return json({ ok: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (err) {
    console.error(err);
    const msg = err instanceof Error ? err.message : "payment error";
    return json({ error: msg }, 500);
  }
});
