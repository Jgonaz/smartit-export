(async () => {
  'use strict';
  const $ = id => document.getElementById(id);
  const key = location.hash.slice(1);
  const store = await chrome.storage.local.get(key);
  const data = store[key];
  if (!data) {
    $('title').textContent = 'No hay datos para mostrar';
    $('meta').textContent = 'Vuelve a pulsar el icono de exportar en SmartIT.';
    return;
  }

  const h = data.header || {};
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const svg = paths => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
  const ICON = {
    image: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 15l5-4 4 3 3-2 6 4"/>'),
    clip: svg('<path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9"/>'),
    lines: svg('<path d="M4 6h16M4 12h10M4 18h7"/>'),
    info: svg('<path d="M12 11v6"/><path d="M12 7.5v.01"/>'),
    file: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>')
  };

  document.title = `${h.number || 'Incidencia'} – ${h.summary || ''}`;
  if (h.number) { $('number').textContent = h.number; $('number').hidden = false; }
  $('title').textContent = h.summary || h.number || 'Incidencia';
  try {
    const d = new Date(data.exportedAt);
    $('exported').textContent = `SmartIT · Exportación del ${d.toLocaleDateString('es-ES')} ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
  } catch (_) {}
  const shortDate = s => (s || '').replace(/:\d{2}$/, '');
  const statusClass = s => /resuel|cerrad|completad/i.test(s) ? 'b-green'
    : /cancel/i.test(s) ? 'b-gray' : /pendient|espera/i.test(s) ? 'b-amber' : 'b-blue';
  const prioClass = p => /cr[ií]tic|alta|urgent/i.test(p) ? 'b-red' : /media/i.test(p) ? 'b-amber' : 'b-gray';
  const meta = $('meta');
  const addSep = () => { if (meta.childNodes.length) meta.appendChild(el('span', 'sep', '•')); };
  if (h.status) { const b = el('span', 'badge ' + statusClass(h.status)); b.appendChild(el('span', 'dot')); b.append(h.status); meta.appendChild(b); }
  if (h.priority) meta.appendChild(el('span', 'badge ' + prioClass(h.priority), `Prioridad ${h.priority.toLowerCase()}`));
  if (h.created) { addSep(); meta.appendChild(el('span', '', `Creada ${shortDate(h.created)}`)); }
  if (h.modified) { addSep(); meta.appendChild(el('span', '', `Actualizada ${shortDate(h.modified)}`)); }
  if (data.sourceUrl) { $('source').href = data.sourceUrl; $('source').hidden = false; }

  // ---------- adjuntos ----------
  const IMG_EXT = /\.(png|jpe?g|gif|bmp|webp|svg)$/i;
  const attachments = [];
  (data.activity || []).forEach(e => (e.attachments || []).forEach(a =>
    attachments.push({ ...a, date: e.date, author: e.author, entry: e })));
  $('att-count').textContent = attachments.length;
  $('att-empty').hidden = attachments.length > 0;
  $('carousel').hidden = attachments.length === 0;
  document.querySelector('.att-nav').hidden = attachments.length < 4;

  // data: URL -> blob: URL (Chrome no deja abrir data: en una pestaña nueva).
  const dataUrlToBlobUrl = du => {
    const [head, b64] = du.split(',');
    const mime = head.match(/data:([^;]+)/)[1];
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  };
  attachments.forEach(a => { if (a.dataUrl) a.url = dataUrlToBlobUrl(a.dataUrl); });

  const isImage = a => IMG_EXT.test(a.name) || /^image\//.test(a.mime || '');
  // Imagen completa si se pudo descargar; si no, la miniatura que da SmartIT.
  const imgSrc = a => (isImage(a) && (a.url || a.iconSrc)) || '';
  const failed = attachments.filter(a => a.error);
  if (failed.length) {
    $('att-notice').hidden = false;
    $('att-notice').textContent = `No se pudieron cargar ${failed.length} adjunto(s): ${failed.map(a => a.name).join(', ')}. ` +
      'Se muestra la miniatura cuando existe; ábrelos desde SmartIT.';
  }

  const carousel = $('carousel');
  // ---------- tooltip de origen ----------
  const pop = document.createElement('div');
  pop.className = 'origin-pop';
  pop.hidden = true;
  document.body.appendChild(pop);
  const fmtSize = n => !n ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;
  let popFor = null;

  // ---------- contexto de cada adjunto ----------
  const toTs = s => {
    const m = (s || '').match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
    return m ? new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]).getTime() : 0;
  };
  // Notas automáticas que solo dicen "Attachment for an incident entry - a.png, b.jpg".
  const isGenericBody = (body, names) => {
    const b = (body || '').trim();
    if (!b) return true;
    if (/^(attachment for|adjunto)/i.test(b)) return true;
    let rest = b;
    names.forEach(n => { rest = rest.split(n).join(''); });
    return rest.replace(/[\s,;.\-–]+/g, '').length < 8;
  };
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Fragmento alrededor de una mención: el texto que la precede (hasta ~450 caracteres,
  // empezando en un inicio de línea) y la línea de la propia mención.
  function snippetAround(text, idx, len) {
    let from = Math.max(0, idx - 450);
    if (from > 0) {
      const nl = text.indexOf('\n', from);
      if (nl >= 0 && nl < idx) from = nl + 1;
    }
    const endLine = text.indexOf('\n', idx + len);
    const to = endLine < 0 ? text.length : endLine;
    const s = text.slice(from, to).replace(/\n{3,}/g, '\n\n').trim();
    return (from > 0 ? '…' : '') + s;
  }
  function findMentions(a) {
    const stem = a.name.replace(/\.[^.]+$/, '');
    const stems = [...new Set([a.name, stem, stem.replace(/\s*\(\d+\)$/, '')])].filter(s => s.length >= 4);
    const sources = [{ label: 'Descripción de la incidencia', text: data.description || '' }];
    (data.activity || []).forEach(e => {
      if (e === a.entry || !e.body) return;
      sources.push({ label: `Nota del ${e.date}${e.author ? ' · ' + e.author : ''}`, text: e.body });
    });
    const found = [];
    for (const src of sources) {
      for (const s of stems) {
        const m = new RegExp(escRe(s) + '(?![\\w])', 'i').exec(src.text);
        if (m) { found.push({ label: `Mencionada en: ${src.label}`, text: snippetAround(src.text, m.index, m[0].length) }); break; }
      }
    }
    return found;
  }
  // Notas con texto real escritas casi a la vez (±2 min) que la nota del adjunto.
  function sameMomentNotes(a) {
    const e = a.entry || {};
    const t = toTs(e.date);
    if (!t) return [];
    return (data.activity || [])
      .filter(o => o !== e && o.body && Math.abs(toTs(o.date) - t) <= 120000 &&
        !isGenericBody(o.body, (o.attachments || []).map(x => x.name)))
      .map(o => ({ label: `Nota del mismo momento (${o.date}${o.author ? ' · ' + o.author : ''})`, text: o.body }));
  }
  function attachmentContext(a) {
    const e = a.entry || {};
    const names = (e.attachments || []).map(x => x.name);
    const ctx = [];
    if (!isGenericBody(e.body, names)) ctx.push({ label: 'Comentario de la nota', text: e.body.trim() });
    ctx.push(...findMentions(a), ...sameMomentNotes(a));
    return ctx;
  }
  const clip = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);

  function showOrigin(a, anchor) {
    if (popFor === a && !pop.hidden) { pop.hidden = true; popFor = null; return; }
    const e = a.entry || {};
    const rows = [
      ['Origen', 'Nota de la actividad'],
      ['Tipo', e.type],
      ['Autor', e.author],
      ['Fecha', e.date],
      ['Visibilidad', e.access],
      ['ID de la nota', e.id],
      ['Archivo', [a.name, fmtSize(a.size)].filter(Boolean).join(' · ')]
    ].filter(([, v]) => v);
    pop.innerHTML = '<dl></dl>';
    const dl = pop.querySelector('dl');
    rows.forEach(([k, v]) => {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      dl.append(dt, dd);
    });
    const ctx = attachmentContext(a);
    if (!ctx.length) {
      const none = document.createElement('div');
      none.className = 'pop-body muted';
      none.textContent = 'La nota no tiene comentario y el archivo no se menciona en la descripción ni en otras notas.';
      pop.appendChild(none);
    }
    ctx.forEach(c => {
      const sec = document.createElement('div');
      sec.className = 'pop-body';
      const h = document.createElement('div'); h.className = 'pop-h'; h.textContent = c.label;
      const t = document.createElement('div'); t.textContent = clip(c.text, 700);
      sec.append(h, t);
      pop.appendChild(sec);
    });
    pop.hidden = false;
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth;
    pop.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
    pop.style.top = (r.bottom + 6 + scrollY) + 'px';
    popFor = a;
  }
  document.addEventListener('click', ev => {
    if (!pop.hidden && !pop.contains(ev.target) && !ev.target.closest('.info-btn')) { pop.hidden = true; popFor = null; }
  });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') { pop.hidden = true; popFor = null; } });
  carousel.addEventListener('scroll', () => { pop.hidden = true; popFor = null; });

  // Resumen corto del contexto para la tarjeta.
  function contextSummary(a) {
    const ctx = attachmentContext(a);
    if (!ctx.length) return '';
    const c = ctx[0].label;
    if (c.startsWith('Comentario')) return 'Comentario de la nota';
    if (c.includes('Descripción')) return 'Mencionado en la descripción';
    if (c.startsWith('Mencionada')) return 'Mencionado en otra nota';
    return 'Nota del mismo momento';
  }

  attachments.forEach((a, i) => {
    const tile = el('div', 'tile');
    const src = imgSrc(a);
    const view = el('button', 'tile-img' + (src ? '' : ' file'));
    view.type = 'button';
    view.setAttribute('aria-label', (src ? 'Ver ' : 'Abrir ') + a.name);
    if (src) {
      const img = el('img'); img.alt = ''; img.src = src; view.appendChild(img);
    } else {
      view.innerHTML = ICON.file;
      const ext = (a.name.split('.').pop() || '?').toUpperCase().slice(0, 5);
      view.appendChild(el('span', 'ext', a.url ? `${ext} · se abre en pestaña nueva` : ext));
    }
    view.addEventListener('click', () => openModal(i));
    const info = el('button', 'info-btn');
    info.type = 'button';
    info.title = '¿De dónde sale este archivo?';
    info.setAttribute('aria-label', `Origen de ${a.name}`);
    info.innerHTML = ICON.info;
    info.addEventListener('click', ev => { ev.stopPropagation(); showOrigin(a, info); });
    const m = el('div', 'tile-meta');
    m.appendChild(el('div', 'tile-name', a.name)).title = a.name;
    m.appendChild(el('div', 'tile-sub', `${shortDate(a.date)} · ${a.author}`));
    const cs = contextSummary(a);
    const ctx = el('div', 'tile-ctx' + (cs ? '' : ' none'));
    ctx.innerHTML = ICON.lines;
    ctx.append(cs || 'Sin comentario asociado');
    m.appendChild(ctx);
    if (a.error) m.appendChild(el('div', 'tile-warn', 'Solo miniatura (no se pudo cargar)'));
    tile.append(view, info, m);
    carousel.appendChild(tile);
  });
  $('car-prev').onclick = () => carousel.scrollBy({ left: -carousel.clientWidth * 0.8 });
  $('car-next').onclick = () => carousel.scrollBy({ left: carousel.clientWidth * 0.8 });

  // ---------- modal ----------
  let current = -1;
  const viewable = () => attachments.map((a, i) => (imgSrc(a) ? i : -1)).filter(i => i >= 0);
  function openModal(i) {
    const a = attachments[i];
    const src = imgSrc(a);
    if (!src) {
      if (a.url) window.open(a.url, '_blank'); // PDF, texto…: se abre en pestaña nueva
      return;
    }
    current = i;
    $('modal-img').src = src;
    $('modal-cap').textContent = `${a.name} — ${a.date} · ${a.author}`;
    const dl = $('modal-dl');
    dl.hidden = !a.url;
    if (a.url) { dl.href = a.url; dl.download = a.name; }
    $('modal').hidden = false;
  }
  function closeModal() { $('modal').hidden = true; current = -1; }
  function step(d) {
    const list = viewable();
    if (!list.length) return;
    const pos = list.indexOf(current);
    openModal(list[(pos + d + list.length) % list.length]);
  }
  $('modal-close').onclick = closeModal;
  $('modal-prev').onclick = () => step(-1);
  $('modal-next').onclick = () => step(1);
  $('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', e => {
    if ($('modal').hidden) return;
    if (e.key === 'Escape') closeModal();
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });

  // ---------- texto ----------
  const indent = (s, pad = '  ') => s.split('\n').join('\n' + pad);
  function buildText() {
    const withSystem = $('opt-system').checked;
    const withFields = $('opt-fields').checked;
    const L = [];
    L.push(`# ${[h.number, h.summary].filter(Boolean).join(' — ')}`);
    if (data.sourceUrl) L.push(`URL: ${data.sourceUrl}`);
    [['Estado', h.status], ['Prioridad', h.priority], ['Fecha de creación', h.created],
      ['Última modificación', h.modified]].forEach(([k, v]) => v && L.push(`${k}: ${v}`));
    L.push('');
    if (data.description) { L.push('## Descripción', data.description, ''); }
    if (withFields && data.fields && data.fields.length) {
      L.push('## Datos de la incidencia');
      data.fields.forEach(f => L.push(`- ${f.label}: ${indent(f.value)}`));
      L.push('');
    }
    if (showTeams) {
      L.push(`## Recorrido entre equipos (${bounces} cambios de equipo)`);
      teamSteps.forEach((s, i) => L.push(`${i + 1}. [${s.date}] ${s.group}${s.by ? ` (por ${s.by})` : ''}`));
      L.push('');
    }
    const entries = (data.activity || []).filter(e => withSystem || e.isNote || (e.attachments || []).length);
    L.push(`## Actividad (${entries.length} entradas, de la más antigua a la más reciente)`);
    entries.forEach(e => {
      const head = [e.type, e.author].filter(Boolean).join(' — ');
      L.push('', `### [${e.date}] ${head || '(evento)'}${e.access ? ` (${e.access})` : ''}`);
      if (e.body) L.push(e.body);
      if ((e.attachments || []).length) L.push(`Adjuntos: ${e.attachments.map(a => a.name).join(', ')}`);
    });
    if (attachments.length) {
      L.push('', '## Adjuntos');
      attachments.forEach(a => {
        const where = findMentions(a).map(m => m.label.replace(/^Mencionada en: /, ''));
        L.push(`- ${a.name} (${a.date}, ${a.author})${where.length ? ` — mencionado en: ${where.join('; ')}` : ''}`);
      });
    }
    return L.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }
  // ---------- vista formateada ----------
  const COLORS = ['#2E44C7', '#B4532A', '#1F7A6B', '#7A3FB0', '#A3261F', '#2B6A9E', '#6B5A12', '#3D7A2B'];
  const colorFor = name => { let x = 0; for (const c of name || '') x = (x * 31 + c.charCodeAt(0)) >>> 0; return COLORS[x % COLORS.length]; };
  const initials = name => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  // Texto con las menciones a adjuntos convertidas en etiquetas pulsables.
  const mentionList = attachments.flatMap((a, i) => {
    const stem = a.name.replace(/\.[^.]+$/, '');
    return [...new Set([a.name, stem, stem.replace(/\s*\(\d+\)$/, '')])].filter(s => s.length >= 4).map(s => ({ s, i }));
  }).sort((x, y) => y.s.length - x.s.length);
  const mentionRe = mentionList.length
    ? new RegExp('(' + mentionList.map(m => escRe(m.s)).join('|') + ')(?![\\w])', 'gi') : null;
  function richText(target, text) {
    if (!mentionRe) { target.append(text); return; }
    let last = 0;
    text.replace(mentionRe, (match, _g, idx) => {
      target.append(text.slice(last, idx));
      const hit = mentionList.find(m => m.s.toLowerCase() === match.toLowerCase());
      const chip = el('button', 'chip');
      chip.type = 'button';
      chip.innerHTML = ICON.image;
      chip.append(attachments[hit.i].name);
      chip.addEventListener('click', () => openModal(hit.i));
      target.appendChild(chip);
      last = idx + match.length;
      return match;
    });
    target.append(text.slice(last));
  }

  // ---------- recorrido entre equipos ----------
  // Grupos de soporte por los que ha pasado la incidencia, en orden, a partir de la actividad:
  // "El Grupo de soporte ha cambiado a: X" y "Asignado a X por Y" (cuando X es un grupo, no una persona).
  const GROUP_HINT = /^(soporte|support|equipo|grupo|mesa|cau|service ?desk|help ?desk|nivel|n[123]\b|l[123]\b|sistemas|operaciones|desarrollo|plataforma|infraestructura|redes|seguridad|comunicaciones|aplicaciones|explotaci)/i;
  function teamPath() {
    const known = new Set();
    (data.fields || []).filter(f => /^grupo de soporte$/i.test(f.label)).forEach(f => known.add(f.value.trim().toLowerCase()));
    const people = new Set((data.activity || []).map(e => (e.author || '').trim().toLowerCase()).filter(Boolean));
    (data.fields || []).filter(f => /^asignado a$/i.test(f.label)).forEach(f => people.add(f.value.trim().toLowerCase()));
    const textOf = e => [e.type, e.action, e.body].filter(Boolean).join('\n');
    const R_CHANGED = /grupo de soporte ha cambiado a:?\s*(.+?)\s*$/im;
    const R_ASSIGNED = /asignad[oa] a:?\s+(.+?)\s+por\s+(.+?)\s*$/im;
    (data.activity || []).forEach(e => { const m = R_CHANGED.exec(textOf(e)); if (m) known.add(m[1].toLowerCase()); });

    const steps = [];
    (data.activity || []).forEach(e => {
      const t = textOf(e);
      let group = null, by = '';
      const c = R_CHANGED.exec(t);
      const a = R_ASSIGNED.exec(t);
      if (c) { group = c[1]; by = e.author || ''; }
      else if (a) {
        const x = a[1].replace(/^["«“]|["»”]$/g, '').trim();
        const lx = x.toLowerCase();
        if (known.has(lx) || (!people.has(lx) && GROUP_HINT.test(x))) { group = x; by = a[2]; }
      }
      if (!group) return;
      const last = steps[steps.length - 1];
      if (last && last.group.toLowerCase() === group.toLowerCase()) return; // mismo grupo: no es un cambio
      steps.push({ group, date: e.date, by });
    });
    return steps;
  }
  const TEAM_COLORS = ['#2E44C7', '#B4532A', '#1F7A6B', '#7A3FB0', '#2B6A9E', '#A3261F', '#6B5A12', '#3D7A2B'];
  const teamSteps = teamPath();
  const bounces = Math.max(0, teamSteps.length - 1);
  const showTeams = bounces >= 3;

  function renderTeams() {
    $('teams-card').hidden = !showTeams;
    if (!showTeams) return;
    const distinct = [...new Set(teamSteps.map(s => s.group.toLowerCase()))];
    $('teams-summary').textContent = `${bounces} cambios de equipo · ${distinct.length} equipos distintos`;
    const counts = {};
    const ol = $('teams');
    ol.textContent = '';
    teamSteps.forEach((s, i) => {
      const k = s.group.toLowerCase();
      counts[k] = (counts[k] || 0) + 1;
      const li = el('li', 'team');
      if (i > 0) {
        const arrow = el('span', 'team-arrow');
        arrow.setAttribute('aria-hidden', 'true');
        arrow.innerHTML = svg('<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>');
        li.appendChild(arrow);
      }
      const box = el('div', 'team-box');
      box.style.setProperty('--tc', TEAM_COLORS[distinct.indexOf(k) % TEAM_COLORS.length]);
      const step = el('div', 'team-step', `Paso ${i + 1}`);
      if (counts[k] > 1) step.appendChild(Object.assign(el('span', 'team-repeat', `${counts[k]}ª vez`), { title: 'Vuelve a un equipo por el que ya pasó' }));
      if (i === teamSteps.length - 1) step.appendChild(el('span', 'team-now', 'actual'));
      box.append(step, el('div', 'team-name', s.group),
        el('div', 'team-when', [shortDate(s.date), s.by && `por ${s.by}`].filter(Boolean).join(' · ')));
      li.appendChild(box);
      ol.appendChild(li);
    });
  }

  function renderDescription() {
    const box = $('desc');
    box.textContent = '';
    const text = (data.description || '').trim();
    $('desc-card').hidden = !text;
    text.split(/\n{2,}/).forEach(par => { const p = el('p'); richText(p, par.trim()); box.appendChild(p); });
  }

  function renderTimeline() {
    const withSystem = $('opt-system').checked;
    const entries = (data.activity || []).filter(e => withSystem || e.isNote || (e.attachments || []).length);
    $('act-count').textContent = `${entries.length} entradas · de la más antigua a la más reciente`;
    const ol = $('timeline');
    ol.textContent = '';
    entries.forEach(e => {
      const li = el('li', 'tl-item');
      const rail = el('div', 'tl-rail');
      const body = el('div', 'tl-body');
      const isNote = e.isNote || (e.attachments || []).length;
      if (isNote) {
        const av = el('span', 'avatar', initials(e.author));
        av.style.background = colorFor(e.author);
        av.setAttribute('aria-hidden', 'true');
        rail.appendChild(av);
        const card = el('div', 'note');
        const head = el('div', 'note-head');
        const who = el('div', 'note-who');
        who.appendChild(el('span', 'note-author', e.author || 'Sistema'));
        if (e.type) who.appendChild(el('span', 'tag', e.type));
        if (e.access) who.appendChild(el('span', 'tag ' + (/p[uú]blic/i.test(e.access) ? 'pub' : 'priv'), e.access));
        head.append(who, el('time', '', shortDate(e.date)));
        card.appendChild(head);
        if (e.body) { const p = el('p', 'note-text'); richText(p, e.body); card.appendChild(p); }
        if ((e.attachments || []).length) {
          const files = el('div', 'files');
          e.attachments.forEach(at => {
            const idx = attachments.findIndex(x => x.entry === e && x.slot === at.slot);
            const chip = el('button', 'file-chip');
            chip.type = 'button';
            chip.innerHTML = ICON.clip;
            chip.append(at.name);
            chip.addEventListener('click', () => idx >= 0 && openModal(idx));
            files.appendChild(chip);
          });
          card.appendChild(files);
        }
        body.appendChild(card);
      } else {
        const dot = el('span', 'ev-dot'); dot.appendChild(el('span')); dot.setAttribute('aria-hidden', 'true');
        rail.appendChild(dot);
        const row = el('div', 'ev-row');
        const txt = [e.type, e.action, e.body].filter(Boolean).join(' · ') || '(evento)';
        row.append(el('span', 'ev-text', txt), el('time', '', shortDate(e.date)));
        body.appendChild(row);
      }
      rail.appendChild(el('span', 'tl-line'));
      li.append(rail, body);
      ol.appendChild(li);
    });
  }

  function renderSide() {
    const withFields = $('opt-fields').checked;
    const fields = data.fields || [];
    const isRes = f => /^nota de resoluci/i.test(f.label);
    const res = [...new Set(fields.filter(isRes).map(f => f.value.trim()))];
    $('res-card').hidden = !res.length;
    $('resolution').textContent = res.join('\n\n');
    const rest = fields.filter(f => !isRes(f));
    $('fields-card').hidden = !withFields || !rest.length;
    const dl = $('fields');
    dl.textContent = '';
    rest.forEach(f => {
      const row = el('div');
      row.append(el('dt', '', f.label), el('dd', '', f.value));
      dl.appendChild(row);
    });
  }

  let mode = 'view';
  function render() {
    renderTimeline();
    renderSide();
    $('md').textContent = buildText();
    $('view').hidden = mode !== 'view';
    $('md').hidden = mode !== 'md';
    $('mode-view').setAttribute('aria-pressed', String(mode === 'view'));
    $('mode-md').setAttribute('aria-pressed', String(mode === 'md'));
  }
  $('opt-system').onchange = render;
  $('opt-fields').onchange = render;
  $('mode-view').onclick = () => { mode = 'view'; render(); };
  $('mode-md').onclick = () => { mode = 'md'; render(); };
  renderDescription();
  renderTeams();
  render();

  let toastTimer;
  $('copy').onclick = async () => {
    await navigator.clipboard.writeText(buildText());
    const b = $('copy');
    b.classList.add('ok');
    $('copy-label').textContent = '¡Markdown copiado!';
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      b.classList.remove('ok');
      $('copy-label').textContent = 'Pulsa aquí para copiar el markdown completo';
      $('toast').hidden = true;
    }, 1800);
  };
})();
