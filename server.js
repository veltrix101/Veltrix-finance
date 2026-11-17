'use strict';
const http=require('node:http');
const {latestSignal,orderFor,londonDay}=require('./strategy');
const ORIGIN='https://api-fxpractice.oanda.com'; // Hardcoded: live accounts cannot be used.
const TAG='mmb-demo-v1';
function createClient(token,transport=fetch) {
  return async function request(path,method='GET',body) {
    const url=new URL(path,ORIGIN);
    if(url.origin!==ORIGIN || !url.pathname.startsWith('/v3/')) throw Error('Blocked API address');
    if(!['GET','POST'].includes(method) || (method==='POST' && !/^\/v3\/accounts\/[^/]+\/orders$/.test(url.pathname))) throw Error('Blocked API operation');
    let response;
    try {response=await transport(url,{method,redirect:'error',signal:AbortSignal.timeout(12000),
      headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}
    catch {const e=Error('OANDA connection interrupted');e.uncertain=method==='POST';throw e;}
    let data;
    try {data=await response.json();} catch {const e=Error('OANDA response unreadable');e.uncertain=method==='POST';throw e;}
    if(!response.ok) {
      const e=Error(response.status===401||response.status===403?'OANDA rejected access. Check the demo token.':`OANDA request failed (${response.status}).`);
      e.uncertain=method==='POST' && response.status>=500;throw e;
    }
    return data;
  };
}
function parseCandles(data) {
  const bars=(data.candles||[]).filter(c=>c.complete).map(c=>({time:Date.parse(c.time),open:Number(c.mid?.o),high:Number(c.mid?.h),low:Number(c.mid?.l),close:Number(c.mid?.c)}));
  for(let i=0;i<bars.length;i++) {
    const b=bars[i];
    if(!Number.isFinite(b.time) || b.time%60000 || (i && b.time<=bars[i-1].time) || !['open','high','low','close'].every(k=>Number.isFinite(b[k])&&b[k]>0) || b.high<Math.max(b.open,b.close,b.low) || b.low>Math.min(b.open,b.close,b.high)) throw Error('Invalid market candles');
  }
  return bars;
}
async function history(api,base,now) {
  // A 36-hour lookback covers the entire London day across daylight-saving changes.
  const index=await api(`${base}/transactions?from=${encodeURIComponent(new Date(now-36*3600000).toISOString())}&pageSize=1000&type=LIMIT_ORDER`);
  if(!Array.isArray(index.pages) || index.pages.length>10) throw Error('Transaction history requires review');
  const transactions=[];
  for(const page of index.pages) {
    const u=new URL(page);
    if(u.origin!==ORIGIN || u.pathname!==`${base}/transactions/idrange`) throw Error('Invalid history page');
    const data=await api(u.pathname+u.search);
    if(!Array.isArray(data.transactions)) throw Error('Incomplete transaction history');
    transactions.push(...data.transactions);
  }
  return transactions.filter(t=>t.type==='LIMIT_ORDER' && t.clientExtensions?.tag===TAG);
}
function maySubmit({account,orders,trades,transactions,order,now}) {
  if(!order || account.mt4AccountID || !Number.isFinite(Number(account.NAV)) || Number(account.NAV)<=0 || Number(account.marginAvailable)<=0) return false;
  if(!Array.isArray(orders)||!Array.isArray(trades)) throw Error('Incomplete account state');
  // Dedicated demo account: any existing pending order/trade blocks another entry.
  if(orders.length || trades.length) return false;
  if(transactions.some(t=>t.clientExtensions?.id===order.clientExtensions.id)) return false;
  return transactions.filter(t=>londonDay(Date.parse(t.time))===londonDay(now)).length<2;
}
function createBot(env=process.env,transport=fetch) {
  let state={mode:'DEMO ONLY',status:'Token not configured',connected:false,trading:false,lastCheck:null,lastCandle:null,lastOrder:null};
  const token=(env.OANDA_DEMO_TOKEN||'').trim(),api=createClient(token,transport);
  const readyAt=Date.now()+90000;
  let accountID=env.OANDA_ACCOUNT_ID||null,busy=false,halted=false;
  let evaluated=0;
  async function tick() {
    if(busy || !token || halted) return;
    busy=true;
    try {
      if(!accountID) {
        const d=await api('/v3/accounts');
        if(!Array.isArray(d.accounts)||d.accounts.length!==1) throw Error('Set OANDA_ACCOUNT_ID in Render to choose one demo account.');
        accountID=d.accounts[0].id;
      }
      if(!/^[0-9-]{3,40}$/.test(accountID)) throw Error('Invalid demo account ID');
      const base='/v3/accounts/'+accountID;
      const [{account},instruments]=await Promise.all([api(base+'/summary'),api(base+'/instruments?instruments=EUR_USD')]);
      if(!account || account.mt4AccountID) throw Error('Use a v20 demo account without an MT4 link.');
      const instrument=instruments.instruments?.find(i=>i.name==='EUR_USD');
      if(!instrument || Number(instrument.minimumTradeSize)>1 || !Number.isInteger(instrument.displayPrecision)) throw Error('EUR/USD one-unit orders unavailable');
      state={...state,connected:true,status:'Connected. Waiting for a completed candle.',lastCheck:new Date().toISOString()};
      if(env.BOT_ENABLED==='false') {state.status='Connected. Trading paused in settings.';state.trading=false;return;}
      const data=await api(`${base}/instruments/EUR_USD/candles?granularity=M1&price=M&count=5000`);
      const bars=parseCandles(data),last=bars.at(-1);
      if(!last) throw Error('No completed candles received');
      state.lastCandle=new Date(last.time).toISOString();
      const now=Date.now();
      if(now<readyAt) {evaluated=last.time;state.status='Connected. Startup checks in progress.';return;}
      if(last.time<=evaluated) {state.status='Monitoring EUR/USD. Waiting for the next minute.';return;}
      evaluated=last.time;state.trading=true;
      if(now-(last.time+60000)>90000) {state.status='Market data is stale or market is closed. No new orders.';return;}
      const signal=latestSignal(bars);
      if(!signal) {state.status='Monitoring EUR/USD. No qualifying setup.';return;}
      const [{orders},{trades},transactions,pricing]=await Promise.all([api(base+'/pendingOrders'),api(base+'/openTrades'),history(api,base,now),api(base+'/pricing?instruments=EUR_USD')]);
      const order=orderFor(signal,pricing.prices?.find(p=>p.instrument==='EUR_USD'),instrument.displayPrecision,now);
      if(!maySubmit({account,orders,trades,transactions,order,now})) {state.status='Setup skipped by entry limits or price checks.';return;}
      // Never retry a POST. An uncertain response halts the bot for manual review.
      const response=await api(base+'/orders','POST',{order});
      if(response.orderRejectTransaction || response.orderCancelTransaction || !response.orderCreateTransaction) {state.status='Demo order rejected or cancelled by broker.';return;}
      state.lastOrder=new Date().toISOString();state.status='One-unit demo limit order submitted with broker-held stop and target.';
    } catch(e) {
      if(e.uncertain) {halted=true;state.trading=false;state.status='Paused: order outcome uncertain. Review OANDA before restarting.';}
      else {state.connected=false;state.trading=false;state.status=e.message;}
      // Do not log the token, request headers, account response, or broker error body.
    } finally {state.lastCheck=new Date().toISOString();busy=false;}
  }
  return {tick,status:()=>({...state})};
}
const PAGE=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Demo Trading Bot</title><style>body{background:#10141e;color:#edf1fa;font:17px system-ui;margin:0;padding:32px 20px}main{max-width:600px;margin:40px auto}h1{font-size:34px}.card{background:#1b2232;padding:24px;border-radius:20px;margin:20px 0}p{line-height:1.6;color:#c1cadb}b{color:#8caaff}button{background:#466dff;color:white;border:0;border-radius:12px;padding:14px 20px;font:inherit}small{color:#9aa8c0}</style><main><b>OANDA · DEMO ONLY</b><h1>Your demo trading bot</h1><div class="card"><h2 id="status">Checking service…</h2><p id="checked"></p><p id="candle"></p><button id="refresh">Check status</button></div><p>Trades EUR/USD with virtual money only. Each entry is <b>1 EUR unit</b>, with at most two order submissions per London day and one pending order or open trade at a time.</p><p>Entry window: 8–11 a.m. London time, weekdays. Orders include a broker-held stop, target, and ten-minute entry expiry. No qualifying signal means no trade.</p><p>The free hosting service sleeps when idle. It cannot provide continuous monitoring after you close this page. Existing OANDA orders and attached stops remain with the broker.</p><p>Setup: add <b>OANDA_DEMO_TOKEN</b> in this service's Render Environment settings, then Save and deploy. Never put it in a chat, URL, or screenshot. If more than one demo account exists, also set OANDA_ACCOUNT_ID.</p><small>Experimental strategy. Functional tests do not establish profitability. Status is public; token, account IDs, balances, and trade details are never displayed.</small><script src="/status.js"></script></main></html>`;
function serve(bot) {
  return http.createServer((req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    if(req.method!=='GET') {res.writeHead(405);res.end();return;}
    const path=req.url.split('?')[0];
    if(path==='/health') {res.setHeader('Content-Type','application/json');res.end('{"ok":true,"mode":"demo-only"}');return;}
    if(path==='/api/status') {res.setHeader('Content-Type','application/json');res.end(JSON.stringify(bot.status()));return;}
    if(path==='/status.js') {res.setHeader('Content-Type','application/javascript');res.end("async function refresh(){try{const s=await(await fetch('/api/status')).json();document.getElementById('status').textContent=s.status;document.getElementById('checked').textContent=s.lastCheck?'Last check: '+new Date(s.lastCheck).toLocaleString():'';document.getElementById('candle').textContent=s.lastCandle?'Latest completed candle: '+new Date(s.lastCandle).toLocaleString():'';}catch{document.getElementById('status').textContent='Service unavailable. Try again.'}}document.getElementById('refresh').onclick=refresh;refresh();setInterval(refresh,30000);");return;}
    if(path==='/') {res.setHeader('Content-Type','text/html;charset=utf-8');res.end(PAGE);return;}
    res.writeHead(404);res.end('Not found');
  });
}
if(require.main===module) {
  const bot=createBot(),server=serve(bot);
  server.listen(Number(process.env.PORT)||10000,'0.0.0.0',()=>console.log('Demo-only bot service started'));
  bot.tick();const timer=setInterval(()=>bot.tick(),30000);
  process.on('SIGTERM',()=>{clearInterval(timer);server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),15000).unref();});
}
module.exports={createClient,parseCandles,history,maySubmit,createBot,serve};
