# El robot de cobranzas — fase 0

Lee los avisos de pago que llegan al Gmail del taller y los anota en una planilla de Google:
qué compañía pagó, qué factura nombra, cuánto, y qué le retuvieron. También anota las facturas
que el taller mandó con el asunto estándar (`factura n°… siniestro n°…`).

**Todavía no toca la base.** Es la fase 0 del plan 005: juntar los 21 meses de avisos en un lugar,
con su texto, para medir contra mails reales cuánto acierta cada lector antes de escribir nada en
Supabase. Lo que no entiende queda a la vista, nunca se descarta en silencio.

| Archivo | Qué es |
|---|---|
| `lectores/` | Un lector por compañía, cada uno en su archivo: funciones puras, con tests (`lectores.test.ts`) |
| `barrido.js` | Lo único que habla con Google: busca en Gmail, guarda los PDF en Drive, les saca el texto, escribe la planilla |
| `robot.gs` | **Lo que se pega en Apps Script**: todo lo anterior junto en un archivo. Se arma con `node robot/armar.mjs`; un test falla si quedó viejo |
| `appsscript.json` | Los permisos. **Leer Gmail, nunca mandar ni borrar**: un test verifica que la lista sea ésa y nada más |

### Qué compañías lee, y de dónde

| Compañía | Lee | Control de cierre |
|---|---|---|
| Federación Patronal | El cuerpo del mail: fecha, egreso, facturas, lo transferido y las retenciones | No: el mail no trae el bruto |
| La Segunda | El asunto: el número de factura. Los importes están en el PDF, que todavía no se lee | No |
| LPS | El PDF: cada factura con su bruto, el SUBTOTAL, las retenciones y el TOTAL | **Sí** |
| Río Uruguay | El PDF: la factura, el siniestro, el total a pagar y cada certificado con su número | **Sí** |
| Nación | El PDF: cada factura con su bruto, sus retenciones con certificado y su neto | **Sí** |
| San Cristóbal | El PDF, en sus dos formatos: el recibo a proveedor (con factura y bruto) y el de indemnización (sólo siniestro y neto) | Sí en el primero; en el segundo no hay bruto |
| Sancor | El PDF "Orden de Pago General": cada factura con su siniestro y su bruto, las retenciones y el total | **Sí** |

**El control de cierre** es la manera que tiene un lector de desconfiar de sí mismo: si el aviso
dice el bruto, tiene que ser lo transferido más las retenciones, al centavo. Si no da, lo leído no
se da por bueno: el aviso queda como `no_cierra`, con la diferencia escrita. Así, cuando una
compañía cambie el formato de su PDF, el error se ve en vez de pasar como un pago.

Cooperación, Provincia, Allianz y Mercantil todavía no tienen lector: sus mails se guardan igual
(`sin_lector`) y se leen cuando lo tengan.

## Instalarlo (una vez, ~10 minutos)

Todo con **la cuenta de Google del taller**, la del Gmail donde llegan los avisos. El robot corre
como esa cuenta y sólo ve lo que esa cuenta ve.

1. En Drive, **Nuevo → Hojas de cálculo de Google**. Ponele de nombre *Cobranzas · robot*.
2. En la planilla: **Extensiones → Apps Script**. Se abre el editor.
3. A la izquierda, el engranaje (**Configuración del proyecto**) → tildá **Mostrar el archivo de
   manifiesto "appsscript.json" en el editor**.
4. Volvé al editor (el ícono `< >`):
   - Abrí `appsscript.json`, borrá todo y pegá el `appsscript.json` de esta carpeta.
   - Abrí `Código.gs`, borrá lo que tiene y pegá **`robot.gs`** entero (en GitHub, el botón
     *Copy raw file* lo copia de una).
   - Guardá (el disquete).
5. Arriba, elegí la función **`barrer`** y tocá **Ejecutar**.
   - Google pide autorización. Va a decir **"Google no verificó esta app"**: es normal, la app
     es tuya. **Configuración avanzada → Ir a … (no seguro) → Permitir.**
   - Fijate qué pide: *ver tus mensajes de correo* (no enviar), *archivos de Drive que creó esta
     app*, *esta planilla* y *conectarse a un servicio externo* (es la API de Drive, para leer
     los PDF). Si pide **enviar** o **administrar** correo, pará: algo no se pegó bien.
6. Abajo aparece el registro. Cada corrida dura hasta 4 minutos y medio. Si termina con
   *"Quedan más"*, tocá **Ejecutar** otra vez, hasta que diga **"Al día."**
7. Para que siga solo: a la izquierda, el reloj (**Activadores**) → **Agregar activador** →
   función `barrer`, fuente *Según tiempo*, *Temporizador por horas*, *Cada hora* → Guardar.

## Qué mirar en la planilla

- **avisos** · un renglón por mail. La columna **estado** dice:
  - `leido`: se entendió. La columna **control** dice si cerró (`cierra`) o si el aviso no trae
    el bruto (`sin_bruto`).
  - `no_cierra`: se leyó, pero el bruto no es lo transferido más las retenciones. El **motivo**
    dice cuánto falta. Hay que mirarlo.
  - `no_entendido`: tiene lector, pero el mail no tuvo la forma esperada. El **motivo** dice por qué.
  - `sin_lector`: esa compañía todavía no tiene lector. El mail queda guardado y se lee cuando lo tenga.
- **lineas** · qué factura (o, en San Cristóbal, qué siniestro) nombra cada aviso, con su bruto y
  su neto. Si un pago cubre varias facturas y el aviso no dice cuánto se transfirió por cada una,
  `neto` queda vacío: el robot no reparte plata por su cuenta.
- **retenciones** · las que informa el aviso, con su certificado.
- **enviados** · las facturas mandadas: número, siniestro u orden de compra. `respuesta` es un
  "Re:" o un reenvío, no un envío nuevo.
- **remitentes** · de quién se esperan avisos. **Se edita acá**: si una compañía empieza a
  mandar desde otra casilla, se agrega un renglón y la próxima corrida la busca.

Los PDF quedan en la carpeta **Cobranzas · avisos de pago (robot)** de ese Drive.

## Cuando se corrige o se agrega un lector

1. Se pega el `robot.gs` nuevo en el editor, en lugar del anterior.
2. Se ejecuta **`releer`**: vuelve a leer todos los avisos de la planilla con los lectores
   nuevos, **sin ir a Gmail**, y rehace *lineas* y *retenciones*.

## Lo que esta planilla NO es

- **No es la base.** En la fase 2 lo mismo pasa a Supabase, con un usuario `robot@` que sólo
  puede insertar evidencia (spec 005 §3, plan D2). Hasta entonces, nada de acá suma a ningún saldo.
- **No va al repo.** Tiene datos reales (montos, números de factura, CBU enmascarados). El repo
  es público: acá sólo hay código y mails inventados para los tests.
