/*
 * SupJav 页面层（v10 风格）。
 * 站点：https://supjav.com/zh（中文 locale；分类/标题/标签均为简体中文）。
 * 订阅只加载本模块；数据内核为 supjav_core.js（同目录，版本独立）。
 * 顶部 tab：首页 / 热门 / 有码 / 无码 / 女优 / 分类 / 我的。
 */
(function () {
    var MODULE_VERSION = '2';
    var PUBLISH_BASE = 'https://supermiee.github.io/hairu/';
    var PAGES_URL = PUBLISH_BASE + 'apps/supjav/supjav_pages.js?v=' + MODULE_VERSION;
    var CORE_URL = PUBLISH_BASE + 'apps/supjav/supjav_core.js?v=2';

    var ACCENT = '#E91E63';
    var SITE = 'https://supjav.com/zh';

    function remoteModule(url) {
        try { return requirejs(url); } catch (ignore) { return $.require(url); }
    }
    function core() { return remoteModule(CORE_URL); }

    /* ---------- UI 状态 ---------- */
    function state(key, fallback) {
        try { var value = getMyVar('sj.' + key, null); return (value === null || typeof value === 'undefined' || value === '') ? fallback : value; } catch (ignore) { return fallback; }
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
        }, 'sj.' + key, value);
    }

    /* ---------- 常量 ---------- */
    var HOME_TABS = [
        { title: '首页', kind: 'home' },
        { title: '热门', kind: 'popular' },
        { title: '有码', kind: 'list', url: SITE + '/category/censored-jav' },
        { title: '无码', kind: 'list', url: SITE + '/category/uncensored-jav' },
        { title: '女优', kind: 'cast', url: SITE + '/cast' },
        { title: '分类', kind: 'dirs' },
        { title: '我的', kind: 'mine' }
    ];
    var POPULAR_SORTS = [
        { title: '今日', value: '', url: SITE + '/popular' },
        { title: '本周', value: 'week', url: SITE + '/popular?sort=week' },
        { title: '本月', value: 'month', url: SITE + '/popular?sort=month' }
    ];
    var DIR_KINDS = [
        { key: 'tag', title: '类别', url: SITE + '/tag' },
        { key: 'maker', title: '制作商', url: SITE + '/maker' }
    ];
    /* /zh 站点个别分区标题仍是英文，补成中文 */
    var SECTION_TITLES = { "Week's Popular": '本周热门' };

    /* ---------- URL / 路由 ---------- */
    function pagedSource(url) {
        var raw = String(url || '');
        var split = raw.split('?');
        var path = split.shift().replace(/\/+$/, '');
        var query = split.join('?');
        return path + '/page/fypage' + (query ? ('?' + query) : '') + '[firstPage=' + raw + ']';
    }
    /* 站点个别入口（如首页 Week's Popular 的 More）指向英文主站，统一补上 /zh 保持中文 */
    function localizePage(url) {
        var value = String(url || '');
        var match = /^https?:\/\/supjav\.com(\/[^?#]*)?(\?[^#]*)?$/.exec(value);
        if (!match) return value;
        var path = match[1] || '/', query = match[2] || '';
        if (/^\/zh(\/|$)/.test(path)) return value;
        if (/^\/(wp-content|wp-includes|img|cdn-cgi)\//.test(path)) return value;
        return 'https://supjav.com/zh' + (path === '/' ? '/' : path) + query;
    }
    function searchUrl(keyword) { return SITE + '/?s=' + encodeURIComponent(String(keyword || '').trim()); }
    function renderListRoute(pageSource, params) {
        return $('hiker://empty#' + pageSource).rule(function (payload) {
            var source = String(MY_URL || '').split('#')[1] || payload.url;
            source = String(source).split('@rule=')[0];
            payload.url = source;
            try { requirejs('https://supermiee.github.io/hairu/apps/supjav/supjav_pages.js?v=2').renderList(payload); }
            catch (e) { $.require('https://supermiee.github.io/hairu/apps/supjav/supjav_pages.js?v=2').renderList(payload); }
        }, params);
    }
    function routeList(url, title, listKind, selectedSort) {
        url = localizePage(url);
        return renderListRoute(pagedSource(url), { url: url, title: title || '影片列表', listKind: listKind || '', selectedSort: selectedSort || '' });
    }
    function routeSearch(keyword) {
        return renderListRoute(pagedSource(searchUrl(keyword)), { url: searchUrl(keyword), title: '搜索：' + keyword, searchKeyword: keyword });
    }
    function pageRoute(name, params, flags) {
        return $('hiker://empty' + (flags || '')).rule(function (payload) {
            try { requirejs('https://supermiee.github.io/hairu/apps/supjav/supjav_pages.js?v=2').renderRouter(payload); }
            catch (e) { $.require('https://supermiee.github.io/hairu/apps/supjav/supjav_pages.js?v=2').renderRouter(payload); }
        }, { name: name, params: params || {} });
    }
    function routeDirectory(kind, url, title) {
        var target = localizePage(url || (({ tag: SITE + '/tag', maker: SITE + '/maker', cast: SITE + '/cast' })[kind] || SITE));
        return renderListRoute(pagedSource(target), { url: target, title: title || '目录', listKind: 'directory', dirKind: kind });
    }
    function routeDetail(item) {
        return pageRoute('renderDetail', { url: localizePage(item.url), title: item.title || '', image: item.image || '' });
    }
    function routeVerification() { return pageRoute('renderVerification', {}); }

    /* ---------- 通用渲染单元 ---------- */
    function sectionTitle(result, emoji, text, moreTitle, moreRoute) {
        var title = emoji + ' ' + text;
        if (moreTitle) moreTitle = String(moreTitle).replace(/[\s\u203a>]+$/, '');
        if (moreRoute) title += '\u3000' + (moreTitle || '更多') + ' ›';
        result.push({ title: title, url: moreRoute || 'toast://仅供展示，不可点击', col_type: 'text_1', extra: { textSize: 17, lineVisible: false } });
    }
    function dedupeAcrossPages(scopeKey, pageNumber, items) {
        var key = 'sj.seen.' + scopeKey;
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
        if (item.date) desc.push(item.date);
        if (item.views) desc.push(item.views + ' 次观看');
        return {
            title: item.title,
            pic_url: item.image || '',
            desc: desc.join('  ·  ') || '点击查看详情',
            url: routeDetail(item),
            col_type: first ? 'pic_1' : 'movie_2',
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
            { title: '加载失败', desc: message, col_type: 'text_center_1' },
            { title: '重试', url: retryRoute || routeList(url, '重试'), col_type: 'text_center_1' }
        ];
        if (/(?:验证|驗證|人机)/.test(message)) cards.push({ title: '验证并同步', url: routeVerification(), col_type: 'scroll_button', extra: { backgroundColor: ACCENT } });
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
            desc: '番号 / 标题 / 女优名',
            col_type: 'input',
            url: "input ? (function(){ var pages; try { pages = requirejs('" + PAGES_URL + "'); } catch (e) { pages = $.require('" + PAGES_URL + "'); } pages.recordSearch(input); return pages.routeSearch(input); })() : 'toast://请输入关键词'",
            extra: { defaultValue: state('search', ''), onChange: "putMyVar('sj.search', input)" }
        };
    }
    function tabBar(result) {
        var active = intState('tab', 0);
        for (var i = 0; i < HOME_TABS.length; i++) {
            result.push({
                title: (i === active ? '\u201C\u201C\u201D\u201D' + HOME_TABS[i].title : HOME_TABS[i].title),
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

    /* ---------- 首页 ---------- */
    function renderHome() {
        var app = core();
        var tabIndex = intState('tab', 0);
        if (tabIndex < 0 || tabIndex >= HOME_TABS.length) tabIndex = 0;
        var tab = HOME_TABS[tabIndex];
        var result = [];
        try {
            tabBar(result);
            result.push(searchBoxCard());
            if (tab.kind === 'home') pushHomeSections(result, app);
            else if (tab.kind === 'popular') {
                var subIndex = intState('subSort', 0);
                result.push({ col_type: 'blank_block' });
                for (var s = 0; s < POPULAR_SORTS.length; s++) result.push(chipButton(POPULAR_SORTS[s].title, setStateButton('subSort', s), s === subIndex, ACCENT));
                var sort = POPULAR_SORTS[subIndex < POPULAR_SORTS.length ? subIndex : 0];
                pushListFeed(result, app, sort.url, pageNumber(), '热门 · ' + sort.title, 'popular', sort.value);
            } else if (tab.kind === 'list') {
                pushListFeed(result, app, tab.url, pageNumber(), tab.title, 'list', '');
            } else if (tab.kind === 'cast') {
                pushDirectory(result, app, 'cast', tab.url, pageNumber(), tab.title, 60);
            } else if (tab.kind === 'dirs') {
                var dirIndex = intState('dirKind', 0);
                result.push({ col_type: 'blank_block' });
                for (var d = 0; d < DIR_KINDS.length; d++) result.push(chipButton(DIR_KINDS[d].title, setStateButton('dirKind', d), d === dirIndex, ACCENT));
                var dir = DIR_KINDS[dirIndex < DIR_KINDS.length ? dirIndex : 0];
                pushDirectory(result, app, dir.key, dir.url, pageNumber(), dir.title, 60);
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
        var page = app.fetchCached(SITE + '/', { marker: 'archive-title' }, 300);
        if (!page.ok) { Array.prototype.push.apply(result, failure(page.error, SITE + '/', routeList(SITE + '/', '首页'))); return; }
        var sections = app.parseHomeSections(page.html, page.url);
        if (!sections.length) { Array.prototype.push.apply(result, failure({ message: '未解析到首页分区，站点结构可能已变化。' }, SITE + '/', routeList(SITE + '/', '首页'))); return; }
        var first = true;
        for (var i = 0; i < sections.length; i++) {
            var section = sections[i];
            var label = SECTION_TITLES[section.title] || section.title;
            sectionTitle(result, '📺', label, '更多', routeList(section.more || SITE + '/', label));
            var items = section.items;
            for (var j = 0; j < items.length && j < 6; j++) {
                result.push(card(items[j], first && j === 0));
                first = false;
            }
        }
    }
    function pushListFeed(result, app, url, pageNumberValue, title, listKind, selectedSort) {
        var data = app.getList(url, 'class="post"', 0);
        if (!data.ok) { Array.prototype.push.apply(result, failure(data.error, url, routeList(url, title, listKind, selectedSort))); return; }
        if (pageNumberValue <= 1 && data.total) result.push({ title: title + ' · ' + data.total + ' 部', col_type: 'long_text', extra: { textSize: 16, lineVisible: false } });
        var items = dedupeAcrossPages(title + (selectedSort || ''), pageNumberValue, data.items);
        for (var i = 0; i < items.length; i++) result.push(card(items[i]));
        if (!items.length) result.push({ title: '没有更多影片或需要验证。', url: 'web://' + url, col_type: 'text_center_1' });
    }
    function pushDirectory(result, app, kind, url, pageNumberValue, title, limit) {
        var marker = kind === 'cast' ? '/category/cast/' : (kind === 'maker' ? '/category/maker/' : '/tag/');
        var page = app.fetchCached(url, { marker: marker }, 43200);
        if (!page.ok) { Array.prototype.push.apply(result, failure(page.error, url, routeDirectory(kind, url, title))); return; }
        var entries = kind === 'cast' ? app.parseCast(page.html, page.url) : (kind === 'maker' ? app.parseMaker(page.html, page.url) : app.parseTags(page.html, page.url));
        if (!limit) entries = dedupeAcrossPages('dir.' + kind + '.' + url, pageNumberValue, entries);
        var max = limit || entries.length;
        for (var i = 0; i < entries.length && i < max; i++) {
            result.push({
                title: entries[i].title + (entries[i].count ? ('　' + entries[i].count + ' 部') : ''),
                url: routeList(entries[i].url, entries[i].title),
                col_type: 'text_2',
                extra: { textAlign: 'left' }
            });
        }
        if (!entries.length) result.push({ title: '未解析到目录', url: 'web://' + page.url, col_type: 'text_center_1' });
        if (limit && entries.length > limit) result.push({ title: '查看完整' + title + '目录 ›', url: routeDirectory(kind, url, title), col_type: 'text_center_1' });
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
                renderVerification: renderVerificationPage
            })[params && params.name];
            if (!handler) { setResult(renderError('路由', new Error('未注册的页面：' + JSON.stringify((params && params.name) || '')), {})); return; }
            handler((params && params.params) || {});
        } catch (error) { setResult(renderError('路由', error, {})); }
    }
    function renderVerificationPage() { renderVerification(); }

    /* ---------- 列表 / 搜索 / 目录 ---------- */
    function renderList(params) {
        params = params || {};
        var app = core();
        var url = String(params.url || '');
        if (params.listKind === 'directory') { renderDirectoryList(app, params); return; }
        var page = app.fetchCached(url, { marker: 'class="post"' }, 300);
        if (!page.ok) { setResult(failure(page.error, url, routeList(url, params.title, params.listKind, params.selectedSort))); return; }
        try { setPageTitle(params.title || '影片列表'); } catch (ignore) {}
        var result = [];
        if (pageNumber() <= 1) {
            var total = app.parseTotal(page.html);
            result.push({ title: params.title || '影片列表', desc: total ? (total + ' 部影片 · 向下滑动自动加载') : '向下滑动自动加载', col_type: 'long_text', extra: { textSize: 18, lineVisible: false } });
            if (params.listKind === 'popular') {
                for (var s = 0; s < POPULAR_SORTS.length; s++) result.push(chipButton(POPULAR_SORTS[s].title, routeList(POPULAR_SORTS[s].url, params.title, 'popular', POPULAR_SORTS[s].value), params.selectedSort === POPULAR_SORTS[s].value, ACCENT));
            }
        }
        var items = app.parseCards(page.html, page.url);
        items = dedupeAcrossPages(params.title || url, pageNumber(), items);
        for (var i = 0; i < items.length; i++) result.push(card(items[i]));
        if (!items.length) result.push({ title: '没有更多影片或需要验证。', url: 'web://' + page.url, col_type: 'text_center_1' });
        setResult(result);
    }
    function renderDirectoryList(app, params) {
        var url = String(params.url || '');
        var kind = params.dirKind || 'tag';
        var marker = kind === 'cast' ? '/category/cast/' : (kind === 'maker' ? '/category/maker/' : '/tag/');
        var page = app.fetchCached(url, { marker: marker }, 43200);
        if (!page.ok) { setResult(failure(page.error, url, routeDirectory(kind, url, params.title))); return; }
        try { setPageTitle(params.title || '目录'); } catch (ignore) {}
        var entries = kind === 'cast' ? app.parseCast(page.html, page.url) : (kind === 'maker' ? app.parseMaker(page.html, page.url) : app.parseTags(page.html, page.url));
        entries = dedupeAcrossPages('dir.' + kind + '.' + url, pageNumber(), entries);
        var result = [];
        if (pageNumber() <= 1) result.push({ title: (params.title || '目录') + ' · 全部', desc: '向下滑动自动加载', col_type: 'long_text', extra: { textSize: 18, lineVisible: false } });
        for (var i = 0; i < entries.length; i++) result.push({ title: entries[i].title + (entries[i].count ? ('　' + entries[i].count + ' 部') : ''), url: routeList(entries[i].url, entries[i].title), col_type: 'text_2', extra: { textAlign: 'left' } });
        if (!entries.length) result.push({ title: '没有更多目录项。', url: 'web://' + page.url, col_type: 'text_center_1' });
        setResult(result);
    }
    function renderSearch(url) {
        url = String(url || '');
        var keyword = '';
        try { var match = /[?&]s=([^&#]+)/.exec(url); if (match) keyword = decodeURIComponent(match[1].replace(/\+/g, ' ')); } catch (ignorePath) {}
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
            var page = app.fetchCached(params.url, { marker: 'video-wrap' }, 1800);
            if (!page.ok) { setResult(failure(page.error, params.url, routeDetail(params))); return; }
            var detail = app.parseDetail(page);
            app.addHistory({ title: detail.title || params.title, image: detail.image || params.image, url: params.url });
            try { setPageTitle(detail.title || params.title || '影片详情'); } catch (ignoreTitle) {}
            try { if (detail.image) setPagePicUrl(detail.image); } catch (ignoreImage) {}

            var result = [];
            if (detail.image) result.push({ pic_url: detail.image, col_type: 'pic_1_full', extra: { lineVisible: false } });

            var meta = [];
            if (detail.category && detail.category.title) meta.push('分类 ' + detail.category.title);
            if (detail.views) meta.push('播放 ' + detail.views);
            for (var mi = 0; mi < meta.length; mi++) result.push({ title: meta[mi], url: 'hiker://empty#noLoading#', col_type: 'flex_button', extra: { lineVisible: false } });

            if (detail.description && detail.description !== app.text(detail.title)) result.push({ title: detail.description, col_type: 'rich_text', extra: { textSize: 14, lineVisible: false } });

            var media = app.resolveMedia(page.html);
            if (media.ok && media.mediaUrl) {
                result.push({
                    title: '▶ 立即播放' + (media.server ? '（' + media.server + '）' : ''),
                    url: JSON.stringify({ urls: [media.mediaUrl], names: [media.server || '默认'], headers: [app.playerHeaders(page)] }),
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

            /* 站点多条服务线路（TV/FST/ST/VOE）：点哪条就解析哪条，直链播放，解不出则丢给网页嗅探 */
            var servers = detail.servers || [];
            if (servers.length > 1) {
                sectionTitle(result, '🔀', '切换线路（' + servers.length + '）');
                for (var si = 0; si < servers.length; si++) {
                    result.push({
                        title: servers[si].name + (media.ok && media.server === servers[si].name ? ' · 当前' : ''),
                        url: playLine(servers[si]),
                        col_type: 'flex_button',
                        extra: { lineVisible: false }
                    });
                }
            }

            result.push({ title: app.isFavorite(detail.url) ? '★ 已收藏' : '☆ 收藏', url: favoriteToggle(detail), col_type: 'flex_button', extra: { id: 'fav:' + detail.url } });
            result.push({ title: '🌐 打开原网页', url: 'web://' + page.url, col_type: 'flex_button' });

            linkRow(result, '🏷', '类别', detail.category ? [detail.category].concat(detail.tags || []) : (detail.tags || []));
            linkRow(result, '🏢', '制作商', detail.maker ? [detail.maker] : []);
            linkRow(result, '👩', '女优', detail.cast ? [detail.cast] : []);
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
    /* 点某条线路才去解析该线路：能直链就返回播放 payload，否则交给海阔网页嗅探 */
    function playLine(server) {
        return $('hiker://empty').lazyRule(function (payload) {
            var app;
            try { app = requirejs('https://supermiee.github.io/hairu/apps/supjav/supjav_core.js?v=2'); }
            catch (ignore) { app = $.require('https://supermiee.github.io/hairu/apps/supjav/supjav_core.js?v=2'); }
            var resolved = app.resolveServer(payload);
            if (resolved.media) {
                return JSON.stringify({ urls: [resolved.media], names: [payload.name], headers: [app.playerHeaders({ url: resolved.pageUrl || app.config.playerHost })] });
            }
            if (resolved.pageUrl) return 'video://' + resolved.pageUrl + '#isVideo=true#';
            return 'toast://该线路暂不可用，请换一条';
        }, { name: server.name, token: server.token });
    }
    function favoriteToggle(item) {
        return $('hiker://empty').lazyRule(function (payload) {
            var app;
            try { app = requirejs('https://supermiee.github.io/hairu/apps/supjav/supjav_core.js?v=2'); }
            catch (ignore) { app = $.require('https://supermiee.github.io/hairu/apps/supjav/supjav_core.js?v=2'); }
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
        var diagnostics = [];
        try { diagnostics = app.listValue('diagnostics', []) || []; } catch (ignoreDiag) { diagnostics = []; }
        setResult([
            { title: '设置与诊断', desc: 'SupJav v' + MODULE_VERSION + ' · 内核 v' + app.config.version, col_type: 'long_text', extra: { textSize: 19, lineVisible: false } },
            { title: '📡 验证并同步（Cloudflare）', desc: '站点要求人机验证时必看', url: routeVerification(), col_type: 'text_center_1' },
            { title: '搜索历史：' + (searchHistory.join(' · ') || '暂无'), col_type: 'text_1' },
            { title: '请求诊断：' + (diagnostics.length ? (diagnostics.length + ' 条') : '暂无'), desc: diagnostics.length ? JSON.stringify(diagnostics[0]).slice(0, 200) : '', col_type: 'long_text', extra: { textSize: 13, lineVisible: false } },
            { title: '🧹 清除缓存与本地数据', url: $('hiker://empty#noLoading#').lazyRule(function () {
                if (typeof confirm === 'function') {
                    confirm({
                        title: '清除缓存与本地数据',
                        content: '将清除缓存、收藏与历史等本地数据，确定继续？',
                        confirm: $.toString(function () {
                            var app2;
                            try { app2 = requirejs('https://supermiee.github.io/hairu/apps/supjav/supjav_core.js?v=2'); }
                            catch (e) { app2 = $.require('https://supermiee.github.io/hairu/apps/supjav/supjav_core.js?v=2'); }
                            app2.clearLocal();
                            try { refreshPage(false); } catch (ignoreRefresh) {}
                            return 'toast://已清除';
                        }),
                        cancel: $.toString(function () { return 'toast://已取消'; })
                    });
                    return 'hiker://empty';
                }
                try { requirejs('https://supermiee.github.io/hairu/apps/supjav/supjav_core.js?v=2').clearLocal(); } catch (e) { $.require('https://supermiee.github.io/hairu/apps/supjav/supjav_core.js?v=2').clearLocal(); }
                refreshPage(false);
                return 'toast://已清除';
            }), col_type: 'text_center_1' }
        ]);
    }

    /* ---------- 验证并同步（Cloudflare） ---------- */
    function renderVerification() {
        var app = core();
        var source = SITE;
        try { setPageTitle('验证并同步'); } catch (ignore) {}
        setResult([
            { title: '第一步：完成人机验证', desc: '下方网页勾选 Cloudflare 验证后，点击第二步返回。小程序会自动改用与该网页同源的通道加载数据，无需手动转移凭证。', col_type: 'long_text', extra: { textSize: 16, lineVisible: false } },
            { title: '打开验证网页', url: source, desc: 'float&&screen-150', col_type: 'x5_webview_single', extra: { ua: app.config.mobileUa, referer: source, canBack: true } },
            { title: '第二步：验证成功后，点此返回并刷新', url: $('hiker://empty#noLoading#').lazyRule(function () {
                try { putVar('supjav.webviewMode', '1'); } catch (ignoreFlag) {}
                try { requirejs('https://supermiee.github.io/hairu/apps/supjav/supjav_core.js?v=2').clearPageCache(); } catch (e) { $.require('https://supermiee.github.io/hairu/apps/supjav/supjav_core.js?v=2').clearPageCache(); }
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
        routeVerification: routeVerification,
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
