'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {inSession,latestSignal,orderFor}=require('./strategy');
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
test('Account/history reconciliation blocks duplicate, third, concurrent and MT4 orders',()=>{
  const input={account:{NAV:'10000',marginAvailable:'10000'},orders:[],trades:[],transactions:[],order,now};
  assert.equal(maySubmit(input),true);
  assert.equal(maySubmit({...input,orders:[{}]}),false);
  assert.equal(maySubmit({...input,trades:[{}]}),false);
  assert.equal(maySubmit({...input,account:{...input.account,mt4AccountID:'123'}}),false);
  assert.equal(maySubmit({...input,transactions:[{clientExtensions:order.clientExtensions}]}),false);
  assert.equal(maySubmit({...input,transactions:[{time:new Date(now).toISOString()},{time:new Date(now).toISOString()}]}),false);
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
    await bot.tick();assert.equal(posts,1);assert.equal(tx[0].order.units,'1');
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
