// Explicit diagnostic only: isolated database + temporary image assets, never started by npm test.
import dotenv from 'dotenv';
dotenv.config({quiet:true});
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Category from '../src/models/Category.js';
import Dish from '../src/models/Dish.js';
import Banner from '../src/models/Banner.js';
import Setting from '../src/models/Setting.js';
import PromoCode from '../src/models/PromoCode.js';
import {generateToken} from '../src/utils/authSession.js';
import {deleteFromCloudinary} from '../src/utils/cloudinaryUpload.js';
const dbName='zcrud_'+randomUUID().replaceAll('-','').slice(0,24);
const server=createServer(app),checks=[];
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1cAAAAASUVORK5CYII=','base64');
let base,token;
async function request(method,path,body,expected=200,roleToken=token){
 const headers=roleToken?{Authorization:'Bearer '+roleToken}:{};
 if(body && !(body instanceof FormData))headers['Content-Type']='application/json';
 const response=await fetch(base+path,{method,headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
 const json=await response.json();assert.equal(response.status,expected,method+' '+path+': '+json.message);return json;
}
function form(fields,imageField='image'){const f=new FormData();for(const[k,v]of Object.entries(fields))f.set(k,String(v));if(imageField)f.set(imageField,new Blob([image],{type:'image/png'}),'crud-test.png');return f;}
try{
 await mongoose.connect(process.env.MONGO_URI,{dbName});
 assert.equal(mongoose.connection.name,dbName);
 await Promise.all([User.init(),Category.init(),Dish.init(),PromoCode.init()]);
 const admin=await User.create({name:'Diagnostic Admin',email:'admin@example.test',password:randomUUID(),role:'admin'});
 const customer=await User.create({name:'Diagnostic Customer',email:'customer@example.test',password:randomUUID(),role:'user'});
 token=generateToken(admin._id,admin.sessionVersion);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port+'/api';
 const cat=(await request('POST','/categories',form({name:'Diagnostic Pasta',description:'Temporary test category'}),201)).data;
 const cat2=(await request('PUT','/categories/'+cat._id,form({name:'Diagnostic Pasta Updated'}))).data;
 assert.notEqual(cat.image,cat2.image);assert.notEqual(cat.cloudinaryPublicId,cat2.cloudinaryPublicId);checks.push('Category image create and replacement');
 await request('POST','/categories',{name:'Diagnostic Pasta Updated'},409);
 await request('PUT','/categories/not-an-id',{name:'Invalid'},400);
 const dish=(await request('POST','/dishes',form({name:'Diagnostic Dish',category:cat._id,price:100,description:'Test only'}),201)).data;
 await request('PUT','/dishes/'+dish._id,{isAvailable:false});
 const edited=(await request('PUT','/dishes/'+dish._id,form({name:'Edited Dish',category:cat._id,price:150,oldPrice:''}))).data;
 assert.equal(edited.isAvailable,false);assert.equal(edited.price,150);assert.equal(edited.oldPrice,null);assert.notEqual(edited.cloudinaryPublicId,dish.cloudinaryPublicId);checks.push('Dish create, image replacement, price and sold-out preservation');
 await request('DELETE','/categories/'+cat._id,undefined,409);checks.push('Category reference integrity');
 await request('PUT','/dishes/'+dish._id,{price:-5},400);
 await request('POST','/dishes',{name:'Invalid category',category:'Unknown category',price:100,image:'https://example.com/food.png'},400);
 assert.equal(await Category.countDocuments(),1);checks.push('Invalid prices and unknown categories rejected without side effects');
 const invalidFile=form({name:'Bad file'},null);invalidFile.set('image',new Blob(['text'],{type:'text/plain'}),'wrong.txt');await request('POST','/categories',invalidFile,400);
 const big=form({name:'Too large'},null);big.set('image',new Blob([Buffer.alloc(5*1024*1024+1)],{type:'image/png'}),'large.png');await request('POST','/categories',big,413);checks.push('Wrong image type and oversized upload rejected');
 let settings=(await request('PUT','/settings',form({restaurantName:'Diagnostic Kitchen',deliveryFee:75,freeDeliveryThreshold:1000,minOrderAmount:100},'logo'))).data;
 assert.ok(settings.logoCloudinaryPublicId);settings=(await request('PUT','/settings',{removeLogo:true})).data;assert.equal(settings.logo,'');checks.push('Restaurant settings, logo upload and removal');
 const banner=(await request('POST','/banners',{title:'Diagnostic offer',image:cat2.image,isActive:false},201)).data;
 // JSON false must remain false, just like multipart string false.
 assert.equal(banner.isActive,false);
 const changed=(await request('PUT','/banners/'+banner._id,{title:'Edited offer',isActive:true})).data;assert.equal(changed.isActive,true);await request('DELETE','/banners/'+banner._id);checks.push('Banner create/update/delete and boolean handling');
 const promo=(await request('POST','/promos',{code:'DIAGNOSTIC10',title:'Test offer',discountType:'percentage',discountValue:10},201)).data;
 const promo2=(await request('PUT','/promos/'+promo._id,{discountValue:20})).data;assert.equal(promo2.discountValue,20);await request('PUT','/promos/'+promo._id,{discountValue:101},400);await request('DELETE','/promos/'+promo._id);checks.push('Coupon create/update/delete and invalid percentage');
 await request('PUT','/dishes/'+dish._id,{price:99},403,generateToken(customer._id,customer.sessionVersion));checks.push('Customer cannot perform admin mutations');
 const dash=await request('GET','/admin/dashboard');assert.ok(dash.results.every(r=>r.status===200));checks.push('Every admin dashboard reader succeeds');
 await request('DELETE','/dishes/'+dish._id);await request('DELETE','/categories/'+cat._id);await request('DELETE','/dishes/'+dish._id,undefined,404);checks.push('Delete dish then category; repeated delete reports missing');
 console.log('PASS',checks);
 fs.writeFileSync('ADMIN_CRUD_DIAGNOSTIC.json',JSON.stringify({date:new Date().toISOString(),checks,passed:true,isolatedDatabase:true},null,2));
}finally{
 if(mongoose.connection.readyState===1 && mongoose.connection.name===dbName && /^zcrud_[a-f0-9]{24}$/.test(dbName)){
  for(const [model,key] of [[Category,'cloudinaryPublicId'],[Dish,'cloudinaryPublicId'],[Banner,'cloudinaryPublicId'],[Setting,'logoCloudinaryPublicId']]){for(const record of await model.find().lean())if(record[key])await deleteFromCloudinary(record[key]);}
  await mongoose.connection.dropDatabase();console.log('Temporary diagnostic database and image assets cleaned.');
 }
 await mongoose.disconnect();server.closeAllConnections();await new Promise(r=>server.close(r));
}
