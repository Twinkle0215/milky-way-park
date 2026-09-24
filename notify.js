// ===== notify.js =====
// 사이트에 접속해 있는 동안, 다른 사람이 오목/틱택토 방을 만들면
// 화면 위쪽에 배너 알림이 뜨고 [이동]/[x] 버튼으로 처리하는 기능.
// 서버(Cloud Functions) 없이 Firestore 실시간 리스너만으로 동작 → 완전 무료.

let roomNotifierUnsub = null;
let roomNotifierStartedAt = null;

function startRoomNotifier() {
    if (roomNotifierUnsub || !currentUser) return; // 중복 실행 방지
    roomNotifierStartedAt = firebase.firestore.Timestamp.now();

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
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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
