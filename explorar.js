// «Ver guardadas»: lista las incidencias guardadas en la carpeta elegida, muestra cada una y permite
// eliminarlas (carpeta completa e índice). Chrome no deja abrir el explorador de archivos desde una
// extensión, así que se consulta aquí. La página ocupa el alto de la ventana: solo se desplazan la
// lista y el detalle, cada uno por su lado.
(async () => {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const svg = d => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'ico'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = d; return s; };
  const MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const shortDate = s => { const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(s || ''); return m ? `${+m[1]} ${MON[+m[2] - 1]}${m[4] ? `, ${m[4]}:${m[5]}` : ''}` : (s || ''); };
  const isoDate = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? `${+m[3]} ${MON[+m[2] - 1]} ${m[1]}` : (s || ''); };
  const ts = s => { const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(s || ''); return m ? new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)).getTime() : 0; };
  const closed = st => /resuelt|cerrad|cancelad|completad/i.test(st || '');
  const stKey = st => String(st || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, '-');
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const ICON = {
    open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'
  };

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
  const statusChip = st => { const c = el('span', 'hchip status-chip sm', st ? st.charAt(0).toUpperCase() + st.slice(1).toLowerCase() : 'Sin estado'); c.dataset.st = stKey(st); return c; };

  // ---------- avisos ----------
  let toastT;
  function toast(text, error) {
    const t = $('ex-toast');
    $('ex-toast-text').textContent = text;
    t.classList.toggle('err', !!error);
    $('ex-toast-ico').setAttribute('d', error ? 'M12 7v6M12 17v.5' : 'M5 12.5l4.5 4.5L19 7.5');
    t.classList.remove('out'); t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.classList.add('out'); setTimeout(() => { t.hidden = true; }, 220); }, error ? 5000 : 2600);
  }

  // ---------- estados sin lista (sin carpeta, sin permiso, vacía) ----------
  const showState = (title, text, btn, onBtn) => {
    $('ex-state').hidden = false;
    $('ex-state-title').textContent = title;
    $('ex-state-text').textContent = text;
    const b = $('ex-state-btn');
    b.hidden = !btn; b.textContent = btn || ''; b.onclick = onBtn || null;
    $('ex-main').hidden = true;
    $('ex-toolbar').hidden = true;
  };

  const root = await SieCarpeta.get();
  if (!root) {
    showState('Todavía no has elegido una carpeta', 'Pulsa «Guardar» en el visor de una incidencia o elígela en los ajustes de la extensión.',
      'Abrir los ajustes', () => chrome.runtime.openOptionsPage());
    return;
  }
  $('ex-folder').textContent = root.name;
  document.title = `Incidencias guardadas – ${root.name}`;
  if ((await SieCarpeta.status(root)) !== 'granted') {
    await new Promise(res => showState('Falta permiso para leer la carpeta',
      `Chrome pide confirmar el acceso a «${root.name}» la primera vez que se abre esta página en cada sesión.`, 'Dar permiso', async () => {
        if ((await root.requestPermission({ mode: 'readwrite' })) === 'granted') { $('ex-state').hidden = true; res(); }
      }));
  }

  // ---------- índice ----------
  let rows = [];
  try {
    const jsonl = await SieCarpeta.readText(root, 'indice.jsonl');
    // Índices de versiones anteriores sin la fecha de guardado: se rehacen una vez.
    if (jsonl == null || (jsonl.trim() && !jsonl.includes('"guardada"'))) rows = await SieCarpeta.rebuildIndex(root);
    else jsonl.split('\n').forEach(l => { try { const r = JSON.parse(l); if (r) rows.push(r); } catch (_) {} });
  } catch (err) {
    showState('No se pudo leer la carpeta', `${err.message || err}. Si la has movido o borrado, elígela de nuevo en los ajustes de la extensión.`,
      'Abrir los ajustes', () => chrome.runtime.openOptionsPage());
    return;
  }

  const docOf = r => r.documentacion || r.documentacion_url ? { estado: (r.documentacion || '').toLowerCase(), url: r.documentacion_url || '' } : null;
  const isDoc = r => { const d = docOf(r); return !!d && d.estado === 'documentada'; };
  const QUICK = [
    ['todas', 'Todas', () => true],
    ['abiertas', 'Abiertas', r => !closed(r.estado)],
    ['cerradas', 'Cerradas', r => closed(r.estado)],
    ['documentadas', 'Documentadas', isDoc],
    ['sin-clasificar', 'Sin clasificar', r => !r.causa && !(r.etiquetas || []).length]
  ];
  let quick = 'todas';
  const activeTags = new Set();
  const checked = new Set();
  let current = null;

  function renderTop() {
    if (!rows.length) {
      showState('Todavía no hay incidencias guardadas', `Abre una incidencia en SmartIT, expórtala con el icono de la cabecera y pulsa «Guardar». Aparecerá aquí con su clasificación y sus archivos. Carpeta: ${root.name}.`);
      $('ex-lede').textContent = '';
      return false;
    }
    $('ex-state').hidden = true;
    $('ex-toolbar').hidden = false;
    $('ex-main').hidden = false;
    const open = rows.filter(r => !closed(r.estado)).length, docs = rows.filter(isDoc).length;
    $('ex-lede').textContent = [`${rows.length} ${rows.length === 1 ? 'incidencia' : 'incidencias'}`,
      `${open} ${open === 1 ? 'abierta' : 'abiertas'}`, docs ? `${docs} ${docs === 1 ? 'documentada' : 'documentadas'}` : ''].filter(Boolean).join(' · ');

    // Filtros rápidos con su número.
    const q = $('ex-quick');
    q.textContent = '';
    QUICK.forEach(([key, label, fn]) => {
      const n = rows.filter(fn).length;
      if (!n && key !== 'todas' && quick !== key) return;
      const b = el('button', 'ex-pill');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(quick === key));
      b.append(label + ' ', el('span', 'n', String(n)));
      b.addEventListener('click', () => { quick = key; renderTop(); renderList(); });
      q.appendChild(b);
    });

    // Etiquetas con su número; si hay alguna activa, se muestran solo las que coinciden.
    const tagCount = new Map();
    rows.forEach(r => (r.etiquetas || []).forEach(t => tagCount.set(t, (tagCount.get(t) || 0) + 1)));
    [...activeTags].forEach(t => { if (!tagCount.has(t)) activeTags.delete(t); });
    const tg = $('ex-tags');
    tg.textContent = '';
    tg.hidden = !tagCount.size;
    [...tagCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).forEach(([t, n]) => {
      const c = tagChip(t);
      const b = el('button', 'ex-tag');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(activeTags.has(t)));
      b.classList.toggle('dim', activeTags.size > 0 && !activeTags.has(t));
      c.appendChild(el('span', 'n', String(n)));
      b.appendChild(c);
      b.addEventListener('click', () => { if (activeTags.has(t)) activeTags.delete(t); else activeTags.add(t); renderTop(); renderList(); });
      tg.appendChild(b);
    });
    return true;
  }

  function filtered() {
    const q = norm($('ex-search').value).trim();
    const fn = (QUICK.find(x => x[0] === quick) || QUICK[0])[2];
    const list = rows.filter(r => fn(r) && (!activeTags.size || (r.etiquetas || []).some(t => activeTags.has(t))) &&
      (!q || norm([r.incidencia, r.titulo, r.servicio, r.categoria, r.equipo, r.causa, r.solucion, (r.etiquetas || []).join(' ')].join(' ')).includes(q)));
    const by = $('ex-sort').value;
    const num = r => r.incidencia || r.carpeta;
    list.sort(by === 'numero' ? (a, b) => (num(a) < num(b) ? 1 : -1)
      : by === 'abierta' ? (a, b) => ts(b.abierta) - ts(a.abierta) || (num(a) < num(b) ? 1 : -1)
        : (a, b) => ts(b.guardada) - ts(a.guardada) || ts(b.abierta) - ts(a.abierta));
    return list;
  }

  function renderBulk() {
    [...checked].forEach(c => { if (!rows.some(r => r.carpeta === c)) checked.delete(c); });
    $('ex-bulk').hidden = !checked.size;
    $('ex-bulk-n').textContent = String(checked.size);
  }

  function renderList() {
    const list = filtered();
    $('ex-count').textContent = list.length === rows.length ? `${rows.length} ${rows.length === 1 ? 'incidencia' : 'incidencias'}` : `${list.length} de ${rows.length} incidencias`;
    $('ex-noresults').hidden = !!list.length;
    const ol = $('ex-list');
    ol.textContent = '';
    list.forEach(r => {
      const li = el('li', 'ex-row');
      li.dataset.carpeta = r.carpeta;
      if (current === r.carpeta) li.classList.add('on');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = checked.has(r.carpeta);
      cb.setAttribute('aria-label', `Seleccionar ${r.incidencia}`);
      cb.addEventListener('change', () => { if (cb.checked) checked.add(r.carpeta); else checked.delete(r.carpeta); renderBulk(); });
      const b = el('button', 'ex-item');
      b.type = 'button';
      if (current === r.carpeta) b.setAttribute('aria-current', 'true');
      const row1 = el('span', 'ex-row1');
      row1.append(el('span', 'ex-num', r.incidencia), statusChip(r.estado));
      if (r.guardada) row1.appendChild(el('span', 'ex-meta', `Guardada ${shortDate(r.guardada)}`));
      b.append(row1, el('span', 'ex-title', r.titulo || '(sin título)'));
      const sub = [r.equipo, r.categoria].filter(Boolean).join(' · ');
      if (sub) b.appendChild(el('span', 'ex-sub', sub));
      if (r.solucion) b.appendChild(el('span', 'ex-sol', r.solucion));
      const d = docOf(r);
      if ((r.etiquetas || []).length || (d && (d.estado === 'documentada' || d.url))) {
        const tg = el('span', 'rel-tags');
        (r.etiquetas || []).forEach(t => tg.appendChild(tagChip(t)));
        if (d && (d.estado === 'documentada' || d.url)) tg.appendChild(el('span', 'ex-doc' + (d.estado === 'documentada' ? '' : ' partial'), d.estado === 'documentada' ? 'Documentada' : 'En curso'));
        b.appendChild(tg);
      }
      b.addEventListener('click', () => select(r.carpeta));
      li.append(cb, b);
      ol.appendChild(li);
    });
    if (list.length && !list.some(r => r.carpeta === current)) select(list[0].carpeta);
    if (!list.length) { current = null; clearDetail('Ninguna incidencia coincide con la búsqueda o los filtros.'); }
    renderBulk();
  }

  function select(carpeta) {
    current = carpeta;
    $('ex-list').querySelectorAll('.ex-row').forEach(li => {
      const on = li.dataset.carpeta === carpeta;
      li.classList.toggle('on', on);
      const b = li.querySelector('.ex-item'); if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    const r = rows.find(x => x.carpeta === carpeta);
    if (r) showDetail(r);
  }

  // ---------- Markdown sencillo para leer incidencia.md ----------
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

  // ---------- detalle ----------
  const LABELS = { submodulo: 'Submódulo', solucion: 'Solución', documentacion: 'Documentación', documentacion_fecha: 'Documentada el',
    equipo_responsable: 'Equipo responsable', categoria: 'Categoría', reutilizable: 'Reutilizable', dependencia: 'Dependencia', impacto: 'Impacto', tipo: 'Tipo', estado: 'Estado', causa: 'Causa' };
  const MAIN_KEYS = new Set(['etiquetas', 'causa', 'solucion', 'documentacion', 'documentacion_url', 'documentacion_fecha']);
  const actionBtn = (label, icon, cls) => { const b = el('button', 'btn-card ex-act' + (cls ? ' ' + cls : '')); b.type = 'button'; b.append(svg(ICON[icon]), label); return b; };
  const actionLink = (label, icon, href) => { const a = el('a', 'btn-card ex-act'); a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.append(svg(ICON[icon]), label); return a; };
  let detailToken = 0;

  function clearDetail(text) {
    $('ex-dhead').textContent = '';
    $('ex-dbody').textContent = '';
    $('ex-dbody').appendChild(el('p', 'muted', text));
  }

  async function showDetail(r) {
    const token = ++detailToken;
    urls.splice(0).forEach(u => URL.revokeObjectURL(u));
    const head = $('ex-dhead'), body = $('ex-dbody');
    head.textContent = ''; body.textContent = ''; body.scrollTop = 0;

    const l1 = el('div', 'ex-dmeta');
    l1.append(el('span', 'ex-num', r.incidencia), statusChip(r.estado));
    const dates = [r.abierta && `Abierta ${shortDate(r.abierta)}`, r.guardada && `Guardada ${shortDate(r.guardada)}`].filter(Boolean).join(' · ');
    if (dates) l1.appendChild(el('span', 'ex-meta', dates));
    head.append(l1, el('h2', '', r.titulo || '(sin título)'));
    const acts = el('div', 'ex-actions');
    if (r.url) acts.appendChild(actionLink('Abrir en SmartIT', 'open', r.url));
    const d = docOf(r);
    if (d && d.url) acts.appendChild(actionLink(d.estado === 'documentada' ? 'Ver documentación' : 'Ver borrador', 'doc', d.url));
    // «Copiar prompt»: en las finalizadas se elige entre Documentar e Investigar, como en el visor.
    const copyPromptFor = async doc => {
      const { agentPath = '', promptTemplate = '', promptDocTemplate = '' } = await chrome.storage.local.get(['agentPath', 'promptTemplate', 'promptDocTemplate']).catch(() => ({}));
      const text = SieCarpeta.prompt({ agentPath, folderName: root.name, folder: r.carpeta, number: r.incidencia, summary: r.titulo, template: doc ? promptDocTemplate : promptTemplate, doc });
      try { await navigator.clipboard.writeText(text); toast(`${doc ? 'Prompt para documentar' : 'Prompt'} listo para pegar en el agente (Ctrl+V)`); } catch (_) { toast('No se pudo copiar al portapapeles', true); }
    };
    const copyBtn = actionBtn('Copiar prompt', 'copy');
    if (closed(r.estado)) {
      const wrap = el('span', 'settings ex-copy-wrap');
      const menu = el('div', 'opts-menu card ex-copy-menu');
      menu.setAttribute('role', 'menu'); menu.hidden = true;
      copyBtn.title = 'Elige qué prompt copiar: Documentar o Investigar';
      copyBtn.setAttribute('aria-haspopup', 'menu'); copyBtn.setAttribute('aria-expanded', 'false');
      const item = (title, sub, icon, doc) => {
        const b = el('button', 'opt-item opt-item-2'); b.type = 'button'; b.setAttribute('role', 'menuitem');
        const t = el('span'); t.append(el('strong', '', title), el('small', '', sub));
        b.append(svg(icon), t);
        b.addEventListener('click', () => { setMenu(false); copyPromptFor(doc); });
        return b;
      };
      const setMenu = open => { menu.hidden = !open; copyBtn.setAttribute('aria-expanded', String(open)); };
      menu.append(item('Documentar', 'Ya está finalizada: dejarla bien documentada', '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>', true),
        item('Investigar', 'Analizarla y buscar incidencias parecidas', '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', false));
      copyBtn.addEventListener('click', ev => { ev.stopPropagation(); setMenu(menu.hidden); if (!menu.hidden) menu.querySelector('.opt-item').focus(); });
      menu.addEventListener('keydown', ev => {
        const items = [...menu.querySelectorAll('.opt-item')], i = items.indexOf(document.activeElement);
        if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); items[(i + (ev.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
        if (ev.key === 'Escape') { ev.stopPropagation(); setMenu(false); copyBtn.focus(); }
      });
      document.addEventListener('click', ev => { if (!menu.hidden && !wrap.contains(ev.target)) setMenu(false); });
      wrap.append(copyBtn, menu);
      acts.appendChild(wrap);
    } else {
      copyBtn.title = 'Copia un prompt con la ruta de la incidencia y sus adjuntos';
      copyBtn.addEventListener('click', () => copyPromptFor(false));
      acts.appendChild(copyBtn);
    }
    const delBtn = actionBtn('Eliminar', 'trash', 'ex-danger');
    delBtn.addEventListener('click', () => askDelete([r.carpeta]));
    acts.appendChild(delBtn);
    head.appendChild(acts);

    let dir;
    try { dir = await root.getDirectoryHandle(r.carpeta); } catch (_) { body.appendChild(el('p', 'muted', 'No se encuentra la carpeta de esta incidencia: puede que se haya borrado fuera de aquí.')); return; }

    // Resumen: lo principal de la clasificación y de la ficha.
    const clasText = await SieCarpeta.readText(dir, 'clasificacion.md');
    if (token !== detailToken) return;
    const clas = clasText != null ? SieCarpeta.FM.parse(clasText) : { data: {}, body: '' };
    const c = clas.data;
    const sum = el('dl', 'ex-summary');
    const add = (k, v) => { if (v == null || v === '' || (Array.isArray(v) && !v.length)) return; const dd = el('dd'); if (v instanceof Node) dd.appendChild(v); else dd.textContent = v; sum.append(el('dt', '', k), dd); };
    add('Causa', c.causa || r.causa || 'Sin clasificar todavía');
    add('Solución', c.solucion || r.solucion);
    add('Equipo', r.equipo);
    add('Categoría', r.categoria);
    add('Servicio', r.servicio);
    const tags = [].concat(c.etiquetas || r.etiquetas || []);
    if (tags.length) { const tg = el('span', 'rel-tags'); tags.forEach(t => tg.appendChild(tagChip(t))); add('Etiquetas', tg); }
    if (d) add('Documentación', d.estado === 'documentada' ? `Documentada${c.documentacion_fecha ? ' el ' + isoDate(c.documentacion_fecha) : ''}` : d.estado === 'no-necesaria' ? 'No requiere documentación' : d.url ? 'En curso' : 'Pendiente');
    Object.entries(c).forEach(([k, v]) => {
      if (MAIN_KEYS.has(k) || v == null || v === '' || (Array.isArray(v) && !v.length)) return;
      add(LABELS[k] || k.replace(/_/g, ' ').replace(/^./, x => x.toUpperCase()), Array.isArray(v) ? v.join(', ') : v);
    });
    body.appendChild(sum);
    if (clas.body.trim() && !/^Notas libres sobre la causa y la solución/.test(clas.body.trim())) body.appendChild(el('div', 'ex-notes', clas.body.trim()));

    // Archivos de la carpeta (lo del agente incluido) y adjuntos.
    const others = [], files = [];
    for await (const [name, hnd] of dir.entries()) if (hnd.kind === 'file') others.push(name);
    try { const ad = await dir.getDirectoryHandle('adjuntos'); for await (const [name, hnd] of ad.entries()) if (hnd.kind === 'file') files.push(name); } catch (_) {}
    if (token !== detailToken) return;
    const blk = el('section', 'ex-block');
    blk.appendChild(el('h3', '', 'Archivos'));
    const fl = el('div', 'ex-filelist');
    for (const name of others.sort((a, b) => (a === 'incidencia.md' ? -1 : b === 'incidencia.md' ? 1 : a.localeCompare(b)))) {
      const a = el('a', 'ex-file'); a.append(svg(ICON.doc), name);
      fileUrl(dir, name).then(u => { if (u) { a.href = u; a.target = '_blank'; } });
      fl.appendChild(a);
    }
    blk.appendChild(fl);
    if (files.length) {
      blk.appendChild(el('h4', 'ex-sub-h', `Adjuntos (${files.length})`));
      const grid = el('div', 'ex-files');
      for (const name of files.sort()) {
        const a = el('a'); a.target = '_blank'; a.title = name;
        if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)) a.appendChild(el('img'));
        a.append(name);
        fileUrl(dir, 'adjuntos/' + name).then(u => { if (u) { a.href = u; const im = a.querySelector('img'); if (im) im.src = u; } });
        grid.appendChild(a);
      }
      blk.appendChild(grid);
    }
    body.appendChild(blk);

    // Contenido de incidencia.md, plegado; se pinta al abrirlo.
    const det = el('details', 'ex-block ex-md-wrap');
    det.appendChild(el('summary', '', 'Contenido de incidencia.md'));
    const md = el('div', 'ex-md');
    det.appendChild(md);
    det.addEventListener('toggle', async () => {
      if (!det.open || md.childNodes.length) return;
      const incText = await SieCarpeta.readText(dir, 'incidencia.md');
      if (incText != null) renderMd(md, SieCarpeta.FM.parse(incText).body.replace(/^\s*#\s+.*\n/, ''), dir);
      else md.appendChild(el('p', 'muted', 'No hay incidencia.md en la carpeta.'));
    });
    body.appendChild(det);
  }

  // ---------- eliminar ----------
  const modal = $('ex-confirm');
  let pending = [];
  let lastFocus = null;
  async function askDelete(folders) {
    pending = folders.slice();
    const list = $('ex-confirm-list');
    list.textContent = '';
    if (pending.length === 1) {
      const r = rows.find(x => x.carpeta === pending[0]) || { incidencia: pending[0] };
      $('ex-confirm-title').textContent = `¿Eliminar ${r.incidencia}?`;
      $('ex-confirm-text').textContent = 'Se borrará su carpeta con todo lo que contiene, también lo que haya dejado el agente, y desaparecerá del índice y de Relacionadas. Tus etiquetas se mantienen.';
      try {
        const dir = await root.getDirectoryHandle(pending[0]);
        const names = []; let adj = 0;
        for await (const [name, h] of dir.entries()) {
          if (h.kind === 'file') names.push(name);
          else if (name === 'adjuntos') { for await (const [, x] of h.entries()) if (x.kind === 'file') adj++; }
          else names.push(name + '/');
        }
        names.sort().forEach(n => list.appendChild(el('li', '', n)));
        if (adj) list.appendChild(el('li', '', `adjuntos/ (${adj} ${adj === 1 ? 'archivo' : 'archivos'})`));
      } catch (_) { list.appendChild(el('li', '', `${pending[0]}/`)); }
    } else {
      $('ex-confirm-title').textContent = `¿Eliminar ${pending.length} incidencias?`;
      $('ex-confirm-text').textContent = 'Se borrarán sus carpetas con todo lo que contienen y desaparecerán del índice y de Relacionadas. Tus etiquetas se mantienen.';
      pending.forEach(f => { const r = rows.find(x => x.carpeta === f) || { incidencia: f, titulo: '' }; list.appendChild(el('li', '', [r.incidencia, r.titulo].filter(Boolean).join(' · '))); });
    }
    lastFocus = document.activeElement;
    modal.classList.remove('closing');
    modal.hidden = false;
    $('ex-confirm-cancel').focus();
  }
  function closeModal() {
    if (modal.hidden) return;
    modal.classList.add('closing');
    setTimeout(() => { modal.hidden = true; modal.classList.remove('closing'); if (lastFocus && lastFocus.isConnected) lastFocus.focus(); }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 170);
  }
  $('ex-confirm-close').addEventListener('click', closeModal);
  $('ex-confirm-cancel').addEventListener('click', closeModal);
  modal.addEventListener('click', ev => { if (ev.target === modal) closeModal(); });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !modal.hidden) { ev.preventDefault(); closeModal(); } });
  $('ex-confirm-ok').addEventListener('click', async () => {
    const ok = $('ex-confirm-ok');
    ok.disabled = true;
    try {
      const names = pending.map(f => (rows.find(x => x.carpeta === f) || { incidencia: f }).incidencia);
      const res = await SieCarpeta.remove(root, pending);
      rows = res.rows;
      res.done.forEach(f => checked.delete(f));
      if (res.done.includes(current)) current = null;
      closeModal();
      if (res.failed.length) toast(`No se pudo eliminar ${res.failed.map(f => f.name).join(', ')}: ${res.failed[0].error}`, true);
      else toast(res.done.length === 1 ? `${names[0]} eliminada` : `${res.done.length} incidencias eliminadas`);
      if (renderTop()) renderList();
    } catch (err) {
      toast('No se pudo eliminar: ' + (err.message || err), true);
    } finally { ok.disabled = false; }
  });
  $('ex-bulk-cancel').addEventListener('click', () => { checked.clear(); renderList(); });
  $('ex-bulk-del').addEventListener('click', () => askDelete([...checked]));

  // ---------- arranque ----------
  $('ex-search').addEventListener('input', () => renderList());
  $('ex-sort').addEventListener('change', () => renderList());
  $('ex-clear').addEventListener('click', () => { $('ex-search').value = ''; quick = 'todas'; activeTags.clear(); renderTop(); renderList(); });
  if (renderTop()) renderList();
})();
