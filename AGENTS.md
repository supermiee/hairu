# AGENTS.md

## What this repo is

Static JavaScript rules ("小程序") for the Hiker (海阔视界) Android app, served by GitHub Pages. No build system, no package.json, no CI — only `docs/`, `test/`, `AGENTS.md`.

- `docs/` is the Pages web root (`https://supermiee.github.io/hairu/`, `.nojekyll` present). Pushing to `main` publishes immediately.
- `docs/subscription.json` — the subscription manifest. **Subscription URL:** `https://supermiee.github.io/hairu/subscription.json`
- Layout: `docs/apps/<app>/<app>_core.js` (kernel: HTTP + CF handling + parsing + cache) and `docs/apps/<app>/<app>_pages.js` (UI layer; the only entrypoint the subscription loads).
- Ported apps: `jable`, `missav`, plus `jable_redesign` — **Jable+**, a redesigned UI layer that reuses `jable_core.js?v=5` (shares cache/verification state with the original). Original Jable and MissAV stay untouched for comparison; **all improvements target Jable+ only** (MissAV will get its own `missav+` later).
- Tests: `node test/jable.test.js`, `node test/missav.test.js`, `node test/jable_redesign.test.js` (one file per app).

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

- **局部刷新**：`updateItem(id, {title, extra:{id}})` updates one card in place via `extra.id` (id must be globally unique across pages; we use `'fav:'+url`). Siblings: `deleteItem` / `deleteItemByCls` / `addItemAfter` / `addItemBefore` / `findItem` / `findItemsByCls` (help_js.md:864-922; JSEngine.java:1167). Jable+ favorite toggle uses this with a `refreshPage(false)` fallback (`typeof updateItem` guard); keep it that way for future `missav+`.
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
- Cloudflare challenges aggressively on non-home paths; keep the `fetchCodeByWebView` + `missav.webviewMode` verification flow. Source list has a few mirrors (`missav.ws`, `missav.ai`, `missav123.com`).

## Verifying changes

```
node test/jable.test.js        # plus missav.test.js, jable_redesign.test.js
```

Dependency-free smoke tests: stub Hiker globals, run real code paths (home/list/detail/search/version consistency), one file per app. Run the ones you touched; run all three before a release. Extend the pattern for each new app.

Reference material (read-only clones, never commit here): Hiker API docs at `~/code/developer-reference/Documents/docs/hikerview` (`help_api.md`, `help_js.md`, `help_rules.md`, `help_film_list_rules.md`), community sample rules at `~/code/developer-examples/hikerViewRules` (plaintext ES6 — adapt, don't copy verbatim), and the Android app source at `~/code/developer-reference/hikerView`. After pushing, refresh `docs/subscription.json` in the Hiker app and exercise home → list → detail → playback on-device.
