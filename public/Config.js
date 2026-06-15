// =================================================================
//  Config.js — Configuración del sistema
// =================================================================
//  IMPORTANTE: este archivo contiene credenciales sensibles.
//  No lo subas a repositorios públicos (agrégalo a .gitignore).
// =================================================================

// API key de Google AI Studio (Gemini)
// El backend también la lee desde este archivo para /api/ia/recomendacion.
// No lo subas a repositorios públicos.
const GEMINI_API_KEY = "";

// Lista de modelos de Gemini en orden de preferencia (mejor a peor)
// El sistema probará uno por uno hasta que alguno responda exitosamente.
// Listado completo de modelos compatibles con generateContent (texto).
const MODELOS_GEMINI = [
    // ===== Gemini 3.x (la generación más reciente) =====
    "gemini-3.1-pro-preview",
    "gemini-3.1-pro-preview-customtools",
    "gemini-3-pro-preview",
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite-preview",

    // ===== Gemini 2.5 (estables, producción) =====
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash-preview-09-2025",
    "gemini-2.5-flash-lite-preview-09-2025",

    // ===== Gemini 1.5 (legacy, alta disponibilidad) =====
    "gemini-1.5-pro",
    "gemini-1.5-pro-latest",
    "gemini-1.5-pro-002",
    "gemini-1.5-pro-001",
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash-002",
    "gemini-1.5-flash-001",
    "gemini-1.5-flash-8b",
    "gemini-1.5-flash-8b-latest",
    "gemini-1.5-flash-8b-001",

    // ===== Gemini 1.0 (muy legacy, último recurso) =====
    "gemini-pro",
    "gemini-1.0-pro",
    "gemini-1.0-pro-latest",
    "gemini-1.0-pro-001",
    "gemini-1.0-pro-vision-latest",
    "gemini-pro-vision",

    // ===== Modelos abiertos Gemma (último recurso) =====
    "gemma-3-27b-it",
    "gemma-3-12b-it",
    "gemma-3-4b-it",
    "gemma-3-1b-it",
    "gemma-3n-e4b-it",
    "gemma-3n-e2b-it",
    "gemma-2-27b-it",
    "gemma-2-9b-it",
    "gemma-2-2b-it"
];

// =================================================================
//  API_BASE — Detección automática del host
// =================================================================
//  Resuelve la URL base del API a partir de la ubicación actual.
//  - Si abres por http://localhost:3000        → API_BASE = http://localhost:3000
//  - Si abres por https://xxxx.ngrok-free.dev  → API_BASE = https://xxxx.ngrok-free.dev
//  - Si abres por file:// (raro)               → API_BASE = http://localhost:3000 (fallback)
//
//  Para forzar manualmente, define window.__API_BASE_OVERRIDE antes de
//  cargar este script, o asígnalo en localStorage:
//      localStorage.setItem('sigepav_api_base', 'https://mi-host.com');
// =================================================================
(function () {
    function resolverApiBase() {
        // 1) Override manual por localStorage (útil para depurar)
        try {
            const override = localStorage.getItem('sigepav_api_base');
            if (override && /^https?:\/\//i.test(override)) return override.replace(/\/+$/, '');
        } catch (e) { /* localStorage bloqueado, ignora */ }

        // 2) Override por variable global (si el HTML lo define antes)
        if (typeof window.__API_BASE_OVERRIDE === 'string' && window.__API_BASE_OVERRIDE) {
            return window.__API_BASE_OVERRIDE.replace(/\/+$/, '');
        }

        // 3) Si la página se sirve por http(s), usa el mismo origen
        if (typeof window !== 'undefined' && window.location && /^https?:$/i.test(window.location.protocol)) {
            return window.location.origin;
        }

        // 4) Fallback: localhost en el puerto del backend
        return 'http://localhost:3000';
    }

    window.API_BASE = resolverApiBase();
    // Alias por compatibilidad con código viejo
    window.SIGEPAV_API = window.API_BASE;
    console.info('[SIGEPAV] API_BASE =', window.API_BASE);
})();

// =================================================================
//  FUEL_BASE — URL del medidor Flask Gasolina.py
// =================================================================
//  Para que funcione en celular/tablet con ngrok, el navegador ya NO
//  llama directo al puerto 5000. Todo pasa por el mismo origen público
//  de Node:
//      https://oda-peachier-terrie.ngrok-free.dev/gasolina/
//  Server.js hace proxy interno hacia http://127.0.0.1:5000.
// =================================================================
(function () {
    function resolverFuelBase() {
        try {
            const override = localStorage.getItem('sigepav_fuel_base');
            if (override && /^https?:\/\//i.test(override)) return override.replace(/\/+$/, '');
        } catch (e) {}

        if (typeof window !== 'undefined' && window.API_BASE) {
            return window.API_BASE.replace(/\/+$/, '') + '/gasolina';
        }

        if (typeof window !== 'undefined' && window.location && /^https?:$/i.test(window.location.protocol)) {
            return window.location.origin.replace(/\/+$/, '') + '/gasolina';
        }

        return 'http://localhost:3000/gasolina';
    }
    window.FUEL_BASE = resolverFuelBase();
    console.info('[SIGEPAV] FUEL_BASE =', window.FUEL_BASE);
})();


// =================================================================
//  NGROK BYPASS — Evita la página de advertencia "You are about to visit"
// =================================================================
//  Cuando el front se sirve por un túnel ngrok-free.dev, ngrok intercala
//  una página HTML de advertencia que rompe los fetch JSON y SSE.
//  Solución: inyectar el header "ngrok-skip-browser-warning" en todos los
//  fetch() de la app, y para SSE/imágenes agregamos query param equivalente.
// =================================================================
(function () {
    const esNgrok = /ngrok(-free)?\.(dev|app|io)/i.test(window.API_BASE || '') ||
                    /ngrok(-free)?\.(dev|app|io)/i.test(window.location.host || '');

    if (!esNgrok) return;  // Solo aplica si realmente vamos por ngrok

    console.info('[SIGEPAV] Túnel ngrok detectado — aplicando bypass de advertencia');

    // 1) Parche global de fetch: añade el header en cada request
    const fetchOriginal = window.fetch.bind(window);
    window.fetch = function (input, init) {
        init = init || {};
        const headers = new Headers(init.headers || {});
        if (!headers.has('ngrok-skip-browser-warning')) {
            headers.set('ngrok-skip-browser-warning', 'true');
        }
        init.headers = headers;
        return fetchOriginal(input, init);
    };

    // 2) Marca <html> con un flag para que CSS/JS puedan reaccionar si quieren
    document.documentElement.setAttribute('data-tunnel', 'ngrok');
})();


// =================================================================
//  Helper para construir URLs con bypass de ngrok (img src, EventSource)
// =================================================================
window.sigepavUrl = function (url) {
    if (!url) return url;
    if (!document.documentElement.hasAttribute('data-tunnel')) return url;
    // Solo si vamos por ngrok añadimos el query param
    const sep = url.includes('?') ? '&' : '?';
    if (url.includes('ngrok-skip-browser-warning')) return url;
    return url + sep + 'ngrok-skip-browser-warning=true';
};
