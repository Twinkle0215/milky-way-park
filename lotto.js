// ===== lotto.js =====
// 은하수 로또: 상점에서 1,000원에 번호(1~45 중 6개, 수동/자동) 구매
// 매주 토요일 00시 기준으로 자동 추첨 (서버 없이, 접속한 유저 중 첫 명의 브라우저가
// Firestore 트랜잭션으로 1회만 추첨 확정 → 중복 추첨 절대 불가, 완전 무료)

(function () {
    const TICKET_PRICE = 1000;
    const PRIZE_TABLE = { 1: 2000000000, 2: 50000000, 3: 1500000, 4: 50000, 5: 5000 };
    const TIER_LABEL = { 1: '1등', 2: '2등', 3: '3등', 4: '4등', 5: '5등' };

    let selectedNumbers = [];   // 수동 선택 중인 번호
    let autoQty = 1;            // 자동 구매 수량
    let lottoTab = 'buy';       // 'buy' | 'my'

    // ===== 날짜 유틸 =====
    // 이번에 구매하면 배정될 "다가오는 토요일" id (YYYY-MM-DD)
    function getUpcomingRoundId(date) {
        const d = new Date(date);
        const day = d.getDay(); // 0=일 ... 6=토
        let daysUntilSat = (6 - day + 7) % 7;
        if (daysUntilSat === 0) daysUntilSat = 7; // 오늘이 토요일이면 이미 추첨 지난 걸로 보고 다음주로
        const result = new Date(d);
        result.setHours(0, 0, 0, 0);
        result.setDate(result.getDate() + daysUntilSat);
        return formatDateId(result);
    }

    // 지금 기준 "가장 최근에 지나간(또는 오늘인) 토요일" id → 이 회차는 추첨 대상
    function getDueRoundId(date) {
        const d = new Date(date);
        const day = d.getDay();
        const daysSinceSat = (day - 6 + 7) % 7;
        const result = new Date(d);
        result.setHours(0, 0, 0, 0);
        result.setDate(result.getDate() - daysSinceSat);
        return formatDateId(result);
    }

    function formatDateId(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function formatDateLabel(id) {
        const [y, m, d] = id.split('-');
        return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일`;
    }

    // ===== 번호 생성 =====
    function generateRandomTicket() {
        const pool = Array.from({ length: 45 }, (_, i) => i + 1);
        const picked = [];
        for (let i = 0; i < 6; i++) {
            const idx = Math.floor(Math.random() * pool.length);
            picked.push(pool.splice(idx, 1)[0]);
        }
        return picked.sort((a, b) => a - b);
    }

    function generateDrawResult() {
        const pool = Array.from({ length: 45 }, (_, i) => i + 1);
        const numbers = [];
        for (let i = 0; i < 6; i++) {
            const idx = Math.floor(Math.random() * pool.length);
            numbers.push(pool.splice(idx, 1)[0]);
        }
        const bonusIdx = Math.floor(Math.random() * pool.length);
        const bonus = pool[bonusIdx];
        return { numbers: numbers.sort((a, b) => a - b), bonus };
    }

    // ===== 매주 토요일 자동추첨 (첫 접속자가 트랜잭션으로 1회만 실행) =====
    async function ensureLottoDrawn() {
        try {
            const roundId = getDueRoundId(new Date());
            const ref = db.collection('lottoRounds').doc(roundId);
            await db.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                if (snap.exists) return; // 이미 누가 추첨 완료함
                const { numbers, bonus } = generateDrawResult();
                tx.set(ref, {
                    round: roundId,
                    winningNumbers: numbers,
                    bonusNumber: bonus,
                    drawnAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
        } catch (e) {
            console.warn('로또 추첨 확인 실패:', e);
        }
    }

    // ===== 티켓 구매 =====
    async function buyTickets(ticketNumbersList) {
        // ticketNumbersList: 번호 6개짜리 배열들의 배열 (여러 장 한번에 가능)
        const total = TICKET_PRICE * ticketNumbersList.length;
        if (userData.coin < total) {
            alert(`코인이 부족해요! (필요: ${total.toLocaleString()}원, 보유: ${userData.coin.toLocaleString()}원)`);
            return false;
        }
        const roundId = getUpcomingRoundId(new Date());
        try {
            const batch = db.batch();
            ticketNumbersList.forEach((nums) => {
                const ref = db.collection('lottoTickets').doc();
                batch.set(ref, {
                    uid: currentUser.uid,
                    ownerName: userData.name,
                    numbers: nums,
                    round: roundId,
                    purchasedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    checked: false
                });
            });
            await batch.commit();

            userData.coin -= total;
            updateTopMoney();
            await saveUserDataToFirestore();
            return true;
        } catch (e) {
            console.error('로또 구매 실패:', e);
            alert('구매 중 오류가 발생했어요. 다시 시도해주세요.');
            return false;
        }
    }

    // ===== 당첨 확인 (내 로또함에서 호출) =====
    function getMatchTier(myNumbers, winningNumbers, bonus) {
        const matchCount = myNumbers.filter(n => winningNumbers.includes(n)).length;
        const bonusMatch = myNumbers.includes(bonus);
        if (matchCount === 6) return 1;
        if (matchCount === 5 && bonusMatch) return 2;
        if (matchCount === 5) return 3;
        if (matchCount === 4) return 4;
        if (matchCount === 3) return 5;
        return 0;
    }

    async function checkMyTickets() {
        const btn = document.getElementById('lotto-check-btn');
        if (btn) { btn.disabled = true; btn.textContent = '확인 중...'; }
        try {
            const snap = await db.collection('lottoTickets')
                .where('uid', '==', currentUser.uid)
                .where('checked', '==', false)
                .get();

            let totalPrize = 0;
            const results = [];

            for (const doc of snap.docs) {
                const ticket = doc.data();
                const roundSnap = await db.collection('lottoRounds').doc(ticket.round).get();
                if (!roundSnap.exists) continue; // 아직 추첨 안 된 회차 → 넘어감(나중에 다시 확인)

                const round = roundSnap.data();
                const tier = getMatchTier(ticket.numbers, round.winningNumbers, round.bonusNumber);
                const prize = tier ? PRIZE_TABLE[tier] : 0;

                await doc.ref.update({ checked: true, tier: tier, prize: prize });
                totalPrize += prize;
                if (tier) results.push({ round: ticket.round, tier, prize });
            }

            if (totalPrize > 0) {
                userData.coin += totalPrize;
                updateTopMoney();
                await saveUserDataToFirestore();
            }

            renderLottoResultSummary(results, totalPrize);
        } catch (e) {
            console.error('당첨 확인 실패:', e);
            alert('당첨 확인 중 오류가 발생했어요.');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '🎉 당첨 확인하기'; }
            renderShopLotto();
        }
    }

    function renderLottoResultSummary(results, totalPrize) {
        if (!results.length) {
            alert('아쉽지만 당첨된 티켓이 없어요 😢');
            return;
        }
        const lines = results.map(r => `- ${r.round} 추첨: ${TIER_LABEL[r.tier]} (+${r.prize.toLocaleString()}원)`);
        alert(`🎉 당첨을 축하합니다!\n\n${lines.join('\n')}\n\n총 획득: ${totalPrize.toLocaleString()}원`);
    }

    // ===== UI: 번호 선택 =====
    function toggleNumber(n) {
        const idx = selectedNumbers.indexOf(n);
        if (idx >= 0) {
            selectedNumbers.splice(idx, 1);
        } else {
            if (selectedNumbers.length >= 6) return;
            selectedNumbers.push(n);
        }
        renderShopLotto();
    }

    function setAutoQty(delta) {
        autoQty = Math.max(1, Math.min(10, autoQty + delta));
        renderShopLotto();
    }

    async function submitManualBuy() {
        if (selectedNumbers.length !== 6) {
            alert('번호 6개를 선택해주세요!');
            return;
        }
        const ok = await buyTickets([[...selectedNumbers].sort((a, b) => a - b)]);
        if (ok) {
            alert('✅ 로또 구매 완료! 이번 주 토요일 발표를 기다려주세요.');
            selectedNumbers = [];
            renderShopLotto();
        }
    }

    async function submitAutoBuy() {
        const tickets = Array.from({ length: autoQty }, () => generateRandomTicket());
        const ok = await buyTickets(tickets);
        if (ok) {
            alert(`✅ 자동 ${autoQty}장 구매 완료! 이번 주 토요일 발표를 기다려주세요.`);
            autoQty = 1;
            renderShopLotto();
        }
    }

    function switchTab(tab) {
        lottoTab = tab;
        renderShopLotto();
        if (tab === 'my') loadMyTicketsAndRender();
    }

    let myTicketsCache = [];
    async function loadMyTicketsAndRender() {
        const listBox = document.getElementById('lotto-my-list');
        if (!listBox) return;
        listBox.innerHTML = `<p style="font-size:12px; color:var(--sub-text); text-align:center; padding:12px 0;">불러오는 중...</p>`;
        try {
            // orderBy를 같이 쓰면 Firestore 복합 색인이 필요해서 실패할 수 있음 → where만 쓰고 정렬은 클라이언트에서 처리
            const snap = await db.collection('lottoTickets')
                .where('uid', '==', currentUser.uid)
                .limit(50)
                .get();
            myTicketsCache = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => {
                    const at = a.purchasedAt ? a.purchasedAt.toMillis() : 0;
                    const bt = b.purchasedAt ? b.purchasedAt.toMillis() : 0;
                    return bt - at;
                });
        } catch (e) {
            console.warn('로또 목록 조회 실패:', e);
            myTicketsCache = [];
        }
        renderMyTicketsList();
    }

    function renderMyTicketsList() {
        const listBox = document.getElementById('lotto-my-list');
        if (!listBox) return;
        if (!myTicketsCache.length) {
            listBox.innerHTML = `<p style="font-size:12px; color:var(--sub-text); text-align:center; padding:16px 0;">구매한 로또가 없어요.</p>`;
            return;
        }
        listBox.innerHTML = myTicketsCache.map(t => {
            const numsHtml = t.numbers.map(n => `<span class="lotto-ball">${n}</span>`).join('');
            let statusHtml;
            if (!t.checked) {
                statusHtml = `<span style="font-size:11px; color:var(--sub-text);">추첨 대기중</span>`;
            } else if (t.tier) {
                statusHtml = `<span style="font-size:11px; color:#ffca28; font-weight:bold;">${TIER_LABEL[t.tier]} 당첨 (+${t.prize.toLocaleString()}원)</span>`;
            } else {
                statusHtml = `<span style="font-size:11px; color:var(--sub-text);">낙첨</span>`;
            }
            return `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 0; border-bottom:1px solid var(--border-color, rgba(255,255,255,0.08));">
                    <div>
                        <div style="font-size:11px; color:var(--sub-text); margin-bottom:4px;">${formatDateLabel(t.round)} 추첨</div>
                        <div style="display:flex; gap:4px;">${numsHtml}</div>
                    </div>
                    <div>${statusHtml}</div>
                </div>`;
        }).join('');
    }

    // ===== 모달 내용 렌더링 =====
    function renderShopLotto() {
        const body = document.getElementById('lotto-modal-body');
        if (!body) return;

        const upcoming = formatDateLabel(getUpcomingRoundId(new Date()));
        const sub = document.getElementById('lotto-modal-sub');
        if (sub) sub.textContent = `1장 ${TICKET_PRICE.toLocaleString()}원 · 다음 추첨: ${upcoming}`;

        const buyBtn = document.getElementById('lotto-tab-buy-btn');
        const myBtn = document.getElementById('lotto-tab-my-btn');
        if (buyBtn) buyBtn.className = 'lotto-tab-btn' + (lottoTab === 'buy' ? ' active' : '');
        if (myBtn) myBtn.className = 'lotto-tab-btn' + (lottoTab === 'my' ? ' active' : '');

        const numberGrid = Array.from({ length: 45 }, (_, i) => i + 1).map(n => {
            const active = selectedNumbers.includes(n);
            return `<button class="lotto-num-btn${active ? ' active' : ''}" onclick="LottoUI.toggleNumber(${n})">${n}</button>`;
        }).join('');

        body.innerHTML = lottoTab === 'buy' ? `
            <div>
                <div style="font-size:12px; color:var(--sub-text); margin-bottom:6px;">
                    선택: ${selectedNumbers.length}/6 ${selectedNumbers.length ? '(' + [...selectedNumbers].sort((a,b)=>a-b).join(', ') + ')' : ''}
                </div>
                <div class="lotto-num-grid">${numberGrid}</div>
                <button class="modal-btn btn-confirm" style="width:100%; margin-top:10px;" onclick="LottoUI.submitManualBuy()">
                    수동 구매 (${TICKET_PRICE.toLocaleString()}원)
                </button>

                <div style="display:flex; align-items:center; gap:10px; margin-top:18px; padding-top:14px; border-top:1px solid var(--border-color, rgba(255,255,255,0.08));">
                    <span style="font-size:13px;">자동 구매 수량</span>
                    <button class="lotto-qty-btn" onclick="LottoUI.setAutoQty(-1)">-</button>
                    <span style="font-size:14px; font-weight:bold; min-width:20px; text-align:center;">${autoQty}</span>
                    <button class="lotto-qty-btn" onclick="LottoUI.setAutoQty(1)">+</button>
                </div>
                <button class="modal-btn btn-confirm" style="width:100%; margin-top:8px;" onclick="LottoUI.submitAutoBuy()">
                    자동 ${autoQty}장 구매 (${(TICKET_PRICE * autoQty).toLocaleString()}원)
                </button>
            </div>
        ` : `
            <div>
                <button id="lotto-check-btn" class="modal-btn btn-confirm" style="width:100%; margin-bottom:10px;" onclick="LottoUI.checkMyTickets()">🎉 당첨 확인하기</button>
                <div id="lotto-my-list"></div>
            </div>
        `;

        if (lottoTab === 'my') renderMyTicketsList();
    }

    // ===== 모달 열기/닫기 =====
    function openModal() {
        selectedNumbers = [];
        lottoTab = 'buy';
        document.getElementById('lotto-modal').style.display = 'flex';
        renderShopLotto();
        ensureLottoDrawn();
    }

    function closeModal() {
        document.getElementById('lotto-modal').style.display = 'none';
    }

    window.LottoUI = {
        open: openModal, close: closeModal,
        toggleNumber, setAutoQty, submitManualBuy, submitAutoBuy,
        switchTab, checkMyTickets
    };

    window.ensureLottoDrawn = ensureLottoDrawn;

    // 스타일 주입 (번호볼, 그리드 등)
    const style = document.createElement('style');
    style.textContent = `
        .lotto-num-grid { display:grid; grid-template-columns:repeat(7, 1fr); gap:5px; }
        .lotto-num-btn {
            aspect-ratio:1; border-radius:50%; border:1px solid var(--border-color, rgba(255,255,255,0.15));
            background:var(--card-bg, #2a2a2e); color:var(--main-text, #fff); font-size:12px; cursor:pointer;
        }
        .lotto-num-btn.active { background:var(--accent-color, #6c5ce7); color:#fff; font-weight:bold; }
        .lotto-tab-btn {
            flex:1; padding:8px; border-radius:8px; border:1px solid var(--border-color, rgba(255,255,255,0.15));
            background:transparent; color:var(--sub-text,#999); font-size:13px; cursor:pointer;
        }
        .lotto-tab-btn.active { background:var(--accent-color, #6c5ce7); color:#fff; border-color:transparent; font-weight:bold; }
        .lotto-qty-btn {
            width:28px; height:28px; border-radius:50%; border:1px solid var(--border-color, rgba(255,255,255,0.15));
            background:var(--card-bg,#2a2a2e); color:var(--main-text,#fff); font-size:14px; cursor:pointer;
        }
        .lotto-ball {
            display:inline-flex; align-items:center; justify-content:center;
            width:22px; height:22px; border-radius:50%; background:var(--accent-color,#6c5ce7);
            color:#fff; font-size:11px; font-weight:bold;
        }
    `;
    document.head.appendChild(style);
})();
