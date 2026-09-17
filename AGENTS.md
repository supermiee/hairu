# AGENTS.md

## What this repo is

Static JavaScript rules ("小程序") for the Hiker (海阔视界) Android app, served by GitHub Pages. No build system, no package.json, no CI — only `docs/`, `test/`, `tools/`, `AGENTS.md`, `README.md`.

- `docs/` is the Pages web root (`https://supermiee.github.io/hairu/`, `.nojekyll` present). Pushing to `main` publishes immediately.
- `docs/subscription.json` — the subscription manifest. **Subscription URL:** `https://supermiee.github.io/hairu/subscription.json`
- Layout: `docs/apps/<app>/<app>_core.js` (kernel: HTTP + CF handling + parsing + cache) and `docs/apps/<app>/<app>_pages.js` (UI layer; the only entrypoint the subscription loads).
- Apps (4 total, each a self-contained single module — `<app>_core.js` + `<app>_pages.js` in its own folder, all in the v10 UI style): `jable_redesign` — **Jable**, `missav_plus` — **MissAV**, `supjav` — **SupJav**, `av01` — **AV01**. The folder names keep the historical `_redesign`/`_plus` suffixes; the subscription site names have no `+`. The original `jable`/`missav` apps (and the shared-core arrangement where the redesigned UIs reused them) were removed 2026-09 — there is no original/`+` split and no backward-compatibility burden any more.
- **AV01 is a React SPA**: its HTML is a ~4 KB empty shell, so its core parses a REST JSON API (`/api/v1/...`) instead of HTML. See "AV01 notes".
- Tests (one file per app): `node test/jable_redesign.test.js`, `node test/missav_plus.test.js`, `node test/supjav.test.js`, `node test/av01.test.js`.
- Versioning is repo-wide and unified: one baseline number for all 4 apps, used by the subscription `version`, every `MODULE_VERSION`, every `?v=` (pages + core) and every core `CONFIG.version`. Bump all four together (see "Critical: version bump").

## Critical: version bump (unified baseline)

Clients cache modules by URL, and all four apps share **one unified baseline version** (currently **16**), so a release keeps them lock-stepped:

1. `version` of **all four** entries in `docs/subscription.json`
2. `MODULE_VERSION` at the top of **each** `docs/apps/<app>/<app>_pages.js`
3. Every hardcoded `?v=N` literal — both the pages URL and the core URL, in every `$().rule()`/`lazyRule()` callback string and in `CORE_URL`
4. `CONFIG.version` in **each** `<app>_core.js` (displayed in the settings page, so it must match the baseline too)

Bump **all four apps together** to the new number even if only one app's code changed; that is what "unified" means here and it keeps the invariant checkable. `node test/<app>.test.js` enforces it per app and `test/missav_plus.test.js` has a repo-wide guard (all four subscription versions + `MODULE_VERSION` + `?v=` literals equal).

Baseline number rule: **never reset to a number that was ever published** (a client may still have that URL's old content cached — e.g. `av01_core.js?v=1` predates `buildMaster()`); always move forward. Never `requirejs` a module without `?v=`.

## Runtime environment (Hiker embedded JS engine)

- Code is kept **ES5** (`var`, no arrow/template/let) by deliberate conservative choice; the demo samples do use ES6, but stay ES5 here.
- The engine is **Mozilla Rhino 1.7.13** run in ES6 mode (`JSEngine.java:350` does `rhino.setLanguageVersion(200)` = `Context.VERSION_ES6`; Rhino 1.7.13 itself is declared at `developer-reference/hikerView/app/build.gradle:211`). Rhino's ES6 is **partial**: arrow functions, `let`/`const`, destructuring, generators, `Symbol`, `Map`/`Set` work — **template literals (backticks), `Promise`, and `Proxy` do not**. So ES5 is not a hard requirement, but anything beyond that subset fails at runtime. Verify new syntax on-device (a `try/catch` probe rule) rather than trusting this clone, which may differ from the shipped APK.
- File shape: IIFE, export at bottom via `module.exports = exported;` and `$.exports = exported;`.
- Rule callbacks (`$().rule` / `.lazyRule`) run in an **isolated scope**: outer closures are invisible. Re-load the module inside the callback with the full HTTPS URL + `?v=`, and pass data through the params argument (`$('hiker://empty').rule(fn, params)` → `fn(params)`).
- `requirejs` is **not always exposed** in rule callbacks. Always use `try { requirejs(url) } catch { $.require(url) }` with the **same remote URL** — never fall back to a local `hiker://files/rules/...` path (it usually doesn't exist and blanks the page). Wrap render bodies in try/catch and show the error via `renderError()` so failures aren't silent.
- In-app globals (absent in Node): `$` (+`$.require`/`$.toString`/`$.exports`), `storage0`, `getMyVar`/`putMyVar`, `getVar`/`putVar`, `fetchPC`, `fetchCodeByWebView`, `pdfa`/`pdfh`, `MY_URL`/`MY_PAGE`, `setResult`/`setHomeResult`, `setPageTitle`/`setPagePicUrl`, `refreshPage`, `back`, `getParam`.
- UI strings are Chinese (mostly Traditional for Jable, matching the site).

## Pagination (all apps)

- Hiker **appends** the next page's result to the existing list (infinite scroll), it does not replace. So `renderList` must emit non-card items (title/heading, sort chips) **only on page 1** (`MY_PAGE <= 1`) or they repeat.
- Time-ordered feeds (`/new`, `/release`) shift between page requests, so a card can reappear at the next page boundary. `dedupeAcrossPages()` keeps a per-route seen-URL set in rule vars (reset on page 1) and filters repeats. Scope key is the route title.
- The app itself still drops a next page whose whole serialized result equals the previous page (`ArticleListFragment.java:2071` firstPageData/lastPageData check) — so only per-card repeats need the seen-URL set, whole-page repeats are already swallowed natively.

## Useful APIs (verified vs help_js.md + JSEngine.java, 2026-09)

- **局部刷新**：`updateItem(id, {title, extra:{id}})` updates one card in place via `extra.id` (id must be globally unique across pages; we use `'fav:'+url`). Siblings: `deleteItem` / `deleteItemByCls` / `addItemAfter` / `addItemBefore` / `findItem` / `findItemsByCls` (help_js.md:864-922; JSEngine.java:1167). All four apps' favorite toggles use this with a `refreshPage(false)` fallback (`typeof updateItem` guard).
- **caveat**: pages containing both an `input` and `flex_button`/`scroll_button` must not use dynamic refresh on the flex/scroll items — it global-refreshes and blurs the input (help_js.md:924-926). Detail pages are safe (no input).
- **confirm** 二次弹窗：`confirm({title, content, confirm: $.toString(fn), cancel: $.toString(fn)})` — the callback strings are isolated like rule callbacks; require the core inside them. Jable「清除緩存與本地數據」uses it.
- **showLoading/hideLoading**: NOT installed yet; if added, it belongs in the per-app core's webview branch (e.g. `jable_redesign_core.js`) (help_js.md:485-491).
- **Page tags**: settings-family routes append `#noRecordHistory##noRefresh#` (no history record, no pull-refresh) — pattern in `jable_redesign_pages.js pageRoute`. `#autoCache#` caches only page 1 for instant reopen — only for low-frequency read-only pages.
- `fetchCodeByWebView` already runs with `checkJs` (extract only when a marker selector exists) in all four cores.
- **Do not exist** (verified docs+source+two community repos): `updateAll`, `refreshx://`, `lazyConvert`, `setKey` (JS API). Real names: `refreshX5WebView(url)`, `setItem/getItem/clearItem`.
- Full JS API surface = the **127** public methods of `JSEngine.java` (re-counted 2026-09); consult it before assuming an API is missing. Note the cookie helper's real name is `fetchCookie(url, options)`.

## Jable notes (hard-earned)

- **Search pagination is path-based only**: `/search/<encoded keyword>/<page>/`. `?q=`/`?page=` work for page 1 but ignore page numbers. Build search URLs via `searchUrl`/`searchPagedSource` in `jable_redesign_pages.js`; the subscription's `search_url` is `https://jable.tv/search/**/fypage/`.
- Other listings paginate as `/xxx/<page>/` (`/hot/2/`, `/models/2/`, `/categories/<slug>/2/`), so `pagedSource()` uses the `fypage` token.
- Card parse: `pdfa('body&&.video-img-box')` + `pdfh('h6&&Text')`, image from `data-src`, duration from `span.label&&Text`.
- Detail: `og:title`/`og:image` only; the `meta description` is the site's generic slogan, so `detailDescription()` filters it to `''`. Playable m3u8 is the first `m3u8|mp4` in the HTML (CDN needs no special headers).
- Jable sits behind Cloudflare: core has `isHardBlock` short-circuit + `fetchCodeByWebView` fallback + `jable.webviewMode` flag set by「验证并同步」. `isUsableHtml` lets a page-specific `marker` win over generic CF keywords.
- Playback item is a JSON payload `{urls,names,headers}`; set `extra.id = detail.url` so progress is remembered.

## MissAV site notes (hard-earned)

- New Alpine.js frontend on `missav.ws`; all paths are locale-prefixed (`/cn/...`). The `dmNN` segment some links carry (`/dm539/cn/new`) is server-assigned and rotates — request the plain path (`/cn/new`) and let the server redirect.
- **List/search pagination is a query param**, not a path: `?page=N`. `pagedSource()` uses `page=fypage` + `[firstPage=<url>]`. Search URL is `/cn/search/<encoded keyword>`.
- Card parse: `.thumbnail` blocks; title in `div.truncate > a`; cover `fourhoi.com/<id>/cover-t.jpg`; detail hrefs carry a `#fragment` that must be stripped (`url.split('#')[0]`). Card duration markup changed (see the dedicated bullet further down) — `cardDuration()` handles both the current plain span and the legacy `<span x-text>` triple.
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

## MissAV app notes

- `docs/apps/missav_plus/missav_plus_pages.js` (see its `MODULE_VERSION`) + `missav_plus_core.js` (same folder, same unified `?v=` as the pages). UI mirrors Jable v10: 7 top tabs (首页/最近更新/新作上市/热门/女优/类型/我的), 玫红 `#E91E63` selection, home sections with `pic_1` first card + `movie_2` two-column, `text_1` clickable section titles with `更多 ›`, detail hero `pic_1_full` → meta chips → play → favorite/原网页 → 演员/类型/系列/发行商/导演/标签 chips → 猜你喜欢. Strings are Simplified (site is Simplified).
- Core shape: `getList(url, marker, limit)`, `parseTotal`, `listValue`/`setValue`, `addSearch`, `clearLocal`, and a `parseDetail` that accepts both `(html, url)` and a `{html, url}` page object. `getList` treats `limit <= 0` as "all" (the raw `parseCards` slices at 0).
- State keys are prefixed `msp.`; favorites/history/search live in the same core.
- Preview: `node tools/preview_missav.js` → `docs/dev/preview_missav.html` (home/hot/actress/mine tabs + detail).

## SupJav notes

- `docs/apps/supjav/supjav_pages.js` (see its `MODULE_VERSION`) + `supjav_core.js` (same folder, same unified `?v=` as the pages). 7 top tabs: 首页/热门/有码/无码/女优/分类/我的, 玫红 `#E91E63` selection, v10 home (first card `pic_1`, rest `movie_2`, `text_1` clickable section titles with `更多 ›`), detail hero `pic_1_full` → meta chips → accent play → favorite/原网页 → 类别/制作商/女优 chips → 猜你喜欢. Strings Simplified (site locale `/zh` is Simplified).
- **Use the `/zh` locale** (`https://supjav.com/zh/...`): qTranslate serves Chinese titles, category names (有码/无码/素人/中文字幕/无码破解), cast and tags. Card hrefs on `/zh` already carry the `/zh/` prefix.
- **Cards**: `<div class="post"><a class="img" href><img data-original|src></a><div class="con"><h3><a>TITLE</a></h3><div class="meta">DATE<span class="date">N Views</span></div></div></div>`. Grid cards use a base64 `src` placeholder + `data-original` (lazy); the home slider uses a direct `src`. `parseCards()` matches `<div class="post">…<div class="meta">…</div>` (no duration field — show date/views instead).
- **Home is server-rendered in sections** `<div class="archive-title">` (h1 title + optional h1 `(count)` + `a.more`) followed by `.posts`. `parseHomeSections()` splits on `archive-title` so each chunk holds exactly one section; section 1 is the *Week's Popular* swiper (~18 slides).
- **Pagination is path-based** (`/page/N`), unlike MissAV's query param: category `/category/x/page/2`, popular `/popular/page/2?sort=week`, cast `/cast/page/2`, maker `/maker/page/2`, tag `/tag/page/2`. **Search differs**: `/zh/page/2?s=kw` (page before the query). `pagedSource()` moves any `?query` after `/page/fypage`, which covers both. Search URL is `https://supjav.com/zh/?s=**`.
- **Directory pages** (女优 `cast`, 制作商 `maker`, 类别 `tag`) render `<a href="...">名称 (123)</a>`; `parseCast`/`parseMaker`/`parseTags` share `parseDirectory()` and read the count from the parenthesis.
- **Playback has 4 server lines** (`.btn-server[data-link]`: TV/FST/ST/VOE). Reverse the token and GET `https://lk1.supremejav.com/supjav.php?c=<reversed>` **with a `Referer: https://lk1.supremejav.com/`** (any Referer works; without one the server returns an empty body). It 302-redirects to a third-party player page. **Only TV (turbovidhls.com) exposes a directly playable m3u8** in `<div id="video_player" data-hash="…m3u8">`; FST (fc2stream.tv) embeds the URL in a Dean-Edwards packed script (`links.hls2/hls3`) but its CDN 404s, and ST (streamtape) / VOE (voe.sx→johnfullwonder) load their own JS players needing a click. So:
  - `resolveMedia()` scans lines in order for a direct m3u8 (TV wins) and powers the primary「▶ 立即播放」.
  - `resolveServer(server)` resolves one line: `{media}` on success, else `{pageUrl}` from the 302 `Location` (`redirectUrl()` uses `fetchPC(..., {redirect:false, withHeaders:true})`).
  - The detail page renders a「🔀 切换线路」chip row; each chip is a `lazyRule` that resolves only that line on tap — direct media → play payload, otherwise return `video://<pageUrl>#isVideo=true#` so Hiker's sniffer tries the third-party page.
  - FST's m3u8 CDN 404s even on the site itself for some videos, so treat FST/ST/VOE as best-effort.
- The intermediate `supjav.php?l=<token>` page refuses to run when not framed (it prints `404` if `top===self`), so request `?c=<reversed>` directly.
- **Cloudflare**: `supjav.com` is managed-challenged (curl always 403 `Just a moment`, even with a browser UA). Same `isHardBlock` + `fetchCodeByWebView` fallback + `supjav.webviewMode` +「验证并同步」flow as MissAV. `img.supjav.com`, the `lk1.supremejav.com` proxy and the m3u8 CDN are **not** challenged, so cover images and playback work without verification.
- State keys are prefixed `sj.`. Preview: `node tools/preview_supjav.js` → `docs/dev/preview_supjav.html`.

## AV01 notes

- `docs/apps/av01/av01_pages.js` (see its `MODULE_VERSION`) + `av01_core.js` (same folder; bumped together with the page since this is a single-module app). 7 top tabs: 首页/最近更新/热门/女优/片商/分类/我的, 玫红 `#E91E63` selection, v10 home (first card `pic_1`, rest `movie_2`, `text_1` clickable section titles with `更多 ›`), detail hero `pic_1_full` → meta chips → accent play → favorite/原网页 → 女优/片商/标签 chips → 猜你喜欢. Strings Simplified (site `/cn` is Simplified).
- **SPA — never parse HTML.** `https://www.av01.media/cn` returns a ~4 KB React shell; all content comes from `https://www.av01.media/api/v1/...` (verified 2026-09). Endpoints used:
  - `videos/types/combined?hottest_page=&hottest_limit=&latest_page=&latest_limit=&hottest_makers_page=&hottest_makers_limit=` → `{hottest_videos, latest_videos, hottest_makers:[{maker, videos, pagination}]}` (one request powers the whole home tab).
  - `videos/types/{latest,hottest}?page=&limit=` → `{videos, pagination}`.
  - `videos/search?lang=cn` is **POST** `{query, pagination:{page,limit}}` → `{videos, pagination}` (GET returns 400).
  - `videos/{id}` (detail), `videos/{id}/similars?page=&limit=`, `videos/{actress|maker|tag}/{id}?page=&limit=`, `actresses|makers|tags/by-score?page=&limit=` (the `/cn/actresses` page itself uses `limit=100`).
- **i18n**: video/actress/maker/tag objects carry `title_translations` / `description_translations` / `name_translations` keyed by `cn`,`en`,`hk`,`tw`,… — read `.cn` client-side (no locale param needed). Only `videos/search` takes `?lang=cn`.
- **Covers/avatars are signed and 401 without a token**: `https://files.iw01.xyz/covers/{id}/800.webp?token_v2=<t>&expires=<e>&ip=<i>`; the token triple comes from `GET https://files.iw01.xyz/edge/geo.js?json` (also has `r2_cover`; when false use `covers/{id}/640.jpg`). Actress/maker images are `files.iw01.xyz/<image_r2_key>` with the same triple. `geo()` is cached ~8 min; signed image URLs expire, so old favorites' covers may 404 later (accepted).
- **Playback needs a signed token that must be injected into every segment** (verified end-to-end with curl + browser):
  1. `GET {cdn}/api/v1/videos/{id}/cdn-access?token_v2=&expires=&ip=` where `{cdn}` = `https://customers.iw01.xyz` → `{access_token}` (a JWT whose `sub` is the storage prefix; `is_hot:true` means the IP claim is **not** enforced, so it works from any client).
  2. `GET https://www.av01.media/api/v1/videos/{id}/manifest/master.m3u8` (public, no token) → variants `index90-sv1-v1-a1.m3u8` (360p) / `sv2` (720p) / `sv3` (1080p) with `RESOLUTION`.
  3. `GET https://www.av01.media/api/v1/videos/{id}/manifest/<variant>?access_token=<token>` — the **API** side then rewrites the playlist so every `#EXT-X-MAP`/segment URL points at `customers.iw01.xyz/fmp4/...` **with the token baked in**. The bare `customers` variant playlist returns `403 Forbidden Resource Pattern`, and the master's relative variants carry no token, so neither can be handed to the player raw.
  4. **Hand the player a master, not three single-bitrate playlists** (ABR-master fix). Giving 3 fixed variant URLs skips ABR and forces 1080P first, which stutters on weak links (user report: speed meter oscillating 0↔1 MB/s, web is fine). Instead: fetch `master.m3u8`, rewrite every variant line (and `#EXT-X-I-FRAME-STREAM-INF` `URI=`) to `{apiBase}/api/v1/videos/{id}/manifest/<file>?access_token=<token>` — i.e. `buildMaster()` — write it to `hiker://files/cache/av01_master_<id>.m3u8` and play the `getPath()` `file://…` path as the `自动` line (single-quality variants stay as manual lines). This mirrors the site's own `Lce()` in `index-*.js`, which does the same rewrite into a base64 `data:` URI so hls.js can ABR. Local `file://` m3u8 playback is a documented Hiker feature (`cacheM3u8`, help_js.md). `localMaster()` no-ops when `writeFile`/`getPath` are missing (Node tests) and `resolveMedia` then falls back to the direct variant URLs.
  - `videos/{id}/token` and `videos/{id}/playlist` also exist (`playlist` returns a base64 data-URI m3u8), but `cdn-access` + `master.m3u8` above is the working path.
  - Curl verification of the ABR chain: the rewritten master's variant URLs each return `#EXT-X-MAP:URI="…access_token=…"` and a range request on a segment returns `206`.
- Segment requests work with any/no `Referer` (only the token matters), so `playerHeaders()` just sends the mobile UA + site Referer.
- **No Cloudflare today** — plain `curl` reaches the API, geo, covers and CDN. The CF/webview code paths are kept for future-proofing but are unused.
- Pagination is API page numbers, not the site's paths: list/search routes use `page=fypage` in the Hiker page source, and `search_url` is `https://www.av01.media/cn/search?q=**&page=fypage`. `renderList` resolves the page from the page source, else from the passed URL, else `MY_PAGE`.
- Cards: cover `800.webp` (`400.webp` for small), duration formatted `20h26m`/`48m12s`, views as `3.2万`, date from `published_time`. Card URL is the canonical site URL `…/cn/video/{id}/{slug}` so 原网页/收藏 stay valid; `idFrom(url,'video')` recovers the id.
- **Playback quality cap (2026-09, settled)**: AV01's ABR master we hand the player is built with `CONFIG.limits.abrMaxHeight = 720`, so `buildMaster(text,id,token,maxHeight)` drops variants + I-FRAME entries above the cap (the site's own `Lce()` does the same kind of cap). Reason: measured on the user's phone, the link transfers ~400–560 KB/s of real payload but has **1.5–1.8 s of per-request latency**; AV01 declares 360P 0.39 / 720P 1.38 / 1080P 3.14 Mbps, so 1080P (needs 392 KB/s sustained) is out of reach and letting ABR probe it makes playback thrash (the user saw the speed meter oscillate 0↔several MB/s). 720P is the top of the automatic range; 1080P stays as a manual line inside the player and as a per-quality payload line. If the cap would drop every variant (a 1080P-only video) `resolveMedia` falls back to an uncapped master so the player never gets an empty playlist. `synthMaster` honours the same cap.
- The AV01 stream is **CMAF fMP4** (`.m4s` + `#EXT-X-MAP`, 0.7–4.4 MB segments, `access_token` query on every segment URL) — verified. The other three apps' segment containers were **not** inspected; their segment URLs are short and clean, and the fMP4-vs-MPEG-TS difference is what we *suspect* made AV01 less player-friendly (a hypothesis, not a verified fact). There is **no TS fallback** for AV01 (`master-ts.m3u8` hangs/400, the CDN's `.ts` 504s, `/v2/<storage>/video.mp4` 404s). MX Player cannot play the stream (FFmpeg rejects `.m4s`/`#EXT-X-MAP`) and Hiker's X5 webview cannot run hls.js (no MSE), so neither is usable as a comparison or fallback.
- Temporary on-device diagnostics (`🩺 播放自检` / `📋 复制直连播放地址` / `🌐 用原站播放器播放` / `🧪 固定清晰度自测`, plus `core.diagnose/remotePlayUrl/qualityUrl`) were used to settle the above and have been **removed for the release**; `test/av01.test.js` guards against them coming back.
- State keys are prefixed `av01.`. Preview: `node tools/preview_av01.js` → `docs/dev/preview_av01.html`. Fixtures: `test/fixtures/av01_{home,latest,hottest,detail,similars,search,actresses,makers,tags,actress_videos,geo}.json` + `av01_master.m3u8` (real API responses; descriptions/translations trimmed to keep them small).

## Verifying changes

```
node test/jable_redesign.test.js   # plus missav_plus.test.js, supjav.test.js, av01.test.js
node tools/preview_jable.js    # visual preview → docs/dev/preview_jable.html
node tools/preview_missav.js   # visual preview → docs/dev/preview_missav.html
node tools/preview_supjav.js   # visual preview → docs/dev/preview_supjav.html
node tools/preview_av01.js     # visual preview → docs/dev/preview_av01.html
```

Dependency-free smoke tests: stub Hiker globals, run real code paths (home/list/detail/search/version consistency), one file per app. Run the ones you touched; run all four before a release. Extend the pattern for each new app. Real-page fixtures live in `test/fixtures/` (the MissAV packer script, the SupJav HTML pages, and the AV01 API JSON/m3u8 responses) — prefer storing a genuine fragment over hand-writing markup when the site's minified output matters.

Reference material (read-only clones, never commit here): Hiker API docs at `~/code/developer-reference/Documents/docs/hikerview` (`help_api.md`, `help_js.md`, `help_rules.md`, `help_film_list_rules.md`), community sample rules at `~/code/developer-examples/hikerViewRules` (plaintext ES6 — adapt, don't copy verbatim), and the Android app source at `~/code/developer-reference/hikerView`. After pushing, refresh `docs/subscription.json` in the Hiker app and exercise home → list → detail → playback on-device.
