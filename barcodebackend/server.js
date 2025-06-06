const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const dotenv = require('dotenv');
const { body, validationResult } = require('express-validator');
const { Parser } = require('json2csv');
const PDFDocument = require('pdfkit');
const bwipjs = require('bwip-js');
const { createCanvas } = require('canvas');
const { JSDOM } = require('jsdom');
const { jsPDF } = require('jspdf');
const bodyParser = require('body-parser');
const { Buffer } = require('buffer');
// const BarcodeRange = require('./models/BarcodeRanges'); 
// const PreGeneratedBarcode = require('./models/Barcode');

// Load environment variables
dotenv.config();

const app = express();

// Middleware to parse JSON and handle CORS
app.use(express.json());
app.use(
  cors({
    origin: ['http://localhost:8081', 'http://localhost:19006', 'http://localhost:3000'],
    credentials: true,
  })
);

app.use(bodyParser.json({ limit: '10mb' }));
// mongodb+srv://balmukundoptico:lets12help@job-connector.exb7v.mongodb.net/barcodeDemo
app.use('/barcodes', require('./routes/generatedBarcodes'));
mongoose.connect('mongodb+srv://Optico:optico2025@barcode.p15eoss.mongodb.net/BarcodeQA', {
  // mongoose.connect('mongodb://localhost:27017/barcodeDemo', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// MongoDB schemas
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  mobile: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  plainPassword: { type: String, select: false },
  role: { type: String, enum: ['user', 'admin', 'superadmin'], default: 'user' },
  status: { type: String, enum: ['pending', 'approved', 'disapproved'], default: 'pending' },
  points: { type: Number, default: 0 },
  location: String,
  uniqueCode: {
    type: String,
    unique: true,
    sparse: true,
    required: function () {
      return this.role === 'admin' || this.role === 'superadmin';
    },
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function () {
      return this.role === 'user';
    },
  },
  userLimit: { type: Number, default: null },
});

const BarcodeSchema = new mongoose.Schema({
  value: { type: String, unique: true, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  pointsAwarded: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
  location: String,
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
});

const SettingSchema = new mongoose.Schema({
  key: { type: String, required: true },
  value: mongoose.Schema.Types.Mixed,
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { unique: true });

const BarcodeRangeSchema = new mongoose.Schema({
  start: { type: String, required: true },
  end: { type: String, required: true },
  points: { type: Number, required: true, min: 0 },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
});

const PreGeneratedBarcodeSchema = new mongoose.Schema({
  value: { type: String, unique: true, required: true },
  baseValue: { type: String, required: true },
  suffix: { type: String, required: true },
  rangeId: { type: mongoose.Schema.Types.ObjectId, ref: 'BarcodeRange', required: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  points: { type: Number, required: true },
});

// MongoDB models
const User = mongoose.model('User', UserSchema);
const Barcode = mongoose.model('Barcode', BarcodeSchema);
const Setting = mongoose.model('Setting', SettingSchema);
const BarcodeRange = mongoose.model('BarcodeRange', BarcodeRangeSchema);
const PreGeneratedBarcode = mongoose.model('PreGeneratedBarcode', PreGeneratedBarcodeSchema);

// Generate unique code
const generateUniqueCode = async (name, role) => {
  if (!['user', 'admin', 'superadmin'].includes(role)) return null;
  const base = name.toLowerCase().replace(/\s+/g, '');
  let code, count = 1;
  do {
    code = `${base}-${String(count).padStart(3, '0')}`;
    count++;
  } while (await User.findOne({ uniqueCode: code }));
  return code;
};

// Generate random 5-character alphanumeric suffix
const generateRandomSuffix = () => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffix = '';
  for (let i = 0; i < 5; i++) {
    suffix += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return suffix;
};

// Setup super admin
// Setup super admin
const setupSuperAdmin = async () => {
  try {
    const superAdmin = await User.findOne({ role: 'superadmin' });
    if (!superAdmin) {
      const plainPassword = 'Krishnabmk@123';
      const hashedPassword = await bcrypt.hash(plainPassword, 10);
      const uniqueCode = 'SUPERADMINBMKDEMO';
      await User.create({
        name: 'Krishna BMK',
        mobile: '7000534581',
        password: hashedPassword,
        plainPassword,
        role: 'superadmin',
        status: 'approved',
        uniqueCode,
        adminId: null,
      });
      console.log('Super Admin created');
    }
  } catch (error) {
    console.error('Error setting up super admin:', error);
  }
};
setupSuperAdmin();


// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ message: 'No token provided' });
  try {
    const decoded = jwt.verify(authHeader, process.env.JWT_SECRET || 'your_jwt_secret_key');
    req.user = await User.findById(decoded.userId);
    if (!req.user) return res.status(401).json({ message: 'User not found' });
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// Middleware to check roles
const checkRole = (roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: `${roles.join(' or ')} access required` });
  }
  next();
};

// Input validation for registration
const validateRegister = [
  body('name').notEmpty().withMessage('Name is required'),
  body('mobile').isMobilePhone().withMessage('Valid mobile number is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('adminId')
    .if(body('role').equals('user'))
    .notEmpty()
    .withMessage('Admin ID is required for users'),
];

// Input validation for login
const validateLogin = [
  body('mobile').isMobilePhone().withMessage('Valid mobile number is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Register a new user
app.post('/register', validateRegister, handleValidationErrors, async (req, res) => {
  try {
    const { name, mobile, password, location, adminId, role } = req.body;
    const existingUser = await User.findOne({ mobile });
    if (existingUser) {
      return res.status(400).json({ message: 'Mobile number already registered' });
    }

    if (role === 'user' && adminId) {
      const admin = await User.findOne({ _id: adminId, role: 'admin', status: 'approved' });
      if (!admin) {
        return res.status(400).json({ message: 'Invalid or unapproved admin selected' });
      }
      if (admin.userLimit && (await User.countDocuments({ adminId })) >= admin.userLimit) {
        return res.status(400).json({ message: 'Admin user limit reached' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const uniqueCode = await generateUniqueCode(name, role || 'user');

    if (role === 'superadmin') {
      return res.status(403).json({ message: 'Cannot create superadmin through this endpoint' });
    }

    const user = new User({
      name,
      mobile,
      password: hashedPassword,
      plainPassword: password,
      location,
      status: role === 'admin' ? 'pending' : 'pending',
      role: role || 'user',
      uniqueCode,
      adminId: role === 'user' ? adminId : null,
    });

    await user.save();
    res.status(201).json({
      message: 'User registered successfully',
      status: user.status,
      requiresApproval: user.status === 'pending',
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// Log in a user
app.post('/login', validateLogin, handleValidationErrors, async (req, res) => {
  try {
    const { mobile, password } = req.body;
    const user = await User.findOne({ mobile });
    if (!user) {
      return res.status(400).json({ message: 'Invalid mobile number or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid mobile number or password' });
    }

    if (user.status !== 'approved') {
      return res.status(403).json({
        message: user.status === 'pending'
          ? 'Account pending approval. Please contact your administrator.'
          : 'Account has been disapproved',
        status: user.status,
        requiresApproval: true,
      });
    }

    const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET || 'your_jwt_secret_key');

    res.json({
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        mobile: user.mobile,
        role: user.role,
        status: user.status,
        uniqueCode: user.uniqueCode,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

app.post('/generate-pdf', authenticateToken, async (req, res) => {
  console.log('PDF generation request received');
  try {
    const { barcodeSettings, useAdminRanges, selectedRangeId } = req.body;

    let barcodeData = [];
    let prefix = barcodeSettings.prefix;
    let companyName = barcodeSettings.companyName || 'Default Company';
    let pdfMode = barcodeSettings.mode;

    if (useAdminRanges && selectedRangeId) {
      const range = await BarcodeRange.findById(selectedRangeId);
      if (!range) return res.status(400).json({ message: "Invalid range ID" });

      const barcodes = await PreGeneratedBarcode.find({ rangeId: selectedRangeId });

      if (!barcodes || barcodes.length === 0) {
        return res.status(400).json({ message: "No barcodes found for selected range" });
      }

      barcodeData = barcodes.map(b => ({
        value: b.value,
        points: b.points,
      }));
      prefix = range.start.match(/^[A-Z]+/)?.[0] || 'OPT';
    } else {
      const { startNumber, count, digitCount, pointsPerScan } = barcodeSettings;
      const points = parseInt(pointsPerScan) || 50;

      if (!prefix || !startNumber || !count || !digitCount || isNaN(startNumber) || isNaN(count) || isNaN(digitCount)) {
        return res.status(400).json({ message: 'Invalid barcode settings input.' });
      }

      const maxNumber = parseInt(startNumber) + parseInt(count) - 1;
      const minDigits = Math.ceil(Math.log10(maxNumber + 1));
      if (parseInt(digitCount) < minDigits) {
        return res.status(400).json({ message: `Digit count must be at least ${minDigits} for ${count} barcodes` });
      }

      for (let i = 0; i < parseInt(count); i++) {
        barcodeData.push({
          value: `${prefix}${(parseInt(startNumber) + i).toString().padStart(parseInt(digitCount), '0')}`,
          points,
        });
      }
    }

    const doc = new jsPDF({ unit: 'mm', format: [330.2, 482.6], compress: true });
    const cols = 7;
    const rows = 28;
    const layoutWidth = 286;
    const layoutHeight = 451.57;
    const marginX = (330.2 - layoutWidth) / 2;
    const marginY = (482.6 - layoutHeight) / 2;

    const boxWidth = layoutWidth / cols;
    const boxHeight = layoutHeight / rows;
    const barcodeWidth = boxWidth - 8;
    const barcodeHeight = 6;
    const companyFontSize = 5;
    const barcodeFontSize = 5;
    const pointsFontSize = 4;

    let x = marginX;
    let y = marginY;

    for (let i = 0; i < barcodeData.length; i++) {
      const barcodeValue = barcodeData[i].value;
      let imgData = null;

      if (pdfMode !== 'only-outline') {
        const pngBuffer = await bwipjs.toBuffer({
          bcid: 'code128',
          text: barcodeValue,
          scale: 1,
          height: barcodeHeight,
          includetext: false,
        });
        imgData = `data:image/png;base64,${pngBuffer.toString('base64')}`;
      }

      if (pdfMode !== 'without-outline') {
        doc.setDrawColor(0);
        doc.setLineWidth(0.2);
        doc.setFillColor(255, 255, 255);
        doc.rect(x + 0.5, y + 0.5, boxWidth - 1, boxHeight - 1, 'FD');
      }

      if (pdfMode !== 'only-outline') {
        if (companyName) {
          doc.setFontSize(companyFontSize);
          doc.setFont('helvetica', 'bold');
          const textWidth = doc.getTextWidth(companyName);
          doc.text(companyName, x + (boxWidth - textWidth) / 2, y + 4.2);
        }

        const barcodeX = x + (boxWidth - barcodeWidth) / 2;
        const barcodeY = y + 5.5;
        if (imgData) {
          doc.addImage(imgData, 'PNG', barcodeX, barcodeY, barcodeWidth, barcodeHeight);
        }

        doc.setFontSize(barcodeFontSize);
        doc.setFont('helvetica', 'normal');
        const valTextWidth = doc.getTextWidth(barcodeValue);
        doc.text(barcodeValue, x + (boxWidth - valTextWidth) / 2, barcodeY + barcodeHeight + 3);

        // Optional points rendering
        // doc.setFontSize(pointsFontSize);
        // const pointsText = `Points: ${barcodeData[i].points}`;
        // const pointsTextWidth = doc.getTextWidth(pointsText);
        // doc.text(pointsText, x + (boxWidth - pointsTextWidth) / 2, barcodeY + barcodeHeight + 6);
      }

      x += boxWidth;
      if ((i + 1) % cols === 0) {
        x = marginX;
        y += boxHeight;
      }

      if ((i + 1) % (cols * rows) === 0 && i + 1 < barcodeData.length) {
        doc.addPage();
        x = marginX;
        y = marginY;
      }
    }

    const pdfBase64 = doc.output('datauristring').split(',')[1];
    res.status(200).json({ pdf: pdfBase64 });

  } catch (err) {
    console.error('PDF Generation Error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});


// Get all admins
app.get('/admins', async (req, res) => {
  try {
    let isSuperAdmin = false;
    const authHeader = req.headers['authorization'];
    if (authHeader) {
      try {
        const decoded = jwt.verify(authHeader, process.env.JWT_SECRET || 'your_jwt_secret_key');
        const user = await User.findById(decoded.userId);
        if (user && user.role === 'superadmin') {
          isSuperAdmin = true;
        }
      } catch (error) {
        console.log('Invalid or expired token, proceeding as public request');
      }
    }

    const admins = await User.find(
      { role: 'admin' },
      isSuperAdmin ? 'name mobile uniqueCode status createdAt _id userLimit' : 'name mobile uniqueCode _id'
    ).where(isSuperAdmin ? {} : { status: 'approved' });

    res.json(admins);
  } catch (error) {
    console.error('Error fetching admins:', error);
    res.status(500).json({ message: 'Server error fetching admins' });
  }
});

// Get pending admins (superadmin only)
app.get('/admins/pending', authenticateToken, checkRole(['superadmin']), async (req, res) => {
  try {
    const admins = await User.find({ role: 'admin', status: 'pending' }, 'name mobile uniqueCode createdAt');
    res.json(admins);
  } catch (error) {
    console.error('Error fetching pending admins:', error);
    res.status(500).json({ message: 'Server error fetching pending admins' });
  }
});

// Approve/disapprove admin (superadmin only)
app.put('/admins/:id/status', authenticateToken, checkRole(['superadmin']), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved', 'disapproved'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const admin = await User.findOne({ _id: req.params.id, role: 'admin' });
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    admin.status = status;
    await admin.save();

    res.json({
      message: `Admin ${status} successfully`,
      admin: {
        id: admin._id,
        name: admin.name,
        mobile: admin.mobile,
        status: admin.status,
      },
    });
  } catch (error) {
    console.error('Error updating admin status:', error);
    res.status(500).json({ message: 'Server error updating admin status' });
  }
});

// Update admin user limit (superadmin only)
app.put('/admins/:id/user-limit', authenticateToken, checkRole(['superadmin']), async (req, res) => {
  try {
    const { userLimit } = req.body;
    if (!Number.isInteger(userLimit) || userLimit < 0) {
      return res.status(400).json({ message: 'Invalid user limit' });
    }

    const admin = await User.findOne({ _id: req.params.id, role: 'admin' });
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    admin.userLimit = userLimit;
    await admin.save();

    res.json({
      message: 'User limit updated successfully',
      admin: {
        id: admin._id,
        name: admin.name,
        userLimit: admin.userLimit,
      },
    });
  } catch (error) {
    console.error('Error updating user limit:', error);
    res.status(500).json({ message: 'Server error updating user limit' });
  }
});

// Get admin password (superadmin only)
app.get('/admins/:id/password', authenticateToken, checkRole(['superadmin']), async (req, res) => {
  try {
    const admin = await User.findById(req.params.id).select('+plainPassword');
    if (!admin || admin.role !== 'admin') {
      return res.status(404).json({ message: 'Admin not found' });
    }

    if (!admin.plainPassword) {
      return res.status(400).json({ message: 'Plain password not available' });
    }

    res.json({ password: admin.plainPassword });
  } catch (error) {
    console.error('Error fetching admin password:', error);
    res.status(500).json({ message: 'Server error fetching admin password' });
  }
});

// Get all users (admin or superadmin only)
app.get('/users', authenticateToken, async (req, res) => {
  try {
    let users;
    if (req.user.role === 'superadmin') {
      users = await User.find({ role: 'user' }).select('-password');
    } else if (req.user.role === 'admin') {
      users = await User.find({ adminId: req.user._id, role: 'user' }).select('-password');
    } else {
      return res.status(403).json({ message: 'Admin or Super Admin access required' });
    }
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Server error fetching users' });
  }
});

// Get a single user by ID
app.get('/users/:id', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (
      req.user._id.toString() !== req.params.id &&
      req.user.role !== 'superadmin' &&
      (req.user.role !== 'admin' || user.adminId.toString() !== req.user._id.toString())
    ) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Server error fetching user' });
  }
});

// Get user password (admin or superadmin)
app.get('/users/:id/password', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('+plainPassword');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (req.user.role === 'admin' && user.adminId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (user.role === 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ message: 'Only superadmins can view admin passwords' });
    }

    if (!user.plainPassword) {
      return res.status(400).json({ message: 'Plain password not available' });
    }

    res.json({ password: user.plainPassword });
  } catch (error) {
    console.error('Error fetching user password:', error);
    res.status(500).json({ message: 'Server error fetching user password' });
  }
});

// Update user status
app.put('/users/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status, adminId } = req.body;
    if (!['approved', 'disapproved'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (req.user.role === 'admin' && user.adminId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (req.user.role === 'admin' && (user.role === 'admin' || user.role === 'superadmin')) {
      return res.status(403).json({ message: 'Cannot modify status of admins' });
    }

    user.status = status;
    if (adminId && status === 'approved' && user.role === 'user') {
      const admin = await User.findOne({ _id: adminId, role: 'admin', status: 'approved' });
      if (!admin) {
        return res.status(400).json({ message: 'Invalid or unapproved admin selected' });
      }
      user.adminId = adminId;
    }

    await user.save();

    res.json({
      message: `User ${status} successfully`,
      user: {
        id: user._id,
        name: user.name,
        status: user.status,
      },
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ message: 'Server error updating user status' });
  }
});

// Update user details
app.put('/users/:id', authenticateToken, async (req, res) => {
  try {
    const { name, mobile, location, points } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (req.user.role === 'admin' && user.adminId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (req.user.role === 'admin' && (user.role === 'admin' || user.role === 'superadmin')) {
      return res.status(403).json({ message: 'Cannot modify admins' });
    }

    if (mobile && mobile !== user.mobile) {
      const existingUser = await User.findOne({ mobile });
      if (existingUser) {
        return res.status(400).json({ message: 'Mobile number already registered' });
      }
    }

    user.name = name || user.name;
    user.mobile = mobile || user.mobile;
    user.location = location || user.location;
    user.points = points !== undefined ? points : user.points;
    await user.save();

    res.json({
      message: 'User updated successfully',
      user: {
        id: user._id,
        name: user.name,
        mobile: user.mobile,
        location: user.location,
        points: user.points,
      },
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Server error updating user' });
  }
});

// Delete a user
app.delete('/users/:id', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (req.user.role === 'admin' && user.adminId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (req.user.role === 'admin' && (user.role === 'admin' || user.role === 'superadmin')) {
      return res.status(403).json({ message: 'Cannot delete admins' });
    }

    await Barcode.deleteMany({ userId: req.params.id });
    await User.findByIdAndDelete(req.params.id);

    res.json({
      message: 'User and associated barcodes deleted',
      deletedUser: {
        id: user._id,
        name: user.name,
        mobile: user.mobile,
      },
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Server error deleting user' });
  }
});

// Reset user points
app.put('/users/:id/reset-points', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (req.user.role === 'admin' && user.adminId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (req.user.role === 'admin' && (user.role === 'admin' || user.role === 'superadmin')) {
      return res.status(403).json({ message: 'Cannot reset points for admins' });
    }

    user.points = 0;
    await user.save();

    res.json({
      message: 'Points reset successfully',
      user: {
        id: user._id,
        name: user.name,
        points: user.points,
      },
    });
  } catch (error) {
    console.error('Error resetting points:', error);
    res.status(500).json({ message: 'Server error resetting points' });
  }
});

// Create a new barcode
app.post('/barcodes', authenticateToken, checkRole(['user']), async (req, res) => {
  try {
    const { value, location } = req.body;
    if (!value || !/^[A-Z0-9-]+$/.test(value)) {
      return res.status(400).json({ message: 'Invalid barcode value (alphanumeric with suffix)' });
    }

    if (req.user.status !== 'approved') {
      return res.status(403).json({
        message: 'Your account is not approved to perform this action',
        status: req.user.status,
      });
    }

    const user = await User.findById(req.user._id);
    if (!user || !user.adminId) {
      return res.status(400).json({ message: 'User not assigned to an admin or not found' });
    }

    const existingBarcode = await Barcode.findOne({ value });
    if (existingBarcode) {
      return res.status(400).json({
        message: 'Barcode already scanned dear',
        scannedBy: existingBarcode.userId,
      });
    }

    let points = 50;
    try {
      const preGeneratedBarcode = await PreGeneratedBarcode.findOne({ value, adminId: user.adminId });
      if (!preGeneratedBarcode) {
        return res.status(400).json({
          message: 'barcode not found',
        });
      }
      points = preGeneratedBarcode.points || 50;
    } catch (dbError) {
      console.error('Database error during barcode validation:', dbError);
      return res.status(500).json({ message: 'Error validating barcode' });
    }

    const barcode = new Barcode({
      value,
      userId: req.user._id,
      pointsAwarded: points,
      location,
      adminId: user.adminId,
    });

    await barcode.save();
    user.points = (user.points || 0) + points;
    await user.save();

    res.status(201).json({
      message: 'Barcode scanned successfully',
      pointsAwarded: points,
      totalPoints: user.points,
      barcode: {
        value,
        location,
        scannedAt: barcode.createdAt,
      },
    });
  } catch (error) {
    console.error('Error scanning barcode:', error);
    res.status(500).json({ message: 'Server error scanning barcode' });
  }
});

// Get all barcodes
app.get('/barcodes', authenticateToken, async (req, res) => {
  try {
    let barcodes;
    if (req.user.role === 'superadmin') {
      barcodes = await Barcode.find().populate('userId', 'name mobile');
    } else if (req.user.role === 'admin') {
      barcodes = await Barcode.find({ adminId: req.user._id }).populate('userId', 'name mobile');
    } else {
      return res.status(403).json({ message: 'Admin or Super Admin access required' });
    }
    res.json(barcodes);
  } catch (error) {
    console.error('Error fetching barcodes:', error);
    res.status(500).json({ message: 'Server error fetching barcodes' });
  }
});

// Get barcodes for a specific user
app.get('/barcodes/user/:userId', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (
      req.user._id.toString() !== req.params.userId &&
      req.user.role !== 'superadmin' &&
      (req.user.role !== 'admin' || user.adminId.toString() !== req.user._id.toString())
    ) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const barcodes = await Barcode.find({ userId: req.params.userId }).populate('userId', 'name mobile');

    res.json({
      user: {
        id: user._id,
        name: user.name,
        points: user.points,
      },
      barcodes: barcodes.map((b) => ({
        _id: b._id, // Include _id for key in frontend
        value: b.value,
        points: b.pointsAwarded,
        scannedAt: b.createdAt,
        location: b.location,
        userId: {
          _id: b.userId?._id,
          name: b.userId?.name,
          mobile: b.userId?.mobile,
        },
      })),
      totalBarcodes: barcodes.length,
      totalPoints: barcodes.reduce((sum, b) => sum + b.pointsAwarded, 0),
    });
  } catch (error) {
    console.error('Error fetching user barcodes:', error);
    res.status(500).json({ message: 'Server error fetching user barcodes' });
  }
});

// Delete a barcode
app.delete('/barcodes/:id', authenticateToken, async (req, res) => {
  try {
    const barcode = await Barcode.findById(req.params.id);
    if (!barcode) {
      return res.status(404).json({ message: 'Barcode not found' });
    }

    if (req.user.role === 'admin' && barcode.adminId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const user = await User.findById(barcode.userId);
    if (user) {
      user.points = Math.max(0, user.points - barcode.pointsAwarded);
      await user.save();
    }

    await Barcode.findByIdAndDelete(req.params.id);

    res.json({
      message: 'Barcode deleted successfully',
      pointsDeducted: barcode.pointsAwarded,
      user: user
        ? {
            id: user._id,
            name: user.name,
            newPoints: user.points,
          }
        : null,
    });
  } catch (error) {
    console.error('Error deleting barcode:', error);
    res.status(500).json({ message: 'Server error deleting barcode' });
  }
});

// Delete all barcodes
app.delete('/barcodes', authenticateToken, async (req, res) => {
  try {
    let barcodes;
    if (req.user.role === 'superadmin') {
      barcodes = await Barcode.find();
    } else if (req.user.role === 'admin') {
      barcodes = await Barcode.find({ adminId: req.user._id });
    } else {
      return res.status(403).json({ message: 'Admin or Super Admin access required' });
    }

    for (const barcode of barcodes) {
      const user = await User.findById(barcode.userId);
      if (user) {
        user.points = Math.max(0, user.points - barcode.pointsAwarded);
        await user.save();
      }
    }

    const totalDeleted = barcodes.length;
    if (req.user.role === 'superadmin') {
      await Barcode.deleteMany({});
    } else {
      await Barcode.deleteMany({ adminId: req.user._id });
    }

    res.json({
      message: 'All barcodes deleted successfully',
      totalDeleted,
    });
  } catch (error) {
    console.error('Error deleting all barcodes:', error);
    res.status(500).json({ message: 'Server error deleting all barcodes' });
  }
});

// Export barcodes as CSV
app.get('/export-barcodes', authenticateToken, async (req, res) => {
  try {
    let barcodes;
    if (req.user.role === 'superadmin') {
      barcodes = await Barcode.find().populate('userId', 'name mobile');
    } else if (req.user.role === 'admin') {
      barcodes = await Barcode.find({ adminId: req.user._id }).populate('userId', 'name mobile');
    } else {
      return res.status(403).json({ message: 'Admin or Super Admin access required' });
    }

    const fields = [
      { label: 'Barcode Value', value: 'value' },
      { label: 'User Name', value: 'userId.name' },
      { label: 'User Mobile', value: 'userId.mobile' },
      { label: 'Points Awarded', value: 'pointsAwarded' },
      { label: 'Scan Date', value: 'createdAt' },
      { label: 'User Location', value: 'location' },
    ];

    const json2csv = new Parser({ fields });
    const csv = json2csv.parse(barcodes);
    res.header('Content-Type', 'text/csv');
    res.attachment('barcodes_export.csv');
    res.send(csv);
  } catch (error) {
    console.error('Error exporting barcodes:', error);
    res.status(500).json({ message: 'Server error exporting barcodes' });
  }
});

// Get all barcode ranges
app.get('/barcode-ranges', authenticateToken, checkRole(['admin', 'superadmin']), async (req, res) => {
  try {
    let ranges;
    if (req.user.role === 'superadmin') {
      ranges = await BarcodeRange.find().populate('adminId', 'name');
    } else {
      ranges = await BarcodeRange.find({ adminId: req.user._id });
    }
    res.json(ranges);
  } catch (error) {
    console.error('Error fetching barcode ranges:', error);
    res.status(500).json({ message: 'Server error fetching barcode ranges' });
  }
});

// Create a barcode range
app.post('/barcode-ranges', authenticateToken, checkRole(['admin', 'superadmin']), async (req, res) => {
  try {
    const { start, end, points } = req.body;

    if (!start || !end || points === undefined) {
      return res.status(400).json({ message: 'Start, end, and points are required' });
    }
    if (!/^[A-Z0-9]+$/.test(start) || !/^[A-Z0-9]+$/.test(end)) {
      return res.status(400).json({ message: 'Barcodes must be alphanumeric' });
    }
    if (!Number.isInteger(points) || points < 0) {
      return res.status(400).json({ message: 'Points must be a non-negative integer' });
    }

    const startMatch = start.match(/^(.*?)(\d+)$/);
    if (!startMatch) {
      return res.status(400).json({ message: 'Unable to parse start barcode format' });
    }

    const prefix = startMatch[1];       // e.g., "OPT1LA"
    const startDigits = startMatch[2];  // e.g., "001"
    const startNum = parseInt(startDigits, 10);
    const startNumLength = startDigits.length;

    const endMatch = end.match(/(\d+)$/);
    if (!endMatch) {
      return res.status(400).json({ message: 'Unable to parse end barcode format' });
    }
    const endNum = parseInt(endMatch[1], 10);

    if (startNum > endNum) {
      return res.status(400).json({ message: 'End barcode must be greater than or equal to start barcode' });
    }

    const range = new BarcodeRange({
      start,
      end,
      points,
      adminId: req.user._id,
    });

    await range.save();

    const baseValues = [];
    for (let num = startNum; num <= endNum; num++) {
      const numStr = num.toString().padStart(startNumLength, '0');
      baseValues.push(`${prefix}${numStr}`);
    }

    const barcodes = [];
    const existingValues = new Set();
    const generatedValues = new Set();

    // Query existing barcodes for this range to avoid duplicates
    const existing = await PreGeneratedBarcode.find({
      baseValue: { $in: baseValues },
    }).select('value');

    existing.forEach((b) => existingValues.add(b.value));

    for (const baseValue of baseValues) {
      let fullValue, suffix;
      let attempts = 0;

      do {
        suffix = generateRandomSuffix(); // e.g., "A1B2C"
        fullValue = `${baseValue}-${suffix}`;
        attempts++;
      } while (
        (existingValues.has(fullValue) || generatedValues.has(fullValue)) &&
        attempts < 10
      );

      if (attempts >= 10) {
        console.warn(`Skipping ${baseValue}: could not generate unique suffix`);
        continue;
      }

      generatedValues.add(fullValue);
      barcodes.push({
        value: fullValue,
        baseValue,
        suffix,
        rangeId: range._id,
        adminId: req.user._id,
        points,
      });
    }

    await PreGeneratedBarcode.insertMany(barcodes, { ordered: false });

    res.status(201).json({
      message: 'Barcode range created successfully with pre-generated barcodes',
      barcodeRange: range,
      barcodeCount: barcodes.length,
    });
  } catch (error) {
    console.error('Error creating barcode range:', error);
    res.status(500).json({ message: 'Server error creating barcode range' });
  }
});






// Update a barcode range
app.put('/barcode-ranges/:id', authenticateToken, checkRole(['admin', 'superadmin']), async (req, res) => {
  try {
    const { start, end, points } = req.body;
    const range = await BarcodeRange.findById(req.params.id);
    if (!range || range.adminId.toString() !== req.user._id.toString()) {
      return res.status(404).json({ message: 'Range not found or access denied' });
    }

    if (start && !/^[A-Z0-9]+$/.test(start)) {
      return res.status(400).json({ message: 'Start barcode must be alphanumeric' });
    }
    if (end && !/^[A-Z0-9]+$/.test(end)) {
      return res.status(400).json({ message: 'End barcode must be alphanumeric' });
    }
    if (start && end && start > end) {
      return res.status(400).json({ message: 'End barcode must be greater than or equal to start barcode' });
    }
    if (points !== undefined && (!Number.isInteger(points) || points < 0)) {
      return res.status(400).json({ message: 'Points must be a non-negative integer' });
    }

    // Delete existing pre-generated barcodes if range changes
    if (start || end) {
      await PreGeneratedBarcode.deleteMany({ rangeId: range._id });
      const newStart = start || range.start;
      const newEnd = end || range.end;
      const newPoints = points !== undefined ? points : range.points;

      const barcodes = [];
      let current = newStart;
      while (current <= newEnd) {
        let suffix;
        let fullValue;
        do {
          suffix = generateRandomSuffix();
          fullValue = `${current}-${suffix}`;
        } while (await PreGeneratedBarcode.findOne({ value: fullValue }));
        
        barcodes.push({
          value: fullValue,
          baseValue: current,
          suffix,
          rangeId: range._id,
          adminId: req.user._id,
          points: newPoints,
        });
        
        const prefix = current.match(/^[A-Z]+/)?.[0] || '';
        const number = parseInt(current.match(/\d+$/)?.[0] || '0');
        current = `${prefix}${number + 1}`;
      }
      await PreGeneratedBarcode.insertMany(barcodes);
    } else if (points !== undefined) {
      await PreGeneratedBarcode.updateMany({ rangeId: range._id }, { points });
    }

    range.start = start || range.start;
    range.end = end || range.end;
    range.points = points !== undefined ? points : range.points;

    await range.save();
    res.json({
      message: 'Barcode range updated successfully',
      barcodeRange: range,
    });
  } catch (error) {
    console.error('Error updating barcode range:', error);
    res.status(500).json({ message: 'Server error updating barcode range' });
  }
});

// Delete a barcode range
app.delete('/barcode-ranges/:id', authenticateToken, checkRole(['admin', 'superadmin']), async (req, res) => {
  try {
    const range = await BarcodeRange.findById(req.params.id);
    if (!range || range.adminId.toString() !== req.user._id.toString()) {
      return res.status(404).json({ message: 'Range not found or access denied' });
    }

    await PreGeneratedBarcode.deleteMany({ rangeId: range._id });
    await range.deleteOne();
    res.json({ message: 'Barcode range and associated barcodes deleted successfully' });
  } catch (error) {
    console.error('Error deleting barcode range:', error);
    res.status(500).json({ message: 'Server error deleting barcode range' });
  }
});

// Get pre-generated barcodes for a range
app.get('/pregenerated-barcodes/:rangeId', authenticateToken, checkRole(['superadmin']), async (req, res) => {
  try {
    const range = await BarcodeRange.findById(req.params.rangeId);
    if (!range) {
      return res.status(404).json({ message: 'Barcode range not found' });
    }

    const barcodes = await PreGeneratedBarcode.find({ rangeId: req.params.rangeId });
    res.json({
      range,
      barcodes,
      total: barcodes.length,
    });
  } catch (error) {
    console.error('Error fetching pre-generated barcodes:', error);
    res.status(500).json({ message: 'Server error fetching pre-generated barcodes' });
  }
});


// Generate barcode PDF
app.post('/generate-barcode-pdf', authenticateToken, checkRole(['superadmin']), async (req, res) => {
  try {
    const { rangeId, start, end, prefix } = req.body;
    let barcodes = [];

    if (rangeId) {
      // ✅ Load pre-generated from DB
      const preGeneratedBarcodes = await PreGeneratedBarcode.find({ rangeId });
      if (!preGeneratedBarcodes.length) {
        return res.status(400).json({ message: 'No barcodes found for this range' });
      }

      barcodes = preGeneratedBarcodes.map(b => ({
        value: b.value,
        points: b.points || 0,
      }));
    } else if (start && end && prefix) {
      // ✅ Temporary barcodes (no suffix, not stored)
      let current = parseInt(start);
      const stop = parseInt(end);
      if (isNaN(current) || isNaN(stop) || current > stop) {
        return res.status(400).json({ message: 'Invalid start or end values' });
      }

      while (current <= stop) {
        barcodes.push({
          value: `${prefix}${current}`,
          points: 50,
        });
        current++;
      }
    } else {
      return res.status(400).json({ message: 'Provide either rangeId or start/end/prefix' });
    }

    // ✅ Setup PDF
    const PDFDocument = require('pdfkit');
    const bwipjs = require('bwip-js');
    const doc = new PDFDocument({ size: 'A4', margin: 20 });
    const buffers = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=barcodes.pdf');
      res.send(pdfData);
    });

    // ✅ Layout config
    const cols = 4;
    const rows = 10;
    const boxWidth = 130;
    const boxHeight = 100;
    const padding = 15;

    let x = doc.page.margins.left;
    let y = doc.page.margins.top;
    let count = 0;

    for (const barcode of barcodes) {
      const pngBuffer = await bwipjs.toBuffer({
        bcid: 'code128',
        text: barcode.value,
        scale: 1,
        height: 20,
        includetext: false,
      });

      doc.rect(x, y, boxWidth, boxHeight).stroke();
      doc.image(pngBuffer, x + 15, y + 10, { width: boxWidth - 30 });
      doc.fontSize(10).text(barcode.value, x + 10, y + 40, { width: boxWidth - 20, align: 'center' });
      doc.fontSize(9).text(`Points: ${barcode.points}`, x + 10, y + 60, { align: 'center' });

      count++;
      x += boxWidth + padding;
      if (count % cols === 0) {
        x = doc.page.margins.left;
        y += boxHeight + padding;
      }
      if (count % (cols * rows) === 0 && count < barcodes.length) {
        doc.addPage();
        x = doc.page.margins.left;
        y = doc.page.margins.top;
      }
    }

    doc.end();
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ message: 'Server error generating PDF' });
  }
});


// Get points per scan setting
app.get('/settings/points-per-scan', authenticateToken, async (req, res) => {
  try {
    let setting;
    if (req.user.role === 'superadmin') {
      setting = await Setting.findOne({ key: 'pointsPerScan', adminId: null });
    } else if (req.user.role === 'admin') {
      setting = await Setting.findOne({ key: 'pointsPerScan', adminId: req.user._id });
    } else {
      setting = await Setting.findOne({ key: 'pointsPerScan', adminId: req.user.adminId });
    }

    res.json({
      points: setting ? setting.value : 50,
      isDefault: !setting,
      setBy: setting ? (setting.adminId ? 'your admin' : 'superadmin') : 'system default',
    });
  } catch (error) {
    console.error('Error fetching points setting:', error);
    res.status(500).json({ message: 'Server error fetching points setting' });
  }
});

// Update points per scan setting
app.put('/settings/points-per-scan', authenticateToken, checkRole(['admin', 'superadmin']), async (req, res) => {
  try {
    const { points } = req.body;
    if (!Number.isInteger(points) || points < 0) {
      return res.status(400).json({ message: 'Points must be a non-negative integer' });
    }

    const adminId = req.user.role === 'superadmin' ? null : req.user._id;

    await Setting.findOneAndUpdate(
      { key: 'pointsPerScan', adminId },
      { key: 'pointsPerScan', value: points, adminId },
      { upsert: true }
    );

    res.json({
      message: 'Points per scan updated successfully',
      points,
      appliesTo: adminId ? 'your users' : 'all users (global)',
    });
  } catch (error) {
    console.error('Error updating points setting:', error);
    res.status(500).json({ message: 'Server error updating points setting' });
  }
});

// Get barcode range setting
app.get('/settings/barcode-range', authenticateToken, async (req, res) => {
  try {
    let setting;
    let fetchedFor = 'unknown';
    let query = { key: 'barcodeRange' };

    if (req.user.role === 'superadmin') {
      query.adminId = null;
      fetchedFor = 'superadmin (global)';
    } else if (req.user.role === 'admin') {
      query.adminId = req.user._id;
      fetchedFor = `admin (id: ${req.user._id})`;
    } else {
      query.adminId = req.user.adminId || null;
      fetchedFor = `user (adminId: ${req.user.adminId || 'none'})`;
    }

    setting = await Setting.findOne(query);

    if (!setting && req.user.role !== 'superadmin') {
      query.adminId = null;
      setting = await Setting.findOne({ key: 'barcodeRange', adminId: null });
      fetchedFor += ' -> superadmin (global fallback)';
    }

    const range = setting ? setting.value : { start: '0', end: '9999999999999' };

    res.json({
      range,
      isDefault: !setting,
      setBy: setting ? (setting.adminId ? 'your admin' : 'superadmin') : 'system default',
    });
  } catch (error) {
    console.error('Error fetching barcode range setting:', error);
    res.status(500).json({ message: 'Server error fetching barcode range setting' });
  }
});

// Update barcode range setting
app.put('/settings/barcode-range', authenticateToken, checkRole(['admin', 'superadmin']), async (req, res) => {
  try {
    const { start, end } = req.body;
    if (!start || !end || start > end || typeof start !== 'string' || typeof end !== 'string') {
      return res.status(400).json({ message: 'Invalid barcode range' });
    }

    const adminId = req.user.role === 'superadmin' ? null : req.user._id;

    await Setting.findOneAndUpdate(
      { key: 'barcodeRange', adminId },
      { key: 'barcodeRange', value: { start, end }, adminId },
      { upsert: true }
    );

    res.json({
      message: 'Barcode range updated successfully',
      range: { start, end },
      appliesTo: adminId ? 'your users' : 'all users (global)',
    });
  } catch (error) {
    console.error('Error updating barcode range setting:', error);
    res.status(500).json({ message: 'Server error updating barcode range setting' });
  }
});

// Start the server
const PORT = process.env.PORT || 5003;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});