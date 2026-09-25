// @vitest-environment jsdom
import { createRef } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShowsRailSection } from './ShowsRailSection'

/**
 * The Show list offers stored v2 rows (#1056 slice 6); v1 rows are retired
 * (#1042). Selecting one routes to the Show route.
 */

function renderRail(overrides: Partial<Parameters<typeof ShowsRailSection>[0]> = {}) {
  const onOpenShowV2 = vi.fn()
  render(
    <ShowsRailSection
      personalWorkspaceAuthenticated
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
      onOpenShowV2={onOpenShowV2}
      onOpenStockShow={() => {}}
      onToggleStockShows={() => {}}
      onRenameShow={() => {}}
      onDuplicateShow={() => {}}
      onEmptyTrash={() => {}}
      onQueryChange={() => {}}
      personalOrganization={{
        version: 1,
        nodes: [{ kind: 'entity', entityId: 'v2-show' }],
        trash: [],
        collapsedFolderIds: [],
      }}
      onPersonalOrganizationChange={() => {}}
      {...overrides}
    />,
  )
  return { onOpenShowV2 }
}

afterEach(cleanup)

describe('the Shows rail', () => {
  it('lists a v2 Show and opens it through the Show route', () => {
    const { onOpenShowV2 } = renderRail({
      userShowsV2: [{ id: 'v2-show', name: 'Converted Show' }],
    })
    const tree = screen.getByRole('tree')
    expect(tree).toHaveTextContent('Converted Show')

    fireEvent.click(screen.getByText('Converted Show'))
    expect(onOpenShowV2).toHaveBeenCalledWith('v2-show')
  })

  it('does not mark an ordinary v2 row (#1039)', () => {
    renderRail({ userShowsV2: [{ id: 'v2-show', name: 'Converted Show' }], activeShowId: 'v2-show' })
    expect(screen.getByRole('tree')).not.toHaveTextContent('v2')
  })
})
