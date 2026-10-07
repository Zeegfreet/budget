import type { GroupStatement } from '@/features/budget/types'
import type { GroupLink } from './types'

/** The link ids of a group statement, as the link dialog takes them */
export const statementLink = ({ link }: GroupStatement): GroupLink => ({
  expenseCategoryId: link.expenseCategory?.id ?? null,
  incomeCategoryId: link.incomeCategory?.id ?? null,
})
