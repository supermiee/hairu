# AGENTS.md

## What this repo is

Static JavaScript rules ("小程序") for the Hiker (海阔视界) Android app, served by GitHub Pages. No build system, no package.json, no CI — only `docs/`, `test/`, `AGENTS.md`.

- `docs/` is the Pages web root (`https://supermiee.github.io/hairu/`, `.nojekyll` present). Pushing to `main` publishes immediately.
- `docs/subscription.json` — the subscription manifest. **Subscription URL:** `https://supermiee.github.io/hairu/subscription.json`
- Layout: `docs/apps/<app>/<app>_core.js` (kernel: HTTP + CF handling + parsing + cache) and `docs/apps/<app>/<app>_pages.js` (UI layer; the only entrypoint the subscription loads).
- Ported apps: `jable`, `missav`. `hanime` is **not** ported yet — the old repo is `~/code/haikuo-miniapps`.
- Tests: `node test/jable.test.js`, `node test/missav.test.js` (one file per app).

## Critical: version bump

Clients cache modules by URL. Any code change requires bumping, together:

1. `<app>` entry `version` in `docs/subscription.json`
2. `MODULE_VERSION` at the top of `docs/apps/<app>/<app>_pages.js`
3. Every hardcoded `?v=N` literal (inside `$().rule()`/`lazyRule()` callback strings that `require`s the module/core)

`node test/jable.test.js` enforces 1–3. Never `requirejs` a module without `?v=`.

## Runtime environment (Hiker embedded JS engine)

- Code is kept **ES5** (`var`, no arrow/template/let) for compatibility; the demo samples do use ES6, but stay ES5 here.
- File shape: IIFE, export at bottom via `module.exports = exported;` and `$.exports = exported;`.
- Rule callbacks (`$().rule` / `.lazyRule`) run in an **isolated scope**: outer closures are invisible. Re-load the module inside the callback with the full HTTPS URL + `?v=`, and pass data through the params argument (`$('hiker://empty').rule(fn, params)` → `fn(params)`).
- `requirejs` is **not always exposed** in rule callbacks. Always use `try { requirejs(url) } catch { $.require(url) }` with the **same remote URL** — never fall back to a local `hiker://files/rules/...` path (it usually doesn't exist and blanks the page). Wrap render bodies in try/catch and show the error via `renderError()` so failures aren't silent.
- In-app globals (absent in Node): `$` (+`$.require`/`$.toString`/`$.exports`), `storage0`, `getMyVar`/`putMyVar`, `getVar`/`putVar`, `fetchPC`, `fetchCodeByWebView`, `pdfa`/`pdfh`, `MY_URL`/`MY_PAGE`, `setResult`/`setHomeResult`, `setPageTitle`/`setPagePicUrl`, `refreshPage`, `back`, `getParam`.
- UI strings are Chinese (mostly Traditional for Jable, matching the site).

## Pagination (both apps)

- Hiker **appends** the next page's result to the existing list (infinite scroll), it does not replace. So `renderList` must emit non-card items (title/heading, sort chips) **only on page 1** (`MY_PAGE <= 1`) or they repeat.
- Time-ordered feeds (`/new`, `/release`) shift between page requests, so a card can reappear at the next page boundary. `dedupeAcrossPages()` keeps a per-route seen-URL set in rule vars (reset on page 1) and filters repeats. Scope key is the route title.

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
node test/jable.test.js
```

Dependency-free smoke test: stubs Hiker globals, runs real code paths (home/list/detail/search/version consistency) for Jable. Extend it for each new app.

Reference material: Hiker API docs at `~/code/Documents`, decoded community sample rules at `~/code/demo/master/Hiker` (base64-decoded). After pushing, refresh `docs/subscription.json` in the Hiker app and exercise home → list → detail → playback on-device.
