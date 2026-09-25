import { describe, expect, it } from 'vitest'
import { STOCK_SHOW_METADATA } from './showIds'
import { STOCK_SHOWS_V2 } from './showsV2'

describe('stock Show metadata', () => {
  it('keeps the lightweight Worker metadata exact with the v2 stock catalogue', () => {
    expect(STOCK_SHOW_METADATA).toEqual(STOCK_SHOWS_V2.map(({ id, name }) => ({ id, name })))
  })
})
