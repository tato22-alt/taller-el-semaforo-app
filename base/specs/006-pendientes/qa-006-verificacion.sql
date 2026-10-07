\set ON_ERROR_STOP off
begin;
set local role authenticated;

-- 1. Un pendiente se puede guardar: sin número, sin mano de obra, sin renglones.
insert into trabajos (txt_cliente, origen_carga) values ('ZZQA Pendiente', 'presupuesto_web');
select 'RF-501 guardar pendiente sin número ni mano de obra' as caso,
       case when count(*) = 1 then 'PASA' else 'FALLA' end as r
from trabajos where txt_cliente = 'ZZQA Pendiente' and numero_presupuesto is null;

-- 2. Pueden convivir varios pendientes (el índice único es parcial).
insert into trabajos (txt_cliente, origen_carga) values ('ZZQA Pendiente 2', 'presupuesto_web');
select 'RF-501 conviven varios pendientes a la vez' as caso,
       case when count(*) = 2 then 'PASA' else 'FALLA' end as r
from trabajos where txt_cliente like 'ZZQA Pendiente%';

-- 3. Un pendiente con renglones se borra, y los renglones se van con él.
insert into trabajo_items (id_trabajo, orden, detalle, importe)
select id_trabajo, 0, 'ZZQA repuesto', 1000 from trabajos where txt_cliente = 'ZZQA Pendiente';
delete from trabajos where txt_cliente = 'ZZQA Pendiente';
select 'RF-507 un pendiente se borra' as caso,
       case when count(*) = 0 then 'PASA' else 'FALLA' end as r
from trabajos where txt_cliente = 'ZZQA Pendiente';
select 'RF-507 sus renglones se borran con él (cascade)' as caso,
       case when count(*) = 0 then 'PASA' else 'FALLA' end as r
from trabajo_items where detalle = 'ZZQA repuesto';

-- 4. Un presupuesto EMITIDO no se borra, ni aunque la página lo pida.
insert into trabajos (numero_presupuesto, txt_cliente, monto_mano_obra, origen_carga)
values (99000001, 'ZZQA Emitido', 5000, 'presupuesto_web');
delete from trabajos where txt_cliente = 'ZZQA Emitido';
select 'RF-508 un presupuesto con número NO se borra' as caso,
       case when count(*) = 1 then 'PASA' else 'FALLA' end as r
from trabajos where txt_cliente = 'ZZQA Emitido';

-- 5. Emitir un pendiente: el mismo trabajo recibe su número, no se crea otro.
select id_trabajo as id_pend from trabajos where txt_cliente = 'ZZQA Pendiente 2' \gset
update trabajos set numero_presupuesto = 99000002, monto_mano_obra = 80000
where id_trabajo = :id_pend;
select 'RF-504 el pendiente emitido es el mismo trabajo' as caso,
       case when count(*) = 1 then 'PASA' else 'FALLA' end as r
from trabajos where id_trabajo = :id_pend and numero_presupuesto = 99000002;

-- 6. Y una vez emitido, ya no se puede borrar.
delete from trabajos where id_trabajo = :id_pend;
select 'RF-508 emitido deja de ser borrable' as caso,
       case when count(*) = 1 then 'PASA' else 'FALLA' end as r
from trabajos where id_trabajo = :id_pend;

-- 7. La vista lo muestra con número nulo y su total.
insert into trabajos (txt_cliente, origen_carga) values ('ZZQA Pendiente 3', 'presupuesto_web');
select 'RF-506 el pendiente sale en vw_presupuestos, sin número' as caso,
       case when count(*) = 1 then 'PASA' else 'FALLA' end as r
from vw_presupuestos where txt_cliente = 'ZZQA Pendiente 3' and numero_presupuesto is null;

rollback;
