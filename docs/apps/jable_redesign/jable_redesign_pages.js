/*
 * Jable+ 重构版页面层。
 * 订阅只加载本模块；数据内核直接复用原版 jable_core.js?v=5（共享缓存与验证状态）。
 * 设计参照 jable.tv 首页分区：精選/最近更新/全新上市/熱門/主題/女優。
 */
(function () {
    var MODULE_VERSION = '9';
    var PUBLISH_BASE = 'https://supermiee.github.io/hairu/';
    var PAGES_URL = PUBLISH_BASE + 'apps/jable_redesign/jable_redesign_pages.js?v=' + MODULE_VERSION;
    var CORE_URL = PUBLISH_BASE + 'apps/jable/jable_core.js?v=5';

    var ACCENT = '#E91E63';
    var SITE = 'https://jable.tv';

    function remoteModule(url) {
        try { return requirejs(url); } catch (ignore) { return $.require(url); }
    }
    function core() { return remoteModule(CORE_URL); }

    /* ---------- UI 状态 ---------- */
    function state(key, fallback) {
        try { var value = getMyVar('jbp.' + key, null); return (value === null || typeof value === 'undefined' || value === '') ? fallback : value; } catch (ignore) { return fallback; }
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
        }, 'jbp.' + key, value);
    }

    /* ---------- 常量 ---------- */
    var HOME_TABS = [
        { title: '首頁', kind: 'home' },
        { title: '最近更新', kind: 'list', url: SITE + '/latest-updates/' },
        { title: '全新上市', kind: 'list', url: SITE + '/new-release/' },
        { title: '熱門', kind: 'hot', url: SITE + '/hot/' },
        { title: '主題', kind: 'taxonomy' },
        { title: '女優', kind: 'models' },
        { title: '我的', kind: 'mine' }
    ];
    var HOT_SORTS = [
        { title: '本週', value: 'video_viewed_week' },
        { title: '今日', value: 'video_viewed_today' },
        { title: '本月', value: 'video_viewed_month' },
        { title: '全部', value: 'video_viewed' }
    ];
    var SEARCH_SORTS = [
        { title: '最高相關', value: 'relevance' },
        { title: '近期最佳', value: 'post_date_and_popularity' },
        { title: '最近更新', value: 'post_date' },
        { title: '最多觀看', value: 'video_viewed' },
        { title: '最高收藏', value: 'most_favourited' }
    ];

    /* ---------- URL / 路由 ---------- */
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
    function pagedSource(url) {
        var source = String(url || '');
        var pair = source.split('?');
        var path = pair[0].replace(/\/\d+\/?$/, '/');
        if (path.charAt(path.length - 1) !== '/') path += '/';
        return path + 'fypage/' + (pair.length > 1 ? ('?' + pair.slice(1).join('?')) : '') + '[firstPage=' + source + ']';
    }
    function renderListRoute(pageSource, params) {
        return $('hiker://empty#' + pageSource).rule(function (payload) {
            var source = String(MY_URL || '').split('#')[1] || payload.url;
            source = String(source).split('@rule=')[0];
            payload.url = source;
            try { requirejs('https://supermiee.github.io/hairu/apps/jable_redesign/jable_redesign_pages.js?v=9').renderList(payload); }
            catch (e) { $.require('https://supermiee.github.io/hairu/apps/jable_redesign/jable_redesign_pages.js?v=9').renderList(payload); }
        }, params);
    }
    function routeList(url, title, listKind, selectedSort) {
        return renderListRoute(pagedSource(url), { url: url, title: title || '影片列表', listKind: listKind || '', selectedSort: selectedSort || '' });
    }
    function routeSearch(keyword, sort) {
        return renderListRoute(searchPagedSource(keyword, sort), { url: searchUrl(keyword, sort), title: '搜索：' + keyword, searchKeyword: keyword, searchSort: sort || 'relevance' });
    }
    function pageRoute(name, params) {
        return $('hiker://empty').rule(function (payload) {
            try { requirejs('https://supermiee.github.io/hairu/apps/jable_redesign/jable_redesign_pages.js?v=9').renderRouter(payload); }
            catch (e) { $.require('https://supermiee.github.io/hairu/apps/jable_redesign/jable_redesign_pages.js?v=9').renderRouter(payload); }
        }, { name: name, params: params || {} });
    }
    function routeModels(url, title) {
        return modelsRoute(pagedSource(url || (SITE + '/models/')), { url: url || (SITE + '/models/'), title: title || '女優' });
    }
    function modelsRoute(pageSource, params) {
        return $('hiker://empty#' + pageSource).rule(function (payload) {
            var source = String(MY_URL || '').split('#')[1] || payload.url;
            source = String(source).split('@rule=')[0];
            payload.url = source;
            try { requirejs('https://supermiee.github.io/hairu/apps/jable_redesign/jable_redesign_pages.js?v=9').renderModels(payload); }
            catch (e) { $.require('https://supermiee.github.io/hairu/apps/jable_redesign/jable_redesign_pages.js?v=9').renderModels(payload); }
        }, params);
    }
    function routeDetail(item) {
        return pageRoute('renderDetail', { url: item.url, title: item.title || '', image: item.image || '' });
    }
    function routeVerification() { return pageRoute('renderVerification', {}); }

    /* ---------- 通用渲染单元 ---------- */
    /* 标题单行 text_1：整行可点击跳「更多」，避免更多按钮独占一行 */
    function sectionTitle(result, emoji, text, moreTitle, moreRoute) {
        var title = emoji + ' ' + text;
        if (moreTitle) moreTitle = String(moreTitle).replace(/[\s\u203a>]+$/, '');
        if (moreRoute) title += '\u3000' + (moreTitle || '更多') + ' ›';
        result.push({ title: title, url: moreRoute || 'toast://仅供展示，不可点击', col_type: 'text_1', extra: { textSize: 17, lineVisible: false } });
    }
    function dedupeAcrossPages(scopeKey, pageNumber, items) {
        var key = 'jbp.seen.' + scopeKey;
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
    function card(item, first) {
        var desc = [];
        if (item.duration) desc.push(item.duration);
        if (item.views) desc.push('觀看 ' + item.views);
        if (first) {
            return {
                title: item.title,
                pic_url: item.image || '',
                desc: desc.join('  ·  ') || '點擊查看詳情',
                url: routeDetail(item),
                col_type: 'pic_1',
                extra: { lineVisible: false }
            };
        }
        return {
            title: item.title,
            pic_url: item.image || '',
            desc: desc.join('  ·  ') || '點擊查看詳情',
            url: routeDetail(item),
            col_type: 'movie_2',
            extra: { lineVisible: false }
        };
    }
    function chipButton(title, url, selected, color) {
        return {
            title: (selected ? '\u201C\u201C\u201D\u201D' : '') + title,
            url: url,
            col_type: 'scroll_button',
            extra: { backgroundColor: selected ? (color || ACCENT) : '' }
        };
    }
    function failure(error, url, retryRoute) {
        var message = (error && error.message) || String((error && error.error && error.error.message) || error) || '頁面加載失敗';
        var cards = [
            { title: message, desc: '可重試；若提示需要人機驗證，請使用「驗證並同步」。', col_type: 'text_center_1' },
            { title: '重試', url: retryRoute || routeList(url, '重試'), col_type: 'text_center_1' }
        ];
        if (/(?:验证|驗證)/.test(message)) cards.push({ title: '驗證並同步', url: routeVerification(), col_type: 'scroll_button', extra: { backgroundColor: ACCENT } });
        cards.push({ title: '打開原網頁', url: 'web://' + url, col_type: 'text_center_1' });
        return cards;
    }
    function renderError(label, error, params) {
        var message = String((error && error.message) || error || '未知錯誤');
        var cards = [{ title: label + '渲染失敗', desc: message, col_type: 'text_center_1' }];
        if (params && params.url) cards.push({ title: '打開原網頁', url: 'web://' + params.url, col_type: 'text_center_1' });
        return cards;
    }
    function searchBoxCard() {
        return {
            title: '搜索',
            desc: '番號 / 標題 / 女優',
            col_type: 'input',
            url: "input ? (function(){ var pages; try { pages = requirejs('" + PAGES_URL + "'); } catch (e) { pages = $.require('" + PAGES_URL + "'); } pages.recordSearch(input); return pages.routeSearch(input, 'relevance'); })() : 'toast://請輸入關鍵詞'",
            extra: { defaultValue: state('search', ''), onChange: "putMyVar('jbp.search', input)" }
        };
    }
    function tabBar(result) {
        var active = intState('tab', 0);
        for (var i = 0; i < HOME_TABS.length; i++) {
            var tab = HOME_TABS[i];
            var title = i === active ? tab.title : tab.title;
            result.push({
                title: (i === active ? '\u201C\u201C\u201D\u201D' + title : title),
                url: setStateButton('tab', i),
                col_type: 'scroll_button',
                extra: { backgroundColor: i === active ? ACCENT : '' }
            });
        }
    }
    /* ---------- 首页（分区仿站点） ---------- */
    function renderHome() {
        var app = core();
        var tabIndex = intState('tab', 0);
        if (tabIndex < 0 || tabIndex >= HOME_TABS.length) tabIndex = 0;
        var tab = HOME_TABS[tabIndex];
        var subIndex = intState('subTab', 0);
        var result = [];
        try {
            tabBar(result);
            result.push(searchBoxCard());

            if (tab.kind === 'home') {
                pushHomeSections(result, app);
            } else if (tab.kind === 'list') {
                pushListFeed(result, app, tab.url, pageNumber(), tab.title, '');
            } else if (tab.kind === 'hot') {
                result.push({ col_type: 'blank_block' });
                for (var s = 0; s < HOT_SORTS.length; s++) {
                    result.push(chipButton(HOT_SORTS[s].title, setStateButton('subSort', s), s === subIndex, ACCENT));
                }
                var sortValue = HOT_SORTS[subIndex < HOT_SORTS.length ? subIndex : 0].value;
                pushListFeed(result, app, tab.url + '?sort_by=' + sortValue, pageNumber(), '熱門', 'hot', sortValue);
            } else if (tab.kind === 'taxonomy') {
                pushTaxonomy(result, app);
            } else if (tab.kind === 'models') {
                pushModelsSection(result, app, SITE + '/models/', pageNumber(), '女優');
            } else if (tab.kind === 'mine') {
                pushMine(result, app);
            }
            result.push({ col_type: 'blank_block' });
        } catch (error) {
            result.push({ title: '渲染失敗', desc: String((error && error.message) || error), col_type: 'text_center_1' });
        }
        setHomeResult(result);
    }
    function pageNumber() {
        var page = 1;
        try { page = Number(MY_PAGE || 1); } catch (ignore) { page = 1; }
        return page;
    }
    function pushHomeSections(result, app) {
        var limits = [
            { url: SITE + '/latest-updates/', title: '最近更新', emoji: '◆', listCount: 6 },
            { url: SITE + '/new-release/', title: '全新上市', emoji: '◆', listCount: 6 },
            { url: SITE + '/hot/?sort_by=video_viewed_week', title: '本週熱門', emoji: '◆', listCount: 6 }
        ];
        var failed = 0;
        var firstFailure = null;
        for (var i = 0; i < limits.length; i++) {
            var cfg = limits[i];
            var data = app.getList(cfg.url, '/videos/', 0);
            if (!data.ok) { failed++; if (!firstFailure) firstFailure = { url: cfg.url, error: data.error }; continue; }
            sectionTitle(result, cfg.emoji, cfg.title, '更多', routeList(cfg.url, cfg.title));
            var items = data.items;
            for (var j = 0; j < items.length && j < cfg.listCount; j++) {
                result.push(card(items[j], i === 0 && j === 0));
            }
            if (!items.length) result.push({ title: '未解析到影片，站點結構可能已變化。', url: 'web://' + cfg.url, col_type: 'text_center_1' });
        }
        if (failed === limits.length && firstFailure) {
            /* 全部失败才落错误卡片，避免静默空白；第一个失败说明多半需要验证 */
            Array.prototype.push.apply(result, failure(firstFailure.error, firstFailure.url, routeList(firstFailure.url, '影片列表')));
        }
    }
    function pushListFeed(result, app, url, pageNumberValue, title, listKind, selectedSort) {
        var data = app.getList(url, '/videos/', 0);
        if (!data.ok) { Array.prototype.push.apply(result, failure(data.error, url, routeList(url, title, listKind, selectedSort))); return; }
        if (pageNumberValue <= 1 && data.total) {
            result.push({ title: title + ' · ' + data.total + ' 部', col_type: 'long_text', extra: { textSize: 16, lineVisible: false } });
        }
        var items = dedupeAcrossPages(title + (selectedSort || ''), pageNumberValue, data.items);
        for (var i = 0; i < items.length; i++) result.push(card(items[i]));
        if (!items.length) result.push({ title: '沒有更多影片或需要驗證。', url: 'web://' + url, col_type: 'text_center_1' });
    }
    function pushTaxonomy(result, app) {
        var page = app.fetchCached(SITE + '/categories/', { marker: '/categories/' }, 43200);
        if (!page.ok) { Array.prototype.push.apply(result, failure(page.error, SITE + '/categories/', pageRoute('renderTaxonomy', {}))); return; }
        var groups = app.parseTaxonomy(page.html, page.url);
        for (var g = 0; g < groups.length; g++) {
            sectionTitle(result, '◆', groups[g].title, '更多', routeList(SITE + '/categories/', groups[g].title));
            for (var t = 0; t < groups[g].items.length; t++) {
                result.push({ title: groups[g].items[t].title, url: routeList(groups[g].items[t].url, groups[g].items[t].title), col_type: 'flex_button' });
            }
        }
        if (!groups.length) result.push({ title: '未解析到主題目錄', url: 'web://' + SITE + '/categories/', col_type: 'text_center_1' });
    }
    function renderTaxonomyPage() {
        var result = [{ title: '主題', desc: '完整目錄來自站點真實鏈接', col_type: 'long_text', extra: { textSize: 19, lineVisible: false } }];
        try {
            var app = core();
            pushTaxonomy(result, app);
            setResult(result);
        } catch (error) { setResult(renderError('主題', error, {})); }
    }
    function pushModelsSection(result, app, url, pageNumberValue, title) {
        var page = app.fetchCached(url, { marker: '/models/' }, 21600);
        if (!page.ok) { Array.prototype.push.apply(result, failure(page.error, url, routeModels(url, title))); return; }
        if (pageNumberValue <= 1) {
            var sorts = app.parseModelSorts(page.html, url);
            var selected = ((String(url).match(/[?&]sort_by=([^&]+)/) || [])[1] || 'avg_videos_popularity');
            for (var s = 0; s < sorts.length; s++) {
                result.push(chipButton(sorts[s].title, routeModels(sorts[s].url, title), sorts[s].value === selected, ACCENT));
            }
        }
        var models = app.parseModels(page.html, page.url);
        for (var m = 0; m < models.length; m++) {
            result.push({
                title: models[m].title + (models[m].count ? ('\n' + models[m].count + ' 部影片') : ''),
                url: routeList(models[m].url, models[m].title),
                col_type: 'text_2',
                extra: { textAlign: 'left' }
            });
        }
        if (!models.length) result.push({ title: '未解析到女優目錄', url: 'web://' + page.url, col_type: 'text_center_1' });
    }
    function renderModelsPage(params) {
        params = params || {};
        try {
            var app = core();
            var result = [];
            try { setPageTitle(params.title || '女優'); } catch (ignoreTitle) {}
            pushModelsSection(result, app, params.url || (SITE + '/models/'), pageNumber(), params.title || '女優');
            setResult(result);
        } catch (error) { setResult(renderError('女優', error, params)); }
    }
    function pushMine(result, app) {
        result.push({ title: '◆ 收藏', url: pageRoute('renderLocalList', { key: 'favorites', title: '收藏' }), col_type: 'text_2', extra: { textAlign: 'left' } });
        result.push({ title: '🕐 觀看歷史', url: pageRoute('renderLocalList', { key: 'history', title: '觀看歷史' }), col_type: 'text_2', extra: { textAlign: 'left' } });
        result.push({ title: '▶ 驗證並同步（Cloudflare）', url: routeVerification(), col_type: 'text_2', extra: { textAlign: 'left' } });
        result.push({ title: '⚙ 設置與診斷', url: pageRoute('renderSettings', {}), col_type: 'text_2', extra: { textAlign: 'left' } });
        try {
            var favorites = app.listValue('favorites', []) || [];
            var history = app.listValue('history', []) || [];
            result.push({ title: '⚡ 收藏 ' + favorites.length + ' / 歷史 ' + history.length + ' · 內核 v' + (app.config.version || '1'), col_type: 'text_center_1', extra: { lineVisible: false } });
        } catch (ignoreStat) {}
    }

    /* ---------- 通过路由中枢分发（减少一次性入口数量） ---------- */
    function renderRouter(params) {
        try {
            var handler = ({
                renderDetail: renderDetail,
                renderLocalList: renderLocalList,
                renderSettings: renderSettings,
                renderVerification: renderVerificationPage,
                renderTaxonomy: renderTaxonomyPage,
                renderModels: renderModelsPage
            })[params && params.name];
            if (!handler) { setResult(renderError('路由', new Error('未注册的页面：' + JSON.stringify(params && params.name || '')), {})); return; }
            handler((params && params.params) || {});
        } catch (error) { setResult(renderError('路由', error, {})); }
    }
    function renderVerificationPage() { renderVerification(); }

    /* ---------- 列表 / 搜索 ---------- */
    function renderList(params) {
        params = params || {};
        var app = core();
        var url = String(params.url || '');
        var pageNumberValue = pageNumber();
        var page = app.fetchCached(url, { marker: '/videos/' }, 300);
        if (!page.ok) { setResult(failure(page.error, url, routeList(url, params.title))); return; }
        try { setPageTitle(params.title || '影片列表'); } catch (ignore) {}

        var result = [];
        var items = app.parseCards(page.html, page.url);
        items = dedupeAcrossPages(params.title || url, pageNumberValue, items);
        var total = app.parseTotal(page.html);
        if (pageNumberValue <= 1) {
            result.push({ title: params.title || '影片列表', desc: total ? (total + ' 部影片 · 向下滑動自動加載') : '向下滑動自動加載', col_type: 'long_text', extra: { textSize: 18, lineVisible: false } });
            var sorts = params.searchKeyword ? SEARCH_SORTS : (params.listKind === 'hot' ? HOT_SORTS : []);
            for (var s = 0; s < sorts.length; s++) {
                var value = sorts[s].value;
                var isSearch = !!params.searchKeyword;
                var selected = params.searchKeyword ? (params.searchSort || 'relevance') === value : params.selectedSort === value;
                var chipUrl = isSearch ? routeSearch(params.searchKeyword, value) : routeList(SITE + '/hot/?sort_by=' + value, params.title, 'hot', value);
                result.push(chipButton(sorts[s].title, chipUrl, selected, ACCENT));
            }
        }
        for (var i = 0; i < items.length; i++) result.push(card(items[i]));
        if (!items.length) result.push({ title: '未解析到影片，可能需要驗證或站點結構變化。', url: 'web://' + page.url, col_type: 'text_center_1' });
        setResult(result);
    }
    function renderSearch(url) {
        url = String(url || '');
        var keyword = '';
        try {
            var pathMatch = /\/search\/([^/?#]+)/.exec(url);
            if (pathMatch) keyword = decodeURIComponent(pathMatch[1]);
        } catch (ignorePath) {}
        renderList({ url: url, title: keyword ? ('搜索：' + keyword) : '搜索', searchKeyword: keyword, searchSort: 'relevance' });
    }
    function recordSearch(keyword) {
        try { core().addSearch(keyword); } catch (ignore) {}
        return 'toast://已記錄';
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

            var meta = [];
            if (detail.isNew) meta.push('新片');
            if (detail.relativeTime) meta.push(detail.relativeTime);
            if (detail.publishedAt) meta.push('上市 ' + detail.publishedAt);
            if (detail.views) meta.push('觀看 ' + detail.views);
            if (detail.favoriteCount) meta.push('收藏 ' + detail.favoriteCount);
            if (meta.length) {
                for (var mi = 0; mi < meta.length; mi++) {
                    result.push({ title: meta[mi], url: 'hiker://empty#noLoading#', col_type: 'flex_button', extra: { lineVisible: false } });
                }
            }

            if (detail.description) result.push({ title: detail.description, col_type: 'rich_text', extra: { textSize: 14, lineVisible: false } });

            if (detail.media) {
                result.push({
                    title: '▶ 立即播放',
                    url: JSON.stringify({ urls: [detail.media], names: ['默認線路'], headers: [app.playerHeaders(page)] }),
                    col_type: 'text_center_1',
                    extra: { lineVisible: false, id: detail.url, backgroundColor: ACCENT, textSize: 16 }
                });
            } else {
                result.push({
                    title: '▶ 網頁嗅探播放',
                    desc: '雙擊未直接解析到媒體地址，將自動嗅探網頁視頻。',
                    url: 'video://' + page.url + '#isVideo=true#',
                    col_type: 'text_center_1',
                    extra: { lineVisible: false, backgroundColor: ACCENT, textSize: 16 }
                });
            }

            result.push({ title: app.isFavorite(detail.url) ? '★ 已收藏' : '☆ 收藏', url: favoriteToggle(detail), col_type: 'flex_button' });
            result.push({ title: '打開原網頁', url: 'web://' + page.url, col_type: 'flex_button' });

            if (detail.actors && detail.actors.length) {
                sectionTitle(result, '◆', '演員');
                for (var a = 0; a < detail.actors.length; a++) {
                    result.push({ title: detail.actors[a].title, url: routeList(detail.actors[a].url, detail.actors[a].title), col_type: 'flex_button'});
                }
            }
            if (detail.tags && detail.tags.length) {
                sectionTitle(result, '◆', '標籤');
                for (var t = 0; t < detail.tags.length; t++) {
                    result.push({ title: detail.tags[t].title, url: routeList(detail.tags[t].url, detail.tags[t].title), col_type: 'flex_button'});
                }
            }
            if (detail.recommendations && detail.recommendations.length) {
                sectionTitle(result, '◆', '猜你喜歡', '查看更多', routeList(page.url, '相關'));
                for (var r = 0; r < detail.recommendations.length && r < 6; r++) result.push(card(detail.recommendations[r]));
            }
            setResult(result);
        } catch (error) { setResult(renderError('詳情', error, params)); }
    }
    function favoriteToggle(item) {
        return $('hiker://empty').lazyRule(function (payload) {
            var app;
            try { app = requirejs('https://supermiee.github.io/hairu/apps/jable/jable_core.js?v=5'); }
            catch (ignore) { app = $.require('https://supermiee.github.io/hairu/apps/jable/jable_core.js?v=5'); }
            var added = app.toggleFavorite(payload);
            refreshPage(false);
            return 'toast://' + (added ? '已收藏' : '已取消收藏');
        }, { title: item.title, image: item.image || '', url: item.url });
    }

    /* ---------- 本地收藏 / 历史 / 设置 ---------- */
    function renderLocalList(params) {
        var app = core();
        var items = [];
        try { items = app.listValue((params && params.key) || 'favorites', []) || []; } catch (ignore) { items = []; }
        var title = (params && params.title) || '收藏';
        try { setPageTitle(title); } catch (ignoreTitle) {}
        var result = [{ title: title, desc: items.length + ' 個項目', col_type: 'long_text', extra: { textSize: 19, lineVisible: false } }];
        if (!items.length) result.push({ title: '暫無內容', col_type: 'text_center_1' });
        for (var i = 0; i < items.length; i++) result.push(card(items[i]));
        setResult(result);
    }

    function renderSettings() {
        var app = core();
        try { setPageTitle('設置與診斷'); } catch (ignore) {}
        var searchHistory = [];
        try { searchHistory = app.listValue('searches', []) || []; } catch (ignore) { searchHistory = []; }
        setResult([
            { title: '設置與診斷', desc: 'Jable+ 重構版 v' + MODULE_VERSION + ' · 內核 v' + app.config.version, col_type: 'long_text', extra: { textSize: 19, lineVisible: false } },
            { title: '▶ 驗證並同步（Cloudflare）', desc: '站點要求人機驗證時必看', url: routeVerification(), col_type: 'text_center_1' },
            { title: '搜索歷史：' + (searchHistory.join(' · ') || '暫無'), col_type: 'text_1' },
            { title: '🧹 清除緩存與本地數據', url: $('hiker://empty#noLoading#').lazyRule(function () {
                try { requirejs('https://supermiee.github.io/hairu/apps/jable/jable_core.js?v=5').clearLocal(); } catch (e) { $.require('https://supermiee.github.io/hairu/apps/jable/jable_core.js?v=5').clearLocal(); }
                refreshPage(false);
                return 'toast://已清除';
            }), col_type: 'text_center_1' }
        ]);
    }

    /* ---------- 验证并同步（Cloudflare） ---------- */
    function renderVerification() {
        var app = core();
        var source = app.config.sources[0] + '/';
        try { setPageTitle('驗證並同步'); } catch (ignore) {}
        setResult([
            { title: '第一步：完成人機驗證', desc: '下方網頁勾選 Cloudflare 驗證后，點擊第二步返回。小程序會自動改用與該網頁同源的通道加載數據，無需手動轉移憑證。', col_type: 'long_text', extra: { textSize: 16, lineVisible: false } },
            { title: '打開驗證網頁', url: source, desc: 'float&&screen-150', col_type: 'x5_webview_single', extra: { ua: app.config.mobileUa, referer: source, canBack: true } },
            { title: '第二步：驗證成功後，點此返回並刷新', url: $('hiker://empty#noLoading#').lazyRule(function () {
                try { putVar('jable.webviewMode', '1'); } catch (ignoreFlag) {}
                try { requirejs('https://supermiee.github.io/hairu/apps/jable/jable_core.js?v=5').clearPageCache(); } catch (e) { $.require('https://supermiee.github.io/hairu/apps/jable/jable_core.js?v=5').clearPageCache(); }
                back(true);
                return 'toast://已記錄驗證狀態，請刷新';
            }), col_type: 'scroll_button', extra: { backgroundColor: ACCENT } },
            { title: '常見問題', desc: '· 反復要求驗證：刷新驗證網頁再試。\n· 外部瀏覽器通過的驗證對小程序無效，務必在內嵌網頁完成。', col_type: 'long_text', extra: { textSize: 14, lineVisible: false } }
        ]);
    }

    var exported = {
        routeList: routeList,
        routeSearch: routeSearch,
        routeDetail: routeDetail,
        renderHome: renderHome,
        renderList: renderList,
        renderSearch: renderSearch,
        renderRouter: renderRouter,
        recordSearch: recordSearch,
        homeTabs: HOME_TABS
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = exported;
    if (typeof $ !== 'undefined') $.exports = exported;
})();
