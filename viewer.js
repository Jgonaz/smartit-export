(async () => {
  'use strict';
  const $ = id => document.getElementById(id);
  // Incrustado dentro de SmartIT (iframe) en vez de en una pestaña propia.
  const embedded = window.top !== window;
  if (embedded) document.body.classList.add('embedded');
  const key = location.hash.slice(1);
  const store = await chrome.storage.local.get(key);
  const data = store[key];
  if (!data) {
    $('title').textContent = 'No hay datos para mostrar';
    $('lede').textContent = 'Vuelve a pulsar el icono de exportar en SmartIT.';
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
    file: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>')
  };
  const shortDate = s => (s || '').replace(/:\d{2}$/, '');
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  document.title = `${h.number || 'Incidencia'} – ${h.summary || ''}`;
  $('number').textContent = h.number || '';
  $('title').textContent = h.summary || h.number || 'Incidencia';
  if (data.sourceUrl) { $('source').href = data.sourceUrl; $('source').hidden = false; }

  // ---------- adjuntos ----------
  const IMG_EXT = /\.(png|jpe?g|gif|bmp|webp|svg)$/i;
  const attachments = [];
  (data.activity || []).forEach(e => (e.attachments || []).forEach(a =>
    attachments.push({ ...a, date: e.date, author: e.author, entry: e })));
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

  // ---------- recuadro ⓘ: de dónde sale cada archivo ----------
  const pop = document.createElement('div');
  pop.className = 'origin-pop';
  pop.hidden = true;
  document.body.appendChild(pop);
  const fmtSize = n => !n ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;
  let popFor = null;

  // ---------- contexto de cada adjunto ----------
  const toTs = s => {
    const m = (s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    return m ? new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0)).getTime() : 0;
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
  // Formas en que el texto puede nombrar un adjunto. El nombre completo siempre vale; el nombre sin
  // extensión solo si no puede confundirse con texto normal: "image002", "captura-login", "IMG_1234"…
  // pero no "correo" (una palabra) ni "0320121551" (un número que puede ser un dato del cliente).
  const looksLikeFileName = st => /^(image|imagen|img)[\s_-]*\d+$/i.test(st) ||
    (/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(st) && /\d/.test(st)) || (/[\s_.-]/.test(st.trim()) && st.trim().length >= 6);
  const nameForms = a => {
    const stem = a.name.replace(/\.[^.]+$/, '');
    const forms = [a.name];
    [stem, stem.replace(/\s*\(\d+\)$/, '')].forEach(st => { if (st.length >= 4 && looksLikeFileName(st)) forms.push(st); });
    return [...new Set(forms)];
  };
  function findMentions(a) {
    const stems = nameForms(a);
    const sources = [{ label: 'Descripción de la incidencia', text: data.description || '' }];
    (data.activity || []).forEach(e => {
      if (e === a.entry || !e.body) return;
      sources.push({ label: `Nota del ${e.date}${e.author ? ' · ' + e.author : ''}`, text: e.body });
    });
    const found = [];
    for (const src of sources) {
      for (const s of stems) {
        const m = new RegExp('(?<![\\w.])' + escRe(s) + '(?![\\w])', 'i').exec(src.text);
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
    const m = $('modal');
    clearTimeout(closeTimer);
    m.classList.remove('closing');
    if (m.hidden) m.hidden = false; // la animación de entrada la hace el CSS al mostrarse
    else { const img = $('modal-img'); img.classList.remove('swap'); void img.offsetWidth; img.classList.add('swap'); }
  }
  let closeTimer;
  function closeModal() {
    const m = $('modal');
    if (m.hidden || m.classList.contains('closing')) return;
    current = -1;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    m.classList.add('closing');
    closeTimer = setTimeout(() => { m.hidden = true; m.classList.remove('closing'); }, reduce ? 0 : 170);
  }
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
    if ($('modal').hidden || $('modal').classList.contains('closing')) return;
    if (e.key === 'Escape') closeModal();
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });

  // ---------- texto ----------
  const indent = (s, pad = '  ') => s.split('\n').join('\n' + pad);
  // files (opcional): Map adjunto -> ruta relativa dentro del .zip; si existe, se enlaza cada adjunto.
  function buildText(files) {
    const withSystem = $('opt-system').checked;
    const withFields = $('opt-fields').checked;
    const L = [];
    L.push(`# ${[h.number, h.summary].filter(Boolean).join(' — ')}`);
    if (data.sourceUrl) L.push(`URL: ${data.sourceUrl}`);
    [['Estado', h.status], ['Prioridad', h.priority], ['Fecha de creación', h.created],
      ['Última modificación', h.modified]].forEach(([k, v]) => v && L.push(`${k}: ${v}`));
    L.push('');
    if (data.summary && data.summary.markdown) {
      const meta = [data.summary.by && `por ${data.summary.by}`, data.summary.date].filter(Boolean).join(', ');
      L.push('## Resumen de HelixGPT' + (meta ? ` (generado ${meta})` : ''), data.summary.markdown, '');
    }
    if (data.description) { L.push('## Descripción', data.description, ''); }
    if (withFields && data.fields && data.fields.length) {
      L.push('## Datos de la incidencia');
      data.fields.forEach(f => L.push(`- ${f.label}: ${indent(f.value)}`));
      L.push('');
    }
    if (teamSteps.length >= 2) {
      L.push(`## Recorrido entre equipos (${teamSteps.length} pasos)`);
      teamSteps.forEach((s, i) => {
        const tags = [s.reopened && 'reabierta', s.closed && `cerrada: ${s.closedAs}`, i === teamSteps.length - 1 && !s.closed && 'actual'].filter(Boolean);
        L.push(`${i + 1}. [${s.date}] ${s.group}${s.by ? ` (por ${s.by})` : ''}${tags.length ? ` — ${tags.join(', ')}` : ''}`);
      });
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
        if (files) {
          const f = files.get(a);
          if (f) L.push(isImage(a) ? `  ![${a.name}](${encodeURI(f)})` : `  [${a.name}](${encodeURI(f)})`);
          else L.push('  (no incluido: no se pudo cargar)');
        }
      });
    }
    return L.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }
  // Texto con las menciones a adjuntos convertidas en etiquetas pulsables.
  const mentionList = attachments.flatMap((a, i) => nameForms(a).map(s => ({ s, i }))).sort((x, y) => y.s.length - x.s.length);
  const mentionRe = mentionList.length
    ? new RegExp('(?<![\\w.])(' + mentionList.map(m => escRe(m.s)).join('|') + ')(?![\\w])', 'gi') : null;
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
  const groupEvents = new Map(); // entrada de la actividad -> grupo al que pasa
  function teamPath() {
    const known = new Set();
    (data.fields || []).filter(f => /^grupo de soporte$/i.test(f.label)).forEach(f => known.add(f.value.trim().toLowerCase()));
    const people = new Set((data.activity || []).map(e => (e.author || '').trim().toLowerCase()).filter(Boolean));
    (data.fields || []).filter(f => /^asignado a$/i.test(f.label)).forEach(f => people.add(f.value.trim().toLowerCase()));
    const textOf = e => [e.type, e.action, e.body].filter(Boolean).join('\n');
    const R_CHANGED = /grupo de soporte ha cambiado a:?\s*(.+?)\s*$/im;
    const R_ASSIGNED = /asignad[oa] a:?\s+(.+?)\s+por\s+(.+?)\s*$/im;
    (data.activity || []).forEach(e => { const m = R_CHANGED.exec(textOf(e)); if (m) known.add(m[1].toLowerCase()); });

    // Estados: "Estado marcado: "Resuelto" por …". Cerrada = Resuelto/Cerrado/Cancelado;
    // un estado abierto después de uno cerrado es una reapertura.
    const R_STATUS = /estado marcado:?\s*["«“]?([^"»”\n]+?)["»”]?(?:\s+por\s|$)/im;
    const isClosed = st => /resuelt|cerrad|cancelad/i.test(st);
    const near = (d1, d2) => Math.abs(toTs(d1) - toTs(d2)) <= 120000;
    const steps = [];
    let closed = false;
    (data.activity || []).forEach(e => {
      const t = textOf(e);
      const last = steps[steps.length - 1];
      const st = R_STATUS.exec(t);
      if (st && last) {
        if (isClosed(st[1])) { closed = true; last.closed = true; last.closedAs = st[1].trim(); }
        else if (closed) {
          closed = false;
          // Reapertura: abre un paso nuevo (aunque siga en el mismo equipo), salvo que el paso
          // actual acabe de empezar (cambio de grupo en el mismo momento), que pasa a ser el reabierto.
          if (last.date && near(last.date, e.date) && !last.closed) last.reopened = true;
          else steps.push({ group: last.group, date: e.date, by: '', reopened: true });
        }
        return;
      }
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
      groupEvents.set(e, group);
      if (last && last.group.toLowerCase() === group.toLowerCase()) { if (!last.by) last.by = by; return; } // mismo grupo
      // Reabierta justo antes de pasar a otro equipo: la reapertura pertenece al equipo nuevo.
      if (last && last.reopened && !last.closed && near(last.date, e.date) && !last.by) {
        last.group = group; last.by = by; last.date = e.date; return;
      }
      steps.push({ group, date: e.date, by });
    });
    return steps;
  }
  const teamSteps = teamPath();

  // Previsualización de un adjunto (imagen) que abre la vista a pantalla completa.
  function previewEl(i, size) {
    const a = attachments[i];
    const src = imgSrc(a);
    if (!src) return null;
    const b = el('button', 'preview ' + size);
    b.type = 'button';
    b.title = `Ver ${a.name} a pantalla completa`;
    const img = el('img'); img.alt = a.name; img.src = src; img.loading = 'lazy';
    const cap = el('span', 'cap'); cap.innerHTML = ICON.image; cap.append(a.name);
    b.append(img, cap);
    b.addEventListener('click', () => openModal(i));
    return b;
  }
  // Si un párrafo es solo la mención de una imagen (p. ej. "image002"), devuelve su índice.
  function soleMention(par) {
    const t = par.trim().toLowerCase();
    const hit = mentionList.find(m => m.s.toLowerCase() === t);
    return hit ? hit.i : -1;
  }

  // Pinta el Markdown sencillo del resumen (listas anidadas, **negritas**) sin usar HTML ajeno.
  function renderMiniMarkdown(target, md) {
    const inlineInto = (node, text) => {
      text.split(/(\*\*[^*]+\*\*)/).forEach(part => {
        if (/^\*\*[^*]+\*\*$/.test(part)) node.appendChild(el('strong', '', part.slice(2, -2)));
        else if (part) node.append(part);
      });
    };
    const stack = [{ depth: -1, node: target }];
    md.split('\n').forEach(line => {
      const m = line.match(/^(\s*)- (.*)$/);
      if (!m) {
        stack.length = 1;
        if (line.trim()) { const p = el('p'); inlineInto(p, line.trim()); target.appendChild(p); }
        return;
      }
      const depth = Math.floor(m[1].length / 2);
      while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
      let parent = stack[stack.length - 1];
      let ul;
      if (parent.depth === -1) {
        ul = target.lastElementChild && target.lastElementChild.tagName === 'UL' && stack.length === 1 && target.lastElementChild.dataset.root ? target.lastElementChild : null;
        if (!ul) { ul = el('ul'); ul.dataset.root = '1'; target.appendChild(ul); }
      } else {
        const li = parent.node;
        ul = li.lastElementChild && li.lastElementChild.tagName === 'UL' ? li.lastElementChild : li.appendChild(el('ul'));
      }
      const li = el('li');
      inlineInto(li, m[2]);
      ul.appendChild(li);
      stack.push({ depth, node: li });
    });
  }


  // ---------- tiempos ----------
  const DAY = 86400000, HOUR = 3600000, MIN = 60000;
  function fmtDur(ms, long) {
    if (ms < MIN) return long ? 'menos de 1 min' : '<1 min';
    const d = Math.floor(ms / DAY), hh = Math.floor((ms % DAY) / HOUR), mm = Math.floor((ms % HOUR) / MIN);
    if (long) {
      if (d) return `${d} ${d === 1 ? 'día' : 'días'}${hh ? ` y ${hh} h` : ''}`;
      if (hh) return `${hh} h${mm ? ` y ${mm} min` : ''}`;
      return `${mm} min`;
    }
    if (d) return `${d} d${hh ? ` ${hh} h` : ''}`;
    if (hh) return `${hh} h${mm ? ` ${mm} min` : ''}`;
    return `${mm} min`;
  }
  const dayMonth = s => { const m = (s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/); return m ? `${+m[1]} ${MON[+m[2] - 1]}, ${m[4].padStart(2, '0')}:${m[5]}` : s; };
  const longDay = s => { const m = (s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${+m[1]} de ${MONTHS[+m[2] - 1]}` : ''; };
  const isClosedStatus = st => /resuelt|cerrad|cancelad|completad/i.test(st || '');
  const closedNow = isClosedStatus(h.status);
  const R_STATUS = /estado marcado:?\s*["«“]?([^"»”\n]+?)["»”]?(?:\s+por\s|$)/im;
  const textOfEntry = e => [e.type, e.action, e.body].filter(Boolean).join('\n');
  const activity = data.activity || [];
  const startTs = toTs(h.created) || (activity[0] && toTs(activity[0].date)) || 0;
  // Fin: si está cerrada, el último cierre; si no, el momento de la exportación.
  let endTs = Date.parse(data.exportedAt) || Date.now();
  if (closedNow) {
    const lastClose = [...activity].reverse().find(e => { const m = R_STATUS.exec(textOfEntry(e)); return m && isClosedStatus(m[1]); });
    if (lastClose) endTs = toTs(lastClose.date) || endTs;
  }
  const GAP_MIN = 2 * HOUR; // un hueco de más de 2 h cuenta como tiempo sin actividad

  // ---------- colores por equipo ----------
  const teamKeys = [...new Set(teamSteps.map(s => s.group.toLowerCase()))];
  const teamColor = g => `var(--t${Math.max(0, teamKeys.indexOf((g || '').toLowerCase())) % 8})`;
  const stepAt = ts => { let s = null; for (const st of teamSteps) { if (toTs(st.date) <= ts) s = st; else break; } return s; };

  // ---------- cabecera: frase de resumen ----------
  (() => {
    const parts = [];
    const st = (h.status || '').trim();
    let first = st ? st.charAt(0).toUpperCase() + st.slice(1).toLowerCase() : '';
    const since = longDay(h.created);
    if (since) first += first ? (closedNow ? `, abierta el ${since}` : ` desde el ${since}`) : `Abierta el ${since}`;
    if (h.priority) first += `${first ? ', ' : ''}prioridad ${h.priority.toLowerCase()}`;
    if (first) parts.push(first + '.');
    if (teamSteps.length >= 2) {
      const n = teamKeys.length;
      const reopen = teamSteps.filter(s => s.reopened).length;
      const NUM = ['cero', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'];
      let s = `Ha pasado por ${NUM[n] || n} equipos`;
      if (reopen) s += ` y se reabrió ${reopen === 1 ? 'una vez' : `${NUM[reopen] || reopen} veces`}`;
      parts.push(s + '.');
    }
    $('lede').textContent = parts.join(' ');
  })();

  // ---------- metro ----------
  function rowSizes(n) {
    const rows = Math.max(1, Math.ceil(n / 7));
    const base = Math.floor(n / rows);
    const extra = n % rows;
    return Array.from({ length: rows }, (_, r) => base + (r < extra ? 1 : 0));
  }
  function renderMetro() {
    if (!teamSteps.length) return;
    $('metro-card').hidden = false;
    const box = $('metro');
    box.className = 'metro' + (Math.max(...rowSizes(teamSteps.length)) > 6 ? ' dense' : '');
    const durs = teamSteps.map((s, i) => (i < teamSteps.length - 1 ? toTs(teamSteps[i + 1].date) : endTs) - toTs(s.date));
    const longest = teamSteps.length > 1 ? durs.slice(0, -1).indexOf(Math.max(...durs.slice(0, -1))) : -1;
    const sizes = rowSizes(teamSteps.length);
    // Flecha de continuación (fuera de la vía): marca que la línea sigue en la fila siguiente.
    const arrow = cls => {
      const a = el('div', 'm-arrow ' + cls);
      a.innerHTML = '<svg viewBox="0 0 10 14" aria-hidden="true"><path d="M2 1.5L8 7L2 12.5"/></svg>';
      return a;
    };
    const durLabel = (k, left) => {
      const d = el('div', 'm-dur' + (k === longest ? ' long' : ''), fmtDur(Math.max(0, durs[k])));
      d.style.left = left;
      return d;
    };
    let i = 0;
    sizes.forEach((size, r) => {
      const row = el('div', 'metro-row');
      const hasIn = r > 0, hasOut = r < sizes.length - 1;
      const L = hasIn ? 9 : 7, R = hasOut ? 91 : 93;
      const pos = j => size === 1 ? 50 : L + j * ((R - L) / (size - 1));
      const start = i;
      for (let j = 0; j < size - 1; j++) {
        const first = j === 0, last = j === size - 2;
        const seg = el('div', 'm-seg' + (first ? ' first' : '') + (last ? ' last' : ''));
        seg.style.left = `calc(${pos(j)}% - ${first ? 6 : 0}px)`;
        seg.style.width = `calc(${pos(j + 1) - pos(j)}% + ${(first ? 6 : 0) + (last ? 6 : 0)}px)`;
        seg.style.background = teamColor(teamSteps[start + j].group);
        row.appendChild(seg);
        row.appendChild(durLabel(start + j, `${(pos(j) + pos(j + 1)) / 2}%`));
      }
      if (hasOut) {
        const a = arrow('out'); a.style.left = `calc(${pos(size - 1)}% + 22px)`;
        a.title = `Sigue en ${teamSteps[start + size].group} (${fmtDur(Math.max(0, durs[start + size - 1]), true)})`;
        row.appendChild(a);
      }
      if (hasIn) {
        const a = arrow('in'); a.style.left = `calc(${pos(0)}% - 32px)`;
        // El tiempo entre la última estación de la fila anterior y la primera de esta va en el tooltip.
        a.title = `Viene de ${teamSteps[start - 1].group} (${fmtDur(Math.max(0, durs[start - 1]), true)})`;
        row.appendChild(a);
      }
      for (let j = 0; j < size; j++, i++) {
        const s = teamSteps[i];
        const isNow = i === teamSteps.length - 1 && !closedNow;
        const st = el('div', 'm-st' + (isNow ? ' now' : ''));
        st.style.left = `${pos(j)}%`;
        // Ancho de la etiqueta según el hueco entre estaciones, para que los nombres no se toquen.
        const gap = size > 1 ? (R - L) / (size - 1) : 40;
        st.style.setProperty('--w', `min(200px, calc(${gap}% - 10px))`);
        st.appendChild(el('div', 'm-name', s.group));
        const dot = el('div', 'm-dot');
        if (s.closed || isNow) dot.style.background = teamColor(s.group);
        st.appendChild(dot);
        st.appendChild(el('div', 'm-date', dayMonth(s.date)));
        if (s.by) st.appendChild(el('div', 'm-by', s.by)).title = s.by;
        const tags = el('div', 'm-tags');
        if (s.reopened) tags.appendChild(el('span', 'm-tag', 'Reabierta'));
        if (s.closed) tags.appendChild(el('span', 'm-tag', /resuelt/i.test(s.closedAs) ? 'Resuelta aquí' : /cancel/i.test(s.closedAs) ? 'Cancelada aquí' : 'Cerrada aquí'));
        if (isNow) tags.appendChild(el('span', 'm-tag now', 'Está aquí'));
        if (tags.childNodes.length) st.appendChild(tags);
        row.appendChild(st);
      }
      box.appendChild(row);
    });
  }

  // ---------- conversación ----------
  const custNames = new Set((data.fields || []).filter(f => /^(cliente|contacto)$/i.test(f.label)).map(f => f.value.trim().toLowerCase()));
  const isCustomer = e => /cliente|client|customer/i.test(e.type || '') || custNames.has((e.author || '').trim().toLowerCase());

  function bubbleContent(target, text) {
    (text || '').trim().split(/\n{2,}/).forEach(par => {
      const i = soleMention(par);
      const pv = i >= 0 ? previewEl(i, 'lg') : null;
      if (pv) { const d = el('div'); d.appendChild(pv); target.appendChild(d); return; }
      const p = el('p'); richText(p, par.trim()); target.appendChild(p);
    });
  }

  function renderChat() {
    const withSystem = $('opt-system').checked;
    const chat = $('chat');
    chat.textContent = '';
    const add = node => { const li = el('li'); li.appendChild(node); chat.appendChild(li); };
    let prevTs = 0;
    const gapBefore = ts => {
      if (prevTs && ts && ts - prevTs >= GAP_MIN) {
        const g = el('div', 'gap'); g.appendChild(el('span', '', `${fmtDur(ts - prevTs, true)} sin actividad`)); add(g);
      }
      if (ts) prevTs = Math.max(prevTs, ts);
    };
    // La descripción es el primer mensaje del cliente.
    if ((data.description || '').trim()) {
      const ts = toTs(h.created);
      gapBefore(ts);
      const who = [...custNames][0] ? (data.fields || []).find(f => /^(cliente|contacto)$/i.test(f.label)).value : 'Cliente';
      const m = el('div', 'msg');
      const meta = el('div', 'msg-meta');
      meta.innerHTML = '';
      meta.append(Object.assign(el('strong', '', who)), `, descripción de la incidencia${h.created ? ', ' + dayMonth(h.created) : ''}`);
      const b = el('div', 'bubble');
      b.style.setProperty('--sh', 'var(--pink)');
      bubbleContent(b, data.description);
      m.append(meta, b);
      add(m);
    }
    let lastHandoff = '';
    activity.forEach(e => {
      const ts = toTs(e.date);
      const group = groupEvents.get(e);
      const st = R_STATUS.exec(textOfEntry(e));
      const hasFiles = (e.attachments || []).length > 0;
      if (group) {
        if (group.toLowerCase() === lastHandoff) return; // "Asignado a X" y "El grupo ha cambiado a X" son el mismo cambio
        lastHandoff = group.toLowerCase();
        gapBefore(ts);
        const hnd = el('div', 'handoff');
        const pill = el('span');
        const sw = el('span', 'swatch'); sw.style.setProperty('--c', teamColor(group));
        pill.append(sw, `Pasa a ${group}`);
        pill.title = [dayMonth(e.date), e.author && `por ${e.author}`].filter(Boolean).join(', ');
        hnd.appendChild(pill);
        add(hnd);
        return;
      }
      if (!e.isNote && !hasFiles) {
        if (!withSystem && !st) return;
        let txt;
        if (st) txt = isClosedStatus(st[1]) ? `Marcada como ${st[1].trim().toLowerCase()}` : `Estado: ${st[1].trim()}`;
        else txt = [e.type, e.action, e.body].filter(Boolean).join(' ') || '(evento)';
        if (!withSystem && st && !isClosedStatus(st[1])) {
          // Sin eventos automáticos solo se muestran cierres y reaperturas.
          const prev = activity.slice(0, activity.indexOf(e)).reverse().find(x => R_STATUS.exec(textOfEntry(x)));
          const prevSt = prev && R_STATUS.exec(textOfEntry(prev));
          if (!(prevSt && isClosedStatus(prevSt[1]))) return;
          txt = 'Reabierta';
        }
        gapBefore(ts);
        add(Object.assign(el('div', 'event', `${txt}, ${dayMonth(e.date)}`)));
        return;
      }
      gapBefore(ts);
      const cust = isCustomer(e);
      const step = stepAt(ts);
      const m = el('div', 'msg' + (cust ? '' : ' r'));
      const meta = el('div', 'msg-meta');
      meta.appendChild(el('strong', '', e.author || 'Sistema'));
      const role = cust ? 'cliente' : (step ? step.group : (e.type || ''));
      meta.append(`${role ? ', ' + role : ''}, ${dayMonth(e.date)}`);
      if (e.type && !cust) meta.title = e.type;
      if (e.access && !/p[uú]blic/i.test(e.access)) meta.appendChild(el('span', 'priv', e.access));
      const b = el('div', 'bubble');
      b.style.setProperty('--sh', cust ? 'var(--pink)' : (step ? teamColor(step.group) : 'var(--sky)'));
      if (e.type && !/agreg|nota/i.test(e.type)) b.appendChild(el('div', 'bubble-title', e.type));
      const generic = hasFiles && isGenericBody(e.body, e.attachments.map(x => x.name));
      if (e.body && !generic) bubbleContent(b, e.body);
      if (hasFiles) {
        const thumbs = el('div', 'thumbs');
        const files = el('div', 'file-chips');
        e.attachments.forEach(at => {
          const idx = attachments.findIndex(x => x.entry === e && x.slot === at.slot);
          const pv = idx >= 0 ? previewEl(idx, 'sm') : null;
          if (pv) { thumbs.appendChild(pv); return; }
          const chip = el('button', 'chip');
          chip.type = 'button';
          chip.innerHTML = ICON.clip;
          chip.append(at.name);
          chip.addEventListener('click', () => idx >= 0 && openModal(idx));
          files.appendChild(chip);
        });
        if (thumbs.childNodes.length) b.appendChild(thumbs);
        if (files.childNodes.length) b.appendChild(files);
      }
      m.append(meta, b);
      add(m);
    });
  }

  // ---------- lateral ----------
  function renderTime() {
    const total = Math.max(0, endTs - startTs);
    $('time-total').textContent = startTs ? fmtDur(total) : '—';
    // Tiempo sin actividad: suma de huecos de más de 2 h entre entradas.
    const stamps = [startTs, ...activity.map(e => toTs(e.date)), endTs].filter(Boolean).sort((a, b) => a - b);
    let idle = 0;
    for (let k = 1; k < stamps.length; k++) { const d = stamps[k] - stamps[k - 1]; if (d >= GAP_MIN) idle += d; }
    const note = $('time-note');
    note.textContent = '';
    note.append(closedNow ? 'hasta cerrarse, y ' : 'abierta, y ', el('strong', '', fmtDur(idle)), ' sin actividad');
    if (teamSteps.length) {
      const per = new Map();
      teamSteps.forEach((s, i) => {
        const d = Math.max(0, (i < teamSteps.length - 1 ? toTs(teamSteps[i + 1].date) : endTs) - toTs(s.date));
        per.set(s.group, (per.get(s.group) || 0) + d);
      });
      const sum = [...per.values()].reduce((a, b) => a + b, 0) || 1;
      const bar = $('time-bar');
      bar.hidden = false;
      bar.textContent = '';
      $('time-legend').textContent = '';
      per.forEach((d, g) => {
        const s = el('span'); s.style.setProperty('--c', teamColor(g)); s.style.width = `${(d / sum) * 100}%`; s.title = `${g}: ${fmtDur(d, true)}`;
        bar.appendChild(s);
        const row = el('div');
        const sw = el('span', 'sw'); sw.style.setProperty('--c', teamColor(g));
        row.append(sw, el('span', 'nm', g), el('span', 'du', fmtDur(d)));
        $('time-legend').appendChild(row);
      });
    }
  }

  function renderFiles() {
    if (!attachments.length) return;
    $('files-card').hidden = false;
    const failed = attachments.filter(a => a.error);
    if (failed.length) {
      $('att-notice').hidden = false;
      $('att-notice').textContent = `No se pudieron cargar ${failed.length} adjunto(s); se muestra la miniatura cuando existe.`;
    }
    const grid = $('files');
    attachments.forEach((a, i) => {
      const f = el('div', 'file');
      const pv = previewEl(i, 'sm');
      if (pv) f.appendChild(pv);
      else {
        const t = el('button', 'file-tile');
        t.type = 'button';
        t.innerHTML = ICON.file;
        t.append((a.name.split('.').pop() || '').toUpperCase().slice(0, 5));
        t.title = a.url ? `Abrir ${a.name}` : a.name;
        t.addEventListener('click', () => openModal(i));
        f.appendChild(t);
      }
      const info = el('button', 'info-btn', 'i');
      info.type = 'button';
      info.title = '¿De dónde sale este archivo?';
      info.setAttribute('aria-label', `Origen de ${a.name}`);
      info.addEventListener('click', ev => { ev.stopPropagation(); showOrigin(a, info); });
      f.appendChild(info);
      f.appendChild(el('div', 'file-name', a.name)).title = a.name;
      grid.appendChild(f);
    });
  }

  function renderFields() {
    const withFields = $('opt-fields').checked;
    const fields = data.fields || [];
    const isRes = f => /^nota de resoluci/i.test(f.label);
    const res = [...new Set(fields.filter(isRes).map(f => f.value.trim()))];
    $('res-card').hidden = !res.length;
    $('resolution').textContent = res.join('\n\n');
    const rest = fields.filter(f => !isRes(f));
    $('fields-card').hidden = !withFields || (!rest.length && $('source').hidden);
    const dl = $('fields');
    dl.textContent = '';
    rest.forEach(f => dl.append(el('dt', '', f.label), el('dd', '', f.value)));
  }

  function renderSummary() {
    const sm = data.summary;
    if (!sm || !sm.markdown) return;
    $('summary-card').hidden = false;
    $('summary-meta').textContent = ['Generado', sm.date && `el ${dayMonth(sm.date)}`, sm.by && `por ${sm.by}`].filter(Boolean).join(' ');
    renderMiniMarkdown($('summary'), sm.markdown);
  }

  let mode = 'view';
  function render() {
    renderChat();
    renderFields();
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
  renderMetro();
  renderSummary();
  renderTime();
  renderFiles();
  render();
  if (embedded) {
    // Avisa a SmartIT de que el visor ya está pintado (para mostrarlo con la animación).
    requestAnimationFrame(() => parent.postMessage({ sie: 'viewer-ready' }, '*'));
    // Esc vuelve a SmartIT, salvo que haya abierta una imagen a pantalla completa, el recuadro ⓘ o los ajustes.
    document.addEventListener('keydown', ev => {
      if (ev.key !== 'Escape') return;
      const modalOpen = !$('modal').hidden;
      const popOpen = !pop.hidden;
      const menuOpen = !$('settings-menu').hidden;
      if (!modalOpen && !popOpen && !menuOpen) parent.postMessage({ sie: 'viewer-close' }, '*');
    }, true);
  }

  // ---------- volver arriba ----------
  (() => {
    const btn = $('to-top');
    btn.hidden = false; // se muestra/oculta con la clase .show para poder animarlo
    // Referencia: la parte de arriba de la Ficha; si no está, la última tarjeta visible del lateral.
    const anchor = () => [$('fields-card'), $('res-card'), $('files-card'), $('time-card')].find(n => n && !n.hidden);
    let shown = false, ticking = false;
    const check = () => {
      ticking = false;
      const a = anchor();
      const show = a ? a.getBoundingClientRect().top < 0 : window.scrollY > 600;
      if (show !== shown) { shown = show; btn.classList.toggle('show', show); btn.tabIndex = show ? 0 : -1; }
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(check); } }, { passive: true });
    window.addEventListener('resize', check);
    btn.tabIndex = -1;
    btn.addEventListener('click', () => {
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      btn.classList.remove('go'); void btn.offsetWidth; btn.classList.add('go');
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    });
    check();
  })();

  let toastTimer;
  $('copy').onclick = async () => {
    await navigator.clipboard.writeText(buildText());
    const b = $('copy');
    b.classList.add('ok');
    $('copy-label').textContent = '¡Copiado!';
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      b.classList.remove('ok');
      $('copy-label').textContent = 'Copiar para el agente';
      $('toast').hidden = true;
    }, 1800);
  };

  // ---------- descargar .zip (markdown + adjuntos) ----------
  // ZIP sin compresión ("store"), suficiente para imágenes ya comprimidas y sin dependencias externas.
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  const crc32 = bytes => { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function makeZip(entries) {
    const enc = new TextEncoder();
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const parts = [], central = [];
    let offset = 0;
    for (const { name, data } of entries) {
      const nameBytes = enc.encode(name);
      const crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); // UTF-8
      local.setUint16(8, 0, true); local.setUint16(10, dosTime, true); local.setUint16(12, dosDate, true);
      local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
      local.setUint16(26, nameBytes.length, true); local.setUint16(28, 0, true);
      parts.push(new Uint8Array(local.buffer), nameBytes, data);
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true);
      cd.setUint16(10, 0, true); cd.setUint16(12, dosTime, true); cd.setUint16(14, dosDate, true);
      cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true);
      cd.setUint16(28, nameBytes.length, true); cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer), nameBytes);
      offset += 30 + nameBytes.length + data.length;
    }
    const cdSize = central.reduce((n, b) => n + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  }
  const dataUrlBytes = du => { const bin = atob(du.split(',')[1]); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; };
  const fileSafe = n => n.normalize('NFC').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'archivo';

  $('zip').onclick = async () => {
    const btn = $('zip');
    const label = $('zip-label');
    btn.disabled = true;
    label.textContent = 'Generando…';
    try {
      const id = fileSafe(h.number || 'incidencia');
      const files = new Map();
      const used = new Set();
      const entries = [];
      attachments.forEach((a, i) => {
        if (!a.dataUrl) return;
        let name = fileSafe(a.name);
        if (used.has(name.toLowerCase())) name = `${i + 1}_${name}`;
        used.add(name.toLowerCase());
        files.set(a, `adjuntos/${name}`);
        entries.push({ name: `${id}/adjuntos/${name}`, data: dataUrlBytes(a.dataUrl) });
      });
      entries.unshift({ name: `${id}/incidencia.md`, data: new TextEncoder().encode(buildText(files)) });
      const url = URL.createObjectURL(makeZip(entries));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${id}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      label.textContent = '¡Descargado!';
    } catch (err) {
      console.error('[SmartIT export]', err);
      label.textContent = 'Error al generar';
    } finally {
      setTimeout(() => { label.textContent = 'Descargar .zip'; btn.disabled = false; }, 1800);
    }
  };

  // ---------- aviso de versión nueva ----------
  chrome.runtime.sendMessage({ type: 'update-info' }).then(info => {
    if (!info || !info.available || info.dismissed) return;
    $('update-version').textContent = `Versión nueva disponible: ${info.remote}`;
    $('update-installed').textContent = `(tienes la ${info.installed})`;
    $('update-link').href = `${info.repo}#instalación`;
    $('update').hidden = false;
    $('update-close').onclick = () => {
      $('update').hidden = true;
      chrome.runtime.sendMessage({ type: 'update-dismiss', version: info.remote })
        .then(() => { if (window.top !== window) parent.postMessage({ sie: 'update-dismissed' }, '*'); });
    };
  }).catch(() => {});

  // ---------- ajustes: tema claro / oscuro / sistema ----------
  const mq = matchMedia('(prefers-color-scheme: dark)');
  let themePref = 'light';
  function applyTheme() {
    const dark = themePref === 'dark' || (themePref === 'system' && mq.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.querySelectorAll('[data-theme-pref]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themePref === themePref)));
    try { localStorage.setItem('sie-theme', themePref); } catch (_) {}
  }
  chrome.storage.local.get('theme').then(r => { themePref = r.theme || 'light'; applyTheme(); }).catch(() => applyTheme());
  mq.addEventListener('change', () => { if (themePref === 'system') applyTheme(); });
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.theme) { themePref = changes.theme.newValue || 'light'; applyTheme(); }
    });
  } catch (_) {}
  document.querySelectorAll('[data-theme-pref]').forEach(b => b.addEventListener('click', () => {
    themePref = b.dataset.themePref;
    applyTheme();
    chrome.storage.local.set({ theme: themePref });
  }));
  // ---------- ajustes: estilo Tarjetas / Clásico ----------
  let stylePref = 'cards';
  function applyStyle() {
    if (stylePref === 'classic') document.documentElement.dataset.style = 'classic';
    else delete document.documentElement.dataset.style;
    document.querySelectorAll('[data-style-pref]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.stylePref === stylePref)));
    try { localStorage.setItem('sie-style', stylePref); } catch (_) {}
  }
  chrome.storage.local.get('style').then(r => { stylePref = r.style === 'classic' ? 'classic' : 'cards'; applyStyle(); }).catch(() => applyStyle());
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.style) { stylePref = changes.style.newValue === 'classic' ? 'classic' : 'cards'; applyStyle(); }
    });
  } catch (_) {}
  document.querySelectorAll('[data-style-pref]').forEach(b => b.addEventListener('click', () => {
    stylePref = b.dataset.stylePref;
    applyStyle();
    chrome.storage.local.set({ style: stylePref });
  }));

  const settingsBtn = $('settings-btn');
  const settingsMenu = $('settings-menu');
  const setMenu = open => { settingsMenu.hidden = !open; settingsBtn.setAttribute('aria-expanded', String(open)); };
  settingsBtn.addEventListener('click', ev => { ev.stopPropagation(); setMenu(settingsMenu.hidden); });
  document.addEventListener('click', ev => { if (!settingsMenu.hidden && !ev.target.closest('.settings')) setMenu(false); });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !settingsMenu.hidden) setMenu(false); }, true);
})();
