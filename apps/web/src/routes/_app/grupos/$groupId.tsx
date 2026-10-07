import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate, useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import {
  ChevronLeftIcon,
  Link2Icon,
  LogOutIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { EmptyState, MonthSwitcher } from '@/components/molecules'
import {
  GroupBalancePanel,
  GroupDialogs,
  GroupMembersPanel,
  GroupTransactionDialogs,
  GroupTransactionList,
  SplitMethodsPanel,
  type GroupDialog,
  type GroupTransactionAction,
  type GroupTransactionDialog,
} from '@/components/organisms'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { currentMonth, formatMonthLong } from '@/features/budget/months'
import { budgetQueries } from '@/features/budget/queries'
import type { Month } from '@/features/budget/types'
import { groupErrorMessage } from '@/features/groups/errors'
import {
  useGroupActions,
  useGroupTransactionActions,
  useInvitationActions,
  useSplitMethodActions,
} from '@/features/groups/hooks'
import { groupQueries } from '@/features/groups/queries'
import { hasFollowing } from '@/features/groups/series'
import { ApiError } from '@/lib/api/client'

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/
const TABS = ['lancamentos', 'balanco', 'membros', 'rateio'] as const
type GroupTab = (typeof TABS)[number]

interface GroupSearch {
  /** `YYYY-MM`; the current month when absent */
  month?: Month
  /** Open tab; the transactions when absent */
  tab?: GroupTab
}

/** The route's numeric id, or a 404 for anything else */
function parseGroupId(raw: string): number {
  const id = Number(raw)
  if (!Number.isInteger(id) || id < 1) throw new ApiError(404, ['Group not found'])
  return id
}

export const Route = createFileRoute('/_app/grupos/$groupId')({
  validateSearch: (search: Record<string, unknown>): GroupSearch => ({
    month: typeof search.month === 'string' && MONTH_PATTERN.test(search.month) ? search.month : undefined,
    tab: TABS.includes(search.tab as GroupTab) ? (search.tab as GroupTab) : undefined,
  }),
  loaderDeps: ({ search }) => ({ month: search.month ?? currentMonth() }),
  loader: async ({ context: { queryClient }, params, deps: { month } }) => {
    const id = parseGroupId(params.groupId)
    await Promise.all([
      queryClient.ensureQueryData(groupQueries.detail(id)),
      queryClient.ensureQueryData(groupQueries.splitMethods(id)),
      queryClient.ensureQueryData(groupQueries.invitations(id)),
      queryClient.ensureQueryData(groupQueries.transactions(id, month)),
      queryClient.ensureQueryData(groupQueries.balance(id, month)),
    ])
    return { id, month }
  },
  component: GroupPage,
  errorComponent: GroupError,
})

function GroupPage() {
  const { id, month } = Route.useLoaderData()
  const { tab = 'lancamentos' } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { data: group } = useSuspenseQuery(groupQueries.detail(id))
  const { data: splitMethods } = useSuspenseQuery(groupQueries.splitMethods(id))
  const { data: invitations } = useSuspenseQuery(groupQueries.invitations(id))
  const { data: transactions } = useSuspenseQuery(groupQueries.transactions(id, month))
  const { data: balance } = useSuspenseQuery(groupQueries.balance(id, month))
  const groupActions = useGroupActions()
  const invitationActions = useInvitationActions()
  const ruleActions = useSplitMethodActions(id)
  const transactionActions = useGroupTransactionActions(id)
  const [dialog, setDialog] = useState<GroupDialog>(null)
  // The user's categories, only once the link dialog opens
  const { data: categories } = useQuery({ ...budgetQueries.categories(), enabled: dialog?.type === 'link' })
  const [transactionDialog, setTransactionDialog] = useState<GroupTransactionDialog>(null)
  const owner = group.role === 'OWNER'

  const setSearch = (search: GroupSearch) => navigate({ search: (prev) => ({ ...prev, ...search }) })

  /** After deleting or leaving: back to the list, then drop the group from the cache */
  async function goAway() {
    await navigate({ to: '/grupos' })
    await groupActions.forget(id)
  }

  async function handleTransactionAction({ type, transaction }: GroupTransactionAction) {
    switch (type) {
      case 'unpay':
        try {
          await transactionActions.unpay(transaction.id)
        } catch (error) {
          toast.error(groupErrorMessage(error, 'Não foi possível alterar o lançamento.'))
        }
        return
      case 'delete':
        return setTransactionDialog({ type: hasFollowing(transaction) ? 'delete-scope' : 'delete', transaction })
      default:
        setTransactionDialog({ type, transaction })
    }
  }

  const monthSwitcher = <MonthSwitcher month={month} onChange={(m) => setSearch({ month: m })} />
  const newButtons = (
    <div className="grid grid-cols-2 gap-2 sm:flex">
      <Button variant="outline" onClick={() => setTransactionDialog({ type: 'create', kind: 'INCOME' })}>
        <PlusIcon />
        Nova receita
      </Button>
      <Button onClick={() => setTransactionDialog({ type: 'create', kind: 'EXPENSE' })}>
        <PlusIcon />
        Nova despesa
      </Button>
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button variant="ghost" size="sm" className="-ml-2 w-fit" asChild>
          <Link to="/grupos">
            <ChevronLeftIcon />
            Grupos
          </Link>
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold">{group.name}</h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              {group.memberCount === 1 ? '1 membro' : `${group.memberCount} membros`}
              {group.description && ` · ${group.description}`}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Opções do grupo">
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setDialog({ type: 'link' })}>
                <Link2Icon aria-hidden />
                Vincular ao orçamento
              </DropdownMenuItem>
              {owner && (
                <DropdownMenuItem onSelect={() => setDialog({ type: 'edit-group' })}>
                  <PencilIcon aria-hidden />
                  Editar grupo
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => setDialog({ type: 'leave' })}>
                <LogOutIcon aria-hidden />
                Sair do grupo
              </DropdownMenuItem>
              {owner && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setDialog({ type: 'delete-group' })}>
                    <Trash2Icon aria-hidden />
                    Excluir grupo
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(value) => setSearch({ tab: value as GroupTab })} className="gap-6">
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="lancamentos">Lançamentos</TabsTrigger>
          <TabsTrigger value="balanco">Balanço</TabsTrigger>
          <TabsTrigger value="membros">Membros</TabsTrigger>
          <TabsTrigger value="rateio">Rateio</TabsTrigger>
        </TabsList>

        <TabsContent value="lancamentos" className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {monthSwitcher}
            {newButtons}
          </div>
          {transactions.length === 0 ? (
            <EmptyState
              title={`Nenhum lançamento em ${formatMonthLong(month)}`}
              description="Lance as despesas e receitas do grupo, como aluguel, água e luz, e escolha como dividi-las."
              action={newButtons}
            />
          ) : (
            <GroupTransactionList transactions={transactions} onAction={handleTransactionAction} />
          )}
        </TabsContent>

        <TabsContent value="balanco" className="flex flex-col gap-6">
          {monthSwitcher}
          <GroupBalancePanel balance={balance} memberId={group.memberId} />
        </TabsContent>

        <TabsContent value="membros">
          <GroupMembersPanel
            group={group}
            invitations={invitations}
            onAction={(action) => setDialog(action.type === 'invite' ? { type: 'invite' } : action)}
          />
        </TabsContent>

        <TabsContent value="rateio">
          <SplitMethodsPanel
            methods={splitMethods}
            members={group.members}
            onAction={(action) =>
              setDialog(action.type === 'create' ? { type: 'create-rule' } : { type: `${action.type}-rule`, method: action.method })
            }
          />
        </TabsContent>
      </Tabs>

      <GroupDialogs
        dialog={dialog}
        onDialogChange={setDialog}
        group={group}
        onUpdateGroup={(input) => groupActions.update(id, input)}
        onDeleteGroup={async () => {
          await groupActions.remove(id)
          await goAway()
        }}
        onLeave={async () => {
          await groupActions.leave(id)
          await goAway()
        }}
        onRemoveMember={(member) => groupActions.removeMember(id, member.id)}
        categories={categories ?? []}
        onSetLink={(link) => groupActions.setLink(id, link)}
        invitations={invitationActions}
        rules={ruleActions}
      />
      <GroupTransactionDialogs
        dialog={transactionDialog}
        onDialogChange={setTransactionDialog}
        group={group}
        splitMethods={splitMethods}
        month={month}
        actions={transactionActions}
      />
    </div>
  )
}

function GroupError({ error }: ErrorComponentProps) {
  const router = useRouter()
  if (error instanceof ApiError && error.status === 404) {
    return (
      <EmptyState
        title="Grupo não encontrado"
        description="Ele não existe ou você não faz parte dele."
        action={
          <Button asChild>
            <Link to="/grupos">Ver meus grupos</Link>
          </Button>
        }
      />
    )
  }
  return (
    <EmptyState
      title="Não foi possível carregar o grupo"
      description="Verifique sua conexão e tente novamente."
      action={<Button onClick={() => router.invalidate()}>Tentar novamente</Button>}
    />
  )
}
