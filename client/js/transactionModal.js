/**
 * Reusable transaction modal (Phase 10, PRD sections 10/21/46).
 *
 * TransactionModal.open({ type, transaction, onSaved })
 *   - type: 'income' | 'expense' (initial segmented choice)
 *   - transaction: present → edit mode (PUT + delete flow)
 *   - onSaved: called after create/update/delete so pages can refresh
 *
 * Mobile bottom sheet; desktop centered card. Amount, category, date, and
 * note per PRD section 21. Delete uses the PRD section 46 confirmation copy.
 */
(function () {
  'use strict';

  var dom = null;
  var state = { mode: 'create', type: 'expense', transaction: null, onSaved: null };
  var categoriesCache = null; // all categories (incl. inactive) for the user

  function ensureDom() {
    if (dom) return;

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="tx-modal-title">' +
      '  <div class="modal-grabber" aria-hidden="true"></div>' +
      '  <button type="button" class="modal-close" data-modal-close aria-label="Close">×</button>' +
      '  <h2 class="section-title" id="tx-modal-title">Add Transaction</h2>' +
      '  <div class="segmented" role="group" aria-label="Transaction type">' +
      '    <button type="button" class="segment" data-tx-type="income">+ Income</button>' +
      '    <button type="button" class="segment" data-tx-type="expense">− Expense</button>' +
      '  </div>' +
      '  <form id="tx-modal-form" novalidate>' +
      '    <p class="form-error" id="tx-modal-error" role="alert"></p>' +
      '    <div class="form-group">' +
      '      <label for="tx-amount">Amount</label>' +
      '      <input type="number" id="tx-amount" name="amount" inputmode="decimal" min="0.01" step="0.01" placeholder="৳ 500" required />' +
      '    </div>' +
      '    <div class="form-group">' +
      '      <label for="tx-category">Category</label>' +
      '      <select id="tx-category" name="categoryId" required></select>' +
      '    </div>' +
      '    <div class="form-group">' +
      '      <label for="tx-date">Date</label>' +
      '      <input type="date" id="tx-date" name="date" required />' +
      '    </div>' +
      '    <div class="form-group">' +
      '      <label for="tx-note">Note</label>' +
      '      <input type="text" id="tx-note" name="note" maxlength="500" placeholder="Optional note" />' +
      '    </div>' +
      '    <button type="submit" class="btn btn-primary" id="tx-save-btn">Save</button>' +
      '    <button type="button" class="btn btn-danger" id="tx-delete-btn" hidden>Delete</button>' +
      '  </form>' +
      '  <div class="confirm-pane" id="tx-confirm-pane" hidden>' +
      '    <h3>Delete this transaction?</h3>' +
      '    <p>This action cannot be undone.</p>' +
      '    <div class="btn-stack">' +
      '      <button type="button" class="btn btn-secondary" id="tx-confirm-cancel">Cancel</button>' +
      '      <button type="button" class="btn btn-danger" id="tx-confirm-delete">Delete</button>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    document.body.appendChild(overlay);
    dom = {
      overlay: overlay,
      title: overlay.querySelector('#tx-modal-title'),
      form: overlay.querySelector('#tx-modal-form'),
      error: overlay.querySelector('#tx-modal-error'),
      amount: overlay.querySelector('#tx-amount'),
      category: overlay.querySelector('#tx-category'),
      date: overlay.querySelector('#tx-date'),
      note: overlay.querySelector('#tx-note'),
      saveBtn: overlay.querySelector('#tx-save-btn'),
      deleteBtn: overlay.querySelector('#tx-delete-btn'),
      confirmPane: overlay.querySelector('#tx-confirm-pane'),
      segments: overlay.querySelectorAll('.segment'),
    };

    dom.segments.forEach(function (segment) {
      segment.addEventListener('click', function () {
        setType(segment.getAttribute('data-tx-type'));
      });
    });
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) close();
    });
    overlay.querySelectorAll('[data-modal-close]').forEach(function (button) {
      button.addEventListener('click', close);
    });
    dom.form.addEventListener('submit', onSubmit);
    dom.deleteBtn.addEventListener('click', function () {
      dom.form.hidden = true;
      dom.confirmPane.hidden = false;
    });
    overlay.querySelector('#tx-confirm-cancel').addEventListener('click', function () {
      dom.confirmPane.hidden = true;
      dom.form.hidden = false;
    });
    overlay.querySelector('#tx-confirm-delete').addEventListener('click', onDelete);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !dom.overlay.hidden) close();
    });

    // The ＋ button in the bottom nav and quick actions all open this modal.
    Array.prototype.forEach.call(
      document.querySelectorAll('[data-action="add"]'),
      function (button) {
        button.addEventListener('click', function () {
          var preset = button.getAttribute('data-tx-type') || 'expense';
          open({ type: preset });
        });
      }
    );
  }

  function showError(message) {
    dom.error.textContent = message;
    dom.error.classList.add('visible');
  }

  function clearError() {
    dom.error.textContent = '';
    dom.error.classList.remove('visible');
  }

  function setType(type) {
    state.type = type;
    dom.segments.forEach(function (segment) {
      var active = segment.getAttribute('data-tx-type') === type;
      segment.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    populateCategories(state.type, state.transaction);
  }

  function populateCategories(type, transaction) {
    var list = (categoriesCache || []).filter(function (category) {
      return category.type === type && (category.isActive || (transaction && category.id === transaction.categoryId));
    });

    dom.category.innerHTML = '';
    if (!list.length) {
      var option = document.createElement('option');
      option.value = '';
      option.textContent = 'No categories yet - add one in Settings';
      dom.category.appendChild(option);
      dom.category.value = '';
      return;
    }
    list.forEach(function (category) {
      var option = document.createElement('option');
      option.value = category.id;
      option.textContent = (category.icon ? category.icon + ' ' : '') + category.name;
      dom.category.appendChild(option);
    });
    if (transaction && transaction.categoryId) {
      dom.category.value = transaction.categoryId;
      if (dom.category.value !== transaction.categoryId) {
        // Category not in the list (wrong type); show its stored name.
        var extra = document.createElement('option');
        extra.value = transaction.categoryId;
        extra.textContent = transaction.categoryName || 'Current category';
        dom.category.appendChild(extra);
        dom.category.value = transaction.categoryId;
      }
    }
  }

  function loadCategories() {
    if (categoriesCache) return Promise.resolve(categoriesCache);
    return window.API.get('/api/categories', { includeInactive: 'true' }).then(function (data) {
      categoriesCache = data.categories;
      return categoriesCache;
    });
  }

  function open(options) {
    ensureDom();
    clearError();
    dom.confirmPane.hidden = true;
    dom.form.hidden = false;

    state.mode = options.transaction ? 'edit' : 'create';
    state.transaction = options.transaction || null;
    state.onSaved = options.onSaved || null;
    state.type = options.transaction
      ? options.transaction.type
      : options.type === 'income'
        ? 'income'
        : 'expense';

    dom.title.textContent =
      state.mode === 'edit' ? 'Edit Transaction' : state.type === 'income' ? 'Add Income' : 'Add Expense';
    dom.saveBtn.textContent = state.mode === 'edit' ? 'Save Changes' : 'Add ' + (state.type === 'income' ? 'Income' : 'Expense');
    dom.deleteBtn.hidden = state.mode !== 'edit';

    dom.amount.value = state.transaction ? state.transaction.amount : '';
    dom.date.value = state.transaction
      ? state.transaction.date.slice(0, 10)
      : window.Format.toDateInputValue(new Date());
    dom.note.value = state.transaction ? state.transaction.note || '' : '';

    dom.segments.forEach(function (segment) {
      var active = segment.getAttribute('data-tx-type') === state.type;
      segment.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    loadCategories()
      .catch(function () {
        categoriesCache = null;
        return [];
      })
      .then(function () {
        populateCategories(state.type, state.transaction);
        dom.overlay.hidden = false;
        document.body.classList.add('modal-open');
        dom.amount.focus();
      });
  }

  function close() {
    if (!dom) return;
    dom.overlay.hidden = true;
    document.body.classList.remove('modal-open');
    state.transaction = null;
    state.onSaved = null;
  }

  function onSubmit(event) {
    event.preventDefault();
    clearError();

    var amount = Number(dom.amount.value);
    var categoryId = dom.category.value;
    var date = dom.date.value;
    var note = dom.note.value.trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      showError('Please enter a valid amount.');
      return;
    }
    if (!categoryId) {
      showError('Please choose a category.');
      return;
    }
    if (!date) {
      showError('Please enter a valid date.');
      return;
    }

    var payload = { type: state.type, amount: amount, categoryId: categoryId, date: date, note: note };
    dom.saveBtn.disabled = true;

    var request = state.mode === 'edit'
      ? window.API.put('/api/transactions/' + state.transaction.id, payload)
      : window.API.post('/api/transactions', payload);

    request
      .then(function (data) {
        var saved = data.transaction;
        close();
        if (state.onSaved) state.onSaved(saved);
      })
      .catch(function (err) {
        showError(err.message || 'Something went wrong. Please try again.');
      })
      .then(function () {
        dom.saveBtn.disabled = false;
      });
  }

  function onDelete() {
    if (!state.transaction) return;
    window.API
      .del('/api/transactions/' + state.transaction.id)
      .then(function () {
        var onSaved = state.onSaved;
        close();
        if (onSaved) onSaved(null, { deleted: true });
      })
      .catch(function (err) {
        dom.confirmPane.hidden = true;
        dom.form.hidden = false;
        showError(err.message || 'Unable to delete. Please try again.');
      });
  }

  /** Lets a page invalidate the cached category list after edits. */
  function invalidateCategories() {
    categoriesCache = null;
  }

  window.TransactionModal = {
    open: open,
    close: close,
    invalidateCategories: invalidateCategories,
  };
})();
