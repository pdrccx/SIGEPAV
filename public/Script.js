/* ════════════════════════════════════════════════════════════════════
   QR LIGHTBOX — visor global de QR con zoom, descarga, impresión y Esc.
   Disponible como window.QRLightbox.abrir({ src, titulo, subtitulo, urlPublica })
   ════════════════════════════════════════════════════════════════════ */
window.QRLightbox = (() => {
    let inicializado = false;
    let ultimoFoco = null;

    function init() {
        if (inicializado) return;
        const box = document.getElementById('qr-lightbox');
        if (!box) return;
        inicializado = true;

        // Cerrar al clickear backdrop o botón de cerrar
        box.addEventListener('click', (e) => {
            if (e.target.hasAttribute('data-qr-cerrar') ||
                e.target.closest('[data-qr-cerrar]')) {
                cerrar();
            }
        });

        // Cerrar con Esc
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && box.style.display === 'flex') cerrar();
        });

        // Imprimir
        const btnImp = document.getElementById('qr-lightbox-imprimir');
        if (btnImp) btnImp.addEventListener('click', imprimir);
    }

    function abrir({ src, titulo, subtitulo, urlPublica, descargaNombre }) {
        init();
        const box = document.getElementById('qr-lightbox');
        if (!box || !src) return;

        document.getElementById('qr-lightbox-img').src        = src;
        document.getElementById('qr-lightbox-titulo').textContent    = titulo    || 'Código QR del vehículo';
        document.getElementById('qr-lightbox-subtitulo').textContent = subtitulo || 'Transparencia ciudadana';

        const desc = document.getElementById('qr-lightbox-descargar');
        desc.href = src;
        desc.setAttribute('download', descargaNombre || 'QR_vehiculo.png');

        const pub = document.getElementById('qr-lightbox-publico');
        if (urlPublica) {
            pub.href = urlPublica;
            pub.style.display = '';
        } else {
            pub.style.display = 'none';
        }

        ultimoFoco = document.activeElement;
        box.style.display = 'flex';
        // animación de entrada
        requestAnimationFrame(() => box.classList.add('visible'));
        document.body.style.overflow = 'hidden';
    }

    function cerrar() {
        const box = document.getElementById('qr-lightbox');
        if (!box) return;
        box.classList.remove('visible');
        // espera fin de transición
        setTimeout(() => {
            box.style.display = 'none';
            document.body.style.overflow = '';
            if (ultimoFoco && typeof ultimoFoco.focus === 'function') ultimoFoco.focus();
        }, 180);
    }

    function imprimir() {
        const img = document.getElementById('qr-lightbox-img');
        const titulo = document.getElementById('qr-lightbox-titulo').textContent;
        if (!img || !img.src) return;
        const w = window.open('', '_blank', 'width=600,height=700');
        if (!w) return;
        w.document.write(`
            <html><head><title>${titulo}</title>
            <style>
                body{font-family:system-ui,Arial,sans-serif;text-align:center;padding:30px;}
                h2{margin:0 0 6px;}
                p{color:#555;margin:0 0 24px;font-size:14px;}
                img{max-width:380px;width:100%;height:auto;image-rendering:pixelated;border:1px solid #ddd;padding:10px;border-radius:8px;}
            </style></head><body>
                <h2>${titulo}</h2>
                <p>Escanee con cualquier lector de QR</p>
                <img src="${img.src}" alt="QR">
                <script>window.onload=()=>setTimeout(()=>window.print(),200);<\/script>
            </body></html>`);
        w.document.close();
    }

    // Delegación automática: cualquier elemento con data-qr-abrir dispara el visor.
    document.addEventListener('click', (e) => {
        const t = e.target.closest('[data-qr-abrir]');
        if (!t) return;
        e.preventDefault();
        abrir({
            src:            t.dataset.qrAbrir,
            titulo:         t.dataset.qrTitulo,
            subtitulo:      t.dataset.qrSubtitulo,
            urlPublica:     t.dataset.qrPublico,
            descargaNombre: t.dataset.qrDescarga
        });
    });

    // Inicialización diferida (espera al DOM)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return { abrir, cerrar };
})();

document.addEventListener('DOMContentLoaded', () => {
    const API_BASE = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : (window.location && window.location.origin ? window.location.origin : 'http://localhost:3000');

    const apiFetch = (path, options = {}) => {
        return fetch(`${API_BASE}${path}`, options);
    };

    // ========== SESIÓN ==========
    // Usamos ambos almacenamientos para que la sesión sobreviva al cambio de HTML.
    const SESSION_KEY = 'sigepav_usuario';

    function guardarSesion(usuario) {
        const raw = JSON.stringify(usuario || null);
        try { sessionStorage.setItem(SESSION_KEY, raw); } catch (e) {}
        try { localStorage.setItem(SESSION_KEY, raw); } catch (e) {}
    }

    function leerSesion() {
        let raw = null;
        try { raw = sessionStorage.getItem(SESSION_KEY); } catch (e) {}
        if (!raw) {
            try { raw = localStorage.getItem(SESSION_KEY); } catch (e) {}
        }
        if (!raw) return null;
        try { return JSON.parse(raw); } catch (e) { return null; }
    }

    function limpiarSesion() {
        try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
        try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
        try { sessionStorage.removeItem('sigepav_abrir_modulo'); } catch (e) {}
        try { sessionStorage.removeItem('sigepav_redirect_after_login'); } catch (e) {}
        try { localStorage.removeItem('sigepav_redirect_after_login'); } catch (e) {}
    }

    // ========== LOGIN ==========
    const loginContainer = document.getElementById('login-container');
    const appContainer = document.getElementById('app-container');
    const loginForm = document.getElementById('login-form');
    const recoverForm = document.getElementById('recover-form');
    const forgotPasswordLink = document.getElementById('forgot-password-link');
    const backToLoginLink = document.getElementById('back-to-login-link');
    const logoutBtn = document.getElementById('logoutBtn');
    const userDisplaySpan = document.getElementById('user-email-display');

    const esPaginaLogin = document.body?.dataset.loginPage === 'true';
    const esPaginaModulo = !!document.body?.dataset.initialModule;

    const menuPrincipal      = document.getElementById('menu-principal');
    const registroComisiones = document.getElementById('registro-comisiones');
    const formMant           = document.getElementById('formulario-mantenimiento');
    const altaEdicionEl      = document.getElementById('alta-edicion');
    const consultaComisionesEl = document.getElementById('consulta-comisiones');
    const solicitudesFinalizacionEl = document.getElementById('solicitudes-finalizacion');
    const todasLasVistas = [menuPrincipal, registroComisiones, formMant, altaEdicionEl, consultaComisionesEl, solicitudesFinalizacionEl];

    function mostrarVista(vista) {
        todasLasVistas.forEach(v => {
            if (v) v.style.display = 'none';
        });

        if (vista) {
            vista.style.display = 'flex';
            animarNumerosEnSeccion(vista);
        }
    }

    async function doLogin(username, password) {
        try {
            const resp = await apiFetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await resp.json();

            if (!data.ok) {
                alert(data.error || 'Acceso denegado.');
                return false;
            }

            // Primer acceso: el admin creó la cuenta pero el usuario aún no configuró su contraseña
            if (data.primer_acceso) {
                guardarSesion(Object.assign({}, data.usuario, { primer_acceso: true }));
                window.location.href = 'primer-acceso.html';
                return true;
            }

            guardarSesion(data.usuario);
            registrarActividad(`Inicio de sesión: ${data.usuario.email} (${data.usuario.rol})`);

            // FIX: el servidor devuelve `rol` desde la tabla `roles` ('Administrador'
            // u 'Operativo'). Antes se comparaba con 'usuario' y nunca coincidía,
            // por lo que el usuario operativo se quedaba en el panel del admin.
            // Match tolerante a mayúsculas / variantes.
            const rolNorm = String(data.usuario.rol || '').trim().toLowerCase();
            const esAdmin = (rolNorm === 'administrador' || rolNorm === 'admin');

            if (!esAdmin) {
                window.location.href = 'Usuario.html';
                return true;
            }

            // En la versión separada, index.html es sólo login.
            // Si el usuario venía intentando abrir un formulario, regresamos ahí.
            if (esPaginaLogin || !appContainer) {
                let destino = null;
                try { destino = sessionStorage.getItem('sigepav_redirect_after_login'); } catch (e) {}
                if (!destino) {
                    try { destino = localStorage.getItem('sigepav_redirect_after_login'); } catch (e) {}
                }
                try { sessionStorage.removeItem('sigepav_redirect_after_login'); } catch (e) {}
                try { localStorage.removeItem('sigepav_redirect_after_login'); } catch (e) {}

                if (destino && destino !== 'index.html' && destino !== 'menu.html') {
                    window.location.href = destino;
                } else {
                    window.location.href = 'menu.html';
                }
                return true;
            }

            if (userDisplaySpan) userDisplaySpan.textContent = data.usuario.email || data.usuario.nombre || 'Usuario';
            if (loginContainer) loginContainer.style.display = 'none';
            if (appContainer) appContainer.style.display = 'flex';

            // Reaplica cursor:pointer/tooltip al header ya visible
            if (typeof window.__sigepav_marcarSigepav === 'function') {
                window.__sigepav_marcarSigepav();
            }

            mostrarVista(menuPrincipal);
            cargarDashboard();
            // Inicializar la campana de notificaciones del admin (polling)
            if (window.SIGEPAV && SIGEPAV.modulos && SIGEPAV.modulos.notificacionesAdmin) {
                SIGEPAV.modulos.notificacionesAdmin.inicializar();
            }
            // Si veníamos de la página antigua consultas.html, abrir el módulo directamente
            try {
                const pendiente = sessionStorage.getItem('sigepav_abrir_modulo');
                if (pendiente === 'consulta-comisiones' && SIGEPAV.modulos.consultaComisiones) {
                    sessionStorage.removeItem('sigepav_abrir_modulo');
                    SIGEPAV.modulos.consultaComisiones.abrir();
                }
            } catch (e) { /* sessionStorage puede no estar disponible */ }
            return true;
        } catch (err) {
            console.error('Error en login:', err);
            alert('No se pudo conectar con el servidor. ¿El servidor Node está corriendo?');
            return false;
        }
    }

    async function cargarDashboard() {
        try {
            const resp = await apiFetch('/api/dashboard');
            const data = await resp.json();
            if (!data.ok) return;

            const cards = menuPrincipal ? menuPrincipal.querySelectorAll('.card-numero[data-valor]') : [];
            const valores = [
                data.vehiculos_activos,
                data.vales_mes,
                data.alertas_pendientes,
                data.fallas_sin_atender
            ];

            cards.forEach((c, i) => {
                if (valores[i] !== undefined) {
                    c.setAttribute('data-valor', valores[i]);
                    c.classList.remove('animado');
                    c.textContent = '0';
                }
            });

            animarNumerosEnSeccion(menuPrincipal);
        } catch (err) {
            console.warn('No se pudo cargar dashboard:', err);
        }
    }

    function doLogout() {
        limpiarSesion();
        registrarActividad('Cierre de sesión');
        window.location.href = 'index.html';
    }

    function mostrarRecuperacionPassword() {
        if (loginForm) loginForm.style.display = 'none';
        const recoverSuccess = document.getElementById('recover-success');
        if (recoverSuccess) recoverSuccess.style.display = 'none';
        if (recoverForm) {
            recoverForm.style.display = 'block';
            const recoverEmail = document.getElementById('recover-email');
            const loginUser = document.getElementById('login-user');
            // Si lo que escribió en el login parece un correo, lo pre-llenamos
            if (recoverEmail && loginUser && loginUser.value && loginUser.value.includes('@')) {
                recoverEmail.value = loginUser.value;
            }
            setTimeout(() => recoverEmail?.focus(), 50);
        }
    }

    function mostrarLoginPassword() {
        if (recoverForm) recoverForm.style.display = 'none';
        const recoverSuccess = document.getElementById('recover-success');
        if (recoverSuccess) recoverSuccess.style.display = 'none';
        if (loginForm) {
            loginForm.style.display = 'block';
            setTimeout(() => document.getElementById('login-user')?.focus(), 50);
        }
    }

    // Toast bonito para reemplazar alert() en la pantalla de login
    function mostrarToastLogin(mensaje, tipo) {
        // tipo: 'success' | 'error' | 'info'
        const toast = document.getElementById('login-toast');
        if (!toast) { alert(mensaje); return; }
        toast.textContent = mensaje;
        toast.className = 'login-toast login-toast-' + (tipo || 'info') + ' show';
        clearTimeout(window.__sigepav_toast_timer);
        window.__sigepav_toast_timer = setTimeout(() => {
            toast.classList.remove('show');
        }, 4500);
    }

    // ── Nuevo flujo: solo se solicita el enlace por correo. La nueva
    // contraseña se captura en restablecer-password.html (página separada).
    async function solicitarRecuperacion(email) {
        email = String(email || '').trim().toLowerCase();
        if (!email) {
            mostrarToastLogin('Captura tu correo electrónico.', 'error');
            return false;
        }
        const reEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!reEmail.test(email)) {
            mostrarToastLogin('El correo no tiene un formato válido.', 'error');
            return false;
        }

        const btn = document.getElementById('recover-submit-btn');
        const textoOriginal = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
        }

        try {
            const resp = await apiFetch('/api/solicitar-recuperacion', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await resp.json().catch(() => ({}));

            // Manejo de errores específicos
            if (!resp.ok || !data.ok) {
                // 404 = correo no registrado, 403 = cuenta desactivada,
                // 400 = formato inválido, 429 = rate limit, 500 = error servidor
                const mensaje = data.error
                    || (resp.status === 429
                        ? 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.'
                        : 'No se pudo procesar la solicitud.');
                mostrarToastLogin(mensaje, 'error');

                // Si el correo no existe, marcamos el input visualmente y le damos foco
                if (resp.status === 404) {
                    const inputEmail = document.getElementById('recover-email');
                    if (inputEmail) {
                        inputEmail.classList.add('input-error');
                        inputEmail.focus();
                        inputEmail.select();
                        // Quitar la clase de error en cuanto el usuario empiece a escribir
                        inputEmail.addEventListener('input', function quitarError() {
                            inputEmail.classList.remove('input-error');
                            inputEmail.removeEventListener('input', quitarError);
                        });
                    }
                }
                return false;
            }

            // Éxito real: el correo SÍ existía y se mandó el email
            if (recoverForm) recoverForm.style.display = 'none';
            const recoverSuccess = document.getElementById('recover-success');
            if (recoverSuccess) recoverSuccess.style.display = 'block';
            // Pintamos el correo al que se envió para confirmar al usuario
            const correoEnviadoSpan = document.getElementById('correo-enviado-a');
            if (correoEnviadoSpan) correoEnviadoSpan.textContent = email;
            return true;
        } catch (err) {
            console.error('Error solicitando recuperación:', err);
            mostrarToastLogin('No se pudo conectar con el servidor. Inténtalo más tarde.', 'error');
            return false;
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = textoOriginal;
            }
        }
    }

    if (forgotPasswordLink) forgotPasswordLink.addEventListener('click', mostrarRecuperacionPassword);
    if (backToLoginLink) backToLoginLink.addEventListener('click', mostrarLoginPassword);

    const successBackLink = document.getElementById('success-back-link');
    if (successBackLink) successBackLink.addEventListener('click', mostrarLoginPassword);

    if (recoverForm) {
        recoverForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await solicitarRecuperacion(
                document.getElementById('recover-email')?.value || ''
            );
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('login-user')?.value || '';
            const password = document.getElementById('login-password')?.value || '';
            if (window.sigepavLoading) window.sigepavLoading.show('Iniciando sesión...');
            try {
                await doLogin(username, password);
            } finally {
                if (window.sigepavLoading) window.sigepavLoading.hide();
            }
        });
    }

    if (logoutBtn) logoutBtn.addEventListener('click', doLogout);

    // ========== RESTAURAR SESIÓN ACTIVA ==========
    // Si el usuario ya inició sesión y regresa a index.html (desde otra
    // página via navbar), sessionStorage aún tiene la sesión. En ese caso
    // mostramos directamente la app sin pedir login de nuevo.
    (function restaurarSesion() {
        const sesionGuardada = leerSesion();

        if (!sesionGuardada) {
            // Las páginas separadas no contienen login; sin sesión regresan al login.
            if (!esPaginaLogin && (appContainer || esPaginaModulo)) {
                window.location.replace('index.html');
            }
            return;
        }

        // IMPORTANTE: index.html ahora es login puro.
        // Aunque exista una sesión anterior en localStorage/sessionStorage, NO redirigimos
        // automáticamente al menú. Ese auto-redirect era el bug que hacía:
        // formulario → login → menú sin dejar navegar entre formularios.
        if (esPaginaLogin) {
            if (loginContainer) loginContainer.style.display = 'flex';
            if (appContainer) appContainer.style.display = 'none';
            return;
        }

        // Hay sesión guardada: restaurar la UI directamente
        if (userDisplaySpan) userDisplaySpan.textContent = sesionGuardada.email || sesionGuardada.nombre || 'Usuario';
        if (loginContainer) loginContainer.style.display = 'none';
        if (appContainer) appContainer.style.display = 'flex';

        if (typeof window.__sigepav_marcarSigepav === 'function') {
            window.__sigepav_marcarSigepav();
        }

        // En páginas de formulario NO forzamos el menú. pagina-modulo.js abrirá
        // el formulario correcto cuando todo Script.js termine de inicializarse.
        if (!esPaginaModulo) {
            mostrarVista(menuPrincipal);
            cargarDashboard();
        }

        if (window.SIGEPAV && SIGEPAV.modulos && SIGEPAV.modulos.notificacionesAdmin) {
            SIGEPAV.modulos.notificacionesAdmin.inicializar();
        }
    })();

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
            const final = parseInt(el.getAttribute('data-valor'), 10);
            if (!Number.isNaN(final) && !el.classList.contains('animado')) {
                animarConteo(el, final);
            }
        });
    }

    // ========== DROPDOWN DE MÓDULOS ==========
    const btnDropdown = document.getElementById('btnDropdownGlobal');
    const dropdownMenu = document.getElementById('dropdownMenuGlobal');

    async function cargarVehiculosEnSelect(selectId) {
        const sel = document.getElementById(selectId);
        if (!sel) return;

        const placeholder = sel.querySelector('option[value=""]');

        function poblarDesdeArray(vehiculos) {
            sel.innerHTML = '';
            if (placeholder) sel.appendChild(placeholder);
            vehiculos.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.id;
                opt.textContent = `${v.marca || ''} ${v.linea || ''} ${v.modelo || ''} (No. Eco ${v.no_economico || v.eco || '—'})`.replace(/\s+/g, ' ').trim();
                opt.dataset.combustible = v.combustible || '';
                opt.dataset.km = v.km_actual || v.km || 0;
                sel.appendChild(opt);
            });
        }

        // Cargar vehículos desde la base de datos vía API
        try {
            const resp = await apiFetch('/api/vehiculos');
            const data = await resp.json();
            if (data.ok && data.vehiculos && data.vehiculos.length > 0) {
                poblarDesdeArray(data.vehiculos);
                return;
            }
            // API respondió OK pero sin vehículos
            sel.innerHTML = '';
            if (placeholder) sel.appendChild(placeholder);
            const opt = document.createElement('option');
            opt.disabled = true;
            opt.textContent = 'Sin vehículos registrados — agrégalos en Altas, edición y consultas';
            sel.appendChild(opt);
        } catch (err) {
            console.error('Error al cargar vehículos desde la API:', err);
            sel.innerHTML = '';
            if (placeholder) sel.appendChild(placeholder);
            const opt = document.createElement('option');
            opt.disabled = true;
            opt.textContent = 'Error al cargar vehículos — verifique que el servidor esté corriendo';
            sel.appendChild(opt);
        }
    }

    function esSesionAdmin(sesion) {
        const rol = String(sesion?.rol || '').trim().toLowerCase();
        return sesion?.rol_id === 1 || rol === 'admin' || rol === 'administrador';
    }

    function nombreCompletoUsuario(usuario) {
        // En alta de usuarios, `nombre` guarda el nombre de usuario/login
        // y `apellidos` guarda el nombre completo capturado por el admin.
        return String(usuario?.apellidos || usuario?.nombre || '').replace(/\s+/g, ' ').trim();
    }

    async function configurarResponsableComision() {
        let campo = document.getElementById('responsable');
        if (!campo) return;

        const sesion = leerSesion() || {};
        const admin = esSesionAdmin(sesion);

        if (!admin) {
            const nombreCompleto = nombreCompletoUsuario(sesion) || 'Usuario';
            campo.value = nombreCompleto;
            campo.readOnly = true;
            campo.disabled = false;
            campo.title = 'Se toma automáticamente de la sesión actual';
            return;
        }

        if (campo.tagName !== 'SELECT') {
            const select = document.createElement('select');
            select.id = campo.id;
            select.className = campo.className || 'select-estilizado';
            if (!select.classList.contains('select-estilizado')) select.classList.add('select-estilizado');
            select.style.cssText = '';
            select.title = 'Seleccione el usuario responsable de la comisión';
            campo.replaceWith(select);
            campo = select;
        }

        campo.disabled = true;
        campo.innerHTML = '<option value="">Cargando usuarios...</option>';

        try {
            const resp = await apiFetch('/api/usuarios');
            const data = await resp.json();
            if (!data.ok) throw new Error(data.error || 'No se pudieron cargar los usuarios.');

            const usuarios = (data.usuarios || []).filter(u => {
                const rol = String(u.rol || '').trim().toLowerCase();
                return u.activo !== 0 && u.rol_id !== 1 && rol !== 'admin' && rol !== 'administrador';
            });

            campo.innerHTML = '<option value="">-- Seleccione usuario responsable --</option>';
            usuarios.forEach(u => {
                const nombreCompleto = nombreCompletoUsuario(u);
                if (!nombreCompleto) return;
                const opt = document.createElement('option');
                opt.value = u.id;
                opt.textContent = nombreCompleto;
                opt.dataset.nombre = nombreCompleto;
                campo.appendChild(opt);
            });

            if (campo.options.length === 1) {
                const opt = document.createElement('option');
                opt.disabled = true;
                opt.textContent = 'No hay usuarios operativos activos';
                campo.appendChild(opt);
            }
        } catch (err) {
            console.error('Error al cargar usuarios responsables:', err);
            campo.innerHTML = '<option value="">Error al cargar usuarios responsables</option>';
        } finally {
            campo.disabled = false;
        }
    }

    async function abrirRegistroComisiones() {
        mostrarVista(registroComisiones);

        const fechaViaje = document.getElementById('fecha-viaje');
        // Nota: el campo `no-viaje` ahora es un <select> de vales disponibles
        // (default S/V). Lo llena vales-combo.js automáticamente. Por eso ya
        // no autogeneramos un número aquí.

        if (fechaViaje && !fechaViaje.value) {
            fechaViaje.value = new Date().toISOString().split('T')[0];
        }

        await configurarResponsableComision();

        actualizarMedidor(0);
        await cargarVehiculosEnSelect('vehiculo-comision');
        registrarActividad('Módulo: Registro de comisiones');
    }

    async function abrirMantenimiento() {
        mostrarVista(formMant);
        await cargarVehiculosEnSelect('vehiculo-select');

        const sel = document.getElementById('vehiculo-select');
        if (sel) {
            // En el módulo separado de mantenimiento no dejamos ejemplos locales:
            // se selecciona el primer vehículo real de la BD y se carga su historial.
            if (!sel.value && sel.options.length > 1) sel.selectedIndex = 1;
            if (sel.value) await cargarMantenimientoDeVehiculo(sel.value);
            else limpiarMantenimientoSinVehiculo();
        }

        registrarActividad('Módulo: Mantenimiento');
    }

    function limpiarMantenimientoSinVehiculo() {
        const infoSpans = document.querySelector('.info-vehiculo');
        if (infoSpans) {
            infoSpans.innerHTML = '<span><strong>Seleccione un vehículo para consultar la información desde la base de datos.</strong></span>';
        }
        const cards = formMant ? formMant.querySelectorAll('.resumen-mantenimiento .card-numero') : [];
        cards.forEach((c, i) => {
            c.classList.remove('animado');
            c.setAttribute('data-valor', '0');
            c.textContent = i === 2 ? '$0' : '0';
        });
        const hist = formMant?.querySelector('.historial-observaciones');
        if (hist) {
            hist.querySelectorAll('.observacion-card, .estado-vacio').forEach(c => c.remove());
            hist.insertAdjacentHTML('beforeend', '<div class="estado-vacio" id="mant-obs-empty"><i class="fas fa-database"></i><p>Seleccione un vehículo para cargar sus observaciones de mantenimiento.</p></div>');
        }
    }

    async function cargarMantenimientoDeVehiculo(vehiculoId) {
        if (!vehiculoId) {
            limpiarMantenimientoSinVehiculo();
            return;
        }
        try {
            const resp = await apiFetch(`/api/mantenimiento/${vehiculoId}`);
            const data = await resp.json();
            if (!data.ok) throw new Error(data.error || 'Error al cargar mantenimiento');

            const sel = document.getElementById('vehiculo-select');
            const opt = sel?.options?.[sel.selectedIndex];
            const infoSpans = document.querySelector('.info-vehiculo');

            if (infoSpans && opt) {
                const matchEco = opt.textContent.match(/Eco\s([^)]+)\)/i);
                infoSpans.innerHTML = `
                    <span><strong>No. Eco:</strong> ${matchEco?.[1] || '—'}</span>
                    <span><strong>Combustible:</strong> ${opt.dataset.combustible || '—'}</span>
                    <span><strong>Kilometraje:</strong> ${Number(opt.dataset.km || 0).toLocaleString()} km</span>
                    <span><strong>Fuente:</strong> Base de datos SIGEPAV</span>
                `;
            }

            const observacionesBD = Array.isArray(data.observaciones) ? data.observaciones : [];
            const cards = formMant ? formMant.querySelectorAll('.resumen-mantenimiento .card-numero') : [];
            const total = Number(data.resumen?.total || 0);
            const resueltas = Number(data.resumen?.resueltas || 0);
            const costoTotal = Number(data.resumen?.costo_total || 0);
            const conteoComponentes = {};
            observacionesBD.forEach(o => {
                const comp = String(o.componente || 'Sin clasificar').trim() || 'Sin clasificar';
                conteoComponentes[comp] = (conteoComponentes[comp] || 0) + 1;
            });
            const recurrente = Object.entries(conteoComponentes).sort((a, b) => b[1] - a[1])[0];

            if (cards[0]) cards[0].setAttribute('data-valor', total);
            if (cards[1]) cards[1].setAttribute('data-valor', resueltas);
            if (cards[2]) cards[2].setAttribute('data-valor', Math.round(costoTotal));
            if (cards[3]) {
                cards[3].setAttribute('data-valor', recurrente ? recurrente[1] : 0);
                cards[3].dataset.textoFinal = recurrente ? `${recurrente[0]} (${recurrente[1]})` : '—';
            }

            cards.forEach((c, i) => {
                c.classList.remove('animado');
                c.textContent = i === 2 ? '$0' : '0';
            });
            animarNumerosEnSeccion(formMant);
            if (cards[3] && cards[3].dataset.textoFinal) {
                setTimeout(() => { cards[3].textContent = cards[3].dataset.textoFinal; }, 350);
            }

            const hist = formMant?.querySelector('.historial-observaciones');
            if (hist) {
                hist.querySelectorAll('.observacion-card, .estado-vacio').forEach(c => c.remove());

                if (!observacionesBD.length) {
                    hist.insertAdjacentHTML('beforeend', '<div class="estado-vacio" id="mant-obs-empty"><i class="fas fa-clipboard"></i><p>Este vehículo no tiene observaciones de mantenimiento registradas en la base de datos.</p></div>');
                    return;
                }

                observacionesBD.forEach(o => {
                    const estadoTxt = String(o.estado || 'pendiente');
                    const estadoClase = estadoTxt.toLowerCase().includes('resuelto') ? 'finalizada' : 'pendiente';
                    const kmReporte = Number(o.km_reporte || o.km || 0);
                    const card = document.createElement('div');
                    card.className = `observacion-card sev-${o.severidad || 'media'}`;
                    card.innerHTML = `
                        <div class="obs-header">
                            <span class="obs-tipo">${(o.componente || '').toUpperCase()}</span>
                            <span class="obs-severidad ${o.severidad || ''}">${o.severidad || ''}</span>
                            <span class="obs-fecha">${o.created_at?.substring(0, 16) || ''}</span>
                            <span class="obs-estado ${estadoClase}">${estadoTxt}</span>
                        </div>
                        <p>${o.descripcion || ''}</p>
                        ${o.codigo_ref ? `<div class="obs-resolucion"><i class="fas fa-barcode"></i> Código/ref.: ${o.codigo_ref}</div>` : ''}
                        ${o.resolucion ? `<div class="obs-resolucion"><i class="fas fa-check"></i> Resolución: ${o.resolucion}</div>` : ''}
                        <div class="obs-detalles">
                            ${kmReporte ? `<span><i class="fas fa-tachometer-alt"></i> ${kmReporte.toLocaleString()} km</span>` : ''}
                            <span><i class="fas fa-dollar-sign"></i> $${Number(o.costo || 0).toLocaleString()}</span>
                            ${o.usuario_nombre ? `<span><i class="fas fa-user"></i> Responsable: ${o.usuario_nombre}</span>` : ''}
                        </div>
                    `;
                    hist.appendChild(card);
                });
            }
        } catch (err) {
            console.warn('Error cargando mantenimiento:', err);
            mostrarAviso('Error de mantenimiento', 'No se pudo cargar el historial de mantenimiento desde la base de datos.');
        }
    }

    function demoModulo(nombre) {
        registrarActividad(`Acceso a módulo: ${nombre}`);
        mostrarAviso(`Módulo "${nombre}"`, 'Funcionalidad en desarrollo. Esta sección estará disponible próximamente.');
    }

    // En la versión con HTML separados, navbar.js + modulos-router.js se encargan
    // del menú global. No amarramos aquí los .modulo-dropdown porque este bloque
    // abre vistas internas antiguas y causa bugs como: entrar a Mantenimiento y
    // terminar en Login/Menú, o abrir 'Registrar carros' en lugar de Altas.
    const usarNavbarSeparado = !!document.getElementById('dropdown-modulos-principal');

    if (btnDropdown && dropdownMenu && !usarNavbarSeparado) {
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
                const modulo = item.getAttribute('data-modulo');
                const nombre = item.innerText.trim();

                if (modulo === 'registro-comisiones') {
                    abrirRegistroComisiones();
                } else if (modulo === 'mantenimiento') {
                    abrirMantenimiento();
                } else if (modulo === 'alta-edicion') {
                    SIGEPAV.modulos.altaEdicion.abrir();
                } else if (modulo === 'consulta-comisiones') {
                    SIGEPAV.modulos.consultaComisiones.abrir();
                } else if (modulo === 'solicitudes-finalizacion') {
                    SIGEPAV.modulos.solicitudesFinalizacion.abrir();
                } else if (modulo === 'agregar-usuario') {
                    window.location.href = 'Agregar.html';
                } else if (modulo === 'expediente') {
                    window.location.href = 'expediente.html';
                } else if (modulo === 'bitacora') {
                    window.location.href = 'historial.html';
                } else if (modulo === 'reportes') {
                    window.location.href = 'reportes.html';
                } else if (modulo === 'respaldos') {
                    window.location.href = 'respaldos.html';
                } else if (modulo === 'dashboard') {
                    window.location.href = 'dashboard.html';
                } else if (modulo === 'alertas') {
                    // Coincide con RUTAS_MODULOS de modulos-router.js. Antes mandaba a
                    // vehiculos.html, que ni era la página de alertas ni existe ya.
                    window.location.href = 'vencimientos.html';
                } else if (modulo === 'control-combustible') {
                    window.location.href = 'reg-vales.html';
                } else {
                    demoModulo(nombre);
                }

                // Marcar visualmente la opción activa
                document.querySelectorAll('.modulo-dropdown').forEach(m => m.classList.remove('activo'));
                item.classList.add('activo');

                dropdownMenu.classList.remove('show');
            });
        });
    }

    // FIX (req 6): la navegación de regreso al menú principal ahora se hace
    // ÚNICAMENTE haciendo clic en "SIGEPAV" de la barra superior. Los botones
    // "Volver al menú" fueron eliminados de los HTML.
    function volverAlMenuPrincipal() {
        if (esPaginaModulo) {
            window.location.href = 'menu.html';
            return;
        }
        mostrarVista(menuPrincipal);
        document.querySelectorAll('.modulo-dropdown').forEach(m => m.classList.remove('activo'));
        registrarActividad('Regreso al menú principal');
    }

    // FIX: usar delegación de eventos en document para que funcione aunque el
    // header esté oculto en la carga inicial (display:none del #app-container)
    // o aunque algún re-render lo haya reemplazado.
    document.addEventListener('click', (e) => {
        const t = e.target.closest('.titulo-sistema, .titulo-sistema h1, .logo-barra');
        if (!t) return;
        // Sólo si el header pertenece a la barra superior (no a otros elementos)
        if (!t.closest('.barra-superior')) return;
        volverAlMenuPrincipal();
    });

    // Estilos visuales (cursor pointer + tooltip): se aplican al header completo
    // dentro de la barra superior, incluso si está oculto al cargar.
    function marcarSigepavClickeable() {
        document.querySelectorAll('.barra-superior .titulo-sistema, .barra-superior .titulo-sistema h1, .barra-superior .logo-barra').forEach(el => {
            el.style.cursor = 'pointer';
            el.title = 'Volver al menú principal';
        });
    }
    marcarSigepavClickeable();
    // Reaplica los estilos después del login (cuando el header se hace visible)
    window.__sigepav_marcarSigepav = marcarSigepavClickeable;

    // Compatibilidad: si quedara algún botón viejo .btn-volver-menu, sigue funcionando
    document.querySelectorAll('.btn-volver-menu').forEach(btn => {
        btn.addEventListener('click', volverAlMenuPrincipal);
    });

    // ========== MODAL DE AVISO ==========
    const modalOverlay = document.getElementById('modal-overlay');
    const modalAviso = document.getElementById('modal-aviso');
    const modalTitulo = document.getElementById('modal-titulo');
    const modalMensaje = document.getElementById('modal-mensaje');
    const modalBtnAceptar = document.getElementById('modal-btn-aceptar');

    function mostrarAviso(titulo, mensaje, callback, tipo) {
        if (modalTitulo) modalTitulo.textContent = titulo;
        if (modalMensaje) modalMensaje.textContent = mensaje;

        // Ícono y botón según el tipo: 'success' = palomita verde + botón verde.
        const icono = modalAviso ? modalAviso.querySelector('.modal-icono') : null;
        if (icono) {
            icono.className = (tipo === 'success')
                ? 'fas fa-check-circle modal-icono modal-icono-verde'
                : 'fas fa-exclamation-triangle modal-icono';
        }
        if (modalBtnAceptar) modalBtnAceptar.classList.toggle('btn-exito', tipo === 'success');

        if (modalOverlay) modalOverlay.style.display = 'block';
        if (modalAviso) modalAviso.style.display = 'block';
        if (modalBtnAceptar) modalBtnAceptar.focus();

        if (modalBtnAceptar) {
            modalBtnAceptar.onclick = () => {
                ocultarAviso();
                if (callback) callback();
            };
        }
    }

    function ocultarAviso() {
        if (modalOverlay) modalOverlay.style.display = 'none';
        if (modalAviso) modalAviso.style.display = 'none';
    }

    // ========== REGISTRO DE COMISIONES ==========
    const gaugeFill = document.getElementById('gauge-fill');
    const gaugeValue = document.getElementById('gauge-value');
    const etiquetaTanque = document.getElementById('etiqueta-tanque');
    const vehiculoComision = document.getElementById('vehiculo-comision');
    const btnVerificarCombustible = document.getElementById('btn-verificar-combustible');

    // Mostrar info del vehículo seleccionado bajo el select
    function mostrarInfoVehiculoSeleccionado(opt) {
        let infoEl = document.getElementById('info-vehiculo-comision');
        if (!infoEl) {
            infoEl = document.createElement('div');
            infoEl.id = 'info-vehiculo-comision';
            infoEl.style.cssText = 'margin-top:0.5rem;padding:0.6rem 1rem;background:#e6f0fa;border-radius:8px;font-size:0.85rem;color:#002b60;display:flex;gap:1.5rem;flex-wrap:wrap;border-left:3px solid #006dc8;';
            vehiculoComision?.parentNode?.appendChild(infoEl);
        }
        if (!opt || !opt.value) {
            infoEl.style.display = 'none';
            return;
        }
        const comb = opt.dataset.combustible || '—';
        const km   = Number(opt.dataset.km || 0).toLocaleString('es-MX');
        infoEl.style.display = 'flex';
        infoEl.innerHTML = `
            <span><i class="fas fa-gas-pump" style="margin-right:4px;color:#006dc8"></i><strong>Combustible:</strong> ${comb}</span>
            <span><i class="fas fa-tachometer-alt" style="margin-right:4px;color:#006dc8"></i><strong>Km actual:</strong> ${km} km</span>
        `;
        // Pre-llenar el kilometraje inicial si está vacío
        const kmInput = document.getElementById('kilometraje');
        if (kmInput && !kmInput.value) kmInput.value = opt.dataset.km || '';
    }

    if (vehiculoComision) {
        vehiculoComision.addEventListener('change', function () {
            const opt = this.options[this.selectedIndex];
            mostrarInfoVehiculoSeleccionado(opt);
        });
    }

    function generarNumeroViaje() {
        const ahora = new Date();
        const año = ahora.getFullYear();
        const mes = String(ahora.getMonth() + 1).padStart(2, '0');
        const dia = String(ahora.getDate()).padStart(2, '0');
        return `VJ-${año}${mes}${dia}-001`;
    }

    function actualizarMedidor(porcentaje) {
        // FIX (req 1): exponer el último porcentaje capturado para que el
        // handler de "Iniciar viaje" lo pueda enviar al backend como nivel_comb_ini.
        window.__sigepav_nivel_comb_actual = porcentaje;

        if (!gaugeFill || !gaugeValue || !etiquetaTanque) return;

        const degrees = -90 + (porcentaje / 100) * 180;
        gaugeFill.style.transform = `rotate(${degrees}deg)`;
        gaugeValue.textContent = `${porcentaje}%`;

        etiquetaTanque.textContent =
            porcentaje >= 80 ? 'Nivel alto' :
            porcentaje >= 50 ? 'Medio tanque' :
            porcentaje >= 25 ? 'Nivel bajo' :
            porcentaje > 0 ? 'Crítico' : '';
    }

    const modalMedidor = document.getElementById('modal-medidor');
    const iframeMedidor = document.getElementById('iframe-medidor');

    function abrirMedidor() {
        if (!iframeMedidor || !modalMedidor || !modalOverlay) return;
        iframeMedidor.src = window.sigepavUrl(`${window.FUEL_BASE || ((window.API_BASE || window.location.origin) + '/gasolina')}/?t=${Date.now()}`);
        modalOverlay.style.display = 'block';
        modalMedidor.style.display = 'block';
    }

    function cerrarMedidor() {
        if (modalOverlay) modalOverlay.style.display = 'none';
        if (modalMedidor) modalMedidor.style.display = 'none';
        if (iframeMedidor) iframeMedidor.src = '';
    }

    window.addEventListener('message', (event) => {
        if (!event.data || typeof event.data !== 'object') return;

        if (event.data.tipo === 'medidor-confirmar') {
            const porcentaje = Math.round(event.data.percentage);
            actualizarMedidor(porcentaje);
            cerrarMedidor();
            console.log('Nivel de combustible registrado:', porcentaje + '%');
        } else if (event.data.tipo === 'medidor-cancelar') {
            cerrarMedidor();
        }
    });

    if (btnVerificarCombustible) {
        btnVerificarCombustible.addEventListener('click', () => {
            const vehiculo = vehiculoComision?.value;
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
                    mostrarAviso(
                        'Error de conexión',
                        'No se pudo conectar con el servidor de combustible. Asegúrese de que el archivo Gasolina.py esté en ejecución y que el servidor esté disponible en el servidor de combustible'
                    );
                });
        });
    }

    const btnCancelarViaje = document.getElementById('btn-cancelar-viaje');
    if (btnCancelarViaje) {
        btnCancelarViaje.addEventListener('click', () => mostrarVista(menuPrincipal));
    }

    const btnIniciarConfirm = document.getElementById('btn-iniciar-viaje-confirm');
    if (btnIniciarConfirm) {
        btnIniciarConfirm.addEventListener('click', async () => {
            // FIX (req 1): el registro de comisiones del admin ahora persiste
            // TODOS los campos del formulario en la tabla `viajes` usando
            // /api/comisiones (no /api/viajes, que sólo guardaba lo básico).
            const fecha     = document.getElementById('fecha-viaje')?.value || null;
            // El select de vales tiene value="" para S/V y value=id para vales disponibles
            const valeId    = document.getElementById('no-viaje')?.value || '';
            // El número de oficio NO se lee del DOM: lo genera el servidor (CM-DD-MM-AA-NN).
            const lugar     = document.getElementById('lugar-destino')?.value.trim() || '';
            const vehiculo_id = vehiculoComision?.value || '';
            const responsableEl = document.getElementById('responsable');
            const sesion    = leerSesion() || {};
            const admin     = esSesionAdmin(sesion);
            const usuarioResponsableId = admin
                ? parseInt(responsableEl?.value || '', 10)
                : parseInt(sesion.id || '', 10);
            const responsable = admin
                ? (responsableEl?.selectedOptions?.[0]?.dataset?.nombre || responsableEl?.selectedOptions?.[0]?.textContent || '').trim()
                : (responsableEl?.value || nombreCompletoUsuario(sesion) || 'Usuario').trim();
            const km        = parseInt(document.getElementById('kilometraje')?.value, 10);
            const motivo    = document.getElementById('motivo-viaje')?.value.trim() || '';
            const nivelIni  = (typeof window.__sigepav_nivel_comb_actual === 'number' && window.__sigepav_nivel_comb_actual > 0)
                ? String(window.__sigepav_nivel_comb_actual) : null;

            if (!lugar || !vehiculo_id || !km) {
                mostrarAviso('Campos incompletos', 'Complete los campos obligatorios: Lugar/Destino, Vehículo y Kilometraje.');
                return;
            }
            if (!sesion.id) {
                mostrarAviso('Sesión inválida', 'No se detectó usuario en sesión. Vuelva a iniciar sesión.');
                return;
            }
            if (!usuarioResponsableId || !responsable) {
                mostrarAviso('Usuario responsable requerido', 'Seleccione el usuario responsable de la comisión.');
                return;
            }

            const btnTxt = btnIniciarConfirm.innerHTML;
            btnIniciarConfirm.disabled = true;
            btnIniciarConfirm.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

            try {
                const payload = {
                    usuario_id:    usuarioResponsableId,
                    vehiculo_id:   parseInt(vehiculo_id, 10),
                    vale_id:       valeId || null,         // el server completa los datos del vale
                    // oficio NO se envía: el servidor lo genera (CM-DD-MM-AA-NN).
                    responsable:   responsable,
                    lugar_destino: lugar,
                    // Campos separados (vienen de los combos del catálogo INEGI)
                    estadoDst:     document.getElementById('dest-estado-nombre')?.value.trim() || null,
                    municipio:     document.getElementById('dest-municipio-nombre')?.value.trim() || null,
                    localidad:     document.getElementById('dest-localidad-nombre')?.value.trim() || null,
                    motivo:        motivo,
                    kmIni:         km,
                    nivel_comb_ini: nivelIni,
                    inicio:        fecha,
                    estado:        'En comision'
                };

                const resp = await apiFetch('/api/comisiones', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify(payload)
                });
                const data = await resp.json();
                if (!data.ok) throw new Error(data.error || 'Error desconocido del servidor');

                const oficioAsignado = data.no_oficio || '(sin asignar)';
                mostrarAviso(
                    'Comisión registrada',
                    `Comisión #${data.id} registrada correctamente.\n\nNúmero de oficio asignado: ${oficioAsignado}`,
                    () => {
                        // Limpiar el formulario (oficio-no se restablece a su mensaje placeholder)
                        ['lugar-destino','kilometraje','motivo-viaje','responsable']
                            .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
                        const oficioInput = document.getElementById('oficio-no');
                        if (oficioInput) oficioInput.value = 'Se asignará al guardar (formato CM-DD-MM-AA-NN)';
                        if (vehiculoComision) vehiculoComision.value = '';
                        actualizarMedidor(0);
                        if (esPaginaModulo) { window.location.href = 'menu.html'; } else { mostrarVista(menuPrincipal); }
                    },
                    'success');

                registrarActividad(`Comisión registrada (${oficioAsignado}): ${lugar} (vehículo ${vehiculo_id})`);
            } catch (err) {
                mostrarAviso('Error', 'No se pudo guardar la comisión: ' + err.message);
            } finally {
                btnIniciarConfirm.disabled = false;
                btnIniciarConfirm.innerHTML = btnTxt;
            }
        });
    }

    // ========== LÓGICA DE MANTENIMIENTO ==========
    const estadoSelect = document.getElementById('estado-observacion');
    const campoResolucion = document.getElementById('campo-resolucion');

    if (estadoSelect && campoResolucion) {
        estadoSelect.addEventListener('change', function () {
            campoResolucion.style.display = this.value === 'resuelto' ? 'flex' : 'none';
            if (this.value !== 'resuelto') {
                const resolucion = document.getElementById('resolucion');
                if (resolucion) resolucion.value = '';
            }
        });
    }

    const btnGuardar = document.getElementById('btn-guardar-observacion');
    if (btnGuardar) {
        btnGuardar.addEventListener('click', async () => {
            const tipoSelect = document.getElementById('tipo-observacion');
            const tipoValor = tipoSelect?.value || '';
            const tipo = tipoValor ? (tipoSelect?.selectedOptions?.[0]?.textContent?.trim() || tipoValor) : '';
            const severidad = document.querySelector('input[name="severidad"]:checked');
            const descripcion = document.getElementById('descripcion')?.value || '';
            const estado = estadoSelect?.value || 'pendiente';
            const resolucion = document.getElementById('resolucion')?.value || '';
            const costo = document.getElementById('costo')?.value || '';
            const codigo = document.getElementById('codigo')?.value || '';
            const kmReporte = document.getElementById('km-reporte')?.value || '';
            const vehiculo_id = document.getElementById('vehiculo-select')?.value || '';
            const sesion = leerSesion() || {};

            if (!tipo || !descripcion.trim() || !severidad) {
                mostrarAviso('Campos incompletos', 'Complete: componente, severidad y descripción.');
                return;
            }
            if (!vehiculo_id) {
                mostrarAviso('Vehículo requerido', 'Seleccione un vehículo primero.');
                return;
            }
            if (estado === 'resuelto' && (!resolucion || !resolucion.trim())) {
                mostrarAviso('Resolución requerida', 'Describa la resolución de la observación.');
                return;
            }

            try {
                const resp = await apiFetch('/api/mantenimiento', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        vehiculo_id: parseInt(vehiculo_id, 10),
                        usuario_id: sesion.id || 1,
                        componente: tipo,
                        codigo_ref: codigo,
                        km_reporte: parseInt(kmReporte, 10) || null,
                        severidad: severidad.value,
                        descripcion,
                        estado,
                        costo: parseFloat(costo) || 0,
                        resolucion
                    })
                });

                const data = await resp.json();
                if (!data.ok) throw new Error(data.error);

                mostrarAviso('Observación registrada', 'Se guardó correctamente.');
                registrarActividad(`Nueva observación: ${tipo} - ${severidad.value}`);

                const tipoObs = document.getElementById('tipo-observacion');
                const descripcionObs = document.getElementById('descripcion');
                const costoObs = document.getElementById('costo');
                const codigoObs = document.getElementById('codigo');
                const kmObs = document.getElementById('km-reporte');

                if (tipoObs) tipoObs.value = '';
                if (descripcionObs) descripcionObs.value = '';
                if (costoObs) costoObs.value = '';
                if (codigoObs) codigoObs.value = '';
                if (kmObs) kmObs.value = '';
                if (severidad) severidad.checked = false;
                if (estadoSelect) estadoSelect.value = 'pendiente';
                if (campoResolucion) campoResolucion.style.display = 'none';
                if (document.getElementById('resolucion')) document.getElementById('resolucion').value = '';

                cargarMantenimientoDeVehiculo(vehiculo_id);
            } catch (err) {
                mostrarAviso('Error', 'No se pudo guardar: ' + err.message);
            }
        });
    }

    const vehSelMant = document.getElementById('vehiculo-select');
    if (vehSelMant) {
        vehSelMant.addEventListener('change', () => {
            if (vehSelMant.value) cargarMantenimientoDeVehiculo(vehSelMant.value);
            else limpiarMantenimientoSinVehiculo();
        });
    }

    function registrarActividad(accion) {
        console.log(`[BITÁCORA] ${new Date().toLocaleString()} - ${accion}`);
    }
    // Exponer helpers para las páginas separadas.
    window.__sigepav_recargarSelectVehiculos = cargarVehiculosEnSelect;
    window.__sigepav_abrirRegistroComisiones = abrirRegistroComisiones;
    window.__sigepav_abrirMantenimiento = abrirMantenimiento;

    console.log('✅ Sistema listo – Registro de comisiones integrado.');
});

window.SIGEPAV = (function () {
    'use strict';

    /* ─────────── Storage (sin localStorage — todo desde BD) ─────────── */
    const safeParse = (json, fb) => {
        try { const v = JSON.parse(json); return v == null ? fb : v; }
        catch (e) { return fb; }
    };

    // storage solo mantiene obs como stub vacío;
    // las observaciones ahora se persisten en el servidor vía /api/mantenimiento
    const storage = {
        loadObs()    { return []; },
        saveObs()    { /* no-op: las obs se guardan en MySQL */ },
    };

    /* ─────────── Sesión ─────────── */
    const getSession = () => {
        if (typeof window.__sigepav_leer_sesion === 'function') return window.__sigepav_leer_sesion();
        let raw = null;
        try { raw = sessionStorage.getItem('sigepav_usuario'); } catch (e) {}
        if (!raw) {
            try { raw = localStorage.getItem('sigepav_usuario'); } catch (e) {}
        }
        if (!raw) return null;
        try { return JSON.parse(raw); } catch (e) { return null; }
    };

    /* ─────────── Formato ─────────── */
    const fmtCur = (n) => {
        const v = Number(n) || 0;
        return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
    };
    const fmtDate = (s) => {
        if (!s) return '—';
        const p = s.length >= 10 ? s.slice(0, 10).split('-') : null;
        return p && p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s;
    };
    const vlabel = (v) => {
        if (!v) return '';
        const eco = v.eco ? ` (No. Eco ${v.eco})` : '';
        return `${v.marca || ''} ${v.linea || ''} ${v.modelo || ''}${eco}`.replace(/\s+/g, ' ').trim();
    };

    /* ─────────── Catálogo Estados/Municipios/Localidades ─────────── */
    const ESTADOS_MX = {
        'Aguascalientes':   ['Aguascalientes', 'Jesús María', 'Calvillo', 'Rincón de Romos'],
        'Baja California':  ['Tijuana', 'Mexicali', 'Ensenada', 'Tecate', 'Rosarito'],
        'Chihuahua':        ['Chihuahua', 'Ciudad Juárez', 'Delicias', 'Cuauhtémoc', 'Parral'],
        'Ciudad de México': ['Cuauhtémoc', 'Coyoacán', 'Benito Juárez', 'Tlalpan', 'Iztapalapa'],
        'Durango':          ['Durango', 'Gómez Palacio', 'Lerdo', 'Santiago Papasquiaro'],
        'Guanajuato':       ['Guanajuato', 'León', 'Irapuato', 'Celaya', 'Salamanca'],
        'Jalisco':          ['Guadalajara', 'Zapopan', 'Tlaquepaque', 'Tonalá', 'Puerto Vallarta'],
        'México':           ['Toluca', 'Naucalpan', 'Ecatepec', 'Nezahualcóyotl'],
        'Nuevo León':       ['Monterrey', 'Guadalupe', 'San Nicolás', 'Apodaca', 'San Pedro'],
        'Querétaro':        ['Querétaro', 'San Juan del Río', 'El Marqués', 'Corregidora'],
        'San Luis Potosí':  ['San Luis Potosí', 'Soledad de G. S.', 'Matehuala', 'Ciudad Valles'],
        'Zacatecas':        ['Zacatecas', 'Guadalupe', 'Fresnillo', 'Jerez', 'Río Grande', 'Sombrerete']
    };
    const LOCALIDADES = {
        'Zacatecas':     ['Centro', 'Bracho', 'La Encantada', 'Cieneguillas'],
        'Guadalupe':     ['Centro', 'Tacoaleche', 'San Jerónimo'],
        'Fresnillo':     ['Centro', 'Plateros', 'Estación San José'],
        'Jerez':         ['Centro', 'Ermita de Guadalupe', 'Tepetongo'],
        'Río Grande':    ['Centro', 'Pajaritos', 'Loreto'],
        'Sombrerete':    ['Centro', 'San Martín', 'Charco Blanco'],
        'Aguascalientes':['Centro', 'Norias de Ojocaliente', 'Pocitos'],
        'Durango':       ['Centro', 'Nombre de Dios', 'Pueblo Nuevo'],
        'Gómez Palacio': ['Centro', 'Brittingham', 'Filadelfia'],
        'Chihuahua':     ['Centro', 'Aldama', 'Tabalaopa']
    };
    const getMunicipios  = (estado) => ESTADOS_MX[estado] || [];
    const getLocalidades = (mun)    => LOCALIDADES[mun]    || ['Centro'];

    /* ─────────── Toast ─────────── */
    let toastTimer = null;
    const toast = (mensaje, tipo) => {
        let el = document.getElementById('toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'toast';
            el.className = 'toast';
            document.body.appendChild(el);
        }
        el.className = 'toast' + (tipo ? ' toast-' + tipo : '');
        el.textContent = mensaje;
        el.classList.add('toast-visible');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('toast-visible'), 2600);
    };

    /* ─────────── Modal de confirmación ─────────── */
    const confirmar = ({
        titulo,
        mensaje,
        onAceptar,
        onCancelar,
        etiquetaAceptar,
        icono = 'fas fa-trash',
        claseIcono = 'modal-icono-rojo',
        claseAceptar = 'btn-peligro'
    }) => {
        const overlay = document.getElementById('modal-overlay');
        const modal   = document.getElementById('modal-confirmar');
        const tit     = document.getElementById('modal-confirmar-titulo');
        const msj     = document.getElementById('modal-confirmar-mensaje');
        const btnOk   = document.getElementById('modal-confirmar-aceptar');
        const btnCan  = document.getElementById('modal-confirmar-cancelar');
        const icon    = modal ? modal.querySelector('.modal-icono') : null;
        if (!overlay || !modal) {
            if (window.confirm(`${titulo}\n\n${mensaje}`)) { if (onAceptar) onAceptar(); }
            else if (onCancelar) onCancelar();
            return;
        }
        if (tit) tit.textContent = titulo || '¿Confirmar?';
        if (msj) msj.textContent = mensaje || '';
        if (icon) icon.className = `${icono} modal-icono ${claseIcono}`.trim();
        if (btnOk) {
            btnOk.textContent = etiquetaAceptar || 'Aceptar';
            btnOk.className = claseAceptar;
        }
        overlay.style.display = 'block';
        modal.style.display   = 'block';
        const cerrar = () => { overlay.style.display = 'none'; modal.style.display = 'none'; };
        if (btnOk)  btnOk.onclick  = () => { cerrar(); if (onAceptar)  onAceptar(); };
        if (btnCan) btnCan.onclick = () => { cerrar(); if (onCancelar) onCancelar(); };
    };

    /* ─────────── Animar números (KPIs) ─────────── */
    const animarNumeros = (seccion) => {
        if (!seccion) return;
        seccion.querySelectorAll('.card-numero[data-valor]').forEach(el => {
            const final = parseInt(el.getAttribute('data-valor'), 10);
            if (Number.isNaN(final) || el.classList.contains('animado')) return;
            let actual = 0;
            const inc = Math.max(final / 40, 1);
            el.classList.add('animado');
            const tic = setInterval(() => {
                actual += inc;
                if (actual >= final) { el.textContent = final; clearInterval(tic); }
                else { el.textContent = Math.floor(actual); }
            }, 20);
        });
    };

    /* ════════════════════════════════════════════════════════════
       MÓDULO 1 · ALTA Y EDICIÓN DE VEHÍCULOS
       ════════════════════════════════════════════════════════════ */
    /* ════════════════════════════════════════════════════════════
   MÓDULO 1 · ALTA Y EDICIÓN DE VEHÍCULOS  (MySQL)
   ════════════════════════════════════════════════════════════ */
const altaEdicion = (() => {
    const API = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : (window.location && window.location.origin ? window.location.origin : 'http://localhost:3000');

    let vehiculos     = [];   // desde MySQL
    let observaciones = [];   // desde MySQL (/api/mantenimiento/:id)
    let nextObsId     = 1;
    let curVehId      = null;
    let curObsFiltro  = 'todas';
    let inicializado  = false;
    let guardandoAltaVehiculo = false;
    let guardandoEdicionVehiculo = false;

    const $ = (id) => document.getElementById(id);

    function setBtnLoading(btn, cargando, textoCargando) {
        if (!btn) return;
        if (cargando) {
            if (!btn.dataset.textoOriginal) btn.dataset.textoOriginal = btn.innerHTML;
            btn.disabled = true;
            btn.classList.add('btn-cargando');
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${textoCargando || 'Guardando...'}`;
        } else {
            btn.disabled = false;
            btn.classList.remove('btn-cargando');
            if (btn.dataset.textoOriginal) btn.innerHTML = btn.dataset.textoOriginal;
        }
    }

    function valorInput(id) {
        const el = $(id);
        return el ? el.value.trim() : '';
    }

    /* ---------- API helpers ---------- */
    async function apiGetVehiculos() {
        const r = await fetch(`${API}/api/vehiculos`);
        const d = await r.json();
        if (!d.ok) throw new Error(d.error || 'Error al cargar vehículos');
        // Normalizamos: el backend devuelve no_serie, lo mapeamos a "serie"
        // y no_economico → "eco" para que la UI existente siga funcionando.
        return (d.vehiculos || []).map(v => ({
            id:          v.id,
            marca:       v.marca,
            linea:       v.linea,
            modelo:      v.modelo,
            tipo:        v.tipo        || '',
            capacidad:   v.capacidad != null ? Number(v.capacidad) : null,
            color:       v.color,
            serie:       v.no_serie || v.serie || '',
            placas:      v.placas,
            eco:         v.no_economico || v.eco || '',
            combustible: v.combustible || '',
            km:          v.km_actual || v.km || 0,
            servicio:    v.fecha_ultimo_servicio || '',
            qrToken:     v.qr_token || '',
            qrImagePath: v.qr_image_path || ''
        }));
    }

    async function apiCrearVehiculo(datos) {
        const r = await fetch(`${API}/api/vehiculos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                marca:        datos.marca,
                linea:        datos.linea,
                modelo:       datos.modelo,
                tipo:         datos.tipo      || null,
                capacidad:    datos.capacidad != null ? datos.capacidad : null,
                color:        datos.color,
                serie:        datos.serie,
                placas:       datos.placas,
                no_economico: datos.eco,
                combustible:  datos.combustible || null,
                km_actual:    datos.km || 0
            })
        });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error || 'Error al registrar');
        return d.id;
    }

    async function apiActualizarVehiculo(id, datos) {
        const r = await fetch(`${API}/api/vehiculos/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                marca:        datos.marca,
                linea:        datos.linea,
                modelo:       datos.modelo,
                tipo:         datos.tipo      || null,
                capacidad:    datos.capacidad != null ? datos.capacidad : null,
                color:        datos.color,
                serie:        datos.serie,
                placas:       datos.placas,
                no_economico: datos.eco,
                combustible:  datos.combustible || null,
                km_actual:    datos.km || 0
            })
        });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error || 'Error al actualizar');
        return true;
    }

    async function apiEliminarVehiculo(id) {
        const r = await fetch(`${API}/api/vehiculos/${id}`, { method: 'DELETE' });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error || 'Error al eliminar');
        return true;
    }

    async function apiGetObservaciones(vehiculoId) {
        const r = await fetch(`${API}/api/mantenimiento/${vehiculoId}`);
        const d = await r.json();
        if (!d.ok) throw new Error(d.error || 'Error al cargar observaciones');
        return (d.observaciones || []).map(o => ({
            id:         o.id,
            vId:        vehiculoId,
            tipo:       o.componente || '',
            sev:        o.severidad  || 'media',
            estado:     o.estado     || 'pendiente',
            desc:       o.descripcion || '',
            resolucion: o.resolucion  || '',
            fecha:      o.created_at  ? o.created_at.toString().slice(0, 16) : '',
            usuario:    o.usuario_nombre || '',
            km:         Number(o.km_reporte || o.km || 0),
            costo:      Number(o.costo) || 0
        }));
    }

    async function apiCrearObservacion(vehiculoId, datos) {
        const sesion = getSession();
        const r = await fetch(`${API}/api/mantenimiento`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                vehiculo_id: vehiculoId,
                usuario_id:  sesion?.id || 1,
                componente:  datos.tipo,
                codigo_ref:  datos.codigo_ref || null,
                km_reporte:  datos.km || datos.km_reporte || null,
                severidad:   datos.sev  || 'media',
                descripcion: datos.desc || '',
                estado:      datos.estado || 'pendiente',
                costo:       datos.costo  || 0,
                resolucion:  datos.resolucion || ''
            })
        });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error || 'Error al guardar observación');
        return d.id;
    }

    /* ---------- refrescos cruzados ---------- */
    function refrescarSelectsExternos() {
        // Estas dos funciones existen en el closure principal del DOMContentLoaded.
        // Para invocarlas desde aquí, las exponemos vía window al iniciar (ver más abajo).
        if (typeof window.__sigepav_recargarSelectVehiculos === 'function') {
            window.__sigepav_recargarSelectVehiculos('vehiculo-comision');
            window.__sigepav_recargarSelectVehiculos('vehiculo-select');
        }
    }

    /* ---------- vistas ---------- */
    function mostrarVistaLista() {
        $('ae-vista-lista').style.display = '';
        $('ae-vista-detalle').style.display = 'none';
    }
    function mostrarVistaDetalle() {
        $('ae-vista-lista').style.display = 'none';
        $('ae-vista-detalle').style.display = '';
    }

    /* ---------- KPIs ---------- */
    function actualizarKPIs() {
        const total = vehiculos.length;
        const obs   = observaciones.length;
        const pend  = observaciones.filter(o => (o.estado || '').toLowerCase() === 'pendiente').length;
        const costo = observaciones.reduce((s, o) => s + (Number(o.costo) || 0), 0);

        const setN = (id, v) => {
            const el = $(id); if (!el) return;
            el.setAttribute('data-valor', v);
            el.classList.remove('animado');
            el.textContent = '0';
        };
        setN('ae-kpi-total', total);
        setN('ae-kpi-obs',   obs);
        setN('ae-kpi-pend',  pend);

        const elC = $('ae-kpi-costo');
        if (elC) {
            elC.setAttribute('data-valor', Math.round(costo));
            elC.classList.remove('animado');
            elC.textContent = '$0';
        }
        animarNumeros($('alta-edicion').querySelector('.resumen-cards'));
    }

    /* ---------- tabla ---------- */
function renderTabla() {
        const tbody = $('ae-tbody-vehiculos');
        if (!vehiculos.length) {
            tbody.innerHTML = `<tr><td colspan="11">
                <div class="estado-vacio"><i class="fas fa-car"></i><p>Sin vehículos registrados.</p></div>
            </td></tr>`;
            actualizarKPIs();
            return;
        }
        const tipoLabel = {
            sedan:'Sedán', coupe:'Coupé', pickup:'Pickup', suv:'SUV',
            hatchback:'Hatchback', van:'Van', motocicleta:'Motocicleta', otro:'Otro'
        };
        tbody.innerHTML = vehiculos.map(v => {
            const tipoTxt = v.tipo ? (tipoLabel[String(v.tipo).toLowerCase()] || v.tipo) : '—';
            const capTxt  = (v.capacidad != null && v.capacidad !== '') ? v.capacidad : '—';
            // QR thumbnail (clickeable → abre lightbox)
            const qrSrcRaw = v.qrImagePath
                ? `${API}/${v.qrImagePath}`
                : (v.qrToken ? `${API}/uploads/qr/qr_${v.id}.png` : '');
            const qrSrc = qrSrcRaw ? (window.sigepavUrl ? window.sigepavUrl(qrSrcRaw) : qrSrcRaw) : '';
            const qrPub = v.qrToken ? `${API}/ciudadano.html?token=${v.qrToken}` : '';
            const qrTitulo = `QR · ${v.marca || ''} ${v.linea || ''} — No. Eco ${v.eco || v.id}`;
            const celdaQR = qrSrc
                ? `<button type="button" class="qr-thumb-link" title="Ver QR en grande"
                          data-qr-abrir="${qrSrc}"
                          data-qr-titulo="${qrTitulo.replace(/"/g, '&quot;')}"
                          data-qr-subtitulo="Placas: ${(v.placas || '').replace(/"/g, '&quot;')}"
                          data-qr-publico="${qrPub}"
                          data-qr-descarga="QR_${v.eco || v.id}.png">
                       <img src="${qrSrc}" alt="QR ${v.eco || ''}" class="qr-thumb"
                            onerror="this.parentElement.outerHTML='<span class=qr-thumb-vacio>—</span>'">
                   </button>`
                : `<span class="qr-thumb-vacio" title="QR no disponible">—</span>`;
            return `
            <tr>
                <td><span class="badge-eco">${v.eco || '—'}</span></td>
                <td>${v.marca || ''}</td>
                <td>${v.linea || ''}</td>
                <td>${v.modelo || ''}</td>
                <td>${tipoTxt}</td>
                <td class="celda-num">${capTxt}</td>
                <td>${v.color || ''}</td>
                <td class="celda-mono">${v.serie || ''}</td>
                <td><span class="badge-placas">${v.placas || ''}</span></td>
                <td class="celda-qr">${celdaQR}</td>
                <td>
                    <div class="acciones-tabla">
                        <button class="btn-icono ver" title="Ver detalle" data-accion="ver" data-id="${v.id}"><i class="fas fa-eye"></i></button>
                        <button class="btn-icono editar" title="Editar" data-accion="editar" data-id="${v.id}"><i class="fas fa-pen"></i></button>
                        <button class="btn-icono eliminar" title="Eliminar" data-accion="eliminar" data-id="${v.id}"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>`;
        }).join('');
        actualizarKPIs();
    }

    async function recargarDesdeBD() {
        try {
            vehiculos = await apiGetVehiculos();
            renderTabla();
        } catch (err) {
            toast('Error al cargar vehículos: ' + err.message, 'error');
            vehiculos = [];
            renderTabla();
        }
    }

    /* ---------- ALTA ---------- */
async function registrar() {
        if (guardandoAltaVehiculo) return;

        const capRaw = valorInput('ae-r-capacidad');
        const datos = {
            marca:       valorInput('ae-r-marca'),
            linea:       valorInput('ae-r-linea'),
            modelo:      valorInput('ae-r-modelo'),
            tipo:        $('ae-r-tipo') ? $('ae-r-tipo').value : '',
            capacidad:   capRaw !== '' ? parseInt(capRaw, 10) : null,
            color:       valorInput('ae-r-color'),
            serie:       valorInput('ae-r-serie'),
            placas:      valorInput('ae-r-placas'),
            combustible: $('ae-r-combustible') ? $('ae-r-combustible').value : ''
            // eco se asigna automáticamente en el backend
        };
        if (!datos.marca || !datos.linea || !datos.placas) {
            toast('Complete los campos obligatorios (marca, línea, placas).', 'error');
            return;
        }
        if (datos.capacidad != null && (isNaN(datos.capacidad) || datos.capacidad < 0 || datos.capacidad > 255)) {
            toast('La capacidad debe ser un número entre 0 y 255.', 'error');
            return;
        }

        const btn = $('ae-btn-registrar');
        guardandoAltaVehiculo = true;
        setBtnLoading(btn, true, 'Registrando...');
        try {
            await apiCrearVehiculo(datos);
            ['ae-r-marca','ae-r-linea','ae-r-modelo','ae-r-color',
             'ae-r-serie','ae-r-placas','ae-r-tipo','ae-r-capacidad','ae-r-eco','ae-r-combustible']
                .forEach(id => { const el = $(id); if (el) el.value = ''; });
            // Cerrar el panel de alta tras éxito
            const panelAlta = $('ae-panel-alta');
            if (panelAlta) panelAlta.style.display = 'none';
            await recargarDesdeBD();
            refrescarSelectsExternos();
            toast('Vehículo registrado.', 'ok');
        } catch (err) {
            toast(err.message, 'error');
        } finally {
            guardandoAltaVehiculo = false;
            setBtnLoading(btn, false);
        }
    }

    /* ---------- EDICIÓN ---------- */
    function abrirEdicion(id) {
        const v = vehiculos.find(x => x.id === id);
        if (!v) return;
        $('ae-e-id').value     = id;
        $('ae-e-marca').value  = v.marca || '';
        $('ae-e-linea').value  = v.linea || '';
        $('ae-e-modelo').value = v.modelo || '';
        $('ae-e-color').value  = v.color || '';
        $('ae-e-serie').value  = v.serie || '';
        $('ae-e-placas').value = v.placas || '';
        $('ae-e-eco').value    = v.eco || '';   // solo lectura — siempre desde el id

        const tipoVal = (v.tipo || '').toString().toLowerCase();
        const selTipo = $('ae-e-tipo');
        if (selTipo) {
            const optExiste = Array.from(selTipo.options).some(o => o.value === tipoVal);
            selTipo.value = optExiste ? tipoVal : '';
        }
        const inputCap = $('ae-e-capacidad');
        if (inputCap) inputCap.value = (v.capacidad != null && v.capacidad !== '') ? v.capacidad : '';

        const elComb = $('ae-e-comb'); if (elComb) elComb.value = v.combustible || '';
        const elKm   = $('ae-e-km');   if (elKm)   elKm.value   = v.km || 0;
        const elSrv  = $('ae-e-srv');  if (elSrv)  elSrv.value  = v.servicio || '';

        // Cerrar panel de alta si estaba abierto (solo uno a la vez)
        const panelAlta = $('ae-panel-alta');
        if (panelAlta) panelAlta.style.display = 'none';

        // Mostrar panel de edición y bajarse a él
        const panelEdicion = $('ae-panel-edicion');
        panelEdicion.style.display = 'block';
        panelEdicion.classList.add('activo');
        panelEdicion.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    async function guardarEdicion() {
        if (guardandoEdicionVehiculo) return;
        const id = parseInt($('ae-e-id').value, 10);
        if (!id) return;

        const inputCap = $('ae-e-capacidad');
        const capRaw   = inputCap ? inputCap.value : '';
        const capParsed = capRaw !== '' ? parseInt(capRaw, 10) : null;

        const elComb = $('ae-e-comb');
        const elKm   = $('ae-e-km');

        const datos = {
            marca:       $('ae-e-marca').value.trim(),
            linea:       $('ae-e-linea').value.trim(),
            modelo:      $('ae-e-modelo').value.trim(),
            tipo:        $('ae-e-tipo') ? $('ae-e-tipo').value : '',
            capacidad:   capParsed,
            color:       $('ae-e-color').value.trim(),
            serie:       $('ae-e-serie').value.trim(),
            placas:      $('ae-e-placas').value.trim(),
            // eco NO se envía — el backend lo regenera
            combustible: elComb ? elComb.value : 'Gasolina Magna',
            km:          elKm ? (parseInt(elKm.value, 10) || 0) : 0
        };
        if (!datos.marca || !datos.linea || !datos.placas) {
            toast('Complete los campos obligatorios (marca, línea, placas).', 'error');
            return;
        }
        if (datos.capacidad != null && (isNaN(datos.capacidad) || datos.capacidad < 0 || datos.capacidad > 255)) {
            toast('La capacidad debe ser un número entre 0 y 255.', 'error');
            return;
        }
        const btn = $('ae-btn-guardar-edicion');
        guardandoEdicionVehiculo = true;
        setBtnLoading(btn, true, 'Guardando...');
        try {
            await apiActualizarVehiculo(id, datos);
            const panelEdicion = $('ae-panel-edicion');
            panelEdicion.classList.remove('activo');
            panelEdicion.style.display = 'none';
            await recargarDesdeBD();
            refrescarSelectsExternos();
            toast('Vehículo actualizado.', 'ok');
        } catch (err) {
            toast(err.message, 'error');
        } finally {
            guardandoEdicionVehiculo = false;
            setBtnLoading(btn, false);
        }
    }

    /* ---------- ELIMINACIÓN ---------- */
    function pedirEliminacion(id) {
        confirmar({
            titulo: '¿Eliminar vehículo?',
            mensaje: 'Esta acción no se puede deshacer.',
            onAceptar: async () => {
                try {
                    await apiEliminarVehiculo(id);
                    await recargarDesdeBD();
                    refrescarSelectsExternos();
                    toast('Vehículo eliminado.', 'ok');
                } catch (err) {
                    toast(err.message, 'error');
                }
            }
        });
    }

    /* ---------- DETALLE / OBSERVACIONES (MySQL vía /api/mantenimiento) ---------- */
    async function verDetalle(id) {
        curVehId = id;
        const v = vehiculos.find(x => x.id === id);
        if (!v) return;
        const tipoLabel = {
            sedan:'Sedán', coupe:'Coupé', pickup:'Pickup', suv:'SUV',
            hatchback:'Hatchback', van:'Van', motocicleta:'Motocicleta', otro:'Otro'
        };
        const tipoTxt = v.tipo ? (tipoLabel[String(v.tipo).toLowerCase()] || v.tipo) : '—';
        const capTxt  = (v.capacidad != null && v.capacidad !== '') ? `${v.capacidad} pers.` : '—';

        // ── QR del vehículo (visible solo si existe en BD) ──
        // Cache-buster: forzamos recarga si el backend regeneró el PNG.
        const qrSrcRaw = v.qrImagePath
            ? `${API}/${v.qrImagePath}?t=${Date.now()}`
            : (v.qrToken ? `${API}/uploads/qr/qr_${v.id}.png?t=${Date.now()}` : '');
        const qrSrc = qrSrcRaw ? (window.sigepavUrl ? window.sigepavUrl(qrSrcRaw) : qrSrcRaw) : '';
        const qrUrlPub = v.qrToken ? `${API}/ciudadano.html?token=${v.qrToken}` : '';
        const qrTituloDet = `QR · ${v.marca || ''} ${v.linea || ''} — No. Eco ${v.eco || v.id}`;
        const qrBloque = qrSrc ? `
            <div class="vehiculo-hero-qr" title="Click para ampliar">
                <button type="button" class="qr-hero-trigger"
                        data-qr-abrir="${qrSrc}"
                        data-qr-titulo="${qrTituloDet.replace(/"/g, '&quot;')}"
                        data-qr-subtitulo="Placas: ${(v.placas || '').replace(/"/g, '&quot;')}"
                        data-qr-publico="${qrUrlPub}"
                        data-qr-descarga="QR_${v.eco || v.id}.png"
                        aria-label="Ampliar código QR">
                    <img src="${qrSrc}" alt="QR del vehículo ${v.eco || v.placas || ''}"
                         onerror="this.parentElement.parentElement.style.display='none'"
                         loading="lazy">
                    <span class="qr-hero-zoom"><i class="fas fa-search-plus"></i></span>
                </button>
                <div class="vehiculo-hero-qr-acciones">
                    <a href="${qrSrc}" download="QR_${v.eco || v.id}.png" class="btn-qr-mini" title="Descargar QR">
                        <i class="fas fa-download"></i>
                    </a>
                    ${qrUrlPub ? `<a href="${qrUrlPub}" target="_blank" rel="noopener" class="btn-qr-mini" title="Abrir vista pública">
                        <i class="fas fa-external-link-alt"></i>
                    </a>` : ''}
                </div>
            </div>` : '';

        $('ae-veh-hero').innerHTML = `
            <div class="vehiculo-hero-icono"><i class="fas fa-car"></i></div>
            <div class="vehiculo-hero-info">
                <h2>${v.marca || ''} ${v.linea || ''} — ${v.modelo || ''}</h2>
                <div class="vehiculo-hero-meta">
                    <span><i class="fas fa-tag"></i> No. Eco: ${v.eco || '—'}</span>
                    <span><i class="fas fa-id-card"></i> ${v.placas || '—'}</span>
                    <span><i class="fas fa-car-side"></i> ${tipoTxt}</span>
                    <span><i class="fas fa-users"></i> ${capTxt}</span>
                    <span><i class="fas fa-gas-pump"></i> ${v.combustible || '—'}</span>
                    <span><i class="fas fa-tachometer-alt"></i> ${(v.km || 0).toLocaleString()} km</span>
                </div>
            </div>
            ${qrBloque}
            <span class="badge-activo">● ACTIVO</span>`;
        $('ae-obs-km').value = v.km || '';
        curObsFiltro = 'todas';
        $('alta-edicion').querySelectorAll('.filtro-tab').forEach((b, i) => b.classList.toggle('activo', i === 0));
        mostrarVistaDetalle();
        window.scrollTo({ top: 0, behavior: 'smooth' });

        // Cargar observaciones desde MySQL
        try {
            observaciones = await apiGetObservaciones(id);
        } catch (err) {
            toast('Error al cargar observaciones: ' + err.message, 'error');
            observaciones = [];
        }
        refrescarStatsVehiculo();
        renderObsList();
    }
    
    function refrescarStatsVehiculo() {
        const obs   = observaciones.filter(o => o.vId === curVehId);
        const pend  = obs.filter(o => (o.estado || '').toLowerCase() === 'pendiente').length;
        const costo = obs.reduce((s, o) => s + (Number(o.costo) || 0), 0);
        const fallas = {};
        obs.forEach(o => { fallas[o.tipo] = (fallas[o.tipo] || 0) + 1; });
        const top = Object.entries(fallas).sort((a, b) => b[1] - a[1])[0];
        $('ae-veh-stats').innerHTML = `
            <div class="card-resumen"><div class="card-icono"><i class="fas fa-clipboard-list"></i></div><div class="card-info"><span class="card-numero">${obs.length}</span><span class="card-etiqueta">Total observaciones</span></div></div>
            <div class="card-resumen"><div class="card-icono"><i class="fas fa-clock"></i></div><div class="card-info"><span class="card-numero">${pend}</span><span class="card-etiqueta">Pendientes</span></div></div>
            <div class="card-resumen"><div class="card-icono"><i class="fas fa-dollar-sign"></i></div><div class="card-info"><span class="card-numero">${fmtCur(costo)}</span><span class="card-etiqueta">Costo acumulado</span></div></div>
            <div class="card-resumen"><div class="card-icono"><i class="fas fa-tools"></i></div><div class="card-info"><span class="card-numero card-numero-pequeno">${top ? top[0] : '—'}</span><span class="card-etiqueta">Falla recurrente${top ? ` (${top[1]})` : ''}</span></div></div>
        `;
    }

    function renderObsList() {
        let obs = observaciones.filter(o => o.vId === curVehId);
        if (curObsFiltro !== 'todas') {
            obs = obs.filter(o => (o.estado || '').toLowerCase() === curObsFiltro);
        }
        obs = obs.slice().reverse();
        const cont = $('ae-obs-list');
        if (!obs.length) {
            cont.innerHTML = `<div class="estado-vacio"><i class="fas fa-clipboard"></i><p>Sin observaciones.</p></div>`;
            return;
        }
        cont.innerHTML = obs.map(o => {
            const estCls = (o.estado || 'pendiente').toLowerCase().replace(/\s+/g, '-');
            return `
                <div class="observacion-card sev-${o.sev || 'media'}">
                    <div class="obs-header">
                        <span class="obs-tipo">${o.tipo}</span>
                        <span class="obs-severidad ${o.sev || 'media'}">${(o.sev || 'media').toUpperCase()}</span>
                        <span class="obs-estado obs-estado-${estCls}">${o.estado}</span>
                        <span class="obs-fecha">${o.fecha || ''}</span>
                    </div>
                    <p>${o.desc || ''}</p>
                    ${o.resolucion ? `<div class="obs-resolucion"><i class="fas fa-check"></i> Resolución: ${o.resolucion}</div>` : ''}
                    <div class="obs-detalles">
                        <span><i class="fas fa-user"></i> ${o.usuario || ''}</span>
                        <span><i class="fas fa-tachometer-alt"></i> ${(o.km || 0).toLocaleString()} km</span>
                        ${o.costo ? `<span><i class="fas fa-dollar-sign"></i> ${fmtCur(o.costo)}</span>` : ''}
                    </div>
                </div>`;
        }).join('');
    }

    async function guardarObs() {
        const tipo  = $('ae-obs-tipo').value;
        const desc  = $('ae-obs-desc').value.trim();
        const sevEl = document.querySelector('input[name="ae-obs-sev"]:checked');
        if (!tipo || !desc) { toast('Complete tipo y descripción.', 'error'); return; }
        const estado = $('ae-obs-estado').value;
        const resolucion = (estado === 'Resuelto' || estado === 'resuelto')
            ? ($('ae-obs-res').value.trim() || '')
            : '';
        const datos = {
            tipo,
            sev:       sevEl ? sevEl.value : 'media',
            estado:    estado.toLowerCase(),
            desc,
            resolucion,
            costo:     parseFloat($('ae-obs-costo').value) || 0,
            km:        parseInt($('ae-obs-km').value, 10) || null
        };
        try {
            await apiCrearObservacion(curVehId, datos);
            ['ae-obs-tipo','ae-obs-km','ae-obs-costo','ae-obs-desc','ae-obs-res']
                .forEach(id => { const el = $(id); if (el) el.value = ''; });
            $('ae-obs-estado').value = 'Pendiente';
            $('ae-obs-res-field').style.display = 'none';
            const sm = $('ae-obs-sev-media');
            if (sm) sm.checked = true;
            // Recargar observaciones desde BD para reflejar el nuevo registro
            observaciones = await apiGetObservaciones(curVehId);
            refrescarStatsVehiculo();
            renderObsList();
            toast('Observación guardada.', 'ok');
        } catch (err) {
            toast('Error al guardar: ' + err.message, 'error');
        }
    }

    /* ---------- inicialización ---------- */
    function inicializar() {
        if (inicializado) return;
        inicializado = true;

        $('ae-tbody-vehiculos').addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-accion]');
            if (!btn) return;
            const id = parseInt(btn.dataset.id, 10);
            if      (btn.dataset.accion === 'ver')      verDetalle(id);
            else if (btn.dataset.accion === 'editar')   abrirEdicion(id);
            else if (btn.dataset.accion === 'eliminar') pedirEliminacion(id);
        });

        // ----- Botón "Nuevo vehículo": abre el panel de alta y cierra el de edición -----
        const btnAbrirAlta = $('ae-btn-abrir-alta');
        if (btnAbrirAlta) {
            btnAbrirAlta.addEventListener('click', () => {
                // Cerrar edición si estaba abierta
                const panelEdicion = $('ae-panel-edicion');
                if (panelEdicion) {
                    panelEdicion.classList.remove('activo');
                    panelEdicion.style.display = 'none';
                }
                // Abrir alta
                const panelAlta = $('ae-panel-alta');
                if (panelAlta) {
                    panelAlta.style.display = 'block';
                    panelAlta.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                // Limpiar campos por si quedaron datos
                ['ae-r-marca','ae-r-linea','ae-r-modelo','ae-r-color',
                 'ae-r-serie','ae-r-placas','ae-r-tipo','ae-r-capacidad','ae-r-eco','ae-r-combustible']
                    .forEach(id => { const el = $(id); if (el) el.value = ''; });
                const focusEl = $('ae-r-marca');
                if (focusEl) focusEl.focus();
            });
        }

        // ----- Botón "Cancelar" del panel de alta -----
        const btnCerrarAlta = $('ae-btn-cerrar-alta');
        if (btnCerrarAlta) {
            btnCerrarAlta.addEventListener('click', () => {
                const panelAlta = $('ae-panel-alta');
                if (panelAlta) panelAlta.style.display = 'none';
            });
        }

        // ----- Botón "Recargar" -----
        const btnRecargar = $('ae-btn-recargar');
        if (btnRecargar) {
            btnRecargar.addEventListener('click', async () => {
                await recargarDesdeBD();
                toast('Lista actualizada.', 'ok');
            });
        }

        const btnRegistrar = $('ae-btn-registrar');
        if (btnRegistrar) btnRegistrar.addEventListener('click', registrar);

        // ----- Botón "Cancelar" del panel de edición -----
        $('ae-btn-cerrar-edicion').addEventListener('click', () => {
            const panelEdicion = $('ae-panel-edicion');
            panelEdicion.classList.remove('activo');
            panelEdicion.style.display = 'none';
        });

        const btnGuardarEdicion = $('ae-btn-guardar-edicion');
        if (btnGuardarEdicion) btnGuardarEdicion.addEventListener('click', guardarEdicion);

        $('ae-btn-volver-lista').addEventListener('click', mostrarVistaLista);
        $('ae-obs-estado').addEventListener('change', function () {
            const campo = $('ae-obs-res-field');
            campo.style.display = this.value === 'Resuelto' ? 'flex' : 'none';
            if (this.value !== 'Resuelto') $('ae-obs-res').value = '';
        });
        $('alta-edicion').querySelectorAll('.filtro-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                curObsFiltro = btn.dataset.filtro;
                $('alta-edicion').querySelectorAll('.filtro-tab').forEach(b => b.classList.remove('activo'));
                btn.classList.add('activo');
                renderObsList();
            });
        });
        $('ae-btn-guardar-obs').addEventListener('click', () => guardarObs());
    }

    let abierto = false;
    async function abrir() {
        if (abierto) return;
        abierto = true;
        inicializar();
        // observaciones se cargan bajo demanda en verDetalle()
        observaciones = [];

        ['menu-principal','registro-comisiones','formulario-mantenimiento','consulta-comisiones']
            .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
        document.getElementById('alta-edicion').style.display = 'flex';
        mostrarVistaLista();

        await recargarDesdeBD();
        abrirVehiculoDeLaURL();
    }

    // Deep-link de notificaciones: alta-edicion.html?vehiculo_id=123 abre la ficha
    // de ese vehículo en vez de dejarte en la lista. El id lo pone el backend en
    // notificaciones.referencia_id. Si el vehículo ya no existe, se ignora sin ruido.
    function abrirVehiculoDeLaURL() {
        let idURL;
        try {
            idURL = parseInt(new URLSearchParams(location.search).get('vehiculo_id'), 10);
        } catch (e) { return; }
        if (!Number.isFinite(idURL)) return;

        const v = vehiculos.find(x => Number(x.id) === idURL);
        if (v) verDetalle(v.id);
    }

    return {
        abrir,
        recargar: recargarDesdeBD
    };
})();

    /* ════════════════════════════════════════════════════════════
   MÓDULO 2 · CONSULTA DE COMISIONES  (MySQL)
   ════════════════════════════════════════════════════════════ */
const consultaComisiones = (() => {
    const API = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : (window.location && window.location.origin ? window.location.origin : 'http://localhost:3000');

    let vehiculos    = [];   // desde MySQL
    let comisiones   = [];   // desde MySQL
    let filtrados    = [];
    let inicializado = false;
    let abierto      = false;

    const $ = (id) => document.getElementById(id);

    /* ---------- API helpers ---------- */
async function apiGetVehiculos() {
        const r = await fetch(`${API}/api/vehiculos`);
        const d = await r.json();
        if (!d.ok) throw new Error(d.error || 'Error al cargar vehículos');
        return (d.vehiculos || []).map(v => ({
            id:        v.id,
            marca:     v.marca,
            linea:     v.linea,
            modelo:    v.modelo,
            tipo:      v.tipo || '',
            capacidad: v.capacidad != null ? Number(v.capacidad) : null,
            eco:       v.no_economico || ''
        }));
    }

    async function apiCrearVehiculo(datos) {
        const r = await fetch(`${API}/api/vehiculos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                marca:        datos.marca,
                linea:        datos.linea,
                modelo:       datos.modelo,
                tipo:         datos.tipo || null,
                capacidad:    datos.capacidad != null ? datos.capacidad : null,
                color:        datos.color,
                serie:        datos.serie,
                placas:       datos.placas,
                // no_economico: NO se envía — el backend lo genera desde el ID
                combustible:  datos.combustible || 'Gasolina Magna',
                km_actual:    datos.km || 0
            })
        });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error || 'Error al registrar');
        return d.id;
    }

    async function apiActualizarVehiculo(id, datos) {
        const r = await fetch(`${API}/api/vehiculos/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                marca:        datos.marca,
                linea:        datos.linea,
                modelo:       datos.modelo,
                tipo:         datos.tipo || null,
                capacidad:    datos.capacidad != null ? datos.capacidad : null,
                color:        datos.color,
                serie:        datos.serie,
                placas:       datos.placas,
                // no_economico siempre derivado del id en el backend
                combustible:  datos.combustible || 'Gasolina Magna',
                km_actual:    datos.km || 0
            })
        });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error || 'Error al actualizar');
        return true;
    }


    async function apiGetComisiones(filtros = {}) {
        const qs = new URLSearchParams();
        if (filtros.vehiculo_id)  qs.set('vehiculo_id',  filtros.vehiculo_id);
        if (filtros.fecha_inicio) qs.set('fecha_inicio', filtros.fecha_inicio);
        if (filtros.fecha_fin)    qs.set('fecha_fin',    filtros.fecha_fin);
        if (filtros.estado)       qs.set('estado',       filtros.estado);
        if (filtros.solo_disc)    qs.set('solo_disc',    '1');

        const r = await fetch(`${API}/api/comisiones?${qs.toString()}`);
        const d = await r.json();
        if (!d.ok) throw new Error(d.error || 'Error al cargar comisiones');
        return d.comisiones || [];
    }

    async function apiCrearComision(datos) {
        const r = await fetch(`${API}/api/comisiones`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error || 'Error al crear comisión');
        return d.id;
    }

    async function apiActualizarComision(id, datos) {
        const r = await fetch(`${API}/api/comisiones/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error || 'Error al actualizar');
        return true;
    }

    async function apiEliminarComision(id) {
        const r = await fetch(`${API}/api/comisiones/${id}`, { method: 'DELETE' });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error || 'Error al eliminar');
        return true;
    }

    /* ---------- UI ---------- */
    function estadoBadge(e) {
        const map = {
            'Finalizado': 'badge-success',
            'En comision': 'badge-info',
            'En comisión': 'badge-info',
            'Pendiente': 'badge-warning',
            'Cancelado': 'badge-danger'
        };
        return `<span class="badge ${map[e] || 'badge-muted'}">${e || ''}</span>`;
    }

    function renderTabla() {
        const tbody = $('cc-tbody-comisiones');
        $('cc-res-count').textContent = `${filtrados.length} registro(s) encontrado(s)`;
        if (!filtrados.length) {
            tbody.innerHTML = `<tr><td colspan="10">
                <div class="estado-vacio"><i class="fas fa-inbox"></i><p>Sin resultados para los filtros aplicados.</p></div>
            </td></tr>`;
            return;
        }
        const tipoLabel = {
            sedan:'Sedán', coupe:'Coupé', pickup:'Pickup', suv:'SUV',
            hatchback:'Hatchback', van:'Van', motocicleta:'Motocicleta', otro:'Otro'
        };
        tbody.innerHTML = filtrados.slice()
            .sort((a, b) => (b.inicio || '').localeCompare(a.inicio || ''))
            .map(c => {
                const v = vehiculos.find(x => x.id === c.vId);
                // Destino: priorizar Municipio + Estado (si vienen del catálogo
                // INEGI). Si la comisión es vieja y no tiene esos campos
                // separados, mostramos el lugar_destino crudo.
                const dest = [c.municipio, c.estadoDst].filter(Boolean).join(', ')
                          || c.lugar_destino
                          || '—';
                const kmRec = (Number(c.kmFin) || 0) - (Number(c.kmIni) || 0);
                const costo = Number(c.costo) || 0;
                let tipoCap = '—';
                if (v && v.tipo) {
                    const t = tipoLabel[String(v.tipo).toLowerCase()] || v.tipo;
                    tipoCap = (v.capacidad != null && v.capacidad !== '')
                        ? `${t} · ${v.capacidad} pers.`
                        : t;
                }
                // FIX (req 2): el admin puede finalizar comisiones en estado
                // Pendiente, En comision o Solicitud finalización.
                const estadoNorm = String(c.estado || '').toLowerCase();
                const puedeFinalizar = !['finalizado','cancelado'].includes(estadoNorm);
                const btnFinalizar = puedeFinalizar
                    ? `<button class="btn-icono" title="Finalizar comisión" data-accion="finalizar" data-id="${c.id}" style="color:#0a8a3a;"><i class="fas fa-flag-checkered"></i></button>`
                    : '';
                const targetViajeId = parseInt(new URLSearchParams(window.location.search).get('viaje_id') || '0', 10);
                const esTargetViaje = targetViajeId && Number(c.id) === targetViajeId;
                return `<tr data-viaje-id="${c.id}" ${esTargetViaje ? 'style="outline:2px solid #006dc8;background:#eef7ff;"' : ''}>
                    <td><a class="enlace-vale" data-accion="editar" data-id="${c.id}"><strong>#${c.vale || '—'}</strong></a></td>
                    <td>${estadoBadge(c.estado)}</td>
                    <td>${c.responsable || ''}</td>
                    <td>${dest}</td>
                    <td class="celda-mono">${fmtDate(c.inicio)}</td>
                    <td class="celda-mono">${kmRec > 0 ? kmRec.toLocaleString() : '—'}</td>
                    <td><strong>${fmtCur(costo)}</strong></td>
                    <td>${v ? `${v.linea || ''} ${v.marca || ''}` : (c.linea ? `${c.linea} ${c.marca}` : '—')}</td>
                    <td>${tipoCap}</td>
                    <td>
                        <div class="acciones-tabla">
                            ${btnFinalizar}
                            <button class="btn-icono imprimir" title="Imprimir PDF" data-accion="imprimir" data-id="${c.id}"><i class="fas fa-print"></i></button>
                            <button class="btn-icono editar"   title="Editar"      data-accion="editar"   data-id="${c.id}"><i class="fas fa-pen"></i></button>
                            <button class="btn-icono eliminar" title="Eliminar"    data-accion="eliminar" data-id="${c.id}"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                </tr>`;
            }).join('');
    }

    /* ---------- Búsqueda contra MySQL ---------- */
    async function buscar() {
        try {
            const filtros = {
                vehiculo_id:  parseInt($('cc-f-vehiculo').value, 10) || '',
                fecha_inicio: $('cc-f-inicio').value,
                fecha_fin:    $('cc-f-fin').value,
                estado:       $('cc-f-estado').value,
                solo_disc:    $('cc-f-disc').checked
            };
            comisiones = await apiGetComisiones(filtros);
            filtrados  = [...comisiones];
            renderTabla();
            const targetViajeId = parseInt(new URLSearchParams(window.location.search).get('viaje_id') || '0', 10);
            if (targetViajeId) {
                const fila = document.querySelector(`[data-viaje-id="${targetViajeId}"]`);
                if (fila) setTimeout(() => fila.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
            }
        } catch (err) {
            toast('Error al buscar: ' + err.message, 'error');
        }
    }

    function limpiar() {
        ['cc-f-vehiculo','cc-f-estado','cc-f-inicio','cc-f-fin']
            .forEach(id => { $(id).value = ''; });
        $('cc-f-disc').checked = false;
        buscar();
    }

    /* ---------- Edición / catálogos ---------- */
    // Mapa local: nombre de estado → id (lo llena populateEstadosFromAPI al cargar)
    let _estadoIdPorNombre = {};

    async function populateEstadosFromAPI() {
        const sel = $('cc-e-estado-dst');
        if (!sel) return;
        try {
            const base = window.API_BASE || '';
            const resp = await fetch(`${base}/api/catalogo/estados`);
            const data = await resp.json();
            if (!data.ok) throw new Error(data.error || 'API estados');
            // Limpiar y poblar (se sustituye al ESTADOS_MX viejo)
            sel.innerHTML = '<option value="">Seleccionar</option>';
            _estadoIdPorNombre = {};
            data.estados.forEach(e => {
                sel.add(new Option(e.nombre, e.nombre));
                _estadoIdPorNombre[e.nombre] = e.id;
            });
        } catch (err) {
            console.warn('[consulta-comisiones] No se pudieron cargar estados desde la API:', err.message);
            // Fallback al catálogo local (incompleto pero funcional)
            sel.innerHTML = '<option value="">Seleccionar</option>';
            Object.keys(ESTADOS_MX).sort().forEach(e => sel.add(new Option(e, e)));
        }
    }

    // Mapa local: nombre de municipio → id (lo llena recargarMunicipios)
    let _municipioIdPorNombre = {};

    async function recargarMunicipios(municipioVal = '', localidadVal = '') {
        const estado = $('cc-e-estado-dst').value;
        const mSel = $('cc-e-municipio');
        const lSel = $('cc-e-localidad');
        mSel.innerHTML = '<option value="">Seleccionar</option>';
        lSel.innerHTML = '<option value="">Seleccionar</option>';
        _municipioIdPorNombre = {};
        if (!estado) return;

        const eid = _estadoIdPorNombre[estado];
        if (eid) {
            try {
                const base = window.API_BASE || '';
                const resp = await fetch(`${base}/api/catalogo/municipios?estado_id=${eid}`);
                const data = await resp.json();
                if (data.ok) {
                    data.municipios.forEach(m => {
                        mSel.add(new Option(m.nombre, m.nombre));
                        _municipioIdPorNombre[m.nombre] = m.id;
                    });
                }
            } catch (err) {
                console.warn('[consulta-comisiones] Municipios API falló:', err.message);
                getMunicipios(estado).forEach(m => mSel.add(new Option(m, m)));
            }
        } else {
            getMunicipios(estado).forEach(m => mSel.add(new Option(m, m)));
        }
        if (municipioVal) { mSel.value = municipioVal; recargarLocalidades(localidadVal); }
    }

    async function recargarLocalidades(localidadVal = '') {
        const mun = $('cc-e-municipio').value;
        const lSel = $('cc-e-localidad');
        lSel.innerHTML = '<option value="">Seleccionar</option>';
        if (!mun) return;

        const mid = _municipioIdPorNombre[mun];
        if (mid) {
            try {
                const base = window.API_BASE || '';
                const resp = await fetch(`${base}/api/catalogo/localidades?municipio_id=${mid}`);
                const data = await resp.json();
                if (data.ok && data.localidades.length) {
                    data.localidades.forEach(l => lSel.add(new Option(l.nombre, l.nombre)));
                    if (localidadVal) lSel.value = localidadVal;
                    return;
                }
            } catch (err) {
                console.warn('[consulta-comisiones] Localidades API falló:', err.message);
            }
        }
        // Fallback al catálogo local viejo
        getLocalidades(mun).forEach(l => lSel.add(new Option(l, l)));
        if (localidadVal) lSel.value = localidadVal;
    }
    function calcTotal() {
        const l = parseFloat($('cc-e-litros').value) || 0;
        const p = parseFloat($('cc-e-precio').value) || 0;
        $('cc-e-total').textContent = fmtCur(l * p);
    }
    function calcKm() {
        const ini = parseInt($('cc-e-kmi').value, 10) || 0;
        const fin = parseInt($('cc-e-kmf').value, 10) || 0;
        $('cc-e-kmrec').textContent = `${Math.max(0, fin - ini).toLocaleString()} km`;
    }

    function abrirEdicion(id) {
        const c = comisiones.find(x => x.id === id);
        if (!c) return;
        $('cc-e-id').value          = id;
        $('cc-e-vale').value        = c.vale || '';
        $('cc-e-litros').value      = c.litros || '';
        $('cc-e-precio').value      = c.precioLt || '';
        $('cc-e-ticket').value      = c.ticket || '';
        $('cc-e-combustible').value = c.combustible || 'Gasolina Magna';
        $('cc-e-oficio').value      = c.oficio || '';
        $('cc-e-resp').value        = c.responsable || '';
        $('cc-e-estcom').value      = c.estado || 'Pendiente';
        $('cc-e-inicio').value      = c.inicio ? c.inicio.toString().slice(0, 10) : '';
        $('cc-e-fin').value         = c.fin    ? c.fin.toString().slice(0, 10)    : '';
        $('cc-e-desc').value        = c.descripcion || '';
        $('cc-e-obs').value         = c.obs || '';
        $('cc-e-kmi').value         = c.kmIni || '';
        $('cc-e-kmf').value         = c.kmFin || '';
        $('cc-e-vehiculo').value    = c.vId || '';
        $('cc-archivo-nombre').textContent = 'No se eligió ningún archivo';
        $('cc-e-estado-dst').value  = c.estadoDst || '';
        recargarMunicipios(c.municipio, c.localidad);
        calcTotal();
        calcKm();
        document.getElementById('modal-overlay').style.display = 'block';
        $('cc-modal-edicion').style.display = 'block';
    }

    function cerrarEdicion() {
        document.getElementById('modal-overlay').style.display = 'none';
        $('cc-modal-edicion').style.display = 'none';
    }

    /* Lee el formulario y devuelve el payload para POST/PUT */
    function leerFormulario() {
        const litros   = parseFloat($('cc-e-litros').value) || 0;
        const precioLt = parseFloat($('cc-e-precio').value) || 0;
        return {
            vale:          $('cc-e-vale').value.trim(),
            oficio:        $('cc-e-oficio').value.trim(),
            responsable:   $('cc-e-resp').value.trim(),
            estado:        $('cc-e-estcom').value.trim() || 'Pendiente',
            vehiculo_id:   parseInt($('cc-e-vehiculo').value, 10) || null,
            lugar_destino: '',
            estadoDst:     $('cc-e-estado-dst').value,
            municipio:     $('cc-e-municipio').value,
            localidad:     $('cc-e-localidad').value,
            inicio:        $('cc-e-inicio').value || null,
            fin:           $('cc-e-fin').value    || null,
            descripcion:   $('cc-e-desc').value.trim(),
            obs:           $('cc-e-obs').value.trim(),
            kmIni:         parseInt($('cc-e-kmi').value, 10) || 0,
            kmFin:         parseInt($('cc-e-kmf').value, 10) || 0,
            litros,
            precioLt,
            costo:         litros * precioLt,
            combustible:   $('cc-e-combustible').value,
            ticket:        $('cc-e-ticket').value.trim()
        };
    }

    async function guardarComision() {
        const id = parseInt($('cc-e-id').value, 10);
        const datos = leerFormulario();
        if (!datos.vehiculo_id) {
            toast('Seleccione un vehículo.', 'error');
            return;
        }

        try {
            if (id && comisiones.find(x => x.id === id)) {
                await apiActualizarComision(id, datos);
                toast('Comisión actualizada.', 'ok');
            } else {
                // Caso: registro nuevo creado en memoria por nuevaComision()
                const sesion = getSession();
                const nuevoId = await apiCrearComision({ ...datos, usuario_id: sesion?.id || 1 });
                $('cc-e-id').value = nuevoId;
                toast('Comisión creada.', 'ok');
            }
            cerrarEdicion();
            await buscar();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    function pedirEliminacion(id) {
        confirmar({
            titulo: '¿Eliminar comisión?',
            mensaje: 'Esta acción no se puede deshacer.',
            onAceptar: async () => {
                try {
                    await apiEliminarComision(id);
                    toast('Comisión eliminada.', 'ok');
                    await buscar();
                } catch (err) {
                    toast(err.message, 'error');
                }
            }
        });
    }

    /* ════════════════════════════════════════════════════════════
       FIX (req 2 + req 3): FINALIZACIÓN POR ADMINISTRADOR
       El admin puede finalizar comisiones directamente.
       El nivel de combustible final se captura SIEMPRE con Gasolina.py
       (no con un input/select estático).
       ════════════════════════════════════════════════════════════ */
    let finalizarTarget = null;  // { id, comision }

    async function apiFinalizarComision(id, body) {
        const r = await fetch(`${API}/api/comisiones/${id}/finalizar`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error || 'Error al finalizar');
        return true;
    }

    function abrirFormFinalizar(id) {
        const c = comisiones.find(x => x.id === id);
        if (!c) {
            toast('Comisión no encontrada.', 'error');
            return;
        }
        finalizarTarget = { id, comision: c };

        // Limpia y pre-llena el formulario del modal
        const lblComision = $('cc-fin-comision-info');
        if (lblComision) lblComision.textContent = `Comisión #${c.id} — ${c.lugar_destino || c.vale || ''}`;
        const elKm = $('cc-fin-km');
        if (elKm) elKm.value = c.kmFin || '';
        const elObs = $('cc-fin-obs');
        if (elObs) elObs.value = c.obs || '';
        const elNivelLbl = $('cc-fin-nivel-actual');
        if (elNivelLbl) elNivelLbl.textContent = '— (sin capturar)';
        const elNivelHidden = $('cc-fin-nivel-valor');
        if (elNivelHidden) elNivelHidden.value = '';

        document.getElementById('modal-overlay').style.display = 'block';
        $('cc-modal-finalizar').style.display = 'block';
    }

    function cerrarFormFinalizar() {
        document.getElementById('modal-overlay').style.display = 'none';
        const m = $('cc-modal-finalizar');
        if (m) m.style.display = 'none';
        finalizarTarget = null;
    }

    // Abre el iframe de Gasolina.py para capturar el nivel final
    function abrirMedidorFinalizar() {
        const iframe = document.getElementById('iframe-medidor');
        const modalM = document.getElementById('modal-medidor');
        const ov     = document.getElementById('modal-overlay');
        if (!iframe || !modalM || !ov) return;

        // Verifica que Gasolina.py esté arriba
        fetch(`${window.FUEL_BASE || ((window.API_BASE || window.location.origin) + '/gasolina')}/fuel?t=${Date.now()}`, { cache: 'no-store' })
            .then(r => {
                if (!r.ok) throw new Error('Servidor no disponible');
                // Marca: la siguiente respuesta del medidor es para finalización (no para inicio)
                window.__sigepav_medidor_destino = 'finalizar-comision';
                iframe.src = window.sigepavUrl(`${window.FUEL_BASE || ((window.API_BASE || window.location.origin) + '/gasolina')}/?t=${Date.now()}`);
                ov.style.display = 'block';
                modalM.style.display = 'block';
            })
            .catch(() => {
                toast('No se pudo conectar con Gasolina.py (el servidor de combustible). Asegúrate de que esté en ejecución.', 'error');
            });
    }

    // Recibe el resultado del medidor cuando el destino es finalización
    window.addEventListener('message', (event) => {
        if (!event.data || typeof event.data !== 'object') return;
        if (window.__sigepav_medidor_destino !== 'finalizar-comision') return;

        if (event.data.tipo === 'medidor-confirmar') {
            const pct = Math.round(event.data.percentage);
            // Cierra el medidor pero NO el formulario de finalización
            const modalM = document.getElementById('modal-medidor');
            const iframe = document.getElementById('iframe-medidor');
            if (modalM)  modalM.style.display = 'none';
            if (iframe)  iframe.src = '';

            const lbl = $('cc-fin-nivel-actual');
            const hidden = $('cc-fin-nivel-valor');
            if (lbl) lbl.textContent = `${pct}% (capturado con Gasolina.py)`;
            if (hidden) hidden.value = String(pct);

            // El overlay sigue ON porque el modal de finalización está abierto
            const ov = document.getElementById('modal-overlay');
            if (ov) ov.style.display = 'block';
            window.__sigepav_medidor_destino = null;
        } else if (event.data.tipo === 'medidor-cancelar') {
            const modalM = document.getElementById('modal-medidor');
            const iframe = document.getElementById('iframe-medidor');
            if (modalM)  modalM.style.display = 'none';
            if (iframe)  iframe.src = '';
            const ov = document.getElementById('modal-overlay');
            if (ov) ov.style.display = 'block'; // mantiene el modal de finalización
            window.__sigepav_medidor_destino = null;
        }
    });

    async function confirmarFinalizacion() {
        if (!finalizarTarget) return;
        const sesion = getSession();
        if (!sesion || !sesion.id) {
            toast('Sesión inválida. Vuelve a iniciar sesión.', 'error');
            return;
        }
        const kmFinal = parseInt($('cc-fin-km').value, 10);
        const nivel   = $('cc-fin-nivel-valor').value;
        const obs     = $('cc-fin-obs').value.trim();

        if (isNaN(kmFinal) || kmFinal < 0) {
            toast('Captura un kilometraje final válido.', 'error');
            return;
        }
        if (!nivel) {
            toast('Captura el nivel de combustible final con Gasolina.py.', 'error');
            return;
        }

        try {
            await apiFinalizarComision(finalizarTarget.id, {
                admin_id: sesion.id,
                km_final: kmFinal,
                nivel_comb_fin: nivel,
                observaciones: obs || null
            });
            toast('Comisión finalizada correctamente.', 'ok');
            cerrarFormFinalizar();
            await buscar();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    /* Nueva comisión: abre el modal en blanco. Se persiste al pulsar Guardar. */
    function nuevaComision() {
        cerrarEdicion();
        $('cc-e-id').value          = '';
        $('cc-e-vale').value        = '';
        $('cc-e-litros').value      = '';
        $('cc-e-precio').value      = '';
        $('cc-e-ticket').value      = '';
        $('cc-e-combustible').value = 'Gasolina Magna';
        $('cc-e-oficio').value      = '';
        $('cc-e-resp').value        = '';
        $('cc-e-estcom').value      = 'Pendiente';
        $('cc-e-inicio').value      = new Date().toISOString().slice(0, 10);
        $('cc-e-fin').value         = new Date().toISOString().slice(0, 10);
        $('cc-e-desc').value        = '';
        $('cc-e-obs').value         = '';
        $('cc-e-kmi').value         = '';
        $('cc-e-kmf').value         = '';
        $('cc-e-vehiculo').value    = vehiculos[0]?.id || '';
        $('cc-archivo-nombre').textContent = 'No se eligió ningún archivo';
        $('cc-e-estado-dst').value  = '';
        recargarMunicipios();
        calcTotal();
        calcKm();
        document.getElementById('modal-overlay').style.display = 'block';
        $('cc-modal-edicion').style.display = 'block';
    }

    function poblarSelectsVehiculos() {
        const f = $('cc-f-vehiculo');
        const e = $('cc-e-vehiculo');
        f.innerHTML = '<option value="">Elegir vehículo</option>';
        e.innerHTML = '';
        vehiculos.forEach(v => {
            f.add(new Option(vlabel(v), v.id));
            e.add(new Option(vlabel(v), v.id));
        });
    }

    function inicializar() {
        if (inicializado) return;
        inicializado = true;

        // Rellena el combo de estados desde la API (con fallback local)
        populateEstadosFromAPI();

        $('cc-btn-buscar').addEventListener('click', buscar);
        $('cc-btn-limpiar').addEventListener('click', limpiar);
        $('cc-btn-imprimir').addEventListener('click', () => {
            toast('Generando PDF de resultados...', 'info');
            setTimeout(() => window.print(), 400);
        });

        $('cc-tbody-comisiones').addEventListener('click', (e) => {
            const t = e.target.closest('[data-accion]');
            if (!t) return;
            const id = parseInt(t.dataset.id, 10);
            if      (t.dataset.accion === 'editar')    abrirEdicion(id);
            else if (t.dataset.accion === 'eliminar')  pedirEliminacion(id);
            else if (t.dataset.accion === 'finalizar') abrirFormFinalizar(id);   // FIX (req 2)
            else if (t.dataset.accion === 'imprimir') {
                const c = comisiones.find(x => x.id === id);
                toast(`Generando PDF del vale #${c?.vale || id}...`, 'info');
            }
        });

        $('cc-btn-cerrar-edicion').addEventListener('click', cerrarEdicion);
        $('cc-btn-nueva-comision').addEventListener('click', nuevaComision);
        $('cc-e-estado-dst').addEventListener('change', () => recargarMunicipios());
        $('cc-e-municipio').addEventListener('change',  () => recargarLocalidades());
        $('cc-e-litros').addEventListener('input', calcTotal);
        $('cc-e-precio').addEventListener('input', calcTotal);
        $('cc-e-kmi').addEventListener('input', calcKm);
        $('cc-e-kmf').addEventListener('input', calcKm);
        $('cc-btn-elegir-archivo').addEventListener('click', () => $('cc-e-file').click());
        $('cc-e-file').addEventListener('change', (e) => {
            const f = e.target.files[0];
            $('cc-archivo-nombre').textContent = f ? f.name : 'No se eligió ningún archivo';
        });
        $('cc-btn-guardar-comision').addEventListener('click', guardarComision);

        // FIX (req 2 + 3): handlers del modal de finalización (admin)
        const btnFinCancelar = $('cc-fin-cancelar');
        const btnFinAceptar  = $('cc-fin-aceptar');
        const btnFinMedir    = $('cc-fin-btn-medir');
        const btnFinCerrar   = $('cc-fin-cerrar');
        if (btnFinCancelar) btnFinCancelar.addEventListener('click', cerrarFormFinalizar);
        if (btnFinCerrar)   btnFinCerrar.addEventListener('click', cerrarFormFinalizar);
        if (btnFinAceptar)  btnFinAceptar.addEventListener('click', confirmarFinalizacion);
        if (btnFinMedir)    btnFinMedir.addEventListener('click', abrirMedidorFinalizar);
    }

    async function abrir() {
        if (abierto) return;
        abierto = true;
        inicializar();

        ['menu-principal','registro-comisiones','formulario-mantenimiento','alta-edicion']
            .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
        document.getElementById('consulta-comisiones').style.display = 'flex';

        try {
            vehiculos = await apiGetVehiculos();
            poblarSelectsVehiculos();
            await buscar();
        } catch (err) {
            toast('Error al cargar datos: ' + err.message, 'error');
        }
    }

    return { abrir };
})();

    /* ════════════════════════════════════════════════════════════
       MÓDULO 3 · SOLICITUDES DE FINALIZACIÓN  (MySQL)
       Bandeja para que el admin acepte o rechace solicitudes
       enviadas por los usuarios operativos.
       ════════════════════════════════════════════════════════════ */
const solicitudesFinalizacion = (() => {
    const API = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : (window.location && window.location.origin ? window.location.origin : 'http://localhost:3000');
    const $ = (id) => document.getElementById(id);

    let solicitudes  = [];
    let rechazoTarget = null;     // id de solicitud que se va a rechazar
    let inicializado  = false;

    async function apiListar(estado = 'pendiente') {
        const qs = estado ? `?estado=${encodeURIComponent(estado)}` : '';
        const r = await fetch(`${API}/api/solicitudes-finalizacion${qs}`);
        const d = await r.json();
        if (!d.ok) throw new Error(d.error || 'Error al listar solicitudes');
        return d.solicitudes || [];
    }

    async function apiAprobar(id, admin_id, comentario_admin) {
        const r = await fetch(`${API}/api/solicitudes-finalizacion/${id}/aprobar`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_id, comentario_admin: comentario_admin || null })
        });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error || 'Error al aprobar');
        return true;
    }

    async function apiRechazar(id, admin_id, comentario_admin) {
        const r = await fetch(`${API}/api/solicitudes-finalizacion/${id}/rechazar`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_id, comentario_admin: comentario_admin || null })
        });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error || 'Error al rechazar');
        return true;
    }

    function estadoBadge(e) {
        const map = {
            'pendiente': 'badge-warning',
            'aprobada':  'badge-success',
            'rechazada': 'badge-danger'
        };
        const txt = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada' }[e] || e;
        return `<span class="badge ${map[e] || 'badge-muted'}">${txt}</span>`;
    }

    function renderTabla() {
        const tbody = $('sf-tbody');
        $('sf-res-count').textContent = `${solicitudes.length} registro(s)`;

        if (!solicitudes.length) {
            tbody.innerHTML = `<tr><td colspan="10">
                <div class="estado-vacio"><i class="fas fa-inbox"></i><p>No hay solicitudes con ese filtro.</p></div>
            </td></tr>`;
            return;
        }

        tbody.innerHTML = solicitudes.map(s => {
            const usuario = `${s.usuario_nombre || ''} ${s.usuario_apellidos || ''}`.trim()
                            || s.usuario_email || `Usuario #${s.usuario_id}`;
            const veh = (s.linea || s.marca)
                ? `${s.linea || ''} ${s.marca || ''}`.trim() + (s.no_economico ? ` (${s.no_economico})` : '')
                : '—';
            const acciones = s.estado === 'pendiente'
                ? `<div class="acciones-tabla">
                       <button class="btn-icono btn-icono-aprobar" title="Aprobar" data-accion="aprobar" data-id="${s.id}"><i class="fas fa-check-circle"></i> Aprobar</button>
                       <button class="btn-icono btn-icono-rechazar" title="Rechazar" data-accion="rechazar" data-id="${s.id}"><i class="fas fa-times-circle"></i></button>
                   </div>`
                : (s.comentario_admin
                    ? `<span title="${(s.comentario_admin || '').replace(/"/g, '&quot;')}" style="color:#666;font-size:0.85rem;"><i class="fas fa-comment"></i> Resuelta</span>`
                    : `<span style="color:#666;font-size:0.85rem;">Resuelta</span>`);
            const targetId = parseInt(new URLSearchParams(window.location.search).get('solicitud_id') || '0', 10);
            const esTarget = targetId && Number(s.id) === targetId;
            return `<tr data-solicitud-id="${s.id}" ${esTarget ? 'style="outline:2px solid #006dc8;background:#eef7ff;"' : ''}>
                <td>#${s.id}</td>
                <td>${usuario}</td>
                <td>#${s.viaje_id} · ${s.no_vale || 'S/V'}</td>
                <td>${s.lugar_destino || '—'}</td>
                <td>${veh}</td>
                <td class="celda-mono">${s.km_final != null ? Number(s.km_final).toLocaleString() : '—'}</td>
                <td>${s.motivo || '—'}</td>
                <td>${estadoBadge(s.estado)}</td>
                <td class="celda-mono">${fmtDate(s.created_at)}</td>
                <td>${acciones}</td>
            </tr>`;
        }).join('');
    }

    async function buscar() {
        try {
            const estado = $('sf-f-estado').value;
            solicitudes = await apiListar(estado);
            renderTabla();
            const targetId = parseInt(new URLSearchParams(window.location.search).get('solicitud_id') || '0', 10);
            if (targetId) {
                const fila = document.querySelector(`[data-solicitud-id="${targetId}"]`);
                if (fila) {
                    setTimeout(() => fila.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
                }
            }
        } catch (err) {
            toast('Error: ' + err.message, 'error');
        }
    }

    async function aprobar(id) {
        const sesion = getSession();
        if (!sesion || !sesion.id) {
            toast('Sesión inválida. Vuelve a iniciar sesión.', 'error');
            return;
        }
        confirmar({
            titulo: '¿Aprobar solicitud?',
            mensaje: 'La comisión quedará como Finalizada y se actualizará el km del vehículo.',
            etiquetaAceptar: 'Aprobar',
            icono: 'fas fa-flag-checkered',
            claseIcono: 'modal-icono-verde',
            claseAceptar: 'btn-exito',
            onAceptar: async () => {
                try {
                    await apiAprobar(id, sesion.id, null);
                    toast('Solicitud aprobada. La comisión fue finalizada.', 'ok');
                    await buscar();
                    // refrescar campana
                    if (window.__sigepav_refrescarNotifAdmin) window.__sigepav_refrescarNotifAdmin();
                } catch (err) {
                    toast(err.message, 'error');
                }
            }
        });
    }

    function abrirModalRechazo(id) {
        rechazoTarget = id;
        $('sf-rechazo-comentario').value = '';
        document.getElementById('modal-overlay').style.display = 'block';
        $('sf-modal-rechazo').style.display = 'block';
    }

    function cerrarModalRechazo() {
        document.getElementById('modal-overlay').style.display = 'none';
        $('sf-modal-rechazo').style.display = 'none';
        rechazoTarget = null;
    }

    async function confirmarRechazo() {
        if (!rechazoTarget) return;
        const sesion = getSession();
        if (!sesion || !sesion.id) {
            toast('Sesión inválida. Vuelve a iniciar sesión.', 'error');
            return;
        }
        const comentario = $('sf-rechazo-comentario').value.trim();
        try {
            await apiRechazar(rechazoTarget, sesion.id, comentario);
            cerrarModalRechazo();
            toast('Solicitud rechazada. El usuario fue notificado.', 'ok');
            await buscar();
            if (window.__sigepav_refrescarNotifAdmin) window.__sigepav_refrescarNotifAdmin();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    function inicializar() {
        if (inicializado) return;
        inicializado = true;

        $('sf-btn-buscar').addEventListener('click', buscar);
        $('sf-tbody').addEventListener('click', (e) => {
            const t = e.target.closest('[data-accion]');
            if (!t) return;
            const id = parseInt(t.dataset.id, 10);
            if      (t.dataset.accion === 'aprobar')  aprobar(id);
            else if (t.dataset.accion === 'rechazar') abrirModalRechazo(id);
        });
        $('sf-rechazo-cancelar').addEventListener('click', cerrarModalRechazo);
        $('sf-rechazo-aceptar').addEventListener('click', confirmarRechazo);
    }

    let abierto = false;
    async function abrir() {
        if (abierto) return;
        abierto = true;
        inicializar();
        ['menu-principal','registro-comisiones','formulario-mantenimiento','alta-edicion','consulta-comisiones']
            .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
        document.getElementById('solicitudes-finalizacion').style.display = 'flex';
        const targetId = parseInt(new URLSearchParams(window.location.search).get('solicitud_id') || '0', 10);
        if (targetId && $('sf-f-estado')) $('sf-f-estado').value = '';
        await buscar();
    }

    return { abrir, recargar: buscar };
})();


    /* ════════════════════════════════════════════════════════════
       MÓDULO 4 · NOTIFICACIONES ADMIN (campana)
       Tiempo real vía SSE (Server-Sent Events).
       Fallback automático a polling cada 30 s si SSE falla.
       ════════════════════════════════════════════════════════════ */
const notificacionesAdmin = (() => {
    const API = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : (window.location && window.location.origin ? window.location.origin : 'http://localhost:3000');
    const $ = (id) => document.getElementById(id);
    let timer = null;
    let evtSource = null;
    let lista = [];  // cache local que se va actualizando con SSE

    function fijarConectado(ok) {
        const dot = $('adm-notif-live-dot');
        if (dot) dot.classList.toggle('conectado', !!ok);
        const cnt = $('adm-notif-count');
        // No reescribimos el texto base — solo el dot transmite el estado
    }

    function reproducirCampanazo() {
        const btn = $('adm-btnNotif');
        if (!btn) return;
        btn.classList.add('suena');
        setTimeout(() => btn.classList.remove('suena'), 1000);
    }

    function pintarBadge() {
        const noLeidas = lista.filter(n => !n.leida).length;
        const badge = $('adm-badgeNotif');
        if (badge) {
            if (noLeidas > 0) {
                badge.textContent = noLeidas > 99 ? '99+' : noLeidas;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
        const cnt = $('adm-notif-count');
        if (cnt) cnt.textContent = `${noLeidas} sin leer`;
    }

    function escAttr(s) { return escHtml(s).replace(/`/g, '&#96;'); }

    function urlNotificacion(n) {
        if (!n) return null;
        const id = n.referencia_id ? encodeURIComponent(n.referencia_id) : '';
        switch (n.tipo) {
            case 'solicitud_finalizacion':
                return id ? `solicitudes-finalizacion.html?solicitud_id=${id}` : 'solicitudes-finalizacion.html';
            case 'reporte_ciudadano':
                return id ? `reportes.html?reporte_id=${id}` : 'reportes.html';
            case 'vehiculo':
                return id ? `alta-edicion.html?vehiculo_id=${id}` : 'alta-edicion.html';
            case 'comision_aprobada':
                return id ? `consulta-comisiones.html?viaje_id=${id}` : 'consulta-comisiones.html';
            case 'comision_rechazada':
                return id ? `Usuario.html?abrir=finalizar&viaje_id=${id}#form-finalizar-comision` : 'Usuario.html#historial-comisiones';
            case 'info':
                return id ? `reportes.html?reporte_id=${id}` : null;
            default:
                return null;
        }
    }

    async function abrirNotificacion(id, url) {
        const notifId = parseInt(id, 10);
        if (notifId) await marcarLeida(notifId);
        if (url) window.location.href = url;
    }

    function pintarLista(idsRecienLlegados = new Set()) {
        const cont = $('adm-notif-lista');
        if (!cont) return;
        if (!lista.length) {
            cont.innerHTML = '<p style="text-align:center; padding: 1rem; color:#666;">No hay notificaciones.</p>';
            return;
        }
        cont.innerHTML = lista.slice(0, 20).map(n => {
            const url = urlNotificacion(n);
            return `
            <div class="${idsRecienLlegados.has(n.id) ? 'notif-nueva' : ''}"
                 data-notif-id="${n.id}"
                 ${url ? `data-notif-url="${escAttr(url)}" title="Abrir registro relacionado"` : ''}
                 style="padding: 0.7rem; border-bottom: 1px solid #eee; ${n.leida ? 'opacity:0.55;' : ''} ${url ? 'cursor:pointer;' : ''}">
                <div style="display:flex; justify-content:space-between; gap:0.5rem;">
                    <strong style="font-size:0.9rem;">${escHtml(n.titulo)}</strong>
                    ${n.leida ? '' : `<button class="btn-icono" data-marcar-leida="${n.id}" title="Marcar leída" style="color:#006dc8;"><i class="fas fa-check"></i></button>`}
                </div>
                <p style="margin: 0.25rem 0; font-size:0.85rem; color:#444;">${escHtml(n.cuerpo)}</p>
                <span style="font-size:0.7rem; color:#888;">${fmtDate(n.created_at)}</span>
                ${url ? '<div style="font-size:0.72rem;color:#006dc8;margin-top:0.25rem;"><i class="fas fa-external-link-alt"></i> Clic para abrir</div>' : ''}
            </div>`;
        }).join('');
    }

    async function cargar() {
        const sesion = getSession();
        if (!sesion || !sesion.id) return;
        try {
            const r = await fetch(`${API}/api/notificaciones/${sesion.id}`);
            const d = await r.json();
            if (!d.ok) return;
            lista = d.notificaciones || [];
            pintarBadge();
            pintarLista();
        } catch (err) {
            console.warn('Notif admin (load):', err.message);
        }
    }

    function escHtml(s) {
        return String(s || '').replace(/[&<>"']/g, c => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[c]));
    }

    async function marcarLeida(id) {
        try {
            await fetch(`${API}/api/notificaciones/${id}/leida`, { method: 'PUT' });
            // Optimismo local — SSE también nos confirmará
            const n = lista.find(x => x.id === id);
            if (n) n.leida = 1;
            pintarBadge();
            pintarLista();
        } catch (err) {
            toast('No se pudo marcar como leída.', 'error');
        }
    }

    // ── SSE: conexión en tiempo real ──
    function conectarSSE() {
        const sesion = getSession();
        if (!sesion || !sesion.id) return;
        if (!('EventSource' in window)) {
            // Navegador sin soporte → polling clásico
            iniciarPolling();
            return;
        }

        try { if (evtSource) evtSource.close(); } catch (e) {}

        const streamUrl = `${API}/api/notificaciones/stream/${sesion.id}`;
        evtSource = new EventSource(window.sigepavUrl ? window.sigepavUrl(streamUrl) : streamUrl);

        evtSource.addEventListener('hola', () => {
            fijarConectado(true);
        });

        evtSource.addEventListener('nueva', (ev) => {
            try {
                const n = JSON.parse(ev.data);
                // Evitar duplicados si ya estaba (puede pasar al reconectar)
                if (lista.some(x => x.id === n.id)) return;
                lista.unshift(n);
                pintarBadge();
                pintarLista(new Set([n.id]));
                reproducirCampanazo();
                // Toast discreto si la campana está cerrada
                const panel = $('adm-panelNotif');
                if (!panel || panel.style.display !== 'block') {
                    toast(`🔔 ${n.titulo}`, 'info');
                }
            } catch (e) {
                console.warn('SSE nueva parse:', e.message);
            }
        });

        evtSource.addEventListener('leida', (ev) => {
            try {
                const { id } = JSON.parse(ev.data);
                const n = lista.find(x => x.id === id);
                if (n && !n.leida) {
                    n.leida = 1;
                    pintarBadge();
                    pintarLista();
                }
            } catch (e) { /* ignora */ }
        });

        evtSource.onerror = () => {
            fijarConectado(false);
            // EventSource ya reintenta solo. Si tras 10s no reconecta, cae a polling.
            setTimeout(() => {
                if (evtSource && evtSource.readyState === EventSource.CLOSED) {
                    console.warn('SSE cerrado: activando fallback polling.');
                    iniciarPolling();
                }
            }, 10000);
        };
    }

    function iniciarPolling() {
        if (timer) return;  // ya estaba activo
        timer = setInterval(cargar, 30000);
    }

    function detenerPolling() {
        if (timer) { clearInterval(timer); timer = null; }
    }

    function inicializar() {
        const btn = $('adm-btnNotif');
        const panel = $('adm-panelNotif');
        if (!btn || !panel) return;

        // Inyectar dot de "en vivo" en la cabecera del panel si no existe
        const cab = panel.querySelector('.cuenta-cabecera h4');
        if (cab && !$('adm-notif-live-dot')) {
            const dot = document.createElement('span');
            dot.id = 'adm-notif-live-dot';
            dot.className = 'notif-live-dot';
            dot.title = 'Conexión en tiempo real';
            cab.appendChild(dot);
        }

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
            if (panel.style.display === 'block') cargar();
        });
        document.addEventListener('click', (e) => {
            if (!panel.contains(e.target) && e.target !== btn) panel.style.display = 'none';
        });

        $('adm-notif-lista').addEventListener('click', (e) => {
            const t = e.target.closest('[data-marcar-leida]');
            if (t) {
                e.preventDefault();
                e.stopPropagation();
                marcarLeida(parseInt(t.dataset.marcarLeida, 10));
                return;
            }
            const item = e.target.closest('[data-notif-id]');
            if (!item) return;
            abrirNotificacion(item.dataset.notifId, item.dataset.notifUrl || '');
        });

        // Carga inicial + abrir canal SSE en vivo
        cargar().then(() => conectarSSE());

        // Si la pestaña vuelve a estar visible, sincronizamos por si nos perdimos algo
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                cargar();
                if (!evtSource || evtSource.readyState === EventSource.CLOSED) conectarSSE();
            }
        });

        // Cierre limpio al salir
        window.addEventListener('beforeunload', () => {
            try { if (evtSource) evtSource.close(); } catch (e) {}
            detenerPolling();
        });

        // Exponer recarga para módulos que generan notif locales
        window.__sigepav_refrescarNotifAdmin = cargar;
    }

    return { inicializar, cargar };
})();

    /* ─────────── API pública ─────────── */
    return {
        storage,
        getSession,
        fmtCur, fmtDate, vlabel,
        ESTADOS_MX, getMunicipios, getLocalidades,
        toast, confirmar, animarNumeros,
        modulos: { altaEdicion, consultaComisiones, solicitudesFinalizacion, notificacionesAdmin }
    };
})();