import RevokedSession from '../src/models/RevokedSession.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createServer} from 'node:http';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Order from '../src/models/Order.js';
import PasswordReset from '../src/models/PasswordReset.js';
import {generateToken} from '../src/utils/authSession.js';
import {authenticateToken} from '../src/middlewares/authVerify.js';
import {responsePrivacy,privacyReplacer} from '../src/utils/responsePrivacy.js';
import {isAllowedOrigin} from '../src/utils/originPolicy.js';
import {getOrderById,getMyOrders} from '../src/controllers/orderController.js';
import {verifyResetOtp} from '../src/controllers/authController.js';
import {validPassword} from '../src/utils/authInput.js';
import {deliverCampaign} from '../src/services/notificationCampaigns.js';
import Device from '../src/models/PushDevice.js';
import Notification from '../src/models/Notification.js';
const admin='aaaaaaaaaaaaaaaaaaaaaaaa',customer='bbbbbbbbbbbbbbbbbbbbbbbb',other='cccccccccccccccccccccccc';
const response=()=>({statusCode:200,status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}});
function env(t,key,value){const previous=process.env[key];if(value===undefined)delete process.env[key];else process.env[key]=value;t.after(()=>{if(previous===undefined)delete process.env[key];else process.env[key]=previous;});}
function tokens(t){t.mock.method(RevokedSession,'exists',async()=>null);env(t,'JWT_SECRET','security-test-only-secret-at-least-32-characters');return{admin:generateToken(admin),customer:generateToken(customer)};}
async function serve(instance){const server=createServer(instance);await new Promise(r=>server.listen(0,'127.0.0.1',r));return{url:'http://127.0.0.1:'+server.address().port,close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));}};}
const idPath='/'+other;
const adminPaths=[['GET','/api/admin/dashboard'],['GET','/api/auth/users'],['GET','/api/auth/users'+idPath+'/orders'],['PATCH','/api/auth/users'+idPath+'/block'],['GET','/api/orders'],['GET','/api/orders/analytics/reports'],['PUT','/api/orders'+idPath+'/status'],['POST','/api/dishes'],['PUT','/api/dishes'+idPath],['DELETE','/api/dishes'+idPath],['GET','/api/categories/admin'],['POST','/api/categories'],['PUT','/api/categories'+idPath],['DELETE','/api/categories'+idPath],['GET','/api/banners/admin'],['POST','/api/banners'],['PUT','/api/banners'+idPath],['DELETE','/api/banners'+idPath],['PUT','/api/settings'],['GET','/api/contacts'],['PUT','/api/contacts'+idPath+'/reply'],['DELETE','/api/contacts'+idPath],['GET','/api/promos'],['POST','/api/promos'],['PUT','/api/promos'+idPath],['DELETE','/api/promos'+idPath],['GET','/api/notifications/campaigns/recipients'],['GET','/api/notifications/campaigns'],['POST','/api/notifications/campaigns']];
const routers={auth:'authRoutes',admin:'adminRoutes',orders:'orderRoutes',dishes:'dishRoutes',categories:'categoryRoutes',banners:'bannerRoutes',settings:'settingRoutes',contacts:'contactRoutes',promos:'promoRoutes',notifications:'notificationRoutes'};

test('all 29 admin endpoints reject anonymous/customers and permit the database admin role',async t=>{
 const signed=tokens(t);t.mock.method(User,'findById',id=>({select:async()=>({_id:id,id:String(id),role:String(id)===admin?'admin':'user',sessionVersion:0,isBlocked:false})}));
 // Replace only the final controller, retaining the actual auth/admin/upload middleware chains.
 for(const file of Object.values(routers)){const {default:router}=await import('../src/routes/'+file+'.js');for(const layer of router.stack){if(layer.route){const entry=layer.route.stack.at(-1);if(layer.route.stack.length > 1 || entry.handle.name){const original=entry.handle;entry.handle=(_req,res)=>res.json({reached:true});t.after(()=>{entry.handle=original;});}}}}
 const server=await serve(app);try{for(const[method,path]of adminPaths){for(const[role,expected]of [['anonymous',401],['customer',403],['admin',200]]){const r=await fetch(server.url+path,{method,headers:{...(signed[role]?{Authorization:'Bearer '+signed[role]}:{}),'Content-Type':'application/json'},body:['GET','DELETE'].includes(method)?undefined:JSON.stringify({image:'https://example.com/image.png'})});assert.equal(r.status,expected,role+' '+method+' '+path);if(role==='admin')assert.equal((await r.json()).reached,true);}}
 const forged=jwt.sign({id:customer,ver:0,role:'admin'},process.env.JWT_SECRET,{expiresIn:'1h',issuer:'zaykora-api',audience:'zaykora-app'});assert.equal((await fetch(server.url+'/api/admin/dashboard',{headers:{Authorization:'Bearer '+forged}})).status,403);
 }finally{await server.close();}
});

test('expired, wrong-algorithm, wrong-audience, malformed-ID and missing-expiry JWTs never query a user',async t=>{
 tokens(t);let lookups=0;t.mock.method(User,'findById',()=>{lookups++;throw Error('Must reject before database lookup');});
 const opts={issuer:'zaykora-api',audience:'zaykora-app'};
 for(const token of [jwt.sign({id:customer,ver:0},process.env.JWT_SECRET,{...opts,expiresIn:-1}),jwt.sign({id:customer,ver:0},process.env.JWT_SECRET,{...opts,algorithm:'HS512',expiresIn:'1h'}),jwt.sign({id:customer,ver:0},process.env.JWT_SECRET,{...opts,audience:'another-app',expiresIn:'1h'}),jwt.sign({id:'malformed',ver:0},process.env.JWT_SECRET,{...opts,expiresIn:'1h'}),jwt.sign({id:customer,ver:0},process.env.JWT_SECRET,opts)])await assert.rejects(authenticateToken(token),error=>error.status===401);
 assert.equal(lookups,0);
});

test('no hardcoded JWT fallback is accepted when signing secret is missing',async t=>{env(t,'JWT_SECRET',undefined);await assert.rejects(authenticateToken('any-token'),error=>error.status===503);assert.throws(()=>generateToken(customer),/not configured/);});

test('response filtering hides nested credentials and internals but retains allowed auth/reset/payment output',()=>{
 const secretData={JWT_SECRET:'private-jwt',STRIPE_SECRET_KEY:'private-stripe',MONGO_URI:'private-database',password:'hash',googleId:'sub',sessionVersion:5,checkoutPayloadHash:'hash',paymentResult:{id:'pi_internal'},cloudinaryPublicId:'internal',__v:3,private_key:'private',nested:{token:'device-secret',refresh_token:'refresh',stack:'trace'}};
 const root={...secretData,token:'jwt-required',resetToken:'reset-required',clientSecret:'sheet-required',publishableKey:'pk_test_public',user:{id:customer,role:'user',...secretData}};
 const serialize=(path,authenticated=false,method='POST')=>JSON.parse(JSON.stringify(root,privacyReplacer({path,method,success:true,authenticated},root)));
 assert.equal(serialize('/api/auth/profile',true,'PUT').token,'jwt-required');assert.equal(serialize('/api/auth/profile',false,'PUT').token,undefined);
 const auth=serialize('/api/auth/login');assert.equal(auth.token,'jwt-required');assert.equal(auth.resetToken,undefined);assert.equal(auth.clientSecret,undefined);assert.equal(auth.user.password,undefined);assert.equal(auth.JWT_SECRET,undefined);assert.equal(auth.STRIPE_SECRET_KEY,undefined);assert.equal(auth.MONGO_URI,undefined);assert.equal(auth.user.sessionVersion,undefined);assert.equal(auth.user.nested.token,undefined);
 assert.equal(serialize('/api/auth/verify-reset-otp').resetToken,'reset-required');assert.equal(serialize('/api/payment/payment-sheet',true).clientSecret,'sheet-required');assert.equal(serialize('/api/payment/payment-sheet',false).clientSecret,undefined);assert.equal(serialize('/api/orders').paymentResult,undefined);assert.equal(serialize('/api/orders').token,undefined);
});

test('actual JSON responses mask server failures, escape markup reversibly and disable private caching',async()=>{
 const fixture=express();fixture.use(responsePrivacy);fixture.get('/fail',(_req,res)=>res.status(500).json({message:'mongodb://user:password@private-host',stack:'secret trace'}));fixture.get('/safe',(_req,res)=>res.json({text:'<script>&</script>',password:'hash'}));const server=await serve(fixture);
 try{const failure=await fetch(server.url+'/fail');const text=await failure.text();assert.equal(failure.status,500);assert.equal(text.includes('private-host'),false);assert.equal(text.includes('secret trace'),false);assert.equal(failure.headers.get('cache-control'),'no-store');assert.ok(failure.headers.get('x-request-id'));const safe=await fetch(server.url+'/safe');const raw=await safe.text();assert.equal(raw.includes('<script>'),false);assert.equal(JSON.parse(raw).text,'<script>&</script>');}finally{await server.close();}
});

test('Mongoose serialization cannot return a selected password hash',()=>{const user=new User({name:'Fixture',email:'fixture@example.test',password:'selected-hash',googleId:'private-sub',sessionVersion:2});const result=user.toJSON();assert.equal(result.password,undefined);assert.equal(result.googleId,undefined);assert.equal(result.sessionVersion,undefined);});

test('email equality never authorizes another account order; own-order listing uses only account ID',async t=>{t.mock.method(Order,'findById',()=>({populate:async()=>({_id:other,user:other,customerEmail:'same@example.test'})}));const r=response();await getOrderById({params:{id:other},user:{_id:customer,email:'same@example.test',role:'user'}},r);assert.equal(r.statusCode,403);let query;t.mock.method(Order,'find',q=>{query=q;return{populate:()=>({sort:async()=>[]})};});await getMyOrders({user:{_id:customer,email:'same@example.test'}},response());assert.deepEqual(query,{user:customer});});

test('production CORS accepts only configured HTTPS browser origins and allows originless native clients',t=>{env(t,'NODE_ENV','production');env(t,'CORS_ALLOWED_ORIGINS','https://admin.example.test');env(t,'FRONTEND_URL',undefined);assert.equal(isAllowedOrigin(undefined),true);assert.equal(isAllowedOrigin('https://admin.example.test'),true);assert.equal(isAllowedOrigin('https://admin.example.test.evil.test'),false);assert.equal(isAllowedOrigin('http://admin.example.test'),false);assert.equal(isAllowedOrigin('http://192.168.1.6:8081'),false);});

test('development CORS allows local/LAN preview origins, not arbitrary websites',t=>{env(t,'NODE_ENV','development');env(t,'CORS_ALLOWED_ORIGINS','');env(t,'FRONTEND_URL',undefined);assert.equal(isAllowedOrigin('http://localhost:8081'),true);assert.equal(isAllowedOrigin('http://192.168.1.6:8081'),true);assert.equal(isAllowedOrigin('https://evil.example.test'),false);});

test('concurrent wrong OTPs cannot exceed the shared challenge guess budget',async t=>{
 t.mock.method(User,'find',()=>({select:async()=>[{_id:customer}]}));let attempts=0;t.mock.method(PasswordReset,'findOneAndUpdate',async(query,update)=>{if(update.$inc){assert.equal(query.attempts.$lt,5);if(attempts>=5)return null;attempts++;return{_id:other,otpHash:crypto.createHash('sha256').update('123456').digest('hex')};}throw Error('Wrong guesses must not issue tokens');});
 const replies=Array.from({length:8},()=>response());await Promise.all(replies.map(r=>verifyResetOtp({ip:'test-wrong',body:{email:'wrong@example.test',otp:'999999'}},r)));assert.equal(attempts,5);assert.ok(replies.every(r=>r.statusCode===400));
});

test('concurrent valid OTP reuse issues only one reset token',async t=>{
 t.mock.method(User,'find',()=>({select:async()=>[{_id:customer}]}));let consumed=false;
 t.mock.method(PasswordReset,'findOneAndUpdate',async(query,update)=>{if(update.$inc)return{_id:other,otpHash:crypto.createHash('sha256').update('123456').digest('hex')};assert.equal(query.verifiedAt,null);if(consumed)return null;consumed=true;return{_id:other};});const a=response(),b=response();await Promise.all([verifyResetOtp({ip:'test-correct',body:{email:'correct@example.test',otp:'123456'}},a),verifyResetOtp({ip:'test-correct',body:{email:'correct@example.test',otp:'123456'}},b)]);assert.deepEqual([a.statusCode,b.statusCode].sort(),[200,400]);const success=[a,b].find(r=>r.statusCode===200);assert.match(success.body.resetToken,/^[a-f0-9]{64}$/);
});

test('passwords reject non-strings and bcrypt-truncated values',()=>{assert.equal(validPassword({password:'anything'}),false);assert.equal(validPassword('a'.repeat(73)),false);assert.equal(validPassword('é'.repeat(37)),false);assert.equal(validPassword('strong-password'),true);});

test('revoked push registrations are excluded by the current session version before provider delivery',async t=>{
 t.mock.method(User,'findById',()=>({select:async()=>({role:'user',sessionVersion:2,isBlocked:false})}));t.mock.method(Notification,'updateOne',async()=>({}));let filter;t.mock.method(Device,'find',query=>{filter=query;return{select:async()=>[{_id:other,token:'fixture-current-token'}]};});let sent;t.mock.method(Device,'deleteMany',async()=>({}));const campaign={_id:other,recipients:[customer],title:'Fixture',message:'Fixture',inboxCount:0,usersWithoutDevice:0,pushAccepted:0,pushFailed:0,save:async()=>{}};await deliverCampaign(campaign,{sendEachForMulticast:async input=>{sent=input;return{successCount:1,failureCount:0,responses:[{success:true}]};}});assert.equal(filter.sessionVersion,2);assert.deepEqual(sent.tokens,['fixture-current-token']);
});

test('every private customer/payment endpoint rejects missing authentication',async t=>{
 tokens(t);const server=await serve(app);
 const paths=[['GET','/api/auth/security'],['POST','/api/auth/mfa/setup'],['POST','/api/auth/mfa/enable'],['POST','/api/auth/mfa/disable'],['POST','/api/auth/email/request'],['POST','/api/auth/email/verify'],['POST','/api/auth/logout'],['GET','/api/auth/profile'],['PUT','/api/auth/profile'],['POST','/api/auth/google/link'],['GET','/api/customer-state'],['PUT','/api/customer-state'],['POST','/api/orders/quote'],['POST','/api/orders'],['GET','/api/orders/my-orders'],['GET','/api/orders/'+other],['POST','/api/orders/apply-promo'],['GET','/api/notifications'],['PUT','/api/notifications/read-all'],['PUT','/api/notifications/'+other+'/read'],['DELETE','/api/notifications/'+other],['POST','/api/notifications/devices'],['POST','/api/notifications/devices/unregister'],['POST','/api/payment/payment-sheet'],['POST','/api/payment/confirm-payment-sheet'],['POST','/api/payment/create-checkout-session'],['POST','/api/payment/confirm-checkout-session'],['POST','/api/payment/process-card-payment'],['POST','/api/reviews/'+other],['DELETE','/api/reviews/'+other]];
 try{for(const[method,path]of paths){const r=await fetch(server.url+path,{method,headers:{'Content-Type':'application/json'},body:method==='GET'||method==='DELETE'?undefined:'{}'});assert.equal(r.status,401,method+' '+path);}}finally{await server.close();}
});

test('upload middleware rejects disguised non-image files before a controller or provider is called',async()=>{
 const {upload}=await import('../src/middlewares/upload.js');const fixture=express();let writes=0;fixture.post('/',upload.single('image'),(_req,res)=>{writes++;res.json({ok:true});});const{errorHandler}=await import('../src/middlewares/errorHandler.js');fixture.use(errorHandler);const server=await serve(fixture);
 try{const bad=new FormData();bad.set('image',new Blob(['<html>not an image</html>'],{type:'image/png'}),'fake.png');const rejected=await fetch(server.url,{method:'POST',body:bad});assert.equal(rejected.status,400);assert.equal(writes,0);const good=new FormData();good.set('image',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1cAAAAASUVORK5CYII=','base64')],{type:'image/png'}),'real.png');assert.equal((await fetch(server.url,{method:'POST',body:good})).status,200);assert.equal(writes,1);}finally{await server.close();}
});

test('public registration ignores injected admin/block/session fields before persistence',async t=>{
 const {register}=await import('../src/controllers/authController.js');let input;t.mock.method(User,'findOne',async()=>null);t.mock.method(User,'create',async data=>{input=data;throw new Error('Stop fixture before any welcome email');});
 await register({body:{name:'Customer',email:'new@example.test',password:'strong-password',role:'admin',isBlocked:false,sessionVersion:99}},response());
 assert.equal(input.role,'user');assert.equal(input.isBlocked,undefined);assert.equal(input.sessionVersion,undefined);
});

test('profile edits cannot modify role, Google identity or revocation version',async t=>{
 const {updateProfile}=await import('../src/controllers/authController.js');const record={_id:customer,name:'Customer',email:'customer@example.test',role:'user',sessionVersion:3,googleId:'verified-subject',savedAddresses:[],save:async()=>record};t.mock.method(User,'findById',()=>({select:async()=>record}));const r=response();await updateProfile({user:{_id:customer},body:{name:'Updated',role:'admin',googleId:'attacker',sessionVersion:0,savedAddresses:[{label:'Home',address:'Address',role:'admin'}]}},r);assert.equal(r.statusCode,200);assert.equal(record.role,'user');assert.equal(record.sessionVersion,3);assert.equal(record.googleId,'verified-subject');assert.equal(record.savedAddresses[0].role,undefined);
});

test('public DTOs exclude unlisted fields and do not leak nested catalog internals',async()=>{
 const {publicDish,publicSettings}=await import('../src/utils/publicData.js');
 const dish=publicDish({_id:customer,name:'Pasta',price:100,image:'https://example.com/photo.png',costPrice:40,internalNotes:'private',cloudinaryPublicId:'private',category:{_id:other,name:'Pasta',internal:'private'}});
 assert.equal(dish.costPrice,undefined);assert.equal(dish.internalNotes,undefined);assert.equal(dish.cloudinaryPublicId,undefined);assert.equal(dish.category.internal,undefined);
 const settings=publicSettings({restaurantName:'Kitchen',contactEmail:'public@example.test',logoCloudinaryPublicId:'internal',stripeSecret:'private'});assert.equal(settings.contactEmail,'public@example.test');assert.equal(settings.stripeSecret,undefined);
});

test('public settings reads never create a database record',async t=>{
 const {default:Setting}=await import('../src/models/Setting.js');const {getSettings}=await import('../src/controllers/settingController.js');
 t.mock.method(Setting,'findOne',async()=>null);t.mock.method(Setting,'create',async()=>{throw new Error('Public read attempted a write');});const r=response();await getSettings({},r);assert.equal(r.statusCode,200);assert.equal(r.body.data._id,undefined);
});

test('auth brute-force quota cannot be bypassed with forged forwarded IP headers',async()=>{
 const {default:router}=await import('../src/routes/authRoutes.js');const layer=router.stack.find(item=>item.route?.path==='/login'&&item.route.stack.at(-1).handle.name==='login').route.stack.at(-1);const original=layer.handle;layer.handle=(_req,res)=>res.json({ok:true});const server=await serve(app);
 try{let last;for(let i=0;i<22;i++)last=await fetch(server.url+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':'198.51.100.'+i},body:'{}'});assert.equal(last.status,429);assert.equal(last.headers.get('x-ratelimit-scope'),'auth');assert.ok(Number(last.headers.get('retry-after'))>0);}finally{layer.handle=original;await server.close();}
});

test('logged-out push session is filtered even if a racing device registration survives',async t=>{t.mock.method(User,'findById',()=>({select:async()=>({role:'user',sessionVersion:0,isBlocked:false})}));t.mock.method(Notification,'updateOne',async()=>({}));t.mock.method(Device,'find',()=>({select:async()=>[{_id:other,token:'revoked-device',sessionHash:'revoked-hash'},{_id:customer,token:'active-device',sessionHash:'active-hash'}]}));t.mock.method(RevokedSession,'find',()=>({select:()=>({lean:async()=>[{_id:'revoked-hash'}]})}));let sent;const campaign={_id:other,recipients:[customer],title:'Fixture',message:'Fixture',inboxCount:0,usersWithoutDevice:0,pushAccepted:0,pushFailed:0,save:async()=>{}};await deliverCampaign(campaign,{sendEachForMulticast:async input=>{sent=input;return{successCount:1,failureCount:0,responses:[{success:true}]};}});assert.deepEqual(sent.tokens,['active-device']);});
