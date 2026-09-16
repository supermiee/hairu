/*
 * Jable+ 预览工具：node tools/preview.js
 * 在 Node 桩里跑 jable_redesign_pages/g），把 setResult/setHomeResult 的卡片
 * 渲染成近似海阔布局的 HTML（/tmp/opencode/jable_preview.html），浏览器打开即可目检 UI。
 */
'use strict';
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var CORE = path.join(ROOT, 'docs', 'apps', 'jable', 'jable_core.js');
var PAGES = path.join(ROOT, 'docs', 'apps', 'jable_redesign', 'jable_redesign_pages.js');

var store = {};
global.getMyVar = function (k, d) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : (typeof d === 'undefined' ? null : d); };
global.putMyVar = function (k, v) { store[k] = v; };
global.clearMyVar = function (k) { delete store[k]; };
global.listMyVarKeys = function () { return Object.keys(store); };
global.getVar = global.getMyVar;
global.putVar = global.putMyVar;
global.storage0 = { getMyVar: global.getMyVar, putMyVar: global.putMyVar };
global.pdfa = function (html, selector) {
    if (!/video-img-box/.test(selector)) return [];
    return String(html).match(/<div class="video-img-box"[\s\S]*?(?=<div class="video-img-box"|$)/g) || [];
};
global.pdfh = function (html, selector) {
    var m = /^([a-z0-9_.-]+)&&([a-zA-Z-]+)$/i.exec(String(selector));
    if (!m) return '';
    var tag = /^([a-z][a-z0-9]*)(?:\.([a-z0-9-]+))?$/i.exec(m[1]);
    if (!tag) return '';
    var open = '<' + tag[1] + '\\b' + (tag[2] ? '[^>]*class\\s*=\\s*"[^"]*\\b' + tag[2] + '\\b[^"]*"' : '[^>]*') + '[^>]*>';
    if (/^text$/i.test(m[2])) {
        var b = new RegExp(open + '([\\s\\S]*?)</' + tag[1] + '>', 'i').exec(String(html));
        return b ? b[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '';
    }
    var el = new RegExp(open, 'i').exec(String(html));
    if (!el) return '';
    var av = new RegExp('\\s' + m[2] + '\\s*=\\s*["\']([^"\']*)["\']', 'i').exec(el[0]);
    return av ? av[1] : '';
};
global.setPageTitle = function () {};
global.setPagePicUrl = function () {};
global.refreshPage = function () {};
global.back = function () {};
global.MY_PAGE = 1;
global.MY_URL = '';

function watchCard(id, title, dur) {
    return '<div class="video-img-box"><a href="https://jable.tv/videos/' + id + '/"><img data-src="https://picsum.photos/seed/' + id + '/300/170"></a>' +
        '<h6><a href="https://jable.tv/videos/' + id + '/">' + title + '</a></h6>' +
        '<span class="label">' + (dur || '1:23:45') + '</span></div>';
}
var FIXTURE_LIST = '<html><meta property="og:title" content="列表">' + watchCard('ABC-001', 'ABC-001 被高薪招聘騙去72小時的巨乳正妹 五日市芽依') +
    watchCard('ABC-002', 'ABC-002 講道理洗腦NTR公開處刑 東條夏', '2:14:04') +
    watchCard('ABC-003', 'ABC-003 高潔的女臥底搜查官 竹内有紀', '2:03:20') +
    watchCard('ABC-004', 'ABC-004 ドリームウーマンVol.101 逢澤美優', '3:05:14') + '共 120 部影片</html>';
var FIXTURE_DETAIL = '<html><meta property="og:title" content="ABC-001 被高薪招聘騙去72小時的巨乳正妹 五日市芽依">' +
    '<meta property="og:image" content="https://picsum.photos/seed/abc-001/800/450"><body>' +
    '<section class="video-info"><h4>標題</h4>' +
    '<div class="models"><a href="https://jable.tv/models/abc123/"><span data-original-title="三上悠亜">三</span></a></div>' +
    '<span class="incolor">上市於 2026-09-15</span>' +
    '<div class="my-3"><button class="btn btn-action fav"><span class="count">233</span></button></div>' +
    '<h5 class="tags"><a href="https://jable.tv/categories/chinese-subtitle/">中文字幕</a><a href="https://jable.tv/tags/big-tits/">巨乳</a><a href="https://jable.tv/tags/creampie/">中出</a></h5>' +
    '</section><script>var hlsUrl="https:\\/\\/cdn.example.com\\/abc-001.m3u8";</script></body></html>';
var FIXTURE_MODELS = '<html><body>' +
    '<a href="https://jable.tv/models/abc123/"><h6 class="title">三上悠亜</h6><span>128 部影片</span></a>' +
    '<a href="https://jable.tv/models/def456/"><h6 class="title">桃乃木かな</h6><span>90 部影片</span></a>' +
    '<a href="https://jable.tv/models/ghi789/"><h6 class="title">楓カレン</h6><span>64 部影片</span></a></body></html>';

var core = require(CORE);
global.$ = function (url) {
    return {
        rule: function (cb, params) { return JSON.stringify({ kind: 'rule', url: url, params: params }); },
        lazyRule: function (cb, params) { return JSON.stringify({ kind: 'lazy', url: url, params: params }); }
    };
};
global.$.require = function (p) { return String(p).indexOf('jable_core') >= 0 ? core : pages; };
global.$.toString = function (fn) { return '(' + fn.toString() + ')'; };
global.requirejs = function (u) { return String(u).indexOf('jable_core') >= 0 ? core : pages; };
global.fetchPC = function (url) {
    url = String(url);
    if (/\/videos\//.test(url)) return JSON.stringify({ body: FIXTURE_DETAIL, statusCode: 200, headers: {} });
    if (/\/models\//.test(url)) return JSON.stringify({ body: FIXTURE_MODELS, statusCode: 200, headers: {} });
    if (/\/categories\//.test(url)) return JSON.stringify({ body: '<html><h2>背景</h2><a href="/categories/pov/">男友視角</a><a href="/categories/bdsm/">主奴調教</a></html>', statusCode: 200, headers: {} });
    return JSON.stringify({ body: FIXTURE_LIST, statusCode: 200, headers: {} });
};

var PAGES_URL_LIT = 'https://supermiee.github.io/hairu/apps/jable_redesign/jable_redesign_pages.js?v=1';
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
            return '<p class="click-able" style="background:' + (bg || 'transparent') + '">' + esc(c.title || '') + (c.desc ? '<small>' + esc(c.desc) + '</small>' : '') + '</p>';
        case 'text_center_1':
            return '<p class=" tc" style="background:' + (bg || 'transparent') + '">' + esc(c.title || '') + (c.desc ? '<small>' + esc(c.desc) + '</small>' : '') + '</p>';
        case 'flex_button':
            return '<button class="chip">' + esc(String(c.title || '').replace(/^\u201C\u201C\u201D\u201D/, '')) + '</button>';
        case 'scroll_button':
            return '<button class="tab' + (bg ? ' tab-active' : '') + '">' + esc(String(c.title || '').replace(/^\u201C\u201C\u201D\u201D/, '')) + '</button>';
        case 'input':
            return '<div class="inputbox"><input placeholder="' + esc(c.desc || '') + '"><button>' + esc(c.title || '搜索') + '</button></div>';
        case 'blank_block': return '<hr class="b">';
        case 'text_2':
            return '<button class="tile">' + esc(String(c.title || '').replace(/\n/g, ' ')) + (c.desc ? '<small>' + esc(c.desc) + '</small>' : '') + '</button>';
        case 'pic_card': return '<div class="pc">card_pic_1</div>';
        case 'long_text_head': return '';
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

pages.renderHome();
var homeCards = JSON.parse(JSON.stringify(home));
store['jbp.tab'] = '5'; pages.renderHome();
var modelsHome = home; store['jbp.tab'] = '0';
store['jbp.tab'] = '0';
pages.renderRouter({ name: 'renderDetail', params: { url: 'https://jable.tv/videos/abc-001/', title: 'x' } });
var detail = page;

var html = '<!doctype html><meta charset="utf-8"><title>Jable+ 预览</title><style>' +
    'body{font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei";margin:0;background:#151515;color:#ddd}' +
    '.screen{max-width:420px;margin:10px auto;padding:12px;background:#1b1b1b;border-radius:12px}' +
    '.bar{font-size:12px;color:#888;border-bottom:1px solid #333;margin-bottom:8px;padding-bottom:4px}' +
    '.scroll_button-strip{display:flex;gap:6px;overflow-x:auto;padding:6px 0}' +
    '.flex_button-strip{display:flex;flex-wrap:wrap;gap:6px;padding:4px 0}' +
    'button,button.tab{flex:0 0 auto;padding:4px 10px;border-radius:16px;border:1px solid #444;background:transparent;color:inherit;font-size:13px}' +
    '.tab-active{background:#E91E63;border-color:#E91E63}' +
    '.movie2-strip,.movie2s,.movie_2-strip{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:4px 0}' +
    '.text_2-strip{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:4px 0}' +
    '.card.movie2 .thumbbox{position:relative;padding-top:56%;background:#333;border-radius:6px;background-size:cover;background-position:center}' +
    '.card.movie2 .thumbbox span{position:absolute;right:4px;bottom:4px;background:rgba(0,0,0,.6);border-radius:4px;padding:0 4px;font-size:11px}' +
    '.card.movie2 h5{margin:4px 0 0;font-size:13px;font-weight:400;-webkit-line-clamp:2;display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden}' +
    '.pic1 .picbig{padding-top:56%;background:#333 border-radius:8px;background-size:cover}' +
    '.pic1 h5{font-size:15px;margin:6px 0}' +
    'p.click-able{padding:8px 4px;border-bottom:1px solid #2a2a2a;margin:0;font-size:15px}' +
    'p.tc{margin:6px 0;text-align:center;padding:8px;border-radius:6px}' +
    'small{display:block;color:#888;font-size:12px}' +
    '.chip{background:#2c2c2c;color:#eee;font-size:12px}' +
    '.inputbox{display:flex;gap:6px;padding:8px 0}.inputbox input{flex:1;background:#2a2a2a;border:0;border-radius:8px;color:#ddd;padding:8px}.inputbox button{border:0;background:#E91E63;color:#fff;border-radius:8px}' +
    '.b{border:0;border-top:1px solid transparent;margin:8px 0}' +
    '.movie2s{display:grid;grid-gap:10px}' +
    '</style>' +
    block(homeCards, 'renderHome（首頁 tab）') +
    block(modelsHome, 'renderHome（女優 tab）') +
    block(detail, '详情页');

fs.mkdirSync('/tmp/opencode', { recursive: true });
var out = path.join(ROOT, 'docs', 'dev', 'preview.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);;
console.log('preview:', home ? home.length + ' home cards, ' + detail.length + ' detail cards' : 'EMPTY');
console.log('open https://supermiee.github.io/hairu/dev/preview.html after push');
