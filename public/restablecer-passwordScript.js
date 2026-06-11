/* ════════════════════════════════════════════════════════════════════
   restablecer-password.js
   Lógica de la página a la que llega el usuario desde el enlace del
   correo de recuperación.

   Flujo:
     1. Al cargar, extrae el token de ?token=... y llama a
        /api/validar-token-recuperacion.
     2. Si el token es válido → muestra el formulario para capturar la
        nueva contraseña con indicador de fortaleza y checklist.
     3. Al guardar → POST /api/restablecer-password.
     4. Si todo OK → muestra pantalla de éxito.
   ════════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
    const API_BASE = (typeof window !== 'undefined' && window.API_BASE)
        ? window.API_BASE
        : window.location.origin;

    // ── Estados visuales ───────────────────────────────────────────
    const elLoading = document.getElementById('reset-loading');
    const elInvalid = document.getElementById('reset-invalid');
    const elForm    = document.getElementById('reset-form');
    const elSuccess = document.getElementById('reset-success');

    function mostrarEstado(estado) {
        [elLoading, elInvalid, elForm, elSuccess].forEach(el => {
            if (el) el.style.display = 'none';
        });
        if (estado) estado.style.display = (estado === elForm) ? 'flex' : 'block';
    }

    // ── Toast ──────────────────────────────────────────────────────
    function mostrarToast(mensaje, tipo) {
        const toast = document.getElementById('login-toast');
        if (!toast) return;
        toast.textContent = mensaje;
        toast.className = 'login-toast login-toast-' + (tipo || 'info') + ' show';
        clearTimeout(window.__reset_toast_timer);
        window.__reset_toast_timer = setTimeout(() => {
            toast.classList.remove('show');
        }, 4500);
    }

    // ── Extraer token de la URL ────────────────────────────────────
    const params = new URLSearchParams(window.location.search);
    const token  = (params.get('token') || '').trim();

    if (!token) {
        document.getElementById('reset-invalid-msg').textContent =
            'El enlace está incompleto. Solicita uno nuevo desde el login.';
        mostrarEstado(elInvalid);
        return;
    }

    // ── Validar token al cargar ────────────────────────────────────
    (async () => {
        try {
            const resp = await fetch(
                `${API_BASE}/api/validar-token-recuperacion?token=${encodeURIComponent(token)}`
            );
            const data = await resp.json().catch(() => ({}));

            if (!resp.ok || !data.ok) {
                document.getElementById('reset-invalid-msg').textContent =
                    data.error || 'Este enlace ya no es válido.';
                mostrarEstado(elInvalid);
                return;
            }

            // Token válido — pintar nombre y correo y mostrar form
            const nombre = data.usuario?.nombre || 'usuario';
            const correo = data.usuario?.email_oculto || '';
            const spanNombre = document.getElementById('reset-nombre');
            const spanCorreo = document.getElementById('reset-correo');
            if (spanNombre) spanNombre.textContent = nombre;
            if (spanCorreo) spanCorreo.textContent = correo;
            mostrarEstado(elForm);
            setTimeout(() => document.getElementById('reset-password')?.focus(), 100);
        } catch (err) {
            console.error('Error validando token:', err);
            document.getElementById('reset-invalid-msg').textContent =
                'No se pudo validar el enlace. Verifica tu conexión.';
            mostrarEstado(elInvalid);
        }
    })();

    // ── Indicador de fortaleza y checklist ─────────────────────────
    const inputPass    = document.getElementById('reset-password');
    const inputConfirm = document.getElementById('reset-confirm');
    const fillBar      = document.getElementById('strength-fill');
    const labelBar     = document.getElementById('strength-label');
    const btnSubmit    = document.getElementById('reset-submit-btn');
    const reqs         = {
        length: document.querySelector('[data-req="length"]'),
        letter: document.querySelector('[data-req="letter"]'),
        number: document.querySelector('[data-req="number"]'),
        match:  document.querySelector('[data-req="match"]')
    };

    function evaluarPassword() {
        const p = inputPass.value;
        const c = inputConfirm.value;

        const cumpleLength = p.length >= 8;
        const cumpleLetter = /[A-Za-z]/.test(p);
        const cumpleNumber = /\d/.test(p);
        const cumpleMatch  = p.length > 0 && p === c;

        // Pintar checklist
        marcarReq(reqs.length, cumpleLength);
        marcarReq(reqs.letter, cumpleLetter);
        marcarReq(reqs.number, cumpleNumber);
        marcarReq(reqs.match,  cumpleMatch);

        // Calcular fortaleza (0-4)
        let score = 0;
        if (p.length >= 8)  score++;
        if (p.length >= 12) score++;
        if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
        if (/\d/.test(p))   score++;
        if (/[^A-Za-z0-9]/.test(p)) score++;
        score = Math.min(score, 4);

        const niveles = [
            { width: '0%',   color: '#e2e8f0', label: 'Mínimo 8 caracteres' },
            { width: '25%',  color: '#ef4444', label: 'Muy débil' },
            { width: '50%',  color: '#f59e0b', label: 'Débil' },
            { width: '75%',  color: '#3b82f6', label: 'Buena' },
            { width: '100%', color: '#10b981', label: 'Excelente' }
        ];
        const nivel = p.length === 0 ? niveles[0] : niveles[score] || niveles[1];
        if (fillBar) {
            fillBar.style.width = nivel.width;
            fillBar.style.background = nivel.color;
        }
        if (labelBar) {
            labelBar.textContent = nivel.label;
            labelBar.style.color = nivel.color;
        }

        // Habilitar / deshabilitar botón
        const todoOk = cumpleLength && cumpleLetter && cumpleNumber && cumpleMatch;
        if (btnSubmit) btnSubmit.disabled = !todoOk;
    }

    function marcarReq(li, cumple) {
        if (!li) return;
        const icon = li.querySelector('i');
        if (cumple) {
            li.classList.add('ok');
            if (icon) icon.className = 'fas fa-circle-check';
        } else {
            li.classList.remove('ok');
            if (icon) icon.className = 'fas fa-circle';
        }
    }

    if (inputPass)    inputPass.addEventListener('input', evaluarPassword);
    if (inputConfirm) inputConfirm.addEventListener('input', evaluarPassword);

    // ── Toggle mostrar / ocultar contraseña ────────────────────────
    const togglePass = document.getElementById('toggle-password');
    if (togglePass) {
        togglePass.addEventListener('click', () => {
            const tipoActual = inputPass.type;
            inputPass.type    = tipoActual === 'password' ? 'text' : 'password';
            inputConfirm.type = inputPass.type;
            const icon = togglePass.querySelector('i');
            if (icon) icon.className = inputPass.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
        });
    }

    // ── Submit ─────────────────────────────────────────────────────
    if (elForm) {
        elForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const p = inputPass.value;
            const c = inputConfirm.value;

            if (p.length < 8) {
                mostrarToast('La contraseña debe tener al menos 8 caracteres.', 'error');
                return;
            }
            if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) {
                mostrarToast('La contraseña debe combinar letras y al menos un número.', 'error');
                return;
            }
            if (p !== c) {
                mostrarToast('Las contraseñas no coinciden.', 'error');
                return;
            }

            const textoOriginal = btnSubmit.innerHTML;
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

            try {
                const resp = await fetch(`${API_BASE}/api/restablecer-password`, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ token, nuevaPassword: p, confirmar: c })
                });
                const data = await resp.json().catch(() => ({}));

                if (!resp.ok || !data.ok) {
                    // Si el token expiró o ya se usó, mostramos pantalla de error
                    if (resp.status === 410 || resp.status === 404) {
                        document.getElementById('reset-invalid-msg').textContent =
                            data.error || 'El enlace ya no es válido.';
                        mostrarEstado(elInvalid);
                    } else {
                        mostrarToast(data.error || 'No se pudo guardar la contraseña.', 'error');
                    }
                    return;
                }

                // Éxito → mostrar pantalla de confirmación
                mostrarEstado(elSuccess);
            } catch (err) {
                console.error('Error restableciendo contraseña:', err);
                mostrarToast('No se pudo conectar con el servidor.', 'error');
            } finally {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = textoOriginal;
                evaluarPassword(); // re-aplica estado del botón
            }
        });
    }
});
