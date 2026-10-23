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

THESIS: The site is her 手帐 (sticker journal). Themes are die-cut stickers slapped onto the page, the boards are taped in (the wheel instead sits on the page as a solid toy), the winner arrives as a fresh sticker smacked down in the winning cell's colour. Refuses the category default: pastel rounded cards, gradient buttons, a white modal with confetti.

OWN-WORLD: Light = blue graph-paper notebook (#eef3fb, grid in pale blue); dark = black-paper notebook with white gel-pen ink. Stickers are objects and do not change with the page: saturated-bright washi palette (tomato, sunflower, mint, sky, pink, lilac), white kiss-cut border, soft offset shadow. Translucent washi tape with zigzag torn ends holds things down. ZCOOL KuaiLe, subset at build time, is the only display voice; body stays the system face.

STORY: She opens it, sees three stickers she can tap, taps one, presses the 转 button in the hub of the toy wheel or pulls the plunger, and the answer gets slapped onto the page in one colour-flooded sticker. She smiles and takes it.

FIRST VIEWPORT: Picker: "是但" as a giant tilted sticker-word top-left of centre (~5.5rem), a handwritten lead with a highlighter band, then three theme stickers of varied colour, tilt and offset, each pinned by a tape strip; tilt, colours and tape are re-dealt on every visit. Game page: a tape-tab "← 换个主题" and the handwritten theme title; the board is the hero at full width; on the wheel the primary action is the 转 cap button in its hub, not a separate control under it.

FORM: 手帐贴纸本 (sticker journal), position 6 on the ordered list, seed key 202c587b. Raises: winner name sized to fill the sticker width (type specimen); the winning colour floods the result sticker (racing livery); locked = shown in each board's own terms, never faded (akari; the wheel's cap stays pressed down in its base); confetti = mini stickers that fall with real gravity and stay stuck until dismissed (gravity rain); at reveal everything but the winner fades to paper (collider; the wheel instead keeps its cream sectors and colours only the winner). Signature interaction: the "啪" slap, a sticker dropping from above scale 1.25 with a big shadow to rest with a slight overshoot; used for picker entrance and the result sticker.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Unresolved: none.

Revision (2026-10-23): the wheel became a solid desktop toy (Nintendo-era toy reference) inside the journal: palette body with a side wall and die-cut white border, cream sectors that stay uncoloured until reveal, white pegs and a fixed flapper, and a hub cap button for 转. Body, flapper/cap and winning cell are dealt three distinct palette colours per visit. See DESIGN.md "Signature: 转盘玩具".

Revision (2026-10-23): the pinball became a corrugated-cardboard toy (Nintendo Labo reference) sitting on the journal page, no tape and no white frame: kraft cabinet with an exposed fluted edge and a dashed fold line, brass split-pin pegs, cardboard-strip walls and windmills, paper-tube bumpers with a sticker cap that squashes on hit, a rubber-band plunger that stretches into a V with a finger-hole pull tab below the cabinet (tucked in while locked), and eight anonymous paper pockets. Two palette colours are dealt per visit: mechanism (caps, windmill strips, band) and winner (the pocket sticker and the name label slapped above it). Drawing lives in src/games/pinball/pinballCanvas.ts. See DESIGN.md "Signature: 纸板弹珠台".
