# Registro de cambios

> Bitácora legible de lo que se ha modificado en SIGEPAV, agrupada por tema.
> Para el detalle línea por línea está `git log`; esto es el resumen que se
> entiende sin abrir el código.
> Índice general en [`README.md`](README.md).

---

## 2026-08-15 · Sesión de limpieza y documentación

Objetivo de la sesión: **quitar el código basura y entender cómo funciona la app**,
rumbo al INNOVATEC 2026.

### 🐞 Bugs corregidos

Los cuatro se verificaron **corriendo la aplicación**, no solo leyendo el código.

| Bug | Qué pasaba | Arreglo |
|---|---|---|
| **`vehiculos.html` no cargaba** | Llamaba `SIGEPAV.initPagina()`, una función que no existía en ningún archivo. Era la primera línea del `DOMContentLoaded` y sin `try/catch`, así que reventaba y **las otras 406 líneas nunca corrían**: la página salía vacía | Se eliminó la llamada. Lo que hacía ya lo cubren `auth-guard.js` y el `display:flex` del HTML |
| **Dos botones de "cerrar sesión" no cerraban sesión** | `vales.html` y `respaldos.html` llamaban `SIGEPAV.clearSession()`, que nunca existió. El `if` se tragaba el fallo: te mandaba al login pero **dejaba la sesión viva**, y el guard te volvía a meter | Ahora usan `__sigepav_limpiar_sesion()` de `auth-guard.js`, que es el dueño de la sesión |
| **El deep-link de notificaciones no llevaba a ningún lado** | La columna `referencia_id` existía y el frontend la leía, pero **el backend nunca la escribía** y el `SELECT` tampoco la devolvía. Estaba rota de los dos lados | Se puebla en los 5 puntos donde hay un registro al que apuntar, y `alta-edicion.html` ahora sí lee el `?vehiculo_id=` de la URL |
| **Los días para un vencimiento se calculaban de 4 formas distintas** | Dos funciones `diasHasta` y dos cálculos inline, que diferían en tres cosas. Medido contra los datos reales: **48 de 48 fechas estaban mal**, siempre por un día menos. El mismo seguro podía salir 🔴 en pantalla y 🟡 en el correo | Tres helpers únicos que normalizan a medianoche local. Verificado: las 25 fechas del cron ahora coinciden exactamente con las de la pantalla |

### 🧹 Limpieza

**19 archivos eliminados, ~1,300 líneas netas menos.** Nada se borró sin verificar antes
que no lo usara nadie.

- **`vehiculos.html` + `vehiculosScript.js`** — duplicaban `alta-edicion.html`, que es la
  que está en el menú. Se repuntaron los 3 enlaces de notificación y se limpiaron sus
  entradas en `auth-guard.js` y `navbar.js`.
- **El cluster de "Control de combustible"** — `reg-vales.html` (un placeholder "en
  construcción" con 2 referencias rotas), `reg-valesScript.js`, `consultas.html` y
  `consultasScript.js`. Con ellos se fueron los 6 `<div data-modulo>` que los invocaban y
  el mecanismo `aExcluir` de `navbar.js`, que **ya era un no-op**.
- **7 scripts de arranque** — 4 redundantes con `INICIAR-SIGEPAV.bat` y **2 peligrosos**:
  `detener-sigepav.ps1` y `detener-todo-ngrok.ps1` hacían `taskkill /F /IM node.exe` a
  ciegas, matando **cualquier** Node o Python de la máquina.
- **2 endpoints huérfanos** — `GET /api/viajes` y `PUT /api/viajes/:id/finalizar`. El
  segundo era la versión antigua de finalizar una comisión: **saltaba el flujo de
  aprobación y el control de rol**.
- **Basura menor** — `Login.html` (0 bytes), `leame.txt` (credenciales en texto plano),
  `manual-descarga.js` (sin una sola llamada), ~40 líneas de un instructivo ya aplicado en
  `Server.js`, el alias `SIGEPAV_API` sin consumidores, y 8 `console.log` de depuración
  (uno imprimía el correo de la sesión).

**Lo que NO se borró, contra lo que decía la auditoría:** `window.sigepavUnlockUI` parece
muerto pero es una **escotilla intencional** para destrabar la interfaz desde la consola.
Se documentó como tal.

### 🔧 Calidad

- **`iconv-lite` estaba sin declarar** en `package.json`. `scripts/fix_encoding.js` la
  usaba armando la ruta a mano; funcionaba solo porque llegaba como dependencia
  transitiva. El día que esa cadena cambiara, el script tronaba.
- **El `catch` del rollback era `catch (_) {}`** — si el rollback fallaba, quedaba una
  transacción a medias sin rastro en ningún log. Ahora lo reporta.
- **`derivarRolId()`** unifica dos derivaciones de rol que no coincidían (crear aceptaba
  `'admin'`; editar además `'1'`), y ahora responde 400 ante un rol desconocido en vez de
  degradar en silencio a Operativo.
- **`normalizarTipoVehiculo()` y `normalizarCapacidadVehiculo()`** reemplazan un bloque
  byte a byte idéntico en crear y editar vehículo.
- **`MODELOS_GEMINI` recortada al free tier.** La lista traía los modelos "pro" hasta
  arriba, que **siempre se cobran**: una trampa lista para generar cargos en cuanto
  alguien pusiera una API key. Quedaron 4 modelos, todos gratuitos.

### 📅 Datos de demostración

Los dos seeds tenían las fechas **quemadas y calibradas al 13 de junio**. Pasada esa
fecha el escenario se descalibraba solo: en agosto todo lo que debía salir rojo ya estaba
vencido hacía meses y **el semáforo se veía plano**.

Ahora todas las fechas se calculan contra `CURDATE()`, así que el escenario se ve igual
el día que se cargue. Incluye viajes y vales repartidos sobre el último mes y medio, para
que el dashboard siempre tenga actividad reciente que mostrar.

### 📁 Organización

- Se creó **`documentacion/`** y se consolidó `docs/` dentro. Antes había dos destinos
  posibles para la documentación.
- **Un solo lanzador y un solo apagador**: `INICIAR-SIGEPAV.bat` y `APAGAR-SIGEPAV.bat`
  en la raíz. `scripts/` quedó solo con utilidades reales.
- Se corrigieron tres datos falsos del `README.md` principal.

### 📖 Documentación nueva

| Documento | Qué cubre |
|---|---|
| [`arquitectura.md`](arquitectura.md) | El stack completo, con metáfora y pieza por pieza |
| [`flujos/01-login.md`](flujos/01-login.md) | La sesión y por qué la guardia es de navegación, no de seguridad |
| [`flujos/02-comision.md`](flujos/02-comision.md) | La máquina de estados de una comisión |
| [`flujos/03-reporte-ciudadano.md`](flujos/03-reporte-ciudadano.md) | La única entrada sin sesión |
| [`flujos/04-salud-flota-ia.md`](flujos/04-salud-flota-ia.md) | Por qué la IA no calcula, solo redacta |
| [`flujos/05-vale-medidor.md`](flujos/05-vale-medidor.md) | El ciclo del vale y el cruce a Python |
| `CLAUDE.md` (raíz) | Mapa de la arquitectura para trabajo futuro |

Cada traza lleva diagramas y referencias `archivo:línea` **verificadas contra el código**.

### 🔌 La app quedó 100% offline

**Antes no lo era, aunque el argumento del proyecto dijera lo contrario.** Las 26 páginas
cargaban sus librerías desde `cdnjs.cloudflare.com`: Font Awesome en 24, Chart.js en el
dashboard, jsPDF en 3 y xlsx en 1.

Sin internet la aplicación **seguía funcionando**, pero se rompía lo que se ve: ni un solo
icono, y el dashboard sin una sola gráfica. Exactamente al demostrar *"funciona sin
internet"*.

La solución fue declarar las librerías como dependencias de npm y servirlas desde el
propio servidor en `/vendor/...`, en vez de copiar 1.5 MB de binarios al repositorio. Así
la versión queda fijada en `package.json` y `npm install` —que ya era obligatorio— las
trae.

**Verificado:** 30 de 30 peticiones del dashboard van a `localhost`. Cero externas.
El detalle completo está en [`arquitectura.md`](arquitectura.md#parte-3--por-qué-la-app-es-100-offline).

> **Regla para el futuro:** si agregas una librería, no pegues un `<script>` a un CDN.
> Instálala con npm y móntala en `/vendor/`.

### 🗂️ Expediente Digital — backend

Era una maqueta: los documentos se guardaban en `const documentosMock = {}`, un objeto en
memoria, y **se perdían al recargar**. No existía ningún endpoint que los respaldara.

El reencuadre: casi todo lo que el expediente muestra **ya vivía en otras tablas**. Lo
único que faltaba eran **los archivos**.

- Tabla `expediente_documentos` con tipo, folio, emisor, vigencia, monto y metadatos.
- Subida real con multer hacia `uploads/expedientes/`, **aceptando PDF**.
- `GET/POST /api/vehiculos/:id/documentos` y `DELETE /api/documentos/:id`.
- **`GET /api/vehiculos/:id/expediente`** — la vista única que reúne identidad,
  documentos, servicio y uso, más el **costo total de propiedad**.
- **`GET /api/vehiculos/:id/timeline`** — todo lo que le ha pasado a la unidad, mezclando
  5 tablas con `UNION ALL`.

Verificado end-to-end con 24 comprobaciones y limpieza posterior.

> **Tropiezo que quedó resuelto:** la tabla se creó sin `COLLATE` explícito y MySQL 8.4 le
> asignó `utf8mb4_0900_ai_ci`, mientras el resto del esquema usa `utf8mb4_unicode_ci`. El
> `UNION` tronaba con *"Illegal mix of collations"*. Se agregó el `COLLATE` y una
> reparación automática al arrancar.

### 🔀 Repositorio

- Se subió a GitHub (privado), verificando antes que **no hubiera secretos en el
  historial**.
- Se dejaron de versionar los **QR generados**: son salida que se recrea al arrancar y
  ensuciaba el diff con 16 binarios en cada cambio de URL.
- Se reescribió la autoría de los 15 commits que tenían un correo local, para que cuenten
  en el perfil de GitHub.
