-- Reparación opcional para vehículos que hayan quedado con No. Eco temporal
-- por un doble envío o por una versión anterior del alta de vehículos.
-- Server.js ya intenta hacer esto automáticamente al arrancar.

UPDATE vehiculos v
LEFT JOIN vehiculos x
  ON x.no_economico = IF(CHAR_LENGTH(CAST(v.id AS CHAR)) < 3, LPAD(v.id, 3, '0'), CAST(v.id AS CHAR))
 AND x.id <> v.id
SET v.no_economico = IF(CHAR_LENGTH(CAST(v.id AS CHAR)) < 3, LPAD(v.id, 3, '0'), CAST(v.id AS CHAR))
WHERE (v.no_economico = '000' OR v.no_economico LIKE 'T%')
  AND x.id IS NULL;
