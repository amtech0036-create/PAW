/**
 * Settings page (Phases 8/12, PRD sections 13/17/29/38).
 * Account info, opening balance (a Setting, not a transaction), display
 * preferences, and logout. Category management lives in categories.js.
 */
(function () {
  'use strict';

  var els = {
    name: document.getElementById('account-name'),
    email: document.getElementById('account-email'),
    currency: document.getElementById('settings-currency'),
    form: document.getElementById('opening-balance-form'),
    amount: document.getElementById('opening-balance-amount'),
    date: document.getElementById('opening-balance-date'),
    message: document.getElementById('settings-message'),
    preferences: document.getElementById('preferences-form'),
    theme: document.getElementById('pref-theme'),
    language: document.getElementById('pref-language'),
    dateFormat: document.getElementById('pref-date-format'),
  };

  function showMessage(message, isError) {
    els.message.textContent = message;
    els.message.classList.toggle('visible', true);
    els.message.classList.toggle('form-error', !!isError);
    els.message.classList.toggle('form-success', !isError);
  }

  function hideMessage() {
    els.message.textContent = '';
    els.message.classList.remove('visible', 'form-error', 'form-success');
  }

  function renderSettings(settings) {
    els.amount.value = settings.openingBalance || '';
    if (settings.openingBalanceDate) {
      els.date.value = settings.openingBalanceDate.slice(0, 10);
    }
    els.currency.textContent = settings.currencySymbol + ' ' + settings.currency;
    els.theme.value = settings.theme;
    els.language.value = settings.language;
    els.dateFormat.value = settings.dateFormat;
  }

  window.Auth.ready.then(function (user) {
    if (user) {
      els.name.textContent = user.name;
      els.email.textContent = user.email;
    }

    window.API.get('/api/settings').then(renderSettings).catch(function (err) {
      showMessage(err.message || 'Unable to load settings.', true);
    });

    if (window.Categories) window.Categories.load();
  });

  els.form.addEventListener('submit', function (event) {
    event.preventDefault();
    hideMessage();

    var amount = Number(els.amount.value);
    var date = els.date.value;

    if (els.amount.value === '' || !Number.isFinite(amount) || amount < 0) {
      showMessage('Opening balance must be a number of 0 or more.', true);
      return;
    }

    var button = els.form.querySelector('button[type="submit"]');
    button.disabled = true;

    window.API
      .put('/api/settings/opening-balance', { amount: amount, date: date || undefined })
      .then(function () {
        showMessage('Opening balance saved.');
      })
      .catch(function (err) {
        showMessage(err.message || 'Unable to save. Please try again.', true);
      })
      .then(function () {
        button.disabled = false;
      });
  });

  els.preferences.addEventListener('submit', function (event) {
    event.preventDefault();
    hideMessage();

    var button = els.preferences.querySelector('button[type="submit"]');
    button.disabled = true;

    window.API
      .put('/api/settings', {
        theme: els.theme.value,
        language: els.language.value,
        dateFormat: els.dateFormat.value,
      })
      .then(function () {
        showMessage('Preferences saved.');
      })
      .catch(function (err) {
        showMessage(err.message || 'Unable to save. Please try again.', true);
      })
      .then(function () {
        button.disabled = false;
      });
  });
})();
