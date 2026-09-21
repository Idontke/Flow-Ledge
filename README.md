# FlowLedger 净值簿

FlowLedger 是一个手机优先的个人财务 Web App，将日常流水、账户余额、多币种资产、Crypto 持仓、预算和固定账单放在同一本账中。

## 主要功能

- 收入、支出、转账和投资流水
- 现金、投资、负债与 Crypto 账户
- CNY、USD、USDT 等多币种折算
- 历史汇率锁定与行情容错
- 预算、固定账单、完整历史分页和搜索
- CSV 导出、JSON 备份恢复与回收站
- PWA 主屏幕图标、离线提示和启动画面

## 隐私说明

此公开源码副本不包含真实账户、余额、流水、备份、数据库文件、访问令牌或原部署项目标识。应用运行时的财务数据存放在 Cloudflare D1 中，不在本仓库内。

请勿提交以下内容：

- `.env`、`.dev.vars` 或任何密钥文件
- 数据库文件和 D1 导出
- FlowLedger JSON 备份或 CSV 导出
- 含个人项目 ID 的部署配置

提交前请查看 [PUBLIC_RELEASE_CHECKLIST.md](PUBLIC_RELEASE_CHECKLIST.md)。

## 技术栈

- Next.js / React / TypeScript
- Vinext / Vite
- Cloudflare Workers / D1
- Drizzle ORM

## 本地准备

需要 Node.js 22.13 或更高版本。复制环境变量示例并填写自己的公开站点地址：

```bash
cp .env.example .env.local
npm ci
```

项目原有脚本针对 Sites 的 Linux 构建环境。Windows 建议使用 WSL；macOS 可能需要安装 GNU `timeout` 后再运行项目脚本。

```bash
npm run dev
```

数据库结构与迁移位于 `db/` 和 `drizzle/`。`.openai/hosting.json` 仅保留通用 D1 绑定，不包含原站点的项目 ID。

## 许可

本仓库尚未选择开源许可证。在添加许可证前，默认保留全部权利。
