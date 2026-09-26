import ts from 'typescript'

export interface ProductString {
  file: string
  line: number
  text: string
}

// These files are deliberately outside the product-string surfaces:
// showRecordV1ToV2.ts: v1 import compatibility; messages run only while importing a v1 file.
// showV2Migration.ts: v1 import compatibility; messages run only while importing a v1 file.
// showImportV1Conversion.ts: v1 import compatibility; messages run only while importing a v1 file.
// showCompositionModel.ts: v1 import compatibility; messages run only while importing a v1 file.
// showModel.ts: v1 import compatibility; messages run only while importing a v1 file.
// showRoutedScenePlan.ts: compiler-internal routed-Scene vocabulary.
// showCompositionLowering*.ts: compiler-internal routed-Scene vocabulary.
// showCompiler.ts: compiler-internal routed-Scene vocabulary.
// src/pixelblaze/controlDescriptions.ts: artistic Pattern content.
// Pattern sources: artistic content authored independently of Show vocabulary.
// src/agent-harness/**: diagnostic harness, never bundled in the product.
export const PRODUCT_STRING_SURFACES = [
  'src/App.tsx',
  'src/components/**/*.tsx',
  'src/engine/showCommandsV2/**/*.ts',
  'src/engine/show*V2.ts',
  'src/engine/showLessonNarration.ts',
  'src/engine/showEditorInspectorPresentation.ts',
  'src/pixelblaze/stock/showCatalogueV2.ts',
  'src/pixelblaze/stock/showsV2.ts',
]

export const PRODUCT_STRING_ALLOWLIST: Array<{ file: string; text: string; reason: string }> = []

function isSkippedStringLiteral(node: ts.StringLiteral): boolean {
  const parent = node.parent
  if ((ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) && parent.moduleSpecifier === node) return true
  if (ts.isExternalModuleReference(parent) && parent.expression === node) return true
  return ts.isCallExpression(parent)
    && ts.isIdentifier(parent.expression)
    && ['describe', 'it', 'test'].includes(parent.expression.text)
    && parent.arguments.includes(node)
}

export function collectProductStrings(filePath: string, source: string): ProductString[] {
  const parsed = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const collected: ProductString[] = []
  function visit(node: ts.Node): void {
    const isLiteral = ts.isStringLiteral(node) && !isSkippedStringLiteral(node)
    const isTemplateText = ts.isNoSubstitutionTemplateLiteral(node)
      || ts.isTemplateHead(node)
      || ts.isTemplateMiddle(node)
      || ts.isTemplateTail(node)
    if (isLiteral || isTemplateText || ts.isJsxText(node)) {
      collected.push({
        file: filePath,
        line: parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1,
        text: node.text,
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  return collected
}
