const mongoose = require('mongoose');

/**
 * Transaction collection (PRD section 12) - the most important collection.
 *
 * Critical rule: amounts are ALWAYS stored as positive numbers.
 *   expense 500 is stored as { type: "expense", amount: 500 }
 *   never as amount: -500.
 * The application adds or subtracts based on `type`.
 */
const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      index: true,
    },

    type: {
      type: String,
      enum: {
        values: ['income', 'expense'],
        message: 'Type must be income or expense',
      },
      required: [true, 'Type is required'],
    },

    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be greater than 0'],
      validate: {
        validator: Number.isFinite,
        message: 'Amount must be a finite number',
      },
    },

    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
    },

    source: {
      type: String,
      trim: true,
      maxlength: 200,
      default: '',
    },

    date: {
      type: Date,
      required: [true, 'Date is required'],
    },

    note: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
  },
  {
    timestamps: true, // createdAt / updatedAt
  }
);

// Query indexes (PRD section 50).
transactionSchema.index({ userId: 1, date: -1 });
transactionSchema.index({ userId: 1, type: 1, date: -1 });
transactionSchema.index({ userId: 1, categoryId: 1, date: -1 });

/**
 * Pre-save guard: reject negative or non-positive amounts early so an
 * accounting sign error can never reach the database.
 */
transactionSchema.pre('validate', function (next) {
  if (typeof this.amount === 'number' && this.amount <= 0) {
    return next(new Error('Amount must be stored as a positive number'));
  }
  next();
});

module.exports = mongoose.model('Transaction', transactionSchema);
