// Página principal de SmartIT: añade el icono de exportar en la cabecera (a la izquierda de la lupa).
// Al pulsarlo, cubre el contenido (no la cabecera) con una capa que se funde a blanco, muestra el
// progreso y, al terminar, pinta el visor dentro de la propia página. El icono pasa a ser una flecha
// circular para volver a SmartIT. Todo con transiciones suaves.
(() => {
  'use strict';
  if (window.top !== window) return;

  const ICON_ID = 'sie-header-export';
  const OVERLAY_ID = 'sie-overlay';
  const SVG_CLIP = `<svg class="sie-i sie-i-clip" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 3h6v3H9z"/><path d="M8.5 11h7M8.5 14.5h7M8.5 18h4"/></svg>`;
  const SVG_BACK = `<svg class="sie-i sie-i-back" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v4.5h4.5"/></svg>`;
  const isOnbmc = origin => /^https:\/\/[\w.-]+\.onbmc\.com$/.test(origin);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const T = ms => (reduce ? 1 : ms);

  const style = document.createElement('style');
  style.textContent = `
    #${ICON_ID}{float:left;position:relative;display:flex;align-items:center;justify-content:center;box-sizing:content-box;width:30px;height:20px;padding:10px 6px;margin-top:2px;color:#fff;cursor:pointer;opacity:.9;line-height:0}
    #${ICON_ID}:hover{opacity:1}
    #${ICON_ID}.hidden{display:none}
    #${ICON_ID}.appear .sie-i-clip{animation:sie-pop ${T(520)}ms cubic-bezier(.2,.9,.25,1.25) backwards}
    #${ICON_ID}.open .sie-i-clip{animation:none}
    #${ICON_ID}:focus{outline:none}
    #${ICON_ID}:focus-visible{outline:2px solid rgba(255,255,255,.6);outline-offset:1px;border-radius:6px}
    #${ICON_ID} .sie-splash{position:absolute;left:50%;top:50%;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;
      border:2px solid rgba(255,255,255,.55);opacity:0;pointer-events:none}
    #${ICON_ID}.appear .sie-splash{animation:sie-splash ${T(700)}ms ease-out ${T(160)}ms backwards}
    @keyframes sie-pop{0%{opacity:0;transform:scale(.4) rotate(-12deg)}60%{opacity:1;transform:scale(1.08) rotate(2deg)}100%{opacity:1;transform:none}}
    @keyframes sie-splash{0%{opacity:.7;transform:scale(.6)}100%{opacity:0;transform:scale(1.6)}}
    #${ICON_ID} .sie-dot{position:absolute;top:4px;right:3px;width:10px;height:10px;border-radius:50%;background:#F5A524;box-shadow:0 0 0 2px #3B3B3B;
      opacity:0;transform:scale(.4);transition:opacity ${T(250)}ms ease, transform ${T(300)}ms cubic-bezier(.2,.7,.2,1);pointer-events:none}
    #${ICON_ID}.has-update .sie-dot{opacity:1;transform:none}
    #${ICON_ID}.open .sie-dot{opacity:0}
    #${ICON_ID} .sie-i{position:absolute;left:6px;top:5px;flex:none!important;overflow:visible!important;width:30px!important;height:30px!important;
      min-width:30px!important;min-height:30px!important;max-width:none!important;max-height:none!important;margin:0!important;
      transition:opacity ${T(220)}ms ease, transform ${T(320)}ms cubic-bezier(.2,.7,.2,1)}
    #${ICON_ID} .sie-i-back{opacity:0;transform:rotate(-120deg) scale(.7)}
    #${ICON_ID}.open .sie-i-clip{opacity:0;transform:rotate(90deg) scale(.7)}
    #${ICON_ID}.open .sie-i-back{opacity:1;transform:none}

    #${OVERLAY_ID}{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;background:#FBFBFA;opacity:0;visibility:hidden;
      --ink:#161616;--card:#FFFFFF;--grey:#5E5E5E;--hair:#ECECEC;--salmon:#F5A28A;--mint:#A9DCC6;
      transition:opacity ${T(320)}ms ease, visibility 0s linear ${T(320)}ms}
    #${OVERLAY_ID}.show{opacity:1;visibility:visible;transition:opacity ${T(320)}ms ease, visibility 0s}
    #${OVERLAY_ID} .sie-status{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
      opacity:0;transform:translateY(8px);transition:opacity ${T(260)}ms ease, transform ${T(320)}ms cubic-bezier(.2,.7,.2,1)}
    #${OVERLAY_ID}.show .sie-status.on{opacity:1;transform:none;transition-delay:${T(120)}ms}
    #${OVERLAY_ID} .sie-card{display:flex;align-items:center;gap:20px;min-width:380px;padding:22px 28px 22px 22px;background:var(--card);
      border:1.5px solid var(--ink);border-radius:12px;box-shadow:9px 9px 0 var(--mint);color:var(--ink);
      font:400 15px/1.45 "SIE DM Sans","DM Sans","Segoe UI",system-ui,sans-serif;transition:box-shadow ${T(300)}ms ease}
    #${OVERLAY_ID} .sie-copy{display:flex;flex-direction:column;gap:3px;min-width:0}
    #${OVERLAY_ID} .sie-h{font:700 15px/1.3 "SIE JetBrains Mono","JetBrains Mono",Consolas,ui-monospace,monospace}
    #${OVERLAY_ID} .sie-ring{position:relative;width:64px;height:64px;flex:none}
    #${OVERLAY_ID} .sie-ring svg{width:64px;height:64px;transform:rotate(-90deg);display:block}
    #${OVERLAY_ID} .sie-ring .out{fill:none;stroke:var(--ink);stroke-width:10}
    #${OVERLAY_ID} .sie-ring .trk{fill:none;stroke:var(--card);stroke-width:7}
    #${OVERLAY_ID} .sie-ring .fill{fill:none;stroke:var(--salmon);stroke-width:7;stroke-dasharray:169.65;stroke-dashoffset:127;
      transition:stroke-dashoffset ${T(550)}ms cubic-bezier(.2,.7,.2,1)}
    #${OVERLAY_ID} .sie-ring .lead{fill:none;stroke:var(--salmon);stroke-opacity:.45;stroke-width:7;stroke-dasharray:169.65;
      stroke-dashoffset:var(--from,169.65);animation:sie-lead 1.4s ease-in-out infinite}
    #${OVERLAY_ID} .sie-ring.indet .lead, #${OVERLAY_ID} .sie-ring.full .lead{display:none}
    #${OVERLAY_ID} .sie-ring.full .fill{stroke:var(--mint)}
    @keyframes sie-lead{0%,100%{stroke-dashoffset:var(--from,169.65)}50%{stroke-dashoffset:var(--to,169.65)}}
    #${OVERLAY_ID} .sie-ring.indet svg{animation:sie-spin-r 1s linear infinite}
    #${OVERLAY_ID} .sie-count{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
      font:700 12px/1 "SIE JetBrains Mono","JetBrains Mono",Consolas,ui-monospace,monospace;color:var(--ink);
      font-variant-numeric:tabular-nums;transition:opacity ${T(200)}ms ease}
    @keyframes sie-spin-r{from{transform:rotate(-90deg)}to{transform:rotate(270deg)}}
    #${OVERLAY_ID} .sie-text{min-height:21px;color:var(--grey)}
    #${OVERLAY_ID} .sie-text.enter{animation:sie-text-in ${T(420)}ms cubic-bezier(.2,.7,.2,1)}
    @keyframes sie-text-in{0%{opacity:0;transform:translateY(7px)}100%{opacity:1;transform:none}}
    #${OVERLAY_ID} .sie-status.err .sie-ring{display:none}
    #${OVERLAY_ID} .sie-status.err .sie-card{box-shadow:9px 9px 0 var(--salmon)}
    #${OVERLAY_ID} .sie-err-ico{display:none;flex:none;width:48px;height:48px;border-radius:50%;border:2px solid var(--ink);background:var(--salmon);color:var(--ink);
      font:700 22px/44px "SIE JetBrains Mono",Consolas,monospace;text-align:center}
    #${OVERLAY_ID} .sie-status.err .sie-err-ico{display:block}
    #${OVERLAY_ID} iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:transparent;opacity:0;transform:translateY(10px);
      transition:opacity ${T(380)}ms ease, transform ${T(420)}ms cubic-bezier(.2,.7,.2,1)}
    #${OVERLAY_ID} iframe.on{opacity:1;transform:none}
    #${OVERLAY_ID}.dark{background:#121419;--ink:#EEF0F4;--card:#1B1E25;--grey:#A3A9B5;--hair:#2B2F38;--salmon:#D98770;--mint:#82BBA3}
    #${OVERLAY_ID}.dark .sie-card{border-color:#C9CDD6}
    #${OVERLAY_ID}.dark .sie-ring .out{stroke:#C9CDD6}
    #${OVERLAY_ID}.dark .sie-err-ico{border-color:#C9CDD6}
    #${OVERLAY_ID}.classic{background:#F4F5F8;--ink:#14161B;--card:#FFFFFF;--grey:#6B7180;--salmon:#2E44C7;--mint:#146C3A;--trk:#E4E6EC}
    #${OVERLAY_ID}.classic.dark{background:#0F1115;--ink:#ECEEF3;--card:#171A21;--grey:#8E95A5;--salmon:#8B9BFF;--mint:#6FD39A;--trk:#262A33}
    #${OVERLAY_ID}.classic .sie-card, #${OVERLAY_ID}.classic.dark .sie-card{border:1px solid #E4E6EC;box-shadow:0 1px 2px rgba(20,22,27,.04),0 2px 10px rgba(20,22,27,.05);font-family:"SIE Inter",Inter,"Segoe UI",system-ui,sans-serif}
    #${OVERLAY_ID}.classic.dark .sie-card{border-color:#262A33;box-shadow:0 1px 0 rgba(0,0,0,.35)}
    #${OVERLAY_ID}.classic .sie-h{font:600 15px/1.3 "SIE Inter",Inter,"Segoe UI",system-ui,sans-serif}
    #${OVERLAY_ID}.classic .sie-count{font:600 12px/1 "SIE Inter",Inter,"Segoe UI",system-ui,sans-serif}
    #${OVERLAY_ID}.classic .sie-ring .out{stroke:transparent}
    #${OVERLAY_ID}.classic .sie-ring .trk{stroke:var(--trk);stroke-width:5}
    #${OVERLAY_ID}.classic .sie-ring .fill, #${OVERLAY_ID}.classic .sie-ring .lead{stroke-width:5;stroke-linecap:round}
    #${OVERLAY_ID}.classic .sie-status.err .sie-card{box-shadow:0 1px 2px rgba(20,22,27,.04),0 2px 10px rgba(20,22,27,.05)}
    #${OVERLAY_ID}.classic .sie-err-ico{border:0;background:#FDECEC;color:#A3261F}
    #${OVERLAY_ID}.classic.dark .sie-err-ico{background:#3A1515;color:#F59A93}

    #${OVERLAY_ID} .sie-setup{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;
      opacity:0;visibility:hidden;transform:translateY(8px);transition:opacity ${T(260)}ms ease, transform ${T(320)}ms cubic-bezier(.2,.7,.2,1), visibility 0s linear ${T(320)}ms}
    #${OVERLAY_ID}.show .sie-setup.on{opacity:1;visibility:visible;transform:none;transition-delay:${T(120)}ms,${T(120)}ms,0s}
    #${OVERLAY_ID} .sie-setup .sie-card{flex-direction:column;align-items:stretch;gap:16px;width:min(520px,100%);min-width:0;padding:26px 28px 24px;box-sizing:border-box}
    #${OVERLAY_ID} .sie-setup .sie-h{font-size:17px}
    #${OVERLAY_ID} .sie-sub{margin:-8px 0 0;color:var(--grey)}
    #${OVERLAY_ID} .sie-step{display:flex;gap:14px;align-items:flex-start;padding-top:14px;border-top:1px solid var(--hair)}
    #${OVERLAY_ID} .sie-n{flex:none;width:26px;height:26px;border-radius:50%;border:1.5px solid var(--ink);display:flex;align-items:center;justify-content:center;
      font:700 13px/1 "SIE JetBrains Mono","JetBrains Mono",Consolas,monospace;transition:background-color ${T(200)}ms ease}
    #${OVERLAY_ID} .sie-step.done .sie-n{background:var(--mint)}
    #${OVERLAY_ID} .sie-stepbody{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
    #${OVERLAY_ID} .sie-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
    #${OVERLAY_ID} .sie-lbl{font-weight:700;display:block}
    #${OVERLAY_ID} .sie-row .sie-lbl{display:inline}
    #${OVERLAY_ID} .sie-val{color:var(--grey)}
    #${OVERLAY_ID} .sie-hint{color:var(--grey);font-size:13px;line-height:1.45}
    #${OVERLAY_ID} .sie-setup input{box-sizing:border-box;width:100%;height:40px;margin:0;padding:0 12px;border:1.5px solid var(--ink);border-radius:8px;background:var(--card);color:var(--ink);
      font:400 14px/1.2 "SIE JetBrains Mono","JetBrains Mono",Consolas,monospace;outline:none;box-shadow:none}
    #${OVERLAY_ID} .sie-setup input:focus-visible{outline:2px solid var(--ink);outline-offset:1px}
    #${OVERLAY_ID} .sie-setup button{box-sizing:border-box;margin:0;font:600 14px/1 "SIE DM Sans","DM Sans","Segoe UI",system-ui,sans-serif;cursor:pointer;text-transform:none;letter-spacing:0}
    #${OVERLAY_ID} .sie-btn{height:38px;padding:0 14px;border:1.5px solid var(--ink);border-radius:9px;background:var(--card);color:var(--ink);box-shadow:3px 3px 0 var(--salmon);transition:transform .12s ease, box-shadow .12s ease}
    #${OVERLAY_ID} .sie-btn:hover{transform:translate(-1px,-1px);box-shadow:4px 4px 0 var(--salmon)}
    #${OVERLAY_ID} .sie-btn:focus-visible, #${OVERLAY_ID} .sie-link:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
    #${OVERLAY_ID} .sie-btn.primary{background:var(--ink);color:var(--card)}
    #${OVERLAY_ID} .sie-btn:disabled{opacity:.45;cursor:not-allowed;transform:none;box-shadow:3px 3px 0 var(--hair)}
    #${OVERLAY_ID} .sie-link{height:38px;padding:0 6px;border:0;background:none;color:var(--grey);text-decoration:underline;text-underline-offset:3px}
    #${OVERLAY_ID} .sie-link:hover{color:var(--ink)}
    #${OVERLAY_ID} .sie-note{margin:0;padding:10px 12px;border-radius:8px;background:var(--hair);font-size:13px;line-height:1.45}
    #${OVERLAY_ID} .sie-foot{display:flex;justify-content:flex-end;align-items:center;gap:12px;padding-top:4px}
    #${OVERLAY_ID}.dark .sie-n, #${OVERLAY_ID}.dark .sie-btn, #${OVERLAY_ID}.dark .sie-setup input{border-color:#C9CDD6}
    #${OVERLAY_ID}.classic .sie-n{border:1px solid #D5D8E0}
    #${OVERLAY_ID}.classic .sie-step.done .sie-n{background:#E6F4EC;border-color:transparent;color:#146C3A}
    #${OVERLAY_ID}.classic .sie-btn{border:1px solid #D5D8E0;box-shadow:none;border-radius:8px;font-family:"SIE Inter",Inter,"Segoe UI",system-ui,sans-serif}
    #${OVERLAY_ID}.classic .sie-btn:hover{transform:none;box-shadow:none;background:#F4F5F8}
    #${OVERLAY_ID}.classic .sie-btn.primary{background:#2E44C7;border-color:#2E44C7;color:#fff}
    #${OVERLAY_ID}.classic.dark .sie-btn{border-color:#262A33}
    #${OVERLAY_ID}.classic.dark .sie-btn:hover{background:#1F232C}
    #${OVERLAY_ID}.classic.dark .sie-btn.primary{background:#8B9BFF;border-color:#8B9BFF;color:#0F1115}
    #${OVERLAY_ID}.classic .sie-setup input{border:1px solid #D5D8E0;font-family:"SIE Inter",Inter,"Segoe UI",system-ui,sans-serif}
    #${OVERLAY_ID}.classic.dark .sie-setup input{border-color:#262A33}
    @media (prefers-reduced-motion: reduce){#${OVERLAY_ID} .sie-ring svg, #${OVERLAY_ID} .sie-ring .lead{animation:none}}
    @keyframes sie-spin{to{transform:rotate(360deg)}}`;
  // Fuentes del visor, incluidas en la extensión (nombre propio para no chocar con las de SmartIT).
  try {
    const f = (fam, w, file) => `@font-face{font-family:"${fam}";font-weight:${w};font-display:swap;src:url("${chrome.runtime.getURL('fonts/' + file)}") format("woff2")}`;
    style.textContent = f('SIE DM Sans', 400, 'dm-sans-latin-400-normal.woff2') + f('SIE JetBrains Mono', 700, 'jetbrains-mono-latin-700-normal.woff2') +
      f('SIE Inter', 400, 'inter-latin-400-normal.woff2') + f('SIE Inter', 600, 'inter-latin-600-normal.woff2') + style.textContent;
  } catch (_) { /* sin acceso a la extensión: fuentes del sistema */ }
  document.documentElement.appendChild(style);

  // Tema del visor (claro/oscuro/sistema), para que la capa se funda al color correcto.
  let themePref = 'light';
  let stylePref = 'cards';
  const mqDark = window.matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => themePref === 'dark' || (themePref === 'system' && mqDark.matches);
  try {
    chrome.storage.local.get(['theme', 'style']).then(r => { themePref = r.theme || 'light'; stylePref = r.style || 'cards'; paintTheme(); }).catch(() => {});
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area !== 'local') return;
      if (ch.theme) themePref = ch.theme.newValue || 'light';
      if (ch.style) stylePref = ch.style.newValue || 'cards';
      if (ch.theme || ch.style) paintTheme();
    });
  } catch (_) { /* sin acceso al almacenamiento: tema claro */ }
  mqDark.addEventListener('change', () => paintTheme());
  function paintTheme() {
    if (!overlay) return;
    overlay.classList.toggle('dark', isDark());
    overlay.classList.toggle('classic', stylePref === 'classic');
  }

  // ¿La ficha de la incidencia ha terminado de cargar? Lo avisa content.js desde el iframe.
  let ticketReady = false;
  let readySince = 0;      // ignora avisos antiguos justo después de cambiar de incidencia

  // Estado: idle (SmartIT visible) | loading (analizando) | open (visor visible)
  let state = 'idle';
  let token = 0;            // invalida respuestas de exportaciones canceladas
  let cache = null;         // { hash, iframe } del último visor, para volver a abrirlo al instante
  let startTimer = null;
  let overlay, statusEl, textEl;

  const icon = () => document.getElementById(ICON_ID);
  const wait = ms => new Promise(r => setTimeout(r, T(ms)));

  let update = null; // { remote } si hay una versión nueva de la extensión
  function setIcon(open, title) {
    const a = icon();
    if (!a) return;
    a.classList.toggle('open', open);
    a.classList.toggle('has-update', !!update);
    const base = title || (open ? 'Volver a SmartIT' : 'Exportar incidencia (texto + adjuntos)');
    a.title = (!open && update) ? `${base}\nHay una versión nueva de la extensión (${update.remote})` : base;
    a.setAttribute('aria-label', a.title);
  }
  // ¿Sigue conectada la extensión? Al recargarla o actualizarla, este script sigue vivo en las pestañas
  // ya abiertas pero sin extensión detrás, y cualquier llamada a chrome.* lanza «Extension context
  // invalidated». En ese caso se para todo en silencio y se quita el icono: al recargar la página vuelve.
  let dead = false;
  const timers = [];
  function alive() {
    if (dead) return false;
    let ok = false;
    try { ok = !!(chrome.runtime && chrome.runtime.id); } catch (_) { ok = false; }
    if (!ok) shutdown();
    return ok;
  }
  function shutdown() {
    if (dead) return;
    dead = true;
    timers.forEach(clearInterval);
    window.removeEventListener('focus', checkUpdate);
    try { const a = icon(); if (a) a.remove(); } catch (_) {}
    try { if (overlay) overlay.remove(); } catch (_) {}
  }
  // Aviso de versión nueva (la comprobación, como mucho diaria, la hace background.js).
  function checkUpdate() {
    if (!alive()) return;
    let req;
    try { req = chrome.runtime.sendMessage({ type: 'update-info' }); } catch (_) { shutdown(); return; }
    req.then(info => {
      update = info && info.available && !info.dismissed ? info : null;
      setIcon(state !== 'idle');
    }).catch(() => {});
  }

  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = '<div class="sie-status" role="status" aria-live="polite">' +
      '<div class="sie-card"><div class="sie-ring indet" aria-hidden="true"><svg viewBox="0 0 64 64"><circle class="out" cx="32" cy="32" r="27"/><circle class="trk" cx="32" cy="32" r="27"/><circle class="lead" cx="32" cy="32" r="27"/><circle class="fill" cx="32" cy="32" r="27"/></svg><span class="sie-count"></span></div>' +
      '<div class="sie-err-ico">!</div><div class="sie-copy"><div class="sie-h">Exportando incidencia</div><div class="sie-text"></div></div></div></div>' +
      '<div class="sie-setup" role="dialog" aria-modal="true" aria-labelledby="sie-setup-h"><div class="sie-card">' +
      '<div class="sie-h" id="sie-setup-h">Antes de empezar</div>' +
      '<p class="sie-sub">Cada incidencia que abras se guardará sola en una carpeta de tu equipo, con sus adjuntos, para que tu agente pueda leerla.</p>' +
      '<div class="sie-step" data-step="folder"><span class="sie-n">1</span><div class="sie-stepbody"><div class="sie-row"><div><span class="sie-lbl">Carpeta</span><span class="sie-val"></span></div>' +
      '<button type="button" class="sie-btn" data-act="pick">Elegir carpeta</button></div><div class="sie-hint" data-hint="folder"></div></div></div>' +
      '<div class="sie-step" data-step="path"><span class="sie-n">2</span><div class="sie-stepbody"><label class="sie-lbl" for="sie-path">Ruta para el agente</label>' +
      '<input id="sie-path" type="text" spellcheck="false" autocomplete="off" placeholder="/mnt/c/Users/tu-usuario/smartit">' +
      '<div class="sie-hint">Cómo ve tu agente esa carpeta (por ejemplo, desde WSL). Chrome solo le da su nombre a la extensión.</div></div></div>' +
      '<div class="sie-foot"><button type="button" class="sie-link" data-act="skip">Ahora no</button><button type="button" class="sie-btn primary" data-act="go" disabled>Empezar</button></div>' +
      '</div></div>';
    statusEl = overlay.querySelector('.sie-status');
    textEl = overlay.querySelector('.sie-text');
    setupEl = overlay.querySelector('.sie-setup');
    wireSetup();
    document.body.appendChild(overlay);
    paintTheme();
    placeOverlay();
    window.addEventListener('resize', placeOverlay);
  }

  // La capa empieza justo debajo de la cabecera de SmartIT.
  function placeOverlay() {
    if (!overlay) return;
    const header = document.querySelector('.app__header') || document.querySelector('.header__navigation-bar');
    const top = header ? Math.max(0, Math.round(header.getBoundingClientRect().bottom)) : 50;
    overlay.style.top = top + 'px';
  }

  // Si una página tarda, el texto va rotando entre varias frases para que no parezca colgado.
  // Cualquier progreso real (página nueva, adjuntos) lo reinicia.
  const WAIT_LINES = ['Leyendo comentarios...', 'Revisando notas y cambios de estado...', 'Esperando a que SmartIT cargue la página...', 'Ordenando la actividad...', 'Analizando páginas de la incidencia...'];
  let waitT = null, waitI = 0;
  function stopWaitLines() { clearTimeout(waitT); waitT = null; }
  function startWaitLines() {
    stopWaitLines();
    waitI = 0;
    const tick = () => {
      if (state !== 'loading') return stopWaitLines();
      setText(WAIT_LINES[waitI++ % WAIT_LINES.length]);
      waitT = setTimeout(tick, 2600);
    };
    waitT = setTimeout(tick, 2600);
  }

  // Cambio de frase: el texto se cambia al momento y entra con una animación CSS (sube y aparece).
  // No se usan temporizadores: con la pestaña en segundo plano Chrome los retrasa y la frase podía
  // quedarse oculta a mitad del cambio. Las animaciones CSS van por tiempo: al volver a la pestaña
  // ya han terminado y el texto se ve.
  function setText(t) {
    if (!textEl || textEl.textContent === t) return;
    textEl.textContent = t;
    if (document.hidden) return;
    textEl.classList.remove('enter');
    void textEl.offsetWidth;
    textEl.classList.add('enter');
  }


  // Anillo de progreso: indeterminado (gira) hasta saber cuántas páginas hay. Después, mientras lee la
  // página N, el anillo muestra lo ya leído (N-1) y su extremo se estira un poco y vuelve, para que se vea
  // que sigue trabajando aunque una página tarde. Al terminar las páginas, queda completo.
  const CIRC = 169.65;
  function setRing(page, total, complete) {
    const ring = overlay.querySelector('.sie-ring');
    const fill = overlay.querySelector('.sie-ring .fill');
    const count = overlay.querySelector('.sie-count');
    if (!total) { ring.classList.add('indet'); ring.classList.remove('full'); fill.style.strokeDashoffset = CIRC * 0.75; count.textContent = ''; return; }
    ring.classList.remove('indet');
    const cur = Math.min(Math.max(page, 1), total);
    const read = complete ? total : cur - 1;
    ring.classList.toggle('full', !!complete);
    fill.style.strokeDashoffset = CIRC * (1 - read / total);
    ring.style.setProperty('--from', CIRC * (1 - read / total));
    // Solo un pequeño avance (≈6 % del anillo y como mucho un tercio de lo que ocupa una página): no llega a la siguiente.
    const nudge = Math.min(0.06, 0.33 / total);
    ring.style.setProperty('--to', CIRC * (1 - Math.min(read / total + nudge, 1)));
    count.textContent = `${complete ? total : cur}/${total}`;
  }

  function showStatus(t, isError) {
    statusEl.classList.toggle('err', !!isError);
    overlay.querySelector('.sie-h').textContent = isError ? 'No se pudo exportar' : 'Exportando incidencia';
    textEl.classList.remove('enter');
    textEl.textContent = t;
    statusEl.classList.add('on');
  }

  function visibleFrames() {
    return [...document.querySelectorAll('iframe')].filter(f => f.offsetWidth > 0 && f.offsetHeight > 0 && f.closest('#' + OVERLAY_ID) === null);
  }


  // ---------- configuración inicial (carpeta y ruta para el agente) ----------
  // El visor guarda solo cada incidencia, así que antes de analizar hace falta una carpeta con permiso
  // y la ruta con la que la ve el agente. El selector de carpeta de Chrome no se puede abrir dentro de
  // SmartIT: el botón abre una ventanita de la extensión, que avisa con «folderReady» al terminar.
  let setupEl = null, setupInfo = { status: 'none', name: '' }, pathT = null;
  async function readSetup() {
    let st = { status: 'none', name: '' }, agentPath = '';
    if (!alive()) return { status: 'dead', name: '', agentPath: '' };
    try { st = (await chrome.runtime.sendMessage({ type: 'folder-status' })) || st; } catch (_) {}
    try { agentPath = ((await chrome.storage.local.get('agentPath')).agentPath || '').trim(); } catch (_) {}
    return { status: st.status || 'none', name: st.name || '', agentPath };
  }
  const setupOk = i => i.status === 'granted' && !!i.agentPath;
  function paintSetup(info) {
    setupInfo = info;
    const f = setupEl.querySelector('[data-step="folder"]');
    const val = f.querySelector('.sie-val'), btn = f.querySelector('[data-act="pick"]'), hint = f.querySelector('[data-hint="folder"]');
    const granted = info.status === 'granted';
    f.classList.toggle('done', granted);
    val.textContent = info.name ? ` · ${info.name}${granted ? '' : info.status === 'prompt' ? ' (falta permiso)' : ' (sin permiso)'}` : ' · sin elegir';
    btn.textContent = !info.name ? 'Elegir carpeta' : info.status === 'prompt' ? 'Dar permiso' : granted ? 'Cambiar' : 'Elegir otra';
    btn.classList.toggle('primary', !granted);
    hint.textContent = info.status === 'prompt'
      ? 'Chrome pide confirmar el permiso en cada sesión hasta que elijas «Permitir en cada visita».'
      : !info.name ? 'Se abrirá una ventanita para elegirla. Chrome te pedirá permiso para modificar archivos en ella.' : '';
    hint.hidden = !hint.textContent;
    const input = setupEl.querySelector('#sie-path');
    // La ruta se rellena con el nombre de la carpeta, para que solo haya que completarla.
    if (!input.value.trim() && (info.agentPath || info.name)) {
      input.value = info.agentPath || info.name;
      if (!info.agentPath) { info.agentPath = input.value; chrome.storage.local.set({ agentPath: input.value }).catch(() => {}); }
    }
    setupEl.querySelector('[data-step="path"]').classList.toggle('done', !!input.value.trim());
    setupEl.querySelector('[data-act="go"]').disabled = !(granted && input.value.trim());
  }
  function wireSetup() {
    const input = setupEl.querySelector('#sie-path');
    input.addEventListener('input', () => {
      setupInfo.agentPath = input.value.trim();
      setupEl.querySelector('[data-step="path"]').classList.toggle('done', !!setupInfo.agentPath);
      setupEl.querySelector('[data-act="go"]').disabled = !(setupInfo.status === 'granted' && setupInfo.agentPath);
      clearTimeout(pathT);
      pathT = setTimeout(() => chrome.storage.local.set({ agentPath: input.value.trim() }).catch(() => {}), 250);
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !setupEl.querySelector('[data-act="go"]').disabled) setupEl.querySelector('[data-act="go"]').click(); });
    setupEl.addEventListener('click', async e => {
      const act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'pick') { try { await chrome.runtime.sendMessage({ type: 'open-options', setup: true }); } catch (_) {} }
      else if (act.dataset.act === 'go') { clearTimeout(pathT); await chrome.storage.local.set({ agentPath: input.value.trim() }).catch(() => {}); hideSetup(); startExport(true); }
      else if (act.dataset.act === 'skip') { hideSetup(); startExport(false); }
    });
  }
  try {
    chrome.storage.onChanged.addListener(async (ch, area) => {
      if (area !== 'local' || state !== 'setup' || !(ch.folderReady || ch.agentPath)) return;
      paintSetup(await readSetup());
      if (ch.folderReady) setupEl.querySelector(setupInfo.status === 'granted' ? '#sie-path' : '[data-act="pick"]').focus();
    });
  } catch (_) {}
  async function showSetup(info) {
    ensureOverlay();
    placeOverlay();
    token++;
    state = 'setup';
    setIcon(true, 'Volver a SmartIT');
    if (cache) { cache.iframe.remove(); cache = null; }
    statusEl.classList.remove('on');
    paintSetup(info);
    requestAnimationFrame(() => { overlay.classList.add('show'); setupEl.classList.add('on'); });
    setTimeout(() => setupEl.querySelector(info.status === 'granted' ? '#sie-path' : '[data-act="pick"]').focus(), T(200));
  }
  function hideSetup() { if (setupEl) setupEl.classList.remove('on'); }

  // ---------- abrir / cerrar ----------
  function startExport(save = true) {
    if (!alive()) return;
    ensureOverlay();
    placeOverlay();
    hideSetup();
    const my = ++token;
    state = 'loading';
    setIcon(true, 'Volver a SmartIT');
    if (cache) { cache.iframe.remove(); cache = null; }
    showStatus('Analizando incidencia...');
    setRing(0, 0);
    requestAnimationFrame(() => overlay.classList.add('show'));
    const hash = location.hash;
    visibleFrames().forEach(f => {
      try { f.contentWindow.postMessage({ sie: 'export', url: location.href, inline: true }, '*'); } catch (_) {}
    });
    startTimer = setTimeout(() => {
      if (my !== token) return;
      showStatus('No hay ninguna incidencia abierta que analizar', true);
      setTimeout(() => { if (my === token) close(); }, 1800);
    }, 2500);
    pending = { my, hash, save };
  }
  let pending = null;

  async function showViewer(id) {
    const { my, hash, save } = pending || {};
    if (my !== token || state !== 'loading') return;
    const iframe = document.createElement('iframe');
    iframe.title = 'Visor de la incidencia';
    iframe.setAttribute('allow', 'clipboard-write');
    iframe.src = chrome.runtime.getURL('viewer.html') + '#' + id + (save === false ? '&nosave' : '');
    overlay.appendChild(iframe);
    cache = { hash, iframe, ready: false };
    // Espera a que el visor esté pintado (aviso "viewer-ready"); por si acaso, como mucho 5 s.
    await new Promise(resolve => {
      const done = () => { clearTimeout(t); window.removeEventListener('message', onMsg); resolve(); };
      const onMsg = e => { if (e.source === iframe.contentWindow && e.data && e.data.sie === 'viewer-ready') done(); };
      const t = setTimeout(done, 5000);
      window.addEventListener('message', onMsg);
    });
    if (my !== token) return;
    cache.ready = true;
    { const c = overlay.querySelector('.sie-count'); if (c.textContent) { const t = +c.textContent.split('/')[1]; setRing(t, t, true); } }
    statusEl.classList.remove('on');          // el spinner se desvanece…
    await wait(200);
    if (my !== token) return;
    iframe.classList.add('on');               // …y el visor aparece
    state = 'open';
  }

  function reopen() {
    ensureOverlay();
    placeOverlay();
    token++;
    state = 'open';
    setIcon(true);
    statusEl.classList.remove('on');
    cache.iframe.classList.remove('on');
    requestAnimationFrame(() => {
      overlay.classList.add('show');
      setTimeout(() => cache && cache.iframe.classList.add('on'), T(120));
    });
    // Al reabrirlo desde la caché, el visor recalcula sus Relacionadas (pueden haber cambiado).
    try { cache.iframe.contentWindow.postMessage({ sie: 'viewer-shown' }, '*'); } catch (_) {}
  }

  // ---------- incidencias guardadas abiertas encima («Ver aquí» en Relacionadas) ----------
  // Cada una es un visor más, apilado encima del anterior, que se conserva tal cual (con su scroll)
  // para volver a él con la flecha o con Esc.
  let stack = [];
  const topViewer = () => stack.length ? stack[stack.length - 1] : (cache && cache.iframe);
  async function pushSaved(folder, back) {
    if (!alive() || !overlay) return;
    const prev = topViewer();
    const iframe = document.createElement('iframe');
    iframe.title = 'Incidencia guardada';
    iframe.setAttribute('allow', 'clipboard-write');
    iframe.src = chrome.runtime.getURL('viewer.html') + '#saved=' + encodeURIComponent(folder) + '&back=' + encodeURIComponent(back || 'Volver');
    overlay.appendChild(iframe);
    stack.push(iframe);
    await new Promise(resolve => {
      const done = () => { clearTimeout(t); window.removeEventListener('message', onMsg); resolve(); };
      const onMsg = e => { if (e.source === iframe.contentWindow && e.data && e.data.sie === 'viewer-ready') done(); };
      const t = setTimeout(done, 5000);
      window.addEventListener('message', onMsg);
    });
    if (!stack.includes(iframe)) return;
    iframe.classList.add('on');
    if (prev) setTimeout(() => { if (stack.includes(iframe)) prev.inert = true; }, T(300));
    iframe.focus();
  }
  function popSaved() {
    const f = stack.pop();
    if (!f) return;
    const prev = topViewer();
    if (prev) { prev.inert = false; prev.focus(); try { prev.contentWindow.postMessage({ sie: 'viewer-shown' }, '*'); } catch (_) {} }
    f.classList.remove('on');
    setTimeout(() => f.remove(), T(320));
  }
  function clearStack() {
    const fs = stack; stack = [];
    if (cache) cache.iframe.inert = false;
    fs.forEach(f => { f.classList.remove('on'); setTimeout(() => f.remove(), T(340)); });
  }

  function close() {
    clearStack();
    stopWaitLines();
    token++;
    clearTimeout(startTimer);
    state = 'idle';
    setIcon(false);
    if (!overlay) return;
    overlay.classList.remove('show');
    // Si el visor no llegó a mostrarse, no merece la pena conservarlo.
    if (cache && !cache.ready) { const f = cache.iframe; cache = null; setTimeout(() => f.remove(), T(340)); }
    setTimeout(() => { if (state === 'idle') { statusEl.classList.remove('on', 'err'); hideSetup(); if (cache) cache.iframe.classList.remove('on'); } }, T(340));
  }

  let checking = false;
  async function onIconClick() {
    if (state === 'loading' || state === 'open' || state === 'setup') return close();
    if (cache && cache.ready && cache.hash === location.hash) return reopen();
    if (checking) return;
    checking = true;
    // Sin carpeta con permiso o sin ruta para el agente, primero el panel de configuración.
    if (!alive()) return;
    const info = await readSetup().finally(() => { checking = false; });
    if (state !== 'idle' || dead) return;
    if (setupOk(info)) startExport(true); else showSetup(info);
  }

  // ---------- mensajes ----------
  window.addEventListener('message', e => {
    if (!e.data || typeof e.data.sie !== 'string') return;
    // Del visor incrustado (o de una guardada abierta encima): cerrar con Esc, abrir una relacionada, volver.
    const fromViewer = (cache && e.source === cache.iframe.contentWindow) || stack.some(f => f.contentWindow === e.source);
    if (fromViewer) {
      const top = topViewer();
      const isTop = top && e.source === top.contentWindow;
      if (e.data.sie === 'viewer-close' && state === 'open') {
        if (stack.length) { if (isTop) popSaved(); }
        else {
          // «Eliminar de la carpeta»: no se conserva el visor; al pulsar el icono se exporta de nuevo.
          if (e.data.discard && cache) { const f = cache.iframe; cache = null; setTimeout(() => f.remove(), T(340)); }
          close();
        }
      }
      if (e.data.sie === 'viewer-back' && isTop && stack.length) popSaved();
      if (e.data.sie === 'open-saved' && isTop && state === 'open' && typeof e.data.folder === 'string') pushSaved(e.data.folder, String(e.data.back || ''));
      if (e.data.sie === 'update-dismissed') checkUpdate();
      return;
    }
    if (e.data.sie === 'ready' && isOnbmc(e.origin)) {
      if (Date.now() < readySince) return;
      const r = !!e.data.ready;
      if (r !== ticketReady) { ticketReady = r; ensureIcon(); }
      return;
    }
    if (!isOnbmc(e.origin) || state !== 'loading') return;
    if (e.data.sie === 'started') { clearTimeout(startTimer); startWaitLines(); }
    else if (e.data.sie === 'progress') {
      clearTimeout(startTimer);
      setText(e.data.text || 'Analizando incidencia...');
      // Al leer páginas, rota frases si tarda; con los adjuntos se deja el contador ("2 de 5").
      if (e.data.attachments) stopWaitLines(); else startWaitLines();
      if (e.data.total) setRing(e.data.page, e.data.total);
      else if (e.data.attachments) { const c = overlay.querySelector('.sie-count'); if (c.textContent) { const t = +c.textContent.split('/')[1]; setRing(t, t, true); } }
    }
    else if (e.data.sie === 'done') { clearTimeout(startTimer); stopWaitLines(); showViewer(e.data.id); }
    else if (e.data.sie === 'error') {
      clearTimeout(startTimer);
      stopWaitLines();
      showStatus(`No se pudo analizar la incidencia${e.data.text ? ': ' + e.data.text : ''}`, true);
      const my = token;
      setTimeout(() => { if (my === token) close(); }, 3500);
    }
  });

  document.addEventListener('keydown', e => { if (e.key === 'Escape' && state !== 'idle') { if (stack.length) popSaved(); else close(); } });

  // Si se navega a otra incidencia o sección, se vuelve a SmartIT y se descarta el visor guardado.
  window.addEventListener('hashchange', () => {
    ticketReady = false;
    readySince = Date.now() + 600;
    ensureIcon();
    if (state !== 'idle') close();
    if (cache && cache.hash !== location.hash) { const f = cache.iframe; cache = null; setTimeout(() => f.remove(), T(340)); }
  });

  // ---------- icono ----------
  function ensureIcon() {
    const search = document.getElementById('header-helixGPT_search_button')
      || document.querySelector('.header__user .navigation-bar__search');
    let a = icon();
    if (search && !a) {
      a = document.createElement('a');
      a.id = ICON_ID;
      a.setAttribute('role', 'button');
      a.tabIndex = 0;
      a.innerHTML = SVG_CLIP + SVG_BACK + '<span class="sie-dot" aria-hidden="true"></span><span class="sie-splash" aria-hidden="true"></span>';
      a.addEventListener('click', onIconClick);
      a.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onIconClick(); } });
      search.parentElement.insertBefore(a, search);
      setIcon(state !== 'idle');
    }
    // Solo en vistas de ticket (…PV/<id>) y cuando la ficha ha terminado de cargar (aviso "ready" de content.js),
    // para que no se pueda pulsar mientras aún carga. Al aparecer, entra con animación.
    if (a) {
      const show = state !== 'idle' || (/#\/\w+PV\//.test(location.hash) && ticketReady);
      const wasHidden = a.classList.contains('hidden');
      a.classList.toggle('hidden', !show);
      if (show && wasHidden && state === 'idle') {
        a.classList.remove('appear');
        void a.offsetWidth; // reinicia la animación
        a.classList.add('appear');
        // Al acabar la animación se quita la clase, para que no interfiera con el cambio a la flecha.
        setTimeout(() => a.classList.remove('appear'), T(900));
      }
    }
  }

  ensureIcon();
  timers.push(setInterval(() => { if (alive()) ensureIcon(); }, 500));
  checkUpdate();
  timers.push(setInterval(checkUpdate, 60 * 60 * 1000));
  // Al volver del visor (p. ej. tras ocultar el aviso con la ✕), se refresca el estado.
  window.addEventListener('focus', checkUpdate);
})();
