// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { studioPlaceShortcutOwnsEvent } from '@/engine/studioPlaces'
import { StudioPlaceControl } from './StudioPlaceControl'

const details = {
  patterns: 'LumaRings',
  shows: 'Overture Installation',
  maps: 'Proscenium stage',
  controllers: 'Burner bag',
  mixins: 'Vignette',
  libraries: 'Blz',
}

describe('StudioPlaceControl (#965)', () => {
  it('renders the accepted order, Reference group, current place, and remembered details', async () => {
    render(<StudioPlaceControl current="shows" details={details} onSelect={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Shows' }))

    const listbox = screen.getByRole('listbox', { name: 'Places' })
    expect(within(listbox).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'PatternsLumaRingsP',
      'ShowsOverture InstallationS',
      'MapsProscenium stageM',
      'ControllersBurner bagC',
      'MixinsVignetteX',
      'LibrariesBlzL',
      'DocsD',
      'APIR',
    ])
    expect(within(listbox).getByText('Reference')).toBeInTheDocument()
    expect(within(listbox).getByRole('option', { name: /Shows/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('opens with Enter, navigates with arrows and typeahead, chooses, and returns focus', () => {
    const onSelect = vi.fn()
    render(<StudioPlaceControl current="patterns" details={{}} onSelect={onSelect} />)
    const trigger = screen.getByRole('button', { name: 'Patterns' })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(screen.getByRole('listbox', { name: 'Places' })).toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole('option', { name: /^Patterns/ }), { key: 'ArrowDown' })
    expect(screen.getByRole('option', { name: /^Shows/ })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('option', { name: /^Shows/ }), { key: 'l' })
    expect(screen.getByRole('option', { name: /^Libraries/ })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('option', { name: /^Libraries/ }), { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledWith('libraries')
    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('listbox', { name: 'Places' })).not.toBeInTheDocument()
  })

  it('closes with Escape and keeps Space available to the Preview from the trigger', () => {
    const onPreviewSpace = vi.fn((event: KeyboardEvent) => event.preventDefault())
    document.addEventListener('keydown', onPreviewSpace)
    render(<StudioPlaceControl current="patterns" details={{}} onSelect={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Patterns' })
    trigger.focus()

    fireEvent.keyDown(trigger, { key: ' ', code: 'Space' })
    expect(onPreviewSpace).toHaveBeenCalledOnce()
    expect(screen.queryByRole('listbox', { name: 'Places' })).not.toBeInTheDocument()

    fireEvent.keyDown(trigger, { key: 'Enter' })
    fireEvent.keyDown(screen.getByRole('option', { name: /^Patterns/ }), { key: 'Escape' })
    expect(screen.queryByRole('listbox', { name: 'Places' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    document.removeEventListener('keydown', onPreviewSpace)
  })

  it('leaves global place shortcuts with editable and Monaco-owned controls', () => {
    const input = document.createElement('input')
    const monaco = document.createElement('div')
    monaco.className = 'monaco-editor focused'
    const editorTarget = document.createElement('div')
    monaco.append(editorTarget)

    expect(studioPlaceShortcutOwnsEvent(input)).toBe(true)
    expect(studioPlaceShortcutOwnsEvent(editorTarget)).toBe(true)
    expect(studioPlaceShortcutOwnsEvent(document.body)).toBe(false)
  })
})
