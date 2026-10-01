export interface Theme {
  /** 地址里的那一段，也是名单文件的主名：`#/eat` ↔ `eat.csv`（见 `rosterFileName`）。 */
  readonly slug: string;
  /** 玩法页标题，也用作 `document.title`。 */
  readonly title: string;
  /** 选主题页上的入口文案。 */
  readonly entryLabel: string;
}
