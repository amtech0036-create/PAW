/**
 * Transactions page (Phase 11, PRD sections 22/24/57).
 * List grouped by date, search, type/date/category filters, pagination,
 * edit and delete (delete confirm lives in the modal, PRD section 46).
 */
(function () {
  'use strict';

  var state = {
    search: '',
    type: 'all',
    dateRange: 'all',
    startDate: '',
    endDate: '',
    categoryId: 'all',
    page: 1,
    totalPages: 1,
    total: 0,
  };

  var els = {
    search: document.getElementById('tx-search'),
    chips: document.querySelectorAll('.chip[data-type]'),
    dateRange: document.getElementById('tx-date-range'),
    customRange: document.getElementById('tx-custom-range'),
    startDate: document.getElementById('tx-start-date'),
    endDate: document.getElementById('tx-end-date'),
    category: document.getElementById('tx-category'),
    count: document.getElementById('tx-count'),
    error: document.getElementById('tx-error'),
    loading: document.getElementById('tx-loading'),
    list: document.getElementById('tx-list'),
    empty: document.getElementById('tx-empty'),
    loadMoreWrap: document.getElementById('tx-load-more-wrap'),
    loadMore: document.getElementById('tx-load-more'),
  };

  function showError(message) {
    els.error.textContent = message;
    els.error.classList.add('visible');
  }

  function clearError() {
    els.error.textContent = '';
    els.error.classList.remove('visible');
  }

  /** Local (browser) date range for a named preset (PRD section 24). */
  function computeRange(value) {
    var now = new Date();
    var y = now.getFullYear();
    var m = now.getMonth();

    switch (value) {
      case 'today':
        return { startDate: window.Format.toDateInputValue(now), endDate: window.Format.toDateInputValue(now) };
      case 'this-week': {
        var monday = new Date(y, m, now.getDate() - ((now.getDay() + 6) % 7));
        var sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        return { startDate: window.Format.toDateInputValue(monday), endDate: window.Format.toDateInputValue(sunday) };
      }
      case 'this-month':
        return {
          startDate: window.Format.toDateInputValue(new Date(y, m, 1)),
          endDate: window.Format.toDateInputValue(new Date(y, m + 1, 0)),
        };
      case 'last-month':
        return {
          startDate: window.Format.toDateInputValue(new Date(y, m - 1, 1)),
          endDate: window.Format.toDateInputValue(new Date(y, m, 0)),
        };
      default:
        return { startDate: '', endDate: '' };
    }
  }

  function transactionRow(txn) {
    var item = document.createElement('button');
    item.type = 'button';
    item.className = 'tx-item';

    var icon = document.createElement('span');
    icon.className = 'tx-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = txn.type === 'income' ? '↑' : '↓';

    var meta = document.createElement('span');
    meta.className = 'tx-meta';
    var category = document.createElement('span');
    category.className = 'tx-category';
    category.textContent = txn.categoryName || 'Transaction';
    meta.appendChild(category);
    var noteText = txn.note || (txn.date || '').slice(0, 10);
    var note = document.createElement('span');
    note.className = 'tx-note';
    note.textContent = noteText;
    meta.appendChild(note);

    var amount = document.createElement('span');
    amount.className = 'tx-amount ' + (txn.type === 'income' ? 'income' : 'expense');
    amount.textContent = window.Format.signedMoney(txn.amount, txn.type);

    item.appendChild(icon);
    item.appendChild(meta);
    item.appendChild(amount);

    item.addEventListener('click', function () {
      window.TransactionModal.open({
        transaction: txn,
        onSaved: function () {
          window.TransactionModal.invalidateCategories();
          reload();
        },
      });
    });

    return item;
  }

  function render(data, append) {
    var transactions = data.transactions || [];
    els.count.textContent = data.total ? '(' + data.total + ')' : '';
    state.totalPages = data.totalPages;
    state.total = data.total;

    if (!transactions.length && !append) {
      els.list.hidden = true;
      els.list.innerHTML = '';
      els.empty.hidden = false;
      els.loadMoreWrap.hidden = true;
      return;
    }

    els.empty.hidden = true;
    els.list.hidden = false;

    var previousLabel = append ? lastGroupLabel() : null;
    transactions.forEach(function (txn) {
      var label = window.Format.dateGroupLabel(txn.date);
      if (label !== previousLabel) {
        var header = document.createElement('p');
        header.className = 'tx-group-title';
        header.textContent = label;
        els.list.appendChild(header);
        previousLabel = label;
      }
      els.list.appendChild(transactionRow(txn));
    });

    els.loadMoreWrap.hidden = state.page >= state.totalPages;
  }

  function lastGroupLabel() {
    var headers = els.list.querySelectorAll('.tx-group-title');
    return headers.length ? headers[headers.length - 1].textContent : null;
  }

  function queryParams() {
    var params = { page: state.page, limit: 20 };
    if (state.search) params.search = state.search;
    if (state.type !== 'all') params.type = state.type;
    if (state.categoryId !== 'all') params.category = state.categoryId;
    var range = state.dateRange === 'custom'
      ? { startDate: state.startDate, endDate: state.endDate }
      : computeRange(state.dateRange);
    if (range.startDate) params.startDate = range.startDate;
    if (range.endDate) params.endDate = range.endDate;
    return params;
  }

  function load(page, append) {
    state.page = page;
    clearError();
    if (!append) {
      els.list.hidden = true;
      els.list.innerHTML = '';
      els.empty.hidden = true;
      els.loading.hidden = false;
      els.loadMoreWrap.hidden = true;
    }

    window.API.get('/api/transactions', queryParams())
      .then(function (data) {
        els.loading.hidden = true;
        render(data, append);
      })
      .catch(function (err) {
        els.loading.hidden = true;
        showError(err.message || 'Unable to load transactions.');
      });
  }

  function reload() {
    load(1, false);
  }

  // ---- Wiring -----------------------------------------------------------

  var searchTimer = null;
  els.search.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      state.search = els.search.value.trim();
      reload();
    }, 300);
  });

  els.chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      els.chips.forEach(function (other) {
        other.setAttribute('aria-pressed', other === chip ? 'true' : 'false');
      });
      state.type = chip.getAttribute('data-type');
      reload();
    });
  });

  els.dateRange.addEventListener('change', function () {
    state.dateRange = els.dateRange.value;
    els.customRange.hidden = state.dateRange !== 'custom';
    if (state.dateRange !== 'custom') reload();
  });

  els.startDate.addEventListener('change', function () {
    state.startDate = els.startDate.value;
    if (state.startDate && state.endDate) reload();
  });
  els.endDate.addEventListener('change', function () {
    state.endDate = els.endDate.value;
    if (state.startDate && state.endDate) reload();
  });

  els.category.addEventListener('change', function () {
    state.categoryId = els.category.value;
    reload();
  });

  els.loadMore.addEventListener('click', function () {
    load(state.page + 1, true);
  });

  // ---- Init -------------------------------------------------------------
  window.Auth.ready.then(function () {
    window.API.get('/api/categories').then(function (data) {
      data.categories.forEach(function (category) {
        var option = document.createElement('option');
        option.value = category.id;
        option.textContent = (category.icon ? category.icon + ' ' : '') + category.name;
        els.category.appendChild(option);
      });
    });
    reload();
  });
})();
