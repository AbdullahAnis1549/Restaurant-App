import mongoose from 'mongoose';
const schema=new mongoose.Schema({
 user:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,unique:true},
 encryptedSecret:{type:String,select:false},pendingSecret:{type:String,select:false},pendingExpiresAt:Date,
 recoveryHashes:{type:[String],select:false,default:[]},lastStep:{type:Number,default:-1},
 windowExpiresAt:{type:Date,default:()=>new Date(0)},attempts:{type:Number,default:0}
},{timestamps:true});
export default mongoose.model('AccountSecurity',schema);
