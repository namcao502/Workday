import { resolveDataDir } from '../dataDir.js'
import { importWpf, parseImportArgs } from './importWpf.js'
import { passwordFor, promptPassword } from './password.js'

const USAGE =
  'usage: npm run import-wpf -- --from <NoisWorkday folder> [--cred <file.nwcred>] [--dry-run]'

async function main(): Promise<number> {
  // npm runs the workspace script in packages/server; INIT_CWD is where the user typed it.
  const args = parseImportArgs(process.argv.slice(2), process.env['INIT_CWD'] ?? process.cwd())
  if (args === null) {
    console.error(USAGE)
    return 1
  }
  const result = await importWpf({
    dataDir: resolveDataDir(),
    from: args.from,
    cred: args.cred,
    readPassword: () => passwordFor(process.env, process.stdin.isTTY, promptPassword),
    dryRun: args.dryRun,
    log: (line) => {
      console.log(line)
    },
  })
  return result.exitCode
}

process.exitCode = await main()
