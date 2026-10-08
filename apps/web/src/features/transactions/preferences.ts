import { useEffect, useState } from 'react'
import { DEFAULT_SORT, normalizeSort, type SortLevel } from './view'

export const STATEMENT_VIEW_KEY = 'budget:statement-view'

interface StatementView {
  pendingOnly: boolean
  sort: SortLevel[]
}

const DEFAULT_VIEW: StatementView = { pendingOnly: false, sort: DEFAULT_SORT }

function readView(): StatementView {
  try {
    const raw = localStorage.getItem(STATEMENT_VIEW_KEY)
    if (!raw) return DEFAULT_VIEW
    const parsed = JSON.parse(raw) as Partial<StatementView> | null
    return { pendingOnly: parsed?.pendingOnly === true, sort: normalizeSort(parsed?.sort) }
  } catch {
    return DEFAULT_VIEW
  }
}

/**
 * The statement's filter and ordering, remembered in this browser (a per-viewer
 * convenience: without storage it just starts from the default every time).
 */
export function useStatementView() {
  const [view, setView] = useState(readView)

  useEffect(() => {
    try {
      localStorage.setItem(STATEMENT_VIEW_KEY, JSON.stringify(view))
    } catch {
      // Storage blocked or full: the choice lasts while the page is open
    }
  }, [view])

  return {
    pendingOnly: view.pendingOnly,
    setPendingOnly: (pendingOnly: boolean) => setView((v) => ({ ...v, pendingOnly })),
    sort: view.sort,
    setSort: (sort: SortLevel[]) => setView((v) => ({ ...v, sort })),
  }
}
