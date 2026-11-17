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
