// ===== 틱택토 (온라인 대전) =====
// - 오목과 같은 구조: Firestore 'omokRooms' 컬렉션(game: 'ttt'로 구분) + onSnapshot 실시간 동기화
// - 규칙: 3x3, 방장이 X(선공), 가로/세로/대각선 3목이면 승리, 한 수당 30초 제한
// - 필요한 전역: db, currentUser (auth.js) / userData, loadPage, updateTopMoney (script.js)

(function () {
    'use strict';

    const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
    const TURN_LIMIT_MS = 30000;             // 한 수당 제한 시간
    const TIMEOUT_GRACE_MS = 3000;           // 시간 초과 판정 전 여유
    const WAIT_ROOM_TTL_MS = 30 * 60 * 1000; // 이 시간이 지난 대기방은 목록에서 숨김
    const LS_KEY = 'tttLastRoomId';
    const COLLECTION = 'omokRooms';           // 오목과 같은 곳에 저장 (보안 규칙을 따로 추가할 필요 없음). game 필드로 구분
    const WIN_REWARD = 1000;                 // 승리 보상 (코인만 지급, 랭크 포인트 X)
    const LOSE_DEDUCTION = 500;              // 패배 벌금 (코인만 차감)
    const REWARD_MIN_MOVES = 5;              // 기권/시간초과 승리는 이 수 이상 둔 판에서만 보상 (0이면 항상 지급)

    // ----- 이 게임 전용 스타일 (기존 style.css는 건드리지 않음) -----
    if (!document.getElementById('ttt-style')) {
        const st = document.createElement('style');
        st.id = 'ttt-style';
        st.textContent = `
            .ttt-board-wrap { width: 100%; display: flex; justify-content: center; }
            .ttt-board { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; width: 100%; max-width: 320px; }
            .ttt-cell {
                aspect-ratio: 1 / 1; border-radius: 12px; border: 1px solid var(--card-border);
                background: rgba(0,0,0,0.2); color: var(--text-color);
                font-size: 44px; font-weight: 800; font-family: inherit; line-height: 1;
                display: flex; align-items: center; justify-content: center;
                cursor: default; padding: 0; user-select: none;
                touch-action: manipulation; -webkit-tap-highlight-color: transparent;
                transition: border-color 0.2s ease, background 0.2s ease;
            }
            .ttt-cell.can { cursor: pointer; }
            .ttt-cell.can:hover { border-color: var(--accent-color); background: rgba(0,0,0,0.35); }
            .ttt-cell.x { color: var(--accent-color); }
            .ttt-cell.o { color: #ffca28; }
            .ttt-cell.last { border-color: var(--accent-color); }
            .ttt-cell.win { border-color: #ef5350; background: rgba(239,83,80,0.18); }
            .ttt-player { transition: border-color 0.2s ease, box-shadow 0.2s ease; }
            .ttt-player.turn { border-color: var(--accent-color); box-shadow: 0 0 0 1px var(--accent-color); }
            .ttt-mark.x { color: var(--accent-color); }
            .ttt-mark.o { color: #ffca28; }
        `;
        document.head.appendChild(st);
    }

    // ----- 상태 -----
    let lobbyUnsub = null;
    let roomUnsub = null;
    let tickTimer = null;
    let roomId = null;
    let room = null;
    let myMark = 0;           // 1 = X(방장, 선공), 2 = O(참가자)
    let busy = false;
    let lastClaimAt = 0;
    let rewardInFlight = false;
    let lobbyBusy = false;     // 방 만들기/입장 진행 중(연타 방지)

    // ----- 유틸 -----
    const $ = (id) => document.getElementById(id);
    const roomRef = (id) => db.collection(COLLECTION).doc(id);
    const nowTs = () => firebase.firestore.FieldValue.serverTimestamp();

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
    }
    function lsGet() { try { return localStorage.getItem(LS_KEY); } catch (e) { return null; } }
    function lsSet(v) { try { localStorage.setItem(LS_KEY, v); } catch (e) { } }
    function lsClear() { try { localStorage.removeItem(LS_KEY); } catch (e) { } }

    function requireLogin() {
        if (typeof currentUser === 'undefined' || !currentUser) {
            alert('로그인이 필요해요.');
            return false;
        }
        return true;
    }

    // ----- 틱택토 규칙 -----
    function boardFromMoves(moves) {
        const b = new Array(9).fill(0);
        moves.forEach((m, i) => { b[m] = (i % 2 === 0) ? 1 : 2; });
        return b;
    }

    // 3목이 완성됐으면 그 줄(칸 번호 3개)을, 아니면 null 반환
    function findWinLine(board) {
        for (const line of LINES) {
            const [a, b, c] = line;
            if (board[a] && board[a] === board[b] && board[a] === board[c]) return line;
        }
        return null;
    }

    const turnMark = () => (room.moves.length % 2 === 0 ? 1 : 2);
    const markChar = (v) => (v === 1 ? 'X' : 'O');

    // =====================================================
    // 로비 (방 목록)
    // =====================================================
    function detachLobby() {
        if (lobbyUnsub) { lobbyUnsub(); lobbyUnsub = null; }
    }

    function detachRoom() {
        if (roomUnsub) { roomUnsub(); roomUnsub = null; }
        if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
        roomId = null; room = null; myMark = 0;
        busy = false; rewardInFlight = false;
    }

    function openLobby() {
        if (!requireLogin()) return;
        detachLobby();
        detachRoom();

        $('content').innerHTML = `
            <div class="card word-game-container">
                <div class="word-game-header">
                    <button class="word-back-btn" onclick="loadPage('game')"><i class="fa-solid fa-arrow-left"></i> 나가기</button>
                    <span style="font-weight:bold; font-size:14px;"><i class="fa-solid fa-hashtag" style="color:var(--accent-color);"></i> 틱택토 대전</span>
                </div>
                <div id="ttt-resume-box"></div>
                <button class="game-play-btn" onclick="Ttt.create()">방 만들기</button>
                <div class="about-me-title" style="margin-top:4px;">열려있는 방</div>
                <div class="dday-list" id="ttt-room-list" style="margin-top:0;">
                    <div class="word-bubble system">방 목록을 불러오는 중...</div>
                </div>
            </div>`;

        loadResumeBox();

        lobbyUnsub = db.collection(COLLECTION)
            .where('status', '==', 'waiting')
            .limit(30)
            .onSnapshot((snap) => {
                const list = $('ttt-room-list');
                if (!list) return;
                const now = Date.now();
                const rooms = [];
                snap.forEach((doc) => {
                    const d = doc.data({ serverTimestamps: 'estimate' });
                    if (d.game !== 'ttt') return; // 오목 방은 숨김
                    const created = d.createdAt ? d.createdAt.toMillis() : now;
                    if (now - created > WAIT_ROOM_TTL_MS) return;
                    rooms.push({ id: doc.id, d, created });
                });
                rooms.sort((a, b) => b.created - a.created);

                if (!rooms.length) {
                    list.innerHTML = `<div class="word-bubble system">열려있는 방이 없어요. 방을 만들어 상대를 기다려보세요!</div>`;
                    return;
                }
                const myUid = currentUser ? currentUser.uid : null;
                list.innerHTML = rooms.map(({ id, d }) => `
                    <div class="dday-item">
                        <div class="dday-info"><span class="dday-title">${esc(d.hostName)}님의 방${d.hostUid === myUid ? ' (내 방)' : ''}</span></div>
                        <div class="dday-actions"><button class="add-dday-btn" onclick="Ttt.join('${id}')">입장</button></div>
                    </div>`).join('');
            }, (err) => {
                console.error('틱택토 방 목록 오류:', err);
                const list = $('ttt-room-list');
                if (list) list.innerHTML = `<div class="word-bubble system">방 목록을 불러오지 못했어요. Firestore 보안 규칙을 확인해주세요.</div>`;
            });
    }

    // =====================================================
    // 1인 1방 규칙
    //  - 내가 방장/참가자로 들어가 있는 대기·진행 중 방을 찾음
    //  - 오목·틱택토가 같은 컬렉션을 쓰므로 두 게임을 통틀어 딱 1개만 허용
    //  - 오래됐거나 중복된 내 대기방은 여기서 자동으로 정리(삭제)
    // =====================================================
    async function findMyActiveRooms() {
        const uid = currentUser.uid;
        const now = Date.now();
        const col = db.collection(COLLECTION);
        const [w, p, g] = await Promise.all([
            col.where('hostUid', '==', uid).where('status', '==', 'waiting').get(),
            col.where('hostUid', '==', uid).where('status', '==', 'playing').get(),
            col.where('guestUid', '==', uid).where('status', '==', 'playing').get()
        ]);
        const read = (snap, list) => snap.forEach((doc) => {
            const d = doc.data({ serverTimestamps: 'estimate' });
            list.push({ id: doc.id, d, created: d.createdAt ? d.createdAt.toMillis() : now });
        });
        const waiting = [], playing = [];
        read(w, waiting); read(p, playing); read(g, playing);

        waiting.sort((a, b) => b.created - a.created);
        const keep = [];
        for (const r of waiting) {
            const stale = now - r.created > WAIT_ROOM_TTL_MS;
            if (stale || keep.length >= 1) {
                try { await col.doc(r.id).delete(); } catch (e) { /* 무시 */ }
            } else {
                keep.push(r);
            }
        }
        return playing.concat(keep); // 진행 중인 게임을 먼저
    }

    // 게임 종류에 맞는 화면으로 방에 들어가기 (오목/틱택토 공용)
    function openRoom(id, game) {
        if (game === 'ttt') { enterRoom(id); return; }
        detachLobby();
        if (window.Omok) window.Omok.resume(id);
    }

    function goToExisting(r) {
        const game = r.d.game === 'ttt' ? 'ttt' : 'omok';
        const label = game === 'ttt' ? '틱택토' : '오목';
        alert(r.d.status === 'playing'
            ? `이미 진행 중인 ${label} 게임이 있어요. 그 게임으로 이동할게요!`
            : `이미 만들어 둔 ${label} 방이 있어요. 그 방으로 이동할게요!`);
        openRoom(r.id, game);
    }

    // 내 방이 있으면 로비 맨 위에 "이어하기" 표시 (다른 기기에서 만든 방도 표시됨)
    async function loadResumeBox() {
        try {
            const mine = await findMyActiveRooms();
            const box = $('ttt-resume-box');
            if (!box || !mine.length) return;
            const r = mine[0];
            const game = r.d.game === 'ttt' ? 'ttt' : 'omok';
            const label = game === 'ttt' ? '틱택토' : '오목';
            box.innerHTML = `
                <div class="dday-item">
                    <div class="dday-info"><span class="dday-title">${label} ${r.d.status === 'playing' ? '진행 중인 게임' : '내가 만든 방'}이 있어요</span></div>
                    <div class="dday-actions"><button class="add-dday-btn" onclick="Ttt.resumeAny('${r.id}', '${game}')">이어하기</button></div>
                </div>`;
        } catch (e) { /* 무시 */ }
    }

    // =====================================================
    // 방 만들기 / 입장
    // =====================================================
    async function createRoom() {
        if (!requireLogin() || lobbyBusy) return;
        lobbyBusy = true; // 연타해도 방이 여러 개 생기지 않게 막음
        try {
            const mine = await findMyActiveRooms();
            if (mine.length) { goToExisting(mine[0]); return; }

            const ref = db.collection(COLLECTION).doc();
            await ref.set({
                game: 'ttt',
                status: 'waiting',
                hostUid: currentUser.uid,
                hostName: userData.name,
                guestUid: null,
                guestName: null,
                moves: [],
                winner: null,
                endReason: null,
                createdAt: nowTs(),
                lastMoveAt: nowTs()
            });
            enterRoom(ref.id);
        } catch (e) {
            console.error(e);
            alert('방을 만들지 못했어요. (Firestore 보안 규칙/네트워크를 확인해주세요)');
        } finally {
            lobbyBusy = false;
        }
    }

    async function joinRoom(id) {
        if (!requireLogin() || lobbyBusy) return;
        lobbyBusy = true;
        const uid = currentUser.uid;
        try {
            // 이미 다른 방에 들어가 있으면 그 방으로 보냄
            const mine = await findMyActiveRooms();
            const other = mine.find((r) => r.id !== id);
            if (other) { goToExisting(other); return; }

            await db.runTransaction(async (tx) => {
                const snap = await tx.get(roomRef(id));
                if (!snap.exists) throw new Error('gone');
                const d = snap.data();
                if (d.hostUid === uid || d.guestUid === uid) return; // 이미 내 방
                if (d.status !== 'waiting' || d.guestUid) throw new Error('full');
                tx.update(roomRef(id), {
                    guestUid: uid,
                    guestName: userData.name,
                    status: 'playing',
                    lastMoveAt: nowTs()
                });
            });
            enterRoom(id);
        } catch (e) {
            if (e.message === 'gone') alert('방이 이미 사라졌어요.');
            else if (e.message === 'full') alert('이미 다른 유저가 입장한 방이에요.');
            else { console.error(e); alert('입장하지 못했어요. 잠시 후 다시 시도해주세요.'); }
        } finally {
            lobbyBusy = false;
        }
    }

    // =====================================================
    // 게임 화면
    // =====================================================
    function enterRoom(id) {
        detachLobby();
        detachRoom();
        roomId = id;
        lsSet(id);
        renderRoomShell();

        roomUnsub = roomRef(id).onSnapshot((snap) => {
            if (roomId !== id) return;
            if (!snap.exists) {
                const wasFinished = room && room.status === 'finished';
                detachRoom(); lsClear();
                if (!wasFinished) alert('방이 닫혔어요.');
                openLobby();
                return;
            }
            room = snap.data({ serverTimestamps: 'estimate' });
            const uid = currentUser.uid;
            myMark = room.hostUid === uid ? 1 : (room.guestUid === uid ? 2 : 0);
            if (!myMark) { detachRoom(); openLobby(); return; }

            if (room.status === 'finished') {
                lsClear();
                if (room.winner === uid && !room.rewarded) claimWinReward();
                if (room.winner && room.winner !== uid && !room.losePenaltyApplied) claimLoseDeduction();
            }
            renderAll();
        }, (err) => {
            console.error('틱택토 방 오류:', err);
            const denied = err && err.code === 'permission-denied';
            detachRoom();
            alert(denied ? 'Firestore 보안 규칙에서 접근이 허용되지 않았어요.' : '연결에 문제가 생겼어요.');
            openLobby();
        });

        tickTimer = setInterval(tick, 250);
    }

    function renderRoomShell() {
        let cells = '';
        for (let i = 0; i < 9; i++) cells += `<button class="ttt-cell" data-i="${i}" onclick="Ttt.place(${i})" disabled></button>`;
        $('content').innerHTML = `
            <div class="card word-game-container ttt-container">
                <div class="word-game-header">
                    <button class="word-back-btn" onclick="Ttt.leave()"><i class="fa-solid fa-arrow-left"></i> 나가기</button>
                    <span style="font-weight:bold; font-size:14px;"><i class="fa-solid fa-hashtag" style="color:var(--accent-color);"></i> 틱택토 대전</span>
                </div>
                <div class="word-timer-bar-container"><div id="ttt-timer-bar" class="word-timer-bar"></div></div>
                <div class="stats-grid" id="ttt-players" style="margin-top:0;"></div>
                <div class="ttt-board-wrap"><div class="ttt-board" id="ttt-board">${cells}</div></div>
                <div class="word-bubble system" id="ttt-status"></div>
                <div class="modal-btns" id="ttt-actions"></div>
            </div>`;
    }

    function renderAll() {
        renderPlayers();
        renderBoard();
        renderStatus();
        renderActions();
        tick();
    }

    function renderPlayers() {
        const box = $('ttt-players');
        if (!box || !room) return;
        const turn = (room.status === 'playing') ? turnMark() : 0;
        const slot = (mark, name, label) => `
            <div class="stat-item ttt-player ${turn === mark ? 'turn' : ''}">
                <div class="stat-title"><b class="ttt-mark ${mark === 1 ? 'x' : 'o'}">${markChar(mark)}</b> ${label}${myMark === mark ? ' · 나' : ''}</div>
                <div class="stat-value" style="font-size:14px; word-break:break-all;">${name ? esc(name) : '대기 중...'}</div>
            </div>`;
        box.innerHTML = slot(1, room.hostName, '선공') + slot(2, room.guestName, '후공');
    }

    function renderBoard() {
        const boardEl = $('ttt-board');
        if (!boardEl || !room) return;
        const b = boardFromMoves(room.moves);
        const winLine = (room.status === 'finished' && room.winner) ? findWinLine(b) : null;
        const lastIdx = room.moves.length ? room.moves[room.moves.length - 1] : -1;
        const myTurn = room.status === 'playing' && turnMark() === myMark;

        boardEl.querySelectorAll('.ttt-cell').forEach((btn) => {
            const i = Number(btn.getAttribute('data-i'));
            const v = b[i];
            btn.textContent = v ? markChar(v) : '';
            btn.className = 'ttt-cell'
                + (v === 1 ? ' x' : v === 2 ? ' o' : '')
                + (winLine && winLine.includes(i) ? ' win' : '')
                + (!winLine && i === lastIdx ? ' last' : '')
                + (!v && myTurn ? ' can' : '');
            btn.disabled = !!v || !myTurn || busy;
        });
    }

    function renderStatus() {
        const box = $('ttt-status');
        if (!box || !room) return;
        const oppName = myMark === 1 ? room.guestName : room.hostName;
        let html = '';

        if (room.status === 'waiting') {
            html = '⏳ 상대를 기다리는 중이에요... 다른 유저가 방 목록에서 입장하면 바로 시작돼요!';
        } else if (room.status === 'playing') {
            html = (turnMark() === myMark)
                ? `🟢 <b>내 차례</b>예요! (${markChar(myMark)}) ${TURN_LIMIT_MS / 1000}초 안에 두세요.`
                : `⌛ <b>${esc(oppName)}</b>님의 차례예요...`;
        } else {
            const winnerName = room.winner === room.hostUid ? room.hostName : room.guestName;
            const loserName = room.winner === room.hostUid ? room.guestName : room.hostName;
            if (room.endReason === 'draw' || !room.winner) {
                html = '🤝 칸이 모두 찼어요. <b>무승부!</b>';
            } else {
                const iWon = room.winner === currentUser.uid;
                const why = room.endReason === 'resign' ? `${esc(loserName)}님이 기권했어요.`
                    : room.endReason === 'timeout' ? `${esc(loserName)}님이 시간 초과했어요.`
                        : `${esc(winnerName)}님이 3목을 완성했어요!`;
                const rewardText = (iWon && room.rewarded) ? ` (+${WIN_REWARD.toLocaleString()}원)` : '';
                const penaltyText = (!iWon && room.losePenaltyApplied) ? ` (-${LOSE_DEDUCTION.toLocaleString()}원)` : '';
                html = `${why}<br><b>${iWon ? '🎉 승리하셨습니다!' + rewardText : '😢 패배했어요...' + penaltyText}</b>`;
            }
        }
        box.innerHTML = html;
    }

    function renderActions() {
        const box = $('ttt-actions');
        if (!box || !room) return;
        if (room.status === 'playing') {
            box.innerHTML = `<button class="modal-btn btn-danger" onclick="Ttt.resign()">기권</button>`;
        } else if (room.status === 'finished') {
            box.innerHTML = `<button class="modal-btn btn-confirm" onclick="Ttt.leave()">로비로 돌아가기</button>`;
        } else {
            box.innerHTML = `<button class="modal-btn btn-cancel" onclick="Ttt.leave()">방 닫기</button>`;
        }
    }

    // ----- 타이머 (한 수당 제한) -----
    function tick() {
        const bar = $('ttt-timer-bar');
        if (!bar) return;
        if (!room || room.status !== 'playing') {
            bar.style.width = '100%';
            bar.style.backgroundColor = 'var(--accent-color)';
            return;
        }
        const start = room.lastMoveAt ? room.lastMoveAt.toMillis() : Date.now();
        const left = TURN_LIMIT_MS - (Date.now() - start);
        const percent = Math.max(0, Math.min(1, left / TURN_LIMIT_MS)) * 100;
        bar.style.width = `${percent}%`;
        bar.style.backgroundColor = left <= 10000 ? '#ef5350' : 'var(--accent-color)';
        if (left <= -TIMEOUT_GRACE_MS) claimTimeout();
    }

    // 승리 보상: 방 문서의 rewarded 플래그를 트랜잭션으로 한 번만 true로 바꾼 사람만 코인을 받음
    async function claimWinReward() {
        if (rewardInFlight || !roomId) return;
        rewardInFlight = true;
        const ref = roomRef(roomId);
        const uid = currentUser.uid;
        try {
            const paid = await db.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                if (!snap.exists) return false;
                const d = snap.data();
                if (d.status !== 'finished' || d.winner !== uid || d.rewarded) return false;
                if (d.endReason !== 'three' && d.moves.length < REWARD_MIN_MOVES) return false;
                tx.update(ref, { rewarded: true });
                return true;
            });
            if (paid) {
                userData.coin += WIN_REWARD;
                if (typeof updateTopMoney === 'function') updateTopMoney();
                if (typeof saveUserDataToFirestore === 'function') saveUserDataToFirestore();
            }
        } catch (e) {
            rewardInFlight = false;
            console.warn('승리 보상 처리 실패:', e);
        }
    }

    // 패배 벌금: 방 문서의 losePenaltyApplied 플래그를 트랜잭션으로 한 번만 true로 바꾼 사람만 코인을 깎임
    async function claimLoseDeduction() {
        if (rewardInFlight || !roomId) return;
        rewardInFlight = true;
        const ref = roomRef(roomId);
        const uid = currentUser.uid;
        try {
            const paid = await db.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                if (!snap.exists) return false;
                const d = snap.data();
                if (d.status !== 'finished' || d.winner === uid || d.losePenaltyApplied) return false;
                if (d.endReason !== 'three' && d.moves.length < REWARD_MIN_MOVES) return false;
                tx.update(ref, { losePenaltyApplied: true });
                return true;
            });
            if (paid) {
                userData.coin -= LOSE_DEDUCTION;
                if (userData.coin < 0) userData.coin = 0;
                if (typeof updateTopMoney === 'function') updateTopMoney();
                if (typeof saveUserDataToFirestore === 'function') saveUserDataToFirestore();
            }
        } catch (e) {
            rewardInFlight = false;
            console.warn('패배 벌금 처리 실패:', e);
        }
    }

    // 두 유저 중 누구의 화면에서든 시간 초과를 확정할 수 있음 (트랜잭션이라 중복 처리되지 않음)
    async function claimTimeout() {
        const now = Date.now();
        if (now - lastClaimAt < 5000 || !roomId) return;
        lastClaimAt = now;
        try {
            await db.runTransaction(async (tx) => {
                const snap = await tx.get(roomRef(roomId));
                if (!snap.exists) return;
                const d = snap.data();
                if (d.status !== 'playing') return;
                const t = d.lastMoveAt ? d.lastMoveAt.toMillis() : 0;
                if (!t || Date.now() - t < TURN_LIMIT_MS) return;
                const loserMark = d.moves.length % 2 === 0 ? 1 : 2;
                const winner = loserMark === 1 ? d.guestUid : d.hostUid;
                tx.update(roomRef(roomId), { status: 'finished', winner, endReason: 'timeout' });
            });
        } catch (e) { console.warn('시간 초과 처리 실패:', e); }
    }

    // ----- 착수 / 기권 / 나가기 -----
    async function placeMark(idx) {
        if (busy || !room || room.status !== 'playing' || !roomId) return;
        if (turnMark() !== myMark) return;
        if (room.moves.includes(idx)) return;

        busy = true;
        renderBoard();
        const uid = currentUser.uid;
        const ref = roomRef(roomId);
        try {
            await db.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                if (!snap.exists) throw new Error('gone');
                const d = snap.data();
                if (d.status !== 'playing') throw new Error('ended');
                const mark = d.moves.length % 2 === 0 ? 1 : 2;
                const turnUid = mark === 1 ? d.hostUid : d.guestUid;
                if (turnUid !== uid) throw new Error('not-your-turn');
                if (d.moves.includes(idx)) throw new Error('occupied');

                const moves = d.moves.concat(idx);
                const upd = { moves, lastMoveAt: nowTs() };
                if (findWinLine(boardFromMoves(moves))) {
                    upd.status = 'finished'; upd.winner = uid; upd.endReason = 'three';
                } else if (moves.length >= 9) {
                    upd.status = 'finished'; upd.winner = null; upd.endReason = 'draw';
                }
                tx.update(ref, upd);
            });
        } catch (e) {
            console.warn('착수 실패:', e.message);
        } finally {
            busy = false;
            if (room) renderBoard();
        }
    }

    async function resign() {
        if (!room || room.status !== 'playing' || !roomId) return;
        if (!confirm('기권하시겠어요?')) return;
        const uid = currentUser.uid;
        const ref = roomRef(roomId);
        try {
            await db.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                if (!snap.exists) return;
                const d = snap.data();
                if (d.status !== 'playing') return;
                const winner = d.hostUid === uid ? d.guestUid : d.hostUid;
                tx.update(ref, { status: 'finished', winner, endReason: 'resign' });
            });
        } catch (e) {
            console.error(e);
            alert('기권 처리에 실패했어요. 다시 시도해주세요.');
        }
    }

    async function leave() {
        if (room && room.status === 'playing') {
            if (!confirm(`게임이 진행 중이에요. 나가도 로비에서 이어할 수 있지만, 내 차례에 ${TURN_LIMIT_MS / 1000}초가 지나면 패배해요. 나갈까요?`)) return;
        }
        const r = room, id = roomId, uid = currentUser.uid;
        detachRoom();
        if (r && r.status === 'waiting' && r.hostUid === uid) {
            lsClear();
            try { await roomRef(id).delete(); } catch (e) { /* 무시 */ }
        }
        openLobby();
    }

    // 다른 탭(하단 메뉴 등)으로 이동할 때: 대기 중인 내 방은 닫고, 진행 중 게임은 그대로 둠(이어하기 가능)
    function teardown() {
        detachLobby();
        if (roomUnsub) {
            const r = room, id = roomId;
            const uid = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : null;
            detachRoom();
            if (r && r.status === 'waiting' && r.hostUid === uid) {
                lsClear();
                roomRef(id).delete().catch(() => { });
            }
        }
    }

    // =====================================================
    // 게임 센터에 틱택토 카드 추가 + 화면 이동 시 정리
    // (script.js를 수정하지 않기 위해 loadPage를 감싸서 처리)
    // =====================================================
    function injectGameCard() {
        const grid = document.querySelector('#content .game-grid');
        if (!grid || grid.querySelector('[data-ttt-card]')) return;
        const anchor = grid.querySelector('[data-omok-card]') || grid.querySelector('.game-card');
        const html = `
            <div class="game-card" data-ttt-card="1" onclick="Ttt.open()">
                <div class="game-icon">❌⭕</div>
                <div>
                    <div class="game-title">틱택토</div>
                    <div class="game-desc">다른 유저와 실시간 온라인 대전!</div>
                </div>
                <button class="game-play-btn">플레이</button>
            </div>`;
        if (anchor) anchor.insertAdjacentHTML('afterend', html);
        else grid.insertAdjacentHTML('afterbegin', html);
    }

    const prevLoadPage = window.loadPage;
    window.loadPage = function (page, btn) {
        teardown();
        const result = prevLoadPage.apply(this, arguments);
        if (page === 'game') injectGameCard();
        return result;
    };

    window.Ttt = {
        open: openLobby,
        create: createRoom,
        join: joinRoom,
        resume: enterRoom,
        resumeAny: openRoom,
        leave: leave,
        resign: resign,
        place: placeMark,
        teardown: teardown
    };
})();
