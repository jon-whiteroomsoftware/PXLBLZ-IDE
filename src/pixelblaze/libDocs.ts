import {
  buildLibraryDocIndex,
  libraryDocsByFunction,
  parseLibraryApiReference,
  type LibraryFunctionDoc,
} from '@/engine/libraryDocs'
import { LIBRARIES } from './libs'

export type LibFnDoc = LibraryFunctionDoc

export function parseLibDocs(src: string): Record<string, LibFnDoc> {
  return libraryDocsByFunction(parseLibraryApiReference('Library', src))
}

export const LIB_DOCS: Record<string, Record<string, LibFnDoc>> = buildLibraryDocIndex(LIBRARIES)
