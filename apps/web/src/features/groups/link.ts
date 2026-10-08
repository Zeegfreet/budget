import type { GroupStatement } from '@/features/budget/types'
import type { GroupLink } from './types'

/** No link: the shares stay out of the budget */
export const EMPTY_LINK: GroupLink = {
  expenseCategoryId: null,
  incomeCategoryId: null,
  paymentMethodId: null,
  categoryLinks: [],
}

/** The link ids of a group statement, as the link dialog takes them */
export const statementLink = ({ link }: GroupStatement): GroupLink => ({
  expenseCategoryId: link.expenseCategory?.id ?? null,
  incomeCategoryId: link.incomeCategory?.id ?? null,
  paymentMethodId: link.paymentMethod?.id ?? null,
  categoryLinks: link.categoryLinks.map((l) => ({ groupCategoryId: l.groupCategory.id, categoryId: l.category.id })),
})
