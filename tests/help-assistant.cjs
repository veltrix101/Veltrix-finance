'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {HELP_TOPICS,rank}=require('../public/assets/help-assistant.js');
const cases=[['how do I save a quote','savequote'],['reset password','password'],['how do I add a job','jobadd'],['install app','install'],['monthly budget','budget'],['export business backup','businessbackup'],['add income','transaction'],['food reserve','reserve'],['sign out','signout']];
for(const [q,id] of cases) assert.equal(rank(q,'business')[0]?.topic.id,id,q);
assert.equal(rank('what is the weather','home').length,0);
assert.equal(new Set(HELP_TOPICS.map(t=>t.id)).size,HELP_TOPICS.length);
for(const t of HELP_TOPICS){assert.ok(t.answer.length>50);for(const [,target]of t.actions)assert.equal(new URL(target,'https://example.com/').origin,'https://example.com');}
for(const file of ['index.html','finance/index.html','business/index.html'])assert.equal((fs.readFileSync(require('node:path').join(__dirname,'../public',file),'utf8').match(/help-assistant\.js/g)||[]).length,1);
const src=fs.readFileSync(require('node:path').join(__dirname,'../public/assets/help-assistant.js'),'utf8');assert.ok(!/\b(fetch\s*\(|localStorage\.|sessionStorage\.|XMLHttpRequest)/.test(src));
console.log('Help tests passed: ranking, unknown questions, topic integrity, same-origin links, all three pages and no network/storage access.');
