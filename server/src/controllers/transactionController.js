const mongoose = require('mongoose');

const Transaction = require('../models/Transaction');
const Category = require('../models/Category');
const {
  validateAmount,
  validateType,
  validateDate,
  validateObjectId,
  validateNote,
  validateSource,
  firstError,
} = require('../middleware/validation');

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const EDITABLE_FIELDS = ['type', 'amount', 'categoryId', 'date', 'source', 'note'];

/**
 * Validates a transaction payload. `partial` mode (PUT) requires at least one
 * field and skips required-field checks for absent ones.
 */
function checkPayload(body, { partial = false } = {}) {
  const has = (key) => body[key] !== undefined && body[key] !== null && body[key] !== '';

  if (!partial) {
    const requiredError = firstError(
      validateType(body.type),
      validateAmount(body.amount),
      validateObjectId(String(body.categoryId || ''), 'category id'),
      validateDate(body.date)
    );
    if (requiredError) return requiredError;
  }

  if (partial && !EDITABLE_FIELDS.some(has)) {
    return 'Provide at least one field to update.';
  }

  if (has('type')) return validateType(body.type);
  if (has('amount')) return validateAmount(body.amount);
  if (has('categoryId')) return validateObjectId(String(body.categoryId), 'category id');
  if (has('date')) return validateDate(body.date);
  if (has('note')) return validateNote(body.note);
  if (has('source')) return validateSource(body.source);

  return null;
}

function normalizeAmount(amount) {
  return typeof amount === 'string' ? Number(amount) : amount;
}

/**
 * Ensures the category exists and belongs to the requesting user
 * (PRD section 43: category must exist and belong to the current user).
 */
async function assertCategoryForUser(userId, categoryId) {
  const category = await Category.findOne({ _id: categoryId, userId }).lean();
  if (!category) {
    return { status: 400, message: 'Category does not exist for this user.' };
  }
  return null;
}

/**
 * Restrict returned fields (never leaks internals; userId stays internal).
 */
function publicTransaction(txn, category) {
  return {
    id: txn._id.toString(),
    type: txn.type,
    amount: txn.amount,
    categoryId: category ? category._id.toString() : txn.categoryId.toString(),
    categoryName: category ? category.name : null,
    categoryType: category ? category.type : null,
    source: txn.source,
    date: txn.date.toISOString(),
    note: txn.note,
    createdAt: txn.createdAt.toISOString(),
    updatedAt: txn.updatedAt.toISOString(),
  };
}

/**
 * POST /api/transactions (PRD section 34)
 */
async function createTransaction(req, res, next) {
  try {
    const body = req.body || {};

    const validationError = checkPayload(body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const amount = normalizeAmount(body.amount);
    const categoryError = await assertCategoryForUser(req.user.id, String(body.categoryId));
    if (categoryError) {
      return res.status(categoryError.status).json({ error: categoryError.message });
    }

    // PRD section 12: amounts are always stored positive; sign comes from type.
    const transaction = await Transaction.create({
      userId: req.user.id,
      type: body.type,
      amount,
      categoryId: String(body.categoryId),
      date: new Date(body.date),
      source: typeof body.source === 'string' ? body.source.trim() : '',
      note: typeof body.note === 'string' ? body.note.trim() : '',
    });

    const category = await Category.findById(transaction.categoryId).lean();
    return res.status(201).json({ transaction: publicTransaction(transaction, category) });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/transactions (PRD section 34)
 * Filters: type, categoryId (category), startDate/endDate, search (note/source).
 * Sort: date desc default, `sort=date|amount` + `order=asc|desc`. Paginated.
 */
async function getTransactions(req, res, next) {
  try {
    const query = { userId: req.user.id };

    const { type, category, startDate, endDate, search } = req.query;

    if (type === 'income' || type === 'expense') {
      query.type = type;
    }

    if (category && validateObjectId(String(category), 'category id') === null) {
      query.categoryId = category;
    }

    const range = {};
    if (startDate && Number.isNaN(Date.parse(startDate))) {
      return res.status(400).json({ error: 'startDate is not a valid date.' });
    }
    if (endDate && Number.isNaN(Date.parse(endDate))) {
      return res.status(400).json({ error: 'endDate is not a valid date.' });
    }
    if (startDate) range.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      // endDate is treated as an inclusive calendar day (YYYY-MM-DD).
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(endDate))) {
        end.setUTCDate(end.getUTCDate() + 1);
        range.$lt = end;
      } else {
        range.$lte = end;
      }
    }
    if (range.$gte || range.$lt || range.$lte) {
      query.date = range;
    }

    // Search note and source only. `search` comes from req.query (never a raw
    // client object), so it is a plain string and MongoDB injection is impossible.
    if (search && typeof search === 'string' && search.trim()) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(escaped, 'i');
      query.$or = [{ note: rx }, { source: rx }];
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || DEFAULT_PAGE);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_LIMIT));
    const skip = (page - 1) * limit;

    const sortField = req.query.sort === 'amount' ? 'amount' : 'date';
    const order = req.query.order === 'asc' ? 1 : -1;
    const sort = { [sortField]: order, _id: order };

    const [items, total] = await Promise.all([
      Transaction.find(query).sort(sort).skip(skip).limit(limit).lean(),
      Transaction.countDocuments(query),
    ]);

    // Attach category names in one query for the page.
    const categoryIds = [...new Set(items.map((t) => String(t.categoryId)))];
    const categories = categoryIds.length
      ? await Category.find({ _id: { $in: categoryIds }, userId: req.user.id }).lean()
      : [];
    const categoryById = new Map(categories.map((c) => [c._id.toString(), c]));

    return res.status(200).json({
      transactions: items.map((t) =>
        publicTransaction(
          {
            ...t,
            // lean() documents still expose createdAt/updatedAt because of timestamps.
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
          },
          categoryById.get(String(t.categoryId))
        )
      ),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/transactions/:id (PRD section 34)
 */
async function getTransaction(req, res, next) {
  try {
    const { id } = req.params;
    if (validateObjectId(id, 'transaction id')) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // PRD section 43: transactions must belong to the authenticated user.
    const transaction = await Transaction.findOne({ _id: id, userId: req.user.id }).lean();
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const category = await Category.findOne({ _id: transaction.categoryId, userId: req.user.id }).lean();
    return res.status(200).json({ transaction: publicTransaction(transaction, category) });
  } catch (err) {
    return next(err);
  }
}

/**
 * PUT /api/transactions/:id (PRD section 34)
 */
async function updateTransaction(req, res, next) {
  try {
    const { id } = req.params;
    if (validateObjectId(id, 'transaction id')) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const body = req.body || {};
    const validationError = checkPayload(body, { partial: true });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    if (body.categoryId !== undefined && body.categoryId !== null) {
      const categoryError = await assertCategoryForUser(req.user.id, String(body.categoryId));
      if (categoryError) {
        return res.status(categoryError.status).json({ error: categoryError.message });
      }
    }

    const updates = {};
    if (body.type !== undefined && body.type !== null) updates.type = body.type;
    if (body.amount !== undefined && body.amount !== null) updates.amount = normalizeAmount(body.amount);
    if (body.categoryId !== undefined && body.categoryId !== null) updates.categoryId = String(body.categoryId);
    if (body.date !== undefined && body.date !== null) updates.date = new Date(body.date);
    if (body.source !== undefined && body.source !== null) updates.source = String(body.source).trim();
    if (body.note !== undefined && body.note !== null) updates.note = String(body.note).trim();

    const transaction = await Transaction.findOneAndUpdate(
      { _id: id, userId: req.user.id },
      { $set: updates },
      { new: true, runValidators: true, context: 'query' }
    );
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const category = await Category.findById(transaction.categoryId).lean();
    return res.status(200).json({ transaction: publicTransaction(transaction, category) });
  } catch (err) {
    return next(err);
  }
}

/**
 * DELETE /api/transactions/:id (PRD section 34)
 */
async function deleteTransaction(req, res, next) {
  try {
    const { id } = req.params;
    if (validateObjectId(id, 'transaction id')) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const transaction = await Transaction.findOneAndDelete({ _id: id, userId: req.user.id });
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    return res.status(200).json({ message: 'Transaction deleted' });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createTransaction,
  getTransactions,
  getTransaction,
  updateTransaction,
  deleteTransaction,
  checkPayload,
  publicTransaction,
};
