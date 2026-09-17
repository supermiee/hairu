# hairu

海阔视界（Hiker）小程序规则仓库（重构版）。

- 规则主体位于 `docs/`，由 GitHub Pages 直接发布。
- 订阅清单：`docs/subscription.json`
- 订阅地址：https://supermiee.github.io/hairu/subscription.json

## 应用

| 应用 | 入口 |
| --- | --- |
| Jable | `docs/apps/jable_redesign/jable_redesign_pages.js` |
| MissAV | `docs/apps/missav_plus/missav_plus_pages.js` |
| SupJav | `docs/apps/supjav_plus/supjav_plus_pages.js` |
| AV01 | `docs/apps/av01/av01_pages.js` |

每个应用都是自包含的单模块（`<app>_core.js` + `<app>_pages.js` 同目录）。
目录名保留历史 `_redesign`/`_plus` 后缀（即模块 URL，勿改），站点名不带 `+`。
历史原版 Jable / MissAV / SupJav（及其共享 core 方案）已于 2026-09 移除；
SupJav+ 的页面加载优化版已替换原版 SupJav。

## 开发

```
node test/jable_redesign.test.js
node test/missav_plus.test.js
node test/supjav_plus.test.js
node test/av01.test.js
node tools/preview_jable.js     # 生成 docs/dev/preview_jable.html
node tools/preview_missav.js    # 生成 docs/dev/preview_missav.html
node tools/preview_supjav.js    # 生成 docs/dev/preview_supjav.html
node tools/preview_av01.js      # 生成 docs/dev/preview_av01.html
```

细节见 `AGENTS.md`。

> 本仓库处于重构初期，内容会持续调整。
