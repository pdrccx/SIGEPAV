-- =====================================================================
--  SEED DE PRUEBA — Flotilla JDM 🏎️  (datos ficticios para demo/dev)
--  Todas las fechas son RELATIVAS a CURDATE(), así que el semáforo se ve igual
--  el día que cargues el seed, sin recalibrar nada. (Antes estaban quemadas y
--  calibradas al 2026-06-13; después de esa fecha el tablero salía todo rojo.)
--    VERDE   >= 30 días
--    AMARILLO 15-29 días
--    ROJO     < 15 días o vencido
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
   DATE_ADD(CURDATE(), INTERVAL  60 DAY),   -- tenencia   VERDE
   DATE_ADD(CURDATE(), INTERVAL  22 DAY),   -- verif      AMARILLO
   DATE_ADD(CURDATE(), INTERVAL   6 DAY),   -- seguro     ROJO (por vencer)
   1),
  ('SUP-002','Toyota','Supra MK4 RZ',1998,'coupe',2,'Naranja','SUP-93A','Gasolina Premium',154300,
   DATE_ADD(CURDATE(), INTERVAL  75 DAY),   -- todo VERDE
   DATE_ADD(CURDATE(), INTERVAL  50 DAY),
   DATE_ADD(CURDATE(), INTERVAL  95 DAY),
   1),
  ('RX7-003','Mazda','RX-7 FD3S',1995,'coupe',2,'Rojo','RX7-13B','Gasolina Premium',201780,
   DATE_ADD(CURDATE(), INTERVAL   9 DAY),   -- tenencia   ROJO (por vencer)
   DATE_SUB(CURDATE(), INTERVAL  25 DAY),   -- verif      VENCIDA
   DATE_ADD(CURDATE(), INTERVAL  48 DAY),   -- seguro     VERDE
   1),
  ('NSX-004','Honda','NSX NA1',1992,'coupe',2,'Rojo','NSX-92C','Gasolina Premium',98120,
   DATE_ADD(CURDATE(), INTERVAL  70 DAY),   -- tenencia   VERDE
   DATE_ADD(CURDATE(), INTERVAL 100 DAY),   -- verif      VERDE
   DATE_ADD(CURDATE(), INTERVAL  18 DAY),   -- seguro     AMARILLO
   1),
  ('EVO-005','Mitsubishi','Lancer Evolution IX',2006,'sedan',5,'Blanco','EVO-9MR','Gasolina Premium',176540,
   DATE_SUB(CURDATE(), INTERVAL  40 DAY),   -- tenencia   VENCIDA
   DATE_ADD(CURDATE(), INTERVAL  47 DAY),   -- verif      VERDE
   DATE_ADD(CURDATE(), INTERVAL 110 DAY),   -- seguro     VERDE
   1),
  ('STI-006','Subaru','Impreza WRX STI',2005,'sedan',5,'Azul WR','STI-22S','Gasolina Premium',165900,
   DATE_ADD(CURDATE(), INTERVAL 120 DAY),   -- todo VERDE
   DATE_ADD(CURDATE(), INTERVAL  90 DAY),
   DATE_ADD(CURDATE(), INTERVAL 140 DAY),
   1),
  ('S15-007','Nissan','Silvia S15 Spec-R',1999,'coupe',4,'Negro','S15-99K','Gasolina Magna',143670,
   DATE_ADD(CURDATE(), INTERVAL  68 DAY),   -- tenencia   VERDE
   DATE_ADD(CURDATE(), INTERVAL  25 DAY),   -- verif      AMARILLO
   DATE_ADD(CURDATE(), INTERVAL  80 DAY),   -- seguro     VERDE
   1),
  ('AE86-008','Toyota','Corolla AE86 Trueno',1985,'coupe',4,'Blanco/Negro','AE86-86','Gasolina Magna',221050,
   DATE_ADD(CURDATE(), INTERVAL 109 DAY),   -- tenencia   VERDE
   DATE_ADD(CURDATE(), INTERVAL 124 DAY),   -- verif      VERDE
   DATE_ADD(CURDATE(), INTERVAL  12 DAY),   -- seguro     ROJO (por vencer)
   1);

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
-- Las fechas son relativas: "hace N días". Se reparten sobre los últimos dos
-- meses conservando el orden original, para que el dashboard y el resumen del
-- mes siempre tengan actividad reciente que mostrar.
  -- Skyline GT-R: muchos km, traga premium → costo/km alto
  (@ope,@gtr,'V-1001','Zacatecas','Traslado administrativo',181000,181620, 70.00,25.80,1806.00,'Gasolina Premium',
   TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 62 DAY),'08:00:00'), TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 62 DAY),'18:00:00'),'Finalizado'),
  (@ope,@gtr,'V-1002','Fresnillo','Comisión técnica',181620,182450, 92.00,25.80,2373.60,'Gasolina Premium',
   TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 40 DAY),'07:30:00'), TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 40 DAY),'20:00:00'),'Finalizado'),
  -- Supra: eficiente para lo deportivo
  (@ope,@sup,'V-1003','Guadalupe','Entrega de documentos',153800,154100, 28.00,25.50,714.00,'Gasolina Premium',
   TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 32 DAY),'09:00:00'), TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 32 DAY),'14:00:00'),'Finalizado'),
  (@ope,@sup,'V-1004','Jerez','Supervisión',154100,154300, 19.00,25.50,484.50,'Gasolina Premium',
   TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 14 DAY),'10:00:00'), TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 14 DAY),'15:00:00'),'Finalizado'),
  -- RX-7 rotativo: traga gasolina → costo/km muy alto
  (@ope,@rx7,'V-1005','Sombrerete','Comisión larga',200900,201400, 58.00,25.80,1496.40,'Gasolina Premium',
   TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 55 DAY),'06:00:00'), TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 55 DAY),'22:00:00'),'Finalizado'),
  (@ope,@rx7,'V-1006','Río Grande','Traslado',201400,201780, 49.00,25.80,1264.20,'Gasolina Premium',
   TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 22 DAY),'07:00:00'), TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 22 DAY),'19:00:00'),'Finalizado'),
  -- NSX: eficiente → costo/km bajo
  (@ope,@nsx,'V-1007','Zacatecas','Reunión',97800,98120, 21.00,25.80,541.80,'Gasolina Premium',
   TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 16 DAY),'08:30:00'), TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 16 DAY),'13:00:00'),'Finalizado'),
  -- EVO
  (@ope,@evo,'V-1008','Calera','Inspección',176100,176540, 38.00,25.80,980.40,'Gasolina Premium',
   TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 36 DAY),'08:00:00'), TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 36 DAY),'17:00:00'),'Finalizado'),
  -- STI
  (@ope,@sti,'V-1009','Loreto','Comisión',165500,165900, 34.00,25.80,877.20,'Gasolina Premium',
   TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 28 DAY),'07:00:00'), TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 28 DAY),'16:00:00'),'Finalizado'),
  -- Silvia: magna, económica
  (@ope,@s15,'V-1010','Vetagrande','Traslado',143400,143670, 17.00,23.90,406.30,'Gasolina Magna',
   TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 10 DAY),'09:00:00'), TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 10 DAY),'13:30:00'),'Finalizado'),
  -- AE86: ligero y muy eficiente → costo/km más bajo
  (@ope,@ae8,'V-1011','Guadalupe','Mensajería',220700,221050, 18.00,23.90,430.20,'Gasolina Magna',
   TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 5 DAY),'08:00:00'), TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 5 DAY),'12:00:00'),'Finalizado');

-- -----------------------------------------------------------
--  Vales de combustible (refuerzan el gasto por unidad)
-- -----------------------------------------------------------
INSERT INTO vales_combustible (vehiculo_id, usuario_id, litros, precio_litro, costo, fecha_recarga, ticket_no)
VALUES
  (@gtr,@ope, 65.00,25.80,1677.00, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 16 DAY),'11:00:00'),'T-5001'),
  (@gtr,@ope, 60.00,25.80,1548.00, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL  4 DAY),'16:00:00'),'T-5002'),
  (@rx7,@ope, 55.00,25.80,1419.00, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 12 DAY),'12:00:00'),'T-5003'),
  (@rx7,@ope, 52.00,25.80,1341.60, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL  3 DAY),'09:00:00'),'T-5004'),
  (@evo,@ope, 45.00,25.80,1161.00, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL  9 DAY),'10:00:00'),'T-5005'),
  (@nsx,@ope, 25.00,25.80, 645.00, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL  7 DAY),'13:00:00'),'T-5006'),
  (@ae8,@ope, 20.00,23.90, 478.00, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL  6 DAY),'08:30:00'),'T-5007');

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
-- El semáforo sale de (ultima_fecha + intervalo_meses), así que la última fecha
-- se despeja hacia atrás: se toma el día en que QUEREMOS que caiga el próximo
-- servicio y se le resta el intervalo. Así el escenario se conserva siempre.
  -- próximo servicio hace 5 días → VENCIDO
  (@gtr,'Cambio de aceite y filtro',5000,6,178000,
        DATE_SUB(DATE_SUB(CURDATE(), INTERVAL 5 DAY), INTERVAL 6 MONTH)),
  -- solo por kilometraje (intervalo_meses NULL): la fecha no define su semáforo
  (@gtr,'Cambio de balatas',20000,NULL,170000,
        DATE_SUB(CURDATE(), INTERVAL 380 DAY)),
  -- próximo servicio en 32 días → VERDE
  (@sup,'Cambio de aceite y filtro',5000,6,152000,
        DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 32 DAY), INTERVAL 6 MONTH)),
  -- próximo servicio en 7 días → ROJO
  (@rx7,'Cambio de aceite (rotativo)',4000,4,199000,
        DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 7 DAY), INTERVAL 4 MONTH)),
  -- próximo servicio en 80 días → VERDE
  (@nsx,'Cambio de aceite y filtro',5000,6,96000,
        DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 80 DAY), INTERVAL 6 MONTH)),
  -- próximo servicio en 22 días → AMARILLO
  (@evo,'Cambio de aceite y filtro',5000,6,174000,
        DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 22 DAY), INTERVAL 6 MONTH)),
  -- próximo servicio en 58 días → VERDE
  (@sti,'Cambio de aceite y filtro',5000,6,163000,
        DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 58 DAY), INTERVAL 6 MONTH)),
  -- próximo servicio en 91 días → VERDE
  (@s15,'Cambio de aceite y filtro',5000,6,141000,
        DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 91 DAY), INTERVAL 6 MONTH)),
  -- próximo servicio en 18 días → AMARILLO
  (@ae8,'Afinación mayor',NULL,12,218000,
        DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 18 DAY), INTERVAL 12 MONTH));

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
