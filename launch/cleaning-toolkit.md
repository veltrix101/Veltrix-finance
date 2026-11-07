# Cleaning toolkit: first paid offer

Audience: solo cleaners pricing and quoting their own jobs. Launch page: `/cleaners/`.

Proposed price: C$29 one-time for pricing, customer quotes and profit tracking. Current access remains free. No revenue, customer counts, testimonials or market-rate claims are fabricated. Existing beta users keep their present access until a paid-access policy is decided and communicated.

## Product now prepared

- Dedicated landing page with features, limitations, proposed price and free tool links.
- Optional cleaning workspace: `/business/?trade=cleaning#pricing`.
- Opt-in fictional pricing example: four hours at C$25/hour plus C$35 supplies, travel and overhead = C$135 cost; a 25% margin yields C$180 before tax.
- Opt-in standard-cleaning quote and completed-job examples, with replacement confirmation for existing drafts.
- Shared help explaining the offer and browser-only business storage.

## Requirements before taking payment

1. Owner connects Stripe and completes any required identity, banking and business verification directly with Stripe. Do not ask for banking information or secret keys in chat.
2. Confirm exactly what the C$29 purchase provides, including access duration, update/support terms and treatment of early-access users. Do not promise lifetime hosted access for an undefined service cost.
3. Add server-verified checkout and signed, idempotent webhook processing with an auditable entitlement record. A payment link or success URL alone must not unlock access. Never put a secret key in this static repository.
4. Define the account model for paid business tools and test login, purchase, restore access on another device, duplicate webhooks, failed payments, refunds and access revocation. Browser-local data is not account syncing.
5. Publish accurate privacy, purchase/refund terms and a monitored support address based on the actual business details. Confirm applicable tax collection with the owner before enabling it.
6. Make one end-to-end test purchase in test mode. Verify live configuration separately before offering live checkout.

## Acquisition experiment

Goal: ten purchases from relevant solo cleaning business owners, rather than general homepage traffic. Record qualified visitors, tool starts, checkout starts, completed orders, refunds and acquisition cost. Do not call a click a sale. Track traffic without collecting cleaning-client details or financial entries.

Prepare three demonstrations: a standard-cleaning price calculation, a customer quote PDF, and a job that took longer than expected. Show fictional figures and the browser-only storage limitation. Use the landing-page URL in relevant channels only where promotion is permitted. Owner approval is required before posting or contacting anyone; no ads or messages have been sent.

### Ready-to-adapt demonstration caption

Starting a solo cleaning business? VEYDRAVO helps you include your time, supplies and travel when pricing a job, create a printable customer quote, and compare your estimate with the final profit. Try the toolkit free during early access. Business records save in your current browser; download backups to keep a copy.

## Decision after initial demand test

Review why buyers purchased and why qualified visitors declined. Improve the strongest use case before expanding to more trades. C$29 is a price hypothesis, not evidence that the offer will sell. C$2,000/month is a goal, not a forecast; revenue is not take-home profit.
