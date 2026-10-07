-- Feature 002 — Poner el contador de presupuestos en 16000.
--
-- Se corre UNA sola vez, antes del primer presupuesto real, si el contador quedó adelantado
-- por pruebas. Después de eso NO se vuelve a correr: RF-104 dice que la numeración no
-- retrocede, y con presupuestos ya emitidos hacerla retroceder produciría números repetidos.
--
-- Por eso el script se protege solo: si hay aunque sea un presupuesto guardado, corta con un
-- error y no toca nada.

do $$
begin
  if exists (select 1 from trabajos where numero_presupuesto is not null) then
    raise exception 'Hay presupuestos guardados: NO se toca el contador';
  end if;
  perform setval('seq_numero_presupuesto', 16000, false);
end $$;

-- Última sentencia a propósito: el editor SQL del panel muestra sólo el resultado de la
-- última, así que tiene que ser la comprobación (lección del hallazgo H10).
select last_value as contador, is_called as ya_estrenada from seq_numero_presupuesto;
