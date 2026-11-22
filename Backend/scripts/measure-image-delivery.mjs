import dotenv from 'dotenv';dotenv.config({quiet:true});
import mongoose from 'mongoose';
import fs from 'node:fs';
import {gzipSync} from 'node:zlib';
import {imageUrlForSize,imageDeliveryReplacer} from '../src/utils/imageDelivery.js';
await mongoose.connect(process.env.MONGO_URI);
try {
 const dishes=await mongoose.connection.db.collection('dishes').find({},{projection:{name:1,image:1,price:1,description:1,category:1}}).limit(40).toArray();
 const raw=JSON.stringify({data:dishes}),optimized=JSON.stringify({data:dishes},imageDeliveryReplacer);
 const samples=[...dishes.filter(d=>String(d.image).includes('res.cloudinary.com')).slice(0,2),...dishes.filter(d=>String(d.image).includes('images.unsplash.com')).slice(0,1)];
 const results=[];
 for(const d of samples){const result={name:d.name};for(const size of ['original','card','thumb']){try{const url=size==='original'?d.image:imageUrlForSize(d.image,size);const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('HTTP '+r.status);const bytes=(await r.arrayBuffer()).byteLength;result[size]={bytes,type:r.headers.get('content-type')};}catch(e){result[size]={error:e.message};}}if(result.original?.bytes&&result.card?.bytes)result.cardSavingPercent=Math.round((1-result.card.bytes/result.original.bytes)*100);results.push(result);}
 const report={checkedAt:new Date().toISOString(),json:{originalBytes:Buffer.byteLength(raw),withVariantsBytes:Buffer.byteLength(optimized),compressedBytes:gzipSync(optimized,{level:4}).length},samples:results,noDatabaseChanges:true};
 fs.writeFileSync('IMAGE_PERFORMANCE_RESULTS.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await mongoose.disconnect();}
