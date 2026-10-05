const mongoose = require('mongoose');

const Category = require('../models/Category');
const Transaction = require('../models/Transaction');
const { validateObjectId, firstError } = require('../middleware/validation');

/**
 * Category APIs (PRD section 37, Phase 12).
 *
 *   GET    /api/categories          list (optionally ?type=&includeInactive=)
 *   POST   /api/categories          create
 *   PUT    /api/categories/:id      rename / change icon / disable (isActive)
 *   DELETE /api/categories/:id      delete ONLY when unused by transactions;
 *                                  otherwise 409 so financial data is never
 *                                  orphaned (PRD section 12 guidance).
 */

function publicCategory(category) {
  return {
    id: category._id.toString(),
    name: category.name,
    type: category.type,
    icon: category.icon || '',
    isDefault: Boolean(category.isDefault),
    isActive: Boolean(category.isActive),
    createdAt: category.createdAt ? category.createdAt.toISOString() : undefined,
  };
}

async function assertOwned(userId, id) {
  const category = await Category.findOne({ _id: id, userId }).lean();
  return category || null;
}

/**
 * GET /api/categories
 */
async function getCategories(req, res, next) {
  try {
    const query = { userId: req.user.id };

    if (req.query.type === 'income' || req.query.type === 'expense') {
      query.type = req.query.type;
    }

    // Inactive categories are hidden by default; the settings UI asks for them.
    if (req.query.includeInactive !== 'true') {
      query.isActive = true;
    }

    const categories = await Category.find(query).sort({ type: 1, name: 1 }).lean();
    return res.status(200).json({ categories: categories.map(publicCategory) });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/categories
 */
async function createCategory(req, res, next) {
  try {
    const body = req.body || {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const type = body.type;
    const icon = typeof body.icon === 'string' ? body.icon.trim() : '';

    if (!name) {
      return res.status(400).json({ error: 'Category name is required.' });
    }
    if (name.length > 100) {
      return res.status(400).json({ error: 'Category name must be 100 characters or fewer.' });
    }
    if (type !== 'income' && type !== 'expense') {
      return res.status(400).json({ error: 'Category type must be income or expense.' });
    }
    if (icon.length > 16) {
      return res.status(400).json({ error: 'Icon must be 16 characters or fewer.' });
    }

    try {
      const category = await Category.create({
        userId: req.user.id,
        name,
        type,
        icon,
        isDefault: false,
        isActive: true,
      });
      return res.status(201).json({ category: publicCategory(category) });
    } catch (err) {
      // Unique index { userId, type, name }.
      if (err && err.code === 11000) {
        return res.status(409).json({ error: 'A category with this name already exists.' });
      }
      throw err;
    }
  } catch (err) {
    return next(err);
  }
}

/**
 * PUT /api/categories/:id
 */
async function updateCategory(req, res, next) {
  try {
    const { id } = req.params;
    if (validateObjectId(id, 'category id')) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const body = req.body || {};
    const hasName = body.name !== undefined;
    const hasIcon = body.icon !== undefined;
    const hasIsActive = body.isActive !== undefined;
    const hasType = body.type !== undefined;

    if (!hasName && !hasIcon && !hasIsActive && !hasType) {
      return res.status(400).json({ error: 'Provide at least one field to update.' });
    }

    if (hasName) {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return res.status(400).json({ error: 'Category name is required.' });
      if (name.length > 100) {
        return res.status(400).json({ error: 'Category name must be 100 characters or fewer.' });
      }
    }
    if (hasIcon) {
      const icon = typeof body.icon === 'string' ? body.icon.trim() : '';
      if (icon.length > 16) {
        return res.status(400).json({ error: 'Icon must be 16 characters or fewer.' });
      }
    }
    if (hasIsActive && typeof body.isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be true or false.' });
    }
    if (hasType && body.type !== 'income' && body.type !== 'expense') {
      return res.status(400).json({ error: 'Category type must be income or expense.' });
    }

    const category = await assertOwned(req.user.id, id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Changing type on a category that already has transactions would corrupt
    // their meaning (an income tx pointing at an expense category), so block it.
    if (hasType && body.type !== category.type) {
      const inUse = await Transaction.countDocuments({ userId: req.user.id, categoryId: id });
      if (inUse > 0) {
        return res.status(409).json({
          error: 'Cannot change the type of a category that has transactions.',
        });
      }
    }

    if (hasName && (body.name.trim() !== category.name || (hasType && body.type !== category.type))) {
      const duplicate = await Category.findOne({
        userId: req.user.id,
        type: hasType ? body.type : category.type,
        name: body.name.trim(),
        _id: { $ne: id },
      }).lean();
      if (duplicate) {
        return res.status(409).json({ error: 'A category with this name already exists.' });
      }
    }

    const update = {};
    if (hasName) update.name = body.name.trim();
    if (hasIcon) update.icon = body.icon.trim();
    if (hasIsActive) update.isActive = body.isActive;
    if (hasType) update.type = body.type;

    const updated = await Category.findOneAndUpdate({ _id: id, userId: req.user.id }, update, {
      new: true,
      runValidators: true,
    }).lean();

    return res.status(200).json({ category: publicCategory(updated) });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'A category with this name already exists.' });
    }
    return next(err);
  }
}

/**
 * DELETE /api/categories/:id
 * Hard-deletes only when no transactions reference the category. Otherwise
 * returns 409 and the client disables it instead (isActive: false), so no
 * transaction ever loses its category (PRD section 12).
 */
async function deleteCategory(req, res, next) {
  try {
    const { id } = req.params;
    if (validateObjectId(id, 'category id')) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const category = await assertOwned(req.user.id, id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const inUse = await Transaction.countDocuments({ userId: req.user.id, categoryId: id });
    if (inUse > 0) {
      return res.status(409).json({
        error: 'This category has transactions and cannot be deleted. Disable it instead.',
        inUseCount: inUse,
      });
    }

    await Category.deleteOne({ _id: id, userId: req.user.id });
    return res.status(200).json({ message: 'Category deleted' });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  publicCategory,
};
