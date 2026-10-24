// ===== tetris.js =====
// 테트리스: 솔로 / 온라인 대결(일반·랭크, 1:1, 같은 블록 순서 + 가비지 공격) / 랭킹 / 퀘스트 연동
// 열기: TetrisUI.open()
//
// [Firestore]
//  - 온라인 방: 오목/틱택토/플라피와 같은 'omokRooms' 컬렉션 (game: 'tetris', status: ttrWaiting/ttrPlaying/ttrDone)
//  - 최고 점수: users/{uid}.tetrisBest
//  - 랭크 전적: users/{uid}.gameStats.tetrisWins / tetrisLosses / totalGamePoint (오목·틱택토와 같은 랭크 포인트 공유 → 아이언~챌린저 등급)
//
// [퀘스트] Quests.track: play · win · tetrisLines(줄 수) · tetrisOnlineWin

(function () {
    // ===== 설정 =====
    const COLS = 10, ROWS = 20, HID = 2, TOT = ROWS + HID;   // 위쪽 2줄은 화면에 안 보이는 스폰 영역
    const CELL = 24;
    const BW = COLS * CELL, BH = ROWS * CELL;                 // 보드 240 x 480
    const SIDE = 96;
    const CW = BW + SIDE, CH = BH;                            // 캔버스 내부 좌표 336 x 480

    const ROOMS = 'omokRooms';
    const ST_WAIT = 'ttrWaiting', ST_PLAY = 'ttrPlaying', ST_DONE = 'ttrDone';
    const MAX_PLAYERS = 2;
    const ROOM_TTL_MS = 10 * 60 * 1000;
    const STALE_MS = 20000;                 // 이 시간 동안 신호가 없으면 접속 끊긴 것으로 처리

    const WIN_BONUS = 2500;                 // 일반 대결 승리 코인
    const LOSE_PENALTY = 800;               // 일반 대결 패배 코인 차감
    const RANKED_WIN_COIN = 1500;           // 랭크 대결 승리 시 추가 코인 (랭크 포인트는 별도, 패배 시 코인 차감 없음)
    const MIN_LINES_FOR_BONUS = 4;          // 승자가 이 줄 수 이상 지워야 정산 (바로 나가기/어뷰징 방지)
    const COIN_BY_LINES = [0, 10, 30, 60, 120]; // 솔로: 한 번에 지운 줄 수별 코인
    const TSPIN_COIN = 20;                  // 솔로: T-스핀 줄 클리어 추가 코인(줄당)
    const PC_COIN = 500;                    // 솔로: 올클리어 추가 코인
    const LEVEL_COIN_BONUS = 0.15;          // 솔로: 레벨이 1 오를 때마다 코인 +15%
    const SOLO_LINES_PER_LEVEL = 8;         // 솔로: 이 줄 수마다 레벨업
    const SOLO_MAX_LEVEL = 20;

    const LOCK_MS = 500, MAX_RESETS = 15;   // 바닥 닿은 뒤 고정 대기시간 / 대기시간 리셋 최대 횟수
    const COMBO_ATK = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];

    // ===== 블록 정의 (SRS) =====
    const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
    const BASE = {
        I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
        O: [[1, 1], [1, 1]],
        T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
        S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
        Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
        J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
        L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]]
    };
    function rotCW(m) {
        const n = m.length, r = [];
        for (let i = 0; i < n; i++) { r.push([]); for (let j = 0; j < n; j++) r[i][j] = m[n - 1 - j][i]; }
        return r;
    }
    const ROT = {};
    TYPES.forEach(t => { const a = [BASE[t]]; for (let i = 1; i < 4; i++) a.push(rotCW(a[i - 1])); ROT[t] = a; });

    // 월킥 (x 오른쪽 +, y 위쪽 +  → 적용할 때 y를 뒤집음)
    const KICK_JLSTZ = {
        '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
        '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
        '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
        '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
        '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
        '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
        '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
        '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]
    };
    const KICK_I = {
        '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
        '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
        '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
        '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
        '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
        '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
        '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
        '03': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]
    };

    const COLORS = ['', '#22d3ee', '#facc15', '#a855f7', '#4ade80', '#f87171', '#60a5fa', '#fb923c', '#8b95a7'];

    // ===== 보석 블록 스프라이트 (한 번 그려서 캐시) =====
    let DPR = 1;
    const spriteCache = {};
    function shade(hex, t) {                       // t>0: 흰색 쪽으로, t<0: 검정 쪽으로
        const n = parseInt(hex.slice(1), 16);
        let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
        const to = t >= 0 ? 255 : 0, k = Math.abs(t);
        r = Math.round(r + (to - r) * k); g = Math.round(g + (to - g) * k); b = Math.round(b + (to - b) * k);
        return `rgb(${r},${g},${b})`;
    }
    function makeSprite(idx, sz) {
        const px = Math.max(1, Math.round(sz * DPR));
        const cv = document.createElement('canvas');
        cv.width = cv.height = px;
        const g = cv.getContext('2d');
        g.scale(px / sz, px / sz);
        const base = COLORS[idx];
        const b = Math.max(2, Math.round(sz * 0.2));       // 면(facet) 두께
        const m = 0.6, X0 = m, Y0 = m, X1 = sz - m, Y1 = sz - m;
        const poly = (pts, fill) => {
            g.beginPath(); g.moveTo(pts[0], pts[1]);
            for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
            g.closePath(); g.fillStyle = fill; g.fill();
        };
        g.fillStyle = shade(base, -0.65); g.fillRect(0, 0, sz, sz);                                   // 어두운 테두리
        poly([X0, Y0, X1, Y0, X1 - b, Y0 + b, X0 + b, Y0 + b], shade(base, 0.62));                    // 위 면 (가장 밝음)
        poly([X0, Y0, X0 + b, Y0 + b, X0 + b, Y1 - b, X0, Y1], shade(base, 0.3));                     // 왼쪽 면
        poly([X1, Y0, X1, Y1, X1 - b, Y1 - b, X1 - b, Y0 + b], shade(base, -0.38));                   // 오른쪽 면
        poly([X0, Y1, X1, Y1, X1 - b, Y1 - b, X0 + b, Y1 - b], shade(base, -0.58));                   // 아래 면 (가장 어두움)
        const ti = sz - 2 * m - 2 * b;                                                                // 가운데 면(테이블)
        const gr = g.createLinearGradient(X0 + b, Y0 + b, X1 - b, Y1 - b);
        gr.addColorStop(0, shade(base, 0.4)); gr.addColorStop(0.5, base); gr.addColorStop(1, shade(base, -0.32));
        g.fillStyle = gr; g.fillRect(X0 + b, Y0 + b, ti, ti);
        g.beginPath();                                                                                // 유리 광택(왼쪽 위 삼각형)
        g.moveTo(X0 + b, Y0 + b); g.lineTo(X0 + b + ti * 0.9, Y0 + b); g.lineTo(X0 + b, Y0 + b + ti * 0.9);
        g.closePath(); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fill();
        if (sz >= 12) {                                                                               // 반짝이는 점
            g.fillStyle = 'rgba(255,255,255,0.95)';
            g.beginPath(); g.arc(X0 + b + 2.4, Y0 + b + 2.4, 1.7, 0, Math.PI * 2); g.fill();
            g.fillStyle = 'rgba(255,255,255,0.4)';
            g.fillRect(X1 - b - 6, Y1 - b - 3.2, 4, 1.4);
            g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 0.8; g.strokeRect(0.4, 0.4, sz - 0.8, sz - 0.8);
        }
        return cv;
    }
    function spriteFor(idx, sz) {
        sz = Math.max(3, Math.round(sz));
        const key = idx + '_' + sz + '_' + DPR;
        return spriteCache[key] || (spriteCache[key] = makeSprite(idx, sz));
    }

    // ===== 시드 난수 (온라인에서 모두 같은 블록 순서) =====
    function mulberry32(a) {
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // ===== 게임 로직 (화면과 분리) =====
    // 솔로는 더 빠르게 시작해서 더 빨리 빨라짐 (대결은 기존 속도 유지)
    function gravMs(level, pvp) {
        return pvp ? Math.max(50, 900 * Math.pow(0.84, level - 1))
                   : Math.max(30, 750 * Math.pow(0.78, level - 1));
    }

    function newGame(seed, pvp) {
        const s = {
            board: Array.from({ length: TOT }, () => new Array(COLS).fill(0)),
            rng: mulberry32(seed), seed,
            queue: [], hold: null, canHold: true, cur: null,
            score: 0, lines: 0, level: 1, combo: -1, b2b: false,
            alive: true, gravAcc: 0, lockAcc: 0, resets: 0, lastRot: false,
            coins: 0, pieces: 0, elapsed: 0, pvp: !!pvp,
            sent: 0, garbageApplied: 0, garbageCancelled: 0,
            tspins: 0, maxCombo: 0, pops: [], parts: [], shake: null, flash: null, clearAnim: null
        };
        spawn(s);
        return s;
    }

    function refill(s) {
        while (s.queue.length < 7) {
            const bag = TYPES.slice();
            for (let i = 6; i > 0; i--) { const j = Math.floor(s.rng() * (i + 1)); const t = bag[i]; bag[i] = bag[j]; bag[j] = t; }
            for (const t of bag) s.queue.push(t);
        }
    }

    function collide(board, t, r, x, y) {
        const m = ROT[t][r];
        for (let i = 0; i < m.length; i++) for (let j = 0; j < m.length; j++) {
            if (!m[i][j]) continue;
            const bx = x + j, by = y + i;
            if (bx < 0 || bx >= COLS || by >= TOT) return true;
            if (by >= 0 && board[by][bx]) return true;
        }
        return false;
    }

    function spawn(s, type) {
        refill(s);
        const t = type || s.queue.shift();
        refill(s);
        s.cur = { t, r: 0, x: t === 'O' ? 4 : 3, y: 1 };
        s.gravAcc = 0; s.lockAcc = 0; s.resets = 0; s.lastRot = false;
        if (collide(s.board, t, 0, s.cur.x, s.cur.y)) s.alive = false;
    }

    function onGround(s) { const c = s.cur; return collide(s.board, c.t, c.r, c.x, c.y + 1); }

    function touchLock(s) {
        if (onGround(s) && s.resets < MAX_RESETS) { s.lockAcc = 0; s.resets++; }
    }

    function tryMove(s, dx, dy) {
        const c = s.cur;
        if (collide(s.board, c.t, c.r, c.x + dx, c.y + dy)) return false;
        c.x += dx; c.y += dy;
        return true;
    }

    function moveH(s, dx) {
        if (!s.alive || s.clearAnim) return false;
        if (tryMove(s, dx, 0)) { s.lastRot = false; touchLock(s); return true; }
        return false;
    }

    function rotate(s, dir) {
        if (!s.alive || s.clearAnim) return false;
        const c = s.cur;
        if (c.t === 'O') return false;
        const to = (c.r + (dir > 0 ? 1 : 3)) % 4;
        const kicks = (c.t === 'I' ? KICK_I : KICK_JLSTZ)['' + c.r + to];
        for (const [kx, ky] of kicks) {
            const nx = c.x + kx, ny = c.y - ky;
            if (!collide(s.board, c.t, to, nx, ny)) {
                c.r = to; c.x = nx; c.y = ny;
                s.lastRot = true;
                touchLock(s);
                try { if (window.GameBGM && GameBGM.sfx) GameBGM.sfx('rotate'); } catch (e) { }   // 방향 바꿀 때 휙!
                return true;
            }
        }
        return false;
    }

    function holdPiece(s) {
        if (!s.alive || s.clearAnim || !s.canHold) return false;
        const t = s.cur.t, prev = s.hold;
        s.hold = t;
        s.canHold = false;
        spawn(s, prev);
        return true;
    }

    function ghostY(s) {
        const c = s.cur;
        let y = c.y;
        while (!collide(s.board, c.t, c.r, c.x, y + 1)) y++;
        return y;
    }

    // 화면 흔들림 효과는 제거됨 (호출부는 그대로 두고 아무 것도 하지 않음)
    function addShake() { }

    // 줄 지움 연출: 번쩍 → 빛줄기가 옆으로 훑고 지나가며 블록이 가속해서 옆으로 "싹" 쓸려나감
    //   (위에서부터 번갈아 좌→우 / 우→좌)
    function clearDir(i) { return i % 2 === 0 ? 1 : -1; }
    function clearStart(x, dir) {                      // 빛줄기가 해당 칸에 닿는 시점 (0~1)
        const order = dir > 0 ? x : COLS - 1 - x;
        return 0.22 + (order / (COLS - 1)) * 0.28;
    }

    function spawnClearFx(s, n, tspin) {
        const ca = s.clearAnim;
        if (!ca) return;
        const per = n >= 3 ? 4 : 3;
        ca.rows.forEach((row, i) => {
            if (row.r < 0) return;
            const dir = clearDir(i);
            for (let x = 0; x < COLS; x++) {
                const v = row.cells[x];
                if (!v) continue;
                const delay = clearStart(x, dir) * ca.dur;
                const cx = x * CELL + CELL / 2, cy = row.r * CELL + CELL / 2;
                for (let k = 0; k < per; k++) {
                    const star = Math.random() < 0.22;
                    const life = 22 + Math.random() * 18;
                    s.parts.push({
                        x: cx, y: cy, vx: dir * (3.5 + Math.random() * 6.5), vy: (Math.random() - 0.5) * 2.2 - 0.4,
                        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.5,
                        size: star ? 5 + Math.random() * 5 : 4 + Math.random() * 5,
                        life, max: life, color: v, star, delay
                    });
                }
            }
        });
        addShake(s, n === 4 ? 5 : tspin ? 4 : n === 3 ? 3 : n === 2 ? 2 : 1.2, n === 4 ? 22 : 14);
        const fl = n === 4 ? 16 : (n >= 3 ? 10 : 6);
        s.flash = { life: fl, max: fl, a: n === 4 ? 0.55 : (n >= 3 ? 0.35 : 0.2) };
    }

    // 연출이 끝나면 실제로 줄을 지움
    function finishClear(s) {
        if (!s.clearAnim) return;
        const full = s.clearAnim.rowsY;
        s.board = s.board.filter((_, y) => full.indexOf(y) < 0);
        while (s.board.length < TOT) s.board.unshift(new Array(COLS).fill(0));
        s.clearAnim = null;
    }

    // 현재 블록을 보드에 고정하고 줄 지우기/점수 계산. 결과 반환 (다음 블록 소환은 호출한 쪽에서)
    function lockPiece(s) {
        const c = s.cur, m = ROT[c.t][c.r];
        let tspin = false;
        if (c.t === 'T' && s.lastRot) {                   // 3코너 규칙
            let n = 0;
            for (const [cx, cy] of [[0, 0], [2, 0], [0, 2], [2, 2]]) {
                const bx = c.x + cx, by = c.y + cy;
                if (bx < 0 || bx >= COLS || by >= TOT || (by >= 0 && s.board[by][bx])) n++;
            }
            tspin = n >= 3;
        }
        const idx = TYPES.indexOf(c.t) + 1;
        let allHidden = true;
        for (let i = 0; i < m.length; i++) for (let j = 0; j < m.length; j++) {
            if (!m[i][j]) continue;
            const by = c.y + i, bx = c.x + j;
            if (by >= 0 && by < TOT) s.board[by][bx] = idx;
            if (by >= HID) allHidden = false;
        }
        s.pieces++;

        const full = [];
        for (let y = 0; y < TOT; y++) if (s.board[y].every(v => v)) full.push(y);
        const n = full.length;
        // 줄을 못 지웠으면 '찰칵', 지웠으면 1~4줄에 따라 다른 경쾌한 소리
        try { if (window.GameBGM && GameBGM.sfx) GameBGM.sfx(n > 0 ? 'clear' : 'lock', n); } catch (e) { }
        if (n) {          // 바로 지우지 않고, 지워질 줄을 기억해두고 연출 후에 삭제
            s.clearAnim = {
                rowsY: full,
                rows: full.map(y => ({ r: y - HID, cells: s.board[y].slice() })),
                t: 0, dur: 300 + 40 * n
            };
        }

        let atk = 0, pts = 0, pc = false;
        const label = [];
        if (n > 0) {
            s.combo++;
            if (s.combo > s.maxCombo) s.maxCombo = s.combo;
            const hard = n === 4 || tspin;
            let add = (tspin ? [0, 800, 1200, 1600][n] : [0, 100, 300, 500, 800][n]) * s.level;
            atk = tspin ? [0, 2, 4, 6][n] : [0, 0, 1, 2, 4][n];
            if (hard && s.b2b) { add = Math.floor(add * 1.5); atk += 1; label.push('B2B'); }
            add += 50 * s.combo * s.level;
            atk += COMBO_ATK[Math.min(s.combo, COMBO_ATK.length - 1)];
            s.b2b = hard;
            if (tspin) { s.tspins++; label.unshift('T-SPIN ' + ['', 'SINGLE', 'DOUBLE', 'TRIPLE'][n]); }
            else if (n === 4) label.unshift('TETRIS!');
            else label.unshift(['', 'SINGLE', 'DOUBLE', 'TRIPLE'][n]);
            if (s.combo >= 1) label.push(s.combo + ' COMBO');
            const rest = s.board.filter((_, y) => full.indexOf(y) < 0);
            if (rest.every(row => row.every(v => !v))) { pc = true; atk += 6; add += 1000 * s.level; label.push('ALL CLEAR'); }
            pts += add;
            s.lines += n;
            if (!s.pvp) {
                const mult = 1 + LEVEL_COIN_BONUS * (s.level - 1);          // 레벨이 높을수록 코인 보너스
                s.coins += Math.round((COIN_BY_LINES[n] + (tspin ? TSPIN_COIN * n : 0) + (pc ? PC_COIN : 0)) * mult);
                s.level = Math.min(SOLO_MAX_LEVEL, 1 + Math.floor(s.lines / SOLO_LINES_PER_LEVEL));
            }
        } else {
            s.combo = -1;
            if (tspin) { pts += 400 * s.level; s.tspins++; label.push('T-SPIN'); }
        }
        s.score += pts;
        if (n > 0) spawnClearFx(s, n, tspin);
        if (label.length) s.pops.push({ text: label.join(' · '), life: 80, big: n === 4 || (tspin && n > 0) });
        if (allHidden) s.alive = false;
        return { n, tspin, atk, pc, pts };
    }

    // ===== 상태 =====
    let overlay = null, body = null, canvas = null, ctx = null;
    let mode = 'menu';          // menu | solo | lobby | room | game | ranking
    let state = null, phase = 'ready';    // ready | countdown | playing | paused | over | done
    let raf = 0, lastTs = 0;
    let sessionCoins = 0, unsaved = false;
    let best = 0, isOnline = false, softHeld = false;
    let stoppers = [];

    let roomId = null, roomUnsub = null, lobbyUnsub = null, hbTimer = null, endTimer = null, cdTimer = null, pubTimer = null;
    let lastRoom = null, startedRound = false, finished = false, busy = false, settled = false, questsDone = false;
    let myDiedAt = 0, declaring = false, lastPub = 0, dirtyPub = false;

    // ===== 유틸 =====
    const $ = (id) => overlay && overlay.querySelector('#' + id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const logged = () => (typeof currentUser !== 'undefined' && currentUser);
    const myUid = () => (logged() ? currentUser.uid : null);
    const myName = () => (typeof userData !== 'undefined' && userData.name) ? userData.name : '플레이어';
    const tsMs = (t) => (t && t.toMillis ? t.toMillis() : 0);

    function loadLocalBest() {
        try { best = parseInt(localStorage.getItem('tetrisBest') || '0', 10) || 0; } catch (e) { best = 0; }
    }
    function saveLocalBest() { try { localStorage.setItem('tetrisBest', String(best)); } catch (e) { } }

    async function loadMyStats() {
        if (!logged()) return;
        try {
            const snap = await db.collection('users').doc(currentUser.uid).get();
            const d = snap.exists ? snap.data() : {};
            if ((d.tetrisBest || 0) > best) { best = d.tetrisBest; saveLocalBest(); }
            else if (best > (d.tetrisBest || 0)) submitBest(best);
        } catch (e) { console.warn('[테트리스] 기록 불러오기 실패', e); }
    }
    async function submitBest(score) {
        if (!logged()) return;
        try { await db.collection('users').doc(currentUser.uid).set({ tetrisBest: score }, { merge: true }); }
        catch (e) { console.warn('[테트리스] 최고 기록 저장 실패', e); }
    }
    function recordScore(score) {
        if (score > best) { best = score; saveLocalBest(); submitBest(best); }
    }

    function saveCoins() {
        if (!unsaved) return;
        unsaved = false;
        try { if (typeof saveUserDataToFirestore === 'function') saveUserDataToFirestore(); }
        catch (e) { console.warn('[테트리스] 코인 저장 실패', e); }
    }

    // 코인 증감 (0 아래로는 안 내려감). 실제 증감량 반환
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

    // 랭크 전적 + 랭크 포인트 (오목/틱택토와 같은 totalGamePoint 사용)
    async function recordRank(isWin) {
        if (!logged() || typeof userData === 'undefined') return false;
        // 오목/틱택토와 같은 공용 함수 사용 (서버 값을 기준으로 트랜잭션 반영)
        if (typeof recordGameResult !== 'function') return false;
        try { return !!(await recordGameResult('tetris', !!isWin)); }
        catch (e) { console.warn('[테트리스] 랭크 기록 실패', e); return false; }
    }

    // ===== 메인 랭크(아이언~챌린저) 연동 도우미 =====
    function pointsNow() { return (typeof userData !== 'undefined' && userData.gameStats && userData.gameStats.totalGamePoint) || 0; }
    function tierOf(pt) { try { return typeof calculateTier === 'function' ? calculateTier(pt) : null; } catch (e) { return null; } }
    function tierBadge(t, size) {
        if (!t) return '';
        const icon = (typeof getTierIconHTML === 'function') ? getTierIconHTML(t.key, size || 20) : (t.emoji || '');
        return `${icon} ${t.tier}`;
    }
    function tierNote(before, after) {
        if (!after) return '';
        let tag = '';
        if (before && before.key !== after.key) tag = after.minPoint > before.minPoint ? ' 🎉 승급!' : ' 😢 강등';
        return `<br><span style="display:inline-block; margin-top:4px;">${tierBadge(after, 22)} · <b>${pointsNow().toLocaleString()}P</b>${tag}</span>`;
    }

    function reportQuests(win) {
        if (questsDone || !window.Quests || !state) return;
        questsDone = true;
        window.Quests.track('play');
        if (state.lines > 0) window.Quests.track('tetrisLines', state.lines);
        if (win) { window.Quests.track('win'); window.Quests.track('tetrisOnlineWin'); }
    }

    // ===== 스타일 / 뼈대 =====
    function injectStyle() {
        if (document.getElementById('tetris-style')) return;
        const st = document.createElement('style');
        st.id = 'tetris-style';
        st.textContent = `
        .tt-overlay { position: fixed; inset: 0; z-index: 3000; background: rgba(0,0,0,0.9); display: flex; flex-direction: column; align-items: center; padding: 8px; box-sizing: border-box; color: #fff; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
        .tt-top { width: min(100%, 420px); display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 14px; font-weight: bold; flex: 0 0 auto; }
        .tt-btn-top { background: rgba(255,255,255,0.15); color: #fff; border: none; border-radius: 8px; padding: 6px 12px; font-size: 14px; cursor: pointer; }
        .tt-body { flex: 1 1 auto; width: min(100%, 420px); min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; overflow-y: auto; }
        .tt-wrap { position: relative; width: 100%; max-width: 336px; max-width: min(336px, calc((100vh - 255px) * 0.7)); aspect-ratio: ${CW} / ${CH}; flex: 0 0 auto; }
        .tt-canvas { width: 100%; height: 100%; border-radius: 10px; touch-action: none; display: block; background: #0b1026; }
        .tt-msg { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; pointer-events: none; }
        .tt-panel { background: rgba(10,14,35,0.93); border: 1px solid rgba(255,255,255,0.2); border-radius: 14px; padding: 16px 20px; pointer-events: auto; min-width: 200px; max-width: 94%; box-sizing: border-box; }
        .tt-panel h3 { margin: 0 0 8px; font-size: 20px; }
        .tt-panel p { margin: 4px 0; font-size: 14px; }
        .tt-btns { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
        .tt-btn { flex: 1; min-width: 90px; padding: 11px; border: none; border-radius: 8px; font-weight: bold; font-size: 14px; cursor: pointer; color: #fff; background: var(--accent-color, #6c63ff); }
        .tt-btn.sub { background: rgba(255,255,255,0.18); }
        .tt-btn.red { background: #e11d48; }
        .tt-btn:disabled { opacity: 0.45; cursor: default; }
        .tt-menu { width: 100%; display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
        .tt-menu .tt-btn { padding: 15px; font-size: 16px; }
        .tt-list { width: 100%; display: flex; flex-direction: column; gap: 6px; margin-top: 8px; text-align: left; }
        .tt-row { display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.08); border-radius: 8px; padding: 9px 12px; font-size: 14px; gap: 8px; }
        .tt-row .tt-btn { flex: 0 0 auto; min-width: 0; padding: 6px 12px; }
        .tt-tabs { display: flex; gap: 6px; width: 100%; }
        .tt-tabs .tt-btn { padding: 8px; }
        .tt-tabs .tt-btn.off { background: rgba(255,255,255,0.12); }
        .tt-ctrl { width: 100%; max-width: 336px; display: flex; justify-content: space-between; gap: 14px; margin-top: 10px; flex: 0 0 auto; }
        .tt-pad { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
        .tt-pad .wide { grid-column: 1 / 3; }
        .tt-ctrl button { height: 54px; border: none; border-radius: 12px; background: rgba(255,255,255,0.16); color: #fff; font-size: 22px; font-weight: bold; touch-action: none; cursor: pointer; }
        .tt-ctrl button:active { background: rgba(255,255,255,0.35); }
        .tt-ctrl .acc { background: var(--accent-color, #6c63ff); }
        .tt-ctrl .small { font-size: 13px; }
        .tt-pause { position: absolute; right: 6px; bottom: 6px; background: rgba(255,255,255,0.18); color: #fff; border: none; border-radius: 8px; padding: 6px 8px; font-size: 11px; font-weight: bold; cursor: pointer; }
        .tt-tag { color: var(--accent-color, #a78bfa); font-weight: bold; margin-left: 6px; }
        `;
        document.head.appendChild(st);
    }

    function build() {
        injectStyle();
        overlay = document.createElement('div');
        overlay.className = 'tt-overlay';
        overlay.innerHTML = `
            <div class="tt-top">
                <span><i class="fa-solid fa-cubes" style="color:#a855f7;"></i> 테트리스</span>
                <span><button class="tt-btn-top" id="tt-bgm" title="배경음악">🔊</button> &nbsp; 🪙 <span id="tt-coins">0</span>원 &nbsp; <button class="tt-btn-top" id="tt-back">닫기</button></span>
            </div>
            <div class="tt-body" id="tt-body"></div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('contextmenu', (e) => e.preventDefault());   // 모바일 길게 누르기 메뉴 방지
        body = $('tt-body');
        $('tt-back').addEventListener('click', onBack);
        if (window.GameBGM) GameBGM.bindButton($('tt-bgm')); else { const b = $('tt-bgm'); if (b) b.style.display = 'none'; }
        document.addEventListener('keydown', onKey);
        document.addEventListener('keyup', onKeyUp);
    }

    function setBackLabel() { const b = $('tt-back'); if (b) b.textContent = (mode === 'menu') ? '닫기' : '뒤로'; }
    function updateCoinLabel() { const el = $('tt-coins'); if (el) el.textContent = sessionCoins.toLocaleString(); }
    function setMsg(html) { const m = $('tt-msg'); if (m) m.innerHTML = html; }

    // ===== 화면 이동 =====
    async function onBack() {
        if (mode === 'menu') { close(); return; }
        if (mode === 'room' || mode === 'game') { await leaveRoom(); showLobby(); }
        else if (mode === 'lobby' || mode === 'ranking' || mode === 'solo') showMenu();
    }

    function rankLine() {
        if (typeof userData === 'undefined') return '';
        const pt = pointsNow(), t = tierOf(pt);
        if (!t) return '';
        return `<div style="font-size:13px; opacity:.9; margin-top:6px;">${tierBadge(t, 24)} · ${pt.toLocaleString()}P</div>`;
    }

    function showMenu() {
        stopGame();
        detachLobby();
        mode = 'menu';
        setBackLabel();
        body.innerHTML = `
            <div class="tt-menu">
                <div style="text-align:center; margin-bottom:6px;">
                    <div style="width:72px; height:72px; margin:0 auto 8px; border-radius:22px; display:flex; align-items:center; justify-content:center; font-size:32px; color:#fff; background:linear-gradient(135deg,#a855f7,#6d28d9); box-shadow:0 6px 16px rgba(0,0,0,0.4);"><i class="fa-solid fa-cubes"></i></div>
                    <div style="font-size:13px; opacity:.8;">줄을 지울 때마다 코인! (1줄 10 · 2줄 30 · 3줄 60 · 4줄 120)<br>레벨이 오를수록 코인 보너스 +15%씩!</div>
                    <div style="font-size:13px; opacity:.8; margin-top:4px;">🏆 내 최고 점수: ${best.toLocaleString()}</div>
                    ${rankLine()}
                </div>
                <button class="tt-btn" id="tt-solo">🎮 솔로 플레이</button>
                <button class="tt-btn" id="tt-online">⚔️ 온라인 대결 (일반 / 랭크)</button>
                <button class="tt-btn sub" id="tt-rank">🏆 랭킹</button>
                <button class="tt-btn sub" id="tt-help">❓ 조작법 / 규칙</button>
            </div>`;
        $('tt-solo').addEventListener('click', startSolo);
        $('tt-online').addEventListener('click', () => { if (requireOnline('온라인 대결')) showLobby(); });
        $('tt-rank').addEventListener('click', () => { if (requireOnline('랭킹')) showRanking(); });
        $('tt-help').addEventListener('click', showHelp);
    }

    function showHelp() {
        mode = 'ranking';          // 뒤로가기 시 메뉴로
        setBackLabel();
        body.innerHTML = `
            <div class="tt-panel" style="width:100%; margin-top:10px; text-align:left; font-size:13px; line-height:1.6;">
                <h3 style="text-align:center;">조작법 / 규칙</h3>
                <p><b>터치</b>: ◀ ▶ 이동(꾹 누르면 연속) · ▼ 소프트 드롭 · ⤓ 하드 드롭 · ↻ ↺ 회전 · HOLD 보관</p>
                <p><b>키보드</b>: ← → 이동 · ↓ 소프트 드롭 · Space 하드 드롭 · ↑/X 시계 회전 · Z 반시계 · C/Shift 홀드 · Esc 뒤로</p>
                <p><b>점수</b>: T-스핀, 연속 클리어(콤보), 백투백(테트리스/T-스핀 연속)에 보너스 점수</p>
                <p><b>대결</b>: 같은 블록 순서로 1:1 진행. 줄을 지우면 상대에게 가비지(방해 줄)를 보내고, 내가 받을 방해 줄은 줄을 지워서 상쇄할 수 있어요. 먼저 쌓여서 끝나는 쪽이 패배!</p>
                <p><b>솔로</b>: 레벨이 ${SOLO_LINES_PER_LEVEL}줄마다 오르고 점점 아주 빨라져요! 레벨이 높을수록 코인 보너스가 커져요.</p>
                <p><b>일반 대결</b>: 승리 +${WIN_BONUS.toLocaleString()}원 / 패배 -${LOSE_PENALTY.toLocaleString()}원<br><b>랭크 대결</b>: 승리 +${(typeof GAME_REWARDS !== 'undefined' ? GAME_REWARDS.WIN : 100)}P & +${RANKED_WIN_COIN.toLocaleString()}원 / 패배 ${(typeof GAME_REWARDS !== 'undefined' ? GAME_REWARDS.LOSS : -70)}P<br>랭크 포인트는 오목·틱택토와 합산돼서 <b>아이언 ~ 챌린저</b> 등급에 반영돼요.</p>
                <p style="opacity:.8;">승자가 ${MIN_LINES_FOR_BONUS}줄 이상 지워야 정산돼요. 도중에 나가면 패배 처리!</p>
            </div>`;
    }

    // ===== 게임 화면 공통 =====
    function buildGameView(withPause) {
        body.innerHTML = `
            <div class="tt-wrap">
                <canvas class="tt-canvas" id="tt-canvas"></canvas>
                <div class="tt-msg" id="tt-msg"></div>
                ${withPause ? '<button class="tt-pause" id="tt-b-pause">⏸ 정지</button>' : ''}
            </div>
            <div class="tt-ctrl" id="tt-ctrl">
                <div class="tt-pad">
                    <button id="tt-b-left">◀</button>
                    <button id="tt-b-right">▶</button>
                    <button id="tt-b-soft" class="wide">▼ 내리기</button>
                </div>
                <div class="tt-pad">
                    <button id="tt-b-hold" class="small">HOLD</button>
                    <button id="tt-b-ccw">↺</button>
                    <button id="tt-b-drop" class="acc small">⤓ 드롭</button>
                    <button id="tt-b-cw" class="acc">↻</button>
                </div>
            </div>`;
        canvas = $('tt-canvas');
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        canvas.width = CW * dpr;
        canvas.height = CH * dpr;
        ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        DPR = dpr;

        const act = (fn) => () => { if (phase === 'playing' && state && state.alive) fn(); };
        tapBtn('tt-b-hold', act(() => holdPiece(state)));
        tapBtn('tt-b-ccw', act(() => rotate(state, -1)));
        tapBtn('tt-b-cw', act(() => rotate(state, 1)));
        tapBtn('tt-b-drop', act(hardDrop));
        holdBtn('tt-b-left', act(() => moveH(state, -1)));
        holdBtn('tt-b-right', act(() => moveH(state, 1)));
        const soft = $('tt-b-soft');
        const softOn = (e) => { e.preventDefault(); softHeld = true; };
        const softOff = () => { softHeld = false; };
        soft.addEventListener('pointerdown', softOn);
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => soft.addEventListener(ev, softOff));
        const pb = $('tt-b-pause');
        if (pb) pb.addEventListener('click', togglePause);

        lastTs = 0;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(loop);
    }

    function tapBtn(id, fn) {
        const b = $(id);
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); });
    }

    // 꾹 누르면 연속 입력 (DAS)
    function holdBtn(id, fn) {
        const b = $(id);
        let to = null, iv = null;
        const stop = () => { clearTimeout(to); clearInterval(iv); to = iv = null; };
        stoppers.push(stop);
        b.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            stop();
            fn();
            to = setTimeout(() => { iv = setInterval(fn, 80); }, 180);
        });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => b.addEventListener(ev, stop));
    }

    function stopGame() {
        if (window.GameBGM) GameBGM.stop();
        cancelAnimationFrame(raf);
        clearInterval(hbTimer); clearInterval(endTimer); clearInterval(cdTimer); clearTimeout(pubTimer);
        hbTimer = endTimer = cdTimer = pubTimer = null;
        stoppers.forEach(f => f()); stoppers = [];
        softHeld = false;
        saveCoins();
        canvas = ctx = null;
        state = null;
    }

    // ===== 입력 =====
    function hardDrop() {
        const s = state;
        if (!s || !s.alive || s.clearAnim) return;
        const gy = ghostY(s);
        s.score += 2 * (gy - s.cur.y);
        if (gy > s.cur.y) s.lastRot = false;       // 실제로 내려갔으면 T-스핀 아님 (제자리 하드드롭이면 유지)
        const dropped = gy - s.cur.y;
        s.cur.y = gy;
        if (dropped > 0) addShake(s, 1.6, 6);
        afterLock(lockPiece(s));
    }

    function onKey(e) {
        if (e.code === 'Escape') { onBack(); return; }
        if (!(mode === 'solo' || mode === 'game') || phase !== 'playing' || !state) return;
        const k = e.code;
        if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Space'].indexOf(k) >= 0) e.preventDefault();
        if (k === 'ArrowLeft') moveH(state, -1);
        else if (k === 'ArrowRight') moveH(state, 1);
        else if (k === 'ArrowDown') softHeld = true;
        else if (k === 'ArrowUp' || k === 'KeyX') { if (!e.repeat) rotate(state, 1); }
        else if (k === 'KeyZ') { if (!e.repeat) rotate(state, -1); }
        else if (k === 'Space') { if (!e.repeat) hardDrop(); }
        else if (k === 'KeyC' || k === 'ShiftLeft' || k === 'ShiftRight') { if (!e.repeat) holdPiece(state); }
    }
    function onKeyUp(e) { if (e.code === 'ArrowDown') softHeld = false; }

    // ===== 솔로 =====
    function startSolo() {
        stopGame();
        isOnline = false;
        mode = 'solo';
        setBackLabel();
        buildGameView(true);
        resetSolo();
    }

    function resetSolo() {
        state = newGame((Math.random() * 2147483647) | 0, false);
        phase = 'ready';
        questsDone = false;
        setMsg(`<div class="tt-panel">
            <h3>테트리스</h3>
            <p>🏆 최고 점수: ${best.toLocaleString()}</p>
            <div class="tt-btns"><button class="tt-btn" id="tt-go">시작!</button></div>
        </div>`);
        $('tt-go').addEventListener('click', (e) => { e.stopPropagation(); phase = 'playing'; setMsg(''); });
    }

    function togglePause() {
        if (mode !== 'solo') return;
        if (phase === 'playing') {
            phase = 'paused'; softHeld = false;
            setMsg(`<div class="tt-panel"><h3>⏸ 일시정지</h3>
                <div class="tt-btns"><button class="tt-btn" id="tt-resume">계속하기</button><button class="tt-btn sub" id="tt-quit">그만하기</button></div></div>`);
            $('tt-resume').addEventListener('click', (e) => { e.stopPropagation(); togglePause(); });
            $('tt-quit').addEventListener('click', (e) => { e.stopPropagation(); phase = 'playing'; state.alive = false; setMsg(''); });
        } else if (phase === 'paused') { phase = 'playing'; setMsg(''); }
    }

    function soloOver() {
        phase = 'over';
        recordScore(state.score);
        reportQuests(false);
        saveCoins();
        setMsg(`
            <div class="tt-panel">
                <h3>💥 게임 오버</h3>
                <p>점수: <b>${state.score.toLocaleString()}</b></p>
                <p>지운 줄: <b>${state.lines}</b> · 레벨 ${state.level}</p>
                <p>획득 코인: <b>+${state.coins}원</b></p>
                <p>🏆 최고 점수: ${best.toLocaleString()}</p>
                <div class="tt-btns">
                    <button class="tt-btn" id="tt-retry">다시하기</button>
                    <button class="tt-btn sub" id="tt-exit">메뉴</button>
                </div>
            </div>`);
        $('tt-retry').addEventListener('click', (e) => { e.stopPropagation(); resetSolo(); });
        $('tt-exit').addEventListener('click', (e) => { e.stopPropagation(); showMenu(); });
    }

    // ===== 고정 후 처리 (솔로/온라인 공통) =====
    function afterLock(res) {
        const s = state;
        if (s.coins > 0 && !s.pvp) {
            const gain = s.coins - (s._paid || 0);
            if (gain > 0) {
                s._paid = s.coins;
                if (typeof userData !== 'undefined') userData.coin += gain;
                sessionCoins += gain;
                unsaved = true;
                if (typeof updateTopMoney === 'function') updateTopMoney();
                updateCoinLabel();
            }
        }
        if (!s.alive) return;
        if (isOnline) {
            let atk = res.atk;
            if (atk > 0) {
                const cancel = Math.min(atk, pendingGarbage());
                s.garbageCancelled += cancel;
                atk -= cancel;
                if (cancel > 0) s.pops.push({ text: `🛡 상쇄 ${cancel}`, life: 60, color: '#86efac' });
            }
            if (atk > 0) {
                s.sent += atk;
                s.pops.push({ text: `⚔ 공격 ${atk}줄!`, life: 70, color: '#fb7185', big: atk >= 4 });
            }
            if (res.n === 0) { applyPendingGarbage(); publishSoon(); }
        }
        if (!s.alive) return;
        if (res.n > 0) return;            // 줄 지움 연출이 끝나면 loop 에서 endClear() 호출
        s.canHold = true;
        spawn(s);
    }

    function endClear() {
        const s = state;
        finishClear(s);
        if (isOnline) publishSoon();
        s.canHold = true;
        spawn(s);
    }

    // ===== 가비지 (온라인) =====
    function oppSentTotal() {
        let t = 0;
        const pl = (lastRoom && lastRoom.players) || {};
        for (const uid in pl) if (uid !== myUid()) t += pl[uid].sent || 0;
        return t;
    }
    function pendingGarbage() {
        if (!state) return 0;
        return Math.max(0, oppSentTotal() - state.garbageApplied - state.garbageCancelled);
    }
    function applyPendingGarbage() {
        const s = state;
        const pend = pendingGarbage();
        if (pend <= 0) return;
        const n = Math.min(pend, 8);
        const hole = Math.floor(mulberry32((s.seed + s.garbageApplied * 7919 + 12345) | 0)() * COLS);
        const removed = s.board.splice(0, n);
        const lost = removed.some(r => r.some(v => v));
        for (let i = 0; i < n; i++) { const row = new Array(COLS).fill(8); row[hole] = 0; s.board.push(row); }
        s.garbageApplied += n;
        s.pops.push({ text: `⚠ 방해 줄 +${n}`, life: 70, color: '#f87171' });
        addShake(s, 3 + Math.min(n, 4), 16);
        s.flash = { life: 12, max: 12, a: 0.35, rgb: '239,68,68' };
        if (lost) s.alive = false;
    }

    // ===== 그리기 =====
    function drawCell(c, px, py, sz, idx, a) {
        c.globalAlpha = a == null ? 1 : a;
        c.drawImage(spriteFor(idx, sz), px, py, sz, sz);
        c.globalAlpha = 1;
    }

    // 줄 지움 연출 그리기
    function drawClearAnim(s) {
        const ca = s.clearAnim;
        if (!ca) return;
        const t = ca.t / ca.dur;
        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, BW, BH); ctx.clip();       // 보드 밖으로 나가면 잘림
        ca.rows.forEach((row, i) => {
            if (row.r < 0) return;
            const dir = clearDir(i), py = row.r * CELL;
            for (let x = 0; x < COLS; x++) {
                const v = row.cells[x];
                if (!v) continue;
                const px = x * CELL, st = clearStart(x, dir);
                if (t < st) {                                       // 대기: 번쩍번쩍
                    drawCell(ctx, px, py, CELL, v);
                    const fl = t < 0.22 ? (0.25 + 0.55 * Math.abs(Math.sin(t / 0.22 * Math.PI * 2.5))) : 0.2;
                    ctx.fillStyle = `rgba(255,255,255,${fl})`;
                    ctx.fillRect(px, py, CELL, CELL);
                } else {                                            // 빛줄기에 닿으면 가속하며 옆으로 슝
                    const p = Math.min(1, (t - st) / 0.45);
                    if (p >= 1) continue;
                    const off = dir * p * p * (BW + CELL);
                    const sp = spriteFor(v, CELL);
                    for (let k = 3; k >= 1; k--) {                 // 속도감 잔상
                        ctx.globalAlpha = 0.14 * (4 - k) * (1 - p * 0.5);
                        ctx.drawImage(sp, px + off - dir * k * (6 + 14 * p), py, CELL, CELL);
                    }
                    ctx.globalAlpha = 1 - Math.max(0, (p - 0.75) / 0.25);
                    ctx.drawImage(sp, px + off, py, CELL, CELL);
                    ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - p)})`;
                    ctx.fillRect(px + off, py, CELL, CELL);
                    ctx.globalAlpha = 1;
                }
            }
            const f = (t - 0.22) / 0.28;                            // 훑고 지나가는 빛줄기(꼬리 달린 혜성)
            if (f > 0 && f < 1.25) {
                const pos = dir > 0 ? f * BW : BW - f * BW, tail = 90;
                const gr = ctx.createLinearGradient(pos, 0, pos - dir * tail, 0);
                gr.addColorStop(0, `rgba(255,255,255,${f > 1 ? 0.95 * (1.25 - f) / 0.25 : 0.95})`);
                gr.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = gr;
                ctx.fillRect(dir > 0 ? pos - tail : pos, py + 3, tail, CELL - 6);
            }
        });
        ctx.restore();
    }

    function drawParticles(s) {
        for (const p of s.parts) {
            if (p.delay > 0) continue;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.globalAlpha = Math.min(1, p.life / 16);
            if (p.star) {
                const L = p.size;
                ctx.fillStyle = '#fff';
                ctx.fillRect(-L, -0.8, L * 2, 1.6);
                ctx.fillRect(-0.8, -L, 1.6, L * 2);
            } else {
                const z = Math.max(4, Math.round(p.size));
                ctx.drawImage(spriteFor(p.color, z), -z / 2, -z / 2, z, z);
            }
            ctx.restore();
        }
        ctx.globalAlpha = 1;
    }

    function drawMini(type, cx, cy, sz) {
        if (!type) return;
        const m = ROT[type][0];
        let minR = 9, maxR = -1, minC = 9, maxC = -1;
        for (let i = 0; i < m.length; i++) for (let j = 0; j < m.length; j++) if (m[i][j]) {
            minR = Math.min(minR, i); maxR = Math.max(maxR, i); minC = Math.min(minC, j); maxC = Math.max(maxC, j);
        }
        const w = (maxC - minC + 1) * sz, h = (maxR - minR + 1) * sz;
        const ox = cx - w / 2, oy = cy - h / 2;
        const idx = TYPES.indexOf(type) + 1;
        for (let i = minR; i <= maxR; i++) for (let j = minC; j <= maxC; j++) if (m[i][j]) drawCell(ctx, ox + (j - minC) * sz, oy + (i - minR) * sz, sz, idx);
    }

    function label(text, x, y, size, color, align) {
        ctx.fillStyle = color || 'rgba(255,255,255,0.6)';
        ctx.font = `bold ${size || 10}px sans-serif`;
        ctx.textAlign = align || 'left';
        ctx.fillText(text, x, y);
    }

    function opponentInfo() {
        const pl = (lastRoom && lastRoom.players) || {};
        for (const uid in pl) if (uid !== myUid()) return Object.assign({ uid }, pl[uid]);
        return null;
    }

    function draw() {
        const s = state;
        ctx.save();
        drawScene();
        ctx.restore();
    }

    function drawScene() {
        const s = state;
        ctx.fillStyle = '#0b1026';
        ctx.fillRect(0, 0, CW, CH);

        // 보드
        ctx.fillStyle = '#10173a';
        ctx.fillRect(0, 0, BW, BH);
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < COLS; i++) { ctx.moveTo(i * CELL + 0.5, 0); ctx.lineTo(i * CELL + 0.5, BH); }
        for (let i = 1; i < ROWS; i++) { ctx.moveTo(0, i * CELL + 0.5); ctx.lineTo(BW, i * CELL + 0.5); }
        ctx.stroke();

        const skipRows = s.clearAnim ? s.clearAnim.rowsY : [];
        for (let y = HID; y < TOT; y++) {
            if (skipRows.indexOf(y) >= 0) continue;
            for (let x = 0; x < COLS; x++) {
                const v = s.board[y][x];
                if (v) drawCell(ctx, x * CELL, (y - HID) * CELL, CELL, v);
            }
        }

        if (!s.clearAnim && (s.alive || phase === 'over' || phase === 'done')) {
            const c = s.cur, m = ROT[c.t][c.r], idx = TYPES.indexOf(c.t) + 1;
            if (s.alive) {
                const gy = ghostY(s);
                for (let i = 0; i < m.length; i++) for (let j = 0; j < m.length; j++) if (m[i][j]) {
                    const by = gy + i - HID;
                    if (by >= 0) drawCell(ctx, (c.x + j) * CELL, by * CELL, CELL, idx, 0.22);
                }
                for (let i = 0; i < m.length; i++) for (let j = 0; j < m.length; j++) if (m[i][j]) {
                    const by = c.y + i - HID;
                    if (by >= 0) drawCell(ctx, (c.x + j) * CELL, by * CELL, CELL, idx);
                }
            }
        }

        // 줄 지움 이펙트
        drawClearAnim(s);
        drawParticles(s);
        if (s.flash) {
            ctx.fillStyle = `rgba(${s.flash.rgb || '255,255,255'},${s.flash.a * s.flash.life / s.flash.max})`;
            ctx.fillRect(0, 0, BW, BH);
        }

        // 받을 가비지 표시
        if (isOnline) {
            const pend = Math.min(pendingGarbage(), ROWS);
            if (pend > 0) {
                ctx.globalAlpha = 0.65 + 0.35 * Math.sin(Date.now() / 120);
                ctx.fillStyle = '#ef4444'; ctx.fillRect(0, BH - pend * CELL, 6, pend * CELL);
                ctx.globalAlpha = 1;
                label('⚠ ' + pend, 10, BH - 8, 11, '#fca5a5');
            }
        }

        // 보드 테두리
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.strokeRect(0.5, 0.5, BW - 1, BH - 1);

        // 팝업 텍스트
        let py = 70;
        for (const p of s.pops) {
            ctx.globalAlpha = Math.min(1, p.life / 30);
            ctx.fillStyle = p.color || (p.big ? '#fff3b0' : '#fde68a');
            ctx.font = `bold ${p.big ? 24 : 16}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3;
            ctx.strokeText(p.text, BW / 2, py);
            ctx.fillText(p.text, BW / 2, py);
            ctx.globalAlpha = 1;
            py += p.big ? 30 : 22;
        }

        // 사이드 패널
        const sx = BW + 8, mid = BW + SIDE / 2 + 2;
        label('HOLD', sx, 14);
        ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(sx, 20, SIDE - 12, 42);
        if (s.hold) { ctx.globalAlpha = s.canHold ? 1 : 0.35; drawMini(s.hold, mid, 41, 10); ctx.globalAlpha = 1; }

        label('NEXT', sx, 78);
        ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(sx, 84, SIDE - 12, 92);
        for (let i = 0; i < 3; i++) drawMini(s.queue[i], mid, 100 + i * 28, 10);

        let ty = 194;
        const stat = (name, val) => { label(name, sx, ty, 9); label(String(val), sx, ty + 15, 14, '#fff'); ty += 36; };
        stat('SCORE', s.score.toLocaleString());
        stat('LINES', s.lines);
        stat(s.pvp ? 'TIME' : 'LEVEL', s.pvp ? Math.floor(s.elapsed / 1000) + 's' : s.level);

        if (isOnline) {
            const op = opponentInfo();
            label('VS ' + (op ? op.name : '?'), sx, 312, 10, '#fca5a5');
            const bx = sx + 14, by = 318, cs = 6;
            ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(bx - 1, by - 1, COLS * cs + 2, ROWS * cs + 2);
            if (op && typeof op.board === 'string' && op.board.length >= COLS * ROWS) {
                for (let i = 0; i < COLS * ROWS; i++) {
                    const v = op.board.charCodeAt(i) - 48;
                    if (v > 0 && v <= 8) { ctx.fillStyle = COLORS[v]; ctx.fillRect(bx + (i % COLS) * cs, by + Math.floor(i / COLS) * cs, cs - 1, cs - 1); }
                }
            }
            if (op && !op.alive) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(bx - 1, by - 1, COLS * cs + 2, ROWS * cs + 2); label('OUT', bx + 30, by + 62, 12, '#fff', 'center'); }
            label((op ? (op.lines || 0) : 0) + ' lines', sx, by + ROWS * cs + 14, 10);
        } else {
            label('BEST', sx, ty + 4, 9);
            label(best.toLocaleString(), sx, ty + 19, 13, '#fde68a');
        }
    }

    // 게임 상태에 맞춰 배경음악 재생/정지 (매 프레임 호출해도 안전)
    function bgmSync(s) {
        if (!window.GameBGM) return;
        if (phase === 'playing' && s.alive) {
            GameBGM.setSpeed(1 + Math.min(0.5, ((s.level || 1) - 1) * 0.04));   // 레벨이 오를수록 템포 상승
            GameBGM.play('tetris');
        } else if (phase === 'paused') {
            GameBGM.pause();
        } else {
            GameBGM.stop();    // 시작 전 / 카운트다운 / 게임오버 / 종료
        }
    }

    function loop(ts) {
        raf = requestAnimationFrame(loop);
        if (!state || !ctx) return;
        const dt = lastTs ? Math.min(ts - lastTs, 100) : 16;
        lastTs = ts;
        const s = state;
        bgmSync(s);

        if (phase === 'playing' && s.alive) {
            s.elapsed += dt;
            if (s.pvp) s.level = Math.min(12, 1 + Math.floor(s.elapsed / 30000));
            if (s.clearAnim) {                       // 줄 지움 연출 중에는 잠깐 멈춤
                s.clearAnim.t += dt;
                if (s.clearAnim.t >= s.clearAnim.dur) endClear();
            } else {
                const gm = softHeld ? Math.min(gravMs(s.level, s.pvp), 45) : gravMs(s.level, s.pvp);
                s.gravAcc += dt;
                while (s.gravAcc >= gm && s.alive) {
                    if (tryMove(s, 0, 1)) {
                        s.lastRot = false;
                        if (softHeld) s.score += 1;
                        s.gravAcc -= gm;
                        s.lockAcc = 0;
                    } else { s.gravAcc = 0; break; }
                }
                if (onGround(s)) {
                    s.lockAcc += dt;
                    if (s.lockAcc >= (s.pvp ? LOCK_MS : Math.max(250, LOCK_MS - (s.level - 1) * 18))) afterLock(lockPiece(s));
                } else s.lockAcc = 0;
            }
        }
        if (phase === 'playing' && !s.alive) { isOnline ? onlineDied() : soloOver(); }
        if (phase !== 'paused') {
            const f = dt / 16.667;
            for (const p of s.parts) {
                if (p.delay > 0) { p.delay -= dt; continue; }
                p.x += p.vx * f; p.y += p.vy * f; p.vy += 0.26 * f; p.rot += p.vr * f; p.life -= f;
            }
            s.parts = s.parts.filter(p => p.life > 0);
            if (s.shake) { s.shake.life -= f; if (s.shake.life <= 0) s.shake = null; }
            if (s.flash) { s.flash.life -= f; if (s.flash.life <= 0) s.flash = null; }
        }
        for (const p of s.pops) p.life -= 1;
        s.pops = s.pops.filter(p => p.life > 0);
        draw();
    }

    // ===== 랭킹 =====
    async function showRanking() {
        stopGame();
        detachLobby();
        mode = 'ranking';
        setBackLabel();
        body.innerHTML = `
            <div style="width:100%; margin-top:6px;">
                <div style="text-align:center; font-weight:bold;">🏆 최고 점수 TOP 20</div>
                <div style="text-align:center; font-size:12px; opacity:.75; margin-top:4px;">랭크 대결 승패는 메인 랭킹(아이언~챌린저)에 반영돼요.</div>
                <div class="tt-list" id="tt-rank-list"><div class="tt-row">불러오는 중...</div></div>
            </div>`;
        try {
            const snap = await db.collection('users').orderBy('tetrisBest', 'desc').limit(20).get();
            if (mode !== 'ranking' || !$('tt-rank-list')) return;
            const rows = [];
            let i = 0;
            snap.forEach(doc => {
                const d = doc.data();
                if (!((d.tetrisBest || 0) > 0)) return;
                i += 1;
                const medal = i === 1 ? '🥇' : i === 2 ? '🥈' : i === 3 ? '🥉' : `${i}.`;
                const me = doc.id === myUid() ? ' style="outline:2px solid var(--accent-color,#6c63ff);"' : '';
                rows.push(`<div class="tt-row"${me}><span>${medal} ${esc(d.name || '이름없음')}</span><b>${d.tetrisBest.toLocaleString()}점</b></div>`);
            });
            $('tt-rank-list').innerHTML = rows.length ? rows.join('') : '<div class="tt-row">아직 기록이 없어요. 첫 기록을 세워보세요!</div>';
        } catch (e) {
            console.error('[테트리스] 랭킹 오류', e);
            if ($('tt-rank-list')) $('tt-rank-list').innerHTML = '<div class="tt-row">랭킹을 불러오지 못했어요.</div>';
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
        const P = (typeof GAME_REWARDS !== 'undefined') ? GAME_REWARDS : { WIN: 100, LOSS: -70 };
        body.innerHTML = `
            <div style="width:100%; margin-top:6px;">
                <div style="text-align:center; font-size:12.5px; opacity:.85; margin-bottom:10px; line-height:1.5;">
                    1:1 대결! 같은 블록 순서로 시작하고, 줄을 지우면 상대에게 방해 줄을 보내요.<br>
                    일반: 승 +${WIN_BONUS.toLocaleString()}원 / 패 -${LOSE_PENALTY.toLocaleString()}원<br>
                    랭크: 승 +${P.WIN}P & +${RANKED_WIN_COIN.toLocaleString()}원 / 패 ${P.LOSS}P (아이언~챌린저 등급 반영)<br>
                    (승자가 ${MIN_LINES_FOR_BONUS}줄 이상 지워야 정산)
                    ${rankLine()}
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="tt-btn" id="tt-create-n" style="padding:14px;">일반 방 만들기</button>
                    <button class="tt-btn red" id="tt-create-r" style="padding:14px;">랭크 방 만들기</button>
                </div>
                <div style="margin-top:12px; font-weight:bold;">열려있는 방</div>
                <div class="tt-list" id="tt-room-list"><div class="tt-row">방 목록을 불러오는 중...</div></div>
            </div>`;
        $('tt-create-n').addEventListener('click', () => createRoom(false));
        $('tt-create-r').addEventListener('click', () => createRoom(true));

        if (typeof cleanupStaleRooms === 'function') cleanupStaleRooms(); // 오래된 방 정리 (목록 30개 제한이 막히지 않게)
        lobbyUnsub = db.collection(ROOMS).where('status', '==', ST_WAIT).limit(30).onSnapshot((snap) => {
            const list = $('tt-room-list');
            if (!list || mode !== 'lobby') return;
            const now = Date.now();
            const rooms = [];
            snap.forEach(doc => {
                const d = doc.data({ serverTimestamps: 'estimate' });
                if (d.game !== 'tetris') return;
                const created = d.createdAt ? d.createdAt.toMillis() : now;
                if (now - created > ROOM_TTL_MS) return;
                rooms.push({ id: doc.id, d, count: Object.keys(d.players || {}).length, created });
            });
            rooms.sort((a, b) => b.created - a.created);
            if (!rooms.length) { list.innerHTML = '<div class="tt-row">열려있는 방이 없어요. 방을 만들어보세요!</div>'; return; }
            list.innerHTML = rooms.map(r => `
                <div class="tt-row">
                    <span>${esc(r.d.hostName)}님의 방${r.d.isRanking ? '<span class="tt-tag">[랭크]</span>' : ''} (${r.count}/${MAX_PLAYERS})${r.d.hostUid === myUid() ? ' · 내 방' : ''}</span>
                    <button class="tt-btn" data-join="${r.id}" ${r.count >= MAX_PLAYERS ? 'disabled' : ''}>입장</button>
                </div>`).join('');
            list.querySelectorAll('[data-join]').forEach(btn => btn.addEventListener('click', () => joinRoom(btn.dataset.join)));
        }, (err) => {
            console.error('[테트리스] 방 목록 오류', err);
            const list = $('tt-room-list');
            if (list) list.innerHTML = '<div class="tt-row">방 목록을 불러오지 못했어요.<br>Firestore 보안 규칙(omokRooms)을 확인해주세요.</div>';
        });
    }

    async function createRoom(isRanking) {
        if (busy) return;
        busy = true;
        try {
            const old = await db.collection(ROOMS).where('hostUid', '==', myUid()).where('status', '==', ST_WAIT).get();
            for (const doc of old.docs) { try { await doc.ref.delete(); } catch (e) { } }
            const ref = db.collection(ROOMS).doc();
            await ref.set({
                game: 'tetris',
                status: ST_WAIT,
                hostUid: myUid(),
                hostName: myName(),
                guestUid: '',
                isRanking: !!isRanking,
                seed: Math.floor(Math.random() * 2147483647),
                startAtMs: 0,
                players: { [myUid()]: { name: myName(), score: 0, lines: 0, sent: 0, alive: true, ping: 0, board: '' } },
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
                const upd = { ['players.' + uid]: { name: myName(), score: 0, lines: 0, sent: 0, alive: true, ping: 0, board: '' } };
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
        body.innerHTML = '<div class="tt-panel" style="width:100%; margin-top:10px;">방에 입장하는 중...</div>';

        roomUnsub = db.collection(ROOMS).doc(id).onSnapshot((snap) => {
            if (!snap.exists) {
                if (mode === 'room') { alert('방이 사라졌어요.'); detachRoom(); roomId = null; showLobby(); }
                else if (mode === 'game' && !finished) finishOnline(null);
                return;
            }
            lastRoom = snap.data({ serverTimestamps: 'estimate' });
            if (mode === 'room') {
                if (lastRoom.status === ST_PLAY && !startedRound) startOnlineRound();
                else renderWaitingRoom();
            } else if (mode === 'game') {
                evaluateRound();
            }
        }, (err) => {
            console.error('[테트리스] 방 오류', err);
            alert('방 연결에 실패했어요.');
        });
    }

    function renderWaitingRoom() {
        if (mode !== 'room' || !lastRoom) return;
        const players = Object.entries(lastRoom.players || {});
        const isHost = lastRoom.hostUid === myUid();
        body.innerHTML = `
            <div class="tt-panel" style="width:100%; margin-top:10px;">
                <h3>⚔️ 대기실 ${lastRoom.isRanking ? '<span class="tt-tag">[랭크]</span>' : '<span style="opacity:.7; font-size:14px;">[일반]</span>'}</h3>
                <p style="opacity:.8;">${isHost ? '상대가 들어오면 시작할 수 있어요.' : '방장이 시작하길 기다리는 중...'}</p>
                <div class="tt-list">
                    ${players.map(([uid, p]) => `<div class="tt-row"><span>${uid === lastRoom.hostUid ? '👑 ' : ''}${esc(p.name)}${uid === myUid() ? ' (나)' : ''}</span></div>`).join('')}
                </div>
                <div class="tt-btns">
                    ${isHost ? `<button class="tt-btn" id="tt-start" ${players.length < 2 ? 'disabled' : ''}>게임 시작 (${players.length}/${MAX_PLAYERS})</button>` : ''}
                    <button class="tt-btn sub" id="tt-leave">방 나가기</button>
                </div>
            </div>`;
        const start = $('tt-start');
        if (start) start.addEventListener('click', hostStart);
        $('tt-leave').addEventListener('click', async () => { await leaveRoom(); showLobby(); });
    }

    async function hostStart() {
        try { await db.collection(ROOMS).doc(roomId).update({ status: ST_PLAY, startAtMs: Date.now() }); }
        catch (e) { console.error(e); alert('시작하지 못했어요. 다시 시도해주세요.'); }
    }

    async function leaveRoom() {
        const id = roomId, wasMode = mode, wasFinished = finished;
        const myScore = state ? state.score : 0, myLines = state ? state.lines : 0;
        if (wasMode === 'game' && !wasFinished && startedRound && !settled) {       // 도중에 나가면 패배 처리
            settled = true;
            if (lastRoom && lastRoom.isRanking) recordRank(false);
            else applyCoinDelta(-LOSE_PENALTY);
            reportQuests(false);
        }
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
                if (!wasFinished) await ref.update({ ['players.' + myUid() + '.alive']: false, ['players.' + myUid() + '.score']: myScore, ['players.' + myUid() + '.lines']: myLines, ['players.' + myUid() + '.diedAt']: firebase.firestore.FieldValue.serverTimestamp() });
                else if (lastRoom && lastRoom.hostUid === myUid()) await ref.delete();
            }
        } catch (e) { console.warn('[테트리스] 방 나가기 처리 실패', e); }
    }

    // ===== 온라인: 라운드 =====
    function boardString() {
        let out = '';
        for (let y = HID; y < TOT; y++) for (let x = 0; x < COLS; x++) out += String(state.board[y][x]);
        return out;
    }

    function publishNow(extra) {
        if (!roomId || !state) return;
        const me = 'players.' + myUid() + '.';
        const upd = {};
        upd[me + 'score'] = state.score;
        upd[me + 'lines'] = state.lines;
        upd[me + 'sent'] = state.sent;
        upd[me + 'board'] = boardString();
        upd[me + 'ping'] = Date.now();
        if (extra) for (const k in extra) upd[me + k] = extra[k];
        lastPub = Date.now(); dirtyPub = false;
        db.collection(ROOMS).doc(roomId).update(upd).catch(e => console.warn('[테트리스] 동기화 실패', e));
    }
    // 쓰기 폭주 방지: 최소 600ms 간격으로 모아서 전송
    function publishSoon() {
        dirtyPub = true;
        if (pubTimer) return;
        pubTimer = setTimeout(() => { pubTimer = null; if (dirtyPub && phase === 'playing') publishNow(); }, Math.max(0, 600 - (Date.now() - lastPub)));
    }

    function startOnlineRound() {
        startedRound = true;
        finished = false;
        settled = false;
        questsDone = false;
        myDiedAt = 0; declaring = false; lastPub = 0; dirtyPub = false;
        mode = 'game';
        isOnline = true;
        setBackLabel();
        buildGameView(false);
        state = newGame(lastRoom.seed || 1, true);
        phase = 'countdown';

        let n = 3;
        const show = () => setMsg(`<div style="font-size:84px; font-weight:bold; text-shadow:0 2px 8px #000;">${n}</div>${lastRoom.isRanking ? '<div style="font-weight:bold; color:#fca5a5;">랭크 대결</div>' : ''}`);
        show();
        cdTimer = setInterval(() => {
            n -= 1;
            if (n > 0) { show(); return; }
            clearInterval(cdTimer); cdTimer = null;
            setMsg('');
            phase = 'playing';
            publishNow({ alive: true });
            hbTimer = setInterval(() => publishNow(), 3000);
            endTimer = setInterval(evaluateRound, 2000);
        }, 1000);
    }

    function playerFinished(p) {
        if (!p.alive) return true;
        const ref = p.ping || (lastRoom && lastRoom.startAtMs) || 0;
        return ref > 0 && (Date.now() - ref) > STALE_MS;
    }

    function standings() {
        const list = Object.entries((lastRoom && lastRoom.players) || {}).map(([uid, p]) => {
            const me = uid === myUid();
            return {
                uid, name: p.name,
                score: me && state ? Math.max(state.score, p.score || 0) : (p.score || 0),
                lines: me && state ? Math.max(state.lines, p.lines || 0) : (p.lines || 0),
                finished: me ? (phase === 'over' || phase === 'done') : playerFinished(p),
                diedMs: me ? (myDiedAt || tsMs(p.diedAt)) : (tsMs(p.diedAt) || (lastRoom.startAtMs || 0))
            };
        });
        list.sort((a, b) => b.score - a.score);
        return list;
    }

    function onlineDied() {
        phase = 'over';
        myDiedAt = Date.now();
        softHeld = false;
        recordScore(state.score);
        publishNow({ alive: false, diedAt: firebase.firestore.FieldValue.serverTimestamp() });
        setMsg(`
            <div class="tt-panel">
                <h3>💥 탈락!</h3>
                <p>점수 <b>${state.score.toLocaleString()}</b> · ${state.lines}줄</p>
                <p style="opacity:.8;">결과를 기다리는 중...</p>
                <div class="tt-btns"><button class="tt-btn sub" id="tt-leave2">나가기</button></div>
            </div>`);
        $('tt-leave2').addEventListener('click', async (e) => { e.stopPropagation(); await leaveRoom(); showLobby(); });
        evaluateRound();
    }

    // 라운드 종료 판정: 살아있는 사람이 1명 이하가 되면 승패 결정
    function evaluateRound() {
        if (mode !== 'game' || finished || !lastRoom) return;
        if (lastRoom.status === ST_DONE) { finishOnline(lastRoom.winnerUid || ''); return; }
        if (phase !== 'playing' && phase !== 'over') return;
        const all = standings();
        const alive = all.filter(p => !p.finished);
        if (alive.length > 1) return;
        let winner = '';
        if (alive.length === 1) winner = alive[0].uid;
        else {
            const byDeath = [...all].sort((a, b) => (b.diedMs - a.diedMs) || (b.score - a.score));
            const [x, y] = byDeath;
            winner = (y && x.diedMs === y.diedMs && x.score === y.score) ? '' : x.uid;
        }
        const w = all.find(p => p.uid === winner);
        declareWinner(winner, w ? w.lines : 0);
    }

    async function declareWinner(winnerUid, winnerLines) {
        if (declaring || !roomId) return;
        declaring = true;
        const ref = db.collection(ROOMS).doc(roomId);
        try {
            await db.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                if (!snap.exists || snap.data().status === ST_DONE) return;
                tx.update(ref, { status: ST_DONE, winnerUid, winnerLines: winnerLines || 0 });
            });
        } catch (e) { console.warn('[테트리스] 승패 확정 실패', e); }
        declaring = false;
    }

    // winnerUid: uid(승자) / ''(무승부) / null(방 사라짐, 정산 없음)
    async function finishOnline(winnerUid) {
        if (finished) return;
        finished = true;
        phase = 'done';
        softHeld = false;
        clearInterval(hbTimer); clearInterval(endTimer); clearTimeout(pubTimer); pubTimer = null;
        const all = standings();
        const me = myUid();
        const ranked = !!(lastRoom && lastRoom.isRanking);
        const wEntry = all.find(p => p.uid === winnerUid);
        const wl = (lastRoom && typeof lastRoom.winnerLines === 'number') ? lastRoom.winnerLines : (wEntry ? wEntry.lines : 0);
        const eligible = !!winnerUid && wl >= MIN_LINES_FOR_BONUS;
        const lowMsg = `승자가 ${MIN_LINES_FOR_BONUS}줄 이상 지워야 정산돼요. (승자 ${wl}줄) 이번 판은 정산 없음`;
        const P = (typeof GAME_REWARDS !== 'undefined') ? GAME_REWARDS : { WIN: 100, LOSS: -70 };
        let title, note, win = false;

        if (settled) { title = '게임 종료'; note = ''; }
        else if (winnerUid === null) { title = '게임 종료'; note = '방이 사라져서 정산 없이 끝났어요.'; }
        else if (winnerUid === '') { title = '🤝 무승부'; note = '정산 없음'; }
        else if (winnerUid === me) {
            title = '🏆 승리!';
            if (eligible) {
                win = true; settled = true;
                if (ranked) {
                    const before = tierOf(pointsNow());
                    await recordRank(true);
                    const d = applyCoinDelta(RANKED_WIN_COIN);
                    note = `랭크 <b>+${P.WIN}P</b> · 코인 <b>+${d.toLocaleString()}원</b>` + tierNote(before, tierOf(pointsNow()));
                } else { const d = applyCoinDelta(WIN_BONUS); note = `상대를 꺾었어요! <b>+${d.toLocaleString()}원</b>`; }
            } else note = lowMsg;
        } else {
            title = '😵 패배';
            if (eligible) {
                settled = true;
                if (ranked) {
                    const before = tierOf(pointsNow());
                    await recordRank(false);
                    note = `랭크 <b>${P.LOSS}P</b>` + tierNote(before, tierOf(pointsNow()));
                } else { const d = applyCoinDelta(-LOSE_PENALTY); note = `<b>${d.toLocaleString()}원</b>`; }
            } else note = lowMsg;
        }
        reportQuests(win);

        const rows = all.map(p => `
            <div class="tt-row" ${p.uid === me ? 'style="outline:2px solid #ffd54f;"' : ''}>
                <span>${p.uid === winnerUid ? '<i class="fa-solid fa-crown" style="color:#ffd54f;"></i>' : '<i class="fa-solid fa-skull"></i>'} ${esc(p.name)}</span><b>${p.score.toLocaleString()} · ${p.lines}줄</b>
            </div>`).join('');
        setMsg(`
            <div class="tt-panel">
                <h3>${title}${ranked ? ' <span class="tt-tag" style="font-size:13px;">[랭크]</span>' : ''}</h3>
                <div class="tt-list">${rows}</div>
                <p style="margin-top:8px;">${note}</p>
                <div class="tt-btns"><button class="tt-btn" id="tt-lobby">로비로</button></div>
            </div>`);
        $('tt-lobby').addEventListener('click', async (e) => { e.stopPropagation(); await leaveRoom(); showLobby(); });
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
        document.removeEventListener('keyup', onKeyUp);
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = body = canvas = ctx = null;
        mode = 'menu';
    }

    window.TetrisUI = { open, close, _test: { finishClear, _attach: (c, st) => { ctx = c; state = st; phase = 'playing'; isOnline = false; }, _loop: loop, newGame, lockPiece, rotate, moveH, holdPiece, ghostY, collide, mulberry32, spawn, ROT, TYPES, COLS, ROWS, HID, TOT } };
})();
