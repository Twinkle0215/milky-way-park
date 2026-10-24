// ===== enhance.js =====
// 무기 강화: 코인을 내고 무기를 +20까지 강화! 실패하면 그대로이거나 한 단계 떨어지고, 높은 단계에서는 파괴될 수도 있어요.
// 파괴되면 무료로 +0 검을 새로 받아요. 언제든 지금 무기를 팔아서 코인으로 바꿀 수 있어요. 열기: EnhanceUI.open()
//
// [Firestore] users/{uid} 문서의 enhData({lv, best, tries, ts}), enhBest(랭킹용 최고 도달 단계) 필드
// [오프라인] 기기에도 같이 저장 → 인터넷 없이도 가능 (랭킹만 온라인 필요)

(function () {
    'use strict';

    const MAX_LV = 20;
    const GROWTH = 1.7;           // 단계가 오를 때마다 판매가가 1.7배
    const BASE_PRICE = 80;        // +0 판매가
    const COST_MARGIN = 1.12;     // 강화 비용 = 기대 이득 x 1.12 (장기적으로 코인이 조금씩 줄도록 설계)
    const MIN_COST_RATE = 0.03;   // 고단계 최소 비용 (판매가의 3%)

    // 단계 L → L+1 시도할 때의 확률 (index = L)
    const SUCCESS = [.95, .90, .85, .80, .75, .70, .65, .60, .55, .50, .45, .40, .35, .30, .25, .20, .15, .10, .07, .05];
    const DESTROY = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, .02, .04, .06, .08, .10, .15, .20, .25, .30, .35];
    const DROP = [0, 0, 0, 0, 0, .15, .15, .15, .15, .15, .25, .25, .25, .25, .25, .30, .30, .30, .30, .30];   // 실패 시 -1단계

    const sellPrice = (L) => Math.ceil(BASE_PRICE * Math.pow(GROWTH, L));
    function attemptCost(L) {
        const b = SUCCESS[L] * (GROWTH - 1) - DROP[L] * (1 - 1 / GROWTH) - DESTROY[L];
        return Math.ceil(sellPrice(L) * Math.max(MIN_COST_RATE, b * COST_MARGIN));
    }
    const protectCost = (L) => Math.ceil(sellPrice(L) * Math.max(DESTROY[L], 0.05) * 1.2);   // 방어권 가격

    const TIERS = [
        { to: 4, name: '나무 검', e: '🗡️', c: '#d6a66b' },
        { to: 9, name: '강철 검', e: '⚔️', c: '#e5e7eb' },
        { to: 14, name: '미스릴 검', e: '🔱', c: '#38bdf8' },
        { to: 17, name: '용린 검', e: '🐉', c: '#c084fc' },
        { to: 19, name: '은하 검', e: '🌌', c: '#f472b6' },
        { to: 20, name: '별빛 성검', e: '🌟', c: '#fbbf24' }
    ];
    const tierOf = (L) => TIERS.find(t => L <= t.to) || TIERS[TIERS.length - 1];

    // ===== 상태 =====
    let overlay = null, body = null;
    let tab = 'forge';           // forge | rank
    let data = { lv: 0, best: 0, tries: 0, ts: 0 };
    let useProtect = false, busy = false, log = [], fx = '';
    let saveTimer = null;

    const $ = (id) => overlay && overlay.querySelector('#' + id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const logged = () => (typeof currentUser !== 'undefined' && currentUser);
    const myUid = () => (logged() ? currentUser.uid : null);
    const fmt = (n) => Math.round(n).toLocaleString();
    const coin = () => (typeof userData !== 'undefined' ? userData.coin || 0 : 0);
    const pctStr = (x) => (Math.round(x * 1000) / 10) + '%';

    // ===== 저장 =====
    const lsKey = () => 'mwp_enhData_' + (myUid() || 'guest');
    function readLocal() { try { return JSON.parse(localStorage.getItem(lsKey()) || 'null'); } catch (e) { return null; } }
    function writeLocal() { try { localStorage.setItem(lsKey(), JSON.stringify(data)); } catch (e) { } }

    async function loadData() {
        let remote = null;
        if (logged() && navigator.onLine !== false) {
            try {
                const snap = await db.collection('users').doc(myUid()).get();
                remote = snap.exists ? (snap.data().enhData || null) : null;
            } catch (e) { console.warn('[강화] 불러오기 실패', e); }
        }
        const local = readLocal();
        const pick = (remote && local) ? ((local.ts || 0) > (remote.ts || 0) ? local : remote) : (remote || local);
        if (pick) data = Object.assign({ lv: 0, best: 0, tries: 0, ts: 0 }, pick);
    }

    function persist() {
        data.ts = Date.now();
        writeLocal();
        clearTimeout(saveTimer);
        saveTimer = null;
        if (logged()) {
            db.collection('users').doc(myUid()).set({ enhData: data, enhBest: data.best }, { merge: true }).catch(() => { });
        }
        try { if (typeof saveUserDataToFirestore === 'function') saveUserDataToFirestore(); } catch (e) { }
    }

    function addCoin(d) {
        if (typeof userData === 'undefined') return;
        userData.coin = Math.max(0, (userData.coin || 0) + d);
        updateCoinLabel();
    }
    function updateCoinLabel() {
        const el = $('en-coins');
        if (el) el.textContent = coin().toLocaleString();
        if (typeof updateTopMoney === 'function') updateTopMoney();
    }
    function pushLog(msg, color) {
        log.unshift({ msg, color });
        if (log.length > 6) log.pop();
    }

    // ===== 강화 / 판매 =====
    function enhance() {
        if (busy || data.lv >= MAX_LV) return;
        const L = data.lv;
        const protect = useProtect && DESTROY[L] > 0;
        const cost = attemptCost(L) + (protect ? protectCost(L) : 0);
        if (coin() < cost) { pushLog('코인이 부족해요.', '#ff5a5f'); render(); return; }
        busy = true;
        addCoin(-cost);
        data.tries += 1;

        const x = Math.random();
        let result;   // success | stay | drop | destroy | saved
        if (x < SUCCESS[L]) result = 'success';
        else if (x < SUCCESS[L] + DESTROY[L]) result = protect ? 'saved' : 'destroy';
        else if (x < SUCCESS[L] + DESTROY[L] + DROP[L]) result = 'drop';
        else result = 'stay';

        if (result === 'success') {
            data.lv = L + 1;
            if (data.lv > data.best) data.best = data.lv;
            pushLog(`🎉 강화 성공! +${L} → +${data.lv}`, '#4ade80');
        } else if (result === 'destroy') {
            data.lv = 0;
            pushLog(`💥 +${L} 무기가 파괴됐어요… 새 나무 검을 받았어요.`, '#ff5a5f');
        } else if (result === 'drop') {
            data.lv = Math.max(0, L - 1);
            pushLog(`📉 강화 실패… +${L} → +${data.lv}`, '#fb923c');
        } else if (result === 'saved') {
            pushLog(`🛡️ 방어권이 파괴를 막아줬어요! (+${L} 유지)`, '#38bdf8');
        } else {
            pushLog(`😢 강화 실패… +${L} 유지`, '#fbbf24');
        }
        persist();   // 결과를 먼저 저장하고 연출만 보여줌
        fx = result;
        render();
        setTimeout(() => { fx = ''; busy = false; if (overlay && tab === 'forge') render(); }, 650);
    }

    function sell() {
        if (busy) return;
        const L = data.lv, price = sellPrice(L);
        if (!confirm(`+${L} ${tierOf(L).name}을(를) ${fmt(price)}원에 판매할까요?\n판매하면 새 나무 검(+0)을 받아요.`)) return;
        addCoin(price);
        data.lv = 0;
        pushLog(`💰 +${L} 무기를 ${fmt(price)}원에 판매했어요.`, '#fbbf24');
        persist();
        render();
    }

    // ===== 화면 =====
    function injectStyle() {
        if (document.getElementById('enhance-style')) return;
        const st = document.createElement('style');
        st.id = 'enhance-style';
        st.textContent = `
        .en-overlay { position: fixed; inset: 0; z-index: 3000; background: rgba(0,0,0,0.9); display: flex; flex-direction: column; align-items: center; padding: 10px; box-sizing: border-box; color: #fff; }
        .en-top { width: min(100%, 440px); display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 14px; font-weight: bold; flex: 0 0 auto; }
        .en-btn-top { background: rgba(255,255,255,0.15); color: #fff; border: none; border-radius: 8px; padding: 6px 12px; font-size: 14px; cursor: pointer; }
        .en-tabs { width: min(100%, 440px); display: flex; gap: 6px; margin-bottom: 8px; flex: 0 0 auto; }
        .en-tab { flex: 1; padding: 9px; border: none; border-radius: 8px; font-weight: bold; font-size: 14px; color: #fff; background: rgba(255,255,255,0.12); cursor: pointer; }
        .en-tab.on { background: var(--accent-color, #6c63ff); }
        .en-body { flex: 1 1 auto; width: min(100%, 440px); min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; }
        .en-stage { position: relative; text-align: center; padding: 22px 10px 16px; border-radius: 16px; margin-bottom: 10px; background: radial-gradient(circle at 50% 35%, rgba(255,255,255,0.14), rgba(255,255,255,0.03) 70%); }
        .en-weapon { font-size: 84px; line-height: 1.1; display: inline-block; }
        .en-weapon.wood { filter: sepia(1) saturate(2.4) hue-rotate(-12deg) brightness(.78); }
        .en-weapon.success { animation: enPop .6s ease-out; filter: drop-shadow(0 0 18px #4ade80); }
        .en-weapon.drop, .en-weapon.stay { animation: enShake .5s linear; }
        .en-weapon.destroy { animation: enBreak .65s ease-in forwards; }
        .en-weapon.saved { animation: enPop .6s ease-out; filter: drop-shadow(0 0 18px #38bdf8); }
        @keyframes enPop { 0% { transform: scale(.6) rotate(-10deg); } 60% { transform: scale(1.25) rotate(6deg); } 100% { transform: scale(1); } }
        @keyframes enShake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-12px); } 40% { transform: translateX(10px); } 60% { transform: translateX(-8px); } 80% { transform: translateX(6px); } }
        @keyframes enBreak { 0% { transform: scale(1); opacity: 1; } 40% { transform: scale(1.3) rotate(15deg); } 100% { transform: scale(.2) rotate(120deg); opacity: 0; } }
        .en-lv { font-size: 26px; font-weight: 900; margin-top: 4px; }
        .en-card { background: rgba(255,255,255,0.07); border-radius: 12px; padding: 12px; margin-bottom: 10px; font-size: 13px; }
        .en-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; }
        .en-grid b { float: right; }
        .en-btns { display: flex; gap: 8px; margin-bottom: 10px; }
        .en-go { flex: 2; padding: 15px; border: none; border-radius: 12px; font-size: 16px; font-weight: bold; color: #fff; background: #e5484d; cursor: pointer; }
        .en-sell { flex: 1; padding: 15px; border: none; border-radius: 12px; font-size: 15px; font-weight: bold; color: #111; background: #fbbf24; cursor: pointer; }
        .en-go:disabled, .en-sell:disabled { opacity: .4; }
        .en-prot { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 13px; padding: 10px 12px; border-radius: 10px; background: rgba(56,189,248,0.12); cursor: pointer; }
        .en-log div { padding: 5px 0; font-size: 13px; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .en-rk { display: flex; justify-content: space-between; padding: 10px 12px; border-radius: 8px; background: rgba(255,255,255,0.08); margin-bottom: 6px; font-size: 14px; }
        .en-note { font-size: 12px; opacity: .7; line-height: 1.5; }`;
        document.head.appendChild(st);
    }

    function build() {
        injectStyle();
        overlay = document.createElement('div');
        overlay.className = 'en-overlay';
        overlay.innerHTML = `
            <div class="en-top">
                <span><i class="fa-solid fa-hammer" style="color:#f43f5e;"></i> 무기 강화</span>
                <span>🪙 <span id="en-coins">0</span>원 &nbsp; <button class="en-btn-top" id="en-close">닫기</button></span>
            </div>
            <div class="en-tabs">
                <button class="en-tab on" data-tab="forge">🔨 대장간</button>
                <button class="en-tab" data-tab="rank">🏆 랭킹</button>
            </div>
            <div class="en-body" id="en-body"></div>`;
        document.body.appendChild(overlay);
        body = $('en-body');
        $('en-close').addEventListener('click', close);
        overlay.querySelectorAll('.en-tab').forEach(b => b.addEventListener('click', () => {
            if (b.dataset.tab === 'rank' && typeof requireOnline === 'function' && !requireOnline('랭킹')) return;
            tab = b.dataset.tab;
            overlay.querySelectorAll('.en-tab').forEach(x => x.classList.toggle('on', x === b));
            render();
        }));
        body.addEventListener('click', (e) => {
            const el = e.target.closest('[data-act]');
            if (!el) return;
            if (el.dataset.act === 'go') enhance();
            else if (el.dataset.act === 'sell') sell();
            else if (el.dataset.act === 'prot') { useProtect = !useProtect; render(); }
        });
    }

    function render() {
        if (!body) return;
        if (tab === 'rank') { renderRank(); return; }
        const L = data.lv, t = tierOf(L), maxed = L >= MAX_LV;
        const canProt = !maxed && DESTROY[L] > 0;
        const protect = useProtect && canProt;
        const cost = maxed ? 0 : attemptCost(L) + (protect ? protectCost(L) : 0);
        const s = maxed ? 0 : SUCCESS[L], d = maxed ? 0 : DESTROY[L], r = maxed ? 0 : DROP[L];
        const stay = Math.max(0, 1 - s - d - r);

        body.innerHTML = `
            <div class="en-stage">
                <div class="en-weapon ${L <= 4 ? 'wood ' : ''}${fx}">${t.e}</div>
                <div class="en-lv" style="color:${t.c};">+${L} ${esc(t.name)}</div>
                <div class="en-note" style="margin-top:4px;">최고 기록 +${data.best} · 시도 ${fmt(data.tries)}회</div>
            </div>
            <div class="en-card">
                <div class="en-grid">
                    <div>성공 <b style="color:#4ade80;">${maxed ? '-' : pctStr(s)}</b></div>
                    <div>유지 <b style="color:#fbbf24;">${maxed ? '-' : pctStr(stay)}</b></div>
                    <div>하락(-1) <b style="color:#fb923c;">${maxed ? '-' : pctStr(r)}</b></div>
                    <div>파괴 <b style="color:#ff5a5f;">${maxed ? '-' : pctStr(d)}</b></div>
                </div>
                <div style="margin-top:8px; display:flex; justify-content:space-between;">
                    <span>강화 비용 <b>${maxed ? '-' : fmt(cost) + '원'}</b></span>
                    <span>판매가 <b style="color:#fbbf24;">${fmt(sellPrice(L))}원</b></span>
                </div>
            </div>
            ${canProt ? `<div class="en-prot" data-act="prot">
                <span style="font-size:18px;">${protect ? '☑️' : '⬜'}</span>
                <span>🛡️ 파괴 방어권 사용 <b>(+${fmt(protectCost(L))}원)</b><br><span class="en-note">파괴될 때만 막아줘요. 하락은 막지 못해요.</span></span>
            </div>` : ''}
            <div class="en-btns">
                <button class="en-go" data-act="go" ${(maxed || busy || coin() < cost) ? 'disabled' : ''}>${maxed ? '최고 단계 달성! 🎉' : '🔨 강화하기'}</button>
                <button class="en-sell" data-act="sell" ${busy ? 'disabled' : ''}>💰 판매</button>
            </div>
            <div class="en-card en-log">${log.length ? log.map(l => `<div style="color:${l.color};">${esc(l.msg)}</div>`).join('') : '<div class="en-note">강화 기록이 여기에 표시돼요.</div>'}</div>
            <div class="en-note">강화 비용과 확률은 단계가 오를수록 커져요. 파괴되면 무료로 +0 나무 검을 받으니 언제든 다시 도전할 수 있어요!</div>`;
    }

    async function renderRank() {
        body.innerHTML = `<div class="en-card"><b>🏆 최고 강화 단계 TOP 20</b><div id="en-rk" style="margin-top:8px;"><div class="en-rk">불러오는 중...</div></div></div>`;
        try {
            const snap = await db.collection('users').orderBy('enhBest', 'desc').limit(20).get();
            if (tab !== 'rank' || !$('en-rk')) return;
            const rows = [];
            let i = 0;
            snap.forEach(doc => {
                const d = doc.data();
                if (!((d.enhBest || 0) > 0)) return;
                i += 1;
                const medal = i === 1 ? '🥇' : i === 2 ? '🥈' : i === 3 ? '🥉' : `${i}.`;
                const me = doc.id === myUid() ? ' style="outline:2px solid var(--accent-color,#6c63ff);"' : '';
                rows.push(`<div class="en-rk"${me}><span>${medal} ${esc(d.name || '이름없음')}</span><b>+${d.enhBest}</b></div>`);
            });
            $('en-rk').innerHTML = rows.length ? rows.join('') : '<div class="en-rk">아직 기록이 없어요!</div>';
        } catch (e) {
            console.error('[강화] 랭킹 오류', e);
            if ($('en-rk')) $('en-rk').innerHTML = '<div class="en-rk">랭킹을 불러오지 못했어요.</div>';
        }
    }

    // ===== 열기 / 닫기 =====
    async function open() {
        if (overlay) return;
        tab = 'forge'; busy = false; fx = ''; useProtect = false; log = [];
        build();
        updateCoinLabel();
        body.innerHTML = '<div class="en-card">불러오는 중...</div>';
        await loadData();
        if (!overlay) return;
        render();
    }

    function close() {
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = body = null;
        busy = false;
    }

    window.EnhanceUI = { open, close, _test: { sellPrice, attemptCost, protectCost, SUCCESS, DESTROY, DROP } };
})();
