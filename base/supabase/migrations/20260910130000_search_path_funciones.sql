-- Endurecimiento — Fijar el search_path de las funciones.
--
-- Motivo: el linter de Supabase (0011_function_search_path_mutable) marca toda función sin
-- search_path fijo. Sin él, la función resuelve los nombres con el search_path de quien la
-- llama; alguien que pudiera crear un objeto en un esquema que se busque antes que public
-- lograría que la función use SU objeto en lugar del nuestro.
--
-- En esta base el riesgo concreto es bajo —sólo el taller tiene sesión, y anon no puede
-- ejecutar nada— pero el arreglo no tiene contraindicación y saca la advertencia.
--
-- Ya hay precedente: fn_normalizar_nombre lo lleva desde la enmienda H1, y de ella depende
-- la columna generada clientes.nombre_norm sin ningún problema. Se usa el mismo valor para
-- que las siete funciones queden iguales.

alter function fn_normalizar_patente(text)        set search_path = public, extensions, pg_catalog;
alter function fn_es_formato_patente_valido(text) set search_path = public, extensions, pg_catalog;
alter function fn_proximo_numero_presupuesto()    set search_path = public, extensions, pg_catalog;
alter function fn_sincronizar_numeracion()        set search_path = public, extensions, pg_catalog;
