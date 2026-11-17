'use strict';
const http=require('node:http');
const {analyze,orderFor,assessOrder,londonDay,inSession}=require('./strategy');
const ORIGIN='https://api-fxpractice.oanda.com'; // Hardcoded: live accounts cannot be used.
const TAG='mmb-demo-v1';
function createClient(token,transport=fetch) {
  async function once(path,method,body) {
    const url=new URL(path,ORIGIN);
    if(url.origin!==ORIGIN || !url.pathname.startsWith('/v3/')) throw Error('Blocked API address');
    if(!['GET','POST','PUT'].includes(method) || (method==='PUT' && !/^\/v3\/accounts\/[^/]+\/trades\/[0-9]+\/close$/.test(url.pathname)) || (method==='POST' && !/^\/v3\/accounts\/[^/]+\/orders$/.test(url.pathname))) throw Error('Blocked API operation');
    let response;
    try {response=await transport(url,{method,redirect:'error',signal:AbortSignal.timeout(12000),
      headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}
    catch {const e=Error('OANDA connection interrupted');e.uncertain=method!=='GET';throw e;}
    let data;
    try {data=await response.json();} catch {const e=Error('OANDA response unreadable');e.uncertain=method!=='GET';throw e;}
    if(!response.ok) {
      const e=Error(response.status===401||response.status===403?'OANDA rejected access. Check the demo token.':`OANDA request failed (${response.status}).`);
      e.uncertain=method!=='GET' && response.status>=500;throw e;
    }
    return data;
  }
  return async function request(path,method='GET',body){
    for(let attempt=0;;attempt++){
      try{return await once(path,method,body);}
      catch(e){
        const transient=/connection interrupted|response unreadable|request failed \((?:429|5[0-9]{2})\)/.test(e.message);
        if(method!=='GET'||!transient||attempt>=2)throw e;
        await new Promise(resolve=>setTimeout(resolve,250*2**attempt));
      }
    }
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
  const index=await api(`${base}/transactions?from=${encodeURIComponent(new Date(now-36*3600000).toISOString())}&pageSize=1000&type=LIMIT_ORDER,MARKET_ORDER`);
  if(!Array.isArray(index.pages) || index.pages.length>10) throw Error('Transaction history requires review');
  const transactions=[];
  for(const page of index.pages) {
    const u=new URL(page);
    if(u.origin!==ORIGIN || u.pathname!==`${base}/transactions/idrange`) throw Error('Invalid history page');
    const data=await api(u.pathname+u.search);
    if(!Array.isArray(data.transactions)) throw Error('Incomplete transaction history');
    transactions.push(...data.transactions);
  }
  return transactions.filter(t=>['LIMIT_ORDER','MARKET_ORDER'].includes(t.type) && [TAG,'mmb-technical-check'].includes(t.clientExtensions?.tag));
}
function maySubmit({account,orders,trades,transactions,order,now}) {
  if(!order || account.mt4AccountID || !Number.isFinite(Number(account.NAV)) || Number(account.NAV)<=0 || !Number.isFinite(Number(account.marginAvailable)) || Number(account.marginAvailable)<=0) return false;
  if(!Array.isArray(orders)||!Array.isArray(trades)) throw Error('Incomplete account state');
  // Dedicated demo account: any existing pending order/trade blocks another entry.
  if(orders.length || trades.length) return false;
  if(transactions.some(t=>t.clientExtensions?.id===order.clientExtensions.id)) return false;
  return true;
}
function createBot(env=process.env,transport=fetch,readPolicy=()=>({mode:'original'})) {
  let state={version:'1.6.0',dailyEntryLimit:null,strategyUnits:1000,mode:'DEMO ONLY',status:'Token not configured',connected:false,trading:false,lastCheck:null,lastCandle:null,lastOrder:null,pendingOrders:0,openTrades:0,ordersToday:0,sessionOpen:false,entryWindow:'Weekdays 08:00–11:00 Europe/London',stage:'Waiting for connection'};
  const token=(env.OANDA_DEMO_TOKEN||'').trim(),api=createClient(token,transport);
  const readyAt=Date.now()+90000;
  const extendedSession=env.DEMO_EXTENDED_SESSION==='true';
  state.entryWindow=extendedSession?'Weekdays, all forex trading hours':'Weekdays 08:00–11:00 Europe/London';
  let accountID=env.OANDA_ACCOUNT_ID||null,busy=false,halted=false,stopping=false;
  let evaluated=0,bars=[],instrument=null,historyAt=0,transactions=[];
  async function tick() {
    if(busy || !token || halted || stopping) return;
    busy=true;
    try {
      if(!accountID) {
        const d=await api('/v3/accounts');
        if(!Array.isArray(d.accounts)||d.accounts.length!==1) throw Error('Set OANDA_ACCOUNT_ID in Render to choose one demo account.');
        accountID=d.accounts[0].id;
      }
      if(!/^[0-9-]{3,40}$/.test(accountID)) throw Error('Invalid demo account ID');
      const base='/v3/accounts/'+accountID;
      const [{account},{orders},{trades}]=await Promise.all([api(base+'/summary'),api(base+'/pendingOrders'),api(base+'/openTrades')]);
      if(!account || account.mt4AccountID) throw Error('Use a v20 demo account without an MT4 link.');
      if(!Array.isArray(orders)||!Array.isArray(trades)) throw Error('Incomplete broker account state');
      if(!instrument) {const instruments=await api(base+'/instruments?instruments=EUR_USD');instrument=instruments.instruments?.find(i=>i.name==='EUR_USD');}
      if(!instrument || !Number.isFinite(Number(instrument.minimumTradeSize)) || Number(instrument.minimumTradeSize)>1 || !Number.isInteger(instrument.displayPrecision) || instrument.displayPrecision<0 || instrument.displayPrecision>10) throw Error('EUR/USD one-unit orders unavailable');
      const checked=Date.now();
      if(Math.floor(checked/60000)!==Math.floor(historyAt/60000)) {transactions=await history(api,base,checked);historyAt=checked;}
      const ordersToday=transactions.filter(t=>londonDay(Date.parse(t.time))===londonDay(checked)).length;
      const previousOrder=transactions.at(-1)?.time;
      state={...state,connected:true,trading:false,pendingOrders:orders.length,openTrades:trades.length,ordersToday,sessionOpen:inSession(checked,extendedSession),lastCheck:new Date().toISOString(),lastOrder:previousOrder||state.lastOrder};
      if(env.BOT_ENABLED==='false') {state.status='Connected. Trading paused in settings.';state.trading=false;return;}
      const lastCached=bars.at(-1);
      const query=lastCached && checked-lastCached.time<3*86400000?`from=${encodeURIComponent(new Date(lastCached.time).toISOString())}&includeFirst=false&count=5000`:'count=5000';
      const data=await api(`${base}/instruments/EUR_USD/candles?granularity=M1&price=M&${query}`);
      const incoming=parseCandles(data);
      bars=[...new Map([...bars,...incoming].map(b=>[b.time,b])).values()].sort((a,b)=>a.time-b.time).slice(-5000);
      const last=bars.at(-1);
      if(!last) throw Error('No completed candles received');
      state.lastCandle=new Date(last.time).toISOString();
      const now=Date.now();
      if(orders.length || trades.length) {evaluated=last.time;state.stage='Broker position or order active';state.status=trades.length?'Open trade at OANDA. New entries blocked until it closes.':'Pending order at OANDA. Waiting for its fill or expiry.';return;}
      const policy=readPolicy();
      state.forwardTest=Boolean(policy.forwardTest);
      state.validationStatus=policy.forwardTest?'Unvalidated demo forward test':'Historical validation policy';
      state.strategy=policy.mode==='candidate'?require('./candidates').CANDIDATES.find(c=>c.id===policy.id)?.name||policy.id:policy.mode==='original'?'Original sweep rules':'Research only — new entries paused';
      if(!['candidate','original'].includes(policy.mode)){evaluated=last.time;state.stage='Strategy validation';state.status=policy.message||'New entries paused until a strategy passes validation.';return;}
      if(now<readyAt) {evaluated=last.time;state.stage='Startup checks';state.status='Connected. Startup checks in progress.';return;}
      if(!inSession(now,extendedSession)) {evaluated=last.time;state.stage='Outside entry window';state.status=extendedSession?'Running. Waiting for weekday forex trading hours.':'Running. New entries wait for weekdays 08:00–11:00 London time.';return;}
      const age=now-(last.time+60000);
      if(age<0 || age>90000) {state.stage='Waiting for fresh data';state.status='Completed market data is stale or invalid. New orders blocked.';return;}
      state.trading=true;
      if(last.time<=evaluated) return;
      evaluated=last.time;
      const analysis=policy.mode==='candidate'?require('./candidates').analyzeCandidate(policy.id,bars,{extendedSession}):analyze(bars),signal=analysis.signal;
      state.stage=analysis.stage;
      if(!signal) {state.status=analysis.stage+'.';return;}
      // Re-read broker state/history immediately before submission, never rely on a cached snapshot.
      const [freshAccount,freshOrders,freshTrades,freshHistory,pricing]=await Promise.all([api(base+'/summary'),api(base+'/pendingOrders'),api(base+'/openTrades'),history(api,base,now),api(base+'/pricing?instruments=EUR_USD')]);
      const checkedOrder=assessOrder(signal,pricing.prices?.find(p=>p.instrument==='EUR_USD'),instrument.displayPrecision,Date.now(),{extendedSession});
      const order=checkedOrder.order;
      // Scale strategy demo entries only; execution checks remain one unit.
      if(order) order.units=String(Math.sign(Number(order.units))*1000);
      if(!maySubmit({account:freshAccount.account,orders:freshOrders.orders,trades:freshTrades.trades,transactions:freshHistory,order,now:Date.now()})) {state.stage='Entry blocked';state.status='Setup skipped: '+(checkedOrder.reason||'broker entry limits failed')+'.';return;}
      if(stopping) return;
      // Never retry a POST. An uncertain response halts the bot for manual review.
      const response=await api(base+'/orders','POST',{order});
      if(response.orderRejectTransaction || response.orderCancelTransaction || !response.orderCreateTransaction) {state.stage='Broker rejected entry';state.status='Demo order rejected or cancelled by broker.';return;}
      historyAt=0;state.ordersToday++;state.lastOrder=new Date().toISOString();state.stage='Order submitted';state.status='1,000-unit demo limit order submitted with broker-held stop and target.';
    } catch(e) {
      if(e.uncertain) {halted=true;state.trading=false;state.stage='Manual broker review required';state.status='Paused: order outcome uncertain. Review OANDA before restarting.';}
      else {state.connected=false;state.trading=false;state.stage='Connection or data check failed';state.status=e.message;}
      // Do not log the token, request headers, account response, or broker error body.
    } finally {state.lastCheck=new Date().toISOString();busy=false;}
  }
  return {tick,stop:()=>{stopping=true;state.trading=false;},status:()=>({...state})};
}
const fs=require('node:fs');
const path=require('node:path');
const PAGE=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const STATUS_SCRIPT=fs.readFileSync(path.join(__dirname,'status.js'),'utf8');
let researchState={phase:'Not started',progress:0,result:null};
let executionCheck={status:'Not requested',entryVerified:false,closeVerified:false,requiresReview:false};
function forwardPolicy(env,fallback){
  if(executionCheck.requiresReview)return {mode:'paused',message:'Broker execution check requires review. New entries paused.'};
  if(executionCheck.status==='In progress')return {mode:'research',message:'Verifying the demo order and close path.'};
  const id=env.DEMO_FORWARD_STRATEGY;
  if(id){if(!require('./candidates').CANDIDATES.some(c=>c.id===id))return {mode:'paused',message:'Unknown demo test strategy; check configuration.'};return {mode:'candidate',id,forwardTest:true};}
  return fallback;
}
let livePolicy={mode:'research',message:'Comparing strategy candidates. New entries are paused during validation.'};
function serve(bot) {
  return http.createServer((req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    if(req.method!=='GET') {res.writeHead(405);res.end();return;}
    const path=req.url.split('?')[0];
    if(path==='/api/research') {res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...researchState,forwardTestEnabled:Boolean(process.env.DEMO_FORWARD_STRATEGY),testSchedule:process.env.DEMO_EXTENDED_SESSION==='true'?'Weekday forex trading hours':'08:00–11:00 London'}));return;}
    if(path==='/health') {res.setHeader('Content-Type','application/json');res.end('{"ok":true,"mode":"demo-only"}');return;}
    if(path==='/api/status') {res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...bot.status(),executionCheck}));return;}
    if(path==='/status.js') {res.setHeader('Content-Type','application/javascript');res.end(STATUS_SCRIPT);return;}
    if(path==='/') {res.setHeader('Content-Type','text/html;charset=utf-8');res.end(PAGE);return;}
    res.writeHead(404);res.end('Not found');
  });
}
if(require.main===module) {
  const bot=createBot(process.env,fetch,()=>forwardPolicy(process.env,livePolicy)),server=serve(bot);
  server.listen(Number(process.env.PORT)||10000,'0.0.0.0',()=>console.log('Demo-only bot service started'));
  if(process.env.DEMO_EXECUTION_CHECK_ID){
    executionCheck={...executionCheck,status:'In progress'};
    require('./execution-check').runDemoCheck(process.env,createClient).then(result=>{executionCheck=result;}).catch(()=>{executionCheck={status:'Execution check interrupted; review OANDA before retrying.',entryVerified:false,closeVerified:false,requiresReview:true};});
  }
  bot.tick();const timer=setInterval(()=>bot.tick(),30000);
  // Research is isolated from order monitoring and sends only read requests.
  let researcher=null;
  const researchTimer=setTimeout(()=>{
    const {Worker}=require('node:worker_threads');
    researchState.phase='Starting read-only historical study';
    researcher=new Worker(path.join(__dirname,'research.js'),{resourceLimits:{maxOldGenerationSizeMb:320}});
    researcher.on('message',message=>{
      if(message.type==='progress')researchState={...researchState,phase:message.phase,progress:message.progress};
      if(message.type==='complete'){
        researchState={phase:'Study complete',progress:100,result:message.result};
        const id=message.result.redesign?.demoCandidate;
        livePolicy=id?{mode:'candidate',id}:{mode:'paused',message:'New entries paused: no replacement strategy passed the validation gates. Broker monitoring continues.'};
      }
      if(message.type==='failed')researchState={...researchState,phase:message.message,progress:0};
    });
    researcher.on('error',()=>{researchState.phase='Historical study failed; trading was not changed.';});
  },5000);
  process.on('SIGTERM',()=>{clearTimeout(researchTimer);researcher?.terminate();clearInterval(timer);bot.stop();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),15000).unref();});
}
module.exports={createClient,parseCandles,history,maySubmit,createBot,serve,forwardPolicy};
