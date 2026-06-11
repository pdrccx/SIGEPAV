        // Esta página fue reemplazada por el módulo "Consulta de comisiones"
        // dentro de index.html (admin). Redirigimos para no romper enlaces.
        // La consulta REAL se hace contra MySQL desde Script.js → SIGEPAV.modulos.consultaComisiones.
        try {
            sessionStorage.setItem('sigepav_abrir_modulo', 'consulta-comisiones');
        } catch (e) {}
        window.location.replace('index.html');
