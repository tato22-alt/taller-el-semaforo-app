-- Simplificación — menos piezas para el mismo comportamiento.
--
-- Dos funciones que no se ganaban el lugar. No cambia nada de lo que la base hace: el QA
-- da lo mismo antes y después.

-- 1. fn_set_modificado_en: nunca se usó, y era una trampa.
--
-- Se creó en la primera migración como infraestructura genérica para sellar modificado_en
-- con un trigger, y en la misma migración se decidió NO engancharla a ninguna tabla —
-- hacerlo habría roto la regla de idempotencia de la importación. Con la importación en
-- pausa (H16), ni siquiera queda esa razón.
--
-- Lo que queda es código muerto que además invita al error: alguien la ve, la engancha a
-- trabajos, y modificado_en deja de poder sellarse con el valor que trae un archivo.
-- Si algún día hace falta un trigger así, se escribe entonces, sabiendo para qué.
drop function if exists fn_set_modificado_en();

-- 2. fn_unaccent_inmutable se absorbe dentro de fn_normalizar_nombre.
--
-- Existía sólo para envolver unaccent() y poder declararla IMMUTABLE, requisito de las
-- columnas generadas. Pero fn_normalizar_nombre ya es IMMUTABLE y ya lleva su search_path
-- fijo: puede llamar a unaccent directamente y la envoltura deja de tener sentido.
--
-- Dos funciones para una sola idea es una de más. La forma de dos argumentos —
-- unaccent('unaccent', texto) — fija el diccionario, que es lo que hace honesta la
-- declaración IMMUTABLE.
create or replace function fn_normalizar_nombre(p_nombre text)
returns text
language sql
immutable
parallel safe
set search_path = public, extensions, pg_catalog
as $$
  select upper(unaccent('unaccent', btrim(regexp_replace(p_nombre, '\s+', ' ', 'g'))))
$$;

comment on function fn_normalizar_nombre(text) is
  'Mayúsculas, sin acentos, recortado, espacios internos colapsados. La ÚNICA definición de '
  '"normalizar un nombre": la usan clientes.nombre_norm y quien busque, para que lo buscado '
  'se normalice igual que lo guardado. IMMUTABLE porque el diccionario va fijo.';

drop function if exists fn_unaccent_inmutable(text);
