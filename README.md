# 雀记 · Cloudflare Workers v1.1

手机优先的四人麻将计分应用：React + Vite 前端，Hono Worker API，Cloudflare D1 数据库。

## v1.1 升级内容

- 修复 Worker Context / D1 泛型导致的 TS2347
- Worker、D1 查询和前端领域模型均使用严格 TypeScript 类型
- 导出 `AppType`，前端通过 `hono/client` RPC 调用全部 API
- Wrangler JSONC：Workers Static Assets、SPA fallback、API worker-first、observability
- React/Vite 严格构建配置
- 新增增量 D1 migration、事件审计表与查询索引
- 手机底部固定“记一局”入口
- 长按撤销（650ms）与普通点击撤销
- 深色/浅色模式并记忆偏好
- 计分弹窗自动保存草稿
- 统计页入场动画与战报图片分享
- 历史记录保留并展示最近计分
- Web App Manifest，可添加到手机桌面

## 环境

- Node.js 20+
- Cloudflare 账号
- 已创建的 D1 数据库

## 本地运行

```bash
npm install
npm run db:migrate:local
npm run dev
```

`npm run dev` 会先执行 TypeScript 检查和 Vite 构建，然后由 Wrangler 在本地启动 Worker，默认访问 `http://localhost:8787`。

前端单独热更新：

```bash
npm run dev:ui
```

注意：单独运行 Vite 时，API 仍需另开终端运行 Wrangler，或配置本地代理。

## 验证

```bash
npm run typecheck
npm run build
```

## D1

首次新建数据库：

```bash
npm run db:create
```

将命令返回的数据库 ID 写入 `wrangler.jsonc` 的 `database_id`。

应用本地迁移：

```bash
npm run db:migrate:local
```

应用线上迁移：

```bash
npm run db:migrate:remote
```

已有 v1 数据库会按顺序执行 `0002_worker_v11.sql`，不会重建现有表。

## 一键部署

```bash
npx wrangler login
npm run deploy
```

`npm run deploy` 会依次：

1. TypeScript 类型检查
2. Vite 前端构建
3. 线上 D1 migration
4. Wrangler 部署 Worker 与静态资源

只部署代码、不执行 migration：

```bash
npm run deploy:worker
```

## 目录

```text
shared/types.ts          前后端共享领域类型
src/main.tsx             React UI 与 Hono RPC 客户端
worker/index.ts          Hono Worker 与 AppType
migrations/              D1 migrations
wrangler.jsonc           Cloudflare 配置
public/manifest.webmanifest
```

## 安全说明

创建牌局时生成的管理员令牌仅保存在创建者浏览器的 localStorage；D1 中只保存 SHA-256 摘要。分享码只能读取牌局与统计，无法修改计分。
