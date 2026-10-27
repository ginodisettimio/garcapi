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

  it('rechaza ids de AFIP como iva (4 no es un porcentaje)', () => {
    const r = EmitirComprobanteRequestSchema.safeParse(
      validInput({ items: [{ descripcion: 'x', cantidad: 1, precioUnitario: 100, iva: 4 }] }),
    )
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.some((i) => i.message === 'iva_invalido')).toBe(true)
  })

  it('acepta iva 5 como 5 %', () => {
    const r = EmitirComprobanteRequestSchema.safeParse(
      validInput({ items: [{ descripcion: 'x', cantidad: 1, precioUnitario: 100, iva: 5 }] }),
    )
    expect(r.success).toBe(true)
  })

  describe('condición IVA del receptor por clase (FEParamGetCondicionIvaReceptor)', () => {
    const conReceptor = (cbteTipo: number, receptor: object, extra: object = {}) =>
      EmitirComprobanteRequestSchema.safeParse(validInput({ cbteTipo, receptor, ...extra }))
    const messages = (r: ReturnType<typeof conReceptor>) => (r.success ? [] : r.error.issues.map((i) => i.message))
    const itemsC = { items: [{ descripcion: 'x', cantidad: 1, precioUnitario: 100, iva: 0 }] }

    it('Factura C a un Responsable Inscripto (monotributista que le factura a un RI)', () => {
      const r = conReceptor(11, { docTipo: 80, docNro: 20111111112, condicionIVA: 1, razonSocial: 'RI S.A.' }, itemsC)
      expect(r.success).toBe(true)
    })

    it('Factura C a consumidor final y a monotributista', () => {
      expect(conReceptor(11, { docTipo: 99, docNro: 0, condicionIVA: 5, razonSocial: 'CF' }, itemsC).success).toBe(true)
      expect(conReceptor(11, { docTipo: 80, docNro: 20111111112, condicionIVA: 6, razonSocial: 'Mono' }, itemsC).success).toBe(true)
    })

    it('Factura A a Monotributo Trabajador Independiente Promovido (16)', () => {
      const r = conReceptor(1, { docTipo: 80, docNro: 20111111112, condicionIVA: 16, razonSocial: 'x' })
      expect(r.success).toBe(true)
    })

    it('rechaza condiciones que la clase no admite', () => {
      expect(messages(conReceptor(6, { docTipo: 80, docNro: 20111111112, condicionIVA: 1, razonSocial: 'x' }))).toContain(
        'condicion_iva_invalida_para_B',
      )
      expect(messages(conReceptor(11, { docTipo: 80, docNro: 20111111112, condicionIVA: 2, razonSocial: 'x' }, itemsC))).toContain(
        'condicion_iva_invalida_para_C',
      )
      expect(messages(conReceptor(1, { docTipo: 80, docNro: 20111111112, condicionIVA: 5, razonSocial: 'x' }))).toContain(
        'condicion_iva_invalida_para_A',
      )
    })
  })

  it('NC B a consumidor final también exige docNro 0', () => {
    const r = EmitirComprobanteRequestSchema.safeParse(
      validInput({
        cbteTipo: 8,
        receptor: { docTipo: 99, docNro: 5, condicionIVA: 5, razonSocial: 'CF' },
        cbtesAsoc: [{ tipo: 6, ptoVta: 1, nro: 1 }],
      }),
    )
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.map((i) => i.message)).toContain('docNro_debe_ser_0_para_docTipo_99_en_B')
  })

  it('docNro: acepta número o string de dígitos; rechaza texto, negativos y decimales', () => {
    const conDoc = (docNro: unknown) =>
      EmitirComprobanteRequestSchema.safeParse(
        validInput({ receptor: { docTipo: 96, docNro, condicionIVA: 5, razonSocial: 'x' } }),
      )
    const ok = conDoc('30123456')
    expect(ok.success && ok.data.receptor.docNro).toBe(30123456)
    for (const malo of ['abc', '12a', -1, 1.5, '']) {
      const r = conDoc(malo)
      expect(r.success, String(malo)).toBe(false)
    }
  })

  it('ptoVta tiene que ser un entero positivo', () => {
    const r = EmitirComprobanteRequestSchema.safeParse(validInput({ ptoVta: 0 }))
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0]!.message).toBe('ptoVta_invalido')
  })
})
