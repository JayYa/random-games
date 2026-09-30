/**
 * 运行时取回名单文件的原文。取数留在会话之外，「取不到文件」和「读不懂」才是两类错误（ADR-0001）。
 *
 * @param rosterFile `public/` 下的文件名，例如 `eat.csv`。失败时抛错。
 */
export async function fetchRosterCsv(rosterFile: string): Promise<string> {
  const url = `${import.meta.env.BASE_URL}${rosterFile}`;
  // 名单随时会被人改，别让缓存挡住刚推上去的改动。
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text();
}
