# Taller El Semáforo — App de gestión para taller

MVP en desarrollo de una aplicación web para la gestión operativa de un taller de chapa y pintura.

El objetivo del proyecto es centralizar información administrativa y operativa relacionada con casos de reparación, presupuestos, facturación, cobros y seguimiento de trabajos, mejorando la trazabilidad de la información dentro del taller.

## Estado actual

Proyecto inicial / MVP en desarrollo.

Actualmente incluye:

* Dashboard visual inicial con métricas simuladas.
* Layout responsive con sidebar para desktop y navegación superior en mobile.
* Componentes reutilizables para tarjetas de indicadores.
* Configuración base con Next.js, TypeScript y Tailwind CSS.
* Cliente preparado para futura integración con backend/BaaS mediante variables de entorno.
* Captura del estado actual de la interfaz.

Este proyecto todavía no representa una aplicación productiva terminada. Actualmente funciona como base visual y técnica para continuar desarrollando funcionalidades reales.

## Motivación

El proyecto surge a partir de procesos reales de administración en un taller de chapa y pintura, donde se gestionan clientes, vehículos, presupuestos, repuestos, facturas, cobros y seguimiento de siniestros.

La idea es construir una herramienta simple que permita ordenar información dispersa, reducir dependencia de planillas o registros aislados y mejorar el seguimiento desde el ingreso del vehículo hasta el cierre del caso.

## Tecnologías utilizadas

* Next.js
* React
* TypeScript
* Tailwind CSS
* InsForge SDK
* Lucide React
* Git / GitHub

## Estructura principal

```text
app/               Pantallas principales de Next.js
components/        Componentes reutilizables
lib/               Configuración de clientes externos
screenshot.png     Captura del estado actual de la UI
```

## Captura

![Dashboard inicial](./screenshot.png)

## Configuración local

1. Instalar dependencias:

```bash
npm install
```

2. Crear archivo de variables de entorno tomando como referencia `.env.example`:

```bash
cp .env.example .env.local
```

3. Completar `.env.local` con las credenciales correspondientes del entorno local.

4. Ejecutar en modo desarrollo:

```bash
npm run dev
```

5. Abrir en el navegador:

```text
http://localhost:3000
```

## Funcionalidades previstas

* Gestión de casos de reparación.
* Carga de clientes y vehículos.
* Registro de presupuestos.
* Seguimiento de estados del trabajo.
* Registro de facturas y cobros.
* Dashboard conectado a datos reales.
* Autenticación y roles.
* Deploy de prueba.

## Próximos pasos

* Crear estructura de datos real para casos.
* Implementar pantalla de listado de casos.
* Implementar formulario de nuevo caso.
* Conectar el dashboard a datos reales.
* Documentar el modelo de datos.
* Preparar deploy en Vercel.

## Aprendizajes aplicados

* Organización de un proyecto Next.js.
* Uso de componentes reutilizables.
* Maquetado responsive con Tailwind CSS.
* Separación básica entre interfaz, componentes y configuración externa.
* Planificación incremental de un MVP.
* Aplicación de tecnología a un problema operativo real.

## Nota

Este proyecto forma parte de un portfolio académico/profesional en desarrollo. No contiene datos reales del taller y no se encuentra listo para uso en producción.
