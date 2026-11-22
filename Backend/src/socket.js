import { corsOrigin, isAllowedOrigin } from './utils/originPolicy.js';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import { authVerify, authenticateToken } from './middlewares/authVerify.js';
import ChatMessage from './models/ChatMessage.js';
import User from './models/User.js';
const chatError = message => Object.assign(new Error(message), { status: 400, expose: true });
const presentMessage = message => ({ _id: message._id, customer: message.customer, sender: message.sender, text: message.text, createdAt: message.createdAt, readAt: message.readAt });
let activeIo;
export function disconnectSessionSockets(sessionHash) { activeIo?.in('session-token:' + sessionHash).disconnectSockets(true); }
export function disconnectUserSockets(userId) { activeIo?.in('session-user:' + String(userId)).disconnectSockets(true); }
export function initializeSockets(server) {
 const io = new Server(server, { cors: { origin: corsOrigin }, allowRequest: (req, callback) => callback(null, isAllowedOrigin(req.headers.origin)), maxHttpBufferSize: 20000 });
 activeIo = io;
 io.use(async (socket, next) => {
  const req = { headers: { authorization: 'Bearer ' + (socket.handshake.auth?.token || '') } };
  const res = { status() { return this; }, json() { next(new Error('Please sign in again.')); } };
  await authVerify(req, res, () => { if (req.user.isBlocked) return next(new Error('Account blocked.')); socket.data.user = req.user; socket.data.sessionHash = req.sessionHash; next(); });
 });
 io.on('connection', socket => {
  const user = socket.data.user, admin = user.role === 'admin';
  socket.join('session-user:' + user.id); socket.join('session-token:' + socket.data.sessionHash);
  socket.join(admin ? 'admins' : 'customer:' + user.id);
  const customerId = value => { const id = admin ? value : user.id; if (!mongoose.isValidObjectId(id)) throw chatError('Select a customer.'); return id; };
  let eventWindow = Date.now(), eventCount = 0;
  const handle = (name, fn) => socket.on(name, async (data, ack) => { if (typeof ack !== 'function') return; try { if (Date.now() - eventWindow > 10000) { eventWindow = Date.now(); eventCount = 0; } if (++eventCount > 60) throw chatError('Too many chat requests. Please wait a moment.'); const fresh = await authenticateToken(socket.handshake.auth?.token || ''); if (fresh.user.role !== user.role) throw Object.assign(new Error('Session changed. Reconnect to chat.'), { status: 401 }); ack({ ok: true, ...await fn(data || {}) }); } catch (error) { ack({ ok: false, error: error.expose || [401, 403].includes(error.status) ? error.message : 'Chat request failed. Please try again.' }); if (error.status === 401 || error.status === 403) socket.disconnect(true); } });
  handle('chat:list', async () => {
   if (!admin) throw chatError('Admin access required.');
   const chats = await ChatMessage.aggregate([
    { $sort: { _id: -1 } },
    { $group: { _id: '$customer', lastText: { $first: '$text' }, updatedAt: { $first: '$createdAt' }, unread: { $sum: { $cond: [{ $and: [{ $eq: ['$sender', 'user'] }, { $eq: ['$readAt', null] }] }, 1, 0] } } } },
    { $sort: { updatedAt: -1 } }, { $limit: 200 },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'customer' } },
    { $project: { lastText: 1, updatedAt: 1, unread: 1, name: { $arrayElemAt: ['$customer.name', 0] } } }
   ]); return { chats };
  });
  handle('chat:history', async data => {
   const id = customerId(data.customerId), query = { customer: id };
   if (data.before) { if (!mongoose.isValidObjectId(data.before)) throw chatError('Invalid cursor.'); query._id = { $lt: new mongoose.Types.ObjectId(data.before) }; }
   const messages = await ChatMessage.find(query).sort({ _id: -1 }).limit(60).lean(); return { messages: messages.reverse().map(presentMessage) };
  });
  let lastSent = 0;
  handle('chat:send', async data => {
   const id = customerId(data.customerId), text = typeof data.text === 'string' ? data.text.trim() : '';
   if (!text || text.length > 4000) throw chatError('Write a message of up to 4000 characters.');
   if (Date.now() - lastSent < 500) throw chatError('Please wait a moment before sending.'); lastSent = Date.now();
   if (admin && !await User.exists({ _id: id, role: 'user', isBlocked: { $ne: true } })) throw chatError('Customer unavailable.');
   const message = await ChatMessage.create({ customer: id, sender: admin ? 'admin' : 'user', text });
   io.to('admins').to('customer:' + id).emit('chat:message', presentMessage(message)); return { message: presentMessage(message) };
  });
  handle('chat:read', async data => {
   const id = customerId(data.customerId); if (!mongoose.isValidObjectId(data.through)) throw chatError('Invalid read cursor.');
   const readAt = new Date(), sender = admin ? 'user' : 'admin';
   await ChatMessage.updateMany({ customer: id, sender, readAt: null, _id: { $lte: new mongoose.Types.ObjectId(data.through) } }, { $set: { readAt } });
   io.to('admins').to('customer:' + id).emit('chat:read', { customerId: id, sender, through: data.through, readAt }); return {};
  });
 }); return io;
}
