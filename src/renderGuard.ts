/**
 * 「只认最新那次」的守卫。
 *
 * 进转盘页要先去取名单，名单在路上时地址栏可能已经变了。晚回来的那份 CSV 属于
 * 上一个主题，绝不能再往页面上贴——否则人明明点进了「今天玩什么」，页面上却
 * 冷不丁换成「今天吃什么」那一份。
 *
 * 用序号而不是「取消请求」：一次 `fetch` 取消不掉也不该取消（它可能已经在路上，
 * 取消与否都不影响谁该上屏），真正要判的只有一件事——我回来的时候，我还是最新的
 * 那一次吗。
 */
export interface RenderGuard {
  /**
   * 开始一次渲染，领一张号。
   *
   * 返回的是一句问话：异步的结果回来时问它「我还是最新的那次吗」，
   * 期间又开始过新的渲染就答 `false`。
   */
  begin(): () => boolean;
}

export function createRenderGuard(): RenderGuard {
  let latest = 0;
  return {
    begin() {
      latest += 1;
      const token = latest;
      return () => token === latest;
    },
  };
}
