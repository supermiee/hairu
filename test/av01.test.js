/*
 * AV01 冒烟测试。无依赖：node test/av01.test.js
 * 桩掉海阔全局 API，跑真实渲染路径，并校验：
 *  - 订阅 JSON 的 AV01 版本与 MODULE_VERSION、?v= 一致
 *  - 首页分区（热门视频 / 最新更新 / 热门片商）与首个大图卡
 *  - 列表/搜索/目录路由与海阔翻页地址（page=fypage）
 *  - 详情播放链路：geo.js -> cdn-access -> master.m3u8 -> 注入 access_token 的分片清单
 *  - 失败时给出带验证入口的错误卡片
 */
'use strict';
var fs = require('fs');
var path = require('path');
var assert = require('assert');

var ROOT = path.join(__dirname, '..');
var PAGES_PATH = path.join(ROOT, 'docs', 'apps', 'av01', 'av01_pages.js');
var CORE_PATH = path.join(ROOT, 'docs', 'apps', 'av01', 'av01_core.js');
var FIX = path.join(__dirname, 'fixtures');

function freshRequire(file) { delete require.cache[require.resolve(file)]; return require(file); }
function readJson(name) { return JSON.parse(fs.readFileSync(path.join(FIX, name), 'utf8')); }
function readText(name) { return fs.readFileSync(path.join(FIX, name), 'utf8'); }

/* ---------- Hiker 全局桩 ---------- */
var store = {};
global.getMyVar = function (k, d) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : (typeof d === 'undefined' ? null : d); };
global.putMyVar = function (k, v) { store[k] = v; };
global.clearMyVar = function (k) { delete store[k]; };
global.listMyVarKeys = function () { return Object.keys(store); };
global.getVar = function (k, d) { return global.getMyVar(k, d); };
global.putVar = function (k, v) { global.putMyVar(k, v); };
global.storage0 = { getMyVar: global.getMyVar, putMyVar: global.putMyVar };
global.getParam = function () { return ''; };
global.setPageTitle = function () {};
global.setPagePicUrl = function () {};
global.refreshPage = function () {};
global.back = function () {};
global.fetchCodeByWebView = undefined;
var MY_PAGE_VALUE = 1, MY_URL_VALUE = '';
Object.defineProperty(global, 'MY_URL', { get: function () { return MY_URL_VALUE; } });
Object.defineProperty(global, 'MY_PAGE', { get: function () { return MY_PAGE_VALUE; } });
var lastResult = null, lastHome = null;
global.setResult = function (r) { lastResult = r; };
global.setHomeResult = function (r) { lastHome = r; };

/* ---------- fixture ---------- */
var FIXTURE_HOME = readJson('av01_home.json');
var FIXTURE_LATEST = readJson('av01_latest.json');
var FIXTURE_HOTTEST = readJson('av01_hottest.json');
var FIXTURE_DETAIL = readJson('av01_detail.json');
var FIXTURE_SIMILARS = readJson('av01_similars.json');
var FIXTURE_SEARCH = readJson('av01_search.json');
var FIXTURE_ACTRESSES = readJson('av01_actresses.json');
var FIXTURE_MAKERS = readJson('av01_makers.json');
var FIXTURE_TAGS = readJson('av01_tags.json');
var FIXTURE_ACTRESS_VIDEOS = readJson('av01_actress_videos.json');
var FIXTURE_GEO = readJson('av01_geo.json');
var FIXTURE_MASTER = readText('av01_master.m3u8');
var ACCESS_TOKEN = 'TEST.ACCESS.TOKEN';

function wrap(payload) { return JSON.stringify({ body: typeof payload === 'string' ? payload : JSON.stringify(payload), headers: {}, statusCode: 200 }); }

var lastFetchUrl = '', lastFetchOptions = null;
function fetchPCImpl(url, options) {
    lastFetchUrl = String(url);
    lastFetchOptions = options || null;
    var s = String(url);
    if (/edge\/geo\.js/.test(s)) return wrap(FIXTURE_GEO);
    if (/cdn-access/.test(s)) return wrap({ access_token: ACCESS_TOKEN, expires_at: 1900000000 });
    if (/manifest\/master\.m3u8/.test(s)) return wrap(FIXTURE_MASTER);
    if (/videos\/types\/combined/.test(s)) return wrap(FIXTURE_HOME);
    if (/videos\/types\/latest/.test(s)) return wrap(FIXTURE_LATEST);
    if (/videos\/types\/hottest/.test(s)) return wrap(FIXTURE_HOTTEST);
    if (/videos\/search/.test(s)) return wrap(FIXTURE_SEARCH);
    if (/videos\/actress\/45/.test(s)) return wrap(FIXTURE_ACTRESS_VIDEOS);
    if (/videos\/219346\/similars/.test(s)) return wrap(FIXTURE_SIMILARS);
    if (/videos\/219346/.test(s)) return wrap(FIXTURE_DETAIL);
    if (/actresses\/by-score/.test(s)) return wrap(FIXTURE_ACTRESSES);
    if (/makers\/by-score/.test(s)) return wrap(FIXTURE_MAKERS);
    if (/tags\/by-score/.test(s)) return wrap(FIXTURE_TAGS);
    return JSON.stringify({ body: '{}', headers: {}, statusCode: 404 });
}
global.fetchPC = fetchPCImpl;

var lastDollarUrl = '';
function dollar(url) {
    if (typeof url === 'string') lastDollarUrl = url;
    return {
        rule: function (cb, params) { return JSON.stringify({ kind: 'rule', url: url, params: params }); },
        lazyRule: function (cb, params) { return JSON.stringify({ kind: 'lazy', url: url, params: params }); }
    };
}
var core = freshRequire(CORE_PATH);
var pages;
dollar.require = function (p) { return String(p).indexOf('av01_core') >= 0 ? core : pages; };
dollar.toString = function (fn) { return '(' + fn.toString() + ')'; };
global.$ = dollar;
pages = freshRequire(PAGES_PATH);

/* ---------- 用例 ---------- */
var passed = 0, failed = 0;
function titles(cards) { return (cards || []).map(function (c) { return c.title || ''; }).join('|'); }
function test(name, fn) {
    try { fn(); passed++; console.log('PASS', name); }
    catch (e) { failed++; console.log('FAIL', name, '::', e.message); }
}

test('模块可加载且导出齐全', function () {
    ['renderHome', 'renderList', 'renderSearch', 'renderRouter', 'renderDetail', 'recordSearch', 'routeFeed', 'routeDirectory', 'routeVideosBy', 'routeVerification'].forEach(function (k) {
        assert.strictEqual(typeof pages[k], 'function', '缺少导出 ' + k);
    });
    ['home', 'feed', 'search', 'directory', 'videosBy', 'detail', 'similars', 'resolveMedia', 'parseVariants', 'coverUrl', 'listValue', 'clearLocal'].forEach(function (k) {
        assert.strictEqual(typeof core[k], 'function', '内核缺少 ' + k);
    });
});

test('首页：七个 tab + 搜索框 + 分区 + 首个大图卡', function () {
    store = {};
    pages.renderHome();
    assert.ok(Array.isArray(lastHome), '未输出首页');
    var t = titles(lastHome);
    ['首页', '最近更新', '热门', '女优', '片商', '分类', '我的'].forEach(function (need) {
        assert.ok(t.indexOf(need) >= 0, '首页缺少 tab: ' + need);
    });
    ['热门视频', '最新更新', '热门片商'].forEach(function (need) {
        assert.ok(t.indexOf(need) >= 0, '首页缺少分区: ' + need);
    });
    assert.ok(lastHome.some(function (c) { return c.col_type === 'input'; }), '缺搜索框');
    assert.ok(lastHome.some(function (c) { return c.col_type === 'pic_1'; }), '缺首个大图卡');
    assert.ok(lastHome.some(function (c) { return c.col_type === 'movie_2'; }), '缺双列卡片');
    assert.ok(t.indexOf('更多') >= 0, '分区标题缺「更多」入口');
    assert.ok(t.indexOf('未注册的页面') < 0 && t.indexOf('加载失败') < 0, '首页渲染失败: ' + t);
});

test('首页分区数据：标题 / more / 卡片字段（中文标题 + 签名封面）', function () {
    var res = core.home();
    assert.ok(res.ok, 'home 调用失败');
    assert.strictEqual(res.sections[0].title, '热门视频');
    assert.ok(/\/cn\/videos\/hottest$/.test(res.sections[0].more), 'more 链接不对: ' + res.sections[0].more);
    var first = res.sections[0].items[0];
    assert.strictEqual(first.code, 'MIRD-281-lada');
    assert.strictEqual(first.title, '【LADA马赛克破坏】MOODYZ粉丝感谢祭 啪啪巴士之旅2026 20小时25分 啪啪巴士13小时40分＋后传4小时＋未公开片段收录 完全版');
    assert.ok(/files\.iw01\.xyz\/covers\/219346\/800\.webp\?token_v2=/.test(first.image), '封面未带签名: ' + first.image);
    assert.strictEqual(first.duration, '20h26m');
    assert.strictEqual(first.views, '3.2万');
    assert.strictEqual(first.date, '2026-09-11');
    assert.strictEqual(first.url, 'https://www.av01.media/cn/video/219346/mird-281-lada');
    assert.strictEqual(first.maker.title, 'Moodyz');
    assert.strictEqual(first.actresses[0].title, '佐佐木明希');
    assert.ok(res.sections.some(function (s) { return s.title.indexOf('热门片商') === 0; }), '缺热门片商分区');
});

test('全部请求失败时给出带验证入口的错误卡片（不静默空白）', function () {
    store = {};
    var old = global.fetchPC;
    global.fetchPC = function () { return JSON.stringify({ body: 'just a moment', statusCode: 403, headers: {} }); };
    try {
        pages.renderHome();
        var t = titles(lastHome);
        assert.ok(t.indexOf('验证并同步') >= 0, '错误卡片缺验证入口: ' + t);
        assert.ok(t.indexOf('重试') >= 0, '缺重试卡片');
    } finally { global.fetchPC = old; }
});

test('搜索路由：/cn/search?q=** + page=fypage', function () {
    store = {};
    pages.routeSearch('SSIS 517');
    assert.ok(lastDollarUrl.indexOf('#https://www.av01.media/cn/search?q=SSIS%20517&page=fypage') >= 0, '搜索翻页路径不对: ' + lastDollarUrl);
    assert.ok(lastDollarUrl.indexOf('[firstPage=https://www.av01.media/cn/search?q=SSIS%20517]') >= 0, 'firstPage 不对: ' + lastDollarUrl);
});

test('列表/目录路由：feed 与目录的 page=fypage', function () {
    store = {};
    pages.routeFeed('latest', '最近更新');
    assert.ok(lastDollarUrl.indexOf('#https://www.av01.media/cn/videos/latest?page=fypage') >= 0, '最近更新翻页不对: ' + lastDollarUrl);
    pages.routeDirectory('actress', '女优');
    assert.ok(lastDollarUrl.indexOf('#https://www.av01.media/cn/actresses?page=fypage') >= 0, '女优目录翻页不对: ' + lastDollarUrl);
    pages.routeVideosBy('tag', 73, '乱交');
    assert.ok(lastDollarUrl.indexOf('#https://www.av01.media/cn/tag/73/?page=fypage') >= 0, '标签影片翻页不对: ' + lastDollarUrl);
});

test('classify：区分 feed / search / directory / videosBy', function () {
    assert.deepStrictEqual(pages.classify('https://www.av01.media/cn/videos/hottest'), { type: 'feed', feed: 'hottest' });
    assert.strictEqual(pages.classify('https://www.av01.media/cn/search?q=abc').type, 'search');
    assert.deepStrictEqual(pages.classify('https://www.av01.media/cn/actresses'), { type: 'directory', dir: 'actress' });
    assert.deepStrictEqual(pages.classify('https://www.av01.media/cn/tags'), { type: 'directory', dir: 'tag' });
    assert.deepStrictEqual(pages.classify('https://www.av01.media/cn/actress/45/%E4%BD%90'), { type: 'videosBy', by: 'actress', id: '45' });
    assert.strictEqual(pages.classify('https://www.av01.media/cn/video/219346/x').type, 'unknown');
});

test('列表渲染：卡片 + 总数 + 翻页去重', function () {
    store = {};
    MY_PAGE_VALUE = 1; MY_URL_VALUE = 'hiker://empty#https://www.av01.media/cn/videos/latest?page=1[firstPage=https://www.av01.media/cn/videos/latest]';
    pages.renderList({ url: 'https://www.av01.media/cn/videos/latest', title: '最近更新' });
    var t1 = titles(lastResult);
    assert.ok(t1.indexOf(FIXTURE_LATEST.videos[0].title_translations.cn) >= 0, '列表缺卡片: ' + t1.slice(0, 200));
    assert.ok(JSON.stringify(lastResult).indexOf(' 部影片') >= 0, '列表缺总数');
    assert.strictEqual(lastResult.filter(function (c) { return c.col_type === 'pic_1' || c.col_type === 'movie_2'; }).length, (FIXTURE_LATEST.videos || []).length, '卡片数量不对');
    /* 第 2 页来自同一 fixture，重复卡片应被去重，标题不再出现 */
    MY_PAGE_VALUE = 2; MY_URL_VALUE = 'hiker://empty#https://www.av01.media/cn/videos/latest?page=2';
    pages.renderList({ url: 'https://www.av01.media/cn/videos/latest', title: '最近更新' });
    assert.strictEqual(lastResult.filter(function (c) { return c.col_type === 'long_text'; }).length, 0, '第 2 页重复输出了标题');
    MY_PAGE_VALUE = 1; MY_URL_VALUE = '';
});

test('搜索渲染：从 q 解析关键词并出卡片', function () {
    store = {};
    MY_PAGE_VALUE = 1; MY_URL_VALUE = 'hiker://empty#https://www.av01.media/cn/search?q=mird&page=1[firstPage=https://www.av01.media/cn/search?q=mird]';
    pages.renderList({ url: 'https://www.av01.media/cn/search?q=mird', title: '搜索：mird' });
    var t = titles(lastResult);
    assert.ok(t.indexOf(FIXTURE_SEARCH.videos[0].title_translations.cn) >= 0, '搜索结果缺卡片: ' + t.slice(0, 200));
    assert.ok(JSON.stringify(lastResult).indexOf(' 部影片') >= 0, '搜索结果缺总数');
    MY_URL_VALUE = '';
});

test('内置搜索翻页：search_url 的 page=fypage 由客户端替换，页码从 URL 解析', function () {
    store = {};
    MY_PAGE_VALUE = 1;
    /* searchFind 传入的 MY_URL 已把 fypage 换成页码（Hiker 行为），且无 # 段 */
    var bodies = [];
    var old = global.fetchPC;
    global.fetchPC = function (url, options) {
        if (options && options.method === 'POST') { bodies.push(String(options.body)); return JSON.stringify({ body: JSON.stringify({ videos: [], pagination: { page: 3, limit: 24, total: 0, totalPages: 0 } }), statusCode: 200, headers: {} }); }
        return fetchPCImpl(url, options);
    };
    try {
        pages.renderSearch('https://www.av01.media/cn/search?q=mird&page=3');
    } finally { global.fetchPC = old; }
    assert.ok(bodies.length, '未调用搜索接口');
    assert.strictEqual(JSON.parse(bodies[0]).pagination.page, 3, '未按 URL 页码请求第 3 页：' + bodies[0]);
    /* 第 3 页不应再输出标题头 */
    assert.strictEqual(lastResult.filter(function (c) { return c.col_type === 'long_text'; }).length, 0, '第 3 页仍输出了标题头');
});

test('女优目录页可渲染（名称 + 数量）', function () {
    store = {};
    MY_PAGE_VALUE = 1; MY_URL_VALUE = 'hiker://empty#https://www.av01.media/cn/actresses?page=1[firstPage=https://www.av01.media/cn/actresses]';
    pages.renderList({ url: 'https://www.av01.media/cn/actresses', title: '女优' });
    var t = titles(lastResult);
    assert.ok(t.indexOf('逢月日葵') >= 0, '目录缺女优: ' + t.slice(0, 300));
    assert.ok(JSON.stringify(lastResult).indexOf('个条目') >= 0, '目录缺条目总数');
    assert.ok(t.indexOf('未注册的页面') < 0 && t.indexOf('渲染失败') < 0, '目录渲染失败: ' + t.slice(0, 200));
    MY_URL_VALUE = '';
});

test('女优 tab：目录条目按名称 + 数量渲染（home）', function () {
    store = { 'av01.tab': '3' };
    pages.renderHome();
    var t = titles(lastHome);
    assert.ok(t.indexOf('逢月日葵') >= 0, '女优目录缺条目: ' + t.slice(0, 300));
    assert.ok(t.indexOf('查看完整') >= 0, '女优目录缺「查看完整」入口');
    assert.ok(t.indexOf('加载失败') < 0, '女优目录加载失败: ' + t.slice(0, 200));
});

test('详情页：hero / 元信息 chips / 强调色播放按钮 / 女优片商标签 / 猜你喜欢', function () {
    store = {};
    MY_PAGE_VALUE = 1;
    pages.renderRouter({ name: 'renderDetail', params: { url: 'https://www.av01.media/cn/video/219346/mird-281-lada', title: 'x' } });
    assert.ok(Array.isArray(lastResult) && lastResult.length, '未输出详情');
    assert.strictEqual(lastResult[0].col_type, 'pic_1_full', '详情 hero 未用完整海报');
    var playCard = lastResult.filter(function (c) { return /立即播放/.test(c.title || ''); })[0];
    assert.ok(playCard, '缺播放按钮：' + titles(lastResult).slice(0, 200));
    assert.strictEqual(playCard.extra.backgroundColor, '#E91E63', '播放按钮缺强调色');
    var payload = JSON.parse(playCard.url);
    assert.strictEqual(payload.urls.length, 3, '播放线路数量不对: ' + payload.urls.length);
    assert.ok(payload.urls[0].indexOf('/videos/219346/manifest/index90-sv3-v1-a1.m3u8') >= 0, '播放地址不对: ' + payload.urls[0]);
    assert.ok(payload.urls[0].indexOf('access_token=' + ACCESS_TOKEN) >= 0, '播放地址缺 access_token: ' + payload.urls[0]);
    assert.deepStrictEqual(payload.names, ['1080P', '720P', '360P'], '清晰度名称不对: ' + payload.names);
    assert.strictEqual(payload.headers.length, payload.urls.length, 'headers 数量应与线路一致');
    assert.strictEqual(playCard.extra.id, 'https://www.av01.media/cn/video/219346/mird-281-lada', '进度 id 缺失');
    var t = titles(lastResult);
    assert.ok(t.indexOf('番号 MIRD-281-lada') >= 0, '缺番号 chip: ' + t.slice(0, 200));
    assert.ok(t.indexOf('时长 20h26m') >= 0, '缺时长 chip');
    assert.ok(t.indexOf('佐佐木明希') >= 0, '缺女优');
    assert.ok(t.indexOf('Moodyz') >= 0, '缺片商');
    assert.ok(t.indexOf('乱交') >= 0, '缺标签');
    assert.ok(t.indexOf('猜你喜欢') >= 0, '缺猜你喜欢');
});

test('播放链路：geo -> cdn-access -> master.m3u8', function () {
    store = {};
    var calls = [];
    var old = global.fetchPC;
    global.fetchPC = function (url, options) { calls.push(String(url)); return fetchPCImpl(url, options); };
    try {
        var media = core.resolveMedia(219346);
        assert.ok(media.ok, '未解出播放清单: ' + JSON.stringify(media));
        assert.ok(calls.some(function (u) { return /edge\/geo\.js/.test(u); }), '未请求 geo.js');
        assert.ok(calls.some(function (u) { return /cdn-access\?token_v2=/.test(u); }), '未请求 cdn-access');
        assert.ok(calls.some(function (u) { return /manifest\/master\.m3u8/.test(u); }), '未请求 master.m3u8');
    } finally { global.fetchPC = old; }
});

test('parseVariants：解析 master.m3u8 的分片清单与清晰度', function () {
    var variants = core.parseVariants(FIXTURE_MASTER);
    assert.strictEqual(variants.length, 3, '变体数量不对: ' + variants.length);
    assert.deepStrictEqual(variants.map(function (v) { return v.height; }), [360, 720, 1080]);
    assert.strictEqual(variants[0].file, 'index90-sv1-v1-a1.m3u8?ro=0');
    assert.strictEqual(variants[1].file, 'index90-sv2-v1-a1.m3u8');
    assert.strictEqual(core.variantLabel({ height: 1080 }), '1080P');
    assert.strictEqual(core.variantLabel({ height: 720 }), '720P');
    assert.strictEqual(core.variantUrl(1, 'x.m3u8', 'T'), 'https://www.av01.media/api/v1/videos/1/manifest/x.m3u8?access_token=T');
    assert.strictEqual(core.variantUrl(1, 'x.m3u8?ro=0', 'T'), 'https://www.av01.media/api/v1/videos/1/manifest/x.m3u8?ro=0&access_token=T');
});

test('detail / similars / directory 解析真实接口数据', function () {
    var res = core.detail(219346);
    assert.ok(res.ok, 'detail 调用失败');
    assert.strictEqual(res.detail.code, 'MIRD-281-lada');
    assert.strictEqual(res.detail.title.indexOf('【LADA马赛克破坏】'), 0);
    assert.ok(res.detail.description.length > 20, '缺简介');
    assert.strictEqual(res.detail.actresses.length, 3);
    assert.strictEqual(res.detail.tags[0].title, '乱交');
    assert.ok(/\/cn\/actress\/45\//.test(res.detail.actresses[0].url), '女优 URL 不对: ' + res.detail.actresses[0].url);
    assert.ok(/\/cn\/tag\/73\//.test(res.detail.tags[0].url), '标签 URL 不对: ' + res.detail.tags[0].url);

    var sim = core.similars(219346, 6);
    assert.ok(sim.ok && sim.items.length === FIXTURE_SIMILARS.videos.length, '相似推荐数量不对: ' + (sim.items && sim.items.length));

    var dir = core.directory('actress', 1, 100);
    assert.ok(dir.ok && dir.items.length === 10, '女优目录数量不对: ' + dir.items.length);
    assert.strictEqual(dir.items[0].title, '逢月日葵');
    assert.ok(dir.items[0].image.indexOf('files.iw01.xyz/entities/actresses/') >= 0, '女优头像未取到: ' + dir.items[0].image);

    var by = core.videosBy('actress', 45, 1, 24);
    assert.ok(by.ok && by.items.length === 3, '女优影片列表不对');
    assert.strictEqual(by.items[0].actresses[0].title, '佐佐木明希');
});

test('feed 分页取对应页码，卡片去重', function () {
    store = {};
    var res = core.feed('latest', 1, 24);
    assert.ok(res.ok && res.items.length === 3, 'feed 数量不对');
    assert.ok(res.total, 'feed 缺总数');
    assert.strictEqual(res.items[0].url.indexOf('https://www.av01.media/cn/video/'), 0, '卡片 URL 不对');
});

test('收藏/搜索历史写入内核本地列表', function () {
    store = {};
    core.addSearch('mird');
    core.addSearch('ssis');
    core.addSearch('mird');
    assert.deepStrictEqual(core.listValue('searches', []), ['mird', 'ssis'], '搜索历史未去重');
    core.toggleFavorite({ title: 'x', url: 'https://www.av01.media/cn/video/219346/mird-281-lada' });
    assert.strictEqual(core.isFavorite('https://www.av01.media/cn/video/219346/mird-281-lada'), true, '收藏未写入');
    core.clearLocal();
    assert.strictEqual(core.listValue('favorites', []).length, 0, 'clearLocal 未清空收藏');
    assert.strictEqual(core.listValue('searches', []).length, 0, 'clearLocal 未清空搜索历史');
});

test('每个 pageRoute 名称都已在路由表注册（防止「未注册的页面」）', function () {
    var source = fs.readFileSync(PAGES_PATH, 'utf8');
    var names = (source.match(/pageRoute\('([A-Za-z]+)'/g) || []).map(function (s) { return /'([A-Za-z]+)'/.exec(s)[1]; });
    assert.ok(names.length >= 3, '未扫描到 pageRoute 名称');
    var mapBlock = /var handler = \(\{([\s\S]*?)\}\)/.exec(source);
    assert.ok(mapBlock, '未找到路由表');
    var registered = {};
    (mapBlock[1].match(/([A-Za-z]+)\s*:/g) || []).forEach(function (s) { registered[s.replace(/\s*:$/, '')] = 1; });
    names.forEach(function (n) { assert.ok(registered[n], '路由表缺少: ' + n); });
});

test('每个已注册路由都能渲染（不报未注册/渲染失败）', function () {
    store = {};
    var names = ['renderDetail', 'renderLocalList', 'renderSettings', 'renderVerification'];
    names.forEach(function (name) {
        lastResult = null;
        pages.renderRouter({ name: name, params: { url: 'https://www.av01.media/cn/video/219346/mird-281-lada', key: 'favorites', title: 'x' } });
        assert.ok(Array.isArray(lastResult) && lastResult.length, name + ' 未输出卡片');
        assert.ok(titles(lastResult).indexOf('未注册的页面') < 0, name + ' 未注册');
        assert.ok(titles(lastResult).indexOf('渲染失败') < 0, name + ' 渲染失败: ' + titles(lastResult).slice(0, 200));
    });
});

test('local 列表页可渲染（收藏/历史共用）', function () {
    store = {};
    core.setValue('favorites', [{ title: 'MIRD-281 x', url: 'https://www.av01.media/cn/video/219346/mird-281-lada', image: '' }]);
    pages.renderRouter({ name: 'renderLocalList', params: { key: 'favorites', title: '收藏' } });
    assert.ok(titles(lastResult).indexOf('MIRD-281') >= 0, '收藏页缺卡片');
});

test('订阅 JSON 版本一致，且模块/内核 ?v= 正确', function () {
    var entries = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'subscription.json'), 'utf8'));
    var entry = entries.filter(function (e) { return e.title === 'AV01'; })[0];
    assert.ok(entry, '订阅缺少 AV01');
    var source = fs.readFileSync(PAGES_PATH, 'utf8');
    var moduleVersion = /MODULE_VERSION\s*=\s*'(\d+)'/.exec(source)[1];
    assert.strictEqual(String(entry.version), moduleVersion, 'version 与 MODULE_VERSION 不一致');
    assert.ok(entry.find_rule.indexOf('/apps/av01/') >= 0, 'find_rule 未指向 av01');
    assert.ok(entry.find_rule.indexOf('?v=' + moduleVersion) >= 0, 'find_rule 缺 ?v=');
    assert.strictEqual(entry.search_url, 'https://www.av01.media/cn/search?q=**&page=fypage', 'search_url 不对: ' + entry.search_url);
    (source.match(/\?v=(\d+)/g) || []).forEach(function (lit) {
        if (lit !== '?v=' + moduleVersion) assert.strictEqual(lit, '?v=1', '内核引用应为 ?v=1，出现 ' + lit);
    });
    assert.ok(source.indexOf('https://supermiee.github.io/hairu/apps/av01/av01_core.js?v=1') >= 0, '未引用内核');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
