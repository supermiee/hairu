# AGENTS.md

## What this repo is

Static JavaScript rules ("小程序") for the Hiker (海阔视界) Android app, served by GitHub Pages. No build system, no package.json, no CI — only `docs/`, `test/`, `AGENTS.md`.

- `docs/` is the Pages web root (`https://supermiee.github.io/hairu/`, `.nojekyll` present). Pushing to `main` publishes immediately.
- `docs/subscription.json` — the subscription manifest. **Subscription URL:** `https://supermiee.github.io/hairu/subscription.json`
- Layout: `docs/apps/<app>/<app>_core.js` (kernel: HTTP + CF handling + parsing + cache) and `docs/apps/<app>/<app>_pages.js` (UI layer; the only entrypoint the subscription loads).
- Ported apps: `jable` (v1). `missav` / `hanime` are **not** ported yet — the old repo is `~/code/haikuo-miniapps`.

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
- In-app globals (absent in Node): `$` (+`$.require`/`$.toString`/`$.exports`), `storage0`, `getMyVar`/`putMyVar`, `getVar`/`putVar`, `fetchPC`, `fetchCodeByWebView`, `pdfa`/`pdfh`, `MY_URL`/`MY_PAGE`, `setResult`/`setHomeResult`, `setPageTitle`/`setPagePicUrl`, `refreshPage`, `back`, `getParam`.
- UI strings are Chinese (mostly Traditional for Jable, matching the site).

## Jable notes (hard-earned)

- **Search pagination is path-based only**: `/search/<encoded keyword>/<page>/`. `?q=`/`?page=` work for page 1 but ignore page numbers. Build search URLs via `searchUrl`/`searchPagedSource` in `jable_pages.js`; the subscription's `search_url` is `https://jable.tv/search/**/fypage/`.
- Other listings paginate as `/xxx/<page>/` (`/hot/2/`, `/models/2/`, `/categories/<slug>/2/`), so `pagedSource()` uses the `fypage` token.
- Card parse: `pdfa('body&&.video-img-box')` + `pdfh('h6&&Text')`, image from `data-src`, duration from `span.label&&Text`.
- Detail: `og:title`/`og:image` only; the `meta description` is the site's generic slogan, so `detailDescription()` filters it to `''`. Playable m3u8 is the first `m3u8|mp4` in the HTML (CDN needs no special headers).
- Jable sits behind Cloudflare: core has `isHardBlock` short-circuit + `fetchCodeByWebView` fallback + `jable.webviewMode` flag set by「验证并同步」. `isUsableHtml` lets a page-specific `marker` win over generic CF keywords.
- Playback item is a JSON payload `{urls,names,headers}`; set `extra.id = detail.url` so progress is remembered.

## Verifying changes

```
node test/jable.test.js
```

Dependency-free smoke test: stubs Hiker globals, runs real code paths (home/list/detail/search/version consistency) for Jable. Extend it for each new app.

Reference material: Hiker API docs at `~/code/Documents`, decoded community sample rules at `~/code/demo/master/Hiker` (base64-decoded). After pushing, refresh `docs/subscription.json` in the Hiker app and exercise home → list → detail → playback on-device.
