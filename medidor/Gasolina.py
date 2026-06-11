from flask import Flask, request, jsonify, render_template_string
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Nivel de combustible actual (porcentaje). Se modifica desde la interfaz del medidor.
nivel_actual = {"percentage": 50}


def sin_cache(respuesta):
    respuesta.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    respuesta.headers["Pragma"] = "no-cache"
    respuesta.headers["Expires"] = "0"
    return respuesta


# ============================================================
#  PAGINA DEL MEDIDOR (se carga dentro de un iframe en Usuario.html)
# ============================================================
MEDIDOR_HTML = r"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Medidor de Combustible</title>
<style>
    :root {
        --color-degradado-inicio: #002b60;
        --color-degradado-fin: #006dc8;
        --color-blanco: #ffffff;
        --color-fondo: #f0f2f5;
        --color-texto: #2d3748;
        --color-texto-claro: #4a5568;
        --color-borde: #e2e8f0;
        --color-exito: #10b981;
        --color-advertencia: #f59e0b;
        --color-peligro: #dc2626;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    html, body {
        background-color: var(--color-blanco);
        font-family: 'Segoe UI', 'Inter', system-ui, -apple-system, sans-serif;
        color: var(--color-texto);
        -webkit-font-smoothing: antialiased;
        overflow-x: hidden;
    }

    .contenedor {
        padding: 1rem 1.5rem 1.2rem 1.5rem;
        max-width: 520px;
        margin: 0 auto;
    }

    .titulo-componente {
        text-align: center;
        margin-bottom: 0.8rem;
    }

    .titulo-componente h2 {
        color: var(--color-degradado-inicio);
        font-size: 1.2rem;
        font-weight: 700;
        margin-bottom: 0.2rem;
    }

    .titulo-componente p {
        color: var(--color-texto-claro);
        font-size: 0.85rem;
    }

    .tablero {
        position: relative;
        width: 100%;
        max-width: 460px;
        margin: 0 auto;
        background: linear-gradient(145deg, #f8fafc 0%, #e2e8f0 100%);
        border-radius: 50% 50% 16px 16px / 65% 65% 16px 16px;
        border: 2px solid var(--color-borde);
        box-shadow:
            inset 0 2px 8px rgba(0, 43, 96, 0.06),
            0 4px 12px rgba(0, 43, 96, 0.08);
        padding: 18px;
    }

    /* ── Botón para invertir orientación del medidor ── */
    .barra-orientacion {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 12px;
        margin: 0 auto 14px;
        max-width: 460px;
        padding: 8px 12px;
        background: #fff;
        border: 1px solid var(--color-borde);
        border-radius: 999px;
        font-size: 0.82rem;
    }
    .orientacion-label {
        color: var(--color-texto-claro);
        font-weight: 500;
    }
    .btn-orientacion {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 14px;
        border: 1px solid var(--color-degradado-fin);
        border-radius: 999px;
        background: linear-gradient(135deg, var(--color-degradado-inicio), var(--color-degradado-fin));
        color: #fff;
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
        transition: filter .15s, transform .15s;
        font-family: inherit;
    }
    .btn-orientacion:hover { filter: brightness(1.1); }
    .btn-orientacion:active { transform: scale(.97); }
    .orient-icon {
        display: inline-block;
        font-size: 1rem;
        transition: transform .35s ease;
    }
    /* Cuando el medidor está invertido, el icono gira */
    .medidor-invertido .orient-icon { transform: rotate(180deg); }

    /* === LA MAGIA: scaleX(-1) espeja todo el SVG con un click === */
    .medidor-invertido .medidor-svg { transform: scaleX(-1); }
    /* Pero las letras E/F quedarían en espejo: las re-volteamos individualmente */
    .medidor-invertido .etiqueta-flip { transform: scaleX(-1); transform-origin: center; transform-box: fill-box; }

    .medidor-svg {
        width: 100%;
        height: auto;
        display: block;
        cursor: grab;
        user-select: none;
        transition: transform .35s ease;
    }
    .medidor-svg:active { cursor: grabbing; }

    .arco-fondo {
        fill: none;
        stroke: #cbd5e0;
        stroke-width: 24;
        stroke-linecap: round;
    }

    .arco-color {
        fill: none;
        stroke-width: 22;
        stroke-linecap: round;
        opacity: 0.95;
    }

    .marca { stroke: #4a5568; stroke-width: 2; stroke-linecap: round; }
    .marca-mayor { stroke: #002b60; stroke-width: 3; }

    .etiqueta {
        fill: #2d3748;
        font-size: 18px;
        font-weight: 600;
        font-family: 'Segoe UI', sans-serif;
        text-anchor: middle;
    }

    .etiqueta-letra {
        fill: #002b60;
        font-size: 26px;
        font-weight: 700;
        font-family: Georgia, serif;
        text-anchor: middle;
    }

    .icono-pump { fill: #224870; }

    .manecilla {
        stroke: #002b60;
        stroke-width: 5;
        stroke-linecap: round;
        filter: drop-shadow(0 2px 3px rgba(0, 43, 96, 0.4));
        transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
        transform-origin: 240px 240px;
    }

    .centro-exterior { fill: #ffffff; stroke: #002b60; stroke-width: 2.5; }
    .centro-interior { fill: #006dc8; }

    .lectura-digital {
        fill: #002b60;
        font-size: 32px;
        font-weight: 700;
        font-family: 'Segoe UI', sans-serif;
        text-anchor: middle;
    }

    .lectura-unidad {
        fill: #4a5568;
        font-size: 11px;
        font-weight: 600;
        font-family: 'Segoe UI', sans-serif;
        text-anchor: middle;
        letter-spacing: 2px;
    }

    .controles {
        margin-top: 1rem;
        background: var(--color-fondo);
        border: 1px solid var(--color-borde);
        border-radius: 10px;
        padding: 0.9rem 1.1rem;
    }

    .slider-label {
        display: flex;
        justify-content: space-between;
        font-size: 0.75rem;
        color: var(--color-texto-claro);
        margin-bottom: 0.5rem;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        font-weight: 600;
    }

    .slider-valor {
        color: var(--color-degradado-inicio);
        font-weight: 700;
        font-size: 0.9rem;
    }

    input[type=range] {
        width: 100%;
        height: 8px;
        border-radius: 4px;
        background: linear-gradient(to right, #dc2626 0%, #f59e0b 50%, #10b981 100%);
        outline: none;
        -webkit-appearance: none;
        cursor: pointer;
    }

    input[type=range]::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 22px;
        height: 22px;
        background: #ffffff;
        border: 3px solid #006dc8;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 2px 6px rgba(0, 43, 96, 0.3);
    }

    input[type=range]::-moz-range-thumb {
        width: 22px;
        height: 22px;
        background: #ffffff;
        border: 3px solid #006dc8;
        border-radius: 50%;
        cursor: pointer;
    }

    .estado {
        margin-top: 0.8rem;
        padding: 0.7rem;
        border-radius: 8px;
        text-align: center;
        font-size: 0.85rem;
        font-weight: 600;
    }

    .estado.bajo {
        background: #fee2e2;
        border: 1px solid #fecaca;
        color: var(--color-peligro);
    }

    .estado.medio {
        background: #fef3c7;
        border: 1px solid #fde68a;
        color: #92400e;
    }

    .estado.alto {
        background: #d1fae5;
        border: 1px solid #a7f3d0;
        color: #065f46;
    }

    .botones-medidor {
        display: flex;
        gap: 0.8rem;
        margin-top: 1rem;
        justify-content: flex-end;
    }

    .btn-medidor {
        padding: 0.7rem 1.4rem;
        border: none;
        border-radius: 8px;
        font-size: 0.9rem;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
        transition: 0.2s;
    }

    .btn-cancelar {
        background: var(--color-fondo);
        color: var(--color-texto-claro);
        border: 1px solid var(--color-borde);
    }

    .btn-cancelar:hover {
        background: var(--color-borde);
    }

    .btn-confirmar {
        background: linear-gradient(135deg, #002b60 0%, #006dc8 100%);
        color: var(--color-blanco);
        box-shadow: 0 2px 8px rgba(0, 43, 96, 0.25);
    }

    .btn-confirmar:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 43, 96, 0.35);
    }
</style>
</head>
<body>

<div class="contenedor">
    <div class="titulo-componente">
        <h2>Selecciona el nivel de combustible</h2>
        <p>Mueve la manecilla o ajusta con el deslizador</p>
    </div>

    <div class="barra-orientacion">
        <span class="orientacion-label">¿Cómo es el tablero de tu carro?</span>
        <button type="button" id="btn-orientacion" class="btn-orientacion" title="Cambiar orientación del medidor">
            <span class="orient-icon" id="orient-icon">↻</span>
            <span id="orient-texto">E ← → F (estándar)</span>
        </button>
    </div>

    <div class="tablero">
        <svg class="medidor-svg" viewBox="0 0 480 320" id="medidor">

            <path class="arco-fondo" d="M 60 240 A 180 180 0 0 1 420 240" />

            <path class="arco-color" d="M 60 240 A 180 180 0 0 1 420 240"
                  stroke="url(#gradiente)" />

            <defs>
                <linearGradient id="gradiente" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%"   stop-color="#dc2626"/>
                    <stop offset="50%"  stop-color="#f59e0b"/>
                    <stop offset="100%" stop-color="#10b981"/>
                </linearGradient>
            </defs>

            <g id="marcas"></g>

            <text class="etiqueta-letra etiqueta-flip" x="60"  y="278">E</text>
            <text class="etiqueta-letra etiqueta-flip" x="420" y="278">F</text>

            <g transform="translate(228, 175)" class="etiqueta-flip">
                <path class="icono-pump" d="M 4 0 L 4 22 L 18 22 L 18 0 Z M 6 2 L 16 2 L 16 10 L 6 10 Z M 18 8 L 22 8 L 22 18 L 20 18 L 20 22 L 18 22 Z" opacity="0.5"/>
            </g>

            <line class="manecilla" id="manecilla"
                  x1="240" y1="240" x2="240" y2="80" />

            <circle class="centro-exterior" cx="240" cy="240" r="14"/>
            <circle class="centro-interior" cx="240" cy="240" r="6"/>

            <text class="lectura-digital etiqueta-flip" id="lectura" x="240" y="295">50%</text>
            <text class="lectura-unidad etiqueta-flip" x="240" y="313">NIVEL DE TANQUE</text>

        </svg>
    </div>

    <div class="controles">
        <div class="slider-label">
            <span>Ajustar nivel</span>
            <span class="slider-valor" id="slider-valor">50%</span>
        </div>
        <input type="range" id="slider" min="1" max="100" value="50">
        <div class="estado medio" id="estado">Nivel medio del tanque</div>
    </div>

    <div class="botones-medidor">
        <button type="button" class="btn-medidor btn-cancelar" id="btn-cancelar-medidor">Cancelar</button>
        <button type="button" class="btn-medidor btn-confirmar" id="btn-confirmar-medidor">Confirmar nivel</button>
    </div>
</div>

<script>
    var manecilla    = document.getElementById('manecilla');
    var lectura      = document.getElementById('lectura');
    var slider       = document.getElementById('slider');
    var sliderValor  = document.getElementById('slider-valor');
    var estado       = document.getElementById('estado');
    var svg          = document.getElementById('medidor');
    var grupoMarcas  = document.getElementById('marcas');
    var btnConfirmar = document.getElementById('btn-confirmar-medidor');
    var btnCancelar  = document.getElementById('btn-cancelar-medidor');
    var btnOrient    = document.getElementById('btn-orientacion');
    var orientTexto  = document.getElementById('orient-texto');

    var CX = 240, CY = 240, RADIO = 180;
    var porcentajeActual = 50;

    // ── Orientación del tablero (persistida en localStorage) ─────────────
    // 'normal'    → E a la izquierda, F a la derecha (estándar internacional)
    // 'invertido' → F a la izquierda, E a la derecha (algunos autos)
    var orientacion = 'normal';
    try {
        var guardada = localStorage.getItem('sigepav_medidor_orientacion');
        if (guardada === 'invertido' || guardada === 'normal') orientacion = guardada;
    } catch (e) { /* localStorage bloqueado, ignora */ }

    function aplicarOrientacion() {
        if (orientacion === 'invertido') {
            document.body.classList.add('medidor-invertido');
            orientTexto.textContent = 'F ← → E (invertido)';
        } else {
            document.body.classList.remove('medidor-invertido');
            orientTexto.textContent = 'E ← → F (estándar)';
        }
    }
    aplicarOrientacion();

    btnOrient.addEventListener('click', function () {
        orientacion = (orientacion === 'normal') ? 'invertido' : 'normal';
        try { localStorage.setItem('sigepav_medidor_orientacion', orientacion); } catch (e) {}
        aplicarOrientacion();
    });

    for (var i = 0; i <= 10; i++) {
        var porcentaje = i * 10;
        var angulo = (-180 + (porcentaje / 100) * 180) * Math.PI / 180;
        var esMayor = i % 5 === 0;
        var r1 = RADIO - 5;
        var r2 = esMayor ? RADIO - 28 : RADIO - 16;

        var x1 = CX + r1 * Math.cos(angulo);
        var y1 = CY + r1 * Math.sin(angulo);
        var x2 = CX + r2 * Math.cos(angulo);
        var y2 = CY + r2 * Math.sin(angulo);

        var linea = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        linea.setAttribute('x1', x1);
        linea.setAttribute('y1', y1);
        linea.setAttribute('x2', x2);
        linea.setAttribute('y2', y2);
        linea.setAttribute('class', esMayor ? 'marca marca-mayor' : 'marca');
        grupoMarcas.appendChild(linea);

        if (esMayor && i === 5) {
            var rTexto = RADIO - 46;
            var xt = CX + rTexto * Math.cos(angulo);
            var yt = CY + rTexto * Math.sin(angulo) + 6;
            var texto = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            texto.setAttribute('class', 'etiqueta');
            texto.setAttribute('x', xt);
            texto.setAttribute('y', yt);
            texto.textContent = '1/2';
            grupoMarcas.appendChild(texto);
        }
    }

    function actualizar(porcentaje) {
        porcentaje = Math.max(1, Math.min(100, Math.round(porcentaje)));
        porcentajeActual = porcentaje;

        // Aguja estándar: 0% → -90° (izquierda/E), 100% → +90° (derecha/F)
        // Si la orientación está "invertida", scaleX(-1) en el SVG espeja todo.
        var angulo = -90 + (porcentaje / 100) * 180;
        manecilla.style.transform = 'rotate(' + angulo + 'deg)';

        lectura.textContent = porcentaje + '%';
        sliderValor.textContent = porcentaje + '%';
        slider.value = porcentaje;

        estado.classList.remove('bajo', 'medio', 'alto');
        if (porcentaje < 25) {
            estado.classList.add('bajo');
            estado.textContent = 'Nivel bajo - Recargar pronto';
        } else if (porcentaje < 70) {
            estado.classList.add('medio');
            estado.textContent = 'Nivel medio del tanque';
        } else {
            estado.classList.add('alto');
            estado.textContent = 'Tanque con buen nivel';
        }
    }

    slider.addEventListener('input', function(e) {
        actualizar(parseInt(e.target.value));
    });

    var arrastrando = false;

    function obtenerPorcentajeDesdeEvento(e) {
        var rect = svg.getBoundingClientRect();
        var escalaX = 480 / rect.width;
        var escalaY = 320 / rect.height;
        var clientX = e.touches ? e.touches[0].clientX : e.clientX;
        var clientY = e.touches ? e.touches[0].clientY : e.clientY;
        var x = (clientX - rect.left) * escalaX - CX;
        var y = (clientY - rect.top)  * escalaY - CY;

        if (y > 10) return null;

        // En modo invertido el SVG tiene scaleX(-1): la coordenada visual
        // del click es x, pero en el espacio LÓGICO del SVG es -x.
        var xLogico = (orientacion === 'invertido') ? -x : x;

        // Trabajamos en el espacio lógico (donde E=izq, F=der siempre):
        //   atan2(y<0, xLogico) ∈ [-π, 0]
        //   -π   → izquierda (E) → 0%
        //   -π/2 → arriba       → 50%
        //   0    → derecha (F)  → 100%
        var ang = Math.atan2(y, xLogico);              // negativo (estamos arriba)
        if (ang > 0) ang = -Math.PI;                   // toca el borde inferior izq
        var porcentaje = ((ang + Math.PI) / Math.PI) * 100;
        return Math.max(1, Math.min(100, porcentaje));
    }

    svg.addEventListener('mousedown', function(e) {
        arrastrando = true;
        var p = obtenerPorcentajeDesdeEvento(e);
        if (p !== null) actualizar(p);
    });

    document.addEventListener('mousemove', function(e) {
        if (!arrastrando) return;
        var p = obtenerPorcentajeDesdeEvento(e);
        if (p !== null) actualizar(p);
    });

    document.addEventListener('mouseup', function() { arrastrando = false; });

    svg.addEventListener('touchstart', function(e) {
        arrastrando = true;
        var p = obtenerPorcentajeDesdeEvento(e);
        if (p !== null) actualizar(p);
        e.preventDefault();
    });
    document.addEventListener('touchmove', function(e) {
        if (!arrastrando) return;
        var p = obtenerPorcentajeDesdeEvento(e);
        if (p !== null) actualizar(p);
    });
    document.addEventListener('touchend', function() { arrastrando = false; });

    // Boton de confirmar: envia el porcentaje al iframe padre
    btnConfirmar.addEventListener('click', function() {
        // Guardar tambien en el servidor (por si lo consulta algun otro cliente)
        fetch('/set_fuel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
            body: JSON.stringify({ percentage: porcentajeActual })
        }).catch(function(err) { console.error('Error guardando:', err); });

        // Notificar al padre (Usuario.html)
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({
                tipo: 'medidor-confirmar',
                percentage: porcentajeActual
            }, '*');
        }
    });

    // Boton de cancelar
    btnCancelar.addEventListener('click', function() {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ tipo: 'medidor-cancelar' }, '*');
        }
    });

    // Cargar nivel inicial desde el servidor
    fetch('/fuel?t=' + Date.now(), { headers: { 'ngrok-skip-browser-warning': 'true' } })
        .then(function(r) { return r.json(); })
        .then(function(d) { actualizar(d.percentage); })
        .catch(function() { actualizar(50); });
</script>

</body>
</html>
"""


# ============================================================
#  RUTAS DEL SERVIDOR
# ============================================================

@app.route('/')
def medidor():
    return render_template_string(MEDIDOR_HTML)


@app.route('/fuel', methods=['GET'])
def get_fuel():
    respuesta = jsonify({
        "percentage": nivel_actual["percentage"],
        "unit": "percent"
    })
    return sin_cache(respuesta)


@app.route('/set_fuel', methods=['POST'])
def set_fuel():
    data = request.get_json(silent=True) or {}
    porcentaje = data.get("percentage")

    if porcentaje is None:
        return sin_cache(jsonify({"error": "Falta el campo 'percentage'"})), 400

    try:
        porcentaje = int(porcentaje)
    except (TypeError, ValueError):
        return sin_cache(jsonify({"error": "'percentage' debe ser un numero"})), 400

    if porcentaje < 1 or porcentaje > 100:
        return sin_cache(jsonify({"error": "El porcentaje debe estar entre 1 y 100"})), 400

    nivel_actual["percentage"] = porcentaje
    print("[Medidor] Nivel actualizado a: " + str(porcentaje) + "%")
    return sin_cache(jsonify({"ok": True, "percentage": porcentaje}))


if __name__ == '__main__':
    print("=" * 55)
    print("  Servidor de Medidor de Combustible iniciado")
    print("=" * 55)
    print("  -> Servidor activo en: http://0.0.0.0:5000")
    print("  -> Abre Usuario.html y presiona 'Verificar")
    print("     nivel de combustible' para usar el medidor")
    print("=" * 55)
    app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False)