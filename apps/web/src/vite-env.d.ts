/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the API. Defaults to `/api`, proxied to the Nest server by Vite in dev. */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
