const mongoose = require('mongoose');

const VendorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  email: { type: String },
  image: { type: String },
  rating: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  menus: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Menu' }],
  userId: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User'}]
});

module.exports = mongoose.model('Vendor', VendorSchema);