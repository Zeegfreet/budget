import { knownPaymentMethodMessage } from '@/features/payment-methods/errors'
import { ApiError } from '@/lib/api/client'

/** The API's messages for group rules the user can fix, in Portuguese */
const MESSAGES: Record<string, string> = {
  'No user with this e-mail': 'Nenhum usuário cadastrado com este e-mail.',
  'Already invited': 'Este usuário já tem um convite pendente.',
  'Already a member': 'Este usuário já é membro do grupo.',
  "You can't invite yourself": 'Você já faz parte do grupo.',
  'Only the group owner can do this': 'Apenas o dono do grupo pode fazer isso.',
  'Percentages must add up to 100%': 'Os percentuais devem somar 100%.',
  'The amount must equal the fixed values total': 'O valor deve ser igual à soma dos valores fixos da regra.',
  'Split method is inactive': 'Esta regra de rateio está inativa. Edite-a antes de usar.',
  'A split method with this name already exists': 'Já existe uma regra com esse nome.',
  'Choose a split method': 'Escolha uma regra de rateio.',
  'Every participant must be an active member': 'Escolha apenas membros ativos do grupo.',
  'Unknown member': 'Escolha um membro ativo do grupo.',
  'Leave the group instead of removing yourself': 'Para sair do grupo, use “Sair do grupo”.',
  'Category is inactive': 'Escolha uma categoria ativa.',
  'expenseCategoryId must be an expense category': 'Escolha uma categoria de despesa para as despesas do grupo.',
  'incomeCategoryId must be an income category': 'Escolha uma categoria de receita para as receitas do grupo.',
}

/** Message for a failed change in a group */
export function groupErrorMessage(error: unknown, fallback: string): string {
  const method = knownPaymentMethodMessage(error)
  if (method) return method
  if (!(error instanceof ApiError)) return fallback
  const known = error.messages.map((m) => MESSAGES[m]).filter(Boolean)
  if (known.length > 0) return known.join(' ')
  if (error.status === 404) return 'Não encontrado. Atualize a página.'
  return error.messages.join(' ') || fallback
}

/** Message for a failed change of a group series' range */
export function groupSeriesErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return 'Há lançamentos já pagos depois desse mês. Desfaça o pagamento ou escolha um mês posterior.'
  }
  return groupErrorMessage(error, 'Não foi possível ajustar a recorrência.')
}
