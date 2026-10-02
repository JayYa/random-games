---
version: 1
slug: "src-style-css"
primary_target: "src/style.css"
related_targets: ["src/browser/browserPage.ts","src/browser/resultCard.ts","src/games/wheel/wheelCanvas.ts","src/games/pinball/ui.ts"]
---

# 是但：全站（选主题页、玩法页、结果卡片）

Scope: every surface of the site. Visitor mode: Experience (she is inside the toy; the board leads).
Audience/job: one person, phone, often inside WeChat, often at night, undecided and not wanting to think. Tap a theme, play once, get a name, leave.
Constraints: PRODUCT.md (anonymous board until reveal, 0.8s reveal pause, light + dark both complete, WeChat browser). Board mechanics, copy and routes unchanged.

## Direction contract

THESIS: The site is her 手帐 (sticker journal). Themes are die-cut stickers slapped onto the page, the board is taped in, the winner arrives as a fresh sticker smacked down in the winning cell's colour. Refuses the category default: pastel rounded cards, gradient buttons, a white modal with confetti.

OWN-WORLD: Light = blue graph-paper notebook (#eef3fb, grid in pale blue); dark = black-paper notebook with white gel-pen ink. Stickers are objects and do not change with the page: saturated-bright washi palette (tomato, sunflower, mint, sky, pink, lilac), white kiss-cut border, soft offset shadow. Translucent washi tape with zigzag torn ends holds things down. ZCOOL KuaiLe, subset at build time, is the only display voice; body stays the system face.

STORY: She opens it, sees three stickers she can tap, taps one, presses the big 转 sticker or pulls the plunger, and the answer gets slapped onto the page in one colour-flooded sticker. She smiles and takes it.

FIRST VIEWPORT: Picker: "是但" as a giant tilted sticker-word top-left of centre (~5.5rem), a handwritten lead with a highlighter band, then three theme stickers of varied colour, tilt and offset, each pinned by a tape strip; tilt, colours and tape are re-dealt on every visit. Game page: a tape-tab "← 换个主题" and the handwritten theme title; the board is the hero at full width; the 转 sticker is the primary action under it.

FORM: 手帐贴纸本 (sticker journal), position 6 on the ordered list, seed key 202c587b. Raises: winner name sized to fill the sticker width (type specimen); the winning colour floods the result sticker (racing livery); locked = taped shut, not faded (akari); confetti = mini stickers that fall with real gravity and stay stuck until dismissed (gravity rain); at reveal everything but the winner fades to paper (collider). Signature interaction: the "啪" slap, a sticker dropping from above scale 1.25 with a big shadow to rest with a slight overshoot; used for picker entrance and the result sticker.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Unresolved: none.
