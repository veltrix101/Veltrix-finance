import assert from 'node:assert/strict';
import {subscriptionSnapshot,hasFinanceAccess,toolAccess,financeCheckoutParams,FINANCE_PRICES} from '../supabase/functions/_shared/billing-policy.mjs';
let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
const now=Date.parse('2026-11-07T12:00:00Z'),end=now/1000+86400;
const fixture={id:'sub_test',customer:'cus_test',livemode:false,status:'trialing',trial_end:end,cancel_at_period_end:false,items:{has_more:false,data:[{quantity:1,current_period_end:end,price:{id:FINANCE_PRICES.monthly,currency:'cad',unit_amount:499,recurring:{interval:'month',interval_count:1}}}]}};
const clone=()=>structuredClone(fixture);
let s=subscriptionSnapshot(fixture,7);check(s.customer_id,'cus_test');check(s.event_created,7);check(hasFinanceAccess(s,false,now),true);check(hasFinanceAccess(s,true,now),false);check(hasFinanceAccess(s,false,end*1000),false);
let scheduled=clone();scheduled.cancel_at=end-3600;check(subscriptionSnapshot(scheduled).cancel_at_period_end,true);check(subscriptionSnapshot(scheduled).access_until,new Date((end-3600)*1000).toISOString());check(hasFinanceAccess(subscriptionSnapshot(scheduled),false,(end-3600)*1000),false);
for(const status of ['past_due','unpaid','canceled','paused','incomplete','incomplete_expired'])check(hasFinanceAccess({...s,status},false,now),false);
check(hasFinanceAccess({...s,status:'active',cancel_at_period_end:true},false,now),true);
for(const mutate of [x=>x.livemode=true,x=>x.items.has_more=true,x=>x.items.data[0].quantity=2,x=>x.items.data[0].price.currency='usd',x=>x.items.data[0].price.unit_amount=1,x=>x.items.data[0].price.recurring.interval_count=2,x=>x.items.data[0].price.id='price_unknown']){let sub=clone();mutate(sub);check(subscriptionSnapshot(sub),null);}
let annual=clone();annual.items.data[0].price={id:FINANCE_PRICES.annual,currency:'cad',unit_amount:3999,recurring:{interval:'year',interval_count:1}};check(subscriptionSnapshot(annual).price_id,FINANCE_PRICES.annual);
check(toolAccess([]),{'job-pricing':false,'quote-builder':false,'profit-tracker':false});
check(toolAccess([{sku:'business-bundle',state:'revoked'}]),toolAccess([]));
check(toolAccess([{sku:'job-pricing',state:'active'}]),{'job-pricing':true,'quote-builder':false,'profit-tracker':false});
check(toolAccess([{sku:'business-bundle',state:'active'}]),{'job-pricing':true,'quote-builder':true,'profit-tracker':true});
for(const period of ['monthly','annual']){const first=financeCheckoutParams('cus_owner',period,true,'https://example.com');check(first.customer,'cus_owner');check(first.line_items[0].price,FINANCE_PRICES[period]);check(first.subscription_data.trial_period_days,14);check(first.subscription_data.trial_settings.end_behavior.missing_payment_method,'cancel');check(first.payment_method_types,undefined);check(first.payment_method_collection,'if_required');const repeat=financeCheckoutParams('cus_owner',period,false,'https://example.com');check(repeat.subscription_data.trial_period_days,undefined);check(repeat.payment_method_collection,'always');}
assert.throws(()=>financeCheckoutParams('cus_owner','free',true,'https://example.com'));checks++;
console.log(checks+' billing policy checks passed: expiry, cancellation, failed renewal, risk suspension, SKU isolation and trial rules.');
