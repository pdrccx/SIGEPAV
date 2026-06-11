/* pagina-modulo.js · abre el formulario correcto en cada HTML separado. */
(function () {
    'use strict';

    var MODULO = document.body ? (document.body.dataset.initialModule || '') : '';
    if (!MODULO) return;

    var IDS_VISTA = {
        'registro-comisiones': 'registro-comisiones',
        'mantenimiento': 'formulario-mantenimiento',
        'alta-edicion': 'alta-edicion',
        'consulta-comisiones': 'consulta-comisiones',
        'solicitudes-finalizacion': 'solicitudes-finalizacion'
    };

    function haySesion() {
        if (typeof window.__sigepav_leer_sesion === 'function') {
            return !!window.__sigepav_leer_sesion();
        }
        var raw = null;
        try { raw = sessionStorage.getItem('sigepav_usuario'); } catch (e) {}
        if (!raw) {
            try { raw = localStorage.getItem('sigepav_usuario'); } catch (e) {}
        }
        return !!raw && raw !== 'null' && raw !== 'undefined';
    }

    function guardarRedirectYLogin() {
        var destino = (location.pathname.split('/').pop() || '') + location.search + location.hash;
        try { sessionStorage.setItem('sigepav_redirect_after_login', destino); } catch (e) {}
        try { localStorage.setItem('sigepav_redirect_after_login', destino); } catch (e) {}
        window.location.replace('index.html');
    }

    function mostrarVistaDirecta() {
        var app = document.getElementById('app-container');
        if (app) app.style.display = 'flex';

        document.querySelectorAll('main.contenedor-principal').forEach(function (m) {
            m.style.display = 'none';
        });

        var vista = document.getElementById(IDS_VISTA[MODULO] || MODULO);
        if (vista) vista.style.display = 'flex';

        document.querySelectorAll('.modulo-dropdown').forEach(function (m) {
            m.classList.toggle('activo', m.getAttribute('data-modulo') === MODULO);
        });

        return !!vista;
    }

    var yaAbierto = false;

    function moduloDisponible() {
        if (MODULO === 'registro-comisiones') return typeof window.__sigepav_abrirRegistroComisiones === 'function';
        if (MODULO === 'mantenimiento')        return typeof window.__sigepav_abrirMantenimiento === 'function';
        if (MODULO === 'alta-edicion')         return !!(window.SIGEPAV && window.SIGEPAV.modulos && window.SIGEPAV.modulos.altaEdicion);
        if (MODULO === 'consulta-comisiones')  return !!(window.SIGEPAV && window.SIGEPAV.modulos && window.SIGEPAV.modulos.consultaComisiones);
        if (MODULO === 'solicitudes-finalizacion') return !!(window.SIGEPAV && window.SIGEPAV.modulos && window.SIGEPAV.modulos.solicitudesFinalizacion);
        return false;
    }

    function abrirModuloActual() {
        if (yaAbierto) return true;

        // Esperar a que auth-guard termine de sincronizar la sesión
        if (!haySesion()) {
            guardarRedirectYLogin();
            yaAbierto = true;
            return true;
        }

        // Esperar a que el módulo JS esté disponible
        if (!moduloDisponible()) return false;

        yaAbierto = true;
        mostrarVistaDirecta();

        try {
            if (MODULO === 'registro-comisiones') {
                window.__sigepav_abrirRegistroComisiones();
            } else if (MODULO === 'mantenimiento') {
                window.__sigepav_abrirMantenimiento();
            } else if (MODULO === 'alta-edicion') {
                window.SIGEPAV.modulos.altaEdicion.abrir();
            } else if (MODULO === 'consulta-comisiones') {
                window.SIGEPAV.modulos.consultaComisiones.abrir();
            } else if (MODULO === 'solicitudes-finalizacion') {
                window.SIGEPAV.modulos.solicitudesFinalizacion.abrir();
            }
        } catch (e) {
            console.warn('No se pudo ejecutar la lógica del módulo:', MODULO, e);
        }

        return true;
    }

    function iniciar() {
        var intentos = 0;
        if (abrirModuloActual()) return;
        var timer = setInterval(function () {
            intentos += 1;
            if (abrirModuloActual() || intentos >= 20) clearInterval(timer);
        }, 100);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }
})();
