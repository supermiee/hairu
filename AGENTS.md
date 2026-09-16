# AGENTS.md

## What this repo is

Static JavaScript rules ("小程序") for the Hiker (海阔视界) Android app, served by GitHub Pages. No build system, no package.json, no CI — only `docs/`, `test/`, `AGENTS.md`.

- `docs/` is the Pages web root (`https://supermiee.github.io/hairu/`, `.nojekyll` present). Pushing to `main` publishes immediately.
- `docs/subscription.json` — the subscription manifest. **Subscription URL:** `https://supermiee.github.io/hairu/subscription.json`
- Layout: `docs/apps/<app>/<app>_core.js` (kernel: HTTP + CF handling + parsing + cache) and `docs/apps/<app>/<app>_pages.js` (UI layer; the only entrypoint the subscription loads).
- Ported apps: `jable`, `missav`, plus `jable_redesign` — **Jable+** and `missav_plus` — **MissAV+**. Both are redesigned UI layers that reuse their original core (`jable_core.js?v=5`, `missav_core.js?v=5`) so cache/verification state is shared with the original. Original Jable/MissAV stay untouched for comparison; **all improvements target the `+` versions only**.
- New site: `supjav` — **SupJav** (`docs/apps/supjav/supjav_core.js` + `supjav_pages.js`), a single-module app (no original/`+` split) in the v10 UI style, Simplified strings.
- Tests: `node test/jable.test.js`, `node test/missav.test.js`, `node test/jable_redesign.test.js`, `node test/missav_plus.test.js`, `node test/supjav.test.js` (one file per app). Shared-core additions are covered by both the original app's test (backward compatibility) and the `+` test.
- Shared-core policy: `missav_core.js` was `?v=4` when only the original used it; MissAV+ consumes it at `?v=5` and the original keeps its `?v=4` literals untouched. So the original may serve a stale cached core to existing installs (no regression) while MissAV+ always gets the new one. Additions must stay backward compatible (`parseDetail` accepts both `(html, url)` and a `{html, url}` page object).

## Critical: version bump

Clients cache modules by URL. Any code change requires bumping, together:

1. `<app>` entry `version` in `docs/subscription.json`
2. `MODULE_VERSION` at the top of `docs/apps/<app>/<app>_pages.js`
3. Every hardcoded `?v=N` literal (inside `$().rule()`/`lazyRule()` callback strings that `require`s the module/core)

Each app's `node test/<app>.test.js` enforces 1–3. Never `requirejs` a module without `?v=`.

## Runtime environment (Hiker embedded JS engine)

- Code is kept **ES5** (`var`, no arrow/template/let) by deliberate conservative choice; the demo samples do use ES6, but stay ES5 here.
- The engine is **Mozilla Rhino 1.7.13** run in ES6 mode (`JSEngine.java` does `rhino.setLanguageVersion(200)` = `Context.VERSION_ES6`; see `developer-reference/hikerView/app/build.gradle:211`). Rhino's ES6 is **partial**: arrow functions, `let`/`const`, destructuring, generators, `Symbol`, `Map`/`Set` work — **template literals (backticks), `Promise`, and `Proxy` do not**. So ES5 is not a hard requirement, but anything beyond that subset fails at runtime. Verify new syntax on-device (a `try/catch` probe rule) rather than trusting this clone, which may differ from the shipped APK.
- File shape: IIFE, export at bottom via `module.exports = exported;` and `$.exports = exported;`.
- Rule callbacks (`$().rule` / `.lazyRule`) run in an **isolated scope**: outer closures are invisible. Re-load the module inside the callback with the full HTTPS URL + `?v=`, and pass data through the params argument (`$('hiker://empty').rule(fn, params)` → `fn(params)`).
- `requirejs` is **not always exposed** in rule callbacks. Always use `try { requirejs(url) } catch { $.require(url) }` with the **same remote URL** — never fall back to a local `hiker://files/rules/...` path (it usually doesn't exist and blanks the page). Wrap render bodies in try/catch and show the error via `renderError()` so failures aren't silent.
- In-app globals (absent in Node): `$` (+`$.require`/`$.toString`/`$.exports`), `storage0`, `getMyVar`/`putMyVar`, `getVar`/`putVar`, `fetchPC`, `fetchCodeByWebView`, `pdfa`/`pdfh`, `MY_URL`/`MY_PAGE`, `setResult`/`setHomeResult`, `setPageTitle`/`setPagePicUrl`, `refreshPage`, `back`, `getParam`.
- UI strings are Chinese (mostly Traditional for Jable, matching the site).

## Pagination (both apps)

- Hiker **appends** the next page's result to the existing list (infinite scroll), it does not replace. So `renderList` must emit non-card items (title/heading, sort chips) **only on page 1** (`MY_PAGE <= 1`) or they repeat.
- Time-ordered feeds (`/new`, `/release`) shift between page requests, so a card can reappear at the next page boundary. `dedupeAcrossPages()` keeps a per-route seen-URL set in rule vars (reset on page 1) and filters repeats. Scope key is the route title.
- The app itself still drops a next page whose whole serialized result equals the previous page (`ArticleListFragment.java:2071` firstPageData/lastPageData check) — so only per-card repeats need the seen-URL set, whole-page repeats are already swallowed natively.

## Useful APIs (verified vs help_js.md + JSEngine.java, 2026-09)

- **局部刷新**：`updateItem(id, {title, extra:{id}})` updates one card in place via `extra.id` (id must be globally unique across pages; we use `'fav:'+url`). Siblings: `deleteItem` / `deleteItemByCls` / `addItemAfter` / `addItemBefore` / `findItem` / `findItemsByCls` (help_js.md:864-922; JSEngine.java:1167). Jable+ and MissAV+ favorite toggles use this with a `refreshPage(false)` fallback (`typeof updateItem` guard).
- **caveat**: pages containing both an `input` and `flex_button`/`scroll_button` must not use dynamic refresh on the flex/scroll items — it global-refreshes and blurs the input (help_js.md:924-926). Detail pages are safe (no input).
- **confirm** 二次弹窗：`confirm({title, content, confirm: $.toString(fn), cancel: $.toString(fn)})` — the callback strings are isolated like rule callbacks; require the core inside them. Jable+「清除緩存與本地數據」uses it.
- **showLoading/hideLoading**: NOT yet installed — it belongs in the shared `jable_core.js` webview branch, which would also touch original Jable; only ship it alongside a Jable+ iteration after deciding the shared-core policy (help_js.md:485-491).
- **Page tags**: settings-family routes append `#noRecordHistory##noRefresh#` (no history record, no pull-refresh) — pattern in `jable_redesign_pages.js pageRoute`. `#autoCache#` caches only page 1 for instant reopen — only for low-frequency read-only pages.
- `fetchCodeByWebView` already runs with `checkJs` (extract only when a marker selector exists) in both cores.
- **Do not exist** (verified docs+source+two community repos): `updateAll`, `refreshx://`, `lazyConvert`, `setKey` (JS API). Real names: `refreshX5WebView(url)`, `setItem/getItem/clearItem`.
- Full JS API surface = the 133 public methods of `JSEngine.java`; consult it before assuming an API is missing.

## Jable notes (hard-earned)

- **Search pagination is path-based only**: `/search/<encoded keyword>/<page>/`. `?q=`/`?page=` work for page 1 but ignore page numbers. Build search URLs via `searchUrl`/`searchPagedSource` in `jable_pages.js`; the subscription's `search_url` is `https://jable.tv/search/**/fypage/`.
- Other listings paginate as `/xxx/<page>/` (`/hot/2/`, `/models/2/`, `/categories/<slug>/2/`), so `pagedSource()` uses the `fypage` token.
- Card parse: `pdfa('body&&.video-img-box')` + `pdfh('h6&&Text')`, image from `data-src`, duration from `span.label&&Text`.
- Detail: `og:title`/`og:image` only; the `meta description` is the site's generic slogan, so `detailDescription()` filters it to `''`. Playable m3u8 is the first `m3u8|mp4` in the HTML (CDN needs no special headers).
- Jable sits behind Cloudflare: core has `isHardBlock` short-circuit + `fetchCodeByWebView` fallback + `jable.webviewMode` flag set by「验证并同步」. `isUsableHtml` lets a page-specific `marker` win over generic CF keywords.
- Playback item is a JSON payload `{urls,names,headers}`; set `extra.id = detail.url` so progress is remembered.

## MissAV notes (hard-earned)

- New Alpine.js frontend on `missav.ws`; all paths are locale-prefixed (`/cn/...`). The `dmNN` segment some links carry (`/dm539/cn/new`) is server-assigned and rotates — request the plain path (`/cn/new`) and let the server redirect.
- **List/search pagination is a query param**, not a path: `?page=N`. `pagedSource()` uses `page=fypage` + `[firstPage=<url>]`. Search URL is `/cn/search/<encoded keyword>`.
- Card parse: `.thumbnail` blocks; title in `div.truncate > a`; cover `fourhoi.com/<id>/cover-t.jpg`; detail hrefs carry a `#fragment` that must be stripped (`url.split('#')[0]`). Card duration is split across `<span x-text>` nodes — `cardDuration()` reassembles it.
- Detail: metadata uses `<span>番号:</span> … </div>` rows, parsed by `field`/`fieldLinks` (`番号/发行日期/女优/类型/系列/发行商/导演/标籤`); `og:title`/`og:image`/`og:video:*` also present.
- Playback: the m3u8 lives inside a Dean-Edwards packed `<script>` (`eval(function(p,a,c,k,e,d)`) — `unpackPacker` + `parseQualities`. Decoded URLs are `\/`-escaped and often end with a stray trailing `\`, so `parseQualities` normalizes slashes and strips trailing backslashes (a leftover `\` makes the player fail silently). Multiple qualities become multiple player lines. Surrit m3u8 needs no special headers.
- Metadata links carry a rotating `/dmNN/` segment — `stripDm()` removes it so saved/derived URLs stay stable.
- Cloudflare challenges aggressively on non-home paths; keep the `fetchCodeByWebView` + `missav.webviewMode` verification flow. Source list has a few mirrors (`missav.ws`, `missav.ai`, `missav123.com`). Note: a burst of back-to-back `fetch()`es gets challenged even after a single page succeeds, so sequential (not parallel) section fetches are the safer default.
- **Home sections (verified 2026-09)**: `新作上市` / `最近更新` / `无码影片` / `随机` are static server-rendered `.thumbnail` cards each with a `更多` link (`/cn/release`, `/cn/new`, `/cn/uncensored-leak`). The `推荐给你` and tag blocks (`中出`, `接吻`, `姊姊`) are Alpine `x-for` templates with `:data-src` bindings — **not** in the static HTML, so never use them as parse targets. Stable (non-`/dmNN/`) section URLs: `/cn/new`, `/cn/release`, `/cn/uncensored-leak`, `/cn/today-hot`, `/cn/weekly-hot`, `/cn/monthly-hot`, `/cn/chinese-subtitle`.
- **Card duration markup changed**: the site now emits one plain span `<span class="absolute bottom-1 right-1 …">\n  2:52:41\n</span>` instead of the old `<span x-text="h">` triple. `cardDuration()` matches `>\s*(\d{1,2}:\d{2}:\d{2})\s*<` (whitespace included) and keeps the `x-text` form as a fallback; both are covered by tests.
- **女优目录行**: name, `N 条影片` and `N 出道` now live inside a *single* `<a>` (previously name/count were separate anchors). `parseDirectory()` still merges separate count anchors and additionally reads an inline count from the label.
- **Detail metadata rows**: `<div class="text-secondary"><span>番号:</span> <span class="font-medium">VALUE</span> </div>` (value inline, sometimes a `<time>`; `标籤` may use a `/cn/tags/…` href). `og:description` is frequently empty now, so `parseDescription()` falls back to the `.line-clamp-2` block.
- **Playback**: the m3u8 lives in a Dean-Edwards packer whose payload is itself base-N encoded (`eval(function(p,a,c,k,e,d){…}('e=\'8://7.6/5-4-3-2-1/d.0\';…',15,15,'m3u8|…'.split('|'),0,{}))`). The regex-based `unpackPacker()` + `parseQualities()` decode it; a real fragment is stored at `test/fixtures/missav_packed_script.html` so the test does not drift from reality. `directUrls` in the page points at tsyndicate API URLs (not m3u8) — don't use it for playback.
- **详情页相似推荐只在前端**（已验证 3 个详情页）：右侧/底部 watch-next 列表由 Alpine + Recombee（`recommendItemsToItem`，scenario `internal-desktop-watch-next*`）异步拉取，静态 HTML 里只有 2 个 `<template x-for>` 占位壳（`:href`/`:data-src`/`item.*` 表达式，无真实 href/标题）。`parseCards()` 的 `/\/cn\//` 过滤会把它们滤掉，故 `detail.recommendations` 恒为空、详情页「猜你喜欢」区块不会渲染（按用户决定保留不动，等站点改为服务端渲染再接）。要自己造相似推荐时，可用的服务端渲染数据源是 `/cn/actresses/<slug>`、`/cn/genres/<slug>`、`/cn/tags/<slug>` 列表页。

## MissAV+ notes

- `docs/apps/missav_plus/missav_plus_pages.js` (see its `MODULE_VERSION`) + shared `missav_core.js?v=5`. UI mirrors Jable+ v10: 7 top tabs (首页/最近更新/新作上市/热门/女优/类型/我的), 玫红 `#E91E63` selection, home sections with `pic_1` first card + `movie_2` two-column, `text_1` clickable section titles with `更多 ›`, detail hero `pic_1_full` → meta chips → play → favorite/原网页 → 演员/类型/系列/发行商/导演/标签 chips → 猜你喜欢. Strings are Simplified (site is Simplified).
- Core additions made for it (backward compatible, both apps' tests cover them): `getList(url, marker, limit)`, `parseTotal`, `listValue`/`setValue`, `addSearch`, `clearLocal`, and a `parseDetail` that accepts a `{html, url}` page object. `getList` treats `limit <= 0` as "all" (the raw `parseCards` slices at 0).
- State keys are prefixed `msp.` (original MissAV uses `missav.ui.`), so both can be installed side by side.
- Preview: `node tools/preview_missav.js` → `docs/dev/preview_missav.html` (home/hot/actress/mine tabs + detail).

## SupJav notes

- `docs/apps/supjav/supjav_pages.js` (see its `MODULE_VERSION`) + `supjav_core.js?v=1` (same folder). 7 top tabs: 首页/热门/有码/无码/女优/分类/我的, 玫红 `#E91E63` selection, v10 home (first card `pic_1`, rest `movie_2`, `text_1` clickable section titles with `更多 ›`), detail hero `pic_1_full` → meta chips → accent play → favorite/原网页 → 类别/制作商/女优 chips → 猜你喜欢. Strings Simplified (site locale `/zh` is Simplified).
- **Use the `/zh` locale** (`https://supjav.com/zh/...`): qTranslate serves Chinese titles, category names (有码/无码/素人/中文字幕/无码破解), cast and tags. Card hrefs on `/zh` already carry the `/zh/` prefix.
- **Cards**: `<div class="post"><a class="img" href><img data-original|src></a><div class="con"><h3><a>TITLE</a></h3><div class="meta">DATE<span class="date">N Views</span></div></div></div>`. Grid cards use a base64 `src` placeholder + `data-original` (lazy); the home slider uses a direct `src`. `parseCards()` matches `<div class="post">…<div class="meta">…</div>` (no duration field — show date/views instead).
- **Home is server-rendered in sections** `<div class="archive-title">` (h1 title + optional h1 `(count)` + `a.more`) followed by `.posts`. `parseHomeSections()` splits on `archive-title` so each chunk holds exactly one section; section 1 is the *Week's Popular* swiper (~18 slides).
- **Pagination is path-based** (`/page/N`), unlike MissAV's query param: category `/category/x/page/2`, popular `/popular/page/2?sort=week`, cast `/cast/page/2`, maker `/maker/page/2`, tag `/tag/page/2`. **Search differs**: `/zh/page/2?s=kw` (page before the query). `pagedSource()` moves any `?query` after `/page/fypage`, which covers both. Search URL is `https://supjav.com/zh/?s=**`.
- **Directory pages** (女优 `cast`, 制作商 `maker`, 类别 `tag`) render `<a href="...">名称 (123)</a>`; `parseCast`/`parseMaker`/`parseTags` share `parseDirectory()` and read the count from the parenthesis.
- **Playback needs a two-step chain**: the detail page exposes `.btn-server[data-link]` (TV/FST/ST/VOE). Reverse the token string and GET `https://lk1.supremejav.com/supjav.php?c=<reversed>` **with a `Referer: https://lk1.supremejav.com/`** (any Referer works; without one the server returns an empty 404 body). It 302-redirects to a third-party player page (`turbovidhls.com`) whose `<div id="video_player" data-hash="…m3u8">` holds the m3u8. `resolveMedia()` tries up to 3 servers in order until one yields an m3u8; the TV server almost always works. The m3u8 CDN needs no special headers. The intermediate `supjav.php?l=<token>` page refuses to run when not framed (it prints `404` if `top===self`), so request `?c=<reversed>` directly.
- **Cloudflare**: `supjav.com` is managed-challenged (curl always 403 `Just a moment`, even with a browser UA). Same `isHardBlock` + `fetchCodeByWebView` fallback + `supjav.webviewMode` +「验证并同步」flow as MissAV. `img.supjav.com`, the `lk1.supremejav.com` proxy and the m3u8 CDN are **not** challenged, so cover images and playback work without verification.
- State keys are prefixed `sj.`. Preview: `node tools/preview_supjav.js` → `docs/dev/preview_supjav.html`.

## Verifying changes

```
node test/jable.test.js        # plus missav.test.js, jable_redesign.test.js, missav_plus.test.js, supjav.test.js
node tools/preview_supjav.js   # visual preview → docs/dev/preview_supjav.html
```

Dependency-free smoke tests: stub Hiker globals, run real code paths (home/list/detail/search/version consistency), one file per app. Run the ones you touched; run all five before a release. Extend the pattern for each new app. Real-page fixtures live in `test/fixtures/` (the MissAV packer script plus `supjav_home/list/detail/cast/tag/player.html`) — prefer storing a genuine fragment over hand-writing markup when the site's minified output matters.

Reference material (read-only clones, never commit here): Hiker API docs at `~/code/developer-reference/Documents/docs/hikerview` (`help_api.md`, `help_js.md`, `help_rules.md`, `help_film_list_rules.md`), community sample rules at `~/code/developer-examples/hikerViewRules` (plaintext ES6 — adapt, don't copy verbatim), and the Android app source at `~/code/developer-reference/hikerView`. After pushing, refresh `docs/subscription.json` in the Hiker app and exercise home → list → detail → playback on-device.
