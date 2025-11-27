const mongoose = require('mongoose');

const NutritionalDetailsSchema = new mongoose.Schema({
  protein: { type: Number, required: true },
  carbs: { type: Number, required: true },
  fats: { type: Number, required: true },
  calories: { type: Number, required: true },
}, { _id: false });

const MealSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  dietPreference: {
    type: String,
    enum: ["All", "Veg", "Non-Veg", "Vegan", "Custom"],
    required: true,
  },
  category: {
    type: String,
    enum: ["Breakfast", "Lunch", "Dinner"],
    required: true,
  },
  subProducts: [{ type: String }],
  nutritionalDetails: { type: NutritionalDetailsSchema, required: true },
  price: { type: Number, required: true },
  image: { type: String, required: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Meal', MealSchema);