import Stripe from 'npm:stripe@23.0.0';
import {createClient} from 'npm:@supabase/supabase-js@2.57.0';
import {checkoutParams,CATALOG} from '../_shared/cleaning-payment.mjs';
import {financeCheckoutParams,FINANCE_PRICES,PORTAL_CONFIG,toolAccess,hasFinanceAccess} from '../_shared/billing-policy.mjs';
const origin='https://veltrix-finance.onrender.com';
const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Cache-Control':'no-store','Content-Type':'application/json'};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
const checked=async(p:PromiseLike<any>)=>{const r=await p;if(r.error)throw r.error;return r.data;};
Deno.serve(async req=>{
 if(req.headers.get('origin')!==origin)return json({error:'Origin not allowed'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 const key=Deno.env.get('STRIPE_SANDBOX_KEY')||'';
 if(Deno.env.get('CLEANING_SANDBOX_ENABLED')!=='true'||!/^rk_test_/.test(key))return json({error:'Test billing is unavailable'},503);
 const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
 if(!token)return json({error:'Sign in to your VEYDRAVO account first'},401);
 let input;
 try{const raw=await req.text();if(raw.length>1000)throw Error();input=JSON.parse(raw);if(!['status','business','finance','portal'].includes(input.action))throw Error();}catch{return json({error:'Invalid billing request'},400);}
 const auth=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false}});
 const {data,error}=await auth.auth.getUser(token);
 if(error||!data.user)return json({error:'Sign in again to continue'},401);
 const uid=data.user.id;
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const stripe=new Stripe(key,{apiVersion:'2026-09-30.endive',maxNetworkRetries:1,timeout:15000});
 const financeReady=Deno.env.get('FINANCE_SANDBOX_ENABLED')==='true';
 let lease:string|null=null;
 try{
  if(input.action==='status'){
   const orders=await checked(db.from('cleaning_sandbox_orders').select('sku,state,created_at').eq('user_id',uid));
   const account=await checked(db.from('billing_sandbox_accounts').select('customer_id,risk_blocked').eq('user_id',uid).maybeSingle());
   const subscriptions=await checked(db.from('billing_sandbox_subscriptions').select('status,price_id,access_until,cancel_at_period_end,updated_at').eq('user_id',uid).order('updated_at',{ascending:false}));
   const subscription=subscriptions.find((s:any)=>hasFinanceAccess(s,account?.risk_blocked))||subscriptions[0]||null;
   return json({sandbox:true,beta_free:true,tools:toolAccess(orders),orders,finance:{enabled:financeReady,subscription,access:hasFinanceAccess(subscription,account?.risk_blocked),review_required:!!account?.risk_blocked,can_manage:financeReady&&!!account?.customer_id}});
  }
  if(input.action==='business'&&!Object.hasOwn(CATALOG,input.sku))return json({error:'Unknown product'},400);
  if(input.action==='finance'&&!Object.hasOwn(FINANCE_PRICES,input.period))return json({error:'Unknown billing period'},400);
  if(input.action!=='business'&&!financeReady)return json({error:'Subscription testing is being connected. Your free beta access is unchanged.'},503);
  lease=crypto.randomUUID();
  const acquired=await checked(db.rpc('claim_billing_sandbox_lease',{owner_id:uid,request_id:lease}));
  if(!acquired)return json({error:'Another checkout is opening. Wait a moment, then refresh purchases.'},409);
  const account=await checked(db.from('billing_sandbox_accounts').select('*').eq('user_id',uid).single());
  if(input.action==='business'){
   const orders=await checked(db.from('cleaning_sandbox_orders').select('sku,state').eq('user_id',uid));
   const access=toolAccess(orders);
   if(input.sku==='business-bundle'?Object.values(access).every(Boolean):access[input.sku])return json({error:'This account already owns that test purchase. Refresh purchases.'},409);
   // Account-scoped daily key prevents duplicate sessions from double taps/retries.
   const session=await stripe.checkout.sessions.create(checkoutParams(uid,origin,'tqrmavzk',input.sku),{idempotencyKey:'business-ui:'+uid+':'+input.sku+':'+orders.length+':'+Math.floor(Date.now()/86400000)});
   if(session.status==='complete')return json({error:'Payment is already complete. Refresh purchases to check access.'},409);
   if(session.status!=='open'||!session.url||session.livemode)return json({error:'This test checkout has expired. Try again tomorrow.'},409);
   return json({url:session.url,sandbox:true});
  }
  let customer=account.customer_id;
  if(!customer){
   if(input.action==='portal')return json({error:'Start a subscription before opening billing management'},409);
   // No copied email/address; Stripe customer ID is the ownership boundary.
   const c=await stripe.customers.create({}, {idempotencyKey:'finance-customer:'+uid});
   if(c.livemode)throw Error('Wrong environment');
   customer=c.id;
   await checked(db.from('billing_sandbox_accounts').update({customer_id:customer}).eq('user_id',uid).eq('lease_id',lease));
  }
  if(input.action==='portal'){
   const portal=await stripe.billingPortal.sessions.create({customer,configuration:PORTAL_CONFIG,return_url:origin+'/billing/'});
   return json({url:portal.url,sandbox:true});
  }
  if(account.risk_blocked)return json({error:'This test billing account needs review. Use Manage subscription for existing billing.'},409);
  const all=await stripe.subscriptions.list({customer,status:'all',limit:100});
  if(all.has_more)return json({error:'This billing account needs review before another subscription.'},409);
  if(all.data.some(s=>!['canceled','incomplete_expired'].includes(s.status)))return json({error:'This account already has a subscription. Use Manage subscription.'},409);
  const open=await stripe.checkout.sessions.list({customer,status:'open',limit:100});
  if(open.has_more)return json({error:'Too many open test checkouts. Complete or cancel the existing checkout.'},409);
  const pending=open.data.find(s=>s.mode==='subscription');
  if(pending?.url)return json({url:pending.url,sandbox:true,resumed:true});
  const trialEligible=!account.trial_used&&all.data.length===0;
  const session=await stripe.checkout.sessions.create(financeCheckoutParams(customer,input.period,trialEligible,origin),{idempotencyKey:'finance-ui:'+uid+':'+input.period+':'+all.data.length+':'+Math.floor(Date.now()/86400000)});
  if(session.livemode||session.status!=='open'||!session.url)throw Error('Invalid checkout');
  return json({url:session.url,sandbox:true});
 }catch{return json({error:'Test billing could not finish. Refresh purchases and retry. No live payment was made.'},502);}
 finally{if(lease)await db.from('billing_sandbox_accounts').update({lease_id:null,lease_until:null}).eq('user_id',uid).eq('lease_id',lease);}
});
