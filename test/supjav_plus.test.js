/*
 * SupJav+ 冒烟测试。无依赖：node test/supjav_plus.test.js
 * 桩掉海阔全局 API，跑真实渲染路径，并校验：
 *  - 订阅 JSON 的 SupJav+ 版本与 MODULE_VERSION、?v= 一致
 *  - 首页分区解析（周热门 + 有码/无码/素人）
 *  - 列表/搜索翻页均走路径式 /page/fypage（搜索为 /zh/page/N?s=kw）
 *  - 详情页播放地址懒解析：渲染时不发中转请求，点「立即播放」才解析
 *  - 每条成功线路只发 1 次中转请求（复用响应里的最终 URL，不再发 redirect:false）
 *  - WebView 抓取带 blockRules（屏蔽静态资源加速）
 *  - Cloudflare 全失败时给出带验证入口的错误卡片
 */
'use strict';
var fs = require('fs');
var path = require('path');
var assert = require('assert');

var ROOT = path.join(__dirname, '..');
var PAGES_PATH = path.join(ROOT, 'docs', 'apps', 'supjav_plus', 'supjav_plus_pages.js');
var CORE_PATH = path.join(ROOT, 'docs', 'apps', 'supjav_plus', 'supjav_plus_core.js');
var FIX = path.join(__dirname, 'fixtures');

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
var FIXTURE_HOME = fs.readFileSync(path.join(FIX, 'supjav_home.html'), 'utf8');
var FIXTURE_LIST = fs.readFileSync(path.join(FIX, 'supjav_list.html'), 'utf8');
var FIXTURE_DETAIL = fs.readFileSync(path.join(FIX, 'supjav_detail.html'), 'utf8');
var FIXTURE_CAST = fs.readFileSync(path.join(FIX, 'supjav_cast.html'), 'utf8');
var FIXTURE_TAG = fs.readFileSync(path.join(FIX, 'supjav_tag.html'), 'utf8');
var FIXTURE_PLAYER = fs.readFileSync(path.join(FIX, 'supjav_player.html'), 'utf8');
var FIXTURE_PACKED = fs.readFileSync(path.join(FIX, 'supjav_packed_script.html'), 'utf8');

var lastFetchUrl = '';
function fetchPCImpl(url) {
    lastFetchUrl = String(url);
    var s = String(url);
    /* 中转请求跟随 302 后：返回第三方播放页 + 最终 URL（模拟 HttpHelper 的 url 字段） */
    if (/lk1\.supremejav\.com/.test(s)) return JSON.stringify({ body: FIXTURE_PLAYER, headers: {}, statusCode: 200, url: 'https://turbovidhls.com/t/abc' });
    if (/458193/.test(s)) return JSON.stringify({ body: FIXTURE_DETAIL, headers: {}, statusCode: 200 });
    if (/\/cast/.test(s)) return JSON.stringify({ body: FIXTURE_CAST, headers: {}, statusCode: 200 });
    if (/\/tag/.test(s)) return JSON.stringify({ body: FIXTURE_TAG, headers: {}, statusCode: 200 });
    if (/\/category\//.test(s)) return JSON.stringify({ body: FIXTURE_LIST, headers: {}, statusCode: 200 });
    return JSON.stringify({ body: FIXTURE_HOME, headers: {}, statusCode: 200 });
}
global.fetchPC = fetchPCImpl;

var lastDollarUrl = '';
var capturedLazy = [];
function dollar(url) {
    if (typeof url === 'string') lastDollarUrl = url;
    return {
        rule: function (cb, params) { return JSON.stringify({ kind: 'rule', url: url, params: params }); },
        lazyRule: function (cb, params) { capturedLazy.push({ cb: cb, params: params }); return JSON.stringify({ kind: 'lazy', url: url, params: params }); }
    };
}
var core = freshRequire(CORE_PATH);
var pages;
dollar.require = function (p) { return String(p).indexOf('supjav_plus_core') >= 0 ? core : pages; };
dollar.toString = function (fn) { return '(' + fn.toString() + ')'; };
global.$ = dollar;
pages = freshRequire(PAGES_PATH);

/* ---------- 用例 ---------- */
var passed = 0, failed = 0;
function titles(cards) { return cards.map(function (c) { return c.title || ''; }).join('|'); }
function test(name, fn) {
    try { fn(); passed++; console.log('PASS', name); }
    catch (e) { failed++; console.log('FAIL', name, '::', e.message); }
}

test('模块可加载且导出齐全', function () {
    ['renderHome', 'renderList', 'renderSearch', 'renderRouter', 'renderDetail', 'recordSearch', 'routeDirectory', 'routeVerification'].forEach(function (k) {
        assert.strictEqual(typeof pages[k], 'function', '缺少导出 ' + k);
    });
    ['getList', 'parseHomeSections', 'parseCards', 'parseCast', 'parseDetail', 'resolveBest', 'resolveMedia', 'packedMediaCandidates', 'parsePlayerPage', 'listValue', 'clearLocal'].forEach(function (k) {
        assert.strictEqual(typeof core[k], 'function', '内核缺少 ' + k);
    });
});

test('首页：七个 tab + 搜索框 + 分区 + 首个大图卡', function () {
    store = {};
    pages.renderHome();
    assert.ok(Array.isArray(lastHome), '未输出首页');
    var t = titles(lastHome);
    ['首页', '热门', '有码', '无码', '女优', '分类', '我的'].forEach(function (need) {
        assert.ok(t.indexOf(need) >= 0, '首页缺少 tab: ' + need);
    });
    ['本周热门', '有码', '无码', '素人', 'JIMMY-009'].forEach(function (need) {
        assert.ok(t.indexOf(need) >= 0, '首页缺少分区内容: ' + need);
    });
    assert.ok(lastHome.some(function (c) { return c.col_type === 'input'; }), '缺搜索框');
    assert.ok(lastHome.some(function (c) { return c.col_type === 'pic_1'; }), '缺首个大图卡');
    assert.ok(t.indexOf('更多') >= 0, '分区标题缺「更多」入口');
    assert.ok(t.indexOf('154697') < 0, '数量不应混进标题');
});

test('首页分区解析：标题 / 数量 / more 链接 / 卡片', function () {
    var sections = core.parseHomeSections(FIXTURE_HOME, 'https://supjav.com/zh/');
    assert.ok(sections.length >= 4, '分区数量不足: ' + sections.length);
    assert.strictEqual(sections[0].title, "Week's Popular");
    assert.ok(/\/zh\/popular\?sort=week/.test(sections[0].more), '周热门 more 链接不对: ' + sections[0].more);
    var censored = sections.filter(function (s) { return s.title === '有码'; })[0];
    assert.ok(censored, '缺少「有码」分区');
    assert.strictEqual(censored.count, '154697', '数量解析失败: ' + censored.count);
    assert.strictEqual(censored.items.length, 2, '有码卡片数量不对: ' + censored.items.length);
    assert.strictEqual(censored.items[0].title, 'JIMMY-009 与男性亲戚共度的日子');
    assert.strictEqual(censored.items[0].image, 'https://img.supjav.com/images/2026/09/JIMMY-009.jpg!320x216.jpg');
    assert.strictEqual(censored.items[0].date, '2026/09/16');
    assert.strictEqual(censored.items[0].views, '28717');
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

test('搜索路由走路径式翻页 /zh/page/fypage?s=', function () {
    store = {};
    pages.routeSearch('SSIS 517');
    assert.ok(lastDollarUrl.indexOf('https://supjav.com/zh/page/fypage?s=SSIS%20517') >= 0, '搜索翻页路径不对: ' + lastDollarUrl);
    assert.ok(lastDollarUrl.indexOf('[firstPage=https://supjav.com/zh/?s=SSIS%20517]') >= 0, 'firstPage 不对: ' + lastDollarUrl);
});

test('分类列表路由走 /category/xxx/page/fypage', function () {
    store = {};
    pages.routeList('https://supjav.com/zh/category/censored-jav', '有码', 'list', '');
    assert.ok(lastDollarUrl.indexOf('#https://supjav.com/zh/category/censored-jav/page/fypage') >= 0, '分类翻页路径不对: ' + lastDollarUrl);
});

test('热门排序仍保留 query（popular/page/fypage?sort=week）', function () {
    store = {};
    pages.routeList('https://supjav.com/zh/popular?sort=week', '热门', 'popular', 'week');
    assert.ok(lastDollarUrl.indexOf('https://supjav.com/zh/popular/page/fypage?sort=week') >= 0, '热门翻页不对: ' + lastDollarUrl);
});

test('英文主站入口会被补上 /zh（Week\'s Popular 的 More）', function () {
    store = {};
    pages.routeList('https://supjav.com/popular?sort=week', '热门', 'popular', 'week');
    assert.ok(lastDollarUrl.indexOf('https://supjav.com/zh/popular/page/fypage?sort=week') >= 0, '未本地化: ' + lastDollarUrl);
    var route = pages.routeDetail({ url: 'https://supjav.com/458193.html', title: 'x' });
    assert.ok(String(route).indexOf('https://supjav.com/zh/458193.html') >= 0, '详情未本地化: ' + route);
});

test('目录路由：女优 /cast/page/fypage，类别 /tag/page/fypage', function () {
    store = {};
    pages.routeDirectory('cast', 'https://supjav.com/zh/cast', '女优');
    assert.ok(lastDollarUrl.indexOf('#https://supjav.com/zh/cast/page/fypage') >= 0, '女优目录翻页不对: ' + lastDollarUrl);
    pages.routeDirectory('tag', 'https://supjav.com/zh/tag', '类别');
    assert.ok(lastDollarUrl.indexOf('#https://supjav.com/zh/tag/page/fypage') >= 0, '类别目录翻页不对: ' + lastDollarUrl);
});

test('列表渲染：卡片 + 总数 + 翻页去重', function () {
    store = {};
    MY_PAGE_VALUE = 1;
    pages.renderList({ url: 'https://supjav.com/zh/category/censored-jav', title: '有码' });
    var t1 = titles(lastResult);
    assert.ok(t1.indexOf('JIMMY-009') >= 0 && t1.indexOf('REAL-786') >= 0, '列表缺卡片: ' + t1);
    assert.ok(JSON.stringify(lastResult).indexOf('154697 部') >= 0, '列表缺总数');
    /* 第 2 页来自同一 fixture，重复卡片应被去重，标题不再出现 */
    MY_PAGE_VALUE = 2;
    pages.renderList({ url: 'https://supjav.com/zh/category/censored-jav', title: '有码' });
    MY_PAGE_VALUE = 1;
    assert.strictEqual(lastResult.filter(function (c) { return c.col_type === 'long_text'; }).length, 0, '第 2 页重复输出了标题');
    assert.strictEqual(lastResult.filter(function (c) { return String(c.title).indexOf('JIMMY-009') >= 0; }).length, 0, '重复卡片未被去重');
});

test('女优目录页可渲染（名称 + 数量）', function () {
    store = {};
    MY_PAGE_VALUE = 1;
    pages.renderList({ url: 'https://supjav.com/zh/cast', title: '女优', listKind: 'directory', dirKind: 'cast' });
    var t = titles(lastResult);
    assert.ok(t.indexOf('桜木なぎさ') >= 0, '目录缺女优: ' + t);
    assert.ok(t.indexOf('130 部') >= 0, '目录缺影片数');
    assert.ok(t.indexOf('未注册的页面') < 0 && t.indexOf('渲染失败') < 0, '目录渲染失败: ' + t);
});

test('分类 tab：类别目录条目（名称 + 数量）', function () {
    store = { 'sjp.tab': '5' };
    pages.renderHome();
    var t = titles(lastHome);
    assert.ok(t.indexOf('口交') >= 0 && t.indexOf('中出') >= 0, '分类目录缺条目: ' + t);
    assert.ok(t.indexOf('10937 部') >= 0, '分类目录缺数量');
    assert.ok(t.indexOf('加载失败') < 0, '分类目录加载失败: ' + t);
});

test('详情页：大图 / 元信息 chips / 强调色播放按钮 / 懒解析（渲染时不发中转请求）', function () {
    store = {};
    capturedLazy = [];
    lastFetchUrl = '';
    pages.renderRouter({ name: 'renderDetail', params: { url: 'https://supjav.com/zh/458193.html', title: 'x' } });
    assert.ok(Array.isArray(lastResult) && lastResult.length, '未输出详情');
    assert.strictEqual(lastResult[0].col_type, 'pic_1_full', '详情 hero 未用完整海报');
    var playCard = lastResult.filter(function (c) { return /立即播放/.test(c.title || ''); })[0];
    assert.ok(playCard, '缺播放按钮：' + titles(lastResult));
    assert.strictEqual(playCard.extra.backgroundColor, '#E91E63', '播放按钮缺强调色');
    assert.strictEqual(playCard.extra.id, 'https://supjav.com/zh/458193.html', '进度 id 缺失');
    var lazy = JSON.parse(playCard.url);
    assert.strictEqual(lazy.kind, 'lazy', '播放按钮应是懒解析 lazyRule');
    assert.strictEqual((lazy.params.servers || []).length, 4, '懒解析参数缺线路');
    assert.strictEqual(lazy.params.detailUrl, 'https://supjav.com/zh/458193.html', '懒解析参数缺详情 URL');
    /* 关键：渲染详情页期间不应请求播放中转（原版会打 2 次） */
    assert.ok(lastFetchUrl.indexOf('lk1.supremejav.com') < 0, '详情页渲染时不应请求中转: ' + lastFetchUrl);
    var t = titles(lastResult);
    assert.ok(t.indexOf('分类 有码') >= 0, '缺分类 chip');
    assert.ok(t.indexOf('播放 28717') >= 0, '缺播放量 chip');
    assert.ok(t.indexOf('桜木なぎさ') >= 0, '缺女优');
    assert.ok(t.indexOf('JIMMY SCANDAL') >= 0, '缺制作商');
    assert.ok(t.indexOf('中出') >= 0, '缺标签');
    assert.ok(t.indexOf('猜你喜欢') >= 0, '缺猜你喜欢');
    assert.ok(t.indexOf('JIMMY-006') >= 0, '缺推荐卡片');
});

test('点「立即播放」才解析：回调返回播放载荷，且只打 1 次中转请求', function () {
    store = {};
    capturedLazy = [];
    pages.renderRouter({ name: 'renderDetail', params: { url: 'https://supjav.com/zh/458193.html', title: 'x' } });
    var lazy = capturedLazy.filter(function (l) { return l.params && l.params.servers; }).pop();
    assert.ok(lazy, '未捕获到主播放按钮的懒解析回调');
    lastFetchUrl = '';
    var token = lazy.params.servers[0].token;
    var expected = token.split('').reverse().join('');
    var out = lazy.cb(lazy.params);
    assert.ok(lastFetchUrl.indexOf('https://lk1.supremejav.com/supjav.php?c=' + expected) >= 0, '播放中转请求不对: ' + lastFetchUrl);
    var payload = JSON.parse(out);
    assert.deepStrictEqual(payload.urls, ['https://cdn.turboviplay.com/data1/6aa9621c41a98/6aa9621c41a98.m3u8'], '未解析到 m3u8');
    assert.strictEqual(payload.names[0], 'TV', '线路名应为 TV');
    assert.strictEqual(payload.headers.length, payload.urls.length, 'headers 数量应与线路一致');
    assert.strictEqual(payload.headers[0].Referer, 'https://lk1.supremejav.com/', '播放 Referer 不对');
});

test('resolveServer：成功线路只发 1 次中转请求（复用响应里的最终 URL）', function () {
    var old = global.fetchPC;
    var calls = [];
    global.fetchPC = function (url, opts) {
        calls.push({ url: String(url), redirect: opts && opts.redirect });
        return JSON.stringify({ body: FIXTURE_PLAYER, headers: {}, statusCode: 200, url: 'https://turbovidhls.com/t/abc' });
    };
    try {
        var r = core.resolveServer({ name: 'TV', token: 'abc' });
        assert.strictEqual(r.media, 'https://cdn.turboviplay.com/data1/6aa9621c41a98/6aa9621c41a98.m3u8', '直链未解析');
        assert.strictEqual(r.pageUrl, 'https://turbovidhls.com/t/abc', '未复用最终 URL');
        assert.strictEqual(calls.length, 1, '成功线路应只发 1 次请求，实际 ' + calls.length);
        assert.ok(!calls.some(function (c) { return c.redirect === false; }), '不应再发 redirect:false 请求');
    } finally { global.fetchPC = old; }
});

test('resolveBest：逐线路解析，返回首个含直链的线路', function () {
    var old = global.fetchPC;
    global.fetchPC = function (url) {
        if (/c=AAA/.test(url)) return JSON.stringify({ body: '<html><body>404</body></html>', statusCode: 404, headers: {} });
        return JSON.stringify({ body: FIXTURE_PLAYER, headers: {}, statusCode: 200, url: 'https://turbovidhls.com/t/bbb' });
    };
    try {
        var best = core.resolveBest([{ name: 'TV', token: 'AAA' }, { name: 'FST', token: 'BBB' }]);
        assert.ok(best.ok, '未解出媒体地址');
        assert.strictEqual(best.server, 'FST', '未回退到第二条线路');
    } finally { global.fetchPC = old; }
});

test('WebView 抓取带 blockRules（屏蔽静态资源加速）', function () {
    var source = fs.readFileSync(CORE_PATH, 'utf8');
    assert.ok(/blockRules:\s*CONFIG\.blockRules/.test(source), '未传 blockRules');
    assert.ok(/\.png/.test(source) && /\.css/.test(source) && /\.m3u8/.test(source), 'blockRules 未覆盖常见静态资源');
});

test('resolveMedia：多线路时第一个失败会自动尝试下一个', function () {
    var html = '<a class="btn-server active" data-link="AAA">TV</a><a class="btn-server" data-link="BBB">FST</a>';
    var old = global.fetchPC;
    var calls = [];
    global.fetchPC = function (url) {
        calls.push(String(url));
        if (/c=AAA/.test(url)) return JSON.stringify({ body: '<html><body>404</body></html>', statusCode: 404, headers: {} });
        return JSON.stringify({ body: FIXTURE_PLAYER, headers: {}, statusCode: 200 });
    };
    try {
        var media = core.resolveMedia(html);
        assert.ok(media.ok, '未解出媒体地址');
        assert.strictEqual(media.server, 'FST', '未回退到第二条线路');
        assert.ok(calls.length >= 2, '未尝试第二条线路');
    } finally { global.fetchPC = old; }
});

test('parsePlayerPage 兼容 data-hash 与裸 m3u8', function () {
    assert.strictEqual(core.parsePlayerPage(FIXTURE_PLAYER), 'https://cdn.turboviplay.com/data1/6aa9621c41a98/6aa9621c41a98.m3u8');
    assert.strictEqual(core.parsePlayerPage('<script>var src="https:\\/\\/x.com\\/a.m3u8";</script>'), 'https://x.com/a.m3u8');
});

test('真实打包脚本 fixture：packedMedia 优先 .m3u8（FST 的 hls3 是 master.txt，Hiker 不认）', function () {
    var candidates = core.packedMediaCandidates(FIXTURE_PACKED);
    assert.ok(candidates.length >= 2, '应收集到 hls2/hls3 两个候选: ' + candidates.length);
    assert.ok(candidates.some(function (u) { return /\.txt/.test(u); }), '候选应含 .txt 索引');
    assert.ok(candidates.some(function (u) { return /\.m3u8/.test(u); }), '候选应含 .m3u8');
    var url = core.packedMedia(FIXTURE_PACKED);
    assert.ok(/\.m3u8(\?|#|$)/i.test(url), '未优先选 .m3u8: ' + url);
    assert.strictEqual(core.extractMedia(FIXTURE_PACKED), url, 'extractMedia 未回退到打包脚本');
});

test('resolveServer：响应 url 仍在中转域时弃用，改用 redirectUrl 取真实落点', function () {
    var old = global.fetchPC;
    var relay = 'https://lk1.supremejav.com/supjav.php?c=abc';
    global.fetchPC = function (url, opts) {
        if (opts && opts.redirect === false) return JSON.stringify({ body: '', headers: { Location: ['https://fc2stream.tv/e/xyz'] }, statusCode: 302 });
        return JSON.stringify({ body: '<html><body>no media here</body></html>', headers: {}, statusCode: 200, url: relay });
    };
    try {
        var r = core.resolveServer({ name: 'FST', token: 'abc' });
        assert.strictEqual(r.media, '', '不该解出直链');
        assert.strictEqual(r.pageUrl, 'https://fc2stream.tv/e/xyz', '中转域 url 未被弃用: ' + r.pageUrl);
    } finally { global.fetchPC = old; }
});

test('resolveServer：直链线路返回 media，非直链线路回退到第三方页面地址', function () {
    var old = global.fetchPC;
    try {
        /* 1) 直链：data-hash 播放页 */
        global.fetchPC = function (url) {
            var s = String(url);
            if (/redirect=false/.test(s) || s.indexOf('GETREDIRECT') >= 0) return JSON.stringify({ body: '', headers: { Location: ['https://turbovidhls.com/t/abc'] }, statusCode: 302 });
            return JSON.stringify({ body: FIXTURE_PLAYER, headers: {}, statusCode: 200 });
        };
        var direct = core.resolveServer({ name: 'TV', token: 'abc' });
        assert.strictEqual(direct.media, 'https://cdn.turboviplay.com/data1/6aa9621c41a98/6aa9621c41a98.m3u8', '直链未解析');
        assert.strictEqual(direct.name, 'TV');

        /* 2) 非直链：SVG/JS 播放器页 -> 只给第三方页面地址 */
        global.fetchPC = function (url, opts) {
            if (opts && opts.redirect === false) return JSON.stringify({ body: '', headers: { Location: ['https://voe.sx/e/xyz'] }, statusCode: 302 });
            return JSON.stringify({ body: '<html><body><script>var source=null;</script></body></html>', headers: {}, statusCode: 200 });
        };
        var fallback = core.resolveServer({ name: 'VOE', token: 'def' });
        assert.strictEqual(fallback.media, '', '不应解析出直链');
        assert.strictEqual(fallback.pageUrl, 'https://voe.sx/e/xyz', '未回退到第三方页面地址');
    } finally { global.fetchPC = old; }
});

test('详情页渲染线路 chips（TV/FST/ST/VOE）', function () {
    store = {};
    pages.renderRouter({ name: 'renderDetail', params: { url: 'https://supjav.com/zh/458193.html', title: 'x' } });
    var t = titles(lastResult);
    ['TV', 'FST', 'ST', 'VOE'].forEach(function (name) {
        assert.ok(t.indexOf(name) >= 0, '缺线路 chip: ' + name);
    });
    assert.ok(t.indexOf('切换线路') >= 0, '缺线路分区标题: ' + t);
});

test('parseDetail 同时兼容 (html, url) 与页面对象', function () {
    var a = core.parseDetail(FIXTURE_DETAIL, 'https://supjav.com/zh/458193.html');
    var b = core.parseDetail({ html: FIXTURE_DETAIL, url: 'https://supjav.com/zh/458193.html' });
    assert.strictEqual(a.code, 'JIMMY-009');
    assert.strictEqual(b.code, 'JIMMY-009');
    assert.strictEqual(a.url, b.url);
    assert.strictEqual(a.cast.title, '桜木なぎさ');
    assert.strictEqual(a.maker.title, 'JIMMY SCANDAL');
    assert.strictEqual(a.tags.length, 6, '标签数量不对: ' + a.tags.length);
    assert.strictEqual(a.servers.length, 4, '线路数量不对: ' + a.servers.length);
    assert.deepStrictEqual(a.servers.map(function (s) { return s.name; }), ['TV', 'FST', 'ST', 'VOE']);
    assert.ok(/img\.supjav\.com\/images/.test(a.image), '封面未取到: ' + a.image);
});

test('目录解析排除分页链接（/tag/page/2 不应被当成条目）', function () {
    var tags = core.parseTags(FIXTURE_TAG, 'https://supjav.com/zh/tag');
    assert.strictEqual(tags.length, 6, '目录条目数量不对: ' + JSON.stringify(tags.map(function (x) { return x.title; })));
    assert.strictEqual(tags.filter(function (x) { return /\/page\//.test(x.url); }).length, 0, '分页链接混入目录');
    assert.strictEqual(tags[0].title, '多P');
    assert.strictEqual(tags[0].count, '30576');
});

test('卡片解析：懒加载 data-original 优先于 base64 占位', function () {
    var cards = core.parseCards(FIXTURE_LIST, 'https://supjav.com/zh/category/censored-jav');
    assert.strictEqual(cards.length, 3, '卡片数量不对: ' + cards.length);
    assert.ok(!/^data:/.test(cards[0].image), '占位图未替换: ' + cards[0].image);
    assert.strictEqual(cards[0].image, 'https://img.supjav.com/images/2026/09/JIMMY-009.jpg!320x216.jpg');
    assert.strictEqual(core.parseTotal(FIXTURE_LIST), '154697');
});

test('收藏/搜索历史写入内核本地列表', function () {
    store = {};
    core.addSearch('口交');
    core.addSearch('中出');
    core.addSearch('口交');
    assert.deepStrictEqual(core.listValue('searches', []), ['口交', '中出'], '搜索历史未去重');
    core.toggleFavorite({ title: 'x', url: 'https://supjav.com/zh/458193.html' });
    assert.strictEqual(core.isFavorite('https://supjav.com/zh/458193.html'), true, '收藏未写入');
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
        pages.renderRouter({ name: name, params: { url: 'https://supjav.com/zh/458193.html', key: 'favorites', title: 'x' } });
        assert.ok(Array.isArray(lastResult) && lastResult.length, name + ' 未输出卡片');
        assert.ok(titles(lastResult).indexOf('未注册的页面') < 0, name + ' 未注册');
        assert.ok(titles(lastResult).indexOf('渲染失败') < 0, name + ' 渲染失败: ' + titles(lastResult));
    });
});

test('local 列表页可渲染（收藏/历史共用）', function () {
    store = {};
    core.setValue('favorites', [{ title: 'JIMMY-009 x', url: 'https://supjav.com/zh/458193.html', image: '' }]);
    pages.renderRouter({ name: 'renderLocalList', params: { key: 'favorites', title: '收藏' } });
    assert.ok(titles(lastResult).indexOf('JIMMY-009') >= 0, '收藏页缺卡片');
});

test('订阅 JSON 版本一致，且模块/内核 ?v= 正确', function () {
    var entries = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'subscription.json'), 'utf8'));
    var entry = entries.filter(function (e) { return e.title === 'SupJav+'; })[0];
    assert.ok(entry, '订阅缺少 SupJav+');
    var source = fs.readFileSync(PAGES_PATH, 'utf8');
    var moduleVersion = /MODULE_VERSION\s*=\s*'(\d+)'/.exec(source)[1];
    assert.strictEqual(String(entry.version), moduleVersion, 'version 与 MODULE_VERSION 不一致');
    assert.ok(entry.find_rule.indexOf('/apps/supjav_plus/') >= 0, 'find_rule 未指向 supjav');
    assert.ok(entry.find_rule.indexOf('?v=' + moduleVersion) >= 0, 'find_rule 缺 ?v=');
    assert.ok(entry.search_url.indexOf('https://supjav.com/zh/?s=**') >= 0, 'search_url 不对: ' + entry.search_url);
    /* 统一基线版本：所有 ?v= 字面量（pages 与 core）都必须等于基线 */
    (source.match(/\?v=(\d+)/g) || []).forEach(function (lit) {
        assert.strictEqual(lit, '?v=' + moduleVersion, '?v= 字面量应统一为基线，出现 ' + lit);
    });
    assert.ok(source.indexOf('https://supermiee.github.io/hairu/apps/supjav_plus/supjav_plus_core.js?v=19') >= 0, '未引用内核');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
