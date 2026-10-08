/** Sign-up data of the signed-in user (`GET /users/me`). The e-mail is read-only. */
export interface Profile {
  id: number
  email: string
  name: string
  /** `YYYY-MM-DD` */
  birthDate: string
  /** 8 digits, no mask */
  cep: string
  city: string
  /** UF, e.g. `SP` */
  state: string
}

/** Body of `PATCH /users/me`: only what changed. The address goes as a block (all three or none). */
export type ProfilePatch = Partial<Pick<Profile, 'name' | 'birthDate' | 'cep' | 'city' | 'state'>>
