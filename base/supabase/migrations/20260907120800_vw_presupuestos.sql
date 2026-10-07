-- Bloque C · T009 — Vista vw_presupuestos: una fila por trabajo, con los totales
-- derivados desde los renglones.
--
-- Spec: preguntas 1, 2, 3, 5, 6, 7 · Plan: sección "Vistas", D2, D7

create view vw_presupuestos
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
  t.modificado_en
from trabajos t
left join clientes  c on c.id_cliente  = t.id_cliente
left join vehiculos v on v.id_vehiculo = t.id_vehiculo
left join (
  select id_trabajo, sum(importe) as subtotal_conceptos, count(*) as cantidad_conceptos
  from trabajo_items
  group by id_trabajo
) i on i.id_trabajo = t.id_trabajo;

comment on view vw_presupuestos is
  'Una fila por trabajo. subtotal_conceptos y monto_total se calculan al leer, a partir '
  'de trabajo_items y monto_mano_obra (principio II, D2) — ninguna columna los almacena. '
  'security_invoker=true: las políticas de RLS de las tablas de abajo se evalúan contra '
  'quien consulta la vista, no contra quien la creó (D7, D8).';
comment on column vw_presupuestos.cliente_actual is
  'clientes.nombre, el dato maestro de HOY. Puede diferir de txt_cliente, que es lo que '
  'decía el papel cuando se emitió el presupuesto (D4, RF-010).';
comment on column vw_presupuestos.subtotal_conceptos is
  'SUM(trabajo_items.importe) de este trabajo. 0 si no tiene conceptos cargados.';
comment on column vw_presupuestos.monto_total is
  'subtotal_conceptos + monto_mano_obra. El total final que paga el cliente (RF-007).';
comment on column vw_presupuestos.cantidad_conceptos is
  'Cantidad de filas en trabajo_items para este trabajo. 0 si no tiene ninguna.';

-- D7/D8: anon no tiene ningún privilegio acá, igual que sobre las cuatro tablas (T008).
-- Esto es justo lo que T008 no pudo cubrir, porque la vista no existía todavía.
revoke all on vw_presupuestos from anon;
grant select on vw_presupuestos to authenticated;
