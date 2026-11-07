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

The restricted sandbox runtime key and webhook signing secret are now stored in Supabase Edge Function secrets. The `billing-sandbox` endpoint and account-bound subscription mapping are deployed. The user approved adding Customers Write, Subscriptions Read, Invoices Read and Customer Portal Write. These permissions are applied and FINANCE_SANDBOX_ENABLED=true. The key also retains Checkout Write, Payment Intents Read and Charges/Refunds Read.

Build account-bound subscription checkout and Customer Portal session endpoints. Resolve the customer from a verified authenticated account using a server-owned mapping, not a browser-supplied customer ID. Reuse a customer's existing active/trialing subscription, prevent duplicate purchases, and limit each account to the intended trial eligibility. Portal sessions must always bind to that same customer.

Required webhook handling: customer.subscription.created/updated/deleted, invoice.paid, invoice.payment_failed, charge.dispute.created, charge.refunded and radar.early_fraud_warning.created, plus trial-will-end notification behavior where implemented. Verify raw-body signatures, retrieve current Stripe subscription state and line items, and make processing idempotent and safe for reordered events. Resolve billing ownership through Stripe customer/subscription IDs stored by the server. Subscription access must expire/revoke on the appropriate state and paid-through period; a success URL cannot grant access. Handle risk events with explicit policy and review rather than silently continuing paid access.

Test no-card trial completion and expiry, trial eligibility, authenticated ownership, paid renewal, failed renewal, period-end cancellation, invoice history, refunds/disputes, lost redirects and duplicate/reordered events before enabling real billing. Do not lock out beta users or delete their financial entries when introducing subscriptions. Finalize renewal, cancellation, refund, data-retention and support terms before accepting real payments. Business-tool purchases stay separate from Personal Finance.


## Implementation added 2026-11-07

`/billing/` contains sandbox individual/bundle checkout, server-verified purchase history, subscription choices and a customer-bound portal button. No live payment button is present. Business links offer an explicit `?billing-test=1` preview that checks server purchase records, locks unowned tools in the UI and rechecks before actions and on focus. This preview is not a production security boundary: business calculations and PDFs are client code, and existing beta routes remain intentionally free. Before live sales, move paid functionality behind a server-enforced delivery boundary and finalize beta grandfathering. Do not describe these client controls as copy protection.

The server serializes checkout creation per authenticated account with an expiring database lease, caches creation with Stripe idempotency, reuses an open subscription checkout, blocks simultaneous active subscriptions and withholds another trial if any prior subscription exists. Customers contain no copied profile fields; only the server-owned ID mapping is stored locally. The portal takes no customer ID from the browser. A conservative finance risk policy suspends account subscription access after any associated charge refund, dispute or early fraud warning, pending manual review. Risk flags are sticky and cannot be cleared by a browser or later payment event. Canceled subscription IDs cannot be reactivated by stale events. No user finance entries are deleted or blocked.

41 pure billing-policy tests passed, alongside 37 existing one-time fulfillment checks, 36 business-tool checks, 55 auth/recovery checks and 13 browser fallbacks. Database checks cover exclusive leases, client write/execute denial and stale cancellation replay. Deployed endpoints reject missing auth (401) and unsigned Stripe events (400). Full subscription trial, portal, renewal and cancellation integration tests remain pending the key permission update and authenticated browser testing. Sandbox no-card trial is 14 days and cancels without a payment method; adding a payment method permits automatic renewal. Live tax collection remains off.


## Subscription signup and portal test — 2026-11-07

The signed-in billing page created monthly sandbox Checkout `cs_test_a19V5xNJZnc7ZBtVa6FTzqwuMmM9fMru38ZjJwVrmYK0Nqn1yUzZsNPewg`. It displayed C$4.99 monthly after a 14-day no-card trial. Completion created subscription `sub_1UZ6UnH2vDw2eQVYUpeHeQwV` under the server-owned Customer mapping. The webhook recorded status trialing and access through November 21. The billing UI disabled additional subscription signup and enabled Manage test subscription.

The customer-bound portal opened successfully, displayed the $0 trial invoice, no saved payment method, and cancellation. Cancellation was completed through the portal and scheduled for November 21 without a renewal charge. The test caught a newer Stripe cancellation representation: cancel_at was populated while cancel_at_period_end remained false. The policy now recognizes either representation, clamps access to cancel_at when earlier, and has three regression assertions. Redelivering the signed cancellation event safely updated the record and website display. Total billing-policy assertions: 44.

Verified in the browser: individual C$15 test purchase opened from the website, completed and appeared as owned; only pricing inputs unlocked in the explicit sandbox preview, quote and profit inputs stayed disabled; the full test refund then disabled all 30 inputs again. No live funds moved.

Still required before live activation: actual paid renewal/failed renewal integration tests, expired trial delivery, annual paid checkout and refund/dispute scenarios, production enforcement for paid features, live catalog/key/webhook and final terms/tax assessment. These are not implied complete by sandbox trial and portal tests.


## Renewal and expiry integration tests — 2026-11-07

Used Stripe test clock `clock_1UZ6a7H2vDw2eQVYCLFabE45` attached to the sandbox-only mapped customer, avoiding changes to live billing or finance entries. Do not delete this clock as routine cleanup: it contains the earlier sandbox customer. Test-clock customer mappings are not reusable for live mode; a future sandbox reset might be needed after the clock auto-expires.

- Advanced past the no-card trial ending November 21. Subscription `sub_1UZ6UnH2vDw2eQVYUpeHeQwV` became canceled and the signed notification changed the database record to canceled. Its scheduled cancellation was also reached, so this tests expired/scheduled-cancellation access removal; it does not isolate the missing-card behavior from scheduled cancellation.
- Created monthly `sub_1UZ6buH2vDw2eQVYAZcwNGfS` using the attached Stripe Visa test payment method. Initial invoice: C$4.99 paid.
- Advanced to the next monthly cycle. Invoice `in_1UZ6cQH2vDw2eQVYhc6nxiIL` was paid for C$4.99 with billing_reason=subscription_cycle. Status remained active and server access extended through January 21.
- Changed only this temporary subscription to Stripe’s 0341 charge-failure test card. Advanced to its next cycle. Invoice `in_1UZ6d9H2vDw2eQVYMnQFQ3cJ` remained open with C$4.99 due, C$0 paid and one failed attempt. Subscription and database became past_due; hasFinanceAccess denies that state.
- Paid that same invoice with the successful 4242 test card. Invoice became paid, subscription and database returned to active, restoring eligibility.
- Canceled the temporary renewal subscription with invoice_now=false and prorate=false after verification, leaving no active test renewal plan running.

The failed-payment test caught an ambiguous access-until display using Stripe’s next service period even when unpaid. Non-active/non-trialing snapshots now carry no access-until value; the UI explicitly states that overdue paid access is unavailable. Six regression assertions bring the policy suite to 50 passing checks. These dates are simulated; no real charges occurred. Existing free beta access remains unchanged.

Remaining before live activation: annual paid checkout and renewal scenarios, refund/dispute/early-fraud subscription integration scenarios, production paid-feature enforcement, live catalog/key/webhook and final terms/tax assessment.


A second, isolated no-card trial (`sub_1UZ6gJH2vDw2eQVYUfAPfoSs`) had cancel_at=null and default_payment_method=null. Advancing its clock past its 14-day trial produced canceled automatically, with no scheduled cancellation or charge. The signed notification recorded canceled with access_until=null. All three test subscriptions now have canceled status.

Checkout request idempotency now includes the existing subscription count, allowing a fresh paid checkout after same-day cancellation while still deduplicating retries of the same attempt. Trial eligibility remains false for an account with subscription history.
