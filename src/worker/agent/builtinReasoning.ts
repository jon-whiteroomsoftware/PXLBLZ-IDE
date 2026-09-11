import { z } from 'zod'

// Shared response/continuation contract. Preserve encrypted state and SDK text items.
export const reasoningSchema = z.object({ type: z.literal('reasoning'), id: z.string(), summary: z.array(z.object({ type: z.literal('summary_text'), text: z.string() }).strict()), encrypted_content: z.string(), content: z.array(z.object({ type: z.literal('reasoning_text'), text: z.string() }).strict()).optional(), status: z.enum(['in_progress', 'completed', 'incomplete']).optional() }).strict()
