'use strict';
// Explicit sweep -> structure break + FVG interpretation, completed M1 bars only.
const dayFormat=new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'});
const sessionFormat=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',weekday:'short',hour:'2-digit',hourCycle:'h23'});
function londonDay(time) {return dayFormat.format(new Date(time));}
function inSession(time,extended=false) {
  const parts=Object.fromEntries(sessionFormat.formatToParts(new Date(time)).map(p=>[p.type,p.value]));
  return !['Sat','Sun'].includes(parts.weekday) && (extended || (Number(parts.hour)>=8 && Number(parts.hour)<11));
}
function createScanner() {
  let setup=null,occupiedUntil=-1,lastDay=null,i=-1,start=null,previousTime=null;
  const prior=[],buckets=[3600000,14400000,86400000].map(size=>({size,current:null,previous:null}));
  return {push(b) {
    i++;if(start===null)start=b.time;
    let result=null;
    const day=londonDay(b.time);
    if(lastDay!==day){setup=null;occupiedUntil=-1;lastDay=day;}
    for(const a of buckets){const key=Math.floor(b.time/a.size);if(!a.current||a.current.key!==key){a.previous=a.current;a.current={key,high:b.high,low:b.low};}}
    if(previousTime!==null && b.time-previousTime!==60000){setup=null;occupiedUntil=-1;}
    if(!inSession(b.time))setup=null;
    if(setup && i>setup.expires)setup=null;
    if(inSession(b.time) && i>occupiedUntil && i>=5){
      if(setup && i>setup.at){
        setup.extreme=setup.dir===1?Math.min(setup.extreme,b.low):Math.max(setup.extreme,b.high);
        const broken=setup.dir===1?b.close>setup.structure:b.close<setup.structure;
        const gap=setup.dir===1?b.low>prior.at(-2).high:b.high<prior.at(-2).low;
        if(broken && gap){
          const limit=setup.dir===1?(b.low+prior.at(-2).high)/2:(b.high+prior.at(-2).low)/2;
          const targets=setup.levels.filter(v=>setup.dir*(v-limit)>0).sort((a,c)=>Math.abs(a-limit)-Math.abs(c-limit));
          if(targets.length)result={dir:setup.dir,limit,stop:setup.extreme,target:targets[0],time:b.time};
          occupiedUntil=i+10;setup=null;
        }
      }
      if(!setup && i>occupiedUntil && buckets.every(a=>a.previous) && b.time-start>=86400000){
        const lows=buckets.map(a=>a.previous.low),highs=buckets.map(a=>a.previous.high);
        const long=lows.some(v=>b.low<v&&b.close>v),short=highs.some(v=>b.high>v&&b.close<v);
        if(long!==short)setup={dir:long?1:-1,at:i,expires:i+15,extreme:long?b.low:b.high,
          structure:long?Math.max(...prior.map(v=>v.high)):Math.min(...prior.map(v=>v.low)),levels:[...lows,...highs]};
      }
    }
    for(const a of buckets){a.current.high=Math.max(a.current.high,b.high);a.current.low=Math.min(a.current.low,b.low);}
    prior.push(b);if(prior.length>5)prior.shift();previousTime=b.time;
    if(i<1499)return {signal:null,stage:'Building market history'};
    const stage=result?'Setup confirmed; checking entry price':!inSession(b.time)?'Outside the entry window':setup?'Sweep detected; waiting for reversal and fair-value gap':i<=occupiedUntil?'Previous setup consumed; waiting for a fresh sweep':'Waiting for a price sweep';
    return {signal:result,stage};
  }};
}
function analyze(bars){const scanner=createScanner();let result={signal:null,stage:'Building market history'};for(const b of bars)result=scanner.push(b);return result;}
function latestSignal(bars){return analyze(bars).signal;}
function assessOrder(signal, price, precision=5, now=Date.now(),options={}) {
  if(!signal || !price || price.status!=='tradeable' || !inSession(now,options.extendedSession)) return {reason:'No signal, closed session, or unavailable price'};
  const age=now-(signal.time+60000);
  const quoteAge=now-Date.parse(price.time);
  if(age<0 || age>90000 || !Number.isFinite(quoteAge) || quoteAge< -5000 || quoteAge>15000) return {reason:'Stale signal or quote'};
  const bid=Number(price.bids?.[0]?.price),ask=Number(price.asks?.[0]?.price);
  if(!(bid>0 && ask>=bid)) return {reason:'Invalid bid/ask'};
  const round=v=>Number(v.toFixed(precision));
  const entry=round(signal.limit), stop=round(signal.stop),target=round(signal.target);
  const risk=signal.dir*(entry-stop),reward=signal.dir*(target-entry),spread=ask-bid;
  if(!(risk>0 && reward>0))return {reason:'Invalid stop or target'};
  if(spread>risk*.2)return {reason:'Spread too large for stop distance'};
  if((reward-spread)/(risk+spread)<1.5)return {reason:'Insufficient net reward/risk'};
  // A passive buy limit must be below the ask; a sell limit must be above the bid.
  // Inside-spread limits are valid. Stops must remain beyond the entry and current exit-side quote.
  if(signal.dir===1 ? entry>=ask || stop>=Math.min(entry,bid) : entry<=bid || stop<=Math.max(entry,ask)) return {reason:'Entry already crossed or stop invalid'};
  const expires=signal.time+11*60000;
  if(expires<=now) return {reason:'Entry expired'};
  const id=`mmb-${signal.time}-${signal.dir===1?'L':'S'}`;
  return {reason:null,order:{type:'LIMIT',instrument:'EUR_USD',units:String(signal.dir),price:entry.toFixed(precision),
    timeInForce:'GTD',gtdTime:new Date(expires).toISOString(),positionFill:'DEFAULT',
    clientExtensions:{id,tag:'mmb-demo-v1'},tradeClientExtensions:{id:`${id}-trade`,tag:'mmb-demo-v1'},
    stopLossOnFill:{price:stop.toFixed(precision),timeInForce:'GTC'},
    takeProfitOnFill:{price:target.toFixed(precision),timeInForce:'GTC'}}};
}
function orderFor(signal,price,precision=5,now=Date.now(),options={}){return assessOrder(signal,price,precision,now,options).order||null;}
module.exports={londonDay,inSession,createScanner,analyze,latestSignal,assessOrder,orderFor};
