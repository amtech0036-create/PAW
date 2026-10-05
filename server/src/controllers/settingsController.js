const Settings = require('../models/Settings');
const { firstError, validateDate } = require('../middleware/validation');

/**
 * Settings APIs (PRD section 38, Phase 12/13 support).
 *
 *   GET  /api/settings                    current settings (public shape)
 *   PUT  /api/settings                    display preferences subset
 *   PUT  /api/settings/opening-balance    { amount, date? } (PRD section 13)
 *
 * Opening balance is a Setting, not a transaction (PRD section 13); the
 * balance service already folds it into Current Balance.
 */

function publicSettings(settings) {
  if (!settings) return null;
  return {
    openingBalance: settings.openingBalance,
    openingBalanceDate: settings.openingBalanceDate
      ? settings.openingBalanceDate.toISOString()
      : null,
    currency: settings.currency,
    currencySymbol: settings.currencySymbol,
    timezone: settings.timezone,
    theme: settings.theme,
    language: settings.language,
    dateFormat: settings.dateFormat,
  };
}

async function getOrCreateSettings(userId) {
  let settings = await Settings.findOne({ userId });
  if (!settings) {
    settings = await Settings.create({ userId });
  }
  return settings;
}

/**
 * GET /api/settings
 */
async function getSettings(req, res, next) {
  try {
    const settings = await getOrCreateSettings(req.user.id);
    return res.status(200).json({ settings: publicSettings(settings) });
  } catch (err) {
    return next(err);
  }
}

const THEMES = ['system', 'light', 'dark'];
const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
const LANGUAGES = ['en', 'bn'];

/**
 * PUT /api/settings - display preferences only (financial values live in
 * /opening-balance so the two concerns cannot be mixed up by accident).
 */
async function updateSettings(req, res, next) {
  try {
    const body = req.body || {};
    const update = {};

    if (body.theme !== undefined) {
      if (!THEMES.includes(body.theme)) {
        return res.status(400).json({ error: 'Theme must be system, light, or dark.' });
      }
      update.theme = body.theme;
    }
    if (body.language !== undefined) {
      if (!LANGUAGES.includes(body.language)) {
        return res.status(400).json({ error: 'Language must be en or bn.' });
      }
      update.language = body.language;
    }
    if (body.dateFormat !== undefined) {
      if (!DATE_FORMATS.includes(body.dateFormat)) {
        return res.status(400).json({ error: 'Date format is not supported.' });
      }
      update.dateFormat = body.dateFormat;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'Provide at least one setting to update.' });
    }

    await getOrCreateSettings(req.user.id);
    const settings = await Settings.findOneAndUpdate({ userId: req.user.id }, update, {
      new: true,
      runValidators: true,
    });

    return res.status(200).json({ settings: publicSettings(settings) });
  } catch (err) {
    return next(err);
  }
}

/**
 * PUT /api/settings/opening-balance (PRD section 13)
 * Body: { amount: number >= 0, date?: 'YYYY-MM-DD' }
 */
async function updateOpeningBalance(req, res, next) {
  try {
    const body = req.body || {};
    const amount = typeof body.amount === 'string' && body.amount.trim() !== ''
      ? Number(body.amount)
      : body.amount;

    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ error: 'Opening balance must be a number of 0 or more.' });
    }

    let date = null;
    if (body.date !== undefined && body.date !== null && body.date !== '') {
      const dateError = firstError(validateDate(body.date));
      if (dateError) return res.status(400).json({ error: dateError });
      date = new Date(body.date);
    }

    const settings = await getOrCreateSettings(req.user.id);
    settings.openingBalance = Math.round(amount * 100) / 100;
    settings.openingBalanceDate = date;
    await settings.save();

    return res.status(200).json({ settings: publicSettings(settings) });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getSettings, updateSettings, updateOpeningBalance, publicSettings };
