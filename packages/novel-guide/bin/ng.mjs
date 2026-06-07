#!/usr/bin/env node
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const distCli = join(packageRoot, "dist", "cli.js")
const sourceCli = join(packageRoot, "src", "cli.ts")

const command = process.execPath
const args = existsSync(distCli)
  ? [distCli, ...process.argv.slice(2)]
  : [
      "--import",
      "tsx/esm",
      sourceCli,
      ...process.argv.slice(2),
    ]

const child = spawn(command, args, {
  stdio: "inherit",
  windowsHide: true,
})

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exitCode = code ?? 1
})

child.on("error", (error) => {
  console.error(`ng: failed to start: ${error.message}`)
  process.exitCode = 1
})
