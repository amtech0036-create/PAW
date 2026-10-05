/**
 * Shared formatting helpers (Phases 9+).
 * Currency: ৳ with thousands grouping, no decimals for whole amounts
 * (PRD sections 22/46 examples: +৳12,000 / -৳450).
 */
(function () {
  'use strict';

  var SYMBOL = '৳';

  function formatMoney(amount) {
    var value = Number(amount) || 0;
    var abs = Math.abs(value);
    var hasCents = Math.round(abs * 100) % 100 !== 0;
    var grouped = abs.toLocaleString('en-US', {
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: 2,
    });
    return (value < 0 ? '-' + SYMBOL : SYMBOL) + grouped;
  }

  /** Signed display: income +৳, expense −৳ (PRD sections 22/46). */
  function signedMoney(amount, type) {
    var isIncome = type === 'income' || (type === undefined && Number(amount) > 0);
    var text = formatMoney(Math.abs(Number(amount) || 0));
    return isIncome ? '+' + text : '−' + text;
  }

  var MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  var MONTH_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  /** Local YYYY-MM-DD for a Date (browser-local, matching the user's day). */
  function toDateInputValue(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  /** 'TODAY' / 'YESTERDAY' / '02 OCT' / '04 OCT 2025' (PRD section 22). */
  function dateGroupLabel(dateStr) {
    var date = new Date(dateStr);
    var today = new Date();
    var startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var startOfThat = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var dayDiff = Math.round((startOfToday - startOfThat) / 86400000);

    if (dayDiff === 0) return 'TODAY';
    if (dayDiff === 1) return 'YESTERDAY';
    var label =
      String(date.getDate()).padStart(2, '0') + ' ' + MONTH_SHORT[date.getMonth()];
    if (date.getFullYear() !== today.getFullYear()) {
      label += ' ' + date.getFullYear();
    }
    return label;
  }

  /** 'YYYY-MM' → 'October 2026' */
  function monthLabel(monthKey) {
    var parts = String(monthKey || '').split('-');
    var y = Number(parts[0]);
    var m = Number(parts[1]);
    if (!y || !m) return '';
    return MONTH_NAMES[m - 1] + ' ' + y;
  }

  /** Current local month key 'YYYY-MM'. */
  function currentMonthKey() {
    var now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  }

  window.Format = {
    money: formatMoney,
    signedMoney: signedMoney,
    dateGroupLabel: dateGroupLabel,
    monthLabel: monthLabel,
    currentMonthKey: currentMonthKey,
    toDateInputValue: toDateInputValue,
    MONTH_NAMES: MONTH_NAMES,
  };
})();
