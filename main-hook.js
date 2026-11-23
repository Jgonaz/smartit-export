// Se ejecuta en el contexto de la página (world: MAIN) antes que la app.
// Solo OBSERVA las peticiones que la propia app hace a /arsys/web/ para conocer
// la cabecera de sesión "st" y el formNameToken de cada formulario. No modifica nada.
(() => {
  'use strict';
  const root = document.documentElement;
  const forms = {};

  function remember(url, headers, body) {
    if (!/\/arsys\/web\//.test(String(url))) return;
    if (headers.st) root.dataset.sieSt = headers.st;
    if (typeof body === 'string' && body.includes('formNameToken')) {
      try {
        const j = JSON.parse(body);
        if (j.currentSchema && j.formNameToken) {
          forms[j.currentSchema] = j.formNameToken;
          root.dataset.sieForms = JSON.stringify(forms);
        }
      } catch (_) { /* no es JSON */ }
    }
  }

  const X = XMLHttpRequest.prototype;
  const origOpen = X.open, origSet = X.setRequestHeader, origSend = X.send;
  X.open = function (method, url) {
    this.__sie = { url, headers: {} };
    return origOpen.apply(this, arguments);
  };
  X.setRequestHeader = function (name, value) {
    if (this.__sie) this.__sie.headers[String(name).toLowerCase()] = value;
    return origSet.apply(this, arguments);
  };
  X.send = function (body) {
    try { if (this.__sie) remember(this.__sie.url, this.__sie.headers, body); } catch (_) {}
    return origSend.apply(this, arguments);
  };

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = typeof input === 'string' ? input : input && input.url;
      const h = {};
      const src = (init && init.headers) || (input && input.headers);
      if (src) new Headers(src).forEach((v, k) => { h[k] = v; });
      remember(url, h, init && init.body);
    } catch (_) {}
    return origFetch.apply(this, arguments);
  };
})();
