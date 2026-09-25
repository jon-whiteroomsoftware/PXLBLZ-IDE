import { Validator } from '@cfworker/json-schema'
import showRecordV1Schema from '../../schemas/show-record.schema.json'
import showRecordV2Schema from '../../schemas/show-record-v2.provisional.schema.json'
import {
  validateShowRecordV2Domain,
  type ShowCompositionV2ValidationIssue,
  type ShowRecordV2,
} from '../engine/showCompositionV2'
import { PersonalStorageGuardError } from './resourceProtection'

let structuralValidator: Validator | undefined

function validator(): Validator {
  if (!structuralValidator) {
    structuralValidator = new Validator(structuredClone(showRecordV2Schema), '2020-12', false)
    structuralValidator.addSchema(
      structuredClone(showRecordV1Schema),
      'https://pxlblz.dev/schemas/show-record.schema.json',
    )
  }
  return structuralValidator
}

function structuralIssues(value: unknown): ShowCompositionV2ValidationIssue[] {
  const result = validator().validate(value)
  if (result.valid) return []
  return result.errors
    .filter(error => error.keyword !== '$ref')
    .map(error => ({
      path: error.instanceLocation === '#' ? '/' : error.instanceLocation.replace(/^#\/?/, '/'),
      code: 'schema' as const,
      message: error.error,
    }))
}

/** Cloudflare Workers forbid AJV's runtime code generation, so admission uses an interpreter. */
export function cloneValidShowRecordV2ForWorker(value: unknown): ShowRecordV2 {
  const cloned = JSON.parse(JSON.stringify(value)) as unknown
  const issues = structuralIssues(cloned)
  if (issues.length === 0) issues.push(...validateShowRecordV2Domain(cloned as ShowRecordV2, structuralIssues))
  if (issues.length > 0) {
    const first = issues[0]
    throw new PersonalStorageGuardError('invalid_show_v2_record', 400, `Invalid Show v2 record at ${first.path}: ${first.message}`)
  }
  return cloned as ShowRecordV2
}
