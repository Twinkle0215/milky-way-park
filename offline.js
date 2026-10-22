// ===== offline.js =====
// 인터넷이 없을 때를 위한 도우미 모음 (가장 먼저 로드됨)
//  - 화면 위쪽 "오프라인 모드" 알림 띠
//  - isOnline() / requireOnline('기능 이름') : 온라인 전용 기능을 누르면 멈추지 않고 안내만 보여줌
//  - 서비스 워커(sw.js) 등록 : 사이트 파일을 기기에 저장해서 인터넷 없이도 열리게 함
(function () {
    'use strict';

    function isOnline() { return navigator.onLine !== false; }
    window.isOnline = isOnline;

    // ===== 알림 띠 + 토스트 (CSS 파일을 건드리지 않도록 인라인 스타일 사용) =====
    let banner = null, toast = null, toastTimer = null;

    function ensureUI() {
        if (banner || !document.body) return;
        banner = document.createElement('div');
        banner.id = 'offline-banner';
        banner.textContent = '📴 오프라인 모드 · 온라인 기능은 인터넷 연결 후 이용할 수 있어요';
        banner.style.cssText = 'display:none; position:fixed; left:50%; transform:translateX(-50%); top:calc(env(safe-area-inset-top, 0px) + 6px);' +
            'z-index:99990; max-width:92vw; padding:6px 14px; border-radius:999px; font-size:12px; line-height:1.4; text-align:center;' +
            'background:rgba(30,30,40,0.92); color:#ffd27a; border:1px solid rgba(255,210,122,0.4); pointer-events:none; box-shadow:0 2px 10px rgba(0,0,0,0.4);';
        document.body.appendChild(banner);

        toast = document.createElement('div');
        toast.id = 'offline-toast';
        toast.style.cssText = 'display:none; position:fixed; left:50%; transform:translateX(-50%); bottom:calc(env(safe-area-inset-bottom, 0px) + 90px);' +
            'z-index:99991; max-width:88vw; padding:10px 16px; border-radius:12px; font-size:14px; line-height:1.5; text-align:center;' +
            'background:rgba(20,20,30,0.96); color:#fff; border:1px solid rgba(255,255,255,0.2); box-shadow:0 4px 16px rgba(0,0,0,0.5);';
        document.body.appendChild(toast);
        updateBanner();
    }

    function updateBanner() {
        ensureUI();
        if (banner) banner.style.display = isOnline() ? 'none' : 'block';
    }

    function showOfflineToast(msg) {
        ensureUI();
        if (!toast) { alert(msg); return; }
        toast.textContent = msg;
        toast.style.display = 'block';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 2800);
    }
    window.showOfflineToast = showOfflineToast;

    // 온라인 전용 기능 입구에서 호출: 인터넷이 있으면 true, 없으면 안내를 띄우고 false
    window.requireOnline = function (label) {
        if (isOnline()) return true;
        showOfflineToast('📴 ' + (label || '이 기능') + '은(는) 인터넷이 연결되어 있어야 해요.');
        return false;
    };

    // 화면 한 페이지를 통째로 대체할 때 쓰는 안내 박스 (랭킹 같은 페이지용)
    window.offlineNoticeHTML = function (label) {
        return '<div class="card" style="text-align:center; padding:28px 16px;">' +
            '<div style="font-size:40px; margin-bottom:8px;">📴</div>' +
            '<div style="font-size:16px; font-weight:700; margin-bottom:6px;">오프라인 상태예요</div>' +
            '<div style="font-size:13px; opacity:0.8; line-height:1.6;">' + (label || '이 기능') + '은(는) 인터넷이 연결되어 있어야 해요.<br>연결되면 다시 눌러주세요.</div></div>';
    };

    window.addEventListener('offline', updateBanner);
    window.addEventListener('online', () => {
        updateBanner();
        try { if (typeof onBackOnline === 'function') onBackOnline(); } catch (e) { console.warn(e); }
    });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', updateBanner);
    else updateBanner();

    // ===== 서비스 워커 등록 =====
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then((reg) => {
                // 이 페이지가 실제로 불러온 파일(폰트 포함)을 서비스 워커에게 알려서, 처음 방문에도 오프라인 준비가 끝나게 함
                // (글꼴은 화면이 그려진 뒤에 늦게 불러오는 경우가 있어서 로드 직후 + 4초 뒤, 두 번 알려줌)
                const report = () => {
                    const urls = performance.getEntriesByType('resource')
                        .filter((e) => ['script', 'link', 'css', 'img', 'other', 'fetch'].indexOf(e.initiatorType) !== -1)
                        .map((e) => e.name);
                    const target = reg.active || navigator.serviceWorker.controller;
                    if (target) target.postMessage({ type: 'cache-urls', urls: urls });
                };
                report();
                setTimeout(report, 4000);
            }).catch((e) => console.warn('서비스 워커 등록 실패:', e));
        });
    }
})();
