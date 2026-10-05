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

  // Data section (Phase 15: Export / Import).
  var btnExportCsv = document.getElementById('btn-export-csv');
  var btnExportJson = document.getElementById('btn-export-json');
  var btnImportJson = document.getElementById('btn-import-json');
  var importFileInput = document.getElementById('import-file-input');
  var dataMessage = document.getElementById('data-message');

  function showDataMessage(msg, isError) {
    if (!dataMessage) return;
    dataMessage.textContent = msg;
    dataMessage.classList.toggle('visible', true);
    dataMessage.classList.toggle('form-error', !!isError);
    dataMessage.classList.toggle('form-success', !isError);
  }

  function hideDataMessage() {
    if (!dataMessage) return;
    dataMessage.textContent = '';
    dataMessage.classList.remove('visible', 'form-error', 'form-success');
  }

  function downloadFromEndpoint(url, fallbackName) {
    hideDataMessage();
    fetch(url, { credentials: 'include' })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (err) {
            throw new Error(err.error || 'Export failed');
          });
        }
        var disposition = res.headers.get('content-disposition') || '';
        var match = disposition.match(/filename="?([^"]+)"?/);
        var filename = match ? match[1] : fallbackName;
        return res.blob().then(function (blob) {
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(function () {
            URL.revokeObjectURL(a.href);
          }, 1000);
          showDataMessage('Export downloaded successfully.');
        });
      })
      .catch(function (err) {
        showDataMessage(err.message || 'Export failed. Please try again.', true);
      });
  }

  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', function () {
      downloadFromEndpoint('/api/export/csv', 'cashflow-transactions.csv');
    });
  }

  if (btnExportJson) {
    btnExportJson.addEventListener('click', function () {
      downloadFromEndpoint('/api/export/json', 'cashflow-backup.json');
    });
  }

  if (btnImportJson && importFileInput) {
    btnImportJson.addEventListener('click', function () {
      hideDataMessage();
      importFileInput.value = '';
      importFileInput.click();
    });

    importFileInput.addEventListener('change', function () {
      var file = importFileInput.files && importFileInput.files[0];
      if (!file) return;

      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var payload = JSON.parse(e.target.result);
          var txns = Array.isArray(payload) ? payload : payload.transactions;
          var count = Array.isArray(txns) ? txns.length : 0;

          if (count === 0) {
            showDataMessage('No transactions found in this JSON file.', true);
            return;
          }

          var confirmed = window.confirm('Import ' + count + ' transactions into your account?');
          if (!confirmed) return;

          btnImportJson.disabled = true;
          window.API.post('/api/import/json', payload)
            .then(function (result) {
              showDataMessage(
                'Imported ' +
                  result.imported.transactions +
                  ' transactions (' +
                  result.imported.categoriesCreated +
                  ' new categories created).'
              );
              if (window.Categories) window.Categories.load();
              window.API.get('/api/settings').then(renderSettings).catch(function () {});
            })
            .catch(function (err) {
              var errMsg = err.message || 'Import failed.';
              if (err.details && err.details.length) {
                errMsg += ' ' + err.details.join('; ');
              }
              showDataMessage(errMsg, true);
            })
            .then(function () {
              btnImportJson.disabled = false;
            });
        } catch (parseErr) {
          showDataMessage('Invalid JSON file format: ' + parseErr.message, true);
        }
      };
      reader.readAsText(file);
    });
  }
})();

