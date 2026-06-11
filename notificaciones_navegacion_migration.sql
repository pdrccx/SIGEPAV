-- SIGEPAV · Migración para navegación desde notificaciones
-- Permite guardar el ID del registro que originó cada notificación.
-- Server.js también intenta crear esta columna automáticamente al arrancar.

ALTER TABLE notificaciones
    ADD COLUMN IF NOT EXISTS referencia_id INT UNSIGNED NULL DEFAULT NULL AFTER tipo;
