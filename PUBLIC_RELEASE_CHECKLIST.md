# 公开发布前检查清单

每次推送到公开 GitHub 仓库前检查：

- [ ] 没有 `.env`、`.dev.vars`、API Key、Token 或密码
- [ ] 没有真实姓名、邮箱、手机号、账号或银行卡信息
- [ ] 没有真实账户名称、余额、流水、预算、固定账单或持仓数据
- [ ] 没有 JSON 备份、CSV 导出、数据库文件或截图中的真实金额
- [ ] `.openai/hosting.json` 不含个人 Sites `project_id`
- [ ] `NEXT_PUBLIC_SITE_URL` 未写入个人专属域名
- [ ] `git status` 中只出现准备公开的源码文件
- [ ] 首次公开仓库使用全新的 Git 历史，而不是原私有项目历史

可用以下命令做基础检查：

```bash
git status
git grep -n -I -E "(password|secret|api[_-]?key|token|bearer)"
git diff --cached
```

自动扫描只能辅助判断，提交前仍应人工检查变更和图片。
