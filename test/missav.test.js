/*
 * MissAV 小程序冒烟测试。无依赖，直接 `node test/missav.test.js` 运行。
 * 桩掉海阔全局 API，执行 missav_core.js / missav_pages.js 的主要代码路径，
 * 校验卡片/详情/多清晰度解析、搜索翻页形式与版本一致性。
 */
'use strict';
var fs = require('fs');
var path = require('path');
var assert = require('assert');

var ROOT = path.join(__dirname, '..');
var APP = path.join(ROOT, 'docs', 'apps', 'missav');
var CORE_PATH = path.join(APP, 'missav_core.js');
var PAGES_PATH = path.join(APP, 'missav_pages.js');

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
global.getParam = function () { return ''; };
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

function thumb(id, title, dur) {
    return '<div @mouseenter="setPreview(\'' + id + '\')" class="thumbnail group">' +
        '<div class="relative aspect-w-16 aspect-h-9 rounded overflow-hidden shadow-lg">' +
        '<a href="https://missav.ws/cn/' + id + '#uuid_desktop-home" alt="' + id + '">' +
        '<img data-src="https://fourhoi.com/' + id + '/cover-t.jpg" src="https://fourhoi.com/' + id + '/cover-t.jpg">' +
        '<span class="absolute bottom-1 right-1 rounded-lg px-2 py-1 text-xs text-nord5 bg-gray-800 bg-opacity-75">' +
        '\n                        ' + dur + '\n                    </span>' +
        '</a></div>' +
        '<div class="my-2 text-sm text-nord4 truncate"><a x-text="item.full_title" href="https://missav.ws/cn/' + id + '#uuid_desktop-home">' + title + '</a></div>' +
        '</div>';
}
var FIXTURE_LIST = '<html><head><meta property="og:title" content="最近更新"></head><body>' +
    thumb('snos-313', 'SNOS-313 标题一', '3:02:13') +
    thumb('mbdd-2134', 'MBDD-2134 标题二', '1:30:00') +
    '</body></html>';

var FIXTURE_DETAIL = '<html><head>' +
    '<meta property="og:title" content="SNOS-313 标题一 - 濑户康娜">' +
    '<meta property="og:description" content="公司社长有种特殊的性癖，他喜欢妻子被其他男人拥抱。">' +
    '<meta property="og:image" content="https://fourhoi.com/snos-313/cover-n.jpg">' +
    '<meta property="og:video:release_date" content="2026-09-04">' +
    '<meta property="og:video:duration" content="10933">' +
    '</head><body>' +
    '<div class="text-secondary"><span>番号:</span><span>SNOS-313</span></div>' +
    '<div class="text-secondary"><span>女优:</span><a href="/dm20/cn/actresses/seito">瀬户环奈</a></div>' +
    '<div class="text-secondary"><span>类型:</span><a href="/dm218/cn/genres/meiru">美乳</a><a href="/dm1303/cn/genres/koukou">口交</a></div>' +
    '<div class="text-secondary"><span>发行商:</span><a href="/cn/makers/s1">S1</a></div>' +
    '<div class="text-secondary"><span>导演:</span><a href="/cn/directors/xxx">タイガー小堺</a></div>' +
    '<script>source720 = "https:\\/\\/surrit.com\\/uuid\\/720p\\/video.m3u8\\";source1080 = "https:\\/\\/surrit.com\\/uuid\\/1080p\\/video.m3u8";</script>' +
    '</body></html>';

var lastDollarUrl = '';
function dollar(url) {
    if (typeof url === 'string') lastDollarUrl = url;
    return {
        rule: function (cb, params) { return JSON.stringify({ kind: 'rule', url: url, params: params }); },
        lazyRule: function (cb, params) { return JSON.stringify({ kind: 'lazy', url: url, params: params }); }
    };
}
dollar.require = function (p) { return String(p).indexOf('missav_core') >= 0 ? core : pages; };
dollar.toString = function (fn) { return '(' + fn.toString() + ')'; };
global.$ = dollar;

var core = freshRequire(CORE_PATH);
var pages = freshRequire(PAGES_PATH);

global.fetchPC = function (url) {
    fetchedUrls.push(String(url));
    if (/\/cn\/snos-313/.test(url)) return JSON.stringify({ body: FIXTURE_DETAIL, headers: { 'Set-Cookie': ['cf_clearance=tok; Path=/'] }, statusCode: 200 });
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
    ['renderHome', 'renderList', 'renderSearch', 'renderDetail', 'renderDirectory', 'renderVerification', 'renderPlaySettings'].forEach(function (k) {
        assert.strictEqual(typeof pages[k], 'function', '缺少导出 ' + k);
    });
    ['parseCards', 'parseDetail', 'parseGenres', 'parseActresses', 'selectStream', 'playerHeaders'].forEach(function (k) {
        assert.strictEqual(typeof core[k], 'function', '缺少导出 ' + k);
    });
});

test('首页渲染分类 Tab', function () {
    store = {}; fetchedUrls = [];
    pages.renderHome();
    assert.ok(Array.isArray(lastHome), '未输出首页');
    var t = titles(lastHome).join('|');
    ['最近更新', '新作上市', '本週热门', '中文字幕', 'SNOS-313'].forEach(function (need) {
        assert.ok(t.indexOf(need) >= 0, '首页缺少: ' + need);
    });
});

test('卡片解析：标题、封面、时长，且去掉 # 片段', function () {
    var cards = core.parseCards(FIXTURE_LIST, 'https://missav.ws/cn/new');
    assert.strictEqual(cards.length, 2, '卡片数量不对');
    assert.strictEqual(cards[0].url, 'https://missav.ws/cn/snos-313', '未去掉 # 片段: ' + cards[0].url);
    assert.strictEqual(cards[0].title, 'SNOS-313 标题一');
    assert.ok(/cover-t\.jpg/.test(cards[0].image), '封面缺失');
    assert.strictEqual(cards[0].duration, '3:02:13', '时长未解析: ' + cards[0].duration);
});

test('搜索走 query 翻页 page=fypage', function () {
    store = {};
    pages.routeSearch('SSIS');
    assert.ok(lastDollarUrl.indexOf('/cn/search/SSIS') >= 0, '搜索路径不对: ' + lastDollarUrl);
    assert.ok(lastDollarUrl.indexOf('page=fypage') >= 0, '搜索未用 page=fypage: ' + lastDollarUrl);
    assert.ok(lastDollarUrl.indexOf('[firstPage=https://missav.ws/cn/search/SSIS]') >= 0, 'firstPage 不对: ' + lastDollarUrl);
});

test('列表页渲染卡片', function () {
    store = {}; MY_PAGE_VALUE = 1;
    pages.renderList({ url: 'https://missav.ws/cn/new', title: '最近更新' });
    var t = titles(lastResult).join('|');
    assert.ok(t.indexOf('SNOS-313') >= 0 && t.indexOf('MBDD-2134') >= 0, '列表卡片缺失');
});

test('第 2 页不重复标题，且与第 1 页重复的卡片被去掉（Hiker 是追加）', function () {
    store = {}; MY_PAGE_VALUE = 1;
    // 第 1 页记录已见
    pages.renderList({ url: 'https://missav.ws/cn/new', title: '翻页测试' });
    assert.ok(titles(lastResult).indexOf('翻页测试') >= 0, '第 1 页应输出标题');
    // 第 2 页若返回同样的内容，标题不再输出、卡片全部去重
    MY_PAGE_VALUE = 2;
    pages.renderList({ url: 'https://missav.ws/cn/new?page=2', title: '翻页测试' });
    MY_PAGE_VALUE = 1;
    assert.strictEqual(lastResult.filter(function (c) { return c.title === '翻页测试'; }).length, 0, '第 2 页重复输出了标题');
    assert.strictEqual(lastResult.filter(function (c) { return c.col_type === 'movie_2'; }).length, 0, '重复卡片未被去重');
});

test('详情解析：番号/发行日期/时长/女优/类型/多清晰度', function () {
    var d = core.parseDetail(FIXTURE_DETAIL, 'https://missav.ws/cn/snos-313');
    assert.strictEqual(d.code, 'SNOS-313');
    assert.strictEqual(d.releaseDate, '2026-09-04');
    assert.strictEqual(d.duration, '3:02:13', '时长格式不对: ' + d.duration);
    assert.strictEqual(d.actors.map(function (x) { return x.title; }).join(','), '瀬户环奈');
    assert.strictEqual(d.actors[0].url, 'https://missav.ws/cn/actresses/seito', '/dmNN/ 段未清理: ' + d.actors[0].url);
    assert.ok(d.genres.length === 2, '类型数量不对: ' + d.genres.length);
    assert.strictEqual(d.genres[0].url, 'https://missav.ws/cn/genres/meiru', '/dmNN/ 段未清理: ' + d.genres[0].url);
    assert.strictEqual(d.qualities[0].quality, '1080p', '清晰度排序不对: ' + JSON.stringify(d.qualities));
    assert.ok(/1080p\/video\.m3u8$/.test(d.mediaUrl), '主线路未取最高清晰度: ' + d.mediaUrl);
    d.qualities.forEach(function (q) { assert.ok(!/\\$/.test(q.url), '线路 URL 结尾残留反斜杠: ' + q.url); });
});

test('详情页渲染多线路播放与进度 id', function () {
    store = {};
    pages.renderDetail({ url: 'https://missav.ws/cn/snos-313', title: 'x' });
    var playCard = lastResult.filter(function (c) { return /▶/.test(c.title); })[0];
    assert.ok(playCard, '缺播放按钮');
    var payload = JSON.parse(playCard.url);
    assert.ok(payload.urls.length >= 2, '应有多条线路');
    assert.strictEqual(payload.headers.length, payload.urls.length, 'headers 数量应与线路一致');
    assert.strictEqual(playCard.extra.id, 'https://missav.ws/cn/snos-313', '缺少播放进度 id');
    assert.ok(/剧情简介/.test(JSON.stringify(lastResult)), '详情页未展示剧情简介');
});

test('剧情简介缺失 og 时回退到 .line-clamp-2 摘要块', function () {
    var d = core.parseDetail('<html><body><div class="mb-1 text-secondary break-all line-clamp-2">回退摘要文本内容</div></body></html>', 'https://missav.ws/cn/x-1');
    assert.strictEqual(d.description, '回退摘要文本内容', '回退失败: ' + d.description);
});

test('瞬时网络错误自动重试一次', function () {
    store = {}; MY_PAGE_VALUE = 1;
    var calls = 0, old = global.fetchPC;
    global.fetchPC = function (url, opts) { calls++; if (calls === 1) throw new Error('SSLHandshakeException'); return old(url, opts); };
    try {
        pages.renderList({ url: 'https://missav.ws/cn/new', title: 'L' });
        assert.ok(calls >= 2, '未触发重试');
    } finally { global.fetchPC = old; }
});

test('订阅 JSON 版本与 ?v= 字面量一致', function () {
    var entries = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'subscription.json'), 'utf8'));
    var entry = entries.filter(function (e) { return e.title === 'MissAV'; })[0];
    assert.ok(entry, '订阅缺少 MissAV');
    var source = fs.readFileSync(PAGES_PATH, 'utf8');
    var moduleVersion = /MODULE_VERSION\s*=\s*'(\d+)'/.exec(source)[1];
    assert.strictEqual(String(entry.version), moduleVersion, 'version 与 MODULE_VERSION 不一致');
    ['find_rule', 'searchFind'].forEach(function (field) {
        assert.ok(entry[field].indexOf('/apps/missav/') >= 0, field + ' 未指向 apps/missav');
        assert.ok(entry[field].indexOf('?v=' + moduleVersion) >= 0, field + ' 缺 ?v=' + moduleVersion);
    });
    (source.match(/\?v=(\d+)/g) || []).forEach(function (lit) {
        assert.strictEqual(lit, '?v=' + moduleVersion, '过期字面量 ' + lit);
    });
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
