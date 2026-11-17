'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {inSession,analyze,latestSignal,orderFor}=require('./strategy');
const {createClient,parseCandles,history,maySubmit,createBot,serve}=require('./server');
const now=Date.parse('2026-11-17T08:03:10Z');
const signal={dir:1,time:now-70000,limit:1.10225,stop:1.099,target:1.12};
const quote={instrument:'EUR_USD',status:'tradeable',time:new Date(now).toISOString(),bids:[{price:'1.10400'}],asks:[{price:'1.10410'}]};
const order=orderFor(signal,quote,5,now);
test('Entry window observes London DST and weekends',()=>{
  assert.equal(inSession(Date.parse('2026-07-20T07:00:00Z')),true);
  assert.equal(inSession(Date.parse('2026-11-17T07:59:00Z')),false);
  assert.equal(inSession(Date.parse('2026-11-17T08:00:00Z')),true);
  assert.equal(inSession(Date.parse('2026-11-17T11:00:00Z')),false);
  assert.equal(inSession(Date.parse('2026-11-21T08:00:00Z')),false);
});
test('Order is one unit with attached stop, target, expiry and deterministic ID',()=>{
  assert.equal(order.units,'1');assert.equal(order.type,'LIMIT');
  assert.equal(order.stopLossOnFill.price,'1.09900');assert.equal(order.takeProfitOnFill.price,'1.12000');
  assert.equal(Date.parse(order.gtdTime),signal.time+660000);
  assert.deepEqual(order,orderFor(signal,quote,5,now));
  const short=orderFor({...signal,dir:-1,limit:1.11,stop:1.115,target:1.09},quote,5,now);
  assert.equal(short.units,'-1');
});
test('Reject stale/invalid data, crossed entries, large spreads, bad RR and closed market',()=>{
  assert.equal(orderFor(signal,{...quote,time:'invalid'},5,now),null);
  assert.equal(orderFor(signal,{...quote,time:new Date(now-16000).toISOString()},5,now),null);
  assert.equal(orderFor({...signal,time:signal.time-180000},quote,5,now),null);
  assert.equal(orderFor(signal,{...quote,status:'non-tradeable'},5,now),null);
  assert.equal(orderFor({...signal,limit:1.105},quote,5,now),null);
  assert.equal(orderFor({...signal,target:1.103},quote,5,now),null);
  assert.equal(orderFor(signal,{...quote,asks:[{price:'1.11'}]},5,now),null);
});
test('Account/history reconciliation blocks duplicate and concurrent and MT4 orders',()=>{
  const input={account:{NAV:'10000',marginAvailable:'10000'},orders:[],trades:[],transactions:[],order,now};
  assert.equal(maySubmit(input),true);
  assert.equal(maySubmit({...input,orders:[{}]}),false);
  assert.equal(maySubmit({...input,trades:[{}]}),false);
  assert.equal(maySubmit({...input,account:{...input.account,mt4AccountID:'123'}}),false);
  assert.equal(maySubmit({...input,transactions:[{clientExtensions:order.clientExtensions}]}),false);
  assert.equal(maySubmit({...input,transactions:[{time:new Date(now).toISOString()},{time:new Date(now).toISOString()}]}),true);
  assert.throws(()=>maySubmit({...input,orders:undefined}));
});
test('Client only uses demo origin and never retries ambiguous POST',async()=>{
  const calls=[];const api=createClient('test-token',async(u,opts)=>{calls.push({u,opts});return {ok:true,json:async()=>({accounts:[]})};});
  await api('/v3/accounts');assert.equal(calls[0].u.origin,'https://api-fxpractice.oanda.com');
  await assert.rejects(api('https://api-fxtrade.oanda.com/v3/accounts'),/Blocked/);
  await assert.rejects(api('/v3/accounts/123/summary','POST',{}),/Blocked/);
  let count=0;const failing=createClient('test-token',async()=>{count++;throw Error('network');});
  await assert.rejects(failing('/v3/accounts/123/orders','POST',{order}),e=>e.uncertain===true);
  assert.equal(count,1);
});
test('History pagination cannot redirect token to another origin',async()=>{
  await assert.rejects(history(async()=>({pages:['https://evil.example/v3/accounts/123/transactions/idrange']}),'/v3/accounts/123',now),/Invalid history page/);
});
test('Candle parsing excludes incomplete candles and rejects corruption',()=>{
  const c={complete:true,time:'2026-11-17T08:00:00Z',mid:{o:'1.1',h:'1.2',l:'1.0',c:'1.1'}};
  assert.equal(parseCandles({candles:[c,{...c,complete:false}]}).length,1);
  assert.throws(()=>parseCandles({candles:[c,c]}));
  assert.throws(()=>parseCandles({candles:[{...c,mid:{...c.mid,h:'0'}}]}));
});
function fixture() {
  const start=Date.parse('2026-11-15T00:00:00Z'),end=Date.parse('2026-11-17T08:00:00Z');
  const bars=[];
  for(let t=start;t<end;t+=60000) bars.push({time:t,open:1.101,high:t===Date.parse('2026-11-16T12:00:00Z')?1.12:1.102,low:1.1,close:1.101});
  bars.push({time:end,open:1.101,high:1.102,low:1.099,close:1.101});
  bars.push({time:end+60000,open:1.101,high:1.104,low:1.1,close:1.103});
  bars.push({time:end+120000,open:1.103,high:1.105,low:1.1025,close:1.104});
  return bars;
}
test('Complete candles produce sweep, structure break and FVG; earlier prefix has no signal',()=>{
  const bars=fixture();assert.equal(latestSignal(bars.slice(0,-1)),null);
  const s=latestSignal(bars);assert.ok(s);assert.equal(s.dir,1);assert.ok(Math.abs(s.limit-1.10225)<1e-12);assert.equal(s.stop,1.099);assert.equal(s.target,1.12);
});
test('Bot runs through real adapter shape, submits once and reconciles next tick',async()=>{
  const realNow=Date.now;let clock=now-120000,posts=0;
  Date.now=()=>clock;
  try {
    let bars=fixture().slice(0,-1);
    const tx=[];
    const transport=async(url,opts)=>{
      let data;
      if(url.pathname==='/v3/accounts') data={accounts:[{id:'101-001-1234567-001'}]};
      else if(url.pathname.endsWith('/summary')) data={account:{NAV:'10000',marginAvailable:'10000'}};
      else if(url.pathname.endsWith('/instruments')) data={instruments:[{name:'EUR_USD',minimumTradeSize:'1',displayPrecision:5}]};
      else if(url.pathname.endsWith('/candles')) data={candles:bars.map(b=>({time:new Date(b.time).toISOString(),complete:true,mid:{o:String(b.open),h:String(b.high),l:String(b.low),c:String(b.close)}}))};
      else if(url.pathname.endsWith('/pendingOrders')) data={orders:[]};
      else if(url.pathname.endsWith('/openTrades')) data={trades:[]};
      else if(url.pathname.endsWith('/transactions')) data={pages:[]};
      else if(url.pathname.endsWith('/pricing')) data={prices:[quote]};
      else if(url.pathname.endsWith('/orders')&&opts.method==='POST') {posts++;data={orderCreateTransaction:{id:'123'}};tx.push(JSON.parse(opts.body));}
      else throw Error('Unexpected endpoint');
      return {ok:true,json:async()=>data};
    };
    const bot=createBot({OANDA_DEMO_TOKEN:'fixture-only'},transport);
    await bot.tick();assert.equal(posts,0);
    clock=now;bars=fixture();await bot.tick();assert.equal(posts,1);
    await bot.tick();assert.equal(posts,1);assert.equal(tx[0].order.units,'1000');
    assert.equal(bot.status().connected,true);assert.ok(!JSON.stringify(bot.status()).includes('fixture-only'));
  } finally {Date.now=realNow;}
});
test('Missing token is inert and public HTTP cannot change state or expose source',async()=>{
  let requests=0;const bot=createBot({},async()=>{requests++;throw Error();});await bot.tick();assert.equal(requests,0);
  const server=serve(bot);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const root='http://127.0.0.1:'+server.address().port;
  try {assert.equal((await fetch(root+'/health')).status,200);assert.equal((await fetch(root+'/server.js')).status,404);assert.equal((await fetch(root+'/api/status',{method:'POST'})).status,405);}
  finally {await new Promise(r=>server.close(r));}
});
function scenario(options={}) {
  let bars=fixture().slice(0,-1),posts=0;
  const requests=[];
  const transport=async(url,opts)=>{
    requests.push(url.pathname+url.search);let data;
    if(url.pathname==='/v3/accounts')data={accounts:[{id:'101-001-1234567-001'}]};
    else if(url.pathname.endsWith('/summary'))data={account:{NAV:'10000',marginAvailable:'10000'}};
    else if(url.pathname.endsWith('/instruments'))data={instruments:[{name:'EUR_USD',minimumTradeSize:'1',displayPrecision:5}]};
    else if(url.pathname.endsWith('/candles'))data={candles:bars.map(b=>({time:new Date(b.time).toISOString(),complete:true,mid:{o:String(b.open),h:String(b.high),l:String(b.low),c:String(b.close)}}))};
    else if(url.pathname.endsWith('/pendingOrders'))data={orders:options.orders||[]};
    else if(url.pathname.endsWith('/openTrades'))data={trades:options.trades||[]};
    else if(url.pathname.endsWith('/transactions'))data={pages:options.transactions?.length?['https://api-fxpractice.oanda.com/v3/accounts/101-001-1234567-001/transactions/idrange']:[]};
    else if(url.pathname.endsWith('/transactions/idrange'))data={transactions:options.transactions};
    else if(url.pathname.endsWith('/pricing'))data={prices:[quote]};
    else if(url.pathname.endsWith('/orders')&&opts.method==='POST'){
      posts++;if(options.ambiguous)throw Error('Network disconnected');
      data={orderCreateTransaction:{id:'123'}};
    } else throw Error('Unexpected endpoint');
    return {ok:true,json:async()=>data};
  };
  return {transport,advance:()=>{bars=fixture();},posts:()=>posts,requests};
}
async function runScenario(options,check){
  const realNow=Date.now;let clock=now-120000;Date.now=()=>clock;
  try{
    const fake=scenario(options),bot=createBot({OANDA_DEMO_TOKEN:'never-display-this'},fake.transport);
    await bot.tick();clock=now;fake.advance();await bot.tick();
    await check(bot,fake,()=>{clock+=30000;});
  }finally{Date.now=realNow;}
}
test('Status identifies pending orders and open trades instead of claiming no signal',async()=>{
  await runScenario({orders:[{}]},async(bot,fake)=>{assert.match(bot.status().status,/Pending order/);assert.equal(bot.status().pendingOrders,1);assert.equal(fake.posts(),0);});
  await runScenario({trades:[{}]},async(bot,fake)=>{assert.match(bot.status().status,/Open trade/);assert.equal(bot.status().openTrades,1);assert.equal(fake.posts(),0);});
});
test('History restores daily count after restart without blocking another qualifying entry',async()=>{
  const transactions=[1,2].map(n=>({type:'LIMIT_ORDER',time:new Date(now-n*600000).toISOString(),clientExtensions:{tag:'mmb-demo-v1',id:'old-'+n}}));
  await runScenario({transactions},async(bot,fake)=>{assert.equal(fake.posts(),1);assert.equal(bot.status().ordersToday,3);assert.ok(bot.status().lastOrder);assert.equal(bot.status().dailyEntryLimit,null);});
});
test('Ambiguous submission halts subsequent ticks without retrying the order',async()=>{
  await runScenario({ambiguous:true},async(bot,fake,advance)=>{
    assert.equal(fake.posts(),1);assert.match(bot.status().status,/outcome uncertain/);
    advance();await bot.tick();assert.equal(fake.posts(),1);assert.equal(bot.status().trading,false);
  });
});
test('Incremental polling preserves signal and stable status; stop prevents further calls',async()=>{
  await runScenario({},async(bot,fake)=>{
    assert.equal(fake.posts(),1);const before=bot.status().status;
    await bot.tick();assert.equal(fake.posts(),1);assert.equal(bot.status().status,before);
    assert.ok(fake.requests.some(r=>r.includes('includeFirst=false')));
    assert.equal(fake.requests.filter(r=>r.endsWith('/instruments?instruments=EUR_USD')).length,1);
    const count=fake.requests.length;bot.stop();await bot.tick();assert.equal(fake.requests.length,count);assert.equal(bot.status().trading,false);
  });
});
test('Invalid margin and marginal reward after spread fail closed; diagnostics identify sweep',()=>{
  assert.equal(maySubmit({account:{NAV:'10000'},orders:[],trades:[],transactions:[],order,now}),false);
  const smallRisk={...signal,limit:1.102,stop:1.101,target:1.1037};
  const p={...quote,bids:[{price:'1.1040'}],asks:[{price:'1.1041'}]};
  assert.equal(orderFor(smallRisk,p,5,now),null);
  assert.equal(analyze([]).stage,'Building market history');
  assert.match(analyze(fixture().slice(0,-1)).stage,/Sweep detected/);
});
test('Production validation policy pauses entries even when a valid signal exists',async()=>{
  const realNow=Date.now;let clock=now-120000;Date.now=()=>clock;
  try{
    const fake=scenario({}),bot=createBot({OANDA_DEMO_TOKEN:'fixture-only'},fake.transport,()=>({mode:'research',message:'Validation pending'}));
    await bot.tick();clock=now;fake.advance();await bot.tick();
    assert.equal(fake.posts(),0);assert.equal(bot.status().trading,false);assert.equal(bot.status().status,'Validation pending');assert.equal(bot.status().connected,true);
  }finally{Date.now=realNow;}
});
test('Valid passive limits inside the spread are accepted without allowing marketable limits',()=>{
  const {assessOrder}=require('./strategy');
  const inside={...signal,limit:1.10405,stop:1.102,target:1.109};
  assert.ok(orderFor(inside,quote,5,now));
  assert.equal(assessOrder({...inside,limit:1.1041},quote,5,now).reason,'Entry already crossed or stop invalid');
  assert.ok(orderFor({...inside,dir:-1,limit:1.10405,stop:1.106,target:1.1},quote,5,now));
});
test('Read-only transient failures retry within a bound; authentication failures do not',async()=>{
  let reads=0;const api=createClient('fixture',async()=>{reads++;if(reads<3)throw Error('temporary');return {ok:true,json:async()=>({accounts:[]})};});
  await api('/v3/accounts');assert.equal(reads,3);
  let denied=0;const rejected=createClient('fixture',async()=>{denied++;return {ok:false,status:401,json:async()=>({})};});
  await assert.rejects(rejected('/v3/accounts'),/rejected access/);assert.equal(denied,1);
});
test('Explicit demo-forward policy remains enabled after historical failure; unknown strategies fail closed',()=>{
  const {forwardPolicy}=require('./server');
  const p=forwardPolicy({DEMO_FORWARD_STRATEGY:'trend-breakout-20'},{mode:'paused'});
  assert.equal(p.mode,'candidate');assert.equal(p.forwardTest,true);
  assert.equal(forwardPolicy({DEMO_FORWARD_STRATEGY:'unknown'},{mode:'paused'}).mode,'paused');
  assert.equal(inSession(Date.parse('2026-11-17T15:00:00Z'),true),true);
  assert.equal(inSession(Date.parse('2026-11-21T15:00:00Z'),true),false);
});
test('Extended demo session accepts weekday signals without changing default historical hours',()=>{
  const midday=Date.parse('2026-11-17T15:03:10Z'),s={...signal,time:midday-70000},q={...quote,time:new Date(midday).toISOString()};
  assert.equal(orderFor(s,q,5,midday),null);assert.ok(orderFor(s,q,5,midday,{extendedSession:true}));
});
test('Technical demo check opens exactly one unit, closes only its own trade, and does not repeat',async()=>{
  const {runDemoCheck}=require('./execution-check');let closed=false,opened=false;const writes=[];
  const id='mmb-check-fixture-trade';
  const factory=()=>async(path,method='GET',body)=>{
    if(method!=='GET')writes.push({path,method,body});
    if(path==='/v3/accounts')return {accounts:[{id:'101-001-1234567-001'}]};
    if(path.includes('/trades/@')){if(opened)return {trade:{id:'42',state:closed?'CLOSED':'OPEN',instrument:'EUR_USD',initialUnits:'1',clientExtensions:{id}}};throw Error('OANDA request failed (404).');}
    if(path.includes('/orders/@'))throw Error('OANDA request failed (404).');
    if(path.endsWith('/summary'))return {account:{NAV:'10000',marginAvailable:'10000'}};
    if(path.endsWith('/pendingOrders'))return {orders:[]};if(path.endsWith('/openTrades'))return {trades:[]};
    if(path.includes('/instruments?'))return {instruments:[{name:'EUR_USD',minimumTradeSize:'1',displayPrecision:5}]};
    if(path.includes('/pricing?'))return {prices:[{...quote,time:new Date().toISOString()}]};
    if(path.endsWith('/orders')&&method==='POST'){assert.equal(body.order.units,'1');assert.ok(body.order.stopLossOnFill);opened=true;return {orderFillTransaction:{tradeOpened:{tradeID:'42'}}};}
    if(path.endsWith('/trades/42/close')&&method==='PUT'){closed=true;return {orderFillTransaction:{}};}
    throw Error('Unexpected endpoint');
  };
  const env={DEMO_EXECUTION_CHECK_ID:'fixture',OANDA_DEMO_TOKEN:'fixture-only'};
  const first=await runDemoCheck(env,factory);assert.equal(first.entryVerified,true);assert.equal(first.closeVerified,true);
  await runDemoCheck(env,factory);assert.equal(writes.length,2);assert.equal(writes[0].method,'POST');assert.equal(writes[1].method,'PUT');
});
test('An uncertain trade-close write is never automatically retried',async()=>{
  let writes=0;const api=createClient('fixture',async()=>{writes++;throw Error('network');});
  await assert.rejects(api('/v3/accounts/123/trades/42/close','PUT',{units:'ALL'}),e=>e.uncertain===true);assert.equal(writes,1);
  await assert.rejects(api('/v3/accounts/123/trades/42/clientExtensions','PUT',{}),/Blocked/);
});

test('Demo strategy sizing is visible without changing one-unit order builder or technical checks',()=>{const bot=createBot({});assert.equal(bot.status().strategyUnits,1000);assert.equal(bot.status().version,'1.9.0');assert.equal(order.units,'1');});

test('Closed strategy results attribute entry and exit costs once and exclude test fills', async()=>{
  const {closedResults}=require('./performance');
  const cache=new Map();
  const trades=[['10','5'],['20','-3']].map(([id,pl],i)=>({
    id,closeTime:new Date(now+i*60000).toISOString(),state:'CLOSED',instrument:'EUR_USD',
    initialUnits:i?'1000':'-1000',clientExtensions:{tag:'mmb-demo-v1'},
    closingTransactionIDs:[String(Number(id)+1)],realizedPL:pl,financing:'-0.25'
  }));
  let fills=0;
  const api=async path=>{
    if(path.includes('/trades?'))return {trades:[...trades,{...trades[0],initialUnits:'1'}]};
    const n=Number(path.split('/').pop());fills++;
    const leg={tradeID:String(n-n%10)};
    return {transaction:{type:'ORDER_FILL',commission:'0.50',...(n%10?{tradesClosed:[leg]}:{tradeOpened:leg})}};
  };
  for(let i=0;i<2;i++){
    const result=await closedResults(api,'/demo','CAD',cache);
    assert.equal(result.count,2);assert.equal(result.wins,1);assert.equal(result.net,-0.5);
    assert.equal(result.worst,-4.25);assert.equal(result.drawdown,4.25);
  }
  assert.equal(fills,4);
});

test('Forward scanner evaluates consecutive minute breakouts without a cooldown',()=>{
  const {candidateScanner}=require('./candidates');
  const scanner=candidateScanner('trend-breakout-20',{extendedSession:true,everyMinute:true});
  const start=Date.parse('2026-11-17T12:00:00Z');
  function push(i,close){return scanner.push({time:start+i*60000,open:close,close,high:close+0.00002,low:close-0.00002});}
  for(let i=0;i<80;i++) push(i,1.1);
  assert.equal(push(80,1.101).signal.dir,1);
  assert.equal(push(81,1.102).signal.dir,1);
});

test('Multi-pair admission counts entry orders, excludes attached exits and rejects opposing entries',()=>{
  const trade=pair=>({instrument:pair,currentUnits:'1000',clientExtensions:{tag:'mmb-demo-v1'}});
  const eur=trade('EUR_USD'),gbp=trade('GBP_USD');
  const check=(trades,orders=[],units='1000')=>maySubmit({account:{NAV:'100000',marginAvailable:'90000'},orders,trades,transactions:[],order:{instrument:'EUR_USD',units,clientExtensions:{id:'new'}}});
  assert.equal(check([eur],[{type:'STOP_LOSS',tradeID:'12'}]),true);
  assert.equal(check([eur,eur]),false);
  assert.equal(check([gbp,gbp]),true);
  assert.equal(check([eur,gbp,gbp]),false);
  assert.equal(check([eur],[],'-1000'),false);
  assert.equal(check([eur],[{...eur,type:'LIMIT',units:'1000'}]),false);
});
