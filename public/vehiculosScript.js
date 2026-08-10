    // ====== Lógica específica de la página de vehículos ======
    document.addEventListener('DOMContentLoaded', () => {
        const API = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : (window.location && window.location.origin ? window.location.origin : 'http://localhost:3000');

        // ---------- Estado ----------
        let vehiculos       = [];
        let observaciones   = SIGEPAV.storage.loadObs();
        let nextObsId       = (observaciones.reduce((m, o) => Math.max(m, o.id), 0) || 0) + 1;
        let curVehId        = null;
        let delTarget       = null;
        let curObsFiltro    = 'todas';

        // ---------- Cargar vehículos desde la BD ----------
        async function cargarVehiculos() {
            try {
                const r = await fetch(`${API}/api/vehiculos`);
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const d = await r.json();
                if (!d.ok) throw new Error(d.error || 'Error del servidor');
                vehiculos = d.vehiculos.map(v => ({
                    id:          v.id,
                    eco:         v.no_economico,
                    marca:       v.marca,
                    linea:       v.linea,
                    modelo:      v.modelo,
                    color:       v.color,
                    serie:       v.no_serie,
                    placas:      v.placas,
                    tipo:        v.tipo || '',
                    capacidad:   v.capacidad != null ? Number(v.capacidad) : null,
                    combustible: v.combustible || '',
                    km:          v.km_actual || 0
                }));
                renderTabla();
            } catch (err) {
                console.error('Error cargando vehículos:', err);
                SIGEPAV.toast('No se pudo conectar al servidor.', 'error');
            }
        }

        const vistaLista    = document.getElementById('vista-lista');
        const vistaDetalle  = document.getElementById('vista-detalle');
        const tbody         = document.getElementById('tbody-vehiculos');
        const panelEdicion  = document.getElementById('panel-edicion');

        // ---------- KPIs ----------
        function actualizarKPIs() {
            const total = vehiculos.length;
            const obs   = observaciones.length;
            const pend  = observaciones.filter(o => (o.estado || '').toLowerCase() === 'pendiente').length;
            const costo = observaciones.reduce((s, o) => s + (Number(o.costo) || 0), 0);

            const setKPI = (id, valor) => {
                const el = document.getElementById(id);
                if (!el) return;
                el.setAttribute('data-valor', valor);
                el.classList.remove('animado');
                el.textContent = '0';
            };
            setKPI('kpi-total', total);
            setKPI('kpi-obs', obs);
            setKPI('kpi-pend', pend);
            const elCosto = document.getElementById('kpi-costo');
            if (elCosto) {
                elCosto.setAttribute('data-valor', Math.round(costo));
                elCosto.classList.remove('animado');
                elCosto.textContent = '$0';
            }
            SIGEPAV.animarNumeros(document.querySelector('.resumen-cards'));
        }

        // ---------- Tabla principal ----------
        function renderTabla() {
            if (!vehiculos.length) {
                tbody.innerHTML = `
                    <tr><td colspan="8">
                        <div class="estado-vacio">
                            <i class="fas fa-car"></i>
                            <p>Sin vehículos registrados.</p>
                        </div>
                    </td></tr>`;
                actualizarKPIs();
                return;
            }
            tbody.innerHTML = vehiculos.map(v => `
                <tr>
                    <td><span class="badge-eco">${v.eco || '—'}</span></td>
                    <td>${v.marca || ''}</td>
                    <td>${v.linea || ''}</td>
                    <td>${v.modelo || ''}</td>
                    <td>${v.color || ''}</td>
                    <td class="celda-mono">${v.serie || ''}</td>
                    <td><span class="badge-placas">${v.placas || ''}</span></td>
                    <td>
                        <div class="acciones-tabla">
                            <button class="btn-icono ver" title="Ver detalle" data-accion="ver" data-id="${v.id}"><i class="fas fa-eye"></i></button>
                            <button class="btn-icono editar" title="Editar" data-accion="editar" data-id="${v.id}"><i class="fas fa-pen"></i></button>
                            <button class="btn-icono eliminar" title="Eliminar" data-accion="eliminar" data-id="${v.id}"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                </tr>`).join('');
            actualizarKPIs();
        }

        tbody.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-accion]');
            if (!btn) return;
            const id = parseInt(btn.dataset.id, 10);
            switch (btn.dataset.accion) {
                case 'ver':      verDetalle(id); break;
                case 'editar':   abrirEdicion(id); break;
                case 'eliminar': pedirEliminacion(id); break;
            }
        });

        // ---------- Registrar (llama a la API) ----------
        document.getElementById('btn-registrar').addEventListener('click', async () => {
            const datos = {
                marca:      document.getElementById('r-marca').value.trim(),
                linea:      document.getElementById('r-linea').value.trim(),
                modelo:     document.getElementById('r-modelo').value.trim(),
                color:      document.getElementById('r-color').value.trim(),
                serie:      document.getElementById('r-serie').value.trim(),
                placas:     document.getElementById('r-placas').value.trim(),
                tipo:       document.getElementById('r-tipo').value,
                capacidad:  document.getElementById('r-cap').value.trim(),
                combustible:document.getElementById('r-comb').value,
                km_actual:  document.getElementById('r-km').value.trim() || 0
            };
            if (!datos.marca || !datos.linea || !datos.placas) {
                SIGEPAV.toast('Complete los campos obligatorios: marca, modelo y placas.', 'error');
                return;
            }
            if (!datos.combustible) {
                SIGEPAV.toast('Seleccione el tipo de combustible del vehículo.', 'error');
                document.getElementById('r-comb').focus();
                return;
            }
            try {
                const r = await fetch(`${API}/api/vehiculos`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(datos)
                });
                const d = await r.json();
                if (!d.ok) throw new Error(d.error || 'Error al registrar');
                SIGEPAV.toast('Vehículo registrado correctamente.', 'ok');
                ['r-marca','r-linea','r-modelo','r-color','r-serie','r-placas','r-km']
                    .forEach(id => { document.getElementById(id).value = ''; });
                document.getElementById('r-cap').value  = '';
                document.getElementById('r-tipo').value = '';
                document.getElementById('r-comb').value = '';
                await cargarVehiculos();
            } catch (err) {
                SIGEPAV.toast('Error: ' + err.message, 'error');
            }
        });

        // ---------- Edición ----------
        function abrirEdicion(id) {
            const v = vehiculos.find(x => x.id === id);
            if (!v) return;
            document.getElementById('e-id').value     = id;
            document.getElementById('e-marca').value  = v.marca || '';
            document.getElementById('e-linea').value  = v.linea || '';
            document.getElementById('e-modelo').value = v.modelo || '';
            document.getElementById('e-color').value  = v.color || '';
            document.getElementById('e-serie').value  = v.serie || '';
            document.getElementById('e-placas').value = v.placas || '';
            document.getElementById('e-eco').value    = v.eco || '';
            document.getElementById('e-tipo').value   = v.tipo || '';
            document.getElementById('e-cap').value    = v.capacidad != null ? v.capacidad : '';
            document.getElementById('e-comb').value   = v.combustible || '';
            document.getElementById('e-km').value     = v.km || 0;
            panelEdicion.classList.add('activo');
            panelEdicion.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        document.getElementById('btn-cerrar-edicion').addEventListener('click', () => {
            panelEdicion.classList.remove('activo');
        });
        document.getElementById('btn-nuevo').addEventListener('click', () => {
            panelEdicion.classList.remove('activo');
            document.getElementById('r-marca').focus();
        });

        document.getElementById('btn-guardar-edicion').addEventListener('click', async () => {
            const id = parseInt(document.getElementById('e-id').value, 10);
            const datos = {
                marca:      document.getElementById('e-marca').value.trim(),
                linea:      document.getElementById('e-linea').value.trim(),
                modelo:     document.getElementById('e-modelo').value.trim(),
                color:      document.getElementById('e-color').value.trim(),
                serie:      document.getElementById('e-serie').value.trim(),
                placas:     document.getElementById('e-placas').value.trim(),
                no_economico: document.getElementById('e-eco').value.trim(),
                tipo:       document.getElementById('e-tipo').value,
                capacidad:  document.getElementById('e-cap').value.trim(),
                combustible:document.getElementById('e-comb').value,
                km_actual:  parseInt(document.getElementById('e-km').value, 10) || 0
            };
            if (!datos.marca || !datos.linea || !datos.placas) {
                SIGEPAV.toast('Complete los campos obligatorios.', 'error');
                return;
            }
            if (!datos.combustible) {
                SIGEPAV.toast('Seleccione el tipo de combustible del vehículo.', 'error');
                document.getElementById('e-comb').focus();
                return;
            }
            try {
                const r = await fetch(`${API}/api/vehiculos/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(datos)
                });
                const d = await r.json();
                if (!d.ok) throw new Error(d.error || 'Error al guardar');
                SIGEPAV.toast('Vehículo actualizado.', 'ok');
                panelEdicion.classList.remove('activo');
                await cargarVehiculos();
            } catch (err) {
                SIGEPAV.toast('Error: ' + err.message, 'error');
            }
        });

        // ---------- Eliminar ----------
        function pedirEliminacion(id) {
            delTarget = id;
            SIGEPAV.confirmar({
                titulo: '¿Eliminar vehículo?',
                mensaje: 'Esta acción no se puede deshacer. Se eliminarán también todas sus observaciones.',
                onAceptar: async () => {
                    try {
                        const r = await fetch(`${API}/api/vehiculos/${delTarget}`, { method: 'DELETE' });
                        const d = await r.json();
                        if (!d.ok) throw new Error(d.error || 'Error al eliminar');
                        observaciones = observaciones.filter(o => o.vId !== delTarget);
                        SIGEPAV.storage.saveObs(observaciones);
                        delTarget = null;
                        SIGEPAV.toast('Vehículo eliminado.', 'ok');
                        await cargarVehiculos();
                    } catch (err) {
                        SIGEPAV.toast('Error: ' + err.message, 'error');
                    }
                }
            });
        }

        // ---------- Detalle ----------
        function verDetalle(id) {
            curVehId = id;
            const v = vehiculos.find(x => x.id === id);
            if (!v) return;

            document.getElementById('veh-hero').innerHTML = `
                <div class="vehiculo-hero-icono"><i class="fas fa-car"></i></div>
                <div class="vehiculo-hero-info">
                    <h2>${v.marca || ''} ${v.linea || ''} — ${v.modelo || ''}</h2>
                    <div class="vehiculo-hero-meta">
                        <span><i class="fas fa-tag"></i> No. Eco: ${v.eco || '—'}</span>
                        <span><i class="fas fa-id-card"></i> ${v.placas || '—'}</span>
                        <span><i class="fas fa-gas-pump"></i> ${v.combustible || '—'}</span>
                        <span><i class="fas fa-tachometer-alt"></i> ${(v.km || 0).toLocaleString()} km</span>
                    </div>
                </div>
                <span class="badge-activo">● ACTIVO</span>
            `;

            document.getElementById('obs-km').value = v.km || '';
            curObsFiltro = 'todas';
            document.querySelectorAll('.filtro-tab').forEach((b, i) => b.classList.toggle('activo', i === 0));
            refrescarStatsVehiculo();
            renderObsList();

            vistaLista.style.display = 'none';
            vistaDetalle.style.display = 'flex';
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        document.getElementById('btn-volver-lista').addEventListener('click', () => {
            vistaDetalle.style.display = 'none';
            vistaLista.style.display = 'flex';
        });

        function refrescarStatsVehiculo() {
            const obs = observaciones.filter(o => o.vId === curVehId);
            const pend  = obs.filter(o => (o.estado || '').toLowerCase() === 'pendiente').length;
            const costo = obs.reduce((s, o) => s + (Number(o.costo) || 0), 0);
            const fallas = {};
            obs.forEach(o => { fallas[o.tipo] = (fallas[o.tipo] || 0) + 1; });
            const top = Object.entries(fallas).sort((a, b) => b[1] - a[1])[0];

            document.getElementById('veh-stats').innerHTML = `
                <div class="card-resumen"><div class="card-icono"><i class="fas fa-clipboard-list"></i></div><div class="card-info"><span class="card-numero">${obs.length}</span><span class="card-etiqueta">Total observaciones</span></div></div>
                <div class="card-resumen"><div class="card-icono"><i class="fas fa-clock"></i></div><div class="card-info"><span class="card-numero">${pend}</span><span class="card-etiqueta">Pendientes</span></div></div>
                <div class="card-resumen"><div class="card-icono"><i class="fas fa-dollar-sign"></i></div><div class="card-info"><span class="card-numero">${SIGEPAV.fmtCur(costo)}</span><span class="card-etiqueta">Costo acumulado</span></div></div>
                <div class="card-resumen"><div class="card-icono"><i class="fas fa-tools"></i></div><div class="card-info"><span class="card-numero card-numero-pequeno">${top ? top[0] : '—'}</span><span class="card-etiqueta">Falla recurrente${top ? ` (${top[1]})` : ''}</span></div></div>
            `;
        }

        // ---------- Observaciones ----------
        document.getElementById('obs-estado').addEventListener('change', function () {
            const campo = document.getElementById('obs-res-field');
            campo.style.display = this.value === 'Resuelto' ? 'flex' : 'none';
            if (this.value !== 'Resuelto') document.getElementById('obs-res').value = '';
        });

        document.querySelectorAll('.filtro-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                curObsFiltro = btn.dataset.filtro;
                document.querySelectorAll('.filtro-tab').forEach(b => b.classList.remove('activo'));
                btn.classList.add('activo');
                renderObsList();
            });
        });

        document.getElementById('btn-guardar-obs').addEventListener('click', () => {
            const tipo = document.getElementById('obs-tipo').value;
            const desc = document.getElementById('obs-desc').value.trim();
            const sevEl = document.querySelector('input[name="obs-sev"]:checked');
            if (!tipo || !desc) {
                SIGEPAV.toast('Complete tipo y descripción.', 'error');
                return;
            }
            const now = new Date();
            const fecha = now.toLocaleDateString('es-MX') + ' ' +
                          now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
            const estado = document.getElementById('obs-estado').value;
            observaciones.push({
                id: nextObsId++,
                vId: curVehId,
                tipo,
                sev: sevEl ? sevEl.value : 'media',
                estado,
                desc,
                resolucion: estado === 'Resuelto' ? document.getElementById('obs-res').value.trim() : '',
                fecha,
                usuario: SIGEPAV.getSession()?.email || 'Useradmin',
                km: parseInt(document.getElementById('obs-km').value, 10) || 0,
                costo: parseFloat(document.getElementById('obs-costo').value) || 0
            });
            SIGEPAV.storage.saveObs(observaciones);
            ['obs-tipo','obs-km','obs-costo','obs-desc','obs-res']
                .forEach(id => { document.getElementById(id).value = ''; });
            document.getElementById('obs-estado').value = 'Pendiente';
            document.getElementById('obs-res-field').style.display = 'none';
            const sevMedia = document.getElementById('obs-sev-media');
            if (sevMedia) sevMedia.checked = true;
            refrescarStatsVehiculo();
            renderObsList();
            SIGEPAV.toast('Observación guardada.', 'ok');
        });

        function renderObsList() {
            let obs = observaciones.filter(o => o.vId === curVehId);
            if (curObsFiltro !== 'todas') {
                obs = obs.filter(o => (o.estado || '').toLowerCase() === curObsFiltro);
            }
            obs = obs.slice().reverse();
            const cont = document.getElementById('obs-list');
            if (!obs.length) {
                cont.innerHTML = `
                    <div class="estado-vacio">
                        <i class="fas fa-clipboard"></i>
                        <p>Sin observaciones.</p>
                    </div>`;
                return;
            }
            cont.innerHTML = obs.map(o => {
                const estadoCls = (o.estado || 'pendiente').toLowerCase().replace(/\s+/g, '-');
                return `
                <div class="observacion-card sev-${o.sev || 'media'}">
                    <div class="obs-header">
                        <span class="obs-tipo">${o.tipo}</span>
                        <span class="obs-severidad ${o.sev || 'media'}">${(o.sev || 'media').toUpperCase()}</span>
                        <span class="obs-estado obs-estado-${estadoCls}">${o.estado}</span>
                        <span class="obs-fecha">${o.fecha || ''}</span>
                    </div>
                    <p>${o.desc || ''}</p>
                    ${o.resolucion ? `<div class="obs-resolucion"><i class="fas fa-check"></i> Resolución: ${o.resolucion}</div>` : ''}
                    <div class="obs-detalles">
                        <span><i class="fas fa-user"></i> ${o.usuario || ''}</span>
                        <span><i class="fas fa-tachometer-alt"></i> ${(o.km || 0).toLocaleString()} km</span>
                        ${o.costo ? `<span><i class="fas fa-dollar-sign"></i> ${SIGEPAV.fmtCur(o.costo)}</span>` : ''}
                    </div>
                </div>`;
            }).join('');
        }

        // ---------- Init ----------
        cargarVehiculos();

        // FIX (req 6): clic en SIGEPAV / logo de la barra azul → vuelve al menú principal
        document.addEventListener('click', (e) => {
            const t = e.target.closest('.titulo-sistema, .titulo-sistema h1, .logo-barra');
            if (!t || !t.closest('.barra-superior')) return;
            window.location.href = 'index.html';
        });
        document.querySelectorAll('.barra-superior .titulo-sistema, .barra-superior .titulo-sistema h1, .barra-superior .logo-barra').forEach(el => {
            el.style.cursor = 'pointer';
            el.title = 'Volver al menú principal';
        });
    });
