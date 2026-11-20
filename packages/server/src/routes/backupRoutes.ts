import { todayIn, type AppError, type BackupImportResult } from '@workday/core'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { BackupError, createBackup, openBackup } from '../backup/backupFile.js'
import { stageImport } from '../backup/pendingImport.js'
import { isRecord } from '../jsonFile.js'

const MIN_PASSWORD_LENGTH = 8
const IMPORT_BODY_LIMIT = 20 * 1024 * 1024

function fail(reply: FastifyReply, code: AppError['code']): FastifyReply {
  return reply.code(400).send({ ok: false, error: { code } })
}

function passwordOf(body: unknown): string | null {
  const password = isRecord(body) ? body['password'] : null
  return typeof password === 'string' ? password : null
}

// File name date is in the configured time zone, like the other day-based names.
export function registerBackupRoutes(
  app: FastifyInstance,
  dataDir: string,
  timeZone: () => string,
): void {
  app.post('/api/backup/export', async (request, reply) => {
    const password = passwordOf(request.body)
    if (password === null) {
      return reply.code(400).send({ error: 'Body must be { password: string }' })
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return fail(reply, 'backupPasswordTooShort')
    }
    const now = new Date()
    const day = todayIn(timeZone(), now).replaceAll('-', '')
    const text = await createBackup(dataDir, password, now)
    return reply
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Disposition', `attachment; filename="workday-backup-${day}.wdbackup"`)
      .send(text)
  })

  app.post(
    '/api/backup/import',
    { bodyLimit: IMPORT_BODY_LIMIT },
    async (request, reply): Promise<BackupImportResult | FastifyReply> => {
      const password = passwordOf(request.body)
      const data = isRecord(request.body) ? request.body['data'] : null
      if (password === null || typeof data !== 'string') {
        return reply.code(400).send({ error: 'Body must be { password: string, data: string }' })
      }
      try {
        const files = await openBackup(data, password)
        await stageImport(dataDir, files)
        return { files: [...files.keys()].sort() }
      } catch (error) {
        if (error instanceof BackupError) {
          return fail(reply, error.code)
        }
        throw error
      }
    },
  )
}
