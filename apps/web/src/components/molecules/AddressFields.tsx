import { cepLookupFailedMessage, cepNotFoundMessage, type CepAddress } from '@/features/address/hooks'
import { FormField } from './FormField'

interface AddressFieldsProps {
  address: CepAddress
  errors?: { cep?: string; city?: string; state?: string }
}

/** CEP, city and UF. City and UF are read-only unless the CEP lookup failed. */
export function AddressFields({ address, errors = {} }: AddressFieldsProps) {
  const readOnly = !address.lookupFailed
  const cepDescription = address.isFetching
    ? 'Buscando endereço…'
    : address.lookupFailed
      ? cepLookupFailedMessage
      : undefined

  return (
    <>
      <FormField
        label="CEP"
        name="cep"
        inputMode="numeric"
        autoComplete="postal-code"
        placeholder="00000-000"
        value={address.cep}
        onChange={(e) => address.setCep(e.target.value)}
        description={cepDescription}
        error={address.cepNotFound ? cepNotFoundMessage : errors.cep}
      />
      <div className="grid grid-cols-[1fr_5rem] items-start gap-3">
        <FormField
          label="Cidade"
          name="city"
          autoComplete="address-level2"
          readOnly={readOnly}
          value={address.city}
          onChange={(e) => address.setCity(e.target.value)}
          error={errors.city}
        />
        <FormField
          label="UF"
          name="state"
          autoComplete="address-level1"
          autoCapitalize="characters"
          maxLength={2}
          readOnly={readOnly}
          value={address.state}
          onChange={(e) => address.setState(e.target.value)}
          error={errors.state}
        />
      </div>
    </>
  )
}
