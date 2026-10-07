import { FormAlert, Spinner } from '@/components/atoms'
import { Button } from '@/components/ui/button'

interface SaveBarProps {
  count: number
  saving: boolean
  error?: string
  onSave: () => void
  onDiscard: () => void
}

/** Floating bar shown while the grid has unsaved changes. */
export function SaveBar({ count, saving, error, onSave, onDiscard }: SaveBarProps) {
  if (count === 0) return null

  return (
    <div
      role="region"
      aria-label="Alterações não salvas"
      className="sticky bottom-4 z-20 mx-auto flex w-full max-w-xl flex-col gap-2 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur"
    >
      {error && <FormAlert>{error}</FormAlert>}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm">
          {count === 1 ? '1 alteração não salva' : `${count} alterações não salvas`}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onDiscard} disabled={saving}>
            Descartar
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving && <Spinner />}
            Salvar
          </Button>
        </div>
      </div>
    </div>
  )
}
