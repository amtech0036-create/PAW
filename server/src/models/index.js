const mongoose = require('mongoose');

const Transaction = require('./Transaction');
const Category = require('./Category');
const Settings = require('./Settings');
const User = require('./User');

/**
 * Ensures every model's indexes exist in the connected database
 * (PRD section 50). Safe to call repeatedly; MongoDB skips existing indexes.
 * Includes User so the unique email index exists deterministically instead
 * of relying on mongoose's background auto-index build (race found in Phase 5).
 */
async function ensureIndexes() {
  await Promise.all([
    User.syncIndexes(),
    Transaction.syncIndexes(),
    Category.syncIndexes(),
    Settings.syncIndexes(),
  ]);
}

/**
 * Creates the default categories for a user (PRD sections 15-16).
 * Used at registration in Phase 3.
 */
const DEFAULT_INCOME_CATEGORIES = [
  'Salary',
  'Freelance',
  'Business',
  'A&M Tech Solutions',
  'Bonus',
  'Commission',
  'Investment',
  'Gift',
  'Other Income',
  // Built-in category for recording the starting balance as an income
  // transaction (PRD section 13). The balance VALUE itself lives in Settings
  // per PRD section 13 - see Phase 5 note above.
  'Opening Balance',
];

const DEFAULT_EXPENSE_CATEGORIES = [
  'Food',
  'Transport',
  'Shopping',
  'Bills',
  'Mobile',
  'Internet',
  'Rent',
  'Family',
  'Health',
  'Entertainment',
  'Education',
  'Business',
  'Travel',
  'Personal',
  'Other',
];

async function seedDefaultCategories(userId) {
  const docs = [
    ...DEFAULT_INCOME_CATEGORIES.map((name) => ({ userId, name, type: 'income', isDefault: true })),
    ...DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ userId, name, type: 'expense', isDefault: true })),
  ];
  return Category.insertMany(docs, { ordered: false });
}

module.exports = {
  ensureIndexes,
  seedDefaultCategories,
  DEFAULT_INCOME_CATEGORIES,
  DEFAULT_EXPENSE_CATEGORIES,
  mongoose,
};
