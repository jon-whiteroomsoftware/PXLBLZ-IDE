import type { ReactNode } from 'react'
import { ControllerPanel } from '@/components/ControllerPanel'
import { ControllerProfilePage } from '@/components/ControllerProfilePage'
import { PreviewDeck } from '@/components/PreviewDeck'
import {
  NullControllerProvider,
  type ControllerConfig,
  type ControllerStatus,
  type ControllerTelemetry,
} from '@/engine/ControllerProvider'
import { resetControllerProvider, setControllerProvider } from '@/engine/controllerProviderRegistry'
import { encodeMapData } from '@/engine/mapPush'
import {
  controllerProfileInitialState,
  defaultControllerProfile,
  useControllerProfileStore,
} from '@/store/controllerProfileStore'
import { controllerInitialState, useControllerStore } from '@/store/controllerStore'
import {
  controllerPanelInitialState,
  useControllerPanelStore,
} from '@/store/controllerPanelStore'
import { controlInitialState, useControlStore } from '@/store/controlStore'
import { editorInitialState, useEditorStore } from '@/store/editorStore'
import { mapInitialState, useMapStore } from '@/store/mapStore'
import { patternInitialState, usePatternStore } from '@/store/patternStore'
import { previewInitialState, usePreviewStore } from '@/store/previewStore'

const CONTROLLER_IP = '10.0.0.9'
const DEVICE_ID = 'pixelblaze_pb32_layout'
const MAP_FINGERPRINT = '9a0c9e7f'
const MAP_NAME = 'Square'
const MAP_POINTS = 256

class LayoutControllerProvider extends NullControllerProvider {
  constructor(private readonly installedMap: 'present' | 'absent' = 'present') {
    super()
  }

  private readonly status: ControllerStatus = {
    kind: 'connected',
    controller: {
      id: DEVICE_ID,
      address: CONTROLLER_IP,
      deviceId: DEVICE_ID,
      name: 'Layout Controller',
    },
  }

  getStatus(): ControllerStatus {
    return this.status
  }

  getConfig(): Promise<ControllerConfig> {
    return Promise.resolve({
      brightness: 0.4,
      activeProgramId: 'layout-pattern',
      activeControls: { sliderSpeed: 0.35, toggleMirror: 1 },
      pixelCount: MAP_POINTS,
    })
  }

  getTelemetry(): Promise<ControllerTelemetry> {
    return Promise.resolve({ fps: 30 })
  }

  listPrograms() {
    return Promise.resolve([{ id: 'layout-pattern', name: 'Layout Pattern' }])
  }

  getVars(): Promise<Record<string, number>> {
    return Promise.resolve({
      phase: 0.5,
      __px_powerDutyRecent: 0.12,
      __px_powerDutySinceStart: 0.1,
      __px_powerLimit: 0.25,
      __px_powerScale: 0.9,
      __px_powerClipping: 0,
    })
  }

  getPixelMapData(): Promise<Uint8Array | null> {
    return Promise.resolve(
      this.installedMap === 'present' ? encodeMapData([[0, 0], [1, 1]]) : null,
    )
  }
}

function seedInstalledMapProfile({
  mapName = MAP_NAME,
  known = true,
}: {
  mapName?: string
  known?: boolean
} = {}) {
  const profile = {
    ...defaultControllerProfile({
      id: 'layout-profile',
      deviceId: DEVICE_ID,
      deviceName: 'Layout Controller',
      ip: CONTROLLER_IP,
      now: 1,
    }),
    lastKnownPixelCount: MAP_POINTS,
    lastKnownInstalledMap: {
      status: 'present' as const,
      fingerprint: MAP_FINGERPRINT,
      dimension: 2 as const,
      pointCount: MAP_POINTS,
      observedAt: 1,
    },
    mapFingerprints: known
      ? [{
          hash: MAP_FINGERPRINT,
          mapId: 'square',
          mapName,
          devicePixelCount: MAP_POINTS,
          pushedAt: 1,
        }]
      : [],
  }
  useControllerProfileStore.setState({ profiles: [profile], profilesLoaded: true })
  return profile
}

function seedLiveController() {
  useControllerStore.setState({
    activeIp: CONTROLLER_IP,
    controllers: {
      [CONTROLLER_IP]: {
        ip: CONTROLLER_IP,
        deviceId: DEVICE_ID,
        nickname: 'Layout Controller',
        phase: 'live',
        mapDim: 2,
        firmwareVersion: '3.67',
        firmwareUpdateState: 'available',
        installedMap: {
          status: 'present',
          bytes: encodeMapData([[0, 0], [1, 1]]),
          fingerprint: MAP_FINGERPRINT,
          dimension: 2,
          pointCount: MAP_POINTS,
          observedAt: 1,
        },
      },
    },
  })
}

export function resetLayoutSurfaceState() {
  useControllerPanelStore.getState().stop()
  resetControllerProvider()
  useControllerProfileStore.setState(controllerProfileInitialState)
  useControllerStore.setState(controllerInitialState)
  useControllerPanelStore.setState(controllerPanelInitialState)
  useControlStore.setState(controlInitialState)
  useEditorStore.setState(editorInitialState)
  useMapStore.setState(mapInitialState)
  usePatternStore.setState(patternInitialState)
  usePreviewStore.setState(previewInitialState)
}

function controllerPanelSurface(installedMap: 'present' | 'absent' = 'present'): ReactNode {
  seedInstalledMapProfile()
  seedLiveController()
  setControllerProvider(new LayoutControllerProvider(installedMap))
  return <ControllerPanel />
}

function controllerProfileSurface(options?: Parameters<typeof seedInstalledMapProfile>[0]): ReactNode {
  const profile = seedInstalledMapProfile(options)
  useControllerProfileStore.setState({ profiles: [profile], profilesLoaded: true })
  return <ControllerProfilePage profileId={profile.id} />
}

function previewDeckSurface(): ReactNode {
  useEditorStore.setState({
    previewPatternName: 'Layout Contract Pattern With A Long Authored Name',
    previewSource: 'export function render(index) { hsv(index, 1, 1) }',
    controls: [
      { exportName: 'sliderSpeed', kind: 'slider', label: 'Speed' },
      { exportName: 'toggleMirror', kind: 'toggle', label: 'Mirror' },
      { exportName: 'hsvPalette', kind: 'hsvPicker', label: 'Palette' },
    ],
    displayDim: 2,
    mapDim: 2,
    layoutLabel: '16×16',
  })
  usePreviewStore.setState({ fps: 60, elapsed: 12.34 })
  useControlStore.setState({
    controlValues: {
      sliderSpeed: 0.35,
      toggleMirror: 1,
      hsvPalette: [0.55, 0.8, 1],
    },
  })
  return <PreviewDeck />
}

export interface LayoutSurfaceContract {
  id: string
  width: number
  height: number
  render: () => ReactNode
  ready?: (root: HTMLElement) => boolean
  annotate?: (root: HTMLElement) => void
}

export const LAYOUT_SURFACE_MANIFEST: readonly LayoutSurfaceContract[] = [
  {
    id: 'controller-panel-narrow',
    width: 352,
    height: 900,
    render: controllerPanelSurface,
    ready: (root) => (
      root.querySelector('[data-testid="installed-map-name"]')?.textContent === MAP_NAME
      && root.querySelector('[data-testid="installed-map-count-mismatch"]') !== null
      && root.textContent?.includes('pattern controls') === true
      && root.textContent?.includes('power') === true
      && root.textContent?.includes('variables') === true
    ),
    annotate: (root) => {
      root.querySelector('[data-testid="installed-map-name"]')?.setAttribute('data-layout-must-fit', '')
    },
  },
  {
    id: 'controller-panel-map-absent',
    width: 352,
    height: 900,
    render: () => controllerPanelSurface('absent'),
    ready: (root) => root.textContent?.includes('No installed map') === true,
  },
  {
    id: 'controller-profile-narrow-long-offline',
    width: 375,
    height: 900,
    render: () => controllerProfileSurface({
      mapName: 'Atrium Ceiling Coordinate Map With A Deliberately Long Authored Name',
    }),
    ready: (root) => root.querySelector('[data-testid="controller-profile-page"]') !== null,
  },
  {
    id: 'controller-profile-desktop-unknown-offline',
    width: 1280,
    height: 900,
    render: () => controllerProfileSurface({ known: false }),
    ready: (root) => (
      root.querySelector('[data-testid="controller-profile-page"]') !== null
      && root.textContent?.includes('Unknown map') === true
    ),
  },
  {
    id: 'preview-deck-constrained',
    width: 375,
    height: 900,
    render: previewDeckSurface,
  },
]
