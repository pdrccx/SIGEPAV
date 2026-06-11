'use strict';

/* ============================================================
   GUARDIA: solo Administradores acceden a esta pestaña
   ============================================================ */
(function guardiaAdmin() {
  const S = window.SIGEPAV;
  const sesion = S && S.getSession ? S.getSession() : null;
  if (!sesion) { window.location.href = 'index.html'; return; }
  // rol_id: 1 = Administrador. Tu sesión guarda rol en .rol o .rol_id según el caso.
  const rol = sesion.rol_id ?? sesion.rol ?? sesion.role;
  if (rol !== 1 && rol !== '1' && rol !== 'Administrador') {
    alert('Acceso restringido: esta sección es solo para administradores.');
    window.location.href = 'dashboard.html';
    return;
  }
})();

/* ============================================================
   NAVBAR: ahora se renderiza desde navbar.js (menú unificado)
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  // Email del usuario
  const S = window.SIGEPAV;
  const emailEl = document.getElementById('user-email-display');
  if (emailEl && S && S.getSession) {
    emailEl.textContent = (S.getSession() || {}).email || 'Usuario';
  }

  // Logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.onclick = () => {
    if (S && S.clearSession) S.clearSession();
    window.location.href = 'index.html';
  };

  // Poblar selector de vehículos
  poblarVehiculos();

  const reporteURL = parseInt(new URLSearchParams(window.location.search).get('reporte_id') || '0', 10);
  if (reporteURL) {
    const filtroEstatus = document.getElementById('f-estatus');
    if (filtroEstatus) filtroEstatus.value = '';
    ESTADO.porPagina = 100;
  }

  // Carga inicial
  cargarKPIs();
  cargarReportes(1).then(() => abrirReporteDesdeURL());

  // SSE: escuchar nuevos reportes en tiempo real
  iniciarSSE();
});

/* ============================================================
   ESTADO GLOBAL
   ============================================================ */
const ESTADO = { pagina: 1, porPagina: 10, totalPaginas: 1 };

/* ============================================================
   HELPERS
   ============================================================ */
function toast(msg, tipo) {
  const S = window.SIGEPAV;
  if (S && S.toast) { S.toast(msg, tipo); return; }
  const el = document.getElementById('toast');
  if (!el) return alert(msg);
  el.textContent = msg;
  el.className = 'toast toast-visible' + (tipo ? ' toast-' + tipo : '');
  setTimeout(() => el.classList.remove('toast-visible'), 2600);
}

function fmtFechaHora(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const now = new Date();
  const diff = (now - d) / 1000; // segundos
  if (diff < 60)        return 'hace un momento';
  if (diff < 3600)      return `hace ${Math.floor(diff/60)} min`;
  if (diff < 86400)     return `hace ${Math.floor(diff/3600)} h`;
  if (diff < 86400 * 7) return `hace ${Math.floor(diff/86400)} días`;
  return d.toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' });
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function leerFiltros() {
  return {
    estatus:  document.getElementById('f-estatus').value,
    vehiculo: document.getElementById('f-vehiculo').value,
    motivo:   document.getElementById('f-motivo').value,
    desde:    document.getElementById('f-desde').value,
    hasta:    document.getElementById('f-hasta').value,
  };
}

/* ============================================================
   POBLAR SELECTOR DE VEHÍCULOS
   ============================================================ */
async function poblarVehiculos() {
  const sel = document.getElementById('f-vehiculo');
  if (!sel) return;
  try {
    const r = await fetch('/api/vehiculos');
    if (!r.ok) return;
    const lista = await r.json();
    (lista.vehiculos || lista || []).forEach(v => {
      const label = [v.no_economico, v.marca, v.linea, v.placas]
        .filter(Boolean).join(' · ');
      sel.add(new Option(label, v.id));
    });
  } catch (err) {
    console.warn('No se pudieron cargar vehículos:', err);
  }
}

/* ============================================================
   KPIs
   ============================================================ */
async function cargarKPIs() {
  try {
    const r = await fetch('/api/reportes-ciudadanos/stats');
    if (!r.ok) throw new Error('Error ' + r.status);
    const data = await r.json();
    const s = data.stats || data;
    document.getElementById('kpi-nuevos').textContent      = s.nuevo        || 0;
    document.getElementById('kpi-revision').textContent    = s.en_revision  || 0;
    document.getElementById('kpi-resueltos').textContent   = s.resuelto     || 0;
    document.getElementById('kpi-descartados').textContent = s.descartado   || 0;
  } catch (err) {
    console.error('Error cargando KPIs:', err);
  }
}

/* ============================================================
   LISTAR REPORTES
   ============================================================ */
async function cargarReportes(pagina = 1) {
  ESTADO.pagina = pagina;
  const cont = document.getElementById('rep-lista');
  cont.innerHTML = `
    <div class="estado-vacio">
      <i class="fas fa-spinner fa-spin"></i>
      <p>Cargando reportes…</p>
    </div>`;

  try {
    const f = leerFiltros();
    const p = new URLSearchParams();
    if (f.estatus)  p.set('estatus',  f.estatus);
    if (f.vehiculo) p.set('vehiculo', f.vehiculo);
    if (f.motivo)   p.set('motivo',   f.motivo);
    if (f.desde)    p.set('desde',    f.desde);
    if (f.hasta)    p.set('hasta',    f.hasta);
    p.set('pagina',     pagina);
    p.set('por_pagina', ESTADO.porPagina);

    const r = await fetch('/api/reportes-ciudadanos?' + p.toString());
    if (!r.ok) throw new Error('Error ' + r.status);
    const data = await r.json();
    const lista = data.reportes || data || [];
    const total = data.total ?? lista.length;
    ESTADO.totalPaginas = Math.max(1, Math.ceil(total / ESTADO.porPagina));

    if (lista.length === 0) {
      cont.innerHTML = `
        <div class="estado-vacio">
          <i class="fas fa-inbox"></i>
          <p>No hay reportes que coincidan con los filtros.</p>
        </div>`;
      document.getElementById('rep-paginacion').style.display = 'none';
      return;
    }

    cont.innerHTML = lista.map(renderReporte).join('');
    renderPaginacion(total);

  } catch (err) {
    console.error(err);
    cont.innerHTML = `
      <div class="estado-vacio">
        <i class="fas fa-exclamation-triangle" style="color:#dc2626;"></i>
        <p>Error al cargar reportes: ${escapeHtml(err.message)}</p>
      </div>`;
  }
}

function renderReporte(r) {
  const est = r.estatus || 'nuevo';
  const vehiculo = r.vehiculo_label
    || [r.no_economico, r.marca, r.linea, r.placas].filter(Boolean).join(' · ')
    || (r.vehiculo_id ? `Vehículo #${r.vehiculo_id}` : 'Sin vehículo asociado');
  const viaje = r.viaje_id ? `Comisión #${r.viaje_id}` : 'Sin comisión asociada';
  const ciudadano = r.nombre_ciudadano || 'Anónimo';
  const correo = r.correo_ciudadano || '—';

  // Las acciones cambian según el estatus, pero "Ver detalle" siempre está.
  const accionesEdicion = (est === 'resuelto' || est === 'descartado')
    ? ''
    : `
       ${est === 'nuevo' ? `
         <button class="btn-mini btn-revisar" onclick="cambiarEstatus(${r.id}, 'en_revision')">
           <i class="fas fa-hourglass-half"></i> Marcar en revisión
         </button>` : ''}
       <button class="btn-mini btn-resolver" onclick="cambiarEstatus(${r.id}, 'resuelto')">
         <i class="fas fa-check"></i> Resolver
       </button>
       <button class="btn-mini btn-descartar" onclick="cambiarEstatus(${r.id}, 'descartado')">
         <i class="fas fa-times"></i> Descartar
       </button>`;

  const accionesHtml = `
       <button class="btn-mini btn-ver" onclick="toggleDetalle(${r.id})">
         <i class="fas fa-info-circle"></i> <span id="lbl-detalle-${r.id}">Ver detalle</span>
       </button>
       ${accionesEdicion}`;

  const resolucionHtml = r.comentario_admin
    ? `<div class="rep-resolucion">
         <i class="fas fa-comment-dots"></i> Resolución: ${escapeHtml(r.comentario_admin)}
       </div>`
    : '';

  // Panel de detalle (oculto por default). Se llena al hacer click.
  const detalleHtml = `<div class="rep-detalle" id="detalle-${r.id}" style="display:none"></div>`;

  const reporteURL = parseInt(new URLSearchParams(window.location.search).get('reporte_id') || '0', 10);
  const resaltado = reporteURL && Number(r.id) === reporteURL;
  return `
    <article class="rep-card estatus-${est}" data-id="${r.id}" ${resaltado ? 'style="outline:2px solid #006dc8;box-shadow:0 0 0 4px rgba(0,109,200,.12);"' : ''}>
      <div class="rep-card-body">
        <div class="rep-head">
          <span class="badge-estatus badge-${est}">${labelEstatus(est)}</span>
          <span class="rep-motivo">${escapeHtml(r.motivo || 'Sin motivo')}</span>
          <span class="rep-fecha">
            <i class="far fa-clock"></i> ${fmtFechaHora(r.created_at)}
          </span>
        </div>
        <div class="rep-meta">
          <span><i class="fas fa-car"></i><strong>${escapeHtml(vehiculo)}</strong></span>
          <span><i class="fas fa-user"></i>${escapeHtml(ciudadano)} (${escapeHtml(correo)})</span>
          <span><i class="fas fa-route"></i>${viaje}</span>
        </div>
        ${r.descripcion ? `<div class="rep-desc">"${escapeHtml(r.descripcion)}"</div>` : ''}
        <div class="rep-acciones">${accionesHtml}</div>
        ${resolucionHtml}
        ${detalleHtml}
      </div>
    </article>`;
}

function labelEstatus(e) {
  return ({
    nuevo: 'Nuevo',
    en_revision: 'En revisión',
    resuelto: 'Resuelto',
    descartado: 'Descartado'
  })[e] || e;
}

/* ============================================================
   PAGINACIÓN
   ============================================================ */
function renderPaginacion(total) {
  const pag = document.getElementById('rep-paginacion');
  const info = document.getElementById('rep-info-total');
  const cajas = document.getElementById('rep-paginas');
  const ini = (ESTADO.pagina - 1) * ESTADO.porPagina + 1;
  const fin = Math.min(ESTADO.pagina * ESTADO.porPagina, total);
  info.textContent = `Mostrando ${ini}-${fin} de ${total} reportes`;

  const btn = (txt, p, disabled, activo) =>
    `<button onclick="cargarReportes(${p})" ${disabled?'disabled':''} class="${activo?'activo':''}">${txt}</button>`;

  let html = btn('<i class="fas fa-chevron-left"></i>', ESTADO.pagina - 1, ESTADO.pagina <= 1, false);
  for (let i = 1; i <= ESTADO.totalPaginas; i++) {
    if (i === 1 || i === ESTADO.totalPaginas || Math.abs(i - ESTADO.pagina) <= 1) {
      html += btn(i, i, false, i === ESTADO.pagina);
    } else if (Math.abs(i - ESTADO.pagina) === 2) {
      html += '<span style="padding:4px 6px;">…</span>';
    }
  }
  html += btn('<i class="fas fa-chevron-right"></i>', ESTADO.pagina + 1, ESTADO.pagina >= ESTADO.totalPaginas, false);

  cajas.innerHTML = html;
  pag.style.display = 'flex';
}

/* ============================================================
   ACCIONES (cambiar estatus, ver evidencia, etc.)
   ============================================================ */
let REPORTE_RESOLUCION_PENDIENTE = null;

async function cambiarEstatus(id, nuevoEstatus) {
  if (nuevoEstatus === 'resuelto' || nuevoEstatus === 'descartado') {
    abrirModalResolucion(id, nuevoEstatus);
    return;
  }

  await enviarCambioEstatus(id, nuevoEstatus, '');
}

function abrirModalResolucion(id, nuevoEstatus) {
  REPORTE_RESOLUCION_PENDIENTE = { id, estatus: nuevoEstatus };

  const modal = document.getElementById('modal-resolucion');
  const titulo = document.getElementById('modal-resolucion-titulo');
  const label = document.getElementById('lbl-resolucion-admin');
  const textarea = document.getElementById('txt-resolucion-admin');
  const error = document.getElementById('err-resolucion-admin');
  const btn = document.getElementById('btn-guardar-resolucion');

  const esResuelto = nuevoEstatus === 'resuelto';
  titulo.textContent = esResuelto ? `Resolver reporte #${id}` : `Descartar reporte #${id}`;
  label.textContent = esResuelto ? 'Comentario de resolución' : 'Motivo de descarte';
  textarea.value = '';
  textarea.placeholder = esResuelto
    ? 'Ejemplo: Se revisó la comisión, se validó la evidencia y se atendió la situación reportada...'
    : 'Ejemplo: Se revisó la evidencia y no se encontraron irregularidades relacionadas...';
  error.style.display = 'none';
  btn.textContent = esResuelto ? 'Guardar resolución' : 'Guardar descarte';
  btn.classList.toggle('descartar', !esResuelto);

  modal.classList.add('abierto');
  setTimeout(() => textarea.focus(), 50);
}

function cerrarModalResolucion() {
  const modal = document.getElementById('modal-resolucion');
  if (modal) modal.classList.remove('abierto');
  REPORTE_RESOLUCION_PENDIENTE = null;
}

async function confirmarResolucionReporte() {
  if (!REPORTE_RESOLUCION_PENDIENTE) return;

  const textarea = document.getElementById('txt-resolucion-admin');
  const error = document.getElementById('err-resolucion-admin');
  const comentario = textarea.value.trim();

  if (!comentario) {
    error.style.display = 'block';
    textarea.focus();
    return;
  }

  const { id, estatus } = REPORTE_RESOLUCION_PENDIENTE;
  await enviarCambioEstatus(id, estatus, comentario);
}

async function enviarCambioEstatus(id, nuevoEstatus, comentario) {
  try {
    const r = await fetch(`/api/reportes-ciudadanos/${id}/estatus`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estatus: nuevoEstatus, comentario })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.ok === false) throw new Error(data.error || ('Error ' + r.status));

    cerrarModalResolucion();
    toast('Reporte actualizado', 'ok');
    cargarKPIs();
    cargarReportes(ESTADO.pagina);
  } catch (err) {
    toast('Error al actualizar: ' + err.message, 'error');
  }
}

function abrirEvidencia(url) {
  const modal = document.getElementById('modal-evid');
  const img = document.getElementById('modal-evid-img');
  img.src = url;
  modal.classList.add('abierto');
}
function cerrarEvidencia() {
  document.getElementById('modal-evid').classList.remove('abierto');
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { cerrarEvidencia(); cerrarModalResolucion(); }
});

async function toggleDetalle(id) {
  const panel = document.getElementById(`detalle-${id}`);
  const lbl   = document.getElementById(`lbl-detalle-${id}`);
  if (!panel) return;

  // Si ya está abierto, cerrar
  if (panel.style.display === 'block') {
    panel.style.display = 'none';
    if (lbl) lbl.textContent = 'Ver detalle';
    return;
  }

  // Loading inline
  panel.style.display = 'block';
  panel.innerHTML = '<div style="padding:14px;color:#64748b"><i class="fas fa-spinner fa-spin"></i> Cargando detalle...</div>';
  if (lbl) lbl.textContent = 'Ocultar detalle';

  try {
    const r = await fetch(`/api/reportes-ciudadanos/${id}`);
    if (!r.ok) throw new Error('Error ' + r.status);
    const data = await r.json();
    const rep = data.reporte || data;

    // ── Construir el panel ──────────────────────────────────────────────
    const evidenciaBlock = rep.evidencia_url
      ? `<div class="det-bloque">
           <label>Evidencia adjunta</label>
           <a href="/${rep.evidencia_url}" target="_blank" rel="noopener">
             <img src="/${rep.evidencia_url}" alt="Evidencia"
                  style="max-width:100%;max-height:260px;border-radius:8px;border:1px solid var(--color-borde);cursor:zoom-in"
                  onerror="this.outerHTML='<p style=\\'color:#94a3b8;font-size:.85rem\\'>No se pudo cargar la imagen. Puede ser un archivo no visualizable. <a href=&quot;/${rep.evidencia_url}&quot; target=&quot;_blank&quot;>Descargar</a>.</p>'">
           </a>
         </div>`
      : `<div class="det-bloque">
           <label>Evidencia adjunta</label>
           <p style="color:#94a3b8;font-size:.85rem;margin:0">El ciudadano no adjuntó evidencia.</p>
         </div>`;

    // Si la comisión está finalizada, mostramos observaciones + actividades de la comisión
    let comisionBlock = '';
    if (rep.viaje_id && rep.viaje_estado === 'Finalizado') {
      // Pedimos los datos de la comisión finalizada (público es suficiente)
      try {
        // No tenemos un endpoint admin de "ver comisión". Usamos los campos
        // que ya vienen en el reporte si los tenemos, si no lo dejamos vacío.
        // (Más adelante podemos agregar /api/viajes/:id para admin.)
        comisionBlock = `
          <div class="det-bloque">
            <label>Comisión asociada</label>
            <p style="margin:0;font-size:.85rem;color:#64748b">
              Comisión #${rep.viaje_id} — ${escapeHtml(rep.lugar_destino || 'sin destino')}<br>
              <strong style="color:#16a34a">✓ Finalizada</strong>
            </p>
          </div>`;
      } catch (_) {}
    }

    panel.innerHTML = `
      <div class="det-grid">
        <div class="det-bloque">
          <label>ID reporte</label>
          <p style="margin:0;font-weight:600">#${rep.id}</p>
        </div>
        <div class="det-bloque">
          <label>Fecha de registro</label>
          <p style="margin:0">${new Date(rep.created_at).toLocaleString('es-MX')}</p>
        </div>
        <div class="det-bloque">
          <label>Estatus actual</label>
          <p style="margin:0">${labelEstatus(rep.estatus)}</p>
        </div>
        <div class="det-bloque">
          <label>Ciudadano</label>
          <p style="margin:0">${escapeHtml(rep.nombre_ciudadano || 'Anónimo')}<br>
            <small style="color:#64748b">${escapeHtml(rep.correo_ciudadano || '—')}</small></p>
        </div>
        <div class="det-bloque det-doble">
          <label>Descripción del reporte</label>
          <p style="margin:0;white-space:pre-wrap">${escapeHtml(rep.descripcion || '(sin descripción)')}</p>
        </div>
        ${evidenciaBlock}
        ${comisionBlock}
        ${rep.comentario_admin ? `
          <div class="det-bloque det-doble">
            <label>Comentario del administrador</label>
            <p style="margin:0;white-space:pre-wrap">${escapeHtml(rep.comentario_admin)}</p>
          </div>` : ''}
      </div>
    `;
  } catch (err) {
    panel.innerHTML = `<div style="padding:14px;color:#c94545">
      <i class="fas fa-exclamation-triangle"></i> Error al cargar el detalle: ${err.message}
    </div>`;
  }
}

function abrirReporteDesdeURL() {
  const id = parseInt(new URLSearchParams(window.location.search).get('reporte_id') || '0', 10);
  if (!id) return;
  const card = document.querySelector(`.rep-card[data-id="${id}"]`);
  if (!card) {
    toast(`Reporte #${id} no apareció en la lista actual. Revisa filtros o paginación.`, 'info');
    return;
  }
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const detalle = document.getElementById(`detalle-${id}`);
  if (detalle && detalle.style.display !== 'block') toggleDetalle(id);
}

/* ============================================================
   EXPORTAR A CSV
   ============================================================ */
async function exportarCSV() {
  try {
    const f = leerFiltros();
    const p = new URLSearchParams();
    if (f.estatus)  p.set('estatus',  f.estatus);
    if (f.vehiculo) p.set('vehiculo', f.vehiculo);
    if (f.motivo)   p.set('motivo',   f.motivo);
    if (f.desde)    p.set('desde',    f.desde);
    if (f.hasta)    p.set('hasta',    f.hasta);
    p.set('por_pagina', 1000);

    const r = await fetch('/api/reportes-ciudadanos?' + p.toString());
    const data = await r.json();
    const lista = data.reportes || data;
    if (!lista.length) { toast('No hay datos para exportar', 'info'); return; }

    const headers = ['ID','Fecha','Estatus','Motivo','Ciudadano','Correo','Vehículo','Placas','Comisión','Descripción','Resolución'];
    const filas = lista.map(r => [
      r.id,
      new Date(r.created_at).toLocaleString('es-MX'),
      labelEstatus(r.estatus),
      r.motivo || '',
      r.nombre_ciudadano || 'Anónimo',
      r.correo_ciudadano || '',
      [r.no_economico, r.marca, r.linea].filter(Boolean).join(' '),
      r.placas || '',
      r.viaje_id || '',
      (r.descripcion || '').replace(/\n/g,' '),
      r.comentario_admin || ''
    ]);
    const csv = [headers, ...filas]
      .map(row => row.map(c => `"${String(c).replace(/"/g,'""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reportes-ciudadanos-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('CSV descargado', 'ok');
  } catch (err) {
    toast('Error al exportar: ' + err.message, 'error');
  }
}

/* ============================================================
   SSE — Notificación en tiempo real de nuevos reportes
   ============================================================ */
function iniciarSSE() {
  const S = window.SIGEPAV;
  const sesion = S && S.getSession ? S.getSession() : null;
  const uid = sesion && sesion.id;
  if (!uid) return;

  try {
    const es = new EventSource(`/api/notificaciones/stream/${uid}`);
    es.addEventListener('nueva', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.tipo === 'reporte_ciudadano') {
          toast('🚨 ' + (data.titulo || 'Nuevo reporte ciudadano'), 'info');
          // Refrescar la vista para que aparezca arriba
          cargarKPIs();
          cargarReportes(1);
        }
      } catch (_) {}
    });
    es.onerror = () => { /* reconecta solo */ };
  } catch (err) {
    console.warn('SSE no disponible:', err);
  }
}
