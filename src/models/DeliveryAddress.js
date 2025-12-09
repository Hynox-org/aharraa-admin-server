const mongoose = require('mongoose');
const MealTimeWindowSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    preferredTimeSlot: { type: String, default: null }, // e.g. "7:00 AM - 9:00 AM"
    alternativeSlots: [{ type: String }] // optional extra slots
  },
  { _id: false }
);
const DeliveryAddressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  street: { type: String, required: true },
  city: { type: String, required: true },
  zip: { type: String, required: true },
  mealTimeWindows: {
      breakfast: { type: MealTimeWindowSchema, default: () => ({}) },
      lunch: { type: MealTimeWindowSchema, default: () => ({}) },
      dinner: { type: MealTimeWindowSchema, default: () => ({}) }
    },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DeliveryAddress', DeliveryAddressSchema);