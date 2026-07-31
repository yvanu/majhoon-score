const path = require('path')
const ci = require('miniprogram-ci')
const packageJson = require('../package.json')

const appid = process.env.WEAPP_APP_ID || 'wx20c3e07df7656e03'
const version = process.env.WEAPP_VERSION || packageJson.version
const desc = process.env.WEAPP_DESC || '微信登录与独立 Worker 后端'
const projectRoot = path.resolve(__dirname, '..')
const privateKeyPath = process.env.WEAPP_PRIVATE_KEY_PATH || path.join(projectRoot, `private.${appid}.key`)

async function main() {
  const project = new ci.Project({
    appid,
    type: 'miniProgram',
    projectPath: path.join(projectRoot, 'dist'),
    privateKeyPath,
    ignores: [],
  })

  const result = await ci.upload({
    project,
    version,
    desc,
    setting: { useProjectConfig: true },
    onProgressUpdate(progress) {
      const message = progress?._msg || progress?.message || progress?.status
      if (message) console.log(`[upload] ${message}`)
    },
  })

  console.log('UPLOAD_SUCCESS')
  console.log(JSON.stringify(result, null, 2))
}

main().catch(error => {
  console.error('UPLOAD_FAILED')
  console.error(error?.stack || error)
  process.exit(1)
})
