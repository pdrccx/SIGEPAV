'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  // Token is the last path segment: /seguimiento-publico/TOKEN
  const parts = window.location.pathname.split('/');
  const token = parts[parts.length - 1];

  if (!token || token === 'seguimiento-publico') {
    showError(); return;
  }

  try {
    const res  = await fetch(`/api/public/seguimiento/${encodeURIComponent(token)}`);
    const data = await res.json();

    if (!res.ok || !data.ok) { showError(); return; }

    renderTracking(data);
  } catch (err) {
    console.error('[seguimiento] error:', err);
    showError();
  } finally {
    document.getElementById('loadingState').classList.add('hidden');
  }
});

function renderTracking(data) {
  const { reporte, viaje, vehiculo } = data;
  const esInteres = data.tipo === 'interes';

  document.getElementById('trackingContent').classList.remove('hidden');
  document.getElementById('trackingTitle').textContent = esInteres ? 'Consulta de Comisión Finalizada' : 'Reporte Ciudadano';
  document.getElementById('tokenDisplay').textContent = 'Token: ' + reporte.token_seguimiento;

  // Vehicle summary
  if (vehiculo) {
    document.getElementById('vehicleSummary').innerHTML = `
      <div class="trip-field">
        <label>Vehículo</label>
        <span>${esc(vehiculo.marca)} ${esc(vehiculo.linea)}</span>
      </div>
      <div class="trip-field">
        <label>Placas</label>
        <span>${esc(vehiculo.placas)}</span>
      </div>
      <div class="trip-field">
        <label>${esInteres ? 'Tipo de solicitud' : 'Motivo del reporte'}</label>
        <span>${esc(reporte.motivo)}</span>
      </div>
      <div class="trip-field">
        <label>${esInteres ? 'Fecha de solicitud' : 'Fecha del reporte'}</label>
        <span>${formatDate(reporte.created_at)}</span>
      </div>
    `;
  }

  // Timeline
  const statusMap = {
    nuevo:        { icon: '📬', label: 'Reporte recibido',    active: true },
    en_revision:  { icon: '🔍', label: 'En revisión',         active: true },
    resuelto:     { icon: '✅', label: 'Resuelto',             done: true  },
    descartado:   { icon: '❌', label: 'Descartado',           done: true  }
  };

  const steps = ['nuevo','en_revision','resuelto'];
  const currentIdx = steps.indexOf(reporte.estatus);

  const timelineHTML = steps.map((s, i) => {
    const dotClass = i < currentIdx ? 'done' : (i === currentIdx ? 'active' : '');
    const info = statusMap[s];
    return `
      <div class="timeline-step">
        <div class="step-dot ${dotClass}">${info.icon}</div>
        <div class="step-body">
          <label>${info.label}</label>
          <p>${i <= currentIdx ? (i === 0 ? formatDate(reporte.created_at) : 'Completado') : 'Pendiente'}</p>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('timeline').innerHTML = timelineHTML;

  // Resolution
  if (reporte.estatus === 'resuelto' || reporte.estatus === 'descartado') {
    const box = document.getElementById('resolutionBox');
    box.classList.remove('hidden');
    const baseResolucion = reporte.estatus === 'resuelto'
      ? 'El reporte fue atendido. La comisión ha sido revisada por la administración del Instituto.'
      : 'El reporte fue descartado. No se encontraron irregularidades relacionadas.';
    document.getElementById('resolutionText').textContent = reporte.comentario_admin
      ? `${baseResolucion}

Comentario del administrador: ${reporte.comentario_admin}`
      : baseResolucion;
  }

  // Finalized trip details
  if (viaje && viaje.estado === 'Finalizado') {
    document.getElementById('tripDetails').classList.remove('hidden');
    document.getElementById('tripDetailsCard').innerHTML = `
      <div class="trip-grid report-meta">
        <div class="trip-field">
          <label>Responsable</label>
          <span>${esc(viaje.responsable || '—')}</span>
        </div>
        <div class="trip-field">
          <label>Destino</label>
          <span>${esc(viaje.lugar_destino || '—')}</span>
        </div>
        <div class="trip-field">
          <label>Motivo</label>
          <span>${esc(viaje.motivo || '—')}</span>
        </div>
        <div class="trip-field">
          <label>Inicio</label>
          <span>${formatDate(viaje.fecha_inicio)}</span>
        </div>
        <div class="trip-field">
          <label>Fin</label>
          <span>${formatDate(viaje.fecha_fin)}</span>
        </div>
        <div class="trip-field">
          <label>Estado</label>
          <span style="color:#15803d;font-weight:700">✅ Finalizado</span>
        </div>
        <div class="trip-field">
          <label>Kilómetros recorridos</label>
          <span>${formatKm(viaje.km_recorridos)}</span>
        </div>
      </div>
      ${viaje.descripcion
        ? `<div class="obs-block" style="margin-top:14px"><strong>Resumen:</strong> ${esc(viaje.descripcion)}</div>`
        : ''}
      ${viaje.actividades ? renderActividadesPub(viaje.actividades) : ''}
      ${viaje.observaciones
        ? `<div class="obs-block" style="margin-top:10px"><strong>Observaciones finales:</strong> ${esc(viaje.observaciones)}</div>`
        : ''}
    `;
  }
}

function renderActividadesPub(texto) {
  const lineas = String(texto).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!lineas.length) return '';
  return `<div class="obs-block" style="margin-top:10px">
    <strong>Actividades realizadas:</strong>
    <ul style="margin:6px 0 0 18px;padding:0">${lineas.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
  </div>`;
}

function showError() {
  document.getElementById('loadingState').classList.add('hidden');
  document.getElementById('errorState').classList.remove('hidden');
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  return isNaN(d) ? str : d.toLocaleDateString('es-MX', {day:'2-digit',month:'short',year:'numeric'});
}

function formatKm(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${Math.max(0, Math.round(n)).toLocaleString('es-MX')} km`;
}
