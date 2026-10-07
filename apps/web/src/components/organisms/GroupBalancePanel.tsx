import { ArrowRightIcon, CircleCheckIcon } from 'lucide-react'
import { MoneyText } from '@/components/atoms'
import { StatCard } from '@/components/molecules'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { GroupBalance } from '@/features/groups/types'

interface GroupBalancePanelProps {
  balance: GroupBalance
  /** The current user's membership id, to mark "você" */
  memberId: number
}

/** The month's result per member: their share, what they paid or received and who owes whom. */
export function GroupBalancePanel({ balance, memberId }: GroupBalancePanelProps) {
  const name = (id: number) => balance.members.find((m) => m.memberId === id)?.name ?? 'Ex-membro'

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Despesas do mês" cents={balance.expenseCents} />
        <StatCard title="Receitas do mês" cents={balance.incomeCents} />
        <StatCard
          title="Em aberto"
          cents={balance.pendingCents}
          description="Ainda não pago ou recebido; não entra no acerto."
        />
      </div>

      <Card role="region" aria-label="Balanço por membro">
        <CardHeader>
          <CardTitle>Balanço por membro</CardTitle>
          <CardDescription>
            Cota é a parte de cada um nas despesas, menos a parte nas receitas. O saldo considera só o que já foi
            pago ou recebido.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Membro</TableHead>
                <TableHead className="text-right">Cota</TableHead>
                <TableHead className="text-right">Pagou</TableHead>
                <TableHead className="text-right">Recebeu</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {balance.members.map((m) => (
                <TableRow key={m.memberId} aria-label={m.name}>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      {m.name}
                      {m.memberId === memberId && <Badge variant="secondary">Você</Badge>}
                      {!m.active && <Badge variant="outline">Saiu</Badge>}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <MoneyText cents={m.shareCents} />
                  </TableCell>
                  <TableCell className="text-right">
                    <MoneyText cents={m.paidCents} />
                  </TableCell>
                  <TableCell className="text-right">
                    <MoneyText cents={m.receivedCents} />
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="flex flex-col items-end">
                      <MoneyText cents={m.netCents} signed className="font-medium" />
                      <span className="text-xs text-muted-foreground">
                        {m.netCents > 0 ? 'a receber' : m.netCents < 0 ? 'deve' : 'em dia'}
                      </span>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card role="region" aria-label="Acerto do mês">
        <CardHeader>
          <CardTitle>Acerto do mês</CardTitle>
          <CardDescription>Transferências que deixam todos em dia.</CardDescription>
        </CardHeader>
        <CardContent>
          {balance.transfers.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CircleCheckIcon className="size-4" aria-hidden />
              Ninguém deve nada neste mês.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {balance.transfers.map((t) => (
                <li key={`${t.fromMemberId}-${t.toMemberId}`} className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                  <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span>
                    <span className="font-medium">{name(t.fromMemberId)}</span> paga{' '}
                    <MoneyText cents={t.amountCents} className="font-medium" /> para{' '}
                    <span className="font-medium">{name(t.toMemberId)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
