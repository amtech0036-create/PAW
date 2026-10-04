const mongoose = require('mongoose');

/**
 * Category collection (PRD sections 14-16).
 * Seeded per user with default income/expense categories at registration
 * (Phase 3). Index: { userId: 1, type: 1 } per PRD section 50.
 */
const categorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
    },

    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
      maxlength: 100,
    },

    type: {
      type: String,
      enum: {
        values: ['income', 'expense'],
        message: 'Category type must be income or expense',
      },
      required: [true, 'Category type is required'],
    },

    icon: {
      type: String,
      trim: true,
      maxlength: 16,
      default: '',
    },

    isDefault: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Query index (PRD section 50).
categorySchema.index({ userId: 1, type: 1 });

// A user should not have duplicate category names within the same type.
categorySchema.index({ userId: 1, type: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Category', categorySchema);
