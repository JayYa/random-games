---
name: 是但
description: 一本摆着小玩具的手帐：主题是拍在格子纸上的模切贴纸，每个玩法是一件立在纸上的小玩具，中选是一枚啪地拍下来的大贴纸。
colors:
  tomato: "#ff7a5c"
  sunflower: "#ffcf3d"
  mint: "#3fd0a8"
  sky: "#6f9bff"
  pink: "#ff8cc0"
  lilac: "#b294ff"
  on-palette: "#22253a"
  sticker-white: "#ffffff"
  sticker-white-night: "#f6f3ec"
  note-yellow: "#fff1a6"
  note-title: "#b4321f"
  note-ink: "#3b3320"
  graph-paper: "#eef3fb"
  graph-line: "#d3dff3"
  ink: "#22253a"
  ink-muted: "#555d80"
  highlighter: "rgba(255, 207, 61, 0.6)"
  focus: "#3a5cff"
  scrim: "rgba(238, 243, 251, 0.8)"
  shadow: "rgba(30, 42, 90, 0.2)"
  shadow-lift: "rgba(30, 42, 90, 0.3)"
  carton: "#ddb57c"
  carton-field: "#ecd09f"
  carton-pocket: "#e3c38e"
  carton-shade: "#c0935a"
  carton-cut: "#a77c45"
  carton-line: "rgba(110, 70, 30, 0.45)"
  brad: "#e6bd52"
  brad-rim: "#b98a26"
  brad-shine: "#fff3cc"
  pinball-ball: "#22253a"
  pinball-ball-shine: "rgba(255, 255, 255, 0.8)"
  wheel-disk: "#fffaf0"
  wheel-disk-alt: "#f5eddc"
  wheel-divider: "#e6dac2"
  night-paper: "#17171c"
  night-dots: "rgba(255, 255, 255, 0.13)"
  gel-ink: "#f3f0e8"
  gel-ink-muted: "#aaa5bb"
  highlighter-night: "rgba(178, 148, 255, 0.45)"
  focus-night: "#b294ff"
  scrim-night: "rgba(23, 23, 28, 0.82)"
  shadow-night: "rgba(0, 0, 0, 0.5)"
  shadow-lift-night: "rgba(0, 0, 0, 0.6)"
  carton-night: "#c9a26b"
  carton-field-night: "#d8b886"
  carton-pocket-night: "#cead78"
  carton-shade-night: "#a47a45"
  carton-cut-night: "#8e6738"
  carton-line-night: "rgba(80, 50, 20, 0.5)"
  wheel-disk-night: "#f3eee2"
  wheel-disk-alt-night: "#e7dfcc"
  wheel-divider-night: "#d6cbb2"
  die-mat: "#e3f6ef"
  die-stitch: "#9edcc9"
  die-fade: "rgba(255, 255, 255, 0.68)"
  die-mat-night: "#1f2e2c"
  die-stitch-night: "#3d6b60"
  die-fade-night: "rgba(246, 243, 236, 0.62)"
typography:
  display:
    fontFamily: "'Shidan Hand', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif"
    fontSize: "clamp(4rem, 22.5vw, 5.5rem)"
    fontWeight: 400
    lineHeight: 1
  headline:
    fontFamily: "'Shidan Hand', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif"
    fontSize: "clamp(2rem, calc((min(100vw, 408px) - 124px) / var(--len, 4)), 6rem)"
    fontWeight: 400
    lineHeight: 1.1
  title:
    fontFamily: "'Shidan Hand', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif"
    fontSize: "1.85rem"
    fontWeight: 400
    lineHeight: 1.25
  label-xl:
    fontFamily: "'Shidan Hand', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif"
    fontSize: "2.2rem"
    fontWeight: 400
    letterSpacing: "0.2em"
  label-lg:
    fontFamily: "'Shidan Hand', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 400
  label-note:
    fontFamily: "'Shidan Hand', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif"
    fontSize: "1.35rem"
    fontWeight: 400
  label:
    fontFamily: "'Shidan Hand', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 400
  label-prompt:
    fontFamily: "'Shidan Hand', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif"
    fontSize: "1.15rem"
    fontWeight: 400
  label-prompt-sm:
    fontFamily: "'Shidan Hand', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 400
  label-sm:
    fontFamily: "'Shidan Hand', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: 1.2
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: 1.55
  body-sm:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "0.85rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  board: "18px"
  sticker-sm: "22px"
  frame: "23px"
  sticker: "24px"
  sticker-lg: "28px"
  pill: "999px"
spacing:
  title-gap: "6px"
  page-gutter: "16px"
  page-stack: "18px"
  sticker-stack: "22px"
  grid-cell: "22px"
  overlay-gutter: "24px"
components:
  spin-cap:
    backgroundColor: "{colors.sky}"
    textColor: "{colors.on-palette}"
    typography: "{typography.label-xl}"
    rounded: "{rounded.pill}"
    width: "26% of the wheel"
  theme-sticker:
    backgroundColor: "{colors.mint}"
    textColor: "{colors.on-palette}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.sticker}"
    padding: "12px 28px"
    height: "84px"
  letter-sticker:
    backgroundColor: "{colors.tomato}"
    textColor: "{colors.on-palette}"
    typography: "{typography.display}"
    rounded: "{rounded.sticker-sm}"
    size: "1.55em"
  result-sticker:
    backgroundColor: "{colors.sunflower}"
    textColor: "{colors.on-palette}"
    typography: "{typography.headline}"
    rounded: "{rounded.sticker-lg}"
    padding: "44px 22px 28px"
    width: "min(100%, 360px)"
  result-close:
    backgroundColor: "{colors.sticker-white}"
    textColor: "{colors.on-palette}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 28px"
    height: "52px"
  tape-tab:
    backgroundColor: "{colors.sky}"
    textColor: "{colors.on-palette}"
    typography: "{typography.label-sm}"
    padding: "5px 12px"
  error-note:
    backgroundColor: "{colors.note-yellow}"
    textColor: "{colors.note-ink}"
    typography: "{typography.body}"
    padding: "26px 20px 20px"
    width: "min(100%, 32rem)"
  motion-offer:
    backgroundColor: "{colors.sticker-white}"
    textColor: "{colors.on-palette}"
    typography: "{typography.label-prompt}"
    rounded: "{rounded.pill}"
    padding: "8px 10px 8px 16px"
  motion-offer-yes:
    backgroundColor: "{colors.tomato}"
    textColor: "{colors.on-palette}"
    typography: "{typography.label-prompt-sm}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "40px"
  motion-offer-entry:
    textColor: "{colors.ink-muted}"
    typography: "{typography.label-prompt-sm}"
    padding: "0 16px"
    height: "40px"
---

# Design System: 是但

## Overview

**Creative North Star: "摆着小玩具的手帐"**

整站是她的一本手帐，每个玩法是一件立在本子上的小玩具。浅色是一本蓝格子本：淡蓝纸面、22px 的浅蓝方格。深色是一本黑卡纸本：近黑的纸、白色点阵、白色中性笔写的字。纸面上的东西分两种。一种是贴纸、和纸胶带、便利贴：主题、标题下的荧光笔、换主题的胶带条、中选的结果卡片、名单出错的提示，都是平的、拍在纸上的。另一种是玩具：转盘是一台实心塑料的桌面玩具（参照任天堂的老玩具），弹球机是一台瓦楞纸板折的玩具（参照 Labo），求签筒是一只薯条盒搪胶小摆件，直接立在纸上，有厚度、有材质、有影子。骰子目前还是一枚贴在薄荷垫上的贴纸。

这个世界拒绝这一类小工具的默认长相：粉彩圆角卡片、渐变按钮、白色弹窗加彩带。它也拒绝两种失败：花哨（一个盘面堆满点点带、滴落、反光条这类装饰花纹）和廉价（玩具画成没有厚度的平面剪贴画）。密度很低，一屏只有几样东西，每样都是大块的、能用拇指按的实物。随机性是装饰的一部分：贴纸的歪度、错位、颜色，胶带的颜色，玩具的配色，每次打开都重新发一遍（直接调 `Math.random`，只管装饰，不经过抽签的代码路径），所以每次翻开本子都略有不同。

动效只有两种语法：东西落到纸上用一个「啪」（从上方 1.25 倍大、带一大圈悬空影子落下，压过头一点再回弹），按下去用 60ms 按进、240ms 弹回。玩具各有只属于自己的动作：转盘的拨片被白钉一颗颗拨开再弹回；弹球机拉的时候橡皮筋绷成 V 形，球撞上纸筒时贴纸帽压扁再弹回；薯条盒被甩得歪来歪去，一根签顶出来、飞出盒子立在旁边。唯一不属于这些的是加载态：「正在加载名单…」那行手写字原地左右晃（±2°、上浮 4px，1.4s 一个来回，不回弹）。锁住的控件从不变淡：转盘的轴心按钮一直按在底座里弹不起来，弹球机的拉片缩回机身里拉不出来。

**Key Characteristics:**
- 纸会变，东西不变：明暗主题只换纸和墨水，贴纸、胶带、便利贴和玩具两套都是同一种颜色。
- 贴纸平涂，玩具有体积。
- 六色和纸调色板（番茄、向日葵、薄荷、天空、粉、丁香）是贴纸、玩具、撒花和结果卡片共用的唯一一套颜色。
- 贴纸和玩具上的字永远是深色墨水。
- 站酷快乐体（构建时现裁的子集）是唯一的展示字体，正文留在系统字体。
- 一个签名动作：「啪」。
- 装饰随机、每次重发；抽签逻辑另算。

## Colors

一套高饱和的和纸贴纸色，压在一张安静的格子纸上；纸和墨水随主题翻转，贴纸和玩具不动。

### Primary
- **番茄贴纸** (tomato)：`--accent`。轴心按钮没拿到颜色时的兜底底色，结果卡片在没有中选颜色时的兜底底色，摇手机提示条的「开启」。也是调色板第一色。

### Secondary
- **六色和纸调色板**（`src/palette.ts` 的 `PALETTE`，按顺序：tomato、sunflower、mint、sky、pink、lilac）：选主题页的字母贴纸与主题贴纸、所有胶带、撒花小贴纸、结果卡片，以及每件玩具的配色。每次进页面各自发色：转盘发三色（机身；拨片与轴心按钮；中选格），弹球机发两色（机关；中选格），薯条盒发两色（盒子；签与凸标，避开番茄/粉、天空/丁香、粉/丁香这三对太近的）。选主题页每次打开把调色板洗一遍，相邻两枚不撞色。结果卡片铺满盘面揭晓时交回的颜色（写进 `--win`）。

### Tertiary
- **便利贴黄** (note-yellow)：只用于名单出错时贴上来的那张便利贴，标题用砖红 (note-title)，正文用褐墨 (note-ink)。便利贴是实物，深色主题也还是黄的。
- **荧光笔** (highlighter / highlighter-night)：划在手写标题和选主题页引导语下面的那一道（文字高度 58% 到 92% 之间），也是文字选区的颜色。浅色是向日葵黄，深色换成半透明丁香。

### Neutral
- **蓝格子纸** (graph-paper) 与 **格线** (graph-line)：浅色页面底色与 22px 方格。
- **黑卡纸** (night-paper) 与 **白点阵** (night-dots)：深色页面底色与点阵格。
- **铅笔墨** (ink) / **白色中性笔** (gel-ink)：纸上的字。次要文字用 ink-muted / gel-ink-muted。
- **贴纸墨** (on-palette)：所有压在贴纸、玩具、扇区、落格、签面、白标签上的字，两套主题都一样；也是玩具压暗时叠的那层淡墨。
- **贴纸白** (sticker-white / sticker-white-night)：贴纸的模切白边、转盘机身上的白钉和拨片铆钉、揭晓白标签、「再来一次」按钮。
- **影子** (shadow、shadow-lift，深色各有 -night)：浅色是带蓝的墨色影子，不是纯黑；深色才用黑。
- **褪色层** (scrim，有 -night)：结果卡片挂着时，把其余一切往纸色褪。
- **转盘盘面** (wheel-disk、wheel-disk-alt、wheel-divider，各有 -night)：两种深浅的奶白隔格交替，格缝一道细线。材料本色，平时不上色。深色主题压暗一档，夜里不刺眼。
- **纸板** (carton、carton-field、carton-pocket、carton-shade、carton-cut、carton-line，各有 -night)：弹球机的机身顶面、台面（亮一档）、隔格的纸口袋、凹槽与瓦楞的楞、切边、折痕虚线。偏暖黄，不偏灰褐；压暗只往深一档的纸板色走。深色主题整体压暗一档。
- **黄铜** (brad、brad-rim、brad-shine)：两脚钉，两套主题不换。
- **钢珠** (pinball-ball、pinball-ball-shine)：弹球机的球，两套主题都是深色。
- **游戏垫** (die-mat、die-stitch，各有 -night)：骰子的台面。骰子带模切白边，铺在白台面上看不出白边，所以铺一张薄荷垫，加一圈虚线缝线。
- **焦点** (focus / focus-night)：3px 实线焦点框，外扩 4px；结果卡片和摇手机提示条上的按钮压在贴纸上，改用 on-palette。

### Named Rules
**The Physical Object Rule.** 贴纸、胶带、便利贴和玩具是实物，明暗主题都不换色；换主题只换纸（graph-paper ↔ night-paper）和墨水（ink ↔ gel-ink）。唯一的例外是贴纸白：深色下用 sticker-white-night 而不是纯白，夜里在微信里打开不刺眼；材料本色（奶白盘面、纸板）深色下各压暗一档。

**The Dark Ink Rule.** 贴纸和玩具上的字永远是 on-palette 深墨。调色板每一色对它都在 5:1 以上（最低的是天空色 5.6:1、番茄 5.9:1），所以任何一格、任何一枚贴纸、任何一根签上都不需要判断用浅字还是深字。加新颜色进调色板之前先验这个比。

**The Shared Palette Rule.** 贴纸、胶带、撒花、结果卡片和玩具的配色只从 `PALETTE` 取，不在别处另起颜色。材料本色（转盘的奶白、弹球机的纸板、两脚钉的黄铜、钢珠）是例外，它们不是贴纸色。结果卡片的颜色就是盘面揭晓时交回的那一色。

**The Two-or-Three Colors Rule.** 一件玩具最多用调色板里的两三种颜色，加上它的材料本色。颜色多了玩具就成了花哨的装饰画。

## Typography

**Display Font:** 站酷快乐体子集，以 `Shidan Hand` 注册（回退 PingFang SC、Microsoft YaHei、system-ui）
**Body Font:** 系统字体（system-ui、-apple-system、Segoe UI、PingFang SC、Microsoft YaHei）

**Character:** 圆滚滚、略带稚气的手写体负责一切「写在本子上」的字：标题、贴纸上的字、按钮、揭晓的名字；说明性的正文留给系统字体，读起来不费劲。字体是 OFL 授权，自托管，`src/build/handFont.ts` 在 dev / build 时只裁出站内字符串和名单里真正用到的字（整套 1.5MB，裁完才在微信里加载得起）。

### Hierarchy
- **Display**（400，clamp(4rem, 22.5vw, 5.5rem)，行高 1）：选主题页的「是但」，一字一枚字母贴纸。
- **Headline**（400，随字数缩放，2rem 到 6rem，行高 1.1）：结果卡片上的中选名字。字号由字数（`--len`）定，名字铺满贴纸的宽，两个字的名字最大。
- **Title**（400，1.85rem，行高 1.25）：玩法页的手写主题标题，下面划荧光笔。矮屏缩到 1.3rem。
- **Label XL**（400，跟着转盘大小走，1.5rem 到 2.6rem，按转盘边长的 9%）：轴心按钮上的「转」。
- **Label LG**（400，1.75rem）：选主题页的主题贴纸。
- **Label Note**（400，1.35rem）：便利贴的砖红标题。
- **Label**（400，1.25rem）：结果卡片的「再来一次 / 再打一发 / 再抽一根 / 再掷一次」、加载态。选主题页引导语用 1.3rem。
- **Label Prompt**（400，1.15rem）：摇手机提示条上的「摇手机也能抽」。
- **Label Prompt SM**（400，1.05rem）：提示条上的「开启 / 不用了」，以及常驻的「开启摇手机」入口。
- **Label SM**（400，0.95rem，行高 1.2）：「← 换个主题」胶带条。矮屏 0.85rem。
- **Body**（400，0.95rem，行高 1.55）：便利贴上的错误说明，最长 32rem 一行。
- **Body SM**（400，0.85rem，行高 1.5）：便利贴上的修改提示。
- 画布里的揭晓名字也用手写体：转盘标签字号为盘面边长的 6%（最小 15px）；弹球标签 22px 起往下试到 14px，再放不下才折行；骰子把名字写在朝上那一面上，26px 起往下试到 11px，最多 3 行；求签筒把名字竖写在立住的签面上，28px 起往下试到 14px，再放不下排成两列。

### Named Rules
**The One Hand Rule.** 手写体只有一个字重（400），永远不加粗、不合成粗体；层级靠字号和贴纸大小拉开。正文永远是系统字体，不用手写体排段落。

## Layout

单栏，居中，手机竖屏优先。玩法页最宽 640px，选主题页最宽 520px，左右留 16px（选主题页 24px）并加上安全区内边距。页面元素之间纵向间距 18px（矮屏 12px），选主题页三枚贴纸之间 22px。

页头只有一样东西：靠左的「← 换个主题」胶带条。手写标题不在页头里，它紧贴在盘面上方（间距 6px），跟着盘面走。

盘面是首屏的主角，宽度取容器宽度与「视口高度减去其余部件」换算出的宽度两者中较小者：转盘保持正方形，最小 200px（「转」在轴心上，不另占高度）；弹球机按 400:638，最宽 660px；骰子按 11:14、求签筒按 360:480，最宽都是 540px。玩具直接立在纸上，画布四周自带影子的留白，只扣 20px 页边；骰子的画框左右各让出 21px 给白边和胶带。在高屏上标题、盘面连同操作在页头以下的空间里上下居中。骰子和求签筒下方出现摇手机提示条或入口时，给它让出 58px 高（矮屏 50px）。矮屏（`max-height: 560px`，多半是横过来的手机）压掉标题和留白，把高度让给盘面。

选主题页整块落在视觉中线略偏上（顶部留 40px、底部留 96px）。「是但」两枚字母贴纸靠左偏一点，互相压住 10px；三枚主题贴纸左右交替错开 4 到 14px、交替歪 1.5° 到 4°；字母贴纸歪 5° 到 10°。歪着贴的东西不许撑出横向滚动（`body` 横向溢出隐藏）。

纸面网格是世界本身的材料：浅色 22px 方格线，深色点阵。它是背景，不是排版网格，组件不对齐它。

## Elevation & Depth

深度全靠实物影子。贴纸贴在纸上有一圈柔和的偏移影子，被拿起来（悬停、落下前）影子变大变远，被按进纸里影子收紧。玩具立在纸上，除了落在纸上的影子，自身还有厚度：侧壁、后壁、顶面用叠一层淡墨压暗，迎光的棱上一道细高光。没有描边代替影子，也没有硬边偏移影子。影子颜色随主题：浅色是带蓝的墨色，深色是黑。

### Shadow Vocabulary
- **贴住** (`box-shadow: 0 6px 14px var(--shadow)` 到 `0 8px 18px var(--shadow)`)：贴纸静止时的影子；转盘轴心按钮的底座 6px/14px，主题贴纸 7px/14px，字母贴纸 8px/16px，骰子的画框 8px/18px，便利贴 10px/20px。
- **小贴纸** (`box-shadow: 0 4px 10px var(--shadow)`)：压在别的东西上的白色小贴纸：「再来一次」按钮（按下收到 `0 1px 2px`）、摇手机提示条。
- **拿起** (`box-shadow: 0 10px 20px var(--shadow-lift)` / `0 12px 22px var(--shadow-lift)`)：有悬停的设备上，贴纸被指尖抬起一点。
- **按进纸里** (`box-shadow: 0 1px 2px var(--shadow)`)：按下的那一瞬间。
- **悬空** (`--lift-shadow: 0 40px 56px var(--shadow-lift)`；结果卡片用 `0 56px 80px`)：「啪」落下前悬在纸上的影子，落地时收回到各自贴住时的影子。
- **结果贴纸** (`box-shadow: 0 20px 44px var(--shadow-lift)`)：浮在褪色层之上的大贴纸。
- **画布里**：转盘白边影子模糊为边长的 3.5%、下移 1.4%；白钉、标签、拨片各有更小的一层。弹球机的纸板机身模糊 18、下移 8（盘面像素），揭晓标签贴住时模糊 8、下移 3，悬空时加到 36、23。薯条盒底下两层软影子：一圈宽而淡的投影（shadow），一道紧贴盒底的接触影（shadow-lift）；立住的签底下也有一道。

### Named Rules
**The Paper Depth Rule.** 一枚东西离纸面越高，影子越大越远；贴住时影子小而近，按下时几乎没有。任何新的抬起或落下都沿这条轴走，不另造发光或描边。

**The Flat Sticker, Solid Toy Rule.** 贴纸一律平涂，不打渐变。玩具可以用淡白、淡墨表现明暗和厚度（侧面压暗、迎光提亮、往缝里越来越暗），但只叠淡白和淡墨，不另起颜色，也不叠纯黑。渐变在贴纸世界里只用来画纸的材料（格线、点阵、胶带白点、荧光笔那一道）。

## Shapes

贴纸是大圆角的模切形：一圈实心白边（转盘轴心按钮 5px，骰子 5px，字母贴纸与主题贴纸 6px，结果贴纸 8px），圆角 22 到 28px，越大的贴纸圆角越大。撒花是带 4px 白边的小贴纸：圆点、星星、爱心、圆角方块。

玩具按各自的材料取形，不包贴纸白边（转盘例外，它的机身外照样包一圈模切白边）。塑料玩具是厚实圆润的注塑件：尖角磨圆，侧壁露出厚度。纸板玩具是直角切的纸板，只修 16px 的圆角，露出瓦楞切口。

和纸胶带是这个世界的第二种贴纸形：24px 高的半透明色条（不透明度 0.82），8px 间距的白点花纹，两头用遮罩剪出 6px 的锯齿撕口。胶带总是歪着贴（3° 到 38°），颜色和角度由用它的地方给。

胶囊形（999px）只给小东西：「再来一次」是一枚压在彩色大贴纸上的白色小贴纸；摇手机提示条是一枚白色胶囊贴纸，里面的「开启」是一颗番茄色胶囊。大贴纸从不用胶囊形。便利贴是直角的。

## Components

### Buttons
- **「转」轴心按钮：** 嵌在转盘正中的一颗圆形玩具按钮，直径是转盘边长的 26%。圆帽取拨片的颜色，5px 白边；下面一圈同色叠淡墨的底座露出 `--sink`（max(9px, 3.4cqi)）高，像按钮的厚度。悬停帽子抬起 2px；按下帽子沉进底座，60ms 到位，松手 240ms 弹回（`--press-ease`）。
- **锁住（`aria-disabled="true"`）：** 帽子一直按在底座里弹不起来，像玩具转起来时卡住的按钮；按下没有任何反馈。按钮留在 Tab 序里。不变淡、不变灰。各盘面的锁住按各自的世界来，不求一致。
- **「再来一次 / 再打一发 / 再抽一根 / 再掷一次」：** 每个玩法自己的说法，同一个按钮。白色胶囊小贴纸，52px 高，左右 28px，手写体 1.25rem；按下下沉 2px、缩到 0.96。焦点框改用深墨，压在彩色卡片上看得见。

### Cards / Containers
- **结果贴纸：** 整页先铺一层纸色褪色层（120ms 淡入），70ms 后中选贴纸「啪」地落下（520ms）。底色是盘面揭晓时交回、写进 `--win` 的颜色，8px 白边、28px 圆角、歪 -2.5°，最宽 360px，内边距 44px 22px 28px。顶上一截胶带，颜色每次从调色板里另取一种、不和卡片撞色。名字铺满贴纸的宽。
- **盘面贴纸画框（骰子）：** 白底 5px 内边、23px 圆角、贴住影子，两角各一截歪 ±36° 到 38° 的胶带，薄荷/丁香。

### Navigation
- **「← 换个主题」胶带条：** 一截撕下来的胶带（颜色每次从调色板随机取），上面写手写字，歪 -4°，只占那几个字的宽；可点区域由伪元素撑到 48px 高。矮屏缩成 0.85rem、内边距 2px 10px。悬停时摆正一点、往左挪 2px；按下时朝箭头那边让 6px。

### Signature: 主题贴纸（选主题页）
整块可点的大贴纸，至少 84px 高，6px 白边、24px 圆角、手写体 1.75rem。颜色、歪度、错位、胶带颜色与歪度都是每次打开重发的行内变量；胶带贴在歪向那一侧的对角上。进场是「啪」：字母贴纸每枚间隔 70ms，主题贴纸从 200ms 起每枚间隔 90ms。悬停抬起 4px、歪度减到 0.4 倍；按下按平进纸里。

### Signature: 转盘玩具
一台实心塑料的桌面玩具，参照任天堂的老玩具：少色、厚实、按下去有手感。每次进页面从调色板发三种不撞的颜色：机身一色，拨片和轴心按钮一色，中选格一色。
- **机身：** 一圈实心色环，下面错开一道叠淡墨的侧壁表示厚度。外面包一圈模切白边和贴住的影子。
- **盘面：** 嵌在机身里，边上一圈叠淡墨的凹槽。十二格奶白隔格交替（wheel-disk / wheel-disk-alt），格缝一道细线。平时不上色：候选是匿名的，十二种颜色只会冒充十二种选项。
- **白钉：** 钉在机身上、对着每道格缝，跟着盘面一起转。
- **拨片：** 钉在机身顶上，不跟着转。圆头是转轴，上面一颗白铆钉；尖尾伸进钉圈，白边。每颗钉滑到跟前就把它往左顶开（最多 0.42 弧度），滑过去后拨片 220ms 弹回并往反方向晃一下。落点离格缝至少 0.1 格，所以停下时拨片总是正的。拨片只是表演：停在哪一格开转前就定了（ADR-0003）。
- **揭晓：** 只有停下那一格铺上中选色，名字写在一枚同色、白边、微歪 -0.05 弧度的贴纸标签上，贴在这一格中线的 0.62 半径处。其余格子不褪色。

### Signature: 纸板弹珠台
一台用瓦楞纸板折出来的玩具，参照任天堂 Labo：材料本色、手工感、颜色只来自贴上去的几枚贴纸。直接放在纸上，不贴胶带、不包白边。每次进页面从调色板发两种不撞的颜色：机关色和中选色。
- **机身：** 牛皮纸板，16px 圆角，底边露出 12px 的瓦楞切口（5px 一道楞），四周一圈虚线折痕，整台带贴住的影子。台面压低一层、亮一档，四周一圈凹槽。
- **纸板条：** 墙、隔板和柱塞通道左壁是竖插的纸板条，深色切边，中线一道细点表示瓦楞。
- **两脚钉：** 钉阵每颗都是一颗黄铜两脚钉，深一圈的边、左上一粒高光。风车轴心是大一号的。
- **风车：** 一条纸板条贴一道机关色的圆头贴纸。
- **弹力柱：** 纸筒顶一枚白边贴纸帽（机关色）。球撞上时帽子压扁到 0.84，60ms 压下、240ms 弹回，只是表演。
- **柱塞：** 纸板拨片，一根机关色的橡皮筋两头钉在通道两壁上，往下拉时绷成 V 形，看它就知道力度。拨片中间一根拉杆穿出机身，接到底下一块带指孔的拉片；拉片跟着力度往下走，开抽锁住时缩回机身，只露一道边。
- **落格：** 一排匿名的纸口袋，隔格深浅交替，每格一个虚线圈的贴纸位。平时不上色：八种颜色只会冒充八种选项。
- **揭晓：** 只有中选那一格的贴纸位贴上一枚白边的中选色小贴纸，名字写在一枚同色、4px 白边、12px 圆角、歪 -0.07 弧度的贴纸标签上，「啪」地落在那一格上方（480ms，同 `--slap-ease`）。其余格子不褪色。
- 几何全照 `board.ts`，画的就是碰撞形状；台面以外的机身和拉片只是装饰。

### Signature: 薯条盒签筒
一只立在本子上的薯条盒搪胶小摆件：只有两色，哑光塑料，厚实圆润。直接放在纸上，不贴胶带、不包白边、不铺台面。每次进页面从调色板发两种颜色：盒子一色，签和凸标一色；挨得太近的三对（番茄/粉、天空/丁香、粉/丁香）不配。
- **盒子：** 上口宽、下口窄，前脸上沿往下凹一道弧，弧上一道细高光。后壁和右侧面往右上错开一个厚度、叠淡墨压暗。前脸上亮下暗、左亮右暗。尖角用同色粗描边磨圆，像注塑件。大小让它甩到限位、歪到最大时连同签还在画布里。
- **凸标：** 前脸中下部一个跟签同色的凸起标，带一道小投影和一道迎光细高光。是两道倒过来的拱连成的 W（使用者指定），要换只改 `traceEmblem` 一处。不写字，也不写「签」。
- **签：** 九根一模一样的方条，前排五根、后排四根插在缝里（后排再压暗一点），露出顶面和右侧面看得出厚度。签顶迎光，往盒口越来越暗。平时全是同一色：候选是匿名的（ADR-0010）。
- **甩：** 整只盒子连同签绕盒底正中歪；打头那根签往上顶。
- **揭晓：** 打头那根签从盒口飞出来，划一道弧落到盒子右边，变宽变长，弹一下立住，盒子同时往左让出位置，签底下长出影子。名字竖写在这根签的正面；结果卡片照签的颜色铺色。

### Signature: 贴纸骰子
骰子按贴纸来画：只从 `PALETTE` 取色，平涂，影子是贴住的小偏移影子，贴在一张带胶带的白框薄荷垫上。十二个面取调色板色，背光面只叠一层很淡的贴纸墨（最多 0.16），向光面叠一层贴纸白，每一面都认得出是哪一色。面与面之间是贴纸白缝，整颗骰子沿轮廓一圈白色模切边，抛高时白边跟着变粗。揭晓时其余面往贴纸白褪成浅彩（die-fade），深色主题也一样，名字写在朝上那一面上。

### Signature: 摇手机提示（求签筒、骰子）
只在要先授权的设备（iOS）上出现，挂在盘面下方 14px。第一次是一枚白色胶囊提示条（小贴纸影子）：手写「摇手机也能抽」，后面跟一颗番茄色胶囊「开启」和一颗透明底的「不用了」，按钮都是 40px 高。答过之后提示条收起，换成一行常驻的「开启摇手机」：灰墨手写字加下划线（下移 4px），直接写在纸上，不是贴纸。按下都只下沉 1px、缩到 0.97。提示条上的字遵守 The Dark Ink Rule，用 on-palette。

### Signature: 撒花
结果卡片弹出时撒一把 64 枚带白边的小贴纸，从屏幕中段往上撒，按真实重力落到屏幕底部，弹一下就贴住不动，一直留到收下时一起撕掉（180ms 淡出）。白边取当前主题的贴纸白。不挡点击。

### Signature: 便利贴（名单出错）
黄色便利贴「啪」地落下（480ms），歪 -1.5°，直角，顶上一截随机色胶带。标题用手写体砖红 1.35rem，说明和提示用系统字体。

## Do's and Don'ts

### Do:
- **Do** 让贴纸、胶带、便利贴和玩具在两套主题里保持同一种颜色，只翻转纸（graph-paper / night-paper）和墨水（ink / gel-ink）。
- **Do** 深色主题下的贴纸白用 sticker-white-night（#f6f3ec），不用纯白。
- **Do** 贴纸、玩具、扇区、落格、签面上的字一律用 on-palette 深墨；往调色板里加颜色前先验它对 on-palette 至少 5:1。
- **Do** 把每个玩法做成一件立在纸上的实体玩具：有厚度、有材质、有落在纸上的影子，参照任天堂玩具、Labo、搪胶小摆件。
- **Do** 东西落到纸上一律用「啪」：从上方 36px、1.25 倍大、带 `--lift-shadow` 落下，`--slap-ease` 压过头再回弹，480 到 520ms。
- **Do** 按压用 60ms 按进（ease-out）、240ms 弹回（`--press-ease`），按下时影子收到 `0 1px 2px`。
- **Do** 锁住一个控件时用它自己世界里的办法表达「动不了」（转盘按钮卡在底座里，弹球机拉片缩回机身），并保留它的 Tab 序。
- **Do** 贴纸的歪度、颜色、胶带和玩具的配色每次打开直接用 `Math.random` 重发，不经过抽签注入的随机源（`RandomSource`）。
- **Do** 画布上的颜色和字体从 style.css 的自定义属性读取，跟着主题重读。
- **Do** 保留格子纸背景和「啪」的回弹缓动：前者是这个世界的材料，后者是它的签名动作。审查工具把它们标出来时按有意的例外处理，不要「修掉」。

### Don't:
- **Don't** 把锁住的控件做成变淡、变灰或降低不透明度。
- **Don't** 在「啪」以外的地方用压过头的回弹缓动；按压、悬停、褪色层都不回弹。
- **Don't** 在贴纸表面打渐变；玩具的明暗只叠淡白和淡墨，不另起颜色。
- **Don't** 在盘面上堆装饰花纹（点点带、滴落、反光条、多余的画框和胶带）；一件玩具最多两三种调色板色。
- **Don't** 把玩具画成没有厚度、没有材质的平面剪贴画。
- **Don't** 在贴纸上用浅色字，或按底色切换字色。
- **Don't** 给手写体加粗，或用手写体排正文段落。
- **Don't** 在 `PALETTE` 之外另起贴纸色、玩具色或撒花色。转盘盘面的奶白、弹球机的纸板、两脚钉的黄铜和钢珠是例外：它们是材料本色。
- **Don't** 给调色板色叠纯黑来做明暗，会出暗红、墨绿这种脏色；要压暗只叠很淡的贴纸墨。
- **Don't** 用硬边偏移影子或纯黑影子做浅色主题的深度；浅色影子是带蓝的墨色。
- **Don't** 把装饰随机接进抽签的代码路径，或让任何装饰影响中选。
