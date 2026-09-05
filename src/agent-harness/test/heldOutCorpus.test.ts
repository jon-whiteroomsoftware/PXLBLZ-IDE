import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DICTATION_CASES } from '../experiment/cases.js'
import { assertHeldOutCorpusExclusion, verifyHeldOutCorpus } from '../held-out/verify.js'

describe('sealed held-out corpus (#945)', () => {
  it('verifies the finite v1 seal without exposing case contents', () => {
    const summary = verifyHeldOutCorpus()

    expect(summary).toEqual({
      version: 'v1',
      caseCount: 16,
      categories: {
        animation: 2,
        clarification: 2,
        clips: 3,
        effects: 2,
        junctions: 1,
        'layer-transitions': 1,
        refusal: 2,
        structure: 1,
        timeline: 2,
      },
      releaseGate: '#958',
      manifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
  })

  it('keeps every held-out id outside the ordinary baseline and tuning corpus', () => {
    expect(assertHeldOutCorpusExclusion(DICTATION_CASES.map((candidate) => candidate.id))).toEqual({
      ordinaryCaseCount: 43,
      heldOutCaseCount: 16,
      collisions: [],
    })
  })

  it('rejects changed case bytes without executing the held-out task', () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), 'pxlblz-held-out-'))
    const sealedDirectory = fileURLToPath(new URL('../held-out/v1/', import.meta.url))
    cpSync(sealedDirectory, temporaryDirectory, { recursive: true })
    const inputsPath = join(temporaryDirectory, 'inputs.sealed.json')
    writeFileSync(inputsPath, `${readFileSync(inputsPath, 'utf8')} `)

    try {
      expect(() => verifyHeldOutCorpus(temporaryDirectory)).toThrow(
        'inputs.sealed.json does not match its manifest sha256',
      )
    } finally {
      rmSync(temporaryDirectory, { recursive: true })
    }
  })
})
