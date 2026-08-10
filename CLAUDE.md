# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> El código, los comentarios y la UI están **en español**. Mantén ese idioma al escribir código,
> comentarios, mensajes de error y textos de interfaz.

## Qué es

**SIGEPAV** — Sistema de Gestión del Parque Vehicular (proyecto para INNOVATEC 2026).
Administra vehículos, comisiones/viajes, vales de gasolina, mantenimientos, expedientes,
reportes, un módulo ciudadano con seguimiento por QR y un medidor de combustible.

Tres piezas:
- **Backend:** Node.js + Express en `Server.js` (puerto 3000) contra **MySQL**.
- **Frontend:** HTML/CSS/JS estáticos servidos desde `public/`. Sin build, sin framework, sin bundler.
- **Medidor:** servicio aparte en Python/Flask (`medidor/Gasolina.py`, puerto 5000, **opcional**).

## Comandos

```bash
npm start                      # arranca el backend en http://localhost:3000 (= node Server.js)
```

- **Backend + medidor Python:** `scripts/iniciar-todo.bat`
- **Solo el medidor:** `scripts/iniciar-medidor.bat`
- **Detener:** `scripts/detener-sigepav.ps1`
- **Montar la BD desde cero:** `scripts/configurar-base-de-datos.bat` (pide la contraseña de
  root y ejecuta `database/sigepav_BDD.sql` + crea el usuario `sigepav_user`).
  Ese .bat asume MySQL 8.4 en `C:\Program Files\MySQL\MySQL Server 8.4\bin\`; si `mysql.exe`
  está en otro lado hay que ajustar la ruta dentro del archivo.
- **Exponer a internet (ngrok):** `scripts/iniciar-sigepav-ngrok.ps1`, y después
  `scripts/actualizar-baseurl-ngrok.ps1` para cambiar `BASE_URL` y **regenerar los QR**.

**No hay tests, linter ni build.** La verificación es manual: arrancar y abrir el navegador.

## Arquitectura — lo que hay que entender antes de tocar

### 1. `Server.js` es un monolito de ~6,400 líneas

Todo vive ahí: pool de MySQL, middlewares, ~85 endpoints, lógica de negocio, correos,
generación de QR, respaldos y el módulo de IA. **No hay `routes/`, `controllers/` ni `db.js`.**

Los endpoints se agrupan por prefijo `/api/...`: `usuarios`, `vehiculos`, `vales`, `comisiones`,
`viajes`, `mantenimiento-programado`, `reportes-ciudadanos`, `solicitudes-finalizacion`,
`respaldos`, `ia`, `notificaciones`, `catalogo`, `dashboard`, `costos`, `bitacora`,
`configuracion`, `vencimientos`, `public` (módulo ciudadano sin sesión).

Partir el monolito en módulos es una idea reconocida pero **de alto riesgo y explícitamente
pospuesta hasta después del concurso** (ver `CONTEXTO-SIGEPAV.md`). No lo hagas sin que Pedro
lo pida directamente.

### 2. El esquema de la BD se auto-repara al arrancar — el .sql NO es la única fuente de verdad

Al conectar a MySQL corre un IIFE (`Server.js:184`) que ejecuta una cadena de funciones
`asegurar*()`: `asegurarPerfilUsuarios`, `asegurarUsuariosSemilla`, `asegurarTablasComisiones`,
`asegurarTablasCiudadano`, `asegurarTablaResetTokens`, `asegurarTablaMantenimiento`,
`asegurarCatalogoINEGI`, `asegurarModuloRespaldos`, `asegurarVencimientos`,
`asegurarConfiguracion`, más `repararNumerosEconomicosTemporales()` y `backfillQRVehiculos()`.

Esas funciones hacen `CREATE TABLE IF NOT EXISTS` y `ALTER TABLE` **desde el código**.
Consecuencia práctica: **hay tablas y columnas que existen solo porque `Server.js` las crea
al arrancar, y no están en `database/sigepav_BDD.sql`** (p.ej. `cat_estados` y el catálogo
INEGI, tablas de respaldos, reset tokens). Si buscas el esquema real, léelo de ambos lados.
Al agregar una columna, sigue el patrón: usa el helper `asegurarColumna(tabla, columna, defSQL)`.

`backfillQRVehiculos()` regenera los PNG de QR si `BASE_URL` cambió desde el último arranque
— por eso cambiar de URL de ngrok obliga a reiniciar.

### 3. La autenticación es del lado del cliente. El API no la valida.

- `POST /api/login` verifica la contraseña con bcrypt (con *fallback a texto plano* si el hash
  no empieza con `$2`) y **devuelve el objeto usuario**. No emite JWT ni cookie de sesión.
- El frontend guarda ese objeto en `sessionStorage` **y** `localStorage` bajo la llave
  `sigepav_usuario` (`public/auth-guard.js` los mantiene sincronizados).
- `auth-guard.js` hace el control de acceso **por nombre de archivo HTML**: tiene un mapa
  `adminPages` y redirige a `Usuario.html` si el rol no es administrador (rol_id 1 = Administrador,
  2 = Operativo).
- **No existe ningún middleware de autenticación ni de rol en `Server.js`** (cero coincidencias
  de `requireAuth`/`isAdmin`/etc.). Los endpoints reciben el `usuario_id` desde el body o los
  params y confían en él.

O sea: la guardia es cosmética y cualquiera puede llamar al API directo. Es un proyecto escolar
en red local; **no lo trates como bug a menos que Pedro pida endurecerlo**, pero tampoco asumas
que un endpoint está protegido.

### 4. Frontend: multipágina, con scripts compartidos que se cargan en casi todo

Cada módulo es un trío `pagina.html` + `paginaScript.js` + `paginaStyles.css`. La navegación
es real (cambio de URL), no SPA.

Scripts compartidos, en el orden en que importan:
| Archivo | Qué hace | En cuántos HTML |
|---|---|---|
| `ui-interaction-fix.js` | parches de interacción globales | 29 |
| `Config.js` | `API_BASE` autodetectado + config de Gemini | 24 |
| `auth-guard.js` | sesión, guardia de rol, chip/panel de cuenta | 22 |
| `navbar.js` | barra superior | 22 |
| `modulos-router.js` | intercepta clics `.modulo-dropdown[data-modulo]` → navega al HTML | 21 |
| `pagina-modulo.js` | abre la vista correcta según `body.dataset.initialModule` | 6 |

`modulos-router.js` tiene el mapa `RUTAS_MODULOS` (nombre lógico → archivo .html): es el índice
más rápido para saber qué módulo vive en qué página. Sus listeners corren en fase *capture* y
cancelan handlers viejos de `Script.js` a propósito — si la navegación se comporta raro, empieza ahí.

`API_BASE` se detecta solo desde `window.location.origin`, por eso la app funciona igual en
localhost, LAN o ngrok sin recompilar nada.

### 5. Módulo de IA: Gemini con fallback local, y una fuga de config rara

`/api/ia/*` (recomendación de vehículo, análisis de mantenimiento, ranking predictivo del parque).
Cada uno tiene **dos caminos**: `generar*Local()` (heurística en JS puro, siempre funciona) y
`consultarGemini*()` (llama a la API de Google). Si no hay API key o Gemini falla, cae al local.

**Detalle importante:** el backend obtiene la API key **leyendo y parseando con regex el archivo
del frontend** `public/Config.js` (`leerGeminiDesdeConfigJs()`, `Server.js:1740`). No usa una
variable de entorno. Si cambias el formato de `Config.js`, rompes el backend.

### 6. Configuración: cargador de .env casero

No se usa `dotenv`. `Server.js:27` parsea a mano **`env.env` primero y luego `.env`**, y
*no* sobreescribe variables ya definidas en el ambiente. Variables clave: `BASE_URL`, `PORT`,
`DB_HOST/PORT/USER/PASSWORD/NAME`, `DB_SSL`, `FUEL_INTERNAL_URL`, y las de SMTP para nodemailer.

### 7. Otros mecanismos que cuestan de descubrir

- **Blocklist de estáticos** (`Server.js:96`): un middleware devuelve 404 para `.env`, `Server.js`,
  `*.sql`, `*.bat`, `*.ps1`, `backups/`, `node_modules/`, etc. Si agregas un tipo de archivo
  sensible al proyecto, súmalo a ese regex.
- **Anti-caché** (`Server.js:83`): fuerza `no-store` en todo `.html/.js/.css`. Por eso los cambios
  se ven al recargar sin `Ctrl+F5`.
- **Proxy al medidor Flask** (`Server.js:115`): `/gasolina`, `/fuel` y `/set_fuel` se reenvían a
  `127.0.0.1:5000`. El navegador nunca habla directo con Flask (así funciona desde celular con
  un solo túnel). Si Flask está apagado responde 503 con mensaje amable — no es un error fatal.
- **Notificaciones en tiempo real por SSE**: `GET /api/notificaciones/stream/:usuario_id` mantiene
  la conexión abierta; el servidor guarda las respuestas por usuario (`sseRegistrar`/`sseQuitar`/
  `sseEnviar`, `Server.js:3902`) y empuja eventos con `crearNotificacion()` / `notificarAdmins()`.
- **Respaldos**: `/api/respaldos` intenta `mysqldump` como proceso hijo (`spawn`) y, si no está
  instalado, cae a un dump hecho en Node. Los archivos van a `backups/`.
- **Bitácora**: `registrarBitacora(usuario_id, accion, modulo, entidad_id, ip)` — llámala al
  agregar operaciones que modifiquen datos.
- **Uploads**: multer a `uploads/perfiles` (fotos, máx 3 MB, jpg/png/webp), `uploads/evidencias`,
  `uploads/qr`. Se sirven en `/uploads` (`Server.js:4123`).

## Convenciones

- **Respuestas del API:** siempre JSON con la forma `{ ok: true, ... }` o
  `{ ok: false, error: 'mensaje en español' }`. El frontend depende de la bandera `ok`.
- **Rutas de archivos:** todo se resuelve con `path.join(__dirname, ...)`. Mover `Server.js`
  de la raíz o renombrar carpetas **rompe** rutas.
- **Charset:** el pool fuerza `utf8mb4_unicode_ci` (dos veces, a propósito) para evitar el
  *"Illegal mix of collations"* de MySQL 8.4, cuyo default es `utf8mb4_0900_ai_ci`. No lo quites.
- **Avisos de éxito en UI:** `mostrarAviso(..., { tipo: 'success' })` en `public/Script.js` y
  `public/UsuarioScript.js` pinta palomita verde + clase `.btn-exito`.

## Usuarios de prueba (vienen en el SQL semilla)

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | `aldair@itszn.edu.mx` | `Admin` |
| Operativo | `diego@itszn.edu.mx` | `Usuario` |

El login acepta el correo completo, la parte antes de la `@`, o el nombre del usuario.

## Notas de entorno

- El repo git bueno es el que está **dentro** de `F:\2026\INNOVATEC\SIGEPAV\`. Existe un `.git`
  suelto en la raíz de `F:\` que **no** hay que usar. Si git marca *"dubious ownership"*:
  `git config --global --add safe.directory F:/2026/INNOVATEC/SIGEPAV`
- La herramienta de preview de Claude Code puede agarrar otro proyecto porque la carpeta de
  trabajo raíz es `C:\`. Para verificar visualmente, arranca `node Server.js` y abre
  `localhost:3000`.
- Hay más contexto de estado y pendientes en `CONTEXTO-SIGEPAV.md`.
