/*
 * MissAV+（重构版）冒烟测试。无依赖：node test/missav_plus.test.js
 * 桩掉海阔全局 API，跑真实渲染路径，并校验：
 *  - 订阅 JSON 的 MissAV+ 版本与 ?v= 一致
 *  - 复用原版 core（missav_core.js?v=5）且原版仍引用 v4（互不影响）
 *  - 搜索翻页走 query 形式 page=fypage，与站点一致
 *  - 详情多清晰度播放 payload + 进度 id
 */
'use strict';
var fs = require('fs');
var path = require('path');
var assert = require('assert');

var ROOT = path.join(__dirname, '..');
var PAGES_PATH = path.join(ROOT, 'docs', 'apps', 'missav_plus', 'missav_plus_pages.js');
var CORE_PATH = path.join(ROOT, 'docs', 'apps', 'missav', 'missav_core.js');

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
global.getParam = function () { return ''; };
global.setPageTitle = function () {};
global.setPagePicUrl = function () {};
global.refreshPage = function () {};
global.back = function () {};
global.fetchCodeByWebView = undefined;
var MY_PAGE_VALUE = 1;
Object.defineProperty(global, 'MY_URL', { get: function () { return ''; } });
Object.defineProperty(global, 'MY_PAGE', { get: function () { return MY_PAGE_VALUE; } });
var lastResult = null, lastHome = null;
global.setResult = function (r) { lastResult = r; };
global.setHomeResult = function (r) { lastHome = r; };

/* ---------- fixture ---------- */
function thumb(id, title, dur) {
    return '<div @mouseenter="setPreview(\'' + id + '\')" class="thumbnail group">' +
        '<div class="relative aspect-w-16 aspect-h-9 rounded overflow-hidden shadow-lg">' +
        '<a href="https://missav.ws/cn/' + id + '#uuid_desktop-home" alt="' + id + '">' +
        '<video class="preview hidden" data-src="https://fourhoi.com/' + id + '/preview.mp4"></video>' +
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
    '<a rel="next" href="https://missav.ws/cn/new?page=2">下一页</a>共 120 条影片</body></html>';

var FIXTURE_DETAIL = '<html><head>' +
    '<meta property="og:title" content="SNOS-313 标题一 - 濑户康娜">' +
    '<meta property="og:description" content="公司社长有种特殊的性癖，他喜欢妻子被其他男人拥抱。">' +
    '<meta property="og:image" content="https://fourhoi.com/snos-313/cover-n.jpg">' +
    '<meta property="og:video:release_date" content="2026-09-04">' +
    '<meta property="og:video:duration" content="10933">' +
    '</head><body>' +
    /* 行结构照搬真实页面：<span>标签:</span> + 同行内联值（<time>/font-medium/多个 <a>），链接含轮换的 /dmNN/ */
    '<div class="text-secondary"><span>番号:</span> <span class="font-medium">SNOS-313</span> </div>' +
    '<div class="text-secondary"><span>发行日期:</span> <time datetime="2026-09-04T00:00:00+08:00" class="font-medium">2026-09-04</time> </div>' +
    '<div class="text-secondary"><span>女优:</span> <a href="/dm20/cn/actresses/seito" class="text-nord13 font-medium">濑户环奈</a> </div>' +
    '<div class="text-secondary"><span>类型:</span> <a href="/dm218/cn/genres/meiru" class="text-nord13 font-medium">美乳</a><a href="/dm1303/cn/genres/koukou" class="text-nord13 font-medium">口交</a> </div>' +
    '<div class="text-secondary"><span>发行商:</span> <a href="/cn/makers/s1" class="text-nord13 font-medium">S1</a> </div>' +
    '<script>source720 = "https:\\/\\/surrit.com\\/uuid\\/720p\\/video.m3u8\\";source1080 = "https:\\/\\/surrit.com\\/uuid\\/1080p\\/video.m3u8";</script>' +
    '</body></html>';

var FIXTURE_ACTRESSES = '<html><body>' +
    '<a href="https://missav.ws/dm20/cn/actresses/seito" class="text-nord13">濑户环奈</a>' +
    '<a href="https://missav.ws/dm20/cn/actresses/seito">128 条影片</a>' +
    '<a href="https://missav.ws/dm33/cn/actresses/sakura" class="text-nord13">樱空桃</a>' +
    '<a href="https://missav.ws/dm33/cn/actresses/sakura">90 条影片</a>' +
    '</body></html>';
var FIXTURE_GENRES = '<html><body>' +
    '<a href="https://missav.ws/dm156/cn/genres/%E5%B7%A8%E4%B9%B3" class="text-nord13">巨乳</a>' +
    '<a href="https://missav.ws/dm156/cn/genres/%E5%B7%A8%E4%B9%B3">181661 条影片</a>' +
    '<a href="https://missav.ws/dm133/cn/genres/%E4%B8%AD%E5%87%BA" class="text-nord13">中出</a>' +
    '<a href="https://missav.ws/dm133/cn/genres/%E4%B8%AD%E5%87%BA">221520 条影片</a>' +
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
dollar.require = function (p) { return String(p).indexOf('missav_core') >= 0 ? core : pages; };
dollar.toString = function (fn) { return '(' + fn.toString() + ')'; };
global.$ = dollar;

var pages = freshRequire(PAGES_PATH);

global.fetchPC = function (url) {
    var s = String(url);
    if (/snos-313/.test(s)) return JSON.stringify({ body: FIXTURE_DETAIL, headers: { 'Set-Cookie': ['cf_clearance=tok; Path=/'] }, statusCode: 200 });
    if (/\/actresses/.test(s)) return JSON.stringify({ body: FIXTURE_ACTRESSES, headers: {}, statusCode: 200 });
    if (/\/genres/.test(s)) return JSON.stringify({ body: FIXTURE_GENRES, headers: {}, statusCode: 200 });
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
    ['renderHome', 'renderList', 'renderSearch', 'renderRouter', 'renderDetail', 'recordSearch'].forEach(function (k) {
        assert.strictEqual(typeof pages[k], 'function', '缺少导出 ' + k);
    });
    ['getList', 'parseTotal', 'parseDetail', 'listValue', 'setValue', 'addSearch', 'clearLocal'].forEach(function (k) {
        assert.strictEqual(typeof core[k], 'function', '内核缺少 ' + k);
    });
});

test('首页：七个 tab + 搜索框 + 三个分区 + 首个大图卡', function () {
    store = {};
    pages.renderHome();
    assert.ok(Array.isArray(lastHome), '未输出首页');
    var t = titles(lastHome);
    ['首页', '最近更新', '新作上市', '热门', '女优', '类型', '我的'].forEach(function (need) {
        assert.ok(t.indexOf(need) >= 0, '首页缺少 tab: ' + need);
    });
    ['最近更新', '新作上市', '中文字幕', 'SNOS-313'].forEach(function (need) {
        assert.ok(t.indexOf(need) >= 0, '首页缺少分区内容: ' + need);
    });
    assert.ok(lastHome.some(function (c) { return c.col_type === 'input'; }), '缺搜索框');
    assert.ok(lastHome.some(function (c) { return c.col_type === 'pic_1'; }), '缺首个大图卡');
    assert.ok(t.indexOf('更多') >= 0, '分区标题缺「更多」入口');
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

test('tab 切换到女优 → 排序 chips + 女优条目', function () {
    store = { 'msp.tab': '4' };
    pages.renderHome();
    var t = titles(lastHome);
    assert.ok(t.indexOf('全部') >= 0 && t.indexOf('人气排行') >= 0, '缺女优排序 chips: ' + t);
    assert.ok(t.indexOf('濑户环奈') >= 0 && t.indexOf('樱空桃') >= 0, '缺女优条目: ' + t);
    assert.ok(t.indexOf('128 部') >= 0, '女优条目缺影片数');
});

test('tab 切换到类型 → 类型目录条目', function () {
    store = { 'msp.tab': '5' };
    pages.renderHome();
    var t = titles(lastHome);
    assert.ok(t.indexOf('巨乳') >= 0 && t.indexOf('中出') >= 0, '缺类型条目: ' + t);
});

test('搜索路由走 query 翻页 page=fypage', function () {
    store = {};
    pages.routeSearch('SSIS');
    assert.ok(lastDollarUrl.indexOf('/cn/search/SSIS') >= 0, '搜索路径不对: ' + lastDollarUrl);
    assert.ok(lastDollarUrl.indexOf('page=fypage') >= 0, '搜索未用 page=fypage: ' + lastDollarUrl);
    assert.ok(lastDollarUrl.indexOf('[firstPage=https://missav.ws/cn/search/SSIS]') >= 0, 'firstPage 不对: ' + lastDollarUrl);
});

test('热门 tab 的 chip 也按 query 翻页', function () {
    store = {};
    pages.routeList('https://missav.ws/cn/weekly-hot', '热门', 'hot', 'weekly-hot');
    assert.ok(lastDollarUrl.indexOf('https://missav.ws/cn/weekly-hot?page=fypage') >= 0, '热门翻页不对: ' + lastDollarUrl);
});

test('目录页路由：女优可翻页（page=fypage），类型单页不翻页', function () {
    store = {};
    pages.routeDirectory('actresses', 'https://missav.ws/cn/actresses', '女优');
    assert.ok(lastDollarUrl.indexOf('#https://missav.ws/cn/actresses?page=fypage') >= 0, '女优目录未用可翻页 source: ' + lastDollarUrl);
    assert.ok(lastDollarUrl.indexOf('[firstPage=https://missav.ws/cn/actresses]') >= 0, '女优目录缺 firstPage');
    pages.routeDirectory('genres', 'https://missav.ws/cn/genres', '类型');
    assert.ok(lastDollarUrl.indexOf('page=fypage') < 0, '类型目录不应翻页: ' + lastDollarUrl);
});

test('女优目录页：第 2 页不重复标题，重复条目被去重', function () {
    store = {};
    MY_PAGE_VALUE = 1;
    pages.renderRouter({ name: 'renderDirectory', params: { kind: 'actresses', url: 'https://missav.ws/cn/actresses', title: '女优' } });
    assert.ok(titles(lastResult).indexOf('全部女优') >= 0, '第 1 页缺标题');
    assert.ok(titles(lastResult).indexOf('濑户环奈') >= 0, '第 1 页缺条目');
    MY_PAGE_VALUE = 2;
    pages.renderRouter({ name: 'renderDirectory', params: { kind: 'actresses', url: 'https://missav.ws/cn/actresses', title: '女优' } });
    MY_PAGE_VALUE = 1;
    assert.strictEqual(lastResult.filter(function (c) { return c.col_type === 'long_text'; }).length, 0, '第 2 页重复输出了标题');
    assert.strictEqual(lastResult.filter(function (c) { return String(c.title).indexOf('濑户环奈') >= 0; }).length, 0, '重复女优未被去重');
});

test('详情页：大图/元信息 chips/强调色播放按钮/演员类型', function () {
    store = {};
    pages.renderRouter({ name: 'renderDetail', params: { url: 'https://missav.ws/cn/snos-313', title: 'x' } });
    assert.ok(Array.isArray(lastResult) && lastResult.length, '未输出详情');
    assert.strictEqual(lastResult[0].col_type, 'pic_1_full', '详情 hero 未用完整海报');
    var playCard = lastResult.filter(function (c) { return /立即播放/.test(c.title || ''); })[0];
    assert.ok(playCard, '缺播放按钮');
    assert.strictEqual(playCard.extra.backgroundColor, '#E91E63', '播放按钮缺强调色');
    var payload = JSON.parse(playCard.url);
    assert.ok(payload.urls.length >= 2, '应有多条线路');
    assert.strictEqual(payload.headers.length, payload.urls.length, 'headers 数量应与线路一致');
    assert.ok(/1080p\/video\.m3u8$/.test(payload.urls[0]), '未解析到最高清晰度: ' + payload.urls[0]);
    assert.strictEqual(playCard.extra.id, 'https://missav.ws/cn/snos-313', '进度 id 缺失');
    var t = titles(lastResult);
    assert.ok(t.indexOf('番号 SNOS-313') >= 0, '缺番号 chip');
    assert.ok(t.indexOf('濑户环奈') >= 0, '缺演员');
    assert.ok(t.indexOf('美乳') >= 0, '缺类型');
    assert.ok(t.indexOf('剧情简介') < 0, 'rich_text 不应再拼「剧情简介」标题');
    assert.ok(JSON.stringify(lastResult).indexOf('公司社长') >= 0, '缺剧情简介');
});

test('内核 parseDetail 同时兼容 (html, url) 与页面对象', function () {
    var a = core.parseDetail(FIXTURE_DETAIL, 'https://missav.ws/cn/snos-313');
    var b = core.parseDetail({ html: FIXTURE_DETAIL, url: 'https://missav.ws/cn/snos-313' });
    assert.strictEqual(a.code, 'SNOS-313');
    assert.strictEqual(b.code, 'SNOS-313');
    assert.strictEqual(a.url, b.url, '两种调用的 url 不一致');
    assert.strictEqual(a.qualities.length, b.qualities.length);
});

test('女优目录：名称与数量同在一个 a 内也能取到', function () {
    var html = '<html><body><li><div><a href="https://missav.ws/dm288/cn/actresses/%E6%B3%A2%E5%A4%9A%E9%87%8E%E7%BB%93%E8%A1%A3" class="text-nord13">' +
        '<div><img src="https://fourhoi.com/actress/26225-t.jpg" alt="x"></div></a>' +
        '<div><a href="https://missav.ws/dm288/cn/actresses/%E6%B3%A2%E5%A4%9A%E9%87%8E%E7%BB%93%E8%A1%A3" class="text-nord13">' +
        '<h4>波多野结衣</h4><p>5669 条影片</p><p>2008 出道</p></a></div></div></li></body></html>';
    var list = core.parseActresses(html, 'https://missav.ws/cn/actresses');
    assert.strictEqual(list.length, 1, '应只解析出一条女优: ' + JSON.stringify(list));
    assert.strictEqual(list[0].title, '波多野结衣');
    assert.strictEqual(list[0].count, '5669 部', '数量未取到: ' + list[0].count);
    assert.strictEqual(list[0].url, 'https://missav.ws/cn/actresses/%E6%B3%A2%E5%A4%9A%E9%87%8E%E7%BB%93%E8%A1%A3', '/dmNN/ 未清理');
});

test('卡片时长兼容两种真实标记：普通 span（带缩进）与旧版 x-text 拼接', function () {
    var modern = core.parseCards(FIXTURE_LIST, 'https://missav.ws/cn/new');
    assert.strictEqual(modern[0].duration, '3:02:13', '普通 span 时长未解析: ' + JSON.stringify(modern[0].duration));
    var legacy = '<div class="thumbnail group"><div><a href="https://missav.ws/cn/old-1">' +
        '<img data-src="https://fourhoi.com/old-1/cover-t.jpg">' +
        '<span class="absolute bottom-1 right-1"><span x-text="h">1</span>:<span x-text="m">02</span>:<span x-text="s">03</span></span>' +
        '</a></div><div class="my-2 truncate"><a href="https://missav.ws/cn/old-1">OLD-1 标题</a></div></div>';
    var old = core.parseCards(legacy, 'https://missav.ws/cn/new');
    assert.strictEqual(old.length, 1, '旧版标记未解析出卡片');
    assert.strictEqual(old[0].duration, '1:02:03', '旧版 x-text 时长未解析: ' + JSON.stringify(old[0].duration));
});

test('真实页面 fixture：嵌套 Dean-Edwards packer 仍能解出 m3u8 线路', function () {
    var html = fs.readFileSync(path.join(__dirname, 'fixtures', 'missav_packed_script.html'), 'utf8');
    var streams = core.parseQualities(html);
    var urls = streams.map(function (s) { return s.url; }).join('\n');
    assert.ok(/surrit\.com\/2284c6e4-b7b6-4ec7-b905-0d6783250d46\/720p\/video\.m3u8/.test(urls), '未解出 720p 线路: ' + urls);
    assert.ok(/playlist\.m3u8/.test(urls), '未解出 playlist 线路: ' + urls);
    assert.ok(streams.some(function (s) { return s.quality === '720p'; }), '清晰度标注丢失');
});

test('收藏/搜索历史写入内核本地列表', function () {
    store = {};
    core.addSearch('巨乳');
    core.addSearch('中出');
    core.addSearch('巨乳');
    assert.deepStrictEqual(core.listValue('searches', []), ['巨乳', '中出'], '搜索历史未去重');
    core.toggleFavorite({ title: 'x', url: 'https://missav.ws/cn/snos-313' });
    assert.strictEqual(core.isFavorite('https://missav.ws/cn/snos-313'), true, '收藏未写入');
    assert.strictEqual(core.listValue('favorites', []).length, 1);
    core.clearLocal();
    assert.strictEqual(core.listValue('favorites', []).length, 0, 'clearLocal 未清空收藏');
    assert.strictEqual(core.listValue('searches', []).length, 0, 'clearLocal 未清空搜索历史');
});

test('每个 pageRoute 名称都已在路由表注册（防止「未注册的页面」）', function () {
    var source = fs.readFileSync(PAGES_PATH, 'utf8');
    var names = (source.match(/pageRoute\('([A-Za-z]+)'/g) || []).map(function (s) { return /'([A-Za-z]+)'/.exec(s)[1]; });
    assert.ok(names.length >= 5, '未扫描到 pageRoute 名称');
    var mapBlock = /var handler = \(\{([\s\S]*?)\}\)/.exec(source);
    assert.ok(mapBlock, '未找到路由表');
    var registered = {};
    (mapBlock[1].match(/([A-Za-z]+)\s*:/g) || []).forEach(function (s) { registered[s.replace(/\s*:$/, '')] = 1; });
    names.forEach(function (n) { assert.ok(registered[n], '路由表缺少: ' + n); });
    assert.ok(names.indexOf('renderPlaySettings') >= 0, '设置页应链接到 renderPlaySettings');
});

test('播放设置页可从路由进入，且每个已注册路由都能渲染（不报未注册）', function () {
    store = {};
    var names = ['renderDetail', 'renderLocalList', 'renderSettings', 'renderPlaySettings', 'renderVerification', 'renderDirectory'];
    names.forEach(function (name) {
        lastResult = null;
        pages.renderRouter({ name: name, params: { url: 'https://missav.ws/cn/snos-313', key: 'favorites', title: 'x', kind: 'actresses' } });
        assert.ok(Array.isArray(lastResult) && lastResult.length, name + ' 未输出卡片');
        assert.ok(titles(lastResult).indexOf('未注册的页面') < 0, name + ' 未注册');
        assert.ok(titles(lastResult).indexOf('渲染失败') < 0, name + ' 渲染失败: ' + titles(lastResult));
    });
});

test('local 列表页可渲染（收藏/历史共用）', function () {
    store = {};
    core.setValue('favorites', [{ title: 'SNOS-313 x', url: 'https://missav.ws/cn/snos-313', image: '' }]);
    pages.renderRouter({ name: 'renderLocalList', params: { key: 'favorites', title: '收藏' } });
    assert.ok(titles(lastResult).indexOf('SNOS-313') >= 0, '收藏页缺卡片');
});

test('订阅 JSON 版本一致，复用 core v5，且原版 MissAV 仍为 v4', function () {
    var entries = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'subscription.json'), 'utf8'));
    var entry = entries.filter(function (e) { return e.title === 'MissAV+'; })[0];
    assert.ok(entry, '订阅缺少 MissAV+');
    var source = fs.readFileSync(PAGES_PATH, 'utf8');
    var moduleVersion = /MODULE_VERSION\s*=\s*'(\d+)'/.exec(source)[1];
    assert.strictEqual(String(entry.version), moduleVersion, 'version 与 MODULE_VERSION 不一致');
    assert.ok(entry.find_rule.indexOf('/apps/missav_plus/') >= 0, 'find_rule 未指向重构版');
    assert.ok(entry.find_rule.indexOf('?v=' + moduleVersion) >= 0, 'find_rule 缺 ?v=');
    (source.match(/\?v=(\d+)/g) || []).forEach(function (lit) {
        if (lit !== '?v=' + moduleVersion) assert.strictEqual(lit, '?v=5', '内核引用应为 ?v=5，出现 ' + lit);
    });
    assert.ok(source.indexOf('https://supermiee.github.io/hairu/apps/missav/missav_core.js?v=5') >= 0, '未复用原版 core');
    /* 原版 MissAV 未被改动 */
    var original = entries.filter(function (e) { return e.title === 'MissAV'; })[0];
    assert.ok(original && String(original.version) === '4', '原版 MissAV 版本被改动');
    var originalSource = fs.readFileSync(path.join(ROOT, 'docs', 'apps', 'missav', 'missav_pages.js'), 'utf8');
    assert.ok(originalSource.indexOf("MODULE_VERSION = '4'") >= 0, '原版页面层 MODULE_VERSION 被改动');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
