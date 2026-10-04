const Transaction = require('../models/Transaction');
const Category = require('../models/Category');
const { getBalanceSummary } = require('../services/balanceService');
const { publicTransaction } = require('./transactionController');

const DEFAULT_RECENT_LIMIT = 5;
const MAX_RECENT_LIMIT = 20;

/**
 * GET /api/dashboard (PRD sections 19/35, Phase 6)
 *
 * Single call for the dashboard screen:
 *   openingBalance | totalIncome | totalExpense | currentBalance |
 *   netCashFlow    | recentTransactions
 *
 * All financial math comes from the balance service (PRD section 18:
 * the backend is the source of truth; the frontend only renders).
 */
async function getDashboard(req, res, next) {
  try {
    const limitParam = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitParam)
      ? Math.min(MAX_RECENT_LIMIT, Math.max(1, limitParam))
      : DEFAULT_RECENT_LIMIT;

    const [balance, transactions] = await Promise.all([
      getBalanceSummary(req.user.id),
      Transaction.find({ userId: req.user.id })
        .sort({ date: -1, _id: -1 }) // newest first, stable on same-day inserts
        .limit(limit)
        .lean(),
    ]);

    // Attach category names for the recent list in one extra query.
    const categoryIds = [...new Set(transactions.map((t) => String(t.categoryId)))];
    const categories = categoryIds.length
      ? await Category.find({ _id: { $in: categoryIds }, userId: req.user.id }).lean()
      : [];
    const categoryById = new Map(categories.map((c) => [c._id.toString(), c]));

    return res.status(200).json({
      openingBalance: balance.openingBalance,
      totalIncome: balance.totalIncome,
      totalExpense: balance.totalExpense,
      currentBalance: balance.currentBalance,
      netCashFlow: balance.netCashFlow,
      recentTransactions: transactions.map((t) =>
        publicTransaction(t, categoryById.get(String(t.categoryId)))
      ),
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getDashboard, DEFAULT_RECENT_LIMIT, MAX_RECENT_LIMIT };
