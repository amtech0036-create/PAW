/**
 * Authentication UI (Phase 8, PRD sections 8/30/33).
 *
 * Page modes, driven by <body data-auth="...">:
 *   required - protected page: verify the session, redirect to login if absent.
 *   guest    - login/register/landing: bounce an already-logged-in user to the
 *              dashboard.
 *
 * All state lives in the HTTP-only cookie; nothing is stored in localStorage
 * (PRD section 30).
 */
(function () {
  'use strict';

  var body = document.body;

  function qsParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function goTo(page) {
    window.location.replace(page);
  }

  function safeNext() {
    var next = qsParam('next');
    // Only allow in-app pages to avoid open redirects.
    if (next && /^[\w-]+\.html$/.test(next)) return next;
    return 'dashboard.html';
  }

  var Auth = {
    /** Resolves with { user } once the session is verified for this page. */
    ready: null,

    logout: function () {
      return window.API.post('/api/auth/logout').then(function () {
        goTo('login.html');
      });
    },
  };

  function guardProtectedPage() {
    Auth.ready = window.API.get('/api/auth/me').then(
      function (data) {
        window.currentUser = data.user;
        document.dispatchEvent(new CustomEvent('user:ready', { detail: data.user }));
        return data.user;
      },
      function () {
        var next = encodeURIComponent(
          window.location.pathname.split('/').pop() || 'dashboard.html'
        );
        goTo('login.html?next=' + next);
        return new Promise(function () {}); // stop page scripts while redirecting
      }
    );
  }

  function guardGuestPage() {
    Auth.ready = window.API.get('/api/auth/me').then(
      function (data) {
        // Already logged in - no reason to show login/register again.
        goTo('dashboard.html');
        return new Promise(function () {});
      },
      function () {
        return null; // stay on the guest page
      }
    );
  }

  function showError(el, message) {
    el.textContent = message;
    el.classList.add('visible');
  }

  function clearError(el) {
    el.textContent = '';
    el.classList.remove('visible');
  }

  function wireLoginForm() {
    var form = document.getElementById('login-form');
    if (!form) return;
    var errorEl = document.getElementById('login-error');

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      clearError(errorEl);

      var email = form.email.value.trim();
      var password = form.password.value;

      if (!email || !password) {
        showError(errorEl, 'Please enter your email and password.');
        return;
      }

      var button = form.querySelector('button[type="submit"]');
      button.disabled = true;

      window.API.post('/api/auth/login', { email: email, password: password })
        .then(function () {
          goTo(safeNext());
        })
        .catch(function (err) {
          showError(errorEl, err.message || 'Unable to log in. Please try again.');
          button.disabled = false;
        });
    });
  }

  function wireRegisterForm() {
    var form = document.getElementById('register-form');
    if (!form) return;
    var errorEl = document.getElementById('register-error');

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      clearError(errorEl);

      var name = form.name.value.trim();
      var email = form.email.value.trim();
      var password = form.password.value;
      var confirm = form.confirmPassword.value;

      if (!name) {
        showError(errorEl, 'Please enter your name.');
        return;
      }
      if (password.length < 8) {
        showError(errorEl, 'Password must be at least 8 characters.');
        return;
      }
      if (password !== confirm) {
        showError(errorEl, 'Passwords do not match.');
        return;
      }

      var button = form.querySelector('button[type="submit"]');
      button.disabled = true;

      window.API
        .post('/api/auth/register', { name: name, email: email, password: password })
        .then(function () {
          goTo('dashboard.html');
        })
        .catch(function (err) {
          showError(errorEl, err.message || 'Unable to create the account. Please try again.');
          button.disabled = false;
        });
    });
  }

  function wireLogoutButtons() {
    Array.prototype.forEach.call(
      document.querySelectorAll('[data-action="logout"]'),
      function (button) {
        button.addEventListener('click', function () {
          button.disabled = true;
          Auth.logout().catch(function () {
            // Even if the API call fails, send the user to a clean login.
            goTo('login.html');
          });
        });
      }
    );
  }

  var mode = body.getAttribute('data-auth');
  if (mode === 'required') {
    guardProtectedPage();
  } else if (mode === 'guest') {
    guardGuestPage();
  }

  wireLoginForm();
  wireRegisterForm();
  wireLogoutButtons();

  window.Auth = Auth;
})();
