-- Feature 005 · Qué dice el renglón de mano de obra.
--
-- Spec: specs/005-detalle-mano-obra/spec.md (RF-401 a RF-405)
--
-- El presupuesto imprimía "Mano de obra" y un importe, sin decir qué trabajo se cobraba. Ahora ese
-- renglón lleva un texto libre al lado del importe.
--
-- Va en trabajos y no en observaciones porque son dos cosas distintas: observaciones es del
-- presupuesto entero (un plazo, una condición) y se imprime arriba; esto describe un renglón y se
-- imprime en ese renglón. Mezclarlas las volvería indistinguibles para siempre (principio V).
--
-- Tampoco es un trabajo_items: los ítems suman al total, y este texto no mueve ningún monto
-- (RF-405). El total sigue siendo subtotal_conceptos + monto_mano_obra.

alter table trabajos
  add column if not exists detalle_mano_obra text;

comment on column trabajos.detalle_mano_obra is
  'Snapshot: qué mano de obra se cotizó, tal como se imprimió al lado de su importe (D4, RF-402). '
  'Texto libre, sin formato ni clasificación (RF-404). Vacío es lo normal y no se imprime (RF-403). '
  'No interviene en ningún cálculo: el importe es monto_mano_obra.';

-- Se expone para poder reimprimir el presupuesto igual que la primera vez. Se agrega al final:
-- CREATE OR REPLACE VIEW no permite tocar ni reordenar las columnas que ya estaban.
create or replace view vw_presupuestos
with (security_invoker = true)
as
select
  t.id_trabajo,
  t.numero_presupuesto,
  t.fecha_presupuesto,
  t.id_cliente,
  c.nombre                                          as cliente_actual,
  t.txt_cliente,
  t.id_vehiculo,
  v.patente_norm,
  t.txt_vehiculo,
  coalesce(i.subtotal_conceptos, 0)::numeric(12, 2) as subtotal_conceptos,
  t.monto_mano_obra,
  (coalesce(i.subtotal_conceptos, 0) + t.monto_mano_obra)::numeric(12, 2) as monto_total,
  coalesce(i.cantidad_conceptos, 0)                 as cantidad_conceptos,
  t.no_concretado,
  t.origen,
  t.creado_en,
  t.modificado_en,
  fn_normalizar_nombre(c.nombre)                    as cliente_norm,
  t.txt_chasis,
  t.observaciones,
  t.detalle_mano_obra
from trabajos t
left join clientes  c on c.id_cliente  = t.id_cliente
left join vehiculos v on v.id_vehiculo = t.id_vehiculo
left join (
  select id_trabajo, sum(importe) as subtotal_conceptos, count(*) as cantidad_conceptos
  from trabajo_items
  group by id_trabajo
) i on i.id_trabajo = t.id_trabajo;

-- Se repite el revoke por si la vista se recreó con otros permisos por defecto (riesgo que el plan
-- del feature 001 marca como "conviene verificarlo en cada migración").
revoke all on vw_presupuestos from anon;
grant select on vw_presupuestos to authenticated;
