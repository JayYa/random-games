---
name: 是但
description: 一本手帐贴纸本：主题是拍在格子纸上的模切贴纸，盘面用胶带贴进本子，中选是一枚啪地拍下来的大贴纸。
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
  board-field: "#ffffff"
  board-wall: "#d9e2f3"
  board-wall-edge: "#b4c3e0"
  board-metal: "#6c7699"
  board-fade: "rgba(255, 255, 255, 0.68)"
  wheel-fade: "rgba(238, 243, 251, 0.66)"
  night-paper: "#17171c"
  night-dots: "rgba(255, 255, 255, 0.13)"
  gel-ink: "#f3f0e8"
  gel-ink-muted: "#aaa5bb"
  highlighter-night: "rgba(178, 148, 255, 0.45)"
  focus-night: "#b294ff"
  scrim-night: "rgba(23, 23, 28, 0.82)"
  shadow-night: "rgba(0, 0, 0, 0.5)"
  shadow-lift-night: "rgba(0, 0, 0, 0.6)"
  board-field-night: "#23232b"
  board-wall-night: "#31313d"
  board-wall-edge-night: "#4a4a5c"
  board-metal-night: "#a3a0b4"
  board-fade-night: "rgba(35, 35, 43, 0.8)"
  wheel-fade-night: "rgba(23, 23, 28, 0.8)"
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
  label:
    fontFamily: "'Shidan Hand', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif"
    fontSize: "1.25rem"
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
  label: "10px"
  board: "18px"
  sticker-sm: "22px"
  frame: "23px"
  sticker: "24px"
  sticker-lg: "28px"
  pill: "999px"
spacing:
  header-gap: "8px"
  page-gutter: "16px"
  page-stack: "18px"
  sticker-stack: "22px"
  grid-cell: "22px"
  overlay-gutter: "24px"
components:
  spin-sticker:
    backgroundColor: "{colors.tomato}"
    textColor: "{colors.on-palette}"
    typography: "{typography.label-xl}"
    rounded: "{rounded.sticker-sm}"
    padding: "0 32px"
    height: "76px"
    width: "min(100%, 300px)"
  spin-sticker-locked:
    backgroundColor: "{colors.tomato}"
    textColor: "{colors.on-palette}"
    rounded: "{rounded.sticker-sm}"
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
---

# Design System: 是但

## Overview

**Creative North Star: "手帐贴纸本"**

整站是她的一本手帐。浅色是一本蓝格子本：淡蓝纸面、22px 的浅蓝方格。深色是一本黑卡纸本：近黑的纸、白色点阵、白色中性笔写的字。纸上的东西都是实物：模切贴纸带一圈白边和柔和的偏移影子，半透明的和纸胶带两头是锯齿撕口，名单出错时贴上来一张黄色便利贴。主题是三枚歪着贴的贴纸，盘面是用胶带贴进本子里的一张贴纸，中选是一枚铺满中选颜色、从上方「啪」地拍下来的大贴纸。

这个世界拒绝这一类小工具的默认长相：粉彩圆角卡片、渐变按钮、白色弹窗加彩带。它的密度很低，一屏只有几样东西，每样都是大块的、歪一点的、能用拇指按的实物。随机性是装饰的一部分：贴纸的歪度、错位、颜色和胶带每次打开都重新发一遍（直接调 `Math.random`，只管装饰，不经过抽签的代码路径），所以每次翻开本子都略有不同。

动效只有两种语法：东西落到纸上用一个「啪」（从上方 1.25 倍大、带一大圈悬空影子落下，压过头一点再回弹），按下去用 60ms 按进、240ms 弹回。锁住的控件被一条胶带横着封上，从不变淡。

**Key Characteristics:**
- 纸会变，贴纸不变：明暗主题只换纸和墨水，贴纸、胶带、便利贴两套都是同一种颜色。
- 六色和纸调色板（番茄、向日葵、薄荷、天空、粉、丁香），扇区、落格、贴纸、胶带、撒花、结果卡片共用一套。
- 贴纸上的字永远是深色墨水。
- 站酷快乐体（构建时现裁的子集）是唯一的展示字体，正文留在系统字体。
- 一个签名动作：「啪」。
- 装饰随机、每次重发；抽签逻辑另算。

## Colors

一套高饱和的和纸贴纸色，压在一张安静的格子纸上；纸和墨水随主题翻转，贴纸不动。

### Primary
- **番茄贴纸** (tomato)：`--accent`。「转」这枚大贴纸的底色，弹球机风车的转轴钉，结果卡片在没有中选颜色时的兜底底色。也是调色板第一色。

### Secondary
- **六色和纸调色板**（`src/palette.ts` 的 `PALETTE`，按顺序：tomato、sunflower、mint、sky、pink、lilac）：转盘扇区（相邻不撞色，首尾也不撞）、弹球落格与弹力柱、选主题页的字母贴纸与主题贴纸、所有胶带、撒花小贴纸，以及结果卡片（铺满盘面写进 `--win` 的中选格颜色）。选主题页每次打开把调色板洗一遍再发色，相邻两枚不撞色；胶带取另一种颜色。

### Tertiary
- **便利贴黄** (note-yellow)：只用于名单出错时贴上来的那张便利贴，标题用砖红 (note-title)，正文用褐墨 (note-ink)。便利贴是实物，深色主题也还是黄的。
- **荧光笔** (highlighter / highlighter-night)：划在手写标题和选主题页引导语下面的那一道（文字高度 58% 到 92% 之间），也是文字选区的颜色。浅色是向日葵黄，深色换成半透明丁香。

### Neutral
- **蓝格子纸** (graph-paper) 与 **格线** (graph-line)：浅色页面底色与 22px 方格。
- **黑卡纸** (night-paper) 与 **白点阵** (night-dots)：深色页面底色与点阵格。
- **铅笔墨** (ink) / **白色中性笔** (gel-ink)：纸上的字。次要文字用 ink-muted / gel-ink-muted。
- **贴纸墨** (on-palette)：所有压在贴纸、扇区、落格、白标签上的字，两套主题都一样。
- **贴纸白** (sticker-white / sticker-white-night)：贴纸的模切白边、转盘的白缝与轴心垫圈、揭晓白标签、「再来一次」按钮。
- **影子** (shadow、shadow-lift，深色各有 -night)：浅色是带蓝的墨色影子，不是纯黑；深色才用黑。
- **褪色层** (scrim、wheel-fade、board-fade，各有 -night)：揭晓和结果卡片挂着时，把其余一切往纸色褪。
- **盘面** (board-field、board-wall、board-wall-edge、board-metal，各有 -night)：弹球机的台面、墙、描边、柱塞金属。钉子、风车叶片和球用 ink / gel-ink。
- **焦点** (focus / focus-night)：3px 实线焦点框，外扩 4px；结果卡片上的按钮改用 on-palette。

### Named Rules
**The Physical Sticker Rule.** 贴纸、胶带、便利贴是实物，明暗主题都不换色；换主题只换纸（graph-paper ↔ night-paper）和墨水（ink ↔ gel-ink）。唯一的例外是贴纸白：深色下用 sticker-white-night 而不是纯白，夜里在微信里打开不刺眼。

**The Dark Ink Rule.** 贴纸上的字永远是 on-palette 深墨。调色板每一色对它都在 5:1 以上（最低的是天空色 5.6:1、番茄 5.9:1），所以任何一格、任何一枚贴纸上都不需要判断用浅字还是深字。加新颜色进调色板之前先验这个比。

**The Shared Palette Rule.** 扇区、落格、贴纸、胶带、撒花和结果卡片只从 `PALETTE` 取色，不在别处另起贴纸色。结果卡片的颜色就是盘面上停下那一格的颜色。

## Typography

**Display Font:** 站酷快乐体子集，以 `Shidan Hand` 注册（回退 PingFang SC、Microsoft YaHei、system-ui）
**Body Font:** 系统字体（system-ui、-apple-system、Segoe UI、PingFang SC、Microsoft YaHei）

**Character:** 圆滚滚、略带稚气的手写体负责一切「写在本子上」的字：标题、贴纸上的字、按钮、揭晓的名字；说明性的正文留给系统字体，读起来不费劲。字体是 OFL 授权，自托管，`src/build/handFont.ts` 在 dev / build 时只裁出站内字符串和名单里真正用到的字（整套 1.5MB，裁完才在微信里加载得起）。

### Hierarchy
- **Display**（400，clamp(4rem, 22.5vw, 5.5rem)，行高 1）：选主题页的「是但」，一字一枚字母贴纸。
- **Headline**（400，随字数缩放，2rem 到 6rem，行高 1.1）：结果卡片上的中选名字。字号由字数（`--len`）定，名字铺满贴纸的宽，两个字的名字最大。
- **Title**（400，1.85rem，行高 1.25）：玩法页的手写主题标题，下面划荧光笔。矮屏缩到 1.3rem。
- **Label XL**（400，2.2rem，字距 0.2em）：「转」这一个字。矮屏 1.7rem。
- **Label LG**（400，1.75rem）：选主题页的主题贴纸。
- **Label**（400，1.25rem）：结果卡片的「再来一次 / 再打一发」、加载态。选主题页引导语用 1.3rem。
- **Label SM**（400，0.95rem，行高 1.2）：「← 换个主题」胶带条。
- **Body**（400，0.95rem，行高 1.55）：便利贴上的错误说明，最长 32rem 一行。
- **Body SM**（400，0.85rem，行高 1.5）：便利贴上的修改提示。
- 画布里的揭晓标签也用手写体：转盘标签字号为盘面边长的 6%（最小 15px）；弹球标签 20px 起往下试到 13px，再放不下才折行。

### Named Rules
**The One Hand Rule.** 手写体只有一个字重（400），永远不加粗、不合成粗体；层级靠字号和贴纸大小拉开。正文永远是系统字体，不用手写体排段落。

## Layout

单栏，居中，手机竖屏优先。玩法页最宽 640px，选主题页最宽 520px，左右留 16px（选主题页 24px）并加上安全区内边距。页面元素之间纵向间距 18px（矮屏 12px），选主题页三枚贴纸之间 22px。

页头是三列网格（`1fr auto 1fr`）：胶带条入口靠左，手写标题在正中，左右两列等宽，标题才相对整行居中。

盘面是首屏的主角：转盘边长取容器宽度与「视口高度减去其余部件」两者中较小者（保持正方形，最小 200px）；弹球机按 360:540 的比例取宽度，最宽 630px。在高屏上盘面连同操作在页头以下的空间里上下居中。矮屏（`max-height: 560px`，多半是横过来的手机）压掉标题和留白，把高度让给盘面。

选主题页整块落在视觉中线略偏上（顶部留 40px、底部留 96px）。「是但」两枚字母贴纸靠左偏一点，互相压住 10px；三枚主题贴纸左右交替错开 4 到 14px、交替歪 1.5° 到 4°；字母贴纸歪 5° 到 10°。歪着贴的东西不许撑出横向滚动（`body` 横向溢出隐藏）。

纸面网格是世界本身的材料：浅色 22px 方格线，深色点阵。它是背景，不是排版网格，组件不对齐它。

## Elevation & Depth

深度全靠实物影子：贴纸贴在纸上有一圈柔和的偏移影子，被拿起来（悬停、落下前）影子变大变远，被按进纸里影子收紧。没有色调分层，没有描边代替影子，也没有硬边偏移影子。影子颜色随主题：浅色是带蓝的墨色，深色是黑。

### Shadow Vocabulary
- **贴住** (`box-shadow: 0 6px 14px var(--shadow)` 到 `0 8px 18px var(--shadow)`)：贴纸静止时的影子；「转」6px/14px，主题贴纸 7px/14px，字母贴纸 8px/16px，弹球盘面贴纸 8px/18px，便利贴 10px/20px。
- **拿起** (`box-shadow: 0 10px 20px var(--shadow-lift)` / `0 12px 22px var(--shadow-lift)`)：有悬停的设备上，贴纸被指尖抬起一点。
- **按进纸里** (`box-shadow: 0 1px 2px var(--shadow)`)：按下的那一瞬间。
- **封住** (`box-shadow: 0 2px 4px var(--shadow)`)：被胶带封住的「转」，贴得更平。
- **悬空** (`--lift-shadow: 0 40px 56px var(--shadow-lift)`；结果卡片用 `0 56px 80px`)：「啪」落下前悬在纸上的影子，落地时收回到各自贴住时的影子。
- **结果贴纸** (`box-shadow: 0 20px 44px var(--shadow-lift)`)：浮在褪色层之上的大贴纸。
- **画布里**：转盘白边影子模糊为边长的 3.5%、下移 1.4%；轴心、标签、指针各有更小的一层。弹球揭晓标签模糊 8px、下移 3px。

### Named Rules
**The Paper Depth Rule.** 一枚东西离纸面越高，影子越大越远；贴住时影子小而近，按下时几乎没有。任何新的抬起或落下都沿这条轴走，不另造发光或描边。

## Shapes

贴纸是大圆角的模切形：一圈实心白边（「转」5px，字母贴纸与主题贴纸 6px，结果贴纸 8px），圆角 22 到 28px，越大的贴纸圆角越大。转盘是一整枚圆贴纸，扇区之间留白缝，轴心是白垫圈上一颗平涂的黄铜钉帽（不打渐变）。指针是一枚白边的墨色三角贴纸。弹球机是一张 5px 白边的贴纸，四角圆 23px，里面盘面 18px，上面两个角各一截胶带。撒花是带 4px 白边的小贴纸：圆点、星星、爱心、圆角方块。

和纸胶带是这个世界的第二种形：24px 高的半透明色条（不透明度 0.82），8px 间距的白点花纹，两头用遮罩剪出 6px 的锯齿撕口。胶带总是歪着贴（3° 到 38°），颜色和角度由用它的地方给。

「再来一次」是唯一的胶囊形（999px）：它是一枚白色小贴纸，压在彩色大贴纸上。便利贴是直角的。

## Components

### Buttons
- **「转」大贴纸：** 番茄底、深墨字、5px 白边、22px 圆角，最宽 300px、至少 76px 高，静止时歪 -1.5°。悬停时摆正并抬起 3px；按下时沿原来的歪度往纸里按 3px、缩到 0.97，60ms 到位，松手 240ms 弹回（`--press-ease`）。
- **锁住（`aria-disabled="true"`）：** 一条天空色胶带以 -9° 横着拍上来（不透明度 0 → 0.88，260ms `--slap-ease`），影子收平；按下没有任何反馈。按钮留在 Tab 序里。不变淡、不变灰。
- **「再来一次 / 再打一发」：** 白色胶囊小贴纸，52px 高，左右 28px，手写体 1.25rem；按下下沉 2px、缩到 0.96。焦点框改用深墨，压在彩色卡片上看得见。

### Cards / Containers
- **结果贴纸：** 整页先铺一层纸色褪色层（120ms 淡入），70ms 后中选贴纸「啪」地落下（520ms）。底色是盘面写进 `--win` 的中选格颜色，8px 白边、28px 圆角、歪 -2.5°，最宽 360px，内边距 44px 22px 28px。顶上一截胶带，颜色每次从调色板里另取一种、不和卡片撞色。名字铺满贴纸的宽。
- **弹球盘面贴纸：** 白底 5px 内边、23px 圆角、贴住影子，两角各一截歪 ±36° 到 38° 的胶带（粉、向日葵）。

### Navigation
- **「← 换个主题」胶带条：** 一截撕下来的胶带（颜色每次从调色板随机取），上面写手写字，歪 -4°，只占那几个字的宽；可点区域由伪元素撑到 48px 高。悬停时摆正一点、往左挪 2px；按下时朝箭头那边让 6px。

### Signature: 主题贴纸（选主题页）
整块可点的大贴纸，至少 84px 高，6px 白边、24px 圆角、手写体 1.75rem。颜色、歪度、错位、胶带颜色与歪度都是每次打开重发的行内变量；胶带贴在歪向那一侧的对角上。进场是「啪」：字母贴纸每枚间隔 70ms，主题贴纸从 200ms 起每枚间隔 90ms。悬停抬起 4px、歪度减到 0.4 倍；按下按平进纸里。

### Signature: 揭晓（盘面画布）
揭晓时其余扇区或落格盖一层往纸色褪的色（wheel-fade / board-fade），只留中选那一格。转盘把名字写在一枚白标签上，贴在停下那一格中线的 0.6 半径处，微歪 -0.05 弧度；弹球机把名字写在落格上方一枚带尖角的白标签气泡里，中选落格描一圈 3px 深墨框。盘面颜色是在画布上画的，从 style.css 的变量读取，主题切换后重读。

### Signature: 撒花
结果卡片弹出时撒一把 64 枚带白边的小贴纸，从屏幕中段往上撒，按真实重力落到屏幕底部，弹一下就贴住不动，一直留到收下时一起撕掉（180ms 淡出）。白边取当前主题的贴纸白。不挡点击。

### Signature: 便利贴（名单出错）
黄色便利贴「啪」地落下（480ms），歪 -1.5°，直角，顶上一截随机色胶带。标题用手写体砖红 1.35rem，说明和提示用系统字体。

## Do's and Don'ts

### Do:
- **Do** 让贴纸、胶带、便利贴在两套主题里保持同一种颜色，只翻转纸（graph-paper / night-paper）和墨水（ink / gel-ink）。
- **Do** 深色主题下的贴纸白用 sticker-white-night（#f6f3ec），不用纯白。
- **Do** 贴纸、扇区、落格上的字一律用 on-palette 深墨；往调色板里加颜色前先验它对 on-palette 至少 5:1。
- **Do** 东西落到纸上一律用「啪」：从上方 36px、1.25 倍大、带 `--lift-shadow` 落下，`--slap-ease` 压过头再回弹，480 到 520ms。
- **Do** 按压用 60ms 按进（ease-out）、240ms 弹回（`--press-ease`），按下时影子收到 `0 1px 2px`。
- **Do** 锁住一个控件时用一条胶带把它封住，并保留它的 Tab 序。
- **Do** 贴纸的歪度、颜色、胶带每次打开直接用 `Math.random` 重发，不经过抽签注入的随机源（`RandomSource`）。
- **Do** 画布上的颜色和字体从 style.css 的自定义属性读取，跟着主题重读。
- **Do** 保留格子纸背景和「啪」的回弹缓动：前者是这个世界的材料，后者是它的签名动作。审查工具把它们标出来时按有意的例外处理，不要「修掉」。

### Don't:
- **Don't** 把锁住的控件做成变淡、变灰或降低不透明度。
- **Don't** 在「啪」以外的地方用压过头的回弹缓动；按压、悬停、褪色层都不回弹。
- **Don't** 在贴纸表面打渐变；渐变只用来画纸的材料（格线、点阵、胶带白点、荧光笔那一道）。
- **Don't** 在贴纸上用浅色字，或按底色切换字色。
- **Don't** 给手写体加粗，或用手写体排正文段落。
- **Don't** 在 `PALETTE` 之外另起贴纸色、扇区色或撒花色。
- **Don't** 用硬边偏移影子或纯黑影子做浅色主题的深度；浅色影子是带蓝的墨色。
- **Don't** 把装饰随机接进抽签的代码路径，或让任何装饰影响中选。
