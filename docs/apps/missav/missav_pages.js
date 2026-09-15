/* MissAV 页面层（重构版）。订阅只加载本模块；内核按 ?v= 同步版本。 */
(function () {
    var MODULE_VERSION = '4';
    var PUBLISH_BASE = 'https://supermiee.github.io/hairu/';
    var CORE_PATH = 'hiker://files/rules/missav/missav_core.js';
    var PAGES_PATH = 'hiker://files/rules/missav/missav_pages.js';
    var CORE_URL = PUBLISH_BASE + 'apps/missav/missav_core.js?v=' + MODULE_VERSION;
    var PAGES_URL = PUBLISH_BASE + 'apps/missav/missav_pages.js?v=' + MODULE_VERSION;

    /* 规则回调里 requirejs 不保证存在，失败时用 $.require 拉同一个远程模块 */
    function remoteModule(url) {
        try { return requirejs(url); } catch (ignore) { return $.require(url); }
    }
    function core() { return remoteModule(CORE_URL); }

    function state(key, fallback) {
        try { var value = getMyVar('missav.ui.' + key, null); return (value === null || typeof value === 'undefined' || value === '') ? fallback : value; } catch (ignore) { return fallback; }
    }
    function intState(key, fallback) {
        var value = parseInt(state(key, fallback), 10);
        return isNaN(value) ? fallback : value;
    }
    function setStateButton(key, value) {
        return $('hiker://empty#noLoading#').lazyRule(function (stateKey, stateValue) {
            try { putMyVar(stateKey, String(stateValue)); } catch (ignore) {}
            refreshPage(true);
            return 'hiker://empty';
        }, 'missav.ui.' + key, value);
    }

    var SITE = 'https://missav.ws';
    var HOME_TABS = [
        { title: '最近更新', kind: 'list', url: SITE + '/cn/new' },
        { title: '新作上市', kind: 'list', url: SITE + '/cn/release' },
        { title: '本週热门', kind: 'list', url: SITE + '/cn/weekly-hot' },
        { title: '中文字幕', kind: 'list', url: SITE + '/cn/chinese-subtitle' },
        { title: '女優', kind: 'actresses', url: SITE + '/cn/actresses' },
        { title: '類型', kind: 'genres', url: SITE + '/cn/genres' }
    ];

    /* ---------- URL / 路由 ---------- */
    function addQuery(url, query) {
        var pair = String(url || '').split('?');
        var path = pair.shift();
        var rest = pair.join('?');
        if (query) rest = rest ? (rest + '&' + query) : query;
        return rest ? (path + '?' + rest) : path;
    }
    function pagedSource(url) { return addQuery(url, 'page=fypage') + '[firstPage=' + url + ']'; }
    function searchUrl(keyword) { return SITE + '/cn/search/' + encodeURIComponent(String(keyword || '').trim()); }
    function listRouteBySource(pageSource, params) {
        return $('hiker://empty#' + pageSource).rule(function (payload) {
            var source = String(MY_URL || '').split('#')[1] || payload.url;
            source = source.split('@rule=')[0];
            try { requirejs('https://supermiee.github.io/hairu/apps/missav/missav_pages.js?v=4').renderList({ url: source, title: payload.title, searchKeyword: payload.searchKeyword }); }
            catch (ignore) { $.require('https://supermiee.github.io/hairu/apps/missav/missav_pages.js?v=4').renderList({ url: source, title: payload.title, searchKeyword: payload.searchKeyword }); }
        }, params);
    }
    function routeList(url, title) {
        return listRouteBySource(pagedSource(url), { url: url, title: title || '影片列表' });
    }
    function routeSearch(keyword) {
        return listRouteBySource(pagedSource(searchUrl(keyword)), { url: searchUrl(keyword), title: '搜索：' + keyword, searchKeyword: keyword });
    }
    function routeDirectory(kind, url, title) {
        return $('hiker://empty#' + pagedSource(url)).rule(function (payload) {
            var source = String(MY_URL || '').split('#')[1] || payload.url;
            source = source.split('@rule=')[0];
            try { requirejs('https://supermiee.github.io/hairu/apps/missav/missav_pages.js?v=4').renderDirectory({ url: source, title: payload.title, kind: payload.kind }); }
            catch (ignore) { $.require('https://supermiee.github.io/hairu/apps/missav/missav_pages.js?v=4').renderDirectory({ url: source, title: payload.title, kind: payload.kind }); }
        }, { url: url, title: title || '目录', kind: kind });
    }
    function routeDetail(item) {
        return $('hiker://empty').rule(function (payload) {
            try { requirejs('https://supermiee.github.io/hairu/apps/missav/missav_pages.js?v=4').renderDetail(payload); }
            catch (ignore) { $.require('https://supermiee.github.io/hairu/apps/missav/missav_pages.js?v=4').renderDetail(payload); }
        }, { url: item.url, title: item.title || '', image: item.image || '' });
    }
    function routePage(name, title) {
        return $('hiker://empty').rule(function (payload) {
            try { requirejs('https://supermiee.github.io/hairu/apps/missav/missav_pages.js?v=4')[payload.name](); }
            catch (ignore) { $.require('https://supermiee.github.io/hairu/apps/missav/missav_pages.js?v=4')[payload.name](); }
        }, { name: name, title: title || '' });
    }
    function routeVerification() {
        return $('hiker://empty').rule(function () {
            try { requirejs('https://supermiee.github.io/hairu/apps/missav/missav_pages.js?v=4').renderVerification(); }
            catch (ignore) { $.require('https://supermiee.github.io/hairu/apps/missav/missav_pages.js?v=4').renderVerification(); }
        }, {});
    }

    /* ---------- 通用单元 ---------- */
    function randomColor() { return '#' + ('00000' + (Math.random() * 0x1000000 << 0).toString(16)).substr(-6); }
    /* Hiker 翻页会「追加」下一页，站点列表按时间排序时边界会漂移；用已见 URL 去重 */
    function dedupeAcrossPages(scopeKey, pageNumber, items) {
        var key = 'missav.ui.seen.' + scopeKey;
        var seen = [];
        try { seen = getMyVar(key, []) || []; } catch (ignoreSeen) { seen = []; }
        if (!(seen instanceof Array)) seen = [];
        if (pageNumber <= 1) seen = [];
        var map = {};
        for (var i = 0; i < seen.length; i++) map[seen[i]] = 1;
        var fresh = [];
        for (var j = 0; j < items.length; j++) {
            if (!items[j].url || map[items[j].url]) continue;
            map[items[j].url] = 1;
            seen.push(items[j].url);
            fresh.push(items[j]);
        }
        try { putMyVar(key, seen.slice(-800)); } catch (ignoreSave) {}
        return fresh;
    }
    function card(item) {
        var desc = [];
        if (item.duration) desc.push(item.duration);
        if (item.badge) desc.push(item.badge);
        return { title: item.title, pic_url: item.image || '', desc: desc.join('  ·  ') || '点击查看详情', url: routeDetail(item), col_type: 'movie_2', extra: { lineVisible: false } };
    }
    function section(result, title, items, moreUrl) {
        if (!items || !items.length) return;
        result.push({ title: title, col_type: 'long_text', extra: { textSize: 18, lineVisible: false } });
        for (var i = 0; i < items.length; i++) result.push(card(items[i]));
        if (moreUrl) result.push({ title: '查看全部 ›', url: moreUrl, col_type: 'text_center_1' });
    }
    function failure(error, url, retryRoute) {
        var message = (error && error.message) || '页面加载失败';
        var cards = [
            { title: message, desc: '可重试；若提示需要人机验证，请使用「验证并同步」。', col_type: 'text_center_1' },
            { title: '重试', url: retryRoute || routeList(url, '重试'), col_type: 'text_center_1' }
        ];
        if (error && /验证/.test(message)) cards.push({ title: '验证并同步', url: routeVerification(), col_type: 'text_center_1' });
        cards.push({ title: '打开原网页', url: 'web://' + url, col_type: 'text_center_1' });
        return cards;
    }
    /* 渲染出错时把原因显示出来，避免整页空白无法定位 */
    function renderError(label, error, params) {
        var message = String((error && error.message) || error || '未知错误');
        var cards = [{ title: label + '渲染失败', desc: message, col_type: 'text_center_1' }];
        if (params && params.url) cards.push({ title: '打开原网页', url: 'web://' + params.url, col_type: 'text_center_1' });
        return cards;
    }

    /* ---------- 首页 ---------- */
    function renderHome() {
        var app = core();
        var tabIndex = intState('homeTab', 0);
        if (tabIndex < 0 || tabIndex >= HOME_TABS.length) tabIndex = 0;
        var tab = HOME_TABS[tabIndex];

        var result = [];
        result.push({ title: 'MissAV', desc: '海闊視界 · 高清在線看', col_type: 'long_text', extra: { textSize: 20, lineVisible: false } });
        result.push({
            title: '搜索',
            desc: '輸入番號、女優名，可用 + 組合多個關鍵詞',
            url: "input ? (function(){ var pages; try { pages = requirejs('" + PAGES_URL + "'); } catch (ignore) { pages = $.require('" + PAGES_PATH + "'); } return pages.routeSearch(input); })() : 'toast://請輸入關鍵詞'",
            col_type: 'input',
            extra: { defaultValue: state('search', ''), onChange: "putMyVar('missav.ui.search', input)" }
        });
        for (var i = 0; i < HOME_TABS.length; i++) {
            result.push({
                title: i === tabIndex ? ('““””<font color="#FFFFFF">' + HOME_TABS[i].title + '</font>') : HOME_TABS[i].title,
                url: setStateButton('homeTab', i),
                col_type: 'scroll_button',
                extra: { backgroundColor: i === tabIndex ? '#16A085' : '' }
            });
        }

        if (tab.kind === 'list') {
            var data = app.fetchCached(tab.url, { marker: 'thumbnail' }, 300);
            if (!data.ok) { setHomeResult(failure(data.error, tab.url, routeList(tab.url, tab.title))); return; }
            var items = app.parseCards(data.html, data.url, 12);
            result.push({ title: tab.title, col_type: 'long_text', extra: { textSize: 18, lineVisible: false } });
            for (var c = 0; c < items.length; c++) result.push(card(items[c]));
            if (!items.length) result.push({ title: '未解析到影片，站点结构可能已变化。', url: 'web://' + tab.url, col_type: 'text_center_1' });
            result.push({ title: '查看全部 ›', url: routeList(tab.url, tab.title), col_type: 'text_center_1' });
        } else if (tab.kind === 'actresses' || tab.kind === 'genres') {
            var dir = app.fetchCached(tab.url, { marker: tab.kind === 'genres' ? '/genres/' : '/actresses/' }, 43200);
            if (!dir.ok) { setHomeResult(failure(dir.error, tab.url, routeDirectory(tab.kind, tab.url, tab.title))); return; }
            var entries = tab.kind === 'genres' ? app.parseGenres(dir.html, dir.url) : app.parseActresses(dir.html, dir.url);
            for (var g = 0; g < entries.length; g++) {
                result.push({ title: entries[g].title + (entries[g].count ? ('  ' + entries[g].count) : ''), url: routeList(entries[g].url, entries[g].title), col_type: 'flex_button', extra: { backgroundColor: randomColor() + '22' } });
            }
            if (!entries.length) result.push({ title: '未解析到目录', url: 'web://' + tab.url, col_type: 'text_center_1' });
            result.push({ title: '查看全部 ›', url: routeDirectory(tab.kind, tab.url, tab.title), col_type: 'text_center_1' });
        }

        result.push({ col_type: 'blank_block' });
        result.push({ title: '收藏', url: routePage('renderFavorites', '收藏'), col_type: 'scroll_button' });
        result.push({ title: '历史', url: routePage('renderHistory', '历史'), col_type: 'scroll_button' });
        result.push({ title: '设置', url: routePage('renderSettings', '设置'), col_type: 'scroll_button' });
        setHomeResult(result);
    }

    /* ---------- 列表 / 搜索 / 目录 ---------- */
    function renderList(params) {
        params = params || {};
        var app = core();
        var url = String(params.url || '');
        var page = app.fetchCached(url, { marker: 'thumbnail' }, 300);
        if (!page.ok) { setResult(failure(page.error, url, routeList(url, params.title))); return; }
        try { setPageTitle(params.title || '影片列表'); } catch (ignore) {}
        /* Hiker 翻页是把下一页结果“追加”到列表，第 2 页起不能再输出标题等非卡片项，否则会重复 */
        var pageNumber = 1;
        try { pageNumber = Number(MY_PAGE || 1); } catch (ignorePage) {}
        var result = [];
        var items = app.parseCards(page.html, page.url);
        items = dedupeAcrossPages(params.title || url, pageNumber, items);
        var count = app.parseCount(page.html);
        if (pageNumber <= 1) result.push({ title: params.title || '影片列表', desc: count ? (count + ' 部影片') : '', col_type: 'long_text', extra: { textSize: 19, lineVisible: false } });
        for (var i = 0; i < items.length; i++) result.push(card(items[i]));
        if (!items.length) result.push({ title: '未解析到影片，可能页面结构已变化或需要验证。', url: 'web://' + page.url, col_type: 'text_center_1' });
        setResult(result);
    }
    function renderSearch(url) {
        url = String(url || '');
        var keyword = '';
        try { var m = /\/search\/([^/?#]+)/.exec(url); if (m) keyword = decodeURIComponent(m[1]); } catch (ignore) {}
        if (!keyword) { try { keyword = getParam('keyword', ''); } catch (ignoreParam) {} }
        renderList({ url: url, title: keyword ? ('搜索：' + keyword) : '搜索' });
    }
    function renderDirectory(params) {
        params = params || {};
        var app = core();
        var url = String(params.url || '');
        var page = app.fetchCached(url, { marker: params.kind === 'genres' ? '/genres/' : '/actresses/' }, 43200);
        if (!page.ok) { setResult(failure(page.error, url, routeDirectory(params.kind, url, params.title))); return; }
        try { setPageTitle(params.title || '目录'); } catch (ignore) {}
        var entries = params.kind === 'genres' ? app.parseGenres(page.html, page.url) : app.parseActresses(page.html, page.url);
        var result = [{ title: params.title || '目录', col_type: 'long_text', extra: { textSize: 19, lineVisible: false } }];
        for (var i = 0; i < entries.length; i++) {
            result.push({ title: entries[i].title + (entries[i].count ? ('  ' + entries[i].count) : ''), url: routeList(entries[i].url, entries[i].title), col_type: 'flex_button', extra: { backgroundColor: randomColor() + '22' } });
        }
        if (!entries.length) result.push({ title: '未解析到目录', url: 'web://' + page.url, col_type: 'text_center_1' });
        setResult(result);
    }

    /* ---------- 详情 ---------- */
    function renderDetail(params) {
        params = params || {};
        try {
        var app = core();
        var page = app.fetchCached(params.url, { marker: 'og:title' }, 1800);
        if (!page.ok) { setResult(failure(page.error, params.url, routeDetail(params))); return; }
        var detail = app.parseDetail(page.html, page.url);
        app.addHistory({ title: detail.title || params.title, image: detail.image || params.image, url: params.url });
        try { setPageTitle(detail.title || params.title || '影片详情'); } catch (ignoreTitle) {}
        try { if (detail.image || params.image) setPagePicUrl(detail.image || params.image); } catch (ignoreImage) {}

        var result = [];
        if (detail.image || params.image) result.push({ pic_url: detail.image || params.image, col_type: 'pic_1_full', extra: { lineVisible: false } });
        result.push({ title: '““””' + (detail.title || params.title || '影片详情'), url: 'hiker://empty', col_type: 'text_1', extra: { lineVisible: false, longClick: [{ title: '打开原网页', js: $.toString(function () { return 'web://' + MY_URL; }) }] } });

        var meta = [];
        if (detail.code) meta.push('番号 ' + detail.code);
        if (detail.releaseDate) meta.push('发行 ' + detail.releaseDate);
        if (detail.duration) meta.push('时长 ' + detail.duration);
        if (meta.length) result.push({ title: meta.join('  ·  '), col_type: 'text_1', extra: { textSize: 13, lineVisible: false } });
        if (detail.description) result.push({ title: '剧情简介\n' + detail.description, col_type: 'rich_text', extra: { textSize: 15, lineSpacing: 6, lineVisible: false } });

        var streams = detail.qualities && detail.qualities.length ? detail.qualities : (detail.mediaUrl ? [{ url: detail.mediaUrl, quality: '默认' }] : []);
        if (streams.length) {
            var urls = [], names = [], headers = [];
            for (var s = 0; s < streams.length; s++) { urls.push(streams[s].url); names.push(streams[s].quality || ('线路' + (s + 1))); headers.push(app.playerHeaders(page)); }
            var preferred = app.getPlayQuality();
            result.push({ title: '▶ 播放' + (streams.length > 1 ? ('（' + streams.length + ' 条线路 · 默认 ' + (preferred === 'highest' ? '最高' : preferred + 'p') + '）') : ''), url: JSON.stringify({ urls: urls, names: names, headers: headers }), col_type: 'text_center_1', extra: { lineVisible: false, id: detail.url } });
        } else {
            result.push({ title: '▶ 網頁嗅探播放', desc: '未直接解析到媒體地址，將自動嗅探網頁中的視頻。', url: 'video://' + page.url + '#isVideo=true#', col_type: 'text_center_1', extra: { lineVisible: false } });
        }
        result.push({ title: app.isFavorite(detail.url) ? '★ 取消收藏' : '☆ 收藏', url: toggleRoute(detail), col_type: 'flex_button' });
        result.push({ title: '播放设置', url: routePage('renderPlaySettings', '播放设置'), col_type: 'flex_button' });
        result.push({ title: '打開原網頁', url: 'web://' + page.url, col_type: 'flex_button' });

        linkRow(result, '女優', detail.actors);
        linkRow(result, '類型', detail.genres);
        linkRow(result, '系列', detail.series);
        linkRow(result, '發行商', detail.makers);
        linkRow(result, '導演', detail.directors);
        linkRow(result, '標籤', detail.labels);
        if (detail.recommendations && detail.recommendations.length) section(result, '猜你喜歡', detail.recommendations);
        setResult(result);
        } catch (error) { setResult(renderError('详情', error, params)); }
    }
    function linkRow(result, title, links) {
        if (!links || !links.length) return;
        result.push({ title: title, col_type: 'long_text', extra: { textSize: 15, lineVisible: false } });
        for (var i = 0; i < links.length; i++) result.push({ title: links[i].title, url: routeList(links[i].url, links[i].title), col_type: 'flex_button', extra: { backgroundColor: randomColor() + '22' } });
    }
    function toggleRoute(item) {
        return $('hiker://empty').lazyRule(function (payload) {
            var app;
            try { app = requirejs('https://supermiee.github.io/hairu/apps/missav/missav_core.js?v=4'); }
            catch (ignore) { app = $.require('https://supermiee.github.io/hairu/apps/missav/missav_core.js?v=4'); }
            var added = app.toggleFavorite(payload);
            refreshPage(false);
            return 'toast://' + (added ? '已收藏' : '已取消收藏');
        }, { title: item.title, image: item.image || '', url: item.url });
    }

    /* ---------- 收藏 / 历史 / 设置 / 语言 / 诊断 ---------- */
    function renderFavorites() { renderLocalList('favorites', '收藏'); }
    function renderHistory() { renderLocalList('history', '觀看歷史'); }
    function renderLocalList(key, title) {
        var app = core();
        var items = app.readList(key);
        try { setPageTitle(title); } catch (ignore) {}
        var result = [{ title: title, col_type: 'long_text', extra: { textSize: 19, lineVisible: false } }];
        if (!items.length) result.push({ title: '暫無內容', col_type: 'text_center_1' });
        for (var i = 0; i < items.length; i++) result.push(card(items[i]));
        setResult(result);
    }
    function renderPlaySettings() {
        var app = core();
        try { setPageTitle('播放设置'); } catch (ignore) {}
        var selected = app.getPlayQuality();
        var options = [['highest', '最高可用'], ['1080', '1080p'], ['720', '720p'], ['540', '540p'], ['480', '480p'], ['360', '360p']];
        var result = [{ title: '播放设置', desc: '默认清晰度：' + (selected === 'highest' ? '最高可用' : selected + 'p') + '\n若源站不提供所选画质，将自动选择最接近的可用画质。', col_type: 'long_text', extra: { textSize: 17, lineVisible: false } }];
        for (var i = 0; i < options.length; i++) result.push({ title: (selected === options[i][0] ? '✓ ' : '') + options[i][1], url: $('hiker://empty').lazyRule(function (value) {
            var app; try { app = requirejs('https://supermiee.github.io/hairu/apps/missav/missav_core.js?v=4'); } catch (ignore) { app = $.require('https://supermiee.github.io/hairu/apps/missav/missav_core.js?v=4'); }
            app.setPlayQuality(value); refreshPage(false); return 'toast://已设置';
        }, options[i][0]), col_type: 'text_center_1' });
        setResult(result);
    }
    function renderSettings() {
        var app = core();
        try { setPageTitle('设置与诊断'); } catch (ignore) {}
        setResult([
            { title: '设置与诊断', desc: '版本 ' + app.config.version, col_type: 'long_text', extra: { textSize: 19, lineVisible: false } },
            { title: '播放设置：' + (app.getPlayQuality() === 'highest' ? '最高可用' : app.getPlayQuality() + 'p'), url: routePage('renderPlaySettings', '播放设置'), col_type: 'text_center_1' },
            { title: '清除缓存与本地数据', url: $('hiker://empty').lazyRule(function () {
                try { requirejs('https://supermiee.github.io/hairu/apps/missav/missav_core.js?v=4').clearPageCache(); } catch (ignore) { $.require('https://supermiee.github.io/hairu/apps/missav/missav_core.js?v=4').clearPageCache(); }
                return 'toast://已清除缓存';
            }), col_type: 'text_center_1' }
        ]);
    }

    /* ---------- 验证并同步（Cloudflare） ---------- */
    function renderVerification() {
        var app = core();
        var source = app.config.source + '/cn';
        try { setPageTitle('驗證並同步'); } catch (ignore) {}
        setResult([
            { title: '第一步：完成人機驗證', desc: '下方網頁打開後，勾選 Cloudflare 驗證即可。通過後按第二步返回——小程序會自動改用與該網頁同源的通道加載數據。', col_type: 'long_text', extra: { textSize: 16, lineVisible: false } },
            { title: '打開驗證網頁', url: source, desc: 'float&&screen-150', col_type: 'x5_webview_single', extra: { ua: app.config.mobileUa, referer: source, canBack: true } },
            { title: '第二步：驗證成功後，點此返回並刷新', url: $('hiker://empty').lazyRule(function () {
                try { putVar('missav.webviewMode', '1'); } catch (ignoreFlag) {}
                try { requirejs('https://supermiee.github.io/hairu/apps/missav/missav_core.js?v=4').clearPageCache(); } catch (ignore) { $.require('https://supermiee.github.io/hairu/apps/missav/missav_core.js?v=4').clearPageCache(); }
                back(true);
                return 'toast://已記錄驗證狀態，請刷新';
            }), col_type: 'text_center_1' },
            { title: '常見問題', desc: '· 網頁反復要求驗證：刷新網頁再試一次。\n· 在外部瀏覽器通過的驗證對本小程序無效，請務必在內嵌網頁完成。', col_type: 'long_text', extra: { textSize: 14, lineVisible: false } }
        ]);
    }

    var exported = {
        routeList: routeList,
        routeSearch: routeSearch,
        routeDetail: routeDetail,
        routePage: routePage,
        renderHome: renderHome,
        renderList: renderList,
        renderSearch: renderSearch,
        renderDirectory: renderDirectory,
        renderDetail: renderDetail,
        renderFavorites: renderFavorites,
        renderHistory: renderHistory,
        renderSettings: renderSettings,
        renderPlaySettings: renderPlaySettings,
        renderVerification: renderVerification,
        homeTabs: HOME_TABS
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = exported;
    if (typeof $ !== 'undefined') $.exports = exported;
})();
