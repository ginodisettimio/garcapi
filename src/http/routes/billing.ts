import { Router, type NextFunction, type Request, type Response } from 'express'
import type { BillingService } from '../../services/billing-service.js'
import { EmitirComprobanteRequestSchema } from '../../domain/schemas.js'
import { type AuthMiddleware } from '../middlewares/auth.js'
import { createValidateMiddleware } from '../middlewares/validate.js'

export interface BillingRoutesDeps {
  billing: BillingService
  auth: AuthMiddleware
  /** Si es true, devuelve el PDF como response binario en vez de JSON con base64. Default true. */
  sendPdfAsBinary?: boolean
}

/**
 * Crea las rutas de facturación.
 * POST /facturas — emite un comprobante.
 */
export function createBillingRoutes(deps: BillingRoutesDeps) {
  const r = Router()
  const validate = createValidateMiddleware()
  const sendPdf = deps.sendPdfAsBinary ?? true

  r.post(
    '/facturas',
    deps.auth,
    validate(EmitirComprobanteRequestSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await deps.billing.emitir(req.body)

        if (result.pdfBuffer && sendPdf) {
          res.setHeader('Content-Type', 'application/pdf')
          res.setHeader('Content-Disposition', `attachment; filename=${result.fileName}`)
          res.setHeader('X-Arca-Cae', result.cae)
          res.setHeader('X-Arca-Cae-Vto', result.vtoCae)
          res.setHeader('X-Arca-Pto-Vta', String(result.ptoVta))
          res.setHeader('X-Arca-Nro-Comprobante', String(result.nroComprobante))
          res.setHeader('X-Arca-Cbte-Tipo', String(result.cbteTipo))
          res.setHeader('X-Arca-Importe-Total', String(result.importeTotal))
          res.setHeader('X-Arca-Tipo-Autorizacion', result.tipoAutorizacion ?? 'CAE')
          res.setHeader('X-Arca-Pendiente-Informar', String(result.pendienteInformar ?? false))
          res.send(result.pdfBuffer)
        } else {
          res.json({
            ok: true,
            cae: result.cae,
            vtoCae: result.vtoCae,
            nroComprobante: result.nroComprobante,
            cbteTipo: result.cbteTipo,
            ptoVta: result.ptoVta,
            importeTotal: result.importeTotal,
            fileName: result.fileName,
            tipoAutorizacion: result.tipoAutorizacion ?? 'CAE',
            pendienteInformar: result.pendienteInformar ?? false,
            pdfBase64: result.pdfBuffer?.toString('base64') ?? null,
            xml: result.xml,
          })
        }
      } catch (err) {
        next(err)
      }
    },
  )

  return r
}
