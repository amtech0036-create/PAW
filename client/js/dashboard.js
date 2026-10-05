/**
 * Dashboard UI (Phase 9, PRD sections 19/35/47).
 * Renders exactly what GET /api/dashboard returns - the backend is the
 * source of truth for every number (PRD section 18).
 */
(function () {
  'use strict';

  var els = {
    greeting: document.getElementById('greeting'),
    currentBalance: document.getElementById('current-balance'),
    totalIncome: document.getElementById('total-income'),
    totalExpense: document.getElementById('total-expense'),
    netCashFlow: document.getElementById('net-cash-flow'),
    monthLabel: document.getElementById('month-label'),
    recentList: document.getElementById('recent-transactions'),
    recentEmpty: document.getElementById('recent-empty'),
  };

  function setMoney(el, value, signed) {
    el.textContent = signed ? window.Format.signedMoney(value) : window.Format.money(value);
  }

  function transactionRow(txn) {
    var item = document.createElement('button');
    item.type = 'button';
    item.className = 'tx-item';

    var icon = document.createElement('span');
    icon.className = 'tx-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = txn.categoryType === 'income' ? '↑' : '↓';

    var meta = document.createElement('span');
    meta.className = 'tx-meta';
    var category = document.createElement('span');
    category.className = 'tx-category';
    category.textContent = txn.categoryName || 'Transaction';
    meta.appendChild(category);
    if (txn.note) {
      var note = document.createElement('span');
      note.className = 'tx-note';
      note.textContent = txn.note;
      meta.appendChild(note);
    }

    var amount = document.createElement('span');
    amount.className = 'tx-amount ' + (txn.type === 'income' ? 'income' : 'expense');
    amount.textContent = window.Format.signedMoney(txn.amount, txn.type);

    item.appendChild(icon);
    item.appendChild(meta);
    item.appendChild(amount);

    // Tap a transaction to edit/delete it (PRD section 23).
    item.addEventListener('click', function () {
      window.TransactionModal.open({ transaction: txn, onSaved: load });
    });

    return item;
  }

  function render(data) {
    setMoney(els.currentBalance, data.currentBalance, false);
    setMoney(els.totalIncome, data.totalIncome, true);
    setMoney(els.totalExpense, -Math.abs(data.totalExpense), true);
    setMoney(els.netCashFlow, data.netCashFlow, true);
    els.monthLabel.textContent = window.Format.monthLabel(window.Format.currentMonthKey());

    var recents = data.recentTransactions || [];
    els.recentList.innerHTML = '';
    if (!recents.length) {
      els.recentList.hidden = true;
      els.recentEmpty.hidden = false;
      return;
    }
    els.recentEmpty.hidden = true;
    els.recentList.hidden = false;
    recents.forEach(function (txn) {
      els.recentList.appendChild(transactionRow(txn));
    });
  }

  function load() {
    return window.API.get('/api/dashboard').then(render).catch(function (err) {
      els.recentEmpty.hidden = false;
      els.recentEmpty.textContent =
        err.status === 0
          ? err.message
          : 'Unable to load the dashboard. Please check your internet connection.';
    });
  }

  window.Auth.ready.then(function (user) {
    if (user && user.name) {
      els.greeting.textContent = 'Hi, ' + user.name.split(' ')[0];
    }
    load();
  });
})();
