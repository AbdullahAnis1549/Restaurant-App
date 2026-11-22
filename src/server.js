import { assertApplicationDatabaseRole } from './utils/databasePrivileges.js';
import mongoose from 'mongoose';
import AccountSecurity from './models/AccountSecurity.js';
import AuthChallenge from './models/AuthChallenge.js';
import { productionIssues } from './utils/productionConfig.js';
import RevokedSession from './models/RevokedSession.js';
import { jwtSecret } from './utils/authSession.js';
import Order from './models/Order.js';
import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import { createServer } from 'node:http';
import { initializeSockets } from './socket.js';
import connectDB from './config/db.js';
import { startCampaignWorker } from './services/notificationCampaigns.js';

const PORT = process.env.PORT;

const startServer = async () => {
  const issues=productionIssues(process.env); if (process.env.NODE_ENV === 'production' && issues.length) throw new Error('Production configuration is incomplete: '+issues.map(issue=>issue.key).join(', '));
  jwtSecret(); // Fail closed before opening the server if JWT configuration is missing.
  if (process.env.NODE_ENV === 'production' && !process.env.MONGO_URI) throw new Error('MONGO_URI is required in production.');
  // Connect to MongoDB
  await connectDB();
  if (process.env.NODE_ENV === 'production') await assertApplicationDatabaseRole(mongoose.connection.db);
  await Promise.all([Order.init(), RevokedSession.init(), AccountSecurity.init(), AuthChallenge.init()]);
  const stopCampaignWorker = await startCampaignWorker();

  const server = createServer(app);
  const io = initializeSockets(server);
  let stopping=false;
  const shutdown=()=>{if(stopping)return;stopping=true;stopCampaignWorker();const timeout=setTimeout(()=>process.exit(1),15000);timeout.unref();server.close(async()=>{await (await import('mongoose')).default.disconnect();clearTimeout(timeout);});io.close();};
  process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
  server.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`🚀 Zaykora Restaurant Server running on port ${PORT}`);
    console.log(`📡 Health Check: http://localhost:${PORT}/api/health`);
    console.log(`🍔 Dishes API:  http://localhost:${PORT}/api/dishes`);
    console.log(`📂 Categories:  http://localhost:${PORT}/api/categories`);
    console.log(`🛍️ Orders API:  http://localhost:${PORT}/api/orders`);
    console.log(`===============================================`);
  });
};

startServer().catch(async error=>{await mongoose.disconnect().catch(()=>{});console.error('[Startup failed]',error.code || error.name, error.message.startsWith('Production configuration') ? error.message : 'Check server configuration.');process.exitCode=1;});
