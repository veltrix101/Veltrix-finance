'use strict';
let refreshing=false;
const put=(id,value)=>{document.getElementById(id).textContent=value;};
const localTime=value=>value?new Date(value).toLocaleString():null;
async function refresh(){
  if(refreshing)return;
  refreshing=true;
  try {
    const response=await fetch('/api/status',{cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error();
    const s=await response.json(),age=s.lastCheck?Date.now()-Date.parse(s.lastCheck):Infinity;
    const fresh=s.connected && age<90000;
    const badge=document.getElementById('connection');
    badge.className='badge '+(fresh?'good':'warn');
    badge.textContent=fresh?'Connected to OANDA demo':s.lastCheck?'Connection needs attention':'Awaiting first connection';
    put('status',age>=90000 && s.lastCheck?'Status check overdue. Trading may be interrupted.':s.status);
    put('checked',s.lastCheck?'Checked: '+localTime(s.lastCheck):'Waiting for the first check');
    put('pending',s.pendingOrders??0);put('trades',s.openTrades??0);put('today',s.ordersToday??0);
    put('candle',localTime(s.lastCandle)||'Waiting for market data');put('order',localTime(s.lastOrder)||'None recorded');
    put('session',(s.sessionOpen?'Open · ':'Closed · ')+(s.entryWindow||'Weekdays'));put('execution',s.executionCheck?.status||'Not requested');
    const p = s.performance;
    let summary = 'Checking closed trades…';
    if (p?.unavailable) summary = 'Broker results temporarily unavailable.';
    else if (p?.count === 0) summary = 'No closed 1,000-unit strategy trades yet.';
    else if (p?.count > 0) {
      const money = n => new Intl.NumberFormat('en-CA',{style:'currency',currency:p.currency}).format(n);
      summary = p.count+' closed · Net '+money(p.net)+' '+p.currency+' · Wins '+p.wins+'/'+p.count+
        ' ('+Math.round(100*p.wins/p.count)+'%) · Largest loss '+money(-p.worst)+
        ' · Largest drop from a prior closed-trade peak '+money(p.drawdown);
    }
    put('performance',summary);
    put('stage',s.stage||s.status);put('strategy',s.strategy||'Validation checks pending');
  } catch {
    put('connection','Unable to reach bot');document.getElementById('connection').className='badge warn';
    put('status','Connection check failed. Previously shown values may be stale.');
  } finally {refreshing=false;}
}
document.getElementById('refresh').onclick=refresh;
refresh();setInterval(refresh,30000);

async function refreshResearch(){try{const r=await(await fetch('/api/research',{cache:'no-store',signal:AbortSignal.timeout(15000)})).json();put('research-phase',r.phase+(r.progress&&r.progress<100?' · '+r.progress+'%':''));if(r.result){const d=r.result, replay=d.currentReplay;
    if (replay) put('current-replay','Historical replay of '+replay.strategy+' on the latest 20% of the sample using current hours and entry limit: '+replay.base.trades+' simulated trades, USD '+(1000*replay.base.pnlUSDPerOneEUR).toFixed(2)+' at 1,000 units, or USD '+(1000*replay.stress.pnlUSDPerOneEUR).toFixed(2)+' with an extra pip of slippage per side. Excludes commissions and financing.');
    const t=d.strategy.splits.at(-1);put('research-summary',d.bars.toLocaleString()+' historical candles · '+new Date(d.from).toLocaleDateString()+' to '+new Date(d.to).toLocaleDateString()+'. Holdout trades: '+t.base.trades+'.');put('strategy-verdict',r.forwardTestEnabled?'Unvalidated demo forward test is enabled by your instruction. Historical results did not pass; this does not approve real-money trading. Current schedule: '+r.testSchedule+'.':d.redesign?.verdict||d.strategy.verdict);put('forecast-verdict',d.forecast.verdict+' Forecast does not control trades. '+(d.execution?.message||''));}}catch{put('research-phase','Research status unavailable');}}
refreshResearch();setInterval(refreshResearch,30000);


if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
