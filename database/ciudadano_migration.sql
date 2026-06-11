-- =====================================================================
--  SIGEPAV — Migración módulo Ciudadano
--  Ejecutar sobre la base existente (no borra nada)
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

-- -----------------------------------------------------------
--  4. Asegurar que qr_token esté en viajes (ya existe, solo verificar)
-- -----------------------------------------------------------
-- ALTER TABLE viajes ADD COLUMN IF NOT EXISTS qr_token VARCHAR(36) NULL DEFAULT NULL;
-- Ya existe según el esquema base.

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
