export interface Address {
  /** 8 digits, no mask */
  cep: string
  city: string
  /** UF, e.g. `SP` */
  state: string
}
