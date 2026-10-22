// ===== flappy.js =====
// 플라피 버드: 솔로 / 온라인 대결(최대 4명, 같은 기둥 배치로 동시 플레이) / 랭킹
// 가시 기둥 하나를 지날 때마다 5코인. 열기: FlappyUI.open()
//
// [Firestore]
//  - 온라인 방: 오목/틱택토와 같은 'omokRooms' 컬렉션 (game: 'flappy', status는 fbWaiting/fbPlaying/fbDone)
//  - 랭킹: users/{uid} 문서의 flappyBest(최고 점수), flappyWins(온라인 승리 수) 필드

(function () {
    const W = 360, H = 560;            // 게임 내부 좌표 (화면에 맞춰 자동 확대/축소)
    const COIN_PER_PILLAR = 10;
    const WIN_BONUS = 1000;            // 온라인: 상대가 먼저 죽으면(마지막 생존) 승리 보상
    const LOSE_PENALTY = 200;          // 온라인: 패배 시 차감
    const MIN_SCORE_FOR_BONUS = 3;     // 승리 보상은 승자가 기둥 3개 이상 통과해야 지급
    const ROOMS = 'omokRooms';        // 오목/틱택토와 같은 컬렉션 (규칙 추가 불필요)
    const ST_WAIT = 'fbWaiting', ST_PLAY = 'fbPlaying', ST_DONE = 'fbDone';   // 오목/틱택토 방과 섞이지 않도록 전용 상태값
    const MAX_PLAYERS = 4;
    const ROOM_TTL_MS = 10 * 60 * 1000;
    const STALE_MS = 20000;            // 이 시간 동안 신호가 없으면 접속 끊긴 것으로 처리

    // 물리 / 난이도 (60fps 기준 프레임 단위)
    const GRAVITY = 0.39;
    const FLAP_VELOCITY = -6.4;
    const MAX_FALL = 8;
    const SPEED = 2.45;
    const BIRD_X = 90;
    const BIRD_R = 13;
    const PILLAR_W = 64;
    const GAP = 190;
    const PILLAR_SPACING = 230;
    const SPIKE_H = 14;
    const SPIKE_COUNT = 4;
    const GROUND_H = 36;

    // 점수(기둥 순서)가 오를수록 어려워짐
    const SPEED_PER_SCORE = 0.02;  // 기둥 1개당 속도 증가
    const SPEED_MAX_BONUS = 0.85;    // 속도 증가 상한
    const GAP_SHRINK = 0.7;         // 기둥 1개당 구멍 줄어드는 양
    const GAP_MIN = 150;            // 구멍 최소 크기
    const MOVE_START = 14;           // 이 단계부터 구멍이 위아래로 움직임
    const MOVE_MAX = 28;            // 구멍 움직임 최대 폭

    // ===== 시드 난수 (온라인에서 모두 같은 기둥 배치를 위해) =====
    function mulberry32(a) {
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // ===== 게임 로직 (화면과 분리) =====
    function newState(rng) {
        return {
            birdY: H / 2 - 20,
            vel: 0,
            pillars: [],
            score: 0,
            coins: 0,
            time: 0,
            alive: true,
            lastGapY: H / 2 - GROUND_H / 2,
            popups: [],
            rng: rng || Math.random,
            spawned: 0
        };
    }

    function spawnPillar(s, x) {
        const level = Math.max(0, s.spawned - 2);        // 기둥 순서 기준 난이도 (모든 플레이어 동일)
        s.spawned += 1;
        const gap = Math.max(GAP_MIN, GAP - level * GAP_SHRINK);
        const maxDelta = Math.max(75, 100 - level);
        const amp = level >= MOVE_START ? Math.min((level - MOVE_START + 1) * 2, MOVE_MAX) : 0;
        const min = gap / 2 + 25 + amp, max = H - GROUND_H - gap / 2 - 25 - amp;
        let base = min + s.rng() * (max - min);
        base = Math.max(s.lastGapY - maxDelta, Math.min(s.lastGapY + maxDelta, base));
        base = Math.max(min, Math.min(max, base));
        s.lastGapY = base;
        const phase = s.rng() * Math.PI * 2;
        const freq = 0.035 + s.rng() * 0.02;
        s.pillars.push({ x, baseY: base, gapY: base, gap, amp, phase, freq, passed: false });
    }

    function flap(s) {
        if (s.alive) s.vel = FLAP_VELOCITY;
    }

    function inTri(px, py, ax, ay, bx, by, cx, cy) {
        const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
        const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
        const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
        const neg = d1 < 0 || d2 < 0 || d3 < 0;
        const pos = d1 > 0 || d2 > 0 || d3 > 0;
        return !(neg && pos);
    }

    function hitsPillar(s, p) {
        const pts = [[0, 0]];
        for (let i = 0; i < 8; i++) {
            const a = (Math.PI * 2 * i) / 8;
            pts.push([Math.cos(a) * (BIRD_R - 3), Math.sin(a) * (BIRD_R - 3)]);
        }
        const topEnd = p.gapY - p.gap / 2;
        const botStart = p.gapY + p.gap / 2;
        const sw = PILLAR_W / SPIKE_COUNT;

        for (const [dx, dy] of pts) {
            const x = BIRD_X + dx, y = s.birdY + dy;
            if (x < p.x || x > p.x + PILLAR_W) continue;
            if (y <= topEnd) return true;
            if (y >= botStart) return true;
            for (let k = 0; k < SPIKE_COUNT; k++) {
                const x0 = p.x + k * sw;
                if (inTri(x, y, x0, topEnd, x0 + sw, topEnd, x0 + sw / 2, topEnd + SPIKE_H)) return true;
                if (inTri(x, y, x0, botStart, x0 + sw, botStart, x0 + sw / 2, botStart - SPIKE_H)) return true;
            }
        }
        return false;
    }

    // dt: 60fps 기준 프레임 배수. 반환: 이번 스텝에 새로 지난 기둥 수
    function step(s, dt) {
        if (!s.alive) return 0;
        s.time += dt;
        s.vel = Math.min(MAX_FALL, s.vel + GRAVITY * dt);
        s.birdY += s.vel * dt;

        if (s.birdY < BIRD_R) { s.birdY = BIRD_R; if (s.vel < 0) s.vel = 0; }
        if (s.birdY > H - GROUND_H - BIRD_R) { s.birdY = H - GROUND_H - BIRD_R; s.alive = false; return 0; }

        const spd = SPEED + Math.min(s.score * SPEED_PER_SCORE, SPEED_MAX_BONUS);
        for (const p of s.pillars) {
            p.x -= spd * dt;
            if (p.amp > 0) p.gapY = p.baseY + Math.sin(s.time * p.freq + p.phase) * p.amp;
        }
        s.pillars = s.pillars.filter(p => p.x > -PILLAR_W - 10);
        const last = s.pillars[s.pillars.length - 1];
        if (!last || last.x < W - PILLAR_SPACING) spawnPillar(s, last ? last.x + PILLAR_SPACING : W + 40);

        let passedNow = 0;
        for (const p of s.pillars) {
            if (hitsPillar(s, p)) { s.alive = false; return passedNow; }
            if (!p.passed && p.x + PILLAR_W < BIRD_X - BIRD_R) {
                p.passed = true;
                s.score += 1;
                s.coins += COIN_PER_PILLAR;
                passedNow += 1;
                s.popups.push({ x: BIRD_X + 10, y: s.birdY - 20, life: 40 });
            }
        }
        return passedNow;
    }

    // ===== 상태 =====
    let overlay = null, body = null, canvas = null, ctx = null;
    let mode = 'menu';          // menu | solo | lobby | room | game | ranking
    let state = null, phase = 'ready';   // ready | countdown | playing | over
    let raf = 0, lastTs = 0;
    let sessionCoins = 0, unsaved = false;
    let best = 0;
    let isOnline = false;

    let roomId = null, roomUnsub = null, lobbyUnsub = null, hbTimer = null, endTimer = null, cdTimer = null;
    let lastRoom = null, startedRound = false, finished = false, busy = false;

    const stars = Array.from({ length: 40 }, () => ({ x: Math.random() * W, y: Math.random() * (H - GROUND_H), r: Math.random() * 1.3 + 0.3 }));

    // ===== 유틸 =====
    const $ = (id) => overlay && overlay.querySelector('#' + id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const logged = () => (typeof currentUser !== 'undefined' && currentUser);
    const myUid = () => (logged() ? currentUser.uid : null);
    const myName = () => (typeof userData !== 'undefined' && userData.name) ? userData.name : '플레이어';

    function loadLocalBest() {
        try { best = parseInt(localStorage.getItem('flappyBest') || '0', 10) || 0; } catch (e) { best = 0; }
    }
    function saveLocalBest() {
        try { localStorage.setItem('flappyBest', String(best)); } catch (e) { }
    }

    async function loadMyStats() {
        if (!logged()) return;
        try {
            const snap = await db.collection('users').doc(currentUser.uid).get();
            const d = snap.exists ? snap.data() : {};
            if ((d.flappyBest || 0) > best) { best = d.flappyBest; saveLocalBest(); }
            else if (best > (d.flappyBest || 0)) submitBest(best);   // 로컬 기록이 더 높으면 서버에도 반영
        } catch (e) { console.warn('[플라피] 기록 불러오기 실패', e); }
    }

    async function submitBest(score) {
        if (!logged()) return;
        try {
            await db.collection('users').doc(currentUser.uid).set({ flappyBest: score }, { merge: true });
        } catch (e) { console.warn('[플라피] 최고 기록 저장 실패', e); }
    }

    function saveCoins() {
        if (!unsaved) return;
        unsaved = false;
        try {
            if (typeof saveUserDataToFirestore === 'function') saveUserDataToFirestore();
        } catch (e) { console.warn('[플라피] 코인 저장 실패', e); }
    }

    function recordScore(score) {
        if (score > best) { best = score; saveLocalBest(); submitBest(best); }
    }

    // ===== 스타일 / 뼈대 =====
    function injectStyle() {
        if (document.getElementById('flappy-style')) return;
        const st = document.createElement('style');
        st.id = 'flappy-style';
        st.textContent = `
        .fb-overlay { position: fixed; inset: 0; z-index: 3000; background: rgba(0,0,0,0.88); display: flex; flex-direction: column; align-items: center; padding: 10px; box-sizing: border-box; color: #fff; }
        .fb-top { width: min(100%, 420px); display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 14px; font-weight: bold; flex: 0 0 auto; }
        .fb-btn-top { background: rgba(255,255,255,0.15); color: #fff; border: none; border-radius: 8px; padding: 6px 12px; font-size: 14px; cursor: pointer; }
        .fb-body { flex: 1 1 auto; width: min(100%, 420px); min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow-y: auto; }
        .fb-wrap { position: relative; height: 100%; max-height: 640px; aspect-ratio: ${W} / ${H}; max-width: 100%; }
        .fb-canvas { width: 100%; height: 100%; border-radius: 12px; touch-action: none; display: block; background: #0b1026; }
        .fb-msg { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; pointer-events: none; }
        .fb-panel { background: rgba(10,14,35,0.9); border: 1px solid rgba(255,255,255,0.2); border-radius: 14px; padding: 18px 22px; pointer-events: auto; min-width: 220px; max-width: 92%; box-sizing: border-box; }
        .fb-panel h3 { margin: 0 0 8px; font-size: 20px; }
        .fb-panel p { margin: 4px 0; font-size: 14px; }
        .fb-btns { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
        .fb-btn { flex: 1; min-width: 90px; padding: 11px; border: none; border-radius: 8px; font-weight: bold; font-size: 14px; cursor: pointer; color: #fff; background: var(--accent-color, #6c63ff); }
        .fb-btn.sub { background: rgba(255,255,255,0.18); }
        .fb-btn:disabled { opacity: 0.45; cursor: default; }
        .fb-menu { width: 100%; display: flex; flex-direction: column; gap: 10px; }
        .fb-menu .fb-btn { padding: 15px; font-size: 16px; }
        .fb-list { width: 100%; display: flex; flex-direction: column; gap: 6px; margin-top: 8px; text-align: left; }
        .fb-row { display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.08); border-radius: 8px; padding: 9px 12px; font-size: 14px; gap: 8px; }
        .fb-row .fb-btn { flex: 0 0 auto; min-width: 0; padding: 6px 12px; }
        .fb-board { position: absolute; left: 6px; top: 6px; background: rgba(0,0,0,0.45); border-radius: 8px; padding: 5px 8px; font-size: 12px; line-height: 1.5; pointer-events: none; max-width: 55%; }
        .fb-tabs { display: flex; gap: 6px; width: 100%; }
        .fb-tabs .fb-btn { padding: 8px; }
        .fb-tabs .fb-btn.off { background: rgba(255,255,255,0.12); }
        `;
        document.head.appendChild(st);
    }

    function build() {
        injectStyle();
        overlay = document.createElement('div');
        overlay.className = 'fb-overlay';
        overlay.innerHTML = `
            <div class="fb-top">
                <span><i class="fa-solid fa-dove" style="color:#38bdf8;"></i> 플라피 버드</span>
                <span><button class="fb-btn-top" id="fb-bgm" title="배경음악">🔊</button> &nbsp; 🪙 <span id="fb-coins">0</span>원 &nbsp; <button class="fb-btn-top" id="fb-back">닫기</button></span>
            </div>
            <div class="fb-body" id="fb-body"></div>`;
        document.body.appendChild(overlay);
        body = $('fb-body');
        $('fb-back').addEventListener('click', onBack);
        if (window.GameBGM) GameBGM.bindButton($('fb-bgm')); else { const b = $('fb-bgm'); if (b) b.style.display = 'none'; }
        document.addEventListener('keydown', onKey);
    }

    function setBackLabel() {
        const b = $('fb-back');
        if (b) b.textContent = (mode === 'menu') ? '닫기' : '뒤로';
    }

    function updateCoinLabel() {
        const el = $('fb-coins');
        if (el) el.textContent = sessionCoins.toLocaleString();
    }

    function setMsg(html) {
        const m = $('fb-msg');
        if (m) m.innerHTML = html;
    }

    // ===== 화면 이동 =====
    async function onBack() {
        if (mode === 'menu') { close(); return; }
        if (mode === 'room' || mode === 'game') {
            await leaveRoom();
            showLobby();
        } else if (mode === 'lobby' || mode === 'ranking' || mode === 'solo') {
            showMenu();
        }
    }

    function showMenu() {
        stopGame();
        detachLobby();
        mode = 'menu';
        setBackLabel();
        body.innerHTML = `
            <div class="fb-menu">
                <div style="text-align:center; margin-bottom:6px;">
                    <div style="width:72px; height:72px; margin:0 auto 8px; border-radius:22px; display:flex; align-items:center; justify-content:center; font-size:32px; color:#fff; background:linear-gradient(135deg,#38bdf8,#0284c7); box-shadow:0 6px 16px rgba(0,0,0,0.4);"><i class="fa-solid fa-dove"></i></div>
                    <div style="font-size:13px; opacity:.8;">가시 기둥 하나 통과할 때마다 ${COIN_PER_PILLAR}코인!</div>
                    <div style="font-size:13px; opacity:.8; margin-top:4px;">🏆 내 최고 기록: ${best}</div>
                </div>
                <button class="fb-btn" id="fb-solo">🎮 솔로 플레이</button>
                <button class="fb-btn" id="fb-online">🌐 온라인 대결</button>
                <button class="fb-btn sub" id="fb-rank">🏆 랭킹</button>
            </div>`;
        $('fb-solo').addEventListener('click', startSolo);
        $('fb-online').addEventListener('click', () => { if (requireOnline('온라인 대결')) showLobby(); });
        $('fb-rank').addEventListener('click', () => { if (requireOnline('랭킹')) showRanking('best'); });
    }

    // ===== 게임 화면 공통 =====
    function buildGameView() {
        body.innerHTML = `
            <div class="fb-wrap">
                <canvas class="fb-canvas" id="fb-canvas"></canvas>
                <div class="fb-board" id="fb-board" style="display:none;"></div>
                <div class="fb-msg" id="fb-msg"></div>
            </div>`;
        canvas = $('fb-canvas');
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        canvas.addEventListener('pointerdown', onTap);
        lastTs = 0;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(loop);
    }

    function stopGame() {
        if (window.GameBGM) GameBGM.stop();
        cancelAnimationFrame(raf);
        clearInterval(hbTimer); clearInterval(endTimer); clearInterval(cdTimer);
        hbTimer = endTimer = cdTimer = null;
        saveCoins();
        canvas = ctx = null;
        state = null;
    }

    function onKey(e) {
        if (e.code === 'Escape') { onBack(); return; }
        if ((e.code === 'Space' || e.code === 'ArrowUp') && (mode === 'solo' || mode === 'game')) {
            e.preventDefault(); onTap();
        }
    }

    function onTap(e) {
        if (e && e.preventDefault) e.preventDefault();
        if (!state) return;
        if (phase === 'ready') { phase = 'playing'; setMsg(''); flap(state); }
        else if (phase === 'playing') flap(state);
    }

    // ===== 솔로 =====
    function startSolo() {
        stopGame();
        isOnline = false;
        mode = 'solo';
        setBackLabel();
        buildGameView();
        resetSolo();
    }

    function resetSolo() {
        state = newState(Math.random);
        phase = 'ready';
        setMsg(`<div class="fb-panel" style="pointer-events:none;"><h3>탭해서 시작!</h3><p>가시 기둥 사이를 지나가세요</p><p>🏆 최고 기록: ${best}</p></div>`);
    }

    function soloOver() {
        phase = 'over';
        if (window.Quests) { window.Quests.track('play'); window.Quests.track('flappyPillars', state.score); }
        recordScore(state.score);
        saveCoins();
        setMsg(`
            <div class="fb-panel">
                <h3>💥 게임 오버</h3>
                <p>통과한 기둥: <b>${state.score}</b>개</p>
                <p>획득 코인: <b>+${state.coins}원</b></p>
                <p>🏆 최고 기록: ${best}</p>
                <div class="fb-btns">
                    <button class="fb-btn" id="fb-retry">다시하기</button>
                    <button class="fb-btn sub" id="fb-exit">메뉴</button>
                </div>
            </div>`);
        $('fb-retry').addEventListener('click', (e) => { e.stopPropagation(); resetSolo(); });
        $('fb-exit').addEventListener('click', (e) => { e.stopPropagation(); showMenu(); });
    }

    // ===== 그리기 =====
    function drawSpikes(x, baseY, dir) {
        const sw = PILLAR_W / SPIKE_COUNT;
        ctx.fillStyle = '#ff5252';
        for (let k = 0; k < SPIKE_COUNT; k++) {
            const x0 = x + k * sw;
            ctx.beginPath();
            ctx.moveTo(x0, baseY);
            ctx.lineTo(x0 + sw, baseY);
            ctx.lineTo(x0 + sw / 2, baseY + dir * SPIKE_H);
            ctx.closePath();
            ctx.fill();
        }
    }

    function draw() {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#0b1026'); g.addColorStop(1, '#2b1b54');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        for (const st of stars) { ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2); ctx.fill(); }

        for (const p of state.pillars) {
            const topEnd = p.gapY - p.gap / 2, botStart = p.gapY + p.gap / 2;
            ctx.fillStyle = '#5b4a8a';
            ctx.fillRect(p.x, 0, PILLAR_W, topEnd);
            ctx.fillRect(p.x, botStart, PILLAR_W, H - GROUND_H - botStart);
            ctx.fillStyle = '#7a66b8';
            ctx.fillRect(p.x, topEnd - 8, PILLAR_W, 8);
            ctx.fillRect(p.x, botStart, PILLAR_W, 8);
            drawSpikes(p.x, topEnd, +1);
            drawSpikes(p.x, botStart, -1);
        }

        ctx.fillStyle = '#1b1238';
        ctx.fillRect(0, H - GROUND_H, W, GROUND_H);
        ctx.fillStyle = '#3a2a70';
        ctx.fillRect(0, H - GROUND_H, W, 4);

        const bob = (phase === 'ready' || phase === 'countdown') ? Math.sin(Date.now() / 200) * 6 : 0;
        const tilt = Math.max(-0.5, Math.min(1.1, state.vel * 0.08));
        ctx.save();
        ctx.translate(BIRD_X, state.birdY + bob);
        ctx.rotate(tilt);
        ctx.fillStyle = '#ffd54f';
        ctx.beginPath(); ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffb300';
        ctx.beginPath(); ctx.ellipse(-3, 3, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff7043';
        ctx.beginPath(); ctx.moveTo(BIRD_R - 2, -2); ctx.lineTo(BIRD_R + 8, 2); ctx.lineTo(BIRD_R - 2, 6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(5, -5, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#222';
        ctx.beginPath(); ctx.arc(6.5, -5, 2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 40px sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 4;
        ctx.strokeText(String(state.score), W / 2, 60);
        ctx.fillText(String(state.score), W / 2, 60);

        for (const pu of state.popups) {
            ctx.globalAlpha = Math.max(0, pu.life / 40);
            ctx.fillStyle = '#ffd54f';
            ctx.font = 'bold 18px sans-serif';
            ctx.fillText(`+${COIN_PER_PILLAR}`, pu.x + 20, pu.y);
            ctx.globalAlpha = 1;
        }
    }

    function loop(ts) {
        raf = requestAnimationFrame(loop);
        if (!state || !ctx) return;
        const dt = lastTs ? Math.min((ts - lastTs) / 16.667, 2) : 1;
        lastTs = ts;

        // 게임 상태에 맞춰 배경음악 재생/정지 (플레이 중에만 연주, 점수가 오를수록 템포 상승)
        if (window.GameBGM) {
            if (phase === 'playing' && state.alive) {
                GameBGM.setSpeed(1 + Math.min(0.3, (state.score || 0) * 0.008));
                GameBGM.play('flappy');
            } else {
                GameBGM.stop();
            }
        }

        if (phase === 'playing') {
            const passed = step(state, dt);
            if (passed > 0) {
                const gain = passed * COIN_PER_PILLAR;
                if (typeof userData !== 'undefined') userData.coin += gain;
                sessionCoins += gain;
                unsaved = true;
                if (typeof updateTopMoney === 'function') updateTopMoney();
                updateCoinLabel();
                if (isOnline) { publish({ score: state.score }); renderBoard(); }
            }
            if (!state.alive) { isOnline ? onlineDied() : soloOver(); }
        }
        for (const pu of state.popups) { pu.y -= 0.8 * dt; pu.life -= dt; }
        state.popups = state.popups.filter(pu => pu.life > 0);
        draw();
    }

    // ===== 랭킹 =====
    async function showRanking() {
        stopGame();
        detachLobby();
        mode = 'ranking';
        setBackLabel();
        body.innerHTML = `
            <div style="width:100%;">
                <div style="text-align:center; font-weight:bold;">🏆 최고 기록 TOP 20</div>
                <div class="fb-list" id="fb-rank-list"><div class="fb-row">불러오는 중...</div></div>
            </div>`;
        try {
            const snap = await db.collection('users').orderBy('flappyBest', 'desc').limit(20).get();
            if (mode !== 'ranking' || !$('fb-rank-list')) return;
            const rows = [];
            let i = 0;
            snap.forEach(doc => {
                const d = doc.data();
                if (!(d.flappyBest > 0)) return;
                i += 1;
                const medal = i === 1 ? '🥇' : i === 2 ? '🥈' : i === 3 ? '🥉' : `${i}.`;
                const me = doc.id === myUid() ? ' style="outline:2px solid var(--accent-color,#6c63ff);"' : '';
                rows.push(`<div class="fb-row"${me}><span>${medal} ${esc(d.name || '이름없음')}</span><b>${d.flappyBest}개</b></div>`);
            });
            $('fb-rank-list').innerHTML = rows.length ? rows.join('') : '<div class="fb-row">아직 기록이 없어요. 첫 기록을 세워보세요!</div>';
        } catch (e) {
            console.error('[플라피] 랭킹 오류', e);
            if ($('fb-rank-list')) $('fb-rank-list').innerHTML = '<div class="fb-row">랭킹을 불러오지 못했어요.</div>';
        }
    }

    // ===== 온라인: 로비 =====
    function detachLobby() { if (lobbyUnsub) { lobbyUnsub(); lobbyUnsub = null; } }
    function detachRoom() { if (roomUnsub) { roomUnsub(); roomUnsub = null; } }

    function showLobby() {
        stopGame();
        detachLobby();
        detachRoom();
        if (!logged()) { alert('온라인 대결은 로그인이 필요해요.'); showMenu(); return; }
        mode = 'lobby';
        isOnline = true;
        roomId = null; lastRoom = null;
        setBackLabel();
        body.innerHTML = `
            <div style="width:100%;">
                <div style="text-align:center; font-size:13px; opacity:.85; margin-bottom:10px;">같은 기둥 배치로 동시에 플레이! 상대보다 오래 살아남으면 승리 +${WIN_BONUS}원, 먼저 죽으면 -${LOSE_PENALTY}원 (승자가 기둥 ${MIN_SCORE_FOR_BONUS}개 이상 통과해야 정산, 최대 ${MAX_PLAYERS}명)</div>
                <button class="fb-btn" id="fb-create" style="width:100%; padding:14px;">방 만들기</button>
                <div style="margin-top:12px; font-weight:bold;">열려있는 방</div>
                <div class="fb-list" id="fb-room-list"><div class="fb-row">방 목록을 불러오는 중...</div></div>
            </div>`;
        $('fb-create').addEventListener('click', createRoom);

        if (typeof cleanupStaleRooms === 'function') cleanupStaleRooms(); // 오래된 방 정리 (목록 30개 제한이 막히지 않게)
        lobbyUnsub = db.collection(ROOMS).where('status', '==', ST_WAIT).limit(30).onSnapshot((snap) => {
            const list = $('fb-room-list');
            if (!list || mode !== 'lobby') return;
            const now = Date.now();
            const rooms = [];
            snap.forEach(doc => {
                const d = doc.data({ serverTimestamps: 'estimate' });
                const created = d.createdAt ? d.createdAt.toMillis() : now;
                if (now - created > ROOM_TTL_MS) return;
                const count = Object.keys(d.players || {}).length;
                rooms.push({ id: doc.id, d, count, created });
            });
            rooms.sort((a, b) => b.created - a.created);
            if (!rooms.length) { list.innerHTML = '<div class="fb-row">열려있는 방이 없어요. 방을 만들어보세요!</div>'; return; }
            list.innerHTML = rooms.map(r => `
                <div class="fb-row">
                    <span>${esc(r.d.hostName)}님의 방 (${r.count}/${MAX_PLAYERS})${r.d.hostUid === myUid() ? ' · 내 방' : ''}</span>
                    <button class="fb-btn" data-join="${r.id}" ${r.count >= MAX_PLAYERS ? 'disabled' : ''}>입장</button>
                </div>`).join('');
            list.querySelectorAll('[data-join]').forEach(btn => btn.addEventListener('click', () => joinRoom(btn.dataset.join)));
        }, (err) => {
            console.error('[플라피] 방 목록 오류', err);
            const list = $('fb-room-list');
            if (list) list.innerHTML = `<div class="fb-row">방 목록을 불러오지 못했어요.<br>Firestore 보안 규칙(omokRooms)을 확인해주세요.</div>`;
        });
    }

    async function createRoom() {
        if (busy) return;
        busy = true;
        try {
            // 내 예전 대기방 정리
            const old = await db.collection(ROOMS).where('hostUid', '==', myUid()).where('status', '==', ST_WAIT).get();
            for (const doc of old.docs) { try { await doc.ref.delete(); } catch (e) { } }

            const ref = db.collection(ROOMS).doc();
            await ref.set({
                game: 'flappy',
                status: ST_WAIT,
                hostUid: myUid(),
                hostName: myName(),
                guestUid: '',
                seed: Math.floor(Math.random() * 2147483647),
                startAtMs: 0,
                players: { [myUid()]: { name: myName(), score: 0, alive: true, ping: 0 } },
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            enterRoom(ref.id);
        } catch (e) {
            console.error(e);
            alert('방을 만들지 못했어요. (Firestore 보안 규칙/네트워크를 확인해주세요)');
        } finally { busy = false; }
    }

    async function joinRoom(id) {
        if (busy) return;
        busy = true;
        const uid = myUid();
        try {
            const ref = db.collection(ROOMS).doc(id);
            await db.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                if (!snap.exists) throw new Error('gone');
                const d = snap.data();
                const players = d.players || {};
                if (players[uid]) return;
                if (d.status !== ST_WAIT) throw new Error('started');
                if (Object.keys(players).length >= MAX_PLAYERS) throw new Error('full');
                const upd = { ['players.' + uid]: { name: myName(), score: 0, alive: true, ping: 0 } };
                if (!d.guestUid) upd.guestUid = uid;
                tx.update(ref, upd);
            });
            enterRoom(id);
        } catch (e) {
            if (e.message === 'gone') alert('방이 이미 사라졌어요.');
            else if (e.message === 'full') alert('방이 가득 찼어요.');
            else if (e.message === 'started') alert('이미 시작된 방이에요.');
            else { console.error(e); alert('입장하지 못했어요. 잠시 후 다시 시도해주세요.'); }
        } finally { busy = false; }
    }

    // ===== 온라인: 방 =====
    function enterRoom(id) {
        detachLobby();
        detachRoom();
        stopGame();
        roomId = id;
        mode = 'room';
        isOnline = true;
        startedRound = false;
        finished = false;
        lastRoom = null;
        setBackLabel();
        body.innerHTML = '<div class="fb-panel" style="width:100%;">방에 입장하는 중...</div>';

        roomUnsub = db.collection(ROOMS).doc(id).onSnapshot((snap) => {
            if (!snap.exists) {
                if (mode === 'room') { alert('방이 사라졌어요.'); detachRoom(); roomId = null; showLobby(); }
                else if (mode === 'game' && !finished) { finishOnline(null); }
                return;
            }
            lastRoom = snap.data({ serverTimestamps: 'estimate' });
            if (mode === 'room') {
                if (lastRoom.status === ST_PLAY && !startedRound) startOnlineRound();
                else renderWaitingRoom();
            } else if (mode === 'game') {
                renderBoard();
                evaluateRound();
            }
        }, (err) => {
            console.error('[플라피] 방 오류', err);
            alert('방 연결에 실패했어요.');
        });
    }

    function renderWaitingRoom() {
        if (mode !== 'room' || !lastRoom) return;
        const players = Object.entries(lastRoom.players || {});
        const isHost = lastRoom.hostUid === myUid();
        body.innerHTML = `
            <div class="fb-panel" style="width:100%;">
                <h3>🌐 대기실</h3>
                <p style="opacity:.8;">${isHost ? '2명 이상 모이면 시작할 수 있어요.' : '방장이 시작하길 기다리는 중...'}</p>
                <div class="fb-list">
                    ${players.map(([uid, p]) => `<div class="fb-row"><span>${uid === lastRoom.hostUid ? '👑 ' : ''}${esc(p.name)}${uid === myUid() ? ' (나)' : ''}</span></div>`).join('')}
                </div>
                <div class="fb-btns">
                    ${isHost ? `<button class="fb-btn" id="fb-start" ${players.length < 2 ? 'disabled' : ''}>게임 시작 (${players.length}/${MAX_PLAYERS})</button>` : ''}
                    <button class="fb-btn sub" id="fb-leave">방 나가기</button>
                </div>
            </div>`;
        const start = $('fb-start');
        if (start) start.addEventListener('click', hostStart);
        $('fb-leave').addEventListener('click', async () => { await leaveRoom(); showLobby(); });
    }

    async function hostStart() {
        try {
            await db.collection(ROOMS).doc(roomId).update({ status: ST_PLAY, startAtMs: Date.now() });
        } catch (e) { console.error(e); alert('시작하지 못했어요. 다시 시도해주세요.'); }
    }

    async function leaveRoom() {
        const id = roomId, wasMode = mode, wasFinished = finished;
        const myScore = state ? state.score : 0;
        if (wasMode === 'game' && !wasFinished && startedRound) applyCoinDelta(-LOSE_PENALTY);   // 도중에 나가면 패배 처리
        detachRoom();
        stopGame();
        roomId = null;
        if (!id) return;
        const ref = db.collection(ROOMS).doc(id);
        try {
            if (wasMode === 'room') {
                if (lastRoom && lastRoom.hostUid === myUid()) await ref.delete();
                else await ref.update({ ['players.' + myUid()]: firebase.firestore.FieldValue.delete() });
            } else if (wasMode === 'game') {
                if (!wasFinished) await ref.update({ ['players.' + myUid() + '.alive']: false, ['players.' + myUid() + '.score']: myScore, ['players.' + myUid() + '.diedAt']: firebase.firestore.FieldValue.serverTimestamp() });
                else if (lastRoom && lastRoom.hostUid === myUid()) await ref.delete();
            }
        } catch (e) { console.warn('[플라피] 방 나가기 처리 실패', e); }
    }

    // ===== 온라인: 라운드 =====
    function publish(fields) {
        if (!roomId) return;
        const upd = {};
        for (const k in fields) upd['players.' + myUid() + '.' + k] = fields[k];
        upd['players.' + myUid() + '.ping'] = Date.now();
        db.collection(ROOMS).doc(roomId).update(upd).catch(e => console.warn('[플라피] 동기화 실패', e));
    }

    function startOnlineRound() {
        startedRound = true;
        finished = false;
        myDiedAt = 0; declaring = false;
        mode = 'game';
        isOnline = true;
        setBackLabel();
        buildGameView();
        state = newState(mulberry32(lastRoom.seed || 1));
        phase = 'countdown';
        $('fb-board').style.display = 'block';
        renderBoard();

        let n = 3;
        const show = () => setMsg(`<div style="font-size:84px; font-weight:bold; text-shadow:0 2px 8px #000;">${n}</div>`);
        show();
        cdTimer = setInterval(() => {
            n -= 1;
            if (n > 0) { show(); return; }
            clearInterval(cdTimer); cdTimer = null;
            setMsg('');
            phase = 'playing';
            flap(state);
            publish({ alive: true, score: 0 });
            hbTimer = setInterval(() => publish({ score: state ? state.score : 0 }), 3000);
            endTimer = setInterval(evaluateRound, 2000);
        }, 1000);
    }

    // 코인 증감 (0 아래로는 안 내려감). 실제 증감량을 반환
    function applyCoinDelta(amount) {
        if (typeof userData === 'undefined') return 0;
        let d = amount;
        if (d < 0) d = -Math.min(-d, userData.coin || 0);
        userData.coin += d;
        sessionCoins += d;
        unsaved = true;
        if (typeof updateTopMoney === 'function') updateTopMoney();
        updateCoinLabel();
        saveCoins();
        return d;
    }

    function playerFinished(p) {
        if (!p.alive) return true;
        const ref = p.ping || (lastRoom && lastRoom.startAtMs) || 0;
        return ref > 0 && (Date.now() - ref) > STALE_MS;
    }

    function tsMs(t) { return t && t.toMillis ? t.toMillis() : 0; }

    let myDiedAt = 0, declaring = false;

    function standings() {
        const list = Object.entries((lastRoom && lastRoom.players) || {}).map(([uid, p]) => {
            const me = uid === myUid();
            return {
                uid, name: p.name,
                score: me && state ? Math.max(state.score, p.score || 0) : (p.score || 0),
                finished: me ? (phase === 'over' || phase === 'done') : playerFinished(p),
                diedMs: me ? (myDiedAt || tsMs(p.diedAt)) : (tsMs(p.diedAt) || (lastRoom.startAtMs || 0))
            };
        });
        list.sort((a, b) => b.score - a.score);
        return list;
    }

    function renderBoard() {
        const el = $('fb-board');
        if (!el || mode !== 'game') return;
        el.innerHTML = standings().map(p =>
            `<div style="${p.uid === myUid() ? 'color:#ffd54f;' : ''}">${p.finished ? '<i class="fa-solid fa-skull"></i>' : '<i class="fa-solid fa-dove"></i>'} ${esc(p.name)} <b>${p.score}</b></div>`).join('');
    }

    function onlineDied() {
        phase = 'over';
        myDiedAt = Date.now();
        if (window.Quests) { window.Quests.track('play'); window.Quests.track('flappyPillars', state.score); }
        recordScore(state.score);
        saveCoins();
        publish({ alive: false, score: state.score, diedAt: firebase.firestore.FieldValue.serverTimestamp() });
        renderBoard();
        setMsg(`
            <div class="fb-panel">
                <h3>💥 탈락!</h3>
                <p>내 점수: <b>${state.score}개</b> (+${state.coins}원)</p>
                <p style="opacity:.8;">상대가 끝나길 기다리는 중...<br>(상대가 더 오래 살아남고 ${MIN_SCORE_FOR_BONUS}개 이상 통과하면 -${LOSE_PENALTY}원)</p>
                <div class="fb-btns"><button class="fb-btn sub" id="fb-leave2">나가기</button></div>
            </div>`);
        $('fb-leave2').addEventListener('click', async (e) => { e.stopPropagation(); await leaveRoom(); showLobby(); });
        evaluateRound();
    }

    // 라운드 종료 판정: 살아있는 사람이 1명 이하가 되면 승패 결정
    function evaluateRound() {
        if (mode !== 'game' || finished || !lastRoom) return;
        if (lastRoom.status === ST_DONE) { finishOnline(lastRoom.winnerUid || ''); return; }
        if (phase !== 'playing' && phase !== 'over') return;     // 카운트다운 중에는 판정 안 함
        const all = standings();
        const alive = all.filter(p => !p.finished);
        if (alive.length > 1) return;
        let winner = '';
        if (alive.length === 1) {
            winner = alive[0].uid;                                // 마지막 생존자
        } else {                                                  // 거의 동시에 죽은 경우: 더 늦게 죽은 사람, 같으면 점수
            const byDeath = [...all].sort((a, b) => (b.diedMs - a.diedMs) || (b.score - a.score));
            const [x, y] = byDeath;
            winner = (y && x.diedMs === y.diedMs && x.score === y.score) ? '' : x.uid;
        }
        const wEntry = all.find(p => p.uid === winner);
        declareWinner(winner, wEntry ? wEntry.score : 0);
    }

    async function declareWinner(winnerUid, winnerScore) {
        if (declaring || !roomId) return;
        declaring = true;
        const ref = db.collection(ROOMS).doc(roomId);
        try {
            await db.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                if (!snap.exists || snap.data().status === ST_DONE) return;   // 이미 누가 결정함
                tx.update(ref, { status: ST_DONE, winnerUid, winnerScore: winnerScore || 0 });
            });
        } catch (e) { console.warn('[플라피] 승패 확정 실패', e); }
        declaring = false;
    }

    // winnerUid: uid(승자) / ''(무승부) / null(방 사라짐, 정산 없음)
    async function finishOnline(winnerUid) {
        if (finished) return;
        finished = true;
        const wasAlive = (phase === 'playing');   // 끝까지 살아남은 승자는 여기서 집계
        phase = 'done';
        clearInterval(hbTimer); clearInterval(endTimer);
        const all = standings();
        const me = myUid();
        const wEntry = all.find(p => p.uid === winnerUid);
        const ws = (lastRoom && typeof lastRoom.winnerScore === 'number') ? lastRoom.winnerScore : (wEntry ? wEntry.score : 0);
        const eligible = !!winnerUid && ws >= MIN_SCORE_FOR_BONUS;   // 승자가 기둥 3개 이상 통과해야 정산
        const lowMsg = `승자가 기둥 ${MIN_SCORE_FOR_BONUS}개 이상 통과해야 정산돼요. (승자 ${ws}개) 이번 판은 정산 없음`;
        let delta = 0, title, note, bonusOk = false;
        if (winnerUid === null) { title = '게임 종료'; note = '방이 사라져서 정산 없이 끝났어요.'; }
        else if (winnerUid === '') { title = '🤝 무승부'; note = '정산 없음'; }
        else if (winnerUid === me) {
            title = '🏆 승리!';
            if (window.Quests && eligible) { window.Quests.track('win'); window.Quests.track('flappyOnlineWin'); }
            if (eligible) { bonusOk = true; delta = applyCoinDelta(WIN_BONUS); note = `상대보다 오래 살아남았어요! <b>+${delta}원</b>`; }
            else note = lowMsg;
        } else {
            title = '😵 패배';
            if (eligible) { delta = applyCoinDelta(-LOSE_PENALTY); note = `<b>${delta}원</b>`; }
            else note = lowMsg;
        }

        if (wasAlive && state && window.Quests) { window.Quests.track('play'); window.Quests.track('flappyPillars', state.score); }

        const rows = all.map(p => `
            <div class="fb-row" ${p.uid === me ? 'style="outline:2px solid #ffd54f;"' : ''}>
                <span>${p.uid === winnerUid ? '<i class="fa-solid fa-crown" style="color:#ffd54f;"></i>' : (p.finished ? '<i class="fa-solid fa-skull"></i>' : '<i class="fa-solid fa-dove"></i>')} ${esc(p.name)}</span><b>${p.score}개</b>
            </div>`).join('');
        setMsg(`
            <div class="fb-panel">
                <h3>${title}</h3>
                <div class="fb-list">${rows}</div>
                <p style="margin-top:8px;">${note}</p>
                <p style="opacity:.85;">통과 코인: +${state ? state.coins : 0}원</p>
                <div class="fb-btns"><button class="fb-btn" id="fb-lobby">로비로</button></div>
            </div>`);
        $('fb-lobby').addEventListener('click', async (e) => { e.stopPropagation(); await leaveRoom(); showLobby(); });

        if (winnerUid && winnerUid === me && bonusOk && logged()) {
            try { await db.collection('users').doc(me).set({ flappyWins: firebase.firestore.FieldValue.increment(1) }, { merge: true }); }
            catch (e) { console.warn('[플라피] 승리 기록 실패', e); }
        }
    }

    // ===== 열기 / 닫기 =====
    function open() {
        if (overlay) return;
        if (window.GameBGM) GameBGM.prime();   // 모바일 오디오 잠금 해제 (카드 클릭 직후에 호출됨)
        loadLocalBest();
        sessionCoins = 0;
        unsaved = false;
        build();
        updateCoinLabel();
        showMenu();
        loadMyStats().then(() => { if (mode === 'menu' && overlay) showMenu(); });
    }

    function close() {
        leaveRoom();
        detachLobby();
        stopGame();
        document.removeEventListener('keydown', onKey);
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = body = canvas = ctx = null;
        mode = 'menu';
    }

    window.FlappyUI = { open, close, _test: { newState, step, flap, mulberry32, constants: { W, H, GAP, BIRD_X, GROUND_H, PILLAR_W, SPEED, SPEED_PER_SCORE, SPEED_MAX_BONUS } } };
})();
