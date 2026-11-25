// «Ver carpeta»: lista las incidencias guardadas en la carpeta elegida y muestra cada una.
// Chrome no deja abrir el explorador de archivos desde una extensión, así que se consulta aquí.
(async () => {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const shortDate = s => { const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s || ''); return m ? `${+m[1]} ${MON[+m[2] - 1]} ${m[3]}` : (s || ''); };
  const isoDate = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? `${+m[3]} ${MON[+m[2] - 1]} ${m[1]}` : (s || ''); };
  const closed = st => /resuelt|cerrad|cancelad|completad/i.test(st || '');

  // Tema y estilo como en el visor.
  try {
    const { theme, style } = await chrome.storage.local.get(['theme', 'style']);
    const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    if (style === 'classic') document.documentElement.dataset.style = 'classic'; else delete document.documentElement.dataset.style;
  } catch (_) {}

  // Colores de etiqueta: los mismos que asigna el visor.
  const TAG_COLORS = ['#F7C6D9', '#FBD3C0', '#FDE7A9', '#D6EDB5', '#BFE6D6', '#BFE0F2', '#CFD5FA', '#DCCDF6', '#F3CDEB', '#E6DCCB'];
  const { tagColors = {} } = await chrome.storage.local.get('tagColors').catch(() => ({}));
  const tagColor = t => {
    if (!(t in tagColors)) {
      const used = new Array(TAG_COLORS.length).fill(0);
      Object.values(tagColors).forEach(i => { if (used[i] != null) used[i]++; });
      tagColors[t] = used.indexOf(Math.min(...used));
      chrome.storage.local.set({ tagColors }).catch(() => {});
    }
    return TAG_COLORS[tagColors[t] % TAG_COLORS.length];
  };
  const tagChip = t => { const c = el('span', 'tag', t); c.style.setProperty('--tc', tagColor(t)); return c; };

  const state = (text, grant) => {
    $('ex-state').hidden = false;
    $('ex-state-text').textContent = text;
    $('ex-grant').hidden = !grant;
    $('ex-main').hidden = true;
    $('ex-tags').hidden = true;
  };

  let root = await SieCarpeta.get();
  if (!root) { state('Todavía no has elegido una carpeta: pulsa «Guardar» en el visor de una incidencia o elígela en los ajustes de la extensión.'); return; }
  $('ex-folder').textContent = root.name;
  document.title = `Incidencias guardadas – ${root.name}`;
  let st = await SieCarpeta.status(root);
  if (st !== 'granted') {
    state('Chrome necesita que vuelvas a dar permiso para leer esta carpeta.', true);
    await new Promise(res => $('ex-grant').addEventListener('click', async () => {
      if ((await root.requestPermission({ mode: 'readwrite' })) === 'granted') { $('ex-state').hidden = true; res(); }
    }));
  }

  // Índice (si falta, se crea leyendo las carpetas).
  let rows = [];
  try {
    let jsonl = await SieCarpeta.readText(root, 'indice.jsonl');
    if (jsonl == null) rows = await SieCarpeta.rebuildIndex(root);
    else jsonl.split('\n').forEach(l => { try { const r = JSON.parse(l); if (r) rows.push(r); } catch (_) {} });
  } catch (err) {
    state('No se pudo leer la carpeta: ' + (err.message || err) + '. Si la has movido o borrado, elígela de nuevo en los ajustes de la extensión.');
    return;
  }
  if (!rows.length) { state('La carpeta aún no tiene incidencias guardadas.'); return; }

  // Estado de la documentación de cada una (si el equipo lo usa), del clasificacion.md.
  const docOf = r => r.documentacion || r.documentacion_url ? { estado: (r.documentacion || '').toLowerCase(), url: r.documentacion_url || '' } : null;
  const withDoc = rows.filter(r => docOf(r) && docOf(r).estado === 'documentada').length;
  $('ex-lede').textContent = `${rows.length} ${rows.length === 1 ? 'incidencia' : 'incidencias'}` +
    `, ${rows.filter(r => closed(r.estado)).length} cerradas` + (withDoc ? `, ${withDoc} documentadas` : '') + '.';

  // Filtro por etiquetas (con cuántas incidencias tiene cada una) y búsqueda de texto.
  const tagCount = new Map();
  rows.forEach(r => (r.etiquetas || []).forEach(t => tagCount.set(t, (tagCount.get(t) || 0) + 1)));
  const active = new Set();
  if (tagCount.size) {
    $('ex-tags').hidden = false;
    [...tagCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).forEach(([t, n]) => {
      const c = tagChip(t);
      c.setAttribute('role', 'button');
      c.tabIndex = 0;
      c.setAttribute('aria-pressed', 'true');
      c.appendChild(el('span', 'n', String(n)));
      const toggle = () => {
        if (active.has(t)) active.delete(t); else active.add(t);
        $('ex-tags').querySelectorAll('.tag').forEach(x => x.setAttribute('aria-pressed', String(!active.size || active.has(x.firstChild.textContent))));
        renderList();
      };
      c.addEventListener('click', toggle);
      c.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); } });
      $('ex-tags').appendChild(c);
    });
  }
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  $('ex-search').addEventListener('input', () => renderList());

  $('ex-main').hidden = false;
  let current = null;
  function renderList() {
    const q = norm($('ex-search').value).trim();
    const list = rows.filter(r => (!active.size || (r.etiquetas || []).some(t => active.has(t))) &&
      (!q || norm([r.incidencia, r.titulo, r.servicio, r.categoria, r.equipo, r.causa, r.solucion, (r.etiquetas || []).join(' ')].join(' ')).includes(q)));
    $('ex-count').textContent = list.length === rows.length ? `${rows.length} incidencias` : `${list.length} de ${rows.length} incidencias`;
    const ol = $('ex-list');
    ol.textContent = '';
    list.forEach(r => {
      const li = el('li');
      const b = el('button', 'ex-item');
      b.type = 'button';
      if (current === r.carpeta) b.setAttribute('aria-current', 'true');
      const row1 = el('div', 'ex-row1');
      row1.append(el('span', 'ex-num', r.incidencia), el('span', 'ex-meta', [r.estado, shortDate(r.abierta)].filter(Boolean).join(' · ')));
      b.append(row1, el('div', 'ex-title', r.titulo || '(sin título)'));
      const sub = [r.equipo, r.categoria].filter(Boolean).join(' · ');
      if (sub) b.appendChild(el('div', 'ex-sub', sub));
      if (r.solucion) b.appendChild(el('div', 'ex-sol', r.solucion));
      const d = docOf(r);
      if ((r.etiquetas || []).length || (d && d.estado === 'documentada') || (d && d.url)) {
        const tg = el('div', 'rel-tags');
        (r.etiquetas || []).forEach(t => tg.appendChild(tagChip(t)));
        if (d && (d.estado === 'documentada' || d.url)) tg.appendChild(el('span', 'ex-doc' + (d.estado === 'documentada' ? '' : ' partial'), d.estado === 'documentada' ? 'Documentada' : 'En curso'));
        b.appendChild(tg);
      }
      b.addEventListener('click', () => { current = r.carpeta; ol.querySelectorAll('.ex-item').forEach(x => x.removeAttribute('aria-current')); b.setAttribute('aria-current', 'true'); showDetail(r); });
      li.appendChild(b);
      ol.appendChild(li);
    });
  }

  // Markdown sencillo para leer incidencia.md: títulos, listas, negritas, enlaces e imágenes de adjuntos/.
  const urls = [];
  async function fileUrl(dir, path) {
    try {
      let d = dir;
      const parts = decodeURIComponent(path).split('/');
      for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p);
      const f = await (await d.getFileHandle(parts[parts.length - 1])).getFile();
      const u = URL.createObjectURL(f); urls.push(u); return u;
    } catch (_) { return ''; }
  }
  function inline(node, text, dir) {
    const re = /(!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) node.append(text.slice(last, m.index));
      const t = m[0];
      if (t.startsWith('![')) {
        const [, alt, src] = /!\[([^\]]*)\]\(([^)]+)\)/.exec(t);
        const img = el('img'); img.alt = alt; img.loading = 'lazy';
        if (/^https?:/.test(src)) img.src = src; else fileUrl(dir, src).then(u => { if (u) { img.src = u; img.onclick = () => window.open(u, '_blank'); } });
        node.appendChild(img);
      } else if (t.startsWith('[')) {
        const [, label, href] = /\[([^\]]+)\]\(([^)]+)\)/.exec(t);
        const a = el('a', 'u', label);
        if (/^https?:/.test(href)) { a.href = href; a.target = '_blank'; a.rel = 'noopener'; }
        else fileUrl(dir, href).then(u => { if (u) { a.href = u; a.target = '_blank'; } });
        node.appendChild(a);
      } else if (t.startsWith('**')) node.appendChild(el('strong', '', t.slice(2, -2)));
      else node.appendChild(el('code', '', t.slice(1, -1)));
      last = m.index + t.length;
    }
    if (last < text.length) node.append(text.slice(last));
  }
  function renderMd(target, md, dir) {
    let ul = null, para = [];
    const flush = () => { if (para.length) { const p = el('p'); inline(p, para.join('\n'), dir); p.style.whiteSpace = 'pre-line'; target.appendChild(p); para = []; } };
    md.split(/\r?\n/).forEach(line => {
      const h = /^(#{1,4})\s+(.*)$/.exec(line);
      const li = /^\s*[-*]\s+(.*)$/.exec(line);
      if (h) { flush(); ul = null; const n = el('h' + Math.min(4, h[1].length + 1)); inline(n, h[2], dir); target.appendChild(n); }
      else if (li) { flush(); if (!ul) { ul = el('ul'); target.appendChild(ul); } const n = el('li'); inline(n, li[1], dir); ul.appendChild(n); }
      else if (!line.trim()) { flush(); ul = null; }
      else { ul = null; para.push(line); }
    });
    flush();
  }

  // Nombres legibles para las claves más habituales; el resto se muestra tal cual.
  const LABELS = { submodulo: 'Submódulo', solucion: 'Solución', documentacion: 'Documentación', documentacion_fecha: 'Documentada el',
    equipo_responsable: 'Equipo responsable', categoria: 'Categoría', reutilizable: 'Reutilizable', dependencia: 'Dependencia', impacto: 'Impacto', tipo: 'Tipo', estado: 'Estado', causa: 'Causa' };

  async function showDetail(r) {
    urls.splice(0).forEach(u => URL.revokeObjectURL(u));
    const box = $('ex-detail');
    box.textContent = '';
    box.scrollTop = 0;
    box.appendChild(el('div', 'ex-num', r.incidencia));
    box.appendChild(el('h2', '', r.titulo || '(sin título)'));
    let dir;
    try { dir = await root.getDirectoryHandle(r.carpeta); } catch (_) { box.appendChild(el('p', 'muted', 'No se encuentra la carpeta de esta incidencia.')); return; }
    const links = el('div', 'ex-links');
    if (r.url) { const a = el('a', 'u', 'Abrir en SmartIT'); a.href = r.url; a.target = '_blank'; a.rel = 'noopener'; links.appendChild(a); }
    const d = docOf(r);
    if (d && d.url) { const a = el('a', 'u', d.estado === 'documentada' ? 'Ver documentación' : 'Ver borrador de la documentación'); a.href = d.url; a.target = '_blank'; a.rel = 'noopener'; links.appendChild(a); }
    if (links.childNodes.length) box.appendChild(links);

    // Clasificación: todas las claves del bloque de clasificacion.md, tal cual.
    const clasText = await SieCarpeta.readText(dir, 'clasificacion.md');
    if (clasText != null) {
      const { data, body } = SieCarpeta.FM.parse(clasText);
      const blk = el('section', 'ex-block');
      blk.appendChild(el('h3', '', 'Clasificación'));
      if ((data.etiquetas || []).length) { const tg = el('div', 'rel-tags'); [].concat(data.etiquetas).forEach(t => tg.appendChild(tagChip(t))); blk.appendChild(tg); }
      const dl = el('dl', 'ex-kv');
      Object.entries(data).forEach(([k, v]) => {
        if (k === 'etiquetas' || k === 'documentacion_url' || v == null || v === '' || (Array.isArray(v) && !v.length)) return;
        const label = LABELS[k] || k.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
        dl.append(el('dt', '', label), el('dd', '', Array.isArray(v) ? v.join(', ') : (k === 'documentacion_fecha' ? isoDate(v) : v)));
      });
      if (dl.childNodes.length) { dl.style.marginTop = '10px'; blk.appendChild(dl); }
      if (body.trim() && !/^Notas libres sobre la causa y la solución/.test(body.trim())) blk.appendChild(el('div', 'ex-notes', body.trim()));
      box.appendChild(blk);
    }

    // Otros archivos de la carpeta (diagnóstico, notas…) y adjuntos.
    const others = [], files = [];
    for await (const [name, hnd] of dir.entries()) {
      if (hnd.kind === 'file' && name !== 'incidencia.md' && name !== 'clasificacion.md') others.push(name);
    }
    try { const ad = await dir.getDirectoryHandle('adjuntos'); for await (const [name, hnd] of ad.entries()) if (hnd.kind === 'file') files.push(name); } catch (_) {}
    if (others.length) {
      const blk = el('section', 'ex-block');
      blk.appendChild(el('h3', '', 'Otros archivos'));
      for (const name of others.sort()) {
        const a = el('a', 'u', name);
        fileUrl(dir, name).then(u => { if (u) { a.href = u; a.target = '_blank'; } });
        const p = el('div'); p.appendChild(a); blk.appendChild(p);
      }
      box.appendChild(blk);
    }
    if (files.length) {
      const blk = el('section', 'ex-block');
      blk.appendChild(el('h3', '', `Adjuntos (${files.length})`));
      const grid = el('div', 'ex-files');
      for (const name of files.sort()) {
        const a = el('a'); a.target = '_blank'; a.title = name;
        if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)) a.appendChild(el('img'));
        a.append(name);
        fileUrl(dir, 'adjuntos/' + name).then(u => { if (u) { a.href = u; const im = a.querySelector('img'); if (im) im.src = u; } });
        grid.appendChild(a);
      }
      blk.appendChild(grid);
      box.appendChild(blk);
    }

    // Contenido de incidencia.md (sin el bloque de datos).
    const incText = await SieCarpeta.readText(dir, 'incidencia.md');
    if (incText != null) {
      const blk = el('section', 'ex-block');
      blk.appendChild(el('h3', '', 'Incidencia'));
      const md = el('div', 'ex-md');
      renderMd(md, SieCarpeta.FM.parse(incText).body.replace(/^\s*#\s+.*\n/, ''), dir);
      blk.appendChild(md);
      box.appendChild(blk);
    }
  }

  renderList();
  const first = $('ex-list').querySelector('.ex-item');
  if (first) first.click();
})();
