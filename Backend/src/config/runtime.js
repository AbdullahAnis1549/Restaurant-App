import mongoose from 'mongoose';
import connectDB from './db.js';
import { productionIssues } from '../utils/productionConfig.js';
import { jwtSecret } from '../utils/authSession.js';
import { assertApplicationDatabaseRole } from '../utils/databasePrivileges.js';
import Order from '../models/Order.js';
import RevokedSession from '../models/RevokedSession.js';
import AccountSecurity from '../models/AccountSecurity.js';
import AuthChallenge from '../models/AuthChallenge.js';

// Share cold-start initialization; a failed attempt must be retryable.
export function createRuntimeInitializer(initialize) {
  let pending;
  return () => {
    if (!pending) pending = Promise.resolve().then(initialize).catch(error => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
}

export const initializeRuntime = createRuntimeInitializer(async () => {
  const issues = productionIssues(process.env);
  if (process.env.NODE_ENV === 'production' && issues.length) {
    console.error('[Runtime configuration]', issues.map(issue => issue.key).join(', '));
    throw new Error('Server configuration is incomplete.');
  }
  jwtSecret();
  await connectDB();
  if (process.env.NODE_ENV === 'production') await assertApplicationDatabaseRole(mongoose.connection.db);
  await Promise.all([Order.init(), RevokedSession.init(), AccountSecurity.init(), AuthChallenge.init()]);
});
