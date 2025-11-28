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

// Admin Creation
// This route will be protected by 'protect' middleware, meaning only authenticated users can register a new admin.
router.post('/register', protect, async (req, res) => {
  const { name, email, password } = req.body;

  try {
    // Check if user already exists in MongoDB
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'User with this email already exists.' });
    }

    // Create user in Supabase Auth
    const { data: supabaseAuthData, error: supabaseAuthError } = await supabaseServiceRole.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email for admin users
    });

    if (supabaseAuthError) {
      console.error('Supabase admin user creation error:', supabaseAuthError);
      return res.status(400).json({ message: supabaseAuthError.message });
    }

    // Save user data to MongoDB with admin role
    user = new User({
      name,
      email,
      supabaseId: supabaseAuthData.user.id,
      role: 'admin'
    });
    await user.save();

    // Generate a session for the newly created user (optional, but useful for immediate login)
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
      role: user.role
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// Admin Login - Endpoint : /api/admin/login
// This route is not protected by any middleware, allowing any user to attempt login.
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Authenticate user with Supabase Auth
    const { data, error: supabaseError } = await supabaseAnon.auth.signInWithPassword({
      email,
      password,
    });

    if (supabaseError) {
      console.error('Supabase login error:', supabaseError);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!data || !data.user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Find user in MongoDB using supabaseId to check role
    const user = await User.findOne({ supabaseId: data.user.id });
    if (!user) {
      return res.status(401).json({ message: 'User not found in database' });
    }

    // Check if the user has an admin role
    if (user.role !== 'admin' && user.role !== 'vendor') {
      console.log(user.role);
      return res.status(403).json({ message: 'Access Denied' });
    }

    res.status(200).json({
      message: 'Login successful',
      accessToken: data.session.access_token,
      role: user.role
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// Get all Accompaniments
router.get('/accompaniments', async (req, res) => {
  try {
    const accompaniments = await Accompaniment.find();
    res.json(accompaniments);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Get all Carts
// router.get('/carts', async (req, res) => {
//   try {
//     const carts = await Cart.find()
//       .populate('user', 'name email')
//       .populate({
//         path: 'cartItems',
//         populate: {
//           path: 'meal',
//           model: 'Meal',
//           populate: {
//             path: 'vendor menu',
//             select: 'name title',
//           }
//         }
//       })
      
//       .populate({
//         path: 'cartItems',
//         populate: {
//           path: 'accompaniments',
//           model: 'Accompaniment',
//           select: 'name price'
//         }
//       });
//     res.json(carts);
//   } catch (err) {
//     console.error(err.message);
//     res.status(500).send('Server Error');
//   }
// });
router.get('/carts', async (req, res) => {
  try {
    const carts = await Cart.find()
      // .populate('user', 'name email')   // populate cart owner

      // populate items inside cart
      .populate({
        path: 'items',
        populate: [
          // populate menu inside CartItem
          {
            path: 'menu',
            model: 'Menu',
            populate: {
              path: 'vendor',  // Menu -> vendorId
              model: 'Vendor',
              select: 'name title'
            }
          },
          // populate plan inside CartItem
          {
            path: 'accompaniments',
            model: 'Accompanimentlan',
            select: 'name price'
          },

          // populate user inside each CartItem
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
// router.get('/cartitems', async (req, res) => {
//   try {
//     const cartItems = await CartItem.find()
//       .populate('cart')
//       .populate({
//         path: 'meal',
//         populate: {
//           path: 'vendor menu',
//           select: 'name title'
//         }
//       })
//       .populate('accompaniments', 'name price');
//     res.json(cartItems);
//   } catch (err) {
//     console.error(err.message);
//     res.status(500).send('Server Error');
//   }
// });

router.get('/cartitems', async (req, res) => {
  try {
    const cartItems = await CartItem.find()
      // .populate('cart')
      // .populate('user', 'name email')
      .populate({
        path: 'menu',
        model: 'Menu',
        populate: {
          path: 'vendor',
          model: 'Vendor',
          select: 'name title'
        }
      })
      // .populate('accompaniments', 'name price');
      res.json(cartItems);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Get all DeliveryAddresses
// router.get('/deliveryaddresses', async (req, res) => {
//   try {
//     const deliveryAddresses = await DeliveryAddress.find().populate('user', 'name email');
//     res.json(deliveryAddresses);
//   } catch (err) {
//     console.error(err.message);
//     res.status(500).send('Server Error');
//   }
// });
router.get('/deliveryaddresses', async (req, res) => {
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
// router.get('/meals', async (req, res) => {
//   try {
//     const meals = await Meal.find()
//       .populate('vendorId', 'name email')
//       .populate('menu', 'title')
//       .populate('accompaniments', 'name price');
//     res.json(meals);
//   } catch (err) {
//     console.error(err.message);
//     res.status(500).send('Server Error');
//   }
// });
router.get('/meals', async (req, res) => {
  try {
    const meals = await Meal.find()
      .populate('vendorId', 'name email');
    res.json(meals);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Get all Menus
// router.get('/menus', async (req, res) => {
//   try {
//     const menus = await Menu.find().populate('vendor', 'name email');
//     res.json(menus);
//   } catch (err) {
//     console.error(err.message);
//     res.status(500).send('Server Error');
//   }
// });
router.get('/menus', async (req, res) => {
  try {
    const menus = await Menu.find()
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
    const orders = await Order.find()
      .populate('user', 'name email')
      .populate({
        path: 'items.vendor', // Correct path for vendor within items
        model: 'Vendor',
        select: 'name email'
      })
      .populate({
        path: 'items.menu',
        model: 'Menu',
        select: 'name description' // Added description for Menu
      })
      .populate({
        path: 'items.plan',
        model: 'Plan',
        select: 'name description duration price' // Added more fields for Plan
      });
    res.json(orders);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Get a single Order by ID
router.get('/orders/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email')
      .populate({
        path: 'items.vendor', // Correct path for vendor within items
        model: 'Vendor',
        select: 'name email'
      })
      .populate({
        path: 'items.menu',
        model: 'Menu',
        select: 'name description' // Added description for Menu
      })
      .populate({
        path: 'items.plan',
        model: 'Plan',
        select: 'name description duration price' // Added more fields for Plan
      });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
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
    // const plans = await Plan.find().populate('vendor', 'name email');
    const plans = await Plan.find();
    res.json(plans);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Get all Users
router.get('/users', async (req, res) => {
  try {
    const users = await User.find(); // Removed population for 'orders'
    res.json(users);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Get all Vendors
router.get('/vendors', async (req, res) => {
  try {
    const vendors = await Vendor.find();
    res.json(vendors);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Apply protect and adminProtect middleware to all admin data fetching routes below this point
router.use(protect, adminProtect);

module.exports = router;
