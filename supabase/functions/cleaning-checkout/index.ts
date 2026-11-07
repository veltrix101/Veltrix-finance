import Stripe from 'npm:stripe@23.0.0';
import { createClient } from 'npm:@supabase/supabase-js@2.57.0';
import { checkoutParams, CATALOG, SKU } from '../_shared/cleaning-payment.mjs';

const origin = 'https://veltrix-finance.onrender.com';
const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, idempotency-key', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin', 'Cache-Control': 'no-store' };
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } }); }

Deno.serve(async (req) => {
  if (req.headers.get('origin') !== origin) return json({ error: 'Origin not allowed' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const key = Deno.env.get('STRIPE_SANDBOX_KEY') || '';
  // Both an explicit switch and a sandbox-only key are required. Live keys fail closed.
  if (Deno.env.get('CLEANING_SANDBOX_ENABLED') !== 'true' || !/^(rk|sk)_test_/.test(key)) return json({ error: 'Test checkout is not enabled' }, 503);
  const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return json({ error: 'Sign in first' }, 401);
  const retry = req.headers.get('idempotency-key') || '';
  if (!/^[0-9a-f-]{36}$/i.test(retry)) return json({ error: 'A checkout request ID is required' }, 400);
  let sku = SKU;
  try {
    const body = await req.text();
    if (body.length > 2000) return json({ error: 'Request too large' }, 413);
    const input = body ? JSON.parse(body) : {};
    sku = input.sku ?? SKU;
    if (typeof sku !== 'string' || !Object.hasOwn(CATALOG, sku)) return json({ error: 'Unknown product' }, 400);
  } catch { return json({ error: 'Invalid request' }, 400); }
  try {
    const auth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
    const { data, error } = await auth.auth.getUser(token);
    if (error || !data.user) return json({ error: 'Sign in again' }, 401);
    const stripe = new Stripe(key, { apiVersion: '2026-09-30.endive' });
    // Nothing in the request body controls the amount, user, price, currency or return URLs.
    const session = await stripe.checkout.sessions.create(checkoutParams(data.user.id, origin, 'tqrmavzk', sku), { idempotencyKey: 'business:' + data.user.id + ':' + sku + ':' + retry });
    if (session.livemode !== false || !session.url) return json({ error: 'Checkout unavailable' }, 503);
    return json({ url: session.url, session_id: session.id, livemode: false });
  } catch { return json({ error: 'Could not start test checkout. Try again with the same request ID.' }, 502); }
});
