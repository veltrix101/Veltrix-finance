// Sandbox only. Never grant an entitlement from browser-supplied payment details.
export const CATALOG = Object.freeze({
  'job-pricing': { price: 'price_1UZ57lH2vDw2eQVYCHWCa67r', amount: 1500 },
  'quote-builder': { price: 'price_1UZ57pH2vDw2eQVYOJAK4qOJ', amount: 1900 },
  'profit-tracker': { price: 'price_1UZ57uH2vDw2eQVYUaImNIG7', amount: 1900 },
  'business-bundle': { price: 'price_1UZ57hH2vDw2eQVYpp7pCbOV', amount: 3900 },
});
export const SKU = 'business-bundle';
export const PRICE = CATALOG[SKU].price;
export const AMOUNT = CATALOG[SKU].amount;
const productFor = sku => Object.hasOwn(CATALOG, sku) ? CATALOG[sku] : null;
export function paidOrder(session) {
  if (session.livemode !== false || session.mode !== 'payment' ||
      session.status !== 'complete' || session.payment_status !== 'paid') return null;
  const meta = session.metadata || {};
  const user = session.client_reference_id;
  const product = productFor(meta.sku);
  if (!product || meta.environment !== 'sandbox' || meta.user_id !== user ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user || '')) return null;
  const items = session.line_items;
  if (!items || items.has_more || items.data.length !== 1) return null;
  const item = items.data[0];
  if (item.price?.id !== product.price || item.price?.currency !== 'cad' ||
      item.price?.unit_amount !== product.amount || item.quantity !== 1 ||
      session.amount_total !== product.amount || session.currency !== 'cad') return null;
  const intent = session.payment_intent;
  if (!intent || typeof intent === 'string' || intent.status !== 'succeeded' ||
      intent.currency !== 'cad' || intent.amount_received !== product.amount) return null;
  const charge = intent.latest_charge;
  if (!charge || typeof charge === 'string') return null;
  return {
    session_id: session.id, user_id: user, sku: meta.sku, livemode: false,
    amount: product.amount, currency: 'cad', payment_intent_id: intent.id,
    state: charge.refunded || charge.disputed || charge.amount_refunded > 0 ? 'revoked' : 'active',
  };
}

export function checkoutParams(userId, origin, suffix, sku = SKU) {
  const product = productFor(sku);
  if (!product) throw new Error("Unknown product");
  return {
    mode: 'payment', line_items: [{ price: product.price, quantity: 1 }],
    client_reference_id: userId,
    metadata: { user_id: userId, sku, environment: 'sandbox' },
    automatic_tax: { enabled: false },
    integration_identifier: 'veydravo_business_' + suffix,
    success_url: origin + '/business/?checkout=test-complete',
    cancel_url: origin + '/business/',
    custom_text: { submit: { message: 'Sandbox test only. No real money is charged.' } },
  };
}
