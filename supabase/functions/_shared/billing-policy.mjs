export const FINANCE_PRICES = Object.freeze({monthly:'price_1UZ5JlH2vDw2eQVYsRylkNZg',annual:'price_1UZ5JoH2vDw2eQVYnqDKUKgA'});
export const PORTAL_CONFIG='bpc_1UZ5KVH2vDw2eQVYcHoYVv2R';
export const idOf = value => typeof value==='string'?value:value?.id;
export function subscriptionSnapshot(sub,eventCreated=0) {
 const items=sub.items?.data;
 if(sub.livemode!==false||!items||sub.items.has_more||items.length!==1||items[0].quantity!==1||!Object.values(FINANCE_PRICES).includes(items[0].price?.id))return null;
 const item=items[0],price=item.price,annual=price.id===FINANCE_PRICES.annual;
 if(price.currency!=='cad'||price.unit_amount!==(annual?3999:499)||price.recurring?.interval!==(annual?'year':'month')||price.recurring?.interval_count!==1)return null;
 const periodEnd=sub.status==='trialing'?sub.trial_end:item.current_period_end;
 const scheduled=Number.isFinite(sub.cancel_at)&&sub.cancel_at>0;
 const end=['active','trialing'].includes(sub.status)?(scheduled?Math.min(periodEnd,sub.cancel_at):periodEnd):null;
 return {subscription_id:sub.id,customer_id:idOf(sub.customer),price_id:price.id,status:sub.status,access_until:Number.isFinite(end)?new Date(end*1000).toISOString():null,cancel_at_period_end:!!sub.cancel_at_period_end||scheduled,event_created:eventCreated};
}
export function hasFinanceAccess(subscription,blocked,now=Date.now()) {
 return !blocked&&['active','trialing'].includes(subscription?.status)&&Date.parse(subscription.access_until)>now;
}
export function toolAccess(orders) {
 const owned=new Set(orders.filter(o=>o.state==='active').map(o=>o.sku));
 return Object.fromEntries(['job-pricing','quote-builder','profit-tracker'].map(sku=>[sku,owned.has(sku)||owned.has('business-bundle')]));
}
export function financeCheckoutParams(customer,period,trialEligible,origin) {
 if(!Object.hasOwn(FINANCE_PRICES,period))throw Error('Unknown subscription');
 return {mode:'subscription',customer,line_items:[{price:FINANCE_PRICES[period],quantity:1}],automatic_tax:{enabled:false},payment_method_collection:trialEligible?'if_required':'always',subscription_data:{billing_mode:{type:'flexible'},...(trialEligible?{trial_period_days:14,trial_settings:{end_behavior:{missing_payment_method:'cancel'}}}:{})},integration_identifier:'veydravo_finance_mqtrvazk',success_url:origin+'/billing/?checkout=complete',cancel_url:origin+'/billing/',custom_text:{submit:{message:'Sandbox only. No real money is charged. '+(trialEligible?'14-day trial; without a payment method, the subscription cancels when the trial ends.':'No additional free trial.')}}};
}
