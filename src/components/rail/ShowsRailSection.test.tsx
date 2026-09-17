// @vitest-environment jsdom
import { createRef } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShowsRailSection } from './ShowsRailSection'
import type { ShowRecord } from '@/engine/personalContentRecords'
import { createInstallationShowOutputContract } from '@/engine/showOutputContract'
import { createShowWithOutputContract } from '@/engine/showModel'

/**
 * The Show list offers stored v2 rows beside the v1 ones behind the route gate
 * (#1056 slice 6). Selecting one routes to the same Show route; renaming and
 * duplicating a v2 row belong to #1039 and are not offered here.
 */
const legacy: ShowRecord = createShowWithOutputContract(
  'v1-show',
  'Legacy Show',
  createInstallationShowOutputContract({ outputMapId: null, pixelCount: 60 }),
  1,
)

function renderRail(overrides: Partial<Parameters<typeof ShowsRailSection>[0]> = {}) {
  const onOpenShow = vi.fn()
  const onOpenShowV2 = vi.fn()
  render(
    <ShowsRailSection
      personalWorkspaceAuthenticated
      userShows={[legacy]}
      activeShowId={null}
      stockShows={[]}
      activeStockShowId={null}
      showStockShows={false}
      showSeedProfileName={null}
      query=""
      scrollRef={createRef<HTMLDivElement>()}
      scrollMetrics={{ top: 0, height: 0, visible: false, left: 0, width: 0, horizontalVisible: false }}
      onScroll={() => {}}
      onCreateShow={() => {}}
      onImportShow={() => {}}
      onCreateShowFromController={() => {}}
      onOpenShow={onOpenShow}
      onOpenShowV2={onOpenShowV2}
      onOpenStockShow={() => {}}
      onToggleStockShows={() => {}}
      onRenameShow={() => {}}
      onDuplicateShow={() => {}}
      onEmptyTrash={() => {}}
      onQueryChange={() => {}}
      personalOrganization={{
        version: 1,
        nodes: [{ kind: 'entity', entityId: 'v1-show' }, { kind: 'entity', entityId: 'v2-show' }],
        trash: [],
        collapsedFolderIds: [],
      }}
      onPersonalOrganizationChange={() => {}}
      {...overrides}
    />,
  )
  return { onOpenShow, onOpenShowV2 }
}

afterEach(cleanup)

describe('the Shows rail with v2 rows', () => {
  it('lists v1 and v2 Shows together and opens each through its own route', () => {
    const { onOpenShow, onOpenShowV2 } = renderRail({
      userShowsV2: [{ id: 'v2-show', name: 'Converted Show' }],
    })
    const tree = screen.getByRole('tree')
    expect(tree).toHaveTextContent('Legacy Show')
    expect(tree).toHaveTextContent('Converted Show')

    fireEvent.click(screen.getByText('Converted Show'))
    expect(onOpenShowV2).toHaveBeenCalledWith('v2-show')
    expect(onOpenShow).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Legacy Show'))
    expect(onOpenShow).toHaveBeenCalledWith(legacy)
  })

  it('offers no v2 row when the gate leaves the list v1-only', () => {
    renderRail()
    expect(screen.queryByText('Converted Show')).toBeNull()
    expect(screen.getByText('Legacy Show')).toBeInTheDocument()
  })
})
