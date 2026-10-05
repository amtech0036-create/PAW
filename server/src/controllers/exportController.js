const { Transaction, Category, Settings } = require('../models');

/**
 * Escapes a string field for RFC 4180 CSV.
 */
function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Formats a Date object to YYYY-MM-DD for filenames and standard CSV dates.
 */
function formatDateYMD(d) {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * GET /api/export/csv
 * Exports the authenticated user's transactions as a CSV file (PRD section 39).
 */
async function exportCsv(req, res, next) {
  try {
    const userId = req.user.id || req.user._id;
    const transactions = await Transaction.find({ userId })
      .sort({ date: -1, createdAt: -1 })
      .populate('categoryId', 'name type')
      .lean();

    const headers = ['Date', 'Type', 'Category', 'Amount', 'Source', 'Note'];
    const rows = [headers.join(',')];

    for (const txn of transactions) {
      const dateStr = formatDateYMD(txn.date);
      const type = txn.type || '';
      const categoryName = txn.categoryId ? txn.categoryId.name : '';
      const amount = txn.amount !== undefined ? txn.amount : 0;
      const source = txn.source || '';
      const note = txn.note || '';

      rows.push(
        [
          escapeCsv(dateStr),
          escapeCsv(type),
          escapeCsv(categoryName),
          escapeCsv(amount),
          escapeCsv(source),
          escapeCsv(note),
        ].join(',')
      );
    }

    const csvContent = rows.join('\r\n');
    const today = formatDateYMD(new Date());

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="cashflow-transactions-${today}.csv"`);
    return res.status(200).send(csvContent);
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/export/json
 * Exports all user data (settings, categories, transactions) in structured JSON (PRD section 39).
 */
async function exportJson(req, res, next) {
  try {
    const userId = req.user.id || req.user._id;
    const [settings, categories, transactions] = await Promise.all([
      Settings.findOne({ userId }).lean(),
      Category.find({ userId }).sort({ type: 1, name: 1 }).lean(),
      Transaction.find({ userId })
        .sort({ date: -1, createdAt: -1 })
        .populate('categoryId', 'name type')
        .lean(),
    ]);

    const cleanSettings = settings
      ? {
          openingBalance: settings.openingBalance || 0,
          openingBalanceDate: settings.openingBalanceDate
            ? formatDateYMD(settings.openingBalanceDate)
            : null,
          currency: settings.currency || 'BDT',
          theme: settings.theme || 'system',
          language: settings.language || 'en',
          dateFormat: settings.dateFormat || 'DD/MM/YYYY',
        }
      : null;

    const cleanCategories = (categories || []).map((c) => ({
      name: c.name,
      type: c.type,
      icon: c.icon || '',
      isDefault: Boolean(c.isDefault),
      isActive: c.isActive !== false,
    }));

    const cleanTransactions = (transactions || []).map((t) => ({
      date: formatDateYMD(t.date),
      type: t.type,
      categoryName: t.categoryId ? t.categoryId.name : '',
      amount: t.amount,
      source: t.source || '',
      note: t.note || '',
    }));

    const exportPayload = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      user: {
        email: req.user.email,
        name: req.user.name || '',
      },
      settings: cleanSettings,
      categories: cleanCategories,
      transactions: cleanTransactions,
    };

    const today = formatDateYMD(new Date());
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="cashflow-backup-${today}.json"`);
    return res.status(200).json(exportPayload);
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/import/json
 * Imports JSON data and creates categories and transactions after strict validation (PRD section 39).
 */
async function importJson(req, res, next) {
  try {
    const userId = req.user.id || req.user._id;
    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    // Accept either full backup payload or transactions array
    let rawTransactions = [];
    if (Array.isArray(payload)) {
      rawTransactions = payload;
    } else if (Array.isArray(payload.transactions)) {
      rawTransactions = payload.transactions;
    } else {
      return res.status(400).json({
        error: 'Payload must contain a "transactions" array or be an array of transactions',
      });
    }

    if (rawTransactions.length === 0) {
      return res.status(400).json({ error: 'No transactions found to import' });
    }

    // Limit maximum import size for security
    if (rawTransactions.length > 5000) {
      return res.status(400).json({ error: 'Import batch exceeds maximum limit of 5000 transactions' });
    }

    // Pre-validate all transactions before inserting anything
    const validatedTxns = [];
    const errors = [];

    for (let i = 0; i < rawTransactions.length; i++) {
      const item = rawTransactions[i];
      const index = i + 1;

      if (!item || typeof item !== 'object') {
        errors.push(`Row ${index}: invalid transaction object`);
        continue;
      }

      const type = (item.type || '').trim().toLowerCase();
      if (type !== 'income' && type !== 'expense') {
        errors.push(`Row ${index}: type must be "income" or "expense"`);
      }

      const amount = Number(item.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        errors.push(`Row ${index}: amount must be a positive number`);
      }

      const rawDate = item.date;
      const parsedDate = new Date(rawDate);
      if (!rawDate || Number.isNaN(parsedDate.getTime())) {
        errors.push(`Row ${index}: invalid date "${rawDate}"`);
      }

      const categoryName = (item.categoryName || item.category || '').trim();
      if (!categoryName) {
        errors.push(`Row ${index}: category name is required`);
      } else if (categoryName.length > 100) {
        errors.push(`Row ${index}: category name exceeds 100 characters`);
      }

      const source = typeof item.source === 'string' ? item.source.trim().slice(0, 200) : '';
      const note = typeof item.note === 'string' ? item.note.trim().slice(0, 500) : '';

      if (errors.length === 0) {
        validatedTxns.push({
          type,
          amount: Math.round(amount * 100) / 100,
          date: parsedDate,
          categoryName,
          source,
          note,
        });
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Validation failed for one or more transactions',
        details: errors.slice(0, 10), // return first 10 validation issues
        totalErrors: errors.length,
      });
    }

    // Resolve or auto-create categories for the user
    const existingCategories = await Category.find({ userId });
    const categoryMap = new Map();
    for (const cat of existingCategories) {
      categoryMap.set(`${cat.type}:${cat.name.toLowerCase()}`, cat);
    }

    let categoriesCreatedCount = 0;
    const docsToInsert = [];

    for (const item of validatedTxns) {
      const key = `${item.type}:${item.categoryName.toLowerCase()}`;
      let category = categoryMap.get(key);

      if (!category) {
        category = await Category.create({
          userId,
          name: item.categoryName,
          type: item.type,
          isDefault: false,
          isActive: true,
        });
        categoryMap.set(key, category);
        categoriesCreatedCount++;
      }

      docsToInsert.push({
        userId,
        type: item.type,
        amount: item.amount,
        categoryId: category._id,
        source: item.source,
        date: item.date,
        note: item.note,
      });
    }

    // Insert all transactions
    await Transaction.insertMany(docsToInsert);

    // If payload contains optional settings, update if valid
    let settingsUpdated = false;
    if (payload.settings && typeof payload.settings === 'object') {
      const s = payload.settings;
      const updateFields = {};
      if (typeof s.openingBalance === 'number' && s.openingBalance >= 0) {
        updateFields.openingBalance = Math.round(s.openingBalance * 100) / 100;
      }
      if (s.openingBalanceDate) {
        const d = new Date(s.openingBalanceDate);
        if (!Number.isNaN(d.getTime())) {
          updateFields.openingBalanceDate = d;
        }
      }
      if (['system', 'light', 'dark'].includes(s.theme)) updateFields.theme = s.theme;
      if (['en', 'bn'].includes(s.language)) updateFields.language = s.language;
      if (['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'].includes(s.dateFormat)) {
        updateFields.dateFormat = s.dateFormat;
      }

      if (Object.keys(updateFields).length > 0) {
        await Settings.findOneAndUpdate({ userId }, { $set: updateFields });
        settingsUpdated = true;
      }
    }

    return res.status(200).json({
      message: 'Import completed successfully',
      imported: {
        transactions: docsToInsert.length,
        categoriesCreated: categoriesCreatedCount,
        settingsUpdated,
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  exportCsv,
  exportJson,
  importJson,
};
