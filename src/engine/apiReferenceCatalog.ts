import { parseLibraryApiReference } from '@/engine/libraryDocs'
import type { LibraryRecord } from '@/engine/personalContentRecords'
import { CHEATSHEETS } from '@/pixelblaze/cheatsheets'
import { LIBRARIES } from '@/pixelblaze/libs'

export interface ApiReferenceEntry {
  signature: string
  description?: string
}

export interface ApiReferenceSection {
  title: string
  entries: ApiReferenceEntry[]
}

export interface ApiReferenceDocument {
  id: string
  name: string
  kind: 'builtin' | 'provided' | 'personal'
  summary: string
  sections: ApiReferenceSection[]
  emptyReason?: 'no-functions' | 'undocumented'
  sourceHref?: string
  editLibraryId?: string
}

const PROVIDED_SUMMARIES: Record<string, string> = {
  Anim: 'Easing, interpolation, oscillators, and timing helpers.',
  Color: 'HSV/RGB blending, palette interpolation, and color math.',
  Coord: 'Coordinate conversion, transforms, and spatial helpers.',
  Noise: 'Value noise, Voronoi distance, and organic variation.',
  SDF: 'Two-dimensional signed distance fields and shape operations.',
  Shader: 'GLSL-style math helpers and hardware-safe hashes.',
}

function builtinReference(): ApiReferenceDocument {
  return {
    id: 'PixelBlaze',
    name: 'Pixelblaze',
    kind: 'builtin',
    summary: 'Language entry points, output, time, waveforms, noise, math, and constants.',
    sections: CHEATSHEETS.PixelBlaze.sections.map((section) => ({
      title: section.header,
      entries: section.entries.map((entry) => ({
        signature: entry.sig,
        ...(entry.desc ? { description: entry.desc } : {}),
      })),
    })),
  }
}

function sourceReference(
  id: string,
  name: string,
  source: string,
  kind: 'provided' | 'personal',
  summary: string,
  extra: Pick<ApiReferenceDocument, 'sourceHref' | 'editLibraryId'> = {},
): ApiReferenceDocument {
  const reference = parseLibraryApiReference(name, source, Object.keys(LIBRARIES))
  const documented = reference.functions.filter((fn) => fn.doc.length > 0)
  const sections = documented.length > 0
    ? [{
        title: 'Functions',
        entries: documented.map((fn) => ({
          signature: `${name}.${fn.name}(${fn.params.join(', ')})`,
          description: fn.doc,
        })),
      }]
    : []

  return {
    id,
    name,
    kind,
    summary,
    sections,
    ...(sections.length === 0
      ? { emptyReason: reference.functions.length === 0 ? 'no-functions' as const : 'undocumented' as const }
      : {}),
    ...extra,
  }
}

export function buildApiReferenceCatalog(
  personalLibraries: readonly LibraryRecord[],
  includePersonal: boolean,
): ApiReferenceDocument[] {
  const provided = Object.keys(LIBRARIES).sort().map((name) => sourceReference(
    name,
    name,
    LIBRARIES[name],
    'provided',
    PROVIDED_SUMMARIES[name] ?? 'A library provided with PXLBLZ.',
    { sourceHref: `https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/blob/main/src/pixelblaze/lib/${name}.js` },
  ))

  if (!includePersonal) return [builtinReference(), ...provided]

  const personal = personalLibraries.map((library) => sourceReference(
    `personal:${library.id}`,
    library.name,
    library.src,
    'personal',
    'A library from your Studio workspace.',
    { editLibraryId: library.id },
  ))
  return [builtinReference(), ...provided, ...personal]
}
