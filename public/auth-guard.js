/* =====================================================================
   auth-guard.js · SIGEPAV
   Guard de sesión para páginas separadas.

   Reglas:
   - index.html es LOGIN PURO: nunca manda solo al menú.
   - menu.html y formularios requieren sesión.
   - si no hay sesión, guarda a qué página querían entrar y manda al login.
   - logout borra sessionStorage + localStorage + redirecciones pendientes.
   - el chip/panel de cuenta se unifica en todos los formularios.
   ===================================================================== */
(function () {
    'use strict';

    var SESSION_KEY = 'sigepav_usuario';

    function parseSesion(raw) {
        if (!raw || raw === 'null' || raw === 'undefined') return null;
        try {
            var data = JSON.parse(raw);
            if (!data || typeof data !== 'object') return null;
            return data;
        } catch (e) {
            return null;
        }
    }

    function leerSesion() {
        var sesion = null;
        try { sesion = parseSesion(sessionStorage.getItem(SESSION_KEY)); } catch (e) {}
        if (!sesion) {
            try { sesion = parseSesion(localStorage.getItem(SESSION_KEY)); } catch (e) {}
        }

        // Sincroniza ambos storages para que al cambiar de HTML no se pierda.
        if (sesion) {
            var raw = JSON.stringify(sesion);
            try { sessionStorage.setItem(SESSION_KEY, raw); } catch (e) {}
            try { localStorage.setItem(SESSION_KEY, raw); } catch (e) {}
        }
        return sesion;
    }

    function guardarSesion(sesion) {
        if (!sesion) return;
        var raw = JSON.stringify(sesion);
        try { sessionStorage.setItem(SESSION_KEY, raw); } catch (e) {}
        try { localStorage.setItem(SESSION_KEY, raw); } catch (e) {}
        window.__sigepav_sesion_cache = sesion;
    }

    function limpiarSesion() {
        try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
        try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
        try { sessionStorage.removeItem('sigepav_abrir_modulo'); } catch (e) {}
        try { sessionStorage.removeItem('sigepav_redirect_after_login'); } catch (e) {}
        try { localStorage.removeItem('sigepav_redirect_after_login'); } catch (e) {}
    }

    function nombrePagina() {
        var p = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
        return p || 'index.html';
    }

    function esAdministrador(sesion) {
        var rolId = sesion && (sesion.rol_id || sesion.rolId || sesion.role_id);
        if (Number(rolId) === 1) return true;
        var rolNorm = String((sesion && (sesion.rol || sesion.role)) || '').trim().toLowerCase();
        return rolNorm === 'administrador' || rolNorm === 'admin';
    }

    function guardarRedirect() {
        var pagina = nombrePagina();
        if (pagina === 'index.html') return;
        var destino = pagina + location.search + location.hash;
        try { sessionStorage.setItem('sigepav_redirect_after_login', destino); } catch (e) {}
        try { localStorage.setItem('sigepav_redirect_after_login', destino); } catch (e) {}
    }

    function escapeHTML(valor) {
        return String(valor == null ? '' : valor).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    function normalizarUrlFoto(sesion) {
        var foto = sesion && (sesion.foto_perfil || sesion.fotoPerfil || sesion.foto_url || sesion.avatar_url || sesion.avatar);
        foto = String(foto || '').trim();
        if (!foto) return 'Logo.jpeg';
        if (/^(https?:)?\/\//i.test(foto) || foto.indexOf('data:image/') === 0) return foto;
        return foto.replace(/^\/+/, '');
    }

    function rolLegible(sesion) {
        var rolNorm = String((sesion && sesion.rol) || '').trim().toLowerCase();
        if (esAdministrador(sesion)) return 'Administrador';
        if (rolNorm === 'operativo' || rolNorm === 'usuario') return 'Usuario operativo';
        return (sesion && sesion.rol) || 'Usuario';
    }

    function datosCuenta(sesion) {
        var nombreCompleto = [sesion && sesion.nombre, sesion && sesion.apellidos]
            .filter(Boolean).join(' ').trim();
        var email = (sesion && sesion.email) || 'Usuario';
        var rol = rolLegible(sesion);
        var cargo = (sesion && sesion.cargo) || rol;
        var departamento = (sesion && sesion.departamento) || '—';
        var ultimo = new Date().toLocaleString('es-MX', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
        return { nombreCompleto: nombreCompleto, email: email, rol: rol, cargo: cargo, departamento: departamento, ultimo: ultimo };
    }

    function htmlCuenta(sesion) {
        var d = datosCuenta(sesion);
        var foto = normalizarUrlFoto(sesion);
        return '' +
            '<button class="info-usuario info-usuario-btn" id="btnCuenta" type="button" aria-haspopup="true" aria-expanded="false">' +
                '<span class="avatar-usuario"><img class="js-foto-perfil-img" src="' + escapeHTML(foto) + '" alt="Foto de perfil" onerror="this.src=\'Logo.jpeg\'"></span>' +
                '<span class="correo-usuario" id="user-email-display">' + escapeHTML(d.email) + '</span>' +
                '<i class="fas fa-angle-down cuenta-flecha"></i>' +
            '</button>' +
            '<div class="cuenta-panel" id="cuentaPanel">' +
                '<div class="cuenta-cabecera">' +
                    '<div class="cuenta-avatar"><img class="js-foto-perfil-img" src="' + escapeHTML(foto) + '" alt="Foto de perfil" onerror="this.src=\'Logo.jpeg\'"></div>' +
                    '<div class="cuenta-cabecera-texto">' +
                        '<p class="cuenta-cabecera-email">' + escapeHTML(d.email) + '</p>' +
                        '<p class="cuenta-cabecera-nombre">' + escapeHTML(d.nombreCompleto || d.cargo) + '</p>' +
                    '</div>' +
                '</div>' +
                '<div class="cuenta-acciones">' +
                    '<a class="btn-mi-perfil" href="perfil.html"><i class="fas fa-user-edit"></i> Mi perfil</a>' +
                    '<button class="btn-cerrar-sesion" id="logoutBtn" type="button"><i class="fas fa-sign-out-alt"></i> Cerrar sesión</button>' +
                '</div>' +
            '</div>';
    }

    function conservarNotificaciones(contenedor) {
        var guardados = [];
        contenedor.querySelectorAll('#adm-dropdown-notif, #usr-dropdown-notif').forEach(function (n) {
            guardados.push(n);
        });
        return guardados;
    }

    function renderCuenta(sesion) {
        if (!sesion) return;

        // 1) Páginas que ya tenían el dropdown (Usuario.html / IA.html)
        var dropdownExistente = document.getElementById('dropdown-cuenta');
        if (dropdownExistente) {
            dropdownExistente.innerHTML = htmlCuenta(sesion);
        }

        // 2) Formularios/admin: reemplaza el chip estático por el dropdown completo.
        document.querySelectorAll('.info-usuario').forEach(function (contenedor) {
            // Si este .info-usuario ya es el botón del dropdown, no lo tocamos.
            if (contenedor.id === 'btnCuenta' || contenedor.classList.contains('info-usuario-btn')) return;
            if (contenedor.querySelector('#dropdown-cuenta')) return;

            var notificaciones = conservarNotificaciones(contenedor);
            contenedor.innerHTML = '';
            contenedor.classList.add('info-usuario-wrapper');
            notificaciones.forEach(function (n) { contenedor.appendChild(n); });

            var cuenta = document.createElement('div');
            cuenta.className = 'dropdown-cuenta';
            cuenta.id = 'dropdown-cuenta';
            cuenta.innerHTML = htmlCuenta(sesion);
            contenedor.appendChild(cuenta);
        });

        // Fallback: solo actualiza cualquier display suelto que haya quedado.
        document.querySelectorAll('#user-email-display, #usr-nombre-header, .correo-usuario').forEach(function (el) {
            if (el && !el.closest('.cuenta-panel')) el.textContent = sesion.email || 'Usuario';
        });

        activarPanelCuenta();
    }

    function activarPanelCuenta() {
        var btn = document.getElementById('btnCuenta');
        var panel = document.getElementById('cuentaPanel');
        if (!btn || !panel || btn._sigepavCuentaBound) {
            activarCambioFotoPerfil();
            return;
        }
        btn._sigepavCuentaBound = true;

        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var abierto = panel.classList.toggle('show');
            btn.setAttribute('aria-expanded', abierto ? 'true' : 'false');

            var menuModulos = document.getElementById('dropdownMenuGlobal');
            if (menuModulos) {
                menuModulos.classList.remove('show');
                menuModulos.classList.remove('visible');
            }
        });

        document.addEventListener('click', function (e) {
            if (!panel.contains(e.target) && !btn.contains(e.target)) {
                panel.classList.remove('show');
                btn.setAttribute('aria-expanded', 'false');
            }
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                panel.classList.remove('show');
                btn.setAttribute('aria-expanded', 'false');
            }
        });

        activarCambioFotoPerfil();
    }

    function apiBase() {
        return (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : window.location.origin;
    }

    function setEstadoFoto(panel, mensaje, tipo) {
        var estado = panel && panel.querySelector('.js-estado-foto');
        if (!estado) return;
        estado.textContent = mensaje || '';
        estado.classList.remove('ok', 'error');
        if (tipo) estado.classList.add(tipo);
    }

    function actualizarFotosEnUI(url) {
        var src = normalizarUrlFoto({ foto_perfil: url });
        var conCache = src;
        if (src && src !== 'Logo.jpeg' && src.indexOf('data:image/') !== 0) {
            conCache = src + (src.indexOf('?') === -1 ? '?' : '&') + 'v=' + Date.now();
        }
        document.querySelectorAll('.js-foto-perfil-img, .avatar-usuario img, .cuenta-avatar img').forEach(function (img) {
            img.src = conCache;
        });
    }

    function activarCambioFotoPerfil() {
        document.querySelectorAll('#cuentaPanel').forEach(function (panel) {
            if (panel._sigepavFotoBound) return;
            var input = panel.querySelector('.js-foto-perfil-input');
            var boton = panel.querySelector('.js-cambiar-foto');
            if (!input || !boton) return;
            panel._sigepavFotoBound = true;

            boton.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                input.click();
            });

            input.addEventListener('click', function (e) { e.stopPropagation(); });

            input.addEventListener('change', async function () {
                var archivo = input.files && input.files[0];
                if (!archivo) return;

                if (!/^image\/(jpeg|png|webp)$/i.test(archivo.type)) {
                    setEstadoFoto(panel, 'Usa una imagen JPG, PNG o WEBP.', 'error');
                    input.value = '';
                    return;
                }
                if (archivo.size > 3 * 1024 * 1024) {
                    setEstadoFoto(panel, 'La imagen no debe superar 3 MB.', 'error');
                    input.value = '';
                    return;
                }

                var sesion = leerSesion();
                if (!sesion || !sesion.id) {
                    setEstadoFoto(panel, 'No se encontró la sesión actual.', 'error');
                    input.value = '';
                    return;
                }

                var textoOriginal = boton.innerHTML;
                boton.disabled = true;
                boton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subiendo...';
                setEstadoFoto(panel, '', null);

                try {
                    var form = new FormData();
                    form.append('foto_perfil', archivo);
                    form.append('usuario_id', sesion.id);

                    var resp = await fetch(apiBase() + '/api/usuarios/' + encodeURIComponent(sesion.id) + '/foto', {
                        method: 'PUT',
                        body: form
                    });
                    var data = await resp.json().catch(function () { return {}; });
                    if (!resp.ok || !data.ok) {
                        throw new Error(data.error || 'No se pudo actualizar la foto.');
                    }

                    sesion.foto_perfil = data.foto_perfil;
                    guardarSesion(sesion);
                    actualizarFotosEnUI(data.foto_perfil);
                    setEstadoFoto(panel, 'Foto actualizada.', 'ok');
                } catch (err) {
                    setEstadoFoto(panel, err.message || 'No se pudo actualizar la foto.', 'error');
                } finally {
                    boton.disabled = false;
                    boton.innerHTML = textoOriginal;
                    input.value = '';
                }
            });
        });
    }

    function aplicarGuardiaDeRol(sesion) {
        if (!sesion) return false;

        var pagina = nombrePagina();
        var adminPages = {
            'menu.html': true,
            'registro-comisiones.html': true,
            'consulta-comisiones.html': true,
            'solicitudes-finalizacion.html': true,
            'vales.html': true,
            'alta-edicion.html': true,
            'mantenimiento.html': true,
            'dashboard.html': true,
            'reportes.html': true,
            'historial.html': true,
            'agregar.html': true,
            'expediente.html': true,
            'respaldos.html': true
            // perfil.html: accesible para todos los roles
        };

        var admin = esAdministrador(sesion);
        if (!admin && adminPages[pagina]) {
            window.location.replace('Usuario.html');
            return true;
        }
        if (admin && pagina === 'usuario.html') {
            window.location.replace('menu.html');
            return true;
        }
        return false;
    }

    var paginaActual = nombrePagina();
    var esLogin = document.body && document.body.dataset.loginPage === 'true';
    var esPublica = esLogin || paginaActual === 'index.html' || paginaActual === 'seguimiento-publico.html';
    var sesion = leerSesion();

    if (sesion && aplicarGuardiaDeRol(sesion)) return;

    // index.html debe mostrar login siempre. Nada de auto-login/auto-menú aquí.
    if (!sesion && !esPublica) {
        guardarRedirect();
        window.location.replace('index.html');
        return;
    }

    function inicializarUI() {
        var sesionActual = leerSesion();

        var app = document.getElementById('app-container');
        if (app && sesionActual) {
            // Varias páginas ya no usan Script.js; sin esto el navbar/header queda
            // oculto porque el HTML trae #app-container con display:none.
            app.style.display = 'flex';
        }

        if (sesionActual) renderCuenta(sesionActual);

        var logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn && !logoutBtn._guardBound) {
            logoutBtn._guardBound = true;
            logoutBtn.addEventListener('click', function (e) {
                e.preventDefault();
                limpiarSesion();
                window.location.href = 'index.html';
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializarUI);
    } else {
        inicializarUI();
    }

    window.__sigepav_sesion_cache = sesion;
    window.__sigepav_leer_sesion = leerSesion;
    window.__sigepav_guardar_sesion = guardarSesion;
    window.__sigepav_limpiar_sesion = limpiarSesion;
    window.__sigepav_es_admin = esAdministrador;
    window.__sigepav_render_cuenta = renderCuenta;
})();