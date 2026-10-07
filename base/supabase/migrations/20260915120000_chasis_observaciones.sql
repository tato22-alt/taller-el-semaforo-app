-- Feature 004 · Número de chasis y observaciones.
--
-- Spec: specs/004-chasis-observaciones/spec.md (RF-301 a RF-305)
--
-- El presupuesto deja de pedir la dirección del cliente y pasa a pedir el número de chasis, más un
-- renglón de observaciones. Son datos nuevos, no un cambio de rótulo: el chasis es del vehículo y
-- las observaciones son del trabajo. Guardar un chasis en clientes.direccion sería un dato que
-- miente, y nadie podría desarmarlo después (principio V).
--
-- Nada de esto es obligatorio (RF-304, principio IV): un presupuesto sin chasis y sin observaciones
-- es perfectamente válido, y estar vacío es lo normal.

-- RF-302: dato propio del vehículo, para proponerlo cuando el auto vuelve — igual que hoy se
-- propone su último cliente conocido. Sin unicidad a propósito (ver spec, fuera de alcance):
-- dos fichas con el mismo chasis son un error a corregir, pero un tipeo no puede frenar la carga.
alter table vehiculos
  add column if not exists chasis text;

comment on column vehiculos.chasis is
  'Número de chasis del vehículo. Identifica el auto mejor que la patente, que puede cambiar. '
  'Sin restricción de formato ni de unicidad (RF-304): el taller recibe vehículos viejos, '
  'importados o con el chasis regrabado, y el esquema no impide registrar la realidad.';

-- RF-301 y RF-303: parte del snapshot de lo impreso (D4), como el resto de las columnas txt_*.
alter table trabajos
  add column if not exists txt_chasis text;
alter table trabajos
  add column if not exists observaciones text;

comment on column trabajos.txt_chasis is
  'Snapshot: número de chasis tal como se imprimió (D4, RF-301). Puede diferir de vehiculos.chasis, '
  'que es el dato de hoy.';
comment on column trabajos.observaciones is
  'Texto libre del presupuesto: una aclaración, una condición, un plazo. Vacío es lo normal '
  '(RF-303). No se clasifica ni se interpreta — es lo que se escribía al margen del papel.';

-- La dirección del cliente NO se toca (RF-305): deja de pedirse en el presupuesto, pero las fichas
-- que ya la tienen la conservan y El Semáforo puede usarla.

-- Las dos columnas nuevas del trabajo se exponen para poder reimprimir el presupuesto igual que la
-- primera vez. Se agregan al final; CREATE OR REPLACE VIEW no permite tocar las que ya estaban.
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
  t.observaciones
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
