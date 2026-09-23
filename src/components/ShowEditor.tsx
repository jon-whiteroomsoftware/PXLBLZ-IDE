import { showDeliveryInvalidationMessage } from '@/engine/showControllerDelivery'
import { useShowControllerDelivery } from './useShowControllerDelivery'
import { editShowMarkerFromUI } from '../engine/showExactTimelineMarker'
import { repeatScaleAt, showV2SampleRepeatLaneVisible } from '../engine/showV2ScalarProperties'
import { Fragment, createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject, type SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import { Activity, BookOpen, ChevronDown, ChevronRight, Clock3, Code2, Copy, CopyPlus, Download, Eye, Flag, FlipHorizontal2, Grid2X2, Layers3, Lightbulb, Lock, Magnet, Map as MapIcon, Maximize2, Move, PanelLeft, Pause, Play, Plus, Redo2, Repeat2, RotateCcw, RotateCw, Route, Scaling, Scissors, Settings2, SkipBack, SlidersHorizontal, Square, SquareDashed, Sun, Trash2, Undo2, WandSparkles, X, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ActionsMenu, type ActionsMenuItem } from '@/components/ActionsMenu'
import { controlIcon } from '@/components/iconScale'
import { DisabledReasonTip } from '@/components/ui/disabled-reason'
import { NumberField as UiNumberField, type NumberFieldProps as UiNumberFieldProps } from '@/components/ui/number-field'
import { DraftTextField } from '@/components/ui/draft-text-field'
import { TimeField as UiTimeField, type TimeFieldProps as UiTimeFieldProps } from '@/components/ui/time-field'
import { PercentageField as UiPercentageField, type PercentageFieldProps as UiPercentageFieldProps } from '@/components/ui/percentage-field'
import { DomainNumberField as UiDomainNumberField, type DomainNumberFieldProps as UiDomainNumberFieldProps } from '@/components/ui/domain-number-field'
import { BoundedNumberField } from '@/components/ui/bounded-number-field'
import { formatDomainNumber } from '@/engine/domainNumberPresentation'
import { measureShowTimelineMinimumHeight } from '@/engine/showWorkspaceLayout'
import { resolveLinearNumberPresentation } from '@/engine/linearNumberPresentation'
import { formatPercentageValue } from '@/engine/percentageValue'
import { formatShowTime, showBoundaryClipIdentity } from '@/engine/showClipIdentity'
import { presentShowDiagnostic, presentShowTrayDiagnostic } from '@/engine/showDiagnosticPresentation'
import { SHOW_ESCAPE_LAYER_RANK, registerShowEscapeLayer } from '@/engine/showEscapeLayers'
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogRoot,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PixelblazeCodeEditor } from '@/components/PixelblazeCodeEditor'
import { ShowZoneSpatialSelector } from '@/components/ShowZoneSpatialSelector'
import { ShowEntityDetailPanel } from '@/components/ShowEntityDetailPanel'
import { ShowPropertySparkline } from '@/components/ShowPropertySparkline'
import { describePropertyLaneHover, resolvePropertyLaneDisplayLabels } from '@/engine/showPropertyLaneLabels'
import { propertyLaneFamilyColor, type ShowPropertyLaneFamily, type ShowPropertyLaneGlyph, propertyLanePresentation } from '@/engine/showPropertyLaneFamilies'
import { ShowPropertyLaneFamilyGlyph } from '@/components/ShowPropertyLaneFamilyGlyph'
import { ShowClipEntityDetail, type ShowClipEntityDetailHandle } from '@/components/ShowClipEntityDetail'
import { formatAngleValue } from '@/engine/anglePresentation'
import { ShowPropertyAnimationProvider } from '@/components/ShowPropertyAnimationEditor'
import { ShowPatternInstanceControls } from '@/components/ShowPatternInstanceControls'
import { ShowTransitionPalette, ShowTransitionParameters } from '@/components/ShowTransitionAuthoring'
import { ShowLayerTransitionPalette } from '@/components/ShowLayerTransitionPalette'
import { ShowLayerTransitionEditor } from '@/components/ShowLayerTransitionEditor'
import { ShowTransitionXrayPictogram } from '@/components/ShowTransitionXrayPictogram'
import { ShowArtifactInventoryPopover, ShowArtifactInventoryBody } from '@/components/ShowArtifactInventoryPopover'
import { ShowTimelineNavigator } from '@/components/ShowTimelineNavigator'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import { makeProgramId } from '@/engine/bytecodePush'
import { PatternCombobox, type PatternComboboxOption } from '@/components/PatternCombobox'
import { ShowLossConfirmDialog } from '@/components/ShowLossConfirmDialog'
import { describeConnectedClipMoveLoss, describeControlTargetRemovalLoss, describePatternReplacementCost, describePatternReplacementLoss } from '@/engine/showLossConfirmationText'
import { InlineEntityTitle } from '@/components/InlineEntityTitle'
import { showRecordClipCount } from '@/engine/showClipInvariant'
import { isAlreadyPushed, type SendMode } from '@/engine/sendToController'
import { useControllerPanelStore } from '@/store/controllerPanelStore'
import { prepareShowControllerArtifact } from '@/engine/showControllerArtifact'
import {
  controllerProfileArtifactSignature,
  findProfileForLiveController,
} from '@/engine/controllerProfilePassRecipe'
import { prepareControllerArtifactDelivery } from '@/engine/controllerArtifactDelivery'
import { assessShowCompilePressure } from '@/engine/showCompilePressure'
import { trackEvent } from '@/analytics'
import {
  addShowRoutingLayout,
  projectShowStrip,
  formatShowRoutingRanges,
  parseShowRoutingRanges,
  showLoopDurationMs,
  projectShowTimeline,
  showRoutingTransitionAfter,
  showVisualTransitionAfter,
  transitionCost,
  updateShowBoundaryTransition,
  ZONE_COLORS,
  showRoutingLayoutKindLabel,
} from '@/engine/showModel'
import {
  compileShowForArtifact,
  resolveShowCompilationControllerZones,
  sourceForShowCell,
  sourceForShowPatternRef,
  type CompiledShowState,
} from '@/engine/showPreviewArtifact'
import {
  projectFlatShowToCompositionV1WithCellOrigins,
} from '@/engine/showCompositionModel'
import {
  projectGlobalShowPropertyLane,
  projectGlobalShowScenePropertyLanes,
  type ShowPropertyLaneProjection,
} from '@/engine/showPropertyLaneProjection'
import { installationCoverageBlockingMessage, resolveShowZonePixelCount, validateInstallationCoverage } from '@/engine/showInstallationCoverage'
import { validateInstallationCoverageV2 } from '@/engine/showInstallationCoverageV2'
import { updateShowPhysicalZoneSelection } from '@/engine/showSpatialSelection'
import { createPortableShowOutputContract } from '@/engine/showOutputContract'
import { declaredPatternSliderNames, bundledPatternSliderNames, resolveBundledPatternSliderNames, discoverAutomatablePatternControls, type AutomatablePatternControl } from '@/engine/showPatternControls'
import {
  projectCompositionShowClipSummary,
  projectGlobalShowClipSummary,
  projectResolvedShowClipSummary,
  projectShowClipTimelineSummary,
  showClipSummaryDestination,
  showClipInlineSummary,
  type ShowClipSummaryDestination,
  type ShowClipSummaryItem,
  type ShowClipSummaryKind,
  type ShowClipSummarySection,
  type ShowClipTimelineGlyph,
} from '@/engine/showClipSummary'
import { DEMOS, resolveStockPatternId } from '@/pixelblaze/stock/patterns'
import {
  projectShowClipInspector,
  updateShowClipInspector,
  type ShowClipInspectorOwner,
  type ShowClipInspectorPatch,
} from '@/engine/showClipInspectorModel'
import {
  addShowPropertyKeyframe,
  addShowPropertyTrack,
  deleteShowPropertyKeyframe,
  deleteShowPropertyTrack,
  updateShowPropertyKeyframe,
} from '@/engine/showPropertyAnimation'
import {
  applyShowGroupPropertyAnimationChange,
  buildShowPropertyAnimationOptions,
  projectShowPropertyAnimationEditorContext,
  type ShowPropertyAnimationChange,
  type ShowPropertyAnimationEditorContext,
  type ShowPropertyAnimationStorageOwner,
} from '@/engine/showPropertyAnimationEditorModel'
import {
  beginFineAdjust,
  moveFineAdjust,
  type FineAdjustDrag,
} from '@/engine/fineAdjust'
import {
  fitShowTimelineViewport,
  panShowTimelineViewport,
  resolveShowTimelineClipDragPlacement,
  showTimelineQuantizeStepMs,
  showTimelineRulerTicks,
  snapShowTimelineTime,
  zoomShowTimelineViewport,
  type ShowTimelineViewport,
} from '@/engine/showTimelineViewport'
import {
  fromShowTimelineProjection,
  type ShowTimelineItemView,
  type ShowTimelineLayoutIntervalView,
  type ShowTimelineLayerView,
  type ShowTimelineMarkerView,
  type ShowTimelineViewModel,
} from '@/engine/showTimelineViewModel'
import {
  projectShowUnifiedTimeline,
  type ShowUnifiedTimelineClipProjection,
  type ShowUnifiedTimelineJunctionProjection,
} from '@/engine/showUnifiedTimelineProjection'
import {
  nextShowTimelineTraversalTarget,
  projectShowTimelineTraversalTargets,
  projectShowTimelineViewTraversalTargets,
  showTimelineTraversalTargetKey,
  type ShowTimelineTraversalTarget,
} from '@/engine/showTimelineKeyboard'
import { claimStudioPreviewSpace } from '@/engine/keyboardShortcuts'
import {
  addShowClipAtGlobalTimeExtendingShow,
  addShowOverlayLayerAcrossTimeline,
  duplicateShowClipAfter,
  duplicateShowClipAtGlobalTime,
  makeShowClipPatternIndependent,
  planShowClipAtGlobalTime,
  planShowClipAtTopmostAvailableLayer,
  planShowClipDuplicateAfter,
  planShowClipSplitAtGlobalTime,
  projectShowClipPatternInstanceOwnership,
  rejoinShowClipPatternInstance,
  splitShowClipAtGlobalTime,
  type ShowTimelineClipMoveTarget,
  type ShowTimelineClipOwner,
  type ShowClipAddTarget,
} from '@/engine/showTimelineClipAuthoring'
import {
  createShowV2AddClipIntent,
  planShowV2ClipAtTime,
  planShowV2ClipAtTopmostAvailableLayer,
} from '@/engine/showV2ClipAddPlacement'
import {
  insertShowLayerTransition,
  moveShowConnectedClipAtGlobalTime,
  moveShowConnectedClipInShowAtGlobalTime,
  planShowGroupLayerTransitionInsertion,
  planShowLayerTransitionInsertion,
  planShowLayerTransitionInsertionForClip,
  resizeShowLayerTransition,
  resetShowLayerTransitionToCut,
  showLayerTransitionsConnectedToClip,
} from '@/engine/showLayerTransitionAuthoring'
import { deleteShowClipInShow, type ShowClipDeletionResult } from '@/engine/showClipDeletion'
import {
  completeShowGroupSelection,
  createShowGroupFromSelection,
  deleteShowGroupOccurrence,
  duplicateShowGroupOccurrence,
  insertShowGroupLayerTransition,
  makeShowGroupOccurrenceUnique,
  projectShowGroupRuntimePatternInstances,
  resizeShowGroupLayerTransition,
  translateShowGroupOccurrence,
  ungroupShowGroupOccurrence,
  updateShowGroupOccurrencePlacement,
  validateShowGroups,
  validateShowGroupSelection,
  type ShowGroupSelection,
} from '@/engine/showGroupModel'
import {
  projectShowGroupClipInspector,
  updateShowGroupClipInspector,
  type ShowGroupClipOwner,
} from '@/engine/showGroupClipInspectorModel'
import {
  insertShowTime,
  planShowTimeInsertion,
  setShowEndMs,
  showTimelineContentEndMs,
} from '@/engine/showTimelineAuthoring'
import { buildShowEpeExport, type ShowEpeExport, type ShowEpeExportOptions } from '@/engine/showEpeExport'
import { buildShowFileBundle, serializeShowFileBundle } from '@/engine/showFileBundle'
import {
  buildDeliveredShowSourceInventory,
  buildShowArtifactInventoryModel,
  deliveredShowSourceBytes,
  describeShowArtifactPatterns,
  describeShowArtifactPatternUses,
  type DeliveredShowSourceInventory,
  type ShowArtifactInventoryModel,
} from '@/engine/showSourceInventory'
import { buildPreviewJpeg } from '@/engine/previewThumbnailJpeg'
import { bytesToBase64 } from '@/engine/RelayWebSocket'
import { steppedClockRateHz, steppedClockStepMs } from '@/engine/steppedClock'
import { showKeyboardSeekStepMs } from '@/engine/showKeyboardSeek'
import { SHOW_EASING_OPTIONS, showEasingFromOptionId, showEasingOptionId } from '@/engine/showEasing'
import {
  applyShowPatternSlotSelections,
  restoreShowReferencePatternSlots,
  showPatternSlotRemovedControlNames,
  type ShowPatternSlotGroup,
  type ShowReferenceGuide,
} from '@/engine/showReferenceShow'
import {
  applyShowPatternSlotSelectionsV2,
  showPatternSlotRemovedControlNamesV2,
} from '@/engine/showReferenceShowV2'
import {
  showLessonAuthoredSlotPatternV1,
  showLessonAuthoredSlotPatternV2,
  showLessonNarrationV1,
  showLessonNarrationV2,
  type ShowLessonNarration,
} from '@/engine/showLessonNarration'
import { exportedDims } from '@/engine/exportedDims'
import { planShowV2BoundaryPaletteApply, planShowV2BoundaryTransitionChanges, planShowV2TransitionEdit, planShowV2TransitionReset, showV2TransitionJunctionKey } from '@/engine/showV2TransitionEditorModel'
import { planShowV2GroupLayerTransitionInsertion, planShowV2LayerTransitionInsertion, planShowV2LayerTransitionInsertionForClip } from '@/engine/showV2LayerTransitionInsertion'
import { editShowTransitionV2 } from '@/engine/showTransitionsV2'
import {
  replaceShowBoundaryTransition,
  showBoundaryTransitionParameterChanges,
  showBoundaryTransitionPresentationKey,
  showTransitionChangesForPresentation,
  type ShowTransitionChanges,
  type ShowTransitionSettingsCarrier,
} from '@/engine/showTransitionAuthoring'
import { buildShowToolkitPresentationCatalogue, type ShowToolkitPresentationItem } from '@/engine/showVisualToolkitPresentation'
import { type ControllerProfile } from '@/engine/controllerProfile'
import { STOCK_PATTERNS } from '@/engine/galleryCatalog'
import { LIBRARIES } from '@/pixelblaze/libs'
import { compileLibraries } from '@/engine/libraries'
import {
  useControllerStore,
  type GeneratedArtifactControllerSession,
} from '@/store/controllerStore'
import { useControllerProfileStore } from '@/store/controllerProfileStore'
import { resolveMap, STOCK_MAPS, useMapStore } from '@/store/mapStore'
import { applyNormalizeMode } from '@/engine/maps'
import { buildShowControllerCompatibilityContext } from '@/engine/showControllerCompatibilityContext'
import { downloadBrowserFile } from '@/engine/browserDownload'
import { usePreviewStore } from '@/store/previewStore'
import {
  canAdvanceShowPlayback,
  resolveShowPlaybackStep,
  useShowTransportStore,
} from '@/store/showTransportStore'
import { usePatternStore } from '@/store/patternStore'
import { useLibraryStore } from '@/store/libraryStore'
import { useShowStore } from '@/store/showStore'
import {
  admitShowV2PilotAppearanceEdit,
  admitShowV2PilotClipDelete,
  admitShowV2PilotCreateGroup,
  admitShowV2PilotGroupOccurrenceEdit,
  admitShowV2PilotTransitionEdit,
  admitShowV2PilotClipEntryPolicy,
  admitShowV2PilotClipReplacementEdit,
  admitShowV2PilotGroupReplacementEdit,
  admitShowV2PilotClipSharingEdit,
  admitShowV2PilotClipTemporal,
  admitShowV2PilotCreateClip,
  admitShowV2PilotInsertTime,
  admitShowV2PilotInstanceProperties,
  admitShowV2PilotLayerEdit,
  admitShowV2PilotPropertyEdit,
  admitShowV2PilotSetShowEnd,
  admitShowV2PilotShowMetadata,
  admitShowV2PilotTransitionResize,
  admitShowV2PilotZoneEdit,
  admitShowV2PilotLayoutDefinitionEdit,
  admitShowV2PilotLayoutOccurrenceEdit,
  admitShowV2PilotMarkerEdit,
  type ShowV2PilotClipDeleteIntent,
  type ShowV2PilotClipSharingIntent,
  type ShowV2PilotGroupOccurrenceEditIntent,
  type ShowV2PilotTransitionEditIntent,
  type ShowV2PilotClipEntryPolicyIntent,
  type ShowV2PilotPreparedCapture,
  type ShowV2PilotSetShowEndRequest,
  type ShowV2PilotShowMetadataRequest,
  type ShowV2PilotTransitionResizeIntent,
  type ShowV2PilotLayoutOccurrenceIntent,
} from '@/store/showV2PreparedEditAdmission'
import {
  createShowV2ClipReplacementIntent,
  previewShowV2ClipReplacement,
  resolveCapturedShowPatternReplacementV2,
  type ShowV2ClipReplacementIntent,
  type ShowV2LostControl,
} from '@/engine/showV2ClipReplacementModel'
import {
  planShowV2GroupReplacementEdit,
  previewShowV2GroupReplacement,
  type ShowV2GroupReplacementIntent,
} from '@/engine/showV2GroupReplacementEditorModel'
import { editShowClipTemporalV2, type ShowClipTemporalIntentV2 } from '@/engine/showClipTemporalV2'
import { insertShowTimeV2, type ShowInsertTimeIntentV2 } from '@/engine/showTimelineV2'
import type { ShowMarkerEditIntentV2 } from '@/engine/showMarkersV2'
import type { ShowLayerEditIntentV2 } from '@/engine/showLayersV2'
import { checkShowTimelineDuplicateGestureV2, planShowTimelineGestureV2, type ShowTimelineGestureV2 } from '@/engine/showTimelineGesturesV2'
import {
  createShowV2IndependentIntent,
  createShowV2RejoinIntent,
} from '@/engine/showV2ClipSharingEditorModel'
import type { CreateShowGroupFromSelectionIntentV2 } from '@/engine/showGroupCreationV2'
import { planShowV2GroupCreation } from '@/engine/showV2GroupCreationEditorModel'
import { planShowV2GroupOccurrenceEdit, type ShowV2GroupOccurrenceRequest } from '@/engine/showV2GroupOccurrenceEditorModel'
import {
  planShowV2ClipMove,
  planShowV2ClipResize,
  planShowV2ClipSplit,
  resolveShowV2SplitTarget,
  type ShowV2ClipTemporalPlan,
} from '@/engine/showV2ClipTemporalPlanning'
import {
  planShowV2ClipDelete,
  showV2ConnectedTransitionIds,
} from '@/engine/showV2ClipDeletePlanning'
import {
  planShowV2ClipInspectorPatch,
  type ShowV2ClipInspectorInstanceIntent,
} from '@/engine/showV2ClipAppearancePlanning'
import {
  planShowV2PortableReferenceEdit,
  planShowV2SetShowEnd,
  planShowV2TrailsEdit,
  type ShowV2ShowMetadataPlan,
} from '@/engine/showV2ShowLevelPlanning'
import {
  planShowV2LayoutDuplicate,
  planShowV2LayoutRemove,
  planShowV2LayoutUpdate,
  planShowV2PhysicalZoneSelection,
  planShowV2ZoneAdd,
  planShowV2ZoneRemove,
  planShowV2ZoneUpdate,
  type ShowV2ZonePlan,
} from '@/engine/showV2ZonePlanning'
import {
  planShowV2GroupPropertyAnimationChange,
  planShowV2PropertyAnimationChange,
  type ShowV2PropertyAnimationFrame,
} from '@/engine/showV2PropertyAnimationPlanning'
import type {
  ShowPropertyEditIntentV2,
  ShowPropertyTrackOwnerV2,
} from '@/engine/showPropertyEditsV2'
import {
  planShowV2LayoutEdit,
  showV2MakeUniqueLayoutName,
} from '@/engine/showV2LayoutEditorModel'
import type { ShowClipAppearanceEditIntentV2 } from '@/engine/showClipAppearanceEditsV2'
import type { ShowZoneEditIntentV2 } from '@/engine/showZonesV2'
import type { ShowZoneLayoutDefinitionIntentV2 } from '@/engine/showZoneLayoutDefinitionsV2'
import { useRouterStore } from '@/store/routerStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { useShowPreviewOverrideStore } from '@/store/showPreviewOverrideStore'
import { useShowClipHoverStore } from '@/store/showClipHoverStore'
import { useShowEditorViewStore, type ShowSelection } from '@/store/showEditorViewStore'
import { useShowEditorSessionStore } from '@/store/showEditorSessionStore'
import { docExternalHref } from '@/docs/catalog'
import { stockShowById, type StockShowNote } from '@/pixelblaze/stock/shows'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import type {
  MapRecord,
  ShowBoundaryTransition,
  ShowCell,
  ShowClipTransform,
  ShowCompositionV1,
  ShowLayerTransition,
  ShowRecord,
  ShowPatternRef,
  ShowRoutingDirection,
  ShowRoutingLayout,
  ShowTransitionEasing,
  ShowTransitionKind,
  ShowAutomatableProperty,
} from '@/engine/personalContentRecords'
import { normalizeShowOutputEffects } from '@/engine/showPreviousRgbFeedback'
import { setShowOutputTrails, type SetShowOutputTrailsInput } from '@/engine/showOutputEffectAuthoring'
import { normalizeShowClipTransform } from '@/engine/showClipTransform'
import { validateShowLogicalRouting, type ShowLogicalRouting } from '@/engine/showLogicalRouting'
import {
  appendShowLayoutInterval,
  duplicateShowLayoutInterval,
  insertShowLayoutInterval,
  makeShowLayoutIntervalUnique,
  projectShowLayoutIntervals,
  showLayoutIntervalAtTime,
  showLayoutIntervalPercentBounds,
  showLayoutZoneIdAtTime,
} from '@/engine/showLayoutIntervals'
import { showLayoutZoneIdAtTimeV2 } from '@/engine/showLayoutIntervalsV2'
import { SaveFailureNotice } from '@/components/SaveFailureNotice'
import { createAgentEditorAdmission as createDiagnosticAgentAdmission } from '@/dev/agentEditorAdmission'
import { installDiagnosticAgentSession } from '@/dev/installDiagnosticAgentSession'
import { useAgentDrawerStore } from '@/agent/drawerStore'
import { useAgentEditorLifecycle } from '@/agent/editorLifecycle'
import type { AgentEditorRecordBinding } from '@/agent/editorAdmission'
import { createAgentBrowserSession } from '@/agent/browserSession'
import ShowSourceOutletContext from '@/components/ShowSourceOutlet'
import { ShowStripSection } from '@/components/ShowStripSection'
import { useAnchoredOverlayPosition } from '@/components/useAnchoredOverlayPosition'
import { previewShowClipResize, resizeShowClipManually } from '@/engine/showManualClipResize'
import { FieldActivityContext, createFieldActivityScope, useFieldActivity } from './ui/field-activity'
import { captureShowStageEditV2, showV2ClipRestartAvailabilityV2, type ShowPreparedStageEditCaptureV2 } from '@/engine/showPreparedStageV2'
import { buildShowEpeExportV2 } from '@/engine/showEpeExportV2'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { defaultGroupRuntimeIdV2, groupOccurrenceDuration, materializeShowGroupsV2 } from '@/engine/showGroupsV2'
import { resolveShowV2StageMap } from '@/store/showV2StageMap'
import {
  completeShowGroupSelectionV2,
  projectShowEditorPropertyLanesV2,
  projectShowEditorTimeColumnsV2,
  projectShowEditorTimelineCommandsV2,
  projectShowEditorTimelineV2,
  projectShowEditorTransitionSettingsV2,
  type ShowEditorPropertyLaneV2,
  type ShowEditorTimeColumnV2,
} from '@/engine/showEditorTimelinePresentation'
import {
  projectShowEditorArtifactPatternUsesV2,
  projectShowEditorBoundaryTransitionsV2,
  projectShowEditorClipInstanceOwnershipV2,
  projectShowEditorInspectorPresentationV2,
  projectShowEditorRoutingTransfersV2,
  projectShowEditorTimelineClipSummarySourcesV2,
  projectShowEditorZoneMapV2,
  showEditorClipSummaryFactsV2,
  type ShowBoundaryTransitionDestinationValue,
  type ShowBoundaryTransitionInspectorValue,
  type ShowEditorClipValueV2,
  type ShowEditorTimelineClipSummarySourceV2,
  type ShowEditorZoneMapEntryV2,
} from '@/engine/showEditorInspectorPresentation'

/** The Zone Map's reads, supplied by whichever record backs the editor. */
interface ShowEditorZoneMapV2 {
  installation: boolean
  entries: readonly ShowEditorZoneMapEntryV2[]
}

const field =
  'h-7 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-200 outline-none focus:border-live/70'
const compactField =
  'h-6 rounded border border-zinc-700 bg-zinc-950 px-1.5 text-[9.5px] text-zinc-200 outline-none focus:border-live/70'
const transitionRuleUnderField =
  'h-7 border-0 border-b border-zinc-700 bg-transparent px-1 text-xs text-zinc-200 outline-none focus:border-live/70'
const EMPTY_ZONE_IDS: string[] = []
const JUMPS_PER_SECOND_PRESENTATION = resolveLinearNumberPresentation({
  kindLabel: 'rate',
  suffix: '/s',
  min: 0.25,
  max: 30,
  step: 0.25,
  sliderMin: 0.25,
  sliderMax: 30,
  sliderStep: 0.25,
  detentStep: 1,
  detentMagnet: 0.12,
  labelStep: 5,
})
const clipBase =
  'show-timeline-clip z-10 flex flex-col justify-center gap-px overflow-hidden rounded-none border-0 border-l-2 px-2 py-0.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-live'

function showTimelineToolbarControlClass(input: {
  enabled: boolean
  active?: boolean
}): string {
  if (!input.enabled) {
    return 'bg-transparent hover:bg-transparent cursor-not-allowed text-zinc-700 opacity-100 hover:text-zinc-700 disabled:pointer-events-auto disabled:opacity-100'
  }
  if (input.active) {
    return 'bg-amber-400/10 text-amber-300 hover:bg-amber-400/15 hover:text-amber-200 active:bg-amber-400/20 active:text-amber-100 aria-expanded:bg-amber-400/10 aria-expanded:text-amber-300'
  }
  return 'bg-transparent text-zinc-400 hover:bg-amber-400/10 hover:text-amber-200 active:bg-amber-400/20 active:text-amber-100 aria-expanded:bg-amber-400/10 aria-expanded:text-amber-300'
}

function ShowEasingOptions() {
  return SHOW_EASING_OPTIONS.map((option) => (
    <option key={option.id} value={option.id}>{option.label}</option>
  ))
}

/**
 * Zone rail widths for the timeline's sticky first column. The open rail holds a
 * disclosure control, the Zone name with its nominal pixel count, and a
 * properties control; the micro rail holds only the Zone glyph picker.
 */

const ZONE_RAIL_OPEN_PX = 108
const ZONE_RAIL_MICRO_PX = 32


type BlockedDeleteFeedback = {
  selectionKey: string
  token: number
  label: string
  status: string
}

type BlockedDeleteCopy = Pick<BlockedDeleteFeedback, 'label' | 'status'>
type ShowClipDeletionRefusal = Extract<ShowClipDeletionResult, { status: 'refused' }>

const LAST_CLIP_DELETE_FEEDBACK: BlockedDeleteCopy = {
  label: 'Keep one Clip',
  status: 'A Show must contain at least one Clip.',
}

const UNAVAILABLE_CLIP_DELETE_FEEDBACK: BlockedDeleteCopy = {
  label: 'Cannot delete this Clip.',
  status: 'Cannot delete this Clip.',
}

function blockedDeleteCopyForRefusal(
  show: ShowRecord,
  refusal: ShowClipDeletionRefusal,
): BlockedDeleteCopy {
  if (refusal.reason === 'cross-boundary-shared-instance') {
    return {
      label: 'Cannot delete: shared animation state',
      status: 'Cannot delete: shared animation state',
    }
  }
  const blockedIds = new Set(refusal.details ?? [])
  const trailsIsBlocking = refusal.reason === 'output-feedback-state'
    && show.outputEffects?.some((effect) => (
      effect.kind === 'trails' && (blockedIds.size === 0 || blockedIds.has(effect.id))
    ))
  if (trailsIsBlocking) {
    return {
      label: 'Cannot delete while Trails is enabled.',
      status: 'Cannot delete while Trails is enabled.',
    }
  }
  return {
    label: 'Cannot delete this Clip.',
    status: 'Cannot delete this Clip.',
  }
}

function blockedDeleteSelectionKey(
  composition: ShowCompositionV1,
  owner: ShowTimelineClipOwner,
): string {
  for (const scene of composition.scenes) {
    for (const zone of scene.zones) {
      const direct = [
        ...zone.main,
        ...zone.overlays.flatMap((layer) => layer.placements),
      ].find((placement) => placement.id === owner.placementId)
      if (direct) return `clip:${direct.logicalClipId ?? direct.id}`
    }
  }
  return `clip:${owner.placementId}`
}

function showSelectionKey(selection: ShowSelection): string {
  if (selection.kind === 'clip') return `clip:${selection.clipId}`
  if (selection.kind === 'transition') return `transition:${selection.transitionId}`
  if (selection.kind === 'zone') return `zone:${selection.zoneId}`
  if (selection.kind === 'zone-layout') {
    // Linked duplicates share a layoutId; the interval keeps two occurrences
    // from reading as the same selection (#795 review P2).
    return selection.intervalId
      ? `zone-layout:${selection.layoutId}:${selection.intervalId}`
      : `zone-layout:${selection.layoutId}`
  }
  if (selection.kind === 'group') return `group:${selection.occurrenceId}`
  if (selection.kind === 'group-clip') return `group-clip:${selection.occurrenceId}:${selection.placementId}`
  if (selection.kind === 'multi') return 'multi'
  return 'show'
}

function sameShowSelection(left: ShowSelection, right: ShowSelection): boolean {
  return showSelectionKey(left) === showSelectionKey(right)
}

function showGroupOccurrenceExists(
  show: ShowRecord,
  composition: ShowCompositionV1 | null | undefined,
  occurrenceId: string,
): boolean {
  const occurrence = composition?.groupOccurrences?.find((candidate) => candidate.id === occurrenceId)
  if (!occurrence) return false
  return show.scenes.some((scene) => scene.id === occurrence.sceneId)
    && show.zones.some((zone) => zone.id === occurrence.zoneId)
    && Boolean(composition?.scenes.some((scene) => (
      scene.sceneId === occurrence.sceneId
      && scene.zones.some((zone) => zone.zoneId === occurrence.zoneId)
    )))
}

function showSelectionExists(
  show: ShowRecord,
  composition: ShowCompositionV1 | null | undefined,
  selection: ShowSelection,
): boolean {
  if (selection.kind === 'show') return true
  if (selection.kind === 'clip') {
    return show.cells.some((cell) => cell.id === selection.clipId)
      || Boolean(findTimelineClipOwner(composition, selection.clipId))
  }
  if (selection.kind === 'transition') {
    return show.transitions.some((transition) => transition.id === selection.transitionId)
  }
  if (selection.kind === 'zone') return show.zones.some((zone) => zone.id === selection.zoneId)
  if (selection.kind === 'zone-layout') {
    return show.routingLayouts.some((layout) => layout.id === selection.layoutId)
  }
  if (selection.kind === 'group') {
    return showGroupOccurrenceExists(show, composition, selection.occurrenceId)
  }
  if (selection.kind === 'group-clip') {
    if (!showGroupOccurrenceExists(show, composition, selection.occurrenceId)) return false
    const occurrence = composition?.groupOccurrences?.find((candidate) => candidate.id === selection.occurrenceId)
    const definition = composition?.groupDefinitions?.find((candidate) => candidate.id === occurrence?.definitionId)
    return Boolean(definition?.placements.some((placement) => placement.id === selection.placementId))
  }
  return selection.groupSelection.placementIds.every((placementId) => (
    Boolean(findTimelineClipOwner(composition, placementId))
  ))
}

function showSelectionTraversalTarget(selection: ShowSelection): ShowTimelineTraversalTarget | null {
  if (selection.kind === 'clip') return { kind: 'clip', clipId: selection.clipId }
  if (selection.kind === 'group') return { kind: 'group', occurrenceId: selection.occurrenceId }
  if (selection.kind === 'group-clip') {
    return { kind: 'group-clip', occurrenceId: selection.occurrenceId, placementId: selection.placementId }
  }
  return null
}

function traversalTargetShowSelection(target: ShowTimelineTraversalTarget): ShowSelection {
  if (target.kind === 'clip') return { kind: 'clip', clipId: target.clipId }
  if (target.kind === 'group') return { kind: 'group', occurrenceId: target.occurrenceId }
  return { kind: 'group-clip', occurrenceId: target.occurrenceId, placementId: target.placementId }
}

function findShowSelectionAnchor(selection: ShowSelection): HTMLElement | null {
  const key = showSelectionKey(selection)
  return [...document.querySelectorAll<HTMLElement>('[data-show-selection-key]')]
    .find((element) => element.dataset.showSelectionKey === key) ?? null
}

function findCompositionClipOwner(
  composition: ShowCompositionV1 | null | undefined,
  placementId: string,
): ShowClipInspectorOwner | null {
  if (!composition) return null
  for (const scene of composition.scenes) {
    for (const zone of scene.zones) {
      if (zone.main.some((placement) => placement.id === placementId)) {
        return { kind: 'scene-main', sceneId: scene.sceneId, zoneId: zone.zoneId, placementId }
      }
      for (const layer of zone.overlays) {
        if (layer.placements.some((placement) => placement.id === placementId)) {
          return {
            kind: 'scene-overlay',
            sceneId: scene.sceneId,
            zoneId: zone.zoneId,
            layerId: layer.id,
            placementId,
          }
        }
      }
    }
  }
  return null
}

function findTimelineClipOwner(
  composition: ShowCompositionV1 | null | undefined,
  placementId: string,
): ShowTimelineClipOwner | null {
  const owner = findCompositionClipOwner(composition, placementId)
  if (!owner) return null
  if (owner.kind === 'global') return null
  return owner.kind === 'scene-main'
    ? {
        kind: 'main',
        sceneId: owner.sceneId,
        zoneId: owner.zoneId,
        placementId: owner.placementId,
      }
    : {
        kind: 'overlay',
        sceneId: owner.sceneId,
        zoneId: owner.zoneId,
        layerId: owner.layerId,
        placementId: owner.placementId,
      }
}

type ShowPatternOption = {
  label: string
  ref: ShowCell['pattern']
  group: PatternComboboxOption['group']
}

/**
 * The junction whose Layer Transition popover is open (#1065).
 *
 * `settings` is what the popover draws, and both backings supply it. `legacy`
 * is v1's own junction record, which still owns insertion, resize and Reset to
 * Cut; the authored-v2 backing carries none, so those commands resolve as
 * no-change results there instead of reaching a legacy owner.
 */
type ShowLayerTransitionTarget = {
  settings: { kind: ShowTransitionKind; durationMs: number } | null
  fromName: string
  toName: string
  anchor: HTMLElement
  groupOccurrenceId?: string
  groupTransitionId?: string
  transitionId?: string
  legacy?: ShowUnifiedTimelineJunctionProjection
  v2Cut?: { junctionKey: string }
  v2GroupCut?: { occurrenceId: string; fromClipId: string; toClipId: string }
}

type TimelineMarkerFeedback =
  | { kind: 'drag'; timeMs: number }
  | { kind: 'confirmation'; timeMs: number }

/** One lane before naming, disambiguation and hover text are resolved. */
interface ShowTimelinePropertyLaneCandidate {
  key: string
  label: string
  propertyLabel: string
  family: ShowPropertyLaneFamily
  /** Owning Clip's Pattern, present only for an authored animation lane. */
  ownerName: string | undefined
  ariaLabel: string
  color: string
  formatValue: (value: number) => string
  projection: ShowPropertyLaneProjection
  selectsTransition: boolean
}

interface ShowTimelinePropertyLanePresentation extends ShowTimelinePropertyLaneCandidate {
  glyph: ShowPropertyLaneGlyph | null
  displayLabel: string
  hoverText: string
}

/** v1's Zone lane accessible names read as a sentence, e.g. "Brightness lane". */
function sentenceCasePropertyLaneLabel(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1)
}

type ShowClipMovePreview = {
  clipId: string
  mode: 'move' | 'duplicate'
  targetKey: string
  startMs: number
  durationMs: number
  /**
   * True only for a boundary-magnetized landing. Grid-quantized landings are
   * not sticky — the grid exists everywhere, so there is no detent to defend
   * against a last-moment pointer shake (#667).
   */
  snapped: boolean
}

/**
 * One v2 Clip drop the pointer planned: a temporal move through the
 * clip-temporal or transition-resize door, or a linked duplicate through the
 * clip-sharing door. The engine's `ShowV2ClipTemporalPlan` is unchanged; the
 * sharing variant lives here because only the drag path carries it.
 */
type ShowV2ClipDropPlan = ShowV2ClipTemporalPlan | {
  kind: 'clip-sharing'
  intent: ShowV2PilotClipSharingIntent
  selectClipId: string
} | {
  kind: 'clip-sharing-pending'
  gesture: Extract<ShowTimelineGestureV2, { kind: 'duplicate' }>
}

type ShowClipMovePlan = {
  preview: ShowClipMovePreview
  mode: 'move' | 'duplicate'
} & ({
  recordVersion: 1
  sourceComposition: ShowCompositionV1
  composition: ShowCompositionV1
  owner: ShowTimelineClipOwner
  target: ShowTimelineClipMoveTarget
} | {
  recordVersion: 2
  clipId: string
  startMs: number
  plan: ShowV2ClipDropPlan
  moveRequest?: { clipId: string; zoneId: string; layerId: string; startMs: number }
})

type ShowClipResizePreview = {
  clipId: string
  startMs: number
  durationMs: number
}

type ShowClipResizePlan = {
  preview: ShowClipResizePreview
  sourceComposition: ShowCompositionV1
  owner: ShowTimelineClipOwner
}

// At this section width the pill and live strip retain only their compact copy.
export const SHOW_NOTE_COMPACT_WIDTH_PX = 560

function ShowNoteTrigger({ note, open, onToggle }: {
  note: StockShowNote
  open: boolean
  onToggle: () => void
}) {
  const [cardOpen, setCardOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const position = useAnchoredOverlayPosition(triggerRef, cardRef, cardOpen, {
    align: 'left', preferredSide: 'bottom', margin: 20,
  })
  const close = useCallback(() => {
    clearTimeout(hoverTimer.current)
    clearTimeout(leaveTimer.current)
    setCardOpen(false)
    setPinned(false)
  }, [])
  useEffect(() => () => {
    clearTimeout(hoverTimer.current)
    clearTimeout(leaveTimer.current)
  }, [])
  useEffect(() => {
    if (!cardOpen) return
    const dismissOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (triggerRef.current?.contains(event.target) || cardRef.current?.contains(event.target)) return
      close()
    }
    document.addEventListener('pointerdown', dismissOutside)
    const unregister = registerShowEscapeLayer({
      rank: SHOW_ESCAPE_LAYER_RANK.headerPopover,
      onEscape: () => {
        close()
        triggerRef.current?.focus()
        return true
      },
    })
    return () => {
      document.removeEventListener('pointerdown', dismissOutside)
      unregister()
    }
  }, [cardOpen, close])
  const enter = () => {
    clearTimeout(leaveTimer.current)
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setCardOpen(true), 200)
  }
  const leave = () => {
    clearTimeout(hoverTimer.current)
    if (!pinned) leaveTimer.current = setTimeout(close, 200)
  }
  const pin = () => {
    clearTimeout(hoverTimer.current)
    clearTimeout(leaveTimer.current)
    if (pinned) close()
    else { setCardOpen(true); setPinned(true) }
  }
  const [lead, ...bullets] = note.purpose.split('\n').filter((line) => line.trim() !== '')
  const rowLabel = 'text-[9px] font-semibold uppercase tracking-[0.09em] text-zinc-500'
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${note.number ? `${note.number} ` : ''}${note.title} guide`}
        aria-haspopup="dialog"
        aria-expanded={cardOpen}
        className="show-note-trigger inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-[3px] border border-cyan-200/35 bg-cyan-200/[0.08] px-1.5 text-[10px] text-cyan-200 hover:border-cyan-200/55 hover:bg-cyan-200/[0.16] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cyan-200"
        onPointerEnter={enter}
        onPointerLeave={leave}
        onPointerUp={(event) => event.currentTarget.blur()}
        onKeyDown={(event) => {
          if (event.key !== ' ' && event.key !== 'Enter') return
          event.preventDefault()
          event.stopPropagation()
          if (!event.repeat) { setCardOpen(true); setPinned(true) }
        }}
        onClick={pin}
      >
        <BookOpen size={11} aria-hidden />
        <span className="show-note-pill-label whitespace-nowrap font-semibold uppercase tracking-[0.06em]">{note.number ? `Lesson ${note.number}` : note.label}</span>
        <ChevronDown size={10} aria-hidden className="show-note-pill-label" />
      </button>
      {cardOpen && createPortal(
        <div
          ref={cardRef}
          role="dialog"
          aria-label={`${note.title} guide`}
          data-pinned={pinned}
          style={position}
          className="w-[min(64ch,calc(100vw-40px))] overflow-y-auto rounded border border-cyan-200/30 bg-[#10191e] font-mono text-[10px] leading-[1.5] text-zinc-300 shadow-[0_14px_48px_#000a]"
          onPointerEnter={() => clearTimeout(leaveTimer.current)}
          onPointerLeave={leave}
        >
          <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
            <BookOpen size={12} aria-hidden className="shrink-0 text-cyan-200" />
            <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-cyan-200">{note.label}{note.number ? ` ${note.number}` : ''}</span>
            <strong className="min-w-0 font-medium text-zinc-100">{note.title}</strong>
            <span className="ml-auto text-right text-[8px] leading-3 text-zinc-500">{pinned ? 'PINNED · ESC CLOSES' : 'CLICK PILL TO PIN'}</span>
          </div>
          <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-x-3 gap-y-3 px-3 py-3">
            <span className={rowLabel}>What this shows</span>
            <div><p>{lead}</p>{bullets.length > 0 && <ul className="mt-1 list-disc space-y-1 pl-3">{bullets.map((line) => <li key={line}>{line}</li>)}</ul>}</div>
            <span className={rowLabel}>Look for</span><p className="text-zinc-400">{note.notice}</p>
            <span className={rowLabel}>Try this</span><ul className="list-disc space-y-1 pl-3 text-zinc-400">{note.prompts.map((prompt) => <li key={prompt}>{prompt}</li>)}</ul>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-zinc-800 px-3 py-2">
            <a href={`${docExternalHref(note.guide.documentId)}#${note.guide.heading}`} className="inline-flex min-w-0 items-center gap-1 text-cyan-200/80 hover:text-cyan-100">
              <BookOpen size={10} aria-hidden className="shrink-0" />{note.guide.label}<ChevronRight size={10} aria-hidden className="shrink-0" />
            </a>
            <button type="button" role="switch" aria-label="Live strip" aria-checked={open} onClick={onToggle} className="inline-flex shrink-0 items-center gap-2 text-[9px] uppercase tracking-wide text-zinc-400">
              Live strip
              <span aria-hidden className={`flex h-3 w-6 items-center rounded-full px-0.5 ${open ? 'justify-end bg-cyan-200/40' : 'justify-start bg-zinc-700'}`}><i className="size-2 rounded-full bg-zinc-100" /></span>
            </button>
          </div>
        </div>, document.body,
      )}
    </>
  )
}

// The Try with Pattern row: one narrow picker per slot group in timeline
// order plus one Reset, identical for lessons and reference Showcases (#63).
// A single group keeps the classic "Try with Pattern" label; multiple groups
// read "Pattern 1..n" and the picked names mirror the Clips on the timeline.
function ShowPatternSlotPicker({
  authoredPatternFor,
  slotGroups,
  patternOptions,
  selections,
  onSelectPattern,
  inline = false,
}: {
  authoredPatternFor: (group: ShowPatternSlotGroup) => ShowPatternRef | undefined
  slotGroups: readonly ShowPatternSlotGroup[]
  patternOptions: ShowPatternOption[]
  selections?: Readonly<Record<number, ShowCell['pattern']>>
  onSelectPattern: (slotIndex: number, pattern: ShowCell['pattern']) => void
  inline?: boolean
}) {
  return (
    <div className={inline ? 'flex items-center gap-2' : 'flex flex-col gap-3'}>
      {slotGroups.map((group, index) => {
        const authoredPattern = authoredPatternFor(group)
        const activePattern = selections?.[index] ?? authoredPattern
        const label = `Pattern ${index + 1}`
        const pickerLabel = slotGroups.length === 1 ? 'Try with Pattern' : label
        return (
          <label key={group.instanceIds.join(':') || index} className={inline ? 'flex items-center gap-2' : 'grid grid-cols-[76px_minmax(0,1fr)] items-center gap-3'}>
            <span className={`${inline ? 'show-note-chooser-label ' : ''}whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.09em] text-zinc-500`}>{pickerLabel}</span>
            <div className={inline ? 'show-note-inline-picker w-44' : 'min-w-0'}>
              <PatternCombobox ariaLabel={pickerLabel}
                value={activePattern ? `${activePattern.kind}:${activePattern.id}` : null}
                options={patternOptions.map((option) => ({ value: `${option.ref.kind}:${option.ref.id}`, label: option.label, group: option.group }))}
                compact
                onChange={(value) => {
                  const option = patternOptions.find((candidate) => `${candidate.ref.kind}:${candidate.ref.id}` === value)
                  if (option) onSelectPattern(index, option.ref)
                }}
              />
            </div>
          </label>
        )
      })}
    </div>
  )
}

function patternControlDisplayName(exportName: string): string {
  const words = exportName
    .replace(/^slider/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
  return words ? words[0].toUpperCase() + words.slice(1) : exportName
}

interface PendingPatternSlotSelection {
  slotIndex: number
  pattern: ShowPatternRef
  patternName: string
  removedControlNames: string[]
}
type PendingV2Replacement = {
  clipId: string
  reference: ShowPatternRef
  patternName: string
  lost: Array<{ label: string; animated: boolean }>
} & ({ kind: 'clip' } | { kind: 'group-clip'; occurrenceId: string })

type PendingV2ControlRemoval = {
  patch: ShowClipInspectorPatch
  lost: Array<{ exportName: string; label: string }>
} & ({ kind: 'clip'; clipId: string } | { kind: 'group-clip'; occurrenceId: string; clipId: string })

function ShowLiveStrip({
  note,
  showId,
  narrationAt,
  authoredPatternFor,
  patternSlots,
  patternOptions,
  selections,
  onSelectPattern,
  onCollapse,
  onReset,
  canReset,
}: {
  note: StockShowNote
  showId: string
  narrationAt: (positionMs: number) => ShowLessonNarration
  authoredPatternFor: (group: ShowPatternSlotGroup) => ShowPatternRef | undefined
  patternSlots?: readonly ShowPatternSlotGroup[]
  patternOptions: ShowPatternOption[]
  selections?: Readonly<Record<number, ShowCell['pattern']>>
  onSelectPattern: (slotIndex: number, pattern: ShowCell['pattern']) => void
  onCollapse: () => void
  onReset: () => void
  canReset: boolean
}) {
  const [chooserOpen, setChooserOpen] = useState(false)
  const title = note.number ? `${note.number} ${note.title}` : note.title
  const groups = patternSlots ?? []
  const names = groups.slice(0, 2).map((group, index) => {
    const pattern = selections?.[index] ?? authoredPatternFor(group)
    return patternOptions.find((option) => option.ref.kind === pattern?.kind && option.ref.id === pattern?.id)?.label ?? pattern?.id ?? ''
  })
  const [chipAnchor, setChipAnchor] = useState<HTMLButtonElement | null>(null)
  return (
    <section role="region" aria-label={`${title} live strip`} className="show-live-strip flex h-8 shrink-0 select-none items-center gap-3 border-b border-cyan-200/20 bg-[#0d171b] px-3 text-[10px]">
      <ShowLiveNarration showId={showId} narrationAt={narrationAt} />
      {groups.length === 1 && <div className="shrink-0"><ShowPatternSlotPicker authoredPatternFor={authoredPatternFor} slotGroups={groups} patternOptions={patternOptions} selections={selections} onSelectPattern={onSelectPattern} inline /></div>}
      {groups.length > 1 && (
        <>
          <button ref={setChipAnchor} type="button" aria-label={`Patterns (${groups.length})`} aria-haspopup="dialog" aria-expanded={chooserOpen}
            onPointerUp={(event) => event.currentTarget.blur()}
            onClick={() => setChooserOpen((value) => !value)}
            className="show-note-pattern-chip inline-flex h-[22px] w-72 shrink-0 items-center gap-1 rounded border border-zinc-700 bg-zinc-900/65 px-1.5 text-zinc-300 hover:border-zinc-500 focus-visible:outline-2 focus-visible:outline-cyan-200">
            <Layers3 size={10} aria-hidden className="shrink-0" />
            <span className="show-note-chip-label shrink-0">Patterns</span>
            <span className="shrink-0">({groups.length})</span>
            <span className="show-note-chip-label min-w-0 truncate">· {names.join(', ')}{groups.length > 2 ? ` +${groups.length - 2}` : ''}</span>
            <ChevronDown size={10} aria-hidden className="show-note-chip-label ml-auto shrink-0" />
          </button>
          {chooserOpen && <ShowTimelineToolbarPopover anchor={chipAnchor} escapeLayerRank={SHOW_ESCAPE_LAYER_RANK.headerPopover} widthPx={320} ariaLabel="Try with Pattern"
            className="w-80 max-w-[calc(100vw-40px)] rounded border border-zinc-700 bg-[#10191e] p-3 font-mono text-[10px] shadow-xl"
            onDismiss={() => setChooserOpen(false)}>
            <div className="mb-3 flex items-center gap-2 border-b border-zinc-800 pb-2"><Layers3 size={12} aria-hidden /><strong className="font-medium text-zinc-200">Try with Pattern</strong></div>
            <ShowPatternSlotPicker authoredPatternFor={authoredPatternFor} slotGroups={groups} patternOptions={patternOptions} selections={selections}
              onSelectPattern={(index, pattern) => { onSelectPattern(index, pattern); setChooserOpen(false) }} />
            <div className="mt-3 flex justify-end border-t border-zinc-800 pt-2">
              <button type="button" disabled={!canReset} onClick={() => { onReset(); setChooserOpen(false) }} className="rounded border border-zinc-700 px-2 py-1 text-zinc-300 disabled:opacity-40">Reset</button>
            </div>
          </ShowTimelineToolbarPopover>}
        </>
      )}
      <button type="button" aria-label="Hide live strip" title="Hide live strip" className="inline-flex size-5 shrink-0 items-center justify-center text-zinc-500 hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-cyan-200"
        onPointerUp={(event) => event.currentTarget.blur()} onClick={onCollapse}><X size={12} aria-hidden /></button>
    </section>
  )
}

function ShowLiveNarration({ showId, narrationAt }: { showId: string; narrationAt: (positionMs: number) => ShowLessonNarration }) {
  const positionMs = useShowTransportStore((state) => state.showId === showId ? state.positionMs : 0)
  const narration = narrationAt(positionMs)
  const easingOption = narration.easing ? SHOW_EASING_OPTIONS.find((option) => option.id === showEasingOptionId(narration.easing!)) : undefined
  return (
    <div role="group" aria-label="Live narration" className="relative flex h-6 min-w-0 flex-1 items-center gap-2 whitespace-nowrap">
      <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.1em] text-cyan-200/75">{narration.kind}</span>
      <strong className="min-w-0 truncate font-medium text-zinc-100">{narration.label}</strong>
      {narration.kind === 'LIVE' && <span className="show-note-detail min-w-0 flex-1 truncate text-zinc-500">{narration.detail ?? 'The fixed comparison source before the first example.'}</span>}
      <span className="shrink-0 tabular-nums text-zinc-500">{narration.index + 1}/{narration.count}</span>
      {easingOption && <svg role="img" aria-label={`${easingOption.label} easing curve`} viewBox="0 0 48 20" className="show-note-detail h-4 w-9 shrink-0 text-cyan-200/80">
        <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={easingOption.samples.map((sample) => `${sample.progress * 48},${18 - sample.value * 16}`).join(' ')} />
      </svg>}
      {narration.kind === 'LIVE' && <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-white/[0.08]"><i data-testid="show-live-progress" className="block h-full bg-cyan-200/70" style={{ width: `${(narration.progress ?? 0) * 100}%` }} /></span>}
    </div>
  )
}

interface ShowDeliverySnapshot {
  show: ShowRecord
  controllerIp: string | null
  controllerSession: GeneratedArtifactControllerSession
  artifact: NonNullable<CompiledShowState['artifact']>
  prepared: ReturnType<typeof prepareShowControllerArtifact>
}

interface ShowCompilationSnapshot {
  showId: string
  name: string
  stampedAt: number
  artifact: NonNullable<CompiledShowState['artifact']>
  canonicalExport: ShowEpeExport
  exportWith: (options: ShowEpeExportOptions) => ShowEpeExport | null
}

export function ShowEditor({
  showId,
  recordVersion = 1,
  autoPlay = false,
  showOverride,
  readOnly = false,
  builtInContext,
  headerGuideTarget = null,
  headerActionsTarget = null,
  transportClockActive = false,
  protectDetailPanelTransport = false,
  onTimelineMinimumHeightChange,
  onTimelineContentHeightChange,
  onOpenStagePreview,
}: {
  showId: string
  recordVersion?: 1 | 2
  autoPlay?: boolean
  showOverride?: ShowRecord
  readOnly?: boolean
  builtInContext?: {
    track: 'portable' | 'installation'
    lesson: string
    description: string
    note?: StockShowNote
    patternSlots?: readonly ShowPatternSlotGroup[]
    reference?: ShowReferenceGuide
  }
  headerGuideTarget?: HTMLElement | null
  headerActionsTarget?: HTMLElement | null
  transportClockActive?: boolean
  protectDetailPanelTransport?: boolean
  onTimelineMinimumHeightChange?: (height: number) => void
  onTimelineContentHeightChange?: (height: number, requiredHeight: number) => void
  onOpenStagePreview?: (anchor: HTMLElement) => void
}) {
  useLayoutEffect(() => {
    usePreviewStore.getState().setRunning(autoPlay)
  }, [showId, autoPlay])

  const savedShow = useShowStore((state) => state.shows.find((item) => item.id === showId))
  const savedShowV2 = useShowStore((state) => state.showV2Pilots[showId])
  const stockShowDraft = useShowStore((state) => state.stockShowDrafts[showId])
  const isShowV2LessonDraft = useShowStore((state) => state.isShowV2LessonDraft)
  const showV2History = useShowStore((state) => state.showV2Histories[showId])
  // A v2 lesson draft is session-only state in showV2Pilots/showV2Histories
  // (#1066 slice 11a), which the v1 stockShowDrafts map never sees. Like a v1
  // stock draft, it exists once any edit was made, even if undone: either
  // ShowV2History side (past, future) holding an entry counts.
  const isV2LessonDraft = recordVersion === 2 && isShowV2LessonDraft(showId)
  const hasStockDraft = isV2LessonDraft
    ? showV2History !== undefined && (showV2History.past.length > 0 || showV2History.future.length > 0)
    : stockShowDraft !== undefined
  const resetStockShowDraft = useShowStore((state) => state.resetStockShowDraft)
  const resetShowV2LessonDraft = useShowStore((state) => state.resetShowV2LessonDraft)
  const duplicateShow = useShowStore((state) => state.duplicateShow)
  const duplicateShowV2Row = useShowStore((state) => state.duplicateShowV2Row)
  const openShow = useShowStore((state) => state.openShow)
  const routerNavigate = useRouterStore((state) => state.navigate)
  const personalWorkspaceAuthenticated = useWorkspaceStore((state) => state.personalWorkspaceAuthenticated)
  const agentCapabilities = useWorkspaceStore((state) => state.agentCapabilities)
  const [savingBuiltInCopy, setSavingBuiltInCopy] = useState(false)
  const persistShow = useShowStore((state) => state.updateShow)
  const showSaveFailure = useShowStore((state) => state.showSaveFailure)
  const dismissShowSaveFailure = useShowStore((state) => state.dismissShowSaveFailure)
  const retryShowSaveFailure = useShowStore((state) => state.retryShowSaveFailure)
  const showV2SaveFailure = useShowStore((state) => state.showV2SaveFailure)
  const dismissShowV2SaveFailure = useShowStore((state) => state.dismissShowV2SaveFailure)
  const retryShowV2SaveFailure = useShowStore((state) => state.retryShowV2SaveFailure)
  const updateBoundaryTransition = useShowStore((state) => state.updateBoundaryTransition)
  const removeBoundaryTransition = useShowStore((state) => state.removeBoundaryTransition)
  const updateCellAdaptations = useShowStore((state) => state.updateCellAdaptations)
  const updateCellControlTarget = useShowStore((state) => state.updateCellControlTarget)
  const updateCellRestartOnEntry = useShowStore((state) => state.updateCellRestartOnEntry)
  const spanCellZones = useShowStore((state) => state.spanCellZones)
  const updateCellZoneMode = useShowStore((state) => state.updateCellZoneMode)
  const addZone = useShowStore((state) => state.addZone)
  const updateZone = useShowStore((state) => state.updateZone)
  const removeZone = useShowStore((state) => state.removeZone)
  const showNoteOpen = useShowEditorSessionStore((state) => (
    state.showNoteOpenById[showId] ?? builtInContext?.note?.defaultOpen ?? false
  ))
  const setShowNoteOpen = useShowEditorSessionStore((state) => state.setShowNoteOpen)
  const selectedReferencePatterns = useShowEditorSessionStore((state) => state.referencePatternsByShowId[showId])
  const setReferencePattern = useShowEditorSessionStore((state) => state.setReferencePattern)
  const clearReferencePatterns = useShowEditorSessionStore((state) => state.clearReferencePatterns)
  const setDiagnosticFocus = useShowEditorSessionStore((state) => state.setDiagnosticFocus)
  const addRoutingLayout = useShowStore((state) => state.addRoutingLayout)
  const updateRoutingLayout = useShowStore((state) => state.updateRoutingLayout)
  const removeRoutingLayout = useShowStore((state) => state.removeRoutingLayout)
  const userPatterns = usePatternStore((state) => state.userPatterns)
  const userLibraries = useLibraryStore((state) => state.userLibraries)
  const compileLibrarySet = useMemo(() => compileLibraries(LIBRARIES, userLibraries), [userLibraries])
  const exportedSliderNamesFor = useCallback((ref: ShowPatternRef) => {
    const source = ref.kind === 'stock' ? DEMOS[resolveStockPatternId(ref.id)] : userPatterns.find(pattern => pattern.id === ref.id)?.src
    return resolveBundledPatternSliderNames(source, compileLibrarySet)
  }, [compileLibrarySet, userPatterns])
  // Lessons and reference Showcases declare ordered groups on the catalogue
  // entry. The legacy single reference slot remains a compatibility fallback.
  const builtInSlotGroups = useMemo<readonly ShowPatternSlotGroup[] | undefined>(() => (
    builtInContext?.patternSlots
      ?? (builtInContext?.reference?.patternSlots ? [builtInContext.reference.patternSlots] : undefined)
  ), [builtInContext?.reference?.patternSlots, builtInContext?.patternSlots])
  const slotPatternNameFor = useCallback((ref: ShowCell['pattern']) => (
    ref.kind === 'stock' ? resolveStockPatternId(ref.id) : userPatterns.find((pattern) => pattern.id === ref.id)?.name
  ), [userPatterns])
  const userMaps = useMapStore((state) => state.userMaps)
  const controllerProfiles = useControllerProfileStore((state) => state.profiles)
  const preparedV2Dependencies = useMemo(() => recordVersion === 2 ? {
    patterns: userPatterns,
    libraries: userLibraries,
    maps: userMaps,
    profiles: controllerProfiles,
    stageMap: resolveShowV2StageMap(savedShowV2?.stageMapId, userMaps),
  } : null, [controllerProfiles, recordVersion, savedShowV2?.stageMapId, userLibraries, userMaps, userPatterns])
  const preparedV2Capture = useMemo(() => (
    recordVersion === 2 && savedShowV2 && preparedV2Dependencies
      ? captureShowStageEditV2(savedShowV2, preparedV2Dependencies)
      : null
  ), [preparedV2Dependencies, recordVersion, savedShowV2])
  const preparedV2CaptureRef = useRef(preparedV2Capture)
  preparedV2CaptureRef.current = preparedV2Capture
  const lessonProjectionV2 = useMemo(() => (
    recordVersion === 2 && savedShowV2 && builtInSlotGroups && selectedReferencePatterns
      ? applyShowPatternSlotSelectionsV2(
          savedShowV2,
          builtInSlotGroups,
          selectedReferencePatterns,
          slotPatternNameFor,
          exportedSliderNamesFor,
        )
      : savedShowV2
  ), [builtInSlotGroups, exportedSliderNamesFor, recordVersion, savedShowV2, selectedReferencePatterns, slotPatternNameFor])
  const presentationV2Capture = useMemo(() => (
    recordVersion === 2 && lessonProjectionV2 && preparedV2Dependencies
      ? lessonProjectionV2 === savedShowV2
        ? preparedV2Capture
        : captureShowStageEditV2(lessonProjectionV2, preparedV2Dependencies)
      : null
  ), [lessonProjectionV2, preparedV2Capture, preparedV2Dependencies, recordVersion, savedShowV2])
  const timelineViewV2 = useMemo(() => (
    recordVersion === 2 && lessonProjectionV2 ? projectShowEditorTimelineV2(lessonProjectionV2) : null
  ), [recordVersion, lessonProjectionV2])
  // The time grid's own columns. v1 reads them off its Scenes inside the
  // workspace; a v2 backing resolves the same section and boundary spans from
  // the authored record, so the same Show lays out in the same CSS tracks
  // whichever version stores it (#1065).
  const timeColumnsV2 = useMemo(() => (
    recordVersion === 2 && lessonProjectionV2 ? projectShowEditorTimeColumnsV2(lessonProjectionV2) : null
  ), [recordVersion, lessonProjectionV2])
  const transitionSettingsV2 = useMemo(() => (
    recordVersion === 2 && lessonProjectionV2 ? projectShowEditorTransitionSettingsV2(lessonProjectionV2) : null
  ), [recordVersion, lessonProjectionV2])
  // Which Transitions v1's boundary surfaces own, read from the authored
  // record. Both the inspector panel and the Change palette gate on this, so it
  // is projected once here rather than twice further down (#1065).
  const boundaryTransitionsV2 = useMemo(() => (
    recordVersion === 2 && lessonProjectionV2 ? projectShowEditorBoundaryTransitionsV2(lessonProjectionV2) : null
  ), [recordVersion, lessonProjectionV2])
  const boundaryTransitionIdsV2 = useMemo(() => (
    boundaryTransitionsV2 ? new Set(Object.keys(boundaryTransitionsV2)) : null
  ), [boundaryTransitionsV2])
  // The timeline caption reads each Clip at its own authored start, so it stays
  // independent of the playhead exactly as the v1 caption is (#1065).
  const clipSummarySourcesV2 = useMemo(() => (
    recordVersion === 2 && lessonProjectionV2 ? projectShowEditorTimelineClipSummarySourcesV2(lessonProjectionV2) : null
  ), [recordVersion, lessonProjectionV2])
  const activeIp = useControllerStore((state) => state.activeIp)
  const activeController = useControllerStore((state) => (state.activeIp ? state.controllers[state.activeIp] : undefined))
  const controllerPushing = useControllerStore((state) => state.pushing)
  const controllerArtifactPushResult = useControllerStore((state) => state.artifactPushResult)
  const lastPushedSource = useControllerStore((state) => state.lastPushedSource)
  const lastRunProgramId = useControllerStore((state) => state.lastRunProgramId)
  const lastSavedSource = useControllerStore((state) => state.lastSavedSource)
  const lastPushedProfileSignature = useControllerStore((state) => state.lastPushedProfileSignature)
  const lastSavedProfileSignature = useControllerStore((state) => state.lastSavedProfileSignature)
  const activeProgramId = useControllerPanelStore((state) => state.activeProgramId)
  const pushGeneratedArtifact = useControllerStore((state) => state.pushGeneratedArtifact)
  const clearArtifactPushResult = useControllerStore((state) => state.clearArtifactPushResult)
  const reportArtifactPushFailure = useControllerStore((state) => state.reportArtifactPushFailure)
  const selection = useShowEditorViewStore((state) => state.selection)
  // Alive flag restoring the semantics useState gave for free: a stale async
  // continuation from an unmounted editor must not write into the global
  // store that a newer editor instance now owns.
  const editorAliveRef = useRef(true)
  useEffect(() => {
    editorAliveRef.current = true
    return () => { editorAliveRef.current = false }
  }, [])
  const viewEpoch = useShowEditorViewStore((state) => state.viewEpoch)
  // The captured epoch discriminates stale continuations: the closure holds
  // the epoch of the visit that created it, the store bumps the epoch on
  // every Show switch or remount, and a write tagged with an old epoch is
  // dropped (Show ids repeat across visits, so the id alone cannot serve).
  // Returns whether the write landed so callers abort dependent UI steps.
  const setSelection = useCallback((next: ShowSelection): boolean => {
    if (!editorAliveRef.current) return false
    return useShowEditorViewStore.getState().setSelection(next, viewEpoch)
  }, [viewEpoch])
  const resetShowEditorView = useShowEditorViewStore((state) => state.resetShowEditorView)
  const resetHoveredClip = useShowClipHoverStore((state) => state.resetHoveredClip)
  const [isolatedGroupOccurrenceId, setIsolatedGroupOccurrenceId] = useState<string | null>(null)
  const [generatedSnapshot, setGeneratedSnapshot] = useState<ShowCompilationSnapshot | null>(null)
  const [showSendMode, setShowSendMode] = useState<SendMode>('run')
  const [pendingSendMode, setPendingSendMode] = useState<SendMode | null>(null)
  const pendingDeliveryRef = useRef<ShowDeliverySnapshot | null>(null)
  const preparedDeliverySnapshotRef = useRef<ShowDeliverySnapshot | null>(null)
  const [preparingSave, setPreparingSave] = useState(false)
  const [compositionClipPendingDelete, setCompositionClipPendingDelete] = useState<ShowTimelineClipOwner | null>(null)
  const [v2ClipPendingDelete, setV2ClipPendingDelete] = useState<string | null>(null)
  const [pendingPatternSlotSelection, setPendingPatternSlotSelection] = useState<PendingPatternSlotSelection | null>(null)
  const [pendingV2Replacement, setPendingV2Replacement] = useState<PendingV2Replacement | null>(null)
  const [pendingV2ControlRemoval, setPendingV2ControlRemoval] = useState<PendingV2ControlRemoval | null>(null)
  const patternControlsByInstanceIdRef = useRef<Record<string, AutomatablePatternControl[]>>({})
  const [blockedDeleteFeedback, setBlockedDeleteFeedback] = useState<BlockedDeleteFeedback | null>(null)
  const blockedDeleteFeedbackSequenceRef = useRef(0)
  const reportBlockedDelete = useCallback((selectionKey: string, copy: BlockedDeleteCopy) => {
    blockedDeleteFeedbackSequenceRef.current += 1
    setBlockedDeleteFeedback({
      selectionKey,
      token: blockedDeleteFeedbackSequenceRef.current,
      ...copy,
    })
  }, [])
  const [spatialZoneSelection, setSpatialZoneSelection] = useState<{ zoneId: string; layoutId: string } | null>(null)
  const [detailPanelOpen, setDetailPanelOpen] = useState(false)
  const [detailAnchor, setDetailAnchor] = useState<HTMLElement | null>(null)
  const [pinnedDetail, setPinnedDetail] = useState<{ selection: ShowSelection; anchor: HTMLElement } | null>(null)
  const [detailsSuppressed, setDetailsSuppressed] = useState(false)
  const [transitionPaletteId, setTransitionPaletteId] = useState<string | null>(null)
  // Where the transport returns when a palette preview is restored. The palette
  // itself no longer owns a record, so its caller captures this as it opens.
  const transitionPaletteReturnMsRef = useRef(0)
  // v1's candidate snapshot: the Show built for a hovered catalogue item is
  // kept and reused when that same item is applied, so Apply persists exactly
  // the record the Stage previewed rather than a second computation of it.
  const transitionPaletteCandidateRef = useRef<{ key: string; show: ShowRecord } | null>(null)
  const legacyPaletteCandidate = (
    show: ShowRecord,
    transitionId: string,
    item: ShowToolkitPresentationItem,
    presetId?: string,
    stageDimensions: 1 | 2 | 3 = 2,
  ): ShowRecord => {
    const key = `${transitionId}:${item.key}:${presetId ?? ''}:${stageDimensions}`
    const cached = transitionPaletteCandidateRef.current
    if (cached?.key === key) return cached.show
    const changed = replaceShowBoundaryTransition(show, transitionId, item, presetId, stageDimensions)
    transitionPaletteCandidateRef.current = { key, show: changed }
    return changed
  }
  // Slice 5c live preview: the candidate a hovered catalogue item would apply,
  // planned exactly as commitV2BoundaryPaletteApply plans it. Cached per
  // transition:item:preset key so a re-hover reuses the record; the cache
  // resets whenever savedShowV2 changes. A null candidate (refused plan or
  // edit) is cached too, so re-hover clears without replanning.
  const transitionPaletteCandidateV2Ref = useRef<{ source: ShowRecordV2; key: string; record: ShowRecordV2 | null } | null>(null)
  const v2PaletteCandidate = (
    transitionId: string,
    item: ShowToolkitPresentationItem,
    presetId?: string,
    stageDimensions: 1 | 2 | 3 = 2,
  ): ShowRecordV2 | null => {
    const base = savedShowV2
    if (!base) return null
    const key = `${transitionId}:${item.key}:${presetId ?? ''}:${stageDimensions}`
    const cached = transitionPaletteCandidateV2Ref.current
    if (cached && cached.source === base && cached.key === key) return cached.record
    const plan = planShowV2BoundaryPaletteApply(base, transitionId, showTransitionChangesForPresentation(item, presetId, stageDimensions), newPersonalContentId)
    let record: ShowRecordV2 | null = null
    if (plan.status === 'ready') {
      const edited = editShowTransitionV2(base, plan.intent)
      if (edited.status === 'changed') record = edited.record
    }
    transitionPaletteCandidateV2Ref.current = { source: base, key, record }
    return record
  }
  // The v2 Stage reads showV2StageRecord(pilot, override) in App.tsx, so a Try
  // with Pattern trial must be published as the Stage override: the timeline,
  // inspector, Live strip, View code and the compiled artifact already read the
  // projection, but the Stage would otherwise keep showing the stored Pattern.
  // While the transition palette holds the override with its own live preview
  // (the onPreviewItem path below that calls previewV2(candidate)), this
  // effect stands down; when the palette ends and clears, the flag flips and a
  // still-active trial is re-published. The ref guards the clear path so a
  // palette candidate is never mistaken for this effect's publication.
  const lessonStagePublishedV2Ref = useRef<ShowRecordV2 | null>(null)
  const v2PalettePreviewActive = recordVersion === 2 && transitionPaletteId !== null
  useEffect(() => {
    if (recordVersion === 2 && !v2PalettePreviewActive) {
      const store = useShowPreviewOverrideStore.getState()
      if (lessonProjectionV2 && savedShowV2 && lessonProjectionV2 !== savedShowV2) {
        lessonStagePublishedV2Ref.current = lessonProjectionV2
        if (store.showV2 !== lessonProjectionV2) store.previewV2(lessonProjectionV2)
      } else {
        const published = lessonStagePublishedV2Ref.current
        if (published && savedShowV2 && published.id === savedShowV2.id && store.showV2 === published) {
          store.clear(savedShowV2.id)
        }
        lessonStagePublishedV2Ref.current = null
      }
    }
    return () => {
      const published = lessonStagePublishedV2Ref.current
      const store = useShowPreviewOverrideStore.getState()
      if (published && store.showV2 === published) store.clear(published.id)
    }
  }, [lessonProjectionV2, recordVersion, savedShowV2, v2PalettePreviewActive])
  const [layerTransitionTarget, setLayerTransitionTarget] = useState<ShowLayerTransitionTarget | null>(null)
  // A refused insertion used to return silently, so choosing a Transition did
  // nothing at all: no change, no error, no closed panel (#363).
  const [layerTransitionApplyError, setLayerTransitionApplyError] = useState<string | null>(null)
  // Seeded null so the reset effect below also fires on a fresh mount: the
  // view store is global, and a new editor instance must not inherit the
  // previous instance's selection or viewport.
  const detailShowIdRef = useRef<string | null>(null)
  const { scope: fieldActivity } = useMemo(() => ({ showId, scope: createFieldActivityScope() }), [showId])

  // One production admission/channel lifetime; DEV tooling is an explicit transport switch.
  const getAgentEditorContext = useCallback(() => ({
    showId,
    selection: useShowEditorViewStore.getState().selection,
    viewport: useShowEditorViewStore.getState().viewport,
    hoveredClipId: useShowClipHoverStore.getState().hoveredClipId,
    playheadMs: useShowTransportStore.getState().showId === showId
      ? useShowTransportStore.getState().positionMs : 0,
  }), [showId])
  const agentRecordBinding = useMemo<AgentEditorRecordBinding>(() => recordVersion === 2 ? {
    recordVersion: 2,
    capture: () => preparedV2CaptureRef.current,
    isCurrentCapture: () => {
      const capture = preparedV2CaptureRef.current
      return Boolean(editorAliveRef.current && capture && useShowStore.getState().showV2Pilots[showId] === capture.record)
    },
  } : { recordVersion: 1 }, [recordVersion, showId])
  const legacyAgentDiagnosticEnabled = useCallback(() => new URL(window.location.href).searchParams.get('agent') === '1', [])
  useAgentEditorLifecycle({
    showId,
    readOnly,
    enabled: Boolean(agentCapabilities?.external || agentCapabilities?.builtin),
    allowance: agentCapabilities?.allowance,
    legacyDiagnosticEnabled: import.meta.env.DEV ? legacyAgentDiagnosticEnabled : undefined,
    getContext: getAgentEditorContext,
    record: agentRecordBinding,
    bindFieldActivity: fieldActivity.bind,
    createChannel: createAgentBrowserSession,
    createAdmission: import.meta.env.DEV ? createDiagnosticAgentAdmission : undefined,
    diagnostic: import.meta.env.DEV ? installDiagnosticAgentSession : undefined,
  })
  const timelineWorkspaceRef = useRef<HTMLElement>(null)
  const showEditorPaneRef = useRef<HTMLDivElement>(null)
  const [timelineMoreBelow, setTimelineMoreBelow] = useState(false)
  const lastTimelineFocusRef = useRef<HTMLElement | null>(null)
  const closeDetailPanel = useCallback((restoreFocus = false) => {
    const previousAnchor = detailAnchor
    setTransitionPaletteId(null)
    setLayerTransitionTarget(null)
    setDetailPanelOpen(false)
    setDetailAnchor(null)
    if (restoreFocus) {
      window.setTimeout(() => {
        if (previousAnchor?.isConnected) previousAnchor.focus()
        else timelineWorkspaceRef.current?.focus()
      }, 0)
    }
  }, [detailAnchor])
  const closePinnedDetailForSelection = useCallback((target: ShowSelection) => {
    setPinnedDetail((current) => current && sameShowSelection(current.selection, target) ? null : current)
  }, [])
  const selectTimeline = useCallback((next: ShowSelection, anchor?: HTMLElement | null) => {
    if (detailPanelOpen && sameShowSelection(selection, next)) {
      closeDetailPanel()
      return
    }
    if (!detailPanelOpen && pinnedDetail && sameShowSelection(pinnedDetail.selection, next)) {
      setSelection(next)
      return
    }
    if (next.kind === 'show') lastTimelineFocusRef.current = timelineWorkspaceRef.current
    if (!setSelection(next)) return
    setDetailPanelOpen(true)
    setDetailAnchor(anchor ?? null)
    if (!anchor) {
      window.setTimeout(() => setDetailAnchor(findShowSelectionAnchor(next)), 0)
    }
  }, [closeDetailPanel, detailPanelOpen, pinnedDetail, selection, setSelection])
  const selectGroupCandidates = useCallback((groupSelection: ShowGroupSelection) => {
    if (!setSelection({ kind: 'multi', groupSelection })) return
    closeDetailPanel()
  }, [closeDetailPanel, setSelection])
  const reanchorOpenDetails = useCallback((target: ShowSelection) => {
    window.setTimeout(() => {
      const anchor = findShowSelectionAnchor(target)
      if (!anchor) return
      if (detailPanelOpen && sameShowSelection(selection, target)) setDetailAnchor(anchor)
      setPinnedDetail((current) => current && sameShowSelection(current.selection, target)
        ? { ...current, anchor }
        : current)
    }, 0)
  }, [detailPanelOpen, selection])
  const openShowProperties = useCallback((anchor: HTMLElement) => {
    setGeneratedSnapshot(null)
    selectTimeline({ kind: 'show' }, anchor)
  }, [selectTimeline])
  useEffect(() => {
    if (detailShowIdRef.current === showId) return
    detailShowIdRef.current = showId
    resetShowEditorView(showId)
    resetHoveredClip()
    setDetailPanelOpen(false)
    setDetailAnchor(null)
    setPinnedDetail(null)
    setDetailsSuppressed(false)
    setTransitionPaletteId(null)
    setLayerTransitionTarget(null)
    setCompositionClipPendingDelete(null)
    setV2ClipPendingDelete(null)
    setPendingPatternSlotSelection(null)
    setPendingV2Replacement(null)
    setPendingV2ControlRemoval(null)
    setBlockedDeleteFeedback(null)
    setIsolatedGroupOccurrenceId(null)
    pendingDeliveryRef.current = null
    setPendingSendMode(null)
    setGeneratedSnapshot(null)
  }, [resetHoveredClip, resetShowEditorView, showId])
  useEffect(() => {
    const pendingDelivery = pendingDeliveryRef.current
    if (!pendingDelivery || pendingDelivery.controllerIp === activeIp) return
    pendingDeliveryRef.current = null
    setPendingSendMode(null)
  }, [activeIp])
  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      if (readOnly) return
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
      if (showControlOwnsKeyboardEvent(event.target)) return
      event.preventDefault()
      const store = useShowStore.getState()
      if (recordVersion === 2) {
        if (event.shiftKey) void store.redoShowV2Pilot(showId)
        else void store.undoShowV2Pilot(showId)
      } else if (event.shiftKey) void store.redoShow(showId)
      else void store.undoShow(showId)
    }
    document.addEventListener('keydown', handleHistoryShortcut)
    return () => document.removeEventListener('keydown', handleHistoryShortcut)
  }, [readOnly, recordVersion, showId])
  const controllerProvider = getControllerProvider()
  const controllerStatus = useSyncExternalStore(
    (onChange) => controllerProvider.subscribe(onChange),
    () => controllerProvider.getStatus(),
  )
  const connectedControllerId = controllerStatus.kind === 'connected'
    ? controllerStatus.controller.id
    : null
  const connectedControllerAddress = controllerStatus.kind === 'connected'
    ? controllerStatus.controller.address
    : null
  const activeControllerLiveEpoch = activeController?.liveEpoch ?? 0
  const deliveryControllerSession = useMemo<GeneratedArtifactControllerSession | null>(() => (
    connectedControllerId && connectedControllerAddress
      ? {
          id: connectedControllerId,
          address: connectedControllerAddress,
          liveEpoch: activeControllerLiveEpoch,
        }
      : null
  ), [activeControllerLiveEpoch, connectedControllerAddress, connectedControllerId])

  const canonicalStockShow = builtInContext ? stockShowById(showId)?.show : undefined
  // Every v1 derivation below hangs off this record, so the v2 backing starts
  // from null: a stock Show id that also exists in the catalogue must not quietly
  // supply a legacy record to the v2 editor (#1065).
  // The declared backing owns which record this editor reads and writes, not
  // whether a v1 row happens to be cached under the same id (#1065). Only a
  // recordVersion 1 editor resolves a legacy record at all.
  const editableShow = recordVersion === 1
    ? stockShowDraft ?? savedShow ?? canonicalStockShow ?? showOverride ?? null
    : null
  const afterSceneIdByTransitionId = useMemo<Readonly<Record<string, string>>>(() => (
    Object.fromEntries((stockShowById(showId)?.show.transitions ?? []).map((transition) => [transition.id, transition.afterSceneId]))
  ), [showId])
  const activeShow = useMemo(() => (
    editableShow && builtInSlotGroups && selectedReferencePatterns
      ? applyShowPatternSlotSelections(
          editableShow,
          builtInSlotGroups,
          selectedReferencePatterns,
          slotPatternNameFor,
          exportedSliderNamesFor,
        )
      : editableShow
  ), [editableShow, builtInSlotGroups, selectedReferencePatterns, slotPatternNameFor, exportedSliderNamesFor])
  const requestPatternSlotSelection = useCallback((slotIndex: number, pattern: ShowPatternRef) => {
    const group = builtInSlotGroups?.[slotIndex]
    const patternName = slotPatternNameFor(pattern)
    if (!group || !patternName) return
    const sliderNames = exportedSliderNamesFor(pattern)
    if (sliderNames === null) return
    if (recordVersion === 2) {
      if (!lessonProjectionV2) return
      const removedControlNames = showPatternSlotRemovedControlNamesV2(
        lessonProjectionV2,
        group,
        sliderNames,
      )
      if (removedControlNames.length === 0) {
        setReferencePattern(showId, slotIndex, pattern)
        return
      }
      setPendingPatternSlotSelection({
        slotIndex,
        pattern,
        patternName,
        removedControlNames: removedControlNames.map(patternControlDisplayName),
      })
      return
    }
    if (!activeShow) return
    const removedControlNames = showPatternSlotRemovedControlNames(
      activeShow,
      group,
      sliderNames,
    )
    if (removedControlNames.length === 0) {
      setReferencePattern(showId, slotIndex, pattern)
      return
    }
    setPendingPatternSlotSelection({
      slotIndex,
      pattern,
      patternName,
      removedControlNames: removedControlNames.map(patternControlDisplayName),
    })
  }, [activeShow, builtInSlotGroups, exportedSliderNamesFor, lessonProjectionV2, recordVersion, setReferencePattern, showId, slotPatternNameFor])
  // Every legacy whole-record write funnels through here, so this is the one
  // place a v2 backing is fenced off from the v1 save path (#1065). An
  // unconnected v2 write resolves as an internal no-change result: no record,
  // no history entry, no queued save, and no visible disabling.
  const updateShow = useCallback((id: string, next: ShowRecord) => {
    if (recordVersion !== 1) return Promise.resolve()
    let persisted = next
    if (editableShow && builtInSlotGroups && selectedReferencePatterns) {
      // A deliberate Pattern reassignment in Clip Detail supersedes the slot
      // picker: that slot's transient selection clears and the edit persists
      // as authored. Slots the edit left alone stay transient - restore
      // strips them back to the authored Pattern before the draft saves.
      // Restore reads only slot ids, so the kept groups merge into one
      // projection.
      const patternAt = (show: ShowRecord | null, instanceId: string) => (
        show?.composition?.patternInstances.find((instance) => instance.id === instanceId)?.pattern
      )
      const cellPatternAt = (show: ShowRecord | null, cellId: string) => (
        show?.cells.find((cell) => cell.id === cellId)?.pattern
      )
      const patternEquals = (a?: ShowCell['pattern'], b?: ShowCell['pattern']) => (
        Boolean(a && b && a.kind === b.kind && a.id === b.id)
      )
      // In a superseded group only the deliberately reassigned member keeps
      // the edit; sibling members are still transient and must strip back to
      // the authored Pattern like any kept slot (#63 review P2).
      const restoreCellIds: string[] = []
      const restoreInstanceIds: string[] = []
      let restorePattern: ShowCell['pattern'] | undefined
      builtInSlotGroups.forEach((group, index) => {
        const selection = selectedReferencePatterns[index]
        if (!selection) return
        const reassigned = group.instanceIds.some((instanceId) => {
          const before = patternAt(activeShow, instanceId)
          const after = patternAt(next, instanceId)
          return before && after && !patternEquals(before, after)
        })
        if (reassigned) setReferencePattern(showId, index, null)
        const untouched = (current: ShowCell['pattern'] | undefined) => (
          !reassigned || patternEquals(current, selection)
        )
        const cellIds = group.cellIds.filter((cellId) => untouched(cellPatternAt(next, cellId)))
        const instanceIds = group.instanceIds.filter((instanceId) => untouched(patternAt(next, instanceId)))
        if (cellIds.length > 0 || instanceIds.length > 0) {
          restorePattern ??= selection
          restoreCellIds.push(...cellIds)
          restoreInstanceIds.push(...instanceIds)
        }
      })
      if (restorePattern) {
        persisted = restoreShowReferencePatternSlots(next, editableShow, {
          pattern: restorePattern,
          patternName: slotPatternNameFor(restorePattern) ?? '',
          cellIds: restoreCellIds,
          instanceIds: restoreInstanceIds,
        })
      }
    }
    // Persistence failures must stay observable here: awaited callers gate
    // follow-up work (selecting a created placement, closing an Add flow) on
    // this promise. The rollback and showSaveFailure notice (#792) own
    // user-facing reporting.
    return persistShow(id, persisted)
  }, [editableShow, persistShow, builtInSlotGroups, recordVersion, selectedReferencePatterns, activeShow, setReferencePattern, showId, slotPatternNameFor])
  // Fire-and-forget edits discard the promise; consuming the rejection here
  // keeps a routine offline save (already rolled back and reported through
  // showSaveFailure, #792) from doubling as an uncaught browser error.
  const updateShowInBackground = useCallback((id: string, next: ShowRecord) => {
    updateShow(id, next).catch(() => {})
  }, [updateShow])
  // Async edit callbacks gate their follow-up (returned ids, selection,
  // closing an Add flow) on persistence: a rolled-back write reads as
  // "no change" instead of leaking an unhandled rejection (#792).
  const tryUpdateShow = useCallback(async (id: string, next: ShowRecord): Promise<boolean> => {
    if (recordVersion !== 1) return false
    try {
      await updateShow(id, next)
      return true
    } catch {
      return false
    }
  }, [recordVersion, updateShow])
  const transportDurationMs = recordVersion === 2
    ? timelineViewV2?.showEndMs ?? 0
    : activeShow ? showLoopDurationMs(activeShow) : 0
  useShowTransportClock(recordVersion === 2 ? savedShowV2?.id ?? null : activeShow?.id ?? null, transportDurationMs, transportClockActive)
  const captureV2Move = useCallback(() => {
    const capture = preparedV2CaptureRef.current
    if (!capture || capture.prepared.status === 'refused') return null
    return {
      capture,
      baseRevision: useShowStore.getState().showRevisions[showId] ?? 0,
    }
  }, [showId])
  // Slice 1 connects the remaining Clip temporal gestures through the same two
  // doors: free temporal edits (trim/extend, re-placement, split) through the
  // clip-temporal owner, and the connected forms (resize-leading,
  // resize-trailing, move-connected) through the transition-resize door, whose
  // partition this slice opens for exactly those owner-defined kinds (#1066).
  const commitV2ClipTemporal = useCallback(async (input: {
    capture: ShowV2PilotPreparedCapture
    baseRevision: number
    intent: ShowClipTemporalIntentV2
  }) => {
    const outcome = await admitShowV2PilotClipTemporal({
      showId,
      baseRevision: input.baseRevision,
      capture: input.capture,
      intent: input.intent,
      onAdopted: () => {},
      isCurrent: () => editorAliveRef.current
        && preparedV2CaptureRef.current === input.capture
        && useShowStore.getState().showV2Pilots[showId] === input.capture.record,
    })
    return outcome.status === 'applied'
  }, [showId])
  const commitV2ClipSharing = useCallback(async (input: {
    capture: ShowV2PilotPreparedCapture
    baseRevision: number
    intent: ShowV2PilotClipSharingIntent
  }) => {
    const outcome = await admitShowV2PilotClipSharingEdit({
      showId,
      baseRevision: input.baseRevision,
      capture: input.capture,
      intent: input.intent,
      onAdopted: () => {},
      isCurrent: () => editorAliveRef.current
        && preparedV2CaptureRef.current === input.capture
        && useShowStore.getState().showV2Pilots[showId] === input.capture.record,
    })
    return outcome.status === 'applied'
  }, [showId])
  // Toolbar Clone on a v2 backing: a linked duplicate immediately after the
  // source Clip on its own Layer, committed through the clip-sharing door
  // (#1090). Linked by contract, exactly as the Option-drag copy: the copy
  // consumes the source's Pattern instance and mints no runtime of its own.
  const duplicateClipAfterV2 = useCallback(async (clipId: string): Promise<string | null> => {
    const gesture = captureV2Move()
    if (!gesture) return null
    const clip = gesture.capture.record.composition.clips.find((candidate) => candidate.id === clipId)
    if (!clip) return null
    const planned = planShowTimelineGestureV2(gesture.capture, {
      kind: 'duplicate',
      clipId,
      startMs: clip.startMs + clip.durationMs,
      zoneId: clip.zoneId,
      layerId: clip.layerId,
    }, newPersonalContentId)
    if (planned.status !== 'ready' || planned.submission.owner !== 'clip-sharing') return null
    const selectClipId = planned.selectAfterId ?? planned.submission.intent.identities.clipId
    const applied = await commitV2ClipSharing({ ...gesture, intent: planned.submission.intent })
    return applied ? selectClipId : null
  }, [captureV2Move, commitV2ClipSharing])
  // Slice C connects Marker editing, Insert Time and Add Layer through the
  // same prepared-capture plumbing: each helper returns the admission outcome
  // so the calling handler maps applied/unchanged/refused exactly as the
  // legacy chokepoint maps changed/noop/refused (#1090).
  const commitV2MarkerEdit = useCallback(async (input: {
    capture: ShowV2PilotPreparedCapture
    baseRevision: number
    intent: ShowMarkerEditIntentV2
  }) => {
    const outcome = await admitShowV2PilotMarkerEdit({
      showId,
      baseRevision: input.baseRevision,
      capture: input.capture,
      intent: input.intent,
      onAdopted: () => {},
      isCurrent: () => editorAliveRef.current
        && preparedV2CaptureRef.current === input.capture
        && useShowStore.getState().showV2Pilots[showId] === input.capture.record,
    })
    return outcome
  }, [showId])
  const commitV2InsertTime = useCallback(async (input: {
    capture: ShowV2PilotPreparedCapture
    baseRevision: number
    intent: ShowInsertTimeIntentV2
  }) => {
    const outcome = await admitShowV2PilotInsertTime({
      showId,
      baseRevision: input.baseRevision,
      capture: input.capture,
      intent: input.intent,
      onAdopted: () => {},
      isCurrent: () => editorAliveRef.current
        && preparedV2CaptureRef.current === input.capture
        && useShowStore.getState().showV2Pilots[showId] === input.capture.record,
    })
    return outcome
  }, [showId])
  const commitV2LayerEdit = useCallback(async (input: {
    capture: ShowV2PilotPreparedCapture
    baseRevision: number
    intent: ShowLayerEditIntentV2
  }) => {
    const outcome = await admitShowV2PilotLayerEdit({
      showId,
      baseRevision: input.baseRevision,
      capture: input.capture,
      intent: input.intent,
      onAdopted: () => {},
      isCurrent: () => editorAliveRef.current
        && preparedV2CaptureRef.current === input.capture
        && useShowStore.getState().showV2Pilots[showId] === input.capture.record,
    })
    return outcome
  }, [showId])
  const commitV2CreateGroup = useCallback(async (input: {
    capture: ShowV2PilotPreparedCapture
    baseRevision: number
    intent: CreateShowGroupFromSelectionIntentV2
  }) => {
    const outcome = await admitShowV2PilotCreateGroup({
      showId,
      baseRevision: input.baseRevision,
      capture: input.capture,
      intent: input.intent,
      onAdopted: () => {},
      isCurrent: () => editorAliveRef.current
        && preparedV2CaptureRef.current === input.capture
        && useShowStore.getState().showV2Pilots[showId] === input.capture.record,
    })
    return outcome.status === 'applied'
  }, [showId])
  const commitV2GroupOccurrenceEdit = useCallback(async (input: {
    capture: ShowV2PilotPreparedCapture
    baseRevision: number
    intent: ShowV2PilotGroupOccurrenceEditIntent
  }) => {
    const outcome = await admitShowV2PilotGroupOccurrenceEdit({
      showId,
      baseRevision: input.baseRevision,
      capture: input.capture,
      intent: input.intent,
      onAdopted: () => {},
      isCurrent: () => editorAliveRef.current
        && preparedV2CaptureRef.current === input.capture
        && useShowStore.getState().showV2Pilots[showId] === input.capture.record,
    })
    return outcome.status === 'applied'
  }, [showId])
  const commitV2TransitionResize = useCallback(async (input: {
    capture: ShowV2PilotPreparedCapture
    baseRevision: number
    intent: ShowV2PilotTransitionResizeIntent
  }) => {
    const outcome = await admitShowV2PilotTransitionResize({
      showId,
      baseRevision: input.baseRevision,
      capture: input.capture,
      intent: input.intent,
      onAdopted: () => {},
      isCurrent: () => editorAliveRef.current
        && preparedV2CaptureRef.current === input.capture
        && useShowStore.getState().showV2Pilots[showId] === input.capture.record,
    })
    return outcome.status === 'applied'
  }, [showId])
  const commitV2LayoutOccurrenceEdit = useCallback(async (input: {
    capture: ShowV2PilotPreparedCapture
    baseRevision: number
    intent: ShowV2PilotLayoutOccurrenceIntent
  }) => {
    const outcome = await admitShowV2PilotLayoutOccurrenceEdit({
      showId,
      baseRevision: input.baseRevision,
      capture: input.capture,
      intent: input.intent,
      onAdopted: () => {},
      isCurrent: () => editorAliveRef.current
        && preparedV2CaptureRef.current === input.capture
        && useShowStore.getState().showV2Pilots[showId] === input.capture.record,
    })
    return outcome.status === 'applied'
  }, [showId])
  const commitV2LayoutPlan = useCallback((build: (record: ShowRecordV2) => ReturnType<typeof planShowV2LayoutEdit> | null): Promise<boolean> => {
    if (recordVersion !== 2 || !savedShowV2 || readOnly) return Promise.resolve(false)
    const capture = preparedV2CaptureRef.current
    if (!capture || capture.prepared.status === 'refused') return Promise.resolve(false)
    const plan = build(capture.record)
    if (!plan || plan.status === 'refused') return Promise.resolve(false)
    const baseRevision = useShowStore.getState().showRevisions[showId] ?? 0
    return commitV2LayoutOccurrenceEdit({ capture, baseRevision, intent: plan.intent })
  }, [commitV2LayoutOccurrenceEdit, readOnly, recordVersion, savedShowV2, showId])
  const commitV2ClipDelete = useCallback(async (input: {
    capture: ShowV2PilotPreparedCapture
    baseRevision: number
    intent: ShowV2PilotClipDeleteIntent
  }) => {
    const outcome = await admitShowV2PilotClipDelete({
      showId,
      baseRevision: input.baseRevision,
      capture: input.capture,
      intent: input.intent,
      onAdopted: () => {},
      isCurrent: () => editorAliveRef.current
        && preparedV2CaptureRef.current === input.capture
        && useShowStore.getState().showV2Pilots[showId] === input.capture.record,
    })
    return outcome
  }, [showId])
  // Slice 3 connects the Clip detail panel's appearance surface through the
  // same prepared-capture plumbing: one inspector patch plans at most one
  // appearance or instance-properties intent, so one accepted edit stays one
  // history entry and one save. Refused and no-op patches return false
  // synchronously, exactly as the legacy chokepoint does, so fields revert
  // their drafts and no legacy owner runs for a v2 row (#1066).
  const commitV2ClipAppearance = useCallback(async (input: {
    capture: ShowV2PilotPreparedCapture
    baseRevision: number
    intent: ShowClipAppearanceEditIntentV2
  }) => {
    const outcome = await admitShowV2PilotAppearanceEdit({
      showId,
      baseRevision: input.baseRevision,
      capture: input.capture,
      intent: input.intent,
      onAdopted: () => {},
      isCurrent: () => editorAliveRef.current
        && preparedV2CaptureRef.current === input.capture
        && useShowStore.getState().showV2Pilots[showId] === input.capture.record,
    })
    return outcome
  }, [showId])
  // Slice 5a connects the boundary Transition settings surface through the
  // same prepared-capture plumbing: one accepted settings edit stays one
  // history entry and one save (#1066).
  const commitV2TransitionEdit = useCallback(async (input: {
    capture: ShowV2PilotPreparedCapture
    baseRevision: number
    intent: ShowV2PilotTransitionEditIntent
  }) => {
    const outcome = await admitShowV2PilotTransitionEdit({
      showId,
      baseRevision: input.baseRevision,
      capture: input.capture,
      intent: input.intent,
      onAdopted: () => {},
      isCurrent: () => editorAliveRef.current
        && preparedV2CaptureRef.current === input.capture
        && useShowStore.getState().showV2Pilots[showId] === input.capture.record,
    })
    return outcome
  }, [showId])
  // Slice 10 connects Property animation writes through the same plumbing:
  // one accepted change is one history entry and one save. The synchronous
  // part of admission adopts the new record before its first await, so the
  // boolean commit below never loses a follow-up edit (#1066).
  const commitV2PropertyEdit = useCallback(async (input: {
    capture: ShowV2PilotPreparedCapture
    baseRevision: number
    propertyOwner: ShowPropertyTrackOwnerV2
    intent: ShowPropertyEditIntentV2
  }) => {
    const outcome = await admitShowV2PilotPropertyEdit({
      showId,
      baseRevision: input.baseRevision,
      capture: input.capture,
      propertyOwner: input.propertyOwner,
      intent: input.intent,
      onAdopted: () => {},
      isCurrent: () => editorAliveRef.current
        && preparedV2CaptureRef.current === input.capture
        && useShowStore.getState().showV2Pilots[showId] === input.capture.record,
    })
    return outcome
  }, [showId])
  const commitV2InstanceProperties = useCallback(async (input: {
    capture: ShowV2PilotPreparedCapture
    baseRevision: number
    intent: ShowV2ClipInspectorInstanceIntent
  }) => {
    const outcome = await admitShowV2PilotInstanceProperties({
      showId,
      baseRevision: input.baseRevision,
      capture: input.capture,
      intent: input.intent,
      onAdopted: () => {},
      isCurrent: () => editorAliveRef.current
        && preparedV2CaptureRef.current === input.capture
        && useShowStore.getState().showV2Pilots[showId] === input.capture.record,
    })
    return outcome
  }, [showId])
  // Slice 4 connects the entry-policy facet through the same plumbing: one
  // accepted write is one history entry and one save (#1066).
  const commitV2ClipEntryPolicy = useCallback(async (input: {
    capture: ShowV2PilotPreparedCapture
    baseRevision: number
    intent: ShowV2PilotClipEntryPolicyIntent
  }) => {
    const outcome = await admitShowV2PilotClipEntryPolicy({
      showId,
      baseRevision: input.baseRevision,
      capture: input.capture,
      intent: input.intent,
      onAdopted: () => {},
      isCurrent: () => editorAliveRef.current
        && preparedV2CaptureRef.current === input.capture
        && useShowStore.getState().showV2Pilots[showId] === input.capture.record,
    })
    return outcome
  }, [showId])
  // Replace Pattern resolves the source and independence plan against the
  // prepared capture. The adapter confirms reported control loss before
  // submitting one intent; cancellation writes nothing (#1069).
  const commitV2ClipReplacement = useCallback(async (input: {
    capture: ShowV2PilotPreparedCapture
    baseRevision: number
    intent: ShowV2ClipReplacementIntent
  }) => {
    const outcome = await admitShowV2PilotClipReplacementEdit({
      showId,
      baseRevision: input.baseRevision,
      capture: input.capture,
      intent: input.intent,
      onAdopted: () => {},
      isCurrent: () => editorAliveRef.current
        && preparedV2CaptureRef.current === input.capture
        && useShowStore.getState().showV2Pilots[showId] === input.capture.record,
    })
    if (outcome.status === 'applied') {
      const replaced = input.capture.record.composition.clips.find((clip) => clip.id === input.intent.clipId)
      const instanceId = replaced?.instanceId
      if (instanceId && builtInSlotGroups) {
        const selections = useShowEditorSessionStore.getState().referencePatternsByShowId[showId]
        builtInSlotGroups.forEach((group, index) => {
          if (selections?.[index] && group.instanceIds.includes(instanceId)) {
            setReferencePattern(showId, index, null)
          }
        })
      }
    }
    return outcome
  }, [builtInSlotGroups, setReferencePattern, showId])
  // A Group Clip Pattern change reaches the definition through the Group
  // replacement door, shared by every linked occurrence (#1075 G2c).
  const commitV2GroupReplacement = useCallback(async (input: {
    capture: ShowV2PilotPreparedCapture
    baseRevision: number
    intent: ShowV2GroupReplacementIntent
  }) => {
    const outcome = await admitShowV2PilotGroupReplacementEdit({
      showId,
      baseRevision: input.baseRevision,
      capture: input.capture,
      intent: input.intent,
      onAdopted: () => {},
      isCurrent: () => editorAliveRef.current
        && preparedV2CaptureRef.current === input.capture
        && useShowStore.getState().showV2Pilots[showId] === input.capture.record,
    })
    return outcome
  }, [showId])
  // The v2 Group Clip Pattern adapter confirms previewed control loss before
  // submitting the definition edit; cancellation writes nothing (#1069).
  const commitV2GroupClipPattern = useCallback((occurrenceId: string, clipId: string, ref: ShowPatternRef): boolean | Promise<void> => {
    if (recordVersion !== 2 || !savedShowV2 || readOnly) return false
    const capture = preparedV2CaptureRef.current
    if (!capture || capture.prepared.status === 'refused') return false
    const definitionId = capture.record.composition.groupOccurrences.find((candidate) => candidate.id === occurrenceId)?.definitionId
    if (!definitionId) return false
    const preview = previewShowV2GroupReplacement(capture, definitionId, clipId, ref)
    if (preview.status === 'refused') return false
    if (preview.lostControls.length > 0) {
      const resolved = resolveCapturedShowPatternReplacementV2(capture, ref)
      if (resolved.status === 'refused') return false
      const instanceId = materializeShowGroupsV2(capture.record).composition.clips.find((clip) => clip.id === `${occurrenceId}:${clipId}`)?.instanceId
      const controls = instanceId ? patternControlsByInstanceIdRef.current[instanceId] ?? [] : []
      const labels = new Map(controls.map((control) => [control.exportName, control.label]))
      setPendingV2Replacement({ kind: 'group-clip', occurrenceId, clipId, reference: { ...ref }, patternName: resolved.replacement.patternName,
        lost: preview.lostControls.map(({ exportName, animated }: ShowV2LostControl) => ({ label: labels.get(exportName) ?? exportName, animated })) })
      return false
    }
    const plan = planShowV2GroupReplacementEdit(capture, definitionId, clipId, ref, newPersonalContentId)
    if (plan.status === 'refused') return false
    const baseRevision = useShowStore.getState().showRevisions[showId] ?? 0
    return commitV2GroupReplacement({ capture, baseRevision, intent: plan.intent }).then(() => {}, () => {})
  }, [commitV2GroupReplacement, readOnly, recordVersion, savedShowV2, showId])
  const confirmV2Replacement = useCallback(() => {
    const pending = pendingV2Replacement
    setPendingV2Replacement(null)
    if (!pending || recordVersion !== 2 || !savedShowV2 || readOnly) return
    const capture = preparedV2CaptureRef.current
    if (!capture || capture.prepared.status === 'refused') return
    const baseRevision = useShowStore.getState().showRevisions[showId] ?? 0
    if (pending.kind === 'clip') {
      const plan = createShowV2ClipReplacementIntent(capture, pending.clipId, pending.reference, newPersonalContentId)
      if (plan.status === 'ready') void commitV2ClipReplacement({ capture, baseRevision, intent: plan.intent }).then(() => {}, () => {})
      return
    }
    const definitionId = capture.record.composition.groupOccurrences.find((occurrence) => occurrence.id === pending.occurrenceId)?.definitionId
    if (!definitionId) return
    const plan = planShowV2GroupReplacementEdit(capture, definitionId, pending.clipId, pending.reference, newPersonalContentId)
    if (plan.status === 'ready') void commitV2GroupReplacement({ capture, baseRevision, intent: plan.intent }).then(() => {}, () => {})
  }, [commitV2ClipReplacement, commitV2GroupReplacement, pendingV2Replacement, readOnly, recordVersion, savedShowV2, showId])
  const confirmV2ControlRemoval = useCallback(() => {
    const pending = pendingV2ControlRemoval
    setPendingV2ControlRemoval(null)
    if (!pending || recordVersion !== 2 || !savedShowV2 || readOnly) return
    const capture = preparedV2CaptureRef.current
    if (!capture || capture.prepared.status === 'refused') return
    const baseRevision = useShowStore.getState().showRevisions[showId] ?? 0
    if (pending.kind === 'group-clip') {
      const plan = planShowV2GroupOccurrenceEdit(capture.record,
        { kind: 'set-child-inspector-patch', occurrenceId: pending.occurrenceId, clipId: pending.clipId, patch: pending.patch },
        newPersonalContentId)
      if (plan.status !== 'ready') return
      void commitV2GroupOccurrenceEdit({ capture, baseRevision, intent: plan.intent }).then(() => {}, () => {})
      return
    }
    const instanceId = capture.record.composition.clips.find((clip) => clip.id === pending.clipId)?.instanceId
    const controls = instanceId ? patternControlsByInstanceIdRef.current[instanceId] ?? [] : []
    const plan = planShowV2ClipInspectorPatch(capture.record, pending.clipId, pending.patch,
      { controlLabels: Object.fromEntries(controls.map((control) => [control.exportName, control.label])) })
    if (plan.kind !== 'instance-properties') return
    void commitV2InstanceProperties({ capture, baseRevision, intent: plan.intent }).then(() => {}, () => {})
  }, [commitV2GroupOccurrenceEdit, commitV2InstanceProperties, pendingV2ControlRemoval, readOnly, recordVersion, savedShowV2, showId])
  // Slice 6 connects Show End through the same plumbing: one accepted write
  // is one history entry and one save. The drag preview never writes and the
  // commit never reads preview state, so a keyboard set with no drag still
  // commits (#1066).
  const commitV2SetShowEnd = useCallback(async (input: {
    capture: ShowV2PilotPreparedCapture
    baseRevision: number
    intent: ShowV2PilotSetShowEndRequest['intent']
  }) => {
    const outcome = await admitShowV2PilotSetShowEnd({
      showId,
      baseRevision: input.baseRevision,
      capture: input.capture,
      intent: input.intent,
      onAdopted: () => {},
      isCurrent: () => editorAliveRef.current
        && preparedV2CaptureRef.current === input.capture
        && useShowStore.getState().showV2Pilots[showId] === input.capture.record,
    })
    return outcome
  }, [showId])
  // Slice 6 connects the Show metadata the setup panel edits on this backing
  // (Trails, portable reference, target Controller) through the same plumbing.
  const commitV2ShowMetadata = useCallback(async (input: {
    capture: ShowV2PilotPreparedCapture
    baseRevision: number
    intent: ShowV2PilotShowMetadataRequest['intent']
  }) => {
    const outcome = await admitShowV2PilotShowMetadata({
      showId,
      baseRevision: input.baseRevision,
      capture: input.capture,
      intent: input.intent,
      onAdopted: () => {},
      isCurrent: () => editorAliveRef.current
        && preparedV2CaptureRef.current === input.capture
        && useShowStore.getState().showV2Pilots[showId] === input.capture.record,
    })
    return outcome
  }, [showId])
  const commitV2ZoneEdit = useCallback(async (input: {
    capture: ShowV2PilotPreparedCapture
    baseRevision: number
    intent: ShowZoneEditIntentV2
  }) => {
    const outcome = await admitShowV2PilotZoneEdit({
      showId,
      baseRevision: input.baseRevision,
      capture: input.capture,
      intent: input.intent,
      onAdopted: () => {},
      isCurrent: () => editorAliveRef.current
        && preparedV2CaptureRef.current === input.capture
        && useShowStore.getState().showV2Pilots[showId] === input.capture.record,
    })
    return outcome
  }, [showId])
  const commitV2LayoutDefinitionEdit = useCallback(async (input: {
    capture: ShowV2PilotPreparedCapture
    baseRevision: number
    intent: ShowZoneLayoutDefinitionIntentV2
  }) => {
    const outcome = await admitShowV2PilotLayoutDefinitionEdit({
      showId,
      baseRevision: input.baseRevision,
      capture: input.capture,
      intent: input.intent,
      onAdopted: () => {},
      isCurrent: () => editorAliveRef.current
        && preparedV2CaptureRef.current === input.capture
        && useShowStore.getState().showV2Pilots[showId] === input.capture.record,
    })
    return outcome
  }, [showId])
  const commitV2ClipInspectorPatch = useCallback((clipId: string, patch: ShowClipInspectorPatch): boolean | Promise<void> => {
    if (recordVersion !== 2 || !savedShowV2 || readOnly) return false
    const capture = preparedV2CaptureRef.current
    if (!capture || capture.prepared.status === 'refused') return false
    // Inspector Start and Duration reuse the timeline drag's planners, as v1's
    // inspector reuses its move and resize (#1066).
    if (timelineViewV2 && Object.keys(patch).length === 1 && patch.local !== undefined) {
      const localKeys = Object.keys(patch.local)
      const hasStart = patch.local.startMs !== undefined
      const hasDuration = patch.local.durationMs !== undefined
      if (localKeys.length === 1 && (hasStart !== hasDuration)) {
        let placed: { zoneId: string; layerId: string; startMs: number } | null = null
        for (const row of timelineViewV2.rows) {
          for (const layer of row.layers) {
            const item = layer.items.find((candidate) => candidate.id === clipId)
            if (item) { placed = item; break }
          }
          if (placed) break
        }
        if (placed) {
          const temporalPlan = hasDuration
            ? planShowV2ClipResize(timelineViewV2, { clipId, edge: 'trailing', startMs: placed.startMs, endMs: placed.startMs + Math.round(patch.local.durationMs!) })
            : planShowV2ClipMove(timelineViewV2, { clipId, zoneId: placed.zoneId, layerId: placed.layerId, startMs: Math.round(patch.local.startMs!) })
          if (temporalPlan.kind === 'refuse') return false
          const baseRevision = useShowStore.getState().showRevisions[showId] ?? 0
          const temporalCommit = temporalPlan.kind === 'transition-resize'
            ? commitV2TransitionResize({ capture, baseRevision, intent: temporalPlan.intent })
            : commitV2ClipTemporal({ capture, baseRevision, intent: temporalPlan.intent })
          return temporalCommit.then(() => {}, () => {})
        }
      }
    }
    const inspectorInstanceId = capture.record.composition.clips.find((candidate) => candidate.id === clipId)?.instanceId
    const inspectorControls = inspectorInstanceId ? patternControlsByInstanceIdRef.current[inspectorInstanceId] ?? [] : []
    const plan = planShowV2ClipInspectorPatch(capture.record, clipId, patch,
      { controlLabels: Object.fromEntries(inspectorControls.map((control) => [control.exportName, control.label])) })
    if (plan.kind === 'refuse') return false
    if (plan.kind === 'no-op') {
      // Re-picking the stored Pattern ends the slot's trial and writes nothing (#1066 L2).
      if (Object.keys(patch).length === 1 && patch.pattern !== undefined) {
        const clip = capture.record.composition.clips.find((candidate) => candidate.id === clipId)
        const instanceId = clip?.instanceId
        if (instanceId && builtInSlotGroups) {
          const selections = useShowEditorSessionStore.getState().referencePatternsByShowId[showId]
          let cleared = false
          builtInSlotGroups.forEach((group, index) => {
            if (selections?.[index] && group.instanceIds.includes(instanceId)) {
              setReferencePattern(showId, index, null)
              cleared = true
            }
          })
          if (cleared) return true
        }
      }
      return false
    }
    const baseRevision = useShowStore.getState().showRevisions[showId] ?? 0
    if (plan.kind === 'instance-properties' && plan.removedControls.length > 0) {
      const labels = new Map(inspectorControls.map((control) => [control.exportName, control.label]))
      setPendingV2ControlRemoval({ kind: 'clip', clipId, patch,
        lost: plan.removedControls.map(({ exportName, label }) => ({ exportName, label: labels.get(exportName) ?? label })) })
      return false
    }
    if (plan.kind === 'entry-policy') {
      return commitV2ClipEntryPolicy({ capture, baseRevision, intent: plan.intent }).then(() => {}, () => {})
    }
    if (plan.kind === 'replacement') {
      const preview = previewShowV2ClipReplacement(capture, clipId, plan.reference)
      if (preview.status === 'refused') return false
      if (preview.lostControls.length > 0) {
        const resolved = resolveCapturedShowPatternReplacementV2(capture, plan.reference)
        if (resolved.status === 'refused') return false
        const instanceId = capture.record.composition.clips.find((clip) => clip.id === clipId)?.instanceId
        const controls = instanceId ? patternControlsByInstanceIdRef.current[instanceId] ?? [] : []
        const labels = new Map(controls.map((control) => [control.exportName, control.label]))
        setPendingV2Replacement({ kind: 'clip', clipId, reference: { ...plan.reference }, patternName: resolved.replacement.patternName,
          lost: preview.lostControls.map(({ exportName, animated }: ShowV2LostControl) => ({ label: labels.get(exportName) ?? exportName, animated })) })
        return false
      }
      const replacement = createShowV2ClipReplacementIntent(capture, clipId, plan.reference, newPersonalContentId)
      if (replacement.status === 'refused') return false
      return commitV2ClipReplacement({ capture, baseRevision, intent: replacement.intent }).then(() => {}, () => {})
    }
    const commit = plan.kind === 'appearance'
      ? commitV2ClipAppearance({ capture, baseRevision, intent: plan.intent })
      : commitV2InstanceProperties({ capture, baseRevision, intent: plan.intent })
    // The async settlement is observed through the re-projected record, not
    // the return: every caller only distinguishes a synchronous false (revert
    // the draft) from anything else (keep the draft), exactly as the legacy
    // chokepoint's contract reads.
    return commit.then(() => {}, () => {})
  }, [builtInSlotGroups, commitV2ClipAppearance, commitV2ClipEntryPolicy, commitV2ClipReplacement, commitV2ClipTemporal, commitV2InstanceProperties, commitV2TransitionResize, readOnly, recordVersion, savedShowV2, setReferencePattern, showId, timelineViewV2])
  // Slice 5a connects the boundary Transition settings writes (the Transition
  // parameter editor and the Crossfade source select) through the
  // transition-edit door. Refused and no-op changes return synchronously so
  // the committing control reverts its draft, exactly as the Clip inspector
  // commit does (#1066).
  const commitV2BoundaryTransitionChanges = useCallback((transitionId: string, changes: ShowTransitionChanges): void => {
    if (recordVersion !== 2 || !savedShowV2 || readOnly) return
    const capture = preparedV2CaptureRef.current
    if (!capture || capture.prepared.status === 'refused') return
    const { durationMs, ...settingsChanges } = changes
    if (durationMs !== undefined) {
      // Duration belongs to the resize owner, which the settings planner
      // refuses by design: a changed value commits through the same resize
      // door the Layer Transition popover uses, and an unchanged one commits
      // nothing (#1066).
      const current = capture.record.composition.transitions.find((candidate) => candidate.id === transitionId)
      if (current && durationMs !== current.durationMs) {
        const baseRevision = useShowStore.getState().showRevisions[showId] ?? 0
        void commitV2TransitionResize({ capture, baseRevision, intent: { kind: 'resize-transition', transitionId, durationMs } })
      }
    }
    if (Object.keys(settingsChanges).length === 0) return
    const plan = planShowV2BoundaryTransitionChanges(capture.record, transitionId, settingsChanges)
    if (plan.status !== 'ready') return
    const baseRevision = useShowStore.getState().showRevisions[showId] ?? 0
    void commitV2TransitionEdit({ capture, baseRevision, intent: plan.intent })
  }, [commitV2TransitionEdit, commitV2TransitionResize, readOnly, recordVersion, savedShowV2, showId])
  // Slice 5d connects the boundary Transition Remove through the same door:
  // v1 turns the boundary into a Cut, which on this backing is the owner's
  // reset-to-cut, and closes the panel once it is gone (#1066).
  const commitV2BoundaryTransitionRemove = useCallback((transitionId: string): void => {
    if (recordVersion !== 2 || !savedShowV2 || readOnly) return
    const capture = preparedV2CaptureRef.current
    if (!capture || capture.prepared.status === 'refused') return
    const plan = planShowV2TransitionReset(capture.record, transitionId, newPersonalContentId)
    if (plan.status !== 'ready') return
    const baseRevision = useShowStore.getState().showRevisions[showId] ?? 0
    void commitV2TransitionEdit({ capture, baseRevision, intent: plan.intent }).then((outcome) => {
      if (outcome.status !== 'applied') return
      closeDetailPanel()
      closePinnedDetailForSelection({ kind: 'transition', transitionId })
    }).catch(() => {})
  }, [closeDetailPanel, closePinnedDetailForSelection, commitV2TransitionEdit, readOnly, recordVersion, savedShowV2, showId])
  const commitV2RoutingTransferUpdate = useCallback((occurrenceId: string, changes: Partial<Omit<ShowBoundaryTransition, 'id' | 'afterSceneId'>>): void => {
    if (recordVersion !== 2 || !savedShowV2 || readOnly) return
    const capture = preparedV2CaptureRef.current
    if (!capture || capture.prepared.status === 'refused') return
    const occurrence = capture.record.composition.layoutOccurrences.find((candidate) => candidate.id === occurrenceId)
    if (!occurrence) return
    const wantsLayout = changes.layoutId !== undefined && changes.layoutId !== occurrence.layoutId
    const wantsTiming = changes.durationMs !== undefined || changes.easing !== undefined || changes.routingDirection !== undefined
    if (!wantsLayout && !wantsTiming) return
    const transfers = projectShowEditorRoutingTransfersV2(capture.record)
    const current = Object.values(transfers).find((entry) => entry.occurrenceId === occurrenceId)
    if (!current) return
    const buildTiming = (record: ShowRecordV2): ReturnType<typeof planShowV2LayoutEdit> | null => {
      const rawMs = changes.durationMs ?? current.durationMs
      const durationMs = Math.max(0, Math.round(rawMs))
      const easing = changes.easing ?? current.easing
      const direction = changes.routingDirection ?? (current.directionAuthored ? current.direction : undefined)
      if (durationMs > 0) {
        return planShowV2LayoutEdit(record, {
          kind: 'set-transfer',
          occurrenceId,
          transfer: { durationMs, easing, ...(direction ? { direction } : {}) } as unknown as Omit<import('@/engine/showCompositionV2').ShowLayoutTransferV2, 'id' | 'fromOccurrenceId'>,
        }, newPersonalContentId)
      }
      return planShowV2LayoutEdit(record, { kind: 'set-transfer', occurrenceId, transfer: null }, newPersonalContentId)
    }
    if (wantsLayout && wantsTiming) {
      const layoutId = changes.layoutId as string
      void commitV2LayoutPlan((record) => planShowV2LayoutEdit(record, { kind: 'select-layout', occurrenceId, layoutId }, newPersonalContentId)).then((applied) => {
        if (!applied) return
        const timingPlan = buildTiming(useShowStore.getState().showV2Pilots[showId] ?? capture.record)
        if (!timingPlan || timingPlan.status !== 'ready' || timingPlan.intent.kind !== 'set-transfer') return
        const intent = timingPlan.intent
        void commitV2LayoutPlan(() => timingPlan).then((timingApplied) => {
          if (!timingApplied) return
          if (intent.transfer !== null) selectTimeline({ kind: 'transition', transitionId: intent.transfer.id })
          else selectTimeline({ kind: 'transition', transitionId: `layout-cut:${occurrenceId}` })
        }).catch(() => {})
      }).catch(() => {})
      return
    }
    if (wantsLayout) {
      const layoutId = changes.layoutId as string
      void commitV2LayoutPlan((record) => planShowV2LayoutEdit(record, { kind: 'select-layout', occurrenceId, layoutId }, newPersonalContentId))
      return
    }
    const timingPlan = buildTiming(capture.record)
    if (!timingPlan || timingPlan.status !== 'ready' || timingPlan.intent.kind !== 'set-transfer') return
    const intent = timingPlan.intent
    void commitV2LayoutPlan(() => timingPlan).then((applied) => {
      if (!applied) return
      if (intent.transfer !== null) selectTimeline({ kind: 'transition', transitionId: intent.transfer.id })
      else selectTimeline({ kind: 'transition', transitionId: `layout-cut:${occurrenceId}` })
    }).catch(() => {})
  }, [commitV2LayoutPlan, readOnly, recordVersion, savedShowV2, selectTimeline, showId])
  const commitV2RoutingTransferRemove = useCallback((occurrenceId: string): void => {
    if (recordVersion !== 2 || !savedShowV2 || readOnly) return
    void commitV2LayoutPlan((record) => planShowV2LayoutEdit(record, { kind: 'remove-switch', occurrenceId }, newPersonalContentId)).then((applied) => {
      if (applied) selectTimeline({ kind: 'show' })
    }).catch(() => {})
  }, [commitV2LayoutPlan, readOnly, recordVersion, savedShowV2, selectTimeline])
  // Slice 10 connects ordinary-Clip Property animation through the property
  // door, line for line on the inspector chokepoint above: refused and no-op
  // plans return false synchronously so the popover reverts its draft, and an
  // accepted change fires one property admission and returns true. The return
  // stays boolean because the inspector prop is typed `(change) => boolean |
  // void` and the draft popover treats anything but false as accepted (#1066).
  const commitV2PropertyAnimationChange = useCallback((clipId: string, frame: ShowV2PropertyAnimationFrame, change: ShowPropertyAnimationChange): boolean => {
    if (recordVersion !== 2 || !savedShowV2 || readOnly) return false
    const capture = preparedV2CaptureRef.current
    if (!capture || capture.prepared.status === 'refused') return false
    const plan = planShowV2PropertyAnimationChange(capture.record, clipId, frame, change, newPersonalContentId)
    if (plan.kind === 'refuse' || plan.kind === 'no-op') return false
    const baseRevision = useShowStore.getState().showRevisions[showId] ?? 0
    void commitV2PropertyEdit({ capture, baseRevision, propertyOwner: plan.propertyOwner, intent: plan.intent })
    return true
  }, [commitV2PropertyEdit, readOnly, recordVersion, savedShowV2, showId])
  // #1075 G3 connects Group-child Property animation through the property
  // door with the definition owner: refused and no-op plans return false
  // synchronously so the popover reverts its draft, and an accepted change
  // fires one property admission and returns true.
  const commitV2GroupPropertyAnimationChange = useCallback((occurrenceId: string, clipId: string, change: ShowPropertyAnimationChange): boolean => {
    if (recordVersion !== 2 || !savedShowV2 || readOnly) return false
    const capture = preparedV2CaptureRef.current
    if (!capture || capture.prepared.status === 'refused') return false
    const plan = planShowV2GroupPropertyAnimationChange(capture.record, occurrenceId, clipId, change, newPersonalContentId)
    if (plan.kind === 'refuse' || plan.kind === 'no-op') return false
    const baseRevision = useShowStore.getState().showRevisions[showId] ?? 0
    void commitV2PropertyEdit({ capture, baseRevision, propertyOwner: plan.propertyOwner, intent: plan.intent })
    return true
  }, [commitV2PropertyEdit, readOnly, recordVersion, savedShowV2, showId])
  // Slice 5b connects the boundary palette's Apply through the same door: the
  // choice is planned exactly as v1 normalizes it, and a new duration retimes
  // the loop inside the same edit (#1066).
  const commitV2BoundaryPaletteApply = useCallback((transitionId: string, item: ShowToolkitPresentationItem, presetId?: string, stageDimensions: 1 | 2 | 3 = 2): boolean => {
    if (recordVersion !== 2 || !savedShowV2 || readOnly) return false
    const capture = preparedV2CaptureRef.current
    if (!capture || capture.prepared.status === 'refused') return false
    const plan = planShowV2BoundaryPaletteApply(capture.record, transitionId, showTransitionChangesForPresentation(item, presetId, stageDimensions), newPersonalContentId)
    if (plan.status !== 'ready') return false
    const baseRevision = useShowStore.getState().showRevisions[showId] ?? 0
    void commitV2TransitionEdit({ capture, baseRevision, intent: plan.intent })
    return true
  }, [commitV2TransitionEdit, readOnly, recordVersion, savedShowV2, showId])
  // Slice 6 chokepoints: a refused or no-op Show-level edit resolves
  // synchronously (or as a resolved false) so the committing surface reverts
  // instead of showing a value that was never stored. The plan reads the
  // prepared capture, never preview state (#1066).
  const commitV2ShowEndTime = useCallback((durationMs: number): Promise<boolean> => {
    if (recordVersion !== 2 || !savedShowV2 || readOnly) return Promise.resolve(false)
    const capture = preparedV2CaptureRef.current
    if (!capture || capture.prepared.status === 'refused') return Promise.resolve(false)
    const plan = planShowV2SetShowEnd(capture.record, durationMs)
    if (plan.kind === 'refuse' || plan.kind === 'no-op') return Promise.resolve(false)
    const baseRevision = useShowStore.getState().showRevisions[showId] ?? 0
    return commitV2SetShowEnd({ capture, baseRevision, intent: plan.intent }).then(
      (outcome) => outcome.status === 'applied',
      () => false,
    )
  }, [commitV2SetShowEnd, readOnly, recordVersion, savedShowV2, showId])
  const commitV2ShowMetadataEdit = useCallback((
    capture: ShowV2PilotPreparedCapture,
    plan: ShowV2ShowMetadataPlan,
  ): boolean | Promise<void> => {
    if (recordVersion !== 2 || !savedShowV2 || readOnly) return false
    if (capture.prepared.status === 'refused') return false
    if (plan.kind === 'refuse' || plan.kind === 'no-op') return false
    const baseRevision = useShowStore.getState().showRevisions[showId] ?? 0
    return commitV2ShowMetadata({ capture, baseRevision, intent: plan.intent }).then(() => {}, () => {})
  }, [commitV2ShowMetadata, readOnly, recordVersion, savedShowV2, showId])
  const commitV2ZonePlan = useCallback((build: (record: ShowRecordV2) => ShowV2ZonePlan): boolean => {
    if (recordVersion !== 2 || !savedShowV2 || readOnly) return false
    const capture = preparedV2CaptureRef.current
    if (!capture || capture.prepared.status === 'refused') return false
    const plan = build(capture.record)
    if (plan.kind === 'refuse' || plan.kind === 'no-op') return false
    if (plan.kind === 'metadata') {
      return commitV2ShowMetadataEdit(capture, plan.plan) !== false
    }
    const baseRevision = useShowStore.getState().showRevisions[showId] ?? 0
    if (plan.kind === 'zone') {
      void commitV2ZoneEdit({ capture, baseRevision, intent: plan.intent })
      return true
    }
    void commitV2LayoutDefinitionEdit({ capture, baseRevision, intent: plan.intent })
    return true
  }, [commitV2LayoutDefinitionEdit, commitV2ShowMetadataEdit, commitV2ZoneEdit, readOnly, recordVersion, savedShowV2, showId])
  const requestDeleteClipV2 = useCallback((clipId: string, connectedDeletionConfirmed = false): boolean => {
    if (recordVersion !== 2 || !savedShowV2 || readOnly) return false
    const capture = preparedV2CaptureRef.current
    if (!capture || capture.prepared.status === 'refused') {
      reportBlockedDelete(`clip:${clipId}`, UNAVAILABLE_CLIP_DELETE_FEEDBACK)
      return true
    }
    const plan = planShowV2ClipDelete(capture.record, clipId, {
      confirmed: connectedDeletionConfirmed,
      allocate: newPersonalContentId,
    })
    if (plan.kind === 'refuse') {
      reportBlockedDelete(
        `clip:${clipId}`,
        plan.reason === 'final-clip' ? LAST_CLIP_DELETE_FEEDBACK : UNAVAILABLE_CLIP_DELETE_FEEDBACK,
      )
      return true
    }
    if (plan.kind === 'needs-confirm') {
      setV2ClipPendingDelete(clipId)
      return true
    }
    const baseRevision = useShowStore.getState().showRevisions[showId] ?? 0
    const selection = { kind: 'clip', clipId } as const
    void commitV2ClipDelete({ capture, baseRevision, intent: plan.intent }).then((outcome) => {
      if (outcome.status === 'applied') {
        closeDetailPanel()
        closePinnedDetailForSelection(selection)
      } else if (outcome.status === 'refused') {
        reportBlockedDelete(`clip:${clipId}`, UNAVAILABLE_CLIP_DELETE_FEEDBACK)
      }
    }).catch(() => {})
    return true
  }, [closeDetailPanel, closePinnedDetailForSelection, commitV2ClipDelete, recordVersion, readOnly, reportBlockedDelete, savedShowV2, showId])
  const requestV2GroupOccurrenceEdit = useCallback((request: ShowV2GroupOccurrenceRequest): boolean | Promise<void> => {
    if (readOnly) return false
    const capture = preparedV2CaptureRef.current
    if (!capture || capture.prepared.status === 'refused') return false
    const plan = planShowV2GroupOccurrenceEdit(capture.record, request, newPersonalContentId)
    if (plan.status !== 'ready') return false
    if (request.kind === 'set-child-inspector-patch' && (plan.removedControls?.length ?? 0) > 0) {
      const occurrence = capture.record.composition.groupOccurrences.find((candidate) => candidate.id === request.occurrenceId)
      const definition = capture.record.composition.groupDefinitions.find((candidate) => candidate.id === occurrence?.definitionId)
      const child = definition?.clips.find((candidate) => candidate.id === request.clipId)
      const effectiveInstanceId = occurrence && definition && child
        ? occurrence.instanceBindings?.[child.instanceId] ?? defaultGroupRuntimeIdV2(definition.id, child.instanceId)
        : undefined
      const controls = effectiveInstanceId ? patternControlsByInstanceIdRef.current[effectiveInstanceId] ?? [] : []
      const labels = new Map(controls.map((control) => [control.exportName, control.label]))
      setPendingV2ControlRemoval({ kind: 'group-clip', occurrenceId: request.occurrenceId, clipId: request.clipId, patch: request.patch,
        lost: plan.removedControls!.map(({ exportName, label }) => ({ exportName, label: labels.get(exportName) ?? label })) })
      return false
    }
    const baseRevision = useShowStore.getState().showRevisions[showId] ?? 0
    const intent = plan.intent
    return commitV2GroupOccurrenceEdit({ capture, baseRevision, intent }).then((applied) => {
      if (!applied) return
      if (intent.kind === 'duplicate-occurrence') {
        selectTimeline({ kind: 'group', occurrenceId: intent.newOccurrenceId })
      } else if (intent.kind === 'ungroup-occurrence') {
        closeDetailPanel()
        closePinnedDetailForSelection({ kind: 'group', occurrenceId: intent.occurrenceId })
      } else if (intent.kind === 'delete-occurrence') {
        closeDetailPanel()
        closePinnedDetailForSelection({ kind: 'group', occurrenceId: intent.occurrenceId })
        setSelection({ kind: 'show' })
      }
    }).then(() => {}, () => {})
  }, [closeDetailPanel, closePinnedDetailForSelection, commitV2GroupOccurrenceEdit, readOnly, selectTimeline, setSelection, showId])
  const requestV2GroupOccurrenceEditApplied = useCallback((request: ShowV2GroupOccurrenceRequest): Promise<boolean> => {
    if (readOnly) return Promise.resolve(false)
    const capture = preparedV2CaptureRef.current
    if (!capture || capture.prepared.status === 'refused') return Promise.resolve(false)
    const plan = planShowV2GroupOccurrenceEdit(capture.record, request, newPersonalContentId)
    if (plan.status !== 'ready') return Promise.resolve(false)
    const baseRevision = useShowStore.getState().showRevisions[showId] ?? 0
    return commitV2GroupOccurrenceEdit({ capture, baseRevision, intent: plan.intent }).then(
      (applied) => applied,
      () => false,
    )
  }, [commitV2GroupOccurrenceEdit, readOnly, showId])
  const targetProfileOwner = recordVersion === 2 ? savedShowV2 : activeShow
  const targetProfileOwnerId = targetProfileOwner?.targetControllerProfileId
  const targetProfile = targetProfileOwner?.outputContract?.kind === 'portable-2d'
    ? undefined
    : targetProfileOwnerId
    ? controllerProfiles.find((profile) => profile.id === targetProfileOwnerId)
    : controllerProfiles[0]
  const activeControllerProfile = activeController
    ? findProfileForLiveController(controllerProfiles, activeController) ?? undefined
    : targetProfile

  const requestDeleteClip = useCallback((
    targetSelection: Extract<ShowSelection, { kind: 'clip' }>,
    composition: ShowCompositionV1 | null | undefined,
    owner: ShowTimelineClipOwner | null,
    connectedDeletionConfirmed = false,
  ): boolean => {
    if (recordVersion === 2) return requestDeleteClipV2(targetSelection.clipId, connectedDeletionConfirmed)
    if (recordVersion !== 1 || !activeShow || readOnly) return false
    if (showRecordClipCount(activeShow) <= 1) {
      reportBlockedDelete(showSelectionKey(targetSelection), LAST_CLIP_DELETE_FEEDBACK)
      return true
    }
    if (!composition || !owner) {
      reportBlockedDelete(showSelectionKey(targetSelection), UNAVAILABLE_CLIP_DELETE_FEEDBACK)
      return true
    }
    if (
      !connectedDeletionConfirmed
      && showLayerTransitionsConnectedToClip(composition, owner.placementId).length > 0
    ) {
      setCompositionClipPendingDelete(owner)
      return true
    }
    const deletion = deleteShowClipInShow(activeShow, composition, owner)
    if (deletion.status !== 'applied') {
      reportBlockedDelete(
        blockedDeleteSelectionKey(composition, owner),
        blockedDeleteCopyForRefusal(activeShow, deletion),
      )
      return true
    }
    closeDetailPanel()
    closePinnedDetailForSelection(targetSelection)
    updateShowInBackground(activeShow.id, { ...deletion.record, updatedAt: Date.now() })
    return true
  }, [activeShow, closeDetailPanel, closePinnedDetailForSelection, readOnly, recordVersion, reportBlockedDelete, requestDeleteClipV2, updateShowInBackground])

  const requestDeleteSelection = useCallback((
    targetSelection: ShowSelection,
    visibleComposition?: ShowCompositionV1 | null,
    visibleSourceCellIdByPlacementId?: Record<string, string>,
  ): boolean => {
    if (recordVersion === 2) {
      if (readOnly) return false
      if (targetSelection.kind === 'group') {
        const occurrenceId = targetSelection.occurrenceId
        const record = preparedV2CaptureRef.current?.record
        if (!record?.composition.groupOccurrences.some((occurrence) => occurrence.id === occurrenceId)) return false
        requestV2GroupOccurrenceEdit({ kind: 'delete-occurrence', occurrenceId })
        return true
      }
      if (targetSelection.kind !== 'clip') return false
      return requestDeleteClipV2(targetSelection.clipId, false)
    }
    if (recordVersion !== 1 || !activeShow || readOnly) return false
    if (targetSelection.kind === 'transition') {
      const transition = activeShow.transitions?.find((candidate) => candidate.id === targetSelection.transitionId)
      if (!transition || transition.kind === 'cut') return false
      closeDetailPanel()
      closePinnedDetailForSelection(targetSelection)
      void removeBoundaryTransition(activeShow.id, transition.id)
      return true
    }
    if (targetSelection.kind === 'clip') {
      const compositionOwner = findTimelineClipOwner(activeShow.composition, targetSelection.clipId)
      const visibleCompositionOwner = findTimelineClipOwner(visibleComposition, targetSelection.clipId)
      const legacyClipId = activeShow.cells.some((cell) => cell.id === targetSelection.clipId)
        ? targetSelection.clipId
        : visibleSourceCellIdByPlacementId?.[targetSelection.clipId]
      const legacyClipExists = Boolean(
        legacyClipId && activeShow.cells.some((cell) => cell.id === legacyClipId),
      )
      if (!compositionOwner && !visibleCompositionOwner && !legacyClipExists) {
        return requestDeleteClip(targetSelection, null, null)
      }
      return requestDeleteClip(
        targetSelection,
        activeShow.composition ?? visibleComposition,
        compositionOwner ?? visibleCompositionOwner,
      )
    }
    if (targetSelection.kind === 'group') {
      if (!activeShow.composition?.groupOccurrences?.some((occurrence) => occurrence.id === targetSelection.occurrenceId)) return false
      const composition = deleteShowGroupOccurrence(activeShow.composition, targetSelection.occurrenceId)
      if (composition === activeShow.composition) return false
      closeDetailPanel()
      closePinnedDetailForSelection(targetSelection)
      setSelection({ kind: 'show' })
      updateShowInBackground(activeShow.id, { ...activeShow, composition, updatedAt: Date.now() })
      return true
    }
    if (targetSelection.kind === 'zone') {
      if (activeShow.zones.length <= 1 || !activeShow.zones.some((zone) => zone.id === targetSelection.zoneId)) return false
      closeDetailPanel()
      closePinnedDetailForSelection(targetSelection)
      void removeZone(activeShow.id, targetSelection.zoneId)
      return true
    }
    return false
  }, [activeShow, closeDetailPanel, closePinnedDetailForSelection, readOnly, recordVersion, removeBoundaryTransition, removeZone, requestDeleteClip, requestDeleteClipV2, requestV2GroupOccurrenceEdit, setSelection, updateShowInBackground])
  useEffect(() => {
    if (!blockedDeleteFeedback) return
    const timeout = window.setTimeout(() => setBlockedDeleteFeedback(null), 1100)
    return () => window.clearTimeout(timeout)
  }, [blockedDeleteFeedback])

  useEffect(() => registerShowEscapeLayer({
    rank: SHOW_ESCAPE_LAYER_RANK.editorSurfaces,
    onEscape: () => {
      if (transitionPaletteId !== null) return false
      if (!detailPanelOpen && !pinnedDetail && !isolatedGroupOccurrenceId && selection.kind === 'show') return false
      // Exiting Group isolation is one surface, not two peels: an open Detail
      // panel belongs to the isolated context and cannot outlive it, so one
      // press tears both down together (#587, preserved by #672).
      if (isolatedGroupOccurrenceId) {
        closeDetailPanel(true)
        setPinnedDetail(null)
        setIsolatedGroupOccurrenceId(null)
        setSelection({ kind: 'group', occurrenceId: isolatedGroupOccurrenceId })
        window.setTimeout(() => timelineWorkspaceRef.current?.focus(), 0)
        return true
      }
      if (detailPanelOpen || pinnedDetail) {
        closeDetailPanel(true)
        setPinnedDetail(null)
        return true
      }
      setSelection({ kind: 'show' })
      window.setTimeout(() => timelineWorkspaceRef.current?.focus(), 0)
      return true
    },
  }), [closeDetailPanel, detailPanelOpen, isolatedGroupOccurrenceId, pinnedDetail, selection.kind, setSelection, transitionPaletteId])
  useEffect(() => {
    if (!detailPanelOpen) return
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('[role="dialog"], [role="alertdialog"], [data-show-detail-owned-portal="true"], [data-show-detail-pointer-preserve="true"]')) return
      if (target.closest(`[data-show-selection-key="${showSelectionKey(selection)}"]`)) return
      closeDetailPanel()
    }
    document.addEventListener('pointerdown', handleOutsidePointerDown, true)
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown, true)
  }, [closeDetailPanel, detailPanelOpen, selection])
  // The Stage map belongs to whichever record backs the editor; Place is offered
  // on a 2D Stage either way (#1065).
  const backingStageMapId = recordVersion === 2 ? savedShowV2?.stageMapId : activeShow?.stageMapId
  const savedStageMap = backingStageMapId
    ? [...STOCK_MAPS, ...userMaps].find((map) => map.id === backingStageMapId)
    : undefined
  const stageDimension = savedStageMap?.dim
  const savedStageFixedCount = savedStageMap
    ? 'generator' in savedStageMap
      ? savedStageMap.generator === 'custom' ? savedStageMap.points?.length : undefined
      : savedStageMap.bakedCount
    : undefined
  const spatialRoutingLayout = recordVersion === 2
    ? savedShowV2?.zoneLayouts.find((candidate) => !candidate.logical)
    : activeShow?.routingLayouts.find((candidate) => !candidate.logical)
  const spatialBackingContract = recordVersion === 2 ? savedShowV2?.outputContract : activeShow?.outputContract
  const spatialSelectionUnavailableReason = spatialBackingContract?.kind === 'installation'
    ? !spatialRoutingLayout
      ? 'Spatial selection needs a physical routing layout.'
      : !savedStageMap
      ? 'Spatial selection needs a saved output map.'
      : savedStageMap.dim !== 2
        ? `Spatial selection is unavailable for ${savedStageMap.dim}D maps.`
        : savedStageFixedCount !== undefined && savedStageFixedCount !== spatialBackingContract.pixelCount
          ? `Spatial selection needs the map's ${savedStageFixedCount} points to match the ${spatialBackingContract.pixelCount}-pixel output.`
          : null
    : null
  const compilationControllerZones = useMemo(
    () => activeShow ? resolveShowCompilationControllerZones(activeShow) : undefined,
    [activeShow],
  )
  const artifactCompilationInput = useMemo(() => activeShow ? {
    show: activeShow,
    userPatterns,
    libraries: compileLibrarySet,
    controllerZones: compilationControllerZones,
    stageDimension,
    targetPixelCount: activeShow.outputContract?.kind === 'portable-2d'
      ? activeControllerProfile?.lastKnownPixelCount
      : undefined,
  } : null, [
    activeControllerProfile?.lastKnownPixelCount,
    activeShow,
    compilationControllerZones,
    compileLibrarySet,
    stageDimension,
    userPatterns,
  ])
  const [deferredArtifactCompilationInput, setDeferredArtifactCompilationInput] = useState(artifactCompilationInput)
  useEffect(() => {
    if (deferredArtifactCompilationInput === artifactCompilationInput) return
    const timeout = window.setTimeout(() => setDeferredArtifactCompilationInput(artifactCompilationInput), 0)
    return () => window.clearTimeout(timeout)
  }, [artifactCompilationInput, deferredArtifactCompilationInput])
  const artifactCompilationReady = artifactCompilationInput === deferredArtifactCompilationInput
  const effectiveArtifactCompilationInput =
    deferredArtifactCompilationInput?.show.id === showId
      ? deferredArtifactCompilationInput
      : null
  const compiledShow = effectiveArtifactCompilationInput?.show ?? null
  // The authored-v2 artifact comes from the same closed preparation the Stage
  // reads, so the Source code readout and its diagnostics describe one compile
  // rather than a second editor-local one (#1065).
  const compiled = useMemo<CompiledShowState>(() => {
    if (recordVersion === 2) {
      const prepared = presentationV2Capture?.prepared
      // The tray banner and its View code/Download gating read artifactBlocker
      // exactly as on v1, so the v2 Installation coverage verdict surfaces
      // there while artifact and error stay as prepared (#1066).
      const artifactBlocker = savedShowV2
        ? installationCoverageBlockingMessage(validateInstallationCoverageV2(savedShowV2)) ?? undefined
        : undefined
      if (prepared?.status === 'ready') return { artifact: prepared.bundle.artifact, error: null, artifactBlocker }
      return { artifact: null, error: prepared?.status === 'refused' ? prepared.message : null, artifactBlocker }
    }
    return effectiveArtifactCompilationInput
      ? compileShowForArtifact(
          effectiveArtifactCompilationInput.show,
          effectiveArtifactCompilationInput.userPatterns,
          effectiveArtifactCompilationInput.controllerZones,
          effectiveArtifactCompilationInput.libraries,
          {
            stageDimension: effectiveArtifactCompilationInput.stageDimension,
            targetPixelCount: effectiveArtifactCompilationInput.targetPixelCount,
          },
        )
      : { artifact: null, error: null }
  }, [effectiveArtifactCompilationInput, presentationV2Capture, recordVersion, savedShowV2])
  const patternControlsByCellId = useMemo(() => Object.fromEntries((activeShow?.cells ?? []).map((cell) => {
    const saved = cell.pattern.kind === 'user'
      ? userPatterns.find((pattern) => pattern.id === cell.pattern.id)?.controls ?? {}
      : {}
    try {
      return [cell.id, discoverAutomatablePatternControls(sourceForShowCell(cell, userPatterns), saved, cell.pattern.kind === 'stock' ? resolveStockPatternId(cell.pattern.id) : undefined)]
    } catch {
      return [cell.id, []]
    }
  })), [activeShow, userPatterns]) as Record<string, AutomatablePatternControl[]>
  const timelineProjection = useMemo<{
    composition: ShowCompositionV1
    sourceCellIdByPlacementId: Record<string, string>
  } | null>(() => {
    if (!activeShow) return null
    if (activeShow.composition) {
      return {
        composition: activeShow.composition,
        sourceCellIdByPlacementId: {},
      }
    }
    try {
      const projection = projectFlatShowToCompositionV1WithCellOrigins(activeShow, {
        byCellId: Object.fromEntries(activeShow.cells.map((cell) => {
          const source = cell.pattern.kind === 'user'
            ? userPatterns.find((pattern) => pattern.id === cell.pattern.id)?.src
            : DEMOS[resolveStockPatternId(cell.pattern.id)]
          if (source === undefined) throw new Error(`Pattern source unavailable for Clip ${cell.id}.`)
          return [cell.id, source]
        })),
        stageDimension,
      })
      return {
        ...projection,
        composition: {
          ...projection.composition,
          executionModel: 'deterministic-loop',
        },
      }
    } catch {
      return null
    }
  }, [activeShow, stageDimension, userPatterns])
  const timelineComposition = timelineProjection?.composition ?? null
  const manualResizeSourceRef = useRef({ activeShow, timelineComposition })
  manualResizeSourceRef.current = { activeShow, timelineComposition }
  useLayoutEffect(() => {
    const updateOverflow = () => {
      const scroll = showEditorPaneRef.current?.querySelector<HTMLElement>('[data-testid="show-editor-scroll"]')
      setTimelineMoreBelow(Boolean(scroll && scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop > 1))
    }
    const measure = () => {
      const root = showEditorPaneRef.current
      const toolbar = root?.querySelector<HTMLElement>('[data-testid="show-timeline-toolbar"]')
      const timelineGrid = root?.querySelector<HTMLElement>('[data-testid="show-timeline-grid"]')
      const footer = root?.querySelector<HTMLElement>('[data-testid="show-compile-bar"]')
      const scroll = root?.querySelector<HTMLElement>('[data-testid="show-editor-scroll"]')
      const section = timelineWorkspaceRef.current
      if (!root || !toolbar || !timelineGrid || !scroll || !section) return

      const rootTop = root.getBoundingClientRect().top
      const sectionRect = section.getBoundingClientRect()
      const padding = window.getComputedStyle(section.parentElement!)
      const footerHeight = footer?.getBoundingClientRect().height ?? 0
      const rowGap = Number.parseFloat(window.getComputedStyle(timelineGrid).rowGap) || 0
      // Preserve transport chrome, not lane content. Expanded animation rows
      // scroll rather than forcing the user's preview smaller (#1006).
      onTimelineMinimumHeightChange?.(measureShowTimelineMinimumHeight({
        editorTop: rootTop,
        toolbarBottom: toolbar.getBoundingClientRect().bottom + scroll.scrollTop,
        fixedFooterHeight: footerHeight,
      }))
      // Automatic fitting includes the visible Live strip and all lanes. Undo scroll
      // translation rather than measuring the scroll viewport's assigned size.
      const tail = timelineGrid.querySelector<HTMLElement>('[data-show-timeline-tail]')
      const contentBottom = tail ? tail.getBoundingClientRect().top - rowGap : sectionRect.bottom
      onTimelineContentHeightChange?.(
        Math.ceil(sectionRect.bottom - rootTop + scroll.scrollTop
          + (Number.parseFloat(padding.paddingBottom) || 0) + footerHeight),
        Math.ceil(contentBottom - rootTop + scroll.scrollTop + footerHeight),
      )
    }

    measure()
    updateOverflow()
    const frame = window.requestAnimationFrame(measure)
    const observer = new ResizeObserver(() => { measure(); updateOverflow() })
    const root = showEditorPaneRef.current
    const scroll = root?.querySelector<HTMLElement>('[data-testid="show-editor-scroll"]')
    scroll?.addEventListener('scroll', updateOverflow, { passive: true })
    if (root) {
      observer.observe(root)
      const measuredChildren = [
        timelineWorkspaceRef.current,
        root.querySelector<HTMLElement>('[data-testid="show-editor-scroll"]'),
        root.querySelector<HTMLElement>('[data-testid="show-timeline-toolbar"]'),
        root.querySelector<HTMLElement>('[data-testid="show-timeline-grid"]'),
        root.querySelector<HTMLElement>('[data-testid="show-compile-bar"]'),
        ...root.querySelectorAll<HTMLElement>('[data-show-zone-id]'),
      ]
      for (const child of measuredChildren) {
        if (child) observer.observe(child)
      }
    }
    return () => {
      scroll?.removeEventListener('scroll', updateOverflow)
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [onTimelineMinimumHeightChange, onTimelineContentHeightChange, showId, showNoteOpen, timelineComposition])
  useEffect(() => {
    // The v2 backing names the authored Clip, and inside a Group the occurrence
    // that owns it, so the Stage outline survives edits and history (#1065).
    if (recordVersion === 2) {
      if (!savedShowV2) {
        setDiagnosticFocus(null)
        return
      }
      if (selection.kind === 'clip') {
        const clip = savedShowV2.composition.clips.find((candidate) => candidate.id === selection.clipId)
        if (clip) {
          setDiagnosticFocus({
            recordVersion: 2,
            showId: savedShowV2.id,
            zoneId: clip.zoneId,
            clipId: clip.id,
            occurrenceId: null,
          })
          return
        }
      }
      if (selection.kind === 'group-clip') {
        const occurrence = savedShowV2.composition.groupOccurrences
          .find((candidate) => candidate.id === selection.occurrenceId)
        if (occurrence) {
          setDiagnosticFocus({
            recordVersion: 2,
            showId: savedShowV2.id,
            zoneId: occurrence.zoneId,
            clipId: selection.placementId,
            occurrenceId: occurrence.id,
          })
          return
        }
      }
      setDiagnosticFocus(null)
      return
    }
    if (!activeShow) {
      setDiagnosticFocus(null)
      return
    }

    if (selection.kind === 'clip') {
      const owner = findTimelineClipOwner(timelineComposition, selection.clipId)
      const sourceCellId = timelineProjection?.sourceCellIdByPlacementId[selection.clipId]
      const cell = activeShow.cells.find((candidate) => candidate.id === (sourceCellId ?? selection.clipId))
      if (owner) {
        setDiagnosticFocus({
          showId: activeShow.id,
          sceneId: owner.sceneId,
          zoneId: owner.zoneId,
          placementId: sourceCellId ?? owner.placementId,
        })
        return
      }
      if (cell) {
        setDiagnosticFocus({
          showId: activeShow.id,
          sceneId: cell.sceneId,
          zoneId: cell.zoneId,
          placementId: cell.id,
        })
        return
      }
    }

    if (selection.kind === 'group-clip') {
      const occurrence = timelineComposition?.groupOccurrences
        ?.find((candidate) => candidate.id === selection.occurrenceId)
      if (occurrence) {
        setDiagnosticFocus({
          showId: activeShow.id,
          sceneId: occurrence.sceneId,
          zoneId: occurrence.zoneId,
          placementId: `${occurrence.id}:${selection.placementId}`,
        })
        return
      }
    }

    setDiagnosticFocus(null)
  }, [activeShow, recordVersion, savedShowV2, selection, setDiagnosticFocus, timelineComposition, timelineProjection?.sourceCellIdByPlacementId])
  // Controls are discovered from the Pattern source, so each backing only has to
  // name its own runtime instances; the discovery below is shared (#1065).
  const controlSourceInstances = useMemo(() => {
    if (recordVersion === 2) {
      return lessonProjectionV2
        ? materializeShowGroupsV2(lessonProjectionV2).composition.patternInstances
          .map((instance) => ({ id: instance.id, pattern: instance.pattern }))
        : []
    }
    return timelineComposition
      ? [
          ...timelineComposition.patternInstances,
          ...projectShowGroupRuntimePatternInstances(timelineComposition),
        ].map((instance) => ({ id: instance.id, pattern: instance.pattern }))
      : []
  }, [recordVersion, lessonProjectionV2, timelineComposition])
  const patternControlsByInstanceId = useMemo(() => Object.fromEntries(controlSourceInstances.map((instance) => {
    try {
      return [instance.id, discoverAutomatablePatternControls(sourceForShowPatternRef(instance.pattern, userPatterns), {}, instance.pattern.kind === 'stock' ? resolveStockPatternId(instance.pattern.id) : undefined)]
    } catch {
      return [instance.id, []]
    }
  })), [controlSourceInstances, userPatterns]) as Record<string, AutomatablePatternControl[]>
  patternControlsByInstanceIdRef.current = patternControlsByInstanceId
  useEffect(() => {
    const handleDelete = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      const target = event.target
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) return
      if (requestDeleteSelection(
        selection,
        timelineComposition,
        timelineProjection?.sourceCellIdByPlacementId,
      )) event.preventDefault()
    }
    document.addEventListener('keydown', handleDelete)
    return () => document.removeEventListener('keydown', handleDelete)
  }, [requestDeleteSelection, selection, timelineComposition, timelineProjection?.sourceCellIdByPlacementId])
  useEffect(() => {
    if (!isolatedGroupOccurrenceId) return
    // Isolation survives only while its Group still resolves. The authored-v2
    // record answers that from its own composition; reading the v1 sidecar
    // there would bounce straight back out of an isolation that is valid.
    const occurrence = recordVersion === 2
      ? savedShowV2?.composition.groupOccurrences
        .find((candidate) => candidate.id === isolatedGroupOccurrenceId)
      : timelineComposition?.groupOccurrences
        ?.find((candidate) => candidate.id === isolatedGroupOccurrenceId)
    const definition = recordVersion === 2
      ? savedShowV2?.composition.groupDefinitions
        .find((candidate) => candidate.id === occurrence?.definitionId)
      : timelineComposition?.groupDefinitions
        ?.find((candidate) => candidate.id === occurrence?.definitionId)
    if (occurrence && definition) return
    const timeout = window.setTimeout(() => {
      closeDetailPanel()
      setIsolatedGroupOccurrenceId(null)
      setSelection({ kind: 'show' })
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [closeDetailPanel, isolatedGroupOccurrenceId, recordVersion, savedShowV2, setSelection, timelineComposition])
  useEffect(() => {
    if (!activeShow) return
    const pinnedSelectionMissing = Boolean(
      pinnedDetail && !showSelectionExists(activeShow, timelineComposition, pinnedDetail.selection),
    )
    const transientSelectionMissing = detailPanelOpen
      && !showSelectionExists(activeShow, timelineComposition, selection)
    if (!pinnedSelectionMissing && !transientSelectionMissing) return
    const timeout = window.setTimeout(() => {
      if (pinnedSelectionMissing) setPinnedDetail(null)
      if (transientSelectionMissing) {
        closeDetailPanel()
        setSelection({ kind: 'show' })
      }
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [activeShow, closeDetailPanel, detailPanelOpen, pinnedDetail, selection, setSelection, timelineComposition])
  const propertyLanesV2 = useMemo(() => (
    recordVersion === 2 && lessonProjectionV2
      ? projectShowEditorPropertyLanesV2(lessonProjectionV2, Object.values(patternControlsByInstanceId).flat())
      : null
  ), [patternControlsByInstanceId, recordVersion, lessonProjectionV2])
  const sampleRepeatAtV2 = useMemo(() => (
    recordVersion === 2 && lessonProjectionV2 && showV2SampleRepeatLaneVisible(lessonProjectionV2)
      ? (timeMs: number) => repeatScaleAt(lessonProjectionV2, timeMs)
      : null
  ), [recordVersion, lessonProjectionV2])
  const zoneMapV2 = useMemo(() => (
    recordVersion === 2 && lessonProjectionV2 ? projectShowEditorZoneMapV2(lessonProjectionV2) : null
  ), [recordVersion, lessonProjectionV2])
  const inspectorShow = activeShow && timelineComposition && !activeShow.composition
    ? { ...activeShow, composition: timelineComposition }
    : activeShow
  const layerTransitionPlan = activeShow && timelineComposition && layerTransitionTarget?.legacy
    ? layerTransitionTarget.groupOccurrenceId
      ? planShowGroupLayerTransitionInsertion(activeShow, timelineComposition, {
          occurrenceId: layerTransitionTarget.groupOccurrenceId,
          fromPlacementId: layerTransitionTarget.legacy.fromPlacementId,
          toPlacementId: layerTransitionTarget.legacy.toPlacementId,
        })
      : planShowLayerTransitionInsertion(activeShow, timelineComposition, {
          fromPlacementId: layerTransitionTarget.legacy.fromPlacementId,
          toPlacementId: layerTransitionTarget.legacy.toPlacementId,
        })
    : recordVersion === 2 && layerTransitionTarget?.v2Cut && savedShowV2
      ? planShowV2LayerTransitionInsertion(preparedV2Capture?.record ?? savedShowV2, layerTransitionTarget.v2Cut.junctionKey)
      : recordVersion === 2 && layerTransitionTarget?.v2GroupCut && savedShowV2
        ? planShowV2GroupLayerTransitionInsertion(
            preparedV2Capture?.record ?? savedShowV2,
            layerTransitionTarget.v2GroupCut.occurrenceId,
            layerTransitionTarget.v2GroupCut.fromClipId,
            layerTransitionTarget.v2GroupCut.toClipId,
          )
        : null
  const pendingConnectedTransitions = timelineComposition && compositionClipPendingDelete
    ? showLayerTransitionsConnectedToClip(timelineComposition, compositionClipPendingDelete.placementId)
    : []
  const pendingConnectedTransitionsV2 = savedShowV2 && v2ClipPendingDelete
    ? showV2ConnectedTransitionIds(savedShowV2, v2ClipPendingDelete)
    : []
  const pendingConnectedCount = compositionClipPendingDelete
    ? pendingConnectedTransitions.length
    : pendingConnectedTransitionsV2.length
  const declaredSliderNamesFor = (ref: ShowPatternRef) => declaredPatternSliderNames(
    ref.kind === 'stock' ? DEMOS[resolveStockPatternId(ref.id)] : userPatterns.find(pattern => pattern.id === ref.id)?.src,
  )
  const commitClipInspectorPatch = (owner: ShowClipInspectorOwner, patch: ShowClipInspectorPatch) => {
    if (!activeShow || !inspectorShow) return false
    const controlPattern = patch.pattern?.ref ?? (patch.simulation?.controlTargets ? projectShowClipInspector(inspectorShow, owner)?.pattern : undefined)
    const next = updateShowClipInspector(
      inspectorShow,
      owner,
      patch,
      controlPattern ? (patch.pattern ? exportedSliderNamesFor(controlPattern) : declaredSliderNamesFor(controlPattern)) : undefined,
    )
    return next !== inspectorShow ? Promise.resolve(updateShow(activeShow.id, next)) : false
  }
  const commitGroupClipInspectorPatch = (owner: ShowGroupClipOwner, patch: ShowClipInspectorPatch) => {
    if (!activeShow) return false
    const next = updateShowGroupClipInspector(
      activeShow,
      owner,
      patch,
      patch.pattern ? exportedSliderNamesFor(patch.pattern.ref) : undefined,
    )
    if (next === activeShow || !next.composition || validateShowGroups(next, next.composition).length > 0) return false
    return Promise.resolve(updateShow(activeShow.id, next))
  }
  const previewClipInspectorPatch = (owner: ShowClipInspectorOwner, patch: ShowClipInspectorPatch) => {
    if (!inspectorShow) return
    const controlPattern = patch.pattern?.ref ?? (patch.simulation?.controlTargets ? projectShowClipInspector(inspectorShow, owner)?.pattern : undefined)
    const next = updateShowClipInspector(
      inspectorShow,
      owner,
      patch,
      controlPattern ? (patch.pattern ? exportedSliderNamesFor(controlPattern) : declaredSliderNamesFor(controlPattern)) : undefined,
    )
    if (next !== inspectorShow) useShowPreviewOverrideStore.getState().preview(next)
  }
  const previewGroupClipInspectorPatch = (owner: ShowGroupClipOwner, patch: ShowClipInspectorPatch) => {
    if (!activeShow) return
    const next = updateShowGroupClipInspector(
      activeShow,
      owner,
      patch,
      patch.pattern ? exportedSliderNamesFor(patch.pattern.ref) : undefined,
    )
    if (next !== activeShow && next.composition && validateShowGroups(next, next.composition).length === 0) {
      useShowPreviewOverrideStore.getState().preview(next)
    }
  }
  const endInspectorPreview = () => {
    if (activeShow) useShowPreviewOverrideStore.getState().clear(activeShow.id)
  }
  // The delivered-source inventory the gauge reports is measured from the same
  // export the Show would deliver, so each backing measures its own record
  // through its own export owner rather than the artifact bytes alone (#1065).
  const inspectableShowExport = useMemo(() => {
    if (!compiled.artifact) return null
    if (recordVersion === 2) {
      if (!lessonProjectionV2) return null
      const exported = buildShowEpeExportV2(lessonProjectionV2, compiled.artifact.code, {
        stampedAt: new Date(lessonProjectionV2.updatedAt),
        userMaps,
        attribution: compiled.artifact.attribution,
      })
      return exported.status === 'exported' ? exported : null
    }
    return compiledShow
      ? buildShowEpeExport(compiledShow, compiled.artifact.code, {
          stampedAt: new Date(compiledShow.updatedAt),
          userMaps,
          attribution: compiled.artifact.attribution,
        })
      : null
  }, [compiledShow, compiled.artifact, recordVersion, lessonProjectionV2, userMaps])
  // The pressure numerator is the delivered total (generated source plus
  // delivery header) — the same bytes the gauge and inventory report (#63).
  const compilePressure = useMemo(() => compiled.artifact
    ? assessShowCompilePressure({
        deliveredSourceBytes: inspectableShowExport
          ? deliveredShowSourceBytes(inspectableShowExport.source)
          : compiled.artifact.summary.artifactBytes,
        budgetBytes: compiled.artifact.summary.measuredDeviceBudgetBytes,
        worstInstantRenderersPerPixel: compiled.artifact.summary.worstInstantRenderersPerPixel,
      })
    : null, [compiled.artifact, inspectableShowExport])
  const showExport = !compiled.artifactBlocker && compilePressure?.status !== 'blocked'
    ? inspectableShowExport
    : null
  const artifactInventory = useMemo(() => {
    if (!compiled.artifact || !inspectableShowExport) return null
    const describedRecord = recordVersion === 2 ? lessonProjectionV2 : compiledShow
    if (!describedRecord) return null
    const inventory = buildDeliveredShowSourceInventory(
      compiled.artifact.summary.sourceInventory,
      compiled.artifact.code,
      inspectableShowExport.source,
    )
    return {
      inventory,
      model: buildShowArtifactInventoryModel(inventory, {
        patterns: recordVersion === 2
          ? describeShowArtifactPatternUses(
              projectShowEditorArtifactPatternUsesV2(describedRecord as ShowRecordV2),
              inventory,
            )
          : describeShowArtifactPatterns(describedRecord as ShowRecord, inventory),
        budgetBytes: compiled.artifact.summary.measuredDeviceBudgetBytes,
      }),
    }
  }, [compiledShow, compiled.artifact, inspectableShowExport, recordVersion, lessonProjectionV2])
  const activeControllerMapDim = activeController?.mapDim ?? null
  const showArtifactId = `show:${showId}`
  const showControllerPushResult = controllerArtifactPushResult?.artifactId === showArtifactId
    ? controllerArtifactPushResult
    : null
  const activeControllerFirmware = activeController?.firmwareVersion
  const activeInstalledMap = activeController?.phase === 'live'
    ? activeController.installedMap
    : activeControllerProfile?.lastKnownInstalledMap
  const controllerCompatibilityContext = useMemo(
    () => buildShowControllerCompatibilityContext(activeControllerProfile, userMaps, activeInstalledMap, STOCK_MAPS),
    [activeControllerProfile, activeInstalledMap, userMaps],
  )
  const preparedControllerArtifact = useMemo(() => {
    if (compiled.artifactBlocker) {
      return { value: null, error: compiled.artifactBlocker }
    }
    if (!inspectableShowExport) return { value: null, error: null }
    try {
      const prepared = prepareShowControllerArtifact(
        inspectableShowExport.source,
        activeControllerMapDim,
        activeControllerFirmware,
        controllerCompatibilityContext,
      )
      // Preparation can append a renderer adapter, so re-measure the source
      // the Controller actually receives (#63 review follow-up). Bytes only:
      // renderer pressure was already assessed in compilePressure above.
      const preparedPressure = compiled.artifact
        ? assessShowCompilePressure({
            deliveredSourceBytes: deliveredShowSourceBytes(prepared.source),
            budgetBytes: compiled.artifact.summary.measuredDeviceBudgetBytes,
            worstInstantRenderersPerPixel: 0,
          })
        : null
      if (preparedPressure?.status === 'blocked') {
        return { value: null, error: preparedPressure.blocks.join(' ') }
      }
      return { value: prepared, error: null }
    } catch (error) {
      return {
        value: null,
        error: error instanceof Error ? error.message : 'Could not prepare Show for Controller',
      }
    }
  }, [activeControllerFirmware, activeControllerMapDim, compiled.artifact, compiled.artifactBlocker, controllerCompatibilityContext, inspectableShowExport])
  const preparedDeliverySnapshot = useMemo<ShowDeliverySnapshot | null>(() => {
    if (
      !artifactCompilationReady
      || !deliveryControllerSession
      || !compiledShow
      || !compiled.artifact
      || compiled.artifactBlocker
      || compilePressure?.status === 'blocked'
      || !preparedControllerArtifact.value
    ) return null
    return {
      show: compiledShow,
      controllerIp: activeIp,
      controllerSession: deliveryControllerSession,
      artifact: compiled.artifact,
      prepared: preparedControllerArtifact.value,
    }
  }, [
    activeIp,
    artifactCompilationReady,
    compiled.artifact,
    compiled.artifactBlocker,
    compiledShow,
    compilePressure?.status,
    deliveryControllerSession,
    preparedControllerArtifact.value,
  ])
  useLayoutEffect(() => {
    // Event handlers and async preview generation must validate against the
    // latest committed snapshot, not the render that opened a confirmation.
    // Layout timing closes the window before a user can confirm the new UI.
    preparedDeliverySnapshotRef.current = preparedDeliverySnapshot
    return () => { preparedDeliverySnapshotRef.current = null }
  }, [preparedDeliverySnapshot])
  useEffect(() => {
    const pendingDelivery = pendingDeliveryRef.current
    if (!pendingDelivery || pendingDelivery === preparedDeliverySnapshot) return
    pendingDeliveryRef.current = null
    setPendingSendMode(null)
  }, [preparedDeliverySnapshot])
  const measuredControllerDelivery = useMemo(() => {
    if (!activeController || !preparedControllerArtifact.value) return null
    try {
      return prepareControllerArtifactDelivery({
        source: preparedControllerArtifact.value.source,
        profile: activeControllerProfile,
        artifactId: showArtifactId,
      })
    } catch {
      return null
    }
  }, [activeController, activeControllerProfile, preparedControllerArtifact.value, showArtifactId])
  const compileBarControllerDelivery = measuredControllerDelivery && artifactInventory
    ? {
        totalBytes: deliveredShowSourceBytes(measuredControllerDelivery.source),
        transformBytes: Math.max(
          0,
          deliveredShowSourceBytes(measuredControllerDelivery.source) - artifactInventory.inventory.totalBytes,
        ),
      }
    : null
  const compileBarPushResult = preparedControllerArtifact.error
    && preparedControllerArtifact.error !== compiled.artifactBlocker
    ? preparedControllerArtifact.error
    : showControllerPushResult?.ok
      ? 'Sent to Controller'
      : null

  const buildCurrentCompilationSnapshot = (): ShowCompilationSnapshot | null => {
    if (recordVersion === 2) {
      const record = lessonProjectionV2
      const v2Artifact = compiled.artifact
      if (!record || !v2Artifact || compiled.artifactBlocker) return null
      const v2Maps = useMapStore.getState().userMaps
      const exportWith = (options: ShowEpeExportOptions): ShowEpeExport | null => {
        const result = buildShowEpeExportV2(record, v2Artifact.code, {
          userMaps: v2Maps,
          attribution: v2Artifact.attribution,
          ...options,
        })
        return result.status === 'exported' ? result : null
      }
      const canonicalExport = exportWith({ stampedAt: new Date(record.updatedAt) })
      if (!canonicalExport) return null
      return {
        showId: record.id,
        name: record.name,
        stampedAt: record.updatedAt,
        artifact: v2Artifact,
        canonicalExport,
        exportWith,
      }
    }
    const showState = useShowStore.getState()
    const resolvedShow = showState.resolveEditableShow(showId)
    const currentPatterns = usePatternStore.getState().userPatterns
    const currentLibrarySet = compileLibraries(LIBRARIES, useLibraryStore.getState().userLibraries)
    let currentShow = resolvedShow ?? activeShow
    const referencePatterns = useShowEditorSessionStore.getState().referencePatternsByShowId[showId]
    if (currentShow && referencePatterns && builtInSlotGroups) {
      currentShow = applyShowPatternSlotSelections(currentShow, builtInSlotGroups, referencePatterns, (ref) => (
        ref.kind === 'stock' ? resolveStockPatternId(ref.id) : currentPatterns.find((pattern) => pattern.id === ref.id)?.name
      ), (ref) => bundledPatternSliderNames(sourceForShowPatternRef(ref, currentPatterns), currentLibrarySet))
    }
    if (!currentShow) return null

    const currentMaps = useMapStore.getState().userMaps
    const currentProfiles = useControllerProfileStore.getState().profiles
    const controllerState = useControllerStore.getState()
    const currentActiveIp = controllerState.activeIp
    const currentController = currentActiveIp ? controllerState.controllers[currentActiveIp] : undefined
    const currentTargetProfile = currentShow.outputContract?.kind === 'portable-2d'
      ? undefined
      : currentShow.targetControllerProfileId
        ? currentProfiles.find((profile) => profile.id === currentShow.targetControllerProfileId)
        : currentProfiles[0]
    const currentActiveProfile = currentController
      ? findProfileForLiveController(currentProfiles, currentController) ?? undefined
      : currentTargetProfile
    const currentStageMap = currentShow.stageMapId
      ? [...STOCK_MAPS, ...currentMaps].find((map) => map.id === currentShow.stageMapId)
      : undefined
    const currentCompiled = compileShowForArtifact(
      currentShow,
      currentPatterns,
      resolveShowCompilationControllerZones(currentShow),
      currentLibrarySet,
      {
        stageDimension: currentStageMap?.dim,
        targetPixelCount: currentShow.outputContract?.kind === 'portable-2d'
          ? currentActiveProfile?.lastKnownPixelCount
          : undefined,
      },
    )
    if (!currentCompiled.artifact || currentCompiled.artifactBlocker) return null
    const show = currentShow
    const artifact = currentCompiled.artifact
    const canonicalExport = buildShowEpeExport(show, artifact.code, {
      stampedAt: new Date(show.updatedAt),
      userMaps: currentMaps,
      attribution: artifact.attribution,
    })
    const exportWith = (options: ShowEpeExportOptions): ShowEpeExport | null => buildShowEpeExport(show, artifact.code, {
      userMaps: currentMaps,
      attribution: artifact.attribution,
      ...options,
    })
    // No pressure gate here: blocked output must stay previewable and
    // inspectable (View code). Export and delivery paths gate themselves.
    return {
      showId: show.id,
      name: show.name,
      stampedAt: show.updatedAt,
      artifact,
      canonicalExport,
      exportWith,
    }
  }

  useEffect(() => {
    if (!showControllerPushResult?.ok) return
    const timeout = window.setTimeout(clearArtifactPushResult, 3500)
    return () => window.clearTimeout(timeout)
  }, [clearArtifactPushResult, showControllerPushResult])
  const buildDownloadExport = async (): Promise<ShowEpeExport | null> => {
    const compilation = buildCurrentCompilationSnapshot()
    if (!compilation) return null
    const preview = await buildPreviewJpeg(compilation.artifact)
    if (!preview) throw new Error('Could not render the EPE preview image')
    return compilation.exportWith({
      id: makeProgramId(),
      preview: bytesToBase64(preview),
      stampedAt: new Date(compilation.stampedAt),
    })
  }

  const pendingDelivery = (
    pendingDeliveryRef.current?.show.id === showId
    && pendingDeliveryRef.current.controllerIp === activeIp
  )
    ? pendingDeliveryRef.current
    : null
  const preparedSource = preparedControllerArtifact.value?.source ?? ''
  const preparedProfileSignature = controllerProfileArtifactSignature(
    activeControllerProfile,
    showArtifactId,
    { mapDim: activeControllerMapDim },
  )
  const alreadySent = (mode: SendMode) => isAlreadyPushed({
    mode,
    source: preparedSource,
    lastRunSource: activeIp ? lastPushedSource[activeIp]?.[showArtifactId] : undefined,
    lastSavedSource: activeIp ? lastSavedSource[activeIp]?.[showArtifactId] : undefined,
    profileSignature: preparedProfileSignature,
    lastRunProfileSignature: activeIp
      ? lastPushedProfileSignature[activeIp]?.[showArtifactId]
      : undefined,
    lastSavedProfileSignature: activeIp
      ? lastSavedProfileSignature[activeIp]?.[showArtifactId]
      : undefined,
    lastRunProgramId: activeIp ? lastRunProgramId[activeIp]?.[showArtifactId] : undefined,
    activeProgramId,
  })
  const deliveryBlocker = !artifactCompilationReady
    ? 'Rebuilding Show...'
    : compiled.error
      ? presentShowDiagnostic(compiled.error)
      : compiled.artifactBlocker
        ? presentShowDiagnostic(compiled.artifactBlocker)
        : compilePressure?.status === 'blocked'
          ? compilePressure.blocks.join(' ')
          : preparedControllerArtifact.error
            ? preparedControllerArtifact.error
            : preparedDeliverySnapshot
              ? null
              : 'Show is not ready to send'
  function deliveryInvalidationMessage(delivery: ShowDeliverySnapshot): string | null {
    const controllerState = useControllerStore.getState()
    const deliveryController = delivery.controllerIp
      ? controllerState.controllers[delivery.controllerIp]
      : undefined
    return showDeliveryInvalidationMessage({
      controllerIp: delivery.controllerIp,
      activeIp: controllerState.activeIp,
      phase: deliveryController?.phase,
      liveEpoch: deliveryController?.liveEpoch ?? 0,
      expectedLiveEpoch: delivery.controllerSession.liveEpoch,
      currentSnapshot: delivery === preparedDeliverySnapshotRef.current && delivery.show.id === showId,
    })
  }

  function rejectInvalidDelivery(mode: SendMode, delivery: ShowDeliverySnapshot): boolean {
    const message = deliveryInvalidationMessage(delivery)
    if (!message) return false
    reportArtifactPushFailure({
      ok: false,
      message,
      artifactId: `show:${delivery.show.id}`,
      mode,
    })
    return true
  }

  async function sendShow(mode: SendMode, delivery: ShowDeliverySnapshot | null) {
    if (!delivery || rejectInvalidDelivery(mode, delivery)) {
      pendingDeliveryRef.current = null
      setPendingSendMode(null)
      return
    }
    const prepared = delivery.prepared
    const deliveryArtifactId = `show:${delivery.show.id}`
    setPendingSendMode(null)
    pendingDeliveryRef.current = null
    setShowSendMode(mode)
    setPreparingSave(mode === 'save')
    try {
      const previewImage = mode === 'save'
        ? (await buildPreviewJpeg(delivery.artifact).catch(() => null)) ?? undefined
        : undefined
      if (rejectInvalidDelivery(mode, delivery)) return
      trackEvent('send_to_controller', {
        mode,
        pattern_key: deliveryArtifactId,
        controller_phase: activeController?.phase ?? controllerStatus.kind,
      })
      await pushGeneratedArtifact({
        artifactId: deliveryArtifactId,
        source: prepared.source,
        name: delivery.show.name,
        persist: mode === 'save',
        compilePressure: {
          budgetBytes: delivery.artifact.summary.measuredDeviceBudgetBytes,
          worstInstantRenderersPerPixel: delivery.artifact.summary.worstInstantRenderersPerPixel,
        },
        artifactStamp: prepared.artifactStamp,
        expectedControllerSession: delivery.controllerSession,
        previewImage,
      })
    } finally {
      setPreparingSave(false)
    }
  }

  function requestShowSend(mode: SendMode) {
    const delivery = preparedDeliverySnapshot
    if (!delivery) return
    setShowSendMode(mode)
    if (delivery.prepared.warnings.length > 0) {
      pendingDeliveryRef.current = delivery
      setPendingSendMode(mode)
      return
    }
    void sendShow(mode, delivery)
  }

  const cancelShowSend = () => {
    pendingDeliveryRef.current = null
    setPendingSendMode(null)
  }
  useShowControllerDelivery(activeShow ? {
    subject: { kind: 'show', id: showId, name: activeShow.name, deliveryBlocker, runAlreadyPushed: alreadySent('run'), saveAlreadyPushed: alreadySent('save') },
    mode: showSendMode,
    pushing: controllerPushing || preparingSave,
    succeeded: !!showControllerPushResult?.ok,
    failure: showControllerPushResult && !showControllerPushResult.ok ? showControllerPushResult : null,
    dismissFailure: clearArtifactPushResult,
    pending: pendingSendMode !== null && pendingDelivery !== null,
    warnings: pendingDelivery?.prepared.warnings ?? preparedControllerArtifact.value?.warnings ?? [],
    blocked: pendingDelivery?.prepared.blocked ?? preparedControllerArtifact.value?.blocked ?? true,
    request: requestShowSend,
    confirm: async () => { if (pendingSendMode) await sendShow(pendingSendMode, pendingDelivery) },
    cancel: cancelShowSend,
  } : null)

  const editorPatternOptions: ShowPatternOption[] = [
    ...userPatterns.map((pattern) => ({
      label: pattern.name,
      ref: { kind: 'user' as const, id: pattern.id },
      group: 'Personal' as const,
    })),
    ...STOCK_PATTERNS.map((pattern) => ({
      label: pattern.name,
      ref: { kind: 'stock' as const, id: pattern.name },
      group: 'Built-in' as const,
    })),
  ]

  if (!activeShow && !(recordVersion === 2 && savedShowV2 && timelineViewV2)) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950/40 font-mono text-xs text-zinc-500">
        Show not found
      </div>
    )
  }
  // The v1 record, its whole-record update wrappers and every legacy pure
  // mutation owner stay private to the v1 backing (#1065). A v2 write that this
  // tracer has not connected reaches `null` here and returns an internal
  // no-change result, so it never produces a record, a history entry or a save.
  // The version fence is the declared backing, repeated here so a legacy write
  // cannot become reachable through some other record source later.
  const legacyShow: ShowRecord | null = recordVersion === 1 ? activeShow : null
  const editorRecordId = legacyShow?.id ?? savedShowV2!.id

  const exportAuthoredShowFile = async () => {
    if (recordVersion === 2) {
      if (!savedShowV2) return
      const { filename, bundle } = buildShowFileBundle(savedShowV2, {
        patterns: userPatterns,
        maps: userMaps,
        libraries: userLibraries,
      }, { appVersion: __PXLBLZ_APP_VERSION__ })
      const bytes = await serializeShowFileBundle(bundle)
      downloadBrowserFile(filename, Uint8Array.from(bytes), 'application/gzip')
      return
    }
    if (!legacyShow) return
    const { filename, bundle } = buildShowFileBundle(legacyShow, {
      patterns: userPatterns,
      maps: userMaps,
    }, {
      appVersion: __PXLBLZ_APP_VERSION__,
    })
    const bytes = await serializeShowFileBundle(bundle)
    downloadBrowserFile(filename, Uint8Array.from(bytes), 'application/gzip')
  }

  if (recordVersion === 2 && savedShowV2 && spatialZoneSelection && savedShowV2.outputContract.kind === 'installation' && savedStageMap?.dim === 2) {
    const zone = savedShowV2.zones.find((candidate) => candidate.id === spatialZoneSelection.zoneId)
    const map = resolveMap(savedStageMap.id, userMaps)
    const resolved = applyNormalizeMode(map.resolve(savedShowV2.outputContract.pixelCount), 'contain')
    if (zone && resolved.length === savedShowV2.outputContract.pixelCount) {
      const points = resolved.map((point) => {
        const raw = point.pos ?? point.sample
        return { x: raw[0] ?? 0.5, y: raw[1] ?? 0.5 }
      })
      return (
        <FieldActivityContext.Provider value={fieldActivity}>
          <ShowZoneSpatialSelector
            key={JSON.stringify([savedShowV2.id, spatialZoneSelection.layoutId, zone.id, savedStageMap.id])}
            show={{ id: savedShowV2.id, outputContract: savedShowV2.outputContract, zones: savedShowV2.zones, routingLayouts: savedShowV2.zoneLayouts }}
            zone={zone}
            layoutId={spatialZoneSelection.layoutId}
            mapName={savedStageMap.name}
            points={points}
            onCancel={() => setSpatialZoneSelection(null)}
            onCommit={(indexes) => { commitV2ZonePlan((record) => planShowV2PhysicalZoneSelection(record, spatialZoneSelection.layoutId, zone.id, indexes)); setSpatialZoneSelection(null) }}
          />
        </FieldActivityContext.Provider>
      )
    }
  }

  if (legacyShow && spatialZoneSelection && legacyShow.outputContract?.kind === 'installation' && savedStageMap?.dim === 2) {
    const zone = legacyShow.zones.find((candidate) => candidate.id === spatialZoneSelection.zoneId)
    const map = resolveMap(savedStageMap.id, userMaps)
    const resolved = applyNormalizeMode(map.resolve(legacyShow.outputContract.pixelCount), 'contain')
    if (zone && resolved.length === legacyShow.outputContract.pixelCount) {
      const points = resolved.map((point) => {
        const raw = point.pos ?? point.sample
        return { x: raw[0] ?? 0.5, y: raw[1] ?? 0.5 }
      })
      return (
        <FieldActivityContext.Provider value={fieldActivity}>
          <ShowZoneSpatialSelector
            key={JSON.stringify([legacyShow.id, spatialZoneSelection.layoutId, zone.id, savedStageMap.id])}
            show={legacyShow}
            zone={zone}
            layoutId={spatialZoneSelection.layoutId}
            mapName={savedStageMap.name}
            points={points}
            onCancel={() => setSpatialZoneSelection(null)}
            onCommit={(indexes) => {
              const next = updateShowPhysicalZoneSelection(
                legacyShow,
                spatialZoneSelection.layoutId,
                zone.id,
                indexes,
              )
              updateShowInBackground(legacyShow.id, next)
              setSpatialZoneSelection(null)
            }}
          />
        </FieldActivityContext.Provider>
      )
    }
  }

  if (generatedSnapshot?.showId === showId) {
    const generatedExport = generatedSnapshot.canonicalExport
    // The generated-code view exists so a blocked Show stays inspectable; its
    // export affordance stays gated by the same delivered-pressure rule as
    // the editor-level Download .epe menu item (#63 review follow-up).
    const generatedPressure = assessShowCompilePressure({
      deliveredSourceBytes: deliveredShowSourceBytes(generatedExport.source),
      budgetBytes: generatedSnapshot.artifact.summary.measuredDeviceBudgetBytes,
      worstInstantRenderersPerPixel: generatedSnapshot.artifact.summary.worstInstantRenderersPerPixel,
    })
    const buildGeneratedDownloadExport = async (): Promise<ShowEpeExport> => {
      const preview = await buildPreviewJpeg(generatedSnapshot.artifact)
      if (!preview) throw new Error('Could not render the EPE preview image')
      const exported = generatedSnapshot.exportWith({
        id: makeProgramId(),
        preview: bytesToBase64(preview),
        stampedAt: new Date(generatedSnapshot.stampedAt),
      })
      if (!exported) throw new Error('Could not render the EPE preview image')
      return exported
    }
    return (
      <div className="flex h-full min-h-0 flex-col bg-zinc-950">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-seam px-3 font-mono text-xs text-zinc-400">
          <Code2 size={14} aria-hidden />
          <span className="flex-1 truncate text-zinc-200">Generated pattern - {generatedSnapshot.name}</span>
          <ExportShowButton exported={generatedPressure.status === 'blocked' ? null : generatedExport} buildExport={buildGeneratedDownloadExport} />
          <Button
            size="xs"
            variant="ghost"
            className="bg-zinc-800/70 text-xs text-zinc-400 hover:bg-zinc-700/70 hover:text-zinc-300"
            onClick={() => setGeneratedSnapshot(null)}
          >
            Back to show
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <PixelblazeCodeEditor value={generatedExport.source} readOnly />
        </div>
      </div>
    )
  }

  const patternOptions = editorPatternOptions
  const referencePatternOptions = patternOptions.filter((option) => {
    const source = option.ref.kind === 'user'
      ? userPatterns.find((pattern) => pattern.id === option.ref.id)?.src
      : STOCK_PATTERNS.find((pattern) => pattern.name === option.ref.id)?.src
    return source ? exportedDims(source).some((dimension) => dimension === 1 || dimension === 2) : false
  })

  function rememberTimelineFocus(event: React.FocusEvent<HTMLElement>) {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    const focusTarget = target.closest<HTMLElement>('[data-show-timeline-focus], button')
    if (focusTarget) lastTimelineFocusRef.current = focusTarget
  }

  function returnFocusAfterDiscreteCommit(event: React.FormEvent<HTMLDivElement>) {
    if (!(event.target instanceof HTMLSelectElement)) return
    returnFocusToTimelineSelection()
  }

  function returnFocusToTimelineSelection() {
    window.setTimeout(() => {
      const previous = lastTimelineFocusRef.current
      if (previous?.isConnected) previous.focus()
      else timelineWorkspaceRef.current?.focus()
    }, 0)
  }

  const showNoteTrigger = builtInContext?.note ? (
    <ShowNoteTrigger
      key={showId}
      note={builtInContext.note}
      open={showNoteOpen}
      onToggle={() => setShowNoteOpen(showId, !showNoteOpen)}
    />
  ) : null

  const cloneBuiltInShow = stockShowById(showId) !== undefined && personalWorkspaceAuthenticated
    ? () => {
        if (savingBuiltInCopy) return
        setSavingBuiltInCopy(true)
        const clone = recordVersion === 2
          ? duplicateShowV2Row(showId, lessonProjectionV2 ?? savedShowV2 ?? undefined)
          : duplicateShow(showId, legacyShow ?? undefined)
        void clone.then((copy) => {
          if (!copy) return
          void openShow(copy.id)
          routerNavigate({ kind: 'studio', entity: { kind: 'shows', id: copy.id } })
        }).finally(() => setSavingBuiltInCopy(false))
      }
    : undefined

  const headerActions = (
    <>
      {onOpenStagePreview && (
        <Button
          size="xs"
          variant="ghost"
          aria-label="Preview Stage"
          title="Open Stage preview"
          className="hidden bg-zinc-900/60 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 max-[980px]:inline-flex"
          onClick={(event) => onOpenStagePreview(event.currentTarget)}
        >
          <Maximize2 size={13} aria-hidden />
          <span className="show-header-action-label">Preview</span>
        </Button>
      )}
      {builtInContext && (
        <Button
          size="xs"
          variant="ghost"
          aria-label="Reset built-in Show"
          title="Discard session edits and restore the built-in definition"
          // Enabled means there are session edits to discard: the amber lift
          // replaces the old "edits last until reload" header disclaimer (#63).
          className={hasStockDraft || selectedReferencePatterns
            ? 'border-amber-300/45 bg-amber-400/10 text-[11px] text-amber-200 hover:bg-amber-400/20 hover:text-amber-100'
            : 'bg-zinc-900/60 text-[11px] text-zinc-500 disabled:opacity-40'}
          disabled={!hasStockDraft && !selectedReferencePatterns}
          onClick={() => {
            if (isV2LessonDraft) resetShowV2LessonDraft(showId)
            else resetStockShowDraft(showId)
            clearReferencePatterns(showId)
          }}
        >
          <RotateCcw size={13} aria-hidden />
          <span className="show-header-action-label">Reset</span>
        </Button>
      )}
      <Button
        size="xs"
        variant="ghost"
        aria-label="Show properties"
        title="Show properties"
        aria-pressed={detailPanelOpen && selection.kind === 'show'}
        data-show-selection-key="show"
        className={detailPanelOpen && selection.kind === 'show'
          ? 'bg-zinc-800/70 text-[11px] text-zinc-300 hover:bg-zinc-700/70 hover:text-zinc-200'
          : 'bg-zinc-900/60 text-[11px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'}
        onClick={(event) => openShowProperties(event.currentTarget)}
      >
        <Settings2 size={13} aria-hidden />
        <span className="show-header-action-label">Properties</span>
      </Button>
      <ShowActionsMenu
        viewCodeDisabled={!compiled.artifact || Boolean(compiled.artifactBlocker)}
        onViewCode={() => {
          const snapshot = buildCurrentCompilationSnapshot()
          if (snapshot) setGeneratedSnapshot(snapshot)
        }}
        onClone={cloneBuiltInShow}
        cloneDisabled={savingBuiltInCopy}
        exported={showExport}
        buildExport={buildDownloadExport}
        onExportShowFile={exportAuthoredShowFile}
      />
    </>
  )
  const pinnedDetailAnchor = pinnedDetail?.anchor ?? null
  const detailPanelTransportBoundary = timelineWorkspaceRef.current
    ?.querySelector<HTMLElement>('[data-testid="show-timeline-toolbar"]')

  return (
    <FieldActivityContext.Provider value={fieldActivity}>
    <div ref={showEditorPaneRef} className="show-editor-pane flex h-full min-h-0 flex-col bg-zinc-950/75 font-mono text-xs text-zinc-400">
      {headerGuideTarget && showNoteTrigger
        ? createPortal(showNoteTrigger, headerGuideTarget)
        : null}
      {headerActionsTarget
        ? createPortal(headerActions, headerActionsTarget)
        : <div className="mb-2 flex shrink-0 items-center justify-end gap-1.5 px-3 pt-3">{!headerGuideTarget && showNoteTrigger}{headerActions}</div>}
      <ShowLossConfirmDialog
        open={pendingPatternSlotSelection !== null}
        {...(pendingPatternSlotSelection
          ? describePatternReplacementLoss(pendingPatternSlotSelection.patternName,
            pendingPatternSlotSelection.removedControlNames.map((label) => ({ label, animated: true })))
          : { title: '', description: '', actionLabel: '' })}
        onCancel={() => setPendingPatternSlotSelection(null)}
        onConfirm={() => {
          if (pendingPatternSlotSelection) {
            setReferencePattern(showId, pendingPatternSlotSelection.slotIndex, pendingPatternSlotSelection.pattern)
          }
          setPendingPatternSlotSelection(null)
        }}
      />
      <ShowLossConfirmDialog
        open={pendingV2Replacement !== null}
        {...(pendingV2Replacement
          ? describePatternReplacementLoss(pendingV2Replacement.patternName, pendingV2Replacement.lost)
          : { title: '', description: '', actionLabel: '' })}
        onCancel={() => setPendingV2Replacement(null)}
        onConfirm={confirmV2Replacement}
      />
      <ShowLossConfirmDialog
        open={pendingV2ControlRemoval !== null}
        {...(pendingV2ControlRemoval
          ? describeControlTargetRemovalLoss(pendingV2ControlRemoval.lost.map((control) => control.label))
          : { title: '', description: '', actionLabel: '' })}
        onCancel={() => setPendingV2ControlRemoval(null)}
        onConfirm={confirmV2ControlRemoval}
      />
      {readOnly && !builtInContext?.note && (
        <div className="flex shrink-0 items-start gap-2 border-b border-amber-300/15 bg-amber-300/[0.035] px-3 py-1.5 text-[10px] text-zinc-500">
          <Lock size={12} aria-hidden className="text-amber-300/70" />
          <span className="shrink-0 font-semibold uppercase tracking-[0.12em] text-amber-200/75">Built-in Show</span>
          {builtInContext ? (
            <span className="min-w-0">
              <span className="mr-1.5 rounded border border-zinc-700/80 px-1 py-0.5 text-[8px] uppercase tracking-wider text-zinc-500">
                {builtInContext.track}
              </span>
              <strong className="font-medium text-zinc-300">{builtInContext.lesson}</strong>
              <span className="ml-1.5 text-zinc-500">{builtInContext.description}</span>
            </span>
          ) : (
            <span>Read only - inspect, preview, export, or send this example.</span>
          )}
        </div>
      )}
      {(recordVersion === 2 ? showV2SaveFailure : showSaveFailure)?.showId === showId && (
        <SaveFailureNotice
          testId="show-save-failure"
          message="Couldn't save this Show. The last edit was reverted."
          onRetry={() => void (recordVersion === 2 ? retryShowV2SaveFailure() : retryShowSaveFailure())}
          onDismiss={recordVersion === 2 ? dismissShowV2SaveFailure : dismissShowSaveFailure}
        />
      )}
      <div className="relative flex min-h-0 flex-1 flex-col">
      <div data-testid="show-editor-scroll" className="scrollbar-hidden flex min-h-0 flex-1 flex-col overflow-auto">
        {(legacyShow || (recordVersion === 2 && savedShowV2)) && builtInContext?.note && showNoteOpen && (
          recordVersion === 2 && lessonProjectionV2 ? (
            <ShowLiveStrip
              key={showId}
              note={builtInContext.note}
              showId={showId}
              narrationAt={(positionMs) => showLessonNarrationV2(lessonProjectionV2, builtInContext.reference, positionMs, afterSceneIdByTransitionId)}
              authoredPatternFor={(group) => showLessonAuthoredSlotPatternV2(lessonProjectionV2, group)}
              patternSlots={builtInSlotGroups}
              patternOptions={referencePatternOptions}
              selections={selectedReferencePatterns}
              onSelectPattern={requestPatternSlotSelection}
              onCollapse={() => setShowNoteOpen(showId, false)}
              canReset={Boolean(builtInSlotGroups?.some((group, index) => {
                const selected = selectedReferencePatterns?.[index]
                const authored = showLessonAuthoredSlotPatternV2(savedShowV2, group)
                return selected && authored && (selected.kind !== authored.kind || selected.id !== authored.id)
              }))}
              onReset={() => clearReferencePatterns(showId)}
            />
          ) : legacyShow ? (
            <ShowLiveStrip
              key={showId}
              note={builtInContext.note}
              showId={showId}
              narrationAt={(positionMs) => showLessonNarrationV1(legacyShow, builtInContext.reference, positionMs)}
              authoredPatternFor={(group) => showLessonAuthoredSlotPatternV1(legacyShow, group)}
              patternSlots={builtInSlotGroups}
              patternOptions={referencePatternOptions}
              selections={selectedReferencePatterns}
              onSelectPattern={requestPatternSlotSelection}
              onCollapse={() => setShowNoteOpen(showId, false)}
              canReset={Boolean(builtInSlotGroups?.some((group, index) => {
                const selected = selectedReferencePatterns?.[index]
                const authored = editableShow ? showLessonAuthoredSlotPatternV1(editableShow, group) : undefined
                return selected && authored && (selected.kind !== authored.kind || selected.id !== authored.id)
              }))}
              onReset={() => clearReferencePatterns(showId)}
            />
          ) : null
        )}
        <div className="min-w-0 p-3">
          <section
            ref={timelineWorkspaceRef}
            aria-label="Show timeline"
            tabIndex={-1}
            data-show-timeline-focus
            className="select-none outline-none [&_input]:select-text [&_textarea]:select-text"
            onFocusCapture={rememberTimelineFocus}
          >
            {blockedDeleteFeedback && (
              <span
                key={blockedDeleteFeedback.token}
                role="status"
                aria-label="Clip deletion unavailable"
                aria-live="polite"
                className="sr-only"
              >
                {blockedDeleteFeedback.status}
              </span>
            )}
            <ShowTimelineWorkspace
                key={editorRecordId}
                show={legacyShow}
                timelineViewOverride={timelineViewV2}
                timeColumnsOverride={timeColumnsV2}
                transitionSettingsOverride={transitionSettingsV2}
                boundaryTransitionIdsOverride={boundaryTransitionIdsV2}
                zoneLayoutsOverride={recordVersion === 2 ? savedShowV2?.zoneLayouts ?? null : null}
                sampleRepeatAtOverride={sampleRepeatAtV2}
                boundaryTransitionsOverride={boundaryTransitionsV2}
                clipSummarySourcesOverride={clipSummarySourcesV2}
                propertyLanesOverride={propertyLanesV2}
                zoneMapOverride={zoneMapV2}
                recordVersion={recordVersion}
                captureV2Move={captureV2Move}
                captureV2ClipEdit={captureV2Move}
                onCommitV2ClipTemporal={commitV2ClipTemporal}
                onCommitV2ClipSharing={commitV2ClipSharing}
                onCommitV2TransitionResize={commitV2TransitionResize}
                timelineComposition={timelineComposition}
                readOnly={readOnly}
                transportActive
                patternControlsByCellId={patternControlsByCellId}
                patternControlsByInstanceId={patternControlsByInstanceId}
                selection={selection}
                blockedDeleteFeedback={blockedDeleteFeedback}
                isolatedGroupOccurrenceId={isolatedGroupOccurrenceId}
                onSelect={selectTimeline}
                onEnterGroupIsolation={(occurrenceId, placementId, anchor) => {
                  closeDetailPanel()
                  setIsolatedGroupOccurrenceId(occurrenceId)
                  selectTimeline({ kind: 'group-clip', occurrenceId, placementId }, anchor)
                }}
                onExitGroupIsolation={() => {
                  closeDetailPanel()
                  if (isolatedGroupOccurrenceId) setSelection({ kind: 'group', occurrenceId: isolatedGroupOccurrenceId })
                  setIsolatedGroupOccurrenceId(null)
                }}
                onSelectGroupCandidates={selectGroupCandidates}
                onCreateGroup={async (groupSelection) => {
                  if (recordVersion === 2) {
                    const capture = preparedV2CaptureRef.current
                    if (!capture || capture.prepared.status === 'refused') return null
                    const plan = planShowV2GroupCreation(capture.record, {
                      clipIds: groupSelection.placementIds,
                      transitionIds: groupSelection.transitionIds,
                      name: 'Group',
                    }, newPersonalContentId)
                    if (plan.status !== 'ready') return null
                    const applied = await commitV2CreateGroup({
                      capture,
                      baseRevision: useShowStore.getState().showRevisions[showId] ?? 0,
                      intent: plan.intent,
                    })
                    if (!applied) return null
                    selectTimeline({ kind: 'group', occurrenceId: plan.intent.occurrenceId })
                    return plan.intent.occurrenceId
                  }
                  if (!legacyShow || !timelineComposition) return null
                  const definitionId = newPersonalContentId()
                  const occurrenceId = newPersonalContentId()
                  const composition = createShowGroupFromSelection(timelineComposition, {
                    selection: groupSelection,
                    definitionId,
                    occurrenceId,
                    name: 'Group',
                  })
                  if (composition === timelineComposition || validateShowGroups(legacyShow, composition).length > 0) return null
                  if (!(await tryUpdateShow(legacyShow.id, { ...legacyShow, composition, updatedAt: Date.now() }))) return null
                  selectTimeline({ kind: 'group', occurrenceId })
                  return occurrenceId
                }}
                onDismiss={closeDetailPanel}
                onDirectManipulationChange={setDetailsSuppressed}
                onReanchorDetails={reanchorOpenDetails}
                patternOptions={patternOptions}
                onAddClipAtPlayhead={async ({ zoneId, layerId, globalTimeMs, target, pattern, patternName }) => {
                  if (recordVersion === 2) {
                    const moved = captureV2Move()
                    if (!moved) return null
                    const exact = layerId
                      ? planShowV2ClipAtTime(moved.capture.record, { zoneId, layerId, globalTimeMs })
                      : null
                    const placed = exact?.enabled ? exact : (
                      !layerId
                        ? planShowV2ClipAtTopmostAvailableLayer(moved.capture.record, { zoneId, globalTimeMs })
                        : null
                    )
                    if (!placed) return null
                    const built = createShowV2AddClipIntent(moved.capture, placed, { pattern, patternName }, newPersonalContentId)
                    if (built.status === 'refused') return null
                    const outcome = await admitShowV2PilotCreateClip({
                      showId,
                      baseRevision: moved.baseRevision,
                      capture: moved.capture,
                      intent: built.intent,
                      onAdopted: () => {},
                      isCurrent: () => editorAliveRef.current
                        && preparedV2CaptureRef.current === moved.capture
                        && useShowStore.getState().showV2Pilots[showId] === moved.capture.record,
                    })
                    return outcome.status === 'applied' ? built.clipId : null
                  }
                  if (!legacyShow || !timelineComposition || !target) return null
                  const instanceId = newPersonalContentId()
                  const placementId = newPersonalContentId()
                  const nextShow = addShowClipAtGlobalTimeExtendingShow(
                    { ...legacyShow, composition: timelineComposition },
                    timelineComposition,
                    {
                    zoneId,
                    globalTimeMs,
                    target,
                    instance: {
                      id: instanceId,
                      pattern,
                      patternName,
                      time: { timeScale: 1, timeOffsetMs: 0 },
                    },
                    placementId,
                    },
                  )
                  if (nextShow.composition === timelineComposition) return null
                  if (!(await tryUpdateShow(legacyShow.id, nextShow))) return null
                  return placementId
                }}
                onMoveCompositionClip={async ({ owner, target, sourceComposition, plannedComposition }) => {
                  if (!legacyShow || !timelineComposition) return false
                  if (sourceComposition && sourceComposition !== timelineComposition) return false
                  const nextShow = moveShowConnectedClipInShowAtGlobalTime(
                    legacyShow,
                    timelineComposition,
                    { owner, target, plannedComposition },
                  )
                  if (nextShow === legacyShow) return false
                  return tryUpdateShow(legacyShow.id, { ...nextShow, updatedAt: Date.now() })
                }}
                onDuplicateCompositionClipAtTarget={async ({ sourceComposition, plannedComposition }) => {
                  if (!legacyShow || !timelineComposition || sourceComposition !== timelineComposition) return false
                  if (plannedComposition === timelineComposition) return false
                  return tryUpdateShow(legacyShow.id, {
                    ...legacyShow,
                    composition: plannedComposition,
                    updatedAt: Date.now(),
                  })
                }}
                onAddCompositionLayer={async (zoneId) => {
                  if (recordVersion === 2) {
                    if (readOnly) return false
                    const moved = captureV2Move()
                    if (!moved) return false
                    // Rank zero is the bottom Layer, so one more than the
                    // highest rank in the Zone lands on top, exactly where the
                    // v1 overlay lands with unshift (#1090).
                    const rank = moved.capture.record.composition.layers.reduce(
                      (highest, layer) => (layer.zoneId === zoneId ? Math.max(highest, layer.rank) : highest),
                      -1,
                    ) + 1
                    const outcome = await commitV2LayerEdit({
                      ...moved,
                      intent: {
                        kind: 'add',
                        layer: {
                          id: newPersonalContentId(),
                          zoneId,
                          name: `Layer ${rank}`,
                          rank,
                        },
                      },
                    })
                    return outcome.status === 'applied'
                  }
                  if (!legacyShow || !timelineComposition) return false
                  const nextComposition = addShowOverlayLayerAcrossTimeline(legacyShow, timelineComposition, {
                    zoneId,
                    layers: timelineComposition.scenes.map((scene) => ({
                      sceneId: scene.sceneId,
                      layerId: newPersonalContentId(),
                    })),
                  })
                  if (nextComposition === timelineComposition) return false
                  return tryUpdateShow(legacyShow.id, {
                    ...legacyShow,
                    composition: nextComposition,
                    updatedAt: Date.now(),
                  })
                }}
                onSplitCompositionClip={async (owner, globalTimeMs) => {
                  if (!legacyShow || !timelineComposition) return null
                  const placementId = newPersonalContentId()
                  const nextComposition = splitShowClipAtGlobalTime(legacyShow, timelineComposition, {
                    owner,
                    globalTimeMs,
                    newPlacementId: placementId,
                  })
                  if (nextComposition === timelineComposition) return null
                  if (!(await tryUpdateShow(legacyShow.id, {
                    ...legacyShow,
                    composition: nextComposition,
                    updatedAt: Date.now(),
                  }))) return null
                  return placementId
                }}
                onDuplicateCompositionClip={async (owner) => {
                  if (!legacyShow || !timelineComposition) return null
                  const placementId = newPersonalContentId()
                  const nextComposition = duplicateShowClipAfter(legacyShow, timelineComposition, {
                    owner,
                    newPlacementId: placementId,
                    newInstanceId: newPersonalContentId(),
                  })
                  if (nextComposition === timelineComposition) return null
                  if (!(await tryUpdateShow(legacyShow.id, {
                    ...legacyShow,
                    composition: nextComposition,
                    updatedAt: Date.now(),
                  }))) return null
                  return placementId
                }}
                onDuplicateCompositionClipV2={duplicateClipAfterV2}
                onResizeCompositionClip={async ({
                  owner,
                  globalStartMs,
                  durationMs,
                  sourceComposition,
                }) => {
                  const current = useShowStore.getState()
                  if (!legacyShow
                      || !timelineComposition
                    || sourceComposition !== timelineComposition
                    || manualResizeSourceRef.current.activeShow !== legacyShow
                    || manualResizeSourceRef.current.timelineComposition !== timelineComposition
                    || current.shows.find(item => item.id === showId) !== savedShow
                    || current.stockShowDrafts[showId] !== stockShowDraft) return false
                  const nextShow = resizeShowClipManually(legacyShow, timelineComposition, {
                    clipId: owner.placementId, globalStartMs, durationMs,
                  })
                  if (nextShow === legacyShow) return false
                  return tryUpdateShow(legacyShow.id, {
                    ...nextShow,
                    updatedAt: Date.now(),
                  })
                }}
                onOpenLayerTransition={(target) => {
                  // A refusal belongs to the junction that produced it; carrying
                  // it forward would also mask the next junction's own reason.
                  setLayerTransitionApplyError(null)
                  setLayerTransitionTarget(target)
                }}
                onInsertTime={async (atMs, durationMs) => {
                  if (recordVersion === 2) {
                    if (readOnly) return false
                    const moved = captureV2Move()
                    if (!moved) return false
                    const outcome = await commitV2InsertTime({
                      ...moved,
                      intent: { atMs: Math.max(0, Math.round(atMs)), durationMs },
                    })
                    return outcome.status === 'applied'
                  }
                  if (!legacyShow || !timelineComposition) return false
                  const basis = { ...legacyShow, composition: timelineComposition }
                  const plan = planShowTimeInsertion(basis, atMs, durationMs)
                  if (!plan.enabled) return false
                  const next = insertShowTime(basis, {
                    atMs,
                    durationMs,
                    newPlacementIdBySourceId: Object.fromEntries(
                      plan.crossingPlacementIds.map((placementId) => [placementId, newPersonalContentId()]),
                    ),
                  })
                  if (next === basis) return false
                  return tryUpdateShow(legacyShow.id, next)
                }}
                onAddMarker={async (timeMs) => {
                  if (recordVersion === 2) {
                    if (readOnly) return false
                    const moved = captureV2Move()
                    if (!moved) return false
                    // Converted Scene labels are not authored Markers, so the number matches v1's (#1090).
                    const markerNumber = moved.capture.record.composition.markers.filter(marker => marker.origin !== 'converted-scene-label').length + 1
                    const outcome = await commitV2MarkerEdit({
                      ...moved,
                      intent: {
                        kind: 'add',
                        marker: {
                          id: newPersonalContentId(),
                          timeMs: Math.max(0, Math.round(timeMs)),
                          name: `Marker ${markerNumber}`,
                          color: '#f59e0b',
                        },
                      },
                    })
                    return outcome.status === 'applied' || outcome.status === 'unchanged'
                  }
                  if (!legacyShow || !timelineComposition) return false
                  const basis = { ...legacyShow, composition: timelineComposition }
                  const markerNumber = (timelineComposition.markers?.length ?? 0) + 1
                  const result = editShowMarkerFromUI(basis, { kind: 'add', marker: {
                    id: newPersonalContentId(),
                    timeMs,
                    name: `Marker ${markerNumber}`,
                    color: '#f59e0b',
                  } })
                  if (result.status === 'refused') return false
                  if (result.status === 'noop') return true
                  return tryUpdateShow(legacyShow.id, result.record)
                }}
                onMoveMarker={async (markerId, timeMs) => {
                  if (recordVersion === 2) {
                    if (readOnly) return false
                    const moved = captureV2Move()
                    if (!moved) return false
                    const outcome = await commitV2MarkerEdit({
                      ...moved,
                      intent: { kind: 'move', markerId, timeMs: Math.max(0, Math.round(timeMs)) },
                    })
                    return outcome.status === 'applied' || outcome.status === 'unchanged'
                  }
                  if (!legacyShow || !timelineComposition) return false
                  const basis = { ...legacyShow, composition: timelineComposition }
                  const result = editShowMarkerFromUI(basis, { kind: 'move', markerId, timeMs })
                  if (result.status === 'refused') return false
                  if (result.status === 'noop') return true
                  return tryUpdateShow(legacyShow.id, result.record)
                }}
                onUpdateMarker={async (markerId, patch) => {
                  if (recordVersion === 2) {
                    if (readOnly) return false
                    const moved = captureV2Move()
                    if (!moved) return false
                    const outcome = await commitV2MarkerEdit({
                      ...moved,
                      intent: {
                        kind: 'update',
                        markerId,
                        patch: patch.timeMs === undefined
                          ? patch
                          : { ...patch, timeMs: Math.max(0, Math.round(patch.timeMs)) },
                      },
                    })
                    return outcome.status === 'applied' || outcome.status === 'unchanged'
                  }
                  if (!legacyShow || !timelineComposition) return false
                  const basis = { ...legacyShow, composition: timelineComposition }
                  const result = editShowMarkerFromUI(basis, { kind: 'update', markerId, patch })
                  if (result.status === 'refused') return false
                  if (result.status === 'noop') return true
                  return tryUpdateShow(legacyShow.id, result.record)
                }}
                onRemoveMarker={async (markerId) => {
                  if (recordVersion === 2) {
                    if (readOnly) return false
                    const moved = captureV2Move()
                    if (!moved) return false
                    const outcome = await commitV2MarkerEdit({
                      ...moved,
                      intent: { kind: 'remove', markerId },
                    })
                    return outcome.status === 'applied' || outcome.status === 'unchanged'
                  }
                  if (!legacyShow || !timelineComposition) return false
                  const basis = { ...legacyShow, composition: timelineComposition }
                  const result = editShowMarkerFromUI(basis, { kind: 'remove', markerId })
                  if (result.status === 'refused') return false
                  if (result.status === 'noop') return true
                  return tryUpdateShow(legacyShow.id, result.record)
                }}
                onSetShowEnd={async (durationMs) => {
                  if (recordVersion === 2) return commitV2ShowEndTime(durationMs)
                  if (!legacyShow || !timelineComposition) return false
                  const basis = { ...legacyShow, composition: timelineComposition }
                  const next = setShowEndMs(basis, durationMs)
                  if (next === basis) return false
                  return tryUpdateShow(legacyShow.id, next)
                }}
                onAppendLayoutInterval={async (sourceLayoutId, durationMs) => {
                  if (recordVersion === 2) return commitV2LayoutPlan((record) => planShowV2LayoutEdit(record, { kind: 'append', durationMs, sourceLayoutId }, newPersonalContentId))
                  if (!legacyShow || !timelineComposition) return false
                  // Copy the layout and place its interval as one Show edit:
                  // a rejected placement persists nothing, and one Undo
                  // removes both the interval and the definition (#694
                  // review P2).
                  const current = useShowStore.getState().resolveEditableShow(legacyShow.id) ?? legacyShow
                  const withLayout = addShowRoutingLayout(current, undefined, sourceLayoutId)
                  const layoutId = withLayout.routingLayouts[withLayout.routingLayouts.length - 1].id
                  const basis = { ...withLayout, composition: timelineComposition }
                  const next = appendShowLayoutInterval(basis, { layoutId, durationMs })
                  if (next === basis) return false
                  return tryUpdateShow(legacyShow.id, next)
                }}
                onInsertLayoutInterval={async (sourceLayoutId, durationMs, atMs) => {
                  if (recordVersion === 2) return commitV2LayoutPlan((record) => planShowV2LayoutEdit(record, { kind: 'insert-interval', atMs: Math.round(atMs), durationMs, sourceLayoutId }, newPersonalContentId))
                  if (!legacyShow || !timelineComposition) return false
                  const current = useShowStore.getState().resolveEditableShow(legacyShow.id) ?? legacyShow
                  const withLayout = addShowRoutingLayout(current, undefined, sourceLayoutId)
                  const layoutId = withLayout.routingLayouts[withLayout.routingLayouts.length - 1].id
                  const basis = { ...withLayout, composition: timelineComposition }
                  const next = insertShowLayoutInterval(basis, { layoutId, durationMs, atMs })
                  if (next === basis) return false
                  return tryUpdateShow(legacyShow.id, next)
                }}
                onDuplicateLayoutInterval={async (intervalId, withContent) => {
                  if (recordVersion === 2) return commitV2LayoutPlan((record) => planShowV2LayoutEdit(record, { kind: 'duplicate', occurrenceId: intervalId, content: withContent ? 'copy' : 'empty' }, newPersonalContentId))
                  if (!legacyShow || !timelineComposition) return false
                  const basis = { ...legacyShow, composition: timelineComposition }
                  const next = duplicateShowLayoutInterval(basis, intervalId, { withContent })
                  if (next === basis) return false
                  return tryUpdateShow(legacyShow.id, next)
                }}
                onMakeLayoutIntervalUnique={async (intervalId) => {
                  if (recordVersion === 2) return commitV2LayoutPlan((record) => { const name = showV2MakeUniqueLayoutName(record, intervalId); return name === null ? null : planShowV2LayoutEdit(record, { kind: 'make-unique', occurrenceId: intervalId, name }, newPersonalContentId) })
                  if (!legacyShow || !timelineComposition) return false
                  const basis = { ...legacyShow, composition: timelineComposition }
                  const next = makeShowLayoutIntervalUnique(basis, intervalId)
                  if (next === basis) return false
                  return tryUpdateShow(legacyShow.id, next)
                }}
                onAddZone={() => {
                  if (recordVersion === 2) {
                    timelineWorkspaceRef.current?.focus()
                    commitV2ZonePlan((record) => planShowV2ZoneAdd(record))
                    return
                  }
                  if (!legacyShow) return
                  timelineWorkspaceRef.current?.focus()
                  void addZone(legacyShow.id)
                }}
                onUpdateZone={(zoneId, changes) => {
                  if (recordVersion === 2) {
                    commitV2ZonePlan((record) => planShowV2ZoneUpdate(record, zoneId, changes))
                    return
                  }
                  if (!legacyShow) return
                  void updateZone(legacyShow.id, zoneId, changes)
                }}
                onRemoveZone={(zoneId) => {
                  if (recordVersion === 2) {
                    closeDetailPanel()
                    closePinnedDetailForSelection({ kind: 'zone', zoneId })
                    commitV2ZonePlan((record) => planShowV2ZoneRemove(record, zoneId))
                    return
                  }
                  if (!legacyShow) return
                  closeDetailPanel()
                  closePinnedDetailForSelection({ kind: 'zone', zoneId })
                  void removeZone(legacyShow.id, zoneId)
                }}
              />
          </section>

          {!detailsSuppressed && [
            ...(pinnedDetail && pinnedDetailAnchor
              ? [{ id: 'pinned', selection: pinnedDetail.selection, anchor: pinnedDetailAnchor, pinned: true }]
              : []),
            ...(detailPanelOpen && detailAnchor
              ? [{ id: 'transient', selection, anchor: detailAnchor, pinned: false }]
              : []),
          ].map((detail) => {
            const detailClipId = detail.selection.kind === 'clip' ? detail.selection.clipId : null
            const detailSelectedClip = detailClipId && legacyShow
              ? legacyShow.cells.find((clip) => clip.id === detailClipId) ?? null
              : null
            const detailSelectedCompositionClipOwner = detailClipId && !detailSelectedClip
              ? findCompositionClipOwner(timelineComposition, detailClipId)
              : null
            const detailSelectedGroupClipOwner: ShowGroupClipOwner | null = detail.selection.kind === 'group-clip'
              ? { occurrenceId: detail.selection.occurrenceId, placementId: detail.selection.placementId }
              : null
            // The v2 backing resolves its Clip from the authored record; without
            // this the panel drops the Clip body layout and sizes to content
            // where v1 fills the available height (#1065).
            const detailIsV2Clip = Boolean(
              recordVersion === 2 && detailClipId
                && savedShowV2?.composition.clips.some((clip) => clip.id === detailClipId),
            )
            const detailIsClip = Boolean(
              detailSelectedClip || detailSelectedCompositionClipOwner || detailSelectedGroupClipOwner,
            ) || detailIsV2Clip
            return (
            <ShowEntityDetailPanel
              key={detail.id}
              anchor={detail.anchor}
              ownerKey={showSelectionKey(detail.selection)}
              pinned={detail.pinned}
              avoidPinnedPanel={!detail.pinned}
              bodyOwnsOverflow={detailIsClip}
              bodyHeightOffset={detailIsClip && readOnly ? 32 : 0}
              keepBelow={protectDetailPanelTransport ? detailPanelTransportBoundary : null}
              onPinnedChange={() => {
                if (detail.pinned) {
                  setPinnedDetail(null)
                  return
                }
                setPinnedDetail({ selection: detail.selection, anchor: detail.anchor })
                closeDetailPanel()
              }}
              onClose={() => detail.pinned ? setPinnedDetail(null) : closeDetailPanel(true)}
            >
              <div
                className={detailIsClip ? 'flex h-full min-h-0 flex-col' : undefined}
                onChangeCapture={returnFocusAfterDiscreteCommit}
              >
                {readOnly && (
                  <div
                    role="note"
                    className="flex min-h-8 items-center gap-2 border-b border-amber-300/15 bg-amber-300/[0.04] px-2.5 pr-16 text-[9px] leading-4"
                  >
                    <Lock size={11} aria-hidden className="shrink-0 text-amber-300/75" />
                    <strong className="shrink-0 font-semibold uppercase tracking-[0.1em] text-amber-200/80">Built-in values</strong>
                    <span className="truncate text-zinc-400">Inspect here; create your own Show to edit.</span>
                  </div>
                )}
                <InspectorReadOnlyContext.Provider value={readOnly}>
                  <ContextualInspector
                  show={legacyShow}
                  compositionShow={legacyShow ? inspectorShow ?? legacyShow : null}
                  recordV2={recordVersion === 2 ? lessonProjectionV2 ?? null : null}
                  replacementCaptureV2={recordVersion === 2 ? preparedV2Capture : null}
                  preparedCaptureV2={recordVersion === 2 ? preparedV2Capture : null}
                  boundaryTransitionsV2={boundaryTransitionsV2}
                  panelKey={detail.id}
                  selection={detail.selection}
                  selectedClip={detailSelectedClip}
                  selectedCompositionClipOwner={detailSelectedCompositionClipOwner}
                  selectedGroupClipOwner={detailSelectedGroupClipOwner}
                  transformEnabled={stageDimension === 2}
                  stageDimensions={(stageDimension ?? 2) as 1 | 2 | 3}
                  patternOptions={patternOptions}
                  patternControlsByCellId={patternControlsByCellId}
                  patternControlsByInstanceId={patternControlsByInstanceId}
                  compiledOutputEffects={compiled.artifact?.summary.outputEffects}
                  controllerProfiles={controllerProfiles}
                  userMaps={userMaps}
                  spatialSelectionUnavailableReason={spatialSelectionUnavailableReason}
                  onOpenSpatialSelection={(zoneId) => {
                    if (spatialRoutingLayout && !spatialSelectionUnavailableReason) {
                      setSpatialZoneSelection({ zoneId, layoutId: spatialRoutingLayout.id })
                    }
                  }}
                  onUpdateTargetProfile={(targetControllerProfileId) => {
                    if (recordVersion === 2) {
                      const capture = preparedV2CaptureRef.current
                      if (!capture) return
                      const baseRevision = useShowStore.getState().showRevisions[showId] ?? 0
                      void commitV2ShowMetadata({
                        capture,
                        baseRevision,
                        intent: { command: 'set_target_controller_profile', input: { profile_id: targetControllerProfileId || null } },
                      })
                      return
                    }
                    if (!legacyShow) return
                    updateShowInBackground(legacyShow.id, {
                      ...legacyShow,
                      targetControllerProfileId: targetControllerProfileId || undefined,
                      updatedAt: Date.now(),
                    })
                  }}
                  onUpdatePortableReference={(referenceMapId, referencePixelCount) => {
                    if (recordVersion === 2) {
                      const capture = preparedV2CaptureRef.current
                      if (!capture) return
                      commitV2ShowMetadataEdit(capture, planShowV2PortableReferenceEdit(
                        capture.record, referenceMapId, referencePixelCount,
                      ))
                      return
                    }
                    if (!legacyShow) return
                    updateShowInBackground(legacyShow.id, {
                      ...legacyShow,
                      stageMapId: referenceMapId,
                      outputContract: createPortableShowOutputContract({ referenceMapId, referencePixelCount }),
                      updatedAt: Date.now(),
                    })
                  }}
                  onUpdateOutputTrails={(input) => {
                    if (recordVersion === 2) {
                      const capture = preparedV2CaptureRef.current
                      if (!capture) return
                      commitV2ShowMetadataEdit(capture, planShowV2TrailsEdit(capture.record, input))
                      return
                    }
                    if (!legacyShow) return
                    updateShowInBackground(legacyShow.id, setShowOutputTrails(legacyShow, input))
                  }}
                  onPatternCommit={returnFocusToTimelineSelection}
                  onRemoveClip={(clip) => {
                    if (recordVersion === 2) {
                      requestDeleteClipV2(clip.id, false)
                      return
                    }
                    const placementId = Object.entries(
                      timelineProjection?.sourceCellIdByPlacementId ?? {},
                    ).find(([, sourceCellId]) => sourceCellId === clip.id)?.[0] ?? clip.id
                    requestDeleteClip(
                      { kind: 'clip', clipId: placementId },
                      timelineComposition,
                      findTimelineClipOwner(timelineComposition, placementId),
                    )
                  }}
                  onRemoveClipV2={(clipId) => {
                    requestDeleteClipV2(clipId, false)
                  }}
                  onUpdateAdaptations={(cell, changes) => {
                    if (!legacyShow) return
                    void updateCellAdaptations(legacyShow.id, cell.id, changes)
                  }}
                  onUpdateClipInspector={commitClipInspectorPatch}
                  onUpdateClipInspectorV2={commitV2ClipInspectorPatch}
                  onUpdateBoundaryTransitionV2={commitV2BoundaryTransitionChanges}
                  onRemoveBoundaryTransitionV2={commitV2BoundaryTransitionRemove}
                  onUpdateRoutingTransferV2={commitV2RoutingTransferUpdate}
                  onRemoveRoutingTransferV2={commitV2RoutingTransferRemove}
                  onPropertyAnimationChangeV2={commitV2PropertyAnimationChange}
                  onGroupPropertyAnimationChangeV2={commitV2GroupPropertyAnimationChange}
                  onPropertyAnimationChange={(owner, change) => {
                    if (!legacyShow || !inspectorShow?.composition) return false
                    const composition = inspectorShow.composition
                    let next: ShowCompositionV1
                    if (owner.kind === 'group') {
                      next = applyShowGroupPropertyAnimationChange(
                        legacyShow,
                        composition,
                        owner,
                        change,
                        newPersonalContentId,
                      )
                    } else {
                      const scene = inspectorShow.scenes.find((candidate) => candidate.id === owner.sceneId)
                      if (!scene) return false
                      next = change.kind === 'add-track'
                        ? addShowPropertyTrack(legacyShow, composition, owner.sceneId, {
                            id: newPersonalContentId(),
                            target: change.target,
                            keyframes: (change.keyframes ?? [
                              { timeMs: 0, value: change.initialValue, easing: { curve: 'linear' as const } },
                              { timeMs: scene.durationMs, value: change.initialValue, easing: { curve: 'linear' as const } },
                            ]).map((keyframe) => ({ ...keyframe, id: newPersonalContentId() })),
                          })
                        : change.kind === 'update-keyframe'
                          ? updateShowPropertyKeyframe(legacyShow, composition, owner.sceneId, change.trackId, change.keyframeId, change.changes)
                          : change.kind === 'add-keyframe'
                            ? addShowPropertyKeyframe(legacyShow, composition, owner.sceneId, change.trackId, {
                                ...change.keyframe,
                                id: newPersonalContentId(),
                              })
                            : change.kind === 'delete-keyframe'
                              ? deleteShowPropertyKeyframe(composition, owner.sceneId, change.trackId, change.keyframeId)
                              : deleteShowPropertyTrack(composition, owner.sceneId, change.trackId)
                    }
                    if (next === composition) return false
                    updateShowInBackground(legacyShow.id, { ...legacyShow, composition: next, updatedAt: Date.now() })
                    return true
                  }}
                  onUpdateGroupClipInspector={commitGroupClipInspectorPatch}
                  onPreviewClipInspector={previewClipInspectorPatch}
                  onPreviewGroupClipInspector={previewGroupClipInspectorPatch}
                  onPreviewEnd={endInspectorPreview}
                  onMakeCompositionPatternIndependent={(owner) => {
                    if (!legacyShow || !timelineComposition) return
                    const timelineOwner = showTimelineOwnerForInspector(owner)
                    if (!timelineOwner) return
                    const composition = makeShowClipPatternIndependent(timelineComposition, {
                      owner: timelineOwner,
                      newInstanceId: newPersonalContentId(),
                    })
                    if (composition === timelineComposition) return
                    updateShowInBackground(legacyShow.id, { ...legacyShow, composition, updatedAt: Date.now() })
                  }}
                  onRejoinCompositionPattern={(owner, targetInstanceId) => {
                    if (!legacyShow || !timelineComposition) return
                    const timelineOwner = showTimelineOwnerForInspector(owner)
                    if (!timelineOwner) return
                    const composition = rejoinShowClipPatternInstance(timelineComposition, {
                      owner: timelineOwner,
                      targetInstanceId,
                    })
                    if (composition === timelineComposition) return
                    updateShowInBackground(legacyShow.id, { ...legacyShow, composition, updatedAt: Date.now() })
                  }}
                  onMakePatternIndependentV2={(clipId) => {
                    // Independence and rejoin reach the v2 clip-sharing door;
                    // an unchanged or refused plan writes nothing, as v1
                    // returns silently when its composition is unchanged (#1090).
                    const gesture = captureV2Move()
                    if (!gesture) return
                    const plan = createShowV2IndependentIntent(gesture.capture, clipId, newPersonalContentId)
                    if (plan.status !== 'ready') return
                    void commitV2ClipSharing({ ...gesture, intent: plan.intent }).catch(() => {})
                  }}
                  onRejoinPatternV2={(clipId, targetInstanceId) => {
                    const gesture = captureV2Move()
                    if (!gesture) return
                    const plan = createShowV2RejoinIntent(gesture.capture, clipId, targetInstanceId)
                    if (plan.status !== 'ready') return
                    void commitV2ClipSharing({ ...gesture, intent: plan.intent }).catch(() => {})
                  }}
                  onRemoveCompositionClip={(owner) => {
                    if (recordVersion === 2) {
                      const timelineOwner = showTimelineOwnerForInspector(owner)
                      if (!timelineOwner) return
                      requestDeleteClipV2(timelineOwner.placementId, false)
                      return
                    }
                    if (!legacyShow || !timelineComposition) return
                    const timelineOwner = showTimelineOwnerForInspector(owner)
                    if (!timelineOwner) return
                    requestDeleteClip(
                      { kind: 'clip', clipId: timelineOwner.placementId },
                      timelineComposition,
                      timelineOwner,
                    )
                  }}
                  onDuplicateGroup={(occurrenceId) => {
                    if (!legacyShow?.composition) return
                    const occurrence = legacyShow.composition.groupOccurrences?.find((candidate) => candidate.id === occurrenceId)
                    const definition = legacyShow.composition.groupDefinitions?.find((candidate) => candidate.id === occurrence?.definitionId)
                    if (!occurrence || !definition) return
                    const durationMs = Math.max(0, ...definition.placements.map((placement) => placement.startMs + placement.durationMs))
                    const newOccurrenceId = newPersonalContentId()
                    const composition = duplicateShowGroupOccurrence(legacyShow.composition, {
                      occurrenceId,
                      newOccurrenceId,
                      startMs: occurrence.startMs + durationMs,
                    })
                    if (validateShowGroups(legacyShow, composition).length > 0) return
                    updateShow(legacyShow.id, { ...legacyShow, composition, updatedAt: Date.now() })
                      .then(() => selectTimeline({ kind: 'group', occurrenceId: newOccurrenceId }))
                      .catch(() => {})
                  }}
                  onMakeGroupUnique={(occurrenceId) => {
                    if (!legacyShow?.composition) return
                    const composition = makeShowGroupOccurrenceUnique(legacyShow.composition, {
                      occurrenceId,
                      newDefinitionId: newPersonalContentId(),
                    })
                    if (composition === legacyShow.composition) return
                    updateShowInBackground(legacyShow.id, { ...legacyShow, composition, updatedAt: Date.now() })
                  }}
                  onTranslateGroup={(occurrenceId, translationX, translationY) => {
                    if (!legacyShow?.composition) return
                    const composition = translateShowGroupOccurrence(legacyShow.composition, { occurrenceId, translationX, translationY })
                    if (composition === legacyShow.composition) return
                    updateShowInBackground(legacyShow.id, { ...legacyShow, composition, updatedAt: Date.now() })
                  }}
                  onUpdateGroupPlacement={(occurrenceId, patch) => {
                    if (!legacyShow?.composition) return
                    const composition = updateShowGroupOccurrencePlacement(legacyShow.composition, { occurrenceId, ...patch })
                    if (composition === legacyShow.composition || validateShowGroups(legacyShow, composition).length > 0) return
                    updateShowInBackground(legacyShow.id, { ...legacyShow, composition, updatedAt: Date.now() })
                  }}
                  onDeleteGroup={(occurrenceId) => {
                    requestDeleteSelection({ kind: 'group', occurrenceId })
                  }}
                  onUngroup={(occurrenceId) => {
                    if (!legacyShow?.composition) return
                    const composition = ungroupShowGroupOccurrence(legacyShow.composition, occurrenceId)
                    if (composition === legacyShow.composition) return
                    closeDetailPanel()
                    closePinnedDetailForSelection({ kind: 'group', occurrenceId })
                    updateShowInBackground(legacyShow.id, { ...legacyShow, composition, updatedAt: Date.now() })
                  }}
                  onV2GroupOccurrenceRequest={requestV2GroupOccurrenceEdit}
                  onUpdateGroupClipPatternV2={commitV2GroupClipPattern}
                  onUpdateControlTarget={(cell, exportName, value) => {
                    if (!legacyShow) return
                    void updateCellControlTarget(legacyShow.id, cell.id, exportName, value)
                  }}
                  onUpdateRestartOnEntry={(cell, restartOnEntry) => {
                    if (!legacyShow) return
                    void updateCellRestartOnEntry(legacyShow.id, cell.id, restartOnEntry)
                  }}
                  onSpanZones={(cell, zoneSpan) => {
                    if (!legacyShow) return
                    void spanCellZones(legacyShow.id, cell.id, zoneSpan)
                  }}
                  onUpdateCellZoneMode={(cell, zoneMode) => {
                    if (!legacyShow) return
                    void updateCellZoneMode(legacyShow.id, cell.id, zoneMode)
                  }}
                  onUpdateBoundaryTransition={(transitionId, changes) => {
                    if (!legacyShow) return
                    void updateBoundaryTransition(legacyShow.id, transitionId, changes)
                  }}
                  onOpenTransitions={(transitionId) => {
                    transitionPaletteReturnMsRef.current = useShowTransportStore.getState().positionMs
                    transitionPaletteCandidateRef.current = null
                    transitionPaletteCandidateV2Ref.current = null
                    setTransitionPaletteId(transitionId)
                  }}
                  onRemoveBoundaryTransition={(transitionId) => {
                    if (!legacyShow) return
                    closeDetailPanel()
                    closePinnedDetailForSelection({ kind: 'transition', transitionId })
                    void removeBoundaryTransition(legacyShow.id, transitionId)
                  }}
                  onAddZone={() => {
                    if (recordVersion === 2) {
                      timelineWorkspaceRef.current?.focus()
                      commitV2ZonePlan((record) => planShowV2ZoneAdd(record))
                      return
                    }
                    if (!legacyShow) return
                    timelineWorkspaceRef.current?.focus()
                    void addZone(legacyShow.id)
                  }}
                  onUpdateZone={(zoneId, changes) => {
                    if (recordVersion === 2) {
                      commitV2ZonePlan((record) => planShowV2ZoneUpdate(record, zoneId, changes))
                      return
                    }
                    if (!legacyShow) return
                    void updateZone(legacyShow.id, zoneId, changes)
                  }}
                  onRemoveZone={(zoneId) => {
                    if (recordVersion === 2) {
                      closeDetailPanel()
                      closePinnedDetailForSelection({ kind: 'zone', zoneId })
                      commitV2ZonePlan((record) => planShowV2ZoneRemove(record, zoneId))
                      return
                    }
                    if (!legacyShow) return
                    closeDetailPanel()
                    closePinnedDetailForSelection({ kind: 'zone', zoneId })
                    void removeZone(legacyShow.id, zoneId)
                  }}
                  onAddRoutingLayout={(sourceLayoutId) => {
                    if (recordVersion === 2) {
                      commitV2ZonePlan((record) => planShowV2LayoutDuplicate(record, sourceLayoutId ?? ''))
                      return
                    }
                    if (!legacyShow) return
                    void addRoutingLayout(legacyShow.id, sourceLayoutId)
                  }}
                  onUpdateRoutingLayout={(layoutId, changes) => {
                    if (recordVersion === 2) {
                      commitV2ZonePlan((record) => planShowV2LayoutUpdate(record, layoutId, changes))
                      return
                    }
                    if (!legacyShow) return
                    void updateRoutingLayout(legacyShow.id, layoutId, changes)
                  }}
                  onRemoveRoutingLayout={(layoutId) => {
                    if (recordVersion === 2) {
                      commitV2ZonePlan((record) => planShowV2LayoutRemove(record, layoutId))
                      return
                    }
                    if (!legacyShow) return
                    void removeRoutingLayout(legacyShow.id, layoutId)
                  }}
                  onMakeLayoutIntervalUnique={(intervalId) => {
                    if (recordVersion === 2) {
                      if (!savedShowV2 || readOnly) return
                      const capture = preparedV2CaptureRef.current
                      if (!capture || capture.prepared.status === 'refused') return
                      const name = showV2MakeUniqueLayoutName(capture.record, intervalId)
                      if (name === null) return
                      const plan = planShowV2LayoutEdit(capture.record, { kind: 'make-unique', occurrenceId: intervalId, name }, newPersonalContentId)
                      if (plan.status !== 'ready' || plan.intent.kind !== 'make-unique') return
                      const baseRevision = useShowStore.getState().showRevisions[showId] ?? 0
                      const layoutId = plan.intent.layoutId
                      void commitV2LayoutOccurrenceEdit({ capture, baseRevision, intent: plan.intent }).then((applied) => {
                        if (applied) selectTimeline({ kind: 'zone-layout', layoutId, intervalId })
                      }).catch(() => {})
                      return
                    }
                    if (!legacyShow || !timelineComposition) return
                    const basis = { ...legacyShow, composition: timelineComposition }
                    const next = makeShowLayoutIntervalUnique(basis, intervalId)
                    if (next === basis) return
                    updateShow(legacyShow.id, next).then(() => {
                      // Follow the selection onto the unlinked copy.
                      const interval = projectShowLayoutIntervals(next).find((candidate) => candidate.id === intervalId)
                      if (interval) selectTimeline({ kind: 'zone-layout', layoutId: interval.layoutId, intervalId })
                    }).catch(() => {})
                  }}
                  />
                </InspectorReadOnlyContext.Provider>
              </div>
            </ShowEntityDetailPanel>
            )
          })}
          {transitionPaletteId && (legacyShow
            ? legacyShow.transitions?.some((transition) => (
                transition.id === transitionPaletteId && transition.kind !== 'routing'
              ))
            : boundaryTransitionsV2?.[transitionPaletteId] !== undefined) && (
            <ShowTransitionPalette
              // v1 owned this lifecycle by Show id, and still does. A palette
              // is mounted for one boundary at a time, so this also keeps the
              // captured return position and candidate snapshot for its life.
              paletteKey={(legacyShow ?? savedShowV2)?.id ?? ''}
              stageDimensions={(stageDimension ?? 2) as 1 | 2 | 3}
              // v1 keeps every owner the palette used to hold itself: the
              // candidate record, the preview override and the transport seek.
              // The v2 preview builds the same candidate Apply plans and shows
              // it on the Stage without admission, history or save (#1066
              // slice 5c); Apply writes through the transition-edit door
              // (#1066 slice 5b).
              onPreviewItem={(item, presetId) => {
                if (legacyShow) {
                  const changed = legacyPaletteCandidate(legacyShow, transitionPaletteId, item, presetId, (stageDimension ?? 2) as 1 | 2 | 3)
                  useShowPreviewOverrideStore.getState().preview(changed)
                  const boundary = projectShowTimeline(changed).boundaryTransitions
                    .find((entry) => entry.id === transitionPaletteId)
                  if (boundary) {
                    useShowTransportStore.getState().requestSeek(
                      legacyShow.id,
                      boundary.startMs + (boundary.endMs - boundary.startMs) / 2,
                    )
                  }
                  return
                }
                if (recordVersion !== 2 || !savedShowV2) return
                const candidate = v2PaletteCandidate(transitionPaletteId, item, presetId, (stageDimension ?? 2) as 1 | 2 | 3)
                if (!candidate) {
                  useShowPreviewOverrideStore.getState().clear(savedShowV2.id)
                  return
                }
                useShowPreviewOverrideStore.getState().previewV2(candidate)
                const window = projectShowEditorTimelineV2(candidate).transitions
                  .find((entry) => entry.id === transitionPaletteId)
                if (window) {
                  useShowTransportStore.getState().requestSeek(
                    savedShowV2.id,
                    window.startMs + (window.endMs - window.startMs) / 2,
                  )
                }
              }}
              onRestorePreview={() => {
                if (legacyShow) {
                  useShowPreviewOverrideStore.getState().clear(legacyShow.id)
                  useShowTransportStore.getState().requestSeek(legacyShow.id, transitionPaletteReturnMsRef.current)
                  return
                }
                if (recordVersion !== 2 || !savedShowV2) return
                useShowPreviewOverrideStore.getState().clear(savedShowV2.id)
                useShowTransportStore.getState().requestSeek(savedShowV2.id, transitionPaletteReturnMsRef.current)
              }}
              onApplyItem={(item, presetId) => {
                if (!legacyShow) {
                  const applied = commitV2BoundaryPaletteApply(transitionPaletteId, item, presetId, (stageDimension ?? 2) as 1 | 2 | 3)
                  if (applied && savedShowV2) useShowPreviewOverrideStore.getState().clear(savedShowV2.id)
                  return applied
                }
                const changed = legacyPaletteCandidate(legacyShow, transitionPaletteId, item, presetId, (stageDimension ?? 2) as 1 | 2 | 3)
                const transition = changed.transitions?.find((entry) => entry.id === transitionPaletteId)
                if (!transition) return false
                const { id, afterSceneId: _afterSceneId, ...changes } = transition
                // A key the candidate drops (direction on a 1D Stage) must clear the stored value (#1077).
                const current = legacyShow.transitions?.find((entry) => entry.id === transitionPaletteId)
                const cleared: Record<string, undefined> = {}
                for (const key of Object.keys(current ?? {})) {
                  if (key !== 'id' && key !== 'afterSceneId' && !(key in transition)) cleared[key] = undefined
                }
                void updateBoundaryTransition(legacyShow.id, id, { ...cleared, ...changes })
                useShowPreviewOverrideStore.getState().clear(legacyShow.id)
                return true
              }}
              onClose={() => setTransitionPaletteId(null)}
            />
          )}
          {(layerTransitionTarget?.legacy?.kind === 'cut' || layerTransitionTarget?.v2Cut || layerTransitionTarget?.v2GroupCut) && layerTransitionPlan && (
            <ShowLayerTransitionPalette
              stageDimensions={(stageDimension ?? 2) as 1 | 2 | 3}
              maxDurationMs={layerTransitionPlan.maxDurationMs}
              disabledReason={layerTransitionPlan.enabled ? undefined : layerTransitionPlan.reason}
              applyError={layerTransitionApplyError}
              fromName={layerTransitionTarget.fromName}
              toName={layerTransitionTarget.toName}
              onApply={(item, durationMs) => {
                if (layerTransitionTarget.v2Cut) {
                  if (!layerTransitionPlan || !layerTransitionPlan.enabled) return
                  const capture = preparedV2CaptureRef.current
                  if (recordVersion !== 2 || !savedShowV2 || readOnly || !capture || capture.prepared.status === 'refused') return
                  const v2CutPlan = planShowV2TransitionEdit(
                    capture.record,
                    {
                      kind: 'insert',
                      junctionKey: layerTransitionTarget.v2Cut.junctionKey,
                      kindKey: item.key,
                      durationMs: Math.min(Math.round(durationMs), layerTransitionPlan.maxDurationMs),
                      crossfadePolicy: 'live-live',
                    },
                    newPersonalContentId,
                    (stageDimension ?? 2) as 1 | 2 | 3,
                  )
                  if (v2CutPlan.status !== 'ready') {
                    setLayerTransitionApplyError(
                      `${item.label} could not be inserted because the available time at this junction changed. Reopen the Transition panel and try again.`,
                    )
                    return
                  }
                  const baseRevision = useShowStore.getState().showRevisions[showId] ?? 0
                  void commitV2TransitionEdit({ capture, baseRevision, intent: v2CutPlan.intent }).then((outcome) => {
                    if (outcome.status === 'applied') {
                      setLayerTransitionApplyError(null)
                      setLayerTransitionTarget(null)
                    } else {
                      setLayerTransitionApplyError(
                        `${item.label} could not be inserted because the available time at this junction changed. Reopen the Transition panel and try again.`,
                      )
                    }
                  }).catch(() => {
                    setLayerTransitionApplyError(
                      `${item.label} could not be inserted because the available time at this junction changed. Reopen the Transition panel and try again.`,
                    )
                  })
                  return
                }
                if (layerTransitionTarget.v2GroupCut) {
                  if (!layerTransitionPlan || !layerTransitionPlan.enabled) return
                  const groupCut = layerTransitionTarget.v2GroupCut
                  const groupItem = item
                  const groupDurationMs = Math.min(Math.round(durationMs), layerTransitionPlan.maxDurationMs)
                  void requestV2GroupOccurrenceEditApplied({
                    kind: 'insert-definition-layer-transition',
                    occurrenceId: groupCut.occurrenceId,
                    fromClipId: groupCut.fromClipId,
                    toClipId: groupCut.toClipId,
                    kindKey: groupItem.key,
                    durationMs: groupDurationMs,
                  }).then((applied) => {
                    if (applied) {
                      setLayerTransitionApplyError(null)
                      setLayerTransitionTarget(null)
                    } else {
                      setLayerTransitionApplyError(
                        `${groupItem.label} could not be inserted because the available time at this junction changed. Reopen the Transition panel and try again.`,
                      )
                    }
                  }).catch(() => {})
                  return
                }
                if (!legacyShow || !timelineComposition || !layerTransitionPlan.enabled) return
                const legacyJunction = layerTransitionTarget.legacy
                if (!legacyJunction) return
                const changes = showTransitionChangesForPresentation(item, undefined, (stageDimension ?? 2) as 1 | 2 | 3)
                const { kind, durationMs: _catalogueDuration, ...parameters } = changes
                if (!kind || kind === 'cut' || kind === 'routing') return
                const transition: ShowLayerTransition = {
                  ...parameters,
                  id: newPersonalContentId(),
                  fromPlacementId: legacyJunction.fromPlacementId,
                  toPlacementId: legacyJunction.toPlacementId,
                  kind,
                  durationMs: Math.min(durationMs, layerTransitionPlan.maxDurationMs),
                  easing: changes.easing ?? { curve: 'linear' },
                  ...(kind === 'crossfade' ? { crossfadePolicy: 'live-live' } : {}),
                }
                const nextComposition = layerTransitionTarget.groupOccurrenceId
                  ? insertShowGroupLayerTransition(legacyShow, timelineComposition, {
                      occurrenceId: layerTransitionTarget.groupOccurrenceId,
                      transition,
                    })
                  : insertShowLayerTransition(legacyShow, timelineComposition, transition)
                if (nextComposition === timelineComposition) {
                  setLayerTransitionApplyError(
                    `${item.label} could not be inserted because the available time at this junction changed. Reopen the Transition panel and try again.`,
                  )
                  return
                }
                setLayerTransitionApplyError(null)
                setLayerTransitionTarget(null)
                updateShowInBackground(legacyShow.id, {
                  ...legacyShow,
                  composition: nextComposition,
                  updatedAt: Date.now(),
                })
              }}
              onClose={() => {
                setLayerTransitionApplyError(null)
                setLayerTransitionTarget(null)
              }}
            />
          )}
          {layerTransitionTarget?.settings && layerTransitionTarget.settings.kind !== 'cut' && (
            <ShowLayerTransitionEditor
              transition={layerTransitionTarget.settings}
              fromName={layerTransitionTarget.fromName}
              toName={layerTransitionTarget.toName}
              anchor={layerTransitionTarget.anchor}
              onDurationChange={(durationMs) => {
                if (recordVersion === 2) {
                  if (recordVersion !== 2 || !savedShowV2 || readOnly) return
                  const capture = preparedV2CaptureRef.current
                  if (!capture || capture.prepared.status === 'refused') return
                  const groupOccurrenceId = layerTransitionTarget.groupOccurrenceId
                  const groupTransitionId = layerTransitionTarget.groupTransitionId
                  if (groupOccurrenceId && groupTransitionId) {
                    const settledOccurrenceId = groupOccurrenceId
                    const settledTransitionId = groupTransitionId
                    void requestV2GroupOccurrenceEditApplied({ kind: 'resize-definition-layer-transition', occurrenceId: groupOccurrenceId, transitionId: groupTransitionId, durationMs }).then((applied) => {
                      if (applied) setLayerTransitionTarget((current) => (current?.groupOccurrenceId === settledOccurrenceId && current?.groupTransitionId === settledTransitionId ? null : current))
                    }).catch(() => {})
                    return
                  }
                  const transitionId = layerTransitionTarget.transitionId
                  if (!transitionId) return
                  const baseRevision = useShowStore.getState().showRevisions[showId] ?? 0
                  if (durationMs === 0) {
                    const plan = planShowV2TransitionReset(capture.record, transitionId, newPersonalContentId)
                    if (plan.status === 'refused') return
                    // Close only once the door applied the edit, as v1 keeps
                    // its popover open when the owner changed nothing (#1066).
                    void commitV2TransitionEdit({ capture, baseRevision, intent: plan.intent }).then((outcome) => {
                      if (outcome.status === 'applied') setLayerTransitionTarget((current) => (current?.transitionId === transitionId ? null : current))
                    }).catch(() => {})
                    return
                  }
                  void commitV2TransitionResize({ capture, baseRevision, intent: { kind: 'resize-transition', transitionId, durationMs } }).then((applied) => {
                    if (applied) setLayerTransitionTarget((current) => (current?.transitionId === transitionId ? null : current))
                  }).catch(() => {})
                  return
                }
                // Layer Transition resize is not connected for the v2 backing
                // in this tracer; it resolves here before any legacy owner.
                if (!legacyShow || !timelineComposition || !layerTransitionTarget.legacy) return
                const nextComposition = layerTransitionTarget.groupOccurrenceId
                  ? resizeShowGroupLayerTransition(legacyShow, timelineComposition, {
                      occurrenceId: layerTransitionTarget.groupOccurrenceId,
                      transitionId: layerTransitionTarget.legacy.id,
                      durationMs,
                    })
                  : resizeShowLayerTransition(
                      legacyShow,
                      timelineComposition,
                      layerTransitionTarget.legacy.id,
                      durationMs,
                    )
                if (nextComposition === timelineComposition) return
                setLayerTransitionTarget(null)
                updateShowInBackground(legacyShow.id, {
                  ...legacyShow,
                  composition: nextComposition,
                  updatedAt: Date.now(),
                })
              }}
              onResetToCut={() => {
                if (recordVersion === 2) {
                  if (recordVersion !== 2 || !savedShowV2 || readOnly) return
                  const capture = preparedV2CaptureRef.current
                  if (!capture || capture.prepared.status === 'refused') return
                  const groupOccurrenceId = layerTransitionTarget.groupOccurrenceId
                  const groupTransitionId = layerTransitionTarget.groupTransitionId
                  if (groupOccurrenceId && groupTransitionId) {
                    const settledOccurrenceId = groupOccurrenceId
                    const settledTransitionId = groupTransitionId
                    void requestV2GroupOccurrenceEditApplied({ kind: 'resize-definition-layer-transition', occurrenceId: groupOccurrenceId, transitionId: groupTransitionId, durationMs: 0 }).then((applied) => {
                      if (applied) setLayerTransitionTarget((current) => (current?.groupOccurrenceId === settledOccurrenceId && current?.groupTransitionId === settledTransitionId ? null : current))
                    }).catch(() => {})
                    return
                  }
                  const transitionId = layerTransitionTarget.transitionId
                  if (!transitionId) return
                  const plan = planShowV2TransitionReset(capture.record, transitionId, newPersonalContentId)
                  if (plan.status === 'refused') return
                  const baseRevision = useShowStore.getState().showRevisions[showId] ?? 0
                  void commitV2TransitionEdit({ capture, baseRevision, intent: plan.intent }).then((outcome) => {
                    if (outcome.status === 'applied') setLayerTransitionTarget((current) => (current?.transitionId === transitionId ? null : current))
                  }).catch(() => {})
                  return
                }
                // Reset to Cut is unconnected for the v2 backing, exactly as
                // resize is: the control stays offered and changes nothing.
                if (!legacyShow || !timelineComposition || !layerTransitionTarget.legacy) return
                const nextComposition = layerTransitionTarget.groupOccurrenceId
                  ? resizeShowGroupLayerTransition(legacyShow, timelineComposition, {
                      occurrenceId: layerTransitionTarget.groupOccurrenceId,
                      transitionId: layerTransitionTarget.legacy.id,
                      durationMs: 0,
                    })
                  : resetShowLayerTransitionToCut(
                      legacyShow,
                      timelineComposition,
                      layerTransitionTarget.legacy.id,
                    )
                if (nextComposition === timelineComposition) return
                setLayerTransitionTarget(null)
                updateShowInBackground(legacyShow.id, {
                  ...legacyShow,
                  composition: nextComposition,
                  updatedAt: Date.now(),
                })
              }}
              onClose={() => setLayerTransitionTarget(null)}
            />
          )}
          <AlertDialogRoot open={compositionClipPendingDelete !== null || v2ClipPendingDelete !== null} onOpenChange={(open) => { if (!open) { setCompositionClipPendingDelete(null); setV2ClipPendingDelete(null) } }}>
            <AlertDialogContent className="z-[90]">
              <AlertDialogTitle>Remove connected Clip?</AlertDialogTitle>
              <AlertDialogDescription>
                Removing this Clip also removes {pendingConnectedCount === 1
                  ? 'its connected Transition'
                  : `${pendingConnectedCount} connected Transitions`}. Other Clip durations and positions stay unchanged.
              </AlertDialogDescription>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (compositionClipPendingDelete && timelineComposition) {
                      requestDeleteClip(
                        { kind: 'clip', clipId: compositionClipPendingDelete.placementId },
                        timelineComposition,
                        compositionClipPendingDelete,
                        true,
                      )
                    } else if (v2ClipPendingDelete) {
                      requestDeleteClipV2(v2ClipPendingDelete, true)
                    }
                    setCompositionClipPendingDelete(null)
                    setV2ClipPendingDelete(null)
                  }}
                >
                  Remove Clip and Transition
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialogRoot>
        </div>
      </div>
      {timelineMoreBelow && <div
        data-testid="show-timeline-overflow-fade"
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-b from-transparent to-zinc-950"
      />}
      </div>
      <CompileBar
        compiled={compiled}
        artifactInventory={artifactInventory}
        controllerDelivery={compileBarControllerDelivery}
        pushResult={compileBarPushResult}
      />
    </div>
    </FieldActivityContext.Provider>
  )
}

const SHOW_PLAYBACK_RATE_BY_KEY: Readonly<Record<string, number | undefined>> = {
  '1': 1,
  '2': 2,
  '3': 3,
}

function ShowTransportControls({
  showId,
}: {
  showId: string
}) {
  const isRunning = usePreviewStore((state) => state.isRunning)
  const toggle = usePreviewStore((state) => state.toggle)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || showControlOwnsKeyboardEvent(event.target)) return
      if (claimStudioPreviewSpace(event)) {
        usePreviewStore.getState().toggle()
        return
      }
      if (
        !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
        && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
      ) {
        if (event.target instanceof HTMLElement && event.target.closest('[role="treeitem"][aria-expanded]')) return
        const transport = useShowTransportStore.getState()
        if (transport.showId !== showId) return
        event.preventDefault()
        if (event.repeat) return
        const direction = event.key === 'ArrowLeft' ? -1 : 1
        requestShowSeek(showId, transport.positionMs + direction * 5_000)
        return
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey) {
        const playbackRate = SHOW_PLAYBACK_RATE_BY_KEY[event.key]
        if (playbackRate !== undefined) {
          event.preventDefault()
          usePreviewStore.getState().setSpeed(playbackRate)
          return
        }
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        requestShowSeek(showId, 0)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [showId])

  return (
    <div className="flex min-w-0 items-center gap-1" role="group" aria-label="Show transport controls">
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label={isRunning ? 'Pause Show preview' : 'Play Show preview'}
        title={isRunning ? 'Pause Show preview (Space)' : 'Play Show preview (Space)'}
        className={isRunning
          ? 'bg-amber-400/10 text-amber-300 hover:bg-amber-400/15 hover:text-amber-200'
          : 'bg-transparent text-zinc-400 hover:bg-amber-400/10 hover:text-amber-200'}
        onClick={toggle}
      >
        {isRunning ? <Pause size={20} aria-hidden className="size-[20px]" /> : <Play size={20} aria-hidden className="size-[20px]" />}
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="Go to Show start"
        title="Go to Show start (A)"
        className="bg-transparent text-zinc-500 hover:bg-amber-400/10 hover:text-amber-200"
        onPointerUp={(event) => event.currentTarget.blur()}
        onClick={() => requestShowSeek(showId, 0)}
      >
        <SkipBack size={18} aria-hidden className="size-[18px]" />
      </Button>
    </div>
  )
}

function ShowTimeDisplay({ showId, durationMs }: { showId: string; durationMs: number }) {
  const positionMs = useShowTransportStore((state) => state.showId === showId ? state.positionMs : 0)
  return (
    <div className="timeline-time-cluster flex shrink-0 items-center border-l border-zinc-800/80 px-2" role="group" aria-label="Timeline position">
      <output
        className="timeline-time-display flex min-w-[118px] items-baseline gap-0.5 whitespace-nowrap text-xs tabular-nums"
        aria-live="off"
        aria-label="Show time"
      >
        <span className="text-zinc-100">{formatShowTime(positionMs)}</span>
        <span className="timeline-time-separator text-zinc-600" aria-hidden>/</span>
        <span className="text-zinc-500">{formatShowTime(durationMs)}</span>
      </output>
    </div>
  )
}

function useShowTransportClock(showId: string | null, durationMs: number, clockActive: boolean): void {
  const isRunning = usePreviewStore((state) => state.isRunning)
  const seekStatus = useShowTransportStore((state) => (
    showId && state.showId === showId ? state.seekStatus : 'idle'
  ))
  const seekRequest = useShowTransportStore((state) => (
    showId && state.showId === showId ? state.seekRequest : null
  ))

  useEffect(() => {
    if (!showId) return
    useShowTransportStore.getState().openShow(showId, durationMs)
  }, [durationMs, showId])

  useEffect(() => {
    if (!clockActive || seekStatus !== 'rebuilding' || !seekRequest) return
    useShowTransportStore.getState().completeSeek(seekRequest.id, seekRequest.targetMs)
  }, [clockActive, seekRequest, seekStatus])

  useEffect(() => {
    if (!showId || !clockActive || !canAdvanceShowPlayback(isRunning, seekStatus)) return
    let frameId: number | null = null
    let lastFrameAt: number | null = null
    const tick = (now: number) => {
      const transport = useShowTransportStore.getState()
      if (!canAdvanceShowPlayback(usePreviewStore.getState().isRunning, transport.seekStatus)) return
      const last = lastFrameAt ?? now
      lastFrameAt = now
      const deltaMs = Math.max(0, now - last) * usePreviewStore.getState().speed
      const step = resolveShowPlaybackStep(
        transport.positionMs,
        deltaMs,
        transport.playbackWindow,
        durationMs,
      )
      if (step.kind === 'rewind') {
        usePreviewStore.getState().setRunning(false)
        transport.setPosition(showId, step.targetMs)
        frameId = null
        return
      }
      transport.setPosition(showId, step.targetMs)
      frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)
    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId)
    }
  }, [clockActive, durationMs, isRunning, seekStatus, showId])
}

function ShowTimelineHistoryCommands({
  showId,
  recordVersion,
  readOnly,
}: {
  showId: string
  recordVersion: 1 | 2
  readOnly: boolean
}) {
  const undoShow = useShowStore((state) => state.undoShow)
  const redoShow = useShowStore((state) => state.redoShow)
  const undoShowV2 = useShowStore((state) => state.undoShowV2Pilot)
  const redoShowV2 = useShowStore((state) => state.redoShowV2Pilot)
  const history = useShowStore((state) => recordVersion === 2
    ? state.showV2Histories[showId]
    : state.showHistories[showId])
  const undoEnabled = !readOnly && Boolean(history?.past.length)
  const redoEnabled = !readOnly && Boolean(history?.future.length)
  return <>
    <Button
      size="icon-xs"
      variant="ghost"
      aria-label="Undo Show edit"
      title="Undo Show edit (Command/Ctrl+Z)"
      disabled={!undoEnabled}
      className={showTimelineToolbarControlClass({ enabled: undoEnabled })}
      onClick={() => void (recordVersion === 2 ? undoShowV2(showId) : undoShow(showId))}
    >
      <Undo2 size={12} aria-hidden />
    </Button>
    <Button
      size="icon-xs"
      variant="ghost"
      aria-label="Redo Show edit"
      title="Redo Show edit (Command/Ctrl+Shift+Z)"
      disabled={!redoEnabled}
      className={showTimelineToolbarControlClass({ enabled: redoEnabled })}
      onClick={() => void (recordVersion === 2 ? redoShowV2(showId) : redoShow(showId))}
    >
      <Redo2 size={12} aria-hidden />
    </Button>
  </>
}

function ShowTimelineCommands({
  backing,
  timelineView,
  readOnly,
  selection,
  isolatedGroupOccurrenceId,
  onSelect,
  onCreateGroup,
  onSplitCompositionClip,
  onDuplicateCompositionClip,
  onDuplicateCompositionClipV2,
  captureV2ClipEdit,
  onCommitV2ClipTemporal,
}: {
  // One command surface, read through whichever record backs the editor. The
  // v1 record and its planners stay inside the v1 branch (#1065).
  backing:
    | { recordVersion: 1; show: ShowRecord; composition: ShowCompositionV1 | null }
    | { recordVersion: 2; showId: string }
  timelineView: ShowTimelineViewModel
  readOnly: boolean
  selection: ShowSelection
  isolatedGroupOccurrenceId: string | null
  onSelect: (selection: ShowSelection, anchor?: HTMLElement | null) => void
  onCreateGroup: (selection: ShowGroupSelection) => Promise<string | null>
  onSplitCompositionClip: (owner: ShowTimelineClipOwner, globalTimeMs: number) => Promise<string | null>
  onDuplicateCompositionClip: (owner: ShowTimelineClipOwner) => Promise<string | null>
  onDuplicateCompositionClipV2?: (clipId: string) => Promise<string | null>
  captureV2ClipEdit?: () => { capture: ShowV2PilotPreparedCapture; baseRevision: number } | null
  onCommitV2ClipTemporal?: (input: {
    capture: ShowV2PilotPreparedCapture
    baseRevision: number
    intent: ShowClipTemporalIntentV2
  }) => Promise<boolean>
}) {
  const show = backing.recordVersion === 1 ? backing.show : null
  const composition = backing.recordVersion === 1 ? backing.composition : null
  const showId = backing.recordVersion === 1 ? backing.show.id : backing.showId
  const positionMs = useShowTransportStore((state) => state.showId === showId ? state.positionMs : 0)
  const cloneClip = useShowStore((state) => state.cloneClip)
  const commandsV2 = useMemo(() => backing.recordVersion === 2
    ? projectShowEditorTimelineCommandsV2({
        view: timelineView,
        selection: selection.kind === 'clip'
          ? { kind: 'clip', clipId: selection.clipId }
          : selection.kind === 'multi'
            ? {
                kind: 'multi',
                placementIds: selection.groupSelection.placementIds,
                transitionIds: selection.groupSelection.transitionIds,
              }
            : { kind: 'other' },
        playheadMs: positionMs,
        isolatedGroupOccurrenceId,
      })
    : null, [backing.recordVersion, isolatedGroupOccurrenceId, positionMs, selection, timelineView])
  const groupPlan = commandsV2
    ? { ...commandsV2.group, code: 'ready' as const }
    : composition && selection.kind === 'multi'
      ? validateShowGroupSelection(composition, selection.groupSelection)
      : { enabled: false as const, code: 'empty' as const, reason: 'Select two or more Clips to make a Group.' }
  const splitReasonId = `show-split-reason-${showId}`
  const [splitReasonOpen, setSplitReasonOpen] = useState(false)
  const groupReasonId = `show-group-reason-${showId}`
  const cloneReasonId = `show-clone-reason-${showId}`
  const [groupReasonOpen, setGroupReasonOpen] = useState(false)
  const compositionOwner = show && selection.kind === 'clip'
    ? findTimelineClipOwner(composition, selection.clipId)
    : null
  const compositionTimeline = useMemo(() => (
    show && composition ? projectShowUnifiedTimeline(show, composition) : null
  ), [composition, show])
  const compositionClip = compositionOwner
    ? compositionTimeline?.zones.flatMap((zone) => zone.layers.flatMap((layer) => layer.clips))
      .find((clip) => clip.id === compositionOwner.placementId)
    : null
  // Explicit Clip selection wins; a stale Clip or non-Clip inspector can
  // resolve at the playhead. Group and multi selections retain their scope.
  const fallbackBySelectionKind = {
    show: true,
    clip: !compositionOwner,
    transition: true,
    zone: true,
    'zone-layout': true,
    group: false,
    'group-clip': false,
    multi: false,
  } satisfies Record<ShowSelection['kind'], boolean>
  const canResolveAtPlayhead = fallbackBySelectionKind[selection.kind]
  const playheadTarget = canResolveAtPlayhead && compositionTimeline
    ? projectShowTimelineTraversalTargets(compositionTimeline, isolatedGroupOccurrenceId).find((target) => {
        if (target.kind !== 'clip') return false
        const clip = compositionTimeline.zones.flatMap(zone => zone.layers.flatMap(layer => layer.clips))
          .find(candidate => candidate.id === target.clipId)
        return clip && !clip.groupOccurrenceId && positionMs > clip.startMs && positionMs < clip.endMs
      })
    : null
  const splitOwner = isolatedGroupOccurrenceId ? null : compositionOwner ?? (playheadTarget?.kind === 'clip'
    ? findTimelineClipOwner(composition, playheadTarget.clipId)
    : null)
  const splitCapability = commandsV2
    ? { ...commandsV2.split, code: 'ready' as const }
    : show && splitOwner && composition
      ? planShowClipSplitAtGlobalTime(show, composition, {
          owner: splitOwner,
          globalTimeMs: positionMs,
        })
      : { enabled: false as const, code: 'outside-clip' as const, reason: 'Place the playhead inside a Clip.' }
  const legacyCloneCapability = show
    ? showCloneCapability(show, selection)
    : { enabled: false, reason: 'Select one simple Clip to Clone' }
  const compositionClonePlan = show && compositionOwner && composition
    ? planShowClipDuplicateAfter(show, composition, {
        owner: compositionOwner,
        independent: true,
      })
    : null
  const cloneCapability = commandsV2
    ? commandsV2.clone
    : compositionOwner
      ? compositionClip
        && compositionClonePlan?.enabled
        ? { enabled: true, reason: `Duplicate ${compositionClip.patternName} immediately after itself` }
        : {
            enabled: false,
            reason: compositionClonePlan && !compositionClonePlan.enabled
              ? compositionClonePlan.reason
              : 'The selected Clip needs empty time after it on this Layer',
          }
      : legacyCloneCapability

  const cloneSelection = async () => {
    if (!cloneCapability.enabled) return
    if (commandsV2) {
      // Clone commits a linked duplicate through the clip-sharing door (#1090).
      if (selection.kind === 'clip') {
        const copyId = await onDuplicateCompositionClipV2?.(selection.clipId)
        if (copyId) onSelect({ kind: 'clip', clipId: copyId })
      }
      return
    }
    if (!show) return
    if (compositionOwner) {
      const copyId = await onDuplicateCompositionClip(compositionOwner)
      if (copyId) onSelect({ kind: 'clip', clipId: copyId })
      return
    }
    if (selection.kind === 'clip') {
      const copy = await cloneClip(show.id, selection.clipId)
      if (copy) onSelect({ kind: 'clip', clipId: copy.id })
    }
  }
  const splitEnabled = !readOnly && splitCapability.enabled
  const cloneEnabled = !readOnly && cloneCapability.enabled
  const groupEnabled = !readOnly && groupPlan.enabled

  return (
    <div className="flex shrink-0 items-center justify-end gap-[1.5px]" role="group" aria-label="Timeline commands">
      <span className="relative inline-flex">
        <Button
          size="xs"
          variant="ghost"
          aria-label="Split at playhead"
          disabled={readOnly}
          aria-disabled={splitCapability.enabled ? undefined : true}
          aria-describedby={!splitCapability.enabled && splitReasonOpen ? splitReasonId : undefined}
          title={splitCapability.reason}
          className={`px-1.5 text-[10px] ${showTimelineToolbarControlClass({
            enabled: splitEnabled,
          })}`}
          onFocus={() => {
            if (!splitCapability.enabled) setSplitReasonOpen(true)
          }}
          onBlur={() => setSplitReasonOpen(false)}
          onClick={() => {
            if (!splitCapability.enabled) {
              setSplitReasonOpen(true)
              return
            }
            if (usePreviewStore.getState().isRunning) usePreviewStore.getState().toggle()
            if (backing.recordVersion === 2) {
              // The landed capability already gates the control; the planner
              // resolves the same target and refuses a rounded-out playhead
              // before any owner runs. Success selects the new right Clip,
              // exactly as the v1 split selects its new placement.
              const target = resolveShowV2SplitTarget(timelineView, {
                selectionClipId: selection.kind === 'clip' ? selection.clipId : null,
                playheadMs: positionMs,
                isolatedGroupOccurrenceId,
              })
              const gesture = captureV2ClipEdit?.()
              if (!target || !gesture) return
              const rightClipId = newPersonalContentId()
              const gesturePlan = planShowV2ClipSplit(timelineView, {
                clipId: target,
                atMs: Math.round(positionMs),
                rightClipId,
              })
              if (gesturePlan.kind !== 'temporal') return
              void onCommitV2ClipTemporal?.({ ...gesture, intent: gesturePlan.intent }).then((applied) => {
                if (applied) onSelect({ kind: 'clip', clipId: rightClipId })
              }).catch(() => {})
              return
            }
            if (show && splitOwner) {
              void onSplitCompositionClip(splitOwner, positionMs).then((placementId) => {
                if (placementId) onSelect({ kind: 'clip', clipId: placementId })
              }).catch(() => {})
            }
          }}
        >
          <Scissors size={12} aria-hidden />
          <span className="timeline-command-label timeline-command-label-secondary">Split</span>
        </Button>
        {!splitCapability.enabled && splitReasonOpen && (
          <span
            id={splitReasonId}
            role="status"
            aria-label="Split unavailable"
            aria-live="polite"
            className="absolute right-0 top-[calc(100%+5px)] z-40 w-44 rounded border border-amber-400/30 bg-zinc-950 px-2 py-1.5 text-left text-[9px] leading-3 text-amber-200 shadow-lg"
          >
            {splitCapability.reason}
          </span>
        )}
      </span>
      <span className="inline-flex">
        <Button
          size="xs"
          variant="ghost"
          aria-label="Clone selection"
          title={cloneCapability.enabled ? cloneCapability.reason : undefined}
          disabled={readOnly}
          aria-disabled={!cloneEnabled || undefined}
          aria-describedby={!readOnly && !cloneCapability.enabled ? cloneReasonId : undefined}
          className={`px-1.5 text-[10px] ${showTimelineToolbarControlClass({
            enabled: cloneEnabled,
          })}`}
          onClick={() => void cloneSelection()}
        >
          <Copy size={12} aria-hidden />
          <span className="timeline-command-label timeline-command-label-secondary">Clone</span>
        </Button>
        {!readOnly && !cloneCapability.enabled && (
          <DisabledReasonTip id={cloneReasonId}>{cloneCapability.reason}</DisabledReasonTip>
        )}
      </span>
      <span className="relative inline-flex">
        <Button
          size="xs"
          variant="ghost"
          aria-label="Make Group from selection"
          title={groupPlan.enabled ? 'Keep the selected choreography together and make it reusable' : groupPlan.reason}
          disabled={readOnly}
          aria-disabled={!groupPlan.enabled || undefined}
          aria-describedby={!groupPlan.enabled && groupReasonOpen ? groupReasonId : undefined}
          className={`px-1.5 text-[10px] ${showTimelineToolbarControlClass({
            enabled: groupEnabled,
          })}`}
          onFocus={() => {
            if (!groupPlan.enabled) setGroupReasonOpen(true)
          }}
          onBlur={() => setGroupReasonOpen(false)}
          onClick={() => {
            // Both backings submit through onCreateGroup.
            if (commandsV2) {
              if (groupPlan.enabled && selection.kind === 'multi') void onCreateGroup(selection.groupSelection)
              else if (!groupPlan.enabled) setGroupReasonOpen(true)
              return
            }
            if (groupPlan.enabled && show && 'placementIds' in groupPlan) void onCreateGroup(groupPlan)
            else if (!groupPlan.enabled) setGroupReasonOpen(true)
          }}
        >
          <Layers3 size={12} aria-hidden />
          <span className="timeline-command-label timeline-command-label-tertiary">Group</span>
        </Button>
        {!groupPlan.enabled && groupReasonOpen && (
          <span
            id={groupReasonId}
            role="status"
            aria-label="Group unavailable"
            aria-live="polite"
            className="absolute right-0 top-[calc(100%+5px)] z-40 w-48 rounded border border-amber-400/30 bg-zinc-950 px-2 py-1.5 text-left text-[9px] leading-3 text-amber-200 shadow-lg"
          >
            {groupPlan.reason}
          </span>
        )}
      </span>
    </div>
  )
}

function showCloneCapability(show: ShowRecord, selection: ShowSelection): { enabled: boolean; reason: string } {
  if (selection.kind === 'clip') {
    const cell = show.cells.find((candidate) => candidate.id === selection.clipId)
    if (!cell) return { enabled: false, reason: 'The selected Clip no longer exists' }
    if (Math.max(1, cell.sceneSpan) !== 1 || Math.max(1, cell.zoneSpan ?? 1) !== 1) {
      return { enabled: false, reason: 'Held and multi-zone Clips cannot be cloned yet' }
    }
    return { enabled: true, reason: `Clone ${cell.patternName} immediately after itself` }
  }
  return { enabled: false, reason: 'Select one simple Clip to Clone' }
}

function requestShowSeek(showId: string, targetMs: number): void {
  const preview = usePreviewStore.getState()
  const shouldResume = preview.isRunning
  if (shouldResume) preview.toggle()
  const transport = useShowTransportStore.getState()
  transport.setPosition(showId, targetMs)
  transport.requestSeek(showId, targetMs)
  if (shouldResume && !usePreviewStore.getState().isRunning) usePreviewStore.getState().toggle()
}

function showControlOwnsKeyboardEvent(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.closest('[data-show-timeline-focus]') && target.matches('[data-show-timeline-focus]')) return false
  if (target.closest('[data-studio-space-preview="true"]')) return false
  // role="tab" is listed because the Clip detail tabs cannot be <button>: a
  // read-only Show wraps the panel in <fieldset disabled>, which would disable
  // them. Without it, Show shortcuts fire while a tab has focus (#642).
  return target.closest('input, select, textarea, button, a[href], summary, [contenteditable="true"], [role="textbox"], [role="slider"], [role="tab"]') !== null
}

function ExportShowButton({
  exported,
  buildExport,
}: {
  exported: ShowEpeExport | null
  buildExport: () => Promise<ShowEpeExport | null>
}) {
  const { exporting, error, exportShow } = useShowExportAction(exported, buildExport)
  return (
    <Button
      size="xs"
      variant="ghost"
      aria-label="Export Show as .epe"
      title={error ?? 'Export Show as .epe'}
      disabled={!exported || exporting}
      className="bg-zinc-900/60 text-[11px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-40"
      onClick={exportShow}
    >
      {exporting ? <RotateCw size={13} className="animate-spin" aria-hidden /> : <Download size={13} aria-hidden />}
      <span className="show-header-action-label">
        {exporting ? 'Preparing' : error ? 'Export failed' : '.epe'}
      </span>
    </Button>
  )
}

function ShowActionsMenu({
  viewCodeDisabled,
  onViewCode,
  onClone,
  cloneDisabled = false,
  exported,
  buildExport,
  onExportShowFile,
}: {
  viewCodeDisabled: boolean
  onViewCode: () => void
  onClone?: () => void
  cloneDisabled?: boolean
  exported: ShowEpeExport | null
  buildExport: () => Promise<ShowEpeExport | null>
  onExportShowFile: () => Promise<void>
}) {
  const { exporting, error, exportShow } = useShowExportAction(exported, buildExport)
  const [exportingShowFile, setExportingShowFile] = useState(false)
  const [showFileError, setShowFileError] = useState(false)
  const items: ActionsMenuItem[] = [{
    label: 'View code',
    icon: <Code2 {...controlIcon} className="text-zinc-500" aria-hidden />,
    disabled: viewCodeDisabled,
    onSelect: onViewCode,
  }]
  if (onClone) items.push({
    label: cloneDisabled ? 'Cloning' : 'Clone',
    icon: <CopyPlus {...controlIcon} className="text-zinc-500" aria-hidden />,
    disabled: cloneDisabled,
    onSelect: onClone,
  })
  items.push({
    label: exporting ? 'Preparing' : error ? 'Export failed' : 'Download .epe',
    icon: exporting
      ? <RotateCw {...controlIcon} className="animate-spin text-zinc-500" aria-hidden />
      : <Download {...controlIcon} className="text-zinc-500" aria-hidden />,
    disabled: !exported || exporting,
    onSelect: exportShow,
  })
  items.push({
    label: exportingShowFile
      ? 'Exporting Show file'
      : showFileError
        ? 'Show file export failed'
        : 'Export Show file…',
    icon: exportingShowFile
      ? <RotateCw {...controlIcon} className="animate-spin text-zinc-500" aria-hidden />
      : <Download {...controlIcon} className="text-zinc-500" aria-hidden />,
    disabled: exportingShowFile,
    onSelect: () => {
      setExportingShowFile(true)
      setShowFileError(false)
      void onExportShowFile()
        .catch(() => setShowFileError(true))
        .finally(() => setExportingShowFile(false))
    },
  })
  return (
    <ActionsMenu
      label="Show actions"
      items={items}
      portaled
      escapeLayerRank={SHOW_ESCAPE_LAYER_RANK.headerPopover}
    />
  )
}

function useShowExportAction(
  exported: ShowEpeExport | null,
  buildExport: () => Promise<ShowEpeExport | null>,
) {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const exportShow = () => {
    if (!exported || exporting) return
    setExporting(true)
    setError(null)
    void buildExport().then((ready) => {
      if (!ready) return
      const url = URL.createObjectURL(new Blob([ready.text], { type: 'application/json' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = ready.filename
      anchor.style.display = 'none'
      document.body.appendChild(anchor)
      anchor.click()
      window.setTimeout(() => {
        anchor.remove()
        URL.revokeObjectURL(url)
      }, 0)
    }).catch((cause) => {
      setError(cause instanceof Error ? cause.message : 'Export failed')
    }).finally(() => setExporting(false))
  }
  return { exporting, error, exportShow }
}

/**
 * Stretch the last section column by a previewed Show End delta (#1066). v1
 * previews the drag by resizing the final Scene through setShowEndMs, so its
 * per-Scene columns move; a v2 backing has no v1 record, so the previewed end
 * extends the last section column instead. The floor is the one editShowEndMs
 * enforces on the final Scene: a positive duration
 * (src/engine/showTimelineAuthoring.ts refuses `nextFinalDurationMs <= 0`).
 * The input array is never mutated.
 */
function previewShowEndTimeColumns(
  columns: ShowEditorTimeColumnV2[],
  deltaMs: number,
): ShowEditorTimeColumnV2[] {
  const lastSectionIndex = columns.map((column) => column.kind).lastIndexOf('section')
  if (lastSectionIndex < 0) return columns
  return columns.map((column, index) => (
    index === lastSectionIndex
      ? { ...column, durationMs: Math.max(1, Math.round(column.durationMs + deltaMs)) }
      : column
  ))
}

function ShowTimelineWorkspace({
  show,
  timelineViewOverride,
  timeColumnsOverride,
  transitionSettingsOverride,
  boundaryTransitionIdsOverride,
  zoneLayoutsOverride,
  sampleRepeatAtOverride,
  boundaryTransitionsOverride,
  clipSummarySourcesOverride,
  propertyLanesOverride,
  zoneMapOverride,
  recordVersion = 1,
  timelineComposition,
  readOnly,
  transportActive,
  patternControlsByCellId,
  patternControlsByInstanceId,
  selection,
  blockedDeleteFeedback,
  isolatedGroupOccurrenceId,
  onSelect,
  onEnterGroupIsolation,
  onExitGroupIsolation,
  onSelectGroupCandidates,
  onCreateGroup,
  onDismiss,
  onDirectManipulationChange,
  onReanchorDetails,
  patternOptions,
  onAddClipAtPlayhead,
  onMoveCompositionClip,
  onDuplicateCompositionClipAtTarget,
  onAddCompositionLayer,
  onSplitCompositionClip,
  onDuplicateCompositionClip,
  onDuplicateCompositionClipV2,
  onResizeCompositionClip,
  onOpenLayerTransition,
  onInsertTime,
  onAddMarker,
  onMoveMarker,
  onUpdateMarker,
  onRemoveMarker,
  onSetShowEnd,
  onAppendLayoutInterval,
  onInsertLayoutInterval,
  onDuplicateLayoutInterval,
  onMakeLayoutIntervalUnique,
  onAddZone,
  onUpdateZone,
  onRemoveZone,
  captureV2Move,
  captureV2ClipEdit,
  onCommitV2ClipTemporal,
  onCommitV2ClipSharing,
  onCommitV2TransitionResize,
}: {
  show: ShowRecord | null
  timelineViewOverride?: ShowTimelineViewModel | null
  /**
   * The time grid's section and boundary columns, on a backing that has no v1
   * Scene list to read them from. The Layouts lane draws one cell per section
   * column and the boundary controls draw between them, so both backings have
   * to resolve the same tracks or the whole timeline lays out on a different
   * sub-pixel origin (#1065).
   */
  timeColumnsOverride?: ShowEditorTimeColumnV2[] | null
  /** Authored Transition settings the pictogram reads when no v1 record backs the view. */
  transitionSettingsOverride?: Record<string, ShowTransitionSettingsCarrier> | null
  /**
   * Which Transitions v1's boundary inspector owns, on a backing that has no
   * v1 junction record to ask. Conversion records the family, so a converted
   * boundary Transition opens the boundary panel even where it landed at Layer
   * participant scope; nothing is inferred from a junction's drawn scope.
   */
  boundaryTransitionIdsOverride?: ReadonlySet<string> | null
  /** Authored Zone Layout definitions the kind label reads when no v1 record backs the view. */
  zoneLayoutsOverride?: readonly ShowRoutingLayout[] | null
  /** The v2 record's repeat scale at a Show time, present only when the sample-repeat lane shows (#1066 slice 9c1). */
  sampleRepeatAtOverride?: ((timeMs: number) => number) | null
  /** v2 boundary Transitions by id, read by the Sample repeat lane's boundary buttons (#1066 slice 9c2b). */
  boundaryTransitionsOverride?: Record<string, ShowBoundaryTransitionInspectorValue> | null
  /** Resolved Clip-summary facts the caption reads when no v1 record backs the view. */
  clipSummarySourcesOverride?: Record<string, ShowEditorTimelineClipSummarySourceV2> | null
  /** Presented Property lanes when no v1 record backs the view. */
  propertyLanesOverride?: readonly ShowEditorPropertyLaneV2[] | null
  /** Presented Zone Map entries when no v1 record backs the view. */
  zoneMapOverride?: ShowEditorZoneMapV2 | null
  recordVersion?: 1 | 2
  timelineComposition: ShowCompositionV1 | null
  readOnly: boolean
  transportActive: boolean
  patternControlsByCellId: Record<string, AutomatablePatternControl[]>
  patternControlsByInstanceId: Record<string, AutomatablePatternControl[]>
  selection: ShowSelection
  blockedDeleteFeedback: BlockedDeleteFeedback | null
  isolatedGroupOccurrenceId: string | null
  onSelect: (selection: ShowSelection, anchor?: HTMLElement | null) => void
  onEnterGroupIsolation: (occurrenceId: string, placementId: string, anchor: HTMLElement) => void
  onExitGroupIsolation: () => void
  onSelectGroupCandidates: (selection: ShowGroupSelection) => void
  onCreateGroup: (selection: ShowGroupSelection) => Promise<string | null>
  onDismiss: () => void
  onDirectManipulationChange: (active: boolean) => void
  onReanchorDetails: (selection: ShowSelection) => void
  patternOptions: ShowPatternOption[]
  onAddClipAtPlayhead: (input: {
    zoneId: string
    globalTimeMs: number
    target?: ShowClipAddTarget
    layerId?: string
    pattern: ShowCell['pattern']
    patternName: string
  }) => Promise<string | null>
  onMoveCompositionClip: (input: {
    owner: ShowTimelineClipOwner
    target: ShowTimelineClipMoveTarget
    sourceComposition?: ShowCompositionV1
    plannedComposition?: ShowCompositionV1
  }) => Promise<boolean>
  onDuplicateCompositionClipAtTarget: (input: {
    sourceComposition: ShowCompositionV1
    plannedComposition: ShowCompositionV1
  }) => Promise<boolean>
  onAddCompositionLayer: (zoneId: string) => Promise<boolean>
  onSplitCompositionClip: (owner: ShowTimelineClipOwner, globalTimeMs: number) => Promise<string | null>
  onDuplicateCompositionClip: (owner: ShowTimelineClipOwner) => Promise<string | null>
  onDuplicateCompositionClipV2?: (clipId: string) => Promise<string | null>
  onResizeCompositionClip: (input: {
    owner: ShowTimelineClipOwner,
    globalStartMs: number,
    durationMs: number,
    sourceComposition: ShowCompositionV1
  }) => Promise<boolean>
  onOpenLayerTransition: (target: ShowLayerTransitionTarget) => void
  onInsertTime: (atMs: number, durationMs: number) => Promise<boolean>
  onAddMarker: (timeMs: number) => Promise<boolean>
  onMoveMarker: (markerId: string, timeMs: number) => Promise<boolean>
  onUpdateMarker: (markerId: string, patch: Partial<Omit<NonNullable<ShowCompositionV1['markers']>[number], 'id'>>) => Promise<boolean>
  onRemoveMarker: (markerId: string) => Promise<boolean>
  onSetShowEnd: (durationMs: number) => Promise<boolean>
  onAppendLayoutInterval: (sourceLayoutId: string | undefined, durationMs: number) => Promise<boolean>
  onInsertLayoutInterval: (sourceLayoutId: string | undefined, durationMs: number, atMs: number) => Promise<boolean>
  onDuplicateLayoutInterval: (intervalId: string, withContent: boolean) => Promise<boolean>
  onMakeLayoutIntervalUnique: (intervalId: string) => Promise<boolean>
  onAddZone: () => void
  onUpdateZone: (zoneId: string, changes: Partial<ShowRecord['zones'][number]>) => void
  onRemoveZone: (zoneId: string) => void
  captureV2Move?: () => { capture: ShowV2PilotPreparedCapture; baseRevision: number } | null
  captureV2ClipEdit?: () => { capture: ShowV2PilotPreparedCapture; baseRevision: number } | null
  onCommitV2ClipTemporal?: (input: {
    capture: ShowV2PilotPreparedCapture
    baseRevision: number
    intent: ShowClipTemporalIntentV2
  }) => Promise<boolean>
  onCommitV2ClipSharing?: (input: {
    capture: ShowV2PilotPreparedCapture
    baseRevision: number
    intent: ShowV2PilotClipSharingIntent
  }) => Promise<boolean>
  onCommitV2TransitionResize?: (input: {
    capture: ShowV2PilotPreparedCapture
    baseRevision: number
    intent: ShowV2PilotTransitionResizeIntent
  }) => Promise<boolean>
}) {
  const [showEndPreviewMs, setShowEndPreviewMs] = useState<number | null>(null)
  const [markerFeedback, setMarkerFeedback] = useState<TimelineMarkerFeedback | null>(null)
  const displayShow = useMemo(() => {
    if (!show || showEndPreviewMs === null || !timelineComposition) return show
    return setShowEndMs({ ...show, composition: timelineComposition }, showEndPreviewMs)
  }, [show, showEndPreviewMs, timelineComposition])
  const strip = displayShow ? projectShowStrip(displayShow) : null
  const timeline = displayShow ? projectShowTimeline(displayShow) : null
  const agentDrawer = useAgentDrawerStore(state => state.state)
  const agentController = useAgentDrawerStore(state => state.controller)
  const legacyLayoutIntervals = useMemo(() => displayShow ? projectShowLayoutIntervals(displayShow) : [], [displayShow])
  const unifiedCompositionTimeline = useMemo(() => (
    displayShow && timelineComposition
      ? projectShowUnifiedTimeline(displayShow, timelineComposition)
      : null
  ), [displayShow, timelineComposition])
  // One version-agnostic description of the surface this workspace draws. The
  // v1 record reaches it through the adapter; slices 2-6 move the remaining
  // gesture and inspector seams onto the same view.
  const baseTimelineView = (timelineViewOverride ?? (displayShow && timeline && strip
    ? fromShowTimelineProjection({
        showId: displayShow.id,
        timeline,
        strip,
        unified: unifiedCompositionTimeline,
        layoutIntervals: legacyLayoutIntervals,
        markers: timelineComposition?.markers ?? [],
      })
    : null))!
  // The Show End drag preview basis. The v1 preview reaches the view through
  // displayShow above; a v2 backing has no v1 record, so the previewed end
  // overrides the v2-projected view directly. Read-only: nothing here writes,
  // and the commit path never reads preview state (row 98, #1066 slice 6).
  // Memoized so the override keeps a stable identity while the preview is off.
  const timelineView = useMemo(() => (
    showEndPreviewMs === null || show
      ? baseTimelineView
      : { ...baseTimelineView, showEndMs: showEndPreviewMs }
  ), [baseTimelineView, show, showEndPreviewMs])
  const showId = timelineView.showId
  const layoutIntervals = timelineView.layoutIntervals
  // v1 traverses its unified composition; a flat Show has none and keeps its
  // existing no-traversal behaviour. The authored-v2 backing has no v1 sidecar
  // at all, so it reads the same order from the presented timeline.
  const traversalTargets = useMemo(() => {
    if (unifiedCompositionTimeline) {
      return projectShowTimelineTraversalTargets(unifiedCompositionTimeline, isolatedGroupOccurrenceId)
    }
    return show ? [] : projectShowTimelineViewTraversalTargets(timelineView, isolatedGroupOccurrenceId)
  }, [isolatedGroupOccurrenceId, show, timelineView, unifiedCompositionTimeline])
  // The isolation banner names the Group from the presented timeline, which
  // both backings supply; the v1 sidecar is not the only place that name lives.
  const isolatedGroupView = isolatedGroupOccurrenceId
    ? timelineView.rows
      .flatMap((row) => row.groups)
      .find((group) => group.id === isolatedGroupOccurrenceId) ?? null
    : null
  useEffect(() => {
    const hovered = useShowClipHoverStore.getState().hoveredClipId
    if (!hovered) return
    const exists = unifiedCompositionTimeline?.zones.some((zone) =>
      zone.layers.some((layer) => layer.clips.some((clip) => clip.id === hovered)))
    if (!exists) useShowClipHoverStore.getState().resetHoveredClip()
  }, [unifiedCompositionTimeline])
  const fittedViewport = useMemo(() => fitShowTimelineViewport(timelineView.showEndMs), [timelineView.showEndMs])
  const storedViewport = useShowEditorViewStore((state) => state.viewport) ?? fittedViewport
  const timelineAliveRef = useRef(true)
  useEffect(() => {
    timelineAliveRef.current = true
    return () => { timelineAliveRef.current = false }
  }, [])
  const timelineViewEpoch = useShowEditorViewStore((state) => state.viewEpoch)
  const setViewport = useCallback((viewport: ShowTimelineViewport | null) => {
    if (!timelineAliveRef.current) return
    useShowEditorViewStore.getState().setViewport(viewport, timelineViewEpoch)
  }, [timelineViewEpoch])
  const snapEnabled = useShowEditorSessionStore((state) => state.snapEnabled)
  const setSnapEnabled = useShowEditorSessionStore((state) => state.setSnapEnabled)
  const markersVisible = useShowEditorSessionStore((state) => state.markersVisible)
  const setMarkersVisible = useShowEditorSessionStore((state) => state.setMarkersVisible)
  const setMarkerSnapEnabled = useShowEditorSessionStore((state) => state.setMarkerSnapEnabled)
  const zonesOpen = useShowEditorSessionStore((state) => (
    state.zoneWorkspaceOpenByShowId[showId] ?? stockShowById(showId)?.zonesOpenByDefault ?? false
  ))
  const collapsedZoneIds = useShowEditorSessionStore((state) => state.collapsedZoneIdsByShowId[showId]) ?? EMPTY_ZONE_IDS
  const focusedZoneId = useShowEditorSessionStore((state) => state.focusedZoneIdByShowId[showId] ?? null)
  const setZoneWorkspaceOpen = useShowEditorSessionStore((state) => state.setZoneWorkspaceOpen)
  const setZoneCollapsed = useShowEditorSessionStore((state) => state.setZoneCollapsed)
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])
  const [draggingCompositionClip, setDraggingCompositionClip] = useState<{
    clipId: string
    owner?: ShowTimelineClipOwner
    grabOffsetMs: number
    mode: 'move' | 'duplicate'
    duplicatePlacementId: string | null
    duplicateInstanceId: string | null
    v2Move?: { capture: ShowV2PilotPreparedCapture; baseRevision: number }
    settling?: boolean
  } | null>(null)
  const [pendingV2ClipMove, setPendingV2ClipMove] = useState<{
    plan: { clipId: string; zoneId: string; layerId: string; startMs: number }
    transitionCount: number
  } | null>(null)
  const draggingCompositionClipRef = useRef(draggingCompositionClip)
  const movePointerCleanupRef = useRef<(() => void) | null>(null)
  const refreshMoveActivity = useFieldActivity(() => draggingCompositionClipRef.current !== null)
  useLayoutEffect(() => () => {
    movePointerCleanupRef.current?.()
    movePointerCleanupRef.current = null
    draggingCompositionClipRef.current = null
  }, [])
  const [resizePreview, setResizePreview] = useState<ShowClipResizePreview | null>(null)
  const resizePlanRef = useRef<ShowClipResizePlan | null>(null)
  const resizeGestureRef = useRef<(() => void) | null>(null)
  const refreshResizeActivity = useFieldActivity(() => resizeGestureRef.current !== null)
  useLayoutEffect(() => () => { resizeGestureRef.current?.(); resizeGestureRef.current = null }, [])
  const suppressResizeClipClickRef = useRef<string | null>(null)
  const [movePreview, setMovePreview] = useState<ShowClipMovePreview | null>(null)
  const movePlanRef = useRef<ShowClipMovePlan | null>(null)
  const activeMoveLayerRef = useRef<{
    element: HTMLElement
    layer: ShowTimelineLayerView
    zoneId: string
    targetKey: string
  } | null>(null)
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null)
  const [marquee, setMarquee] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [addPopoverAnchor, setAddPopoverAnchor] = useState<HTMLButtonElement | null>(null)
  const [addClipOpen, setAddClipOpen] = useState(false)
  const [addClipPointerContext, setAddClipPointerContext] = useState<{
    anchor: HTMLElement
    point: { clientX: number; clientY: number }
    zoneId: string
    target: ShowClipAddTarget
    layerId?: string
  } | null>(null)
  const [addClipSubmitting, setAddClipSubmitting] = useState(false)
  const [insertTimeOpen, setInsertTimeOpen] = useState(false)
  const [insertTimeSeconds, setInsertTimeSeconds] = useState(1)
  const [insertTimeAtMs, setInsertTimeAtMs] = useState(0)
  const [layoutActionsOpen, setLayoutActionsOpen] = useState(false)
  const [zoneMapOpen, setZoneMapOpen] = useState(false)
  const [zoneMapAnchor, setZoneMapAnchor] = useState<HTMLButtonElement | null>(null)
  const [layoutActionTimeMs, setLayoutActionTimeMs] = useState(0)
  const [layoutActionDurationSeconds, setLayoutActionDurationSeconds] = useState(5)
  const [layoutActionError, setLayoutActionError] = useState<string | null>(null)
  const [addClipTimeMs, setAddClipTimeMs] = useState(0)
  const [addClipPatternKey, setAddClipPatternKey] = useState<string | null>(null)
  const selectedCompositionZoneId = selection.kind === 'zone'
    ? selection.zoneId
    : selection.kind === 'clip'
      ? unifiedCompositionTimeline?.zones.find((zone) => (
          zone.layers.some((layer) => layer.clips.some((clip) => clip.id === selection.clipId))
        ))?.id
      : null
  const preferredAuthoringZoneId = selectedCompositionZoneId ?? focusedZoneId
  // The authored v2 backing the presented timeline draws. The palette
  // recomputes its own plan from the same record when it opens.
  const savedShowV2 = useShowStore((state) => state.showV2Pilots[showId])
  const addClipZoneId = addClipPointerContext?.zoneId
    ?? (show
      ? showLayoutZoneIdAtTime(show, addClipTimeMs, preferredAuthoringZoneId)
      : recordVersion === 2 && savedShowV2
        ? showLayoutZoneIdAtTimeV2(savedShowV2, addClipTimeMs, preferredAuthoringZoneId)
          ?? preferredAuthoringZoneId ?? timelineView.rows[0]?.zoneId
        : preferredAuthoringZoneId ?? timelineView.rows[0]?.zoneId)
  const v2AddClipRecord = recordVersion === 2 ? captureV2Move?.()?.capture.record ?? null : null
  const v2PointerLayerId = recordVersion === 2 ? addClipPointerContext?.layerId ?? null : null
  const v2ExactAddClipPlan = v2AddClipRecord && addClipPointerContext && v2PointerLayerId
    ? planShowV2ClipAtTime(v2AddClipRecord, {
        zoneId: addClipPointerContext.zoneId,
        layerId: v2PointerLayerId,
        globalTimeMs: addClipTimeMs,
      })
    : null
  const v2TopmostAddClipPlan = v2AddClipRecord && !v2PointerLayerId && addClipZoneId
    ? planShowV2ClipAtTopmostAvailableLayer(v2AddClipRecord, {
        zoneId: addClipZoneId,
        globalTimeMs: addClipTimeMs,
      })
    : null
  const v2EnabledAddClipPlan = v2ExactAddClipPlan?.enabled ? v2ExactAddClipPlan : v2TopmostAddClipPlan
  const exactAddClipPlan = show && timelineComposition && addClipPointerContext
    ? planShowClipAtGlobalTime(show, timelineComposition, {
        zoneId: addClipPointerContext.zoneId,
        globalTimeMs: addClipTimeMs,
        target: addClipPointerContext.target,
      })
    : null
  const addClipDestination = recordVersion === 2
    ? (v2EnabledAddClipPlan ? { v2plan: v2EnabledAddClipPlan } : null)
    : addClipPointerContext
    ? exactAddClipPlan?.enabled
      ? { target: addClipPointerContext.target, plan: exactAddClipPlan }
      : null
    : show && timelineComposition && addClipZoneId
      ? planShowClipAtTopmostAvailableLayer(show, timelineComposition, {
          zoneId: addClipZoneId,
          globalTimeMs: addClipTimeMs,
        })
      : null
  const transport = useShowTransportStore.getState()
  const layerTargetTimeMs = transport.showId === showId ? transport.positionMs : 0
  const layerTargetZoneId = show
    ? showLayoutZoneIdAtTime(show, layerTargetTimeMs, preferredAuthoringZoneId)
    : recordVersion === 2 && savedShowV2
      ? showLayoutZoneIdAtTimeV2(savedShowV2, layerTargetTimeMs, preferredAuthoringZoneId)
        ?? preferredAuthoringZoneId ?? timelineView.rows[0]?.zoneId
      : preferredAuthoringZoneId ?? timelineView.rows[0]?.zoneId
  const layerTargetZoneName = timelineView.rows.find((zone) => zone.zoneId === layerTargetZoneId)?.zoneName ?? 'Zone'
  const insertTimeDurationMs = Math.round(insertTimeSeconds * 1000)
  // The dialog plans from whichever backing the workspace draws. On v2 the
  // pure owner dry-runs the insertion, so a refused point explains itself with
  // the owner's message and the v1-only fallback never shows (#1090).
  const insertTimePlan = useMemo(() => {
    if (recordVersion === 2) {
      if (!savedShowV2) return { enabled: false as const, reason: 'No Show is open.' }
      const result = insertShowTimeV2(savedShowV2, { atMs: Math.max(0, Math.round(insertTimeAtMs)), durationMs: insertTimeDurationMs })
      if (result.status === 'changed') return { enabled: true as const }
      return { enabled: false as const, reason: result.message }
    }
    return show
      ? planShowTimeInsertion(
          timelineComposition ? { ...show, composition: timelineComposition } : show,
          insertTimeAtMs,
          insertTimeDurationMs,
        )
      : { enabled: false as const, reason: 'That operation is not available at this time.' }
  }, [insertTimeAtMs, insertTimeDurationMs, recordVersion, savedShowV2, show, timelineComposition])
  const selectedTransitionClipId = selection.kind === 'clip'
    ? selection.clipId
    : selection.kind === 'group-clip'
      ? `${selection.occurrenceId}:${selection.placementId}`
      : null
  const addTransitionPlan = useMemo(() => {
    // On v2 the Add menu resolves from the selected Clip through the v2
    // timeline presentation, reusing the G4b-2b and G4b-2c junction targets;
    // v1 keeps its unified-composition plan unchanged.
    if (recordVersion === 2 && savedShowV2) {
      return planShowV2LayerTransitionInsertionForClip(savedShowV2, selectedTransitionClipId)
    }
    return show && timelineComposition
      ? planShowLayerTransitionInsertionForClip(show, timelineComposition, selectedTransitionClipId)
      : { enabled: false as const, maxDurationMs: 0 as const, reason: 'Select a Clip first.', target: null }
  }, [recordVersion, savedShowV2, selectedTransitionClipId, show, timelineComposition])
  const addTransitionLabel = addTransitionPlan.target
    ? `Transition ${addTransitionPlan.target.side === 'after' ? 'to' : 'from'} ${addTransitionPlan.target.side === 'after'
      ? addTransitionPlan.target.toName
      : addTransitionPlan.target.fromName}`
    : 'Transition'

  const beginGroupMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (readOnly || isolatedGroupOccurrenceId || event.button !== 0 || (recordVersion !== 2 && !timelineComposition)) return
    const target = event.target
    if (target instanceof Element && target.closest('button, input, select, textarea, [role="slider"], [data-show-layer-junction]')) return
    const grid = event.currentTarget
    const gridRect = grid.getBoundingClientRect()
    const startX = Math.max(0, Math.min(gridRect.width, event.clientX - gridRect.left))
    const startY = Math.max(0, Math.min(gridRect.height, event.clientY - gridRect.top))
    let currentX = startX
    let currentY = startY
    onDirectManipulationChange(true)
    const render = () => setMarquee({
      left: Math.min(startX, currentX),
      top: Math.min(startY, currentY),
      width: Math.abs(currentX - startX),
      height: Math.abs(currentY - startY),
    })
    const move = (pointer: PointerEvent) => {
      currentX = Math.max(0, Math.min(gridRect.width, pointer.clientX - gridRect.left))
      currentY = Math.max(0, Math.min(gridRect.height, pointer.clientY - gridRect.top))
      render()
    }
    const finish = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
      const selectionRect = {
        left: gridRect.left + Math.min(startX, currentX),
        right: gridRect.left + Math.max(startX, currentX),
        top: gridRect.top + Math.min(startY, currentY),
        bottom: gridRect.top + Math.max(startY, currentY),
      }
      const placementIds = [...grid.querySelectorAll<HTMLElement>('[data-show-composition-clip="true"]:not([data-show-group-occurrence])')]
        .filter((element) => {
          const rect = element.getBoundingClientRect()
          return rect.right >= selectionRect.left
            && rect.left <= selectionRect.right
            && rect.bottom >= selectionRect.top
            && rect.top <= selectionRect.bottom
        })
        .map((element) => element.dataset.showSelectionKey?.replace(/^clip:/, ''))
        .filter((id): id is string => Boolean(id))
      setMarquee(null)
      onDirectManipulationChange(false)
      if (placementIds.length > 0) {
        if (recordVersion === 2) {
          onSelectGroupCandidates(completeShowGroupSelectionV2(timelineView, placementIds))
        } else if (timelineComposition) {
          onSelectGroupCandidates(completeShowGroupSelection(timelineComposition, placementIds))
        }
      }
    }
    const cancel = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
      setMarquee(null)
      onDirectManipulationChange(false)
    }
    render()
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', cancel)
  }
  const hasMultipleZones = timelineView.rows.length > 1
  const showFullZoneHeaders = zonesOpen
  const showMicroZonePicker = hasMultipleZones && !zonesOpen
  const collapsedZoneIdSet = new Set(hasMultipleZones ? collapsedZoneIds : [])
  const addClipPattern = patternOptions.find((option) => (
    `${option.ref.kind}:${option.ref.id}` === addClipPatternKey
  )) ?? null
  const chooseAddClipPattern = (patternKey: string) => {
    if (addClipSubmitting || !addClipZoneId || !addClipDestination) return
    const pattern = patternOptions.find((option) => (
      `${option.ref.kind}:${option.ref.id}` === patternKey
    ))
    if (!pattern) return
    setAddClipPatternKey(patternKey)
    setAddClipSubmitting(true)
    const clipRequest = 'v2plan' in addClipDestination
      ? { layerId: addClipDestination.v2plan.layerId }
      : { target: addClipDestination.target }
    void onAddClipAtPlayhead({
      zoneId: addClipZoneId,
      globalTimeMs: addClipTimeMs,
      ...clipRequest,
      pattern: pattern.ref,
      patternName: pattern.label,
    }).then((placementId) => {
      if (!placementId) return
      setAddClipOpen(false)
      setAddClipPointerContext(null)
      onSelect({ kind: 'clip', clipId: placementId })
    }).catch(() => {}).finally(() => setAddClipSubmitting(false))
  }
  // The Layout actions read the occurrence under the playhead from whichever
  // record backs the editor; the same selection rule serves both (#1065).
  const layoutActionIntervals = show
    ? legacyLayoutIntervals.map((interval) => ({
        id: interval.id, layoutId: interval.layoutId, startMs: interval.startMs, endMs: interval.endMs,
      }))
    : layoutIntervals.map((interval) => ({
        id: interval.id, layoutId: interval.definitionId, startMs: interval.startMs, endMs: interval.endMs,
      }))
  const layoutActionInterval = showLayoutIntervalAtTime(layoutActionIntervals, layoutActionTimeMs)
  const layoutActionDurationMs = Math.round(layoutActionDurationSeconds * 1000)
  const layoutActionDurationValid = Number.isFinite(layoutActionDurationMs) && layoutActionDurationMs >= 1
  const layoutActionUseCount = layoutActionInterval
    ? layoutActionIntervals.filter((interval) => interval.layoutId === layoutActionInterval.layoutId).length
    : 0
  const runLayoutAction = (action: () => Promise<boolean>) => {
    setLayoutActionError(null)
    const failureBefore = useShowStore.getState().showSaveFailure
    void action().then((changed) => {
      if (changed) {
        setLayoutActionsOpen(false)
        return
      }
      // A fresh save failure means persistence refused the edit, not the
      // timeline structure; the rollback notice owns that report (#792).
      const failureAfter = useShowStore.getState().showSaveFailure
      if (failureAfter && failureAfter !== failureBefore) return
      setLayoutActionError('That operation is not available at this time. Move the playhead outside a Transition and leave enough room to split occupied Clips.')
    }).catch(() => {})
  }
  let viewport = storedViewport
  if (viewport.totalMs !== fittedViewport.totalMs) {
    const zoom = viewport.totalMs / viewport.durationMs
    const transport = useShowTransportStore.getState()
    const anchorMs = transport.showId === showId ? transport.positionMs : 0
    viewport = zoomShowTimelineViewport(fittedViewport, zoom, Math.min(anchorMs, fittedViewport.totalMs))
  }
  // Persist the rescaled range outside the render pass: a store write during
  // render would notify subscribers mid-render, unlike the local useState
  // this slice replaced.
  const reconciledViewport = viewport
  useEffect(() => {
    if (reconciledViewport !== storedViewport) setViewport(reconciledViewport)
  }, [reconciledViewport, setViewport, storedViewport])
  const scrollRef = useRef<HTMLDivElement>(null)
  const timelineRulerRef = useRef<HTMLDivElement>(null)
  const initialTransport = useShowTransportStore.getState()
  const positionMsRef = useRef(initialTransport.showId === showId ? initialTransport.positionMs : 0)
  useEffect(() => {
    return useShowTransportStore.subscribe((state) => {
      if (state.showId === showId) positionMsRef.current = state.positionMs
    })
  }, [showId])
  const markerTimesMs = markersVisible
    ? timelineView.markers.map((marker) => marker.timeMs)
    : []
  const structuralTimesWithoutMarkersMs = timelineView.structuralTimesMs
  const structuralTimesMs = [...new Set([
    ...structuralTimesWithoutMarkersMs,
    ...markerTimesMs,
  ])]
  const clipMarkerSnapEnabled = markersVisible
  const clipDragStructuralTimesMs = () => [
    positionMsRef.current,
    ...(snapEnabled ? structuralTimesWithoutMarkersMs : []),
    ...(clipMarkerSnapEnabled ? markerTimesMs : []),
  ]
  // Timeline drops are quantized by default: whole seconds, or tenths while
  // Shift is held (#667). Boundary magnetism (Clip edges, Markers, the
  // playhead) still wins within its pixel threshold; the Magnet toggle
  // governs that magnetism only. Alt is the per-gesture escape to raw
  // milliseconds — it no longer inverts the Magnet toggle.
  const snapClipBoundary = (
    candidateMs: number,
    options: {
      altKey: boolean
      shiftKey: boolean
      visibleWidthPx: number
      minTimeMs?: number
      maxTimeMs: number
    },
  ) => {
    const minTimeMs = options.minTimeMs ?? 0
    if (options.altKey) {
      return snapShowTimelineTime(candidateMs, {
        visibleDurationMs: viewport.durationMs,
        visibleWidthPx: options.visibleWidthPx,
        structuralTimesMs: [],
        gridEnabled: false,
        minTimeMs,
        maxTimeMs: options.maxTimeMs,
      })
    }
    const activeStructuralTimesMs = [
      positionMsRef.current,
      ...(snapEnabled ? structuralTimesWithoutMarkersMs : []),
      ...(clipMarkerSnapEnabled ? markerTimesMs : []),
    ]
      .filter((timeMs) => timeMs >= minTimeMs && timeMs <= options.maxTimeMs)
    return snapShowTimelineTime(candidateMs, {
      visibleDurationMs: viewport.durationMs,
      visibleWidthPx: options.visibleWidthPx,
      structuralTimesMs: activeStructuralTimesMs,
      quantizeStepMs: showTimelineQuantizeStepMs(options.shiftKey, viewport.durationMs, options.visibleWidthPx),
      minTimeMs,
      maxTimeMs: options.maxTimeMs,
    })
  }
  const updateCompositionClipMovePreview = (input: {
    clientX: number
    altKey: boolean
    shiftKey: boolean
    element: HTMLElement
    layer: ShowTimelineLayerView
    zoneId: string
    targetKey: string
    dataTransfer?: DataTransfer | null
  }) => {
    const draggedClip = draggingCompositionClipRef.current
    if (!draggedClip || draggedClip.settling || readOnly) return
    if (input.dataTransfer) input.dataTransfer.dropEffect = draggedClip.mode === 'duplicate' ? 'copy' : 'move'
    setDropTargetKey(input.targetKey)
    const rect = input.element.getBoundingClientRect()
    const totalMs = Math.max(1, timelineView.showEndMs)
    const fraction = (input.clientX - rect.left) / Math.max(1, rect.width)
    const clip = timelineView.rows
      .flatMap((zone) => zone.layers.flatMap((candidate) => candidate.items))
      .find((candidate) => candidate.id === draggedClip.clipId)
    if (!clip) return
    const candidateMs = fraction * totalMs - draggedClip.grabOffsetMs
    const visibleWidthPx = Math.max(1, scrollRef.current?.clientWidth || rect.width)
    const previousPreview = movePlanRef.current?.preview
    const resolved = resolveShowTimelineClipDragPlacement(candidateMs, {
      durationMs: clip.durationMs,
      totalMs,
      visibleDurationMs: viewport.durationMs,
      visibleWidthPx,
      structuralTimesMs: clipDragStructuralTimesMs(),
      excludedStructuralTimesMs: [clip.startMs, clip.endMs],
      altKey: input.altKey,
      shiftKey: input.shiftKey,
      previousPlacement: previousPreview?.clipId === clip.id
        && previousPreview.targetKey === input.targetKey
        ? { startMs: previousPreview.startMs, magnetized: previousPreview.snapped }
        : undefined,
    })
    if (recordVersion === 2) {
      // An Alt-drag duplicates through the gesture adapter: the plan names the
      // clip-sharing door and the preview paints the copy. The resolved time
      // is rounded to the whole milliseconds the sharing owner requires, as
      // the move planner does for its own intents.
      if (draggedClip.mode === 'duplicate' && !clip.groupOccurrenceId) {
        const v2Duplicate = draggedClip.v2Move
        const duplicateStartMs = Math.round(resolved.startMs)
        const duplicateGesture = {
          kind: 'duplicate' as const,
          clipId: clip.id,
          startMs: duplicateStartMs,
          zoneId: input.zoneId,
          layerId: input.layer.id,
        }
        // The preview checks without allocating: identities are minted once,
        // on drop, when the commit plans the stored gesture.
        const duplicateCheck = v2Duplicate
          ? checkShowTimelineDuplicateGestureV2(v2Duplicate.capture, duplicateGesture)
          : null
        if (!duplicateCheck || duplicateCheck.status !== 'ready') {
          if (input.dataTransfer) input.dataTransfer.dropEffect = 'none'
          movePlanRef.current = null
          setMovePreview(null)
          return
        }
        const nextDuplicatePreview: ShowClipMovePreview = {
          clipId: clip.id,
          mode: 'duplicate',
          targetKey: input.targetKey,
          startMs: duplicateStartMs,
          durationMs: clip.durationMs,
          snapped: resolved.magnetized,
        }
        movePlanRef.current = {
          recordVersion: 2,
          preview: nextDuplicatePreview,
          mode: 'duplicate',
          clipId: clip.id,
          startMs: duplicateStartMs,
          plan: {
            kind: 'clip-sharing-pending',
            gesture: duplicateGesture,
          },
        }
        setMovePreview(nextDuplicatePreview)
        return
      }
      if (draggedClip.mode !== 'move' || clip.groupOccurrenceId) {
        if (input.dataTransfer) input.dataTransfer.dropEffect = 'none'
        movePlanRef.current = null
        setMovePreview(null)
        return
      }
      // The planner names the door: a same-Layer move of a joined Clip shifts
      // its connected component, and a cross-Layer or cross-Zone drop re-places
      // the Clip with the detach permission, so a joined Clip tears off its
      // Transitions and moves alone. A refusal plans nothing, so the drop
      // target reads `none` and the gesture submits no command.
      const gesturePlan = planShowV2ClipMove(timelineView, {
        clipId: clip.id,
        zoneId: input.zoneId,
        layerId: input.layer.id,
        startMs: resolved.startMs,
      })
      if (gesturePlan.kind === 'refuse') {
        if (input.dataTransfer) input.dataTransfer.dropEffect = 'none'
        movePlanRef.current = null
        setMovePreview(null)
        return
      }
      const nextPreview: ShowClipMovePreview = {
        clipId: clip.id,
        mode: 'move',
        targetKey: input.targetKey,
        startMs: resolved.startMs,
        durationMs: clip.durationMs,
        snapped: resolved.magnetized,
      }
      movePlanRef.current = {
        recordVersion: 2,
        preview: nextPreview,
        mode: 'move',
        clipId: clip.id,
        startMs: resolved.startMs,
        plan: gesturePlan,
        moveRequest: { clipId: clip.id, zoneId: input.zoneId, layerId: input.layer.id, startMs: resolved.startMs },
      }
      setMovePreview(nextPreview)
      return
    }
    if (!show || !timelineComposition || !clip.legacy || !draggedClip.owner) return
    const target: ShowTimelineClipMoveTarget = input.layer.rank === 0
      ? { kind: 'main', zoneId: input.zoneId, globalStartMs: resolved.startMs }
      : {
          kind: 'overlay',
          zoneId: input.zoneId,
          layerIndex: input.layer.layerIndex,
          globalStartMs: resolved.startMs,
        }
    const plannedComposition = draggedClip.mode === 'duplicate'
        ? duplicateShowClipAtGlobalTime(show, timelineComposition, {
            owner: draggedClip.owner,
            target,
            newPlacementId: draggedClip.duplicatePlacementId!,
            newInstanceId: draggedClip.duplicateInstanceId,
          })
        : moveShowConnectedClipAtGlobalTime(show, timelineComposition, {
            owner: draggedClip.owner,
            target,
          })
    if (!plannedComposition || plannedComposition === timelineComposition) {
      if (input.dataTransfer) input.dataTransfer.dropEffect = 'none'
      movePlanRef.current = null
      setMovePreview(null)
      return
    }
    const plannedClip = projectShowUnifiedTimeline(show, plannedComposition).zones
      .flatMap((zone) => zone.layers.flatMap((candidate) => candidate.clips))
      .find((candidate) => candidate.id === (
        draggedClip.mode === 'duplicate' ? draggedClip.duplicatePlacementId : clip.id
      ))
    if (!plannedClip) {
      if (input.dataTransfer) input.dataTransfer.dropEffect = 'none'
      movePlanRef.current = null
      setMovePreview(null)
      return
    }
    const nextPreview: ShowClipMovePreview = {
      clipId: clip.id,
      mode: draggedClip.mode,
      targetKey: input.targetKey,
      startMs: plannedClip.startMs,
      durationMs: plannedClip.durationMs,
      snapped: resolved.magnetized,
    }
    movePlanRef.current = {
      recordVersion: 1,
      preview: nextPreview,
      sourceComposition: timelineComposition,
      composition: plannedComposition,
      owner: draggedClip.owner,
      target,
      mode: draggedClip.mode,
    }
    setMovePreview(nextPreview)
  }
  const resetCompositionClipMove = () => {
    if (draggingCompositionClipRef.current?.settling) return
    activeMoveLayerRef.current = null
    draggingCompositionClipRef.current = null
    setDraggingCompositionClip(null)
    movePlanRef.current = null
    setMovePreview(null)
    setDropTargetKey(null)
    onDirectManipulationChange(false)
    refreshMoveActivity()
  }
  // One switch for every v2 Clip drop commit: the planner's door decides
  // which admission runs. A refused plan or a lost capture commits nothing.
  const commitV2ClipPlan = (
    capture: { capture: ShowV2PilotPreparedCapture; baseRevision: number } | undefined,
    plan: ShowV2ClipDropPlan,
  ): Promise<boolean> => {
    if (!capture || plan.kind === 'refuse' || plan.kind === 'clip-sharing-pending') return Promise.resolve(false)
    if (plan.kind === 'clip-sharing') {
      return onCommitV2ClipSharing?.({ ...capture, intent: plan.intent }) ?? Promise.resolve(false)
    }
    return plan.kind === 'transition-resize'
      ? onCommitV2TransitionResize?.({ ...capture, intent: plan.intent }) ?? Promise.resolve(false)
      : onCommitV2ClipTemporal?.({ ...capture, intent: plan.intent }) ?? Promise.resolve(false)
  }
  const requestV2ClipMove = (
    capture: { capture: ShowV2PilotPreparedCapture; baseRevision: number } | undefined,
    request: { clipId: string; zoneId: string; layerId: string; startMs: number },
    plan: ShowV2ClipDropPlan,
  ): Promise<boolean> => {
    if (capture && plan.kind === 'temporal' && plan.intent.kind === 'replace-placement') {
      const record = capture.capture.record
      const outcome = editShowClipTemporalV2(record, plan.intent)
      if (outcome.status === 'changed') {
        const transitionIds = new Set(record.composition.transitions.map(transition => transition.id))
        const transitionCount = outcome.removedIds.filter(id => transitionIds.has(id)).length
        if (transitionCount > 0) {
          setPendingV2ClipMove({ plan: request, transitionCount })
          return Promise.resolve(false)
        }
      }
    }
    return commitV2ClipPlan(capture, plan)
  }
  const confirmV2ClipMove = () => {
    const pending = pendingV2ClipMove
    setPendingV2ClipMove(null)
    if (!pending) return
    const capture = captureV2Move?.()
    if (!capture) return
    const plan = planShowV2ClipMove(timelineView, pending.plan)
    if (plan.kind === 'refuse') return
    void commitV2ClipPlan(capture, plan).then((changed) => {
      if (changed) onReanchorDetails({ kind: 'clip', clipId: pending.plan.clipId })
    }).catch(() => {})
  }
  const commitCompositionClipMove = (targetKey: string) => {
    const draggedClip = draggingCompositionClipRef.current
    const activePlan = movePlanRef.current
    if (draggedClip?.settling) return
    if (!draggedClip
      || activePlan?.preview.clipId !== draggedClip.clipId
      || activePlan.preview.targetKey !== targetKey) {
      resetCompositionClipMove()
      return
    }
    draggedClip.settling = true
    // The painted plan names its own door, so the commit submits the exact
    // intent the preview showed; a refused owner settles as no change.
    // A pending duplicate preview stored its gesture unchecked for identity:
    // the commit plans it once, on drop, and a refused plan settles as no
    // change exactly as a refused commit does.
    let pendingSelectClipId: string | null = null
    const commit = activePlan.recordVersion === 2
      ? (() => {
          if (activePlan.plan.kind !== 'clip-sharing-pending') {
            return activePlan.mode === 'move' && activePlan.moveRequest
              ? requestV2ClipMove(draggedClip.v2Move, activePlan.moveRequest, activePlan.plan)
              : commitV2ClipPlan(draggedClip.v2Move, activePlan.plan)
          }
          const resolved = draggedClip.v2Move
            ? planShowTimelineGestureV2(draggedClip.v2Move.capture, activePlan.plan.gesture, newPersonalContentId)
            : null
          if (!resolved || resolved.status !== 'ready' || resolved.submission.owner !== 'clip-sharing') return Promise.resolve(false)
          const selectClipId = resolved.selectAfterId ?? resolved.submission.intent.identities.clipId
          pendingSelectClipId = selectClipId
          return commitV2ClipPlan(draggedClip.v2Move, {
            kind: 'clip-sharing',
            intent: resolved.submission.intent,
            selectClipId,
          })
        })()
      : activePlan.mode === 'duplicate'
        ? onDuplicateCompositionClipAtTarget({
            sourceComposition: activePlan.sourceComposition,
            plannedComposition: activePlan.composition,
          })
        : onMoveCompositionClip({
            owner: activePlan.owner,
            target: activePlan.target,
            sourceComposition: activePlan.sourceComposition,
            plannedComposition: activePlan.composition,
          })
    void commit.then((changed) => {
      if (!changed || draggingCompositionClipRef.current !== draggedClip) return
      // A v2 duplicate selects the planner's fresh Clip; v1 keeps selecting
      // its minted placement id.
      const clipId = activePlan.recordVersion === 2 && activePlan.plan.kind === 'clip-sharing'
        ? activePlan.plan.selectClipId
        : activePlan.recordVersion === 2 && activePlan.plan.kind === 'clip-sharing-pending' && pendingSelectClipId
          ? pendingSelectClipId
          : activePlan.mode === 'duplicate'
            ? draggedClip.duplicatePlacementId!
            : draggedClip.clipId
      if (activePlan.mode === 'duplicate') onSelect({ kind: 'clip', clipId })
      onReanchorDetails({ kind: 'clip', clipId })
    }).catch(() => {}).finally(() => {
      if (draggingCompositionClipRef.current !== draggedClip) return
      draggedClip.settling = false
      resetCompositionClipMove()
    })
    setDropTargetKey(null)
  }
  const propertyLanesByZone = useMemo<Map<string, ShowTimelinePropertyLanePresentation[]>>(() => {
    // One lane pipeline. Only the record the lane values were read from
    // differs; naming, glyphs, disambiguation and hover text stay shared (#1065).
    const finishZoneLanes = (
      zoneId: string,
      candidates: readonly ShowTimelinePropertyLaneCandidate[],
    ) => {
      // The lane itself is named by property alone; the owning Clip returns,
      // abbreviated, only where a property would otherwise repeat (#631).
      const visible = candidates.filter((candidate) => candidate.projection.timeVarying)
      // A transform kind reads as a glyph with the axis or unit as text (#63).
      const presentations = visible.map((candidate) => propertyLanePresentation(candidate.family, candidate.propertyLabel))
      const displayLabels = resolvePropertyLaneDisplayLabels(visible.map((candidate, index) => ({
        propertyLabel: candidate.propertyLabel,
        family: candidate.family,
        ownerName: candidate.ownerName,
        displayProperty: presentations[index].displayProperty,
        glyph: presentations[index].glyph,
      })))
      return [zoneId, visible.map((candidate, index) => ({
        ...candidate,
        glyph: presentations[index].glyph,
        displayLabel: displayLabels[index],
        hoverText: describePropertyLaneHover({
          ownerName: candidate.ownerName,
          family: candidate.family,
          propertyLabel: candidate.propertyLabel,
          projection: candidate.projection,
        }),
      }))] as const
    }
    if (propertyLanesOverride) {
      return new Map(timelineView.rows.map((row) => finishZoneLanes(
        row.zoneId,
        propertyLanesOverride.filter((lane) => lane.zoneId === row.zoneId).map((lane) => ({
          key: lane.id,
          label: lane.label,
          propertyLabel: lane.propertyLabel,
          family: lane.family,
          ownerName: lane.patternName,
          ariaLabel: lane.ariaKind === 'animation'
            ? `${lane.label} animation for ${row.zoneName}`
            : lane.ariaKind === 'control-lane'
              ? `${lane.label} control lane for ${row.zoneName}`
              : `${sentenceCasePropertyLaneLabel(lane.label)} lane for ${row.zoneName}`,
          selectsTransition: lane.selectsTransition,
          color: propertyLaneFamilyColor(lane.family),
          formatValue: lane.valueKind === 'percent'
            ? formatBrightness
            : lane.valueKind === 'multiplier'
              ? formatTimeScale
              : formatControlValue,
          projection: lane.projection,
        })),
      )))
    }
    if (!show || !displayShow) return new Map()
    const sceneAnimationLanes = projectGlobalShowScenePropertyLanes(displayShow)
    const availableControls = Object.values(patternControlsByCellId).flat()
    const automatedControlNames = [...new Set([
      ...show.cells.flatMap((cell) => Object.keys(cell.controlTargets ?? {})),
      ...(show.transitions ?? []).flatMap((transition) => Object.keys(transition.propertyTransitions?.controls ?? {})),
    ])]
    const controlLanes = automatedControlNames.map((exportName) => ({
      exportName,
      label: availableControls.find((control) => control.exportName === exportName)?.label
        ?? exportName.replace(/^slider/, '').replace(/([A-Z])/g, ' $1').trim(),
      defaultValue: availableControls.find((control) => control.exportName === exportName)?.defaultValue
        ?? 0.5,
    }))
    return new Map(show.zones.map((zone) => {
      const candidates = [
        {
          key: 'timeScale',
          label: 'animation speed',
          propertyLabel: 'speed',
          family: 'time' as ShowPropertyLaneFamily,
          ownerName: undefined as string | undefined,
          ariaLabel: `Animation speed lane for ${zone.name}`,
          selectsTransition: true,
          color: propertyLaneFamilyColor('time'),
          formatValue: formatTimeScale,
          projection: projectGlobalShowPropertyLane(displayShow, zone.id, { kind: 'timeScale' }),
        },
        {
          key: 'brightness',
          label: 'brightness',
          propertyLabel: 'brightness',
          family: 'appearance' as ShowPropertyLaneFamily,
          ownerName: undefined as string | undefined,
          ariaLabel: `Brightness lane for ${zone.name}`,
          selectsTransition: true,
          color: propertyLaneFamilyColor('appearance'),
          formatValue: formatBrightness,
          projection: projectGlobalShowPropertyLane(displayShow, zone.id, { kind: 'brightness' }),
        },
        ...([
          ['positionX', 'position x'],
          ['positionY', 'position y'],
          ['rotation', 'rotation'],
          ['scaleX', 'scale x'],
          ['scaleY', 'scale y'],
        ] as const).map(([property, label]) => ({
          key: `transform:${property}`,
          label,
          propertyLabel: label as string,
          family: 'transform' as ShowPropertyLaneFamily,
          ownerName: undefined as string | undefined,
          ariaLabel: `${label} lane for ${zone.name}`,
          selectsTransition: true,
          color: propertyLaneFamilyColor('transform'),
          formatValue: property === 'rotation'
            ? (value: number) => formatAngleValue('rotation', value)
            : property === 'scaleX' || property === 'scaleY'
              ? (value: number) => formatDomainNumber('multiplier', value, 0.01)
              : (value: number) => Number(value.toFixed(2)).toString(),
          projection: projectGlobalShowPropertyLane(displayShow, zone.id, { kind: 'transform', property }),
        })),
        ...controlLanes.map((control) => ({
          key: `control:${control.exportName}`,
          label: control.label,
          propertyLabel: control.label,
          family: 'control' as ShowPropertyLaneFamily,
          ownerName: undefined as string | undefined,
          ariaLabel: `${control.label} control lane for ${zone.name}`,
          selectsTransition: true,
          color: propertyLaneFamilyColor('control'),
          formatValue: formatControlValue,
          projection: projectGlobalShowPropertyLane(displayShow, zone.id, {
            kind: 'control' as const,
            exportName: control.exportName,
            defaultValue: control.defaultValue,
          }),
        })),
        ...sceneAnimationLanes
          .filter((lane) => lane.zoneId === zone.id)
          .map((lane) => ({
            key: `scene:${lane.id}`,
            label: lane.label,
            propertyLabel: lane.propertyLabel,
            family: lane.family,
            ownerName: lane.patternName as string | undefined,
            ariaLabel: `${lane.label} animation for ${zone.name}`,
            selectsTransition: false,
            color: propertyLaneFamilyColor(lane.family),
            formatValue: lane.valueKind === 'percent'
              ? formatBrightness
              : lane.valueKind === 'multiplier'
                ? formatTimeScale
                : formatControlValue,
            projection: lane.projection,
          })),
      ]
      return finishZoneLanes(zone.id, candidates)
    }))
  }, [displayShow, patternControlsByCellId, propertyLanesOverride, show, timelineView.rows])
  // One Zone Map, read from whichever record backs the editor (#1065).
  const zoneMap: ShowEditorZoneMapV2 | null = show
    ? {
        installation: show.outputContract?.kind === 'installation',
        entries: show.zones.map((zone) => ({
          zone,
          pixelCount: resolveShowZonePixelCount(show, zone.id)?.pixelCount ?? zone.nominalPixelCount,
        })),
      }
    : zoneMapOverride ?? null
  const movingSplitLayout = (show?.routingLayouts ?? zoneLayoutsOverride ?? []).find((layout) => (
    layout.logical?.kind === 'split' || layout.logical?.kind === 'soft-split'
  ))
  const hasSampleRemap = Boolean(show && (show.scenes.some((scene) => scene.sampleTargets?.repeatScale !== undefined)
    || show.transitions?.some((transition) => transition.propertyTransitions?.sample?.repeatScale)))
    || Boolean(!show && sampleRepeatAtOverride)
  const hasNonTrivialLayout = recordVersion === 2
    ? timelineView.layoutIntervals.some((interval) => interval.zoneIds.length > 1)
    : Boolean(show?.routingLayouts.some((layout) => (
        layout.logical ? layout.logical.kind !== 'single' : layout.zones.length > 1
      )))
  const layoutLaneVisible = hasNonTrivialLayout || layoutIntervals.length > 1
  const routingLaneRows = (layoutLaneVisible ? 1 : 0) + (hasSampleRemap ? 1 : 0)
  const layoutKindLabel = (layoutId: string) => {
    // The kind label is the same read on both backings (#694): the authored
    // Zone Layout definition's shape, never the lane's authored name, which
    // several distinct Layouts may share a kind with.
    const layout = (show?.routingLayouts ?? zoneLayoutsOverride ?? [])
      .find((candidate) => candidate.id === layoutId)
    return layout ? showRoutingLayoutKindLabel(layout) : 'Zone Layout'
  }
  const rowStrides = timelineView.rows.map((row) => {
    if (collapsedZoneIdSet.has(row.zoneId)) return 1
    const clipLayerCount = row.composed ? row.layers.length || 1 : 1
    return clipLayerCount + (propertyLanesByZone.get(row.zoneId)?.length ?? 0)
  })
  const rowOffsets = rowStrides.reduce<number[]>((offsets, stride) => (
    [...offsets, offsets[offsets.length - 1] + stride]
  ), [0])
  const totalContentRows = rowOffsets[rowOffsets.length - 1] ?? 0
  const rowStart = (rowIndex: number) => rowOffsets[rowIndex]
  const rulerRow = 1
  const contentStartRow = 2
  const timelineOverlayRowSpan = totalContentRows + routingLaneRows + 2
  // The time grid's own columns: one section span, then the whole-output
  // boundary between it and the next. v1 reads them off its Scenes and the
  // visual Transition after each one; a v2 backing supplies the same spans, so
  // both resolve the identical CSS tracks (#1065).
  const timeColumns: ShowEditorTimeColumnV2[] = displayShow
    ? displayShow.scenes.flatMap((scene, index) => {
        const startMs = displayShow.scenes.slice(0, index).reduce((cursor, earlier) => (
          cursor + earlier.durationMs + (showVisualTransitionAfter(displayShow, earlier.id)?.durationMs ?? 0)
        ), 0)
        const section = { kind: 'section' as const, startMs, durationMs: scene.durationMs }
        return index < displayShow.scenes.length - 1
          ? [section, {
              kind: 'boundary' as const,
              startMs: startMs + scene.durationMs,
              durationMs: showVisualTransitionAfter(displayShow, scene.id)?.durationMs ?? 0,
            }]
          : [section]
      })
    : showEndPreviewMs !== null && timeColumnsOverride
      ? previewShowEndTimeColumns(timeColumnsOverride, showEndPreviewMs - baseTimelineView.showEndMs)
      : timeColumnsOverride ?? [{ kind: 'section', startMs: 0, durationMs: timelineView.showEndMs }]
  const timeSections = timeColumns.filter((column) => column.kind === 'section')
  const columns = [
    zonesOpen ? `${ZONE_RAIL_OPEN_PX}px` : hasMultipleZones ? `${ZONE_RAIL_MICRO_PX}px` : '0px',
    ...timeColumns.map((column) => (
      `minmax(0, ${column.kind === 'section'
        ? Math.max(1, column.durationMs)
        : Math.max(0.001, column.durationMs)}fr)`
    )),
  ]
  const timeGridEndLine = columns.length + 1
  const rows = [
    '28px',
    ...(layoutLaneVisible ? ['26px'] : []),
    ...(hasSampleRemap ? ['26px'] : []),
    ...timelineView.rows.flatMap((row) => collapsedZoneIdSet.has(row.zoneId) ? ['28px'] : [
      ...Array.from({ length: row.composed ? row.layers.length || 1 : 1 }, () => '44px'),
      ...(propertyLanesByZone.get(row.zoneId) ?? []).map(() => '18px'),
    ]),
    '17px',
  ]
  const timelineScale = viewport.totalMs / viewport.durationMs
  const timelineWidth = `calc(${timelineScale * 100}% + ${212 * (1 - timelineScale)}px)`
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const maxScroll = Math.max(0, element.scrollWidth - element.clientWidth)
    const maxStart = viewport.totalMs - viewport.durationMs
    const next = maxStart > 0 ? viewport.startMs / maxStart * maxScroll : 0
    if (Math.abs(element.scrollLeft - next) > 1) element.scrollLeft = next
  }, [timelineScale, viewport])
  const updateViewport = useCallback((next: SetStateAction<ShowTimelineViewport>) => {
    const current = useShowEditorViewStore.getState().viewport ?? fittedViewport
    setViewport(typeof next === 'function' ? next(current) : next)
  }, [fittedViewport, setViewport])
  const timelineIsFitted = viewport.startMs === fittedViewport.startMs
    && viewport.durationMs === fittedViewport.durationMs
    && viewport.totalMs === fittedViewport.totalMs
  useEffect(() => {
    const handleTimelineKeyboard = (event: KeyboardEvent) => {
      if (event.defaultPrevented || showControlOwnsKeyboardEvent(event.target)) return
      const target = event.target
      if (!(target instanceof HTMLElement) || !target.closest('[aria-label="Show timeline"]')) return

      // Chrome that yields Show shortcuts keeps native Tab as well. The marker
      // means "this control owns no Show binding", not "this control joins Clip
      // traversal", and teleporting focus out of the rail or the toolbar would
      // strand its own controls (#632).
      if (event.key === 'Tab' && target.closest('[role="toolbar"], [data-studio-space-preview="true"]')) return

      if (event.key !== 'Tab' || event.metaKey || event.ctrlKey || event.altKey) return

      event.preventDefault()
      const focusedKey = target.closest<HTMLElement>('[data-show-selection-key]')?.dataset.showSelectionKey
      const current = traversalTargets.find((candidate) => (
        showTimelineTraversalTargetKey(candidate) === focusedKey
      )) ?? showSelectionTraversalTarget(selection)
      const next = nextShowTimelineTraversalTarget(traversalTargets, current, event.shiftKey ? -1 : 1)
      if (!next) return
      const nextSelection = traversalTargetShowSelection(next)
      const anchor = findShowSelectionAnchor(nextSelection)
      anchor?.focus()
      onSelectRef.current(nextSelection, anchor)
    }
    document.addEventListener('keydown', handleTimelineKeyboard)
    return () => document.removeEventListener('keydown', handleTimelineKeyboard)
  }, [selection, showId, traversalTargets, updateViewport])
  const zoomAroundPlayhead = useCallback((factor: number) => updateViewport((current) => {
    const visibleEnd = current.startMs + current.durationMs
    const playheadMs = positionMsRef.current
    const anchor = playheadMs >= current.startMs && playheadMs <= visibleEnd
      ? playheadMs
      : current.startMs + current.durationMs / 2
    return zoomShowTimelineViewport(current, factor, anchor)
  }), [updateViewport])
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        zoomAroundPlayhead(event.deltaY < 0 ? 1.25 : 0.8)
        return
      }
      if (!event.shiftKey) return

      const maxScroll = Math.max(0, element.scrollWidth - element.clientWidth)
      if (maxScroll <= 0) return

      const wheelDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY
      if (wheelDelta === 0) return

      const deltaScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 40
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? element.clientWidth
          : 1
      const nextScroll = Math.max(0, Math.min(maxScroll, element.scrollLeft + wheelDelta * deltaScale))
      if (nextScroll === element.scrollLeft) return

      event.preventDefault()
      element.scrollLeft = nextScroll
    }

    element.addEventListener('wheel', handleWheel, { passive: false })
    return () => element.removeEventListener('wheel', handleWheel)
  }, [zoomAroundPlayhead])
  const resizeV2PlanRef = useRef<{
    preview: ShowClipResizePreview
    capture: { capture: ShowV2PilotPreparedCapture; baseRevision: number }
    plan: ShowV2ClipTemporalPlan
  } | null>(null)
  // Slice 1 resizes a v2 Clip through the same handles and snap as v1: the
  // planner names the trim/extend or the connected resize form from the
  // presented view, and the commit submits the exact painted plan. A refused
  // plan paints no preview and submits nothing.
  const beginCompositionResizeV2 = (
    clip: ShowTimelineItemView,
    edge: 'start' | 'end',
    event: ReactPointerEvent<HTMLSpanElement>,
  ) => {
    if (readOnly || resizeGestureRef.current || clip.groupOccurrenceId) return
    event.preventDefault()
    event.stopPropagation()
    const lane = event.currentTarget.closest<HTMLElement>('[data-show-layer-kind]')
    if (!lane) return
    const gesture = captureV2ClipEdit?.()
    if (!gesture) return
    const pointerId = event.pointerId
    const handle = event.currentTarget
    const rect = lane.getBoundingClientRect()
    onDirectManipulationChange(true)
    const startClientX = event.clientX
    const totalMs = Math.max(1, timelineView.showEndMs)
    const resolve = (pointer: PointerEvent) => {
      const deltaMs = (pointer.clientX - startClientX) / Math.max(1, rect.width) * totalMs
      const rawBoundaryMs = edge === 'start' ? clip.startMs + deltaMs : clip.endMs + deltaMs
      const minTimeMs = edge === 'start' ? 0 : clip.startMs + 1
      const maxTimeMs = edge === 'start' ? clip.endMs - 1 : totalMs
      const boundaryMs = snapClipBoundary(rawBoundaryMs, {
        altKey: pointer.altKey,
        shiftKey: pointer.shiftKey,
        visibleWidthPx: Math.max(1, scrollRef.current?.clientWidth ?? rect.width),
        minTimeMs,
        maxTimeMs,
      }).timeMs
      const startMs = edge === 'start' ? boundaryMs : clip.startMs
      const durationMs = edge === 'start' ? clip.endMs - boundaryMs : boundaryMs - clip.startMs
      return { startMs: Math.round(startMs), durationMs: Math.max(1, Math.round(durationMs)) }
    }
    const plan = (pointer: PointerEvent) => {
      const next = resolve(pointer)
      // Alt already shaped the snapped interval above and reaches the planner
      // only through it, exactly as v1: a resize that pulls a joined edge away
      // from a converted Scene-boundary Transition plans the connected form
      // that commits the #1068 repair, while a resize into the boundary and an
      // unabsorbable reclaim refuse before any preview. Every other edge plans
      // its connected or temporal form.
      const startMs = edge === 'start' ? next.startMs : clip.startMs
      const endMs = edge === 'start' ? clip.endMs : next.startMs + next.durationMs
      const gesturePlan = planShowV2ClipResize(timelineView, {
        clipId: clip.id,
        edge: edge === 'start' ? 'leading' : 'trailing',
        startMs,
        endMs,
      })
      if (gesturePlan.kind === 'refuse') return null
      return {
        preview: { clipId: clip.id, startMs, durationMs: Math.max(1, endMs - startMs) },
        plan: gesturePlan,
      }
    }
    const move = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId || !resizeGestureRef.current) return
      const nextPlan = plan(pointer)
      resizeV2PlanRef.current = nextPlan ? { ...nextPlan, capture: gesture } : null
      setResizePreview(nextPlan?.preview ?? null)
    }
    const detach = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
      handle.removeEventListener('lostpointercapture', cancel)
    }
    const settle = () => {
      if (resizeGestureRef.current !== detach) return
      resizeGestureRef.current = null
      resizePlanRef.current = null
      resizeV2PlanRef.current = null
      setResizePreview(null)
      onDirectManipulationChange(false)
      refreshResizeActivity()
    }
    const finish = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId || resizeGestureRef.current !== detach) return
      detach()
      const activePlan = resizeV2PlanRef.current ?? (() => {
        const nextPlan = plan(pointer)
        return nextPlan ? { ...nextPlan, capture: gesture } : null
      })()
      suppressResizeClipClickRef.current = clip.id
      window.setTimeout(() => {
        if (suppressResizeClipClickRef.current === clip.id) suppressResizeClipClickRef.current = null
      }, 0)
      if (!activePlan) {
        settle()
        return
      }
      resizeV2PlanRef.current = activePlan
      setResizePreview(activePlan.preview)
      // Selection and any open Details remain suppressed until the exact
      // painted resize plan has committed.
      void commitV2ClipPlan(activePlan.capture, activePlan.plan).catch(() => {}).finally(settle)
    }
    const cancel = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId || resizeGestureRef.current !== detach) return
      detach()
      settle()
    }
    resizeGestureRef.current = detach
    refreshResizeActivity()
    resizePlanRef.current = null
    resizeV2PlanRef.current = null
    setResizePreview({ clipId: clip.id, startMs: clip.startMs, durationMs: clip.durationMs })
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', cancel)
    handle.addEventListener('lostpointercapture', cancel)
  }
  const beginCompositionResize = (
    clip: ShowTimelineItemView,
    edge: 'start' | 'end',
    event: ReactPointerEvent<HTMLSpanElement>,
  ) => {
    if (recordVersion === 2) {
      beginCompositionResizeV2(clip, edge, event)
      return
    }
    if (readOnly || !show || !timelineComposition || !clip.legacy || resizeGestureRef.current) return
    event.preventDefault()
    event.stopPropagation()
    const lane = event.currentTarget.closest<HTMLElement>('[data-show-layer-kind]')
    if (!lane) return
    const pointerId = event.pointerId
    const handle = event.currentTarget
    const rect = lane.getBoundingClientRect()
    onDirectManipulationChange(true)
    const startClientX = event.clientX
    const totalMs = Math.max(1, timelineView.showEndMs)
    const owner: ShowTimelineClipOwner = clip.legacy.kind === 'main'
      ? {
          kind: 'main',
          sceneId: clip.legacy.sceneId,
          zoneId: clip.zoneId,
          placementId: clip.id,
        }
      : {
          kind: 'overlay',
          sceneId: clip.legacy.sceneId,
          zoneId: clip.zoneId,
          layerId: clip.legacy.overlayLayerId!,
          placementId: clip.id,
        }
    const resolve = (pointer: PointerEvent) => {
      const deltaMs = (pointer.clientX - startClientX) / Math.max(1, rect.width) * totalMs
      const rawBoundaryMs = edge === 'start' ? clip.startMs + deltaMs : clip.endMs + deltaMs
      const minTimeMs = edge === 'start' ? 0 : clip.startMs + 1
      const maxTimeMs = edge === 'start' ? clip.endMs - 1 : totalMs
      const boundaryMs = snapClipBoundary(rawBoundaryMs, {
        altKey: pointer.altKey,
        shiftKey: pointer.shiftKey,
        visibleWidthPx: Math.max(1, scrollRef.current?.clientWidth ?? rect.width),
        minTimeMs,
        maxTimeMs,
      }).timeMs
      const startMs = edge === 'start' ? boundaryMs : clip.startMs
      const durationMs = edge === 'start' ? clip.endMs - boundaryMs : boundaryMs - clip.startMs
      return { startMs: Math.round(startMs), durationMs: Math.max(1, Math.round(durationMs)) }
    }
    const plan = (pointer: PointerEvent): ShowClipResizePlan | null => {
      const next = resolve(pointer)
      const composition = previewShowClipResize(show, timelineComposition, {
        clipId: clip.id,
        globalStartMs: next.startMs,
        durationMs: next.durationMs,
      })
      if (composition === timelineComposition) return null
      const plannedClip = projectShowUnifiedTimeline(show, composition).zones
        .flatMap((zone) => zone.layers.flatMap((layer) => layer.clips))
        .find((candidate) => candidate.id === clip.id)
      if (!plannedClip) return null
      return {
        preview: {
          clipId: clip.id,
          startMs: plannedClip.startMs,
          durationMs: plannedClip.durationMs,
        },
        sourceComposition: timelineComposition,
        owner,
      }
    }
    const move = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId || !resizeGestureRef.current) return
      const nextPlan = plan(pointer)
      resizePlanRef.current = nextPlan
      setResizePreview(nextPlan?.preview ?? null)
    }
    const detach = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
      handle.removeEventListener('lostpointercapture', cancel)
    }
    const settle = () => {
      if (resizeGestureRef.current !== detach) return
      resizeGestureRef.current = null
      resizePlanRef.current = null
      setResizePreview(null)
      onDirectManipulationChange(false)
      refreshResizeActivity()
    }
    const finish = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId || resizeGestureRef.current !== detach) return
      detach()
      const activePlan = resizePlanRef.current ?? plan(pointer)
      suppressResizeClipClickRef.current = clip.id
      window.setTimeout(() => {
        if (suppressResizeClipClickRef.current === clip.id) suppressResizeClipClickRef.current = null
      }, 0)
      if (!activePlan) {
        settle()
        return
      }
      resizePlanRef.current = activePlan
      setResizePreview(activePlan.preview)
      // Selection and any open Details remain suppressed until the exact
      // painted resize plan has committed.
      void onResizeCompositionClip({
        owner: activePlan.owner,
        globalStartMs: activePlan.preview.startMs,
        durationMs: activePlan.preview.durationMs,
        sourceComposition: activePlan.sourceComposition,
      }).catch(() => {}).finally(settle)
    }
    const cancel = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId || resizeGestureRef.current !== detach) return
      detach()
      settle()
    }
    resizeGestureRef.current = detach
    refreshResizeActivity()
    resizePlanRef.current = null
    setResizePreview({ clipId: clip.id, startMs: clip.startMs, durationMs: clip.durationMs })
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', cancel)
    handle.addEventListener('lostpointercapture', cancel)
  }
  return (
    <div
      className="select-none bg-[#060608] px-2 py-2.5 shadow-[inset_0_6px_14px_-8px_rgba(0,0,0,0.9),inset_0_-6px_14px_-10px_rgba(0,0,0,0.9)] [&_input]:select-text [&_textarea]:select-text"
      onClick={() => {
        onDismiss()
        setAddMenuOpen(false)
        setAddClipOpen(false)
        setInsertTimeOpen(false)
        setLayoutActionsOpen(false)
      }}
    >
      <div
        data-testid="show-timeline-toolbar"
        data-studio-space-preview="true"
        className="show-timeline-toolbar scrollbar-hidden ml-[-3px] flex h-11 min-w-0 flex-nowrap items-center gap-1 overflow-x-auto border-b border-zinc-800/80 pl-0 pr-0"
        role="toolbar"
        aria-label="Show timeline controls"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="timeline-transport-cluster min-w-0 shrink-0 px-1">
          {transportActive && <ShowTransportControls showId={showId} />}
        </div>
        {transportActive && <ShowTimeDisplay showId={showId} durationMs={timelineView.showEndMs} />}
        <div className="timeline-command-cluster relative ml-auto flex min-w-0 shrink-0 items-center justify-end gap-[1.5px] border-l border-zinc-800/80 px-1" role="group" aria-label="Show authoring commands">
          {!readOnly && (
            <>
              <Button
                ref={setAddPopoverAnchor}
                size="xs"
                variant="ghost"
                aria-label="Add to Show"
                aria-haspopup="menu"
                aria-expanded={addMenuOpen || addClipOpen || insertTimeOpen || layoutActionsOpen}
                title="Add a Clip, Layer, Transition, Time, or Zone Layout"
                className={`px-1.5 text-[11px] ${showTimelineToolbarControlClass({
                  enabled: true,
                  active: addMenuOpen || addClipOpen || insertTimeOpen || layoutActionsOpen,
                })}`}
                onClick={() => {
                  const transport = useShowTransportStore.getState()
                  setAddClipTimeMs(transport.showId === showId ? transport.positionMs : 0)
                  setAddClipPatternKey(null)
                  setAddClipSubmitting(false)
                  setAddClipPointerContext(null)
                  setAddClipOpen(false)
                  setInsertTimeOpen(false)
                  setLayoutActionsOpen(false)
                  setAddMenuOpen((open) => !open)
                }}
              >
                <Plus size={12} aria-hidden />
                <span className="timeline-command-label timeline-command-label-primary">Add</span>
                <ChevronDown size={9} aria-hidden />
              </Button>
              {addMenuOpen && (
                <ShowTimelineToolbarPopover
                  anchor={addPopoverAnchor}
                  widthPx={288}
                  role="menu"
                  ariaLabel="Add to Show"
                  className="w-[288px] rounded border border-zinc-700 bg-zinc-950 p-1.5 text-[11px] text-zinc-300 shadow-2xl"
                  onDismiss={() => setAddMenuOpen(false)}
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    role="menuitem"
                    aria-label={addClipDestination ? 'Clip' : 'Clip unavailable: no empty Layer'}
                    disabled={!addClipDestination}
                    title={addClipDestination ? 'Add a Pattern Clip at the playhead' : undefined}
                    className="flex h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-45"
                    onClick={() => {
                      if (!addClipDestination) return
                      setAddMenuOpen(false)
                      setAddClipOpen(true)
                    }}
                  >
                    <Plus size={12} aria-hidden className="text-amber-300/80" />
                    <span>Clip</span>
                    {!addClipDestination && (
                      <span className="ml-auto text-[10px] text-zinc-600">No empty Layer</span>
                    )}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    aria-label={layerTargetZoneId
                      ? (hasMultipleZones ? `Layer in ${layerTargetZoneName}` : 'Layer')
                      : 'Layer unavailable: no active Zone'}
                    disabled={!layerTargetZoneId}
                    title={layerTargetZoneId ? `Add a Layer to ${layerTargetZoneName}` : undefined}
                    className="flex h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-45"
                    onClick={() => {
                      if (!layerTargetZoneId) return
                      setAddMenuOpen(false)
                      void onAddCompositionLayer(layerTargetZoneId)
                    }}
                  >
                    <Layers3 size={12} aria-hidden className="text-cyan-300/75" />
                    {/* Name the destination in the label, not just the tooltip: with
                        several Zones the resolved Zone is the one thing an author
                        cannot infer from the command (#363). */}
                    <span>{layerTargetZoneId && hasMultipleZones ? `Layer in ${layerTargetZoneName}` : 'Layer'}</span>
                    {!layerTargetZoneId && (
                      <span className="ml-auto text-[10px] text-zinc-600">No active Zone</span>
                    )}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    aria-label={addTransitionPlan.enabled
                      ? addTransitionLabel
                      : `Transition unavailable: ${addTransitionPlan.reason}`}
                    disabled={!addTransitionPlan.enabled}
                    title={addTransitionPlan.enabled
                      ? `Add a Transition from ${addTransitionPlan.target.fromName} to ${addTransitionPlan.target.toName}`
                      : undefined}
                    className="flex h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-45"
                    onClick={(event) => {
                      if (!addTransitionPlan.enabled) return
                      setAddMenuOpen(false)
                      const transitionTarget = addTransitionPlan.target
                      // A v2 target reuses the G4b-2b and G4b-2c palette shapes
                      // and apply paths unchanged; only v1 carries a junction.
                      if (!('junction' in transitionTarget)) {
                        onOpenLayerTransition({
                          settings: null,
                          fromName: transitionTarget.fromName,
                          toName: transitionTarget.toName,
                          anchor: addPopoverAnchor ?? event.currentTarget,
                          ...(transitionTarget.v2Cut ? { v2Cut: transitionTarget.v2Cut } : {}),
                          ...(transitionTarget.v2GroupCut ? { v2GroupCut: transitionTarget.v2GroupCut } : {}),
                        })
                        return
                      }
                      onOpenLayerTransition({
                        settings: transitionTarget.junction.transition,
                        legacy: transitionTarget.junction,
                        fromName: transitionTarget.fromName,
                        toName: transitionTarget.toName,
                        anchor: addPopoverAnchor ?? event.currentTarget,
                        ...(transitionTarget.groupOccurrenceId
                          ? { groupOccurrenceId: transitionTarget.groupOccurrenceId }
                          : {}),
                      })
                    }}
                  >
                    <Zap size={12} aria-hidden className="text-violet-300/80" />
                    <span className="min-w-0 truncate">{addTransitionLabel}</span>
                    {!addTransitionPlan.enabled && (
                      <span
                        className="ml-auto min-w-0 max-w-36 truncate text-[10px] text-zinc-600"
                        title={addTransitionPlan.reason}
                      >
                        {addTransitionPlan.reason}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-zinc-800 hover:text-zinc-100"
                    onClick={() => {
                      const transport = useShowTransportStore.getState()
                      setInsertTimeAtMs(transport.showId === showId ? transport.positionMs : 0)
                      setAddMenuOpen(false)
                      setInsertTimeOpen(true)
                    }}
                  >
                    <Clock3 size={12} aria-hidden className="text-zinc-500" />
                    <span>Time</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-zinc-800 hover:text-zinc-100"
                    onClick={() => {
                      const transport = useShowTransportStore.getState()
                      const timeMs = transport.showId === showId ? transport.positionMs : 0
                      setLayoutActionTimeMs(timeMs)
                      setLayoutActionError(null)
                      setAddMenuOpen(false)
                      setLayoutActionsOpen(true)
                    }}
                  >
                    <Grid2X2 size={12} aria-hidden className="text-violet-300/75" />
                    <span>Zone Layout</span>
                  </button>
                </ShowTimelineToolbarPopover>
              )}
              {addClipOpen && (
                <ShowTimelineToolbarPopover
                  anchor={addClipPointerContext?.anchor ?? addPopoverAnchor}
                  point={addClipPointerContext?.point}
                  widthPx={288}
                  ariaLabel="Add Clip at playhead"
                  className="w-[288px] rounded border border-zinc-700 bg-zinc-950 p-2.5 shadow-2xl"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="mb-1.5 flex items-center justify-between text-[9px] uppercase tracking-[0.1em] text-zinc-500">
                    <span>Add Clip</span>
                    <span className="normal-case tabular-nums text-zinc-600">{formatShowTime(addClipTimeMs)}</span>
                  </div>
                  <PatternCombobox
                    ariaLabel="Pattern for new Clip"
                    value={addClipPattern ? `${addClipPattern.ref.kind}:${addClipPattern.ref.id}` : null}
                    options={patternOptions.map((option) => ({
                      value: `${option.ref.kind}:${option.ref.id}`,
                      label: option.label,
                      group: option.group,
                    }))}
                    compact
                    disabled={addClipSubmitting || !addClipDestination}
                    onChange={chooseAddClipPattern}
                  />
                  <div className="mt-2 flex justify-end">
                    <Button size="xs" variant="ghost" onClick={() => {
                      setAddClipOpen(false)
                      setAddClipPointerContext(null)
                    }} disabled={addClipSubmitting}>Cancel</Button>
                  </div>
                </ShowTimelineToolbarPopover>
              )}
              {insertTimeOpen && (
                <ShowTimelineToolbarPopover
                  anchor={addPopoverAnchor}
                  widthPx={288}
                  ariaLabel="Insert Time"
                  className="w-[288px] rounded border border-zinc-700 bg-zinc-950 p-2.5 shadow-2xl"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                    <span>Insert Time</span>
                    <span className="normal-case tabular-nums text-zinc-500">at {formatSecondsValue(insertTimeAtMs)}s</span>
                  </div>
                  <UiTimeField
                    label="Time to insert"
                    ariaLabel="Time to insert in seconds"
                    hideLabel
                    variant="editor"
                    value={insertTimeSeconds}
                    min={0.001}
                    max={Number.MAX_SAFE_INTEGER}
                    step={0.001}
                    onPreview={setInsertTimeSeconds}
                    onChange={setInsertTimeSeconds}
                  />
                  {!insertTimePlan.enabled && (
                    <p className="mt-1.5 text-[10px] leading-4 text-amber-200/80">{insertTimePlan.reason}</p>
                  )}
                  <div className="mt-2 flex justify-end gap-1">
                    <Button size="xs" variant="ghost" onClick={() => setInsertTimeOpen(false)}>Cancel</Button>
                    <Button
                      size="xs"
                      variant="secondary"
                      disabled={!insertTimePlan.enabled}
                      onClick={() => {
                        if (!insertTimePlan.enabled) return
                        void onInsertTime(insertTimeAtMs, insertTimeDurationMs).then((changed) => {
                          if (changed) setInsertTimeOpen(false)
                        }).catch(() => {})
                      }}
                    >Insert</Button>
                  </div>
                </ShowTimelineToolbarPopover>
              )}
              {layoutActionsOpen && (
                <ShowTimelineToolbarPopover
                  anchor={addPopoverAnchor}
                  widthPx={288}
                  ariaLabel="Zone Layout at playhead"
                  className="w-[288px] rounded border border-zinc-700 bg-zinc-950 p-2.5 text-[12px] text-zinc-300 shadow-2xl"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-[0.1em] text-zinc-500">Current interval</div>
                      <div className="truncate text-[13px] font-medium text-zinc-100">{layoutActionInterval ? layoutKindLabel(layoutActionInterval.layoutId) : 'No Layout'}</div>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-500">{formatShowTime(layoutActionTimeMs)}</span>
                  </div>
                  {layoutActionInterval && (
                    <button
                      type="button"
                      aria-label="Open this interval's Zone Layout"
                      className="mt-0.5 text-left text-[11px] text-zinc-500 underline decoration-dotted underline-offset-4 hover:text-zinc-200"
                      onClick={() => {
                        // Anchor to the toolbar button, not to this link: closing
                        // the popover unmounts the link in the same commit, and a
                        // detached anchor leaves the panel hidden (#629).
                        setLayoutActionsOpen(false)
                        onSelect({ kind: 'zone-layout', layoutId: layoutActionInterval.layoutId, intervalId: layoutActionInterval.id }, addPopoverAnchor)
                      }}
                    >
                      Edit {layoutKindLabel(layoutActionInterval.layoutId)}
                    </button>
                  )}
                  <div className="grid grid-cols-[72px_1fr] items-center gap-2 py-1">
                    <span className="text-zinc-500">Duration</span>
                    <UiTimeField
                      label="Layout interval duration"
                      ariaLabel="Layout interval duration in seconds"
                      hideLabel
                      variant="editor"
                      value={layoutActionDurationSeconds}
                      min={0.001}
                      max={Number.MAX_SAFE_INTEGER}
                      step={0.001}
                      onPreview={setLayoutActionDurationSeconds}
                      onChange={setLayoutActionDurationSeconds}
                    />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!layoutActionDurationValid}
                      onClick={() => runLayoutAction(() => (
                        // A new interval starts as a copy of the layout under
                        // the playhead - per-interval ownership, no registry
                        // picking (#694).
                        onAppendLayoutInterval(layoutActionInterval?.layoutId, layoutActionDurationMs)
                      ))}
                    >Append</Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!layoutActionDurationValid}
                      onClick={() => runLayoutAction(() => (
                        onInsertLayoutInterval(layoutActionInterval?.layoutId, layoutActionDurationMs, layoutActionTimeMs)
                      ))}
                    >Insert here</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!layoutActionInterval}
                      onClick={() => layoutActionInterval && runLayoutAction(() => onDuplicateLayoutInterval(layoutActionInterval.id, false))}
                    >Duplicate Layout</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!layoutActionInterval}
                      onClick={() => layoutActionInterval && runLayoutAction(() => onDuplicateLayoutInterval(layoutActionInterval.id, true))}
                    >Duplicate + Clips</Button>
                  </div>
                  {layoutActionInterval && layoutActionUseCount > 1 && (
                    <button
                      type="button"
                      className="mt-2 w-full rounded border border-zinc-800 px-2 py-1.5 text-left text-[11px] text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-100"
                      onClick={() => runLayoutAction(() => onMakeLayoutIntervalUnique(layoutActionInterval.id))}
                    >
                      <strong className="font-medium text-zinc-200">Make this Layout unique</strong>
                      <span className="mt-0.5 block text-zinc-600">Separate this occurrence from {layoutActionUseCount - 1} other {layoutActionUseCount === 2 ? 'use' : 'uses'}.</span>
                    </button>
                  )}
                  {layoutActionError && <p role="alert" className="mt-2 text-[11px] leading-4 text-amber-200/80">{layoutActionError}</p>}
                </ShowTimelineToolbarPopover>
              )}
            </>
          )}
          <ShowTimelineCommands
            backing={show
              ? { recordVersion: 1, show, composition: timelineComposition }
              : { recordVersion: 2, showId }}
            timelineView={timelineView}
            readOnly={readOnly}
            selection={selection}
            isolatedGroupOccurrenceId={isolatedGroupOccurrenceId}
            onSelect={onSelect}
            onCreateGroup={onCreateGroup}
            onSplitCompositionClip={onSplitCompositionClip}
            onDuplicateCompositionClip={onDuplicateCompositionClip}
            onDuplicateCompositionClipV2={onDuplicateCompositionClipV2}
            captureV2ClipEdit={captureV2ClipEdit}
            onCommitV2ClipTemporal={onCommitV2ClipTemporal}
          />
          <ShowTimelineHistoryCommands showId={showId} recordVersion={recordVersion} readOnly={readOnly} />
          {!readOnly && (
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={zonesOpen ? 'Close Zones' : 'Open Zones'}
              aria-expanded={zonesOpen}
              title={zonesOpen ? 'Hide the Zone rail' : 'Show the Zone rail'}
              className={showTimelineToolbarControlClass({ enabled: true, active: zonesOpen })}
              onClick={() => {
                setZoneMapOpen(false)
                setZoneWorkspaceOpen(showId, !zonesOpen)
              }}
            >
              <PanelLeft size={12} aria-hidden />
            </Button>
          )}
          <div className="ml-1 flex shrink-0 items-center gap-[1.5px] border-l border-zinc-800/80 pl-1" role="group" aria-label="Marker controls">
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Snap playhead"
              aria-pressed={snapEnabled}
              title="Magnetize drags to nearby Clip, Transition, Marker, Show-end, and playhead boundaries. Drops always land on the time grid: whole seconds, finer as you zoom in · Shift for tenths · Alt for free placement."
              className={showTimelineToolbarControlClass({ enabled: true, active: snapEnabled })}
              onClick={() => setSnapEnabled(!snapEnabled)}
            >
              <Magnet size={12} aria-hidden />
            </Button>
            {!readOnly && (
              <TimelineMarkerSource
                showId={showId}
                durationMs={timelineView.showEndMs}
                viewport={viewport}
                snapEnabled={snapEnabled}
                structuralTimesMs={structuralTimesMs}
                getVisibleWidth={() => Math.max(1, scrollRef.current?.clientWidth ?? 812)}
                getRulerBounds={() => timelineRulerRef.current?.getBoundingClientRect() ?? null}
                onCreateMarker={onAddMarker}
                onMarkerFeedback={setMarkerFeedback}
              />
            )}
            {!readOnly && (
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={markersVisible ? 'Hide Markers' : 'Show Markers'}
                aria-pressed={markersVisible}
                title={markersVisible
                  ? 'Hide Markers and stop snapping to them'
                  : 'Show Markers and use them as snap targets'}
                className={showTimelineToolbarControlClass({ enabled: true, active: markersVisible })}
                onClick={() => {
                  const enabled = !markersVisible
                  setMarkersVisible(enabled)
                  setMarkerSnapEnabled(enabled)
                }}
              >
                <Flag size={12} aria-hidden />
              </Button>
            )}
          </div>
        </div>
        <div className="timeline-view-cluster flex min-w-[120px] max-w-[210px] flex-[0_1_180px] shrink items-center gap-1 border-l border-zinc-800/80 px-1" role="group" aria-label="Timeline view controls">
          <ShowTimelineNavigator showId={showId} viewport={viewport} onChange={updateViewport} compact />
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Fit timeline to Show"
            title="Fit the complete Show"
            disabled={timelineIsFitted}
            className="shrink-0 bg-transparent text-zinc-500 hover:bg-amber-400/10 hover:text-amber-200"
            onClick={() => updateViewport(fitShowTimelineViewport(timelineView.showEndMs))}
          >
            <Maximize2 size={12} aria-hidden />
          </Button>
        </div>
      </div>
      {isolatedGroupView && (
        <div
          role="status"
          aria-label={`Group isolation: ${isolatedGroupView.name}`}
          data-show-group-isolation={isolatedGroupView.id}
          className="flex h-7 items-center gap-2 border-x border-b border-cyan-400/20 bg-cyan-400/[0.055] px-2 text-[10px] text-cyan-100/85"
        >
          <Layers3 size={12} aria-hidden className="text-cyan-300/80" />
          <span>Editing <strong className="font-medium text-cyan-100">{isolatedGroupView.name}</strong></span>
          <span className="text-zinc-600">Linked definition · outside content is protected</span>
          <button
            type="button"
            className="ml-auto rounded px-1.5 py-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            onClick={onExitGroupIsolation}
          >
            Exit <kbd className="ml-1 text-[8px] text-zinc-600">Esc</kbd>
          </button>
        </div>
      )}
      <div className="relative isolate" data-show-timeline-overlay-host>
        <div
          ref={scrollRef}
          data-show-timeline-scroll-viewport
          data-testid="show-timeline-scroll-region"
          className="scrollbar-hidden overflow-x-auto"
          onScroll={(event) => {
            const element = event.currentTarget
            const maxScroll = Math.max(0, element.scrollWidth - element.clientWidth)
            const maxStart = viewport.totalMs - viewport.durationMs
            if (maxScroll > 0 && maxStart > 0) {
              updateViewport((current) => panShowTimelineViewport(current, element.scrollLeft / maxScroll * maxStart))
            }
          }}
        >
        <div
          data-testid="show-timeline-grid"
          className={`relative isolate grid gap-y-1.5 ${!zonesOpen && !hasMultipleZones ? 'px-1' : ''}`}
          onPointerDownCapture={(event) => {
            if (!isolatedGroupOccurrenceId) return
            const target = event.target
            const groupId = target instanceof Element
              ? target.closest<HTMLElement>('[data-show-group-occurrence]')?.dataset.showGroupOccurrence
              : undefined
            if (groupId === isolatedGroupOccurrenceId) return
            event.preventDefault()
            event.stopPropagation()
          }}
          onPointerDown={beginGroupMarquee}
          onClickCapture={(event) => {
            if (!isolatedGroupOccurrenceId) return
            const target = event.target
            const groupId = target instanceof Element
              ? target.closest<HTMLElement>('[data-show-group-occurrence]')?.dataset.showGroupOccurrence
              : undefined
            if (groupId === isolatedGroupOccurrenceId) return
            event.preventDefault()
            event.stopPropagation()
          }}
          onDoubleClickCapture={(event) => {
            if (!isolatedGroupOccurrenceId) return
            const target = event.target
            const groupId = target instanceof Element
              ? target.closest<HTMLElement>('[data-show-group-occurrence]')?.dataset.showGroupOccurrence
              : undefined
            if (groupId === isolatedGroupOccurrenceId) return
            event.preventDefault()
            event.stopPropagation()
            onExitGroupIsolation()
          }}
          style={{
            width: timelineWidth,
            minWidth: 0,
            gridTemplateColumns: columns.join(' '),
            gridTemplateRows: rows.join(' '),
          }}
        >
        <div
          aria-hidden
          data-show-timeline-tail
          className="pointer-events-none"
          style={{ gridRow: rows.length, gridColumn: '1 / -1' }}
        />
        {agentController?.showId === showId && agentDrawer.band && (
          <div aria-hidden className="pointer-events-none relative z-30" style={{ gridColumn: '2 / -1', gridRow: '1 / -1' }}>
            <div data-testid="agent-time-band" className="agent-time-band" style={{ left: `${agentDrawer.band.startMs / viewport.totalMs * 100}%`, width: `${(agentDrawer.band.endMs - agentDrawer.band.startMs) / viewport.totalMs * 100}%` }} />
          </div>
        )}
        {/*
          Timeline stacking contract inside this isolated canvas:
          z-10 Clips, z-15 per-layer junctions, z-20 layout masks,
          z-30 playhead/sticky chrome, z-35 Markers and Show End, z-50 marquee.
          Entity Detail panels are portalled above the canvas at z-80.
        */}
        {marquee && (
          <div
            aria-hidden
            data-show-timeline-marquee
            className="pointer-events-none absolute z-50 border border-live/80 bg-live/10 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
            style={marquee}
          />
        )}
        {(showFullZoneHeaders || showMicroZonePicker) && <div
          className="sticky left-0 z-30 flex items-center border-b border-zinc-900 bg-[#060608] px-1"
          style={{ gridColumn: 1, gridRow: rulerRow }}
        >
          <button
            ref={setZoneMapAnchor}
            type="button"
            data-studio-space-preview="true"
            aria-label={zoneMapOpen ? 'Close Zone Map' : 'Open Zone Map'}
            aria-expanded={zoneMapOpen}
            title={zoneMapOpen ? 'Close the Zone Map' : 'Open the Zone Map: Zones and Zone Layouts'}
            className={[
              'flex h-6 min-w-0 flex-1 items-center gap-1 rounded px-1 text-[9px] uppercase tracking-[0.12em] transition-colors',
              showMicroZonePicker ? 'justify-center' : '',
              zoneMapOpen ? 'bg-live/10 text-live' : 'text-structural hover:bg-zinc-900 hover:text-zinc-200',
            ].join(' ')}
            onClick={() => setZoneMapOpen(!zoneMapOpen)}
          >
            <MapIcon size={12} aria-hidden className="shrink-0" />
            {!showMicroZonePicker && <span className="truncate">Zones</span>}
          </button>
        </div>}
        <TimelineRuler
          rulerRef={timelineRulerRef}
          showId={showId}
          durationMs={timelineView.showEndMs}
          gridColumn={`2 / ${timeGridEndLine}`}
          viewport={viewport}
          gridRow={rulerRow}
          snapEnabled={snapEnabled}
          structuralTimesMs={structuralTimesMs}
          getVisibleWidth={() => Math.max(1, (scrollRef.current?.clientWidth ?? 812) - 212)}
        />
        <TimelineMarkers
            durationMs={timelineView.showEndMs}
            minimumShowEndMs={show && timelineComposition
              ? showTimelineContentEndMs({ ...show, composition: timelineComposition })
              : Math.max(1, ...timelineView.rows.flatMap((row) => row.layers.flatMap((layer) => layer.items.map((item) => item.endMs))))}
            onPreviewShowEnd={setShowEndPreviewMs}
            markers={markersVisible ? timelineView.markers : []}
            markerFeedback={markerFeedback}
            gridColumn={`2 / ${timeGridEndLine}`}
            gridRow={rulerRow}
            rowSpan={timelineOverlayRowSpan}
            layoutScale={timelineScale}
            snapEnabled={snapEnabled}
            structuralTimesMs={structuralTimesMs}
            readOnly={readOnly}
            onMoveMarker={onMoveMarker}
            onUpdateMarker={onUpdateMarker}
            onRemoveMarker={onRemoveMarker}
            onSetShowEnd={onSetShowEnd}
          />
        <TimelineLayoutBoundaries
          show={show}
          intervals={layoutIntervals}
          durationMs={timelineView.showEndMs}
          gridColumn={`2 / ${timeGridEndLine}`}
          gridRow={rulerRow}
          rowSpan={timelineOverlayRowSpan}
          selection={selection}
        />
        <TimelinePlayhead
          showId={showId}
          durationMs={timelineView.showEndMs}
          gridColumn={`2 / ${timeGridEndLine}`}
          gridRow={rulerRow}
          rowSpan={timelineOverlayRowSpan}
          viewport={viewport}
          snapEnabled={snapEnabled}
          structuralTimesMs={structuralTimesMs}
          getVisibleWidth={() => Math.max(1, (scrollRef.current?.clientWidth ?? 812) - 212)}
        />
        {layoutLaneVisible && (() => {
          const splitLogical = movingSplitLayout?.logical
          // Both backings name the split's two Zones; v2 reads their colours from
          // the timeline rows the lane is already built from (#1066 slice 9a).
          const splitZoneColor = (zoneId: string | undefined) => (show
            ? show.zones.find((zone) => zone.id === zoneId)?.color
            : timelineView.rows.find((row) => row.zoneId === zoneId)?.color)
          const splitColors = splitLogical && (splitLogical.kind === 'split' || splitLogical.kind === 'soft-split')
            ? [
                splitZoneColor(splitLogical.zoneIds[0]) ?? '#38bdf8',
                splitZoneColor(splitLogical.zoneIds[1]) ?? '#f97316',
              ]
            : null
          // One lane, one markup, one grid placement. v1's time columns are its
          // Scene and boundary pairs; the authored-v2 record's are the same
          // structural spans this grid is already built from, so each backing
          // only supplies different cells (#1065).
          const laneCells = show
            ? show.scenes.map((scene, sceneIndex) => {
                const interval = legacyLayoutIntervals.find((candidate) => candidate.sceneIds.includes(scene.id))
                return {
                  key: `layout-lane-${scene.id}`,
                  gridColumn: 2 + sceneIndex * 2,
                  layoutId: interval?.layoutId ?? null,
                  intervalId: interval?.id ?? null,
                  zoneIds: interval?.zoneIds ?? [],
                  firstOfInterval: Boolean(interval && interval.sceneIds[0] === scene.id),
                  splitPosition: scene.routingTargets?.splitPosition ?? 0.5,
                }
              })
            : timeSections.map((section, index) => {
                const interval = layoutIntervals.find((candidate) => (
                  candidate.startMs <= section.startMs && candidate.endMs > section.startMs
                ))
                return {
                  key: `layout-lane-span-${index}`,
                  gridColumn: 2 + index * 2,
                  layoutId: interval?.definitionId ?? null,
                  intervalId: interval?.id ?? null,
                  zoneIds: interval?.zoneIds ?? [],
                  firstOfInterval: Boolean(interval && interval.startMs === section.startMs),
                  splitPosition: interval?.parameters.splitPosition ?? 0.5,
                }
              })
          const laneIntervalCount = show ? legacyLayoutIntervals.length : layoutIntervals.length
          const laneCellLabel = (cell: (typeof laneCells)[number]) => {
            if (!cell.layoutId) return 'Zone Layout'
            const soleZoneName = cell.zoneIds.length === 1
              ? show
                ? show.zones.find((zone) => zone.id === cell.zoneIds[0])?.name
                : timelineView.rows.find((row) => row.zoneId === cell.zoneIds[0])?.zoneName
              : undefined
            return soleZoneName
              ? `${layoutKindLabel(cell.layoutId)} · ${soleZoneName}`
              : layoutKindLabel(cell.layoutId)
          }
          return (
            <div role="group" aria-label="Zone Layouts lane" className="contents">
              <div
                className="sticky left-0 z-30 flex h-[18px] items-center gap-1 border-t border-zinc-900/80 bg-zinc-950 px-2 font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600"
                style={{ gridColumn: 1, gridRow: contentStartRow }}
              >
                {showMicroZonePicker ? <Route size={12} aria-hidden /> : 'Layouts'}
              </div>
              {laneCells.map((cell) => {
                const isSplitCell = Boolean(cell.layoutId && movingSplitLayout && splitColors
                  && cell.layoutId === movingSplitLayout.id)
                const label = laneCellLabel(cell)
                return (
                  <button
                    key={cell.key}
                    type="button"
                    aria-label={`Edit ${label} Zone Layout`}
                    title="Edit this interval's Zone Layout"
                    data-show-timeline-focus
                    {...(cell.intervalId && cell.firstOfInterval && laneIntervalCount > 1
                      ? { 'data-show-layout-interval': cell.intervalId }
                      : {})}
                    {...(cell.layoutId && cell.intervalId
                      ? { 'data-show-selection-key': `zone-layout:${cell.layoutId}:${cell.intervalId}` }
                      : {})}
                    className="flex h-[18px] min-w-0 items-center justify-between gap-1 border-t border-zinc-900/80 px-1.5 font-mono text-[9px] text-zinc-300 outline-none hover:ring-1 hover:ring-inset hover:ring-live/50 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-live/80"
                    style={{
                      gridColumn: cell.gridColumn,
                      gridRow: contentStartRow,
                      background: isSplitCell && splitColors
                        ? `linear-gradient(90deg, color-mix(in srgb, ${splitColors[0]} 12%, transparent) 0 ${cell.splitPosition * 100}%, color-mix(in srgb, ${splitColors[1]} 12%, transparent) ${cell.splitPosition * 100}% 100%)`
                        : 'transparent',
                    }}
                    onClick={(event) => {
                      event.stopPropagation()
                      if (cell.layoutId && cell.intervalId) {
                        onSelect({ kind: 'zone-layout', layoutId: cell.layoutId, intervalId: cell.intervalId }, event.currentTarget)
                      }
                    }}
                  >
                    <span className="truncate">{cell.firstOfInterval ? label : ''}</span>
                    {isSplitCell && <span className="shrink-0 text-zinc-500">{Math.round(cell.splitPosition * 100)}%</span>}
                  </button>
                )
              })}
              <div
                aria-hidden={false}
                className="pointer-events-none relative"
                style={{ gridColumn: `2 / ${timeGridEndLine}`, gridRow: contentStartRow }}
              >
                {layoutIntervals.slice(1).map((interval, index) => {
                  // The Layout switch lives in the lane with everything else
                  // Layout-shaped (#694 review). It anchors at the boundary
                  // position as an overlay, so a zero-duration switch stays
                  // clickable even though its grid column has no width.
                  const precedingSceneIds = layoutIntervals[index].legacy?.sceneIds
                  const precedingSceneId = precedingSceneIds?.[precedingSceneIds.length - 1]
                  const switchId = show && precedingSceneId
                    ? showRoutingTransitionAfter(show, precedingSceneId)?.id ?? null
                    : interval.incomingTransfer?.id ?? null
                  if (!switchId) return null
                  const { left } = showLayoutIntervalPercentBounds(interval, timelineView.showEndMs)
                  const selected = selection.kind === 'transition' && selection.transitionId === switchId
                  return (
                    <button
                      key={`layout-switch-${interval.id}`}
                      type="button"
                      aria-label={`Select ${layoutKindLabel(interval.definitionId)} routing interval ${index + 1}`}
                      aria-pressed={selected}
                      title="Edit the Zone Layout switch"
                      data-show-timeline-focus
                      data-show-selection-key={`transition:${switchId}`}
                      className={selected
                        ? 'pointer-events-auto absolute inset-y-0 z-[2] grid w-4 -translate-x-1/2 place-items-center rounded-sm bg-live/10 text-live outline-none ring-1 ring-live/70'
                        : 'pointer-events-auto absolute inset-y-0 z-[2] grid w-4 -translate-x-1/2 place-items-center rounded-sm text-zinc-500 outline-none hover:bg-live/10 hover:text-live focus-visible:bg-live/10 focus-visible:text-live focus-visible:ring-1 focus-visible:ring-live/60'}
                      style={{ left: `${left}%` }}
                      onClick={(event) => {
                        event.stopPropagation()
                        onSelect({ kind: 'transition', transitionId: switchId }, event.currentTarget)
                      }}
                    >
                      <Route size={10} aria-hidden />
                    </button>
                  )
                })}
              </div>
              {show && movingSplitLayout && show.scenes.slice(0, -1).map((scene, sceneIndex) => {
                const transition = show.transitions?.find((candidate) => candidate.afterSceneId === scene.id && candidate.kind !== 'routing')
                const descriptor = transition?.propertyTransitions?.routing?.splitPosition
                const target = show.scenes[sceneIndex + 1]?.routingTargets?.splitPosition ?? 0.5
                return transition ? (
                  <button
                    key={`split-boundary-${scene.id}`}
                    type="button"
                    aria-label={`Edit split position at ${showBoundaryClipIdentity(show, scene.id)}`}
                    data-show-timeline-focus
                    data-show-selection-key={`transition:${transition.id}`}
                    className={descriptor ? 'border-t border-zinc-900/80 bg-live/[0.07] font-mono text-[9px] text-live' : 'border-t border-zinc-900/80 font-mono text-[9px] text-zinc-700 hover:text-live'}
                    style={{ gridColumn: 3 + sceneIndex * 2, gridRow: contentStartRow }}
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelect({ kind: 'transition', transitionId: transition.id }, event.currentTarget)
                    }}
                  >
                    {descriptor ? `${Math.round(descriptor.from * 100)}→${Math.round(target * 100)}` : '—'}
                  </button>
                ) : null
              })}
              {/* The v2 counterpart of the v1 split buttons above: one per boundary Transition, selecting it as v1 does (#1066 L2332). */}
              {!show && movingSplitLayout && Object.values(boundaryTransitionsOverride ?? {}).flatMap((boundary) => {
                const sectionIndex = timeSections.findIndex((section) => section.startMs === boundary.destinationStartMs)
                if (sectionIndex < 1) return []
                const descriptor = boundary.settings.propertyTransitions?.routing?.splitPosition
                return [(
                  <button
                    key={`split-boundary-${boundary.id}`}
                    type="button"
                    aria-label={`Edit split position at ${boundary.boundaryIdentity}`}
                    data-show-timeline-focus
                    data-show-selection-key={`transition:${boundary.id}`}
                    className={descriptor ? 'border-t border-zinc-900/80 bg-live/[0.07] font-mono text-[9px] text-live' : 'border-t border-zinc-900/80 font-mono text-[9px] text-zinc-700 hover:text-live'}
                    style={{ gridColumn: 1 + sectionIndex * 2, gridRow: contentStartRow }}
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelect({ kind: 'transition', transitionId: boundary.id }, event.currentTarget)
                    }}
                  >
                    {descriptor ? `${Math.round(descriptor.from * 100)}→${Math.round((boundary.split?.to ?? 0.5) * 100)}` : '—'}
                  </button>
                )]
              })}
            </div>
          )
        })()}
        {!show && sampleRepeatAtOverride && (
          // The authored-v2 record has no Scenes: one cell per structural
          // section shows that section's repeat scale (#1066 slice 9c1).
          <div role="group" aria-label="Sample repeat lane" className="contents">
            <div
              className="sticky left-0 z-30 flex items-center gap-1 border-t border-zinc-900/80 bg-[#060608] px-2 font-mono text-[9px] text-cyan-300/80"
              style={{ gridColumn: 1, gridRow: contentStartRow + (layoutLaneVisible ? 1 : 0) }}
            >
              {showMicroZonePicker ? <Repeat2 size={12} aria-hidden /> : '↳ sample repeat'}
            </div>
            {timeSections.map((section, index) => (
              <div
                key={`sample-repeat-span-${index}`}
                className="flex items-center justify-center border-t border-zinc-900/80 bg-[repeating-linear-gradient(135deg,rgba(34,211,238,0.12)_0_3px,transparent_3px_8px)] font-mono text-[9px] text-cyan-100"
                style={{ gridColumn: 2 + index * 2, gridRow: contentStartRow + (layoutLaneVisible ? 1 : 0) }}
              >
                {formatRepeatScale(sampleRepeatAtOverride(section.startMs))}
              </div>
            ))}
            {/* One button per boundary Transition, between the two sections it
                joins, selecting it as v1 does (#1066 slice 9c2b). A derived Cut
                has no Transition to select until Insert from Cut connects. */}
            {Object.values(boundaryTransitionsOverride ?? {}).flatMap((boundary) => {
              const sectionIndex = timeSections.findIndex((section) => section.startMs === boundary.destinationStartMs)
              if (sectionIndex < 1) return []
              const descriptor = boundary.settings.propertyTransitions?.sample?.repeatScale
              return [(
                <button
                  key={`sample-repeat-boundary-${boundary.id}`}
                  type="button"
                  aria-label={`Edit repeat scale at ${boundary.boundaryIdentity}`}
                  data-show-timeline-focus
                  data-show-selection-key={`transition:${boundary.id}`}
                  className={descriptor ? 'border-t border-zinc-900/80 bg-cyan-400/10 font-mono text-[9px] text-cyan-200' : 'border-t border-zinc-900/80 font-mono text-[9px] text-zinc-700 hover:text-cyan-300'}
                  style={{ gridColumn: 1 + sectionIndex * 2, gridRow: contentStartRow + (layoutLaneVisible ? 1 : 0) }}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelect({ kind: 'transition', transitionId: boundary.id }, event.currentTarget)
                  }}
                >
                  {descriptor ? `${formatRepeatScale(descriptor.from)}→${formatRepeatScale(boundary.repeat?.to ?? 1)}` : '—'}
                </button>
              )]
            })}
          </div>
        )}
        {show && hasSampleRemap && (
          <div role="group" aria-label="Sample repeat lane" className="contents">
            <div
              className="sticky left-0 z-30 flex items-center gap-1 border-t border-zinc-900/80 bg-[#060608] px-2 font-mono text-[9px] text-cyan-300/80"
              style={{ gridColumn: 1, gridRow: contentStartRow + (layoutLaneVisible ? 1 : 0) }}
            >
              {showMicroZonePicker ? <Repeat2 size={12} aria-hidden /> : '↳ sample repeat'}
            </div>
            {show.scenes.map((scene, sceneIndex) => {
              const scale = scene.sampleTargets?.repeatScale ?? 1
              return (
                <div
                  key={`sample-repeat-${scene.id}`}
                  className="flex items-center justify-center border-t border-zinc-900/80 bg-[repeating-linear-gradient(135deg,rgba(34,211,238,0.12)_0_3px,transparent_3px_8px)] font-mono text-[9px] text-cyan-100"
                  style={{ gridColumn: 2 + sceneIndex * 2, gridRow: contentStartRow + (layoutLaneVisible ? 1 : 0) }}
                >
                  {formatRepeatScale(scale)}
                </div>
              )
            })}
            {show.scenes.slice(0, -1).map((scene, sceneIndex) => {
              const transition = show.transitions?.find((candidate) => candidate.afterSceneId === scene.id && candidate.kind !== 'routing')
              const descriptor = transition?.propertyTransitions?.sample?.repeatScale
              const target = show.scenes[sceneIndex + 1]?.sampleTargets?.repeatScale ?? 1
              return transition ? (
                <button
                  key={`sample-repeat-boundary-${scene.id}`}
                  type="button"
                  aria-label={`Edit repeat scale at ${showBoundaryClipIdentity(show, scene.id)}`}
                  data-show-timeline-focus
                  data-show-selection-key={`transition:${transition.id}`}
                  className={descriptor ? 'border-t border-zinc-900/80 bg-cyan-400/10 font-mono text-[9px] text-cyan-200' : 'border-t border-zinc-900/80 font-mono text-[9px] text-zinc-700 hover:text-cyan-300'}
                  style={{ gridColumn: 3 + sceneIndex * 2, gridRow: contentStartRow + (layoutLaneVisible ? 1 : 0) }}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelect({ kind: 'transition', transitionId: transition.id }, event.currentTarget)
                  }}
                >
                  {descriptor ? `${formatRepeatScale(descriptor.from)}→${formatRepeatScale(target)}` : '—'}
                </button>
              ) : null
            })}
          </div>
        )}
        {timelineView.rows.map((row, rowIndex) => {
          const zone = show?.zones.find((candidate) => candidate.id === row.zoneId)
          const collapsed = collapsedZoneIdSet.has(row.zoneId)
          const clipLayerCount = collapsed ? 1 : row.layers.length || 1
          return (
          <div key={row.zoneId} className="contents">
            {showFullZoneHeaders && <div
              className={[
                'group sticky left-0 z-30 flex items-stretch gap-0.5 overflow-hidden rounded-[5px] border border-transparent bg-[#060608] pr-0.5 text-left font-mono transition-all',
                selection.kind === 'zone' && selection.zoneId === row.zoneId
                  ? 'border-live/25 bg-live/10 text-zinc-100'
                  : 'text-zinc-300 hover:border-zinc-800 hover:bg-zinc-900/65 hover:text-zinc-100',
              ].join(' ')}
              style={{
                gridColumn: 1,
                gridRow: clipLayerCount > 1
                  ? `${rowStart(rowIndex) + contentStartRow + routingLaneRows} / span ${clipLayerCount}`
                  : rowStart(rowIndex) + contentStartRow + routingLaneRows,
              }}
            >
              <span
                aria-hidden
                className="mr-0.5 w-[3px] self-stretch rounded-sm"
                style={{ backgroundColor: row.color ?? '#38bdf8' }}
              />
              {hasMultipleZones ? (
                <button
                  type="button"
                  data-studio-space-preview="true"
                  aria-label={`${collapsed ? 'Expand' : 'Collapse'} zone ${row.zoneName}`}
                  aria-expanded={!collapsed}
                  title={`${collapsed ? 'Expand' : 'Collapse'} ${row.zoneName}`}
                  className="grid size-5 shrink-0 place-items-center self-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
                  onClick={(event) => {
                    event.stopPropagation()
                    setZoneCollapsed(showId, row.zoneId, !collapsed)
                  }}
                >
                  {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                </button>
              ) : (
                <span aria-hidden className="grid size-5 shrink-0 place-items-center self-center text-zinc-600">
                  <ZoneGlyph icon={zone?.icon} size={11} />
                </span>
              )}
              <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 overflow-hidden py-1">
                <span className="truncate text-[12px] font-medium leading-4">{row.zoneName}</span>
                {/* A collapsed Zone owns one 28px row; a second line would overflow
                    it and paint across its neighbours (#632). */}
                {!collapsed && (recordVersion === 2 || show?.outputContract?.kind === 'installation')
                  && <span className="truncate text-[10px] leading-3 text-structural transition-colors group-hover:text-zinc-400">{row.pixelCount}px</span>}
              </span>
              <button
                type="button"
                aria-label={`Open zone ${row.zoneName} properties`}
                title={`Open ${row.zoneName} properties`}
                data-show-timeline-focus
                data-studio-space-preview="true"
                data-show-selection-key={`zone:${row.zoneId}`}
                className="grid size-5 shrink-0 place-items-center self-center rounded text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-100 group-hover:text-zinc-400 focus-visible:text-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-live/60"
                onClick={(event) => {
                  event.stopPropagation()
                  onSelect({ kind: 'zone', zoneId: row.zoneId }, event.currentTarget)
                }}
              >
                <Settings2 size={12} aria-hidden />
              </button>
            </div>}
            {showMicroZonePicker && <button
              type="button"
              data-studio-space-preview="true"
              aria-label={`${collapsed ? 'Expand' : 'Collapse'} zone ${row.zoneName}`}
              aria-expanded={!collapsed}
              title={`${collapsed ? 'Expand' : 'Collapse'} ${row.zoneName}`}
              className={!collapsed && focusedZoneId === row.zoneId
                ? 'sticky left-0 z-30 grid place-items-center border-l-2 bg-live/10 text-live'
                : collapsed
                  ? 'sticky left-0 z-30 grid place-items-center border-l-2 bg-[#060608] text-zinc-300 hover:bg-zinc-900 hover:text-white'
                  : 'sticky left-0 z-30 grid place-items-center border-l-2 bg-[#060608] text-zinc-500 hover:bg-zinc-900 hover:text-zinc-100'}
              style={{
                borderLeftColor: row.color ?? '#38bdf8',
                gridColumn: 1,
                gridRow: rowStart(rowIndex) + contentStartRow + routingLaneRows,
              }}
              onClick={(event) => {
                event.stopPropagation()
                setZoneCollapsed(showId, row.zoneId, !collapsed)
              }}
            >
              <span className="relative grid size-5 place-items-center">
                <ZoneGlyph icon={zone?.icon} size={12} />
                {collapsed && <ChevronRight size={8} aria-hidden className="absolute -right-0.5 bottom-0 text-current" />}
              </span>
            </button>}
            {row.composed && collapsed && !showFullZoneHeaders && (
              <CollapsedZoneNameOverlay
                intervals={layoutIntervals}
                zoneId={row.zoneId}
                zoneName={row.zoneName}
                durationMs={timelineView.showEndMs}
                stickyLeftPx={hasMultipleZones ? ZONE_RAIL_MICRO_PX : 0}
                gridColumn={`2 / ${columns.length + 1}`}
                gridRow={rowStart(rowIndex) + contentStartRow + routingLaneRows}
              />
            )}
            {row.composed && (collapsed ? (
              <div
                role="img"
                aria-label={`Collapsed zone ${row.zoneName} timeline`}
                data-collapsed-zone={row.zoneId}
                className={[
                  'relative min-w-0 overflow-hidden border-y border-zinc-900 bg-[#08080a]',
                  dropTargetKey === `composition-zone:${row.zoneId}` ? 'ring-1 ring-inset ring-live/50' : '',
                ].join(' ')}
                style={{
                  gridColumn: `2 / ${columns.length + 1}`,
                  gridRow: rowStart(rowIndex) + contentStartRow + routingLaneRows,
                }}
                onDragOver={(event) => {
                  const draggedClip = draggingCompositionClipRef.current
                  if (!draggedClip || readOnly) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = draggedClip.mode === 'duplicate' ? 'copy' : 'move'
                  setDropTargetKey(`composition-zone:${row.zoneId}`)
                }}
                onDragLeave={() => setDropTargetKey((current) => current === `composition-zone:${row.zoneId}` ? null : current)}
                onDrop={(event) => {
                  const draggedClip = draggingCompositionClipRef.current
                  if (!draggedClip || draggedClip.settling || readOnly) return
                  event.preventDefault()
                  const rect = event.currentTarget.getBoundingClientRect()
                  const totalMs = Math.max(1, timelineView.showEndMs)
                  const clip = timelineView.rows
                    .flatMap((candidate) => candidate.layers.flatMap((layer) => layer.items))
                    .find((candidate) => candidate.id === draggedClip.clipId)
                  const candidateMs = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width))) * totalMs - draggedClip.grabOffsetMs
                  const clipDurationMs = clip?.durationMs ?? 0
                  const globalStartMs = resolveShowTimelineClipDragPlacement(candidateMs, {
                    durationMs: clipDurationMs,
                    totalMs,
                    visibleDurationMs: viewport.durationMs,
                    visibleWidthPx: Math.max(1, scrollRef.current?.clientWidth || rect.width),
                    structuralTimesMs: clipDragStructuralTimesMs(),
                    excludedStructuralTimesMs: clip ? [clip.startMs, clip.endMs] : [],
                    altKey: event.altKey,
                    shiftKey: event.shiftKey,
                  }).startMs
                  const target = { kind: 'main' as const, zoneId: row.zoneId, globalStartMs }
                  const plannedComposition = show && draggedClip.owner && draggedClip.mode === 'duplicate' && timelineComposition
                    ? duplicateShowClipAtGlobalTime(show, timelineComposition, {
                        owner: draggedClip.owner,
                        target,
                        newPlacementId: draggedClip.duplicatePlacementId!,
                        newInstanceId: draggedClip.duplicateInstanceId,
                      })
                    : null
                  draggedClip.settling = true
                  // A v2 duplicate selects the planner's fresh Clip on success.
                  let collapsedDuplicateSelectClipId: string | null = null
                  const commit = recordVersion === 2
                    ? (() => {
                        if (!clip || clip.groupOccurrenceId) return Promise.resolve(false)
                        // A collapsed Zone drop lands on its bottom Layer; the
                        // planner re-places the Clip there with the detach
                        // permission, joined or free, exactly as on the open
                        // lanes.
                        const targetLayer = timelineView.rows
                          .find((candidate) => candidate.zoneId === row.zoneId)?.layers
                          .reduce<ShowTimelineLayerView | null>((bottom, candidate) => (
                            !bottom || candidate.rank < bottom.rank ? candidate : bottom
                          ), null)
                        if (!targetLayer) return Promise.resolve(false)
                        if (draggedClip.mode === 'duplicate') {
                          const v2Duplicate = draggedClip.v2Move
                          const duplicatePlan = v2Duplicate
                            ? planShowTimelineGestureV2(v2Duplicate.capture, {
                                kind: 'duplicate',
                                clipId: clip.id,
                                startMs: Math.round(globalStartMs),
                                zoneId: row.zoneId,
                                layerId: targetLayer.id,
                              }, newPersonalContentId)
                            : null
                          if (!duplicatePlan || duplicatePlan.status !== 'ready' || duplicatePlan.submission.owner !== 'clip-sharing') {
                            return Promise.resolve(false)
                          }
                          collapsedDuplicateSelectClipId = duplicatePlan.selectAfterId
                            ?? duplicatePlan.submission.intent.identities.clipId
                          return commitV2ClipPlan(v2Duplicate, {
                            kind: 'clip-sharing',
                            intent: duplicatePlan.submission.intent,
                            selectClipId: collapsedDuplicateSelectClipId,
                          })
                        }
                        if (draggedClip.mode !== 'move') return Promise.resolve(false)
                        const request = {
                          clipId: clip.id,
                          zoneId: row.zoneId,
                          layerId: targetLayer.id,
                          startMs: globalStartMs,
                        }
                        return requestV2ClipMove(draggedClip.v2Move, request, planShowV2ClipMove(timelineView, request))
                      })()
                    : draggedClip.mode === 'duplicate' && timelineComposition && plannedComposition
                      ? onDuplicateCompositionClipAtTarget({
                          sourceComposition: timelineComposition,
                          plannedComposition,
                        })
                      : draggedClip.owner
                        ? onMoveCompositionClip({ owner: draggedClip.owner, target })
                        : Promise.resolve(false)
                  void commit.then((changed) => {
                    if (!changed || draggingCompositionClipRef.current !== draggedClip) return
                    const clipId = draggedClip.mode === 'duplicate'
                      ? (recordVersion === 2 ? collapsedDuplicateSelectClipId! : draggedClip.duplicatePlacementId!)
                      : draggedClip.clipId
                    if (draggedClip.mode === 'duplicate') onSelect({ kind: 'clip', clipId })
                    onReanchorDetails({ kind: 'clip', clipId })
                  }).catch(() => {}).finally(() => {
                    if (draggingCompositionClipRef.current !== draggedClip) return
                    draggedClip.settling = false
                    resetCompositionClipMove()
                  })
                  setDropTargetKey(null)
                }}
              >
                <div
                  data-testid="collapsed-zone-density-rail"
                  className="absolute inset-x-0 bottom-1 grid h-1.5 gap-px"
                  style={{ gridTemplateRows: `repeat(${row.layers.length}, minmax(0, 1fr))` }}
                >
                  {row.layers.map((layer) => <div key={layer.id} className="relative min-h-0 rounded-sm bg-white/[0.035]">
                    {layer.items.map((clip) => <i
                      key={clip.id}
                      className="absolute inset-y-0 min-w-px rounded-sm bg-current/45"
                      style={{
                        color: row.color ?? '#38bdf8',
                        left: `${clip.startMs / Math.max(1, timelineView.showEndMs) * 100}%`,
                        width: `${clip.durationMs / Math.max(1, timelineView.showEndMs) * 100}%`,
                      }}
                      title={`${clip.patternName}, ${formatShowTime(clip.startMs)} to ${formatShowTime(clip.endMs)}`}
                    />)}
                  </div>)}
                </div>
                {(propertyLanesByZone.get(row.zoneId) ?? []).flatMap((lane) => lane.projection.beats).map((beat) => <i
                  key={beat.id}
                  aria-hidden
                  className="absolute inset-y-0 w-px bg-violet-300/70"
                  style={{ left: `${beat.displayX * 100}%` }}
                />)}
                <LayoutZoneIntervalOverlay
                  intervals={layoutIntervals}
                  zoneId={row.zoneId}
                  durationMs={timelineView.showEndMs}
                />
              </div>
            ) : row.layers.map((layer, layerIndex) => (
              <div
                key={layer.id}
                className={[
                  'relative min-w-0 border-b border-zinc-900/80 bg-transparent transition-colors',
                  dropTargetKey === `composition:${layer.id}` ? 'bg-live/[0.07] ring-1 ring-inset ring-live/40' : '',
                ].join(' ')}
                style={{
                  gridColumn: `2 / ${columns.length + 1}`,
                  gridRow: rowStart(rowIndex) + contentStartRow + routingLaneRows + layerIndex,
                }}
                data-show-layer-kind={layer.rank === 0 ? 'main' : 'overlay'}
                data-show-layer-id={layer.id}
                data-show-layer-index={layer.layerIndex}
                data-show-zone-id={row.zoneId}
                data-drop-active={dropTargetKey === `composition:${layer.id}` ? 'true' : undefined}
                onDoubleClick={(event) => {
                  if (recordVersion === 2) {
                    if (readOnly || isolatedGroupOccurrenceId) return
                    const v2Record = captureV2Move?.()?.capture.record
                    if (!v2Record) return
                    const v2TargetElement = event.target
                    if (v2TargetElement instanceof Element && v2TargetElement.closest(
                      '[data-show-composition-clip="true"], [data-show-layer-junction], button, input, select, textarea, [role="slider"]',
                    )) return
                    const v2Rect = event.currentTarget.getBoundingClientRect()
                    const v2Fraction = Math.min(1, Math.max(0, (event.clientX - v2Rect.left) / Math.max(1, v2Rect.width)))
                    const v2TotalMs = Math.max(1, timelineView.showEndMs)
                    const v2RawGlobalTimeMs = v2Fraction * v2TotalMs
                    const v2SnappedGlobalTimeMs = snapClipBoundary(v2RawGlobalTimeMs, {
                      altKey: event.altKey,
                      shiftKey: event.shiftKey,
                      visibleWidthPx: Math.max(1, scrollRef.current?.clientWidth ?? v2Rect.width),
                      maxTimeMs: v2TotalMs,
                    }).timeMs
                    const v2Target: ShowClipAddTarget = layer.rank === 0
                      ? { kind: 'main' }
                      : { kind: 'overlay', layerIndex: layer.layerIndex }
                    let v2GlobalTimeMs = v2SnappedGlobalTimeMs
                    let v2Plan = planShowV2ClipAtTime(v2Record, {
                      zoneId: row.zoneId,
                      layerId: layer.id,
                      globalTimeMs: v2GlobalTimeMs,
                    })
                    if (!v2Plan.enabled && v2SnappedGlobalTimeMs !== v2RawGlobalTimeMs) {
                      const v2RawPlan = planShowV2ClipAtTime(v2Record, {
                        zoneId: row.zoneId,
                        layerId: layer.id,
                        globalTimeMs: v2RawGlobalTimeMs,
                      })
                      if (v2RawPlan.enabled) {
                        v2GlobalTimeMs = v2RawGlobalTimeMs
                        v2Plan = v2RawPlan
                      }
                    }
                    if (!v2Plan.enabled) return
                    event.preventDefault()
                    event.stopPropagation()
                    setAddMenuOpen(false)
                    setInsertTimeOpen(false)
                    setLayoutActionsOpen(false)
                    setAddClipTimeMs(v2GlobalTimeMs)
                    setAddClipPatternKey(null)
                    setAddClipSubmitting(false)
                    setAddClipPointerContext({
                      anchor: event.currentTarget,
                      point: { clientX: event.clientX, clientY: event.clientY },
                      zoneId: row.zoneId,
                      target: v2Target,
                      layerId: layer.id,
                    })
                    setAddClipOpen(true)
                    return
                  }
                  if (readOnly || !show || !timelineComposition || isolatedGroupOccurrenceId) return
                  const targetElement = event.target
                  if (targetElement instanceof Element && targetElement.closest(
                    '[data-show-composition-clip="true"], [data-show-layer-junction], button, input, select, textarea, [role="slider"]',
                  )) return
                  const rect = event.currentTarget.getBoundingClientRect()
                  const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)))
                  const totalMs = Math.max(1, timelineView.showEndMs)
                  const rawGlobalTimeMs = fraction * totalMs
                  const snappedGlobalTimeMs = snapClipBoundary(rawGlobalTimeMs, {
                    altKey: event.altKey,
                    shiftKey: event.shiftKey,
                    visibleWidthPx: Math.max(1, scrollRef.current?.clientWidth ?? rect.width),
                    maxTimeMs: totalMs,
                  }).timeMs
                  const target: ShowClipAddTarget = layer.rank === 0
                    ? { kind: 'main' }
                    : { kind: 'overlay', layerIndex: layer.layerIndex }
                  let globalTimeMs = snappedGlobalTimeMs
                  let plan = planShowClipAtGlobalTime(show, timelineComposition, {
                    zoneId: row.zoneId,
                    globalTimeMs,
                    target,
                  })
                  if (!plan.enabled && snappedGlobalTimeMs !== rawGlobalTimeMs) {
                    const rawPlan = planShowClipAtGlobalTime(show, timelineComposition, {
                      zoneId: row.zoneId,
                      globalTimeMs: rawGlobalTimeMs,
                      target,
                    })
                    if (rawPlan.enabled) {
                      globalTimeMs = rawGlobalTimeMs
                      plan = rawPlan
                    }
                  }
                  if (!plan.enabled) return
                  event.preventDefault()
                  event.stopPropagation()
                  setAddMenuOpen(false)
                  setInsertTimeOpen(false)
                  setLayoutActionsOpen(false)
                  setAddClipTimeMs(globalTimeMs)
                  setAddClipPatternKey(null)
                  setAddClipSubmitting(false)
                  setAddClipPointerContext({
                    anchor: event.currentTarget,
                    point: { clientX: event.clientX, clientY: event.clientY },
                    zoneId: row.zoneId,
                    target,
                  })
                  setAddClipOpen(true)
                }}
                onDragEnter={(event) => {
                  if (!draggingCompositionClipRef.current || readOnly) return
                  event.preventDefault()
                  setDropTargetKey(`composition:${layer.id}`)
                }}
                onDragOver={(event) => {
                  const draggedClip = draggingCompositionClipRef.current
                  if (!draggedClip || draggedClip.settling || readOnly) return
                  event.preventDefault()
                  const targetKey = `composition:${layer.id}`
                  activeMoveLayerRef.current = {
                    element: event.currentTarget,
                    layer,
                    zoneId: row.zoneId,
                    targetKey,
                  }
                  updateCompositionClipMovePreview({
                    clientX: event.clientX,
                    altKey: event.altKey,
                    shiftKey: event.shiftKey,
                    element: event.currentTarget,
                    layer,
                    zoneId: row.zoneId,
                    targetKey,
                    dataTransfer: event.dataTransfer,
                  })
                }}
                onDragLeave={(event) => {
                  if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
                  const rect = event.currentTarget.getBoundingClientRect()
                  const visibleLeft = Math.max(
                    rect.left,
                    scrollRef.current?.getBoundingClientRect().left ?? rect.left,
                  )
                  if (event.clientX < visibleLeft) return
                  setDropTargetKey((current) => current === `composition:${layer.id}` ? null : current)
                  if (activeMoveLayerRef.current?.targetKey === `composition:${layer.id}`) {
                    activeMoveLayerRef.current = null
                  }
                  if (movePlanRef.current?.preview.targetKey === `composition:${layer.id}`) {
                    movePlanRef.current = null
                    setMovePreview(null)
                  }
                }}
                onDrop={(event) => {
                  if (!draggingCompositionClipRef.current || readOnly) return
                  event.preventDefault()
                  commitCompositionClipMove(`composition:${layer.id}`)
                }}
              >
                <LayoutZoneIntervalOverlay
                  intervals={layoutIntervals}
                  zoneId={row.zoneId}
                  durationMs={timelineView.showEndMs}
                />
                {movePreview?.targetKey === `composition:${layer.id}` && (
                  <i
                    aria-hidden
                    data-testid="show-clip-move-preview"
                    data-drag-mode={movePreview.mode}
                    className={`pointer-events-none absolute inset-y-1 z-[9] rounded-[5px] border ${
                      movePreview.mode === 'duplicate'
                        ? 'border-dashed border-amber-200/90 bg-live/10 shadow-[3px_3px_0_-1px_rgba(251,191,36,0.28)]'
                        : 'border-amber-300/80 bg-amber-300/10 shadow-[0_0_0_1px_rgba(251,191,36,0.12)]'
                    }`}
                    style={{
                      left: `${movePreview.startMs / Math.max(1, timelineView.showEndMs) * 100}%`,
                      width: `${movePreview.durationMs / Math.max(1, timelineView.showEndMs) * 100}%`,
                    }}
                  >
                    <span
                      data-testid="show-clip-move-preview-time"
                      className="absolute -top-0.5 left-1 whitespace-nowrap font-mono text-[9px] not-italic leading-none text-amber-200/90"
                    >
                      {formatSecondsValue(movePreview.startMs)}s
                    </span>
                  </i>
                )}
                {resizePreview !== null && layer.items.some((clip) => clip.id === resizePreview.clipId) && (
                  <span
                    aria-hidden
                    data-testid="show-clip-resize-time"
                    className="pointer-events-none absolute top-0 z-[40] whitespace-nowrap rounded-sm bg-zinc-950/90 px-1 font-mono text-[9px] leading-3 text-amber-200/90"
                    style={{ left: `${resizePreview.startMs / Math.max(1, timelineView.showEndMs) * 100}%` }}
                  >
                    {formatSecondsValue(resizePreview.startMs)}–{formatSecondsValue(resizePreview.startMs + resizePreview.durationMs)}s
                  </span>
                )}
                {layer.items.map((clip, clipIndex) => {
                  const totalMs = Math.max(1, timelineView.showEndMs)
                  const preview = resizePreview?.clipId === clip.id ? resizePreview : clip
                  const left = preview.startMs / totalMs * 100
                  const width = preview.durationMs / totalMs * 100
                  const previousClip = layer.items[clipIndex - 1]
                  const projectTimelineSummary = (
                    target: ShowTimelineItemView,
                  ): ShowClipSummarySection[] => {
                    const legacyTarget = unifiedCompositionTimeline?.zones
                      .flatMap((zone) => zone.layers.flatMap((candidate) => candidate.clips))
                      .find((candidate) => candidate.id === target.id)
                    if (!show || !legacyTarget) {
                      // The same original formatter over the authored record's
                      // resolved facts, so a Show stored either way captions its
                      // Clips identically - simulation, transform, viewport,
                      // Effects and the #666 animated ranges included (#1065).
                      const presented = clipSummarySourcesOverride?.[target.id]
                      if (!presented) return []
                      const presentedControls = patternControlsByInstanceId[presented.instanceId] ?? []
                      return projectResolvedShowClipSummary(
                        presented.facts,
                        Object.fromEntries(presentedControls.map((control) => [control.exportName, control.label])),
                        presented.animation,
                      )
                    }
                    const compatibilityCell = !show.composition
                      ? compatibilityCellForTimelineClip(show, legacyTarget)
                      : null
                    const patternControls = compatibilityCell
                      ? patternControlsByCellId[compatibilityCell.id] ?? []
                      : patternControlsByInstanceId[target.instanceId] ?? []
                    const controlLabels = Object.fromEntries(
                      patternControls.map((control) => [control.exportName, control.label]),
                    )
                    if (compatibilityCell) {
                      return projectGlobalShowClipSummary(show, compatibilityCell.id, controlLabels)
                    }
                    return timelineComposition
                      ? projectCompositionShowClipSummary(timelineComposition, legacyTarget, controlLabels)
                      : []
                  }
                  const summary = projectTimelineSummary(clip)
                  const connectedToPrevious = Boolean(previousClip && layer.junctions.some((junction) => (
                    junction.leftItemId === previousClip.id && junction.rightItemId === clip.id
                  )))
                  // A connected neighbour contracts repeated facts on both
                  // backings; only the record the facts were read from differs.
                  const previousSummary = (timelineComposition || clipSummarySourcesOverride)
                    && previousClip
                    && connectedToPrevious
                    ? projectTimelineSummary(previousClip)
                    : null
                  const group = clip.groupOccurrenceId
                    ? row.groups.find((candidate) => candidate.id === clip.groupOccurrenceId)
                    : null
                  const groupPlacementId = group && clip.id.startsWith(`${group.id}:`)
                    ? clip.id.slice(group.id.length + 1)
                    : null
                  const insideIsolatedGroup = Boolean(group && group.id === isolatedGroupOccurrenceId)
                  const outsideIsolation = Boolean(isolatedGroupOccurrenceId && !insideIsolatedGroup)
                  const selected = group
                    ? selection.kind === 'group' && selection.occurrenceId === group.id
                      || selection.kind === 'group-clip'
                        && selection.occurrenceId === group.id
                        && selection.placementId === groupPlacementId
                    : selection.kind === 'clip' && selection.clipId === clip.id
                      || selection.kind === 'multi' && selection.groupSelection.placementIds.includes(clip.id)
                  const clipSelectionKey = insideIsolatedGroup && groupPlacementId
                    ? `group-clip:${group!.id}:${groupPlacementId}`
                    : group ? `group:${group.id}` : `clip:${clip.id}`
                  const deleteBlocked = blockedDeleteFeedback?.selectionKey === clipSelectionKey
                  const beginClipDrag = (clipElement: HTMLElement, clientX: number, altKey: boolean) => {
                    const rect = clipElement.getBoundingClientRect()
                    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)))
                    const legacy = clip.legacy
                    const owner: ShowTimelineClipOwner | undefined = legacy?.kind === 'main'
                      ? {
                          kind: 'main',
                          sceneId: legacy.sceneId,
                          zoneId: clip.zoneId,
                          placementId: clip.id,
                        }
                      : legacy ? {
                          kind: 'overlay',
                          sceneId: legacy.sceneId,
                          zoneId: clip.zoneId,
                          layerId: legacy.overlayLayerId!,
                          placementId: clip.id,
                        } : undefined
                    const mode: 'move' | 'duplicate' = altKey ? 'duplicate' : 'move'
                    const dragState = {
                      clipId: clip.id,
                      owner,
                      grabOffsetMs: fraction * clip.durationMs,
                      mode,
                      duplicatePlacementId: altKey ? newPersonalContentId() : null,
                      duplicateInstanceId: altKey ? newPersonalContentId() : null,
                      ...(recordVersion === 2 ? { v2Move: captureV2Move?.() ?? undefined } : {}),
                    }
                    activeMoveLayerRef.current = null
                    draggingCompositionClipRef.current = dragState
                    refreshMoveActivity()
                    setDraggingCompositionClip(dragState)
                    onDirectManipulationChange(true)
                    return dragState
                  }
                  return (
                    <button
                      key={clip.id}
                      type="button"
                      aria-label={insideIsolatedGroup ? `Select Group Clip ${clip.patternName}` : group ? `Select Group ${group.name}` : `Select ${clip.patternName}`}
                      aria-pressed={selected}
                      aria-disabled={outsideIsolation || undefined}
                      data-show-timeline-focus
                      data-show-selection-key={clipSelectionKey}
                      data-agent-highlight={agentController?.showId !== showId ? undefined : agentDrawer.refusedTargets.includes(clip.id) ? 'refused' : agentDrawer.highlights.includes(clip.id) ? agentDrawer.highlightPhase : undefined}
                      data-show-composition-clip="true"
                      data-show-group-occurrence={group?.id}
                      draggable={!readOnly && !group}
                      onPointerEnter={() => useShowClipHoverStore.getState().setHoveredClip(clip.id)}
                      onPointerLeave={() => useShowClipHoverStore.getState().clearHoveredClip(clip.id)}
                      onPointerDown={(event) => {
                        agentController?.dispatch({ type: 'touch', targetId: clip.id })
                        if (!event.shiftKey || event.button !== 0 || readOnly || group || movePointerCleanupRef.current || draggingCompositionClipRef.current) return
                        event.stopPropagation()
                        const pointerId = event.pointerId
                        const clipElement = event.currentTarget
                        const startX = event.clientX
                        const startY = event.clientY
                        let fallbackStarted = false
                        const detach = () => {
                          window.removeEventListener('pointermove', move)
                          window.removeEventListener('pointerup', up)
                          window.removeEventListener('pointercancel', cancel)
                          clipElement.removeEventListener('lostpointercapture', cancel)
                        }
                        const finish = (pointer: PointerEvent, commit: boolean) => {
                          if (pointer.pointerId !== pointerId || movePointerCleanupRef.current !== detach) return
                          detach()
                          movePointerCleanupRef.current = null
                          if (!fallbackStarted) return
                          if (commit && activeMoveLayerRef.current) {
                            commitCompositionClipMove(activeMoveLayerRef.current.targetKey)
                          } else {
                            resetCompositionClipMove()
                          }
                        }
                        const move = (pointer: PointerEvent) => {
                          if (pointer.pointerId !== pointerId || movePointerCleanupRef.current !== detach) return
                          if (!fallbackStarted) {
                            if (Math.hypot(pointer.clientX - startX, pointer.clientY - startY) < 3) return
                            pointer.preventDefault()
                            fallbackStarted = true
                            beginClipDrag(clipElement, startX, pointer.altKey)
                            clipElement.setPointerCapture?.(pointerId)
                          }
                          const targetElement = document.elementFromPoint(pointer.clientX, pointer.clientY)
                            ?.closest<HTMLElement>('[data-show-layer-id][data-show-zone-id]')
                          const zone = timelineView.rows.find((candidate) => (
                            candidate.zoneId === targetElement?.dataset.showZoneId
                          ))
                          const targetLayer = zone?.layers.find((candidate) => (
                            candidate.id === targetElement?.dataset.showLayerId
                          ))
                          if (!targetElement || !zone || !targetLayer) return
                          const targetKey = `composition:${targetLayer.id}`
                          activeMoveLayerRef.current = {
                            element: targetElement,
                            layer: targetLayer,
                            zoneId: zone.zoneId,
                            targetKey,
                          }
                          updateCompositionClipMovePreview({
                            clientX: pointer.clientX,
                            altKey: pointer.altKey,
                            shiftKey: pointer.shiftKey,
                            element: targetElement,
                            layer: targetLayer,
                            zoneId: zone.zoneId,
                            targetKey,
                          })
                        }
                        const up = (pointer: PointerEvent) => finish(pointer, true)
                        const cancel = (pointer: PointerEvent) => finish(pointer, false)
                        movePointerCleanupRef.current = detach
                        clipElement.addEventListener('lostpointercapture', cancel)
                        window.addEventListener('pointermove', move)
                        window.addEventListener('pointerup', up)
                        window.addEventListener('pointercancel', cancel)
                      }}
                      onDragStart={(event) => {
                        if (readOnly || group || draggingCompositionClipRef.current) { event.preventDefault(); return }
                        event.stopPropagation()
                        const dragState = beginClipDrag(event.currentTarget, event.clientX, event.altKey)
                        event.dataTransfer.effectAllowed = dragState.mode === 'duplicate' ? 'copy' : 'move'
                        event.dataTransfer.setData('application/x-pxlblz-show-placement', clip.id)
                      }}
                      onDrag={(event) => {
                        const activeLayer = activeMoveLayerRef.current
                        if (!activeLayer || !draggingCompositionClipRef.current) return
                        if (event.clientX === 0 && event.clientY === 0) return
                        updateCompositionClipMovePreview({
                          clientX: event.clientX,
                          altKey: event.altKey,
                          shiftKey: event.shiftKey,
                          element: activeLayer.element,
                          layer: activeLayer.layer,
                          zoneId: activeLayer.zoneId,
                          targetKey: activeLayer.targetKey,
                          dataTransfer: event.dataTransfer,
                        })
                      }}
                      onDragEnd={resetCompositionClipMove}
                      onClick={(event) => {
                        if (suppressResizeClipClickRef.current === clip.id) {
                          suppressResizeClipClickRef.current = null
                          event.preventDefault()
                          event.stopPropagation()
                          return
                        }
                        event.stopPropagation()
                        if (group && groupPlacementId && event.detail >= 2 && !readOnly) {
                          onEnterGroupIsolation(group.id, groupPlacementId, event.currentTarget)
                          return
                        }
                        if (!group && event.shiftKey && timelineComposition) {
                          if (selection.kind === 'multi') {
                            const placementIds = new Set(selection.groupSelection.placementIds)
                            if (placementIds.has(clip.id)) placementIds.delete(clip.id)
                            else placementIds.add(clip.id)
                            onSelectGroupCandidates({
                              placementIds: [...placementIds].sort((leftId, rightId) => leftId.localeCompare(rightId)),
                              transitionIds: selection.groupSelection.transitionIds,
                            })
                            return
                          }
                          const seeds = selection.kind === 'clip'
                            ? [selection.clipId, clip.id]
                            : [clip.id]
                          onSelectGroupCandidates(completeShowGroupSelection(timelineComposition, seeds))
                          return
                        }
                        onSelect(group
                          ? insideIsolatedGroup && groupPlacementId
                            ? { kind: 'group-clip', occurrenceId: group.id, placementId: groupPlacementId }
                            : { kind: 'group', occurrenceId: group.id }
                          : { kind: 'clip', clipId: clip.id }, event.currentTarget)
                      }}
                      onDoubleClick={(event) => {
                        if (!group || !groupPlacementId || readOnly) return
                        event.stopPropagation()
                        onEnterGroupIsolation(group.id, groupPlacementId, event.currentTarget)
                      }}
                      className={[
                        clipBase,
                        'group absolute inset-y-1 min-h-0',
                        outsideIsolation
                          ? 'pointer-events-none opacity-25 saturate-50'
                          : draggingCompositionClip?.clipId === clip.id
                          ? 'opacity-45'
                          : selected
                          ? 'text-zinc-100'
                          : 'text-zinc-300 hover:text-zinc-100',
                      ].join(' ')}
                      style={{
                        '--zone-color': row.color ?? '#38bdf8',
                        left: `${left}%`,
                        width: `${width}%`,
                        minWidth: 2,
                        borderLeftColor: selected ? 'var(--color-live)' : row.color ?? '#38bdf8',
                        background: `color-mix(in srgb, ${row.color ?? '#38bdf8'} 9%, transparent)`,
                        boxShadow: 'none',
                      } as CSSProperties}
                    >
                      {deleteBlocked && (
                        <span
                          key={blockedDeleteFeedback.token}
                          aria-hidden
                          data-testid="show-clip-delete-blocked"
                          className="show-clip-delete-blocked pointer-events-none absolute -inset-[2px] z-30 flex items-center justify-center rounded-[7px]"
                        >
                          <span className="show-clip-delete-blocked-label rounded border border-red-300/70 bg-red-950/95 px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-[0.08em] text-red-100 shadow-sm">
                            {blockedDeleteFeedback.label}
                          </span>
                        </span>
                      )}
                      <span className="relative z-10 flex min-w-0 items-center gap-1.5">
                        <span className={`show-clip-pattern-name truncate text-[12px] font-normal [text-shadow:0_1px_2px_rgba(0,0,0,0.95)] ${selected ? 'text-live' : 'text-zinc-100'}`}>{clip.patternName}</span>
                      </span>
                      <ClipSummaryInline summary={summary} previousSummary={previousSummary} />
                      {!readOnly && !group && (
                        <>
                          {/* A junction draws a 16px band centred on the boundary, so
                              it covers 8px inside each neighbouring Clip. The grab
                              zone therefore starts past that band on a joined edge and
                              widens to stay easy to hit, leaving the Cut or Transition
                              cleanly clickable in its own territory. A free edge keeps
                              its zone at the very edge. Capped at a third of the Clip
                              so a short Clip keeps a draggable body. The zone draws nothing:
                              the resize cursor is the affordance, and a visible mark
                              read as a selection artifact (#363). */}
                          {(['start', 'end'] as const).map((edge) => {
                            const joined = edge === 'start'
                              ? layer.junctions.some((junction) => junction.rightItemId === clip.id)
                              : layer.junctions.some((junction) => junction.leftItemId === clip.id)
                            return (
                              <span
                                key={edge}
                                role="separator"
                                aria-orientation="vertical"
                                aria-label={`Resize ${clip.patternName} ${edge}`}
                                data-resize-joined={joined ? 'true' : undefined}
                                className={[
                                  'absolute inset-y-0 z-20 cursor-ew-resize',
                                  // Narrow-Clip pointer priority (#787): the Cut
                                  // band (z-15, 8px per side, #363) owns the seam,
                                  // then a >=6px selectable body, then resize.
                                  // The first cap term keeps handles out of the
                                  // middle third of ordinary Clips; the second
                                  // (50% - 11px) shrinks them so a 6px center
                                  // survives down to 22px Clips, below which
                                  // handles yield entirely and edges resize via
                                  // timeline zoom or the Clip properties panel.
                                  // Clips 42px and wider are unchanged by the
                                  // second term.
                                  joined
                                    ? 'w-3.5 max-w-[min(max(6px,calc(33%-8px)),max(0px,calc(50%-11px)))]'
                                    : 'w-2.5 max-w-[33%]',
                                  edge === 'start'
                                    ? (joined ? 'left-2' : 'left-0')
                                    : (joined ? 'right-2' : 'right-0'),
                                ].join(' ')}
                                onClick={(event) => event.stopPropagation()}
                                onPointerDown={(event) => beginCompositionResize(clip, edge, event)}
                              />
                            )
                          })}
                        </>
                      )}
                    </button>
                  )
                })}
                {layer.junctions.map((junction) => {
                  const leftClip = layer.items.find((clip) => clip.id === junction.leftItemId)
                  const rightClip = layer.items.find((clip) => clip.id === junction.rightItemId)
                  if (!leftClip || !rightClip) return null
                  const internalGroupId = leftClip.groupOccurrenceId
                    && leftClip.groupOccurrenceId === rightClip.groupOccurrenceId
                    ? leftClip.groupOccurrenceId
                    : null
                  const internalGroup = internalGroupId
                    ? row.groups.find((candidate) => candidate.id === internalGroupId)
                    : null
                  const internalGroupPlacementId = internalGroup
                    && leftClip.id.startsWith(`${internalGroup.id}:`)
                    ? leftClip.id.slice(internalGroup.id.length + 1)
                    : null
                  const insideIsolatedGroup = Boolean(internalGroup && internalGroup.id === isolatedGroupOccurrenceId)
                  const outsideIsolation = Boolean(isolatedGroupOccurrenceId && !insideIsolatedGroup)
                  const selectInternalGroup = (anchor: HTMLElement) => {
                    if (!internalGroup) return false
                    if (insideIsolatedGroup) return false
                    onSelect(insideIsolatedGroup && internalGroupPlacementId
                      ? { kind: 'group-clip', occurrenceId: internalGroup.id, placementId: internalGroupPlacementId }
                      : { kind: 'group', occurrenceId: internalGroup.id }, anchor)
                    return true
                  }
                  // A whole-output boundary Transition is selected; only a Layer
                  // junction opens the Layer Transition editor. v1 resolves both
                  // through its own junction record, exactly as before.
                  const legacyJunction = unifiedCompositionTimeline?.zones
                    .flatMap((zone) => zone.layers.flatMap((candidate) => candidate.junctions))
                    .find((candidate) => candidate.id === junction.id) ?? null
                  const boundaryTransitionId = legacyJunction
                    ? legacyJunction.boundaryTransition?.id ?? null
                    : junction.transitionId && boundaryTransitionIdsOverride?.has(junction.transitionId)
                      ? junction.transitionId
                      : junction.legacy?.boundaryTransitionId ?? null
                  const openJunctionEditor = (anchor: HTMLElement) => {
                    onDismiss()
                    if (boundaryTransitionId) {
                      onSelect({ kind: 'transition', transitionId: boundaryTransitionId }, anchor)
                      return
                    }
                    if (legacyJunction) {
                      onOpenLayerTransition({
                        settings: legacyJunction.transition,
                        legacy: legacyJunction,
                        fromName: leftClip.patternName,
                        toName: rightClip.patternName,
                        anchor,
                        ...(internalGroup ? { groupOccurrenceId: internalGroup.id } : {}),
                      })
                      return
                    }
                    // The authored-v2 backing draws the same popover from the
                    // Transition the junction names. A derived Cut mints no
                    // identity here: inserting one is #1066's Transition
                    // authoring work, not this tracer's read matrix.
                    if (junction.transitionId && junction.scope === 'layer') {
                      onOpenLayerTransition({
                        settings: { kind: junction.kind, durationMs: junction.durationMs },
                        fromName: leftClip.patternName,
                        toName: rightClip.patternName,
                        anchor,
                        // A Group-local Transition is named by its occurrence
                        // and its definition child, which the presented
                        // junction already carries; nothing new is minted.
                        ...(internalGroup ? { groupOccurrenceId: internalGroup.id } : {}),
                        ...(internalGroup && junction.transitionId ? { groupTransitionId: junction.transitionId.startsWith(`${internalGroup.id}:`) ? junction.transitionId.slice(internalGroup.id.length + 1) : junction.transitionId } : {}),
                        ...(!internalGroup && junction.transitionId ? { transitionId: junction.transitionId } : {}),
                      })
                    }
                    // An ordinary Cut on the authored-v2 backing opens the Layer
                    // Transition palette for insertion (#1066 G4b-2b). A derived
                    // Cut mints no persisted identity, so the key addresses it
                    // by boundary time and Clip identities: atMs from the
                    // junction start, zone and Layer from the row and lane, and
                    // both endpoints from the junction's item ids. Group-local
                    // Cuts stay closed here; their insert is a later slice.
                    if (recordVersion === 2 && junction.scope === 'derived-cut' && junction.transitionId === null && !insideIsolatedGroup) {
                      onOpenLayerTransition({
                        settings: null,
                        fromName: leftClip.patternName,
                        toName: rightClip.patternName,
                        anchor,
                        v2Cut: {
                          junctionKey: showV2TransitionJunctionKey({
                            atMs: junction.startMs,
                            zoneId: row.zoneId,
                            layerId: layer.id,
                            fromClipId: junction.leftItemId,
                            toClipId: junction.rightItemId,
                          }),
                        },
                      })
                    }
                    // A Cut between two Clips of one Group occurrence in
                    // isolation opens the Layer Transition palette for a
                    // definition-local insert (#1075 G4b-2c). The presented
                    // Clip ids carry the occurrence prefix, which strips
                    // exactly as the internal-Group code above does.
                    if (recordVersion === 2 && junction.scope === 'derived-cut' && junction.transitionId === null && insideIsolatedGroup && internalGroup) {
                      const occurrencePrefix = `${internalGroup.id}:`
                      if (junction.leftItemId.startsWith(occurrencePrefix) && junction.rightItemId.startsWith(occurrencePrefix)) {
                        onOpenLayerTransition({
                          settings: null,
                          fromName: leftClip.patternName,
                          toName: rightClip.patternName,
                          anchor,
                          v2GroupCut: {
                            occurrenceId: internalGroup.id,
                            fromClipId: junction.leftItemId.slice(occurrencePrefix.length),
                            toClipId: junction.rightItemId.slice(occurrencePrefix.length),
                          },
                        })
                      }
                    }
                  }
                  const legacyLeftClip = legacyJunction
                    ? unifiedCompositionTimeline?.zones
                        .flatMap((zone) => zone.layers.flatMap((candidate) => candidate.clips))
                        .find((candidate) => candidate.id === legacyJunction.leftClipId) ?? null
                    : null
                  const transitionPictogram = legacyJunction
                    ? legacyJunction.boundaryTransition
                      ?? (legacyJunction.transition && legacyLeftClip
                        ? { ...legacyJunction.transition, afterSceneId: legacyLeftClip.sceneId }
                        : null)
                    : junction.transitionId
                      ? transitionSettingsOverride?.[junction.transitionId] ?? null
                      : null
                  const totalMs = Math.max(1, timelineView.showEndMs)
                  // A Transition belongs to its pair of Clips, so during a
                  // move drag it follows the dragged Clip's previewed position
                  // instead of waiting for the drop (#63). Duplicate drags
                  // leave the original pair in place.
                  const dragPreview = movePreview && movePreview.mode === 'move'
                    && movePreview.targetKey === `composition:${layer.id}`
                    ? movePreview
                    : null
                  const junctionStartMs = dragPreview && junction.rightItemId === dragPreview.clipId
                    ? dragPreview.startMs - junction.durationMs
                    : dragPreview && junction.leftItemId === dragPreview.clipId
                      ? dragPreview.startMs + dragPreview.durationMs
                      : junction.startMs
                  if (junction.kind !== 'cut') {
                    const width = Math.max(junction.durationMs / totalMs * 100, 0.35)
                    return (
                      <button
                        key={junction.id}
                        type="button"
                        aria-label={`Edit ${junction.kind} Transition between ${leftClip.patternName} and ${rightClip.patternName}`}
                        title={`${junction.kind} - ${junction.durationMs / 1_000}s`}
                        data-show-timeline-focus
                        data-show-selection-key={boundaryTransitionId
                          ? `transition:${boundaryTransitionId}`
                          : undefined}
                        data-show-layer-junction={junction.id}
                        data-show-group-occurrence={internalGroup?.id}
                        aria-disabled={outsideIsolation || undefined}
                        className={`absolute inset-y-0 z-[15] min-w-4 overflow-hidden bg-transparent outline-none transition-[filter,box-shadow] hover:brightness-125 hover:shadow-[inset_0_0_0_1px_rgba(252,211,77,0.65)] focus-visible:brightness-125 focus-visible:shadow-[inset_0_0_0_1px_rgba(252,211,77,0.85)] ${outsideIsolation ? 'pointer-events-none opacity-25' : ''}`}
                        style={{
                          left: `${junctionStartMs / totalMs * 100}%`,
                          width: `${width}%`,
                        }}
                        onClick={(event) => {
                          event.stopPropagation()
                          if (selectInternalGroup(event.currentTarget)) return
                          openJunctionEditor(event.currentTarget)
                        }}
                      >
                        {transitionPictogram && <ShowTransitionXrayPictogram transition={transitionPictogram} />}
                      </button>
                    )
                  }
                  return (
                    <button
                      key={junction.id}
                      type="button"
                      aria-label={`Edit Cut between ${leftClip.patternName} and ${rightClip.patternName}`}
                      title="Cut - click to choose a Transition"
                      data-show-timeline-focus
                      data-show-selection-key={boundaryTransitionId
                        ? `transition:${boundaryTransitionId}`
                        : undefined}
                      data-show-layer-junction={junction.id}
                      data-show-group-occurrence={internalGroup?.id}
                      aria-disabled={outsideIsolation || undefined}
                      className={`group/cut absolute inset-y-0 z-[15] w-4 -translate-x-1/2 bg-transparent outline-none ${outsideIsolation ? 'pointer-events-none opacity-25' : ''}`}
                      style={{ left: `${junctionStartMs / totalMs * 100}%` }}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (selectInternalGroup(event.currentTarget)) return
                        openJunctionEditor(event.currentTarget)
                      }}
                    >
                      <span aria-hidden className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-zinc-500/80 transition-colors group-hover/cut:bg-amber-300 group-focus-visible/cut:bg-amber-300" />
                      <span aria-hidden className="absolute left-1/2 top-1 size-2 -translate-x-1/2 rotate-45 rounded-[1px] border border-zinc-500 bg-[#0b0b0d] opacity-0 transition-[border-color,opacity] group-hover/cut:border-amber-300 group-hover/cut:opacity-100 group-focus-visible/cut:border-amber-300 group-focus-visible/cut:opacity-100" />
                    </button>
                  )
                })}
              </div>
            )))}
            {!collapsed && (propertyLanesByZone.get(row.zoneId) ?? []).map((lane, laneIndex) => {
              const laneRow = rowStart(rowIndex) + contentStartRow + routingLaneRows + laneIndex + clipLayerCount
              const selectedBeat = selection.kind === 'transition'
                ? lane.projection.beats.find((beat) => beat.ownerId === selection.transitionId)?.id ?? null
                : null
              return (
                <div key={`${row.zoneId}:${lane.key}`} className="contents">
                  {(zonesOpen || showMicroZonePicker) && <div
                    data-testid="show-property-lane-label"
                    data-compact={showMicroZonePicker ? 'true' : 'false'}
                    title={showMicroZonePicker ? lane.label : undefined}
                    className={`sticky left-0 z-30 flex min-w-0 items-center border-t border-zinc-900/80 bg-[#060608] font-mono text-[8.5px] ${showMicroZonePicker ? 'justify-center px-0' : 'px-2'}`}
                    style={{ gridColumn: 1, gridRow: laneRow, color: lane.color }}
                  >
                    {showMicroZonePicker ? (
                      <>
                        <span data-testid="show-property-lane-compact-mark" className="shrink-0">
                          <ShowPropertyLaneFamilyGlyph family={lane.family} glyph={lane.glyph} size={10} />
                        </span>
                        <span className="sr-only">{lane.label}</span>
                      </>
                    ) : (
                      <>
                        <ShowPropertyLaneFamilyGlyph family={lane.family} glyph={lane.glyph} size={9} className="mr-1 shrink-0" />
                        <span className="truncate">{lane.displayLabel}</span>
                      </>
                    )}
                  </div>}
                  <div
                    className="min-w-0"
                    style={{ gridColumn: `2 / ${timeGridEndLine}`, gridRow: laneRow }}
                  >
                    <ShowPropertySparkline
                      ariaLabel={lane.ariaLabel}
                      label={zonesOpen ? undefined : lane.displayLabel}
                      family={lane.family}
                      glyph={lane.glyph}
                      hoverText={lane.hoverText}
                      showId={showId}
                      stickyLeftPx={zonesOpen ? ZONE_RAIL_OPEN_PX : hasMultipleZones ? ZONE_RAIL_MICRO_PX : 0}
                      showFamilyGlyph={!zonesOpen && !showMicroZonePicker}
                      projection={lane.projection}
                      color={lane.color}
                      selectedBeatId={selectedBeat}
                      formatValue={lane.formatValue}
                      getBeatSelectionKey={lane.selectsTransition
                        ? (beat) => beat.ownerId ? `transition:${beat.ownerId}` : undefined
                        : undefined}
                      onSelectBeat={lane.selectsTransition
                        ? (beat, anchor) => {
                            if (!beat.ownerId) return
                            onSelect({ kind: 'transition', transitionId: beat.ownerId }, anchor)
                          }
                        : undefined}
                      className="size-full border-t border-zinc-900/80 bg-[#080a0d]"
                    />
                  </div>
                </div>
              )
            })}
          </div>
          )
        })}
        </div>
      </div>
      </div>
      {/* Outside the grid subtree: the grid owns marquee and group-isolation
          pointer handlers, and React bubbles portalled popover events through
          their JSX ancestors (#629). */}
      <ShowLossConfirmDialog
        open={pendingV2ClipMove !== null}
        {...(pendingV2ClipMove
          ? describeConnectedClipMoveLoss(pendingV2ClipMove.transitionCount)
          : { title: '', description: '', actionLabel: '' })}
        onCancel={() => setPendingV2ClipMove(null)}
        onConfirm={confirmV2ClipMove}
      />
      {zoneMap && zoneMapOpen && (showFullZoneHeaders || showMicroZonePicker) && (
        <ZoneMapPopover
          anchor={zoneMapAnchor}
          zoneMap={zoneMap}
          readOnly={readOnly}
          onAddZone={onAddZone}
          onDismiss={() => setZoneMapOpen(false)}
          onUpdateZone={onUpdateZone}
          onRemoveZone={onRemoveZone}
        />
      )}
    </div>
  )
}


function ZoneGlyph({ icon, size = 12 }: { icon?: string; size?: number }) {
  if (icon === 'map') return <MapIcon size={size} aria-hidden />
  if (icon === 'layers') return <Layers3 size={size} aria-hidden />
  if (icon === 'route') return <Route size={size} aria-hidden />
  if (icon === 'pulse') return <Activity size={size} aria-hidden />
  if (icon === 'bolt') return <Zap size={size} aria-hidden />
  return <Grid2X2 size={size} aria-hidden />
}

function ZoneColorSwatch({
  zoneName,
  color,
  readOnly,
  onPickColor,
}: {
  zoneName: string
  color: string
  readOnly: boolean
  onPickColor: (color: string) => void
}) {
  const [open, setOpen] = useState(false)
  if (readOnly) {
    return (
      <span className="grid size-6 shrink-0 place-items-center rounded border border-current/30 bg-black/30" style={{ color }}>
        <Grid2X2 size={12} aria-hidden />
      </span>
    )
  }
  return (
    <span className="relative shrink-0">
      <button
        type="button"
        aria-label={`Zone color ${zoneName}`}
        aria-expanded={open}
        title={`Color for ${zoneName}`}
        className="grid size-6 place-items-center rounded border border-current/30 bg-black/30 hover:border-current/70"
        style={{ color }}
        onClick={() => setOpen((current) => !current)}
      >
        <Grid2X2 size={12} aria-hidden />
      </button>
      {open && (
        <span className="absolute left-0 top-full z-50 mt-1 flex gap-1 rounded border border-zinc-700 bg-zinc-950 p-1 shadow-xl">
          {ZONE_COLORS.map((option) => (
            <button
              key={option}
              type="button"
              aria-label={`${zoneName} color ${option}`}
              title={option}
              aria-pressed={color.toLowerCase() === option.toLowerCase()}
              className={`size-5 rounded border ${color.toLowerCase() === option.toLowerCase()
                ? 'border-white/90'
                : 'border-white/15 hover:border-white/60'}`}
              style={{ backgroundColor: option }}
              onClick={() => {
                onPickColor(option)
                setOpen(false)
              }}
            />
          ))}
        </span>
      )}
    </span>
  )
}

function ZoneMapPopover({
  anchor,
  zoneMap,
  readOnly,
  onAddZone,
  onDismiss,
  onUpdateZone,
  onRemoveZone,
}: {
  anchor: HTMLElement | null
  zoneMap: ShowEditorZoneMapV2
  readOnly: boolean
  onAddZone: () => void
  onDismiss: () => void
  onUpdateZone: (zoneId: string, changes: Partial<ShowRecord['zones'][number]>) => void
  onRemoveZone: (zoneId: string) => void
}) {
  // Deleting a Zone deletes its Clips with it; a single stray click must
  // not be enough. The trash arms a red confirm that disarms on its own.
  const [pendingDeleteZoneId, setPendingDeleteZoneId] = useState<string | null>(null)
  useEffect(() => {
    if (!pendingDeleteZoneId) return
    const timeout = window.setTimeout(() => setPendingDeleteZoneId(null), 2_600)
    return () => window.clearTimeout(timeout)
  }, [pendingDeleteZoneId])
  return (
    <ShowTimelineToolbarPopover
      anchor={anchor}
      widthPx={310}
      align="start"
      ariaLabel="Zone Map"
      className="w-[min(310px,calc(100vw-24px))] rounded border border-zinc-700 bg-[#0a0a0d]/[0.985] p-1.5 shadow-2xl backdrop-blur"
      onDismiss={onDismiss}
      // Selections made inside the map must not reach the editor's document
      // click handling, which would close the Entity Detail panel they open.
      // Dismissal listens on pointerdown, so it still sees outside presses.
      onClick={(event) => event.stopPropagation()}
    >
      <header className="flex h-8 items-center gap-2 border-b border-zinc-800 px-1.5">
        <MapIcon size={13} aria-hidden className="text-live" />
        <strong className="text-[13px] font-medium text-zinc-100">Zone Map</strong>
      </header>
      <h3 className="mt-1 px-1.5 text-[9px] uppercase tracking-[0.12em] text-zinc-500">
        Zones
        <span className="ml-1 normal-case tracking-normal text-zinc-600">the whole output, divided</span>
      </h3>
      <div className="py-1">
        {zoneMap.entries.map(({ zone, pixelCount }) => {
          return (
            <div
              key={zone.id}
              className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-1 border-b border-zinc-900/80 px-1 py-1 last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-2 px-0.5 py-1">
                <ZoneColorSwatch
                  zoneName={zone.name}
                  color={zone.color ?? '#38bdf8'}
                  readOnly={readOnly}
                  onPickColor={(color) => onUpdateZone(zone.id, { color })}
                />
                <span className="min-w-0 flex-1 text-[11px] font-medium">
                  {/* Rename in place; the Zone rail still opens full properties
                      (pixel share, Installation ranges) when needed (#63). */}
                  <InlineEntityTitle
                    name={zone.name}
                    noun="zone"
                    onRename={readOnly ? undefined : (name) => onUpdateZone(zone.id, { name })}
                    takenNames={zoneMap.entries.filter((candidate) => candidate.zone.id !== zone.id).map((candidate) => candidate.zone.name)}
                  />
                  {zoneMap.installation && (
                    <span className="block truncate text-[9px] font-normal text-zinc-500">{pixelCount} px</span>
                  )}
                </span>
              </div>
              {zoneMap.entries.length > 1 && (
                <div className="flex items-center gap-0.5">
                  {!readOnly && (
                    pendingDeleteZoneId === zone.id ? (
                      <button
                        type="button"
                        aria-label={`Confirm delete zone ${zone.name}`}
                        title={`Delete ${zone.name} and its Clips`}
                        className="flex h-7 items-center gap-1 rounded border border-red-400/50 bg-red-500/15 px-1.5 text-[9px] font-semibold uppercase tracking-wide text-red-200 hover:bg-red-500/25"
                        onClick={() => {
                          setPendingDeleteZoneId(null)
                          onRemoveZone(zone.id)
                        }}
                      >
                        <Trash2 size={11} aria-hidden /> Delete?
                      </button>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Delete zone ${zone.name}`}
                        title={`Delete ${zone.name}...`}
                        className="grid size-7 place-items-center rounded text-zinc-600 hover:bg-zinc-800 hover:text-red-300"
                        onClick={() => setPendingDeleteZoneId(zone.id)}
                      >
                        <Trash2 size={12} aria-hidden />
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {!readOnly && (
        <button
          type="button"
          aria-label="Add Zone"
          className="flex h-8 w-full items-center justify-center gap-1 rounded border border-dashed border-zinc-800 text-[11px] text-zinc-400 hover:border-zinc-600 hover:text-zinc-100"
          onClick={onAddZone}
        >
          <Plus size={12} aria-hidden />
          Add Zone
        </button>
      )}
    </ShowTimelineToolbarPopover>
  )
}

/**
 * Names a collapsed Zone once per owned span, and follows a scrolled timeline.
 *
 * This renders as its own grid cell rather than inside the collapsed lane: the
 * lane clips its content, and an `overflow: hidden` box becomes the scrollport
 * that `position: sticky` resolves against, so a stamp nested in the lane would
 * never move. Only a closed rail asks for it - an open rail's header already
 * carries the name (#632).
 */
function CollapsedZoneNameOverlay({
  intervals,
  zoneId,
  zoneName,
  durationMs,
  stickyLeftPx,
  gridColumn,
  gridRow,
}: {
  intervals: ShowTimelineLayoutIntervalView[]
  zoneId: string
  zoneName: string
  durationMs: number
  stickyLeftPx: number
  gridColumn: string
  gridRow: number
}) {
  const totalMs = Math.max(1, durationMs)
  return (
    <div
      aria-hidden
      className="pointer-events-none relative z-[21] min-w-0"
      style={{ gridColumn, gridRow }}
    >
      {intervals.filter((interval) => interval.zoneIds.includes(zoneId)).map((interval) => (
        <span
          key={interval.id}
          className="absolute inset-y-0 flex items-start"
          style={{
            left: `${interval.startMs / totalMs * 100}%`,
            width: `${interval.durationMs / totalMs * 100}%`,
          }}
        >
          <span
            data-testid="collapsed-zone-layout-label"
            className="sticky mt-0.5 max-w-[calc(100%-8px)] truncate rounded-sm bg-black/75 px-1.5 text-[10px] font-medium leading-4 text-zinc-100 shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
            style={{ left: stickyLeftPx + 4 }}
          >
            {zoneName}
          </span>
        </span>
      ))}
    </div>
  )
}

/** Masks the spans where a Zone is unowned by the Layout in force. */
function LayoutZoneIntervalOverlay({
  intervals,
  zoneId,
  durationMs,
}: {
  intervals: ShowTimelineLayoutIntervalView[]
  zoneId: string
  durationMs: number
}) {
  const totalMs = Math.max(1, durationMs)
  return <>
    {intervals.map((interval) => {
      const left = interval.startMs / totalMs * 100
      const width = interval.durationMs / totalMs * 100
      const active = interval.zoneIds.includes(zoneId)
      if (!active) {
        return <i
          key={interval.id}
          aria-hidden
          data-inactive-layout-zone={`${interval.id}:${zoneId}`}
          className="pointer-events-none absolute inset-y-0 z-20 border-x border-zinc-900/90 bg-[#050507]/95"
          style={{ left: `${left}%`, width: `${width}%` }}
        />
      }
      return null
    })}
  </>
}

function TimelineLayoutBoundaries({
  show,
  intervals,
  durationMs,
  gridColumn,
  gridRow,
  rowSpan,
  selection,
}: {
  show: ShowRecord | null
  intervals: ShowTimelineLayoutIntervalView[]
  durationMs: number
  gridColumn: string
  gridRow: number
  rowSpan: number
  selection: ShowSelection
}) {
  if (intervals.length <= 1) return null
  return (
    <div
      aria-label="Zone Layout routing intervals"
      className="pointer-events-none relative z-[25]"
      style={{ gridColumn, gridRow: `${gridRow} / span ${rowSpan}` }}
    >
      {intervals.slice(1).map((interval, index) => {
        const precedingInterval = intervals[index]
        const precedingSceneIds = precedingInterval.legacy?.sceneIds
        const precedingSceneId = precedingSceneIds?.[precedingSceneIds.length - 1]
        // Every interval boundary is a routing event on both backings: v1 only
        // starts an interval where a routing Transition sits, and an authored-v2
        // Layout occurrence boundary is that same event. A transfer identity
        // exists only for a ramped switch, so it decides the rule's selected
        // state, not whether the rule is drawn at all (#1065).
        const transitionId = show && precedingSceneId
          ? showRoutingTransitionAfter(show, precedingSceneId)?.id ?? null
          : interval.incomingTransfer?.id ?? null
        if (show && !transitionId) return null
        const left = interval.startMs / Math.max(1, durationMs) * 100
        const selected = transitionId !== null
          && selection.kind === 'transition' && selection.transitionId === transitionId
        return <Fragment key={interval.id}>
          <span
            aria-hidden
            data-show-layout-boundary={interval.id}
            className={selected
              ? 'pointer-events-none absolute inset-y-0 z-0 w-[2px] -translate-x-1/2 bg-live/80'
              : 'pointer-events-none absolute inset-y-0 z-0 w-[2px] -translate-x-1/2 bg-zinc-700/70'}
            style={{ left: `${left}%` }}
          />
        </Fragment>
      })}
    </div>
  )
}

function TimelineMarkerSource({
  showId,
  durationMs,
  viewport,
  snapEnabled,
  structuralTimesMs,
  getVisibleWidth,
  getRulerBounds,
  onCreateMarker,
  onMarkerFeedback,
}: {
  showId: string
  durationMs: number
  viewport: ShowTimelineViewport
  snapEnabled: boolean
  structuralTimesMs: number[]
  getVisibleWidth: () => number
  getRulerBounds: () => DOMRect | null
  onCreateMarker: (timeMs: number) => Promise<boolean>
  onMarkerFeedback: (feedback: TimelineMarkerFeedback | null) => void
}) {
  const positionMs = useShowTransportStore((state) => state.showId === showId ? state.positionMs : 0)
  const markerDragRef = useRef<{ pointerId: number; startX: number; phase?: 'click' | 'saving' } | null>(null)
  const refreshMarkerActivity = useFieldActivity(() => markerDragRef.current !== null)
  useLayoutEffect(() => () => { markerDragRef.current = null }, [])
  const cancelMarkerCreation = (event: ReactPointerEvent<HTMLElement>) => {
    if (markerDragRef.current?.pointerId !== event.pointerId || markerDragRef.current.phase === 'saving') return
    markerDragRef.current = null
    onMarkerFeedback(null)
    refreshMarkerActivity()
  }
  const suppressMarkerClickRef = useRef(false)
  const confirmationTimerRef = useRef<number | null>(null)
  useEffect(() => () => {
    if (confirmationTimerRef.current !== null) window.clearTimeout(confirmationTimerRef.current)
  }, [])
  const clearConfirmation = () => {
    if (confirmationTimerRef.current !== null) {
      window.clearTimeout(confirmationTimerRef.current)
      confirmationTimerRef.current = null
    }
  }
  // A dragged-out Marker lands on the drop grid — whole seconds, tenths with
  // Shift — so it no longer needs a post-hoc edit to sit on a clean time
  // (#667). Alt drops it on raw milliseconds.
  const resolveDragTime = (
    clientX: number,
    modifiers: { altKey: boolean; shiftKey: boolean },
  ): number | null => {
    const rect = getRulerBounds()
    if (!rect || clientX < rect.left || clientX > rect.right) return null
    const rawTimeMs = (clientX - rect.left) / Math.max(1, rect.width) * durationMs
    if (modifiers.altKey) return Math.round(Math.max(0, Math.min(durationMs, rawTimeMs)))
    const visibleWidthPx = getVisibleWidth()
    return Math.round(snapShowTimelineTime(rawTimeMs, {
      visibleDurationMs: viewport.durationMs,
      visibleWidthPx,
      structuralTimesMs: snapEnabled ? structuralTimesMs : [],
      quantizeStepMs: showTimelineQuantizeStepMs(modifiers.shiftKey, viewport.durationMs, visibleWidthPx),
      maxTimeMs: durationMs,
    }).timeMs)
  }
  return (
    <div
      data-show-marker-source-gutter
      className="pointer-events-none flex h-6 w-5 shrink-0 items-center justify-center"
    >
      <button
        type="button"
        aria-label="Add Marker at playhead"
        title="Click to add at the playhead, or drag onto the ruler · lands on the time grid, Shift for tenths, Alt for free placement"
        className="pointer-events-auto flex h-6 w-5 cursor-ew-resize items-center justify-center rounded-sm text-zinc-500 hover:bg-amber-300/10 hover:text-amber-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-amber-300"
        onPointerDown={(event) => {
          event.stopPropagation()
          clearConfirmation()
          onMarkerFeedback(null)
          if (markerDragRef.current) return
          markerDragRef.current = { pointerId: event.pointerId, startX: event.clientX }
          refreshMarkerActivity()
          event.currentTarget.setPointerCapture?.(event.pointerId)
        }}
        onPointerMove={(event) => {
          const drag = markerDragRef.current
          if (!drag || drag.phase || drag.pointerId !== event.pointerId || Math.abs(event.clientX - drag.startX) < 3) return
          const timeMs = resolveDragTime(event.clientX, event)
          onMarkerFeedback(timeMs === null ? null : { kind: 'drag', timeMs })
        }}
        onPointerUp={(event) => {
          const drag = markerDragRef.current
          if (!drag || drag.pointerId !== event.pointerId || drag.phase) return
          // The ensuing click owns playhead creation. Keep the pointer's
          // activity across implicit capture loss until that handler authors.
          if (Math.abs(event.clientX - drag.startX) < 3) {
            if (event.button === 0) drag.phase = 'click'
            else cancelMarkerCreation(event) // Auxiliary buttons emit auxclick, not click.
            return
          }
          suppressMarkerClickRef.current = true
          const timeMs = resolveDragTime(event.clientX, event)
          if (timeMs === null) { cancelMarkerCreation(event); return }
          drag.phase = 'saving'
          onMarkerFeedback(null)
          event.currentTarget.releasePointerCapture?.(event.pointerId)
          void onCreateMarker(timeMs).catch(() => {}).finally(() => {
            if (markerDragRef.current !== drag) return
            markerDragRef.current = null
            refreshMarkerActivity()
          })
        }}
        onPointerCancel={cancelMarkerCreation}
        onLostPointerCapture={(event) => { if (markerDragRef.current?.phase !== 'click') cancelMarkerCreation(event) }}
        onClick={(event) => {
          if (suppressMarkerClickRef.current) {
            suppressMarkerClickRef.current = false
            return
          }
          const source = event.currentTarget
          const drag = markerDragRef.current
          if (drag) drag.phase = 'saving'
          void onCreateMarker(positionMs).then((created) => {
            if (!created || !source.isConnected) return
            clearConfirmation()
            onMarkerFeedback({ kind: 'confirmation', timeMs: positionMs })
            confirmationTimerRef.current = window.setTimeout(() => {
              confirmationTimerRef.current = null
              onMarkerFeedback(null)
            }, 1_100)
          }).catch(() => {}).finally(() => {
            if (!drag || markerDragRef.current !== drag) return
            markerDragRef.current = null
            refreshMarkerActivity()
          })
        }}
      >
        <Flag size={11} aria-hidden />
      </button>
    </div>
  )
}

function TimelineRuler({
  rulerRef,
  showId,
  durationMs,
  gridColumn,
  gridRow,
  viewport,
  snapEnabled,
  structuralTimesMs,
  getVisibleWidth,
}: {
  rulerRef: { current: HTMLDivElement | null }
  showId: string
  durationMs: number
  gridColumn: string
  gridRow: number
  viewport: ShowTimelineViewport
  snapEnabled: boolean
  structuralTimesMs: number[]
  getVisibleWidth: () => number
}) {
  const positionMs = useShowTransportStore((state) => state.showId === showId ? state.positionMs : 0)
  const pendingSeekRef = useRef<{ showId: string; targetMs: number } | null>(null)
  const resumeAfterSeekRef = useRef(false)
  const keyboardHoldRef = useRef<{ key: 'ArrowLeft' | 'ArrowRight'; startedAt: number } | null>(null)
  const pointerScrubRef = useRef({ active: false, inverted: false })
  // Shift-fine scrubbing (#667): while Shift is held the captured pointer
  // drives the playhead at a tenth of the gain through an incremental
  // session. Once Shift has engaged, the whole remaining gesture stays
  // incremental — coarse deltas at full gain — because handing back to the
  // native absolute range mapping would jump the playhead to the pointer's
  // coarse position (#667 review).
  const scrubDragRef = useRef<FineAdjustDrag | null>(null)
  const scrubWidthPxRef = useRef(1)
  const scrubFineEngagedRef = useRef(false)
  const previewScrub = (targetMs: number, snap = false) => {
    const resolvedTimeMs = snap
      ? snapShowTimelineTime(targetMs, {
          visibleDurationMs: viewport.durationMs,
          visibleWidthPx: getVisibleWidth(),
          structuralTimesMs,
          maxTimeMs: durationMs,
        }).timeMs
      : targetMs
    const preview = usePreviewStore.getState()
    if (!pendingSeekRef.current) resumeAfterSeekRef.current = preview.isRunning
    if (preview.isRunning) preview.toggle()
    useShowTransportStore.getState().setPosition(showId, resolvedTimeMs)
    pendingSeekRef.current = { showId, targetMs: resolvedTimeMs }
  }
  const commitScrub = () => {
    const pending = pendingSeekRef.current
    if (!pending || pending.showId !== showId) {
      pendingSeekRef.current = null
      resumeAfterSeekRef.current = false
      return
    }
    const shouldResume = resumeAfterSeekRef.current
    pendingSeekRef.current = null
    resumeAfterSeekRef.current = false
    useShowTransportStore.getState().requestSeek(showId, pending.targetMs)
    if (shouldResume && !usePreviewStore.getState().isRunning) usePreviewStore.getState().toggle()
  }
  const getVisibleWidthRef = useRef(getVisibleWidth)
  useEffect(() => {
    getVisibleWidthRef.current = getVisibleWidth
  })
  const [visibleWidthPx, setVisibleWidthPx] = useState(() => getVisibleWidth())
  useEffect(() => {
    const ruler = rulerRef.current
    if (!ruler) return
    const update = () => setVisibleWidthPx(getVisibleWidthRef.current())
    update()
    if (typeof ResizeObserver === 'undefined') return
    // The ruler cell resizes whenever the scroll viewport does (its width is a
    // function of the viewport width and zoom scale), so observing it keeps
    // the tick grid in step with the width snapping reads at event time.
    const observer = new ResizeObserver(update)
    observer.observe(ruler)
    return () => observer.disconnect()
  }, [rulerRef])
  const { ticks } = showTimelineRulerTicks({
    rulerDurationMs: durationMs,
    viewport,
    visibleWidthPx,
  })
  return (
    <div
      ref={rulerRef}
      data-testid="show-timeline-ruler"
      className="group/timeline-ruler relative overflow-hidden border-b border-zinc-800 bg-zinc-950/70 ring-1 ring-inset ring-transparent transition-colors hover:bg-zinc-900/70 hover:ring-zinc-700/70 focus-within:bg-zinc-900/70 focus-within:ring-live/25"
      style={{ gridColumn, gridRow }}
    >
      {ticks.map((tick) => (
        <span
          key={tick.timeMs}
          aria-hidden
          data-show-ruler-tick={tick.kind}
          className="pointer-events-none absolute inset-y-0 w-px"
          style={{
            left: `${tick.fraction * 100}%`,
            transform: tick.fraction === 1 ? 'translateX(-100%)' : undefined,
            backgroundColor: tick.kind === 'major' ? 'rgba(113,113,122,.35)' : 'rgba(113,113,122,.18)',
          }}
        />
      ))}
      {ticks.filter((tick) => tick.kind === 'major').map((tick) => (
        <span
          key={tick.timeMs}
          aria-hidden
          className="pointer-events-none absolute top-1 text-[8.5px] tabular-nums text-zinc-600 transition-colors group-hover/timeline-ruler:text-zinc-400"
          style={{ left: `${tick.fraction * 100}%`, transform: `translateX(${tick.fraction === 0 ? 0 : tick.fraction === 1 ? -100 : -50}%)` }}
        >
          {tick.label}
        </span>
      ))}
      <input
        type="range"
        aria-label="Show playhead"
        min={0}
        max={durationMs}
        step={1}
        value={Math.min(positionMs, durationMs)}
        onChange={(event) => {
          if (pointerScrubRef.current.active && scrubFineEngagedRef.current) return
          previewScrub(
            Number(event.target.value),
            pointerScrubRef.current.active && snapEnabled !== pointerScrubRef.current.inverted,
          )
        }}
        onPointerDown={(event) => {
          pointerScrubRef.current = { active: true, inverted: event.altKey }
          scrubFineEngagedRef.current = event.shiftKey
          // The input extends 8px past the ruler on both sides; the usable
          // track is the ruler span itself.
          const trackWidthPx = event.currentTarget.getBoundingClientRect().width - 16
          scrubWidthPxRef.current = Math.max(1, trackWidthPx)
          scrubDragRef.current = trackWidthPx >= 1
            ? beginFineAdjust(event.clientX, Math.min(positionMs, durationMs))
            : null
        }}
        onPointerMove={(event) => {
          if (!pointerScrubRef.current.active) return
          pointerScrubRef.current.inverted = event.altKey
          if (event.shiftKey) scrubFineEngagedRef.current = true
          const drag = scrubDragRef.current
          if (drag === null) return
          if (!scrubFineEngagedRef.current) {
            scrubDragRef.current = beginFineAdjust(
              event.clientX,
              Math.min(useShowTransportStore.getState().positionMs, durationMs),
            )
            return
          }
          scrubDragRef.current = moveFineAdjust(drag, event.clientX, {
            fine: event.shiftKey,
            scale: durationMs / scrubWidthPxRef.current,
          })
          previewScrub(Math.max(0, Math.min(durationMs, scrubDragRef.current.position)))
        }}
        onKeyDown={(event) => {
          if (event.code === 'Space') {
            event.preventDefault()
            usePreviewStore.getState().toggle()
            return
          }
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
          event.preventDefault()
          const key = event.key
          const current = keyboardHoldRef.current
          if (!event.repeat || !current || current.key !== key) {
            keyboardHoldRef.current = { key, startedAt: event.timeStamp }
          }
          const heldForMs = event.timeStamp - (keyboardHoldRef.current?.startedAt ?? event.timeStamp)
          const direction = key === 'ArrowLeft' ? -1 : 1
          previewScrub(positionMs + direction * showKeyboardSeekStepMs(heldForMs))
        }}
        onPointerUp={() => {
          commitScrub()
          pointerScrubRef.current = { active: false, inverted: false }
          scrubDragRef.current = null
          scrubFineEngagedRef.current = false
        }}
        onPointerCancel={() => {
          commitScrub()
          pointerScrubRef.current = { active: false, inverted: false }
          scrubDragRef.current = null
          scrubFineEngagedRef.current = false
        }}
        onKeyUp={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') keyboardHoldRef.current = null
          commitScrub()
        }}
        onBlur={() => {
          keyboardHoldRef.current = null
          commitScrub()
        }}
        className="show-playhead-range absolute -inset-x-2 inset-y-0 w-[calc(100%+16px)] cursor-col-resize opacity-0 outline-none"
      />
    </div>
  )
}

function ShowTimelineToolbarPopover({
  anchor,
  point,
  widthPx,
  align = 'end',
  role = 'dialog',
  escapeLayerRank = SHOW_ESCAPE_LAYER_RANK.toolbarPopover,
  ariaLabel,
  className,
  children,
  onDismiss,
  onClick,
}: {
  anchor: HTMLElement | null
  point?: { clientX: number; clientY: number }
  widthPx: number
  /** Toolbar popovers hang from their anchor's right edge; rail popovers from its left. */
  align?: 'start' | 'end'
  role?: 'dialog' | 'menu'
  escapeLayerRank?: number
  ariaLabel: string
  className: string
  children: ReactNode
  onDismiss?: () => void
  onClick?: (event: ReactMouseEvent<HTMLDivElement>) => void
}) {
  const [position, setPosition] = useState({ left: 8, top: 8 })
  const popoverRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!anchor) return
    const updatePosition = () => {
      const rect = anchor.getBoundingClientRect()
      const popoverHeight = popoverRef.current?.getBoundingClientRect().height ?? 0
      const desiredTop = point
        ? point.clientY + popoverHeight + 4 <= window.innerHeight - 8
          ? point.clientY + 4
          : point.clientY - popoverHeight - 4
        : rect.bottom + 4
      setPosition({
        left: Math.max(8, Math.min(
          point?.clientX ?? (align === 'start' ? rect.left : rect.right - widthPx),
          window.innerWidth - widthPx - 8,
        )),
        top: Math.max(8, Math.min(desiredTop, window.innerHeight - popoverHeight - 8)),
      })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [align, anchor, point, widthPx])

  useLayoutEffect(() => {
    if (role !== 'menu') return
    popoverRef.current
      ?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')
      ?.focus()
  }, [role])

  useEffect(() => {
    if (!onDismiss) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (popoverRef.current?.contains(event.target) || anchor?.contains(event.target)) return
      onDismiss()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [anchor, onDismiss])

  // Escape goes through the shared layer registry (#672). Registration happens
  // once per mount through refs: onDismiss is usually an inline lambda, and
  // re-registering per render would make same-rank ordering depend on render
  // timing again.
  const dismissRef = useRef({ anchor, onDismiss })
  useEffect(() => {
    dismissRef.current = { anchor, onDismiss }
  })
  const dismissible = Boolean(onDismiss)
  useEffect(() => {
    if (!dismissible) return
    return registerShowEscapeLayer({
      rank: escapeLayerRank,
      onEscape: () => {
        const { anchor: currentAnchor, onDismiss: currentOnDismiss } = dismissRef.current
        if (!currentOnDismiss) return false
        currentOnDismiss()
        currentAnchor?.focus()
        return true
      },
    })
  }, [dismissible, escapeLayerRank])

  if (!anchor || typeof document === 'undefined') return null
  return createPortal(
    <div
      ref={popoverRef}
      role={role}
      aria-label={ariaLabel}
      className={`fixed z-[80] ${className}`}
      style={{ left: position.left, top: position.top }}
      onKeyDown={(event) => {
        if (role !== 'menu' || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
        const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')]
        if (items.length === 0) return
        event.preventDefault()
        const currentIndex = items.indexOf(document.activeElement as HTMLElement)
        const nextIndex = event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? items.length - 1
            : event.key === 'ArrowDown'
              ? (currentIndex + 1 + items.length) % items.length
              : (currentIndex - 1 + items.length) % items.length
        items[nextIndex]?.focus()
      }}
      onClick={onClick}
    >
      {children}
    </div>,
    document.body,
  )
}

function TimelineEndHandlePortal({
  anchor,
  durationMs,
  layoutScale,
  dragging,
  blocked,
  readOnly,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
  onClick,
}: {
  anchor: HTMLElement | null
  durationMs: number
  layoutScale: number
  dragging: boolean
  blocked: boolean
  readOnly: boolean
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onLostPointerCapture: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void
}) {
  const [position, setPosition] = useState({ left: -100, top: -100, visible: false })

  const overlayHost = anchor?.closest<HTMLElement>('[data-show-timeline-overlay-host]') ?? null

  useLayoutEffect(() => {
    if (!anchor || !overlayHost) return
    const viewport = anchor.closest<HTMLElement>('[data-show-timeline-scroll-viewport]')
    const updatePosition = () => {
      const rect = anchor.getBoundingClientRect()
      const hostRect = overlayHost.getBoundingClientRect()
      const center = rect.left + rect.width / 2
      const viewportRect = viewport?.getBoundingClientRect()
      setPosition({
        left: center - hostRect.left,
        top: rect.top - hostRect.top,
        visible: !viewportRect || (center >= viewportRect.left && center <= viewportRect.right),
      })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updatePosition)
    if (viewport) resizeObserver?.observe(viewport)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      resizeObserver?.disconnect()
    }
  }, [anchor, overlayHost, durationMs, layoutScale])

  if (!anchor || !overlayHost) return null
  return createPortal(
    <button
      type="button"
      data-show-timeline-marker-ui
      data-show-end-dragging={dragging ? 'true' : undefined}
      data-show-end-drag-blocked={dragging && blocked ? 'true' : undefined}
      aria-label={`Show End at ${formatSecondsValue(durationMs)} seconds`}
      title={`Show End · ${formatSecondsValue(durationMs)}s`}
      disabled={readOnly}
      className={`absolute z-[45] h-4 w-4 -translate-x-1/2 -translate-y-1/2 touch-none text-red-400 disabled:cursor-default ${dragging && blocked ? 'cursor-not-allowed' : 'cursor-ew-resize'}`}
      style={{
        left: position.left,
        top: position.top,
        visibility: position.visible || dragging ? undefined : 'hidden',
        pointerEvents: position.visible || dragging ? undefined : 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onLostPointerCapture}
      onClick={onClick}
    >
      <span
        data-testid="show-timeline-end-handle"
        className="absolute left-1/2 top-1/2 h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-current"
      />
      {dragging && (
        <span
          data-testid="show-end-drag-time"
          className="absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap rounded border border-red-300/25 bg-zinc-950/95 px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-red-200 shadow-lg"
        >
          {formatSecondsValue(durationMs)}s
        </span>
      )}
    </button>,
    overlayHost,
  )
}

function TimelineMarkers({
  durationMs,
  minimumShowEndMs,
  markers,
  markerFeedback,
  gridColumn,
  gridRow,
  rowSpan,
  layoutScale,
  snapEnabled,
  structuralTimesMs,
  readOnly,
  onMoveMarker,
  onUpdateMarker,
  onRemoveMarker,
  onPreviewShowEnd,
  onSetShowEnd,
}: {
  durationMs: number
  minimumShowEndMs: number
  markers: ShowTimelineMarkerView[]
  markerFeedback: TimelineMarkerFeedback | null
  gridColumn: string
  gridRow: number
  rowSpan: number
  layoutScale: number
  snapEnabled: boolean
  structuralTimesMs: number[]
  readOnly: boolean
  onMoveMarker: (markerId: string, timeMs: number) => Promise<boolean>
  onUpdateMarker: (markerId: string, patch: Partial<Omit<NonNullable<ShowCompositionV1['markers']>[number], 'id'>>) => Promise<boolean>
  onRemoveMarker: (markerId: string) => Promise<boolean>
  onPreviewShowEnd: (durationMs: number | null) => void
  onSetShowEnd: (durationMs: number) => Promise<boolean>
}) {
  const [openMarkerId, setOpenMarkerId] = useState<string | null>(null)
  const [showEndOpen, setShowEndOpen] = useState(false)
  const [showEndDragging, setShowEndDragging] = useState(false)
  const [showEndDragBlocked, setShowEndDragBlocked] = useState(false)
  const [showEndAnchor, setShowEndAnchor] = useState<HTMLSpanElement | null>(null)
  const markerSurfaceRef = useRef<HTMLDivElement>(null)
  const markerPointerRef = useRef<{ markerId: string; pointerId: number; startX: number; settling?: boolean } | null>(null)
  // A Marker follows the pointer while it is dragged (#667): the handle and
  // stem render at the resolved (quantized/magnetized) time continuously
  // instead of jumping only on release.
  const [markerMovePreview, setMarkerMovePreview] = useState<{ markerId: string; timeMs: number } | null>(null)
  const showEndPointerRef = useRef<{
    pointerId: number
    startX: number
    startDurationMs: number
    surfaceWidthPx: number
    settling?: boolean
  } | null>(null)
  const refreshMarkerMoveActivity = useFieldActivity(() => markerPointerRef.current !== null)
  const refreshShowEndActivity = useFieldActivity(() => showEndPointerRef.current !== null)
  useLayoutEffect(() => {
    const pointer = markerPointerRef.current
    if (!pointer || pointer.settling || markers.some(marker => marker.id === pointer.markerId && marker.timeMs <= durationMs)) return
    markerPointerRef.current = null
    setMarkerMovePreview(null)
    refreshMarkerMoveActivity()
  }, [markers, durationMs, refreshMarkerMoveActivity])
  useLayoutEffect(() => () => { markerPointerRef.current = null; showEndPointerRef.current = null }, [])
  const cancelMarkerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (markerPointerRef.current?.pointerId !== event.pointerId || markerPointerRef.current.settling) return
    markerPointerRef.current = null
    setMarkerMovePreview(null)
    refreshMarkerMoveActivity()
  }
  const suppressMarkerHandleClickRef = useRef(false)
  const suppressShowEndClickRef = useRef(false)
  useEffect(() => {
    if (!openMarkerId && !showEndOpen) return
    const closeDetails = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-show-timeline-marker-ui], [data-bounded-number-slider-ui]')) return
      setOpenMarkerId(null)
      setShowEndOpen(false)
    }
    document.addEventListener('pointerdown', closeDetails)
    return () => document.removeEventListener('pointerdown', closeDetails)
  }, [openMarkerId, showEndOpen])
  // A dragged Marker must not magnetize to its own current time — that would
  // make any move shorter than the magnet threshold spring back to where the
  // Marker already is (#667).
  const resolvePointerTime = (event: ReactPointerEvent<HTMLElement>, excludeTimeMs?: number) => {
    const rect = event.currentTarget
      .closest('[data-show-timeline-marker-surface]')
      ?.getBoundingClientRect()
    if (!rect) return 0
    const rawTimeMs = (event.clientX - rect.left) / Math.max(1, rect.width) * durationMs
    if (event.altKey) return Math.round(Math.max(0, Math.min(durationMs, rawTimeMs)))
    return Math.round(snapShowTimelineTime(rawTimeMs, {
      visibleDurationMs: durationMs,
      visibleWidthPx: rect.width,
      structuralTimesMs: snapEnabled
        ? structuralTimesMs.filter((timeMs) => timeMs !== excludeTimeMs)
        : [],
      quantizeStepMs: showTimelineQuantizeStepMs(event.shiftKey, durationMs, rect.width),
      maxTimeMs: durationMs,
    }).timeMs)
  }
  const resolveShowEndDrag = (
    event: ReactPointerEvent<HTMLElement>,
    pointer: NonNullable<typeof showEndPointerRef.current>,
  ) => {
    const rawTimeMs = pointer.startDurationMs
      + (event.clientX - pointer.startX) / Math.max(1, pointer.surfaceWidthPx) * pointer.startDurationMs
    const maxTimeMs = Math.max(pointer.startDurationMs * 16, rawTimeMs, minimumShowEndMs)
    // The Show End must not magnetize to itself: its drag-start time and the
    // live previewed end both re-enter the structural set through the
    // previewed timeline, and either would pin the handle within the magnet
    // threshold of wherever it already is (#667).
    const timeMs = event.altKey
      ? Math.round(Math.max(minimumShowEndMs, rawTimeMs))
      : Math.round(snapShowTimelineTime(rawTimeMs, {
          visibleDurationMs: pointer.startDurationMs,
          visibleWidthPx: pointer.surfaceWidthPx,
          structuralTimesMs: snapEnabled
            ? structuralTimesMs.filter((candidateMs) => (
                candidateMs !== pointer.startDurationMs && candidateMs !== durationMs
              ))
            : [],
          quantizeStepMs: showTimelineQuantizeStepMs(
            event.shiftKey,
            pointer.startDurationMs,
            pointer.surfaceWidthPx,
          ),
          minTimeMs: minimumShowEndMs,
          maxTimeMs,
        }).timeMs)
    return { timeMs, blocked: rawTimeMs < minimumShowEndMs }
  }
  const beginShowEndDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (showEndPointerRef.current) return
    event.stopPropagation()
    const rect = markerSurfaceRef.current?.getBoundingClientRect()
    showEndPointerRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startDurationMs: durationMs,
      surfaceWidthPx: rect?.width ?? 1,
    }
    refreshShowEndActivity()
    setShowEndDragging(true)
    setShowEndDragBlocked(false)
    onPreviewShowEnd(durationMs)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const previewShowEndDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const pointer = showEndPointerRef.current
    if (!pointer || pointer.settling || pointer.pointerId !== event.pointerId) return
    event.stopPropagation()
    const resolved = resolveShowEndDrag(event, pointer)
    setShowEndDragBlocked(resolved.blocked)
    onPreviewShowEnd(resolved.timeMs)
  }
  const finishShowEndDrag = (event: ReactPointerEvent<HTMLElement>) => {
    event.stopPropagation()
    const pointer = showEndPointerRef.current
    if (!pointer || pointer.pointerId !== event.pointerId || pointer.settling) return
    if (Math.abs(event.clientX - pointer.startX) < 3) { cancelShowEndDrag(event); return }
    pointer.settling = true
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    const { timeMs } = resolveShowEndDrag(event, pointer)
    setShowEndDragBlocked(false)
    suppressShowEndClickRef.current = true
    onPreviewShowEnd(timeMs)
    void onSetShowEnd(timeMs).catch(() => {}).finally(() => {
      if (showEndPointerRef.current !== pointer) return
      showEndPointerRef.current = null
      setShowEndDragging(false)
      setShowEndDragBlocked(false)
      onPreviewShowEnd(null)
      refreshShowEndActivity()
    })
  }
  const cancelShowEndDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (showEndPointerRef.current?.pointerId !== event.pointerId || showEndPointerRef.current.settling) return
    showEndPointerRef.current = null
    setShowEndDragging(false)
    setShowEndDragBlocked(false)
    onPreviewShowEnd(null)
    refreshShowEndActivity()
  }
  const toggleShowEndDetails = (event: ReactMouseEvent<HTMLElement>) => {
    event.stopPropagation()
    if (suppressShowEndClickRef.current) {
      suppressShowEndClickRef.current = false
      return
    }
    setOpenMarkerId(null)
    setShowEndOpen((open) => !open)
  }
  return (
    <div
      ref={markerSurfaceRef}
      aria-label="Timeline Markers and Show End"
      data-show-timeline-marker-surface
      className="pointer-events-none relative z-[35]"
      style={{ gridColumn, gridRow: `${gridRow} / span ${rowSpan}` }}
    >
      {markerFeedback?.kind === 'drag' && (
        <div
          aria-hidden
          data-testid="show-timeline-marker-preview"
          className="pointer-events-none absolute inset-y-0 z-20 w-[5px] -translate-x-1/2 text-amber-200/80"
          style={{ left: `${markerFeedback.timeMs / Math.max(1, durationMs) * 100}%` }}
        >
          <span className="absolute inset-y-0 left-1/2 -translate-x-1/2 border-l border-dashed border-current opacity-55" />
          <span className="absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 border-x-[3px] border-t-[5px] border-x-transparent border-t-current" />
        </div>
      )}
      {/* Landing-time readout: a drag is only precise if you can see the
          value you are about to land on (#667). */}
      {(markerFeedback?.kind === 'drag' || markerMovePreview !== null) && (() => {
        const timeMs = markerFeedback?.kind === 'drag' ? markerFeedback.timeMs : markerMovePreview!.timeMs
        const left = timeMs / Math.max(1, durationMs) * 100
        return (
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 z-30 text-amber-200"
            style={{ left: `${left}%` }}
          >
            <span
              data-testid="show-timeline-drag-time"
              className={`absolute top-1 whitespace-nowrap rounded border border-amber-300/25 bg-zinc-950/95 px-1.5 py-0.5 text-[9px] font-medium tabular-nums shadow-lg ${left > 82 ? 'right-2' : 'left-2'}`}
            >
              {formatSecondsValue(timeMs)}s
            </span>
          </div>
        )
      })()}
      {markerFeedback?.kind === 'confirmation' && (() => {
        const left = markerFeedback.timeMs / Math.max(1, durationMs) * 100
        return (
          <div
            role="status"
            aria-label="Marker added at playhead"
            className="pointer-events-none absolute top-0 z-30 text-amber-200"
            style={{ left: `${left}%` }}
          >
            <span className="absolute left-0 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1 rounded-full border border-amber-200/80 bg-amber-300/20 shadow-[0_0_8px_rgba(251,191,36,0.65)]" />
            <span className={`absolute top-1 whitespace-nowrap rounded border border-amber-300/25 bg-zinc-950/95 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.08em] shadow-lg ${left > 82 ? 'right-2' : 'left-2'}`}>
              Marker added
            </span>
          </div>
        )
      })()}
      {markers.filter((marker) => marker.timeMs <= durationMs).map((marker) => {
        const displayTimeMs = markerMovePreview?.markerId === marker.id
          ? markerMovePreview.timeMs
          : marker.timeMs
        const left = displayTimeMs / Math.max(1, durationMs) * 100
        return (
          <div key={marker.id} className="contents">
          <span
            aria-hidden
            data-show-timeline-marker-stem
            className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 border-l border-dashed border-current opacity-45"
            style={{ left: `${left}%`, color: marker.color ?? '#f59e0b' }}
          />
          <button
            type="button"
            data-show-timeline-marker-ui
            aria-label={`${marker.name ?? 'Marker'} at ${formatSecondsValue(marker.timeMs)} seconds`}
            title={`${marker.name ?? 'Marker'} · ${formatSecondsValue(marker.timeMs)}s`}
            disabled={readOnly}
            className="pointer-events-auto absolute top-0 h-7 w-[5px] -translate-x-1/2 cursor-ew-resize touch-none disabled:cursor-default"
            style={{ left: `${left}%`, color: marker.color ?? '#f59e0b' }}
            onPointerDown={(event) => {
              event.stopPropagation()
              if (markerPointerRef.current) return
              markerPointerRef.current = { markerId: marker.id, pointerId: event.pointerId, startX: event.clientX }
              refreshMarkerMoveActivity()
              event.currentTarget.setPointerCapture?.(event.pointerId)
            }}
            onPointerMove={(event) => {
              const pointer = markerPointerRef.current
              if (!pointer || pointer.settling || pointer.markerId !== marker.id || pointer.pointerId !== event.pointerId) return
              if (Math.abs(event.clientX - pointer.startX) < 3 && markerMovePreview === null) return
              setMarkerMovePreview({ markerId: marker.id, timeMs: resolvePointerTime(event, marker.timeMs) })
            }}
            onPointerUp={(event) => {
              event.stopPropagation()
              const pointer = markerPointerRef.current
              if (!pointer || pointer.markerId !== marker.id || pointer.pointerId !== event.pointerId || pointer.settling) return
              if (Math.abs(event.clientX - pointer.startX) < 3) { cancelMarkerMove(event); return }
              pointer.settling = true
              setMarkerMovePreview(null)
              const timeMs = resolvePointerTime(event, marker.timeMs)
              event.currentTarget.releasePointerCapture?.(event.pointerId)
              suppressMarkerHandleClickRef.current = true
              void onMoveMarker(marker.id, timeMs).catch(() => {}).finally(() => {
                if (markerPointerRef.current !== pointer) return
                markerPointerRef.current = null
                refreshMarkerMoveActivity()
              })
            }}
            onPointerCancel={cancelMarkerMove}
            onLostPointerCapture={cancelMarkerMove}
            onClick={(event) => {
              event.stopPropagation()
              if (suppressMarkerHandleClickRef.current) {
                suppressMarkerHandleClickRef.current = false
                return
              }
              setShowEndOpen(false)
              setOpenMarkerId((current) => current === marker.id ? null : marker.id)
            }}
          >
            <span
              data-show-timeline-marker-head
              className="absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 border-x-[3px] border-t-[5px] border-x-transparent border-t-current"
            />
          </button>
          {openMarkerId === marker.id && (
            <div
              role="dialog"
              data-show-timeline-marker-ui
              aria-label={`${marker.name ?? 'Marker'} details`}
              className="pointer-events-auto absolute top-2 z-50 w-52 rounded border border-amber-300/25 bg-zinc-950 p-2 text-left text-[11px] text-zinc-400 shadow-2xl"
              style={{ left: `${left}%`, transform: left > 72 ? 'translateX(-100%)' : 'translateX(4px)' }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-2 flex items-center justify-between">
                <strong className="font-medium text-zinc-200">Marker</strong>
                <span className="flex items-center gap-0.5">
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Delete ${marker.name ?? 'Marker'}`}
                    title={`Delete ${marker.name ?? 'Marker'}`}
                    className="text-zinc-500 hover:bg-red-950/30 hover:text-red-300"
                    onClick={() => {
                      setOpenMarkerId(null)
                      void onRemoveMarker(marker.id)
                    }}
                  >
                    <Trash2 size={12} aria-hidden />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Close Marker details"
                    title="Close Marker details"
                    className="text-zinc-600 hover:text-zinc-200"
                    onClick={() => setOpenMarkerId(null)}
                  >
                    <X size={12} aria-hidden />
                  </Button>
                </span>
              </div>
              <label className="grid grid-cols-[44px_1fr] items-center gap-2 py-1">
                <span>Name</span>
                <DraftTextField
                  ariaLabel="Marker name"
                  value={marker.name ?? ''}
                  formatApplied={(_, draft) => draft.trim()}
                  onApply={(name) => { void onUpdateMarker(marker.id, { name: name.trim() || undefined }) }}
                  inputClassName="min-w-0 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-1 text-zinc-200"
                />
              </label>
              <div className="grid grid-cols-[44px_1fr] items-center gap-2 py-1">
                <span>Time</span>
                <UiTimeField
                  label="Marker time"
                  ariaLabel="Marker time in seconds"
                  hideLabel
                  compact
                  variant="editor"
                  value={marker.timeMs / 1_000}
                  min={0}
                  max={Number.MAX_SAFE_INTEGER}
                  step={0.001}
                  onChange={(seconds) => void onUpdateMarker(marker.id, { timeMs: Math.round(seconds * 1_000) })}
                />
              </div>
              <label className="grid grid-cols-[44px_1fr] items-center gap-2 py-1">
                <span>Color</span>
                <input
                  type="color"
                  aria-label="Marker color"
                  className="h-6 w-8 rounded border border-zinc-800 bg-transparent"
                  value={marker.color ?? '#f59e0b'}
                  onChange={(event) => void onUpdateMarker(marker.id, { color: event.target.value })}
                />
              </label>
            </div>
          )}
          </div>
        )
      })}
      <span
        ref={setShowEndAnchor}
        aria-hidden
        data-testid="show-timeline-end-anchor"
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-px bg-red-400 opacity-65"
      />
      <TimelineEndHandlePortal
        anchor={showEndAnchor}
        durationMs={durationMs}
        layoutScale={layoutScale}
        dragging={showEndDragging}
        blocked={showEndDragBlocked}
        readOnly={readOnly}
        onPointerDown={beginShowEndDrag}
        onPointerMove={previewShowEndDrag}
        onPointerUp={finishShowEndDrag}
        onPointerCancel={cancelShowEndDrag}
        onLostPointerCapture={cancelShowEndDrag}
        onClick={toggleShowEndDetails}
      />
      {showEndOpen && (
        <div
          role="dialog"
          data-show-timeline-marker-ui
          aria-label="Show End details"
          className="pointer-events-auto absolute right-1 top-2 z-50 w-44 rounded border border-red-400/25 bg-zinc-950 p-2 text-[11px] text-zinc-400 shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-2 flex items-center justify-between">
            <strong className="font-medium text-zinc-200">Show End</strong>
            <button type="button" aria-label="Close Show End details" className="text-zinc-600 hover:text-zinc-200" onClick={() => setShowEndOpen(false)}><X size={12} /></button>
          </div>
          <div className="grid grid-cols-[40px_1fr] items-center gap-1">
            <span className="w-10">Time</span>
            <UiTimeField
              label="Show End time"
              ariaLabel="Show End time in seconds"
              hideLabel
              compact
              variant="editor"
              value={durationMs / 1_000}
              min={0.001}
              max={Number.MAX_SAFE_INTEGER}
              step={0.001}
              onChange={(seconds) => void onSetShowEnd(Math.round(seconds * 1_000))}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function TimelinePlayhead({
  showId,
  durationMs,
  gridColumn,
  gridRow,
  rowSpan,
  viewport,
  snapEnabled,
  structuralTimesMs,
  getVisibleWidth,
}: {
  showId: string
  durationMs: number
  gridColumn: string
  gridRow: number
  rowSpan: number
  viewport: ShowTimelineViewport
  snapEnabled: boolean
  structuralTimesMs: number[]
  getVisibleWidth: () => number
}) {
  const positionMs = useShowTransportStore((state) => state.showId === showId ? state.positionMs : 0)
  const seekStatus = useShowTransportStore((state) => state.showId === showId ? state.seekStatus : 'idle')
  const pendingSeekRef = useRef<{ showId: string; targetMs: number } | null>(null)
  const resumeAfterSeekRef = useRef(false)
  const activePointerRef = useRef<number | null>(null)
  const directDragRef = useRef<FineAdjustDrag | null>(null)
  const directFineEngagedRef = useRef(false)
  const left = durationMs > 0 ? Math.min(100, Math.max(0, positionMs / durationMs * 100)) : 0
  const visible = positionMs >= viewport.startMs && positionMs <= viewport.startMs + viewport.durationMs
  const previewPointerPosition = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const track = event.currentTarget.parentElement
    if (!track) return
    const rect = track.getBoundingClientRect()
    // Shift drags the playhead at a tenth of the gain from wherever it is,
    // unsnapped — precision is the point. Once Shift has engaged, the whole
    // remaining gesture stays incremental (coarse deltas at full gain):
    // returning to the absolute pointer mapping would jump the playhead to
    // the pointer's coarse position (#667 review).
    if (event.shiftKey) directFineEngagedRef.current = true
    const drag = directDragRef.current
    if (directFineEngagedRef.current && drag !== null) {
      directDragRef.current = moveFineAdjust(drag, event.clientX, {
        fine: event.shiftKey,
        scale: durationMs / Math.max(1, rect.width),
      })
      applyPreviewPosition(Math.max(0, Math.min(durationMs, directDragRef.current.position)))
      return
    }
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)))
    const targetMs = fraction * durationMs
    const resolvedTimeMs = snapEnabled !== event.altKey
      ? snapShowTimelineTime(targetMs, {
          visibleDurationMs: viewport.durationMs,
          visibleWidthPx: getVisibleWidth(),
          structuralTimesMs,
          maxTimeMs: durationMs,
        }).timeMs
      : targetMs
    directDragRef.current = beginFineAdjust(event.clientX, resolvedTimeMs)
    applyPreviewPosition(resolvedTimeMs)
  }
  const applyPreviewPosition = (resolvedTimeMs: number) => {
    const preview = usePreviewStore.getState()
    if (!pendingSeekRef.current) resumeAfterSeekRef.current = preview.isRunning
    if (preview.isRunning) preview.toggle()
    useShowTransportStore.getState().setPosition(showId, resolvedTimeMs)
    pendingSeekRef.current = { showId, targetMs: resolvedTimeMs }
  }
  const commitPointerPosition = () => {
    const pending = pendingSeekRef.current
    pendingSeekRef.current = null
    activePointerRef.current = null
    directDragRef.current = null
    directFineEngagedRef.current = false
    if (!pending || pending.showId !== showId) {
      resumeAfterSeekRef.current = false
      return
    }
    useShowTransportStore.getState().requestSeek(showId, pending.targetMs)
    if (resumeAfterSeekRef.current && !usePreviewStore.getState().isRunning) {
      usePreviewStore.getState().toggle()
    }
    resumeAfterSeekRef.current = false
  }
  return (
    <>
      <div
        aria-hidden
        data-testid="show-timeline-playhead-surface"
        className={`pointer-events-none relative z-30 ${visible ? '' : 'invisible'}`}
        style={{ gridColumn, gridRow: `${gridRow} / span ${rowSpan}` }}
      >
        <span
          data-testid="show-timeline-playhead-hit-target"
          className="pointer-events-auto absolute inset-y-0 w-[5px] -translate-x-1/2 cursor-col-resize touch-none"
          style={{ left: `${left}%` }}
          onPointerDown={(event) => {
            event.stopPropagation()
            activePointerRef.current = event.pointerId
            event.currentTarget.setPointerCapture?.(event.pointerId)
            // Grabbing with Shift already held starts fine mode from the
            // playhead's current time — no jump to the pointer, no snap.
            directFineEngagedRef.current = event.shiftKey
            if (event.shiftKey) {
              directDragRef.current = beginFineAdjust(event.clientX, Math.min(positionMs, durationMs))
              return
            }
            previewPointerPosition(event)
          }}
          onPointerMove={(event) => {
            if (activePointerRef.current !== event.pointerId) return
            previewPointerPosition(event)
          }}
          onPointerUp={(event) => {
            if (activePointerRef.current !== event.pointerId) return
            previewPointerPosition(event)
            event.currentTarget.releasePointerCapture?.(event.pointerId)
            commitPointerPosition()
          }}
          onPointerCancel={commitPointerPosition}
        >
          <span
            data-testid="show-timeline-playhead"
            className={`pointer-events-none absolute inset-y-0 left-1/2 w-px ${seekStatus === 'rebuilding' ? 'bg-amber-300' : 'bg-live'}`}
            style={{
              transform: left <= 0 ? 'translateX(0)' : left >= 100 ? 'translateX(-100%)' : 'translateX(-50%)',
              boxShadow: left <= 0 || left >= 100
                ? 'none'
                : '0 0 8px color-mix(in srgb, var(--color-live) 45%, transparent)',
            }}
          />
        </span>
      </div>
      <div
        data-testid="show-timeline-playhead-cap-surface"
        aria-hidden
        className={`pointer-events-none relative z-[45] ${visible ? '' : 'invisible'}`}
        style={{ gridColumn, gridRow: `${gridRow} / span ${rowSpan}` }}
      >
        <span
          data-testid="show-timeline-playhead-cap"
          className={`pointer-events-none absolute top-0 z-[45] h-0 w-0 -translate-x-1/2 border-x-[4px] border-t-[6px] border-x-transparent ${seekStatus === 'rebuilding' ? 'border-t-amber-300' : 'border-t-live'}`}
          style={{ left: `${left}%` }}
        />
      </div>
    </>
  )
}

function formatSecondsValue(timeMs: number): string {
  return Number((Math.max(0, timeMs) / 1000).toFixed(3)).toString()
}

// Exported for the Clip detail matrix suite, which qualifies the production
// read-only composition: entity detail children receive readOnly={false} and
// the disabling comes from InspectorPanel's context-controlled fieldset.
export const InspectorReadOnlyContext = createContext(false)
const READ_ONLY_INSPECTOR_CLASS = 'contents [&_input:disabled]:cursor-default [&_input:disabled]:border-zinc-800 [&_input:disabled]:bg-zinc-950/35 [&_input:disabled]:text-zinc-300 [&_input:disabled]:opacity-100 [&_select:disabled]:cursor-default [&_select:disabled]:border-zinc-800 [&_select:disabled]:bg-zinc-950/35 [&_select:disabled]:text-zinc-300 [&_select:disabled]:opacity-100 [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-45'

export function InspectorPanel({
  family,
  title,
  heading,
  headingMeta,
  summary,
  icon,
  actions,
  children,
}: {
  family: 'Clip' | 'Group' | 'Transition' | 'Zone' | 'Zone Layout' | 'Show'
  title?: string
  heading?: string
  headingMeta?: string
  summary?: React.ReactNode
  icon: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const readOnly = useContext(InspectorReadOnlyContext)
  const label = `${family} properties`
  const accent = {
    Clip: 'border-cyan-400/35 bg-cyan-400/10 text-cyan-300',
    Group: 'border-emerald-400/35 bg-emerald-400/10 text-emerald-300',
    Transition: 'border-violet-400/35 bg-violet-400/10 text-violet-300',
    Zone: 'border-live/35 bg-live/10 text-live',
    'Zone Layout': 'border-live/35 bg-live/10 text-live',
    Show: 'border-zinc-600 bg-zinc-800/80 text-amber-300',
  }[family]
  return (
    <section role="region" aria-label={label} data-entity-family={family.toLowerCase().replace(' ', '-')} className={`${family === 'Clip' ? 'flex min-h-0 flex-1 flex-col' : ''} overflow-hidden bg-transparent`}>
      {/* Two rows when a summary is present: the actions sit beside the title,
          and the summary then spans the full header width. Sharing one row with
          the action column truncated long Effect descriptions (#363). */}
      <header className={`flex shrink-0 flex-col border-b border-zinc-800/90 bg-zinc-950/65 ${summary ? 'min-h-12 gap-1 py-1.5' : 'h-10 justify-center py-1'}`}>
        <div className="flex min-w-0 items-center gap-2 pl-2.5 pr-16">
          <span className={`grid size-6 shrink-0 place-items-center rounded border ${accent}`}>{icon}</span>
          <div className="min-w-0 flex-1">
            {heading ? (
              <div className="flex min-w-0 items-baseline gap-1.5">
                <h3 className="shrink-0 text-[11px] font-semibold text-zinc-200">{heading}</h3>
                {headingMeta && <span className="shrink-0 text-[8px] uppercase tracking-[0.1em] text-zinc-600">{headingMeta}</span>}
                {title && <><span aria-hidden className="text-zinc-700">·</span><p className="truncate text-[9px] text-zinc-500">{title}</p></>}
              </div>
            ) : (
              <>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-300">{label}</h3>
                <p className="truncate text-[9px] text-zinc-600">{title}</p>
              </>
            )}
          </div>
          {actions && (
            <fieldset disabled={readOnly} className="contents">
              <div className="ml-auto flex shrink-0 items-center gap-1">{actions}</div>
            </fieldset>
          )}
        </div>
        {summary && <div className="min-w-0 px-2.5">{summary}</div>}
      </header>
      <fieldset
        disabled={readOnly}
        data-read-only={readOnly ? 'true' : undefined}
        className={readOnly ? READ_ONLY_INSPECTOR_CLASS : 'contents'}
      >
        <div className={family === 'Clip' ? 'flex min-h-0 flex-1 flex-col p-2.5' : 'p-2.5'}>{children}</div>
      </fieldset>
    </section>
  )
}

function ContextualInspector({
  show,
  compositionShow,
  recordV2,
  replacementCaptureV2,
  preparedCaptureV2,
  boundaryTransitionsV2,
  panelKey,
  selection,
  selectedClip,
  selectedCompositionClipOwner,
  selectedGroupClipOwner,
  transformEnabled,
  stageDimensions,
  patternOptions,
  patternControlsByCellId,
  patternControlsByInstanceId,
  compiledOutputEffects,
  controllerProfiles,
  userMaps,
  spatialSelectionUnavailableReason,
  onOpenSpatialSelection,
  onUpdateTargetProfile,
  onUpdatePortableReference,
  onUpdateOutputTrails,
  onPatternCommit,
  onRemoveClip,
  onUpdateAdaptations,
  onUpdateClipInspector,
  onUpdateClipInspectorV2,
  onUpdateBoundaryTransitionV2,
  onRemoveBoundaryTransitionV2,
  onUpdateRoutingTransferV2,
  onRemoveRoutingTransferV2,
  onPropertyAnimationChangeV2,
  onGroupPropertyAnimationChangeV2,
  onPropertyAnimationChange,
  onUpdateGroupClipInspector,
  onPreviewClipInspector,
  onPreviewGroupClipInspector,
  onPreviewEnd,
  onMakeCompositionPatternIndependent,
  onRejoinCompositionPattern,
  onMakePatternIndependentV2,
  onRejoinPatternV2,
  onRemoveCompositionClip,
  onRemoveClipV2,
  onDuplicateGroup,
  onMakeGroupUnique,
  onTranslateGroup,
  onUpdateGroupPlacement,
  onDeleteGroup,
  onUngroup,
  onV2GroupOccurrenceRequest,
  onUpdateGroupClipPatternV2,
  onUpdateControlTarget,
  onUpdateRestartOnEntry,
  onSpanZones,
  onUpdateCellZoneMode,
  onUpdateBoundaryTransition,
  onOpenTransitions,
  onRemoveBoundaryTransition,
  onUpdateZone,
  onRemoveZone,
  onAddRoutingLayout,
  onUpdateRoutingLayout,
  onRemoveRoutingLayout,
  onMakeLayoutIntervalUnique,
}: {
  // One inspector, read through whichever record backs the editor (#1065). The
  // v1 record stays inside the v1 branches; the v2 backing supplies its own
  // presented values through the same entity detail components.
  show: ShowRecord | null
  compositionShow: ShowRecord | null
  recordV2: ShowRecordV2 | null
  replacementCaptureV2: ShowV2PilotPreparedCapture | null
  preparedCaptureV2?: ShowPreparedStageEditCaptureV2 | null
  /** The boundary family v1's Transition inspector owns, projected by the root. */
  boundaryTransitionsV2: Record<string, ShowBoundaryTransitionInspectorValue> | null
  panelKey: string
  selection: ShowSelection
  selectedClip: ShowCell | null
  selectedCompositionClipOwner: ShowClipInspectorOwner | null
  selectedGroupClipOwner: ShowGroupClipOwner | null
  transformEnabled: boolean
  stageDimensions: 1 | 2 | 3
  patternOptions: ShowPatternOption[]
  patternControlsByCellId: Record<string, AutomatablePatternControl[]>
  patternControlsByInstanceId: Record<string, AutomatablePatternControl[]>
  compiledOutputEffects?: import('@/engine/showCompiler').ShowCompileSummary['outputEffects']
  controllerProfiles: ControllerProfile[]
  userMaps: MapRecord[]
  spatialSelectionUnavailableReason: string | null
  onOpenSpatialSelection: (zoneId: string) => void
  onUpdateTargetProfile: (targetControllerProfileId: string) => void
  onUpdatePortableReference: (referenceMapId: string | null, referencePixelCount: number) => void
  onUpdateOutputTrails: (input: SetShowOutputTrailsInput) => void
  onPatternCommit: () => void
  onRemoveClip: (clip: ShowCell) => void
  onUpdateAdaptations: (cell: ShowCell, changes: Partial<ShowCell['adaptations']>) => void
  onUpdateClipInspector: (owner: ShowClipInspectorOwner, patch: ShowClipInspectorPatch) => boolean | void | Promise<void>
  onUpdateClipInspectorV2?: (clipId: string, patch: ShowClipInspectorPatch) => boolean | void | Promise<void>
  onUpdateBoundaryTransitionV2?: (transitionId: string, changes: ShowTransitionChanges) => void
  onRemoveBoundaryTransitionV2?: (transitionId: string) => void
  onUpdateRoutingTransferV2?: (occurrenceId: string, changes: Partial<Omit<ShowBoundaryTransition, 'id' | 'afterSceneId'>>) => void
  onRemoveRoutingTransferV2?: (occurrenceId: string) => void
  onPropertyAnimationChangeV2?: (clipId: string, frame: ShowV2PropertyAnimationFrame, change: ShowPropertyAnimationChange) => boolean
  onGroupPropertyAnimationChangeV2?: (occurrenceId: string, clipId: string, change: ShowPropertyAnimationChange) => boolean
  onPropertyAnimationChange: (owner: ShowPropertyAnimationStorageOwner, change: ShowPropertyAnimationChange) => boolean | void
  onUpdateGroupClipInspector: (owner: ShowGroupClipOwner, patch: ShowClipInspectorPatch) => boolean | void | Promise<void>
  onPreviewClipInspector: (owner: ShowClipInspectorOwner, patch: ShowClipInspectorPatch) => void
  onPreviewGroupClipInspector: (owner: ShowGroupClipOwner, patch: ShowClipInspectorPatch) => void
  onPreviewEnd: () => void
  onMakeCompositionPatternIndependent: (owner: ShowClipInspectorOwner) => void
  onRejoinCompositionPattern: (owner: ShowClipInspectorOwner, targetInstanceId: string) => void
  onMakePatternIndependentV2?: (clipId: string) => void
  onRejoinPatternV2?: (clipId: string, targetInstanceId: string) => void
  onRemoveCompositionClip: (owner: ShowClipInspectorOwner) => void
  onRemoveClipV2?: (clipId: string) => void
  onV2GroupOccurrenceRequest?: (request: ShowV2GroupOccurrenceRequest) => boolean | Promise<void>
  onUpdateGroupClipPatternV2?: (occurrenceId: string, clipId: string, ref: ShowPatternRef) => boolean | Promise<void>
  onDuplicateGroup: (occurrenceId: string) => void
  onMakeGroupUnique: (occurrenceId: string) => void
  onTranslateGroup: (occurrenceId: string, translationX: number, translationY: number) => void
  onUpdateGroupPlacement: (occurrenceId: string, patch: { startMs?: number; baseLayer?: number }) => void
  onDeleteGroup: (occurrenceId: string) => void
  onUngroup: (occurrenceId: string) => void
  onUpdateControlTarget: (cell: ShowCell, exportName: string, value: number | undefined) => void
  onUpdateRestartOnEntry: (cell: ShowCell, restartOnEntry: boolean) => void
  onSpanZones: (cell: ShowCell, zoneSpan: number) => void
  onUpdateCellZoneMode: (cell: ShowCell, zoneMode: NonNullable<ShowCell['zoneMode']>) => void
  onUpdateBoundaryTransition: (
    transitionId: string,
    changes: Partial<Omit<ShowBoundaryTransition, 'id' | 'afterSceneId'>>,
  ) => void
  onOpenTransitions: (transitionId: string) => void
  onRemoveBoundaryTransition: (transitionId: string) => void
  onAddZone: () => void
  onUpdateZone: (zoneId: string, changes: Partial<ShowRecord['zones'][number]>) => void
  onRemoveZone: (zoneId: string) => void
  onAddRoutingLayout: (sourceLayoutId?: string) => void
  onUpdateRoutingLayout: (layoutId: string, changes: Partial<Omit<ShowRoutingLayout, 'id'>>) => void
  onRemoveRoutingLayout: (layoutId: string) => void
  onMakeLayoutIntervalUnique: (intervalId: string) => void
}) {
  // The inspector's own time read lives here, not at the editor root: an editor
  // subscribed to the playhead re-projects the whole timeline every tick (#508).
  const inspectorAtMs = useShowTransportStore((state) => (
    recordV2 && state.showId === recordV2.id ? state.positionMs : 0
  ))
  const presentationV2 = useMemo(() => (
    recordV2 ? projectShowEditorInspectorPresentationV2(recordV2, inspectorAtMs) : null
  ), [inspectorAtMs, recordV2])
  // Routing transfers do not move with the playhead, so they are read from the
  // record alone rather than the time-scoped presentation.
  const routingTransfersV2 = useMemo(() => (
    recordV2 ? projectShowEditorRoutingTransfersV2(recordV2) : null
  ), [recordV2])
  const canRemoveClip = show ? showRecordClipCount(show) > 1 : false
  // The same count `showRecordClipCount` makes on a v1 composition, read from
  // the authored v2 record: ordinary Clips plus one child per Group occurrence.
  const canRemoveClipV2 = recordV2
    ? recordV2.composition.clips.length
      + recordV2.composition.groupOccurrences.reduce((count, occurrence) => count + (
          recordV2.composition.groupDefinitions
            .find((definition) => definition.id === occurrence.definitionId)?.clips.length ?? 0
        ), 0) > 1
    : false
  const compositionTimelineClips = compositionShow?.composition
    ? projectShowUnifiedTimeline(compositionShow, compositionShow.composition).zones.flatMap((zone) => (
        zone.layers.flatMap((layer) => layer.clips)
      ))
    : []
  const compositionClipSummary = (
    clipId: string,
    patternControls: AutomatablePatternControl[],
  ): ShowClipSummarySection[] => {
    const clip = compositionTimelineClips.find((candidate) => candidate.id === clipId)
    if (!show || !compositionShow?.composition || !clip) return []
    if (!show.composition) {
      const compatibilityCell = compatibilityCellForTimelineClip(show, clip)
      if (!compatibilityCell) return []
      const compatibilityControls = patternControlsByCellId[compatibilityCell.id] ?? []
      return projectGlobalShowClipSummary(
        show,
        compatibilityCell.id,
        Object.fromEntries(compatibilityControls.map((control) => [control.exportName, control.label])),
      )
    }
    return projectCompositionShowClipSummary(
      compositionShow.composition,
      clip,
      Object.fromEntries(patternControls.map((control) => [control.exportName, control.label])),
    )
  }
  // Authored-v2 Clip detail. The same entity detail component the v1 branches
  // use, given presented values read from the authored record (#1065).
  if (presentationV2 && (selection.kind === 'clip' || selection.kind === 'group-clip')) {
    const presented = selection.kind === 'clip'
      ? presentationV2.clipsById[selection.clipId]
      : presentationV2.groupsByOccurrenceId[selection.occurrenceId]?.clipsById[selection.placementId]
    if (presented) {
      const patternControls = patternControlsByInstanceId[presented.value.effectiveInstanceId] ?? []
      const controlLabels = Object.fromEntries(patternControls.map((control) => [control.exportName, control.label]))
      return (
        <CompositionClipInspector
          key={selection.kind === 'clip'
            ? `clip:${selection.clipId}`
            : `group-clip:${selection.occurrenceId}:${selection.placementId}`}
          value={presented.value}
          replacementCapture={replacementCaptureV2}
          replacementTarget={selection.kind === 'clip'
            ? { kind: 'clip', clipId: selection.clipId }
            : (() => {
                const definitionId = recordV2?.composition.groupOccurrences.find(occurrence => occurrence.id === selection.occurrenceId)?.definitionId
                return definitionId ? { kind: 'group' as const, definitionId, clipId: selection.placementId } : undefined
              })()}
          preparedCaptureV2={preparedCaptureV2}
          panelKey={panelKey}
          patternOptions={patternOptions}
          patternControls={patternControls}
          summary={projectResolvedShowClipSummary(
            showEditorClipSummaryFactsV2(presented.value),
            controlLabels,
            {
              instanceId: presented.value.instanceId,
              tracks: presented.animation.tracks.map((track) => track.editor),
            },
          )}
          transformEnabled={transformEnabled}
          stageDimensions={stageDimensions}
          instanceOwnership={recordV2
            ? projectShowEditorClipInstanceOwnershipV2(recordV2, presented.value.effectiveInstanceId)
            : null}
          propertyAnimationContext={{
            tracks: presented.animation.tracks.map((track) => track.editor),
            trackIssues: {},
            storageDurationMs: presented.animation.storageDurationMs,
            showTimeOffsetMs: presented.animation.showTimeOffsetMs,
            instanceUseCount: presented.animation.instanceUseCount,
          }}
          // Clip inspector writes reach the landed appearance,
          // instance-properties, entry-policy and replacement admissions
          // through the v2 inspector commit, one patch to at most one intent
          // (#1066 slices 3-4), and Property animation writes reach the
          // property admission through the v2 animation commit (slice 10;
          // Group-child writes through the definition owner, #1075 G3).
          // A Group Clip Start/Duration write reaches the definition-timing
          // owner through the group-occurrence door, and appearance and
          // instance values reach the definition through the same door
          // (#1075 G2b); a Pattern change reaches the definition through
          // the Group replacement door (#1075 G2c). The v2
          // selection carries the occurrence plus the definition-local Clip id
          // (group-clip occurrenceId/placementId, the same encoding
          // onEnterGroupIsolation selects), and the presented Start is Show
          // time (globalStartMs via occurrenceBoundaryAfter), so the planner
          // inverts it back to local.
          onPatch={selection.kind === 'clip'
            ? (patch) => onUpdateClipInspectorV2?.(selection.clipId, patch) ?? false
            : (patch) => {
              if (selection.kind !== 'group-clip') return false
              if (Object.keys(patch).length === 1 && patch.pattern !== undefined) {
                if (!onUpdateGroupClipPatternV2) return false
                return onUpdateGroupClipPatternV2(selection.occurrenceId, selection.placementId, patch.pattern.ref) ?? false
              }
              const hasTiming = patch.local?.startMs !== undefined || patch.local?.durationMs !== undefined
              if (hasTiming) {
                if (Object.keys(patch).length !== 1 || !patch.local) return false
                const localKeys = Object.keys(patch.local)
                const hasStart = patch.local.startMs !== undefined
                const hasDuration = patch.local.durationMs !== undefined
                if (!hasStart && !hasDuration) return false
                if (!localKeys.every(key => key === 'startMs' || key === 'durationMs')) return false
                if (!onV2GroupOccurrenceRequest) return false
                return onV2GroupOccurrenceRequest({
                  kind: 'set-child-timing',
                  occurrenceId: selection.occurrenceId,
                  clipId: selection.placementId,
                  ...(hasStart ? { startMs: patch.local.startMs! } : {}),
                  ...(hasDuration ? { durationMs: patch.local.durationMs! } : {}),
                }) ?? false
              }
              if (!onV2GroupOccurrenceRequest) return false
              return onV2GroupOccurrenceRequest({
                kind: 'set-child-inspector-patch',
                occurrenceId: selection.occurrenceId,
                clipId: selection.placementId,
                patch,
              }) ?? false
            }}
          onPropertyAnimationChange={selection.kind === 'clip'
            ? (change) => onPropertyAnimationChangeV2?.(
              selection.clipId,
              {
                showTimeOffsetMs: presented.animation.showTimeOffsetMs,
                storageDurationMs: presented.animation.storageDurationMs,
              },
              change,
            ) ?? false
            : (change) => {
              if (selection.kind !== 'group-clip') return false
              return onGroupPropertyAnimationChangeV2?.(selection.occurrenceId, selection.placementId, change) ?? false
            }}
          onPreviewPatch={() => {}}
          onPreviewEnd={onPreviewEnd}
          onPatternCommit={onPatternCommit}
          // A Group Clip use reports its shared runtime without offering a
          // refused write, exactly as v1 passes instanceOwnership={null} for
          // Group Clips and never renders the buttons (#1090).
          {...(selection.kind === 'clip'
            ? {
                onMakePatternIndependent: () => onMakePatternIndependentV2?.(selection.clipId),
                onRejoinPattern: (targetInstanceId: string) => onRejoinPatternV2?.(selection.clipId, targetInstanceId),
              }
            : {
                onMakePatternIndependent: () => {},
                onRejoinPattern: () => {},
              })}
          // v1 offers Delete on an ordinary Clip's inspector and none on a
          // Group child's, so the v2 branch matches per selection. The control
          // keeps v1's markup and enabled state; the write reaches the
          // clip-delete admission (#1066).
          {...(selection.kind === 'clip'
            ? { canRemove: canRemoveClipV2, onRemove: () => onRemoveClipV2?.(selection.clipId) }
            : {})}
        />
      )
    }
  }

  if (compositionShow && selection.kind === 'group-clip' && selectedGroupClipOwner) {
    const value = projectShowGroupClipInspector(compositionShow, selectedGroupClipOwner)
    if (value) {
      const propertyAnimationContext = projectShowPropertyAnimationEditorContext(
        compositionShow,
        value,
        selectedGroupClipOwner,
      )
      const patternControls = value.instanceId
        ? patternControlsByInstanceId[`${selectedGroupClipOwner.occurrenceId}:${value.instanceId}`] ?? []
        : []
      return (
        <CompositionClipInspector
          key={`group-clip:${selectedGroupClipOwner.occurrenceId}:${selectedGroupClipOwner.placementId}`}
          value={value}
          panelKey={panelKey}
          patternOptions={patternOptions}
          patternControls={patternControls}
          summary={compositionClipSummary(
            `${selectedGroupClipOwner.occurrenceId}:${selectedGroupClipOwner.placementId}`,
            patternControls,
          )}
          transformEnabled={transformEnabled}
          stageDimensions={stageDimensions}
          instanceOwnership={null}
          propertyAnimationContext={propertyAnimationContext}
          onPropertyAnimationChange={propertyAnimationContext
            ? (change) => onPropertyAnimationChange(propertyAnimationContext.storageOwner, change)
            : undefined}
          onPatch={(patch) => onUpdateGroupClipInspector(selectedGroupClipOwner, patch)}
          onPreviewPatch={(patch) => onPreviewGroupClipInspector(selectedGroupClipOwner, patch)}
          onPreviewEnd={onPreviewEnd}
          onPatternCommit={onPatternCommit}
          onMakePatternIndependent={() => {}}
          onRejoinPattern={() => {}}
        />
      )
    }
  }

  if (presentationV2 && selection.kind === 'group') {
    const group = presentationV2.groupsByOccurrenceId[selection.occurrenceId]
    if (group) {
      return (
        <GroupInspector
          value={{
            name: group.name,
            clipCount: group.clipCount,
            layerCount: group.layerCount,
            startMs: group.startMs,
            baseLayer: group.baseLayer,
            translationX: group.translationX,
            translationY: group.translationY,
          }}
          linkedOccurrenceCount={group.linkedOccurrenceCount}
          // Translate, Place and Delete reach the v2 occurrence owners through the same door as Duplicate (#1075 G1).
          onDuplicate={() => {
            if (!onV2GroupOccurrenceRequest) return
            const occurrence = recordV2?.composition.groupOccurrences.find((candidate) => candidate.id === selection.occurrenceId)
            const definition = recordV2?.composition.groupDefinitions.find((candidate) => candidate.id === occurrence?.definitionId)
            if (!occurrence || !definition) return
            onV2GroupOccurrenceRequest({
              kind: 'duplicate-occurrence',
              occurrenceId: occurrence.id,
              placement: {
                startMs: occurrence.startMs + groupOccurrenceDuration(definition, occurrence),
                zoneId: occurrence.zoneId,
                layerBindings: structuredClone(occurrence.layerBindings),
                translationX: occurrence.translationX,
                translationY: occurrence.translationY,
              },
            })
          }}
          onMakeUnique={() => onV2GroupOccurrenceRequest?.({ kind: 'make-unique', occurrenceId: selection.occurrenceId })}
          onTranslate={(translationX, translationY) => {
            if (!onV2GroupOccurrenceRequest) return
            const occurrence = recordV2?.composition.groupOccurrences.find((candidate) => candidate.id === selection.occurrenceId)
            const definition = recordV2?.composition.groupDefinitions.find((candidate) => candidate.id === occurrence?.definitionId)
            if (!occurrence || !definition) return
            onV2GroupOccurrenceRequest({
              kind: 'move-occurrence',
              occurrenceId: occurrence.id,
              placement: {
                startMs: occurrence.startMs,
                zoneId: occurrence.zoneId,
                layerBindings: structuredClone(occurrence.layerBindings),
                translationX,
                translationY,
              },
            })
          }}
          onPlace={(patch) => {
            if (!onV2GroupOccurrenceRequest) return
            const occurrence = recordV2?.composition.groupOccurrences.find((candidate) => candidate.id === selection.occurrenceId)
            const definition = recordV2?.composition.groupDefinitions.find((candidate) => candidate.id === occurrence?.definitionId)
            if (!occurrence || !definition || !recordV2) return
            let startMs = occurrence.startMs
            let layerBindings = structuredClone(occurrence.layerBindings)
            if (patch.startMs !== undefined) startMs = patch.startMs
            if (patch.baseLayer !== undefined) {
              const baseLayer = patch.baseLayer
              const rebound: typeof layerBindings = []
              for (const layer of definition.layers) {
                const target = recordV2.composition.layers.find((candidate) => candidate.zoneId === occurrence.zoneId && candidate.rank === baseLayer + layer.rank)
                if (!target) return
                rebound.push({ definitionLayerId: layer.id, layerId: target.id })
              }
              layerBindings = rebound
            }
            onV2GroupOccurrenceRequest({
              kind: 'move-occurrence',
              occurrenceId: occurrence.id,
              placement: {
                startMs,
                zoneId: occurrence.zoneId,
                layerBindings,
                translationX: occurrence.translationX,
                translationY: occurrence.translationY,
              },
            })
          }}
          onDelete={() => onDeleteGroup(selection.occurrenceId)}
          onUngroup={() => onV2GroupOccurrenceRequest?.({ kind: 'ungroup-occurrence', occurrenceId: selection.occurrenceId })}
        />
      )
    }
  }

  if (show && selection.kind === 'group') {
    const occurrence = show.composition?.groupOccurrences?.find((candidate) => candidate.id === selection.occurrenceId)
    const definition = show.composition?.groupDefinitions?.find((candidate) => candidate.id === occurrence?.definitionId)
    if (occurrence && definition) {
      const linkedOccurrenceCount = show.composition?.groupOccurrences
        ?.filter((candidate) => candidate.definitionId === definition.id).length ?? 1
      return (
        <GroupInspector
          value={{
            name: definition.name,
            clipCount: definition.placements.length,
            layerCount: new Set(definition.placements.map((placement) => placement.layerOffset)).size,
            startMs: occurrence.startMs,
            baseLayer: occurrence.baseLayer,
            translationX: occurrence.translationX,
            translationY: occurrence.translationY,
          }}
          linkedOccurrenceCount={linkedOccurrenceCount}
          onDuplicate={() => onDuplicateGroup(occurrence.id)}
          onMakeUnique={() => onMakeGroupUnique(occurrence.id)}
          onTranslate={(translationX, translationY) => onTranslateGroup(occurrence.id, translationX, translationY)}
          onPlace={(patch) => onUpdateGroupPlacement(occurrence.id, patch)}
          onDelete={() => onDeleteGroup(occurrence.id)}
          onUngroup={() => onUngroup(occurrence.id)}
        />
      )
    }
  }

  if (compositionShow && selection.kind === 'clip' && selectedCompositionClipOwner) {
    const value = projectShowClipInspector(compositionShow, selectedCompositionClipOwner)
    const timelineOwner = showTimelineOwnerForInspector(selectedCompositionClipOwner)
    const instanceOwnership = compositionShow.composition && timelineOwner
      ? projectShowClipPatternInstanceOwnership(compositionShow.composition, timelineOwner)
      : null
    if (value && selectedCompositionClipOwner.kind !== 'global') {
      const propertyAnimationContext = projectShowPropertyAnimationEditorContext(compositionShow, value)
      const patternControls = value.instanceId ? patternControlsByInstanceId[value.instanceId] ?? [] : []
      return (
        <CompositionClipInspector
          key={`clip:${selection.clipId}`}
          value={value}
          panelKey={panelKey}
          patternOptions={patternOptions}
          patternControls={patternControls}
          summary={compositionClipSummary(selection.clipId, patternControls)}
          transformEnabled={transformEnabled}
          stageDimensions={stageDimensions}
          instanceOwnership={instanceOwnership}
          propertyAnimationContext={propertyAnimationContext}
          onPatch={(patch) => onUpdateClipInspector(selectedCompositionClipOwner, patch)}
          onPropertyAnimationChange={propertyAnimationContext
            ? (change) => onPropertyAnimationChange(propertyAnimationContext.storageOwner, change)
            : undefined}
          onPreviewPatch={(patch) => onPreviewClipInspector(selectedCompositionClipOwner, patch)}
          onPreviewEnd={onPreviewEnd}
          onPatternCommit={onPatternCommit}
          onMakePatternIndependent={() => onMakeCompositionPatternIndependent(selectedCompositionClipOwner)}
          onRejoinPattern={(targetInstanceId) => onRejoinCompositionPattern(selectedCompositionClipOwner, targetInstanceId)}
          canRemove={canRemoveClip}
          onRemove={() => onRemoveCompositionClip(selectedCompositionClipOwner)}
        />
      )
    }
  }

  if (show && selection.kind === 'clip' && selectedClip) {
    return (
      <ClipInspector
        panelKey={panelKey}
        key={selectedClip.id}
        show={show}
        clip={selectedClip}
        patternOptions={patternOptions}
        patternControls={patternControlsByCellId[selectedClip.id] ?? []}
        transformEnabled={transformEnabled}
        stageDimensions={stageDimensions}
        canRemove={canRemoveClip}
        onUpdateClip={(patch) => onUpdateClipInspector({ kind: 'global', cellId: selectedClip.id }, patch)}
        onPreviewClip={(patch) => onPreviewClipInspector({ kind: 'global', cellId: selectedClip.id }, patch)}
        onPreviewEnd={onPreviewEnd}
        onPatternCommit={onPatternCommit}
        onRemove={() => onRemoveClip(selectedClip)}
        onUpdateAdaptations={(changes) => onUpdateAdaptations(selectedClip, changes)}
        onUpdateRestartOnEntry={(restartOnEntry) => onUpdateRestartOnEntry(selectedClip, restartOnEntry)}
        onSpanZones={(zoneSpan) => onSpanZones(selectedClip, zoneSpan)}
        onUpdateZoneMode={(zoneMode) => onUpdateCellZoneMode(selectedClip, zoneMode)}
      />
    )
  }

  if (show && selection.kind === 'transition') {
    return (
      <TransitionInspector
        show={show}
        transitionId={selection.transitionId}
        stageDimensions={stageDimensions}
        onUpdate={onUpdateBoundaryTransition}
        onOpenPalette={() => onOpenTransitions(selection.transitionId)}
        onRemove={onRemoveBoundaryTransition}
        onUpdateCellAdaptations={onUpdateAdaptations}
        patternControlsByCellId={patternControlsByCellId}
        onUpdateControlTarget={onUpdateControlTarget}
      />
    )
  }

  if (presentationV2 && selection.kind === 'zone') {
    const presentedZone = presentationV2.zonesById[selection.zoneId]
    if (presentedZone) {
      return (
        <ZoneInspector
          context={{
            outputContract: presentationV2.show.outputContract,
            zoneCount: presentationV2.show.zoneCount,
            binding: {
              source: presentedZone.pixelCount.source,
              pixelCount: presentedZone.pixelCount.value,
            },
          }}
          zone={presentedZone.zone}
          spatialSelectionUnavailableReason={spatialSelectionUnavailableReason}
          onOpenSpatialSelection={() => onOpenSpatialSelection(presentedZone.id)}
          // Zone writes reach the v2 backing through the Zone owner (#1066 slice 7).
          onUpdateZone={(changes) => onUpdateZone(presentedZone.id, changes)}
          onRemoveZone={() => onRemoveZone(presentedZone.id)}
        />
      )
    }
  }

  if (show && selection.kind === 'zone') {
    const zone = show.zones.find((candidate) => candidate.id === selection.zoneId)
    if (zone) {
      const authored = resolveShowZonePixelCount(show, zone.id)
      return (
        <ZoneInspector
          context={{
            outputContract: show.outputContract,
            zoneCount: show.zones.length,
            binding: authored ? { source: authored.source, pixelCount: authored.pixelCount } : null,
          }}
          zone={zone}
          spatialSelectionUnavailableReason={spatialSelectionUnavailableReason}
          onOpenSpatialSelection={() => onOpenSpatialSelection(zone.id)}
          onUpdateZone={(changes) => onUpdateZone(zone.id, changes)}
          onRemoveZone={() => onRemoveZone(zone.id)}
        />
      )
    }
  }

  if (presentationV2 && selection.kind === 'zone-layout') {
    const presentedLayout = presentationV2.zoneLayoutsById[selection.layoutId]
    if (presentedLayout) {
      return (
        <ZoneLayoutInspector
          context={{
            outputContract: presentationV2.show.outputContract,
            zones: Object.values(presentationV2.zonesById).map((entry) => (
              { id: entry.zone.id, name: entry.zone.name }
            )),
            layoutCount: Object.keys(presentationV2.zoneLayoutsById).length,
          }}
          layout={presentedLayout.definition}
          intervals={Object.values(presentationV2.layoutOccurrencesById).map((entry) => ({
            id: entry.id,
            layoutId: entry.definitionId,
            startMs: entry.occurrence.startMs,
            endMs: entry.occurrence.startMs + entry.occurrence.durationMs,
          }))}
          selectedIntervalId={selection.intervalId}
          // Zone Layout occurrence writes reach the v2 backing through the occurrence owner (#1066 slice 8a).
          onAddRoutingLayout={onAddRoutingLayout}
          onUpdateRoutingLayout={onUpdateRoutingLayout}
          onRemoveRoutingLayout={onRemoveRoutingLayout}
          onMakeIntervalUnique={onMakeLayoutIntervalUnique}
        />
      )
    }
  }

  if (show && selection.kind === 'zone-layout') {
    const layout = show.routingLayouts.find((candidate) => candidate.id === selection.layoutId)
    if (layout) {
      return (
        <ZoneLayoutInspector
          context={{
            outputContract: show.outputContract,
            zones: show.zones,
            layoutCount: show.routingLayouts.length,
          }}
          layout={layout}
          intervals={projectShowLayoutIntervals(show)}
          selectedIntervalId={selection.intervalId}
          onAddRoutingLayout={onAddRoutingLayout}
          onUpdateRoutingLayout={onUpdateRoutingLayout}
          onRemoveRoutingLayout={onRemoveRoutingLayout}
          onMakeIntervalUnique={onMakeLayoutIntervalUnique}
        />
      )
    }
  }

  if (presentationV2 && selection.kind === 'transition') {
    // A Layout occurrence's incoming transfer IS v1's routing Transition: same
    // destination Layout, duration, easing and direction, and the same panel.
    const transfer = routingTransfersV2?.[selection.transitionId]
    if (transfer) {
      return (
        <RoutingTransferInspector
          value={{
            boundaryIdentity: transfer.boundaryIdentity,
            layoutId: transfer.layoutId,
            durationMs: transfer.durationMs,
            easing: transfer.easing,
            direction: transfer.direction,
            directionAuthored: transfer.directionAuthored,
            maxDurationMs: transfer.maxDurationMs,
            layoutOptions: transfer.layoutOptions,
          }}
          onUpdate={(changes) => onUpdateRoutingTransferV2?.(transfer.occurrenceId, changes)}
          onRemove={() => onRemoveRoutingTransferV2?.(transfer.occurrenceId)}
        />
      )
    }
    // Conversion provenance decides which of v1's two Transition surfaces owns
    // this junction. Only the boundary family draws here; a Layer Transition
    // keeps v1's junction popover, which the timeline opens directly (#1065).
    const boundary = boundaryTransitionsV2?.[selection.transitionId]
    if (boundary) {
      return (
        <BoundaryTransitionInspector
          value={boundary}
          stageDimensions={stageDimensions}
          // A v2 side names its Pattern instance, which is what automatable
          // control metadata is keyed by on this backing.
          patternControlsBySourceId={patternControlsByInstanceId}
          // Boundary Transition settings writes (#1066 slice 5a) and Remove
          // (slice 5d) are connected; preview and the destination rows are
          // not. Every unconnected control stays enabled and reachable; each
          // one resolves as an internal no-change result before any owner.
          onUpdate={(transitionId, changes) => onUpdateBoundaryTransitionV2?.(transitionId, changes)}
          onPreviewSettings={() => {}}
          onPreviewEnd={() => {}}
          onOpenPalette={() => onOpenTransitions(selection.transitionId)}
          onRemove={(transitionId) => onRemoveBoundaryTransitionV2?.(transitionId)}
          onUpdateDestinationAdaptations={() => {}}
          onUpdateDestinationControlTarget={() => {}}
        />
      )
    }
  }

  // A v2 Transition the two surfaces above do not claim draws nothing rather
  // than falling through to the Show panel (#1065).
  if (presentationV2) {
    if (selection.kind === 'transition') return null
    return (
      <ShowSetupInspector
        value={{
          name: presentationV2.show.name,
          zoneCount: presentationV2.show.zoneCount,
          nominalPixelCount: presentationV2.show.nominalPixelCount,
          outputContract: presentationV2.show.outputContract,
          stageMapId: presentationV2.show.stageMapId,
          targetControllerProfileId: presentationV2.show.targetControllerProfileId,
          outputEffects: presentationV2.show.outputEffects,
          loopDurationMs: presentationV2.show.showEndMs,
          installationCoverage: presentationV2.show.installationCoverage,
        }}
        controllerProfiles={controllerProfiles}
        userMaps={userMaps}
        // Show-setup writes reach the landed set-show-end and show-metadata
        // admissions through the same v2-aware handlers as the timeline; only
        // Target controller stays unconnected (no landed door, #1066 slice 6).
        onUpdateTargetProfile={onUpdateTargetProfile}
        onUpdatePortableReference={onUpdatePortableReference}
        onUpdateOutputTrails={onUpdateOutputTrails}
        compiledOutputEffects={compiledOutputEffects}
      />
    )
  }
  if (!show) return null
  return (
    <ShowSetupInspector
      value={{
        name: show.name,
        zoneCount: show.zones.length,
        nominalPixelCount: show.zones.reduce((sum, zone) => sum + zone.nominalPixelCount, 0),
        outputContract: show.outputContract,
        stageMapId: show.stageMapId,
        targetControllerProfileId: show.targetControllerProfileId,
        outputEffects: show.outputEffects,
        loopDurationMs: showLoopDurationMs(show),
        installationCoverage: validateInstallationCoverage(show),
      }}
      controllerProfiles={controllerProfiles}
      userMaps={userMaps}
      onUpdateTargetProfile={onUpdateTargetProfile}
      onUpdatePortableReference={onUpdatePortableReference}
      onUpdateOutputTrails={onUpdateOutputTrails}
      compiledOutputEffects={compiledOutputEffects}
    />
  )
}

function showTimelineOwnerForInspector(owner: ShowClipInspectorOwner): ShowTimelineClipOwner | null {
  if (owner.kind === 'scene-main') {
    return {
      kind: 'main',
      sceneId: owner.sceneId,
      zoneId: owner.zoneId,
      placementId: owner.placementId,
    }
  }
  if (owner.kind === 'scene-overlay') {
    return {
      kind: 'overlay',
      sceneId: owner.sceneId,
      zoneId: owner.zoneId,
      layerId: owner.layerId,
      placementId: owner.placementId,
    }
  }
  return null
}

function availableClipSummaryDestination(
  section: ShowClipSummarySection,
  item: ShowClipSummaryItem,
  {
    transformEnabled,
    patternControls,
    stutterAvailable,
    opacityAvailable,
  }: {
    transformEnabled: boolean
    patternControls: AutomatablePatternControl[]
    stutterAvailable: boolean
    opacityAvailable: boolean
  },
): ShowClipSummaryDestination | null {
  const destination = showClipSummaryDestination(section.kind, item.id)
  if (!destination) return null
  if (destination.location === 'place' && !transformEnabled) return null
  if (destination.targetKey === 'opacity' && !opacityAvailable) return null
  if (destination.targetKey === 'stutter' && !stutterAvailable) return null
  if (destination.targetKey.startsWith('control:')) {
    const exportName = destination.targetKey.slice('control:'.length)
    if (!patternControls.some((control) => control.exportName === exportName)) return null
  }
  return destination
}

/** The Group facts the existing Group inspector draws. */
interface ShowGroupInspectorValue {
  name: string
  clipCount: number
  layerCount: number
  startMs: number
  baseLayer: number
  translationX: number
  translationY: number
}

function GroupInspector({
  value,
  linkedOccurrenceCount,
  onDuplicate,
  onMakeUnique,
  onTranslate,
  onPlace,
  onDelete,
  onUngroup,
}: {
  value: ShowGroupInspectorValue
  linkedOccurrenceCount: number
  onDuplicate: () => void
  onMakeUnique: () => void
  onTranslate: (translationX: number, translationY: number) => void
  onPlace: (patch: { startMs?: number; baseLayer?: number }) => void
  onDelete: () => void
  onUngroup: () => void
}) {
  return (
    <InspectorPanel
      family="Group"
      heading={value.name}
      headingMeta={linkedOccurrenceCount > 1 ? `${linkedOccurrenceCount} linked occurrences` : 'One occurrence'}
      title={`${value.clipCount} Clips across ${value.layerCount} Layers`}
      icon={<Layers3 size={13} aria-hidden />}
      actions={(
        <Button size="icon-xs" variant="ghost" aria-label={`Delete Group ${value.name}`} className="text-zinc-500 hover:bg-red-950/30 hover:text-red-300" onClick={onDelete}>
          <Trash2 size={12} aria-hidden />
        </Button>
      )}
    >
      <div className="grid gap-2 sm:grid-cols-4">
        <TimeField
          label="Start seconds"
          value={value.startMs / 1_000}
          min={0}
          max={Number.MAX_SAFE_INTEGER}
          step={0.001}
          onChange={(startSeconds) => onPlace({ startMs: Math.round(startSeconds * 1_000) })}
        />
        <NumberField
          label="Base Layer"
          value={value.baseLayer}
          min={0}
          step={1}
          onChange={(baseLayer) => onPlace({ baseLayer: Math.round(baseLayer) })}
        />
        <NumberField
          label="X offset"
          value={value.translationX}
          step={0.01}
          onChange={(translationX) => onTranslate(translationX, value.translationY)}
        />
        <NumberField
          label="Y offset"
          value={value.translationY}
          step={0.01}
          onChange={(translationY) => onTranslate(value.translationX, translationY)}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-zinc-800/80 pt-2">
        <Button size="xs" variant="ghost" aria-label="Duplicate Group occurrence" onClick={onDuplicate}>
          <Copy size={12} aria-hidden /> Duplicate
        </Button>
        <Button size="xs" variant="ghost" aria-label="Make Group unique" disabled={linkedOccurrenceCount < 2} onClick={onMakeUnique}>
          <WandSparkles size={12} aria-hidden /> Make Unique
        </Button>
        <Button size="xs" variant="ghost" aria-label="Ungroup occurrence" onClick={onUngroup}>
          <Layers3 size={12} aria-hidden /> Ungroup
        </Button>
      </div>
    </InspectorPanel>
  )
}

function CompositionClipInspector({
  value,
  panelKey,
  patternOptions,
  replacementCapture,
  replacementTarget,
  patternControls,
  summary,
  transformEnabled,
  stageDimensions,
  instanceOwnership,
  preparedCaptureV2,
  onPatch,
  propertyAnimationContext,
  onPropertyAnimationChange,
  onPreviewPatch,
  onPreviewEnd,
  onPatternCommit,
  onMakePatternIndependent,
  onRejoinPattern,
  canRemove = true,
  onRemove,
}: {
  value: NonNullable<ReturnType<typeof projectShowClipInspector>> | ShowEditorClipValueV2
  panelKey: string
  patternOptions: ShowPatternOption[]
  replacementCapture?: ShowV2PilotPreparedCapture | null
  replacementTarget?: { kind: 'clip'; clipId: string } | { kind: 'group'; definitionId: string; clipId: string }
  patternControls: AutomatablePatternControl[]
  summary: ShowClipSummarySection[]
  transformEnabled: boolean
  stageDimensions: 1 | 2 | 3
  instanceOwnership: ReturnType<typeof projectShowClipPatternInstanceOwnership>
  preparedCaptureV2?: ShowPreparedStageEditCaptureV2 | null
  onPatch: (patch: ShowClipInspectorPatch) => boolean | void | Promise<void>
  propertyAnimationContext?: Omit<ShowPropertyAnimationEditorContext, 'storageOwner'> | ShowPropertyAnimationEditorContext | null
  onPropertyAnimationChange?: (change: ShowPropertyAnimationChange) => boolean | void
  onPreviewPatch?: (patch: ShowClipInspectorPatch) => void
  onPreviewEnd?: () => void
  onPatternCommit: () => void
  onMakePatternIndependent: () => void
  onRejoinPattern: (targetInstanceId: string) => void
  canRemove?: boolean
  onRemove?: () => void
}) {
  const [animationOverviewOpen, setAnimationOverviewOpen] = useState(false)
  const [patternPickerOpen, setPatternPickerOpen] = useState(false)
  const [replacementCostCache, setReplacementCostCache] = useState<{
    capture: ShowV2PilotPreparedCapture
    targetKey: string
    options: PatternComboboxOption[]
  } | null>(null)
  const targetKey = replacementTarget?.kind === 'group'
    ? `group:${replacementTarget.definitionId}:${replacementTarget.clipId}`
    : replacementTarget ? `clip:${replacementTarget.clipId}` : null
  const plainPickerOptions = patternOptions.map((option) => ({
    value: `${option.ref.kind}:${option.ref.id}`,
    label: option.label,
    group: option.group,
  }))
  const pickerOptions = patternPickerOpen && replacementCostCache && replacementCostCache.capture === replacementCapture
    && replacementCostCache.targetKey === targetKey ? replacementCostCache.options : plainPickerOptions
  const onPatternPickerOpenChange = (open: boolean) => {
    setPatternPickerOpen(open)
    if (!open || !replacementCapture || !replacementTarget || !targetKey
      || (replacementCostCache?.capture === replacementCapture && replacementCostCache.targetKey === targetKey)) return
    const options = patternOptions.map((option) => {
      const plain = { value: `${option.ref.kind}:${option.ref.id}`, label: option.label, group: option.group }
      if (option.ref.kind === value.pattern.kind && option.ref.id === value.pattern.id) return plain
      const preview = replacementTarget.kind === 'clip'
        ? previewShowV2ClipReplacement(replacementCapture, replacementTarget.clipId, option.ref)
        : previewShowV2GroupReplacement(replacementCapture, replacementTarget.definitionId, replacementTarget.clipId, option.ref)
      return preview.status === 'ready'
        ? { ...plain, detail: describePatternReplacementCost(preview.lostControls) }
        : plain
    })
    setReplacementCostCache({ capture: replacementCapture, targetKey, options })
  }
  const animationSummaryRef = useRef<HTMLButtonElement>(null)
  const clipDetailRef = useRef<ShowClipEntityDetailHandle>(null)
  const animationCount = propertyAnimationContext?.tracks.length ?? 0
  const v2ClipId = value.owner.kind === 'clip' ? value.owner.clipId : null
  const restartAvailability = useMemo(() => {
    if (!preparedCaptureV2 || !v2ClipId) return { available: true } as const
    return showV2ClipRestartAvailabilityV2(preparedCaptureV2, v2ClipId)
  }, [preparedCaptureV2, v2ClipId])
  const restartUnavailableReason = restartAvailability.available ? undefined : "This Pattern's state can't be reset."
  const closeAnimationOverview = (restoreSummaryFocus: boolean) => {
    setAnimationOverviewOpen(false)
    if (restoreSummaryFocus) {
      window.setTimeout(() => animationSummaryRef.current?.focus(), 0)
    }
  }
  const inspector = (
    <InspectorPanel
      family="Clip"
      heading={value.patternName}
      summary={(
        <ClipConfigurationSummary
          summary={summary}
          animationCount={animationCount}
          animationButtonRef={animationSummaryRef}
          onAnimationsClick={() => setAnimationOverviewOpen(true)}
          destinationForItem={(section, item) => availableClipSummaryDestination(section, item, {
            transformEnabled,
            patternControls,
            stutterAvailable: instanceOwnership !== null,
            opacityAvailable: value.local?.opacity !== undefined,
          })}
          onNavigate={(destination) => clipDetailRef.current?.navigateToSummaryDestination(destination)}
        />
      )}
      icon={<Grid2X2 size={13} aria-hidden />}
      actions={onRemove ? (
        <span className="inline-flex">
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={`Delete clip ${value.patternName}`}
            title={canRemove ? `Delete ${value.patternName}` : undefined}
            aria-disabled={!canRemove || undefined}
            aria-describedby={canRemove ? undefined : 'composition-clip-delete-reason'}
            className="text-zinc-500 hover:bg-red-950/30 hover:text-red-300 aria-disabled:opacity-50"
            onClick={() => { if (canRemove) onRemove() }}
          >
            <Trash2 size={12} aria-hidden />
          </Button>
          {!canRemove && (
            <DisabledReasonTip id="composition-clip-delete-reason">A Show must contain at least one Clip.</DisabledReasonTip>
          )}
        </span>
      ) : undefined}
    >
      <ShowClipEntityDetail
        ref={clipDetailRef}
        value={value}
        title={value.patternName}
        readOnly={false}
        restartUnavailableReason={restartUnavailableReason}
        patternOptions={pickerOptions}
        onPatternPickerOpenChange={replacementCapture ? onPatternPickerOpenChange : undefined}
        patternControls={patternControls}
        transformEnabled={transformEnabled}
        stageDimensions={stageDimensions}
        panelKey={panelKey}
        structuralControls={instanceOwnership ? (
          <ShowPatternInstanceControls
            ownership={instanceOwnership}
            steppedClock={value.simulation.steppedClock}
            onMakeIndependent={onMakePatternIndependent}
            onRejoin={onRejoinPattern}
            onSteppedClockChange={(steppedClock) => onPatch({ simulation: { steppedClock } })}
          />
        ) : undefined}
        embedded
        onPatch={onPatch}
        onPreviewPatch={onPreviewPatch}
        onPreviewEnd={onPreviewEnd}
        onPatternCommit={onPatternCommit}
        animationOverviewOpen={animationOverviewOpen}
        onAnimationOverviewClose={closeAnimationOverview}
      />
    </InspectorPanel>
  )
  if (!onPropertyAnimationChange || !propertyAnimationContext) return inspector
  const changePropertyAnimation = (change: ShowPropertyAnimationChange) => {
    const accepted = onPropertyAnimationChange(change)
    if (accepted !== false && change.kind === 'delete-track' && animationCount === 1) {
      setAnimationOverviewOpen(false)
    }
    return accepted
  }
  return (
    <ShowPropertyAnimationProvider
      options={buildShowPropertyAnimationOptions(value, patternControls)}
      tracks={propertyAnimationContext.tracks}
      trackIssues={propertyAnimationContext.trackIssues}
      storageDurationMs={propertyAnimationContext.storageDurationMs}
      showTimeOffsetMs={propertyAnimationContext.showTimeOffsetMs}
      instanceUseCount={propertyAnimationContext.instanceUseCount}
      onOpenOverview={() => setAnimationOverviewOpen(true)}
      onChange={changePropertyAnimation}
    >
      {inspector}
    </ShowPropertyAnimationProvider>
  )
}

function ClipInspector({
  show,
  panelKey,
  clip,
  patternOptions,
  patternControls,
  transformEnabled,
  stageDimensions,
  canRemove,
  onUpdateClip,
  onPreviewClip,
  onPreviewEnd,
  onPatternCommit,
  onRemove,
  onUpdateAdaptations,
  onUpdateRestartOnEntry,
  onSpanZones,
  onUpdateZoneMode,
}: {
  show: ShowRecord
  panelKey: string
  clip: ShowCell
  patternOptions: ShowPatternOption[]
  patternControls: AutomatablePatternControl[]
  transformEnabled: boolean
  stageDimensions: 1 | 2 | 3
  canRemove: boolean
  onUpdateClip: (patch: ShowClipInspectorPatch) => boolean | void | Promise<void>
  onPreviewClip?: (patch: ShowClipInspectorPatch) => void
  onPreviewEnd?: () => void
  onPatternCommit: () => void
  onRemove: () => void
  onUpdateAdaptations: (changes: Partial<ShowCell['adaptations']>) => void
  onUpdateRestartOnEntry: (restartOnEntry: boolean) => void
  onSpanZones: (zoneSpan: number) => void
  onUpdateZoneMode: (zoneMode: NonNullable<ShowCell['zoneMode']>) => void
}) {
  const cell = clip
  const clipDetailRef = useRef<ShowClipEntityDetailHandle>(null)
  const sceneIndex = show.scenes.findIndex((scene) => scene.id === cell.sceneId)
  const zoneIndex = show.zones.findIndex((zone) => zone.id === cell.zoneId)
  const maxZoneSpan = Math.max(1, show.zones.length - zoneIndex)
  const lightShutter = cell.adaptations.lightShutter
  const hasAdvancedOverrides = cell.adaptations.mirror
    || cell.sceneSpan > 1
    || (cell.zoneSpan ?? 1) > 1
    || cell.zoneMode === 'repeat'
    || cell.adaptations.phase !== 0
    || Boolean(cell.restartOnEntry)
    || cell.adaptations.steppedClock !== undefined
    || (cell.adaptations.timeOffsetMs ?? 0) !== 0
    || lightShutter !== undefined
  const [advancedControlsOpen, setAdvancedControlsOpen] = useState(hasAdvancedOverrides)
  const inspectorValue = projectShowClipInspector(show, { kind: 'global', cellId: cell.id })
  const summary = projectGlobalShowClipSummary(
    show,
    cell.id,
    Object.fromEntries(patternControls.map((control) => [control.exportName, control.label])),
  )
  const updateLightShutter = (changes: Partial<NonNullable<ShowCell['adaptations']['lightShutter']>>) => {
    if (!lightShutter) return
    onUpdateAdaptations({ lightShutter: { ...lightShutter, ...changes } })
  }
  return (
    <InspectorPanel
      family="Clip"
      heading={cell.patternName}
      summary={(
        <ClipConfigurationSummary
          summary={summary}
          destinationForItem={(section, item) => availableClipSummaryDestination(section, item, {
            transformEnabled,
            patternControls,
            stutterAvailable: false,
            opacityAvailable: false,
          })}
          onNavigate={(destination) => clipDetailRef.current?.navigateToSummaryDestination(destination)}
        />
      )}
      icon={<Grid2X2 size={13} aria-hidden />}
      actions={(
        <span className="inline-flex">
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={`Delete clip ${cell.patternName}`}
            title={canRemove ? `Delete ${cell.patternName}` : undefined}
            aria-disabled={!canRemove || undefined}
            aria-describedby={canRemove ? undefined : 'legacy-clip-delete-reason'}
            className="text-zinc-500 hover:bg-red-950/30 hover:text-red-300 aria-disabled:opacity-50"
            onClick={() => { if (canRemove) onRemove() }}
          >
            <Trash2 size={12} aria-hidden />
          </Button>
          {!canRemove && (
            <DisabledReasonTip id="legacy-clip-delete-reason">A Show must contain at least one Clip.</DisabledReasonTip>
          )}
        </span>
      )}
    >
      {inspectorValue && (
        <ShowClipEntityDetail
          ref={clipDetailRef}
          value={inspectorValue}
          title={cell.patternName}
          readOnly={false}
          patternOptions={patternOptions.map((option) => ({
            value: `${option.ref.kind}:${option.ref.id}`,
            label: option.label,
            group: option.group,
          }))}
          patternControls={patternControls}
          transformEnabled={transformEnabled}
          stageDimensions={stageDimensions}
          panelKey={panelKey}
          embedded
          onPatch={onUpdateClip}
          onPreviewPatch={onPreviewClip}
          onPreviewEnd={onPreviewEnd}
          onPatternCommit={onPatternCommit}
        >
          <div data-testid="global-clip-control-tray" className="mt-2">
        <details
          className="min-w-0 border-t border-zinc-800/80"
          aria-label="Global placement and clock controls"
          open={advancedControlsOpen}
          onToggle={(event) => setAdvancedControlsOpen(event.currentTarget.open)}
        >
          <summary className="cursor-pointer py-1 text-[9px] uppercase tracking-[0.12em] text-zinc-500">Global placement and clock controls</summary>
          <div className="border-t border-zinc-800/70 py-1 text-[9px]">
            <div className="grid max-w-[30rem] grid-cols-2 items-end gap-1.5 sm:grid-cols-3">
            {(cell.zoneSpan ?? 1) > 1 && (
              <label className="text-[9px] uppercase tracking-[0.08em] text-zinc-600">
                Zone domain
                <select
                  aria-label="Zone domain"
                  value={cell.zoneMode === 'repeat' ? 'repeat' : 'span'}
                  onChange={(event) => onUpdateZoneMode(event.target.value === 'repeat' ? 'repeat' : 'span')}
                  className={`${compactField} mt-1 w-full`}
                >
                  <option value="span">one canvas</option>
                  <option value="repeat">repeat per zone</option>
                </select>
              </label>
            )}
            <label className="text-[9px] uppercase tracking-[0.08em] text-zinc-600">
              Span zones
              <select
                aria-label="Span zones"
                value={cell.zoneSpan ?? 1}
                onChange={(event) => onSpanZones(Number(event.target.value))}
                className={`${compactField} mt-1 w-full`}
              >
                {Array.from({ length: maxZoneSpan }, (_, index) => index + 1).map((span) => (
                  <option key={span} value={span}>{span}</option>
                ))}
              </select>
            </label>
            </div>
            {sceneIndex > 0 && (
              <section className="mt-1 max-w-2xl border-t border-zinc-800/65 py-1">
                <label className="flex shrink-0 items-center gap-2 text-zinc-200">
                <input
                  type="checkbox"
                  aria-label="Restart Pattern on entry"
                  checked={Boolean(cell.restartOnEntry)}
                  onChange={(event) => onUpdateRestartOnEntry(event.target.checked)}
                />
                Restart Pattern on entry
                </label>
              </section>
            )}
            <MotionCadenceControl
              stepMs={cell.adaptations.steppedClock?.stepMs}
              timeOffsetMs={cell.adaptations.timeOffsetMs ?? 0}
              onChange={(stepMs) => onUpdateAdaptations({
                steppedClock: stepMs === null ? undefined : { stepMs },
              })}
              onOffsetChange={(timeOffsetMs) => onUpdateAdaptations({ timeOffsetMs })}
            />
            <div className="mt-1 max-w-2xl border-t border-zinc-800/65 pt-1">
              <label className="flex items-center gap-2 text-zinc-300">
              <input
                type="checkbox"
                checked={Boolean(lightShutter)}
                onChange={(event) => onUpdateAdaptations({
                  lightShutter: event.target.checked
                    ? { rateHz: 8, duty: 0.5, phase: 0, clockBehavior: 'continue' }
                    : undefined,
                })}
              />
              Light shutter
              </label>
              {lightShutter && (
                <>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  <NumberField compact label="Shutter rate (Hz)" value={lightShutter.rateHz} min={0.01} max={60} step={0.1} onChange={(rateHz) => updateLightShutter({ rateHz })} />
                  <PercentageField compact label="Light on fraction" value={lightShutter.duty} min={0} max={1} step={0.01} onChange={(duty) => updateLightShutter({ duty })} />
                  <NumberField compact label="Shutter phase" value={lightShutter.phase} min={0} max={1} step={0.01} onChange={(phase) => updateLightShutter({ phase })} />
                  <label className="text-[9px] uppercase tracking-[0.08em] text-zinc-600">
                    Clock while dark
                    <select
                      aria-label="Clock while dark"
                      value={lightShutter.clockBehavior}
                      onChange={(event) => updateLightShutter({ clockBehavior: event.target.value === 'freeze' ? 'freeze' : 'continue' })}
                      className={`${compactField} mt-1 w-full`}
                    >
                      <option value="continue">continue</option>
                      <option value="freeze">freeze</option>
                    </select>
                  </label>
                  </div>
                  <p className="mt-1.5 text-[9px] leading-4 text-zinc-500">
                    Closed frames emit black and skip Pattern rendering. Continue advances motion; freeze pauses Pattern time.
                  </p>
                </>
              )}
            </div>
          </div>
        </details>
          </div>
        </ShowClipEntityDetail>
      )}
    </InspectorPanel>
  )
}

function MotionCadenceControl({
  stepMs,
  timeOffsetMs,
  onChange,
  onOffsetChange,
}: {
  stepMs: number | undefined
  timeOffsetMs: number
  onChange: (stepMs: number | null) => void
  onOffsetChange: (timeOffsetMs: number) => void
}) {
  const stepped = stepMs !== undefined
  const rateHz = steppedClockRateHz(stepMs ?? 125)
  return (
    <section className="mt-1 max-w-2xl border-t border-zinc-800/65 pt-1">
      <div
        role="group"
        aria-label="Motion cadence controls"
        className="grid items-center gap-x-1.5 gap-y-0.5 sm:grid-cols-[minmax(8rem,10rem)_auto_7rem] sm:grid-rows-[auto_1.5rem]"
      >
        <div className="text-[9px] uppercase tracking-[0.12em] text-violet-300/85 sm:col-start-1 sm:row-start-1">
          Motion cadence
        </div>
        <div className="text-[9px] uppercase tracking-[0.12em] text-zinc-600 sm:col-start-3 sm:row-start-1">
          Start offset (s)
        </div>
        <div
          className="min-w-0 truncate text-[8px] text-zinc-600 sm:col-start-1 sm:row-start-2"
          title="Shift this clip's private Pattern clock for rounds across zones."
        >
          <span aria-hidden>Private Pattern clock</span>
          <span className="sr-only">Shift this clip&apos;s private Pattern clock for rounds across zones.</span>
        </div>
        <div className="flex h-6 rounded border border-zinc-700 bg-zinc-950 p-0.5 text-[9px] sm:col-start-2 sm:row-start-2">
          <button
            type="button"
            aria-label="Smooth motion"
            aria-pressed={!stepped}
            className={stepped ? 'rounded px-1.5 text-zinc-500 hover:text-zinc-300' : 'rounded bg-zinc-700 px-1.5 text-zinc-100'}
            onClick={() => onChange(null)}
          >
            smooth
          </button>
          <button
            type="button"
            aria-label="Stepped motion"
            aria-pressed={stepped}
            className={stepped ? 'rounded bg-violet-400/20 px-1.5 text-violet-200' : 'rounded px-1.5 text-zinc-500 hover:text-zinc-300'}
            onClick={() => onChange(stepMs ?? 125)}
          >
            stepped
          </button>
        </div>
        <div className="sm:col-start-3 sm:row-start-2">
          <TimeField
            compact
            hideLabel
            label="Start offset (s)"
            value={timeOffsetMs / 1_000}
            min={0}
            max={60}
            step={0.1}
            onChange={(seconds) => onOffsetChange(Math.round(seconds * 1_000))}
          />
        </div>
      </div>
      {stepped && (
        <>
          <div className="mt-1.5 grid grid-cols-[minmax(7rem,10rem)_1fr] items-end gap-3 border-t border-zinc-800/55 pt-1.5">
            <BoundedNumberField
              compact
              label="Jumps per second"
              value={rateHz}
              presentation={JUMPS_PER_SECOND_PRESENTATION}
              variant="editor"
              onChange={(next) => onChange(steppedClockStepMs(next))}
            />
            <div className="pb-0.5 text-[8px] tabular-nums text-zinc-600">
              every {Math.round(stepMs)} ms
            </div>
          </div>
          <p className="mt-1 text-[8px] text-zinc-600">
            Motion freezes and jumps; unlike Light shutter, pixels do not blink off and the renderer keeps running.
          </p>
        </>
      )}
    </section>
  )
}

/**
 * v1's boundary Transition inspector, resolved from its own record (#1065).
 *
 * This adapter owns everything version-specific: the Scene index behind the
 * boundary, the ShowCell covering each Zone on either side, and every legacy
 * mutation owner. It hands the panel below a value, so the panel itself never
 * sees a Show, a Scene or a ShowCell.
 */
function TransitionInspector({
  show,
  transitionId,
  stageDimensions,
  onUpdate,
  onOpenPalette,
  onRemove,
  onUpdateCellAdaptations,
  patternControlsByCellId,
  onUpdateControlTarget,
}: {
  show: ShowRecord
  transitionId: string
  stageDimensions: 1 | 2 | 3
  onUpdate: (transitionId: string, changes: ShowTransitionChanges) => void
  onOpenPalette: () => void
  onRemove: (transitionId: string) => void
  onUpdateCellAdaptations: (cell: ShowCell, changes: Partial<ShowCell['adaptations']>) => void
  patternControlsByCellId: Record<string, AutomatablePatternControl[]>
  onUpdateControlTarget: (cell: ShowCell, exportName: string, value: number | undefined) => void
}) {
  const transition = show.transitions?.find((candidate) => candidate.id === transitionId)
  if (!transition) return null
  const sceneIndex = show.scenes.findIndex((scene) => scene.id === transition.afterSceneId)
  const scene = show.scenes[sceneIndex] ?? show.scenes[0]
  const nextScene = show.scenes[sceneIndex + 1]
  const boundaryIdentity = showBoundaryClipIdentity(show, transition.afterSceneId)
  if (transition.kind === 'routing') {
    return (
      <RoutingTransferInspector
        value={{
          boundaryIdentity,
          layoutId: transition.layoutId ?? '',
          durationMs: transition.durationMs,
          easing: transition.easing,
          direction: transition.routingDirection ?? 'forward',
          directionAuthored: transition.routingDirection !== undefined,
          maxDurationMs: nextScene?.durationMs ?? 0,
          layoutOptions: show.routingLayouts.map((layout) => ({ id: layout.id, name: layout.name })),
        }}
        onUpdate={(changes) => onUpdate(transition.id, changes)}
        onRemove={() => onRemove(transition.id)}
      />
    )
  }
  const cellSide = (cell: ShowCell) => ({
    id: cell.id,
    controlSourceId: cell.id,
    patternKey: `${cell.pattern.kind}:${cell.pattern.id}`,
    adaptations: { timeScale: cell.adaptations.timeScale, brightness: cell.adaptations.brightness },
    transform: normalizeShowClipTransform(cell.transform),
    controlTargets: cell.controlTargets ?? {},
  })
  const destinationCells = nextScene
    ? show.zones.flatMap((zone) => {
        const cell = cellCoveringScene(show, zone.id, sceneIndex + 1)
        return cell ? [{ zone, cell }] : []
      }).filter((entry, index, entries) => entries.findIndex((candidate) => candidate.cell.id === entry.cell.id) === index)
    : []
  const cellsById = new Map(destinationCells.map(({ cell }) => [cell.id, cell]))
  const { afterSceneId: _afterSceneId, ...settings } = transition
  const value: ShowBoundaryTransitionInspectorValue = {
    id: transition.id,
    boundaryIdentity,
    settings,
    destinations: destinationCells.map(({ zone, cell }) => {
      const outgoing = cellCoveringScene(show, zone.id, sceneIndex)
      return {
        zoneId: zone.id,
        zoneName: zone.name,
        ...cellSide(cell),
        ...(outgoing ? { outgoing: cellSide(outgoing) } : {}),
      }
    }),
    ...(nextScene
      ? {
          repeat: {
            from: scene?.sampleTargets?.repeatScale ?? 1,
            to: nextScene.sampleTargets?.repeatScale ?? 1,
          },
        }
      : {}),
    ...(nextScene && show.routingLayouts.some((layout) => (
      layout.logical?.kind === 'split' || layout.logical?.kind === 'soft-split'
    ))
      ? {
          split: {
            from: scene?.routingTargets?.splitPosition ?? 0.5,
            to: nextScene.routingTargets?.splitPosition ?? 0.5,
          },
        }
      : {}),
  }
  return (
    <BoundaryTransitionInspector
      value={value}
      stageDimensions={stageDimensions}
      patternControlsBySourceId={patternControlsByCellId}
      onUpdate={onUpdate}
      onPreviewSettings={(changes) => useShowPreviewOverrideStore.getState().preview(
        updateShowBoundaryTransition(show, transition.id, changes),
      )}
      onPreviewEnd={() => useShowPreviewOverrideStore.getState().clear(show.id)}
      onOpenPalette={onOpenPalette}
      onRemove={onRemove}
      onUpdateDestinationAdaptations={(destinationId, changes) => {
        const cell = cellsById.get(destinationId)
        if (cell) onUpdateCellAdaptations(cell, changes)
      }}
      onUpdateDestinationControlTarget={(destinationId, exportName, controlValue) => {
        const cell = cellsById.get(destinationId)
        if (cell) onUpdateControlTarget(cell, exportName, controlValue)
      }}
    />
  )
}

/**
 * The boundary Transition panel both backings draw (#1065).
 *
 * This is v1's original panel, unchanged in markup, labels, controls and
 * ordering. Only its inputs moved: it reads a presented value and names an
 * authored destination identity in its callbacks, so the v1 adapter above and
 * the authored-v2 reader can each supply it without either one owning the
 * other's record. Routing Transitions never reach here; they keep
 * `RoutingTransferInspector`.
 */
function BoundaryTransitionInspector({
  value,
  stageDimensions,
  patternControlsBySourceId,
  onUpdate,
  onPreviewSettings,
  onPreviewEnd,
  onOpenPalette,
  onRemove,
  onUpdateDestinationAdaptations,
  onUpdateDestinationControlTarget,
}: {
  value: ShowBoundaryTransitionInspectorValue
  stageDimensions: 1 | 2 | 3
  /** Keyed by each side's `controlSourceId`: a ShowCell on v1, an instance on v2. */
  patternControlsBySourceId: Record<string, AutomatablePatternControl[]>
  onUpdate: (transitionId: string, changes: ShowTransitionChanges) => void
  onPreviewSettings: (changes: ShowTransitionChanges) => void
  onPreviewEnd: () => void
  onOpenPalette: () => void
  onRemove: (transitionId: string) => void
  onUpdateDestinationAdaptations: (
    destinationId: string,
    changes: Partial<Record<ShowAutomatableProperty, number>>,
  ) => void
  onUpdateDestinationControlTarget: (
    destinationId: string,
    exportName: string,
    value: number | undefined,
  ) => void
}) {
  const transition = value.settings
  const { boundaryIdentity, destinations } = value
  // A routing Transition keeps `RoutingTransferInspector` on both backings, so
  // it never reaches this panel; the guard states that rather than assuming it.
  if (transition.kind === 'routing') return null
  const cost = transitionCost(transition.kind)
  const transitionItem = buildShowToolkitPresentationCatalogue({ stageDimensions })
    .find((item) => item.key === showBoundaryTransitionPresentationKey(transition))
  const boundaryControls = destinations.flatMap((destination) => {
    const outgoing = destination.outgoing
    if (!outgoing || outgoing.patternKey !== destination.patternKey) return []
    const outgoingNames = new Set((patternControlsBySourceId[outgoing.controlSourceId] ?? []).map((control) => control.exportName))
    return (patternControlsBySourceId[destination.controlSourceId] ?? []).filter((control) => (
      outgoingNames.has(control.exportName)
      && (
        outgoing.controlTargets[control.exportName] !== undefined
        || destination.controlTargets[control.exportName] !== undefined
        || transition.propertyTransitions?.controls?.[control.exportName] !== undefined
      )
    ))
  }).filter((control, index, controls) => controls.findIndex((candidate) => candidate.exportName === control.exportName) === index)
  return (
    <InspectorPanel
      family="Transition"
      title={`${boundaryIdentity} · ${transition.kind}`}
      icon={<Zap size={13} aria-hidden />}
      actions={transition.kind !== 'cut' ? (
        <Button size="icon-xs" variant="ghost" aria-label="Reset transition to cut" title="Reset to cut" className="text-zinc-500 hover:bg-red-950/30 hover:text-red-300" onClick={() => onRemove(transition.id)}>
          <Trash2 size={12} aria-hidden />
        </Button>
      ) : null}
    >
      <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
        <label className="text-[10px] uppercase text-zinc-600">
          Boundary
          <div className="mt-1 text-zinc-300">{boundaryIdentity}</div>
        </label>
        <button type="button" onClick={onOpenPalette} className="flex h-7 items-center gap-1.5 rounded border border-amber-400/25 bg-amber-400/[0.04] px-2 text-[9px] text-amber-200 hover:border-amber-400/55 hover:bg-amber-400/[0.08]">
          <Zap size={11} aria-hidden /> {transitionItem?.label ?? transition.kind} · Change
        </button>
      </div>
      {transitionItem && transition.kind !== 'cut' && (
        <ShowTransitionParameters
          transition={transition}
          item={transitionItem}
          stageDimensions={stageDimensions}
          onPreview={(parameterId, parameterValue) => {
            const changes = showBoundaryTransitionParameterChanges(transition, transitionItem, parameterId, parameterValue, stageDimensions)
            if (changes) onPreviewSettings(changes)
          }}
          onPreviewEnd={onPreviewEnd}
          onChange={(parameterId, parameterValue) => {
            const changes = showBoundaryTransitionParameterChanges(transition, transitionItem, parameterId, parameterValue, stageDimensions)
            if (changes) onUpdate(transition.id, changes)
          }}
        />
      )}
      {transition.kind === 'crossfade' && (
        <div data-crossfade-source className="mt-2 border-t border-zinc-800/80 bg-transparent py-2">
          <label className="text-[10px] uppercase text-zinc-600">
            Crossfade source
            <select
              aria-label="Crossfade source"
              value={transition.crossfadePolicy === 'snapshot-live' ? 'snapshot-live' : 'live-live'}
              onChange={(event) => onUpdate(transition.id, {
                crossfadePolicy: event.target.value === 'live-live' ? 'live-live' : 'snapshot-live',
              })}
              className={`${transitionRuleUnderField} mt-1 w-full`}
            >
              <option value="snapshot-live">Snapshot outgoing (recommended)</option>
              <option value="live-live">Keep both Patterns live</option>
            </select>
          </label>
          <p className="mt-1.5 text-[9px] leading-4 text-zinc-500">
            {transition.crossfadePolicy === 'snapshot-live'
              ? 'Freezes the fully composited outgoing Stage at the boundary; incoming motion stays live.'
              : 'Keeps outgoing and incoming visuals live for the whole blend.'}
          </p>
          <output aria-label="Crossfade evaluation cost" className="mt-1 block text-[9px] text-zinc-500">
            {transition.crossfadePolicy === 'snapshot-live'
              ? 'Capture frame: two Pattern render paths · then one live Pattern renderer per pixel after capture'
              : 'Two live Pattern render paths per pixel throughout the transition'}
          </output>
        </div>
      )}
      <details className="mt-2 border-t border-zinc-800 bg-transparent">
        <summary className="flex cursor-pointer items-center py-1.5 text-[9px] uppercase tracking-[0.12em] text-zinc-500">
          <span>Advanced transition controls</span>
          <span data-testid="transition-cost-tag" className={`ml-auto font-mono normal-case tracking-normal ${cost === 'expensive' ? 'text-amber-300' : 'text-zinc-500'}`}>
            cost · {cost}
          </span>
        </summary>
        <div className="grid grid-cols-2 gap-0 border-t border-zinc-800">
          {(['timeScale', 'brightness'] as const).map((property) => (
            <PropertyTransitionEditor
              key={property}
              property={property}
              transition={transition}
              destinations={destinations}
              clipValueRampsUnavailable={value.clipValueRampsUnavailable === true}
              onUpdate={onUpdate}
              onUpdateDestinationAdaptations={onUpdateDestinationAdaptations}
            />
          ))}
          {value.clipValueRampsUnavailable === undefined && <TransformTransitionEditor
            transition={transition}
            destinations={destinations}
            onUpdate={onUpdate}
          />}
          {value.split && (
            <RoutingSplitTransitionEditor
              transition={transition}
              fromTarget={value.split.from}
              toTarget={value.split.to}
              onUpdate={onUpdate}
            />
          )}
          {value.repeat && (
            <SampleRepeatTransitionEditor
              transition={transition}
              fromTarget={value.repeat.from}
              toTarget={value.repeat.to}
              onUpdate={onUpdate}
            />
          )}
          {value.clipValueRampsUnavailable === undefined && boundaryControls.map((control) => (
            <PatternControlTransitionEditor
              key={control.exportName}
              control={control}
              transition={transition}
              destinations={destinations}
              onUpdate={onUpdate}
              onUpdateDestinationControlTarget={onUpdateDestinationControlTarget}
            />
          ))}
        </div>
      </details>
    </InspectorPanel>
  )
}

/**
 * The Zone Layout switch a routing Transition performs. Both backings supply
 * these facts from their own record - v1 from the routing boundary Transition,
 * the authored-v2 record from the destination Layout occurrence's incoming
 * transfer - and the panel itself is v1's, unchanged (#1065).
 */
interface ShowRoutingTransferInspectorValue {
  boundaryIdentity: string
  layoutId: string
  durationMs: number
  easing: ShowTransitionEasing
  direction: ShowRoutingDirection
  /** False when the record stores no direction and `direction` is the default. */
  directionAuthored: boolean
  /** v1 bounds the field by the destination Scene's length. */
  maxDurationMs: number
  layoutOptions: readonly { id: string; name: string }[]
}

function RoutingTransferInspector({
  value,
  onUpdate,
  onRemove,
}: {
  value: ShowRoutingTransferInspectorValue
  onUpdate: (changes: Partial<Omit<ShowBoundaryTransition, 'id' | 'afterSceneId'>>) => void
  onRemove: () => void
}) {
  return (
      <InspectorPanel
        family="Transition"
        title={`${value.boundaryIdentity} · routing`}
        icon={<Route size={13} aria-hidden />}
        actions={(
          <Button size="icon-xs" variant="ghost" aria-label="Remove routing marker" title="Remove routing marker" className="text-zinc-500 hover:bg-red-950/30 hover:text-red-300" onClick={onRemove}>
            <Trash2 size={12} aria-hidden />
          </Button>
        )}
      >
        <div className="grid max-w-xl grid-cols-2 gap-3">
          <label className="text-[10px] uppercase text-zinc-600">
            Destination routing layout
            <select
              aria-label="Destination routing layout"
              value={value.layoutId}
              onChange={(event) => onUpdate({ layoutId: event.target.value || undefined })}
              className={`${transitionRuleUnderField} mt-1 w-full`}
            >
              {value.layoutOptions.map((layout) => (
                <option key={layout.id} value={layout.id}>{layout.name}</option>
              ))}
            </select>
          </label>
          <TimeField
            label="Routing transfer duration seconds"
            value={value.durationMs / 1000}
            min={0}
            max={Math.max(0, value.maxDurationMs / 1000)}
            step={0.1}
            onChange={(seconds) => onUpdate({
              durationMs: seconds * 1000,
              ...(seconds > 0 && !value.directionAuthored ? { routingDirection: 'forward' } : {}),
            })}
          />
          <label className="text-[10px] uppercase text-zinc-600">
            Routing transfer easing
            <select
              aria-label="Routing transfer easing"
              value={showEasingOptionId(value.easing)}
              disabled={value.durationMs === 0}
              onChange={(event) => onUpdate({ easing: showEasingFromOptionId(event.target.value) })}
              className={`${transitionRuleUnderField} mt-1 w-full disabled:opacity-40`}
            >
              <ShowEasingOptions />
            </select>
          </label>
          <label className="text-[10px] uppercase text-zinc-600">
            Routing transfer direction
            <select
              aria-label="Routing transfer direction"
              value={value.direction}
              disabled={value.durationMs === 0}
              onChange={(event) => onUpdate({
                routingDirection: event.target.value === 'reverse' ? 'reverse' : 'forward',
              })}
              className={`${transitionRuleUnderField} mt-1 w-full disabled:opacity-40`}
            >
              <option value="forward">forward</option>
              <option value="reverse">reverse</option>
            </select>
          </label>
          <p className="col-span-2 text-[10px] leading-4 text-zinc-500">
            {value.durationMs === 0
              ? 'Cut: the destination layout takes effect at this boundary.'
              : 'Directional transfer: a stable spatial threshold moves pixel ownership to the destination layout.'}
            {' '}Each pixel invokes one Pattern renderer, and all Pattern clocks continue.
          </p>
          <output aria-label="Routing transfer cost" className="col-span-2 text-[10px] text-zinc-500">
            Cost tier: {value.durationMs > 0 ? 'cheap' : 'free'} · one renderer per physical pixel
          </output>
        </div>
      </InspectorPanel>
  )
}

function SampleRepeatTransitionEditor({
  transition,
  fromTarget,
  toTarget,
  onUpdate,
}: {
  transition: ShowTransitionSettingsCarrier
  fromTarget: number
  toTarget: number
  onUpdate: (transitionId: string, changes: ShowTransitionChanges) => void
}) {
  const descriptor = transition.propertyTransitions?.sample?.repeatScale
  const updateDescriptor = (changes: Partial<NonNullable<typeof descriptor>>) => {
    onUpdate(transition.id, {
      propertyTransitions: {
        ...(transition.propertyTransitions ?? {}),
        sample: {
          ...(transition.propertyTransitions?.sample ?? {}),
          repeatScale: {
            from: changes.from ?? descriptor?.from ?? fromTarget,
            durationMs: changes.durationMs ?? descriptor?.durationMs ?? transition.durationMs,
            easing: changes.easing ?? descriptor?.easing ?? transition.easing,
          },
        },
      },
    })
  }
  const removeDescriptor = () => {
    const propertyTransitions = { ...(transition.propertyTransitions ?? {}) }
    const sample = { ...(propertyTransitions.sample ?? {}) }
    delete sample.repeatScale
    if (Object.keys(sample).length > 0) propertyTransitions.sample = sample
    else delete propertyTransitions.sample
    onUpdate(transition.id, {
      propertyTransitions: Object.keys(propertyTransitions).length > 0 ? propertyTransitions : undefined,
    })
  }
  return (
    <section className="col-span-2 border-t border-zinc-800/70 bg-transparent py-2">
      <label className="flex items-center gap-2 text-[10px] uppercase text-zinc-400">
        <input
          type="checkbox"
          aria-label="Animate repeat scale"
          checked={Boolean(descriptor)}
          onChange={(event) => event.target.checked ? updateDescriptor({}) : removeDescriptor()}
          className="h-3.5 w-3.5 accent-live"
        />
        Repeat scale
        <span className="ml-auto font-mono text-zinc-500">{formatRepeatScale(fromTarget)} → {formatRepeatScale(toTarget)}</span>
      </label>
      {descriptor && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <DomainNumberField
            label="Repeat scale start"
            value={descriptor.from}
            presentation="multiplier"
            min={1}
            max={8}
            step={0.1}
            onChange={(from) => updateDescriptor({ from })}
          />
          <TimeField
            label="Repeat scale duration seconds"
            value={(descriptor.durationMs ?? transition.durationMs) / 1000}
            min={0}
            max={Math.max(0, transition.durationMs / 1000)}
            step={0.1}
            onChange={(seconds) => updateDescriptor({ durationMs: seconds * 1000 })}
          />
          <label className="text-[10px] uppercase text-zinc-600">
            Repeat scale easing
            <select
              aria-label="Repeat scale easing"
              value={showEasingOptionId(descriptor.easing ?? transition.easing)}
              onChange={(event) => updateDescriptor({ easing: showEasingFromOptionId(event.target.value) })}
              className={`${transitionRuleUnderField} mt-1 w-full`}
            >
              <ShowEasingOptions />
            </select>
          </label>
        </div>
      )}
    </section>
  )
}

const SHOW_TRANSFORM_PROPERTY_PRESENTATION: Array<{
  property: keyof ShowClipTransform
  label: string
  format: (value: number) => string
}> = [
  { property: 'positionX', label: 'Position X', format: (value) => Number(value.toFixed(2)).toString() },
  { property: 'positionY', label: 'Position Y', format: (value) => Number(value.toFixed(2)).toString() },
  { property: 'rotation', label: 'Rotation', format: (value) => formatAngleValue('rotation', value) },
  { property: 'scaleX', label: 'Scale X', format: (value) => formatDomainNumber('multiplier', value, 0.01) },
  { property: 'scaleY', label: 'Scale Y', format: (value) => formatDomainNumber('multiplier', value, 0.01) },
]

function TransformTransitionEditor({
  transition,
  destinations,
  onUpdate,
}: {
  transition: ShowTransitionSettingsCarrier
  destinations: readonly ShowBoundaryTransitionDestinationValue[]
  onUpdate: (transitionId: string, changes: ShowTransitionChanges) => void
}) {
  const compatible = destinations.flatMap((destination) => {
    const outgoing = destination.outgoing
    return outgoing && outgoing.patternKey === destination.patternKey
      ? [{ destination, outgoing }]
      : []
  })
  if (compatible.length === 0) return null

  const updateProperty = (
    property: keyof ShowClipTransform,
    enabled: boolean,
    changes: { durationMs?: number; easing?: ShowBoundaryTransition['easing'] } = {},
  ) => {
    const propertyTransitions = { ...(transition.propertyTransitions ?? {}) }
    const transform = { ...(propertyTransitions.transform ?? {}) }
    const current = transform[property]
    if (!enabled) {
      delete transform[property]
    } else {
      transform[property] = {
        fromByCellId: current?.fromByCellId ?? Object.fromEntries(compatible.map(({ destination, outgoing }) => (
          [destination.id, outgoing.transform[property]]
        ))),
        durationMs: changes.durationMs ?? current?.durationMs ?? transition.durationMs,
        easing: changes.easing ?? current?.easing ?? transition.easing,
      }
    }
    if (Object.keys(transform).length > 0) propertyTransitions.transform = transform
    else delete propertyTransitions.transform
    onUpdate(transition.id, {
      propertyTransitions: Object.keys(propertyTransitions).length > 0 ? propertyTransitions : undefined,
    })
  }

  return (
    <section aria-label="Transform transition" className="col-span-2 border-t border-zinc-800/70 bg-transparent py-2">
      <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-400">Transform</div>
      <p className="mb-2 text-[9px] text-zinc-600">Canonical placement pose. Additional Transform Effects still run afterward.</p>
      <div className="divide-y divide-zinc-900">
        {SHOW_TRANSFORM_PROPERTY_PRESENTATION.map(({ property, label, format }) => {
          const descriptor = transition.propertyTransitions?.transform?.[property]
          const first = compatible[0]
          const from = descriptor?.fromByCellId[first.destination.id]
            ?? first.outgoing.transform[property]
          const to = first.destination.transform[property]
          return (
            <div key={property} className="py-1.5">
              <label className="flex items-center gap-2 text-[9px] text-zinc-400">
                <input
                  type="checkbox"
                  aria-label={`Animate ${label} transform`}
                  checked={Boolean(descriptor)}
                  onChange={(event) => updateProperty(property, event.target.checked)}
                  className="size-3.5 accent-live"
                />
                <span>{label}</span>
                <span className="ml-auto font-mono text-zinc-600">{format(from)} to {format(to)}</span>
              </label>
              {descriptor && (
                <div className="mt-1.5 grid grid-cols-2 gap-2 pl-5">
                  <TimeField
                    label={`${label} transform duration seconds`}
                    value={(descriptor.durationMs ?? transition.durationMs) / 1_000}
                    min={0}
                    max={Math.max(0, transition.durationMs / 1_000)}
                    step={0.1}
                    onChange={(seconds) => updateProperty(property, true, { durationMs: seconds * 1_000 })}
                  />
                  <label className="text-[9px] uppercase text-zinc-600">
                    {label} transform easing
                    <select
                      aria-label={`${label} transform easing`}
                      value={showEasingOptionId(descriptor.easing ?? transition.easing)}
                      onChange={(event) => updateProperty(property, true, { easing: showEasingFromOptionId(event.target.value) })}
                      className={`${transitionRuleUnderField} mt-1 w-full`}
                    >
                      <ShowEasingOptions />
                    </select>
                  </label>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function RoutingSplitTransitionEditor({
  transition,
  fromTarget,
  toTarget,
  onUpdate,
}: {
  transition: ShowTransitionSettingsCarrier
  fromTarget: number
  toTarget: number
  onUpdate: (transitionId: string, changes: Partial<Omit<ShowBoundaryTransition, 'id' | 'afterSceneId'>>) => void
}) {
  const descriptor = transition.propertyTransitions?.routing?.splitPosition
  const updateDescriptor = (changes: Partial<NonNullable<typeof descriptor>>) => {
    onUpdate(transition.id, {
      propertyTransitions: {
        ...(transition.propertyTransitions ?? {}),
        routing: {
          ...(transition.propertyTransitions?.routing ?? {}),
          splitPosition: {
            from: changes.from ?? descriptor?.from ?? fromTarget,
            durationMs: changes.durationMs ?? descriptor?.durationMs ?? transition.durationMs,
            easing: changes.easing ?? descriptor?.easing ?? transition.easing,
          },
        },
      },
    })
  }
  const removeDescriptor = () => {
    const propertyTransitions = { ...(transition.propertyTransitions ?? {}) }
    const routing = { ...(propertyTransitions.routing ?? {}) }
    delete routing.splitPosition
    if (Object.keys(routing).length > 0) propertyTransitions.routing = routing
    else delete propertyTransitions.routing
    onUpdate(transition.id, {
      propertyTransitions: Object.keys(propertyTransitions).length > 0 ? propertyTransitions : undefined,
    })
  }
  return (
    <section className="col-span-2 border-t border-zinc-800/70 bg-transparent py-2">
      <label className="flex items-center gap-2 text-[10px] uppercase text-zinc-400">
        <input
          type="checkbox"
          aria-label="Animate split position"
          checked={Boolean(descriptor)}
          onChange={(event) => event.target.checked ? updateDescriptor({}) : removeDescriptor()}
          className="h-3.5 w-3.5 accent-live"
        />
        Split position
        <span className="ml-auto font-mono text-zinc-500">{Math.round(fromTarget * 100)}% → {Math.round(toTarget * 100)}%</span>
      </label>
      {descriptor && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <NumberField
            label="Split position start"
            value={descriptor.from}
            min={0}
            max={1}
            step={0.01}
            onChange={(from) => updateDescriptor({ from })}
          />
          <TimeField
            label="Split position duration seconds"
            value={(descriptor.durationMs ?? transition.durationMs) / 1000}
            min={0}
            max={Math.max(0, transition.durationMs / 1000)}
            step={0.1}
            onChange={(seconds) => updateDescriptor({ durationMs: seconds * 1000 })}
          />
          <label className="text-[10px] uppercase text-zinc-600">
            Split position easing
            <select
              aria-label="Split position easing"
              value={showEasingOptionId(descriptor.easing ?? transition.easing)}
              onChange={(event) => updateDescriptor({ easing: showEasingFromOptionId(event.target.value) })}
              className={`${transitionRuleUnderField} mt-1 w-full`}
            >
              <ShowEasingOptions />
            </select>
          </label>
        </div>
      )}
    </section>
  )
}

function PropertyTransitionEditor({
  property,
  transition,
  destinations,
  clipValueRampsUnavailable,
  onUpdate,
  onUpdateDestinationAdaptations,
}: {
  property: ShowAutomatableProperty
  transition: ShowTransitionSettingsCarrier
  destinations: readonly ShowBoundaryTransitionDestinationValue[]
  clipValueRampsUnavailable: boolean
  onUpdate: (transitionId: string, changes: ShowTransitionChanges) => void
  onUpdateDestinationAdaptations: (
    destinationId: string,
    changes: Partial<Record<ShowAutomatableProperty, number>>,
  ) => void
}) {
  const isTime = property === 'timeScale'
  const descriptor = transition.propertyTransitions?.[property]
  const title = isTime ? 'Animation speed' : 'Brightness'
  const updateDescriptor = (changes: Partial<NonNullable<typeof descriptor>>, fromByCellId = descriptor?.fromByCellId ?? {}) => {
    if (clipValueRampsUnavailable) return
    const nextDescriptor = {
      fromByCellId,
      durationMs: changes.durationMs ?? descriptor?.durationMs ?? transition.durationMs,
      easing: changes.easing ?? descriptor?.easing ?? transition.easing,
    }
    onUpdate(transition.id, {
      propertyTransitions: {
        ...(transition.propertyTransitions ?? {}),
        [property]: nextDescriptor,
      },
    })
  }
  const removeCell = (cellId: string) => {
    if (clipValueRampsUnavailable) return
    const fromByCellId = { ...(descriptor?.fromByCellId ?? {}) }
    delete fromByCellId[cellId]
    const propertyTransitions = { ...(transition.propertyTransitions ?? {}) }
    if (Object.keys(fromByCellId).length > 0) propertyTransitions[property] = { ...descriptor, fromByCellId }
    else delete propertyTransitions[property]
    onUpdate(transition.id, { propertyTransitions: Object.keys(propertyTransitions).length > 0 ? propertyTransitions : undefined })
  }
  return (
    <section
      className="col-span-2 border-t border-zinc-800/70 bg-transparent py-2"
      aria-label={`${title} transition`}
    >
      <div className="mb-2 text-[10px] uppercase tracking-[0.12em] text-zinc-400">{title}</div>
      {descriptor && (
        <>
        <div data-testid="advanced-property-columns" className="mb-1 grid grid-cols-2 gap-2 font-mono text-[8px] uppercase tracking-[0.1em] text-zinc-600">
          <span>Duration</span><span>Easing</span>
        </div>
        <div className="mb-2 grid grid-cols-2 gap-2">
          <TimeField
            label={`${title} duration seconds`}
            value={(descriptor.durationMs ?? transition.durationMs) / 1000}
            min={0.1}
            max={Math.max(0.1, transition.durationMs / 1000)}
            step={0.1}
            ariaDisabled={clipValueRampsUnavailable}
            onChange={(seconds) => { if (!clipValueRampsUnavailable) updateDescriptor({ durationMs: seconds * 1000 }) }}
          />
          <label className="text-[10px] uppercase text-zinc-600">
            {title} easing
            <select
              aria-label={`${title} easing`}
              aria-disabled={clipValueRampsUnavailable || undefined}
              value={showEasingOptionId(descriptor.easing ?? transition.easing)}
              onChange={(event) => { if (!clipValueRampsUnavailable) updateDescriptor({ easing: showEasingFromOptionId(event.target.value) }) }}
              className={`${transitionRuleUnderField} mt-1 w-full`}
            >
              <ShowEasingOptions />
            </select>
          </label>
        </div>
        </>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {destinations.map((destination) => {
          const from = descriptor?.fromByCellId[destination.id]
          const outgoing = destination.outgoing
          const enabled = from !== undefined
          const updateFrom = (value: number | undefined) => {
            if (value === undefined) return removeCell(destination.id)
            updateDescriptor({}, { ...(descriptor?.fromByCellId ?? {}), [destination.id]: value })
          }
          const max = isTime ? 4 : 1
          const reasonId = `transition-${transition.id}-${property}-${destination.id}-unavailable`
          return (
            <div key={destination.id} className="border-t border-zinc-900 bg-transparent py-2">
              <span className="relative inline-flex">
                <label className="flex items-center gap-2 text-[10px] text-zinc-300">
                  <input
                    type="checkbox"
                    aria-label={`Animate ${isTime ? 'speed' : 'brightness'} for ${destination.zoneName}`}
                    aria-disabled={clipValueRampsUnavailable || undefined}
                    aria-describedby={clipValueRampsUnavailable ? reasonId : undefined}
                    checked={enabled}
                    disabled={transition.kind === 'cut' && !clipValueRampsUnavailable}
                    onChange={(event) => {
                      if (clipValueRampsUnavailable) {
                        event.preventDefault()
                        return
                      }
                      updateFrom(event.target.checked ? outgoing?.adaptations[property] ?? 1 : undefined)
                    }}
                    className="h-3.5 w-3.5 accent-live"
                  />
                  {destination.zoneName}
                </label>
                {clipValueRampsUnavailable && <DisabledReasonTip id={reasonId}>This Transition can't animate speed or brightness.</DisabledReasonTip>}
              </span>
              {enabled && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {isTime ? (
                    <DomainNumberField
                      label={`${title} start ${destination.zoneName}`}
                      value={from}
                      presentation="multiplier"
                      min={0}
                      max={max}
                      step={0.05}
                      ariaDisabled={clipValueRampsUnavailable}
                      onChange={(value) => { if (!clipValueRampsUnavailable) updateFrom(value) }}
                    />
                  ) : (
                    <PercentageField
                      label={`${title} start ${destination.zoneName}`}
                      value={from}
                      min={0}
                      max={1}
                      step={0.05}
                      ariaDisabled={clipValueRampsUnavailable}
                      onChange={(value) => { if (!clipValueRampsUnavailable) updateFrom(value) }}
                    />
                  )}
                  {isTime ? (
                    <DomainNumberField
                      label={`${title} target ${destination.zoneName}`}
                      value={destination.adaptations[property]}
                      presentation="multiplier"
                      min={0}
                      max={max}
                      step={0.05}
                      ariaDisabled={clipValueRampsUnavailable}
                      onChange={(value) => { if (!clipValueRampsUnavailable) onUpdateDestinationAdaptations(destination.id, { [property]: value }) }}
                    />
                  ) : (
                    <PercentageField
                      label={`${title} target ${destination.zoneName}`}
                      value={destination.adaptations[property]}
                      min={0}
                      max={1}
                      step={0.05}
                      ariaDisabled={clipValueRampsUnavailable}
                      onChange={(value) => { if (!clipValueRampsUnavailable) onUpdateDestinationAdaptations(destination.id, { [property]: value }) }}
                    />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-[10px] leading-4 text-zinc-500">
        The value moves from its outgoing setting to its incoming setting across this boundary.
        {isTime ? ' A target of 0 pauses without resetting Pattern state.' : ''}
      </p>
    </section>
  )
}

function PatternControlTransitionEditor({
  control,
  transition,
  destinations,
  onUpdate,
  onUpdateDestinationControlTarget,
}: {
  control: AutomatablePatternControl
  transition: ShowTransitionSettingsCarrier
  destinations: readonly ShowBoundaryTransitionDestinationValue[]
  onUpdate: (transitionId: string, changes: ShowTransitionChanges) => void
  onUpdateDestinationControlTarget: (
    destinationId: string,
    exportName: string,
    value: number | undefined,
  ) => void
}) {
  const descriptor = transition.propertyTransitions?.controls?.[control.exportName]
  const updateDescriptor = (changes: Partial<NonNullable<typeof descriptor>>, fromByCellId = descriptor?.fromByCellId ?? {}) => {
    onUpdate(transition.id, {
      propertyTransitions: {
        ...(transition.propertyTransitions ?? {}),
        controls: {
          ...(transition.propertyTransitions?.controls ?? {}),
          [control.exportName]: {
            fromByCellId,
            durationMs: changes.durationMs ?? descriptor?.durationMs ?? transition.durationMs,
            easing: changes.easing ?? descriptor?.easing ?? transition.easing,
          },
        },
      },
    })
  }
  const removeCell = (cellId: string) => {
    const fromByCellId = { ...(descriptor?.fromByCellId ?? {}) }
    delete fromByCellId[cellId]
    const controls = { ...(transition.propertyTransitions?.controls ?? {}) }
    if (Object.keys(fromByCellId).length > 0) controls[control.exportName] = { ...descriptor, fromByCellId }
    else delete controls[control.exportName]
    const propertyTransitions = { ...(transition.propertyTransitions ?? {}) }
    if (Object.keys(controls).length > 0) propertyTransitions.controls = controls
    else delete propertyTransitions.controls
    onUpdate(transition.id, { propertyTransitions: Object.keys(propertyTransitions).length > 0 ? propertyTransitions : undefined })
  }
  return (
    <section className="col-span-2 border-t border-zinc-800/70 bg-transparent py-2" aria-label={`${control.label} control transition`}>
      <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-400">{control.label} · Pattern control</div>
      <div className="mb-2 text-[9px] text-zinc-600">{control.exportName} · 0–100% · default {formatPercentageValue(control.defaultValue)}</div>
      {descriptor && (
        <div className="mb-2 grid grid-cols-2 gap-2">
          <TimeField
            label={`${control.label} duration seconds`}
            value={(descriptor.durationMs ?? transition.durationMs) / 1000}
            min={0.1}
            max={Math.max(0.1, transition.durationMs / 1000)}
            step={0.1}
            onChange={(seconds) => updateDescriptor({ durationMs: seconds * 1000 })}
          />
          <label className="text-[10px] uppercase text-zinc-600">
            {control.label} easing
            <select
              aria-label={`${control.label} easing`}
              value={showEasingOptionId(descriptor.easing ?? transition.easing)}
              onChange={(event) => updateDescriptor({ easing: showEasingFromOptionId(event.target.value) })}
              className={`${transitionRuleUnderField} mt-1 w-full`}
            >
              <ShowEasingOptions />
            </select>
          </label>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {destinations.map((destination) => {
          const outgoing = destination.outgoing
          const from = descriptor?.fromByCellId[destination.id]
          const enabled = from !== undefined
          const bothTargets = outgoing?.controlTargets[control.exportName] !== undefined && destination.controlTargets[control.exportName] !== undefined
          return (
            <div key={destination.id} className="border-t border-zinc-900 bg-transparent py-2">
              <label className="flex items-center gap-2 text-[10px] text-zinc-300">
                <input
                  type="checkbox"
                  aria-label={`Animate ${control.label} for ${destination.zoneName}`}
                  checked={enabled}
                  disabled={transition.kind === 'cut' || !bothTargets}
                  title={bothTargets ? undefined : 'Set targets on both adjacent clips first'}
                  onChange={(event) => {
                    if (!event.target.checked) return removeCell(destination.id)
                    updateDescriptor({}, { ...(descriptor?.fromByCellId ?? {}), [destination.id]: outgoing?.controlTargets[control.exportName] ?? control.defaultValue })
                  }}
                  className="h-3.5 w-3.5 accent-live"
                />
                {destination.zoneName}
              </label>
              {!bothTargets && <p className="mt-1 text-[9px] text-amber-300/70">Set this target on both adjacent clips first.</p>}
              {enabled && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <PercentageField
                    label={`${control.label} start ${destination.zoneName}`}
                    value={from}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(value) => updateDescriptor({}, { ...(descriptor?.fromByCellId ?? {}), [destination.id]: value })}
                  />
                  <PercentageField
                    label={`${control.label} target ${destination.zoneName}`}
                    value={destination.controlTargets[control.exportName] ?? control.defaultValue}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(value) => onUpdateDestinationControlTarget(destination.id, control.exportName, value)}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

const ROUTING_MODE_LABELS: Record<string, string> = {
  physical: 'physical pixel ranges',
  single: 'full surface',
  'stripes-x': 'left / right stripes',
  'stripes-y': 'top / bottom stripes',
  'grid-2x2': '2 x 2 grid',
  checker: 'checker',
  rings: 'rings',
  pinwheel: 'pinwheel',
  wave: 'wave',
  'soft-split': 'soft split',
  'split-x': 'moving split X',
  'split-y': 'moving split Y',
}

function routingModeLabel(layout: ShowRoutingLayout): string {
  return ROUTING_MODE_LABELS[routingModeValue(layout)] ?? routingModeValue(layout)
}

function routingModeValue(layout: ShowRoutingLayout): string {
  const logical = layout.logical
  if (!logical) return 'physical'
  if (logical.kind === 'single') return 'single'
  if (logical.kind === 'grid' && logical.columns === 2 && logical.rows === 2) return 'grid-2x2'
  if (logical.kind === 'stripes') return `stripes-${logical.axis}`
  if (logical.kind === 'checker') return 'checker'
  if (logical.kind === 'rings') return 'rings'
  if (logical.kind === 'pinwheel') return 'pinwheel'
  if (logical.kind === 'wave') return 'wave'
  if (logical.kind === 'soft-split') return 'soft-split'
  if (logical.kind === 'split') return `split-${logical.axis}`
  return 'physical'
}

function patchLogicalRouting<K extends ShowLogicalRouting['kind']>(
  logical: ShowLogicalRouting,
  kind: K,
  changes: Partial<Omit<Extract<ShowLogicalRouting, { kind: K }>, 'kind' | 'zoneIds'>>,
): ShowLogicalRouting {
  if (logical.kind !== kind) return logical
  return { ...logical, ...changes } as ShowLogicalRouting
}

function logicalRoutingForMode(
  mode: string,
  zoneIds: string[],
): ShowRoutingLayout['logical'] | undefined {
  if (mode === 'single') return { kind: 'single', zoneIds: [zoneIds[0]] }
  if (mode === 'grid-2x2') return { kind: 'grid', zoneIds: zoneIds.slice(0, 4), columns: 2, rows: 2 }
  if (mode === 'stripes-x' || mode === 'stripes-y') {
    return { kind: 'stripes', zoneIds: [...zoneIds], axis: mode === 'stripes-y' ? 'y' : 'x' }
  }
  if (mode === 'checker') {
    return { kind: 'checker', zoneIds: [zoneIds[0], zoneIds[1]], columns: 4, rows: 4 }
  }
  if (mode === 'rings') return { kind: 'rings', zoneIds: [...zoneIds], rings: 5 }
  if (mode === 'pinwheel') {
    return { kind: 'pinwheel', zoneIds: [...zoneIds], arms: 6, twist: Math.PI * 2 * 1.35, rotation: 0 }
  }
  if (mode === 'wave') {
    return { kind: 'wave', zoneIds: [...zoneIds], axis: 'x', bands: 4, amplitude: 0.3, frequency: 2.5, phase: 0 }
  }
  if (mode === 'soft-split') {
    return { kind: 'soft-split', zoneIds: [zoneIds[0], zoneIds[1]], axis: 'x', feather: 0.2 }
  }
  if (mode === 'split-x' || mode === 'split-y') {
    return { kind: 'split', zoneIds: [zoneIds[0], zoneIds[1]], axis: mode === 'split-y' ? 'y' : 'x' }
  }
  return undefined
}

function logicalRoutingDescription(
  layout: ShowRoutingLayout,
  zones: readonly { id: string; name: string }[],
): string {
  const logical = layout.logical
  if (!logical) return ''
  const issue = validateShowLogicalRouting(logical)[0]
  if (issue) return `Cannot compile this routing layout: ${issue}`
  const names = logical.zoneIds.map((zoneId) => zones.find((zone) => zone.id === zoneId)?.name ?? zoneId)
  if (logical.kind === 'single') return `${names[0]} receives the complete normalized Stage.`
  if (logical.kind === 'grid') return `${names.join(', ')} fill a ${logical.columns} x ${logical.rows} normalized grid.`
  if (logical.kind === 'stripes') return `${names.join(', ')} divide the normalized ${logical.axis.toUpperCase()} axis into equal position-based stripes.`
  if (logical.kind === 'checker') return `${names[0]} and ${names[1]} alternate across a ${logical.columns} x ${logical.rows} checker.`
  if (logical.kind === 'rings') return `${names.join(', ')} cycle through ${logical.rings} concentric rings.`
  if (logical.kind === 'pinwheel') {
    const twistTurns = Number((logical.twist / (Math.PI * 2)).toFixed(2))
    const rotationDegrees = Number((((logical.rotation ?? 0) * 180) / Math.PI).toFixed(1))
    return `${names.join(', ')} cycle through ${logical.arms ?? names.length} arms with ${twistTurns} turns of twist and ${rotationDegrees}° rotation.`
  }
  if (logical.kind === 'wave') return `${names.join(', ')} cycle through ${logical.bands} displaced bands along the normalized ${logical.axis.toUpperCase()} axis.`
  if (logical.kind === 'soft-split') return `${names[0]} and ${names[1]} blend across a movable ${logical.axis.toUpperCase()} boundary. Inside the feather, both Patterns render; outside it, only one renders.`
  if (logical.kind === 'split') return `${names[0]} and ${names[1]} share a normalized Stage axis. Boundary values move the split continuously.`
  return `${names.join(', ')} route by normalized Stage position.`
}

/**
 * The Show-properties values the existing inspector draws. Every field is the
 * same value the v1 record supplied directly; the authored-v2 record resolves
 * the identical facts, so one panel serves both backings (#1065).
 */
interface ShowSetupInspectorValue {
  name: string
  zoneCount: number
  nominalPixelCount: number
  outputContract: ShowRecord['outputContract']
  stageMapId: string | null | undefined
  targetControllerProfileId: string | undefined
  outputEffects: ShowRecord['outputEffects']
  loopDurationMs: number
  installationCoverage: ReturnType<typeof validateInstallationCoverage>
}

function ShowSetupInspector({
  value,
  controllerProfiles,
  userMaps,
  onUpdateTargetProfile,
  onUpdatePortableReference,
  onUpdateOutputTrails,
  compiledOutputEffects,
}: {
  value: ShowSetupInspectorValue
  controllerProfiles: ControllerProfile[]
  userMaps: MapRecord[]
  onUpdateTargetProfile: (targetControllerProfileId: string) => void
  onUpdatePortableReference: (referenceMapId: string | null, referencePixelCount: number) => void
  onUpdateOutputTrails: (input: SetShowOutputTrailsInput) => void
  compiledOutputEffects?: import('@/engine/showCompiler').ShowCompileSummary['outputEffects']
}) {
  const zonePixels = value.nominalPixelCount
  const contract = value.outputContract
  const outputMapId = contract?.kind === 'portable-2d'
    ? contract.referenceMapId
    : contract?.kind === 'installation'
      ? contract.outputMapId
      : value.stageMapId ?? null
  const outputMapName = [...STOCK_MAPS, ...userMaps].find((map) => map.id === outputMapId)?.name
  const installationCoverage = value.installationCoverage
  const coverageLayout = installationCoverage?.layouts[0]
  const portable = contract?.kind === 'portable-2d' ? contract : null
  const portableMaps = [...STOCK_MAPS, ...userMaps].filter((map) => map.dim === 2)
  const trails = normalizeShowOutputEffects(value.outputEffects).find((effect) => effect.kind === 'trails')
  const compiledTrails = compiledOutputEffects?.find((effect) => effect.kind === 'trails')
  return (
    <InspectorPanel family="Show" title={value.name} icon={<Settings2 size={13} aria-hidden />}>
      <div className="grid gap-3 md:grid-cols-2">
        {!portable && (
          <label className="text-[10px] uppercase text-zinc-600">
            Target controller
            <select
              aria-label="Target controller"
              value={value.targetControllerProfileId ?? ''}
              onChange={(event) => onUpdateTargetProfile(event.target.value)}
              className={`${field} mt-1 w-full`}
            >
              <option value="">automatic</option>
              {controllerProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.name}</option>
              ))}
            </select>
          </label>
        )}
        <div className="rounded border border-zinc-800 bg-zinc-950/55 p-2 text-[10px] uppercase text-zinc-600">
          Output contract
          {contract ? (
            <>
              <div className="mt-1 text-xs normal-case text-zinc-200">
                {contract.kind === 'portable-2d'
                  ? 'Portable · Resolution-independent 2D'
                  : 'Installation · Exact physical output'}
              </div>
              <div className="mt-1 normal-case text-zinc-500">
                <span>
                  {contract.kind === 'portable-2d'
                    ? `${contract.referencePixelCount} px reference`
                    : `${contract.pixelCount} px fixed`}
                </span>
                <span>{' · '}</span>
                <span>{outputMapName ?? (outputMapId ? 'Missing map' : 'No map')}</span>
              </div>
            </>
          ) : (
            <div className="mt-1 text-xs normal-case text-amber-300">Legacy · Not classified</div>
          )}
        </div>
        {portable && (
          <div className="rounded border border-zinc-800 bg-zinc-950/30 p-2 text-[10px] uppercase text-zinc-600">
            Artifact promise
            <div className="mt-1 text-xs normal-case text-zinc-200">
              Compatible 2D mapped surfaces at variable resolution.
            </div>
            <div className="mt-1 normal-case text-zinc-500">No exact LED identity, physical ranges, or 3D portability.</div>
          </div>
        )}
        {portable && (
          <div className="rounded border border-zinc-800 bg-zinc-950/55 p-2 text-[10px] uppercase text-zinc-600 md:col-span-2">
            Reference preview
            <div className="mt-1 grid gap-1.5 sm:grid-cols-[minmax(8rem,1fr)_7rem]">
              <select
                aria-label="Portable reference map"
                value={portable.referenceMapId ?? ''}
                onChange={(event) => onUpdatePortableReference(event.target.value || null, portable.referencePixelCount)}
                className={`${field} w-full normal-case`}
              >
                <option value="">Choose 2D map</option>
                {portableMaps.map((map) => <option key={map.id} value={map.id}>{map.name}</option>)}
              </select>
              <NumberField
                label="Portable reference pixels"
                hideLabel
                min={1}
                max={2000}
                step={1}
                value={portable.referencePixelCount}
                onChange={(referencePixelCount) => onUpdatePortableReference(portable.referenceMapId, referencePixelCount)}
              />
            </div>
            <div className="mt-1 normal-case text-zinc-500">Preview only; changing it does not rewrite choreography.</div>
          </div>
        )}
        {coverageLayout && (
          <div className={`rounded border p-2 text-[10px] uppercase ${coverageLayout.valid
            ? 'border-emerald-900/60 bg-emerald-950/15 text-emerald-500'
            : 'border-amber-800/60 bg-amber-950/20 text-amber-300'}`}
          >
            Physical coverage
            <div className="mt-1 text-xs normal-case text-zinc-300">
              {coverageLayout.layoutName} assigns {coverageLayout.assignedPixelCount} of {coverageLayout.totalPixelCount} pixels
              {coverageLayout.valid
                ? ' exactly once.'
                : ` (${[
                    coverageLayout.missingPixelCount ? `${coverageLayout.missingPixelCount} missing` : null,
                    coverageLayout.overlappingPixelCount ? `${coverageLayout.overlappingPixelCount} overlapping` : null,
                    coverageLayout.outOfRangePixelCount ? `${coverageLayout.outOfRangePixelCount} out of range` : null,
                  ].filter(Boolean).join(', ')}).`}
            </div>
          </div>
        )}
        <div className="rounded border border-zinc-800 bg-zinc-950/55 p-2 text-[10px] uppercase text-zinc-600">
          Loop
          <div className="mt-1 text-xs text-zinc-300">{formatDuration(value.loopDurationMs)}</div>
        </div>
        <div className="rounded border border-zinc-800 bg-zinc-950/55 p-2 text-[10px] uppercase text-zinc-600">
          Zones
          <div className="mt-1 text-xs text-zinc-300">
            {value.zoneCount} zone{value.zoneCount === 1 ? '' : 's'}{portable ? ' · logical' : ` - ${zonePixels} px`}
          </div>
        </div>
      </div>
      <p className="mt-3 text-[10px] text-zinc-500">
        {portable
          ? 'Portable routing uses normalized Stage positions at runtime.'
          : 'Using saved physical ranges, or nominal zone sizes until they are set, for compile estimates.'}
        {' '}Zones are authored in the Zone Map on the Timeline; each Layout interval owns its Zone Layout there.
      </p>
      <div className="mt-4 border-t border-zinc-800 pt-3">
        <div className="mb-2 flex items-center gap-2">
          <WandSparkles size={13} aria-hidden className="text-cyan-400/75" />
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Show output</h4>
        </div>
        <div className="rounded border border-zinc-800 bg-zinc-950/55 p-2.5">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[10px] font-medium text-zinc-300">
              <input
                aria-label="Enable Trails"
                type="checkbox"
                checked={Boolean(trails)}
                onChange={(event) => onUpdateOutputTrails({ enabled: event.target.checked })}
                className="accent-live"
              />
              Trails
            </label>
            {trails && (
              <div className="w-32 min-w-0">
                <PercentageField
                  compact
                  label="Retention"
                  ariaLabel="Trails retention"
                  min={0}
                  max={1}
                  step={0.015625}
                  value={trails.retention}
                  onChange={(retention) => onUpdateOutputTrails({ enabled: true, retention })}
                />
              </div>
            )}
          </div>
          <p className="mt-1.5 text-[9px] leading-4 text-zinc-500">
            Retains brighter linear-RGB pixels from the previous frame. Scrubbing clears trail history at the destination; normal playback and Controller output remain continuous.
          </p>
          {compiledTrails?.status === 'rejected' && (
            <p role="status" className="mt-1 text-[9px] leading-4 text-amber-300/85">
              Trails are unavailable for this Show because another required cache owns the frame arena ({compiledTrails.reason}).
            </p>
          )}
        </div>
      </div>
    </InspectorPanel>
  )
}

/** The record-level facts the Zone Layout inspector reads around one Layout. */
interface ShowZoneLayoutInspectorContext {
  outputContract: ShowRecord['outputContract']
  zones: readonly { id: string; name: string }[]
  layoutCount: number
}

/** One Layout occurrence, in the only vocabulary this inspector reads. */
interface ShowZoneLayoutInspectorUse {
  id: string
  layoutId: string
  startMs: number
  endMs: number
}

function ZoneLayoutInspector({
  context,
  layout,
  intervals,
  selectedIntervalId,
  onAddRoutingLayout,
  onUpdateRoutingLayout,
  onRemoveRoutingLayout,
  onMakeIntervalUnique,
}: {
  context: ShowZoneLayoutInspectorContext
  layout: ShowRoutingLayout
  intervals: readonly ShowZoneLayoutInspectorUse[]
  selectedIntervalId?: string
  onAddRoutingLayout: (sourceLayoutId?: string) => void
  onUpdateRoutingLayout: (layoutId: string, changes: Partial<Omit<ShowRoutingLayout, 'id'>>) => void
  onRemoveRoutingLayout: (layoutId: string) => void
  onMakeIntervalUnique?: (intervalId: string) => void
}) {
  const portable = context.outputContract?.kind === 'portable-2d' ? context.outputContract : null
  const uses = intervals.filter((interval) => interval.layoutId === layout.id)
  // The selected linked duplicate can unlink right here, matching Groups
  // (#795); previously this lived only in the Add popover.
  const selectedInterval = selectedIntervalId
    ? uses.find((interval) => interval.id === selectedIntervalId)
    : undefined
  return (
    <InspectorPanel family="Zone Layout" title={routingModeLabel(layout)} icon={<Route size={13} aria-hidden />}>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          aria-label={`Duplicate Zone Layout ${layout.name}`}
          title={`Duplicate ${layout.name}`}
          onClick={() => onAddRoutingLayout(layout.id)}
          className="flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <Copy size={13} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`Remove Zone Layout ${layout.name}`}
          title={`Remove ${layout.name}`}
          onClick={() => onRemoveRoutingLayout(layout.id)}
          disabled={context.layoutCount <= 1}
          className="flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:bg-red-950/30 hover:text-red-300 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-zinc-500"
        >
          <Trash2 size={13} aria-hidden />
        </button>
      </div>
      <p className="mt-2 text-[10px] leading-4 text-zinc-500">
        {uses.length === 0
          ? 'Not on the timeline.'
          : `On the timeline ${formatShowTime(uses[0].startMs)}-${formatShowTime(uses[uses.length - 1].endMs)}${uses.length > 1 ? ` across ${uses.length} intervals` : ''}.`}
      </p>
      {selectedInterval && uses.length > 1 && onMakeIntervalUnique && (
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-zinc-800/80 pt-2">
          <span className="text-[10px] text-zinc-500">{uses.length} linked uses</span>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => onMakeIntervalUnique(selectedInterval.id)}
          >
            <WandSparkles size={12} aria-hidden /> Make this Layout unique
          </Button>
        </div>
      )}
      <label className="mt-2 block text-[9.5px] uppercase text-zinc-600">
        Routing mode
        <select
          aria-label={`${layout.name} routing mode`}
          value={routingModeValue(layout)}
          onChange={(event) => {
            const value = event.target.value
            onUpdateRoutingLayout(layout.id, {
              logical: logicalRoutingForMode(value, context.zones.map((zone) => zone.id)),
            })
          }}
          className={`${field} mt-1 w-full max-w-xs`}
        >
          {!portable && <option value="physical">physical pixel ranges</option>}
          {portable && <option value="single">full surface</option>}
          <option value="stripes-x">left / right stripes</option>
          <option value="stripes-y">top / bottom stripes</option>
          <option value="grid-2x2" disabled={context.zones.length < 4}>2 x 2 grid</option>
          <option value="checker" disabled={context.zones.length < 2}>checker</option>
          <option value="rings">rings</option>
          <option value="pinwheel">pinwheel</option>
          <option value="wave">wave</option>
          <option value="soft-split" disabled={context.zones.length < 2}>soft split</option>
          <option value="split-x">moving split X</option>
          <option value="split-y">moving split Y</option>
        </select>
      </label>
      {layout.logical?.kind === 'checker' && (
        <div className="mt-2 grid max-w-xs grid-cols-2 gap-2">
          <NumberField
            label="Columns"
            ariaLabel="Checker columns"
            min={1}
            step={1}
            value={layout.logical.columns}
            onChange={(columns) => onUpdateRoutingLayout(layout.id, {
              logical: patchLogicalRouting(layout.logical!, 'checker', {
                columns: Math.max(1, Math.round(columns)),
              }),
            })}
          />
          <NumberField
            label="Rows"
            ariaLabel="Checker rows"
            min={1}
            step={1}
            value={layout.logical.rows}
            onChange={(rows) => onUpdateRoutingLayout(layout.id, {
              logical: patchLogicalRouting(layout.logical!, 'checker', {
                rows: Math.max(1, Math.round(rows)),
              }),
            })}
          />
        </div>
      )}
      {layout.logical?.kind === 'rings' && (
        <div className="mt-2 max-w-[9.5rem]">
          <NumberField
            label="Ring count"
            min={1}
            step={1}
            value={layout.logical.rings}
            onChange={(rings) => onUpdateRoutingLayout(layout.id, {
              logical: patchLogicalRouting(layout.logical!, 'rings', {
                rings: Math.max(1, Math.round(rings)),
              }),
            })}
          />
        </div>
      )}
      {layout.logical?.kind === 'pinwheel' && (
        <div className="mt-2 grid max-w-xl grid-cols-3 gap-2">
          <NumberField
            label="Arms"
            ariaLabel="Pinwheel arms"
            min={1}
            step={1}
            value={layout.logical.arms ?? layout.logical.zoneIds.length}
            onChange={(arms) => onUpdateRoutingLayout(layout.id, {
              logical: patchLogicalRouting(layout.logical!, 'pinwheel', {
                arms: Math.max(1, Math.round(arms)),
              }),
            })}
          />
          <NumberField
            label="Twist turns"
            ariaLabel="Pinwheel twist turns"
            step={0.05}
            value={Number((layout.logical.twist / (Math.PI * 2)).toFixed(3))}
            onChange={(twistTurns) => onUpdateRoutingLayout(layout.id, {
              logical: patchLogicalRouting(layout.logical!, 'pinwheel', {
                twist: twistTurns * Math.PI * 2,
              }),
            })}
          />
          <NumberField
            label="Rotation °"
            ariaLabel="Pinwheel rotation degrees"
            step={1}
            value={Number((((layout.logical.rotation ?? 0) * 180) / Math.PI).toFixed(2))}
            onChange={(rotationDegrees) => onUpdateRoutingLayout(layout.id, {
              logical: patchLogicalRouting(layout.logical!, 'pinwheel', {
                rotation: rotationDegrees * Math.PI / 180,
              }),
            })}
          />
        </div>
      )}
      {layout.logical?.kind === 'wave' && (
        <div className="mt-2 grid max-w-2xl grid-cols-2 gap-2 sm:grid-cols-5">
          <label className="text-[9.5px] uppercase text-zinc-600">
            Axis
            <select
              aria-label="Wave axis"
              value={layout.logical.axis}
              onChange={(event) => onUpdateRoutingLayout(layout.id, {
                logical: patchLogicalRouting(layout.logical!, 'wave', { axis: event.target.value === 'y' ? 'y' : 'x' }),
              })}
              className={`${field} mt-1 w-full`}
            >
              <option value="x">X</option>
              <option value="y">Y</option>
            </select>
          </label>
          <NumberField
            label="Bands"
            ariaLabel="Wave band count"
            min={1}
            step={1}
            value={layout.logical.bands}
            onChange={(bands) => onUpdateRoutingLayout(layout.id, {
              logical: patchLogicalRouting(layout.logical!, 'wave', { bands: Math.max(1, Math.round(bands)) }),
            })}
          />
          <PercentageField
            key={layout.logical.amplitude}
            label="Wave amplitude"
            value={layout.logical.amplitude}
            min={0}
            max={1}
            step={0.05}
            onChange={(amplitude) => onUpdateRoutingLayout(layout.id, {
              logical: patchLogicalRouting(layout.logical!, 'wave', { amplitude }),
            })}
          />
          <NumberField
            label="Frequency"
            ariaLabel="Wave frequency"
            min={0}
            step={0.1}
            value={layout.logical.frequency}
            onChange={(frequency) => onUpdateRoutingLayout(layout.id, {
              logical: patchLogicalRouting(layout.logical!, 'wave', { frequency: Math.max(0, frequency) }),
            })}
          />
          <NumberField
            label="Phase"
            ariaLabel="Wave phase"
            step={0.05}
            value={layout.logical.phase}
            onChange={(phase) => onUpdateRoutingLayout(layout.id, {
              logical: patchLogicalRouting(layout.logical!, 'wave', { phase }),
            })}
          />
        </div>
      )}
      {layout.logical?.kind === 'soft-split' && (
        <div className="mt-2 grid max-w-xs grid-cols-2 gap-2">
          <label className="text-[9.5px] uppercase text-zinc-600">
            Axis
            <select
              aria-label="Soft Split axis"
              value={layout.logical.axis}
              onChange={(event) => onUpdateRoutingLayout(layout.id, {
                logical: patchLogicalRouting(layout.logical!, 'soft-split', { axis: event.target.value === 'y' ? 'y' : 'x' }),
              })}
              className={`${field} mt-1 w-full`}
            >
              <option value="x">X</option>
              <option value="y">Y</option>
            </select>
          </label>
          <PercentageField
            key={layout.logical.feather}
            label="Soft Split feather"
            value={layout.logical.feather}
            min={0}
            max={1}
            step={0.05}
            onChange={(feather) => onUpdateRoutingLayout(layout.id, {
              logical: patchLogicalRouting(layout.logical!, 'soft-split', { feather }),
            })}
          />
        </div>
      )}
      {layout.logical ? (
        <p className="mt-2 rounded border border-zinc-800 bg-zinc-950/30 px-2 py-1.5 text-[10px] leading-4 text-zinc-500">
          {logicalRoutingDescription(layout, context.zones)}
        </p>
      ) : (
      <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {context.zones.map((zone) => {
          const layoutZone = layout.zones.find((candidate) => candidate.zoneId === zone.id)
          return (
            <label key={zone.id} className="text-[9.5px] uppercase text-zinc-600">
              {zone.name} ranges
              <DraftTextField
                ariaLabel={`${layout.name} ${zone.name} pixel ranges`}
                value={formatShowRoutingRanges(layoutZone?.ranges ?? [])}
                parse={parseShowRoutingRanges}
                invalidDraftReason="Ranges look like 0-63, 128-191."
                onApply={(ranges) => {
                  onUpdateRoutingLayout(layout.id, {
                    zones: layout.zones.map((candidate) => candidate.zoneId === zone.id
                      ? { ...candidate, ranges }
                      : candidate),
                  })
                }}
                className="mt-1 w-full"
                inputClassName={`${field} w-full font-mono`}
                inputProps={{ placeholder: '0-63, 128-191' }}
              />
            </label>
          )
        })}
      </div>
      )}
    </InspectorPanel>
  )
}

/** The record-level facts the Zone inspector reads around one Zone. */
interface ShowZoneInspectorContext {
  outputContract: ShowRecord['outputContract']
  zoneCount: number
  /** Resolved binding for this Zone, as `resolveShowZonePixelCount` reports it. */
  binding: { source: 'physical' | 'nominal'; pixelCount: number } | null
}

function ZoneInspector({
  context,
  zone,
  spatialSelectionUnavailableReason,
  onOpenSpatialSelection,
  onUpdateZone,
  onRemoveZone,
}: {
  context: ShowZoneInspectorContext
  zone: ShowRecord['zones'][number]
  spatialSelectionUnavailableReason: string | null
  onOpenSpatialSelection: () => void
  onUpdateZone: (changes: Partial<ShowRecord['zones'][number]>) => void
  onRemoveZone: () => void
}) {
  return (
    <InspectorPanel family="Zone" title={zone.name} icon={<MapIcon size={13} aria-hidden />}>
      <div className="grid gap-2 rounded border border-zinc-800 bg-zinc-950/55 p-2 md:grid-cols-[minmax(140px,1fr)_96px_36px]">
        <label className="flex min-w-0 items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: zone.color ?? '#38bdf8' }} />
          <DraftTextField
            ariaLabel={`Zone name ${zone.name}`}
            value={zone.name}
            formatApplied={(_, draft) => draft.trim() || zone.name}
            onApply={(name) => onUpdateZone({ name: name.trim() || zone.name })}
            className="min-w-0 flex-1"
            inputClassName={`${field} w-full`}
          />
        </label>
        {context.outputContract?.kind !== 'portable-2d' && (
          <NumberField
            hideLabel
            label={`Nominal pixels ${zone.name}`}
            value={zone.nominalPixelCount}
            min={1}
            step={1}
            onChange={(nominalPixelCount) => onUpdateZone({ nominalPixelCount })}
          />
        )}
        <span className="inline-flex">
          <button
            type="button"
            aria-label={`Remove zone ${zone.name}`}
            title={context.zoneCount > 1 ? `Remove ${zone.name}` : undefined}
            onClick={() => { if (context.zoneCount > 1) onRemoveZone() }}
            aria-disabled={context.zoneCount <= 1 || undefined}
            aria-describedby={context.zoneCount <= 1 ? `zone-remove-reason-${zone.id}` : undefined}
            className="flex h-7 w-7 items-center justify-center rounded border border-zinc-800 text-zinc-500 hover:border-red-900/70 hover:text-red-300 aria-disabled:opacity-30 aria-disabled:hover:border-zinc-800 aria-disabled:hover:text-zinc-500"
          >
            <Trash2 size={13} />
          </button>
          {context.zoneCount <= 1 && (
            <DisabledReasonTip id={`zone-remove-reason-${zone.id}`}>A Show needs at least one Zone.</DisabledReasonTip>
          )}
        </span>
        <div className="text-[10px] uppercase tracking-wider md:col-span-3">
          {context.outputContract?.kind === 'portable-2d'
            ? <span className="text-zinc-400">logical - normalized position membership</span>
            : <ZoneBindingStatus binding={context.binding} zone={zone} />}
        </div>
        {context.outputContract?.kind === 'installation' && (
          <div className="flex flex-wrap items-center gap-2 md:col-span-3">
            <button
              type="button"
              aria-label={`Select ${zone.name} LEDs on output map`}
              disabled={spatialSelectionUnavailableReason !== null}
              onClick={onOpenSpatialSelection}
              className="h-7 rounded border border-amber-500/30 bg-amber-500/10 px-2.5 text-[10px] font-semibold text-amber-200 hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-zinc-900 disabled:text-zinc-600"
            >
              Select LEDs on map
            </button>
            {spatialSelectionUnavailableReason && <span className="text-[10px] normal-case tracking-normal text-zinc-600">{spatialSelectionUnavailableReason}</span>}
          </div>
        )}
      </div>
    </InspectorPanel>
  )
}

function ZoneBindingStatus({
  binding,
  zone,
}: {
  binding: ShowZoneInspectorContext['binding']
  zone: ShowRecord['zones'][number]
}) {
  if (binding?.source === 'physical') {
    return <span className="text-green-400">physical - {binding.pixelCount} px</span>
  }
  return <span className="text-zinc-500">nominal - {zone.nominalPixelCount} px</span>
}

function CompileBar({
  compiled,
  artifactInventory,
  controllerDelivery,
  pushResult,
}: {
  compiled: CompiledShowState
  artifactInventory: {
    inventory: DeliveredShowSourceInventory
    model: ShowArtifactInventoryModel
  } | null
  controllerDelivery?: { totalBytes: number; transformBytes: number } | null
  pushResult: string | null
}) {
  const outlet = useContext(ShowSourceOutletContext)
  if (compiled.error) {
    const errorNotice = (
      <div className="flex min-h-10 shrink-0 items-center gap-2 border-t border-seam bg-zinc-950 px-3 font-mono text-xs text-amber-300">
        <Zap size={14} aria-hidden />
        {presentShowDiagnostic(compiled.error)}
      </div>
    )
    return outlet.enabled
      ? outlet.target && createPortal(<ShowStripSection label="Source code" summary={presentShowDiagnostic(compiled.error)}>{errorNotice}</ShowStripSection>, outlet.target)
      : errorNotice
  }
  const summary = compiled.artifact?.summary
  // Gauge and inventory share one numerator: the source offered to the
  // Controller compiler. The scale is advisory; real resource gates remain
  // separate (#63, #849).
  const deliveredBytes = controllerDelivery?.totalBytes
    ?? artifactInventory?.inventory.totalBytes
    ?? summary?.artifactBytes
    ?? 0
  const deliveredRatio = summary ? deliveredBytes / summary.measuredDeviceBudgetBytes : 0
  const pressure = summary ? assessShowCompilePressure({
    deliveredSourceBytes: deliveredBytes,
    budgetBytes: summary.measuredDeviceBudgetBytes,
    worstInstantRenderersPerPixel: summary.worstInstantRenderersPerPixel,
  }) : null
  // Renderer pressure must not tint the byte gauge, so its color comes from a
  // bytes-only assessment of the same delivered numerator.
  const sourcePressure = summary ? assessShowCompilePressure({
    deliveredSourceBytes: deliveredBytes,
    budgetBytes: summary.measuredDeviceBudgetBytes,
    worstInstantRenderersPerPixel: 0,
  }) : null
  if (outlet.enabled) return outlet.target && createPortal(
    <>
    <ShowStripSection label="Source code" summary={summary && <>
      <span className="show-source-thermometer" aria-label={`${controllerDelivery ? 'Controller' : 'Show'} source ${formatBytes(deliveredBytes)} / ${formatBytes(summary.measuredDeviceBudgetBytes)} advisory.`}>
        <span className={sourcePressure?.sourceStatus === 'over' ? 'bg-red-500' : sourcePressure?.sourceStatus === 'warning' ? 'bg-amber-400' : 'bg-live'} style={{ width: `${Math.min(100, deliveredRatio * 100)}%` }} />
      </span>
      <span>{formatBytes(deliveredBytes)} / {formatBytes(summary.measuredDeviceBudgetBytes)}</span>
      <span className="panel-readout-dot">·</span>
      <span>VM {summary.resources.totalWords.toLocaleString('en-US')}/{summary.resources.vmWordBudget.toLocaleString('en-US')} words</span>
      <span className="panel-readout-dot">·</span>
      <span>up to {summary.creatorPatternPressure.patternCopiesRunning.worst} copies</span>
    </>}>
      {summary && artifactInventory && (
        <ShowArtifactInventoryBody
          inventory={artifactInventory.inventory}
          model={artifactInventory.model}
          vmWords={{
            used: summary.resources.totalWords,
            budget: summary.resources.vmWordBudget,
            remaining: summary.resources.remainingWords,
          }}
          renderers={{
            controller: {
              steady: summary.creatorPatternPressure.patternCopiesRunning.steady,
              worst: summary.creatorPatternPressure.patternCopiesRunning.worst,
            },
            perPixel: {
              steady: summary.creatorPatternPressure.patternCalculationsPerPixel.steady,
              worst: summary.creatorPatternPressure.patternCalculationsPerPixel.worst,
            },
          }}
          structure={{
            transitionCount: summary.transitionCount,
          }}
          delivery={controllerDelivery ?? undefined}
        />
      )}
    </ShowStripSection>
      <div className="show-source-notices flex flex-col gap-1 text-[10px]">
      {compiled.artifactBlocker && (
        <span className="text-red-300" title={presentShowDiagnostic(compiled.artifactBlocker)}>
          Output blocked: {presentShowTrayDiagnostic(compiled.artifactBlocker)}
        </span>
      )}
      {pressure?.blocks.map((block) => <span key={block} className="text-red-300">Output blocked: {block}</span>)}
      {pressure?.warnings.map((warning) => <span key={warning} className="text-amber-300">{warning}</span>)}
      {summary?.warnings.map((warning) => (
        <span key={warning} className="text-amber-300" title={presentShowDiagnostic(warning)}>
          {presentShowTrayDiagnostic(warning)}
        </span>
      ))}
      {pushResult && <span className="text-zinc-300">{pushResult}</span>}
      </div>
    </>, outlet.target,
  )
  return (
    <div data-testid="show-compile-bar" className="scrollbar-hidden min-h-8 shrink-0 overflow-x-auto border-t border-seam bg-zinc-950 px-3 font-mono text-[10px] text-zinc-500">
      <div className="flex min-h-8 min-w-max items-center gap-2 whitespace-nowrap">
      <span>Show source</span>
      <span
        className="h-2 w-28 overflow-hidden rounded-sm bg-zinc-800"
        aria-label={summary
          ? `${controllerDelivery ? 'Controller' : 'Show'} source ${formatBytes(deliveredBytes)} / ${formatBytes(summary.measuredDeviceBudgetBytes)} advisory.`
          : undefined}
        title={summary
          ? `${controllerDelivery ? 'Controller' : 'Show'} source ${formatBytes(deliveredBytes)} / ${formatBytes(summary.measuredDeviceBudgetBytes)} advisory.`
          : undefined}
      >
        <span
          className={`block h-full ${sourcePressure?.sourceStatus === 'over' ? 'bg-red-500' : sourcePressure?.sourceStatus === 'warning' ? 'bg-amber-400' : 'bg-live'}`}
          style={{ width: `${Math.min(100, deliveredRatio * 100)}%` }}
        />
      </span>
      {summary && artifactInventory ? (
        <ShowArtifactInventoryPopover
          inventory={artifactInventory.inventory}
          model={artifactInventory.model}
          vmWords={{
            used: summary.resources.totalWords,
            budget: summary.resources.vmWordBudget,
            remaining: summary.resources.remainingWords,
          }}
          renderers={{
            controller: {
              steady: summary.creatorPatternPressure.patternCopiesRunning.steady,
              worst: summary.creatorPatternPressure.patternCopiesRunning.worst,
            },
            perPixel: {
              steady: summary.creatorPatternPressure.patternCalculationsPerPixel.steady,
              worst: summary.creatorPatternPressure.patternCalculationsPerPixel.worst,
            },
          }}
          structure={{
            transitionCount: summary.transitionCount,
          }}
          delivery={controllerDelivery ?? undefined}
        />
      ) : (
        <b className="text-zinc-300">-</b>
      )}
      {controllerDelivery && controllerDelivery.transformBytes > 0 && (
        <span className="text-zinc-300">Controller transforms +{formatBytes(controllerDelivery.transformBytes)}</span>
      )}
      {summary?.resources && (
        <span className={summary.resources.remainingWords < 0 ? 'text-red-300' : 'text-zinc-300'}>
          VM {summary.resources.totalWords.toLocaleString('en-US')}/{summary.resources.vmWordBudget.toLocaleString('en-US')} words
        </span>
      )}
      {compiled.artifactBlocker && (
        <span className="text-red-300" title={presentShowDiagnostic(compiled.artifactBlocker)}>
          Output blocked: {presentShowTrayDiagnostic(compiled.artifactBlocker)}
        </span>
      )}
      {pressure?.blocks.map((block) => <span key={block} className="text-red-300">Output blocked: {block}</span>)}
      {pressure?.warnings.map((warning) => <span key={warning} className="text-amber-300">{warning}</span>)}
      {summary?.warnings.map((warning) => (
        <span key={warning} className="text-amber-300" title={presentShowDiagnostic(warning)}>
          {presentShowTrayDiagnostic(warning)}
        </span>
      ))}
      {pushResult && <span className="text-zinc-300">{pushResult}</span>}
      </div>
    </div>
  )
}

// Shared draft-buffered numeric field (#577) in the editor-panel style.
function NumberField(props: Omit<UiNumberFieldProps, 'variant' | 'align' | 'disabled'>) {
  return <UiNumberField variant="editor" {...props} />
}

function TimeField(props: Omit<UiTimeFieldProps, 'variant' | 'align' | 'ariaLabel' | 'disabled'>) {
  return <UiTimeField variant="editor" {...props} />
}

function PercentageField(props: Omit<UiPercentageFieldProps, 'variant' | 'align' | 'disabled'>) {
  return <UiPercentageField variant="editor" {...props} />
}

function DomainNumberField(props: Omit<UiDomainNumberFieldProps, 'variant' | 'align' | 'ariaLabel' | 'disabled'>) {
  return <UiDomainNumberField variant="editor" {...props} />
}

function ClipSummaryInline({
  summary,
  previousSummary,
}: {
  summary: ShowClipSummarySection[]
  previousSummary: ShowClipSummarySection[] | null
}) {
  const timelineSummary = projectShowClipTimelineSummary(summary, previousSummary)
  return (
    <span
      aria-hidden
      title={showClipInlineSummary(summary)}
      className="show-clip-summary-inline relative z-10 flex min-w-0 items-center gap-0.5 overflow-hidden whitespace-nowrap text-[10px] text-zinc-500 [text-shadow:0_1px_2px_rgba(0,0,0,0.95)]"
    >
      {summary.length === 0 && <span className="show-clip-summary-copy shrink-0">defaults</span>}
      {timelineSummary.map((section) => {
        // Boolean facts show as a glyph alone (empty display value).
        const values = section.items.filter((item) => item.showValue && item.displayValue !== undefined)
        return (
          <span
            key={section.kind}
            data-show-clip-summary-has-value={values.length > 0 ? 'true' : 'false'}
            className={`show-clip-summary-section inline-flex min-w-max items-center gap-1 ${values.length > 0 ? 'mr-1.5 last:mr-0' : ''}`}
          >
            {values.length === 0 && <ClipSummaryIcon kind={section.kind} size={10} />}
            {values.map((item, index) => (
              <span key={item.id} className="show-clip-summary-value inline-flex items-center gap-1 font-mono text-zinc-400">
                {index > 0 && <span className="text-zinc-700">·</span>}
                {(index === 0 || values[index - 1].glyph !== item.glyph) && (
                  <span className="inline-flex text-zinc-500"><ClipTimelineGlyph glyph={item.glyph} size={10} /></span>
                )}
                {item.displayValue !== '' && <ClipTimelineValue text={item.displayValue ?? ''} />}
              </span>
            ))}
          </span>
        )
      })}
    </span>
  )
}

function compatibilityCellForTimelineClip(
  show: ShowRecord,
  clip: Pick<ShowUnifiedTimelineClipProjection, 'id' | 'segmentIds' | 'sceneId' | 'zoneId'>,
): ShowCell | null {
  const segmentIds = new Set(clip.segmentIds ?? [clip.id])
  return show.cells.find((cell) => {
    const baseId = `placement-${cell.id}-${clip.sceneId}`
    return segmentIds.has(baseId) || segmentIds.has(`${baseId}-${clip.zoneId}`)
  }) ?? null
}

function ClipConfigurationSummary({
  summary,
  animationCount,
  animationButtonRef,
  onAnimationsClick,
  destinationForItem,
  onNavigate,
}: {
  summary: ShowClipSummarySection[]
  animationCount?: number
  animationButtonRef?: RefObject<HTMLButtonElement | null>
  onAnimationsClick?: () => void
  destinationForItem?: (
    section: ShowClipSummarySection,
    item: ShowClipSummaryItem,
  ) => ShowClipSummaryDestination | null
  onNavigate?: (destination: ShowClipSummaryDestination) => void
}) {
  const visibleSummary = animationCount === undefined || animationCount === 0
    ? summary
    : summary.filter((section) => section.kind !== 'animation')
  return (
    <section
      role="region"
      aria-label="Clip summary"
      title={showClipInlineSummary(visibleSummary)}
      className="mt-0.5 flex max-h-7 min-h-3 flex-wrap items-center gap-x-3 gap-y-0.5 overflow-hidden font-mono text-[9px]"
    >
      {visibleSummary.length === 0 && !animationCount && <span className="text-zinc-600">Defaults</span>}
      {visibleSummary.map((section) => (
        <span
          key={section.kind}
          role="group"
          aria-label={`${section.label} summary`}
          className="inline-flex min-w-0 items-center gap-1.5"
        >
          <span
            title={section.label}
            aria-label={section.label}
            className={clipSummaryTone(section.kind)}
          >
            <ClipSummaryIcon kind={section.kind} size={11} />
          </span>
          {section.items.map((item, index) => {
            const destination = destinationForItem?.(section, item) ?? null
            const icon = clipSummaryItemIcon(section.kind, item.id)
            const content = (
              <>
                {index > 0 && <span aria-hidden className="mr-1.5 text-zinc-700">·</span>}
                {icon && (
                  <span aria-hidden className="mr-1 inline-flex translate-y-px text-zinc-500">
                    <ClipSummaryItemIcon icon={icon} size={11} />
                  </span>
                )}
                <span className="text-zinc-400">{item.label}</span>
                {item.value && (
                  <strong className={`ml-1 font-medium ${item.animated ? 'text-violet-300' : 'text-zinc-100'}`}>
                    {item.value}
                  </strong>
                )}
              </>
            )
            return destination ? (
              <button
                key={item.id}
                type="button"
                aria-label={`${item.label}${item.value ? ` ${item.value}` : ''}; go to ${destination.destinationLabel}`}
                onClick={() => onNavigate?.(destination)}
                className="inline-flex items-baseline whitespace-nowrap rounded border-0 bg-transparent p-0 text-left hover:bg-zinc-800/70 focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-300"
              >
                {content}
              </button>
            ) : (
              <span key={item.id} className="inline-flex items-baseline whitespace-nowrap">
                {content}
              </span>
            )
          })}
        </span>
      ))}
      {animationCount !== undefined && animationCount > 0 && (
        <button
          ref={animationButtonRef}
          type="button"
          aria-label={`Animations — ${animationCount}`}
          onClick={onAnimationsClick}
          className="inline-flex h-5 items-center gap-1 rounded px-1 text-violet-300/90 hover:bg-violet-300/10 hover:text-violet-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-violet-200"
        >
          <Activity size={11} aria-hidden />
          <span>Animations — {animationCount}</span>
        </button>
      )}
    </section>
  )
}

function ClipSummaryIcon({ kind, size }: { kind: ShowClipSummaryKind; size: number }) {
  if (kind === 'playback') return <Clock3 size={size} aria-hidden />
  if (kind === 'controls') return <SlidersHorizontal size={size} aria-hidden />
  if (kind === 'view') return <Eye size={size} aria-hidden />
  if (kind === 'effects') return <WandSparkles size={size} aria-hidden />
  return <Activity size={size} aria-hidden />
}

type ClipSummaryItemIconKind = 'brightness' | 'transform' | 'rotation' | 'viewport'

/**
 * Distinct glyphs inside the View family (#666): Sun for Brightness, Move for
 * position/scale Transform facts, a circular arrow for Rotation, an empty
 * rectangle for Viewport. The Eye stays for opacity, mirror, and phase,
 * whether the fact is set or animated.
 */
function clipSummaryItemIcon(kind: ShowClipSummaryKind, itemId: string): ClipSummaryItemIconKind | null {
  if (kind !== 'view') return null
  if (itemId === 'brightness') return 'brightness'
  if (itemId === 'transform-rotation') return 'rotation'
  if (itemId.startsWith('transform-')) return 'transform'
  if (itemId === 'viewport' || itemId.startsWith('viewport-')) return 'viewport'
  return null
}

function ClipSummaryItemIcon({ icon, size }: { icon: ClipSummaryItemIconKind; size: number }) {
  if (icon === 'brightness') return <Sun size={size} aria-hidden />
  if (icon === 'transform') return <Move size={size} aria-hidden />
  if (icon === 'rotation') return <RotateCw size={size} aria-hidden />
  return <Square size={size} aria-hidden />
}

const TIMELINE_COLOR_TOKEN = /(#[0-9a-f]{6}\b)(?: \/ (?=#[0-9a-f]{6}\b))?/gi

/**
 * Clip-row value text with each `#rrggbb` token drawn as a swatch (#63): a
 * colour is its own smallest representation. Adjacent swatches drop the
 * ` / ` between them. The hex stays in the tooltip and Clip Detail.
 */
function ClipTimelineValue({ text }: { text: string }) {
  const parts = text.split(TIMELINE_COLOR_TOKEN)
  if (parts.length === 1) return <span>{text}</span>
  return (
    <span className="inline-flex items-center gap-0.5">
      {parts.map((part, index) => (
        index % 2 === 1
          ? (
            <span
              key={index}
              className="show-clip-summary-swatch inline-block h-2 w-2 shrink-0 rounded-full ring-1 ring-zinc-600"
              style={{ backgroundColor: part }}
            />
          )
          : part ? <span key={index}>{part}</span> : null
      ))}
    </span>
  )
}

/** Glyph that leads a fact on the timeline Clip row (#63); see ShowClipTimelineGlyph. */
function ClipTimelineGlyph({ glyph, size }: { glyph: ShowClipTimelineGlyph; size: number }) {
  if (glyph === 'clock') return <Clock3 size={size} aria-hidden />
  if (glyph === 'restart') return <SkipBack size={size} aria-hidden />
  if (glyph === 'shutter') return <Lightbulb size={size} aria-hidden />
  if (glyph === 'controls') return <SlidersHorizontal size={size} aria-hidden />
  if (glyph === 'sun') return <Sun size={size} aria-hidden />
  if (glyph === 'mirror') return <FlipHorizontal2 size={size} aria-hidden />
  if (glyph === 'move') return <Move size={size} aria-hidden />
  if (glyph === 'rotate') return <RotateCw size={size} aria-hidden />
  if (glyph === 'scale') return <Scaling size={size} aria-hidden />
  if (glyph === 'viewport') return <Square size={size} aria-hidden />
  if (glyph === 'viewport-off') return <SquareDashed size={size} aria-hidden />
  if (glyph === 'effects') return <WandSparkles size={size} aria-hidden />
  if (glyph === 'animation') return <Activity size={size} aria-hidden />
  return <Eye size={size} aria-hidden />
}

function clipSummaryTone(kind: ShowClipSummaryKind): string {
  if (kind === 'controls') return 'text-cyan-300/80'
  if (kind === 'view') return 'text-amber-200/75'
  if (kind === 'effects') return 'text-emerald-300/75'
  if (kind === 'animation') return 'text-violet-300/85'
  return 'text-zinc-400'
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`
}

function cellCoveringScene(show: ShowRecord, zoneId: string, targetSceneIndex: number): ShowCell | undefined {
  return show.cells.find((cell) => {
    const cellZoneIndex = show.zones.findIndex((zone) => zone.id === cell.zoneId)
    const targetZoneIndex = show.zones.findIndex((zone) => zone.id === zoneId)
    if (cellZoneIndex < 0 || targetZoneIndex < cellZoneIndex || targetZoneIndex >= cellZoneIndex + (cell.zoneSpan ?? 1)) return false
    const start = show.scenes.findIndex((scene) => scene.id === cell.sceneId)
    return start >= 0 && targetSceneIndex >= start && targetSceneIndex < start + cell.sceneSpan
  })
}

function formatTimeScale(value: number): string {
  return formatDomainNumber('multiplier', value, 0.01)
}

function formatRepeatScale(value: number): string {
  return formatDomainNumber('multiplier', value, 0.01)
}

function formatBrightness(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatControlValue(value: number): string {
  return Number(value.toFixed(2)).toString()
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}
