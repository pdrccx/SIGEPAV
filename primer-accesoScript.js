(function () {
    'use strict';

    var SESSION_KEY = 'sigepav_usuario';
    var usuarioId = null;
    var datosGuardados = {};

    // Recuperar sesión temporal de primer_acceso guardada en sessionStorage
    function leerSesionTemp() {
        try {
            var raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
            if (!raw || raw === 'null') return null;
            return JSON.parse(raw);
        } catch (e) { return null; }
    }

    function mostrarAlerta(msg) {
        var el = document.getElementById('pa-alerta');
        var txt = document.getElementById('pa-alerta-txt');
        txt.textContent = msg;
        el.className = 'pa-alerta error show';
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function ocultarAlerta() {
        document.getElementById('pa-alerta').className = 'pa-alerta error';
    }

    function irPantalla(id) {
        document.querySelectorAll('.pa-pantalla').forEach(function(p) {
            p.classList.remove('visible');
        });
        document.getElementById(id).classList.add('visible');
        ocultarAlerta();
    }

    function setStep(n) {
        ['step1','step2','step3'].forEach(function(id, i) {
            var el = document.getElementById(id);
            el.className = 'pa-step';
            if (i + 1 < n) el.classList.add('completado');
            else if (i + 1 === n) el.classList.add('activo');
        });
    }

    // Cargar datos del usuario desde sesión temporal
    var sesionTemp = leerSesionTemp();
    if (!sesionTemp) {
        // Si no hay sesión, redirigir al login
        window.location.replace('index.html');
    } else if (!sesionTemp.primer_acceso) {
        // Ya completó el primer acceso
        window.location.replace(sesionTemp.rol_id === 1 ? 'menu.html' : 'Usuario.html');
    } else {
        usuarioId = sesionTemp.id;
        var nombreCompleto = [sesionTemp.nombre, sesionTemp.apellidos].filter(Boolean).join(' ');
        document.getElementById('pa-nombre-usuario').textContent = nombreCompleto || 'Usuario';
        document.getElementById('pa-username-usuario').textContent = sesionTemp.email || '';
        // Pre-llenar correo institucional si ya tiene uno asignado
        if (sesionTemp.email) {
            document.getElementById('pa-correo-inst').value = sesionTemp.email;
        }
    }

    // ── Toggle contraseña ──
    document.querySelectorAll('.pw-toggle').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var input = document.getElementById(btn.getAttribute('data-target'));
            var icon = btn.querySelector('i');
            if (input.type === 'password') {
                input.type = 'text';
                icon.className = 'fas fa-eye-slash';
            } else {
                input.type = 'password';
                icon.className = 'fas fa-eye';
            }
        });
    });

    // ── Validación en tiempo real de contraseña ──
    document.getElementById('pa-pass-nueva').addEventListener('input', function() {
        var val = this.value;
        function setReq(id, ok) {
            var el = document.getElementById(id);
            el.className = 'req' + (ok ? ' ok' : '');
            el.querySelector('i').className = ok ? 'fas fa-check-circle' : 'fas fa-circle';
        }
        setReq('req-len',   val.length >= 6);
        setReq('req-letra', /[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/.test(val));
        setReq('req-num',   /\d/.test(val));
    });

    // ── Siguiente: validar correos ──
    document.getElementById('btn-siguiente-correos').addEventListener('click', function() {
        var inst  = document.getElementById('pa-correo-inst').value.trim();
        var gmail = document.getElementById('pa-correo-gmail').value.trim();

        if (!inst || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inst)) {
            mostrarAlerta('Ingresa un correo institucional válido.'); return;
        }
        if (!gmail || !gmail.toLowerCase().includes('@gmail.com')) {
            mostrarAlerta('El correo de recuperación debe ser una cuenta @gmail.com.'); return;
        }

        datosGuardados.correo_inst  = inst;
        datosGuardados.correo_gmail = gmail;

        setStep(2);
        irPantalla('pantalla-password');
        document.getElementById('pa-pass-nueva').focus();
    });

    // ── Volver a correos ──
    document.getElementById('btn-volver-correos').addEventListener('click', function() {
        setStep(1);
        irPantalla('pantalla-correos');
    });

    // ── Guardar todo ──
    document.getElementById('btn-guardar-todo').addEventListener('click', async function() {
        var pass    = document.getElementById('pa-pass-nueva').value;
        var confirm = document.getElementById('pa-pass-confirm').value;

        if (!pass || pass.length < 6) {
            mostrarAlerta('La contraseña debe tener al menos 6 caracteres.'); return;
        }
        if (!/[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/.test(pass)) {
            mostrarAlerta('La contraseña debe contener al menos una letra.'); return;
        }
        if (!/\d/.test(pass)) {
            mostrarAlerta('La contraseña debe contener al menos un número.'); return;
        }
        if (pass !== confirm) {
            mostrarAlerta('Las contraseñas no coinciden.'); return;
        }

        var btn = document.getElementById('btn-guardar-todo');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

        try {
            var API_BASE = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : window.location.origin;
            var resp = await fetch(API_BASE + '/api/usuarios/' + encodeURIComponent(usuarioId) + '/primer-acceso', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    correo_institucional: datosGuardados.correo_inst,
                    correo_gmail: datosGuardados.correo_gmail,
                    password: pass
                })
            });
            var data = await resp.json();
            if (!resp.ok || !data.ok) throw new Error(data.error || 'No se pudo completar la configuración.');

            // Limpiar sesión temporal (forzar re-login con la nueva contraseña)
            try { sessionStorage.removeItem('sigepav_usuario'); } catch(e){}
            try { localStorage.removeItem('sigepav_usuario'); } catch(e){}

            setStep(3);
            irPantalla('pantalla-exito');
        } catch (err) {
            mostrarAlerta(err.message || 'Error al guardar. Intenta de nuevo.');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check-circle"></i> Finalizar configuración';
        }
    });

    // ── Ir al login ──
    document.getElementById('btn-ir-login').addEventListener('click', function() {
        window.location.replace('index.html');
    });

    // Enter en campos de correo
    ['pa-correo-inst','pa-correo-gmail'].forEach(function(id) {
        document.getElementById(id).addEventListener('keydown', function(e) {
            if (e.key === 'Enter') document.getElementById('btn-siguiente-correos').click();
        });
    });
    ['pa-pass-nueva','pa-pass-confirm'].forEach(function(id) {
        document.getElementById(id).addEventListener('keydown', function(e) {
            if (e.key === 'Enter') document.getElementById('btn-guardar-todo').click();
        });
    });

})();
