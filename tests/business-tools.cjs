const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/../business/index.html','utf8');const code=html.match(/<script>([\s\S]*?)<\/script>/)[1];new vm.Script(code);
const pure=code.slice(0,code.indexOf('let state='))+code.slice(code.indexOf('function validateSavedQuote'),code.indexOf('function persist'));const sandbox={document:{getElementById(){}},Intl,Date,crypto:require('node:crypto').webcrypto};vm.createContext(sandbox);vm.runInContext(pure+'\nthis.api={calcPrice,calcJob,calcQuote,dateOK,validateRecords,quoteErrors};',sandbox);const a=sandbox.api;let checks=0;function test(fn){fn();checks++;}
const p={hours:8,rate:30,materials:120,travel:25,other:15,overhead:40,margin:30};
test(()=>assert.equal(a.calcPrice(p).price,628.57));test(()=>assert.equal(a.calcPrice({...p,margin:0}).price,440));test(()=>assert.equal(a.calcPrice({...p,margin:100}),null));test(()=>assert.equal(a.calcPrice({...p,materials:-1}),null));test(()=>assert.equal(a.calcPrice({...p,hours:''}),null));test(()=>assert.equal(a.calcPrice({...p,rate:'no'}),null));test(()=>assert.equal(a.calcPrice({...p,rate:Infinity}),null));
const j={quoted:'615',estimated:'420',revenue:'615',labour:'240',materials:'120',travel:'25',other:'55'};
test(()=>assert.equal(a.calcJob(j).profit,175));test(()=>assert.equal(a.calcJob(j).change,-20));test(()=>assert.equal(a.calcJob({...j,revenue:'0'}).margin,null));test(()=>assert.equal(a.calcJob({...j,revenue:'0'}).profit,-440));test(()=>assert.equal(a.calcJob({...j,other:''}),null));test(()=>assert.equal(a.calcJob({...j,labour:-1}),null));
const q={id:'q1',business:'Example',contact:'hello@example.com',address:'',customer:'Customer',email:'',location:'Site',number:'Q001',date:'2026-11-06',valid:'2026-11-20',tax:'13',scope:'Scope',exclusions:'None',terms:'On completion',lines:[{description:'Labour',qty:'8',price:'55'},{description:'Materials',qty:'1',price:'150'},{description:'Travel',qty:'1',price:'25'}]};
test(()=>assert.equal(a.calcQuote(q).total,694.95));test(()=>assert.equal(a.calcQuote({...q,tax:''}),null));test(()=>assert.equal(a.calcQuote({...q,tax:-1}),null));test(()=>assert.equal(a.calcQuote({...q,lines:[{description:'x',qty:0,price:10}]}),null));test(()=>assert.equal(a.calcQuote({...q,lines:[{description:'',qty:1,price:10}]}),null));test(()=>assert.equal(a.calcQuote({...q,lines:[]}),null));test(()=>assert.equal(a.calcQuote({...q,tax:'0'}).total,615));
test(()=>assert.equal(a.dateOK('2026-02-30'),false));test(()=>assert.equal(a.dateOK('2024-02-29'),true));test(()=>assert.equal(a.dateOK('1900-02-29'),false));test(()=>assert.ok(a.quoteErrors({...q,valid:'2026-11-01'}).length));test(()=>assert.ok(a.quoteErrors({...q,email:'bad'}).length));test(()=>assert.equal(a.quoteErrors(q).length,0));
const record={...j,id:'j1',name:'Example',notes:'',date:'2026-11-06'};
test(()=>assert.equal(a.validateRecords({version:1,quotes:[q],jobs:[record]}).jobs.length,1));test(()=>assert.throws(()=>a.validateRecords({version:1,quotes:[q,q],jobs:[]})));test(()=>assert.throws(()=>a.validateRecords({version:1,quotes:[],jobs:[{...record,other:-1}]})));test(()=>assert.throws(()=>a.validateRecords({version:2,quotes:[],jobs:[]})));test(()=>assert.throws(()=>a.validateRecords({version:1,quotes:[{...q,lines:[{description:'x',qty:'',price:0}]}],jobs:[]})));
// Browser persistence must not overwrite unreadable records or newer edits from another tab.
function storageFixture({current=null,base=null,blocked=false,throws=false}={}){
 const warning={hidden:true,textContent:''};let value=current,writes=0;
 const box={document:{getElementById(){return warning;}},localStorage:{getItem(){if(throws)throw Error('Storage unavailable');return value;},setItem(k,v){if(throws)throw Error('Storage unavailable');value=v;writes++;}},console};
 vm.createContext(box);const start=code.indexOf('function persist()'),end=code.indexOf('\ntry{const raw=',start);
 vm.runInContext('const KEY="test";let state={version:1,quotes:[],jobs:[]},lastStoredRaw='+JSON.stringify(base)+',storageBlocked='+blocked+',storageOK=true;const $=id=>document.getElementById(id);'+code.slice(start,end)+';this.save=persist;',box);
 return{save:()=>box.save(),value:()=>value,writes:()=>writes,warning};
}
test(()=>{const f=storageFixture();assert.equal(f.save(),true);assert.equal(f.writes(),1);});
test(()=>{const f=storageFixture({current:'newer',base:'older'});assert.equal(f.save(),false);assert.equal(f.value(),'newer');assert.equal(f.writes(),0);assert.equal(f.warning.hidden,false);});
test(()=>{const f=storageFixture({current:'unreadable',blocked:true});assert.equal(f.save(),false);assert.equal(f.value(),'unreadable');});
test(()=>{const f=storageFixture({throws:true});assert.equal(f.save(),false);assert.equal(f.writes(),0);});
test(()=>{const f=storageFixture();assert.equal(f.save(),true);assert.equal(f.save(),true);assert.equal(f.writes(),2);});
assert.ok(html.includes("const KEY='veydravo-business-v1'"));
assert.ok(!html.includes("supabase.from('finance_data')"));
console.log(`${checks} calculation, validation, backup and persistence checks passed. JavaScript parses.`);
