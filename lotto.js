// ===== lotto.js =====
// 은하수 로또: 상점에서 1,000원에 번호(1~45 중 6개, 수동/자동) 구매
// 매주 토요일 기준으로 자동 추첨 (서버 없이, 접속한 유저 중 첫 명의 브라우저가
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
            const CHUNK = 400;   // Firestore 배치 한도(500) 안에서 나눠 저장
            for (let i = 0; i < ticketNumbersList.length; i += CHUNK) {
                const batch = db.batch();
                ticketNumbersList.slice(i, i + CHUNK).forEach((nums) => {
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
            }

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
            let checkedCount = 0, pendingCount = 0;
            const results = [];

            for (const doc of snap.docs) {
                const ticket = doc.data();
                const roundSnap = await db.collection('lottoRounds').doc(ticket.round).get();
                if (!roundSnap.exists) { pendingCount++; continue; } // 아직 추첨 안 된 회차 → 넘어감(나중에 다시 확인)

                const round = roundSnap.data();
                const tier = getMatchTier(ticket.numbers, round.winningNumbers, round.bonusNumber);
                const prize = tier ? PRIZE_TABLE[tier] : 0;

                await doc.ref.update({ checked: true, tier: tier, prize: prize });
                checkedCount++;
                totalPrize += prize;
                if (tier) results.push({ round: ticket.round, tier, prize });
            }

            if (totalPrize > 0) {
                userData.coin += totalPrize;
                updateTopMoney();
                await saveUserDataToFirestore();
            }

            renderLottoResultSummary(results, totalPrize, checkedCount, pendingCount);
        } catch (e) {
            console.error('당첨 확인 실패:', e);
            alert('당첨 확인 중 오류가 발생했어요.');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '🎉 당첨 확인하기'; }
            historyLoaded = false;   // 기록 탭은 다음에 열 때 새로 불러옴
            renderShopLotto();
            if (lottoTab === 'my') loadMyTicketsAndRender();
        }
    }

    function renderLottoResultSummary(results, totalPrize, checkedCount, pendingCount) {
        if (!checkedCount) {
            alert(pendingCount ? `아직 추첨 전인 로또예요. (${pendingCount}장)\n토요일에 다시 확인해주세요!` : '확인할 로또가 없어요.');
            return;
        }
        const missCount = checkedCount - results.length;
        const tail = `\n\n확인한 로또 ${checkedCount}장 (당첨 ${results.length}장 · 낙첨 ${missCount}장)\n결과는 '기록' 탭에서 볼 수 있어요.`;
        if (!results.length) {
            alert('아쉽지만 당첨된 티켓이 없어요 😢' + tail);
            return;
        }
        const lines = results.map(r => `- ${r.round} 추첨: ${TIER_LABEL[r.tier]} (+${r.prize.toLocaleString()}원)`);
        alert(`🎉 당첨을 축하합니다!\n\n${lines.join('\n')}\n\n총 획득: ${totalPrize.toLocaleString()}원` + tail);
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
        autoQty = Math.max(1, Math.floor(autoQty + delta));
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

    function setAutoQtyDirect(value) {
        const n = Math.floor(Number(value));
        autoQty = Number.isFinite(n) && n >= 1 ? n : 1;
        renderShopLotto();
    }

    async function submitAutoBuy() {
        const qty = Math.max(1, Math.floor(autoQty));
        const total = TICKET_PRICE * qty;
        if (!Number.isSafeInteger(total) || userData.coin < total) {
            alert(`코인이 부족해요! (필요: ${total.toLocaleString()}원, 보유: ${userData.coin.toLocaleString()}원)`);
            return;
        }
        const tickets = Array.from({ length: qty }, () => generateRandomTicket());
        const ok = await buyTickets(tickets);
        if (ok) {
            alert(`✅ 자동 ${qty}장 구매 완료! 이번 주 토요일 발표를 기다려주세요.`);
            autoQty = 1;
            renderShopLotto();
        }
    }

    function switchTab(tab) {
        lottoTab = tab;
        renderShopLotto();
        if (tab === 'my') loadMyTicketsAndRender();
        if (tab === 'history') loadHistoryAndRender();
    }

    const loadingHtml = `<p style="font-size:12px; color:var(--sub-text); text-align:center; padding:12px 0;">불러오는 중...</p>`;
    const sortNewest = (a, b) => {
        const at = a.purchasedAt ? a.purchasedAt.toMillis() : 0;
        const bt = b.purchasedAt ? b.purchasedAt.toMillis() : 0;
        return bt - at;
    };
    const ballsHtml = (nums) => nums.map(n => `<span class="lotto-ball">${n}</span>`).join('');

    // --- 내 로또함: 아직 당첨 확인을 안 한 로또만 ---
    let myTicketsCache = [];
    async function loadMyTicketsAndRender() {
        const listBox = document.getElementById('lotto-my-list');
        if (!listBox) return;
        listBox.innerHTML = loadingHtml;
        try {
            // where 두 개(둘 다 ==)만 사용 → 복합 색인 불필요. 정렬은 클라이언트에서 처리
            const snap = await db.collection('lottoTickets')
                .where('uid', '==', currentUser.uid)
                .where('checked', '==', false)
                .limit(200)
                .get();
            myTicketsCache = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(sortNewest);
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
            listBox.innerHTML = `<p style="font-size:12px; color:var(--sub-text); text-align:center; padding:16px 0; line-height:1.6;">당첨 확인을 기다리는 로또가 없어요.<br>확인을 마친 로또는 '기록' 탭에서 볼 수 있어요.</p>`;
            return;
        }
        const dueId = getDueRoundId(new Date());
        const drawnCount = myTicketsCache.filter(t => t.round <= dueId).length;
        const head = `<p style="font-size:12px; color:var(--sub-text); margin:0 0 4px;">추첨 완료 ${drawnCount}장 · 추첨 대기 ${myTicketsCache.length - drawnCount}장</p>`;
        listBox.innerHTML = head + myTicketsCache.map(t => {
            const drawn = t.round <= dueId;
            const statusHtml = drawn
                ? `<span style="font-size:11px; color:#ffca28; font-weight:bold;">추첨 완료<br>확인 필요</span>`
                : `<span style="font-size:11px; color:var(--sub-text);">추첨 대기중</span>`;
            return `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 0; border-bottom:1px solid var(--border-color, rgba(255,255,255,0.08));">
                    <div>
                        <div style="font-size:11px; color:var(--sub-text); margin-bottom:4px;">${formatDateLabel(t.round)} 추첨</div>
                        <div style="display:flex; gap:4px;">${ballsHtml(t.numbers)}</div>
                    </div>
                    <div style="text-align:right;">${statusHtml}</div>
                </div>`;
        }).join('');
    }

    // --- 기록: 당첨 확인이 끝난 로또 (당첨/낙첨) ---
    const HISTORY_ROUNDS_PER_PAGE = 1;   // 더보기 한 번에 보여줄 추첨 날짜(회차) 수
    let historyCache = [], historyLoaded = false, historyFilter = 'all', historyShown = HISTORY_ROUNDS_PER_PAGE;   // historyShown = 보이는 회차 수
    const roundsCache = {};

    async function loadHistoryAndRender() {
        const box = document.getElementById('lotto-history-box');
        if (!box) return;
        if (!historyLoaded) box.innerHTML = loadingHtml;
        try {
            const snap = await db.collection('lottoTickets')
                .where('uid', '==', currentUser.uid)
                .where('checked', '==', true)
                .limit(500)
                .get();
            historyCache = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => (a.round === b.round ? sortNewest(a, b) : (a.round < b.round ? 1 : -1)));

            const ids = [...new Set(historyCache.map(t => t.round))].filter(id => !roundsCache[id]);
            await Promise.all(ids.map(async (id) => {
                try {
                    const r = await db.collection('lottoRounds').doc(id).get();
                    if (r.exists) roundsCache[id] = r.data();
                } catch (e) { }
            }));
            historyLoaded = true;
        } catch (e) {
            console.warn('로또 기록 조회 실패:', e);
            historyCache = [];
        }
        renderHistory();
    }

    function setHistoryFilter(f) {
        historyFilter = f;
        historyShown = HISTORY_ROUNDS_PER_PAGE;
        renderHistory();
    }

    function showMoreHistory() {
        historyShown += HISTORY_ROUNDS_PER_PAGE;
        renderHistory();
    }

    function renderHistory() {
        const box = document.getElementById('lotto-history-box');
        if (!box) return;
        if (!historyCache.length) {
            box.innerHTML = `<p style="font-size:12px; color:var(--sub-text); text-align:center; padding:16px 0; line-height:1.6;">아직 확인한 로또 기록이 없어요.<br>'내 로또함'에서 당첨 확인을 하면 여기에 쌓여요.</p>`;
            return;
        }

        // 요약
        const total = historyCache.length;
        const wins = historyCache.filter(t => t.tier);
        const prizeSum = historyCache.reduce((sum, t) => sum + (t.prize || 0), 0);
        const spent = total * TICKET_PRICE;
        const net = prizeSum - spent;
        const stat = (label, value, color) => `
            <div style="flex:1; text-align:center; padding:8px 4px; border-radius:8px; background:var(--card-bg, rgba(255,255,255,0.06));">
                <div style="font-size:10px; color:var(--sub-text);">${label}</div>
                <div style="font-size:13px; font-weight:bold; ${color ? 'color:' + color + ';' : ''}">${value}</div>
            </div>`;
        const summary = `
            <div style="display:flex; gap:6px; margin-bottom:6px;">
                ${stat('구매', total + '장')}
                ${stat('당첨', wins.length + '장', '#ffca28')}
                ${stat('낙첨', (total - wins.length) + '장')}
            </div>
            <div style="display:flex; gap:6px; margin-bottom:10px;">
                ${stat('총 당첨금', prizeSum.toLocaleString() + '원', prizeSum ? '#ffca28' : '')}
                ${stat('손익', (net >= 0 ? '+' : '') + net.toLocaleString() + '원', net >= 0 ? '#66bb6a' : '#ef5350')}
            </div>`;

        // 필터
        const chip = (key, label) => `<button class="lotto-tab-btn${historyFilter === key ? ' active' : ''}" style="padding:6px;" onclick="LottoUI.setHistoryFilter('${key}')">${label}</button>`;
        const filters = `<div style="display:flex; gap:6px; margin-bottom:6px;">${chip('all', '전체')}${chip('win', '당첨만')}${chip('lose', '낙첨만')}</div>`;

        let list = historyCache;
        if (historyFilter === 'win') list = historyCache.filter(t => t.tier);
        else if (historyFilter === 'lose') list = historyCache.filter(t => !t.tier);

        if (!list.length) {
            box.innerHTML = summary + filters + `<p style="font-size:12px; color:var(--sub-text); text-align:center; padding:16px 0;">${historyFilter === 'win' ? '아직 당첨된 로또가 없어요.' : '낙첨된 로또가 없어요.'}</p>`;
            return;
        }

        // 추첨 날짜(회차) 기준으로 끊어서 보여줌 (최신 회차부터)
        const roundIds = [...new Set(list.map(t => t.round))];
        const visibleRounds = new Set(roundIds.slice(0, historyShown));
        const shown = list.filter(t => visibleRounds.has(t.round));
        let html = '';
        let lastRound = null;
        for (const t of shown) {
            if (t.round !== lastRound) {
                lastRound = t.round;
                const r = roundsCache[t.round];
                const winBalls = r ? `
                    <div style="display:flex; align-items:center; gap:4px; margin-top:4px;">
                        ${ballsHtml(r.winningNumbers)}
                        <span style="font-size:11px; color:var(--sub-text);">+</span>
                        <span class="lotto-ball">${r.bonusNumber}</span>
                    </div>` : '';
                html += `
                    <div style="margin-top:12px; padding-bottom:6px; border-bottom:2px solid var(--border-color, rgba(255,255,255,0.15));">
                        <div style="font-size:13px; font-weight:bold;">${formatDateLabel(t.round)} 추첨</div>
                        ${winBalls}
                    </div>`;
            }
            const r = roundsCache[t.round];
            const nums = t.numbers.map(n => {
                const hit = r && (r.winningNumbers.includes(n) || r.bonusNumber === n);
                return `<span class="lotto-ball${hit ? '' : ' lotto-miss'}">${n}</span>`;
            }).join('');
            const statusHtml = t.tier
                ? `<span style="font-size:12px; color:#ffca28; font-weight:bold;">${TIER_LABEL[t.tier]} 당첨<br>+${(t.prize || 0).toLocaleString()}원</span>`
                : `<span style="font-size:12px; color:var(--sub-text);">낙첨</span>`;
            html += `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:9px 0; border-bottom:1px solid var(--border-color, rgba(255,255,255,0.08));">
                    <div style="display:flex; gap:4px;">${nums}</div>
                    <div style="text-align:right;">${statusHtml}</div>
                </div>`;
        }
        const remaining = roundIds.length - historyShown;
        const more = remaining > 0
            ? `<button class="modal-btn" style="width:100%; margin-top:10px;" onclick="LottoUI.showMoreHistory()">더보기 · ${formatDateLabel(roundIds[historyShown])} 추첨 (${list.filter(t => t.round === roundIds[historyShown]).length}장${remaining > 1 ? ' 외 ' + (remaining - 1) + '회차 더' : ''})</button>`
            : '';
        box.innerHTML = summary + filters + html + more;
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
        const histBtn = document.getElementById('lotto-tab-history-btn');
        if (buyBtn) buyBtn.className = 'lotto-tab-btn' + (lottoTab === 'buy' ? ' active' : '');
        if (myBtn) myBtn.className = 'lotto-tab-btn' + (lottoTab === 'my' ? ' active' : '');
        if (histBtn) histBtn.className = 'lotto-tab-btn' + (lottoTab === 'history' ? ' active' : '');

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
                    <input type="number" min="1" step="1" value="${autoQty}" onchange="LottoUI.setAutoQtyDirect(this.value)"
                        style="width:80px; text-align:center; font-size:14px; font-weight:bold; padding:4px; border-radius:8px; border:1px solid var(--border-color, rgba(255,255,255,0.15)); background:var(--card-bg,#2a2a2e); color:var(--main-text,#fff);">
                    <button class="lotto-qty-btn" onclick="LottoUI.setAutoQty(1)">+</button>
                </div>
                <div style="font-size:11px; color:var(--sub-text); margin-top:6px;">수량 제한 없음 · 보유 코인으로 최대 ${Math.floor(userData.coin / TICKET_PRICE).toLocaleString()}장까지 구매 가능</div>
                <button class="modal-btn btn-confirm" style="width:100%; margin-top:8px;" onclick="LottoUI.submitAutoBuy()">
                    자동 ${autoQty}장 구매 (${(TICKET_PRICE * autoQty).toLocaleString()}원)
                </button>
            </div>
        ` : lottoTab === 'my' ? `
            <div>
                <button id="lotto-check-btn" class="modal-btn btn-confirm" style="width:100%; margin-bottom:10px;" onclick="LottoUI.checkMyTickets()">🎉 당첨 확인하기</button>
                <div id="lotto-my-list"></div>
            </div>
        ` : `
            <div id="lotto-history-box"></div>
        `;

        if (lottoTab === 'my') renderMyTicketsList();
        if (lottoTab === 'history' && historyLoaded) renderHistory();
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
        switchTab, checkMyTickets, setHistoryFilter, showMoreHistory, setAutoQtyDirect
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
        .lotto-ball.lotto-miss { opacity:0.38; }
        .lotto-ball {
            display:inline-flex; align-items:center; justify-content:center;
            width:22px; height:22px; border-radius:50%; background:var(--accent-color,#6c5ce7);
            color:#fff; font-size:11px; font-weight:bold;
        }
    `;
    document.head.appendChild(style);
})();
