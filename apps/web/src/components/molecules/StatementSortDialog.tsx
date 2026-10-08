import { ArrowDownIcon, ArrowUpIcon, PlusIcon, RotateCcwIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { FormDialogContent } from '@/components/atoms'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  DEFAULT_SORT,
  DIRECTION_LABELS,
  SORT_KEYS,
  SORT_LABELS,
  type SortDirection,
  type SortKey,
  type SortLevel,
} from '@/features/transactions/view'

interface StatementSortDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sort: SortLevel[]
  onSubmit: (sort: SortLevel[]) => void
}

/** Edits the statement's ordering: criteria in priority order, each with its direction. */
export function StatementSortDialog({ open, onOpenChange, sort, onSubmit }: StatementSortDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <FormDialogContent>
        {/* Mounted only while open, so it always starts from the applied ordering */}
        {open && (
          <SortForm
            initial={sort}
            onCancel={() => onOpenChange(false)}
            onSubmit={(levels) => {
              onSubmit(levels)
              onOpenChange(false)
            }}
          />
        )}
      </FormDialogContent>
    </Dialog>
  )
}

function SortForm({
  initial,
  onCancel,
  onSubmit,
}: {
  initial: SortLevel[]
  onCancel: () => void
  onSubmit: (sort: SortLevel[]) => void
}) {
  const [levels, setLevels] = useState(initial)
  const unused = SORT_KEYS.filter((key) => !levels.some((l) => l.key === key))

  const update = (index: number, change: Partial<SortLevel>) =>
    setLevels((all) => all.map((level, i) => (i === index ? { ...level, ...change } : level)))
  const move = (index: number, to: number) =>
    setLevels((all) => {
      const next = [...all]
      ;[next[index], next[to]] = [next[to], next[index]]
      return next
    })
  const remove = (index: number) => setLevels((all) => all.filter((_, i) => i !== index))
  const add = () => setLevels((all) => [...all, { key: unused[0], direction: 'asc' }])

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    onSubmit(levels)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Ordenar lançamentos</DialogTitle>
        <DialogDescription>
          Dentro de cada tipo, pelo primeiro critério; os empates seguem o próximo.
        </DialogDescription>
      </DialogHeader>
      <ol className="flex flex-col gap-3">
        {levels.map((level, index) => {
          const position = `${index + 1}º`
          return (
            <li key={level.key} aria-label={`${position} critério`} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1">
                <span className="w-6 shrink-0 text-sm font-medium text-muted-foreground">{position}</span>
                <NativeSelect
                  className="min-w-0 flex-1"
                  aria-label={`Critério ${position}`}
                  value={level.key}
                  onChange={(e) => update(index, { key: e.target.value as SortKey })}
                >
                  {SORT_KEYS.filter((key) => key === level.key || unused.includes(key)).map((key) => (
                    <NativeSelectOption key={key} value={key}>
                      {SORT_LABELS[key]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Subir ${SORT_LABELS[level.key]}`}
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Descer ${SORT_LABELS[level.key]}`}
                  disabled={index === levels.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  <ArrowDownIcon />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remover ${SORT_LABELS[level.key]}`}
                  disabled={levels.length === 1}
                  onClick={() => remove(index)}
                >
                  <XIcon />
                </Button>
              </div>
              <NativeSelect
                className="ml-7"
                size="sm"
                aria-label={`Direção ${position}`}
                value={level.direction}
                onChange={(e) => update(index, { direction: e.target.value as SortDirection })}
              >
                {(['asc', 'desc'] as const).map((direction) => (
                  <NativeSelectOption key={direction} value={direction}>
                    {DIRECTION_LABELS[level.key][direction]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </li>
          )
        })}
      </ol>
      <div className="flex flex-wrap gap-2">
        {unused.length > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={add}>
            <PlusIcon />
            Adicionar critério
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={() => setLevels(DEFAULT_SORT)}>
          <RotateCcwIcon />
          Restaurar padrão
        </Button>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit">Aplicar</Button>
      </DialogFooter>
    </form>
  )
}
