# SIGEPAV — Sistema de Gestión del Parque Vehicular

Aplicación web para administrar el parque vehicular institucional: vehículos,
comisiones, vales de gasolina, mantenimientos, expedientes, reportes, módulo
ciudadano con seguimiento por QR y un medidor de combustible.

- **Backend:** Node.js + Express (`Server.js`) con base de datos MySQL.
- **Frontend:** HTML, CSS y JavaScript servidos como estáticos desde `public/`.
- **Medidor de combustible:** servicio aparte en Python/Flask (`medidor/Gasolina.py`),
  al que el backend hace _proxy_ interno en la ruta `/gasolina`.

---

## 📁 Estructura del proyecto

```
SIGEPAV/
├── Server.js              ← Backend principal (Node/Express). Punto de entrada.
├── package.json           ← Dependencias y scripts de npm.
├── .env / env.env         ← Configuración secreta (BD, correo, BASE_URL). NO se sube a git.
│
├── public/                ← TODO el frontend (lo que ve el navegador)
│   ├── index.html, *.html       páginas
│   ├── Styles.css, *.css        estilos
│   ├── Script.js, *Script.js    lógica del navegador
│   ├── Config.js                configuración del frontend (API, Gemini, medidor)
│   ├── Logo.jpeg                 logotipo
│   └── Manual_SIGEPAV.pdf        manual de usuario (se descarga desde la app)
│
├── medidor/               ← Medidor de combustible (Python/Flask)
│   ├── Gasolina.py
│   └── requirements.txt
│
├── database/              ← Scripts SQL (esquema y migraciones). Se ejecutan a mano.
│   ├── sigepav_corregido.sql        (base de datos completa)
│   ├── ciudadano_migration.sql
│   ├── notificaciones_navegacion_migration.sql
│   └── reparar_no_economico_temporal.sql
│
├── scripts/              ← Scripts de arranque/operación (.bat y .ps1)
│   ├── iniciar-sigepav.bat          arranca solo el backend
│   ├── iniciar-todo.bat             arranca backend + medidor
│   ├── iniciar-medidor.bat          arranca solo el medidor
│   ├── iniciar-sigepav-ngrok.ps1    arranca todo + ngrok (acceso público)
│   ├── actualizar-baseurl-ngrok.ps1 cambia la URL pública y regenera QR
│   ├── detener-*.ps1                detiene los procesos
│   └── ...
│
├── docs/                 ← Documentación e instrucciones de despliegue (.txt)
├── seed/                 ← Datos semilla (estados, municipios, localidades).
├── uploads/             ← Archivos subidos (evidencias, fotos de perfil, QR).
└── backups/             ← Respaldos generados por la app.
```

> **Nota:** los scripts de `scripts/` se localizan solos (usan su propia ruta),
> así que funcionan sin importar en qué carpeta o unidad esté el proyecto.

---

## 🚀 Cómo ejecutar

### Requisitos
- Node.js 18+ y npm
- MySQL en marcha con la base de datos importada desde `database/sigepav_corregido.sql`
- (Opcional) Python 3.12 para el medidor de combustible

### Pasos
```bash
# 1. Instalar dependencias del backend (solo la primera vez)
npm install

# 2. Configurar .env (BD, correo, BASE_URL). Ver docs/ para ejemplos.

# 3. Arrancar el backend
npm start            # equivale a: node Server.js
```
La app queda en **http://localhost:3000**.

En Windows también puedes dar doble clic a `scripts/iniciar-sigepav.bat`
(backend) o `scripts/iniciar-todo.bat` (backend + medidor).

---

## 🔧 Notas técnicas
- El backend sirve el frontend con `express.static('public')`.
- Archivos sensibles (`.env`, `Server.js`, `.sql`, `.bat`, `.ps1`, `backups/`,
  `node_modules/`) están bloqueados a nivel HTTP y/o quedan fuera de `public/`.
- El medidor Flask corre en `127.0.0.1:5000` y el backend lo expone por proxy
  en `/gasolina` para que funcione también desde celular/tablet vía ngrok.
