// Stripe Connect webhook. Set it up in Stripe as an endpoint that listens to
// events on CONNECTED accounts, pointing at
//   https://<project>.supabase.co/functions/v1/stripe-webhook
// with these events: checkout.session.completed, account.updated,
// payment_intent.canceled.

import { db, Stripe, stripe } from "../_shared/stripe.ts";

// Deno has no Node crypto, so signature checks use Web Crypto.
const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  if (!sig || !secret) return new Response("missing signature", { status: 400 });

  const raw = await req.text();
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, secret, undefined, cryptoProvider);
  } catch (err) {
    console.error("bad signature", err);
    return new Response("bad signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object;
        if (s.payment_intent) {
          await db.rpc("pay_held", { p_session: s.id, p_intent: String(s.payment_intent) });
        }
        break;
      }
      case "account.updated": {
        const a = event.data.object;
        await db.rpc("pay_mark_ready", { p_account: a.id, p_ready: Boolean(a.charges_enabled) });
        break;
      }
      case "payment_intent.canceled": {
        // Also fires when an uncaptured hold expires after 7 days.
        const pi = event.data.object;
        await db.rpc("pay_status_by_intent", { p_intent: pi.id, p_status: "canceled" });
        break;
      }
    }
  } catch (err) {
    console.error(err);
    return new Response("handler error", { status: 500 });
  }
  return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
});
