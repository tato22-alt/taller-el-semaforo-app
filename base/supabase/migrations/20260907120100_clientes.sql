-- Bloque A · T002 — Tabla clientes, con nombre_norm generada e índice de búsqueda.
--
-- Spec: RF-009, RF-013 · Plan: sección "Esquema · clientes"

create table clientes (
  id_cliente   integer generated always as identity primary key,
  nombre       text not null,
  nombre_norm  text generated always as (
                 upper(btrim(regexp_replace(nombre, '\s+', ' ', 'g')))
               ) stored,
  telefono     text,
  direccion    text,
  email        text,
  cuit         text,
  creado_en    timestamptz not null default now(),

  constraint clientes_nombre_no_vacio check (btrim(nombre) <> '')
);

comment on table clientes is
  'Cliente del taller. Único dato exigido: el nombre (RF-013). '
  'Sin restricción de unicidad sobre el nombre: dos clientes pueden llamarse igual (D5).';
comment on column clientes.nombre_norm is
  'Mayúsculas, recortado, espacios internos colapsados. Para buscar y para deduplicar '
  '(consulta de posibles duplicados, T015). La mantiene el motor, nunca se escribe a mano.';
comment on column clientes.email is 'No lo captura el presupuesto; queda para la app.';
comment on column clientes.cuit is 'No lo captura el presupuesto; queda para la app.';

-- Búsqueda por parte del nombre (pregunta 3 de la spec): índice de trigramas sobre
-- nombre_norm, para ILIKE '%texto%' y para similarity() en la consulta de duplicados (T015).
create index ix_clientes_nombre_norm_trgm
  on clientes using gin (nombre_norm gin_trgm_ops);
