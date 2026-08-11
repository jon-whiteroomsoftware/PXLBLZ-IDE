import { render, screen } from '@testing-library/react'
import { MixinProvenancePane } from './MixinProvenancePane'
import { editorInitialState, useEditorStore } from '@/store/editorStore'
import { mixinInitialState, useMixinStore, type MixinRecord } from '@/store/mixinStore'

const MIXIN: MixinRecord = {
  id: 'mx-1',
  name: 'Speed pot',
  kind: 'bind',
  src: [
    '// @param PIN analog input pin number',
    '// @target CONTROL slider function or variable slot to drive',
    '// @wraps beforeRender',
    'export var x = 0',
  ].join('\n'),
  updatedAt: 1,
}

beforeEach(() => {
  useEditorStore.setState(editorInitialState)
  useMixinStore.setState(mixinInitialState)
})

function openMixin(src = MIXIN.src) {
  useEditorStore.setState({ source: src })
  useMixinStore.setState({ editingMixin: { kind: 'existing', id: MIXIN.id }, userMixins: [MIXIN] })
}

describe('MixinProvenancePane', () => {
  it('renders header facts without usage or transform-artifact sections (#782)', () => {
    openMixin()

    render(<MixinProvenancePane />)

    expect(screen.getByText('Speed pot')).toBeInTheDocument()
    expect(screen.getByText('CONTROL')).toBeInTheDocument()
    expect(screen.getByText('beforeRender')).toBeInTheDocument()
    expect(screen.getByText('PIN')).toBeInTheDocument()
    // Usage lives on the Controller profile page; the pane makes no usage or
    // artifact claims it cannot back with mixin-scoped data (#782).
    expect(screen.queryByText('Used by')).not.toBeInTheDocument()
    expect(screen.queryByText('Last transform summary')).not.toBeInTheDocument()
    expect(screen.queryByText(/or Show/)).not.toBeInTheDocument()
  })

  it('separates directive values from their prose descriptions (#782)', () => {
    openMixin()

    render(<MixinProvenancePane />)

    // The value token and the description render as distinct nodes, never one
    // concatenated fact string.
    expect(screen.getByText('CONTROL')).toBeInTheDocument()
    expect(screen.getByText('slider function or variable slot to drive')).toBeInTheDocument()
    expect(screen.getByText('PIN')).toBeInTheDocument()
    expect(screen.getByText('analog input pin number')).toBeInTheDocument()
  })

  it('surfaces malformed header directives instead of a bare dash (#782)', () => {
    openMixin('// @parm PIN input\n// @target CONTROL\n// @wraps beforeRender\nexport var x = 0')

    render(<MixinProvenancePane />)

    expect(
      screen.getByText('Unknown directive @parm; expected @param, @target, or @wraps'),
    ).toBeInTheDocument()
    expect(screen.getByText('Mixin header needs at least one @param')).toBeInTheDocument()
  })
})
