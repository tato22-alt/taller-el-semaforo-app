-- Cobranzas · fase 1 · M1 — Roles: persona y robot.
--
-- Spec: specs/005-cobranzas/spec.md §3 (el robot inserta evidencia y nada más)
-- Plan: specs/005-cobranzas/plan.md, D2 · Hallazgos: H6, y H1 como segunda capa
--
-- Hasta acá, toda sesión autenticada tenía acceso total a las cuatro tablas
-- (usuario_autenticado_acceso_total). Alcanzaba mientras las únicas cuentas eran las tres
-- personas del taller. Cobranzas suma un usuario robot que tiene que poder insertar evidencia
-- y nada más; con la política de hoy heredaría acceso total a clientes, trabajos y renglones.
--
-- El rol vive en app_metadata, que el usuario no puede editar: sólo el panel o SQL con
-- privilegios. Las políticas de acá son RESTRICTIVAS: se suman con AND a la permisiva que ya
-- existe. Para las tres personas no cambia nada; una sesión sin rol, o con rol robot, no ve
-- ni escribe una sola fila de presupuesto. Una cuenta creada si el registro se volviera a
-- abrir por error tampoco tendría rol: es la segunda capa detrás de H1, no la primera.
--
-- PRERREQUISITO, hecho el 2026-10-08: cada usuario de auth.users con app_metadata.rol puesto.
-- Si falta en alguno, esta migración aborta sin cambiar nada: aplicarla igual dejaría a esa
-- persona afuera de su propio presupuesto.
--
-- OJO al aplicarla: el rol viaja en el token de sesión, y un token emitido antes de poner el
-- rol no lo trae. Se aplica cuando ya pasó una hora desde que se puso el rol (los tokens se
-- renuevan solos), o después de que cada persona cerró sesión y volvió a entrar.
--
-- APLICADA el 2026-10-08. Verificación: specs/005-cobranzas/qa-m1-roles.sql, 12 de 12 ok.

begin;

do $$
declare
  sin_rol integer;
begin
  select count(*) into sin_rol
  from auth.users
  where coalesce(raw_app_meta_data ->> 'rol', '') = '';

  if sin_rol > 0 then
    raise exception 'M1 abortada: % usuario(s) sin app_metadata.rol. No se cambió nada.', sin_rol;
  end if;
end $$;

-- El rol de quien consulta, leído del token. Nulo si no hay sesión o si el token no trae rol.
create function fn_rol() returns text
language sql
stable
set search_path = public, extensions, pg_catalog
as $$ select auth.jwt() -> 'app_metadata' ->> 'rol' $$;

comment on function fn_rol() is
  'D2 de cobranzas: el rol de la sesión (persona | robot), leído de app_metadata del token. '
  'app_metadata no lo puede editar el usuario. Nulo = sin rol = sin acceso a nada.';

-- Supabase le da EXECUTE a anon y a PUBLIC sobre toda función nueva (H9). Sin sesión no hay
-- rol que leer, así que anon no la necesita.
revoke execute on function fn_rol() from public, anon;
grant execute on function fn_rol() to authenticated;

-- Las cuatro tablas del presupuesto: sólo personas. "(select fn_rol())" y no "fn_rol()" para
-- que Postgres la evalúe una vez por consulta y no una vez por fila.
create policy solo_personas on clientes
  as restrictive for all to authenticated
  using ((select fn_rol()) = 'persona')
  with check ((select fn_rol()) = 'persona');

create policy solo_personas on vehiculos
  as restrictive for all to authenticated
  using ((select fn_rol()) = 'persona')
  with check ((select fn_rol()) = 'persona');

create policy solo_personas on trabajos
  as restrictive for all to authenticated
  using ((select fn_rol()) = 'persona')
  with check ((select fn_rol()) = 'persona');

create policy solo_personas on trabajo_items
  as restrictive for all to authenticated
  using ((select fn_rol()) = 'persona')
  with check ((select fn_rol()) = 'persona');

comment on policy solo_personas on clientes is
  'D2 de cobranzas: restrictiva, se suma con AND a usuario_autenticado_acceso_total. '
  'Sólo una sesión con rol persona lee o escribe. El robot y una sesión sin rol, nada.';

commit;
