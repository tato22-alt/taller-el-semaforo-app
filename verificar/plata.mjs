// La spec 013 en el navegador, contra una base simulada. Datos inventados.
import { createRequire } from 'node:module'
const require = createRequire('/opt/node-tools/node_modules/')
const { chromium } = require('playwright')
import { createServer } from 'node:http'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join, extname } from 'node:path'
const DIST = process.argv[2], SALIDA = process.argv[3]
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((req, res) => {
  let p = req.url.split('?')[0].replace('/taller-el-semaforo-app', ''); if (p === '/' || p === '') p = '/index.html'
  const f = join(DIST, p); if (!existsSync(f)) { res.writeHead(404); return res.end() }
  res.writeHead(200, { 'content-type': tipos[extname(f)] ?? 'application/octet-stream' }); res.end(readFileSync(f))
}).listen(4173)
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
const mas = (d) => { const [a, m, dd] = hoy.split('-').map(Number); return new Date(Date.UTC(a, m - 1, dd + d)).toISOString().slice(0, 10) }
const mes = hoy.slice(0, 7) + '-01'
let salidas = [
  { id_salida: 7, id_trabajo: 3, salio: mas(-1), dias: 1, numero_presupuesto: 16010, patente: 'AB123CD', vehiculo: 'Ford Ka', cliente: 'PEREZ JUAN', telefono: '2255123456', total_presupuesto: '500000.00', contestada: false },
  { id_salida: 8, id_trabajo: 4, salio: hoy, dias: 0, numero_presupuesto: 16012, patente: 'AC456EF', vehiculo: 'VW Gol', cliente: 'María Gómez', telefono: '2255654321', total_presupuesto: '320000.50', contestada: false },
]
let deudas = [{ id_deuda: 4, deudor: 'Carlos Ruiz', telefono: '2255111222', detalle: null, numero_presupuesto: 16001, patente: 'KLM321', vehiculo: 'Fiat Palio', monto: '150000.00', pagado: '50000.00', saldo: '100000.00', fecha: mas(-40), dias: 40, pagos: 1, ultimo_pago: mas(-20), se_puede_deshacer: false }]
let cobros = []
let proveedores = [{ cuit: '30000000004', nombre: 'PINTURERIA INVENTADA SRL', rubro: null }]
const escrituras = []
const sesion = (vePlata) => JSON.stringify({ access_token: 'falso', refresh_token: 'falso', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: '00000000-0000-0000-0000-000000000001', email: 'taller@ejemplo.com', app_metadata: { rol: 'persona', ...(vePlata ? { ve_plata: true } : {}) }, aud: 'authenticated' } })
async function rutas(page) {
  await page.route('http://mock.local/**', async (route) => {
    const req = route.request(); const url = new URL(req.url()); const t = url.pathname.replace('/rest/v1/', '')
    if (url.pathname.startsWith('/auth/v1/')) return route.fulfill({ json: {} })
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      escrituras.push(`${req.method()} ${t}${url.search} ${req.postData() ?? ''}`)
      const c = req.postData() ? JSON.parse(req.postData()) : null
      if (t === 'cobro_particular' && req.method() === 'POST') {
        if (c.id_salida) salidas = salidas.filter((s) => s.id_salida !== c.id_salida)
        if (c.id_deuda) deudas = deudas.map((d) => d.id_deuda === c.id_deuda ? { ...d, pagado: '90000.00', saldo: '60000.00', pagos: 2 } : d)
        cobros = [{ id_cobro: 20 + cobros.length, cuando: c.id_deuda ? 'deuda' : 'al_salir', monto: c.monto, fecha: c.fecha, quien: c.id_deuda ? 'Carlos Ruiz' : 'PEREZ JUAN', patente: 'AB123CD', vehiculo: 'Ford Ka', detalle: null, se_puede_deshacer: true }, ...cobros]
      }
      if (t === 'deuda_particular' && req.method() === 'POST') {
        if (c.id_salida) salidas = salidas.filter((s) => s.id_salida !== c.id_salida)
        deudas = [...deudas, { id_deuda: 30 + deudas.length, deudor: c.deudor, telefono: c.telefono, detalle: c.detalle ?? null, numero_presupuesto: c.detalle ? null : 16012, patente: c.detalle ? null : 'AC456EF', vehiculo: c.detalle ? null : 'VW Gol', monto: c.monto, pagado: '0.00', saldo: c.monto, fecha: c.fecha, dias: 0, pagos: 0, ultimo_pago: null, se_puede_deshacer: true }]
      }
      if (t === 'proveedor' && req.method() === 'PATCH') { proveedores = []; return route.fulfill({ json: [{ cuit: '30000000004' }] }) }
      if (t === 'importacion') return route.fulfill({ status: 201, json: { id_importacion: 12 } })
      return route.fulfill({ status: 201, body: '' })
    }
    const json = {
      vw_autos_en_taller: [], vw_presupuestos: [],
      vw_plata_al_salir: salidas, vw_deudas_particulares: deudas, vw_cobros_particulares: cobros,
      vw_te_deben: [{ quien: 'companias', monto: '40200000.00', cuantas: 52, desde: '2025-01-03' }, { quien: 'particulares', monto: '100000.00', cuantas: deudas.length, desde: mas(-40) }],
      vw_plata_mes: [
        { mes, facturado: '20407059.00', cobrado_companias: '9199089.00', pagado_sin_importe: '3100000.00', cobrado_particulares: '820000.00', comprado: '6240500.75', iva_ventas: '3541721.00', iva_compras: '1010000.00', retenciones_iva: '1206963.00', retenciones: '1706127.00', iva_estimado: '1324758.00', comprobantes_ventas: 21, comprobantes_compras: 34 },
        { mes: '2026-09-01', facturado: '23463840.00', cobrado_companias: '7553531.00', pagado_sin_importe: '0.00', cobrado_particulares: '0.00', comprado: '5100000.00', iva_ventas: '900000.00', iva_compras: '800000.00', retenciones_iva: '1982376.00', retenciones: '2796913.00', iva_estimado: '-1882376.00', comprobantes_ventas: 20, comprobantes_compras: 30 }],
      vw_compras_mes: [
        { fila: 'mes', rubro: null, cuit: null, proveedor: null, comprado: '6240500.75', comprobantes: 34, mes_anterior: '5100000.00', en_el_anio: '58300000.00' },
        { fila: 'rubro', rubro: 'repuestos', cuit: null, proveedor: null, comprado: '4800000.00', comprobantes: 20, mes_anterior: '4000000.00', en_el_anio: '45000000.00' },
        { fila: 'rubro', rubro: 'sin_rubro', cuit: null, proveedor: null, comprado: '940500.75', comprobantes: 6, mes_anterior: '0.00', en_el_anio: '940500.75' },
        { fila: 'rubro', rubro: 'servicios', cuit: null, proveedor: null, comprado: '500000.00', comprobantes: 8, mes_anterior: '1100000.00', en_el_anio: '12359499.25' },
        { fila: 'proveedor', rubro: 'repuestos', cuit: '30000000002', proveedor: 'AUTOPARTES INVENTADAS SA', comprado: '3900000.00', comprobantes: 14, mes_anterior: '2500000.00', en_el_anio: '31000000.00' },
        { fila: 'proveedor', rubro: 'repuestos', cuit: '30000000003', proveedor: 'REPUESTOS DEL SUR', comprado: '900000.00', comprobantes: 6, mes_anterior: '1500000.00', en_el_anio: '14000000.00' },
        { fila: 'proveedor', rubro: 'sin_rubro', cuit: '30000000004', proveedor: 'PINTURERIA INVENTADA SRL', comprado: '940500.75', comprobantes: 6, mes_anterior: '0.00', en_el_anio: '940500.75' },
        { fila: 'proveedor', rubro: 'servicios', cuit: '30000000005', proveedor: 'COOPERATIVA ELECTRICA', comprado: '500000.00', comprobantes: 8, mes_anterior: '1100000.00', en_el_anio: '12359499.25' }],
      proveedor: proveedores,
      vw_ventas: [{ fecha_emision: mes, tipo: 'Factura A', punto_venta: 2, numero: 3601, cuit_receptor: '30000000001', receptor: 'SEGUROS INVENTADOS', neto_gravado: '100000.00', iva: '21000.00', total: '121000.00' }],
      vw_compras: [{ fecha_emision: mes, tipo: 'Factura A', punto_venta: 5, numero: 77, cuit: '30000000002', proveedor: 'AUTOPARTES INVENTADAS SA', rubro: 'repuestos', neto_gravado: '50000.00', iva: '10500.00', total: '60500.00' }],
      vw_libro_retenciones: [], tipo_comprobante: [1, 3, 6, 11].map((codigo) => ({ codigo })), comprobante: [{ cuit_emisor: '30000000009' }], compra: [],
    }[t]
    if (json === undefined) return route.fulfill({ status: 404, json: { code: 'PGRST205', message: 'no existe' } })
    if (t === 'compra') return route.fulfill({ status: 200, headers: { 'content-range': '*/2' }, json: [] })
    return route.fulfill({ json })
  })
}
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const abrir = async (vePlata, hash) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true })
  const page = await ctx.newPage()
  await page.addInitScript((s) => localStorage.setItem('sb-mock-auth-token', s), sesion(vePlata))
  await rutas(page); page.on('pageerror', (e) => console.log('ERROR EN LA PÁGINA:', e.message)); page.on('dialog', (d) => d.accept())
  await page.goto('http://localhost:4173/taller-el-semaforo-app/' + hash); return page
}
// 1. Hoy, con Marcela (sin el permiso): la pregunta de la plata y quién debe.
let page = await abrir(false, '#/hoy')
await page.waitForSelector('.plata-pregunta')
console.log('MENÚ SIN PERMISO:', (await page.locator('.navegacion a').allInnerTexts()).join(' | '))
await page.screenshot({ path: `${SALIDA}/plata-hoy-1.png`, fullPage: true })
const p1 = page.locator('.plata-pregunta').first()
await p1.getByRole('button', { name: 'Pagó todo' }).click()
console.log('PROPONE:', await p1.locator('input').first().inputValue())
await p1.getByRole('button', { name: 'Anotar' }).click(); await page.waitForTimeout(400)
const p2 = page.locator('.plata-pregunta').first()
await p2.getByRole('button', { name: 'Quedó debiendo' }).click()
await p2.getByLabel('Cuánto quedó debiendo').fill('120.000')
await p2.getByLabel('Cuánto pagó ahora (si pagó algo)').fill('200.000,50')
await p2.getByRole('button', { name: 'Anotar' }).click(); await page.waitForTimeout(400)
console.log('WHATSAPP:', decodeURIComponent(await page.locator('.plata-deuda a.whatsapp').first().getAttribute('href')))
const d = page.locator('.plata-deuda').first()
await d.locator('input[inputmode=decimal]').fill('40.000'); await d.getByRole('button', { name: 'Pagó' }).click(); await page.waitForTimeout(400)
await page.locator('.anotar-deuda summary').click()
await page.getByLabel('O, si no tiene presupuesto acá, qué auto es').fill('Gol gris')
await page.locator('.anotar-deuda').getByLabel('Quién debe').fill('Ana López')
await page.locator('.anotar-deuda').getByLabel('Cuánto debe').fill('15.000')
await page.getByRole('button', { name: 'Anotar la deuda' }).click(); await page.waitForTimeout(400)
await page.locator('details', { hasText: 'Anotado esta semana' }).locator('summary').first().click()
await page.screenshot({ path: `${SALIDA}/plata-hoy-2.png`, fullPage: true })
console.log('SECCIONES HOY:', (await page.locator('.hoy h3').allInnerTexts()).join(' | '))
await page.goto('http://localhost:4173/taller-el-semaforo-app/#/plata'); await page.waitForSelector('.plata')
console.log('SIN PERMISO VE:', await page.locator('.plata p').first().innerText())
// 2. La plata del taller, con el dueño.
page = await abrir(true, '#/plata')
await page.waitForSelector('.plata-rubro')
console.log('MENÚ CON PERMISO:', (await page.locator('.navegacion a').allInnerTexts()).join(' | '))
await page.locator('.plata-rubro summary').first().click()
await page.screenshot({ path: `${SALIDA}/plata-mes-1.png`, fullPage: true })
console.log('RUBROS:', (await page.locator('.plata-rubro summary').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')).join(' | '))
await page.getByLabel('Rubro de PINTURERIA INVENTADA SRL').selectOption('pintura'); await page.waitForTimeout(400)
const [bajada] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Bajar la planilla/ }).click()])
await bajada.saveAs(`${SALIDA}/planilla-013.csv`); console.log('PLANILLA:', bajada.suggestedFilename())
await page.locator('select').first().selectOption('2026-09-01'); await page.waitForTimeout(300)
console.log('IVA SEPTIEMBRE:', (await page.locator('section', { hasText: 'IVA del mes' }).locator('li').last().innerText()).replace(/\s+/g, ' '))
// 3. Importar el archivo de Recibidos.
const T = '"Fecha de Emisión";"Tipo de Comprobante";"Punto de Venta";"Número Desde";"Número Hasta";"Cód. Autorización";"Tipo Doc. Emisor";"Nro. Doc. Emisor";"Denominación Emisor";"Nro. Doc. Receptor";"Tipo Cambio";"Moneda";"Imp. Neto Gravado Total";"Total IVA";"Imp. Total"'
writeFileSync(`${SALIDA}/recibidos-prueba.csv`, [T, '2026-10-05;1;5;77;77;1;80;30000000002;AUTOPARTES INVENTADAS SA;30000000009;1,00;$;50000,00;10500,00;60500,00', '2026-10-06;11;1;9;9;1;80;20000000001;PINTOR INVENTADO;30000000009;1,00;$;0,00;0,00;30000,00', '2026-10-07;99;1;9;9;1;80;20000000001;X;30000000009;1,00;$;0,00;0,00;1,00'].join('\r\n'))
await page.goto('http://localhost:4173/taller-el-semaforo-app/#/importar'); await page.waitForSelector('input[type=file]')
await page.setInputFiles('input[type=file]', `${SALIDA}/recibidos-prueba.csv`); await page.waitForSelector('.resumen')
console.log('IMPORTAR DICE:', (await page.locator('.resumen p').first().innerText()).replace(/\s+/g, ' '))
await page.getByRole('button', { name: 'Importar' }).click(); await page.waitForTimeout(500)
await page.screenshot({ path: `${SALIDA}/plata-importar.png`, fullPage: true })
console.log('DESPUÉS:', (await page.locator('.resumen').innerText()).replace(/\s+/g, ' '))
// Sin permiso, el mismo archivo no se importa.
page = await abrir(false, '#/importar'); await page.waitForSelector('input[type=file]')
await page.setInputFiles('input[type=file]', `${SALIDA}/recibidos-prueba.csv`); await page.waitForSelector('.resumen')
console.log('SIN PERMISO:', await page.locator('.resumen .error').innerText(), '| botón apagado:', await page.getByRole('button', { name: 'Importar' }).isDisabled())
console.log('ESCRITURAS:\n' + escrituras.map((e) => e.slice(0, 230)).join('\n'))
await browser.close(); server.close()
