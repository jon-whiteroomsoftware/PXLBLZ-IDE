import {
  LIBRARY_SKELETON,
  builtinNamespaceNames,
  compileLibraries,
  nextLibraryCloneName,
  nextLibraryName,
  sanitizeLibraryNameInput,
  validateLibraryName,
} from './libraries'

describe('library namespace rules (#347)', () => {
  it('mints Lib-N names without colliding with stock, builtin, or user namespaces', () => {
    expect(nextLibraryName({
      stockNames: ['Color', 'Shader'],
      userNames: ['Lib1', 'Lib2', 'Lib4'],
      builtinNames: ['hsv'],
    })).toBe('Lib3')
  })

  it('mints stock clone namespaces from the stock name without shadowing it', () => {
    expect(nextLibraryCloneName('SDF', {
      stockNames: ['SDF'],
      userNames: [],
      builtinNames: [],
    })).toBe('SDF2')
    expect(nextLibraryCloneName('SDF', {
      stockNames: ['SDF'],
      userNames: ['SDF2', 'SDF3'],
      builtinNames: [],
    })).toBe('SDF4')
  })

  it('merges stock and user libraries without allowing stale user records to shadow stock', () => {
    expect(compileLibraries(
      { Shader: 'stock shader', SDF: 'stock sdf' },
      [
        { name: 'MyLib', src: 'user lib' },
        { name: 'Shader', src: 'bad stale shadow' },
      ],
    )).toEqual({
      Shader: 'stock shader',
      SDF: 'stock sdf',
      MyLib: 'user lib',
    })
  })

  it('requires identifier-safe names and rejects reserved namespaces case-sensitively', () => {
    expect(validateLibraryName('My_Lib2', { stockNames: [], userNames: [], builtinNames: [] })).toBeNull()
    expect(validateLibraryName('bad name', { stockNames: [], userNames: [], builtinNames: [] })).toContain('identifier')
    expect(validateLibraryName('Shader', { stockNames: ['Shader'], userNames: [], builtinNames: [] })).toContain('already')
    expect(validateLibraryName('shader', { stockNames: ['Shader'], userNames: [], builtinNames: [] })).toBeNull()
    expect(validateLibraryName('hsv', { stockNames: [], userNames: [], builtinNames: ['hsv'] })).toContain('built-in')
  })

  it('sanitizes in-progress input to the valid library namespace character subset', () => {
    expect(sanitizeLibraryNameInput('My_Lib2')).toBe('My_Lib2')
    expect(sanitizeLibraryNameInput('bad name-with.symbols')).toBe('badnamewithsymbols')
    expect(sanitizeLibraryNameInput('123Lib')).toBe('Lib')
    expect(sanitizeLibraryNameInput(' _Lib')).toBe('_Lib')
    expect(sanitizeLibraryNameInput('l\u00e9 sparkle')).toBe('lsparkle')
  })

  it('derives builtin namespace reservations from the Pixelblaze builtins catalog', () => {
    expect(builtinNamespaceNames()).toContain('hsv')
    expect(builtinNamespaceNames()).toContain('pixelCount')
  })

  it('ships a library skeleton that satisfies the content rule', () => {
    expect(LIBRARY_SKELETON).toContain('function')
  })
})
