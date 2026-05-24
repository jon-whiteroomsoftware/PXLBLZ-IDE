import { create } from 'zustand'
import { SEED_PATTERN } from '@/pixelblaze/seedPattern'

export type CompileStatus = 'good' | 'broken'

interface EditorState {
  compileStatus: CompileStatus
  source: string
  isReadOnly: boolean
  setCompileStatus: (status: CompileStatus) => void
  setSource: (source: string) => void
  setIsReadOnly: (value: boolean) => void
}

export const editorInitialState = {
  compileStatus: 'good' as CompileStatus,
  source: SEED_PATTERN,
  isReadOnly: false,
}

export const useEditorStore = create<EditorState>()((set) => ({
  ...editorInitialState,
  setCompileStatus: (compileStatus) => set({ compileStatus }),
  setSource: (source) => set({ source }),
  setIsReadOnly: (isReadOnly) => set({ isReadOnly }),
}))
