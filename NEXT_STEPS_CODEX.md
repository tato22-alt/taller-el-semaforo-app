# Próximos pasos sugeridos para Codex

Objetivo: continuar el MVP sin sobredimensionar el proyecto.

## Contexto

La app es un sistema de gestión para un taller de chapa y pintura. El MVP debe priorizar:

1. Casos.
2. Facturas.
3. Cobros.
4. Dashboard con datos reales.

No agregar funcionalidades grandes antes de tener esas partes funcionando.

## Estado actual

- Next.js + TypeScript + Tailwind.
- Dashboard visual con datos mock.
- Sidebar y layout responsive.
- Cliente InsForge configurado mediante variables de entorno.

## Tarea recomendada 1

Crear la pantalla `/casos` con:

- Tabla/listado de casos.
- Estado vacío si no hay datos.
- Botón "Nuevo caso".
- Datos mock iniciales, sin backend todavía.

## Tarea recomendada 2

Crear formulario básico de nuevo caso con campos mínimos:

- Cliente.
- Teléfono.
- Vehículo.
- Patente.
- Tipo de caso: seguro / particular con factura / efectivo.
- Estado inicial.
- Descripción.
- Fecha de ingreso.

## Reglas

- No hardcodear credenciales.
- No tocar `.env.local`.
- No agregar librerías innecesarias.
- Mantener UI en español.
- Mantener código simple y entendible.
- Explicar cada cambio realizado.
