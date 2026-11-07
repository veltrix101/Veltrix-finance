import assert from 'node:assert/strict';
import { paidOrder, checkoutParams, PRICE } from '../supabase/functions/_shared/cleaning-payment.mjs';
const user = '12345678-1234-1234-1234-123456789abc';
const valid = { id:'cs_test_fixture', livemode:false, mode:'payment', status:'complete', payment_status:'paid', amount_total:2900, currency:'cad', client_reference_id:user, metadata:{sku:'cleaning-toolkit',environment:'sandbox',user_id:user},line_items:{has_more:false,data:[{price:{id:PRICE,currency:'cad',unit_amount:2900},quantity:1}]},payment_intent:{id:'pi_fixture',status:'succeeded',currency:'cad',amount_received:2900,latest_charge:{refunded:false,disputed:false}} };
let checks=0;
function test(fn){fn();checks++;}
test(()=>assert.equal(paidOrder(valid).state,'active'));
for(const delta of [{livemode:true},{payment_status:'unpaid'},{status:'open'},{mode:'subscription'},{currency:'usd'},{amount_total:2500},{client_reference_id:'another-user'},{metadata:{}},{line_items:{has_more:true,data:valid.line_items.data}},{line_items:{has_more:false,data:[]}},{line_items:{has_more:false,data:[{price:{id:'wrong'},quantity:1}]}},{payment_intent:'pi_unexpanded'},{payment_intent:{...valid.payment_intent,status:'processing'}},{payment_intent:{...valid.payment_intent,amount_received:2500}},{payment_intent:{...valid.payment_intent,latest_charge:'ch_unexpanded'}}])test(()=>assert.equal(paidOrder({...valid,...delta}),null));
for(const field of ['refunded','disputed'])test(()=>assert.equal(paidOrder({...valid,payment_intent:{...valid.payment_intent,latest_charge:{[field]:true}}}).state,'revoked'));
const params=checkoutParams(user,'https://veltrix-finance.onrender.com','abcdefgh');
test(()=>assert.equal(params.line_items[0].price,PRICE));
test(()=>assert.equal(params.client_reference_id,user));
test(()=>assert.equal(params.metadata.user_id,user));
test(()=>assert.equal(params.automatic_tax.enabled,false));
test(()=>assert.equal('payment_method_types' in params,false));
test(()=>assert.equal(params.mode,'payment'));
console.log(`${checks} sandbox fulfillment and checkout checks passed.`);
