(async function(){
'use strict';
if(new URLSearchParams(location.search).get('billing-test')!=='1')return;
const base='https://podzzorjsvhsdiqistpd.supabase.co',key='sb_publishable_8_E2DXr76Qq-NaOrVwc7_w_vSFngK3E';
const client=window.supabase.createClient(base,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
const sections={pricing:'job-pricing',quotes:'quote-builder',jobs:'profit-tracker'};
const note=document.createElement('div');note.className='card';note.setAttribute('role','status');note.style.marginBottom='24px';
document.querySelector('main').prepend(note);
let generation=0,rerun=false;
function lock(access,message){note.replaceChildren(document.createTextNode(message+' '));const a=document.createElement('a');a.href='../billing/';a.className='download-link';a.textContent='Purchases & billing';note.append(a);for(const[id,sku]of Object.entries(sections)){document.querySelectorAll('#'+id+' input, #'+id+' select, #'+id+' textarea, #'+id+' button').forEach(e=>e.disabled=!access[sku]);}}
async function check(){const gen=++generation;try{const {data}=await client.auth.getSession();if(!data.session){lock({},'Test access: sign in on the homepage, then return here.');return null;}const response=await fetch(base+'/functions/v1/billing-sandbox',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({action:'status'}),cache:'no-store'});const result=await response.json();if(gen!==generation)return null;if(!response.ok)throw Error();lock(result.tools,'Sandbox purchase checks are on. Tools without an active test purchase are locked in this preview. Existing early access is still free from the regular Business tools link.');return result.tools;}catch{if(gen===generation)lock({},'Test purchases could not be verified. Refresh when connected.');return null;}}
// Recheck server-owned entitlements immediately before protected actions.
document.addEventListener('click',async e=>{const button=e.target.closest('button');const section=button?.closest('section');const sku=sections[section?.id];if(!sku||rerun)return;e.preventDefault();e.stopImmediatePropagation();const access=await check();if(access?.[sku]){rerun=true;try{button.click();}finally{rerun=false;}}},true);
lock({},'Checking test purchases…');client.auth.onAuthStateChange(()=>setTimeout(check,0));window.addEventListener('focus',check);document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});setInterval(()=>{if(!document.hidden)check();},30000);await check();
})();