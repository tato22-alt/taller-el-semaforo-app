-- Enmienda H3 — La validación de patente normaliza antes de comparar.
--
-- Spec: RF-022 (enmendado) · Plan: D3 · Hallazgos: H3
--
-- La aplicación llama a esta función mientras alguien tipea, o sea sobre texto crudo.
-- Exigirle la patente ya normalizada hacía que marcara como inválida toda patente escrita
-- en minúscula o con guión — y una advertencia que salta siempre es una que nadie mira.

-- Una sola definición de "normalizar una patente" (principio V). vehiculos.patente_norm
-- mantiene su expresión equivalente en línea: rehacer esa columna significaría tirar y
-- recrear el índice único sobre una tabla con datos, sin más beneficio que la prolijidad.
-- El QA verifica que las dos formas coincidan fila por fila, así que no pueden divergir
-- en silencio.
create or replace function fn_normalizar_patente(p_patente text)
returns text
language sql
immutable
parallel safe
as $$ select upper(regexp_replace(p_patente, '[\s.\-]', '', 'g')) $$;

comment on function fn_normalizar_patente(text) is
  'Mayúsculas, sin espacios, guiones ni puntos. Misma normalización que aplica la columna '
  'generada vehiculos.patente_norm; el QA verifica que coincidan.';

-- El parámetro cambia de nombre (p_patente_norm -> p_patente) porque cambia lo que
-- significa: ya no exige recibir la patente normalizada. CREATE OR REPLACE no permite
-- renombrar un parámetro, así que hay que borrarla y volver a crearla. Es seguro: ningún
-- CHECK ni ninguna vista la referencia, justamente porque no bloquea nada (D3).
drop function if exists fn_es_formato_patente_valido(text);

create function fn_es_formato_patente_valido(p_patente text)
returns boolean
language sql
immutable
parallel safe
as $$
  select fn_normalizar_patente(p_patente) ~ '^[A-Z]{3}[0-9]{3}$'
      or fn_normalizar_patente(p_patente) ~ '^[A-Z]{2}[0-9]{3}[A-Z]{2}$';
$$;

comment on function fn_es_formato_patente_valido(text) is
  'RF-022: true si la patente encaja en el formato anterior a 2016 (3 letras + 3 dígitos) '
  'o en el Mercosur (2 letras + 3 dígitos + 2 letras). Normaliza sola, así que acepta la '
  'patente como la escribió la persona. No bloquea nada (principio IV): sólo para que la '
  'aplicación advierta. No está enganchada como CHECK de vehiculos.';
