'use strict';
// Explicit sweep -> structure break + FVG interpretation, completed M1 bars only.
function londonDay(time) {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));
}
function inSession(time) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',weekday:'short',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(time)).map(p=>[p.type,p.value]));
  return !['Sat','Sun'].includes(parts.weekday) && Number(parts.hour)>=8 && Number(parts.hour)<11;
}
function latestSignal(bars) {
  if(bars.length<1500) return null;
  let setup=null, occupiedUntil=-1, lastDay=null, result=null;
  const buckets=[3600000,14400000,86400000].map(size=>({size,current:null,previous:null}));
  for(let i=0;i<bars.length;i++) {
    const b=bars[i],day=londonDay(b.time);
    if(lastDay!==day) {setup=null;occupiedUntil=-1;lastDay=day;}
    for(const a of buckets) {
      const key=Math.floor(b.time/a.size);
      if(!a.current || a.current.key!==key) {a.previous=a.current; a.current={key,high:b.high,low:b.low};}
    }
    if(i && b.time-bars[i-1].time!==60000) {setup=null;occupiedUntil=-1;}
    if(!inSession(b.time)) setup=null;
    if(setup && i>setup.expires) setup=null;
    if(inSession(b.time) && i>occupiedUntil && i>=5) {
      if(setup && i>setup.at) {
        setup.extreme=setup.dir===1?Math.min(setup.extreme,b.low):Math.max(setup.extreme,b.high);
        const broken=setup.dir===1?b.close>setup.structure:b.close<setup.structure;
        const gap=setup.dir===1?b.low>bars[i-2].high:b.high<bars[i-2].low;
        if(broken && gap) {
          const limit=setup.dir===1?(b.low+bars[i-2].high)/2:(b.high+bars[i-2].low)/2;
          const targets=setup.levels.filter(v=>setup.dir*(v-limit)>0).sort((a,c)=>Math.abs(a-limit)-Math.abs(c-limit));
          if(targets.length && i===bars.length-1) result={dir:setup.dir,limit,stop:setup.extreme,target:targets[0],time:b.time};
          occupiedUntil=i+10; setup=null;
        }
      }
      if(!setup && i>occupiedUntil && buckets.every(a=>a.previous) && b.time-bars[0].time>=86400000) {
        const lows=buckets.map(a=>a.previous.low),highs=buckets.map(a=>a.previous.high);
        const long=lows.some(v=>b.low<v && b.close>v),short=highs.some(v=>b.high>v && b.close<v);
        if(long!==short) {
          const prior=bars.slice(i-5,i);
          setup={dir:long?1:-1,at:i,expires:i+15,extreme:long?b.low:b.high,
            structure:long?Math.max(...prior.map(v=>v.high)):Math.min(...prior.map(v=>v.low)),levels:[...lows,...highs]};
        }
      }
    }
    for(const a of buckets) {a.current.high=Math.max(a.current.high,b.high);a.current.low=Math.min(a.current.low,b.low);}
  }
  return result;
}
function orderFor(signal, price, precision=5, now=Date.now()) {
  if(!signal || !price || price.status!=='tradeable' || !inSession(now)) return null;
  const age=now-(signal.time+60000);
  const quoteAge=now-Date.parse(price.time);
  if(age<0 || age>90000 || !Number.isFinite(quoteAge) || quoteAge< -5000 || quoteAge>15000) return null;
  const bid=Number(price.bids?.[0]?.price),ask=Number(price.asks?.[0]?.price);
  if(!(bid>0 && ask>=bid)) return null;
  const round=v=>Number(v.toFixed(precision));
  const entry=round(signal.limit), stop=round(signal.stop),target=round(signal.target);
  const risk=signal.dir*(entry-stop),reward=signal.dir*(target-entry),spread=ask-bid;
  if(!(risk>0 && reward>0) || reward/(risk+spread)<1.5 || spread>risk*.2) return null;
  if(signal.dir===1 ? entry>=bid || stop>=bid : entry<=ask || stop<=ask) return null;
  const expires=signal.time+11*60000;
  if(expires<=now) return null;
  const id=`mmb-${signal.time}-${signal.dir===1?'L':'S'}`;
  return {type:'LIMIT',instrument:'EUR_USD',units:String(signal.dir),price:entry.toFixed(precision),
    timeInForce:'GTD',gtdTime:new Date(expires).toISOString(),positionFill:'DEFAULT',
    clientExtensions:{id,tag:'mmb-demo-v1'},tradeClientExtensions:{id:`${id}-trade`,tag:'mmb-demo-v1'},
    stopLossOnFill:{price:stop.toFixed(precision),timeInForce:'GTC'},
    takeProfitOnFill:{price:target.toFixed(precision),timeInForce:'GTC'}};
}
module.exports={londonDay,inSession,latestSignal,orderFor};
