//barcode/barcodebackend/models/GeneratedBarcode.js

const mongoose = require('mongoose');

const generatedBarcodeSchema = new mongoose.Schema({
  start: { type: String, required: true },
  end: { type: String, required: true },
  points: { type: Number, required: true },
  barcodes: { type: [String], required: true },
  companyName: { type: String },
  mode: { type: String, enum: ['with-outline', 'without-outline', 'only-outline'], default: 'with-outline' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('GeneratedBarcode', generatedBarcodeSchema);