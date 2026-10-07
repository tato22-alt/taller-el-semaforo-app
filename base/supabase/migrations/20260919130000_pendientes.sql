-- Feature 006 · Presupuestos pendientes: un trabajo todavía sin número.
--
-- Spec: specs/006-pendientes/spec.md (RF-501 a RF-508) · Enmienda: RF-023 / H5
--
-- El presupuesto se arma en dos momentos: se toma el auto y se anota todo, y se frena esperando
-- el precio de un repuesto o el auto desarmado para poner la mano de obra. Eso ahora se guarda.
--
-- NO HAY COLUMNAS NUEVAS. numero_presupuesto ya admite nulo desde la primera migración —"no todo
-- trabajo nace de un presupuesto emitido (D1)"—, monto_mano_obra acepta cero, y el índice único es
-- parcial sobre los no nulos, así que pueden convivir muchos pendientes. Un pendiente es un
-- trabajo cuyo número es nulo: estado derivado, no almacenado (principios I y II).
--
-- Lo único que cambia acá es quién puede borrar.

-- ---------------------------------------------------------------------------------------------
-- Enmienda a H5 / RF-023.
--
-- H5 revocó el delete sobre trabajos con este razonamiento: "como ninguna fila desaparece, ningún
-- número vuelve a quedar libre". Ese razonamiento sostiene RF-020 y sigue en pie — pero sólo
-- describe a las filas CON número. Una fila sin número no sostiene nada: no hay número que pueda
-- volver a quedar libre, porque nunca se emitió ninguno.
--
-- Así que el delete vuelve, acotado por la base y no por la página (RF-507). Que un presupuesto
-- emitido no se pierda no puede depender de que el navegador se porte bien.

grant delete on trabajos to authenticated;

-- Restrictiva a propósito: las restrictivas se combinan con AND. La permisiva que ya existe
-- (usuario_autenticado_acceso_total, for all using true) sigue habilitando todo lo demás, y ésta
-- le pone el único límite que importa. Si mañana se agrega otra permisiva, el límite sigue puesto.
drop policy if exists trabajos_borrar_solo_sin_numero on trabajos;
create policy trabajos_borrar_solo_sin_numero on trabajos
  as restrictive
  for delete
  to authenticated
  using (numero_presupuesto is null);

comment on policy trabajos_borrar_solo_sin_numero on trabajos is
  'RF-507/RF-508: sólo se borra un trabajo sin número —un pendiente que no llegó a emitirse—. '
  'Un presupuesto emitido no se borra nunca (RF-023): de que ninguna fila numerada desaparezca '
  'depende que un número emitido no se reutilice (RF-020, H5).';

-- Los renglones se van solos: trabajo_items referencia a trabajos con on delete cascade.

comment on table trabajos is
  'El expediente: nace del presupuesto (RF-003), identificado por numero_presupuesto. '
  'Clave primaria subrogada (D1): el número de talonario es el identificador de negocio, '
  'pero no la PK, para no impedir un trabajo que llegue sin presupuesto previo. '
  'Sin número es un PENDIENTE (RF-501, feature 006): se está armando y todavía no se emitió. '
  'Un trabajo YA NUMERADO no se borra (RF-023, D9): es un registro histórico, y de eso depende '
  'que un número emitido nunca se reutilice (RF-020). Corregir es UPDATE; descartar es '
  'no_concretado. Un pendiente sí se borra (RF-507): no hay número que perder.';
