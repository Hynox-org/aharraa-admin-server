const mongoose = require('mongoose');

const MenuItemSchema = new mongoose.Schema({
  day: { type: String, required: true, enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] },
  category: { type: String, required: true, enum: ['Breakfast', 'Lunch', 'Dinner'] },
  meal: { type: mongoose.Schema.Types.ObjectId, ref: 'Meal', required: true },
}, { _id: false });

const MenuSchema = new mongoose.Schema({
  name: { type: String, required: true },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  coverImage: { type: String, default: null },
  description: { type: String },
  perDayPrice: { type: Number, required: true },
  availableMealTimes: [{ type: String, enum: ['Breakfast', 'Lunch', 'Dinner'] }],
  price: {
    breakfast: { type: Number },
    lunch: { type: Number },
    dinner: { type: Number }
  },
  menuItems: [MenuItemSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Menu', MenuSchema);
