// barcode/barcodebackend/models/Barcode.js
// const mongoose = require('mongoose');

// const barcodeSchema = new mongoose.Schema({
//   value: { type: String, required: true, unique: true },
//   userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
//   location: { type: String },
//   pointsAwarded: { type: Number, default: 0 },
//   createdAt: { type: Date, default: Date.now },
// });

// module.exports = mongoose.model('Barcode', barcodeSchema);

// barcode/barcodebackend/models/Barcode.js
const mongoose = require('mongoose');

const BarcodeSchema = new mongoose.Schema({
  value: { type: String, unique: true, required: true }, // Full barcode, e.g., OPT100-1ad2m
  suffix: { type: String, required: function() { return this.isPreGenerated; } }, // 5-char alphanumeric suffix
  rangeId: { type: mongoose.Schema.Types.ObjectId, ref: 'BarcodeRange', required: function() { return this.isPreGenerated; } }, // Associated range
  isPreGenerated: { type: Boolean, default: false }, // Flag for pre-generated barcodes
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: function() { return !this.isPreGenerated; } }, // Required only for scanned barcodes
  pointsAwarded: { type: Number, required: function() { return !this.isPreGenerated; } }, // Required only for scanned barcodes
  createdAt: { type: Date, default: Date.now },
  location: String,
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
});

module.exports = mongoose.model('Barcode', BarcodeSchema);