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

The server Stripe runtime credential is still unavailable. The earlier Google sign-in step was blocked by approval review; the user has not yet authorized that origin. Do not bypass the block, request secrets in chat, or store credentials in this repository. Use the server's secret storage when authorized.

Build account-bound subscription checkout and Customer Portal session endpoints. Resolve the customer from a verified authenticated account using a server-owned mapping, not a browser-supplied customer ID. Reuse a customer's existing active/trialing subscription, prevent duplicate purchases, and limit each account to the intended trial eligibility. Portal sessions must always bind to that same customer.

Required webhook handling: customer.subscription.created/updated/deleted, invoice.paid, invoice.payment_failed, charge.dispute.created, charge.refunded and radar.early_fraud_warning.created, plus trial-will-end notification behavior where implemented. Verify raw-body signatures, retrieve current Stripe subscription state and line items, and make processing idempotent and safe for reordered events. Resolve billing ownership through Stripe customer/subscription IDs stored by the server. Subscription access must expire/revoke on the appropriate state and paid-through period; a success URL cannot grant access. Handle risk events with explicit policy and review rather than silently continuing paid access.

Test no-card trial completion and expiry, trial eligibility, authenticated ownership, paid renewal, failed renewal, period-end cancellation, invoice history, refunds/disputes, lost redirects and duplicate/reordered events before enabling real billing. Do not lock out beta users or delete their financial entries when introducing subscriptions. Finalize renewal, cancellation, refund, data-retention and support terms before accepting real payments. Business-tool purchases stay separate from Personal Finance.
