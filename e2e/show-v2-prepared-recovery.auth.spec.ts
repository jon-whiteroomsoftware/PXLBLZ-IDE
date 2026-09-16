import { test } from './fixtures/authenticated'
import { exerciseShowV2PreparedRecovery } from './fixtures/showV2PreparedRecovery'
test('existing Layer edit recovers qualified refused Show through one checked adoption, history and durable reopen', async ({ page }) => {
  await exerciseShowV2PreparedRecovery(page)
})
