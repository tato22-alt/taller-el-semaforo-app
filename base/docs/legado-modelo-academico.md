# El modelo académico en SQL Server

Registro del modelo con el que arrancó este repositorio, que **ya no describe la base de El
Semáforo**. El modelo vigente es PostgreSQL sobre Supabase, vive en `supabase/migrations/` y se
documenta en `docs/diccionario-datos.md`.

## Los scripts se retiraron del árbol

Los seis archivos `.sql` de la carpeta `scripts/` se borraron. Eran T-SQL ejecutable —`nvarchar`,
`getdate()`, `IDENTITY(1,1)`— y hacían que el repositorio pareciera un proyecto de SQL Server
cuando hace rato que no lo es. Lo que valía la pena de esa carpeta es este documento: el registro
de qué se derogó y por qué.

El contenido sigue entero en el historial de git y se recupera cuando haga falta:

```bash
git show 659f8c5:scripts/02_create_tables.sql     # las diez tablas
git show 659f8c5:scripts/06_stored_procedures.sql # los procedimientos
git ls-tree 659f8c5 scripts/                      # los seis archivos
```

## Lo que se conservaba, y dónde buscarlo

`Facturas`, `Cobros`, `Documentos`, `Comunicaciones`, `Peritos` y `CompaniasSeguro` se mantuvieron
como material de referencia para los features que todavía no existen: deuda, cobranza, facturación,
documentos y seguro. Esa referencia es el `git show` de arriba, no un archivo en el árbol. Cuando
cada uno de esos features llegue, su spec decide el modelo desde cero y mira el viejo si sirve —
nunca lo hereda.

La constitución (v3.0.0) dice que del modelo previo *"se conserva lo que representa correctamente el
negocio y se rediseña lo que no"*, y el plan del feature 001 decidió que `Facturas`, `Cobros`,
`Documentos`, `Comunicaciones`, `Peritos` y `CompaniasSeguro` **quedan como están hasta que su
feature las rediseñe o las elimine**. Se conservan como material de referencia para esos features,
no como algo que se pueda ejecutar.

`Casos` fue reemplazada por `trabajos`. Sigue en el script porque cinco tablas la referencian por
clave foránea, y borrarla dejaría el script roto — no porque siga vigente.

## Qué se retiró, y por qué

Lo que la constitución declaró derogado por violar los principios I y VI, más lo que agregó T019.
Cada corte quedó marcado con un comentario `DEROGADO` en el lugar donde estaba.

| Qué | Dónde estaba | Por qué |
|---|---|---|
| El enum de nueve estados de `Casos` | `02_create_tables.sql` | Principio I. Colapsaba tres ejes —operativo, financiero, documental— en una columna, y por eso no se podía consultar ninguno |
| `CasoItems.tipo` | `02_create_tables.sql` | RF-006. Los conceptos no se clasifican: el detalle lo escribe quien presupuesta |
| El estado `cobrada` de `Facturas` | `02_create_tables.sql` | Principio VI. Que una factura esté cobrada es derivado del saldo; almacenarlo garantiza que alguien lo desactualice |
| `trg_Casos_ActualizarFecha` | `07_triggers.sql`, retirado antes | Principio VI |
| `trg_Cobros_ActualizarFactura` | `07_triggers.sql`, retirado antes | Principio VI. Marcaba facturas como cobradas solo |
| `sp_CambiarEstadoCaso` | `06_stored_procedures.sql` | T019. Duplicaba la lista de estados del CHECK: dos definiciones del mismo dominio |
| El `UPDATE` de estado dentro de `sp_RegistrarCobro` | `06_stored_procedures.sql` | Principio VI. **Marcaba el caso como cobrado ante cualquier cobro sin factura, sin comparar montos: una seña cerraba un trabajo entero.** Es el caso que la constitución cita para prohibir que un automatismo escriba estados financieros |

## La decisión que estaba pendiente, resuelta

Quedaba abierto si la carpeta debía existir. Se resolvió por lo que costaba: alguien que abría el
repositorio veía seis archivos de SQL Server y concluía que el proyecto era de SQL Server. El
razonamiento del plan del 001 —que esas tablas no se tocan en este feature— se respeta igual: no se
rediseñaron ni se migraron, sólo dejaron de estar en el árbol. El material sigue disponible en el
historial, que es donde corresponde que viva algo que no se ejecuta.
