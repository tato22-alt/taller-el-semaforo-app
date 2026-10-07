-- Feature 002 · Numeración — la base reparte los números de presupuesto.
--
-- Spec: specs/002-numeracion/spec.md (RF-101 a RF-105) · Feature 001: RF-020, RF-021, RF-023
--
-- POR QUÉ UNA SECUENCIA Y NO max(numero_presupuesto) + 1:
-- con max()+1, dos personas que presupuestan al mismo tiempo leen el mismo máximo y se
-- llevan el mismo número. Una secuencia entrega cada valor una sola vez, sin importar
-- cuántos la pidan a la vez (RF-102).
--
-- Y hay una segunda razón, menos obvia: `nextval` **no se deshace**. Si la transacción que
-- pidió el número se cae, el número igual queda gastado. Eso suena a defecto y es
-- exactamente lo que RF-103 y RF-020 piden: un número emitido no se reutiliza nunca, ni
-- aunque el presupuesto no llegue a guardarse. La serie tiene huecos y eso es correcto —
-- la alternativa es arriesgarse a que dos presupuestos lleven el mismo número.
--
-- Es también la garantía que la herramienta intentaba dar con `maxEmitido` en el navegador
-- y no podía: ahí, si el historial no se puede leer, el contador vuelve a empezar en
-- silencio. Acá no puede retroceder (RF-104).

create sequence if not exists seq_numero_presupuesto
  as integer
  start with 16000
  minvalue 16000
  no cycle;

comment on sequence seq_numero_presupuesto is
  'Reparte los números de presupuesto. Arranca en 16000 (RF-101), no retrocede (RF-104) y '
  'no reutiliza (RF-103). Los huecos son correctos: un número pedido queda gastado aunque '
  'el presupuesto no se guarde.';

-- Lo que la aplicación llama. Devuelve el próximo número y lo marca como usado.
-- Uso previsto, en una sola ida y vuelta:
--   insert into trabajos (numero_presupuesto, origen_carga, ...)
--   values (fn_proximo_numero_presupuesto(), 'presupuesto_web', ...);
create or replace function fn_proximo_numero_presupuesto()
returns integer
language sql
volatile
as $$ select nextval('seq_numero_presupuesto')::integer $$;

comment on function fn_proximo_numero_presupuesto() is
  'Entrega el próximo número de presupuesto y lo gasta. VOLATILE a propósito: cada llamada '
  'devuelve un valor distinto, y eso no se deshace si la transacción se cae (RF-103).';

-- RF-105: si entran números por otro camino —carga manual desde el panel, o la importación
-- del bloque D si algún día se construye— el contador queda atrás y la próxima llamada
-- devolvería un número ya usado. El índice único lo frenaría, pero con un error feo en la
-- cara de quien está presupuestando.
--
-- Esta función pone el contador al día. NO se dispara sola: alguien la corre a sabiendas
-- después de cargar números por fuera (principio VI). El QA detecta cuándo hace falta.
create or replace function fn_sincronizar_numeracion()
returns integer
language plpgsql
volatile
as $$
declare
  v_max integer;
  v_seq integer;
begin
  select coalesce(max(numero_presupuesto), 15999) into v_max from trabajos;
  select last_value::integer into v_seq from seq_numero_presupuesto;

  if v_max >= v_seq then
    perform setval('seq_numero_presupuesto', v_max);
    return v_max;
  end if;

  return v_seq;
end;
$$;

comment on function fn_sincronizar_numeracion() is
  'Adelanta el contador hasta el número más alto que ya existe en trabajos, si quedó atrás. '
  'Devuelve dónde quedó. Nunca lo hace retroceder (RF-104). Se corre a mano después de '
  'cargar números por fuera de la secuencia.';

-- D8: anon no puede pedir números. Sin esto, cualquiera con la clave publicable podría
-- quemar la serie entera llamando a la función en un bucle.
revoke all on function fn_proximo_numero_presupuesto() from public, anon;
revoke all on function fn_sincronizar_numeracion()     from public, anon, authenticated;
revoke all on sequence seq_numero_presupuesto          from public, anon;

grant execute on function fn_proximo_numero_presupuesto() to authenticated;
grant usage   on sequence seq_numero_presupuesto         to authenticated;
