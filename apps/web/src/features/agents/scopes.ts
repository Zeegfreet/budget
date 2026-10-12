import type { AgentScope } from './types'

/** How each permission reads on the consent screen and the connections list. */
export const scopeLabels: Record<AgentScope, { title: string; description: string }> = {
  'budget:read': {
    title: 'Ver suas finanças',
    description: 'Orçamento, tipos e categorias, lançamentos, saldos e meios de pagamento.',
  },
  'budget:write': {
    title: 'Alterar suas finanças',
    description:
      'Criar, alterar e excluir tipos, categorias, lançamentos e valores do planejamento, e marcar lançamentos como pagos.',
  },
}

/** Short label of a connection's access, e.g. "Leitura e escrita". */
export function accessLabel(scopes: readonly AgentScope[]) {
  return scopes.includes('budget:write') ? 'Leitura e escrita' : 'Somente leitura'
}
