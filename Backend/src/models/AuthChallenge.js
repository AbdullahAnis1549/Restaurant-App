import mongoose from 'mongoose';
const schema=new mongoose.Schema({_id:String,user:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},purpose:{type:String,enum:['mfa','email'],required:true},sessionVersion:{type:Number,required:true},email:String,codeHash:{type:String,select:false},attempts:{type:Number,default:0},expiresAt:{type:Date,required:true},resendAt:Date,usedAt:{type:Date,default:null}},{versionKey:false});
schema.index({expiresAt:1},{expireAfterSeconds:0});
export default mongoose.model('AuthChallenge',schema);
