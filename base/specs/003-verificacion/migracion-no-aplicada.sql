-- Feature 003 · T301 — Código de verificación del presupuesto impreso.
--
-- Spec: specs/003-verificacion/spec.md (RF-201 a RF-206) · Plan: D1 a D8
--
-- El presupuesto sale impreso del taller y deja de estar bajo su control. Este código es el dato que
-- un falsificador no puede inventar: no se deriva de nada, así que sólo existe si la base lo generó.
-- No impide falsificar —nada impreso es infalsificable— pero hace que un falso se detecte en una
-- consulta.

create extension if not exists pgcrypto;

-- D4: gen_random_bytes y no random(). random() es predecible: viendo unos cuantos códigos se pueden
-- anticipar los siguientes, que es justo el ataque a frenar.
-- D3: hexadecimal en mayúscula. Su alfabeto no tiene ninguna letra confundible con un dígito —no hay
-- O contra 0, ni I ni L contra 1— así que se puede dictar por teléfono sin equivocarse. Codificar
-- 4 bytes en hexadecimal es exacto, sin sesgo: los 4.294.967.296 códigos son igual de probables.
create or replace function fn_generar_codigo_verificacion()
returns text
language sql
volatile
as $$
  select upper(encode(gen_random_bytes(2), 'hex')) || '-' ||
         upper(encode(gen_random_bytes(2), 'hex'))
$$;

comment on function fn_generar_codigo_verificacion() is
  'Devuelve un código aleatorio con formato AAAA-BBBB en hexadecimal mayúscula (RF-202). VOLATILE a '
  'propósito: cada llamada da un valor distinto. Se usa como default de trabajos.codigo_verificacion; '
  'no se llama desde la aplicación.';

-- RF-201: un presupuesto sin código no puede existir. El default lo pone la base, así que la
-- aplicación no necesita —ni debería— enviarlo (D6).
alter table trabajos
  add column if not exists codigo_verificacion text not null
    default fn_generar_codigo_verificacion();

-- D3/principio IV: CHECK sobre un dominio cerrado, no para forzar un proceso.
alter table trabajos
  drop constraint if exists trabajos_codigo_verificacion_formato;
alter table trabajos
  add constraint trabajos_codigo_verificacion_formato
    check (codigo_verificacion ~ '^[0-9A-F]{4}-[0-9A-F]{4}$');

comment on column trabajos.codigo_verificacion is
  'Código impreso en el presupuesto para poder verificarlo después (RF-201). Aleatorio, no derivado '
  'de los datos: si se calculara a partir del número y el total, cualquiera con la fórmula podría '
  'fabricar uno válido (RF-202). No cambia nunca una vez asignado — reeditar el presupuesto conserva '
  'el código, porque el papel ya entregado tiene que seguir verificando (RF-203).';

-- D7 · RF-204: la vista lo expone para poder reimprimir el presupuesto igual que la primera vez.
-- Se agrega al final; CREATE OR REPLACE VIEW no permite tocar las columnas que ya estaban.
create or replace view vw_presupuestos
with (security_invoker = true)
as
select
  t.id_trabajo,
  t.numero_presupuesto,
  t.fecha_presupuesto,
  t.id_cliente,
  c.nombre                                          as cliente_actual,
  t.txt_cliente,
  t.id_vehiculo,
  v.patente_norm,
  t.txt_vehiculo,
  coalesce(i.subtotal_conceptos, 0)::numeric(12, 2) as subtotal_conceptos,
  t.monto_mano_obra,
  (coalesce(i.subtotal_conceptos, 0) + t.monto_mano_obra)::numeric(12, 2) as monto_total,
  coalesce(i.cantidad_conceptos, 0)                 as cantidad_conceptos,
  t.no_concretado,
  t.origen,
  t.creado_en,
  t.modificado_en,
  fn_normalizar_nombre(c.nombre)                    as cliente_norm,
  t.codigo_verificacion
from trabajos t
left join clientes  c on c.id_cliente  = t.id_cliente
left join vehiculos v on v.id_vehiculo = t.id_vehiculo
left join (
  select id_trabajo, sum(importe) as subtotal_conceptos, count(*) as cantidad_conceptos
  from trabajo_items
  group by id_trabajo
) i on i.id_trabajo = t.id_trabajo;

comment on column vw_presupuestos.codigo_verificacion is
  'El código impreso en el papel. Verificar es comparar este valor y el monto contra lo que dice el '
  'documento (RF-205). Ver la consulta en specs/003-verificacion/plan.md, D8.';

-- RF-206: anon sigue sin poder leer nada. Se repite el revoke por si la vista se recreó con otros
-- permisos por defecto (el plan del 001 lo marca como riesgo a revisar en cada migración).
revoke all on vw_presupuestos from anon;
grant select on vw_presupuestos to authenticated;

-- La función no la llama la aplicación: el default la ejecuta con los privilegios de quien inserta.
revoke all on function fn_generar_codigo_verificacion() from public, anon;
grant execute on function fn_generar_codigo_verificacion() to authenticated;
