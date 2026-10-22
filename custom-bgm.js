// ===== custom-bgm.js =====
// 상점 '커스텀 배경음악' (300,000원)
//  - 구매하면 설정 → 커스텀 배경음악에서 URL을 입력해 배경음악으로 쓸 수 있어요.
//  - 지원: 유튜브 링크 / https로 시작하는 직접 오디오 주소(.mp3 .m4a .ogg .oga .wav .aac)
//  - 적용할 때마다 저작권·책임 안내에 동의해야 해요.
//  - 기존 script.js / auth.js 는 수정하지 않고, 함수를 감싸서(wrap) 확장해요.
//
// [Firestore] users/{uid}: ownsCustomBgm(bool), customBgmUrl(string|null), customBgmAgreedAt(timestamp)

(function () {
    'use strict';

    const PRICE = 300000;
    const DIRECT_RE = /^https:\/\/.+\.(mp3|m4a|ogg|oga|wav|aac)(\?.*)?$/i;
    const YT_RE = /^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;

    const st = {
        owned: false,        // 구매 여부
        url: null,           // 저장된 배경음악 URL
        active: false,       // 커스텀 음악이 재생 중인지
        muted: false,
        audio: null,         // 직접 오디오 재생용 <audio>
        yt: null,            // 유튜브 재생용 YT.Player
        ytTries: 0,
        pendingUrl: null     // 안내 동의를 기다리는 URL
    };
    let lastUid;             // 로그인 계정 변화 감지용

    const $ = (id) => document.getElementById(id);

    // URL 판별: 유효하면 {kind, id?, url}, 아니면 null
    function parseUrl(raw) {
        const u = (raw || '').trim();
        if (!u) return null;
        const m = u.match(YT_RE);
        if (m) return { kind: 'yt', id: m[1], url: u };
        if (DIRECT_RE.test(u)) return { kind: 'audio', url: u };
        return null;
    }

    function uidNow() {
        return (typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : null;
    }

    // ===== 재생 제어 =====
    function pauseOriginal() {
        try {
            if (typeof ytPlayer !== 'undefined' && ytPlayer && typeof ytPlayer.pauseVideo === 'function') ytPlayer.pauseVideo();
        } catch (e) { }
    }

    function resumeOriginal() {
        if (typeof window.playBGM === 'function') window.playBGM();
    }

    function updateIcon() {
        const icon = $('mute-btn-icon');
        if (!icon || !st.active) return;
        icon.className = st.muted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
    }

    function applyMute() {
        if (st.audio) st.audio.muted = st.muted;
        if (st.yt) {
            try { st.muted ? st.yt.mute() : st.yt.unMute(); } catch (e) { }
        }
        updateIcon();
    }

    // 브라우저가 자동재생을 막았을 때, 아무 곳이나 한 번 누르면 다시 재생
    function armTapResume() {
        document.addEventListener('click', function once() {
            if (!st.active) return;
            if (st.audio && st.audio.paused) st.audio.play().catch(() => { });
            if (st.yt && st.yt.playVideo) { try { st.yt.playVideo(); } catch (e) { } }
        }, { once: true });
    }

    function stopCustom() {
        if (st.audio) { st.audio.pause(); st.audio.src = ''; st.audio = null; }
        if (st.yt) { try { st.yt.destroy(); } catch (e) { } st.yt = null; }
        const holder = $('custom-bgm-yt');
        if (holder) holder.remove();
        st.active = false;
    }

    function startCustom() {
        const p = parseUrl(st.url);
        if (!p) return;
        stopCustom();
        pauseOriginal();              // 기본 유튜브 BGM은 잠시 멈춤
        st.active = true;

        if (p.kind === 'audio') {
            const a = new Audio(p.url);
            a.loop = true;
            a.volume = 0.6;
            a.muted = st.muted;
            st.audio = a;
            a.play().catch(() => armTapResume());
        } else {
            // 유튜브 API가 아직 준비 안 됐으면 잠깐 뒤 재시도
            if (!(typeof YT !== 'undefined' && YT.Player)) {
                if (++st.ytTries < 40) setTimeout(startCustom, 300);
                return;
            }
            st.ytTries = 0;
            const holder = document.createElement('div');
            holder.id = 'custom-bgm-yt';
            holder.style.cssText = 'position:fixed; width:1px; height:1px; left:-9px; top:-9px; opacity:0; pointer-events:none;';
            document.body.appendChild(holder);
            st.yt = new YT.Player('custom-bgm-yt', {
                width: '1',
                height: '1',
                videoId: p.id,
                playerVars: { autoplay: 1, controls: 0, loop: 1, playlist: p.id, playsinline: 1, modestbranding: 1, disablekb: 1, fs: 0 },
                events: {
                    onReady: (e) => {
                        st.muted ? e.target.mute() : e.target.unMute();
                        e.target.setVolume(60);
                        e.target.playVideo();
                    },
                    onStateChange: (e) => {
                        if (e.data === YT.PlayerState.ENDED) e.target.playVideo();
                    }
                }
            });
            armTapResume();
        }
        updateIcon();
    }

    // 커스텀 음악이 켜져 있으면 기본 음악이 겹쳐서 재생되지 않게 막기
    // (자동 로그인 계정은 "시작하기"를 누르기 전에 커스텀이 먼저 켜질 수 있음)
    const origPlayBGM = window.playBGM;
    if (typeof origPlayBGM === 'function') {
        window.playBGM = function () {
            if (st.active) return;
            return origPlayBGM.apply(this, arguments);
        };
    }

    // 설정의 음소거 버튼이 커스텀 음악에도 동작하도록 감싸기
    const origToggle = window.toggleMute;
    window.toggleMute = function () {
        if (st.active) {
            st.muted = !st.muted;
            applyMute();
            return;
        }
        if (typeof origToggle === 'function') origToggle();
    };

    // ===== 유저 데이터 불러오기 / 계정 변화 감지 =====
    async function loadMeta() {
        const uid = uidNow();
        if (!uid) return;
        try {
            const snap = await db.collection('users').doc(uid).get();
            const d = snap.exists ? snap.data() : {};
            st.owned = !!d.ownsCustomBgm;
            st.url = d.customBgmUrl || null;
            st.loaded = true;
        } catch (e) {
            console.warn('[커스텀 BGM] 정보 불러오기 실패', e);
        }
    }

    async function checkUser() {
        const uid = uidNow();
        if (uid === lastUid) return;
        lastUid = uid;

        const wasActive = st.active;
        stopCustom();
        st.owned = false;
        st.url = null;
        if (!uid) {
            if (wasActive) resumeOriginal();     // 로그아웃하면 기본 음악으로 복귀
            return;
        }
        await loadMeta();
        if (uidNow() !== uid) return;   // 불러오는 사이 계정이 바뀌었으면 이전 계정의 음악을 켜지 않음
        if (st.owned && parseUrl(st.url)) startCustom();
        if (document.getElementById('theme-shop-grid')) renderShopBgmCard();
    }

    // ===== 상점 카드 =====
    function makeShopCard() {
        const card = document.createElement('div');
        card.className = 'game-card';
        card.id = 'custom-bgm-shop-card';
        if (st.owned) card.style.opacity = '0.6';
        card.innerHTML = `
            <div class="game-icon">🎵</div>
            <div>
                <div class="game-title">커스텀 배경음악</div>
                <div class="game-desc">${st.owned ? '보유중' : PRICE.toLocaleString() + '원'}</div>
            </div>
            <button class="game-play-btn" ${st.owned ? 'style="background:#555;" disabled' : ''}>${st.owned ? '보유중' : '구매하기'}</button>`;
        if (!st.owned) card.querySelector('button').addEventListener('click', buyBgm);
        return card;
    }

    function renderShopBgmCard() {
        const themeGrid = $('theme-shop-grid');
        if (!themeGrid) return;
        const old = $('custom-bgm-shop-wrap');
        if (old) old.remove();
        // 테마 카드 바로 위에 '음악' 섹션을 따로 만든다 (테마 목록이 길어서 아래쪽에 묻히지 않도록)
        const themeCard = themeGrid.closest('.card') || themeGrid.parentNode;
        const wrap = document.createElement('div');
        wrap.id = 'custom-bgm-shop-wrap';
        wrap.className = 'card';
        wrap.style.cssText = 'text-align:left; margin-top:14px;';
        wrap.innerHTML = `
            <h2 style="margin-top:0; font-size:18px;"><i class="fa-solid fa-music" style="color:var(--accent-color);"></i> 음악</h2>
            <p style="font-size:12px; color:var(--sub-text); margin-top:-6px;">구매 후 설정 → 커스텀 배경음악에서 음악 URL을 등록할 수 있어요.</p>
            <div class="game-grid" id="custom-bgm-shop-grid"></div>`;
        themeCard.parentNode.insertBefore(wrap, themeCard);
        wrap.querySelector('#custom-bgm-shop-grid').appendChild(makeShopCard());
    }

    async function buyBgm() {
        if (st.owned) return;
        if (!requireOnline('커스텀 배경음악 구매')) return;
        if (!uidNow()) { alert('로그인이 필요해요.'); return; }
        if (!confirm(`커스텀 배경음악을 ${PRICE.toLocaleString()}원에 구매할까요?\n구매 후 설정 → 커스텀 배경음악에서 URL을 등록할 수 있어요.`)) return;

        // 아직 서버에 안 보낸 코인 증감분을 먼저 저장 (서버 기준 잔액 검사와 로컬이 어긋나지 않게)
        if (typeof saveUserDataToFirestore === 'function') await saveUserDataToFirestore();

        const ref = db.collection('users').doc(uidNow());
        let result = 'ok';
        try {
            await db.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                const d = snap.data() || {};
                if (d.ownsCustomBgm) { result = 'already'; return; }
                const coin = d.coin ?? 0;
                if (coin < PRICE) { result = 'poor'; return; }
                tx.update(ref, { coin: coin - PRICE, ownsCustomBgm: true });
            });
        } catch (e) {
            console.error('커스텀 BGM 구매 실패', e);
            alert('구매 중 오류가 발생했어요. 다시 시도해주세요.');
            return;
        }
        if (result === 'poor') { alert(`코인이 부족해요! (필요: ${PRICE.toLocaleString()}원)`); return; }

        if (result === 'ok' && typeof applyServerCoinDelta === 'function') applyServerCoinDelta(-PRICE);
        st.owned = true;
        if (typeof updateTopMoney === 'function') updateTopMoney();
        renderShopBgmCard();
        if (result === 'ok') alert('✅ 구매 완료! 설정 → 커스텀 배경음악에서 URL을 등록해보세요.');
    }

    // 테마 상점 렌더링 뒤에 커스텀 배경음악 카드도 같이 붙이기
    const origRenderShop = window.renderThemeShop;
    window.renderThemeShop = function () {
        if (typeof origRenderShop === 'function') origRenderShop();
        renderShopBgmCard();
    };

    // ===== 설정 화면 + 배경음악 모달 =====
    function refreshSettingsLabel() {
        const label = $('custom-bgm-state');
        if (!label) return;
        const text = !st.owned ? '🔒 잠김' : (st.url ? '사용 중' : '미설정');
        label.innerHTML = `${text} <i class="fa-solid fa-chevron-right"></i>`;
    }

    function buildUI() {
        // 설정 모달: '앱 정보' 섹션 바로 위에 버튼 추가
        const settings = $('settings-modal');
        if (settings) {
            let anchor = null;
            settings.querySelectorAll('h4').forEach(h => { if (h.textContent.indexOf('앱 정보') >= 0) anchor = h; });
            const wrap = document.createElement('div');
            wrap.innerHTML = `
                <h4 style="font-size:14px; margin-top:15px; color:var(--sub-text);"><i class="fa-solid fa-music"></i> 배경음악</h4>
                <button class="theme-btn" style="width:100%;" id="custom-bgm-open">
                    <span><i class="fa-solid fa-music"></i> 커스텀 배경음악</span>
                    <span id="custom-bgm-state" style="display:flex; align-items:center; gap:6px; color:var(--sub-text); font-size:12px; font-weight:normal;"></span>
                </button>`;
            if (anchor) {
                while (wrap.firstChild) anchor.parentNode.insertBefore(wrap.firstChild, anchor);
            } else {
                settings.querySelector('.modal-box').appendChild(wrap);
            }
            $('custom-bgm-open').addEventListener('click', openBgmModal);
        }

        // 배경음악 모달
        const modal = document.createElement('div');
        modal.id = 'custom-bgm-modal';
        modal.className = 'modal-overlay';
        modal.style.zIndex = '3300';
        modal.innerHTML = `
            <div class="modal-box" style="max-width:360px; text-align:left;">
                <h3 style="text-align:center;"><i class="fa-solid fa-music" style="color:var(--accent-color);"></i> 커스텀 배경음악</h3>
                <div id="custom-bgm-body"></div>
                <div class="modal-btns" style="margin-top:14px;">
                    <button class="modal-btn btn-confirm" id="custom-bgm-close">닫기</button>
                </div>
            </div>`;
        document.body.appendChild(modal);

        // 저작권 · 책임 안내 모달 (적용할 때마다 표시)
        const disc = document.createElement('div');
        disc.id = 'custom-bgm-disclaim';
        disc.className = 'modal-overlay';
        disc.style.zIndex = '3400';
        disc.innerHTML = `
            <div class="modal-box" style="max-width:340px; text-align:left;">
                <h3 style="text-align:center;">⚠️ 저작권 · 책임 안내</h3>
                <div style="font-size:13px; line-height:1.7; margin-top:8px;">
                    · 재생되는 음원의 저작권은 <b>원 권리자</b>에게 있어요.<br>
                    · 저작권이 없거나 사용 허락을 받지 않은 음원을 사용해서 생기는 모든 법적 책임은 <b>본인</b>에게 있어요.<br>
                    · 은하수 공원은 사용자가 입력한 외부 링크·음원에 대해 <b>어떠한 책임도 지지 않아요.</b><br>
                    · 외부 영상·파일은 언제든 삭제되거나 재생되지 않을 수 있어요.
                </div>
                <label style="display:flex; gap:8px; align-items:flex-start; margin-top:14px; font-size:13px; cursor:pointer;">
                    <input type="checkbox" id="custom-bgm-agree" style="margin-top:3px;">
                    <span>위 내용을 확인했으며, 책임이 본인에게 있음에 동의합니다.</span>
                </label>
                <div class="modal-btns" style="margin-top:14px;">
                    <button class="modal-btn btn-danger" id="custom-bgm-disclaim-cancel">취소</button>
                    <button class="modal-btn btn-confirm" id="custom-bgm-disclaim-ok" disabled style="opacity:.5;">동의하고 적용</button>
                </div>
            </div>`;
        document.body.appendChild(disc);

        $('custom-bgm-close').addEventListener('click', closeBgmModal);
        $('custom-bgm-disclaim-cancel').addEventListener('click', closeDisclaim);
        $('custom-bgm-agree').addEventListener('change', (e) => {
            const ok = $('custom-bgm-disclaim-ok');
            ok.disabled = !e.target.checked;
            ok.style.opacity = e.target.checked ? '1' : '.5';
        });
        $('custom-bgm-disclaim-ok').addEventListener('click', confirmDisclaim);

        // 설정 열 때마다 상태 표시 갱신
        const origOpen = window.openSettingsModal;
        window.openSettingsModal = function () {
            if (typeof origOpen === 'function') origOpen();
            refreshSettingsLabel();
        };
        refreshSettingsLabel();
    }

    async function openBgmModal() {
        await loadMeta();
        refreshSettingsLabel();
        renderBody();
        $('custom-bgm-modal').style.display = 'flex';
    }

    function closeBgmModal() {
        $('custom-bgm-modal').style.display = 'none';
    }

    function renderBody() {
        const box = $('custom-bgm-body');
        if (!st.owned) {
            box.innerHTML = `
                <p style="text-align:center; font-size:14px; line-height:1.6; margin:14px 0;">
                    🔒 아직 보유하지 않았어요.<br>
                    상점에서 <b>${PRICE.toLocaleString()}원</b>에 구매할 수 있어요.
                </p>`;
            return;
        }
        box.innerHTML = `
            <p style="font-size:12px; color:var(--sub-text); margin:6px 0 8px;">
                유튜브 링크 또는 https 오디오 주소(.mp3 등)를 넣으면 배경음악으로 재생돼요.
            </p>
            <button type="button" id="custom-bgm-guide-btn" class="modal-btn btn-confirm" style="width:100%; margin:0 0 10px; background:rgba(255,255,255,0.15);">📖 URL 가져오는 방법 보기</button>
            <div id="custom-bgm-guide" style="display:none; font-size:12.5px; line-height:1.7; background:rgba(0,0,0,0.25); border-radius:10px; padding:12px; margin-bottom:10px; max-height:260px; overflow-y:auto;">
                <b>① 유튜브 링크 (추천)</b><br>
                1. 유튜브에서 쓸 음악 영상을 엽니다.<br>
                2. 앱이면 영상 아래 <b>공유 → 링크 복사</b>, 웹이면 주소창의 주소를 복사합니다.<br>
                3. 아래 입력창에 붙여넣고 <b>적용하기</b>를 누릅니다.<br>
                · 예: https://www.youtube.com/watch?v=영상ID<br>
                · 영상 올린 사람이 <b>퍼가기 금지</b>로 해뒀다면 재생되지 않아요.<br>
                · 광고가 붙는 영상은 중간에 끊길 수 있어요.<br><br>
                <b>② 직접 오디오 파일 주소</b><br>
                1. 음악 파일 자체의 주소를 준비합니다. <b>https://</b>로 시작하고 <b>.mp3 / .m4a / .ogg / .wav / .aac</b>로 끝나야 해요.<br>
                2. 구글 드라이브나 드롭박스 같은 <b>공유 페이지 링크는 안 돼요</b> (파일 주소가 아니라서).<br><br>
                <b>③ 이렇게 넣으면 안 돼요</b><br>
                · <b>http://</b>로 시작하는 주소 (보안 연결이 아니라서 막아요)<br>
                · 음악 사이트 메인 페이지, 검색 결과 페이지 주소<br>
                · 적용했는데 소리가 안 나면 화면을 한 번 눌러보세요 (모바일 자동재생 제한)<br><br>
                <span style="color:#fca5a5;">⚠ 저작권이 있는 음원은 본인이 사용 권한이 있는 것만 넣어주세요.</span>
            </div>
            <input id="custom-bgm-input" type="url" placeholder="https://www.youtube.com/watch?v=..."
                style="width:100%; padding:10px; border-radius:8px; border:1px solid rgba(255,255,255,0.2); background:rgba(0,0,0,0.25); color:inherit; box-sizing:border-box;">
            <p id="custom-bgm-current" style="font-size:12px; margin:8px 0 0; color:var(--sub-text); word-break:break-all;"></p>
            <div class="modal-btns" style="margin-top:12px;">
                <button class="modal-btn btn-confirm" id="custom-bgm-apply">적용하기</button>
                <button class="modal-btn btn-danger" id="custom-bgm-reset">기본 음악</button>
            </div>
            <p style="font-size:11px; color:var(--sub-text); margin-top:10px; line-height:1.5;">
                ※ 저작권이 있는 음원은 권리자의 허락 없이 사용하면 안 돼요.
            </p>`;
        $('custom-bgm-input').value = st.url || '';
        $('custom-bgm-current').textContent = st.url ? '현재: ' + st.url : '현재: 기본 음악';
        $('custom-bgm-guide-btn').addEventListener('click', () => {
            const g = $('custom-bgm-guide');
            const open = g.style.display !== 'none';
            g.style.display = open ? 'none' : 'block';
            $('custom-bgm-guide-btn').textContent = open ? '📖 URL 가져오는 방법 보기' : '📖 가져오는 방법 접기';
        });
        $('custom-bgm-apply').addEventListener('click', onApply);
        $('custom-bgm-reset').addEventListener('click', onReset);
    }

    function onApply() {
        const raw = $('custom-bgm-input').value;
        // 서버 규칙: https:// 로 시작, 300자 이하
        if (raw.trim().length > 300 || !/^https:\/\//i.test(raw.trim())) {
            alert('주소는 https:// 로 시작하고 300자 이하여야 해요.');
            return;
        }
        if (!parseUrl(raw)) {
            alert('유튜브 링크 또는 https로 시작하는 mp3/m4a/ogg/wav/aac 주소만 넣을 수 있어요.');
            return;
        }
        st.pendingUrl = raw.trim();
        $('custom-bgm-agree').checked = false;
        $('custom-bgm-disclaim-ok').disabled = true;
        $('custom-bgm-disclaim-ok').style.opacity = '.5';
        $('custom-bgm-disclaim').style.display = 'flex';
    }

    function closeDisclaim() {
        $('custom-bgm-disclaim').style.display = 'none';
        st.pendingUrl = null;
    }

    async function confirmDisclaim() {
        const url = st.pendingUrl;
        const uid = uidNow();
        if (!url || !uid) return;
        if (!requireOnline('커스텀 배경음악 저장')) return;
        try {
            await db.collection('users').doc(uid).set({
                customBgmUrl: url,
                customBgmAgreedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } catch (e) {
            console.error('커스텀 BGM 저장 실패', e);
            alert('저장하지 못했어요. 다시 시도해주세요.');
            return;
        }
        st.url = url;
        closeDisclaim();
        closeBgmModal();
        startCustom();
        refreshSettingsLabel();
    }

    async function onReset() {
        if (!confirm('기본 배경음악으로 되돌릴까요?')) return;
        if (!requireOnline('배경음악 설정 변경')) return;
        const uid = uidNow();
        if (!uid) return;
        try {
            await db.collection('users').doc(uid).set({ customBgmUrl: null }, { merge: true });
        } catch (e) {
            alert('되돌리지 못했어요. 다시 시도해주세요.');
            return;
        }
        st.url = null;
        const was = st.active;
        stopCustom();
        if (was) resumeOriginal();
        renderBody();
        refreshSettingsLabel();
    }

    // ===== 시작 =====
    function init() {
        buildUI();
        renderShopBgmCard();
        setInterval(checkUser, 1000);   // 로그인/로그아웃 감지 후 음악 적용
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    // 테스트용
    window.CustomBGM = { parseUrl, st, PRICE };
})();
