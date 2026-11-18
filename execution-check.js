'use strict';
// One explicitly requested 1-EUR-unit DEMO round trip. No real-money host exists.
async function runDemoCheck(env,clientFactory){
  const key=env.DEMO_EXECUTION_CHECK_ID;
  if(!key||!/^[a-zA-Z0-9-]{1,40}$/.test(key))throw Error('Invalid execution-check ID');
  const id='mmb-check-'+key,tradeClientID=id+'-trade',api=clientFactory((env.OANDA_DEMO_TOKEN||'').trim());
  let account=env.OANDA_ACCOUNT_ID;
  if(!account){const list=await api('/v3/accounts');if(list.accounts?.length!==1)throw Error('Choose one demo account');account=list.accounts[0].id;}
  if(!/^[0-9-]{3,40}$/.test(account))throw Error('Invalid account');
  const base='/v3/accounts/'+account;
  const done=()=>({status:'Verified: one-unit demo entry filled and trade closed.',entryVerified:true,closeVerified:true,requiresReview:false,checkedAt:new Date().toISOString()});
  let existing;
  try{existing=(await api(base+'/trades/@'+tradeClientID)).trade;}catch(e){if(!/\(404\)/.test(e.message))throw e;}
  if(existing){
    if(existing.clientExtensions?.id!==tradeClientID||existing.instrument!=='EUR_USD'||Number(existing.initialUnits)!==1)throw Error('Execution-check identity mismatch');
    if(existing.state==='CLOSED')return done();
    if(existing.state==='OPEN'){
      const close=await api(base+'/trades/'+existing.id+'/close','PUT',{units:'ALL'});
      if(!close.orderFillTransaction)throw Error('Close not verified');
      const confirmed=(await api(base+'/trades/@'+tradeClientID)).trade;
      if(confirmed?.state!=='CLOSED')throw Error('Trade still open');
      return done();
    }
    throw Error('Unknown prior execution-check state');
  }
  // An earlier accepted/cancelled test order is not sent a second time after restart.
  try{const previous=await api(base+'/orders/@'+id);if(previous.order)return {status:'Previous technical test order exists; not repeated. Check OANDA history.',entryVerified:false,closeVerified:false,requiresReview:false};}
  catch(e){if(!/\(404\)/.test(e.message))throw e;}
  const [{account:summary},{orders},{trades},instruments,pricing]=await Promise.all([api(base+'/summary'),api(base+'/pendingOrders'),api(base+'/openTrades'),api(base+'/instruments?instruments=EUR_USD'),api(base+'/pricing?instruments=EUR_USD')]);
  if(!summary||summary.mt4AccountID||!(Number(summary.NAV)>1&&Number(summary.marginAvailable)>1))throw Error('Demo account not eligible');
  if(!Array.isArray(orders)||!Array.isArray(trades))throw Error('Incomplete account state');
  if(orders.length||trades.length)return {status:'Technical order check skipped: account already has an order or trade.',entryVerified:false,closeVerified:false,requiresReview:false};
  const instrument=instruments.instruments?.find(i=>i.name==='EUR_USD'),price=pricing.prices?.find(p=>p.instrument==='EUR_USD');
  if(!instrument||Number(instrument.minimumTradeSize)>1||!Number.isInteger(instrument.displayPrecision))throw Error('One-unit orders unavailable');
  const bid=Number(price?.bids?.[0]?.price),ask=Number(price?.asks?.[0]?.price),age=Date.now()-Date.parse(price?.time);
  if(price?.status!=='tradeable'||!(bid>0&&ask>=bid)||!Number.isFinite(age)||age>15000||age< -5000)return {status:'Technical order check deferred: market unavailable or quote stale.',entryVerified:false,closeVerified:false,requiresReview:false};
  const fixed=v=>v.toFixed(instrument.displayPrecision);
  const order={type:'MARKET',instrument:'EUR_USD',units:'1',timeInForce:'FOK',positionFill:'OPEN_ONLY',priceBound:fixed(ask+.0002),
    clientExtensions:{id,tag:'mmb-technical-check'},tradeClientExtensions:{id:tradeClientID,tag:'mmb-technical-check'},
    stopLossOnFill:{price:fixed(bid-.002),timeInForce:'GTC'},takeProfitOnFill:{price:fixed(ask+.004),timeInForce:'GTC'}};
  const placed=await api(base+'/orders','POST',{order});
  if(!placed.orderFillTransaction?.tradeOpened?.tradeID)return {status:'Technical test order did not open a trade. It was not retried.',entryVerified:false,closeVerified:false,requiresReview:Boolean(placed.orderFillTransaction)};
  const tradeID=placed.orderFillTransaction.tradeOpened.tradeID;
  if(!/^[0-9]+$/.test(tradeID))throw Error('Invalid returned trade ID');
  const closed=await api(base+'/trades/'+tradeID+'/close','PUT',{units:'ALL'});
  if(!closed.orderFillTransaction)throw Error('Close fill not verified');
  const confirmation=(await api(base+'/trades/@'+tradeClientID)).trade;
  if(confirmation?.state!=='CLOSED')throw Error('Technical trade close not confirmed');
  return done();
}
module.exports={runDemoCheck};
