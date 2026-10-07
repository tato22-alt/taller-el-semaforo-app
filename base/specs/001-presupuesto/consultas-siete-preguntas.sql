-- T010 — Consultas de las siete preguntas de la spec (specs/001-presupuesto/spec.md,
-- sección "Preguntas que la base tiene que poder responder"), cada una en una sola
-- consulta contra vw_presupuestos (T009).
--
-- No es una migración: no crea nada en el esquema. Es el registro de verificación de
-- T010, para reusar en T017 (verificación de criterios de aceptación).

-- 1. ¿Qué presupuesto tiene el número 16043?
select *
from vw_presupuestos
where numero_presupuesto = 16043;

-- 2. ¿Qué presupuestos existen para la patente AA123BB, del más nuevo al más viejo?
select *
from vw_presupuestos
where patente_norm = 'AA123BB'
order by fecha_presupuesto desc nulls last;

-- 3. ¿Qué presupuestos tiene un cliente, buscándolo por parte de su nombre?
select *
from vw_presupuestos
where cliente_actual ilike '%perez%'
order by fecha_presupuesto desc nulls last;

-- 4. ¿Cuál fue el último presupuesto cargado y cuál es el próximo número?
-- Sólo informa el máximo emitido. NO es el próximo a asignar: RF-020 prohíbe reutilizar
-- y la serie puede tener huecos (números borrados), así que la asignación real la
-- resuelve el feature que conecte la herramienta (plan, sección "Vistas").
select
  max(numero_presupuesto)     as ultimo_numero_emitido,
  max(numero_presupuesto) + 1 as siguiente_libre_si_no_hay_huecos
from vw_presupuestos;

-- 5. ¿Cuánto suma un presupuesto, y qué conceptos lo componen?
select
  vp.id_trabajo,
  vp.numero_presupuesto,
  vp.subtotal_conceptos,
  vp.monto_mano_obra,
  vp.monto_total,
  jsonb_agg(
    jsonb_build_object('orden', ti.orden, 'detalle', ti.detalle, 'importe', ti.importe)
    order by ti.orden
  ) as conceptos
from vw_presupuestos vp
join trabajo_items ti on ti.id_trabajo = vp.id_trabajo
where vp.id_trabajo = 1
group by vp.id_trabajo, vp.numero_presupuesto, vp.subtotal_conceptos, vp.monto_mano_obra, vp.monto_total;

-- 6. ¿Qué presupuestos quedaron sin concretarse?
select *
from vw_presupuestos
where no_concretado = true
order by fecha_presupuesto desc nulls last;

-- 7. ¿Cuántos presupuestos se hicieron en un mes y por qué monto total?
-- Los que no tienen fecha NO se descartan: salen en una fila aparte, con mes en nulo, para que
-- se vean y se corrijan (enmienda H7 — RF-024 dice que la fecha no debería faltar, y lo que no
-- se ve no se arregla). El ::date evita devolver un timestamptz, que invitaría justo a la
-- confusión que D6 quiere evitar.
select
  date_trunc('month', fecha_presupuesto)::date as mes,
  count(*)                                     as cantidad_presupuestos,
  sum(monto_total)                             as monto_total_del_mes
from vw_presupuestos
group by 1
order by 1 nulls last;
