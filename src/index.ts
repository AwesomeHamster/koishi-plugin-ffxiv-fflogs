import { Context } from 'koishi'

import * as Dps from './dps'
import i18n from './i18n'

export const name = 'fflogs'

export async function apply(ctx: Context): Promise<void> {
  Object.entries(i18n).forEach(([key, value]) => ctx.i18n.define(key, value))
  ctx.plugin(Dps)
}
