---
status: proposed
---

# 一个目录一个 module，目录外只从 `index.ts` 进

`src/` 平铺时，一个文件属于哪个 module、是不是测试面、会不会进浏览器，只能逐个打开文件头注释才知道。因此 `src/` 下每个目录都是一个 module，`index.ts` 是它的 interface：目录及其子目录里的文件随意互相引用，目录外的只能 import `index.ts`，`import type` 也算。`src/` 顶层只放入口、测试帮手，以及没有依赖、被几个顶层目录共用的单文件 module。`theme/` 和 `cooldown/` 已按此落地，其余是目标结构，尚未搬。

```
src/
  main.ts  testHelpers.ts  style.css  vite-env.d.ts
  random.ts  angles.ts  palette.ts  byId.ts    单文件 module
  theme/       主题、名单文件、名单、名单错误
  cooldown/    冷却
  navigation/  站内导航与地址
  gamePage/    玩法页宿主、盘面契约、页面适配器与结果卡片的 interface
  games/       玩法与玩法清单；两个盘面共用的对齐画布
    wheel/  pinball/
  browser/     核心 module 的生产 adapter：页面适配器与各屏 HTML、取名单、localStorage
  build/       只在 Node 里跑：读名单文件、主题发现插件、名单文件的构建关卡（ADR-0009）
```

## Considered Options

- **只靠惯例和评审守**：`theme/`、`cooldown/` 起初就是这样，规则只写在头注释里，没有东西拦。
- **oxlint `no-restricted-imports`**：按路径模式拦，分不清引用者在不在同一个目录里。
- **允许只做归类、没有 `index.ts` 的目录（如 `shared/`）**：读者得先分辨自己在哪种目录里，正是要去掉的那层猜测。
- **按 module 拆测试帮手（`<module>/testing.ts`）**：现有替身都只替系统边界，不伸进 module 内部，一份顶层文件守同一条规则就够。

## Consequences

- **由 `src/architecture.test.ts` 守**，跑在 `pnpm test` 里：每个目录都有 `index.ts`；跨出目录的 import 只落在某个 `index.ts` 或顶层单文件 module 上；顶层除入口和测试帮手外不 import `src/` 里的任何东西。`e2e/` 和 `vite.config.ts` 不在 `src/` 里，不查。
- **共用的东西放进所有使用者共同的最近目录**：对齐画布只有两个盘面用，放在 `games/` 里，不进 `games/index.ts`（ADR-0013）；`escapeHtml` 只有各屏 HTML 用，归 `browser/`。
- **interface 归 seam 的主人**：`ResultCard`、`PageAdapter` 的类型归 `gamePage/`，`NavigationPage` 归 `navigation/`；`browser/` 只实现它们。
- **盘面的渲染层仍归各自的玩法**：盘面自己画（ADR-0012），`browser/` 不收盘面。
- **目录名对齐 GLOSSARY**（`theme`、`cooldown`、`games`、`gamePage`）；站内导航、玩法页宿主是代码里的叫法，不进 GLOSSARY。
- **依赖只朝一个方向**：`navigation` → `gamePage` / `games` / `cooldown` / `theme`；`browser` → `navigation`（只引写地址的函数）/ `gamePage` / `theme`；`games` → `gamePage`；`build` → `theme`。
