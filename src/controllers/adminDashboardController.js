import { getAllOrders, getOrderReports } from './orderController.js';
import { getAllDishes } from './dishController.js';
import { getAdminCategories } from './categoryController.js';
import { getAllPromos } from './promoController.js';
import { getAllUsers } from './authController.js';
import { getNotifications } from './notificationController.js';
import { getAllContacts } from './contactController.js';
import { getAllBanners } from './bannerController.js';
import { getSettings } from './settingController.js';
const readers = { orders: getAllOrders, dishes: getAllDishes, categories: getAdminCategories, promos: getAllPromos, customers: getAllUsers, notifications: getNotifications, inquiries: getAllContacts, banners: getAllBanners, settings: getSettings, reports: getOrderReports };
export function createAdminDashboardController(handlers = readers) {
 return async (req, res) => {
  const range = ['today', 'week', 'month', 'all'].includes(req.query.range) ? req.query.range : 'today';
  const results = await Promise.all(Object.entries(handlers).map(async ([key, reader]) => {
   const capture = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
   try { await reader({ ...req, query: { range } }, capture); return { key, status: capture.statusCode, body: capture.statusCode >= 500 ? { message: 'Could not load this section.' } : capture.body }; }
   catch { return { key, status: 500, body: { message: 'Could not load this section.' } }; }
  }));
  return res.json({ results });
 };
}
export const getAdminDashboard = createAdminDashboardController();
