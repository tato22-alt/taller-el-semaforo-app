-- Bloque A · T006 — Tabla trabajo_items, con orden y cascada.
--
-- Spec: RF-004, RF-006 · Plan: sección "Esquema · trabajo_items"

create table trabajo_items (
  id_item      integer generated always as identity primary key,
  id_trabajo   integer not null references trabajos (id_trabajo) on delete cascade,
  orden        smallint not null,
  detalle      text,
  importe      numeric(12, 2) not null default 0,

  constraint trabajo_items_orden_no_negativo check (orden >= 0)
);

comment on table trabajo_items is
  'Conceptos presupuestados, colgando del trabajo, en el orden en que se cargaron. '
  'Sin columna tipo: RF-006 dice que no se clasifican, el detalle lo escribe quien presupuesta.';
comment on column trabajo_items.id_trabajo is
  'ON DELETE CASCADE: un item no tiene sentido sin su trabajo. No hay borrado lógico '
  'de trabajos en esta spec, así que esto sólo actúa si alguna vez se borra un trabajo entero.';
comment on column trabajo_items.orden is
  'Posición del ítem dentro del trabajo, para devolverlos en el orden en que se cargaron. '
  'No es un ranking de negocio, es orden de carga.';
comment on column trabajo_items.detalle is
  'Texto libre. Puede venir vacío con importe cargado (la fuente admite un importe sin '
  'detalle, pero no un detalle sin importe — ver spec, estructura real de la fuente).';

-- Traer los conceptos de un trabajo en orden (pregunta 5 de la spec).
create index ix_trabajo_items_trabajo_orden
  on trabajo_items (id_trabajo, orden);
