# El robot de cobranzas — fase 0

Lee los avisos de pago que llegan al Gmail del taller y los anota en una planilla de Google:
qué compañía pagó, qué factura nombra, cuánto, y qué le retuvieron. También anota las facturas
que el taller mandó con el asunto estándar (`factura n°… siniestro n°…`).

Empezó como la fase 0 del plan 005: juntar los 21 meses de avisos en un lugar, con su texto, para
medir contra mails reales cuánto acierta cada lector. **Desde la fase 2 (2026-10-22) también los sube
a la base**, con las órdenes de trabajo y los envíos de factura (ver las versiones, abajo). Lo que no
entiende queda a la vista, nunca se descarta en silencio.

| Archivo | Qué es |
|---|---|
| `lectores/` | Un lector por compañía, cada uno en su archivo: funciones puras, con tests (`lectores.test.ts`) |
| `barrido.js` | Lo que habla con Gmail y Drive: busca en Gmail, guarda los PDF en Drive, les saca el texto, escribe la planilla |
| `calendario.js` | Lo que habla con Google Calendar (spec 015): deja el calendario "El Semáforo" igual a las fechas de la base. Qué crear, cambiar o borrar lo decide `lectores/calendario.js`, con tests (`calendario.test.ts`) |
| `robot.gs` | **Lo que se pega en Apps Script**: todo lo anterior junto en un archivo. Se arma con `node robot/armar.mjs`; un test falla si quedó viejo |
| `appsscript.json` | Los permisos. **Leer Gmail, nunca mandar ni borrar**, y desde el 2026-10-27, Google Calendar: un test verifica que la lista sea ésa y nada más |

### Qué compañías lee, y de dónde

| Compañía | Lee | Control de cierre |
|---|---|---|
| Federación Patronal | El cuerpo del mail: fecha, egreso, facturas, lo transferido y las retenciones | No: el mail no trae el bruto |
| La Segunda | El asunto: el número de factura. Los importes están en el PDF, que todavía no se lee | No |
| LPS | El PDF, en sus dos formas (la de antes y la de mayo de 2026): cada factura con su bruto, el SUBTOTAL, las retenciones y el TOTAL | **Sí** |
| Cooperación | El PDF de la orden de pago: cada factura con su bruto, las retenciones, la transferencia con su fecha, y el número del comprobante de Ganancias | **Sí** |
| Provincia | El PDF de la orden de pago y sus certificados: cada factura con su bruto y sus retenciones (juntas por impuesto, con su certificado) y el total pagado | **Sí** |
| Río Uruguay | El PDF: la factura, el siniestro, el total a pagar y cada certificado con su número | **Sí** |
| Nación | El PDF: cada factura con su bruto, sus retenciones con certificado y su neto | **Sí** |
| San Cristóbal | El PDF, en sus dos formatos: el recibo a proveedor (con factura y bruto) y el de indemnización (siniestro y neto, a veces dos recibos en un PDF) | **Sí**: en el de indemnización, con las bases de Ganancias e IVA de los certificados |
| Sancor | El PDF "Orden de Pago General": cada factura con su siniestro y su bruto, las retenciones y el total | **Sí** |
| Galicia / SURA | El cuerpo del mail: lo transferido, la orden y las facturas. Cuando sólo nombra la orden, el pago se anota sin facturas: están en un PDF que todavía no se lee | No |
| La Caja | El aviso de cobranzas.com: sólo que hubo un pago, su número de liquidación y la fecha. El detalle está en el portal | No |

**El control de cierre** es la manera que tiene un lector de desconfiar de sí mismo: si el aviso
dice el bruto, tiene que ser lo transferido más las retenciones, al centavo. Si no da, lo leído no
se da por bueno: el aviso queda como `no_cierra`, con la diferencia escrita. Así, cuando una
compañía cambie el formato de su PDF, el error se ve en vez de pasar como un pago.

**Los acuses van aparte.** "Recibimos tu factura" (Nación, Zurich por Grant), "tu factura fue
aprobada" (Mercantil, con la fecha estimada de pago) y "la fecha de pago es el …" (Allianz) no
son pagos: van a la pestaña **acuses**, nunca a *lineas*. Sirven para saber en qué anda cada
factura, pero no suman a lo cobrado (R3).

**Las claves tampoco se guardan.** Hay compañías que mandan el usuario y la clave del portal por
mail. El robot reemplaza lo que sigue a "contraseña" o "clave" (aunque venga en negrita, entre
asteriscos) antes de escribir la planilla o subir a la base, en el cuerpo y en el texto de los PDF
(`lectores/claves.js`).

**Los enlaces de acceso no se guardan.** Algunos avisos (cobranzas.com) traen un link que entra al
portal sin pedir clave. El robot lo reemplaza por *[enlace de acceso quitado por el robot]* antes
de escribir la planilla: es una credencial, y la regla es no guardar ninguna (R2).

Lo que todavía no tiene lector se guarda igual (`sin_lector`) y se lee el día que lo tenga.

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
     app*, *esta planilla*, *conectarse a un servicio externo* (es la API de Drive, para leer
     los PDF) y, desde el 2026-10-27, *tus calendarios* (ver abajo, la versión de esa fecha). Si
     pide **enviar** o **administrar** correo, pará: algo no se pegó bien.
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
  - `acuse`: no es un pago; el **motivo** dice de qué tipo (`acuse`, `aprobacion`, `fecha_prometida`, `autorespuesta`).
  - `sin_lector`: esa compañía todavía no tiene lector. El mail queda guardado y se lee cuando lo tenga.
- **lineas** · qué factura (o, en San Cristóbal, qué siniestro) nombra cada aviso, con su bruto y
  su neto. Si un pago cubre varias facturas y el aviso no dice cuánto se transfirió por cada una,
  `neto` queda vacío: el robot no reparte plata por su cuenta.
- **retenciones** · las que informa el aviso, con su certificado.
- **acuses** · lo que una compañía dijo de una factura sin pagarla: la recibió, la aprobó, o prometió una fecha.
- **enviados** · las facturas mandadas: número, siniestro u orden de compra. `respuesta` es un
  "Re:" o un reenvío, no un envío nuevo.
- **remitentes** · de quién se esperan avisos. **Se edita acá**: si una compañía empieza a
  mandar desde otra casilla, se agrega un renglón y la próxima corrida la busca.

Los PDF quedan en la carpeta **Cobranzas · avisos de pago (robot)** de ese Drive.

## Cuando se corrige o se agrega un lector

1. Se pega el `robot.gs` nuevo en el editor, en lugar del anterior.
2. Se ejecuta **`releer`**: vuelve a leer todos los avisos de la planilla con los lectores
   nuevos, **sin ir a Gmail**, y rehace *lineas* y *retenciones*.

## La versión del 2026-10-18: el id de Drive de cada PDF

La pestaña *avisos* suma una columna al final, **`pdfs_drive`**: el id de Drive de cada PDF, en el
mismo orden que los nombres de `pdfs`. Sirve para llegar al archivo desde la app y para distinguir
dos PDF del mismo día con el mismo nombre.

1. Pegá el `robot.gs` nuevo en lugar del anterior y guardá.
2. Ejecutá **`barrer`**. El encabezado de la columna nueva se agrega solo.

Los avisos que ya estaban guardados quedan con esa columna vacía. **Si todavía no llegó a "Al día."**,
conviene empezar de cero para que todos tengan su id: borrá las filas de *avisos*, *lineas*,
*retenciones* y *acuses* (dejando el encabezado), mandá a la papelera los PDF de la carpeta
"Cobranzas · avisos de pago (robot)" y volvé a ejecutar `barrer` hasta "Al día.".

## Las órdenes de trabajo (desde el 2026-10-18)

El barrido también trae las **órdenes de trabajo** de Orion (`sistemas@mg.sistema-orion.com`) y de
La Mercantil, a una pestaña nueva, **ordenes**: compañía, siniestro, patente, vehículo, perito, el
monto si el PDF lo dice claro, la franquicia y quién manda los repuestos, si el mail lo menciona.
Las anulaciones quedan con tipo `anulacion`; lo que no es una orden (un recordatorio), con `otro`.
Desde el 2026-10-20 lee también otras casillas y las órdenes que manda una persona: ver abajo.

**Se cargan solas** (spec 010, RF-1005, enmendado el 2026-10-18): después de leer Gmail, `barrer`
sube a la base cada orden que todavía no entró, de la más vieja a la más nueva, y anota en la
columna **base** qué contestó: `cargada`, `ya_estaba`, `reenvio` (la compañía mandó la misma orden
otra vez: se guarda igual, apuntando a la original, y no cuenta dos veces), `anulada`, o algo para
reintentar (`sin_compania`, `sin_siniestro`, `sin_orden_para_anular`, un error). Lo que no terminó se reintenta en la
próxima corrida. **Nada se pierde:** a la base van también el vehículo, la tasación de La Mercantil y
lo que dice el mail de la franquicia y los repuestos; y una anulación se puede deshacer desde la app. Si un campo no se pudo leer con seguridad, queda
vacío: mejor vacío que equivocado.

El robot entra a la base con **su propio usuario**, con rol `robot`, y sólo puede llamar a una
función (`fn_robot_guarda_orden`): no lee, no borra, no toca facturas. Para conectarlo, una vez:

1. En Supabase → Authentication → Users → **Add user**: un mail para el robot y una contraseña
   larga, con "Auto confirm" tildado.
2. Darle el rol `robot` (lo hace Claude con tu OK, o en el SQL Editor):
   `update auth.users set raw_app_meta_data = raw_app_meta_data || '{"rol":"robot"}' where email = '<mail del robot>';`
3. En el editor de Apps Script → Configuración del proyecto → **Propiedades del script**, cuatro:
   `SUPABASE_URL`, `SUPABASE_CLAVE_PUBLICA` (la publishable, la misma de la app), `ROBOT_MAIL` y
   `ROBOT_CLAVE`.
4. Pegá el `robot.gs` nuevo y ejecutá `barrer`.

Sin las propiedades, el robot sigue llenando la planilla y lo avisa en el registro: no se rompe nada.

## La versión del 2026-10-20: todas las casillas, y las órdenes para confirmar

La auditoría del 2026-10-19 (spec 010) midió que el robot veía ~62 % de las órdenes del último año.
Esta versión suma lo que faltaba.

**Entran solas, como las de antes** (RF-1015):

| De dónde | Qué lee |
|---|---|
| Orion, casillas viejas (`sistema.orion@cesvi.com.ar`, `sistemas@mg.cesvi.com.ar`) | Lo mismo que la de hoy. El `[EXTERNO]` delante del asunto se ignora |
| La Mercantil, casilla vieja (`no-responder@lamercantil.com.ar`) | El asunto viejo, `Orden de reparación – <asegurado> – <siniestro> – <patente>`, y sus anulaciones. **El asegurado no se guarda en ningún lado** |
| Nación, sistema Valua (`avisos@sistemavalua.info`) | El siniestro del asunto; la patente y el monto del PDF, si están claros |
| Cooperación (cualquier casilla `@cooperacionseguros.com.ar`) | Asunto con `ORDEN DE TRABAJO` y `STRO n/n`: el siniestro es ese `n/n`. El monto queda vacío hasta ver un PDF real |
| Zurich por Grant (`zurich@grant.com.ar`, desde el 2026-10-21) | `Zurich Seguros: Orden N - Siniestro S`: entra **para confirmar**, con el número de Grant como referencia (puede ser la misma que llegó por Orion) |

Nunca se leen como órdenes: las órdenes de pago, las de compra (`Orden de compra`, y en Cooperación
`ORDEN - Siniestro`), la *Actualización de estado* y el *Aviso de Conformidad* de La Mercantil.

**Entran para confirmar** (RF-1014): las que manda una persona (un perito, un analista, un estudio),
que no tienen formato fijo. El robot reconoce las que *parecen* una orden: **el remitente o alguien en
copia es de un dominio de la pestaña `dominios_ordenes`, y el mail trae un PDF con nombre de orden**
(`ord rep…`, `orden de trabajo…`, `informeOrdenTrabajo`, `OT_…`). Suben a la base marcadas para
confirmar: en la app aparecen arriba de todo, con dos botones, *Es una orden* y *No es una orden*.
Hasta que alguien las confirma, no cuentan para los avisos. En la pestaña **ordenes**, la columna nueva
**`a_confirmar`** dice `sí`, y la columna **base** contesta `a_confirmar`.

- El siniestro sale del asunto (`Siniestro`, `Stro.`, `STRO`, con o sin `N°`/`Nro`) y, si no, del
  número que abre el asunto (como escribe Provincia), el tramo largo del asunto viejo de La Mercantil,
  el rotulado dentro del PDF y, por último, un número del nombre del PDF (nunca la tasación de La
  Mercantil ni un pedazo de un código). **Si no hay ninguno, la orden entra igual para confirmar**: la
  persona escribe el número al tocar "Es una orden". Es el único dato que se tipea, y sólo en ese caso.
- Si el mail trae varias órdenes (un PDF por siniestro), entra una y la **nota** lo avisa.
- El monto queda vacío: el PDF de una persona no tiene un formato conocido.
- **Antes de bajar nada**, el robot decide por el remitente, el asunto y los *nombres* de los
  adjuntos. Lo que no es una orden (avisos de pago, pólizas) queda como `otro` y sus PDF no se suben
  a Drive (los de las casillas automáticas, sí). **Nada se pierde:** la fila `otro` guarda de quién es,
  el asunto, los adjuntos y con qué versión del lector se leyó (columnas `remitente`, `asunto`,
  `adjuntos`; la `nota` va a las observaciones de la orden).

### La pestaña `dominios_ordenes`

Dos columnas: **dominio** y **compañía**. **Las compañías las pone el robot**: la primera corrida llena
la pestaña, y cuando una versión nueva trae una compañía más, la agrega sola, una vez. Lo que se agrega
a mano se busca en la corrida siguiente, y un dominio que se borra no vuelve (el robot anota cuáles ya
ofreció en la propiedad `dominios_ofrecidos`).

- **Los estudios y peritos se agregan acá, a mano, nunca en el código** (el repo es público). Se
  escribe el dominio (`estudio-inventado.example`); si se pega un mail entero, el robot usa su dominio.
- **La compañía tiene que ser el nombre exacto de su ficha en la base** (`LPS`, `Río Uruguay`,
  `Mercantil Andina`…). Si un estudio trabaja para varias, se deja vacía: la persona la elige al
  confirmar. Un nombre mal escrito tampoco rompe nada: la orden entra igual, sin compañía.
- **No sirven los dominios de correo de todos** (`gmail.com`, `hotmail.com`, `outlook.com`…): el robot
  los ignora, porque traerían los PDF de cualquiera. Un perito con casilla de Gmail no entra por acá.
- Un mail que ya quedó como `otro` no se vuelve a mirar solo. Después de agregar un dominio, o de
  pegar un `robot.gs` con un lector mejor, se ejecuta **`releerOrdenesOtro`**: vuelve a traer de Gmail
  cada mail `otro`, y cada orden que la base no acepta porque le falta la compañía o el siniestro, y
  reemplaza su fila. Los PDF que ya están en Drive no se suben de nuevo. Si se corta por tiempo, se
  vuelve a ejecutar y sigue.

Para instalarla: pegá el `robot.gs` nuevo en lugar del anterior, guardá y ejecutá `barrer`. La pestaña
nueva y la columna `a_confirmar` se agregan solas. Antes, aplicá en Supabase la migración que acepta
las órdenes para confirmar: sin ella, la base no entiende `p_a_confirmar` y contesta un error, que el
robot reintenta en cada corrida sin perder nada.

## La versión del 2026-10-21: todas las compañías a las que se les factura

Luciano pidió que el robot espere órdenes de **todas las compañías a las que el taller les facturó
desde el 1/1/2025**. Las 17 ya tenían ficha en la base (y por eso la app las muestra al confirmar); al
cruzarlas con lo que llega a Gmail aparecieron tres huecos:

- **Orion mandaba órdenes de compañías que el lector no conocía**: Zurich, Galicia (y SURA, que hoy
  es Galicia, con el mismo CUIT) y Segurcoop. Quedaban en la planilla sin compañía, y la base no las
  aceptaba. Ahora entran con su ficha. Tampoco se cortaba bien el siniestro cuando la marca del auto
  no estaba en la lista (`CHRYSLER-JEEP-…`): ahora, si no reconoce la marca, toma las cifras del
  principio.
- **Faltaban seis dominios** para las órdenes que manda una persona: Rivadavia
  (`segurosrivadavia.com`), La Caja (`lacaja.com.ar`), Zurich (`zurich.com`), Experta
  (`experta.com.ar`), Galicia (`galiciaseguros.com.ar`) y San Jorge (`sanjorge-sa.com.ar`). El robot
  los suma solo a la pestaña `dominios_ordenes`.
- **Zurich avisa también por Grant** (`zurich@grant.com.ar`): "Zurich Seguros: Orden N - Siniestro S",
  la orden de adjudicación con la que se factura, sin PDF. Entra **para confirmar**, con la compañía,
  el siniestro y el número de Grant: muchas veces es el mismo trabajo que ya llegó por Orion, y así no
  se cuenta dos veces.

Para instalarla: pegá el `robot.gs` nuevo en lugar del anterior, guardá, ejecutá `barrer` hasta que
diga "Al día." y después, una vez, **`releerOrdenesOtro`**: es lo que hace entrar las órdenes de Zurich
y de Galicia que ya estaban en la planilla sin compañía.

## La versión del 2026-10-22: la factura de cada orden (spec 012)

El robot sube a la base, además de las órdenes, **cada mail con que el taller mandó una factura**
(pestaña *enviados*, columna nueva **`base`**). La base busca esa factura en ARCA y la orden de ese
siniestro, y si no hay dudas las vincula sola. Lo que contesta queda en la columna `base`:

| Respuesta | Qué quiere decir |
|---|---|
| `vinculada` | Listo: la orden ya tiene su factura |
| `ya_estaba` | Ese vínculo ya existía |
| `sin_factura_en_arca` | Falta subir el CSV de ARCA del mes. Al subirlo, la base lo vuelve a mirar sola |
| `varias_ordenes` | Hay orden y ampliación del mismo siniestro: la app te la propone y confirmás con un toque |
| `sin_orden` | No hay una orden de esa compañía con ese siniestro (no llegó por mail, o el siniestro está escrito distinto) |
| `factura_ambigua` / `sin_siniestro` | No se puede decidir: queda para mirar en la app |

Además, el barrido de *enviados* ahora encuentra los asuntos escritos a mano ("Factura : 3587
Siniestro:…", "Siniestro … Factura 3308"), y las adjudicaciones de Grant con siniestro "AUT" van a
**Zurich ex QBE** (es la misma orden que llega por Orion como ZAASA).

Para instalarla: aplicá la migración 28 en Supabase, pegá el `robot.gs` nuevo y ejecutá `barrer`.

## La versión del 2026-10-22, segunda: los avisos de pago van a la base (fase 2)

El robot sube a la base **cada aviso de pago y cada acuse** de la pestaña *avisos* (columna nueva
**`base`**), con lo que dice su lector hoy. Con eso:

- **La app muestra si la factura de cada orden está pagada**, pagada en parte, o aprobada con fecha
  de pago (un acuse no es un pago: se ve distinto).
- **Un aviso o un acuse que dicen la factura y el siniestro vinculan solos la orden**, como el mail
  de la factura. Es lo que resuelve las órdenes de las compañías que reciben la factura por portal:
  por ejemplo Mercantil, que avisa "tu factura fue aprobada" con el siniestro.

En la columna `base` queda lo que contestó: `guardado`, `releído`, y cuántas órdenes vinculó
(`guardado · vinculó 1 orden`). Si dice `error…`, la próxima corrida lo vuelve a intentar.

**Nada se borra en la base.** Cuando corregís un lector y corrés `releer`, los avisos cuya lectura
cambió se vuelven a subir: la base guarda la lectura nueva, que pasa a ser la que vale, y la vieja
queda guardada.

Para instalarla: pegá el `robot.gs` nuevo y ejecutá `barrer` hasta que diga "Al día.". La primera
vez sube todos los avisos de la planilla, así que puede llevar varias corridas. No hay que aplicar
nada en Supabase: la base ya está lista.

## La versión del 2026-10-23: Cooperación, Provincia y la forma nueva de LPS

Tres lectores, probados también contra las órdenes de pago reales (fuera del repo): todas cierran al
centavo. Y las claves se tapan aunque vengan en negrita.

Para instalarla:

1. Pegá el `robot.gs` nuevo en lugar del anterior y guardá.
2. Ejecutá **`releer`** una vez: vuelve a leer con los lectores nuevos los avisos que ya están en la
   planilla, sin ir a Gmail, y sube a la base los que cambiaron. Las órdenes de Cooperación y
   Provincia pasan de *sin lector* a *leído*, y las de LPS, de *no entendido* a *leído*.

## La versión del 2026-10-27: el calendario del taller (spec 015)

Una vez por hora, al final del barrido, el robot pone en un Google Calendar **"El Semáforo"**, de la
cuenta del taller:
- los turnos que se dan en Hoy;
- el vencimiento de cada orden sin factura, y un aviso un mes antes;
- las fechas en que una compañía prometió pagar.

Si algo cambia en la app, el evento se mueve o se borra solo. Lo que cargue una persona en el mismo
calendario (pagos, la VTV), el robot no lo toca nunca.

Para instalarla, desde la compu, con la cuenta del taller:

1. En el editor de Apps Script, pegá **los dos archivos**: el `appsscript.json` nuevo (tiene el permiso
   de Calendar) y el `robot.gs` nuevo. Guardá.
2. Arriba, elegí la función **`sincronizarCalendario`** y tocá **Ejecutar**.
   - Google pide un permiso nuevo: *ver, editar, compartir y borrar todos tus calendarios*. Suena a
     mucho, pero Apps Script no tiene un permiso más chico que deje crear un calendario. El robot sólo
     toca los eventos que marcó él, y **nunca invita a nadie** (un invitado recibiría un mail): un test
     lo verifica. **Permitir.**
   - Si además pide **enviar** correo, pará: algo no se pegó bien.
   - El registro dice cuántos eventos creó. La primera vez son unos 200: si dice *"quedan"*, ejecutalo
     otra vez. Después sigue solo con el activador de cada hora.
3. **Compartirlo.** En Google Calendar, en la compu: a la izquierda, en *Mis calendarios*, los tres
   puntos de **El Semáforo** → *Configuración y uso compartido* → *Compartir con personas específicas* →
   *Agregar personas*. Van los mails de los tres, con el permiso *Realizar cambios en eventos*, así
   cada uno puede agregar los suyos.
4. **Cada uno pone su aviso**, una sola vez: en Google, el aviso es de cada persona, no del evento.
   - Primero, aceptar el calendario: llega un mail de Google.
   - Después, en Google Calendar → *Configuración* → **El Semáforo** → *Notificaciones de eventos de
     todo el día* → *Agregar notificación* → **1 día antes, a las 8:00**.
5. **Los pagos a proveedores van en otro calendario, "Pagos", en la cuenta de Luciano**, no en la del
   taller: quien abre la cuenta del taller ve todos sus calendarios. Se crea en *Otros calendarios* →
   *+* → *Crear calendario*, y se comparte sólo con quien corresponda. Un pago que se repite se carga
   como evento que se repite, con su aviso.

**En la misma versión, una casilla nueva: Triunfo** (`triunfonet_erp@triunfoseguros.com`). Manda
"Notificación de Pago" con la orden de pago y el certificado de retención en PDF. El robot la suma sola
a la pestaña *remitentes*, y desde ahí guarda sus mails con el texto de los PDF. Quedan como *sin lector*
hasta que exista el suyo, que se escribe mirando esos textos.

Cómo se sabe que anda:
- **Enseguida:** en El Semáforo aparecen los vencimientos de las órdenes sin factura.
- **Con un turno en Hoy:** a la hora, el turno está en su día. Si se cambia el día, el evento se mueve.
  Si se deshace, desaparece.

## Lo que esta planilla NO es

- **No es la base.** Desde la fase 2 lo que importa está en Supabase, adonde el robot sube con un
  usuario `robot@` que sólo puede llamar a sus funciones (spec 005 §3, plan D2). La planilla se sigue
  escribiendo dos semanas para comparar, y después deja de usarse.
- **No va al repo.** Tiene datos reales (montos, números de factura, CBU enmascarados). El repo
  es público: acá sólo hay código y mails inventados para los tests.
