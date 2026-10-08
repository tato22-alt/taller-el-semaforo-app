-- Verificación de M3 (el libro de ARCA). Se pega en el SQL Editor DESPUÉS de aplicar la migración.
--
-- No cambia nada: las escrituras de prueba se deshacen solas. Devuelve UNA tabla, con una fila
-- por chequeo y "ok" o "FALLA". Si alguna dice FALLA, no se sigue.

drop table if exists qa_m3;
create temp table qa_m3 (orden int, chequeo text, valor text, resultado text);

-- 1. Estructura y seguridad.
insert into qa_m3
select 1, 'existen las 3 tablas', count(*)::text || ' de 3',
       case when count(*) = 3 then 'ok' else 'FALLA' end
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and c.relname in ('importacion', 'comprobante', 'comprobante_vinculo')
union all
select 2, 'RLS activada y forzada en las 3', count(*)::text || ' de 3',
       case when count(*) = 3 then 'ok' else 'FALLA' end
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relrowsecurity and c.relforcerowsecurity
  and c.relname in ('importacion', 'comprobante', 'comprobante_vinculo')
union all
select 3, 'anon no tiene ningún privilegio sobre las 3', count(*)::text || ' con privilegios',
       case when count(*) = 0 then 'ok' else 'FALLA' end
from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public'
  and table_name in ('importacion', 'comprobante', 'comprobante_vinculo')
union all
select 4, 'política persona_acceso_total en las 3', count(*)::text || ' de 3',
       case when count(*) = 3 then 'ok' else 'FALLA' end
from pg_policies
where schemaname = 'public' and policyname = 'persona_acceso_total'
  and tablename in ('importacion', 'comprobante', 'comprobante_vinculo')
union all
select 5, 'la clave incluye el CUIT emisor (D3)',
       coalesce(max(pg_get_constraintdef(oid)), 'no existe'),
       case when max(pg_get_constraintdef(oid)) = 'UNIQUE (cuit_emisor, tipo_codigo, punto_venta, numero)'
            then 'ok' else 'FALLA' end
from pg_constraint where conname = 'comprobante_clave_arca';

-- 2. Comportamiento, como una persona importando.
do $$
declare
  imp             integer;
  importa         text := 'no';
  reimporta       text := 'no';
  otro_emisor     text := 'no';
  tipo_raro       text := 'no';
  vincula         text := 'no';
  nuevas_primera  bigint;
  robot_ve        bigint;
  robot_escribe   text := 'no';
  sin_rol_ve      bigint;
  fac integer; nc integer; nd integer;
begin
  set local role authenticated;
  -- Una sesión real trae el id del usuario ("sub"): con él se firma quién confirmó un vínculo.
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000001","app_metadata":{"rol":"persona"}}', true);

  begin
    -- Primera importación: una factura, una NC y una ND de un CUIT de prueba.
    insert into importacion (fuente, archivo_nombre, archivo_hash, filas_leidas)
    values ('arca', 'zzqa.csv', repeat('a', 64), 3) returning id_importacion into imp;

    insert into comprobante (cuit_emisor, tipo_codigo, punto_venta, numero, fecha_emision,
                             cuit_receptor, receptor_nombre, moneda, neto_gravado, iva, total, id_importacion)
    values ('20000000001', 1, 2, 999001, '2025-01-15', '20000000002', 'ZZQA Compañía', 'PES', 1000, 210, 1210, imp)
    returning id_comprobante into fac;
    insert into comprobante (cuit_emisor, tipo_codigo, punto_venta, numero, fecha_emision,
                             cuit_receptor, receptor_nombre, moneda, neto_gravado, iva, total, id_importacion)
    values ('20000000001', 3, 2, 999001, '2025-02-01', '20000000002', 'ZZQA Compañía', 'PES', 1000, 210, 1210, imp)
    returning id_comprobante into nc;
    insert into comprobante (cuit_emisor, tipo_codigo, punto_venta, numero, fecha_emision,
                             cuit_receptor, receptor_nombre, moneda, neto_gravado, iva, total, id_importacion)
    values ('20000000001', 2, 2, 999001, '2025-03-01', '20000000002', 'ZZQA Compañía', 'PES', 1000, 210, 1210, imp)
    returning id_comprobante into nd;
    importa := 'sí';

    select count(*) into nuevas_primera from comprobante where id_importacion = imp;

    -- Reimportar la misma factura: se saltea, no se duplica.
    insert into comprobante (cuit_emisor, tipo_codigo, punto_venta, numero, fecha_emision,
                             moneda, neto_gravado, iva, total, id_importacion)
    values ('20000000001', 1, 2, 999001, '2025-01-15', 'PES', 1000, 210, 1210, imp)
    on conflict (cuit_emisor, tipo_codigo, punto_venta, numero) do nothing;
    if (select count(*) from comprobante where cuit_emisor = '20000000001' and tipo_codigo = 1) = 1 then
      reimporta := '0 nuevas';
    end if;

    -- El mismo número de otro CUIT emisor es otro comprobante (N1).
    insert into comprobante (cuit_emisor, tipo_codigo, punto_venta, numero, fecha_emision,
                             moneda, neto_gravado, iva, total, id_importacion)
    values ('20000000003', 1, 2, 999001, '2025-01-15', 'PES', 500, 105, 605, imp);
    otro_emisor := 'entra';

    -- Vínculos decididos por una persona: la NC anula la factura; la ND revierte la NC.
    insert into comprobante_vinculo (id_origen, id_destino, motivo) values (nc, fac, 'anula');
    insert into comprobante_vinculo (id_origen, id_destino, motivo) values (nd, nc, 'revierte_nc');
    vincula := 'sí';

    raise exception 'deshacer';
  exception when others then
    if sqlerrm <> 'deshacer' then
      importa := importa || ' (' || sqlerrm || ')';
    end if;
  end;

  -- Un tipo de comprobante que ARCA no tiene se rechaza.
  begin
    insert into importacion (fuente, archivo_nombre, archivo_hash, filas_leidas)
    values ('arca', 'zzqa2.csv', repeat('b', 64), 1) returning id_importacion into imp;
    insert into comprobante (cuit_emisor, tipo_codigo, punto_venta, numero, fecha_emision,
                             moneda, neto_gravado, iva, total, id_importacion)
    values ('20000000001', 999, 2, 1, '2025-01-15', 'PES', 1, 0, 1, imp);
    raise exception 'deshacer';
  exception
    when foreign_key_violation then tipo_raro := 'rechazado';
    when others then null;
  end;

  -- El robot: ni ve ni escribe.
  perform set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"rol":"robot"}}', true);
  select count(*) into robot_ve from comprobante;
  begin
    insert into importacion (fuente, archivo_nombre, archivo_hash, filas_leidas)
    values ('arca', 'zzqa-robot.csv', repeat('c', 64), 0);
    robot_escribe := 'sí';
    raise exception 'deshacer';
  exception when others then null;
  end;

  perform set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{}}', true);
  select count(*) into sin_rol_ve from importacion;

  reset role;
  perform set_config('request.jwt.claims', '', true);

  insert into qa_m3 values
    (6,  'una persona importa factura, NC y ND', importa, case when importa = 'sí' then 'ok' else 'FALLA' end),
    (7,  'las nuevas se cuentan, no se guardan', coalesce(nuevas_primera::text, '-'), case when nuevas_primera = 3 then 'ok' else 'FALLA' end),
    (8,  'reimportar la misma factura no duplica', reimporta, case when reimporta = '0 nuevas' then 'ok' else 'FALLA' end),
    (9,  'mismo número, otro CUIT emisor, entra', otro_emisor, case when otro_emisor = 'entra' then 'ok' else 'FALLA' end),
    (10, 'NC anula factura y ND revierte NC', vincula, case when vincula = 'sí' then 'ok' else 'FALLA' end),
    (11, 'un tipo de comprobante inexistente se rechaza', tipo_raro, case when tipo_raro = 'rechazado' then 'ok' else 'FALLA' end),
    (12, 'el robot no ve comprobantes', robot_ve::text, case when robot_ve = 0 then 'ok' else 'FALLA' end),
    (13, 'el robot no puede importar', robot_escribe, case when robot_escribe = 'no' then 'ok' else 'FALLA' end),
    (14, 'una sesión sin rol no ve nada', sin_rol_ve::text, case when sin_rol_ve = 0 then 'ok' else 'FALLA' end);
end $$;

-- 3. Que no haya quedado nada de la prueba.
insert into qa_m3
select 15, 'no quedaron datos de prueba',
       ((select count(*) from importacion where archivo_nombre like 'zzqa%')
        + (select count(*) from comprobante where cuit_emisor in ('20000000001', '20000000003')))::text,
       case when (select count(*) from importacion where archivo_nombre like 'zzqa%')
               + (select count(*) from comprobante where cuit_emisor in ('20000000001', '20000000003')) = 0
            then 'ok' else 'FALLA' end;

select orden as "#", chequeo, valor, resultado from qa_m3 order by orden;
