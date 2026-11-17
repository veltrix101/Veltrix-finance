'use strict';
// Read-only research worker. Forecasts never select or submit broker orders.
const {parentPort,isMainThread}=require('node:worker_threads');
const {createScanner,orderFor,assessOrder,londonDay}=require('./strategy');
const {createClient}=require('./server');
const DAY=86400000,HORIZON=5;
function parseHistory(candles) {
  return candles.filter(c=>c.complete).map(c=>{
    const b={time:Date.parse(c.time)};
    for(const name of ['mid','bid','ask']){
      if(!c[name])throw Error('Historical bid/ask/mid candles unavailable');
      b[name]={open:Number(c[name].o),high:Number(c[name].h),low:Number(c[name].l),close:Number(c[name].c)};
      const q=b[name];
      if(!Object.values(q).every(v=>Number.isFinite(v)&&v>0)||q.high<Math.max(q.open,q.close,q.low)||q.low>Math.min(q.open,q.close,q.high))throw Error('Invalid historical prices');
    }
    if(!Number.isFinite(b.time)||b.time%60000||b.ask.open<b.bid.open||b.ask.close<b.bid.close)throw Error('Invalid historical candle');
    return {...b,...b.mid};
  });
}
async function download(get,account,now,progress=()=>{}) {
  const end=Math.floor(now/60000)*60000,start=Math.floor((end-180*DAY)/DAY)*DAY,rows=new Map();
  for(let from=start;from<end;from+=3*DAY){
    const to=Math.min(from+3*DAY,end);
    const query=new URLSearchParams({granularity:'M1',price:'MBA',from:new Date(from).toISOString(),to:new Date(to).toISOString()});
    const d=await get(`/v3/accounts/${account}/instruments/EUR_USD/candles?${query}`);
    if(!Array.isArray(d.candles))throw Error('Incomplete historical data response');
    for(const b of parseHistory(d.candles))if(b.time>=start&&b.time<end)rows.set(b.time,b);
    progress({phase:'Downloading OANDA history',progress:Math.min(95,Math.round((to-start)/(end-start)*100))});
  }
  const bars=[...rows.values()].sort((a,b)=>a.time-b.time);
  if(bars.length<20000 || bars[0].time>start+7*DAY || bars.at(-1).time<end-4*DAY)throw Error('Insufficient historical coverage for validation');
  return bars;
}
function summarize(trades,submissions) {
  let pnl=0,peak=0,drawdown=0,wins=0,grossProfit=0,grossLoss=0;
  for(const t of trades){pnl+=t.pnl;peak=Math.max(peak,pnl);drawdown=Math.max(drawdown,peak-pnl);if(t.pnl>0){wins++;grossProfit+=t.pnl;}else grossLoss-=t.pnl;}
  return {submissions,trades:trades.length,wins,winRate:trades.length?wins/trades.length:null,pnlUSDPerOneEUR:pnl,meanPnlUSD:trades.length?pnl/trades.length:null,profitFactor:grossLoss?grossProfit/grossLoss:null,maxClosedTradeDrawdownUSD:drawdown};
}
function backtest(bars,start,end,slippage=0,scannerFactory=createScanner, options={}) {
  const scanner=scannerFactory();let pending=null,position=null,signal=null,day=null,count=0,submissions=0;
  const trades=[];let signals=0;const rejections={};
  const close=(price,b,reason)=>{const exit=price-position.dir*slippage;trades.push({pnl:position.dir*(exit-position.entry),entryTime:position.entryTime,exitTime:b.time,reason});position=null;};
  for(let i=0;i<bars.length && bars[i].time<end;i++){
    const b=bars[i],d=londonDay(b.time),active=b.time>=start;
    if(d!==day){day=d;count=0;}
    if(active){
      // Signal is known only after the preceding candle has closed.
      if(signal&&!pending&&!position&&count<(options.dailyLimit ?? 2)&&i&&b.time-bars[i-1].time===60000){
        const quote={status:'tradeable',time:new Date(b.time).toISOString(),bids:[{price:String(b.bid.open)}],asks:[{price:String(b.ask.open)}]};
        const checked=assessOrder(signal,quote,5,b.time,options),order=checked.order;
        if(!order)rejections[checked.reason]=(rejections[checked.reason]||0)+1;
        if(order){pending={dir:signal.dir,limit:Number(order.price),stop:Number(order.stopLossOnFill.price),target:Number(order.takeProfitOnFill.price),expires:Date.parse(order.gtdTime)};count++;submissions++;}
      }
      if(position){
        const q=position.dir===1?b.bid:b.ask;
        const stop=position.dir===1?q.low<=position.stop:q.high>=position.stop;
        const target=position.dir===1?q.high>=position.target:q.low<=position.target;
        if(stop)close(position.dir===1?Math.min(q.open,position.stop):Math.max(q.open,position.stop),b,'stop');
        else if(target)close(position.target,b,'target');
      }
      if(pending&&!position){
        if(b.time>=pending.expires)pending=null;
        else{
          const q=pending.dir===1?b.ask:b.bid;
          // A gap through a limit receives the limit price, not an optimistic better fill.
          const fill=pending.dir===1?q.low<=pending.limit:q.high>=pending.limit;
          if(fill){
            position={...pending,entry:pending.limit+pending.dir*slippage,entryTime:b.time};pending=null;
            const exitSide=position.dir===1?b.bid:b.ask;
            const stop=position.dir===1?exitSide.low<=position.stop:exitSide.high>=position.stop;
            // Ambiguous entry/stop ordering is scored as a loss; entry-bar targets are ignored.
            if(stop)close(position.dir===1?Math.min(exitSide.open,position.stop):Math.max(exitSide.open,position.stop),b,'entry-bar stop');
          }
        }
      }
    }
    signal=scanner.push(b).signal;if(active&&signal)signals++;
    if(b.time<start)signal=null;
  }
  if(position){const b=bars.findLast(b=>b.time<end);close(position.dir===1?b.bid.close:b.ask.close,b,'end of sample');}
  const metrics=summarize(trades,submissions);
  const daily=new Map();
  for(const b of bars)if(b.time>=start&&b.time<end&&new Date(b.time).getUTCDay()%6!==0)daily.set(londonDay(b.time),0);
  for(const trade of trades){const key=londonDay(trade.exitTime);daily.set(key,(daily.get(key)||0)+trade.pnl);}
  return {...metrics,signals,rejections,dailyPnlUSD:[...daily.values()]};
}
function featureAt(bars,i) {
  if(i<20)return null;
  for(let j=i-19;j<=i;j++)if(bars[j].time-bars[j-1].time!==60000)return null;
  const b=bars[i],p=b.close;
  let sum=0;
  for(let j=i-19;j<=i;j++){const r=(bars[j].close/bars[j-1].close-1)*10000;sum+=r*r;}
  const hour=(b.time%DAY)/DAY*2*Math.PI;
  return [(p/bars[i-1].close-1)*10000,(p/bars[i-5].close-1)*10000,(p/bars[i-20].close-1)*10000,(b.high-b.low)/p*10000,Math.sqrt(sum/20),Math.sin(hour),Math.cos(hour)];
}
function samples(bars) {
  const rows=[];
  for(let i=20;i<bars.length-HORIZON;i++){
    const x=featureAt(bars,i);if(!x)continue;
    if(bars[i+HORIZON].time-bars[i].time!==HORIZON*60000)continue;
    rows.push({time:bars[i].time,labelTime:bars[i+HORIZON].time,x,y:Number(bars[i+HORIZON].close>bars[i].close)});
  }
  return rows;
}
const sigmoid=v=>1/(1+Math.exp(-Math.max(-30,Math.min(30,v))));
function train(rows) {
  if(rows.length<1000)throw Error('Too few training examples');
  const width=rows[0].x.length,mean=Array(width).fill(0),sd=Array(width).fill(0);
  for(const r of rows)for(let k=0;k<width;k++)mean[k]+=r.x[k]/rows.length;
  for(const r of rows)for(let k=0;k<width;k++)sd[k]+=(r.x[k]-mean[k])**2/rows.length;
  for(let k=0;k<width;k++)sd[k]=Math.max(Math.sqrt(sd[k]),1e-8);
  const transform=x=>x.map((v,k)=>Math.max(-10,Math.min(10,(v-mean[k])/sd[k])));
  const data=rows.map(r=>({x:transform(r.x),y:r.y}));
  const baseline=rows.reduce((a,r)=>a+r.y,0)/rows.length,weights=Array(width+1).fill(0);
  weights[0]=Math.log(Math.max(.001,baseline)/Math.max(.001,1-baseline));
  for(let iteration=0;iteration<60;iteration++){
    const gradient=Array(width+1).fill(0);
    for(const r of data){let v=weights[0];for(let k=0;k<width;k++)v+=weights[k+1]*r.x[k];const error=sigmoid(v)-r.y;gradient[0]+=error;for(let k=0;k<width;k++)gradient[k+1]+=error*r.x[k];}
    for(let k=0;k<weights.length;k++)weights[k]-=.2*(gradient[k]/data.length+(k?weights[k]*.01:0));
  }
  return {baseline,predict:x=>{const z=transform(x);return sigmoid(weights[0]+z.reduce((a,v,k)=>a+v*weights[k+1],0));}};
}
function evaluate(model,rows) {
  if(!rows.length)return {samples:0};
  let brier=0,baselineBrier=0,accuracy=0,baselineAccuracy=0;
  for(const r of rows){const p=model.predict(r.x);brier+=(p-r.y)**2;baselineBrier+=(model.baseline-r.y)**2;accuracy+=Number((p>=.5)===Boolean(r.y));baselineAccuracy+=Number((model.baseline>=.5)===Boolean(r.y));}
  return {samples:rows.length,brier:brier/rows.length,baselineBrier:baselineBrier/rows.length,accuracy:accuracy/rows.length,baselineAccuracy:baselineAccuracy/rows.length};
}
function study(bars) {
  const first=bars[0].time,last=bars.at(-1).time+60000,cut1=bars[Math.floor(bars.length*.6)].time,cut2=bars[Math.floor(bars.length*.8)].time;
  const rows=samples(bars),training=rows.filter(r=>r.labelTime<cut1),validation=rows.filter(r=>r.time>=cut1&&r.labelTime<cut2),test=rows.filter(r=>r.time>=cut2&&r.labelTime<last);
  const spreads=bars.map(b=>(b.ask.close-b.bid.close)*10000).sort((a,b)=>a-b);
  const ranges=bars.map(b=>(b.high-b.low)*10000).sort((a,b)=>a-b);
  const model=train(training),val=evaluate(model,validation),holdout=evaluate(model,test);
  const forecastEvidence=val.samples>=1000&&holdout.samples>=1000&&val.brier<val.baselineBrier&&holdout.brier<holdout.baselineBrier;
  const splits=[['development',first,cut1],['validation',cut1,cut2],['holdout',cut2,last]].map(([name,start,end])=>({name,from:new Date(start).toISOString(),to:new Date(end).toISOString(),base:backtest(bars,start,end,0),stress:backtest(bars,start,end,.0001)}));
  const final=splits.at(-1),strategyEvidence=final.base.trades>=30&&final.base.pnlUSDPerOneEUR>0&&final.stress.pnlUSDPerOneEUR>0;
  return {completedAt:new Date().toISOString(),source:'OANDA historical M1 bid/ask/mid candles',instrument:'EUR_USD',bars:bars.length,from:new Date(first).toISOString(),to:new Date(last).toISOString(),
    priceDiagnostics:{medianSpreadPips:spreads[Math.floor(spreads.length/2)],medianM1RangePips:ranges[Math.floor(ranges.length/2)]},
    gaps:bars.slice(1).filter((b,i)=>b.time-bars[i].time!==60000).length,
    method:'Chronological 60% development / 20% validation / 20% holdout. Fixed rules; no parameter search. Forecast labels crossing boundaries excluded.',
    strategy:{splits,evidenceSufficient:strategyEvidence,verdict:strategyEvidence?'Initial historical checks passed; forward-demo evidence still required.':'Do not increase size or use real money: holdout trade count or cost-stressed results are insufficient.'},
    forecast:{model:'L2 logistic regression',horizonMinutes:HORIZON,trainingSamples:training.length,validation:val,holdout,beatsBaseline:forecastEvidence,controlsTrades:false,verdict:forecastEvidence?'Lower Brier score than a fixed training-frequency forecast in both later splits. Not yet proven useful for trading.':'No consistent predictive improvement established; forecast is excluded from trading decisions.'},
    limitations:['OHLC cannot establish tick-by-tick execution; entry/stop ambiguity is scored adversely.','Bid/ask spread is included. Stress adds one pip per side. Commissions and overnight financing are not modeled.','Fixed one-EUR-unit P/L is in USD quote currency, not the account home currency or expected income.','Five-minute forecast labels overlap, so example count is not independent sample size.','One 180-day study cannot prove profitability or performance in other market regimes.','Actual OANDA demo order acceptance and fill remain a separate validation requirement.']};
}
async function executionEvidence(api,account,now){
  const base='/v3/accounts/'+account;
  const index=await api(base+'/transactions?from='+encodeURIComponent(new Date(now-90*DAY).toISOString())+'&pageSize=1000&type=LIMIT_ORDER,ORDER_FILL');
  if(!Array.isArray(index.pages)||index.pages.length>10) return {verified:false,message:'Broker execution history requires manual review.'};
  const rows=[];
  for(const page of index.pages){const u=new URL(page);if(u.origin!=='https://api-fxpractice.oanda.com'||u.pathname!==base+'/transactions/idrange')throw Error('Invalid execution-history page');const data=await api(u.pathname+u.search);if(!Array.isArray(data.transactions))throw Error('Incomplete execution-history page');rows.push(...data.transactions);}
  const orders=rows.filter(r=>r.type==='LIMIT_ORDER'&&r.clientExtensions?.tag==='mmb-demo-v1');
  const ids=new Set(orders.map(r=>String(r.id)));
  const fills=rows.filter(r=>r.type==='ORDER_FILL'&&ids.has(String(r.orderID)));
  const trades=new Set(fills.map(r=>r.tradeOpened?.tradeID).filter(Boolean));
  const closures=rows.filter(r=>r.type==='ORDER_FILL'&&r.tradesClosed?.some(t=>trades.has(t.tradeID)));
  return {verified:fills.length>0,acceptedOrders:orders.length,entryFills:fills.length,closedTrades:closures.length,message:fills.length?'Natural demo order fills are present in broker history.':'No natural demo fill yet. Connection and simulations are verified; broker fills remain unverified.'};
}
async function run(progress) {
  const api=createClient((process.env.OANDA_DEMO_TOKEN||'').trim());
  if(!process.env.OANDA_DEMO_TOKEN)throw Error('Demo token unavailable');
  let account=process.env.OANDA_ACCOUNT_ID;
  if(!account){const data=await api('/v3/accounts');if(data.accounts?.length!==1)throw Error('Select one demo account before research');account=data.accounts[0].id;}
  if(!/^[0-9-]{3,40}$/.test(account))throw Error('Invalid demo account');
  const bars=await download(path=>api(path),account,Date.now(),progress);
  progress({phase:'Comparing fixed candidate strategies on development and validation periods',progress:96});
  const {compareCandidates}=require('./candidates');
  const redesign=compareCandidates(bars,backtest);
  progress({phase:'Checking probability forecast and broker execution history',progress:99});
  const result=study(bars);
  result.redesign=redesign;
  const {CANDIDATES, candidateScanner} = require('./candidates');
  const current = CANDIDATES.find(c => c.id === process.env.DEMO_FORWARD_STRATEGY);
  if (current) {
    const options = {extendedSession:process.env.DEMO_EXTENDED_SESSION === 'true', dailyLimit:Infinity};
    const start = bars[Math.floor(bars.length * 0.8)].time;
    const end = bars.at(-1).time + 60000;
    const replay = slip => backtest(bars, start, end, slip, () => candidateScanner(current.id, options), options);
    result.currentReplay = {strategy:current.name, start, end, base:replay(0), stress:replay(0.0001)};
  }
  result.execution=await executionEvidence(path=>api(path),account,Date.now());
  return result;
}
if(!isMainThread){run(data=>parentPort.postMessage({type:'progress',...data})).then(result=>parentPort.postMessage({type:'complete',result})).catch(e=>parentPort.postMessage({type:'failed',message:'Historical study could not complete: '+String(e.message).slice(0,180)}));}
module.exports={executionEvidence,parseHistory,download,summarize,backtest,featureAt,samples,train,evaluate,study};
