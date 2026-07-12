# Gestión de Taller — Modelo SQL Server

Proyecto de modelado de base de datos relacional para un sistema de gestión de taller de chapa y pintura.

El objetivo es representar un flujo operativo básico de taller, incluyendo clientes, vehículos, casos de reparación, compañías de seguro, peritos, facturación, cobros, comunicaciones y documentos asociados.

## Estado del proyecto

Proyecto académico / portfolio en desarrollo.

Este repositorio no corresponde a una aplicación completa ni a un sistema productivo. Es un modelo de base de datos diseñado para practicar y demostrar conceptos fundamentales de SQL Server y modelado relacional.

## Objetivos técnicos

El proyecto busca demostrar:

* Modelado de entidades y relaciones.
* Uso de claves primarias y claves foráneas.
* Restricciones de integridad.
* Consultas SQL con `JOIN`.
* Vistas para reportes.
* Procedimientos almacenados.
* Triggers simples.
* Documentación básica de modelo de datos.

## Tecnologías utilizadas

* SQL Server
* T-SQL
* SQL Server Management Studio
* Modelado relacional

## Estructura del repositorio

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
2. Ejecutar los scripts en el siguiente orden:

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

Entidades principales del modelo:

* Clientes
* Vehículos
* Compañías de seguro
* Peritos
* Casos
* Ítems de caso
* Facturas
* Cobros
* Comunicaciones
* Documentos

## Casos de uso representados

El modelo intenta responder preguntas operativas como:

* Qué vehículos se encuentran actualmente en reparación.
* Qué casos están aprobados, facturados o cobrados.
* Qué facturas se encuentran pendientes de cobro.
* Qué ingresos hubo por mes.
* Qué trabajos corresponden a seguro, particular con factura o efectivo.
* Qué comunicaciones y documentos están asociados a cada caso.

## Motivación

El modelo surge a partir de un problema real de gestión operativa en un taller de chapa y pintura. La intención es representar información que normalmente puede estar dispersa en presupuestos, facturas, conversaciones, documentos y planillas.

## Nota

Los datos utilizados son ficticios. El proyecto tiene fines académicos y de portfolio.


