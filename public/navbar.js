/* =====================================================================
   navbar.js  ·  SIGEPAV
   Menú desplegable UNIFICADO para todo el sistema.
   Carga este script en cualquier página que tenga:
       <div id="dropdown-modulos-principal"></div>
   y el menú se renderiza automáticamente, idéntico en cada vista.

   Módulos excluidos a petición:
     - Control de combustible
   "Reportes" se renombra a "Reportes ciudadanos".
   Etapa Regional: se agregan "Vencimientos y alertas" y "Costos por vehículo".
   ===================================================================== */
(function () {
    'use strict';

    // Página actual (para marcar el item activo)
    const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

    // Estructura única del menú. data-href = navegación entre páginas.
    // data-modulo = acción interna (usado por Script.js en index.html).
    const SECCIONES = [
        {
            titulo: 'Gestión de comisiones',
            icono: 'fas fa-receipt',
            items: [
                { label: 'Registro de comisiones',   icono: 'fas fa-pen-alt',         href: 'registro-comisiones.html', modulo: 'registro-comisiones' },
                { label: 'Consulta de comisiones',   icono: 'fas fa-clipboard-list',  href: 'consulta-comisiones.html', modulo: 'consulta-comisiones' },
                { label: 'Solicitudes de finalización', icono: 'fas fa-check-double', href: 'solicitudes-finalizacion.html', modulo: 'solicitudes-finalizacion' },
                { label: 'Registro de vales',        icono: 'fas fa-ticket-alt',      href: 'vales.html', modulo: 'vales' },
            ]
        },
        {
            titulo: 'Parque vehicular',
            icono: 'fas fa-car',
            items: [
                { label: 'Altas, edición y consultas', icono: 'fas fa-car-side',    href: 'alta-edicion.html', modulo: 'alta-edicion' },
                { label: 'Mantenimiento',              icono: 'fas fa-cogs',        href: 'mantenimiento.html',     modulo: 'mantenimiento' },
                { label: 'Vencimientos y alertas',     icono: 'fas fa-calendar-alt', href: 'vencimientos.html',     modulo: 'alertas' }
            ]
        },
        {
            titulo: 'Monitoreo y reportes',
            icono: 'fas fa-chart-line',
            items: [
                { label: 'Dashboard',           icono: 'fas fa-chart-pie', href: 'dashboard.html', modulo: 'dashboard' },
                { label: 'Costos por vehículo', icono: 'fas fa-dollar-sign', href: 'costos.html', modulo: 'costos' },
                { label: 'Salud de la flota (IA)', icono: 'fas fa-heart-pulse', href: 'salud-flota.html', modulo: 'salud-flota' },
                { label: 'Reportes ciudadanos', icono: 'fas fa-flag',      href: 'reportes.html',  modulo: 'reportes' },
                { label: 'Bitácora / Auditorías', icono: 'fas fa-history', href: 'historial.html', modulo: 'bitacora' }
            ]
        },
        {
            titulo: 'Seguridad y respaldos',
            icono: 'fas fa-shield-alt',
            items: [
                { label: 'Agregar usuario',    icono: 'fas fa-user-plus',    href: 'Agregar.html',    modulo: 'agregar-usuario' },
                { label: 'Expediente digital', icono: 'fas fa-folder-open',  href: 'expediente.html', modulo: 'expediente' },
                { label: 'Respaldos',          icono: 'fas fa-database',     href: 'respaldos.html',  modulo: 'respaldos' },
                { label: 'Configuración',      icono: 'fas fa-sliders',      href: 'configuracion.html', modulo: 'configuracion' }
            ]
        },
        {
            titulo: 'Soporte institucional',
            icono: 'fas fa-life-ring',
            items: [
                { label: 'Manual de usuario', icono: 'fas fa-question-circle', href: 'manual.html', modulo: 'manual-sigepav' }
            ]
        }
    ];

    // Mapeo página → modulo activo
    const ACTIVO_POR_PAGINA = {
        'index.html':      null,
        'menu.html':       null,
        'registro-comisiones.html': 'registro-comisiones',
        'mantenimiento.html': 'mantenimiento',
        'alta-edicion.html': 'alta-edicion',
        'consulta-comisiones.html': 'consulta-comisiones',
        'solicitudes-finalizacion.html': 'solicitudes-finalizacion',
        'dashboard.html':  'dashboard',
        'reportes.html':   'reportes',
        'historial.html':  'bitacora',
        'agregar.html':    'agregar-usuario',
        'expediente.html': 'expediente',
        'respaldos.html':  'respaldos',
        'vales.html':      'vales',
        'vencimientos.html': 'alertas',
        'costos.html':     'costos',
        'salud-flota.html': 'salud-flota',
        'manual.html':     'manual-sigepav',
        'configuracion.html': 'configuracion'
    };
    const moduloActivo = ACTIVO_POR_PAGINA[path] || null;

    function leerSesion() {
        if (typeof window.__sigepav_leer_sesion === 'function') return window.__sigepav_leer_sesion();
        let raw = null;
        try { raw = sessionStorage.getItem('sigepav_usuario'); } catch (e) {}
        if (!raw) { try { raw = localStorage.getItem('sigepav_usuario'); } catch (e) {} }
        if (!raw || raw === 'null' || raw === 'undefined') return null;
        try { return JSON.parse(raw); } catch (e) { return null; }
    }

    function esAdministrador(sesion) {
        if (!sesion) return false;
        if (Number(sesion.rol_id || sesion.rolId || sesion.role_id) === 1) return true;
        const rol = String(sesion.rol || sesion.role || '').trim().toLowerCase();
        return rol === 'administrador' || rol === 'admin';
    }

    // En index.html el menú original ya está hard-codeado en el HTML y
    // Script.js depende de los data-modulo. No reemplazamos su HTML; sólo
    // limpiamos los items excluidos y renombramos "Reportes".
    const esIndex = path === 'index.html' || path === '';

    function construirHTML() {
        const secHTML = SECCIONES.map(sec => {
            const itemsHTML = sec.items.map(it => {
                const activoCls = (it.modulo === moduloActivo) ? ' activo' : '';
                const downloadAttr = it.download ? ' download="Manual_SIGEPAV.pdf"' : '';
                return `<a class="modulo-dropdown${activoCls}" href="${it.href}" data-modulo="${it.modulo}"${downloadAttr}>
                            <i class="${it.icono}"></i> ${it.label}
                        </a>`;
            }).join('');
            return `<div class="dropdown-seccion">
                        <div class="dropdown-titulo-seccion"><i class="${sec.icono}"></i> ${sec.titulo}</div>
                        ${itemsHTML}
                    </div>`;
        }).join('');

        return `
            <button class="btn-dropdown" id="btnDropdownGlobal" type="button">
                <i class="fas fa-bars"></i> Módulos <i class="fas fa-angle-down"></i>
            </button>
            <div class="dropdown-contenido" id="dropdownMenuGlobal">
                ${secHTML}
            </div>
        `;
    }

    function limpiarMenuIndex(cont) {
        // index.html: NO sobreescribimos el HTML (Script.js engancha sus
        // listeners ahí). Sólo quitamos los items excluidos y renombramos.

        // Renombrar "Reportes" → "Reportes ciudadanos"
        const repItem = cont.querySelector('.modulo-dropdown[data-modulo="reportes"]');
        if (repItem) {
            // Cambia el icono y el texto manteniendo el <i>
            repItem.innerHTML = '<i class="fas fa-flag"></i> Reportes ciudadanos';
        }

        // Eliminar secciones que quedaron vacías (sin items)
        cont.querySelectorAll('.dropdown-seccion').forEach(sec => {
            if (!sec.querySelector('.modulo-dropdown')) sec.remove();
        });
    }

    function activarToggle(cont) {
        const btn  = cont.querySelector('#btnDropdownGlobal');
        const menu = cont.querySelector('#dropdownMenuGlobal');
        if (!btn || !menu) return;

        // Evitamos doble-listener
        if (btn._sigepavBound) return;
        btn._sigepavBound = true;

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Soportamos tanto .show como .visible (algunos CSS usan uno u otro)
            menu.classList.toggle('show');
            menu.classList.toggle('visible');
        });
        document.addEventListener('click', (e) => {
            if (!cont.contains(e.target)) {
                menu.classList.remove('show');
                menu.classList.remove('visible');
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                menu.classList.remove('show');
                menu.classList.remove('visible');
            }
        });
    }

    // Módulo F: en modo privado se oculta el módulo ciudadano del menú
    // (sin eliminarlo del código). Lee el modo de /api/configuracion,
    // con cache en localStorage para evitar parpadeo entre páginas.
    function aplicarModoOperacion(cont) {
        function aplicar(modo) {
            const esPrivado = modo === 'privado';
            cont.querySelectorAll('.modulo-dropdown[data-modulo="reportes"]').forEach(function (el) {
                el.style.display = esPrivado ? 'none' : '';
            });
            document.documentElement.setAttribute('data-modo-operacion', esPrivado ? 'privado' : 'publico');
        }
        var modoCache = 'publico';
        try { modoCache = localStorage.getItem('sigepav_modo') || 'publico'; } catch (e) {}
        aplicar(modoCache);
        var base = (window.API_BASE || '');
        fetch(base + '/api/configuracion')
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (d && d.ok && d.config) {
                    var modo = d.config.MODO_OPERACION || 'publico';
                    try { localStorage.setItem('sigepav_modo', modo); } catch (e) {}
                    aplicar(modo);
                }
            })
            .catch(function () {});
    }

    function init() {
        const cont = document.getElementById('dropdown-modulos-principal');
        if (!cont) return;

        const sesion = leerSesion();
        const esAdmin = esAdministrador(sesion);

        // Usuario.html e Ia.html traen una navbar OPERATIVA propia (data-opcion)
        // y sus scripts ya manejan el click/navegación interna. Aquí NO debemos
        // tocarla ni agregar otro listener, porque se duplicaba el toggle y el
        // menú quedaba cerrado: sólo se veía el botón "Opciones".
        if (cont.querySelector('[data-opcion]') || cont.dataset.menuTipo === 'usuario') {
            return;
        }

        // Si por alguna razón un usuario no admin alcanza una página con navbar
        // de admin antes de que redireccione el guard, no pintamos módulos admin.
        if (sesion && !esAdmin) {
            return;
        }

        if (esIndex) {
            // Index ya tiene su menú; sólo limpiamos
            limpiarMenuIndex(cont);
            // El toggle ya lo engancha Script.js, no duplicamos.
            return;
        }

        // Resto de páginas: renderizamos el menú unificado. Marcamos el
        // contenedor para evitar renders dobles si navbar.js se carga otra vez.
        if (cont.dataset.sigepavNavbarReady === 'true') {
            activarToggle(cont);
            aplicarModoOperacion(cont);
            return;
        }
        cont.innerHTML = construirHTML();
        cont.dataset.sigepavNavbarReady = 'true';
        activarToggle(cont);
        aplicarModoOperacion(cont);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();



/* =====================================================================
   Barra superior responsiva estable v13.
   IMPORTANTE: sin MutationObserver sobre <body>. La versión anterior podía
   entrar en un ciclo de clases al tocar botones y congelaba la página.
   ===================================================================== */
(function () {
    'use strict';
    if (window.__sigepavTopbarResponsiveReady) return;
    window.__sigepavTopbarResponsiveReady = true;

    function panelVisible(el) {
        if (!el) return false;
        if (el.classList.contains('show') || el.classList.contains('visible')) return true;
        var st = window.getComputedStyle(el);
        return st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0' && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    }

    function hayMenuAbierto() {
        return Array.prototype.some.call(document.querySelectorAll('.dropdown-contenido, .cuenta-panel, #usr-panelNotif, #adm-panelNotif'), panelVisible);
    }

    function initTopbar() {
        var header = document.querySelector('.barra-superior');
        if (!header || header.dataset.sigepavTopbarSmart === 'true') return;
        header.dataset.sigepavTopbarSmart = 'true';

        var lastY = window.scrollY || 0;
        var ticking = false;

        function medir() {
            var h = Math.ceil(header.getBoundingClientRect().height || header.offsetHeight || 72);
            document.documentElement.style.setProperty('--sigepav-topbar-height', h + 'px');
        }

        function actualizarEstadoMenu() {
            var abierto = hayMenuAbierto();
            document.body.classList.toggle('sigepav-menu-open', abierto);
            if (abierto) document.body.classList.remove('sigepav-topbar-hidden');
            medir();
        }

        function alScroll() {
            if (ticking) return;
            ticking = true;
            window.requestAnimationFrame(function () {
                var y = window.scrollY || 0;
                var delta = y - lastY;
                if (y < 18 || hayMenuAbierto()) {
                    document.body.classList.remove('sigepav-topbar-hidden');
                } else if (delta > 8) {
                    document.body.classList.add('sigepav-topbar-hidden');
                } else if (delta < -5) {
                    document.body.classList.remove('sigepav-topbar-hidden');
                }
                lastY = y;
                ticking = false;
            });
        }

        medir();
        window.addEventListener('resize', function () { setTimeout(medir, 50); }, { passive: true });
        window.addEventListener('orientationchange', function () { setTimeout(medir, 150); }, { passive: true });
        window.addEventListener('scroll', alScroll, { passive: true });

        // Listener normal (sin capture) para no interferir con botones del sistema.
        document.addEventListener('click', function () { setTimeout(actualizarEstadoMenu, 30); }, false);
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setTimeout(actualizarEstadoMenu, 30); }, false);

        setTimeout(medir, 200);
        setTimeout(actualizarEstadoMenu, 250);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTopbar);
    } else {
        initTopbar();
    }
})();
