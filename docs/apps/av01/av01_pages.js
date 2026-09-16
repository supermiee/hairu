/*
 * AV01 页面层（v10 风格）。
 * 站点：https://www.av01.media/cn —— React SPA，数据全部来自 JSON API（见 av01_core.js 顶部注释）。
 * 订阅只加载本模块；数据内核为 av01_core.js（同目录，版本独立）。
 * 顶部 tab：首页 / 最近更新 / 热门 / 女优 / 片商 / 分类 / 我的。
 * 文案为简体中文（站点 /cn 为简体）。
 */
(function () {
    var MODULE_VERSION = '2';
    var PUBLISH_BASE = 'https://supermiee.github.io/hairu/';
    var PAGES_URL = PUBLISH_BASE + 'apps/av01/av01_pages.js?v=' + MODULE_VERSION;
    var CORE_URL = PUBLISH_BASE + 'apps/av01/av01_core.js?v=2';

    var ACCENT = '#E91E63';
    var SITE = 'https://www.av01.media/cn';

    function remoteModule(url) {
        try { return requirejs(url); } catch (ignore) { return $.require(url); }
    }
    function core() { return remoteModule(CORE_URL); }

    /* ---------- UI 状态 ---------- */
    function state(key, fallback) {
        try { var value = getMyVar('av01.' + key, null); return (value === null || typeof value === 'undefined' || value === '') ? fallback : value; } catch (ignore) { return fallback; }
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
        }, 'av01.' + key, value);
    }

    /* ---------- 常量 ---------- */
    var HOME_TABS = [
        { title: '首页', kind: 'home' },
        { title: '最近更新', kind: 'feed', feed: 'latest' },
        { title: '热门', kind: 'feed', feed: 'hottest' },
        { title: '女优', kind: 'directory', dir: 'actress' },
        { title: '片商', kind: 'directory', dir: 'maker' },
        { title: '分类', kind: 'directory', dir: 'tag' },
        { title: '我的', kind: 'mine' }
    ];
    var DIR_CONF = {
        actress: { title: '女优', url: SITE + '/actresses', emoji: '👩' },
        maker: { title: '片商', url: SITE + '/makers', emoji: '🏢' },
        tag: { title: '分类', url: SITE + '/tags', emoji: '🏷' }
    };

    /* ---------- URL / 路由 ---------- */
    /* 把干净的站点 URL 变成海阔翻页地址：page=fypage 由客户端替换成页码，[firstPage=] 供回填地址栏 */
    function pagedSource(url) {
        var raw = String(url || '');
        return raw + (raw.indexOf('?') >= 0 ? '&' : '?') + 'page=fypage[firstPage=' + raw + ']';
    }
    function routeSource() {
        try { var value = String(MY_URL || '').split('#')[1] || ''; if (value) return value.split('@rule=')[0]; } catch (ignore) {}
        return '';
    }
    function firstPageFrom(source) {
        var match = /\[firstPage=([^\]]+)\]/.exec(String(source || ''));
        return match ? match[1] : '';
    }
    function pageFrom(source) {
        var match = /[?&]page=(\d+)/.exec(String(source || ''));
        return match ? Number(match[1]) : 0;
    }
    function pageNumber() {
        try { return Number(MY_PAGE || 1) || 1; } catch (ignore) { return 1; }
    }
    function searchUrl(keyword) { return SITE + '/search?q=' + encodeURIComponent(String(keyword || '').trim()); }
    function feedUrl(kind) { return SITE + '/videos/' + (kind === 'hottest' ? 'hottest' : 'latest'); }
    function keywordFrom(url) {
        var match = /[?&]q=([^&#]*)/.exec(String(url || ''));
        if (!match) return '';
        try { return decodeURIComponent(match[1].replace(/\+/g, ' ')); } catch (ignore) { return match[1]; }
    }
    function classify(url) {
        var value = String(url || '');
        if (/\/search(\?|$)/.test(value)) return { type: 'search', keyword: keywordFrom(value) };
        var feed = /\/videos\/(latest|hottest)/.exec(value);
        if (feed) return { type: 'feed', feed: feed[1] };
        if (/\/actresses(\/|\?|$)/.test(value)) return { type: 'directory', dir: 'actress' };
        if (/\/makers(\/|\?|$)/.test(value)) return { type: 'directory', dir: 'maker' };
        if (/\/tags(\/|\?|$)/.test(value)) return { type: 'directory', dir: 'tag' };
        var by = /\/(actress|maker|tag)\/(\d+)/.exec(value);
        if (by) return { type: 'videosBy', by: by[1], id: by[2] };
        return { type: 'unknown' };
    }
    function routeList(url, title, flags) {
        return $('hiker://empty#' + pagedSource(url) + (flags || '')).rule(function (payload) {
            try { requirejs('https://supermiee.github.io/hairu/apps/av01/av01_pages.js?v=2').renderList(payload); }
            catch (e) { $.require('https://supermiee.github.io/hairu/apps/av01/av01_pages.js?v=2').renderList(payload); }
        }, { url: url, title: title || '影片列表' });
    }
    function routeSearch(keyword) { return routeList(searchUrl(keyword), '搜索：' + keyword); }
    function routeFeed(kind, title) { return routeList(feedUrl(kind), title || '影片列表'); }
    function routeDirectory(kind, title) {
        var conf = DIR_CONF[kind] || DIR_CONF.tag;
        return routeList(conf.url, title || conf.title);
    }
    function routeVideosBy(kind, id, title) {
        var label = kind === 'actress' ? '女优' : (kind === 'maker' ? '片商' : '分类');
        return routeList(SITE + '/' + kind + '/' + id + '/', (title || label));
    }
    function pageRoute(name, params, flags) {
        return $('hiker://empty' + (flags || '')).rule(function (payload) {
            try { requirejs('https://supermiee.github.io/hairu/apps/av01/av01_pages.js?v=2').renderRouter(payload); }
            catch (e) { $.require('https://supermiee.github.io/hairu/apps/av01/av01_pages.js?v=2').renderRouter(payload); }
        }, { name: name, params: params || {} });
    }
    function routeDetail(item) {
        return pageRoute('renderDetail', { url: String((item && item.url) || ''), title: (item && item.title) || '', image: (item && item.image) || '' });
    }
    function routeVerification() { return pageRoute('renderVerification', {}); }

    /* ---------- 通用渲染单元 ---------- */
    function sectionTitle(result, emoji, title, moreTitle, moreRoute) {
        var label = emoji + ' ' + title;
        if (moreTitle) moreTitle = String(moreTitle).replace(/[\s\u203a>]+$/, '');
        if (moreRoute) label += '\u3000' + (moreTitle || '更多') + ' ›';
        result.push({ title: label, url: moreRoute || 'toast://仅供展示，不可点击', col_type: 'text_1', extra: { textSize: 17, lineVisible: false } });
    }
    function dedupeAcrossPages(scopeKey, page, items) {
        var key = 'av01.seen.' + scopeKey;
        var seen = [];
        try { seen = getMyVar(key, []) || []; } catch (ignoreSeen) { seen = []; }
        if (!(seen instanceof Array)) seen = [];
        if (page <= 1) seen = [];
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
    function directoryRow(entry, kind) {
        return {
            title: entry.title + (entry.count ? ('　' + entry.count + ' 部') : ''),
            url: entry.url ? routeList(entry.url, entry.title) : routeVideosBy(kind, entry.id, entry.title),
            col_type: 'text_2',
            extra: { textAlign: 'left' }
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
            extra: { defaultValue: state('search', ''), onChange: "putMyVar('av01.search', input)" }
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

    /* ---------- 首页 ---------- */
    function renderHome() {
        var app = core();
        var tabIndex = intState('tab', 0);
        if (tabIndex < 0 || tabIndex >= HOME_TABS.length) tabIndex = 0;
        var tab = HOME_TABS[tabIndex];
        var result = [];
        try {
            var firstPage = pageNumber() <= 1;
            if (firstPage) { tabBar(result); result.push(searchBoxCard()); }
            if (tab.kind === 'home') pushHomeSections(result, app);
            else if (tab.kind === 'feed') pushFeed(result, app, tab.feed, pageNumber(), tab.title);
            else if (tab.kind === 'directory') pushDirectoryTeaser(result, app, tab.dir);
            else if (tab.kind === 'mine') pushMine(result, app);
            result.push({ col_type: 'blank_block' });
        } catch (error) {
            result.push({ title: '渲染失败', desc: String((error && error.message) || error), col_type: 'text_center_1' });
        }
        setHomeResult(result);
    }
    function pushHomeSections(result, app) {
        var res = app.home();
        if (!res.ok) { Array.prototype.push.apply(result, failure(res.error, SITE + '/', routeFeed('hottest', '热门'))); return; }
        if (!res.sections || !res.sections.length) { Array.prototype.push.apply(result, failure({ message: '未解析到首页分区，接口结构可能已变化。' }, SITE + '/', routeFeed('hottest', '热门'))); return; }
        var first = true;
        for (var i = 0; i < res.sections.length; i++) {
            var section = res.sections[i];
            sectionTitle(result, '📺', section.title, '更多', routeList(section.more, section.title));
            for (var j = 0; j < section.items.length; j++) {
                result.push(card(section.items[j], first && j === 0));
                first = false;
            }
        }
    }
    function pushFeed(result, app, kind, page, title) {
        var res = app.feed(kind, page, app.config.limits.page);
        if (!res.ok) { Array.prototype.push.apply(result, failure(res.error, feedUrl(kind), routeFeed(kind, title))); return; }
        if (page <= 1 && res.total) result.push({ title: title + ' · 共 ' + res.total + ' 部', col_type: 'long_text', extra: { textSize: 16, lineVisible: false } });
        var items = dedupeAcrossPages('feed.' + kind, page, res.items);
        for (var i = 0; i < items.length; i++) result.push(card(items[i]));
        if (!items.length) result.push({ title: '没有更多影片。', url: 'web://' + feedUrl(kind), col_type: 'text_center_1' });
    }
    function pushDirectoryTeaser(result, app, kind) {
        var conf = DIR_CONF[kind] || DIR_CONF.tag;
        var res = app.directory(kind, 1, 30);
        if (!res.ok) { Array.prototype.push.apply(result, failure(res.error, conf.url, routeDirectory(kind, conf.title))); return; }
        sectionTitle(result, conf.emoji || '🏷', conf.title + '（' + (res.total || res.items.length) + '）', '查看完整', routeDirectory(kind, conf.title));
        for (var i = 0; i < res.items.length; i++) result.push(directoryRow(res.items[i], kind));
        if (!res.items.length) result.push({ title: '未解析到目录。', url: 'web://' + conf.url, col_type: 'text_center_1' });
    }
    function pushMine(result, app) {
        result.push({ title: '⭐ 收藏', url: pageRoute('renderLocalList', { key: 'favorites', title: '收藏' }), col_type: 'text_2', extra: { textAlign: 'left' } });
        result.push({ title: '🕐 观看历史', url: pageRoute('renderLocalList', { key: 'history', title: '观看历史' }), col_type: 'text_2', extra: { textAlign: 'left' } });
        result.push({ title: '📡 验证并同步', url: routeVerification(), col_type: 'text_2', extra: { textAlign: 'left' } });
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
        var source = routeSource();
        var url = firstPageFrom(source) || String(params.url || '');
        var page = pageFrom(source) || pageFrom(url) || pageNumber();
        var route = classify(url);
        if (route.type === 'search' && !route.keyword) route.keyword = keywordFrom(source);
        if (route.type === 'unknown') { setResult(failure({ message: '无法识别的列表地址：' + url }, url, routeList(url, params.title))); return; }
        try { setPageTitle(params.title || '影片列表'); } catch (ignoreTitle) {}

        var res, items = [], entries = [], isDirectory = route.type === 'directory';
        if (route.type === 'feed') res = app.feed(route.feed, page, app.config.limits.page);
        else if (route.type === 'search') res = app.search(route.keyword, page, app.config.limits.page);
        else if (route.type === 'directory') res = app.directory(route.dir, page, app.config.limits.directory);
        else res = app.videosBy(route.by, route.id, page, app.config.limits.page);
        if (!res.ok) { setResult(failure(res.error, url, routeList(url, params.title))); return; }

        if (isDirectory) entries = dedupeAcrossPages('dir.' + route.dir, page, res.items || []);
        else items = dedupeAcrossPages(url, page, res.items || []);

        var result = [];
        if (page <= 1) {
            var subtitle = res.total ? (res.total + (isDirectory ? ' 个条目' : ' 部影片') + ' · 向下滑动自动加载') : '向下滑动自动加载';
            result.push({ title: params.title || '影片列表', desc: subtitle, col_type: 'long_text', extra: { textSize: 18, lineVisible: false } });
        }
        if (isDirectory) {
            for (var i = 0; i < entries.length; i++) result.push(directoryRow(entries[i], route.dir));
            if (!entries.length) result.push({ title: '没有更多条目。', url: 'web://' + url, col_type: 'text_center_1' });
        } else {
            for (var j = 0; j < items.length; j++) result.push(card(items[j]));
            if (!items.length) result.push({ title: '没有更多影片。', url: 'web://' + url, col_type: 'text_center_1' });
        }
        setResult(result);
    }
    function renderSearch(url) {
        url = String(url || '');
        var keyword = keywordFrom(url);
        renderList({ url: url, title: keyword ? ('搜索：' + keyword) : '搜索' });
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
            var id = app.idFrom(params.url, 'video');
            if (!id) { setResult(renderError('详情', new Error('无法从地址解析视频 id：' + params.url), params)); return; }
            var res = app.detail(id);
            if (!res.ok) { setResult(failure(res.error, params.url, routeDetail(params))); return; }
            var detail = res.detail;
            var url = detail.url || params.url;
            app.addHistory({ title: detail.title || params.title, image: detail.image || params.image, url: url });
            try { setPageTitle(detail.title || params.title || '影片详情'); } catch (ignoreTitle) {}
            try { if (detail.image) setPagePicUrl(detail.image); } catch (ignoreImage) {}

            var result = [];
            if (detail.image) result.push({ pic_url: detail.image, col_type: 'pic_1_full', extra: { lineVisible: false } });

            var meta = [];
            if (detail.code) meta.push('番号 ' + detail.code);
            if (detail.duration) meta.push('时长 ' + detail.duration);
            if (detail.views) meta.push('播放 ' + detail.views);
            if (detail.date) meta.push('发行 ' + detail.date);
            for (var mi = 0; mi < meta.length; mi++) result.push({ title: meta[mi], url: 'hiker://empty#noLoading#', col_type: 'flex_button', extra: { lineVisible: false } });

            if (detail.description && detail.description !== detail.title) result.push({ title: detail.description, col_type: 'rich_text', extra: { textSize: 14, lineVisible: false } });

            var media = app.resolveMedia(id);
            if (media.ok && media.urls.length) {
                var qualityNames = media.names.slice(media.local ? 1 : 0);
                result.push({
                    title: '▶ 立即播放' + (media.local ? '（自动·多码率自适应）' : ''),
                    desc: media.local ? '默认自动切换清晰度（弱网自动降码率）；也可在播放器内手动选 ' + qualityNames.join(' / ') : ('清晰度：' + media.names.join(' / ') + '，在播放器内切换'),
                    url: JSON.stringify({ urls: media.urls, names: media.names, headers: media.urls.map(function () { return app.playerHeaders(); }) }),
                    col_type: 'text_center_1',
                    extra: { lineVisible: false, id: url, backgroundColor: ACCENT, textSize: 16 }
                });
            } else {
                result.push({
                    title: '▶ 网页嗅探播放',
                    desc: '未直接解析到媒体地址，将自动嗅探网页视频。',
                    url: 'video://' + url + '#isVideo=true#',
                    col_type: 'text_center_1',
                    extra: { lineVisible: false, id: url, backgroundColor: ACCENT, textSize: 16 }
                });
            }

            result.push({ title: app.isFavorite(url) ? '★ 已收藏' : '☆ 收藏', url: favoriteToggle(detail), col_type: 'flex_button', extra: { id: 'fav:' + url } });
            result.push({ title: '🌐 打开原网页', url: 'web://' + url, col_type: 'flex_button' });

            linkRow(result, '👩', '女优', detail.actresses);
            linkRow(result, '🏢', '片商', detail.maker ? [detail.maker] : []);
            linkRow(result, '🏷', '标签', detail.tags);

            var similar = app.similars(id, 6);
            if (similar.ok && similar.items.length) {
                sectionTitle(result, '✨', '猜你喜欢');
                for (var r = 0; r < similar.items.length; r++) result.push(card(similar.items[r], r === 0));
            }
            setResult(result);
        } catch (error) { setResult(renderError('详情', error, params)); }
    }
    function linkRow(result, emoji, title, links) {
        if (!links || !links.length) return;
        sectionTitle(result, emoji, title);
        for (var i = 0; i < links.length; i++) {
            result.push({ title: links[i].title, url: linkRoute(links[i], title), col_type: 'flex_button', extra: { lineVisible: false } });
        }
    }
    function linkRoute(link, group) {
        if (group === '女优') return routeVideosBy('actress', link.id, link.title);
        if (group === '片商') return routeVideosBy('maker', link.id, link.title);
        if (group === '标签') return routeVideosBy('tag', link.id, link.title);
        return link.url || 'toast://不可点击';
    }
    function favoriteToggle(item) {
        return $('hiker://empty').lazyRule(function (payload) {
            var app;
            try { app = requirejs('https://supermiee.github.io/hairu/apps/av01/av01_core.js?v=2'); }
            catch (ignore) { app = $.require('https://supermiee.github.io/hairu/apps/av01/av01_core.js?v=2'); }
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
        var searchHistory = [], diagnostics = [];
        try { searchHistory = app.listValue('searches', []) || []; } catch (ignore) { searchHistory = []; }
        try { diagnostics = app.listValue('diagnostics', []) || []; } catch (ignoreDiag) { diagnostics = []; }
        setResult([
            { title: '设置与诊断', desc: 'AV01 v' + MODULE_VERSION + ' · 内核 v' + app.config.version, col_type: 'long_text', extra: { textSize: 19, lineVisible: false } },
            { title: '📡 验证并同步（站点若启用 Cloudflare 人机验证时使用）', url: routeVerification(), col_type: 'text_center_1' },
            { title: '搜索历史：' + (searchHistory.join(' · ') || '暂无'), col_type: 'text_1' },
            { title: '请求诊断：' + (diagnostics.length ? (diagnostics.length + ' 条') : '暂无'), desc: diagnostics.length ? JSON.stringify(diagnostics[0]).slice(0, 200) : '', col_type: 'long_text', extra: { textSize: 13, lineVisible: false } },
            { title: '🧹 清除缓存与本地数据', url: $('hiker://empty#noLoading#').lazyRule(function () {
                if (typeof confirm === 'function') {
                    confirm({
                        title: '清除缓存与本地数据',
                        content: '将清除缓存、收藏与历史等本地数据，确定继续？',
                        confirm: $.toString(function () {
                            var app2;
                            try { app2 = requirejs('https://supermiee.github.io/hairu/apps/av01/av01_core.js?v=2'); }
                            catch (e) { app2 = $.require('https://supermiee.github.io/hairu/apps/av01/av01_core.js?v=2'); }
                            app2.clearLocal();
                            try { refreshPage(false); } catch (ignoreRefresh) {}
                            return 'toast://已清除';
                        }),
                        cancel: $.toString(function () { return 'toast://已取消'; })
                    });
                    return 'hiker://empty';
                }
                try { requirejs('https://supermiee.github.io/hairu/apps/av01/av01_core.js?v=2').clearLocal(); } catch (e) { $.require('https://supermiee.github.io/hairu/apps/av01/av01_core.js?v=2').clearLocal(); }
                refreshPage(false);
                return 'toast://已清除';
            }), col_type: 'text_center_1' }
        ]);
    }
    function renderVerification() {
        var app = core();
        try { setPageTitle('验证并同步'); } catch (ignore) {}
        setResult([
            { title: '说明', desc: 'AV01 正常无需人机验证。若站点启用 Cloudflare 后出现「加载失败」，在内嵌网页完成验证，再点第二步返回。', col_type: 'long_text', extra: { textSize: 16, lineVisible: false } },
            { title: '打开验证网页', url: SITE, desc: 'float&&screen-150', col_type: 'x5_webview_single', extra: { ua: app.config.mobileUa, referer: SITE, canBack: true } },
            { title: '第二步：验证成功后，点此返回并刷新', url: $('hiker://empty#noLoading#').lazyRule(function () {
                try { putVar('av01.webviewMode', '1'); } catch (ignoreFlag) {}
                try { requirejs('https://supermiee.github.io/hairu/apps/av01/av01_core.js?v=2').clearPageCache(); } catch (e) { $.require('https://supermiee.github.io/hairu/apps/av01/av01_core.js?v=2').clearPageCache(); }
                back(true);
                return 'toast://已记录验证状态，请刷新';
            }), col_type: 'scroll_button', extra: { backgroundColor: ACCENT } }
        ]);
    }

    var exported = {
        routeList: routeList,
        routeSearch: routeSearch,
        routeFeed: routeFeed,
        routeDirectory: routeDirectory,
        routeVideosBy: routeVideosBy,
        routeDetail: routeDetail,
        routeVerification: routeVerification,
        renderHome: renderHome,
        renderList: renderList,
        renderSearch: renderSearch,
        renderDetail: renderDetail,
        renderRouter: renderRouter,
        recordSearch: recordSearch,
        classify: classify,
        pagedSource: pagedSource,
        homeTabs: HOME_TABS
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = exported;
    if (typeof $ !== 'undefined') $.exports = exported;
})();
