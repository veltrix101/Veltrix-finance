# Personal Finance subscriptions — sandbox preparation

Current approved prices: C$4.99/month, C$39.99/year billed annually. Same features on both billing options. Annual saving is C$19.89 compared with twelve monthly payments. Planned trial: 14 days, no payment card required. Existing free beta accounts have not been enrolled in a trial or subscription.

## Stripe configuration

- Account: Veydravo sandbox, acct_1UYfe7H2vDw2eQVY. No live charges enabled.
- Product: prod_VaFpmouSU2n1Qi
- Monthly recurring CAD price: price_1UZ5JlH2vDw2eQVYsRylkNZg, 499 minor units, interval month.
- Annual recurring CAD price: price_1UZ5JoH2vDw2eQVYnqDKUKgA, 3999 minor units, interval year.
- Portal configuration: bpc_1UZ5KVH2vDw2eQVYcHoYVv2R. Self-service cancellation at period end, no cancellation proration, invoice history and payment-method updates enabled. Plan changes are disabled pending explicit renewal/proration design.
- Sample monthly and annual Checkout Sessions were created and verified in subscription mode with zero due today, payment_method_collection=if_required, trial_period_days=14, missing_payment_method=cancel and flexible billing mode. These previews have not been completed and are not linked from public pages. They do not grant website access.
- Automatic tax is disabled in sandbox. The owner reports no GST/HST registration. Before live billing, review Canadian and cross-border obligations and Stripe Tax registration/threshold settings. A Stripe connection is not a tax registration.

## Website

The homepage and Finance settings display the approved prices as planned, including annual billing and savings. They clearly state that current early access remains free and that subscription charges have not launched. The helper describes the same terms. There is no active paid-signup button or automatic trial countdown.

## Required before activation

The restricted sandbox runtime key and webhook signing secret are now stored in Supabase Edge Function secrets. The `billing-sandbox` endpoint and account-bound subscription mapping are deployed. Subscription checkout stays disabled until the restricted key has Customers Write, Subscriptions Read, Invoices Read and Customer Portal Write permissions, and FINANCE_SANDBOX_ENABLED is enabled. The current key supports one-time Checkout Write, Payment Intents Read and Charges/Refunds Read.

Build account-bound subscription checkout and Customer Portal session endpoints. Resolve the customer from a verified authenticated account using a server-owned mapping, not a browser-supplied customer ID. Reuse a customer's existing active/trialing subscription, prevent duplicate purchases, and limit each account to the intended trial eligibility. Portal sessions must always bind to that same customer.

Required webhook handling: customer.subscription.created/updated/deleted, invoice.paid, invoice.payment_failed, charge.dispute.created, charge.refunded and radar.early_fraud_warning.created, plus trial-will-end notification behavior where implemented. Verify raw-body signatures, retrieve current Stripe subscription state and line items, and make processing idempotent and safe for reordered events. Resolve billing ownership through Stripe customer/subscription IDs stored by the server. Subscription access must expire/revoke on the appropriate state and paid-through period; a success URL cannot grant access. Handle risk events with explicit policy and review rather than silently continuing paid access.

Test no-card trial completion and expiry, trial eligibility, authenticated ownership, paid renewal, failed renewal, period-end cancellation, invoice history, refunds/disputes, lost redirects and duplicate/reordered events before enabling real billing. Do not lock out beta users or delete their financial entries when introducing subscriptions. Finalize renewal, cancellation, refund, data-retention and support terms before accepting real payments. Business-tool purchases stay separate from Personal Finance.


## Implementation added 2026-11-07

`/billing/` contains sandbox individual/bundle checkout, server-verified purchase history, subscription choices and a customer-bound portal button. No live payment button is present. Business links offer an explicit `?billing-test=1` preview that checks server purchase records, locks unowned tools in the UI and rechecks before actions and on focus. This preview is not a production security boundary: business calculations and PDFs are client code, and existing beta routes remain intentionally free. Before live sales, move paid functionality behind a server-enforced delivery boundary and finalize beta grandfathering. Do not describe these client controls as copy protection.

The server serializes checkout creation per authenticated account with an expiring database lease, caches creation with Stripe idempotency, reuses an open subscription checkout, blocks simultaneous active subscriptions and withholds another trial if any prior subscription exists. Customers contain no copied profile fields; only the server-owned ID mapping is stored locally. The portal takes no customer ID from the browser. A conservative finance risk policy suspends account subscription access after any associated charge refund, dispute or early fraud warning, pending manual review. Risk flags are sticky and cannot be cleared by a browser or later payment event. Canceled subscription IDs cannot be reactivated by stale events. No user finance entries are deleted or blocked.

41 pure billing-policy tests passed, alongside 37 existing one-time fulfillment checks, 36 business-tool checks, 55 auth/recovery checks and 13 browser fallbacks. Database checks cover exclusive leases, client write/execute denial and stale cancellation replay. Deployed endpoints reject missing auth (401) and unsigned Stripe events (400). Full subscription trial, portal, renewal and cancellation integration tests remain pending the key permission update and authenticated browser testing. Sandbox no-card trial is 14 days and cancels without a payment method; adding a payment method permits automatic renewal. Live tax collection remains off.
