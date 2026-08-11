import { render, screen } from '@testing-library/react'
import { MixinProvenancePane } from './MixinProvenancePane'
import { editorInitialState, useEditorStore } from '@/store/editorStore'
import { mixinInitialState, useMixinStore, type MixinRecord } from '@/store/mixinStore'

const MIXIN: MixinRecord = {
  id: 'mx-1',
  name: 'Speed pot',
  kind: 'bind',
  src: '// @param PIN input\n// @target CONTROL\n// @wraps beforeRender\nexport var x = 0',
  updatedAt: 1,
}

beforeEach(() => {
  useEditorStore.setState(editorInitialState)
  useMixinStore.setState(mixinInitialState)
})

describe('MixinProvenancePane', () => {
  it('renders header facts without usage or transform-artifact sections (#782)', () => {
    useEditorStore.setState({ source: MIXIN.src })
    useMixinStore.setState({ editingMixin: { kind: 'existing', id: MIXIN.id }, userMixins: [MIXIN] })

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
})
