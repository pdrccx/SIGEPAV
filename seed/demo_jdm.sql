-- =====================================================================
--  SEED DE PRUEBA — Flotilla JDM 🏎️  (datos ficticios para demo/dev)
--  Hoy de referencia: 2026-06-13
--  Fechas de vencimiento calibradas para ver el semáforo:
--    VERDE   >= 30 días  (>= 2026-07-13)
--    AMARILLO 15-30 días (2026-06-28 .. 2026-07-12)
--    ROJO     < 15 días o vencido (<= 2026-06-27)
--  NO toca el seed institucional. Cargar con:
--    mysql -u root -p sigepav < seed/demo_jdm.sql
-- =====================================================================
USE sigepav;
SET NAMES utf8mb4;   -- evita mojibake en acentos al cargar el seed

SET @adm = (SELECT id FROM usuarios WHERE rol_id = 1 ORDER BY id LIMIT 1);
SET @ope = (SELECT id FROM usuarios WHERE rol_id = 2 ORDER BY id LIMIT 1);

-- Limpieza idempotente de la flotilla de demo (por placas JDM)
DELETE FROM vehiculos WHERE placas IN
  ('GTR-34X','SUP-93A','RX7-13B','NSX-92C','EVO-9MR','STI-22S','S15-99K','AE86-86');

-- -----------------------------------------------------------
--  Vehículos JDM
-- -----------------------------------------------------------
INSERT INTO vehiculos
  (no_economico, marca, linea, modelo, tipo, capacidad, color, placas, combustible, km_actual,
   fecha_tenencia, fecha_verificacion, fecha_seguro, activo)
VALUES
  ('GTR-001','Nissan','Skyline GT-R R34',1999,'coupe',4,'Bayside Blue','GTR-34X','Gasolina Premium',182450,
   '2026-09-10','2026-07-02','2026-06-19',1),          -- tenencia VERDE, verif AMARILLO, seguro ROJO
  ('SUP-002','Toyota','Supra MK4 RZ',1998,'coupe',2,'Naranja','SUP-93A','Gasolina Premium',154300,
   '2026-10-01','2026-08-15','2026-09-20',1),          -- todo VERDE
  ('RX7-003','Mazda','RX-7 FD3S',1995,'coupe',2,'Rojo','RX7-13B','Gasolina Premium',201780,
   '2026-06-20','2026-05-28','2026-08-01',1),          -- tenencia ROJO, verif VENCIDA (ROJO)
  ('NSX-004','Honda','NSX NA1',1992,'coupe',2,'Rojo','NSX-92C','Gasolina Premium',98120,
   '2026-11-05','2026-12-01','2026-07-05',1),          -- seguro AMARILLO, resto VERDE
  ('EVO-005','Mitsubishi','Lancer Evolution IX',2006,'sedan',5,'Blanco','EVO-9MR','Gasolina Premium',176540,
   '2026-05-01','2026-07-30','2026-10-10',1),          -- tenencia VENCIDA (ROJO)
  ('STI-006','Subaru','Impreza WRX STI',2005,'sedan',5,'Azul WR','STI-22S','Gasolina Premium',165900,
   '2026-12-12','2026-11-11','2026-12-30',1),          -- todo VERDE
  ('S15-007','Nissan','Silvia S15 Spec-R',1999,'coupe',4,'Negro','S15-99K','Gasolina Magna',143670,
   '2026-08-20','2026-07-08','2026-09-01',1),          -- verif AMARILLO
  ('AE86-008','Toyota','Corolla AE86 Trueno',1985,'coupe',4,'Blanco/Negro','AE86-86','Gasolina Magna',221050,
   '2026-09-30','2026-10-15','2026-06-25',1);          -- seguro ROJO

-- IDs de los vehículos recién creados
SET @gtr = (SELECT id FROM vehiculos WHERE placas='GTR-34X');
SET @sup = (SELECT id FROM vehiculos WHERE placas='SUP-93A');
SET @rx7 = (SELECT id FROM vehiculos WHERE placas='RX7-13B');
SET @nsx = (SELECT id FROM vehiculos WHERE placas='NSX-92C');
SET @evo = (SELECT id FROM vehiculos WHERE placas='EVO-9MR');
SET @sti = (SELECT id FROM vehiculos WHERE placas='STI-22S');
SET @s15 = (SELECT id FROM vehiculos WHERE placas='S15-99K');
SET @ae8 = (SELECT id FROM vehiculos WHERE placas='AE86-86');

-- -----------------------------------------------------------
--  Viajes finalizados (alimentan km recorridos + costo combustible)
--  costo_total = litros * precio_litro
-- -----------------------------------------------------------
INSERT INTO viajes
  (usuario_id, vehiculo_id, no_vale, lugar_destino, motivo, km_inicial, km_final,
   litros, precio_litro, costo_total, combustible, fecha_inicio, fecha_fin, estado)
VALUES
  -- Skyline GT-R: muchos km, traga premium → costo/km alto
  (@ope,@gtr,'V-1001','Zacatecas','Traslado administrativo',181000,181620, 70.00,25.80,1806.00,'Gasolina Premium','2026-04-05 08:00','2026-04-05 18:00','Finalizado'),
  (@ope,@gtr,'V-1002','Fresnillo','Comisión técnica',181620,182450, 92.00,25.80,2373.60,'Gasolina Premium','2026-05-12 07:30','2026-05-12 20:00','Finalizado'),
  -- Supra: eficiente para lo deportivo
  (@ope,@sup,'V-1003','Guadalupe','Entrega de documentos',153800,154100, 28.00,25.50,714.00,'Gasolina Premium','2026-05-20 09:00','2026-05-20 14:00','Finalizado'),
  (@ope,@sup,'V-1004','Jerez','Supervisión',154100,154300, 19.00,25.50,484.50,'Gasolina Premium','2026-06-02 10:00','2026-06-02 15:00','Finalizado'),
  -- RX-7 rotativo: traga gasolina → costo/km muy alto
  (@ope,@rx7,'V-1005','Sombrerete','Comisión larga',200900,201400, 58.00,25.80,1496.40,'Gasolina Premium','2026-04-18 06:00','2026-04-18 22:00','Finalizado'),
  (@ope,@rx7,'V-1006','Río Grande','Traslado',201400,201780, 49.00,25.80,1264.20,'Gasolina Premium','2026-05-28 07:00','2026-05-28 19:00','Finalizado'),
  -- NSX: eficiente → costo/km bajo
  (@ope,@nsx,'V-1007','Zacatecas','Reunión',97800,98120, 21.00,25.80,541.80,'Gasolina Premium','2026-06-01 08:30','2026-06-01 13:00','Finalizado'),
  -- EVO
  (@ope,@evo,'V-1008','Calera','Inspección',176100,176540, 38.00,25.80,980.40,'Gasolina Premium','2026-05-15 08:00','2026-05-15 17:00','Finalizado'),
  -- STI
  (@ope,@sti,'V-1009','Loreto','Comisión',165500,165900, 34.00,25.80,877.20,'Gasolina Premium','2026-05-22 07:00','2026-05-22 16:00','Finalizado'),
  -- Silvia: magna, económica
  (@ope,@s15,'V-1010','Vetagrande','Traslado',143400,143670, 17.00,23.90,406.30,'Gasolina Magna','2026-06-04 09:00','2026-06-04 13:30','Finalizado'),
  -- AE86: ligero y muy eficiente → costo/km más bajo
  (@ope,@ae8,'V-1011','Guadalupe','Mensajería',220700,221050, 18.00,23.90,430.20,'Gasolina Magna','2026-06-08 08:00','2026-06-08 12:00','Finalizado');

-- -----------------------------------------------------------
--  Vales de combustible (refuerzan el gasto por unidad)
-- -----------------------------------------------------------
INSERT INTO vales_combustible (vehiculo_id, usuario_id, litros, precio_litro, costo, fecha_recarga, ticket_no)
VALUES
  (@gtr,@ope, 65.00,25.80,1677.00,'2026-06-01 11:00','T-5001'),
  (@gtr,@ope, 60.00,25.80,1548.00,'2026-06-10 16:00','T-5002'),
  (@rx7,@ope, 55.00,25.80,1419.00,'2026-06-03 12:00','T-5003'),
  (@rx7,@ope, 52.00,25.80,1341.60,'2026-06-11 09:00','T-5004'),
  (@evo,@ope, 45.00,25.80,1161.00,'2026-06-05 10:00','T-5005'),
  (@nsx,@ope, 25.00,25.80, 645.00,'2026-06-07 13:00','T-5006'),
  (@ae8,@ope, 20.00,23.90, 478.00,'2026-06-09 08:30','T-5007');

-- -----------------------------------------------------------
--  Observaciones de mantenimiento (alimentan costo mantenimiento)
--  severidad: baja|media|alta|critica   estado: pendiente|en_revision|resuelto
-- -----------------------------------------------------------
INSERT INTO mantenimiento_observaciones
  (vehiculo_id, usuario_id, componente, severidad, descripcion, estado, costo)
VALUES
  (@gtr,@adm,'Turbo / línea de presión','alta','Fuga de aceite en el turbo, requiere reemplazo de sellos','en_revision',8500.00),
  (@gtr,@adm,'Frenos Brembo','media','Balatas delanteras al 20%','pendiente',3200.00),
  (@rx7,@adm,'Motor rotativo (apex seals)','critica','Pérdida de compresión, posible rebuild','pendiente',18500.00),
  (@rx7,@adm,'Sistema de enfriamiento','alta','Sobrecalentamiento en trayectos largos','en_revision',2600.00),
  (@evo,@adm,'Clutch','media','Embrague patina en altas revoluciones','pendiente',6400.00),
  (@nsx,@adm,'Servicio menor','baja','Cambio de aceite y filtros','resuelto',1800.00),
  (@s15,@adm,'Suspensión','media','Amortiguadores traseros gastados','pendiente',4100.00),
  (@ae8,@adm,'Afinación','baja','Afinación mayor programada','resuelto',1500.00);

-- -----------------------------------------------------------
--  Mantenimiento preventivo programado (Módulo A)
--  Define cada cuánto toca servicio por componente
-- -----------------------------------------------------------
INSERT INTO mantenimiento_programado
  (vehiculo_id, componente, intervalo_km, intervalo_meses, ultimo_km, ultima_fecha)
VALUES
  (@gtr,'Cambio de aceite y filtro',5000,6,178000,'2025-12-10'),
  (@gtr,'Cambio de balatas',20000,NULL,170000,'2025-08-01'),
  (@sup,'Cambio de aceite y filtro',5000,6,152000,'2026-01-15'),
  (@rx7,'Cambio de aceite (rotativo)',4000,4,199000,'2026-02-20'),
  (@nsx,'Cambio de aceite y filtro',5000,6,96000,'2026-03-01'),
  (@evo,'Cambio de aceite y filtro',5000,6,174000,'2026-01-05'),
  (@sti,'Cambio de aceite y filtro',5000,6,163000,'2026-02-10'),
  (@s15,'Cambio de aceite y filtro',5000,6,141000,'2026-03-12'),
  (@ae8,'Afinación mayor',NULL,12,218000,'2025-07-01');

-- -----------------------------------------------------------
--  Notas del comisionado (lenguaje informal) — alimentan la IA
--  predictiva del Módulo D: el motor local detecta keywords de falla
--  y Gemini interpreta el lenguaje natural ("no metió la cuarta" =
--  posible falla de transmisión/clutch).
-- -----------------------------------------------------------
UPDATE viajes SET observaciones = 'Chillido fuerte en los frenos al bajar la sierra de Fresnillo, se escucha cada vez peor' WHERE no_vale = 'V-1001';
UPDATE viajes SET observaciones = 'Huele a quemado cuando se calienta el motor, hay que revisarlo' WHERE no_vale = 'V-1002';
UPDATE viajes SET observaciones = 'Pasando Sombrerete no metió bien la cuarta, se quedó jalando en tercera un buen rato' WHERE no_vale = 'V-1005';
UPDATE viajes SET observaciones = 'Marcó temperatura alta en las subidas, tuve que parar dos veces a que enfriara' WHERE no_vale = 'V-1006';
UPDATE viajes SET observaciones = 'El clutch se siente muy flojo, patina cuando acelero de subida' WHERE no_vale = 'V-1008';
UPDATE viajes SET observaciones = 'Vibra el volante pasando de los 100, como que va desbalanceado' WHERE no_vale = 'V-1010';
UPDATE viajes SET observaciones = 'Sin novedad, la unidad respondió bien todo el trayecto' WHERE no_vale = 'V-1011';

SELECT CONCAT('Flotilla JDM cargada: ', COUNT(*), ' vehículos') AS resultado
FROM vehiculos WHERE placas IN
  ('GTR-34X','SUP-93A','RX7-13B','NSX-92C','EVO-9MR','STI-22S','S15-99K','AE86-86');
