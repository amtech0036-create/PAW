/**
 * Categories management (Phase 12, PRD sections 12/14/16/29/37).
 * List, add, rename, and disable/enable. Deleting a category that has
 * transactions is refused by the API (409) - the UI surfaces the hint to
 * disable it instead so no transaction is ever orphaned (PRD section 12).
 */
(function () {
  'use strict';

  var els = {
    income: document.getElementById('income-categories'),
    expense: document.getElementById('expense-categories'),
    error: document.getElementById('categories-error'),
    form: document.getElementById('category-add-form'),
    name: document.getElementById('category-name'),
    type: document.getElementById('category-type'),
  };

  var categories = [];

  function showError(message) {
    els.error.textContent = message;
    els.error.classList.add('visible');
  }

  function clearError() {
    els.error.textContent = '';
    els.error.classList.remove('visible');
  }

  function actionButton(label, action, category) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'row-action';
    button.textContent = label;
    button.setAttribute('data-act', action);
    button.setAttribute('aria-label', label + ' ' + category.name);
    return button;
  }

  function categoryRow(category) {
    var row = document.createElement('div');
    row.className = 'settings-row static';
    row.setAttribute('data-category-id', category.id);

    var nameWrap = document.createElement('span');
    nameWrap.className = 'cat-name-wrap';
    nameWrap.textContent = (category.icon ? category.icon + ' ' : '') + category.name;
    if (!category.isActive) {
      var badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'Disabled';
      nameWrap.appendChild(badge);
    }

    var actions = document.createElement('span');
    actions.className = 'row-actions';
    actions.appendChild(actionButton('Rename', 'rename', category));
    actions.appendChild(
      actionButton(category.isActive ? 'Disable' : 'Enable', 'toggle', category)
    );
    actions.appendChild(actionButton('Delete', 'delete', category));

    row.appendChild(nameWrap);
    row.appendChild(actions);
    return row;
  }

  function renderRename(row, category) {
    row.innerHTML = '';
    var form = document.createElement('form');
    form.className = 'inline-form';
    var input = document.createElement('input');
    input.type = 'text';
    input.value = category.name;
    input.maxLength = 100;
    input.setAttribute('aria-label', 'New name for ' + category.name);

    var save = document.createElement('button');
    save.type = 'submit';
    save.className = 'row-action primary';
    save.textContent = 'Save';

    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'row-action';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', function () {
      render();
    });

    form.appendChild(input);
    form.appendChild(save);
    form.appendChild(cancel);
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var name = input.value.trim();
      if (!name) return;
      window.API.put('/api/categories/' + category.id, { name: name })
        .then(function () {
          clearError();
          load();
        })
        .catch(function (err) {
          clearError();
          showError(err.message);
        });
    });
    row.appendChild(form);
  }

  function onRowAction(category, action) {
    if (action === 'rename') {
      var row = document.querySelector('[data-category-id="' + category.id + '"]');
      if (row && !row.querySelector('form')) renderRename(row, category);
      return;
    }

    if (action === 'toggle') {
      window.API.put('/api/categories/' + category.id, { isActive: !category.isActive })
        .then(function () {
          clearError();
          load();
        })
        .catch(function (err) {
          clearError();
          showError(err.message);
        });
      return;
    }

    if (action === 'delete') {
      var confirmed = window.confirm(
        'Delete "' + category.name + '"? Categories with transactions cannot be deleted.'
      );
      if (!confirmed) return;
      window.API.del('/api/categories/' + category.id)
        .then(function () {
          clearError();
          load();
        })
        .catch(function (err) {
          clearError();
          showError(
            err.status === 409
              ? 'This category has transactions and cannot be deleted. Disable it instead.'
              : err.message
          );
        });
    }
  }

  function render() {
    els.income.innerHTML = '';
    els.expense.innerHTML = '';

    var income = categories.filter(function (c) {
      return c.type === 'income';
    });
    var expense = categories.filter(function (c) {
      return c.type === 'expense';
    });

    income.forEach(function (category) {
      var row = categoryRow(category);
      row.addEventListener('click', function (event) {
        var button = event.target.closest('[data-act]');
        if (button) onRowAction(category, button.getAttribute('data-act'));
      });
      els.income.appendChild(row);
    });

    expense.forEach(function (category) {
      var row = categoryRow(category);
      row.addEventListener('click', function (event) {
        var button = event.target.closest('[data-act]');
        if (button) onRowAction(category, button.getAttribute('data-act'));
      });
      els.expense.appendChild(row);
    });
  }

  function load() {
    return window.API
      .get('/api/categories', { includeInactive: 'true' })
      .then(function (data) {
        categories = data.categories;
        render();
      })
      .catch(function (err) {
        showError(err.message || 'Unable to load categories.');
      });
  }

  els.form.addEventListener('submit', function (event) {
    event.preventDefault();
    clearError();
    var name = els.name.value.trim();
    var type = els.type.value;
    if (!name) {
      showError('Please enter a category name.');
      return;
    }
    window.API
      .post('/api/categories', { name: name, type: type })
      .then(function () {
        els.name.value = '';
        window.TransactionModal.invalidateCategories();
        load();
      })
      .catch(function (err) {
        showError(err.message);
      });
  });

  window.Categories = { load: load };
})();
