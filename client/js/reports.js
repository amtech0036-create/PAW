/**
 * Reports page (Phase 13, PRD sections 25-28/36/51).
 * Monthly summary, income vs expense bars, expense category breakdown,
 * and monthly history. Custom date range supported (PRD section 36).
 */
(function () {
  'use strict';

  var els = {
    month: document.getElementById('report-month'),
    modeMonth: document.getElementById('mode-month'),
    modeCustom: document.getElementById('mode-custom'),
    customRange: document.getElementById('report-custom-range'),
    startDate: document.getElementById('report-start-date'),
    endDate: document.getElementById('report-end-date'),
    applyCustom: document.getElementById('report-apply-custom'),
    periodTitle: document.getElementById('report-period-title'),
    income: document.getElementById('report-income'),
    expense: document.getElementById('report-expense'),
    net: document.getElementById('report-net'),
    count: document.getElementById('report-count'),
    barIncome: document.getElementById('bar-income'),
    barExpense: document.getElementById('bar-expense'),
    barNote: document.getElementById('report-bar-note'),
    categories: document.getElementById('report-categories'),
    categoriesEmpty: document.getElementById('report-categories-empty'),
    history: document.getElementById('report-history'),
  };

  var state = { mode: 'month', month: null, startDate: '', endDate: '' };

  function setMoney(el, value, signed) {
    el.textContent = signed ? window.Format.signedMoney(value) : window.Format.money(value);
  }

  function setBars(income, expense) {
    var max = Math.max(income, expense, 1);
    els.barIncome.style.width = Math.round((income / max) * 100) + '%';
    els.barExpense.style.width = Math.round((expense / max) * 100) + '%';
  }

  function renderSummary(data, title, showCount) {
    els.periodTitle.textContent = title;
    setMoney(els.income, data.income, true);
    setMoney(els.expense, -Math.abs(data.expense), true);
    setMoney(els.net, data.net, true);
    setBars(data.income, data.expense);
    els.count.textContent = showCount && data.transactionCount !== undefined
      ? data.transactionCount + ' transaction' + (data.transactionCount === 1 ? '' : 's')
      : '';
    els.barNote.textContent =
      data.income === 0 && data.expense === 0
        ? 'No financial activity for this period.'
        : '';
  }

  function categoryRow(entry) {
    var row = document.createElement('div');
    row.className = 'cat-row';
    var name = document.createElement('span');
    name.textContent = (entry.icon ? entry.icon + ' ' : '') + entry.name;
    var right = document.createElement('span');
    var amount = document.createElement('strong');
    amount.textContent = window.Format.money(entry.amount);
    var percent = document.createElement('span');
    percent.className = 'cat-pct';
    percent.textContent = ' ' + entry.percent + '%';
    right.appendChild(amount);
    right.appendChild(percent);
    row.appendChild(name);
    row.appendChild(right);
    return row;
  }

  function renderCategories(data) {
    els.categories.innerHTML = '';
    var list = data.categories || [];
    if (!list.length) {
      els.categoriesEmpty.hidden = false;
      return;
    }
    els.categoriesEmpty.hidden = true;
    list.forEach(function (entry) {
      els.categories.appendChild(categoryRow(entry));
    });
  }

  function monthBlock(entry) {
    var block = document.createElement('div');
    block.className = 'month-block';

    var title = document.createElement('h3');
    title.textContent = entry.label;
    block.appendChild(title);

    [
      ['Income', window.Format.money(entry.income)],
      ['Expenses', window.Format.money(entry.expense)],
      ['Net', window.Format.signedMoney(entry.net, entry.net < 0 ? 'expense' : 'income')],
    ].forEach(function (pair) {
      var row = document.createElement('div');
      row.className = 'month-row';
      var label = document.createElement('span');
      label.textContent = pair[0];
      var value = document.createElement('span');
      value.className = 'month-value';
      value.textContent = pair[1];
      row.appendChild(label);
      row.appendChild(value);
      block.appendChild(row);
    });
    return block;
  }

  function renderHistory(data) {
    els.history.innerHTML = '';
    var months = (data.months || []).slice().reverse(); // newest first
    if (!months.length) {
      els.history.textContent = 'No history yet.';
      return;
    }
    months.forEach(function (entry) {
      els.history.appendChild(monthBlock(entry));
    });
  }

  function rangeParams() {
    return state.mode === 'custom'
      ? { startDate: state.startDate, endDate: state.endDate }
      : { month: state.month };
  }

  function load() {
    var summaryPath = state.mode === 'custom' ? '/api/reports/custom' : '/api/reports/monthly';
    var summaryQuery = state.mode === 'custom'
      ? { startDate: state.startDate, endDate: state.endDate }
      : { month: state.month };
    var title = state.mode === 'custom'
      ? state.startDate + ' → ' + state.endDate
      : window.Format.monthLabel(state.month);

    window.API
      .get(summaryPath, summaryQuery)
      .then(function (data) {
        renderSummary(data, title, true);
      })
      .catch(function (err) {
        els.count.textContent = '';
        els.periodTitle.textContent = title;
        els.barNote.textContent = err.message;
      });

    window.API
      .get('/api/reports/categories', rangeParams())
      .then(renderCategories)
      .catch(function () {
        els.categoriesEmpty.hidden = false;
      });

    if (state.mode === 'month') {
      window.API
        .get('/api/reports/income-expense', { months: 6 })
        .then(renderHistory)
        .catch(function () {
          els.history.textContent = 'Unable to load history.';
        });
    }
  }

  function setMode(mode) {
    state.mode = mode;
    els.modeMonth.setAttribute('aria-pressed', mode === 'month' ? 'true' : 'false');
    els.modeCustom.setAttribute('aria-pressed', mode === 'custom' ? 'true' : 'false');
    els.customRange.hidden = mode !== 'custom';
    els.month.hidden = mode !== 'month';
  }

  els.modeMonth.addEventListener('click', function () {
    setMode('month');
    state.month = els.month.value || window.Format.currentMonthKey();
    load();
  });

  els.modeCustom.addEventListener('click', setMode.bind(null, 'custom'));

  els.month.addEventListener('change', function () {
    state.month = els.month.value;
    load();
  });

  els.applyCustom.addEventListener('click', function () {
    var start = els.startDate.value;
    var end = els.endDate.value;
    if (!start || !end) return;
    if (start > end) {
      els.barNote.textContent = 'The start date must be on or before the end date.';
      return;
    }
    state.startDate = start;
    state.endDate = end;
    load();
  });

  // ---- Init -------------------------------------------------------------
  window.Auth.ready.then(function () {
    state.month = window.Format.currentMonthKey();
    els.month.value = state.month;
    var now = new Date();
    els.startDate.value = window.Format.toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
    els.endDate.value = window.Format.toDateInputValue(now);
    load();
  });
})();
