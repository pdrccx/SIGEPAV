// =====================================================================
//  SIGEPAV — ciudadano.js
//  Public-facing JavaScript for the citizen transparency page.
//  No auth required.
// =====================================================================

'use strict';

// ── State ─────────────────────────────────────────────────────────────
let vehiculoData   = null;
let viajesData     = { activo: null, finalizados: [] };
let timerInterval  = null;
let reportContext  = null;   // { viaje_id, vehiculo_id }
let selectedFile   = null;   // Blob capturado desde cámara
let cameraStream   = null;

// ── Bootstrap ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const token  = params.get('token');

  if (token) {
    // Modo: vehículo específico (escaneó QR)
    const lt = document.getElementById('loadingText');
    if (lt) lt.textContent = 'Consultando información del vehículo…';
    loadVehiculo(token);
  } else {
    // Modo: directorio público (entró sin token)
    const lt = document.getElementById('loadingText');
    if (lt) lt.textContent = 'Cargando directorio público de comisiones…';
    loadDirectorio();
  }
});

// ── Headers comunes para fetch ─────────────────────────────────────────
// ngrok-skip-browser-warning evita que ngrok intercepte las peticiones API
// Cache-Control:no-cache evita que el navegador devuelva respuestas viejas.
const FETCH_HEADERS = {
  'Accept': 'application/json',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'ngrok-skip-browser-warning': '1'
};

// Cache buster: añade _=timestamp a las URLs
function nocache() { return `_=${Date.now()}`; }

// ── Data loading ───────────────────────────────────────────────────────
async function loadVehiculo(token) {
  showLoading(true);

  try {
    const [vRes, tRes] = await Promise.all([
      fetch(`/api/public/vehiculo/${encodeURIComponent(token)}?${nocache()}`, { headers: FETCH_HEADERS }),
      fetch(`/api/public/viajes/${encodeURIComponent(token)}?${nocache()}`,   { headers: FETCH_HEADERS })
    ]);

    let vData;
    try {
      vData = await vRes.json();
    } catch(e) {
      showError('El servidor no respondió correctamente. Verifica que el servidor esté corriendo.');
      return;
    }

    if (!vRes.ok || !vData.ok) {
      showError(vData?.error || 'Vehículo no encontrado en el sistema.');
      return;
    }

    vehiculoData = vData.vehiculo;

    try {
      if (tRes.ok) {
        const tData = await tRes.json();
        if (tData.ok) {
          viajesData.activo      = tData.activo      || null;
          viajesData.finalizados = tData.finalizados || [];
        }
      }
    } catch(e) {
      // Si falla cargar viajes, igual mostramos el vehículo
      console.warn('[ciudadano] Error cargando viajes:', e);
    }

    renderPage();
  } catch (err) {
    console.error('[ciudadano] loadVehiculo error:', err);
    showError('Error de red. Verifica tu conexión e intenta de nuevo.');
  } finally {
    showLoading(false);
  }
}

// ── Render ─────────────────────────────────────────────────────────────
function renderPage() {
  document.getElementById('vehicleSection').classList.remove('hidden');

  // --- Vehicle card ---
  const v = vehiculoData;
  document.getElementById('vehicleName').textContent   = `${v.marca} ${v.linea}`;
  document.getElementById('vehiclePlates').textContent = v.placas || '—';
  document.getElementById('vehicleMeta').textContent   =
    [v.modelo, v.tipo ? capFirst(v.tipo) : null, v.color]
      .filter(Boolean).join(' · ');

  const ring = document.getElementById('statusRing');
  const pill = document.getElementById('statusPill');

  if (viajesData.activo) {
    ring.classList.add('active');
    pill.classList.add('active');
    pill.textContent = '🟡 En comisión';
    renderActiveTrip(viajesData.activo);
  } else if (viajesData.finalizados.length) {
    ring.classList.add('done');
    pill.classList.add('done');
    pill.textContent = '🟢 Finalizado';
  } else {
    document.getElementById('noTripsSection').classList.remove('hidden');
  }

  if (viajesData.finalizados.length) {
    renderFinishedTrips(viajesData.finalizados);
  }

  // --- QR image ---
  if (v.qr_image_path) {
    document.getElementById('qrImage').src = '/' + v.qr_image_path;
  } else {
    document.getElementById('qrImageWrap').innerHTML =
      '<span style="color:#94a3b8;font-size:.78rem;text-align:center">QR no generado aún</span>';
  }
}

function renderActiveTrip(trip) {
  document.getElementById('activeTripSection').classList.remove('hidden');

  const card = document.getElementById('activeTripCard');

  // Mientras la comisión está EN CURSO no se expone fecha, destino, motivo,
  // responsable, kilometraje ni hora. La vista ciudadana solo confirma el
  // estado actual. La información completa se libera cuando finaliza.
  card.innerHTML = `
    <div class="active-only-status">
      <div class="active-only-icon">🟡</div>
      <div>
        <h3>Este vehículo está en comisión</h3>
        <p>La información pública completa estará disponible cuando la comisión finalice.</p>
      </div>
    </div>
    <div class="privacy-notice">
      <span class="privacy-icon">🔒</span>
      <p><strong>Información restringida durante la comisión.</strong>
         Por seguridad y protección de datos, no se muestran detalles de la comisión en curso.</p>
    </div>
  `;

  // No se muestra temporizador, fecha ni hora exacta en la vista ciudadana.
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  reportContext = { viaje_id: trip.id, vehiculo_id: vehiculoData.id };
  document.getElementById('btnReportActive').style.display = 'flex';
}

function renderFinishedTrips(trips) {
  document.getElementById('finishedTripsSection').classList.remove('hidden');
  const list = document.getElementById('finishedTripsList');

  list.innerHTML = trips.slice(0, 10).map(t => {
    const ini = t.fecha_inicio ? formatDateTime(t.fecha_inicio) : '—';
    const iniHora = t.fecha_inicio ? formatTime(t.fecha_inicio) : '—';
    const fin = t.fecha_fin    ? formatDateTime(t.fecha_fin)    : '—';

    return `
      <div class="finished-trip info-card green-card">
        <span class="finished-badge">✅ Finalizado</span>
        <h4>📍 ${esc(t.lugar_destino || 'Sin destino')}
            ${t.estado_dst ? '&nbsp;— ' + esc(t.estado_dst) : ''}</h4>
        <div class="trip-grid">
          <div class="trip-field">
            <label>Responsable</label>
            <span>${esc(t.responsable || '—')}</span>
          </div>
          <div class="trip-field">
            <label>Motivo</label>
            <span>${esc(t.motivo || '—')}</span>
          </div>
          <div class="trip-field">
            <label>Inicio</label>
            <span>${ini}</span>
          </div>
          <div class="trip-field">
            <label>Hora de inicio</label>
            <span>${iniHora}</span>
          </div>
          <div class="trip-field">
            <label>Fin</label>
            <span>${fin}</span>
          </div>
          <div class="trip-field">
            <label>Kilómetros recorridos</label>
            <span>${formatKm(t.km_recorridos)}</span>
          </div>
        </div>
        ${t.descripcion
          ? `<div class="obs-block"><strong>Resumen:</strong> ${esc(t.descripcion)}</div>`
          : ''}
        ${t.actividades ? renderActividades(t.actividades) : ''}
        ${t.observaciones
          ? `<div class="obs-block"><strong>Observaciones finales:</strong> ${esc(t.observaciones)}</div>`
          : ''}
        <button class="btn-report" onclick="openReportForTrip(${Number(t.id)}, ${Number(vehiculoData.id)})">🚨 Denunciar esta comisión</button>
      </div>
    `;
  }).join('');
}

// Convierte el texto multilinea de actividades en una lista <ul>
function renderActividades(texto) {
  const lineas = String(texto).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!lineas.length) return '';
  return `<div class="obs-block">
    <strong>Actividades realizadas:</strong>
    <ul style="margin:6px 0 0 18px;padding:0;font-size:13.5px;line-height:1.55">
      ${lineas.map(l => `<li>${esc(l)}</li>`).join('')}
    </ul>
  </div>`;
}

// ── Report form ────────────────────────────────────────────────────────
function openReport(context) {
  if (context === 'active' && viajesData.activo) {
    reportContext = { viaje_id: viajesData.activo.id, vehiculo_id: vehiculoData?.id || viajesData.activo.vehiculo_id || null };
  } else if (!reportContext && vehiculoData) {
    reportContext = { viaje_id: null, vehiculo_id: vehiculoData.id };
  }
  document.getElementById('reportSection').classList.remove('hidden');
  document.getElementById('reportSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  clearReportForm();
}

function openReportForTrip(viajeId, vehiculoId) {
  reportContext = { viaje_id: viajeId || null, vehiculo_id: vehiculoId || vehiculoData?.id || null };
  document.getElementById('reportSection').classList.remove('hidden');
  document.getElementById('reportSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  clearReportForm();
}

function closeReport() {
  document.getElementById('reportSection').classList.add('hidden');
  clearReportForm();
}

// ── Interest form: notify citizen when active commission ends ─────────
function hideInterestAlerts() {
  const err = document.getElementById('interestError');
  const ok  = document.getElementById('interestSuccess');
  if (err) { err.classList.add('hidden'); err.textContent = ''; }
  if (ok)  { ok.classList.add('hidden'); ok.textContent = ''; }
}

function showInterestError(msg) {
  const el = document.getElementById('interestError');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

async function submitInterest() {
  hideInterestAlerts();

  const correo = document.getElementById('iCorreo')?.value.trim() || '';
  const nombre = document.getElementById('iNombre')?.value.trim() || '';

  if (!reportContext?.viaje_id) {
    showInterestError('No hay una comisión activa para relacionar tu correo.');
    return;
  }
  if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    showInterestError('Ingresa un correo electrónico válido.');
    return;
  }

  const btn = document.getElementById('btnSubmitInterest');
  if (btn) { btn.disabled = true; btn.textContent = 'Registrando…'; }

  try {
    const res = await fetch('/api/public/interes-comision', {
      method: 'POST',
      headers: { ...FETCH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        correo_ciudadano: correo,
        nombre_ciudadano: nombre,
        viaje_id: reportContext.viaje_id,
        vehiculo_id: reportContext.vehiculo_id || vehiculoData?.id || null
      })
    });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      showInterestError(data.error || 'No se pudo registrar tu correo. Intenta nuevamente.');
      return;
    }

    const ok = document.getElementById('interestSuccess');
    if (ok) {
      ok.innerHTML = `✅ Listo. Cuando esta comisión finalice, enviaremos el enlace de consulta a <strong>${esc(correo)}</strong>.`;
      ok.classList.remove('hidden');
    }
    const ic = document.getElementById('iCorreo');
    const inombre = document.getElementById('iNombre');
    if (ic) ic.value = '';
    if (inombre) inombre.value = '';
  } catch (err) {
    console.error('[ciudadano] submitInterest error:', err);
    showInterestError('Error de red. Verifica tu conexión e intenta nuevamente.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Avísenme al finalizar'; }
  }
}

function clearReportForm() {
  ['fNombre','fCorreo','fDescripcion'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('fMotivo').value = '';
  selectedFile = null;
  stopCamera();
  resetCameraEvidence();
  hideReportAlerts();
}

async function startCamera() {
  hideReportAlerts();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showReportError('Este navegador no permite abrir la cámara. Usa Chrome/Edge/Safari actualizado y abre el sistema desde HTTPS o localhost.');
    return;
  }

  try {
    stopCamera();
    selectedFile = null;
    const video = document.getElementById('cameraVideo');
    const preview = document.getElementById('cameraPreview');
    const placeholder = document.getElementById('cameraPlaceholder');

    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });

    video.srcObject = cameraStream;
    video.classList.remove('hidden');
    preview.classList.add('hidden');
    placeholder.classList.add('hidden');
    document.getElementById('cameraBox').classList.remove('has-file');
    document.getElementById('btnCaptureCamera').classList.remove('hidden');
    document.getElementById('btnRetakeCamera').classList.add('hidden');
    document.getElementById('uploadLabel').textContent = 'Cámara activa. Toma la foto en este momento.';
  } catch (err) {
    console.error('[ciudadano] startCamera error:', err);
    showReportError('No se pudo abrir la cámara. Revisa permisos del navegador y que la página esté en HTTPS o localhost.');
  }
}

function captureEvidence() {
  hideReportAlerts();
  const video = document.getElementById('cameraVideo');
  const canvas = document.getElementById('cameraCanvas');
  const preview = document.getElementById('cameraPreview');

  if (!video || !video.srcObject || !video.videoWidth) {
    showReportError('Primero abre la cámara y espera a que se vea la imagen.');
    return;
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob((blob) => {
    if (!blob) {
      showReportError('No se pudo capturar la imagen. Intenta nuevamente.');
      return;
    }
    if (blob.size > 5 * 1024 * 1024) {
      showReportError('La imagen capturada supera 5 MB. Intenta tomarla nuevamente.');
      return;
    }

    selectedFile = blob;
    const objectUrl = URL.createObjectURL(blob);
    preview.src = objectUrl;
    preview.classList.remove('hidden');
    video.classList.add('hidden');
    document.getElementById('cameraPlaceholder').classList.add('hidden');
    document.getElementById('cameraBox').classList.add('has-file');
    document.getElementById('btnCaptureCamera').classList.add('hidden');
    document.getElementById('btnRetakeCamera').classList.remove('hidden');
    document.getElementById('uploadLabel').textContent = '✅ Evidencia tomada con cámara en este momento';
    stopCamera();
  }, 'image/jpeg', 0.88);
}

function resetCameraEvidence() {
  selectedFile = null;
  stopCamera();
  const box = document.getElementById('cameraBox');
  const video = document.getElementById('cameraVideo');
  const preview = document.getElementById('cameraPreview');
  const placeholder = document.getElementById('cameraPlaceholder');
  const label = document.getElementById('uploadLabel');

  if (box) box.classList.remove('has-file');
  if (video) { video.classList.add('hidden'); video.srcObject = null; }
  if (preview) { preview.classList.add('hidden'); preview.removeAttribute('src'); }
  if (placeholder) placeholder.classList.remove('hidden');
  if (label) label.textContent = 'Toca “Abrir cámara” para tomar la evidencia ahora';
  const capture = document.getElementById('btnCaptureCamera');
  const retake = document.getElementById('btnRetakeCamera');
  if (capture) capture.classList.add('hidden');
  if (retake) retake.classList.add('hidden');
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
}

async function submitReport() {
  hideReportAlerts();

  const correo     = document.getElementById('fCorreo').value.trim();
  const motivo     = document.getElementById('fMotivo').value;
  const descripcion = document.getElementById('fDescripcion').value.trim();

  if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    showReportError('Ingresa un correo electrónico válido.');
    return;
  }
  if (!motivo) {
    showReportError('Selecciona el motivo de la denuncia.');
    return;
  }
  if (!selectedFile) {
    showReportError('Debes tomar la evidencia con la cámara en este momento. No se permiten archivos subidos.');
    return;
  }
  if (!descripcion || descripcion.length < 15) {
    showReportError('La descripción debe tener al menos 15 caracteres.');
    return;
  }

  const btn = document.getElementById('btnSubmitReport');
  btn.disabled    = true;
  btn.textContent = 'Enviando…';

  try {
    const formData = new FormData();
    formData.append('correo_ciudadano', correo);
    formData.append('nombre_ciudadano', document.getElementById('fNombre').value.trim());
    formData.append('motivo',      motivo);
    formData.append('descripcion', descripcion);
    formData.append('viaje_id',    reportContext?.viaje_id    ?? '');
    formData.append('vehiculo_id', reportContext?.vehiculo_id ?? vehiculoData?.id ?? '');
    formData.append('evidencia_origen', 'camara');
    formData.append('evidencia_tomada_en', new Date().toISOString());
    formData.append('evidencia', selectedFile, `evidencia_camara_${Date.now()}.jpg`);

    const res = await fetch('/api/public/reportar', {
      method: 'POST',
      headers: { 'ngrok-skip-browser-warning': '1' },
      body: formData
    });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      showReportError(data.error || 'Error al enviar el reporte. Intenta nuevamente.');
      return;
    }

    document.getElementById('reportSuccess').classList.remove('hidden');
    document.getElementById('reportSuccess').innerHTML = `
      ✅ <strong>Reporte enviado correctamente.</strong>
      Tu número de seguimiento es: <code>${data.token}</code>.
      Cuando la comisión sea finalizada, recibirás un correo en
      <strong>${esc(correo)}</strong> con el resultado de tu reporte.
    `;

    // Hide the form fields
    document.querySelector('.form-grid').style.display = 'none';
    document.querySelector('.form-actions').style.display = 'none';
  } catch (err) {
    console.error('[ciudadano] submitReport error:', err);
    showReportError('Error de red. Verifica tu conexión e intenta nuevamente.');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Enviar Reporte';
  }
}

// ── UI helpers ─────────────────────────────────────────────────────────
function showLoading(state) {
  document.getElementById('loadingState').classList.toggle('hidden', !state);
}

function showError(msg) {
  showLoading(false);
  const el = document.getElementById('errorState');
  el.classList.remove('hidden');
  if (msg) el.querySelector('p').textContent = msg;
}

function showReportError(msg) {
  const el = document.getElementById('reportError');
  el.classList.remove('hidden');
  el.textContent = '⚠️ ' + msg;
}

function hideReportAlerts() {
  document.getElementById('reportError').classList.add('hidden');
  document.getElementById('reportSuccess').classList.add('hidden');
}

// ── Formatting helpers ─────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function capFirst(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  return isNaN(d) ? str : d.toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' });
}

function formatDateTime(str) {
  if (!str) return '—';
  const d = new Date(str);
  return isNaN(d) ? str : d.toLocaleString('es-MX', {
    day:'2-digit', month:'short', year:'numeric',
    hour:'2-digit', minute:'2-digit'
  });
}

function formatTime(str) {
  if (!str) return '—';
  const d = new Date(str);
  return isNaN(d) ? str : d.toLocaleTimeString('es-MX', {
    hour:'2-digit', minute:'2-digit', second:'2-digit'
  });
}

function formatElapsed(ms) {
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function formatKm(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${Math.max(0, Math.round(n)).toLocaleString('es-MX')} km`;
}
// =====================================================================
//  MODO DIRECTORIO PÚBLICO — sin token
//  Lista todas las comisiones institucionales con reglas de privacidad:
//    • Activas: sin destino ni motivo
//    • Finalizadas: información completa
// =====================================================================
async function loadDirectorio() {
  showLoading(true);
  console.log('[ciudadano] Cargando directorio público…');
  try {
    const res = await fetch('/api/public/directorio?' + nocache(), { headers: FETCH_HEADERS });
    console.log('[ciudadano] /api/public/directorio respondió HTTP', res.status);

    if (res.status === 404) {
      showError('El endpoint del directorio público no está disponible. Verifica que el servidor Node esté corriendo la versión actualizada (debe imprimir "BUILD: restauracion-completa-v3" al arrancar).');
      return;
    }

    let data;
    try { data = await res.json(); }
    catch (e) {
      showError('El servidor respondió en un formato inesperado.');
      return;
    }
    if (!res.ok || !data.ok) {
      if (res.status === 429) {
        showError('Demasiadas consultas en poco tiempo. Espera unos minutos.');
      } else if (res.status >= 500) {
        showError('Error del servidor: ' + (data?.error || 'Error interno.'));
      } else {
        showError(data?.error || 'No fue posible cargar el directorio público.');
      }
      return;
    }
    console.log('[ciudadano] Directorio cargado:', {
      activas: (data.activas || []).length,
      finalizadas: (data.finalizadas || []).length
    });
    renderDirectorio(data);
  } catch (err) {
    console.error('[ciudadano] loadDirectorio error:', err);
    showError('Error de red: ' + err.message);
  } finally {
    showLoading(false);
  }
}

function renderDirectorio(data) {
  const dirSec = document.getElementById('directorioSection');
  if (!dirSec) {
    console.error('[ciudadano] Falta #directorioSection en el HTML.');
    return;
  }
  dirSec.classList.remove('hidden');

  const activas     = data.activas     || [];
  const finalizadas = data.finalizadas || [];
  const vehiculosUnicos = new Set(
    [...activas, ...finalizadas].map(c => c.vehiculo_id)
  ).size;

  const resumenEl = document.getElementById('directorioResumen');
  if (resumenEl) {
    resumenEl.innerHTML = `
      <div class="dir-stat"><div class="dir-stat-num">${activas.length}</div><div class="dir-stat-label">🟡 En curso</div></div>
      <div class="dir-stat"><div class="dir-stat-num">${finalizadas.length}</div><div class="dir-stat-label">🟢 Finalizadas</div></div>
      <div class="dir-stat"><div class="dir-stat-num">${vehiculosUnicos}</div><div class="dir-stat-label">🚗 Vehículos</div></div>`;
  }

  if (activas.length) {
    document.getElementById('dirActivasSection').classList.remove('hidden');
    document.getElementById('dirActivasCount').textContent = activas.length;
    document.getElementById('dirActivasList').innerHTML = activas.map(renderComisionActivaCard).join('');
  }
  if (finalizadas.length) {
    document.getElementById('dirFinalizadasSection').classList.remove('hidden');
    document.getElementById('dirFinalizadasCount').textContent = finalizadas.length;
    document.getElementById('dirFinalizadasList').innerHTML = finalizadas.map(renderComisionFinalizadaCard).join('');
  }
  if (!activas.length && !finalizadas.length) {
    document.getElementById('dirVacioSection').classList.remove('hidden');
  }
}

function renderComisionActivaCard(c) {
  const verBtn = c.qr_token
    ? `<a href="?token=${encodeURIComponent(c.qr_token)}" class="dir-btn-vehiculo">🔍 Ver vehículo</a>` : '';
  return `
    <div class="dir-card dir-card-activa">
      <div class="dir-card-header">
        <div class="dir-vehiculo-info">
          <strong>🚗 ${esc(c.marca)} ${esc(c.linea)}</strong>
          <span class="dir-vehiculo-placas">${esc(c.placas || '—')}</span>
          ${c.no_economico ? `<span class="dir-vehiculo-eco">No. Eco. ${esc(c.no_economico)}</span>` : ''}
        </div>
        <span class="dir-status-pill activa">🟡 En curso</span>
      </div>
      <div class="active-only-status dir-active-status">
        <div class="active-only-icon">🟡</div>
        <div>
          <h3>En comisión</h3>
          <p>Los detalles se mostrarán cuando la comisión finalice.</p>
        </div>
      </div>
      <div class="privacy-notice" style="margin:10px 0;">
        <span class="privacy-icon">🔒</span>
        <p style="margin:0;font-size:.78rem;">Datos de la comisión restringidos mientras está en curso.</p>
      </div>
      <div class="dir-actions">
        ${verBtn}
        <button class="btn-report" onclick="openReportForTrip(${Number(c.id)}, ${Number(c.vehiculo_id)})">🚨 Denunciar esta comisión</button>
      </div>
    </div>`;
}

function renderComisionFinalizadaCard(c) {
  const ini = c.fecha_inicio ? formatDateTime(c.fecha_inicio) : '—';
  const iniHora = c.fecha_inicio ? formatTime(c.fecha_inicio) : '—';
  const fin = c.fecha_fin    ? formatDateTime(c.fecha_fin)    : '—';
  const destino = [c.lugar_destino, c.estado_dst].filter(Boolean).join(' — ') || 'Sin destino';
  const verBtn = c.qr_token
    ? `<a href="?token=${encodeURIComponent(c.qr_token)}" class="dir-btn-vehiculo">🔍 Ver vehículo</a>` : '';
  return `
    <div class="dir-card dir-card-finalizada">
      <div class="dir-card-header">
        <div class="dir-vehiculo-info">
          <strong>🚗 ${esc(c.marca)} ${esc(c.linea)}</strong>
          <span class="dir-vehiculo-placas">${esc(c.placas || '—')}</span>
          ${c.no_economico ? `<span class="dir-vehiculo-eco">No. Eco. ${esc(c.no_economico)}</span>` : ''}
        </div>
        <span class="dir-status-pill finalizada">✅ Finalizada</span>
      </div>
      <h4 style="margin:10px 0 8px;color:var(--green,#15803d);">📍 ${esc(destino)}</h4>
      <div class="trip-grid">
        <div class="trip-field"><label>Responsable</label><span>${esc(c.responsable || '—')}</span></div>
        <div class="trip-field"><label>Motivo</label><span>${esc(c.motivo || '—')}</span></div>
        <div class="trip-field"><label>Inicio</label><span>${ini}</span></div>
        <div class="trip-field"><label>Hora de inicio</label><span>${iniHora}</span></div>
        <div class="trip-field"><label>Fin</label><span>${fin}</span></div>
        <div class="trip-field"><label>Kilómetros recorridos</label><span>${formatKm(c.km_recorridos)}</span></div>
      </div>
      ${c.descripcion ? `<div class="obs-block" style="margin-top:8px;"><strong>Resumen:</strong> ${esc(c.descripcion)}</div>` : ''}
      <div class="dir-actions">
        ${verBtn}
        <button class="btn-report" onclick="openReportForTrip(${Number(c.id)}, ${Number(c.vehiculo_id)})">🚨 Denunciar esta comisión</button>
      </div>
    </div>`;
}
