/* =====================================================================
   vales-combo.js  ·  SIGEPAV
   Llena el <select id="no-viaje"> con los vales disponibles y autorrellena
   los datos en .vale-info cuando se elige uno.
   Reutiliza el mismo dataset (id del vale) para enviarlo al backend.

   Requisitos del HTML:
     <select id="no-viaje">  (debe existir; default option value="" = S/V)
     <div    id="vale-info-box" style="display:none">
       <strong id="vale-folio"></strong>
       <strong id="vale-litros"></strong>
       <strong id="vale-precio"></strong>
       <strong id="vale-cantidad"></strong>
     </div>
   ===================================================================== */
(function () {
    'use strict';

    const API_BASE = window.API_BASE || '';
    const sel  = document.getElementById('no-viaje');
    const box  = document.getElementById('vale-info-box');
    const folioEl = document.getElementById('vale-folio');
    const litrosEl = document.getElementById('vale-litros');
    const precioEl = document.getElementById('vale-precio');
    const cantEl   = document.getElementById('vale-cantidad');
    if (!sel) return;

    // Cache de vales para no consultar la API en cada cambio
    let valesCache = [];

    function fmtMx(n) {
        if (n == null || n === '') return '—';
        return '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function fmtNum(n) {
        if (n == null || n === '') return '—';
        return Number(n).toLocaleString('es-MX', { maximumFractionDigits: 2 });
    }

    async function cargarVales() {
        try {
            const resp = await fetch(`${API_BASE}/api/vales/disponibles`);
            const data = await resp.json();
            if (!data.ok) throw new Error(data.error || 'Sin respuesta');
            valesCache = data.vales || [];
            // Mantener el "S/V" default y agregar los disponibles
            sel.innerHTML = '<option value="">(S/V) — Sin vale</option>' +
                valesCache.map(v =>
                    `<option value="${v.id}">${v.no_vale}${v.folio ? ' · Folio ' + v.folio : ''}</option>`
                ).join('');
        } catch (err) {
            console.warn('[vales-combo] No se pudieron cargar vales:', err.message);
        }
    }

    function mostrarDatos(vale) {
        if (!vale) {
            box.style.display = 'none';
            return;
        }
        box.style.display = '';
        folioEl.textContent  = vale.folio || '—';
        litrosEl.textContent = fmtNum(vale.litros);
        precioEl.textContent = fmtMx(vale.precio_litro);
        cantEl.textContent   = fmtMx(vale.cantidad);
    }

    sel.addEventListener('change', () => {
        const id = sel.value;
        if (!id) { mostrarDatos(null); return; }
        const vale = valesCache.find(v => String(v.id) === String(id));
        mostrarDatos(vale);
    });

    cargarVales();
})();
