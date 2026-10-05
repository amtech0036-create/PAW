/**
 * Shared API helper (Phases 8+).
 * All calls send cookies (HTTP-only JWT, PRD section 30) and parse the
 * { error } envelope the backend returns. Frontend never computes financial
 * truth - it only renders backend numbers (PRD section 18).
 */
(function () {
  'use strict';

  async function request(method, path, { body, query } = {}) {
    let url = path;
    if (query) {
      const params = new URLSearchParams();
      Object.keys(query).forEach(function (key) {
        if (query[key] !== undefined && query[key] !== null && query[key] !== '') {
          params.set(key, query[key]);
        }
      });
      const qs = params.toString();
      if (qs) url += (url.includes('?') ? '&' : '?') + qs;
    }

    const options = {
      method,
      credentials: 'include',
      headers: {},
    };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(url, options);
    } catch (networkError) {
      const err = new Error('Unable to reach the server. Please check your internet connection.');
      err.status = 0;
      throw err;
    }

    let data = null;
    try {
      data = await response.json();
    } catch (parseError) {
      /* non-JSON body */
    }

    if (!response.ok) {
      const err = new Error((data && data.error) || 'Something went wrong. Please try again.');
      err.status = response.status;
      err.data = data;
      throw err;
    }

    return data;
  }

  window.API = {
    get: function (path, query) {
      return request('GET', path, { query });
    },
    post: function (path, body) {
      return request('POST', path, { body });
    },
    put: function (path, body) {
      return request('PUT', path, { body });
    },
    del: function (path) {
      return request('DELETE', path);
    },
  };
})();
