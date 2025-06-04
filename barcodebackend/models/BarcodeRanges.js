//barcode/barcodebackend/models/BarcodeRanges.js

const mongoose = require('mongoose');

const barcodeRangeSchema = new mongoose.Schema({
  // CHANGED: Removed prefix field to support no-prefix barcodes
  startBarcode: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    match: /^[A-Z0-9]+$/,
  },
  endBarcode: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    match: /^[A-Z0-9]+$/,
  },
  pointsPerBarcode: {
    type: Number,
    required: true,
    min: 1,
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('BarcodeRange', barcodeRangeSchema);