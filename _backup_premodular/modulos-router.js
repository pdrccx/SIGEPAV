/* modulos-router.js · navegación real entre HTML separados. */
(function () {
    'use strict';

    var RUTAS_MODULOS = {
        'registro-comisiones': 'registro-comisiones.html',
        'mantenimiento': 'mantenimiento.html',
        'alta-edicion': 'alta-edicion.html',
        'consulta-comisiones': 'consulta-comisiones.html',
        'solicitudes-finalizacion': 'solicitudes-finalizacion.html',
        'dashboard': 'dashboard.html',
        'reportes': 'reportes.html',
        'bitacora': 'historial.html',
        'agregar-usuario': 'Agregar.html',
        'expediente': 'expediente.html',
        'respaldos': 'respaldos.html',
        'vales': 'vales.html',
        'vales-historial': 'vales.html?tab=historial'
    };

    function moduloActual() {
        return document.body ? (document.body.dataset.initialModule || '') : '';
    }

    function ir(ruta) {
        if (!ruta) return;
        window.location.assign(ruta);
    }

    document.addEventListener('click', function (e) {
        var botonModulo = e.target.closest && e.target.closest('.modulo-dropdown[data-modulo]');
        if (botonModulo) {
            var modulo = botonModulo.getAttribute('data-modulo');
            var ruta = RUTAS_MODULOS[modulo];
            if (ruta) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                // Siempre usamos navegación por HTML real. Aunque Script.js tenga
                // handlers viejos para abrir vistas internas, este listener va en
                // capture y los cancela para evitar rebotes al login o que se abra
                // el módulo equivocado dentro de la página actual.
                if (modulo !== moduloActual()) {
                    ir(ruta);
                } else {
                    var menu = botonModulo.closest('.dropdown-contenido');
                    if (menu) { menu.classList.remove('show'); menu.classList.remove('visible'); }
                }
                return false;
            }
        }

        var headerInicio = e.target.closest && e.target.closest('.barra-superior .titulo-sistema, .barra-superior .titulo-sistema h1, .barra-superior .logo-barra');
        if (headerInicio && moduloActual()) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            ir('menu.html');
            return false;
        }
    }, true);
})();
