import { describe, expect, it } from 'vitest'
import { SHOW_ESCAPE_LAYER_RANK, registerShowEscapeLayer, type ShowEscapeLayer } from './showEscapeLayers'

function pressEscape(key = 'Escape') {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  document.dispatchEvent(event)
  return event
}

function withLayers(layers: ShowEscapeLayer[], run: () => void) {
  const unregister = layers.map((layer) => registerShowEscapeLayer(layer))
  try {
    run()
  } finally {
    unregister.forEach((release) => release())
  }
}

describe('registerShowEscapeLayer', () => {
  it('dispatches one press to the highest-rank consuming layer only', () => {
    const calls: string[] = []
    withLayers([
      { rank: SHOW_ESCAPE_LAYER_RANK.toolbarPopover, onEscape: () => (calls.push('popover'), true) },
      { rank: SHOW_ESCAPE_LAYER_RANK.editorSurfaces, onEscape: () => (calls.push('editor'), true) },
    ], () => {
      const event = pressEscape()
      expect(calls).toEqual(['editor'])
      expect(event.defaultPrevented).toBe(true)
    })
  })

  it('falls through to the next layer when a higher layer declines the press', () => {
    const calls: string[] = []
    withLayers([
      { rank: SHOW_ESCAPE_LAYER_RANK.toolbarPopover, onEscape: () => (calls.push('popover'), true) },
      { rank: SHOW_ESCAPE_LAYER_RANK.editorSurfaces, onEscape: () => (calls.push('editor'), false) },
    ], () => {
      const event = pressEscape()
      expect(calls).toEqual(['editor', 'popover'])
      expect(event.defaultPrevented).toBe(true)
    })
  })

  it('leaves the press untouched when no layer consumes it', () => {
    withLayers([
      { rank: SHOW_ESCAPE_LAYER_RANK.editorSurfaces, onEscape: () => false },
    ], () => {
      expect(pressEscape().defaultPrevented).toBe(false)
    })
  })

  it('prefers the most recently registered layer at equal rank', () => {
    const calls: string[] = []
    withLayers([
      { rank: SHOW_ESCAPE_LAYER_RANK.toolbarPopover, onEscape: () => (calls.push('first'), true) },
      { rank: SHOW_ESCAPE_LAYER_RANK.toolbarPopover, onEscape: () => (calls.push('second'), true) },
    ], () => {
      pressEscape()
      expect(calls).toEqual(['second'])
    })
  })

  it('stops dispatching to unregistered layers and goes quiet after the last one leaves', () => {
    const calls: string[] = []
    const releaseTop = registerShowEscapeLayer({
      rank: SHOW_ESCAPE_LAYER_RANK.editorSurfaces,
      onEscape: () => (calls.push('editor'), true),
    })
    const releaseBottom = registerShowEscapeLayer({
      rank: SHOW_ESCAPE_LAYER_RANK.toolbarPopover,
      onEscape: () => (calls.push('popover'), true),
    })
    releaseTop()
    pressEscape()
    expect(calls).toEqual(['popover'])
    releaseBottom()
    expect(pressEscape().defaultPrevented).toBe(false)
    expect(calls).toEqual(['popover'])
  })

  it('defers entirely to detail-owned surfaces while one is present', () => {
    const owned = document.createElement('div')
    owned.setAttribute('data-show-detail-escape-owned', 'true')
    document.body.appendChild(owned)
    try {
      const calls: string[] = []
      withLayers([
        { rank: SHOW_ESCAPE_LAYER_RANK.editorSurfaces, onEscape: () => (calls.push('editor'), true) },
      ], () => {
        const event = pressEscape()
        expect(calls).toEqual([])
        expect(event.defaultPrevented).toBe(false)
      })
    } finally {
      owned.remove()
    }
  })

  it('defers to detail-owned portals while one is present', () => {
    const owned = document.createElement('div')
    owned.setAttribute('data-show-detail-owned-portal', 'true')
    document.body.appendChild(owned)
    try {
      const calls: string[] = []
      withLayers([
        { rank: SHOW_ESCAPE_LAYER_RANK.toolbarPopover, onEscape: () => (calls.push('popover'), true) },
      ], () => {
        pressEscape()
        expect(calls).toEqual([])
      })
    } finally {
      owned.remove()
    }
  })

  it('lets an explicit top layer claim Escape above a detail-owned surface', () => {
    const owned = document.createElement('div')
    owned.setAttribute('data-show-detail-owned-portal', 'true')
    document.body.appendChild(owned)
    const calls: string[] = []
    const release = registerShowEscapeLayer({
      rank: SHOW_ESCAPE_LAYER_RANK.headerPopover,
      allowWhenDetailOwned: true,
      onEscape: () => (calls.push('header'), true),
    })
    const underlying = () => calls.push('detail')
    document.addEventListener('keydown', underlying)
    try {
      const event = pressEscape()
      expect(calls).toEqual(['header'])
      expect(event.defaultPrevented).toBe(true)
    } finally {
      document.removeEventListener('keydown', underlying)
      release()
      owned.remove()
    }
  })

  it('ignores non-Escape keys', () => {
    const calls: string[] = []
    withLayers([
      { rank: SHOW_ESCAPE_LAYER_RANK.editorSurfaces, onEscape: () => (calls.push('editor'), true) },
    ], () => {
      pressEscape('Enter')
      expect(calls).toEqual([])
    })
  })

  it('never dispatches one press to a layer registered during that press', () => {
    const calls: string[] = []
    withLayers([
      {
        rank: SHOW_ESCAPE_LAYER_RANK.toolbarPopover,
        onEscape: () => {
          calls.push('popover')
          const release = registerShowEscapeLayer({
            rank: SHOW_ESCAPE_LAYER_RANK.editorSurfaces,
            onEscape: () => (calls.push('late-editor'), true),
          })
          release()
          return true
        },
      },
    ], () => {
      pressEscape()
      expect(calls).toEqual(['popover'])
    })
  })

  it('survives a layer unregistering itself mid-dispatch', () => {
    const calls: string[] = []
    let releaseSelf: () => void = () => {}
    releaseSelf = registerShowEscapeLayer({
      rank: SHOW_ESCAPE_LAYER_RANK.editorSurfaces,
      onEscape: () => {
        calls.push('editor')
        releaseSelf()
        return true
      },
    })
    const releaseOther = registerShowEscapeLayer({
      rank: SHOW_ESCAPE_LAYER_RANK.toolbarPopover,
      onEscape: () => (calls.push('popover'), true),
    })
    try {
      pressEscape()
      expect(calls).toEqual(['editor'])
      pressEscape()
      expect(calls).toEqual(['editor', 'popover'])
    } finally {
      releaseOther()
    }
  })
})
