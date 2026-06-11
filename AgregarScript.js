    document.addEventListener('DOMContentLoaded', () => {
        const sesionHeader = (window.SIGEPAV && window.SIGEPAV.getSession && window.SIGEPAV.getSession()) || {};
        const emailHeader = document.getElementById('user-email-display');
        if (emailHeader) emailHeader.textContent = sesionHeader.email || sesionHeader.usuario || sesionHeader.nombre || 'Usuario';

        const API_BASE = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : (window.location && window.location.origin ? window.location.origin : 'http://localhost:3000');

        // ========== ELEMENTOS ==========
        const inputUser    = document.getElementById('nuevo-usuario');
        const inputNombre  = document.getElementById('nombre-completo');
        const inputCorreo  = document.getElementById('correo-usuario');
        const inputPasswordInicial = document.getElementById('password-inicial');
        const btnTogglePasswordInicial = document.getElementById('toggle-password-inicial');
        const inputFoto    = document.getElementById('foto-perfil');
        const selectRol    = document.getElementById('rol-usuario');
        const inputDepto   = document.getElementById('departamento-usuario');
        const inputCargo   = document.getElementById('cargo-usuario');
        const btnGuardar   = document.getElementById('btn-guardar');
        const btnLimpiar   = document.getElementById('btn-limpiar');
        // FIX (req 6): botón "Volver" eliminado. Navegación por SIGEPAV (handler abajo).
        const contenedor   = document.getElementById('contenedor-usuarios');
        const alertaExito  = document.getElementById('alerta-exito');
        const alertaError  = document.getElementById('alerta-error');
        const modalEditar  = document.getElementById('modal-editar-usuario');
        const btnCerrarModalEditar = document.getElementById('btn-cerrar-modal-editar');
        const btnCancelarEdicion = document.getElementById('btn-cancelar-edicion');
        const btnGuardarEdicion = document.getElementById('btn-guardar-edicion');
        const inputEditarFoto = document.getElementById('editar-foto-perfil');
        let usuariosCache = [];

        // ========== UTILIDADES ==========
        function mostrarAlerta(tipo, mensaje) {
            const el = tipo === 'exito' ? alertaExito : alertaError;
            const otro = tipo === 'exito' ? alertaError : alertaExito;
            otro.classList.remove('show');
            el.innerHTML = (tipo === 'exito' ? '<i class="fas fa-check-circle"></i> ' : '<i class="fas fa-exclamation-circle"></i> ') + mensaje;
            el.classList.add('show');
            if (tipo === 'exito') {
                setTimeout(() => el.classList.remove('show'), 4000);
            }
        }

        function escHtml(valor) {
            return String(valor || '').replace(/[&<>"']/g, c =>
                ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])
            );
        }

        function urlFotoPerfil(foto) {
            foto = String(foto || '').trim();
            if (!foto) return 'Logo.jpeg';
            if (/^(https?:)?\/\//i.test(foto) || foto.startsWith('data:image/')) return foto;
            return foto.replace(/^\/+/, '');
        }

        function valorRol(u) {
            const rol = String((u && u.rol) || '').trim().toLowerCase();
            return Number(u && u.rol_id) === 1 || rol === 'administrador' || rol === 'admin' ? 'admin' : 'usuario';
        }

        function leerSesionActual() {
            if (window.__sigepav_leer_sesion) return window.__sigepav_leer_sesion() || {};
            return sesionHeader || {};
        }

        function sincronizarSesionSiEsActual(usuarioActualizado) {
            const sesion = leerSesionActual();
            if (!sesion || String(sesion.id) !== String(usuarioActualizado.id)) return;
            sesion.nombre = usuarioActualizado.nombre || '';
            sesion.apellidos = usuarioActualizado.apellidos || '';
            sesion.email = usuarioActualizado.email || '';
            sesion.rol = usuarioActualizado.rol || (Number(usuarioActualizado.rol_id) === 1 ? 'Administrador' : 'Usuario');
            sesion.rol_id = usuarioActualizado.rol_id;
            sesion.departamento = usuarioActualizado.departamento || '';
            sesion.cargo = usuarioActualizado.cargo || '';
            sesion.foto_perfil = usuarioActualizado.foto_perfil || '';
            if (window.__sigepav_guardar_sesion) window.__sigepav_guardar_sesion(sesion);
            if (window.__sigepav_render_cuenta) window.__sigepav_render_cuenta(sesion);
        }

        function abrirModalEditar(usuario) {
            if (!usuario || !modalEditar) return;
            document.getElementById('editar-usuario-id').value = usuario.id;
            document.getElementById('editar-nuevo-usuario').value = usuario.nombre || '';
            document.getElementById('editar-nombre-completo').value = usuario.apellidos || '';
            document.getElementById('editar-correo-usuario').value = usuario.email || '';
            document.getElementById('editar-rol-usuario').value = valorRol(usuario);
            document.getElementById('editar-departamento-usuario').value = usuario.departamento || '';
            document.getElementById('editar-cargo-usuario').value = usuario.cargo || '';
            document.getElementById('editar-foto-preview').src = urlFotoPerfil(usuario.foto_perfil);
            if (inputEditarFoto) inputEditarFoto.value = '';
            modalEditar.classList.add('show');
            modalEditar.setAttribute('aria-hidden', 'false');
            setTimeout(() => document.getElementById('editar-nuevo-usuario').focus(), 30);
        }

        function cerrarModalEditar() {
            if (!modalEditar) return;
            modalEditar.classList.remove('show');
            modalEditar.setAttribute('aria-hidden', 'true');
        }

        function limpiarFormulario() {
            inputUser.value = '';
            inputNombre.value = '';
            inputCorreo.value = '';
            if (inputPasswordInicial) inputPasswordInicial.value = '';
            if (inputFoto) inputFoto.value = '';
            selectRol.value = 'usuario';
            if (inputDepto) inputDepto.value = '';
            if (inputCargo) inputCargo.value = '';
            alertaError.classList.remove('show');
            inputUser.focus();
        }

        // ========== LISTA DE USUARIOS (desde BD) ==========
        async function renderizarLista() {
            contenedor.innerHTML = '<p style="text-align:center; padding:1rem; color:#6c86a3;"><i class="fas fa-spinner fa-spin"></i> Cargando usuarios...</p>';
            try {
                const resp = await fetch(`${API_BASE}/api/usuarios`);
                const data = await resp.json();
                if (!data.ok) throw new Error(data.error || 'Error al cargar usuarios');

                const todos = data.usuarios || [];
                usuariosCache = todos;
                contenedor.innerHTML = '';

                if (todos.length === 0) {
                    contenedor.innerHTML = '<p class="vacio">No hay usuarios registrados.</p>';
                    return;
                }

                todos.forEach(u => {
                    const item = document.createElement('div');
                    item.className = 'usuario-item';

                    const esSistema = (u.email === 'aldair@itszn.edu.mx' || u.email === 'diego@itszn.edu.mx');
                    const rolClase  = (u.rol === 'Administrador' || u.rol === 'admin') ? 'admin' : '';
                    const rolTexto  = (u.rol === 'Administrador' || u.rol === 'admin') ? 'Admin' : 'Usuario';
                    const nombreCompleto = [u.nombre, u.apellidos].filter(Boolean).join(' ');

                    item.innerHTML = `
                        <div class="usuario-info">
                            <span class="usuario-avatar-lista">
                                <img src="${escHtml(urlFotoPerfil(u.foto_perfil))}" alt="Foto de perfil" onerror="this.src='Logo.jpeg'">
                            </span>
                            <div>
                                <span class="usuario-nombre">${escHtml(u.email || '')}</span>
                                <span class="usuario-rol ${rolClase}">${rolTexto}</span>
                                ${nombreCompleto ? `<div style="font-size:0.75rem; color:#6c86a3; margin-top:0.1rem;">${escHtml(nombreCompleto)}</div>` : ''}
                            </div>
                        </div>
                        <div class="usuario-acciones">
                            <button class="btn-editar" data-id="${u.id}" type="button"><i class="fas fa-pen"></i> Editar</button>
                            ${esSistema
                                ? '<span class="usuario-lock"><i class="fas fa-lock"></i> No eliminable</span>'
                                : `<button class="btn-eliminar" data-id="${u.id}" data-nombre="${escHtml(u.email || u.nombre || '')}" type="button"><i class="fas fa-trash"></i> Eliminar</button>`
                            }
                        </div>
                    `;
                    contenedor.appendChild(item);
                });

                // Listeners de edición
                contenedor.querySelectorAll('.btn-editar').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const userId = btn.getAttribute('data-id');
                        const usuario = usuariosCache.find(x => String(x.id) === String(userId));
                        abrirModalEditar(usuario);
                    });
                });

                // Listeners de eliminacion
                contenedor.querySelectorAll('.btn-eliminar').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const userId = btn.getAttribute('data-id');
                        const nombre = btn.getAttribute('data-nombre');
                        if (!confirm(`\u00bfDesactivar al usuario "${nombre}"? Esta acci\u00f3n no se puede deshacer.`)) return;
                        try {
                            const r = await fetch(`${API_BASE}/api/usuarios/${userId}`, { method: 'DELETE' });
                            const d = await r.json();
                            if (!d.ok) throw new Error(d.error || 'Error al eliminar');
                            mostrarAlerta('exito', `Usuario "${nombre}" desactivado correctamente.`);
                            await renderizarLista();
                        } catch (err) {
                            mostrarAlerta('error', 'No se pudo eliminar: ' + err.message);
                        }
                    });
                });

            } catch (err) {
                contenedor.innerHTML = `<p class="vacio" style="color:#c0392b;"><i class="fas fa-exclamation-triangle"></i> Error al cargar usuarios: ${err.message}</p>`;
            }
        }

        // ========== MODAL DE EDICIÓN ==========
        if (btnCerrarModalEditar) btnCerrarModalEditar.addEventListener('click', cerrarModalEditar);
        if (btnCancelarEdicion) btnCancelarEdicion.addEventListener('click', cerrarModalEditar);
        if (modalEditar) {
            modalEditar.addEventListener('click', (e) => {
                if (e.target === modalEditar) cerrarModalEditar();
            });
        }
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modalEditar && modalEditar.classList.contains('show')) cerrarModalEditar();
        });
        if (inputEditarFoto) {
            inputEditarFoto.addEventListener('change', () => {
                const foto = inputEditarFoto.files && inputEditarFoto.files[0];
                if (!foto) return;
                if (!['image/jpeg', 'image/png', 'image/webp'].includes(foto.type)) {
                    mostrarAlerta('error', 'La foto debe ser JPG, PNG o WEBP.');
                    inputEditarFoto.value = '';
                    return;
                }
                if (foto.size > 3 * 1024 * 1024) {
                    mostrarAlerta('error', 'La foto no debe superar los 3 MB.');
                    inputEditarFoto.value = '';
                    return;
                }
                document.getElementById('editar-foto-preview').src = URL.createObjectURL(foto);
            });
        }
        if (btnGuardarEdicion) {
            btnGuardarEdicion.addEventListener('click', async () => {
                const id = document.getElementById('editar-usuario-id').value;
                const user = document.getElementById('editar-nuevo-usuario').value.trim();
                const nombre = document.getElementById('editar-nombre-completo').value.trim();
                const correo = document.getElementById('editar-correo-usuario').value.trim();
                const rol = document.getElementById('editar-rol-usuario').value;
                const depto = document.getElementById('editar-departamento-usuario').value.trim();
                const cargo = document.getElementById('editar-cargo-usuario').value.trim();
                const foto = inputEditarFoto && inputEditarFoto.files ? inputEditarFoto.files[0] : null;

                if (!id) return mostrarAlerta('error', 'No se encontró el usuario a editar.');
                if (!user || user.length < 3) return mostrarAlerta('error', 'El nombre de usuario debe tener al menos 3 caracteres.');
                if (!/^[a-zA-Z0-9._-]+$/.test(user)) return mostrarAlerta('error', 'El usuario solo puede contener letras, números, puntos, guiones o guion bajo.');
                if (!nombre) return mostrarAlerta('error', 'Indique el nombre completo del usuario.');
                if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return mostrarAlerta('error', 'Ingrese un correo electrónico válido.');

                btnGuardarEdicion.disabled = true;
                btnGuardarEdicion.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
                try {
                    const formData = new FormData();
                    formData.append('nombre', user);
                    formData.append('apellidos', nombre);
                    formData.append('email', correo);
                    formData.append('rol', rol);
                    formData.append('departamento', depto);
                    formData.append('cargo', cargo);
                    const sesion = leerSesionActual();
                    if (sesion && sesion.id) formData.append('admin_id', sesion.id);
                    if (foto) formData.append('foto_perfil', foto);

                    const resp = await fetch(`${API_BASE}/api/usuarios/${id}/admin`, {
                        method: 'PUT',
                        body: formData
                    });
                    const data = await resp.json();
                    if (!data.ok) throw new Error(data.error || 'Error al actualizar usuario');

                    sincronizarSesionSiEsActual(data.usuario || { id, nombre: user, apellidos: nombre, email: correo, rol_id: rol === 'admin' ? 1 : 2, departamento: depto, cargo });
                    cerrarModalEditar();
                    mostrarAlerta('exito', `Usuario "${correo}" actualizado correctamente.`);
                    await renderizarLista();
                } catch (err) {
                    mostrarAlerta('error', 'No se pudo actualizar el usuario: ' + err.message);
                } finally {
                    btnGuardarEdicion.disabled = false;
                    btnGuardarEdicion.innerHTML = '<i class="fas fa-save"></i> Guardar cambios';
                }
            });
        }

        // ========== GUARDAR (en BD via API) ==========
        btnGuardar.addEventListener('click', async () => {
            const user    = inputUser.value.trim();
            const nombre  = inputNombre.value.trim();
            const correo  = inputCorreo.value.trim();
            const passwordInicial = inputPasswordInicial ? inputPasswordInicial.value.trim() : '';
            const rol     = selectRol.value;
            const depto   = inputDepto ? inputDepto.value.trim() : '';
            const cargo   = inputCargo ? inputCargo.value.trim() : '';

            if (!user || user.length < 3) {
                return mostrarAlerta('error', 'El nombre de usuario debe tener al menos 3 caracteres.');
            }
            if (!/^[a-zA-Z0-9._-]+$/.test(user)) {
                return mostrarAlerta('error', 'El usuario solo puede contener letras, n\u00fameros, puntos, guiones o guion bajo.');
            }
            if (!nombre) {
                return mostrarAlerta('error', 'Indique el nombre completo del usuario.');
            }
            if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
                return mostrarAlerta('error', 'Ingrese un correo electr\u00f3nico v\u00e1lido.');
            }
            if (!passwordInicial || passwordInicial.length < 6) {
                return mostrarAlerta('error', 'La contraseña inicial debe tener al menos 6 caracteres.');
            }
            const foto = inputFoto && inputFoto.files ? inputFoto.files[0] : null;
            if (foto) {
                const tiposValidos = ['image/jpeg', 'image/png', 'image/webp'];
                if (!tiposValidos.includes(foto.type)) {
                    return mostrarAlerta('error', 'La foto debe ser JPG, PNG o WEBP.');
                }
                if (foto.size > 3 * 1024 * 1024) {
                    return mostrarAlerta('error', 'La foto no debe superar los 3 MB.');
                }
            }

            btnGuardar.disabled = true;
            btnGuardar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

            try {
                const formData = new FormData();
                formData.append('nombre', user);
                formData.append('apellidos', nombre);
                formData.append('email', correo);
                formData.append('password_inicial', passwordInicial);
                formData.append('rol', rol);
                if (depto) formData.append('departamento', depto);
                if (cargo) formData.append('cargo', cargo);
                if (foto) formData.append('foto_perfil', foto);

                const resp = await fetch(`${API_BASE}/api/usuarios`, {
                    method: 'POST',
                    body: formData
                });
                const data = await resp.json();
                if (!data.ok) throw new Error(data.error || 'Error al crear usuario');

                mostrarAlerta('exito', `Usuario "${user}" creado. En su primer ingreso deberá usar la contraseña inicial y después cambiarla.`);
                limpiarFormulario();
                await renderizarLista();
            } catch (err) {
                mostrarAlerta('error', 'No se pudo crear el usuario: ' + err.message);
            } finally {
                btnGuardar.disabled = false;
                btnGuardar.innerHTML = '<i class="fas fa-save"></i> Guardar usuario';
            }
        });

        // ========== MOSTRAR / OCULTAR CONTRASEÑA INICIAL ==========
        if (btnTogglePasswordInicial && inputPasswordInicial) {
            btnTogglePasswordInicial.addEventListener('click', () => {
                inputPasswordInicial.type = inputPasswordInicial.type === 'password' ? 'text' : 'password';
                const icon = btnTogglePasswordInicial.querySelector('i');
                if (icon) icon.className = inputPasswordInicial.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
            });
        }

        // ========== LIMPIAR ==========
        btnLimpiar.addEventListener('click', limpiarFormulario);

        // ========== VOLVER (FIX req 6: clic en SIGEPAV / logo) ==========
        // Delegación de eventos en document para máxima robustez.
        document.addEventListener('click', (e) => {
            const t = e.target.closest('.titulo-sistema, .titulo-sistema h1, .logo-barra');
            if (!t || !t.closest('.barra-superior')) return;
            window.location.href = 'menu.html';
        });
        document.querySelectorAll('.barra-superior .titulo-sistema, .barra-superior .titulo-sistema h1, .barra-superior .logo-barra').forEach(el => {
            el.style.cursor = 'pointer';
            el.title = 'Volver al menú principal';
        });

        // ========== ENTER PARA GUARDAR ==========
        [inputUser, inputNombre, inputCorreo, inputPasswordInicial].forEach(el => {
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') btnGuardar.click();
            });
        });

        // Render inicial
        renderizarLista();
    });
