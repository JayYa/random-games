/**
 * 站内导航 (Navigation) module 的 interface，目录外只从这里 import（ADR-0014）。
 *
 * 地址只对站内导航有意义（ADR-0005、ADR-0007）：认地址、写带玩法的地址、历史上记的
 * 「上一页是不是选主题页」都留在里面；各屏 HTML 写链接只用得着首页地址和主题地址。
 */

export { createNavigation, type NavigationPage, type PickerLinkClick } from './navigation.ts';
export { THEME_PICKER_HASH, themeHash } from './address.ts';
