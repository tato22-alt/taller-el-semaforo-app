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
 * Los eventos sin marca son de las personas, y el robot no los toca (RF-1504), salvo uno: el que es
 * idéntico a una fecha que el robot tiene que crear (el mismo día, título y descripción). Ése lo creó el
 * robot y Google lo cortó antes de que le pusiera la marca: en vez de crear otro igual, se le pone. */

/**
 * @typedef {{ marca: string, fecha: string, titulo: string, descripcion: string }} FechaDelCalendario
 * @typedef {FechaDelCalendario & { id: string }} EventoDelRobot
 * @typedef {{ id: string, fecha: string, titulo: string, descripcion: string }} EventoSinMarca
 * @typedef {{ crear: FechaDelCalendario[], marcar: { id: string, marca: string }[], cambiar: { id: string, fecha: FechaDelCalendario }[], borrar: string[] }} PlanDelCalendario
 */

/**
 * @param {readonly FechaDelCalendario[]} fechas lo que dice la base, de hoy en adelante
 * @param {readonly EventoDelRobot[]} eventos los eventos con la marca del robot, de hoy en adelante
 * @param {readonly EventoSinMarca[]} [sinMarca] los de día completo sin marca, de hoy en adelante
 * @returns {PlanDelCalendario}
 */
function planDelCalendario(fechas, eventos, sinMarca = []) {
  /** @type {Map<string, FechaDelCalendario>} */
  const porMarca = new Map()
  for (const f of fechas) if (!porMarca.has(f.marca)) porMarca.set(f.marca, f)

  /** @type {Set<string>} */
  const conEvento = new Set()
  /** @type {PlanDelCalendario} */
  const plan = { crear: [], marcar: [], cambiar: [], borrar: [] }
  for (const e of eventos) {
    const f = porMarca.get(e.marca)
    if (f === undefined || conEvento.has(e.marca)) {
      plan.borrar.push(e.id)
      continue
    }
    conEvento.add(e.marca)
    if (e.fecha !== f.fecha || e.titulo !== f.titulo || e.descripcion !== f.descripcion) plan.cambiar.push({ id: e.id, fecha: f })
  }
  /** @type {Set<string>} */
  const usados = new Set()
  for (const f of porMarca.values()) {
    if (conEvento.has(f.marca)) continue
    const igual = sinMarca.find((e) => !usados.has(e.id) && e.fecha === f.fecha && e.titulo === f.titulo && e.descripcion === f.descripcion)
    if (igual === undefined) {
      plan.crear.push(f)
      continue
    }
    usados.add(igual.id)
    plan.marcar.push({ id: igual.id, marca: f.marca })
  }
  return plan
}
