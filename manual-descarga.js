/* manual-descarga.js · descarga directa del manual institucional SIGEPAV. */
(function () {
    'use strict';

    const MANUAL_URL = 'Manual_SIGEPAV.pdf';
    const MANUAL_NOMBRE = 'Manual_SIGEPAV.pdf';

    function descargarManualSIGEPAV() {
        const enlace = document.createElement('a');
        enlace.href = MANUAL_URL;
        enlace.download = MANUAL_NOMBRE;
        enlace.style.display = 'none';
        document.body.appendChild(enlace);
        enlace.click();
        setTimeout(() => enlace.remove(), 1000);
    }

    window.descargarManualSIGEPAV = descargarManualSIGEPAV;
})();
