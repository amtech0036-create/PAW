const mongoose = require('mongoose');

const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');

/**
 * Balance Service (PRD sections 18/19, Phase 5).
 *
 * This is the single source of truth for all financial totals:
 *   totalIncome     = SUM(all income transactions)
 *   totalExpense    = SUM(all expense transactions)
 *   currentBalance  = openingBalance + totalIncome - totalExpense
 *   netCashFlow     = totalIncome - totalExpense
 *
 * The frontend must NEVER be the source of truth for these numbers
 * (PRD section 18); it only renders what this service returns.
 *
 * Opening balance is a Setting, not a transaction (PRD section 13),
 * so it counts toward the balance regardless of transaction dates.
 */

/**
 * Money is stored as Numbers with at most 2 decimal places; aggregation
 * can still accumulate float artifacts (e.g. 0.1 + 0.2), so every exported
 * total is rounded to 2 decimals (paisa precision).
 */
function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function toObjectId(userId) {
  return typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
}

/**
 * Pure helper so the arithmetic itself is unit-testable without a database.
 */
function computeBalance({ openingBalance = 0, totalIncome = 0, totalExpense = 0 } = {}) {
  const opening = roundMoney(openingBalance);
  const income = roundMoney(totalIncome);
  const expense = roundMoney(totalExpense);

  return {
    openingBalance: opening,
    totalIncome: income,
    totalExpense: expense,
    currentBalance: roundMoney(opening + income - expense),
    netCashFlow: roundMoney(income - expense),
  };
}

/**
 * Aggregates all of a user's transactions plus their opening balance setting.
 * Always returns all five keys, defaulting to 0 (e.g. brand-new user with
 * no transactions and no settings document yet).
 */
async function getBalanceSummary(userId) {
  const uid = toObjectId(userId);

  const [rows, settings] = await Promise.all([
    Transaction.aggregate([
      { $match: { userId: uid } },
      { $group: { _id: '$type', total: { $sum: '$amount' } } },
    ]),
    Settings.findOne({ userId: uid }).lean(),
  ]);

  const totals = { income: 0, expense: 0 };
  for (const row of rows) {
    if (row._id === 'income' || row._id === 'expense') {
      totals[row._id] = row.total;
    }
  }

  return computeBalance({
    openingBalance: settings ? settings.openingBalance : 0,
    totalIncome: totals.income,
    totalExpense: totals.expense,
  });
}

module.exports = { getBalanceSummary, computeBalance, roundMoney };
