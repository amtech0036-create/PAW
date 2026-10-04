const mongoose = require('mongoose');

/**
 * User collection (PRD section 11).
 * Email is unique. Currency/timezone default to BDT / Asia/Dhaka.
 */
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: 100,
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },

    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
    },

    currency: {
      type: String,
      default: 'BDT',
      uppercase: true,
      trim: true,
    },

    timezone: {
      type: String,
      default: 'Asia/Dhaka',
      trim: true,
    },
  },
  {
    timestamps: true, // createdAt / updatedAt
  }
);

module.exports = mongoose.model('User', userSchema);
