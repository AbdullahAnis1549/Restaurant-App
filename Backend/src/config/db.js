import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/restaurant_db', { serverSelectionTimeoutMS: 8000, maxPoolSize: 10 });
    console.log('[MongoDB] Connected.');
  } catch (error) {
    console.error('[MongoDB] Connection failed:', error.code || error.name);
    throw error;
  }
};

export default connectDB;
