/* ============================================================
   HISTORIAL DE CAMBIOS · SIGEPAV
   Bitácora completa con descarga PDF / Excel
   Audita: acciones del sistema, vales de combustible, km de comisiones
   ============================================================ */
(function () {
    'use strict';

    const PER_PAGE = 25;
    let paginaActual = 0;
    let totalRegistros = 0;
    let moduloFiltro = '';
    let buscarFiltro = '';
    let desdeFiltro  = '';
    let hastaFiltro  = '';
    let todosLosRegistros = [];

    /* ── helpers de badge ── */
    function clasificarAccion(accion = '') {
        const a = accion.toLowerCase();
        if (a.includes('crear') || a.includes('registr') || a.includes('alta') || a.includes('insert') || a.includes('creado'))
            return 'crear';
        if (a.includes('editar') || a.includes('actualiz') || a.includes('modific') || a.includes('update') || a.includes('configuraci'))
            return 'editar';
        if (a.includes('elimin') || a.includes('borr') || a.includes('delete') || a.includes('desactiv'))
            return 'eliminar';
        if (a.includes('login') || a.includes('acceso') || a.includes('autent') || a.includes('sesión') || a.includes('primer acceso'))
            return 'login';
        if (a.includes('finaliz') || a.includes('inici') || a.includes('comisi'))
            return 'comision';
        return 'otro';
    }

    const ICONOS = {
        crear:    'fa-plus-circle',
        editar:   'fa-pen',
        eliminar: 'fa-trash-alt',
        login:    'fa-sign-in-alt',
        comision: 'fa-route',
        otro:     'fa-info-circle'
    };

    const ETIQUETAS = {
        crear:    'Crear',
        editar:   'Editar',
        eliminar: 'Eliminar',
        login:    'Acceso',
        comision: 'Comisión',
        otro:     'Sistema'
    };

    const COLORES_BADGE = {
        crear:    '#16a34a',
        editar:   '#d97706',
        eliminar: '#dc2626',
        login:    '#2563eb',
        comision: '#7c3aed',
        otro:     '#64748b'
    };

    function formatFecha(str) {
        if (!str) return '—';
        const d = new Date(str);
        if (isNaN(d)) return str;
        return d.toLocaleString('es-MX', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }

    function fmt(str) {
        return d3Escape(String(str ?? '—'));
    }

    function d3Escape(s) {
        return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    /* ── Timeline ── */
    function renderTimeline(registros) {
        const tl = document.getElementById('timeline');
        const vacio = document.getElementById('hist-vacio');
        tl.innerHTML = '';

        if (!registros.length) {
            vacio.style.display = 'flex';
            return;
        }
        vacio.style.display = 'none';

        registros.forEach((r, i) => {
            const tipo = clasificarAccion(r.accion);
            const icono = ICONOS[tipo];
            const etiqueta = ETIQUETAS[tipo];
            const usuario = r.nombre
                ? `${r.nombre}${r.apellidos ? ' ' + r.apellidos : ''} &lt;${r.email || ''}&gt;`
                : 'Sistema';

            const div = document.createElement('div');
            div.className = 'timeline-item';
            div.style.animationDelay = `${i * 0.025}s`;
            div.innerHTML = `
                <div class="timeline-icono icono-${tipo}">
                    <i class="fas ${icono}"></i>
                </div>
                <div class="timeline-cuerpo">
                    <div class="timeline-cabecera">
                        <span class="timeline-accion badge-${tipo}">${etiqueta}</span>
                        ${r.modulo ? `<span class="timeline-modulo"><i class="fas fa-tag"></i> ${r.modulo}</span>` : ''}
                        <span class="timeline-fecha"><i class="fas fa-clock"></i> ${formatFecha(r.created_at)}</span>
                    </div>
                    <div class="timeline-descripcion">${d3Escape(r.accion)}</div>
                    <div class="timeline-usuario"><i class="fas fa-user"></i> ${usuario}
                        ${r.ip ? ` &nbsp;·&nbsp; <i class="fas fa-network-wired"></i> ${r.ip}` : ''}
                        ${r.entidad_id ? ` &nbsp;·&nbsp; <span style="color:#94a3b8;font-size:.78rem">ID entidad: ${r.entidad_id}</span>` : ''}
                    </div>
                </div>
            `;
            tl.appendChild(div);
        });
    }

    function actualizarKPIs(registros) {
        const crear    = registros.filter(r => clasificarAccion(r.accion) === 'crear').length;
        const editar   = registros.filter(r => clasificarAccion(r.accion) === 'editar').length;
        const eliminar = registros.filter(r => clasificarAccion(r.accion) === 'eliminar').length;
        document.getElementById('kpi-total').textContent   = totalRegistros;
        document.getElementById('kpi-crear').textContent   = crear;
        document.getElementById('kpi-editar').textContent  = editar;
        document.getElementById('kpi-eliminar').textContent = eliminar;
    }

    function filtrarYPaginar() {
        let filtrados = todosLosRegistros;
        if (buscarFiltro) {
            const q = buscarFiltro.toLowerCase();
            filtrados = filtrados.filter(r =>
                (r.accion  || '').toLowerCase().includes(q) ||
                (r.nombre  || '').toLowerCase().includes(q) ||
                (r.email   || '').toLowerCase().includes(q) ||
                (r.modulo  || '').toLowerCase().includes(q)
            );
        }
        if (desdeFiltro) {
            filtrados = filtrados.filter(r => r.created_at && r.created_at.slice(0,10) >= desdeFiltro);
        }
        if (hastaFiltro) {
            filtrados = filtrados.filter(r => r.created_at && r.created_at.slice(0,10) <= hastaFiltro);
        }

        const total = filtrados.length;
        const inicio = paginaActual * PER_PAGE;
        const pagina = filtrados.slice(inicio, inicio + PER_PAGE);
        renderTimeline(pagina);

        const paginacion = document.getElementById('hist-paginacion');
        const btnAnt = document.getElementById('btn-anterior');
        const btnSig = document.getElementById('btn-siguiente');
        const info   = document.getElementById('pag-info');
        const totalPags = Math.max(1, Math.ceil(total / PER_PAGE));
        paginacion.style.display = total > PER_PAGE ? 'flex' : 'none';
        btnAnt.disabled = paginaActual === 0;
        btnSig.disabled = paginaActual >= totalPags - 1;
        info.textContent = `Página ${paginaActual + 1} de ${totalPags} (${total} reg.)`;
    }

    async function cargarBitacora() {
        const cargando = document.getElementById('hist-cargando');
        cargando.style.display = 'flex';
        document.getElementById('hist-vacio').style.display = 'none';
        document.getElementById('timeline').innerHTML = '';

        try {
            const p = new URLSearchParams({ limit: 500 });
            if (moduloFiltro) p.set('modulo', moduloFiltro);
            const resp = await fetch(`${window.API_BASE}/api/bitacora?${p}`);
            const data = await resp.json();
            if (!data.ok) throw new Error(data.error || 'Error del servidor');

            todosLosRegistros = data.registros || [];
            totalRegistros    = data.total || todosLosRegistros.length;
            paginaActual = 0;
            actualizarKPIs(todosLosRegistros);
            filtrarYPaginar();
        } catch (err) {
            console.warn('[historial] API no disponible:', err.message);
            todosLosRegistros = [];
            totalRegistros = 0;
            actualizarKPIs([]);
            filtrarYPaginar();
            document.getElementById('timeline').innerHTML = `
                <div style="padding:24px;text-align:center;color:#c94545">
                    <i class="fas fa-exclamation-triangle" style="font-size:1.5rem;display:block;margin-bottom:8px"></i>
                    No se pudo cargar la bitácora: ${err.message}
                </div>`;
        } finally {
            cargando.style.display = 'none';
        }
    }

    /* ============================================================
       DESCARGA PDF — generado con HTML+CSS → window.print()
       Incluye: acciones auditadas, vales y km por vehículo
    ============================================================ */
    async function descargarPDF() {
        const btn = document.getElementById('btn-descargar-pdf');
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...';
        btn.disabled = true;

        try {
            const data = await fetchExportData();
            const html = generarHTMLReporte(data, 'pdf');
            const w = window.open('', '_blank');
            w.document.write(html);
            w.document.close();
            setTimeout(() => { w.focus(); w.print(); }, 400);
        } catch (err) {
            alert('Error al generar PDF: ' + err.message);
        } finally {
            btn.innerHTML = orig;
            btn.disabled = false;
        }
    }

    /* ============================================================
       DESCARGA EXCEL — genera un .xlsx real usando SheetJS (CDN)
       o cae a CSV si SheetJS no está disponible
    ============================================================ */
    async function descargarExcel() {
        const btn = document.getElementById('btn-descargar-excel');
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...';
        btn.disabled = true;

        try {
            const data = await fetchExportData();
            generarExcel(data);
        } catch (err) {
            alert('Error al generar Excel: ' + err.message);
        } finally {
            btn.innerHTML = orig;
            btn.disabled = false;
        }
    }

    async function fetchExportData() {
        const p = new URLSearchParams();
        if (moduloFiltro) p.set('modulo', moduloFiltro);
        if (desdeFiltro)  p.set('desde',  desdeFiltro);
        if (hastaFiltro)  p.set('hasta',  hastaFiltro);
        const resp = await fetch(`${window.API_BASE}/api/bitacora/exportar?${p}`);
        if (!resp.ok) throw new Error('Error del servidor al exportar');
        const data = await resp.json();
        if (!data.ok) throw new Error(data.error || 'Error al obtener datos');
        return data;
    }

    /* ── Generar HTML para PDF ── */
    function generarHTMLReporte(data, modo) {
        const ahora = new Date().toLocaleString('es-MX', {
            day:'2-digit', month:'long', year:'numeric',
            hour:'2-digit', minute:'2-digit'
        });

        const filasAuditoria = (data.bitacora || []).map(r => {
            const tipo = clasificarAccion(r.accion);
            const usuario = r.nombre
                ? `${r.nombre}${r.apellidos ? ' ' + r.apellidos : ''}`
                : 'Sistema';
            return `<tr>
                <td>${r.id}</td>
                <td>${formatFecha(r.created_at)}</td>
                <td><span class="badge badge-${tipo}">${ETIQUETAS[tipo]}</span></td>
                <td>${esc(r.modulo || '—')}</td>
                <td>${esc(r.accion)}</td>
                <td>${esc(usuario)}</td>
                <td>${esc(r.email || '—')}</td>
                <td>${esc(r.ip || '—')}</td>
            </tr>`;
        }).join('');

        const filasVales = (data.vales || []).map(v => {
            const veh = [v.no_economico, v.marca, v.linea, v.modelo].filter(Boolean).join(' ');
            const conductor = v.conductor_nombre
                ? `${v.conductor_nombre}${v.conductor_apellidos ? ' ' + v.conductor_apellidos : ''}`
                : '—';
            const kmRec = Number(v.km_recorridos) || 0;
            return `<tr>
                <td>${v.vale_id}</td>
                <td>${esc(v.no_vale || '—')}</td>
                <td>${esc(v.folio || '—')}</td>
                <td>${v.litros != null ? Number(v.litros).toFixed(2) : '—'} L</td>
                <td>$${v.precio_litro != null ? Number(v.precio_litro).toFixed(2) : '—'}</td>
                <td>$${v.cantidad != null ? Number(v.cantidad).toFixed(2) : '—'}</td>
                <td><span class="badge-estado-vale ${v.vale_estado}">${esc(v.vale_estado || '—')}</span></td>
                <td>${formatFecha(v.vale_fecha)}</td>
                <td>${esc(veh || '—')}</td>
                <td>${esc(conductor)}</td>
                <td>${esc(v.lugar_destino || '—')}</td>
                <td>${v.km_inicial != null ? Number(v.km_inicial).toLocaleString() : '—'}</td>
                <td>${v.km_final != null ? Number(v.km_final).toLocaleString() : '—'}</td>
                <td><strong>${kmRec > 0 ? kmRec.toLocaleString() + ' km' : '—'}</strong></td>
            </tr>`;
        }).join('');

        const filasKm = (data.kmVehiculos || []).map(v => {
            const nombre = [v.marca, v.linea, v.modelo].filter(Boolean).join(' ');
            const kmRec = Number(v.km_recorridos_sistema) || 0;
            const kmActual = Number(v.km_actual) || 0;
            // Alertas de mantenimiento: aceite cada 5000 km, frenos cada 15000
            const alertaAceite = kmRec > 0 && (kmRec % 5000) > 4000
                ? '⚠ Cambio de aceite próximo' : '';
            const alertaFreno = kmRec > 0 && (kmRec % 15000) > 14000
                ? '⚠ Revisión de frenos próxima' : '';
            const alertas = [alertaAceite, alertaFreno].filter(Boolean).join(' · ') || '✓ Sin alertas';
            return `<tr>
                <td>${esc(v.no_economico || '—')}</td>
                <td>${esc(nombre || '—')}</td>
                <td>${esc(v.placas || '—')}</td>
                <td><strong>${kmActual.toLocaleString()} km</strong></td>
                <td><strong>${kmRec.toLocaleString()} km</strong></td>
                <td>${v.total_comisiones}</td>
                <td class="${[alertaAceite, alertaFreno].filter(Boolean).length ? 'alerta-celda' : ''}">${alertas}</td>
            </tr>`;
        }).join('');

        return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Bitácora SIGEPAV — ${ahora}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1e293b; background: #fff; }
  @page { size: A4 landscape; margin: 1.2cm; }
  @media print { body { font-size: 9px; } .no-print { display: none; } }

  .portada {
    background: linear-gradient(135deg, #002b60 0%, #006dc8 100%);
    color: #fff; padding: 36px 40px; margin-bottom: 28px; border-radius: 8px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .portada h1 { font-size: 24px; font-weight: 900; letter-spacing: -0.03em; }
  .portada p  { font-size: 12px; opacity: .8; margin-top: 4px; }
  .portada .meta { text-align: right; font-size: 11px; opacity: .9; }

  .seccion { margin-bottom: 32px; }
  .seccion-titulo {
    font-size: 13px; font-weight: 800; color: #002b60;
    padding: 8px 12px; background: #f0f7ff;
    border-left: 4px solid #006dc8; border-radius: 4px;
    margin-bottom: 12px; display: flex; align-items: center; gap: 8px;
  }
  .seccion-titulo i { color: #006dc8; }

  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  thead tr { background: #002b60; color: #fff; }
  thead th { padding: 6px 8px; text-align: left; font-weight: 700; white-space: nowrap; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  tbody td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  tbody tr:hover { background: #eff6ff; }

  .badge {
    display: inline-block; padding: 2px 7px; border-radius: 10px;
    font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .3px;
  }
  .badge-crear    { background: #dcfce7; color: #166534; }
  .badge-editar   { background: #fef3c7; color: #92400e; }
  .badge-eliminar { background: #fee2e2; color: #991b1b; }
  .badge-login    { background: #dbeafe; color: #1e40af; }
  .badge-comision { background: #ede9fe; color: #5b21b6; }
  .badge-otro     { background: #f1f5f9; color: #475569; }

  .badge-estado-vale { display: inline-block; padding: 2px 6px; border-radius: 8px; font-size: 9px; font-weight: 700; }
  .badge-estado-vale.publicado  { background: #dcfce7; color: #166534; }
  .badge-estado-vale.usado      { background: #dbeafe; color: #1e40af; }
  .badge-estado-vale.borrador   { background: #f1f5f9; color: #475569; }

  .alerta-celda { color: #b45309; font-weight: 600; }

  .resumen-kpi {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px;
  }
  .kpi-box {
    background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;
    padding: 14px 16px; text-align: center;
  }
  .kpi-box .num { font-size: 22px; font-weight: 900; color: #002b60; }
  .kpi-box .lbl { font-size: 10px; color: #64748b; margin-top: 2px; }

  .btn-imprimir {
    position: fixed; bottom: 28px; right: 28px;
    background: linear-gradient(135deg,#002b60,#006dc8); color: #fff;
    border: none; padding: 14px 22px; border-radius: 50px; font-size: 14px;
    font-weight: 700; cursor: pointer; box-shadow: 0 4px 20px rgba(0,43,96,.35);
    display: flex; align-items: center; gap: 8px; z-index: 999;
  }
  .btn-imprimir:hover { opacity: .92; }
</style>
</head>
<body>

<button class="btn-imprimir no-print" onclick="window.print()">
  🖨 Imprimir / Guardar PDF
</button>

<div class="portada">
  <div>
    <h1>📋 Bitácora de Auditoría</h1>
    <p>SIGEPAV · Sistema de Gestión del Parque Vehicular</p>
    <p style="margin-top:6px;opacity:.7;">${desdeFiltro || hastaFiltro
        ? `Período: ${desdeFiltro || 'inicio'} → ${hastaFiltro || 'hoy'}`
        : 'Todos los registros'}
    ${moduloFiltro ? ` · Módulo: ${moduloFiltro}` : ''}</p>
  </div>
  <div class="meta">
    <div style="font-size:14px;font-weight:700;">Generado:</div>
    <div>${ahora}</div>
  </div>
</div>

<!-- KPIs resumen -->
<div class="resumen-kpi">
  <div class="kpi-box">
    <div class="num">${(data.bitacora||[]).length}</div>
    <div class="lbl">Acciones auditadas</div>
  </div>
  <div class="kpi-box">
    <div class="num">${(data.vales||[]).length}</div>
    <div class="lbl">Vales de combustible</div>
  </div>
  <div class="kpi-box">
    <div class="num">${(data.vales||[]).reduce((s,v)=>s+Number(v.km_recorridos||0),0).toLocaleString()} km</div>
    <div class="lbl">KM recorridos en vales</div>
  </div>
  <div class="kpi-box">
    <div class="num">${(data.kmVehiculos||[]).length}</div>
    <div class="lbl">Vehículos activos</div>
  </div>
</div>

<!-- SECCIÓN 1: Bitácora de acciones -->
<div class="seccion">
  <div class="seccion-titulo"><i class="fas fa-history"></i> Bitácora de acciones del sistema</div>
  <table>
    <thead>
      <tr>
        <th>#</th><th>Fecha y hora</th><th>Tipo</th><th>Módulo</th>
        <th>Acción</th><th>Usuario</th><th>Correo</th><th>IP</th>
      </tr>
    </thead>
    <tbody>${filasAuditoria || '<tr><td colspan="8" style="text-align:center;color:#94a3b8">Sin registros</td></tr>'}</tbody>
  </table>
</div>

<!-- SECCIÓN 2: Vales de combustible con KM -->
<div class="seccion">
  <div class="seccion-titulo"><i class="fas fa-gas-pump"></i> Vales de combustible — Kilómetros iniciales y finales</div>
  <table>
    <thead>
      <tr>
        <th>ID</th><th>No. Vale</th><th>Folio</th><th>Litros</th><th>Precio/L</th><th>Total</th>
        <th>Estado</th><th>Fecha</th><th>Vehículo</th><th>Conductor</th>
        <th>Destino</th><th>KM Inicial</th><th>KM Final</th><th>KM Recorridos</th>
      </tr>
    </thead>
    <tbody>${filasVales || '<tr><td colspan="14" style="text-align:center;color:#94a3b8">Sin vales registrados</td></tr>'}</tbody>
  </table>
</div>

<!-- SECCIÓN 3: KM totales por vehículo -->
<div class="seccion">
  <div class="seccion-titulo"><i class="fas fa-tachometer-alt"></i> Kilómetros recorridos por vehículo — Indicadores de mantenimiento</div>
  <table>
    <thead>
      <tr>
        <th>No. Eco.</th><th>Vehículo</th><th>Placas</th>
        <th>KM Actual (odómetro)</th><th>KM Recorridos en sistema</th>
        <th>No. comisiones</th><th>Alertas de mantenimiento</th>
      </tr>
    </thead>
    <tbody>${filasKm || '<tr><td colspan="7" style="text-align:center;color:#94a3b8">Sin datos de vehículos</td></tr>'}</tbody>
  </table>
  <p style="margin-top:10px;font-size:9px;color:#94a3b8;">
    * Alerta aceite: ≥ 4,000 km del próximo intervalo de 5,000 km.
    Alerta frenos: ≥ 14,000 km del próximo intervalo de 15,000 km.
  </p>
</div>

<div style="text-align:center;margin-top:28px;padding-top:12px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:9px;">
  SIGEPAV · Sistema de Gestión del Parque Vehicular · ${ahora}
</div>

</body></html>`;
    }

    function esc(s) {
        return String(s ?? '—').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    /* ── Generar Excel (CSV con separador para Excel) ── */
    function generarExcel(data) {
        const BOM = '\uFEFF';
        const filas = [];

        // Hoja 1: Bitácora
        filas.push(['=== BITÁCORA DE ACCIONES ===']);
        filas.push(['#','Fecha y hora','Tipo','Módulo','Acción','Usuario','Apellidos','Correo','IP']);
        (data.bitacora || []).forEach(r => {
            filas.push([
                r.id,
                formatFecha(r.created_at),
                ETIQUETAS[clasificarAccion(r.accion)],
                r.modulo || '',
                r.accion,
                r.nombre || 'Sistema',
                r.apellidos || '',
                r.email || '',
                r.ip || ''
            ]);
        });

        filas.push([]);
        filas.push(['=== VALES DE COMBUSTIBLE — KILÓMETROS ===']);
        filas.push(['ID','No. Vale','Folio','Litros','Precio/L','Total $','Estado','Fecha',
            'Vehículo','No. Eco.','Placas','Conductor','Destino','KM Inicial','KM Final','KM Recorridos']);
        (data.vales || []).forEach(v => {
            const veh = [v.marca, v.linea, v.modelo].filter(Boolean).join(' ');
            const conductor = v.conductor_nombre
                ? `${v.conductor_nombre}${v.conductor_apellidos ? ' ' + v.conductor_apellidos : ''}` : '';
            filas.push([
                v.vale_id, v.no_vale || '', v.folio || '',
                v.litros != null ? Number(v.litros).toFixed(2) : '',
                v.precio_litro != null ? Number(v.precio_litro).toFixed(2) : '',
                v.cantidad != null ? Number(v.cantidad).toFixed(2) : '',
                v.vale_estado || '',
                formatFecha(v.vale_fecha),
                veh, v.no_economico || '', v.placas || '',
                conductor,
                v.lugar_destino || '',
                v.km_inicial ?? '', v.km_final ?? '',
                Number(v.km_recorridos) || 0
            ]);
        });

        filas.push([]);
        filas.push(['=== KILÓMETROS POR VEHÍCULO — INDICADORES DE MANTENIMIENTO ===']);
        filas.push(['No. Eco.','Vehículo','Placas','KM Actual (odómetro)',
            'KM Recorridos en sistema','No. comisiones',
            'Alerta aceite (cada 5,000 km)','Alerta frenos (cada 15,000 km)']);
        (data.kmVehiculos || []).forEach(v => {
            const nombre = [v.marca, v.linea, v.modelo].filter(Boolean).join(' ');
            const kmRec = Number(v.km_recorridos_sistema) || 0;
            const alertaAceite  = kmRec > 0 && (kmRec % 5000)  > 4000  ? 'PRÓXIMO' : 'OK';
            const alertaFreno   = kmRec > 0 && (kmRec % 15000) > 14000 ? 'PRÓXIMO' : 'OK';
            filas.push([
                v.no_economico || '', nombre, v.placas || '',
                Number(v.km_actual) || 0,
                kmRec,
                v.total_comisiones,
                alertaAceite,
                alertaFreno
            ]);
        });

        const csv = filas.map(row =>
            row.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')
        ).join('\r\n');

        const fecha = new Date().toISOString().slice(0,10);
        const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bitacora-sigepav-${fecha}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /* ── Navbar ── */
    function initNavbar() {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn && !logoutBtn._guardBound) {
            logoutBtn.onclick = () => {
                try { sessionStorage.removeItem('sigepav_usuario'); } catch (e) {}
                window.location.href = 'index.html';
            };
        }
    }

    /* ── Eventos ── */
    document.addEventListener('DOMContentLoaded', () => {
        initNavbar();
        cargarBitacora();

        document.getElementById('btn-filtrar').addEventListener('click', () => {
            moduloFiltro = document.getElementById('filtro-modulo').value;
            buscarFiltro = document.getElementById('filtro-buscar').value.trim();
            desdeFiltro  = document.getElementById('filtro-desde').value;
            hastaFiltro  = document.getElementById('filtro-hasta').value;
            paginaActual = 0;
            cargarBitacora();
        });

        document.getElementById('btn-limpiar').addEventListener('click', () => {
            document.getElementById('filtro-modulo').value = '';
            document.getElementById('filtro-buscar').value = '';
            document.getElementById('filtro-desde').value  = '';
            document.getElementById('filtro-hasta').value  = '';
            moduloFiltro = buscarFiltro = desdeFiltro = hastaFiltro = '';
            paginaActual = 0;
            cargarBitacora();
        });

        document.getElementById('filtro-buscar').addEventListener('input', () => {
            buscarFiltro = document.getElementById('filtro-buscar').value.trim();
            paginaActual = 0;
            filtrarYPaginar();
        });

        document.getElementById('btn-anterior').addEventListener('click', () => {
            if (paginaActual > 0) { paginaActual--; filtrarYPaginar(); }
        });

        document.getElementById('btn-siguiente').addEventListener('click', () => {
            paginaActual++;
            filtrarYPaginar();
        });

        document.getElementById('btn-descargar-pdf').addEventListener('click', descargarPDF);
        document.getElementById('btn-descargar-excel').addEventListener('click', descargarExcel);
    });
})();
