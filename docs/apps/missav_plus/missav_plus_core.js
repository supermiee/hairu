/*
 * MissAV（missav.ws/cn）数据内核，与本目录的 missav_plus_pages.js 配套（单模块 app）。
 * 由 pages 通过完整 HTTPS URL + ?v= 重新 require。
 * 注意：cachePrefix（missav.full.）是历史键名，改掉会丢用户收藏/历史，保持不动。
 */
(function () {
    var CONFIG = {
        version: '19',
        source: 'https://missav.ws',
        /* Public site domains observed in the site's own redirect script. */
        sources: ['https://missav.ws', 'https://missav.ai', 'https://missav123.com'],
        locale: 'cn',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
        /* 验证用移动端 UA + WebView 通道标记（与内嵌验证页同内核同 CookieManager） */
        mobileUa: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        webViewTimeout: 12000,
        webviewFlagKey: 'missav.webviewMode',
        timeout: 5000,
        cachePrefix: 'missav.full.',
        /* WebView 抓取时屏蔽的静态资源（只要 HTML，图片/CSS/字体/媒体都用不到，加快 onPageFinished） */
        blockRules: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico',
            '.css', '.woff', '.woff2', '.ttf', '.otf', '.eot',
            '.mp4', '.m3u8', '.ts', '.mp3', '.webm'],
        limits: { home: 6, history: 200 }
    };

    function now() { return new Date().getTime(); }
    function cacheKey(key) { return CONFIG.cachePrefix + key; }
    function text(value) {
        return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
            .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim();
    }
    function absolute(value, baseUrl) {
        var url = String(value || '').replace(/&amp;/gi, '&').trim();
        if (!url || /^javascript:/i.test(url)) return '';
        if (/^https?:\/\//i.test(url)) return url;
        var host = /^https?:\/\/[^/]+/i.exec(String(baseUrl || CONFIG.source));
        return (host ? host[0] : CONFIG.source) + (url.charAt(0) === '/' ? url : '/' + url);
    }
    function replaceHost(url, host) { return String(url || '').replace(/^https?:\/\/[^/]+/i, host); }
    function activeSource() { try { return storage0.getMyVar(cacheKey('activeSource')) || ''; } catch (ignore) { return ''; } }
    function sourceOrder() {
        var active = activeSource(), order = [];
        if (active && CONFIG.sources.indexOf(active) >= 0) order.push(active);
        for (var i = 0; i < CONFIG.sources.length; i++) if (order.indexOf(CONFIG.sources[i]) < 0) order.push(CONFIG.sources[i]);
        return order;
    }
    function parseResponse(raw) {
        if (!raw) return null;
        try { var parsed = JSON.parse(raw); if (parsed && typeof parsed.body !== 'undefined') return parsed; } catch (ignore) {}
        return { body: String(raw), statusCode: 200, headers: {} };
    }
    function cookieHeader(headers) {
        headers = headers || {}; var values = headers['Set-Cookie'] || headers['set-cookie'] || [], cookies = [];
        if (typeof values === 'string') values = [values];
        for (var i = 0; i < values.length; i++) {
            var value = String(values[i] || '').split(';')[0];
            if (value) cookies.push(value);
        }
        return cookies.join('; ');
    }
    function origin(url) { var found = /^https?:\/\/[^/]+/i.exec(String(url || '')); return found ? found[0] : CONFIG.source; }
    function isUsableHtml(html, marker) {
        if (!html || html.length < 300) return false;
        /* MissAV may embed Cloudflare's passive JavaScript detector in otherwise complete pages.
           A requested page marker (for example a thumbnail card) is stronger evidence than that script. */
        if (marker && String(html).indexOf(marker) >= 0) return true;
        if (/just a moment|verify you are human|captcha|access denied|enable javascript/i.test(html)) return false;
        return !marker;
    }
    function diagnostic(entry) {
        try {
            var all = storage0.getMyVar(cacheKey('diagnostics')) || [];
            all.unshift(entry); storage0.putMyVar(cacheKey('diagnostics'), all.slice(0, 30));
        } catch (ignore) {}
    }
    /* 硬拦截特征：命中即必须人工验证，多镜像轮询只会白等 */
    function isHardBlock(html, status) {
        if (Number(status) === 403) return true;
        return /just a moment|attention required|cf-chl|challenges\.cloudflare\.com|verify you are human|error code: 10\d\d/i.test(String(html || ''));
    }
    function webviewMode() {
        try { return !!getVar(CONFIG.webviewFlagKey, ''); } catch (ignore) { return false; }
    }
    function requestByWebView(url, options) {
        if (typeof fetchCodeByWebView === 'undefined') return null;
        try {
            var html = fetchCodeByWebView(url, {
                headers: { 'User-Agent': CONFIG.mobileUa, Referer: origin(url) + '/' },
                timeout: (options && options.webViewTimeout) || CONFIG.webViewTimeout,
                /* 只取 HTML：屏蔽图片/CSS/字体/媒体，显著缩短 WebView onPageFinished 时间 */
                blockRules: CONFIG.blockRules,
                checkJs: $.toString(function () {
                    return !!document.querySelector('video, [class*="thumbnail"], [class*="video"], meta[property="og:title"]');
                })
            });
            if (isUsableHtml(html, options && options.marker)) return { ok: true, url: url, html: html, cookie: '', status: 200, via: 'webview' };
        } catch (error) { return { error: String(error) }; }
        return null;
    }
    function clearPageCache() {
        try {
            if (typeof listMyVarKeys === 'undefined' || typeof clearMyVar === 'undefined') return;
            var all = listMyVarKeys() || [];
            for (var i = 0; i < all.length; i++) if (String(all[i]).indexOf(cacheKey('page.')) === 0) clearMyVar(all[i]);
        } catch (ignore) {}
    }
    function request(url, options) {
        options = options || {};
        var target = absolute(url, CONFIG.source), started = now(), failures = [], sources = sourceOrder(), hardBlocked = false;
        /* 已进入 WebView 模式：直接走与验证页同源的通道 */
        if (webviewMode()) {
            var primary = requestByWebView(target, options);
            if (primary && primary.ok) return primary;
            if (primary && primary.error) failures.push({ source: 'webview', status: 0, reason: primary.error });
        }
        for (var i = 0; i < sources.length; i++) {
            var candidate = replaceHost(target, sources[i]);
            try {
                var raw = fetchPC(candidate, { headers: { 'User-Agent': CONFIG.userAgent, 'Referer': sources[i] + '/' }, timeout: options.timeout || CONFIG.timeout, withStatusCode: true });
                var response = parseResponse(raw), status = Number(response && response.statusCode || 0), body = response && response.body || '';
                if ((status === 0 || (status >= 200 && status < 400)) && isUsableHtml(body, options.marker || '')) {
                    try { storage0.putMyVar(cacheKey('activeSource'), sources[i]); } catch (ignoreStore) {}
                    diagnostic({ event: 'request', ok: true, status: status || 200, ms: now() - started, url: candidate, source: sources[i] });
                    return { ok: true, html: body, url: candidate, status: status || 200, headers: response.headers || {}, cookie: cookieHeader(response.headers) };
                }
                if (isHardBlock(body, status)) {
                    /* 各镜像共用同一套 CF 配置，命中即止损，不再轮询其余域名 */
                    hardBlocked = true;
                    failures.push({ source: sources[i], status: status, reason: 'Cloudflare challenge' });
                    break;
                }
                failures.push({ source: sources[i], status: status, reason: 'content marker missing' });
            } catch (error) {
                failures.push({ source: sources[i], status: 0, reason: String(error) });
            }
        }
        /* WebView 兜底：与内嵌验证网页共用内核与 CookieManager；无任何验证痕迹的硬拦除外（秒级引导） */
        if (typeof fetchCodeByWebView !== 'undefined' && (!hardBlocked || webviewMode())) {
            var fallback = requestByWebView(target, options);
            if (fallback && fallback.ok) {
                try { putVar(CONFIG.webviewFlagKey, '1'); } catch (ignoreFlag) {}
                diagnostic({ event: 'request', ok: true, via: 'webview', ms: now() - started, url: target });
                return fallback;
            }
            if (fallback && fallback.error) failures.push({ source: 'webview', status: 0, reason: fallback.error });
        } else if (hardBlocked) {
            failures.push({ source: 'webview', status: 0, reason: 'skipped: interactive verification required' });
        }
        diagnostic({ event: 'request', ok: false, ms: now() - started, url: target, failures: failures });
        return { ok: false, url: target, hardBlocked: hardBlocked, error: { code: 'NO_CONTENT_RESPONSE', message: hardBlocked ? '站点要求人机验证，请使用「验证并同步」' : '站点未返回可解析内容（已尝试公开备用域名）', failures: failures } };
    }
    function readCache(key, ttl) {
        try { var item = storage0.getMyVar(cacheKey(key)); return item && now() - item.savedAt < ttl * 1000 ? item.value : null; } catch (ignore) { return null; }
    }
    function fetchCached(url, options, ttl) {
        var key = 'page.' + String(url), cached = readCache(key, ttl || 300);
        if (cached) return cached;
        var page = request(url, options);
        /* 成功长缓存；硬拦失败短缓存（30s），避免被拦期间反复烧请求 */
        var storeTtl = page.ok ? (ttl || 300) : (page.hardBlocked ? 30 : 0);
        if (storeTtl) try { storage0.putMyVar(cacheKey(key), { savedAt: now(), value: page }); } catch (ignoreCache) {}
        return page;
    }
    /* Home has three independent feeds. Fetch cache misses concurrently on the last known-good mirror,
       then use the normal mirror fallback only for the individual feeds that still fail. */
    function fetchManyCached(urls, options, ttl) {
        options = options || {}; ttl = ttl || 300;
        var result = [], missing = [], source = sourceOrder()[0];
        for (var i = 0; i < urls.length; i++) {
            var cached = readCache('page.' + String(urls[i]), ttl);
            if (cached) result[i] = cached;
            else missing.push({ index: i, url: urls[i], candidate: replaceHost(absolute(urls[i], CONFIG.source), source) });
        }
        if (missing.length && typeof batchFetch === 'function') {
            try {
                var requests = [];
                for (var j = 0; j < missing.length; j++) requests.push({ url: missing[j].candidate, options: { headers: { 'User-Agent': CONFIG.userAgent, 'Referer': source + '/' }, timeout: options.timeout || CONFIG.timeout, withStatusCode: true } });
                var responses = batchFetch(requests);
                for (var k = 0; k < missing.length; k++) {
                    var response = parseResponse(responses[k]), status = Number(response && response.statusCode || 0), body = response && response.body || '';
                    if ((status === 0 || (status >= 200 && status < 400)) && isUsableHtml(body, options.marker || '')) {
                        var page = { ok: true, html: body, url: missing[k].candidate, status: status || 200, headers: response.headers || {}, cookie: cookieHeader(response.headers) };
                        result[missing[k].index] = page;
                        try { storage0.putMyVar(cacheKey('page.' + String(missing[k].url)), { savedAt: now(), value: page }); storage0.putMyVar(cacheKey('activeSource'), source); } catch (ignore) {}
                    }
                }
            } catch (ignoreBatch) {}
        }
        for (var n = 0; n < missing.length; n++) if (!result[missing[n].index]) result[missing[n].index] = fetchCached(missing[n].url, options, ttl);
        return result;
    }
    function attr(html, name) {
        var match = new RegExp('\\s' + name + '\\s*=\\s*["\\\']([^"\\\']+)["\\\']', 'i').exec(String(html || ''));
        return match ? match[1] : '';
    }
    function meta(html, property) {
        var re = new RegExp('<meta\\b[^>]*(?:property|name)=["\\\']' + property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\\\'][^>]*>', 'ig');
        var tag = re.exec(String(html || ''));
        return tag ? text(attr(tag[0], 'content')) : '';
    }
    /* 新版链接会带服务端轮换的 /dmNN/ 段，去掉后更稳定 */
    function stripDm(url) { return String(url || '').replace(/\/dm\d+\//i, '/'); }
    function unique(items, key) {
        var seen = {}, result = [];
        for (var i = 0; i < items.length; i++) { var value = items[i]; if (value && !seen[value[key]]) { seen[value[key]] = true; result.push(value); } }
        return result;
    }
    /* 新版前端卡片时长由多个 <span x-text> 拼成：<span>3</span>:<span>02</span>:<span>13</span>；
       再新版直接输出一个带换行/缩进的普通 span，故两种都要兼容（否则时长为空） */
    function cardDuration(block) {
        var plain = />\s*(\d{1,2}:\d{2}:\d{2})\s*</.exec(block);
        if (plain) return plain[1];
        var parts = /<span[^>]*>\s*(\d{1,2})\s*<\/span>\s*:\s*<span[^>]*>\s*(\d{2})\s*<\/span>\s*:\s*<span[^>]*>\s*(\d{2})\s*<\/span>/i.exec(block);
        return parts ? (parts[1] + ':' + parts[2] + ':' + parts[3]) : '';
    }
    function parseCards(html, baseUrl, limit) {
        var blocks = String(html || '').match(/<div\b[^>]*class=["'][^"']*\bthumbnail\b[^"']*["'][^>]*>[\s\S]*?<\/div>\s*<\/div>/ig) || [];
        var cards = [];
        for (var i = 0; i < blocks.length; i++) {
            var block = blocks[i], href = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/i.exec(block);
            var image = /<img\b[^>]*data-src=["']([^"']+)["']/i.exec(block) || /<img\b[^>]*src=["']([^"']+)["']/i.exec(block);
            var title = /class=["'][^"']*\btruncate\b[^"']*["'][^>]*>\s*<a\b[^>]*>([\s\S]*?)<\/a>/i.exec(block) || /class=["'][^"']*text-secondary[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(block);
            var badge = /absolute[^"']*bottom-1[^"']*left-1[^"']*[^>]*>([\s\S]*?)<\//i.exec(block);
            var url = stripDm(absolute(href && href[1], baseUrl).split('#')[0]), name = text(title && title[1]);
            if (url && name && /\/cn\//i.test(url) && !/\/undefined/i.test(url)) cards.push({ url: url, title: name, image: absolute(image && image[1], baseUrl), duration: cardDuration(block), badge: text(badge && badge[1]) });
        }
        cards = unique(cards, 'url');
        return typeof limit === 'number' ? cards.slice(0, limit) : cards;
    }
    function parseCount(html) {
        var match = String(html || '').match(/([\d,]+)\s*条影片/);
        return match ? match[1].replace(/,/g, '') : '';
    }
    /* 别名：与 jable 内核接口保持一致，重构版页面层按同名调用 */
    function parseTotal(html) { return parseCount(html); }
    /* 列表统一入口：命中缓存则直接用，避免页面层各写一遍 fetchCached + parseCards */
    function getList(url, marker, limit) {
        var page = fetchCached(url, { marker: marker || 'thumbnail' }, 300);
        if (!page.ok) return page;
        var items = parseCards(page.html, page.url);
        if (limit > 0) items = items.slice(0, limit);
        return { ok: true, page: page, items: items, total: parseTotal(page.html) };
    }
    /* 目录页每条有两类锚点（名称 + 数量），按出现顺序把数量并到上一条 */
    function parseDirectory(html, baseUrl, pathPattern, exclude) {
        var source = String(html || '');
        var anchors = source.match(/<a\b[^>]*href=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/ig) || [];
        var result = [];
        for (var i = 0; i < anchors.length; i++) {
            var href = /href=["']([^"']+)["']/i.exec(anchors[i]);
            var url = stripDm(absolute(href && href[1], baseUrl).split('#')[0]);
            if (!url || !pathPattern.test(url) || (exclude && exclude.test(url))) continue;
            var label = text(anchors[i]);
            if (!label) continue;
            var countMatch = /^(\d[\d,]*)\s*(?:条影片|videos?)$/i.exec(label);
            if (countMatch) {
                if (result.length) result[result.length - 1].count = countMatch[1].replace(/,/g, '') + ' 部';
                continue;
            }
            /* 女优页把名称和数量放在同一个 <a> 里（名称 + 5669 条影片 + 出道年），也从标签里兜底取数量 */
            var inlineCount = /(\d[\d,]*)\s*(?:条影片|videos?)/i.exec(label);
            result.push({ url: url, title: label.replace(/\s*\d[\d,]*\s*(?:条影片|videos?).*$/i, '').trim(), count: inlineCount ? (inlineCount[1].replace(/,/g, '') + ' 部') : '' });
        }
        return unique(result, 'url');
    }
    function parseGenres(html, baseUrl) {
        return parseDirectory(html, baseUrl, /\/genres\/[^/?#]+/i, /\/genres\/?(?:\?|$)/i);
    }
    function parseActresses(html, baseUrl) {
        return parseDirectory(html, baseUrl, /\/actresses\/[^/?#]+/i, /\/actresses\/(?:ranking)?\/?(?:\?|$)/i);
    }
    function field(html, label) {
        var escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var match = new RegExp('<span[^>]*>\\s*' + escaped + '\\s*[:：]?\\s*<\\/span>([\\s\\S]{0,1200}?)<\\/div>', 'i').exec(String(html || ''));
        return match ? text(match[1]) : '';
    }
    function fieldLinks(html, label, baseUrl) {
        var escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var match = new RegExp('<span[^>]*>\\s*' + escaped + '\\s*[:：]?\\s*<\\/span>([\\s\\S]{0,3000}?)<\\/div>', 'i').exec(String(html || ''));
        if (!match) return [];
        var anchors = match[1].match(/<a\b[^>]*href=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/ig) || [], result = [];
        for (var i = 0; i < anchors.length; i++) {
            var href = /href=["']([^"']+)["']/i.exec(anchors[i]), url = stripDm(absolute(href && href[1], baseUrl)), title = text(anchors[i]);
            if (url && title) result.push({ title: title, url: url });
        }
        return unique(result, 'url');
    }
    function duration(seconds) {
        seconds = Number(seconds || 0); if (!seconds) return '';
        var h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
        return h + ':' + ('0' + m).slice(-2) + ':' + ('0' + s).slice(-2);
    }
    function parseDirectUrls(html) {
        var match = /directUrls\s*:\s*JSON\.parse\('([\s\S]*?)'\)/i.exec(String(html || ''));
        if (!match) return [];
        try {
            var encoded = match[1].replace(/\\u0022/g, '"').replace(/\\\//g, '/').replace(/\\\\/g, '\\');
            var urls = JSON.parse(encoded), result = [];
            for (var i = 0; i < urls.length; i++) if (/^https?:\/\//i.test(urls[i])) result.push(urls[i]);
            return result;
        } catch (ignore) { return []; }
    }
    function unpackPacker(script) {
        var match = /eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([^']*)'\.split\('\|'\)/i.exec(String(script || ''));
        if (!match) return '';
        var packed = match[1], base = Number(match[2]), count = Number(match[3]), keys = match[4].split('|');
        if (base <= 1 || base > 62 || count < 0 || count > 200000) return '';
        function toBase(number) {
            var digits = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', value = '';
            if (!number) return '0';
            while (number) { value = digits.charAt(number % base) + value; number = Math.floor(number / base); }
            return value;
        }
        var map = {};
        for (var i = 0; i < count; i++) map[toBase(i)] = keys[i] || toBase(i);
        return packed.replace(/\b(\w+)\b/g, function (all, key) { return map.hasOwnProperty(key) ? map[key] : key; });
    }
    function parseQualities(html) {
        var source = String(html || ''), bodies = [source], scripts = source.match(/<script\b[^>]*>[\s\S]*?<\/script>/ig) || [], result = [], seen = {};
        for (var i = 0; i < scripts.length; i++) if (scripts[i].indexOf('eval(function') >= 0 && scripts[i].indexOf('m3u8') >= 0) bodies.push(unpackPacker(scripts[i]));
        function add(url, quality) {
            /* 解包后的 URL 常以 \ 结尾，必须连同 ),; 一起去掉，否则播放器打不开 */
            url = String(url || '').replace(/\\\//g, '/').replace(/[\\),;]+$/, '');
            if (!/^https?:\/\//i.test(url) || seen[url]) return;
            seen[url] = true;
            var number = Number(quality || 0), inferred = /(2160|1440|1080|720|540|480|360|240)p?/i.exec(url);
            /* Player variable names can be stale/misleading (for example source720 -> /1080p/). */
            if (inferred) number = Number(inferred[1]);
            result.push({ url: url, quality: number ? number + 'p' : '自动', value: number });
        }
        for (var j = 0; j < bodies.length; j++) {
            /* 解码脚本里的 m3u8 常带 \/ 转义，先归一化再匹配 */
            var body = String(bodies[j] || '').replace(/\\\//g, '/'), named = /(?:source|quality|video)[_-]?(2160|1440|1080|720|540|480|360|240)?\s*=\s*(["'])(https?:\/\/[^'"\s;]+?\.m3u8[^'"\s;]*)\2/ig, match;
            while ((match = named.exec(body))) add(match[3], match[1]);
            var urls = body.match(/https?:\/\/[^'"\s<>]+?\.m3u8[^'"\s<>]*/ig) || [];
            for (var k = 0; k < urls.length; k++) {
                var before = body.slice(Math.max(0, body.indexOf(urls[k]) - 80), body.indexOf(urls[k]));
                var hinted = /(2160|1440|1080|720|540|480|360|240)p?/i.exec(before);
                add(urls[k], hinted && hinted[1]);
            }
        }
        result.sort(function (a, b) { return b.value - a.value; });
        return result;
    }
    function parseM3u8(html) { var streams = parseQualities(html); return streams.length ? streams[0].url : ''; }
    /* 剧情简介：优先 og/meta description，缺失时回退到 .line-clamp-2 摘要块 */
    function parseDescription(html) {
        var value = meta(html, 'og:description') || meta(html, 'description') || '';
        if (value) return value;
        var match = /<div[^>]*class=["'][^"']*\bline-clamp-2\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(String(html || ''));
        return match ? text(match[1]) : '';
    }
    /* 兼容两种调用：老的 (html, baseUrl) 与页面对象 {html, url}（重构版页面层使用） */
    function parseDetail(input, baseUrl) {
        var page = (input && typeof input === 'object' && typeof input.html === 'string') ? input : { html: String(input || ''), url: baseUrl };
        var html = page.html, url = page.url || baseUrl;
        var chineseTitle = meta(html, 'og:title') || meta(html, 'twitter:title');
        return {
            url: url,
            /* The /cn page exposes the localized title through og:title; keep the Japanese field separately. */
            title: chineseTitle || field(html, '标题'),
            image: meta(html, 'og:image'),
            description: parseDescription(html),
            releaseDate: field(html, '发行日期') || meta(html, 'og:video:release_date'),
            duration: duration(meta(html, 'og:video:duration')),
            code: field(html, '番号'), originalTitle: field(html, '标题'),
            actors: fieldLinks(html, '女优', url), maleActors: fieldLinks(html, '男优', url).concat(fieldLinks(html, '男優', url)), genres: fieldLinks(html, '类型', url),
            series: fieldLinks(html, '系列', url), makers: fieldLinks(html, '发行商', url),
            directors: fieldLinks(html, '导演', url), labels: fieldLinks(html, '标籤', url),
            qualities: parseQualities(html), mediaUrl: parseM3u8(html), directUrls: parseDirectUrls(html), recommendations: parseCards(html, url, 12)
        };
    }
    function readList(name) { try { return storage0.getMyVar(cacheKey(name)) || []; } catch (ignore) { return []; } }
    function writeList(name, list) { try { storage0.putMyVar(cacheKey(name), list); } catch (ignore) {} return list; }
    /* 与 jable 内核同名的存取接口，供重构版页面层使用 */
    function listValue(name, fallback) {
        try { var value = storage0.getMyVar(cacheKey(name)); return (value === null || typeof value === 'undefined') ? fallback : value; } catch (ignore) { return fallback; }
    }
    function setValue(name, value) { try { storage0.putMyVar(cacheKey(name), value); } catch (ignore) {} return value; }
    function addSearch(keyword) {
        keyword = text(keyword);
        if (!keyword) return [];
        var history = listValue('searches', []);
        var result = [keyword];
        for (var i = 0; i < history.length; i++) if (history[i] !== keyword) result.push(history[i]);
        return setValue('searches', result.slice(0, 30));
    }
    function clearLocal() {
        var keys = ['favorites', 'history', 'searches', 'diagnostics'];
        for (var i = 0; i < keys.length; i++) setValue(keys[i], []);
        clearPageCache();
    }
    function isFavorite(url) { var list = readList('favorites'); for (var i = 0; i < list.length; i++) if (list[i].url === url) return true; return false; }
    function toggleFavorite(item) {
        var list = readList('favorites'), next = [], exists = false;
        for (var i = 0; i < list.length; i++) { if (list[i].url === item.url) exists = true; else next.push(list[i]); }
        if (!exists) next.unshift({ url: item.url, title: item.title || '', image: item.image || '', savedAt: now() });
        writeList('favorites', next); return !exists;
    }
    function addHistory(item) {
        var list = readList('history'), next = [{ url: item.url, title: item.title || '', image: item.image || '', viewedAt: now() }];
        for (var i = 0; i < list.length && next.length < CONFIG.limits.history; i++) if (list[i].url !== item.url) next.push(list[i]);
        return writeList('history', next);
    }
    function getPlayQuality() { try { return storage0.getMyVar(cacheKey('playQuality')) || 'highest'; } catch (ignore) { return 'highest'; } }
    function setPlayQuality(value) {
        var allowed = ['highest', '1080', '720', '540', '480', '360'];
        value = String(value || 'highest'); if (allowed.indexOf(value) < 0) value = 'highest';
        try { storage0.putMyVar(cacheKey('playQuality'), value); } catch (ignore) {}
        return value;
    }
    function selectStream(detail, preference) {
        var streams = detail && detail.qualities || [], preferred = String(preference || getPlayQuality()), target = Number(preferred || 0);
        if (!streams.length) return { url: detail && detail.mediaUrl || '', quality: '' };
        if (!target) return streams[0];
        for (var i = 0; i < streams.length; i++) if (streams[i].value === target) return streams[i];
        for (var j = 0; j < streams.length; j++) if (streams[j].value && streams[j].value < target) return streams[j];
        return streams[streams.length - 1];
    }
    function playerHeaders(page) {
        var result = { Referer: page.url, Origin: origin(page.url), 'User-Agent': CONFIG.userAgent };
        if (page.cookie) result.Cookie = page.cookie;
        return result;
    }
    var exported = { config: CONFIG, text: text, absolute: absolute, request: request, fetchCached: fetchCached, fetchManyCached: fetchManyCached, getList: getList, parseCards: parseCards, parseCount: parseCount, parseTotal: parseTotal, parseGenres: parseGenres, parseActresses: parseActresses, parseQualities: parseQualities, parseDetail: parseDetail, playerHeaders: playerHeaders, getPlayQuality: getPlayQuality, setPlayQuality: setPlayQuality, selectStream: selectStream, isFavorite: isFavorite, toggleFavorite: toggleFavorite, addHistory: addHistory, addSearch: addSearch, listValue: listValue, setValue: setValue, readList: readList, writeList: writeList, clearLocal: clearLocal, clearPageCache: clearPageCache };
    if (typeof module !== 'undefined' && module.exports) module.exports = exported;
    if (typeof $ !== 'undefined') $.exports = exported;
})();
