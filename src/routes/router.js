const express = require('express');
const router = express.Router();
const { protect, adminProtect } = require('../middleware/auth');
const Accompaniment = require('../models/Accompaniment');
const Cart = require('../models/Cart');
const CartItem = require('../models/CartItem');
const DeliveryAddress = require('../models/DeliveryAddress');
const Meal = require('../models/Meal');
const Menu = require('../models/Menu');
const Order = require('../models/Order');
const Plan = require('../models/Plan');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const { supabaseAnon, supabaseServiceRole } = require('../config/supabase');
const Joi = require("joi");
// const { v4: uuidv4 } = require("uuid"); // Import UUID for generating unique refund IDs
// ✅ YOUR CASHFREE UTILS
const {
  createCashfreeOrder,
  getCashfreeOrderDetails,
  initiateCashfreeRefund,
  getCashfreeRefundDetails,
  getAllCashfreeRefundsForOrder,  // ✅ ADD THIS LINE
  updateCashfreeRefund,
} = require('../utils/cashfree');  // Adjust path based on your folder structure

// Refund calculation function
async function calculateRefundForOrder(orderId) {
  const CONSUMED_STATUSES = ['delivered', 'readyForDelivery'];
  const order = await Order.findById(orderId)
    .populate({
      path: 'items.menu',
      model: 'Menu',
      select: 'price name vendor'
    })
    .lean();

  if (!order) {
    return {
      success: false,
      message: 'Order not found'
    };  
  }

  if (order.status !== 'cancelled') {
    return {
      success: false,
      message: 'Refund is allowed only for cancelled orders'
    };
  }
  // Calculate total already refunded (excluding cancelled refunds)
  // ✅ Calculate total already refunded (excluding CANCELLED refunds)
  let totalAlreadyRefunded = 0;
  let activePendingRefunds = 0;
  
  if (order.refunds && order.refunds.length > 0) {
    order.refunds.forEach(refund => {
      // Don't count CANCELLED refunds
      if (refund.status !== 'CANCELLED') {
        totalAlreadyRefunded += refund.amount;
        
        // Count pending refunds separately for info message
        if (['PENDING', 'ONHOLD'].includes(refund.status)) {
          activePendingRefunds += refund.amount;
        }
      }
    });
  }
 console.log('Total already refunded (excluding CANCELLED):', totalAlreadyRefunded);
  // Check if order is fully refunded
  if (totalAlreadyRefunded >= order.totalAmount) {
    return {
      success: false,
      message: `Order is fully refunded. Total refunded: ₹${totalAlreadyRefunded.toFixed(2)} out of ₹${order.totalAmount.toFixed(2)}. No further refunds allowed.`
    };
  }
  if (!order.items || order.items.length === 0) {
    const remainingAmount = order.totalAmount - totalAlreadyRefunded;
    if (remainingAmount === 0) {
      return {
        success: false,
        message: `You have already refunded the full amount. Total refunded: ₹${totalAlreadyRefunded.toFixed(2)}`
      };
    }
    return {
      success: true,
      order,
      consumedAmount: 0,
      suggestedRefundAmount: remainingAmount,
      consumedMealsCount: 0,
      totalAlreadyRefunded,
      remainingRefundableAmount: remainingAmount,
    };
  }

  let consumedAmount = 0;
  let consumedMealsCount = 0;

  for (const item of order.items) {
    const menu = item.menu;
    if (!menu || !menu.price) continue;

    const quantity = item.quantity || 1;

    if (!item.orderStatus || item.orderStatus.length === 0) continue;

    for (const st of item.orderStatus) {
      if (!CONSUMED_STATUSES.includes(st.status)) continue;

      const mt = st.mealTime;
      const mealPrice = menu.price?.[mt] || 0; // breakfast, lunch, dinner

      if (mealPrice > 0) {
        consumedAmount += mealPrice * quantity;
        consumedMealsCount += quantity;
      }
    }
  }      

  let suggestedRefundAmount = order.totalAmount - consumedAmount - totalAlreadyRefunded;
  if (suggestedRefundAmount < 0) suggestedRefundAmount = 0;
  if (suggestedRefundAmount === 0) {
    return {
      success: false,
      message: `You have already refunded the full eligible amount. Total refunded: ₹${totalAlreadyRefunded.toFixed(2)}`
    };
  }
  if (consumedMealsCount === 0) {
    suggestedRefundAmount = order.totalAmount - totalAlreadyRefunded;
  }
console.log('Calculated consumed amount:', consumedAmount);
console.log('Calculated suggested refund amount:', suggestedRefundAmount);
  return {
    success: true,
    order,
    consumedAmount,
    suggestedRefundAmount,
    consumedMealsCount,
    totalAlreadyRefunded,
  };
}

// Helper to get vendor filter
async function getVendorFilter(req, baseFilter = {}) {
  if (req.user.role === 'admin') return baseFilter;

  if (req.user.role === 'vendor') {
    const vendor = await Vendor.findOne({ userId: req.user._id });
    if (!vendor) return { ...baseFilter, _id: null }; // no results
    return { ...baseFilter, vendor: vendor._id }; // Adjust field name as needed
  }

  // Deny access for others
  throw new Error('FORBIDDEN');
}

// Middleware to allow only admin or vendor roles
function allowAdminOrVendor(req, res, next) {
  if (!req.user || !['admin', 'vendor'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied' });
  }
  next();
}

// Admin Creation (no role check here)
router.post('/register', protect, async (req, res) => {
  const { name, email, password } = req.body;

  try {
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'User with this email already exists.' });
    }

    const { data: supabaseAuthData, error: supabaseAuthError } = await supabaseServiceRole.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (supabaseAuthError) {
      console.error('Supabase admin user creation error:', supabaseAuthError);
      return res.status(400).json({ message: supabaseAuthError.message });
    }

    user = new User({
      name,
      email,
      supabaseId: supabaseAuthData.user.id,
      role: 'admin',
    });
    await user.save();

    const { data: signInData, error: signInError } = await supabaseAnon.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      console.error('Supabase admin auto-login error:', signInError);
      return res.status(500).json({ message: 'Admin registered but failed to auto-login.' });
    }

    res.status(201).json({
      message: 'Admin registered successfully',
      accessToken: signInData.session.access_token,
      role: user.role,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// Vendor Creation (no role check here)
router.post('/vendor/new', protect , async (req, res) => {
  const { name, companyName, email, password } = req.body;

  try {
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'User with this email already exists.' });
    }

    const { data: supabaseAuthData, error: supabaseAuthError } = await supabaseServiceRole.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (supabaseAuthError) {
      console.error('Supabase vendor user creation error:', supabaseAuthError);
      return res.status(400).json({ message: supabaseAuthError.message });
    }

    user = new User({
      name,
      email,
      supabaseId: supabaseAuthData.user.id,
      role: 'vendor',
    });
    await user.save();

    const newVendor = new Vendor({
      name,
      email,
      description: companyName,
      userId: [user._id],
    });
    await newVendor.save();

    const { data: signInData, error: signInError } = await supabaseAnon.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      console.error('Supabase vendor auto-login error:', signInError);
      return res.status(500).json({ message: 'Vendor registered but failed to auto-login.' });
    }

    res.status(201).json({
      message: 'Vendor registered successfully',
      accessToken: signInData.session.access_token,
      role: user.role,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json('Server error');
  }
});

// Protect and allow only admin or vendor for all routes below
router.use(protect, allowAdminOrVendor);
// Get all Accompaniments
router.get('/accompaniments', async (req, res) => {
  try {
    const filter = await getVendorFilter(req);
    const accompaniments = await Accompaniment.find(filter);
    res.json(accompaniments);
  } catch (err) {
    if (err.message === 'FORBIDDEN') return res.status(403).json({ message: 'Access denied' });
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Get all Carts
router.get('/carts', async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === 'vendor') {
      const vendor = await Vendor.findOne({ userId: req.user._id });
      if (!vendor) return res.json([]);
      filter = { vendor: vendor._id }; // Adjust field if needed
    }

    const carts = await Cart.find(filter)
      .populate({
        path: 'items',
        populate: [
          {
            path: 'menu',
            model: 'Menu',
            populate: {
              path: 'vendor',
              model: 'Vendor',
              select: 'name title'
            }
          },
          {
            path: 'accompaniments',
            model: 'Accompaniment',
            select: 'name price'
          },
          {
            path: 'user',
            model: 'User',
            select: 'name email'
          }
        ]
      });

    res.json(carts);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Get all CartItems
router.get('/cartitems', async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === 'vendor') {
      const vendor = await Vendor.findOne({ userId: req.user._id });
      if (!vendor) return res.json([]);
      filter = { vendor: vendor._id }; // Adjust field if needed
    }

    const cartItems = await CartItem.find(filter)
      .populate({
        path: 'menu',
        model: 'Menu',
        populate: {
          path: 'vendor',
          model: 'Vendor',
          select: 'name title'
        }
      });

    res.json(cartItems);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Get all DeliveryAddresses (admin only)
router.get('/deliveryaddresses', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  try {
    const deliveryAddresses = await DeliveryAddress.find()
      .populate('userId', 'name email');
    res.json(deliveryAddresses);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Get all Meals
router.get('/meals', async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === 'vendor') {
      const vendor = await Vendor.findOne({ userId: req.user._id });
      if (!vendor) return res.json([]);
      filter = { vendorId: vendor._id };
    }
    const meals = await Meal.find(filter)
      .populate('vendorId', 'name email');
    res.json(meals);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Get all Menus
router.get('/menus', async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === 'vendor') {
      const vendor = await Vendor.findOne({ userId: req.user._id });
      if (!vendor) return res.json([]);
      filter = { vendor: vendor._id };
    }

    const menus = await Menu.find(filter)
      .populate('vendor', 'name email')
      .populate({
        path: 'menuItems.meal',
        model: 'Meal',
        populate: {
          path: 'vendorId',
          select: 'name email'
        }
      });

    res.json(menus);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Get all Orders
router.get('/orders', async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === 'vendor') {
      const vendor = await Vendor.findOne({ userId: req.user._id });
      if (!vendor) return res.json([]);
      filter = { 'items.vendor': vendor._id };
    }

    const orders = await Order.find(filter)
      .populate('user', 'name email')
      .populate({
        path: 'items.vendor',
        model: 'Vendor',
        select: 'name email'
      })
      .populate({
        path: 'items.menu',
        model: 'Menu',
        select: 'name description'
      })
      .populate({
        path: 'items.plan',
        model: 'Plan',
        select: 'name description duration price'
      });

    res.json(orders);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Get single Order by ID
router.get('/orders/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email')
      .populate({
        path: 'items.vendor',
        model: 'Vendor',
        select: 'name email'
      })
      .populate({
        path: 'items.menu',
        model: 'Menu',
        select: 'name description'
      })
      .populate({
        path: 'items.plan',
        model: 'Plan',
        select: 'name description duration price'
      });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // if (req.user.role === 'vendor') {
    //   const vendor = await Vendor.findOne({ userId: req.user._id });
    //   if (!vendor) return res.status(403).json({ message: 'Access denied' });

    //   const hasAccess = order.items.some(
    //     (item) => String(item.vendor) === String(vendor._id)
    //   );

    //   if (!hasAccess) {
    //     return res.status(403).json({ message: 'Access denied' });
    //   }
    // }

    res.json(order);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(400).json({ message: 'Invalid Order ID' });
    }
    res.status(500).send('Server Error');
  }
});

// Get all Plans
router.get('/plans', async (req, res) => {
  try {
    // Adjust here if Plans should be vendor-scoped
    const plans = await Plan.find();
    res.json(plans);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Get all Users (admin only)
router.get('/users', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  try {
    const users = await User.find();
    res.json(users);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Get all Vendors (admin only)
router.get('/vendors', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  try {
    const vendors = await Vendor.find();
    res.json(vendors);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

router.post('/meals', async (req, res) => {
  try {
    // ✅ Verify token
    // const authHeader = req.headers.authorization;
    // if (!authHeader || !authHeader.startsWith('Bearer ')) {
    //   return res.status(401).json({ message: 'Authorization token required' });
    // }

    // const token = authHeader.split(' ')[1];
    // const { data: supabaseUser, error: supabaseError } = await supabaseAnon.auth.getUser(token);

    // if (supabaseError || !supabaseUser || !supabaseUser.user) {
    //   return res.status(401).json({ message: 'Invalid or expired token' });
    // }

    const { 
      name, 
      description, 
      dietPreference, 
      category, 
      subProducts = [], 
      nutritionalDetails, 
      price, 
      image, 
      vendorId 
    } = req.body;

    // ✅ Validate required fields per schema
    if (!name || !description || !dietPreference || !category || !nutritionalDetails || 
        nutritionalDetails.protein === undefined || nutritionalDetails.carbs === undefined || 
        nutritionalDetails.fats === undefined || nutritionalDetails.calories === undefined ||
        !price || !image || !vendorId) {
      return res.status(400).json({ 
        message: 'Missing required fields: name, description, dietPreference, category, nutritionalDetails (all fields), price, image, vendorId' 
      });
    }

    // ✅ Find vendor (User) - schema uses 'Vendor' ref but User model exists
    const vendor = await User.findById(vendorId);
    if (!vendor || vendor.supabaseId !== supabaseUser.user.id) {
      return res.status(401).json({ message: 'Vendor not found or unauthorized' });
    }

    // ✅ Create meal matching EXACT schema
    const meal = new Meal({
      name,
      description,
      dietPreference,
      category,
      subProducts: subProducts.filter(p => p && p.trim()), // Clean empty strings
      nutritionalDetails, // Already validated above
      price,
      image,
      vendorId, // Schema uses vendorId ref 'Vendor'
    });

    const savedMeal = await meal.save();

    res.status(201).json({
      _id: savedMeal._id,
      message: 'Meal created successfully',
    });

  } catch (err) {
    console.error('Meal creation error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/menus', async (req, res) => {
  try {
    // ✅ Verify token
    // const authHeader = req.headers.authorization;
    // if (!authHeader || !authHeader.startsWith('Bearer ')) {
    //   return res.status(401).json({ message: 'Authorization token required' });
    // }

    // const token = authHeader.split(' ')[1];
    // const { data: supabaseUser, error: supabaseError } = await supabaseAnon.auth.getUser(token);

    // if (supabaseError || !supabaseUser || !supabaseUser.user) {
    //   return res.status(401).json({ message: 'Invalid or expired token' });
    // }

    console.log("✅ MENU BODY FULL:", JSON.stringify(req.body, null, 2));
    const body = req.body;
    
    console.log('🔍 name:', body.name);
    console.log('🔍 perDayPrice:', body.perDayPrice);
    console.log('🔍 menuItems length:', body.menuItems?.length);
    console.log('🔍 vendor:', body.vendor);

    const name = body.name;
    const perDayPrice = body.perDayPrice || 0;
    const menuItems = body.menuItems || [];
    const vendor = body.vendor;

    console.log('🔢 FINAL perDayPrice:', perDayPrice);

    //  Schema validation - direct access
    if (!name || perDayPrice === undefined || perDayPrice === null || !menuItems || !vendor) {
      console.log('❌ Validation failed:', { name, perDayPrice, menuItems: !!menuItems, vendor });
      return res.status(400).json({ 
        message: 'Missing required fields: name, perDayPrice, menuItems, vendor',
        debug: { name, perDayPrice, hasMenuItems: !!menuItems, vendor }
      });
    }

    if (!Array.isArray(menuItems) || menuItems.length === 0) {
      return res.status(400).json({ message: 'menuItems must be a non-empty array' });
    }

    //  Validate each menu item
    for (const item of menuItems) {
      if (!item.day || !item.category || !item.meal) {
        return res.status(400).json({ 
          message: 'Each menu item must have day, category, and meal fields' 
        });
      }
    }

    //  Find vendor (use Vendor model since schema refs 'Vendor')
    const vendorDoc = await Vendor.findOne({ userId: vendor });
    if (!vendorDoc) {
      return res.status(401).json({ message: 'Vendor not found' });
    }

    //  Create menu
    const menu = new Menu({
      name,
      vendor: vendorDoc._id, // Use Vendor _id, not User _id
      description: body.description || '',
      perDayPrice, // Now correctly set to 250
      availableMealTimes: body.availableMealTimes || [],
      price: body.price || { breakfast: 0, lunch: 0, dinner: 0 },
      menuItems,
    });

    const savedMenu = await menu.save();

    console.log('✅ Menu created:', savedMenu._id);

    res.status(201).json({
      _id: savedMenu._id,
      message: 'Menu created successfully',
    });

  } catch (err) {
    console.error('Menu creation error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.patch('/orders/:id/status',protect, async (req, res) => {
  try {
    const { status } = req.body;
    const orderId = req.params.id;
    console.log('Update order status request:', { orderId, status, userRole: req.user.role });
    if (!status) {
      return res.status(400).json({ message: 'Status is required' });
    }

    // Allowed statuses by role
    const adminAllowed = [ 'readyForDelivery', 'delivered', 'cancelled'];
    const vendorAllowed = ['readyForDelivery'];

    const normalized = status.toString().trim();

    if (req.user.role === 'admin') {
      if (!adminAllowed.includes(normalized)) {
        return res.status(400).json({ message: 'Invalid status for admin' });
      }
    } else if (req.user.role === 'vendor') {
      if (!vendorAllowed.includes(normalized)) {
        return res.status(400).json({ message: 'Invalid status for vendor' });
      }
    } else {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Find order
    let filter = { _id: orderId };
    if (req.user.role === 'vendor') {
      // Ensure vendor only updates own orders
      const vendor = await Vendor.findOne({ userId: req.user._id });
      if (!vendor) {
        return res.status(403).json({ message: 'Access denied' });
      }
      filter['items.vendor'] = vendor._id;
    }

    const order = await Order.findOne(filter);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    order.status = normalized;
    await order.save();

    res.status(200).json({
      message: 'Status updated successfully',
      status: order.status,
      orderId: order._id,
    });
  } catch (err) {
    console.error('Update order status error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Add this route BEFORE the module.exports line
router.get('/analytics', protect, async (req, res) => {
  try {
    let vendorFilter = {};
    let vendorDoc = null;
    console.log('Analytics request by user:', req.user);
    if (req.user.role === 'vendor') {
      vendorDoc = await Vendor.findOne({ userId: req.user._id });
      if (!vendorDoc) {
        return res.status(403).json({ message: 'Vendor not found' });
      }
      vendorFilter = { 'items.vendor': vendorDoc._id };
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    // 1. Total Orders
    const totalOrdersCount = await Order.countDocuments(vendorFilter);

    // 2. Pending Orders
    const pendingOrdersCount = await Order.countDocuments({
      ...vendorFilter,
      status: 'pending'
    });

    // 3. Active Customers (unique users)
    const activeCustomerIds = await Order.distinct('user', vendorFilter);
    const activeCustomersCount = activeCustomerIds.length;

    // 4. Revenue Today (confirmed orders from today)
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const revenueTodayResult = await Order.aggregate([
      {
        $match: {
          ...vendorFilter,
          status: 'confirmed',
          createdAt: { $gte: startOfDay, $lte: endOfDay }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$amount' }
        }
      }
    ]);
    const revenueToday = revenueTodayResult[0]?.totalRevenue || 0;

    // 5. Recent Orders (last 5)
    const recentOrders = await Order.find(vendorFilter)
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('user', 'name email')
      .select('orderId user totalAmount status createdAt items')
      .lean();

    // 6. FIXED Popular Menus: Handle BOTH cases (with orders AND no orders)
    let popularMenus = [];

    // Try to get popular menus from orders first
    let popularMenuIdsAgg = [];
    try {
      popularMenuIdsAgg = await Order.aggregate([
        { $match: vendorFilter },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.menu',
            ordersCount: { $sum: 1 }
          }
        },
        { $sort: { ordersCount: -1 } },
        { $limit: 4 }
      ]);
    } catch (orderAggError) {
      console.log('No orders found for popular menus aggregation');
    }

    if (popularMenuIdsAgg.length > 0) {
      // CASE 1: Vendor has orders - show top 4 popular menus by order count
      const popularMenuIds = popularMenuIdsAgg.map(m => m._id);
      const popularMenusDocs = await Menu.find({ 
        _id: { $in: popularMenuIds } 
      })
        .select('name perDayPrice')
        .lean();

      popularMenus = popularMenusDocs.map(menu => {
        const menuOrders = popularMenuIdsAgg.find(m => 
          m._id.toString() === menu._id.toString()
        );
        
        return {
          name: menu.name || 'Unknown Menu',
          orders: menuOrders?.ordersCount || 0,
          revenue: (menu.perDayPrice || 0) * 7
        };
      });
    } else if (req.user.role === 'vendor' && vendorDoc) {
      // CASE 2: Vendor has no orders - show their 4 most recent menus
      console.log('No orders found, showing vendor\'s recent menus');
      const vendorMenus = await Menu.find({ 
        vendor: vendorDoc._id 
      })
        .sort({ createdAt: -1 }) // Most recent first
        .limit(4)
        .select('name perDayPrice')
        .lean();

      popularMenus = vendorMenus.map(menu => ({
        name: menu.name || 'Unknown Menu',
        orders: 0, // No orders yet
        revenue: (menu.perDayPrice || 0) * 7
      }));
    } else {
      // CASE 3: Admin with no orders or edge case - empty array
      popularMenus = [];
    }

    const responseData = {
      totalOrders: totalOrdersCount,
      pendingOrders: pendingOrdersCount,
      activeCustomers: activeCustomersCount,
      revenueToday,
      recentOrders: recentOrders.map(order => ({
        id: order.orderId || order._id,
        customer: order.user?.name || 'Unknown',
        items: order.items?.map(item => item.name || 'Item')?.join(', ') || 'Items',
        amount: order.totalAmount || 0,
        status: order.status,
        time: 'Recent'
      })),
      popularMenus
    };

    console.log("response data:", responseData);
    
    res.json(responseData);

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ message: 'Failed to fetch analytics data' });
  }
});

router.get('/orders/items/meal-schedule', protect, async (req, res) => {
  try {
    const { date } = req.query; // Optional: specific date, defaults to today
    console.log('Fetch meal schedule request:', { date, userRole: req.user.role });

    // Only vendors and admins can access
    if (!['vendor', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get target date string in YYYY-MM-DD format
    const targetDateString = date || new Date().toLocaleDateString('en-CA'); // en-CA gives YYYY-MM-DD format
    console.log('Target date string:', targetDateString);

    let vendorFilter = {};
    if (req.user.role === 'vendor') {
      const vendor = await Vendor.findOne({ userId: req.user._id });
      if (!vendor) {
        return res.status(403).json({ message: 'Vendor not found' });
      }
      vendorFilter = { 'items.vendor': vendor._id };
    }

    // Find all confirmed orders with payment completed
    // Check both paymentStatus field and paymentDetails.status field
    const orders = await Order.find({
      ...vendorFilter,
      status: { $in: ['confirmed', 'readyForDelivery', 'delivered'] },
      $or: [
        { paymentStatus: 'paid' },
        { 'paymentDetails.status': 'PAID' }
      ]
    }).populate({
      path: 'items.menu',
      select: 'name'
    }).populate({
      path: 'items.vendor',
      select: 'businessName'
    }).populate({
      path: 'user',
      select: 'name email phone breakfastDeliveryLocation lunchDeliveryLocation dinnerDeliveryLocation'
    });

    console.log('Found orders:', orders.length);

    // Helper function to convert Date to YYYY-MM-DD string
    const toDateString = (date) => {
      if (!date) return null;
      const d = new Date(date);
      return d.toISOString().split('T')[0];
    };

    // Helper function to capitalize first letter (for delivery address key)
    const capitalizeFirstLetter = (str) => {
      return str.charAt(0).toUpperCase() + str.slice(1);
    };

    // Helper function to get delivery address
    const getDeliveryAddress = (order, mealTimeLower) => {
      const mealTimeCapitalized = capitalizeFirstLetter(mealTimeLower);
      
      // Priority 1: Check order.deliveryAddresses object
      if (order.deliveryAddresses?.[mealTimeCapitalized]) {
        console.log('Using order.deliveryAddresses for', mealTimeCapitalized);
        return order.deliveryAddresses[mealTimeCapitalized];
      }
      
      // Priority 2: Check order.deliveryAddress (single address)
      if (order.deliveryAddress) {
        console.log('Using order.deliveryAddress for', mealTimeCapitalized);
        return order.deliveryAddress;
      }
      
      // Priority 3: Check user's meal-specific delivery locations
      const userDeliveryKey = `${mealTimeLower}DeliveryLocation`;
      if (order.user?.[userDeliveryKey]) {
        console.log('Using user delivery location for', mealTimeLower, ':', order.user[userDeliveryKey]);
        return order.user[userDeliveryKey];
      }
      
      // Priority 4: Return empty object
      console.log('No delivery address found for', mealTimeLower);
      return {};
    };

    // Filter and group order items
    const mealSchedule = {
      breakfast: [],
      lunch: [],
      dinner: []
    };

    orders.forEach(order => {
      order.items.forEach(item => {
        const startDateString = toDateString(item.startDate);
        const endDateString = toDateString(item.endDate);

        console.log('Processing item - Start:', startDateString, 'End:', endDateString, 'Target:', targetDateString);

        // Check if target date is within plan period (string comparison works for YYYY-MM-DD)
        if (targetDateString < startDateString || targetDateString > endDateString) {
          console.log('Skipping - outside date range');
          return; // Skip if outside date range
        }

        // Check if target date is in skipped dates
        const skippedDateStrings = item.skippedDates?.map(d => toDateString(d)) || [];
        if (skippedDateStrings.includes(targetDateString)) {
          console.log('Skipping - date is in skipped dates');
          return; // Skip if date is skipped
        }

        // Process each selected meal time
        item.selectedMealTimes?.forEach(mealTime => {
          const mealTimeLower = mealTime.toLowerCase();
          
          // Check current status for this date and meal time
          const currentStatus = item.orderStatus?.find(s => {
            const statusDateString = toDateString(s.date);
            return statusDateString === targetDateString && s.mealTime === mealTimeLower;
          });

          if (['breakfast', 'lunch', 'dinner'].includes(mealTimeLower)) {
            console.log('Adding item to', mealTimeLower, 'for order', order._id);
            
            // Get delivery address using priority fallback
            const deliveryAddress = getDeliveryAddress(order, mealTimeLower);

            mealSchedule[mealTimeLower].push({
              orderId: order._id,
              orderItemId: item.id || item._id, // Handle both id and _id
              customer: {
                name: order.user?.name || 'N/A',
                email: order.user?.email || 'N/A',
                phone: order.user?.phone || 'N/A'
              },
              menu: item.menu?.name || 'N/A',
              vendor: item.vendor?.businessName || 'N/A',
              numberOfPersons: item.quantity || item.numberOfPersons || 1,
              personDetails: item.personDetails || [],
              deliveryAddress: deliveryAddress,
              status: currentStatus?.status || 'pending',
              lastUpdated: currentStatus?.updatedAt,
              notes: currentStatus?.notes || ''
            });
          }
        });
      });
    });

    console.log('Meal schedule result:', {
      breakfast: mealSchedule.breakfast.length,
      lunch: mealSchedule.lunch.length,
      dinner: mealSchedule.dinner.length
    });

    res.status(200).json({
      date: targetDateString,
      mealSchedule,
      totalBreakfast: mealSchedule.breakfast.length,
      totalLunch: mealSchedule.lunch.length,
      totalDinner: mealSchedule.dinner.length
    });

  } catch (err) {
    console.error('Fetch meal schedule error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.patch('/orders/:orderId/items/:itemId/meal-status', protect, async (req, res) => {
  try {
    const { status, date, mealTime, notes } = req.body;
    const { orderId, itemId } = req.params;
    
    console.log('Update meal status request:', { 
      orderId, 
      itemId, 
      status, 
      date, 
      mealTime, 
      userRole: req.user.role 
    });

    // Validation
    if (!status || !date || !mealTime) {
      return res.status(400).json({ 
        message: 'Status, date, and mealTime are required' 
      });
    }

    const normalizedStatus = status.toString().trim();
    const normalizedMealTime = mealTime.toString().trim().toLowerCase();
    
    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ 
        message: 'Invalid date format. Use YYYY-MM-DD' 
      });
    }

    // Validate meal time
    if (!['breakfast', 'lunch', 'dinner'].includes(normalizedMealTime)) {
      return res.status(400).json({ 
        message: 'Invalid meal time. Must be breakfast, lunch, or dinner' 
      });
    }

    // Allowed statuses by role
    const adminAllowed = ['pending', 'preparing', 'readyForDelivery', 'delivered', 'cancelled'];
    const vendorAllowed = ['preparing', 'readyForDelivery'];

    if (req.user.role === 'admin') {
      if (!adminAllowed.includes(normalizedStatus)) {
        return res.status(400).json({ 
          message: 'Invalid status for admin' 
        });
      }
    } else if (req.user.role === 'vendor') {
      if (!vendorAllowed.includes(normalizedStatus)) {
        return res.status(400).json({ 
          message: 'Vendors can only set status to preparing or readyForDelivery' 
        });
      }
    } else {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Find order with vendor verification
    let filter = { _id: orderId };
    if (req.user.role === 'vendor') {
      const vendor = await Vendor.findOne({ userId: req.user._id });
      if (!vendor) {
        return res.status(403).json({ message: 'Vendor not found' });
      }
      filter['items.vendor'] = vendor._id;
    }

    const order = await Order.findOne(filter);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Find the specific order item by matching the id field (not _id)
    const orderItem = order.items.find(item => item.id === itemId || item._id?.toString() === itemId);
    
    if (!orderItem) {
      console.log('Order item not found. Available item ids:', order.items.map(i => ({ id: i.id, _id: i._id })));
      return res.status(404).json({ message: 'Order item not found' });
    }

    console.log('Found order item:', orderItem.id);

    // Helper function to convert Date to YYYY-MM-DD string
    const toDateString = (dateObj) => {
      if (!dateObj) return null;
      const d = new Date(dateObj);
      return d.toISOString().split('T')[0];
    };

    // Validate date is within plan period using string comparison
    const targetDateString = date;
    const startDateString = toDateString(orderItem.startDate);
    const endDateString = toDateString(orderItem.endDate);

    console.log('Date validation - Target:', targetDateString, 'Start:', startDateString, 'End:', endDateString);

    if (targetDateString < startDateString || targetDateString > endDateString) {
      return res.status(400).json({ 
        message: `Date is outside the plan period (${startDateString} to ${endDateString})` 
      });
    }

    // Check if date is skipped
    const skippedDateStrings = orderItem.skippedDates?.map(d => toDateString(d)) || [];
    if (skippedDateStrings.includes(targetDateString)) {
      return res.status(400).json({ 
        message: 'Cannot update status for skipped date' 
      });
    }

    // Check if meal time is selected (case-insensitive)
    const selectedMealTimesLower = orderItem.selectedMealTimes?.map(m => m.toLowerCase()) || [];
    if (!selectedMealTimesLower.includes(normalizedMealTime)) {
      return res.status(400).json({ 
        message: `Meal time '${normalizedMealTime}' is not selected for this order item. Selected meal times: ${orderItem.selectedMealTimes?.join(', ')}` 
      });
    }

    // Initialize orderStatus array if not exists
    if (!orderItem.orderStatus) {
      orderItem.orderStatus = [];
    }

    // Find existing status entry or create new one
    const existingIndex = orderItem.orderStatus.findIndex(s => {
      const statusDateString = toDateString(s.date);
      return statusDateString === targetDateString && s.mealTime === normalizedMealTime;
    });

    // Create date object for storage (store at noon UTC to avoid timezone issues)
    const [year, month, day] = targetDateString.split('-').map(Number);
    const storageDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

    const statusEntry = {
      date: storageDate,
      mealTime: normalizedMealTime,
      status: normalizedStatus,
      updatedBy: req.user._id,
      updatedAt: new Date(),
      notes: notes || ''
    };

    if (existingIndex > -1) {
      // Update existing status
      orderItem.orderStatus[existingIndex] = statusEntry;
      console.log('Updated existing status at index:', existingIndex);
    } else {
      // Add new status entry
      orderItem.orderStatus.push(statusEntry);
      console.log('Added new status entry');
    }

    // Mark the items array as modified to ensure Mongoose saves the changes
    order.markModified('items');
    await order.save();

    console.log('Order saved successfully');

    res.status(200).json({
      message: 'Meal status updated successfully',
      orderId: order._id,
      orderItemId: orderItem.id || orderItem._id,
      statusUpdate: {
        date: targetDateString,
        mealTime: normalizedMealTime,
        status: normalizedStatus
      }
    });

  } catch (err) {
    console.error('Update meal status error:', err);
    res.status(500).json({ message: 'Internal server error', error: err.message });
  }
});

router.get('/orders/:orderId/items/:itemId/status-history', protect, async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    
    console.log('Fetch status history request:', { 
      orderId, 
      itemId, 
      userRole: req.user.role 
    });

    if (!['vendor', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    let filter = { _id: orderId };
    if (req.user.role === 'vendor') {
      const vendor = await Vendor.findOne({ userId: req.user._id });
      if (!vendor) {
        return res.status(403).json({ message: 'Vendor not found' });
      }
      filter['items.vendor'] = vendor._id;
    }

    const order = await Order.findOne(filter).populate({
      path: 'items.orderStatus.updatedBy',
      select: 'name email'
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Find the specific order item by matching the id field (not _id)
    const orderItem = order.items.find(item => item.id === itemId || item._id?.toString() === itemId);
    
    if (!orderItem) {
      console.log('Order item not found. Available item ids:', order.items.map(i => ({ id: i.id, _id: i._id })));
      return res.status(404).json({ message: 'Order item not found' });
    }

    // Group status history by date and meal time
    const statusHistory = orderItem.orderStatus?.map(s => ({
      date: s.date.toISOString().split('T')[0],
      mealTime: s.mealTime,
      status: s.status,
      updatedBy: s.updatedBy?.name || 'Unknown',
      updatedAt: s.updatedAt,
      notes: s.notes
    })) || [];

    res.status(200).json({
      orderId: order._id,
      orderItemId: orderItem._id,
      statusHistory: statusHistory.sort((a, b) => 
        new Date(b.updatedAt) - new Date(a.updatedAt)
      )
    });

  } catch (err) {
    console.error('Fetch status history error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/admin/orders/:id/refund/calculate - Calculate suggested refund
router.get('/orders/:id/refund/calculate',protect,adminProtect, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('Refund calculation request:', { orderId: id, userRole: req.user.role });

    // Admin only
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access only' });
    }

    const result = await calculateRefundForOrder(id);
    if (!result.success) {
      return res.status(400).json({
        message: result.message
      });
    }
    res.json({
      // success: true,
      orderId: id,
      suggestedRefundAmount: parseFloat(result.suggestedRefundAmount.toFixed(2)),
      consumedAmount: parseFloat(result.consumedAmount.toFixed(2)),
      consumedMealsCount: result.consumedMealsCount,
      totalAmount: parseFloat(result.order.totalAmount.toFixed(2)),
      totalAlreadyRefunded: parseFloat((result.totalAlreadyRefunded || 0).toFixed(2)),
      currency: result.order.currency || 'INR',
      canFullRefund: result.consumedMealsCount === 0,
    });
  } catch (err) {
    console.error('Refund calculation error:', err);
    res.status(500).json({ 
      success: false,
      message: err.message || 'Failed to calculate refund amount' 
    });
  }
});

router.post('/orders/:id/refund/process', protect, adminProtect, async (req, res) => {
  try {
    const { id: orderId } = req.params;
    const { amount, note } = req.body;

    console.log('Refund process request:', { orderId, amount, note: note?.substring(0, 50), userRole: req.user.role });

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Refund amount must be greater than zero' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // ✅ STEP 1: Verify payment was captured in Cashfree
    const cashfreeOrderId = order.orderId || order._id.toString();
    console.log('🔍 Fetching Cashfree order status for:', cashfreeOrderId);
    
    let cfOrder;
    try {
      cfOrder = await getCashfreeOrderDetails(cashfreeOrderId);
      console.log('📊 Cashfree order status:', cfOrder.order_status);
    } catch (err) {
      console.error('❌ Failed to fetch Cashfree order:', err.message);
      return res.status(500).json({
        success: false,
        message: 'Unable to verify payment status with Cashfree'
      });
    }

    if (!cfOrder || cfOrder.order_status !== 'PAID') {
      return res.status(400).json({
        success: false,
        message: `Cannot refund — order status is '${cfOrder?.order_status || 'UNKNOWN'}', expected 'PAID'`
      });
    }

    // ✅ STEP 2: Fetch and sync actual refund state from Cashfree
    console.log('🔍 Fetching actual Cashfree refund state...');
    let cashfreeRefunds = [];
    let cashfreeRefundedTotal = 0;

    try {
      const cfData = await getAllCashfreeRefundsForOrder(cashfreeOrderId);
      console.log('📊 Raw Cashfree refunds response:', cfData);

      // Handle different response formats
      if (Array.isArray(cfData)) {
        cashfreeRefunds = cfData;
      } else if (cfData && Array.isArray(cfData.refunds)) {
        cashfreeRefunds = cfData.refunds;
      } else if (cfData && cfData.data && Array.isArray(cfData.data)) {
        cashfreeRefunds = cfData.data;
      } else {
        console.warn('⚠️ Unexpected Cashfree refunds response format:', cfData);
        cashfreeRefunds = [];
      }

      // ✅ Sync MongoDB with Cashfree status
      if (cashfreeRefunds.length > 0) {
        let hasUpdates = false;
        for (const cfRefund of cashfreeRefunds) {
          const dbRefund = order.refunds?.find(r => r.cfRefundId === cfRefund.cf_refund_id);
          if (dbRefund && dbRefund.status !== cfRefund.refund_status) {
            console.log(`🔄 Auto-sync refund ${cfRefund.cf_refund_id}: ${dbRefund.status} → ${cfRefund.refund_status}`);
            dbRefund.status = cfRefund.refund_status;
            dbRefund.updatedAt = new Date();
            hasUpdates = true;
          }
        }
        if (hasUpdates) {
          await order.save();
        }
      }

      // ✅ Calculate total from Cashfree (excluding CANCELLED, FAILED, ONHOLD)
      cashfreeRefundedTotal = cashfreeRefunds
        .filter(r => !['CANCELLED', 'FAILED', 'ONHOLD'].includes(r.refund_status))
        .reduce((sum, r) => sum + (r.refund_amount || 0), 0);

      console.log('💰 Cashfree active refunds total:', cashfreeRefundedTotal);
      console.log('📋 Cashfree refunds breakdown:', cashfreeRefunds.map(r => ({
        id: r.cf_refund_id,
        amount: r.refund_amount,
        status: r.refund_status
      })));

    } catch (err) {
      console.error('⚠️ Failed to fetch Cashfree refunds:', err.message);
      
      // ✅ Fallback: Use MongoDB data with warning
      cashfreeRefundedTotal = order.refunds
        ?.filter(r => !['CANCELLED', 'FAILED'].includes(r.status))
        .reduce((sum, r) => sum + r.amount, 0) || 0;
      
      console.warn('⚠️ Using MongoDB refund total as fallback:', cashfreeRefundedTotal);
    }

    // ✅ STEP 3: Validate new refund amount against captured amount
    const capturedAmount = cfOrder.order_amount;
    const availableAmount = capturedAmount - cashfreeRefundedTotal;
    const newTotal = cashfreeRefundedTotal + amount;

    console.log('💵 Refund validation:', {
      capturedAmount,
      alreadyRefunded: cashfreeRefundedTotal,
      requestedAmount: amount,
      newTotal,
      availableAmount
    });

    if (newTotal > capturedAmount) {
      return res.status(400).json({
        success: false,
        message: `Refund exceeds available balance. Order amount: ₹${capturedAmount.toFixed(2)}, Already refunded: ₹${cashfreeRefundedTotal.toFixed(2)}, Available: ₹${availableAmount.toFixed(2)}, Requested: ₹${amount.toFixed(2)}`
      });
    }

    // ✅ Additional check: Don't allow if amount is more than available
    if (amount > availableAmount) {
      return res.status(400).json({
        success: false,
        message: `Requested amount ₹${amount.toFixed(2)} exceeds available ₹${availableAmount.toFixed(2)}`
      });
    }

    console.log('✅ Validation passed. Proceeding with refund creation...');

    // ✅ STEP 4: Initiate refund via Cashfree
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    const refundId = `admin_refund_${orderId}_${timestamp}_${random}`;
    
    console.log('🚀 Initiating Cashfree refund:', { 
      cashfreeOrderId, 
      amount, 
      refundId,
      note: note || `Admin refund for order ${orderId}`
    });

    let cashfreeRefundResponse;
    try {
      cashfreeRefundResponse = await initiateCashfreeRefund(
        cashfreeOrderId,
        amount,
        refundId,
        note || `Admin refund for order ${orderId}`,
        'STANDARD'
      );
      
      console.log('✅ Cashfree refund created successfully:', cashfreeRefundResponse);
      
    } catch (cfError) {
      console.error('❌ Cashfree refund initiation failed:', cfError.message);
      
      // ❌ Don't save to DB if Cashfree rejected it
      return res.status(500).json({
        success: false,
        message: `Cashfree rejected refund: ${cfError.message}`
      });
    }

    // ✅ STEP 5: Save refund record in DB (only if Cashfree succeeded)
    if (!order.refunds) order.refunds = [];
    order.refunds.push({
      cfRefundId: cashfreeRefundResponse.cf_refund_id,
      refundId: cashfreeRefundResponse.refund_id || refundId,
      amount: cashfreeRefundResponse.refund_amount || amount,
      currency: cashfreeRefundResponse.refund_currency || 'INR',
      status: cashfreeRefundResponse.refund_status,
      note: cashfreeRefundResponse.refund_note || note,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await order.save();

    console.log('✅ Refund saved to MongoDB:', {
      refundId: cashfreeRefundResponse.refund_id,
      cfRefundId: cashfreeRefundResponse.cf_refund_id,
      status: cashfreeRefundResponse.refund_status,
      amount: cashfreeRefundResponse.refund_amount
    });

    return res.json({
      success: true,
      message: 'Refund processed successfully',
      refund: {
        refundId: cashfreeRefundResponse.refund_id,
        cfRefundId: cashfreeRefundResponse.cf_refund_id,
        amount: cashfreeRefundResponse.refund_amount,
        status: cashfreeRefundResponse.refund_status,
        currency: cashfreeRefundResponse.refund_currency
      },
      orderId: order._id
    });

  } catch (err) {
    console.error('❌ Refund process error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to process refund'
    });
  }
});

// ✅ ROUTE: /api/admin/orders/:id/refund/:refundId/cancel
// router.post('/orders/:id/refund/:refundId/cancel', protect, adminProtect, async (req, res) => {
//   try {
//     // if (req.user.role !== 'admin') {
//     //   return res.status(403).json({ 
//     //     success: false,
//     //     message: 'Admin access only' 
//     //   });
//     // }

//     const { id: orderId, refundId } = req.params;
//     const { remarks } = req.body;

//     console.log('🔍 CANCEL REQUEST:', { orderId, refundId, remarks });

//     const order = await Order.findById(orderId);
//     if (!order) {
//       return res.status(404).json({ 
//         success: false,
//         message: 'Order not found' 
//       });
//     }

//     console.log('📊 ORDER REFUNDS:', order.refunds?.map(r => ({
//       refundId: r.refundId,
//       cfRefundId: r.cfRefundId,
//       status: r.status,
//       amount: r.amount
//     })));

//     const refund = order.refunds?.find(r => r.refundId === refundId);
//     if (!refund) {
//       console.error('❌ Refund NOT FOUND in DB:', refundId);
//       console.log('Available refund IDs:', order.refunds?.map(r => r.refundId));
//       return res.status(404).json({ 
//         success: false,
//         message: 'Refund not found in order' 
//       });
//     }

//     console.log('✅ FOUND REFUND:', {
//       refundId: refund.refundId,
//       cfRefundId: refund.cfRefundId,
//       status: refund.status,
//       amount: refund.amount
//     });

//     // Only allow cancellation if status is PENDING or ONHOLD
//     if (!['PENDING', 'ONHOLD'].includes(refund.status)) {
//       return res.status(400).json({
//         success: false,
//         message: `Cannot cancel refund in status '${refund.status}'. Only PENDING or ONHOLD refunds can be cancelled.`
//       });
//     }

//     const cashfreeOrderId = order.orderId || order._id.toString();
//     const cashfreeRefundId = refund.cfRefundId;

//     if (!cashfreeRefundId) {
//       console.warn('⚠️ No cfRefundId found - this refund was never created in Cashfree');
      
//       // Just mark as cancelled in DB
//       refund.status = 'CANCELLED';
//       refund.updatedAt = new Date();
//       if (remarks) refund.note = `${remarks} (No Cashfree ID)`;
      
//     //   await order.save();
      
//     //   return res.json({
//     //     success: true,
//     //     message: 'Refund cancelled in database (never existed in Cashfree)',
//     //     refund: {
//     //       refundId: refund.refundId,
//     //       status: refund.status,
//     //       amount: refund.amount
//     //     },
//     //     orderId: order._id
//     //   });
//     }

//     // ✅ BETTER: Fetch all refunds to find this one
//     console.log('🔍 Fetching all Cashfree refunds to verify existence...');
//     let cashfreeHasRefund = false;
//     let cashfreeRefundStatus = null;

//     try {
//       const allRefunds = await getAllCashfreeRefundsForOrder(cashfreeOrderId);
//       console.log('📊 Cashfree refunds response:', allRefunds);

//       // Handle different response formats
//       let refundsList = [];
//       if (Array.isArray(allRefunds)) {
//         refundsList = allRefunds;
//       } else if (allRefunds?.refunds) {
//         refundsList = allRefunds.refunds;
//       } else if (allRefunds?.data) {
//         refundsList = allRefunds.data;
//       }

//       console.log('📋 Cashfree refunds list:', refundsList.map(r => ({
//         cf_refund_id: r.cf_refund_id,
//         refund_id: r.refund_id,
//         status: r.refund_status,
//         amount: r.refund_amount
//       })));

//       // Find this specific refund in Cashfree
//       const cfRefund = refundsList.find(r => 
//         r.cf_refund_id === cashfreeRefundId || 
//         r.refund_id === refund.refundId
//       );

//       if (cfRefund) {
//         cashfreeHasRefund = true;
//         cashfreeRefundStatus = cfRefund.refund_status;
//         console.log('✅ Refund found in Cashfree:', {
//           cf_refund_id: cfRefund.cf_refund_id,
//           status: cfRefund.refund_status,
//           amount: cfRefund.refund_amount
//         });

//         // ✅ Sync status first
//         if (cfRefund.refund_status !== refund.status) {
//           console.log(`🔄 Syncing status: ${refund.status} → ${cfRefund.refund_status}`);
//           refund.status = cfRefund.refund_status;
//           refund.updatedAt = new Date();
//           await order.save();

//           // ✅ If already cancelled or completed, don't try to cancel again
//           if (['CANCELLED', 'SUCCESS', 'FAILED'].includes(cfRefund.refund_status)) {
//             return res.json({
//               success: true,
//               message: `Refund is already ${cfRefund.refund_status} in Cashfree. Database updated.`,
//               refund: {
//                 refundId: refund.refundId,
//                 cfRefundId: refund.cfRefundId,
//                 status: refund.status,
//                 amount: refund.amount
//               },
//               orderId: order._id
//             });
//           }
//         }
//       } else {
//         console.warn('⚠️ Refund not found in Cashfree list');
//         cashfreeHasRefund = false;
//       }

//     } catch (err) {
//       console.error('⚠️ Failed to fetch Cashfree refunds:', err.message);
//       cashfreeHasRefund = false;
//     }

//     // ✅ Only try to cancel if refund exists and is cancellable in Cashfree
//     if (cashfreeHasRefund && ['PENDING', 'ONHOLD'].includes(cashfreeRefundStatus)) {
//       console.log('🚀 CALLING CASHFREE Cancel API:', {
//         cashfreeOrderId,
//         cashfreeRefundId,
//         currentStatus: cashfreeRefundStatus
//       });

//       try {
//         const cashfreeResponse = await updateCashfreeRefund(
//           cashfreeOrderId,
//           cashfreeRefundId,
//           'CANCELLED',
//           remarks || `Admin cancelled refund ${refundId}`
//         );
        
//         console.log('✅ CASHFREE CANCEL SUCCESS:', cashfreeResponse);
        
//         // Update based on Cashfree response
//         refund.status = cashfreeResponse.refund_status || 'CANCELLED';
//         refund.updatedAt = new Date();
//         if (remarks) refund.note = remarks;
        
//         await order.save();
        
//         return res.json({
//           success: true,
//           message: 'Refund cancelled successfully in both Cashfree and database',
//           refund: {
//             refundId: refund.refundId,
//             cfRefundId: refund.cfRefundId,
//             status: refund.status,
//             amount: refund.amount
//           },
//           orderId: order._id
//         });
        
//       } catch (cfErr) {
//         console.error('❌ CASHFREE CANCEL API FAILED:', cfErr.message);
        
//         // ✅ Cashfree API failed, but update DB anyway
//         // refund.status = 'CANCELLED';
//         refund.updatedAt = new Date();
//         if (remarks) {
//           refund.note = `${remarks} (Cashfree API failed: ${cfErr.message})`;
//         } else {
//           refund.note = `Admin cancelled (Cashfree API failed: ${cfErr.message})`;
//         }
        
//         // await order.save();
        
//         return res.json({
//           success: false,
//           message: 'Refund cancelled Cashfree update failed. Please verify in Cashfree dashboard.',
//           warning: cfErr.message,
//           refund: {
//             refundId: refund.refundId,
//             cfRefundId: refund.cfRefundId,
//             status: refund.status,
//             amount: refund.amount
//           },
//           orderId: order._id
//         });
//       }
      
//     } else {
//       // ✅ Refund doesn't exist in Cashfree or not in cancellable state
//       console.warn('⚠️ Refund not in Cashfree or not cancellable, updating DB only');
      
//       refund.status = 'CANCELLED';
//       refund.updatedAt = new Date();
//       if (remarks) {
//         refund.note = `${remarks} (Not found in Cashfree or already processed)`;
//       } else {
//         refund.note = `Admin cancelled (Not found in Cashfree)`;
//       }
      
//       await order.save();
      
//       return res.json({
//         success: true,
//         message: 'Refund cancelled in database (not found in Cashfree or already processed)',
//         refund: {
//           refundId: refund.refundId,
//           cfRefundId: refund.cfRefundId,
//           status: refund.status,
//           amount: refund.amount
//         },
//         orderId: order._id
//       });
//     }

//   }catch (err) {
//     console.error('❌ CANCEL ROUTE ERROR:', err);
//     return res.status(500).json({ 
//       success: false,
//       message: err.message || 'Internal server error' 
//     });
//   }
// });

// ✅ YOUR WEBHOOK - PERFECT with MINOR FIXES
router.post("/refund/webhook", async (req, res) => {
  try {
    console.log('🔔 CASHFREE WEBHOOK RECEIVED:', req.body);

    const { error } = refundWebhookSchema.validate(req.body);
    if (error) {
      console.error("Refund Webhook validation failed:", error.details[0].message);
      return res.status(400).json({ message: "Invalid webhook payload" });
    }

    const {
      cf_refund_id,
      refund_id,
      order_id,
      refund_amount,
      refund_status,
    } = req.body;

    console.log('🔔 CASHFREE WEBHOOK:', { 
      cf_refund_id, 
      refund_id, 
      order_id, 
      refund_amount, 
      refund_status 
    });

    if (!mongoose.Types.ObjectId.isValid(order_id)) {
      console.error(`Invalid order ID received in refund webhook: ${order_id}`);
      return res.status(400).json({ message: "Invalid order ID format" });
    }

    const order = await Order.findById(order_id);
    if (!order) {
      console.error(`Order not found for ID: ${order_id} in refund webhook`);
      return res.status(404).json({ message: "Order not found" });
    }

    // Find and update refund
    const existingRefund = order.refunds?.find(
      (r) => r.cfRefundId === cf_refund_id || r.refundId === refund_id
    );

    if (existingRefund) {
      console.log(`✅ Updating existing refund ${refund_id}: ${existingRefund.status} → ${refund_status}`);
      existingRefund.status = refund_status;
      existingRefund.updatedAt = new Date();
    } else {
      console.warn(`⚠️ Refund ${cf_refund_id} not found in order ${order_id}. Creating new entry.`);
      if (!order.refunds) order.refunds = [];
      order.refunds.push({
        cfRefundId: cf_refund_id,
        refundId: refund_id,
        amount: refund_amount,
        currency: "INR",
        status: refund_status,
        note: `Webhook: ${refund_status} for cf_refund_id: ${cf_refund_id}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // ✅ Calculate total SUCCESS refunds only
    const totalRefundedSuccess = order.refunds
      .filter(r => r.status === 'SUCCESS')
      .reduce((sum, r) => sum + (r.amount || 0), 0);

    const allRefundsSettled = order.refunds.every(r => 
      ['SUCCESS', 'CANCELLED', 'FAILED'].includes(r.status)
    );
    const anyRefundPending = order.refunds.some(r => 
      ['PENDING', 'ONHOLD'].includes(r.status)
    );

    // Update order status
    if (allRefundsSettled && totalRefundedSuccess >= order.totalAmount) {
      order.status = "refunded";
      console.log(`🎉 Order ${order_id} fully refunded!`);
    } else if (allRefundsSettled && totalRefundedSuccess > 0) {
      order.status = "partially_refunded";
      console.log(`💰 Order ${order_id} partially refunded: ₹${totalRefundedSuccess}`);
    } else if (anyRefundPending) {
      order.status = "refund_pending";
      console.log(`⏳ Order ${order_id} has pending refunds`);
    }

    await order.save();
    
    console.log(`✅ Webhook processed: ${refund_id} → ${refund_status}`);
    res.status(200).json({ message: "Refund webhook processed successfully" });
    
  } catch (error) {
    console.error("❌ Webhook processing ERROR:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

module.exports = router;
