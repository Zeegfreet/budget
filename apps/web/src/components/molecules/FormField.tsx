import { useId } from 'react'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

interface FormFieldProps extends Omit<React.ComponentProps<typeof Input>, 'id'> {
  label: string
  description?: string
  error?: string
}

/** Label + input + description/error, wired together for accessibility. */
export function FormField({
  label,
  description,
  error,
  ...inputProps
}: FormFieldProps) {
  const id = useId()
  const descriptionId = description ? `${id}-description` : undefined
  const errorId = error ? `${id}-error` : undefined

  return (
    <Field data-invalid={!!error || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        aria-invalid={!!error || undefined}
        aria-describedby={[descriptionId, errorId].filter(Boolean).join(' ') || undefined}
        {...inputProps}
      />
      {description && (
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      )}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </Field>
  )
}
