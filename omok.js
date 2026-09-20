// ===== 오목 (온라인 대전) =====
// - 기존 파일(script.js / auth.js / style.css)은 수정하지 않고, 이 파일만 추가해서 동작합니다.
// - 방(room) 데이터는 Firestore 'omokRooms' 컬렉션에 저장되고, onSnapshot으로 실시간 동기화됩니다.
// - 규칙: 15x15, 방장이 흑(선공), 가로/세로/대각선 5목 이상이면 승리 (금수 없음), 한 수당 60초 제한
// - 필요한 전역: db, currentUser (auth.js) / userData, loadPage (script.js)

(function () {
    'use strict';

    const SIZE = 15;
    const TURN_LIMIT_MS = 60000;            // 한 수당 제한 시간
    const TIMEOUT_GRACE_MS = 3000;          // 시간 초과 판정 전 여유
    const WAIT_ROOM_TTL_MS = 30 * 60 * 1000; // 이 시간이 지난 대기방은 목록에서 숨김
    const LS_KEY = 'omokLastRoomId';
    const COLLECTION = 'omokRooms';
    const WIN_REWARD = 1000;                // 승리 보상 (코인만 지급, 랭크 포인트 X)
    const REWARD_MIN_MOVES = 10;            // 기권/시간초과 승리는 이 수 이상 둔 판에서만 보상 (0이면 항상 지급)

    // ----- 상태 -----
    let lobbyUnsub = null;
    let roomUnsub = null;
    let tickTimer = null;
    let roomId = null;
    let room = null;
    let myColor = 0;          // 1 = 흑(방장), 2 = 백(참가자)
    let previewIdx = null;    // 터치로 고른 착수 예정 위치
    let lastMovesLen = -1;
    let busy = false;
    let lastClaimAt = 0;
    let rewardInFlight = false;
    let lobbyBusy = false;     // 방 만들기/입장 진행 중(연타 방지)

    let canvas = null, cctx = null, boardPx = 0, cell = 0, pad = 0;

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

    // ----- 오목 규칙 -----
    function boardFromMoves(moves) {
        const b = new Array(SIZE * SIZE).fill(0);
        moves.forEach((m, i) => { b[m] = (i % 2 === 0) ? 1 : 2; });
        return b;
    }

    // idx에 둔 돌 기준으로 5목 이상이면 그 줄의 돌 위치 배열을, 아니면 null 반환
    function checkWin(board, idx) {
        const color = board[idx];
        if (!color) return null;
        const r = Math.floor(idx / SIZE), c = idx % SIZE;
        const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
        for (const [dr, dc] of dirs) {
            const line = [idx];
            for (const sgn of [1, -1]) {
                let rr = r + dr * sgn, cc = c + dc * sgn;
                while (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && board[rr * SIZE + cc] === color) {
                    line.push(rr * SIZE + cc);
                    rr += dr * sgn; cc += dc * sgn;
                }
            }
            if (line.length >= 5) return line;
        }
        return null;
    }

    // =====================================================
    // 로비 (방 목록)
    // =====================================================
    function detachLobby() {
        if (lobbyUnsub) { lobbyUnsub(); lobbyUnsub = null; }
    }

    function detachRoom() {
        if (roomUnsub) { roomUnsub(); roomUnsub = null; }
        if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
        roomId = null; room = null; myColor = 0;
        previewIdx = null; lastMovesLen = -1; busy = false; rewardInFlight = false;
        canvas = null; cctx = null;
    }

    function openLobby() {
        if (!requireLogin()) return;
        detachLobby();
        detachRoom();

        $('content').innerHTML = `
            <div class="card word-game-container">
                <div class="word-game-header">
                    <button class="word-back-btn" onclick="loadPage('game')"><i class="fa-solid fa-arrow-left"></i> 나가기</button>
                    <span style="font-weight:bold; font-size:14px;"><i class="fa-solid fa-chess-board" style="color:var(--accent-color);"></i> 오목 대전</span>
                </div>
                <div id="omok-resume-box"></div>
                <button class="game-play-btn" onclick="Omok.create()">방 만들기</button>
                <div class="about-me-title" style="margin-top:4px;">열려있는 방</div>
                <div class="dday-list" id="omok-room-list" style="margin-top:0;">
                    <div class="word-bubble system">방 목록을 불러오는 중...</div>
                </div>
            </div>`;

        loadResumeBox();

        lobbyUnsub = db.collection(COLLECTION)
            .where('status', '==', 'waiting')
            .limit(30)
            .onSnapshot((snap) => {
                const list = $('omok-room-list');
                if (!list) return;
                const now = Date.now();
                const rooms = [];
                snap.forEach((doc) => {
                    const d = doc.data({ serverTimestamps: 'estimate' });
                    if (d.game && d.game !== 'omok') return; // 다른 게임(틱택토) 방은 숨김
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
                        <div class="dday-actions"><button class="add-dday-btn" onclick="Omok.join('${id}')">입장</button></div>
                    </div>`).join('');
            }, (err) => {
                console.error('오목 방 목록 오류:', err);
                const list = $('omok-room-list');
                if (list) list.innerHTML = `<div class="word-bubble system">방 목록을 불러오지 못했어요. Firestore 보안 규칙(omokRooms)을 확인해주세요.</div>`;
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
        if (game === 'omok') { enterRoom(id); return; }
        detachLobby();
        if (window.Ttt) window.Ttt.resume(id);
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
            const box = $('omok-resume-box');
            if (!box || !mine.length) return;
            const r = mine[0];
            const game = r.d.game === 'ttt' ? 'ttt' : 'omok';
            const label = game === 'ttt' ? '틱택토' : '오목';
            box.innerHTML = `
                <div class="dday-item">
                    <div class="dday-info"><span class="dday-title">${label} ${r.d.status === 'playing' ? '진행 중인 게임' : '내가 만든 방'}이 있어요</span></div>
                    <div class="dday-actions"><button class="add-dday-btn" onclick="Omok.resumeAny('${r.id}', '${game}')">이어하기</button></div>
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
            myColor = room.hostUid === uid ? 1 : (room.guestUid === uid ? 2 : 0);
            if (!myColor) { detachRoom(); openLobby(); return; }

            if (room.moves.length !== lastMovesLen) {
                previewIdx = null;
                lastMovesLen = room.moves.length;
            }
            if (room.status === 'finished') {
                lsClear();
                if (room.winner === uid && !room.rewarded) claimWinReward();
            }
            renderAll();
        }, (err) => {
            console.error('오목 방 오류:', err);
            const denied = err && err.code === 'permission-denied';
            detachRoom();
            alert(denied ? 'Firestore 보안 규칙에서 omokRooms 접근이 허용되지 않았어요.' : '연결에 문제가 생겼어요.');
            openLobby();
        });

        tickTimer = setInterval(tick, 250);
    }

    function renderRoomShell() {
        $('content').innerHTML = `
            <div class="card word-game-container omok-container">
                <div class="word-game-header">
                    <button class="word-back-btn" onclick="Omok.leave()"><i class="fa-solid fa-arrow-left"></i> 나가기</button>
                    <span style="font-weight:bold; font-size:14px;"><i class="fa-solid fa-chess-board" style="color:var(--accent-color);"></i> 오목 대전</span>
                </div>
                <div class="word-timer-bar-container"><div id="omok-timer-bar" class="word-timer-bar"></div></div>
                <div class="stats-grid" id="omok-players" style="margin-top:0;"></div>
                <div class="omok-board-wrap"><canvas id="omok-canvas"></canvas></div>
                <div class="word-bubble system" id="omok-status"></div>
                <div class="modal-btns" id="omok-actions"></div>
            </div>`;
        setupCanvas();
    }

    function renderAll() {
        renderPlayers();
        renderStatus();
        renderActions();
        drawBoard();
        tick();
    }

    function renderPlayers() {
        const box = $('omok-players');
        if (!box || !room) return;
        const turn = (room.status === 'playing') ? (room.moves.length % 2 === 0 ? 1 : 2) : 0;
        const slot = (color, name, label) => `
            <div class="stat-item omok-player ${turn === color ? 'turn' : ''}">
                <div class="stat-title"><span class="omok-stone ${color === 1 ? 'black' : 'white'}"></span>${label}${myColor === color ? ' · 나' : ''}</div>
                <div class="stat-value" style="font-size:14px; word-break:break-all;">${name ? esc(name) : '대기 중...'}</div>
            </div>`;
        box.innerHTML = slot(1, room.hostName, '흑 (선공)') + slot(2, room.guestName, '백');
    }

    function renderStatus() {
        const box = $('omok-status');
        if (!box || !room) return;
        const oppName = myColor === 1 ? room.guestName : room.hostName;
        let html = '';

        if (room.status === 'waiting') {
            html = '⏳ 상대를 기다리는 중이에요... 다른 유저가 방 목록에서 입장하면 바로 시작돼요!';
        } else if (room.status === 'playing') {
            const turn = room.moves.length % 2 === 0 ? 1 : 2;
            html = (turn === myColor)
                ? `🟢 <b>내 차례</b>예요! (${myColor === 1 ? '흑' : '백'}) 60초 안에 두세요.`
                : `⌛ <b>${esc(oppName)}</b>님의 차례예요...`;
        } else {
            const winnerName = room.winner === room.hostUid ? room.hostName : room.guestName;
            const loserName = room.winner === room.hostUid ? room.guestName : room.hostName;
            if (room.endReason === 'draw' || !room.winner) {
                html = '🤝 판이 가득 찼어요. <b>무승부!</b>';
            } else {
                const iWon = room.winner === currentUser.uid;
                const why = room.endReason === 'resign' ? `${esc(loserName)}님이 기권했어요.`
                    : room.endReason === 'timeout' ? `${esc(loserName)}님이 시간 초과했어요.`
                        : `${esc(winnerName)}님이 오목을 완성했어요!`;
                const rewardText = (iWon && room.rewarded) ? ` (+${WIN_REWARD.toLocaleString()}원)` : '';
                html = `${why}<br><b>${iWon ? '🎉 승리하셨습니다!' + rewardText : '😢 패배했어요...'}</b>`;
            }
        }
        box.innerHTML = html;
    }

    function renderActions() {
        const box = $('omok-actions');
        if (!box || !room) return;
        if (room.status === 'playing') {
            const myTurn = (room.moves.length % 2 === 0 ? 1 : 2) === myColor;
            const canPlace = myTurn && previewIdx !== null;
            box.innerHTML = `
                <button class="modal-btn btn-confirm" onclick="Omok.confirmPlace()" ${canPlace ? '' : 'disabled'}>착수</button>
                <button class="modal-btn btn-danger" onclick="Omok.resign()">기권</button>`;
        } else if (room.status === 'finished') {
            box.innerHTML = `<button class="modal-btn btn-confirm" onclick="Omok.leave()">로비로 돌아가기</button>`;
        } else {
            box.innerHTML = `<button class="modal-btn btn-cancel" onclick="Omok.leave()">방 닫기</button>`;
        }
    }

    // ----- 타이머 (한 수당 60초) -----
    function tick() {
        const bar = $('omok-timer-bar');
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
                if (d.endReason !== 'five' && d.moves.length < REWARD_MIN_MOVES) return false;
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
                const loserColor = d.moves.length % 2 === 0 ? 1 : 2;
                const winner = loserColor === 1 ? d.guestUid : d.hostUid;
                tx.update(roomRef(roomId), { status: 'finished', winner, endReason: 'timeout' });
            });
        } catch (e) { console.warn('시간 초과 처리 실패:', e); }
    }

    // ----- 착수 / 기권 / 나가기 -----
    async function placeStone(idx) {
        if (busy || !room || room.status !== 'playing' || !roomId) return;
        if ((room.moves.length % 2 === 0 ? 1 : 2) !== myColor) return;
        if (room.moves.includes(idx)) return;

        busy = true;
        const uid = currentUser.uid;
        const ref = roomRef(roomId);
        try {
            await db.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                if (!snap.exists) throw new Error('gone');
                const d = snap.data();
                if (d.status !== 'playing') throw new Error('ended');
                const color = d.moves.length % 2 === 0 ? 1 : 2;
                const turnUid = color === 1 ? d.hostUid : d.guestUid;
                if (turnUid !== uid) throw new Error('not-your-turn');
                if (d.moves.includes(idx)) throw new Error('occupied');

                const moves = d.moves.concat(idx);
                const upd = { moves, lastMoveAt: nowTs() };
                if (checkWin(boardFromMoves(moves), idx)) {
                    upd.status = 'finished'; upd.winner = uid; upd.endReason = 'five';
                } else if (moves.length >= SIZE * SIZE) {
                    upd.status = 'finished'; upd.winner = null; upd.endReason = 'draw';
                }
                tx.update(ref, upd);
            });
            previewIdx = null;
        } catch (e) {
            console.warn('착수 실패:', e.message);
        } finally {
            busy = false;
            if (room) { renderActions(); drawBoard(); }
        }
    }

    function confirmPlace() {
        if (previewIdx !== null) placeStone(previewIdx);
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
            if (!confirm('게임이 진행 중이에요. 나가도 로비에서 이어할 수 있지만, 내 차례에 60초가 지나면 패배해요. 나갈까요?')) return;
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
    // 보드 그리기 / 입력
    // =====================================================
    function setupCanvas() {
        canvas = $('omok-canvas');
        if (!canvas) return;
        const wrap = canvas.parentElement;
        const w = wrap.clientWidth || 320;
        const dpr = window.devicePixelRatio || 1;
        boardPx = Math.min(w, 480);
        cell = boardPx / SIZE;
        pad = cell / 2;
        canvas.style.width = boardPx + 'px';
        canvas.style.height = boardPx + 'px';
        canvas.width = Math.round(boardPx * dpr);
        canvas.height = Math.round(boardPx * dpr);
        cctx = canvas.getContext('2d');
        cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        canvas.addEventListener('pointerup', onCanvasPointer);
        drawBoard();
    }

    window.addEventListener('resize', () => {
        if (canvas && document.body.contains(canvas)) { setupCanvas(); }
    });

    function pt(i) { return pad + i * cell; }

    function drawStone(x, y, color, alpha) {
        const r = cell * 0.44;
        cctx.save();
        cctx.globalAlpha = alpha;
        const g = cctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
        if (color === 1) { g.addColorStop(0, '#666'); g.addColorStop(1, '#000'); }
        else { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#cfcfcf'); }
        cctx.shadowColor = 'rgba(0,0,0,0.35)';
        cctx.shadowBlur = 3;
        cctx.shadowOffsetY = 1;
        cctx.beginPath();
        cctx.arc(x, y, r, 0, Math.PI * 2);
        cctx.fillStyle = g;
        cctx.fill();
        cctx.restore();
    }

    function drawBoard() {
        if (!cctx) return;
        const W = boardPx;
        cctx.clearRect(0, 0, W, W);
        cctx.fillStyle = '#dcb35c';
        cctx.fillRect(0, 0, W, W);

        cctx.strokeStyle = 'rgba(60, 40, 10, 0.85)';
        cctx.lineWidth = 1;
        for (let i = 0; i < SIZE; i++) {
            cctx.beginPath(); cctx.moveTo(pad, pt(i)); cctx.lineTo(W - pad, pt(i)); cctx.stroke();
            cctx.beginPath(); cctx.moveTo(pt(i), pad); cctx.lineTo(pt(i), W - pad); cctx.stroke();
        }
        cctx.fillStyle = 'rgba(60, 40, 10, 0.9)';
        [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]].forEach(([r, c]) => {
            cctx.beginPath(); cctx.arc(pt(c), pt(r), cell * 0.12, 0, Math.PI * 2); cctx.fill();
        });

        if (!room) return;
        const moves = room.moves || [];

        moves.forEach((m, i) => {
            drawStone(pt(m % SIZE), pt(Math.floor(m / SIZE)), i % 2 === 0 ? 1 : 2, 1);
        });

        if (moves.length) {
            const last = moves[moves.length - 1];
            cctx.fillStyle = '#ef5350';
            cctx.beginPath();
            cctx.arc(pt(last % SIZE), pt(Math.floor(last / SIZE)), cell * 0.12, 0, Math.PI * 2);
            cctx.fill();

            if (room.status === 'finished' && room.endReason === 'five') {
                const line = checkWin(boardFromMoves(moves), last);
                if (line) {
                    cctx.strokeStyle = '#ef5350';
                    cctx.lineWidth = 2;
                    line.forEach((m) => {
                        cctx.beginPath();
                        cctx.arc(pt(m % SIZE), pt(Math.floor(m / SIZE)), cell * 0.48, 0, Math.PI * 2);
                        cctx.stroke();
                    });
                }
            }
        }

        if (previewIdx !== null && room.status === 'playing') {
            const x = pt(previewIdx % SIZE), y = pt(Math.floor(previewIdx / SIZE));
            drawStone(x, y, myColor, 0.55);
            cctx.strokeStyle = '#ef5350';
            cctx.lineWidth = 1.5;
            cctx.beginPath();
            cctx.arc(x, y, cell * 0.48, 0, Math.PI * 2);
            cctx.stroke();
        }
    }

    function onCanvasPointer(e) {
        if (!room || room.status !== 'playing' || busy) return;
        if ((room.moves.length % 2 === 0 ? 1 : 2) !== myColor) return;

        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (boardPx / rect.width);
        const y = (e.clientY - rect.top) * (boardPx / rect.height);
        const col = Math.round((x - pad) / cell);
        const row = Math.round((y - pad) / cell);
        if (col < 0 || col >= SIZE || row < 0 || row >= SIZE) return;
        const idx = row * SIZE + col;
        if (room.moves.includes(idx)) return;

        if (e.pointerType === 'mouse') {
            placeStone(idx);            // PC: 클릭하면 바로 착수
        } else if (previewIdx === idx) {
            placeStone(idx);            // 모바일: 같은 자리를 한 번 더 누르면 착수
        } else {
            previewIdx = idx;           // 모바일: 처음 누르면 미리보기
            renderActions();
            drawBoard();
        }
    }

    // =====================================================
    // 게임 센터에 오목 카드 추가 + 화면 이동 시 정리
    // (script.js를 수정하지 않기 위해 loadPage를 감싸서 처리)
    // =====================================================
    function injectGameCard() {
        const grid = document.querySelector('#content .game-grid');
        if (!grid || grid.querySelector('[data-omok-card]')) return;
        const first = grid.querySelector('.game-card');
        const html = `
            <div class="game-card" data-omok-card="1" onclick="Omok.open()">
                <div class="game-icon">⚫⚪</div>
                <div>
                    <div class="game-title">오목</div>
                    <div class="game-desc">다른 유저와 실시간 온라인 대전!</div>
                </div>
                <button class="game-play-btn">플레이</button>
            </div>`;
        if (first) first.insertAdjacentHTML('afterend', html);
        else grid.insertAdjacentHTML('afterbegin', html);
    }

    const originalLoadPage = window.loadPage;
    window.loadPage = function (page, btn) {
        teardown();
        const result = originalLoadPage.apply(this, arguments);
        if (page === 'game') injectGameCard();
        return result;
    };

    window.Omok = {
        open: openLobby,
        create: createRoom,
        join: joinRoom,
        resume: enterRoom,
        resumeAny: openRoom,
        leave: leave,
        resign: resign,
        confirmPlace: confirmPlace,
        teardown: teardown
    };
})();

