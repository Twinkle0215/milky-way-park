// ===== stock.js =====
// 은하수 주식: 코인으로 가상의 주식을 사고파는 투자 시뮬레이션. 열기: StockUI.open()
//
// [시세 방식]
//  - 서버 없이 "시간"만으로 시세가 정해져요. (서버 시간 기준 10초마다 갱신, 모든 유저가 같은 가격을 봄)
//  - 같은 시각이면 어느 기기에서 봐도 같은 값이 나오는 결정형 난수(value noise)를 사용
// [Firestore] users/{uid} 문서의 stockData({h:{종목:{q:수량,c:총매수금}}, p:누적수익}), stockProfit(랭킹용) 필드
// [규칙] 매수 수수료 0%, 매도 수수료 1%. 주식은 온라인 + 로그인 상태에서만 거래 가능.

(function () {
    'use strict';

    const TICK_MS = 10000;       // 시세 갱신 주기
    const FEE_RATE = 0.01;       // 매도 수수료
    const POINTS = 60;           // 차트에 그리는 점 수 (60 x 10초 = 10분)
    const CHANGE_TICKS = 30;     // 등락률 기준 (5분 전 대비)
    const QTYS = [1, 5, 10, 50, 'MAX'];

    // vol: 변동성(클수록 크게 출렁임)
    const STOCKS = [
        { id: 'GLX', name: '은하전자', icon: '🛰️', base: 1200, vol: 0.42 },
        { id: 'STR', name: '별빛푸드', icon: '🍜', base: 800, vol: 0.34 },
        { id: 'MBO', name: '달토끼바이오', icon: '🐇', base: 2500, vol: 0.62 },
        { id: 'BNK', name: '은하수은행', icon: '🏦', base: 5000, vol: 0.18 },
        { id: 'CSM', name: '코스믹게임즈', icon: '🎮', base: 1800, vol: 0.52 }
    ];

    // ===== 결정형 시세 =====
    const now = () => (typeof getServerNow === 'function' ? getServerNow() : Date.now());
    const curTick = () => Math.floor(now() / TICK_MS);

    function noise(seed, n) {   // -1 ~ 1
        let h = Math.imul(seed | 0, 374761393) + Math.imul(n | 0, 668265263);
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        h ^= h >>> 16;
        return ((h >>> 0) / 4294967296) * 2 - 1;
    }
    function vnoise(seed, u) {  // 부드럽게 이어지는 노이즈
        const c = Math.floor(u), f = u - c, sm = f * f * (3 - 2 * f);
        const a = noise(seed, c), b = noise(seed, c + 1);
        return a + (b - a) * sm;
    }
    function price(i, t) {
        const s = STOCKS[i], sd = (i + 1) * 7919;
        const x = s.vol * (0.80 * vnoise(sd + 1, t / 3000) + 0.55 * vnoise(sd + 2, t / 400) +
            0.35 * vnoise(sd + 3, t / 60) + 0.20 * vnoise(sd + 4, t / 10)) + 0.012 * noise(sd + 5, t);
        return Math.max(10, Math.round(s.base * Math.exp(x)));
    }

    // ===== 상태 =====
    let overlay = null, body = null, timer = null;
    let tab = 'market';        // market | rank
    let sel = 0, qty = 1;
    let data = { h: {}, p: 0 };
    let loaded = false, busy = false, lastTick = -1;

    const $ = (id) => overlay && overlay.querySelector('#' + id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const logged = () => (typeof currentUser !== 'undefined' && currentUser);
    const myUid = () => (logged() ? currentUser.uid : null);
    const fmt = (n) => Math.round(n).toLocaleString();
    const pct = (n) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
    const colorOf = (n) => (n > 0 ? '#ff5a5f' : n < 0 ? '#4c9aff' : '#aaa');   // 한국식: 상승 빨강 / 하락 파랑

    function toast(msg) {
        const t = $('sk-toast');
        if (!t) return;
        t.textContent = msg;
        t.style.opacity = '1';
        clearTimeout(toast._t);
        toast._t = setTimeout(() => { if (t) t.style.opacity = '0'; }, 2200);
    }
    function updateCoinLabel() {
        const el = $('sk-coins');
        if (el && typeof userData !== 'undefined') el.textContent = (userData.coin || 0).toLocaleString();
        if (typeof updateTopMoney === 'function') updateTopMoney();
    }

    // ===== 저장 / 불러오기 =====
    async function loadData() {
        try {
            const snap = await db.collection('users').doc(myUid()).get();
            const d = snap.exists ? (snap.data().stockData || {}) : {};
            data = { h: d.h || {}, p: d.p || 0 };
            loaded = true;
        } catch (e) {
            console.warn('[주식] 불러오기 실패', e);
            loaded = false;
        }
    }
    async function persist() {
        try {
            await db.collection('users').doc(myUid()).set({ stockData: data, stockProfit: data.p }, { merge: true });
        } catch (e) { console.warn('[주식] 저장 실패', e); }
        try { if (typeof saveUserDataToFirestore === 'function') await saveUserDataToFirestore(); } catch (e) { }
    }

    // ===== 거래 =====
    async function trade(kind) {
        if (busy || !loaded) return;
        busy = true;
        try {
            const t = curTick(), s = STOCKS[sel], p = price(sel, t);
            const h = data.h[s.id] || { q: 0, c: 0 };
            let q = qty;
            if (qty === 'MAX') q = kind === 'buy' ? Math.floor(userData.coin / p) : h.q;
            if (!(q > 0)) { toast(kind === 'buy' ? '살 수 있는 코인이 부족해요' : '보유한 주식이 없어요'); return; }
            if (kind === 'buy') {
                const cost = p * q;
                if (userData.coin < cost) { toast('코인이 부족해요'); return; }
                userData.coin -= cost;
                h.q += q; h.c += cost;
                data.h[s.id] = h;
                toast(`${s.name} ${q}주 매수 (-${fmt(cost)}원)`);
            } else {
                if (h.q < q) { toast('보유 수량이 부족해요'); return; }
                const net = Math.floor(p * q * (1 - FEE_RATE));
                const costPart = Math.round(h.c * q / h.q);
                userData.coin += net;
                data.p += net - costPart;
                h.q -= q; h.c -= costPart;
                if (h.q <= 0) delete data.h[s.id]; else data.h[s.id] = h;
                const diff = net - costPart;
                toast(`${s.name} ${q}주 매도 (${diff >= 0 ? '+' : ''}${fmt(diff)}원)`);
            }
            updateCoinLabel();
            renderMarket();
            await persist();
        } finally { busy = false; }
    }

    // ===== 화면 =====
    function injectStyle() {
        if (document.getElementById('stock-style')) return;
        const st = document.createElement('style');
        st.id = 'stock-style';
        st.textContent = `
        .sk-overlay { position: fixed; inset: 0; z-index: 3000; background: rgba(0,0,0,0.9); display: flex; flex-direction: column; align-items: center; padding: 10px; box-sizing: border-box; color: #fff; }
        .sk-top { width: min(100%, 440px); display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 14px; font-weight: bold; flex: 0 0 auto; }
        .sk-btn-top { background: rgba(255,255,255,0.15); color: #fff; border: none; border-radius: 8px; padding: 6px 12px; font-size: 14px; cursor: pointer; }
        .sk-tabs { width: min(100%, 440px); display: flex; gap: 6px; margin-bottom: 8px; flex: 0 0 auto; }
        .sk-tab { flex: 1; padding: 9px; border: none; border-radius: 8px; font-weight: bold; font-size: 14px; color: #fff; background: rgba(255,255,255,0.12); cursor: pointer; }
        .sk-tab.on { background: var(--accent-color, #6c63ff); }
        .sk-body { flex: 1 1 auto; width: min(100%, 440px); min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; }
        .sk-card { background: rgba(255,255,255,0.07); border-radius: 12px; padding: 12px; margin-bottom: 10px; }
        .sk-sum { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px; }
        .sk-sum b { display: block; font-size: 16px; margin-top: 2px; }
        .sk-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-radius: 10px; margin-bottom: 6px; background: rgba(255,255,255,0.07); cursor: pointer; border: 2px solid transparent; }
        .sk-row.on { border-color: var(--accent-color, #6c63ff); background: rgba(255,255,255,0.12); }
        .sk-row small { display: block; opacity: .65; font-size: 11px; margin-top: 2px; }
        .sk-row .r { text-align: right; font-weight: bold; }
        .sk-chart { width: 100%; height: 150px; display: block; border-radius: 8px; background: rgba(0,0,0,0.3); }
        .sk-qtys { display: flex; gap: 6px; margin: 10px 0; }
        .sk-qty { flex: 1; padding: 8px 0; border: none; border-radius: 8px; background: rgba(255,255,255,0.12); color: #fff; font-weight: bold; font-size: 13px; cursor: pointer; }
        .sk-qty.on { background: #fff; color: #111; }
        .sk-trade { display: flex; gap: 8px; }
        .sk-go { flex: 1; padding: 13px; border: none; border-radius: 10px; font-size: 15px; font-weight: bold; color: #fff; cursor: pointer; }
        .sk-go.buy { background: #e5484d; } .sk-go.sell { background: #3b82f6; }
        .sk-go:disabled { opacity: .4; }
        .sk-toast { position: fixed; left: 50%; bottom: 40px; transform: translateX(-50%); background: rgba(30,30,40,0.95); border: 1px solid rgba(255,255,255,0.25); padding: 10px 16px; border-radius: 10px; font-size: 14px; opacity: 0; transition: opacity .25s; pointer-events: none; z-index: 3100; }
        .sk-rk { display: flex; justify-content: space-between; padding: 10px 12px; border-radius: 8px; background: rgba(255,255,255,0.08); margin-bottom: 6px; font-size: 14px; }
        .sk-note { font-size: 12px; opacity: .7; line-height: 1.5; margin-top: 8px; }`;
        document.head.appendChild(st);
    }

    function build() {
        injectStyle();
        overlay = document.createElement('div');
        overlay.className = 'sk-overlay';
        overlay.innerHTML = `
            <div class="sk-top">
                <span><i class="fa-solid fa-chart-line" style="color:#22c55e;"></i> 은하수 주식</span>
                <span>🪙 <span id="sk-coins">0</span>원 &nbsp; <button class="sk-btn-top" id="sk-close">닫기</button></span>
            </div>
            <div class="sk-tabs">
                <button class="sk-tab on" data-tab="market">📈 거래</button>
                <button class="sk-tab" data-tab="rank">🏆 수익 랭킹</button>
            </div>
            <div class="sk-body" id="sk-body"></div>
            <div class="sk-toast" id="sk-toast"></div>`;
        document.body.appendChild(overlay);
        body = $('sk-body');
        $('sk-close').addEventListener('click', close);
        overlay.querySelectorAll('.sk-tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
        body.addEventListener('click', onBodyClick);
    }

    function setTab(t) {
        tab = t;
        overlay.querySelectorAll('.sk-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
        if (t === 'market') renderMarket(); else renderRank();
    }

    function onBodyClick(e) {
        const el = e.target.closest('[data-sel],[data-qty],[data-trade]');
        if (!el) return;
        if (el.dataset.sel != null) { sel = parseInt(el.dataset.sel, 10); renderMarket(); }
        else if (el.dataset.qty != null) { qty = el.dataset.qty === 'MAX' ? 'MAX' : parseInt(el.dataset.qty, 10); renderMarket(); }
        else if (el.dataset.trade) trade(el.dataset.trade);
    }

    function renderMarket() {
        if (!body || tab !== 'market') return;
        const t = curTick();
        lastTick = t;
        const prices = STOCKS.map((s, i) => price(i, t));
        let evalSum = 0, costSum = 0;
        STOCKS.forEach((s, i) => { const h = data.h[s.id]; if (h) { evalSum += h.q * prices[i]; costSum += h.c; } });
        const pl = evalSum - costSum;

        const rows = STOCKS.map((s, i) => {
            const prev = price(i, t - CHANGE_TICKS), ch = (prices[i] - prev) / prev * 100;
            const h = data.h[s.id];
            return `<div class="sk-row ${i === sel ? 'on' : ''}" data-sel="${i}">
                <div><span style="font-size:18px;">${s.icon}</span> <b>${esc(s.name)}</b><small>${s.id}${h ? ` · 보유 ${h.q}주` : ''}</small></div>
                <div class="r">${fmt(prices[i])}원<small style="color:${colorOf(ch)};">${pct(ch)}</small></div>
            </div>`;
        }).join('');

        const s = STOCKS[sel], p = prices[sel], h = data.h[s.id] || { q: 0, c: 0 };
        const hp = h.q ? (p * h.q - h.c) : 0;
        const qLabel = qty === 'MAX' ? '최대' : qty + '주';
        const buyQ = qty === 'MAX' ? Math.floor((userData.coin || 0) / p) : qty;
        const sellQ = qty === 'MAX' ? h.q : qty;
        const buyCost = p * buyQ, sellGet = Math.floor(p * sellQ * (1 - FEE_RATE));

        body.innerHTML = `
            <div class="sk-card">
                <div class="sk-sum">
                    <div>주식 평가액<b>${fmt(evalSum)}원</b></div>
                    <div>평가 손익<b style="color:${colorOf(pl)};">${pl >= 0 ? '+' : ''}${fmt(pl)}원</b></div>
                    <div>누적 실현 수익<b style="color:${colorOf(data.p)};">${data.p >= 0 ? '+' : ''}${fmt(data.p)}원</b></div>
                    <div>다음 시세까지<b id="sk-count">${Math.ceil((TICK_MS - (now() % TICK_MS)) / 1000)}초</b></div>
                </div>
            </div>
            ${rows}
            <div class="sk-card">
                <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px;">
                    <b>${s.icon} ${esc(s.name)}</b>
                    <span style="font-size:20px; font-weight:bold;">${fmt(p)}원</span>
                </div>
                <canvas class="sk-chart" id="sk-chart"></canvas>
                <div class="sk-note" style="margin-top:6px;">${h.q ? `보유 ${h.q}주 · 평균 ${fmt(h.c / h.q)}원 · 평가손익 <b style="color:${colorOf(hp)};">${hp >= 0 ? '+' : ''}${fmt(hp)}원</b>` : '보유 중인 주식이 없어요'}</div>
                <div class="sk-qtys">${QTYS.map(q => `<button class="sk-qty ${q === qty ? 'on' : ''}" data-qty="${q}">${q === 'MAX' ? '최대' : q}</button>`).join('')}</div>
                <div class="sk-trade">
                    <button class="sk-go buy" data-trade="buy" ${buyQ > 0 ? '' : 'disabled'}>매수 ${qLabel}<br><small>-${fmt(buyCost)}원</small></button>
                    <button class="sk-go sell" data-trade="sell" ${sellQ > 0 ? '' : 'disabled'}>매도 ${qLabel}<br><small>+${fmt(sellGet)}원</small></button>
                </div>
                <div class="sk-note">매도 시 수수료 ${FEE_RATE * 100}%가 붙어요. 시세는 10초마다 바뀌고, 모든 유저가 같은 가격을 봐요.</div>
            </div>`;
        drawChart(sel, t);
    }

    function drawChart(i, t) {
        const cv = $('sk-chart');
        if (!cv) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const w = cv.clientWidth || 300, h = 150;
        cv.width = w * dpr; cv.height = h * dpr;
        const c = cv.getContext('2d');
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        const arr = [];
        for (let k = POINTS - 1; k >= 0; k--) arr.push(price(i, t - k));
        const min = Math.min(...arr), max = Math.max(...arr), pad = 14;
        const span = Math.max(1, max - min);
        const X = (k) => pad + (w - pad * 2) * k / (POINTS - 1);
        const Y = (v) => h - pad - (h - pad * 2) * (v - min) / span;
        const up = arr[arr.length - 1] >= arr[0];
        const col = up ? '#ff5a5f' : '#4c9aff';
        c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 1;
        for (let g = 0; g < 4; g++) { const y = pad + (h - pad * 2) * g / 3; c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
        c.beginPath();
        arr.forEach((v, k) => { if (k === 0) c.moveTo(X(k), Y(v)); else c.lineTo(X(k), Y(v)); });
        c.strokeStyle = col; c.lineWidth = 2; c.lineJoin = 'round'; c.stroke();
        c.lineTo(X(POINTS - 1), h); c.lineTo(X(0), h); c.closePath();
        c.fillStyle = up ? 'rgba(255,90,95,0.12)' : 'rgba(76,154,255,0.12)'; c.fill();
        c.fillStyle = 'rgba(255,255,255,0.6)'; c.font = '10px sans-serif';
        c.fillText(fmt(max), 4, 11); c.fillText(fmt(min), 4, h - 3);
    }

    async function renderRank() {
        if (!body || tab !== 'rank') return;
        if (typeof requireOnline === 'function' && !requireOnline('랭킹')) { setTab('market'); return; }
        body.innerHTML = `<div class="sk-card"><b>🏆 누적 실현 수익 TOP 20</b><div id="sk-rk" style="margin-top:8px;"><div class="sk-rk">불러오는 중...</div></div></div>`;
        try {
            const snap = await db.collection('users').orderBy('stockProfit', 'desc').limit(20).get();
            if (tab !== 'rank' || !$('sk-rk')) return;
            const rows = [];
            let i = 0;
            snap.forEach(doc => {
                const d = doc.data();
                if (!((d.stockProfit || 0) > 0)) return;
                i += 1;
                const medal = i === 1 ? '🥇' : i === 2 ? '🥈' : i === 3 ? '🥉' : `${i}.`;
                const me = doc.id === myUid() ? ' style="outline:2px solid var(--accent-color,#6c63ff);"' : '';
                rows.push(`<div class="sk-rk"${me}><span>${medal} ${esc(d.name || '이름없음')}</span><b style="color:#ff5a5f;">+${fmt(d.stockProfit)}원</b></div>`);
            });
            $('sk-rk').innerHTML = rows.length ? rows.join('') : '<div class="sk-rk">아직 기록이 없어요. 첫 수익을 내보세요!</div>';
        } catch (e) {
            console.error('[주식] 랭킹 오류', e);
            if ($('sk-rk')) $('sk-rk').innerHTML = '<div class="sk-rk">랭킹을 불러오지 못했어요.</div>';
        }
    }

    // ===== 열기 / 닫기 =====
    async function open() {
        if (overlay) return;
        if (typeof requireOnline === 'function' && !requireOnline('은하수 주식')) return;
        if (!logged()) { alert('주식은 로그인이 필요해요.'); return; }
        tab = 'market'; sel = 0; qty = 1; loaded = false; busy = false;
        build();
        updateCoinLabel();
        body.innerHTML = '<div class="sk-card">시장 정보를 불러오는 중...</div>';
        await loadData();
        if (!overlay) return;
        if (!loaded) { body.innerHTML = '<div class="sk-card">기록을 불러오지 못했어요. 잠시 후 다시 열어주세요.</div>'; return; }
        renderMarket();
        timer = setInterval(() => {
            if (!overlay) return;
            const t = curTick();
            if (t !== lastTick && tab === 'market' && !busy) renderMarket();
            const c = $('sk-count');
            if (c) c.textContent = Math.ceil((TICK_MS - (now() % TICK_MS)) / 1000) + '초';
        }, 1000);
    }

    function close() {
        clearInterval(timer); timer = null;
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = body = null;
    }

    window.StockUI = { open, close, _test: { price, STOCKS } };
})();
