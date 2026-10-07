-- Enmienda H1 — La búsqueda por nombre ignora acentos.
--
-- Spec: RF-009 (enmendado) · Plan: "Esquema · clientes" · Hallazgos: H1, H6
--
-- Buscar "perez" tiene que encontrar a "Pérez": quien busca desde un teléfono no escribe
-- las tildes, y no encontrarlo hace que carguen el cliente de nuevo.
--
-- Resuelve también H6: hasta ahora el índice estaba sobre nombre_norm y la consulta
-- filtraba por nombre, así que el índice no lo usaba nadie. Con fn_normalizar_nombre
-- expuesta, el término buscado se normaliza igual que lo guardado y ambos hablan de la
-- misma columna.

create extension if not exists unaccent;

-- unaccent() es STABLE, no IMMUTABLE, porque depende de un diccionario que en teoría
-- puede cambiar. Una columna generada exige IMMUTABLE, así que se envuelve. La forma de
-- dos argumentos fija el diccionario y hace que la envoltura sea honesta.
-- El search_path fijo cubre las dos ubicaciones posibles de la extensión: Supabase suele
-- instalar extensiones en "extensions", una base común las deja en "public".
create or replace function fn_unaccent_inmutable(p_texto text)
returns text
language sql
immutable
parallel safe
strict
set search_path = public, extensions, pg_catalog
as $$ select unaccent('unaccent', p_texto) $$;

comment on function fn_unaccent_inmutable(text) is
  'Envoltura IMMUTABLE de unaccent, para poder usarla en columnas generadas.';

-- La ÚNICA definición de "normalizar un nombre" del modelo. La usan la columna generada
-- de clientes y quien busque, para que el término buscado se normalice igual que lo
-- guardado. Si esto se duplicara, las dos copias divergirían (principio V).
create or replace function fn_normalizar_nombre(p_nombre text)
returns text
language sql
immutable
parallel safe
as $$
  select upper(fn_unaccent_inmutable(btrim(regexp_replace(p_nombre, '\s+', ' ', 'g'))))
$$;

comment on function fn_normalizar_nombre(text) is
  'Mayúsculas, sin acentos, recortado, espacios internos colapsados. Normaliza tanto lo '
  'que se guarda (clientes.nombre_norm) como lo que se busca. Una sola definición.';

-- Postgres no deja cambiar la expresión de una columna generada: hay que rehacerla.
-- Al borrarla se va también su índice, que se recrea abajo. Las políticas de RLS y los
-- permisos son de la tabla, no de la columna, así que no se tocan (lo verifica el QA).
--
-- Va dentro de un guard para que la migración se pueda correr dos veces sin romper: si ya
-- está aplicada, no hace nada. Sin esto, la segunda corrida falla con "cannot drop column
-- nombre_norm because other objects depend on it" — la vista que esta misma migración crea
-- más abajo pasa a depender de la columna. Estas migraciones se pegan a mano en el panel y
-- no hay forma de saber a simple vista si una ya se aplicó: tienen que ser repetibles.
do $migracion$
begin
  if not exists (
    select 1
    from pg_attrdef ad
    join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
    where ad.adrelid = 'clientes'::regclass
      and a.attname = 'nombre_norm'
      and pg_get_expr(ad.adbin, ad.adrelid) like '%fn_normalizar_nombre%'
  ) then
    alter table clientes drop column if exists nombre_norm;
    alter table clientes
      add column nombre_norm text
      generated always as (fn_normalizar_nombre(nombre)) stored;
  end if;
end
$migracion$;

comment on column clientes.nombre_norm is
  'fn_normalizar_nombre(nombre): mayúsculas, sin acentos, recortado. Para buscar y para '
  'deduplicar (T015). La mantiene el motor, nunca se escribe a mano.';

create index if not exists ix_clientes_nombre_norm_trgm
  on clientes using gin (nombre_norm gin_trgm_ops);

-- La vista expone la forma normalizada, para que la búsqueda por nombre use el índice.
-- Se agrega al final: CREATE OR REPLACE VIEW sólo admite columnas nuevas al final, y
-- agregar no rompe consumidores (D7). Los permisos de la vista se conservan.
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
  c.nombre_norm                                     as cliente_norm
from trabajos t
left join clientes  c on c.id_cliente  = t.id_cliente
left join vehiculos v on v.id_vehiculo = t.id_vehiculo
left join (
  select id_trabajo, sum(importe) as subtotal_conceptos, count(*) as cantidad_conceptos
  from trabajo_items
  group by id_trabajo
) i on i.id_trabajo = t.id_trabajo;

comment on column vw_presupuestos.cliente_norm is
  'cliente_actual normalizado (mayúsculas, sin acentos). Para buscar por parte del nombre '
  'con el índice: where cliente_norm like ''%'' || fn_normalizar_nombre(<lo buscado>) || ''%''.';

revoke all on vw_presupuestos from anon;
grant select on vw_presupuestos to authenticated;
