/* Tipos del esquema de la base.
 *
 * ⚠️  PROVISORIO — derivado a mano de las migraciones (supabase/migrations/ del repo privado semaforo-base), no generado.
 *
 * El CLAUDE.md dice que estos tipos no se escriben a mano, y tiene razón. Esto existe
 * porque `npx supabase gen types` no corre en la máquina de Luciano (npm roto), y
 * frenar la conexión entera por eso era peor. Se reemplaza en cuanto el comando corra:
 *
 *     npx supabase gen types typescript --project-id osslhkvdclrbukjqwpnt > src/datos/tipos-base.ts
 *
 * Está escrito con la forma exacta que produce el generador, así que ese reemplazo
 * debería ser un diff chico o vacío. Si sale grande, gana el generado.
 *
 * ⚠️  OJO CON `number` EN LOS MONTOS. Acá dicen `number` porque es lo que genera
 * Supabase para `numeric`, pero PostgREST los manda por la red como STRING, a propósito,
 * para no perder precisión en el float de JS: "importe": "15000.00". O sea que el tipo
 * miente, y miente igual en el archivo generado. Por eso la plata no se suma nunca en el
 * navegador y se formatea con `dominio/dinero.ts`, que acepta `string | number`.
 *
 * Fuente: las migraciones hasta 20261024130000_vistas_evidencia.sql (fase 2 de cobranzas, aplicada en
 * la base real el 2026-10-22). Las tablas de la evidencia (aviso, aviso_linea, acuse…) no están: la app
 * no las lee todavía.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      clientes: {
        Row: {
          id_cliente: number
          nombre: string
          nombre_norm: string | null
          telefono: string | null
          direccion: string | null
          email: string | null
          cuit: string | null
          creado_en: string
        }
        Insert: {
          id_cliente?: never
          nombre: string
          nombre_norm?: never
          telefono?: string | null
          direccion?: string | null
          email?: string | null
          cuit?: string | null
          creado_en?: string
        }
        Update: {
          id_cliente?: never
          nombre?: string
          nombre_norm?: never
          telefono?: string | null
          direccion?: string | null
          email?: string | null
          cuit?: string | null
          creado_en?: string
        }
        Relationships: []
      }
      vehiculos: {
        Row: {
          id_vehiculo: number
          patente: string
          patente_norm: string | null
          descripcion: string | null
          chasis: string | null
          id_cliente_ultimo: number | null
          creado_en: string
        }
        Insert: {
          id_vehiculo?: never
          patente: string
          patente_norm?: never
          descripcion?: string | null
          chasis?: string | null
          id_cliente_ultimo?: number | null
          creado_en?: string
        }
        Update: {
          id_vehiculo?: never
          patente?: string
          patente_norm?: never
          descripcion?: string | null
          chasis?: string | null
          id_cliente_ultimo?: number | null
          creado_en?: string
        }
        Relationships: [
          {
            foreignKeyName: 'vehiculos_id_cliente_ultimo_fkey'
            columns: ['id_cliente_ultimo']
            isOneToOne: false
            referencedRelation: 'clientes'
            referencedColumns: ['id_cliente']
          },
        ]
      }
      trabajos: {
        Row: {
          id_trabajo: number
          numero_presupuesto: number | null
          id_cliente: number | null
          id_vehiculo: number | null
          fecha_presupuesto: string | null
          txt_cliente: string | null
          txt_direccion: string | null
          txt_telefono: string | null
          txt_vehiculo: string | null
          txt_patente: string | null
          txt_chasis: string | null
          observaciones: string | null
          detalle_mano_obra: string | null
          monto_mano_obra: number
          no_concretado: boolean
          origen: string | null
          creado_en: string
          modificado_en: string
          origen_carga: string
        }
        Insert: {
          id_trabajo?: never
          numero_presupuesto?: number | null
          id_cliente?: number | null
          id_vehiculo?: number | null
          fecha_presupuesto?: string | null
          txt_cliente?: string | null
          txt_direccion?: string | null
          txt_telefono?: string | null
          txt_vehiculo?: string | null
          txt_patente?: string | null
          txt_chasis?: string | null
          observaciones?: string | null
          detalle_mano_obra?: string | null
          monto_mano_obra?: number
          no_concretado?: boolean
          origen?: string | null
          creado_en?: string
          modificado_en?: string
          origen_carga: string
        }
        Update: {
          id_trabajo?: never
          numero_presupuesto?: number | null
          id_cliente?: number | null
          id_vehiculo?: number | null
          fecha_presupuesto?: string | null
          txt_cliente?: string | null
          txt_direccion?: string | null
          txt_telefono?: string | null
          txt_vehiculo?: string | null
          txt_patente?: string | null
          txt_chasis?: string | null
          observaciones?: string | null
          detalle_mano_obra?: string | null
          monto_mano_obra?: number
          no_concretado?: boolean
          origen?: string | null
          creado_en?: string
          modificado_en?: string
          origen_carga?: string
        }
        Relationships: [
          {
            foreignKeyName: 'trabajos_id_cliente_fkey'
            columns: ['id_cliente']
            isOneToOne: false
            referencedRelation: 'clientes'
            referencedColumns: ['id_cliente']
          },
          {
            foreignKeyName: 'trabajos_id_vehiculo_fkey'
            columns: ['id_vehiculo']
            isOneToOne: false
            referencedRelation: 'vehiculos'
            referencedColumns: ['id_vehiculo']
          },
        ]
      }
      trabajo_items: {
        Row: {
          id_item: number
          id_trabajo: number
          orden: number
          detalle: string | null
          importe: number
        }
        Insert: {
          id_item?: never
          id_trabajo: number
          orden: number
          detalle?: string | null
          importe?: number
        }
        Update: {
          id_item?: never
          id_trabajo?: number
          orden?: number
          detalle?: string | null
          importe?: number
        }
        Relationships: [
          {
            foreignKeyName: 'trabajo_items_id_trabajo_fkey'
            columns: ['id_trabajo']
            isOneToOne: false
            referencedRelation: 'trabajos'
            referencedColumns: ['id_trabajo']
          },
        ]
      }
      /* M2 de cobranzas: datos maestros. El código de ARCA es la clave. */
      tipo_comprobante: {
        Row: {
          codigo: number
          nombre: string
          clase: string
        }
        Insert: {
          codigo: number
          nombre: string
          clase: string
        }
        Update: {
          codigo?: number
          nombre?: string
          clase?: string
        }
        Relationships: []
      }
      /* Una fila por CUIT (entidad fiscal). Sin contraseñas (RF-502). */
      compania: {
        Row: {
          cuit: string
          nombre: string
          alias: string[]
          remitentes_aviso: string[]
          mail_facturacion: string | null
          plazo_declarado_dias: number | null
          canal: string | null
          portal_url: string | null
          portal_usuario: string | null
          creado_en: string
        }
        Insert: {
          cuit: string
          nombre: string
          alias?: string[]
          remitentes_aviso?: string[]
          mail_facturacion?: string | null
          plazo_declarado_dias?: number | null
          canal?: string | null
          portal_url?: string | null
          portal_usuario?: string | null
          creado_en?: string
        }
        Update: {
          cuit?: string
          nombre?: string
          alias?: string[]
          remitentes_aviso?: string[]
          mail_facturacion?: string | null
          plazo_declarado_dias?: number | null
          canal?: string | null
          portal_url?: string | null
          portal_usuario?: string | null
          creado_en?: string
        }
        Relationships: []
      }
      compania_requisito: {
        Row: {
          id_requisito: number
          cuit: string
          descripcion: string
        }
        Insert: {
          id_requisito?: never
          cuit: string
          descripcion: string
        }
        Update: {
          id_requisito?: never
          cuit?: string
          descripcion?: string
        }
        Relationships: [
          {
            foreignKeyName: 'compania_requisito_cuit_fkey'
            columns: ['cuit']
            isOneToOne: false
            referencedRelation: 'compania'
            referencedColumns: ['cuit']
          },
        ]
      }
      regla_facturacion: {
        Row: {
          id_regla: number
          cuit_origen: string
          condicion: string
          cuit_destino: string
          nota: string | null
        }
        Insert: {
          id_regla?: never
          cuit_origen: string
          condicion: string
          cuit_destino: string
          nota?: string | null
        }
        Update: {
          id_regla?: never
          cuit_origen?: string
          condicion?: string
          cuit_destino?: string
          nota?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'regla_facturacion_cuit_origen_fkey'
            columns: ['cuit_origen']
            isOneToOne: false
            referencedRelation: 'compania'
            referencedColumns: ['cuit']
          },
          {
            foreignKeyName: 'regla_facturacion_cuit_destino_fkey'
            columns: ['cuit_destino']
            isOneToOne: false
            referencedRelation: 'compania'
            referencedColumns: ['cuit']
          },
        ]
      }
      /* M3: una corrida de importación. Las nuevas se cuentan, no se guardan. */
      importacion: {
        Row: {
          id_importacion: number
          fuente: string
          archivo_nombre: string
          archivo_hash: string
          filas_leidas: number
          creado_por: string | null
          creado_en: string
        }
        Insert: {
          id_importacion?: never
          fuente: string
          archivo_nombre: string
          archivo_hash: string
          filas_leidas: number
          creado_por?: string | null
          creado_en?: string
        }
        Update: {
          id_importacion?: never
          fuente?: string
          archivo_nombre?: string
          archivo_hash?: string
          filas_leidas?: number
          creado_por?: string | null
          creado_en?: string
        }
        Relationships: []
      }
      /* M3: un renglón del libro de ARCA. Los numeric llegan como string (ver filas.ts). */
      comprobante: {
        Row: {
          id_comprobante: number
          cuit_emisor: string
          tipo_codigo: number
          punto_venta: number
          numero: number
          fecha_emision: string
          cuit_receptor: string | null
          receptor_nombre: string | null
          moneda: string
          tipo_cambio: number
          neto_gravado: number
          iva: number
          total: number
          id_importacion: number
          creado_en: string
        }
        Insert: {
          id_comprobante?: never
          cuit_emisor: string
          tipo_codigo: number
          punto_venta: number
          numero: number
          fecha_emision: string
          cuit_receptor?: string | null
          receptor_nombre?: string | null
          moneda: string
          tipo_cambio?: number
          neto_gravado: number
          iva: number
          total: number
          id_importacion: number
          creado_en?: string
        }
        Update: {
          id_comprobante?: never
          cuit_emisor?: string
          tipo_codigo?: number
          punto_venta?: number
          numero?: number
          fecha_emision?: string
          cuit_receptor?: string | null
          receptor_nombre?: string | null
          moneda?: string
          tipo_cambio?: number
          neto_gravado?: number
          iva?: number
          total?: number
          id_importacion?: number
          creado_en?: string
        }
        Relationships: [
          {
            foreignKeyName: 'comprobante_tipo_codigo_fkey'
            columns: ['tipo_codigo']
            isOneToOne: false
            referencedRelation: 'tipo_comprobante'
            referencedColumns: ['codigo']
          },
          {
            foreignKeyName: 'comprobante_id_importacion_fkey'
            columns: ['id_importacion']
            isOneToOne: false
            referencedRelation: 'importacion'
            referencedColumns: ['id_importacion']
          },
        ]
      }
      /* M3: qué comprobante toca una nota, decidido por una persona. */
      comprobante_vinculo: {
        Row: {
          id_vinculo: number
          id_origen: number
          id_destino: number
          motivo: string
          confirmado_por: string
          confirmado_en: string
        }
        Insert: {
          id_vinculo?: never
          id_origen: number
          id_destino: number
          motivo: string
          confirmado_por?: string
          confirmado_en?: string
        }
        Update: {
          id_vinculo?: never
          id_origen?: number
          id_destino?: number
          motivo?: string
          confirmado_por?: string
          confirmado_en?: string
        }
        Relationships: [
          {
            foreignKeyName: 'comprobante_vinculo_id_origen_fkey'
            columns: ['id_origen']
            isOneToOne: false
            referencedRelation: 'comprobante'
            referencedColumns: ['id_comprobante']
          },
          {
            foreignKeyName: 'comprobante_vinculo_id_destino_fkey'
            columns: ['id_destino']
            isOneToOne: false
            referencedRelation: 'comprobante'
            referencedColumns: ['id_comprobante']
          },
        ]
      }
      /* Feature 010: las órdenes de trabajo de las compañías. Vencen al año (en la vista). */
      /* Feature 012: qué factura cobra qué orden. No se borra: se deshace (deshecho_en). */
      orden_factura: {
        Row: {
          id_vinculo: number
          id_orden: number
          id_comprobante: number
          origen: string
          gmail_message_id: string | null
          vinculado_en: string
          vinculado_por: string | null
          deshecho_en: string | null
          deshecho_por: string | null
        }
        Insert: {
          id_vinculo?: never
          id_orden: number
          id_comprobante: number
          origen: string
          gmail_message_id?: string | null
          vinculado_en?: string
          vinculado_por?: string | null
          deshecho_en?: string | null
          deshecho_por?: string | null
        }
        Update: {
          id_vinculo?: never
          id_orden?: number
          id_comprobante?: number
          origen?: string
          gmail_message_id?: string | null
          vinculado_en?: string
          vinculado_por?: string | null
          deshecho_en?: string | null
          deshecho_por?: string | null
        }
        Relationships: []
      }
      /* Feature 011: los hechos del auto, un toque cada uno. Sólo personas; el robot no la ve.
       * tipo: 'repuestos' | 'turno' | 'entro' | 'listo' | 'salio'. fecha_turno sólo en el turno. */
      hito_trabajo: {
        Row: {
          id_hito: number
          id_trabajo: number
          tipo: string
          fecha: string
          fecha_turno: string | null
          creado_en: string
          creado_por: string | null
        }
        Insert: {
          id_hito?: never
          id_trabajo: number
          tipo: string
          fecha?: string
          fecha_turno?: string | null
          creado_en?: string
          creado_por?: string | null
        }
        Update: {
          id_hito?: never
          id_trabajo?: number
          tipo?: string
          fecha?: string
          fecha_turno?: string | null
          creado_en?: string
          creado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'hito_trabajo_id_trabajo_fkey'
            columns: ['id_trabajo']
            isOneToOne: false
            referencedRelation: 'trabajos'
            referencedColumns: ['id_trabajo']
          },
        ]
      }
      /* Feature 012: cada mail con que el taller mandó una factura. Lo escribe sólo el robot. */
      envio_factura: {
        Row: {
          gmail_message_id: string
          enviado_en: string
          numero: number
          siniestro: string | null
          para: string | null
          id_comprobante: number | null
          resultado: string
          actualizado_en: string
        }
        Insert: {
          gmail_message_id: string
          enviado_en: string
          numero: number
          siniestro?: string | null
          para?: string | null
          id_comprobante?: number | null
          resultado: string
          actualizado_en?: string
        }
        Update: {
          gmail_message_id?: string
          enviado_en?: string
          numero?: number
          siniestro?: string | null
          para?: string | null
          id_comprobante?: number | null
          resultado?: string
          actualizado_en?: string
        }
        Relationships: []
      }
      orden_trabajo: {
        Row: {
          id_orden: number
          /* Nula sólo mientras está a confirmar y el robot no supo la compañía (RF-1014). */
          cuit_compania: string | null
          /* Nulo sólo mientras está a confirmar y el robot no pudo leer el número (RF-1014). */
          siniestro: string | null
          patente: string | null
          fecha_emision: string
          monto_autorizado: number | null
          perito: string | null
          perito_mail: string | null
          origen: string
          gmail_message_id: string | null
          anulada_en: string | null
          anulada_motivo: string | null
          creado_en: string
          creado_por: string | null
          vehiculo: string | null
          referencia: string | null
          observaciones: string | null
          reenvio_de: number | null
          anulada_por_mail: string | null
          /* RF-1014: el robot la adivinó; hasta que una persona la confirma no cuenta. */
          a_confirmar: boolean
          /* RF-1014: "No es una orden". No se borra. */
          descartada_en: string | null
          /* RF-1013: "No se hizo". Sale de los avisos y queda anotada. */
          cerrada_en: string | null
          cerrada_motivo: string | null
        }
        Insert: {
          id_orden?: never
          cuit_compania?: string | null
          siniestro?: string | null
          patente?: string | null
          fecha_emision: string
          monto_autorizado?: number | null
          perito?: string | null
          perito_mail?: string | null
          origen?: string
          gmail_message_id?: string | null
          anulada_en?: string | null
          anulada_motivo?: string | null
          creado_en?: string
          creado_por?: string | null
          vehiculo?: string | null
          referencia?: string | null
          observaciones?: string | null
          reenvio_de?: number | null
          anulada_por_mail?: string | null
          a_confirmar?: boolean
          descartada_en?: string | null
          cerrada_en?: string | null
          cerrada_motivo?: string | null
        }
        Update: {
          id_orden?: never
          cuit_compania?: string | null
          siniestro?: string | null
          patente?: string | null
          fecha_emision?: string
          monto_autorizado?: number | null
          perito?: string | null
          perito_mail?: string | null
          origen?: string
          gmail_message_id?: string | null
          anulada_en?: string | null
          anulada_motivo?: string | null
          creado_en?: string
          creado_por?: string | null
          vehiculo?: string | null
          referencia?: string | null
          observaciones?: string | null
          reenvio_de?: number | null
          anulada_por_mail?: string | null
          a_confirmar?: boolean
          descartada_en?: string | null
          cerrada_en?: string | null
          cerrada_motivo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'orden_trabajo_cuit_compania_fkey'
            columns: ['cuit_compania']
            isOneToOne: false
            referencedRelation: 'compania'
            referencedColumns: ['cuit']
          },
        ]
      }
    }
    Views: {
      /* Las 21 columnas del presupuesto ya derivadas. Es de donde lee esta app.
       * Todo sale nullable: una vista con LEFT JOIN no le garantiza NOT NULL a Postgres. */
      vw_presupuestos: {
        Row: {
          id_trabajo: number | null
          numero_presupuesto: number | null
          fecha_presupuesto: string | null
          id_cliente: number | null
          cliente_actual: string | null
          txt_cliente: string | null
          id_vehiculo: number | null
          patente_norm: string | null
          txt_vehiculo: string | null
          subtotal_conceptos: number | null
          monto_mano_obra: number | null
          monto_total: number | null
          cantidad_conceptos: number | null
          no_concretado: boolean | null
          origen: string | null
          creado_en: string | null
          modificado_en: string | null
          cliente_norm: string | null
          txt_chasis: string | null
          observaciones: string | null
          detalle_mano_obra: string | null
        }
        Relationships: []
      }
      vw_presupuestos_incompletos: {
        Row: {
          id_trabajo: number | null
          numero_presupuesto: number | null
          fecha_presupuesto: string | null
          origen_carga: string | null
          cliente: string | null
          monto_mano_obra: number | null
          /* Qué le falta a ese presupuesto: 'fecha' | 'cliente' | 'direccion' |
           * 'telefono' | 'mano_obra'. La vista sólo devuelve filas con al menos uno. */
          faltantes: string[] | null
        }
        Relationships: []
      }
      /* M4: lo emitido por emisor, mes y tipo. Los numeric llegan como string. */
      vw_arqueo_arca: {
        Row: {
          cuit_emisor: string | null
          mes: string | null
          tipo_codigo: number | null
          tipo_nombre: string | null
          clase: string | null
          moneda: string | null
          cantidad: number | null
          neto_gravado: number | null
          iva: number | null
          total: number | null
          total_con_signo: number | null
        }
        Relationships: []
      }
      /* M4: cada nota de crédito con su factura y su estado (P9). */
      vw_nc_candidatas: {
        Row: {
          id_nota: number | null
          nota_punto_venta: number | null
          nota_numero: number | null
          nota_fecha: string | null
          cuit_receptor: string | null
          receptor_nombre: string | null
          total: number | null
          id_factura: number | null
          factura_punto_venta: number | null
          factura_numero: number | null
          factura_fecha: string | null
          candidatas: number | null
          estado: string | null
        }
        Relationships: []
      }
      /* Feature 010: cada orden con su vencimiento y su factura. dias_para_vencer negativo = vencida. */
      vw_ordenes_trabajo: {
        Row: {
          id_orden: number | null
          cuit_compania: string | null
          compania: string | null
          siniestro: string | null
          patente: string | null
          fecha_emision: string | null
          vence: string | null
          dias_para_vencer: number | null
          monto_autorizado: number | null
          perito: string | null
          perito_mail: string | null
          origen: string | null
          anulada: boolean | null
          anulada_en: string | null
          anulada_motivo: string | null
          vehiculo: string | null
          referencia: string | null
          observaciones: string | null
          anulada_por_mail: string | null
          /* Cuántas veces la compañía mandó de nuevo la misma orden. Los reenvíos no salen en la vista. */
          reenvios: number | null
          /* RF-1014: falta que una persona diga si es una orden. Falso en las descartadas. */
          a_confirmar: boolean | null
          descartada: boolean | null
          /* RF-1013: "No se hizo". */
          cerrada: boolean | null
          cerrada_en: string | null
          cerrada_motivo: string | null
          /* Feature 012: las facturas vigentes que la cobran ("2-3553 del 2026-08-26 · …"), su total
           * y si todas las vinculó la base sola al leer el mail. */
          facturas: string | null
          facturada: boolean | null
          facturado: number | null
          por_mail: boolean | null
          /* Fase 2: 'aviso' o 'acuse' si la vinculó la evidencia, y lo que dicen los avisos de sus
           * facturas (vw_pago_factura). pago_falta: total menos lo pagado; nulo si algún aviso no dice el
           * importe. */
          por_evidencia: string | null
          pago_facturas_sin_aviso: number | null
          pago_falta: number | null
          pago_sin_importe: boolean | null
          pago_ultimo: string | null
          pago_por_siniestro: boolean | null
          pago_acuse: string | null
          pago_fecha_prometida: string | null
        }
        Relationships: []
      }
      /* Fase 2: por factura con avisos o acuses, lo que dicen. Los numeric llegan como texto. */
      vw_pago_factura: {
        Row: {
          id_comprobante: number | null
          total: number | null
          avisos: number | null
          pagado: number | null
          sin_importe: number | null
          falta: number | null
          ultimo_pago: string | null
          por_siniestro: boolean | null
          acuse: string | null
          fecha_prometida: string | null
          acuse_recibido: string | null
        }
        Relationships: []
      }
      /* Feature 012, RF-1203: para cada orden sin factura, las candidatas. orden_propuesta 1 = la primera. */
      vw_orden_factura_propuesta: {
        Row: {
          id_orden: number | null
          id_comprobante: number | null
          punto_venta: number | null
          numero: number | null
          fecha_emision: string | null
          total: number | null
          motivo: string | null
          orden_propuesta: number | null
        }
        Relationships: []
      }
      /* Feature 011: un trabajo con hitos por fila. Días derivados por la base; dias_para_turno
       * negativo = el turno pasó y no entró. */
      vw_autos_en_taller: {
        Row: {
          id_trabajo: number | null
          numero_presupuesto: number | null
          patente: string | null
          vehiculo: string | null
          cliente: string | null
          telefono: string | null
          origen: string | null
          repuestos_llegaron: string | null
          turno_para: string | null
          turno_dado_el: string | null
          entro: string | null
          listo: string | null
          salio: string | null
          en_taller: boolean | null
          dias_en_taller: number | null
          dias_sin_turno: number | null
          dias_para_turno: number | null
          dias_listo: number | null
          ultimo_hito: number | null
          ultimo_tipo: string | null
          ultimo_se_puede_deshacer: boolean | null
        }
        Relationships: []
      }
      /* Feature 010, RF-1008: cada factura contra lo autorizado en sus órdenes. */
      vw_factura_contra_autorizado: {
        Row: {
          id_comprobante: number | null
          punto_venta: number | null
          numero: number | null
          fecha_emision: string | null
          factura_neto: number | null
          factura_total: number | null
          ordenes: number | null
          autorizado: number | null
          ordenes_sin_monto: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      /* El número lo asigna la base, nunca el navegador. Quema el número al pedirlo:
       * nextval no vuelve atrás, así que los huecos son correctos. */
      fn_proximo_numero_presupuesto: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      /* El rol de la sesión (persona | robot), leído del token. Nulo sin rol. M1 de cobranzas. */
      fn_rol: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      /* Feature 010: sólo el robot. Guarda una orden leída de Gmail (segura, o a confirmar si la
       * adivinó: RF-1014, aunque no sepa la compañía ni el siniestro), o anula las de un siniestro. */
      fn_robot_guarda_orden: {
        Args: {
          p_gmail_message_id: string; p_tipo: string; p_compania: string | null; p_siniestro: string | null
          p_patente: string | null; p_fecha: string; p_monto: string | null; p_perito: string | null
          p_perito_mail: string | null; p_vehiculo: string | null; p_referencia: string | null
          p_observaciones: string | null; p_a_confirmar?: boolean
        }
        Returns: string
      }
      /* Feature 012: sólo el robot. Registra un mail de factura y la vincula a su orden si no hay dudas. */
      fn_robot_registra_envio: {
        Args: { p_gmail_message_id: string; p_fecha: string; p_numero: number; p_siniestro: string | null; p_para: string | null }
        Returns: string
      }
      /* Feature 012: vuelve a intentar los envíos que esperaban la factura de ARCA. Devuelve cuántos vinculó. */
      fn_revincular_envios: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      fn_normalizar_nombre: {
        Args: { p_nombre: string }
        Returns: string
      }
      fn_normalizar_patente: {
        Args: { p_patente: string }
        Returns: string
      }
      fn_es_formato_patente_valido: {
        Args: { p_patente: string } | { p_patente_norm: string }
        Returns: boolean
      }
    }
    Enums: Record<PropertyKey, never>
    CompositeTypes: Record<PropertyKey, never>
  }
}
