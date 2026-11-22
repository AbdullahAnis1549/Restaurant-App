import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import cloudinary from '../src/config/cloudinary.js';
import Category from '../src/models/Category.js';
import Dish from '../src/models/Dish.js';
import Setting from '../src/models/Setting.js';
import { updateCategory, createCategory, deleteCategory } from '../src/controllers/categoryController.js';
import { updateDish, createDish, getAllDishes } from '../src/controllers/dishController.js';
import { updateSettings } from '../src/controllers/settingController.js';
import { escapeSearch } from '../src/utils/crudErrors.js';
const id='aaaaaaaaaaaaaaaaaaaaaaaa';
const res=()=>({statusCode:200,status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}});
const file={buffer:Buffer.from('image'),mimetype:'image/png',size:5};
function provider(t,{fail=false}={}){
 const old=Object.fromEntries(['CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET'].map(k=>[k,process.env[k]]));
 for(const k of Object.keys(old))process.env[k]='test-value';
 t.after(()=>{for(const [k,v]of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 const events=[];
 t.mock.method(cloudinary.uploader,'upload_stream',(_opts,callback)=>new Writable({write(_c,_e,cb){cb();},final(cb){events.push('upload');callback(fail?{http_code:401}:null,fail?null:{secure_url:'https://images.example/new.png',public_id:'restaurant/new'});cb();}}));
 t.mock.method(cloudinary.uploader,'destroy',async key=>{events.push('delete:'+key);return{result:'ok'};});
 return events;
}
test('rejected image credentials preserve old category photo and return actionable 503',async t=>{const e=provider(t,{fail:true});t.mock.method(Category,'findById',async()=>({_id:id,cloudinaryPublicId:'restaurant/old'}));const r=res();await updateCategory({params:{id},body:{name:'Pasta'},file},r);assert.equal(r.statusCode,503);assert.match(r.body.message,/credentials/);assert.deepEqual(e,['upload']);});
test('failed database save cleans new image and retains old image',async t=>{const e=provider(t);t.mock.method(Category,'findById',async()=>({_id:id,cloudinaryPublicId:'restaurant/old'}));t.mock.method(Category,'findByIdAndUpdate',async()=>{e.push('save-failed');throw Object.assign(new Error('duplicate'),{code:11000});});const r=res();await updateCategory({params:{id},body:{name:'Pasta'},file},r);assert.equal(r.statusCode,409);assert.deepEqual(e,['upload','save-failed','delete:restaurant/new']);});
test('replacement deletes old image only after database commit',async t=>{const e=provider(t);t.mock.method(Category,'findById',async()=>({_id:id,cloudinaryPublicId:'restaurant/old'}));t.mock.method(Category,'findByIdAndUpdate',async(_id,updates)=>{e.push('saved');return{_id:id,...updates};});const r=res();await updateCategory({params:{id},body:{name:'Pasta'},file},r);assert.equal(r.statusCode,200);assert.deepEqual(e,['upload','saved','delete:restaurant/old']);});
test('duplicate category creation cleans uploaded image and reports conflict',async t=>{const e=provider(t);t.mock.method(Category,'create',async()=>{throw Object.assign(new Error('duplicate'),{code:11000});});const r=res();await createCategory({body:{name:'Pasta'},file},r);assert.equal(r.statusCode,409);assert.deepEqual(e,['upload','delete:restaurant/new']);});
test('linked categories cannot be deleted or lose their image',async t=>{const e=provider(t);let removed=false;t.mock.method(Category,'findById',async()=>({_id:id,cloudinaryPublicId:'restaurant/old',deleteOne:async()=>{removed=true;}}));t.mock.method(Dish,'exists',async()=>({_id:id}));const r=res();await deleteCategory({params:{id}},r);assert.equal(r.statusCode,409);assert.equal(removed,false);assert.deepEqual(e,[]);});
test('empty category deletion commits record removal before image cleanup',async t=>{const e=provider(t);t.mock.method(Category,'findById',async()=>({_id:id,cloudinaryPublicId:'restaurant/old',deleteOne:async()=>{e.push('removed');}}));t.mock.method(Dish,'exists',async()=>null);const r=res();await deleteCategory({params:{id}},r);assert.equal(r.statusCode,200);assert.deepEqual(e,['removed','delete:restaurant/old']);});
test('dish edits preserve availability and update matching default serving price',async t=>{let updates;t.mock.method(Dish,'findById',async()=>({_id:id,price:100,isAvailable:false,variants:[{name:'Regular',price:100},{name:'Large',price:200}]}));t.mock.method(Dish,'findByIdAndUpdate',(_id,u)=>{updates=u;return{populate:async()=>({_id:id,isAvailable:false,...u})};});const r=res();await updateDish({params:{id},body:{price:'120',oldPrice:''}},r);assert.equal(r.statusCode,200);assert.equal(updates.isAvailable,undefined);assert.equal(updates.oldPrice,null);assert.deepEqual(updates.variants,[{name:'Regular',price:120},{name:'Large',price:200}]);});
test('invalid dish prices fail before image upload',async t=>{const e=provider(t);const r=res();await createDish({body:{name:'Pasta',price:'-1',category:'Pasta'},file},r);assert.equal(r.statusCode,400);assert.deepEqual(e,[]);});
test('category browsing escapes literal symbols and never creates a category',async t=>{let query;t.mock.method(Category,'findOne',async q=>{query=q;return null;});t.mock.method(Category,'create',async()=>{throw new Error('Read attempted a write');});const r=res();await getAllDishes({query:{category:'Pizza (Hot)+'}},r);assert.equal(r.statusCode,200);assert.deepEqual(r.body.data,[]);assert.equal(query.name.$regex.test('Pizza (Hot)+'),true);assert.equal(query.name.$regex.test('Pizza Hott'),false);assert.equal(new RegExp(escapeSearch('[a].*')).test('[a].*'),true);});
test('invalid settings amounts cannot start an upload',async t=>{const e=provider(t);t.mock.method(Setting,'findOne',async()=>({_id:id}));const r=res();await updateSettings({body:{deliveryFee:'not-a-number'},file},r);assert.equal(r.statusCode,400);assert.deepEqual(e,[]);});

test('banner external URLs do not need a fabricated Cloudinary asset ID', async () => {
 const { default: Banner } = await import('../src/models/Banner.js');
 const banner=new Banner({title:'Offer',image:'https://example.com/banner.png'});
 await banner.validate();assert.equal(banner.cloudinaryPublicId,'');
});

test('JSON false creates an inactive banner rather than silently activating it', async t => {
 const { default: Banner } = await import('../src/models/Banner.js');
 const { createBanner } = await import('../src/controllers/bannerController.js');
 t.mock.method(Banner,'create',async data=>data);const r=res();
 await createBanner({body:{title:'Draft offer',image:'https://example.com/banner.png',isActive:false}},r);
 assert.equal(r.statusCode,201);assert.equal(r.body.data.isActive,false);
});

test('new uploads are capped at 1600 pixels before storage', async t => {
 provider(t);const {uploadToCloudinary}=await import('../src/utils/cloudinaryUpload.js');
 await uploadToCloudinary(file.buffer);
 const options=cloudinary.uploader.upload_stream.mock.calls[0].arguments[0];
 assert.deepEqual(options.transformation,[{width:1600,height:1600,crop:'limit'},{quality:'auto:good'}]);
});
