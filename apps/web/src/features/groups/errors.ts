import { knownPaymentMethodMessage } from '@/features/payment-methods/errors'
import { knownRecurrenceMessage } from '@/features/transactions/errors'
import { ApiError } from '@/lib/api/client'

/** The API's messages for group rules the user can fix, in Portuguese */
const MESSAGES: Record<string, string> = {
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
  'categoryLinks.categoryId must be an expense category':
    'Cada categoria de despesa do grupo deve apontar para uma categoria de despesa sua.',
  'categoryLinks.categoryId must be an income category':
    'Cada categoria de receita do grupo deve apontar para uma categoria de receita sua.',
  'Each group category can be linked once': 'Cada categoria do grupo só pode ser vinculada uma vez.',
  'A group category with this name already exists': 'Já existe uma categoria do grupo com esse nome.',
  'Group category is inactive': 'Esta categoria do grupo está inativa. Escolha outra.',
  'categoryId must be a category of the same kind': 'Escolha uma categoria do grupo do mesmo tipo do lançamento.',
  'Group category not found': 'Categoria do grupo não encontrada. Atualize a página.',
  'Undo the confirmed shares first':
    'Há partes já marcadas como recebidas neste lançamento. Desmarque-as no Balanço antes de mudar o pagamento, o valor ou a regra.',
  'Only who receives the money can confirm it': 'Só quem recebe o dinheiro pode confirmar o recebimento.',
  'Transaction is pending': 'O lançamento ainda não foi pago.',
}

const NICKNAME_REQUIRED = 'Nickname required for an unregistered e-mail'

/** The invited e-mail has no account, so a nickname is needed to pre-register them */
export function needsNickname(error: unknown): boolean {
  return error instanceof ApiError && error.messages.includes(NICKNAME_REQUIRED)
}

/** Message for a failed change in a group */
export function groupErrorMessage(error: unknown, fallback: string): string {
  const method = knownPaymentMethodMessage(error) ?? knownRecurrenceMessage(error)
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
