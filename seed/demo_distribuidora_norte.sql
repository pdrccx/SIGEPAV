-- =====================================================================
--  SEED DE DEMO — "Distribuidora Norte S.A. de C.V." 🚚
--  Flota de reparto realista para el PITCH AL SECTOR PRIVADO.
--  Datos ficticios. NO toca el seed JDM (placas distintas), así puedes
--  tener ambas flotas o cargar solo la que convenga para cada demo.
--  Hoy de referencia: 2026-06-14
--  Semáforo:  VERDE >=30 días (>=2026-07-14) · AMARILLO 15-29 ·
--             ROJO <15 o vencido (<=2026-06-28)
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
   '2026-09-15','2026-06-26','2026-08-10',1),         -- verificación ROJO
  ('DN-002','Toyota','Hiace Panel',2020,'van',3,'Blanco','DN-2002','Diesel',196700,
   '2026-06-22','2026-10-01','2026-11-05',1),          -- tenencia ROJO
  ('DN-003','Ford','Transit 350',2018,'van',3,'Plata','DN-2003','Diesel',287900,
   '2026-10-20','2026-07-05','2026-06-20',1),          -- verif AMARILLO, seguro ROJO
  ('DN-004','Chevrolet','Tornado',2021,'pickup',2,'Rojo','DN-2004','Gasolina Magna',132500,
   '2026-12-01','2026-11-15','2026-12-20',1),          -- todo VERDE
  ('DN-005','Nissan','Urvan NV350',2017,'van',5,'Blanco','DN-2005','Diesel',312600,
   '2026-07-08','2026-09-12','2026-10-01',1),          -- tenencia AMARILLO
  ('DN-006','RAM','700 Work',2022,'pickup',2,'Blanco','DN-2006','Gasolina Magna',98300,
   '2026-11-30','2026-12-18','2026-12-05',1),          -- todo VERDE
  ('DN-007','Volkswagen','Saveiro Robust',2019,'pickup',2,'Gris','DN-2007','Gasolina Magna',176800,
   '2026-08-25','2026-07-10','2026-06-27',1),          -- seguro ROJO, verif AMARILLO
  ('DN-008','Mercedes-Benz','Sprinter 415',2016,'van',3,'Blanco','DN-2008','Diesel',389200,
   '2026-05-10','2026-08-20','2026-09-15',1);          -- tenencia VENCIDA (ROJO)

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
  (@ope,@np3,'R-2001','Fresnillo','Reparto ruta norte',217600,218100, 62.00,24.10,1494.20,'Diesel','2026-05-18 06:00','2026-05-18 17:00','Finalizado','Cargada no frena bien, el pedal se va hasta el fondo bajando la cuesta'),
  (@ope,@np3,'R-2002','Río Grande','Reparto ruta norte',218100,218400, 40.00,24.10, 964.00,'Diesel','2026-06-05 06:00','2026-06-05 15:00','Finalizado',NULL),
  (@ope,@hia,'R-2003','Zacatecas Centro','Paquetería local',196200,196500, 26.00,24.10, 626.60,'Diesel','2026-06-02 07:00','2026-06-02 14:00','Finalizado','Echa humo negro al arrancar en frío y se siente que gasta de más'),
  (@ope,@hia,'R-2004','Guadalupe','Paquetería local',196500,196700, 18.00,24.10, 433.80,'Diesel','2026-06-09 07:30','2026-06-09 12:00','Finalizado',NULL),
  (@ope,@trn,'R-2005','Torreón','Ruta foránea Coahuila',287000,287900, 110.00,24.10,2651.00,'Diesel','2026-05-22 05:00','2026-05-23 20:00','Finalizado','El aire acondicionado no enfría, viaje largo muy pesado'),
  (@ope,@tor,'R-2006','Jerez','Reparto ligero',132100,132500, 28.00,23.90, 669.20,'Gasolina Magna','2026-06-07 08:00','2026-06-07 14:00','Finalizado',NULL),
  (@ope,@urv,'R-2007','Durango','Ruta foránea',311800,312600, 95.00,24.10,2289.50,'Diesel','2026-05-28 05:30','2026-05-29 19:00','Finalizado','Ruido feo en la transmisión al meter reversa con carga, hay que revisar'),
  (@ope,@ram,'R-2008','Calera','Reparto ligero',98000,98300, 19.00,23.90, 454.10,'Gasolina Magna','2026-06-10 08:00','2026-06-10 13:00','Finalizado',NULL),
  (@ope,@sav,'R-2009','Aguascalientes','Ruta foránea',176200,176800, 52.00,23.90,1242.80,'Gasolina Magna','2026-06-01 06:00','2026-06-01 18:00','Finalizado','Vibra mucho el volante cargada pasando de 80 y jala a la derecha'),
  (@ope,@spr,'R-2010','Saltillo','Ruta foránea Coahuila',388300,389200, 125.00,24.10,3012.50,'Diesel','2026-05-15 04:00','2026-05-16 21:00','Finalizado','Marca falla del motor en el tablero y pierde fuerza en las subidas');

-- -----------------------------------------------------------
--  Vales de combustible (gasto adicional por unidad)
-- -----------------------------------------------------------
INSERT INTO vales_combustible (vehiculo_id, usuario_id, litros, precio_litro, costo, fecha_recarga, ticket_no)
VALUES
  (@np3,@ope, 60.00,24.10,1446.00,'2026-06-06 11:00','TN-7001'),
  (@trn,@ope, 90.00,24.10,2169.00,'2026-06-03 10:00','TN-7002'),
  (@trn,@ope, 85.00,24.10,2048.50,'2026-06-11 09:00','TN-7003'),
  (@urv,@ope, 80.00,24.10,1928.00,'2026-06-04 12:00','TN-7004'),
  (@spr,@ope, 100.00,24.10,2410.00,'2026-06-07 13:00','TN-7005'),
  (@spr,@ope, 95.00,24.10,2289.50,'2026-06-12 08:30','TN-7006'),
  (@hia,@ope, 45.00,24.10,1084.50,'2026-06-09 08:30','TN-7007');

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
  (@np3,'Cambio de aceite y filtro',10000,6,210000,'2026-01-20'),
  (@np3,'Revisión de frenos',20000,NULL,200000,'2025-09-10'),
  (@hia,'Cambio de aceite y filtro',10000,6,190000,'2026-02-15'),
  (@trn,'Cambio de aceite y filtro',10000,6,280000,'2026-01-10'),
  (@tor,'Cambio de aceite y filtro',8000,6,128000,'2026-04-01'),
  (@urv,'Cambio de aceite y filtro',10000,6,305000,'2025-12-15'),
  (@ram,'Cambio de aceite y filtro',8000,6,94000,'2026-03-20'),
  (@sav,'Cambio de aceite y filtro',8000,6,170000,'2026-02-28'),
  (@spr,'Cambio de aceite y filtro',12000,6,378000,'2025-11-30'),
  (@spr,'Servicio mayor',60000,24,330000,'2024-06-01');

SELECT CONCAT('Distribuidora Norte cargada: ', COUNT(*), ' camionetas') AS resultado
FROM vehiculos WHERE placas IN
  ('DN-2001','DN-2002','DN-2003','DN-2004','DN-2005','DN-2006','DN-2007','DN-2008');
