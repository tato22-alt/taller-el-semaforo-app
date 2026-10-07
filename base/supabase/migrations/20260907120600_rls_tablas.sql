-- Bloque B · T007 — RLS en las cuatro tablas, política única de usuario autenticado.
--
-- Spec: alcance v3.0.0 de la constitución (políticas de acceso) · Plan: D8
--
-- La página del presupuesto es pública y su clave publicable (antes "anon") va a ser
-- visible para cualquiera. Eso es correcto sólo si RLS está puesto: sin esto, esa clave
-- alcanza para leer toda la base y para escribir presupuestos falsos. Se habilita desde
-- esta migración, no se difiere.
--
-- Una sola política por tabla, para cualquier sesión autenticada, sin restricción por
-- fila: son tres personas las que cargan, no hacen falta roles ni políticas por usuario
-- todavía (D8). El rol anónimo no tiene ninguna política: sin una que lo permita, RLS
-- deniega por defecto. El revoke explícito de privilegios sobre anon es T008, defensa
-- en profundidad por si RLS se desactivara por error en el futuro.

alter table clientes      enable row level security;
alter table vehiculos     enable row level security;
alter table trabajos      enable row level security;
alter table trabajo_items enable row level security;

-- FORCE aplica RLS también al dueño de la tabla. El rol que corre las migraciones desde
-- el panel (postgres) igual bypassea RLS por tener el atributo BYPASSRLS, así que esto
-- no cambia nada ahí — es para que ningún rol futuro quede exceptuado por ser dueño.
alter table clientes      force row level security;
alter table vehiculos     force row level security;
alter table trabajos      force row level security;
alter table trabajo_items force row level security;

create policy usuario_autenticado_acceso_total on clientes
  for all
  to authenticated
  using (true)
  with check (true);

create policy usuario_autenticado_acceso_total on vehiculos
  for all
  to authenticated
  using (true)
  with check (true);

create policy usuario_autenticado_acceso_total on trabajos
  for all
  to authenticated
  using (true)
  with check (true);

create policy usuario_autenticado_acceso_total on trabajo_items
  for all
  to authenticated
  using (true)
  with check (true);

comment on policy usuario_autenticado_acceso_total on clientes is
  'D8: cualquier sesión autenticada tiene acceso total. Sin políticas por usuario ni rol '
  'todavía — son tres personas de confianza. Nada de esto aplica al rol anon.';
