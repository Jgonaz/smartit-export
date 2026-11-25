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
  // Etiquetas de la incidencia (ver «etiquetas» más abajo).
  const tagState = { tags: [], loaded: false, known: [] };
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
  // files (opcional): Map adjunto -> ruta relativa dentro de la carpeta guardada; si existe, se enlaza cada adjunto.
  function buildText(files) {
    const withSystem = $('opt-system').checked;
    const withFields = true; // los datos de la ficha van siempre
    const L = [];
    L.push(`# ${[h.number, h.summary].filter(Boolean).join(' — ')}`);
    if (data.sourceUrl) L.push(`URL: ${data.sourceUrl}`);
    [['Estado', h.status], ['Prioridad', h.priority], ['Fecha de creación', h.created],
      ['Última modificación', h.modified]].forEach(([k, v]) => v && L.push(`${k}: ${v}`));
    if (tagState.tags.length) L.push(`Etiquetas: ${tagState.tags.join(', ')}`);
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
      // Si no hay más mensajes, la descripción ocupa todo el ancho (no tiene sentido como chat).
      const alone = !activity.some(e => !groupEvents.has(e) && (e.isNote || (e.attachments || []).length));
      const m = el('div', 'msg' + (alone ? ' full' : ''));
      m.appendChild(el('div', 'msg-meta', 'Descripción de la incidencia'));
      const b = el('div', 'bubble');
      b.style.setProperty('--sh', 'var(--pink)');
      b.appendChild(el('div', 'bubble-title', who));
      bubbleContent(b, data.description);
      if (h.created) b.appendChild(el('div', 'bubble-date', dayMonth(h.created)));
      m.append(b);
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
      // Encima: tipo de comentario · equipo. Dentro: quién lo escribe, el mensaje y la fecha abajo a la derecha.
      const meta = el('div', 'msg-meta');
      const kind = e.type && !/^(agregado|nota)$/i.test(e.type.trim()) ? e.type.trim() : (cust ? 'Comunicación del cliente' : 'Nota');
      const team = cust ? '' : (step ? step.group : '');
      meta.appendChild(el('span', '', kind));
      if (e.access && !/p[uú]blic/i.test(e.access)) meta.appendChild(el('span', 'priv', e.access));
      const b = el('div', 'bubble');
      b.style.setProperty('--sh', cust ? 'var(--pink)' : (step ? teamColor(step.group) : 'var(--sky)'));
      // Equipo en negrita y después la persona («Run The Business · Jorge González»); el cliente, solo su nombre.
      const who = el('div', 'bubble-title', team || e.author || 'Sistema');
      if (team) who.appendChild(el('span', 'bubble-person', ` · ${e.author || 'Sistema'}`));
      b.appendChild(who);
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
      if (e.date) b.appendChild(el('div', 'bubble-date', dayMonth(e.date)));
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
    const withFields = true; // los datos de la ficha van siempre
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

  $('copy').onclick = async () => {
    await navigator.clipboard.writeText(buildText());
    const b = $('copy');
    morphButton(b, $('copy-label'), '¡Copiado!', 'ok');
    toast('Markdown copiado al portapapeles');
    clearTimeout(b._resetT);
    b._resetT = setTimeout(() => morphButton(b, $('copy-label'), 'Copiar para el agente'), 1800);
  };


  // ---------- etiquetas ----------
  // Se guardan con la incidencia (clasificacion.md) al pulsar «Guardar». Mientras, se recuerdan aquí.
  // loaded: ya se leyeron las guardadas en la carpeta, así que la lista del visor manda al guardar.
  const tagKey = 'tags_' + (h.number || key);
  // Color pastel fijo por etiqueta (el mismo en todas las incidencias): se elige con un hash del nombre.
  const TAG_COLORS = ['#F7C6D9', '#FBD3C0', '#FDE7A9', '#D6EDB5', '#BFE6D6', '#BFE0F2', '#CFD5FA', '#DCCDF6', '#F3CDEB', '#E6DCCB'];
  // Cada etiqueta nueva recibe el primer color libre; cuando ya se han usado todos, el menos usado.
  // La asignación se recuerda (tagColors), así una etiqueta tiene siempre el mismo color.
  const tagColorMap = {};
  let tagColorsLoaded = false;
  const tagColorsReady = chrome.storage.local.get('tagColors')
    .then(r => { Object.assign(tagColorMap, r.tagColors || {}); }).catch(() => {})
    .finally(() => { tagColorsLoaded = true; });
  let tagColorSaveT;
  function tagColor(t) {
    if (!tagColorsLoaded) return 'var(--card)'; // un instante, hasta leer los colores ya asignados
    if (!(t in tagColorMap)) {
      const used = new Array(TAG_COLORS.length).fill(0);
      Object.values(tagColorMap).forEach(i => { if (used[i] != null) used[i]++; });
      const min = Math.min(...used);
      tagColorMap[t] = used.indexOf(min);
      clearTimeout(tagColorSaveT);
      tagColorSaveT = setTimeout(() => chrome.storage.local.set({ tagColors: tagColorMap }).catch(() => {}), 200);
    }
    return TAG_COLORS[tagColorMap[t] % TAG_COLORS.length];
  }
  function renderTags() {
    const list = $('tag-list');
    list.textContent = '';
    tagState.tags.forEach(t => {
      const chip = el('span', 'tag', t);
      chip.style.setProperty('--tc', tagColor(t));
      const x = el('button', '', '×');
      x.type = 'button';
      x.title = `Quitar «${t}»`;
      x.setAttribute('aria-label', `Quitar la etiqueta ${t}`);
      x.onclick = () => { setTags(tagState.tags.filter(y => y !== t)); $('tag-input').focus(); };
      chip.appendChild(x);
      list.appendChild(chip);
    });
    const opts = $('tag-options');
    opts.textContent = '';
    tagState.known.filter(t => !tagState.tags.includes(t)).forEach(t => { const o = el('option'); o.value = t; opts.appendChild(o); });
    $('md').textContent = buildText();
  }
  // Debajo de los botones: cuándo se guardó por última vez, o que hay cambios sin guardar.
  const saveState = { savedAt: '', dirty: false };
  function renderSaveStatus() {
    const st = $('save-status');
    st.classList.toggle('dirty', saveState.dirty);
    $('save').classList.toggle('has-dot', saveState.dirty);
    if (saveState.dirty) { st.textContent = 'Etiquetas sin guardar · pulsa Guardar'; st.hidden = false; }
    else if (saveState.savedAt) { st.textContent = saveState.savedAt === '?' ? 'Guardada en tu carpeta' : `Guardada el ${dayMonth(saveState.savedAt)}`; st.hidden = false; }
    else st.hidden = true;
  }
  function setTags(tags, { silent } = {}) {
    tagState.tags = [...new Set(tags.map(SieCarpeta.normTag).filter(Boolean))];
    renderTags();
    refreshRelated({ flash: !silent });
    if (!silent) {
      chrome.storage.local.set({ [tagKey]: tagState.tags });
      saveState.dirty = true;
      renderSaveStatus();
    }
  }
  const addFromInput = () => {
    const v = $('tag-input').value;
    if (!v.trim()) return;
    setTags([...tagState.tags, ...v.split(',')]);
    $('tag-input').value = '';
  };
  $('tag-input').addEventListener('keydown', ev => {
    if (ev.key === 'Enter' || ev.key === ',') { ev.preventDefault(); addFromInput(); }
    else if (ev.key === 'Backspace' && !ev.target.value && tagState.tags.length) setTags(tagState.tags.slice(0, -1));
  });
  // Elegir una sugerencia de la lista la añade directamente.
  $('tag-input').addEventListener('input', ev => { if (tagState.known.includes(ev.target.value) && ev.inputType !== 'insertText') addFromInput(); });
  $('tag-input').addEventListener('blur', addFromInput);
  (async () => {
    try { const c = await chrome.storage.local.get(tagKey); if (Array.isArray(c[tagKey])) setTags(c[tagKey], { silent: true }); } catch (_) {}
    try {
      const r = await chrome.runtime.sendMessage({ type: 'tags-info', folder: fileSafe(h.number || 'incidencia') });
      if (r && r.ok) {
        tagState.known = r.known || [];
        if (r.current) setTags(r.current, { silent: true }); // lo guardado en la carpeta manda
        tagState.loaded = true;
        if (r.savedAt) { saveState.savedAt = r.savedAt; renderSaveStatus(); }
        renderTags();
      }
    } catch (_) { /* sin carpeta: se suman al guardar */ }
  })();
  renderTags();
  tagColorsReady.then(renderTags); // con los colores ya asignados antes
  refreshRelated();

  // ---------- incidencias relacionadas (fase 3) ----------
  // Se calculan con el índice de la carpeta; se recalculan al cambiar las etiquetas y al guardar.
  // Devuelve una promesa con el número de relacionadas (se usa en el aviso de «Guardar»).
  // flash: resalta la tarjeta si los resultados han cambiado (al guardar o al tocar etiquetas).
  var relatedT, relatedWaiters, relatedSig; // var: refreshRelated() se puede llamar antes de llegar a esta línea
  function refreshRelated({ flash } = {}) {
    clearTimeout(relatedT);
    const p = new Promise(res => (relatedWaiters = relatedWaiters || []).push(res));
    relatedT = setTimeout(async () => {
      const waiters = relatedWaiters || []; relatedWaiters = [];
      const done = n => waiters.forEach(w => w(n));
      let r;
      try { r = await chrome.runtime.sendMessage({ type: 'related', current: { folder: fileSafe(h.number || 'incidencia'), frontmatter: frontmatter(), tags: tagState.tags } }); } catch (_) { return done(0); }
      const card = $('related-card'), list = $('related');
      list.textContent = '';
      card.hidden = false;
      card.classList.remove('expanded');
      $('related-more').hidden = true;
      $('related-note').hidden = true;
      const sig = r && r.ok ? (r.items || []).map(x => x.incidencia).join(',') : '';
      if (flash && relatedSig != null && sig && sig !== relatedSig) { card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash'); }
      relatedSig = sig;
      // Sin resultados se explica por qué, para que se sepa dónde aparecerán.
      const empty = text => { const li = el('li', 'rel-empty', text); list.appendChild(li); };
      if (!r || !r.ok) {
        if (r && r.reason === 'permission') empty('Falta el permiso de la carpeta: pulsa «Guardar» para darlo y aquí aparecerán las incidencias parecidas.');
        else empty('Aparecerán aquí cuando guardes incidencias con «Guardar»: se buscan entre las de tu carpeta.');
        return done(0);
      }
      if (!r.items || !r.items.length) {
        empty(r.total > 1
          ? `Ninguna parecida entre las ${r.total} incidencias guardadas. Añade etiquetas para encontrarlas mejor.`
          : 'Todavía no hay otras incidencias guardadas en tu carpeta.');
        return done(0);
      }
      r.items.forEach((it, idx) => {
        const li = el('li', idx >= 3 ? 'extra' : '');
        const head = el('div', 'rel-head');
        const num = el('span', 'rel-num');
        if (it.url) { const a = el('a', 'u', it.incidencia); a.href = it.url; a.target = '_blank'; a.rel = 'noopener'; a.title = 'Abrir en SmartIT'; num.appendChild(a); }
        else num.textContent = it.incidencia;
        head.appendChild(num);
        if (it.estado) head.appendChild(el('span', 'rel-state' + (isClosedStatus(it.estado) ? ' done' : ''), it.estado));
        li.appendChild(head);
        li.appendChild(el('div', 'rel-title', it.titulo || '(sin título)'));
        if (it.shared.length) {
          const tg = el('div', 'rel-tags');
          it.shared.forEach(t => { const c = el('span', 'tag', t); c.style.setProperty('--tc', tagColor(t)); tg.appendChild(c); });
          li.appendChild(tg);
        }
        if (it.reasons.length) li.appendChild(el('div', 'rel-why', it.reasons.join(' · ').replace(/^./, m => m.toUpperCase())));
        const sol = [it.causa && ['Causa', it.causa], it.solucion && ['Solución', it.solucion]].filter(Boolean);
        if (sol.length) {
          const p = el('div', 'rel-sol');
          sol.forEach(([k, v], i) => { if (i) p.append(' '); p.append(el('strong', '', k + ': '), v); });
          li.appendChild(p);
          requestAnimationFrame(() => {
            if (p.scrollHeight > p.clientHeight + 2) {
              const more = el('button', 'rel-more', 'Ver más');
              more.type = 'button';
              more.onclick = () => { const o = p.classList.toggle('open'); more.textContent = o ? 'Ver menos' : 'Ver más'; };
              li.appendChild(more);
            }
          });
        } else if (it.equipo) li.appendChild(el('div', 'rel-why', `Equipo: ${it.equipo}. Sin solución anotada todavía.`));
        if (it.documentacion_url) { const a = el('a', 'rel-more rel-conf', 'Ver documentación'); a.href = it.documentacion_url; a.target = '_blank'; a.rel = 'noopener'; li.appendChild(a); }
        list.appendChild(li);
      });
      // Solo las 3 más parecidas a la vista; el resto, al pulsar «Ver N más» (con scroll propio).
      const extra = r.items.length - 3;
      if (extra > 0) {
        const more = $('related-more');
        more.hidden = false;
        more.textContent = `Ver ${extra} más`;
        more.onclick = () => { const o = card.classList.toggle('expanded'); more.textContent = o ? 'Ver menos' : `Ver ${extra} más`; };
      }
      if (r.more > 0) { $('related-note').hidden = false; $('related-note').textContent = `Hay ${r.more} parecidas más: el agente puede buscarlas en indice.md.`; }
      done(r.items.length);
    }, 250);
    return p;
  }

  // ---------- guardar en la carpeta elegida (markdown + adjuntos) ----------
  const fileSafe = n => n.normalize('NFC').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'archivo';
  function filesToSave() {
    const folder = fileSafe(h.number || 'incidencia');
    const paths = new Map();
    const used = new Set();
    const files = [];
    attachments.forEach((a, i) => {
      if (!a.dataUrl) return;
      let name = fileSafe(a.name);
      if (used.has(name.toLowerCase())) name = `${i + 1}_${name}`;
      used.add(name.toLowerCase());
      paths.set(a, `adjuntos/${name}`);
      files.push({ path: `adjuntos/${name}`, dataUrl: a.dataUrl });
    });
    files.unshift({ path: 'incidencia.md', text: buildText(paths) });
    return { folder, files, meta: { frontmatter: frontmatter(), tags: tagState.tags, tagsLoaded: tagState.loaded } };
  }

  const nowStamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  // Datos de la incidencia para el bloque inicial de incidencia.md (y el índice de la carpeta).
  function frontmatter() {
    const f = re => { const x = (data.fields || []).find(y => re.test(y.label)); return x ? x.value.trim() : ''; };
    const last = teamSteps[teamSteps.length - 1];
    const resolver = [...teamSteps].reverse().find(s => s.closed);
    return {
      incidencia: h.number || '', titulo: h.summary || '', estado: h.status || '', prioridad: h.priority || '',
      servicio: f(/^servicio$/i), activo: f(/^activo afectado/i),
      categoria_operacional: f(/^categor[ií]a operacional/i), categoria_producto: f(/^categor[ií]a de producto$/i),
      categoria_resolucion: f(/^categor[ií]a de resoluci[oó]n$/i),
      equipo_actual: (last && last.group) || f(/^grupo de soporte/i),
      equipo_resolutor: closedNow && resolver ? resolver.group : '',
      equipos: [...new Set(teamSteps.map(s => s.group))],
      reaperturas: String(teamSteps.filter(s => s.reopened).length || 0),
      abierta: h.created || '', tiempo_total: startTs ? fmtDur(Math.max(0, endTs - startTs)) : '',
      resolucion: f(/^nota de resoluci/i), url: data.sourceUrl || '', guardada: nowStamp()
    };
  }

  let toastTimer;
  function toast(text, { action, onAction, error, ms = 2200 } = {}) {
    $('toast-text').textContent = text;
    $('toast').classList.toggle('err', !!error);
    $('toast-ico-path').setAttribute('d', error ? 'M12 7v6M12 17v.5' : 'M5 12.5l4.5 4.5L19 7.5');
    const btn = $('toast-action');
    btn.hidden = !action;
    btn.textContent = action || '';
    btn.onclick = onAction ? async () => { await onAction(); } : null;
    const t = $('toast');
    clearTimeout(toastTimer);
    // Se vuelve a lanzar la animación de entrada en cada aviso.
    t.classList.remove('out'); t.hidden = true; void t.offsetWidth; t.hidden = false;
    toastTimer = setTimeout(() => {
      t.classList.add('out');
      toastTimer = setTimeout(() => { t.hidden = true; t.classList.remove('out'); }, 220);
    }, action ? Math.max(ms, 9000) : ms);
  }

  async function promptFor(r) {
    const { agentPath = '', promptTemplate = '' } = await chrome.storage.local.get(['agentPath', 'promptTemplate']);
    return SieCarpeta.prompt({ agentPath, folderName: r.folderName, folder: r.folder, number: h.number, summary: h.summary, template: promptTemplate });
  }
  // Copia el prompt; si el navegador no lo permite (la ventana no tiene el foco), ofrece un botón.
  const PASTE = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘V' : 'Ctrl+V';
  // Tras guardar, las etiquetas del visor ya son las de la carpeta (incluidas las que añadió el agente).
  function afterSave(r) {
    tagState.loaded = true;
    if (Array.isArray(r.tags)) { tagState.tags = [...new Set(r.tags)]; renderTags(); }
    chrome.storage.local.set({ [tagKey]: tagState.tags });
    saveState.dirty = false;
    saveState.savedAt = nowStamp();
    renderSaveStatus();
    return refreshRelated({ flash: true }); // el índice ya está al día: se buscan las relacionadas
  }
  async function copyPrompt(r, savedText) {
    const nRel = await Promise.race([afterSave(r), new Promise(res => setTimeout(() => res(0), 1500))]);
    const relLine = nRel ? `\n${nRel === 1 ? '1 incidencia relacionada' : nRel + ' incidencias relacionadas'} en el lateral.` : '';
    const text = await promptFor(r);
    try {
      await navigator.clipboard.writeText(text);
      toast(`${savedText}\nPrompt listo para pegar en el agente (${PASTE}).${relLine}`, { ms: relLine ? 6000 : 4500 });
    } catch (_) {
      toast(savedText + relLine, { action: 'Copiar prompt', onAction: async () => {
        await navigator.clipboard.writeText(text);
        toast(`Prompt listo para pegar en el agente (${PASTE}).`);
      } });
    }
  }

  // ---------- transición suave de los botones (texto, ancho e icono) ----------
  const BTN_ICON = {
    busy: '<circle cx="12" cy="12" r="8" stroke-opacity=".25"/><path d="M12 4a8 8 0 0 1 8 8"/>',
    ok: '<path class="draw" d="M5 12.5l4.5 4.5L19 7.5"/>',
    err: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.5"/>'
  };
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function morphButton(btn, label, text, state) {
    const ico = btn.querySelector('svg.ico');
    if (!btn.dataset.icon) btn.dataset.icon = ico.innerHTML;
    const from = btn.getBoundingClientRect().width;
    label.textContent = text;
    ico.innerHTML = state ? BTN_ICON[state] : btn.dataset.icon;
    ico.classList.toggle('spin', state === 'busy');
    btn.classList.toggle('ok', state === 'ok');
    btn.classList.toggle('bad', state === 'err');
    if (reduceMotion()) return;
    // FLIP del ancho: del tamaño anterior al nuevo, sin saltos.
    btn.style.width = 'auto';
    const to = btn.getBoundingClientRect().width;
    btn.style.width = from + 'px';
    void btn.offsetWidth;
    btn.style.transition = 'width .28s cubic-bezier(.2,.8,.2,1), transform .12s ease, box-shadow .2s ease, background-color .2s ease';
    btn.style.width = to + 'px';
    clearTimeout(btn._morphT);
    btn._morphT = setTimeout(() => { btn.style.width = ''; btn.style.transition = ''; }, 320);
    label.classList.remove('swap-in'); ico.classList.remove('swap-in');
    void label.offsetWidth;
    label.classList.add('swap-in'); ico.classList.add('swap-in');
  }

  let pendingToken = null, saveResetT;
  const saveLabel = (t, reset, state) => {
    clearTimeout(saveResetT);
    morphButton($('save'), $('save-label'), t, state);
    if (reset) saveResetT = setTimeout(() => { morphButton($('save'), $('save-label'), 'Guardar'); $('save').disabled = false; }, 2200);
  };
  $('save').onclick = async () => {
    const btn = $('save');
    btn.disabled = true;
    saveLabel('Guardando…', false, 'busy');
    try {
      const { folder, files, meta } = filesToSave();
      const r = await chrome.runtime.sendMessage({ type: 'save-files', folder, files, meta });
      if (r && r.ok) {
        saveLabel('Guardado', true, 'ok');
        await copyPrompt(r, `Guardado en ${r.folderName}/${r.folder}.`);
        refreshFolder();
        return;
      }
      if (r && (r.reason === 'no-folder' || r.reason === 'permission')) {
        // Primera vez (o permiso caducado): se elige la carpeta en una ventanita y allí se termina de guardar.
        pendingToken = crypto.randomUUID();
        await chrome.storage.local.set({ pendingSave: { token: pendingToken, folder, files, meta } });
        await chrome.runtime.sendMessage({ type: 'open-options', save: true, reason: r.reason });
        saveLabel(r.reason === 'no-folder' ? 'Elige la carpeta…' : 'Da permiso…', false, 'busy');
        return;
      }
      throw new Error((r && r.error) || 'sin respuesta');
    } catch (err) {
      console.error('[SmartIT export]', err);
      saveLabel('Error al guardar', true, 'err');
      toast('No se pudo guardar: ' + (err.message || err), { error: true, ms: 5000 });
    }
  };
  // Resultado del guardado terminado en la ventana de ajustes.
  try {
    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (area !== 'local' || !changes.lastSave || !pendingToken) return;
      const r = changes.lastSave.newValue;
      if (!r || r.token !== pendingToken) return;
      pendingToken = null;
      if (r.ok) { saveLabel('Guardado', true, 'ok'); await copyPrompt(r, `Guardado en ${r.folderName}/${r.folder}.`); }
      else { saveLabel('Error al guardar', true, 'err'); toast('No se pudo guardar: ' + r.error, { error: true, ms: 5000 }); }
      refreshFolder();
    });
  } catch (_) {}
  // Si se cierra la ventana sin elegir carpeta, el botón vuelve a su estado al recuperar el foco.
  window.addEventListener('focus', () => {
    if (pendingToken && $('save').disabled) setTimeout(async () => {
      const { pendingSave } = await chrome.storage.local.get('pendingSave');
      if (pendingToken && pendingSave && pendingSave.token === pendingToken) saveLabel('Guardar', true);
    }, 600);
  });

  async function refreshFolder() {
    // Se pregunta al documento oculto: el visor incrustado en SmartIT puede no ver la misma base de datos.
    try {
      const r = await chrome.runtime.sendMessage({ type: 'folder-status' });
      $('settings-folder').textContent = !r || !r.name ? 'Sin elegir' : r.name + (r.status === 'granted' ? '' : ' (sin permiso)');
    } catch (_) { $('settings-folder').textContent = 'Sin elegir'; }
  }
  refreshFolder();
  $('settings-folder-btn').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'open-options' }));

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
