// Sandbox only. Never grant an entitlement from browser-supplied payment details.
export const SKU = 'cleaning-toolkit';
export const PRICE = 'price_1UZ4jxH2vDw2eQVYkOJVvrE9';
export const AMOUNT = 2900;
export function paidOrder(session) {
  if (session.livemode !== false || session.mode !== 'payment' ||
      session.status !== 'complete' || session.payment_status !== 'paid') return null;
  const meta = session.metadata || {};
  const user = session.client_reference_id;
  if (meta.sku !== SKU || meta.environment !== 'sandbox' || meta.user_id !== user ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user || '')) return null;
  const items = session.line_items;
  if (!items || items.has_more || items.data.length !== 1) return null;
  const item = items.data[0];
  if (item.price?.id !== PRICE || item.price?.currency !== 'cad' ||
      item.price?.unit_amount !== AMOUNT || item.quantity !== 1 ||
      session.amount_total !== AMOUNT || session.currency !== 'cad') return null;
  const intent = session.payment_intent;
  if (!intent || typeof intent === 'string' || intent.status !== 'succeeded' ||
      intent.currency !== 'cad' || intent.amount_received !== AMOUNT) return null;
  const charge = intent.latest_charge;
  if (!charge || typeof charge === 'string') return null;
  return {
    session_id: session.id, user_id: user, sku: SKU, livemode: false,
    amount: AMOUNT, currency: 'cad', payment_intent_id: intent.id,
    state: charge.refunded || charge.disputed || charge.amount_refunded > 0 ? 'revoked' : 'active',
  };
}

export function checkoutParams(userId, origin, suffix) {
  return {
    mode: 'payment', line_items: [{ price: PRICE, quantity: 1 }],
    client_reference_id: userId,
    metadata: { user_id: userId, sku: SKU, environment: 'sandbox' },
    automatic_tax: { enabled: false },
    integration_identifier: 'veydravo_cleaning_' + suffix,
    success_url: origin + '/cleaners/?checkout=test-complete',
    cancel_url: origin + '/cleaners/',
    custom_text: { submit: { message: 'Sandbox test only. No real money is charged.' } },
  };
}
