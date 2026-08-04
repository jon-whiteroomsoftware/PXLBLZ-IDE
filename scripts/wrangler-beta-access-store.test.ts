import {
  createWranglerBetaAccessStore,
  parseWranglerD1Json,
  wranglerBetaAccessArgs,
  type WranglerBetaAccessExecutor,
} from './wrangler-beta-access-store'

describe('Wrangler beta-access store', () => {
  it('escapes operator text, maps rows, and rejects unsuccessful Wrangler results', async () => {
    const statements: string[] = []
    const executor: WranglerBetaAccessExecutor = async (sql) => {
      statements.push(sql)
      return sql.includes('SELECT email, label')
        ? [{ email: 'friend@example.com', label: "Friend's lights", enabled: 1, user_id: null }]
        : []
    }
    const store = createWranglerBetaAccessStore(executor)

    await store.add('friend@example.com', "Friend's lights")
    expect(statements[0]).toContain("'Friend''s lights'")
    expect(statements[0]).toContain("'beta_access_mode', 'd1'")
    await expect(store.getByEmail('friend@example.com')).resolves.toEqual({
      email: 'friend@example.com', label: "Friend's lights", enabled: true, userId: null,
    })

    expect(parseWranglerD1Json(JSON.stringify([{
      results: [{ email: 'a@example.com' }], success: true,
    }]))).toEqual([{ email: 'a@example.com' }])
    expect(() => parseWranglerD1Json(JSON.stringify([{ results: [], success: false }])))
      .toThrow(/failed/i)
  })

  it('keeps production targeting explicit in the Wrangler invocation', () => {
    expect(wranglerBetaAccessArgs(false, 'SELECT 1')).toEqual([
      'd1', 'execute', 'pxlblz-ide', '--local', '--command', 'SELECT 1', '--json',
    ])
    expect(wranglerBetaAccessArgs(true, 'SELECT 1')).toEqual([
      'd1', 'execute', 'pxlblz-ide', '--remote', '--command', 'SELECT 1', '--json',
    ])
  })
})
