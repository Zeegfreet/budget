import { ArrowRightIcon, CheckCheckIcon, CircleCheckIcon } from 'lucide-react'
import { useState } from 'react'
import { CheckButton, MoneyText } from '@/components/atoms'
import { StatCard } from '@/components/molecules'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { settlementPairs } from '@/features/groups/settlements'
import type { GroupBalance, SettlementInput, SettlementItem } from '@/features/groups/types'
import { cn } from '@/lib/utils'

interface GroupBalancePanelProps {
  balance: GroupBalance
  /** The current user's membership id, to mark "você" */
  memberId: number
  /** Confirms (or undoes) that shares were paid back */
  onSettle: (input: SettlementInput) => Promise<void>
}

const target = ({ transactionId, memberId }: SettlementItem) => ({ transactionId, memberId })

/** The month's result per member: their share, what they paid or received and who owes whom. */
export function GroupBalancePanel({ balance, memberId, onSettle }: GroupBalancePanelProps) {
  const name = (id: number) => balance.members.find((m) => m.memberId === id)?.name ?? 'Ex-membro'
  const who = (id: number) => (id === memberId ? 'você' : name(id))
  const pairs = settlementPairs(balance.settlements)
  /** Keys being saved, so a button isn't pressed twice */
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const keyOf = (i: SettlementItem) => `${i.transactionId}:${i.memberId}`

  async function settle(items: SettlementItem[], settled: boolean) {
    const keys = items.map(keyOf)
    setSaving((current) => new Set([...current, ...keys]))
    try {
      await onSettle({ items: items.map(target), settled })
    } finally {
      setSaving((current) => new Set([...current].filter((k) => !keys.includes(k))))
    }
  }

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

      {pairs.length > 0 && (
        <Card role="region" aria-label="Recebimentos">
          <CardHeader>
            <CardTitle>Recebimentos</CardTitle>
            <CardDescription>
              A parte de cada um nos itens já pagos. Quem recebe o dinheiro marca a parte como recebida; ela sai do
              saldo.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {pairs.map((pair) => {
              const label = `${who(pair.fromMemberId)} → ${who(pair.toMemberId)}`
              const open = pair.items.filter((i) => !i.settled && i.canSettle)
              return (
                <section
                  key={`${pair.fromMemberId}-${pair.toMemberId}`}
                  aria-label={label}
                  className="rounded-lg border"
                >
                  <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
                    <span className="min-w-0 text-sm">
                      <span className="font-medium">{name(pair.fromMemberId)}</span>
                      {pair.fromMemberId === memberId && ' (você)'} deve a{' '}
                      <span className="font-medium">{name(pair.toMemberId)}</span>
                      {pair.toMemberId === memberId && ' (você)'}
                      <span className="text-muted-foreground">
                        {' · '}
                        {pair.openCents > 0 ? (
                          <>
                            <MoneyText cents={pair.openCents} /> em aberto
                          </>
                        ) : (
                          'tudo recebido'
                        )}
                      </span>
                    </span>
                    {open.length > 1 && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={open.some((i) => saving.has(keyOf(i)))}
                        onClick={() => settle(open, true)}
                      >
                        <CheckCheckIcon aria-hidden />
                        Marcar tudo como recebido
                      </Button>
                    )}
                  </header>
                  <ul className="divide-y">
                    {pair.items.map((item) => (
                      <li
                        key={keyOf(item)}
                        aria-label={item.description}
                        data-settled={item.settled || undefined}
                        className="flex items-center gap-1 py-1 pr-3 pl-1"
                      >
                        <CheckButton
                          pressed={item.settled}
                          disabled={!item.canSettle || saving.has(keyOf(item))}
                          onPressedChange={(settled) => settle([item], settled)}
                          aria-label={`Recebido: ${name(item.memberId)} — ${item.description}`}
                        />
                        <span
                          className={cn('min-w-0 flex-1 truncate text-sm', item.settled && 'text-muted-foreground')}
                        >
                          {item.description}
                          {item.kind === 'INCOME' && (
                            <Badge variant="secondary" className="ml-1.5">
                              Receita
                            </Badge>
                          )}
                        </span>
                        <MoneyText
                          cents={item.amountCents}
                          className={cn('shrink-0 text-sm font-medium', item.settled && 'font-normal text-muted-foreground')}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
