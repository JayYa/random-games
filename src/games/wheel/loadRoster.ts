/**
 * 渲染层的取数：在运行时 fetch 名单文件 (`public/restaurants.csv`)。
 *
 * 网络请求刻意留在会话模块之外（ADR-0001）：会话只吃 CSV 原文，
 * 于是「加载失败」和「解析失败」是两类不同的错误，前者由这里产生。
 *
 * 文件放在 `public/` 下，Vite 会原样拷进 `dist/`，不打进 bundle——
 * 因此改名单只需改这个文本文件并刷新页面，不必重新构建代码。
 */

/**
 * 名单文件的地址。用 `BASE_URL` 拼接，站点部署在子路径下时同样取得到。
 */
export const ROSTER_CSV_URL = `${import.meta.env.BASE_URL}restaurants.csv`;

/**
 * 取回名单原文。失败时抛错，由调用方决定怎么呈现。
 */
export async function fetchRosterCsv(url: string = ROSTER_CSV_URL): Promise<string> {
  // 名单是随时会被人改的文本文件，别让浏览器缓存挡住刚推上去的改动。
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text();
}
