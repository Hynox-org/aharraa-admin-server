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
/**
 * @openapi
 * /api/admin/meals:
 *   post:
 *     summary: Create a new meal
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - description
 *               - dietPreference
 *               - category
 *               - nutritionalDetails
 *               - price
 *               - image
 *               - vendorId
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               dietPreference:
 *                 type: string
 *                 enum: [All, Veg, Non-Veg, Vegan, Custom]
 *               category:
 *                 type: string
 *                 enum: [Breakfast, Lunch, Dinner]
 *               subProducts:
 *                 type: array
 *                 items:
 *                   type: string
 *               nutritionalDetails:
 *                 type: object
 *                 properties:
 *                   protein:
 *                     type: number
 *                   carbs:
 *                     type: number
 *                   fats:
 *                     type: number
 *                   calories:
 *                     type: number
 *               price:
 *                 type: number
 *               image:
 *                 type: string
 *               vendorId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Meal created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 message:
 *                   type: string
 */
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

/**
 * @openapi
 * /api/admin/menus:
 *   post:
 *     summary: Create a complete weekly menu
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - vendor
 *               - perDayPrice
 *               - menuItems
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               perDayPrice:
 *                 type: number
 *               availableMealTimes:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [Breakfast, Lunch, Dinner]
 *               price:
 *                 type: object
 *                 properties:
 *                   breakfast:
 *                     type: number
 *                   lunch:
 *                     type: number
 *                   dinner:
 *                     type: number
 *               menuItems:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     day:
 *                       type: string
 *                       enum: [Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday]
 *                     category:
 *                       type: string
 *                       enum: [Breakfast, Lunch, Dinner]
 *                     meal:
 *                       type: string
 *               vendor:
 *                 type: string
 *     responses:
 *       201:
 *         description: Menu created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 message:
 *                   type: string
 */
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

module.exports = router;
