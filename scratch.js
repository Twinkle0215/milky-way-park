// ===== scratch.js : 즉석복권 (상점에서 구매 → 바로 긁어서 당첨 확인) =====
// 편의점 즉석복권처럼: 당첨번호 3개 + 내 번호 6칸. 내 번호가 당첨번호와 같으면 그 칸의 금액을 받아요.
//
// [동작 순서]
//  1) 구매: 코인 차감 + 복권 문서(scratchTickets) 생성을 "한 트랜잭션"으로 처리
//     → 결과는 구매하는 순간 정해져서 저장됨. 새로고침/닫기로 결과를 다시 뽑을 수 없음.
//  2) 긁기: 칸마다 은색 코팅을 손가락/마우스로 긁어서 열기 (절반 이상 긁으면 자동으로 열림)
//  3) 정산: 9칸이 모두 열리면 "복권 삭제 + 상금 지급"을 한 트랜잭션으로 처리 → 중복 지급 불가
//     중간에 닫으면 복권이 남아서 상점에서 "이어서 긁기" 가능
(function () {
    'use strict';

    const PRICE = 500;
    const COL = 'scratchTickets';
    const NUM_MAX = 9;           // 번호는 1~9 (실제 즉석복권처럼 한 자리 숫자)
    const WIN_COUNT = 1;         // 행운숫자 1개
    const CELL_COUNT = 6;        // 나의숫자 6칸

    // 한 장당 당첨 확률표 (당첨 확률 약 22%, 환급률 약 75%)
    // p: 상금, w: 확률. 나머지 확률은 "꽝"
    // 최고 2억원은 200만 장에 1장 꼴 (진짜 즉석복권처럼 거의 안 나옴)
    const PRIZE_TABLE = [
        { p: 500, w: 0.14 },
        { p: 1000, w: 0.055 },
        { p: 2000, w: 0.018 },
        { p: 5000, w: 0.007 },
        { p: 10000, w: 0.002 },
        { p: 50000, w: 0.0005 },
        { p: 500000, w: 0.00003 },
        { p: 5000000, w: 0.000004 },
        { p: 200000000, w: 0.0000005 }
    ];
    // 낙첨 칸에 보여줄 "가짜 금액" (진짜 복권처럼 큰 금액도 섞여 보이게 — 표시용일 뿐 당첨과 무관)
    const DECOY = [500, 500, 500, 1000, 1000, 2000, 2000, 5000, 5000, 10000, 10000, 50000, 100000, 1000000, 5000000, 10000000, 200000000];

    // ----- 금액/숫자 읽기 -----
    const HAN = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
    function krBlock(n) {                         // 1~9999 → 오백, 이천, 십 ...
        let r = '';
        [['천', 1000], ['백', 100], ['십', 10]].forEach((u) => {
            const d = Math.floor(n / u[1]) % 10;
            if (d) r += (d === 1 ? '' : HAN[d]) + u[0];
        });
        if (n % 10) r += HAN[n % 10];
        return r;
    }
    function krWon(n) {                           // 5000 → 오천원, 200000000 → 이억원
        n = Number(n);
        const eok = Math.floor(n / 100000000), man = Math.floor((n % 100000000) / 10000), rest = n % 10000;
        let s = '';
        if (eok) s += krBlock(eok) + '억';
        if (man) s += krBlock(man) + '만';
        if (rest) s += krBlock(rest);
        return s + '원';
    }
    // 금액 표기: 500원 / 1,000원 / 1만원 / 500만원 / 2억원
    function won(n) {
        n = Number(n);
        if (n >= 100000000) {
            const eok = Math.floor(n / 100000000), man = Math.floor((n % 100000000) / 10000);
            return eok.toLocaleString() + '억' + (man ? ' ' + man.toLocaleString() + '만' : '') + '원';
        }
        if (n >= 10000 && n % 10000 === 0) return (n / 10000).toLocaleString() + '만원';
        return n.toLocaleString() + '원';
    }

    const $ = (id) => document.getElementById(id);
    const fmt = (n) => Number(n).toLocaleString();
    const logged = () => (typeof currentUser !== 'undefined' && currentUser);

    // ===== 난수 (브라우저 보안 난수 사용) =====
    function rand() {
        const a = new Uint32Array(1);
        (window.crypto || window.msCrypto).getRandomValues(a);
        return a[0] / 4294967296;
    }
    function randInt(n) { return Math.floor(rand() * n); }
    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) { const j = randInt(i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
        return arr;
    }
    function pickPrize() {
        let r = rand();
        for (const t of PRIZE_TABLE) { if (r < t.w) return t.p; r -= t.w; }
        return 0;
    }

    // ===== 복권 한 장 만들기 =====
    // 나의숫자 6칸은 1~9 중 서로 다른 숫자, 행운숫자가 그 안에 있으면 그 칸의 금액이 당첨
    function makeTicket() {
        const nums = shuffle(Array.from({ length: NUM_MAX }, (_, i) => i + 1));
        const mine = nums.slice(0, CELL_COUNT);               // 나의숫자 6개 (중복 없음)
        const rest = nums.slice(CELL_COUNT);                  // 나의숫자에 없는 숫자 3개
        const prize = pickPrize();
        let winIdx = -1, lucky;
        if (prize > 0) { winIdx = randInt(CELL_COUNT); lucky = mine[winIdx]; }   // 당첨: 행운숫자가 내 숫자 중 하나
        else lucky = rest[randInt(rest.length)];                                  // 꽝: 행운숫자가 내 숫자에 없음
        const cells = mine.map((n, i) => ({ n: n, p: i === winIdx ? prize : DECOY[randInt(DECOY.length)] }));
        return { price: PRICE, win: [lucky], cells: cells, prize: prize };
    }

    // 칸 내용으로 상금 다시 계산 (저장된 prize 값과 맞는지 검증용)
    function calcPrize(t) {
        let sum = 0;
        (t.cells || []).forEach((c) => { if ((t.win || []).indexOf(c.n) !== -1) sum += c.p; });
        return sum;
    }

    // ===== Firestore =====
    function ticketRefs() { return db.collection(COL); }

    async function loadPending() {
        if (!logged()) return [];
        try {
            const snap = await ticketRefs().where('uid', '==', currentUser.uid).limit(30).get();
            const list = [];
            snap.forEach((d) => list.push({ id: d.id, data: d.data() }));
            return list;
        } catch (e) {
            console.warn('[즉석복권] 긁지 않은 복권 불러오기 실패', e);
            return [];
        }
    }

    let buying = false, claiming = false;

    async function buyOne() {
        if (buying) return null;
        if (!logged()) { alert('로그인이 필요해요.'); return null; }
        if (!requireOnline('즉석복권 구매')) return null;
        if (typeof userData !== 'undefined' && userData.coin < PRICE) { alert(`코인이 부족해요! (필요: ${fmt(PRICE)}원)`); return null; }
        buying = true;
        try {
            // 아직 서버에 안 보낸 코인 증감분을 먼저 저장 (서버 기준 잔액 검사와 로컬이 어긋나지 않게)
            if (typeof saveUserDataToFirestore === 'function') await saveUserDataToFirestore();
            const uid = currentUser.uid;
            const userRef = db.collection('users').doc(uid);
            const tRef = ticketRefs().doc();
            const t = makeTicket();
            let result = 'ok';
            await db.runTransaction(async (tx) => {
                const snap = await tx.get(userRef);
                const coin = snap.exists ? (snap.data().coin || 0) : 0;
                if (coin < PRICE) { result = 'poor'; return; }
                tx.update(userRef, { coin: coin - PRICE });
                tx.set(tRef, {
                    uid: uid, price: t.price, win: t.win, cells: t.cells, prize: t.prize,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
            if (result === 'poor') { alert(`코인이 부족해요! (필요: ${fmt(PRICE)}원)`); return null; }
            if (typeof applyServerCoinDelta === 'function') applyServerCoinDelta(-PRICE);
            if (typeof updateTopMoney === 'function') updateTopMoney();
            return { id: tRef.id, data: t };
        } catch (e) {
            console.error('[즉석복권] 구매 실패', e);
            alert('구매 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.');
            return null;
        } finally {
            buying = false;
        }
    }

    // 정산: 복권 삭제 + 상금 지급을 한 번에 (복권이 지워지므로 두 번 받을 수 없음)
    async function claim(id) {
        if (claiming) return { error: true };
        claiming = true;
        try {
            const uid = currentUser.uid;
            const userRef = db.collection('users').doc(uid);
            const tRef = ticketRefs().doc(id);
            const out = await db.runTransaction(async (tx) => {
                const tSnap = await tx.get(tRef);
                const uSnap = await tx.get(userRef);
                if (!tSnap.exists) return { gone: true, prize: 0 };
                const d = tSnap.data();
                if (d.uid !== uid) return { gone: true, prize: 0 };
                const prize = (calcPrize(d) === d.prize) ? (d.prize || 0) : 0;   // 칸 내용과 안 맞는 복권은 지급 안 함
                tx.delete(tRef);
                if (prize > 0 && uSnap.exists) tx.update(userRef, { coin: (uSnap.data().coin || 0) + prize });
                return { prize: prize };
            });
            if (out.prize > 0 && typeof applyServerCoinDelta === 'function') applyServerCoinDelta(out.prize);
            if (typeof updateTopMoney === 'function') updateTopMoney();
            return out;
        } catch (e) {
            console.error('[즉석복권] 정산 실패', e);
            return { error: true };
        } finally {
            claiming = false;
        }
    }

    // ===== 스타일 =====
    function injectStyle() {
        if ($('scratch-style')) return;
        const st = document.createElement('style');
        st.id = 'scratch-style';
        st.textContent = `
        .sc-overlay { position: fixed; inset: 0; z-index: 10050; background: rgba(8,6,16,0.88); display: flex; align-items: flex-start; justify-content: center; overflow-y: auto; padding: 14px 10px 24px; box-sizing: border-box; }
        .sc-wrap { width: 100%; max-width: 380px; margin: auto; position: relative; }
        .sc-head { display: flex; justify-content: flex-end; margin-bottom: 6px; }
        .sc-x { width: 30px; height: 30px; border-radius: 50%; border: none; background: rgba(255,255,255,0.18); color: #fff; font-size: 14px; cursor: pointer; }

        /* ---- 티켓 본체 ---- */
        .sc-ticket { position: relative; overflow: hidden; border-radius: 14px; padding: 10px 10px 8px; color: #fff; user-select: none; -webkit-user-select: none;
            background:
              repeating-linear-gradient(135deg, rgba(255,255,255,0.07) 0 9px, rgba(255,255,255,0) 9px 18px),
              linear-gradient(165deg, #ff82bd 0%, #ff3f95 52%, #ea1f7c 100%);
            box-shadow: 0 14px 40px rgba(0,0,0,0.6), inset 0 0 0 2px rgba(255,255,255,0.35); }
        .sc-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .sc-logo { font-size: 15px; font-weight: 900; font-style: italic; letter-spacing: -0.5px; text-shadow: 0 2px 0 #8a0f4a; }
        .sc-logo small { display: block; font-size: 8px; font-style: normal; letter-spacing: 1.5px; opacity: .9; text-shadow: none; }
        .sc-round { font-size: 11px; font-weight: 800; text-align: center; line-height: 1.35; text-shadow: 0 1px 0 #8a0f4a; }
        .sc-price { background: #fff; color: #d81b60; border-radius: 16px; padding: 3px 11px; font-weight: 900; font-size: 15px; box-shadow: 0 2px 0 #b3004f; }
        .sc-jackpot { margin: 4px 0 2px; text-align: center; font-size: 37px; font-weight: 900; line-height: 1.05; letter-spacing: -1.5px; color: #fff;
            -webkit-text-stroke: 1.6px #7a0b3f; paint-order: stroke fill; text-shadow: 0 3px 0 #7a0b3f, 0 7px 10px rgba(0,0,0,.35); }
        .sc-jackpot span { font-size: 24px; margin-right: 1px; }

        /* ---- 파란 긁는 판 ---- */
        .sc-panel { position: relative; margin-top: 6px; padding: 9px 8px; border-radius: 12px; border: 3px dotted #ffd54f;
            background:
              repeating-radial-gradient(ellipse at 28% 38%, rgba(255,255,255,0.20) 0 2px, rgba(255,255,255,0) 2px 9px),
              linear-gradient(160deg, #9cc4e6, #6f9fcc);
            display: grid; grid-template-columns: 80px 1fr; gap: 8px; }
        .sc-col-label { font-size: 11px; font-weight: 900; color: #0e2a4d; margin-bottom: 4px; letter-spacing: -0.3px; }
        .sc-lucky-big { position: relative; width: 80px; height: 84px; border-radius: 10px; overflow: hidden; background: #fff7cf; border: 2px solid #1d4e89; }
        .sc-badge1 { margin-top: 8px; text-align: center; background: #ffe14d; color: #c2185b; border: 2px solid #fff; border-radius: 10px; font-weight: 900; line-height: 1.15; padding: 4px 2px 5px; box-shadow: 0 2px 0 #b3004f; }
        .sc-badge1 b { display: block; font-size: 17px; -webkit-text-stroke: 0.5px #fff; }
        .sc-badge1 small { font-size: 11px; }
        .sc-mine { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
        .sc-cell { position: relative; overflow: hidden; border-radius: 8px; background: #eaf4ff; border: 2px solid #1d4e89; height: 88px; }
        .sc-under { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; color: #0b1b33; }
        .sc-under .dg { font-size: 30px; font-weight: 900; line-height: 1; }
        .sc-under .dg sup { font-size: 11px; font-weight: 800; margin-left: 1px; vertical-align: top; position: relative; top: -2px; color: #1d4e89; }
        .sc-under .kr { font-size: 12px; font-weight: 900; line-height: 1.1; margin-top: 3px; }
        .sc-under .nm { font-size: 8px; font-weight: 700; opacity: .75; letter-spacing: -0.4px; white-space: nowrap; }
        .sc-lucky-big .dg { font-size: 44px; }
        .sc-cover { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: crosshair; }

        /* ---- 당첨 표시 ---- */
        .sc-cell.sc-hit, .sc-lucky-big.sc-hit { border-color: #16a34a; background: #e3ffe9; box-shadow: 0 0 0 3px rgba(34,197,94,.65), 0 0 18px rgba(34,197,94,.8); animation: scPulse .9s ease-in-out infinite; z-index: 2; }
        .sc-cell.sc-hit .dg, .sc-lucky-big.sc-hit .dg { color: #15803d; }
        @keyframes scPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }

        /* ---- 아래쪽 안내/바코드 ---- */
        .sc-foot { margin-top: 7px; display: flex; align-items: center; gap: 8px; }
        .sc-barcode { flex: 0 0 74px; height: 22px; border-radius: 2px; background: repeating-linear-gradient(90deg, #111 0 2px, #fff 2px 3px, #111 3px 6px, #fff 6px 7px, #111 7px 8px, #fff 8px 11px); }
        .sc-how { flex: 1; font-size: 10px; font-weight: 700; line-height: 1.35; text-shadow: 0 1px 0 #8a0f4a; }
        .sc-no { font-size: 10px; font-weight: 800; opacity: .95; white-space: nowrap; text-shadow: 0 1px 0 #8a0f4a; }

        /* ---- 티켓 밖 (진행/결과/버튼) ---- */
        .sc-prog { margin-top: 10px; text-align: center; font-size: 12px; font-weight: 700; color: #f9a8d4; }
        .sc-bar { height: 5px; border-radius: 3px; background: rgba(255,255,255,0.15); margin: 5px 14px 0; overflow: hidden; }
        .sc-bar i { display: block; height: 100%; width: 0%; background: linear-gradient(90deg,#f472b6,#fbbf24); transition: width .2s; }
        .sc-result { min-height: 50px; margin-top: 10px; text-align: center; color: #fff; font-weight: 800; font-size: 17px; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 3px; }
        .sc-result small { font-size: 12px; font-weight: 600; opacity: .85; }
        .sc-btns { display: flex; gap: 8px; margin-top: 8px; }
        .sc-btn { flex: 1; padding: 12px 6px; border: none; border-radius: 12px; font-weight: 800; font-size: 14px; cursor: pointer; color: #fff; background: linear-gradient(135deg,#ec4899,#be185d); }
        .sc-btn.sub { background: rgba(255,255,255,0.14); color: #fff; }
        .sc-btn:disabled { opacity: .5; cursor: default; }
        @media (max-width: 345px) {
            .sc-jackpot { font-size: 32px; }
            .sc-how { font-size: 9px; }
            .sc-under .nm { font-size: 7px; }
            .sc-under .kr { font-size: 11px; }
        }
        `;
        document.head.appendChild(st);
    }

    // ===== 긁기 칸 =====
    // 은색 코팅을 canvas 로 덮고, 지나간 자리를 "가는 붓"으로 지워서 아래 내용을 보여줌.
    // (붓을 작게, 80% 이상 긁어야 완전히 열림 → 진짜 긁는 느낌. 그 전에도 긁은 부분은 바로 보임)
    const REVEAL_RATIO = 0.8;
    function makeScratchCover(cell, label, onProgress, onReveal) {
        const cv = document.createElement('canvas');
        cv.className = 'sc-cover';
        cell.appendChild(cv);
        const rect = cell.getBoundingClientRect();
        const w = Math.max(40, Math.round(rect.width)), h = Math.max(40, Math.round(rect.height));
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
        const c = cv.getContext('2d', { willReadFrequently: true });
        c.scale(dpr, dpr);

        // 은색 코팅 + 미세한 알갱이 + 사선 결
        const g = c.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, '#dfe3e8'); g.addColorStop(0.45, '#a4abb4'); g.addColorStop(1, '#cfd4da');
        c.fillStyle = g; c.fillRect(0, 0, w, h);
        for (let i = 0; i < 14; i++) {
            c.fillStyle = 'rgba(255,255,255,0.16)';
            c.fillRect(-10, (h / 14) * i, w + 20, 2);
        }
        for (let i = 0; i < Math.round(w * h / 28); i++) {
            c.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,.26)' : 'rgba(60,70,85,.14)';
            c.fillRect(rand() * w, rand() * h, 1.5, 1.5);
        }
        c.fillStyle = 'rgba(70,78,92,0.85)'; c.font = '800 11px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(label, w / 2, h / 2);

        const R = Math.max(6.5, Math.min(w, h) * 0.105);   // 가는 붓
        let revealed = false, drawing = false, last = null, moves = 0, ratio = 0;

        function pos(e) {
            const r = cv.getBoundingClientRect();
            return { x: (e.clientX - r.left) * (w / r.width), y: (e.clientY - r.top) * (h / r.height) };
        }
        function scratch(e) {
            const p = pos(e);
            c.globalCompositeOperation = 'destination-out';
            c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = R * 2;
            c.beginPath();
            if (last) { c.moveTo(last.x, last.y); c.lineTo(p.x, p.y); c.stroke(); }
            c.arc(p.x, p.y, R, 0, Math.PI * 2); c.fill();
            last = p;
        }
        function clearedRatio() {
            try {
                const d = c.getImageData(0, 0, cv.width, cv.height).data;
                const stride = 4; let total = 0, clear = 0;
                for (let y = 0; y < cv.height; y += stride) {
                    for (let x = 0; x < cv.width; x += stride) { total++; if (d[(y * cv.width + x) * 4 + 3] < 40) clear++; }
                }
                return total ? clear / total : 0;
            } catch (e) { return 1; }
        }
        function check() {
            ratio = clearedRatio();
            onProgress();
            if (!revealed && ratio >= REVEAL_RATIO) reveal();
        }
        function reveal() {
            if (revealed) return;
            revealed = true; ratio = 1;
            cv.style.transition = 'opacity .35s';
            cv.style.opacity = '0';
            cv.style.pointerEvents = 'none';
            setTimeout(() => { if (cv.parentNode) cv.parentNode.removeChild(cv); }, 400);
            onProgress();
            onReveal();
        }

        cv.addEventListener('pointerdown', (e) => {
            if (revealed) return;
            e.preventDefault();
            drawing = true; last = null; moves = 0;
            try { cv.setPointerCapture(e.pointerId); } catch (err) { }
            scratch(e);
        });
        cv.addEventListener('pointermove', (e) => {
            if (!drawing || revealed) return;
            e.preventDefault();
            scratch(e);
            if (++moves % 5 === 0) check();
        });
        const end = () => { if (!drawing) return; drawing = false; last = null; check(); };
        cv.addEventListener('pointerup', end);
        cv.addEventListener('pointercancel', end);
        return { reveal: reveal, isRevealed: () => revealed, getRatio: () => (revealed ? 1 : ratio) };
    }

    // ===== 복권 화면 =====
    let modal = null;

    function closeModal() {
        if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
        modal = null;
        renderScratchCard();   // 상점 카드의 "긁지 않은 복권" 개수 갱신
    }

    function digitHtml(n) { return `<span class="dg">${n}<sup>${HAN[n]}</sup></span>`; }
    function pad(n, l) { return String(n).padStart(l, '0'); }

    function openTicket(id, t) {
        injectStyle();
        if (modal) closeModal();
        modal = document.createElement('div');
        modal.className = 'sc-overlay';
        modal.id = 'sc-modal';

        const now = new Date();
        const dateStr = `${now.getFullYear()}.${pad(now.getMonth() + 1, 2)}.${pad(now.getDate(), 2)}`;
        const serial = String(id).replace(/[^0-9a-zA-Z]/g, '').slice(0, 8).toUpperCase();
        const luckyN = t.win[0];
        const myCells = t.cells.map((c) => `
            <div class="sc-cell" data-n="${c.n}">
                <div class="sc-under">${digitHtml(c.n)}<span class="kr">${krWon(c.p)}</span><span class="nm">₩${Number(c.p).toLocaleString()}</span></div>
            </div>`).join('');

        modal.innerHTML = `
            <div class="sc-wrap">
                <div class="sc-head"><button class="sc-x" id="sc-x" aria-label="닫기">✕</button></div>
                <div class="sc-ticket">
                    <div class="sc-top">
                        <div class="sc-logo">은하수 즉석복권<small>GALAXY QUICK WIN</small></div>
                        <div class="sc-round">발행일<br>${dateStr}</div>
                        <div class="sc-price">${fmt(PRICE)}원</div>
                    </div>
                    <div class="sc-jackpot"><span>₩</span>200,000,000</div>
                    <div class="sc-panel">
                        <div>
                            <div class="sc-col-label">행운숫자</div>
                            <div class="sc-lucky-big" id="sc-lucky" data-n="${luckyN}"><div class="sc-under">${digitHtml(luckyN)}</div></div>
                            <div class="sc-badge1"><b>1등</b><small>2억원</small></div>
                        </div>
                        <div>
                            <div class="sc-col-label">나의숫자</div>
                            <div class="sc-mine">${myCells}</div>
                        </div>
                    </div>
                    <div class="sc-foot">
                        <div class="sc-barcode"></div>
                        <div class="sc-how">[게임방법] 행운숫자와 나의숫자가<br>일치하면 그 칸의 금액 당첨</div>
                        <div class="sc-no">NO.${serial}</div>
                    </div>
                </div>
                <div class="sc-prog" id="sc-prog">0 / 7칸 열림</div>
                <div class="sc-bar"><i id="sc-barfill"></i></div>
                <div class="sc-result" id="sc-result"></div>
                <div class="sc-btns" id="sc-btns">
                    <button class="sc-btn" id="sc-all">전체 긁기</button>
                    <button class="sc-btn sub" id="sc-later">나중에 긁기</button>
                </div>
            </div>`;
        document.body.appendChild(modal);

        const luckyEl = $('sc-lucky');
        const cells = [luckyEl].concat(Array.from(modal.querySelectorAll('.sc-mine .sc-cell')));
        const total = cells.length;       // 행운숫자 1칸 + 나의숫자 6칸 = 7칸
        let revealedCount = 0, finished = false;
        const covers = [];

        function updateProgress() {
            // 칸마다 긁은 비율을 합쳐서 전체 진행률 표시
            const sum = covers.reduce((a, cv) => a + (cv ? cv.getRatio() : 0), 0);
            const pct = Math.min(100, Math.round((sum / total) * 100));
            const bar = $('sc-barfill'); if (bar) bar.style.width = pct + '%';
            const pr = $('sc-prog'); if (pr) pr.textContent = `${revealedCount} / ${total}칸 열림 · 긁은 정도 ${pct}%`;
        }
        function onOneRevealed() {
            revealedCount++;
            updateProgress();
            if (revealedCount >= total && !finished) { finished = true; finalize(); }
        }
        cells.forEach((cell, idx) => {
            const label = idx === 0 ? '행운숫자' : '긁으세요';
            covers.push(makeScratchCover(cell, label, updateProgress, onOneRevealed));
        });

        function setBtns(html) { const b = $('sc-btns'); if (b) b.innerHTML = html; }

        async function finalize() {
            // 당첨 칸 표시: 내 숫자 중 행운숫자와 같은 칸 + 행운숫자 칸
            let hit = false;
            cells.forEach((cell, idx) => {
                const n = Number(cell.getAttribute('data-n'));
                if (idx !== 0 && n === luckyN) { cell.classList.add('sc-hit'); hit = true; }
            });
            if (hit) luckyEl.classList.add('sc-hit');
            const res = $('sc-result');
            if (res) res.innerHTML = '<small>정산 중...</small>';
            setBtns('');
            const out = await claim(id);
            if (!modal) return;
            if (out.error) {
                if (res) res.innerHTML = '<small>정산에 실패했어요. 인터넷을 확인하고 다시 시도해주세요.<br>(복권은 그대로 남아 있어요)</small>';
                setBtns(`<button class="sc-btn" id="sc-retry">다시 시도</button><button class="sc-btn sub" id="sc-close2">닫기</button>`);
                const r = $('sc-retry'); if (r) r.addEventListener('click', () => { finalize(); });
                const c2 = $('sc-close2'); if (c2) c2.addEventListener('click', closeModal);
                return;
            }
            if (res) {
                if (out.gone) res.innerHTML = '<small>이미 정산된 복권이에요.</small>';
                else if (out.prize >= 1000000) res.innerHTML = `<span style="font-size:26px;">🎊 대박!! ${won(out.prize)} 당첨! 🎊</span><small>${fmt(out.prize)}원이 코인에 바로 입금됐어요</small>`;
                else if (out.prize > 0) res.innerHTML = `<span style="font-size:22px;">🎉 ${won(out.prize)} 당첨!</span><small>코인에 바로 입금됐어요</small>`;
                else res.innerHTML = `<span>😢 꽝!</span><small>행운숫자 ${luckyN}이(가) 나의숫자에 없어요. 다음 기회에!</small>`;
            }
            if (out.prize > 0 && navigator.vibrate) { try { navigator.vibrate(out.prize >= 1000000 ? [100, 60, 100, 60, 300] : [60, 40, 60]); } catch (e) { } }
            setBtns(`<button class="sc-btn" id="sc-again">한 장 더 (${fmt(PRICE)}원)</button><button class="sc-btn sub" id="sc-close2">닫기</button>`);
            const again = $('sc-again'); if (again) again.addEventListener('click', () => { buyAndOpen(); });
            const c2 = $('sc-close2'); if (c2) c2.addEventListener('click', closeModal);
        }

        $('sc-all').addEventListener('click', () => covers.forEach((cv) => cv.reveal()));
        $('sc-later').addEventListener('click', closeModal);
        $('sc-x').addEventListener('click', closeModal);   // 닫아도 복권은 남아 있어서 상점에서 이어서 긁을 수 있음
    }

    async function buyAndOpen() {
        const got = await buyOne();
        if (got) openTicket(got.id, got.data);
    }

    async function openPending(id) {
        try {
            const snap = await ticketRefs().doc(id).get();
            if (!snap.exists) { alert('이미 정산된 복권이에요.'); renderScratchCard(); return; }
            openTicket(id, snap.data());
        } catch (e) { alert('복권을 불러오지 못했어요.'); }
    }

    // ===== 상점 카드 =====
    async function renderScratchCard() {
        const lottoCard = document.querySelector('.game-card[onclick*="LottoUI"]');
        if (!lottoCard) return;
        const grid = lottoCard.parentNode;
        let card = $('scratch-shop-card');
        if (!card) {
            card = document.createElement('div');
            card.className = 'game-card';
            card.id = 'scratch-shop-card';
            grid.insertBefore(card, lottoCard.nextSibling);
        }
        card.innerHTML = `
            <div class="game-icon-badge" style="--ib1:#f472b6; --ib2:#db2777;"><i class="fa-solid fa-hand-sparkles"></i></div>
            <div>
                <div class="game-title">즉석복권</div>
                <div class="game-desc">${fmt(PRICE)}원 · 사자마자 바로 긁기<br>당첨 확률 약 22% · 최고 2억원</div>
                <div class="game-desc" id="scratch-pending" style="margin-top:4px;"></div>
            </div>
            <button class="game-play-btn" id="scratch-buy-btn">구매하기</button>`;
        $('scratch-buy-btn').addEventListener('click', buyAndOpen);

        const pend = await loadPending();
        const el = $('scratch-pending');
        if (el && pend.length) {
            el.innerHTML = `<a href="#" id="scratch-resume" style="color:var(--accent-color); font-weight:bold;">긁지 않은 복권 ${pend.length}장 · 이어서 긁기</a>`;
            const a = $('scratch-resume');
            if (a) a.addEventListener('click', (e) => { e.preventDefault(); openPending(pend[0].id); });
        }
    }

    // 상점 페이지가 그려질 때마다 카드 붙이기
    const origRenderShop = window.renderThemeShop;
    window.renderThemeShop = function () {
        if (typeof origRenderShop === 'function') origRenderShop();
        renderScratchCard();
    };

    window.ScratchTicket = { open: buyAndOpen, makeTicket: makeTicket, refreshCard: renderScratchCard, _openForTest: openTicket, _test: { makeTicket, calcPrize, PRIZE_TABLE, PRICE, won, krWon } };
})();
