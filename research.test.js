'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {createScanner,analyze}=require('./strategy');
const {parseHistory,backtest,featureAt,samples,train,evaluate}=require('./research');
function candle(time,mid){const side=offset=>({o:String(mid.open+offset),h:String(mid.high+offset),l:String(mid.low+offset),c:String(mid.close+offset)});return {time:new Date(time).toISOString(),complete:true,mid:side(0),bid:side(-.00005),ask:side(.00005)};}
function fixture(){
  const start=Date.parse('2026-11-15T00:00:00Z'),end=Date.parse('2026-11-17T08:00:00Z'),rows=[];
  for(let t=start;t<end;t+=60000)rows.push(candle(t,{open:1.101,high:t===Date.parse('2026-11-16T12:00:00Z')?1.12:1.102,low:1.1,close:1.101}));
  const values=[{open:1.101,high:1.102,low:1.099,close:1.101},{open:1.101,high:1.104,low:1.1,close:1.103},{open:1.103,high:1.105,low:1.1025,close:1.104},{open:1.104,high:1.13,low:1.098,close:1.10},{open:1.10,high:1.101,low:1.098,close:1.1}];
  values.forEach((v,i)=>rows.push(candle(end+i*60000,v)));return parseHistory(rows);
}
test('Historical parser requires genuine bid and ask components and rejects crossed prices',()=>{
  const raw=candle(Date.parse('2026-11-17T08:00:00Z'),{open:1.1,high:1.11,low:1.09,close:1.1});
  assert.equal(parseHistory([raw]).length,1);assert.throws(()=>parseHistory([{...raw,ask:undefined}]));
  assert.throws(()=>parseHistory([{...raw,ask:{...raw.ask,o:'1'}}]));
});
test('Streaming signals are prefix-identical to replay diagnostics with no future input',()=>{
  const bars=fixture(),scan=createScanner();let latest;
  for(let i=0;i<bars.length;i++){latest=scan.push(bars[i]);if(i>bars.length-6)assert.deepEqual(latest,analyze(bars.slice(0,i+1)));}
});
test('Historical fills use bid/ask; ambiguous entry-stop-target candles score a loss',()=>{
  const bars=fixture(),base=backtest(bars,bars[0].time,bars.at(-1).time+60000,0),stress=backtest(bars,bars[0].time,bars.at(-1).time+60000,.0001);
  assert.equal(base.submissions,1);assert.equal(base.trades,1);assert.equal(base.wins,0);assert.ok(base.pnlUSDPerOneEUR<0);
  assert.ok(stress.pnlUSDPerOneEUR<base.pnlUSDPerOneEUR);
});
test('Forecast features are unchanged by future prices and labels do not cross missing minutes',()=>{
  const bars=fixture();const past=featureAt(bars,100);
  const changed=bars.map((b,i)=>i>100?{...b,close:2}:b);assert.deepEqual(featureAt(changed,100),past);
  const missing=bars.filter((_,i)=>i!==100);const rows=samples(missing);
  assert.ok(rows.every(r=>r.labelTime-r.time===5*60000));
  assert.ok(!rows.some(r=>r.time<bars[100].time&&r.labelTime>bars[100].time));
});
test('Forecast probabilities are bounded and evaluated against a training-frequency baseline',()=>{
  const rows=Array.from({length:1500},(_,i)=>({x:[i%2?1:-1],y:i%2}));
  const model=train(rows),metrics=evaluate(model,rows.slice(1200));
  assert.ok(model.predict([1])>.5);assert.ok(model.predict([-1])<.5);
  assert.ok(metrics.brier<metrics.baselineBrier);assert.equal(metrics.samples,300);
  assert.ok(model.predict([1e8])<=1&&model.predict([-1e8])>=0);
});
const {candidateScanner,analyzeCandidate,blockConfidence,passesDevelopment,passesHoldout,compareCandidates}=require('./candidates');
test('Candidate indicators are causal and a gap resets their warm-up',()=>{
  const bars=fixture(),scanner=candidateScanner('trend-breakout-20');let got;
  for(let i=0;i<bars.length-1;i++)got=scanner.push(bars[i]);
  assert.deepEqual(got,analyzeCandidate('trend-breakout-20',bars.slice(0,-1)));
  const future={...bars.at(-1),time:bars.at(-1).time+3600000};
  assert.equal(scanner.push(future).signal,null);assert.equal(scanner.push({...future,time:future.time+60000}).stage,'Building indicator history');
});
test('Positive results on development alone cannot enable a candidate',()=>{
  const metrics={trades:25,profitFactor:1.5,pnlUSDPerOneEUR:.01,meanPnlUSD:.0004};
  const row={development:{base:metrics,stress:metrics},validation:{base:metrics,stress:{...metrics,pnlUSDPerOneEUR:-.001}}};
  assert.equal(passesDevelopment(row),false);assert.equal(passesHoldout(row),false);
  row.validation.stress=metrics;assert.equal(passesDevelopment(row),true);assert.equal(passesHoldout(row),false);
  row.holdout={base:metrics,stress:metrics};row.confidence={lower:-.0001};assert.equal(passesHoldout(row),false);
  row.confidence.lower=.0001;assert.equal(passesHoldout(row),true);
});
test('Candidate selection never opens holdouts when development/validation gates fail',()=>{
  let count=0;const result=compareCandidates(fixture(),()=>{count++;return {trades:0,profitFactor:null,pnlUSDPerOneEUR:0,meanPnlUSD:null,dailyPnlUSD:[]};});
  assert.equal(count,12);assert.equal(result.demoCandidate,null);assert.equal(result.passedInitialChecks,false);
  assert.ok(result.candidates.every(c=>!c.holdout));
});
test('Block-bootstrap intervals are deterministic and detect a consistently negative sample',()=>{
  const daily=Array(30).fill(-.001),a=blockConfidence(daily),b=blockConfidence(daily);
  assert.deepEqual(a,b);assert.ok(a.upper<0);assert.equal(a.days,30);assert.equal(blockConfidence([1]).lower,null);
});
test('Breakout candidates actually generate executable orders on a causal trending fixture',()=>{
  const {assessOrder}=require('./strategy');const scan=candidateScanner('trend-breakout-20');let accepted=0;
  for(let i=0;i<1000;i++){
    const time=Date.parse('2026-11-17T00:00:00Z')+i*60000,open=1.1+i*.00002,close=open+.00002;
    const r=scan.push({time,open,close,high:close+.00001,low:open-.00001});
    if(r.signal){const q={status:'tradeable',time:new Date(time+60000).toISOString(),bids:[{price:close-.00001}],asks:[{price:close+.00001}]};if(assessOrder(r.signal,q,5,time+60000).order)accepted++;}
  }
  assert.ok(accepted>0);
});
