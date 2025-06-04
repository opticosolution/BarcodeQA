//barcode/barcodebackend/routes/generatedBarcodes.js
const express = require('express');
const router = express.Router();
const GeneratedBarcode = require('../models/GeneratedBarcode');
const authMiddleware = require('../middleware/auth');

// Utility function to generate random 5-character alphanumeric suffix
function generateRandomSuffix(length = 5) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ✅ GET all generated barcodes
router.get('/generated-barcodes', authMiddleware, async (req, res) => {
  try {
    const barcodes = await GeneratedBarcode.find();
    console.log('Fetched generated barcodes:', barcodes.length);
    res.json(barcodes);
  } catch (error) {
    console.error('Error fetching generated barcodes:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ GET barcodes by range ID
router.get('/range/:id', authMiddleware, async (req, res) => {
  try {
    const barcodes = await GeneratedBarcode.find({ rangeId: req.params.id });
    if (!barcodes || barcodes.length === 0) {
      return res.status(404).json({ message: 'No barcodes found for this range.' });
    }
    res.json(barcodes);
  } catch (err) {
    console.error('Error fetching range barcodes:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/range/:id', async (req, res) => {
  try {
    const rangeId = req.params.id;
    const barcodeRange = await GeneratedBarcode.findById(rangeId);

    if (!barcodeRange) {
      return res.status(404).json({ message: 'Barcode range not found' });
    }

    res.json(barcodeRange);
  } catch (error) {
    console.error('Error fetching barcode range:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ POST - Generate and save barcodes with suffix
router.post('/generated-barcodes', authMiddleware, async (req, res) => {
  try {
    const {
      prefix,
      startNumber,
      count,
      companyName,
      digitCount,
      points,
      mode,
      rangeId,
      adminId
    } = req.body;

    if (!startNumber || !count || !digitCount || isNaN(startNumber) || isNaN(count) || isNaN(digitCount) || parseInt(count) <= 0 || parseInt(digitCount) <= 0) {
      return res.status(400).json({ message: 'Invalid input parameters' });
    }

    const maxNumber = parseInt(startNumber) + parseInt(count) - 1;
    const minDigits = Math.ceil(Math.log10(maxNumber + 1));
    if (parseInt(digitCount) < minDigits) {
      return res.status(400).json({ message: `Digit count must be at least ${minDigits} for ${count} barcodes` });
    }

    if (!points || isNaN(points) || points <= 0) {
      return res.status(400).json({ message: 'Points must be a positive number' });
    }

    const barcodes = [];

    for (let i = 0; i < parseInt(count); i++) {
      const baseValue = `${prefix || ''}${(parseInt(startNumber) + i).toString().padStart(parseInt(digitCount), '0')}`;
      const suffix = generateRandomSuffix(5);
      const value = `${baseValue}-${suffix}`;

      barcodes.push({
        value,
        baseValue,
        suffix,
        rangeId,
        adminId,
        points: parseInt(points),
        companyName,
        mode
      });
    }

    await GeneratedBarcode.insertMany(barcodes);
    console.log('✅ Barcodes saved with suffix:', barcodes.length);
    res.status(201).json({ success: true, count: barcodes.length });
  } catch (error) {
    console.error('❌ Error generating barcodes:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
