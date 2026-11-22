import { DEFAULT_DELIVERY_POLICY } from '../utils/deliveryPolicy.js';
import mongoose from 'mongoose';

const settingSchema = new mongoose.Schema(
  {
    restaurantName: {
      type: String,
      default: 'Zaykora Royal Palace',
    },
    tagline: {type:String,trim:true,maxlength:160,default:'Good food, great mood'},
    whatsappNumber: {type:String,trim:true,default:''},
    maxOrderAmount: {type:Number,min:0,default:null},
    deliverySlabs: {type:[new mongoose.Schema({minAmount:{type:Number,required:true,min:0},maxAmount:{type:Number,default:null,min:0},fee:{type:Number,required:true,min:0}},{_id:false})],default:[]},
    logo: {
      type: String,
      default: '',
    },
    logoCloudinaryPublicId: {
      type: String,
      default: '',
    },
    isAcceptingOrders: {
      type: Boolean,
      default: true,
    },
    contactPhone: {
      type: String,
      default: '',
    },
    contactEmail: {
      type: String,
      default: 'contact@zaykora.com',
    },
    address: {
      type: String,
      default: 'Zaykora Royal Palace, Gulberg III, Lahore, Pakistan',
    },
    openingHours: {
      type: String,
      default: '12:00 PM - 02:00 AM',
    },
    freeDeliveryThreshold: { type: Number, min: 0, default: DEFAULT_DELIVERY_POLICY.freeDeliveryThreshold },
    deliveryFee: {
      type: Number,
      default: DEFAULT_DELIVERY_POLICY.deliveryFee,
      min: 0,
    },
    minOrderAmount: {
      type: Number,
      default: DEFAULT_DELIVERY_POLICY.minOrderAmount,
      min: 0,
    },
  },
  { timestamps: true }
);

export default mongoose.model('Setting', settingSchema);
