// ===== gift.js : 상점 선물하기 =====
// 다른 유저에게 코인 / 즉석복권 / 테마를 선물할 수 있어요.
//
// [흐름]
//  보내기: 닉네임으로 검색 → 받을 사람 선택 → 선물 고르기 → 보내기
//          (내 코인 차감 + 선물 문서 생성 + 오늘 보낸 횟수 기록을 "한 트랜잭션"으로 처리)
//  받기  : 상점의 "받은 선물함"에서 [받기] (선물 문서 삭제 + 지급을 한 트랜잭션으로 처리 → 두 번 받을 수 없음)
//
// [제한] 하루 최대 10번, 코인 선물은 하루 합계 20,000원까지, 한 번에 최대 10,000원 (계정 여러 개로 코인 몰아주기 방지)
(function () {
    'use strict';

    const GIFTS = 'gifts';
    const QUOTA = 'giftQuota';
    const DAILY_COUNT = 10;
    const DAILY_COINS = 20000;
    const COIN_CHOICES = [100, 500, 1000, 5000, 10000];
    const TICKET_PRICE = 500;
    const MSG_MAX = 30;

    const $ = (id) => document.getElementById(id);
    const fmt = (n) => Number(n).toLocaleString();
    const logged = () => (typeof currentUser !== 'undefined' && currentUser);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const themePrice = () => (typeof THEME_PRICE !== 'undefined' ? THEME_PRICE : 1000);
    const themeList = () => (typeof THEME_LIST !== 'undefined' ? THEME_LIST : []);
    // 선물 가능한 테마: 기본(다크/라이트)과 직접 올리는 "커스텀 이미지" 제외 → 상점에서 파는 것과 같은 목록
    const sellableThemes = () => themeList().filter((t) => t.id !== 'dark' && t.id !== 'light');

    // 규칙(firestore.rules)의 kstDateStr() 과 같은 형식: 한국시간 기준 YYYY-MM-DD
    function kstDay() {
        const ms = (typeof getServerNow === 'function' ? getServerNow() : Date.now()) + 9 * 3600 * 1000;
        return new Date(ms).toISOString().slice(0, 10);
    }

    // ===== 선물 문서 읽기 =====
    async function loadInbox() {
        if (!logged()) return [];
        try {
            const snap = await db.collection(GIFTS).where('to', '==', currentUser.uid).limit(50).get();
            const list = [];
            snap.forEach((d) => list.push({ id: d.id, data: d.data() }));
            list.sort((a, b) => ((a.data.createdAt && a.data.createdAt.toMillis ? a.data.createdAt.toMillis() : 0) - (b.data.createdAt && b.data.createdAt.toMillis ? b.data.createdAt.toMillis() : 0)));
            return list;
        } catch (e) {
            console.warn('[선물] 선물함 불러오기 실패', e);
            return [];
        }
    }

    async function loadQuota() {
        const empty = { sentCount: 0, sentCoins: 0 };
        if (!logged()) return empty;
        try {
            const s = await db.collection(QUOTA).doc(currentUser.uid).get();
            if (s.exists && s.data().day === kstDay()) return { sentCount: s.data().sentCount || 0, sentCoins: s.data().sentCoins || 0 };
        } catch (e) { }
        return empty;
    }

    // ===== 받을 사람 찾기 (닉네임 앞부분 검색) =====
    async function searchUsers(q) {
        q = String(q || '').trim();
        if (q.length < 1) return [];
        const snap = await db.collection('users').where('name', '>=', q).where('name', '<=', q + '\uf8ff').limit(10).get();
        const out = [];
        snap.forEach((d) => {
            if (d.id === currentUser.uid) return;       // 나 자신 제외
            const u = d.data();
            out.push({
                uid: d.id,
                name: u.name || '이름없음',
                avatar: (typeof u.avatarUrl === 'string' && u.avatarUrl.indexOf('data:image/') === 0) ? u.avatarUrl : null,
                owned: (u.ownedThemes && u.ownedThemes.length) ? u.ownedThemes : ['dark', 'light']
            });
        });
        return out;
    }

    // ===== 선물 보내기 =====
    let sending = false;
    async function sendGift(to, item, msg) {
        if (sending) return { error: 'busy' };
        sending = true;
        try {
            if (!requireOnline('선물 보내기')) return { error: 'offline' };
            if (typeof saveUserDataToFirestore === 'function') await saveUserDataToFirestore();   // 서버 잔액과 로컬이 어긋나지 않게
            const uid = currentUser.uid;
            const userRef = db.collection('users').doc(uid);
            const giftRef = db.collection(GIFTS).doc();
            const quotaRef = db.collection(QUOTA).doc(uid);
            const day = kstDay();
            const cost = item.kind === 'coin' ? item.amount : (item.kind === 'ticket' ? item.amount * TICKET_PRICE : themePrice());
            let result = 'ok';
            await db.runTransaction(async (tx) => {
                const us = await tx.get(userRef);
                const qs = await tx.get(quotaRef);
                const coin = us.exists ? (us.data().coin || 0) : 0;
                if (coin < cost) { result = 'poor'; return; }
                const q = (qs.exists && qs.data().day === day) ? qs.data() : { sentCount: 0, sentCoins: 0 };
                if ((q.sentCount || 0) + 1 > DAILY_COUNT) { result = 'limit-count'; return; }
                if (item.kind === 'coin' && (q.sentCoins || 0) + item.amount > DAILY_COINS) { result = 'limit-coins'; return; }
                tx.update(userRef, { coin: coin - cost });
                tx.set(giftRef, {
                    from: uid,
                    fromName: String((typeof userData !== 'undefined' && userData.name) || '익명').slice(0, 30),
                    to: to.uid,
                    kind: item.kind,
                    amount: item.kind === 'theme' ? 0 : item.amount,
                    themeId: item.kind === 'theme' ? item.themeId : null,
                    msg: msg,
                    cost: cost,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                tx.set(quotaRef, { day: day, sentCount: (q.sentCount || 0) + 1, sentCoins: (q.sentCoins || 0) + (item.kind === 'coin' ? item.amount : 0) });
            });
            if (result === 'ok') {
                if (typeof applyServerCoinDelta === 'function') applyServerCoinDelta(-cost);
                if (typeof updateTopMoney === 'function') updateTopMoney();
            }
            return { result: result, cost: cost };
        } catch (e) {
            console.error('[선물] 보내기 실패', e);
            return { error: 'fail' };
        } finally {
            sending = false;
        }
    }

    // ===== 선물 받기 =====
    let claiming = false;
    async function claimGift(giftId) {
        if (claiming) return { error: 'busy' };
        claiming = true;
        try {
            if (!requireOnline('선물 받기')) return { error: 'offline' };
            const uid = currentUser.uid;
            const userRef = db.collection('users').doc(uid);
            const giftRef = db.collection(GIFTS).doc(giftId);
            const out = await db.runTransaction(async (tx) => {
                const gs = await tx.get(giftRef);
                const us = await tx.get(userRef);
                if (!gs.exists) return { gone: true };
                const g = gs.data();
                if (g.to !== uid || !us.exists) return { gone: true };
                const coin = us.data().coin || 0;
                if (g.kind === 'coin') {
                    tx.delete(giftRef);
                    tx.update(userRef, { coin: coin + g.amount });
                    return { kind: 'coin', amount: g.amount };
                }
                if (g.kind === 'ticket') {
                    if (!window.ScratchTicket || typeof window.ScratchTicket.makeTicket !== 'function') throw new Error('scratch-missing');
                    tx.delete(giftRef);
                    for (let i = 0; i < g.amount; i++) {
                        const t = window.ScratchTicket.makeTicket();
                        tx.set(db.collection('scratchTickets').doc(), {
                            uid: uid, price: t.price, win: t.win, cells: t.cells, prize: t.prize,
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    }
                    return { kind: 'ticket', amount: g.amount };
                }
                if (g.kind === 'theme') {
                    const owned = (us.data().ownedThemes && us.data().ownedThemes.length) ? us.data().ownedThemes : ['dark', 'light'];
                    tx.delete(giftRef);
                    if (owned.indexOf(g.themeId) !== -1) {     // 이미 가진 테마면 가격만큼 코인으로 돌려줌
                        tx.update(userRef, { coin: coin + themePrice() });
                        return { kind: 'theme-refund', themeId: g.themeId, amount: themePrice() };
                    }
                    tx.update(userRef, { ownedThemes: firebase.firestore.FieldValue.arrayUnion(g.themeId), lastGift: giftId });
                    return { kind: 'theme', themeId: g.themeId };
                }
                return { gone: true };
            });
            // 화면(로컬) 상태 동기화
            if (out.kind === 'coin' || out.kind === 'theme-refund') { if (typeof applyServerCoinDelta === 'function') applyServerCoinDelta(out.amount); }
            if (out.kind === 'theme' && typeof userData !== 'undefined') {
                if (!userData.ownedThemes) userData.ownedThemes = ['dark', 'light'];
                if (userData.ownedThemes.indexOf(out.themeId) === -1) userData.ownedThemes.push(out.themeId);   // 안 하면 다음 저장 때 덮어써져서 사라짐
            }
            if (typeof updateTopMoney === 'function') updateTopMoney();
            return out;
        } catch (e) {
            console.error('[선물] 받기 실패', e);
            return { error: 'fail' };
        } finally {
            claiming = false;
        }
    }

    // ===== 화면 =====
    function injectStyle() {
        if ($('gift-style')) return;
        const st = document.createElement('style');
        st.id = 'gift-style';
        st.textContent = `
        .gf-overlay { position: fixed; inset: 0; z-index: 10040; background: rgba(0,0,0,0.78); display: flex; align-items: flex-start; justify-content: center; overflow-y: auto; padding: 14px 10px 24px; box-sizing: border-box; }
        .gf-box { width: 100%; max-width: 400px; margin: auto; background: var(--modal-bg, #1b1b2f); color: var(--text-color, #fff); border-radius: 18px; padding: 16px; box-sizing: border-box; border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 16px 50px rgba(0,0,0,0.5); }
        .gf-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .gf-head h3 { margin: 0; font-size: 18px; }
        .gf-x { width: 30px; height: 30px; border-radius: 50%; border: none; background: rgba(255,255,255,0.14); color: inherit; cursor: pointer; font-size: 14px; }
        .gf-tabs { display: flex; gap: 6px; margin-bottom: 12px; }
        .gf-tab { flex: 1; padding: 9px 4px; border: none; border-radius: 10px; background: rgba(255,255,255,0.08); color: inherit; font-weight: 700; font-size: 13px; cursor: pointer; }
        .gf-tab.on { background: linear-gradient(135deg, #ec4899, #8b5cf6); color: #fff; }
        .gf-label { font-size: 12px; font-weight: 800; margin: 12px 0 6px; opacity: .85; }
        .gf-row { display: flex; gap: 6px; }
        .gf-input { flex: 1; min-width: 0; padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.07); color: inherit; font-size: 14px; box-sizing: border-box; }
        .gf-btn { padding: 10px 14px; border: none; border-radius: 10px; font-weight: 800; font-size: 14px; cursor: pointer; color: #fff; background: linear-gradient(135deg, #ec4899, #8b5cf6); }
        .gf-btn.sub { background: rgba(255,255,255,0.14); }
        .gf-btn:disabled { opacity: .45; cursor: default; }
        .gf-btn.full { width: 100%; margin-top: 12px; padding: 13px; font-size: 15px; }
        .gf-users { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
        .gf-user { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; background: rgba(255,255,255,0.07); cursor: pointer; border: 2px solid transparent; }
        .gf-user.on { border-color: #ec4899; background: rgba(236,72,153,0.16); }
        .gf-av { width: 34px; height: 34px; border-radius: 50%; background: #6b7280 center/cover no-repeat; display: flex; align-items: center; justify-content: center; font-weight: 800; flex: 0 0 34px; }
        .gf-name { font-weight: 800; font-size: 14px; }
        .gf-sub { font-size: 11px; opacity: .65; }
        .gf-choices { display: flex; flex-wrap: wrap; gap: 6px; }
        .gf-chip { padding: 9px 12px; border-radius: 10px; border: 2px solid transparent; background: rgba(255,255,255,0.09); color: inherit; font-weight: 800; font-size: 13px; cursor: pointer; }
        .gf-chip.on { border-color: #ec4899; background: rgba(236,72,153,0.2); }
        .gf-themes { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
        .gf-theme { display: flex; align-items: center; gap: 6px; padding: 9px 10px; border-radius: 10px; border: 2px solid transparent; background: rgba(255,255,255,0.09); cursor: pointer; font-size: 13px; font-weight: 700; }
        .gf-theme.on { border-color: #ec4899; background: rgba(236,72,153,0.2); }
        .gf-theme.dis { opacity: .4; cursor: default; }
        .gf-sum { margin-top: 12px; padding: 10px 12px; border-radius: 10px; background: rgba(255,255,255,0.07); font-size: 13px; line-height: 1.6; }
        .gf-note { font-size: 11px; opacity: .65; margin-top: 8px; line-height: 1.5; }
        .gf-inbox-item { padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.08); margin-bottom: 8px; }
        .gf-inbox-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .gf-inbox-msg { margin-top: 6px; font-size: 13px; padding: 7px 9px; border-radius: 8px; background: rgba(0,0,0,0.2); word-break: break-all; }
        .gf-empty { text-align: center; padding: 26px 0; opacity: .6; font-size: 14px; }
        .gf-msg { margin-top: 10px; text-align: center; font-size: 13px; font-weight: 700; min-height: 18px; }
        .gf-badge { display: inline-block; min-width: 18px; padding: 1px 6px; border-radius: 9px; background: #ef4444; color: #fff; font-size: 11px; font-weight: 800; margin-left: 4px; }
        `;
        document.head.appendChild(st);
    }

    let modal = null;
    const S = { tab: 'send', q: '', results: null, to: null, kind: 'coin', coin: 1000, tickets: 1, themeId: null, msg: '', quota: { sentCount: 0, sentCoins: 0 }, inbox: [], note: '' };

    function close() {
        if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
        modal = null;
        renderGiftCard();
    }

    function costNow() {
        if (S.kind === 'coin') return S.coin;
        if (S.kind === 'ticket') return S.tickets * TICKET_PRICE;
        return themePrice();
    }
    function itemLabel(g) {
        if (g.kind === 'coin') return `🪙 코인 ${fmt(g.amount)}원`;
        if (g.kind === 'ticket') return `🎟 즉석복권 ${g.amount}장`;
        const t = themeList().find((x) => x.id === g.themeId);
        return `🎨 테마 ${t ? esc(t.emoji + ' ' + t.name) : esc(g.themeId)}`;
    }

    function render() {
        if (!modal) return;
        const inboxN = S.inbox.length;
        const box = modal.querySelector('.gf-box');
        box.innerHTML = `
            <div class="gf-head"><h3>🎁 선물</h3><button class="gf-x" id="gf-x" aria-label="닫기">✕</button></div>
            <div class="gf-tabs">
                <button class="gf-tab ${S.tab === 'send' ? 'on' : ''}" data-tab="send">선물 보내기</button>
                <button class="gf-tab ${S.tab === 'inbox' ? 'on' : ''}" data-tab="inbox">받은 선물함${inboxN ? `<span class="gf-badge">${inboxN}</span>` : ''}</button>
            </div>
            <div id="gf-body">${S.tab === 'send' ? sendHtml() : inboxHtml()}</div>
            <div class="gf-msg" id="gf-note">${esc(S.note)}</div>`;
        bind();
    }

    function sendHtml() {
        const users = (S.results || []).map((u) => `
            <div class="gf-user ${S.to && S.to.uid === u.uid ? 'on' : ''}" data-uid="${esc(u.uid)}">
                <div class="gf-av" style="${u.avatar ? `background-image:url('${u.avatar}')` : ''}">${u.avatar ? '' : esc(u.name.slice(0, 1))}</div>
                <div><div class="gf-name">${esc(u.name)}</div><div class="gf-sub">ID …${esc(u.uid.slice(-4))}</div></div>
            </div>`).join('');
        let picker = '';
        if (S.to) {
            if (S.kind === 'coin') picker = `<div class="gf-choices">${COIN_CHOICES.map((c) => `<button class="gf-chip ${S.coin === c ? 'on' : ''}" data-coin="${c}">${fmt(c)}원</button>`).join('')}</div>`;
            else if (S.kind === 'ticket') picker = `<div class="gf-choices">${[1, 2, 3, 4, 5].map((c) => `<button class="gf-chip ${S.tickets === c ? 'on' : ''}" data-tk="${c}">${c}장</button>`).join('')}</div>`;
            else picker = `<div class="gf-themes">${sellableThemes().map((t) => {
                const has = (S.to.owned || []).indexOf(t.id) !== -1;
                return `<div class="gf-theme ${S.themeId === t.id ? 'on' : ''} ${has ? 'dis' : ''}" ${has ? '' : `data-th="${esc(t.id)}"`}>${esc(t.emoji)} ${esc(t.name)}${has ? ' <small>(보유중)</small>' : ''}</div>`;
            }).join('')}</div>`;
        }
        const cost = costNow();
        const canSend = S.to && (S.kind !== 'theme' || S.themeId);
        const coinNow = (typeof userData !== 'undefined') ? userData.coin : 0;
        return `
            <div class="gf-label">1. 받을 사람 (닉네임으로 검색)</div>
            <div class="gf-row"><input class="gf-input" id="gf-q" maxlength="30" placeholder="닉네임 앞부분" value="${esc(S.q)}"><button class="gf-btn" id="gf-search">검색</button></div>
            <div class="gf-users">${S.results === null ? '' : (users || '<div class="gf-empty">검색 결과가 없어요</div>')}</div>
            ${S.to ? `
            <div class="gf-label">2. 선물 고르기 → <b>${esc(S.to.name)}</b> 님에게</div>
            <div class="gf-tabs">
                <button class="gf-tab ${S.kind === 'coin' ? 'on' : ''}" data-kind="coin">🪙 코인</button>
                <button class="gf-tab ${S.kind === 'ticket' ? 'on' : ''}" data-kind="ticket">🎟 즉석복권</button>
                <button class="gf-tab ${S.kind === 'theme' ? 'on' : ''}" data-kind="theme">🎨 테마</button>
            </div>
            ${picker}
            <div class="gf-label">3. 메시지 (선택)</div>
            <input class="gf-input" id="gf-msg" maxlength="${MSG_MAX}" placeholder="한마디 남기기 (최대 ${MSG_MAX}자)" value="${esc(S.msg)}" style="width:100%;">
            <div class="gf-sum">
                비용: <b>${fmt(cost)}원</b> (내 코인 ${fmt(coinNow)}원)<br>
                오늘 보낸 횟수: ${S.quota.sentCount} / ${DAILY_COUNT}회 · 코인 선물 ${fmt(S.quota.sentCoins)} / ${fmt(DAILY_COINS)}원
            </div>
            <button class="gf-btn full" id="gf-send" ${canSend ? '' : 'disabled'}>선물 보내기</button>
            <div class="gf-note">보낸 선물은 취소할 수 없어요. 받는 사람이 선물함에서 직접 받아야 도착해요.</div>` : ''}`;
    }

    function inboxHtml() {
        if (!S.inbox.length) return '<div class="gf-empty">받은 선물이 없어요 📭</div>';
        return `<button class="gf-btn full" id="gf-all" style="margin:0 0 10px;">모두 받기 (${S.inbox.length}개)</button>` +
            S.inbox.map((it) => `
            <div class="gf-inbox-item">
                <div class="gf-inbox-top">
                    <div><div class="gf-name">${itemLabel(it.data)}</div><div class="gf-sub">보낸 사람: ${esc(it.data.fromName || '익명')}</div></div>
                    <button class="gf-btn" data-claim="${esc(it.id)}">받기</button>
                </div>
                ${it.data.msg ? `<div class="gf-inbox-msg">💌 ${esc(it.data.msg)}</div>` : ''}
            </div>`).join('');
    }

    function say(t) { S.note = t; const n = $('gf-note'); if (n) n.textContent = t; }

    function bind() {
        $('gf-x').addEventListener('click', close);
        modal.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', async () => {
            S.tab = b.getAttribute('data-tab'); S.note = '';
            if (S.tab === 'inbox') S.inbox = await loadInbox();
            render();
        }));
        if (S.tab === 'inbox') {
            modal.querySelectorAll('[data-claim]').forEach((b) => b.addEventListener('click', () => doClaim([b.getAttribute('data-claim')])));
            const all = $('gf-all'); if (all) all.addEventListener('click', () => doClaim(S.inbox.map((x) => x.id)));
            return;
        }
        const q = $('gf-q');
        const doSearch = async () => {
            S.q = q.value.trim();
            if (!S.q) { say('닉네임을 입력해주세요.'); return; }
            say('검색 중...');
            try { S.results = await searchUsers(S.q); S.note = ''; } catch (e) { console.warn(e); S.results = []; S.note = '검색에 실패했어요.'; }
            render();
        };
        $('gf-search').addEventListener('click', doSearch);
        q.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
        modal.querySelectorAll('[data-uid]').forEach((el) => el.addEventListener('click', () => {
            S.to = (S.results || []).find((u) => u.uid === el.getAttribute('data-uid')) || null;
            S.themeId = null; render();
        }));
        modal.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => { S.kind = b.getAttribute('data-kind'); S.note = ''; render(); }));
        modal.querySelectorAll('[data-coin]').forEach((b) => b.addEventListener('click', () => { S.coin = Number(b.getAttribute('data-coin')); render(); }));
        modal.querySelectorAll('[data-tk]').forEach((b) => b.addEventListener('click', () => { S.tickets = Number(b.getAttribute('data-tk')); render(); }));
        modal.querySelectorAll('[data-th]').forEach((b) => b.addEventListener('click', () => { S.themeId = b.getAttribute('data-th'); render(); }));
        const m = $('gf-msg'); if (m) m.addEventListener('input', () => { S.msg = m.value; });
        const send = $('gf-send'); if (send) send.addEventListener('click', doSend);
    }

    async function doSend() {
        if (!S.to) return;
        const cost = costNow();
        const item = S.kind === 'coin' ? { kind: 'coin', amount: S.coin } : S.kind === 'ticket' ? { kind: 'ticket', amount: S.tickets } : { kind: 'theme', themeId: S.themeId };
        const label = S.kind === 'coin' ? `코인 ${fmt(S.coin)}원` : S.kind === 'ticket' ? `즉석복권 ${S.tickets}장` : '테마';
        if (typeof userData !== 'undefined' && userData.coin < cost) { say(`코인이 부족해요! (필요: ${fmt(cost)}원)`); return; }
        if (!confirm(`${S.to.name} 님에게 ${label}을(를) ${fmt(cost)}원에 선물할까요?\n(보낸 선물은 취소할 수 없어요)`)) return;
        const btn = $('gf-send'); if (btn) btn.disabled = true;
        say('보내는 중...');
        const r = await sendGift(S.to, item, S.msg.trim().slice(0, MSG_MAX));
        if (r.error) { say(r.error === 'offline' ? '인터넷 연결을 확인해주세요.' : '선물을 보내지 못했어요. 잠시 후 다시 시도해주세요.'); if (btn) btn.disabled = false; return; }
        if (r.result === 'poor') { say('코인이 부족해요!'); if (btn) btn.disabled = false; return; }
        if (r.result === 'limit-count') { say(`오늘은 선물을 ${DAILY_COUNT}번까지만 보낼 수 있어요.`); if (btn) btn.disabled = false; return; }
        if (r.result === 'limit-coins') { say(`코인 선물은 하루 ${fmt(DAILY_COINS)}원까지만 보낼 수 있어요.`); if (btn) btn.disabled = false; return; }
        S.quota = await loadQuota();
        S.msg = ''; S.themeId = null;
        render();
        say(`🎁 ${S.to.name} 님에게 선물을 보냈어요!`);
    }

    async function doClaim(ids) {
        say('받는 중...');
        let got = [], fail = 0;
        for (const id of ids) {
            const out = await claimGift(id);
            if (out.error) { fail++; continue; }
            if (out.gone) continue;
            got.push(out);
        }
        S.inbox = await loadInbox();
        render();
        const parts = [];
        const coins = got.filter((g) => g.kind === 'coin' || g.kind === 'theme-refund').reduce((a, g) => a + g.amount, 0);
        const tk = got.filter((g) => g.kind === 'ticket').reduce((a, g) => a + g.amount, 0);
        const th = got.filter((g) => g.kind === 'theme').length;
        if (coins) parts.push(`코인 ${fmt(coins)}원`);
        if (tk) parts.push(`즉석복권 ${tk}장`);
        if (th) parts.push(`테마 ${th}개`);
        say(parts.length ? `✅ 받았어요: ${parts.join(', ')}` + (fail ? ` (실패 ${fail}개)` : '') : (fail ? '받지 못했어요. 잠시 후 다시 시도해주세요.' : '받을 선물이 없어요.'));
        if (typeof renderThemeShop === 'function' && th) { try { renderThemeShop(); } catch (e) { } }
        if (tk && window.ScratchTicket && window.ScratchTicket.refreshCard) window.ScratchTicket.refreshCard();
    }

    async function open(tab) {
        if (!logged()) { alert('로그인이 필요해요.'); return; }
        injectStyle();
        if (modal) close();
        modal = document.createElement('div');
        modal.className = 'gf-overlay';
        modal.innerHTML = '<div class="gf-box"></div>';
        document.body.appendChild(modal);
        // 열 때마다 선택 상태 초기화 (이전에 고른 사람/선물이 남아 있지 않게)
        S.tab = tab || 'send'; S.note = ''; S.q = ''; S.results = null; S.to = null;
        S.kind = 'coin'; S.coin = 1000; S.tickets = 1; S.themeId = null; S.msg = '';
        S.quota = await loadQuota();
        S.inbox = await loadInbox();
        render();
    }

    // ===== 상점 카드 =====
    async function renderGiftCard() {
        const lottoCard = document.querySelector('.game-card[onclick*="LottoUI"]');
        if (!lottoCard) return;
        const grid = lottoCard.parentNode;
        let card = $('gift-shop-card');
        if (!card) {
            card = document.createElement('div');
            card.className = 'game-card';
            card.id = 'gift-shop-card';
            const anchor = $('scratch-shop-card') || lottoCard;     // 즉석복권 카드 바로 뒤
            grid.insertBefore(card, anchor.nextSibling);
        }
        card.innerHTML = `
            <div class="game-icon-badge" style="--ib1:#a78bfa; --ib2:#7c3aed;"><i class="fa-solid fa-gift"></i></div>
            <div>
                <div class="game-title">선물하기</div>
                <div class="game-desc">코인 · 즉석복권 · 테마를 친구에게</div>
                <div class="game-desc" id="gift-inbox-line" style="margin-top:4px;"></div>
            </div>
            <button class="game-play-btn" id="gift-open-btn">선물하기</button>`;
        $('gift-open-btn').addEventListener('click', () => open('send'));
        const list = await loadInbox();
        const el = $('gift-inbox-line');
        if (el && list.length) {
            el.innerHTML = `<a href="#" id="gift-inbox-link" style="color:var(--accent-color); font-weight:bold;">🎁 받은 선물 ${list.length}개 · 열어보기</a>`;
            const a = $('gift-inbox-link');
            if (a) a.addEventListener('click', (e) => { e.preventDefault(); open('inbox'); });
        }
    }

    // 상점이 그려질 때마다 카드 붙이기 (즉석복권 카드가 먼저 붙은 뒤 실행되도록 약간 늦춤)
    const origRenderShop = window.renderThemeShop;
    window.renderThemeShop = function () {
        if (typeof origRenderShop === 'function') origRenderShop();
        setTimeout(renderGiftCard, 0);
    };

    window.GiftUI = { open: open, _test: { kstDay: kstDay } };
})();
