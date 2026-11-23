(async () => {
  'use strict';
  const $ = id => document.getElementById(id);
  const key = location.hash.slice(1);
  const store = await chrome.storage.local.get(key);
  const data = store[key];
  if (!data) {
    $('title').textContent = 'No hay datos para mostrar';
    $('subtitle').textContent = 'Vuelve a pulsar "Exportar incidencia" en SmartIT.';
    return;
  }

  const h = data.header || {};
  document.title = `${h.number || 'Incidencia'} – ${h.summary || ''}`;
  $('title').textContent = [h.number, h.summary].filter(Boolean).join(' — ');
  $('subtitle').textContent = [h.status && `Estado: ${h.status}`, h.priority && `Prioridad: ${h.priority}`,
    h.created && `Creada: ${h.created}`].filter(Boolean).join(' · ');
  if (data.sourceUrl) { $('source').href = data.sourceUrl; $('source').textContent = 'Abrir en SmartIT ↗'; }
  $('activity-status').textContent = data.activityStatus
    ? `Actividad leída: ${data.activity.length} entradas (${data.activityStatus})` : '';

  // ---------- adjuntos ----------
  const IMG_EXT = /\.(png|jpe?g|gif|bmp|webp|svg)$/i;
  const attachments = [];
  (data.activity || []).forEach(e => (e.attachments || []).forEach(a =>
    attachments.push({ ...a, date: e.date, author: e.author, entry: e })));
  $('att-count').textContent = attachments.length;
  $('att-empty').hidden = attachments.length > 0;
  document.querySelector('.carousel-wrap').hidden = attachments.length === 0;

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
    pop.innerHTML = '<dl></dl><div class="pop-body"></div>';
    const dl = pop.querySelector('dl');
    rows.forEach(([k, v]) => {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      dl.append(dt, dd);
    });
    const body = (e.body || '').trim();
    const pb = pop.querySelector('.pop-body');
    if (body) pb.textContent = body.length > 600 ? body.slice(0, 600) + '…' : body; else pb.remove();
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

  attachments.forEach((a, i) => {
    const b = document.createElement('div');
    b.className = 'thumb';
    b.setAttribute('role', 'button');
    b.tabIndex = 0;
    const src = imgSrc(a);
    const ext = (a.name.split('.').pop() || '?').toUpperCase().slice(0, 5);
    b.innerHTML = `<div class="img">${src ? '<img alt="">' : `<span class="ext"></span>`}</div>
      <div class="meta"><div class="name"></div><div class="sub"></div></div>`;
    if (src) b.querySelector('img').src = src; else b.querySelector('.ext').textContent = ext;
    b.querySelector('.name').textContent = a.name;
    b.querySelector('.sub').textContent = `${a.date} · ${a.author}${a.error ? ' · ⚠️ solo miniatura' : ''}`;
    const info = document.createElement('button');
    info.className = 'info-btn';
    info.type = 'button';
    info.title = '¿De dónde sale este archivo?';
    info.setAttribute('aria-label', 'Ver origen del archivo');
    info.textContent = 'i';
    info.addEventListener('click', ev => { ev.stopPropagation(); showOrigin(a, info); });
    b.appendChild(info);
    b.addEventListener('click', () => openModal(i));
    b.addEventListener('keydown', ev => { if (ev.key === 'Enter') openModal(i); });
    carousel.appendChild(b);
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
      attachments.forEach(a => L.push(`- ${a.name} (${a.date}, ${a.author})`));
    }
    return L.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }
  const render = () => { $('text').value = buildText(); };
  $('opt-system').onchange = render;
  $('opt-fields').onchange = render;
  render();

  $('copy').onclick = async () => {
    await navigator.clipboard.writeText($('text').value);
    const b = $('copy');
    b.textContent = '¡Copiado!'; b.classList.add('ok');
    setTimeout(() => { b.textContent = 'Copiar'; b.classList.remove('ok'); }, 1500);
  };
})();
