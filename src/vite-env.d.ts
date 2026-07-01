/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PERSONAL_CONTENT_PROVIDER?: 'browser' | 'workspace'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
