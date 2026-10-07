import { useId, useState } from 'react'
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

interface PasswordFieldProps extends Omit<React.ComponentProps<typeof Input>, 'id' | 'type'> {
  label: string
  error?: string
}

/** Password input with a show/hide toggle, wired like `FormField`. */
export function PasswordField({ label, error, ...inputProps }: PasswordFieldProps) {
  const id = useId()
  const errorId = error ? `${id}-error` : undefined
  const [visible, setVisible] = useState(false)

  return (
    <Field data-invalid={!!error || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete="current-password"
          aria-invalid={!!error || undefined}
          aria-describedby={errorId}
          className="pr-9"
          {...inputProps}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-1/2 right-0.5 -translate-y-1/2 text-muted-foreground"
          aria-label="Mostrar senha"
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />}
        </Button>
      </div>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </Field>
  )
}
