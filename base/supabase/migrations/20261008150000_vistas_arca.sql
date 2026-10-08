-- Cobranzas · fase 1 · M4 — Vistas del libro de ARCA: el arqueo y las notas de crédito.
--
-- Spec: specs/005-cobranzas/spec.md §4.2, §5.5, criterio 1 · Plan: specs/005-cobranzas/plan.md, P9
--
-- Las dos son vistas, no tablas: no guardan nada, derivan de los comprobantes importados
-- (principio II). Las dos con security_invoker, así evalúan la RLS de quien consulta: una persona
-- ve lo que puede ver, el robot y una sesión sin rol no ven nada (D2).
--
-- APLICADA el 2026-10-08. Verificación: specs/005-cobranzas/qa-m4-vistas-arca.sql, 13 de 13 ok.

begin;

-- ---------------------------------------------------------------------------------------------
-- vw_arqueo_arca · cuánto se emitió, por emisor, mes y tipo de comprobante.
-- ---------------------------------------------------------------------------------------------
-- Es el número contra el que se compara ARCA: cada fila tiene que coincidir al peso con lo que
-- ARCA muestra para ese emisor, ese mes y ese tipo. Los importes van como los emitió ARCA, en
-- positivo; total_con_signo resta las notas de crédito, para que el facturado neto de un mes sea
-- la suma de esa columna sin tener que saber qué tipo resta.

create view vw_arqueo_arca
with (security_invoker = true)
as
select
  c.cuit_emisor,
  to_char(c.fecha_emision, 'YYYY-MM')                           as mes,
  c.tipo_codigo,
  t.nombre                                                      as tipo_nombre,
  t.clase,
  c.moneda,
  count(*)                                                      as cantidad,
  sum(c.neto_gravado)                                           as neto_gravado,
  sum(c.iva)                                                    as iva,
  sum(c.total)                                                  as total,
  sum(case when t.clase = 'nota_credito' then -c.total else c.total end) as total_con_signo
from comprobante c
join tipo_comprobante t on t.codigo = c.tipo_codigo
group by c.cuit_emisor, to_char(c.fecha_emision, 'YYYY-MM'), c.tipo_codigo, t.nombre, t.clase, c.moneda;

comment on view vw_arqueo_arca is
  'Lo emitido por emisor, mes (AAAA-MM) y tipo, para compararlo al peso con ARCA. '
  'total_con_signo resta las notas de crédito: el facturado neto de un mes es su suma.';

revoke all on vw_arqueo_arca from anon;

-- ---------------------------------------------------------------------------------------------
-- vw_nc_candidatas · a qué factura le toca cada nota de crédito.
-- ---------------------------------------------------------------------------------------------
-- Una fila por nota de crédito y candidata. Candidata: una factura del mismo emisor, al mismo
-- receptor (por CUIT), por el mismo total, emitida el mismo día o antes que la nota.
--
-- Cómo se lee la columna estado (P9):
--   · confirmada      una persona ya la vinculó (comprobante_vinculo). Gana siempre.
--   · unica           hay una sola candidata: se toma como vinculada, sin escribir nada.
--   · ambigua         hay más de una, o la única es también candidata de otra nota: la decide
--                     una persona, nunca el sistema eligiendo una.
--   · sin_candidata   no hay ninguna: la decide una persona.
-- Las únicas no se escriben en comprobante_vinculo: lo que se deriva, se deriva. Si una persona
-- después confirma otra cosa, su vínculo manda.

create view vw_nc_candidatas
with (security_invoker = true)
as
with notas as (
  select c.*
  from comprobante c
  join tipo_comprobante t on t.codigo = c.tipo_codigo
  where t.clase = 'nota_credito'
),
manuales as (
  select v.id_origen as id_nota, v.id_destino as id_factura
  from comprobante_vinculo v
  join notas n on n.id_comprobante = v.id_origen
),
candidatas as (
  select n.id_comprobante as id_nota, f.id_comprobante as id_factura
  from notas n
  join comprobante f
    on  f.cuit_emisor   = n.cuit_emisor
    and f.cuit_receptor = n.cuit_receptor
    and f.total         = n.total
    and f.fecha_emision <= n.fecha_emision
  join tipo_comprobante tf on tf.codigo = f.tipo_codigo and tf.clase = 'factura'
),
conteo as (
  select n.id_comprobante as id_nota,
         count(c.id_factura) as candidatas,
         -- Si la única candidata también es candidata de otra nota, no es única: dos notas por el
         -- mismo importe al mismo receptor no pueden descontar las dos la misma factura.
         max(c.notas_por_factura) as notas_por_factura
  from notas n
  left join (
    select id_nota, id_factura, count(*) over (partition by id_factura) as notas_por_factura
    from candidatas
  ) c on c.id_nota = n.id_comprobante
  group by n.id_comprobante
),
filas as (
  -- Las que decidió una persona.
  select m.id_nota, m.id_factura, 'confirmada'::text as estado
  from manuales m
  union all
  -- Las automáticas, sólo para notas que nadie vinculó a mano.
  select k.id_nota, c.id_factura,
         case when k.candidatas = 0 then 'sin_candidata'
              when k.candidatas = 1 and k.notas_por_factura = 1 then 'unica'
              else 'ambigua' end
  from conteo k
  left join candidatas c on c.id_nota = k.id_nota
  where not exists (select 1 from manuales m where m.id_nota = k.id_nota)
)
select
  f.id_nota,
  n.punto_venta                     as nota_punto_venta,
  n.numero                          as nota_numero,
  n.fecha_emision                   as nota_fecha,
  n.cuit_receptor,
  n.receptor_nombre,
  n.total,
  f.id_factura,
  fa.punto_venta                    as factura_punto_venta,
  fa.numero                         as factura_numero,
  fa.fecha_emision                  as factura_fecha,
  k.candidatas,
  f.estado
from filas f
join notas n        on n.id_comprobante = f.id_nota
join conteo k       on k.id_nota = f.id_nota
left join comprobante fa on fa.id_comprobante = f.id_factura;

comment on view vw_nc_candidatas is
  'Cada nota de crédito con la factura que toca. estado: confirmada (la vinculó una persona), '
  'unica (una sola candidata por emisor, receptor y total: se toma como vinculada), ambigua '
  '(más de una: decide una persona) o sin_candidata. Las únicas no se escriben: se derivan (P9).';

revoke all on vw_nc_candidatas from anon;

commit;
