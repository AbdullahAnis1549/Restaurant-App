import { normalizeCheckout, priceCheckout, checkoutHash, invalid } from '../services/orderPricing.js';
import Order from '../models/Order.js';
import Dish from '../models/Dish.js';
import Setting from '../models/Setting.js';
import Notification from '../models/Notification.js';
import { evaluatePromo } from './promoController.js';
import {
  sendOrderConfirmationEmail,
  sendOrderDeliveredEmail,
  sendOrderCancelledEmail,
} from '../utils/nodemailer.js';

const markOrderPaid = (order) => {
  order.isPaid = true;
  order.paymentStatus = 'Paid';
  if (!order.paidAt) order.paidAt = new Date();
};

const markOrderUnpaid = (order) => {
  order.isPaid = false;
  order.paymentStatus = 'Pending';
  order.paidAt = undefined;
};

// @route   POST /api/orders/apply-promo
// @access  Public or Authenticated
export const applyPromo = async (req, res) => {
  try {
    const { promoCode, subtotal } = req.body;
    if (!promoCode) {
      return res.status(400).json({ success: false, message: 'Please enter a promo code' });
    }

    const result = await evaluatePromo(promoCode, Number(subtotal || 0), req.user?._id);
    if (result.valid || result.discount > 0 || result.freeDelivery) {
      return res.status(200).json({
        success: true,
        valid: true,
        discount: result.discount,
        freeDelivery: Boolean(result.freeDelivery),
        message: result.message,
      });
    }

    return res.status(400).json({
      success: false,
      valid: false,
      message: result.message || 'Invalid or expired promo code',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export function createOrderHandlers(pricer = priceCheckout, notify = notifyNewOrder) {
 const existingResponse = (res, order, hash) => {
  if (order.checkoutPayloadHash !== hash) return res.status(409).json({ message: 'This checkout reference was used with different details. Start a new checkout.' });
  return res.status(200).json({ success: true, data: order, replayed: true });
 };
 return {
  quote: async (req, res) => {
   try { const input = normalizeCheckout(req.body, req.user, false); return res.json({ data: await pricer(input, req.user._id) }); }
   catch (error) { return res.status(error.status || 500).json({ message: error.status ? error.message : 'Could not calculate the order total.' }); }
  },
  create: async (req, res) => {
   let input, hash, requestId;
   try {
    requestId = req.body.requestId;
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(requestId)) throw invalid('Valid checkout request ID required. Refresh the app.');
    input = normalizeCheckout(req.body, req.user); hash = checkoutHash(input);
    const existing = await Order.findOne({ user: req.user._id, checkoutRequestId: requestId });
    if (existing) return existingResponse(res, existing, hash);
    const quote = await pricer(input, req.user._id);
    if (typeof req.body.expectedTotal !== 'number' || Math.round(req.body.expectedTotal * 100) !== Math.round(quote.grandTotal * 100)) return res.status(409).json({ message: 'The total changed. Review the updated quote before placing the order.', data: quote });
    const card = input.paymentMethod === 'Stripe / Card', free = quote.grandTotal === 0, now = new Date();
    const order = await Order.create({ user: req.user._id, checkoutRequestId: requestId, checkoutPayloadHash: hash, customerName: input.customerName, customerEmail: input.customerEmail, customerPhone: input.customerPhone, deliveryAddress: input.orderType === 'Pickup' ? quote.pickupAddress : input.deliveryAddress, orderType: input.orderType, paymentMethod: input.paymentMethod, notes: input.notes, items: quote.items, subtotal: quote.subtotal, deliveryFee: quote.deliveryFee, discount: quote.discount, grandTotal: quote.grandTotal, promoCode: quote.promoCode, isPaid: free, paymentStatus: free ? 'Paid' : 'Pending', ...(free ? { paidAt: now, paymentResult: { status: 'no_payment_required' } } : {}), status: card && !free ? 'Placed' : 'Confirmed', estimatedTime: input.orderType === 'Pickup' ? '15-20 min' : '30-60 min', timeline: [{ status: card && !free ? 'Placed' : 'Confirmed', timestamp: now, description: free ? 'No payment required for this order.' : card ? 'Awaiting verified card payment.' : 'Order confirmed.', completed: true }, { status: 'Delivered', description: input.orderType === 'Pickup' ? 'Collected at the restaurant.' : 'Delivered to your address.', completed: false }] });
    if (!card || free) notify(order);
    return res.status(201).json({ success: true, data: order });
   } catch (error) {
    if (error.code === 11000 && requestId && hash) { const existing = await Order.findOne({ user: req.user._id, checkoutRequestId: requestId }); if (existing) return existingResponse(res, existing, hash); }
    return res.status(error.status || 500).json({ message: error.status ? error.message : 'Could not place your order. Your checkout reference is saved; retry safely.' });
   }
  },
 };
}
function notifyNewOrder(order) {
 void Notification.create({ title: 'New order placed', message: 'Order #' + String(order._id).slice(-6).toUpperCase() + ' received.', type: 'order', recipientRole: 'admin', order: order._id }).catch(error => console.error('[Order notification]', error.message));
 void sendOrderConfirmationEmail(order).catch(error => console.error('[Order email]', error.message));
}
export const { create: createOrder, quote: quoteOrder } = createOrderHandlers();

// @route   GET /api/orders/my-orders
// @access  Private (authVerify required)
export const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      user: req.user._id,
    })
      .populate('items.dish', 'name price image prepTime')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: orders.length,
      data: orders,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route   GET /api/orders/:id
// @access  Private (authVerify required)
export const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('items.dish', 'name price image prepTime');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (
      req.user.role !== 'admin' &&
      String(order.user) !== String(req.user._id)
    ) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this order.' });
    }

    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route   GET /api/orders
// @access  Private / Admin Only (authVerify, adminProtected)
export const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: orders.length,
      data: orders,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route   PUT /api/orders/:id/status
// @access  Private / Admin Only (authVerify, adminProtected)
export const updateOrderStatus = async (req, res) => {
  try {
    const { status, cancellationReason, isPaid, paymentStatus } = req.body;
    const validStatuses = [
      'Confirmed',
      'Delivered',
      'Cancelled',
      'Rejected',
      // Legacy backward-compatibility (mapped below)
      'Placed',
      'Preparing',
      'Ready for Delivery',
      'Ready for Pickup',
      'Out for Delivery',
    ];

    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status: ${status}` });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const previousStatus = order.status;
    if (['Delivered', 'Cancelled', 'Rejected'].includes(previousStatus) && status && status !== previousStatus) return res.status(409).json({ message: 'Closed orders cannot be reopened. Create a new order or handle a refund separately.' });
    const wasAlreadyDelivered = previousStatus === 'Delivered';
    let nextStatus = status;

    if (nextStatus === 'Placed' || nextStatus === 'Preparing' || nextStatus === 'Ready for Delivery' || nextStatus === 'Ready for Pickup' || nextStatus === 'Out for Delivery') {
      nextStatus = 'Confirmed';
    }

    if (nextStatus) {
      order.status = nextStatus;
    }

    if (cancellationReason) order.cancellationReason = cancellationReason.trim();

    const wantsPaid =
      paymentStatus === 'Paid' || isPaid === true || isPaid === 'true';
    const wantsPending =
      paymentStatus === 'Pending' || isPaid === false || isPaid === 'false';

    if (wantsPaid && order.paymentMethod !== 'Cash on Delivery') return res.status(400).json({ message: 'Card payment must be verified by the payment provider.' });
    if (nextStatus && ['Confirmed', 'Delivered'].includes(nextStatus) && order.paymentMethod === 'Stripe / Card' && !order.isPaid) return res.status(400).json({ message: 'Verify card payment before confirming or delivering this order.' });
    if (wantsPaid) {
      markOrderPaid(order);
    } else if (wantsPending && order.paymentMethod === 'Cash on Delivery' && order.status !== 'Delivered') {
      markOrderUnpaid(order);
    }

    if (nextStatus === 'Delivered') {
      order.deliveredAt = order.deliveredAt || new Date();
    }

    if (nextStatus && Array.isArray(order.timeline)) {
      order.timeline.forEach((event) => {
        if (event.status.toLowerCase() === nextStatus.toLowerCase() || (nextStatus === 'Confirmed' && event.status === 'Placed')) {
          event.completed = true;
          event.timestamp = new Date();
        }
      });
      if (nextStatus === 'Delivered') {
        order.timeline.forEach((event) => {
          event.completed = true;
        });
      }
    }

    const shouldSendDeliveryEmail =
      nextStatus === 'Delivered' && !wasAlreadyDelivered && !order.deliveryEmailSent;

    if (shouldSendDeliveryEmail) {
      order.deliveryEmailSent = true;
    }

    const updated = await order.save();

    if (nextStatus && order.user) {
      Notification.create({
        title: nextStatus === 'Delivered' ? 'Order Delivered! 🎉' : `Order Update: ${nextStatus}`,
        message:
          nextStatus === 'Delivered'
            ? `Your order #${order._id.toString().slice(-6).toUpperCase()} has been delivered! Thanks for ordering with Zaykora Royal Palace.`
            : `Your order #${order._id.toString().slice(-6).toUpperCase()} is now ${nextStatus}.`,
        type: 'order',
        recipientRole: 'user',
        user: order.user,
        order: order._id,
      }).catch((err) => console.error('[Customer Notification Error]:', err.message));
    }

    if (shouldSendDeliveryEmail) {
      sendOrderDeliveredEmail(updated).catch((err) =>
        console.error('[Delivered Email Error]:', err.message)
      );
    } else if ((nextStatus === 'Cancelled' || nextStatus === 'Rejected') && previousStatus !== nextStatus) {
      sendOrderCancelledEmail(updated).catch((err) =>
        console.error('[Cancelled Email Error]:', err.message)
      );
    }

    res.status(200).json({
      success: true,
      message: `Order marked as ${nextStatus || 'updated'} successfully`,
      data: updated,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route   GET /api/orders/analytics/reports
// @access  Private / Admin Only (Date-Filtered Reports & KPIs)
export const getOrderReports = async (req, res) => {
  try {
    const { range = 'today' } = req.query;
    let startDate = new Date();

    if (range === 'today') {
      // Rolling 24 hours window for 'today' so timezone differences don't hide fresh orders
      startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    } else if (range === 'week') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (range === 'month') {
      startDate.setDate(startDate.getDate() - 30);
    } else {
      startDate = new Date(0); // All time
    }

    const matchQuery = { createdAt: { $gte: startDate } };
    const orders = await Order.find(matchQuery).sort({ createdAt: -1 });

    const totalOrders = orders.length;
    let totalRevenue = 0;
    let paidOrdersCount = 0;
    let pendingOrders = 0;
    let completedOrders = 0;
    let cancelledOrders = 0;
    let codRevenue = 0;
    let cardRevenue = 0;
    let codOrdersCount = 0;
    let cardOrdersCount = 0;

    const dishCounts = new Map();

    orders.forEach((ord) => {
      const isCardPaid = ord.paymentMethod !== 'Cash on Delivery' && (ord.isPaid || ord.paymentStatus === 'Paid') && !['Cancelled', 'Rejected'].includes(ord.status);
      const isCodDelivered = ord.paymentMethod === 'Cash on Delivery' && (ord.isPaid || ord.paymentStatus === 'Paid') && !['Cancelled', 'Rejected'].includes(ord.status);

      if (ord.status === 'Delivered') {
        completedOrders++;
      } else if (ord.status === 'Cancelled' || ord.status === 'Rejected') {
        cancelledOrders++;
      } else {
        pendingOrders++;
      }

      // Total revenue includes delivered orders OR any paid card orders that are not cancelled
      if (isCardPaid || isCodDelivered) {
        if (ord.status !== 'Cancelled' && ord.status !== 'Rejected') {
          totalRevenue += ord.grandTotal || 0;
          paidOrdersCount++;
        }
      }

      if (ord.paymentMethod === 'Cash on Delivery') {
        codOrdersCount++;
        if (isCodDelivered) {
          codRevenue += ord.grandTotal || 0;
        }
      } else {
        cardOrdersCount++;
        if (isCardPaid) {
          cardRevenue += ord.grandTotal || 0;
        }
      }

      // Aggregate popular dishes
      if ((isCardPaid || isCodDelivered) && Array.isArray(ord.items)) {
        ord.items.forEach((item) => {
          const name = item.name || 'Dish';
          const existing = dishCounts.get(name) || { name, quantity: 0, revenue: 0 };
          existing.quantity += item.quantity || 1;
          existing.revenue += (item.price || 0) * (item.quantity || 1);
          dishCounts.set(name, existing);
        });
      }
    });

    const popularDishes = Array.from(dishCounts.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    const averageOrderValue = paidOrdersCount > 0 ? Math.round(totalRevenue / paidOrdersCount) : 0;

    res.status(200).json({
      success: true,
      range,
      startDate,
      metrics: {
        totalOrders,
        totalRevenue,
        pendingOrders,
        completedOrders,
        cancelledOrders,
        averageOrderValue,
        codRevenue,
        cardRevenue,
        codOrdersCount,
        cardOrdersCount,
      },
      popularDishes,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
