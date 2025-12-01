const express = require('express');
const Menu = require('../models/Menu');
const Meal = require('../models/Meal');
const Vendor = require('../models/Vendor');
const { protect } = require('../middleware/auth');

const router = express.Router();

// GET /api/menu/ - Get all menus (admin)
router.get('/', protect, async (req, res) => {
  try {
    const menus = await Menu.find({})
      .populate({
        path: 'menuItems.meal',
        model: 'Meal',
        populate: { path: 'vendorId', model: 'Vendor', select: 'name email' }
      })
      .populate('vendor', 'name email');
    res.json(menus);
  } catch (err) {
    console.error('Error fetching menus:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/menu/vendor/:vendorId
router.get('/vendor/:vendorId', protect, async (req, res) => {
  try {
    const { vendorId } = req.params;
    const menus = await Menu.find({ vendor: vendorId })
      .populate({
        path: 'menuItems.meal',
        model: 'Meal',
        populate: { path: 'vendorId', model: 'Vendor', select: 'name email' }
      });
    res.json(menus);
  } catch (err) {
    console.error('Error fetching vendor menus:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/menu - Create menu (expects menuItems with meal IDs)
router.post('/', protect, async (req, res) => {
  try {
    const { name, coverImage, description, perDayPrice, availableMealTimes, menuItems, vendor, price } = req.body;

    // Validate required fields
    if (!name || !vendor || !perDayPrice || !menuItems || !Array.isArray(menuItems)) {
      return res.status(400).json({ message: 'Missing required fields: name, vendor, perDayPrice, menuItems' });
    }

    // Verify vendor exists
    const vendorDoc = await Vendor.findById(vendor);
    if (!vendorDoc) {
      return res.status(400).json({ message: 'Invalid vendor ID' });
    }

    // Verify all meals exist
    for (const item of menuItems) {
      const meal = await Meal.findById(item.meal);
      if (!meal) {
        return res.status(400).json({ message: `Invalid meal ID: ${item.meal}` });
      }
    }

    const menuData = new Menu({
      name,
      vendor,
      coverImage,
      description,
      perDayPrice,
      availableMealTimes: availableMealTimes || [],
      price: price || { breakfast: 0, lunch: 0, dinner: 0 },
      menuItems
    });

    const menu = await menuData.save();
    await menu.populate({
      path: 'menuItems.meal',
      model: 'Meal',
      populate: { path: 'vendorId', model: 'Vendor', select: 'name email' }
    }).populate('vendor', 'name email');

    res.status(201).json(menu);
  } catch (err) {
    console.error('Error creating menu:', err);
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/menu/:id
router.put('/:id', protect, async (req, res) => {
  try {
    const menu = await Menu.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!menu) {
      return res.status(404).json({ message: 'Menu not found' });
    }

    await menu.populate({
      path: 'menuItems.meal',
      model: 'Meal',
      populate: { path: 'vendorId', model: 'Vendor', select: 'name email' }
    }).populate('vendor', 'name email');

    res.json(menu);
  } catch (err) {
    console.error('Error updating menu:', err);
    res.status(400).json({ message: err.message });
  }
});

// DELETE /api/menu/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    const menu = await Menu.findByIdAndDelete(req.params.id);
    if (!menu) {
      return res.status(404).json({ message: 'Menu not found' });
    }
    res.json({ message: 'Menu deleted successfully' });
  } catch (err) {
    console.error('Error deleting menu:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
