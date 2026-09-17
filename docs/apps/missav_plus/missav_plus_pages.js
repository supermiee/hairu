/*
 * MissAV（missav.ws/cn）页面层（v10 风格；目录名 missav_plus 为历史命名）。
 * 订阅只加载本模块；数据内核为同目录的 missav_plus_core.js（独立版本，随本页一起 bump）。
 * 设计参照 missav.ws 首页分区：最近更新 / 新作上市 / 中文字幕；文案用简体（站点为简体）。
 */
(function () {
    var MODULE_VERSION = '18';
    var PUBLISH_BASE = 'https://supermiee.github.io/hairu/';
    var PAGES_URL = PUBLISH_BASE + 'apps/missav_plus/missav_plus_pages.js?v=' + MODULE_VERSION;
    var CORE_URL = PUBLISH_BASE + 'apps/missav_plus/missav_plus_core.js?v=18';

    var ACCENT = '#E91E63';
    var SITE = 'https://missav.ws';

    function remoteModule(url) {
        try { return requirejs(url); } catch (ignore) { return $.require(url); }
    }
    function core() { return remoteModule(CORE_URL); }

    /* ---------- UI 状态 ---------- */
    function state(key, fallback) {
        try { var value = getMyVar('msp.' + key, null); return (value === null || typeof value === 'undefined' || value === '') ? fallback : value; } catch (ignore) { return fallback; }
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
        }, 'msp.' + key, value);
    }

    /* ---------- 常量 ---------- */
    var HOME_TABS = [
        { title: '首页', kind: 'home' },
        { title: '最近更新', kind: 'list', url: SITE + '/cn/new' },
        { title: '新作上市', kind: 'list', url: SITE + '/cn/release' },
        { title: '热门', kind: 'hot' },
        { title: '女优', kind: 'actresses', url: SITE + '/cn/actresses' },
        { title: '类型', kind: 'genres', url: SITE + '/cn/genres' },
        { title: '我的', kind: 'mine' }
    ];
    var HOT_SORTS = [
        { title: '今日', value: 'today-hot', url: SITE + '/cn/today-hot' },
        { title: '本週', value: 'weekly-hot', url: SITE + '/cn/weekly-hot' },
        { title: '本月', value: 'monthly-hot', url: SITE + '/cn/monthly-hot' }
    ];
    var ACTRESS_SORTS = [
        { title: '全部', value: 'all', url: SITE + '/cn/actresses' },
        { title: '人气排行', value: 'ranking', url: SITE + '/cn/actresses/ranking' }
    ];

    /* ---------- URL / 路由 ---------- */
    function addQuery(url, query) {
        var pair = String(url || '').split('?');
        var path = pair.shift();
        var rest = pair.join('?');
        if (query) rest = rest ? (rest + '&' + query) : query;
        return rest ? (path + '?' + rest) : path;
    }
    /* 站点列表/搜索用 query 翻页（?page=N），海阔的 fypage 令牌 + firstPage 指定第一页 */
    function pagedSource(url) { return addQuery(url, 'page=fypage') + '[firstPage=' + url + ']'; }
    function searchUrl(keyword) { return SITE + '/cn/search/' + encodeURIComponent(String(keyword || '').trim()); }
    function renderListRoute(pageSource, params) {
        return $('hiker://empty#' + pageSource).rule(function (payload) {
            var source = String(MY_URL || '').split('#')[1] || payload.url;
            source = String(source).split('@rule=')[0];
            payload.url = source;
            try { requirejs('https://supermiee.github.io/hairu/apps/missav_plus/missav_plus_pages.js?v=18').renderList(payload); }
            catch (e) { $.require('https://supermiee.github.io/hairu/apps/missav_plus/missav_plus_pages.js?v=18').renderList(payload); }
        }, params);
    }
    function routeList(url, title, listKind, selectedSort) {
        return renderListRoute(pagedSource(url), { url: url, title: title || '影片列表', listKind: listKind || '', selectedSort: selectedSort || '' });
    }
    function routeSearch(keyword) {
        return renderListRoute(pagedSource(searchUrl(keyword)), { url: searchUrl(keyword), title: '搜索：' + keyword, searchKeyword: keyword, searchSort: '' });
    }
    function pageRoute(name, params, flags) {
        return $('hiker://empty' + (flags || '')).rule(function (payload) {
            try { requirejs('https://supermiee.github.io/hairu/apps/missav_plus/missav_plus_pages.js?v=18').renderRouter(payload); }
            catch (e) { $.require('https://supermiee.github.io/hairu/apps/missav_plus/missav_plus_pages.js?v=18').renderRouter(payload); }
        }, { name: name, params: params || {} });
    }
    function directoryRoute(pageSource, params) {
        return $('hiker://empty#' + pageSource).rule(function (payload) {
            var source = String(MY_URL || '').split('#')[1] || payload.url;
            source = String(source).split('@rule=')[0];
            payload.url = source;
            try { requirejs('https://supermiee.github.io/hairu/apps/missav_plus/missav_plus_pages.js?v=18').renderDirectory(payload); }
            catch (e) { $.require('https://supermiee.github.io/hairu/apps/missav_plus/missav_plus_pages.js?v=18').renderDirectory(payload); }
        }, params);
    }
    /* 类型目录站点只有一页；女优目录是 ?page=N，需要可翻页的 pageSource */
    function routeDirectory(kind, url, title) {
        var target = url || (SITE + (kind === 'genres' ? '/cn/genres' : '/cn/actresses'));
        var params = { kind: kind, url: target, title: title };
        return kind === 'genres' ? pageRoute('renderDirectory', params) : directoryRoute(pagedSource(target), params);
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
        var key = 'msp.seen.' + scopeKey;
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
        if (item.badge) desc.push(item.badge);
        if (first) {
            return {
                title: item.title,
                pic_url: item.image || '',
                desc: desc.join('  ·  ') || '点击查看详情',
                url: routeDetail(item),
                col_type: 'pic_1',
                extra: { lineVisible: false }
            };
        }
        return {
            title: item.title,
            pic_url: item.image || '',
            desc: desc.join('  ·  ') || '点击查看详情',
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
        var message = (error && error.message) || String((error && error.error && error.error.message) || error) || '页面加载失败';
        var cards = [
            { title: message, desc: '可重试；若提示需要人机验证，请使用「验证并同步」。', col_type: 'text_center_1' },
            { title: '重试', url: retryRoute || routeList(url, '重试'), col_type: 'text_center_1' }
        ];
        if (/(?:验证|驗證)/.test(message)) cards.push({ title: '验证并同步', url: routeVerification(), col_type: 'scroll_button', extra: { backgroundColor: ACCENT } });
        cards.push({ title: '打开原网页', url: 'web://' + url, col_type: 'text_center_1' });
        return cards;
    }
    function renderError(label, error, params) {
        var message = String((error && error.message) || error || '未知错误');
        var cards = [{ title: label + '渲染失败', desc: message, col_type: 'text_center_1' }];
        if (params && params.url) cards.push({ title: '打开原网页', url: 'web://' + params.url, col_type: 'text_center_1' });
        return cards;
    }
    function searchBoxCard() {
        return {
            title: '搜索',
            desc: '番号 / 标题 / 女优名，可用 + 组合多个关键词',
            col_type: 'input',
            url: "input ? (function(){ var pages; try { pages = requirejs('" + PAGES_URL + "'); } catch (e) { pages = $.require('" + PAGES_URL + "'); } pages.recordSearch(input); return pages.routeSearch(input); })() : 'toast://请输入关键词'",
            extra: { defaultValue: state('search', ''), onChange: "putMyVar('msp.search', input)" }
        };
    }
    function tabBar(result) {
        var active = intState('tab', 0);
        for (var i = 0; i < HOME_TABS.length; i++) {
            var tab = HOME_TABS[i];
            result.push({
                title: (i === active ? '\u201C\u201C\u201D\u201D' + tab.title : tab.title),
                url: setStateButton('tab', i),
                col_type: 'scroll_button',
                extra: { backgroundColor: i === active ? ACCENT : '' }
            });
        }
    }
    function pageNumber() {
        var page = 1;
        try { page = Number(MY_PAGE || 1); } catch (ignore) { page = 1; }
        return page;
    }

    /* ---------- 首页（分区仿站点） ---------- */
    function renderHome() {
        var app = core();
        var tabIndex = intState('tab', 0);
        if (tabIndex < 0 || tabIndex >= HOME_TABS.length) tabIndex = 0;
        var tab = HOME_TABS[tabIndex];
        var subIndex = intState('subSort', 0);
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
                var sort = HOT_SORTS[subIndex < HOT_SORTS.length ? subIndex : 0];
                pushListFeed(result, app, sort.url, pageNumber(), '热门 · ' + sort.title, 'hot', sort.value);
            } else if (tab.kind === 'actresses' || tab.kind === 'genres') {
                pushDirectory(result, app, tab.kind, tab.url, pageNumber(), tab.title, 40);
            } else if (tab.kind === 'mine') {
                pushMine(result, app);
            }
            result.push({ col_type: 'blank_block' });
        } catch (error) {
            result.push({ title: '渲染失败', desc: String((error && error.message) || error), col_type: 'text_center_1' });
        }
        setHomeResult(result);
    }
    function pushHomeSections(result, app) {
        var sections = [
            { url: SITE + '/cn/new', title: '最近更新', emoji: '📺' },
            { url: SITE + '/cn/release', title: '新作上市', emoji: '✨' },
            { url: SITE + '/cn/chinese-subtitle', title: '中文字幕', emoji: '💬' }
        ];
        var failed = 0;
        var firstFailure = null;
        for (var i = 0; i < sections.length; i++) {
            var cfg = sections[i];
            var data = app.getList(cfg.url, 'thumbnail', 0);
            if (!data.ok) { failed++; if (!firstFailure) firstFailure = { url: cfg.url, error: data.error }; continue; }
            sectionTitle(result, cfg.emoji, cfg.title, '更多', routeList(cfg.url, cfg.title));
            var items = data.items;
            for (var j = 0; j < items.length && j < 6; j++) result.push(card(items[j], i === 0 && j === 0));
            if (!items.length) result.push({ title: '未解析到影片，站点结构可能已变化。', url: 'web://' + cfg.url, col_type: 'text_center_1' });
        }
        if (failed === sections.length && firstFailure) {
            /* 全部失败才落错误卡片，避免静默空白 */
            Array.prototype.push.apply(result, failure(firstFailure.error, firstFailure.url, routeList(firstFailure.url, '影片列表')));
        }
    }
    function pushListFeed(result, app, url, pageNumberValue, title, listKind, selectedSort) {
        var data = app.getList(url, 'thumbnail', 0);
        if (!data.ok) { Array.prototype.push.apply(result, failure(data.error, url, routeList(url, title, listKind, selectedSort))); return; }
        if (pageNumberValue <= 1 && data.total) {
            result.push({ title: title + ' · ' + data.total + ' 部', col_type: 'long_text', extra: { textSize: 16, lineVisible: false } });
        }
        var items = dedupeAcrossPages(title + (selectedSort || ''), pageNumberValue, data.items);
        for (var i = 0; i < items.length; i++) result.push(card(items[i]));
        if (!items.length) result.push({ title: '没有更多影片或需要验证。', url: 'web://' + url, col_type: 'text_center_1' });
    }
    /* 女优 / 类型目录：首页 tab 只展示前 40 条，完整目录走 renderDirectory */
    function pushDirectory(result, app, kind, url, pageNumberValue, title, limit) {
        var marker = kind === 'genres' ? '/genres/' : '/actresses/';
        var page = app.fetchCached(url, { marker: marker }, 43200);
        if (!page.ok) { Array.prototype.push.apply(result, failure(page.error, url, routeDirectory(kind, url, title))); return; }
        if (pageNumberValue <= 1 && kind === 'actresses') {
            for (var s = 0; s < ACTRESS_SORTS.length; s++) {
                var current = String(url || '').replace(/\/$/, '');
                var selected = current === ACTRESS_SORTS[s].url || (ACTRESS_SORTS[s].value === 'all' && current.indexOf('/ranking') < 0);
                result.push(chipButton(ACTRESS_SORTS[s].title, routeDirectory(kind, ACTRESS_SORTS[s].url, title), selected, ACCENT));
            }
        }
        var entries = kind === 'genres' ? app.parseGenres(page.html, page.url) : app.parseActresses(page.html, page.url);
        /* 首页只做预览（不写去重表）；完整目录页翻页时按 url 去重，避免追加时边界重复 */
        if (!limit) entries = dedupeAcrossPages('dir.' + kind + '.' + url, pageNumberValue, entries);
        var max = limit || entries.length;
        for (var i = 0; i < entries.length && i < max; i++) {
            result.push({
                title: entries[i].title + (entries[i].count ? ('\n' + entries[i].count) : ''),
                url: routeList(entries[i].url, entries[i].title),
                col_type: 'text_2',
                extra: { textAlign: 'left' }
            });
        }
        if (!entries.length) result.push({ title: '未解析到目录', url: 'web://' + page.url, col_type: 'text_center_1' });
        if (limit && entries.length > limit) result.push({ title: '查看完整目录 ›', url: routeDirectory(kind, url, title), col_type: 'text_center_1' });
    }
    function pushMine(result, app) {
        result.push({ title: '⭐ 收藏', url: pageRoute('renderLocalList', { key: 'favorites', title: '收藏' }), col_type: 'text_2', extra: { textAlign: 'left' } });
        result.push({ title: '🕐 观看历史', url: pageRoute('renderLocalList', { key: 'history', title: '观看历史' }), col_type: 'text_2', extra: { textAlign: 'left' } });
        result.push({ title: '📡 验证并同步（Cloudflare）', url: routeVerification(), col_type: 'text_2', extra: { textAlign: 'left' } });
        result.push({ title: '⚙ 设置与诊断', url: pageRoute('renderSettings', {}, '#noRecordHistory##noRefresh#'), col_type: 'text_2', extra: { textAlign: 'left' } });
        try {
            var favorites = app.listValue('favorites', []) || [];
            var history = app.listValue('history', []) || [];
            result.push({ title: '⚡ 收藏 ' + favorites.length + ' / 历史 ' + history.length + ' · 内核 v' + (app.config.version || '1'), col_type: 'text_center_1', extra: { lineVisible: false } });
        } catch (ignoreStat) {}
    }

    /* ---------- 路由中枢 ---------- */
    function renderRouter(params) {
        try {
            var handler = ({
                renderDetail: renderDetail,
                renderLocalList: renderLocalList,
                renderSettings: renderSettings,
                renderPlaySettings: renderPlaySettings,
                renderVerification: renderVerificationPage,
                renderDirectory: renderDirectoryPage
            })[params && params.name];
            if (!handler) { setResult(renderError('路由', new Error('未注册的页面：' + JSON.stringify(params && params.name || '')), {})); return; }
            handler((params && params.params) || {});
        } catch (error) { setResult(renderError('路由', error, {})); }
    }
    function renderVerificationPage() { renderVerification(); }
    function renderDirectoryPage(params) {
        params = params || {};
        try {
            var app = core();
            var result = [];
            var kind = params.kind === 'genres' ? 'genres' : 'actresses';
            try { setPageTitle(params.title || '目录'); } catch (ignoreTitle) {}
            if (pageNumber() <= 1) {
                result.push({ title: (params.title || '目录') + (kind === 'genres' ? ' · 全部类型' : ' · 全部女优'), desc: kind === 'genres' ? '点击进入对应影片列表' : '向下滑动自动加载', col_type: 'long_text', extra: { textSize: 18, lineVisible: false } });
            }
            pushDirectory(result, app, kind, params.url || (SITE + (kind === 'genres' ? '/cn/genres' : '/cn/actresses')), pageNumber(), params.title || '目录', 0);
            setResult(result);
        } catch (error) { setResult(renderError('目录', error, params)); }
    }

    /* ---------- 列表 / 搜索 ---------- */
    function renderList(params) {
        params = params || {};
        var app = core();
        var url = String(params.url || '');
        var page = app.fetchCached(url, { marker: 'thumbnail' }, 300);
        if (!page.ok) { setResult(failure(page.error, url, routeList(url, params.title, params.listKind, params.selectedSort))); return; }
        try { setPageTitle(params.title || '影片列表'); } catch (ignore) {}

        var result = [];
        var items = app.parseCards(page.html, page.url);
        items = dedupeAcrossPages(params.title || url, pageNumber(), items);
        var total = app.parseTotal(page.html);
        if (pageNumber() <= 1) {
            result.push({ title: params.title || '影片列表', desc: total ? (total + ' 部影片 · 向下滑动自动加载') : '向下滑动自动加载', col_type: 'long_text', extra: { textSize: 18, lineVisible: false } });
            var sorts = params.listKind === 'hot' ? HOT_SORTS : [];
            for (var s = 0; s < sorts.length; s++) {
                result.push(chipButton(sorts[s].title, routeList(sorts[s].url, params.title, 'hot', sorts[s].value), params.selectedSort === sorts[s].value, ACCENT));
            }
        }
        for (var i = 0; i < items.length; i++) result.push(card(items[i]));
        if (!items.length) result.push({ title: '未解析到影片，可能需要验证或站点结构变化。', url: 'web://' + page.url, col_type: 'text_center_1' });
        setResult(result);
    }
    function renderSearch(url) {
        url = String(url || '');
        var keyword = '';
        try {
            var match = /\/search\/([^/?#]+)/.exec(url);
            if (match) keyword = decodeURIComponent(match[1]);
        } catch (ignorePath) {}
        renderList({ url: url, title: keyword ? ('搜索：' + keyword) : '搜索', searchKeyword: keyword });
    }
    function recordSearch(keyword) {
        try { core().addSearch(keyword); } catch (ignore) {}
        return 'toast://已记录';
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
            try { setPageTitle(detail.title || params.title || '影片详情'); } catch (ignoreTitle) {}
            try { if (detail.image) setPagePicUrl(detail.image); } catch (ignoreImage) {}

            var result = [];
            if (detail.image) result.push({ pic_url: detail.image, col_type: 'pic_1_full', extra: { lineVisible: false } });

            var meta = [];
            if (detail.code) meta.push('番号 ' + detail.code);
            if (detail.releaseDate) meta.push('发行 ' + detail.releaseDate);
            if (detail.duration) meta.push('时长 ' + detail.duration);
            for (var mi = 0; mi < meta.length; mi++) {
                result.push({ title: meta[mi], url: 'hiker://empty#noLoading#', col_type: 'flex_button', extra: { lineVisible: false } });
            }

            if (detail.description) result.push({ title: detail.description, col_type: 'rich_text', extra: { textSize: 14, lineVisible: false } });

            var streams = detail.qualities && detail.qualities.length ? detail.qualities : (detail.mediaUrl ? [{ url: detail.mediaUrl, quality: '默认' }] : []);
            if (streams.length) {
                var urls = [], names = [], headers = [];
                for (var s = 0; s < streams.length; s++) {
                    urls.push(streams[s].url);
                    names.push(streams[s].quality || ('线路' + (s + 1)));
                    headers.push(app.playerHeaders(page));
                }
                var preferred = app.getPlayQuality();
                result.push({
                    title: '▶ 立即播放' + (streams.length > 1 ? ('（' + streams.length + ' 条线路 · 默认 ' + (preferred === 'highest' ? '最高' : preferred + 'p') + '）') : ''),
                    url: JSON.stringify({ urls: urls, names: names, headers: headers }),
                    col_type: 'text_center_1',
                    extra: { lineVisible: false, id: detail.url, backgroundColor: ACCENT, textSize: 16 }
                });
            } else {
                result.push({
                    title: '▶ 网页嗅探播放',
                    desc: '未直接解析到媒体地址，将自动嗅探网页视频。',
                    url: 'video://' + page.url + '#isVideo=true#',
                    col_type: 'text_center_1',
                    extra: { lineVisible: false, backgroundColor: ACCENT, textSize: 16 }
                });
            }

            result.push({ title: app.isFavorite(detail.url) ? '★ 已收藏' : '☆ 收藏', url: favoriteToggle(detail), col_type: 'flex_button', extra: { id: 'fav:' + detail.url } });
            result.push({ title: '🌐 打开原网页', url: 'web://' + page.url, col_type: 'flex_button' });

            linkRow(result, '👩', '演员', detail.actors);
            linkRow(result, '🏷', '类型', detail.genres);
            linkRow(result, '📚', '系列', detail.series);
            linkRow(result, '🏢', '发行商', detail.makers);
            linkRow(result, '🎬', '导演', detail.directors);
            linkRow(result, '🔖', '标签', detail.labels);
            if (detail.recommendations && detail.recommendations.length) {
                sectionTitle(result, '✨', '猜你喜欢', '查看更多', routeList(page.url, '相关'));
                for (var r = 0; r < detail.recommendations.length && r < 6; r++) result.push(card(detail.recommendations[r]));
            }
            setResult(result);
        } catch (error) { setResult(renderError('详情', error, params)); }
    }
    function linkRow(result, emoji, title, links) {
        if (!links || !links.length) return;
        sectionTitle(result, emoji, title);
        for (var i = 0; i < links.length; i++) result.push({ title: links[i].title, url: routeList(links[i].url, links[i].title), col_type: 'flex_button' });
    }
    function favoriteToggle(item) {
        return $('hiker://empty').lazyRule(function (payload) {
            var app;
            try { app = requirejs('https://supermiee.github.io/hairu/apps/missav_plus/missav_plus_core.js?v=18'); }
            catch (ignore) { app = $.require('https://supermiee.github.io/hairu/apps/missav_plus/missav_plus_core.js?v=18'); }
            var id = 'fav:' + payload.url;
            var added = app.toggleFavorite(payload);
            var toast = 'toast://' + (added ? '已收藏' : '已取消收藏');
            if (typeof updateItem === 'function') {
                try { updateItem(id, { title: added ? '★ 已收藏' : '☆ 收藏', extra: { id: id } }); return toast; } catch (ignoreUpdate) {}
            }
            refreshPage(false);
            return toast;
        }, { title: item.title, image: item.image || '', url: item.url });
    }

    /* ---------- 本地收藏 / 历史 / 设置 / 验证 ---------- */
    function renderLocalList(params) {
        var app = core();
        var items = [];
        try { items = app.listValue((params && params.key) || 'favorites', []) || []; } catch (ignore) { items = []; }
        var title = (params && params.title) || '收藏';
        try { setPageTitle(title); } catch (ignoreTitle) {}
        var result = [{ title: title, desc: items.length + ' 个项目', col_type: 'long_text', extra: { textSize: 19, lineVisible: false } }];
        if (!items.length) result.push({ title: '暂无内容', col_type: 'text_center_1' });
        for (var i = 0; i < items.length; i++) result.push(card(items[i]));
        setResult(result);
    }

    function renderSettings() {
        var app = core();
        try { setPageTitle('设置与诊断'); } catch (ignore) {}
        var searchHistory = [];
        try { searchHistory = app.listValue('searches', []) || []; } catch (ignore) { searchHistory = []; }
        var quality = 'highest';
        try { quality = app.getPlayQuality(); } catch (ignoreQuality) {}
        setResult([
            { title: '设置与诊断', desc: 'MissAV · 统一基线 v' + MODULE_VERSION, col_type: 'long_text', extra: { textSize: 19, lineVisible: false } },
            { title: '📡 验证并同步（Cloudflare）', desc: '站点要求人机验证时必看', url: routeVerification(), col_type: 'text_center_1' },
            { title: '播放设置：' + (quality === 'highest' ? '最高可用' : quality + 'p'), url: pageRoute('renderPlaySettings', {}), col_type: 'text_1' },
            { title: '搜索历史：' + (searchHistory.join(' · ') || '暂无'), col_type: 'text_1' },
            { title: '🧹 清除缓存与本地数据', url: $('hiker://empty#noLoading#').lazyRule(function () {
                if (typeof confirm === 'function') {
                    confirm({
                        title: '清除缓存与本地数据',
                        content: '将清除缓存、收藏与历史等本地数据，确定继续？',
                        confirm: $.toString(function () {
                            var app;
                            try { app = requirejs('https://supermiee.github.io/hairu/apps/missav_plus/missav_plus_core.js?v=18'); }
                            catch (e) { app = $.require('https://supermiee.github.io/hairu/apps/missav_plus/missav_plus_core.js?v=18'); }
                            app.clearLocal();
                            try { refreshPage(false); } catch (ignoreRefresh) {}
                            return 'toast://已清除';
                        }),
                        cancel: $.toString(function () { return 'toast://已取消'; })
                    });
                    return 'hiker://empty';
                }
                try { requirejs('https://supermiee.github.io/hairu/apps/missav_plus/missav_plus_core.js?v=18').clearLocal(); } catch (e) { $.require('https://supermiee.github.io/hairu/apps/missav_plus/missav_plus_core.js?v=18').clearLocal(); }
                refreshPage(false);
                return 'toast://已清除';
            }), col_type: 'text_center_1' }
        ]);
    }
    function renderPlaySettings() {
        var app = core();
        try { setPageTitle('播放设置'); } catch (ignore) {}
        var selected = 'highest';
        try { selected = app.getPlayQuality(); } catch (ignoreQuality) {}
        var options = [['highest', '最高可用'], ['1080', '1080p'], ['720', '720p'], ['540', '540p'], ['480', '480p'], ['360', '360p']];
        var result = [{ title: '播放设置', desc: '默认清晰度：' + (selected === 'highest' ? '最高可用' : selected + 'p') + '\n若源站不提供所选画质，将自动选择最接近的可用画质。', col_type: 'long_text', extra: { textSize: 17, lineVisible: false } }];
        for (var i = 0; i < options.length; i++) {
            result.push({ title: (selected === options[i][0] ? '✓ ' : '') + options[i][1], url: $('hiker://empty#noLoading#').lazyRule(function (value) {
                var app;
                try { app = requirejs('https://supermiee.github.io/hairu/apps/missav_plus/missav_plus_core.js?v=18'); } catch (ignore) { app = $.require('https://supermiee.github.io/hairu/apps/missav_plus/missav_plus_core.js?v=18'); }
                app.setPlayQuality(value);
                refreshPage(false);
                return 'toast://已设置';
            }, options[i][0]), col_type: 'text_center_1' });
        }
        setResult(result);
    }

    /* ---------- 验证并同步（Cloudflare） ---------- */
    function renderVerification() {
        var app = core();
        var source = app.config.source + '/cn';
        try { setPageTitle('验证并同步'); } catch (ignore) {}
        setResult([
            { title: '第一步：完成人机验证', desc: '下方网页勾选 Cloudflare 验证后，点击第二步返回。小程序会自动改用与该网页同源的通道加载数据，无需手动转移凭证。', col_type: 'long_text', extra: { textSize: 16, lineVisible: false } },
            { title: '打开验证网页', url: source, desc: 'float&&screen-150', col_type: 'x5_webview_single', extra: { ua: app.config.mobileUa, referer: source, canBack: true } },
            { title: '第二步：验证成功后，点此返回并刷新', url: $('hiker://empty#noLoading#').lazyRule(function () {
                try { putVar('missav.webviewMode', '1'); } catch (ignoreFlag) {}
                try { requirejs('https://supermiee.github.io/hairu/apps/missav_plus/missav_plus_core.js?v=18').clearPageCache(); } catch (e) { $.require('https://supermiee.github.io/hairu/apps/missav_plus/missav_plus_core.js?v=18').clearPageCache(); }
                back(true);
                return 'toast://已记录验证状态，请刷新';
            }), col_type: 'scroll_button', extra: { backgroundColor: ACCENT } },
            { title: '常见问题', desc: '· 反复要求验证：刷新验证网页再试。\n· 外部浏览器通过的验证对小程序无效，务必在内嵌网页完成。', col_type: 'long_text', extra: { textSize: 14, lineVisible: false } }
        ]);
    }

    var exported = {
        routeList: routeList,
        routeSearch: routeSearch,
        routeDetail: routeDetail,
        routeDirectory: routeDirectory,
        renderHome: renderHome,
        renderList: renderList,
        renderSearch: renderSearch,
        renderDetail: renderDetail,
        renderRouter: renderRouter,
        recordSearch: recordSearch,
        homeTabs: HOME_TABS
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = exported;
    if (typeof $ !== 'undefined') $.exports = exported;
})();
