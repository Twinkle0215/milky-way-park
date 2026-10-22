// ===== sw.js (서비스 워커) =====
// 하는 일: 사이트 파일(HTML/JS/CSS/단어목록/글꼴/Firebase 라이브러리)을 기기에 저장해 두었다가
//  - 인터넷이 없어도 사이트가 열리게 하고
//  - 인터넷이 있어도 저장된 파일을 먼저 보여줘서 훨씬 빨리 뜨게 한다.
// Firebase(로그인/데이터베이스)와 유튜브 요청은 절대 건드리지 않는다 → 로그인/랭킹/온라인 대전은 그대로 인터넷으로 동작.
//
// 평소에는 이 파일을 고칠 필요가 없다. (index.html 에 적힌 파일 목록을 자동으로 읽어서 저장함)
// 이 파일의 "동작 방식"을 바꿨을 때만 아래 VERSION 숫자를 올리면 된다.
const VERSION = 'v1';
const STATIC_CACHE = 'mwp-static-' + VERSION;
const RUNTIME_CACHE = 'mwp-runtime-' + VERSION;

// 저장해도 되는 바깥 주소(라이브러리/글꼴). 이 목록에 없는 주소는 서비스 워커가 무시하고 그대로 인터넷으로 보낸다.
const CDN_HOSTS = ['cdnjs.cloudflare.com', 'www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const EXTRA_FILES = ['./words.txt', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const INDEX_URL = new URL('./index.html', self.location).href;

const isCdn = (u) => CDN_HOSTS.indexOf(u.hostname) !== -1;
const isHandled = (u) => u.origin === self.location.origin || isCdn(u);
const OFFLINE_TEXT = '오프라인이에요. 인터넷에 연결한 상태로 한 번 접속해야 이후부터 오프라인에서 열려요.';

// 바깥 주소는 CORS 방식으로 먼저 시도(저장 용량이 정직하게 계산됨), 안 되면 no-cors 로 재시도
async function fetchSmart(url) {
    const sameOrigin = new URL(url).origin === self.location.origin;
    try {
        // 같은 사이트 파일은 서버에 "바뀐 게 있나?" 확인하고 받음 (호스팅이 파일을 몇 분씩 캐시해도 옛날 파일이 저장되지 않게)
        const r = await fetch(new Request(url, { mode: 'cors', credentials: 'omit', cache: sameOrigin ? 'no-cache' : 'default' }));
        if (r && (r.ok || r.type === 'opaque')) return r;
    } catch (e) { /* 아래에서 재시도 */ }
    if (sameOrigin) return null;
    try {
        const r = await fetch(new Request(url, { mode: 'no-cors' }));
        if (r && (r.ok || r.type === 'opaque')) return r;
    } catch (e) { /* 포기 */ }
    return null;
}

// CSS 안에 적힌 글꼴 파일(woff2)도 같이 저장 (Font Awesome 아이콘이 오프라인에서도 보이게)
async function cacheFontsFromCss(cssText, cssUrl, cache) {
    const re = /url\(\s*["']?([^"')]+?)["']?\s*\)/g;
    const found = new Set();
    let m;
    while ((m = re.exec(cssText))) {
        if (/\.woff2(\?|#|$)/.test(m[1])) { try { found.add(new URL(m[1], cssUrl).href); } catch (e) { } }
    }
    await Promise.all([...found].map(async (href) => {
        try { const r = await fetchSmart(href); if (r) await cache.put(href, r); } catch (e) { }
    }));
}

async function precache() {
    const cache = await caches.open(STATIC_CACHE);
    const res = await fetch(INDEX_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('index.html 을 불러오지 못함');
    const html = await res.clone().text();
    await cache.put(INDEX_URL, res);

    const urls = new Set(EXTRA_FILES.map((p) => new URL(p, self.location).href));
    const re = /(?:src|href)\s*=\s*["']([^"']+)["']/g;
    let m;
    while ((m = re.exec(html))) {
        const raw = m[1].trim();
        if (!raw || raw[0] === '#' || /^(javascript:|mailto:|data:|tel:)/i.test(raw)) continue;
        let u;
        try { u = new URL(raw, INDEX_URL); } catch (e) { continue; }
        if (!isHandled(u) || u.pathname === '/' || u.href === INDEX_URL) continue;
        urls.add(u.href);
    }

    await Promise.all([...urls].map(async (href) => {
        try {
            const r = await fetchSmart(href);
            if (!r) return;
            const copy = r.clone();
            await cache.put(href, r);
            const u = new URL(href);
            if (u.hostname === 'cdnjs.cloudflare.com' && /\.css(\?|$)/.test(u.pathname) && copy.ok) {
                await cacheFontsFromCss(await copy.text(), href, cache);
            }
        } catch (e) { /* 일부 실패해도 계속 */ }
    }));

    // 예전 버전 파일(index.html 에서 더 이상 안 쓰는 같은 사이트 파일) 정리
    const keys = await cache.keys();
    await Promise.all(keys.map((k) => {
        const ku = new URL(k.url);
        if (ku.origin === self.location.origin && ku.href !== INDEX_URL && !urls.has(ku.href)) return cache.delete(k);
    }));
}

self.addEventListener('install', (event) => {
    event.waitUntil(precache().catch((e) => console.warn('[sw] 미리 저장 실패', e)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names.filter((n) => n.indexOf('mwp-') === 0 && n !== STATIC_CACHE && n !== RUNTIME_CACHE).map((n) => caches.delete(n)));
        await self.clients.claim();
    })());
});

// 페이지가 "지금 불러온 파일 목록"을 알려주면 아직 저장 안 된 것을 저장 (처음 방문에도 글꼴까지 오프라인 준비)
self.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type !== 'cache-urls' || !Array.isArray(data.urls)) return;
    event.waitUntil((async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        for (const href of data.urls) {
            try {
                const u = new URL(href);
                if (!isHandled(u) || u.href === INDEX_URL) continue;
                if (await caches.match(href, { ignoreVary: true })) continue;
                const r = await fetchSmart(href);
                if (r) await cache.put(href, r);
            } catch (e) { }
        }
    })());
});

function fetchWithTimeout(req, ms, init) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), ms);
        fetch(req, init).then((r) => { clearTimeout(t); resolve(r); }, (e) => { clearTimeout(t); reject(e); });
    });
}

// 페이지 이동(index.html): 인터넷이 되면 최신 것을(3초 안에), 안 되면 저장된 것을
async function handleNavigate(req) {
    const cache = await caches.open(STATIC_CACHE);
    try {
        const res = await fetchWithTimeout(INDEX_URL, 3000, { cache: 'no-cache' }); // 항상 서버에 최신 여부 확인
        if (res && res.ok) { cache.put(INDEX_URL, res.clone()); return res; }
    } catch (e) { /* 저장본 사용 */ }
    const cached = await cache.match(INDEX_URL, { ignoreSearch: true, ignoreVary: true });
    if (cached) return cached;
    return new Response(OFFLINE_TEXT, { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

// 같은 사이트의 JS/CSS/단어목록: 저장본을 먼저 보여주고(빠름), 뒤에서 몰래 새 버전을 받아 둠
async function staleWhileRevalidate(event, req) {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(req, { ignoreVary: true });
    const network = fetch(req, { cache: 'no-cache' }).then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
    }).catch(() => null);
    if (cached) { event.waitUntil(network); return cached; }
    const res = await network;
    return res || new Response(OFFLINE_TEXT, { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

// 바깥 라이브러리/글꼴(주소에 버전이 들어 있어서 안 바뀜): 저장본이 있으면 그걸 사용
async function cacheFirst(req) {
    const cached = await caches.match(req, { ignoreVary: true });
    if (cached) return cached;
    try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(req, res.clone());
        }
        return res;
    } catch (e) {
        return new Response('', { status: 504 });
    }
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (!isHandled(url)) return;              // Firebase / 유튜브 등은 그대로 인터넷으로
    if (req.headers.has('range')) return;     // 음악/영상 부분 요청은 건드리지 않음
    if (req.mode === 'navigate') { event.respondWith(handleNavigate(req)); return; }
    if (url.origin === self.location.origin) event.respondWith(staleWhileRevalidate(event, req));
    else event.respondWith(cacheFirst(req));
});
