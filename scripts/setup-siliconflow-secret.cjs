// Run manually on the trusted server. No API key is written to Git, logs, or argv.
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const source = process.env.SILICONFLOW_ENV_FILE || '/root/gpt/enterprise-agent-platform/.env'
const file = fs.readFileSync(source, 'utf8')
const line = file.split(/\r?\n/).find(row => /^\s*LLM_API_KEY\s*=/.test(row))
if (!line) throw Error('LLM_API_KEY not found in specified env file')
const key = line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')
if (!key.startsWith('sk-')) throw Error('LLM_API_KEY has unexpected format')
if (!process.env.CLOUDFLARE_API_TOKEN) throw Error('Set CLOUDFLARE_API_TOKEN in your environment first')

const wrangler = '/root/gpt/mahjong-score/node_modules/wrangler/bin/wrangler.js'
if (!fs.existsSync(wrangler)) throw Error('Existing wrangler installation not found')
const result = spawnSync(process.execPath, [
  wrangler, 'secret', 'put', 'SILICONFLOW_API_KEY', '--config', 'wrangler.jsonc',
], {
  cwd: path.resolve(__dirname, '..'),
  input: key + '\n',
  encoding: 'utf8',
  env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: 'abcc14412cc26ac8c0063ebda73aa924' },
  timeout: 45000,
})
if (result.error || result.status !== 0) {
  console.error('Failed to bind Cloudflare Worker secret. Check Cloudflare token permissions.')
  process.exit(1)
}
console.log('SILICONFLOW_API_KEY bound to Cloudflare Worker (value not displayed).')
