-- Bloque A · T001 — Migración inicial: extensiones, convenciones de nombres,
-- función genérica para sellar "modificado_en".
--
-- Spec: specs/001-presupuesto/spec.md · Plan: specs/001-presupuesto/plan.md (D6, D7, D8)
--
-- Convenciones de nombres de este esquema (documentadas acá porque no hay otro lugar
-- ejecutable donde dejarlas; el detalle completo vive en docs/diccionario-datos.md,
-- que se actualiza en T018):
--   - tablas y columnas en español, snake_case; tablas en plural (clientes, vehiculos,
--     trabajos, trabajo_items);
--   - claves primarias `id_<entidad>`, `GENERATED ALWAYS AS IDENTITY`;
--   - timestamps de auditoría con sufijo `_en` (creado_en, modificado_en), tipo
--     TIMESTAMPTZ; una fecha de calendario pura (p. ej. fecha_presupuesto) es DATE,
--     nunca TIMESTAMPTZ — ver D6 en el plan;
--   - columnas derivadas/normalizadas con sufijo `_norm`, `GENERATED ALWAYS AS (...) STORED`;
--   - nada de columnas de estado financiero, documental o de siniestro (principio I).

-- pg_trgm: habilita búsqueda por similitud de texto. La usan el índice de
-- clientes.nombre_norm (T002) y la consulta de posibles duplicados (T015).
create extension if not exists pg_trgm;

-- Función genérica: sella modificado_en = now() en un UPDATE. Es infraestructura
-- técnica, no un automatismo financiero (principio VI): no decide montos, saldos ni
-- estados, sólo registra cuándo cambió la fila.
--
-- Deliberadamente NO se engancha a ninguna tabla en esta migración. En particular,
-- `trabajos.modificado_en` NO se ata a esta función: D6 y RF-018 (ver T014) exigen que
-- la importación pueda sellar ese campo con el valor que trae el CSV, para comparar
-- "¿el archivo es más nuevo que lo guardado?". Un trigger que lo pisara con `now()` en
-- cada UPDATE rompería esa idempotencia. Cada tabla que la necesite la adopta
-- explícitamente, a criterio de la migración que la crea.
create or replace function fn_set_modificado_en()
returns trigger
language plpgsql
as $$
begin
  new.modificado_en := now();
  return new;
end;
$$;

comment on function fn_set_modificado_en() is
  'Sella modificado_en = now() en UPDATE. Adoptar con BEFORE UPDATE por tabla, explícitamente. '
  'No usada en trabajos: su modificado_en lo sella la importación o la aplicación (D6, RF-018).';
