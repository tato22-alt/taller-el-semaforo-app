# Plan 003 — Verificación del presupuesto impreso

**Spec:** `specs/003-verificacion/spec.md` · **Constitución:** v3.0.0
**Estado:** borrador, esperando confirmación de Luciano antes de tocar el esquema (principio X)

---

## Decisiones

### D1 — Una columna en `trabajos`, no una tabla aparte

`codigo_verificacion text not null`, con `default` que lo genera la base.

Es un atributo del presupuesto, uno por presupuesto, que nace con él y no cambia. Una tabla aparte
sólo agregaría un join sin habilitar ninguna consulta nueva.

### D2 — Almacenado, no derivado — y por qué eso no contradice el principio II

El principio II dice que lo que se puede derivar no se almacena. Este código **no se puede derivar**:
es un valor aleatorio, y esa es exactamente la propiedad que lo hace servir (RF-202). Un código
calculado a partir del número, la fecha y el total sí sería derivable — y entonces cualquiera con la
fórmula fabricaría códigos válidos. La aleatoriedad es el requisito, no una comodidad.

### D3 — Formato: 8 dígitos hexadecimales en mayúscula, con guión al medio

`A1B2-C3D4`. Un `CHECK` cierra el dominio: `^[0-9A-F]{4}-[0-9A-F]{4}$` (principio IV: los CHECK se
reservan para dominios cerrados, y esto lo es).

Por qué hexadecimal y no un alfabeto más grande: el alfabeto hex —`0123456789ABCDEF`— **no tiene
ninguna letra que se confunda con un dígito**. No hay O contra 0, ni I o L contra 1. Alguien que lee
el código por teléfono o lo copia de un papel arrugado no se equivoca.

Son 4.294.967.296 combinaciones. Adivinar el código de un presupuesto concreto es una posibilidad en
cuatro mil millones; de sobra para el problema, y corto para leerlo en voz alta.

### D4 — Aleatoriedad de verdad: `pgcrypto`

`gen_random_bytes(4)` de `pgcrypto`, no `random()`. `random()` es un generador predecible: quien
observe unos cuantos códigos podría anticipar los siguientes, que es justo el ataque que esto tiene
que frenar. La extensión se agrega igual que `pg_trgm` y `unaccent` en su momento.

Codificar 4 bytes en hexadecimal es una correspondencia exacta, así que **no hay sesgo**: los cuatro
mil millones de códigos son igual de probables.

### D5 — Sin restricción de unicidad

Verificar es siempre por el par (número, código), y el número ya es único. Dos presupuestos distintos
con el mismo código no confundirían a nadie.

Y hay una razón práctica: un `unique` sobre un valor generado por `default` convierte una colisión
—improbable, pero posible— en un error en la cara de quien está presupuestando, sin forma de
reintentar automáticamente. El costo supera al beneficio.

### D6 — No se blindan los privilegios por columna, y conviene saberlo

Se evaluó revocarle a `authenticated` el INSERT y el UPDATE sobre esta columna, para que ni la propia
aplicación pueda elegir un código. **No se hace**, por dos motivos:

1. No funcionaría: el rol tiene el privilegio a nivel tabla, y en PostgreSQL revocar a nivel columna
   no le quita lo que ya tiene concedido sobre la tabla entera. Habría que rehacer los permisos
   columna por columna, y cada columna futura quedaría sin conceder hasta que alguien se acuerde.
2. No está en el modelo de amenaza (spec): el taller falsificando sus propios documentos no es lo que
   esto previene, y ninguna medida de este repositorio lo previene.

La garantía real es otra y es suficiente: **la aplicación no envía la columna**, así que el valor lo
pone el `default` de la base. Queda escrito acá para que nadie lo "arregle" sin entender el motivo.

### D7 — Expuesto en `vw_presupuestos`

Se agrega la columna al final de la vista (RF-204). `CREATE OR REPLACE VIEW` admite agregar columnas
al final sin tocar las existentes. Los permisos no cambian: `authenticated` ya tiene SELECT sobre la
vista y `anon` no tiene nada (RF-206 queda cubierto por lo que ya existe, y el QA lo verifica).

### D8 — Verificar es una consulta, no una función

RF-205 se resuelve con un SELECT sobre `vw_presupuestos` filtrando por número y comparando código.
No se agrega una función: no habilita ninguna decisión que la consulta no habilite (principio V), y
cada objeto de más es superficie que alguien tiene que mantener.

```sql
select numero_presupuesto, fecha_presupuesto, cliente_actual, monto_total,
       codigo_verificacion = 'A1B2-C3D4' as codigo_coincide
from vw_presupuestos
where numero_presupuesto = 16043;
```

Si no devuelve filas, ese presupuesto no existe. Si devuelve una con `codigo_coincide = false`, el
papel fue alterado.

---

## Tareas

- **T301** — Migración: extensión `pgcrypto`, función generadora, columna con `default` y `CHECK`,
  y la vista actualizada. Un solo archivo: es un cambio indivisible, un presupuesto sin código no
  puede existir en ningún momento intermedio.
- **T302** — Agregar al QA (`qa-001-verificacion.sql`) los seis criterios de aceptación de la spec.
- **T303** — Actualizar `docs/diccionario-datos.md` con la columna nueva.
- **T304** — Del lado de la herramienta web (otro repositorio): imprimir el código junto al total y
  la marca de agua.

## Riesgos

- **Filas ya existentes.** La columna se agrega `not null` con `default`, así que PostgreSQL reescribe
  la tabla y le asigna un código a cada fila que ya esté. Con el volumen actual es instantáneo.
- **Reedición.** La aplicación hace `PATCH` sin nombrar esta columna, así que el código sobrevive
  (RF-203). El QA lo verifica en vez de confiar en que siga siendo cierto.
