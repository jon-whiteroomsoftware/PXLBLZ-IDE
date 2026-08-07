import { useMapStore, layoutSource } from '@/store/mapStore'
import { useEditorStore } from '@/store/editorStore'
import { writeCascadedOverride } from '@/store/settingsCascade'
import {
  mapOptions,
  embeddingOptions,
  selectionForOption,
  selectedMapId,
  selectedEmbeddingId,
  selectedFamilyOptionId,
  coordinateViewOptions,
} from '@/engine/layout'
import type { ShapeId } from '@/engine/shapes'
import type { SurfaceId } from '@/engine/surfaces'
import { DeckSelect } from '@/components/DeckSelect'
import { mapCatalogueKindLabel } from '@/engine/mapCatalogue'

// The Layout controls: two orthogonal knobs over the layout's two
// code owners — a MAP control (owns `sample`) and an EMBEDDING control (owns
// `pos`, populated with shapes for 1D and surfaces for 2D). Issue #253 splits the
// two across the deck so the real-vs-viewport boundary reads structurally: the
// MAP control is real Pixelblaze state and lives in the PIXELBLAZE block of the
// preview deck (next to pixel count / fit / brightness), while the EMBEDDING
// control is a pure viewport affordance and stays in the play-button row. The two
// share the same pure `@/engine/layout` routing/filter helpers via the hook below;
// each exported component is a thin wrapper that reads state and dispatches.

// Shared layout-control state + routing for the two split controls. Reads the live
// stores, resolves the available map/embedding options through the pure engine
// helpers, and exposes a single `route` that dispatches a chosen option to its
// setter and persists it as a per-pattern cascaded override.
function useLayoutControls() {
  const nativeDim = useEditorStore((s) => s.nativeDim)
  const activeMapId = useMapStore((s) => s.activeMapId)
  const activeShapeId = useMapStore((s) => s.activeShapeId)
  const activeSurfaceId = useMapStore((s) => s.activeSurfaceId)
  const userMaps = useMapStore((s) => s.userMaps)
  const setActiveMap = useMapStore((s) => s.setActiveMap)
  const setActiveShape = useMapStore((s) => s.setActiveShape)
  const setActiveSurface = useMapStore((s) => s.setActiveSurface)

  const source = layoutSource({ userMaps })
  const maps = mapOptions(nativeDim, source)
  const sel = { mapId: activeMapId, shapeId: activeShapeId, surfaceId: activeSurfaceId }
  const selectedMap = selectedMapId(sel, nativeDim)
  const familyOptionId = selectedFamilyOptionId(selectedMap, source)
  const mapValue = maps.some((option) => option.id === familyOptionId) ? familyOptionId : maps[0]?.id
  const selectedMapOption = source.maps.find((option) => option.id === selectedMap)
  const mapDim = selectedMapOption?.dim ?? nativeDim
  const activeMap = selectedMapOption
  const embeddings = embeddingOptions(mapDim, source, activeMap)
  const embeddingValue = selectedEmbeddingId(sel, mapDim)
  const coordinateViews = coordinateViewOptions(selectedMap, source)

  // Route a chosen option to its live setter AND write a per-pattern cascaded
  // override: a map/shape/surface change is genuine manipulation, so it
  // persists on the active pattern (no-op for a read-only demo).
  function route(id: string, options: ReturnType<typeof mapOptions>) {
    const opt = options.find((o) => o.id === id)
    if (!opt) return
    const next = selectionForOption(opt)
    if (next.mapId) {
      setActiveMap(next.mapId)
      writeCascadedOverride('mapId', next.mapId)
    }
    if (next.shapeId) {
      setActiveShape(next.shapeId as ShapeId)
      writeCascadedOverride('shapeId', next.shapeId)
    }
    if (next.surfaceId) {
      setActiveSurface(next.surfaceId as SurfaceId)
      writeCascadedOverride('surfaceId', next.surfaceId)
    }
  }

  return { nativeDim, mapDim, maps, embeddings, mapValue, embeddingValue, coordinateViews, activeMapId, route }
}

function mapSelectMeta(
  mapDim: 1 | 2 | 3,
  maps: ReturnType<typeof mapOptions>,
) {
  const hasMapChoice = maps.length > 1
  return {
    hasMapChoice,
    // Contain and Fill are identical with one coordinate axis, so Fit remains
    // absent for 1D even while a true map is selected.
    hasMappedCoordinates: hasMapChoice && mapDim !== 1,
  }
}

export function useMapSelectMeta() {
  const { mapDim, maps } = useLayoutControls()
  return { ...mapSelectMeta(mapDim, maps), mapDim }
}

export function useEmbeddingSelectMeta() {
  const { mapDim, embeddings } = useLayoutControls()
  return {
    hasEmbeddingChoice: embeddings.length > 1,
    label: mapDim === 1 ? 'shape' : 'display',
  }
}

// The MAP control (#253): real Pixelblaze state, rendered bare so the PIXELBLAZE
// block can wrap it in a labeled deck cell paired with `fit`. Renders nothing only
// when Index is literally the sole available option.
export function MapSelect({ portaled = false }: { portaled?: boolean } = {}) {
  const { mapDim, maps, mapValue, route } = useLayoutControls()
  if (!mapSelectMeta(mapDim, maps).hasMapChoice) return null
  // The trigger stays aligned with `fit`; its menu opens rightward at two trigger
  // widths so recommendation and dimensionality are separate scanning axes.
  return (
    <div className="self-end w-full max-w-[11rem]">
      <DeckSelect
        ariaLabel="Map"
        value={mapValue ?? maps[0].id}
        options={maps.map((o) => ({
          value: o.id,
          label: o.name,
          badge: o.mapDim ? `${o.mapDim}D` : undefined,
          column: o.group === 'recommended' ? 'Recommended' : 'Other dimensions',
          group: o.catalogueKind ? mapCatalogueKindLabel(o.catalogueKind) : undefined,
        }))}
        onChange={(id) => route(id, maps)}
        menuWidthClass="w-[22rem] max-w-[calc(100vw-2rem)]"
        menuAlign="left"
        menuSide="responsive"
        block
        portaled={portaled}
      />
    </div>
  )
}

export function CoordinateViewSelect({ portaled = false }: { portaled?: boolean } = {}) {
  const { coordinateViews, activeMapId, route } = useLayoutControls()
  if (coordinateViews.length < 2) return null
  return (
    <div className="mt-1 flex items-center justify-end gap-1.5">
      <span className="text-[10px] lowercase tracking-wide text-structural">view</span>
      <DeckSelect
        ariaLabel="Coordinate view"
        value={activeMapId}
        options={coordinateViews.map((option) => ({
          value: option.mapId,
          label: option.label,
          badge: `${option.dim}D`,
        }))}
        onChange={(id) => route(id, coordinateViews.map((option) => ({
          kind: 'map' as const,
          id: option.mapId,
          name: option.label,
          displayDim: 3 as const,
          mapDim: option.dim,
        })))}
        menuWidthClass="w-28"
        portaled={portaled}
      />
    </div>
  )
}

// The EMBEDDING control (#253): a pure viewport affordance — shapes for 1D, surfaces
// for 2D — that stays in the play-button row. Shows only when it carries a real
// choice: a single option (an irregular cloud's Flat-only set, or 3D with none) is
// not a choice, so it is hidden ("show only when needed").
export function EmbeddingSelect({
  showLabel = false,
  portaled = false,
}: { showLabel?: boolean; portaled?: boolean } = {}) {
  const { mapDim, embeddings, embeddingValue, route } = useLayoutControls()
  const showEmbedding = embeddings.length > 1
  if (!showEmbedding) return null
  const label = mapDim === 1 ? 'shape' : 'display'
  const ariaLabel = mapDim === 1 ? 'Shape' : 'Display'
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {showLabel && (
        <span className="text-xs lowercase tracking-wide text-structural">
          {label}
        </span>
      )}
      <DeckSelect
        ariaLabel={ariaLabel}
        value={embeddingValue ?? embeddings[0].id}
        options={embeddings.map((o) => ({
          value: o.id,
          label: mapDim === 2 && o.id === 'cylinder' ? 'Cylinder wrap' : o.name,
        }))}
        onChange={(id) => route(id, embeddings)}
        menuWidthClass="w-28"
        portaled={portaled}
      />
    </div>
  )
}
