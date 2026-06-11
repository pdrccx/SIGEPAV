/* ============================================================
   EXPEDIENTE DIGITAL VEHICULAR · SIGEPAV
   ============================================================
   Lógica del módulo:
     · Catálogo mock de vehículos (sustituible por fetch a API)
     · Cambio dinámico de la tarjeta hero al seleccionar vehículo
     · Drag & Drop de archivos sobre el dropzone
     · Modal para subir documentos (validación, vista previa)
     · Render del listado de documentos (con icono por tipo,
       indicador de vencimiento, contador, espacio usado)
     · Eliminación visual + actualización de KPIs
   ============================================================ */

(function () {
    'use strict';

    /* ──────────────────────────────────────────────────────────
       1. CATÁLOGO DE VEHÍCULOS (cargado desde /api/vehiculos)
       Se usa un mock como fallback si el servidor no responde.
       ────────────────────────────────────────────────────────── */
    let VEHICULOS = [];

    const VEHICULOS_MOCK = [
        { id: 1, nombre: 'Chevrolet Chevy Luv', modelo: 2008, eco: '001', placas: 'ZAC-2345-B', niv: 'KL1TJ52628B123456', descripcionBase: 'Pickup ligera asignada a mantenimiento.' },
        { id: 2, nombre: 'Nissan Versa',         modelo: 2019, eco: '007', placas: 'ZAC-1234-A', niv: '3N1CN7AP8KL123456', descripcionBase: 'Sedán institucional para comisiones académicas.' },
        { id: 3, nombre: 'Nissan NP300',          modelo: 2020, eco: '012', placas: 'ZAC-5678-C', niv: '3N6CD33A8LK987654', descripcionBase: 'Pickup doble cabina – traslado de equipos.' },
        { id: 4, nombre: 'Kia Rio',               modelo: 2021, eco: '015', placas: 'ZAC-9012-D', niv: 'KNADM5A37M6234567', descripcionBase: 'Sedán compacto para comisiones cortas.' }
    ];

    async function cargarVehiculos() {
        try {
            const base = (window.API_BASE || (window.location && window.location.origin ? window.location.origin : 'http://localhost:3000'));
            const resp = await fetch(`${base}/api/vehiculos`);
            const data = await resp.json();
            if (data.ok && Array.isArray(data.vehiculos)) {
                VEHICULOS = data.vehiculos.map(v => ({
                    id:             v.id,
                    nombre:         `${v.marca} ${v.linea}`.trim(),
                    modelo:         v.modelo,
                    eco:            v.no_economico,
                    placas:         v.placas,
                    niv:            v.no_serie || '—',
                    descripcionBase: `${v.tipo ? v.tipo.charAt(0).toUpperCase() + v.tipo.slice(1) : 'Vehículo'} — ${v.color || ''} · ${v.combustible || 'Gasolina'}`
                }));
            } else {
                throw new Error(data.error || 'Respuesta inválida');
            }
        } catch (e) {
            console.warn('[Expediente] API no disponible:', e.message);
            VEHICULOS = [];
        }
    }

    /* ──────────────────────────────────────────────────────────
       2. DOCUMENTOS DE EJEMPLO POR VEHÍCULO
       Cada vehículo tiene sus propios documentos.
       Estructura del documento:
         { id, nombre, tipo, tamañoBytes, fecha, vencimiento? }
       'vencimiento' puede ser null si no aplica (p.ej. fotos).
       ────────────────────────────────────────────────────────── */
    const documentosMock = {};   // caché local (se puebla al seleccionar vehículo)

    /* ──────────────────────────────────────────────────────────
       3. ESTADO DE LA APLICACIÓN
       ────────────────────────────────────────────────────────── */
    const estado = {
        vehiculoActualId: null,       // se asigna al cargar vehículos desde la API
        archivoSeleccionado: null    // archivo elegido en el modal
    };

    /* ──────────────────────────────────────────────────────────
       4. REFERENCIAS DEL DOM
       ────────────────────────────────────────────────────────── */
    const $ = (id) => document.getElementById(id);

    const els = {
        // Hero
        vehNombre:  $('exp-veh-nombre'),
        vehEco:     $('exp-veh-eco'),
        vehPlacas:  $('exp-veh-placas'),
        vehNiv:     $('exp-veh-niv'),
        // KPIs
        kpiTotal:        $('kpi-total'),
        kpiEspacio:      $('kpi-espacio'),
        kpiVencer:       $('kpi-vencer'),
        kpiActualizado:  $('kpi-actualizado'),
        // Controles
        selectVeh:    $('select-vehiculo'),
        descripcion:  $('exp-descripcion'),
        // Dropzone
        dropzone:     $('dropzone'),
        // Listado
        docsGrid:     $('exp-docs-grid'),
        docsContador: $('exp-docs-contador'),
        // Modal
        modal:        $('modal-subir'),
        btnCerrarModal:   $('btn-modal-cerrar'),
        btnCancelarModal: $('btn-modal-cancelar'),
        btnSubirModal:    $('btn-modal-subir'),
        mTipo:        $('m-tipo'),
        mEmision:     $('m-emision'),
        mVencimiento: $('m-vencimiento'),
        mArchivo:     $('m-archivo'),
        fileZona:     $('exp-file-zona'),
        fileTexto:    $('exp-file-texto')
    };

    /* ──────────────────────────────────────────────────────────
       5. UTILIDADES
       ────────────────────────────────────────────────────────── */

    // Formato bytes → KB/MB legibles
    function formatearTamaño(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    // Formato fecha YYYY-MM-DD → DD/MM/YYYY
    function formatearFecha(s) {
        if (!s) return '—';
        const [y, m, d] = s.split('-');
        return `${d}/${m}/${y}`;
    }

    // Diferencia en días entre HOY y una fecha ISO. Negativo si está vencido.
    function diasHasta(fechaIso) {
        if (!fechaIso) return null;
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const fecha = new Date(fechaIso + 'T00:00:00');
        const ms = fecha - hoy;
        return Math.round(ms / 86400000);
    }

    // Devuelve el estado de vencimiento de un documento.
    function calcularVencimiento(doc) {
        if (!doc.vencimiento) {
            return { clase: 'sinfecha', texto: 'Sin vencimiento', icono: 'fa-infinity' };
        }
        const dias = diasHasta(doc.vencimiento);
        if (dias < 0) {
            return { clase: 'vencido', texto: `Vencido hace ${Math.abs(dias)} días`, icono: 'fa-circle-xmark' };
        }
        if (dias <= 30) {
            return { clase: 'proximo', texto: `Vence en ${dias} días`, icono: 'fa-triangle-exclamation' };
        }
        return { clase: 'vigente', texto: `Vigente · ${dias} días restantes`, icono: 'fa-circle-check' };
    }

    // Icono FontAwesome según extensión del archivo
    function iconoPorTipo(tipo) {
        const map = {
            pdf:  { icono: 'fa-file-pdf',   clase: 'pdf'  },
            docx: { icono: 'fa-file-word',  clase: 'docx' },
            img:  { icono: 'fa-file-image', clase: 'img'  }
        };
        return map[tipo] || { icono: 'fa-file', clase: 'otro' };
    }

    // Detecta el tipo lógico a partir de la extensión
    function detectarTipo(nombreArchivo) {
        const ext = nombreArchivo.toLowerCase().split('.').pop();
        if (ext === 'pdf')                         return 'pdf';
        if (['jpg','jpeg','png'].includes(ext))    return 'img';
        if (ext === 'docx')                        return 'docx';
        return 'otro';
    }

    // Alerta — usa SIGEPAV.toast si está disponible; si no, un toast propio.
    function alerta(mensaje, tipo) {
        if (window.SIGEPAV && typeof window.SIGEPAV.toast === 'function') {
            window.SIGEPAV.toast(mensaje, tipo === 'error' ? 'error' : 'ok');
            return;
        }
        // Fallback: toast minimalista
        let el = document.getElementById('exp-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'exp-toast';
            el.style.cssText = `
                position: fixed; bottom: 24px; left: 50%;
                transform: translateX(-50%); padding: 0.8rem 1.4rem;
                border-radius: 10px; color: #fff; font-weight: 600;
                font-size: 0.9rem; z-index: 3000; opacity: 0;
                transition: opacity 0.25s, transform 0.25s;
                box-shadow: 0 8px 24px rgba(0,0,0,0.2);`;
            document.body.appendChild(el);
        }
        el.textContent = mensaje;
        el.style.background = tipo === 'error' ? '#dc2626'
                            : tipo === 'info'  ? '#2563eb'
                            : '#059669';
        el.style.opacity = '1';
        el.style.transform = 'translateX(-50%) translateY(0)';
        clearTimeout(el._t);
        el._t = setTimeout(() => { el.style.opacity = '0'; }, 2800);
    }

    /* ──────────────────────────────────────────────────────────
       6. RENDER
       ────────────────────────────────────────────────────────── */

    // 6.1 Llena el combobox de vehículos
    function renderSelect() {
        els.selectVeh.innerHTML = VEHICULOS.map(v =>
            `<option value="${v.id}" ${v.id === estado.vehiculoActualId ? 'selected' : ''}>
                ${v.nombre}${v.modelo ? ' - ' + v.modelo : ''}
             </option>`
        ).join('');
    }

    // 6.2 Actualiza la tarjeta hero con los datos del vehículo actual
    function renderHero() {
        const v = VEHICULOS.find(x => x.id === estado.vehiculoActualId);
        if (!v) return;
        els.vehNombre.textContent = `${v.nombre} - ${v.modelo}`;
        els.vehEco.textContent    = v.eco;
        els.vehPlacas.textContent = v.placas;
        els.vehNiv.textContent    = v.niv;
        // También actualizamos la descripción base si está vacía
        if (!els.descripcion.value.trim()) {
            els.descripcion.placeholder =
                `Ej. ${v.descripcionBase}`;
        }
    }

    // 6.3 Render del listado de documentos
    function renderDocumentos() {
        const docs = documentosMock[estado.vehiculoActualId] || [];

        if (docs.length === 0) {
            els.docsGrid.innerHTML = `
                <div class="exp-vacio">
                    <i class="fas fa-folder-open"></i>
                    <p><strong>Aún no hay documentos cargados</strong></p>
                    <p style="font-size:0.85rem;">Arrastra un archivo o haz clic en "Subir nuevo documento" para comenzar.</p>
                </div>`;
        } else {
            els.docsGrid.innerHTML = docs.map(doc => {
                const ic  = iconoPorTipo(doc.tipo);
                const ven = calcularVencimiento(doc);
                return `
                <article class="exp-doc-card" data-id="${doc.id}">
                    <div class="exp-doc-cabecera">
                        <div class="exp-doc-icono ${ic.clase}">
                            <i class="fas ${ic.icono}"></i>
                        </div>
                        <div class="exp-doc-titulo">
                            <p class="exp-doc-nombre" title="${doc.nombre}">${doc.nombre}</p>
                            <div class="exp-doc-meta">
                                <span><i class="fas fa-weight-hanging"></i> ${formatearTamaño(doc.tamañoBytes)}</span>
                                <span><i class="fas fa-calendar"></i> ${formatearFecha(doc.fecha)}</span>
                            </div>
                        </div>
                    </div>
                    <span class="exp-doc-vencimiento ${ven.clase}">
                        <i class="fas ${ven.icono}"></i> ${ven.texto}
                    </span>
                    <div class="exp-doc-acciones">
                        <button class="exp-doc-btn ver"       data-accion="ver"       data-id="${doc.id}">
                            <i class="fas fa-eye"></i> Ver
                        </button>
                        <button class="exp-doc-btn descargar" data-accion="descargar" data-id="${doc.id}">
                            <i class="fas fa-download"></i> Descargar
                        </button>
                        <button class="exp-doc-btn eliminar"  data-accion="eliminar"  data-id="${doc.id}">
                            <i class="fas fa-trash"></i> Eliminar
                        </button>
                    </div>
                </article>`;
            }).join('');
        }
        renderKPIs();
    }

    // 6.4 KPIs: total, espacio usado, por vencer, última actualización
    function renderKPIs() {
        const docs = documentosMock[estado.vehiculoActualId] || [];

        // Total
        els.kpiTotal.textContent = docs.length;

        // Espacio total
        const bytes = docs.reduce((s, d) => s + (d.tamañoBytes || 0), 0);
        els.kpiEspacio.textContent = formatearTamaño(bytes);

        // Por vencer (vencidos + próximos 30 días)
        const porVencer = docs.filter(d => {
            if (!d.vencimiento) return false;
            const dias = diasHasta(d.vencimiento);
            return dias <= 30;        // incluye vencidos (dias negativos)
        }).length;
        els.kpiVencer.textContent = porVencer;

        // Última actualización (fecha más reciente entre los documentos)
        if (docs.length === 0) {
            els.kpiActualizado.textContent = '—';
        } else {
            const masReciente = docs
                .map(d => d.fecha)
                .filter(Boolean)
                .sort()
                .pop();
            els.kpiActualizado.textContent = formatearFecha(masReciente);
        }

        // Contador encima del grid
        els.docsContador.textContent =
            docs.length === 1 ? '1 documento' : `${docs.length} documentos`;
    }

    /* ──────────────────────────────────────────────────────────
       7. ACCIONES SOBRE DOCUMENTOS
       ────────────────────────────────────────────────────────── */

    function accionVer(id) {
        const doc = (documentosMock[estado.vehiculoActualId] || []).find(d => d.id === id);
        if (!doc) return;
        alerta(`Vista previa: ${doc.nombre}`, 'info');
        // En producción aquí abriríamos un visor de PDF / imagen.
    }

    function accionDescargar(id) {
        const doc = (documentosMock[estado.vehiculoActualId] || []).find(d => d.id === id);
        if (!doc) return;
        alerta(`Descargando ${doc.nombre}…`, 'ok');
        // En producción: window.location = `/api/expediente/${id}/descargar`;
    }

    function accionEliminar(id) {
        const doc = (documentosMock[estado.vehiculoActualId] || []).find(d => d.id === id);
        if (!doc) return;
        if (!confirm(`¿Eliminar el documento "${doc.nombre}"?\nEsta acción no se puede deshacer.`)) return;

        // Animación de salida antes de remover
        const card = els.docsGrid.querySelector(`[data-id="${id}"]`);
        if (card) {
            card.style.transition = 'transform 0.25s, opacity 0.25s';
            card.style.transform  = 'translateX(-30px)';
            card.style.opacity    = '0';
        }
        setTimeout(() => {
            documentosMock[estado.vehiculoActualId] =
                documentosMock[estado.vehiculoActualId].filter(d => d.id !== id);
            renderDocumentos();
            alerta('Documento eliminado correctamente.', 'ok');
        }, 250);
    }

    // Delegación de eventos sobre el grid
    els.docsGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-accion]');
        if (!btn) return;
        const id = btn.dataset.id;
        switch (btn.dataset.accion) {
            case 'ver':       accionVer(id); break;
            case 'descargar': accionDescargar(id); break;
            case 'eliminar':  accionEliminar(id); break;
        }
    });

    /* ──────────────────────────────────────────────────────────
       8. CAMBIO DE VEHÍCULO
       ────────────────────────────────────────────────────────── */
    els.selectVeh.addEventListener('change', (e) => {
        estado.vehiculoActualId = parseInt(e.target.value, 10);
        renderHero();
        renderDocumentos();
        cargarKmVehiculo(estado.vehiculoActualId);
        const v = VEHICULOS.find(x => x.id === estado.vehiculoActualId);
        if (v) alerta(`Expediente cargado: ${v.nombre} - ${v.modelo}`, 'info');
    });

    /* ──────────────────────────────────────────────────────────
       9. DRAG & DROP + APERTURA DEL MODAL
       ────────────────────────────────────────────────────────── */

    // Click en la dropzone → abre el modal vacío
    els.dropzone.addEventListener('click', () => abrirModal());
    els.dropzone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirModal(); }
    });

    // Comportamiento drag & drop
    ['dragenter', 'dragover'].forEach(evt => {
        els.dropzone.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            els.dropzone.classList.add('dragover');
        });
    });
    ['dragleave', 'drop'].forEach(evt => {
        els.dropzone.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            els.dropzone.classList.remove('dragover');
        });
    });

    els.dropzone.addEventListener('drop', (e) => {
        const archivo = e.dataTransfer?.files?.[0];
        if (!archivo) return;
        abrirModal(archivo);
    });

    // También permitimos prevenir que el navegador abra el archivo si el
    // usuario suelta fuera de la dropzone (mejora UX).
    ['dragover', 'drop'].forEach(evt => {
        window.addEventListener(evt, (e) => {
            if (!e.target.closest('#dropzone, #exp-file-zona')) e.preventDefault();
        });
    });

    /* ──────────────────────────────────────────────────────────
       10. MODAL DE SUBIDA
       ────────────────────────────────────────────────────────── */

    function abrirModal(archivoPrevio) {
        // Resetear el formulario
        els.mTipo.value = '';
        els.mEmision.value = '';
        els.mVencimiento.value = '';
        els.mArchivo.value = '';
        estado.archivoSeleccionado = null;
        els.fileZona.classList.remove('con-archivo');
        els.fileTexto.textContent = 'Haz clic o arrastra el archivo aquí';

        // Si nos pasaron un archivo (drag & drop), validarlo y precargarlo
        if (archivoPrevio) {
            if (validarArchivo(archivoPrevio)) {
                estado.archivoSeleccionado = archivoPrevio;
                pintarArchivoSeleccionado(archivoPrevio);
            }
        }

        els.modal.classList.add('activo');
        els.modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        setTimeout(() => els.mTipo.focus(), 100);
    }

    function cerrarModal() {
        els.modal.classList.remove('activo');
        els.modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    els.btnCerrarModal.addEventListener('click', cerrarModal);
    els.btnCancelarModal.addEventListener('click', cerrarModal);
    els.modal.addEventListener('click', (e) => {
        if (e.target === els.modal) cerrarModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && els.modal.classList.contains('activo')) cerrarModal();
    });

    // Click en la zona de archivo → abre el selector
    els.fileZona.addEventListener('click', () => els.mArchivo.click());
    els.fileZona.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.mArchivo.click(); }
    });

    // Drag & drop dentro del modal
    ['dragenter', 'dragover'].forEach(evt => {
        els.fileZona.addEventListener(evt, (e) => {
            e.preventDefault();
            els.fileZona.style.borderColor = 'var(--exp-violeta-3)';
            els.fileZona.style.background  = '#faf7ff';
        });
    });
    els.fileZona.addEventListener('dragleave', (e) => {
        e.preventDefault();
        if (!estado.archivoSeleccionado) {
            els.fileZona.style.borderColor = '';
            els.fileZona.style.background  = '';
        }
    });
    els.fileZona.addEventListener('drop', (e) => {
        e.preventDefault();
        const f = e.dataTransfer?.files?.[0];
        if (!f) return;
        if (validarArchivo(f)) {
            estado.archivoSeleccionado = f;
            pintarArchivoSeleccionado(f);
        }
    });

    // Change del input file oculto
    els.mArchivo.addEventListener('change', (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (validarArchivo(f)) {
            estado.archivoSeleccionado = f;
            pintarArchivoSeleccionado(f);
        } else {
            e.target.value = '';
        }
    });

    function pintarArchivoSeleccionado(archivo) {
        els.fileZona.classList.add('con-archivo');
        els.fileTexto.innerHTML =
            `<strong>${archivo.name}</strong><br>
             <span style="font-size:0.78rem; opacity:0.85;">${formatearTamaño(archivo.size)}</span>`;
    }

    /* ──────────────────────────────────────────────────────────
       11. VALIDACIÓN FRONTEND
       ────────────────────────────────────────────────────────── */
    const EXTENSIONES_PERMITIDAS = ['pdf', 'jpg', 'jpeg', 'png', 'docx'];
    const TAMAÑO_MAX = 10 * 1024 * 1024;   // 10 MB

    function validarArchivo(archivo) {
        const ext = archivo.name.toLowerCase().split('.').pop();
        if (!EXTENSIONES_PERMITIDAS.includes(ext)) {
            alerta(`Formato no permitido: .${ext}. Usa PDF, JPG, PNG o DOCX.`, 'error');
            return false;
        }
        if (archivo.size > TAMAÑO_MAX) {
            alerta(`El archivo supera los 10 MB (tamaño: ${formatearTamaño(archivo.size)}).`, 'error');
            return false;
        }
        return true;
    }

    /* ──────────────────────────────────────────────────────────
       12. BOTÓN "SUBIR DOCUMENTO"
       ────────────────────────────────────────────────────────── */
    els.btnSubirModal.addEventListener('click', () => {
        // Validaciones de campos
        if (!els.mTipo.value) {
            alerta('Selecciona el tipo de documento.', 'error');
            els.mTipo.focus();
            return;
        }
        if (!estado.archivoSeleccionado) {
            alerta('Adjunta un archivo antes de subir.', 'error');
            return;
        }

        // Si hay vencimiento sin emisión, advertimos pero no bloqueamos
        if (els.mVencimiento.value && els.mEmision.value &&
            els.mVencimiento.value < els.mEmision.value) {
            alerta('La fecha de vencimiento no puede ser anterior a la de emisión.', 'error');
            return;
        }

        // Construir el nuevo documento (simulación)
        const archivo = estado.archivoSeleccionado;
        const nuevoDoc = {
            id: 'd' + Date.now(),
            nombre: archivo.name,
            tipo: detectarTipo(archivo.name),
            tamañoBytes: archivo.size,
            fecha: els.mEmision.value || new Date().toISOString().slice(0, 10),
            vencimiento: els.mVencimiento.value || null
        };

        // Animación de carga simulada (250 ms)
        els.btnSubirModal.disabled = true;
        els.btnSubirModal.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subiendo…';

        setTimeout(() => {
            documentosMock[estado.vehiculoActualId].push(nuevoDoc);
            renderDocumentos();
            cerrarModal();
            alerta(`"${nuevoDoc.nombre}" se subió correctamente.`, 'ok');
            els.btnSubirModal.disabled = false;
            els.btnSubirModal.innerHTML = '<i class="fas fa-upload"></i> Subir documento';
        }, 300);
    });

    /* ──────────────────────────────────────────────────────────
       12b. KILÓMETROS Y MANTENIMIENTO DEL VEHÍCULO
       Carga km_actual, km recorridos y alertas desde /api/vehiculos/:id/km
       ────────────────────────────────────────────────────────── */
    async function cargarKmVehiculo(vehiculoId) {
        const contenedor = document.getElementById('exp-km-panel');
        if (!contenedor) return;
        contenedor.innerHTML = '<p style="color:#94a3b8;font-size:.82rem;padding:8px 0"><i class="fas fa-spinner fa-spin"></i> Cargando kilómetros...</p>';
        try {
            const base = window.API_BASE || '';
            const resp = await fetch(`${base}/api/vehiculos/${vehiculoId}/km`);
            const data = await resp.json();
            if (!data.ok) throw new Error(data.error || 'Error');

            const kmActual  = Number(data.km_actual) || 0;
            const kmSistema = Number(data.km_recorridos_sistema) || 0;
            const comisiones = data.total_comisiones || 0;

            // Intervalos de mantenimiento
            const KM_ACEITE  = 5000;
            const KM_FRENOS  = 15000;
            const KM_LLANTAS = 40000;
            const kmParaAceite  = KM_ACEITE  - (kmSistema % KM_ACEITE);
            const kmParaFreno   = KM_FRENOS  - (kmSistema % KM_FRENOS);
            const kmParaLlantas = KM_LLANTAS - (kmSistema % KM_LLANTAS);

            function alertaColor(km, intervalo) {
                const pct = 1 - (km / intervalo);
                if (km <= 0)                  return { color: '#dc2626', icono: 'fa-exclamation-circle', nivel: 'VENCIDO' };
                if (pct >= 0.85)              return { color: '#dc2626', icono: 'fa-exclamation-circle', nivel: 'URGENTE' };
                if (pct >= 0.70)              return { color: '#d97706', icono: 'fa-triangle-exclamation', nivel: 'PRÓXIMO' };
                return { color: '#16a34a', icono: 'fa-check-circle', nivel: 'OK' };
            }
            const aAceite  = alertaColor(kmParaAceite, KM_ACEITE);
            const aFreno   = alertaColor(kmParaFreno, KM_FRENOS);
            const aLlantas = alertaColor(kmParaLlantas, KM_LLANTAS);

            // Últimas comisiones
            const ultimasComisiones = (data.comisiones || []).slice(0, 5).map(c => {
                const km = Number(c.km_viaje) || 0;
                const conductor = c.conductor ? `${c.conductor}${c.conductor_ap ? ' ' + c.conductor_ap : ''}` : '—';
                return `<tr>
                    <td style="padding:5px 8px">${c.lugar_destino || '—'}</td>
                    <td style="padding:5px 8px;text-align:right">${c.km_inicial != null ? Number(c.km_inicial).toLocaleString() : '—'}</td>
                    <td style="padding:5px 8px;text-align:right">${c.km_final != null ? Number(c.km_final).toLocaleString() : '—'}</td>
                    <td style="padding:5px 8px;text-align:right;font-weight:700">${km > 0 ? km.toLocaleString() + ' km' : '—'}</td>
                    <td style="padding:5px 8px;color:#64748b">${conductor}</td>
                </tr>`;
            }).join('');

            contenedor.innerHTML = `
              <!-- Hero: distancia total recorrida muy prominente -->
              <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;background:linear-gradient(135deg,#002b60,#006dc8);color:#fff;border-radius:14px;padding:18px 22px;margin-bottom:16px;box-shadow:0 4px 14px rgba(0,43,96,.15);">
                <div>
                  <div style="font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;opacity:.85;margin-bottom:4px;">
                    <i class="fas fa-road"></i> Distancia total recorrida
                  </div>
                  <div style="font-size:2.6rem;font-weight:900;line-height:1;">
                    ${kmSistema.toLocaleString()} <span style="font-size:1.1rem;font-weight:600;opacity:.85;">km</span>
                  </div>
                  <div style="font-size:.78rem;margin-top:6px;opacity:.85;">
                    Acumulado en ${comisiones} comisión(es) registrada(s) en SIGEPAV
                  </div>
                </div>
                <button id="exp-btn-ia-mtto" type="button"
                        style="background:#fff;color:#002b60;border:none;border-radius:8px;padding:11px 18px;font-weight:700;font-size:.88rem;cursor:pointer;display:flex;align-items:center;gap:8px;box-shadow:0 2px 6px rgba(0,0,0,.12);transition:transform .15s;"
                        onmouseover="this.style.transform='translateY(-1px)'"
                        onmouseout="this.style.transform='translateY(0)'">
                  <i class="fas fa-robot" style="color:#006dc8"></i>
                  Analizar con IA
                </button>
              </div>

              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:18px;">
                <div style="background:#f0f7ff;border:1px solid #c2d9f0;border-radius:10px;padding:14px 16px;text-align:center">
                  <div style="font-size:1.7rem;font-weight:900;color:#002b60">${kmActual.toLocaleString()}</div>
                  <div style="font-size:.78rem;color:#64748b;margin-top:2px">KM actual (odómetro)</div>
                </div>
                <div style="background:#f0f7ff;border:1px solid #c2d9f0;border-radius:10px;padding:14px 16px;text-align:center">
                  <div style="font-size:1.7rem;font-weight:900;color:#006dc8">${kmSistema.toLocaleString()}</div>
                  <div style="font-size:.78rem;color:#64748b;margin-top:2px">KM recorridos en sistema</div>
                </div>
                <div style="background:#f0f7ff;border:1px solid #c2d9f0;border-radius:10px;padding:14px 16px;text-align:center">
                  <div style="font-size:1.7rem;font-weight:900;color:#7c3aed">${comisiones}</div>
                  <div style="font-size:.78rem;color:#64748b;margin-top:2px">Comisiones realizadas</div>
                </div>
              </div>

              <!-- Bloque donde se renderiza el análisis de IA (oculto al inicio) -->
              <div id="exp-ia-mtto-panel" style="display:none;margin-bottom:18px;"></div>

              <div style="font-size:.8rem;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">
                <i class="fas fa-wrench"></i> Indicadores de mantenimiento
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:18px;">
                ${[
                  { label: 'Cambio de aceite', km: kmParaAceite, intervalo: KM_ACEITE, a: aAceite },
                  { label: 'Revisión de frenos', km: kmParaFreno, intervalo: KM_FRENOS, a: aFreno },
                  { label: 'Rotación de llantas', km: kmParaLlantas, intervalo: KM_LLANTAS, a: aLlantas }
                ].map(m => `
                  <div style="border:1.5px solid ${m.a.color}22;border-left:4px solid ${m.a.color};border-radius:8px;padding:10px 12px;background:${m.a.color}08;">
                    <div style="font-size:.75rem;font-weight:700;color:#475569">${m.label}</div>
                    <div style="font-size:1.1rem;font-weight:900;color:${m.a.color};margin:4px 0">
                      <i class="fas ${m.a.icono}"></i> ${m.a.nivel}
                    </div>
                    <div style="font-size:.75rem;color:#64748b">
                      ${m.km > 0 ? `Faltan <strong>${m.km.toLocaleString()} km</strong>` : 'Se requiere atención'}
                      · cada ${m.intervalo.toLocaleString()} km
                    </div>
                    <div style="margin-top:6px;background:#e2e8f0;border-radius:4px;height:5px;overflow:hidden;">
                      <div style="height:100%;width:${Math.min(100, Math.round((1-(m.km/m.intervalo))*100))}%;background:${m.a.color};border-radius:4px;transition:width .4s;"></div>
                    </div>
                  </div>`).join('')}
              </div>

              ${ultimasComisiones ? `
              <div style="font-size:.8rem;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">
                <i class="fas fa-route"></i> Últimas 5 comisiones
              </div>
              <div style="overflow-x:auto;border-radius:8px;border:1px solid #e2e8f0;">
                <table style="width:100%;border-collapse:collapse;font-size:.82rem;">
                  <thead><tr style="background:#f8fafc">
                    <th style="padding:6px 8px;text-align:left;font-weight:700;color:#475569;border-bottom:1px solid #e2e8f0">Destino</th>
                    <th style="padding:6px 8px;text-align:right;font-weight:700;color:#475569;border-bottom:1px solid #e2e8f0">KM Ini.</th>
                    <th style="padding:6px 8px;text-align:right;font-weight:700;color:#475569;border-bottom:1px solid #e2e8f0">KM Fin.</th>
                    <th style="padding:6px 8px;text-align:right;font-weight:700;color:#475569;border-bottom:1px solid #e2e8f0">Recorridos</th>
                    <th style="padding:6px 8px;font-weight:700;color:#475569;border-bottom:1px solid #e2e8f0">Conductor</th>
                  </tr></thead>
                  <tbody>${ultimasComisiones}</tbody>
                </table>
              </div>` : ''}
            `;

            // Enganchar el botón "Analizar con IA" (después de inyectar HTML)
            const btnIA = document.getElementById('exp-btn-ia-mtto');
            if (btnIA) {
                btnIA.addEventListener('click', () => analizarMantenimientoIA(vehiculoId, btnIA));
            }
        } catch (err) {
            contenedor.innerHTML = `<p style="color:#94a3b8;font-size:.82rem;padding:8px 0">
                <i class="fas fa-info-circle"></i> Sin datos de kilómetros disponibles para este vehículo.
            </p>`;
        }
    }

    /* ──────────────────────────────────────────────────────────
       12c. ANÁLISIS DE MANTENIMIENTO POR IA
       Llama a /api/ia/mantenimiento (Gemini con fallback local).
       ────────────────────────────────────────────────────────── */
    async function analizarMantenimientoIA(vehiculoId, btn) {
        const panel = document.getElementById('exp-ia-mtto-panel');
        if (!panel) return;

        // Estado de carga del botón
        const btnHTMLOriginal = btn ? btn.innerHTML : null;
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="color:#006dc8"></i> Analizando...';
            btn.style.opacity = '0.85';
        }

        // Panel: estado de carga
        panel.style.display = 'block';
        panel.innerHTML = `
          <div style="background:#f0f7ff;border:1px solid #c2d9f0;border-radius:12px;padding:18px 20px;">
            <div style="display:flex;align-items:center;gap:10px;color:#002b60;font-weight:700;">
              <i class="fas fa-circle-notch fa-spin"></i>
              Consultando al analizador institucional de mantenimiento...
            </div>
            <div style="font-size:.78rem;color:#64748b;margin-top:6px;">
              Revisando kilómetros recorridos, tiempo de uso e historial de mantenimientos.
            </div>
          </div>`;

        try {
            const base = window.API_BASE || (window.location && window.location.origin ? window.location.origin : 'http://localhost:3000');
            const resp = await fetch(`${base}/api/ia/mantenimiento`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vehiculo_id: vehiculoId })
            });
            const data = await resp.json();
            if (!data.ok) throw new Error(data.error || 'No fue posible generar el análisis.');

            const fuenteLabel = data.fuente === 'gemini'
                ? `<span style="background:#dbeafe;color:#1e40af;font-size:.7rem;font-weight:700;padding:2px 8px;border-radius:999px;">
                     <i class="fas fa-bolt"></i> ${data.modelo || 'Gemini'}
                   </span>`
                : `<span style="background:#f1f5f9;color:#475569;font-size:.7rem;font-weight:700;padding:2px 8px;border-radius:999px;">
                     <i class="fas fa-microchip"></i> Recomendador local
                   </span>`;

            // Texto a HTML respetando saltos (Gemini suele responder en párrafos)
            const textoAnalisis = String(data.analisis || '').trim();
            const textoHTML = textoAnalisis
                .split(/\n\s*\n/)
                .map(p => `<p style="margin:0 0 10px 0;line-height:1.55;color:#1e293b;">${p.replace(/\n/g, '<br>')}</p>`)
                .join('');

            const r = data.resumen || {};
            const datosResumen = [];
            if (r.km_recorrido_sistema != null) datosResumen.push(`<strong>${Number(r.km_recorrido_sistema).toLocaleString()} km</strong> recorridos`);
            if (r.total_comisiones != null)    datosResumen.push(`<strong>${r.total_comisiones}</strong> comisión(es)`);
            if (r.dias_ultima_comision != null) datosResumen.push(`última comisión hace <strong>${r.dias_ultima_comision} día(s)</strong>`);
            if (r.dias_alta != null)           datosResumen.push(`<strong>${(r.dias_alta/365).toFixed(1)} años</strong> en sistema`);

            panel.innerHTML = `
              <div style="background:linear-gradient(180deg,#fafbff,#f0f7ff);border:1px solid #c2d9f0;border-radius:12px;padding:18px 22px;box-shadow:0 2px 8px rgba(0,43,96,.05);">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
                  <div style="display:flex;align-items:center;gap:10px;">
                    <div style="background:#006dc8;color:#fff;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;">
                      <i class="fas fa-robot"></i>
                    </div>
                    <div>
                      <div style="font-weight:800;color:#002b60;font-size:.95rem;">Análisis de mantenimiento por IA</div>
                      <div style="font-size:.74rem;color:#64748b;">Generado al momento con base en el historial del vehículo</div>
                    </div>
                  </div>
                  ${fuenteLabel}
                </div>

                ${datosResumen.length ? `
                  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:.8rem;color:#475569;">
                    <i class="fas fa-database" style="color:#006dc8"></i>
                    Datos analizados: ${datosResumen.join(' · ')}
                  </div>` : ''}

                <div style="font-size:.92rem;">
                  ${textoHTML || '<p style="color:#64748b">No se generó texto de análisis.</p>'}
                </div>

                <div style="display:flex;justify-content:flex-end;margin-top:10px;">
                  <button id="exp-ia-mtto-cerrar" type="button"
                          style="background:transparent;border:1px solid #c2d9f0;color:#475569;border-radius:6px;padding:5px 12px;font-size:.78rem;cursor:pointer;">
                    <i class="fas fa-times"></i> Cerrar análisis
                  </button>
                </div>
              </div>
            `;

            const btnCerrar = document.getElementById('exp-ia-mtto-cerrar');
            if (btnCerrar) {
                btnCerrar.addEventListener('click', () => {
                    panel.style.display = 'none';
                    panel.innerHTML = '';
                });
            }
        } catch (err) {
            panel.innerHTML = `
              <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:14px 18px;color:#991b1b;font-size:.88rem;">
                <i class="fas fa-exclamation-triangle"></i>
                No se pudo generar el análisis: ${err.message}
              </div>`;
        } finally {
            if (btn && btnHTMLOriginal) {
                btn.disabled = false;
                btn.innerHTML = btnHTMLOriginal;
                btn.style.opacity = '1';
            }
        }
    }

    /* ──────────────────────────────────────────────────────────
       13. ARRANQUE
       ────────────────────────────────────────────────────────── */
    async function inicializar() {
        // Cargar vehículos reales desde la API
        await cargarVehiculos();
        // Inicializar caché de documentos
        VEHICULOS.forEach(v => { if (!documentosMock[v.id]) documentosMock[v.id] = []; });
        // Arrancar con el primer vehículo disponible
        if (VEHICULOS.length > 0) estado.vehiculoActualId = VEHICULOS[0].id;
        renderSelect();
        renderHero();
        renderDocumentos();
        // Cargar km del vehículo inicial
        if (estado.vehiculoActualId) cargarKmVehiculo(estado.vehiculoActualId);
        console.log('✅ Expediente Digital Vehicular iniciado.', VEHICULOS.length, 'vehículos cargados.');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializar);
    } else {
        inicializar();
    }
})();

// --- Interaccion de barra/logo (antes inline en expediente.html) ---
// Clic en SIGEPAV / logo → vuelve al menú principal (mismo patrón del sistema)
        document.addEventListener('click', (e) => {
            const t = e.target.closest('.titulo-sistema, .titulo-sistema h1, .logo-barra');
            if (!t || !t.closest('.barra-superior')) return;
            window.location.href = 'index.html';
        });
        document.querySelectorAll('.barra-superior .titulo-sistema, .barra-superior .titulo-sistema h1, .barra-superior .logo-barra')
            .forEach(el => { el.style.cursor = 'pointer'; el.title = 'Volver al menú principal'; });
