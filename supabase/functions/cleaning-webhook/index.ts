import Stripe from 'npm:stripe@23.0.0';
import { createClient } from 'npm:@supabase/supabase-js@2.57.0';
import { paidOrder } from '../_shared/cleaning-payment.mjs';
import { subscriptionSnapshot, idOf } from '../_shared/billing-policy.mjs';

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
  const handled = ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'charge.refunded', 'charge.dispute.created', 'radar.early_fraud_warning.created', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.paid', 'invoice.payment_failed'];
  if (!handled.includes(event.type)) return new Response('Ignored', { status: 200 });
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const object = event.data.object as unknown as { id: string; payment_intent?: string };
    const syncSubscription = async (id: string) => {
      const sub = await stripe.subscriptions.retrieve(id);
      const snapshot = subscriptionSnapshot(sub, event.created);
      if (snapshot) {
        const {error} = await db.rpc('sync_billing_sandbox_subscription', {snapshot});
        if (error) throw error;
      }
    };
    if (event.type.startsWith('customer.subscription.')) {
      await syncSubscription(object.id);
    } else if (event.type.startsWith('invoice.')) {
      const invoice = await stripe.invoices.retrieve(object.id);
      const subscription = idOf(invoice.parent?.subscription_details?.subscription);
      if (subscription) await syncSubscription(subscription);
    } else if (event.type.startsWith('charge.') || event.type === 'radar.early_fraud_warning.created') {
      // A refund/dispute revokes existing orders only; it can never grant access.
      const pi = object.payment_intent;
      if (pi) {
        const { error } = await db.rpc('revoke_cleaning_sandbox_order', { intent: pi });
        if (error) throw error;
      }
      // Finance has one customer per authenticated account. Resolve risk through
      // the canonical charge/customer graph, never user-editable metadata.
      const riskObject = event.data.object as any;
      const chargeId = event.type === 'charge.refunded' ? object.id : idOf(riskObject.charge);
      if (chargeId) {
        const charge = await stripe.charges.retrieve(chargeId);
        const customer = idOf(charge.customer);
        if (customer && charge.livemode === false) {
          const {error} = await db.from('billing_sandbox_accounts').update({risk_blocked:true}).eq('customer_id',customer);
          if (error) throw error;
        }
      }
    } else if (event.type !== 'checkout.session.async_payment_failed') {
      const session = await stripe.checkout.sessions.retrieve(object.id, { expand: ['line_items', 'payment_intent.latest_charge'] });
      if (session.mode === 'subscription' && session.livemode === false) {
        const sub = idOf(session.subscription);
        if (sub) await syncSubscription(sub);
      }
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
