/* Jable 页面层（重构版）。订阅只加载本模块；核心内核按 ?v= 同步版本。 */
(function () {
    var MODULE_VERSION = '4';
    var PUBLISH_BASE = 'https://supermiee.github.io/hairu/';
    var CORE_PATH = 'hiker://files/rules/jable/jable_core.js';
    var PAGES_PATH = 'hiker://files/rules/jable/jable_pages.js';
    var CORE_URL = PUBLISH_BASE + 'apps/jable/jable_core.js?v=' + MODULE_VERSION;
    var PAGES_URL = PUBLISH_BASE + 'apps/jable/jable_pages.js?v=' + MODULE_VERSION;

    /* 规则回调里 requirejs 不保证存在，失败时用 $.require 拉同一个远程模块 */
    function remoteModule(url) {
        try { return requirejs(url); } catch (ignore) { return $.require(url); }
    }

    function core() { return remoteModule(CORE_URL); }
    function pages() { return remoteModule(PAGES_URL); }

    /* ---------- UI 状态（用规则私有变量持久化） ---------- */
    function state(key, fallback) {
        try { var value = getMyVar('jable.ui.' + key, null); return (value === null || typeof value === 'undefined' || value === '') ? fallback : value; } catch (ignore) { return fallback; }
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
        }, 'jable.ui.' + key, value);
    }
    function requireSnippet(name) {
        return 'try { requirejs("' + PAGES_URL + '").' + name + '(); } catch (ignore) { $.require("' + PAGES_PATH + '").' + name + '(); }';
    }

    var SITE = 'https://jable.tv';
    var HOME_TABS = [
        { title: '最近更新', kind: 'list', url: SITE + '/latest-updates/' },
        { title: '新片上市', kind: 'list', url: SITE + '/new-release/' },
        { title: '熱度', kind: 'hot', url: SITE + '/hot/' },
        { title: '主題', kind: 'taxonomy', url: SITE + '/categories/' },
        { title: '女優', kind: 'models', url: SITE + '/models/' }
    ];
    var HOT_SORTS = [
        { title: '本週', value: 'video_viewed_week' },
        { title: '今日', value: 'video_viewed_today' },
        { title: '本月', value: 'video_viewed_month' },
        { title: '所有', value: 'video_viewed' }
    ];
    var SEARCH_SORTS = [
        { title: '最高相關', value: 'relevance' },
        { title: '近期最佳', value: 'post_date_and_popularity' },
        { title: '最近更新', value: 'post_date' },
        { title: '最多觀看', value: 'video_viewed' },
        { title: '最高收藏', value: 'most_favourited' }
    ];

    /* ---------- URL / 路由 ---------- */
    function addQuery(url, query) {
        var pair = String(url || '').split('?');
        var path = pair.shift();
        var rest = pair.join('?');
        if (query) rest = rest ? (rest + '&' + query) : query;
        return rest ? (path + '?' + rest) : path;
    }
    /* 路径式搜索：站点只有 /search/<kw>/<page>/ 才能翻页（?q=&page= 会被忽略） */
    function searchUrl(keyword, sort) {
        var base = SITE + '/search/' + encodeURIComponent(String(keyword || '').trim()) + '/';
        return (sort && sort !== 'relevance') ? (base + '?sort_by=' + encodeURIComponent(sort)) : base;
    }
    function searchPagedSource(keyword, sort) {
        var first = searchUrl(keyword, sort);
        var token = SITE + '/search/' + encodeURIComponent(String(keyword || '').trim()) + '/fypage/';
        if (sort && sort !== 'relevance') token += '?sort_by=' + encodeURIComponent(sort);
        return token + '[firstPage=' + first + ']';
    }
    /* 通用路径式翻页：/xxx/ -> /xxx/fypage/ */
    function pagedSource(url) {
        var source = String(url || '');
        var pair = source.split('?');
        var path = pair[0].replace(/\/\d+\/?$/, '/');
        if (path.charAt(path.length - 1) !== '/') path += '/';
        return path + 'fypage/' + (pair.length > 1 ? ('?' + pair.slice(1).join('?')) : '') + '[firstPage=' + source + ']';
    }
    function listRouteBySource(pageSource, params) {
        return $('hiker://empty#' + pageSource).rule(function (payload) {
            var source = String(MY_URL || '').split('#')[1] || payload.url;
            source = source.split('@rule=')[0];
            try { requirejs('https://supermiee.github.io/hairu/apps/jable/jable_pages.js?v=4').renderList({ url: source, title: payload.title, listKind: payload.listKind, selectedSort: payload.selectedSort, searchKeyword: payload.searchKeyword, searchSort: payload.searchSort }); }
            catch (ignore) { $.require('https://supermiee.github.io/hairu/apps/jable/jable_pages.js?v=4').renderList({ url: source, title: payload.title, listKind: payload.listKind, selectedSort: payload.selectedSort, searchKeyword: payload.searchKeyword, searchSort: payload.searchSort }); }
        }, params);
    }
    function routeList(url, title, listKind, selectedSort) {
        return listRouteBySource(pagedSource(url), { url: url, title: title || '影片列表', listKind: listKind || '', selectedSort: selectedSort || '' });
    }
    function routeSearch(keyword, sort) {
        return listRouteBySource(searchPagedSource(keyword, sort), { url: searchUrl(keyword, sort), title: '搜索：' + keyword, searchKeyword: keyword, searchSort: sort || 'relevance' });
    }
    function routeModels(url, title) {
        return $('hiker://empty#' + pagedSource(url)).rule(function (payload) {
            var source = String(MY_URL || '').split('#')[1] || payload.url;
            source = source.split('@rule=')[0];
            try { requirejs('https://supermiee.github.io/hairu/apps/jable/jable_pages.js?v=4').renderModels({ url: source, title: payload.title }); }
            catch (ignore) { $.require('https://supermiee.github.io/hairu/apps/jable/jable_pages.js?v=4').renderModels({ url: source, title: payload.title }); }
        }, { url: url, title: title || '女優' });
    }
    function routeDetail(item) {
        return $('hiker://empty').rule(function (payload) {
            try { requirejs('https://supermiee.github.io/hairu/apps/jable/jable_pages.js?v=4').renderDetail(payload); }
            catch (ignore) { $.require('https://supermiee.github.io/hairu/apps/jable/jable_pages.js?v=4').renderDetail(payload); }
        }, { url: item.url, title: item.title || '', image: item.image || '' });
    }
    function routePage(name, title) {
        return $('hiker://empty').rule(function (payload) {
            try { requirejs('https://supermiee.github.io/hairu/apps/jable/jable_pages.js?v=4')[payload.name](); }
            catch (ignore) { $.require('https://supermiee.github.io/hairu/apps/jable/jable_pages.js?v=4')[payload.name](); }
        }, { name: name, title: title || '' });
    }
    function routeVerification() {
        return $('hiker://empty').rule(function () {
            try { requirejs('https://supermiee.github.io/hairu/apps/jable/jable_pages.js?v=4').renderVerification(); }
            catch (ignore) { $.require('https://supermiee.github.io/hairu/apps/jable/jable_pages.js?v=4').renderVerification(); }
        }, {});
    }
    function routeTaxonomyPage() {
        return $('hiker://empty').rule(function () {
            try { requirejs('https://supermiee.github.io/hairu/apps/jable/jable_pages.js?v=4').renderTaxonomy(); }
            catch (ignore) { $.require('https://supermiee.github.io/hairu/apps/jable/jable_pages.js?v=4').renderTaxonomy(); }
        }, {});
    }

    /* ---------- 通用渲染单元 ---------- */
    function randomColor() {
        return '#' + ('00000' + (Math.random() * 0x1000000 << 0).toString(16)).substr(-6);
    }
    function card(item) {
        var desc = [];
        if (item.duration) desc.push(item.duration);
        if (item.views) desc.push('观看 ' + item.views);
        return {
            title: item.title,
            pic_url: item.image || '',
            desc: desc.join('  ·  ') || '点击查看详情',
            url: routeDetail(item),
            col_type: 'movie_2',
            extra: { lineVisible: false }
        };
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

    /* ---------- 首页（分类 Tab + 内容区） ---------- */
    function renderHome() {
        var app = core();
        var tabIndex = intState('homeTab', 0);
        if (tabIndex < 0 || tabIndex >= HOME_TABS.length) tabIndex = 0;
        var tab = HOME_TABS[tabIndex];
        var subIndex = intState('subTab', 0);

        var result = [];
        result.push({
            title: 'Jable',
            desc: '海闊視界 · 高清在線看',
            col_type: 'long_text',
            extra: { textSize: 20, lineVisible: false }
        });
        result.push({
            title: '搜索',
            desc: '輸入番號、標題或女優名',
            url: "input ? (function(){ var pages; try { pages = requirejs('" + PAGES_URL + "'); } catch (ignore) { pages = $.require('" + PAGES_PATH + "'); } return pages.routeSearch(input, 'relevance'); })() : 'toast://請輸入關鍵詞'",
            col_type: 'input',
            extra: { defaultValue: state('search', ''), onChange: "putMyVar('jable.ui.search', input)" }
        });

        for (var i = 0; i < HOME_TABS.length; i++) {
            result.push({
                title: i === tabIndex ? ('““””<font color="#FFFFFF">' + HOME_TABS[i].title + '</font>') : HOME_TABS[i].title,
                url: setStateButton('homeTab', i),
                col_type: 'scroll_button',
                extra: { backgroundColor: i === tabIndex ? '#16A085' : '' }
            });
        }

        if (tab.kind === 'hot') {
            result.push({ col_type: 'blank_block' });
            for (var s = 0; s < HOT_SORTS.length; s++) {
                result.push({
                    title: s === subIndex ? ('““””' + HOT_SORTS[s].title) : HOT_SORTS[s].title,
                    url: setStateButton('subTab', s),
                    col_type: 'scroll_button',
                    extra: { backgroundColor: s === subIndex ? '#C0392B' : '' }
                });
            }
        }

        if (tab.kind === 'list' || tab.kind === 'hot') {
            var listUrl = tab.url;
            if (tab.kind === 'hot') listUrl = tab.url + '?sort_by=' + HOT_SORTS[subIndex < HOT_SORTS.length ? subIndex : 0].value;
            var data = app.getList(listUrl, '/videos/', 12);
            if (!data.ok) { setHomeResult(failure(data.error, listUrl, routeList(listUrl, tab.title))); return; }
            result.push({ title: tab.title + (data.total ? ('  ·  ' + data.total + ' 部') : ''), col_type: 'long_text', extra: { textSize: 18, lineVisible: false } });
            for (var c = 0; c < data.items.length; c++) result.push(card(data.items[c]));
            if (!data.items.length) result.push({ title: '未解析到影片，站点结构可能已变化。', url: 'web://' + listUrl, col_type: 'text_center_1' });
            result.push({ title: '查看全部 ›', url: routeList(listUrl, tab.title), col_type: 'text_center_1' });
        } else if (tab.kind === 'taxonomy') {
            var taxPage = app.fetchCached(tab.url, { marker: '/categories/' }, 43200);
            if (!taxPage.ok) { setHomeResult(failure(taxPage.error, tab.url, routeTaxonomyPage())); return; }
            var groups = app.parseTaxonomy(taxPage.html, taxPage.url);
            for (var g = 0; g < groups.length; g++) {
                result.push({ title: groups[g].title, col_type: 'long_text', extra: { textSize: 15, lineVisible: false } });
                for (var t = 0; t < groups[g].items.length; t++) {
                    result.push({ title: groups[g].items[t].title, url: routeList(groups[g].items[t].url, groups[g].items[t].title), col_type: 'flex_button' });
                }
            }
            if (!groups.length) result.push({ title: '未解析到主題目錄', url: 'web://' + tab.url, col_type: 'text_center_1' });
        } else if (tab.kind === 'models') {
            var modelPage = app.fetchCached(tab.url, { marker: '/models/' }, 21600);
            if (!modelPage.ok) { setHomeResult(failure(modelPage.error, tab.url, routeModels(tab.url, tab.title))); return; }
            var models = app.parseModels(modelPage.html, modelPage.url);
            for (var m = 0; m < models.length; m++) {
                result.push({ title: models[m].title + (models[m].count ? ('\n' + models[m].count + ' 部影片') : ''), url: routeList(models[m].url, models[m].title), col_type: 'text_2', extra: { textAlign: 'left' } });
            }
            if (!models.length) result.push({ title: '未解析到女優目錄', url: 'web://' + tab.url, col_type: 'text_center_1' });
            result.push({ title: '查看全部 ›', url: routeModels(tab.url, tab.title), col_type: 'text_center_1' });
        }

        result.push({ col_type: 'blank_block' });
        result.push({ title: '收藏', url: routePage('renderFavorites', '收藏'), col_type: 'scroll_button' });
        result.push({ title: '历史', url: routePage('renderHistory', '历史'), col_type: 'scroll_button' });
        result.push({ title: '设置', url: routePage('renderSettings', '设置'), col_type: 'scroll_button' });
        setHomeResult(result);
    }

    /* ---------- 列表 / 搜索 ---------- */
    function renderList(params) {
        params = params || {};
        var app = core();
        var url = String(params.url || '');
        var pageNumber = 1;
        try { pageNumber = Number(MY_PAGE || params.page || 1); } catch (ignorePage) {}
        var page = app.fetchCached(url, { marker: '/videos/' }, pageNumber <= 1 ? 300 : 300);
        if (!page.ok) { setResult(failure(page.error, url, routeList(url, params.title))); return; }
        try { setPageTitle(params.title || '影片列表'); } catch (ignore) {}

        var result = [];
        var items = app.parseCards(page.html, page.url);
        var total = app.parseTotal(page.html);
        if (pageNumber <= 1) {
            result.push({ title: params.title || '影片列表', desc: total ? (total + ' 部影片') : '', col_type: 'long_text', extra: { textSize: 19, lineVisible: false } });
            var sorts = params.searchKeyword ? SEARCH_SORTS : (params.listKind === 'hot' ? HOT_SORTS : []);
            for (var s = 0; s < sorts.length; s++) {
                var selected = params.searchKeyword ? (params.searchSort || 'relevance') === sorts[s].value : params.selectedSort === sorts[s].value;
                result.push({
                    title: selected ? ('““””' + sorts[s].title) : sorts[s].title,
                    url: params.searchKeyword ? routeSearch(params.searchKeyword, sorts[s].value) : routeList(SITE + '/hot/?sort_by=' + sorts[s].value, params.title, 'hot', sorts[s].value),
                    col_type: 'scroll_button',
                    extra: { backgroundColor: selected ? '#C0392B' : '' }
                });
            }
        }
        for (var i = 0; i < items.length; i++) result.push(card(items[i]));
        if (!items.length) result.push({ title: '未解析到影片，可能页面结构已变化或需要验证。', url: 'web://' + page.url, col_type: 'text_center_1' });
        setResult(result);
    }

    /* 原生搜索入口：search_url 使用 /search/<关键词>/fypage 路径式翻页 */
    function renderSearch(url) {
        url = String(url || '');
        var keyword = '';
        try {
            var pathMatch = /\/search\/([^/?#]+)/.exec(url);
            if (pathMatch) keyword = decodeURIComponent(pathMatch[1]);
        } catch (ignorePath) {}
        if (!keyword) {
            try { keyword = getParam('q', ''); } catch (ignoreParam) {}
        }
        renderList({ url: url, title: keyword ? ('搜索：' + keyword) : '搜索', searchKeyword: keyword, searchSort: 'relevance' });
    }

    /* ---------- 详情 ---------- */
    function renderDetail(params) {
        params = params || {};
        try {
        var app = core();
        var page = app.fetchCached(params.url, { marker: 'og:title' }, 1800);
        if (!page.ok) { setResult(failure(page.error, params.url, routeDetail(params))); return; }
        var detail = app.parseDetail(page);
        app.addHistory({ title: detail.title || params.title, image: detail.image || params.image, url: params.url });
        try { setPageTitle(detail.title || params.title || '影片詳情'); } catch (ignoreTitle) {}
        try { if (detail.image) setPagePicUrl(detail.image); } catch (ignoreImage) {}

        var result = [];
        if (detail.image) result.push({ pic_url: detail.image, col_type: 'pic_1_full', extra: { lineVisible: false } });

        var longClick = [{
            title: '打开原网页',
            js: $.toString(function () { return 'web://' + MY_URL; })
        }];
        result.push({
            title: '““””' + (detail.title || params.title || '影片詳情'),
            url: 'hiker://empty',
            col_type: 'text_1',
            extra: {
                lineVisible: false,
                longClick: longClick
            }
        });

        var meta = [];
        if (detail.isNew) meta.push('新片');
        if (detail.relativeTime) meta.push(detail.relativeTime);
        if (detail.publishedAt) meta.push('上市 ' + detail.publishedAt);
        if (detail.views) meta.push('观看 ' + detail.views);
        if (detail.favoriteCount) meta.push('收藏 ' + detail.favoriteCount);
        if (meta.length) result.push({ title: meta.join('  ·  '), col_type: 'text_1', extra: { textSize: 13, lineVisible: false } });

        if (detail.description) result.push({ title: detail.description, col_type: 'rich_text', extra: { textSize: 14, lineVisible: false } });

        if (detail.media) {
            result.push({
                title: '▶ 播放',
                url: JSON.stringify({ urls: [detail.media], names: ['默認線路'], headers: [app.playerHeaders(page)] }),
                col_type: 'text_center_1',
                extra: { lineVisible: false, id: detail.url }
            });
        } else {
            result.push({ title: '▶ 網頁嗅探播放', desc: '未直接解析到媒體地址，將自動嗅探網頁中的視頻。', url: 'video://' + page.url + '#isVideo=true#', col_type: 'text_center_1', extra: { lineVisible: false } });
        }
        result.push({ title: app.isFavorite(detail.url) ? '★ 取消收藏' : '☆ 收藏', url: emptyRuleToggle(detail), col_type: 'flex_button' });
        result.push({ title: '打開原網頁', url: 'web://' + page.url, col_type: 'flex_button' });

        if (detail.actors && detail.actors.length) {
            result.push({ title: '演員', col_type: 'long_text', extra: { textSize: 15, lineVisible: false } });
            for (var a = 0; a < detail.actors.length; a++) {
                result.push({ title: detail.actors[a].title, url: routeList(detail.actors[a].url, detail.actors[a].title), col_type: 'flex_button', extra: { backgroundColor: randomColor() + '22' } });
            }
        }
        if (detail.tags && detail.tags.length) {
            result.push({ title: '標籤', col_type: 'long_text', extra: { textSize: 15, lineVisible: false } });
            for (var t = 0; t < detail.tags.length; t++) {
                result.push({ title: detail.tags[t].title, url: routeList(detail.tags[t].url, detail.tags[t].title), col_type: 'flex_button', extra: { backgroundColor: randomColor() + '22' } });
            }
        }
        if (detail.recommendations && detail.recommendations.length) section(result, '猜你喜歡', detail.recommendations);
        setResult(result);
        } catch (error) { setResult(renderError('详情', error, params)); }
    }
    function emptyRuleToggle(item) {
        return $('hiker://empty').lazyRule(function (payload) {
            var app;
            try { app = requirejs('https://supermiee.github.io/hairu/apps/jable/jable_core.js?v=4'); }
            catch (ignore) { app = $.require('https://supermiee.github.io/hairu/apps/jable/jable_core.js?v=4'); }
            var added = app.toggleFavorite(payload);
            refreshPage(false);
            return 'toast://' + (added ? '已收藏' : '已取消收藏');
        }, { title: item.title, image: item.image || '', url: item.url });
    }

    /* ---------- 主题 / 女优整页 ---------- */
    function renderTaxonomy() {
        var app = core();
        var url = SITE + '/categories/';
        var page = app.fetchCached(url, { marker: '/categories/' }, 43200);
        if (!page.ok) { setResult(failure(page.error, url, routeTaxonomyPage())); return; }
        try { setPageTitle('主題'); } catch (ignore) {}
        var groups = app.parseTaxonomy(page.html, page.url);
        var result = [{ title: '主題', desc: '完整目錄來自網頁真實鏈接', col_type: 'long_text', extra: { textSize: 19, lineVisible: false } }];
        for (var g = 0; g < groups.length; g++) {
            result.push({ title: groups[g].title, col_type: 'long_text', extra: { textSize: 15, lineVisible: false } });
            for (var i = 0; i < groups[g].items.length; i++) result.push({ title: groups[g].items[i].title, url: routeList(groups[g].items[i].url, groups[g].items[i].title), col_type: 'flex_button' });
        }
        if (!groups.length) result.push({ title: '未解析到主題目錄', url: 'web://' + page.url, col_type: 'text_center_1' });
        setResult(result);
    }
    function renderModels(params) {
        params = params || {};
        var app = core();
        var url = params.url || (SITE + '/models/');
        var page = app.fetchCached(url, { marker: '/models/' }, 21600);
        if (!page.ok) { setResult(failure(page.error, url, routeModels(url, params.title))); return; }
        try { setPageTitle(params.title || '女優'); } catch (ignore) {}
        var pageNumber = 1;
        try { pageNumber = Number(MY_PAGE || 1); } catch (ignorePage) {}
        var result = [];
        if (pageNumber <= 1) {
            result.push({ title: '女優', desc: '向下滾動自動加載更多', col_type: 'long_text', extra: { textSize: 19, lineVisible: false } });
            var sorts = app.parseModelSorts(page.html, page.url);
            var selected = ((String(url).match(/[?&]sort_by=([^&]+)/) || [])[1] || 'avg_videos_popularity');
            for (var s = 0; s < sorts.length; s++) {
                result.push({ title: sorts[s].value === selected ? ('““””' + sorts[s].title) : sorts[s].title, url: routeModels(sorts[s].url, '女優'), col_type: 'scroll_button', extra: { backgroundColor: sorts[s].value === selected ? '#C0392B' : '' } });
            }
        }
        var models = app.parseModels(page.html, page.url);
        for (var m = 0; m < models.length; m++) result.push({ title: models[m].title + (models[m].count ? ('\n' + models[m].count + ' 部影片') : ''), url: routeList(models[m].url, models[m].title), col_type: 'text_2', extra: { textAlign: 'left' } });
        if (!models.length) result.push({ title: '未解析到女優目錄', url: 'web://' + page.url, col_type: 'text_center_1' });
        setResult(result);
    }

    /* ---------- 本地收藏 / 历史 / 设置 ---------- */
    function renderFavorites() { renderLocalList('favorites', '收藏'); }
    function renderHistory() { renderLocalList('history', '觀看歷史'); }
    function renderLocalList(key, title) {
        var app = core();
        var items = app.listValue(key, []);
        try { setPageTitle(title); } catch (ignore) {}
        var result = [{ title: title, col_type: 'long_text', extra: { textSize: 19, lineVisible: false } }];
        if (!items.length) result.push({ title: '暫無內容', col_type: 'text_center_1' });
        for (var i = 0; i < items.length; i++) result.push(card(items[i]));
        setResult(result);
    }
    function renderSettings() {
        var app = core();
        try { setPageTitle('設置與診斷'); } catch (ignore) {}
        setResult([
            { title: '設置與診斷', desc: '版本 ' + app.config.version, col_type: 'long_text', extra: { textSize: 19, lineVisible: false } },
            { title: '界面與站點語言：' + app.languageInfo().title, url: routePage('renderLanguages', '語言'), col_type: 'text_center_1' },
            { title: '搜索歷史', desc: app.listValue('searches', []).join(' · ') || '暫無', col_type: 'text_1' },
            { title: '查看診斷日誌', url: routePage('renderDiagnostics', '診斷日誌'), col_type: 'text_center_1' },
            { title: '清除緩存與本地數據', url: $('hiker://empty').lazyRule(function () {
                try { requirejs('https://supermiee.github.io/hairu/apps/jable/jable_core.js?v=4').clearLocal(); } catch (ignore) { $.require('https://supermiee.github.io/hairu/apps/jable/jable_core.js?v=4').clearLocal(); }
                return 'toast://已清除';
            }), col_type: 'text_center_1' }
        ]);
    }
    function renderLanguages() {
        var app = core();
        try { setPageTitle('語言'); } catch (ignore) {}
        var selected = app.getLanguage();
        var result = [{ title: '語言', desc: '切換後重新從站點獲取標題、分類、標籤和演員顯示文本。', col_type: 'long_text', extra: { textSize: 19, lineVisible: false } }];
        for (var i = 0; i < app.config.languages.length; i++) {
            var item = app.config.languages[i];
            result.push({
                title: (item.id === selected ? '✓ ' : '') + item.title,
                url: $('hiker://empty').lazyRule(function (languageId) {
                    var app;
                    try { app = requirejs('https://supermiee.github.io/hairu/apps/jable/jable_core.js?v=4'); } catch (ignore) { app = $.require('https://supermiee.github.io/hairu/apps/jable/jable_core.js?v=4'); }
                    app.setLanguage(languageId);
                    refreshPage();
                    return 'toast://語言已切換';
                }, item.id),
                col_type: 'text_center_1'
            });
        }
        setResult(result);
    }
    function renderDiagnostics() {
        var logs = core().listValue('diagnostics', []);
        var result = [{ title: '診斷日誌', col_type: 'long_text', extra: { textSize: 19, lineVisible: false } }];
        if (!logs.length) result.push({ title: '暫無日誌', col_type: 'text_center_1' });
        for (var i = 0; i < logs.length; i++) result.push({ title: logs[i].event || 'request', desc: JSON.stringify(logs[i]), col_type: 'text_1' });
        setResult(result);
    }

    /* ---------- 验证并同步（Cloudflare） ---------- */
    function renderVerification() {
        var app = core();
        var source = app.config.sources[0] + '/';
        try { setPageTitle('驗證並同步'); } catch (ignore) {}
        setResult([
            { title: '第一步：完成人機驗證', desc: '下方網頁打開後，勾選 Cloudflare 驗證即可。通過後按第二步返回——小程序會自動改用與該網頁同源的通道加載數據，無需手動轉移任何憑證。', col_type: 'long_text', extra: { textSize: 16, lineVisible: false } },
            { title: '打開驗證網頁', url: source, desc: 'float&&screen-150', col_type: 'x5_webview_single', extra: { ua: app.config.mobileUa, referer: source, canBack: true } },
            { title: '第二步：驗證成功後，點此返回並刷新', url: $('hiker://empty').lazyRule(function () {
                try { putVar('jable.webviewMode', '1'); } catch (ignoreFlag) {}
                try { requirejs('https://supermiee.github.io/hairu/apps/jable/jable_core.js?v=4').clearPageCache(); } catch (ignore) { $.require('https://supermiee.github.io/hairu/apps/jable/jable_core.js?v=4').clearPageCache(); }
                back(true);
                return 'toast://已記錄驗證狀態，請刷新';
            }), col_type: 'text_center_1' },
            { title: '常見問題', desc: '· 網頁反復要求驗證：刷新網頁再試一次。\n· 在外部瀏覽器（Chrome 等）通過的驗證對本小程序無效，請務必在內嵌網頁完成。', col_type: 'long_text', extra: { textSize: 14, lineVisible: false } }
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
        renderDetail: renderDetail,
        renderTaxonomy: renderTaxonomy,
        renderModels: renderModels,
        renderFavorites: renderFavorites,
        renderHistory: renderHistory,
        renderSettings: renderSettings,
        renderLanguages: renderLanguages,
        renderDiagnostics: renderDiagnostics,
        renderVerification: renderVerification,
        homeTabs: HOME_TABS
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = exported;
    if (typeof $ !== 'undefined') $.exports = exported;
})();
