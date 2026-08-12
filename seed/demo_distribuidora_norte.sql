-- =====================================================================
--  SEED DE DEMO — "Distribuidora Norte S.A. de C.V." 🚚
--  Flota de reparto realista para el PITCH AL SECTOR PRIVADO.
--  Datos ficticios. NO toca el seed JDM (placas distintas), así puedes
--  tener ambas flotas o cargar solo la que convenga para cada demo.
--  Todas las fechas son RELATIVAS a CURDATE(): el escenario se ve igual el día
--  que cargues el seed, sin recalibrar. (Antes estaban quemadas al 2026-06-14 y
--  después de esa fecha el tablero se veía todo rojo.)
--  Semáforo:  VERDE >=30 días · AMARILLO 15-29 · ROJO <15 o vencido
--  Cargar:  mysql -u root -p sigepav < seed/demo_distribuidora_norte.sql
-- =====================================================================
USE sigepav;

SET @adm = (SELECT id FROM usuarios WHERE rol_id = 1 ORDER BY id LIMIT 1);
SET @ope = (SELECT id FROM usuarios WHERE rol_id = 2 ORDER BY id LIMIT 1);

-- Limpieza idempotente de la flota de demo (por sus placas).
DELETE FROM vehiculos WHERE placas IN
  ('DN-2001','DN-2002','DN-2003','DN-2004','DN-2005','DN-2006','DN-2007','DN-2008');

-- -----------------------------------------------------------
--  Vehículos — camionetas de reparto / paquetería
-- -----------------------------------------------------------
INSERT INTO vehiculos
  (no_economico, marca, linea, modelo, tipo, capacidad, color, placas, combustible, km_actual,
   fecha_tenencia, fecha_verificacion, fecha_seguro, activo)
VALUES
  ('DN-001','Nissan','NP300 Estacas',2019,'pickup',3,'Blanco','DN-2001','Diesel',218400,
   DATE_ADD(CURDATE(), INTERVAL  65 DAY),   -- tenencia   VERDE
   DATE_ADD(CURDATE(), INTERVAL   4 DAY),   -- verif      ROJO
   DATE_ADD(CURDATE(), INTERVAL  55 DAY),   -- seguro     VERDE
   1),
  ('DN-002','Toyota','Hiace Panel',2020,'van',3,'Blanco','DN-2002','Diesel',196700,
   DATE_ADD(CURDATE(), INTERVAL  10 DAY),   -- tenencia   ROJO
   DATE_ADD(CURDATE(), INTERVAL  85 DAY),   -- verif      VERDE
   DATE_ADD(CURDATE(), INTERVAL 120 DAY),   -- seguro     VERDE
   1),
  ('DN-003','Ford','Transit 350',2018,'van',3,'Plata','DN-2003','Diesel',287900,
   DATE_ADD(CURDATE(), INTERVAL 100 DAY),   -- tenencia   VERDE
   DATE_ADD(CURDATE(), INTERVAL  20 DAY),   -- verif      AMARILLO
   DATE_ADD(CURDATE(), INTERVAL   7 DAY),   -- seguro     ROJO
   1),
  ('DN-004','Chevrolet','Tornado',2021,'pickup',2,'Rojo','DN-2004','Gasolina Magna',132500,
   DATE_ADD(CURDATE(), INTERVAL 135 DAY),   -- todo VERDE
   DATE_ADD(CURDATE(), INTERVAL 110 DAY),
   DATE_ADD(CURDATE(), INTERVAL 155 DAY),
   1),
  ('DN-005','Nissan','Urvan NV350',2017,'van',5,'Blanco','DN-2005','Diesel',312600,
   DATE_ADD(CURDATE(), INTERVAL  24 DAY),   -- tenencia   AMARILLO
   DATE_ADD(CURDATE(), INTERVAL  70 DAY),   -- verif      VERDE
   DATE_ADD(CURDATE(), INTERVAL  95 DAY),   -- seguro     VERDE
   1),
  ('DN-006','RAM','700 Work',2022,'pickup',2,'Blanco','DN-2006','Gasolina Magna',98300,
   DATE_ADD(CURDATE(), INTERVAL 130 DAY),   -- todo VERDE
   DATE_ADD(CURDATE(), INTERVAL 150 DAY),
   DATE_ADD(CURDATE(), INTERVAL 140 DAY),
   1),
  ('DN-007','Volkswagen','Saveiro Robust',2019,'pickup',2,'Gris','DN-2007','Gasolina Magna',176800,
   DATE_ADD(CURDATE(), INTERVAL  45 DAY),   -- tenencia   VERDE
   DATE_ADD(CURDATE(), INTERVAL  26 DAY),   -- verif      AMARILLO
   DATE_ADD(CURDATE(), INTERVAL   3 DAY),   -- seguro     ROJO
   1),
  ('DN-008','Mercedes-Benz','Sprinter 415',2016,'van',3,'Blanco','DN-2008','Diesel',389200,
   DATE_SUB(CURDATE(), INTERVAL  60 DAY),   -- tenencia   VENCIDA
   DATE_ADD(CURDATE(), INTERVAL  40 DAY),   -- verif      VERDE
   DATE_ADD(CURDATE(), INTERVAL  66 DAY),   -- seguro     VERDE
   1);

SET @np3 = (SELECT id FROM vehiculos WHERE placas='DN-2001');
SET @hia = (SELECT id FROM vehiculos WHERE placas='DN-2002');
SET @trn = (SELECT id FROM vehiculos WHERE placas='DN-2003');
SET @tor = (SELECT id FROM vehiculos WHERE placas='DN-2004');
SET @urv = (SELECT id FROM vehiculos WHERE placas='DN-2005');
SET @ram = (SELECT id FROM vehiculos WHERE placas='DN-2006');
SET @sav = (SELECT id FROM vehiculos WHERE placas='DN-2007');
SET @spr = (SELECT id FROM vehiculos WHERE placas='DN-2008');

-- -----------------------------------------------------------
--  Viajes / rutas de reparto finalizadas (km + combustible)
-- -----------------------------------------------------------
INSERT INTO viajes
  (usuario_id, vehiculo_id, no_vale, lugar_destino, motivo, km_inicial, km_final,
   litros, precio_litro, costo_total, combustible, fecha_inicio, fecha_fin, estado, observaciones)
VALUES
-- Fechas relativas ("hace N días"), repartidas sobre el último mes y medio para
-- que el dashboard y el resumen del mes siempre tengan actividad reciente.
  (@ope,@np3,'R-2001','Fresnillo','Reparto ruta norte',217600,218100, 62.00,24.10,1494.20,'Diesel',
   TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 33 DAY),'06:00:00'), TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 33 DAY),'17:00:00'),'Finalizado','Cargada no frena bien, el pedal se va hasta el fondo bajando la cuesta'),
  (@ope,@np3,'R-2002','Río Grande','Reparto ruta norte',218100,218400, 40.00,24.10, 964.00,'Diesel',
   TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 12 DAY),'06:00:00'), TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 12 DAY),'15:00:00'),'Finalizado',NULL),
  (@ope,@hia,'R-2003','Zacatecas Centro','Paquetería local',196200,196500, 26.00,24.10, 626.60,'Diesel',
   TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 15 DAY),'07:00:00'), TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 15 DAY),'14:00:00'),'Finalizado','Echa humo negro al arrancar en frío y se siente que gasta de más'),
  (@ope,@hia,'R-2004','Guadalupe','Paquetería local',196500,196700, 18.00,24.10, 433.80,'Diesel',
   TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL  8 DAY),'07:30:00'), TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL  8 DAY),'12:00:00'),'Finalizado',NULL),
  (@ope,@trn,'R-2005','Torreón','Ruta foránea Coahuila',287000,287900, 110.00,24.10,2651.00,'Diesel',
   TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 29 DAY),'05:00:00'), TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 28 DAY),'20:00:00'),'Finalizado','El aire acondicionado no enfría, viaje largo muy pesado'),
  (@ope,@tor,'R-2006','Jerez','Reparto ligero',132100,132500, 28.00,23.90, 669.20,'Gasolina Magna',
   TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 10 DAY),'08:00:00'), TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 10 DAY),'14:00:00'),'Finalizado',NULL),
  (@ope,@urv,'R-2007','Durango','Ruta foránea',311800,312600, 95.00,24.10,2289.50,'Diesel',
   TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 23 DAY),'05:30:00'), TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 22 DAY),'19:00:00'),'Finalizado','Ruido feo en la transmisión al meter reversa con carga, hay que revisar'),
  (@ope,@ram,'R-2008','Calera','Reparto ligero',98000,98300, 19.00,23.90, 454.10,'Gasolina Magna',
   TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL  7 DAY),'08:00:00'), TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL  7 DAY),'13:00:00'),'Finalizado',NULL),
  (@ope,@sav,'R-2009','Aguascalientes','Ruta foránea',176200,176800, 52.00,23.90,1242.80,'Gasolina Magna',
   TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 16 DAY),'06:00:00'), TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 16 DAY),'18:00:00'),'Finalizado','Vibra mucho el volante cargada pasando de 80 y jala a la derecha'),
  (@ope,@spr,'R-2010','Saltillo','Ruta foránea Coahuila',388300,389200, 125.00,24.10,3012.50,'Diesel',
   TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 36 DAY),'04:00:00'), TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 35 DAY),'21:00:00'),'Finalizado','Marca falla del motor en el tablero y pierde fuerza en las subidas');

-- -----------------------------------------------------------
--  Vales de combustible (gasto adicional por unidad)
-- -----------------------------------------------------------
INSERT INTO vales_combustible (vehiculo_id, usuario_id, litros, precio_litro, costo, fecha_recarga, ticket_no)
VALUES
  (@np3,@ope, 60.00,24.10,1446.00, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 11 DAY),'11:00:00'),'TN-7001'),
  (@trn,@ope, 90.00,24.10,2169.00, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 14 DAY),'10:00:00'),'TN-7002'),
  (@trn,@ope, 85.00,24.10,2048.50, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL  6 DAY),'09:00:00'),'TN-7003'),
  (@urv,@ope, 80.00,24.10,1928.00, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 13 DAY),'12:00:00'),'TN-7004'),
  (@spr,@ope, 100.00,24.10,2410.00, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 10 DAY),'13:00:00'),'TN-7005'),
  (@spr,@ope, 95.00,24.10,2289.50, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL  5 DAY),'08:30:00'),'TN-7006'),
  (@hia,@ope, 45.00,24.10,1084.50, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL  8 DAY),'08:30:00'),'TN-7007');

-- -----------------------------------------------------------
--  Observaciones de mantenimiento (costos por unidad)
-- -----------------------------------------------------------
INSERT INTO mantenimiento_observaciones
  (vehiculo_id, usuario_id, componente, severidad, descripcion, estado, costo)
VALUES
  (@np3,@adm,'Sistema de frenos','alta','Balatas y discos delanteros gastados, baja eficiencia con carga','pendiente',6800.00),
  (@hia,@adm,'Sistema de inyección','media','Humo negro, posible inyector sucio o filtro saturado','en_revision',3400.00),
  (@trn,@adm,'Aire acondicionado','baja','Compresor de A/C no enfría','pendiente',4200.00),
  (@urv,@adm,'Transmisión','alta','Ruido en reversa bajo carga, revisar caja','en_revision',12500.00),
  (@sav,@adm,'Suspensión / alineación','media','Vibración y jalo a la derecha, requiere alineación y balanceo','pendiente',2800.00),
  (@spr,@adm,'Motor (turbo/EGR)','critica','Testigo de falla de motor, pérdida de potencia, diagnóstico mayor','pendiente',24500.00),
  (@spr,@adm,'Servicio mayor','media','Servicio de 380,000 km pendiente','pendiente',8900.00),
  (@tor,@adm,'Servicio menor','baja','Cambio de aceite y filtros realizado','resuelto',1600.00),
  (@ram,@adm,'Servicio menor','baja','Afinación preventiva','resuelto',1400.00);

-- -----------------------------------------------------------
--  Mantenimiento preventivo programado
-- -----------------------------------------------------------
INSERT INTO mantenimiento_programado
  (vehiculo_id, componente, intervalo_km, intervalo_meses, ultimo_km, ultima_fecha)
VALUES
-- ultima_fecha se despeja hacia atrás desde el día en que queremos que caiga el
-- próximo servicio: (día objetivo) − intervalo. Así el escenario no caduca.
  -- próximo en 36 días → VERDE
  (@np3,'Cambio de aceite y filtro',10000,6,210000,
        DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 36 DAY), INTERVAL 6 MONTH)),
  -- solo por kilometraje (intervalo_meses NULL): la fecha no define su semáforo
  (@np3,'Revisión de frenos',20000,NULL,200000,
        DATE_SUB(CURDATE(), INTERVAL 340 DAY)),
  -- próximo en 62 días → VERDE
  (@hia,'Cambio de aceite y filtro',10000,6,190000,
        DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 62 DAY), INTERVAL 6 MONTH)),
  -- próximo en 26 días → AMARILLO
  (@trn,'Cambio de aceite y filtro',10000,6,280000,
        DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 26 DAY), INTERVAL 6 MONTH)),
  -- próximo en 109 días → VERDE
  (@tor,'Cambio de aceite y filtro',8000,6,128000,
        DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 109 DAY), INTERVAL 6 MONTH)),
  -- próximo en 1 día → ROJO
  (@urv,'Cambio de aceite y filtro',10000,6,305000,
        DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 1 DAY), INTERVAL 6 MONTH)),
  -- próximo en 98 días → VERDE
  (@ram,'Cambio de aceite y filtro',8000,6,94000,
        DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 98 DAY), INTERVAL 6 MONTH)),
  -- próximo en 75 días → VERDE
  (@sav,'Cambio de aceite y filtro',8000,6,170000,
        DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 75 DAY), INTERVAL 6 MONTH)),
  -- próximo hace 15 días → VENCIDO (ROJO)
  (@spr,'Cambio de aceite y filtro',12000,6,378000,
        DATE_SUB(DATE_SUB(CURDATE(), INTERVAL 15 DAY), INTERVAL 6 MONTH)),
  -- servicio mayor cada 24 meses, vencido hace 13 días → ROJO
  (@spr,'Servicio mayor',60000,24,330000,
        DATE_SUB(DATE_SUB(CURDATE(), INTERVAL 13 DAY), INTERVAL 24 MONTH));

SELECT CONCAT('Distribuidora Norte cargada: ', COUNT(*), ' camionetas') AS resultado
FROM vehiculos WHERE placas IN
  ('DN-2001','DN-2002','DN-2003','DN-2004','DN-2005','DN-2006','DN-2007','DN-2008');
