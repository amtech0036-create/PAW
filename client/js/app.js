/**
 * Personal Cash Flow Tracker - frontend entry (Phase 1).
 * Checks API connectivity so the user can see the backend is reachable.
 */
(function () {
  'use strict';

  var apiStatus = document.getElementById('api-status');
  var dbStatus = document.getElementById('db-status');
  var statusNote = document.getElementById('status-note');

  function setText(el, text, cls) {
    el.textContent = text;
    el.className = 'status-value' + (cls ? ' ' + cls : '');
  }

  fetch('/api/health')
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) {
      setText(apiStatus, 'Online', 'ok');
      if (data.db === 'connected') {
        setText(dbStatus, 'Connected', 'ok');
      } else {
        setText(dbStatus, 'Disconnected', 'bad');
        statusNote.textContent =
          'MongoDB is not reachable. The server is running; start MongoDB or check MONGODB_URI.';
      }
    })
    .catch(function () {
      setText(apiStatus, 'Offline', 'bad');
      setText(dbStatus, 'Unknown', '');
      statusNote.textContent =
        'Unable to reach the server. Please check your internet connection.';
    });
})();
