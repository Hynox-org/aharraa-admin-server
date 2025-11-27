const mongoose = require('mongoose');

const AccompanimentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Accompaniment', AccompanimentSchema);