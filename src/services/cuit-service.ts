/**
 * Pendiente de implementación.
 */
const PLACEHOLDER = 'No implementado todavía'

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
