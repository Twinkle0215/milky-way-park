// ===== lotto.js =====
// 은하수 로또: 상점에서 1,000원에 번호(1~45 중 6개, 수동/자동) 구매
// 매주 토요일(KST) 기준으로 자동 추첨 (서버 없이, 접속한 유저 중 첫 명의 브라우저가
// Firestore 트랜잭션으로 1회만 추첨 확정 → 중복 추첨 불가)

(function () {
    const TICKET_PRICE = 1000;
    const PRIZE_TABLE = { 1: 2000000000, 2: 50000000, 3: 1500000, 4: 50000, 5: 5000 };
    const TIER_LABEL = { 1: '1등', 2: '2등', 3: '3등', 4: '4등', 5: '5등' };

    let selectedNumbers = [];   // 수동 선택 중인 번호
    let autoQty = 1;            // 자동 구매 수량
    let lottoTab = 'buy';       // 'buy' | 'my'

    // 기기 시계 대신 서버 시간 사용 (시계를 바꿔 미리 추첨/당첨번호를 알아내는 꼼수 방지)
    function nowDate() { return new Date(typeof getServerNow === 'function' ? getServerNow() : Date.now()); }
    let buying = false; // 구매 중복 클릭 방지

    // ===== 날짜 유틸 (모두 한국 시간(KST) 기준 - Firestore 규칙의 날짜 검사와 같은 기준) =====
    const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
    // 반환된 Date를 getUTC*()로 읽으면 한국 시간 값이 된다
    function kstView(date) { return new Date(new Date(date).getTime() + KST_OFFSET_MS); }
    function idFromUtcDate(u) {
        const y = u.getUTCFullYear();
        const m = String(u.getUTCMonth() + 1).padStart(2, '0');
        const d = String(u.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // 이번에 구매하면 배정될 "다가오는 토요일" id (YYYY-MM-DD)
    function getUpcomingRoundId(date) {
        const t = kstView(date);
        let daysUntilSat = (6 - t.getUTCDay() + 7) % 7; // 0=일 ... 6=토
        if (daysUntilSat === 0) daysUntilSat = 7; // 오늘이 토요일이면 이미 추첨 지난 걸로 보고 다음주로
        return idFromUtcDate(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + daysUntilSat)));
    }

    // 지금 기준 "가장 최근에 지나간(또는 오늘인) 토요일" id → 이 회차까지는 추첨 대상
    function getDueRoundId(date) {
        const t = kstView(date);
        const daysSinceSat = (t.getUTCDay() - 6 + 7) % 7;
        return idFromUtcDate(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - daysSinceSat)));
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

    // ===== 추첨 (트랜잭션으로 회차당 1회만 확정) =====
    // 이미 추첨된 회차면 그대로 읽어서 반환, 아직이면 이 브라우저가 추첨해서 확정
    async function drawRoundIfMissing(roundId) {
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
        const done = await ref.get();
        return done.exists ? done.data() : null;
    }

    async function ensureLottoDrawn() {
        try {
            await drawRoundIfMissing(getDueRoundId(nowDate()));
        } catch (e) {
            console.warn('로또 추첨 확인 실패:', e);
        }
    }

    // ===== 티켓 구매 =====
    const MAX_BUY_PER_ACTION = 100; // 한 번에 살 수 있는 최대 장수 (Firestore 쓰기 폭주 방지)

    async function buyTickets(ticketNumbersList) {
        if (buying) return false;
        buying = true;
        try { return await buyTicketsInner(ticketNumbersList); }
        finally { buying = false; }
    }

    async function buyTicketsInner(ticketNumbersList) {
        // ticketNumbersList: 번호 6개짜리 배열들의 배열 (여러 장 한번에 가능)
        if (typeof waitServerTime === 'function') await waitServerTime();
        if (typeof serverTimeOk !== 'undefined' && !serverTimeOk) {
            alert('서버 시간을 확인하지 못했어요. 인터넷 연결을 확인하고 다시 시도해주세요.');
            return false;
        }
        if (ticketNumbersList.length > MAX_BUY_PER_ACTION) {
            alert(`한 번에 최대 ${MAX_BUY_PER_ACTION}장까지 구매할 수 있어요.`);
            return false;
        }
        const total = TICKET_PRICE * ticketNumbersList.length;
        if (userData.coin < total) {
            alert(`코인이 부족해요! (필요: ${total.toLocaleString()}원, 보유: ${userData.coin.toLocaleString()}원)`);
            return false;
        }
        // 아직 서버에 안 보낸 코인 증감분을 먼저 반영 (서버 기준 잔액 검사와 맞추기 위함)
        await saveUserDataToFirestore();

        const roundId = getUpcomingRoundId(nowDate());
        // 이미 추첨된 회차에는 구매 불가 (당첨번호를 알고 사는 것 방지)
        try {
            const drawn = await db.collection('lottoRounds').doc(roundId).get();
            if (drawn.exists) { alert('이미 추첨이 끝난 회차예요. 잠시 후 다시 시도해주세요.'); return false; }
        } catch (e) { alert('회차 확인에 실패했어요. 다시 시도해주세요.'); return false; }
        const userRef = db.collection('users').doc(currentUser.uid);
        let bought = 0;
        try {
            const CHUNK = 400;   // Firestore 배치 한도(500) 안에서 나눠 저장
            for (let i = 0; i < ticketNumbersList.length; i += CHUNK) {
                const chunk = ticketNumbersList.slice(i, i + CHUNK);
                const cost = chunk.length * TICKET_PRICE;
                const batch = db.batch();
                chunk.forEach((nums) => {
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
                // 티켓 생성 + 코인 차감을 한 배치로 → 둘 다 되거나 둘 다 안 됨 (공짜 티켓/코인만 빠짐 방지)
                batch.update(userRef, { coin: firebase.firestore.FieldValue.increment(-cost) });
                await batch.commit();
                applyServerCoinDelta(-cost); // 서버가 이미 차감했으므로 로컬/동기화 기준도 함께 이동
                bought += chunk.length;
            }
            updateTopMoney();
            try { if (window.Quests) window.Quests.track('lottoBuy', bought); } catch (e) { }
            return true;
        } catch (e) {
            console.error('로또 구매 실패:', e);
            updateTopMoney();
            if (bought > 0) {
                try { if (window.Quests) window.Quests.track('lottoBuy', bought); } catch (e2) { }
                alert(`${bought}장만 구매됐고 나머지는 실패했어요. (코인이 차감된 만큼만 구매돼요)`);
            } else {
                alert('구매 중 오류가 발생했어요. 코인이 부족하거나 네트워크 문제일 수 있어요. 다시 시도해주세요.');
            }
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

            // 회차 문서는 회차당 1번만 읽는다. 이미 지난 회차인데 추첨이 안 돼 있으면(접속자가 없던 주) 지금 추첨한다.
            const dueId = getDueRoundId(nowDate());
            const roundCache = new Map();
            const roundIds = [...new Set(snap.docs.map(d => d.data().round))];
            for (const rid of roundIds) {
                let r = null;
                try {
                    const rs = await db.collection('lottoRounds').doc(rid).get();
                    if (rid > dueId) r = null; // 아직 추첨일이 안 된 회차는 절대 채점하지 않음
                    else if (rs.exists) r = rs.data();
                    else r = await drawRoundIfMissing(rid);
                } catch (e) { console.warn('회차 확인 실패:', rid, e); }
                roundCache.set(rid, r);
            }

            let totalPrize = 0;
            let checkedCount = 0, pendingCount = 0;
            const results = [];
            const gradable = []; // { ref, tier, prize }

            for (const doc of snap.docs) {
                const ticket = doc.data();
                const round = roundCache.get(ticket.round);
                if (!round) { pendingCount++; continue; } // 아직 추첨 안 된 회차 → 나중에 다시 확인
                const tier = getMatchTier(ticket.numbers, round.winningNumbers, round.bonusNumber);
                const prize = tier ? PRIZE_TABLE[tier] : 0;
                gradable.push({ ref: doc.ref, round: ticket.round, tier, prize });
            }

            // "확인 처리"와 "당첨금 지급"을 한 배치로 묶어서 원자적으로 처리
            // (중간에 끊겨도 당첨금이 사라지거나 이중 지급되지 않음)
            const userRef = db.collection('users').doc(currentUser.uid);
            const CHUNK = 400;
            try {
                for (let i = 0; i < gradable.length; i += CHUNK) {
                    const chunk = gradable.slice(i, i + CHUNK);
                    const chunkPrize = chunk.reduce((a, g) => a + g.prize, 0);
                    const batch = db.batch();
                    chunk.forEach(g => batch.update(g.ref, { checked: true, tier: g.tier, prize: g.prize }));
                    if (chunkPrize > 0) batch.update(userRef, { coin: firebase.firestore.FieldValue.increment(chunkPrize) });
                    await batch.commit();
                    if (chunkPrize > 0) applyServerCoinDelta(chunkPrize);
                    chunk.forEach(g => { if (g.tier) results.push({ round: g.round, tier: g.tier, prize: g.prize }); });
                    totalPrize += chunkPrize;
                    checkedCount += chunk.length;
                }
            } finally {
                updateTopMoney();
            }

            renderLottoResultSummary(results, totalPrize, checkedCount, pendingCount);
            if (checkedCount > 0 && window.Quests) window.Quests.track('lottoCheck');
        } catch (e) {
            console.error('당첨 확인 실패:', e);
            alert('당첨 확인 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.');
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
        autoQty = Math.min(MAX_BUY_PER_ACTION, Math.max(1, Math.floor(autoQty + delta)));
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
        autoQty = Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_BUY_PER_ACTION) : 1;
        renderShopLotto();
    }

    async function submitAutoBuy() {
        const qty = Math.min(MAX_BUY_PER_ACTION, Math.max(1, Math.floor(autoQty)));
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

    // 내 로또 전부 가져오기 (Firestore 1회 조회 한도 때문에 500장씩 끊어서 모두 읽음)
    async function fetchAllMyTickets(checkedValue) {
        const PAGE = 500;
        const out = [];
        let last = null;
        while (true) {
            let q = db.collection('lottoTickets')
                .where('uid', '==', currentUser.uid)
                .where('checked', '==', checkedValue)
                .orderBy(firebase.firestore.FieldPath.documentId())
                .limit(PAGE);
            if (last) q = q.startAfter(last);
            const snap = await q.get();
            snap.docs.forEach(d => out.push({ id: d.id, ...d.data() }));
            if (snap.docs.length < PAGE) break;
            last = snap.docs[snap.docs.length - 1];
        }
        return out;
    }

    // --- 내 로또함: 아직 당첨 확인을 안 한 로또만 ---
    let myTicketsCache = [];
    async function loadMyTicketsAndRender() {
        const listBox = document.getElementById('lotto-my-list');
        if (!listBox) return;
        listBox.innerHTML = loadingHtml;
        try {
            // where 두 개(둘 다 ==)만 사용 → 복합 색인 불필요. 정렬은 클라이언트에서 처리
            myTicketsCache = (await fetchAllMyTickets(false)).sort(sortNewest);
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
        const dueId = getDueRoundId(nowDate());
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
            historyCache = (await fetchAllMyTickets(true))
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

        const upcoming = formatDateLabel(getUpcomingRoundId(nowDate()));
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
                <div style="font-size:11px; color:var(--sub-text); margin-top:6px;">1회 최대 ${MAX_BUY_PER_ACTION}장 · 보유 코인으로 최대 ${Math.min(MAX_BUY_PER_ACTION, Math.floor(userData.coin / TICKET_PRICE)).toLocaleString()}장까지 구매 가능</div>
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
        open: function () { if (requireOnline('로또')) openModal(); }, close: closeModal,
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
