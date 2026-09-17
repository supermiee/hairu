# hairu

海阔视界（Hiker）小程序规则订阅。纯静态 JS，无构建、无后端，由 GitHub Pages 直接发布。

支持站点：**Jable** · **MissAV** · **SupJav** · **AV01**

## 订阅

```
https://supermiee.github.io/hairu/subscription.json
```

在海阔视界中打开「我的」→「订阅」→ 右上角「+」→ 粘贴上方地址 → 保存后刷新订阅即可看到 4 个站点。

## 支持站点

| 站点 | 入口模块 |
| --- | --- |
| Jable | `docs/apps/jable_redesign/jable_redesign_pages.js` |
| MissAV | `docs/apps/missav_plus/missav_plus_pages.js` |
| SupJav | `docs/apps/supjav_plus/supjav_plus_pages.js` |
| AV01 | `docs/apps/av01/av01_pages.js` |

目录名保留历史的 `_redesign` / `_plus` 后缀，即模块 URL，**不要改名**；订阅里的站点名不带 `+`。

## 特性

- 7 个顶部 tab：首页 / 热门 / 分类 / 目录 / 我的等，v10 统一样式（玫红 `#E91E63` 选中态）。
- 详情页完整海报 + 元信息 chips + 强调色播放按钮 + 收藏/原网页 + 演员标签 chips + 猜你喜欢。
- 本地收藏 / 历史 / 搜索 / 设置 / 验证四件套；收藏切换原位刷新。
- 页面加载优化：详情页播放地址懒解析、WebView 抓取屏蔽静态资源、播放中转复用最终 URL。
- Cloudflare 兜底：硬拦短路 + `fetchCodeByWebView`（与内嵌验证页同源 Cookie）+「验证并同步」。
- 失败卡片带 重试 / 验证入口 / 原网页，不静默空白。

## 仓库结构

```
docs/                      GitHub Pages 发布根目录
  index.html               落地页（订阅地址 / 站点 / 预览）
  subscription.json        订阅清单（统一基线版本号）
  apps/<app>/              <app>_core.js（HTTP/解析/缓存/播放）+ <app>_pages.js（UI）
  dev/preview_<app>.html   各站点界面预览（由 tools/ 生成）
test/                      无依赖冒烟测试（stub 海阔全局 API，跑真实代码路径）
  fixtures/                真实页面/接口片段
tools/                     预览生成脚本
AGENTS.md                  开发约定与站点踩坑记录
```

## 开发

测试无任何第三方依赖，直接 `node` 运行：

```
node test/jable_redesign.test.js
node test/missav_plus.test.js
node test/supjav_plus.test.js
node test/av01.test.js
```

生成界面预览（输出到 `docs/dev/preview_<app>.html`）：

```
node tools/preview_jable.js
node tools/preview_missav.js
node tools/preview_supjav.js
node tools/preview_av01.js
```

## 版本

四个站点共用**同一个基线版本号**（当前 **20**），一次发布需同步修改订阅 `version`、各 `MODULE_VERSION`、所有 `?v=` 与内核 `CONFIG.version`。详见 `AGENTS.md`。

首个正式版：[`v1.0.0`](https://github.com/supermiee/hairu/releases/tag/v1.0.0)

## 免责声明

本项目仅提供客户端规则示例，不存储、不转发任何内容；所有数据均来自各站点公开页面，版权归原站点所有。请遵守当地法律法规与目标站点的使用条款。
