/**
 * Versión pública — la implementación está en la versión completa.
 * Ver https://mpago.la/31zH7xo para obtener acceso al código fuente.
 */
const PLACEHOLDER = 'Disponible en la versión completa — https://mpago.la/31zH7xo'

export interface CuitInfo {
  cuit: string
  razonSocial?: string
  tipoPersona?: 'FISICA' | 'JURIDICA'
  estado?: 'ACTIVO' | 'INACTIVO'
  domicilio?: string
}

export interface CuitService {
  /**
   * Consulta la información de un CUIT en el Padrón A13 de ARCA.
   */
  lookup(cuit: string): Promise<CuitInfo>
}

export class NotImplementedCuitService implements CuitService {
  async lookup(_cuit: string): Promise<CuitInfo> {
    void _cuit
    throw new Error(PLACEHOLDER)
  }
}
