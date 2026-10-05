/**
 * PWA wiring (Phase 14, PRD sections 40-41).
 * Registers the service worker and shows the offline banner with the exact
 * PRD section 41 copy while there is no internet connection.
 */
(function () {
  'use strict';

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {
        // Registration failures (e.g. insecure context) must not break the app.
      });
    });
  }

  var banner = null;

  function ensureBanner() {
    if (banner) return banner;
    banner = document.createElement('div');
    banner.className = 'offline-banner';
    banner.setAttribute('role', 'status');
    banner.textContent = 'You are offline. Connect to the internet to save transactions.';
    document.body.appendChild(banner);
    return banner;
  }

  function updateBanner() {
    ensureBanner();
    banner.classList.toggle('visible', !navigator.onLine);
  }

  window.addEventListener('online', updateBanner);
  window.addEventListener('offline', updateBanner);
  updateBanner();
})();
