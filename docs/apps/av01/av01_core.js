/*
 * AV01（www.av01.media/cn）公共内核：HTTP + Cloudflare 兜底 + JSON API 解析 + 缓存 + 播放链路。
 *
 * 站点是 React SPA（`/cn` 只是前端路由），服务端 HTML 只有 4KB 空壳 —— 完全不能做 HTML 解析，
 * 必须走它的 REST JSON API：https://www.av01.media/api/v1/...
 *   - 列表/搜索：videos/types/{latest,hottest}、videos/search（POST）、videos/{actress,maker,tag}/{id}
 *   - 详情：videos/{id}    相似：videos/{id}/similars
 *   - 目录：actresses|makers|tags/by-score?page=&limit=
 *   - 封面：files.iw01.xyz/covers/{id}/800.webp?token_v2=&expires=&ip=  （签名来自 geo.js）
 *   - 播放：geo.js --token_v2--> customers.iw01.xyz/api/v1/videos/{id}/cdn-access --access_token-->
 *           api/v1/videos/{id}/manifest/master.m3u8（公开）取 sv1/sv2/sv3 分片清单，
 *           再请求 api/v1/videos/{id}/manifest/<variant>?access_token=xx 让服务端把 token 注入分片 URL
 *           （customers 上的分片裸链 403，必须带 access_token；master 裸链不带 token，不能直接播）。
 * 多语言：接口对象自带 title_translations/name_translations/...，取 .cn 即为简体中文，无需 locale 参数
 *        （唯独 videos/search 需要 ?lang=cn）。
 */
(function () {
    var CONFIG = {
        version: '17',
        source: 'https://www.av01.media',
        localePath: '/cn',
        lang: 'cn',
        apiBase: 'https://www.av01.media/api/v1',
        cdnHost: 'https://customers.iw01.xyz',
        mediaHost: 'https://files.iw01.xyz',
        geoUrl: 'https://files.iw01.xyz/edge/geo.js?json',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        mobileUa: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        webViewTimeout: 12000,
        webviewFlagKey: 'av01.webviewMode',
        timeout: 8000,
        cachePrefix: 'av01.',
        limits: { homeSection: 6, homeMakers: 2, page: 24, directory: 100, history: 200, abrMaxHeight: 720 }
    };

    function now() { return new Date().getTime(); }
    function cacheKey(key) { return CONFIG.cachePrefix + key; }
    function site() { return CONFIG.source + CONFIG.localePath; }
    function api(path) { return CONFIG.apiBase + path; }
    function encode(value) { return encodeURIComponent(String(value === null || typeof value === 'undefined' ? '' : value)); }

    function decode(value) {
        return String(value === null || typeof value === 'undefined' ? '' : value)
            .replace(/&#(\d+);/g, function (all, code) { return String.fromCharCode(Number(code)); })
            .replace(/&#x([0-9a-f]+);/gi, function (all, code) { return String.fromCharCode(parseInt(code, 16)); })
            .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
            .replace(/&#39;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
    }
    function text(value) { return decode(String(value === null || typeof value === 'undefined' ? '' : value).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim(); }
    function unique(items, key) {
        var seen = {}, result = [];
        for (var i = 0; i < items.length; i++) { var value = items[i]; if (value && value[key] && !seen[value[key]]) { seen[value[key]] = true; result.push(value); } }
        return result;
    }

    /* ---------------- HTTP / Cloudflare ---------------- */
    function baseHeaders() { return { 'User-Agent': CONFIG.userAgent, Referer: site() + '/', Accept: 'application/json, text/plain, */*' }; }
    function parseResponse(raw) {
        if (!raw) return null;
        try { var parsed = JSON.parse(raw); if (parsed && typeof parsed.body !== 'undefined') return parsed; } catch (ignore) {}
        return { body: String(raw), statusCode: 200, headers: {} };
    }
    function isUsable(raw) { return raw && String(raw).length > 1; }
    function isHardBlock(raw, status) {
        if (Number(status) === 403) return true;
        return /just a moment|attention required|cf-chl|challenges\.cloudflare\.com|verify you are human|error code: 10\d\d/i.test(String(raw || ''));
    }
    function webviewMode() {
        try { return !!getVar(CONFIG.webviewFlagKey, ''); } catch (ignore) { return false; }
    }
    function requestByWebView(url, options) {
        if (typeof fetchCodeByWebView === 'undefined') return null;
        try {
            var raw = fetchCodeByWebView(url, {
                headers: { 'User-Agent': CONFIG.mobileUa, Referer: site() + '/' },
                timeout: (options && options.webViewTimeout) || CONFIG.webViewTimeout,
                checkJs: $.toString(function () { return !!document.body && document.body.innerText.length > 0; })
            });
            if (isUsable(raw)) return { ok: true, text: String(raw), url: url, status: 200, via: 'webview', headers: {} };
        } catch (error) { return { error: String(error) }; }
        return null;
    }
    function diagnostic(entry) {
        try { var all = storage0.getMyVar(cacheKey('diagnostics')) || []; all.unshift(entry); storage0.putMyVar(cacheKey('diagnostics'), all.slice(0, 30)); } catch (ignore) {}
    }
    /* GET 一段文本（JSON 或 m3u8），失败链：直连 -> webview */
    function requestText(url, options) {
        options = options || {};
        var started = now(), failures = [], hardBlocked = false;
        if (webviewMode()) {
            var primary = requestByWebView(url, options);
            if (primary && primary.ok) return primary;
            if (primary && primary.error) failures.push({ source: 'webview', status: 0, reason: primary.error });
        }
        try {
            var raw = fetchPC(url, { headers: options.headers || baseHeaders(), timeout: options.timeout || CONFIG.timeout, withStatusCode: true });
            var response = parseResponse(raw), status = Number((response && response.statusCode) || 0), body = (response && response.body) || '';
            if ((status === 0 || (status >= 200 && status < 400)) && isUsable(body)) {
                diagnostic({ event: 'request', ok: true, status: status || 200, ms: now() - started, url: url });
                return { ok: true, text: body, url: url, status: status || 200, headers: (response && response.headers) || {} };
            }
            if (isHardBlock(body, status)) { hardBlocked = true; failures.push({ source: 'direct', status: status, reason: 'Cloudflare challenge' }); }
            else failures.push({ source: 'direct', status: status, reason: 'empty response' });
        } catch (error) { failures.push({ source: 'direct', status: 0, reason: String(error) }); }
        if (typeof fetchCodeByWebView !== 'undefined' && (!hardBlocked || webviewMode())) {
            var fallback = requestByWebView(url, options);
            if (fallback && fallback.ok) {
                try { putVar(CONFIG.webviewFlagKey, '1'); } catch (ignoreFlag) {}
                return fallback;
            }
            if (fallback && fallback.error) failures.push({ source: 'webview', status: 0, reason: fallback.error });
        } else if (hardBlocked) {
            failures.push({ source: 'webview', status: 0, reason: 'skipped: interactive verification required' });
        }
        diagnostic({ event: 'request', ok: false, ms: now() - started, url: url, failures: failures });
        return { ok: false, url: url, hardBlocked: hardBlocked, error: { message: hardBlocked ? '站点要求人机验证，请使用「验证并同步」' : '接口未返回内容', failures: failures } };
    }
    function requestJson(url, options) {
        var res = requestText(url, options);
        if (!res.ok) return res;
        try { return { ok: true, data: JSON.parse(res.text), url: res.url, status: res.status }; }
        catch (error) { return { ok: false, url: url, error: { message: '接口返回内容不是合法 JSON' } }; }
    }
    function postJson(url, payload, options) {
        options = options || {};
        var body = typeof payload === 'string' ? payload : JSON.stringify(payload);
        var headers = { 'User-Agent': CONFIG.userAgent, Referer: site() + '/', 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*' };
        try {
            var raw = fetchPC(url, { method: 'POST', body: body, headers: headers, timeout: options.timeout || CONFIG.timeout, withStatusCode: true });
            var response = parseResponse(raw), status = Number((response && response.statusCode) || 0), textBody = (response && response.body) || '';
            if ((status === 0 || (status >= 200 && status < 400)) && isUsable(textBody)) {
                try { return { ok: true, data: JSON.parse(textBody), url: url, status: status || 200 }; }
                catch (ignore) { return { ok: false, url: url, error: { message: '搜索接口返回内容不是合法 JSON' } }; }
            }
            return { ok: false, url: url, hardBlocked: isHardBlock(textBody, status), error: { message: isHardBlock(textBody, status) ? '站点要求人机验证，请使用「验证并同步」' : '搜索接口请求失败（HTTP ' + status + '）' } };
        } catch (error) { return { ok: false, url: url, error: { message: String(error) } }; }
    }
    function readCache(key, ttl) {
        try { var item = storage0.getMyVar(cacheKey(key)); return item && now() - item.savedAt < ttl * 1000 ? item.value : null; } catch (ignore) { return null; }
    }
    function writeCache(key, value) { try { storage0.putMyVar(cacheKey(key), { savedAt: now(), value: value }); } catch (ignore) {} return value; }
    function fetchJson(url, ttl, options) {
        var key = 'json.' + url, cached = readCache(key, ttl || 300);
        if (cached) return cached;
        var res = requestJson(url, options);
        if (res.ok) writeCache(key, res);
        else if (res.hardBlocked) writeCache(key, res);
        return res;
    }
    function postJsonCached(url, payload, ttl) {
        var key = 'post.' + url + '|' + JSON.stringify(payload), cached = readCache(key, ttl || 300);
        if (cached) return cached;
        var res = postJson(url, payload);
        if (res.ok) writeCache(key, res);
        return res;
    }
    function clearPageCache() {
        try {
            if (typeof listMyVarKeys === 'undefined' || typeof clearMyVar === 'undefined') return;
            var all = listMyVarKeys() || [];
            for (var i = 0; i < all.length; i++) {
                var k = String(all[i]);
                if (k.indexOf(cacheKey('json.')) === 0 || k.indexOf(cacheKey('text.')) === 0 || k.indexOf(cacheKey('post.')) === 0) clearMyVar(k);
            }
        } catch (ignore) {}
    }

    /* ---------------- 多语言字段 ---------------- */
    function localized(obj, field) {
        if (!obj) return '';
        var map = field ? obj[field] : obj;
        if (map && typeof map === 'object') {
            var value = map[CONFIG.lang];
            if (value) return text(value);
            if (map.en) return text(map.en);
        }
        return '';
    }
    function nameOf(obj) {
        if (!obj) return '';
        return localized(obj, 'name_translations') || text(obj.name) || text(obj.title);
    }

    /* ---------------- 图片（签名 URL） ---------------- */
    /* geo.js 返回 {token_v2, expires, ip, r2_cover, ...}，封面/头像都要带这三个参数，否则 401 */
    function geo() {
        var res = fetchJson(CONFIG.geoUrl, 480);
        return res.ok ? res.data : null;
    }
    function signedMedia(path) {
        var g = geo();
        if (!g) return '';
        var sep = String(path).indexOf('?') >= 0 ? '&' : '?';
        return CONFIG.mediaHost + '/' + path + sep + 'token_v2=' + encode(g.token_v2) + '&expires=' + encode(g.expires) + '&ip=' + encode(g.ip);
    }
    function coverUrl(id, size) {
        var g = geo();
        if (!g) return '';
        if (g.r2_cover === false) return signedMedia('covers/' + id + '/640.jpg');
        return signedMedia('covers/' + id + '/' + (size || 800) + '.webp');
    }
    function assetUrl(key) { return key ? signedMedia(String(key)) : ''; }

    /* ---------------- URL / 卡片 ---------------- */
    function durationText(seconds) {
        var value = Math.max(0, parseInt(seconds, 10) || 0);
        var h = Math.floor(value / 3600), m = Math.floor((value % 3600) / 60), s = value % 60;
        if (h > 0) return h + 'h' + (m < 10 ? '0' : '') + m + 'm';
        if (m > 0) return m + 'm' + (s < 10 ? '0' : '') + s + 's';
        return s + 's';
    }
    function dateText(iso) {
        var match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
        return match ? match[1] + '-' + match[2] + '-' + match[3] : '';
    }
    function viewsText(views) {
        var value = parseInt(views, 10) || 0;
        if (value >= 10000) { var w = value / 10000; return (w >= 100 ? Math.round(w) : Math.round(w * 10) / 10) + '万'; }
        return String(value);
    }
    function videoUrl(video) {
        var slug = text(video.dvd_id || video.dmm_id || video.id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        return site() + '/video/' + video.id + (slug ? '/' + slug : '');
    }
    function actressUrl(actress) { return site() + '/actress/' + actress.id + '/' + encode(nameOf(actress)); }
    function makerUrl(maker) { return site() + '/maker/' + (maker.id || '') + '/' + encode(localized(maker, 'name_translations') || maker.title || maker.name || ''); }
    function tagUrl(tag) { return site() + '/tag/' + tag.id + '/' + encode(nameOf(tag)); }
    function idFrom(url, kind) {
        var match = new RegExp('/' + kind + '/(\\d+)').exec(String(url || ''));
        return match ? match[1] : '';
    }

    function parseVideo(video) {
        if (!video || typeof video !== 'object') return null;
        var title = localized(video, 'title_translations') || text(video.title);
        if (!title && !video.id) return null;
        var actresses = [], tags = [];
        for (var i = 0; i < (video.actresses || []).length; i++) {
            var a = video.actresses[i];
            actresses.push({ id: a.id, title: nameOf(a), image: assetUrl(a.image_r2_key), url: actressUrl(a) });
        }
        for (var j = 0; j < (video.tags || []).length; j++) {
            var t = video.tags[j];
            tags.push({ id: t.id, title: nameOf(t), url: tagUrl(t) });
        }
        var maker = video.maker_id ? { id: video.maker_id, title: localized(video, 'maker_translations') || text(video.maker), image: assetUrl(video.maker_image_r2_key), url: makerUrl({ id: video.maker_id, name_translations: video.maker_translations, title: text(video.maker) }) } : null;
        return {
            id: video.id,
            code: text(video.dvd_id || video.dmm_id),
            title: title,
            image: coverUrl(video.id, 800),
            url: videoUrl(video),
            duration: durationText(video.duration),
            durationSeconds: parseInt(video.duration, 10) || 0,
            views: viewsText(video.views),
            viewsRaw: parseInt(video.views, 10) || 0,
            date: dateText(video.published_time || video.uploaded_time),
            maker: maker,
            actresses: actresses,
            tags: tags
        };
    }
    function parseVideoList(data) { return parseVideoArray(data && data.videos); }
    function parseVideoArray(list) {
        var result = [];
        for (var i = 0; i < (list || []).length; i++) { var card = parseVideo(list[i]); if (card) result.push(card); }
        return unique(result, 'url');
    }
    function paginationTotal(data) {
        var page = data && data.pagination;
        return page && page.total ? String(page.total) : '';
    }

    /* ---------------- 首页 / 列表 / 搜索 ---------------- */
    function home() {
        var url = api('/videos/types/combined?hottest_page=1&hottest_limit=' + CONFIG.limits.homeSection +
            '&latest_page=1&latest_limit=' + CONFIG.limits.homeSection +
            '&hottest_makers_page=1&hottest_makers_limit=' + CONFIG.limits.homeMakers + '&lang=' + CONFIG.lang);
        var res = fetchJson(url, 300);
        if (!res.ok) return res;
        var data = res.data || {}, sections = [];
        if (parseVideoList(data.hottest_videos).length) sections.push({ title: '热门视频', more: site() + '/videos/hottest', items: parseVideoList(data.hottest_videos) });
        if (parseVideoList(data.latest_videos).length) sections.push({ title: '最新更新', more: site() + '/videos/latest', items: parseVideoList(data.latest_videos) });
        var makers = data.hottest_makers || [];
        for (var i = 0; i < makers.length; i++) {
            var entry = makers[i], maker = entry.maker || {}, items = parseVideoArray(entry.videos);
            if (!items.length) continue;
            sections.push({ title: '热门片商 · ' + (nameOf(maker) || '片商'), more: makerUrl({ id: maker.id, name_translations: maker.name_translations, name: maker.name }), items: items });
        }
        return { ok: true, sections: sections, url: url };
    }
    function feed(kind, page, limit) {
        var type = kind === 'hottest' ? 'hottest' : 'latest';
        var url = api('/videos/types/' + type + '?page=' + (page || 1) + '&limit=' + (limit || CONFIG.limits.page) + '&lang=' + CONFIG.lang);
        var res = fetchJson(url, 300);
        if (!res.ok) return res;
        return { ok: true, items: parseVideoList(res.data), total: paginationTotal(res.data), url: url };
    }
    function search(keyword, page, limit) {
        var query = text(keyword);
        if (!query) return { ok: false, url: '', error: { message: '请输入搜索关键词' } };
        var url = api('/videos/search?lang=' + CONFIG.lang);
        var payload = { query: query, pagination: { page: page || 1, limit: limit || CONFIG.limits.page } };
        var res = postJsonCached(url, payload, 300);
        if (!res.ok) return res;
        return { ok: true, items: parseVideoList(res.data), total: paginationTotal(res.data), url: url };
    }
    /* 目录页：actresses|makers|tags/by-score（站点 /cn/actresses 用的就是这个，limit=100） */
    function directory(kind, page, limit) {
        var map = { actress: { path: '/actresses/by-score', key: 'actresses' }, maker: { path: '/makers/by-score', key: 'makers' }, tag: { path: '/tags/by-score', key: 'tags' } };
        var conf = map[kind] || map.tag;
        var url = api(conf.path + '?page=' + (page || 1) + '&limit=' + (limit || CONFIG.limits.directory));
        var res = fetchJson(url, 43200);
        if (!res.ok) return res;
        var source = (res.data && res.data[conf.key]) || [], entries = [];
        for (var i = 0; i < source.length; i++) {
            var item = source[i], title = nameOf(item);
            if (!title) continue;
            var url_ = kind === 'actress' ? actressUrl(item) : (kind === 'maker' ? makerUrl({ id: item.id, name_translations: item.name_translations, name: item.name }) : tagUrl(item));
            entries.push({ id: item.id, title: title, image: assetUrl(item.image_r2_key), count: item.videos_count ? String(item.videos_count) : '', url: url_ });
        }
        return { ok: true, items: unique(entries, 'url'), total: paginationTotal(res.data), url: url };
    }
    /* 女优 / 片商 / 标签下的影片列表 */
    function videosBy(kind, id, page, limit) {
        var path = kind === 'actress' ? '/videos/actress/' : (kind === 'maker' ? '/videos/maker/' : '/videos/tag/');
        var url = api(path + id + '?page=' + (page || 1) + '&limit=' + (limit || CONFIG.limits.page));
        var res = fetchJson(url, 300);
        if (!res.ok) return res;
        return { ok: true, items: parseVideoList(res.data), total: paginationTotal(res.data), url: url };
    }

    /* ---------------- 详情 / 播放 ---------------- */
    function detail(id) {
        var res = fetchJson(api('/videos/' + id), 1800);
        if (!res.ok) return res;
        var video = res.data || {};
        var parsed = parseVideo(video);
        if (!parsed) return { ok: false, url: res.url, error: { message: '详情数据解析失败' } };
        parsed.description = localized(video, 'description_translations') || text(video.description);
        parsed.published = dateText(video.published_time || video.uploaded_time);
        parsed.servers = [];
        return { ok: true, detail: parsed, url: res.url };
    }
    function similars(id, limit) {
        var res = fetchJson(api('/videos/' + id + '/similars?page=1&limit=' + (limit || 9)), 1800);
        if (!res.ok) return res;
        return { ok: true, items: parseVideoList(res.data), url: res.url };
    }
    /* 播放清单：#EXT-X-STREAM-INF 后紧跟的一行就是分片清单相对地址 */
    function parseVariants(text) {
        var lines = String(text || '').split(/\r?\n/), list = [], pending = null;
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].replace(/^\s+|\s+$/g, '');
            if (!line) continue;
            if (/^#EXT-X-STREAM-INF/i.test(line)) {
                pending = { height: 0, bandwidth: 0, file: '' };
                var resolution = /RESOLUTION=\d+x(\d+)/i.exec(line);
                if (resolution) pending.height = Number(resolution[1]);
                var bandwidth = /BANDWIDTH=(\d+)/i.exec(line);
                if (bandwidth) pending.bandwidth = Number(bandwidth[1]);
                continue;
            }
            if (line.charAt(0) === '#') continue;
            if (pending) { pending.file = line; list.push(pending); pending = null; }
        }
        return list;
    }
    function variantLabel(variant) {
        if (variant.height) return variant.height + 'P';
        if (variant.bandwidth) return Math.round(variant.bandwidth / 1000) + 'K';
        return '线路';
    }
    /* 拼出「服务端会把 access_token 注入每段分片」的清单地址 */
    function manifestUrl(id, file, accessToken) {
        var target = /^https?:\/\//i.test(String(file || '')) ? String(file) : api('/videos/' + id + '/manifest/' + file);
        var sep = target.indexOf('?') >= 0 ? '&' : '?';
        return target + sep + 'access_token=' + encode(accessToken);
    }
    function variantUrl(id, file, accessToken) { return manifestUrl(id, file, accessToken); }
    /* 把服务端 master.m3u8 改写成「每个 variant 都自带 access_token 的绝对地址」的 master。
       站点前端就是这么做的（index-*.js 里把 master 换成 base64 data URI 交给播放器），
       目的是让播放器自己做多码率自适应（ABR）；我们改写后落成本地 .m3u8 播放，效果等价。
       直接给 3 条单码率清单会跳过 ABR，默认吃满 1080P，弱网就卡。
       maxHeight：丢弃高于该高度的 variant（站点自己的 Lce() 也是这么按上限裁的），
       避免 ABR 在链路撑不住的档位上反复试探（表现就是网速 0↔几兆来回跳）。 */
    function buildMaster(text, id, accessToken, maxHeight) {
        var lines = String(text || '').split(/\r?\n/), out = [], pending = null;
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i], trimmed = line.replace(/^\s+|\s+$/g, '');
            if (!trimmed) continue;
            if (/^#EXT-X-STREAM-INF/i.test(trimmed)) {
                var res = /RESOLUTION=\d+x(\d+)/i.exec(trimmed);
                pending = { tag: trimmed, height: res ? Number(res[1]) : 0 };
                continue;
            }
            if (/#EXT-X-I-FRAME-STREAM-INF/i.test(trimmed)) {
                var ires = /RESOLUTION=\d+x(\d+)/i.exec(trimmed);
                if (maxHeight && ires && Number(ires[1]) > maxHeight) continue;
                out.push(trimmed.replace(/URI="([^"]+)"/i, function (all, uri) { return 'URI="' + manifestUrl(id, uri, accessToken) + '"'; }));
                continue;
            }
            if (trimmed.charAt(0) === '#') { out.push(trimmed); continue; }
            if (pending !== null) {
                if (!(maxHeight && pending.height && pending.height > maxHeight)) {
                    out.push(pending.tag);
                    out.push(manifestUrl(id, trimmed, accessToken));
                }
                pending = null;
                continue;
            }
            out.push(manifestUrl(id, trimmed, accessToken));
        }
        return out.join('\n');
    }
    /* master 拉取失败时按已知的 sv1/sv2/sv3 兜底拼一份 */
    function synthMaster(variants, id, accessToken, maxHeight) {
        var lines = ['#EXTM3U', '#EXT-X-VERSION:3'];
        for (var i = 0; i < variants.length; i++) {
            if (!variants[i].height) continue;
            if (maxHeight && variants[i].height > maxHeight) continue;
            lines.push('#EXT-X-STREAM-INF:BANDWIDTH=' + (variants[i].bandwidth || variants[i].height * 4000) + ',RESOLUTION=' + Math.round(variants[i].height * 16 / 9) + 'x' + variants[i].height);
            lines.push(manifestUrl(id, variants[i].file, accessToken));
        }
        return lines.length > 2 ? lines.join('\n') : '';
    }
    /* 把 master 落到本地（几百字节）。海阔播放本地 m3u8 是官方支持的用法（见 help_js.md 的 cacheM3u8）。
       返回 file:// 绝对路径；writeFile/getPath 不可用时返回空串，调用方回退到直连清单。 */
    function localMaster(id, content) {
        if (!content) return '';
        try {
            if (typeof writeFile !== 'function' || typeof getPath !== 'function') return '';
            var target = 'hiker://files/cache/av01_master_' + id + '.m3u8';
            writeFile(target, content);
            return getPath(target) || '';
        } catch (ignore) { return ''; }
    }
    function resolveMedia(id) {
        if (!id) return { ok: false, error: { message: '缺少视频 id' } };
        var g = geo();
        if (!g) return { ok: false, error: { message: '无法获取站点令牌（geo.js），请稍后重试或改用网页嗅探' } };
        var cdnUrl = CONFIG.cdnHost + '/api/v1/videos/' + id + '/cdn-access?token_v2=' + encode(g.token_v2) + '&expires=' + encode(g.expires) + '&ip=' + encode(g.ip);
        var cdn = requestJson(cdnUrl, { headers: { 'User-Agent': CONFIG.userAgent, Referer: site() + '/', Accept: 'application/json, text/plain, */*' } });
        if (!cdn.ok || !cdn.data || !cdn.data.access_token) return { ok: false, error: { message: '未取到 CDN 访问令牌（cdn-access）' } };
        var accessToken = cdn.data.access_token;
        var master = requestText(api('/videos/' + id + '/manifest/master.m3u8'), { headers: { 'User-Agent': CONFIG.userAgent, Referer: site() + '/', Accept: '*/*' } });
        var variants = master.ok ? parseVariants(master.text) : [];
        if (!variants.length) variants = [{ height: 360, bandwidth: 0, file: 'index90-sv1-v1-a1.m3u8?ro=0' }, { height: 720, bandwidth: 0, file: 'index90-sv2-v1-a1.m3u8' }, { height: 1080, bandwidth: 0, file: 'index90-sv3-v1-a1.m3u8' }];
        variants = variants.sort(function (a, b) { return (b.height || b.bandwidth) - (a.height || a.bandwidth); });

        var masterText = master.ok ? buildMaster(master.text, id, accessToken, CONFIG.limits.abrMaxHeight) : '';
        if (!masterText) masterText = synthMaster(variants, id, accessToken, CONFIG.limits.abrMaxHeight);
        /* 上限裁剪后若一条 variant 都不剩（例如该片只有 1080P），退回到不裁剪，避免空清单 */
        if (!/#EXT-X-STREAM-INF/i.test(masterText)) {
            masterText = master.ok ? buildMaster(master.text, id, accessToken, 0) : '';
            if (!masterText) masterText = synthMaster(variants, id, accessToken, 0);
        }
        var local = localMaster(id, masterText);

        var urls = [], names = [];
        if (local) { urls.push(local); names.push('自动'); }
        for (var i = 0; i < variants.length; i++) {
            urls.push(manifestUrl(id, variants[i].file, accessToken));
            names.push(variantLabel(variants[i]));
        }
        return { ok: true, urls: urls, names: names, accessToken: accessToken, master: masterText, local: !!local, variants: variants };
    }
    function playerHeaders() { return { 'User-Agent': CONFIG.mobileUa, Referer: site() + '/' }; }
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
        config: CONFIG, site: site, api: api, text: text, decode: decode, localized: localized, nameOf: nameOf,
        requestText: requestText, requestJson: requestJson, postJson: postJson, fetchJson: fetchJson,
        postJsonCached: postJsonCached, clearPageCache: clearPageCache, isHardBlock: isHardBlock, webviewMode: webviewMode,
        geo: geo, signedMedia: signedMedia, coverUrl: coverUrl, assetUrl: assetUrl,
        durationText: durationText, dateText: dateText, viewsText: viewsText,
        videoUrl: videoUrl, actressUrl: actressUrl, makerUrl: makerUrl, tagUrl: tagUrl, idFrom: idFrom,
        parseVideo: parseVideo, parseVideoList: parseVideoList, parseVideoArray: parseVideoArray, paginationTotal: paginationTotal,
        home: home, feed: feed, search: search, directory: directory, videosBy: videosBy,
        detail: detail, similars: similars, parseVariants: parseVariants, variantLabel: variantLabel,
        manifestUrl: manifestUrl, variantUrl: variantUrl, buildMaster: buildMaster, synthMaster: synthMaster,
        localMaster: localMaster, resolveMedia: resolveMedia, playerHeaders: playerHeaders,
        isFavorite: isFavorite, toggleFavorite: toggleFavorite, addHistory: addHistory, addSearch: addSearch,
        listValue: listValue, setValue: setValue, readList: readList, writeList: writeList, clearLocal: clearLocal
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = exported;
    if (typeof $ !== 'undefined') $.exports = exported;
})();
