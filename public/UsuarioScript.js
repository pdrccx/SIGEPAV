    // Base URL del API: detección automática (window.API_BASE viene de Config.js)
    // Soporta localhost, ngrok, Apache/Laragon, file://, etc.
    const API_BASE = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : (window.location && window.location.origin ? window.location.origin : 'http://localhost:3000');

    const apiFetch = (path, options = {}) => fetch(`${API_BASE}${path}`, options);

    document.addEventListener('DOMContentLoaded', () => {
        // Vistas
        const panelUsuario = document.getElementById('panel-usuario');
        const formularioViaje = document.getElementById('formulario-viaje');

        const btnIniciarViaje = document.getElementById('btn-iniciar-viaje');
        // btnVolverPanel fue eliminado (req 6: navegación por SIGEPAV)
        const btnCancelarViaje = document.getElementById('btn-cancelar-viaje');
        const btnIniciarConfirm = document.getElementById('btn-iniciar-viaje-confirm');
        const btnVerificarCombustible = document.getElementById('btn-verificar-combustible');
        const logoutBtn = document.getElementById('logoutBtn');

        const vehiculoSelect = document.getElementById('vehiculo-select');
        const fechaViaje = document.getElementById('fecha-viaje');
        const noViaje = document.getElementById('no-viaje');
        const responsable = document.getElementById('responsable');

        const gaugeFill = document.getElementById('gauge-fill');
        const gaugeValue = document.getElementById('gauge-value');
        const etiquetaTanque = document.getElementById('etiqueta-tanque');

        // Modal de aviso
        const modalOverlay = document.getElementById('modal-overlay');
        const modalAviso = document.getElementById('modal-aviso');
        const modalTitulo = document.getElementById('modal-titulo');
        const modalMensaje = document.getElementById('modal-mensaje');
        const modalBtnAceptar = document.getElementById('modal-btn-aceptar');

        // Modal del medidor
        const modalMedidor = document.getElementById('modal-medidor');
        const iframeMedidor = document.getElementById('iframe-medidor');

        // FIX: Verificar sesión apenas carga la página. Si no hay sesión, al login.
        const sesion = JSON.parse(sessionStorage.getItem('sigepav_usuario') || 'null');
        if (!sesion || !sesion.id) {
            window.location.href = 'index.html';
            return;
        }
        // Si un administrador entra directo a Usuario.html, redirigir al panel admin.
        {
            const _rol = String(sesion.rol || '').trim().toLowerCase();
            if (_rol === 'administrador' || _rol === 'admin') {
                window.location.href = 'menu.html';
                return;
            }
        }

        // ========== UTILIDADES ==========
        function nombreCompletoResponsable() {
            // En alta de usuarios, `nombre` es el usuario/login y `apellidos` el nombre completo.
            return String(sesion.apellidos || sesion.nombre || '').replace(/\s+/g, ' ').trim();
        }

        function mostrarAviso(titulo, mensaje, callback, tipo) {
            modalTitulo.textContent = titulo;
            modalMensaje.textContent = mensaje;

            // Ícono y botón según el tipo: 'success' = palomita verde + botón verde.
            const icono = modalAviso.querySelector('.modal-icono');
            if (icono) {
                icono.className = (tipo === 'success')
                    ? 'fas fa-check-circle modal-icono modal-icono-verde'
                    : 'fas fa-exclamation-triangle modal-icono';
            }
            modalBtnAceptar.classList.toggle('btn-exito', tipo === 'success');

            modalOverlay.style.display = 'block';
            modalAviso.style.display = 'block';
            modalBtnAceptar.focus();
            modalBtnAceptar.onclick = () => {
                ocultarAviso();
                if (callback) callback();
            };
        }
        function ocultarAviso() {
            modalOverlay.style.display = 'none';
            modalAviso.style.display = 'none';
        }

        function generarNumeroViaje() {
            const ahora = new Date();
            const año = ahora.getFullYear();
            const mes = String(ahora.getMonth() + 1).padStart(2, '0');
            const dia = String(ahora.getDate()).padStart(2, '0');
            return `VJ-${año}${mes}${dia}-001`;
        }

        function actualizarMedidor(porcentaje) {
            const degrees = -90 + (porcentaje / 100) * 180;
            gaugeFill.style.transform = `rotate(${degrees}deg)`;
            gaugeValue.textContent = `${porcentaje}%`;
            etiquetaTanque.textContent =
                porcentaje >= 80 ? 'Nivel alto' :
                porcentaje >= 50 ? 'Medio tanque' :
                porcentaje >= 25 ? 'Nivel bajo' :
                porcentaje > 0   ? 'Crítico' : '';
        }

        // ========== ANIMACIÓN DE NÚMEROS ==========
        function animarConteo(elemento, valorFinal) {
            let valorActual = 0;
            const incremento = Math.max(valorFinal / 40, 1);
            elemento.classList.add('animado');
            const intervalo = setInterval(() => {
                valorActual += incremento;
                if (valorActual >= valorFinal) {
                    elemento.textContent = valorFinal;
                    clearInterval(intervalo);
                } else {
                    elemento.textContent = Math.floor(valorActual);
                }
            }, 20);
        }
        function animarNumerosEnSeccion(seccion) {
            if (!seccion) return;
            const numeros = seccion.querySelectorAll('.card-numero[data-valor]');
            numeros.forEach(el => {
                const final = parseInt(el.getAttribute('data-valor'));
                if (final && !el.classList.contains('animado')) animarConteo(el, final);
            });
        }
        animarNumerosEnSeccion(panelUsuario);

        // ========== INICIALIZACIÓN DE FORMULARIO ==========
        fechaViaje.value = new Date().toISOString().split('T')[0];
        noViaje.value = generarNumeroViaje();

        // Pre-llenar el responsable solo con el nombre completo y bloquearlo
        if (responsable) {
            const nombreCompleto = nombreCompletoResponsable() || 'Usuario';
            responsable.value = nombreCompleto;
            responsable.readOnly = true;
        }

        // FIX: Cache global de vehículos para que la IA y otras funciones lo reutilicen
        window.__sigepav_vehiculos_cache = [];

        // FIX: Carga de vehículos con manejo de error visible al usuario
        async function cargarVehiculos() {
            try {
                const r = await apiFetch('/api/vehiculos');
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const ct = r.headers.get('content-type') || '';
                if (!ct.includes('application/json')) {
                    throw new Error('Respuesta no es JSON. ¿El server Node está corriendo en :3000?');
                }
                const d = await r.json();
                if (!d.ok) throw new Error(d.error || 'Error al cargar vehículos');

                window.__sigepav_vehiculos_cache = d.vehiculos || [];

                const tipoLabel = {
                    sedan:'Sedán', coupe:'Coupé', pickup:'Pickup', suv:'SUV',
                    hatchback:'Hatchback', van:'Van', motocicleta:'Motocicleta', otro:'Otro'
                };

                vehiculoSelect.innerHTML = '<option value="">-- Seleccione un vehículo --</option>';
                d.vehiculos.forEach(v => {
                    const opt = document.createElement('option');
                    opt.value = v.id;
                    let extra = '';
                    if (v.tipo) {
                        const t = tipoLabel[String(v.tipo).toLowerCase()] || v.tipo;
                        extra = (v.capacidad != null && v.capacidad !== '')
                            ? ` — ${t}, ${v.capacidad} pers.`
                            : ` — ${t}`;
                    }
                    opt.textContent = `${v.marca} ${v.linea} ${v.modelo} (No. Eco ${v.no_economico})${extra}`;
                    opt.dataset.combustible = v.combustible || '';
                    opt.dataset.km          = v.km_actual || 0;
                    opt.dataset.tipo        = v.tipo || '';
                    opt.dataset.capacidad   = (v.capacidad != null) ? v.capacidad : '';
                    vehiculoSelect.appendChild(opt);
                });

                if (d.vehiculos.length === 0) {
                    vehiculoSelect.innerHTML = '<option value="">No hay vehículos registrados</option>';
                }
            } catch (err) {
                console.error('Error cargando vehículos:', err);
                vehiculoSelect.innerHTML = `<option value="">Error: ${err.message}</option>`;
                mostrarAviso('Error de conexión',
                    'No se pudieron cargar los vehículos. Verifica que el servidor Node esté corriendo en http://localhost:3000');
            }
        }
        cargarVehiculos();

        // Cargar resumen del mes con datos reales
        (async () => {
            try {
                const correoEl = document.querySelector('.barra-derecha .correo-usuario');
                if (correoEl) correoEl.textContent = sesion.email || sesion.nombre;

                const r = await apiFetch(`/api/resumen-mes/${sesion.id}`);
                const d = await r.json();
                if (d.ok) {
                    const cards = panelUsuario.querySelectorAll('.card-numero[data-valor]');
                    if (cards[0]) cards[0].setAttribute('data-valor', d.resumen.viajes || 0);
                    if (cards[1]) cards[1].setAttribute('data-valor', d.resumen.km || 0);
                    if (cards[2]) cards[2].setAttribute('data-valor', Math.round(d.resumen.litros || 0));
                    cards.forEach(c => { c.classList.remove('animado'); c.textContent = '0'; });
                    animarNumerosEnSeccion(panelUsuario);
                }
            } catch (err) {
                console.warn('No se pudo cargar resumen mes:', err);
            }
        })();

        // ========== MEDIDOR DE COMBUSTIBLE ==========
        function abrirMedidor() {
            iframeMedidor.src = window.sigepavUrl(`${window.FUEL_BASE || ((window.API_BASE || window.location.origin) + '/gasolina')}/?t=${Date.now()}`);
            modalOverlay.style.display = 'block';
            modalMedidor.style.display = 'block';
        }
        function cerrarMedidor() {
            modalOverlay.style.display = 'none';
            modalMedidor.style.display = 'none';
            iframeMedidor.src = '';
        }
        window.addEventListener('message', (event) => {
            if (!event.data || typeof event.data !== 'object') return;
            if (event.data.tipo === 'medidor-confirmar') {
                const pct = Math.round(event.data.percentage);
                // FIX (req 3): ruta el resultado según el destino que disparó el medidor
                if (window.__sigepav_medidor_destino === 'finalizar') {
                    const hidden = document.getElementById('ff-nivel-comb');
                    const lbl = document.getElementById('ff-nivel-actual');
                    if (hidden) hidden.value = String(pct);
                    if (lbl)    lbl.textContent = `${pct}% (capturado con Gasolina.py)`;
                } else {
                    // Por defecto, era el medidor del inicio de viaje
                    actualizarMedidor(pct);
                }
                window.__sigepav_medidor_destino = null;
                cerrarMedidor();
            } else if (event.data.tipo === 'medidor-cancelar') {
                window.__sigepav_medidor_destino = null;
                cerrarMedidor();
            }
        });
        btnVerificarCombustible.addEventListener('click', () => {
            const vehiculo = vehiculoSelect.value;
            if (!vehiculo) {
                mostrarAviso('Selección requerida', 'Seleccione primero un vehículo oficial.');
                return;
            }
            fetch(`${window.FUEL_BASE || ((window.API_BASE || window.location.origin) + '/gasolina')}/fuel?t=${Date.now()}`, { cache: 'no-store' })
                .then(r => {
                    if (!r.ok) throw new Error('Servidor no disponible');
                    abrirMedidor();
                })
                .catch(() => {
                    mostrarAviso('Error de conexión',
                        'No se pudo conectar con el servidor de combustible. Asegúrese de que el archivo Gasolina.py esté en ejecución y disponible en el servidor de combustible');
                });
        });

        // ========== NAVEGACIÓN ==========
        function volverPanel() {
            // Oculta cualquier vista activa (formulario viaje, historial, form finalización)
            if (typeof ocultarTodasLasVistas === 'function') {
                ocultarTodasLasVistas();
            } else {
                formularioViaje.style.display = 'none';
            }
            panelUsuario.style.display = 'flex';
            // Refrescar el banner de "iniciar/finalizar comisión" por si el
            // estado cambió (acabas de iniciar o finalizar una comisión).
            if (typeof verificarComisionActiva === 'function') {
                verificarComisionActiva();
            }
        }

        // FIX (req 6): clic en SIGEPAV / logo de la barra azul → vuelve al panel principal.
        // Usamos delegación de eventos en document para que funcione aunque el
        // header se renderice más tarde o haya elementos superpuestos.
        document.addEventListener('click', (e) => {
            const t = e.target.closest('.titulo-sistema, .titulo-sistema h1, .logo-barra');
            if (!t) return;
            if (!t.closest('.barra-superior')) return;
            volverPanel();
        });
        // Estilos visuales (cursor pointer + tooltip)
        document.querySelectorAll('.barra-superior .titulo-sistema, .barra-superior .titulo-sistema h1, .barra-superior .logo-barra').forEach(el => {
            el.style.cursor = 'pointer';
            el.title = 'Volver al panel principal';
        });

        btnIniciarViaje.addEventListener('click', () => {
            if (typeof ocultarTodasLasVistas === 'function') ocultarTodasLasVistas();
            else panelUsuario.style.display = 'none';
            formularioViaje.style.display = 'flex';
            actualizarMedidor(0);
        });
        // btnVolverPanel fue eliminado del HTML (req 6); la navegación se hace por SIGEPAV.
        if (btnCancelarViaje) btnCancelarViaje.addEventListener('click', volverPanel);

        // ─────────────────────────────────────────────────────────────
        //  Banner inteligente: sin/con comisión activa
        // ─────────────────────────────────────────────────────────────
        //  Al cargar el panel y después de iniciar/finalizar una comisión,
        //  consultamos /api/viajes/usuario/{id} para saber si hay una activa.
        //  - Si NO hay → mostramos banner "Iniciar comisión" (verde, original).
        //  - Si SÍ hay → mostramos banner rojo "Finalizar comisión" + info.
        const bannerSinComision = document.getElementById('estado-sin-comision');
        const bannerConComision = document.getElementById('estado-con-comision');
        const infoComisionActiva = document.getElementById('info-comision-activa');
        const btnFinalizarViaje = document.getElementById('btn-finalizar-viaje');

        // Guarda la comisión activa actual (si existe) para que el botón "Finalizar"
        // sepa qué viaje finalizar sin pedirle al usuario que elija de una lista.
        let __comisionActivaActual = null;

        async function verificarComisionActiva() {
            if (!sesion || !sesion.id) return;
            try {
                const r = await apiFetch(`/api/viajes/usuario/${sesion.id}`);
                const d = await r.json();
                if (!d.ok) throw new Error(d.error || 'No se pudo verificar el estado de comisiones');

                // Busca la primera comisión en estado "En comision"
                const activa = (d.viajes || []).find(v => esEnComision(v.estado));

                if (activa) {
                    __comisionActivaActual = activa;
                    // Texto descriptivo
                    const destino = activa.lugar_destino ? ` a ${activa.lugar_destino}` : '';
                    const oficio = activa.no_oficio ? ` (${activa.no_oficio})` : '';
                    if (infoComisionActiva) {
                        infoComisionActiva.textContent =
                            `Tienes una comisión activa${destino}${oficio}. Cuando termines, finalízala desde aquí.`;
                    }
                    if (bannerSinComision) bannerSinComision.style.display = 'none';
                    if (bannerConComision) bannerConComision.style.display = 'flex';
                } else {
                    __comisionActivaActual = null;
                    if (bannerSinComision) bannerSinComision.style.display = 'flex';
                    if (bannerConComision) bannerConComision.style.display = 'none';
                }
            } catch (err) {
                // En caso de error, mostramos el banner por defecto (sin comisión)
                console.warn('verificarComisionActiva:', err);
                __comisionActivaActual = null;
                if (bannerSinComision) bannerSinComision.style.display = 'flex';
                if (bannerConComision) bannerConComision.style.display = 'none';
            }
        }

        // Click en "Finalizar comisión" → abre directamente el formulario de
        // finalización con la comisión activa precargada. El usuario no tiene
        // que ir al historial y buscarla.
        if (btnFinalizarViaje) {
            btnFinalizarViaje.addEventListener('click', () => {
                if (!__comisionActivaActual) {
                    // Por algún motivo se perdió la referencia. Re-verificar.
                    verificarComisionActiva();
                    mostrarAviso('Sin comisión activa', 'No se detectó una comisión activa. Si crees que es un error, recarga la página.');
                    return;
                }
                abrirFormFinalizar(
                    __comisionActivaActual.id,
                    __comisionActivaActual.lugar_destino || ''
                );
            });
        }

        // Verifica al cargar la página
        verificarComisionActiva();

        // FIX: validación robusta + mensajes claros + parseo correcto del vehiculo_id
        btnIniciarConfirm.addEventListener('click', async () => {
            const lugar = document.getElementById('lugar-destino').value.trim();
            const vehiculoIdStr = vehiculoSelect.value;
            const km = parseInt(document.getElementById('kilometraje').value, 10);
            // El campo oficio-no es de solo lectura: el servidor lo genera (CM-DD-MM-AA-NN).
            const motivo = document.getElementById('motivo-viaje').value.trim();

            // FIX: validar que el vehiculo_id sea un número entero válido (no "nissan-versa")
            const vehiculo_id = parseInt(vehiculoIdStr, 10);

            if (!lugar) {
                mostrarAviso('Falta destino', 'Ingrese el lugar o destino de la comisión.');
                return;
            }
            if (!vehiculoIdStr || isNaN(vehiculo_id)) {
                mostrarAviso('Vehículo requerido', 'Seleccione un vehículo oficial de la lista.');
                return;
            }
            if (isNaN(km) || km < 0) {
                mostrarAviso('Kilometraje inválido', 'Ingrese un kilometraje válido (número entero).');
                return;
            }

            // Botón en estado "guardando" para evitar dobles clicks
            btnIniciarConfirm.disabled = true;
            const txtOriginal = btnIniciarConfirm.innerHTML;
            btnIniciarConfirm.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
            if (window.sigepavLoading) window.sigepavLoading.show('Guardando comisión...');

            // Responsable: nombre completo del usuario logueado.
            const responsableAutorelleno = nombreCompletoResponsable() || 'Usuario';

            // Vale seleccionado del combo (puede ser vacío = S/V)
            const valeId = document.getElementById('no-viaje')?.value || null;

            try {
                const resp = await apiFetch('/api/viajes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        usuario_id: sesion.id,
                        vehiculo_id: vehiculo_id,
                        vale_id: valeId,
                        // no_oficio NO se envía: el servidor lo genera (CM-DD-MM-AA-NN).
                        lugar_destino: lugar,
                        responsable: responsableAutorelleno,
                        // Campos separados (del catálogo INEGI)
                        estadoDst: document.getElementById('dest-estado-nombre')?.value.trim() || null,
                        municipio: document.getElementById('dest-municipio-nombre')?.value.trim() || null,
                        localidad: document.getElementById('dest-localidad-nombre')?.value.trim() || null,
                        motivo,
                        km_inicial: km,
                        fecha_inicio: new Date().toISOString().slice(0, 19).replace('T', ' ')
                    })
                });

                // FIX: validar content-type antes de parsear JSON
                const ct = resp.headers.get('content-type') || '';
                if (!ct.includes('application/json')) {
                    throw new Error(`Respuesta no es JSON (status ${resp.status}). ¿El server está corriendo?`);
                }

                const data = await resp.json();
                if (!data.ok) throw new Error(data.error || 'Error desconocido del servidor');

                const oficioAsignado = data.no_oficio || '(sin asignar)';
                mostrarAviso(
                    'Comisión iniciada',
                    `Comisión #${data.id} registrada correctamente.\n\nNúmero de oficio asignado: ${oficioAsignado}`,
                    () => {
                        // Limpiar formulario
                        document.getElementById('lugar-destino').value = '';
                        document.getElementById('kilometraje').value = '';
                        // El campo oficio-no se queda con el placeholder de "se asignará al guardar"
                        document.getElementById('oficio-no').value = 'Se asignará al guardar (formato CM-DD-MM-AA-NN)';
                        document.getElementById('motivo-viaje').value = '';
                        vehiculoSelect.value = '';
                        actualizarMedidor(0);
                        volverPanel();
                },
                    'success');
            } catch (err) {
                console.error('Error guardando viaje:', err);
                mostrarAviso('Error', 'No se pudo guardar la comisión: ' + err.message);
            } finally {
                btnIniciarConfirm.disabled = false;
                btnIniciarConfirm.innerHTML = txtOriginal;
                if (window.sigepavLoading) window.sigepavLoading.hide();
            }
        });

        // ========== DROPDOWN DE OPCIONES ==========
        const btnDropdown = document.getElementById('btnDropdownGlobal');
        const dropdownMenu = document.getElementById('dropdownMenuGlobal');

        if (btnDropdown && dropdownMenu) {
            btnDropdown.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdownMenu.classList.toggle('show');
            });
            document.addEventListener('click', (e) => {
                if (!dropdownMenu.contains(e.target) && e.target !== btnDropdown) {
                    dropdownMenu.classList.remove('show');
                }
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') dropdownMenu.classList.remove('show');
            });

            document.querySelectorAll('.modulo-dropdown').forEach(item => {
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const opcion = item.getAttribute('data-opcion');
                    switch (opcion) {
                        case 'iniciar-viaje':
                            ocultarTodasLasVistas();
                            formularioViaje.style.display = 'flex';
                            actualizarMedidor(0);
                            break;
                        case 'historial':
                            abrirHistorial();
                            break;
                        case 'ia':
                            window.location.href = 'Ia.html';
                            break;
                        case 'ayuda':
                            if (typeof window.descargarManualSIGEPAV === 'function') {
                                window.descargarManualSIGEPAV();
                            } else {
                                window.location.href = 'Manual_SIGEPAV.pdf';
                            }
                            break;
                    }
                    dropdownMenu.classList.remove('show');
                });
            });
        }

        // ========== PANEL DE CUENTA ==========
        const btnCuenta = document.getElementById('btnCuenta');
        const cuentaPanel = document.getElementById('cuentaPanel');
        const ultimoAcceso = document.getElementById('ultimoAcceso');

        if (ultimoAcceso) {
            ultimoAcceso.textContent = new Date().toLocaleString('es-MX', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        }

        // Llenar el panel con datos REALES de la sesión sin cambiar el flujo operativo.
        // El guard global ya renderiza el menú completo; aquí solo dejamos compatibilidad
        // por si el HTML viejo se carga antes del guard.
        try {
            const cabecera = document.querySelector('.cuenta-cabecera div:last-child');
            const rolNormU = String(sesion.rol || '').trim().toLowerCase();
            const esAdminU = (rolNormU === 'administrador' || rolNormU === 'admin' || Number(sesion.rol_id) === 1);
            const nombreCompleto = `${sesion.nombre || ''} ${sesion.apellidos || ''}`.trim();
            if (cabecera) {
                cabecera.innerHTML = `
                    <h4>${sesion.email || 'Usuario'}</h4>
                    <p>${nombreCompleto || sesion.cargo || (esAdminU ? 'Administrador' : 'Usuario operativo')}</p>
                `;
            }
            const datos = document.querySelectorAll('.cuenta-fila .cuenta-valor');
            if (datos[0]) datos[0].textContent = sesion.email || '—';
            if (datos[1]) datos[1].textContent = nombreCompleto || '—';
            if (datos[2]) datos[2].textContent = sesion.departamento || '—';
            if (datos[3]) datos[3].textContent = esAdminU ? 'Administrador' : 'Usuario operativo';
        } catch (e) {
            console.warn('No se pudo cargar datos de cuenta:', e);
        }

        if (btnCuenta && cuentaPanel && !btnCuenta._sigepavCuentaBound) {
            btnCuenta.addEventListener('click', (e) => {
                e.stopPropagation();
                cuentaPanel.classList.toggle('show');
                if (dropdownMenu) dropdownMenu.classList.remove('show');
            });
            document.addEventListener('click', (e) => {
                if (!cuentaPanel.contains(e.target) && e.target !== btnCuenta && !btnCuenta.contains(e.target)) {
                    cuentaPanel.classList.remove('show');
                }
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') cuentaPanel.classList.remove('show');
            });
        }

        // ========== CAMPANA DE NOTIFICACIONES (real, lee /api/notificaciones) ==========
        const btnNotificaciones = document.getElementById('btnNotificaciones');
        const badgeNotif = document.getElementById('badgeNotif');
        const usrPanelNotif = document.getElementById('usr-panelNotif');
        const usrNotifLista = document.getElementById('usr-notif-lista');
        const usrNotifCount = document.getElementById('usr-notif-count');

        function escHtmlNotif(s) {
            return String(s || '').replace(/[&<>"']/g, c => ({
                '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
            }[c]));
        }

        function escAttrNotif(s) { return escHtmlNotif(s).replace(/`/g, '&#96;'); }

        function urlNotificacionUsuario(n) {
            if (!n) return null;
            const id = n.referencia_id ? encodeURIComponent(n.referencia_id) : '';
            switch (n.tipo) {
                case 'comision_rechazada':
                    return id ? `Usuario.html?abrir=finalizar&viaje_id=${id}#form-finalizar-comision` : 'Usuario.html#historial-comisiones';
                case 'comision_aprobada':
                    return id ? `Usuario.html?abrir=historial&viaje_id=${id}#historial-comisiones` : 'Usuario.html#historial-comisiones';
                case 'solicitud_finalizacion':
                    return id ? `solicitudes-finalizacion.html?solicitud_id=${id}` : 'solicitudes-finalizacion.html';
                case 'reporte_ciudadano':
                    return id ? `reportes.html?reporte_id=${id}` : 'reportes.html';
                case 'vehiculo':
                    return id ? `vehiculos.html?vehiculo_id=${id}` : 'vehiculos.html';
                default:
                    return null;
            }
        }

        async function abrirNotificacionUsuario(notifId, url) {
            const id = parseInt(notifId, 10);
            if (id) {
                try { await apiFetch(`/api/notificaciones/${id}/leida`, { method: 'PUT' }); } catch (_) {}
            }
            if (url) window.location.href = url;
            else cargarNotificaciones();
        }

        async function cargarNotificaciones() {
            if (!sesion || !sesion.id) return;
            try {
                const r = await apiFetch(`/api/notificaciones/${sesion.id}`);
                const d = await r.json();
                if (!d.ok) return;
                const lista = d.notificaciones || [];
                const noLeidas = lista.filter(n => !n.leida).length;

                if (badgeNotif) {
                    if (noLeidas > 0) {
                        badgeNotif.textContent = noLeidas > 99 ? '99+' : noLeidas;
                        badgeNotif.style.display = 'flex';
                    } else {
                        badgeNotif.style.display = 'none';
                    }
                }
                if (usrNotifCount) usrNotifCount.textContent = `${noLeidas} sin leer`;

                if (!usrNotifLista) return;
                if (!lista.length) {
                    usrNotifLista.innerHTML = '<p style="text-align:center; padding: 1rem; color:#666;">No hay notificaciones.</p>';
                    return;
                }
                usrNotifLista.innerHTML = lista.slice(0, 20).map(n => {
                    const url = urlNotificacionUsuario(n);
                    return `
                    <div data-notif-id="${n.id}"
                         ${url ? `data-notif-url="${escAttrNotif(url)}" title="Abrir registro relacionado"` : ''}
                         style="padding: 0.7rem; border-bottom: 1px solid #eee; ${n.leida ? 'opacity:0.55;' : ''} ${url ? 'cursor:pointer;' : ''}">
                        <div style="display:flex; justify-content:space-between; gap:0.5rem;">
                            <strong style="font-size:0.9rem;">${escHtmlNotif(n.titulo)}</strong>
                            ${n.leida ? '' : `<button class="btn-icono" data-marcar-leida="${n.id}" title="Marcar leída" style="color:#006dc8;background:none;border:none;cursor:pointer;"><i class="fas fa-check"></i></button>`}
                        </div>
                        <p style="margin: 0.25rem 0; font-size:0.85rem; color:#444;">${escHtmlNotif(n.cuerpo)}</p>
                        <span style="font-size:0.7rem; color:#888;">${(n.created_at || '').toString().slice(0,16).replace('T',' ')}</span>
                        ${url ? '<div style="font-size:0.72rem;color:#006dc8;margin-top:0.25rem;"><i class="fas fa-external-link-alt"></i> Clic para abrir</div>' : ''}
                    </div>`;
                }).join('');
            } catch (err) {
                console.warn('No se pudieron cargar notificaciones:', err);
            }
        }

        if (btnNotificaciones && usrPanelNotif) {
            btnNotificaciones.addEventListener('click', (e) => {
                e.stopPropagation();
                usrPanelNotif.style.display = usrPanelNotif.style.display === 'block' ? 'none' : 'block';
                if (usrPanelNotif.style.display === 'block') cargarNotificaciones();
            });
            document.addEventListener('click', (e) => {
                if (!usrPanelNotif.contains(e.target) && e.target !== btnNotificaciones) {
                    usrPanelNotif.style.display = 'none';
                }
            });
            usrNotifLista?.addEventListener('click', async (e) => {
                const t = e.target.closest('[data-marcar-leida]');
                if (t) {
                    e.preventDefault();
                    e.stopPropagation();
                    const id = parseInt(t.dataset.marcarLeida, 10);
                    try {
                        await apiFetch(`/api/notificaciones/${id}/leida`, { method: 'PUT' });
                        await cargarNotificaciones();
                    } catch (err) {
                        console.warn(err);
                    }
                    return;
                }
                const item = e.target.closest('[data-notif-id]');
                if (!item) return;
                await abrirNotificacionUsuario(item.dataset.notifId, item.dataset.notifUrl || '');
            });
        }

        // Carga inicial y polling cada 30s
        cargarNotificaciones();
        setInterval(cargarNotificaciones, 30000);
        // Exponer para que otros módulos refresquen tras acciones
        window.__sigepav_refrescarNotifUsuario = cargarNotificaciones;

        // ========== HISTORIAL DE COMISIONES ==========
        const panelHistorial = document.getElementById('historial-comisiones');
        const formFinalizar  = document.getElementById('form-finalizar-comision');
        const hcTbody        = document.getElementById('hc-tbody');
        const hcResCount     = document.getElementById('hc-res-count');

        function ocultarTodasLasVistas() {
            [panelUsuario, formularioViaje, panelHistorial, formFinalizar].forEach(v => {
                if (v) v.style.display = 'none';
            });
        }

        function estadoBadgeHist(e) {
            const map = {
                'Finalizado':              'badge-success',
                'En comision':             'badge-info',
                'En comisión':             'badge-info',
                'Solicitud finalización':  'badge-warning',
                'Solicitud finalizacion':  'badge-warning',
                'Pendiente':               'badge-warning',
                'Cancelado':               'badge-danger'
            };
            return `<span class="badge ${map[e] || 'badge-muted'}">${escHtmlNotif(e || '')}</span>`;
        }

        function esEnComision(estado) {
            return estado === 'En comision' || estado === 'En comisión';
        }

        async function cargarHistorial() {
            if (!sesion || !sesion.id) return;
            try {
                const r = await apiFetch(`/api/viajes/usuario/${sesion.id}`);
                const d = await r.json();
                if (!d.ok) throw new Error(d.error || 'Error al cargar historial');
                const viajes = d.viajes || [];
                if (hcResCount) hcResCount.textContent = `${viajes.length} registro(s)`;

                if (!viajes.length) {
                    hcTbody.innerHTML = `<tr><td colspan="8">
                        <div class="estado-vacio"><i class="fas fa-inbox"></i><p>Aún no has registrado comisiones.</p></div>
                    </td></tr>`;
                    return;
                }

                hcTbody.innerHTML = viajes.map(v => {
                    const veh = (v.linea || v.marca)
                        ? `${v.linea || ''} ${v.marca || ''}`.trim() + (v.no_economico ? ` (${v.no_economico})` : '')
                        : '—';
                    const fecha = (v.fecha_inicio || '').toString().slice(0, 10);
                    let acciones = '';
                    if (esEnComision(v.estado)) {
                        acciones = `<button class="btn-secundario btn-mini" data-accion="finalizar" data-id="${v.id}" data-info="${escHtmlNotif(v.lugar_destino || '')}">
                            <i class="fas fa-flag-checkered"></i> Finalizar comisión
                        </button>`;
                    } else if (v.estado === 'Solicitud finalización' || v.estado === 'Solicitud finalizacion') {
                        acciones = `<span style="color:#a87900;font-size:0.85rem;"><i class="fas fa-hourglass-half"></i> En revisión</span>`;
                    } else {
                        acciones = `<span style="color:#666;font-size:0.85rem;">—</span>`;
                    }
                    return `<tr>
                        <td>#${v.id}</td>
                        <td>${escHtmlNotif(v.lugar_destino || '—')}</td>
                        <td>${escHtmlNotif(v.motivo || '—')}</td>
                        <td>${veh}</td>
                        <td class="celda-mono">${v.km_inicial != null ? Number(v.km_inicial).toLocaleString() : '—'}</td>
                        <td class="celda-mono">${fecha || '—'}</td>
                        <td>${estadoBadgeHist(v.estado)}</td>
                        <td>${acciones}</td>
                    </tr>`;
                }).join('');
            } catch (err) {
                mostrarAviso('Error', 'No se pudo cargar el historial: ' + err.message);
            }
        }

        function abrirHistorial() {
            ocultarTodasLasVistas();
            if (panelHistorial) panelHistorial.style.display = 'flex';
            cargarHistorial();
        }

        hcTbody?.addEventListener('click', (e) => {
            const t = e.target.closest('[data-accion="finalizar"]');
            if (!t) return;
            const id = parseInt(t.dataset.id, 10);
            const destino = t.dataset.info || '';
            abrirFormFinalizar(id, destino);
        });

        // ========== FORMULARIO DE SOLICITUD DE FINALIZACIÓN ==========
        function abrirFormFinalizar(viajeId, destino) {
            ocultarTodasLasVistas();
            if (formFinalizar) formFinalizar.style.display = 'flex';
            document.getElementById('ff-viaje-id').value = viajeId;
            document.getElementById('ff-comision-info').value = `Comisión #${viajeId}${destino ? ' — ' + destino : ''}`;
            document.getElementById('ff-km-final').value = '';
            document.getElementById('ff-nivel-comb').value = '';      // hidden
            const lbl = document.getElementById('ff-nivel-actual');
            if (lbl) lbl.textContent = '— (sin capturar)';
            document.getElementById('ff-motivo').value = '';
            document.getElementById('ff-obs').value = '';
            document.getElementById('ff-actividades').value = '';
        }

        async function abrirDestinoDesdeURL() {
            const params = new URLSearchParams(window.location.search);
            const viajeId = parseInt(params.get('viaje_id') || '0', 10);
            const abrir = params.get('abrir') || '';
            if (abrir === 'finalizar' && viajeId) {
                abrirFormFinalizar(viajeId, '');
                return;
            }
            if (abrir === 'historial' || viajeId || window.location.hash === '#historial-comisiones') {
                abrirHistorial();
            }
        }

        document.getElementById('ff-btn-cancelar')?.addEventListener('click', abrirHistorial);
        abrirDestinoDesdeURL();

        // FIX (req 3): el nivel de combustible final se captura con Gasolina.py.
        // Marcamos un destino para distinguirlo del flujo de "inicio de viaje".
        document.getElementById('ff-btn-medir')?.addEventListener('click', () => {
            fetch(`${window.FUEL_BASE || ((window.API_BASE || window.location.origin) + '/gasolina')}/fuel?t=${Date.now()}`, { cache: 'no-store' })
                .then(r => {
                    if (!r.ok) throw new Error('Servidor no disponible');
                    window.__sigepav_medidor_destino = 'finalizar';
                    abrirMedidor();
                })
                .catch(() => {
                    mostrarAviso('Error de conexión',
                        'No se pudo conectar con el servidor de combustible. Asegúrese de que el archivo Gasolina.py esté en ejecución y disponible en el servidor de combustible');
                });
        });

        document.getElementById('ff-btn-enviar')?.addEventListener('click', async () => {
            const viaje_id = parseInt(document.getElementById('ff-viaje-id').value, 10);
            const km_final = document.getElementById('ff-km-final').value;
            const nivel_comb_fin = document.getElementById('ff-nivel-comb').value;  // hidden
            const motivo = document.getElementById('ff-motivo').value.trim();
            const observaciones = document.getElementById('ff-obs').value.trim();
            const actividades = document.getElementById('ff-actividades').value.trim();

            if (!viaje_id) {
                mostrarAviso('Error', 'No se identificó la comisión.');
                return;
            }
            if (km_final === '' || isNaN(parseInt(km_final, 10))) {
                mostrarAviso('Falta kilometraje', 'Captura el kilometraje final.');
                return;
            }
            if (!nivel_comb_fin) {
                mostrarAviso('Falta nivel de combustible',
                    'Pulsa "Verificar con Gasolina.py" para capturar el nivel de combustible final.');
                return;
            }

            const btn = document.getElementById('ff-btn-enviar');
            const txt = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
            if (window.sigepavLoading) window.sigepavLoading.show('Enviando solicitud...');

            try {
                const r = await apiFetch('/api/solicitudes-finalizacion', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        viaje_id,
                        usuario_id: sesion.id,
                        km_final: parseInt(km_final, 10),
                        nivel_comb_fin: nivel_comb_fin || null,
                        observaciones: observaciones || null,
                        actividades: actividades || null,
                        motivo: motivo || null
                    })
                });
                const d = await r.json();
                if (!d.ok) throw new Error(d.error || 'Error al enviar la solicitud');

                mostrarAviso('Solicitud enviada', 'Tu solicitud quedó en revisión por el administrador.', () => {
                    abrirHistorial();
                });
            } catch (err) {
                mostrarAviso('Error', 'No se pudo enviar la solicitud: ' + err.message);
            } finally {
                btn.disabled = false;
                btn.innerHTML = txt;
                if (window.sigepavLoading) window.sigepavLoading.hide();
            }
        });

        // ========== CAMPANA DE NOTIFICACIONES (handlers ya conectados arriba) ==========

        // FIX: limpiar toda la sesión al cerrar sesión
        logoutBtn.addEventListener('click', () => {
            sessionStorage.removeItem('sigepav_usuario');
            localStorage.removeItem('sigepav_usuario');
            window.location.href = 'index.html';
        });

        console.log('✅ Panel de usuario listo. Sesión:', sesion.email);
    });

window.sigepavLoading = {
  show: function(msg) {
    var el = document.getElementById('sigepav-loading-overlay');
    var txt = document.getElementById('sigepav-loading-msg');
    if (txt) txt.textContent = msg || 'Procesando...';
    if (el) el.classList.add('activo');
  },
  hide: function() {
    var el = document.getElementById('sigepav-loading-overlay');
    if (el) el.classList.remove('activo');
  }
};
