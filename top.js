// Página principal de SmartIT: añade el icono de exportar en la cabecera (a la izquierda de la lupa)
// y le pide al iframe de la ficha (Helix Progressive Views) que haga la exportación.
(() => {
  'use strict';
  if (window.top !== window) return;

  const ICON_ID = 'sie-header-export';
  const SVG = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 3h6v3H9z"/>
    <path d="M8.5 11h7M8.5 14.5h7M8.5 18h4"/></svg>`;
  const isOnbmc = origin => /^https:\/\/[\w.-]+\.onbmc\.com$/.test(origin);

  const style = document.createElement('style');
  style.textContent = `
    #${ICON_ID}{float:left;display:block;padding:12px 10px 8px;margin-top:2px;color:#fff;cursor:pointer;opacity:.9;line-height:0}
    #${ICON_ID}:hover{opacity:1}
    #${ICON_ID}.busy{cursor:progress;animation:sie-pulse 1s ease-in-out infinite}
    #${ICON_ID}.hidden{display:none}
    @keyframes sie-pulse{50%{opacity:.35}}`;
  document.documentElement.appendChild(style);

  let busy = false;
  let startTimer = null;

  function setState(state, title) {
    const a = document.getElementById(ICON_ID);
    if (!a) return;
    a.classList.toggle('busy', state === 'busy');
    a.title = title || 'Exportar incidencia (texto + adjuntos)';
  }

  function visibleFrames() {
    return [...document.querySelectorAll('iframe')].filter(f => f.offsetWidth > 0 && f.offsetHeight > 0);
  }

  function requestExport() {
    if (busy) return;
    busy = true;
    setState('busy', 'Preparando exportación…');
    visibleFrames().forEach(f => {
      try { f.contentWindow.postMessage({ sie: 'export', url: location.href }, '*'); } catch (_) {}
    });
    // Si ninguna ficha responde, no hay incidencia abierta en vista Helix.
    startTimer = setTimeout(() => {
      busy = false;
      setState('idle', 'No hay ninguna incidencia abierta que exportar');
      setTimeout(() => setState('idle'), 3000);
    }, 2500);
  }

  window.addEventListener('message', e => {
    if (!isOnbmc(e.origin) || !e.data || typeof e.data.sie !== 'string') return;
    if (e.data.sie === 'started' || e.data.sie === 'progress') {
      clearTimeout(startTimer);
      busy = true;
      setState('busy', e.data.text || 'Exportando…');
    } else if (e.data.sie === 'done' || e.data.sie === 'error') {
      clearTimeout(startTimer);
      busy = false;
      setState('idle', e.data.sie === 'error' ? `Error: ${e.data.text || ''}` : undefined);
    }
  });

  function ensureIcon() {
    const search = document.getElementById('header-helixGPT_search_button')
      || document.querySelector('.header__user .navigation-bar__search');
    let a = document.getElementById(ICON_ID);
    if (search && !a) {
      a = document.createElement('a');
      a.id = ICON_ID;
      a.setAttribute('role', 'button');
      a.setAttribute('aria-label', 'Exportar incidencia');
      a.tabIndex = 0;
      a.innerHTML = SVG;
      a.addEventListener('click', requestExport);
      a.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); requestExport(); } });
      search.parentElement.insertBefore(a, search);
      setState('idle');
    }
    // Solo tiene sentido en las vistas de ticket (…PV/<id>).
    if (a) a.classList.toggle('hidden', !/#\/\w+PV\//.test(location.hash));
  }

  ensureIcon();
  setInterval(ensureIcon, 1500);
})();
