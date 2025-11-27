const mongoose = require('mongoose');

const DeliveryAddressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  street: { type: String, required: true },
  city: { type: String, required: true },
  zip: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DeliveryAddress', DeliveryAddressSchema);