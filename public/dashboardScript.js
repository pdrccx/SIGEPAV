/* ============================================================
   DASHBOARD · SIGEPAV
   Carga datos reales desde /api/dashboard y /api/dashboard/charts
   ============================================================ */
(function () {
    'use strict';

    const PALETA = [
        '#006dc8','#1f9d67','#e6a817','#e53935','#7b1fa2',
        '#00838f','#f4511e','#3949ab','#43a047','#8d6e63'
    ];

    let charts = {};
    let cargando = false;

    function destroyChart(id) {
        if (charts[id]) { charts[id].destroy(); delete charts[id]; }
    }

    function crearGrafica(id, tipo, labels, data, opciones = {}) {
        destroyChart(id);
        const ctx = document.getElementById(id);
        if (!ctx) return;
        charts[id] = new Chart(ctx, {
            type: tipo,
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: opciones.colores || PALETA.slice(0, labels.length),
                    borderColor: opciones.borderColor || (tipo === 'line' ? '#006dc8' : 'transparent'),
                    borderWidth: tipo === 'line' ? 2 : 1,
                    fill: opciones.fill || false,
                    tension: 0.4,
                    label: opciones.label || ''
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: tipo === 'doughnut' || tipo === 'pie' ? 'right' : 'top',
                        labels: { font: { size: 12 }, boxWidth: 14 }
                    },
                    tooltip: { enabled: true }
                },
                scales: (tipo === 'bar' || tipo === 'line') ? {
                    y: { beginAtZero: true, grid: { color: '#f0f4f8' } },
                    x: { grid: { display: false } }
                } : {},
                ...opciones.chartOptions
            }
        });
    }

    /* ── KPIs ── */
    function renderKPIs(dash) {
        document.getElementById('kpi-vehiculos').textContent  = dash.vehiculos_activos ?? '—';
        document.getElementById('kpi-vales').textContent      = dash.vales_mes ?? '—';
        document.getElementById('kpi-alertas').textContent    = dash.alertas_pendientes ?? '—';
        document.getElementById('kpi-comisiones').textContent = dash.fallas_sin_atender ?? '—';
    }

    /* ── Gráficas ── */
    function renderCharts(c) {
        // 1. Comisiones por estado — Doughnut
        if (c.porEstado && c.porEstado.length) {
            crearGrafica('chart-estados', 'doughnut',
                c.porEstado.map(r => r.estado),
                c.porEstado.map(r => r.n)
            );
        } else {
            crearGrafica('chart-estados', 'doughnut',
                ['Sin datos'], [1], { colores: ['#e0e0e0'] }
            );
        }

        // 2. Vehículos por tipo — Bar horizontal
        if (c.porTipo && c.porTipo.length) {
            crearGrafica('chart-tipos', 'bar',
                c.porTipo.map(r => r.tipo),
                c.porTipo.map(r => r.n),
                { label: 'Vehículos', chartOptions: { indexAxis: 'y' } }
            );
        } else {
            crearGrafica('chart-tipos', 'bar',
                ['Sin datos'], [0], { label: 'Vehículos' }
            );
        }

        // 3. Vales por mes — Line
        if (c.valesMes && c.valesMes.length) {
            crearGrafica('chart-vales', 'bar',
                c.valesMes.map(r => r.mes),
                c.valesMes.map(r => r.vales),
                { label: 'Vales', fill: true }
            );
        } else {
            crearGrafica('chart-vales', 'bar',
                ['Sin datos'], [0], { label: 'Vales' }
            );
        }

        // 4. Top vehículos — Bar
        if (c.topVehiculos && c.topVehiculos.length) {
            crearGrafica('chart-top-vehiculos', 'bar',
                c.topVehiculos.map(r => r.vehiculo),
                c.topVehiculos.map(r => r.comisiones),
                { label: 'Comisiones', chartOptions: { indexAxis: 'y' } }
            );
        } else {
            crearGrafica('chart-top-vehiculos', 'bar',
                ['Sin datos'], [0], { label: 'Comisiones' }
            );
        }
    }

    /* ── Mensaje de error (sin datos demo) ── */
    function mostrarError(msg) {
        const err = document.getElementById('dash-error');
        if (err) {
            err.style.display = 'block';
            err.textContent = msg || 'No se pudo cargar la información desde la base de datos. Verifica que el servidor esté corriendo.';
        }
        // KPIs en cero
        renderKPIs({ vehiculos_activos: 0, vales_mes: 0, alertas_pendientes: 0, fallas_sin_atender: 0 });
        // Gráficas vacías
        renderCharts({ porEstado: [], porTipo: [], valesMes: [], alertasTipo: [], topVehiculos: [] });
    }

    // Integración cruzada: resúmenes de Salud de la flota (Módulo D) y
    // Vencimientos urgentes (Módulo A) directo en el dashboard.
    function cargarIntegraciones() {
        const base = window.API_BASE || (window.location && window.location.origin ? window.location.origin : 'http://localhost:3000');
        const color = { critico: '#ef4444', medio: '#f59e0b', bajo: '#10b981' };

        fetch(`${base}/api/ia/parque/predictivo`, { cache: 'no-store' })
            .then(r => r.json())
            .then(d => {
                const cont = document.getElementById('dash-salud-flota');
                if (!cont) return;
                const top = (d.ranking || []).filter(r => r.nivel !== 'bajo').slice(0, 4);
                if (!top.length) { cont.innerHTML = '<p style="color:#16a34a;text-align:center;padding:1rem"><i class="fas fa-circle-check"></i> Flota en buen estado</p>'; return; }
                cont.innerHTML = top.map(r => `
                    <div style="display:flex;align-items:center;gap:.6rem;padding:.5rem .3rem;border-bottom:1px solid #f1f5f9">
                        <span style="width:9px;height:9px;border-radius:50%;background:${color[r.nivel]};flex-shrink:0"></span>
                        <div style="flex:1;min-width:0">
                            <strong style="color:#0d2d6b">${r.no_economico}</strong>
                            <span style="color:#64748b;font-size:.82rem"> ${r.marca} ${r.linea}</span>
                            <div style="font-size:.77rem;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.razones[0] || ''}</div>
                        </div>
                        <span style="font-weight:800;color:${color[r.nivel]}">${r.score}</span>
                    </div>`).join('');
            })
            .catch(() => { const c = document.getElementById('dash-salud-flota'); if (c) c.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:1rem">No disponible</p>'; });

        fetch(`${base}/api/vencimientos`, { cache: 'no-store' })
            .then(r => r.json())
            .then(d => {
                const cont = document.getElementById('dash-vencimientos');
                if (!cont) return;
                const rojos = (d.datos || []).filter(v => v.semaforo_general === 'rojo').slice(0, 5);
                if (!rojos.length) { cont.innerHTML = '<p style="color:#16a34a;text-align:center;padding:1rem"><i class="fas fa-circle-check"></i> Sin vencimientos urgentes</p>'; return; }
                function peor(v) {
                    const items = [['Tenencia', v.dias_tenencia, v.semaforo_tenencia], ['Verificación', v.dias_verificacion, v.semaforo_verificacion], ['Seguro', v.dias_seguro, v.semaforo_seguro]];
                    const r = items.filter(i => i[2] === 'rojo').sort((a, b) => (a[1] ?? 0) - (b[1] ?? 0))[0];
                    return r ? `${r[0]}: ${r[1] < 0 ? 'vencida' : r[1] + 'd'}` : '';
                }
                cont.innerHTML = rojos.map(v => `
                    <div style="display:flex;align-items:center;gap:.6rem;padding:.5rem .3rem;border-bottom:1px solid #f1f5f9">
                        <span style="width:9px;height:9px;border-radius:50%;background:#ef4444;flex-shrink:0"></span>
                        <div style="flex:1;min-width:0">
                            <strong style="color:#0d2d6b">${v.no_economico}</strong>
                            <span style="color:#64748b;font-size:.82rem"> ${v.marca} ${v.linea}</span>
                        </div>
                        <span style="font-size:.8rem;color:#991b1b;font-weight:600;white-space:nowrap">${peor(v)}</span>
                    </div>`).join('');
            })
            .catch(() => { const c = document.getElementById('dash-vencimientos'); if (c) c.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:1rem">No disponible</p>'; });
    }

    async function cargar() {
        if (cargando) return;
        cargando = true;
        cargarIntegraciones();
        const base = window.API_BASE || (window.location && window.location.origin ? window.location.origin : 'http://localhost:3000');
        const status = document.getElementById('dash-live-status');
        try {
            if (status) status.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Actualizando datos...';
            const [rDash, rCharts] = await Promise.all([
                fetch(`${base}/api/dashboard`, { cache: 'no-store' }).then(r => r.json()),
                fetch(`${base}/api/dashboard/charts`, { cache: 'no-store' }).then(r => r.json())
            ]);

            if (!rDash.ok) throw new Error('La API /api/dashboard respondió con error: ' + (rDash.error || 'sin detalle'));
            if (!rCharts.ok) throw new Error('La API /api/dashboard/charts respondió con error: ' + (rCharts.error || 'sin detalle'));

            const err = document.getElementById('dash-error');
            if (err) err.style.display = 'none';
            renderKPIs(rDash);
            renderCharts(rCharts);
            if (status) {
                const ahora = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                status.innerHTML = `<i class="fas fa-circle" style="font-size:.55rem;color:#1f9d67;"></i> Actualizado · ${ahora}`;
            }
        } catch (e) {
            console.warn('[dashboard] API no disponible:', e.message);
            mostrarError(e.message || 'No se pudo contactar al servidor.');
            if (status) status.innerHTML = '<i class="fas fa-triangle-exclamation" style="color:#c94545"></i> Sin conexión con la API';
        } finally {
            cargando = false;
        }
    }

    function iniciarDashboard() {
        // Carga al entrar a la pestaña. SIN auto-refresh periódico: los datos
        // solo se recargan al abrir el dashboard o al volver el foco a la
        // pestaña (cuando el admin entra de nuevo).
        cargar();
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) cargar();
        });
    }

    /* ── Navbar ──
       El menú lo renderiza navbar.js (menú unificado del sistema).
       Aquí sólo enganchamos el botón de logout. */
    function initNavbar() {
        // auth-guard.js ya conecta el logout; este bloque es un fallback.
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn && !logoutBtn._guardBound) {
            logoutBtn.onclick = () => {
                try { sessionStorage.removeItem('sigepav_usuario'); } catch (e) {}
                window.location.href = 'index.html';
            };
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        initNavbar();
        iniciarDashboard();
    });
})();