-- Bloque A · T003 — Tabla vehiculos, con patente_norm generada y única.
--
-- Spec: RF-009, RF-011, RF-012 · Plan: sección "Esquema · vehiculos" y D3

create table vehiculos (
  id_vehiculo       integer generated always as identity primary key,
  patente           text not null,
  patente_norm      text generated always as (
                       upper(regexp_replace(patente, '[\s.\-]', '', 'g'))
                     ) stored,
  descripcion       text,
  id_cliente_ultimo integer references clientes (id_cliente),
  creado_en         timestamptz not null default now(),

  constraint vehiculos_patente_no_vacia check (btrim(patente) <> '')
);

comment on table vehiculos is
  'Vehículo del taller, identificado por patente. Un vehículo puede tener presupuestos '
  'de clientes distintos a lo largo del tiempo (RF-012).';
comment on column vehiculos.patente is
  'Como llegó, sin normalizar. Se conserva tal cual la escribió quien cargó.';
comment on column vehiculos.patente_norm is
  'Mayúsculas, sin espacios, guiones ni puntos. La mantiene el motor (D3): no la actualiza '
  'una persona, y por eso no se puede desincronizar de patente. Única (D3).';
comment on column vehiculos.descripcion is
  'Texto libre, p. ej. "Ford Ranger". No se separa marca, modelo, año ni color (RF-011).';
comment on column vehiculos.id_cliente_ultimo is
  'Último cliente conocido de este vehículo, sólo para proponerlo (RF-012). '
  'El cliente del presupuesto es el de ese presupuesto, no éste.';

-- Es la búsqueda número uno del sistema (pregunta 2 de la spec), y evita duplicar
-- vehículos: "aa 123-bb" y "AA123BB" colisionan como la misma patente (criterio de T003).
create unique index ux_vehiculos_patente_norm on vehiculos (patente_norm);
