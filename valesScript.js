const API_BASE = window.API_BASE || '';
const sesion = (window.SIGEPAV && window.SIGEPAV.getSession && window.SIGEPAV.getSession()) || {};

// Email en header
document.getElementById('user-email-display').textContent = sesion.email || 'Usuario';

function logout() {
    if (window.SIGEPAV && window.SIGEPAV.clearSession) window.SIGEPAV.clearSession();
    location.href = 'index.html';
}

// Clic en SIGEPAV → menú principal
document.querySelectorAll('.barra-superior .titulo-sistema, .barra-superior .titulo-sistema h1, .barra-superior .logo-barra')
    .forEach(el => { el.style.cursor = 'pointer'; el.onclick = () => location.href = 'index.html'; });

// ── Estado actual de la pestaña ───────────────────────────────────
// Lee ?tab= de la URL para soportar enlaces directos del navbar.
let tabActiva = 'disponible';
(function inicializarTabDesdeURL() {
    const params = new URLSearchParams(location.search);
    const t = params.get('tab');
    // 'historial' es alias amigable de 'usado' (lo que muestra el navbar)
    const map = { 'historial': 'usado', 'usado': 'usado', 'disponible': 'disponible', 'borrador': 'borrador', 'todos': 'todos' };
    if (t && map[t]) tabActiva = map[t];
    // Actualizar visual
    document.querySelectorAll('.tab-vale').forEach(x => x.classList.remove('activo'));
    const el = document.querySelector(`.tab-vale[data-tab="${tabActiva}"]`);
    if (el) el.classList.add('activo');
})();

document.querySelectorAll('.tab-vale').forEach(t => {
    t.addEventListener('click', () => {
        document.querySelectorAll('.tab-vale').forEach(x => x.classList.remove('activo'));
        t.classList.add('activo');
        tabActiva = t.dataset.tab;
        cargarVales();
    });
});

// ── Render tabla ───────────────────────────────────────────────────
async function cargarVales() {
    const tbody = document.getElementById('tbody-vales');
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--color-texto-claro)"><i class="fas fa-spinner fa-spin"></i> Cargando...</td></tr>';
    try {
        const url = tabActiva === 'todos'
            ? `${API_BASE}/api/vales`
            : `${API_BASE}/api/vales?estado=${tabActiva}`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (!data.ok) throw new Error(data.error || 'Error');
        renderTabla(data.vales || []);
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:20px;color:#c94545">Error: ${err.message}</td></tr>`;
    }
}

function renderTabla(vales) {
    const tbody = document.getElementById('tbody-vales');
    if (!vales.length) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--color-texto-claro)">
            <i class="fas fa-inbox" style="font-size:1.6rem;display:block;margin-bottom:8px"></i>
            Sin vales en esta pestaña.
        </td></tr>`;
        return;
    }
    tbody.innerHTML = vales.map(v => {
        const badge = `<span class="badge-vale badge-${v.estado}">${labelEstado(v.estado)}</span>`;
        const comision = v.viaje_id
            ? `<a href="index.html" style="color:var(--color-degradado-fin)">#${v.viaje_id} · ${esc(v.comision_destino || '—')}</a>`
            : '—';
        const fecha = v.created_at ? new Date(v.created_at).toLocaleDateString('es-MX') : '—';

        let acciones = '';
        if (v.estado === 'borrador') {
            acciones += `<button class="btn-mini btn-publicar" onclick="publicar(${v.id})" title="Publicar"><i class="fas fa-paper-plane"></i></button>`;
            acciones += `<button class="btn-mini btn-eliminar" onclick="eliminar(${v.id})" title="Eliminar"><i class="fas fa-trash"></i></button>`;
        } else if (v.estado === 'disponible') {
            acciones += `<button class="btn-mini btn-eliminar" onclick="eliminar(${v.id})" title="Eliminar"><i class="fas fa-trash"></i></button>`;
        } else {
            acciones = '<span style="color:#94a3b8;font-size:11px">—</span>';
        }

        return `
            <tr>
                <td><strong>${esc(v.no_vale)}</strong></td>
                <td>${esc(v.folio || '—')}</td>
                <td class="col-mini">$${fmt(v.cantidad)}</td>
                <td class="col-mini">$${fmt(v.precio_litro)}</td>
                <td class="col-mini">${fmt(v.litros)}</td>
                <td>${badge}</td>
                <td>${comision}</td>
                <td style="font-size:11.5px;color:var(--color-texto-claro)">${fecha}</td>
                <td class="col-mini" style="white-space:nowrap">${acciones}</td>
            </tr>
        `;
    }).join('');
}

function labelEstado(e) {
    return e === 'borrador' ? 'Borrador'
         : e === 'disponible' ? 'Disponible'
         : e === 'usado' ? 'Usado' : e;
}
function fmt(n) {
    const x = parseFloat(n);
    return isFinite(x) ? x.toFixed(2) : '0.00';
}
function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Guardar ────────────────────────────────────────────────────────
let guardandoVale = false;

function setBotonesValeGuardando(cargando) {
    const btnBorrador = document.getElementById('btn-guardar-borrador');
    const btnPublicar = document.getElementById('btn-publicar-vale');
    [btnBorrador, btnPublicar].forEach(btn => {
        if (!btn) return;
        if (cargando) {
            if (!btn.dataset.textoOriginal) btn.dataset.textoOriginal = btn.innerHTML;
            btn.disabled = true;
            btn.classList.add('btn-cargando');
        } else {
            btn.disabled = false;
            btn.classList.remove('btn-cargando');
            if (btn.dataset.textoOriginal) btn.innerHTML = btn.dataset.textoOriginal;
        }
    });
    if (cargando) {
        const objetivo = publicarActual ? btnPublicar : btnBorrador;
        if (objetivo) objetivo.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    }
}

let publicarActual = false;

async function guardar(publicar = false) {
    if (guardandoVale) return;
    publicarActual = !!publicar;
    const no_vale = document.getElementById('v-no').value.trim();
    if (!no_vale) {
        alert('El número de vale es obligatorio.');
        return;
    }
    const body = {
        no_vale,
        folio:        document.getElementById('v-folio').value.trim() || null,
        cantidad:     parseFloat(document.getElementById('v-cantidad').value) || 0,
        precio_litro: parseFloat(document.getElementById('v-precio').value) || 0,
        litros:       parseFloat(document.getElementById('v-litros').value) || 0,
        publicar,
        creado_por:   sesion.id || null
    };
    guardandoVale = true;
    setBotonesValeGuardando(true);
    try {
        const resp = await fetch(`${API_BASE}/api/vales`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await resp.json();
        if (!data.ok) throw new Error(data.error);
        limpiarForm();
        tabActiva = publicar ? 'disponible' : 'borrador';
        document.querySelectorAll('.tab-vale').forEach(t => t.classList.toggle('activo', t.dataset.tab === tabActiva));
        cargarVales();
    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        guardandoVale = false;
        setBotonesValeGuardando(false);
    }
}

function limpiarForm() {
    ['v-no','v-folio','v-cantidad','v-precio','v-litros'].forEach(id => {
        document.getElementById(id).value = '';
    });
}

document.getElementById('btn-guardar-borrador').addEventListener('click', () => guardar(false));
document.getElementById('btn-publicar-vale').addEventListener('click',  () => guardar(true));

// ── Acciones de tabla ──────────────────────────────────────────────
async function publicar(id) {
    if (!confirm('¿Publicar este vale? Aparecerá en el combo de inicio de comisión.')) return;
    try {
        const r = await fetch(`${API_BASE}/api/vales/${id}/publicar`, { method: 'PUT' });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error);
        cargarVales();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function eliminar(id) {
    if (!confirm('¿Eliminar este vale? Solo se puede si no ha sido usado.')) return;
    try {
        const r = await fetch(`${API_BASE}/api/vales/${id}`, { method: 'DELETE' });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error);
        cargarVales();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// Inicial
cargarVales();
