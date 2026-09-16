/*
 * AV01 预览工具：node tools/preview_av01.js
 * 在 Node 桩里跑 av01_core + av01_pages，把 setResult/setHomeResult 的卡片
 * 渲成近似海阔布局的 HTML（docs/dev/preview_av01.html），浏览器打开即可目检 UI。
 */
'use strict';
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var CORE = path.join(ROOT, 'docs', 'apps', 'av01', 'av01_core.js');
var PAGES = path.join(ROOT, 'docs', 'apps', 'av01', 'av01_pages.js');
var FIX = path.join(ROOT, 'test', 'fixtures');

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

function readJson(n) { return JSON.parse(fs.readFileSync(path.join(FIX, n), 'utf8')); }
var FIXTURE_HOME = readJson('av01_home.json');
var FIXTURE_LATEST = readJson('av01_latest.json');
var FIXTURE_HOTTEST = readJson('av01_hottest.json');
var FIXTURE_DETAIL = readJson('av01_detail.json');
var FIXTURE_SIMILARS = readJson('av01_similars.json');
var FIXTURE_ACTRESSES = readJson('av01_actresses.json');
var FIXTURE_MAKERS = readJson('av01_makers.json');
var FIXTURE_TAGS = readJson('av01_tags.json');
var FIXTURE_ACTRESS_VIDEOS = readJson('av01_actress_videos.json');
var FIXTURE_GEO = readJson('av01_geo.json');
var FIXTURE_MASTER = fs.readFileSync(path.join(FIX, 'av01_master.m3u8'), 'utf8');

var core = require(CORE);
var pages;
global.$ = function (url) {
    return {
        rule: function (cb, params) { return JSON.stringify({ kind: 'rule', url: url, params: params }); },
        lazyRule: function (cb, params) { return JSON.stringify({ kind: 'lazy', url: url, params: params }); }
    };
};
global.$.require = function (p) { return String(p).indexOf('av01_core') >= 0 ? core : pages; };
global.$.toString = function (fn) { return '(' + fn.toString() + ')'; };
global.requirejs = function (u) { return String(u).indexOf('av01_core') >= 0 ? core : pages; };
function wrap(payload) { return JSON.stringify({ body: typeof payload === 'string' ? payload : JSON.stringify(payload), statusCode: 200, headers: {} }); }
global.fetchPC = function (url) {
    url = String(url);
    if (/edge\/geo\.js/.test(url)) return wrap(FIXTURE_GEO);
    if (/cdn-access/.test(url)) return wrap({ access_token: 'PREVIEW.TOKEN', expires_at: 1900000000 });
    if (/manifest\/master\.m3u8/.test(url)) return wrap(FIXTURE_MASTER);
    if (/videos\/types\/combined/.test(url)) return wrap(FIXTURE_HOME);
    if (/videos\/types\/latest/.test(url)) return wrap(FIXTURE_LATEST);
    if (/videos\/types\/hottest/.test(url)) return wrap(FIXTURE_HOTTEST);
    if (/videos\/actress\/45/.test(url)) return wrap(FIXTURE_ACTRESS_VIDEOS);
    if (/videos\/219346\/similars/.test(url)) return wrap(FIXTURE_SIMILARS);
    if (/videos\/219346/.test(url)) return wrap(FIXTURE_DETAIL);
    if (/actresses\/by-score/.test(url)) return wrap(FIXTURE_ACTRESSES);
    if (/makers\/by-score/.test(url)) return wrap(FIXTURE_MAKERS);
    if (/tags\/by-score/.test(url)) return wrap(FIXTURE_TAGS);
    return wrap({});
};

var home = null, page = null;
global.setHomeResult = function (r) { home = r; };
global.setResult = function (r) { page = r; };

pages = require(PAGES);

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
/* 预览里图片换成本地示意图，避免生产 CDN 防盗链/加载慢 */
function previewImage(url) {
    var key = String(url || '').replace(/[^A-Za-z0-9]/g, '').slice(-16) || 'x';
    return url ? 'https://picsum.photos/seed/' + key + '/320/216' : '';
}
function mapCards(cards) { return (cards || []).map(function (c) { var copy = {}; for (var k in c) copy[k] = c[k]; if (copy.pic_url) copy.pic_url = previewImage(copy.pic_url); return copy; }); }
function clone(cards) { return mapCards(JSON.parse(JSON.stringify(cards || []))); }

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
            return '<div class="rich">' + esc(c.title || '') + '</div>';
        case 'text_1':
            return '<p class="click-able" style="background:' + (bg || 'transparent') + ';font-size:' + ((c.extra && c.extra.textSize) || 15) + 'px">' + esc(c.title || '') + (c.desc ? '<small>' + esc(c.desc) + '</small>' : '') + '</p>';
        case 'text_center_1':
            return '<p class="tc" style="background:' + (bg || 'transparent') + ';font-size:' + ((c.extra && c.extra.textSize) || 14) + 'px">' + esc(c.title || '') + (c.desc ? '<small>' + esc(c.desc) + '</small>' : '') + '</p>';
        case 'flex_button':
            return '<button class="chip"' + (bg ? ' style="background:' + bg + ';color:#fff"' : '') + '>' + esc(String(c.title || '').replace(/^\u201C\u201C\u201D\u201D/, '')) + '</button>';
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

store['av01.tab'] = '0'; pages.renderHome();
var homeCards = clone(home);
store['av01.tab'] = '1'; pages.renderHome();
var latestCards = clone(home);
store['av01.tab'] = '3'; pages.renderHome();
var actressCards = clone(home);
store['av01.tab'] = '5'; pages.renderHome();
var tagCards = clone(home);
store['av01.tab'] = '6'; pages.renderHome();
var mineCards = clone(home);
global.MY_URL = 'hiker://empty#https://www.av01.media/cn/videos/latest?page=1[firstPage=https://www.av01.media/cn/videos/latest]';
pages.renderList({ url: 'https://www.av01.media/cn/videos/latest', title: '最近更新' });
var listPage = clone(page);
global.MY_URL = 'hiker://empty#https://www.av01.media/cn/actresses?page=1[firstPage=https://www.av01.media/cn/actresses]';
pages.renderList({ url: 'https://www.av01.media/cn/actresses', title: '女优' });
var dirPage = clone(page);
global.MY_URL = '';
pages.renderRouter({ name: 'renderDetail', params: { url: 'https://www.av01.media/cn/video/219346/mird-281-lada', title: 'x' } });
var detail = clone(page);
store['av01.tab'] = '0';

var html = '<!doctype html><meta charset="utf-8"><title>AV01 预览</title><style>' +
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
    '.card.movie2 h5{margin:4px 0 0;font-size:13px;font-weight:400;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
    '.pic1 .picbig{padding-top:56%;background:#333;border-radius:8px;background-size:cover}' +
    '.pic1 h5{font-size:15px;margin:6px 0}' +
    'p.click-able{padding:8px 4px;border-bottom:1px solid #2a2a2a;margin:0;font-size:15px}' +
    'p.tc{margin:6px 0;text-align:center;padding:8px;border-radius:6px}' +
    'p.long_text small{font-size:12px}' +
    'small{display:block;color:#888;font-size:12px}' +
    '.chip{background:#2c2c2c;color:#eee;font-size:12px}' +
    '.tile{text-align:left;font-size:13px;line-height:1.4}' +
    '.inputbox{display:flex;gap:6px;padding:8px 0}.inputbox input{flex:1;background:#2a2a2a;border:0;border-radius:8px;color:#ddd;padding:8px}.inputbox button{border:0;background:#E91E63;color:#fff;border-radius:8px}' +
    '.b{border:0;border-top:1px solid transparent;margin:8px 0}' +
    '.webview{padding:20px;text-align:center;background:#222;border:1px dashed #555;border-radius:8px;font-size:12px;color:#999}' +
    '.rich{font-size:14px;line-height:1.5;color:#bbb;padding:4px 0}' +
    '</style>' +
    block(homeCards, 'renderHome（首页 tab）') +
    block(latestCards, 'renderHome（最近更新 tab）') +
    block(actressCards, 'renderHome（女优 tab）') +
    block(tagCards, 'renderHome（分类 tab）') +
    block(mineCards, 'renderHome（我的 tab）') +
    block(listPage, 'renderList（最近更新列表页）') +
    block(dirPage, 'renderList（女优目录页）') +
    block(detail, '详情页');

var out = path.join(ROOT, 'docs', 'dev', 'preview_av01.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('preview:', homeCards.length + ' home cards, ' + detail.length + ' detail cards');
console.log('open https://supermiee.github.io/hairu/dev/preview_av01.html after push');
