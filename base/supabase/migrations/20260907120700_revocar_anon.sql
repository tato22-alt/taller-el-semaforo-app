-- Bloque B · T008 — Revocación de permisos al rol anónimo sobre las cuatro tablas.
--
-- Spec: alcance v3.0.0 de la constitución (políticas de acceso) · Plan: D8
--
-- T007 ya bloquea a anon por RLS: sin política que lo permita, no lee ni escribe una
-- fila. Este REVOKE es defensa en profundidad — si alguna vez RLS se desactivara por
-- error en una tabla, sin privilegios de tabla anon sigue sin poder tocar nada.
--
-- Supabase le otorga a anon y a authenticated privilegios sobre las tablas nuevas del
-- esquema public por defecto, al crearlas. Este REVOKE deshace eso para las cuatro
-- tablas de este feature.

revoke all on clientes      from anon;
revoke all on vehiculos     from anon;
revoke all on trabajos      from anon;
revoke all on trabajo_items from anon;

-- Las secuencias detrás de las columnas IDENTITY tampoco las necesita anon: no escribe
-- ninguna fila, así que no necesita avanzar ningún contador.
revoke all on all sequences in schema public from anon;

-- NOTA PARA MIGRACIONES FUTURAS: acá no se toca ninguna vista porque todavía no existe
-- ninguna — vw_presupuestos llega en T009 (bloque C). Cuando se cree, esa misma
-- migración tiene que revocarle a anon los privilegios sobre la vista explícitamente;
-- esto de acá no la cubre retroactivamente. El plan lo marca como riesgo abierto
-- ("conviene verificarlo en cada migración").
