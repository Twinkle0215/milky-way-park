// ===== fishing.js =====
// 낚시왕: 미끼(30원~)를 달아 낚싯대를 던지고 → 입질이 오면 빠르게 탭 → 릴링 막대의 초록 구간에 맞춰 탭!
// 잡은 물고기는 바로 코인으로 정산돼요. 낚싯대를 업그레이드하면 좋은 물고기가 더 잘 낚여요. 열기: FishingUI.open()
//
// [Firestore] users/{uid} 문서의 fishData({rod, n:{물고기:마릿수}, big:{물고기:최대크기}, total}), fishTotal(랭킹용) 필드
// [오프라인] 기기에도 같이 저장해서 인터넷 없이도 낚시 가능 (랭킹만 온라인 필요)

(function () {
    'use strict';

    const BAIT_BASE = 30;                 // 미끼값 = 30 + 낚싯대 레벨 x 15 (좋은 낚싯대일수록 고급 미끼)
    const baitCost = (rod) => BAIT_BASE + 15 * rod;
    // 등급: 0 잡동사니 < 1 일반 < 2 고급 < 3 희귀 < 4 영웅 < 5 전설 < 6 신화
    const TIER_LABEL = ['잡동사니', '일반', '고급', '희귀', '영웅', '전설', '신화'];
    const TIER_COLOR = ['#9ca3af', '#e5e7eb', '#4ade80', '#38bdf8', '#c084fc', '#fbbf24', '#ff4d8d'];

    // t: 등급(0~5), pmin~pmax: 정산 코인(크기에 비례), smin~smax: 크기(cm)
    const FISH = [
        { id: 'boot', name: '낡은 장화', e: '🥾', t: 0, pmin: 1, pmax: 5, smin: 20, smax: 30 },
        { id: 'can', name: '빈 깡통', e: '🥫', t: 0, pmin: 1, pmax: 3, smin: 8, smax: 12 },
        { id: 'minnow', name: '피라미', e: '🐟', t: 1, pmin: 8, pmax: 20, smin: 5, smax: 15 },
        { id: 'shrimp', name: '새우', e: '🦐', t: 1, pmin: 10, pmax: 25, smin: 4, smax: 12 },
        { id: 'crucian', name: '붕어', e: '🐟', t: 1, pmin: 12, pmax: 30, smin: 12, smax: 35 },
        { id: 'loach', name: '미꾸라지', e: '🐠', t: 1, pmin: 14, pmax: 34, smin: 8, smax: 20 },
        { id: 'carp', name: '잉어', e: '🐟', t: 1, pmin: 25, pmax: 55, smin: 30, smax: 80 },
        { id: 'trout', name: '송어', e: '🐟', t: 2, pmin: 60, pmax: 120, smin: 25, smax: 60 },
        { id: 'crab', name: '꽃게', e: '🦀', t: 2, pmin: 70, pmax: 140, smin: 10, smax: 25 },
        { id: 'mandarin', name: '쏘가리', e: '🐠', t: 2, pmin: 80, pmax: 160, smin: 25, smax: 50 },
        { id: 'pufferfish', name: '복어', e: '🐡', t: 3, pmin: 250, pmax: 500, smin: 20, smax: 45 },
        { id: 'lobster', name: '바닷가재', e: '🦞', t: 3, pmin: 350, pmax: 650, smin: 25, smax: 55 },
        { id: 'sturgeon', name: '철갑상어', e: '🐟', t: 3, pmin: 400, pmax: 700, smin: 90, smax: 200 },
        { id: 'goldcarp', name: '황금잉어', e: '🐠', t: 3, pmin: 300, pmax: 600, smin: 40, smax: 90 },
        { id: 'turtle', name: '바다거북', e: '🐢', t: 4, pmin: 1000, pmax: 1700, smin: 60, smax: 120 },
        { id: 'octopus', name: '대왕문어', e: '🐙', t: 4, pmin: 1200, pmax: 1900, smin: 80, smax: 250 },
        { id: 'squid', name: '심해 대왕오징어', e: '🦑', t: 4, pmin: 1500, pmax: 2300, smin: 150, smax: 400 },
        { id: 'dragonfish', name: '별빛 용왕어', e: '🐉', t: 5, pmin: 7000, pmax: 12000, smin: 120, smax: 300 },
        { id: 'whale', name: '은하수 고래', e: '🐋', t: 5, pmin: 9000, pmax: 16000, smin: 800, smax: 2000 },
        { id: 'starkoi', name: '별빛 비단잉어', e: '🎏', t: 6, pmin: 30000, pmax: 50000, smin: 60, smax: 150 },
        { id: 'leviathan', name: '리바이어던', e: '🐲', t: 6, pmin: 40000, pmax: 70000, smin: 3000, smax: 8000 },
        { id: 'kraken', name: '우주 크라켄', e: '🦑', t: 6, pmin: 50000, pmax: 90000, smin: 2000, smax: 6000 }
    ];

    // 도감 설명
    const DESC = {
        boot: '누가 버렸을까? 아직도 냄새가 난다.', can: '속이 텅 비었다. 분리수거는 필수!',
        minnow: '작지만 빠른 개울의 터줏대감.', shrimp: '통통 튀어 오르는 작은 새우.',
        crucian: '어디서나 만날 수 있는 국민 민물고기.', loach: '진흙 속을 좋아하는 미끈미끈한 친구.',
        carp: '오래 사는 것으로 유명한 큼직한 물고기.', trout: '맑고 차가운 물을 좋아하는 은빛 사냥꾼.',
        crab: '옆으로 걷는 집게발 달린 바다 손님.', mandarin: '날렵한 포식자, 호수의 사냥꾼.',
        pufferfish: '화가 나면 풍선처럼 부풀어 오른다.', lobster: '묵직한 집게를 가진 바다의 귀족.',
        sturgeon: '공룡 시대부터 살아온 살아있는 화석.', goldcarp: '황금빛 비늘이 눈부신 행운의 상징.',
        turtle: '수백 년을 헤엄쳐 온 느긋한 바다의 어르신.', octopus: '여덟 개의 다리로 배를 휘감는 거대한 문어.',
        squid: '심해에서 올라온 전설 속 거대 오징어.', dragonfish: '별빛 아래에서만 모습을 드러내는 용왕의 사자.',
        whale: '은하수를 닮은 몸으로 밤바다를 유영하는 고래.',
        starkoi: '별이 내려앉은 듯 반짝이는 비단잉어. 본 사람이 거의 없다.',
        leviathan: '바다 그 자체라 불리는 태고의 괴수.', kraken: '우주의 심연에서 올라온 거대한 촉수의 주인.'
    };

    // 낚싯대 (0 = 기본). 업그레이드 가격 / 이름
    const RODS = [
        { name: '대나무 낚싯대', cost: 0 },
        { name: '글라스파이버 낚싯대', cost: 1500 },
        { name: '카본 낚싯대', cost: 6000 },
        { name: '티타늄 낚싯대', cost: 20000 },
        { name: '심해 낚싯대', cost: 60000 },
        { name: '은하수 낚싯대', cost: 180000 }
    ];

    // 등급별 출현 가중치 (낚싯대 레벨이 오를수록 좋은 물고기 비중 증가)
    function weightsFor(rod) {
        return [
            Math.max(2, 17 - 2.5 * rod),      // 잡동사니
            Math.max(25, 62 - 5 * rod),       // 일반
            16 + 2.5 * rod,                   // 고급
            4 + 1.6 * rod,                    // 희귀
            0.6 + 0.5 * rod,                  // 영웅
            0.08 + 0.08 * rod,                // 전설
            0.005 + 0.008 * rod               // 신화
        ];
    }
    const reactionMs = (rod) => 1100 + 150 * rod;                    // 입질 후 탭해야 하는 시간
    const zoneWidth = (tier, rod) => Math.min(0.5, [0.46, 0.34, 0.28, 0.22, 0.17, 0.13, 0.10][tier] + 0.03 * rod);
    const markerSpeed = (tier) => 0.9 + 0.25 * tier;                  // 초당 왕복 횟수

    function rollFish(rod) {
        const w = weightsFor(rod), total = w.reduce((a, b) => a + b, 0);
        let r = Math.random() * total, tier = 0;
        for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) { tier = i; break; } }
        const pool = FISH.filter(f => f.t === tier);
        const f = pool[Math.floor(Math.random() * pool.length)];
        const ratio = Math.pow(Math.random(), 1.4);   // 큰 물고기는 드물게
        return {
            fish: f,
            size: Math.round(f.smin + (f.smax - f.smin) * ratio),
            price: Math.round(f.pmin + (f.pmax - f.pmin) * ratio)
        };
    }

    const sfx = (n, a) => { try { if (window.GameBGM && GameBGM.sfx) GameBGM.sfx(n, a); } catch (e) { } };

    // ===== 상태 =====
    let overlay = null, body = null;
    let tab = 'fish';                   // fish | dex | shop | rank
    let dexSel = null;
    let data = { rod: 0, n: {}, big: {}, total: 0, ts: 0 };
    let phase = 'idle';                 // idle | casting | waiting | bite | reel | result
    let bobX = 240, splashOnce = false;
    let cur = null, zone = null, markerT0 = 0, raf = 0;
    let waitTimer = null, biteTimer = null, saveTimer = null, session = 0, lastMsg = '';

    const $ = (id) => overlay && overlay.querySelector('#' + id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const logged = () => (typeof currentUser !== 'undefined' && currentUser);
    const myUid = () => (logged() ? currentUser.uid : null);
    const fmt = (n) => Math.round(n).toLocaleString();
    const coin = () => (typeof userData !== 'undefined' ? userData.coin || 0 : 0);

    // ===== 저장 =====
    const lsKey = () => 'mwp_fishData_' + (myUid() || 'guest');
    function readLocal() { try { return JSON.parse(localStorage.getItem(lsKey()) || 'null'); } catch (e) { return null; } }
    function writeLocal() { try { localStorage.setItem(lsKey(), JSON.stringify(data)); } catch (e) { } }

    async function loadData() {
        let remote = null;
        if (logged() && navigator.onLine !== false) {
            try {
                const snap = await db.collection('users').doc(myUid()).get();
                remote = snap.exists ? (snap.data().fishData || null) : null;
            } catch (e) { console.warn('[낚시] 불러오기 실패', e); }
        }
        const local = readLocal();
        const pick = (remote && local) ? ((local.ts || 0) > (remote.ts || 0) ? local : remote) : (remote || local);
        if (pick) data = Object.assign({ rod: 0, n: {}, big: {}, total: 0, ts: 0 }, pick);
    }

    function persist(now) {
        data.ts = Date.now();
        writeLocal();
        clearTimeout(saveTimer);
        const run = () => {
            if (logged()) {
                db.collection('users').doc(myUid()).set({ fishData: data, fishTotal: data.total }, { merge: true }).catch(() => { });
            }
            try { if (typeof saveUserDataToFirestore === 'function') saveUserDataToFirestore(); } catch (e) { }
        };
        if (now) run(); else saveTimer = setTimeout(run, 1500);
    }

    function addCoin(d) {
        if (typeof userData === 'undefined') return;
        userData.coin = Math.max(0, (userData.coin || 0) + d);
        updateCoinLabel();
    }
    function updateCoinLabel() {
        const el = $('fs-coins');
        if (el) el.textContent = coin().toLocaleString();
        if (typeof updateTopMoney === 'function') updateTopMoney();
    }

    // ===== 낚시 진행 =====
    function clearTimers() { clearTimeout(waitTimer); clearTimeout(biteTimer); cancelAnimationFrame(raf); }

    function cast() {
        if (phase !== 'idle' && phase !== 'result') return;
        const bait = baitCost(data.rod);
        if (coin() < bait) { lastMsg = `미끼값 ${bait}원이 부족해요.`; renderFish(); return; }
        addCoin(-bait);
        persist();
        cur = rollFish(data.rod);
        lastMsg = '';
        const sc = $('fs-scene');
        const sw = (sc && sc.clientWidth) || 360;
        bobX = Math.round(Math.min(sw - 30, Math.max(200, sw * (0.58 + Math.random() * 0.14))));   // 매번 조금씩 다른 곳에 던짐
        phase = 'casting';
        renderFish();
        const sid = ++session;
        castAnim(sid, () => {
            if (sid !== session || phase !== 'casting') return;
            phase = 'waiting';
            splashOnce = true;
            sfx('splash');
            renderFish();
            splashOnce = false;
            waitTimer = setTimeout(() => {
                if (sid !== session || phase !== 'waiting') return;
                phase = 'bite';
                sfx('bite');
                try { if (navigator.vibrate) navigator.vibrate(120); } catch (e) { }
                renderFish();
                biteTimer = setTimeout(() => {
                    if (sid !== session || phase !== 'bite') return;
                    fail('입질을 놓쳤어요… 물고기가 도망갔어요.');
                }, reactionMs(data.rod));
            }, 1500 + Math.random() * 3200);
        });
    }

    function startReel() {
        clearTimeout(biteTimer);
        const w = zoneWidth(cur.fish.t, data.rod);
        const center = w / 2 + 0.05 + Math.random() * (1 - w - 0.1);
        zone = { w, c: center };
        phase = 'reel';
        markerT0 = performance.now();
        renderFish();
        const tick = () => {
            if (phase !== 'reel') return;
            const m = $('fs-marker');
            if (m) m.style.left = (markerPos() * 100) + '%';
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
    }
    function markerPos() {
        const t = (performance.now() - markerT0) / 1000 * markerSpeed(cur.fish.t);
        const x = t % 2;
        return x < 1 ? x : 2 - x;
    }

    function judgeReel() {
        const pos = markerPos();
        cancelAnimationFrame(raf);
        if (Math.abs(pos - zone.c) <= zone.w / 2) success(); else fail('타이밍이 어긋났어요! 물고기가 빠져나갔어요.');
    }

    function success() {
        const { fish, size, price } = cur;
        phase = 'result';
        addCoin(price);
        data.n[fish.id] = (data.n[fish.id] || 0) + 1;
        if (size > (data.big[fish.id] || 0)) data.big[fish.id] = size;
        if (fish.t > 0) data.total += 1;
        persist();
        cur.done = true;
        sfx('catch', fish.t);   // 빠라밤~
        renderFish();
    }
    function fail(msg) {
        sfx('miss');
        phase = 'idle';
        cur = null;
        lastMsg = msg;
        renderFish();
    }

    function onAction() {
        if (phase === 'idle' || phase === 'result') cast();
        else if (phase === 'waiting') { session++; clearTimers(); fail('너무 일찍 당겼어요! 물고기가 놀라 도망갔어요.'); }
        else if (phase === 'bite') startReel();
        else if (phase === 'reel') judgeReel();
    }

    // ===== 낚시 장면 (SVG) =====
    // 배경(하늘/구름/바다/나무 부두/낚시꾼)은 #fs-bg 에 한 번만 그리고, 움직이는 낚싯대·줄·찌는 #fs-svg 에 매 프레임 그려요.
    const WATER_Y = 152, HANDLE = { x: 88, y: 112 }, ROD_LEN = 100;
    function rodTip(a) { const r = a * Math.PI / 180; return { x: HANDLE.x + ROD_LEN * Math.sin(r), y: HANDLE.y - ROD_LEN * Math.cos(r) }; }

    function waveLine(y, op) {
        let d = `M-40 ${y}`;
        for (let i = 0; i < 14; i++) d += ` q10 -4 20 0 t20 0`;
        return `<path d="${d}" fill="none" stroke="rgba(255,255,255,${op})" stroke-width="1.6"><animateTransform attributeName="transform" type="translate" values="0 0;-40 0" dur="${y % 2 ? 7 : 9}s" repeatCount="indefinite"/></path>`;
    }
    function cloud(x, y, sc, dur, dx) {
        return `<g opacity=".95"><animateTransform attributeName="transform" type="translate" values="0 0;${dx} 0;0 0" dur="${dur}s" repeatCount="indefinite"/>
            <g transform="translate(${x} ${y}) scale(${sc})" fill="#fff"><ellipse cx="0" cy="0" rx="26" ry="10"/><ellipse cx="-14" cy="-6" rx="14" ry="10"/><ellipse cx="8" cy="-10" rx="16" ry="12"/></g></g>`;
    }
    function bgMarkup() {
        let planks = '';
        for (let x = 22; x < 164; x += 22) planks += `<line x1="${x}" y1="136" x2="${x}" y2="146" stroke="#8a5a2c" stroke-width="1.3"/>`;
        return `
        <defs>
            <linearGradient id="fsSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fa9f5"/><stop offset="1" stop-color="#d4f0ff"/></linearGradient>
            <linearGradient id="fsWater" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3bb6ee"/><stop offset="1" stop-color="#0a4f86"/></linearGradient>
            <radialGradient id="fsSun"><stop offset="0" stop-color="#fff8c4" stop-opacity=".95"/><stop offset="1" stop-color="#fff8c4" stop-opacity="0"/></radialGradient>
        </defs>
        <rect width="100%" height="${WATER_Y + 2}" fill="url(#fsSky)"/>
        <circle cx="85%" cy="40" r="46" fill="url(#fsSun)"/><circle cx="85%" cy="40" r="15" fill="#fff6b0"/>
        ${cloud(70, 34, 1.1, 40, 60)}${cloud(250, 58, 0.8, 55, -70)}${cloud(380, 24, 0.9, 48, -50)}
        <path d="M0 ${WATER_Y} Q60 112 130 134 T270 122 T420 136 T600 120 L600 ${WATER_Y} Z" fill="#a9dcc6"/>
        <path d="M0 ${WATER_Y} Q80 128 170 142 T340 132 T600 140 L600 ${WATER_Y} Z" fill="#79c48e"/>
        <rect y="${WATER_Y}" width="100%" height="120" fill="url(#fsWater)"/>
        <rect y="${WATER_Y}" width="100%" height="2" fill="rgba(255,255,255,0.6)"/>
        ${waveLine(168, 0.25)}${waveLine(196, 0.18)}${waveLine(220, 0.12)}
        <rect x="14" y="146" width="9" height="100" fill="#6b4423"/><rect x="74" y="146" width="9" height="100" fill="#6b4423"/><rect x="132" y="146" width="9" height="100" fill="#6b4423"/>
        <rect x="0" y="${WATER_Y}" width="176" height="100" fill="rgba(6,100,160,0.38)"/>
        <rect x="0" y="136" width="164" height="12" rx="2" fill="#b07a42"/><rect x="0" y="146" width="164" height="4" fill="#7a4f27"/>${planks}
        <rect x="6" y="106" width="6" height="30" rx="2" fill="#8a5a2c"/><rect x="36" y="106" width="6" height="30" rx="2" fill="#8a5a2c"/>
        <line x1="9" y1="112" x2="39" y2="112" stroke="#8a5a2c" stroke-width="4" stroke-linecap="round"/><line x1="9" y1="124" x2="39" y2="124" stroke="#8a5a2c" stroke-width="3" stroke-linecap="round"/>
        <rect x="152" y="118" width="9" height="18" rx="2" fill="#8a5a2c"/><rect x="150" y="115" width="13" height="5" rx="2" fill="#a16c3a"/>
        <polygon points="104,122 124,122 121,136 107,136" fill="#94a3b8"/><path d="M106 122 Q114 108 122 122" fill="none" stroke="#64748b" stroke-width="2"/>
        <rect x="57" y="118" width="8" height="19" rx="2" fill="#475569"/><rect x="67" y="118" width="8" height="19" rx="2" fill="#475569"/>
        <rect x="53" y="91" width="26" height="31" rx="7" fill="#ef6c4d"/>
        <circle cx="66" cy="79" r="11" fill="#f5cfa0"/><circle cx="71" cy="80" r="1.6" fill="#2b2b2b"/>
        <path d="M63 86 Q67 89 71 86" fill="none" stroke="#b9714a" stroke-width="1.3" stroke-linecap="round"/>
        <ellipse cx="66" cy="70" rx="19" ry="5" fill="#e7c36a"/><path d="M53 70 Q66 50 79 70 Z" fill="#f0d27f"/><rect x="54" y="66" width="24" height="3" fill="#d1495b"/>
        <line x1="73" y1="98" x2="${HANDLE.x}" y2="${HANDLE.y}" stroke="#ef6c4d" stroke-width="8" stroke-linecap="round"/>
        <circle cx="${HANDLE.x}" cy="${HANDLE.y}" r="4.5" fill="#f5cfa0"/>`;
    }

    // opt: { ang, bob:{x,y}|null, mode: idle|cast|wait|bite|reel, splash }  (움직이는 부분만)
    function sceneInner(opt) {
        const tip = rodTip(opt.ang);
        const mode = opt.mode;
        let g = '';
        if (opt.bob) {
            const bx = opt.bob.x, by = opt.bob.y;
            const sag = mode === 'reel' ? 2 : mode === 'cast' ? 10 : 18;
            g += `<path d="M${tip.x.toFixed(1)} ${tip.y.toFixed(1)} Q${((tip.x + bx) / 2).toFixed(1)} ${(((tip.y + by) / 2) + sag).toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}" stroke="rgba(255,255,255,0.9)" stroke-width="1.2" fill="none"/>`;
        }
        const shake = mode === 'reel' ? `<animateTransform attributeName="transform" type="rotate" values="-2.5 ${HANDLE.x} ${HANDLE.y};2.5 ${HANDLE.x} ${HANDLE.y};-2.5 ${HANDLE.x} ${HANDLE.y}" dur=".16s" repeatCount="indefinite"/>` : '';
        g += `<g>${shake}
            <line x1="${HANDLE.x}" y1="${HANDLE.y}" x2="${tip.x.toFixed(1)}" y2="${tip.y.toFixed(1)}" stroke="#6b4423" stroke-width="4.5" stroke-linecap="round"/>
            <line x1="${HANDLE.x}" y1="${HANDLE.y}" x2="${(HANDLE.x + (tip.x - HANDLE.x) * 0.28).toFixed(1)}" y2="${(HANDLE.y + (tip.y - HANDLE.y) * 0.28).toFixed(1)}" stroke="#2b1d12" stroke-width="6.5" stroke-linecap="round"/>
            <circle cx="${(HANDLE.x + (tip.x - HANDLE.x) * 0.2 + 6).toFixed(1)}" cy="${(HANDLE.y + (tip.y - HANDLE.y) * 0.2).toFixed(1)}" r="5" fill="#cbd5e1" stroke="#475569" stroke-width="2"/></g>`;
        g += `<circle cx="${HANDLE.x}" cy="${HANDLE.y}" r="4.5" fill="#f5cfa0"/>`;
        if (!opt.bob) return g;

        const bx = opt.bob.x, by = opt.bob.y;
        if (mode === 'cast') {
            g += bobber(bx, by);
        } else if (mode === 'wait' || mode === 'bite') {
            const dip = mode === 'bite' ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 9;0 -2;0 9;0 0" dur=".35s" repeatCount="indefinite"/>`
                : `<animateTransform attributeName="transform" type="translate" values="0 0;0 3;0 0" dur="1.8s" repeatCount="indefinite"/>`;
            const rd = mode === 'bite' ? '.7s' : '2.2s';
            g += `<ellipse cx="${bx}" cy="${WATER_Y + 3}" rx="4" ry="1.5" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="1.2">
                    <animate attributeName="rx" values="4;26" dur="${rd}" repeatCount="indefinite"/>
                    <animate attributeName="ry" values="1.5;7" dur="${rd}" repeatCount="indefinite"/>
                    <animate attributeName="opacity" values="1;0" dur="${rd}" repeatCount="indefinite"/></ellipse>`;
            if (opt.splash) {
                g += `<ellipse cx="${bx}" cy="${WATER_Y + 3}" rx="6" ry="2" fill="rgba(255,255,255,0.45)">
                        <animate attributeName="rx" values="6;34" dur=".55s" fill="freeze"/><animate attributeName="ry" values="2;9" dur=".55s" fill="freeze"/>
                        <animate attributeName="opacity" values=".8;0" dur=".55s" fill="freeze"/></ellipse>`;
                [-14, -5, 6, 15].forEach((dx, i) => {
                    g += `<circle cx="${bx + dx}" cy="${WATER_Y - 2}" r="2.2" fill="#e0f2fe">
                        <animate attributeName="cy" values="${WATER_Y - 2};${WATER_Y - 28 - i * 3};${WATER_Y}" dur=".55s" fill="freeze"/>
                        <animate attributeName="opacity" values="1;1;0" dur=".55s" fill="freeze"/></circle>`;
                });
            }
            g += `<g>${dip}${bobber(bx, by)}</g>`;
            if (mode === 'bite') g += `<text x="${bx}" y="${by - 30}" text-anchor="middle" font-size="34" font-weight="900" fill="#ff5a5f">❗<animateTransform attributeName="transform" type="translate" values="0 0;0 -5;0 0" dur=".3s" repeatCount="indefinite"/></text>`;
        } else if (mode === 'reel') {
            g += `<text x="${bx}" y="${by + 6}" text-anchor="middle" font-size="30" opacity=".6">🐟
                    <animateTransform attributeName="transform" type="translate" values="-10 0;10 4;-10 0" dur=".4s" repeatCount="indefinite"/></text>`;
        }
        return g;
    }
    function bobber(x, y) {
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="#fff"/><path d="M${(x - 7).toFixed(1)} ${y.toFixed(1)} A7 7 0 0 1 ${(x + 7).toFixed(1)} ${y.toFixed(1)} Z" fill="#ef4444"/>`;
    }
    const restBob = () => ({ x: bobX, y: WATER_Y - 2 });

    // 던지기 연출: 뒤로 젖히기(0~0.3초) → 휘두르기(~0.48초) → 찌가 포물선으로 날아가 입수(1초)
    function castAnim(sid, done) {
        const svg = $('fs-svg');
        if (!svg) { done(); return; }
        const T = 1000, t0 = performance.now(), tx = bobX, ty = WATER_Y - 2;
        let whooshed = false;
        const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
        let rel = null;
        const frame = (now) => {
            if (sid !== session || phase !== 'casting' || !$('fs-svg')) return;
            const t = now - t0;
            if (!whooshed && t >= 300) { whooshed = true; sfx('whoosh'); }   // 휘두를 때 휙~
            let ang;
            if (t < 300) ang = 28 + (-50 - 28) * ease(t / 300);
            else if (t < 480) ang = -50 + 110 * ease((t - 300) / 180);
            else ang = 60 + (34 - 60) * ease(Math.min(1, (t - 480) / 520));
            const tip = rodTip(ang);
            let bob;
            if (t < 420) { bob = { x: tip.x, y: tip.y + 22 }; }
            else {
                if (!rel) rel = { x: tip.x, y: tip.y };
                const u = Math.min(1, (t - 420) / (T - 420));
                bob = { x: rel.x + (tx - rel.x) * u, y: rel.y + (ty - rel.y) * u - 80 * Math.sin(Math.PI * u) };
            }
            svg.innerHTML = sceneInner({ ang, bob, mode: 'cast' });
            if (t < T) raf = requestAnimationFrame(frame); else done();
        };
        raf = requestAnimationFrame(frame);
    }

    // ===== 화면 =====
    function injectStyle() {
        if (document.getElementById('fishing-style')) return;
        const st = document.createElement('style');
        st.id = 'fishing-style';
        st.textContent = `
        .fs-overlay { position: fixed; inset: 0; z-index: 3000; background: rgba(0,0,0,0.9); display: flex; flex-direction: column; align-items: center; padding: 10px; box-sizing: border-box; color: #fff; }
        .fs-top { width: min(100%, 440px); display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 14px; font-weight: bold; flex: 0 0 auto; }
        .fs-btn-top { background: rgba(255,255,255,0.15); color: #fff; border: none; border-radius: 8px; padding: 6px 12px; font-size: 14px; cursor: pointer; }
        .fs-tabs { width: min(100%, 440px); display: flex; gap: 6px; margin-bottom: 8px; flex: 0 0 auto; }
        .fs-tab { flex: 1; padding: 9px 0; border: none; border-radius: 8px; font-weight: bold; font-size: 13px; color: #fff; background: rgba(255,255,255,0.12); cursor: pointer; }
        .fs-tab.on { background: var(--accent-color, #6c63ff); }
        .fs-body { flex: 1 1 auto; width: min(100%, 440px); min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; }
        .fs-scene { position: relative; height: 230px; border-radius: 14px; overflow: hidden; background: #3fa9f5; margin-bottom: 10px; }
        .fs-layer { position: absolute; inset: 0; width: 100%; height: 100%; }
        #fs-ov { pointer-events: none; }
        .fs-rodemoji { position: absolute; left: 14px; top: 8px; font-size: 46px; transform: rotate(-20deg); }
        .fs-bobber { position: absolute; left: 62%; top: 38%; font-size: 26px; transform: translate(-50%, -50%); }
        .fs-bobber.wait { animation: fsBob 1.6s ease-in-out infinite; }
        .fs-bobber.bite { animation: fsBite .25s linear infinite; }
        .fs-exc { position: absolute; left: 62%; top: 8%; font-size: 40px; font-weight: 900; color: #ff5a5f; transform: translateX(-50%); animation: fsBite .25s linear infinite; }
        .fs-result { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; background: rgba(0,0,0,0.35); }
        .fs-result .big { font-size: 64px; animation: fsPop .4s ease-out; }
        @keyframes fsBob { 0%,100% { transform: translate(-50%, -50%); } 50% { transform: translate(-50%, -30%); } }
        @keyframes fsBite { 0%,100% { transform: translate(-50%, -50%); } 25% { transform: translate(-56%, -35%); } 75% { transform: translate(-44%, -62%); } }
        @keyframes fsPop { 0% { transform: scale(.3); } 70% { transform: scale(1.2); } 100% { transform: scale(1); } }
        .fs-status { text-align: center; min-height: 40px; font-size: 14px; line-height: 1.5; margin-bottom: 8px; }
        .fs-bar { position: relative; height: 34px; border-radius: 17px; background: rgba(255,255,255,0.14); margin-bottom: 10px; overflow: hidden; }
        .fs-zone { position: absolute; top: 0; bottom: 0; background: rgba(74,222,128,0.7); }
        .fs-marker { position: absolute; top: 2px; bottom: 2px; width: 6px; margin-left: -3px; border-radius: 3px; background: #fff; box-shadow: 0 0 8px #fff; }
        .fs-act { width: 100%; padding: 16px; border: none; border-radius: 12px; font-size: 17px; font-weight: bold; color: #fff; background: var(--accent-color, #6c63ff); cursor: pointer; }
        .fs-act.alert { background: #e5484d; }
        .fs-act:disabled { opacity: .45; }
        .fs-card { background: rgba(255,255,255,0.07); border-radius: 12px; padding: 12px; margin-bottom: 8px; }
        .fs-dex { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .fs-dexi { background: rgba(255,255,255,0.07); border-radius: 10px; padding: 8px 4px; text-align: center; font-size: 11px; line-height: 1.4; }
        .fs-dexi .e { font-size: 28px; }
        .fs-dexi.no { opacity: .35; filter: grayscale(1); }
        .fs-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-radius: 8px; background: rgba(255,255,255,0.08); margin-bottom: 6px; font-size: 14px; gap: 8px; }
        .fs-buy { flex: 0 0 auto; border: none; border-radius: 8px; padding: 8px 12px; font-weight: bold; color: #fff; background: var(--accent-color, #6c63ff); cursor: pointer; }
        .fs-buy:disabled { opacity: .4; }
        .fs-note { font-size: 12px; opacity: .7; line-height: 1.5; }
        .fs-sechead { display: flex; justify-content: space-between; align-items: baseline; margin: 14px 2px 4px; font-weight: bold; font-size: 14px; }
        .fs-sechead small { font-weight: normal; opacity: .7; font-size: 11px; }
        .fs-pbar { height: 5px; border-radius: 3px; background: rgba(255,255,255,0.12); overflow: hidden; margin-bottom: 8px; }
        .fs-pbar > div { height: 100%; border-radius: 3px; }
        .fs-dexi { cursor: pointer; border: 2px solid transparent; }
        .fs-dexi.sel { border-color: #fff; }
        .fs-detail { border-radius: 14px; padding: 14px; margin-bottom: 10px; background: rgba(255,255,255,0.09); border: 2px solid; text-align: center; }
        .fs-detail .e { font-size: 56px; line-height: 1.1; }
        .fs-detail .desc { font-size: 13px; opacity: .85; margin: 6px 0 10px; line-height: 1.5; }
        .fs-detail .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; text-align: left; font-size: 12px; }
        .fs-detail .grid div { background: rgba(0,0,0,0.25); border-radius: 8px; padding: 7px 9px; }
        .fs-detail .grid b { display: block; font-size: 14px; margin-top: 2px; }`;
        document.head.appendChild(st);
    }

    function build() {
        injectStyle();
        overlay = document.createElement('div');
        overlay.className = 'fs-overlay';
        overlay.innerHTML = `
            <div class="fs-top">
                <span><i class="fa-solid fa-fish" style="color:#14b8a6;"></i> 낚시왕</span>
                <span>🪙 <span id="fs-coins">0</span>원 &nbsp; <button class="fs-btn-top" id="fs-bgm">🔊</button> <button class="fs-btn-top" id="fs-close">닫기</button></span>
            </div>
            <div class="fs-tabs">
                <button class="fs-tab on" data-tab="fish">🎣 낚시</button>
                <button class="fs-tab" data-tab="dex">📖 도감</button>
                <button class="fs-tab" data-tab="shop">🛒 낚싯대</button>
                <button class="fs-tab" data-tab="rank">🏆 랭킹</button>
            </div>
            <div class="fs-body" id="fs-body"></div>`;
        document.body.appendChild(overlay);
        body = $('fs-body');
        $('fs-close').addEventListener('click', close);
        if (window.GameBGM) { GameBGM.bindButton($('fs-bgm')); GameBGM.prime(); GameBGM.play('fishing'); }   // 잔잔한 낚시 BGM
        else { const b = $('fs-bgm'); if (b) b.style.display = 'none'; }
        overlay.querySelectorAll('.fs-tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
    }

    function setTab(t) {
        if (t === 'rank' && typeof requireOnline === 'function' && !requireOnline('랭킹')) return;
        if (tab === 'fish' && t !== 'fish' && (phase === 'casting' || phase === 'waiting' || phase === 'bite' || phase === 'reel')) {
            session++; clearTimers(); phase = 'idle'; cur = null; lastMsg = '낚시를 중단했어요. (미끼는 돌려받을 수 없어요)';
        }
        tab = t;
        overlay.querySelectorAll('.fs-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
        ({ fish: renderFish, dex: renderDex, shop: renderShop, rank: renderRank })[t]();
    }

    function ensureSkeleton() {
        if ($('fs-scene')) return;
        body.innerHTML = `
            <div class="fs-scene" id="fs-scene">
                <svg id="fs-bg" class="fs-layer">${bgMarkup()}</svg>
                <svg id="fs-svg" class="fs-layer"></svg>
                <div id="fs-ov" class="fs-layer"></div>
            </div>
            <div class="fs-status" id="fs-status"></div>
            <div id="fs-barwrap"></div>
            <div id="fs-actwrap"></div>
            <div class="fs-note" id="fs-foot" style="margin-top:10px; text-align:center;"></div>`;
    }

    function renderFish() {
        if (!body || tab !== 'fish') return;
        ensureSkeleton();
        const rod = RODS[data.rod];
        let svg = '', overlayHtml = '', status = '', act = '', bar = '';
        if (phase === 'idle') {
            svg = sceneInner({ ang: 28, bob: null, mode: 'idle' });
            status = lastMsg || `미끼 ${baitCost(data.rod)}원을 달고 낚싯대를 던져보세요!`;
            act = `<button class="fs-act" id="fs-act">🎣 던지기 (-${baitCost(data.rod)}원)</button>`;
        } else if (phase === 'casting') {
            svg = sceneInner({ ang: 28, bob: null, mode: 'idle' });
            status = '낚싯대를 힘차게 던지는 중...';
            act = `<button class="fs-act" id="fs-act" style="background:#475569;" disabled>던지는 중...</button>`;
        } else if (phase === 'waiting') {
            svg = sceneInner({ ang: 34, bob: restBob(), mode: 'wait', splash: splashOnce });
            status = '입질을 기다리는 중... (일찍 당기면 도망가요)';
            act = `<button class="fs-act" id="fs-act" style="background:#475569;">기다리는 중...</button>`;
        } else if (phase === 'bite') {
            svg = sceneInner({ ang: 30, bob: restBob(), mode: 'bite' });
            status = '<b style="color:#ff5a5f; font-size:18px;">입질이다! 지금 당겨!</b>';
            act = `<button class="fs-act alert" id="fs-act">당기기!</button>`;
        } else if (phase === 'reel') {
            svg = sceneInner({ ang: 18, bob: { x: bobX, y: WATER_Y + 32 }, mode: 'reel' });
            status = `하얀 막대가 <b style="color:#4ade80;">초록 구간</b>에 있을 때 탭!`;
            bar = `<div class="fs-bar"><div class="fs-zone" style="left:${(zone.c - zone.w / 2) * 100}%; width:${zone.w * 100}%;"></div><div class="fs-marker" id="fs-marker"></div></div>`;
            act = `<button class="fs-act" id="fs-act">탭!</button>`;
        } else {   // result
            const { fish, size, price } = cur;
            const isNew = data.n[fish.id] === 1;
            svg = sceneInner({ ang: 28, bob: null, mode: 'idle' });
            overlayHtml = `<div class="fs-result"><div class="big">${fish.e}</div>
                <div style="font-size:18px; font-weight:bold; margin-top:6px;">${esc(fish.name)}</div>
                <div style="font-size:12px; color:${TIER_COLOR[fish.t]}; font-weight:bold;">${TIER_LABEL[fish.t]} · ${fmt(size)}cm</div>
                <div style="font-size:16px; margin-top:6px; color:#fbbf24;">+${fmt(price)}원 ${isNew ? '<span style="color:#4ade80;">✨NEW</span>' : ''}</div></div>`;
            status = fish.t >= 6 ? '🌌 신화급 어종을 낚았어요!!!' : fish.t >= 4 ? '🎉 대어를 낚았어요!!' : '낚시 성공!';
            act = `<button class="fs-act" id="fs-act">🎣 다시 던지기 (-${baitCost(data.rod)}원)</button>`;
        }
        $('fs-svg').innerHTML = svg;
        $('fs-ov').innerHTML = overlayHtml;
        $('fs-status').innerHTML = status;
        $('fs-barwrap').innerHTML = bar;
        $('fs-actwrap').innerHTML = act;
        $('fs-foot').textContent = `${rod.name} · 잡은 물고기 ${fmt(data.total)}마리`;
        const b = $('fs-act');
        if (b) b.addEventListener('pointerdown', (e) => { e.preventDefault(); onAction(); });
    }

    function renderDex() {
        const owned = FISH.filter(f => data.n[f.id]).length;
        const w = weightsFor(data.rod), tot = w.reduce((x, y) => x + y, 0);
        const pctAll = Math.round(owned / FISH.length * 100);
        const rateStr = (r) => (r < 0.1 ? r.toFixed(3) : r < 1 ? r.toFixed(2) : r.toFixed(1)) + '%';

        let detail = '';
        const sf = FISH.find(f => f.id === dexSel);
        if (sf) {
            const n = data.n[sf.id] || 0, col = TIER_COLOR[sf.t];
            detail = n ? `<div class="fs-detail" style="border-color:${col};">
                    <div class="e">${sf.e}</div>
                    <div style="font-size:18px; font-weight:bold;">${esc(sf.name)}</div>
                    <div style="font-size:12px; color:${col}; font-weight:bold;">${TIER_LABEL[sf.t]} 등급</div>
                    <div class="desc">${esc(DESC[sf.id] || '')}</div>
                    <div class="grid">
                        <div>크기 범위<b>${fmt(sf.smin)}~${fmt(sf.smax)}cm</b></div>
                        <div>정산가 범위<b>${fmt(sf.pmin)}~${fmt(sf.pmax)}원</b></div>
                        <div>낚은 횟수<b>${fmt(n)}마리</b></div>
                        <div>내 최대 크기<b>${fmt(data.big[sf.id] || 0)}cm</b></div>
                    </div></div>`
                : `<div class="fs-detail" style="border-color:${col};">
                    <div class="e">❔</div><div style="font-size:18px; font-weight:bold;">???</div>
                    <div style="font-size:12px; color:${col}; font-weight:bold;">${TIER_LABEL[sf.t]} 등급</div>
                    <div class="desc">아직 만나보지 못한 물고기예요.<br>계속 낚시해서 도감을 채워보세요!</div></div>`;
        }

        const sections = TIER_LABEL.map((label, t) => {
            const list = FISH.filter(f => f.t === t);
            if (!list.length) return '';
            const got = list.filter(f => data.n[f.id]).length, col = TIER_COLOR[t];
            const items = list.map(f => {
                const n = data.n[f.id] || 0, sel = dexSel === f.id ? ' sel' : '';
                return n ? `<div class="fs-dexi${sel}" data-dex="${f.id}"><div class="e">${f.e}</div><b>${esc(f.name)}</b><br>${fmt(n)}마리 · 최대 ${fmt(data.big[f.id] || 0)}cm</div>`
                    : `<div class="fs-dexi no${sel}" data-dex="${f.id}"><div class="e">❔</div><b>???</b></div>`;
            }).join('');
            return `<div class="fs-sechead"><span style="color:${col};">${label}</span><small>${got}/${list.length} · 현재 낚싯대 출현율 ${rateStr(w[t] / tot * 100)}</small></div>
                <div class="fs-pbar"><div style="width:${got / list.length * 100}%; background:${col};"></div></div>
                <div class="fs-dex">${items}</div>`;
        }).join('');

        body.innerHTML = `<div class="fs-card"><b>📖 물고기 도감</b> <span class="fs-note">${owned} / ${FISH.length}종 수집 (${pctAll}%)</span>
            <div class="fs-pbar" style="margin:8px 0 0;"><div style="width:${pctAll}%; background:linear-gradient(90deg,#4ade80,#38bdf8,#c084fc,#fbbf24,#ff4d8d);"></div></div>
            <div class="fs-note" style="margin-top:6px;">낮은 등급부터 신화까지! 물고기를 눌러 자세히 볼 수 있어요.</div></div>
            ${detail}${sections}`;
        body.querySelectorAll('[data-dex]').forEach(el => el.addEventListener('click', () => {
            dexSel = (dexSel === el.dataset.dex) ? null : el.dataset.dex;
            const y = body.scrollTop;
            renderDex();
            body.scrollTop = y;
        }));
    }

    function renderShop() {
        const rows = RODS.map((r, i) => {
            const has = data.rod >= i, next = data.rod + 1 === i;
            const w = weightsFor(i), tot = w.reduce((a, b) => a + b, 0);
            const good = ((w[3] + w[4] + w[5] + w[6]) / tot * 100).toFixed(1);
            const btn = has ? `<span class="fs-note">${data.rod === i ? '사용 중' : '보유'}</span>`
                : next ? `<button class="fs-buy" data-buy="${i}" ${coin() >= r.cost ? '' : 'disabled'}>${fmt(r.cost)}원</button>`
                    : `<span class="fs-note">이전 단계 필요</span>`;
            return `<div class="fs-row"><div><b>${esc(r.name)}</b><div class="fs-note">희귀 이상 ${good}% · 입질 반응 ${(reactionMs(i) / 1000).toFixed(2)}초</div></div>${btn}</div>`;
        }).join('');
        body.innerHTML = `<div class="fs-card"><b>🛒 낚싯대 업그레이드</b><div class="fs-note" style="margin-top:4px;">좋은 낚싯대일수록 귀한 물고기가 더 잘 낚이고, 입질에 반응할 시간과 초록 구간이 넓어져요.</div></div>${rows}`;
        body.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => {
            const i = parseInt(b.dataset.buy, 10), r = RODS[i];
            if (data.rod + 1 !== i || coin() < r.cost) return;
            addCoin(-r.cost);
            data.rod = i;
            persist(true);
            renderShop();
        }));
    }

    async function renderRank() {
        body.innerHTML = `<div class="fs-card"><b>🏆 낚은 물고기 수 TOP 20</b><div id="fs-rk" style="margin-top:8px;"><div class="fs-row">불러오는 중...</div></div><div class="fs-note">잡동사니는 집계되지 않아요.</div></div>`;
        try {
            const snap = await db.collection('users').orderBy('fishTotal', 'desc').limit(20).get();
            if (tab !== 'rank' || !$('fs-rk')) return;
            const rows = [];
            let i = 0;
            snap.forEach(doc => {
                const d = doc.data();
                if (!((d.fishTotal || 0) > 0)) return;
                i += 1;
                const medal = i === 1 ? '🥇' : i === 2 ? '🥈' : i === 3 ? '🥉' : `${i}.`;
                const me = doc.id === myUid() ? ' style="outline:2px solid var(--accent-color,#6c63ff);"' : '';
                rows.push(`<div class="fs-row"${me}><span>${medal} ${esc(d.name || '이름없음')}</span><b>${fmt(d.fishTotal)}마리</b></div>`);
            });
            $('fs-rk').innerHTML = rows.length ? rows.join('') : '<div class="fs-row">아직 기록이 없어요!</div>';
        } catch (e) {
            console.error('[낚시] 랭킹 오류', e);
            if ($('fs-rk')) $('fs-rk').innerHTML = '<div class="fs-row">랭킹을 불러오지 못했어요.</div>';
        }
    }

    // ===== 열기 / 닫기 =====
    async function open() {
        if (overlay) return;
        dexSel = null;
        tab = 'fish'; phase = 'idle'; cur = null; lastMsg = '';
        build();
        updateCoinLabel();
        body.innerHTML = '<div class="fs-card">불러오는 중...</div>';
        await loadData();
        if (!overlay) return;
        renderFish();
    }

    function close() {
        session++;
        clearTimers();
        if (window.GameBGM) GameBGM.stop();
        if (saveTimer) persist(true);
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = body = null;
        phase = 'idle';
    }

    window.FishingUI = { open, close, _test: { rollFish, weightsFor, FISH, RODS, baitCost } };
})();
