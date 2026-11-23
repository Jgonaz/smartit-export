// SmartIT – Exportar incidencia (content script). SOLO LECTURA:
// lee la ficha y la actividad; lo único que pulsa es la paginación de la actividad.
(() => {
  'use strict';

  const BTN_ID = 'sie-export-btn';

  // Etiquetas de campos que en la ficha no traen texto de etiqueta.
  const KNOWN_LABELS = {
    '7': 'Estado',
    '1000000164': 'Prioridad',
    '1000000161': 'Número',
    '1000000000': 'Resumen',
    '3': 'Fecha de creación',
    '6': 'Última modificación',
    '301572100': 'Solicitud relacionada'
  };
  // Campos que ya salen en la cabecera o en su propia sección, o que no aportan.
  const SKIP_FIELDS = new Set(['7', '1000000164', '1000000161', '1000000000', '3', '6',
    '1000000151', '1000000038', '304434661']);
  const EMPTY_VALUES = new Set(['', 'nada establecido', '-']);

  // ---------- utilidades ----------
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function waitFor(fn, timeout = 20000, step = 250) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try { const v = fn(); if (v) return v; } catch (_) { /* reintenta */ }
      await sleep(step);
    }
    return null;
  }

  // Texto de un elemento respetando los <br> como saltos de línea.
  function textOf(el) {
    if (!el) return '';
    const clone = el.cloneNode(true);
    clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    clone.querySelectorAll('script,style,button,img').forEach(n => n.remove());
    return clone.textContent
      .split('\n')
      .map(l => l.replace(/[ \t ]+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function isHidden(el) {
    return !!el.closest('[hidden]') || getComputedStyle(el).display === 'none';
  }

  // Primer elemento "de datos" de un campo AR (descarta botones "Mostrar más" con el mismo id).
  function dataEl(fieldId, doc = document) {
    const all = doc.querySelectorAll(`[id="ar${fieldId}_data"]`);
    for (const el of all) if (el.tagName !== 'BUTTON') return el;
    return null;
  }

  function fieldValue(fieldId) {
    const el = dataEl(fieldId);
    if (!el) return '';
    return textOf(el) || (el.getAttribute('title') || '').trim();
  }

  // ---------- ficha ----------
  function collectHeader() {
    return {
      number: fieldValue('1000000161'),
      summary: fieldValue('1000000000'),
      status: fieldValue('7'),
      priority: fieldValue('1000000164'),
      created: fieldValue('3'),
      modified: fieldValue('6')
    };
  }

  function collectDescription() {
    const el = dataEl('1000000151');
    if (!el) return '';
    // El texto completo está en el DOM aunque se vea recortado ("Mostrar más").
    return textOf(el) || (el.getAttribute('title') || '').trim();
  }

  function collectFields() {
    const out = [];
    const seen = new Set();
    document.querySelectorAll('[id^="ar"][id$="_data"]').forEach(el => {
      const m = el.id.match(/^ar(\d+)_data$/);
      if (!m) return;
      const fid = m[1];
      if (seen.has(fid) || SKIP_FIELDS.has(fid) || el.tagName === 'BUTTON') return;
      if (isHidden(el)) return;
      seen.add(fid);
      const labelEl = document.getElementById(`ar${fid}_label`);
      let label = (labelEl && labelEl.textContent.trim()) || KNOWN_LABELS[fid] || '';
      label = label.replace(/[*+]+$/, '').trim();
      if (!label) return;
      const value = textOf(el) || (el.getAttribute('title') || '').trim();
      if (EMPTY_VALUES.has(value.toLowerCase())) return;
      out.push({ id: fid, label, value });
    });
    return out;
  }

  // ---------- actividad ----------
  function feedIframes(root) {
    return [...root.querySelectorAll('iframe[id^="VFWLG"]')];
  }

  function findFeedRoot() {
    const first = document.querySelector('iframe[id^="VFWLG"]');
    if (!first) return null;
    return first.closest('smt-table-cell-field') || first.closest('ul')?.parentElement?.parentElement || null;
  }

  function feedStatus(root) {
    const s = root.querySelector('[aria-live]');
    return s ? s.textContent.trim() : '';
  }

  function iframesReady(root) {
    const frames = feedIframes(root);
    if (!frames.length) return false;
    return frames.every(f => {
      try {
        const d = f.contentDocument;
        const date = d && d.getElementById('date-block');
        return date && date.textContent.trim().length > 0;
      } catch (_) { return false; }
    });
  }

  function readNote(iframe) {
    const idMatch = iframe.id.match(/^VF(WLG\d+)_/);
    const d = iframe.contentDocument;
    const cb = d.getElementById('content_block');
    const author = (d.getElementById('ticket_url') || {}).textContent?.trim() || '';
    const full = textOf(cb);
    const lines = full.split('\n');
    // Formato habitual: [tipo] \n [autor] agregó una nota \n [texto...]
    let type = '', action = '', body = full;
    if (lines.length >= 2 && author && lines[1].startsWith(author)) {
      type = lines[0];
      action = lines[1];
      body = lines.slice(2).join('\n').trim();
    }
    const date = (d.getElementById('date-block') || {}).textContent?.trim() || '';
    const accIcon = d.getElementById('view-access-icon');
    const access = accIcon && getComputedStyle(accIcon).display !== 'none'
      ? (d.getElementById('view-access-icon-print') || {}).textContent?.trim() || accIcon.getAttribute('title') || ''
      : '';
    const attachments = [];
    [['first', 'file1'], ['second', 'file2'], ['third', 'file3']].forEach(([pfx, slot]) => {
      const box = d.getElementById(`${pfx}-attachment`);
      if (!box || d.defaultView.getComputedStyle(box).display === 'none') return;
      const name = (d.getElementById(`${pfx}-attachement-name`) || {}).textContent?.trim() || '';
      const icon = d.getElementById(`${pfx}-attachement-icon`);
      attachments.push({
        name,
        slot,
        iconSrc: icon && icon.src && !icon.src.startsWith('javascript:') ? icon.src : ''
      });
    });
    return {
      id: idMatch ? idMatch[1] : iframe.id,
      date, type, author, action, body, access, attachments,
      isNote: /agreg[oó] una nota/i.test(action)
    };
  }

  function pagerButton(root, kind) {
    return root.querySelector(`[data-testid$="-pagination_${kind}"]`);
  }

  async function goToPage1(root) {
    const b1 = pagerButton(root, 'item_1');
    if (b1 && !b1.closest('li')?.classList.contains('active')) {
      const before = feedStatus(root);
      b1.click();
      await waitFor(() => feedStatus(root) !== before && iframesReady(root));
    }
  }

  async function collectActivity(onProgress) {
    const root = findFeedRoot();
    if (!root) return { entries: [], status: 'No se encontró la actividad (abre la pestaña Actividad y vuelve a pulsar).' };

    await waitFor(() => iframesReady(root), 10000);
    await goToPage1(root);

    const byId = new Map();
    let page = 1;
    for (let guard = 0; guard < 200; guard++) {
      onProgress && onProgress(`Leyendo actividad… página ${page}`);
      await waitFor(() => iframesReady(root), 15000);
      for (const f of feedIframes(root)) {
        try {
          const n = readNote(f);
          if (!byId.has(n.id)) byId.set(n.id, n);
        } catch (e) { console.warn('[SmartIT export] nota ilegible', f.id, e); }
      }
      const next = pagerButton(root, 'right');
      if (!next || next.closest('li')?.classList.contains('disabled') || next.disabled) break;
      const before = feedStatus(root);
      next.click();
      const ok = await waitFor(() => feedStatus(root) !== before && iframesReady(root), 20000);
      if (!ok) break;
      page++;
    }
    const status = feedStatus(root);
    await goToPage1(root); // deja la actividad como estaba

    const toTs = s => {
      const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
      return m ? new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]).getTime() : 0;
    };
    const entries = [...byId.values()].sort((a, b) => toTs(a.date) - toTs(b.date));
    return { entries, status, pages: page };
  }

  // ---------- adjuntos ----------
  // Campos de adjunto de HPD:WorkLog (z2AF Work Log01..03).
  const SLOT_FIELD = { file1: 1000000351, file2: 1000000352, file3: 1000000353 };
  const MIME = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp',
    webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf', txt: 'text/plain',
    log: 'text/plain', csv: 'text/csv', json: 'application/json', xml: 'text/xml', html: 'text/html'
  };
  const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid';

  function serverName() {
    const m = location.hash.match(/\/forms\/([^/]+)\//);
    return m ? m[1] : 'onbmc-s';
  }

  // Datos de sesión que main-hook.js observa en las peticiones de la propia app.
  function session() {
    const st = document.documentElement.dataset.sieSt || '';
    let forms = {};
    try { forms = JSON.parse(document.documentElement.dataset.sieForms || '{}'); } catch (_) {}
    const schema = forms['SHR:SV_TicketDisplay'] ? 'SHR:SV_TicketDisplay' : Object.keys(forms)[0];
    return { st, schema, formToken: schema ? forms[schema] : '' };
  }

  function arHeaders(st, json) {
    const h = { accept: 'application/json, text/plain, */*', locale: 'es', 'x-mid-ajax-request': '1', st };
    if (json) h['content-type'] = 'application/json';
    return h;
  }

  // Formato AR "longitud/valor" encadenado.
  const enc = arr => arr.map(v => `${String(v).length}/${v}`).join('');
  function dec(s) {
    const out = [];
    let i = 0;
    while (i < s.length) {
      const j = s.indexOf('/', i);
      if (j < 0) break;
      const n = parseInt(s.slice(i, j), 10);
      if (isNaN(n)) break;
      out.push(s.substr(j + 1, n));
      i = j + 1 + n;
    }
    return out;
  }

  // Pide al servidor las claves de descarga de los adjuntos de una nota (igual que hace SmartIT).
  async function getAttachmentKeys(entryId, sess) {
    const server = serverName();
    const body = {
      currentServer: server, appName: '', server,
      fields: Object.values(SLOT_FIELD),
      qualification: '4\\1\\1\\1\\99\\304424671\\',
      noMatchOpt: 2, multiMatchOpt: 3,
      qualFieldIds: [304424671], qualFieldValues: [entryId], qualFieldTypes: [4],
      currentSchema: sess.schema, formNameToken: sess.formToken,
      qualFieldExterns: [], compile: false
    };
    const resp = await fetch(`${location.origin}/arsys/web/v1.0/backchannel/GetEntryList/HPD:WorkLog?timezone=${encodeURIComponent(TZ)}`, {
      method: 'POST', credentials: 'include', headers: arHeaders(sess.st, true), body: JSON.stringify(body)
    });
    if (!resp.ok) throw new Error('GetEntryList HTTP ' + resp.status);
    const json = await resp.json();
    const keys = {};
    (json.entryList || []).forEach(it => {
      if (!it.v || !it.i) return;
      const [payload, size, name] = dec(it.v);
      keys[it.i] = { payload, size: +size || 0, name };
    });
    return keys;
  }

  const blobToDataUrl = blob => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });

  async function downloadAttachment(key, att, sess) {
    const server = serverName();
    const attKey = enc(['2', key.payload]);
    const url = `${location.origin}/arsys/web/v1.0/file/download/${encodeURIComponent(server)}` +
      `?attKey=${encodeURI(attKey)}&timezone=${encodeURIComponent(TZ)}`;
    const resp = await fetch(url, { credentials: 'include', headers: arHeaders(sess.st, false) });
    if (!resp.ok) throw new Error('descarga HTTP ' + resp.status);
    let blob = await resp.blob();
    const ext = (att.name.split('.').pop() || '').toLowerCase();
    if (/text\/html|application\/json/.test(blob.type) && !['html', 'json'].includes(ext)) {
      throw new Error('respuesta inesperada (' + blob.type + ')');
    }
    const mime = MIME[ext] || blob.type || 'application/octet-stream';
    if (blob.type !== mime) blob = new Blob([blob], { type: mime });
    return { dataUrl: await blobToDataUrl(blob), size: blob.size, mime };
  }

  async function loadAttachments(entries, onProgress) {
    const withAtt = entries.filter(e => (e.attachments || []).length);
    if (!withAtt.length) return;
    const sess = session();
    if (!sess.st || !sess.formToken) {
      const msg = 'no se detectó la sesión de SmartIT (recarga la incidencia y vuelve a probar)';
      withAtt.forEach(e => e.attachments.forEach(a => { a.error = msg; }));
      console.warn('[SmartIT export]', msg, { st: !!sess.st, formToken: !!sess.formToken });
      return;
    }
    const total = withAtt.reduce((n, e) => n + e.attachments.length, 0);
    let i = 0;
    for (const e of withAtt) {
      let keys = {};
      try {
        keys = await getAttachmentKeys(e.id, sess);
      } catch (err) {
        console.warn('[SmartIT export] no se obtuvieron las claves de', e.id, err);
      }
      for (const a of e.attachments) {
        onProgress && onProgress(`Cargando adjuntos… ${++i}/${total}`);
        const key = keys[SLOT_FIELD[a.slot]];
        try {
          if (!key || !key.payload) throw new Error('sin clave de descarga');
          Object.assign(a, await downloadAttachment(key, a, sess));
        } catch (err) {
          a.error = String(err.message || err);
          console.warn('[SmartIT export] adjunto no cargado', e.id, a.name, err);
        }
      }
    }
  }

  // ---------- botón ----------
  let running = false;

  // ui: { progress(text), done(), error(text) }; sourceUrl: URL de la incidencia en SmartIT.
  async function runExport(ui, sourceUrl) {
    if (running) return;
    running = true;
    const progress = t => ui.progress(t);
    try {
      progress('Leyendo ficha…');
      const header = collectHeader();
      const description = collectDescription();
      const fields = collectFields();
      const activity = await collectActivity(progress);
      await loadAttachments(activity.entries, progress);
      progress('Abriendo visor…');
      const data = {
        version: 1,
        exportedAt: new Date().toISOString(),
        sourceUrl: sourceUrl || '',
        header, description, fields,
        activity: activity.entries,
        activityStatus: activity.status
      };
      const res = await chrome.runtime.sendMessage({ type: 'open-viewer', data });
      if (!res || !res.ok) throw new Error(res && res.error || 'sin respuesta');
      ui.done();
    } catch (e) {
      console.error('[SmartIT export]', e);
      ui.error(String(e.message || e));
    } finally {
      running = false;
    }
  }

  const isTicket = () => !!document.getElementById('ar1000000161_data');

  // 1) Embebida en SmartIT: la exportación la lanza el icono de la cabecera (top.js).
  window.addEventListener('message', e => {
    if (!e.data || e.data.sie !== 'export' || e.source !== window.parent) return;
    if (!/^https:\/\/[\w.-]+\.onbmc\.com$/.test(e.origin) || !isTicket() || running) return;
    const reply = (sie, text) => { try { e.source.postMessage({ sie, text }, e.origin); } catch (_) {} };
    reply('started');
    runExport({
      progress: t => reply('progress', t),
      done: () => reply('done'),
      error: t => reply('error', t)
    }, e.data.url);
  });

  // 2) Vista Helix abierta directamente (sin SmartIT alrededor): botón flotante.
  function ensureButton() {
    if (window.top !== window) return;
    let btn = document.getElementById(BTN_ID);
    if (isTicket() && !btn) {
      btn = document.createElement('button');
      btn.id = BTN_ID;
      btn.type = 'button';
      btn.textContent = '📋 Exportar incidencia';
      btn.title = 'Abre un visor con toda la información de la incidencia y sus adjuntos';
      btn.addEventListener('click', () => {
        const label = btn.textContent;
        btn.disabled = true;
        const end = async (msg) => {
          if (msg) { btn.textContent = msg; await sleep(2500); }
          btn.disabled = false; btn.textContent = label;
        };
        runExport({
          progress: t => { btn.textContent = '⏳ ' + t; },
          done: () => end(),
          error: () => end('⚠️ Error (ver consola)')
        }, location.href.split('?')[0]);
      });
      document.body.appendChild(btn);
    } else if (!isTicket() && btn && !btn.disabled) {
      btn.remove();
    }
  }

  // La ficha es una SPA (Angular): comprobamos periódicamente si hay incidencia cargada.
  ensureButton();
  setInterval(ensureButton, 1500);
})();
