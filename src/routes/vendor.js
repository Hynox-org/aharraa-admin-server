const express = require('express');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const Order = require('../models/Order');
const router = express.Router();
const { protect, adminProtect } = require('../middleware/auth');
const { supabaseAnon, supabaseServiceRole } = require('../config/supabase');

router.post('/new', protect, async (req, res) => {
  const { name, companyName, email, password } = req.body;

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
      console.error('Supabase vendor user creation error:', supabaseAuthError);
      return res.status(400).json({ message: supabaseAuthError.message });
    }

    // Save user data to MongoDB with admin role
    user = new User({
      name,
      email,
      supabaseId: supabaseAuthData.user.id,
      role: 'vendor'
    });
    await user.save();
    // ---- Create Vendor Document ----
    const Vendor = require('../models/Vendor'); // Adjust path if needed
    const newVendor = new Vendor({
      name,
      email,
      // Save the company name as description or add a new field to schema if needed
      description: companyName, // Or use: companyName: companyName, if you add field
      userId: [user._id]
    });
    await newVendor.save();

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
      message: 'vendor registered successfully',
      accessToken: signInData.session.access_token,
      role: user.role
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).json('Server error');
  }
});
// GET /api/vendor/orders - Get orders for authenticated vendor
router.get('/orders', protect,adminProtect, async (req, res) => {
  try {
    // Check if user is vendor
    // if (req.user.role !== 'vendor') {
    //   return res.status(403).json({ message: 'Access denied. Vendor access only.' });
    // }

    // Find the vendor document linked to this user
    const vendor = await Vendor.findOne({ user: req.user.id });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor profile not found' });
    }
    console.log('Vendor ID:', vendor._id);
    console.log('user ID', req.user.id);
    // Query orders where ANY item has this vendor's ID
    const orders = await Order.find({ 
      'items.vendor': vendor._id 
    })
      .populate('user', 'name email phoneNumber')
      .populate('items.menu')
      .populate('items.plan')
      .sort({ createdAt: -1 }) // Latest orders first
      .lean();

    res.json(orders);
  } catch (err) {
    console.error('Error fetching vendor orders:', err);
    res.status(500).json({ message: 'Server error fetching vendor orders' });
  }
});
router.get('/', protect, adminProtect, async (req, res) => {
    try {
      const vendors = await Vendor.find();
      res.json(vendors);
    } catch (err) {
      console.error(err.message);
      res.status(500).json('Server Error');
    }
});

router.get('/:id', protect, adminProtect, async (req, res) => {
    try {
      const vendor = await Vendor.findById(req.params.id);
      if (!vendor) {
        return res.status(404).json({ message: 'Vendor not found' });
      }
      res.json(vendor);
    } catch (err) {
      console.error(err.message);
      if (err.kind === 'ObjectId') {
        return res.status(400).json({ message: 'Invalid vendor ID' });
      }
      res.status(500).json('Server Error');
    }
});

router.put('/:id', protect, adminProtect, async (req, res) => {
    const { name, address, phone } = req.body;
    const id = req.params.id;
    try {
        let vendor = await Vendor.findById(id);
        if (!vendor) {
            return res.status(404).json({ message: 'Vendor not found' });
        }
        if (name){ vendor.name = name || vendor.name;}
        if (address){ vendor.address = address || vendor.address;}
        if (phone) {vendor.phone = phone || vendor.phone;}
        await vendor.save();
        res.json( {message: 'Vendor updated', vendor});
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ message: 'Invalid vendor ID' });
        }
        res.status(500).json('Server Error');
    }
});

router.delete('/:id', protect, adminProtect, async (req, res) => {
    const id= req.params.id;
    try {
        const vendor = await Vendor.findById(id);
        if (!vendor) {
            return res.status(404).json({ message: 'Vendor not found' });
        }
        await vendor.remove();
        res.json({ message: 'Vendor removed' });
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ message: 'Invalid vendor ID' });
        }
        res.status(500).json('Server Error');
    }
});

module.exports = router;
