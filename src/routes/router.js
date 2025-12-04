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

module.exports = router;
