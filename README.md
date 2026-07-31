# 雀记 · 微信小程序独立版

这是 `mahjong-score` 仓库中面向微信小程序的独立版本，前端和后端都维护在同一个分支中。

- 前端：Taro 4 + React 18 微信小程序
- 后端：Cloudflare Worker + Hono
- 数据库：独立 Cloudflare D1
- 微信小程序 AppID：`wx20c3e07df7656e03`
- Worker 域名：`https://wx.score.majhoon.site`
- Worker 名称：`mahjong-score-wechat`
- D1 名称：`mahjong-score-wechat-db`

该版本不读取原网页端的 Worker 或 D1 数据，账号、会话、牌局和统计全部独立。

## 功能

- 微信快捷登录，首次登录自动创建独立账号
- 用户名密码注册和登录作为备用方式
- 创建四人牌局、分享码查看、计分、撤销和结束本将
- 历史牌局、删除历史记录、每日战绩统计
- 玩家战绩明细与大牌备注统计
- 独立会话 Token 和牌局管理员 Token

## 目录

```text
src/                         Taro 小程序前端
src/services/api.ts          小程序 API 客户端
src/shared/types.ts          前后端共享类型
worker/index.ts              Cloudflare Worker API
worker/cloudflare.d.ts       本地 Cloudflare 运行时类型
migrations/0001_initial.sql  独立 D1 初始结构
config/index.ts              Taro 构建配置
scripts/upload-weapp.cjs     微信小程序 CI 上传脚本
wrangler.jsonc               Worker、D1 和自定义域名配置
project.config.json          微信开发者工具项目配置
```

## 环境要求

- Node.js 20+
- npm
- Cloudflare 账号，且 `majhoon.site` 已接入该账号
- 微信小程序管理员或开发者权限

## 安装与检查

```bash
npm ci
npm run typecheck
npm run build:weapp
```

生产构建默认读取：

```text
TARO_APP_ID=wx20c3e07df7656e03
TARO_APP_API_BASE=https://wx.score.majhoon.site
```

配置位于 `.env.production`。

### 低配置服务器

在内存较小的服务器上可以限制 Node 内存和 CPU：

```bash
NODE_OPTIONS="--max-old-space-size=768" nice -n 10 taskset -c 0 npm run build:weapp
```

`config/index.ts` 还支持可选的 `TARO_DEPENDENCY_NODE_MODULES`，用于在本机复用一套已经安装完成的依赖。正常开发、CI 和正式部署不需要设置。

## 创建独立 D1

先登录 Cloudflare：

```bash
npx wrangler login
```

创建数据库：

```bash
npm run db:create
```

Wrangler 会返回新的 `database_id`。将它写入 `wrangler.jsonc`：

```jsonc
{
  "binding": "DB",
  "database_name": "mahjong-score-wechat-db",
  "database_id": "这里替换成新数据库 ID",
  "migrations_dir": "migrations"
}
```

应用线上迁移：

```bash
npm run db:migrate:remote
```

本地验证迁移：

```bash
npm run db:migrate:local
```

## 配置微信登录

为避免代码托管平台把微信 AppID 误判为凭据，Worker 端的 AppID 和 AppSecret 都通过 Cloudflare Secret 注入：

```bash
npx wrangler secret put WECHAT_APP_ID
npx wrangler secret put WECHAT_APP_SECRET
```

分别按提示输入小程序 AppID 和 AppSecret。不要把 AppSecret 写入源码、`.env.production`、`wrangler.jsonc` 或 Git。

微信登录流程：

```text
小程序调用 Taro.login / wx.login
→ POST /api/auth/wechat
→ Worker 调用微信 jscode2session
→ 根据 OpenID 查找或创建用户
→ Worker 返回业务 Token
```

## Git 与部署方式

本项目的源码唯一来源是 GitHub 分支：

```text
https://github.com/yvanu/mahjong-score/tree/wechat-taro-worker
```

Cloudflare 控制台显示 `Source: Upload` 是正常的，因为 Worker 由 Wrangler 从 Git 工作区上传。不要在 Cloudflare 在线编辑器中直接改代码，否则修改不会进入 Git。

后续修改流程：

```bash
git checkout wechat-taro-worker
git pull
# 修改并验证代码
git add .
git commit -m "描述本次修改"
git push
```

`.github/workflows/deploy-worker.yml` 会监听 `wechat-taro-worker` 分支。每次 push 后，GitHub Actions 会自动：

1. 安装锁文件中的依赖
2. 执行 Worker TypeScript 检查
3. 应用远程 D1 migration
4. 执行 `wrangler deploy`

在 GitHub 仓库的 `Settings → Secrets and variables → Actions` 中添加两个 Repository Secret：

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

Cloudflare Token 至少需要 Worker 脚本和 D1 的编辑权限。由于 `wrangler.jsonc` 同时声明了 `wx.score.majhoon.site` 自定义域名，该 Token 还需要对应 Zone 的 Workers Routes 编辑权限。

`WECHAT_APP_ID` 和 `WECHAT_APP_SECRET` 继续保存在 Cloudflare Worker Secrets 中，不需要放进 GitHub Actions，也不能提交到 Git。

仍然可以在需要时手动执行 `npm run deploy`。Git 提交可用于查看历史、对比修改和回滚。

## 部署 Worker

确认以下项目已完成：

1. `wrangler.jsonc` 已替换为真实的独立 D1 `database_id`
2. 已设置 `WECHAT_APP_ID` 和 `WECHAT_APP_SECRET`
3. `wx.score.majhoon.site` 所在域名已接入当前 Cloudflare 账号

部署数据库迁移和 Worker：

```bash
npm run deploy
```

只部署 Worker：

```bash
npm run deploy:worker
```

部署后检查：

```text
https://wx.score.majhoon.site/api/health
```

预期返回包含：

```json
{
  "ok": true,
  "service": "mahjong-score-wechat"
}
```

## 配置微信请求域名

登录微信公众平台，在小程序的服务器域名中添加 request 合法域名：

```text
https://wx.score.majhoon.site
```

域名必须可通过 HTTPS 访问，且证书有效。

## 构建并上传小程序

代码上传密钥文件默认放在项目根目录：

```text
private.wx20c3e07df7656e03.key
```

该文件已经被 `.gitignore` 排除，不能提交到仓库。

构建：

```bash
npm run build:weapp
```

上传开发版本：

```bash
npm run upload:weapp
```

自定义上传版本和说明：

```bash
WEAPP_VERSION=1.1.0 \
WEAPP_DESC="微信登录与独立 Worker 后端" \
npm run upload:weapp
```

上传后仍需在微信公众平台手动选择体验版、提交审核和发布。

## 安全说明

- 微信 AppSecret 只保存在 Cloudflare Secret
- 微信 OpenID 只保存在独立 D1
- 登录 Token 和牌局管理员 Token 在 D1 中只保存 SHA-256 摘要
- 密码使用 PBKDF2-SHA-256 加盐派生
- 分享码只提供读取能力，不能直接修改牌局
- 小程序代码上传私钥不会进入 Git
