-- =====================================================================
--  SIGEPAV — Script SQL completo y corregido
--  Sistema de Gestión del Parque Vehicular — SIGEPAV
--
--  Generado tras auditoría completa del código fuente (Server.js,
--  Script.js, index.html, Usuario.html).
--
--  CÓMO USAR:
--    Opción A — Base nueva (DROP + CREATE):
--      mysql -u root -p < sigepav_BDD.sql
--
--    Opción B — Migración sobre base existente:
--      Ejecutar únicamente la sección "MIGRACIÓN" al final del archivo.
--
--  El script está ordenado respetando dependencias de llaves foráneas.
--  Incluye el módulo Ciudadano (antes ciudadano_migration.sql), ya fusionado
--  al final, en la SECCIÓN 3.
-- =====================================================================

-- ============================================================
--  SECCIÓN 1: RECREACIÓN COMPLETA (Opción A — base desde cero)
-- ============================================================

DROP DATABASE IF EXISTS sigepav;
CREATE DATABASE sigepav
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE sigepav;

-- -----------------------------------------------------------
--  1. roles
--  Tabla base; usuarios la referencia con FK.
--  Solo 2 roles activos: 1 = Administrador, 2 = Operativo.
-- -----------------------------------------------------------
CREATE TABLE roles (
    id     TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
    nombre VARCHAR(40)      NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_roles_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO roles (id, nombre) VALUES
    (1, 'Administrador'),
    (2, 'Operativo');

-- -----------------------------------------------------------
--  2. usuarios
--  FIX: password_hash cambió de contraseña en texto plano
--       a VARCHAR(72) para bcrypt ($2b$10$...).
--  FIX: activo es TINYINT(1) para borrado lógico.
--  FIX: email UNIQUE necesario para evitar duplicados.
--  FIX: created_at con DEFAULT CURRENT_TIMESTAMP.
-- -----------------------------------------------------------
CREATE TABLE usuarios (
    id             INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    nombre         VARCHAR(80)     NOT NULL,
    apellidos      VARCHAR(80)         NULL DEFAULT NULL,
    email          VARCHAR(150)    NOT NULL,
    password_hash  VARCHAR(72)     NOT NULL,   -- bcrypt hash (60 chars) + margen
    rol_id         TINYINT UNSIGNED NOT NULL DEFAULT 2,
    departamento   VARCHAR(100)        NULL DEFAULT NULL,
    cargo          VARCHAR(100)        NULL DEFAULT NULL,
    foto_perfil    VARCHAR(255)        NULL DEFAULT NULL,
    activo         TINYINT(1)      NOT NULL DEFAULT 1,
    created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_usuarios_email (email),
    CONSTRAINT fk_usuarios_rol
        FOREIGN KEY (rol_id) REFERENCES roles (id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Usuarios semilla (el servidor también los crea si no existen)
-- Las contraseñas en texto plano solo como fallback; el servidor
-- reemplaza con bcrypt en la primera ejecución.
INSERT INTO usuarios
    (nombre, apellidos, email, password_hash, rol_id, departamento, cargo, activo)
VALUES
    ('Aldair', 'Admin',   'aldair@itszn.edu.mx', 'Admin',   1,
     'Subdirección Administrativa', 'Administrador',     1),
    ('Diego',  'Usuario', 'diego@itszn.edu.mx',  'Usuario', 2,
     'Subdirección Administrativa', 'Usuario operativo', 1);

-- -----------------------------------------------------------
--  3. vehiculos
--  FIX: tipo cambia de TEXT libre a ENUM cerrado que coincide
--       con TIPOS_VALIDOS del servidor.
--  FIX: no_serie permite NULL (no todo vehículo lo tiene);
--       UNIQUE solo cuando no es NULL.
--  FIX: placas UNIQUE NOT NULL.
--  FIX: qr_token UNIQUE para evitar colisiones de UUID.
--  FIX: fechas de tenencia/verificación/seguro como DATE NULL.
--  FIX: activo TINYINT(1) para borrado lógico.
--  FIX: combustible como VARCHAR(30) (el servidor lo usa libre).
-- -----------------------------------------------------------
CREATE TABLE vehiculos (
    id                  INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    no_economico        VARCHAR(10)     NOT NULL,
    marca               VARCHAR(50)     NOT NULL,
    linea               VARCHAR(50)     NOT NULL,
    modelo              SMALLINT UNSIGNED NOT NULL DEFAULT 0,   -- año del modelo
    tipo                ENUM('sedan','coupe','pickup','suv',
                             'hatchback','van','motocicleta','otro') NULL DEFAULT NULL,
    capacidad           TINYINT UNSIGNED NULL DEFAULT NULL,     -- pasajeros
    color               VARCHAR(30)     NULL DEFAULT NULL,
    no_serie            VARCHAR(17)     NULL DEFAULT NULL,      -- VIN 17 chars
    placas              VARCHAR(10)     NOT NULL,
    combustible         VARCHAR(30)     NULL DEFAULT 'Gasolina Magna',
    km_actual           INT UNSIGNED    NOT NULL DEFAULT 0,
    fecha_tenencia      DATE            NULL DEFAULT NULL,
    fecha_verificacion  DATE            NULL DEFAULT NULL,
    fecha_seguro        DATE            NULL DEFAULT NULL,
    activo              TINYINT(1)      NOT NULL DEFAULT 1,
    qr_token            VARCHAR(36)     NULL DEFAULT NULL,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_vehiculos_eco    (no_economico),
    UNIQUE KEY uq_vehiculos_placas (placas),
    UNIQUE KEY uq_vehiculos_serie  (no_serie),     -- acepta NULL duplicado en MySQL
    UNIQUE KEY uq_vehiculos_qr     (qr_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------
--  4. viajes
--  CRÍTICO: estado debe ser VARCHAR(40), NO ENUM cerrado.
--  El servidor usa estos valores dinámicos:
--    'Pendiente'              — recién creado por el admin
--    'En comision'            — iniciado por el usuario (sin tilde)
--    'En comisión'            — variante con tilde (tolerada por el helper)
--    'Solicitud finalización' — usuario pidió cerrar (con tilde)
--    'Solicitud finalizacion' — variante sin tilde
--    'Finalizado'             — aprobado por admin
--    'Cancelado'              — cancelación explícita
--  Si se usara ENUM, cualquier variante no listada genera error.
--
--  FIX: nivel_comb_ini / nivel_comb_fin son VARCHAR(20), no existen
--       en muchos esquemas anteriores pero el servidor las escribe e
--       indexa (GET /api/viajes, GET /api/viajes/usuario/:id).
--  FIX: qr_token UNIQUE NULL para permitir sin QR.
--  FIX: FK usuario_id y vehiculo_id necesitan ser del tipo correcto
--       (INT UNSIGNED igual que las tablas padre).
-- -----------------------------------------------------------
CREATE TABLE viajes (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    usuario_id      INT UNSIGNED    NOT NULL,
    vehiculo_id     INT UNSIGNED    NOT NULL,
    no_vale         VARCHAR(20)     NOT NULL DEFAULT 'S/V',
    no_oficio       VARCHAR(30)     NULL DEFAULT NULL,
    responsable     VARCHAR(120)    NULL DEFAULT NULL,
    lugar_destino   VARCHAR(150)    NULL DEFAULT NULL,
    estado_dst      VARCHAR(50)     NULL DEFAULT NULL,   -- estado del país destino
    municipio       VARCHAR(100)    NULL DEFAULT NULL,
    localidad       VARCHAR(100)    NULL DEFAULT NULL,
    motivo          TEXT            NULL DEFAULT NULL,
    descripcion     TEXT            NULL DEFAULT NULL,
    observaciones   TEXT            NULL DEFAULT NULL,
    km_inicial      INT UNSIGNED    NOT NULL DEFAULT 0,
    km_final        INT UNSIGNED        NULL DEFAULT NULL,
    nivel_comb_ini  VARCHAR(20)     NULL DEFAULT NULL,   -- 'lleno', '3/4', '1/2', '1/4', 'reserva'
    nivel_comb_fin  VARCHAR(20)     NULL DEFAULT NULL,
    litros          DECIMAL(8,2)    NOT NULL DEFAULT 0.00,
    precio_litro    DECIMAL(8,2)    NOT NULL DEFAULT 0.00,
    costo_total     DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
    combustible     VARCHAR(30)     NULL DEFAULT 'Gasolina Magna',
    ticket_no       VARCHAR(20)     NULL DEFAULT NULL,
    fecha_inicio    DATETIME        NULL DEFAULT NULL,
    fecha_fin       DATETIME        NULL DEFAULT NULL,
    estado          VARCHAR(40)     NOT NULL DEFAULT 'Pendiente',
    qr_token        VARCHAR(36)     NULL DEFAULT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_viajes_qr (qr_token),
    INDEX idx_viajes_usuario  (usuario_id),
    INDEX idx_viajes_vehiculo (vehiculo_id),
    INDEX idx_viajes_estado   (estado),
    INDEX idx_viajes_fecha    (fecha_inicio),
    CONSTRAINT fk_viajes_usuario
        FOREIGN KEY (usuario_id)  REFERENCES usuarios  (id) ON DELETE RESTRICT,
    CONSTRAINT fk_viajes_vehiculo
        FOREIGN KEY (vehiculo_id) REFERENCES vehiculos (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------
--  5. solicitudes_finalizacion
--  El servidor la crea con CREATE TABLE IF NOT EXISTS al arrancar,
--  pero la incluimos en el esquema base para consistencia.
--  FIX: admin_id es FK nullable (aún no asignado cuando está pendiente).
-- -----------------------------------------------------------
CREATE TABLE solicitudes_finalizacion (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    viaje_id        INT UNSIGNED    NOT NULL,
    usuario_id      INT UNSIGNED    NOT NULL,
    km_final        INT UNSIGNED    NULL DEFAULT NULL,
    nivel_comb_fin  VARCHAR(20)     NULL DEFAULT NULL,
    observaciones   TEXT            NULL DEFAULT NULL,
    motivo          VARCHAR(255)    NULL DEFAULT NULL,
    estado          ENUM('pendiente','aprobada','rechazada')
                                    NOT NULL DEFAULT 'pendiente',
    comentario_admin TEXT           NULL DEFAULT NULL,
    admin_id        INT UNSIGNED    NULL DEFAULT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resuelta_at     DATETIME        NULL DEFAULT NULL,
    PRIMARY KEY (id),
    INDEX idx_solfin_estado (estado),
    INDEX idx_solfin_viaje  (viaje_id),
    CONSTRAINT fk_solfin_viaje
        FOREIGN KEY (viaje_id)    REFERENCES viajes    (id) ON DELETE CASCADE,
    CONSTRAINT fk_solfin_usuario
        FOREIGN KEY (usuario_id)  REFERENCES usuarios  (id) ON DELETE CASCADE,
    CONSTRAINT fk_solfin_admin
        FOREIGN KEY (admin_id)    REFERENCES usuarios  (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------
--  6. notificaciones
--  FIX: tipo VARCHAR(50) para soportar todos los valores que
--       usa el servidor: 'info', 'solicitud_finalizacion',
--       'comision_aprobada', 'comision_rechazada'.
--  FIX: leida TINYINT(1) con DEFAULT 0 (no BOOL, compatibilidad).
--  FIX: FK usuario_id con ON DELETE CASCADE (limpieza automática).
-- -----------------------------------------------------------
CREATE TABLE notificaciones (
    id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    usuario_id  INT UNSIGNED    NOT NULL,
    titulo      VARCHAR(150)    NOT NULL DEFAULT 'Notificación',
    cuerpo      TEXT            NOT NULL DEFAULT '',
    tipo        VARCHAR(50)     NOT NULL DEFAULT 'info',
    referencia_id INT UNSIGNED  NULL DEFAULT NULL,
    leida       TINYINT(1)      NOT NULL DEFAULT 0,
    created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_notif_usuario (usuario_id),
    INDEX idx_notif_leida   (leida),
    INDEX idx_notif_ref     (referencia_id),
    CONSTRAINT fk_notif_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------
--  7. bitacora
--  FIX: usuario_id es NULL-able (acciones de sistema sin sesión).
--  FIX: ip VARCHAR(45) para IPv6.
--  FIX: entidad_id INT NULL para registros sin entidad.
-- -----------------------------------------------------------
CREATE TABLE bitacora (
    id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    usuario_id  INT UNSIGNED    NULL DEFAULT NULL,
    accion      VARCHAR(200)    NOT NULL,
    modulo      VARCHAR(50)     NULL DEFAULT NULL,
    entidad_id  INT UNSIGNED    NULL DEFAULT NULL,
    ip          VARCHAR(45)     NULL DEFAULT NULL,
    created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_bitacora_usuario (usuario_id),
    INDEX idx_bitacora_modulo  (modulo),
    INDEX idx_bitacora_fecha   (created_at),
    CONSTRAINT fk_bitacora_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------
--  8. mantenimiento_observaciones
--  FIX: severidad como ENUM cerrado que el front ya maneja.
--  FIX: estado ENUM con los 3 valores usados en el servidor
--       ('pendiente','en_revision','resuelto').
--  FIX: costo DECIMAL(10,2) para valores monetarios.
-- -----------------------------------------------------------
CREATE TABLE mantenimiento_observaciones (
    id               INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    vehiculo_id      INT UNSIGNED    NOT NULL,
    usuario_id       INT UNSIGNED    NOT NULL,
    componente       VARCHAR(150)    NOT NULL,
    codigo_ref       VARCHAR(50)     NULL DEFAULT NULL,
    km_reporte       INT UNSIGNED    NULL DEFAULT NULL,
    severidad        ENUM('baja','media','alta','critica') NOT NULL DEFAULT 'media',
    descripcion      TEXT            NOT NULL,
    estado           ENUM('pendiente','en_revision','resuelto') NOT NULL DEFAULT 'pendiente',
    costo            DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
    resolucion       TEXT            NULL DEFAULT NULL,
    fecha_resolucion DATETIME        NULL DEFAULT NULL,
    created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_mant_vehiculo (vehiculo_id),
    INDEX idx_mant_estado   (estado),
    CONSTRAINT fk_mant_vehiculo
        FOREIGN KEY (vehiculo_id) REFERENCES vehiculos (id) ON DELETE CASCADE,
    CONSTRAINT fk_mant_usuario
        FOREIGN KEY (usuario_id)  REFERENCES usuarios  (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------
--  9. vales_combustible
--  FIX: la tabla es referenciada en dos lugares del servidor:
--    a) GET /api/resumen-mes → SUM(litros) WHERE vc.viaje_id = v.id
--    b) GET /api/dashboard   → COUNT(*) WHERE fecha_recarga >= inicio_mes
--  Por tanto REQUIERE: viaje_id FK, litros, fecha_recarga.
--  FIX: se agrega vehiculo_id y usuario_id para uso futuro.
-- -----------------------------------------------------------
CREATE TABLE vales_combustible (
    id           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    viaje_id     INT UNSIGNED    NULL DEFAULT NULL,
    vehiculo_id  INT UNSIGNED    NULL DEFAULT NULL,
    usuario_id   INT UNSIGNED    NULL DEFAULT NULL,
    litros       DECIMAL(8,2)    NOT NULL DEFAULT 0.00,
    precio_litro DECIMAL(8,2)    NOT NULL DEFAULT 0.00,
    costo        DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
    fecha_recarga DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ticket_no    VARCHAR(20)     NULL DEFAULT NULL,
    observaciones TEXT           NULL DEFAULT NULL,
    created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_vales_viaje   (viaje_id),
    INDEX idx_vales_fecha   (fecha_recarga),
    CONSTRAINT fk_vales_viaje
        FOREIGN KEY (viaje_id)   REFERENCES viajes    (id) ON DELETE SET NULL,
    CONSTRAINT fk_vales_vehiculo
        FOREIGN KEY (vehiculo_id) REFERENCES vehiculos (id) ON DELETE SET NULL,
    CONSTRAINT fk_vales_usuario
        FOREIGN KEY (usuario_id)  REFERENCES usuarios  (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------
-- 10. alertas
--  FIX: la tabla es consultada en el dashboard con:
--       WHERE estado = 'activa'
--  Se necesita al menos: id, estado, y una FK a vehiculos.
--  tipo puede ser: 'tenencia', 'verificacion', 'seguro', 'mantenimiento'
-- -----------------------------------------------------------
CREATE TABLE alertas (
    id               INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    vehiculo_id      INT UNSIGNED    NULL DEFAULT NULL,
    tipo             VARCHAR(50)     NOT NULL DEFAULT 'general',
    descripcion      TEXT            NULL DEFAULT NULL,
    estado           ENUM('activa','resuelta') NOT NULL DEFAULT 'activa',
    fecha_vencimiento DATE           NULL DEFAULT NULL,
    created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_alertas_estado   (estado),
    INDEX idx_alertas_vehiculo (vehiculo_id),
    CONSTRAINT fk_alertas_vehiculo
        FOREIGN KEY (vehiculo_id) REFERENCES vehiculos (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- =====================================================================
--  FIN DE SECCIÓN 1 — Opción A (recreación completa)
-- =====================================================================




-- =====================================================================
--  SECCIÓN 2: MIGRACIÓN (Opción B — modificar base existente)
--  Ejecutar esta sección EN LUGAR de la Sección 1 si ya tienes datos.
--  Es seguro ejecutar cada bloque por separado en Workbench.
-- =====================================================================

/*

-- 2.1  Asegura charset correcto en la base
ALTER DATABASE sigepav CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2.2  roles — agregar si falta
CREATE TABLE IF NOT EXISTS roles (
    id     TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
    nombre VARCHAR(40)      NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_roles_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO roles (id, nombre) VALUES (1, 'Administrador'), (2, 'Operativo');

-- 2.3  usuarios — corregir password_hash y activo
ALTER TABLE usuarios
    MODIFY COLUMN password_hash VARCHAR(72) NOT NULL,
    MODIFY COLUMN activo        TINYINT(1)  NOT NULL DEFAULT 1;
-- Agrega departamento/cargo si no existen:
ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS departamento VARCHAR(100) NULL DEFAULT NULL AFTER rol_id,
    ADD COLUMN IF NOT EXISTS cargo        VARCHAR(100) NULL DEFAULT NULL AFTER departamento,
    ADD COLUMN IF NOT EXISTS foto_perfil  VARCHAR(255) NULL DEFAULT NULL AFTER cargo,
    ADD COLUMN IF NOT EXISTS created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
        AFTER activo;

-- 2.4  vehiculos — corregir tipo ENUM y agregar columnas faltantes
ALTER TABLE vehiculos
    MODIFY COLUMN tipo ENUM('sedan','coupe','pickup','suv',
                             'hatchback','van','motocicleta','otro') NULL DEFAULT NULL,
    MODIFY COLUMN activo TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE vehiculos
    ADD COLUMN IF NOT EXISTS fecha_tenencia     DATE     NULL DEFAULT NULL AFTER km_actual,
    ADD COLUMN IF NOT EXISTS fecha_verificacion DATE     NULL DEFAULT NULL AFTER fecha_tenencia,
    ADD COLUMN IF NOT EXISTS fecha_seguro       DATE     NULL DEFAULT NULL AFTER fecha_verificacion,
    ADD COLUMN IF NOT EXISTS qr_token           VARCHAR(36) NULL DEFAULT NULL AFTER fecha_seguro;
-- Índice único en qr_token solo si no existe:
ALTER TABLE vehiculos ADD UNIQUE KEY IF NOT EXISTS uq_vehiculos_qr (qr_token);

-- 2.5  viajes — CRÍTICO: convertir estado a VARCHAR(40)
--  Si es ENUM, esto es OBLIGATORIO para que los estados funcionen.
ALTER TABLE viajes
    MODIFY COLUMN estado VARCHAR(40) NOT NULL DEFAULT 'Pendiente';

-- Columnas que el servidor escribe/lee y pueden faltar:
ALTER TABLE viajes
    ADD COLUMN IF NOT EXISTS nivel_comb_ini VARCHAR(20) NULL DEFAULT NULL
        AFTER km_final,
    ADD COLUMN IF NOT EXISTS nivel_comb_fin VARCHAR(20) NULL DEFAULT NULL
        AFTER nivel_comb_ini,
    ADD COLUMN IF NOT EXISTS responsable    VARCHAR(120) NULL DEFAULT NULL
        AFTER no_oficio,
    ADD COLUMN IF NOT EXISTS estado_dst     VARCHAR(50)  NULL DEFAULT NULL
        AFTER lugar_destino,
    ADD COLUMN IF NOT EXISTS municipio      VARCHAR(100) NULL DEFAULT NULL
        AFTER estado_dst,
    ADD COLUMN IF NOT EXISTS localidad      VARCHAR(100) NULL DEFAULT NULL
        AFTER municipio,
    ADD COLUMN IF NOT EXISTS descripcion    TEXT NULL DEFAULT NULL
        AFTER motivo,
    ADD COLUMN IF NOT EXISTS litros         DECIMAL(8,2)  NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS precio_litro   DECIMAL(8,2)  NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS costo_total    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS combustible    VARCHAR(30)   NULL DEFAULT 'Gasolina Magna',
    ADD COLUMN IF NOT EXISTS ticket_no      VARCHAR(20)   NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS qr_token       VARCHAR(36)   NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 2.6  solicitudes_finalizacion — crea si no existe
CREATE TABLE IF NOT EXISTS solicitudes_finalizacion (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    viaje_id        INT UNSIGNED    NOT NULL,
    usuario_id      INT UNSIGNED    NOT NULL,
    km_final        INT UNSIGNED    NULL DEFAULT NULL,
    nivel_comb_fin  VARCHAR(20)     NULL DEFAULT NULL,
    observaciones   TEXT            NULL DEFAULT NULL,
    motivo          VARCHAR(255)    NULL DEFAULT NULL,
    estado          ENUM('pendiente','aprobada','rechazada')
                                    NOT NULL DEFAULT 'pendiente',
    comentario_admin TEXT           NULL DEFAULT NULL,
    admin_id        INT UNSIGNED    NULL DEFAULT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resuelta_at     DATETIME        NULL DEFAULT NULL,
    PRIMARY KEY (id),
    INDEX idx_solfin_estado (estado),
    INDEX idx_solfin_viaje  (viaje_id),
    CONSTRAINT fk_solfin_viaje    FOREIGN KEY (viaje_id)   REFERENCES viajes   (id) ON DELETE CASCADE,
    CONSTRAINT fk_solfin_usuario  FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2.7  notificaciones — corregir tipo y leida
ALTER TABLE notificaciones
    MODIFY COLUMN tipo  VARCHAR(50)  NOT NULL DEFAULT 'info',
    MODIFY COLUMN leida TINYINT(1)   NOT NULL DEFAULT 0;
ALTER TABLE notificaciones
    ADD COLUMN IF NOT EXISTS created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE notificaciones
    ADD COLUMN IF NOT EXISTS referencia_id INT UNSIGNED NULL DEFAULT NULL AFTER tipo;

-- 2.8  bitacora — asegurar columnas
ALTER TABLE bitacora
    MODIFY COLUMN usuario_id INT UNSIGNED NULL DEFAULT NULL,
    MODIFY COLUMN ip         VARCHAR(45)  NULL DEFAULT NULL;
ALTER TABLE bitacora
    ADD COLUMN IF NOT EXISTS modulo     VARCHAR(50) NULL DEFAULT NULL AFTER accion,
    ADD COLUMN IF NOT EXISTS entidad_id INT UNSIGNED NULL DEFAULT NULL AFTER modulo;

-- 2.9  mantenimiento_observaciones — corregir ENUMs y tipos
ALTER TABLE mantenimiento_observaciones
    MODIFY COLUMN severidad ENUM('baja','media','alta','critica') NOT NULL DEFAULT 'media',
    MODIFY COLUMN estado    ENUM('pendiente','en_revision','resuelto') NOT NULL DEFAULT 'pendiente',
    MODIFY COLUMN costo     DECIMAL(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE mantenimiento_observaciones
    ADD COLUMN IF NOT EXISTS codigo_ref      VARCHAR(50)  NULL DEFAULT NULL AFTER componente,
    ADD COLUMN IF NOT EXISTS km_reporte      INT UNSIGNED NULL DEFAULT NULL AFTER codigo_ref,
    ADD COLUMN IF NOT EXISTS resolucion      TEXT        NULL DEFAULT NULL AFTER costo,
    ADD COLUMN IF NOT EXISTS fecha_resolucion DATETIME   NULL DEFAULT NULL AFTER resolucion,
    ADD COLUMN IF NOT EXISTS created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 2.10  vales_combustible — columnas requeridas por el servidor
ALTER TABLE vales_combustible
    ADD COLUMN IF NOT EXISTS viaje_id     INT UNSIGNED NULL DEFAULT NULL
        AFTER id,
    ADD COLUMN IF NOT EXISTS vehiculo_id  INT UNSIGNED NULL DEFAULT NULL
        AFTER viaje_id,
    ADD COLUMN IF NOT EXISTS usuario_id   INT UNSIGNED NULL DEFAULT NULL
        AFTER vehiculo_id,
    ADD COLUMN IF NOT EXISTS litros       DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS precio_litro DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS costo        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS fecha_recarga DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS ticket_no    VARCHAR(20)  NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS observaciones TEXT        NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 2.11  alertas — columna estado requerida por dashboard
ALTER TABLE alertas
    MODIFY COLUMN estado ENUM('activa','resuelta') NOT NULL DEFAULT 'activa';
ALTER TABLE alertas
    ADD COLUMN IF NOT EXISTS vehiculo_id      INT UNSIGNED NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS tipo             VARCHAR(50)  NOT NULL DEFAULT 'general',
    ADD COLUMN IF NOT EXISTS descripcion      TEXT         NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS fecha_vencimiento DATE        NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP;

*/


-- =====================================================================
--  SECCIÓN 3: MÓDULO CIUDADANO  (fusionado desde ciudadano_migration.sql)
--  Tablas para reportes/denuncias por QR e interesados en seguimiento.
--  Va al final porque depende de las tablas viajes y vehiculos.
-- =====================================================================

USE sigepav;

-- -----------------------------------------------------------
--  1. reportes_ciudadanos
--  Denuncias/reportes levantados por ciudadanos vía QR.
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS reportes_ciudadanos (
    id                  INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    viaje_id            INT UNSIGNED    NULL DEFAULT NULL,
    vehiculo_id         INT UNSIGNED    NULL DEFAULT NULL,
    nombre_ciudadano    VARCHAR(120)    NULL DEFAULT NULL,
    correo_ciudadano    VARCHAR(150)    NOT NULL,
    motivo              VARCHAR(100)    NOT NULL,
    descripcion         TEXT            NULL DEFAULT NULL,
    evidencia_url       VARCHAR(300)    NULL DEFAULT NULL,
    evidencia_origen    VARCHAR(30)     NULL DEFAULT NULL,
    evidencia_tomada_en DATETIME        NULL DEFAULT NULL,
    comentario_admin    TEXT            NULL DEFAULT NULL,
    resuelto_at         DATETIME        NULL DEFAULT NULL,
    estatus             ENUM('nuevo','en_revision','resuelto','descartado')
                                        NOT NULL DEFAULT 'nuevo',
    token_seguimiento   VARCHAR(36)     NOT NULL,
    notificado          TINYINT(1)      NOT NULL DEFAULT 0,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_reporte_token (token_seguimiento),
    INDEX idx_reporte_viaje     (viaje_id),
    INDEX idx_reporte_vehiculo  (vehiculo_id),
    INDEX idx_reporte_estatus   (estatus),
    CONSTRAINT fk_reporte_viaje
        FOREIGN KEY (viaje_id)    REFERENCES viajes    (id) ON DELETE SET NULL,
    CONSTRAINT fk_reporte_vehiculo
        FOREIGN KEY (vehiculo_id) REFERENCES vehiculos (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------
--  2. Agregar campos de evidencia/resolución si la tabla ya existía
-- -----------------------------------------------------------
ALTER TABLE reportes_ciudadanos
    ADD COLUMN IF NOT EXISTS evidencia_origen VARCHAR(30) NULL DEFAULT NULL
        AFTER evidencia_url,
    ADD COLUMN IF NOT EXISTS evidencia_tomada_en DATETIME NULL DEFAULT NULL
        AFTER evidencia_origen,
    ADD COLUMN IF NOT EXISTS comentario_admin TEXT NULL DEFAULT NULL
        AFTER evidencia_tomada_en,
    ADD COLUMN IF NOT EXISTS resuelto_at DATETIME NULL DEFAULT NULL
        AFTER comentario_admin;

-- -----------------------------------------------------------
--  3. Agregar qr_image_path a vehiculos si no existe
--  Guarda la ruta de la imagen PNG del QR generado.
-- -----------------------------------------------------------
ALTER TABLE vehiculos
    ADD COLUMN IF NOT EXISTS qr_image_path VARCHAR(300) NULL DEFAULT NULL
        AFTER qr_token;

--  4. Ciudadanos interesados en recibir liga al finalizar una comisión activa
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- =====================================================================
--  FIN DEL SCRIPT
-- =====================================================================
