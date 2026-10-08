import { isItemDone, itemCents, type Statement, type StatementItem } from './statement'

/** What the statement's rows can be ordered by */
export type SortKey = 'dueDay' | 'paymentMethod' | 'category' | 'amount' | 'status'
export type SortDirection = 'asc' | 'desc'

/** One level of the ordering: ties fall to the next level */
export interface SortLevel {
  key: SortKey
  direction: SortDirection
}

export const SORT_KEYS: SortKey[] = ['dueDay', 'paymentMethod', 'category', 'amount', 'status']

export const SORT_LABELS: Record<SortKey, string> = {
  dueDay: 'Vencimento',
  paymentMethod: 'Forma de pagamento',
  category: 'Categoria',
  amount: 'Valor',
  status: 'Situação',
}

/** How each direction reads for a key ("Pendentes primeiro" rather than "Crescente") */
export const DIRECTION_LABELS: Record<SortKey, Record<SortDirection, string>> = {
  dueDay: { asc: 'Mais cedo primeiro', desc: 'Mais tarde primeiro' },
  paymentMethod: { asc: 'A → Z', desc: 'Z → A' },
  category: { asc: 'Ordem das categorias', desc: 'Ordem inversa' },
  amount: { asc: 'Menor primeiro', desc: 'Maior primeiro' },
  status: { asc: 'Pendentes primeiro', desc: 'Pagos primeiro' },
}

/** The server's order: effective due day (the payment method's, or else the launch's) */
export const DEFAULT_SORT: SortLevel[] = [{ key: 'dueDay', direction: 'asc' }]

export interface StatementViewOptions {
  /** Hides realized transactions and settled shares */
  pendingOnly: boolean
  sort: SortLevel[]
  /** Category ids in the tree's order, for the `category` key */
  categoryOrder: number[]
}

type Comparator = (a: StatementItem, b: StatementItem) => number

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })

const dueDayOf = (item: StatementItem) =>
  item.kind === 'transaction' ? item.transaction.dueDay : item.share.item.dueDay

const methodOf = (item: StatementItem) =>
  (item.kind === 'transaction' ? item.transaction.paymentMethod : item.share.paymentMethod)?.name ?? null

const categoryOf = (item: StatementItem) =>
  item.kind === 'transaction' ? item.transaction.category : item.share.item.category

/** Compares present values in `direction`; a missing one always goes last */
function nullsLast<T>(get: (item: StatementItem) => T | null, compare: (a: T, b: T) => number) {
  return (direction: SortDirection): Comparator =>
    (a, b) => {
      const x = get(a)
      const y = get(b)
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1
      return direction === 'asc' ? compare(x, y) : compare(y, x)
    }
}

const directed =
  (compare: Comparator) =>
  (direction: SortDirection): Comparator =>
    direction === 'asc' ? compare : (a, b) => compare(b, a)

function comparatorFor({ key, direction }: SortLevel, categoryOrder: number[]): Comparator {
  switch (key) {
    case 'dueDay':
      return nullsLast(dueDayOf, (x: number, y: number) => x - y)(direction)
    case 'paymentMethod':
      return nullsLast(methodOf, collator.compare)(direction)
    case 'category': {
      const rank = (id: number) => {
        const index = categoryOrder.indexOf(id)
        return index === -1 ? categoryOrder.length : index
      }
      return directed((a, b) => {
        const x = categoryOf(a)
        const y = categoryOf(b)
        return rank(x.id) - rank(y.id) || collator.compare(x.name, y.name)
      })(direction)
    }
    case 'amount':
      return directed((a, b) => itemCents(a) - itemCents(b))(direction)
    case 'status':
      // Ascending = pending first
      return directed((a, b) => Number(isItemDone(a)) - Number(isItemDone(b)))(direction)
  }
}

/** Chains the levels; full ties keep the original order (`Array#sort` is stable) */
export function compareItems(levels: SortLevel[], categoryOrder: number[] = []): Comparator {
  const comparators = levels.map((level) => comparatorFor(level, categoryOrder))
  return (a, b) => {
    for (const compare of comparators) {
      const result = compare(a, b)
      if (result !== 0) return result
    }
    return 0
  }
}

/** A stored ordering, if valid: known keys, each once, with a direction; else the default */
export function normalizeSort(raw: unknown): SortLevel[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > SORT_KEYS.length) return DEFAULT_SORT
  const seen = new Set<SortKey>()
  for (const level of raw) {
    if (
      typeof level !== 'object' ||
      level === null ||
      !SORT_KEYS.includes(level.key) ||
      (level.direction !== 'asc' && level.direction !== 'desc') ||
      seen.has(level.key)
    ) {
      return DEFAULT_SORT
    }
    seen.add(level.key)
  }
  return raw.map(({ key, direction }: SortLevel) => ({ key, direction }))
}

/** "Vencimento ↑, Valor ↓" */
export const describeSort = (levels: SortLevel[]) =>
  levels.map(({ key, direction }) => `${SORT_LABELS[key]} ${direction === 'asc' ? '↑' : '↓'}`).join(', ')

/**
 * What the list shows: each type's items filtered (pending only) and ordered,
 * types left empty dropped and their subtotals over the shown items. The
 * sections' totals stay those of the whole month.
 */
export function viewStatement(statement: Statement, { pendingOnly, sort, categoryOrder }: StatementViewOptions): Statement {
  const compare = compareItems(sort, categoryOrder)
  return {
    ...statement,
    sections: statement.sections.map((section) => ({
      ...section,
      groups: section.groups.flatMap((group) => {
        const items = (pendingOnly ? group.items.filter((item) => !isItemDone(item)) : [...group.items]).sort(compare)
        if (items.length === 0) return []
        const effectiveCents = pendingOnly ? items.reduce((sum, item) => sum + itemCents(item), 0) : group.effectiveCents
        return [{ ...group, items, effectiveCents }]
      }),
    })),
  }
}
