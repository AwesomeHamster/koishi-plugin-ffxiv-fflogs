import mock from '@koishijs/plugin-mock'
import { App } from 'koishi'
import cacheMemory from 'koishi-plugin-cache-memory'

import * as fflogs from '../src'

describe('fflogs', () => {
  const app = new App()

  app.plugin(mock)
  app.plugin(cacheMemory)
  app.plugin(fflogs)

  before(async () => await app.start())
  after(async () => await app.stop())

  const client = app.mock.client('123', '456')

  it('should return stats', async () => {
    await client.shouldReply('fflogs dps p12s Bard -t rdps', 'aaaaaaaaaaaaa')
  }).timeout(10000)
})
