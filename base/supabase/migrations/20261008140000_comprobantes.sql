-- Cobranzas · fase 1 · M3 — El libro de ARCA: importaciones, comprobantes y vínculos.
--
-- Spec: specs/005-cobranzas/spec.md §4.2, criterio 3 · Plan: specs/005-cobranzas/plan.md, D2, D3, D8
--
-- Lo que entra acá es lo que ARCA ya registró: no se carga a mano, se importa del CSV de
-- "Mis Comprobantes". Reimportar el mismo archivo no duplica: la clave de un comprobante es la
-- de ARCA, más el CUIT que lo emitió (D3, N1), y lo que ya está se saltea.
--
-- Cuatro diferencias con la spec, a propósito:
--   · importacion NO guarda "filas nuevas": se cuentan, con los comprobantes que apuntan a esa
--     importación (principio II). Sí guarda las leídas, que no se pueden derivar.
--   · comprobante guarda el CUIT del receptor sólo cuando ARCA dice que es un CUIT; una
--     Factura B a un particular puede ir con DNI o sin documento. La compañía sale de un join
--     por ese CUIT, nunca de una columna copiada (D3).
--   · siniestro_nro y trabajo_id no entran todavía: en la fase 1 nadie los llena. El siniestro
--     de las históricas sale de los mails enviados en la fase 2 (H13.2), y entra con ella.
--   · comprobante_vinculo guarda sólo lo que decidió una persona. Las NC con un único candidato
--     (P9) se vinculan por una vista en M4, sin escribir filas: lo que se deriva, se deriva.
--
-- Acceso (D2): sólo personas, igual que M2. Cada tabla nace cerrada (D8).
--
-- APLICADA el 2026-10-08. Verificación: specs/005-cobranzas/qa-m3-comprobantes.sql, 15 de 15 ok.

begin;

-- ---------------------------------------------------------------------------------------------
-- importacion · cada vez que se sube un archivo.
-- ---------------------------------------------------------------------------------------------

create table importacion (
  id_importacion  integer generated always as identity primary key,
  fuente          text not null,
  archivo_nombre  text not null,
  archivo_hash    text not null,
  filas_leidas    integer not null,
  creado_por      uuid default auth.uid(),
  creado_en       timestamptz not null default now(),

  constraint importacion_fuente_valida check (fuente in ('arca')),
  constraint importacion_hash_formato check (archivo_hash ~ '^[0-9a-f]{64}$'),
  constraint importacion_filas_no_negativas check (filas_leidas >= 0)
);

comment on table importacion is
  'Una corrida de importación. Las filas nuevas no se guardan: se cuentan con los comprobantes '
  'que apuntan acá (principio II). Subir el mismo archivo dos veces deja dos importaciones, y '
  'la segunda con cero comprobantes: así se ve que reimportar no duplicó.';
comment on column importacion.archivo_hash is
  'SHA-256 del archivo, en hexadecimal. Dice si dos importaciones fueron del mismo archivo.';
comment on column importacion.fuente is
  'De dónde vino. Hoy sólo arca; gmail entra con la fase 2.';

-- ---------------------------------------------------------------------------------------------
-- comprobante · un renglón del libro de ARCA.
-- ---------------------------------------------------------------------------------------------

create table comprobante (
  id_comprobante   integer generated always as identity primary key,
  cuit_emisor      text not null,
  tipo_codigo      smallint not null references tipo_comprobante (codigo),
  punto_venta      integer not null,
  numero           bigint not null,
  fecha_emision    date not null,
  cuit_receptor    text,
  receptor_nombre  text,
  moneda           text not null,
  tipo_cambio      numeric(14, 6) not null default 1,
  neto_gravado     numeric(14, 2) not null,
  iva              numeric(14, 2) not null,
  total            numeric(14, 2) not null,
  id_importacion   integer not null references importacion (id_importacion),
  creado_en        timestamptz not null default now(),

  constraint comprobante_clave_arca unique (cuit_emisor, tipo_codigo, punto_venta, numero),
  constraint comprobante_cuit_emisor_formato check (cuit_emisor ~ '^[0-9]{11}$'),
  constraint comprobante_cuit_receptor_formato check (cuit_receptor ~ '^[0-9]{11}$'),
  constraint comprobante_punto_venta_positivo check (punto_venta > 0),
  constraint comprobante_numero_positivo check (numero > 0),
  constraint comprobante_tipo_cambio_positivo check (tipo_cambio > 0),
  constraint comprobante_total_no_negativo check (total >= 0)
);

comment on table comprobante is
  'Un comprobante emitido, tal como lo registró ARCA. Clave: CUIT emisor + tipo + punto de venta '
  '+ número (D3): cada CUIT numera por separado. Sin estado (R5): si está cobrado, anulado o a '
  'reclamar lo deriva una vista. Los importes van en positivo; si una nota de crédito resta, lo '
  'dice tipo_comprobante.clase.';
comment on column comprobante.cuit_receptor is
  'Sólo cuando ARCA identifica al receptor por CUIT. La compañía sale de un join por acá (D3). '
  'Nulo para un particular con DNI o sin documento.';
comment on column comprobante.receptor_nombre is
  'La denominación del receptor tal como figura en ARCA. Es un dato del comprobante, como el '
  'texto impreso de un presupuesto: no se corrige si después cambia la ficha.';
comment on column comprobante.moneda is
  'Tal como viene de ARCA. Si alguna vez hay una factura en otra moneda, el arqueo la separa en '
  'vez de sumarla como pesos.';

create index ix_comprobante_importacion on comprobante (id_importacion);
create index ix_comprobante_receptor on comprobante (cuit_receptor);

-- ---------------------------------------------------------------------------------------------
-- comprobante_vinculo · la relación de una nota con la factura que toca, decidida por alguien.
-- ---------------------------------------------------------------------------------------------
-- Cubre la NC que anula una factura y la ND que revive una factura revirtiendo una NC. Sólo las
-- decisiones de una persona: los vínculos obvios los deriva una vista (M4, P9).

create table comprobante_vinculo (
  id_vinculo       integer generated always as identity primary key,
  id_origen        integer not null references comprobante (id_comprobante) on delete cascade,
  id_destino       integer not null references comprobante (id_comprobante) on delete cascade,
  motivo           text not null,
  confirmado_por   uuid not null default auth.uid(),
  confirmado_en    timestamptz not null default now(),

  constraint comprobante_vinculo_motivo_valido
    check (motivo in ('anula', 'duplicado', 'ajuste', 'revierte_nc')),
  constraint comprobante_vinculo_distintos check (id_origen <> id_destino),
  constraint comprobante_vinculo_unico unique (id_origen, id_destino)
);

comment on table comprobante_vinculo is
  'Qué factura toca una nota de crédito o de débito, cuando lo decidió una persona. origen es '
  'la nota; destino, el comprobante que toca. revierte_nc: una ND que anula una NC.';

create index ix_comprobante_vinculo_destino on comprobante_vinculo (id_destino);

-- ---------------------------------------------------------------------------------------------
-- Acceso (D2, D8).
-- ---------------------------------------------------------------------------------------------

alter table importacion         enable row level security;
alter table comprobante         enable row level security;
alter table comprobante_vinculo enable row level security;

alter table importacion         force row level security;
alter table comprobante         force row level security;
alter table comprobante_vinculo force row level security;

revoke all on importacion         from anon;
revoke all on comprobante         from anon;
revoke all on comprobante_vinculo from anon;
revoke all on all sequences in schema public from anon;

create policy persona_acceso_total on importacion
  for all to authenticated
  using ((select fn_rol()) = 'persona')
  with check ((select fn_rol()) = 'persona');

create policy persona_acceso_total on comprobante
  for all to authenticated
  using ((select fn_rol()) = 'persona')
  with check ((select fn_rol()) = 'persona');

create policy persona_acceso_total on comprobante_vinculo
  for all to authenticated
  using ((select fn_rol()) = 'persona')
  with check ((select fn_rol()) = 'persona');

commit;
