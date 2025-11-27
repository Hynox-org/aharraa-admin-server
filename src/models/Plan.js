const mongoose = require('mongoose');

const PlanSchema = new mongoose.Schema({
  name: { type: String, required: true },
  durationDays: { type: Number, required: true, enum: [3, 5, 7] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Plan', PlanSchema);