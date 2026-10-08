-- Verificación de M2 (datos maestros). Se pega en el SQL Editor DESPUÉS de aplicar la migración.
--
-- No cambia nada: las escrituras de prueba se deshacen solas. Devuelve UNA tabla, con una fila
-- por chequeo y "ok" o "FALLA". Si alguna dice FALLA, no se sigue.

drop table if exists qa_m2;
create temp table qa_m2 (orden int, chequeo text, valor text, resultado text);

-- 1. Estructura y seguridad de las cuatro tablas.
insert into qa_m2
select 1, 'existen las 4 tablas', count(*)::text || ' de 4',
       case when count(*) = 4 then 'ok' else 'FALLA' end
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and c.relname in ('tipo_comprobante', 'compania', 'compania_requisito', 'regla_facturacion')
union all
select 2, 'RLS activada y forzada en las 4', count(*)::text || ' de 4',
       case when count(*) = 4 then 'ok' else 'FALLA' end
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relrowsecurity and c.relforcerowsecurity
  and c.relname in ('tipo_comprobante', 'compania', 'compania_requisito', 'regla_facturacion')
union all
select 3, 'anon no tiene ningún privilegio sobre las 4',
       count(*)::text || ' con privilegios',
       case when count(*) = 0 then 'ok' else 'FALLA' end
from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public'
  and table_name in ('tipo_comprobante', 'compania', 'compania_requisito', 'regla_facturacion')
union all
select 4, 'política persona_acceso_total en las 4', count(*)::text || ' de 4',
       case when count(*) = 4 then 'ok' else 'FALLA' end
from pg_policies
where schemaname = 'public' and policyname = 'persona_acceso_total'
  and tablename in ('tipo_comprobante', 'compania', 'compania_requisito', 'regla_facturacion')
union all
select 5, 'tipos de comprobante cargados', count(*)::text || ' de 9',
       case when count(*) = 9 then 'ok' else 'FALLA' end
from tipo_comprobante
union all
select 6, 'ninguna columna para contraseñas (RF-502)',
       coalesce(string_agg(table_name || '.' || column_name, ', '), 'ninguna'),
       case when count(*) = 0 then 'ok' else 'FALLA' end
from information_schema.columns
where table_schema = 'public'
  and column_name ~* '(password|passwd|contrasena|contraseña|clave|token|secret)';

-- 2. Comportamiento.
do $$
declare
  persona_crea   text := 'no';
  cuit_malo      text := 'no';
  robot_ve       bigint;
  robot_crea     text := 'no';
  sin_rol_ve     bigint;
begin
  set local role authenticated;

  -- Una persona carga una ficha con un requisito y una regla. Se deshace al final.
  perform set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"rol":"persona"}}', true);
  begin
    insert into compania (cuit, nombre, canal, plazo_declarado_dias) values ('20000000001', 'ZZQA Origen', 'portal', 30);
    insert into compania (cuit, nombre) values ('20000000002', 'ZZQA Destino');
    insert into compania_requisito (cuit, descripcion) values ('20000000001', 'Conformidad firmada');
    insert into regla_facturacion (cuit_origen, condicion, cuit_destino) values ('20000000001', 'siniestro_bajo_franquicia', '20000000002');
    persona_crea := 'sí';
    raise exception 'deshacer';
  exception when others then null;
  end;

  -- Un CUIT con guiones no entra: once dígitos, sin guiones.
  begin
    insert into compania (cuit, nombre) values ('20-00000000-3', 'ZZQA Mal');
    raise exception 'deshacer';
  exception
    when check_violation then cuit_malo := 'rechazado';
    when others then null;
  end;

  -- El robot: ni ve ni escribe fichas.
  perform set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"rol":"robot"}}', true);
  select count(*) into robot_ve from tipo_comprobante;
  begin
    insert into compania (cuit, nombre) values ('20000000009', 'ZZQA Robot');
    robot_crea := 'sí';
    raise exception 'deshacer';
  exception when others then null;
  end;

  perform set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{}}', true);
  select count(*) into sin_rol_ve from tipo_comprobante;

  reset role;
  perform set_config('request.jwt.claims', '', true);

  insert into qa_m2 values
    (7,  'una persona carga ficha, requisito y regla', persona_crea, case when persona_crea = 'sí' then 'ok' else 'FALLA' end),
    (8,  'un CUIT con guiones se rechaza', cuit_malo, case when cuit_malo = 'rechazado' then 'ok' else 'FALLA' end),
    (9,  'el robot no ve los tipos de comprobante', robot_ve::text, case when robot_ve = 0 then 'ok' else 'FALLA' end),
    (10, 'el robot no puede crear una ficha', robot_crea, case when robot_crea = 'no' then 'ok' else 'FALLA' end),
    (11, 'una sesión sin rol no ve nada', sin_rol_ve::text, case when sin_rol_ve = 0 then 'ok' else 'FALLA' end);
end $$;

-- 3. Que no haya quedado nada de la prueba.
insert into qa_m2
select 12, 'no quedaron fichas de prueba', count(*)::text,
       case when count(*) = 0 then 'ok' else 'FALLA' end
from compania where nombre like 'ZZQA%';

select orden as "#", chequeo, valor, resultado from qa_m2 order by orden;
