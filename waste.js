// ===== waste.js =====
// 낭비하기: 상점에서 1원에 "낭비하기" 아이템을 원하는 개수만큼 구매. 효과는 없음 (그냥 코인이 사라질 뿐!)
// 가장 많이 낭비한 사람은 랭킹 → 🗑️ 낭비 랭킹에 올라가요. 열기: WasteUI.open()
//
// [Firestore] users/{uid} 문서의 wasteCount(지금까지 산 낭비하기 개수, increment 로 누적) 필드
//  - 코인 차감과 wasteCount 증가는 한 트랜잭션으로 처리 (테마 구매와 같은 방식)
//  - 랭킹은 ranking-system.js 의 fetchRankings('waste') 가 wasteCount 내림차순으로 조회

(function () {
    'use strict';

    const BUILD = '20261024a';                // 새 파일이 제대로 불러와졌는지 확인용 표시
    const PRICE = 1;                          // 개당 가격
    const CHIPS = [1, 10, 100, 1000];         // 빠른 증가 버튼
    const MAX_PER_BUY = 1000000;              // 한 번에 살 수 있는 최대 개수
    const CONFIRM_FROM = 1000;                // 이 개수 이상이면 한 번 더 확인
    const QUIPS = [
        '1원이 허공으로 사라졌어요 💨', '오늘도 알차게 낭비했어요 👏', '아무 일도 일어나지 않았습니다.',
        '코인아 잘 가… 🪙👋', '이 낭비, 후회 없지? 😎', '낭비 장인의 길을 걷는 중!', '지구가 아주 조금 가벼워졌어요 🌍'
    ];

    let overlay = null, qty = 1, busy = false, myCount = 0, loaded = false;

    const $ = (id) => overlay && overlay.querySelector('#' + id);
    const logged = () => (typeof currentUser !== 'undefined' && currentUser);
    const coin = () => (typeof userData !== 'undefined' ? userData.coin || 0 : 0);
    const fmt = (n) => Math.round(n).toLocaleString();

    function toast(msg) {
        const t = $('ws-toast');
        if (!t) return;
        t.textContent = msg;
        t.style.opacity = '1';
        clearTimeout(toast._t);
        toast._t = setTimeout(() => { if (t) t.style.opacity = '0'; }, 2200);
    }

    function injectStyle() {
        if (document.getElementById('waste-style')) return;
        const st = document.createElement('style');
        st.id = 'waste-style';
        st.textContent = `
        .ws-overlay { position: fixed; inset: 0; z-index: 3000; background: rgba(0,0,0,0.9); display: flex; flex-direction: column; align-items: center; padding: 10px; box-sizing: border-box; color: #fff; overflow-y: auto; }
        .ws-top { width: min(100%, 440px); display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 14px; font-weight: bold; flex: 0 0 auto; }
        .ws-btn-top { background: rgba(255,255,255,0.15); color: #fff; border: none; border-radius: 8px; padding: 6px 12px; font-size: 14px; cursor: pointer; }
        .ws-box { width: min(100%, 440px); }
        .ws-hero { position: relative; text-align: center; padding: 26px 12px 18px; border-radius: 16px; background: radial-gradient(circle at 50% 30%, rgba(148,163,184,0.25), rgba(255,255,255,0.03) 70%); margin-bottom: 10px; overflow: hidden; }
        .ws-bin { font-size: 78px; line-height: 1.1; display: inline-block; }
        .ws-bin.pop { animation: wsShake .5s linear; }
        @keyframes wsShake { 0%,100% { transform: rotate(0); } 20% { transform: rotate(-12deg) scale(1.1); } 40% { transform: rotate(10deg) scale(1.1); } 60% { transform: rotate(-7deg); } 80% { transform: rotate(5deg); } }
        .ws-fly { position: absolute; left: 50%; bottom: 40px; font-size: 22px; pointer-events: none; animation: wsFly 1s ease-out forwards; }
        @keyframes wsFly { 0% { transform: translate(-50%, 0) scale(1); opacity: 1; } 100% { transform: translate(calc(-50% + var(--dx)), -150px) scale(.4) rotate(var(--rot)); opacity: 0; } }
        .ws-card { background: rgba(255,255,255,0.07); border-radius: 12px; padding: 14px; margin-bottom: 10px; font-size: 13px; }
        .ws-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; text-align: center; }
        .ws-stats b { display: block; font-size: 18px; margin-top: 2px; }
        .ws-qtyrow { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
        .ws-qtyrow button.pm { width: 44px; height: 44px; border: none; border-radius: 10px; background: rgba(255,255,255,0.15); color: #fff; font-size: 22px; font-weight: bold; cursor: pointer; }
        .ws-input { flex: 1; min-width: 0; height: 44px; border: 2px solid rgba(255,255,255,0.2); border-radius: 10px; background: rgba(0,0,0,0.35); color: #fff; font-size: 20px; font-weight: bold; text-align: center; outline: none; }
        .ws-input:focus { border-color: var(--accent-color, #6c63ff); }
        .ws-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
        .ws-chip { flex: 1; min-width: 56px; padding: 9px 0; border: none; border-radius: 8px; background: rgba(255,255,255,0.12); color: #fff; font-weight: bold; font-size: 13px; cursor: pointer; }
        .ws-chip.max { background: #7c3aed; }
        .ws-chip.clr { background: rgba(255,255,255,0.06); opacity: .8; }
        .ws-buy { width: 100%; padding: 16px; border: none; border-radius: 12px; font-size: 17px; font-weight: bold; color: #fff; background: #64748b; cursor: pointer; }
        .ws-buy:disabled { opacity: .4; }
        .ws-msg { text-align: center; min-height: 22px; margin-top: 10px; font-size: 14px; color: #fbbf24; }
        .ws-note { font-size: 12px; opacity: .7; line-height: 1.5; text-align: center; margin-top: 6px; }
        .ws-toast { position: fixed; left: 50%; bottom: 40px; transform: translateX(-50%); background: rgba(30,30,40,0.95); border: 1px solid rgba(255,255,255,0.25); padding: 10px 16px; border-radius: 10px; font-size: 14px; opacity: 0; transition: opacity .25s; pointer-events: none; z-index: 3100; }`;
        document.head.appendChild(st);
    }

    function build() {
        injectStyle();
        overlay = document.createElement('div');
        overlay.className = 'ws-overlay';
        overlay.innerHTML = `
            <div class="ws-top">
                <span><i class="fa-solid fa-trash-can" style="color:#94a3b8;"></i> 낭비하기</span>
                <span>🪙 <span id="ws-coins">0</span>원 &nbsp; <button class="ws-btn-top" id="ws-close">닫기</button></span>
            </div>
            <div class="ws-box">
                <div class="ws-hero" id="ws-hero">
                    <div class="ws-bin" id="ws-bin">🗑️</div>
                    <div style="font-size:18px; font-weight:bold; margin-top:6px;">낭비하기</div>
                    <div style="font-size:13px; opacity:.8; margin-top:4px;">개당 ${PRICE}원 · 효과는 없어요. 그냥 사라질 뿐!</div>
                </div>
                <div class="ws-card">
                    <div class="ws-stats">
                        <div>내가 낭비한 개수<b id="ws-my">-</b></div>
                        <div>낭비한 코인<b id="ws-myc">-</b></div>
                    </div>
                </div>
                <div class="ws-qtyrow">
                    <button class="pm" id="ws-minus">−</button>
                    <input class="ws-input" id="ws-input" type="text" inputmode="numeric" value="1" maxlength="8">
                    <button class="pm" id="ws-plus">+</button>
                </div>
                <div class="ws-chips" id="ws-chips">
                    ${CHIPS.map(c => `<button class="ws-chip" data-add="${c}">+${c.toLocaleString()}</button>`).join('')}
                    <button class="ws-chip max" data-max="1">최대</button>
                    <button class="ws-chip clr" data-clr="1">초기화</button>
                </div>
                <button class="ws-buy" id="ws-buy">🗑️ 낭비하기</button>
                <div class="ws-msg" id="ws-msg"></div>
                <div class="ws-note">가장 많이 낭비한 사람은 랭킹 → 🗑️ 낭비 랭킹에 올라가요!</div>
                <div class="ws-note" style="opacity:.4;">waste.js ${BUILD}</div>
            </div>
            <div class="ws-toast" id="ws-toast"></div>`;
        document.body.appendChild(overlay);

        $('ws-close').addEventListener('click', close);
        $('ws-minus').addEventListener('click', () => setQty(qty - 1));
        $('ws-plus').addEventListener('click', () => setQty(qty + 1));
        $('ws-input').addEventListener('input', (e) => {
            const v = parseInt(String(e.target.value).replace(/[^0-9]/g, ''), 10);
            qty = isNaN(v) ? 0 : Math.min(v, MAX_PER_BUY);
            refresh(false);
        });
        $('ws-input').addEventListener('blur', () => { if (!(qty > 0)) setQty(1); });
        $('ws-chips').addEventListener('click', (e) => {
            const b = e.target.closest('button');
            if (!b) return;
            if (b.dataset.add) setQty(qty + parseInt(b.dataset.add, 10));
            else if (b.dataset.max) setQty(Math.min(Math.floor(coin() / PRICE), MAX_PER_BUY) || 1);
            else if (b.dataset.clr) setQty(1);
        });
        $('ws-buy').addEventListener('click', buy);
    }

    function setQty(n) {
        qty = Math.max(1, Math.min(MAX_PER_BUY, Math.floor(n) || 1));
        refresh(true);
    }

    function refresh(writeInput) {
        if (!overlay) return;
        const input = $('ws-input');
        if (writeInput && input) input.value = String(qty);
        const total = qty * PRICE;
        const buyBtn = $('ws-buy');
        if (buyBtn) {
            buyBtn.disabled = busy || !loaded || !(qty > 0) || total > coin();
            buyBtn.textContent = total > coin() ? '코인이 부족해요' : `🗑️ ${fmt(qty)}개 낭비하기 (-${fmt(total)}원)`;
        }
        const c = $('ws-coins'); if (c) c.textContent = coin().toLocaleString();
        const m = $('ws-my'); if (m) m.textContent = loaded ? fmt(myCount) + '개' : '-';
        const mc = $('ws-myc'); if (mc) mc.textContent = loaded ? fmt(myCount * PRICE) + '원' : '-';
        if (typeof updateTopMoney === 'function') updateTopMoney();
    }

    function effect(n) {
        const hero = $('ws-hero'), bin = $('ws-bin');
        if (bin) { bin.classList.remove('pop'); void bin.offsetWidth; bin.classList.add('pop'); }
        if (!hero) return;
        const count = Math.min(14, Math.max(3, String(n).length * 3));
        for (let i = 0; i < count; i++) {
            const el = document.createElement('div');
            el.className = 'ws-fly';
            el.textContent = Math.random() < 0.7 ? '🪙' : '💨';
            el.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px');
            el.style.setProperty('--rot', (Math.random() * 360 - 180) + 'deg');
            el.style.animationDelay = (i * 40) + 'ms';
            hero.appendChild(el);
            setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 1400 + i * 40);
        }
    }

    async function loadMine() {
        try {
            const snap = await db.collection('users').doc(currentUser.uid).get();
            myCount = snap.exists ? (snap.data().wasteCount || 0) : 0;
            loaded = true;
        } catch (e) {
            console.warn('[낭비] 기록 불러오기 실패', e);
            loaded = false;
        }
    }

    async function buy() {
        if (busy || !loaded) return;
        const n = qty, total = n * PRICE;
        if (!(n > 0)) return;
        if (total > coin()) { toast('코인이 부족해요'); return; }
        if (n >= CONFIRM_FROM && !confirm(`${fmt(n)}개(${fmt(total)}원)를 정말 낭비할까요?\n돌려받을 수 없어요!`)) return;

        busy = true;
        refresh(false);
        let result = 'ok';
        try {
            // 아직 서버에 안 보낸 코인 증감분을 먼저 저장 (서버 기준 잔액 검사와 어긋나지 않게)
            if (typeof saveUserDataToFirestore === 'function') await saveUserDataToFirestore();

            // 코인 차감 + 낭비 개수 증가를 한 번의 트랜잭션으로 (보안 규칙이 "낭비 개수 증가 <= 코인 감소"를 검사)
            const ref = db.collection('users').doc(currentUser.uid);
            await db.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                const d = snap.data() || {};
                const serverCoin = d.coin || 0;
                if (serverCoin < total) { result = 'poor'; return; }
                tx.update(ref, { coin: serverCoin - total, wasteCount: (d.wasteCount || 0) + n });
            });
            if (result === 'ok') {
                applyServerCoinDelta(-total);   // 서버가 이미 차감했으므로 로컬/동기화 기준도 함께 이동
                myCount += n;
                effect(n);
                const msg = $('ws-msg');
                if (msg) msg.textContent = `${fmt(n)}개 낭비 완료! ` + QUIPS[Math.floor(Math.random() * QUIPS.length)];
            } else {
                toast('코인이 부족해요');
            }
        } catch (e) {
            console.warn('[낭비] 구매 실패', e);
            const code = (e && e.code) ? e.code : 'unknown';
            const detail = (e && e.message) ? String(e.message).slice(0, 200) : '';
            let hint = '';
            if (code === 'permission-denied') hint = '\n\n→ Firestore 규칙(firestore.rules)이 아직 게시되지 않았거나, 규칙이 이 쓰기를 거절했어요.';
            else if (code === 'unknown' && !(e && e.message)) hint = '\n\n→ 코드 오류일 수 있어요. 개발자 콘솔(F12)의 [낭비] 로그를 확인해 주세요.';
            alert(`구매 실패 [${code}]\n${detail}${hint}\n\n(waste.js ${BUILD})`);
        } finally {
            busy = false;
            refresh(false);
        }
    }

    async function open() {
        if (overlay) return;
        if (typeof requireOnline === 'function' && !requireOnline('낭비하기')) return;
        if (!logged()) { alert('낭비하기는 로그인이 필요해요.'); return; }
        qty = 1; busy = false; loaded = false; myCount = 0;
        build();
        refresh(true);
        await loadMine();
        refresh(false);
    }

    function close() {
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null;
    }

    window.WasteUI = { open, close };
})();
