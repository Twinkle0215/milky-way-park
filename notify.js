// ===== notify.js =====
// 사이트에 접속해 있는 동안, 다른 사람이 오목/틱택토 방을 만들면
// 화면 위쪽에 배너 알림이 뜨고 [이동]/[x] 버튼으로 처리하는 기능.
// 서버(Cloud Functions) 없이 Firestore 실시간 리스너만으로 동작 → 완전 무료.

let roomNotifierUnsub = null;
let roomNotifierStartedAt = null;
let roomNotifyLastAt = 0;          // 마지막으로 배너를 띄운 시각 (전체 쿨다운)
const roomNotifyHostLastAt = {};   // 방장별 마지막 알림 시각 (방 만들었다 지우기 반복 스팸 방지)

// ===== 오래된 방 정리 =====
// 방장이 비정상 종료하면 대기방/진행방 문서가 남아 목록(limit 30)을 막고 읽기 비용을 키운다.
// Firestore 규칙이 "오래된 방"에 한해 누구나 삭제할 수 있게 허용하므로, 접속한 유저가 가끔 청소한다.
let _lastRoomCleanupAt = 0;
let _roomCleanupRunning = false;
// [상태값, 기준 시각 필드, 지난 뒤 삭제할 시간(ms)] — 규칙(firestore.rules)의 staleDeletable 과 같은 기준 (+5초 여유)
const _STALE_ROOM_RULES = [
    // 오목 / 틱택토
    { status: 'waiting',    games: ['omok', 'ttt'], field: 'createdAt',  ageMs: 31 * 60 * 1000 },
    { status: 'playing',    games: ['omok', 'ttt'], field: 'lastMoveAt', ageMs: 24 * 60 * 60 * 1000 },
    { status: 'finished',   games: ['omok', 'ttt'], field: 'lastMoveAt', ageMs: 24 * 60 * 60 * 1000 },
    // 플라피 버드
    { status: 'fbWaiting',  games: ['flappy'],      field: 'createdAt',  ageMs: 12 * 60 * 1000 },
    { status: 'fbPlaying',  games: ['flappy'],      field: 'createdAt',  ageMs: 2 * 60 * 60 * 1000 },
    { status: 'fbDone',     games: ['flappy'],      field: 'createdAt',  ageMs: 2 * 60 * 60 * 1000 },
    // 테트리스
    { status: 'ttrWaiting', games: ['tetris'],      field: 'createdAt',  ageMs: 12 * 60 * 1000 },
    { status: 'ttrPlaying', games: ['tetris'],      field: 'createdAt',  ageMs: 2 * 60 * 60 * 1000 },
    { status: 'ttrDone',    games: ['tetris'],      field: 'createdAt',  ageMs: 2 * 60 * 60 * 1000 }
];

async function cleanupStaleRooms() {
    const now = Date.now();
    if (_roomCleanupRunning || now - _lastRoomCleanupAt < 60 * 1000) return; // 1분에 한 번만
    _lastRoomCleanupAt = now;
    _roomCleanupRunning = true;
    try {
        const col = db.collection('omokRooms');
        const PAGE = 50;
        // 오래된 방이 많이 쌓였을 때를 위해 최대 5번 반복 (한 번에 50개씩 → 최대 약 450개 정리)
        for (let pass = 0; pass < 5; pass++) {
            const snaps = await Promise.all(_STALE_ROOM_RULES.map(r => col.where('status', '==', r.status).limit(PAGE).get()));
            const toDelete = [];
            let full = false;
            snaps.forEach((snap, i) => {
                const r = _STALE_ROOM_RULES[i];
                if (snap.size >= PAGE) full = true;
                snap.forEach((doc) => {
                    const d = doc.data();
                    if (!r.games.includes(d.game || 'omok')) return;
                    const t = d[r.field] ? d[r.field].toMillis() : null;
                    if (t && now - t > r.ageMs + 5000) toDelete.push(doc.ref);
                });
            });
            // 하나씩 삭제: 일부가 규칙에서 거절돼도 나머지는 정리되도록 (배치는 하나만 실패해도 전부 취소됨)
            if (toDelete.length) await Promise.allSettled(toDelete.map(ref => ref.delete()));
            if (!full || !toDelete.length) break;
        }
    } catch (e) {
        console.warn('오래된 방 정리 실패:', e);
    } finally {
        _roomCleanupRunning = false;
    }
}

function startRoomNotifier() {
    if (roomNotifierUnsub || !currentUser) return; // 중복 실행 방지
    if (typeof isOnline === 'function' && !isOnline()) return; // 오프라인이면 시작하지 않음 (온라인이 되면 onBackOnline 이 다시 시작)
    roomNotifierStartedAt = firebase.firestore.Timestamp.now();
    cleanupStaleRooms(); // 접속할 때 한 번 청소

    roomNotifierUnsub = db.collection('omokRooms')
        .where('status', '==', 'waiting')
        .onSnapshot((snap) => {
            snap.docChanges().forEach((change) => {
                if (change.type !== 'added') return; // 새로 생긴 방만 처리
                const d = change.doc.data();
                if (!d) return;

                // 방금 로그인한 시점 "이후"에 생긴 방만 알림 (예전부터 있던 대기방은 무시)
                const createdAt = d.createdAt;
                if (createdAt && createdAt.toMillis() < roomNotifierStartedAt.toMillis()) return;

                // 내가 만든 방은 알림 안 띄움
                if (d.hostUid === currentUser.uid) return;

                // 오목/틱택토 방만 (다른 게임 방이 오목 방으로 잘못 표시되지 않게)
                if (d.game && d.game !== 'omok' && d.game !== 'ttt') return;

                // 스팸 방지: 전체 5초 쿨다운 + 같은 방장은 60초에 한 번만
                const nowMs = Date.now();
                if (nowMs - roomNotifyLastAt < 5000) return;
                if (nowMs - (roomNotifyHostLastAt[d.hostUid] || 0) < 60000) return;
                roomNotifyLastAt = nowMs;
                roomNotifyHostLastAt[d.hostUid] = nowMs;

                showRoomNotification({
                    roomId: change.doc.id,
                    game: d.game === 'ttt' ? 'ttt' : 'omok',
                    hostName: d.hostName || '누군가'
                });
            });
        }, (err) => {
            console.warn('방 알림 리스너 오류:', err);
        });
}

function stopRoomNotifier() {
    if (roomNotifierUnsub) { roomNotifierUnsub(); roomNotifierUnsub = null; }
    const box = document.getElementById('room-notify-stack');
    if (box) box.innerHTML = '';
}

function showRoomNotification({ roomId, game, hostName }) {
    let stack = document.getElementById('room-notify-stack');
    if (!stack) {
        stack = document.createElement('div');
        stack.id = 'room-notify-stack';
        stack.style.cssText = `
            position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
            width: min(92vw, 380px); z-index: 99999;
            display: flex; flex-direction: column; gap: 8px;
        `;
        document.body.appendChild(stack);
    }

    // 배너가 너무 많이 쌓이지 않게 최대 3개까지만 유지
    while (stack.children.length >= 3) {
        stack.removeChild(stack.firstChild);
    }

    const gameLabel = game === 'ttt' ? '틱택토' : '오목';
    const gameIcon = game === 'ttt' ? '⭕' : '⚫';

    const banner = document.createElement('div');
    banner.style.cssText = `
        background: var(--card-bg, #2a2a2e); color: var(--main-text, #fff);
        border: 1px solid var(--border-color, rgba(255,255,255,0.12));
        border-radius: 12px; padding: 12px 14px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.35);
        display: flex; align-items: center; gap: 10px;
        animation: roomNotifySlideIn 0.25s ease-out;
    `;
    banner.innerHTML = `
        <div style="font-size:22px; line-height:1;">${gameIcon}</div>
        <div style="flex:1; min-width:0;">
            <div style="font-size:13px; font-weight:bold; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                ${escapeHtml(hostName)}님이 ${gameLabel} 방을 생성하였습니다!!
            </div>
            <div style="font-size:11px; color:var(--sub-text, #999); margin-top:2px;">탭해서 바로 참여해보세요</div>
        </div>
        <button class="room-notify-go" style="flex-shrink:0; background:var(--accent-color,#6c5ce7); color:#fff; border:none; border-radius:8px; padding:7px 12px; font-size:12px; font-weight:bold; cursor:pointer;">이동</button>
        <button class="room-notify-close" style="flex-shrink:0; background:transparent; color:var(--sub-text,#999); border:none; font-size:16px; cursor:pointer; padding:2px 4px;">✕</button>
    `;

    banner.querySelector('.room-notify-go').onclick = () => {
        banner.remove();
        goToRoomFromBanner(roomId, game);
    };
    banner.querySelector('.room-notify-close').onclick = () => {
        banner.remove();
    };

    stack.appendChild(banner);

    // 12초 지나면 자동으로 사라짐
    setTimeout(() => {
        if (banner.parentNode) banner.remove();
    }, 12000);
}

function goToRoomFromBanner(roomId, game) {
    if (game === 'ttt') {
        loadPage('game');
        setTimeout(() => { if (window.Ttt) window.Ttt.resume(roomId); }, 50);
    } else {
        loadPage('game');
        setTimeout(() => { if (window.Omok) window.Omok.resume(roomId); }, 50);
    }
}

function escapeHtml(str) {
    return escHtml(str); // escape.js 의 공용 함수 사용 (따옴표까지 이스케이프)
}

// 배너 슬라이드인 애니메이션 스타일 주입
(function injectNotifyStyle() {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes roomNotifySlideIn {
            from { opacity: 0; transform: translateY(-12px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;
    document.head.appendChild(style);
})();
