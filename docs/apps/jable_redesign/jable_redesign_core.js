/*
 * Jable+（jable.tv）数据内核，与本目录的 jable_redesign_pages.js 配套（单模块 app）。
 * 由 pages 通过完整 HTTPS URL + ?v= 重新 require。
 * 注意：cachePrefix（jable.full.）是历史键名，改掉会丢用户收藏/历史，保持不动。
 */
(function () {
    var CONFIG = {
        version: '1.1.1',
        sources: ['https://jable.tv', 'https://fs1.app'],
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
        /* 验证用移动端 UA + WebView 通道标记（与内嵌验证页同内核同 CookieManager） */
        mobileUa: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        webViewTimeout: 12000,
        webviewFlagKey: 'jable.webviewMode',
        timeout: 12000,
        cachePrefix: 'jable.full.',
        languageKey: 'language',
        languages: [
            { id: 'zh-TW', title: '繁體中文', siteValue: '' },
            { id: 'ja', title: '日本語', siteValue: 'jp' },
            { id: 'en', title: 'English', siteValue: 'en' }
        ],
        limits: { home: 6, comments: 10, history: 200 }
    };

    function now() { return new Date().getTime(); }

    function text(value) {
        return String(value || '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/gi, "'")
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function absolute(value, baseUrl) {
        var url = String(value || '').replace(/&amp;/gi, '&').trim();
        if (!url) return '';
        if (/^https?:\/\//i.test(url)) return url;
        var host = /^https?:\/\/[^/]+/i.exec(String(baseUrl || CONFIG.sources[0]));
        return (host ? host[0] : CONFIG.sources[0]) + (url.charAt(0) === '/' ? url : '/' + url);
    }

    function getLanguage() {
        try { return storage0.getMyVar(cacheKey(CONFIG.languageKey)) || 'zh-TW'; } catch (ignore) { return 'zh-TW'; }
    }

    function languageInfo(id) {
        for (var i = 0; i < CONFIG.languages.length; i++) if (CONFIG.languages[i].id === (id || getLanguage())) return CONFIG.languages[i];
        return CONFIG.languages[0];
    }

    function setLanguage(id) {
        var language = languageInfo(id);
        try { storage0.putMyVar(cacheKey(CONFIG.languageKey), language.id); } catch (ignore) {}
        return language;
    }

    function withLanguage(value) {
        var url = String(value || '').replace(/#.*$/, '');
        if (!/^https?:\/\/(?:jable\.tv|fs1\.app)/i.test(url)) return url;
        var language = languageInfo();
        url = url.replace(/([?&])lang=[^&]*&?/i, function (all, separator) { return separator === '?' ? '?' : ''; })
            .replace(/[?&]$/, '');
        if (!language.siteValue) return url;
        return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'lang=' + language.siteValue;
    }

    function normalizeUrl(value) {
        return withLanguage(absolute(value, CONFIG.sources[0]));
    }

    function replaceHost(url, host) {
        return String(url).replace(/^https?:\/\/[^/]+/i, host);
    }

    function sourceName(url) {
        var match = /^https?:\/\/([^/]+)/i.exec(String(url));
        return match ? match[1] : '';
    }

    function originOf(url) {
        var match = /^https?:\/\/[^/]+/i.exec(String(url || CONFIG.sources[0]));
        return match ? match[0] : '';
    }

    function parseResponse(raw) {
        if (!raw) return null;
        try {
            var result = JSON.parse(raw);
            if (result && typeof result.body !== 'undefined') return result;
        } catch (ignore) {}
        return { body: String(raw), headers: {}, statusCode: 200 };
    }

    function isUsableHtml(html, marker) {
        if (!html || html.length < 200) return false;
        /* 页面专属 marker 优先于通用关键词：正常页面也可能内嵌 CF 被动检测脚本 */
        if (marker && String(html).indexOf(marker) >= 0) return true;
        if (/cloudflare|just a moment|captcha|access denied/i.test(html)) return false;
        return !marker;
    }
    function cookieHeader(headers) {
        headers = headers || {};
        var values = headers['Set-Cookie'] || headers['set-cookie'] || [], cookies = [];
        if (typeof values === 'string') values = [values];
        for (var i = 0; i < values.length; i++) {
            var value = String(values[i] || '').split(';')[0];
            if (value) cookies.push(value);
        }
        return cookies.join('; ');
    }
    /* 硬拦截特征：命中即必须人工验证，多域名轮询只会白等 */
    function isHardBlock(html, status) {
        if (Number(status) === 403) return true;
        return /just a moment|attention required|cf-chl|challenges\.cloudflare\.com|error code: 10\d\d/i.test(String(html || ''));
    }
    function webviewMode() {
        try { return !!getVar(CONFIG.webviewFlagKey, ''); } catch (ignore) { return false; }
    }
    function requestByWebView(url, options) {
        if (typeof fetchCodeByWebView === 'undefined') return null;
        try {
            var html = fetchCodeByWebView(url, {
                headers: { 'User-Agent': CONFIG.mobileUa, Referer: originOf(url) + '/' },
                timeout: (options && options.webViewTimeout) || CONFIG.webViewTimeout,
                checkJs: $.toString(function () {
                    return !!document.querySelector('.video-img-box, [href*="/videos/"], meta[property="og:title"]');
                })
            });
            if (isUsableHtml(html, options && options.marker)) return { ok: true, url: url, html: html, cookie: '', status: 200, via: 'webview' };
        } catch (error) { return { error: String(error) }; }
        return null;
    }
    function originOf(url) {
        var match = /^https?:\/\/[^/]+/i.exec(String(url || ''));
        return match ? match[0] : CONFIG.sources[0];
    }
    function clearPageCache() {
        try {
            if (typeof listMyVarKeys === 'undefined' || typeof clearMyVar === 'undefined') return;
            var all = listMyVarKeys() || [];
            for (var i = 0; i < all.length; i++) if (String(all[i]).indexOf(cacheKey('page.')) === 0) clearMyVar(all[i]);
        } catch (ignore) {}
    }

    /* TLS/连接被重置（SSLHandshakeException: Connection closed by peer）等瞬时错误重试一次 */
    function fetchText(url, options) {
        var lastError = null;
        for (var attempt = 0; attempt < 2; attempt++) {
            try { return fetchPC(url, options); } catch (error) { lastError = error; }
        }
        throw lastError;
    }

    function request(url, options) {
        options = options || {};
        var target = normalizeUrl(url);
        var marker = options.marker || '';
        var failures = [];
        var hardBlocked = false;
        /* 已进入 WebView 模式：直接走与验证页同源的通道 */
        if (webviewMode()) {
            var primary = requestByWebView(target, options);
            if (primary && primary.ok) return primary;
            if (primary && primary.error) failures.push({ source: 'webview', status: 0, reason: primary.error });
        }
        for (var i = 0; i < CONFIG.sources.length; i++) {
            var candidate = replaceHost(target, CONFIG.sources[i]);
            var started = now();
            try {
                var raw = fetchText(candidate, {
                    headers: {
                        'User-Agent': CONFIG.userAgent,
                        'Referer': CONFIG.sources[i] + '/'
                    },
                    timeout: options.timeout || CONFIG.timeout,
                    withStatusCode: true,
                    withHeaders: true
                });
                var response = parseResponse(raw);
                var status = Number(response && response.statusCode || 0);
                var body = response && response.body || '';
                if ((status === 0 || (status >= 200 && status < 400)) && isUsableHtml(body, marker)) {
                    diagnostic({ event: 'request', ok: true, source: sourceName(candidate), status: status || 200, ms: now() - started, url: candidate });
                    return { ok: true, html: body, url: candidate, source: sourceName(candidate), status: status || 200, headers: response.headers || {}, cookie: cookieHeader(response.headers) };
                }
                if (isHardBlock(body, status)) {
                    /* 各域名共用同一套 CF 配置，命中即止损 */
                    hardBlocked = true;
                    failures.push({ source: sourceName(candidate), status: status, reason: 'Cloudflare challenge' });
                    break;
                }
                failures.push({ source: sourceName(candidate), status: status, reason: 'invalid response' });
            } catch (error) {
                failures.push({ source: sourceName(candidate), status: 0, reason: String(error) });
            }
        }
        /* WebView 兜底：与内嵌验证网页共用内核与 CookieManager；无任何验证痕迹的硬拦除外（秒级引导） */
        if (typeof fetchCodeByWebView !== 'undefined' && (!hardBlocked || webviewMode())) {
            var fallback = requestByWebView(target, options);
            if (fallback && fallback.ok) {
                try { putVar(CONFIG.webviewFlagKey, '1'); } catch (ignoreFlag) {}
                diagnostic({ event: 'request', ok: true, via: 'webview', url: target });
                return fallback;
            }
            if (fallback && fallback.error) failures.push({ source: 'webview', status: 0, reason: fallback.error });
        } else if (hardBlocked) {
            failures.push({ source: 'webview', status: 0, reason: 'skipped: interactive verification required' });
        }
        diagnostic({ event: 'request', ok: false, url: target, failures: failures });
        return { ok: false, url: target, hardBlocked: hardBlocked, error: { code: 'NETWORK_OR_VERIFICATION', message: hardBlocked ? '站点要求人机验证，请使用「验证并同步」' : '站点不可用或需要网页验证', failures: failures } };
    }

    function cacheKey(key) { return CONFIG.cachePrefix + key; }

    function readCache(key, ttlSeconds) {
        try {
            var cached = storage0.getMyVar(cacheKey(key));
            if (!cached || !cached.savedAt || now() - cached.savedAt > ttlSeconds * 1000) return null;
            return cached.value;
        } catch (ignore) { return null; }
    }

    function writeCache(key, value) {
        try { storage0.putMyVar(cacheKey(key), { savedAt: now(), value: value }); } catch (ignore) {}
        return value;
    }

    function fetchCached(url, options, ttlSeconds) {
        var key = 'page.' + String(url);
        var cached = readCache(key, ttlSeconds || 300);
        if (cached) return cached;
        var page = request(url, options);
        /* 成功长缓存；硬拦失败短缓存（约30s，按调用方 TTL 动态回溯），避免被拦期间反复烧请求 */
        if (page.ok) return writeCache(key, page);
        if (page.hardBlocked) writeCacheShort(key, page, ttlSeconds);
        return page;
    }
    function writeCacheShort(key, value, ttlSeconds) {
        var ttl = ttlSeconds || 300;
        try { storage0.putMyVar(cacheKey(key), { savedAt: now() - Math.max(0, ttl - 30) * 1000, value: value }); } catch (ignore) {}
        return value;
    }

    function attr(html, name) {
        var match = new RegExp('\\s' + name + '\\s*=\\s*["\']([^"\']+)["\']', 'i').exec(String(html || ''));
        return match ? match[1] : '';
    }

    function findHref(html, pattern, baseUrl) {
        var anchors = String(html || '').match(/<a\b[^>]*href\s*=\s*["'][^"']+["'][^>]*>[\s\S]*?<\/a>/ig) || [];
        var result = [];
        var seen = {};
        for (var i = 0; i < anchors.length; i++) {
            var href = attr(anchors[i], 'href');
            var url = absolute(href, baseUrl);
            if (!url || !pattern.test(url) || seen[url]) continue;
            var title = text(anchors[i]);
            if (!title) continue;
            seen[url] = true;
            result.push({ title: title, url: url });
        }
        return result;
    }

    function videoCode(title, href) {
        var found = /(?:[A-Z]{2,12}[-_ ]?\d{2,6}|\d{3,6}[-_][A-Z]{2,12})/i.exec(String(title || '')) ||
            /\/videos\/([^/?#]+)/i.exec(String(href || ''));
        return found ? String(found[0]).replace(/_/g, '-').replace(/\s+/g, '-').toUpperCase() : '';
    }

    function displayTitle(title, href) {
        var clean = text(title);
        var code = videoCode(clean, href);
        if (!code) return clean;
        var withoutCode = clean.replace(new RegExp('^' + code.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\s*', 'i'), '').trim();
        return withoutCode ? code + ' ' + withoutCode : code;
    }

    function parseCards(html, baseUrl, limit) {
        var selectors = ['body&&.video-img-box', 'body&&.video-item', 'body&&div[class*=video-img]', 'body&&a[href*=/videos/]'];
        var blocks = [];
        for (var s = 0; s < selectors.length; s++) {
            try { blocks = pdfa(html, selectors[s]); } catch (ignore) {}
            if (blocks && blocks.length) break;
        }
        var result = [];
        var seen = {};
        for (var i = 0; i < blocks.length && (!limit || result.length < limit); i++) {
            var block = String(blocks[i]);
            var hrefMatch = /href\s*=\s*["']([^"']*\/videos\/[^"']+)["']/i.exec(block);
            var href = hrefMatch ? absolute(hrefMatch[1], baseUrl) : '';
            if (!href || seen[href]) continue;
            seen[href] = true;
            var title = '';
            var titleSelectors = ['h6&&Text', '.title&&Text', '.video-title&&Text', 'a&&title', 'img&&alt'];
            for (var j = 0; j < titleSelectors.length && !title; j++) {
                try { title = text(pdfh(block, titleSelectors[j])); } catch (ignoreTitle) {}
            }
            title = title || text(attr(block, 'title') || attr(block, 'alt')) || href.replace(/\/$/, '').split('/').pop();
            var image = absolute(attr(block, 'data-src') || attr(block, 'data-original') || attr(block, 'data-lazy-src') || attr(block, 'src'), baseUrl);
            var duration = '';
            try { duration = text(pdfh(block, 'span.label&&Text')); } catch (ignoreDuration) {}
            var views = metric(block, /(?:fa-eye|icon-eye|video-views|views)/i);
            var favorites = metric(block, /(?:fa-heart|icon-heart|video-likes|favorites|likes)/i);
            result.push({ title: displayTitle(title, href), rawTitle: text(title), url: href, image: image, duration: duration, views: views, favorites: favorites });
        }
        return result;
    }

    function metric(block, marker) {
        var source = String(block || '');
        var found = marker.exec(source);
        if (!found) return '';
        var segment = source.slice(found.index, found.index + 240);
        var value = /(?:>|\s)(\d[\d,\s]{0,20})(?:<|\s|$)/.exec(segment);
        return value ? text(value[1]).replace(/\s+/g, '') : '';
    }

    function parseTotal(html) {
        var found = /(\d[\d,\s]*)\s*(?:部影片|videos?)/i.exec(String(html || ''));
        return found ? text(found[1]).replace(/\s+/g, '') : '';
    }

    function parsePagination(html, baseUrl) {
        var links = findHref(html, /[?&](?:page|p)=\d+|\/page\/\d+/i, baseUrl);
        var result = [];
        for (var i = 0; i < links.length; i++) {
            if (/^\d+$/.test(links[i].title) || /下一|next|last|最後/i.test(links[i].title)) result.push(links[i]);
        }
        return result;
    }

    function parseTaxonomy(html, baseUrl) {
        var headings = String(html || '').match(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/ig) || [];
        var groups = [];
        for (var i = 0; i < headings.length; i++) {
            var name = text(headings[i]);
            if (!name || /選片|選台|總覽|關於|政策/i.test(name)) continue;
            var start = String(html).indexOf(headings[i]) + headings[i].length;
            var rest = String(html).slice(start);
            var next = rest.search(/<h[1-6][^>]*>/i);
            var section = next >= 0 ? rest.slice(0, next) : rest;
            var items = findHref(section, /\/(?:categories|tags)\/[^/?#]+/i, baseUrl);
            if (items.length) groups.push({ title: name, items: items });
        }
        return groups;
    }

    function parseModels(html, baseUrl) {
        var anchors = String(html || '').match(/<a\b[^>]*href\s*=\s*["'][^"']+["'][^>]*>[\s\S]*?<\/a>/ig) || [];
        var result = [];
        var seen = {};
        for (var i = 0; i < anchors.length; i++) {
            var url = absolute(attr(anchors[i], 'href'), baseUrl);
            var slug = (/\/models\/([^/?#]+)\/?(?:[?#]|$)/i.exec(url) || [])[1] || '';
            if (!slug || /^\d+$/.test(slug) || seen[url]) continue;
            var titleTag = anchors[i].match(/<h6\b[^>]*class\s*=\s*["'][^"']*\btitle\b[^"']*["'][^>]*>[\s\S]*?<\/h6>/i);
            var count = (anchors[i].match(/>\s*(\d[\d,\s]*)\s*(?:部影片|videos?)\s*</i) || [])[1] || '';
            var title = titleTag ? text(titleTag[0]) : '';
            if (!title || !count) continue;
            seen[url] = true;
            result.push({ title: title, count: text(count), url: url });
        }
        return result;
    }

    function parseModelSorts(html, baseUrl) {
        var root = String(baseUrl || CONFIG.sources[0]).replace(/[?#].*$/, '').replace(/\/models\/?$/, '');
        var options = [
            { title: '名称排序', value: 'title' },
            { title: '热度优先', value: 'avg_videos_popularity' },
            { title: '最近更新', value: 'last_content_date' },
            { title: '最多影片', value: 'total_videos' }
        ];
        for (var i = 0; i < options.length; i++) options[i].url = root + '/models/?sort_by=' + options[i].value;
        return options;
    }

    function meta(html, name) {
        var tags = String(html || '').match(/<meta\b[^>]*>/ig) || [];
        for (var i = 0; i < tags.length; i++) {
            var key = attr(tags[i], 'property') || attr(tags[i], 'name');
            if (String(key).toLowerCase() !== String(name).toLowerCase()) continue;
            return text(attr(tags[i], 'content'));
        }
        return '';
    }

    function mediaUrl(html) {
        var clean = String(html || '').replace(/\\u002f/gi, '/').replace(/\\u0026/gi, '&').replace(/\\\//g, '/').replace(/&amp;/gi, '&');
        var found = /(https?:\/\/[^\s"'<]+?\.(?:m3u8|mp4)[^\s"'<]*)/i.exec(clean);
        return found ? found[1].replace(/[)\]},;]+$/, '') : '';
    }

    /* 站点 og/description 是通用宣传语，没有影片简介时返回空串 */
    function detailDescription(html) {
        var value = text(meta(html, 'og:description') || '');
        if (!value || /免費高清AV|在线看|在線看|無需下載|无需下载/.test(value)) return '';
        return value;
    }

    function playerHeaders(page) {
        var url = (page && page.url) || CONFIG.sources[0];
        var headers = { Referer: url, 'User-Agent': CONFIG.userAgent };
        var origin = originOf(url);
        if (origin) headers.Origin = origin;
        if (page && page.cookie) headers.Cookie = page.cookie;
        return headers;
    }

    /* 详情信息区：整站导航里也有大量 /tags/、/categories/ 链接，必须限定在 video-info 内 */
    function videoInfoHtml(html) {
        var match = /<section[^>]*class\s*=\s*["'][^"']*\bvideo-info\b[^"']*["'][\s\S]*?(?=<section\b|$)/i.exec(String(html || ''));
        return match ? match[0] : '';
    }
    function anchorsWith(scopeHtml, hrefPattern, baseUrl) {
        var anchors = String(scopeHtml || '').match(/<a\b[^>]*>[\s\S]*?<\/a>/ig) || [];
        var out = [], seen = {};
        for (var i = 0; i < anchors.length; i++) {
            var href = attr(anchors[i], 'href');
            var url = absolute(href, baseUrl);
            if (!url || !hrefPattern.test(url) || seen[url]) continue;
            seen[url] = true;
            var label = attr(anchors[i], 'data-original-title') || attr(anchors[i], 'title') || text(anchors[i]);
            if (label) out.push({ title: label, url: url });
        }
        return out;
    }

    function parseDetail(page) {
        var html = page.html;
        var pageText = text(html);
        var info = videoInfoHtml(html);
        var actors = info ? anchorsWith(info, /\/models\/[^/?#]+/i, page.url) : findHref(html, /\/models\/[^/?#]+/i, page.url);
        var tagsBlock = (info.match(/<h5[^>]*class\s*=\s*["'][^"']*\btags\b[^"']*["'][\s\S]*?<\/h5>/i) || [''])[0];
        var tags = tagsBlock ? anchorsWith(tagsBlock, /\/(?:categories|tags)\/[^/?#]+/i, page.url) : findHref(html, /\/(?:categories|tags)\/[^/?#]+/i, page.url);
        var comments = [];
        var commentBlocks = [];
        var relativeTime = (pageText.match(/(?:^|\s)(\d+\s*(?:分鐘|分钟|小時|小时|天|週|周)前|剛剛|刚刚)(?=\s|$)/) || [])[1] || '';
        var publishedAt = (pageText.match(/(?:上市於|上市于|發佈於|发布于)\s*(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/) || [])[1] || '';
        var isNew = /(?:^|\s)新(?:\s|$)/.test(pageText);
        var views = '';
        var favoriteCount = '';
        if (relativeTime) {
            var afterTime = pageText.slice(pageText.indexOf(relativeTime) + relativeTime.length);
            views = (afterTime.match(/^\s*([\d\s,]+)(?=\s|$)/) || [])[1] || '';
        }
        if (publishedAt) {
            var afterPublished = pageText.slice(pageText.indexOf(publishedAt) + publishedAt.length);
            favoriteCount = (afterPublished.match(/^\s*([\d\s,]+)(?=\s|$)/) || [])[1] || '';
        }
        if (!favoriteCount) {
            var favMatch = /class\s*=\s*["'][^"']*\bbtn-action\b[^"']*\bfav\b[^"']*["'][\s\S]{0,300}?class\s*=\s*["'][^"']*\bcount\b[^"']*["'][^>]*>([\d,\s]+)/i.exec(info || html);
            if (favMatch) favoriteCount = text(favMatch[1]);
        }
        try { commentBlocks = pdfa(html, 'body&&.comment,body&&.comment-item,body&&li[class*=comment]'); } catch (ignore) {}
        for (var i = 0; i < commentBlocks.length; i++) {
            var value = text(commentBlocks[i]);
            if (value) comments.push(value);
        }
        return {
            url: page.url,
            title: displayTitle(meta(html, 'og:title') || '', page.url),
            image: absolute(meta(html, 'og:image'), page.url),
            description: detailDescription(html),
            media: mediaUrl(html),
            relativeTime: relativeTime,
            views: text(views),
            favoriteCount: text(favoriteCount),
            isNew: isNew,
            publishedAt: publishedAt,
            actors: actors,
            tags: tags,
            recommendations: parseCards(html, page.url),
            comments: comments.slice(0, CONFIG.limits.comments)
        };
    }

    function getList(url, marker, limit) {
        var page = fetchCached(url, { marker: marker || '/videos/' }, 300);
        if (!page.ok) return page;
        return { ok: true, page: page, items: parseCards(page.html, page.url, limit), total: parseTotal(page.html), pagination: parsePagination(page.html, page.url) };
    }

    function listValue(key, fallback) {
        try { return storage0.getMyVar(cacheKey(key)) || fallback; } catch (ignore) { return fallback; }
    }

    function setValue(key, value) {
        try { storage0.putMyVar(cacheKey(key), value); } catch (ignore) {}
        return value;
    }

    function isFavorite(url) {
        var favorites = listValue('favorites', []);
        for (var i = 0; i < favorites.length; i++) if (favorites[i].url === url) return true;
        return false;
    }

    function toggleFavorite(item) {
        var favorites = listValue('favorites', []);
        var kept = [];
        var exists = false;
        for (var i = 0; i < favorites.length; i++) {
            if (favorites[i].url === item.url) { exists = true; continue; }
            kept.push(favorites[i]);
        }
        if (!exists) kept.unshift({ title: item.title, image: item.image || '', url: item.url, savedAt: now() });
        setValue('favorites', kept);
        return !exists;
    }

    function addHistory(item) {
        var history = listValue('history', []);
        var kept = [];
        for (var i = 0; i < history.length; i++) if (history[i].url !== item.url) kept.push(history[i]);
        kept.unshift({ title: item.title, image: item.image || '', url: item.url, watchedAt: now() });
        return setValue('history', kept.slice(0, CONFIG.limits.history));
    }

    function addSearch(keyword) {
        keyword = text(keyword);
        if (!keyword) return [];
        var history = listValue('searches', []);
        var result = [keyword];
        for (var i = 0; i < history.length; i++) if (history[i] !== keyword) result.push(history[i]);
        return setValue('searches', result.slice(0, 30));
    }

    function diagnostic(entry) {
        var logs = listValue('diagnostics', []);
        entry.at = now();
        logs.unshift(entry);
        setValue('diagnostics', logs.slice(0, 100));
    }

    function clearLocal() {
        var keys = ['favorites', 'history', 'searches', 'diagnostics'];
        for (var i = 0; i < keys.length; i++) setValue(keys[i], []);
        try {
            var all = listMyVarKeys();
            for (var j = 0; j < all.length; j++) if (String(all[j]).indexOf(CONFIG.cachePrefix + 'page.') === 0) clearMyVar(all[j]);
        } catch (ignore) {}
    }

    var exported = {
        config: CONFIG,
        text: text,
        absolute: absolute,
        normalizeUrl: normalizeUrl,
        getLanguage: getLanguage,
        languageInfo: languageInfo,
        setLanguage: setLanguage,
        request: request,
        fetchCached: fetchCached,
        getList: getList,
        parseCards: parseCards,
        parseTotal: parseTotal,
        parseTaxonomy: parseTaxonomy,
        parseModels: parseModels,
        parseModelSorts: parseModelSorts,
        parseDetail: parseDetail,
        playerHeaders: playerHeaders,
        parsePagination: parsePagination,
        displayTitle: displayTitle,
        listValue: listValue,
        setValue: setValue,
        isFavorite: isFavorite,
        toggleFavorite: toggleFavorite,
        addHistory: addHistory,
        addSearch: addSearch,
        diagnostic: diagnostic,
        clearLocal: clearLocal,
        clearPageCache: clearPageCache
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = exported;
    if (typeof $ !== 'undefined') $.exports = exported;
})();
