/* Tipos del esquema de la base: GENERADOS, no se editan a mano.
 *
 * Salen del conector de Supabase (generate_typescript_types), el mismo generador que
 * `npx supabase gen types typescript --project-id osslhkvdclrbukjqwpnt`. Se regeneran cada vez
 * que se aplica una migración en semaforo-base, y el archivo se pisa entero: lo que corrige lo
 * que el generador dice mal (los montos llegan como string) vive en `filas.ts`.
 *
 * Generado el 2026-10-23 contra la base real. EXCEPCIÓN, hasta que se aplique la M7 de semaforo-base:
 * `imputacion`, `vw_revisar_candidatas` y las columnas nuevas de `vw_revisar` se sumaron a mano, con la
 * forma del generador. Apenas se aplique, se regenera el archivo entero y gana el generado. */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      acuse: {
        Row: {
          factura_texto: string | null
          fecha_prometida: string | null
          gmail_message_id: string
          lectura: number
          monto: number | null
          numero: number | null
          punto_venta: number | null
          referencia: string | null
          siniestro: string | null
          tipo: string
        }
        Insert: {
          factura_texto?: string | null
          fecha_prometida?: string | null
          gmail_message_id: string
          lectura: number
          monto?: number | null
          numero?: number | null
          punto_venta?: number | null
          referencia?: string | null
          siniestro?: string | null
          tipo: string
        }
        Update: {
          factura_texto?: string | null
          fecha_prometida?: string | null
          gmail_message_id?: string
          lectura?: number
          monto?: number | null
          numero?: number | null
          punto_venta?: number | null
          referencia?: string | null
          siniestro?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "acuse_gmail_message_id_fkey"
            columns: ["gmail_message_id"]
            isOneToOne: false
            referencedRelation: "aviso"
            referencedColumns: ["gmail_message_id"]
          },
        ]
      }
      aviso: {
        Row: {
          asunto: string
          control: string | null
          cuerpo: string
          estado: string
          fecha_pago: string | null
          gmail_message_id: string
          lector: string | null
          lectura: number
          motivo: string | null
          neto: number | null
          op: string | null
          pdfs: string[]
          pdfs_drive: string[]
          recibido_en: string
          releido_en: string
          remitente: string
          subido_en: string
          texto_pdf: string
          tipo: string | null
          version: number | null
        }
        Insert: {
          asunto?: string
          control?: string | null
          cuerpo?: string
          estado: string
          fecha_pago?: string | null
          gmail_message_id: string
          lector?: string | null
          lectura?: number
          motivo?: string | null
          neto?: number | null
          op?: string | null
          pdfs?: string[]
          pdfs_drive?: string[]
          recibido_en: string
          releido_en?: string
          remitente: string
          subido_en?: string
          texto_pdf?: string
          tipo?: string | null
          version?: number | null
        }
        Update: {
          asunto?: string
          control?: string | null
          cuerpo?: string
          estado?: string
          fecha_pago?: string | null
          gmail_message_id?: string
          lector?: string | null
          lectura?: number
          motivo?: string | null
          neto?: number | null
          op?: string | null
          pdfs?: string[]
          pdfs_drive?: string[]
          recibido_en?: string
          releido_en?: string
          remitente?: string
          subido_en?: string
          texto_pdf?: string
          tipo?: string | null
          version?: number | null
        }
        Relationships: []
      }
      aviso_linea: {
        Row: {
          bruto: number | null
          factura_texto: string | null
          gmail_message_id: string
          id_linea: number
          lectura: number
          neto: number | null
          numero: number | null
          orden: number
          punto_venta: number | null
          siniestro: string | null
        }
        Insert: {
          bruto?: number | null
          factura_texto?: string | null
          gmail_message_id: string
          id_linea?: never
          lectura: number
          neto?: number | null
          numero?: number | null
          orden: number
          punto_venta?: number | null
          siniestro?: string | null
        }
        Update: {
          bruto?: number | null
          factura_texto?: string | null
          gmail_message_id?: string
          id_linea?: never
          lectura?: number
          neto?: number | null
          numero?: number | null
          orden?: number
          punto_venta?: number | null
          siniestro?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aviso_linea_gmail_message_id_fkey"
            columns: ["gmail_message_id"]
            isOneToOne: false
            referencedRelation: "aviso"
            referencedColumns: ["gmail_message_id"]
          },
        ]
      }
      aviso_retencion: {
        Row: {
          certificado: string | null
          concepto: string
          gmail_message_id: string
          id_retencion: number
          importe: number
          impuesto: string
          lectura: number
          orden: number
        }
        Insert: {
          certificado?: string | null
          concepto: string
          gmail_message_id: string
          id_retencion?: never
          importe: number
          impuesto: string
          lectura: number
          orden: number
        }
        Update: {
          certificado?: string | null
          concepto?: string
          gmail_message_id?: string
          id_retencion?: never
          importe?: number
          impuesto?: string
          lectura?: number
          orden?: number
        }
        Relationships: [
          {
            foreignKeyName: "aviso_retencion_gmail_message_id_fkey"
            columns: ["gmail_message_id"]
            isOneToOne: false
            referencedRelation: "aviso"
            referencedColumns: ["gmail_message_id"]
          },
        ]
      }
      clientes: {
        Row: {
          creado_en: string
          cuit: string | null
          direccion: string | null
          email: string | null
          id_cliente: number
          nombre: string
          nombre_norm: string | null
          telefono: string | null
        }
        Insert: {
          creado_en?: string
          cuit?: string | null
          direccion?: string | null
          email?: string | null
          id_cliente?: never
          nombre: string
          nombre_norm?: string | null
          telefono?: string | null
        }
        Update: {
          creado_en?: string
          cuit?: string | null
          direccion?: string | null
          email?: string | null
          id_cliente?: never
          nombre?: string
          nombre_norm?: string | null
          telefono?: string | null
        }
        Relationships: []
      }
      compania: {
        Row: {
          alias: string[]
          canal: string | null
          creado_en: string
          cuit: string
          mail_facturacion: string | null
          nombre: string
          plazo_declarado_dias: number | null
          portal_url: string | null
          portal_usuario: string | null
          remitentes_aviso: string[]
        }
        Insert: {
          alias?: string[]
          canal?: string | null
          creado_en?: string
          cuit: string
          mail_facturacion?: string | null
          nombre: string
          plazo_declarado_dias?: number | null
          portal_url?: string | null
          portal_usuario?: string | null
          remitentes_aviso?: string[]
        }
        Update: {
          alias?: string[]
          canal?: string | null
          creado_en?: string
          cuit?: string
          mail_facturacion?: string | null
          nombre?: string
          plazo_declarado_dias?: number | null
          portal_url?: string | null
          portal_usuario?: string | null
          remitentes_aviso?: string[]
        }
        Relationships: []
      }
      compania_requisito: {
        Row: {
          cuit: string
          descripcion: string
          id_requisito: number
        }
        Insert: {
          cuit: string
          descripcion: string
          id_requisito?: never
        }
        Update: {
          cuit?: string
          descripcion?: string
          id_requisito?: never
        }
        Relationships: [
          {
            foreignKeyName: "compania_requisito_cuit_fkey"
            columns: ["cuit"]
            isOneToOne: false
            referencedRelation: "compania"
            referencedColumns: ["cuit"]
          },
        ]
      }
      comprobante: {
        Row: {
          creado_en: string
          cuit_emisor: string
          cuit_receptor: string | null
          fecha_emision: string
          id_comprobante: number
          id_importacion: number
          iva: number
          moneda: string
          neto_gravado: number
          numero: number
          punto_venta: number
          receptor_nombre: string | null
          tipo_cambio: number
          tipo_codigo: number
          total: number
        }
        Insert: {
          creado_en?: string
          cuit_emisor: string
          cuit_receptor?: string | null
          fecha_emision: string
          id_comprobante?: never
          id_importacion: number
          iva: number
          moneda: string
          neto_gravado: number
          numero: number
          punto_venta: number
          receptor_nombre?: string | null
          tipo_cambio?: number
          tipo_codigo: number
          total: number
        }
        Update: {
          creado_en?: string
          cuit_emisor?: string
          cuit_receptor?: string | null
          fecha_emision?: string
          id_comprobante?: never
          id_importacion?: number
          iva?: number
          moneda?: string
          neto_gravado?: number
          numero?: number
          punto_venta?: number
          receptor_nombre?: string | null
          tipo_cambio?: number
          tipo_codigo?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "comprobante_id_importacion_fkey"
            columns: ["id_importacion"]
            isOneToOne: false
            referencedRelation: "importacion"
            referencedColumns: ["id_importacion"]
          },
          {
            foreignKeyName: "comprobante_tipo_codigo_fkey"
            columns: ["tipo_codigo"]
            isOneToOne: false
            referencedRelation: "tipo_comprobante"
            referencedColumns: ["codigo"]
          },
        ]
      }
      comprobante_vinculo: {
        Row: {
          confirmado_en: string
          confirmado_por: string
          id_destino: number
          id_origen: number
          id_vinculo: number
          motivo: string
        }
        Insert: {
          confirmado_en?: string
          confirmado_por?: string
          id_destino: number
          id_origen: number
          id_vinculo?: never
          motivo: string
        }
        Update: {
          confirmado_en?: string
          confirmado_por?: string
          id_destino?: number
          id_origen?: number
          id_vinculo?: never
          motivo?: string
        }
        Relationships: [
          {
            foreignKeyName: "comprobante_vinculo_id_destino_fkey"
            columns: ["id_destino"]
            isOneToOne: false
            referencedRelation: "comprobante"
            referencedColumns: ["id_comprobante"]
          },
          {
            foreignKeyName: "comprobante_vinculo_id_destino_fkey"
            columns: ["id_destino"]
            isOneToOne: false
            referencedRelation: "vw_factura_contra_autorizado"
            referencedColumns: ["id_comprobante"]
          },
          {
            foreignKeyName: "comprobante_vinculo_id_destino_fkey"
            columns: ["id_destino"]
            isOneToOne: false
            referencedRelation: "vw_orden_factura_propuesta"
            referencedColumns: ["id_comprobante"]
          },
          {
            foreignKeyName: "comprobante_vinculo_id_destino_fkey"
            columns: ["id_destino"]
            isOneToOne: false
            referencedRelation: "vw_pago_factura"
            referencedColumns: ["id_comprobante"]
          },
          {
            foreignKeyName: "comprobante_vinculo_id_origen_fkey"
            columns: ["id_origen"]
            isOneToOne: false
            referencedRelation: "comprobante"
            referencedColumns: ["id_comprobante"]
          },
          {
            foreignKeyName: "comprobante_vinculo_id_origen_fkey"
            columns: ["id_origen"]
            isOneToOne: false
            referencedRelation: "vw_factura_contra_autorizado"
            referencedColumns: ["id_comprobante"]
          },
          {
            foreignKeyName: "comprobante_vinculo_id_origen_fkey"
            columns: ["id_origen"]
            isOneToOne: false
            referencedRelation: "vw_orden_factura_propuesta"
            referencedColumns: ["id_comprobante"]
          },
          {
            foreignKeyName: "comprobante_vinculo_id_origen_fkey"
            columns: ["id_origen"]
            isOneToOne: false
            referencedRelation: "vw_pago_factura"
            referencedColumns: ["id_comprobante"]
          },
        ]
      }
      envio_factura: {
        Row: {
          actualizado_en: string
          enviado_en: string
          gmail_message_id: string
          id_comprobante: number | null
          numero: number
          para: string | null
          resultado: string
          siniestro: string | null
        }
        Insert: {
          actualizado_en?: string
          enviado_en: string
          gmail_message_id: string
          id_comprobante?: number | null
          numero: number
          para?: string | null
          resultado: string
          siniestro?: string | null
        }
        Update: {
          actualizado_en?: string
          enviado_en?: string
          gmail_message_id?: string
          id_comprobante?: number | null
          numero?: number
          para?: string | null
          resultado?: string
          siniestro?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "envio_factura_id_comprobante_fkey"
            columns: ["id_comprobante"]
            isOneToOne: false
            referencedRelation: "comprobante"
            referencedColumns: ["id_comprobante"]
          },
          {
            foreignKeyName: "envio_factura_id_comprobante_fkey"
            columns: ["id_comprobante"]
            isOneToOne: false
            referencedRelation: "vw_factura_contra_autorizado"
            referencedColumns: ["id_comprobante"]
          },
          {
            foreignKeyName: "envio_factura_id_comprobante_fkey"
            columns: ["id_comprobante"]
            isOneToOne: false
            referencedRelation: "vw_orden_factura_propuesta"
            referencedColumns: ["id_comprobante"]
          },
          {
            foreignKeyName: "envio_factura_id_comprobante_fkey"
            columns: ["id_comprobante"]
            isOneToOne: false
            referencedRelation: "vw_pago_factura"
            referencedColumns: ["id_comprobante"]
          },
        ]
      }
      hito_trabajo: {
        Row: {
          creado_en: string
          creado_por: string | null
          fecha: string
          fecha_turno: string | null
          id_hito: number
          id_trabajo: number
          tipo: string
        }
        Insert: {
          creado_en?: string
          creado_por?: string | null
          fecha?: string
          fecha_turno?: string | null
          id_hito?: never
          id_trabajo: number
          tipo: string
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          fecha?: string
          fecha_turno?: string | null
          id_hito?: never
          id_trabajo?: number
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "hito_trabajo_id_trabajo_fkey"
            columns: ["id_trabajo"]
            isOneToOne: false
            referencedRelation: "trabajos"
            referencedColumns: ["id_trabajo"]
          },
          {
            foreignKeyName: "hito_trabajo_id_trabajo_fkey"
            columns: ["id_trabajo"]
            isOneToOne: false
            referencedRelation: "vw_autos_en_taller"
            referencedColumns: ["id_trabajo"]
          },
          {
            foreignKeyName: "hito_trabajo_id_trabajo_fkey"
            columns: ["id_trabajo"]
            isOneToOne: false
            referencedRelation: "vw_presupuestos"
            referencedColumns: ["id_trabajo"]
          },
          {
            foreignKeyName: "hito_trabajo_id_trabajo_fkey"
            columns: ["id_trabajo"]
            isOneToOne: false
            referencedRelation: "vw_presupuestos_incompletos"
            referencedColumns: ["id_trabajo"]
          },
        ]
      }
      importacion: {
        Row: {
          archivo_hash: string
          archivo_nombre: string
          creado_en: string
          creado_por: string | null
          filas_leidas: number
          fuente: string
          id_importacion: number
        }
        Insert: {
          archivo_hash: string
          archivo_nombre: string
          creado_en?: string
          creado_por?: string | null
          filas_leidas: number
          fuente: string
          id_importacion?: never
        }
        Update: {
          archivo_hash?: string
          archivo_nombre?: string
          creado_en?: string
          creado_por?: string | null
          filas_leidas?: number
          fuente?: string
          id_importacion?: never
        }
        Relationships: []
      }
      imputacion: {
        Row: {
          bruto: number | null
          decidido_en: string
          decidido_por: string | null
          decision: string
          deshecho_en: string | null
          deshecho_por: string | null
          gmail_message_id: string
          id_comprobante: number | null
          id_imputacion: number
          linea_orden: number | null
          nota: string | null
        }
        Insert: {
          bruto?: number | null
          decidido_en?: string
          decidido_por?: string | null
          decision: string
          deshecho_en?: string | null
          deshecho_por?: string | null
          gmail_message_id: string
          id_comprobante?: number | null
          id_imputacion?: never
          linea_orden?: number | null
          nota?: string | null
        }
        Update: {
          bruto?: number | null
          decidido_en?: string
          decidido_por?: string | null
          decision?: string
          deshecho_en?: string | null
          deshecho_por?: string | null
          gmail_message_id?: string
          id_comprobante?: number | null
          id_imputacion?: never
          linea_orden?: number | null
          nota?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imputacion_gmail_message_id_fkey"
            columns: ["gmail_message_id"]
            isOneToOne: false
            referencedRelation: "aviso"
            referencedColumns: ["gmail_message_id"]
          },
          {
            foreignKeyName: "imputacion_id_comprobante_fkey"
            columns: ["id_comprobante"]
            isOneToOne: false
            referencedRelation: "comprobante"
            referencedColumns: ["id_comprobante"]
          },
        ]
      }
      orden_factura: {
        Row: {
          aviso_message_id: string | null
          deshecho_en: string | null
          deshecho_por: string | null
          gmail_message_id: string | null
          id_comprobante: number
          id_orden: number
          id_vinculo: number
          origen: string
          vinculado_en: string
          vinculado_por: string | null
        }
        Insert: {
          aviso_message_id?: string | null
          deshecho_en?: string | null
          deshecho_por?: string | null
          gmail_message_id?: string | null
          id_comprobante: number
          id_orden: number
          id_vinculo?: never
          origen: string
          vinculado_en?: string
          vinculado_por?: string | null
        }
        Update: {
          aviso_message_id?: string | null
          deshecho_en?: string | null
          deshecho_por?: string | null
          gmail_message_id?: string | null
          id_comprobante?: number
          id_orden?: number
          id_vinculo?: never
          origen?: string
          vinculado_en?: string
          vinculado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orden_factura_aviso_message_id_fkey"
            columns: ["aviso_message_id"]
            isOneToOne: false
            referencedRelation: "aviso"
            referencedColumns: ["gmail_message_id"]
          },
          {
            foreignKeyName: "orden_factura_gmail_message_id_fkey"
            columns: ["gmail_message_id"]
            isOneToOne: false
            referencedRelation: "envio_factura"
            referencedColumns: ["gmail_message_id"]
          },
          {
            foreignKeyName: "orden_factura_id_comprobante_fkey"
            columns: ["id_comprobante"]
            isOneToOne: false
            referencedRelation: "comprobante"
            referencedColumns: ["id_comprobante"]
          },
          {
            foreignKeyName: "orden_factura_id_comprobante_fkey"
            columns: ["id_comprobante"]
            isOneToOne: false
            referencedRelation: "vw_factura_contra_autorizado"
            referencedColumns: ["id_comprobante"]
          },
          {
            foreignKeyName: "orden_factura_id_comprobante_fkey"
            columns: ["id_comprobante"]
            isOneToOne: false
            referencedRelation: "vw_orden_factura_propuesta"
            referencedColumns: ["id_comprobante"]
          },
          {
            foreignKeyName: "orden_factura_id_comprobante_fkey"
            columns: ["id_comprobante"]
            isOneToOne: false
            referencedRelation: "vw_pago_factura"
            referencedColumns: ["id_comprobante"]
          },
          {
            foreignKeyName: "orden_factura_id_orden_fkey"
            columns: ["id_orden"]
            isOneToOne: false
            referencedRelation: "orden_trabajo"
            referencedColumns: ["id_orden"]
          },
          {
            foreignKeyName: "orden_factura_id_orden_fkey"
            columns: ["id_orden"]
            isOneToOne: false
            referencedRelation: "vw_orden_factura_propuesta"
            referencedColumns: ["id_orden"]
          },
          {
            foreignKeyName: "orden_factura_id_orden_fkey"
            columns: ["id_orden"]
            isOneToOne: false
            referencedRelation: "vw_ordenes_trabajo"
            referencedColumns: ["id_orden"]
          },
        ]
      }
      orden_trabajo: {
        Row: {
          a_confirmar: boolean
          anulada_en: string | null
          anulada_motivo: string | null
          anulada_por_mail: string | null
          cerrada_en: string | null
          cerrada_motivo: string | null
          creado_en: string
          creado_por: string | null
          cuit_compania: string | null
          descartada_en: string | null
          fecha_emision: string
          gmail_message_id: string | null
          id_orden: number
          monto_autorizado: number | null
          observaciones: string | null
          origen: string
          patente: string | null
          perito: string | null
          perito_mail: string | null
          reenvio_de: number | null
          referencia: string | null
          siniestro: string | null
          vehiculo: string | null
        }
        Insert: {
          a_confirmar?: boolean
          anulada_en?: string | null
          anulada_motivo?: string | null
          anulada_por_mail?: string | null
          cerrada_en?: string | null
          cerrada_motivo?: string | null
          creado_en?: string
          creado_por?: string | null
          cuit_compania?: string | null
          descartada_en?: string | null
          fecha_emision: string
          gmail_message_id?: string | null
          id_orden?: never
          monto_autorizado?: number | null
          observaciones?: string | null
          origen?: string
          patente?: string | null
          perito?: string | null
          perito_mail?: string | null
          reenvio_de?: number | null
          referencia?: string | null
          siniestro?: string | null
          vehiculo?: string | null
        }
        Update: {
          a_confirmar?: boolean
          anulada_en?: string | null
          anulada_motivo?: string | null
          anulada_por_mail?: string | null
          cerrada_en?: string | null
          cerrada_motivo?: string | null
          creado_en?: string
          creado_por?: string | null
          cuit_compania?: string | null
          descartada_en?: string | null
          fecha_emision?: string
          gmail_message_id?: string | null
          id_orden?: never
          monto_autorizado?: number | null
          observaciones?: string | null
          origen?: string
          patente?: string | null
          perito?: string | null
          perito_mail?: string | null
          reenvio_de?: number | null
          referencia?: string | null
          siniestro?: string | null
          vehiculo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orden_trabajo_cuit_compania_fkey"
            columns: ["cuit_compania"]
            isOneToOne: false
            referencedRelation: "compania"
            referencedColumns: ["cuit"]
          },
          {
            foreignKeyName: "orden_trabajo_reenvio_de_fkey"
            columns: ["reenvio_de"]
            isOneToOne: false
            referencedRelation: "orden_trabajo"
            referencedColumns: ["id_orden"]
          },
          {
            foreignKeyName: "orden_trabajo_reenvio_de_fkey"
            columns: ["reenvio_de"]
            isOneToOne: false
            referencedRelation: "vw_orden_factura_propuesta"
            referencedColumns: ["id_orden"]
          },
          {
            foreignKeyName: "orden_trabajo_reenvio_de_fkey"
            columns: ["reenvio_de"]
            isOneToOne: false
            referencedRelation: "vw_ordenes_trabajo"
            referencedColumns: ["id_orden"]
          },
        ]
      }
      regla_facturacion: {
        Row: {
          condicion: string
          cuit_destino: string
          cuit_origen: string
          id_regla: number
          nota: string | null
        }
        Insert: {
          condicion: string
          cuit_destino: string
          cuit_origen: string
          id_regla?: never
          nota?: string | null
        }
        Update: {
          condicion?: string
          cuit_destino?: string
          cuit_origen?: string
          id_regla?: never
          nota?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "regla_facturacion_cuit_destino_fkey"
            columns: ["cuit_destino"]
            isOneToOne: false
            referencedRelation: "compania"
            referencedColumns: ["cuit"]
          },
          {
            foreignKeyName: "regla_facturacion_cuit_origen_fkey"
            columns: ["cuit_origen"]
            isOneToOne: false
            referencedRelation: "compania"
            referencedColumns: ["cuit"]
          },
        ]
      }
      tipo_comprobante: {
        Row: {
          clase: string
          codigo: number
          nombre: string
        }
        Insert: {
          clase: string
          codigo: number
          nombre: string
        }
        Update: {
          clase?: string
          codigo?: number
          nombre?: string
        }
        Relationships: []
      }
      trabajo_items: {
        Row: {
          detalle: string | null
          id_item: number
          id_trabajo: number
          importe: number
          orden: number
        }
        Insert: {
          detalle?: string | null
          id_item?: never
          id_trabajo: number
          importe?: number
          orden: number
        }
        Update: {
          detalle?: string | null
          id_item?: never
          id_trabajo?: number
          importe?: number
          orden?: number
        }
        Relationships: [
          {
            foreignKeyName: "trabajo_items_id_trabajo_fkey"
            columns: ["id_trabajo"]
            isOneToOne: false
            referencedRelation: "trabajos"
            referencedColumns: ["id_trabajo"]
          },
          {
            foreignKeyName: "trabajo_items_id_trabajo_fkey"
            columns: ["id_trabajo"]
            isOneToOne: false
            referencedRelation: "vw_autos_en_taller"
            referencedColumns: ["id_trabajo"]
          },
          {
            foreignKeyName: "trabajo_items_id_trabajo_fkey"
            columns: ["id_trabajo"]
            isOneToOne: false
            referencedRelation: "vw_presupuestos"
            referencedColumns: ["id_trabajo"]
          },
          {
            foreignKeyName: "trabajo_items_id_trabajo_fkey"
            columns: ["id_trabajo"]
            isOneToOne: false
            referencedRelation: "vw_presupuestos_incompletos"
            referencedColumns: ["id_trabajo"]
          },
        ]
      }
      trabajos: {
        Row: {
          creado_en: string
          detalle_mano_obra: string | null
          fecha_presupuesto: string | null
          id_cliente: number | null
          id_trabajo: number
          id_vehiculo: number | null
          modificado_en: string
          monto_mano_obra: number
          no_concretado: boolean
          numero_presupuesto: number | null
          observaciones: string | null
          origen: string | null
          origen_carga: string
          txt_chasis: string | null
          txt_cliente: string | null
          txt_direccion: string | null
          txt_patente: string | null
          txt_telefono: string | null
          txt_vehiculo: string | null
        }
        Insert: {
          creado_en?: string
          detalle_mano_obra?: string | null
          fecha_presupuesto?: string | null
          id_cliente?: number | null
          id_trabajo?: never
          id_vehiculo?: number | null
          modificado_en?: string
          monto_mano_obra?: number
          no_concretado?: boolean
          numero_presupuesto?: number | null
          observaciones?: string | null
          origen?: string | null
          origen_carga: string
          txt_chasis?: string | null
          txt_cliente?: string | null
          txt_direccion?: string | null
          txt_patente?: string | null
          txt_telefono?: string | null
          txt_vehiculo?: string | null
        }
        Update: {
          creado_en?: string
          detalle_mano_obra?: string | null
          fecha_presupuesto?: string | null
          id_cliente?: number | null
          id_trabajo?: never
          id_vehiculo?: number | null
          modificado_en?: string
          monto_mano_obra?: number
          no_concretado?: boolean
          numero_presupuesto?: number | null
          observaciones?: string | null
          origen?: string | null
          origen_carga?: string
          txt_chasis?: string | null
          txt_cliente?: string | null
          txt_direccion?: string | null
          txt_patente?: string | null
          txt_telefono?: string | null
          txt_vehiculo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trabajos_id_cliente_fkey"
            columns: ["id_cliente"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id_cliente"]
          },
          {
            foreignKeyName: "trabajos_id_vehiculo_fkey"
            columns: ["id_vehiculo"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id_vehiculo"]
          },
        ]
      }
      vehiculos: {
        Row: {
          chasis: string | null
          creado_en: string
          descripcion: string | null
          id_cliente_ultimo: number | null
          id_vehiculo: number
          patente: string
          patente_norm: string | null
        }
        Insert: {
          chasis?: string | null
          creado_en?: string
          descripcion?: string | null
          id_cliente_ultimo?: number | null
          id_vehiculo?: never
          patente: string
          patente_norm?: string | null
        }
        Update: {
          chasis?: string | null
          creado_en?: string
          descripcion?: string | null
          id_cliente_ultimo?: number | null
          id_vehiculo?: never
          patente?: string
          patente_norm?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehiculos_id_cliente_ultimo_fkey"
            columns: ["id_cliente_ultimo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id_cliente"]
          },
        ]
      }
    }
    Views: {
      vw_arqueo_arca: {
        Row: {
          cantidad: number | null
          clase: string | null
          cuit_emisor: string | null
          iva: number | null
          mes: string | null
          moneda: string | null
          neto_gravado: number | null
          tipo_codigo: number | null
          tipo_nombre: string | null
          total: number | null
          total_con_signo: number | null
        }
        Relationships: [
          {
            foreignKeyName: "comprobante_tipo_codigo_fkey"
            columns: ["tipo_codigo"]
            isOneToOne: false
            referencedRelation: "tipo_comprobante"
            referencedColumns: ["codigo"]
          },
        ]
      }
      vw_autos_en_taller: {
        Row: {
          cliente: string | null
          dias_en_taller: number | null
          dias_listo: number | null
          dias_para_turno: number | null
          dias_sin_turno: number | null
          en_taller: boolean | null
          entro: string | null
          id_trabajo: number | null
          listo: string | null
          numero_presupuesto: number | null
          origen: string | null
          patente: string | null
          repuestos_llegaron: string | null
          salio: string | null
          telefono: string | null
          turno_dado_el: string | null
          turno_para: string | null
          ultimo_hito: number | null
          ultimo_se_puede_deshacer: boolean | null
          ultimo_tipo: string | null
          vehiculo: string | null
        }
        Relationships: []
      }
      vw_factura_contra_autorizado: {
        Row: {
          autorizado: number | null
          factura_neto: number | null
          factura_total: number | null
          fecha_emision: string | null
          id_comprobante: number | null
          numero: number | null
          ordenes: number | null
          ordenes_sin_monto: number | null
          punto_venta: number | null
        }
        Relationships: []
      }
      vw_imputaciones: {
        Row: {
          bruto: number | null
          fecha_pago: string | null
          gmail_message_id: string | null
          id_comprobante: number | null
          id_linea: number | null
          neto: number | null
          nivel: string | null
          op: string | null
          via: string | null
        }
        Relationships: []
      }
      vw_nc_candidatas: {
        Row: {
          candidatas: number | null
          cuit_receptor: string | null
          estado: string | null
          factura_fecha: string | null
          factura_numero: number | null
          factura_punto_venta: number | null
          id_factura: number | null
          id_nota: number | null
          nota_fecha: string | null
          nota_numero: number | null
          nota_punto_venta: number | null
          receptor_nombre: string | null
          total: number | null
        }
        Relationships: []
      }
      vw_orden_factura_propuesta: {
        Row: {
          fecha_emision: string | null
          id_comprobante: number | null
          id_orden: number | null
          motivo: string | null
          numero: number | null
          orden_propuesta: number | null
          punto_venta: number | null
          total: number | null
        }
        Relationships: []
      }
      vw_ordenes_trabajo: {
        Row: {
          a_confirmar: boolean | null
          anulada: boolean | null
          anulada_en: string | null
          anulada_motivo: string | null
          anulada_por_mail: string | null
          cerrada: boolean | null
          cerrada_en: string | null
          cerrada_motivo: string | null
          compania: string | null
          cuit_compania: string | null
          descartada: boolean | null
          dias_para_vencer: number | null
          facturada: boolean | null
          facturado: number | null
          facturas: string | null
          fecha_emision: string | null
          id_orden: number | null
          monto_autorizado: number | null
          observaciones: string | null
          origen: string | null
          pago_acuse: string | null
          pago_facturas_sin_aviso: number | null
          pago_falta: number | null
          pago_fecha_prometida: string | null
          pago_por_siniestro: boolean | null
          pago_sin_importe: boolean | null
          pago_ultimo: string | null
          patente: string | null
          perito: string | null
          perito_mail: string | null
          por_evidencia: string | null
          por_mail: boolean | null
          reenvios: number | null
          referencia: string | null
          siniestro: string | null
          vehiculo: string | null
          vence: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orden_trabajo_cuit_compania_fkey"
            columns: ["cuit_compania"]
            isOneToOne: false
            referencedRelation: "compania"
            referencedColumns: ["cuit"]
          },
        ]
      }
      vw_pago_factura: {
        Row: {
          acuse: string | null
          acuse_recibido: string | null
          avisos: number | null
          falta: number | null
          fecha_prometida: string | null
          id_comprobante: number | null
          pagado: number | null
          por_siniestro: boolean | null
          sin_importe: number | null
          total: number | null
          ultimo_pago: string | null
        }
        Relationships: []
      }
      vw_presupuestos: {
        Row: {
          cantidad_conceptos: number | null
          cliente_actual: string | null
          cliente_norm: string | null
          creado_en: string | null
          detalle_mano_obra: string | null
          fecha_presupuesto: string | null
          id_cliente: number | null
          id_trabajo: number | null
          id_vehiculo: number | null
          modificado_en: string | null
          monto_mano_obra: number | null
          monto_total: number | null
          no_concretado: boolean | null
          numero_presupuesto: number | null
          observaciones: string | null
          origen: string | null
          patente_norm: string | null
          subtotal_conceptos: number | null
          txt_chasis: string | null
          txt_cliente: string | null
          txt_vehiculo: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trabajos_id_cliente_fkey"
            columns: ["id_cliente"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id_cliente"]
          },
          {
            foreignKeyName: "trabajos_id_vehiculo_fkey"
            columns: ["id_vehiculo"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id_vehiculo"]
          },
        ]
      }
      vw_presupuestos_incompletos: {
        Row: {
          cliente: string | null
          faltantes: string[] | null
          fecha_presupuesto: string | null
          id_trabajo: number | null
          monto_mano_obra: number | null
          numero_presupuesto: number | null
          origen_carga: string | null
        }
        Relationships: []
      }
      vw_revisar: {
        Row: {
          asunto: string | null
          bruto: number | null
          compania: string | null
          cuit_compania: string | null
          detalle: string | null
          gmail_message_id: string | null
          linea_orden: number | null
          numero: number | null
          pdfs_drive: string[] | null
          que: string | null
          recibido_en: string | null
          remitente: string | null
          siniestro: string | null
        }
        Relationships: []
      }
      vw_revisar_candidatas: {
        Row: {
          diferencia: number | null
          falta: number | null
          fecha_emision: string | null
          gmail_message_id: string | null
          id_comprobante: number | null
          linea_orden: number | null
          mismo_numero: boolean | null
          numero: number | null
          orden: number | null
          punto_venta: number | null
          total: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      fn_clave_siniestro: { Args: { p_siniestro: string }; Returns: string }
      fn_compania_del_remitente: {
        Args: { p_remitente: string }
        Returns: string
      }
      fn_es_formato_patente_valido: {
        Args: { p_patente: string }
        Returns: boolean
      }
      fn_hoy: { Args: never; Returns: string }
      fn_normalizar_nombre: { Args: { p_nombre: string }; Returns: string }
      fn_normalizar_patente: { Args: { p_patente: string }; Returns: string }
      fn_ordenes_del_siniestro: {
        Args: { p_buscado: string; p_cuit: string }
        Returns: number[]
      }
      fn_proximo_numero_presupuesto: { Args: never; Returns: number }
      fn_qa_001_presupuesto: {
        Args: never
        Returns: {
          bloque: string
          estado: string
          nro: number
          obs: string
          que_verifica: string
          ref: string
        }[]
      }
      fn_revincular_envios: { Args: never; Returns: number }
      fn_robot_guarda_aviso: { Args: { p_aviso: Json }; Returns: Json }
      fn_robot_guarda_orden: {
        Args: {
          p_a_confirmar?: boolean
          p_compania: string
          p_fecha: string
          p_gmail_message_id: string
          p_monto: number
          p_observaciones: string
          p_patente: string
          p_perito: string
          p_perito_mail: string
          p_referencia: string
          p_siniestro: string
          p_tipo: string
          p_vehiculo: string
        }
        Returns: string
      }
      fn_robot_registra_envio: {
        Args: {
          p_fecha: string
          p_gmail_message_id: string
          p_numero: number
          p_para: string
          p_siniestro: string
        }
        Returns: string
      }
      fn_rol: { Args: never; Returns: string }
      fn_sincronizar_numeracion: { Args: never; Returns: number }
      fn_vincular_envio: {
        Args: { p_gmail_message_id: string }
        Returns: string
      }
      fn_vincular_evidencia: {
        Args: { p_gmail_message_id: string }
        Returns: number
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
