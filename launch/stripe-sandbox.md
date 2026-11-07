# Stripe sandbox integration status

Account: Veydravo sandbox (`acct_1UYfe7H2vDw2eQVY`). No live account was used.

Current one-time CAD test catalog:

| SKU | Price ID | CAD |
|---|---|---:|
| job-pricing | price_1UZ57lH2vDw2eQVYCHWCa67r | 15 |
| quote-builder | price_1UZ57pH2vDw2eQVYOJAK4qOJ | 19 |
| profit-tracker | price_1UZ57uH2vDw2eQVYUaImNIG7 | 19 |
| business-bundle | price_1UZ57hH2vDw2eQVYpp7pCbOV | 39 |

The previous C$29 bundle price is archived. The earlier successful C$29 sandbox checkout is historical validation, not a test of these four new prices. Public pages show planned prices; purchases remain disabled. Cleaner-specific marketing was removed at the owner's request. Internal legacy function/table names are retained to preserve deployment identity.

Tax: automatic collection disabled for this sandbox. The owner reports no GST/HST registration; live tax obligations have not been fully assessed.

## Earlier payment test and infrastructure validation

A hosted sandbox Checkout Session was created, completed with Stripe's test card, and retrieved from Stripe with status `complete`, payment status `paid`, currency `cad`, total `2900`, livemode `false`. The checkout redirects to the existing cleaner landing page. That page does not grant access based on its URL.

The database contains isolated sandbox order and revocation tables with RLS. Signed-in users can read their own sandbox orders; clients cannot grant themselves purchases. Service-only invoker RPCs serialize fulfillment and revocation by payment intent. Database tests passed for duplicate processing, revocation followed by payment replay, refund arriving before fulfillment, and denied client writes; all test rows were rolled back.

The `cleaning-checkout` and `cleaning-webhook` Edge Functions are deployed. They reject live credentials and stay disabled until the environment switch and sandbox secrets are configured. Checkout requires an authenticated account. Webhook uses raw-body signature verification before reading an event, retrieves payment details from Stripe, validates exact price/quantity/currency/amount/account owner, and writes idempotently. Refunds and disputes revoke sandbox orders. There is no automatic reinstatement following a dispute win. No paid-feature enforcement or purchase UI has been enabled; early access remains free.

## Secure server configuration still required

In Supabase project secrets, set `STRIPE_SANDBOX_KEY` to a sandbox restricted API key with Checkout Sessions write/read, Prices read, PaymentIntents read and Charges read permissions. Verify permissions with integration tests before expanding them. The tool connection in ChatGPT does not supply the website's runtime key. Never put credentials in this repository, browser scripts, chat messages, logs or the launch document.

Register a sandbox webhook for:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `charge.refunded`
- `charge.dispute.created`

Endpoint: `https://podzzorjsvhsdiqistpd.supabase.co/functions/v1/cleaning-webhook`.

Store the endpoint signing secret as `STRIPE_CLEANING_WEBHOOK_SECRET`. Use Supabase's built-in server environment variables for Supabase credentials. Set `CLEANING_SANDBOX_ENABLED=true` only after secrets are stored. The webhook must remain configured with gateway JWT verification off because it verifies Stripe's signature; the checkout endpoint keeps gateway JWT verification on and also calls `getUser()`.

## Remaining integration work

The checkout endpoint accepts only a known `sku` and maps it to the fixed server-side price. The webhook verifies the SKU against the purchased line item, amount and currency. Each order records its purchased SKU; a single-tool order is not a bundle entitlement. Apply `database/cleaning-sandbox-orders.sql` followed by `database/business-sandbox-pricing.sql` on a fresh database. Current database already has both migrations. The four revised price mappings passed unit tests; new hosted payment tests and UI access enforcement remain pending.

After secure key setup, connect an authenticated test-only purchase action to `cleaning-checkout`; provide a fresh UUID `idempotency-key` per intentional purchase, preserving it on retries. Query the signed-in user's sandbox order via RLS for confirmation; never trust a success URL, localStorage flag or client-supplied price/user ID. Test signed webhook success, signature rejection, payment failure, duplicate/reordered delivery, refund/dispute, cross-account access denial and recovery after losing the success redirect.

Before live sales, finalize access/update/support/refund terms, account-based paid enforcement or a securely delivered downloadable product, and the treatment of existing free beta users. Keep sandbox and live order records, secrets, price IDs and endpoints separate. Do not swap a live key into these sandbox-only functions. Confirm tax obligations and relevant registrations before enabling any live tax collection. Review the known Supabase leaked-password-protection warning before a full launch.
