/* =====================================================================
   catalogo-destino.js  ·  SIGEPAV
   Maneja los combos en cascada Estado → Municipio → Localidad (solo Zac).
   Espejo:
     - <input id="lugar-destino">  ← texto "Localidad, Municipio, Estado"
                                     (lo que ven listados y bitácora)
     - <input id="dest-estado-nombre">     ← nombre del estado
     - <input id="dest-municipio-nombre">  ← nombre del municipio
     - <input id="dest-localidad-nombre">  ← nombre de la localidad
   Estos hidden los lee el código que envía la comisión al backend
   (estadoDst, municipio, localidad en /api/comisiones).
   ===================================================================== */
(function () {
    'use strict';

    const API_BASE = window.API_BASE || '';

    const selEst = document.getElementById('destino-estado');
    const selMun = document.getElementById('destino-municipio');
    const selLoc = document.getElementById('destino-localidad'); // puede no existir
    const hLugar = document.getElementById('lugar-destino');
    const hEst   = document.getElementById('dest-estado-nombre');
    const hMun   = document.getElementById('dest-municipio-nombre');
    const hLoc   = document.getElementById('dest-localidad-nombre');
    if (!selEst || !selMun) return;

    async function cargarEstados() {
        try {
            const resp = await fetch(`${API_BASE}/api/catalogo/estados`);
            const data = await resp.json();
            if (!data.ok) throw new Error(data.error || 'Respuesta inválida');
            selEst.innerHTML = '<option value="">Seleccione un estado</option>' +
                data.estados.map(e => `<option value="${e.id}" data-nombre="${e.nombre}">${e.nombre}</option>`).join('');
        } catch (err) {
            console.warn('[catalogo-destino] No se pudieron cargar estados:', err.message);
            selEst.innerHTML = '<option value="">— sin datos —</option>';
        }
    }

    async function cargarMunicipios(estadoId) {
        selMun.innerHTML = '<option value="">Cargando...</option>';
        selMun.disabled = true;
        if (selLoc) {
            selLoc.innerHTML = '<option value="">Primero elija un municipio</option>';
            selLoc.disabled = true;
        }
        try {
            const resp = await fetch(`${API_BASE}/api/catalogo/municipios?estado_id=${encodeURIComponent(estadoId)}`);
            const data = await resp.json();
            if (!data.ok) throw new Error(data.error || 'Respuesta inválida');
            selMun.innerHTML = '<option value="">Seleccione un municipio</option>' +
                data.municipios.map(m => `<option value="${m.id}" data-nombre="${m.nombre}">${m.nombre}</option>`).join('');
            selMun.disabled = false;
        } catch (err) {
            console.warn('[catalogo-destino] Municipios:', err.message);
            selMun.innerHTML = '<option value="">— sin datos —</option>';
            selMun.disabled = true;
        }
    }

    async function cargarLocalidades(municipioId) {
        if (!selLoc) return;
        selLoc.innerHTML = '<option value="">Cargando...</option>';
        selLoc.disabled = true;
        try {
            const resp = await fetch(`${API_BASE}/api/catalogo/localidades?municipio_id=${encodeURIComponent(municipioId)}`);
            const data = await resp.json();
            if (!data.ok) throw new Error(data.error || 'Respuesta inválida');
            if (!data.localidades.length) {
                selLoc.innerHTML = '<option value="">(Sin localidades registradas)</option>';
                selLoc.disabled = true;
                return;
            }
            // Las urbanas (◉) van primero (orden ya viene del backend).
            // Si el municipio tiene muchas localidades (>200) aún funciona, solo
            // que el combo será largo. Próxima mejora: autocomplete.
            selLoc.innerHTML = '<option value="">(Opcional) Seleccione una localidad</option>' +
                data.localidades.map(l =>
                    `<option value="${l.id}" data-nombre="${l.nombre}">${l.nombre}${l.ambito === 'U' ? ' ◉' : ''}</option>`
                ).join('');
            selLoc.disabled = false;
        } catch (err) {
            console.warn('[catalogo-destino] Localidades:', err.message);
            selLoc.innerHTML = '<option value="">— sin datos —</option>';
            selLoc.disabled = true;
        }
    }

    function actualizarHidden() {
        const optE = selEst.options[selEst.selectedIndex];
        const optM = selMun.options[selMun.selectedIndex];
        const optL = selLoc ? selLoc.options[selLoc.selectedIndex] : null;
        const nE = optE && optE.dataset.nombre ? optE.dataset.nombre : '';
        const nM = optM && optM.dataset.nombre ? optM.dataset.nombre : '';
        const nL = optL && optL.dataset.nombre ? optL.dataset.nombre : '';

        // Texto legible: "Localidad, Municipio, Estado" (omite vacíos)
        const partes = [nL, nM, nE].filter(Boolean);
        if (hLugar) {
            hLugar.value = partes.join(', ');
            hLugar.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (hEst)   hEst.value = nE;
        if (hMun)   hMun.value = nM;
        if (hLoc)   hLoc.value = nL;
    }

    selEst.addEventListener('change', () => {
        if (selEst.value) cargarMunicipios(selEst.value);
        else {
            selMun.innerHTML = '<option value="">Primero elija un estado</option>';
            selMun.disabled = true;
            if (selLoc) {
                selLoc.innerHTML = '<option value="">Primero elija un municipio</option>';
                selLoc.disabled = true;
            }
        }
        actualizarHidden();
    });
    selMun.addEventListener('change', () => {
        if (selLoc) {
            if (selMun.value) cargarLocalidades(selMun.value);
            else {
                selLoc.innerHTML = '<option value="">Primero elija un municipio</option>';
                selLoc.disabled = true;
            }
        }
        actualizarHidden();
    });
    if (selLoc) selLoc.addEventListener('change', actualizarHidden);

    cargarEstados();
})();
