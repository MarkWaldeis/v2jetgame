/**
 * Packt dist/ als itch.io-HTML5-ZIP.
 * index.html muss im ZIP-Root liegen (nicht in einem Unterordner).
 */
import { existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const appDir = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const distDir = join(appDir, 'dist')
const outDir = join(appDir, '..', '..', 'release')
const zipPath = join(outDir, 'fight-jet-3d-web.zip')

const ITCH_MAX_EXTRACTED = 500 * 1024 * 1024
const ITCH_MAX_FILE = 200 * 1024 * 1024
const ITCH_MAX_FILES = 1000

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name)
    if (name.isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

function fmtMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

if (!existsSync(join(distDir, 'index.html'))) {
  console.error('dist/index.html fehlt. Zuerst: npm run build')
  process.exit(1)
}

const files = walk(distDir)
const sizes = files.map((p) => ({ path: p, size: statSync(p).size }))
const total = sizes.reduce((n, f) => n + f.size, 0)
const largest = [...sizes].sort((a, b) => b.size - a.size)[0]

console.log(`dist: ${files.length} Dateien, ${fmtMb(total)}`)
console.log(`größte Datei: ${relative(distDir, largest.path)} (${fmtMb(largest.size)})`)

if (files.length > ITCH_MAX_FILES) {
  console.error(`Zu viele Dateien (${files.length} > ${ITCH_MAX_FILES})`)
  process.exit(1)
}
if (total > ITCH_MAX_EXTRACTED) {
  console.error(`Paket zu groß (${fmtMb(total)} > 500 MB unpacked)`)
  process.exit(1)
}
if (largest.size > ITCH_MAX_FILE) {
  console.error(`Einzeldatei zu groß (${fmtMb(largest.size)} > 200 MB)`)
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })
if (existsSync(zipPath)) rmSync(zipPath)

const tar = spawnSync(
  'tar',
  ['-a', '-c', '-f', zipPath, '-C', distDir, '.'],
  { stdio: 'inherit' }
)
if (tar.status !== 0) {
  console.error('tar konnte das ZIP nicht erzeugen.')
  process.exit(tar.status ?? 1)
}

const zipSize = statSync(zipPath).size
console.log(`\nitch.io-ZIP: ${zipPath}`)
console.log(`ZIP-Größe: ${fmtMb(zipSize)}`)
console.log('Dieses ZIP auf itch.io hochladen (Kind: HTML, „This file will be played in the browser“).')
