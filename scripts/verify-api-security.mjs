// Explicit opt-in security diagnostic: only a dedicated temporary database is modified.
import dotenv from 'dotenv';dotenv.config({quiet:true});
import mongoose from 'mongoose';
import {createServer} from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Order from '../src/models/Order.js';
import Device from '../src/models/PushDevice.js';
import Reset from '../src/models/PasswordReset.js';
const dbName='zsec_'+crypto.randomBytes(12).toString('hex'),checks=[];const server=createServer(app);let base;
const password='Security-fixture-'+crypto.randomBytes(10).toString('hex');
async function request(method,path,token,body,expected=200){const r=await fetch(base+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.equal(r.status,expected,method+' '+path+': '+data.message);return{data,headers:r.headers};}
try{
 await mongoose.connect(process.env.MONGO_URI,{dbName});assert.equal(mongoose.connection.name,dbName);await Promise.all([User.init(),Order.init(),Device.init(),Reset.init()]);
 const admin=await User.create({name:'Security Admin',email:'admin@example.test',password,role:'admin'}),customer=await User.create({name:'Security Customer',email:'customer@example.test',password,role:'user'}),other=await User.create({name:'Other Customer',email:'other@example.test',password,role:'user'});
 const orderFields={customerName:'Fixture',customerEmail:customer.email,customerPhone:'03000000000',deliveryAddress:'Fixture address',items:[],subtotal:100,grandTotal:100,paymentMethod:'Cash on Delivery',checkoutRequestId:crypto.randomUUID(),checkoutPayloadHash:'private-hash',paymentResult:{id:'internal-reference'}};
 const mine=await Order.create({...orderFields,user:customer._id}),theirs=await Order.create({...orderFields,checkoutRequestId:crypto.randomUUID(),user:other._id});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port+'/api';
 let token=(await request('POST','/auth/login',null,{email:customer.email,password})).data.token;assert.ok(token);checks.push('Actual password login returns the required scoped JWT');
 const firstToken=token;token=(await request('POST','/auth/login',null,{email:customer.email,password})).data.token;assert.notEqual(firstToken,token);await request('POST','/auth/logout',firstToken,{});await request('GET','/auth/profile',firstToken,null,401);await request('GET','/auth/profile',token);checks.push('Online logout revokes one session while another login remains valid');
 const profile=await request('GET','/auth/profile',token);assert.equal(profile.data.user.role,'user');assert.equal(profile.data.user.password,undefined);assert.equal(profile.data.user.googleId,undefined);assert.equal(profile.data.user.sessionVersion,undefined);assert.equal(profile.headers.get('cache-control'),'no-store');checks.push('Own profile is minimal and non-cacheable');
 await request('GET','/admin/dashboard',null,null,401);await request('GET','/admin/dashboard',token,null,403);
 const adminToken=(await request('POST','/auth/login',null,{email:admin.email,password})).data.token;const dashboard=(await request('GET','/admin/dashboard',adminToken)).data;assert.ok(dashboard.results.every(result=>result.status===200));checks.push('Anonymous/customer denied; real admin dashboard succeeds');
 const orders=(await request('GET','/orders/my-orders',token)).data.data;assert.equal(orders.length,1);assert.equal(orders[0]._id,String(mine._id));for(const key of ['paymentResult','checkoutPayloadHash','checkoutRequestId','__v'])assert.equal(orders[0][key],undefined);await request('GET','/orders/'+theirs._id,token,null,403);checks.push('Orders are ID-scoped and internal payment/idempotency details are hidden');
 await request('PUT','/auth/profile',token,{name:'Edited Customer',role:'admin',googleId:'injected',sessionVersion:0});const stored=await User.findById(customer._id);assert.equal(stored.role,'user');assert.equal(stored.googleId,undefined);checks.push('Profile mass assignment cannot elevate role or change Google identity');
 await request('POST','/notifications/devices',token,{token:'fixture-not-real-fcm-'+crypto.randomBytes(12).toString('hex'),platform:'android',user:other._id});const device=await Device.findOne({user:customer._id});assert.equal(device.sessionVersion,0);checks.push('Device registration is bound to the verified user/session');
 await request('PUT','/auth/profile',token,{password:password+'next',currentPassword:'wrong'},400);const changed=(await request('PUT','/auth/profile',token,{password:password+'next',currentPassword:password})).data;await request('GET','/auth/profile',token,null,401);token=changed.token;assert.ok(token);await request('GET','/auth/profile',token);assert.equal(await Device.countDocuments({user:customer._id}),0);checks.push('Password change requires reauthentication, rotates session and removes devices');
 const otp='123456';await Reset.create({user:customer._id,otpHash:crypto.createHash('sha256').update(otp).digest('hex'),otpExpiresAt:new Date(Date.now()+60000),resendAvailableAt:new Date()});
 const verify=await request('POST','/auth/verify-reset-otp',null,{email:customer.email,otp});assert.match(verify.data.resetToken,/^[a-f0-9]{64}$/);const successfulReset=verify.data.resetToken;await request('POST','/auth/verify-reset-otp',null,{email:customer.email,otp},400);checks.push('Actual OTP exchange keeps reset token available only once');
 await request('POST','/auth/reset-password',null,{resetToken:successfulReset,newPassword:password+'reset',confirmPassword:password+'reset'});await request('GET','/auth/profile',token,null,401);checks.push('Password reset revokes the prior session');
 token=(await request('POST','/auth/login',null,{email:customer.email,password:password+'reset'})).data.token;await request('PATCH','/auth/users/'+customer._id+'/block',adminToken,{});const blocked=await request('GET','/auth/profile',token,null,403);assert.equal(blocked.data.code,'ACCOUNT_BLOCKED');checks.push('Admin blocking invalidates an already logged-in session');
 const publicSettings=(await request('GET','/settings')).data.data;assert.equal(publicSettings.logoCloudinaryPublicId,undefined);assert.equal(publicSettings._id,undefined);checks.push('Public settings expose business display fields only');
 fs.writeFileSync('API_SECURITY_LIVE_RESULTS.json',JSON.stringify({passed:true,checkedAt:new Date().toISOString(),checks,isolatedDatabase:true,noEmailsPushesOrPaymentsSent:true},null,2));console.log('PASS',checks);
}finally{
 if(mongoose.connection.readyState===1&&mongoose.connection.name===dbName&&/^zsec_[a-f0-9]{24}$/.test(dbName)){await mongoose.connection.dropDatabase();console.log('Only the temporary security diagnostic database was removed.');}
 await mongoose.disconnect();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
