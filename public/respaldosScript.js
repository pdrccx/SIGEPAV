// Email del usuario en la barra superior
(function () {
    const emailEl = document.getElementById('user-email-display');
    if (emailEl && window.SIGEPAV && window.SIGEPAV.getSession) {
        emailEl.textContent = (window.SIGEPAV.getSession() || {}).email || 'Usuario';
    }
})();

function logout() {
    if (window.SIGEPAV && window.SIGEPAV.clearSession) window.SIGEPAV.clearSession();
    location.href = 'index.html';
}

// Clic en SIGEPAV / logo → vuelve al menú principal
document.addEventListener('click', (e) => {
    const t = e.target.closest('.titulo-sistema, .titulo-sistema h1, .logo-barra');
    if (!t || !t.closest('.barra-superior')) return;
    window.location.href = 'index.html';
});
document.querySelectorAll('.barra-superior .titulo-sistema, .barra-superior .titulo-sistema h1, .barra-superior .logo-barra')
    .forEach(el => { el.style.cursor = 'pointer'; el.title = 'Volver al menú principal'; });

function toast(msg, type = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'show ' + type;
  clearTimeout(t._t); t._t = setTimeout(() => t.className = '', 2800);
}

// =====================================================================
//   RESPALDOS  ·  Toda la data viene del backend (/api/respaldos)
// =====================================================================
const API_BASE = (window.SIGEPAV && window.SIGEPAV.API_BASE) || window.API_BASE || '';

let respaldos = [];   // se llena desde la API

// ── Helpers de formato ──────────────────────────────────────────────
function fmtBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
    return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}
function fmtFecha(iso) {
    if (!iso) return '—';
    // Si viene como 'YYYY-MM-DD HH:MM:SS' lo respetamos tal cual
    const s = String(iso).replace('T', ' ').slice(0, 19);
    const [d, t] = s.split(' ');
    if (!d) return s;
    const [y, mo, da] = d.split('-');
    return `${da}/${mo}/${y} · ${(t || '').slice(0, 5)}`;
}
function fmtFechaCorta(iso) {
    if (!iso) return '—';
    const s = String(iso).replace('T', ' ').slice(0, 10);
    const [y, mo, da] = s.split('-');
    if (!da) return s;
    return `${da}/${mo}/${y}`;
}

// ── Cargar lista desde el backend ───────────────────────────────────
async function cargarRespaldos() {
    const tbody = document.getElementById('history-body');
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><i class="fas fa-spinner fa-spin" style="font-size:1.5rem;margin-bottom:8px;display:block"></i>Cargando...</div></td></tr>';
    try {
        const resp = await fetch(`${API_BASE}/api/respaldos`);
        const data = await resp.json();
        if (!data.ok) throw new Error(data.error || 'Respuesta inválida');
        respaldos = data.respaldos || [];
        actualizarStats(data.stats || {});
        renderHistory();
    } catch (err) {
        respaldos = [];
        tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state" style="color:#c94545"><i class="fas fa-exclamation-triangle" style="font-size:1.5rem;margin-bottom:8px;display:block"></i>No se pudo cargar la lista: ${err.message}</div></td></tr>`;
        actualizarStats({});
    }
}

function actualizarStats(s) {
    const elCount = document.getElementById('stat-count');
    const elLast  = document.getElementById('stat-last');
    const elSize  = document.getElementById('stat-size');
    const elFail  = document.getElementById('stat-fail');
    if (elCount) elCount.textContent = s.exitosos || 0;
    if (elLast)  elLast.textContent  = fmtFechaCorta(s.ultimo_ok);
    if (elSize)  elSize.textContent  = fmtBytes(s.bytes_total);
    if (elFail)  elFail.textContent  = s.fallidos || 0;
    document.getElementById('history-count').textContent = (s.total || 0) + ' archivos';
}

// ── Render de la tabla histórica ────────────────────────────────────
function renderHistory() {
    const tbody = document.getElementById('history-body');
    if (!respaldos.length) {
        tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><i class="fas fa-database" style="font-size:2rem;margin-bottom:10px;display:block"></i>Sin respaldos disponibles.</div></td></tr>';
        return;
    }
    tbody.innerHTML = respaldos.map(r => {
        const esAuto = r.tipo === 'automatico';
        const usuario = esAuto ? 'sistema (auto)' : (r.usuario_email || r.usuario_nombre || '—');
        const estadoBadge =
            r.estado === 'ok'        ? '<span class="badge badge-success">OK</span>' :
            r.estado === 'error'     ? '<span class="badge" style="background:#fde2e2;color:#c94545">ERROR</span>' :
                                        '<span class="badge badge-muted">EN PROCESO</span>';
        const acciones = r.estado === 'ok'
            ? `<button class="icon-btn view" title="Descargar" onclick="descargarRespaldo(${r.id})"><i class="fas fa-download" style="font-size:11px"></i></button>
               <button class="icon-btn del" title="Eliminar" onclick="abrirEliminar(${r.id})"><i class="fas fa-trash" style="font-size:11px"></i></button>`
            : `<button class="icon-btn del" title="Eliminar" onclick="abrirEliminar(${r.id})"><i class="fas fa-trash" style="font-size:11px"></i></button>`;

        return `
            <tr>
                <td><span class="mono" style="color:var(--color-texto);font-size:12px">${r.nombre}</span></td>
                <td><span class="type-pill pill-db">🗄️ Base de Datos</span></td>
                <td><span class="size-mono">${fmtBytes(r.tamano_bytes)}</span></td>
                <td><span class="date-mono">${fmtFecha(r.created_at)}</span></td>
                <td style="font-size:12px;color:var(--color-texto-claro)">${usuario}</td>
                <td>
                    ${estadoBadge}
                    ${esAuto ? '<br><span class="pill-auto badge" style="margin-top:4px;display:inline-block"><i class="fas fa-robot" style="font-size:9px;margin-right:3px"></i>AUTO</span>' : ''}
                </td>
                <td><div class="actions" style="justify-content:center">${acciones}</div></td>
            </tr>
        `;
    }).join('');
}

// ── Selección de tipo (solo BD activo) ──────────────────────────────
let selectedType = null;
function selectType(t) {
    if (t !== 'db') return; // sólo se permite respaldo de base de datos
    selectedType = t;
    document.getElementById('card-db').className = 'backup-card selected-db';
    const btn = document.getElementById('btn-generate');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-database"></i> Generar respaldo de base de datos (.sql)';
}

// ── Generar respaldo (POST al backend) ──────────────────────────────
async function generateBackup() {
    if (selectedType !== 'db') return;
    const btn = document.getElementById('btn-generate');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...';

    const pw = document.getElementById('progress-wrap');
    const pf = document.getElementById('progress-fill');
    const pl = document.getElementById('progress-label');
    pw.classList.add('show'); pf.style.width = '0';

    // Barra de progreso “indeterminada” mientras esperamos al backend
    let w = 0;
    const iv = setInterval(() => {
        w = Math.min(w + 8, 90);
        pf.style.width = w + '%';
        pl.textContent = w < 40 ? 'Preparando datos...' : w < 75 ? 'Exportando tablas...' : 'Guardando respaldo...';
    }, 350);

    try {
        const sess = (window.SIGEPAV && window.SIGEPAV.getSession && window.SIGEPAV.getSession()) || {};
        const resp = await fetch(`${API_BASE}/api/respaldos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario_id: sess.id || null })
        });
        const data = await resp.json();
        clearInterval(iv);
        pf.style.width = '100%'; pl.textContent = '¡Listo!';
        if (!data.ok) throw new Error(data.error || 'Error desconocido');
        await cargarRespaldos();
        toast('✅ Respaldo generado exitosamente', 'ok');
    } catch (err) {
        clearInterval(iv);
        pl.textContent = 'Error: ' + err.message;
        pf.style.width = '0';
        toast('❌ ' + err.message, 'err');
    } finally {
        setTimeout(() => { pw.classList.remove('show'); pf.style.width = '0'; }, 600);
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-database"></i> Generar respaldo de base de datos (.sql)';
    }
}

// ── Descargar ───────────────────────────────────────────────────────
function descargarRespaldo(id) {
    // El endpoint devuelve el archivo con Content-Disposition: attachment
    window.location.href = `${API_BASE}/api/respaldos/${id}/descargar`;
}

// ── Restaurar archivo subido (placeholder honesto) ──────────────────
function fileSelected(input) {
    const f = input.files[0]; if (!f) return;
    const el = document.getElementById('file-name');
    el.innerHTML = '<i class="fas fa-paperclip" style="margin-right:5px"></i>' + f.name;
    el.style.display = 'block';
    document.getElementById('restore-info').style.display = 'block';
}
function handleDrop(ev) {
    ev.preventDefault();
    document.getElementById('upload-zone').classList.remove('drag-over');
    const f = ev.dataTransfer.files[0]; if (!f) return;
    document.getElementById('file-input').files = ev.dataTransfer.files;
    fileSelected(document.getElementById('file-input'));
}
function openRestoreConfirm() {
    document.getElementById('restore-word').value = '';
    document.getElementById('btn-restore-confirm').disabled = true;
    document.getElementById('modal-restore').classList.add('show');
}
function checkRestoreWord() {
    document.getElementById('btn-restore-confirm').disabled =
        document.getElementById('verify-word') ? false :
        document.getElementById('restore-word').value.trim() !== 'RESTAURAR';
}
function confirmRestore() {
    closeModal('modal-restore');
    toast('La restauración debe hacerse desde MySQL Workbench o por línea de comandos con el archivo .sql descargado.', 'warn');
}

// ── Modal de eliminación (3 pasos, mantiene la UX original) ─────────
let deleteTarget = null, deleteStep = 1;
function abrirEliminar(id) {
    deleteTarget = respaldos.find(x => x.id === id);
    if (!deleteTarget) return;
    deleteStep = 1;
    document.getElementById('del-filename').textContent = deleteTarget.nombre;
    document.getElementById('del-filename-hint').textContent = deleteTarget.nombre;
    document.getElementById('verify-name').value = '';
    document.getElementById('verify-word').value = '';
    document.getElementById('btn-del-next').textContent = 'Continuar →';
    document.getElementById('btn-del-next').disabled = false;
    updateDeleteStep(1);
    document.getElementById('modal-delete').classList.add('show');
}
// alias por compatibilidad con onclick antiguos del HTML
function openDelete(id) { abrirEliminar(id); }

function updateDeleteStep(s) {
    [1,2,3].forEach(n => {
        const stepEl = document.getElementById('step-' + n);
        if (stepEl) stepEl.className = 'confirm-step' + (n === s ? ' active' : '');
        const dot = document.getElementById('dot-' + n);
        if (dot) dot.className = 'step-dot' + (n < s ? ' done' : (n === s ? ' active' : ''));
    });
    if (s === 3) {
        document.getElementById('btn-del-next').innerHTML = '<i class="fas fa-trash" style="margin-right:5px"></i>Eliminar definitivamente';
        document.getElementById('btn-del-next').disabled = true;
    }
}
function checkStep2() {}
function checkStep3() {
    document.getElementById('btn-del-next').disabled =
        document.getElementById('verify-word').value.trim() !== 'ELIMINAR';
}
async function deleteNext() {
    if (deleteStep === 1) {
        deleteStep = 2; updateDeleteStep(2);
    } else if (deleteStep === 2) {
        if (document.getElementById('verify-name').value.trim() !== deleteTarget.nombre) {
            toast('El nombre no coincide. Inténtalo de nuevo.', 'err'); return;
        }
        deleteStep = 3; updateDeleteStep(3);
    } else if (deleteStep === 3) {
        if (document.getElementById('verify-word').value.trim() !== 'ELIMINAR') return;
        try {
            const resp = await fetch(`${API_BASE}/api/respaldos/${deleteTarget.id}`, { method: 'DELETE' });
            const data = await resp.json();
            if (!data.ok) throw new Error(data.error || 'Error al eliminar');
            closeDelete();
            await cargarRespaldos();
            toast('🗑️ Respaldo eliminado permanentemente', 'err');
        } catch (err) {
            toast('❌ ' + err.message, 'err');
        }
    }
}
function closeDelete() {
    document.getElementById('modal-delete').classList.remove('show');
    deleteTarget = null; deleteStep = 1;
}
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

// ── Init ─────────────────────────────────────────────────────────────
cargarRespaldos();
