/**
 * 把文本放进 innerHTML 模板前的转义。名单和主题文案都是人写的自由文本，
 * 里面出现 `<` 或引号时不能被当成标记。
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
