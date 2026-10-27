import { z } from 'zod'
import {
  CBTE_TIPOS,
  CONDICIONES_IVA_PARA_A,
  CONDICIONES_IVA_PARA_BC,
  CONCEPTO,
  DOC_TIPO,
  MONEDA,
  type CbteTipo,
  type Concepto,
  type CondicionIva,
  type DocTipo,
  type Moneda,
} from './constants.js'
import { isValidIvaInput } from './iva.js'
import { isA, isB, isC, isNota } from './comprobante.js'

/** Validador Zod del request de emisión de comprobante. */
export const ItemSchema = z.object({
  codigo: z.union([z.string(), z.number()]).optional(),
  descripcion: z.string().min(1, { message: 'descripcion_requerida' }),
  cantidad: z.number().positive({ message: 'cantidad_debe_ser_positiva' }),
  precioUnitario: z.number().nonnegative({ message: 'precioUnitario_invalido' }),
  iva: z.number().nonnegative({ message: 'iva_invalido' }),
})

export const ComprobanteAsociadoSchema = z.object({
  tipo: z.number().int().positive(),
  ptoVta: z.number().int().nonnegative(),
  nro: z.number().int().positive(),
  cuit: z.number().int().positive().optional(),
})

export const EmitirComprobanteRequestSchema = z
  .object({
    ptoVta: z.number().int().nonnegative(),
    cbteTipo: z.number().int().refine((v) => CBTE_TIPOS.includes(v as CbteTipo), {
      message: 'cbteTipo_invalido',
    }),
    concepto: z
      .number()
      .int()
      .min(CONCEPTO.PRODUCTOS)
      .max(CONCEPTO.PRODUCTOS_Y_SERVICIOS)
      .optional()
      .default(CONCEPTO.PRODUCTOS),
    fecha: z
      .string()
      .regex(/^\d{8}$/, { message: 'fecha_formato_invalido_YYYYMMDD' })
      .optional(),
    receptor: z.object({
      docTipo: z.number().int().nonnegative(),
      docNro: z.union([z.string(), z.number()]).transform((v) => Number(v)),
      condicionIVA: z.number().int().positive({ message: 'condicion_iva_obligatoria' }),
      razonSocial: z.string().min(1),
      domicilio: z.string().optional(),
    }),
    items: z.array(ItemSchema).min(1, { message: 'items_obligatorios' }),
    moneda: z
      .string()
      .refine((v) => Object.values(MONEDA).includes(v as Moneda), {
        message: 'moneda_invalida',
      })
      .optional()
      .default(MONEDA.PES),
    cotizacion: z
      .number()
      .refine((v) => v > 0, { message: 'cotizacion_invalida' })
      .optional()
      .default(1),
    cbtesAsoc: z.array(ComprobanteAsociadoSchema).optional(),
    fchServDesde: z
      .string()
      .regex(/^\d{8}$/, { message: 'fchServDesde_formato_invalido' })
      .optional(),
    fchServHasta: z
      .string()
      .regex(/^\d{8}$/, { message: 'fchServHasta_formato_invalido' })
      .optional(),
    fchVtoPago: z
      .string()
      .regex(/^\d{8}$/, { message: 'fchVtoPago_formato_invalido' })
      .optional(),
    condicionVenta: z.string().min(1),
  })
  .superRefine((v, ctx) => {
    const cbteTipo = v.cbteTipo as CbteTipo
    const docTipo = v.receptor.docTipo as DocTipo
    const cond = v.receptor.condicionIVA as CondicionIva
    const concepto = (v.concepto ?? CONCEPTO.PRODUCTOS) as Concepto

    // Regla 1: condicion_iva_obligatoria (Zod ya lo valida, pero reforzamos)
    if (!cond) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'condicion_iva_obligatoria',
        path: ['receptor', 'condicionIVA'],
      })
    }

    // Regla 2: fechas de servicio si concepto != 1
    if (concepto !== CONCEPTO.PRODUCTOS) {
      if (!v.fchServDesde || !v.fchServHasta || !v.fchVtoPago) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'fechas_servicio_obligatorias',
          path: ['concepto'],
        })
      }
    }

    // Regla 3: cbtesAsoc obligatorio para NC y ND
    if (isNota(cbteTipo) && (!v.cbtesAsoc || v.cbtesAsoc.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'cbtesAsoc_obligatorio_en_NC_y_ND',
        path: ['cbtesAsoc'],
      })
    }

    // Regla 4: docTipo=99 no permitido en Factura A
    if (isA(cbteTipo) && docTipo === DOC_TIPO.CONSUMIDOR_FINAL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'docTipo_invalido_para_A',
        path: ['receptor', 'docTipo'],
      })
    }

    // Regla 5: en Factura B con docTipo=99, docNro debe ser 0
    if (cbteTipo === 6 && docTipo === DOC_TIPO.CONSUMIDOR_FINAL) {
      if (v.receptor.docNro !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'docNro_debe_ser_0_para_docTipo_99_en_B',
          path: ['receptor', 'docNro'],
        })
      }
    }

    // Regla 6: alícuotas de IVA válidas (siempre en porcentaje)
    for (let i = 0; i < v.items.length; i++) {
      if (!isValidIvaInput(v.items[i]!.iva)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'iva_invalido',
          path: ['items', i, 'iva'],
        })
      }
    }

    // Regla 7: C no lleva IVA discriminado
    if (isC(cbteTipo)) {
      const hasGravado = v.items.some((x) => x.iva !== 0)
      if (hasGravado) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'iva_no_debe_discriminarse_en_C',
          path: ['items'],
        })
      }
    } else {
      // Regla 8: A y B deben tener al menos un item gravado
      const hasGravado = v.items.some((x) => x.iva > 0)
      if (!hasGravado) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'iva_obligatorio_en_A_y_B',
          path: ['items'],
        })
      }
    }

    // Regla 9: condición IVA válida para el tipo
    if (cond) {
      if (isA(cbteTipo) && !CONDICIONES_IVA_PARA_A.includes(cond)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'condicion_iva_invalida_para_A',
          path: ['receptor', 'condicionIVA'],
        })
      }
      if (
        (isB(cbteTipo) || isC(cbteTipo)) &&
        !CONDICIONES_IVA_PARA_BC.includes(cond)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'condicion_iva_invalida_para_BC',
          path: ['receptor', 'condicionIVA'],
        })
      }
    }
  })

/** Tipos inferidos desde el schema. */
export type EmitirComprobanteRequestInput = z.input<typeof EmitirComprobanteRequestSchema>
export type EmitirComprobanteRequestParsed = z.output<typeof EmitirComprobanteRequestSchema>
