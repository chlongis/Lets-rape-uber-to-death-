import Stripe from "npm:stripe@23.2.0";
export { Stripe };
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// Use a restricted key (rk_...) with Connect, Checkout Sessions and PaymentIntents
// write access. A full secret key (sk_...) also works but can do far more if leaked.
export const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2026-11-18.endive",
  httpClient: Stripe.createFetchHttpClient(),
});

// Service-role client: can call the pay_* functions in schema.sql. Never sent to a browser.
export const db = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

// A driver can be paid once Stripe has switched on card payments for their account.
export async function canAcceptCards(account: string): Promise<boolean> {
  const acct = await stripe.v2.core.accounts.retrieve(account, { include: ["configuration.merchant"] });
  return acct.configuration?.merchant?.capabilities?.card_payments?.status === "active";
}

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
