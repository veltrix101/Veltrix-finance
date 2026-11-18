'use strict';

function amount(value) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) {
    throw Error('Incomplete broker amounts');
  }
  return Number(value);
}

async function closedResults(api, base, currency, cache) {
  const {trades} = await api(base + '/trades?state=CLOSED&count=100');
  if (!Array.isArray(trades)) throw Error('Missing broker history');
  const selected = trades.filter(t => t.state === 'CLOSED' && ['EUR_USD','GBP_USD','AUD_USD'].includes(t.instrument)
    && Math.abs(Number(t.initialUnits)) === 1000 && t.clientExtensions?.tag === 'mmb-demo-v1');
  selected.sort((a,b) => Date.parse(a.closeTime) - Date.parse(b.closeTime));
  let net = 0, peak = 0, drawdown = 0, worst = 0, wins = 0;
  const retained = new Map();
  for (const trade of selected) {
    let result = cache.get(trade.id);
    if (result === undefined) {
      if (!trade.closingTransactionIDs?.length) throw Error('Missing close fills');
      result = amount(trade.realizedPL) + amount(trade.financing);
      for (const id of new Set([trade.id, ...trade.closingTransactionIDs])) {
        if (!/^\d+$/.test(id)) throw Error('Invalid fill ID');
        const {transaction: fill} = await api(base + '/transactions/' + id);
        const legs = [fill.tradeOpened, fill.tradeReduced, ...(fill.tradesClosed || [])].filter(Boolean);
        if (fill.type !== 'ORDER_FILL' || !legs.length || legs.some(leg => leg.tradeID !== trade.id)) {
          throw Error('Cannot attribute fill costs');
        }
        result -= amount(fill.commission ?? 0) + amount(fill.guaranteedExecutionFee ?? 0);
      }
    }
    retained.set(trade.id, result);
    net += result;
    peak = Math.max(peak, net);
    drawdown = Math.max(drawdown, peak - net);
    worst = Math.min(worst, result);
    if (result > 0) wins++;
  }
  cache.clear();
  for (const [id, result] of retained) cache.set(id, result);
  return {count:selected.length, net, wins, worst, drawdown, currency, updated:new Date().toISOString()};
}
module.exports = {closedResults};
