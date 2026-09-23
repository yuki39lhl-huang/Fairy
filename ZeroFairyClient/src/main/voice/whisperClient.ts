import { app } from 'electron'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

function getWhisperPaths() {
  const resourcesRoot = app.isPackaged
    ? process.resourcesPath
    : path.join(app.getAppPath(), 'resources')

  return {
    exe: path.join(resourcesRoot, 'whisper', 'Release', 'whisper-cli.exe'),
    model: path.join(resourcesRoot, 'models', 'ggml-small.bin')
  }
}

export function transcribeSpeech(audioPath: string): Promise<string> {
  const { exe, model } = getWhisperPaths()
  const outputBase = path.join(tmpdir(), `zerofairy-whisper-${randomUUID()}`)
  const outputTextPath = `${outputBase}.txt`

  return new Promise((resolve, reject) => {
    const child = spawn(
      exe,
      [
        '-m', model,
        '-f', audioPath,
        '-l', 'zh',
        '--no-timestamps',
        '--no-prints',
        '--output-txt',
        '--output-file', outputBase,
        '-t', '4'
      ],
      { windowsHide: true }
    )

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })

    child.on('error', (error) => {
      reject(new Error(`Whisper failed to start: ${error.message}`))
    })

    child.on('close', async (code) => {
      try {
        if (code !== 0) {
          reject(new Error(`Whisper exited with code ${code}: ${stderr || stdout}`))
          return
        }

        const transcript = (await fs.readFile(outputTextPath, 'utf8')).trim()
        resolve(transcript)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        reject(new Error(`Failed to read Whisper output: ${message}`))
      } finally {
        await fs.unlink(outputTextPath).catch(() => {})
      }
    })
  })
}
