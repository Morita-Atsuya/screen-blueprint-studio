/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_SAMPLE_RESET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
