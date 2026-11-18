'use strict';

const HOUR = 3600000;
const MINUTE = 60000;
const TREND_HOURS = 48;
const RANGE_HOURS = 24;
const ATR_HOURS = 20;
const STRATEGY = {id:'hourly-trend',name:'Hourly trend breakout'};

function hourlyTrendScanner() {
  const completed = [];
  let hour = null;

  return {push(bar) {
    const start = Math.floor(bar.time / HOUR) * HOUR;
    if (!hour || hour.start !== start) {
      hour = {start,first:bar.time,last:bar.time,count:0,high:bar.high,low:bar.low};
    }
    if (hour.count && bar.time !== hour.last + MINUTE) hour.incomplete = true;
    hour.last = bar.time;
    hour.count++;
    hour.high = Math.max(hour.high,bar.high);
    hour.low = Math.min(hour.low,bar.low);
    if (bar.time + MINUTE !== start + HOUR || hour.first !== start || hour.count !== 60 || hour.incomplete) {
      return {signal:null,stage:'Waiting for a complete hourly candle'};
    }

    const prior = completed.slice();
    completed.push({...hour,close:bar.close});
    if (completed.length > TREND_HOURS) completed.shift();
    if (prior.length < TREND_HOURS) return {signal:null,stage:'Building hourly trend history'};

    const range = prior.slice(-RANGE_HOURS);
    const momentum = bar.close - prior[0].close;
    const long = momentum > 0 && bar.close > Math.max(...range.map(b => b.high));
    const short = momentum < 0 && bar.close < Math.min(...range.map(b => b.low));
    if (!long && !short) return {signal:null,stage:'Waiting for a trend-aligned hourly breakout'};

    const atrBars = prior.slice(-(ATR_HOURS + 1));
    const atr = atrBars.slice(1).reduce((total,b,i) => {
      const previousClose = atrBars[i].close;
      return total + Math.max(b.high - b.low,Math.abs(b.high - previousClose),Math.abs(b.low - previousClose));
    },0) / ATR_HOURS;
    if (!(atr > 0)) return {signal:null,stage:'Waiting for a valid hourly volatility reading'};

    const dir = long ? 1 : -1;
    const limit = bar.close - dir * atr / 4;
    const risk = 2 * atr;
    return {
      stage:'Hourly breakout confirmed',
      signal:{dir,time:bar.time,limit,stop:limit-dir*risk,target:limit+dir*risk*2,entryMinutes:60,idPrefix:'mmb-h1'}
    };
  }};
}

module.exports = {STRATEGY,hourlyTrendScanner};
