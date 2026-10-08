-- Verificación de M4 (vistas del libro de ARCA). Se pega en el SQL Editor DESPUÉS de aplicar la migración.
--
-- No cambia nada: los comprobantes de prueba se deshacen solos. Devuelve UNA tabla, con una fila
-- por chequeo y "ok" o "FALLA". Si alguna dice FALLA, no se sigue.

drop table if exists qa_m4;
create temp table qa_m4 (orden int, chequeo text, valor text, resultado text);

-- 1. Estructura y seguridad.
insert into qa_m4
select 1, 'existen las 2 vistas, con security_invoker', count(*)::text || ' de 2',
       case when count(*) = 2 then 'ok' else 'FALLA' end
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v'
  and c.relname in ('vw_arqueo_arca', 'vw_nc_candidatas')
  and 'security_invoker=true' = any (coalesce(c.reloptions, '{}'))
union all
select 2, 'anon no tiene ningún privilegio sobre las 2', count(*)::text || ' con privilegios',
       case when count(*) = 0 then 'ok' else 'FALLA' end
from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public'
  and table_name in ('vw_arqueo_arca', 'vw_nc_candidatas');

-- 2. Comportamiento, con comprobantes inventados de un emisor inventado.
do $$
declare
  imp integer;
  f1 integer; f2 integer; f3 integer; f4 integer; f5 integer;
  n1 integer; n2 integer; n3 integer; n4 integer; n5 integer; n6 integer;
  e_unica text; d_unica integer; e_sin text; e_amb text; e_comp4 text; e_comp5 text; e_conf text; d_conf integer;
  filas_conf bigint;
  neto_mes numeric; cant_fact bigint;
  persona_ve bigint; robot_ve bigint; robot_ve_nc bigint;
  E constant text := '20000000001';
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000001","app_metadata":{"rol":"persona"}}', true);
  select count(*) into persona_ve from vw_arqueo_arca;

  begin
    insert into importacion (fuente, archivo_nombre, archivo_hash, filas_leidas)
    values ('arca', 'zzqa-m4.csv', repeat('d', 64), 11) returning id_importacion into imp;

    -- Facturas (tipo 1) y notas de crédito (tipo 3), todas de enero de 2020 para no mezclarse.
    insert into comprobante (cuit_emisor, tipo_codigo, punto_venta, numero, fecha_emision, cuit_receptor, moneda, neto_gravado, iva, total, id_importacion)
    values (E, 1, 9, 1, '2020-01-05', '30000000101', 'PES', 0, 0, 1000, imp) returning id_comprobante into f1;
    insert into comprobante (cuit_emisor, tipo_codigo, punto_venta, numero, fecha_emision, cuit_receptor, moneda, neto_gravado, iva, total, id_importacion)
    values (E, 1, 9, 2, '2020-01-05', '30000000101', 'PES', 0, 0, 500, imp) returning id_comprobante into f2;
    insert into comprobante (cuit_emisor, tipo_codigo, punto_venta, numero, fecha_emision, cuit_receptor, moneda, neto_gravado, iva, total, id_importacion)
    values (E, 1, 9, 3, '2020-01-05', '30000000303', 'PES', 0, 0, 300, imp) returning id_comprobante into f3;
    insert into comprobante (cuit_emisor, tipo_codigo, punto_venta, numero, fecha_emision, cuit_receptor, moneda, neto_gravado, iva, total, id_importacion)
    values (E, 1, 9, 4, '2020-01-06', '30000000303', 'PES', 0, 0, 300, imp) returning id_comprobante into f4;
    insert into comprobante (cuit_emisor, tipo_codigo, punto_venta, numero, fecha_emision, cuit_receptor, moneda, neto_gravado, iva, total, id_importacion)
    values (E, 1, 9, 5, '2020-01-07', '30000000404', 'PES', 0, 0, 200, imp) returning id_comprobante into f5;

    -- n1: única candidata (f1). n2: ninguna. n3: dos candidatas (f3, f4).
    -- n4 y n5: la misma única factura (f5) para las dos: ambiguas. n6: vinculada a mano a f2.
    insert into comprobante (cuit_emisor, tipo_codigo, punto_venta, numero, fecha_emision, cuit_receptor, moneda, neto_gravado, iva, total, id_importacion)
    values (E, 3, 9, 1, '2020-01-20', '30000000101', 'PES', 0, 0, 1000, imp) returning id_comprobante into n1;
    insert into comprobante (cuit_emisor, tipo_codigo, punto_venta, numero, fecha_emision, cuit_receptor, moneda, neto_gravado, iva, total, id_importacion)
    values (E, 3, 9, 2, '2020-01-20', '30000000202', 'PES', 0, 0, 700, imp) returning id_comprobante into n2;
    insert into comprobante (cuit_emisor, tipo_codigo, punto_venta, numero, fecha_emision, cuit_receptor, moneda, neto_gravado, iva, total, id_importacion)
    values (E, 3, 9, 3, '2020-01-20', '30000000303', 'PES', 0, 0, 300, imp) returning id_comprobante into n3;
    insert into comprobante (cuit_emisor, tipo_codigo, punto_venta, numero, fecha_emision, cuit_receptor, moneda, neto_gravado, iva, total, id_importacion)
    values (E, 3, 9, 4, '2020-01-20', '30000000404', 'PES', 0, 0, 200, imp) returning id_comprobante into n4;
    insert into comprobante (cuit_emisor, tipo_codigo, punto_venta, numero, fecha_emision, cuit_receptor, moneda, neto_gravado, iva, total, id_importacion)
    values (E, 3, 9, 5, '2020-01-21', '30000000404', 'PES', 0, 0, 200, imp) returning id_comprobante into n5;
    insert into comprobante (cuit_emisor, tipo_codigo, punto_venta, numero, fecha_emision, cuit_receptor, moneda, neto_gravado, iva, total, id_importacion)
    values (E, 3, 9, 6, '2020-01-22', '30000000101', 'PES', 0, 0, 500, imp) returning id_comprobante into n6;
    insert into comprobante_vinculo (id_origen, id_destino, motivo) values (n6, f2, 'anula');

    select estado, id_factura into e_unica, d_unica from vw_nc_candidatas where id_nota = n1;
    select estado into e_sin from vw_nc_candidatas where id_nota = n2 limit 1;
    select string_agg(distinct estado, ',') into e_amb from vw_nc_candidatas where id_nota = n3;
    select estado into e_comp4 from vw_nc_candidatas where id_nota = n4;
    select estado into e_comp5 from vw_nc_candidatas where id_nota = n5;
    select estado, id_factura into e_conf, d_conf from vw_nc_candidatas where id_nota = n6;
    select count(*) into filas_conf from vw_nc_candidatas where id_nota = n6;

    select sum(total_con_signo) into neto_mes from vw_arqueo_arca where cuit_emisor = E and mes = '2020-01';
    select cantidad into cant_fact from vw_arqueo_arca where cuit_emisor = E and mes = '2020-01' and tipo_codigo = 1;

    raise exception 'deshacer';
  exception when others then
    if sqlerrm <> 'deshacer' then e_unica := 'error: ' || sqlerrm; end if;
  end;

  perform set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"rol":"robot"}}', true);
  select count(*) into robot_ve from vw_arqueo_arca;
  select count(*) into robot_ve_nc from vw_nc_candidatas;

  reset role;
  perform set_config('request.jwt.claims', '', true);

  insert into qa_m4 values
    (3,  'NC con una sola candidata: unica, a esa factura', coalesce(e_unica, '-'),
         case when e_unica = 'unica' and d_unica = f1 then 'ok' else 'FALLA' end),
    (4,  'NC sin candidata: sin_candidata', coalesce(e_sin, '-'), case when e_sin = 'sin_candidata' then 'ok' else 'FALLA' end),
    (5,  'NC con dos candidatas: ambigua', coalesce(e_amb, '-'), case when e_amb = 'ambigua' then 'ok' else 'FALLA' end),
    (6,  'dos NC con la misma única factura: ambiguas', coalesce(e_comp4, '-') || ' / ' || coalesce(e_comp5, '-'),
         case when e_comp4 = 'ambigua' and e_comp5 = 'ambigua' then 'ok' else 'FALLA' end),
    (7,  'NC vinculada a mano: confirmada, y sólo esa fila', coalesce(e_conf, '-') || ' (' || coalesce(filas_conf, 0) || ' fila)',
         case when e_conf = 'confirmada' and d_conf = f2 and filas_conf = 1 then 'ok' else 'FALLA' end),
    (8,  'arqueo: facturado neto del mes resta las NC', coalesce(neto_mes::text, '-'),
         -- 1000 + 500 + 300 + 300 + 200 de facturas, menos 1000 + 700 + 300 + 200 + 200 + 500 de NC
         case when neto_mes = -600 then 'ok' else 'FALLA' end),
    (9,  'arqueo: cuenta las facturas del mes', coalesce(cant_fact::text, '-'), case when cant_fact = 5 then 'ok' else 'FALLA' end),
    (10, 'una persona ve el arqueo de los comprobantes reales', persona_ve::text || ' filas',
         case when persona_ve > 0 then 'ok' else 'FALLA' end),
    (11, 'el robot no ve el arqueo', robot_ve::text, case when robot_ve = 0 then 'ok' else 'FALLA' end),
    (12, 'el robot no ve las notas de crédito', robot_ve_nc::text, case when robot_ve_nc = 0 then 'ok' else 'FALLA' end);
end $$;

insert into qa_m4
select 13, 'no quedaron comprobantes de prueba', count(*)::text, case when count(*) = 0 then 'ok' else 'FALLA' end
from comprobante where cuit_emisor = '20000000001';

select orden as "#", chequeo, valor, resultado from qa_m4 order by orden;
