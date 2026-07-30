# 雀记 · 麻将计分 MVP

手机优先的四人麻将计分网站，部署到 Cloudflare Workers，数据存储在 D1。

## 已实现

- 创建一将并录入四位玩家
- 根据姓名生成稳定的本地 Emoji 头像
- 点炮、自摸、流局、自定义分数
- 服务端校验四人分数之和为 0
- 实时累计排名
- 撤销上一局
- 结束牌局
- 胡牌率、自摸占比、放炮率、最高单局收益/损失等基础数据
- 管理员令牌保存在创建者浏览器 localStorage
- 分享码及只读查询接口

## 本地启动

要求 Node.js 20+。

```bash
npm install
npm run db:migrate:local
npm run dev
```

`npm run dev` 会先构建前端，再通过 Wrangler 启动 Worker。修改前端后需要重新运行该命令。

## 部署 Cloudflare

### 1. 登录

```bash
npx wrangler login
```

### 2. 创建 D1

```bash
npm run db:create
```

复制命令返回的 `database_id`，替换 `wrangler.jsonc` 中：

```json
"database_id": "REPLACE_WITH_YOUR_D1_DATABASE_ID"
```

### 3. 应用远程迁移

```bash
npm run db:migrate:remote
```

### 4. 部署

```bash
npm run deploy
```

## 统计口径

- 胡牌率 = 胡牌次数 / 已完成局数
- 自摸占比 = 自摸次数 / 胡牌次数
- 放炮率 = 放炮次数 / 已完成局数
- 排名 = 总净得分降序；同分时胡牌次数优先

## 第一版限制

- 目前创建者浏览器是唯一管理员设备
- 分享链接的前端只读恢复逻辑尚未接入，API 已支持用分享码读取
- 未实现账号系统、多人实时 WebSocket、连庄和番型自动计算
- “一将四圈”目前只显示轮次，北四之后不会自动结束，需手动点击结束
