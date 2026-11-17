'use strict';
// Three fixed candidates, not an open-ended parameter search.
const {inSession}=require('./strategy');
const CANDIDATES=[
  {id:'trend-breakout-20',name:'20-minute trend breakout',kind:'breakout',lookback:20,stopATR:4,targetATR:8},
  {id:'trend-breakout-60',name:'60-minute trend breakout',kind:'breakout',lookback:60,stopATR:4,targetATR:8},
  {id:'range-reversion-20',name:'20-minute range reversion',kind:'reversion',lookback:20,stopATR:2,targetATR:4}
];
function candidateScanner(id){
  const cfg=CANDIDATES.find(c=>c.id===id);if(!cfg)throw Error('Unknown research strategy');
  const prior=[];let previousTime=null,cooldown=0,fast=null,slow=null;
  return {push(b){
    if(previousTime!==null&&b.time-previousTime!==60000){prior.length=0;fast=null;slow=null;cooldown=0;}
    previousTime=b.time;
    fast=fast===null?b.close:fast+(b.close-fast)*2/21;
    slow=slow===null?b.close:slow+(b.close-slow)*2/61;
    let signal=null,stage='Building indicator history';
    if(prior.length>=80){
      cooldown=Math.max(0,cooldown-1);stage='Waiting for the next completed five-minute check';
      // Sample only completed five-minute boundaries, never a partially formed minute.
      if((b.time+60000)%300000===0&&inSession(b.time)&&cooldown===0){
        const recent=prior.slice(-cfg.lookback),last20=prior.slice(-20);
        const tr=last20.map((v,i)=>Math.max(v.high-v.low,Math.abs(v.high-(i?last20[i-1].close:v.open)),Math.abs(v.low-(i?last20[i-1].close:v.open))));
        const atr=tr.reduce((a,v)=>a+v,0)/tr.length;
        let dir=0,target=null;
        if(cfg.kind==='breakout'){
          if(b.close>Math.max(...recent.map(v=>v.high))&&fast>slow)dir=1;
          else if(b.close<Math.min(...recent.map(v=>v.low))&&fast<slow)dir=-1;
          stage='Waiting for a trend-aligned range breakout';
        }else{
          const mean=recent.reduce((a,v)=>a+v.close,0)/recent.length;
          const sd=Math.sqrt(recent.reduce((a,v)=>a+(v.close-mean)**2,0)/recent.length);
          const z=sd?(b.close-mean)/sd:0;
          if(Math.abs(fast-slow)<atr){if(z< -2&&b.close>b.open)dir=1;else if(z>2&&b.close<b.open)dir=-1;}
          target=mean;stage='Waiting for a range extreme and reversal candle';
        }
        if(dir&&atr>0){
          const limit=b.close-dir*atr*.25,stop=limit-dir*atr*cfg.stopATR;
          const take=target??limit+dir*atr*cfg.targetATR;
          if(dir*(take-limit)>0){signal={dir,time:b.time,limit,stop,target:take};cooldown=10;stage='Candidate setup confirmed';}
        }
      }
    }
    prior.push(b);if(prior.length>100)prior.shift();
    return {signal,stage};
  }};
}
function analyzeCandidate(id,bars){const scan=candidateScanner(id);let result={signal:null,stage:'Building indicator history'};for(const b of bars)result=scan.push(b);return result;}
function blockConfidence(daily,seed=78123){
  if(daily.length<10)return {days:daily.length,lower:null,upper:null};
  let state=seed;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const means=[];
  for(let sample=0;sample<500;sample++){
    let sum=0,n=0;
    while(n<daily.length){const start=Math.floor(random()*daily.length);for(let j=0;j<3&&n<daily.length;j++,n++)sum+=daily[(start+j)%daily.length];}
    means.push(sum/daily.length);
  }
  means.sort((a,b)=>a-b);return {days:daily.length,lower:means[12],upper:means[487],method:'500 circular three-day block bootstrap resamples; 95% interval for daily simulated P/L'};
}
function passesDevelopment(row){return row.development.base.trades>=20&&row.validation.base.trades>=10&&row.development.stress.pnlUSDPerOneEUR>0&&row.validation.stress.pnlUSDPerOneEUR>0&&row.validation.base.profitFactor>=1.1;}
function passesHoldout(row){
  if(!passesDevelopment(row)||!row.holdout)return false;
  return row.development.base.trades+row.validation.base.trades+row.holdout.base.trades>=50&&row.holdout.base.trades>=10&&row.holdout.base.profitFactor>=1.1&&row.holdout.stress.pnlUSDPerOneEUR>0&&row.confidence.lower>0;
}
function compareCandidates(bars,backtest){
  const first=bars[0].time,last=bars.at(-1).time+60000,cut1=bars[Math.floor(bars.length*.6)].time,cut2=bars[Math.floor(bars.length*.8)].time;
  const rows=CANDIDATES.map(cfg=>{
    const factory=()=>candidateScanner(cfg.id),simulate=(a,b)=>({base:backtest(bars,a,b,0,factory),stress:backtest(bars,a,b,.0001,factory)});
    return {id:cfg.id,name:cfg.name,development:simulate(first,cut1),validation:simulate(cut1,cut2)};
  });
  // Freeze a single candidate using development and validation only; other holdouts remain unopened.
  const eligible=rows.filter(passesDevelopment).sort((a,b)=>b.validation.stress.meanPnlUSD-a.validation.stress.meanPnlUSD);
  let chosen=eligible[0]||null;
  if(chosen){
    const factory=()=>candidateScanner(chosen.id);
    chosen.holdout={base:backtest(bars,cut2,last,0,factory),stress:backtest(bars,cut2,last,.0001,factory)};
    chosen.confidence=blockConfidence(chosen.holdout.stress.dailyPnlUSD);
  }
  const passed=chosen&&passesHoldout(chosen);
  return {method:'Three prespecified candidates. 60% development / 20% validation select one candidate; only the selected candidate is evaluated on the final 20%. No automatic retry or tuning after failure.',
    dataCaveat:'The later dates were previously used to evaluate the original strategy. These are additional retrospective checks, not pristine unseen data. Prospective paper trading is still required.',
    candidates:rows,selectedCandidate:chosen?.id||null,passedInitialChecks:Boolean(passed),
    demoCandidate:passed?chosen.id:null,
    verdict:passed?'A replacement passed the initial retrospective gates. Eligible only for one-unit forward demo testing; no real-money approval.':'No replacement passed the prespecified gates. New demo entries are paused; research and broker monitoring continue.'};
}
module.exports={CANDIDATES,candidateScanner,analyzeCandidate,blockConfidence,passesDevelopment,passesHoldout,compareCandidates};
