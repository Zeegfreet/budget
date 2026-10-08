import { Link } from '@tanstack/react-router'
import { ChevronRightIcon, UsersIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { FinanceGroupSummary } from '@/features/groups/types'

interface GroupListProps {
  groups: FinanceGroupSummary[]
}

/** The user's groups, each linking to its page. */
export function GroupList({ groups }: GroupListProps) {
  return (
    <ul aria-label="Meus grupos" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {groups.map((g) => (
        <li key={g.id} aria-label={g.name}>
          <Link
            to="/grupos/$groupId"
            params={{ groupId: String(g.id) }}
            className="flex h-full items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <UsersIcon className="size-5 text-muted-foreground" aria-hidden />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-2">
                <span className="truncate font-medium">{g.name}</span>
                {g.role === 'OWNER' && <Badge variant="secondary">Dono</Badge>}
              </span>
              <span className="truncate text-sm text-muted-foreground">
                {g.memberCount === 1 ? '1 membro' : `${g.memberCount} membros`}
                {g.description && ` · ${g.description}`}
              </span>
            </span>
            <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  )
}
