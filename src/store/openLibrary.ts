import { useLibraryStore } from '@/store/libraryStore'

export function openStockLibrary(name: string): void {
  useLibraryStore.getState().openStockLibrary(name)
}
