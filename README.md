# 是但

一个帮人做随机决定的网站：先选主题，再由站点随机抽一种玩法，玩一次，摇出一个结果。

线上地址：<https://jayya.github.io/random-games/>

## 怎么玩

1. **选主题** —— 今天吃什么 / 今天玩什么 / 今天干什么。
2. **站点抽玩法** —— 转盘还是弹球机由站点 50/50 随机决定，你挑不了（[ADR-0007](docs/adr/0007-game-is-rolled-into-the-url.md)）。
3. **开抽** —— 转盘转一次停在指针处，或者拉柱塞打一发让球落进某个落格。
4. **收下中选** —— 不满意可以再来一次；开抽之前也可以「换一批」换掉上盘的候选。

### 两种玩法

| 玩法 | 盘面 | 上限 | 结果怎么定 |
| --- | --- | --- | --- |
| 转盘 | 等分圆盘，停在顶部指针处的扇区 | 12 个候选 | 先选中选，再反算旋转角度（[ADR-0003](docs/adr/0003-result-first-animation-second.md)） |
| 弹球机 | 钉阵、风车、弹力柱、底部落格 | 8 个候选 | 球实际落进哪格就是哪格，由物理仲裁（[ADR-0006](docs/adr/0006-pinball-is-arbitrated-by-physics.md)） |

候选多于上限时，站点会打乱名单取前若干个上盘，并在界面上标明「已从 N 个中随机选出 M 个」。

## 改名单

名单是仓库里的 CSV，没有后端、没有数据库（[ADR-0001](docs/adr/0001-csv-in-repo-no-backend.md)）。每个主题一份文件（[ADR-0005](docs/adr/0005-one-csv-per-theme.md)）：

- [public/eat.csv](public/eat.csv) —— 今天吃什么
- [public/play.csv](public/play.csv) —— 今天玩什么
- [public/work.csv](public/work.csv) —— 今天干什么

每行一个候选，两列 `name,enabled`：

```csv
# 以 # 开头的行是注释，空行忽略；没有表头行
沙县小吃,true
"老王烧烤, 二店",true
再也不去的那家,false
```

- `name`：候选的名字。名字里有逗号就用双引号包起来，要写双引号就双写成 `""`。
- `enabled`：只有 `false` / `0` / `no`（不区分大小写）算停用；留空、乱写、整列缺失都算启用。停用的候选留在文件里但不上盘面。

直接在 GitHub 网页上编辑这些文件并提交到 `master` 即可，推送后 Actions 会自动重新部署。

## 加一个主题

写一份 `public/<slug>.csv`，再往 [src/themes.ts](src/themes.ts) 的 `THEMES` 里加一条记录（slug、CSV 文件名、页面标题、首页入口文案、结果卡片上那句话）。路由和渲染一行都不用改。

## 本地开发

```bash
pnpm install
pnpm dev      # 开发服务器
pnpm test     # vitest
pnpm build    # tsc --noEmit + vite build
```

技术栈：TypeScript + Vite，无前端框架；弹球机的物理用 [matter.js](https://brm.io/matter-js/)，是仓库唯一的运行时依赖（[ADR-0008](docs/adr/0008-matter-js-over-hand-rolled-physics.md)）。推送到 `master` 由 [GitHub Actions](.github/workflows/deploy.yml) 构建并发布到 GitHub Pages。

## 文档

- [CONTEXT.md](CONTEXT.md) —— 项目的领域词汇表（主题、名单、候选、上盘名单、开抽、中选……）。读代码之前先读它。
- [docs/adr/](docs/adr/) —— 关键设计决策及其取舍。
