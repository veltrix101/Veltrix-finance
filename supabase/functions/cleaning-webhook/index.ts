import Stripe from 'npm:stripe@23.0.0';
import { createClient } from 'npm:@supabase/supabase-js@2.57.0';
import { paidOrder } from '../_shared/cleaning-payment.mjs';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const key = Deno.env.get('STRIPE_SANDBOX_KEY') || '';
  const secret = Deno.env.get('STRIPE_CLEANING_WEBHOOK_SECRET');
  if (Deno.env.get('CLEANING_SANDBOX_ENABLED') !== 'true' || !/^(rk|sk)_test_/.test(key) || !secret) return new Response('Webhook not configured', { status: 503 });
  const stripe = new Stripe(key, { apiVersion: '2026-09-30.endive' });
  let event: Stripe.Event;
  try {
    const raw = await req.text();
    if (raw.length > 1000000) return new Response('Payload too large', { status: 413 });
    event = await stripe.webhooks.constructEventAsync(raw, req.headers.get('stripe-signature') || '', secret, undefined, Stripe.createSubtleCryptoProvider());
  } catch { return new Response('Invalid signature', { status: 400 }); }
  if (event.livemode !== false) return new Response('Wrong environment', { status: 400 });
  const handled = ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'charge.refunded', 'charge.dispute.created'];
  if (!handled.includes(event.type)) return new Response('Ignored', { status: 200 });
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const object = event.data.object as unknown as { id: string; payment_intent?: string };
    if (event.type.startsWith('charge.')) {
      // A refund/dispute revokes existing orders only; it can never grant access.
      const pi = object.payment_intent;
      if (pi) {
        const { error } = await db.rpc('revoke_cleaning_sandbox_order', { intent: pi });
        if (error) throw error;
      }
    } else if (event.type !== 'checkout.session.async_payment_failed') {
      const session = await stripe.checkout.sessions.retrieve(object.id, { expand: ['line_items', 'payment_intent.latest_charge'] });
      const order = paidOrder(session);
      if (order) {
        // The database serializes grants/revocations for this payment and remembers
        // revocations that arrived before the completed-session event.
        const { error } = await db.rpc('record_cleaning_sandbox_order', { purchase: order });
        if (error) throw error;
      }
    }
    return new Response('Received', { status: 200 });
  } catch { return new Response('Retry required', { status: 500 }); }
});
