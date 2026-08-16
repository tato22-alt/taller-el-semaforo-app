# Taller El Semáforo — Sistema de Gestión

> Este archivo es el contexto persistente del proyecto. Claude Code lo lee automáticamente al inicio de cada sesión. **No borrar ni mover de la raíz del proyecto.**

---

## 1. Quién soy yo (el dueño del proyecto)

- **Nombre:** Tato
- **Rol:** Administración en taller familiar de chapa y pintura en Argentina (Villa Gesell, Buenos Aires).
- **Formación:** Segundo año de la carrera Gestión de Tecnología de la Información.
- **Stack que conozco:** SQL Server (preferencia personal aunque acá usemos Postgres vía Insforge), Python básico, conceptos de modelado relacional, UML, estructuras de datos.
- **Cómo me gusta trabajar:**
  - Quiero entender el **por qué** de cada decisión técnica, no solo el qué.
  - Prefiero explicaciones con ejemplos concretos del negocio (taller), no abstractos.
  - Soy iterativo: propongo, analizo, refino. Me gusta que me cuestionen si una solución es demasiado compleja para el problema.
  - Estoy aprendiendo mientras construimos, así que comentá el código y explicá decisiones.
  - Hablame en **español rioplatense** (vos, no tú).

---

## 2. Qué es este sistema (el por qué)

**Negocio:** Taller de chapa y pintura automotriz. Recibe autos de clientes particulares y de compañías de seguro (a través de peritos).

**Problema real que resuelve el sistema:** Hoy la información del taller vive dispersa entre talonarios de presupuesto en papel, chats de WhatsApp, mails, memoria de quien atendió. No se puede contestar fácilmente preguntas como "¿cuánto ganamos este mes?", "¿qué facturas están sin cobrar?", "¿en qué se va la plata?".

**Pregunta núcleo que el sistema debe contestar:**
> **¿Dónde se va la plata, caso por caso?**

Todo módulo, campo, automatización o feature que se proponga se valida contra esa pregunta. Si no aporta a contestarla (directa o indirectamente), no entra al MVP.

**Norte de diseño:** El sistema NO debe convertirse en "uno que hace todo pero no hace nada". Tiene que ser un asistente operativo que ahorra tiempo, NO un software burocrático de carga.

**Anti-patrón a evitar:** Hojas de cálculo gigantes con 30 campos por entidad, donde nadie carga nada porque genera más trabajo del que ahorra. Ya intentamos esto y fracasó. Por eso ahora apuntamos a captura mínima y a sumar campos solo cuando duelan.

---

## 3. Quiénes lo van a usar

- **Tato** (yo): carga ocasional, consulta de reportes y análisis financiero.
- **Una administrativa** del taller: carga diaria de casos, presupuestos, facturas, cobros. Usa principalmente el celular, a veces la PC del taller.
- **Posibles usuarios futuros (no fase 1):** chapistas/pintores para marcar estados, dueño del taller para mirar reportes.

**Implicancia clave:** La UX tiene que ser **mobile-first** y **pensada para alguien no-técnico**. Si cargar un caso completo toma más de 90 segundos, está mal diseñado.

---

## 4. Tipos de operaciones del taller

Hay tres tipos de casos que el sistema debe distinguir claramente:

| tipo_caso             | Quién paga          | ¿Se factura? | ¿Hay perito/siniestro? |
|-----------------------|---------------------|--------------|------------------------|
| `seguro`              | La aseguradora      | Sí (a la compañía) | Sí                |
| `particular_factura`  | Cliente particular  | Sí (al cliente con CUIT) | No          |
| `efectivo`            | Cliente particular  | NO (informal) | No                    |

**Importante sobre el efectivo:** Cuando es efectivo, no se factura ("no se blanquea"), pero el cobro **sí debe registrarse en el sistema** como entrada de dinero. El sistema es la verdad operativa interna; lo fiscal es separado.

**Sobre las facturas:** Las facturas se emiten mayormente **a compañías de seguro**, no a los clientes finales. Una misma compañía puede pagar muchos casos distintos de clientes distintos.

---

## 5. Stack técnico (decisiones tomadas)

| Capa | Herramienta | Razón |
|------|-------------|-------|
| Backend / DB | **Insforge** (Postgres + Auth + Storage) | BaaS diseñado para que agentes de código lo operen vía MCP. Tier gratuito generoso. |
| Frontend | **Next.js 14+** (App Router) + TypeScript | Estándar de industria, deploy gratis en Vercel, mobile-friendly con responsive. |
| Estilos | **Tailwind CSS** + **shadcn/ui** | Componentes copy-paste de buena calidad, sin dependencias raras. |
| Editor | **VS Code** | Con extensión de Claude Code. |
| Agente | **Claude Code** (Anthropic) | Quien escribe la mayoría del código. |
| Sistema operativo | **Windows 11** (Dell Inspiron 16) | Mencionar comandos PowerShell, no bash. |
| Idioma | **UI en español, código en inglés** | Convención estándar. |

**Project Insforge:**
- Project ID: `8ba45d55-7398-4015-88dc-076d6f38134d`
- Region: `us-east`
- App Key: `76t2363i`
- Project URL: `https://76t2363i.us-east.insforge.app`

---

## 6. Modelo de datos (10 tablas)

El modelo evolucionó desde un diseño de 16 tablas que era demasiado pesado. Fusionamos `siniestro + presupuesto + trabajo` en una sola entidad `caso` con un campo `estado` y un `tipo_caso`. Esto simplifica MUCHO la lógica.

### Entidades principales

**1. `cliente`** — Dueño de un vehículo. Identificado por teléfono (único).
- `id_cliente`, `telefono` (unique, not null), `nombre`, `email`, `cuit`, `creado_en`

**2. `vehiculo`** — Auto que ingresa al taller. Patente única. Siempre pertenece a un cliente.
- `id_vehiculo`, `patente` (unique, not null), `marca`, `modelo`, `anio`, `color`, `id_cliente` (FK, not null), `creado_en`

**3. `compania_seguro`** — Aseguradora que paga (cuando aplica).
- `id_compania`, `nombre` (not null), `email`, `telefono`, `cuit`

**4. `perito`** — Representante de la compañía. Para gestión de mails.
- `id_perito`, `nombre` (not null), `email`, `telefono`, `id_compania` (FK)

**5. `caso`** — Eje central del sistema. Un caso = un trabajo real sobre un vehículo.
- `id_caso`, `num_presupuesto`, `id_vehiculo` (FK, not null), `id_compania` (FK, nullable), `id_perito` (FK, nullable), `num_siniestro` (nullable), `tipo_caso` (not null: 'seguro'|'particular_factura'|'efectivo'), `estado` (not null, default 'presupuestado'), `descripcion`, `fecha_ingreso`, `fecha_prometida`, `fecha_entrega`, `creado_en`, `actualizado_en`

**Estados válidos de un caso (flujo lineal):**
`presupuestado` → `enviado` → `aprobado` → `en_taller` → `en_trabajo` → `terminado` → `entregado` → `facturado` → `cobrado`

**6. `caso_item`** — Líneas del presupuesto. Subtotal calculado automáticamente.
- `id_item`, `id_caso` (FK, on delete cascade), `descripcion` (not null), `tipo` ('mano_obra'|'repuesto'|'material'|'pintura'|'sublet'|'otro'), `cantidad`, `precio_unitario` (not null), `subtotal` (generated as cantidad*precio_unitario)

**7. `factura`** — Documento fiscal. Apunta a compañía o cliente con CUIT.
- `id_factura`, `num_factura` (not null), `id_caso` (FK, not null), `id_compania` (FK, nullable), `fecha_emision`, `monto_total` (not null), `estado` ('emitida'|'enviada'|'cobrada'|'anulada'), `url_pdf`, `creado_en`

**8. `cobro`** — Movimiento real de dinero. Puede tener o no factura asociada.
- `id_cobro`, `id_caso` (FK, not null), `id_factura` (FK, nullable), `monto` (not null), `tipo_cobro` ('facturado'|'efectivo'), `fecha_cobro`, `nota`, `creado_en`

**9. `comunicacion`** — Historial de contactos con peritos/clientes (mails, WhatsApp, llamadas).
- `id_comunicacion`, `id_caso` (FK), `id_perito` (FK), `tipo` ('email'|'whatsapp'|'llamada'|'presencial'), `direccion` ('entrante'|'saliente'), `asunto`, `cuerpo`, `fecha`

**10. `documento`** — Fotos, PDFs adjuntos. URL al archivo en Drive o Insforge Storage.
- `id_documento`, `id_caso` (FK), `id_factura` (FK), `tipo` ('foto_ingreso'|'foto_terminado'|'presupuesto_pdf'|'factura_pdf'|'otro'), `nombre`, `url` (not null)

---

## 7. Reglas de negocio (encodearlas en la UI)

1. Un caso siempre tiene un vehículo. Un vehículo siempre tiene un cliente. No se permite crear vehículos sin cliente.

2. El `tipo_caso` determina qué campos se muestran:
   - `seguro` → mostrar compañía, perito, num_siniestro.
   - `particular_factura` → mostrar CUIT del cliente.
   - `efectivo` → mínimos campos, no se genera factura.

3. **Teléfono es el identificador único del cliente.** Normalizar al guardar: quitar espacios, guiones y caracteres no numéricos, mantener solo dígitos y un opcional `+` inicial. Si `"2255 41-2737"` y `"+542255412737"` se cargan en distintos momentos, NO deben crear dos clientes.

4. **Patente es el identificador único del vehículo.** Normalizar a mayúsculas sin espacios.

5. Cuando un caso pasa a estado `facturado`, debe existir una factura asociada. Cuando pasa a `cobrado`, debe existir al menos un cobro que cubra el monto.

6. Los cobros `efectivo` NO tienen factura asociada (id_factura es null). Los cobros `facturado` SÍ.

---

## 8. Reglas de seguridad (no negociables)

1. **Nunca hardcodear credenciales en código.** Toda API key, secret, token va a `.env.local` (que está en `.gitignore`).

2. **Nunca subir `.env.local` a Git.** Verificar `.gitignore` antes de cada commit.

3. **Nunca loguear datos personales completos** (CUIT, teléfonos completos, etc.) en consola o archivos de log.

4. **Usar variables de entorno con prefijo `NEXT_PUBLIC_` solo para lo que es seguro mostrar al cliente** (URLs públicas, anon key de Insforge). El admin key y secrets NUNCA llevan ese prefijo.

5. **Sanitizar inputs antes de queries.** Usar siempre las funciones del SDK de Insforge, nunca concatenar strings SQL.

6. **Cuando sume autenticación**, usar la auth nativa de Insforge. Mínimo dos roles: `admin` (Tato) y `operador` (administrativa).

7. **Backup periódico.** Una vez por mes mínimo, exportar la base completa a un archivo SQL y guardar en disco externo. Esto se automatiza después; por ahora dejarlo documentado como tarea.

---

## 9. Cómo trabajamos juntos (Claude Code y Tato)

### Tu rol como agente

Sos **ejecutor + mentor**. Hacé el trabajo de implementación pero explicame las decisiones que tomes.

### Antes de actuar

- Si una decisión afecta el modelo de datos, la UX, o el flujo de negocio: **preguntá antes de hacer**.
- Si es una decisión técnica menor (nombres de variables, estructura interna de un componente, qué librería helper usar): decidí y comentá brevemente por qué.

### Después de cada cambio

Reportá:
1. Qué hiciste.
2. Qué decisiones tomaste y por qué.
3. Qué tengo que probar/verificar.
4. Cuál es el siguiente paso lógico.

### Estilo de código

- Comentarios en español, código en inglés.
- TypeScript estricto (no `any` salvo justificación).
- Componentes pequeños, una responsabilidad cada uno.
- Nombres descriptivos (`crearNuevoCaso` mejor que `submit`).
- Manejo de errores explícito, no try/catch vacíos.

### Optimización de tokens

- No releas archivos que ya leíste en esta sesión salvo que algo haya cambiado.
- No explores carpetas a ciegas: usá las herramientas de Insforge MCP para consultar el estado de la DB en lugar de adivinar.
- Cuando edites archivos largos, hacelo en chunks específicos, no reescribas el archivo completo.

---

## 10. Fases del proyecto

**Fase actual: 1 — MVP visible**

- ✅ Modelo de datos definido
- ⬜ Tablas creadas en Insforge
- ⬜ Proyecto Next.js inicializado
- ⬜ Dashboard básico con cards (mock data)
- ⬜ Carga de caso nuevo (cliente + vehículo + items)
- ⬜ Listado de casos
- ⬜ Carga de factura
- ⬜ Carga de cobro
- ⬜ Dashboard conectado a datos reales

**Fase 2 — Operativa real (después)**
- Autenticación (admin + operador)
- Estado del caso editable con timeline
- Subida de fotos/documentos
- Búsqueda y filtros avanzados
- Reportes financieros por período

**Fase 3 — Comunicación**
- Gestión de mails de peritos (Gmail API)
- Generador de mensajes WhatsApp (deep link wa.me)
- Tabla de comunicaciones poblada

**Fase 4 — Automatización**
- Agentes vía Claude API (presupuestos a partir de fotos/voz)
- n8n para recordatorios automáticos
- Backup automático

---

## 11. Cosas que NUNCA hay que hacer

- Crear un sistema de mensajería propio. Usamos WhatsApp con deep links (`wa.me`).
- Generar facturas fiscales desde el sistema. Usamos AFIP/servicio externo y solo registramos.
- Almacenar fotos en la DB. Guardar URL al archivo en Drive o Insforge Storage.
- Replicar funcionalidades de Google Calendar, Drive o Gmail. Integrar con ellos vía API.
- Agregar campos "por si acaso". Agregar solo cuando se demuestre que se necesitan.

---

*Última actualización del contexto: configuración inicial del proyecto, antes de crear las tablas en Insforge.*
