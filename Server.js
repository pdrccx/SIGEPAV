// =====================================================================
//  SIGEPAV — Servidor Node.js (Express + MySQL)
//  Sirve los HTML estáticos y expone los endpoints de la API.
// =====================================================================
//  Cómo correrlo:
//    1)  npm install
//    2)  node Server.js
//    3)  Abre http://localhost:3000  en el navegador
// =====================================================================

const express    = require('express');
const mysql      = require('mysql2/promise');
const bcrypt     = require('bcryptjs');
const cors       = require('cors');
const path       = require('path');
const nodemailer = require('nodemailer');
const multer     = require('multer');
const QRCode     = require('qrcode');
const rateLimit  = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');

// ── URL pública del sistema ────────────────────────────────────────────
//  Cambia este valor si cambias el dominio de ngrok o pasas a producción.
const fs         = require('fs');

// Cargar variables desde env.env o .env para el correo SMTP
for (const nombreEnv of ['env.env', '.env']) {
    const rutaEnv = path.join(__dirname, nombreEnv);
    if (fs.existsSync(rutaEnv)) {
        fs.readFileSync(rutaEnv, 'utf8').split(/\r?\n/).forEach(linea => {
            const limpia = linea.trim();
            if (!limpia || limpia.startsWith('#')) return;
            const idx = limpia.indexOf('=');
            if (idx === -1) return;
            const key = limpia.slice(0, idx).trim();
            let value = limpia.slice(idx + 1).trim();
            if ((value.startsWith("'") && value.endsWith("'")) ||
                (value.startsWith('\"') && value.endsWith('\"'))) {
                value = value.slice(1, -1);
            }
            if (key && process.env[key] === undefined) process.env[key] = value;
        });
    }
}

const BASE_URL = (process.env.BASE_URL || 'https://oda-peachier-terrie.ngrok-free.dev').replace(/\/+$/, '');

// ============== CONFIG MYSQL ==============
const DB_SSL = String(process.env.DB_SSL || 'false').toLowerCase() === 'true';
const DB_CONFIG = {
    // La app vive en la misma VM que MySQL, por eso el host correcto aquí es 127.0.0.1.
    // BASE_URL sí usa la IP pública porque es para navegador/QR.
    host:     process.env.DB_HOST || '127.0.0.1',
    port:     parseInt(process.env.DB_PORT || '3306', 10),
    user:     process.env.DB_USER || 'sigepav_user',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sigepav',
    charset:  'utf8mb4_unicode_ci',   // evita "Illegal mix of collations" en MySQL 8.4 (default 0900_ai_ci)
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),
    queueLimit: 0,
    dateStrings: true,
    // Fuerza la collation de la conexión a utf8mb4_unicode_ci (la misma con la que
    // se crean las tablas). Evita el "Illegal mix of collations" en MySQL 8.4, cuya
    // collation por defecto (utf8mb4_0900_ai_ci) no coincide con la de las columnas.
    charset: 'utf8mb4_unicode_ci',
    ...(DB_SSL ? { ssl: { rejectUnauthorized: false } } : {})
};

// ============== CONFIG SERVER ==============
const PORT = parseInt(process.env.PORT || '3000', 10);

// ============== INICIALIZACIÓN ==============
const app  = express();
const pool = mysql.createPool(DB_CONFIG);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Anti-caché para HTML/JS/CSS: evita que el navegador se quede pegado
// con versiones viejas mientras desarrollamos. (En producción se puede
// quitar o cambiar por una estrategia de versionado por hash.)
app.use((req, res, next) => {
    if (/\.(html|js|css)$/i.test(req.path)) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
    }
    next();
});


// Bloquea archivos internos que no deben descargarse desde el navegador.
// OJO: express.static(__dirname) sirve la raíz del proyecto, por eso protegemos
// credenciales, respaldos, scripts de servidor, SQL y dependencias.
app.use((req, res, next) => {
    let ruta = '';
    try { ruta = decodeURIComponent(req.path || '').replace(/\\/g, '/'); }
    catch (_) { ruta = req.path || ''; }
    const prohibido = /(^|\/)(env\.env|\.env|Server\.js|Gasolina\.py|package(-lock)?\.json|requirements\.txt|INSTRUCCIONES_AZURE_SIGEPAV\.txt|INSTRUCCIONES_LARAGON_NGROK\.txt)$/i.test(ruta)
        || /(^|\/)backups(\/|$)/i.test(ruta)
        || /(^|\/)node_modules(\/|$)/i.test(ruta)
        || /\.(sql|ps1|bat|cmd|zip)$/i.test(ruta);
    if (prohibido) return res.status(404).send('Not found');
    next();
});


// ── Proxy interno al medidor Flask/Gasolina.py ────────────────────────
//  El navegador siempre entra por la misma URL pública de Node/ngrok.
//  Node reenvía internamente estas rutas a Flask en 127.0.0.1:5000.
//  Así funciona desde celular/tablet sin abrir otro túnel ni exponer :5000.
const FUEL_INTERNAL_URL = (process.env.FUEL_INTERNAL_URL || 'http://127.0.0.1:5000').replace(/\/+$/, '');

async function proxyFlask(req, res, flaskPath, method = 'GET') {
    try {
        const url = `${FUEL_INTERNAL_URL}${flaskPath}`;
        const options = { method, headers: {} };
        if (method !== 'GET' && method !== 'HEAD') {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(req.body || {});
        }

        const r = await fetch(url, options);
        const contentType = r.headers.get('content-type') || 'text/plain; charset=utf-8';
        res.status(r.status).type(contentType);

        if (/application\/json/i.test(contentType)) {
            return res.send(await r.text());
        }
        return res.send(await r.text());
    } catch (err) {
        console.warn('⚠️  Proxy Flask/Gasolina:', err.message);
        return res.status(503).json({
            ok: false,
            error: 'El medidor de combustible no está disponible. Verifica que Gasolina.py esté corriendo en la VM.',
            detalle: err.message
        });
    }
}

app.get(['/gasolina', '/gasolina/'], (req, res) => proxyFlask(req, res, '/'));
app.get(['/gasolina/fuel', '/fuel'], (req, res) => proxyFlask(req, res, '/fuel'));
app.post(['/gasolina/set_fuel', '/set_fuel'], (req, res) => proxyFlask(req, res, '/set_fuel', 'POST'));

app.use(express.static(path.join(__dirname, 'public'))); // sirve public/index.html, public/Styles.css, etc.


// ── Multer — fotos de perfil de usuarios ─────────────────────────────
const perfilStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, 'uploads', 'perfiles');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        cb(null, `perfil_${Date.now()}_${uuidv4().slice(0,8)}${ext}`);
    }
});
const uploadPerfil = multer({
    storage: perfilStorage,
    limits: { fileSize: 3 * 1024 * 1024 },  // 3 MB
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowed.includes(file.mimetype)) {
            return cb(new Error('Solo se permiten imágenes JPG, PNG o WEBP.'));
        }
        cb(null, true);
    }
});

function subirFotoPerfil(req, res, next) {
    uploadPerfil.single('foto_perfil')(req, res, (err) => {
        if (!err) return next();
        const msg = err.code === 'LIMIT_FILE_SIZE'
            ? 'La foto no debe superar los 3 MB.'
            : err.message;
        return res.status(400).json({ ok: false, error: msg });
    });
}

// Probar conexión al arrancar
(async () => {
    try {
        const conn = await pool.getConnection();
        console.log('✅ Conexión a MySQL OK');
        conn.release();
        await asegurarPerfilUsuarios();
        await asegurarUsuariosSemilla();
        await asegurarTablasComisiones();
        await asegurarTablasCiudadano();
        await asegurarTablaResetTokens();
        await asegurarTablaMantenimiento();
        await asegurarCatalogoINEGI();
        await asegurarModuloRespaldos();
        await asegurarVencimientos();
        await asegurarConfiguracion();
        await repararNumerosEconomicosTemporales();
        // Garantiza que cada vehículo activo tenga qr_token + qr_image_path.
        // Regenera el PNG si BASE_URL cambió desde el último arranque.
        await backfillQRVehiculos();
    } catch (err) {
        console.error('❌ Error conectando a MySQL:', err.message);
        console.error('   Revisa env.env/.env (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME).');
    }
})();

// ===================================================================
//  repararNumerosEconomicosTemporales
//  Si una versión anterior alcanzó a insertar un vehículo y falló antes
//  de cambiar el no_economico temporal ('000' o 'Txxxxx'), lo repara al
//  arrancar. Solo cambia filas donde el no_economico destino no está usado.
// ===================================================================
async function repararNumerosEconomicosTemporales() {
    try {
        const [rows] = await pool.query(`
            SELECT v.id, v.no_economico
              FROM vehiculos v
              LEFT JOIN vehiculos x
                ON x.no_economico = IF(CHAR_LENGTH(CAST(v.id AS CHAR)) < 3, LPAD(v.id, 3, '0'), CAST(v.id AS CHAR))
               AND x.id <> v.id
             WHERE (v.no_economico = '000' OR v.no_economico LIKE 'T%')
               AND x.id IS NULL
             LIMIT 100
        `);

        for (const v of rows) {
            const noEco = String(v.id).padStart(3, '0');
            await pool.query('UPDATE vehiculos SET no_economico = ? WHERE id = ?', [noEco, v.id]);
        }

        if (rows.length) {
            console.log(`   → ${rows.length} no_economico temporal(es) reparado(s).`);
        }
    } catch (err) {
        console.warn('⚠️  repararNumerosEconomicosTemporales:', err.message);
    }
}

// ===================================================================
//  backfillQRVehiculos
//  Garantiza:
//    a) Todo vehículo activo tiene qr_token (UUID en la BD)
//    b) Todo vehículo activo tiene qr_image_path (PNG físico)
//  Detecta automáticamente cambios de BASE_URL y regenera los PNG.
//  Es idempotente: si no hay nada que hacer, no hace nada.
// ===================================================================
async function backfillQRVehiculos() {
    try {
        // 1) Genera qr_token para vehículos que no lo tienen.
        const [sinToken] = await pool.query(
            'SELECT id FROM vehiculos WHERE activo = 1 AND (qr_token IS NULL OR qr_token = "")'
        );
        for (const v of sinToken) {
            await pool.query('UPDATE vehiculos SET qr_token = UUID() WHERE id = ?', [v.id]);
        }
        if (sinToken.length) {
            console.log(`   → ${sinToken.length} vehículo(s) recibieron qr_token nuevo.`);
        }

        // 2) Detecta cambio de BASE_URL respecto al último arranque.
        //    Marcador: uploads/qr/.qr-base-url contiene la última BASE_URL.
        const qrDir = path.join(__dirname, 'uploads', 'qr');
        const markerFile = path.join(qrDir, '.qr-base-url');
        let baseUrlAnterior = null;
        let markerExistia = false;
        try {
            if (fs.existsSync(markerFile)) {
                markerExistia = true;
                baseUrlAnterior = fs.readFileSync(markerFile, 'utf8').trim();
            }
        } catch (_) {}

        const baseUrlCambio = markerExistia && baseUrlAnterior !== BASE_URL;
        const primerArranque = !markerExistia;

        if (baseUrlCambio) {
            console.log(`   ⚠️  BASE_URL cambió: "${baseUrlAnterior}" → "${BASE_URL}". Regenerando QR…`);
        } else if (primerArranque) {
            console.log(`   ℹ️  Primer arranque: regenerando QR con BASE_URL actual (${BASE_URL})…`);
        }

        if (baseUrlCambio || primerArranque) {
            await pool.query(
                'UPDATE vehiculos SET qr_image_path = NULL WHERE activo = 1 AND qr_token IS NOT NULL'
            );
        }

        // 3) Genera el PNG del QR para vehículos sin imagen.
        const [sinImg] = await pool.query(
            `SELECT id, qr_token FROM vehiculos
             WHERE activo = 1 AND qr_token IS NOT NULL
               AND (qr_image_path IS NULL OR qr_image_path = '')`
        );
        let regen = 0;
        for (const v of sinImg) {
            try {
                const r = await generarQRVehiculo(v.id, v.qr_token);
                if (r) regen++;
            } catch (_) {}
        }
        if (regen) console.log(`   → ${regen} imagen(es) QR generada(s).`);

        // 4) Guarda BASE_URL como marcador para el próximo arranque.
        try {
            fs.mkdirSync(qrDir, { recursive: true });
            fs.writeFileSync(markerFile, BASE_URL, 'utf8');
        } catch (_) {}
    } catch (err) {
        console.warn('⚠️  backfillQRVehiculos:', err.message);
    }
}

// Crea Aldair y Diego si no existen, para mantener compatibilidad con el front

// Asegura columna opcional para foto de perfil de usuarios.
async function asegurarPerfilUsuarios() {
    await asegurarColumna('usuarios', 'foto_perfil', 'VARCHAR(255) NULL DEFAULT NULL AFTER cargo');
    await asegurarColumna('usuarios', 'primer_acceso', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER foto_perfil');
    await asegurarColumna('usuarios', 'correo_gmail', 'VARCHAR(150) NULL DEFAULT NULL AFTER primer_acceso');

    // Permitir password_hash NULL (necesario para el flujo de primer acceso)
    try {
        await pool.query(`ALTER TABLE usuarios MODIFY COLUMN password_hash VARCHAR(255) NULL DEFAULT NULL`);
    } catch (e) {
        console.warn('⚠️  No se pudo modificar password_hash a NULL:', e.message);
    }
}

async function asegurarUsuariosSemilla() {
    try {
        const semillas = [
            { user: 'Aldair', pass: 'Admin',   nombre: 'Aldair',  apellidos: 'Admin',   email: 'aldair@itszn.edu.mx', rol_id: 1 },
            { user: 'Diego',  pass: 'Usuario', nombre: 'Diego',   apellidos: 'Usuario', email: 'diego@itszn.edu.mx',  rol_id: 2 }
        ];
        for (const s of semillas) {
            const [rows] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [s.email]);
            if (rows.length === 0) {
                const hash = await bcrypt.hash(s.pass, 10);
                await pool.query(
                    `INSERT INTO usuarios (nombre, apellidos, email, password_hash, rol_id, departamento, cargo, activo)
                     VALUES (?, ?, ?, ?, ?, 'Subdirección Administrativa', ?, 1)`,
                    [s.nombre, s.apellidos, s.email, hash, s.rol_id, s.rol_id === 1 ? 'Administrador' : 'Usuario operativo']
                );
                console.log(`   → Usuario semilla creado: ${s.user}/${s.pass}`);
            }
        }
    } catch (err) {
        console.warn('⚠️  No se pudieron crear usuarios semilla:', err.message);
    }
}

// =====================================================================
//  MIGRACIÓN MÍNIMA — Solicitudes de finalización de comisión
//  Crea la tabla solo si no existe. Se ejecuta al arrancar.
// =====================================================================
async function asegurarTablasComisiones() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS solicitudes_finalizacion (
                id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
                viaje_id         INT UNSIGNED NOT NULL,
                usuario_id       INT UNSIGNED NOT NULL,
                km_final         INT UNSIGNED DEFAULT NULL,
                nivel_comb_fin   VARCHAR(20) DEFAULT NULL,
                observaciones    TEXT,
                motivo           VARCHAR(255) DEFAULT NULL,
                estado           ENUM('pendiente','aprobada','rechazada') NOT NULL DEFAULT 'pendiente',
                comentario_admin TEXT,
                admin_id         INT UNSIGNED DEFAULT NULL,
                created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                resuelta_at      DATETIME DEFAULT NULL,
                PRIMARY KEY (id),
                INDEX idx_estado (estado),
                INDEX idx_viaje  (viaje_id),
                CONSTRAINT fk_solfin_viaje   FOREIGN KEY (viaje_id)   REFERENCES viajes(id)   ON DELETE CASCADE,
                CONSTRAINT fk_solfin_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
                CONSTRAINT fk_solfin_admin   FOREIGN KEY (admin_id)   REFERENCES usuarios(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log('✅ Tabla solicitudes_finalizacion lista.');

        // ── Migración: añadir columna `actividades` a `viajes` ────────────
        // Se guarda como TEXT (una actividad por línea). Es el resumen de
        // lo que se realizó durante la comisión, visible al ciudadano.
        await asegurarColumna('viajes', 'actividades', 'TEXT NULL');

        // ── Migración: añadir columna `actividades` a `solicitudes_finalizacion`
        // Lo captura el usuario al cerrar la comisión. Cuando el admin aprueba
        // la solicitud, se copia a `viajes.actividades` para vista pública.
        await asegurarColumna('solicitudes_finalizacion', 'actividades', 'TEXT NULL');

        // ── Tabla `vales_disponibles` ─────────────────────────────────────
        // El admin captura los vales físicos (papel) y los publica. Cuando
        // un usuario inicia una comisión, elige uno del combo (default S/V).
        // Estados:
        //   borrador  → admin lo capturó pero NO lo ha publicado (no visible)
        //   disponible → publicado, aparece en el combo de comisión
        //   usado     → ya se asignó a una comisión, queda en historial
        await pool.query(`
            CREATE TABLE IF NOT EXISTS vales_disponibles (
                id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
                no_vale       VARCHAR(40)  NOT NULL,
                folio         VARCHAR(40)  DEFAULT NULL,
                cantidad      DECIMAL(10,2) DEFAULT 0,
                precio_litro  DECIMAL(8,2)  DEFAULT 0,
                litros        DECIMAL(8,2)  DEFAULT 0,
                estado        ENUM('borrador','disponible','usado') NOT NULL DEFAULT 'borrador',
                viaje_id      INT UNSIGNED DEFAULT NULL,
                creado_por    INT UNSIGNED DEFAULT NULL,
                created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                used_at       DATETIME DEFAULT NULL,
                PRIMARY KEY (id),
                UNIQUE KEY uq_vale (no_vale),
                KEY idx_estado (estado),
                KEY idx_viaje (viaje_id),
                CONSTRAINT fk_vale_viaje   FOREIGN KEY (viaje_id)   REFERENCES viajes(id)   ON DELETE SET NULL,
                CONSTRAINT fk_vale_creador FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log('✅ Tabla vales_disponibles lista.');
    } catch (err) {
        console.warn('⚠️  No se pudo asegurar tabla solicitudes_finalizacion:', err.message);
    }
}

// Helper de migración: añade una columna si no existe (idempotente)
async function asegurarColumna(tabla, columna, defSQL) {
    try {
        const [rows] = await pool.query(
            `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
            [tabla, columna]
        );
        if (rows[0].n === 0) {
            await pool.query(`ALTER TABLE \`${tabla}\` ADD COLUMN \`${columna}\` ${defSQL}`);
            console.log(`✅ Columna añadida: ${tabla}.${columna}`);
        }
    } catch (err) {
        console.warn(`⚠️  asegurarColumna(${tabla}.${columna}):`, err.message);
    }
}

async function asegurarTablaMantenimiento() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS mantenimiento_observaciones (
                id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
                vehiculo_id      INT UNSIGNED NOT NULL,
                usuario_id       INT UNSIGNED NOT NULL,
                componente       VARCHAR(150) NOT NULL,
                codigo_ref       VARCHAR(50) NULL DEFAULT NULL,
                km_reporte       INT UNSIGNED NULL DEFAULT NULL,
                severidad        ENUM('baja','media','alta','critica') NOT NULL DEFAULT 'media',
                descripcion      TEXT NOT NULL,
                estado           ENUM('pendiente','en_revision','resuelto') NOT NULL DEFAULT 'pendiente',
                costo            DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                resolucion       TEXT NULL DEFAULT NULL,
                fecha_resolucion DATETIME NULL DEFAULT NULL,
                created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                INDEX idx_mant_vehiculo (vehiculo_id),
                INDEX idx_mant_estado (estado),
                INDEX idx_mant_severidad (severidad),
                CONSTRAINT fk_mant_vehiculo FOREIGN KEY (vehiculo_id) REFERENCES vehiculos(id) ON DELETE CASCADE,
                CONSTRAINT fk_mant_usuario  FOREIGN KEY (usuario_id)  REFERENCES usuarios(id)  ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        await asegurarColumna('mantenimiento_observaciones', 'codigo_ref', 'VARCHAR(50) NULL DEFAULT NULL AFTER componente');
        await asegurarColumna('mantenimiento_observaciones', 'km_reporte', 'INT UNSIGNED NULL DEFAULT NULL AFTER codigo_ref');
        await asegurarColumna('mantenimiento_observaciones', 'resolucion', 'TEXT NULL DEFAULT NULL');
        await asegurarColumna('mantenimiento_observaciones', 'fecha_resolucion', 'DATETIME NULL DEFAULT NULL');
        await asegurarColumna('mantenimiento_observaciones', 'created_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
        console.log('✅ Tabla mantenimiento_observaciones lista.');
    } catch (err) {
        console.warn('⚠️  asegurarTablaMantenimiento:', err.message);
    }
}

// =====================================================================
//  Módulo A — Vencimientos: asegurar tabla mantenimiento_programado
// =====================================================================
async function asegurarVencimientos() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS mantenimiento_programado (
                id              INT UNSIGNED     NOT NULL AUTO_INCREMENT,
                vehiculo_id     INT UNSIGNED     NOT NULL,
                componente      VARCHAR(100)     NOT NULL,
                intervalo_km    INT UNSIGNED     NULL DEFAULT NULL,
                intervalo_meses TINYINT UNSIGNED NULL DEFAULT NULL,
                ultimo_km       INT UNSIGNED     NULL DEFAULT NULL,
                ultima_fecha    DATE             NULL DEFAULT NULL,
                created_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                INDEX idx_mp_vehiculo (vehiculo_id),
                CONSTRAINT fk_mp_vehiculo
                    FOREIGN KEY (vehiculo_id) REFERENCES vehiculos(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log('✅ Tabla mantenimiento_programado lista.');
    } catch (err) {
        console.warn('⚠️  asegurarVencimientos:', err.message);
    }
}

// =====================================================================
//  Helpers de estado de comisión
//  Centralizamos las variantes para tolerar "En comisión" vs "En comision".
// =====================================================================
function estadoVariantes(estado) {
    if (!estado) return [];
    const e = String(estado).trim();
    const map = {
        'En comisión':            ['En comisión', 'En comision'],
        'En comision':            ['En comisión', 'En comision'],
        'Solicitud finalización': ['Solicitud finalización', 'Solicitud finalizacion'],
        'Solicitud finalizacion': ['Solicitud finalización', 'Solicitud finalizacion']
    };
    return map[e] || [e];
}

const ESTADOS_COMISION_ACTIVA = [
    'En comisión',
    'En comision',
    'Solicitud finalización',
    'Solicitud finalizacion'
];


// =====================================================================
//  Helpers de normalización / errores duplicados
//  Evitan falsos positivos y mensajes genéricos cuando MySQL devuelve
//  ER_DUP_ENTRY por una llave distinta a la que el usuario está viendo.
// =====================================================================
function limpiarTextoBD(valor) {
    if (valor === undefined || valor === null) return '';
    return String(valor).trim().replace(/\s+/g, ' ');
}

function normalizarPlacas(valor) {
    return limpiarTextoBD(valor).toUpperCase();
}

function normalizarSerie(valor) {
    const limpia = limpiarTextoBD(valor).toUpperCase();
    return limpia || null;
}

function noEconomicoTemporal() {
    // VARCHAR(10), único y corto. Se cambia inmediatamente por el ID real.
    return ('T' + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6)).slice(0, 10).toUpperCase();
}

function textoErrorDuplicado(err) {
    return String(err?.sqlMessage || err?.message || '').toLowerCase();
}

function mensajeDuplicadoVehiculo(err) {
    const msg = textoErrorDuplicado(err);
    if (msg.includes('uq_vehiculos_placas') || msg.includes('placas')) {
        return 'Ya existe un vehículo con esas placas.';
    }
    if (msg.includes('uq_vehiculos_serie') || msg.includes('no_serie') || msg.includes('serie')) {
        return 'Ya existe un vehículo con ese número de serie.';
    }
    if (msg.includes('uq_vehiculos_eco') || msg.includes('no_economico')) {
        return 'El número económico ya existe. Intenta guardar de nuevo.';
    }
    return 'Ya existe otro vehículo con esos datos únicos.';
}

function mensajeDuplicadoVale(err) {
    const msg = textoErrorDuplicado(err);
    if (msg.includes('uq_vale') || msg.includes('no_vale')) {
        return 'Ya existe un vale con ese número.';
    }
    return 'Ya existe un vale con esos datos.';
}

async function obtenerComisionActivaVehiculo(vehiculoId, excluirViajeId = null) {
    const vid = parseInt(vehiculoId, 10);
    if (!vid) return null;

    let sql = `
        SELECT
            v.id,
            v.estado,
            v.lugar_destino,
            DATE_FORMAT(v.fecha_inicio, '%Y-%m-%d') AS fecha_inicio,
            ve.no_economico,
            ve.placas
        FROM viajes v
        LEFT JOIN vehiculos ve ON ve.id = v.vehiculo_id
        WHERE v.vehiculo_id = ?
          AND v.estado IN (${ESTADOS_COMISION_ACTIVA.map(() => '?').join(',')})
    `;
    const params = [vid, ...ESTADOS_COMISION_ACTIVA];

    const excluirId = parseInt(excluirViajeId, 10);
    if (excluirId) {
        sql += ' AND v.id <> ?';
        params.push(excluirId);
    }

    sql += ' ORDER BY v.fecha_inicio DESC, v.id DESC LIMIT 1';

    const [rows] = await pool.query(sql, params);
    return rows[0] || null;
}

// =====================================================================
//  GENERACIÓN AUTOMÁTICA DE NÚMERO DE OFICIO
// =====================================================================
//  Formato: CM-DD-MM-YY-NN
//   CM = "Comisión"
//   DD = día (con cero a la izquierda)
//   MM = mes (con cero a la izquierda)
//   YY = últimos 2 dígitos del año
//   NN = consecutivo del día (01, 02, ...). Reinicia cada día.
//
//  Ejemplos:
//   - Primera comisión del 19/05/2026 → CM-19-05-26-01
//   - Segunda del mismo día           → CM-19-05-26-02
//   - Primera del 20/05/2026          → CM-20-05-26-01
//
//  El consecutivo se obtiene contando cuántos `no_oficio` con el mismo
//  prefijo (CM-DD-MM-YY-) ya existen hoy en la tabla `viajes`, y sumando 1.
// =====================================================================
async function generarNumeroOficio(connOrPool) {
    const conn = connOrPool || pool;
    const ahora = new Date();
    const dd = String(ahora.getDate()).padStart(2, '0');
    const mm = String(ahora.getMonth() + 1).padStart(2, '0');
    const yy = String(ahora.getFullYear()).slice(-2);
    const prefijo = `CM-${dd}-${mm}-${yy}-`;

    // Buscar el consecutivo más alto generado hoy con este prefijo
    const [rows] = await conn.query(
        `SELECT no_oficio FROM viajes
         WHERE no_oficio LIKE ?
         ORDER BY id DESC
         LIMIT 1`,
        [prefijo + '%']
    );

    let siguiente = 1;
    if (rows.length > 0 && rows[0].no_oficio) {
        // Extraer el NN de la cadena CM-DD-MM-YY-NN
        const partes = rows[0].no_oficio.split('-');
        const ultimo = parseInt(partes[partes.length - 1], 10);
        if (!isNaN(ultimo)) siguiente = ultimo + 1;
    }

    return prefijo + String(siguiente).padStart(2, '0');
}

// =====================================================================
//                              ENDPOINTS
// =====================================================================

// ============== LOGIN ==============
// El front envía "username" que puede ser "Aldair", "Diego" o un email.
// Buscamos por: email exacto, o por la primera parte del email (antes de @)
// para mantener compatibilidad con el login viejo que usaba "Aldair"/"Diego".
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username) {
            return res.status(400).json({ ok: false, error: 'El campo usuario es requerido.' });
        }

        // Permitir login por email completo o por nombre (busca en la parte local del email)
        const [rows] = await pool.query(
            `SELECT u.id, u.nombre, u.apellidos, u.email, u.password_hash, u.activo,
                    u.rol_id, u.departamento, u.cargo, u.foto_perfil, u.primer_acceso,
                    r.nombre AS rol
             FROM usuarios u
             JOIN roles r ON r.id = u.rol_id
             WHERE u.email = ?
                OR SUBSTRING_INDEX(u.email, '@', 1) = ?
                OR u.nombre = ?
             LIMIT 1`,
            [username, username, username]
        );

        if (rows.length === 0) {
            return res.status(401).json({ ok: false, error: 'Usuario no encontrado.' });
        }

        const u = rows[0];
        if (!u.activo) {
            return res.status(403).json({ ok: false, error: 'Cuenta desactivada.' });
        }

        // La contraseña siempre se valida. Si es primer acceso, debe coincidir
        // con la contraseña inicial asignada por el administrador.
        if (!password) {
            return res.status(400).json({ ok: false, error: 'La contraseña es requerida.' });
        }

        // Verificar contraseña: aceptar bcrypt y, como respaldo, texto plano
        // (por si el SQL tenía '123456' literal en password_hash)
        let okPass = false;
        if (u.password_hash && u.password_hash.startsWith('$2')) {
            okPass = await bcrypt.compare(password, u.password_hash);
        } else {
            okPass = (u.password_hash === password);
        }

        if (!okPass) {
            return res.status(401).json({ ok: false, error: 'Contraseña incorrecta.' });
        }

        // Primer acceso: ya validó la contraseña inicial; ahora se manda al flujo
        // donde debe registrar Gmail de recuperación y cambiarla por una propia.
        if (u.primer_acceso) {
            return res.json({
                ok: true,
                primer_acceso: true,
                usuario: {
                    id: u.id,
                    nombre: u.nombre,
                    apellidos: u.apellidos,
                    email: u.email,
                    rol: u.rol,
                    rol_id: u.rol_id,
                    departamento: u.departamento,
                    cargo: u.cargo,
                    foto_perfil: u.foto_perfil
                }
            });
        }

        await registrarBitacora(u.id, 'Inicio de sesión', 'auth', null, req.ip);

        res.json({
            ok: true,
            usuario: {
                id: u.id,
                nombre: u.nombre,
                apellidos: u.apellidos,
                email: u.email,
                rol: u.rol,
                rol_id: u.rol_id,
                departamento: u.departamento,
                cargo: u.cargo,
                foto_perfil: u.foto_perfil
            }
        });
    } catch (err) {
        console.error('Error /api/login:', err);
        res.status(500).json({ ok: false, error: 'Error interno del servidor.' });
    }
});


// ============== RECUPERACIÓN DE CONTRASEÑA (FLUJO POR CORREO) ==============
// Flujo profesional estilo Facebook/YouTube:
//   1) El usuario captura su correo en index.html.
//   2) /api/solicitar-recuperacion genera un token único, lo guarda hasheado
//      en la BD con expiración de 15 min y manda un correo con el enlace.
//   3) El usuario abre el enlace → restablecer-password.html valida el token
//      con /api/validar-token-recuperacion.
//   4) Captura su nueva contraseña → /api/restablecer-password actualiza la
//      contraseña, invalida el token y registra en bitácora.
//
// Por seguridad, el endpoint /api/solicitar-recuperacion siempre devuelve
// ok:true (no revela si un correo está registrado o no).

const crypto = require('crypto');

// Garantiza que la tabla password_reset_tokens exista al arrancar
async function asegurarTablaResetTokens() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
                usuario_id   INT UNSIGNED NOT NULL,
                token_hash   VARCHAR(64) NOT NULL,
                expira_en    DATETIME    NOT NULL,
                usado_en     DATETIME        NULL DEFAULT NULL,
                ip_solicitud VARCHAR(45)     NULL DEFAULT NULL,
                created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY uq_prt_token (token_hash),
                KEY idx_prt_usuario (usuario_id),
                CONSTRAINT fk_prt_usuario FOREIGN KEY (usuario_id)
                    REFERENCES usuarios (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
    } catch (err) {
        console.warn('⚠️  asegurarTablaResetTokens:', err.message);
    }
}

// Rate-limit para evitar abuso del endpoint que manda correos
const limiterRecuperacion = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 5,                    // 5 solicitudes por IP cada 15 min
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: 'Demasiados intentos. Espera unos minutos antes de volver a solicitar un enlace.' }
});

// ── PASO 1: SOLICITAR RECUPERACIÓN ───────────────────────────────────
//  Recibe { email }. Siempre responde ok:true para no revelar qué correos
//  están registrados. Si el correo existe y la cuenta está activa, envía
//  un correo con el enlace que contiene el token en claro.
app.post('/api/solicitar-recuperacion', limiterRecuperacion, async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ ok: false, error: 'Captura un correo electrónico válido.' });
        }

        // Buscar usuario por correo
        const [rows] = await pool.query(
            `SELECT id, nombre, apellidos, email, activo
             FROM usuarios
             WHERE email = ?
             LIMIT 1`,
            [email]
        );

        // Decisión UX: avisar claramente si el correo no está registrado.
        // (Trade-off: facilita la enumeración de cuentas. Aceptable para
        //  un sistema interno donde los usuarios se conocen entre sí.)
        if (rows.length === 0) {
            return res.status(404).json({
                ok: false,
                error: 'Ese correo no está registrado en SIGEPAV. Verifica que esté bien escrito o contacta al administrador.'
            });
        }

        // Cuenta desactivada: tampoco mandamos correo, pero el mensaje es distinto
        if (!rows[0].activo) {
            return res.status(403).json({
                ok: false,
                error: 'Tu cuenta está desactivada. Contacta al administrador del sistema.'
            });
        }

        const usuario = rows[0];

        // Generar token: 32 bytes aleatorios → 64 chars hex (en claro va en el correo,
        // en la BD solo guardamos el hash SHA-256 para no exponerlo si se filtra la BD)
        const tokenClaro = crypto.randomBytes(32).toString('hex');
        const tokenHash  = crypto.createHash('sha256').update(tokenClaro).digest('hex');

        // Expiración: 15 minutos desde ahora
        const expira = new Date(Date.now() + 15 * 60 * 1000);

        // Invalidar tokens anteriores no usados del mismo usuario (uno a la vez)
        await pool.query(
            `UPDATE password_reset_tokens
             SET usado_en = NOW()
             WHERE usuario_id = ? AND usado_en IS NULL`,
            [usuario.id]
        );

        // Guardar token nuevo
        await pool.query(
            `INSERT INTO password_reset_tokens (usuario_id, token_hash, expira_en, ip_solicitud)
             VALUES (?, ?, ?, ?)`,
            [usuario.id, tokenHash, expira, req.ip || null]
        );

        // Construir enlace de recuperación.
        // El parámetro `ngrok-skip-browser-warning=true` evita que ngrok
        // (en plan gratuito) muestre la página intermedia de advertencia
        // cuando el usuario hace clic en el enlace desde el correo.
        // En dominios que no son ngrok, este parámetro simplemente se ignora.
        const baseUrl    = (BASE_URL || 'https://oda-peachier-terrie.ngrok-free.dev').replace(/\/+$/, '');
        const enlaceReset = `${baseUrl}/restablecer-password.html?token=${tokenClaro}&ngrok-skip-browser-warning=true`;

        // Mandar correo (no bloquea la respuesta — si el correo falla, el usuario
        // ya recibió el mensaje genérico igualmente; el error queda en logs)
        enviarCorreoRecuperacion({
            to:      usuario.email,
            nombre:  usuario.nombre,
            enlace:  enlaceReset,
            minutos: 15
        }).catch(err => console.warn('⚠️  Correo de recuperación falló:', err.message));

        await registrarBitacora(
            usuario.id,
            `Solicitud de recuperación de contraseña`,
            'auth',
            usuario.id,
            req.ip
        );

        return res.json({
            ok: true,
            mensaje: 'Te enviamos un correo con instrucciones para restablecer tu contraseña. Revisa tu bandeja de entrada.'
        });
    } catch (err) {
        console.error('Error /api/solicitar-recuperacion:', err);
        return res.status(500).json({ ok: false, error: 'Error interno al procesar la solicitud. Inténtalo más tarde.' });
    }
});

// ── PASO 2: VALIDAR TOKEN (cuando abre el enlace del correo) ─────────
//  El frontend llama a este endpoint al cargar restablecer-password.html
//  para saber si el token es válido antes de mostrar el formulario.
app.get('/api/validar-token-recuperacion', async (req, res) => {
    try {
        const tokenClaro = String(req.query.token || '').trim();
        if (!tokenClaro || tokenClaro.length < 32) {
            return res.status(400).json({ ok: false, error: 'Token no válido.' });
        }

        const tokenHash = crypto.createHash('sha256').update(tokenClaro).digest('hex');

        const [rows] = await pool.query(
            `SELECT t.id, t.usuario_id, t.expira_en, t.usado_en,
                    u.nombre, u.email, u.activo
             FROM password_reset_tokens t
             JOIN usuarios u ON u.id = t.usuario_id
             WHERE t.token_hash = ?
             LIMIT 1`,
            [tokenHash]
        );

        if (rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'El enlace no es válido. Solicita uno nuevo.' });
        }

        const t = rows[0];

        if (t.usado_en) {
            return res.status(410).json({ ok: false, error: 'Este enlace ya fue utilizado. Solicita uno nuevo.' });
        }
        if (new Date(t.expira_en) < new Date()) {
            return res.status(410).json({ ok: false, error: 'El enlace expiró. Los enlaces duran 15 minutos por seguridad. Solicita uno nuevo.' });
        }
        if (!t.activo) {
            return res.status(403).json({ ok: false, error: 'La cuenta está desactivada. Contacta al administrador.' });
        }

        return res.json({
            ok: true,
            usuario: {
                // Devolvemos solo nombre y correo parcial (oculta dominio)
                nombre: t.nombre,
                // p.ej. "jua***@itszn.edu.mx" → mantenemos el dominio porque ya es público
                email_oculto: ocultarCorreo(t.email)
            }
        });
    } catch (err) {
        console.error('Error /api/validar-token-recuperacion:', err);
        res.status(500).json({ ok: false, error: 'Error interno al validar el enlace.' });
    }
});

// ── PASO 3: RESTABLECER CONTRASEÑA ───────────────────────────────────
//  Recibe { token, nuevaPassword, confirmar }. Si todo está bien,
//  actualiza la contraseña, marca el token como usado y registra bitácora.
app.post('/api/restablecer-password', async (req, res) => {
    try {
        const tokenClaro      = String(req.body.token || '').trim();
        const nuevaPassword   = String(req.body.nuevaPassword || '');
        const confirmar       = String(req.body.confirmar || '');

        if (!tokenClaro || !nuevaPassword || !confirmar) {
            return res.status(400).json({ ok: false, error: 'Faltan datos: token, contraseña y confirmación.' });
        }
        if (nuevaPassword.length < 8) {
            return res.status(400).json({ ok: false, error: 'La contraseña debe tener mínimo 8 caracteres.' });
        }
        if (!/[A-Za-z]/.test(nuevaPassword) || !/\d/.test(nuevaPassword)) {
            return res.status(400).json({ ok: false, error: 'La contraseña debe combinar letras y al menos un número.' });
        }
        if (nuevaPassword !== confirmar) {
            return res.status(400).json({ ok: false, error: 'Las contraseñas no coinciden.' });
        }

        const tokenHash = crypto.createHash('sha256').update(tokenClaro).digest('hex');

        const [rows] = await pool.query(
            `SELECT t.id, t.usuario_id, t.expira_en, t.usado_en,
                    u.email, u.activo
             FROM password_reset_tokens t
             JOIN usuarios u ON u.id = t.usuario_id
             WHERE t.token_hash = ?
             LIMIT 1`,
            [tokenHash]
        );

        if (rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'El enlace no es válido. Solicita uno nuevo.' });
        }
        const t = rows[0];
        if (t.usado_en) {
            return res.status(410).json({ ok: false, error: 'Este enlace ya fue utilizado.' });
        }
        if (new Date(t.expira_en) < new Date()) {
            return res.status(410).json({ ok: false, error: 'El enlace expiró. Solicita uno nuevo.' });
        }
        if (!t.activo) {
            return res.status(403).json({ ok: false, error: 'La cuenta está desactivada. Contacta al administrador.' });
        }

        // Actualizar contraseña y marcar token como usado en una transacción
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            const hash = await bcrypt.hash(nuevaPassword, 10);
            await conn.query(
                'UPDATE usuarios SET password_hash = ? WHERE id = ?',
                [hash, t.usuario_id]
            );
            await conn.query(
                'UPDATE password_reset_tokens SET usado_en = NOW() WHERE id = ?',
                [t.id]
            );
            // Invalidar cualquier otro token pendiente del mismo usuario por seguridad
            await conn.query(
                `UPDATE password_reset_tokens
                 SET usado_en = NOW()
                 WHERE usuario_id = ? AND usado_en IS NULL AND id <> ?`,
                [t.usuario_id, t.id]
            );
            await conn.commit();
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }

        await registrarBitacora(
            t.usuario_id,
            'Contraseña restablecida vía correo de recuperación',
            'auth',
            t.usuario_id,
            req.ip
        );

        // Correo de confirmación (no bloquea la respuesta)
        enviarCorreoConfirmacionCambio({
            to:    t.email,
            ip:    req.ip || 'desconocida',
            fecha: new Date()
        }).catch(err => console.warn('⚠️  Correo de confirmación falló:', err.message));

        return res.json({
            ok: true,
            mensaje: 'Tu contraseña se actualizó correctamente. Ya puedes iniciar sesión.'
        });
    } catch (err) {
        console.error('Error /api/restablecer-password:', err);
        res.status(500).json({ ok: false, error: 'Error interno al restablecer la contraseña.' });
    }
});

// ── Función auxiliar: oculta el correo para mostrarlo parcialmente ──
function ocultarCorreo(correo) {
    if (!correo) return '';
    const [user, dominio] = correo.split('@');
    if (!user || !dominio) return correo;
    const visible = user.slice(0, Math.min(3, user.length));
    return `${visible}${'*'.repeat(Math.max(3, user.length - 3))}@${dominio}`;
}

// ── Función auxiliar: enviar correo con enlace de recuperación ──────
async function enviarCorreoRecuperacion({ to, nombre, enlace, minutos }) {
    if (!process.env.MAIL_USER) {
        console.warn('⚠️  MAIL_USER no configurado. Correo de recuperación omitido.');
        console.warn(`   Enlace que se hubiera enviado: ${enlace}`);
        return;
    }
    await mailTransport.sendMail({
        from:    process.env.MAIL_FROM || 'SIGEPAV <no-reply@itszn.edu.mx>',
        to,
        subject: 'Restablece tu contraseña — SIGEPAV',
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:auto;background:#f1f5f9;padding:20px">
            <div style="background:linear-gradient(135deg,#0d2d6b 0%,#1e40af 100%);padding:32px 28px;border-radius:14px 14px 0 0;text-align:center">
              <div style="display:inline-block;background:rgba(255,255,255,.15);padding:14px;border-radius:50%;margin-bottom:12px">
                <span style="font-size:32px">🔐</span>
              </div>
              <h2 style="color:#fff;margin:0;font-size:22px;font-weight:700">Restablece tu contraseña</h2>
              <p style="color:rgba(255,255,255,.85);margin:6px 0 0;font-size:14px">SIGEPAV</p>
            </div>
            <div style="background:#fff;padding:32px 28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 14px 14px">
              <p style="font-size:15px;color:#0f172a;margin:0 0 14px">Hola <strong>${nombre}</strong>,</p>
              <p style="font-size:15px;color:#334155;line-height:1.6;margin:0 0 18px">
                Recibimos una solicitud para restablecer la contraseña de tu cuenta en
                <strong>SIGEPAV</strong>. Haz clic en el botón para crear una nueva contraseña:
              </p>
              <div style="text-align:center;margin:28px 0">
                <a href="${enlace}"
                   style="background:linear-gradient(135deg,#0d2d6b 0%,#1e40af 100%);color:#fff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;box-shadow:0 4px 12px rgba(13,45,107,.25)">
                  Restablecer mi contraseña
                </a>
              </div>
              <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:6px;margin:18px 0">
                <p style="margin:0;font-size:13px;color:#78350f">
                  <strong>⏱ Este enlace expira en ${minutos} minutos.</strong> Por tu seguridad,
                  solo puede usarse una vez.
                </p>
              </div>
              <p style="font-size:13px;color:#64748b;line-height:1.6;margin:18px 0 0">
                Si el botón no funciona, copia y pega esta dirección en tu navegador:
              </p>
              <p style="font-family:monospace;font-size:12px;background:#f1f5f9;padding:10px;border-radius:6px;word-break:break-all;color:#475569;margin:8px 0 0">
                ${enlace}
              </p>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
              <p style="color:#94a3b8;font-size:12px;line-height:1.6;margin:0">
                <strong>¿No fuiste tú?</strong> Si no solicitaste este cambio, ignora este correo.
                Tu contraseña seguirá igual. Considera avisar al administrador si crees que
                alguien intenta acceder a tu cuenta.
              </p>
              <p style="color:#cbd5e1;font-size:11px;margin:16px 0 0;text-align:center">
                Este es un correo automático. Por favor no respondas a este mensaje.
              </p>
            </div>
          </div>
        `
    });
}

// ── Función auxiliar: confirmar al usuario que su contraseña cambió ──
async function enviarCorreoConfirmacionCambio({ to, ip, fecha }) {
    if (!process.env.MAIL_USER) return;
    const fechaTxt = fecha.toLocaleString('es-MX', {
        dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Mexico_City'
    });
    await mailTransport.sendMail({
        from:    process.env.MAIL_FROM || 'SIGEPAV <no-reply@itszn.edu.mx>',
        to,
        subject: 'Tu contraseña fue cambiada — SIGEPAV',
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:auto;background:#f1f5f9;padding:20px">
            <div style="background:linear-gradient(135deg,#059669 0%,#10b981 100%);padding:28px;border-radius:14px 14px 0 0;text-align:center">
              <div style="display:inline-block;background:rgba(255,255,255,.15);padding:14px;border-radius:50%;margin-bottom:12px">
                <span style="font-size:32px">✅</span>
              </div>
              <h2 style="color:#fff;margin:0;font-size:22px;font-weight:700">Contraseña actualizada</h2>
            </div>
            <div style="background:#fff;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 14px 14px">
              <p style="font-size:15px;color:#334155;line-height:1.6;margin:0 0 16px">
                Te confirmamos que la contraseña de tu cuenta SIGEPAV fue cambiada exitosamente.
              </p>
              <table style="background:#f8fafc;border-radius:8px;padding:6px;width:100%;border-collapse:collapse;margin:14px 0">
                <tr>
                  <td style="color:#64748b;font-size:13px;padding:8px 12px;width:40%">Fecha</td>
                  <td style="font-weight:600;font-size:13px;padding:8px 12px;color:#0f172a">${fechaTxt}</td>
                </tr>
                <tr>
                  <td style="color:#64748b;font-size:13px;padding:8px 12px;border-top:1px solid #e2e8f0">IP de la solicitud</td>
                  <td style="font-family:monospace;font-size:12px;padding:8px 12px;color:#0f172a;border-top:1px solid #e2e8f0">${ip}</td>
                </tr>
              </table>
              <div style="background:#fee2e2;border-left:4px solid #dc2626;padding:14px 16px;border-radius:6px;margin:18px 0">
                <p style="margin:0;font-size:13px;color:#7f1d1d;line-height:1.5">
                  <strong>¿No fuiste tú?</strong> Contacta inmediatamente al administrador
                  del sistema para proteger tu cuenta.
                </p>
              </div>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
              <p style="color:#cbd5e1;font-size:11px;margin:0;text-align:center">
                SIGEPAV<br>
                Este es un correo automático. Por favor no respondas a este mensaje.
              </p>
            </div>
          </div>
        `
    });
}

// ── COMPATIBILIDAD: endpoint viejo /api/recuperar-password ──────────
//  Lo dejamos como redirección amable por si quedó cacheado en algún cliente.
//  Devuelve un error guiando al nuevo flujo.
app.post('/api/recuperar-password', (req, res) => {
    res.status(410).json({
        ok: false,
        error: 'Este flujo cambió. Ahora la recuperación se hace por correo. Usa la opción "¿Olvidaste tu contraseña?" en el login.'
    });
});

// ============== USUARIOS ==============
app.get('/api/usuarios', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT u.id, u.nombre, u.apellidos, u.email, u.activo, u.rol_id, r.nombre AS rol,
                    u.departamento, u.cargo, u.foto_perfil, u.created_at
             FROM usuarios u
             JOIN roles r ON r.id = u.rol_id
             ORDER BY u.id`
        );
        res.json({ ok: true, usuarios: rows });
    } catch (err) {
        console.error('Error /api/usuarios:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/usuarios', subirFotoPerfil, async (req, res) => {
    try {
        const { nombre, apellidos, email, rol, departamento, cargo, password_inicial } = req.body;
        if (!nombre || !email) {
            return res.status(400).json({ ok: false, error: 'nombre y email son obligatorios.' });
        }
        if (!password_inicial || String(password_inicial).length < 6) {
            return res.status(400).json({ ok: false, error: 'La contraseña inicial debe tener al menos 6 caracteres.' });
        }

        const rol_id = (rol === 'admin' || rol === 'administrador') ? 1 : 2;
        // El admin asigna una contraseña inicial; el usuario debe cambiarla en primer acceso.
        const passwordHash = await bcrypt.hash(String(password_inicial), 10);
        const fotoPerfil = req.file ? `uploads/perfiles/${req.file.filename}` : null;

        const [r] = await pool.query(
            `INSERT INTO usuarios (nombre, apellidos, email, password_hash, rol_id, departamento, cargo, foto_perfil, activo, primer_acceso)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
            [nombre, apellidos || null, email, passwordHash, rol_id, departamento || null, cargo || null, fotoPerfil]
        );

        await registrarBitacora(null, `Usuario creado: ${email}`, 'usuarios', r.insertId, req.ip);
        res.json({ ok: true, id: r.insertId, foto_perfil: fotoPerfil });
    } catch (err) {
        if (req.file) {
            try { fs.unlinkSync(req.file.path); } catch (_) {}
        }
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ ok: false, error: 'Ya existe un usuario con ese correo.' });
        }
        console.error('Error POST /api/usuarios:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ── EDICIÓN ADMIN: permite al administrador editar sus datos y los de otros usuarios ──
// Campos editables desde Agregar.html: nombre de usuario, nombre completo, correo,
// rol, departamento, cargo y foto opcional.
app.put('/api/usuarios/:id/admin', subirFotoPerfil, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            if (req.file) borrarArchivoPerfilSeguro(`uploads/perfiles/${req.file.filename}`);
            return res.status(400).json({ ok: false, error: 'Usuario inválido.' });
        }

        const nombre = String(req.body.nombre || '').trim();
        const apellidos = String(req.body.apellidos || '').trim();
        const email = String(req.body.email || '').trim().toLowerCase();
        const rol = String(req.body.rol || 'usuario').trim().toLowerCase();
        const departamento = String(req.body.departamento || '').trim();
        const cargo = String(req.body.cargo || '').trim();
        const adminEditorId = Number(req.body.admin_id || 0) || null;

        if (!nombre || nombre.length < 3) {
            if (req.file) borrarArchivoPerfilSeguro(`uploads/perfiles/${req.file.filename}`);
            return res.status(400).json({ ok: false, error: 'El nombre de usuario debe tener al menos 3 caracteres.' });
        }
        if (!/^[a-zA-Z0-9._-]+$/.test(nombre)) {
            if (req.file) borrarArchivoPerfilSeguro(`uploads/perfiles/${req.file.filename}`);
            return res.status(400).json({ ok: false, error: 'El nombre de usuario solo puede contener letras, números, puntos, guiones o guion bajo.' });
        }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            if (req.file) borrarArchivoPerfilSeguro(`uploads/perfiles/${req.file.filename}`);
            return res.status(400).json({ ok: false, error: 'Correo electrónico no válido.' });
        }

        const rol_id = (rol === 'admin' || rol === 'administrador' || rol === '1') ? 1 : 2;

        const [actualRows] = await pool.query(
            `SELECT u.id, u.email, u.foto_perfil
             FROM usuarios u
             WHERE u.id = ?
             LIMIT 1`,
            [id]
        );
        if (actualRows.length === 0) {
            if (req.file) borrarArchivoPerfilSeguro(`uploads/perfiles/${req.file.filename}`);
            return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });
        }

        const fotoPerfil = req.file ? `uploads/perfiles/${req.file.filename}` : actualRows[0].foto_perfil;

        await pool.query(
            `UPDATE usuarios
             SET nombre = ?, apellidos = ?, email = ?, rol_id = ?, departamento = ?, cargo = ?, foto_perfil = ?
             WHERE id = ?`,
            [nombre, apellidos || null, email, rol_id, departamento || null, cargo || null, fotoPerfil || null, id]
        );

        if (req.file && actualRows[0].foto_perfil) {
            borrarArchivoPerfilSeguro(actualRows[0].foto_perfil);
        }

        const [rows] = await pool.query(
            `SELECT u.id, u.nombre, u.apellidos, u.email, u.activo, u.rol_id, r.nombre AS rol,
                    u.departamento, u.cargo, u.foto_perfil, u.created_at
             FROM usuarios u
             JOIN roles r ON r.id = u.rol_id
             WHERE u.id = ?
             LIMIT 1`,
            [id]
        );

        await registrarBitacora(adminEditorId, `Usuario editado: ${email}`, 'usuarios', id, req.ip);
        res.json({ ok: true, usuario: rows[0] });
    } catch (err) {
        if (req.file) borrarArchivoPerfilSeguro(`uploads/perfiles/${req.file.filename}`);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ ok: false, error: 'Ya existe otro usuario con ese correo.' });
        }
        console.error('Error PUT /api/usuarios/:id/admin:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ── ACTUALIZAR PERFIL: nombre, apellidos, correo institucional, gmail de recuperación ──
app.put('/api/usuarios/:id/perfil', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, apellidos, email, correo_gmail } = req.body;
        if (!nombre || !email) {
            return res.status(400).json({ ok: false, error: 'nombre y email son obligatorios.' });
        }
        if (correo_gmail && !correo_gmail.toLowerCase().includes('@gmail.com')) {
            return res.status(400).json({ ok: false, error: 'El correo de recuperación debe ser Gmail.' });
        }

        await pool.query(
            `UPDATE usuarios SET nombre = ?, apellidos = ?, email = ?, correo_gmail = ? WHERE id = ?`,
            [nombre, apellidos || null, email, correo_gmail || null, id]
        );
        await registrarBitacora(id, 'Perfil actualizado', 'usuarios', id, req.ip);
        res.json({ ok: true });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ ok: false, error: 'Ese correo ya está en uso.' });
        }
        console.error('Error PUT /api/usuarios/:id/perfil:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ── PRIMER ACCESO: el usuario configura correo institucional, gmail y contraseña ──
app.post('/api/usuarios/:id/primer-acceso', async (req, res) => {
    try {
        const { id } = req.params;
        const { correo_institucional, correo_gmail, password } = req.body;

        if (!correo_institucional || !correo_gmail || !password) {
            return res.status(400).json({ ok: false, error: 'Todos los campos son obligatorios.' });
        }
        if (password.length < 6) {
            return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 6 caracteres.' });
        }
        if (!correo_gmail.toLowerCase().includes('@gmail.com')) {
            return res.status(400).json({ ok: false, error: 'El correo de recuperación debe ser una cuenta Gmail.' });
        }

        // Verificar que el usuario existe y está en primer_acceso
        const [rows] = await pool.query('SELECT id, primer_acceso, password_hash FROM usuarios WHERE id = ? AND activo = 1 LIMIT 1', [id]);
        if (rows.length === 0) return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });
        if (!rows[0].primer_acceso) return res.status(400).json({ ok: false, error: 'Este usuario ya completó su configuración inicial.' });

        const usuarioPrimerAcceso = rows[0];
        if (usuarioPrimerAcceso.password_hash) {
            let mismaInicial = false;
            if (String(usuarioPrimerAcceso.password_hash).startsWith('$2')) {
                mismaInicial = await bcrypt.compare(password, usuarioPrimerAcceso.password_hash);
            } else {
                mismaInicial = (usuarioPrimerAcceso.password_hash === password);
            }
            if (mismaInicial) {
                return res.status(400).json({ ok: false, error: 'La nueva contraseña debe ser distinta a la contraseña inicial.' });
            }
        }

        const hash = await bcrypt.hash(password, 10);
        await pool.query(
            `UPDATE usuarios SET email = ?, correo_gmail = ?, password_hash = ?, primer_acceso = 0 WHERE id = ?`,
            [correo_institucional, correo_gmail, hash, id]
        );

        await registrarBitacora(id, 'Primer acceso: configuración completada', 'auth', null, req.ip);
        res.json({ ok: true });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ ok: false, error: 'Ese correo institucional ya está registrado.' });
        }
        console.error('Error POST /api/usuarios/:id/primer-acceso:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});


function borrarArchivoPerfilSeguro(rutaRelativa) {
    if (!rutaRelativa) return;
    try {
        const limpia = String(rutaRelativa).replace(/^\/+/, '');
        if (!limpia.startsWith('uploads/perfiles/')) return;
        const rutaAbs = path.join(__dirname, limpia);
        const base = path.join(__dirname, 'uploads', 'perfiles');
        if (!rutaAbs.startsWith(base)) return;
        if (fs.existsSync(rutaAbs)) fs.unlinkSync(rutaAbs);
    } catch (_) {}
}

app.put('/api/usuarios/:id/foto', subirFotoPerfil, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const usuarioBody = Number(req.body && req.body.usuario_id);
        if (!Number.isInteger(id) || id <= 0) {
            if (req.file) borrarArchivoPerfilSeguro(`uploads/perfiles/${req.file.filename}`);
            return res.status(400).json({ ok: false, error: 'Usuario inválido.' });
        }
        // Como el sistema usa sesión local en el front y no JWT, al menos evitamos
        // cambios accidentales a otro id desde el menú de perfil.
        if (usuarioBody && usuarioBody !== id) {
            if (req.file) borrarArchivoPerfilSeguro(`uploads/perfiles/${req.file.filename}`);
            return res.status(403).json({ ok: false, error: 'Solo puedes cambiar tu propia foto de perfil.' });
        }
        if (!req.file) {
            return res.status(400).json({ ok: false, error: 'Selecciona una imagen JPG, PNG o WEBP.' });
        }

        const [rows] = await pool.query(
            'SELECT id, email, foto_perfil FROM usuarios WHERE id = ? AND activo = 1 LIMIT 1',
            [id]
        );
        if (rows.length === 0) {
            borrarArchivoPerfilSeguro(`uploads/perfiles/${req.file.filename}`);
            return res.status(404).json({ ok: false, error: 'Usuario no encontrado o inactivo.' });
        }

        const fotoPerfil = `uploads/perfiles/${req.file.filename}`;
        await pool.query('UPDATE usuarios SET foto_perfil = ? WHERE id = ?', [fotoPerfil, id]);
        borrarArchivoPerfilSeguro(rows[0].foto_perfil);
        await registrarBitacora(id, `Foto de perfil actualizada: ${rows[0].email}`, 'usuarios', id, req.ip);

        res.json({ ok: true, foto_perfil: fotoPerfil });
    } catch (err) {
        if (req.file) borrarArchivoPerfilSeguro(`uploads/perfiles/${req.file.filename}`);
        console.error('Error PUT /api/usuarios/:id/foto:', err);
        res.status(500).json({ ok: false, error: 'No se pudo actualizar la foto de perfil.' });
    }
});


// ── CAMBIAR CONTRASEÑA DEL PERFIL ───────────────────────────────────
app.put('/api/usuarios/:id/password', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { password_actual, password_nuevo } = req.body || {};
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ ok: false, error: 'Usuario inválido.' });
        }
        if (!password_actual || !password_nuevo) {
            return res.status(400).json({ ok: false, error: 'Captura la contraseña actual y la nueva contraseña.' });
        }
        if (String(password_nuevo).length < 6) {
            return res.status(400).json({ ok: false, error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
        }

        const [rows] = await pool.query(
            'SELECT id, email, password_hash FROM usuarios WHERE id = ? AND activo = 1 LIMIT 1',
            [id]
        );
        if (rows.length === 0) return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });

        const u = rows[0];
        let okPass = false;
        if (u.password_hash && u.password_hash.startsWith('$2')) {
            okPass = await bcrypt.compare(password_actual, u.password_hash);
        } else {
            okPass = (u.password_hash === password_actual);
        }
        if (!okPass) return res.status(401).json({ ok: false, error: 'La contraseña actual no coincide.' });

        const nuevoHash = await bcrypt.hash(password_nuevo, 10);
        await pool.query('UPDATE usuarios SET password_hash = ?, primer_acceso = 0 WHERE id = ?', [nuevoHash, id]);
        await registrarBitacora(id, `Contraseña actualizada: ${u.email}`, 'usuarios', id, req.ip);
        res.json({ ok: true });
    } catch (err) {
        console.error('Error PUT /api/usuarios/:id/password:', err);
        res.status(500).json({ ok: false, error: 'No se pudo cambiar la contraseña.' });
    }
});

app.delete('/api/usuarios/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        // Borrado lógico (activo = 0) para no romper FKs
        const [r] = await pool.query('UPDATE usuarios SET activo = 0 WHERE id = ?', [id]);
        if (r.affectedRows === 0) {
            return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });
        }
        await registrarBitacora(null, `Usuario desactivado id=${id}`, 'usuarios', id, req.ip);
        res.json({ ok: true });
    } catch (err) {
        console.error('Error DELETE /api/usuarios:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ============== VEHÍCULOS ==============
app.get('/api/vehiculos', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id, no_economico, marca, linea, modelo, tipo, capacidad,
                    color, no_serie, placas, combustible, km_actual,
                    fecha_tenencia, fecha_verificacion, fecha_seguro,
                    qr_token, qr_image_path
             FROM vehiculos
             WHERE activo = 1
             ORDER BY no_economico`
        );
        res.json({ ok: true, vehiculos: rows });
    } catch (err) {
        console.error('Error /api/vehiculos:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ── KM TOTALES Y ESTADÍSTICAS DE MANTENIMIENTO POR VEHÍCULO ──
app.get('/api/vehiculos/:id/km', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const [[veh]] = await pool.query(
            `SELECT id, no_economico, marca, linea, modelo, km_actual FROM vehiculos WHERE id = ? AND activo = 1`,
            [id]
        );
        if (!veh) return res.status(404).json({ ok: false, error: 'Vehículo no encontrado.' });

        // Historial de comisiones con km
        const [comisiones] = await pool.query(`
            SELECT v.id, v.lugar_destino, v.km_inicial, v.km_final,
                   GREATEST(COALESCE(v.km_final,0) - COALESCE(v.km_inicial,0), 0) AS km_viaje,
                   v.fecha_inicio, v.fecha_fin, v.estado,
                   u.nombre AS conductor, u.apellidos AS conductor_ap
            FROM viajes v
            LEFT JOIN usuarios u ON u.id = v.usuario_id
            WHERE v.vehiculo_id = ? AND v.km_inicial IS NOT NULL
            ORDER BY v.fecha_inicio DESC
        `, [id]);

        const kmTotalSistema = comisiones.reduce((s, c) => s + (Number(c.km_viaje) || 0), 0);
        const totalComisiones = comisiones.length;

        // Último mantenimiento registrado
        const [mantenimientos] = await pool.query(`
            SELECT componente, descripcion, estado, severidad, costo, resolucion, created_at
            FROM mantenimiento_observaciones
            WHERE vehiculo_id = ?
            ORDER BY created_at DESC
            LIMIT 20
        `, [id]);

        res.json({
            ok: true,
            vehiculo: veh,
            km_actual: veh.km_actual,
            km_recorridos_sistema: kmTotalSistema,
            total_comisiones: totalComisiones,
            comisiones,
            mantenimientos
        });
    } catch (err) {
        console.error('Error GET /api/vehiculos/:id/km:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});




// Vehículos para el módulo de IA.
// La lista visible en Ia.html debe mostrar el parque registrado en la BD.
// La recomendación sí usa obtenerVehiculosDisponiblesIA() para no sugerir unidades ocupadas.
async function obtenerParqueVehicularIA() {
    const [vehiculos] = await pool.query(
        `SELECT v.id, v.no_economico, v.marca, v.linea, v.modelo, v.tipo,
                v.capacidad, v.combustible
           FROM vehiculos v
          WHERE v.activo = 1
          ORDER BY v.no_economico`
    );

    return vehiculos;
}

async function obtenerVehiculosDisponiblesIA() {
    const estadosOcupados = [
        'En comision',
        'En comisión',
        'Solicitud finalización',
        'Solicitud finalizacion'
    ];

    const [vehiculos] = await pool.query(
        `SELECT v.id, v.no_economico, v.marca, v.linea, v.modelo, v.tipo,
                v.capacidad, v.combustible
           FROM vehiculos v
          WHERE v.activo = 1
            AND NOT EXISTS (
                SELECT 1 FROM viajes vi
                 WHERE vi.vehiculo_id = v.id
                   AND vi.estado IN (${estadosOcupados.map(() => '?').join(',')})
            )
          ORDER BY v.no_economico`,
        estadosOcupados
    );

    return vehiculos;
}

app.get('/api/ia/parque', async (req, res) => {
    try {
        const vehiculos = await obtenerParqueVehicularIA();
        res.json({
            ok: true,
            vehiculos: vehiculos.map(v => ({
                id: v.id,
                no_economico: v.no_economico,
                marca: v.marca,
                linea: v.linea,
                modelo: v.modelo,
                tipo: v.tipo,
                capacidad: v.capacidad,
                combustible: v.combustible,
                nombre: iaNombreVehiculo(v)
            }))
        });
    } catch (err) {
        console.error('Error GET /api/ia/parque:', err);
        res.status(500).json({ ok: false, error: err.message || 'No fue posible cargar el parque vehicular para IA.' });
    }
});


// ============== IA / RECOMENDACIÓN VEHICULAR ==============
// La recomendación ahora se procesa en el backend para no exponer la clave
// de Gemini en el navegador. Si Gemini no está configurado o falla, se usa
// un recomendador local con reglas institucionales para que el módulo siga funcionando.
function iaNormalizarTexto(valor) {
    return String(valor || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function iaNombreVehiculo(v) {
    const nombre = `${v.marca || ''} ${v.linea || ''} ${v.modelo || ''} (Núm. Eco. ${v.no_economico || v.eco || v.id})`;
    return nombre.replace(/\s+/g, ' ').trim();
}

function iaEsPickup(v) {
    const texto = iaNormalizarTexto(`${v.tipo || ''} ${v.marca || ''} ${v.linea || ''}`);
    return /pickup|pick up|pick-up|camioneta|carga/.test(texto);
}

function iaMotivoRequiereCarga(motivo) {
    const texto = iaNormalizarTexto(motivo);
    return /carga|equipo|herramienta|material|mobiliario|paquete|insumo|traslado de equipo/.test(texto);
}

function iaVehiculosConCapacidad(vehiculos) {
    return (vehiculos || [])
        .map(v => ({ ...v, capacidad_num: Number.parseInt(v.capacidad, 10) || 0 }))
        .filter(v => v.capacidad_num > 0);
}

function generarRecomendacionLocal(vehiculos, personas, motivo) {
    const disponibles = iaVehiculosConCapacidad(vehiculos);
    const requiereCarga = iaMotivoRequiereCarga(motivo);

    if (!disponibles.length) {
        return {
            texto: 'No es posible emitir una recomendación porque los vehículos disponibles no tienen capacidad registrada en el sistema.',
            seleccion: []
        };
    }

    const compararVehiculos = (a, b) => {
        const extraA = a.capacidad_num - personas;
        const extraB = b.capacidad_num - personas;
        if (requiereCarga && iaEsPickup(a) !== iaEsPickup(b)) return iaEsPickup(a) ? -1 : 1;
        if (extraA !== extraB) return extraA - extraB;
        if (a.capacidad_num !== b.capacidad_num) return a.capacidad_num - b.capacidad_num;
        return String(a.no_economico || '').localeCompare(String(b.no_economico || ''), 'es', { numeric: true });
    };

    const individuales = disponibles
        .filter(v => v.capacidad_num >= personas)
        .sort(compararVehiculos);

    if (individuales.length) {
        const elegido = individuales[0];
        const motivoBreve = requiereCarga && iaEsPickup(elegido)
            ? `cubre la capacidad requerida y es adecuada para traslado de equipo o material`
            : `cubre la capacidad requerida sin sobredimensionar la comisión`;
        return {
            texto: `Se recomienda asignar el ${iaNombreVehiculo(elegido)} para esta comisión de servicio, dado que ${motivoBreve}.`,
            seleccion: [elegido]
        };
    }

    let mejorPar = null;
    for (let i = 0; i < disponibles.length; i++) {
        for (let j = i + 1; j < disponibles.length; j++) {
            const par = [disponibles[i], disponibles[j]];
            const total = par[0].capacidad_num + par[1].capacidad_num;
            if (total < personas) continue;
            const extra = total - personas;
            const tienePickup = par.some(iaEsPickup) ? 1 : 0;
            const score = extra * 100 - (requiereCarga ? tienePickup * 10 : 0) + total;
            if (!mejorPar || score < mejorPar.score) mejorPar = { par, total, score };
        }
    }

    if (mejorPar) {
        const [a, b] = mejorPar.par.sort((x, y) => y.capacidad_num - x.capacidad_num);
        const motivoBreve = requiereCarga && mejorPar.par.some(iaEsPickup)
            ? `su capacidad combinada cubre a los comisionados e incluye una unidad adecuada para carga o equipo`
            : `su capacidad combinada cubre a los comisionados con el menor sobredimensionamiento disponible`;
        return {
            texto: `Se recomienda asignar el ${iaNombreVehiculo(a)} y el ${iaNombreVehiculo(b)} para esta comisión de servicio, dado que ${motivoBreve}.`,
            seleccion: [a, b]
        };
    }

    return {
        texto: `El parque vehicular institucional no cuenta con disponibilidad suficiente para trasladar a ${personas} comisionados, ni siquiera mediante la combinación de dos unidades.`,
        seleccion: []
    };
}


function leerGeminiDesdeConfigJs() {
    const salida = { apiKey: '', modelos: [] };
    try {
        const rutaConfig = path.join(__dirname, 'public', 'Config.js');
        if (!fs.existsSync(rutaConfig)) return salida;

        const contenido = fs.readFileSync(rutaConfig, 'utf8');

        const keyMatch = contenido.match(/(?:const|let|var)\s+GEMINI_API_KEY\s*=\s*["'`]([^"'`]+)["'`]/);
        if (keyMatch && keyMatch[1] && keyMatch[1] !== 'PEGA_AQUI_TU_API_KEY') {
            salida.apiKey = keyMatch[1].trim();
        }

        const modelosMatch = contenido.match(/(?:const|let|var)\s+MODELOS_GEMINI\s*=\s*\[([\s\S]*?)\]\s*;/);
        if (modelosMatch && modelosMatch[1]) {
            salida.modelos = Array.from(modelosMatch[1].matchAll(/["'`]([^"'`]+)["'`]/g))
                .map(m => m[1].trim())
                .filter(Boolean);
        }
    } catch (err) {
        console.warn('No se pudo leer GEMINI_API_KEY desde Config.js:', err.message);
    }
    return salida;
}

function modelosGeminiPreferidos() {
    if (process.env.GEMINI_MODELS) {
        return process.env.GEMINI_MODELS.split(',').map(m => m.trim()).filter(Boolean);
    }

    const desdeConfig = leerGeminiDesdeConfigJs().modelos;
    const preferidosSeguros = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-1.5-flash'];
    const combinados = [...preferidosSeguros, ...desdeConfig];
    return [...new Set(combinados.filter(Boolean))];
}

// El algoritmo local YA eligió las unidades reales del parque (seleccion).
// Gemini sólo redacta la justificación SOBRE ESAS unidades; no elige libremente
// ni puede inventar vehículos. Así la recomendación siempre usa los vehículos
// registrados en la base de datos.
function construirPromptRecomendacionIA(seleccion, personas, motivo) {
    const lista = (seleccion || []).map(v => {
        const tipo = v.tipo || 'tipo no registrado';
        const comb = v.combustible || 'combustible no registrado';
        const cap  = Number.parseInt(v.capacidad, 10) || v.capacidad_num || 0;
        return `- ${iaNombreVehiculo(v)} (${tipo}, capacidad ${cap} personas, ${comb}, número económico ${v.no_economico || v.eco || v.id})`;
    }).join('\n');

    const capacidadTotal = (seleccion || [])
        .reduce((s, v) => s + (Number.parseInt(v.capacidad, 10) || v.capacidad_num || 0), 0);

    return `Eres un asistente institucional del la asistente institucional especializado en asignación de vehículos para comisiones de servicio. Responde en español con UNA sola oración formal, directa, sin listas, sin saludo.

El sistema institucional YA seleccionó del parque vehicular registrado el/los siguiente(s) vehículo(s) para esta comisión:
${lista}

Datos de la comisión:
- Total de comisionados: ${personas}
- Capacidad total asignada: ${capacidadTotal} personas
${motivo ? `- Objetivo de la comisión: ${motivo}` : ''}

Instrucciones obligatorias:
1. Recomienda EXACTAMENTE ese/esos vehículo(s); está PROHIBIDO mencionar, sugerir o inventar cualquier otro vehículo.
2. Debes nombrar cada vehículo con su número económico tal como aparece arriba.
3. Explica brevemente por qué es/son adecuado(s): capacidad suficiente, tipo de unidad y, si el objetivo implica carga o equipo, idoneidad de la pick-up.
4. No uses listas, viñetas ni saludos: una sola oración.

Formato:
- Un vehículo: "Se recomienda asignar el [VEHÍCULO] para esta comisión de servicio, dado que [motivo breve]."
- Dos vehículos: "Se recomienda asignar el [VEHÍCULO 1] y el [VEHÍCULO 2] para esta comisión de servicio, dado que [motivo breve]."`;
}

async function consultarGeminiRecomendacion(seleccion, personas, motivo) {
    // Sin selección real (no hay disponibilidad) no se invoca a Gemini:
    // el texto institucional lo resuelve el recomendador local.
    if (!Array.isArray(seleccion) || !seleccion.length) return null;

    const configGemini = leerGeminiDesdeConfigJs();
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY || configGemini.apiKey;
    if (!apiKey) return null;
    if (typeof fetch !== 'function') return null;

    const modelos = modelosGeminiPreferidos();

    const prompt = construirPromptRecomendacionIA(seleccion, personas, motivo);

    // Los números económicos de las unidades realmente seleccionadas en la BD.
    const economicosRequeridos = seleccion
        .map(v => String(v.no_economico || v.eco || v.id || '').trim())
        .filter(Boolean);

    for (const modelo of modelos) {
        try {
            const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.25,
                        topP: 0.9,
                        maxOutputTokens: 220,
                        thinkingConfig: { thinkingBudget: 0 }
                    }
                })
            });

            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                console.warn(`Gemini ${modelo} no respondió correctamente (${resp.status}):`, data?.error?.message || resp.statusText);
                continue;
            }

            const texto = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join(' ').trim();
            if (!texto) continue;

            // Validación de anclaje: el texto de Gemini DEBE referirse a las
            // unidades reales seleccionadas (por su número económico). Si Gemini
            // ignoró o inventó vehículos, se descarta y se usa el texto local.
            const textoNorm = iaNormalizarTexto(texto);
            const mencionaTodos = economicosRequeridos.every(eco =>
                textoNorm.includes(iaNormalizarTexto(eco)));

            if (!mencionaTodos) {
                console.warn(`Gemini ${modelo} no referenció las unidades reales seleccionadas; se usará el recomendador local.`);
                continue;
            }

            return { texto, modelo };
        } catch (err) {
            console.warn(`Error consultando Gemini ${modelo}:`, err.message);
        }
    }

    return null;
}

function diasDesde(fecha) {
    if (!fecha) return null;
    const d = new Date(fecha);
    if (Number.isNaN(d.getTime())) return null;
    return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

async function obtenerDatosMantenimientoIA(vehiculoId) {
    const id = Number.parseInt(vehiculoId, 10);
    if (!Number.isInteger(id) || id <= 0) {
        const err = new Error('Vehículo inválido.');
        err.statusCode = 400;
        throw err;
    }

    const [[vehiculo]] = await pool.query(
        `SELECT id, no_economico, marca, linea, modelo, tipo, capacidad, color,
                placas, combustible, km_actual, created_at
           FROM vehiculos
          WHERE id = ? AND activo = 1
          LIMIT 1`,
        [id]
    );
    if (!vehiculo) {
        const err = new Error('Vehículo no encontrado.');
        err.statusCode = 404;
        throw err;
    }

    const [comisiones] = await pool.query(
        `SELECT id, lugar_destino, motivo, estado, km_inicial, km_final,
                fecha_inicio, fecha_fin,
                GREATEST(COALESCE(km_final, 0) - COALESCE(km_inicial, 0), 0) AS km_viaje
           FROM viajes
          WHERE vehiculo_id = ?
          ORDER BY COALESCE(fecha_fin, fecha_inicio, created_at) DESC, id DESC
          LIMIT 50`,
        [id]
    );

    const [mantenimientos] = await pool.query(
        `SELECT id, componente, codigo_ref, severidad, descripcion, estado,
                costo, resolucion, fecha_resolucion, created_at
           FROM mantenimiento_observaciones
          WHERE vehiculo_id = ?
          ORDER BY created_at DESC, id DESC
          LIMIT 30`,
        [id]
    );

    const kmRecorridoSistema = comisiones.reduce((acc, c) => acc + (Number(c.km_viaje) || 0), 0);
    const ultimaComision = comisiones.find(c => c.fecha_fin || c.fecha_inicio) || null;
    const pendientes = mantenimientos.filter(m => ['pendiente', 'en_revision'].includes(String(m.estado || '').toLowerCase()));
    const criticas = pendientes.filter(m => ['alta', 'critica'].includes(String(m.severidad || '').toLowerCase()));

    const resumen = {
        vehiculo_id: vehiculo.id,
        no_economico: vehiculo.no_economico,
        km_actual: Number(vehiculo.km_actual) || 0,
        km_recorrido_sistema: kmRecorridoSistema,
        total_comisiones: comisiones.length,
        total_mantenimientos: mantenimientos.length,
        pendientes: pendientes.length,
        criticas: criticas.length,
        dias_ultima_comision: ultimaComision ? diasDesde(ultimaComision.fecha_fin || ultimaComision.fecha_inicio) : null,
        dias_alta: diasDesde(vehiculo.created_at)
    };

    return { vehiculo, comisiones, mantenimientos, resumen };
}

function generarAnalisisMantenimientoLocal(datos) {
    const { vehiculo, resumen, mantenimientos } = datos;
    const nombre = `${vehiculo.marca || ''} ${vehiculo.linea || ''} ${vehiculo.modelo || ''}`.replace(/\s+/g, ' ').trim() || 'el vehículo';
    const kmBase = Math.max(Number(vehiculo.km_actual) || 0, Number(resumen.km_recorrido_sistema) || 0);
    const pendientes = Number(resumen.pendientes) || 0;
    const criticas = Number(resumen.criticas) || 0;

    const acciones = [];
    if (criticas > 0) {
        acciones.push(`atender de inmediato ${criticas} observación(es) de severidad alta o crítica antes de asignarlo a una nueva comisión`);
    } else if (pendientes > 0) {
        acciones.push(`programar revisión para cerrar ${pendientes} observación(es) pendiente(s) o en revisión`);
    }

    const kmAceite = kmBase > 0 ? kmBase % 5000 : 0;
    const kmFrenos = kmBase > 0 ? kmBase % 15000 : 0;
    if (kmBase === 0) {
        acciones.push('registrar kilometraje real actualizado para mejorar la planeación preventiva');
    } else {
        if (kmAceite >= 4000 || kmAceite === 0) acciones.push('revisar cambio de aceite y filtros por cercanía al intervalo preventivo de 5,000 km');
        if (kmFrenos >= 14000 || kmFrenos === 0) acciones.push('revisar sistema de frenos por cercanía al intervalo preventivo de 15,000 km');
    }

    const ultimosComponentes = [...new Set((mantenimientos || []).slice(0, 5).map(m => m.componente).filter(Boolean))];
    if (ultimosComponentes.length) {
        acciones.push(`verificar seguimiento de componentes reportados recientemente: ${ultimosComponentes.join(', ')}`);
    }

    if (!acciones.length) {
        acciones.push('mantener la unidad en operación normal y conservar bitácora preventiva después de cada comisión');
    }

    const ultima = resumen.dias_ultima_comision == null
        ? 'sin comisiones recientes registradas'
        : `con última comisión hace ${resumen.dias_ultima_comision} día(s)`;

    return `Para ${nombre} núm. económico ${vehiculo.no_economico || vehiculo.id}, el sistema registra ${Number(kmBase).toLocaleString('es-MX')} km de referencia, ${resumen.total_comisiones} comisión(es) y ${ultima}. Recomendación: ${acciones.join('; ')}.`;
}

function construirPromptMantenimientoIA(datos) {
    const { vehiculo, resumen, mantenimientos, comisiones } = datos;
    const mtto = (mantenimientos || []).slice(0, 10).map(m =>
        `- ${m.created_at || 'sin fecha'} | ${m.componente || 'componente'} | ${m.severidad || 'media'} | ${m.estado || 'pendiente'} | ${m.descripcion || ''}`
    ).join('\n');
    const viajes = (comisiones || []).slice(0, 8).map(c =>
        `- ${c.fecha_inicio || 'sin fecha'} | ${c.lugar_destino || 'sin destino'} | ${c.estado || ''} | ${Number(c.km_viaje) || 0} km`
    ).join('\n');

    return `Eres un analista de mantenimiento vehicular institucional. Responde en español, formal y accionable, en máximo 2 párrafos. No inventes datos.

Vehículo:
- Núm. económico: ${vehiculo.no_economico || vehiculo.id}
- Unidad: ${vehiculo.marca || ''} ${vehiculo.linea || ''} ${vehiculo.modelo || ''}
- Tipo: ${vehiculo.tipo || 'no registrado'}
- Combustible: ${vehiculo.combustible || 'no registrado'}
- Kilometraje actual: ${vehiculo.km_actual || 0}

Resumen:
- Km recorridos registrados por comisiones: ${resumen.km_recorrido_sistema}
- Total comisiones: ${resumen.total_comisiones}
- Observaciones de mantenimiento: ${resumen.total_mantenimientos}
- Pendientes/en revisión: ${resumen.pendientes}
- Alta/crítica pendientes: ${resumen.criticas}
- Días desde última comisión: ${resumen.dias_ultima_comision ?? 'sin dato'}

Mantenimientos recientes:
${mtto || 'Sin mantenimientos recientes.'}

Comisiones recientes:
${viajes || 'Sin comisiones recientes.'}

Indica prioridad, riesgos y acciones preventivas concretas.`;
}

async function consultarGeminiMantenimiento(datos) {
    const configGemini = leerGeminiDesdeConfigJs();
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY || configGemini.apiKey;
    if (!apiKey || typeof fetch !== 'function') return null;

    const prompt = construirPromptMantenimientoIA(datos);
    for (const modelo of modelosGeminiPreferidos()) {
        try {
            const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.2, topP: 0.9, maxOutputTokens: 420 }
                })
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                console.warn(`Gemini mantenimiento ${modelo} no respondió (${resp.status}):`, data?.error?.message || resp.statusText);
                continue;
            }
            const texto = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n').trim();
            if (texto) return { texto, modelo };
        } catch (err) {
            console.warn(`Error consultando Gemini mantenimiento ${modelo}:`, err.message);
        }
    }
    return null;
}

app.post('/api/ia/mantenimiento', async (req, res) => {
    try {
        const datos = await obtenerDatosMantenimientoIA(req.body?.vehiculo_id);
        const local = generarAnalisisMantenimientoLocal(datos);
        const gemini = await consultarGeminiMantenimiento(datos);
        res.json({
            ok: true,
            fuente: gemini ? 'gemini' : 'local',
            modelo: gemini?.modelo || 'Recomendador SIGEPAV local',
            analisis: gemini?.texto || local,
            resumen: datos.resumen
        });
    } catch (err) {
        const status = err.statusCode || 500;
        console.error('Error POST /api/ia/mantenimiento:', err.message);
        res.status(status).json({ ok: false, error: status === 500 ? 'No fue posible generar el análisis de mantenimiento.' : err.message });
    }
});

// =====================================================================
//   MÓDULO D — IA PREDICTIVA DE FLOTA
//   Analiza TODO el parque y rankea "quién va al taller primero".
//   Doble capa: (1) motor de reglas local que siempre funciona, con un
//   score de urgencia por vehículo; (2) Gemini redacta el análisis
//   ejecutivo SOBRE ese ranking, anclado a los números económicos reales.
// =====================================================================

// Señales de falla detectables en las notas informales del comisionado.
// Se evalúan sobre el texto normalizado (sin acentos, minúsculas).
const IA_SENALES_FALLA = [
    { cat: 'Transmisión',        kw: ['no metio', 'no entra', 'cuarta', 'tercera', 'quinta', 'segunda', 'la marcha', 'cambios', 'velocidad cuesta'] },
    { cat: 'Embrague',           kw: ['clutch', 'embrague', 'patina'] },
    { cat: 'Frenos',             kw: ['freno', 'chillido', 'balata', 'rechina'] },
    { cat: 'Sobrecalentamiento', kw: ['temperatura', 'se calienta', 'calienta', 'no enfria', 'humo', 'quemado', 'hierve'] },
    { cat: 'Fuga',               kw: ['fuga', 'gotea', 'goteo', 'mancha de aceite', 'tira aceite'] },
    { cat: 'Ruido/Vibración',    kw: ['ruido', 'vibra', 'vibracion', 'desbalanceado', 'traqueteo', 'cascabeleo'] },
    { cat: 'Falla general',      kw: ['falla', 'fallo', 'jalo feo', 'jala feo', 'se apago', 'no arranca', 'tiron', 'jalones'] },
];

function iaDetectarSenalesNota(texto) {
    const norm = iaNormalizarTexto(texto || '');
    if (!norm) return [];
    const cats = [];
    for (const s of IA_SENALES_FALLA) {
        if (s.kw.some(k => norm.includes(iaNormalizarTexto(k)))) cats.push(s.cat);
    }
    return [...new Set(cats)];
}

// Junta, en pocas queries, todo lo que el score necesita por vehículo.
async function obtenerDatosParquePredictivo() {
    const [vehiculos] = await pool.query(
        `SELECT id, no_economico, marca, linea, modelo, tipo, km_actual
           FROM vehiculos WHERE activo = 1 ORDER BY no_economico`
    );
    const [programados] = await pool.query(`SELECT * FROM mantenimiento_programado`);
    const [observaciones] = await pool.query(
        `SELECT vehiculo_id, componente, severidad, estado, descripcion, created_at
           FROM mantenimiento_observaciones ORDER BY created_at DESC`
    );
    const [viajes] = await pool.query(
        `SELECT vehiculo_id, no_vale, lugar_destino, observaciones, fecha_inicio
           FROM viajes
          WHERE observaciones IS NOT NULL AND observaciones <> ''
          ORDER BY COALESCE(fecha_fin, fecha_inicio, created_at) DESC`
    );
    // Costo acumulado por vehículo (combustible + mantenimiento), igual que Módulo B.
    const [costos] = await pool.query(
        `SELECT v.id,
                COALESCE(c.comb,0) + COALESCE(m.mant,0) AS costo_total
           FROM vehiculos v
           LEFT JOIN (SELECT vehiculo_id, SUM(costo) comb FROM vales_combustible GROUP BY vehiculo_id) c ON c.vehiculo_id = v.id
           LEFT JOIN (SELECT vehiculo_id, SUM(costo) mant FROM mantenimiento_observaciones GROUP BY vehiculo_id) m ON m.vehiculo_id = v.id
          WHERE v.activo = 1`
    );
    return { vehiculos, programados, observaciones, viajes, costos };
}

// Calcula el ranking local de urgencia. SIEMPRE funciona, sin IA.
function calcularRankingParque(datos) {
    const anioActual = new Date().getFullYear();
    const costoMap = {};
    datos.costos.forEach(c => { costoMap[c.id] = Number(c.costo_total) || 0; });
    const costoMax = Math.max(1, ...Object.values(costoMap));

    const ranking = datos.vehiculos.map(v => {
        const razones = [];
        const notas = [];
        let score = 0;

        // (1) Km para el próximo servicio (de mantenimiento_programado).
        const mps = datos.programados.filter(p => p.vehiculo_id === v.id);
        let kmFaltante = null;
        for (const mp of mps) {
            if (mp.intervalo_km && mp.ultimo_km != null) {
                const f = (Number(mp.ultimo_km) + Number(mp.intervalo_km)) - Number(v.km_actual);
                if (kmFaltante === null || f < kmFaltante) kmFaltante = f;
            }
        }
        if (kmFaltante !== null) {
            if (kmFaltante <= 0)      { score += 40; razones.push(`Servicio VENCIDO por ${Math.abs(kmFaltante).toLocaleString('es-MX')} km`); }
            else if (kmFaltante <= 1000) { score += 25; razones.push(`Servicio próximo: faltan ${kmFaltante.toLocaleString('es-MX')} km`); }
            else if (kmFaltante <= 2000) { score += 10; razones.push(`Servicio se acerca (${kmFaltante.toLocaleString('es-MX')} km)`); }
        }

        // (2) Observaciones de taller pendientes/críticas.
        const obs = datos.observaciones.filter(o => o.vehiculo_id === v.id);
        const criticas = obs.filter(o => ['alta', 'critica'].includes(String(o.severidad || '').toLowerCase()) && ['pendiente', 'en_revision'].includes(String(o.estado || '').toLowerCase()));
        const pendientes = obs.filter(o => ['pendiente', 'en_revision'].includes(String(o.estado || '').toLowerCase()));
        if (criticas.length)   { score += criticas.length * 20; razones.push(`${criticas.length} observación(es) crítica(s) en taller: ${[...new Set(criticas.map(c => c.componente))].join(', ')}`); }
        const pendNoCrit = pendientes.length - criticas.length;
        if (pendNoCrit > 0)    { score += pendNoCrit * 8; razones.push(`${pendNoCrit} observación(es) pendiente(s)`); }

        // (3) Notas de falla del comisionado (lenguaje informal).
        for (const vj of datos.viajes.filter(t => t.vehiculo_id === v.id)) {
            const cats = iaDetectarSenalesNota(vj.observaciones);
            if (cats.length) {
                score += 15;
                notas.push({ nota: vj.observaciones, categorias: cats, destino: vj.lugar_destino, vale: vj.no_vale });
            }
        }
        if (notas.length) {
            const cats = [...new Set(notas.flatMap(n => n.categorias))];
            razones.push(`Reportes del operador: ${cats.join(', ')}`);
        }

        // (4) Antigüedad de la unidad.
        const edad = v.modelo ? anioActual - Number(v.modelo) : null;
        if (edad !== null) {
            if (edad >= 25)      { score += 12; razones.push(`Unidad muy antigua (${edad} años)`); }
            else if (edad >= 15) { score += 8;  razones.push(`Unidad antigua (${edad} años)`); }
            else if (edad >= 10) { score += 4; }
        }

        // (5) Alto costo de operación (relativo a la flota).
        const costo = costoMap[v.id] || 0;
        if (costo >= costoMax * 0.66 && costo > 0) { score += 10; razones.push(`Alto costo de operación acumulado ($${costo.toLocaleString('es-MX')})`); }

        const nivel = score >= 50 ? 'critico' : score >= 25 ? 'medio' : 'bajo';
        return {
            vehiculo_id: v.id, no_economico: v.no_economico,
            marca: v.marca, linea: v.linea, modelo: v.modelo,
            km_actual: Number(v.km_actual) || 0,
            score, nivel, razones, notas,
            km_faltante: kmFaltante,
        };
    });

    ranking.sort((a, b) => b.score - a.score);
    return ranking;
}

// Texto ejecutivo local (sin IA) sobre el top del ranking.
function generarAnalisisParqueLocal(ranking) {
    const criticos = ranking.filter(r => r.nivel === 'critico');
    const medios   = ranking.filter(r => r.nivel === 'medio');
    const top = ranking.filter(r => r.score > 0).slice(0, 3);

    if (!top.length) {
        return 'El sistema no detecta unidades con urgencia de mantenimiento en este momento: la flota opera dentro de parámetros normales. Se recomienda conservar la bitácora preventiva después de cada comisión.';
    }
    const frases = top.map(r =>
        `la unidad ${r.no_economico} (${r.marca} ${r.linea}) ${r.razones[0] ? '— ' + r.razones[0].toLowerCase() : ''}`
    );
    let txt = `El análisis de la flota prioriza ${criticos.length} unidad(es) en estado crítico y ${medios.length} en estado medio. `;
    txt += `Atención prioritaria para ${frases.join('; ')}. `;
    txt += `Se recomienda agendar estas unidades al taller antes de asignarles nuevas comisiones para evitar fallas en ruta.`;
    return txt;
}

function construirPromptParqueIA(ranking) {
    const top = ranking.filter(r => r.score > 0).slice(0, 5);
    const lista = top.map(r => {
        const notasTxt = r.notas.map(n => `"${n.nota}" (posible: ${n.categorias.join('/')})`).join('; ');
        return `- Unidad ${r.no_economico} (${r.marca} ${r.linea} ${r.modelo}), score ${r.score}, nivel ${r.nivel}. Señales: ${r.razones.join('; ') || 'ninguna'}.${notasTxt ? ' Reportes del operador: ' + notasTxt : ''}`;
    }).join('\n');

    return `Eres un analista de mantenimiento de flotas vehiculares. El sistema SIGEPAV ya calculó un ranking de urgencia de mantenimiento; tu tarea es redactar un análisis ejecutivo en español, formal y accionable, en máximo 2 párrafos. NO inventes unidades ni datos: usa SOLO las unidades listadas, nombrándolas por su número económico.

Ranking de urgencia (de mayor a menor), ya calculado por el sistema:
${lista || 'Sin unidades con urgencia detectada.'}

Instrucciones:
1. Menciona por número económico las unidades más urgentes y por qué (km de servicio, observaciones de taller, reportes del operador, antigüedad o costo).
2. Cuando un operador reportó algo en lenguaje informal (ej. "no metió la cuarta"), interprétalo técnicamente (ej. posible falla de transmisión/embrague).
3. Cierra con una recomendación de acción para el administrador de la flota.
4. No uses viñetas: prosa en máximo 2 párrafos.`;
}

async function consultarGeminiParque(ranking) {
    const top = ranking.filter(r => r.score > 0).slice(0, 5);
    if (!top.length) return null;

    const configGemini = leerGeminiDesdeConfigJs();
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY || configGemini.apiKey;
    if (!apiKey || typeof fetch !== 'function') return null;

    const prompt = construirPromptParqueIA(ranking);
    // Anclaje: la respuesta DEBE referirse al menos al top-3 por su núm. económico.
    const requeridos = top.slice(0, 3).map(r => String(r.no_economico).trim()).filter(Boolean);

    for (const modelo of modelosGeminiPreferidos()) {
        try {
            const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.25, topP: 0.9, maxOutputTokens: 500 }
                })
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                console.warn(`Gemini parque ${modelo} no respondió (${resp.status}):`, data?.error?.message || resp.statusText);
                continue;
            }
            const texto = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n').trim();
            if (!texto) continue;

            // Validación de anclaje contra los números económicos reales.
            const norm = iaNormalizarTexto(texto);
            const mencionaTop = requeridos.every(eco => norm.includes(iaNormalizarTexto(eco)));
            if (!mencionaTop) {
                console.warn(`Gemini parque ${modelo} no referenció las unidades reales del ranking; se usa el análisis local.`);
                continue;
            }
            return { texto, modelo };
        } catch (err) {
            console.warn(`Error consultando Gemini parque ${modelo}:`, err.message);
        }
    }
    return null;
}

// GET /api/ia/parque/predictivo — ranking + análisis ejecutivo (IA o local).
app.get('/api/ia/parque/predictivo', async (req, res) => {
    try {
        const datos = await obtenerDatosParquePredictivo();
        const ranking = calcularRankingParque(datos);
        const local = generarAnalisisParqueLocal(ranking);
        const gemini = await consultarGeminiParque(ranking);
        res.json({
            ok: true,
            generado: new Date().toISOString(),
            fuente: gemini ? 'gemini' : 'local',
            modelo: gemini?.modelo || 'Motor predictivo SIGEPAV local',
            analisis: gemini?.texto || local,
            resumen: {
                total: ranking.length,
                criticos: ranking.filter(r => r.nivel === 'critico').length,
                medios:   ranking.filter(r => r.nivel === 'medio').length,
                bajos:    ranking.filter(r => r.nivel === 'bajo').length,
            },
            ranking
        });
    } catch (err) {
        console.error('Error GET /api/ia/parque/predictivo:', err);
        res.status(500).json({ ok: false, error: 'No fue posible generar el análisis predictivo de la flota.' });
    }
});

app.post('/api/ia/recomendacion', async (req, res) => {
    try {
        const personas = Number.parseInt(req.body.personas, 10);
        const motivo = String(req.body.motivo || '').trim().slice(0, 500);

        if (!Number.isFinite(personas) || personas < 1 || personas > 500) {
            return res.status(400).json({ ok: false, error: 'Indique un número válido de comisionados.' });
        }

        const vehiculos = await obtenerVehiculosDisponiblesIA();

        if (!vehiculos.length) {
            return res.json({
                ok: true,
                recomendacion: `El parque vehicular institucional no cuenta con vehículos disponibles para trasladar a ${personas} comisionados en este momento.`,
                modelo: 'Recomendador SIGEPAV local',
                fuente: 'local',
                vehiculos_disponibles: 0
            });
        }

        const local = generarRecomendacionLocal(vehiculos, personas, motivo);
        // Gemini sólo redacta sobre las unidades REALES ya seleccionadas por el
        // algoritmo local (ancladas a la BD). Si Gemini falla o se desvía, se usa
        // el texto local. La selección de vehículos siempre proviene de la BD.
        const gemini = await consultarGeminiRecomendacion(local.seleccion, personas, motivo);

        res.json({
            ok: true,
            recomendacion: gemini?.texto || local.texto,
            modelo: gemini?.modelo || 'Recomendador SIGEPAV local',
            fuente: gemini ? 'gemini' : 'local',
            vehiculos_disponibles: vehiculos.length,
            seleccion: (local.seleccion || []).map(v => ({
                id: v.id,
                no_economico: v.no_economico,
                marca: v.marca || null,
                linea: v.linea || null,
                modelo: v.modelo || null,
                tipo: v.tipo || null,
                combustible: v.combustible || null,
                nombre: iaNombreVehiculo(v),
                capacidad: Number.parseInt(v.capacidad, 10) || v.capacidad_num || null
            }))
        });
    } catch (err) {
        console.error('Error POST /api/ia/recomendacion:', err);
        res.status(500).json({ ok: false, error: 'No fue posible generar la recomendación vehicular.' });
    }
});

app.post('/api/vehiculos', async (req, res) => {
    let conn;
    try {
        const {
            marca, linea, modelo, tipo, capacidad,
            color, serie, placas, combustible, km_actual
        } = req.body;

        const marcaFinal  = limpiarTextoBD(marca);
        const lineaFinal  = limpiarTextoBD(linea);
        const colorFinal  = limpiarTextoBD(color) || null;
        const placasFinal = normalizarPlacas(placas);
        const serieFinal  = normalizarSerie(serie);
        const combustibleFinal = limpiarTextoBD(combustible) || null;

        if (!marcaFinal || !lineaFinal || !placasFinal) {
            return res.status(400).json({
                ok: false,
                error: 'Campos obligatorios: marca, linea, placas'
            });
        }

        const TIPOS_VALIDOS = ['sedan','coupe','pickup','suv','hatchback','van','motocicleta','otro'];
        const tipoFinal = (tipo && TIPOS_VALIDOS.includes(String(tipo).toLowerCase()))
            ? String(tipo).toLowerCase() : null;

        const capacidadNum = parseInt(capacidad, 10);
        const capacidadFinal = (Number.isFinite(capacidadNum) && capacidadNum >= 0 && capacidadNum <= 255)
            ? capacidadNum : null;

        conn = await pool.getConnection();
        await conn.beginTransaction();

        // 1) Insertar con no_economico temporal ÚNICO, luego actualizar con el insertId real.
        // Antes era siempre '000'; si quedaba un registro temporal o había doble clic,
        // MySQL devolvía ER_DUP_ENTRY y el front mostraba falsos duplicados.
        const sqlInsert = `
            INSERT INTO vehiculos
                (no_economico, marca, linea, modelo, tipo, capacidad,
                 color, no_serie, placas, combustible, km_actual, qr_token)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UUID())
        `;
        const params = [
            noEconomicoTemporal(), marcaFinal, lineaFinal, parseInt(modelo, 10) || 0,
            tipoFinal, capacidadFinal,
            colorFinal, serieFinal, placasFinal,
            combustibleFinal, parseInt(km_actual, 10) || 0
        ];

        const [result] = await conn.query(sqlInsert, params);
        const nuevoId = result.insertId;

        // 2) Actualizar no_economico con el ID real del registro recién insertado.
        // Si algo falla aquí, hacemos ROLLBACK para no dejar vehículos "fantasma"
        // que después provoquen duplicados de placas/serie.
        const noEcoFinal = String(nuevoId).padStart(3, '0');
        await conn.query(
            'UPDATE vehiculos SET no_economico = ? WHERE id = ?',
            [noEcoFinal, nuevoId]
        );

        const [[vqr]] = await conn.query(
            'SELECT qr_token FROM vehiculos WHERE id = ?', [nuevoId]
        );

        await conn.commit();
        conn.release();
        conn = null;

        // Generate QR image (non-blocking) después del commit
        if (vqr && vqr.qr_token) {
            generarQRVehiculo(nuevoId, vqr.qr_token).catch(console.warn);
        }

        res.json({ ok: true, id: nuevoId, no_economico: noEcoFinal, mensaje: 'Vehículo registrado correctamente' });
    } catch (err) {
        if (conn) {
            try { await conn.rollback(); } catch (_) {}
            conn.release();
        }
        console.error('Error en POST /api/vehiculos:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ ok: false, error: mensajeDuplicadoVehiculo(err) });
        }
        res.status(500).json({ ok: false, error: 'Error al registrar vehículo: ' + err.message });
    }
});

app.put('/api/vehiculos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!id) return res.status(400).json({ ok: false, error: 'ID inválido' });

        const {
            marca, linea, modelo, tipo, capacidad,
            color, serie, placas, combustible, km_actual
        } = req.body;

        const marcaFinal  = limpiarTextoBD(marca);
        const lineaFinal  = limpiarTextoBD(linea);
        const colorFinal  = limpiarTextoBD(color) || null;
        const placasFinal = normalizarPlacas(placas);
        const serieFinal  = normalizarSerie(serie);
        const combustibleFinal = limpiarTextoBD(combustible) || 'Gasolina Magna';

        if (!marcaFinal || !lineaFinal || !placasFinal) {
            return res.status(400).json({
                ok: false,
                error: 'Campos obligatorios: marca, linea, placas'
            });
        }

        // No. Económico SIEMPRE derivado del ID, nunca del cliente
        const noEcoFinal = String(id).padStart(3, '0');

        const TIPOS_VALIDOS = ['sedan','coupe','pickup','suv','hatchback','van','motocicleta','otro'];
        const tipoFinal = (tipo && TIPOS_VALIDOS.includes(String(tipo).toLowerCase()))
            ? String(tipo).toLowerCase() : null;

        const capacidadNum = parseInt(capacidad, 10);
        const capacidadFinal = (Number.isFinite(capacidadNum) && capacidadNum >= 0 && capacidadNum <= 255)
            ? capacidadNum : null;

        const sql = `
            UPDATE vehiculos
            SET no_economico=?, marca=?, linea=?, modelo=?, tipo=?, capacidad=?,
                color=?, no_serie=?, placas=?, combustible=?, km_actual=?
            WHERE id = ?
        `;
        const params = [
            noEcoFinal, marcaFinal, lineaFinal, parseInt(modelo, 10) || 0,
            tipoFinal, capacidadFinal,
            colorFinal, serieFinal, placasFinal,
            combustibleFinal,
            parseInt(km_actual, 10) || 0,
            id
        ];

        const [result] = await pool.query(sql, params);
        if (result.affectedRows === 0) {
            return res.status(404).json({ ok: false, error: 'Vehículo no encontrado' });
        }
        res.json({ ok: true, no_economico: noEcoFinal, mensaje: 'Vehículo actualizado correctamente' });
    } catch (err) {
        console.error('Error en PUT /api/vehiculos/:id:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ ok: false, error: mensajeDuplicadoVehiculo(err) });
        }
        res.status(500).json({ ok: false, error: 'Error al actualizar vehículo: ' + err.message });
    }
});

// ============================================================
//  DELETE /api/vehiculos/:id  — Eliminar vehículo
// ============================================================
app.delete('/api/vehiculos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!id) {
            return res.status(400).json({ ok: false, error: 'ID inválido' });
        }

        // 1) Leemos primero los datos del vehículo (para QR + log de notificación)
        const [[veh]] = await pool.query(
            `SELECT id, no_economico, marca, linea, placas, qr_image_path
               FROM vehiculos WHERE id = ?`,
            [id]
        );
        if (!veh) {
            return res.status(404).json({ ok: false, error: 'Vehículo no encontrado' });
        }

        // 2) Borrado lógico (respeta FKs de viajes/mantenimiento)
        const [result] = await pool.query(
            'UPDATE vehiculos SET activo = 0 WHERE id = ?',
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ ok: false, error: 'Vehículo no encontrado' });
        }

        // 3) Borramos el PNG del QR físico de la carpeta uploads/qr
        //    Intentamos las rutas conocidas y limpiamos también la BD.
        try {
            const qrDir = path.join(__dirname, 'uploads', 'qr');
            const candidatos = new Set();
            if (veh.qr_image_path) {
                // qr_image_path se guardó como "uploads/qr/qr_<id>.png" (relativo al proyecto)
                candidatos.add(path.join(__dirname, veh.qr_image_path));
            }
            // Convención del backfill/generador
            candidatos.add(path.join(qrDir, `qr_${id}.png`));

            let borrados = 0;
            for (const ruta of candidatos) {
                if (ruta && fs.existsSync(ruta)) {
                    try {
                        fs.unlinkSync(ruta);
                        borrados++;
                    } catch (e) {
                        console.warn(`   ⚠️  No se pudo borrar QR ${ruta}:`, e.message);
                    }
                }
            }
            if (borrados > 0) {
                console.log(`   🗑  QR físico eliminado para vehículo ${id} (${borrados} archivo/s)`);
            }

            // Limpiamos también la referencia en BD para evitar links rotos si se reactiva
            await pool.query(
                'UPDATE vehiculos SET qr_image_path = NULL WHERE id = ?',
                [id]
            );
        } catch (errQR) {
            // No fallamos el DELETE por esto — solo lo registramos
            console.warn('   ⚠️  Limpieza de QR fallida:', errQR.message);
        }

        // 4) Notificamos a admins en tiempo real (SSE) si el helper existe
        try {
            if (typeof notificarAdmins === 'function') {
                await notificarAdmins({
                    titulo: 'Vehículo eliminado',
                    cuerpo: `Se eliminó el vehículo No. Eco ${veh.no_economico || id} (${veh.marca || ''} ${veh.linea || ''} · ${veh.placas || ''}).`,
                    tipo:   'vehiculo'
                });
            }
        } catch (errN) {
            console.warn('   ⚠️  Notif eliminar vehículo:', errN.message);
        }

        res.json({ ok: true, mensaje: 'Vehículo eliminado correctamente' });
    } catch (err) {
        console.error('Error en DELETE /api/vehiculos/:id:', err);
        res.status(500).json({
            ok: false,
            error: 'Error al eliminar vehículo: ' + err.message
        });
    }
});

// =====================================================================
//  VALES DISPONIBLES  (admin captura → publica → usuario consume)
// =====================================================================
// Flujo:
//   1. Admin crea vale (estado='borrador') → captura no_vale, folio, etc.
//   2. Admin publica el vale (estado='disponible') → aparece en combo.
//   3. Al iniciar comisión, el form trae los vales disponibles en combo.
//      El usuario elige uno (o S/V) y al guardar la comisión se marca
//      como 'usado' y se liga al viaje_id. Queda en historial.

// ---- GET /api/vales  (todos, para tabla admin con filtros) ----
app.get('/api/vales', async (req, res) => {
    try {
        const { estado } = req.query;
        let sql = `
            SELECT v.id, v.no_vale, v.folio, v.cantidad, v.precio_litro, v.litros,
                   v.estado, v.viaje_id, v.created_at, v.used_at,
                   u.nombre AS creador_nombre, u.email AS creador_email,
                   vj.lugar_destino AS comision_destino
              FROM vales_disponibles v
              LEFT JOIN usuarios u ON u.id = v.creado_por
              LEFT JOIN viajes  vj ON vj.id = v.viaje_id
             WHERE 1=1
        `;
        const params = [];
        if (estado) { sql += ' AND v.estado = ?'; params.push(estado); }
        sql += ' ORDER BY v.created_at DESC LIMIT 500';
        const [rows] = await pool.query(sql, params);
        res.json({ ok: true, vales: rows });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ---- GET /api/vales/disponibles  (solo los publicados, para el combo) ----
app.get('/api/vales/disponibles', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id, no_vale, folio, cantidad, precio_litro, litros
               FROM vales_disponibles
              WHERE estado = 'disponible'
              ORDER BY created_at DESC`
        );
        res.json({ ok: true, vales: rows });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ---- POST /api/vales  (admin captura vale, queda en 'borrador') ----
app.post('/api/vales', async (req, res) => {
    try {
        const { no_vale, folio, cantidad, precio_litro, litros, publicar, creado_por } = req.body;
        const noValeFinal = limpiarTextoBD(no_vale).toUpperCase();
        if (!noValeFinal) {
            return res.status(400).json({ ok: false, error: 'Falta el número de vale.' });
        }
        const estado = publicar ? 'disponible' : 'borrador';
        const [r] = await pool.query(
            `INSERT INTO vales_disponibles
                 (no_vale, folio, cantidad, precio_litro, litros, estado, creado_por)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                noValeFinal,
                limpiarTextoBD(folio) || null,
                cantidad   != null && cantidad   !== '' ? parseFloat(cantidad)   : 0,
                precio_litro != null && precio_litro !== '' ? parseFloat(precio_litro) : 0,
                litros     != null && litros     !== '' ? parseFloat(litros)     : 0,
                estado,
                creado_por || null
            ]
        );
        await registrarBitacora(creado_por || null,
            `Vale ${publicar ? 'publicado' : 'capturado'}: ${noValeFinal}`,
            'vales', r.insertId, req.ip).catch(()=>{});
        res.json({ ok: true, id: r.insertId, estado });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ ok: false, error: mensajeDuplicadoVale(err) });
        }
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ---- PUT /api/vales/:id  (editar, solo si NO está usado) ----
app.put('/api/vales/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { no_vale, folio, cantidad, precio_litro, litros } = req.body;
        const noValeFinal = limpiarTextoBD(no_vale).toUpperCase();

        // Verificar que no esté usado
        const [vrows] = await pool.query(`SELECT estado FROM vales_disponibles WHERE id = ?`, [id]);
        if (!vrows.length)               return res.status(404).json({ ok:false, error:'Vale no encontrado.' });
        if (vrows[0].estado === 'usado') return res.status(409).json({ ok:false, error:'No se puede editar un vale ya usado.' });

        await pool.query(
            `UPDATE vales_disponibles
                SET no_vale = COALESCE(?, no_vale),
                    folio = ?, cantidad = ?, precio_litro = ?, litros = ?
              WHERE id = ?`,
            [
                noValeFinal || null,
                limpiarTextoBD(folio) || null,
                cantidad   != null && cantidad   !== '' ? parseFloat(cantidad)   : 0,
                precio_litro != null && precio_litro !== '' ? parseFloat(precio_litro) : 0,
                litros     != null && litros     !== '' ? parseFloat(litros)     : 0,
                id
            ]
        );
        res.json({ ok: true });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ ok: false, error: mensajeDuplicadoVale(err) });
        }
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ---- PUT /api/vales/:id/publicar  (admin lo pone disponible) ----
app.put('/api/vales/:id/publicar', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const [r] = await pool.query(
            `UPDATE vales_disponibles
                SET estado = 'disponible'
              WHERE id = ? AND estado = 'borrador'`,
            [id]
        );
        if (!r.affectedRows) return res.status(409).json({ ok:false, error:'Solo se pueden publicar vales en borrador.' });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ---- DELETE /api/vales/:id  (solo si NO está usado) ----
app.delete('/api/vales/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const [vrows] = await pool.query(`SELECT estado FROM vales_disponibles WHERE id = ?`, [id]);
        if (!vrows.length)               return res.status(404).json({ ok:false, error:'Vale no encontrado.' });
        if (vrows[0].estado === 'usado') return res.status(409).json({ ok:false, error:'No se puede eliminar un vale ya usado (queda en historial).' });
        await pool.query(`DELETE FROM vales_disponibles WHERE id = ?`, [id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// =====================================================================
//  COMISIONES (basado en tabla `viajes` extendida)
// =====================================================================

// ---------- GET /api/comisiones  (listar + filtros) ----------
app.get('/api/comisiones', async (req, res) => {
    try {
        const { vehiculo_id, fecha_inicio, fecha_fin, estado, solo_disc } = req.query;

        let sql = `
            SELECT
                v.id,
                v.no_vale          AS vale,
                v.no_oficio        AS oficio,
                COALESCE(NULLIF(TRIM(v.responsable), ''),
                         NULLIF(TRIM(CONCAT_WS(' ', u.nombre, u.apellidos)), ''),
                         u.email
                )                  AS responsable,
                v.estado,
                v.lugar_destino,
                v.estado_dst       AS estadoDst,
                v.municipio,
                v.localidad,
                DATE(v.fecha_inicio) AS inicio,
                DATE(v.fecha_fin)    AS fin,
                v.descripcion,
                v.observaciones    AS obs,
                v.actividades,
                v.km_inicial       AS kmIni,
                v.km_final         AS kmFin,
                v.litros,
                v.precio_litro     AS precioLt,
                v.costo_total      AS costo,
                v.combustible,
                v.ticket_no        AS ticket,
                v.vehiculo_id      AS vId,
                v.usuario_id,
                v.created_at,
                ve.no_economico,
                ve.marca,
                ve.linea,
                ve.modelo
            FROM viajes v
            LEFT JOIN vehiculos ve ON ve.id = v.vehiculo_id
            LEFT JOIN usuarios  u  ON u.id  = v.usuario_id
            WHERE 1=1
        `;
        const params = [];

        if (vehiculo_id) { sql += ' AND v.vehiculo_id = ?'; params.push(vehiculo_id); }
        if (fecha_inicio) { sql += ' AND DATE(v.fecha_inicio) >= ?'; params.push(fecha_inicio); }
        if (fecha_fin)    { sql += ' AND DATE(v.fecha_inicio) <= ?'; params.push(fecha_fin); }
        if (estado) {
            // Acepta "En comisión" (con tilde, viene del filtro del front)
            // y "En comision" (sin tilde, como lo guarda /api/viajes).
            // Hacemos la búsqueda tolerante a tilde y mayúsculas.
            const variantes = estadoVariantes(estado);
            sql += ` AND v.estado IN (${variantes.map(() => '?').join(',')})`;
            params.push(...variantes);
        }
        if (solo_disc === '1' || solo_disc === 'true') {
            sql += ' AND v.costo_total > 0';
        }

        sql += ' ORDER BY v.fecha_inicio DESC, v.id DESC LIMIT 500';

        const [rows] = await pool.query(sql, params);
        res.json({ ok: true, comisiones: rows });
    } catch (err) {
        console.error('Error GET /api/comisiones:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ---------- POST /api/comisiones  (crear) ----------
//  FIX: ahora persiste TODOS los campos del formulario, incluyendo
//  motivo, nivel_comb_ini y nivel_comb_fin, que antes se perdían.
app.post('/api/comisiones', async (req, res) => {
    try {
        const {
            vale, vale_id, oficio, responsable, estado,
            vehiculo_id, lugar_destino, estadoDst, municipio, localidad,
            inicio, fin, motivo, descripcion, obs,
            kmIni, kmFin,
            nivel_comb_ini, nivel_comb_fin,
            litros, precioLt, costo, combustible, ticket,
            usuario_id
        } = req.body;

        if (!vehiculo_id) {
            return res.status(400).json({ ok: false, error: 'vehiculo_id es obligatorio.' });
        }

        const comisionActiva = await obtenerComisionActivaVehiculo(vehiculo_id);
        if (comisionActiva) {
            return res.status(409).json({
                ok: false,
                error: `Este vehículo ya está en una comisión activa (#${comisionActiva.id}${comisionActiva.lugar_destino ? ' - ' + comisionActiva.lugar_destino : ''}). Finaliza esa comisión antes de iniciar otra.`
            });
        }

        // Si el front mandó vale_id, lo buscamos para autorellenar los campos
        // y validar que siga disponible.
        let valeRow = null;
        if (vale_id) {
            const [vrows] = await pool.query(
                `SELECT id, no_vale, folio, cantidad, precio_litro, litros, estado
                   FROM vales_disponibles WHERE id = ? LIMIT 1`,
                [vale_id]
            );
            if (!vrows.length) {
                return res.status(404).json({ ok: false, error: 'El vale seleccionado no existe.' });
            }
            if (vrows[0].estado !== 'disponible') {
                return res.status(409).json({ ok: false, error: 'El vale ya fue usado por otra comisión.' });
            }
            valeRow = vrows[0];
        }

        // Si hay vale, sus datos tienen prioridad sobre lo que mandó el front
        const valeNo    = valeRow ? valeRow.no_vale       : (vale || 'S/V');
        const ticketNo  = valeRow ? valeRow.folio         : (ticket || null);
        const litrosN   = valeRow ? Number(valeRow.litros)       : (parseFloat(litros)   || 0);
        const precioN   = valeRow ? Number(valeRow.precio_litro) : (parseFloat(precioLt) || 0);
        const costoN    = valeRow
            ? Number(valeRow.cantidad)
            : ((costo !== undefined && costo !== null && costo !== '')
                ? parseFloat(costo)
                : (litrosN * precioN));

        // El número de oficio SIEMPRE lo genera el servidor (ignora cualquier
        // valor que mande el front). Formato: CM-DD-MM-YY-NN.
        const numeroOficio = await generarNumeroOficio();

        const [r] = await pool.query(
            `INSERT INTO viajes
                (usuario_id, vehiculo_id,
                 no_vale, no_oficio, responsable,
                 lugar_destino, estado_dst, municipio, localidad,
                 motivo, descripcion, observaciones,
                 km_inicial, km_final,
                 nivel_comb_ini, nivel_comb_fin,
                 litros, precio_litro, costo_total, combustible, ticket_no,
                 fecha_inicio, fecha_fin, estado, qr_token)
             VALUES
                (?, ?,
                 ?, ?, ?,
                 ?, ?, ?, ?,
                 ?, ?, ?,
                 ?, ?,
                 ?, ?,
                 ?, ?, ?, ?, ?,
                 ?, ?, ?, UUID())`,
            [
                usuario_id || 1, parseInt(vehiculo_id, 10),
                valeNo, numeroOficio, responsable || null,
                lugar_destino || null, estadoDst || null, municipio || null, localidad || null,
                motivo || null, descripcion || null, obs || null,
                parseInt(kmIni, 10) || 0,
                (kmFin !== undefined && kmFin !== null && kmFin !== '') ? parseInt(kmFin, 10) : null,
                nivel_comb_ini || null, nivel_comb_fin || null,
                litrosN, precioN, costoN, combustible || null, ticketNo,
                inicio || null, fin || null, estado || 'Pendiente'
            ]
        );

        // Marcar el vale como usado y enlazarlo a esta comisión
        if (valeRow) {
            await pool.query(
                `UPDATE vales_disponibles
                    SET estado = 'usado', viaje_id = ?, used_at = NOW()
                  WHERE id = ?`,
                [r.insertId, valeRow.id]
            );
        }

        await registrarBitacora(usuario_id || null,
            `Comisión creada (oficio ${numeroOficio}, vale ${valeNo})`,
            'comisiones', r.insertId, req.ip);
        res.json({ ok: true, id: r.insertId, no_oficio: numeroOficio });
    } catch (err) {
        console.error('Error POST /api/comisiones:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ---------- PUT /api/comisiones/:id  (actualizar) ----------
app.put('/api/comisiones/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });

        const {
            vale, oficio, responsable, estado,
            vehiculo_id, lugar_destino, estadoDst, municipio, localidad,
            inicio, fin, motivo, descripcion, obs,
            kmIni, kmFin,
            nivel_comb_ini, nivel_comb_fin,
            litros, precioLt, costo, combustible, ticket
        } = req.body;

        if (vehiculo_id) {
            const comisionActiva = await obtenerComisionActivaVehiculo(vehiculo_id, id);
            if (comisionActiva) {
                return res.status(409).json({
                    ok: false,
                    error: `Este vehículo ya está en una comisión activa (#${comisionActiva.id}${comisionActiva.lugar_destino ? ' - ' + comisionActiva.lugar_destino : ''}). No se puede asignar a otra comisión hasta finalizarla.`
                });
            }
        }

        const litrosN  = parseFloat(litros)   || 0;
        const precioN  = parseFloat(precioLt) || 0;
        const costoN   = (costo !== undefined && costo !== null && costo !== '')
                         ? parseFloat(costo)
                         : (litrosN * precioN);

        const [r] = await pool.query(
            `UPDATE viajes SET
                no_vale       = ?,
                no_oficio     = ?,
                responsable   = ?,
                vehiculo_id   = ?,
                lugar_destino = ?,
                estado_dst    = ?,
                municipio     = ?,
                localidad     = ?,
                motivo        = COALESCE(?, motivo),
                descripcion   = ?,
                observaciones = ?,
                km_inicial    = ?,
                km_final      = ?,
                nivel_comb_ini = COALESCE(?, nivel_comb_ini),
                nivel_comb_fin = COALESCE(?, nivel_comb_fin),
                litros        = ?,
                precio_litro  = ?,
                costo_total   = ?,
                combustible   = ?,
                ticket_no     = ?,
                fecha_inicio  = ?,
                fecha_fin     = ?,
                estado        = ?
             WHERE id = ?`,
            [
                vale || 'S/V', oficio || null, responsable || null,
                parseInt(vehiculo_id, 10) || null,
                lugar_destino || null, estadoDst || null, municipio || null, localidad || null,
                motivo || null,
                descripcion || null, obs || null,
                parseInt(kmIni, 10) || 0,
                (kmFin !== undefined && kmFin !== null && kmFin !== '') ? parseInt(kmFin, 10) : null,
                nivel_comb_ini || null, nivel_comb_fin || null,
                litrosN, precioN, costoN, combustible || 'Gasolina Magna', ticket || null,
                inicio || null, fin || null, estado || 'Pendiente',
                id
            ]
        );

        if (r.affectedRows === 0) {
            return res.status(404).json({ ok: false, error: 'Comisión no encontrada.' });
        }

        await registrarBitacora(null, `Comisión actualizada id=${id}`, 'comisiones', id, req.ip);
        res.json({ ok: true });
    } catch (err) {
        console.error('Error PUT /api/comisiones/:id:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ---------- DELETE /api/comisiones/:id  (eliminar) ----------
app.delete('/api/comisiones/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });

        const [r] = await pool.query('DELETE FROM viajes WHERE id = ?', [id]);

        if (r.affectedRows === 0) {
            return res.status(404).json({ ok: false, error: 'Comisión no encontrada.' });
        }

        await registrarBitacora(null, `Comisión eliminada id=${id}`, 'comisiones', id, req.ip);
        res.json({ ok: true });
    } catch (err) {
        // Si hay vales/denuncias asociadas, FK puede impedir el borrado
        if (err.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(409).json({
                ok: false,
                error: 'No se puede eliminar: la comisión tiene vales o denuncias asociadas.'
            });
        }
        console.error('Error DELETE /api/comisiones/:id:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ---------- PUT /api/comisiones/:id/finalizar  (admin) ----------
//  FIX (req 2): permite al administrador finalizar directamente una comisión
//  (paralelo a PUT /api/viajes/:id/finalizar, pero protegido por rol_id = 1).
//  Acepta:
//    - admin_id (obligatorio, debe ser rol_id = 1 y activo = 1)
//    - km_final (recomendado)
//    - nivel_comb_fin (porcentaje numérico capturado vía Gasolina.py)
//    - observaciones (opcional)
//  Actualiza el viaje a estado 'Finalizado' y refresca km_actual del vehículo.
app.put('/api/comisiones/:id/finalizar', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { admin_id, km_final, nivel_comb_fin, observaciones, actividades } = req.body;

        if (!id)       return res.status(400).json({ ok: false, error: 'ID inválido.' });
        if (!admin_id) return res.status(400).json({ ok: false, error: 'admin_id es obligatorio.' });

        // Verificar rol del solicitante
        const [adm] = await pool.query(
            'SELECT id, rol_id, activo FROM usuarios WHERE id = ?',
            [admin_id]
        );
        if (adm.length === 0 || adm[0].rol_id !== 1 || !adm[0].activo) {
            return res.status(403).json({ ok: false, error: 'Solo un administrador activo puede finalizar.' });
        }

        // Validar que el viaje existe y no esté ya finalizado
        const [vrows] = await pool.query(
            'SELECT id, estado, vehiculo_id FROM viajes WHERE id = ?',
            [id]
        );
        if (vrows.length === 0)            return res.status(404).json({ ok: false, error: 'Comisión no encontrada.' });
        if (vrows[0].estado === 'Finalizado') return res.status(409).json({ ok: false, error: 'La comisión ya está finalizada.' });

        const kmFinalN = (km_final !== undefined && km_final !== null && km_final !== '')
            ? parseInt(km_final, 10) : null;
        const nivelFin = (nivel_comb_fin !== undefined && nivel_comb_fin !== null && nivel_comb_fin !== '')
            ? String(nivel_comb_fin) : null;

        // Finalizar el viaje
        await pool.query(
            `UPDATE viajes
             SET km_final       = COALESCE(?, km_final),
                 nivel_comb_fin = COALESCE(?, nivel_comb_fin),
                 observaciones  = COALESCE(?, observaciones),
                 actividades    = COALESCE(?, actividades),
                 fecha_fin      = NOW(),
                 estado         = 'Finalizado'
             WHERE id = ?`,
            [kmFinalN, nivelFin, observaciones || null, actividades || null, id]
        );

        // Si existe una solicitud de finalización pendiente, marcarla como aprobada
        await pool.query(
            `UPDATE solicitudes_finalizacion
             SET estado = 'aprobada',
                 admin_id = ?,
                 comentario_admin = COALESCE(comentario_admin, 'Finalizada directamente por administrador'),
                 resuelta_at = NOW()
             WHERE viaje_id = ? AND estado = 'pendiente'`,
            [admin_id, id]
        );

        // Actualizar km del vehículo si tenemos km_final
        if (kmFinalN) {
            await pool.query(
                `UPDATE vehiculos SET km_actual = ? WHERE id = ?`,
                [kmFinalN, vrows[0].vehiculo_id]
            );
        }

        await registrarBitacora(admin_id, `Comisión finalizada por admin id=${id}`, 'comisiones', id, req.ip);
        // Notify citizens who reported this trip
        await notificarCiudadanosAlFinalizar(id);
        res.json({ ok: true });
    } catch (err) {
        console.error('Error PUT /api/comisiones/:id/finalizar:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});


// ============== VIAJES / COMISIONES ==============
app.get('/api/viajes', async (req, res) => {
    try {
        const usuario_id = req.query.usuario_id;
        let sql = `
            SELECT v.id, v.no_vale, v.no_oficio, v.lugar_destino, v.motivo,
                   v.km_inicial, v.km_final, v.nivel_comb_ini, v.fecha_inicio,
                   v.fecha_fin, v.estado, v.created_at,
                   ve.no_economico, ve.marca, ve.linea, ve.modelo,
                   u.nombre AS usuario_nombre, u.email AS usuario_email
            FROM viajes v
            JOIN vehiculos ve ON ve.id = v.vehiculo_id
            JOIN usuarios u   ON u.id  = v.usuario_id`;
        const params = [];
        if (usuario_id) { sql += ' WHERE v.usuario_id = ?'; params.push(usuario_id); }
        sql += ' ORDER BY v.created_at DESC LIMIT 200';
        const [rows] = await pool.query(sql, params);
        res.json({ ok: true, viajes: rows });
    } catch (err) {
        console.error('Error /api/viajes:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/viajes', async (req, res) => {
    try {
        const {
            usuario_id, vehiculo_id, no_oficio, lugar_destino, motivo,
            km_inicial, nivel_comb_ini, fecha_inicio,
            estadoDst, municipio, localidad,
            responsable,
            vale_id   // ← NUEVO: id del vale seleccionado del combo (opcional)
        } = req.body;
        if (!usuario_id || !vehiculo_id || !lugar_destino || km_inicial === undefined) {
            return res.status(400).json({ ok: false, error: 'Faltan campos: usuario_id, vehiculo_id, lugar_destino, km_inicial.' });
        }

        const comisionActiva = await obtenerComisionActivaVehiculo(vehiculo_id);
        if (comisionActiva) {
            return res.status(409).json({
                ok: false,
                error: `Este vehículo ya está en una comisión activa (#${comisionActiva.id}${comisionActiva.lugar_destino ? ' - ' + comisionActiva.lugar_destino : ''}). Finaliza esa comisión antes de iniciar otra.`
            });
        }

        // Si el front no mandó "responsable", lo derivamos del usuario logueado.
        let responsableFinal = (responsable || '').trim();
        if (!responsableFinal) {
            const [urows] = await pool.query(
                'SELECT nombre, apellidos, email FROM usuarios WHERE id = ? LIMIT 1',
                [usuario_id]
            );
            if (urows.length) {
                const u = urows[0];
                responsableFinal = `${u.nombre || ''} ${u.apellidos || ''}`.trim() || u.email || null;
            }
        }

        // Si se eligió un vale, lo buscamos para copiar sus datos al viaje
        // y validar que siga disponible.
        let valeRow = null;
        if (vale_id) {
            const [vrows] = await pool.query(
                `SELECT id, no_vale, folio, cantidad, precio_litro, litros, estado
                   FROM vales_disponibles WHERE id = ? LIMIT 1`,
                [vale_id]
            );
            if (!vrows.length) {
                return res.status(404).json({ ok: false, error: 'El vale seleccionado no existe.' });
            }
            if (vrows[0].estado !== 'disponible') {
                return res.status(409).json({ ok: false, error: 'El vale ya fue usado por otra comisión.' });
            }
            valeRow = vrows[0];
        }

        const noVale  = valeRow ? valeRow.no_vale : 'S/V';
        const litros  = valeRow ? valeRow.litros : null;
        const precio  = valeRow ? valeRow.precio_litro : null;
        const costo   = valeRow ? valeRow.cantidad : null;
        const ticket  = valeRow ? valeRow.folio : null;

        // El número de oficio SIEMPRE lo genera el servidor (ignora cualquier
        // valor que mande el front). Formato: CM-DD-MM-YY-NN.
        const numeroOficio = await generarNumeroOficio();

        const [r] = await pool.query(
            `INSERT INTO viajes
             (usuario_id, vehiculo_id, no_vale, no_oficio, responsable, lugar_destino,
              estado_dst, municipio, localidad,
              motivo, km_inicial, nivel_comb_ini, fecha_inicio, estado, qr_token,
              litros, precio_litro, costo_total, ticket_no)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'En comision', UUID(), ?, ?, ?, ?)`,
            [usuario_id, vehiculo_id, noVale, numeroOficio, responsableFinal || null, lugar_destino,
             estadoDst || null, municipio || null, localidad || null,
             motivo || null, km_inicial, nivel_comb_ini || null,
             fecha_inicio || new Date(),
             litros, precio, costo, ticket]
        );

        // Marcar el vale como usado y enlazarlo a esta comisión
        if (valeRow) {
            await pool.query(
                `UPDATE vales_disponibles
                    SET estado = 'usado', viaje_id = ?, used_at = NOW()
                  WHERE id = ?`,
                [r.insertId, valeRow.id]
            );
        }

        await registrarBitacora(usuario_id, `Comisión iniciada a ${lugar_destino} (oficio ${numeroOficio}${valeRow ? ', vale ' + valeRow.no_vale : ''})`, 'viajes', r.insertId, req.ip);
        res.json({ ok: true, id: r.insertId, no_oficio: numeroOficio });
    } catch (err) {
        console.error('Error POST /api/viajes:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.put('/api/viajes/:id/finalizar', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { km_final, nivel_comb_fin, observaciones } = req.body;
        await pool.query(
            `UPDATE viajes
             SET km_final = ?, nivel_comb_fin = ?, observaciones = ?,
                 fecha_fin = NOW(), estado = 'Finalizado'
             WHERE id = ?`,
            [km_final, nivel_comb_fin || null, observaciones || null, id]
        );
        // Actualizar km del vehículo
        if (km_final) {
            await pool.query(
                `UPDATE vehiculos v
                 JOIN viajes vi ON vi.vehiculo_id = v.id
                 SET v.km_actual = ?
                 WHERE vi.id = ?`,
                [km_final, id]
            );
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('Error PUT /api/viajes/:id/finalizar:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

function normalizarEstadoMantenimiento(estado) {
    const e = String(estado || 'pendiente').trim().toLowerCase();
    if (['resuelto', 'finalizada', 'finalizado'].includes(e)) return 'resuelto';
    if (['en revision', 'en revisión', 'revision', 'revisión'].includes(e)) return 'en_revision';
    return 'pendiente';
}

// ============== MANTENIMIENTO ==============
app.get('/api/mantenimiento/:vehiculo_id', async (req, res) => {
    try {
        const vid = parseInt(req.params.vehiculo_id, 10);
        const [rows] = await pool.query(
            `SELECT m.*, CONCAT_WS(' ', u.nombre, u.apellidos) AS usuario_nombre
             FROM mantenimiento_observaciones m
             LEFT JOIN usuarios u ON u.id = m.usuario_id
             WHERE m.vehiculo_id = ?
             ORDER BY m.created_at DESC`,
            [vid]
        );

        const [resumen] = await pool.query(
            `SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN estado = 'resuelto' THEN 1 ELSE 0 END) AS resueltas,
                COALESCE(SUM(costo), 0) AS costo_total
             FROM mantenimiento_observaciones
             WHERE vehiculo_id = ?`,
            [vid]
        );
        res.json({ ok: true, observaciones: rows, resumen: resumen[0] });
    } catch (err) {
        console.error('Error /api/mantenimiento:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/mantenimiento', async (req, res) => {
    try {
        const {
            vehiculo_id, usuario_id, componente, codigo_ref, km_reporte,
            severidad, descripcion, estado, costo, resolucion
        } = req.body;
        if (!vehiculo_id || !usuario_id || !componente || !severidad || !descripcion) {
            return res.status(400).json({ ok: false, error: 'Faltan campos obligatorios.' });
        }
        const [r] = await pool.query(
            `INSERT INTO mantenimiento_observaciones
             (vehiculo_id, usuario_id, componente, codigo_ref, km_reporte, severidad,
              descripcion, estado, costo, resolucion, fecha_resolucion)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [vehiculo_id, usuario_id, componente, codigo_ref || null, km_reporte || null, severidad,
             descripcion, normalizarEstadoMantenimiento(estado), costo || 0,
             resolucion || null, normalizarEstadoMantenimiento(estado) === 'resuelto' ? new Date() : null]
        );
        await registrarBitacora(usuario_id, `Observación registrada: ${componente}`, 'mantenimiento', r.insertId, req.ip);
        res.json({ ok: true, id: r.insertId });
    } catch (err) {
        console.error('Error POST /api/mantenimiento:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ============== NOTIFICACIONES ==============
app.get('/api/notificaciones/:usuario_id', async (req, res) => {
    try {
        const uid = parseInt(req.params.usuario_id, 10);
        const [rows] = await pool.query(
            `SELECT id, titulo, cuerpo, leida, tipo, created_at
             FROM notificaciones
             WHERE usuario_id = ?
             ORDER BY created_at DESC
             LIMIT 50`,
            [uid]
        );
        res.json({ ok: true, notificaciones: rows });
    } catch (err) {
        console.error('Error /api/notificaciones:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ============== RESUMEN MENSUAL (panel de Diego) ==============
app.get('/api/resumen-mes/:usuario_id', async (req, res) => {
    try {
        const uid = parseInt(req.params.usuario_id, 10);
        const [rows] = await pool.query(
            `SELECT
                COUNT(*) AS viajes,
                COALESCE(SUM(GREATEST(km_final - km_inicial, 0)), 0) AS km,
                COALESCE(SUM((SELECT COALESCE(SUM(litros),0) FROM vales_combustible vc WHERE vc.viaje_id = v.id)), 0) AS litros
             FROM viajes v
             WHERE v.usuario_id = ?
               AND v.fecha_inicio >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
            [uid]
        );
        res.json({ ok: true, resumen: rows[0] });
    } catch (err) {
        console.error('Error /api/resumen-mes:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ============== DASHBOARD (cards del menú principal admin) ==============
app.get('/api/dashboard', async (req, res) => {
    try {
        const [veh]    = await pool.query('SELECT COUNT(*) AS n FROM vehiculos WHERE activo = 1');
        const [vales]  = await pool.query(`SELECT COUNT(*) AS n FROM vales_combustible
                                           WHERE fecha_recarga >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`);
        const [alerts] = await pool.query(`SELECT COUNT(*) AS n FROM alertas WHERE estado = 'activa'`);
        const [mant]   = await pool.query(`SELECT COUNT(*) AS n FROM mantenimiento_observaciones
                                           WHERE estado IN ('pendiente','en_revision')`);
        res.json({
            ok: true,
            vehiculos_activos: veh[0].n,
            vales_mes: vales[0].n,
            alertas_pendientes: alerts[0].n,
            fallas_sin_atender: mant[0].n
        });
    } catch (err) {
        console.error('Error /api/dashboard:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// =====================================================================
//  BITÁCORA — GET /api/bitacora  (historial de acciones)
// =====================================================================
app.get('/api/bitacora', async (req, res) => {
    try {
        const limit  = Math.min(parseInt(req.query.limit  || '100', 10), 500);
        const offset = parseInt(req.query.offset || '0', 10);
        const modulo = req.query.modulo || null;
        let sql = `
            SELECT b.id, b.accion, b.modulo, b.entidad_id, b.ip,
                   b.created_at,
                   u.nombre, u.apellidos, u.email
            FROM bitacora b
            LEFT JOIN usuarios u ON u.id = b.usuario_id
        `;
        const params = [];
        if (modulo) { sql += ' WHERE b.modulo = ?'; params.push(modulo); }
        sql += ' ORDER BY b.created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        const [rows] = await pool.query(sql, params);
        const [[{total}]] = await pool.query(
            modulo
                ? 'SELECT COUNT(*) AS total FROM bitacora WHERE modulo = ?'
                : 'SELECT COUNT(*) AS total FROM bitacora',
            modulo ? [modulo] : []
        );
        res.json({ ok: true, registros: rows, total });
    } catch (err) {
        console.error('Error GET /api/bitacora:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// =====================================================================
//  BITÁCORA EXPORTAR — GET /api/bitacora/exportar
//  Devuelve datos completos para PDF/Excel: acciones + vales + km
// =====================================================================
app.get('/api/bitacora/exportar', async (req, res) => {
    try {
        const { desde, hasta, modulo } = req.query;
        const params = [];
        let whereClausulas = [];

        if (modulo) { whereClausulas.push('b.modulo = ?'); params.push(modulo); }
        if (desde)  { whereClausulas.push('DATE(b.created_at) >= ?'); params.push(desde); }
        if (hasta)  { whereClausulas.push('DATE(b.created_at) <= ?'); params.push(hasta); }

        const where = whereClausulas.length ? 'WHERE ' + whereClausulas.join(' AND ') : '';

        const [bitacora] = await pool.query(`
            SELECT b.id, b.accion, b.modulo, b.entidad_id, b.ip, b.created_at,
                   u.nombre, u.apellidos, u.email
            FROM bitacora b
            LEFT JOIN usuarios u ON u.id = b.usuario_id
            ${where}
            ORDER BY b.created_at DESC
            LIMIT 2000
        `, params);

        // Vales con kilómetros por comisión
        const [vales] = await pool.query(`
            SELECT
                vd.id AS vale_id, vd.no_vale, vd.folio, vd.cantidad, vd.litros, vd.precio_litro,
                vd.estado AS vale_estado, vd.created_at AS vale_fecha,
                v.id AS viaje_id, v.lugar_destino, v.km_inicial, v.km_final,
                GREATEST(COALESCE(v.km_final, 0) - COALESCE(v.km_inicial, 0), 0) AS km_recorridos,
                v.estado AS viaje_estado, v.fecha_inicio, v.fecha_fin,
                veh.marca, veh.linea, veh.modelo, veh.no_economico, veh.placas,
                u.nombre AS conductor_nombre, u.apellidos AS conductor_apellidos, u.email AS conductor_email
            FROM vales_disponibles vd
            LEFT JOIN viajes v ON v.id = vd.viaje_id
            LEFT JOIN vehiculos veh ON veh.id = v.vehiculo_id
            LEFT JOIN usuarios u ON u.id = v.usuario_id
            ORDER BY vd.created_at DESC
            LIMIT 1000
        `);

        // Kilómetros totales por vehículo
        const [kmVehiculos] = await pool.query(`
            SELECT
                veh.id, veh.no_economico, veh.marca, veh.linea, veh.modelo, veh.placas,
                veh.km_actual,
                COUNT(v.id) AS total_comisiones,
                COALESCE(SUM(GREATEST(COALESCE(v.km_final,0) - COALESCE(v.km_inicial,0), 0)), 0) AS km_recorridos_sistema,
                MIN(v.km_inicial) AS km_minimo_registrado,
                MAX(COALESCE(v.km_final, v.km_inicial)) AS km_maximo_registrado
            FROM vehiculos veh
            LEFT JOIN viajes v ON v.vehiculo_id = veh.id AND v.km_inicial IS NOT NULL
            WHERE veh.activo = 1
            GROUP BY veh.id
            ORDER BY veh.no_economico
        `);

        res.json({ ok: true, bitacora, vales, kmVehiculos });
    } catch (err) {
        console.error('Error GET /api/bitacora/exportar:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});


app.get('/api/dashboard/charts', async (req, res) => {
    try {
        // Viajes por estado
        const [porEstado] = await pool.query(`
            SELECT estado, COUNT(*) AS n FROM viajes GROUP BY estado ORDER BY n DESC
        `);
        // Vehículos por tipo
        const [porTipo] = await pool.query(`
            SELECT IFNULL(tipo,'Sin clasificar') AS tipo, COUNT(*) AS n
            FROM vehiculos WHERE activo=1 GROUP BY tipo ORDER BY n DESC
        `);
        // Vales por mes (últimos 6)
        // Compatible con ONLY_FULL_GROUP_BY: primero agrupamos por periodo
        // y después formateamos la etiqueta visible del mes.
        const [valesMes] = await pool.query(`
            SELECT DATE_FORMAT(STR_TO_DATE(CONCAT(periodo, '-01'), '%Y-%m-%d'), '%b %Y') AS mes,
                   vales,
                   litros,
                   costo
            FROM (
                SELECT DATE_FORMAT(fecha_recarga, '%Y-%m') AS periodo,
                       COUNT(*) AS vales,
                       COALESCE(SUM(litros), 0) AS litros,
                       COALESCE(SUM(costo), 0) AS costo
                FROM vales_combustible
                WHERE fecha_recarga >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
                GROUP BY DATE_FORMAT(fecha_recarga, '%Y-%m')
            ) resumen_vales
            ORDER BY periodo
        `);
        // Alertas por tipo
        const [alertasTipo] = await pool.query(`
            SELECT tipo, COUNT(*) AS n FROM alertas
            WHERE estado='activa' GROUP BY tipo ORDER BY n DESC
        `);
        // Top vehículos con más comisiones
        const [topVehiculos] = await pool.query(`
            SELECT CONCAT(COALESCE(v.marca,''),' ',COALESCE(v.linea,'')) AS vehiculo,
                   COUNT(*) AS comisiones
            FROM viajes vi JOIN vehiculos v ON v.id=vi.vehiculo_id
            GROUP BY vi.vehiculo_id, v.marca, v.linea
            ORDER BY comisiones DESC LIMIT 5
        `);
        res.json({ ok: true, porEstado, porTipo, valesMes, alertasTipo, topVehiculos });
    } catch (err) {
        console.error('Error GET /api/dashboard/charts:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// =====================================================================
//  HISTORIAL DE VIAJES DEL USUARIO OPERATIVO
//  Devuelve sus comisiones (registros de la tabla `viajes`) con info
//  de vehículo y, si aplica, de la solicitud de finalización pendiente.
// =====================================================================
app.get('/api/viajes/usuario/:usuario_id', async (req, res) => {
    try {
        const uid = parseInt(req.params.usuario_id, 10);
        if (!uid) return res.status(400).json({ ok: false, error: 'usuario_id inválido.' });

        const [rows] = await pool.query(
            `SELECT v.id, v.no_vale, v.no_oficio, v.lugar_destino, v.motivo,
                    v.km_inicial, v.km_final, v.fecha_inicio, v.fecha_fin,
                    v.estado, v.created_at,
                    ve.no_economico, ve.marca, ve.linea, ve.modelo,
                    (SELECT s.estado FROM solicitudes_finalizacion s
                       WHERE s.viaje_id = v.id ORDER BY s.id DESC LIMIT 1) AS solicitud_estado,
                    (SELECT s.id FROM solicitudes_finalizacion s
                       WHERE s.viaje_id = v.id ORDER BY s.id DESC LIMIT 1) AS solicitud_id
             FROM viajes v
             LEFT JOIN vehiculos ve ON ve.id = v.vehiculo_id
             WHERE v.usuario_id = ?
             ORDER BY v.fecha_inicio DESC, v.id DESC
             LIMIT 200`,
            [uid]
        );
        res.json({ ok: true, viajes: rows });
    } catch (err) {
        console.error('Error GET /api/viajes/usuario/:id:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// =====================================================================
//  SOLICITUDES DE FINALIZACIÓN DE COMISIÓN
// =====================================================================

// ---------- POST /api/solicitudes-finalizacion ----------
//  El usuario operativo crea una solicitud para que el admin la revise.
//  No finaliza la comisión: solo cambia su estado a "Solicitud finalización"
//  e inserta la solicitud en estado "pendiente". Notifica a los admins.
app.post('/api/solicitudes-finalizacion', async (req, res) => {
    try {
        const {
            viaje_id, usuario_id,
            km_final, nivel_comb_fin, observaciones, motivo, actividades
        } = req.body;

        if (!viaje_id || !usuario_id) {
            return res.status(400).json({ ok: false, error: 'viaje_id y usuario_id son obligatorios.' });
        }

        // Validar que el viaje pertenece al usuario y está en curso
        const [vrows] = await pool.query(
            'SELECT id, estado, usuario_id FROM viajes WHERE id = ?',
            [viaje_id]
        );
        if (vrows.length === 0) {
            return res.status(404).json({ ok: false, error: 'La comisión no existe.' });
        }
        const v = vrows[0];
        if (v.usuario_id !== parseInt(usuario_id, 10)) {
            return res.status(403).json({ ok: false, error: 'La comisión no te pertenece.' });
        }
        if (v.estado === 'Finalizado') {
            return res.status(409).json({ ok: false, error: 'La comisión ya está finalizada.' });
        }

        // Evitar duplicados: si ya existe una solicitud pendiente, devolverla
        const [existentes] = await pool.query(
            `SELECT id FROM solicitudes_finalizacion
             WHERE viaje_id = ? AND estado = 'pendiente' LIMIT 1`,
            [viaje_id]
        );
        if (existentes.length > 0) {
            return res.status(409).json({
                ok: false,
                error: 'Ya existe una solicitud pendiente para esta comisión.',
                solicitud_id: existentes[0].id
            });
        }

        const [r] = await pool.query(
            `INSERT INTO solicitudes_finalizacion
                (viaje_id, usuario_id, km_final, nivel_comb_fin, observaciones, motivo, actividades, estado)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente')`,
            [
                viaje_id, usuario_id,
                km_final !== undefined && km_final !== '' ? parseInt(km_final, 10) : null,
                nivel_comb_fin || null,
                observaciones || null,
                motivo || null,
                actividades || null
            ]
        );

        // Marcar el viaje como "Solicitud finalización" (no es Finalizado todavía)
        await pool.query(
            `UPDATE viajes SET estado = 'Solicitud finalización' WHERE id = ?`,
            [viaje_id]
        );

        // Datos para el mensaje al admin
        const [uinfo] = await pool.query(
            'SELECT nombre, apellidos, email FROM usuarios WHERE id = ?',
            [usuario_id]
        );
        const nombreUsuario = uinfo[0]
            ? `${uinfo[0].nombre || ''} ${uinfo[0].apellidos || ''}`.trim() || uinfo[0].email
            : `Usuario #${usuario_id}`;

        await notificarAdmins({
            titulo: 'Solicitud de finalización de comisión',
            cuerpo: `El usuario ${nombreUsuario} quiere finalizar su comisión #${viaje_id}.`,
            tipo: 'solicitud_finalizacion'
        });

        await registrarBitacora(
            usuario_id,
            `Solicitud de finalización para viaje #${viaje_id}`,
            'comisiones',
            r.insertId,
            req.ip
        );

        res.json({ ok: true, id: r.insertId });
    } catch (err) {
        console.error('Error POST /api/solicitudes-finalizacion:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ---------- GET /api/solicitudes-finalizacion ----------
//  El admin lista las solicitudes (por defecto, solo pendientes).
app.get('/api/solicitudes-finalizacion', async (req, res) => {
    try {
        const { estado } = req.query;
        let sql = `
            SELECT s.id, s.viaje_id, s.usuario_id, s.km_final, s.nivel_comb_fin,
                   s.observaciones, s.motivo, s.estado, s.comentario_admin,
                   s.created_at, s.resuelta_at,
                   u.nombre AS usuario_nombre, u.apellidos AS usuario_apellidos, u.email AS usuario_email,
                   v.no_vale, v.lugar_destino, v.fecha_inicio, v.km_inicial,
                   ve.no_economico, ve.marca, ve.linea, ve.modelo
            FROM solicitudes_finalizacion s
            JOIN usuarios u  ON u.id  = s.usuario_id
            JOIN viajes   v  ON v.id  = s.viaje_id
            LEFT JOIN vehiculos ve ON ve.id = v.vehiculo_id
            WHERE 1=1
        `;
        const params = [];
        if (estado) { sql += ' AND s.estado = ?'; params.push(estado); }
        sql += ' ORDER BY s.created_at DESC LIMIT 200';

        const [rows] = await pool.query(sql, params);
        res.json({ ok: true, solicitudes: rows });
    } catch (err) {
        console.error('Error GET /api/solicitudes-finalizacion:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ---------- PUT /api/solicitudes-finalizacion/:id/aprobar ----------
//  Solo el admin (rol_id = 1) puede aceptar. Finaliza el viaje.
app.put('/api/solicitudes-finalizacion/:id/aprobar', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { admin_id, comentario_admin } = req.body;
        if (!id)       return res.status(400).json({ ok: false, error: 'ID inválido.' });
        if (!admin_id) return res.status(400).json({ ok: false, error: 'admin_id es obligatorio.' });

        // Verificar rol del solicitante
        const [adm] = await pool.query(
            'SELECT id, rol_id, activo FROM usuarios WHERE id = ?',
            [admin_id]
        );
        if (adm.length === 0 || adm[0].rol_id !== 1 || !adm[0].activo) {
            return res.status(403).json({ ok: false, error: 'Solo un administrador activo puede aprobar.' });
        }

        // Obtener la solicitud
        const [srows] = await pool.query(
            `SELECT s.id, s.viaje_id, s.usuario_id, s.km_final, s.nivel_comb_fin,
                    s.observaciones, s.actividades, s.estado, v.vehiculo_id
             FROM solicitudes_finalizacion s
             JOIN viajes v ON v.id = s.viaje_id
             WHERE s.id = ?`,
            [id]
        );
        if (srows.length === 0)            return res.status(404).json({ ok: false, error: 'Solicitud no encontrada.' });
        if (srows[0].estado !== 'pendiente') return res.status(409).json({ ok: false, error: 'La solicitud ya fue resuelta.' });

        const sol = srows[0];

        // Finalizar el viaje (copiamos actividades + observaciones a la tabla viajes)
        await pool.query(
            `UPDATE viajes
             SET km_final       = COALESCE(?, km_final),
                 nivel_comb_fin = COALESCE(?, nivel_comb_fin),
                 observaciones  = COALESCE(?, observaciones),
                 actividades    = COALESCE(?, actividades),
                 fecha_fin      = NOW(),
                 estado         = 'Finalizado'
             WHERE id = ?`,
            [sol.km_final, sol.nivel_comb_fin, sol.observaciones, sol.actividades, sol.viaje_id]
        );

        // Actualizar km del vehículo si tenemos km_final
        if (sol.km_final) {
            await pool.query(
                `UPDATE vehiculos SET km_actual = ? WHERE id = ?`,
                [sol.km_final, sol.vehiculo_id]
            );
        }

        // Marcar la solicitud como aprobada
        await pool.query(
            `UPDATE solicitudes_finalizacion
             SET estado = 'aprobada', admin_id = ?, comentario_admin = ?, resuelta_at = NOW()
             WHERE id = ?`,
            [admin_id, comentario_admin || null, id]
        );

        // Notificar al usuario
        await crearNotificacion({
            usuario_id: sol.usuario_id,
            titulo: 'Comisión finalizada',
            cuerpo: `Tu comisión #${sol.viaje_id} fue aprobada y finalizada por el administrador.`,
            tipo: 'comision_aprobada'
        });

        await registrarBitacora(admin_id, `Aprobó finalización de comisión #${sol.viaje_id}`, 'comisiones', sol.viaje_id, req.ip);
        // Notify citizens who reported this trip
        await notificarCiudadanosAlFinalizar(sol.viaje_id);
        res.json({ ok: true });
    } catch (err) {
        console.error('Error PUT /api/solicitudes-finalizacion/:id/aprobar:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ---------- PUT /api/solicitudes-finalizacion/:id/rechazar ----------
//  Solo el admin puede rechazar. La comisión vuelve a "En comision".
app.put('/api/solicitudes-finalizacion/:id/rechazar', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { admin_id, comentario_admin } = req.body;
        if (!id)       return res.status(400).json({ ok: false, error: 'ID inválido.' });
        if (!admin_id) return res.status(400).json({ ok: false, error: 'admin_id es obligatorio.' });

        const [adm] = await pool.query(
            'SELECT id, rol_id, activo FROM usuarios WHERE id = ?',
            [admin_id]
        );
        if (adm.length === 0 || adm[0].rol_id !== 1 || !adm[0].activo) {
            return res.status(403).json({ ok: false, error: 'Solo un administrador activo puede rechazar.' });
        }

        const [srows] = await pool.query(
            `SELECT id, viaje_id, usuario_id, estado
             FROM solicitudes_finalizacion WHERE id = ?`,
            [id]
        );
        if (srows.length === 0)             return res.status(404).json({ ok: false, error: 'Solicitud no encontrada.' });
        if (srows[0].estado !== 'pendiente') return res.status(409).json({ ok: false, error: 'La solicitud ya fue resuelta.' });

        const sol = srows[0];

        // La comisión vuelve a estar "En comision" para que el usuario corrija
        await pool.query(
            `UPDATE viajes SET estado = 'En comision' WHERE id = ?`,
            [sol.viaje_id]
        );

        await pool.query(
            `UPDATE solicitudes_finalizacion
             SET estado = 'rechazada', admin_id = ?, comentario_admin = ?, resuelta_at = NOW()
             WHERE id = ?`,
            [admin_id, comentario_admin || null, id]
        );

        // Notificar al usuario con el mensaje exacto pedido
        await crearNotificacion({
            usuario_id: sol.usuario_id,
            titulo: 'Solicitud rechazada',
            cuerpo: 'Se rechazó tu comisión, revisa que tus datos sean correctos.'
                  + (comentario_admin ? ` Comentario del administrador: ${comentario_admin}` : ''),
            tipo: 'comision_rechazada'
        });

        await registrarBitacora(admin_id, `Rechazó finalización de comisión #${sol.viaje_id}`, 'comisiones', sol.viaje_id, req.ip);

        res.json({ ok: true });
    } catch (err) {
        console.error('Error PUT /api/solicitudes-finalizacion/:id/rechazar:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ---------- PUT /api/notificaciones/:id/leida ----------
app.put('/api/notificaciones/:id/leida', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });

        // Necesitamos el usuario_id para emitir el evento SSE al cliente correcto
        const [[fila]] = await pool.query(
            'SELECT usuario_id FROM notificaciones WHERE id = ?', [id]
        );
        await pool.query('UPDATE notificaciones SET leida = 1 WHERE id = ?', [id]);

        if (fila && fila.usuario_id) {
            sseEnviar(fila.usuario_id, 'leida', { id });
        }

        res.json({ ok: true });
    } catch (err) {
        console.error('Error PUT /api/notificaciones/:id/leida:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ============== BITÁCORA ==============
async function registrarBitacora(usuario_id, accion, modulo, entidad_id, ip) {
    try {
        await pool.query(
            `INSERT INTO bitacora (usuario_id, accion, modulo, entidad_id, ip)
             VALUES (?, ?, ?, ?, ?)`,
            [usuario_id || null, accion, modulo || null, entidad_id || null, ip || null]
        );
    } catch (err) {
        console.warn('Bitácora falló:', err.message);
    }
}

// ============== HELPERS NOTIFICACIONES ==============

// ── SSE BUS: registry de conexiones abiertas por usuario_id ──
const sseClientes = new Map(); // Map<usuario_id, Set<Response>>

function sseRegistrar(usuarioId, res) {
    if (!sseClientes.has(usuarioId)) sseClientes.set(usuarioId, new Set());
    sseClientes.get(usuarioId).add(res);
}

function sseQuitar(usuarioId, res) {
    const set = sseClientes.get(usuarioId);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) sseClientes.delete(usuarioId);
}

function sseEnviar(usuarioId, evento, payload) {
    const set = sseClientes.get(usuarioId);
    if (!set || set.size === 0) return;
    const data = `event: ${evento}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of set) {
        try { res.write(data); } catch (e) { /* conexión rota, se limpia sola */ }
    }
}

// Inserta una notificación dirigida a un usuario concreto.
async function crearNotificacion({ usuario_id, titulo, cuerpo, tipo }) {
    if (!usuario_id) return null;
    try {
        const [r] = await pool.query(
            `INSERT INTO notificaciones (usuario_id, titulo, cuerpo, tipo, leida)
             VALUES (?, ?, ?, ?, 0)`,
            [usuario_id, titulo || 'Notificación', cuerpo || '', tipo || 'info']
        );

        // ── Empujar en tiempo real al/los clientes SSE de este usuario ──
        sseEnviar(usuario_id, 'nueva', {
            id: r.insertId,
            usuario_id,
            titulo: titulo || 'Notificación',
            cuerpo: cuerpo || '',
            tipo:   tipo   || 'info',
            leida:  0,
            created_at: new Date().toISOString()
        });

        return r.insertId;
    } catch (err) {
        console.warn('No se pudo crear notificación:', err.message);
        return null;
    }
}

// Envía la misma notificación a todos los administradores (rol_id = 1, activos)
async function notificarAdmins({ titulo, cuerpo, tipo }) {
    try {
        const [admins] = await pool.query(
            'SELECT id FROM usuarios WHERE rol_id = 1 AND activo = 1'
        );
        for (const a of admins) {
            await crearNotificacion({ usuario_id: a.id, titulo, cuerpo, tipo });
        }
        return admins.length;
    } catch (err) {
        console.warn('No se pudo notificar a admins:', err.message);
        return 0;
    }
}

// ── ENDPOINT SSE: GET /api/notificaciones/stream/:usuario_id ──
// El cliente abre una conexión y recibe eventos "nueva" y "leida" en vivo.
app.get('/api/notificaciones/stream/:usuario_id', (req, res) => {
    const usuarioId = parseInt(req.params.usuario_id, 10);
    if (!usuarioId) return res.status(400).end();

    res.set({
        'Content-Type':      'text/event-stream',
        'Cache-Control':     'no-cache, no-transform',
        'Connection':        'keep-alive',
        'X-Accel-Buffering': 'no'   // nginx friendly
    });
    res.flushHeaders?.();

    // Saludo inicial — confirma al cliente que el canal está vivo
    res.write(`event: hola\ndata: ${JSON.stringify({ ok: true, usuario_id: usuarioId, ts: Date.now() })}\n\n`);

    sseRegistrar(usuarioId, res);

    // Heartbeat cada 25s para que proxies no cierren la conexión por idle
    const hb = setInterval(() => {
        try { res.write(`: heartbeat ${Date.now()}\n\n`); } catch (e) { /* roto */ }
    }, 25000);

    req.on('close', () => {
        clearInterval(hb);
        sseQuitar(usuarioId, res);
    });
});

// ============== ARRANQUE ==============
// =====================================================================
//  SIGEPAV — Módulo Ciudadano
//  INSTRUCCIONES DE INTEGRACIÓN:
//
//  1. Instala las dependencias nuevas:
//       npm install nodemailer multer qrcode express-rate-limit uuid
//
//  2. Copia este bloque COMPLETO y pégalo en Server.js,
//     justo ANTES de la línea:   app.listen(PORT, () => {
//
//  3. Añade al inicio de Server.js (junto a los otros require):
//       const nodemailer = require('nodemailer');
//       const multer     = require('multer');
//       const QRCode     = require('qrcode');
//       const rateLimit  = require('express-rate-limit');
//       const { v4: uuidv4 } = require('uuid');
//       const fs         = require('fs');
//       const path       = require('path');
//
//  4. Añade las variables de entorno a tu .env:
//       MAIL_HOST=smtp.gmail.com
//       MAIL_PORT=587
//       MAIL_USER=tu_cuenta@gmail.com
//       MAIL_PASS=tu_app_password
//       MAIL_FROM="SIGEPAV <tu_cuenta@gmail.com>"
//       BASE_URL=http://localhost:3000
//
//  5. Ejecuta el SQL de ciudadano_migration.sql en tu base de datos.
//
//  6. Copia ciudadano.html, ciudadano.css, ciudadano.js y
//     seguimiento-publico.html a la raíz del proyecto.
// =====================================================================

// ── New requires (add at top of Server.js) ────────────────────────────
// const nodemailer = require('nodemailer');
// const multer     = require('multer');
// const QRCode     = require('qrcode');
// const rateLimit  = require('express-rate-limit');
// const { v4: uuidv4 } = require('uuid');
// const fs   = require('fs');
// const path = require('path');

// =====================================================================
//  ██████╗  ██╗   ██╗██████╗ ██╗     ██╗ ██████╗
//  ██╔══██╗ ██║   ██║██╔══██╗██║     ██║██╔════╝
//  ██████╔╝ ██║   ██║██████╔╝██║     ██║██║
//  ██╔═══╝  ██║   ██║██╔══██╗██║     ██║██║
//  ██║      ╚██████╔╝██████╔╝███████╗██║╚██████╗
//  ╚═╝       ╚═════╝ ╚═════╝ ╚══════╝╚═╝ ╚═════╝
//  CITIZEN MODULE — PUBLIC ROUTES (NO AUTH REQUIRED)
// =====================================================================

// ── Nodemailer transport ───────────────────────────────────────────────
const mailTransport = nodemailer.createTransport({
    host:   process.env.MAIL_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.MAIL_PORT || '587', 10),
    secure: false,  // true only for port 465
    auth: {
        user: process.env.MAIL_USER || '',
        pass: process.env.MAIL_PASS || ''
    }
});

// ── Multer — evidencia ciudadana tomada con cámara ───────────────────
const evidenciaStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, 'uploads', 'evidencias');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `ev_${Date.now()}_${uuidv4().slice(0,8)}${ext}`);
    }
});
const uploadEvidencia = multer({
    storage: evidenciaStorage,
    limits: { fileSize: 5 * 1024 * 1024 },  // 5 MB
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png'];
        if (!allowed.includes(file.mimetype)) {
            return cb(new Error('Solo se permiten imágenes JPG o PNG.'));
        }
        cb(null, true);
    }
});


// ── Multer — QR images storage ────────────────────────────────────────
const qrStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, 'uploads', 'qr');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, file.originalname)
});

// ── Rate limiters ──────────────────────────────────────────────────────
const publicApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 60,
    message: { ok: false, error: 'Demasiadas solicitudes. Intenta en 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false
});

const reportLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,  // 1 hour
    max: 5,
    message: { ok: false, error: 'Límite de reportes alcanzado. Intenta en 1 hora.' },
    standardHeaders: true,
    legacyHeaders: false
});

// ── Serve public static HTML files ────────────────────────────────────
app.get('/ciudadano.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'ciudadano.html'));
});

app.get('/seguimiento-publico/:token', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'seguimiento-publico.html'));
});

// Serve uploaded files (evidences, QR images)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Ensure citizen tables exist on boot ───────────────────────────────
async function asegurarTablasCiudadano() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS reportes_ciudadanos (
                id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
                viaje_id          INT UNSIGNED  NULL DEFAULT NULL,
                vehiculo_id       INT UNSIGNED  NULL DEFAULT NULL,
                nombre_ciudadano  VARCHAR(120)  NULL DEFAULT NULL,
                correo_ciudadano  VARCHAR(150)  NOT NULL,
                motivo            VARCHAR(100)  NOT NULL,
                descripcion       TEXT          NULL DEFAULT NULL,
                evidencia_url     VARCHAR(300)  NULL DEFAULT NULL,
                evidencia_origen  VARCHAR(30)   NULL DEFAULT NULL,
                evidencia_tomada_en DATETIME    NULL DEFAULT NULL,
                comentario_admin TEXT          NULL DEFAULT NULL,
                resuelto_at       DATETIME      NULL DEFAULT NULL,
                estatus           ENUM('nuevo','en_revision','resuelto','descartado')
                                               NOT NULL DEFAULT 'nuevo',
                token_seguimiento VARCHAR(36)   NOT NULL,
                notificado        TINYINT(1)    NOT NULL DEFAULT 0,
                created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY uq_reporte_token (token_seguimiento),
                INDEX idx_reporte_viaje    (viaje_id),
                INDEX idx_reporte_vehiculo (vehiculo_id),
                INDEX idx_reporte_estatus  (estatus),
                CONSTRAINT fk_reporte_viaje
                    FOREIGN KEY (viaje_id)    REFERENCES viajes    (id) ON DELETE SET NULL,
                CONSTRAINT fk_reporte_vehiculo
                    FOREIGN KEY (vehiculo_id) REFERENCES vehiculos (id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS comision_interesados (
                id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
                viaje_id          INT UNSIGNED NULL DEFAULT NULL,
                vehiculo_id       INT UNSIGNED NULL DEFAULT NULL,
                nombre_ciudadano  VARCHAR(120) NULL DEFAULT NULL,
                correo_ciudadano  VARCHAR(150) NOT NULL,
                token_seguimiento VARCHAR(36)  NOT NULL,
                notificado        TINYINT(1)   NOT NULL DEFAULT 0,
                created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY uq_interes_token (token_seguimiento),
                UNIQUE KEY uq_interes_viaje_correo (viaje_id, correo_ciudadano),
                INDEX idx_interes_viaje (viaje_id),
                INDEX idx_interes_vehiculo (vehiculo_id),
                CONSTRAINT fk_interes_viaje
                    FOREIGN KEY (viaje_id) REFERENCES viajes(id) ON DELETE SET NULL,
                CONSTRAINT fk_interes_vehiculo
                    FOREIGN KEY (vehiculo_id) REFERENCES vehiculos(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Compatibilidad con bases existentes: agrega columnas nuevas si faltan.
        // Se intenta primero con IF NOT EXISTS; si el MySQL/MariaDB no lo soporta,
        // se hace fallback a ALTER individual ignorando columnas duplicadas.
        try {
            await pool.query(`
                ALTER TABLE reportes_ciudadanos
                ADD COLUMN IF NOT EXISTS evidencia_origen VARCHAR(30) NULL DEFAULT NULL AFTER evidencia_url,
                ADD COLUMN IF NOT EXISTS evidencia_tomada_en DATETIME NULL DEFAULT NULL AFTER evidencia_origen,
                ADD COLUMN IF NOT EXISTS comentario_admin TEXT NULL DEFAULT NULL AFTER evidencia_tomada_en,
                ADD COLUMN IF NOT EXISTS resuelto_at DATETIME NULL DEFAULT NULL AFTER comentario_admin
            `);
        } catch (alterErr) {
            for (const sql of [
                `ALTER TABLE reportes_ciudadanos ADD COLUMN evidencia_origen VARCHAR(30) NULL DEFAULT NULL AFTER evidencia_url`,
                `ALTER TABLE reportes_ciudadanos ADD COLUMN evidencia_tomada_en DATETIME NULL DEFAULT NULL AFTER evidencia_origen`,
                `ALTER TABLE reportes_ciudadanos ADD COLUMN comentario_admin TEXT NULL DEFAULT NULL AFTER evidencia_tomada_en`,
                `ALTER TABLE reportes_ciudadanos ADD COLUMN resuelto_at DATETIME NULL DEFAULT NULL AFTER comentario_admin`
            ]) {
                try { await pool.query(sql); }
                catch (e) {
                    if (e.code !== 'ER_DUP_FIELDNAME') {
                        console.warn('No se pudo asegurar columna de evidencia ciudadana:', e.message);
                    }
                }
            }
        }

        // Asegura columnas QR en vehiculos de forma compatible con MySQL/MariaDB.
        await asegurarColumna('vehiculos', 'qr_token', 'VARCHAR(36) NULL DEFAULT NULL AFTER activo');
        await asegurarColumna('vehiculos', 'qr_image_path', 'VARCHAR(300) NULL DEFAULT NULL AFTER qr_token');

        console.log('✅ Tablas ciudadano listas.');
    } catch (err) {
        console.warn('⚠️  asegurarTablasCiudadano:', err.message);
    }
}
// Call in the boot IIFE (add this line to the existing boot async IIFE):
// await asegurarTablasCiudadano();

// ── QR generation helper ───────────────────────────────────────────────
async function generarQRVehiculo(vehiculoId, qrToken) {
    try {
        const baseUrl = BASE_URL;
        const url     = `${baseUrl}/ciudadano.html?token=${qrToken}`;
        const dir     = path.join(__dirname, 'uploads', 'qr');
        fs.mkdirSync(dir, { recursive: true });

        const filename = `qr_${vehiculoId}.png`;
        const filepath = path.join(dir, filename);
        const relPath  = `uploads/qr/${filename}`;

        await QRCode.toFile(filepath, url, {
            type:  'png',
            width: 300,
            margin: 2,
            color: { dark: '#0d2d6b', light: '#ffffff' }
        });

        await pool.query(
            'UPDATE vehiculos SET qr_image_path = ? WHERE id = ?',
            [relPath, vehiculoId]
        );

        console.log(`   → QR generado: ${filepath}`);
        return relPath;
    } catch (err) {
        console.warn('⚠️  generarQRVehiculo:', err.message);
        return null;
    }
}

// ── Expose QR generation on vehicle POST (hook into existing route) ───
//  Call this after the existing POST /api/vehiculos inserts the vehicle.
//  Add the following line inside the existing POST /api/vehiculos handler,
//  right after `const nuevoId = result.insertId;` :
//
//    // Generate QR image (non-blocking)
//    const [[vqr]] = await pool.query(
//        'SELECT qr_token FROM vehiculos WHERE id = ?', [nuevoId]);
//    if (vqr && vqr.qr_token) {
//        generarQRVehiculo(nuevoId, vqr.qr_token).catch(console.warn);
//    }

// ── POST /api/admin/regenerar-qr ──────────────────────────────────────
//  Regenera los QR de todos los vehículos activos con la BASE_URL actual.
//  Requiere sesión de administrador.
app.post('/api/admin/regenerar-qr', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, qr_token FROM vehiculos WHERE activo = 1 AND qr_token IS NOT NULL'
        );
        let ok = 0, fail = 0;
        for (const v of rows) {
            const r = await generarQRVehiculo(v.id, v.qr_token);
            r ? ok++ : fail++;
        }
        res.json({ ok: true, regenerados: ok, fallidos: fail, base_url: BASE_URL });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// =====================================================================
//  PUBLIC API ROUTES
// =====================================================================

// ── GET /api/public/vehiculo/:token ───────────────────────────────────
//  Returns public vehicle data from qr_token.
//  NO sensitive info: no internal users, no tickets.
app.get('/api/public/vehiculo/:token', publicApiLimiter, async (req, res) => {
    res.setHeader('ngrok-skip-browser-warning', '1');
    try {
        const token = String(req.params.token).trim();

        // Basic UUID format validation
        if (!/^[0-9a-f-]{36}$/i.test(token)) {
            return res.status(400).json({ ok: false, error: 'Token inválido.' });
        }

        let rows;
        try {
            [rows] = await pool.query(
                `SELECT id, marca, linea, modelo, tipo, color, placas,
                        qr_token, qr_image_path, activo
                 FROM vehiculos
                 WHERE qr_token = ? AND activo = 1
                 LIMIT 1`,
                [token]
            );
        } catch (sqlErr) {
            // Si qr_image_path no existe en la tabla, hacer query sin esa columna
            if (sqlErr.code === 'ER_BAD_FIELD_ERROR') {
                [rows] = await pool.query(
                    `SELECT id, marca, linea, modelo, tipo, color, placas,
                            qr_token, NULL AS qr_image_path, activo
                     FROM vehiculos
                     WHERE qr_token = ? AND activo = 1
                     LIMIT 1`,
                    [token]
                );
            } else {
                throw sqlErr;
            }
        }

        if (rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'Vehículo no encontrado.' });
        }

        res.json({ ok: true, vehiculo: rows[0] });
    } catch (err) {
        console.error('Error GET /api/public/vehiculo:', err);
        res.status(500).json({ ok: false, error: 'Error interno.' });
    }
});

// ── GET /api/public/viajes/:token ─────────────────────────────────────
//  Returns public trip data for a vehicle identified by its qr_token.
//  Splits into `activo` (one active trip) and `finalizados` (up to 10).
//  Does not expose fuel levels, costs, internal user IDs or emails. Finalized trips expose only the total kilometers traveled.
app.get('/api/public/viajes/:token', publicApiLimiter, async (req, res) => {
    res.setHeader('ngrok-skip-browser-warning', '1');
    try {
        const token = String(req.params.token).trim();

        if (!/^[0-9a-f-]{36}$/i.test(token)) {
            return res.status(400).json({ ok: false, error: 'Token inválido.' });
        }

        // Find vehicle
        const [vrows] = await pool.query(
            'SELECT id FROM vehiculos WHERE qr_token = ? AND activo = 1 LIMIT 1',
            [token]
        );
        if (vrows.length === 0) {
            return res.status(404).json({ ok: false, error: 'Vehículo no encontrado.' });
        }
        const vehiculoId = vrows[0].id;

        // Active trip — solo campos públicos. Conforme a la Ley Federal de
        // Protección de Datos Personales, el destino y motivo de una comisión
        // EN CURSO no se exponen públicamente para proteger al funcionario.
        const [activeRows] = await pool.query(
            `SELECT id, estado
             FROM viajes
             WHERE vehiculo_id = ?
               AND estado IN ('En comision', 'En comisión',
                              'Solicitud finalización', 'Solicitud finalizacion')
             ORDER BY fecha_inicio DESC
             LIMIT 1`,
            [vehiculoId]
        );

        // Finalized trips — PUBLIC fields only (up to 10 most recent).
        // Se expone únicamente el total de kilómetros recorridos, no lecturas internas
        // de combustible, costos ni datos personales sensibles.
        const [finRows] = await pool.query(
            `SELECT id, responsable, lugar_destino, estado_dst, municipio, localidad,
                    motivo, descripcion, observaciones, actividades,
                    fecha_inicio, fecha_fin, estado,
                    CASE
                      WHEN km_inicial IS NOT NULL AND km_final IS NOT NULL AND km_final >= km_inicial
                      THEN km_final - km_inicial
                      ELSE NULL
                    END AS km_recorridos
             FROM viajes
             WHERE vehiculo_id = ? AND estado = 'Finalizado'
             ORDER BY fecha_fin DESC
             LIMIT 10`,
            [vehiculoId]
        );

        res.json({
            ok: true,
            activo:      activeRows[0] || null,
            finalizados: finRows
        });
    } catch (err) {
        console.error('Error GET /api/public/viajes:', err);
        res.status(500).json({ ok: false, error: 'Error interno.' });
    }
});

// ── GET /api/public/directorio ────────────────────────────────────────
//  Directorio público: TODAS las comisiones institucionales.
//  Privacidad:
//    • Activas    → SIN destino ni motivo (Ley de Datos Personales)
//    • Finalizadas → información completa (Ley de Transparencia)
app.get('/api/public/directorio', publicApiLimiter, async (req, res) => {
    res.setHeader('ngrok-skip-browser-warning', '1');
    try {
        const [activas] = await pool.query(
            `SELECT v.id, v.estado,
                    veh.id AS vehiculo_id, veh.marca, veh.linea, veh.modelo,
                    veh.placas, veh.tipo, veh.color, veh.qr_token, veh.no_economico
             FROM viajes v
             JOIN vehiculos veh ON veh.id = v.vehiculo_id
             WHERE veh.activo = 1
               AND v.estado IN ('En comision', 'En comisión',
                                'Solicitud finalización', 'Solicitud finalizacion')
             ORDER BY v.fecha_inicio DESC
             LIMIT 50`
        );
        const [finalizadas] = await pool.query(
            `SELECT v.id, v.responsable, v.lugar_destino, v.estado_dst,
                    v.motivo, v.descripcion, v.fecha_inicio, v.fecha_fin, v.estado,
                    CASE
                      WHEN v.km_inicial IS NOT NULL AND v.km_final IS NOT NULL AND v.km_final >= v.km_inicial
                      THEN v.km_final - v.km_inicial
                      ELSE NULL
                    END AS km_recorridos,
                    veh.id AS vehiculo_id, veh.marca, veh.linea, veh.modelo,
                    veh.placas, veh.tipo, veh.color, veh.qr_token, veh.no_economico
             FROM viajes v
             JOIN vehiculos veh ON veh.id = v.vehiculo_id
             WHERE veh.activo = 1 AND LOWER(v.estado) = 'finalizado'
             ORDER BY v.fecha_fin DESC
             LIMIT 100`
        );
        res.json({
            ok: true, activas, finalizadas,
            totales: { activas: activas.length, finalizadas: finalizadas.length }
        });
    } catch (err) {
        console.error('Error GET /api/public/directorio:', err);
        res.status(500).json({ ok: false, error: 'Error interno.' });
    }
});

// ── POST /api/public/interes-comision ────────────────────────────────
//  Citizens can leave an email to be notified when the active commission ends.
//  This is NOT a complaint, so it does not require photo, motivo or description.
app.post('/api/public/interes-comision', reportLimiter, async (req, res) => {
    try {
        const correo = String(req.body.correo_ciudadano || '').trim().slice(0, 150);
        const nombre = String(req.body.nombre_ciudadano || '').trim().slice(0, 120) || null;
        const viajeId = req.body.viaje_id ? parseInt(req.body.viaje_id, 10) : null;
        const vehiculoId = req.body.vehiculo_id ? parseInt(req.body.vehiculo_id, 10) : null;

        if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
            return res.status(400).json({ ok: false, error: 'Correo electrónico inválido.' });
        }
        if (!viajeId) {
            return res.status(400).json({ ok: false, error: 'No se recibió la comisión activa.' });
        }

        const [vj] = await pool.query(
            `SELECT id, vehiculo_id, estado
               FROM viajes
              WHERE id = ?
                AND estado IN ('En comision', 'En comisión',
                               'Solicitud finalización', 'Solicitud finalizacion')
              LIMIT 1`,
            [viajeId]
        );
        if (vj.length === 0) {
            return res.status(400).json({ ok: false, error: 'La comisión ya no está activa o no existe.' });
        }

        const vehiculoRelacionado = vehiculoId || vj[0].vehiculo_id || null;
        const trackingToken = uuidv4();

        try {
            const [r] = await pool.query(
                `INSERT INTO comision_interesados
                    (viaje_id, vehiculo_id, nombre_ciudadano, correo_ciudadano, token_seguimiento)
                 VALUES (?, ?, ?, ?, ?)`,
                [viajeId, vehiculoRelacionado, nombre, correo, trackingToken]
            );

            await registrarBitacora(
                null,
                `Interés ciudadano registrado para comisión #${viajeId}`,
                'ciudadano', r.insertId, req.ip
            );

            return res.json({ ok: true, id: r.insertId, token: trackingToken });
        } catch (insertErr) {
            if (insertErr.code === 'ER_DUP_ENTRY') {
                return res.json({ ok: true, duplicado: true });
            }
            throw insertErr;
        }
    } catch (err) {
        console.error('Error POST /api/public/interes-comision:', err);
        res.status(500).json({ ok: false, error: 'Error interno. Intenta nuevamente.' });
    }
});

// ── POST /api/public/reportar ─────────────────────────────────────────
//  Citizens submit a report. Handles file upload via multipart/form-data.
app.post(
    '/api/public/reportar',
    reportLimiter,
    uploadEvidencia.single('evidencia'),
    async (req, res) => {
        try {
            // Multer error passthrough
            const {
                correo_ciudadano,
                nombre_ciudadano,
                motivo,
                descripcion,
                viaje_id,
                vehiculo_id,
                evidencia_origen,
                evidencia_tomada_en
            } = req.body;

            // Validation
            if (!correo_ciudadano || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo_ciudadano)) {
                return res.status(400).json({ ok: false, error: 'Correo electrónico inválido.' });
            }
            if (!motivo || motivo.length > 100) {
                return res.status(400).json({ ok: false, error: 'Motivo inválido.' });
            }
            if (!descripcion || descripcion.trim().length < 15) {
                return res.status(400).json({ ok: false, error: 'La descripción es muy corta (mínimo 15 caracteres).' });
            }
            if (!req.file) {
                return res.status(400).json({ ok: false, error: 'La evidencia fotográfica es obligatoria y debe tomarse con la cámara en ese momento.' });
            }
            if (evidencia_origen !== 'camara') {
                try { fs.unlinkSync(req.file.path); } catch (_) {}
                return res.status(400).json({ ok: false, error: 'No se permiten archivos subidos. La evidencia debe capturarse desde la cámara del dispositivo.' });
            }

            // Sanitize inputs
            const correoSafe  = correo_ciudadano.trim().slice(0, 150);
            const nombreSafe  = (nombre_ciudadano || '').trim().slice(0, 120) || null;
            const motivoSafe  = motivo.trim().slice(0, 100);
            const descSafe    = descripcion.trim().slice(0, 2000);
            const viajeIdN    = viaje_id    ? parseInt(viaje_id, 10)    : null;
            const vehiculoIdN = vehiculo_id ? parseInt(vehiculo_id, 10) : null;
            const tomadaDate  = evidencia_tomada_en ? new Date(evidencia_tomada_en) : new Date();
            const tomadaSafe  = Number.isNaN(tomadaDate.getTime())
                ? new Date()
                : tomadaDate;
            const tomadaSql = tomadaSafe.toISOString().slice(0, 19).replace('T', ' ');

            // Validate FK references if provided
            if (viajeIdN) {
                const [vj] = await pool.query(
                    'SELECT id FROM viajes WHERE id = ? LIMIT 1', [viajeIdN]);
                if (vj.length === 0) {
                    return res.status(400).json({ ok: false, error: 'Comisión no encontrada.' });
                }
            }
            if (vehiculoIdN) {
                const [vh] = await pool.query(
                    'SELECT id FROM vehiculos WHERE id = ? AND activo = 1 LIMIT 1', [vehiculoIdN]);
                if (vh.length === 0) {
                    return res.status(400).json({ ok: false, error: 'Vehículo no encontrado.' });
                }
            }

            // Evidence URL
            let evidenciaUrl = null;
            if (req.file) {
                evidenciaUrl = `uploads/evidencias/${req.file.filename}`;
            }

            // Unique tracking token
            const trackingToken = uuidv4();

            // Insert report
            const [r] = await pool.query(
                `INSERT INTO reportes_ciudadanos
                    (viaje_id, vehiculo_id, nombre_ciudadano, correo_ciudadano,
                     motivo, descripcion, evidencia_url, evidencia_origen,
                     evidencia_tomada_en, token_seguimiento, estatus)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'camara', ?, ?, 'nuevo')`,
                [viajeIdN, vehiculoIdN, nombreSafe, correoSafe,
                 motivoSafe, descSafe, evidenciaUrl, tomadaSql, trackingToken]
            );

            await registrarBitacora(
                null,
                `Reporte ciudadano: ${motivoSafe} (vehiculo_id=${vehiculoIdN})`,
                'ciudadano', r.insertId, req.ip
            );

            // Notify internal admins
            await notificarAdmins({
                titulo: '🚨 Nuevo reporte ciudadano',
                cuerpo: `Se recibió un reporte: "${motivoSafe}"` +
                        (vehiculoIdN ? ` para vehículo #${vehiculoIdN}` : '') + '.',
                tipo: 'reporte_ciudadano'
            });

            // Send acknowledgment email to citizen
            await enviarCorreoCiudadano({
                to:     correoSafe,
                nombre: nombreSafe || 'Ciudadano',
                token:  trackingToken,
                motivo: motivoSafe
            });

            res.json({ ok: true, id: r.insertId, token: trackingToken });
        } catch (err) {
            console.error('Error POST /api/public/reportar:', err);
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ ok: false, error: 'La imagen no debe superar 5 MB.' });
            }
            res.status(500).json({ ok: false, error: 'Error interno. Intenta nuevamente.' });
        }
    }
);

// ── GET /api/public/seguimiento/:token ────────────────────────────────
//  Returns public follow-up info for a citizen report.
app.get('/api/public/seguimiento/:token', publicApiLimiter, async (req, res) => {
    try {
        const token = String(req.params.token).trim();

        if (!/^[0-9a-f-]{36}$/i.test(token)) {
            return res.status(400).json({ ok: false, error: 'Token inválido.' });
        }

        let tipoSeguimiento = 'reporte';
        let [rows] = await pool.query(
            `SELECT id, viaje_id, vehiculo_id, motivo, estatus,
                    comentario_admin, resuelto_at,
                    token_seguimiento, created_at
             FROM reportes_ciudadanos
             WHERE token_seguimiento = ?
             LIMIT 1`,
            [token]
        );

        if (rows.length === 0) {
            tipoSeguimiento = 'interes';
            [rows] = await pool.query(
                `SELECT id, viaje_id, vehiculo_id,
                        'Solicitud de información al finalizar comisión' AS motivo,
                        'nuevo' AS estatus,
                        NULL AS comentario_admin, NULL AS resuelto_at,
                        token_seguimiento, created_at
                 FROM comision_interesados
                 WHERE token_seguimiento = ?
                 LIMIT 1`,
                [token]
            );
        }

        if (rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'Seguimiento no encontrado.' });
        }

        const reporte = rows[0];

        // Public trip info (only if finalized)
        let viaje    = null;
        let vehiculo = null;

        if (reporte.viaje_id) {
            const [vj] = await pool.query(
                `SELECT responsable, lugar_destino, estado_dst, municipio, localidad,
                        motivo, descripcion, observaciones, actividades,
                        fecha_inicio, fecha_fin, estado,
                        CASE
                          WHEN km_inicial IS NOT NULL AND km_final IS NOT NULL AND km_final >= km_inicial
                          THEN km_final - km_inicial
                          ELSE NULL
                        END AS km_recorridos
                 FROM viajes WHERE id = ? LIMIT 1`,
                [reporte.viaje_id]
            );
            if (vj.length && vj[0].estado === 'Finalizado') {
                viaje = vj[0];
            }
        }

        if (reporte.vehiculo_id) {
            const [vh] = await pool.query(
                'SELECT marca, linea, modelo, tipo, placas FROM vehiculos WHERE id = ? LIMIT 1',
                [reporte.vehiculo_id]
            );
            if (vh.length) vehiculo = vh[0];
        }

        // Do NOT expose: correo_ciudadano, nombre_ciudadano, evidencia_url,
        // internal user data, fuel levels or fuel costs. Finalized trips expose only total kilometers traveled.
        res.json({ ok: true, tipo: tipoSeguimiento, reporte, viaje, vehiculo });
    } catch (err) {
        console.error('Error GET /api/public/seguimiento:', err);
        res.status(500).json({ ok: false, error: 'Error interno.' });
    }
});

// ============================================================================
// SIGEPAV — Endpoints de gestión de reportes ciudadanos (panel del admin)
// ============================================================================
//
// Copia y pega este bloque DENTRO de tu Server.js, justo después del bloque
// "GET /api/public/seguimiento/:token" (alrededor de la línea 2150).
//
// Requisitos (ya los tienes definidos en tu Server.js):
//   - const pool = mysql.createPool(...)
//   - const app  = express() con app.use(express.json())
//   - function registrarBitacora(usuario_id, accion, modulo, entidad_id, ip)
//   - function notificarAdmins({ titulo, cuerpo, tipo })
//   - function crearNotificacion({ usuario_id, titulo, cuerpo, tipo })
//
// NOTA: estos endpoints son INTERNOS (no llevan "/public/"). Tu front-end
// debería validar rol antes de mostrar el menú, igual que ya lo haces en
// historial / dashboard. Si en el futuro agregas un middleware
// requireAdmin(req, res, next), lo enchufas aquí sin tocar la lógica.
// ============================================================================


// ────────────────────────────────────────────────────────────────────────────
// GET /api/reportes-ciudadanos
//   Lista paginada con filtros + JOIN con vehiculos para mostrar etiquetas.
//   Query params:
//     estatus    = nuevo | en_revision | resuelto | descartado
//     vehiculo   = id del vehículo
//     motivo     = texto exacto del motivo
//     desde      = YYYY-MM-DD
//     hasta      = YYYY-MM-DD
//     pagina     = número de página (default 1)
//     por_pagina = registros por página (default 10, máx 100)
// ────────────────────────────────────────────────────────────────────────────
app.get('/api/reportes-ciudadanos', async (req, res) => {
    try {
        const ESTATUS_VALIDOS = ['nuevo', 'en_revision', 'resuelto', 'descartado'];

        const estatus  = ESTATUS_VALIDOS.includes(req.query.estatus) ? req.query.estatus : null;
        const vehiculo = parseInt(req.query.vehiculo, 10) || null;
        const motivo   = (req.query.motivo || '').trim() || null;
        const desde    = (req.query.desde  || '').trim() || null;
        const hasta    = (req.query.hasta  || '').trim() || null;

        const pagina     = Math.max(1, parseInt(req.query.pagina, 10)     || 1);
        const porPagina  = Math.min(100, Math.max(1, parseInt(req.query.por_pagina, 10) || 10));
        const offset     = (pagina - 1) * porPagina;

        const where = [];
        const params = [];

        if (estatus)  { where.push('r.estatus = ?');     params.push(estatus); }
        if (vehiculo) { where.push('r.vehiculo_id = ?'); params.push(vehiculo); }
        if (motivo)   { where.push('r.motivo = ?');      params.push(motivo); }
        if (desde)    { where.push('DATE(r.created_at) >= ?'); params.push(desde); }
        if (hasta)    { where.push('DATE(r.created_at) <= ?'); params.push(hasta); }

        const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

        // Total para paginación
        const [[{ total }]] = await pool.query(
            `SELECT COUNT(*) AS total FROM reportes_ciudadanos r ${whereSql}`,
            params
        );

        // Datos (con etiquetas de vehículo via LEFT JOIN — el vehículo puede haber sido borrado)
        const [rows] = await pool.query(
            `SELECT  r.id, r.viaje_id, r.vehiculo_id,
                     r.nombre_ciudadano, r.correo_ciudadano,
                     r.motivo, r.descripcion, r.evidencia_url,
                     r.estatus, r.comentario_admin, r.resuelto_at,
                     r.token_seguimiento, r.notificado, r.created_at,
                     v.no_economico, v.marca, v.linea, v.placas
             FROM    reportes_ciudadanos r
             LEFT JOIN vehiculos v ON v.id = r.vehiculo_id
             ${whereSql}
             ORDER BY
                FIELD(r.estatus, 'nuevo','en_revision','resuelto','descartado'),
                r.created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, porPagina, offset]
        );

        res.json({
            ok: true,
            reportes: rows,
            total,
            pagina,
            por_pagina: porPagina,
            total_paginas: Math.max(1, Math.ceil(total / porPagina))
        });
    } catch (err) {
        console.error('Error GET /api/reportes-ciudadanos:', err);
        res.status(500).json({ ok: false, error: 'Error al consultar reportes.' });
    }
});


// ────────────────────────────────────────────────────────────────────────────
// GET /api/reportes-ciudadanos/stats
//   Conteo por estatus (alimenta las 4 cards del header).
// ────────────────────────────────────────────────────────────────────────────
app.get('/api/reportes-ciudadanos/stats', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT estatus, COUNT(*) AS n
             FROM   reportes_ciudadanos
             GROUP  BY estatus`
        );
        const stats = { nuevo: 0, en_revision: 0, resuelto: 0, descartado: 0 };
        rows.forEach(r => { stats[r.estatus] = r.n; });
        res.json({ ok: true, stats });
    } catch (err) {
        console.error('Error GET /api/reportes-ciudadanos/stats:', err);
        res.status(500).json({ ok: false, error: 'Error al consultar estadísticas.' });
    }
});


// ────────────────────────────────────────────────────────────────────────────
// GET /api/reportes-ciudadanos/:id
//   Detalle de un reporte específico.
// ────────────────────────────────────────────────────────────────────────────
app.get('/api/reportes-ciudadanos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });

        const [rows] = await pool.query(
            `SELECT  r.*,
                     v.no_economico, v.marca, v.linea, v.placas,
                     vi.lugar_destino, vi.fecha_inicio, vi.estado AS viaje_estado
             FROM    reportes_ciudadanos r
             LEFT JOIN vehiculos v  ON v.id  = r.vehiculo_id
             LEFT JOIN viajes    vi ON vi.id = r.viaje_id
             WHERE   r.id = ?
             LIMIT   1`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'Reporte no encontrado.' });
        }
        res.json({ ok: true, reporte: rows[0] });
    } catch (err) {
        console.error('Error GET /api/reportes-ciudadanos/:id:', err);
        res.status(500).json({ ok: false, error: 'Error al consultar el reporte.' });
    }
});


// ────────────────────────────────────────────────────────────────────────────
// PATCH /api/reportes-ciudadanos/:id/estatus
//   Cambia el estatus del reporte. Acciones del admin:
//     - 'en_revision' (lo marca en proceso)
//     - 'resuelto'    (concluido — opcionalmente notifica al ciudadano)
//     - 'descartado'  (falso/sin fundamento)
//
//   Body JSON:
//     { estatus: 'en_revision' | 'resuelto' | 'descartado',
//       comentario: 'texto opcional',
//       admin_id: 5  (opcional; si tu sesión la manda) }
//
//   Efectos secundarios:
//     1. Registra en bitácora.
//     2. Si pasa a 'resuelto' o 'descartado' y el ciudadano dejó correo,
//        marca `notificado = 1` y dispara correo de seguimiento (best-effort).
//     3. Notifica al admin que se resolvió (autoconfirmación).
// ────────────────────────────────────────────────────────────────────────────
app.patch('/api/reportes-ciudadanos/:id/estatus', async (req, res) => {
    const ESTATUS_VALIDOS = ['nuevo', 'en_revision', 'resuelto', 'descartado'];

    try {
        const id = parseInt(req.params.id, 10);
        if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });

        const { estatus, comentario, admin_id } = req.body || {};
        const comentarioSafe = String(comentario || '').trim().slice(0, 5000);
        if (!ESTATUS_VALIDOS.includes(estatus)) {
            return res.status(400).json({ ok: false, error: 'Estatus inválido.' });
        }
        if ((estatus === 'resuelto' || estatus === 'descartado') && !comentarioSafe) {
            return res.status(400).json({ ok: false, error: 'El comentario de resolución es obligatorio.' });
        }

        // Verificar existencia
        const [[rep]] = await pool.query(
            `SELECT id, estatus, motivo, correo_ciudadano, nombre_ciudadano,
                    token_seguimiento, vehiculo_id, comentario_admin
             FROM   reportes_ciudadanos
             WHERE  id = ?`,
            [id]
        );
        if (!rep) return res.status(404).json({ ok: false, error: 'Reporte no encontrado.' });

        if (rep.estatus === estatus && !(estatus === 'resuelto' || estatus === 'descartado')) {
            return res.json({ ok: true, sin_cambios: true });
        }

        await pool.query(
            `UPDATE reportes_ciudadanos
             SET    estatus = ?,
                    comentario_admin = CASE
                        WHEN ? IN ('resuelto','descartado') THEN ?
                        ELSE comentario_admin
                    END,
                    resuelto_at = CASE
                        WHEN ? IN ('resuelto','descartado') THEN NOW()
                        ELSE resuelto_at
                    END,
                    notificado = CASE
                        WHEN ? IN ('resuelto','descartado') AND correo_ciudadano IS NOT NULL
                        THEN 1 ELSE notificado
                    END
             WHERE  id = ?`,
            [estatus, estatus, comentarioSafe || null, estatus, estatus, id]
        );

        // Bitácora
        await registrarBitacora(
            admin_id || null,
            `Reporte ciudadano #${id} → ${estatus}` +
                (comentarioSafe ? `: ${comentarioSafe.slice(0,150)}` : ''),
            'reportes_ciudadanos',
            id,
            req.ip
        );

        // Notificar al admin que actuó (confirmación)
        if (admin_id) {
            await crearNotificacion({
                usuario_id: admin_id,
                titulo: '✓ Reporte actualizado',
                cuerpo: `Reporte #${id} marcado como "${estatus.replace('_',' ')}".`,
                tipo: 'info'
            });
        }

        // Mandar correo al ciudadano cuando se resuelve/descarta (best-effort)
        if ((estatus === 'resuelto' || estatus === 'descartado')
            && rep.correo_ciudadano
            && typeof enviarCorreoSeguimientoReporte === 'function') {
            try {
                await enviarCorreoSeguimientoReporte({
                    to: rep.correo_ciudadano,
                    nombre: rep.nombre_ciudadano || 'Ciudadano',
                    motivo: rep.motivo,
                    estatus,
                    token: rep.token_seguimiento,
                    comentario: comentarioSafe || null
                });
            } catch (e) {
                console.warn('No se pudo enviar correo al ciudadano:', e.message);
            }
        }

        res.json({ ok: true, estatus });
    } catch (err) {
        console.error('Error PATCH /api/reportes-ciudadanos/:id/estatus:', err);
        res.status(500).json({ ok: false, error: 'Error al actualizar el reporte.' });
    }
});


// ────────────────────────────────────────────────────────────────────────────
// DELETE /api/reportes-ciudadanos/:id
//   Borrado físico. Solo casos extremos (spam masivo, datos sensibles, etc.).
//   La operación normal es marcar 'descartado'.
// ────────────────────────────────────────────────────────────────────────────
app.delete('/api/reportes-ciudadanos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });

        const [r] = await pool.query('DELETE FROM reportes_ciudadanos WHERE id = ?', [id]);
        if (r.affectedRows === 0) {
            return res.status(404).json({ ok: false, error: 'Reporte no encontrado.' });
        }
        await registrarBitacora(
            req.body && req.body.admin_id || null,
            `Reporte ciudadano #${id} eliminado`,
            'reportes_ciudadanos', id, req.ip
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('Error DELETE /api/reportes-ciudadanos/:id:', err);
        res.status(500).json({ ok: false, error: 'Error al eliminar el reporte.' });
    }
});


// ────────────────────────────────────────────────────────────────────────────
// (OPCIONAL) Función helper para enviar correo de seguimiento al ciudadano
// cuando su reporte cambia de estatus. Si no tienes nodemailer aún, puedes
// omitirla y el endpoint la salta automáticamente (typeof check arriba).
//
// async function enviarCorreoSeguimientoReporte({ to, nombre, motivo, estatus, token, comentario }) {
//     const subject = estatus === 'resuelto'
//         ? 'Tu reporte ciudadano fue atendido — SIGEPAV'
//         : 'Actualización sobre tu reporte ciudadano — SIGEPAV';
//     const html = `
//         <p>Hola ${nombre}:</p>
//         <p>Tu reporte sobre <strong>"${motivo}"</strong> ha sido marcado como
//            <strong>${estatus.replace('_',' ')}</strong>.</p>
//         ${comentario ? `<p>Comentario del responsable: <em>${comentario}</em></p>` : ''}
//         <p>Puedes consultar el estatus de tu reporte en:
//             <a href="https://tu-dominio/seguimiento.html?t=${token}">Ver mi reporte</a>
//         </p>
//         <p>Gracias por contribuir al buen uso del parque vehicular institucional.</p>
//     `;
//     return transporter.sendMail({ from: env.MAIL_FROM, to, subject, html });
// }

// =====================================================================
//  INTERNAL: Send notification emails when a trip is finalized
//  Call this inside the existing finalizar handlers (see instructions).
// =====================================================================

// ── notificarCiudadanosAlFinalizar(viajeId) ────────────────────────────
//  Add a call to this function inside BOTH finalization handlers:
//    PUT /api/comisiones/:id/finalizar
//    PUT /api/solicitudes-finalizacion/:id/aprobar
//
//  Add AFTER the UPDATE viajes SET estado = 'Finalizado' query:
//    await notificarCiudadanosAlFinalizar(sol.viaje_id); // or `id`


async function notificarCiudadanosAlFinalizar(viajeId) {
    try {
        // Obtener datos completos de la comisión finalizada (para el correo)
        const [viajeRows] = await pool.query(
            `SELECT id, lugar_destino, estado_dst, fecha_fin, responsable,
                    motivo, observaciones, actividades
               FROM viajes WHERE id = ? LIMIT 1`,
            [viajeId]
        );
        const v = viajeRows[0] || {};

        // Find all citizen reports linked to this trip that haven't been notified
        const [reportes] = await pool.query(
            `SELECT id, correo_ciudadano, nombre_ciudadano, token_seguimiento,
                    motivo AS motivo_reporte, descripcion AS descripcion_reporte,
                    comentario_admin
             FROM reportes_ciudadanos
             WHERE viaje_id = ? AND notificado = 0`,
            [viajeId]
        );

        const [interesados] = await pool.query(
            `SELECT id, correo_ciudadano, nombre_ciudadano, token_seguimiento
             FROM comision_interesados
             WHERE viaje_id = ? AND notificado = 0`,
            [viajeId]
        );

        if (reportes.length === 0 && interesados.length === 0) return;

        const baseUrl = BASE_URL;

        // Construir bloques HTML opcionales una sola vez
        const fechaFinTxt = v.fecha_fin
            ? new Date(v.fecha_fin).toLocaleDateString('es-MX',
                { day: '2-digit', month: 'long', year: 'numeric' })
            : '—';

        const destinoLine = v.lugar_destino
            ? `<p style="margin:0 0 6px"><strong>Destino:</strong> ${v.lugar_destino}${v.estado_dst ? ', ' + v.estado_dst : ''}</p>`
            : '';
        const motivoLine = v.motivo
            ? `<p style="margin:0 0 6px"><strong>Motivo:</strong> ${escapeHTML(v.motivo)}</p>`
            : '';
        const fechaLine  = `<p style="margin:0 0 6px"><strong>Finalizada el:</strong> ${fechaFinTxt}</p>`;

        const actividadesBlock = (() => {
            if (!v.actividades) return '';
            const lineas = String(v.actividades).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
            if (!lineas.length) return '';
            return `
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin:16px 0">
                <p style="margin:0 0 6px;font-weight:600;color:#0d2d6b">Actividades realizadas:</p>
                <ul style="margin:0;padding-left:18px;color:#334155">
                  ${lineas.map(l => `<li>${escapeHTML(l)}</li>`).join('')}
                </ul>
              </div>`;
        })();

        const observBlock = v.observaciones
            ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin:16px 0">
                  <p style="margin:0 0 4px;font-weight:600;color:#92400e">Observaciones finales:</p>
                  <p style="margin:0;color:#78350f">${escapeHTML(v.observaciones)}</p>
               </div>`
            : '';

        for (const r of reportes) {
            const seguimientoUrl = `${baseUrl}/seguimiento-publico/${r.token_seguimiento}`;

            // Bloque con lo que el ciudadano reportó
            const reporteBlock = (() => {
                const lineas = [];
                if (r.motivo_reporte) lineas.push(`<p style="margin:0 0 4px"><strong>Motivo del reporte:</strong> ${escapeHTML(r.motivo_reporte)}</p>`);
                if (r.descripcion_reporte) lineas.push(`<p style="margin:0;color:#334155">${escapeHTML(r.descripcion_reporte)}</p>`);
                if (!lineas.length) return '';
                return `
                  <div style="background:#f0f4ff;border-left:4px solid #6366f1;padding:12px 16px;margin:16px 0;border-radius:0 8px 8px 0">
                    <p style="margin:0 0 6px;font-weight:600;color:#312e81;font-size:.9rem">Tu reporte:</p>
                    ${lineas.join('')}
                  </div>`;
            })();

            // Observación del administrador sobre el reporte específico
            const obsAdminBlock = r.comentario_admin
                ? `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px 16px;margin:16px 0">
                     <p style="margin:0 0 4px;font-weight:600;color:#14532d;font-size:.9rem">&#10003; Respuesta del administrador:</p>
                     <p style="margin:0;color:#166534">${escapeHTML(r.comentario_admin)}</p>
                   </div>`
                : '';

            let correoEnviado = false;
            try {
                await mailTransport.sendMail({
                from:    process.env.MAIL_FROM || 'SIGEPAV <no-reply@itszn.edu.mx>',
                to:      r.correo_ciudadano,
                subject: 'Tu reporte ciudadano fue atendido — SIGEPAV',
                html: `
                  <div style="font-family:sans-serif;max-width:600px;margin:auto">
                    <div style="background:#0d2d6b;padding:24px;border-radius:12px 12px 0 0">
                      <h2 style="color:#fff;margin:0">SIGEPAV</h2>
                      <p style="color:rgba(255,255,255,.7);margin:4px 0 0">Sistema de Gestión del Parque Vehicular</p>
                    </div>
                    <div style="background:#fff;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">
                      <p>Hola${r.nombre_ciudadano ? ' <strong>' + escapeHTML(r.nombre_ciudadano) + '</strong>' : ''},</p>
                      <p>La comisión relacionada con tu reporte ha sido <strong>finalizada</strong>
                         por la administración del Instituto. A continuación el resumen:</p>

                      ${reporteBlock}

                      <div style="background:#f0f9ff;border-left:4px solid #0d2d6b;padding:12px 16px;margin:16px 0">
                        ${destinoLine}
                        ${motivoLine}
                        ${fechaLine}
                      </div>

                      ${actividadesBlock}
                      ${observBlock}
                      ${obsAdminBlock}

                      <p style="margin-top:18px">Puedes consultar el reporte completo en línea:</p>
                      <div style="text-align:center;margin:18px 0">
                        <a href="${seguimientoUrl}"
                           style="background:#0d2d6b;color:#fff;padding:12px 28px;
                                  border-radius:8px;text-decoration:none;font-weight:700">
                          Ver resultado completo
                        </a>
                      </div>
                      <p style="color:#64748b;font-size:.85rem">
                        Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
                        <a href="${seguimientoUrl}">${seguimientoUrl}</a>
                      </p>
                      <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
                      <p style="color:#94a3b8;font-size:.75rem">
                        Este mensaje se envió porque registraste un reporte ciudadano en el
                        Sistema SIGEPAV.
                        Si no reconoces este reporte, por favor ignora este correo.
                      </p>
                    </div>
                  </div>
                `
                });
                correoEnviado = true;
            } catch (mailErr) {
                console.warn(`⚠️  No se pudo enviar correo a ${r.correo_ciudadano}:`, mailErr.message);
            }

            // Mark as notified only if email was sent
            if (correoEnviado) {
                await pool.query(
                    'UPDATE reportes_ciudadanos SET notificado = 1, estatus = "resuelto" WHERE id = ?',
                    [r.id]
                );
            }
        }

        for (const i of interesados) {
            const seguimientoUrl = `${baseUrl}/seguimiento-publico/${i.token_seguimiento}`;
            let correoEnviado = false;
            try {
                await mailTransport.sendMail({
                    from: process.env.MAIL_FROM || 'SIGEPAV <no-reply@itszn.edu.mx>',
                    to: i.correo_ciudadano,
                    subject: 'La comisión que consultaste ya finalizó — SIGEPAV',
                    html: `
                      <div style="font-family:sans-serif;max-width:600px;margin:auto">
                        <div style="background:#0d2d6b;padding:24px;border-radius:12px 12px 0 0">
                          <h2 style="color:#fff;margin:0">SIGEPAV</h2>
                          <p style="color:rgba(255,255,255,.7);margin:4px 0 0">Sistema de Gestión del Parque Vehicular</p>
                        </div>
                        <div style="background:#fff;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">
                          <p>Hola${i.nombre_ciudadano ? ' <strong>' + escapeHTML(i.nombre_ciudadano) + '</strong>' : ''},</p>
                          <p>La comisión sobre la que solicitaste información ya fue <strong>finalizada</strong>.</p>
                          <div style="background:#f0f9ff;border-left:4px solid #0d2d6b;padding:12px 16px;margin:16px 0">
                            ${destinoLine}
                            ${motivoLine}
                            ${fechaLine}
                          </div>
                          ${actividadesBlock}
                          ${observBlock}
                          <p style="margin-top:18px">Puedes consultar la información pública autorizada en línea:</p>
                          <div style="text-align:center;margin:18px 0">
                            <a href="${seguimientoUrl}"
                               style="background:#0d2d6b;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700">
                              Ver comisión finalizada
                            </a>
                          </div>
                          <p style="color:#64748b;font-size:.85rem">
                            Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
                            <a href="${seguimientoUrl}">${seguimientoUrl}</a>
                          </p>
                        </div>
                      </div>
                    `
                });
                correoEnviado = true;
            } catch (mailErr) {
                console.warn(`⚠️  No se pudo enviar correo a ${i.correo_ciudadano}:`, mailErr.message);
            }

            if (correoEnviado) {
                await pool.query(
                    'UPDATE comision_interesados SET notificado = 1 WHERE id = ?',
                    [i.id]
                );
            }
        }
    } catch (err) {
        console.warn('⚠️  notificarCiudadanosAlFinalizar:', err.message);
    }
}

// Helper anti-XSS para HTML inyectado en correos
function escapeHTML(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Acknowledgment email to citizen ───────────────────────────────────
async function enviarCorreoCiudadano({ to, nombre, token, motivo }) {
    try {
        if (!process.env.MAIL_USER) {
            console.warn('⚠️  MAIL_USER no configurado. Correo de confirmación omitido.');
            return;
        }
        const baseUrl       = BASE_URL;
        const seguimientoUrl = `${baseUrl}/seguimiento-publico/${token}`;

        await mailTransport.sendMail({
            from:    process.env.MAIL_FROM || 'SIGEPAV <no-reply@itszn.edu.mx>',
            to,
            subject: 'Reporte recibido — SIGEPAV',
            html: `
              <div style="font-family:sans-serif;max-width:600px;margin:auto">
                <div style="background:#0d2d6b;padding:24px;border-radius:12px 12px 0 0">
                  <h2 style="color:#fff;margin:0">SIGEPAV</h2>
                  <p style="color:rgba(255,255,255,.7);margin:4px 0 0">Sistema de Gestión del Parque Vehicular</p>
                </div>
                <div style="background:#fff;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">
                  <p>Hola <strong>${nombre}</strong>,</p>
                  <p>Tu reporte ciudadano ha sido recibido correctamente.</p>
                  <table style="background:#f8fafc;border-radius:8px;padding:16px;width:100%;border-collapse:collapse">
                    <tr>
                      <td style="color:#64748b;font-size:.85rem;padding:4px 0">Motivo</td>
                      <td style="font-weight:600;font-size:.9rem;padding:4px 0">${motivo}</td>
                    </tr>
                    <tr>
                      <td style="color:#64748b;font-size:.85rem;padding:4px 0">Token de seguimiento</td>
                      <td style="font-family:monospace;font-size:.85rem;padding:4px 0">${token}</td>
                    </tr>
                  </table>
                  <p>Cuando la comisión sea finalizada por la administración del Instituto,
                     recibirás un correo con el resultado. También puedes consultar el
                     estado de tu reporte en cualquier momento:</p>
                  <div style="text-align:center;margin:24px 0">
                    <a href="${seguimientoUrl}"
                       style="background:#0d2d6b;color:#fff;padding:12px 28px;
                              border-radius:8px;text-decoration:none;font-weight:700">
                      Consultar mi reporte
                    </a>
                  </div>
                  <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
                  <p style="color:#94a3b8;font-size:.75rem">
                    Tu información personal es tratada conforme a la Ley Federal de Protección
                    de Datos Personales en Posesión de los Particulares.
                  </p>
                </div>
              </div>
            `
        });
    } catch (err) {
        console.warn('⚠️  enviarCorreoCiudadano:', err.message);
    }
}

// =====================================================================
//  END OF CITIZEN MODULE
//  Remember to:
//  1. Add `await asegurarTablasCiudadano();` inside the boot IIFE.
//  2. Add `await notificarCiudadanosAlFinalizar(viajeId);` in both
//     PUT /api/comisiones/:id/finalizar  and
//     PUT /api/solicitudes-finalizacion/:id/aprobar
//  3. Add QR generation after vehicle insert (see comment above).
// =====================================================================


// ============== ARRANQUE ==============
const VERSION_TAG = 'SIGEPAVFINAL-manual-ayuda-v4';

// Endpoint de diagnóstico: confirma qué build está corriendo.
app.get('/api/version', (req, res) => {
    res.json({
        ok: true,
        build: VERSION_TAG,
        base_url: BASE_URL,
        endpoints_publicos: [
            'GET  /api/public/vehiculo/:token',
            'GET  /api/public/viajes/:token',
            'GET  /api/public/directorio',
            'POST /api/public/reportar',
            'GET  /api/public/seguimiento/:token'
        ]
    });
});

// =====================================================================
//          MÓDULO CATÁLOGO INEGI (Estados / Municipios)
// =====================================================================
// Origen: catálogo oficial INEGI (32 estados + 2,463 municipios) procesado
// desde data.csv del repo "edos_mun". Las coordenadas se guardan para
// poder mostrar mapas o calcular distancias en el futuro.
// Las tablas se rellenan al primer arranque desde /seed/*.json (sólo si
// están vacías). Después del seed los JSON ya no se vuelven a leer.
// =====================================================================
async function asegurarCatalogoINEGI() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cat_estados (
                id      INT UNSIGNED NOT NULL AUTO_INCREMENT,
                cve     CHAR(2)      NOT NULL UNIQUE,
                nombre  VARCHAR(80)  NOT NULL,
                abr     VARCHAR(10)  NOT NULL,
                lat     DECIMAL(10,6),
                lng     DECIMAL(10,6),
                PRIMARY KEY (id),
                KEY idx_estado_nombre (nombre)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cat_municipios (
                id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
                estado_id   INT UNSIGNED NOT NULL,
                cve         CHAR(3)      NOT NULL,
                nombre      VARCHAR(120) NOT NULL,
                lat         DECIMAL(10,6),
                lng         DECIMAL(10,6),
                PRIMARY KEY (id),
                UNIQUE KEY uq_mun (estado_id, cve),
                KEY idx_mun_nombre (nombre),
                CONSTRAINT fk_mun_estado FOREIGN KEY (estado_id) REFERENCES cat_estados(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS cat_localidades (
                id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
                municipio_id  INT UNSIGNED NOT NULL,
                cve           CHAR(4)      NOT NULL,
                nombre        VARCHAR(180) NOT NULL,
                ambito        CHAR(1) DEFAULT NULL,
                lat           DECIMAL(10,6),
                lng           DECIMAL(10,6),
                PRIMARY KEY (id),
                UNIQUE KEY uq_loc (municipio_id, cve),
                KEY idx_loc_nombre (nombre),
                CONSTRAINT fk_loc_mun FOREIGN KEY (municipio_id) REFERENCES cat_municipios(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Seed si está vacía
        const [[{ n: nEst }]] = await pool.query(`SELECT COUNT(*) AS n FROM cat_estados`);
        if (nEst === 0) {
            const seedDir = path.join(__dirname, 'seed');
            const fEst = path.join(seedDir, 'estados.json');
            const fMun = path.join(seedDir, 'municipios.json');
            if (!fs.existsSync(fEst) || !fs.existsSync(fMun)) {
                console.warn('⚠️  Catálogo INEGI: no se encontraron los JSON en /seed (estados.json y municipios.json). El catálogo queda vacío.');
                return;
            }
            console.log('📦 Sembrando catálogo INEGI (primera vez)...');
            const estados    = JSON.parse(fs.readFileSync(fEst, 'utf8'));
            const municipios = JSON.parse(fs.readFileSync(fMun, 'utf8'));

            // Estados
            for (const e of estados) {
                await pool.query(
                    `INSERT INTO cat_estados (cve, nombre, abr, lat, lng) VALUES (?,?,?,?,?)`,
                    [e.cve, e.nombre, e.abr, e.lat, e.lng]
                );
            }
            // Mapa cve_ent → id
            const [filas] = await pool.query(`SELECT id, cve FROM cat_estados`);
            const idDeCve = new Map(filas.map(r => [r.cve, r.id]));

            // Municipios en lotes de 500
            const lote = 500;
            for (let i = 0; i < municipios.length; i += lote) {
                const slice = municipios.slice(i, i + lote);
                const values = [];
                const placeholders = slice.map(m => {
                    const eid = idDeCve.get(m.cve_ent);
                    if (!eid) return null;
                    values.push(eid, m.cve_mun, m.nombre, m.lat, m.lng);
                    return '(?,?,?,?,?)';
                }).filter(Boolean).join(',');
                if (placeholders) {
                    await pool.query(
                        `INSERT INTO cat_municipios (estado_id, cve, nombre, lat, lng) VALUES ${placeholders}`,
                        values
                    );
                }
            }
            console.log(`✅ Catálogo INEGI: ${estados.length} estados y ${municipios.length} municipios sembrados.`);
        } else {
            console.log(`✅ Catálogo INEGI ya cargado (${nEst} estados).`);
        }

        // Seed de localidades (catálogo INEGI completo) — si la tabla está vacía
        const [[{ n: nLoc }]] = await pool.query(`SELECT COUNT(*) AS n FROM cat_localidades`);
        if (nLoc === 0) {
            // Acepta el archivo comprimido (.gz, ~6MB) o el .json plano (~36MB).
            const fLocGz = path.join(__dirname, 'seed', 'localidades.json.gz');
            const fLoc   = path.join(__dirname, 'seed', 'localidades.json');
            const usarGz = fs.existsSync(fLocGz);
            if (usarGz || fs.existsSync(fLoc)) {
                console.log('📦 Sembrando catálogo de localidades INEGI (304k aprox)...');
                console.log('   ⚠️  Esto puede tardar 30-90 segundos. Solo ocurre la primera vez.');
                const t0 = Date.now();
                const zlib = require('zlib');
                const crudoLoc = usarGz
                    ? zlib.gunzipSync(fs.readFileSync(fLocGz)).toString('utf8')
                    : fs.readFileSync(fLoc, 'utf8');
                const locs = JSON.parse(crudoLoc);

                // Mapa: cve_ent + cve_mun → municipio_id (toda la república)
                const [filasMun] = await pool.query(`
                    SELECT m.id, e.cve AS cve_ent, m.cve AS cve_mun
                      FROM cat_municipios m
                      JOIN cat_estados e ON e.id = m.estado_id`);
                const idMun = new Map(filasMun.map(r => [r.cve_ent + '|' + r.cve_mun, r.id]));

                // Lotes grandes (5000) para velocidad. MySQL max_allowed_packet
                // default es 4 MB; cada fila pesa ~80 bytes → 5000×80 = 400 KB OK.
                const lote = 5000;
                let metidas = 0, omitidas = 0;
                for (let i = 0; i < locs.length; i += lote) {
                    const slice = locs.slice(i, i + lote);
                    const values = [];
                    const filasOK = [];
                    for (const l of slice) {
                        const mid = idMun.get(l.cve_ent + '|' + l.cve_mun);
                        if (!mid) { omitidas++; continue; }
                        values.push(mid, l.cve_loc, l.nombre, l.ambito || null, l.lat, l.lng);
                        filasOK.push(1);
                    }
                    if (filasOK.length) {
                        const placeholders = filasOK.map(() => '(?,?,?,?,?,?)').join(',');
                        await pool.query(
                            `INSERT INTO cat_localidades (municipio_id, cve, nombre, ambito, lat, lng) VALUES ${placeholders}`,
                            values
                        );
                        metidas += filasOK.length;
                    }
                    // Progreso cada ~50k
                    if ((i / lote) % 10 === 0) {
                        process.stdout.write(`   · ${metidas}/${locs.length}\r`);
                    }
                }
                const seg = ((Date.now() - t0) / 1000).toFixed(1);
                console.log(`✅ ${metidas} localidades sembradas en ${seg}s${omitidas ? ` (${omitidas} omitidas por municipio no encontrado)` : ''}.`);
            } else {
                console.warn('⚠️  /seed/localidades.json(.gz) no existe — sin localidades.');
            }
        } else {
            console.log(`✅ Localidades ya cargadas (${nLoc}).`);
        }
    } catch (err) {
        console.warn('⚠️  asegurarCatalogoINEGI:', err.message);
    }
}

// ----- Endpoints del catálogo -----------------------------------------
app.get('/api/catalogo/estados', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id, cve, nombre, abr, lat, lng FROM cat_estados ORDER BY nombre`
        );
        res.json({ ok: true, estados: rows });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.get('/api/catalogo/municipios', async (req, res) => {
    try {
        const estado_id = parseInt(req.query.estado_id, 10);
        if (!estado_id) return res.status(400).json({ ok: false, error: 'Falta estado_id' });
        const [rows] = await pool.query(
            `SELECT id, cve, nombre, lat, lng FROM cat_municipios WHERE estado_id = ? ORDER BY nombre`,
            [estado_id]
        );
        res.json({ ok: true, municipios: rows });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.get('/api/catalogo/localidades', async (req, res) => {
    try {
        const municipio_id = parseInt(req.query.municipio_id, 10);
        if (!municipio_id) return res.status(400).json({ ok: false, error: 'Falta municipio_id' });
        const [rows] = await pool.query(
            `SELECT id, cve, nombre, ambito, lat, lng
               FROM cat_localidades
              WHERE municipio_id = ?
              ORDER BY (ambito = 'U') DESC, nombre`,
            [municipio_id]
        );
        res.json({ ok: true, localidades: rows });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// =====================================================================
//                      MÓDULO DE RESPALDOS DE BD
// =====================================================================
// Estrategia:
//   1) Si `mysqldump` está disponible en el sistema, lo usamos (mejor opción
//      en local con XAMPP/Workbench y compatible con Azure Database for MySQL).
//   2) Si NO está disponible (ej. hosting compartido sin binarios), caemos a
//      un dump puro Node iterando todas las tablas. No incluye triggers ni
//      stored procedures, pero sí toda la data y la estructura.
// Los respaldos se guardan en /backups y se registran en la tabla `respaldos`
// para listar/descargar/eliminar desde el panel web.
// Cron: todos los días a las 02:00 AM se genera uno automático.
// =====================================================================

const { exec, spawn } = require('child_process');

// Tablas-catálogo que NO se respaldan (su contenido se re-siembra desde /seed
// al primer arranque, así que es desperdicio incluirlo en cada respaldo).
// La ESTRUCTURA sí se respalda para que al restaurar la tabla exista vacía y
// el seed la vuelva a llenar automáticamente al siguiente arranque.
const TABLAS_EXCLUIDAS_DATOS = ['cat_localidades'];

// ----- Asegurar tabla `respaldos` y carpeta /backups ------------------
async function asegurarModuloRespaldos() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS respaldos (
                id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
                nombre        VARCHAR(200) NOT NULL,
                ruta          VARCHAR(400) NOT NULL,
                tamano_bytes  BIGINT UNSIGNED NOT NULL DEFAULT 0,
                tipo          ENUM('manual','automatico') NOT NULL DEFAULT 'manual',
                metodo        ENUM('mysqldump','node') NOT NULL DEFAULT 'mysqldump',
                estado        ENUM('ok','error','en_proceso') NOT NULL DEFAULT 'ok',
                mensaje       TEXT,
                usuario_id    INT UNSIGNED DEFAULT NULL,
                created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_resp_fecha (created_at),
                KEY idx_resp_estado (estado)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        const dir = path.join(__dirname, 'backups');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        console.log('✅ Módulo respaldos listo (carpeta /backups y tabla `respaldos`)');
    } catch (err) {
        console.warn('⚠️  asegurarModuloRespaldos:', err.message);
    }
}

// ----- Verificar si mysqldump existe ----------------------------------
function mysqldumpDisponible() {
    return new Promise(resolve => {
        // En Windows el flag --version igual funciona; si el binario no existe falla.
        exec('mysqldump --version', { timeout: 4000 }, (err) => resolve(!err));
    });
}

// ----- Generar respaldo con mysqldump ---------------------------------
function dumpConMysqldump(rutaSalida) {
    return new Promise((resolve, reject) => {
        const args = [
            `--host=${DB_CONFIG.host}`,
            `--port=${DB_CONFIG.port}`,
            `--user=${DB_CONFIG.user}`,
            `--password=${DB_CONFIG.password}`,
            '--single-transaction',
            '--routines',
            '--triggers',
            '--default-character-set=utf8mb4',
            '--column-statistics=0' // evita warning en MySQL 8 vs MariaDB
        ];
        // Excluir tablas-catálogo grandes (se re-siembran desde /seed)
        for (const t of TABLAS_EXCLUIDAS_DATOS) {
            args.push(`--ignore-table=${DB_CONFIG.database}.${t}`);
        }
        args.push(DB_CONFIG.database);

        const out = fs.createWriteStream(rutaSalida);
        const proc = spawn('mysqldump', args);
        let stderr = '';
        proc.stdout.pipe(out);
        proc.stderr.on('data', d => { stderr += d.toString(); });
        proc.on('error', reject);
        proc.on('close', code => {
            out.close();
            if (code === 0) resolve();
            else reject(new Error(`mysqldump salió con código ${code}: ${stderr || 'sin detalle'}`));
        });
    });
}

// ----- Fallback puro Node ---------------------------------------------
async function dumpConNode(rutaSalida) {
    const lines = [];
    const fecha = new Date().toISOString();
    lines.push(`-- SIGEPAV · Respaldo generado por Node (fallback)`);
    lines.push(`-- Base: ${DB_CONFIG.database}  ·  Fecha: ${fecha}`);
    lines.push(`SET FOREIGN_KEY_CHECKS=0;`);
    lines.push(`SET NAMES utf8mb4;`);
    lines.push('');

    const [tablas] = await pool.query(
        `SELECT TABLE_NAME AS t FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
        [DB_CONFIG.database]
    );

    for (const { t } of tablas) {
        if (TABLAS_EXCLUIDAS_DATOS.includes(t)) {
            // Saltamos por completo las tablas excluidas; el seed las re-crea
            // y rellena automáticamente al siguiente arranque.
            lines.push(`-- ------ ${t} omitida (catálogo grande, se re-siembra desde /seed) ------`);
            lines.push('');
            continue;
        }
        const [createRows] = await pool.query(`SHOW CREATE TABLE \`${t}\``);
        const createSql = createRows[0]['Create Table'] || createRows[0]['Create View'];
        lines.push(`-- ------ Estructura de ${t} ------`);
        lines.push(`DROP TABLE IF EXISTS \`${t}\`;`);
        lines.push(createSql + ';');
        lines.push('');

        const [rows] = await pool.query(`SELECT * FROM \`${t}\``);
        if (rows.length) {
            lines.push(`-- ------ Datos de ${t} (${rows.length} filas) ------`);
            for (const row of rows) {
                const cols = Object.keys(row).map(c => `\`${c}\``).join(',');
                const vals = Object.values(row).map(v => {
                    if (v === null || v === undefined) return 'NULL';
                    if (typeof v === 'number') return v;
                    if (v instanceof Date) return `'${v.toISOString().slice(0,19).replace('T',' ')}'`;
                    if (Buffer.isBuffer(v)) return `0x${v.toString('hex')}`;
                    return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
                }).join(',');
                lines.push(`INSERT INTO \`${t}\` (${cols}) VALUES (${vals});`);
            }
            lines.push('');
        }
    }
    lines.push(`SET FOREIGN_KEY_CHECKS=1;`);
    fs.writeFileSync(rutaSalida, lines.join('\n'), 'utf8');
}

// ----- Función central: genera + registra ------------------------------
async function generarRespaldo({ tipo = 'manual', usuario_id = null } = {}) {
    const fechaTag = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const nombre   = `sigepav_${tipo}_${fechaTag}.sql`;
    const ruta     = path.join('backups', nombre);
    const rutaAbs  = path.join(__dirname, ruta);

    const [insRes] = await pool.query(
        `INSERT INTO respaldos (nombre, ruta, tipo, metodo, estado, usuario_id)
         VALUES (?, ?, ?, 'mysqldump', 'en_proceso', ?)`,
        [nombre, ruta, tipo, usuario_id]
    );
    const id = insRes.insertId;

    try {
        const hayDump = await mysqldumpDisponible();
        const metodo  = hayDump ? 'mysqldump' : 'node';

        if (hayDump) await dumpConMysqldump(rutaAbs);
        else         await dumpConNode(rutaAbs);

        const tam = fs.statSync(rutaAbs).size;
        await pool.query(
            `UPDATE respaldos SET estado='ok', metodo=?, tamano_bytes=? WHERE id=?`,
            [metodo, tam, id]
        );

        if (usuario_id) {
            await registrarBitacora(usuario_id, `Respaldo generado: ${nombre}`, 'respaldos', id, null)
                .catch(() => {});
        }
        return { id, nombre, ruta, tamano_bytes: tam, metodo, estado: 'ok' };
    } catch (err) {
        const mensaje = (err && err.message) || 'Error desconocido';
        await pool.query(
            `UPDATE respaldos SET estado='error', mensaje=? WHERE id=?`,
            [mensaje, id]
        );
        // Borra archivo parcial si quedó
        try { if (fs.existsSync(rutaAbs)) fs.unlinkSync(rutaAbs); } catch (_) {}
        throw err;
    }
}

// ----- Endpoints públicos --------------------------------------------
// Listar respaldos
app.get('/api/respaldos', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT r.id, r.nombre, r.ruta, r.tamano_bytes, r.tipo, r.metodo,
                    r.estado, r.mensaje, r.created_at,
                    u.nombre AS usuario_nombre, u.email AS usuario_email
               FROM respaldos r
               LEFT JOIN usuarios u ON u.id = r.usuario_id
              ORDER BY r.created_at DESC
              LIMIT 200`
        );
        // Estadísticas
        const [stats] = await pool.query(
            `SELECT
                COUNT(*) AS total,
                SUM(estado='ok') AS exitosos,
                SUM(estado='error') AS fallidos,
                COALESCE(SUM(tamano_bytes),0) AS bytes_total,
                MAX(CASE WHEN estado='ok' THEN created_at END) AS ultimo_ok
               FROM respaldos`
        );
        res.json({ ok: true, respaldos: rows, stats: stats[0] });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Crear respaldo manual
app.post('/api/respaldos', async (req, res) => {
    try {
        const usuario_id = req.body && req.body.usuario_id ? req.body.usuario_id : null;
        const r = await generarRespaldo({ tipo: 'manual', usuario_id });
        res.json({ ok: true, respaldo: r });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Descargar respaldo
app.get('/api/respaldos/:id/descargar', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT nombre, ruta, estado FROM respaldos WHERE id = ? LIMIT 1`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ ok: false, error: 'Respaldo no encontrado' });
        const r = rows[0];
        if (r.estado !== 'ok') return res.status(409).json({ ok: false, error: 'El respaldo no está disponible (estado: ' + r.estado + ')' });

        const abs = path.join(__dirname, r.ruta);
        if (!fs.existsSync(abs)) return res.status(410).json({ ok: false, error: 'Archivo no existe en disco' });
        res.download(abs, r.nombre);
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Eliminar respaldo (archivo + registro)
app.delete('/api/respaldos/:id', async (req, res) => {
    try {
        const [rows] = await pool.query(`SELECT ruta FROM respaldos WHERE id = ?`, [req.params.id]);
        if (!rows.length) return res.status(404).json({ ok: false, error: 'No encontrado' });
        const abs = path.join(__dirname, rows[0].ruta);
        try { if (fs.existsSync(abs)) fs.unlinkSync(abs); } catch (_) {}
        await pool.query(`DELETE FROM respaldos WHERE id = ?`, [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// =====================================================================
//  MÓDULO A — Vencimientos y alertas inteligentes
// =====================================================================

// GET /api/vencimientos
// Devuelve todos los vehículos activos con sus fechas y semáforo calculado.
// semaforo: 'verde' (≥30 días), 'amarillo' (15–29 días), 'rojo' (<15 o vencido/null)
app.get('/api/vencimientos', async (req, res) => {
    try {
        const hoy = new Date();
        const [vehiculos] = await pool.query(
            `SELECT id, no_economico, marca, linea, modelo, placas,
                    fecha_tenencia, fecha_verificacion, fecha_seguro, km_actual
               FROM vehiculos WHERE activo = 1 ORDER BY no_economico`
        );

        const [programados] = await pool.query(
            `SELECT mp.*, v.km_actual
               FROM mantenimiento_programado mp
               JOIN vehiculos v ON v.id = mp.vehiculo_id
              WHERE v.activo = 1`
        );

        function diasHasta(fecha) {
            if (!fecha) return null;
            const d = new Date(fecha);
            return Math.floor((d - hoy) / 86400000);
        }

        function semaforo(dias) {
            if (dias === null) return 'rojo';
            if (dias < 15)  return 'rojo';
            if (dias < 30)  return 'amarillo';
            return 'verde';
        }

        const resultado = vehiculos.map(v => {
            const ten = diasHasta(v.fecha_tenencia);
            const ver = diasHasta(v.fecha_verificacion);
            const seg = diasHasta(v.fecha_seguro);

            const mantVehiculo = programados
                .filter(mp => mp.vehiculo_id === v.id)
                .map(mp => {
                    let diasMant = null;
                    if (mp.intervalo_meses && mp.ultima_fecha) {
                        const proxFecha = new Date(mp.ultima_fecha);
                        proxFecha.setMonth(proxFecha.getMonth() + mp.intervalo_meses);
                        diasMant = Math.floor((proxFecha - hoy) / 86400000);
                    }
                    let kmRestantes = null;
                    if (mp.intervalo_km && mp.ultimo_km != null) {
                        kmRestantes = (mp.ultimo_km + mp.intervalo_km) - v.km_actual;
                    }
                    return {
                        id: mp.id,
                        componente: mp.componente,
                        intervalo_km: mp.intervalo_km,
                        intervalo_meses: mp.intervalo_meses,
                        ultimo_km: mp.ultimo_km,
                        ultima_fecha: mp.ultima_fecha,
                        dias_para_mantenimiento: diasMant,
                        km_restantes: kmRestantes,
                        semaforo: semaforo(diasMant ?? (kmRestantes !== null ? (kmRestantes < 500 ? -1 : kmRestantes < 1000 ? 20 : 40) : null))
                    };
                });

            const semaforoGeneral = [ten, ver, seg]
                .reduce((peor, d) => {
                    const s = semaforo(d);
                    if (s === 'rojo') return 'rojo';
                    if (s === 'amarillo' && peor !== 'rojo') return 'amarillo';
                    return peor;
                }, 'verde');

            return {
                id: v.id,
                no_economico: v.no_economico,
                marca: v.marca,
                linea: v.linea,
                modelo: v.modelo,
                placas: v.placas,
                km_actual: v.km_actual,
                fecha_tenencia: v.fecha_tenencia,
                dias_tenencia: ten,
                semaforo_tenencia: semaforo(ten),
                fecha_verificacion: v.fecha_verificacion,
                dias_verificacion: ver,
                semaforo_verificacion: semaforo(ver),
                fecha_seguro: v.fecha_seguro,
                dias_seguro: seg,
                semaforo_seguro: semaforo(seg),
                semaforo_general: semaforoGeneral,
                mantenimiento: mantVehiculo
            };
        });

        // Ordenar: rojos primero, luego amarillos, luego verdes
        const orden = { rojo: 0, amarillo: 1, verde: 2 };
        resultado.sort((a, b) => orden[a.semaforo_general] - orden[b.semaforo_general]);

        res.json({ ok: true, datos: resultado });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// GET /api/mantenimiento-programado?vehiculo_id=X
app.get('/api/mantenimiento-programado', async (req, res) => {
    try {
        const { vehiculo_id } = req.query;
        let sql = `SELECT mp.*, v.no_economico, v.marca, v.linea
                     FROM mantenimiento_programado mp
                     JOIN vehiculos v ON v.id = mp.vehiculo_id`;
        const params = [];
        if (vehiculo_id) { sql += ' WHERE mp.vehiculo_id = ?'; params.push(vehiculo_id); }
        sql += ' ORDER BY mp.vehiculo_id, mp.componente';
        const [rows] = await pool.query(sql, params);
        res.json({ ok: true, datos: rows });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// POST /api/mantenimiento-programado
app.post('/api/mantenimiento-programado', async (req, res) => {
    try {
        const { vehiculo_id, componente, intervalo_km, intervalo_meses, ultimo_km, ultima_fecha } = req.body;
        if (!vehiculo_id || !componente) return res.status(400).json({ ok: false, error: 'vehiculo_id y componente son requeridos.' });
        const [r] = await pool.query(
            `INSERT INTO mantenimiento_programado (vehiculo_id, componente, intervalo_km, intervalo_meses, ultimo_km, ultima_fecha)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [vehiculo_id, componente, intervalo_km || null, intervalo_meses || null, ultimo_km || null, ultima_fecha || null]
        );
        res.json({ ok: true, id: r.insertId });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// PUT /api/mantenimiento-programado/:id
app.put('/api/mantenimiento-programado/:id', async (req, res) => {
    try {
        const { componente, intervalo_km, intervalo_meses, ultimo_km, ultima_fecha } = req.body;
        await pool.query(
            `UPDATE mantenimiento_programado
                SET componente = ?, intervalo_km = ?, intervalo_meses = ?, ultimo_km = ?, ultima_fecha = ?
              WHERE id = ?`,
            [componente, intervalo_km || null, intervalo_meses || null, ultimo_km || null, ultima_fecha || null, req.params.id]
        );
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// DELETE /api/mantenimiento-programado/:id
app.delete('/api/mantenimiento-programado/:id', async (req, res) => {
    try {
        await pool.query(`DELETE FROM mantenimiento_programado WHERE id = ?`, [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// POST /api/mantenimiento-programado/:id/registrar-servicio
// El admin registra un servicio realizado: (1) reinicia el contador
// (ultimo_km/ultima_fecha), (2) sube el km del vehículo si el odómetro es
// mayor, (3) guarda el servicio como observación resuelta con su costo,
// que se refleja automáticamente en el Módulo B (costos por vehículo).
app.post('/api/mantenimiento-programado/:id/registrar-servicio', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { km, fecha, costo, nota, usuario_id } = req.body || {};
        if (km === undefined || km === null || km === '' || isNaN(Number(km))) {
            return res.status(400).json({ ok: false, error: 'El kilometraje del odómetro es obligatorio.' });
        }
        const kmNum = Number(km);
        const fechaServicio = fecha || new Date().toISOString().slice(0, 10);

        const [[mp]] = await pool.query(
            `SELECT vehiculo_id, componente FROM mantenimiento_programado WHERE id = ?`, [id]
        );
        if (!mp) return res.status(404).json({ ok: false, error: 'Intervalo de mantenimiento no encontrado.' });

        // (1) Reinicia el contador del servicio.
        await pool.query(
            `UPDATE mantenimiento_programado SET ultimo_km = ?, ultima_fecha = ? WHERE id = ?`,
            [kmNum, fechaServicio, id]
        );
        // (2) Sube el km del vehículo si el odómetro capturado es mayor.
        await pool.query(
            `UPDATE vehiculos SET km_actual = GREATEST(km_actual, ?) WHERE id = ?`,
            [kmNum, mp.vehiculo_id]
        );
        // (3) Registra el servicio como observación resuelta (con costo → Módulo B).
        let usuarioId = Number(usuario_id) || null;
        if (!usuarioId) {
            const [[adm]] = await pool.query(`SELECT id FROM usuarios WHERE rol_id = 1 AND activo = 1 ORDER BY id LIMIT 1`);
            usuarioId = adm ? adm.id : null;
        }
        await pool.query(
            `INSERT INTO mantenimiento_observaciones
                (vehiculo_id, usuario_id, componente, km_reporte, severidad, descripcion, estado, costo, resolucion, fecha_resolucion)
             VALUES (?, ?, ?, ?, 'baja', ?, 'resuelto', ?, ?, ?)`,
            [mp.vehiculo_id, usuarioId, mp.componente, kmNum,
             `Servicio preventivo realizado: ${mp.componente}`,
             Number(costo) || 0, nota || 'Servicio preventivo registrado.', fechaServicio]
        );

        res.json({ ok: true });
    } catch (err) {
        console.error('Error POST registrar-servicio:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// =====================================================================
//   MÓDULO F — Configuración / modo de operación (público | privado)
//   El mismo núcleo sirve para sector público (transparencia ciudadana)
//   y privado (flotilla). En modo privado se oculta el módulo ciudadano.
// =====================================================================
async function asegurarConfiguracion() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS configuracion (
            clave VARCHAR(60) NOT NULL,
            valor TEXT NULL,
            PRIMARY KEY (clave)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await pool.query(
        `INSERT INTO configuracion (clave, valor) VALUES ('MODO_OPERACION', 'publico')
         ON DUPLICATE KEY UPDATE clave = clave`
    );
    console.log('✅ Tabla configuracion lista.');
}

const CONFIG_CLAVES_VALIDAS = ['MODO_OPERACION', 'NOMBRE_ORGANIZACION'];

// GET /api/configuracion — devuelve toda la configuración como objeto.
app.get('/api/configuracion', async (req, res) => {
    try {
        const [rows] = await pool.query(`SELECT clave, valor FROM configuracion`);
        const config = {};
        rows.forEach(r => { config[r.clave] = r.valor; });
        if (!config.MODO_OPERACION) config.MODO_OPERACION = 'publico';
        res.json({ ok: true, config });
    } catch (err) {
        console.error('Error GET /api/configuracion:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// PUT /api/configuracion — actualiza una o varias claves permitidas.
app.put('/api/configuracion', async (req, res) => {
    try {
        const cambios = req.body || {};
        for (const [clave, valor] of Object.entries(cambios)) {
            if (!CONFIG_CLAVES_VALIDAS.includes(clave)) continue;
            if (clave === 'MODO_OPERACION' && !['publico', 'privado'].includes(String(valor))) {
                return res.status(400).json({ ok: false, error: 'MODO_OPERACION debe ser "publico" o "privado".' });
            }
            await pool.query(
                `INSERT INTO configuracion (clave, valor) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
                [clave, valor == null ? null : String(valor)]
            );
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('Error PUT /api/configuracion:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// =====================================================================
//  MÓDULO B — Costos por vehículo
// =====================================================================

// GET /api/costos/vehiculos
app.get('/api/costos/vehiculos', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT
                v.id,
                v.no_economico,
                v.marca,
                v.linea,
                v.modelo,
                v.placas,
                v.km_actual,
                COALESCE(comb.total_costo_comb, 0)  AS costo_combustible,
                COALESCE(comb.total_litros, 0)       AS litros_total,
                COALESCE(mant.total_costo_mant, 0)   AS costo_mantenimiento,
                COALESCE(km.km_recorridos, 0)        AS km_recorridos,
                ROUND(
                    (COALESCE(comb.total_costo_comb, 0) + COALESCE(mant.total_costo_mant, 0))
                    / NULLIF(COALESCE(km.km_recorridos, 0), 0),
                2)                                   AS costo_por_km
            FROM vehiculos v
            LEFT JOIN (
                SELECT vehiculo_id,
                       SUM(costo)  AS total_costo_comb,
                       SUM(litros) AS total_litros
                  FROM vales_combustible
                 WHERE vehiculo_id IS NOT NULL
                 GROUP BY vehiculo_id
            ) comb ON comb.vehiculo_id = v.id
            LEFT JOIN (
                SELECT vehiculo_id,
                       SUM(costo) AS total_costo_mant
                  FROM mantenimiento_observaciones
                 GROUP BY vehiculo_id
            ) mant ON mant.vehiculo_id = v.id
            LEFT JOIN (
                SELECT vehiculo_id,
                       SUM(km_final - km_inicial) AS km_recorridos
                  FROM viajes
                 WHERE estado = 'Finalizado'
                   AND km_final IS NOT NULL
                   AND km_final > km_inicial
                 GROUP BY vehiculo_id
            ) km ON km.vehiculo_id = v.id
            WHERE v.activo = 1
            ORDER BY (COALESCE(comb.total_costo_comb, 0) + COALESCE(mant.total_costo_mant, 0)) DESC
        `);
        res.json({ ok: true, datos: rows });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// GET /api/costos/vehiculos/:id  — detalle de un vehículo
app.get('/api/costos/vehiculos/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const [[vehiculo]] = await pool.query(
            `SELECT id, no_economico, marca, linea, modelo, placas, km_actual
               FROM vehiculos WHERE id = ? AND activo = 1`, [id]
        );
        if (!vehiculo) return res.status(404).json({ ok: false, error: 'Vehículo no encontrado.' });

        const [combustible] = await pool.query(
            `SELECT fecha_recarga, litros, precio_litro, costo, ticket_no, observaciones
               FROM vales_combustible WHERE vehiculo_id = ? ORDER BY fecha_recarga DESC`, [id]
        );
        const [mantenimiento] = await pool.query(
            `SELECT componente, severidad, costo, estado, created_at
               FROM mantenimiento_observaciones WHERE vehiculo_id = ? ORDER BY created_at DESC`, [id]
        );
        const [viajes] = await pool.query(
            `SELECT id, fecha_inicio, fecha_fin, km_inicial, km_final,
                    (km_final - km_inicial) AS km_recorridos, lugar_destino
               FROM viajes WHERE vehiculo_id = ? AND estado = 'Finalizado'
                AND km_final IS NOT NULL AND km_final > km_inicial
               ORDER BY fecha_inicio DESC`, [id]
        );

        const totalComb = combustible.reduce((s, r) => s + Number(r.costo), 0);
        const totalMant = mantenimiento.reduce((s, r) => s + Number(r.costo), 0);
        const totalKm   = viajes.reduce((s, r) => s + Number(r.km_recorridos), 0);

        res.json({
            ok: true,
            vehiculo,
            resumen: {
                costo_combustible: totalComb,
                costo_mantenimiento: totalMant,
                costo_total: totalComb + totalMant,
                km_recorridos: totalKm,
                costo_por_km: totalKm > 0 ? Math.round((totalComb + totalMant) / totalKm * 100) / 100 : null
            },
            combustible,
            mantenimiento,
            viajes
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ----- Cron diario simple (sin dependencias) ---------------------------
// Corre cada 60s y dispara un respaldo si:
//   a) es 02:00–02:01, y
//   b) hoy no hay un respaldo automático "ok".
let _cronUltimoChequeo = 0;
setInterval(async () => {
    try {
        const ahora = new Date();
        const h = ahora.getHours();
        const m = ahora.getMinutes();
        if (h !== 2 || m > 5) return;
        if (Date.now() - _cronUltimoChequeo < 5 * 60 * 1000) return; // antirrebote 5min
        _cronUltimoChequeo = Date.now();

        const [rows] = await pool.query(
            `SELECT COUNT(*) AS n FROM respaldos
              WHERE tipo='automatico' AND estado='ok'
                AND DATE(created_at) = CURDATE()`
        );
        if (rows[0].n > 0) return;

        console.log('🕑 Cron de respaldos: generando respaldo automático...');
        const r = await generarRespaldo({ tipo: 'automatico' });
        console.log(`✅ Respaldo automático listo: ${r.nombre} (${r.tamano_bytes} bytes)`);
    } catch (err) {
        console.warn('⚠️  Cron de respaldos falló:', err.message);
    }
}, 60 * 1000);

// ----- Vencimientos (Módulo A): generación de alertas + correo --------
// Idempotente: borra las alertas auto-generadas y las regenera desde el
// estado actual de la flota. Así re-ejecutar el job NO duplica alertas
// (la tabla `alertas` no tiene UNIQUE key, por eso no se usa ON DUPLICATE).
async function procesarAlertasVencimientos({ enviarCorreo = false } = {}) {
    const [vehiculos] = await pool.query(
        `SELECT id, no_economico, marca, linea, fecha_tenencia, fecha_verificacion,
                fecha_seguro, km_actual
           FROM vehiculos WHERE activo = 1`
    );
    const [programados] = await pool.query(`SELECT * FROM mantenimiento_programado`);

    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const diasHasta = (fecha) => {
        if (!fecha) return null;
        const f = new Date(String(fecha).slice(0, 10) + 'T00:00:00');
        if (isNaN(f.getTime())) return null;
        return Math.round((f - hoy) / 86400000);
    };

    // 1) Limpiar las alertas automáticas previas (solo los tipos que este job administra).
    await pool.query(
        `DELETE FROM alertas WHERE tipo IN ('tenencia','verificacion','seguro','mantenimiento')`
    );

    // 2) Regenerar alertas vigentes (ventana de 30 días o ya vencido).
    const alertas = [];
    for (const v of vehiculos) {
        const docs = [
            { tipo: 'tenencia',     fecha: v.fecha_tenencia },
            { tipo: 'verificacion', fecha: v.fecha_verificacion },
            { tipo: 'seguro',       fecha: v.fecha_seguro },
        ];
        for (const d of docs) {
            const dias = diasHasta(d.fecha);
            if (dias === null || dias > 30) continue;
            const f = String(d.fecha).slice(0, 10);
            const desc = `Unidad ${v.no_economico}: ${d.tipo} ${dias < 0 ? 'vencida hace ' + Math.abs(dias) + ' días' : 'vence en ' + dias + ' días'} (${f})`;
            await pool.query(
                `INSERT INTO alertas (vehiculo_id, tipo, descripcion, estado, fecha_vencimiento)
                 VALUES (?, ?, ?, 'activa', ?)`,
                [v.id, d.tipo, desc, f]
            );
            alertas.push({ eco: v.no_economico, tipo: d.tipo, dias, rojo: dias < 15 });
        }

        // Mantenimiento programado (por km y/o por fecha).
        for (const mp of programados.filter(p => p.vehiculo_id === v.id)) {
            let kmRest = null, dias = null;
            if (mp.intervalo_km && mp.ultimo_km != null) {
                kmRest = (Number(mp.ultimo_km) + Number(mp.intervalo_km)) - Number(v.km_actual);
            }
            if (mp.intervalo_meses && mp.ultima_fecha) {
                const f = new Date(String(mp.ultima_fecha).slice(0, 10) + 'T00:00:00');
                if (!isNaN(f.getTime())) {
                    f.setMonth(f.getMonth() + Number(mp.intervalo_meses));
                    dias = Math.round((f - hoy) / 86400000);
                }
            }
            const criticoKm  = kmRest !== null && kmRest <= 1000;
            const criticoDia = dias   !== null && dias <= 30;
            if (!criticoKm && !criticoDia) continue;
            const detalle = [
                kmRest !== null ? (kmRest < 0 ? 'VENCIDO por km'    : kmRest + ' km restantes') : null,
                dias   !== null ? (dias < 0   ? 'VENCIDO por fecha' : dias + ' días')           : null,
            ].filter(Boolean).join(' · ');
            await pool.query(
                `INSERT INTO alertas (vehiculo_id, tipo, descripcion, estado, fecha_vencimiento)
                 VALUES (?, 'mantenimiento', ?, 'activa', NULL)`,
                [v.id, `Unidad ${v.no_economico}: ${mp.componente} — ${detalle}`]
            );
            const rojo = (kmRest !== null && kmRest <= 0) || (dias !== null && dias < 15);
            alertas.push({ eco: v.no_economico, tipo: 'mantenimiento', dias, rojo });
        }
    }

    const rojas = alertas.filter(a => a.rojo);

    // 3) Correo a administradores (solo cuando se solicita explícitamente).
    let correoEnviado = false;
    if (enviarCorreo && rojas.length > 0 && process.env.MAIL_USER) {
        try {
            const [admins] = await pool.query(
                `SELECT email FROM usuarios WHERE rol_id = 1 AND activo = 1`
            );
            if (admins.length > 0) {
                const filas = rojas.map(a =>
                    `<tr><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0"><strong>${a.eco}</strong></td>
                     <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-transform:capitalize">${a.tipo}</td>
                     <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;color:#c53030">${a.dias != null ? (a.dias < 0 ? 'VENCIDO' : a.dias + ' días') : 'Revisar'}</td></tr>`
                ).join('');
                await mailTransport.sendMail({
                    from: process.env.MAIL_FROM || 'SIGEPAV <no-reply@itszn.edu.mx>',
                    to: admins.map(a => a.email).join(','),
                    subject: `⚠️ SIGEPAV — ${rojas.length} alerta(s) en rojo`,
                    html: `<div style="font-family:sans-serif;max-width:600px;margin:auto">
                        <div style="background:#0d2d6b;padding:20px;border-radius:8px 8px 0 0">
                            <h2 style="color:#fff;margin:0">SIGEPAV</h2>
                            <p style="color:rgba(255,255,255,.7);margin:4px 0 0">Alertas de vencimiento</p>
                        </div>
                        <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
                            <p>Las siguientes unidades requieren atención <strong>urgente</strong>:</p>
                            <table style="width:100%;border-collapse:collapse;margin:12px 0">
                                <thead><tr style="background:#f7fafc">
                                    <th style="padding:8px 12px;text-align:left">Unidad</th>
                                    <th style="padding:8px 12px;text-align:left">Tipo</th>
                                    <th style="padding:8px 12px;text-align:left">Estado</th>
                                </tr></thead>
                                <tbody>${filas}</tbody>
                            </table>
                            <p style="color:#64748b;font-size:.85rem">Revisa el módulo de Vencimientos en SIGEPAV para más detalles.</p>
                        </div>
                    </div>`
                });
                correoEnviado = true;
            }
        } catch (mailErr) {
            console.warn('⚠️  Correo de vencimientos no enviado:', mailErr.message);
        }
    }

    return { procesadas: alertas.length, rojas: rojas.length, correoEnviado };
}

// Endpoint manual: genera/refresca las alertas al instante (para demo y pruebas).
// Por defecto NO envía correo; usar ?correo=1 para forzar el envío a los admins.
app.post('/api/alertas/generar', async (req, res) => {
    try {
        const enviarCorreo = req.query.correo === '1' || req.query.correo === 'true';
        const r = await procesarAlertasVencimientos({ enviarCorreo });
        res.json({ ok: true, ...r });
    } catch (err) {
        console.error('Error POST /api/alertas/generar:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ----- Cron de vencimientos (Módulo A) ---------------------------------
// Corre cada 60s; dispara a las 08:00–08:05 una vez por día (con correo).
let _cronVencUltimoChequeo = 0;
setInterval(async () => {
    try {
        const ahora = new Date();
        if (ahora.getHours() !== 8 || ahora.getMinutes() > 5) return;
        if (Date.now() - _cronVencUltimoChequeo < 5 * 60 * 1000) return;
        _cronVencUltimoChequeo = Date.now();
        console.log('🕗 Cron vencimientos: procesando alertas...');
        const r = await procesarAlertasVencimientos({ enviarCorreo: true });
        console.log(`✅ Cron vencimientos: ${r.procesadas} alertas, ${r.rojas} en rojo, correo=${r.correoEnviado}`);
    } catch (err) {
        console.warn('⚠️  Cron de vencimientos falló:', err.message);
    }
}, 60 * 1000);

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 SIGEPAV corriendo en  http://0.0.0.0:${PORT}`);
    console.log(`🌐 Público Azure: ${BASE_URL}`);
    console.log(`📦 BUILD: ${VERSION_TAG}`);
    console.log(`🔗 BASE_URL: ${BASE_URL}\n`);
});
