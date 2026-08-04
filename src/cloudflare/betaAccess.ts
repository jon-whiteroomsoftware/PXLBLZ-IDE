export function normalizeBetaAccessEmail(input: string): string {
  const email = input.trim().toLowerCase()
  if (!/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email)) {
    throw new Error(`Beta access requires a valid email address; received "${input}".`)
  }
  return email
}

export interface BetaAccessEntry {
  email: string
  label: string | null
  enabled: boolean
  userId: string | null
}

export interface BetaAccessStore {
  isAuthoritative(): Promise<boolean>
  count(): Promise<number>
  getByEmail(email: string): Promise<BetaAccessEntry | null>
  findActiveForUser(userId: string): Promise<BetaAccessEntry | null>
  bindUser(email: string, userId: string): Promise<void>
}

export type BetaOAuthAccessDecision = 'legacy' | 'allowed' | 'denied'

export interface BetaOAuthAdmission {
  decision: BetaOAuthAccessDecision
  userId: string | null
}

export async function authorizeBetaSession(
  store: BetaAccessStore,
  userId: string,
): Promise<boolean> {
  if (!await store.isAuthoritative()) return true
  return (await store.findActiveForUser(userId)) !== null
}

export async function decideBetaOAuthAccess(
  store: BetaAccessStore,
  input: {
    verifiedEmail: string | null
    existingUserId: string | null
  },
): Promise<BetaOAuthAccessDecision> {
  return (await resolveBetaOAuthAdmission(store, input)).decision
}

export async function resolveBetaOAuthAdmission(
  store: BetaAccessStore,
  input: {
    verifiedEmail: string | null
    existingUserId: string | null
  },
): Promise<BetaOAuthAdmission> {
  if (!await store.isAuthoritative()) {
    return { decision: 'legacy', userId: input.existingUserId }
  }
  if (input.existingUserId && await store.findActiveForUser(input.existingUserId)) {
    return { decision: 'allowed', userId: input.existingUserId }
  }
  if (!input.verifiedEmail) return { decision: 'denied', userId: null }
  const entry = await store.getByEmail(normalizeBetaAccessEmail(input.verifiedEmail))
  if (!entry?.enabled) return { decision: 'denied', userId: null }
  if (input.existingUserId && entry.userId && input.existingUserId !== entry.userId) {
    return { decision: 'denied', userId: null }
  }
  return { decision: 'allowed', userId: input.existingUserId ?? entry.userId }
}

export async function claimBetaAccess(
  store: BetaAccessStore,
  emailInput: string,
  userId: string,
): Promise<void> {
  const email = normalizeBetaAccessEmail(emailInput)
  const entry = await store.getByEmail(email)
  if (!entry?.enabled) throw new Error(`Beta access is not active for ${email}.`)
  if (entry.userId && entry.userId !== userId) {
    throw new Error(`Beta access for ${email} is already claimed by another user.`)
  }
  if (!entry.userId) await store.bindUser(email, userId)
}

export async function claimMatchingBetaAccess(
  store: BetaAccessStore,
  verifiedEmail: string | null,
  userId: string,
): Promise<void> {
  if (!verifiedEmail) return
  const entry = await store.getByEmail(verifiedEmail)
  if (!entry?.enabled || (entry.userId && entry.userId !== userId)) return
  await claimBetaAccess(store, verifiedEmail, userId)
}
