# Gestión de Taller — Modelo SQL Server

Proyecto de modelado de base de datos relacional para un sistema de gestión de taller de chapa y pintura.

El objetivo es representar el flujo operativo básico de un taller: clientes, vehículos, casos, presupuestos, facturación, cobros, comunicaciones y documentos asociados.

## Estado del proyecto

Proyecto académico / portfolio en desarrollo.

Este repositorio no es una aplicación completa. Es una base de datos diseñada para practicar y demostrar:

- Modelado relacional.
- Claves primarias y foráneas.
- Restricciones de integridad.
- Consultas SQL con joins.
- Vistas para reportes.
- Procedimientos almacenados.
- Triggers simples.
- Documentación de modelo de datos.

## Tecnologías

- SQL Server
- T-SQL
- SQL Server Management Studio
- Modelado relacional

## Estructura

```text
scripts/
  01_create_database.sql
  02_create_tables.sql
  03_insert_sample_data.sql
  04_queries_reportes.sql
  05_views.sql
  06_stored_procedures.sql
  07_triggers.sql

docs/
  diccionario-datos.md
  mejoras-futuras.md
```

## Cómo ejecutar

1. Abrir SQL Server Management Studio.
2. Ejecutar los scripts en este orden:

```text
01_create_database.sql
02_create_tables.sql
03_insert_sample_data.sql
04_queries_reportes.sql
05_views.sql
06_stored_procedures.sql
07_triggers.sql
```

## Modelo conceptual

Entidades principales:

- Clientes
- Vehículos
- Compañías de seguro
- Peritos
- Casos
- Items de caso
- Facturas
- Cobros
- Comunicaciones
- Documentos

## Casos de uso que intenta responder

- Qué vehículos están actualmente en reparación.
- Qué casos están aprobados, facturados o cobrados.
- Qué facturas están pendientes de cobro.
- Qué ingresos hubo por mes.
- Qué trabajos corresponden a seguro, particular con factura o efectivo.
- Qué comunicaciones y documentos están asociados a cada caso.

## Nota

Este modelo surge de un problema real de gestión operativa, pero se presenta como proyecto académico/profesional. Los datos de ejemplo son ficticios.
