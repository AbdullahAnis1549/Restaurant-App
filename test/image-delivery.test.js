import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import compression from 'compression';
import {createServer,get} from 'node:http';
import {gunzipSync} from 'node:zlib';
import {imageUrlForSize,imageDeliveryReplacer} from '../src/utils/imageDelivery.js';

test('Cloudinary delivery is bounded WebP and preserves the versioned source',()=>{
 const source='https://res.cloudinary.com/test/image/upload/v123/restaurant/pizza.png';
 const card=imageUrlForSize(source,'card');
 assert.match(card,/c_limit,w_480,h_480\/f_webp,q_auto:eco\/v123\/restaurant\/pizza.png$/);
 assert.match(imageUrlForSize(source,'thumb'),/w_160,h_160/);
 assert.match(imageUrlForSize(source,'detail'),/w_960,h_960/);
 assert.equal(imageUrlForSize(card,'card'),card);
});
test('signed, private and unrecognized image endpoints remain untouched',()=>{
 for(const uri of ['file:///photo.png','data:image/png;base64,abc','https://example.com/photo.jpg','https://res.cloudinary.com/test/image/authenticated/v1/photo.jpg','https://res.cloudinary.com/test/image/upload/s--secret--/v1/photo.jpg','https://images.unsplash.com/photo-123?token=secret'])assert.equal(imageUrlForSize(uri,'thumb'),uri);
});
test('Unsplash old dimensions and DPR cannot override the delivery size budget',()=>{
 const result=new URL(imageUrlForSize('https://images.unsplash.com/photo-123?w=2400&h=5000&dpr=3&fit=crop&auto=format','card'));
 assert.equal(result.searchParams.get('w'),'480');assert.equal(result.searchParams.get('q'),'65');assert.equal(result.searchParams.get('fm'),'webp');assert.equal(result.searchParams.get('fit'),'max');assert.equal(result.searchParams.get('h'),'480');assert.equal(result.searchParams.get('dpr'),'1');assert.equal(result.searchParams.has('auto'),false);
});
test('API serialization publishes variants without changing originals or recursively expanding logos',()=>{
 const source={image:'https://images.unsplash.com/photo-123?w=1200',logo:'https://res.cloudinary.com/test/image/upload/v1/logo.png',category:{image:'https://images.unsplash.com/photo-456'}};
 const json=JSON.stringify({data:[source]},imageDeliveryReplacer),result=JSON.parse(json).data[0];
 assert.equal(result.image,source.image);assert.equal(result.logo,source.logo);assert.ok(result.imageVariants.thumb);assert.ok(result.logoVariants.logo);assert.ok(result.category.imageVariants.card);assert.equal(source.imageVariants,undefined);assert.ok(json.length<5000);assert.equal(result.imageVariants.logoVariants,undefined);
});
test('real HTTP JSON compression is decodable and reduces catalog response bytes',async()=>{
 const app=express();app.set('json replacer',imageDeliveryReplacer);app.use(compression({threshold:1024,level:4}));
 const rows=Array.from({length:30},(_,i)=>({name:'Dish '+i,image:'https://images.unsplash.com/photo-'+i+'?w=1200',price:100}));app.get('/',(_req,res)=>res.json({data:rows}));
 const server=createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const result=await new Promise((resolve,reject)=>get({hostname:'127.0.0.1',port:server.address().port,path:'/',headers:{'Accept-Encoding':'gzip'}},r=>{const chunks=[];r.on('data',c=>chunks.push(c));r.on('end',()=>resolve({headers:r.headers,bytes:Buffer.concat(chunks)}));}).on('error',reject));
 assert.equal(result.headers['content-encoding'],'gzip');const raw=gunzipSync(result.bytes);assert.equal(JSON.parse(raw).data.length,30);assert.ok(result.bytes.length<raw.length/3);assert.match(result.headers.vary,/Accept-Encoding/);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
