import type { GroupTransaction } from './types'

/** Has later occurrences in its series, which a change could also reach */
export const hasFollowing = (t: Pick<GroupTransaction, 'series'>) => !!t.series && t.series.index < t.series.count
