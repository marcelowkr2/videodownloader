import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { spawn } from 'node:child_process'
import { createReadStream, existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join, normalize, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

type Mode = 'video' | 'audio'
type JobStatus = 'running' | 'done' | 'error'

interface Job {
  id: string
  ip: string
  status: JobStatus
  progress: number
  message: string
  dir: string
  file?: string
  createdAt: number
}

const PORT = Number(process.env.PORT ?? 3000)
const STATIC_DIR = resolve(process.env.STATIC_DIR ?? 'dist')
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT ?? 2)
const MAX_PER_WINDOW = Number(process.env.MAX_PER_WINDOW ?? 6)
const WINDOW_MS = 10 * 60 * 1000
const JOB_TTL_MS = 20 * 60 * 1000
const MAX_DURATION_S = Number(process.env.MAX_DURATION_S ?? 3600)
const MAX_FILESIZE = process.env.MAX_FILESIZE ?? '700M'
const DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1000

const VIDEO_FORMATS = ['mp4', 'mkv']
const AUDIO_FORMATS = ['mp3', 'm4a', 'opus', 'wav']
const RESOLUTIONS = ['best', '2160', '1440', '1080', '720', '480']

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
}

const jobs = new Map<string, Job>()
const hits = new Map<string, number[]>()

function isYouTubeUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean).length === 1
    if (host !== 'youtube.com' && host !== 'm.youtube.com' && host !== 'music.youtube.com') return false
    return url.pathname === '/watch'
      ? url.searchParams.has('v')
      : /^\/(shorts|embed|live)\/[^/]+/.test(url.pathname)
  } catch {
    return false
  }
}

function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for']
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim()
  return first || req.socket.remoteAddress || 'unknown'
}

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent)
    return true
  }
  recent.push(now)
  hits.set(ip, recent)
  return false
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let data = ''
    req.on('data', (chunk: Buffer) => {
      data += chunk
      if (data.length > 4096) {
        reject(new Error('Requisição muito grande.'))
        req.destroy()
      }
    })
    req.on('end', () => resolveBody(data))
    req.on('error', reject)
  })
}

function buildArgs(job: Job, url: string, mode: Mode, resolution: string, format: string): string[] {
  const common = [
    '--no-playlist',
    '--no-warnings',
    '--newline',
    '--restrict-filenames',
    '--max-filesize', MAX_FILESIZE,
    '--match-filter', `duration<=${MAX_DURATION_S}`,
    '--progress-template', 'download:PROGRESS %(progress._percent_str)s',
    '--js-runtimes', 'node',
    '-o', join(job.dir, '%(title).120B.%(ext)s'),
  ]
  if (mode === 'audio') {
    return ['-x', '--audio-format', format, ...common, '--', url]
  }
  const selector = resolution === 'best'
    ? 'bv*+ba/b'
    : `bv*[height<=${resolution}]+ba/b[height<=${resolution}]`
  return ['-f', selector, '--merge-output-format', format, ...common, '--', url]
}

function runJob(job: Job, url: string, mode: Mode, resolution: string, format: string): void {
  const child = spawn('yt-dlp', buildArgs(job, url, mode, resolution, format), {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  const timer = setTimeout(() => child.kill('SIGKILL'), DOWNLOAD_TIMEOUT_MS)

  child.stdout.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n')) {
      const match = /^PROGRESS\s+([\d.]+)%/.exec(line.trim())
      if (match) job.progress = Math.min(99, Number(match[1]))
      else if (line.includes('[Merger]') || line.includes('[ExtractAudio]')) job.message = 'Finalizando arquivo…'
    }
  })
  child.stderr.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-2000)
  })
  child.on('error', () => {
    clearTimeout(timer)
    job.status = 'error'
    job.message = 'yt-dlp não está disponível no servidor.'
  })
  child.on('close', async (code) => {
    clearTimeout(timer)
    try {
      const files = (await readdir(job.dir)).filter((f) => !f.endsWith('.part') && !f.endsWith('.ytdl'))
      if (code === 0 && files.length > 0) {
        job.file = files[0]
        job.status = 'done'
        job.progress = 100
        job.message = 'Pronto!'
        return
      }
    } catch {
      // cai no erro abaixo
    }
    job.status = 'error'
    job.message = friendlyError(stderr)
    console.error(`[job ${job.id}] yt-dlp saiu com código ${code}: ${stderr.trim().slice(-500)}`)
  })
}

function friendlyError(stderr: string): string {
  if (/does not pass filter|duration/i.test(stderr)) return `O vídeo é maior que o limite de ${Math.floor(MAX_DURATION_S / 60)} minutos.`
  if (/larger than max-filesize|File is larger/i.test(stderr)) return `O arquivo excede o limite de ${MAX_FILESIZE}.`
  if (/sign in|bot|confirm you.re not/i.test(stderr)) return 'O YouTube bloqueou o servidor para este vídeo. Use o comando no terminal.'
  if (/private|unavailable|removed|not available/i.test(stderr)) return 'Vídeo privado ou indisponível.'
  return 'Não foi possível baixar este vídeo. Tente novamente ou use o comando no terminal.'
}

async function removeJob(job: Job): Promise<void> {
  jobs.delete(job.id)
  await rm(job.dir, { recursive: true, force: true })
}

async function handleCreate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const ip = clientIp(req)
  let payload: { url?: unknown, mode?: unknown, resolution?: unknown, format?: unknown }
  try {
    payload = JSON.parse(await readBody(req))
  } catch {
    return sendJson(res, 400, { error: 'Requisição inválida.' })
  }

  const url = typeof payload.url === 'string' ? payload.url.trim() : ''
  const mode: Mode = payload.mode === 'audio' ? 'audio' : 'video'
  const resolution = typeof payload.resolution === 'string' ? payload.resolution : 'best'
  const format = typeof payload.format === 'string' ? payload.format : ''

  if (!isYouTubeUrl(url)) return sendJson(res, 400, { error: 'Link do YouTube inválido.' })
  if (!RESOLUTIONS.includes(resolution)) return sendJson(res, 400, { error: 'Resolução inválida.' })
  if (!(mode === 'audio' ? AUDIO_FORMATS : VIDEO_FORMATS).includes(format)) {
    return sendJson(res, 400, { error: 'Formato inválido.' })
  }

  const running = [...jobs.values()].filter((j) => j.status === 'running').length
  if (running >= MAX_CONCURRENT) {
    return sendJson(res, 503, { error: 'Servidor ocupado. Tente novamente em instantes.' })
  }
  if (rateLimited(ip)) {
    return sendJson(res, 429, { error: 'Limite de downloads atingido. Aguarde alguns minutos.' })
  }

  const job: Job = {
    id: randomUUID(),
    ip,
    status: 'running',
    progress: 0,
    message: 'Baixando…',
    dir: await mkdtemp(join(tmpdir(), 'vd-')),
    createdAt: Date.now(),
  }
  jobs.set(job.id, job)
  runJob(job, url, mode, resolution, format)
  sendJson(res, 202, { id: job.id })
}

async function handleFile(job: Job, res: ServerResponse): Promise<void> {
  if (job.status !== 'done' || !job.file) return sendJson(res, 409, { error: 'Arquivo ainda não está pronto.' })
  const path = join(job.dir, job.file)
  const size = (await stat(path)).size
  const ascii = job.file.replace(/[^\x20-\x7e]/g, '_').replaceAll('"', '')
  res.writeHead(200, {
    'Content-Type': MIME[extname(job.file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': size,
    'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(job.file)}`,
    'Cache-Control': 'no-store',
  })
  const stream = createReadStream(path)
  stream.pipe(res)
  res.on('close', () => { void removeJob(job) })
}

async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '')
  let file = resolve(STATIC_DIR, relative || 'index.html')
  if (!file.startsWith(STATIC_DIR) || !existsSync(file) || (await stat(file)).isDirectory()) {
    file = join(STATIC_DIR, 'index.html')
  }
  const headers: Record<string, string> = {
    'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
  }
  if (file.startsWith(join(STATIC_DIR, 'assets'))) headers['Cache-Control'] = 'public, max-age=31536000, immutable'
  res.writeHead(200, headers)
  res.end(await readFile(file))
}

const server = createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')

    if (req.method === 'POST' && pathname === '/api/downloads') return await handleCreate(req, res)

    const match = /^\/api\/downloads\/([0-9a-f-]{36})(\/file)?$/.exec(pathname)
    if (req.method === 'GET' && match) {
      const job = jobs.get(match[1])
      if (!job || job.ip !== clientIp(req)) return sendJson(res, 404, { error: 'Download não encontrado.' })
      if (match[2]) return await handleFile(job, res)
      return sendJson(res, 200, { status: job.status, progress: job.progress, message: job.message })
    }

    if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Não encontrado.' })
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Método não permitido.' })
    await serveStatic(pathname, res)
  } catch (error) {
    console.error(error)
    if (!res.headersSent) sendJson(res, 500, { error: 'Erro interno.' })
    else res.end()
  }
})

setInterval(() => {
  const now = Date.now()
  for (const job of jobs.values()) {
    if (now - job.createdAt > JOB_TTL_MS && job.status !== 'running') void removeJob(job)
  }
  for (const [ip, times] of hits) {
    const recent = times.filter((t) => now - t < WINDOW_MS)
    if (recent.length) hits.set(ip, recent)
    else hits.delete(ip)
  }
}, 60_000).unref()

server.listen(PORT, () => console.log(`Servidor em http://0.0.0.0:${PORT}`))
