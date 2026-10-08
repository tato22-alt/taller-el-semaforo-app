-- Cobranzas · fase 1 · M2 — Datos maestros: tipos de comprobante y fichas de compañía.
--
-- Spec: specs/005-cobranzas/spec.md §4.1, R2 (RF-502) · Plan: specs/005-cobranzas/plan.md, D2, D3, D8
--
-- Convierte reglas de negocio por compañía en filas que se editan desde una pantalla, no en
-- código: el día que una compañía cambia de canal se edita su ficha, no se despliega nada.
--
-- Acceso (D2): las cuatro tablas son sólo de personas. El robot no las lee todavía; cuando la
-- fase 2 necesite los remitentes de aviso, se le da lectura a eso con su propia política.
-- Cada tabla nace con RLS activada y forzada y sin privilegios para anon (D8, H9): Supabase le
-- da privilegios a anon sobre toda tabla nueva, así que se revocan acá, en el mismo archivo.
--
-- Lo que NO entra, a propósito:
--   · Ninguna columna de contraseña (R2, RF-502). Del portal se guardan URL y usuario.
--   · retencion_esperada_pct, que la spec lista: sirve a la ventana del banco (A9, fase 5),
--     que está bloqueada por una enmienda, y depende de P8 sin contestar. Principio V: entra
--     cuando haya una decisión que la use.
--
-- APLICADA el 2026-10-08. Verificación: specs/005-cobranzas/qa-m2-maestros.sql, 12 de 12 ok.

begin;

-- ---------------------------------------------------------------------------------------------
-- tipo_comprobante · con el código de ARCA como clave.
-- ---------------------------------------------------------------------------------------------
-- El código es el que trae el CSV de Mis Comprobantes ("1 - Factura A"), así que es la clave
-- natural: importar no necesita traducir nada. Tabla y no enum porque va a crecer, y agregar un
-- tipo es una fila, no una migración.

create table tipo_comprobante (
  codigo  smallint primary key,
  nombre  text not null,
  clase   text not null,

  constraint tipo_comprobante_nombre_no_vacio check (btrim(nombre) <> ''),
  constraint tipo_comprobante_clase_valida check (clase in ('factura', 'nota_debito', 'nota_credito'))
);

comment on table tipo_comprobante is
  'Tipos de comprobante de ARCA, con su código como clave. clase dice si suma (factura, nota de '
  'débito) o resta (nota de crédito) al facturado; el signo lo aplica una vista, no se guarda.';

insert into tipo_comprobante (codigo, nombre, clase) values
  (1,   'Factura A',                         'factura'),
  (2,   'Nota de Débito A',                  'nota_debito'),
  (3,   'Nota de Crédito A',                 'nota_credito'),
  (6,   'Factura B',                         'factura'),
  (7,   'Nota de Débito B',                  'nota_debito'),
  (8,   'Nota de Crédito B',                 'nota_credito'),
  (201, 'Factura de Crédito Electrónica MiPyME A', 'factura'),
  (202, 'Nota de Débito Electrónica MiPyME A',     'nota_debito'),
  (203, 'Nota de Crédito Electrónica MiPyME A',    'nota_credito');

-- ---------------------------------------------------------------------------------------------
-- compania · una fila por entidad fiscal, con el CUIT como clave.
-- ---------------------------------------------------------------------------------------------
-- Por CUIT y no por marca: dos razones sociales de la misma marca son dos fichas, porque se les
-- factura y se les cobra por separado. Los comprobantes NO tienen clave foránea a esta tabla
-- (D3): la compañía de una factura sale de un join por CUIT, y una factura cuyo CUIT no tiene
-- ficha se importa igual (principio IV) y aparece como "compañía sin ficha".

create table compania (
  cuit                  text primary key,
  nombre                text not null,
  alias                 text[] not null default '{}',
  remitentes_aviso      text[] not null default '{}',
  mail_facturacion      text,
  plazo_declarado_dias  integer,
  canal                 text,
  portal_url            text,
  portal_usuario        text,
  creado_en             timestamptz not null default now(),

  constraint compania_cuit_formato check (cuit ~ '^[0-9]{11}$'),
  constraint compania_nombre_no_vacio check (btrim(nombre) <> ''),
  constraint compania_plazo_positivo check (plazo_declarado_dias > 0),
  constraint compania_canal_valido check (canal in ('mail', 'portal'))
);

comment on table compania is
  'Ficha de una compañía: una fila por CUIT (entidad fiscal), no por marca. Sin contraseñas '
  '(R2, RF-502): del portal se guardan URL y usuario.';
comment on column compania.cuit is 'Once dígitos, sin guiones.';
comment on column compania.alias is
  'Cómo aparece en mails y extractos, que no es como la llama el taller.';
comment on column compania.remitentes_aviso is
  'Direcciones de las que llegan los avisos de pago. Las lee el robot en la fase 2 (A2).';
comment on column compania.plazo_declarado_dias is
  'El plazo de pago que la compañía declara. Para derivar el vencimiento (A8). El plazo real '
  'se deriva de los pagos (P13); éste queda como dato declarado.';
comment on column compania.canal is 'Por dónde se le manda la factura: mail o portal.';

-- ---------------------------------------------------------------------------------------------
-- compania_requisito · el checklist de documentación, una fila por requisito.
-- ---------------------------------------------------------------------------------------------
-- Una fila por requisito y no un texto libre en la ficha: un texto libre no se puede tildar
-- antes de emitir (A5, fase 4).

create table compania_requisito (
  id_requisito  integer generated always as identity primary key,
  cuit          text not null references compania (cuit) on delete cascade,
  descripcion   text not null,

  constraint compania_requisito_descripcion_no_vacia check (btrim(descripcion) <> ''),
  constraint compania_requisito_unico unique (cuit, descripcion)
);

comment on table compania_requisito is
  'Lo que una compañía exige para pagar (conformidad firmada, orden de compra, fotos). '
  'Una fila por requisito, para poder controlarlos antes de emitir (A5).';

-- ---------------------------------------------------------------------------------------------
-- regla_facturacion · la excepción que no es un dato de una sola ficha.
-- ---------------------------------------------------------------------------------------------
-- "Si un siniestro de tal compañía no supera la franquicia, se le factura a tal otra." Compañía
-- de origen, condición y compañía de destino: una fila, no un if en el código. La condición es
-- un dominio cerrado, que crece con una migración cuando aparezca una regla de otro tipo.

create table regla_facturacion (
  id_regla      integer generated always as identity primary key,
  cuit_origen   text not null references compania (cuit) on delete cascade,
  condicion     text not null,
  cuit_destino  text not null references compania (cuit),
  nota          text,

  constraint regla_facturacion_condicion_valida check (condicion in ('siniestro_bajo_franquicia')),
  constraint regla_facturacion_origen_distinto check (cuit_origen <> cuit_destino),
  constraint regla_facturacion_unica unique (cuit_origen, condicion)
);

comment on table regla_facturacion is
  'A quién se le factura cuando no es la compañía del siniestro. Se consulta antes de emitir '
  '(A5, fase 4).';

-- ---------------------------------------------------------------------------------------------
-- Acceso (D2, D8).
-- ---------------------------------------------------------------------------------------------

alter table tipo_comprobante   enable row level security;
alter table compania           enable row level security;
alter table compania_requisito enable row level security;
alter table regla_facturacion  enable row level security;

alter table tipo_comprobante   force row level security;
alter table compania           force row level security;
alter table compania_requisito force row level security;
alter table regla_facturacion  force row level security;

revoke all on tipo_comprobante   from anon;
revoke all on compania           from anon;
revoke all on compania_requisito from anon;
revoke all on regla_facturacion  from anon;
revoke all on all sequences in schema public from anon;

-- Permisivas, sólo para personas. A diferencia de las cuatro tablas del presupuesto, acá no hay
-- una política de "acceso total" heredada que haya que acotar: nacen cerradas.
create policy persona_acceso_total on tipo_comprobante
  for all to authenticated
  using ((select fn_rol()) = 'persona')
  with check ((select fn_rol()) = 'persona');

create policy persona_acceso_total on compania
  for all to authenticated
  using ((select fn_rol()) = 'persona')
  with check ((select fn_rol()) = 'persona');

create policy persona_acceso_total on compania_requisito
  for all to authenticated
  using ((select fn_rol()) = 'persona')
  with check ((select fn_rol()) = 'persona');

create policy persona_acceso_total on regla_facturacion
  for all to authenticated
  using ((select fn_rol()) = 'persona')
  with check ((select fn_rol()) = 'persona');

commit;
