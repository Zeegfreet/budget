import { useId, useState } from 'react'
import { FormAlert, MoneyInput, MoneyText, Spinner } from '@/components/atoms'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { formatPercent, ruleError, SPLIT_TYPE_LABEL } from '@/features/groups/split'
import type { GroupMember, SplitMethod, SplitMethodInput, SplitShare, SplitType } from '@/features/groups/types'
import { formatAmount, parseMoneyInput } from '@/lib/money'
import { FormField } from './FormField'

export const MAX_SPLIT_METHOD_NAME_LENGTH = 60

interface SplitMethodFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Active members, the ones a rule may name */
  members: GroupMember[]
  /** Editing: the current rule */
  initial?: SplitMethod
  /** Rejects to show `errorMessage(error)` */
  onSubmit: (values: SplitMethodInput) => Promise<void>
  errorMessage: (error: unknown) => string
}

const TYPE_HELP: Record<SplitType, string> = {
  EQUAL: 'Divide em partes iguais entre os participantes.',
  PERCENT: 'Cada participante paga um percentual; a soma deve dar 100%.',
  WEIGHT: 'Divide proporcionalmente aos pesos (ex.: 2 para quem tem o quarto maior, 1 para os demais).',
  FIXED: 'Cada participante paga um valor fixo; o lançamento deve ter o valor total da regra.',
}

/** Creates or edits a split rule: its type and how much each member takes. */
export function SplitMethodFormDialog({ open, onOpenChange, ...props }: SplitMethodFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        {open && <SplitMethodForm onDone={() => onOpenChange(false)} {...props} />}
      </DialogContent>
    </Dialog>
  )
}

/** Text shown in a member's input for a stored value */
function valueText(type: SplitType, value: number): string {
  if (type === 'PERCENT') return formatPercent(value)
  if (type === 'FIXED') return formatAmount(value)
  return String(value)
}

/** The stored value for a member's input; `undefined` when blank, `null` when invalid */
function parseValue(type: SplitType, text: string): number | null | undefined {
  if (!text.trim()) return undefined
  if (type === 'WEIGHT') return /^\d+$/.test(text.trim()) ? Number(text) : null
  // Percentages have two decimals, so hundredths of a percent are basis points
  return parseMoneyInput(text.replace('%', ''))
}

function SplitMethodForm({
  members,
  initial,
  onSubmit,
  errorMessage,
  onDone,
}: Omit<SplitMethodFormDialogProps, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const editing = initial !== undefined
  const initialValues = (type: SplitType) =>
    Object.fromEntries(
      initial && initial.type === type ? initial.shares.map((s) => [s.memberId, valueText(type, s.value)]) : [],
    ) as Record<number, string>

  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState<SplitType>(initial?.type ?? 'EQUAL')
  const [allMembers, setAllMembers] = useState(!initial || initial.type !== 'EQUAL' || initial.shares.length === 0)
  const [included, setIncluded] = useState<Set<number>>(
    new Set(initial?.type === 'EQUAL' && initial.shares.length > 0 ? initial.shares.map((s) => s.memberId) : []),
  )
  const [values, setValues] = useState<Record<number, string>>(initialValues(initial?.type ?? 'EQUAL'))
  const [nameError, setNameError] = useState<string>()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const id = useId()

  function changeType(next: SplitType) {
    setType(next)
    setValues(initialValues(next))
    setError(null)
  }

  /** The shares as typed, or the first problem with them */
  function readShares(): { shares: SplitShare[] } | { error: string } {
    if (type === 'EQUAL') {
      if (allMembers) return { shares: [] }
      const shares = members.filter((m) => included.has(m.id)).map((m) => ({ memberId: m.id, value: 1 }))
      return shares.length > 0 ? { shares } : { error: 'Escolha ao menos um participante.' }
    }
    const shares: SplitShare[] = []
    for (const m of members) {
      const value = parseValue(type, values[m.id] ?? '')
      if (value === null) return { error: `Valor inválido para ${m.name}.` }
      if (value !== undefined && value > 0) shares.push({ memberId: m.id, value })
    }
    const problem = ruleError(type, shares)
    return problem ? { error: problem } : { shares }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    setNameError(trimmed ? undefined : 'Informe o nome da regra.')
    const result = readShares()
    if ('error' in result) {
      setError(result.error)
      return
    }
    if (!trimmed) return
    setPending(true)
    setError(null)
    try {
      await onSubmit({ name: trimmed, type, shares: result.shares })
      onDone()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setPending(false)
    }
  }

  const parsed = members.map((m) => parseValue(type, values[m.id] ?? '') ?? 0)
  const total = parsed.reduce((t, v) => t + v, 0)

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? 'Editar regra de rateio' : 'Nova regra de rateio'}</DialogTitle>
        <DialogDescription>
          {initial && !initial.active
            ? 'Esta regra está inativa porque um membro saiu do grupo. Ajuste a divisão para usá-la de novo.'
            : 'Define como os lançamentos do grupo são divididos entre os membros.'}
        </DialogDescription>
      </DialogHeader>

      <FormField
        label="Nome"
        placeholder="Ex.: Aluguel por quarto"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={MAX_SPLIT_METHOD_NAME_LENGTH}
        error={nameError}
        autoFocus={!editing}
      />

      <Field>
        <FieldLabel htmlFor={`${id}-type`}>Tipo</FieldLabel>
        <NativeSelect
          id={`${id}-type`}
          className="w-full"
          value={type}
          onChange={(e) => changeType(e.target.value as SplitType)}
        >
          {(Object.keys(SPLIT_TYPE_LABEL) as SplitType[]).map((t) => (
            <NativeSelectOption key={t} value={t}>
              {SPLIT_TYPE_LABEL[t]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <FieldDescription>{TYPE_HELP[type]}</FieldDescription>
      </Field>

      <fieldset className="flex flex-col gap-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">Participantes</legend>
        {type === 'EQUAL' ? (
          <>
            <div className="flex items-center gap-3">
              <Switch id={`${id}-all`} checked={allMembers} onCheckedChange={setAllMembers} />
              <FieldLabel htmlFor={`${id}-all`}>Todos os membros (inclusive os que entrarem depois)</FieldLabel>
            </div>
            {!allMembers &&
              members.map((m) => (
                <div key={m.id} className="flex items-center gap-3">
                  <Checkbox
                    id={`${id}-m${m.id}`}
                    checked={included.has(m.id)}
                    onCheckedChange={(checked) =>
                      setIncluded((current) => {
                        const next = new Set(current)
                        if (checked) next.add(m.id)
                        else next.delete(m.id)
                        return next
                      })
                    }
                  />
                  <FieldLabel htmlFor={`${id}-m${m.id}`}>{m.name}</FieldLabel>
                </div>
              ))}
          </>
        ) : (
          <>
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3">
                <FieldLabel htmlFor={`${id}-m${m.id}`} className="min-w-0 truncate">
                  {m.name}
                </FieldLabel>
                {type === 'FIXED' ? (
                  <MoneyInput
                    id={`${id}-m${m.id}`}
                    placeholder="0,00"
                    value={values[m.id] ?? ''}
                    onValueChange={(text) => setValues((v) => ({ ...v, [m.id]: text }))}
                    className="w-32"
                  />
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Input
                      id={`${id}-m${m.id}`}
                      inputMode={type === 'WEIGHT' ? 'numeric' : 'decimal'}
                      placeholder="0"
                      value={values[m.id] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, [m.id]: e.target.value }))}
                      className="w-24 text-right tabular-nums"
                    />
                    <span className="w-4 text-sm text-muted-foreground">{type === 'PERCENT' ? '%' : ''}</span>
                  </div>
                )}
              </div>
            ))}
            <FieldDescription>
              Deixe em branco quem não participa.{' '}
              {type === 'PERCENT' && <span aria-live="polite">Total: {formatPercent(total)}% de 100%.</span>}
              {type === 'FIXED' && (
                <span aria-live="polite">
                  Total: <MoneyText cents={total} />.
                </span>
              )}
            </FieldDescription>
          </>
        )}
      </fieldset>

      {error && <FormAlert>{error}</FormAlert>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          {editing ? 'Salvar' : 'Criar regra'}
        </Button>
      </DialogFooter>
    </form>
  )
}
