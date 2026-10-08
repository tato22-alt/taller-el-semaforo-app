-- Verificación de M1 (roles). Se pega en el SQL Editor DESPUÉS de aplicar la migración.
--
-- No cambia nada: las pruebas de escritura se deshacen solas. Devuelve UNA tabla, con una
-- fila por chequeo y "ok" o "FALLA" en la última columna. Si alguna dice FALLA, no se sigue.
--
-- Las pruebas de comportamiento se hacen poniéndose en el lugar de una sesión real: rol
-- authenticated y un token con app_metadata.rol = persona, robot, o sin rol.

drop table if exists qa_m1;
create temp table qa_m1 (orden int, chequeo text, valor text, resultado text);

-- 1. Estructura.
insert into qa_m1
select 1, 'existe fn_rol()', '', case when to_regprocedure('public.fn_rol()') is not null then 'ok' else 'FALLA' end
union all
select 2, 'anon no puede ejecutar fn_rol()', '',
       case when to_regprocedure('public.fn_rol()') is null then 'FALLA'
            when not has_function_privilege('anon', 'public.fn_rol()', 'execute') then 'ok' else 'FALLA' end
union all
select 3, 'authenticated sí puede ejecutar fn_rol()', '',
       case when to_regprocedure('public.fn_rol()') is null then 'FALLA'
            when has_function_privilege('authenticated', 'public.fn_rol()', 'execute') then 'ok' else 'FALLA' end
union all
select 4, 'política solo_personas, restrictiva, en las 4 tablas',
       count(*)::text || ' de 4',
       case when count(*) = 4 then 'ok' else 'FALLA' end
from pg_policies
where schemaname = 'public' and policyname = 'solo_personas' and permissive = 'RESTRICTIVE'
  and tablename in ('clientes', 'vehiculos', 'trabajos', 'trabajo_items')
union all
select 5, 'todos los usuarios tienen rol',
       count(*) filter (where coalesce(raw_app_meta_data ->> 'rol', '') = '')::text || ' sin rol',
       case when count(*) filter (where coalesce(raw_app_meta_data ->> 'rol', '') = '') = 0 then 'ok' else 'FALLA' end
from auth.users;

-- 2. Comportamiento: qué ve y qué puede escribir cada tipo de sesión.
do $$
declare
  total       bigint;
  total_vista bigint;
  ve_persona  bigint;
  ve_vista    bigint;
  ve_robot    bigint;
  ve_sin_rol  bigint;
  escribe_persona text := 'no';
  escribe_robot   text := 'no';
begin
  select count(*) into total from trabajos;
  select count(*) into total_vista from vw_presupuestos;

  set local role authenticated;

  perform set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"rol":"persona"}}', true);
  select count(*) into ve_persona from trabajos;
  select count(*) into ve_vista from vw_presupuestos;
  begin
    insert into clientes (nombre) values ('ZZQA M1 persona');
    escribe_persona := 'sí';
    raise exception 'deshacer';  -- deshace el insert: es sólo una prueba
  exception when others then
    null;
  end;

  perform set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"rol":"robot"}}', true);
  select count(*) into ve_robot from trabajos;
  begin
    insert into clientes (nombre) values ('ZZQA M1 robot');
    escribe_robot := 'sí';
    raise exception 'deshacer';
  exception when others then
    null;
  end;

  perform set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{}}', true);
  select count(*) into ve_sin_rol from trabajos;

  reset role;
  perform set_config('request.jwt.claims', '', true);

  insert into qa_m1 values
    (6,  'hay presupuestos para probar', total::text, case when total > 0 then 'ok' else 'FALLA' end),
    (7,  'una persona ve todos los trabajos', ve_persona || ' de ' || total,
         case when ve_persona = total then 'ok' else 'FALLA' end),
    (8,  'una persona ve todo vw_presupuestos', ve_vista || ' de ' || total_vista,
         case when ve_vista = total_vista then 'ok' else 'FALLA' end),
    (9,  'una persona puede escribir', escribe_persona, case when escribe_persona = 'sí' then 'ok' else 'FALLA' end),
    (10, 'el robot no ve ningún trabajo', ve_robot::text, case when ve_robot = 0 then 'ok' else 'FALLA' end),
    (11, 'el robot no puede escribir', escribe_robot, case when escribe_robot = 'no' then 'ok' else 'FALLA' end),
    (12, 'una sesión sin rol no ve ningún trabajo', ve_sin_rol::text, case when ve_sin_rol = 0 then 'ok' else 'FALLA' end);
end $$;

select orden as "#", chequeo, valor, resultado from qa_m1 order by orden;
