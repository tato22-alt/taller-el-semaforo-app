# El Semáforo — aplicación

Sistema de gestión para un taller de chapa y pintura en Villa Gesell, Buenos Aires. Es un
taller familiar real, con tres personas cargando datos, y esta aplicación se usa desde el
celular mientras se trabaja.

**El problema no es "no tenemos un sistema".** Es que hoy nadie puede contestar de memoria
qué autos hay en el taller, hace cuánto están, y quién debe plata. Todo eso vive repartido
entre un talonario de papel, WhatsApp y la memoria de quien atendió.

---

## Estado: en construcción

| | |
|---|---|
| **Base de datos** | ✅ Aplicada y verificada — 15 migraciones, 57/57 verificaciones, RLS activa |
| **Herramienta de presupuestos** | 🟡 En producción, conectada a la base en una rama sin mergear |
| **Esta aplicación** | 🟡 Esqueleto en pie — Vite, TypeScript estricto, tres capas, 27 tests en verde |

El detalle honesto de qué funciona y qué no está en **[`ESTADO.md`](./ESTADO.md)**, con el
orden de trabajo. El alcance y los límites, en
**[`specs/002-alcance/spec.md`](./specs/002-alcance/spec.md)**.

---

## Alcance: tres pantallas, y nada más

1. **Presupuesto** — armar, numerar e imprimir un presupuesto. Ya existe y está en producción.
2. **Tablero** — una fila por trabajo. Se usa parado, con el celular, al lado de un auto.
3. **Ficha** — un trabajo, su historia, y los presupuestos anteriores del mismo auto.

Si algo no entra en esas tres, no entra. El alcance se defiende activamente: el riesgo real de
un proyecto así no es quedarse corto, es convertirse en "uno que hace todo pero no hace nada",
y eso pasa de a un feature razonable por vez.

---

## Decisiones de diseño

Las tres que más definen el proyecto:

**No hay backend.** La base corre en Supabase y PostgREST expone el esquema como API REST. La
base *es* la API. Un servidor en el medio sería una pieza más que mantener, desplegar y
asegurar, sin agregar nada que las vistas de Postgres no hagan mejor.

**Lo que se puede derivar, no se almacena.** Totales, saldos y días transcurridos se calculan
al leer, en vistas. Un dato derivado que se guarda es un dato que en algún momento nadie va a
actualizar, y un sistema de cobranza que miente es peor que no tener sistema.

**La base entrega magnitudes; la aplicación interpreta.** La base dice cuántos días y cuánta
plata; la app decide de qué color se muestra. Si la derivación viviera en la app, en seis meses
habría dos definiciones de "saldo" que no coinciden. Si el color viviera en la base, cada
cambio de criterio visual sería una migración.

La aplicación **no recalcula** lo que la base deriva: no se suman importes en el navegador.

---

## Seguridad

La `anon key` de Supabase es pública por diseño —viaja en el bundle que baja el navegador— así
que lo que protege los datos no es esconderla, es la RLS:

- Row Level Security **activada y forzada** en las cuatro tablas.
- Políticas solo para el rol `authenticated`. Al rol `anon` se le revocó todo, incluidas las
  secuencias: sin sesión no se lee, no se escribe y no se piden números.
- Las vistas usan `security_invoker = true`, así que evalúan la RLS de quien consulta y no de
  quien las creó.
- Verificado con un login real de punta a punta, no solo a nivel de rol.

Hay datos de personas reales que no eligieron estar ahí. Ninguna credencial va al repositorio
y ninguna URL con datos reales queda sin autenticación.

---

## Cómo correrlo

Primero **entrar a la carpeta del proyecto**. Los comandos de npm se corren siempre
adentro del proyecto, nunca en la carpeta de usuario: npm trata la carpeta actual como
raíz y puede tocar lo que encuentre ahí.

```powershell
cd $HOME\Documents
git clone https://github.com/tato22-alt/taller-el-semaforo-app.git
cd taller-el-semaforo-app     # <-- sin este paso, npm install no hace nada útil
npm install
npm run dev
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta el servidor de desarrollo y muestra la dirección en consola |
| `npm test` | Corre los tests una vez |
| `npm run test:ver` | Los deja corriendo y re-ejecuta al guardar |
| `npm run build` | Chequea los tipos y compila a `dist/` |

Para leer la base hace falta un `.env` en la raíz, tomando `.env.example` como referencia.
Sin él la app levanta igual y avisa que falta configurar la conexión.

Requiere Node 22 o más nuevo.

---

## Stack

Vite + React + TypeScript (`strict`, sin `any`), compilado a estático y servido por GitHub
Pages. Vitest para los tests. Supabase (PostgreSQL + Auth + RLS) como base y como API.

Los tipos de la base no se escriben a mano: se generan desde el esquema.

### Estructura

```
src/
  dominio/   lógica pura. Sin React, sin Supabase, sin fetch
  datos/     única capa que conoce Supabase. Devuelve tipos del dominio
  ui/        componentes y pantallas. No conoce Supabase
```

La regla se verifica leyendo los imports: si un componente necesita el cliente de Supabase, la
capa de datos está incompleta.

---

## Cómo se trabaja: SDD

Spec-Driven Development. La especificación es el documento fuente y el código es su
traducción; primero se define *qué* tiene que pasar y dónde termina, después *cómo* se hace.
El orden es **spec → plan → tareas → implementación**, y ninguna migración ni pantalla se
escribe sin una spec aprobada.

Cómo se lee y se revisa cada capa está en [`specs/README.md`](./specs/README.md).

Una tarea termina cuando **funciona y se vio funcionar**, no cuando el código está escrito.

---

## Los otros dos repositorios

| Repo | Qué contiene |
|---|---|
| [`gestion-taller-sql-server`](https://github.com/tato22-alt/gestion-taller-sql-server) | El modelo de datos: migraciones, vistas, RLS, y la constitución de principios que manda sobre los tres repos |
| [`semaforo-presupuesto`](https://github.com/tato22-alt/semaforo-presupuesto) | La herramienta de presupuestos en producción |

---

## Nota

Proyecto en desarrollo, sobre un problema operativo real. Los datos del taller no están en
este repositorio.
