# Redesign validation — 17 November 2026

Status: no candidate approved; new demo entries paused. The OANDA connection, broker monitoring and approved paid hosting remain active. No real-money mode exists.

- Source: 183,708 completed OANDA EUR/USD M1 bid/ask/mid candles over approximately 180 calendar days.
- Median closing spread: 1.6 pips. Median M1 high–low range: 0.9 pips. These are descriptive medians, not executable future prices.
- Fixed alternatives: 20-minute trend breakout, 60-minute trend breakout, 20-minute range reversion.
- The corrected passive-order check permits valid inside-spread limits while rejecting marketable limits and invalid stops.
- The 20-minute breakout generated 200 development signals and 72 validation signals, but only 9 and 7 simulated fills. Development results were negative after the one-pip-per-side slippage stress. It failed promotion gates.
- The 60-minute breakout generated 148/50 signals and 8/6 fills. Both development and validation stress results were negative. It failed promotion gates.
- The range-reversion strategy generated 22/4 signals, all rejected by spread-versus-stop-distance checks. It failed promotion gates.
- No candidate qualified to open its final evaluation segment. The candidates were not repeatedly tuned against final results to manufacture a winner.
- The directional probability model did not establish consistent improvement over its baseline and does not control orders.
- No natural OANDA demo entry fill is present in broker history. Connection and synthetic order-path tests do not substitute for a real demo fill.
- 28 software tests passed, including causal features/signals, conservative ambiguous fills, fail-closed promotion, bounded read retries, non-retried POST submissions, duplicate/daily limits and valid passive-order prices.

Limits: OHLC execution assumptions remain approximations. Overnight financing and commissions are omitted. The later dates overlap earlier original-strategy research and are not claimed as pristine unseen data. A favourable retrospective result would still require future forward-demo validation. No profitability guarantee is supported. The current result is an evidence-based rejection, not a profitable trading system.

The deployed service remains on the previously approved US$7/month compute plan. No additional plan or paid resource was created. The aggregate research snapshot is retained alongside source as validation-180day-2026-11-17.json.
