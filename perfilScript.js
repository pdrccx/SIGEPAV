(function () {
    'use strict';

    var datosOriginales = {};

    function leerSesion() {
        if (typeof window.__sigepav_leer_sesion === 'function') return window.__sigepav_leer_sesion();
        var raw = null;
        try { raw = sessionStorage.getItem('sigepav_usuario'); } catch(e){}
        if (!raw) { try { raw = localStorage.getItem('sigepav_usuario'); } catch(e){} }
        if (!raw || raw === 'null') return null;
        try { return JSON.parse(raw); } catch(e){ return null; }
    }

    function guardarSesion(s) {
        if (typeof window.__sigepav_guardar_sesion === 'function') { window.__sigepav_guardar_sesion(s); return; }
        var raw = JSON.stringify(s);
        try { sessionStorage.setItem('sigepav_usuario', raw); } catch(e){}
        try { localStorage.setItem('sigepav_usuario', raw); } catch(e){}
    }

    function normalizarFoto(sesion) {
        var f = sesion && (sesion.foto_perfil || sesion.fotoPerfil || '');
        f = String(f || '').trim();
        if (!f) return 'Logo.jpeg';
        if (/^https?:\/\//i.test(f) || f.startsWith('data:')) return f;
        return f.replace(/^\/+/, '');
    }

    function rolLegible(s) {
        if (!s) return '—';
        var rid = Number(s.rol_id || s.rolId || 0);
        if (rid === 1) return 'Administrador';
        return s.rol || 'Usuario operativo';
    }

    function setStatus(elId, msg, tipo) {
        var el = document.getElementById(elId);
        if (!el) return;
        el.className = 'perfil-status-datos ' + (tipo || '');
        el.innerHTML = (tipo === 'ok' ? '<i class="fas fa-check-circle"></i> ' : '<i class="fas fa-exclamation-circle"></i> ') + msg;
        if (tipo) {
            clearTimeout(el._timer);
            el._timer = setTimeout(function () { el.className = 'perfil-status-datos'; }, 4000);
        }
    }

    function setFotoStatus(msg, tipo) {
        var el = document.getElementById('perfilFotoStatus');
        if (!el) return;
        el.textContent = msg;
        el.className = 'perfil-foto-status ' + (tipo || '');
        clearTimeout(el._timer);
        el._timer = setTimeout(function () { el.textContent = ''; el.className = 'perfil-foto-status'; }, 4000);
    }

    function cargarDatos() {
        var s = leerSesion();
        if (!s) return;

        var nombreCompleto = [s.nombre, s.apellidos].filter(Boolean).join(' ');

        // Foto
        var fotoSrc = normalizarFoto(s);
        document.getElementById('perfilFotoImg').src = fotoSrc;

        // Sidebar
        document.getElementById('perfilNombreLateral').textContent = nombreCompleto || s.email || '—';
        document.getElementById('perfilEmailLateral').textContent  = s.email || '—';
        document.getElementById('perfilRolBadge').innerHTML = '<i class="fas fa-shield-alt"></i> ' + rolLegible(s);

        // Campos
        document.getElementById('perfil-nombre').value      = s.nombre      || '';
        document.getElementById('perfil-apellidos').value   = s.apellidos   || '';
        document.getElementById('perfil-email').value       = s.email       || '';
        document.getElementById('perfil-departamento').value = s.departamento || '';
        document.getElementById('perfil-cargo').value       = s.cargo       || '';

        // Guardar snapshot para "Descartar"
        datosOriginales = {
            nombre:    s.nombre    || '',
            apellidos: s.apellidos || '',
            email:     s.email     || ''
        };
    }

    function actualizarSidebar() {
        var nombre    = document.getElementById('perfil-nombre').value.trim();
        var apellidos = document.getElementById('perfil-apellidos').value.trim();
        var email     = document.getElementById('perfil-email').value.trim();
        document.getElementById('perfilNombreLateral').textContent = [nombre, apellidos].filter(Boolean).join(' ') || email || '—';
        document.getElementById('perfilEmailLateral').textContent  = email || '—';

        // También actualizar el chip de la barra superior
        document.querySelectorAll('.correo-usuario, #user-email-display').forEach(function(el) {
            if (!el.closest('.cuenta-panel')) el.textContent = email || 'Usuario';
        });
    }

    // ── Guardar datos personales ──
    document.getElementById('btnGuardarDatos').addEventListener('click', async function () {
        var s = leerSesion();
        if (!s || !s.id) { setStatus('statusDatos', 'Sesión no encontrada.', 'err'); return; }

        var nombre    = document.getElementById('perfil-nombre').value.trim();
        var apellidos = document.getElementById('perfil-apellidos').value.trim();
        var email     = document.getElementById('perfil-email').value.trim();

        if (!nombre)  { setStatus('statusDatos', 'El nombre es obligatorio.', 'err'); return; }
        if (!email)   { setStatus('statusDatos', 'El correo es obligatorio.', 'err'); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setStatus('statusDatos', 'Correo no válido.', 'err'); return; }

        var btn = document.getElementById('btnGuardarDatos');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…';

        try {
            var resp = await fetch('/api/usuarios/' + s.id + '/perfil', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
                body: JSON.stringify({ nombre: nombre, apellidos: apellidos, email: email })
            });
            var data = await resp.json();
            if (!resp.ok || !data.ok) throw new Error(data.error || 'No se pudo guardar.');

            // Actualizar sesión
            s.nombre    = nombre;
            s.apellidos = apellidos;
            s.email     = email;
            guardarSesion(s);

            datosOriginales = { nombre: nombre, apellidos: apellidos, email: email };
            actualizarSidebar();

            // Actualizar fotos/nombre en chip si auth-guard.js está disponible
            if (typeof window.__sigepav_render_cuenta === 'function') {
                window.__sigepav_render_cuenta(s);
            }

            setStatus('statusDatos', 'Perfil actualizado correctamente.', 'ok');
        } catch (err) {
            setStatus('statusDatos', err.message || 'Error al guardar.', 'err');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Guardar cambios';
        }
    });

    // ── Descartar cambios ──
    document.getElementById('btnCancelarDatos').addEventListener('click', function () {
        document.getElementById('perfil-nombre').value    = datosOriginales.nombre;
        document.getElementById('perfil-apellidos').value = datosOriginales.apellidos;
        document.getElementById('perfil-email').value     = datosOriginales.email;
        document.getElementById('statusDatos').className  = 'perfil-status-datos';
    });

    // ── Cambiar foto ──
    var inputFoto = document.getElementById('perfil-foto-input');

    function triggerFoto() { inputFoto.click(); }
    document.getElementById('btnCambiarFoto').addEventListener('click', triggerFoto);
    document.getElementById('perfilAvatarOverlay').addEventListener('click', triggerFoto);

    inputFoto.addEventListener('change', async function () {
        var archivo = inputFoto.files && inputFoto.files[0];
        if (!archivo) return;

        if (!/^image\/(jpeg|png|webp)$/i.test(archivo.type)) {
            setFotoStatus('Solo JPG, PNG o WEBP.', 'err'); inputFoto.value = ''; return;
        }
        if (archivo.size > 3 * 1024 * 1024) {
            setFotoStatus('La imagen no debe superar 3 MB.', 'err'); inputFoto.value = ''; return;
        }

        var s = leerSesion();
        if (!s || !s.id) { setFotoStatus('Sesión no encontrada.', 'err'); inputFoto.value = ''; return; }

        var btn = document.getElementById('btnCambiarFoto');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subiendo…';

        try {
            var form = new FormData();
            form.append('foto_perfil', archivo);
            form.append('usuario_id', s.id);

            var resp = await fetch('/api/usuarios/' + s.id + '/foto', {
                method: 'PUT',
                headers: { 'ngrok-skip-browser-warning': '1' },
                body: form
            });
            var data = await resp.json();
            if (!resp.ok || !data.ok) throw new Error(data.error || 'No se pudo subir la foto.');

            s.foto_perfil = data.foto_perfil;
            guardarSesion(s);

            var src = data.foto_perfil.replace(/^\/+/, '') + '?v=' + Date.now();
            document.querySelectorAll('.js-foto-perfil-img, .perfil-avatar-img, .avatar-usuario img').forEach(function(img){
                img.src = src;
            });

            setFotoStatus('Foto actualizada.', 'ok');
        } catch (err) {
            setFotoStatus(err.message || 'Error al subir la foto.', 'err');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-camera"></i> Actualizar foto';
            inputFoto.value = '';
        }
    });

    // ── Cambiar contraseña ──
    document.getElementById('btnGuardarPwd').addEventListener('click', async function () {
        var s = leerSesion();
        if (!s || !s.id) { setStatus('statusPwd', 'Sesión no encontrada.', 'err'); return; }

        var actual    = document.getElementById('perfil-pwd-actual').value;
        var nueva     = document.getElementById('perfil-pwd-nueva').value;
        var confirmar = document.getElementById('perfil-pwd-confirmar').value;

        if (!actual)   { setStatus('statusPwd', 'Ingresa tu contraseña actual.', 'err'); return; }
        if (!nueva)    { setStatus('statusPwd', 'Ingresa la nueva contraseña.', 'err'); return; }
        if (nueva.length < 6) { setStatus('statusPwd', 'La nueva contraseña debe tener al menos 6 caracteres.', 'err'); return; }
        if (nueva !== confirmar) { setStatus('statusPwd', 'Las contraseñas no coinciden.', 'err'); return; }

        var btn = document.getElementById('btnGuardarPwd');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cambiando…';

        try {
            var resp = await fetch('/api/usuarios/' + s.id + '/password', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
                body: JSON.stringify({ password_actual: actual, password_nuevo: nueva })
            });
            var data = await resp.json();
            if (!resp.ok || !data.ok) throw new Error(data.error || 'No se pudo cambiar la contraseña.');

            document.getElementById('perfil-pwd-actual').value    = '';
            document.getElementById('perfil-pwd-nueva').value     = '';
            document.getElementById('perfil-pwd-confirmar').value = '';
            setStatus('statusPwd', 'Contraseña cambiada correctamente.', 'ok');
        } catch (err) {
            setStatus('statusPwd', err.message || 'Error al cambiar la contraseña.', 'err');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-key"></i> Cambiar contraseña';
        }
    });

    // Cargar al inicio (después de que auth-guard.js termine)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { setTimeout(cargarDatos, 50); });
    } else {
        setTimeout(cargarDatos, 50);
    }

})();
