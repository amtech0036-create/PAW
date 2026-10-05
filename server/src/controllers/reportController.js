const mongoose = require('mongoose');

const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');
const Category = require('../models/Category');
const { roundMoney } = require('../services/balanceService');

/**
 * Report APIs (PRD sections 36/51, Phase 13).
 *
 *   GET /api/reports/monthly?month=YYYY-MM
 *   GET /api/reports/categories?month=YYYY-MM | ?startDate=&endDate=
 *   GET /api/reports/income-expense?months=6
 *   GET /api/reports/custom?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *
 * PRD section 52: reports must respect the user's local date, so a
 * transaction entered 04 October (Asia/Dhaka) never falls into 03 October.
 * Transaction dates are stored in UTC; month windows are computed as local
 * midnights converted to UTC instants using the user's timezone offset, so
 * { userId, date } range queries stay index-friendly.
 */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// The PRD's target audience uses fixed-offset zones (no DST). Unknown zones
// fall back to the PRD default, Asia/Dhaka (UTC+6).
const ZONE_OFFSET_HOURS = {
  UTC: 0,
  'Asia/Dhaka': 6,
  'Asia/Kolkata': 5.5,
  'Asia/Karachi': 5,
  'Asia/Dubai': 4,
  'Asia/Singapore': 8,
  'Asia/Hong_Kong': 8,
  'Asia/Tokyo': 9,
  'Asia/Seoul': 9,
  'Europe/Moscow': 3,
};
const DEFAULT_TZ = 'Asia/Dhaka';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function offsetMsFor(timezone) {
  const hours = ZONE_OFFSET_HOURS[timezone];
  return (hours === undefined ? ZONE_OFFSET_HOURS[DEFAULT_TZ] : hours) * 3600 * 1000;
}

async function getUserTimezone(userId) {
  const settings = await Settings.findOne({ userId }).lean();
  return (settings && settings.timezone) || DEFAULT_TZ;
}

/**
 * Local month window for YYYY-MM in the given zone as UTC instants.
 * Local midnight of day 1 = Date.UTC(y, m-1, 1) - offset.
 */
function monthWindow(monthKey, tz) {
  const [y, m] = monthKey.split('-').map(Number);
  const off = offsetMsFor(tz);
  return {
    start: new Date(Date.UTC(y, m - 1, 1, 0, 0, 0) - off),
    end: new Date(Date.UTC(y, m, 1, 0, 0, 0) - off),
  };
}

/** Inclusive local calendar-day window for YYYY-MM-DD..YYYY-MM-DD. */
function dayRangeWindow(startDateStr, endDateStr, tz) {
  const off = offsetMsFor(tz);
  const [sy, sm, sd] = startDateStr.split('-').map(Number);
  const [ey, em, ed] = endDateStr.split('-').map(Number);
  return {
    start: new Date(Date.UTC(sy, sm - 1, sd, 0, 0, 0) - off),
    end: new Date(Date.UTC(ey, em - 1, ed + 1, 0, 0, 0) - off), // exclusive
  };
}

function monthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** The current local month key (YYYY-MM) for the given zone. */
function currentMonthKey(tz) {
  const off = offsetMsFor(tz);
  const local = new Date(Date.now() + off);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function addMonths(monthKey, delta) {
  let [y, m] = monthKey.split('-').map(Number);
  m += delta;
  while (m > 12) { m -= 12; y += 1; }
  while (m < 1) { m += 12; y -= 1; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

/** Sums income/expense (+ count) over a UTC window. */
async function totalsInWindow(userId, window) {
  const rows = await Transaction.aggregate([
    { $match: { userId, date: { $gte: window.start, $lt: window.end } } },
    { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);

  const out = { income: 0, expense: 0, transactionCount: 0 };
  for (const row of rows) {
    if (row._id === 'income' || row._id === 'expense') {
      out[row._id] = roundMoney(row.total);
      out.transactionCount += row.count;
    }
  }
  out.net = roundMoney(out.income - out.expense);
  return out;
}

function parseMonthsParam(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return 6;
  return Math.min(24, Math.max(1, n));
}

/**
 * GET /api/reports/monthly?month=YYYY-MM (PRD sections 25/36)
 */
async function monthly(req, res, next) {
  try {
    const tz = await getUserTimezone(req.user.id);
    const monthKey = req.query.month || currentMonthKey(tz);

    if (!MONTH_RE.test(monthKey)) {
      return res.status(400).json({ error: 'month must be in YYYY-MM format.' });
    }

    const totals = await totalsInWindow(new mongoose.Types.ObjectId(req.user.id), monthWindow(monthKey, tz));

    return res.status(200).json({
      month: monthKey,
      label: monthLabel(monthKey),
      timezone: tz,
      income: totals.income,
      expense: totals.expense,
      net: totals.net,
      transactionCount: totals.transactionCount,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/reports/categories (PRD sections 27/36)
 * Expense breakdown by category with percentage of total.
 * Range: ?month=YYYY-MM (default current) or ?startDate=&endDate=YYYY-MM-DD.
 */
async function categories(req, res, next) {
  try {
    const tz = await getUserTimezone(req.user.id);
    const uid = new mongoose.Types.ObjectId(req.user.id);

    let window;
    let rangeMeta;
    if (req.query.month) {
      if (!MONTH_RE.test(req.query.month)) {
        return res.status(400).json({ error: 'month must be in YYYY-MM format.' });
      }
      window = monthWindow(req.query.month, tz);
      rangeMeta = { month: req.query.month, label: monthLabel(req.query.month) };
    } else if (req.query.startDate || req.query.endDate) {
      const { startDate, endDate } = req.query;
      if (!DAY_RE.test(String(startDate || '')) || !DAY_RE.test(String(endDate || ''))) {
        return res.status(400).json({ error: 'startDate and endDate must be YYYY-MM-DD.' });
      }
      if (startDate > endDate) {
        return res.status(400).json({ error: 'startDate must be on or before endDate.' });
      }
      window = dayRangeWindow(startDate, endDate, tz);
      rangeMeta = { startDate, endDate };
    } else {
      const monthKey = currentMonthKey(tz);
      window = monthWindow(monthKey, tz);
      rangeMeta = { month: monthKey, label: monthLabel(monthKey) };
    }

    const rows = await Transaction.aggregate([
      { $match: { userId: uid, type: 'expense', date: { $gte: window.start, $lt: window.end } } },
      { $group: { _id: '$categoryId', total: { $sum: '$amount' } } },
      { $sort: { total: -1 } },
    ]);

    const total = roundMoney(rows.reduce((sum, r) => sum + r.total, 0));

    // Attach category names in one query.
    const categoryIds = rows.map((r) => r._id).filter((id) => mongoose.Types.ObjectId.isValid(id));
    const cats = categoryIds.length
      ? await Category.find({ _id: { $in: categoryIds }, userId: uid }).lean()
      : [];
    const catById = new Map(cats.map((c) => [c._id.toString(), c]));

    const categoriesOut = rows
      .map((r) => {
        const cat = catById.get(String(r._id));
        return {
          categoryId: String(r._id),
          name: cat ? cat.name : 'Unknown',
          icon: cat ? cat.icon || '' : '',
          amount: roundMoney(r.total),
          percent: total > 0 ? Math.round((r.total / total) * 100) : 0,
        };
      });

    return res.status(200).json({
      ...rangeMeta,
      timezone: tz,
      type: 'expense',
      total,
      categories: categoriesOut,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/reports/income-expense?months=6 (PRD sections 26/28/36)
 * Per-month income/expense/net for the last N months (ascending, ending with
 * the current local month). Missing months are filled with zeros.
 */
async function incomeExpense(req, res, next) {
  try {
    const tz = await getUserTimezone(req.user.id);
    const uid = new mongoose.Types.ObjectId(req.user.id);
    const count = parseMonthsParam(req.query.months);

    const current = currentMonthKey(tz);
    const keys = [];
    for (let i = count - 1; i >= 0; i -= 1) keys.push(addMonths(current, -i));

    const window = {
      start: monthWindow(keys[0], tz).start,
      end: monthWindow(current, tz).end,
    };

    const rows = await Transaction.aggregate([
      { $match: { userId: uid, date: { $gte: window.start, $lt: window.end } } },
      {
        $group: {
          _id: { type: '$type', month: { $dateToString: { format: '%Y-%m', date: '$date', timezone: tz } } },
          total: { $sum: '$amount' },
        },
      },
    ]);

    const totals = new Map();
    for (const row of rows) {
      if (!totals.has(row._id.month)) {
        totals.set(row._id.month, { income: 0, expense: 0 });
      }
      const entry = totals.get(row._id.month);
      if (row._id.type === 'income' || row._id.type === 'expense') {
        entry[row._id.type] = roundMoney(row.total);
      }
    }

    const months = keys.map((key) => {
      const entry = totals.get(key) || { income: 0, expense: 0 };
      return {
        month: key,
        label: monthLabel(key),
        income: entry.income,
        expense: entry.expense,
        net: roundMoney(entry.income - entry.expense),
      };
    });

    return res.status(200).json({ timezone: tz, monthsRequested: count, months });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/reports/custom?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD (PRD 36)
 */
async function custom(req, res, next) {
  try {
    const tz = await getUserTimezone(req.user.id);
    const { startDate, endDate } = req.query;

    if (!DAY_RE.test(String(startDate || '')) || !DAY_RE.test(String(endDate || ''))) {
      return res.status(400).json({ error: 'startDate and endDate must be YYYY-MM-DD.' });
    }
    if (startDate > endDate) {
      return res.status(400).json({ error: 'startDate must be on or before endDate.' });
    }

    const totals = await totalsInWindow(
      new mongoose.Types.ObjectId(req.user.id),
      dayRangeWindow(startDate, endDate, tz)
    );

    return res.status(200).json({
      startDate,
      endDate,
      timezone: tz,
      income: totals.income,
      expense: totals.expense,
      net: totals.net,
      transactionCount: totals.transactionCount,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  monthly,
  categories,
  incomeExpense,
  custom,
  monthWindow,
  currentMonthKey,
  offsetMsFor,
};
