const mongoose = require('mongoose');

const CartSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  items: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CartItem' }],
  totalItems: { type: Number, default: 0 },
  cartTotalPrice: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Cart', CartSchema);