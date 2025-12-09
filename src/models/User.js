const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String }, // Password will be handled by Supabase, not strictly required in MongoDB
  supabaseId: { type: String, unique: true, sparse: true }, // Supabase user ID
  fullName: { type: String },
  phoneNumber: { type: String },
  breakfastDeliveryLocation: {
    street: { type: String },
    state: { type: String },
    pincode: { type: String },
    lat: { type: Number },
    lon: { type: Number },
    deliveryAddressId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryAddress",
    },
    selectedTimeSlot: { type: String }, // e.g. "7:00 AM - 7:30 AM"
  },
  lunchDeliveryLocation: {
    street: { type: String },
    state: { type: String },
    pincode: { type: String },
    lat: { type: Number },
    lon: { type: Number },
    deliveryAddressId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryAddress",
    },
    selectedTimeSlot: { type: String }, // e.g. "12:00 PM - 12:30 PM"
  },
  dinnerDeliveryLocation: {
    street: { type: String },
    state: { type: String },
    pincode: { type: String },
    lat: { type: Number },
    lon: { type: Number },
    deliveryAddressId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryAddress",
    },
    selectedTimeSlot: { type: String }, // e.g. "7:00 PM - 7:30 PM"
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  role: { type: String, enum: ['user', 'admin', 'vendor'], default: 'user' },
  emailVerified: { type: Boolean, default: false }, // Add this
});

// Method to compare passwords (no longer needed as Supabase handles it)
// UserSchema.methods.comparePassword = async function (candidatePassword) {
//   return await bcrypt.compare(candidatePassword, this.password);
// };

module.exports = mongoose.model('User', UserSchema);
