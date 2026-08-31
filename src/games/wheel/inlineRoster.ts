/**
 * 曳光弹阶段的名单：内联在代码里的 CSV 字符串常量。
 *
 * 真实的名单是 `public/restaurants.csv`，由渲染层在运行时 fetch（ADR-0001）。
 * 这里的常量只是占位，等那条路径接上后即可移除。
 */
export const INLINE_ROSTER_CSV = `# 名单 (Roster)：两列 name,enabled
# enabled 写 false / 0 / no 表示停用，其余一切取值（含留空）都算启用
# 名字里有逗号时用双引号包起来，例如 "老王烧烤, 二店"
沙县小吃,true
兰州拉面,true
黄焖鸡米饭,true
"老王烧烤, 二店",true
麻辣香锅,
过桥米线,true
潮汕牛肉火锅,true
日料定食,true
永远吃不腻的煎饼摊,true

# 长期停业，先留着
巷口大排档,false
`;
