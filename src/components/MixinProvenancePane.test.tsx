import { render, screen } from '@testing-library/react'
import { MixinProvenancePane } from './MixinProvenancePane'
import { controllerInitialState, useControllerStore } from '@/store/controllerStore'
import { editorInitialState, useEditorStore } from '@/store/editorStore'
import { mixinInitialState, useMixinStore, type MixinRecord } from '@/store/mixinStore'
import { patternInitialState, usePatternStore } from '@/store/patternStore'

const MIXIN: MixinRecord = {
  id: 'mx-1',
  name: 'Speed pot',
  kind: 'bind',
  src: '// @param PIN input\n// @target CONTROL\n// @wraps beforeRender\nexport var x = 0',
  updatedAt: 1,
}

beforeEach(() => {
  useControllerStore.setState(controllerInitialState)
  useEditorStore.setState(editorInitialState)
  useMixinStore.setState(mixinInitialState)
  usePatternStore.setState(patternInitialState)
})

describe('MixinProvenancePane', () => {
  it('uses quiet copy for unused bindings and an absent transform artifact', () => {
    useEditorStore.setState({ source: MIXIN.src })
    useMixinStore.setState({ editingMixin: { kind: 'existing', id: MIXIN.id }, userMixins: [MIXIN] })

    render(<MixinProvenancePane />)

    for (const copy of [
      screen.getByText('No Controller or Show bindings use this mixin yet.'),
      screen.getByText('No generated artifact has been recorded for this mixin yet.'),
    ]) {
      expect(copy).not.toHaveClass('border', 'border-dashed', 'bg-zinc-950/25')
    }
  })

  it('shows the last generated transform summary for the active controller and pattern', () => {
    useEditorStore.setState({ source: MIXIN.src })
    useMixinStore.setState({ editingMixin: { kind: 'existing', id: MIXIN.id }, userMixins: [MIXIN] })
    usePatternStore.setState({ activePatternId: 'pat-1' })
    useControllerStore.setState({
      activeIp: '10.0.0.5',
      lastTransformArtifacts: {
        '10.0.0.5': {
          'pat-1': {
            patternName: 'Twinkle',
            updatedAt: 1,
            generatedSource: 'export function render(index) { hsv(index, 1, 1) }',
            warnings: [],
            summary: {
              passes: [
                {
                  id: 'speed-drive',
                  kind: 'bind',
                  beforeRender: 'wrapped',
                  bindingsApplied: [{ target: 'sliderSpeed', mode: 'function-call' }],
                  estimatedPixelCost: 0,
                },
              ],
              callSitesWrapped: {},
              beforeRender: 'wrapped',
              globalsAdded: ['__pxlblz_speed_drive_bind'],
              exportsAdded: [],
              bindingsApplied: [{ target: 'sliderSpeed', mode: 'function-call' }],
              rendererAdaptations: [],
              estimatedPixelCost: 0,
            },
          },
        },
      },
    })

    render(<MixinProvenancePane />)

    expect(screen.getByText('Speed pot')).toBeInTheDocument()
    expect(screen.getByText('Last transform summary')).toBeInTheDocument()
    expect(screen.getByText('Twinkle')).toBeInTheDocument()
    expect(screen.getByText('sliderSpeed (function-call)')).toBeInTheDocument()
  })
})
