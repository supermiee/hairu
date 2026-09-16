# hairu

海阔视界（Hiker）小程序规则仓库（重构版）。

- 规则主体位于 `docs/`，由 GitHub Pages 直接发布。
- 订阅清单：`docs/subscription.json`
- 订阅地址：https://supermiee.github.io/hairu/subscription.json

## 应用

| 应用 | 状态 | 入口 |
| --- | --- | --- |
| Jable | 原版 | `docs/apps/jable/jable_pages.js` |
| Jable+ | 重构 UI（复用 jable core） | `docs/apps/jable_redesign/jable_redesign_pages.js` |
| MissAV | 原版 | `docs/apps/missav/missav_pages.js` |
| MissAV+ | 重构 UI（复用 missav core） | `docs/apps/missav_plus/missav_plus_pages.js` |
| Hanime1 | 待迁移 | — |

## 开发

```
node test/jable.test.js
node test/missav.test.js
node test/jable_redesign.test.js
node test/missav_plus.test.js
node tools/preview_missav.js   # 生成 docs/dev/preview_missav.html
```

细节见 `AGENTS.md`。

> 本仓库处于重构初期，内容会持续调整。
