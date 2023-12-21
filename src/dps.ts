import { createHash } from 'crypto'

import { Context, SessionError } from 'koishi'

import bosses from './data/boss.json'
import jobs from './data/job.json'

import type {} from '@koishijs/cache'

export const name = 'dps'

export const inject = ['cache']

export async function apply(ctx: Context): Promise<void> {
  ctx
    .command('fflogs.dps <fight> <job> [dps]')
    .option('day', '-d <day>')
    .option('server', '-s <server>')
    .option('type', '-t <type>')
    .option('precision', '-p <precision>')
    .action(async ({ session, options }, fight, job, dps) => {
      if (!session?.content) {
        return await session?.execute('help fflogs.dps')
      }

      const boss = bosses.find((boss) => boss.name === fight || boss.cnName === fight || boss.aliases.includes(fight))

      if (!boss) {
        return session.text('.bossNotFound', { bossName: fight })
      }

      const jobData = jobs.find((j) => [j.en, j.fr, j.de, j.ja, j.zh, j.ko, ...(j.aliases || [])].includes(job))
      if (!jobData) {
        return session.text('.jobNotFound', { job })
      }

      const result = await getDpsTable(
        ctx,
        boss,
        jobData.en.replace(/ /g, ''),
        options?.day,
        /^cn$/i.test(options?.server),
        options?.type,
      )
      const idx = !options?.day || options?.day > result.length ? result.length - 1 : options?.day - 1
      if (result) {
        const output = session.text('.output', {
          bossName: boss.name,
          day: result[idx].day,
          job,
          server: session.text(/^cn$/i.test(options?.server) ? '.server.cn' : '.server.intl'),
          dpsType: options?.type || 'adps',
          percentile: numberToFixed(result[idx].percentiles, options?.precision),
        })

        console.error(output)
        return output
      }
    })
}

export async function getDpsTable(ctx: Context, boss: DPS.Boss, job: string, day = 0, isCN = false, dpsType = 'adps') {
  // eslint-disable-next-line max-len
  const url = `https://www.fflogs.com/zone/statistics/table/${boss.quest}/dps/${boss.id}/${boss.savage}/8/${
    isCN ? boss.cnServer : boss.intlServer
  }/100/1000/7/${boss.patch}/Global/${job}/All/0/normalized/single/0/-1/?keystone=15&dpstype=${dpsType}`

  const hashedUrl = hashUrl(url)
  const cached = await ctx.cache.get('fflogs', hashedUrl)

  if (cached) {
    return cached
  }

  try {
    const data = await ctx.http.get<string>(url, {
      headers: { referer: 'https://www.fflogs.com/' },
      responseType: 'text',
    })

    const statistics: Partial<Record<(typeof DPS.PERCENTILES)[number], number[]>> = {}
    for (const percentage of DPS.PERCENTILES) {
      // eslint-disable-next-line max-len
      const regex = new RegExp(
        `series${percentage === 100 ? '' : percentage}.data.push\\([+-]?(0|(?:[1-9]\\d*)(?:\\.\\d+)?)\\)`,
        'g',
      )
      const match = data.match(regex)

      if (!match) {
        continue
      }

      // There might be multiple matches, so we make it as a list
      statistics[percentage] = match.map((m) => parseFloat(m.match(/\([+-]?(0|(?:[1-9]\d*)(?:\.\d+)?)\)/)![1]))
    }
    // throw in case of inconsistent data length
    if (
      Object.keys(statistics).length !== DPS.PERCENTILES.length ||
      Object.values(statistics).some((v) => v.length !== statistics[100]!.length)
    ) {
      throw new SessionError('commands.fflogs.dps.messages.inconsistentData')
    }

    // throw in case of all 0 or no data
    if (Object.values(statistics).every((v) => v.length === 0 || v.every((v) => v === 0))) {
      throw new SessionError('commands.fflogs.dps.messages.noData', { bossName: boss.name, day, job, dpsType })
    }

    const report: DPS.FFLogsReport[] = []

    for (let i = 0; i < statistics[100]!.length; i++) {
      const percentiles: Record<number, number> = {}
      for (const percentage of DPS.PERCENTILES) {
        percentiles[percentage] = statistics[percentage]![i]
      }
      report.push({
        day: i,
        percentiles,
      })
    }

    await ctx.cache.set('fflogs', hashedUrl, report, 1000 * 60 * 60 * 1) // 1 hours

    return report
  } catch (error) {
    if (error instanceof SessionError) {
      throw error
    }
    throw new SessionError('commands.fflogs.dps.messages.error', {
      bossName: boss.name,
      day,
      job,
      dpsType,
      error: (error as Error).message,
    })
  }
}

export function hashUrl(url: string): string {
  return createHash('md5').update(url).digest('hex')
}

export function numberToFixed(obj: Record<number | string, number>, precision = 2): Record<number | string, string> {
  const result: Record<number | string, string> = {}
  for (const [key, value] of Object.entries(obj)) {
    result[key] = value.toFixed(precision)
  }
  return result
}

declare module '@koishijs/cache' {
  export interface Tables {
    fflogs: DPS.FFLogsReport[]
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace DPS {
  export type DPSType = 'adps' | 'rdps' | 'ndps' | 'cdps'
  export interface Boss {
    id: number
    quest: number
    name: string
    cnName: string
    aliases: string[]
    addTime: number
    cnAddTime: number
    cnOffset: number
    parsedDays: number
    frozen: boolean
    patch: number
    /** 100 for normal, 101 for savage */
    savage: number
    intlServer: number
    cnServer: number
  }
  export const PERCENTILES = [10, 25, 50, 75, 95, 99, 100] as const
  export interface FFLogsReport {
    day: number
    percentiles: Record<number, number>
  }
}
