import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Order from '../src/models/Order.js';
import { createPaymentSheetControllers } from '../src/controllers/paymentSheetController.js';
import { createPaymentControllers, markCheckoutPaid, markPaymentIntentPaid } from '../src/controllers/paymentController.js';
const uid=new mongoose.Types.ObjectId(), oid=new mongoose.Types.ObjectId();
const res=()=>({statusCode:200,status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;},send(body){this.body=body;return this;}});
const order=extra=>({_id:oid,user:uid,paymentMethod:'Stripe / Card',grandTotal:1749,isPaid:false,status:'Placed',customerEmail:'demo@example.test',save:async()=>{},...extra});
const intent=extra=>({id:'pi_demo',client_secret:'test-only-secret',amount:174900,amount_received:174900,currency:'pkr',status:'requires_payment_method',livemode:false,metadata:{orderId:String(oid),integration:'mobile_payment_sheet'},...extra});
const req=body=>({body:{orderId:String(oid),...body},user:{_id:uid}});
function configure(t){for(const [k,v] of Object.entries({STRIPE_PUBLISHABLE_KEY:'pk_test_fixture',STRIPE_SECRET_KEY:'sk_test_fixture'})){const old=process.env[k];process.env[k]=v;t.after(()=>{if(old===undefined)delete process.env[k];else process.env[k]=old;});}}

test('native setup enforces configuration, ownership, closed orders and positive totals',async t=>{
 configure(t); let current=order();t.mock.method(Order,'findById',async()=>current);
 const handlers=createPaymentSheetControllers(()=>({}));
 for(const [extra,status] of [[{user:new mongoose.Types.ObjectId()},403],[{status:'Cancelled'},400],[{grandTotal:0},400],[{paymentMethod:'Cash on Delivery'},400]]){current=order(extra);const r=res();await handlers.createPaymentSheet(req(),r);assert.equal(r.statusCode,status);}
 process.env.STRIPE_PUBLISHABLE_KEY='pk_live_wrong_mode';const r=res();await handlers.createPaymentSheet(req(),r);assert.equal(r.statusCode,503);
});
test('native setup uses server totals and reuses one unpaid intent on retry',async t=>{
 configure(t);const current=order();let creates=0;t.mock.method(Order,'findById',async()=>current);
 const stripe={paymentIntents:{create:async(params,options)=>{creates++;assert.equal(params.amount,174900);assert.equal(params.currency,'pkr');assert.equal(Object.hasOwn(params,'payment_method_types'),false);assert.equal(options.idempotencyKey,'mobile_pi_v1_'+oid+'_initial');return intent();},retrieve:async()=>intent()}};
 const handler=createPaymentSheetControllers(()=>stripe).createPaymentSheet;
 for(let i=0;i<2;i++){const r=res();await handler(req({amount:1}),r);assert.equal(r.statusCode,200);assert.equal(r.body.paid,false);assert.equal(r.body.testMode,true);assert.equal(r.body.paymentIntentId,'pi_demo');}
 assert.equal(creates,1);assert.equal(current.isPaid,false);
});
test('migration closes an unpaid hosted checkout before creating a native intent',async t=>{
 configure(t);const current=order({paymentResult:{id:'cs_old'}});t.mock.method(Order,'findById',async()=>current);const steps=[];
 const stripe={checkout:{sessions:{retrieve:async()=>({payment_status:'unpaid',status:'open'}),expire:async id=>{assert.equal(id,'cs_old');steps.push('expire');}}},paymentIntents:{create:async()=>{steps.push('create');return intent();}}};
 const r=res();await createPaymentSheetControllers(()=>stripe).createPaymentSheet(req(),r);assert.equal(r.statusCode,200);assert.deepEqual(steps,['expire','create']);
});
test('processing intents are never replaced and paid intents are verified on resume',async t=>{
 configure(t);const current=order({paymentResult:{id:'pi_demo'}});t.mock.method(Order,'findById',async()=>current);let state='processing',confirmed=0;
 const stripe={paymentIntents:{retrieve:async()=>intent({status:state})}};
 const handler=createPaymentSheetControllers(()=>stripe,async()=>{confirmed++;return current;}).createPaymentSheet;
 const pending=res();await handler(req(),pending);assert.equal(pending.statusCode,409);assert.equal(confirmed,0);
 state='succeeded';const paid=res();await handler(req(),paid);assert.equal(paid.body.paid,true);assert.equal(confirmed,1);
});
test('native confirmation rejects another user and an incomplete payment',async t=>{
 let current=order({user:new mongoose.Types.ObjectId()});t.mock.method(Order,'findById',async()=>current);let state='succeeded';
 const handler=createPaymentSheetControllers(()=>({paymentIntents:{retrieve:async()=>intent({status:state})}}),async()=>{throw new Error('Must not mark paid');}).confirmPaymentSheet;
 const forbidden=res();await handler(req({paymentIntentId:'pi_demo'}),forbidden);assert.equal(forbidden.statusCode,403);
 current=order();state='requires_payment_method';const pending=res();await handler(req({paymentIntentId:'pi_demo'}),pending);assert.equal(pending.statusCode,409);
});
test('native payment verification rejects mismatched current intent, amount, currency and partial payment',async t=>{
 const current=order({paymentResult:{id:'pi_demo'}});t.mock.method(Order,'findById',async()=>current);let writes=0;
 t.mock.method(Order,'findOneAndUpdate',async()=>{writes++;return current;});
 for(const fields of [{id:'pi_other'},{amount_received:1},{amount:1,amount_received:1},{currency:'usd'},{status:'requires_action'},{metadata:{orderId:String(oid)}}])assert.equal(await markPaymentIntentPaid(intent({status:'succeeded',...fields}),s=>markCheckoutPaid(s,()=>{})),null);
 assert.equal(writes,0);
});
test('verified native payment marks order Paid/Confirmed once and sends one notification',async t=>{
 const current=order({paymentResult:{id:'pi_demo'}});let notifications=0,writes=0;t.mock.method(Order,'findById',async()=>current);
 t.mock.method(Order,'findOneAndUpdate',async(query,update)=>{if(current.isPaid)return null;writes++;Object.assign(current,update.$set);return current;});t.mock.method(Order,'findOne',async()=>current);
 for(let i=0;i<2;i++)assert.ok(await markPaymentIntentPaid(intent({status:'succeeded'}),s=>markCheckoutPaid(s,()=>{notifications++;})));
 assert.equal(current.isPaid,true);assert.equal(current.paymentStatus,'Paid');assert.equal(current.status,'Confirmed');assert.equal(writes,1);assert.equal(notifications,1);
});
test('signed native webhook confirms only the current mobile intent',async t=>{
 const old=process.env.STRIPE_WEBHOOK_SECRET;process.env.STRIPE_WEBHOOK_SECRET='fixture';t.after(()=>{if(old===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=old;});
 t.mock.method(Order,'findById',async()=>order({paymentResult:{id:'pi_demo'}}));let confirmed=0;
 const stripe={webhooks:{constructEvent:()=>({type:'payment_intent.succeeded',data:{object:intent({status:'succeeded'})}})}};
 const r=res();await createPaymentControllers(()=>stripe,async()=>{confirmed++;return order();}).stripeWebhook({body:Buffer.from('fixture'),headers:{}},r);assert.equal(r.statusCode,200);assert.equal(confirmed,1);
});
