import { describe, it, expect } from 'vitest'
import { EmitirComprobanteRequestSchema } from '../../src/domain/schemas.js'
import { DOC_TIPO, CONDICION_IVA, CONCEPTO, CBTE_TIPO } from '../../src/domain/constants.js'

function validInput(overrides: object = {}) {
  return {
    ptoVta: 1,
    cbteTipo: CBTE_TIPO.FACTURA_B,
    concepto: CONCEPTO.PRODUCTOS,
    receptor: {
      docTipo: DOC_TIPO.DNI,
      docNro: 12345678,
      condicionIVA: CONDICION_IVA.CONSUMIDOR_FINAL,
      razonSocial: 'Juan Perez',
      domicilio: 'Av. Siempre Viva 742',
    },
    items: [
      { descripcion: 'Producto 1', cantidad: 2, precioUnitario: 100, iva: 21 },
    ],
    moneda: 'PES',
    cotizacion: 1,
    condicionVenta: 'Contado',
    ...overrides,
  }
}

describe('EmitirComprobanteRequestSchema', () => {
  it('acepta Factura B válida', () => {
    const r = EmitirComprobanteRequestSchema.safeParse(validInput())
    expect(r.success).toBe(true)
  })

  it('rechaza si no hay condicionIVA', () => {
    const r = EmitirComprobanteRequestSchema.safeParse(
      validInput({
        receptor: {
          docTipo: DOC_TIPO.DNI,
          docNro: 12345678,
          razonSocial: 'x',
          domicilio: 'x',
        },
      }),
    )
    expect(r.success).toBe(false)
  })

  it('rechaza Factura A con docTipo=99', () => {
    const r = EmitirComprobanteRequestSchema.safeParse(
      validInput({
        cbteTipo: CBTE_TIPO.FACTURA_A,
        receptor: {
          docTipo: DOC_TIPO.CONSUMIDOR_FINAL,
          docNro: 0,
          condicionIVA: CONDICION_IVA.RESPONSABLE_INSCRIPTO,
          razonSocial: 'x',
          domicilio: 'x',
        },
      }),
    )
    expect(r.success).toBe(false)
  })

  it('rechaza Factura C con IVA gravado', () => {
    const r = EmitirComprobanteRequestSchema.safeParse(
      validInput({
        cbteTipo: CBTE_TIPO.FACTURA_C,
        items: [{ descripcion: 'x', cantidad: 1, precioUnitario: 100, iva: 21 }],
      }),
    )
    expect(r.success).toBe(false)
  })

  it('rechaza Factura B sin IVA gravado', () => {
    const r = EmitirComprobanteRequestSchema.safeParse(
      validInput({
        items: [{ descripcion: 'x', cantidad: 1, precioUnitario: 100, iva: 0 }],
      }),
    )
    expect(r.success).toBe(false)
  })

  it('rechaza Factura B con docTipo=99 y docNro!=0', () => {
    const r = EmitirComprobanteRequestSchema.safeParse(
      validInput({
        receptor: {
          docTipo: DOC_TIPO.CONSUMIDOR_FINAL,
          docNro: 12345678, // ❌ debe ser 0
          condicionIVA: CONDICION_IVA.CONSUMIDOR_FINAL,
          razonSocial: 'x',
          domicilio: 'x',
        },
      }),
    )
    expect(r.success).toBe(false)
  })

  it('acepta Factura B con docTipo=99 y docNro=0', () => {
    const r = EmitirComprobanteRequestSchema.safeParse(
      validInput({
        receptor: {
          docTipo: DOC_TIPO.CONSUMIDOR_FINAL,
          docNro: 0,
          condicionIVA: CONDICION_IVA.CONSUMIDOR_FINAL,
          razonSocial: 'CF',
          domicilio: '-',
        },
      }),
    )
    expect(r.success).toBe(true)
  })

  it('rechaza NC sin cbtesAsoc', () => {
    const r = EmitirComprobanteRequestSchema.safeParse(validInput({ cbteTipo: CBTE_TIPO.NOTA_CREDITO_A }))
    expect(r.success).toBe(false)
  })

  it('acepta NC con cbtesAsoc', () => {
    const r = EmitirComprobanteRequestSchema.safeParse(
      validInput({
        cbteTipo: CBTE_TIPO.NOTA_CREDITO_A,
        receptor: {
          docTipo: DOC_TIPO.CUIT,
          docNro: 20223565078,
          condicionIVA: CONDICION_IVA.RESPONSABLE_INSCRIPTO,
          razonSocial: 'Cliente SA',
          domicilio: 'Av. Test 123',
        },
        cbtesAsoc: [{ tipo: 1, ptoVta: 1, nro: 100 }],
      }),
    )
    expect(r.success).toBe(true)
  })

  it('rechaza servicio (concepto=2) sin fchServDesde/Hasta/VtoPago', () => {
    const r = EmitirComprobanteRequestSchema.safeParse(
      validInput({ concepto: CONCEPTO.SERVICIOS }),
    )
    expect(r.success).toBe(false)
  })

  it('acepta servicio con fechas válidas', () => {
    const r = EmitirComprobanteRequestSchema.safeParse(
      validInput({
        concepto: CONCEPTO.SERVICIOS,
        fchServDesde: '20240101',
        fchServHasta: '20240131',
        fchVtoPago: '20240215',
      }),
    )
    expect(r.success).toBe(true)
  })

  it('rechaza items vacíos', () => {
    const r = EmitirComprobanteRequestSchema.safeParse(validInput({ items: [] }))
    expect(r.success).toBe(false)
  })

  it('rechaza fecha con formato inválido', () => {
    const r = EmitirComprobanteRequestSchema.safeParse(validInput({ fecha: '2024-01-05' }))
    expect(r.success).toBe(false)
  })

  it('rechaza cbteTipo inválido', () => {
    const r = EmitirComprobanteRequestSchema.safeParse(validInput({ cbteTipo: 99 }))
    expect(r.success).toBe(false)
  })

  it('rechaza condicion IVA inválida para Factura A', () => {
    const r = EmitirComprobanteRequestSchema.safeParse(
      validInput({
        cbteTipo: CBTE_TIPO.FACTURA_A,
        receptor: {
          docTipo: DOC_TIPO.CUIT,
          docNro: 20223565078,
          condicionIVA: CONDICION_IVA.CONSUMIDOR_FINAL, // ❌ no permitida en A
          razonSocial: 'x',
          domicilio: 'x',
        },
      }),
    )
    expect(r.success).toBe(false)
  })

  it('aplica defaults: concepto=1, moneda=PES, cotizacion=1', () => {
    const input: Record<string, unknown> = validInput()
    delete input.concepto
    delete input.moneda
    delete input.cotizacion
    const r = EmitirComprobanteRequestSchema.parse(input)
    expect(r.concepto).toBe(1)
    expect(r.moneda).toBe('PES')
    expect(r.cotizacion).toBe(1)
  })
})
