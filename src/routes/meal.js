const express = require('express');
const Meal = require('../models/Meal');
const Vendor = require('../models/Vendor');
const { protect } = require('../middleware/auth');

const router = express.Router();

// GET /api/meal/ - Get all meals for admin
router.get('/', protect, async (req, res) => {
  try {
    const meals = await Meal.find({})
      .populate('vendorId', 'name email');
    res.json(meals);
  } catch (err) {
    console.error('Error fetching meals:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/meal/vendor/:vendorId - Get meals for specific vendor
router.get('/vendor/:vendorId', protect, async (req, res) => {
  try {
    const { vendorId } = req.params;
    const meals = await Meal.find({ vendorId })
      .populate('vendorId', 'name email');
    res.json(meals);
  } catch (err) {
    console.error('Error fetching vendor meals:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/meal - Create new meal
router.post('/', protect, async (req, res) => {
  try {
    const { name, description, dietPreference, category, subProducts, nutritionalDetails, price, image } = req.body;
    const { vendorId } = req.user;
    // Validate required fields
    if (!name || !description || !dietPreference || !category || !price || !image || !vendorId) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Verify vendor exists
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(400).json({ message: 'Invalid vendor ID' });
    }

    const meal = new Meal({
      name,
      description,
      dietPreference,
      category,
      subProducts: subProducts || [],
      nutritionalDetails,
      price,
      image,
      vendorId
    });

    await meal.save();
    const populatedMeal = await Meal.findById(meal._id).populate('vendorId', 'name email');
    
    res.status(201).json(populatedMeal);
  } catch (err) {
    console.error('Error creating meal:', err);
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/meal/:id - Update meal
router.put('/:id', protect, async (req, res) => {
  try {
    const meal = await Meal.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!meal) {
      return res.status(404).json({ message: 'Meal not found' });
    }

    const populatedMeal = await Meal.findById(meal._id).populate('vendorId', 'name email');
    res.json(populatedMeal);
  } catch (err) {
    console.error('Error updating meal:', err);
    res.status(400).json({ message: err.message });
  }
});

// DELETE /api/meal/:id - Delete meal
router.delete('/:id', protect, async (req, res) => {
  try {
    const meal = await Meal.findByIdAndDelete(req.params.id);
    if (!meal) {
      return res.status(404).json({ message: 'Meal not found' });
    }
    res.json({ message: 'Meal deleted successfully' });
  } catch (err) {
    console.error('Error deleting meal:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
