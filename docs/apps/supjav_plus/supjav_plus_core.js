/*
 * SupJav+（supjav.com/zh）公共内核：与原版 supjav 并存的性能优化版。
 * 相对原版的三处改动：
 *   1. fetchCodeByWebView 带 blockRules：只取 HTML，屏蔽图片/CSS/字体/媒体等静态资源，加快 WebView 加载；
 *   2. 复用 fetch 响应里的最终 URL（HttpHelper 在 withStatusCode 时返回 url 字段），
 *      成功线路只发 1 次中转请求，不再额外发 redirect:false 取 Location；
 *   3. 新增 resolveBest(servers)：详情页不再提前解析，点播放时才逐线路解析。
 * 站点分类/搜索/目录均为服务端渲染，卡片选择器 .post；播放地址需要两级解密：
 *   详情页 .btn-server[data-link] --反转--> lk1.supremejav.com/supjav.php?c=... --302-->
 *   第三方播放页 #video_player[data-hash]（m3u8）。
 */
(function () {
    var CONFIG = {
        version: '17',
        source: 'https://supjav.com',
        /* 中文站点（qTranslate 语言子目录），标题/分类/标签均为简体中文 */
        localePath: '/zh',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
        mobileUa: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        webViewTimeout: 12000,
        webviewFlagKey: 'supjavplus.webviewMode',
        timeout: 6000,
        cachePrefix: 'supjavplus.',
        /* WebView 抓取时屏蔽的静态资源（只要 HTML，图片/CSS/字体/媒体都用不到） */
        blockRules: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico',
            '.css', '.woff', '.woff2', '.ttf', '.otf', '.eot',
            '.mp4', '.m3u8', '.ts', '.mp3', '.webm'],
        /* 播放中转域名：不带 CF 人机验证，只需带 Referer */
        playerHost: 'https://lk1.supremejav.com',
        limits: { home: 6, history: 200, playerServers: 3 }
    };

    function now() { return new Date().getTime(); }
    function cacheKey(key) { return CONFIG.cachePrefix + key; }
    function site() { return CONFIG.source + CONFIG.localePath; }

    function decode(value) {
        return String(value || '')
            .replace(/&#(\d+);/g, function (all, code) { return String.fromCharCode(Number(code)); })
            .replace(/&#x([0-9a-f]+);/gi, function (all, code) { return String.fromCharCode(parseInt(code, 16)); })
            .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
            .replace(/&#39;/gi, "'").replace(/&apos;/gi, "'").replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>').replace(/&hellip;/gi, '…').replace(/&mdash;/gi, '—')
            .replace(/&ndash;/gi, '–');
    }
    function text(value) {
        return decode(String(value || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
    }
    function absolute(value, baseUrl) {
        var url = decode(String(value || '').replace(/&amp;/gi, '&')).trim();
        if (!url || /^javascript:/i.test(url) || /^data:/i.test(url)) return '';
        if (/^https?:\/\//i.test(url)) return url;
        var host = /^https?:\/\/[^/]+/i.exec(String(baseUrl || CONFIG.source));
        return (host ? host[0] : CONFIG.source) + (url.charAt(0) === '/' ? url : '/' + url);
    }
    function origin(url) { var found = /^https?:\/\/[^/]+/i.exec(String(url || '')); return found ? found[0] : CONFIG.source; }
    function reverse(value) { return String(value || '').split('').reverse().join(''); }
    function unique(items, key) {
        var seen = {}, result = [];
        for (var i = 0; i < items.length; i++) { var value = items[i]; if (value && !seen[value[key]]) { seen[value[key]] = true; result.push(value); } }
        return result;
    }
    function attrOf(tag, name) {
        var match = new RegExp('\\s' + name + '\\s*=\\s*["\\\']([^"\\\']*)["\\\']', 'i').exec(String(tag || ''));
        return match ? match[1] : '';
    }
    function meta(html, property) {
        var re = new RegExp('<meta\\b[^>]*(?:property|name)=["\\\']' + property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\\\'][^>]*>', 'ig');
        var tag = re.exec(String(html || ''));
        return tag ? text(attrOf(tag[0], 'content')) : '';
    }

    /* ---------------- HTTP / Cloudflare ---------------- */
    function parseResponse(raw) {
        if (!raw) return null;
        try { var parsed = JSON.parse(raw); if (parsed && typeof parsed.body !== 'undefined') return parsed; } catch (ignore) {}
        return { body: String(raw), statusCode: 200, headers: {} };
    }
    /* fetch 在 withStatusCode/withHeaders 时返回重定向后的最终 URL（字段 url），可省掉一次取 Location 的请求 */
    function finalUrlOf(response, fallback) {
        var value = response && response.url;
        return (typeof value === 'string' && /^https?:\/\//i.test(value)) ? value : (fallback || '');
    }
    function isUsableHtml(html, marker) {
        if (!html || html.length < 300) return false;
        if (marker && String(html).indexOf(marker) >= 0) return true;
        if (/just a moment|verify you are human|captcha|access denied|enable javascript/i.test(html)) return false;
        return !marker;
    }
    /* 硬拦截特征：命中即必须人工验证，继续轮询只会白等 */
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
                    return !!(document.querySelector('.post, .archive-title, .video-wrap, h1') || document.querySelector('meta[name=description]'));
                })
            });
            if (isUsableHtml(html, options && options.marker)) return { ok: true, url: url, html: html, cookie: '', status: 200, via: 'webview' };
        } catch (error) { return { error: String(error) }; }
        return null;
    }
    function diagnostic(entry) {
        try {
            var all = storage0.getMyVar(cacheKey('diagnostics')) || [];
            all.unshift(entry); storage0.putMyVar(cacheKey('diagnostics'), all.slice(0, 30));
        } catch (ignore) {}
    }
    function request(url, options) {
        options = options || {};
        var target = absolute(url, site()), started = now(), failures = [], hardBlocked = false;
        if (webviewMode()) {
            var primary = requestByWebView(target, options);
            if (primary && primary.ok) return primary;
            if (primary && primary.error) failures.push({ source: 'webview', status: 0, reason: primary.error });
        }
        try {
            var raw = fetchPC(target, { headers: { 'User-Agent': CONFIG.userAgent, Referer: site() + '/' }, timeout: options.timeout || CONFIG.timeout, withStatusCode: true });
            var response = parseResponse(raw), status = Number((response && response.statusCode) || 0), body = (response && response.body) || '';
            if ((status === 0 || (status >= 200 && status < 400)) && isUsableHtml(body, options.marker || '')) {
                diagnostic({ event: 'request', ok: true, status: status || 200, ms: now() - started, url: target });
                return { ok: true, html: body, url: target, status: status || 200, headers: (response && response.headers) || {}, cookie: '' };
            }
            if (isHardBlock(body, status)) { hardBlocked = true; failures.push({ source: 'direct', status: status, reason: 'Cloudflare challenge' }); }
            else failures.push({ source: 'direct', status: status, reason: 'content marker missing' });
        } catch (error) { failures.push({ source: 'direct', status: 0, reason: String(error) }); }

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
        return { ok: false, url: target, hardBlocked: hardBlocked, error: { code: 'NO_CONTENT_RESPONSE', message: hardBlocked ? '站点要求人机验证，请使用「验证并同步」' : '站点未返回可解析内容', failures: failures } };
    }
    /* 非主站的外部请求（播放中转/第三方播放页）：直连，失败即失败 */
    function requestExternal(url, options) {
        options = options || {};
        try {
            var raw = fetchPC(url, { headers: { 'User-Agent': CONFIG.mobileUa, Referer: options.referer || origin(url) + '/' }, timeout: options.timeout || CONFIG.timeout, withStatusCode: true });
            var response = parseResponse(raw), status = Number((response && response.statusCode) || 0), body = (response && response.body) || '';
            var finalUrl = finalUrlOf(response, '');
            if (status === 0 || (status >= 200 && status < 400)) return { ok: true, html: body, url: finalUrl || url, finalUrl: finalUrl, status: status || 200, headers: (response && response.headers) || {} };
            return { ok: false, url: finalUrl || url, finalUrl: finalUrl, status: status, error: { message: '播放地址请求失败（HTTP ' + status + '）' } };
        } catch (error) { return { ok: false, url: url, finalUrl: '', error: { message: String(error) } }; }
    }
    /* 不跟随跳转，取 302 的 Location（第三方播放页真实地址），用于网页嗅探兜底 */
    function redirectUrl(url, options) {
        options = options || {};
        try {
            var raw = fetchPC(url, { headers: { 'User-Agent': CONFIG.mobileUa, Referer: options.referer || origin(url) + '/' }, timeout: options.timeout || CONFIG.timeout, redirect: false, withHeaders: true });
            var response = parseResponse(raw) || {}, headers = response.headers || {};
            var location = headers['Location'] || headers['location'] || headers['LOCATION'];
            if (location instanceof Array) location = location[0];
            return location ? absolute(location, url) : '';
        } catch (ignore) { return ''; }
    }
    function readCache(key, ttl) {
        try { var item = storage0.getMyVar(cacheKey(key)); return item && now() - item.savedAt < ttl * 1000 ? item.value : null; } catch (ignore) { return null; }
    }
    function fetchCached(url, options, ttl) {
        var key = 'page.' + String(url), cached = readCache(key, ttl || 300);
        if (cached) return cached;
        var page = request(url, options);
        var storeTtl = page.ok ? (ttl || 300) : (page.hardBlocked ? 30 : 0);
        if (storeTtl) try { storage0.putMyVar(cacheKey(key), { savedAt: now(), value: page }); } catch (ignoreCache) {}
        return page;
    }
    function clearPageCache() {
        try {
            if (typeof listMyVarKeys === 'undefined' || typeof clearMyVar === 'undefined') return;
            var all = listMyVarKeys() || [];
            for (var i = 0; i < all.length; i++) if (String(all[i]).indexOf(cacheKey('page.')) === 0) clearMyVar(all[i]);
        } catch (ignore) {}
    }

    /* ---------------- 列表解析 ---------------- */
    /* 卡片：<div class="post"><a class="img" href><img data-original|src></a>
       <div class="con"><h3><a>标题</a></h3><div class="meta">日期<span class="date">N Views</span></div></div></div> */
    function cardFrom(block, metaHtml, baseUrl) {
        var anchorTag = /<a\b[^>]*>/i.exec(block);
        var href = anchorTag ? attrOf(anchorTag[0], 'href') : '';
        var url = absolute(href, baseUrl);
        if (!url) return null;
        var image = /<img\b[^>]*data-original=["']([^"']+)["']/i.exec(block) || /<img\b[^>]*src=["']([^"']+)["']/i.exec(block);
        var imageUrl = absolute(image && image[1], baseUrl);
        if (/^data:/i.test(String((image && image[1]) || '')) && !/data-original/i.test(block)) imageUrl = '';
        var titleHtml = /<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(block) || /<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(block);
        var title = titleHtml ? text(titleHtml[1]) : (anchorTag ? decode(attrOf(anchorTag[0], 'title')) : '');
        if (!title) return null;
        var metaText = text(metaHtml);
        var dateMatch = /(\d{4}\/\d{2}\/\d{2})/.exec(metaText);
        var viewsMatch = /([\d,]+)\s*Views?/i.exec(metaText);
        return {
            url: url, title: title, image: imageUrl,
            date: dateMatch ? dateMatch[1] : '',
            views: viewsMatch ? viewsMatch[1].replace(/,/g, '') : '',
            description: metaText
        };
    }
    function parseCards(html, baseUrl, limit) {
        var source = String(html || '');
        var re = /<div class="post">([\s\S]*?)<div class="meta">([\s\S]*?)<\/div>/ig, match, cards = [];
        while ((match = re.exec(source))) {
            var card = cardFrom(match[1], match[2], baseUrl);
            if (card) cards.push(card);
        }
        cards = unique(cards, 'url');
        return typeof limit === 'number' ? cards.slice(0, limit) : cards;
    }
    /* 首页分区：每个 <div class="archive-title"> 起一个新分区（标题 + 数量 + More 链接 + .posts 卡片） */
    function parseHomeSections(html, baseUrl) {
        var parts = String(html || '').split('<div class="archive-title">');
        var sections = [];
        for (var i = 1; i < parts.length; i++) {
            var chunk = parts[i];
            var heads = chunk.match(/<h1[^>]*>([\s\S]*?)<\/h1>/ig) || [];
            var titles = [], h;
            for (var j = 0; j < heads.length; j++) { h = text(heads[j]); if (h) titles.push(h); }
            var title = titles[0] || '';
            var count = '';
            for (var k = 1; k < titles.length; k++) { var numeric = /^\(?([\d,]+)\)?$/.exec(titles[k]); if (numeric) { count = numeric[1].replace(/,/g, ''); break; } }
            var moreTag = /<a\b[^>]*class="more"[^>]*>/i.exec(chunk);
            var more = moreTag ? absolute(attrOf(moreTag[0], 'href'), baseUrl) : '';
            var items = parseCards(chunk, baseUrl);
            if (!title || !items.length) continue;
            sections.push({ title: title, count: count, more: more, subtitle: titles.slice(1).filter(function (t) { return !/^\(?[\d,]+\)?$/.test(t); })[0] || '', items: items });
        }
        return sections;
    }
    /* 目录页（女优/制作商/类别）：<a href="...">名称 (123)</a> */
    function parseDirectory(html, baseUrl, pattern) {
        var anchors = String(html || '').match(/<a\b[^>]*href=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/ig) || [];
        var result = [];
        for (var i = 0; i < anchors.length; i++) {
            var href = attrOf(anchors[i], 'href');
            var url = absolute(href, baseUrl);
            if (!url || (pattern && !pattern.test(url))) continue;
            var label = text(anchors[i]);
            if (!label) continue;
            var countMatch = /^(.*?)\s*\(([\d,]+)\)\s*$/.exec(label);
            result.push({
                title: countMatch ? countMatch[1].trim() : label,
                count: countMatch ? countMatch[2].replace(/,/g, '') : '',
                url: url
            });
        }
        return unique(result, 'url');
    }
    function parseCast(html, baseUrl) { return parseDirectory(html, baseUrl, /\/category\/cast\/(?!page\/)[^/?#]+/i); }
    function parseMaker(html, baseUrl) { return parseDirectory(html, baseUrl, /\/category\/maker\/(?!page\/)[^/?#]+/i); }
    function parseTags(html, baseUrl) { return parseDirectory(html, baseUrl, /\/tag\/(?!page\/)[^/?#]+/i); }
    function parseTotal(html) {
        var match = /<h1[^>]*>[^<]*<\/h1>\s*<h1[^>]*>\s*\(([\d,]+)\)/i.exec(String(html || ''));
        if (match) return match[1].replace(/,/g, '');
        match = /(?:Result\s*For[^()]*|)\s*\((\d[\d,]*)\)\s*<\/h1>/i.exec(String(html || ''));
        return match ? match[1].replace(/,/g, '') : '';
    }
    function getList(url, marker, limit) {
        var page = fetchCached(url, { marker: marker || 'class="post"' }, 300);
        if (!page.ok) return page;
        var items = parseCards(page.html, page.url);
        if (limit > 0) items = items.slice(0, limit);
        return { ok: true, page: page, items: items, total: parseTotal(page.html) };
    }

    /* ---------------- 详情 / 播放 ---------------- */
    function videoCode(title) {
        var value = String(title || '');
        var match = /^\[[^\]]*\]\s*([A-Za-z0-9]+[- ]\d+[A-Za-z]?)/.exec(value) || /^([A-Za-z0-9]+[- ]\d+[A-Za-z]?)/.exec(value);
        return match ? match[1].replace(/\s+/g, ' ').trim() : '';
    }
    function fieldLink(scope, label) {
        var escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var match = new RegExp('<span[^>]*>\\s*' + escaped + '\\s*:?\\s*<\\/span>\\s*<a\\b[^>]*href=["\\\']([^"\\\']+)["\\\'][^>]*>([\\s\\S]*?)<\\/a>', 'i').exec(String(scope || ''));
        return match ? { url: absolute(match[1]), title: text(match[2]) } : null;
    }
    function anchors(scope, baseUrl) {
        var list = String(scope || '').match(/<a\b[^>]*href=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/ig) || [], result = [];
        for (var i = 0; i < list.length; i++) {
            var url = absolute(attrOf(list[i], 'href'), baseUrl), title = text(list[i]);
            if (url && title) result.push({ url: url, title: title });
        }
        return unique(result, 'url');
    }
    /* 剧情简介：优先 .post-content；空的才回退 meta description，并过滤站点通用模板文案 */
    function parseDescription(html) {
        var content = text((/<div class="post-content">([\s\S]*?)<\/div>/i.exec(String(html || '')) || [])[1] || '');
        if (content) return content;
        var value = meta(html, 'description');
        if (!value || /在线视频观看和下载|Full Movie Streaming And Download/i.test(value)) return '';
        return value;
    }
    function parseDetail(input, baseUrl) {
        var page = (input && typeof input === 'object' && typeof input.html === 'string') ? input : { html: String(input || ''), url: baseUrl };
        var html = page.html, url = page.url || baseUrl;
        var catsBlock = (/<div class="cats">([\s\S]*?)<\/div>/i.exec(html) || [])[1] || '';
        var tagsBlock = (/<div class="tags">([\s\S]*?)<\/div>/i.exec(html) || [])[1] || '';
        var bg = /player-wrap[^>]*background-image:\s*url\(([^)]+)\)/i.exec(html) || /<div class="post-meta[^>]*>[\s\S]{0,400}?<img\b[^>]*src=["']([^"']+)["']/i.exec(html);
        var views = /<span class="views">\s*([\d,]+)\s*Views?/i.exec(html);
        var title = text(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html) && /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)[1]);
        if (!title) title = text(/<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(html) && /<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(html)[1]);
        var category = (/<p class="cat">\s*<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i.exec(catsBlock));
        return {
            url: url,
            title: title,
            code: videoCode(title),
            image: absolute(bg && bg[1], url),
            views: views ? views[1].replace(/,/g, '') : '',
            description: parseDescription(html),
            category: category ? { url: absolute(category[1], url), title: text(category[2]) } : null,
            maker: fieldLink(catsBlock, 'Maker'),
            cast: fieldLink(catsBlock, 'Cast'),
            tags: anchors(tagsBlock, url),
            servers: playerServers(html),
            recommendations: parseCards(html, url, 12)
        };
    }
    function playerServers(html) {
        var list = String(html || '').match(/<a\b[^>]*class="btn-server[^"]*"[^>]*>[\s\S]*?<\/a>/ig) || [], result = [];
        for (var i = 0; i < list.length; i++) {
            var tag = /<a\b[^>]*>/i.exec(list[i])[0];
            var link = attrOf(tag, 'data-link');
            var name = text(list[i].replace(tag, ''));
            if (link) result.push({ name: name || ('线路' + (i + 1)), token: link });
        }
        if (!result.length) {
            var all = String(html || '').match(/<a\b[^>]*data-link="[^"]*"[^>]*>[\s\S]*?<\/a>/ig) || [];
            for (var j = 0; j < all.length; j++) {
                var t = /<a\b[^>]*>/i.exec(all[j])[0], token = attrOf(t, 'data-link');
                if (token) result.push({ name: text(all[j].replace(t, '')) || ('线路' + (j + 1)), token: token });
            }
        }
        return result;
    }
    /* 第三方播放页：优先 #video_player[data-hash]，否则扫全页 m3u8 */
    function parsePlayerPage(html) {
        var source = String(html || '').replace(/\\\//g, '/');
        var match = /id="video_player"[^>]*data-hash=["']([^"']+)["']/i.exec(source) || /data-hash=["']([^"']+)["']/i.exec(source);
        if (match && /^https?:\/\//i.test(match[1])) return match[1];
        var any = source.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>\\]*/i);
        return any ? any[0] : '';
    }
    /* Dean-Edwards 打包脚本（fc2stream 等）解包，找出 hls/m3u8 线路 */
    function unpackPacker(script) {
        var match = /eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]*?\}\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([^']*)'\.split\('\|'\)/i.exec(String(script || ''));
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
    function packedMedia(html) {
        var scripts = String(html || '').match(/<script\b[^>]*>[\s\S]*?<\/script>/ig) || [];
        for (var i = 0; i < scripts.length; i++) {
            if (scripts[i].indexOf('eval(function') < 0) continue;
            var unpacked = unpackPacker(scripts[i]);
            if (!unpacked) continue;
            var links = /links\s*=\s*(\{[\s\S]{0,2000}?\})/i.exec(unpacked);
            if (links) {
                var hls = /["']hls[0-9]?["']\s*:\s*["']([^"']+\.(?:m3u8|txt)[^"']*)["']/i.exec(links[1]);
                if (hls) return hls[1].replace(/\\\//g, '/');
            }
            var file = /["']?file["']?\s*[:=]\s*["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i.exec(unpacked);
            if (file) return file[1].replace(/\\\//g, '/');
        }
        return '';
    }
    /* 从一个播放页 HTML 里尽最大努力提取直链媒体（m3u8/mp4） */
    function extractMedia(html) {
        var direct = parsePlayerPage(html);
        if (direct) return direct;
        var packed = packedMedia(html);
        if (packed) return packed;
        var any = String(html || '').replace(/\\\//g, '/').match(/https?:\/\/[^"'\s<>\\]+\.(?:m3u8|mp4)[^"'\s<>\\]*/i);
        return any ? any[0] : '';
    }
    /* 解析单条站点线路：能直链就返回 media，否则给出第三方播放页地址供网页嗅探。
       中转请求本身会返回重定向后的最终 URL，成功时无需再发一次 redirect:false 请求。 */
    function resolveServer(server) {
        server = server || {};
        if (!server.token) return { name: server.name || '', media: '', pageUrl: '', cUrl: '' };
        var cUrl = CONFIG.playerHost + '/supjav.php?c=' + reverse(server.token);
        var page = requestExternal(cUrl, { referer: CONFIG.playerHost + '/' });
        var pageUrl = page.finalUrl || '';
        if (page.ok) {
            var media = extractMedia(page.html);
            if (media) return { name: server.name || '线路', media: media, pageUrl: pageUrl, cUrl: cUrl };
        }
        /* 响应没有最终 URL（旧版内核不返回 url 字段）时才补发一次 redirect:false 取 Location */
        if (!pageUrl) pageUrl = redirectUrl(cUrl, { referer: CONFIG.playerHost + '/' }) || '';
        return { name: server.name || '线路', media: '', pageUrl: pageUrl || cUrl, cUrl: cUrl };
    }
    /* 逐条线路尝试直到解出直链：详情页点播放时才调用（懒解析，避免拖慢详情页） */
    function resolveBest(servers) {
        var list = servers || [], failures = [], fallbackPage = '';
        var max = Math.min(list.length, CONFIG.limits.playerServers);
        for (var i = 0; i < max; i++) {
            var resolved = resolveServer(list[i]);
            if (resolved.pageUrl && !fallbackPage) fallbackPage = resolved.pageUrl;
            if (resolved.media) return { ok: true, mediaUrl: resolved.media, server: resolved.name, pageUrl: resolved.pageUrl || '', failures: failures };
            failures.push({ server: resolved.name, reason: 'no direct media (third-party player)' });
        }
        return { ok: false, mediaUrl: '', server: '', pageUrl: fallbackPage, failures: failures, error: { message: '未解析到直达播放地址（站点多个线路均为第三方播放器）' } };
    }
    /* 从详情页 HTML 解析线路再逐条尝试（兼容旧调用） */
    function resolveMedia(html) { return resolveBest(playerServers(html)); }
    function playerHeaders(page) {
        return { Referer: CONFIG.playerHost + '/', Origin: CONFIG.playerHost, 'User-Agent': CONFIG.mobileUa };
    }

    /* ---------------- 本地数据 ---------------- */
    function readList(name) { try { return storage0.getMyVar(cacheKey(name)) || []; } catch (ignore) { return []; } }
    function writeList(name, list) { try { storage0.putMyVar(cacheKey(name), list); } catch (ignore) {} return list; }
    function listValue(name, fallback) {
        try { var value = storage0.getMyVar(cacheKey(name)); return (value === null || typeof value === 'undefined') ? fallback : value; } catch (ignore) { return fallback; }
    }
    function setValue(name, value) { try { storage0.putMyVar(cacheKey(name), value); } catch (ignore) {} return value; }
    function addSearch(keyword) {
        keyword = text(keyword);
        if (!keyword) return [];
        var history = listValue('searches', []), result = [keyword];
        for (var i = 0; i < history.length; i++) if (history[i] !== keyword) result.push(history[i]);
        return setValue('searches', result.slice(0, 30));
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
    function clearLocal() {
        var keys = ['favorites', 'history', 'searches', 'diagnostics'];
        for (var i = 0; i < keys.length; i++) setValue(keys[i], []);
        clearPageCache();
    }

    var exported = {
        config: CONFIG, site: site, text: text, decode: decode, absolute: absolute,
        request: request, requestExternal: requestExternal, fetchCached: fetchCached, clearPageCache: clearPageCache,
        isHardBlock: isHardBlock, webviewMode: webviewMode,
        parseCards: parseCards, parseHomeSections: parseHomeSections, parseDirectory: parseDirectory,
        parseCast: parseCast, parseMaker: parseMaker, parseTags: parseTags, parseTotal: parseTotal, getList: getList,
        parseDetail: parseDetail, parsePlayerPage: parsePlayerPage, playerServers: playerServers,
        unpackPacker: unpackPacker, packedMedia: packedMedia, extractMedia: extractMedia,
        redirectUrl: redirectUrl, resolveServer: resolveServer, resolveBest: resolveBest, resolveMedia: resolveMedia,
        playerHeaders: playerHeaders,
        isFavorite: isFavorite, toggleFavorite: toggleFavorite, addHistory: addHistory, addSearch: addSearch,
        listValue: listValue, setValue: setValue, readList: readList, writeList: writeList, clearLocal: clearLocal
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = exported;
    if (typeof $ !== 'undefined') $.exports = exported;
})();
