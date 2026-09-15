/*
 * Jable 小程序冒烟测试。无依赖，直接 `node test/jable.test.js` 运行。
 * 桩掉海阔全局 API，在 Node 中执行 jable_core.js / jable_pages.js 的主要代码路径，
 * 并校验订阅 JSON 版本与所有 ?v= 字面量一致、搜索走路径式翻页。
 */
'use strict';
var fs = require('fs');
var path = require('path');
var assert = require('assert');

var ROOT = path.join(__dirname, '..');
var APP = path.join(ROOT, 'docs', 'apps', 'jable');
var CORE_PATH = path.join(APP, 'jable_core.js');
var PAGES_PATH = path.join(APP, 'jable_pages.js');

function freshRequire(file) { delete require.cache[require.resolve(file)]; return require(file); }

/* ---------- Hiker 全局桩 ---------- */
var store = {};
global.getMyVar = function (k, d) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : (typeof d === 'undefined' ? null : d); };
global.putMyVar = function (k, v) { store[k] = v; };
global.clearMyVar = function (k) { delete store[k]; };
global.listMyVarKeys = function () { return Object.keys(store); };
global.getVar = function (k, d) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : (typeof d === 'undefined' ? null : d); };
global.putVar = function (k, v) { store[k] = v; };
global.storage0 = { getMyVar: global.getMyVar, putMyVar: global.putMyVar };

/* 最小 pdfa/pdfh：解析 .video-img-box 卡片与 h6/span.label/img 属性 */
global.pdfa = function (html, selector) {
    if (!/video-img-box/.test(selector)) return [];
    var re = /<div class="video-img-box"[\s\S]*?(?=<div class="video-img-box"|$)/g;
    return String(html).match(re) || [];
};
global.pdfh = function (html, selector) {
    var m = /^([a-z0-9_.-]+)&&([a-zA-Z-]+)$/i.exec(String(selector));
    if (!m) return '';
    var sel = m[1], kind = m[2];
    var tagMatch = /^([a-z][a-z0-9]*)(?:\.([a-z0-9-]+))?$/i.exec(sel);
    if (!tagMatch) return '';
    var tag = tagMatch[1], cls = tagMatch[2];
    var open = '<' + tag + '\\b' + (cls ? '[^>]*class\\s*=\\s*"[^"]*\\b' + cls + '\\b[^"]*"' : '[^>]*') + '[^>]*>';
    if (/^text$/i.test(kind)) {
        var block = new RegExp(open + '([\\s\\S]*?)</' + tag + '>', 'i').exec(String(html));
        return block ? block[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '';
    }
    var el = new RegExp(open, 'i').exec(String(html));
    if (!el) return '';
    var av = new RegExp('\\s' + kind + '\\s*=\\s*["\']([^"\']*)["\']', 'i').exec(el[0]);
    return av ? av[1] : '';
};

global.setPageTitle = function () {};
global.setPagePicUrl = function () {};
global.refreshPage = function () {};
global.back = function () {};
global.setError = function () {};
global.log = function () {};
var MY_PAGE_VALUE = 1;
Object.defineProperty(global, 'MY_URL', { get: function () { return ''; } });
Object.defineProperty(global, 'MY_PAGE', { get: function () { return MY_PAGE_VALUE; } });

var lastResult = null, lastHome = null, fetchedUrls = [];
global.setResult = function (r) { lastResult = r; };
global.setHomeResult = function (r) { lastHome = r; };

function watchCard(id, title, dur) {
    return '<div class="video-img-box"><a href="https://jable.tv/videos/' + id + '/"><img data-src="https://img.jable.tv/' + id + '.jpg"></a>' +
        '<h6><a href="https://jable.tv/videos/' + id + '/">' + title + '</a></h6>' +
        '<span class="label">' + dur + '</span></div>';
}
var FIXTURE_LIST = '<html><head><meta property="og:title" content="列表"></head><body>' +
    watchCard('ABC-001', 'ABC-001 標題一', '1:23:45') +
    watchCard('ABC-002', 'ABC-002 標題二', '0:45:00') +
    '<div class="pagination"><a href="/latest-updates/2/">02</a></div>共 120 部影片</body></html>';
var FIXTURE_DETAIL = '<html><head><meta property="og:title" content="ABC-001 標題一"><meta property="og:image" content="https://img.jable.tv/abc-001.jpg">' +
    '<meta name="description" content="免費高清AV在線看，無需下載看到飽。"></head><body>' +
    '<a href="/models/%E4%B8%89%E4%B8%8A">三上悠亜</a><a href="/categories/bdsm/">主奴調教</a>' +
    '<span class="inactive-color">上市於 2026-09-10</span>' +
    '<button class="btn btn-action fav mr-2"><span class="count">233</span></button>' +
    '<script>var hlsUrl="https:\\/\\/cdn.example.com\\/abc-001.m3u8";</script></body></html>';

/* 记录 $() 收到的链接，用于断言搜索翻页形式 */
var lastDollarUrl = '';
function dollar(url) {
    if (typeof url === 'string') lastDollarUrl = url;
    return {
        rule: function (cb, params) { return JSON.stringify({ kind: 'rule', url: url, params: params }); },
        lazyRule: function (cb, params) { return JSON.stringify({ kind: 'lazy', url: url, params: params }); }
    };
}
dollar.require = function (p) {
    var s = String(p);
    if (s.indexOf('jable_core') >= 0) return core;
    return pages;
};
dollar.toString = function (fn) { return '(' + fn.toString() + ')'; };
global.$ = dollar;

var core = freshRequire(CORE_PATH);
var pages = freshRequire(PAGES_PATH);

global.fetchPC = function (url) {
    fetchedUrls.push(String(url));
    if (/\/videos\//.test(url)) return JSON.stringify({ body: FIXTURE_DETAIL, headers: { 'Set-Cookie': ['cf_clearance=tok; Path=/'] }, statusCode: 200 });
    return JSON.stringify({ body: FIXTURE_LIST, headers: {}, statusCode: 200 });
};

/* ---------- 用例 ---------- */
var passed = 0, failed = 0;
function titles(cards) { return cards.map(function (c) { return c.title; }); }
function test(name, fn) {
    try { fn(); passed++; console.log('PASS', name); }
    catch (e) { failed++; console.log('FAIL', name, '::', e.message); }
}

test('模块可加载且导出齐全', function () {
    ['renderHome', 'renderList', 'renderDetail', 'renderVerification', 'renderTaxonomy', 'renderModels'].forEach(function (k) {
        assert.strictEqual(typeof pages[k], 'function', '缺少导出 ' + k);
    });
    ['parseCards', 'parseDetail', 'playerHeaders', 'isFavorite', 'toggleFavorite'].forEach(function (k) {
        assert.strictEqual(typeof core[k], 'function', '缺少导出 ' + k);
    });
});

test('首页渲染分类 Tab 与影片卡片', function () {
    store = {}; fetchedUrls = [];
    pages.renderHome();
    assert.ok(Array.isArray(lastHome), '未输出首页');
    var t = titles(lastHome).join('|');
    ['最近更新', '新片上市', '熱度', '主題', '女優', 'ABC-001'].forEach(function (need) {
        assert.ok(t.indexOf(need) >= 0, '首页缺少: ' + need);
    });
});

test('搜索走路径式翻页（/search/<kw>/fypage/），不是 ?q=', function () {
    store = {};
    pages.routeSearch('三上悠亜', 'video_viewed');
    assert.ok(lastDollarUrl.indexOf('hiker://empty#') === 0, '未生成路由: ' + lastDollarUrl);
    assert.ok(lastDollarUrl.indexOf('/search/' + encodeURIComponent('三上悠亜') + '/fypage/') >= 0, '搜索翻页未用路径式: ' + lastDollarUrl);
    assert.ok(lastDollarUrl.indexOf('sort_by=video_viewed') >= 0, '搜索排序丢失: ' + lastDollarUrl);
    assert.ok(lastDollarUrl.indexOf('[firstPage=https://jable.tv/search/' + encodeURIComponent('三上悠亜') + '/?sort_by=video_viewed]') >= 0, 'firstPage 不正确: ' + lastDollarUrl);
});

test('列表页解析卡片并显示总数', function () {
    store = {}; MY_PAGE_VALUE = 1;
    pages.renderList({ url: 'https://jable.tv/latest-updates/', title: '最近更新' });
    var t = titles(lastResult).join('|');
    assert.ok(t.indexOf('ABC-001') >= 0 && t.indexOf('ABC-002') >= 0, '缺少卡片');
    assert.ok(/120/.test(JSON.stringify(lastResult)), '缺少总数');
});

test('详情页解析标题/媒体/收藏数并使用播放头与进度 id', function () {
    store = {};
    pages.renderDetail({ url: 'https://jable.tv/videos/abc-001/', title: 'x' });
    var playCard = lastResult.filter(function (c) { return /▶/.test(c.title); })[0];
    assert.ok(playCard, '缺播放按钮');
    var payload = JSON.parse(playCard.url);
    assert.ok(/abc-001\.m3u8/.test(payload.urls[0]), '未解析到 m3u8: ' + payload.urls[0]);
    assert.strictEqual(payload.headers[0].Referer, 'https://jable.tv/videos/abc-001/', '播放 Referer 缺失');
    assert.strictEqual(playCard.extra.id, 'https://jable.tv/videos/abc-001/', '缺少播放进度 id');
    assert.ok(/233/.test(JSON.stringify(lastResult)), '未解析收藏数');
});

test('通用简介文案被过滤为空', function () {
    var d = core.parseDetail({ html: FIXTURE_DETAIL, url: 'https://jable.tv/videos/abc-001/' });
    assert.strictEqual(d.description, '', '通用简介未被过滤: ' + d.description);
});

test('收藏切换与 isFavorite', function () {
    store = {};
    assert.strictEqual(core.isFavorite('https://jable.tv/videos/abc-001/'), false);
    assert.strictEqual(core.toggleFavorite({ title: 'x', url: 'https://jable.tv/videos/abc-001/' }), true);
    assert.strictEqual(core.isFavorite('https://jable.tv/videos/abc-001/'), true);
    assert.strictEqual(core.toggleFavorite({ title: 'x', url: 'https://jable.tv/videos/abc-001/' }), false);
});

test('播放头包含 Referer/Origin，并在有 cookie 时回放', function () {
    var headers = core.playerHeaders({ url: 'https://jable.tv/videos/abc-001/', cookie: 'cf_clearance=tok' });
    assert.strictEqual(headers.Referer, 'https://jable.tv/videos/abc-001/');
    assert.strictEqual(headers.Origin, 'https://jable.tv');
    assert.strictEqual(headers.Cookie, 'cf_clearance=tok');
});

test('瞬时网络错误（SSL 连接被重置）自动重试一次', function () {
    store = {}; MY_PAGE_VALUE = 1;
    var calls = 0, old = global.fetchPC;
    global.fetchPC = function (url, opts) {
        calls++;
        if (calls === 1) throw new Error('javax.net.ssl.SSLHandshakeException: Connection closed by peer');
        return old(url, opts);
    };
    try {
        pages.renderList({ url: 'https://jable.tv/latest-updates/', title: 'L' });
        assert.ok(calls >= 2, '未触发重试');
        assert.ok(titles(lastResult).join('|').indexOf('ABC-001') >= 0, '重试后仍未成功渲染');
    } finally { global.fetchPC = old; }
});

test('订阅 JSON 版本与 ?v= 字面量一致', function () {
    var file = path.join(ROOT, 'docs', 'subscription.json');
    var entries = JSON.parse(fs.readFileSync(file, 'utf8'));
    var entry = entries.filter(function (e) { return e.title === 'Jable'; })[0];
    assert.ok(entry, '订阅缺少 Jable');
    var source = fs.readFileSync(PAGES_PATH, 'utf8');
    var moduleVersion = /MODULE_VERSION\s*=\s*'(\d+)'/.exec(source)[1];
    assert.strictEqual(String(entry.version), moduleVersion, 'version 与 MODULE_VERSION 不一致');
    ['find_rule', 'searchFind'].forEach(function (field) {
        assert.ok(entry[field].indexOf('/apps/jable/') >= 0, field + ' 未指向 apps/jable');
        assert.ok(entry[field].indexOf('?v=' + moduleVersion) >= 0, field + ' 缺 ?v=' + moduleVersion);
    });
    (source.match(/\?v=(\d+)/g) || []).forEach(function (lit) {
        assert.strictEqual(lit, '?v=' + moduleVersion, '过期字面量 ' + lit);
    });
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
