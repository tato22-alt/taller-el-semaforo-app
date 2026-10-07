# Spec 003 — Verificación del presupuesto impreso

**Estado:** EN PAUSA — Luciano decidió que la marca de agua alcanza, así que el código no se
imprime. Sin eso, el código no tiene para qué existir: la migración está escrita y verificada pero
**fuera de `supabase/migrations/`** (ver `migracion-no-aplicada.sql`), para que nadie aplique a la
base una columna que nada usa. Retomar esto es mover ese archivo de vuelta y correr el QA.
**Constitución:** v3.0.0
**Pedido de Luciano:** *"necesito agregar una marca de agua que impida la falsificación del documento,
tal vez sobre el total"*

---

## Por qué

El presupuesto se imprime y se entrega: al cliente, y en un siniestro también a la compañía. Ese papel
sale del taller y ya no está bajo su control. Alguien puede editar el PDF, cambiar un importe, o
inventar un presupuesto entero con el membrete del taller.

Hay que decirlo con todas las letras, porque cambia lo que esta spec promete: **un documento impreso no
se puede hacer infalsificable.** Cualquiera puede volver a tipearlo. Lo que sí se puede lograr es que un
falso sea **detectable en segundos** por quien tenga acceso al sistema.

La marca de agua —el disuasivo visual— la resuelve la herramienta web y no necesita nada de la base.
Esta spec es la otra mitad: **el dato que no se puede inventar.**

### Qué cubre y qué no

**Cubre:** alguien de afuera que altera un presupuesto emitido (cambia el total, la fecha, los
renglones) o que fabrica uno que nunca existió. En los dos casos el código no va a coincidir con lo que
dice la base, o directamente no va a existir.

**No cubre:** el propio taller falsificando sus documentos —tiene acceso legítimo al sistema, ninguna
medida técnica de acá lo frena— ni la copia literal de un presupuesto auténtico, que es válido por
definición. Tampoco resuelve nada si nadie verifica: el código sirve **si alguien lo consulta**.

---

## Requisitos

- **RF-201** — Todo presupuesto guardado lleva un código de verificación que **genera la base**, no la
  aplicación. Un presupuesto sin código no puede existir.
- **RF-202** — El código **no se deriva de los datos del presupuesto**. Es aleatorio. Si fuera un cálculo
  sobre el número, la fecha y el total, quien conozca la fórmula —y el código de la herramienta es
  público— podría producir un código válido para un presupuesto inventado.
- **RF-203** — Una vez asignado, el código **no cambia nunca**. Reeditar un presupuesto corrige sus
  datos pero conserva su código: el papel que ya se entregó tiene que seguir verificando.
- **RF-204** — El código se puede leer junto con el resto del presupuesto, para poder reimprimirlo igual
  que la primera vez.
- **RF-205** — Verificar es una sola consulta: dado un número de presupuesto y un código, la base tiene
  que poder decir si ese par existe y con qué total y qué fecha.
- **RF-206** — El rol anónimo no puede leer códigos. Verificar exige estar dentro del sistema.

## Fuera de alcance

- **Una página pública de verificación.** Obligaría a exponerle datos al rol anónimo, que hoy no puede
  leer nada (T008, D8). Es una decisión de seguridad seria y merece su propia spec.
- **Firma criptográfica y códigos QR.** Más maquinaria de la que este problema justifica hoy.
- **La marca de agua visual.** Es presentación: vive en la herramienta web, no en este repositorio
  (constitución, alcance).

## Preguntas que la base tiene que poder responder

1. ¿Existe el presupuesto N° 16043 con el código `A1B2-C3D4`, y por qué monto y fecha?
2. ¿Cuál es el código de un presupuesto, para reimprimirlo?

## Criterios de aceptación

1. Un presupuesto insertado sin especificar código igual queda con uno.
2. Dos presupuestos seguidos tienen códigos distintos.
3. Actualizar un presupuesto ya guardado no cambia su código.
4. El código respeta el formato declarado; uno que no lo respete es rechazado.
5. La consulta de verificación distingue un par (número, código) correcto de uno incorrecto.
6. El rol anónimo no puede leer el código por ningún camino.
