# 雀记 V2：仅使用 Cloudflare 网页端部署

## 一、升级数据库

打开 Cloudflare 控制台：

1. `存储和数据库`
2. `D1 SQL 数据库`
3. 进入 `mahjong-score-db`
4. 打开 `控制台 / Console`

如果你已经有旧版牌局数据，只执行 `migrations/0002_auth.sql`。

注意：`ALTER TABLE ... ADD COLUMN` 只能执行一次。若提示 `duplicate column name: owner_user_id`，说明该字段已经创建，无需重复执行。

如果是全新数据库，先执行 `migrations/0001_init.sql`，再执行 `migrations/0002_auth.sql`。

建议在 SQL Console 中分两段执行：

第一段：

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
```

第二段：

```sql
ALTER TABLE matches ADD COLUMN owner_user_id TEXT REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_matches_owner_created
ON matches(owner_user_id, created_at DESC);
```

## 二、把 V2 上传到 GitHub

Cloudflare 网页编辑器不适合一次上传完整 Vite 项目，推荐仍然全程使用网页：

1. 在 GitHub 打开原仓库 `mahjong-score`
2. 点击 `Add file`
3. 选择 `Upload files`
4. 解压本压缩包
5. 把解压后的文件拖进 GitHub 上传区域
6. 提交到主分支

GitHub 网页上传文件夹时，请确保最终结构是：

```text
package.json
wrangler.jsonc
index.html
src/main.tsx
src/styles.css
worker/index.ts
shared/types.ts
migrations/...
```

不要多套一层 `mahjong-score-v2/` 目录。

## 三、Cloudflare 重新部署

如果 Worker 已连接 GitHub：

1. 打开 `Workers 和 Pages`
2. 进入 `mahjong-score`
3. 打开 `部署 / Deployments`
4. 点击 `创建部署 / Retry deployment`，或等待 GitHub 提交自动触发
5. 构建命令填写：`npm run build`
6. 部署命令填写：`npx wrangler deploy`

如果当前项目未连接 GitHub，进入 Worker 的 `设置 → 构建 → 连接 GitHub`，选择仓库。

## 四、数据库绑定

确认 Worker 设置中存在 D1 绑定：

```text
变量名：DB
数据库：mahjong-score-db
```

`wrangler.jsonc` 中已包含该绑定，但 Cloudflare 构建环境仍需有权访问该数据库。

## 五、上线后测试

1. 打开网站注册账号；
2. 创建牌局并录一局；
3. 换一个浏览器登录同一账号；
4. 在“历史牌局”打开；
5. 继续录分；
6. 使用分享码在未登录窗口打开，确认只能查看；
7. 检查自摸时三名非赢家都需要支付。
