(async function(){
'use strict';
const base='https://podzzorjsvhsdiqistpd.supabase.co',key='sb_publishable_8_E2DXr76Qq-NaOrVwc7_w_vSFngK3E';
const $=id=>document.getElementById(id),status=$('billing-status');
const client=window.supabase.createClient(base,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
let busy=false,generation=0,session=null,refreshTimer;
function message(s){status.textContent=s;}
async function request(body){
 const {data,error}=await client.auth.getSession();if(error||!data.session)throw Error('Sign in on the homepage, then return here.');
 const r=await fetch(base+'/functions/v1/billing-sandbox',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
 const result=await r.json();if(!r.ok)throw Error(result.error||'Billing is unavailable. Please retry.');return result;
}
function controls(disabled){document.querySelectorAll('button').forEach(b=>b.disabled=disabled);}
async function refresh(){
 const gen=++generation;clearTimeout(refreshTimer);controls(true);
 try{
  const {data}=await client.auth.getSession();session=data.session;
  $('billing-signin').hidden=!!session;$('billing-content').hidden=!session;
  if(!session){message('Sign in to check purchases and manage billing. Early access remains free.');return;}
  $('billing-account').textContent='Signed in as '+session.user.email;
  const result=await request({action:'status'});if(gen!==generation)return;
  for(const [sku,owned] of Object.entries(result.tools)){
   document.querySelector('[data-access="'+sku+'"]').textContent=owned?'Owned in sandbox':'No active test purchase';
   document.querySelector('[data-sku="'+sku+'"]').disabled=owned;
  }
  const bundle=Object.values(result.tools).every(Boolean);
  document.querySelector('[data-sku="business-bundle"]').disabled=bundle;
  document.querySelector('[data-access="business-bundle"]').textContent=bundle?'All three owned in sandbox':'';
  const f=result.finance,s=f.subscription;
  document.querySelectorAll('[data-period]').forEach(b=>b.disabled=!f.enabled||f.review_required||!!(s&&!['canceled','incomplete_expired'].includes(s.status)));
  $('manage-billing').disabled=!f.can_manage;
  $('finance-billing-state').textContent=!f.enabled?'Subscription tests are being connected. Your free beta access is unchanged.':f.review_required?'Test billing needs review. Paid access is suspended.':s?'Test subscription: '+s.status+(f.access&&s.access_until?' · '+(s.cancel_at_period_end?'Cancels after ':'Current access through ')+new Date(s.access_until).toLocaleDateString():s.status==='past_due'?' · Payment overdue. Paid subscription access is unavailable. Use Manage test subscription to update payment details.':' · No active paid subscription access.'):'No test subscription yet.';
  $('purchase-history').replaceChildren(...result.orders.map(o=>{const li=document.createElement('li');li.textContent=o.sku.replaceAll('-',' ')+' · '+(o.state==='active'?'Active test purchase':'Refunded or revoked')+' · '+new Date(o.created_at).toLocaleDateString();return li;}));
  if(!result.orders.length){const li=document.createElement('li');li.textContent='No test purchases yet.';$('purchase-history').append(li);}
  message(new URLSearchParams(location.search).has('checkout')?'Returned from checkout. Access shown below comes from verified Stripe notifications. Refresh if a payment is still processing.':'Sandbox only. No real charges. Your existing early access is free.');
  $('refresh-billing').disabled=false;
 }catch(e){message(e.message);$('refresh-billing').disabled=false;}
}
async function checkout(body){if(busy)return;busy=true;controls(true);message('Opening secure Stripe test checkout…');try{const r=await request(body);const url=new URL(r.url);if(url.protocol!=='https:'||!['checkout.stripe.com','billing.stripe.com'].includes(url.hostname))throw Error('Unexpected checkout destination');location.assign(url.href);}catch(e){await refresh();message(e.message);busy=false;}}
document.querySelectorAll('[data-sku]').forEach(b=>b.onclick=()=>checkout({action:'business',sku:b.dataset.sku}));
document.querySelectorAll('[data-period]').forEach(b=>b.onclick=()=>checkout({action:'finance',period:b.dataset.period}));
$('manage-billing').onclick=()=>checkout({action:'portal'});$('refresh-billing').onclick=refresh;
client.auth.onAuthStateChange(()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,0);});
window.addEventListener('pageshow',()=>{if(!busy)refresh();});await refresh();
})();
