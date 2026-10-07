-- Bloque A · T004 — Función de validación de formato de patente, no bloqueante.
--
-- Spec: RF-022 · Plan: sección "Esquema · vehiculos" / D3
--
-- Dice si una patente normalizada encaja en alguno de los dos formatos vigentes en
-- Argentina. No es un CHECK de la tabla: por el principio IV, una patente rara,
-- provisoria o mal cargada tiene que poder guardarse igual. Queda como función suelta
-- para que la aplicación la use al tipear, como advertencia, no como bloqueo.
--
-- Formatos:
--   anterior a 2016: 3 letras + 3 dígitos   (AAR222)
--   Mercosur:        2 letras + 3 dígitos + 2 letras (AA000AA)
--
-- Recibe la patente ya normalizada (mayúsculas, sin espacios/guiones/puntos) —
-- típicamente vehiculos.patente_norm.
create or replace function fn_es_formato_patente_valido(p_patente_norm text)
returns boolean
language sql
immutable
as $$
  select p_patente_norm ~ '^[A-Z]{3}[0-9]{3}$'
      or p_patente_norm ~ '^[A-Z]{2}[0-9]{3}[A-Z]{2}$';
$$;

comment on function fn_es_formato_patente_valido(text) is
  'RF-022: true si la patente normalizada encaja en el formato anterior a 2016 (3 letras + '
  '3 dígitos) o en el Mercosur (2 letras + 3 dígitos + 2 letras). No bloquea nada (principio '
  'IV): sólo para que la aplicación advierta. No está enganchada como CHECK de vehiculos.';
