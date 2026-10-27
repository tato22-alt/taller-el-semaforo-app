// @ts-check
/* El calendario del taller (spec 015 de semaforo-base): qué hay que hacer para que el calendario diga lo
 * mismo que la base. Lo puro: no habla con Google. Lo hace calendario.js con lo que decide esto.
 *
 * La base da las fechas de hoy en adelante, cada una con su marca ("turno-12", "vence-40", "pago-7").
 * Los eventos del robot llevan esa marca guardada adentro. Comparando las dos listas por la marca:
 *   - una fecha sin evento se crea;
 *   - un evento cuya fecha, título o descripción cambió se cambia (un turno que se pasó a otro día se
 *     mueve, no se borra y se crea: el evento sigue siendo el mismo);
 *   - un evento cuya marca la base ya no da se borra (un turno deshecho, una orden que se facturó), y
 *     también el segundo de dos eventos con la misma marca, si alguna vez quedó uno repetido.
 * Los eventos sin marca no llegan acá: son de las personas, y el robot no los toca (RF-1504). */

/**
 * @typedef {{ marca: string, fecha: string, titulo: string, descripcion: string }} FechaDelCalendario
 * @typedef {FechaDelCalendario & { id: string }} EventoDelRobot
 * @typedef {{ crear: FechaDelCalendario[], cambiar: { id: string, fecha: FechaDelCalendario }[], borrar: string[] }} PlanDelCalendario
 */

/**
 * @param {readonly FechaDelCalendario[]} fechas lo que dice la base, de hoy en adelante
 * @param {readonly EventoDelRobot[]} eventos los eventos con la marca del robot, de hoy en adelante
 * @returns {PlanDelCalendario}
 */
function planDelCalendario(fechas, eventos) {
  /** @type {Map<string, FechaDelCalendario>} */
  const porMarca = new Map()
  for (const f of fechas) if (!porMarca.has(f.marca)) porMarca.set(f.marca, f)

  /** @type {Set<string>} */
  const conEvento = new Set()
  /** @type {PlanDelCalendario} */
  const plan = { crear: [], cambiar: [], borrar: [] }
  for (const e of eventos) {
    const f = porMarca.get(e.marca)
    if (f === undefined || conEvento.has(e.marca)) {
      plan.borrar.push(e.id)
      continue
    }
    conEvento.add(e.marca)
    if (e.fecha !== f.fecha || e.titulo !== f.titulo || e.descripcion !== f.descripcion) plan.cambiar.push({ id: e.id, fecha: f })
  }
  plan.crear = [...porMarca.values()].filter((f) => !conEvento.has(f.marca))
  return plan
}
