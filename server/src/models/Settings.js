const mongoose = require('mongoose');

/**
 * Settings collection (PRD sections 13 and 17).
 * One document per user. Holds opening balance (financial semantics:
 * opening balance is a setting, not an income transaction) plus display
 * preferences. Only one active opening balance exists per user - enforced
 * by the unique userId index.
 */
const settingsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      unique: true,
    },

    openingBalance: {
      type: Number,
      default: 0,
      min: [0, 'Opening balance cannot be negative'],
    },

    openingBalanceDate: {
      type: Date,
      default: null,
    },

    currency: {
      type: String,
      default: 'BDT',
      uppercase: true,
      trim: true,
    },

    currencySymbol: {
      type: String,
      default: '৳',
      maxlength: 4,
    },

    timezone: {
      type: String,
      default: 'Asia/Dhaka',
      trim: true,
    },

    theme: {
      type: String,
      enum: ['system', 'light', 'dark'],
      default: 'system',
    },

    language: {
      type: String,
      default: 'en',
    },

    dateFormat: {
      type: String,
      enum: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'],
      default: 'DD/MM/YYYY',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Settings', settingsSchema);
