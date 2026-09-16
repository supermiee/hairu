/*
 * MissAV+ 预览工具：node tools/preview_missav.js
 * 在 Node 桩里跑 missav_core + missav_plus_pages，把 setResult/setHomeResult 的卡片
 * 渲成近似海阔布局的 HTML（docs/dev/preview_missav.html），浏览器打开即可目检 UI。
 */
'use strict';
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var CORE = path.join(ROOT, 'docs', 'apps', 'missav', 'missav_core.js');
var PAGES = path.join(ROOT, 'docs', 'apps', 'missav_plus', 'missav_plus_pages.js');

var store = {};
global.getMyVar = function (k, d) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : (typeof d === 'undefined' ? null : d); };
global.putMyVar = function (k, v) { store[k] = v; };
global.clearMyVar = function (k) { delete store[k]; };
global.listMyVarKeys = function () { return Object.keys(store); };
global.getVar = global.getMyVar;
global.putVar = global.putMyVar;
global.storage0 = { getMyVar: global.getMyVar, putMyVar: global.putMyVar };
global.setPageTitle = function () {};
global.setPagePicUrl = function () {};
global.refreshPage = function () {};
global.back = function () {};
global.MY_PAGE = 1;
global.MY_URL = '';

function thumb(id, title, dur) {
    var parts = dur.split(':');
    return '<div class="thumbnail group">' +
        '<div class="relative aspect-w-16 aspect-h-9">' +
        '<a href="https://missav.ws/cn/' + id + '#uuid_desktop-home" alt="' + id + '">' +
        '<img data-src="https://picsum.photos/seed/' + id + '/300/170" src="https://picsum.photos/seed/' + id + '/300/170">' +
        '<span class="absolute bottom-1 right-1"><span x-text="h">' + parts[0] + '</span>:<span x-text="m">' + parts[1] + '</span>:<span x-text="s">' + parts[2] + '</span></span>' +
        '</a></div>' +
        '<div class="my-2 text-sm text-nord4 truncate"><a x-text="item.full_title" href="https://missav.ws/cn/' + id + '#uuid_desktop-home">' + title + '</a></div>' +
        '</div>';
}
var FIXTURE_LIST = '<html><head><meta property="og:title" content="最近更新"></head><body>' +
    thumb('snos-313', 'SNOS-313 被高薪招聘骗去72小时的巨乳正妹 五日市芽依', '3:02:13') +
    thumb('mbdd-2134', 'MBDD-2134 讲道理洗脑NTR公开处刑 东条夏', '1:30:00') +
    thumb('sone-808', 'SONE-808 高洁的女卧底搜查官 竹内有纪', '2:03:20') +
    thumb('midv-101', 'MIDV-101 ドリームウーマンVol.101 逢泽美优', '3:05:14') +
    '<a rel="next" href="https://missav.ws/cn/new?page=2">下一页</a>共 120 条影片</body></html>';
var FIXTURE_DETAIL = '<html><head>' +
    '<meta property="og:title" content="SNOS-313 被高薪招聘骗去72小时的巨乳正妹 - 五日市芽依">' +
    '<meta property="og:description" content="公司社长有种特殊的性癖，他喜欢妻子被其他男人拥抱。本片讲述了一段错综复杂的职场关系。">' +
    '<meta property="og:image" content="https://picsum.photos/seed/snos-313/800/450">' +
    '<meta property="og:video:release_date" content="2026-09-04">' +
    '<meta property="og:video:duration" content="10933">' +
    '</head><body>' +
    '<div class="text-secondary"><span>番号:</span><span>SNOS-313</span></div>' +
    '<div class="text-secondary"><span>女优:</span><a href="/dm20/cn/actresses/seito">濑户环奈</a><a href="/dm21/cn/actresses/mio">五日市芽依</a></div>' +
    '<div class="text-secondary"><span>类型:</span><a href="/dm218/cn/genres/meiru">美乳</a><a href="/dm1303/cn/genres/koukou">口交</a><a href="/dm1/cn/genres/ntr">NTR</a></div>' +
    '<div class="text-secondary"><span>发行商:</span><a href="/cn/makers/s1">S1</a></div>' +
    '<div class="text-secondary"><span>导演:</span><a href="/cn/directors/tiger">タイガー小堺</a></div>' +
    '<script>source720 = "https:\\/\\/surrit.com\\/uuid\\/720p\\/video.m3u8\\";source1080 = "https:\\/\\/surrit.com\\/uuid\\/1080p\\/video.m3u8\\";</script>' +
    '</body></html>';
var FIXTURE_ACTRESSES = '<html><body>' +
    '<a href="https://missav.ws/dm20/cn/actresses/seito" class="text-nord13">濑户环奈</a><a href="https://missav.ws/dm20/cn/actresses/seito">128 条影片</a>' +
    '<a href="https://missav.ws/dm33/cn/actresses/sakura" class="text-nord13">樱空桃</a><a href="https://missav.ws/dm33/cn/actresses/sakura">90 条影片</a>' +
    '<a href="https://missav.ws/dm44/cn/actresses/yui" class="text-nord13">架乃由罗</a><a href="https://missav.ws/dm44/cn/actresses/yui">64 条影片</a></body></html>';
var FIXTURE_GENRES = '<html><body>' +
    '<a href="https://missav.ws/dm156/cn/genres/%E5%B7%A8%E4%B9%B3" class="text-nord13">巨乳</a><a href="https://missav.ws/dm156/cn/genres/%E5%B7%A8%E4%B9%B3">181661 条影片</a>' +
    '<a href="https://missav.ws/dm133/cn/genres/%E4%B8%AD%E5%87%BA" class="text-nord13">中出</a><a href="https://missav.ws/dm133/cn/genres/%E4%B8%AD%E5%87%BA">221520 条影片</a>' +
    '<a href="https://missav.ws/dm122/cn/genres/%E5%8D%95%E4%BD%93" class="text-nord13">单体作品</a><a href="https://missav.ws/dm122/cn/genres/%E5%8D%95%E4%BD%93">214413 条影片</a></body></html>';

var core = require(CORE);
global.$ = function (url) {
    return {
        rule: function (cb, params) { return JSON.stringify({ kind: 'rule', url: url, params: params }); },
        lazyRule: function (cb, params) { return JSON.stringify({ kind: 'lazy', url: url, params: params }); }
    };
};
global.$.require = function (p) { return String(p).indexOf('missav_core') >= 0 ? core : pages; };
global.$.toString = function (fn) { return '(' + fn.toString() + ')'; };
global.requirejs = function (u) { return String(u).indexOf('missav_core') >= 0 ? core : pages; };
global.fetchPC = function (url) {
    url = String(url);
    if (/snos-313/.test(url)) return JSON.stringify({ body: FIXTURE_DETAIL, statusCode: 200, headers: {} });
    if (/\/actresses/.test(url)) return JSON.stringify({ body: FIXTURE_ACTRESSES, statusCode: 200, headers: {} });
    if (/\/genres/.test(url)) return JSON.stringify({ body: FIXTURE_GENRES, statusCode: 200, headers: {} });
    return JSON.stringify({ body: FIXTURE_LIST, statusCode: 200, headers: {} });
};

var home = null, page = null;
global.setHomeResult = function (r) { home = r; };
global.setResult = function (r) { page = r; };

var pages = require(PAGES);

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

/* 卡片 → 近似海阔渲染 */
function renderCard(c) {
    var style = '';
    var bg = c.extra && c.extra.backgroundColor;
    if (bg) style += 'background:' + bg + ';color:#fff;';
    switch (c.col_type) {
        case 'movie_2':
            return '<div class="card movie2"><div class="thumbbox" style="background-image:url(' + (c.pic_url || '') + ')"><span>' + esc(c.desc || '') + '</span></div><h5>' + esc(c.title || '') + '</h5></div>';
        case 'pic_1':
        case 'pic_1_full':
            return '<div class="pic1"><div class="picbig" style="background-image:url(' + (c.pic_url || '') + ')"></div><h5>' + esc(c.title || '') + '</h5></div>';
        case 'long_text':
            return '<p class="long_text" style="font-size:' + ((c.extra && c.extra.textSize) || 16) + 'px">' + esc(c.title || '') + (c.desc ? '<small>' + esc(c.desc) + '</small>' : '') + '</p>';
        case 'rich_text':
            return '<div class="rich">' + (c.title || '') + '</div>';
        case 'text_1':
            return '<p class="click-able" style="background:' + (bg || 'transparent') + ';font-size:' + ((c.extra && c.extra.textSize) || 15) + 'px">' + esc(c.title || '') + (c.desc ? '<small>' + esc(c.desc) + '</small>' : '') + '</p>';
        case 'text_center_1':
            return '<p class="tc" style="background:' + (bg || 'transparent') + '">' + esc(c.title || '') + (c.desc ? '<small>' + esc(c.desc) + '</small>' : '') + '</p>';
        case 'flex_button':
            return '<button class="chip">' + esc(String(c.title || '').replace(/^\u201C\u201C\u201D\u201D/, '')) + '</button>';
        case 'scroll_button':
            return '<button class="tab' + (bg ? ' tab-active' : '') + '">' + esc(String(c.title || '').replace(/^\u201C\u201C\u201D\u201D/, '')) + '</button>';
        case 'input':
            return '<div class="inputbox"><input placeholder="' + esc(c.desc || '') + '"><button>' + esc(c.title || '搜索') + '</button></div>';
        case 'blank_block': return '<hr class="b">';
        case 'text_2':
            return '<button class="tile">' + esc(String(c.title || '').replace(/\n/g, ' ')) + (c.desc ? '<small>' + esc(c.desc) + '</small>' : '') + '</button>';
        case 'x5_webview_single':
            return '<div class="webview">内嵌验证网页：' + esc(c.url || '') + '</div>';
        default:
            return '<!-- unknown ' + esc(c.col_type) + ' -->';
    }
}

/* scroll_button/flex_button 会被海阔聚合渲染，这里按连续分组包一层横向条 */
function agg(cards) {
    var out = [], buf = [], type = null;
    function flush() {
        if (!buf.length) return;
        out.push('<div class="' + type + '-strip">' + buf.join('') + '</div>');
        buf = []; type = null;
    }
    cards.forEach(function (c) {
        var col = c.col_type;
        if (col === 'movie_2' || col === 'flex_button' || col === 'scroll_button' || col === 'text_2') {
            if (buf.length && type !== col) { out.push('<div class="' + type + '-strip">' + buf.join('') + '</div>'); buf = []; }
            type = buf.length ? type : col; buf.push(renderCard(c));
            if (buf.length >= 2 && type === 'movie_2') { out.push('<div class="movie_2-strip">' + buf.join('') + '</div>'); buf = []; }
        } else { flush(); out.push(renderCard(c)); }
    });
    flush();
    return out.join('\n');
}

function block(cards, name) {
    if (!cards) return '';
    return '<div class="screen"><div class="bar"><b>' + name + '</b></div>' + agg(cards) + '</div>';
}

store['msp.tab'] = '0'; pages.renderHome();
var homeCards = JSON.parse(JSON.stringify(home));
store['msp.tab'] = '3'; pages.renderHome();
var hotCards = JSON.parse(JSON.stringify(home));
store['msp.tab'] = '4'; pages.renderHome();
var actressesCards = JSON.parse(JSON.stringify(home));
store['msp.tab'] = '6'; pages.renderHome();
var mineCards = JSON.parse(JSON.stringify(home));
pages.renderRouter({ name: 'renderDetail', params: { url: 'https://missav.ws/cn/snos-313', title: 'x' } });
var detail = JSON.parse(JSON.stringify(page));
store['msp.tab'] = '0';

var html = '<!doctype html><meta charset="utf-8"><title>MissAV+ 预览</title><style>' +
    'body{font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei";margin:0;background:#151515;color:#ddd}' +
    '.screen{max-width:420px;margin:10px auto;padding:12px;background:#1b1b1b;border-radius:12px}' +
    '.bar{font-size:12px;color:#888;border-bottom:1px solid #333;margin-bottom:8px;padding-bottom:4px}' +
    '.scroll_button-strip{display:flex;gap:6px;overflow-x:auto;padding:6px 0}' +
    '.flex_button-strip{display:flex;flex-wrap:wrap;gap:6px;padding:4px 0}' +
    'button,button.tab{flex:0 0 auto;padding:4px 10px;border-radius:16px;border:1px solid #444;background:transparent;color:inherit;font-size:13px}' +
    '.tab-active{background:#E91E63;border-color:#E91E63}' +
    '.movie_2-strip{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:4px 0}' +
    '.text_2-strip{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:4px 0}' +
    '.card.movie2 .thumbbox{position:relative;padding-top:56%;background:#333;border-radius:6px;background-size:cover;background-position:center}' +
    '.card.movie2 .thumbbox span{position:absolute;right:4px;bottom:4px;background:rgba(0,0,0,.6);border-radius:4px;padding:0 4px;font-size:11px}' +
    '.card.movie2 h5{margin:4px 0 0;font-size:13px;font-weight:400;-webkit-line-clamp:2;display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden}' +
    '.pic1 .picbig{padding-top:56%;background:#333;border-radius:8px;background-size:cover}' +
    '.pic1 h5{font-size:15px;margin:6px 0}' +
    'p.click-able{padding:8px 4px;border-bottom:1px solid #2a2a2a;margin:0;font-size:15px}' +
    'p.tc{margin:6px 0;text-align:center;padding:8px;border-radius:6px}' +
    'small{display:block;color:#888;font-size:12px}' +
    '.chip{background:#2c2c2c;color:#eee;font-size:12px}' +
    '.tile{text-align:left;font-size:13px;line-height:1.4}' +
    '.inputbox{display:flex;gap:6px;padding:8px 0}.inputbox input{flex:1;background:#2a2a2a;border:0;border-radius:8px;color:#ddd;padding:8px}.inputbox button{border:0;background:#E91E63;color:#fff;border-radius:8px}' +
    '.b{border:0;border-top:1px solid transparent;margin:8px 0}' +
    '.webview{padding:20px;text-align:center;background:#222;border:1px dashed #555;border-radius:8px;font-size:12px;color:#999}' +
    '.rich{font-size:14px;line-height:1.5;color:#bbb;padding:4px 0}' +
    '</style>' +
    block(homeCards, 'renderHome（首页 tab）') +
    block(hotCards, 'renderHome（热门 tab）') +
    block(actressesCards, 'renderHome（女优 tab）') +
    block(mineCards, 'renderHome（我的 tab）') +
    block(detail, '详情页');

var out = path.join(ROOT, 'docs', 'dev', 'preview_missav.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('preview:', homeCards ? homeCards.length + ' home cards, ' + detail.length + ' detail cards' : 'EMPTY');
console.log('open https://supermiee.github.io/hairu/dev/preview_missav.html after push');
