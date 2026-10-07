-- Bloque A · T005 — Tabla trabajos: snapshot de lo impreso, numero_presupuesto único
-- parcial, origen nulo al nacer.
--
-- Spec: RF-001 a RF-008, RF-010, RF-014, RF-015, RF-020 · Plan: sección "Esquema · trabajos", D1, D4, D6

create table trabajos (
  id_trabajo          integer generated always as identity primary key,

  numero_presupuesto  integer,

  id_cliente          integer references clientes (id_cliente),
  id_vehiculo         integer references vehiculos (id_vehiculo),

  fecha_presupuesto   date,

  -- Snapshot de lo impreso (D4): lo que decía el papel, no lo que dice hoy el maestro.
  txt_cliente         text,
  txt_direccion       text,
  txt_telefono        text,
  txt_vehiculo        text,
  txt_patente         text,

  monto_mano_obra     numeric(12, 2) not null default 0,
  no_concretado       boolean not null default false,

  -- Nulo al nacer (RF-014): no siempre se sabe si el trabajo va por seguro o particular.
  origen              text,

  creado_en           timestamptz not null default now(),
  modificado_en       timestamptz not null default now(),

  -- Cómo entró el registro: la propia página, carga manual en el panel, o importación del CSV.
  origen_carga        text not null,

  constraint trabajos_numero_presupuesto_rango
    check (numero_presupuesto is null or numero_presupuesto >= 16000),
  constraint trabajos_monto_mano_obra_no_negativo
    check (monto_mano_obra >= 0),
  constraint trabajos_origen_dominio
    check (origen is null or origen in ('particular', 'siniestro')),
  constraint trabajos_origen_carga_dominio
    check (origen_carga in ('presupuesto_web', 'manual', 'importacion'))
);

comment on table trabajos is
  'El expediente: nace del presupuesto (RF-003), identificado por numero_presupuesto. '
  'Clave primaria subrogada (D1): el número de talonario es el identificador de negocio, '
  'pero no la PK, para no impedir un trabajo que llegue sin presupuesto previo.';
comment on column trabajos.numero_presupuesto is
  'Número del talonario, único, correlativo, nunca reutilizado (RF-001, RF-020). Nulo '
  'permitido: no todo trabajo nace de un presupuesto emitido (D1). Único sobre los no nulos, '
  'ver ux_trabajos_numero_presupuesto.';
comment on column trabajos.txt_cliente is 'Snapshot: nombre tal como se imprimió (D4, RF-010).';
comment on column trabajos.txt_direccion is 'Snapshot: dirección tal como se imprimió (D4, RF-010).';
comment on column trabajos.txt_telefono is 'Snapshot: teléfono tal como se imprimió (D4, RF-010).';
comment on column trabajos.txt_vehiculo is 'Snapshot: descripción del vehículo tal como se imprimió (D4, RF-010).';
comment on column trabajos.txt_patente is 'Snapshot: patente tal como se imprimió (D4, RF-010).';
comment on column trabajos.origen is
  'particular / siniestro. Nulo al nacer (RF-014): no siempre se sabe en el momento. '
  'Sin uso todavía en este feature; se declara para no migrar una tabla ya poblada después.';
comment on column trabajos.no_concretado is
  'Presupuesto que no se concretó (RF-015). No se borra ni se saca del historial, sólo '
  'deja de contar como activo. Todo lo importado entra en false (RF-015).';
comment on column trabajos.fecha_presupuesto is
  'Fecha de calendario del presupuesto, DATE sin hora ni zona (D6). No comparar contra '
  'creado_en/modificado_en, que son TIMESTAMPTZ en UTC.';
comment on column trabajos.creado_en is
  'TIMESTAMPTZ en UTC. Si el trabajo viene importado, es el creado_en del origen (D6); '
  'si no, el momento de la carga.';
comment on column trabajos.modificado_en is
  'TIMESTAMPTZ en UTC. Si el trabajo viene importado, es el modificado_en del origen y la '
  'importación lo usa para decidir si actualiza o saltea (RF-018, T014) — nunca lo sella un '
  'trigger automático.';
comment on column trabajos.origen_carga is
  'Cómo entró el registro: presupuesto_web, manual o importacion. Dato técnico de '
  'trazabilidad, no de negocio.';

-- Único sobre los no nulos (D1): dos trabajos sin numero_presupuesto conviven, pero dos
-- con el mismo número, no.
create unique index ux_trabajos_numero_presupuesto
  on trabajos (numero_presupuesto)
  where numero_presupuesto is not null;

-- Historial de un auto (pregunta 2 de la spec), del más nuevo al más viejo.
create index ix_trabajos_vehiculo_fecha
  on trabajos (id_vehiculo, fecha_presupuesto desc);

-- Presupuestos de un cliente (pregunta 3 de la spec).
create index ix_trabajos_cliente
  on trabajos (id_cliente);
