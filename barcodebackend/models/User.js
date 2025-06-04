const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  mobile: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin', 'superadmin'], default: 'user' },
  location: { type: String },
  status: { type: String, enum: ['pending', 'approved', 'disapproved'], default: 'pending' },
  points: { type: Number, default: 0 },
  notificationToken: { type: String },
  uniqueCode: {
    type: String,
    unique: true,
    sparse: true,
    required: function () {
      return this.role === 'admin'; // Required for admins only
    },
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function () {
      return this.role === 'user'; // Required for users only
    },
  },
});

module.exports = mongoose.model('User', userSchema);