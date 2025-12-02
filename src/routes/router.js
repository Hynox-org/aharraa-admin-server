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
router.post('/vendor/new', protect, async (req, res) => {
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

module.exports = router;
