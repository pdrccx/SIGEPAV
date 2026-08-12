# 📌 CONTEXTO SIGEPAV — Estado del proyecto (para retomar en otra sesión)

> Documento de traspaso. Léelo antes de seguir trabajando en SIGEPAV.
> Última actualización: **2026-06-12**.

---

## 🚗 Qué es
**SIGEPAV** — Sistema de Gestión del Parque Vehicular. Proyecto para el concurso **INNOVATEC 2026** (autor: Pedro).

- **Backend:** Node.js + Express → `Server.js` (puerto **3000**). Base de datos **MySQL**.
- **Frontend:** HTML/CSS/JS estáticos, servidos desde `public/`.
- **Medidor de combustible:** servicio aparte en Python/Flask → `medidor/Gasolina.py` (puerto 5000, opcional; el backend le hace proxy en `/gasolina`).
- **Ubicación:** `F:\2026\INNOVATEC\SIGEPAV`

---

## 📁 Estructura (ya reorganizada)
```
SIGEPAV/
├── Server.js              ← backend principal (entry point, va en la raíz a propósito)
├── package.json , .env , env.env
├── README.md              ← documentación general del proyecto
├── CONTEXTO-SIGEPAV.md    ← este archivo
├── public/                ← TODO el frontend (html, css, js de navegador, Config.js, Logo, Manual)
├── medidor/               ← Gasolina.py + requirements.txt (Python)
├── database/              ← scripts SQL (ver abajo)
├── scripts/               ← .bat / .ps1 de arranque (auto-localizables con %~dp0 / $PSScriptRoot)
├── docs/                  ← instrucciones .txt de despliegue
├── seed/ , uploads/ , backups/ , node_modules/
```

> El código usa rutas relativas a `__dirname`, por eso renombrar la carpeta o
> mover `Server.js` de la raíz **rompería** rutas. Está bien donde está.

---

## ✅ Lo que YA se hizo en sesiones previas
1. **Reorganización completa** del proyecto (antes estaba todo amontonado en la raíz) → carpetas `public/`, `medidor/`, `database/`, `scripts/`, `docs/`.
2. **Git inicializado dentro del proyecto** como red de seguridad (antes no había control de versiones).
3. **Arreglo de UI:** los avisos de "Comisión registrada/iniciada" ahora salen con **palomita verde** y **botón verde oscuro** (antes triángulo de alerta). Implementado con un parámetro `tipo:'success'` en la función `mostrarAviso` (en `public/Script.js` y `public/UsuarioScript.js`) + clase `.btn-exito` en `public/Styles.css`.
4. **Carpeta renombrada** de `Gesti-n-Vehicular-main` → `SIGEPAV`.
5. **Scripts de arranque** hechos auto-localizables (antes traían rutas `C:\SIGEPAV\...` hardcodeadas y equivocadas).
6. **SQL fusionado:** `ciudadano_migration.sql` se metió dentro del script base, y el archivo se renombró a **`sigepav_BDD.sql`**.

### Historial de commits
```
d1eb532 Renombrar sigepav_corregido.sql a sigepav_BDD.sql y actualizar referencias
7b46811 Fusionar ciudadano_migration.sql dentro de sigepav_corregido.sql
1c38b38 Agregar script de un clic para configurar la base de datos local (MySQL)
a97bd87 Renombrar carpeta del proyecto a SIGEPAV
e5af6db Avisos de exito con palomita verde y boton verde oscuro
3e7ae3b Reorganizar SIGEPAV en estructura backend/frontend/medidor/database/scripts/docs
c203580 Estado inicial de SIGEPAV antes de reorganizar (red de seguridad)
```

---

## 🟡 EN LO QUE NOS QUEDAMOS (pendiente)
**Objetivo actual: poner a correr SIGEPAV en la compu local de Pedro para probarlo.**

- El servidor **arranca bien** (sirve en `http://localhost:3000`).
- **PERO la base de datos local no estaba lista.** Al arrancar marca:
  `❌ Error conectando a MySQL: Access denied for user 'sigepav_user'@'localhost'`
- Causa: las credenciales del `.env` (`sigepav_user` / `Sigepav2026!DB#`) son las del **servidor de producción (Azure)**, y ese usuario **no existe** en el MySQL local.

### Entorno local detectado
- **MySQL 8.4** instalado como **servicio de Windows** (`MySQL84`), prendido en el puerto **3306**.
- `mysql.exe` está en: `C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe`
- Pedro usa **MySQL Workbench** y **tiene la contraseña de root** (le funciona en Workbench).

### ▶️ Pasos para terminar de montar la base (lo que sigue)
**Paso 1 — Crear la base de datos:**
En MySQL Workbench: `File → Open SQL Script…` → abrir `database/sigepav_BDD.sql` → ejecutar todo con **`Ctrl + Shift + Enter`**.
(Ese script hace `DROP DATABASE IF EXISTS sigepav; CREATE DATABASE sigepav;` y crea todas las tablas + datos semilla + módulo ciudadano.)

**Paso 2 — Crear el usuario que ocupa la app:**
En una pestaña nueva de query en Workbench, ejecutar:
```sql
CREATE USER IF NOT EXISTS 'sigepav_user'@'localhost' IDENTIFIED BY 'Sigepav2026!DB#';
GRANT ALL PRIVILEGES ON sigepav.* TO 'sigepav_user'@'localhost';
FLUSH PRIVILEGES;
```

> 🟢 Atajo alternativo: en vez de los pasos 1 y 2, doble clic a
> `scripts/configurar-base-de-datos.bat` (pide la contraseña de root y hace ambas cosas).
> Ojo: ese .bat asume MySQL 8.4 en la ruta de arriba; si el `mysql.exe` está en otro lado, hay que ajustar la ruta dentro del .bat.

**Paso 3 — Arrancar la app:**
Doble clic a `INICIAR-SIGEPAV.bat` en la raíz (o `npm start`). Abrir `http://localhost:3000`.
Ya **no** debe salir el error rojo de MySQL.

---

## 🔑 Usuarios de prueba (vienen en el SQL)
| Rol | Correo | Contraseña |
|-----|--------|------------|
| 👑 Administrador | `aldair@itszn.edu.mx` | `Admin` |
| 👤 Operativo | `diego@itszn.edu.mx` | `Usuario` |

---

## ▶️ Comandos útiles
- **Correr todo de un clic:** `INICIAR-SIGEPAV.bat` (raíz) — MySQL + medidor + app + navegador
- **Solo el backend:** `npm start`
- **Detener:** `APAGAR-SIGEPAV.bat` (raíz)
- **Probar que sirve (sin navegador):** `curl http://localhost:3000/`

---

## ⚠️ Notas / cosas a saber
- **No hace falta ngrok** para probar local; eso es solo para exponer la app a internet / celular.
- **Preview de Claude Code:** la herramienta de preview agarra **otro proyecto** (ITSZN, puerto 5173) porque la carpeta de trabajo raíz es `C:\` y no toma el `.claude/launch.json` de este proyecto. Para verificar visualmente, mejor arrancar `node Server.js` a mano y abrir `localhost:3000`.
- Existe un `.git` suelto en la **raíz de `F:\`** (de alguien que hizo `git init` en todo el disco). **NO usar ese.** El repo bueno es el que está dentro de `F:\2026\INNOVATEC\SIGEPAV\`.
- Si git marca *"dubious ownership"*, correr:
  `git config --global --add safe.directory F:/2026/INNOVATEC/SIGEPAV`

---

## 🔨 PENDIENTE DECIDIDO: reconstruir Expediente Digital

`public/expediente.html` **muestra vehículos reales** (los lee de `/api/vehiculos`),
pero **la subida de documentos es una maqueta**: `expedienteScript.js` los guarda en
`const documentosMock = {}`, un objeto en memoria del navegador. Se pierden al recargar.
**No existe ningún endpoint `/api/expediente*` en el backend.**

Pedro decidió (2026-08-12) **dejarlo pendiente y reconstruirlo bien más adelante**, para
que de verdad guarde la documentación importante del vehículo (factura, tarjeta de
circulación, póliza, verificación).

Lo que hace falta cuando se retome:
1. Tabla `expediente_documentos` (vehiculo_id, tipo, nombre_archivo, ruta, subido_por, fecha).
   Crearla con el patrón `asegurarTabla*()` del arranque, como el resto.
2. Endpoints `GET/POST/DELETE /api/vehiculos/:id/documentos`.
3. Almacenamiento con **multer** hacia `uploads/expedientes/` — ya existe el patrón
   completo en las fotos de perfil (`perfilStorage` / `subirFotoPerfil` en `Server.js`).
4. Sumar `uploads/expedientes/` al `.gitignore` y al bloqueo de estáticos si aplica.
5. Cambiar `documentosMock` por llamadas reales en `expedienteScript.js`.

> ⚠️ Mientras tanto: **no enseñar la subida de documentos en la demo del concurso**,
> o aclarar que es una maqueta.

---

## 💡 Ideas a futuro (NO urgentes, comentadas en sesión)
- Aplicar la palomita verde a **otros avisos de éxito** (vehículo guardado, vale registrado, etc.), no solo a comisiones.
- (Solo después del concurso) Partir el monolito `Server.js` (~250 KB) en módulos `routes/`, `controllers/`, `db.js`. **Alto riesgo, no tocar antes del INNOVATEC.**
-Que no se me olvide corregir lo del manual del usuario, que se despliegue ahí mismo y no tener necesidad de descargar el pdf
