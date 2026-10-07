-- Enmienda H5 / D9 — Un presupuesto no se borra: es un registro histórico.
--
-- Spec: RF-023 (nuevo), RF-020 · Plan: D9 · Hallazgos: H5
--
-- Si está mal, se corrige y conserva su número (RF-016). Si no se concretó, se marca
-- (RF-015). Con esto RF-020 —un número emitido no se reutiliza nunca— se sostiene solo:
-- el índice único impide dos filas con el mismo número, y como ninguna fila desaparece,
-- ningún número vuelve a quedar libre. Sin tabla de números emitidos.
--
-- No contradice el principio IV: ese principio prohíbe que el esquema impida REGISTRAR un
-- hecho que ocurrió. Acá se impide BORRAR uno ya registrado, que es lo contrario.

revoke delete on trabajos from authenticated;

comment on table trabajos is
  'El expediente: nace del presupuesto (RF-003), identificado por numero_presupuesto. '
  'Clave primaria subrogada (D1): el número de talonario es el identificador de negocio, '
  'pero no la PK, para no impedir un trabajo que llegue sin presupuesto previo. '
  'NO SE BORRA (RF-023, D9): es un registro histórico, y de eso depende que un número '
  'emitido nunca se reutilice (RF-020). Corregir es UPDATE; descartar es no_concretado.';

-- trabajo_items SÍ se puede borrar: corregir la lista de conceptos es parte de RF-016, y
-- la importación los reemplaza por completo. No se toca su permiso.
