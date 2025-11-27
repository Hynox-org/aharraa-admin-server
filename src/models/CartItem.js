const mongoose = require('mongoose');

const PersonDetailsSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phoneNumber: { type: String, required: true },
}, { _id: false });

const CartItemSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  menu: { type: mongoose.Schema.Types.ObjectId, ref: 'Menu', required: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
  quantity: { type: Number, required: true, default: 1 },
  personDetails: [{ type: PersonDetailsSchema }],
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  selectedMealTimes: [{ type: String, enum: ['Breakfast', 'Lunch', 'Dinner'] }],
  itemTotalPrice: { type: Number, required: true },
  addedDate: { type: Date, default: Date.now },
});

module.exports = mongoose.model('CartItem', CartItemSchema);
