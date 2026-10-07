# Feature 007 — El borrador no se pierde

**Estado:** especificado, sin aprobar · **Depende de:** 001 (presupuesto), 006 (pendientes)
**Migraciones:** ninguna. Este feature no toca la base.

## El problema

Se carga un presupuesto a medias, se deja la pantalla para atender a alguien, y al volver no hay
nada. Pasa sobre todo en el celular: el navegador descarta la pestaña que quedó en segundo plano
para liberar memoria, y cuando se vuelve, la página se cargó de nuevo desde cero.

Hoy nada se escribe en ningún lado hasta que alguien aprieta **Guardar y hacer PDF** o **Dejar
pendiente**. Al abrir, la página siempre llama a `enBlanco()`, que limpia el formulario. Y el
aviso de `beforeunload` **no se dispara** cuando el navegador mata una pestaña en segundo plano:
ese evento es para cuando la persona navega o cierra, no para cuando el sistema decide por ella.

## Por qué no alcanza "Dejar pendiente"

El feature 006 permite guardar un trabajo sin número. Parece la solución, pero no lo es: **exige
un tap**. El bug ocurre exactamente cuando nadie tocó nada. Un mecanismo que depende de que la
persona se acuerde no arregla el caso de la persona que no se acordó.

## El borrador no es un hecho, es una intención

Un formulario a medio llenar no se guarda en la base, y no por falta de lugar: `trabajos` lo
aceptaría como pendiente. No va porque **todavía no es un hecho del taller**. Guardar cada
tecleo contra la base crearía filas de basura en `trabajos`, que además aparecen arriba de todo
en el historial (`nullsfirst`), y obligaría a tener red para escribir algo que nadie pidió
guardar.

Entonces el borrador es **local, de ese equipo, de ese usuario, y descartable**. Vive en
`localStorage` y desaparece en el momento en que el presupuesto se guarda de verdad. Eso no
contradice que la base sea la fuente de verdad: la base sigue teniendo todos los hechos. El
borrador es la red abajo del trapecio, no un registro.

## El evento correcto

`visibilitychange` cuando el documento pasa a `hidden` es la única señal confiable de "me pueden
matar en cualquier momento" en un celular. Se dispara cuando la persona cambia de app, bloquea
la pantalla o cambia de pestaña — antes de que el navegador decida descartar nada. `pagehide`
cubre el cierre. `beforeunload` queda como está, pero no es el mecanismo: no alcanza y nunca
alcanzó.

## Requisitos

- **RF-701** — El formulario se guarda solo en el equipo, sin que nadie apriete nada. Se escribe
  al pasar a `hidden` (`visibilitychange`), en `pagehide`, y además cada vez que se deja de
  escribir por un momento, para cubrir el caso del navegador que muere sin avisar.
- **RF-702** — Hay **un** borrador por usuario y por equipo. El nuevo sobrescribe al anterior. No
  se acumula una lista: eso sería un historial, y el historial ya existe y vive en la base.
- **RF-703** — El borrador guarda también **a qué trabajo pertenece**: el `id_trabajo`, el
  `id_cliente`, el `id_vehiculo` y el número, si los tenía. Sin eso, recuperar un presupuesto que
  se estaba reeditando crearía un trabajo nuevo en vez de seguir el que ya existía.
- **RF-704** — Al abrir la página, si hay un borrador, **no se restaura solo**. Aparece un aviso
  que dice de cuándo es y de quién era el presupuesto, con dos opciones: recuperarlo o
  descartarlo. Restaurar en silencio es peligroso: alguien podría estar reeditando un presupuesto
  ya emitido sin darse cuenta.
- **RF-705** — El borrador se borra cuando el presupuesto se guardó de verdad en la base — emitido
  o pendiente —, y cuando la persona aprieta **Nuevo presupuesto** y confirma descartar.
- **RF-706** — El borrador **sobrevive a que se venza la sesión**. Si el token expiró, se pide
  login de nuevo y después se ofrece recuperar. Perder el trabajo cargado porque venció un token
  es el mismo bug con otro disfraz.
- **RF-707** — El borrador de un usuario no se le ofrece a otro. En un equipo compartido, cada uno
  recupera lo suyo o no recupera nada.
- **RF-708** — Si el borrador no se puede leer, la página **abre normal y avisa**, ofreciendo
  descargar el contenido crudo antes de descartarlo. No se bloquea nada: un borrador ilegible es
  una red que falló, no un dato del taller en riesgo.
- **RF-709** — Si no se puede escribir el borrador — modo privado, almacenamiento lleno —, guardar
  contra la base **sigue funcionando**. Se avisa una vez que esta vez no hay red abajo. Nunca se
  bloquea un guardado real porque falló el respaldo local.

## Fuera de alcance

- Emitir sin conexión. Decidido por Luciano: queda afuera. Si no hay internet, la página avisa y
  no guarda, igual que hoy.
- Sincronizar borradores entre equipos. El borrador es de ese equipo; si querés que esté en todas
  partes, eso es "Dejar pendiente", que ya existe.
- Varios borradores a la vez.
- Restaurar desde CSV, que se removió al migrar a la base.
- Nada del impreso. Este feature no toca la maqueta, los campos, el redondeo, ni
  `window.print()`.

## Criterios de aceptación

Verificables, uno por uno, en el celular y no sólo en el escritorio.

| # | Qué se prueba | Qué tiene que pasar |
|---|---|---|
| CA-1 | Cargar medio presupuesto, cambiar de app hasta que el navegador descarte la pestaña, volver | Aparece el aviso y recupera todo: campos, renglones, importes, mano de obra |
| CA-2 | Cargar medio presupuesto y cerrar la pestaña de golpe | Al reabrir, mismo resultado que CA-1 |
| CA-3 | Guardar y hacer PDF, después reabrir | No se ofrece recuperar nada |
| CA-4 | Dejar pendiente, después reabrir | No se ofrece recuperar nada |
| CA-5 | Reeditar un emitido, cambiar algo, matar la pestaña, recuperar, guardar | Sigue siendo el mismo número, y en la base hay **un** trabajo, no dos |
| CA-6 | Nuevo presupuesto, confirmar descartar, reabrir | No se ofrece recuperar nada |
| CA-7 | Dañar el borrador a mano desde la consola y abrir | La página abre normal, avisa, y deja descargar el crudo |
| CA-8 | Dejar borrador con un usuario, cerrar sesión, entrar con otro | El segundo no ve el borrador del primero |
| CA-9 | Abrir en ventana privada con el almacenamiento bloqueado | Se puede guardar contra la base igual; avisa una vez que no hay respaldo local |
| CA-10 | Imprimir antes y después del cambio | El impreso sale idéntico: misma maqueta, mismo lugar en la hoja |

CA-1 es el único que prueba el bug de verdad y es el más molesto de reproducir. Si no se logra que
el navegador descarte la pestaña a mano, sirve forzarlo desde las herramientas de desarrollo
emulando el descarte — pero hay que decir cuál de las dos cosas se hizo, no darlo por bueno.

## Anotado al final — visto, no hecho

Cosas que aparecieron revisando el archivo y que no toco porque no están en el pedido.

1. **El CSV hace una consulta por presupuesto.** `descargarCSV()` pide el historial y después un
   `pedirTrabajo()` por cada fila, todos en paralelo. Con el tope de 200 son 200 pedidos de una
   sola vez. Hoy con pocos presupuestos no se nota; con el historial lleno va a tardar o a que la
   API empiece a rechazar. Se arregla con una sola consulta que traiga los renglones embebidos.
2. **`beforeunload` queda redundante.** Con el autoguardado puesto, el cartel de "hay cambios sin
   guardar" pasa a ser una molestia que no protege nada. Se puede sacar, pero es una decisión de
   uso, no técnica.
3. **"Restaurar desde CSV" ya no existe.** Tenía sentido cuando el CSV era el único respaldo. Hoy
   el respaldo es Supabase. Si lo querés de vuelta, es otro feature.
4. **`ESTADO.md` está desactualizado en un punto:** dice que la página conectada está en la rama
   `claude/conectar-base-datos` "sin PR todavía", pero `main` ya la tiene.
5. **El invariante E murió y acá revive parcialmente.** La vieja protección de "datos dañados
   bloquean el guardado" dejó de aplicar cuando los presupuestos salieron de `localStorage`.
   RF-708 trae su espíritu al único lugar donde todavía tiene sentido: el borrador.
