-- Enmienda H7 / RF-024 — Vista de presupuestos incompletos.
--
-- Spec: RF-024 (nuevo), RF-008, RF-019 · Plan: "Vistas" · Hallazgos: H7
--
-- Regla de carga confirmada por Luciano: un presupuesto cargado hoy tiene que tener fecha,
-- cliente con nombre, dirección y teléfono, y mano de obra mayor a cero. Los repuestos NO:
-- hay trabajos que son sólo mano de obra. El vehículo tampoco entra en la exigencia.
--
-- La regla la exige la aplicación, no el esquema. Dos razones, las dos ya decididas:
--   · RF-019: el histórico se importa como está, con sus huecos. Un NOT NULL dejaría afuera
--     las filas viejas sin fecha o sin cliente, que es justo lo que se quiere rescatar.
--   · Principio IV: "un sistema que impide registrar la realidad se saltea". Si la base
--     bloquea, alguien escribe "xx" en la dirección — y un "xx" miente y no se detecta.
--
-- Lo que sí es responsabilidad de la base es entregar el hecho: quiénes están incompletos y
-- qué les falta. La aplicación decide qué hacer con eso (principio III). Y por el principio I,
-- esto es una vista, no una columna de estado.

create or replace view vw_presupuestos_incompletos
with (security_invoker = true)
as
select *
from (
  select
    t.id_trabajo,
    t.numero_presupuesto,
    t.fecha_presupuesto,
    t.origen_carga,
    coalesce(nullif(btrim(t.txt_cliente), ''), nullif(btrim(c.nombre), '')) as cliente,
    t.monto_mano_obra,
    array_remove(array[
      case when t.fecha_presupuesto is null
           then 'fecha' end,
      case when coalesce(nullif(btrim(t.txt_cliente), ''), nullif(btrim(c.nombre), '')) is null
           then 'cliente' end,
      case when coalesce(nullif(btrim(t.txt_direccion), ''), nullif(btrim(c.direccion), '')) is null
           then 'direccion' end,
      case when coalesce(nullif(btrim(t.txt_telefono), ''), nullif(btrim(c.telefono), '')) is null
           then 'telefono' end,
      case when t.monto_mano_obra <= 0
           then 'mano_obra' end
    ], null) as faltantes
  from trabajos t
  left join clientes c on c.id_cliente = t.id_cliente
) x
where cardinality(x.faltantes) > 0;

comment on view vw_presupuestos_incompletos is
  'Presupuestos a los que les falta algo de lo que la carga exige (RF-024): fecha, cliente '
  'con nombre, dirección y teléfono, y mano de obra mayor a cero. Los repuestos NO cuentan: '
  'un trabajo puede ser sólo mano de obra. El vehículo tampoco. '
  'Entrega el hecho, no la decisión (principio III): la aplicación resuelve si eso se avisa, '
  'se bloquea o se ignora. Incluye lo importado, que casi siempre va a estar incompleto — '
  'filtrar por origen_carga <> ''importacion'' para ver sólo lo cargado a mano.';
comment on column vw_presupuestos_incompletos.faltantes is
  'Lista de lo que falta: fecha, cliente, direccion, telefono, mano_obra. Nunca vacía: si no '
  'falta nada, la fila no aparece.';
comment on column vw_presupuestos_incompletos.cliente is
  'El nombre impreso si lo hay; si no, el del maestro. Nulo si no hay ninguno de los dos.';

revoke all on vw_presupuestos_incompletos from anon;
grant select on vw_presupuestos_incompletos to authenticated;
