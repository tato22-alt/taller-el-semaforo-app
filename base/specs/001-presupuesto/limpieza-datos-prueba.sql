-- Limpieza de los datos de prueba — cierra H9.
--
-- Deja las cuatro tablas vacías y los contadores de id en cero, para que la primera carga
-- real sea la fila 1. No toca el esquema: tablas, vistas, funciones, RLS, políticas y
-- permisos quedan como están.
--
-- CUÁNDO: una sola vez, y ÚLTIMO. Después de esto no se vuelve a correr: borraría datos de
-- verdad.
--
-- IMPORTANTE — correrlo DESPUÉS del QA, no antes. fn_qa_001_presupuesto() crea y borra sus
-- propias filas, y aunque las borre, cada insert consume un número de la secuencia de ids.
-- Si se corre el QA después de esta limpieza, el primer cliente real no va a ser el id 1
-- sino el 8. Verificado: limpiando último, la primera carga real es id 1.
--
-- POR QUÉ TRUNCATE Y NO DELETE: reinicia los contadores de identidad. Con DELETE, el
-- próximo cliente sería el id 6 y el próximo trabajo el id 2, arrastrando los huecos que
-- dejaron las pruebas.
--
-- OJO CON EL 16043: era un presupuesto de prueba, no uno real. Se va con esto, y con él se
-- libera el número. Es la única vez que un número emitido vuelve atrás, y se puede porque
-- todavía no hay nada real: de acá en adelante rige RF-023 y los trabajos no se borran.
-- La aplicación ya no puede hacer esto: authenticated no tiene DELETE sobre trabajos (D9).
-- Esto corre desde el panel, como postgres.

truncate table trabajo_items, trabajos, vehiculos, clientes restart identity;

-- Verificación: las cuatro en cero, y el esquema intacto.
select
  (select count(*) from clientes)      as clientes,
  (select count(*) from vehiculos)     as vehiculos,
  (select count(*) from trabajos)      as trabajos,
  (select count(*) from trabajo_items) as trabajo_items,
  (select count(*) from pg_class
    where relnamespace = 'public'::regnamespace
      and relname in ('clientes','vehiculos','trabajos','trabajo_items')
      and relrowsecurity)              as tablas_con_rls;
