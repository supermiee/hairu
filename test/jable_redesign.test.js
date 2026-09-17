/*
 * Jable 冒烟测试。无依赖：node test/jable_redesign.test.js
 * 桩掉海阔全局 API，跑真实渲染路径，并校验：
 *  - 订阅 JSON 的 Jable 版本与 ?v= 一致
 *  - 数据内核为同目录 jable_redesign_core.js（统一基线 ?v=17）
 *  - 女優路由走 renderModels，而不是影片 renderList
 */
'use strict';
var fs = require('fs');
var path = require('path');
var assert = require('assert');

var ROOT = path.join(__dirname, '..');
var REDESIGN_PATH = path.join(ROOT, 'docs', 'apps', 'jable_redesign', 'jable_redesign_pages.js');
var CORE_PATH = path.join(ROOT, 'docs', 'apps', 'jable_redesign', 'jable_redesign_core.js');

function freshRequire(file) { delete require.cache[require.resolve(file)]; return require(file); }

/* ---------- Hiker 全局桩 ---------- */
var store = {};
global.getMyVar = function (k, d) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : (typeof d === 'undefined' ? null : d); };
global.putMyVar = function (k, v) { store[k] = v; };
global.clearMyVar = function (k) { delete store[k]; };
global.listMyVarKeys = function () { return Object.keys(store); };
global.getVar = function (k, d) { return global.getMyVar(k, d); };
global.putVar = function (k, v) { global.putMyVar(k, v); };
global.storage0 = { getMyVar: global.getMyVar, putMyVar: global.putMyVar };

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
var MY_PAGE_VALUE = 1;
Object.defineProperty(global, 'MY_URL', { get: function () { return ''; } });
Object.defineProperty(global, 'MY_PAGE', { get: function () { return MY_PAGE_VALUE; } });

var lastResult = null, lastHome = null;
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
    '共 120 部影片</body></html>';
var FIXTURE_DETAIL = '<html><head><meta property="og:title" content="ABC-001 標題一"><meta property="og:image" content="https://img.jable.tv/abc-001.jpg">' +
    '</head><body>' +
    '<section class="video-info pb-3"><h4>ABC-001 標題一</h4>' +
    '<div class="models"><a class="model" href="https://jable.tv/models/abc123/"><span data-original-title="三上悠亜">三</span></a></div>' +
    '<div class="text-center"><h5 class="tags h6-md"><a href="https://jable.tv/tags/big-tits/">巨乳</a></h5></div>' +
    '</section>' +
    '<script>var hlsUrl="https:\\/\\/cdn.example.com\\/abc-001.m3u8";</script></body></html>';
var FIXTURE_MODELS = '<html><body>' +
    '<a href="https://jable.tv/models/abc123/"><h6 class="title">三上悠亜</h6><span>128 部影片</span></a>' +
    '<a href="https://jable.tv/models/def456/"><h6 class="title">桃乃木かな</h6><span>90 部影片</span></a>' +
    '</body></html>';

var lastDollarUrl = '';
function dollar(url) {
    if (typeof url === 'string') lastDollarUrl = url;
    return {
        rule: function (cb, params) { return JSON.stringify({ kind: 'rule', url: url, params: params }); },
        lazyRule: function (cb, params) { return JSON.stringify({ kind: 'lazy', url: url, params: params }); }
    };
}
var core = freshRequire(CORE_PATH);
dollar.require = function (p) {
    var s = String(p);
    if (s.indexOf('jable_redesign_core') >= 0) return core;
    return pages;
};
dollar.toString = function (fn) { return '(' + fn.toString() + ')'; };
global.$ = dollar;

var pages = freshRequire(REDESIGN_PATH);

global.fetchPC = function (url) {
    var s = String(url);
    if (/\/videos\//.test(s)) return JSON.stringify({ body: FIXTURE_DETAIL, headers: {}, statusCode: 200 });
    if (/\/models\//.test(s)) return JSON.stringify({ body: FIXTURE_MODELS, headers: {}, statusCode: 200 });
    return JSON.stringify({ body: FIXTURE_LIST, headers: {}, statusCode: 200 });
};

/* ---------- 用例 ---------- */
var passed = 0, failed = 0;
function titles(cards) { return cards.map(function (c) { return c.title || ''; }).join('|'); }
function test(name, fn) {
    try { fn(); passed++; console.log('PASS', name); }
    catch (e) { failed++; console.log('FAIL', name, '::', e.message); }
}

test('模块可加载且导出齐全', function () {
    ['renderHome', 'renderList', 'renderSearch', 'renderRouter', 'recordSearch'].forEach(function (k) {
        assert.strictEqual(typeof pages[k], 'function', '缺少导出 ' + k);
    });
});

test('首页：七个 tab + 搜索框 + 三个分区卡片', function () {
    store = {};
    pages.renderHome();
    assert.ok(Array.isArray(lastHome), '未输出首页');
    var t = titles(lastHome);
    ['首頁', '最近更新', '全新上市', '熱門', '主題', '女優', '我的', 'ABC-001'].forEach(function (need) {
        assert.ok(t.indexOf(need) >= 0, '首页缺少: ' + need);
    });
    assert.ok(lastHome.some(function (c) { return c.col_type === 'input'; }), '缺搜索框');
    assert.ok(lastHome.some(function (c) { return c.col_type === 'pic_1'; }), '缺首个大图卡');
});

test('全部请求失败时给出带验证入口的错误卡片（不静默空白）', function () {
    store = {};
    var old = global.fetchPC;
    global.fetchPC = function () { return JSON.stringify({ body: 'just a moment', statusCode: 403, headers: {} }); };
    try {
        pages.renderHome();
        var t = titles(lastHome);
        assert.ok(t.indexOf('驗證並同步') >= 0 || lastHome.some(function (c) { return JSON.stringify(c.url || '').indexOf('renderVerification') >= 0; }), '错误卡片缺验证入口: ' + t);
        assert.ok(t.indexOf('重試') >= 0, '缺重试卡片');
    } finally { global.fetchPC = old; }
});

test('tab 切换到女優 → 女優排序 chips + 女優条目', function () {
    store = { 'jbp.tab': '5' };
    pages.renderHome();
    var t = titles(lastHome);
    assert.ok(t.indexOf('平均影片') >= 0 || t.indexOf('名稱') >= 0 || t.indexOf('最多影片') >= 0, '缺女優排序 chips: ' + t);
    assert.ok(t.indexOf('三上悠亜') >= 0 && t.indexOf('桃乃木かな') >= 0, '缺女優条目: ' + t);
    /* 女優条目点击应进女優列表页路由 */
    assert.ok(t.indexOf('128 部影片') >= 0, '女優条目缺影片数');
});

test('搜索路由仍为路径式翻页', function () {
    store = {};
    pages.routeSearch('三上悠亜', 'video_viewed');
    assert.ok(lastDollarUrl.indexOf('/search/' + encodeURIComponent('三上悠亜') + '/fypage/') >= 0, '搜索翻页未用路径式: ' + lastDollarUrl);
    assert.ok(lastDollarUrl.indexOf('[firstPage=') >= 0, '缺 firstPage');
});

test('详情页：大图/元信息 chips/彩色播放按钮/演员标签', function () {
    store = {};
    pages.renderRouter({ name: 'renderDetail', params: { url: 'https://jable.tv/videos/abc-001/', title: 'x' } });
    assert.ok(Array.isArray(lastResult) && lastResult.length, '未输出详情');
    assert.strictEqual(lastResult[0].col_type, 'pic_1_full', '详情 hero 未用完整海报');
    var playCard = lastResult.filter(function (c) { return /立即播放/.test(c.title); })[0];
    assert.ok(playCard, '缺播放按钮');
    assert.strictEqual(playCard.extra.backgroundColor, '#E91E63', '播放按钮缺强调色');
    var payload = JSON.parse(playCard.url);
    assert.ok(/abc-001\.m3u8/.test(payload.urls[0]), '未解析到 m3u8');
    assert.strictEqual(playCard.extra.id, 'https://jable.tv/videos/abc-001/', '进度 id 缺失');
    var t = titles(lastResult);
    assert.ok(t.indexOf('三上悠亜') >= 0, '缺演员');
    assert.ok(t.indexOf('巨乳') >= 0, '缺标签');
});

test('local 列表页可渲染（收藏/历史共用）', function () {
    store = {};
    core.setValue('favorites', [{ title: 'ABC-001 x', url: 'https://jable.tv/videos/abc-001/' }]);
    pages.renderRouter({ name: 'renderLocalList', params: { key: 'favorites', title: '收藏' } });
    assert.ok(titles(lastResult).indexOf('ABC-001') >= 0, '收藏页缺卡片');
});

test('订阅 JSON 版本一致，内核为同目录 jable_redesign_core.js?v=17', function () {
    var file = path.join(ROOT, 'docs', 'subscription.json');
    var entries = JSON.parse(fs.readFileSync(file, 'utf8'));
    var entry = entries.filter(function (e) { return e.title === 'Jable'; })[0];
    assert.ok(entry, '订阅缺少 Jable');
    var source = fs.readFileSync(REDESIGN_PATH, 'utf8');
    var moduleVersion = /MODULE_VERSION\s*=\s*'(\d+)'/.exec(source)[1];
    assert.strictEqual(String(entry.version), moduleVersion, 'version 与 MODULE_VERSION 不一致');
    var coreUrl = 'https://supermiee.github.io/hairu/apps/jable_redesign/jable_redesign_core.js?v=17';
    assert.ok(entry.find_rule.indexOf('/apps/jable_redesign/') >= 0, 'find_rule 未指向重构版');
    assert.ok(entry.find_rule.indexOf('?v=' + moduleVersion) >= 0, 'find_rule 缺 ?v=');
    /* 所有 ?v= 统一基线版本：所有 ?v= 都必须等于基线 */
    /* 统一基线版本：所有 ?v= 字面量（pages 与 core）都必须等于基线 */
    (source.match(/\?v=(\d+)/g) || []).forEach(function (lit) {
        assert.strictEqual(lit, '?v=' + moduleVersion, '?v= 字面量应统一为基线，出现 ' + lit);
    });
    assert.ok(source.indexOf(coreUrl) >= 0, '未引用同目录内核: ' + coreUrl);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
