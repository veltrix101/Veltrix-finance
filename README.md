# OANDA demo bot

Standalone Node 22+ service. No packages are required. Run `npm test`, then `npm start`.

Set `OANDA_DEMO_TOKEN` privately in Render Environment settings, and Save and deploy. Do not paste it into chat, GitHub, a URL, or the public page. The app selects the account only when exactly one demo account is available; otherwise set `OANDA_ACCOUNT_ID` to the intended v20 demo account. MT4-linked accounts are rejected. Set `BOT_ENABLED=false` and deploy to stop new entries. This does not cancel broker-held orders or close positions: manage those in OANDA.

The broker origin is hardcoded to `https://api-fxpractice.oanda.com`. There is no live mode or public configuration/order endpoint. The status page is public and intentionally excludes account IDs, tokens, balances, prices and detailed trades.

The service polls completed M1 EUR/USD candles every 30 seconds. It implements previous UTC hour/four-hour/day levels, a sweep, five-bar structure reversal, simultaneous three-candle fair value gap, midpoint limit, swing stop, and nearest opposing prior level. It does not reproduce discretionary order blocks, inverse gaps or Fibonacci extensions. Entries occur weekdays 08:00–11:00 London time, with DST applied. Holidays are not separately modeled. Missing-minute gaps reset signals.

Each entry is fixed at ONE EUR unit. This is a deliberately tiny functional demo, not a risk-scaled money-making bot. At most two accepted limit orders per London day; cancellations still count. Any pending order or open trade in the chosen account blocks another entry. Use a dedicated demo account and a single service instance. Limit orders expire ten minutes after the confirmation candle closes. Stops and targets are attached through OANDA. Spread must be no more than 20% of stop distance and reward/(risk+spread) at least 1.5. These controls do not establish profitability or guarantee fills or loss limits.

On startup the bot waits 90 seconds and ignores signals already present during that period. It never catches up missed entries. History is read from OANDA to detect duplicate signal IDs and count orders across restarts. A POST is never retried; an ambiguous submission pauses this process for manual broker review. Do not restart blindly following that message. The process does not persist a cross-instance lock; do not scale or run another copy. A 90-second startup delay reduces overlap during ordinary deployment but is not a distributed lock.

Free Render services sleep after 15 minutes without incoming traffic. Outgoing broker polling does not make them continuously available. The service cannot monitor continuously on free hosting when the status page is closed. Broker-held orders, stops and targets remain at OANDA while the app sleeps. Paid always-on hosting requires separate cost approval.

Validation: tests use synthetic candles and mocked HTTP, including a complete submission path. An authenticated broker connection and actual demo fill MUST be verified after private token setup. No performance or profitability claim is made. This is not the original replay engine with realistic-market performance validation.

References:
- https://developer.oanda.com/rest-live-v20/pricing-ep/
- https://developer.oanda.com/rest-live-v20/order-ep/
- https://developer.oanda.com/rest-live-v20/transaction-ep/
- https://render.com/docs/free
