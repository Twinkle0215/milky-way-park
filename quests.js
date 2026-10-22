// ===== quests.js =====
// 퀘스트: 출석체크 / 일일 퀘스트 / 주간 퀘스트 (보상은 전부 '원')
//
//  - 기준 시간은 한국 시간(KST). 일일은 매일 00:00, 주간은 매주 월요일 00:00에 초기화
//  - 진행도/수령 기록은 users/{uid} 문서의 quests 필드에 저장 (코인은 기존 saveUserDataToFirestore로 저장)
//  - 다른 게임에서는 Quests.track('이벤트이름', 개수) 만 호출하면 됨
//
//  이벤트: play(게임 1판 끝) · win(게임 승리) · wordchainPlay · flappyPillars(기둥 통과 수)
//          flappyOnlineWin · tetrisLines(지운 줄 수) · tetrisOnlineWin · lottoBuy(구매 장수) · lottoCheck · attendDays(출석, 내부 사용)

(function () {
    // ===== 설정 =====
    const DAILY = [
        { id: 'd_play',    icon: 'fa-gamepad',       title: '게임 3판 플레이',        desc: '게임 카테고리의 게임을 3판 끝내기',      ev: 'play',          target: 3,  reward: 300 },
        { id: 'd_word',    icon: 'fa-comment-dots',  title: '끝말잇기 한 판',          desc: '끝말잇기를 한 판 끝내기',               ev: 'wordchainPlay', target: 1,  reward: 200 },
        { id: 'd_flappy',  icon: 'fa-dove',          title: '플라피 버드 기둥 10개',   desc: '플라피 버드에서 가시 기둥 10개 통과',    ev: 'flappyPillars', target: 10, reward: 300 },
        { id: 'd_tetris',  icon: 'fa-cubes',        title: '테트리스 20줄',           desc: '테트리스에서 줄 20개 지우기',            ev: 'tetrisLines',     target: 20,  reward: 300 },
        { id: 'd_win',     icon: 'fa-trophy',        title: '게임 승리 1회',           desc: '아무 게임에서 1번 승리하기',            ev: 'win',           target: 1,  reward: 500 },
        { id: 'd_lotto',   icon: 'fa-ticket',        title: '로또 1장 구매',           desc: '은하수 로또를 1장 이상 구매하기',       ev: 'lottoBuy',      target: 1,  reward: 300 },
        { id: 'd_lcheck',  icon: 'fa-clipboard-check', title: '로또 당첨 확인',        desc: '내 로또함에서 당첨 확인하기',           ev: 'lottoCheck',    target: 1,  reward: 200 }
    ];
    const WEEKLY = [
        { id: 'w_play',    icon: 'fa-gamepad',       title: '게임 20판 플레이',        desc: '이번 주에 게임 20판 끝내기',            ev: 'play',            target: 20,  reward: 2000 },
        { id: 'w_win',     icon: 'fa-trophy',        title: '게임 승리 5회',           desc: '이번 주에 게임 5번 승리하기',           ev: 'win',             target: 5,   reward: 3000 },
        { id: 'w_flappy',  icon: 'fa-dove',          title: '플라피 버드 기둥 100개',  desc: '이번 주에 기둥 100개 통과(누적)',       ev: 'flappyPillars',   target: 100, reward: 3000 },
        { id: 'w_tetris',  icon: 'fa-cubes',         title: '테트리스 200줄',          desc: '이번 주에 테트리스 줄 200개 지우기(누적)', ev: 'tetrisLines',     target: 200, reward: 3000 },
        { id: 'w_online',  icon: 'fa-users',         title: '플라피 온라인 대결 3승',  desc: '플라피 버드 온라인 대결에서 3번 승리',  ev: 'flappyOnlineWin', target: 3,   reward: 4000 },
        { id: 'w_tonline', icon: 'fa-users',         title: '테트리스 온라인 3승',     desc: '테트리스 온라인 대결에서 3번 승리',      ev: 'tetrisOnlineWin', target: 3,   reward: 4000 },
        { id: 'w_lotto',   icon: 'fa-ticket',        title: '로또 10장 구매',          desc: '이번 주에 로또 10장 구매(누적)',        ev: 'lottoBuy',        target: 10,  reward: 2000 },
        { id: 'w_attend',  icon: 'fa-calendar-check', title: '이번 주 5일 출석',       desc: '이번 주에 5일 출석체크하기',            ev: 'attendDays',      target: 5,   reward: 3000 }
    ];
    const ALL_CLEAR = { daily: 500, weekly: 5000 };
    const ATT_REWARDS = [200, 200, 300, 300, 500, 500, 1500];          // 연속 출석 1~7일차 (8일차부터 다시 1일차)
    const ATT_MILESTONES = [[7, 1000], [14, 2000], [21, 3000], [28, 5000]];   // 이번 달 출석 일수 보너스

    // ===== 시간 (한국 시간) =====
    const KST = 9 * 3600 * 1000;
    // 기기 시계 대신 서버 시간 기준 (auth.js 의 getServerNow). 못 불러오면 기기 시간 사용
    const nowMs = () => (typeof getServerNow === 'function' ? getServerNow() : Date.now());
    const kst = (ms) => new Date((ms == null ? nowMs() : ms) + KST);
    const ymd = (d) => d.toISOString().slice(0, 10);
    const todayKey = () => ymd(kst());
    const yesterdayKey = () => ymd(kst(nowMs() - 86400000));
    function weekKey() {
        const d = kst();
        const back = (d.getUTCDay() + 6) % 7;                          // 월요일 시작
        return ymd(new Date(d.getTime() - back * 86400000));
    }
    function msToDailyReset() {
        const d = kst();
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - d.getTime();
    }
    function msToWeeklyReset() {
        const d = kst();
        let add = (8 - d.getUTCDay()) % 7;
        if (add === 0) add = 7;
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + add) - d.getTime();
    }
    function fmtLeft(ms) {
        const m = Math.max(0, Math.floor(ms / 60000));
        const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
        if (d > 0) return `${d}일 ${h}시간`;
        if (h > 0) return `${h}시간 ${mm}분`;
        return `${mm}분`;
    }

    // ===== 상태 =====
    let Q = null, trusted = false, loadedUid = null, loadingPromise = null, saveTimer = null;
    let pageEl = null, curTab = 'att', clockTimer = null;

    // 출석/퀘스트 "보상"은 서버 시간을 확인한 온라인 상태에서만 받을 수 있음 (오프라인에서 기기 시계를 바꿔 속이는 것 방지)
    // 진행도(몇 판 했는지 등)는 오프라인에서도 계속 쌓이고, 보상만 온라인에서 받으면 된다.
    const rewardsOk = async () => {
        await ensureLoaded();
        if (!trusted) { if (typeof showOfflineToast === 'function') showOfflineToast('퀘스트 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.'); return false; }
        if (typeof serverTimeOk !== 'undefined' && serverTimeOk) return true;
        if (typeof isOnline === 'function' && isOnline() && typeof waitServerTime === 'function') {
            await waitServerTime();   // 로그인 직후라 서버 시간 확인이 아직 진행 중일 수 있음
            if (serverTimeOk) return true;
        }
        if (typeof showOfflineToast === 'function') showOfflineToast('📴 출석/퀘스트 보상은 인터넷이 연결되어 있을 때만 받을 수 있어요. (진행도는 계속 쌓여요)');
        return false;
    };
    const logged = () => (typeof currentUser !== 'undefined' && currentUser && typeof db !== 'undefined');
    const fresh = () => ({
        day: todayKey(), week: weekKey(),
        daily: { p: {}, c: {}, all: false },
        weekly: { p: {}, c: {}, all: false },
        att: { last: '', streak: 0, best: 0, month: todayKey().slice(0, 7), days: [], ms: {} }
    });

    function normalize(raw) {
        const q = fresh();
        if (raw && typeof raw === 'object') {
            if (raw.daily) q.daily = { p: raw.daily.p || {}, c: raw.daily.c || {}, all: !!raw.daily.all };
            if (raw.weekly) q.weekly = { p: raw.weekly.p || {}, c: raw.weekly.c || {}, all: !!raw.weekly.all };
            if (raw.att) q.att = Object.assign(q.att, raw.att, { days: raw.att.days || [], ms: raw.att.ms || {} });
            q.day = raw.day || q.day;
            q.week = raw.week || q.week;
        }
        return q;
    }

    // 날짜가 바뀌었으면 초기화
    function rollover() {
        if (!Q) return;
        const t = todayKey(), w = weekKey();
        if (Q.day !== t) { Q.day = t; Q.daily = { p: {}, c: {}, all: false }; }
        if (Q.week !== w) { Q.week = w; Q.weekly = { p: {}, c: {}, all: false }; }
        const mo = t.slice(0, 7);
        if (Q.att.month !== mo) { Q.att.month = mo; Q.att.days = []; Q.att.ms = {}; }
    }

    function ensureLoaded() {
        if (!logged()) return Promise.resolve(null);
        const uid = currentUser.uid;
        if (Q && trusted && loadedUid === uid) { rollover(); return Promise.resolve(Q); }
        if (loadingPromise && loadedUid === uid) return loadingPromise;
        loadedUid = uid;
        Q = null; trusted = false;
        loadingPromise = Promise.all([
            db.collection('users').doc(uid).get(),
            (typeof waitServerTime === 'function' ? waitServerTime() : null)   // 서버 시간 확인 후 날짜 계산
        ])
            .then(([snap]) => { Q = normalize(snap.exists ? snap.data().quests : null); trusted = true; rollover(); return Q; })
            .catch((e) => { console.warn('[퀘스트] 불러오기 실패', e); Q = fresh(); trusted = false; return Q; }) // 실패 시 임시 상태: 저장/보상 금지(서버 기록을 덮어쓰지 않게)
            .then((q) => { loadingPromise = null; updateDot(); return q; });
        return loadingPromise;
    }

    async function saveNow() {
        if (!logged() || !Q || !trusted || loadedUid !== currentUser.uid) return false;
        clearTimeout(saveTimer); saveTimer = null;
        const ref = db.collection('users').doc(currentUser.uid);
        const wt = (p) => (typeof withTimeout === 'function' ? withTimeout(p, 10000) : p);
        try { await wt(ref.update({ quests: Q })); return true; }
        catch (e) {
            try { await wt(ref.set({ quests: Q }, { merge: true })); return true; }
            catch (e2) { console.warn('[퀘스트] 저장 실패', e2); return false; }
        }
    }
    function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 1500); }

    function giveCoin(n) {
        if (typeof userData === 'undefined') return;
        userData.coin += n;
        if (typeof updateTopMoney === 'function') updateTopMoney();
        if (typeof saveUserDataToFirestore === 'function') saveUserDataToFirestore();
    }

    // ===== 진행도 =====
    const prog = (scope, ev) => (Q[scope].p[ev] || 0);
    const isDone = (scope, q) => prog(scope, q.ev) >= q.target;
    const listOf = (scope) => (scope === 'daily' ? DAILY : WEEKLY);

    function claimableCount() {
        if (!Q) return 0;
        let n = 0;
        for (const scope of ['daily', 'weekly']) {
            const list = listOf(scope);
            list.forEach(q => { if (isDone(scope, q) && !Q[scope].c[q.id]) n++; });
            if (list.every(q => Q[scope].c[q.id]) && !Q[scope].all) n++;
        }
        const a = Q.att;
        ATT_MILESTONES.forEach(([d]) => { if (a.days.length >= d && !a.ms[d]) n++; });
        return n;
    }

    function track(ev, n) {
        const add = n == null ? 1 : n;
        if (!(add > 0)) return;
        ensureLoaded().then((q) => {
            if (!q) return;
            rollover();
            const newlyDone = [];
            for (const scope of ['daily', 'weekly']) {
                const before = {};
                listOf(scope).forEach(x => { before[x.id] = isDone(scope, x); });
                Q[scope].p[ev] = (Q[scope].p[ev] || 0) + add;
                listOf(scope).forEach(x => { if (x.ev === ev && !before[x.id] && isDone(scope, x)) newlyDone.push(x.title); });
            }
            saveSoon();
            if (newlyDone.length) toast(`퀘스트 완료! ${newlyDone[0]}${newlyDone.length > 1 ? ` 외 ${newlyDone.length - 1}개` : ''}<br><small>퀘스트 탭에서 보상을 받으세요</small>`);
            updateDot();
            render();
        }).catch(e => console.warn('[퀘스트] 기록 실패', e));
    }

    // ===== 출석 =====
    function effStreak() {
        const a = Q.att;
        return (a.last === todayKey() || a.last === yesterdayKey()) ? a.streak : 0;
    }
    const checkedToday = () => Q.att.last === todayKey();

    async function checkIn(el) {
        if (!(await rewardsOk())) return;
        await ensureLoaded(); rollover();
        if (checkedToday()) return;
        const a = Q.att;
        const prev = { streak: a.streak, best: a.best, last: a.last, days: a.days.slice(), att: Q.weekly.p.attendDays };
        a.streak = (a.last === yesterdayKey()) ? a.streak + 1 : 1;
        a.best = Math.max(a.best || 0, a.streak);
        a.last = todayKey();
        const dayNum = parseInt(a.last.slice(8, 10), 10);
        if (!a.days.includes(dayNum)) a.days.push(dayNum);
        const reward = ATT_REWARDS[(a.streak - 1) % 7];
        // 주간 '출석 N일' 퀘스트 진행도
        Q.weekly.p.attendDays = (Q.weekly.p.attendDays || 0) + 1;
        if (!(await saveNow())) { a.streak = prev.streak; a.best = prev.best; a.last = prev.last; a.days = prev.days; Q.weekly.p.attendDays = prev.att; toast('저장에 실패했어요. 다시 시도해주세요.'); render(); return; }
        fx(el, true, `+${reward.toLocaleString()}원`);
        giveCoin(reward);
        toast(`출석체크 완료! +${reward.toLocaleString()}원<br><small>연속 ${a.streak}일째</small>`);
        updateDot(); render();
    }

    // ===== 보상 받기 =====
    async function claim(scope, id, el) {
        if (!(await rewardsOk())) return;
        await ensureLoaded(); rollover();
        const q = listOf(scope).find(x => x.id === id);
        if (!q || !isDone(scope, q) || Q[scope].c[id]) return;
        Q[scope].c[id] = true;
        if (!(await saveNow())) { delete Q[scope].c[id]; toast('저장에 실패했어요. 다시 시도해주세요.'); render(); return; }
        fx(el, false, `+${q.reward.toLocaleString()}원`);
        giveCoin(q.reward);
        toast(`+${q.reward.toLocaleString()}원 획득!`);
        updateDot(); render();
    }

    async function claimAllClear(scope, el) {
        if (!(await rewardsOk())) return;
        await ensureLoaded(); rollover();
        const list = listOf(scope);
        if (Q[scope].all || !list.every(x => Q[scope].c[x.id])) return;
        Q[scope].all = true;
        if (!(await saveNow())) { Q[scope].all = false; toast('저장에 실패했어요. 다시 시도해주세요.'); render(); return; }
        fx(el, true, `+${ALL_CLEAR[scope].toLocaleString()}원`);
        giveCoin(ALL_CLEAR[scope]);
        toast(`올 클리어 보너스 +${ALL_CLEAR[scope].toLocaleString()}원!`);
        updateDot(); render();
    }

    async function claimMilestone(days, el) {
        if (!(await rewardsOk())) return;
        await ensureLoaded(); rollover();
        const m = ATT_MILESTONES.find(x => x[0] === days);
        if (!m || Q.att.days.length < days || Q.att.ms[days]) return;
        Q.att.ms[days] = true;
        if (!(await saveNow())) { delete Q.att.ms[days]; toast('저장에 실패했어요. 다시 시도해주세요.'); render(); return; }
        fx(el, true, `+${m[1].toLocaleString()}원`);
        giveCoin(m[1]);
        toast(`월 ${days}일 출석 보너스 +${m[1].toLocaleString()}원!`);
        updateDot(); render();
    }

    // ===== 알림(토스트) / 하단 메뉴 빨간 점 =====
    function injectStyle() {
        if (document.getElementById('qz-style')) return;
        const st = document.createElement('style');
        st.id = 'qz-style';
        st.textContent = `
        .qz-toast { position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%) translateY(12px); z-index: 4000; background: rgba(20,20,28,0.96); color: #fff; border: 1px solid var(--accent-color, #6c63ff); border-radius: 12px; padding: 10px 16px; font-size: 13px; font-weight: bold; text-align: center; opacity: 0; transition: opacity .25s, transform .25s; pointer-events: none; max-width: 86vw; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
        .qz-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
        .qz-toast small { font-weight: normal; opacity: .8; }
        .qz-float { position: fixed; z-index: 4600; transform: translate(-50%, 0); font-size: 16px; font-weight: 800; color: #fde68a; text-shadow: 0 1px 6px rgba(0,0,0,0.7), 0 0 10px rgba(251,191,36,0.8); pointer-events: none; animation: qz-rise 0.95s ease-out forwards; }
        @keyframes qz-rise { 0% { opacity: 0; transform: translate(-50%, 6px) scale(0.8); } 15% { opacity: 1; transform: translate(-50%, 0) scale(1.1); } 100% { opacity: 0; transform: translate(-50%, -46px) scale(1); } }
        .qz-dot { position: absolute; top: 4px; right: calc(50% - 22px); width: 9px; height: 9px; border-radius: 50%; background: #ff4d4f; box-shadow: 0 0 0 2px var(--bg-color, #1a1a22); }
        .nav-btn { position: relative; }

        .qz-wrap { display: flex; flex-direction: column; gap: 12px; text-align: left; }
        .qz-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .qz-head h3 { margin: 0; font-size: 16px; }
        .qz-reset { font-size: 11px; color: var(--sub-text); }
        .qz-tabs { display: flex; gap: 6px; margin-top: 12px; }
        .qz-tab { flex: 1; position: relative; padding: 9px 4px; border-radius: 10px; border: 1px solid rgba(128,128,128,0.3); background: rgba(128,128,128,0.1); color: inherit; font-size: 13px; font-weight: bold; cursor: pointer; }
        .qz-tab.on { background: var(--accent-color, #6c63ff); border-color: transparent; color: #fff; }
        .qz-tab .qz-dot { top: 5px; right: 8px; }
        .qz-sub { font-size: 12px; color: var(--sub-text); margin: 0 0 8px; }

        .qz-item { display: flex; align-items: center; gap: 10px; padding: 12px 0; border-bottom: 1px solid rgba(128,128,128,0.18); }
        .qz-item:last-child { border-bottom: none; }
        .qz-ico { flex: 0 0 auto; width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 17px; background: linear-gradient(135deg, var(--accent-color, #6c63ff), #8b5cf6); }
        .qz-ico.done { background: linear-gradient(135deg, #22c55e, #15803d); }
        .qz-info { flex: 1 1 0; min-width: 0; }
        .qz-title { font-size: 14px; font-weight: bold; }
        .qz-desc { font-size: 11px; color: var(--sub-text); margin: 2px 0 6px; }
        .qz-bar { height: 7px; border-radius: 4px; background: rgba(128,128,128,0.25); overflow: hidden; }
        .qz-bar > i { display: block; height: 100%; border-radius: 4px; background: var(--accent-color, #6c63ff); transition: width .3s; }
        .qz-bar > i.full { background: #22c55e; }
        .qz-num { font-size: 11px; color: var(--sub-text); margin-top: 3px; }
        .qz-side { flex: 0 0 auto; text-align: center; min-width: 74px; }
        .qz-reward { font-size: 12px; font-weight: bold; color: #fbbf24; margin-bottom: 5px; }
        .qz-btn { width: 100%; padding: 7px 6px; border: none; border-radius: 8px; font-size: 12px; font-weight: bold; cursor: pointer; color: #fff; background: var(--accent-color, #6c63ff); }
        .qz-btn:disabled { background: rgba(128,128,128,0.3); color: var(--sub-text); cursor: default; }
        .qz-btn.go { background: linear-gradient(135deg, #f59e0b, #ef4444); animation: qz-pulse 1.4s infinite; }
        @keyframes qz-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }

        .qz-big { width: 100%; padding: 14px; border: none; border-radius: 12px; font-size: 16px; font-weight: bold; color: #fff; cursor: pointer; background: linear-gradient(135deg, var(--accent-color, #6c63ff), #8b5cf6); }
        .qz-big:disabled { background: rgba(128,128,128,0.3); color: var(--sub-text); cursor: default; }
        .qz-stats { display: flex; gap: 8px; margin-bottom: 12px; }
        .qz-stat { flex: 1; text-align: center; padding: 10px 4px; border-radius: 10px; background: rgba(128,128,128,0.12); }
        .qz-stat b { display: block; font-size: 17px; margin-top: 2px; }
        .qz-stat span { font-size: 11px; color: var(--sub-text); }
        .qz-track { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; margin: 12px 0 4px; }
        .qz-day { text-align: center; padding: 7px 0; border-radius: 9px; background: rgba(128,128,128,0.12); font-size: 10px; border: 1px solid transparent; }
        .qz-day b { display: block; font-size: 11px; margin-top: 2px; color: #fbbf24; }
        .qz-day.done { background: rgba(34,197,94,0.2); border-color: #22c55e; }
        .qz-day.done b { color: #22c55e; }
        .qz-day.next { border-color: var(--accent-color, #6c63ff); }
        .qz-day.big b { font-size: 11px; }
        .qz-cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; text-align: center; margin-top: 8px; }
        .qz-cal .h { font-size: 10px; color: var(--sub-text); padding: 2px 0; }
        .qz-cal .d { font-size: 12px; padding: 7px 0; border-radius: 8px; background: rgba(128,128,128,0.08); }
        .qz-cal .d.on { background: var(--accent-color, #6c63ff); color: #fff; font-weight: bold; }
        .qz-cal .d.today { outline: 2px solid #fbbf24; }
        .qz-ms { display: flex; gap: 6px; margin-top: 12px; }
        .qz-ms > div { flex: 1; text-align: center; padding: 8px 2px; border-radius: 10px; background: rgba(128,128,128,0.12); font-size: 11px; }
        .qz-ms b { display: block; color: #fbbf24; margin: 2px 0 5px; font-size: 12px; }
        .qz-ms .qz-btn { padding: 5px 2px; font-size: 11px; }
        .qz-clear { display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 12px; margin-top: 8px; background: linear-gradient(135deg, rgba(251,191,36,0.18), rgba(239,68,68,0.15)); border: 1px solid rgba(251,191,36,0.4); }
        `;
        document.head.appendChild(st);
    }

    // ===== 보상 이펙트: 작은 폭죽 + 금빛 링 + 떠오르는 금액 =====
    let fxCanvas = null, fxCtx = null, fxParts = [], fxRings = [], fxRaf = 0;
    const FX_COLORS = ['#fbbf24', '#f59e0b', '#fde68a', '#ef4444', '#22c55e', '#38bdf8', '#a78bfa', '#f472b6'];

    function fxLoop() {
        const w = window.innerWidth, h = window.innerHeight;
        fxCtx.clearRect(0, 0, w, h);
        for (const r of fxRings) {                      // 터지는 순간의 링
            r.t++;
            const k = r.t / r.life;
            fxCtx.globalAlpha = Math.max(0, 0.7 * (1 - k));
            fxCtx.strokeStyle = '#fde68a';
            fxCtx.lineWidth = 3 * (1 - k) + 1;
            fxCtx.beginPath(); fxCtx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * k, 0, Math.PI * 2); fxCtx.stroke();
        }
        fxRings = fxRings.filter(r => r.t < r.life);
        for (const p of fxParts) {
            p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.14;   // 공기 저항 + 중력
            p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.t++;
            const k = p.t / p.life;
            fxCtx.globalAlpha = k < 0.6 ? 1 : Math.max(0, 1 - (k - 0.6) / 0.4);
            fxCtx.fillStyle = p.c;
            if (p.shape === 0) { fxCtx.beginPath(); fxCtx.arc(p.x, p.y, p.s * (1 - k * 0.4), 0, Math.PI * 2); fxCtx.fill(); }
            else { fxCtx.save(); fxCtx.translate(p.x, p.y); fxCtx.rotate(p.rot); fxCtx.fillRect(-p.s, -p.s / 2, p.s * 2, p.s); fxCtx.restore(); }
        }
        fxCtx.globalAlpha = 1;
        fxParts = fxParts.filter(p => p.t < p.life);
        if (fxParts.length || fxRings.length) fxRaf = requestAnimationFrame(fxLoop);
        else { fxRaf = 0; if (fxCanvas) { fxCanvas.remove(); fxCanvas = fxCtx = null; } }
    }

    // el: 눌린 버튼(여기서 터짐) / big: 조금 더 크게 / text: 떠오르는 문구 (예: +300원)
    function fx(el, big, text) {
        try {
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            injectStyle();
            let x = window.innerWidth / 2, y = window.innerHeight / 2;
            if (el && el.getBoundingClientRect) { const r = el.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; }

            if (!fxCanvas) {
                fxCanvas = document.createElement('canvas');
                fxCanvas.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:4500;';
                const dpr = Math.min(window.devicePixelRatio || 1, 2);
                fxCanvas.width = window.innerWidth * dpr; fxCanvas.height = window.innerHeight * dpr;
                fxCtx = fxCanvas.getContext('2d'); fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
                document.body.appendChild(fxCanvas);
            }
            const n = big ? 46 : 28;
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2;
                const sp = (big ? 2.5 : 2) + Math.random() * (big ? 5.5 : 4);
                fxParts.push({
                    x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.2,
                    s: 2 + Math.random() * 2.5, c: FX_COLORS[(Math.random() * FX_COLORS.length) | 0],
                    shape: Math.random() < 0.6 ? 0 : 1, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
                    t: 0, life: 38 + ((Math.random() * 28) | 0)
                });
            }
            fxRings.push({ x, y, r0: 6, r1: big ? 46 : 32, t: 0, life: 16 });
            if (!fxRaf) fxRaf = requestAnimationFrame(fxLoop);

            if (text) {                                    // 버튼 위로 떠오르는 금액
                const f = document.createElement('div');
                f.className = 'qz-float';
                f.textContent = text;
                f.style.left = x + 'px'; f.style.top = (y - 18) + 'px';
                document.body.appendChild(f);
                setTimeout(() => f.remove(), 1000);
            }
        } catch (e) { }
    }

    function toast(html) {
        try {
            injectStyle();
            document.querySelectorAll('.qz-toast').forEach(x => x.remove());
            const t = document.createElement('div');
            t.className = 'qz-toast';
            t.innerHTML = html;
            document.body.appendChild(t);
            requestAnimationFrame(() => t.classList.add('show'));
            setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
        } catch (e) { }
    }

    function needsAttention() {
        if (!Q) return false;
        return claimableCount() > 0 || !checkedToday();
    }

    function updateDot() {
        try {
            const btn = document.querySelector('.nav-btn[onclick*="quest"]');
            if (!btn) return;
            injectStyle();
            let dot = btn.querySelector('.qz-dot');
            if (needsAttention()) {
                if (!dot) { dot = document.createElement('i'); dot.className = 'qz-dot'; btn.appendChild(dot); }
            } else if (dot) dot.remove();
        } catch (e) { }
    }

    // ===== 화면 =====
    const esc = (n) => Number(n).toLocaleString();

    function questCard(scope, q) {
        const p = Math.min(prog(scope, q.ev), q.target);
        const done = p >= q.target;
        const got = !!Q[scope].c[q.id];
        const pct = Math.round((p / q.target) * 100);
        const btn = got ? `<button class="qz-btn" disabled>받음 ✓</button>`
            : done ? `<button class="qz-btn go" onclick="Quests.claim('${scope}','${q.id}', this)">받기</button>`
                : `<button class="qz-btn" disabled>진행중</button>`;
        return `
            <div class="qz-item">
                <div class="qz-ico ${done ? 'done' : ''}"><i class="fa-solid ${done ? 'fa-check' : q.icon}"></i></div>
                <div class="qz-info">
                    <div class="qz-title">${q.title}</div>
                    <div class="qz-desc">${q.desc}</div>
                    <div class="qz-bar"><i class="${done ? 'full' : ''}" style="width:${pct}%"></i></div>
                    <div class="qz-num">${esc(p)} / ${esc(q.target)}</div>
                </div>
                <div class="qz-side"><div class="qz-reward">+${esc(q.reward)}원</div>${btn}</div>
            </div>`;
    }

    function scopeHtml(scope) {
        const list = listOf(scope);
        const doneN = list.filter(q => Q[scope].c[q.id]).length;
        const allDone = doneN === list.length;
        const clearBtn = Q[scope].all ? `<button class="qz-btn" disabled>받음 ✓</button>`
            : allDone ? `<button class="qz-btn go" onclick="Quests.claimAllClear('${scope}', this)">받기</button>`
                : `<button class="qz-btn" disabled>${doneN}/${list.length}</button>`;
        const label = scope === 'daily' ? '일일' : '주간';
        const left = scope === 'daily' ? `매일 00:00에 초기화 · ${fmtLeft(msToDailyReset())} 남음` : `매주 월요일 00:00에 초기화 · ${fmtLeft(msToWeeklyReset())} 남음`;
        return `
            <div class="card" style="text-align:left;">
                <p class="qz-sub" id="qz-left">${left}</p>
                ${list.map(q => questCard(scope, q)).join('')}
                <div class="qz-clear">
                    <div class="qz-ico" style="background:linear-gradient(135deg,#fbbf24,#ef4444);"><i class="fa-solid fa-crown"></i></div>
                    <div class="qz-info"><div class="qz-title">${label} 올 클리어 보너스</div><div class="qz-desc" style="margin:2px 0 0;">${label} 퀘스트 보상을 전부 받으면 추가 보상!</div></div>
                    <div class="qz-side"><div class="qz-reward">+${esc(ALL_CLEAR[scope])}원</div>${clearBtn}</div>
                </div>
            </div>`;
    }

    function attHtml() {
        const a = Q.att;
        const today = checkedToday();
        const streak = effStreak();
        const pos = streak > 0 ? ((streak - 1) % 7) + 1 : 0;
        const doneCells = today ? pos : (pos === 7 ? 0 : pos);
        const nextReward = ATT_REWARDS[(today ? pos : doneCells) % 7] || ATT_REWARDS[0];
        const todayReward = today ? 0 : ATT_REWARDS[doneCells % 7];

        const track = ATT_REWARDS.map((r, i) => {
            const cls = i < doneCells ? 'done' : (!today && i === doneCells ? 'next' : '');
            return `<div class="qz-day ${cls}">${i + 1}일<b>${i < doneCells ? '✓' : esc(r)}</b></div>`;
        }).join('');

        const t = todayKey();
        const y = parseInt(t.slice(0, 4), 10), mo = parseInt(t.slice(5, 7), 10), dd = parseInt(t.slice(8, 10), 10);
        const first = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
        const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
        let cal = ['일', '월', '화', '수', '목', '금', '토'].map(w => `<div class="h">${w}</div>`).join('');
        for (let i = 0; i < first; i++) cal += '<div></div>';
        for (let d = 1; d <= last; d++) cal += `<div class="d${a.days.includes(d) ? ' on' : ''}${d === dd ? ' today' : ''}">${d}</div>`;

        const ms = ATT_MILESTONES.map(([d, r]) => {
            const got = !!a.ms[d], can = a.days.length >= d;
            const btn = got ? `<button class="qz-btn" disabled>받음 ✓</button>`
                : can ? `<button class="qz-btn go" onclick="Quests.claimMilestone(${d}, this)">받기</button>`
                    : `<button class="qz-btn" disabled>${a.days.length}/${d}</button>`;
            return `<div>${d}일 출석<b>+${esc(r)}원</b>${btn}</div>`;
        }).join('');

        return `
            <div class="card" style="text-align:left;">
                <div class="qz-stats">
                    <div class="qz-stat"><span>연속 출석</span><b>${streak}일</b></div>
                    <div class="qz-stat"><span>최고 기록</span><b>${a.best || 0}일</b></div>
                    <div class="qz-stat"><span>이번 달</span><b>${a.days.length}일</b></div>
                </div>
                <button class="qz-big" ${today ? 'disabled' : ''} onclick="Quests.checkIn(this)">
                    ${today ? '<i class="fa-solid fa-check"></i> 오늘 출석 완료!' : `<i class="fa-solid fa-calendar-check"></i> 출석체크 (+${esc(todayReward)}원)`}
                </button>
                <p class="qz-sub" style="margin:10px 0 0; text-align:center;">${today ? `내일 출석하면 +${esc(nextReward)}원` : '연속으로 출석할수록 보상이 커져요 (7일 주기)'}</p>
                <div class="qz-track">${track}</div>
            </div>
            <div class="card" style="text-align:left;">
                <h3 style="margin:0; font-size:15px;"><i class="fa-solid fa-calendar-days" style="color:var(--accent-color);"></i> ${y}년 ${mo}월 출석 현황</h3>
                <div class="qz-cal">${cal}</div>
                <div class="qz-ms">${ms}</div>
            </div>`;
    }

    function render() {
        if (!pageEl || !document.body.contains(pageEl) || !Q) return;
        const body = pageEl.querySelector('#qz-body');
        if (!body) return;
        rollover();
        body.innerHTML = curTab === 'att' ? attHtml() : scopeHtml(curTab);
        const dailyReady = listOf('daily').some(q => isDone('daily', q) && !Q.daily.c[q.id]) || (listOf('daily').every(q => Q.daily.c[q.id]) && !Q.daily.all);
        const weeklyReady = listOf('weekly').some(q => isDone('weekly', q) && !Q.weekly.c[q.id]) || (listOf('weekly').every(q => Q.weekly.c[q.id]) && !Q.weekly.all);
        const attReady = !checkedToday() || ATT_MILESTONES.some(([d]) => Q.att.days.length >= d && !Q.att.ms[d]);
        const dot = (on) => on ? '<i class="qz-dot"></i>' : '';
        pageEl.querySelectorAll('.qz-tab').forEach(b => {
            const k = b.dataset.tab;
            b.classList.toggle('on', k === curTab);
            const old = b.querySelector('.qz-dot'); if (old) old.remove();
            if ((k === 'att' && attReady) || (k === 'daily' && dailyReady) || (k === 'weekly' && weeklyReady)) b.insertAdjacentHTML('beforeend', dot(true));
        });
    }

    function setTab(tab) { curTab = tab; render(); }

    function renderPage(container) {
        injectStyle();
        pageEl = container;
        clearInterval(clockTimer);
        if (!logged()) {
            container.innerHTML = `<div class="card preparing-box"><i class="fa-solid fa-scroll"></i><h2>로그인이 필요해요</h2><p>로그인하면 출석체크와 퀘스트를 할 수 있어요.</p></div>`;
            return;
        }
        container.innerHTML = `
            <div class="qz-wrap">
                <div class="card" style="text-align:left;">
                    <div class="qz-head">
                        <h3><i class="fa-solid fa-scroll" style="color:var(--accent-color);"></i> 퀘스트</h3>
                        <span class="qz-reset">보상은 모두 코인(원)</span>
                    </div>
                    <div class="qz-tabs">
                        <button class="qz-tab" data-tab="att">출석체크</button>
                        <button class="qz-tab" data-tab="daily">일일</button>
                        <button class="qz-tab" data-tab="weekly">주간</button>
                    </div>
                </div>
                <div id="qz-body"><div class="card" style="text-align:center; color:var(--sub-text); font-size:13px;">불러오는 중...</div></div>
            </div>`;
        container.querySelectorAll('.qz-tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
        ensureLoaded().then(() => { render(); updateDot(); });
        clockTimer = setInterval(() => {
            if (!pageEl || !document.body.contains(pageEl)) { clearInterval(clockTimer); return; }
            render();
        }, 60000);
    }

    // 로그인 후 자동으로 불러와서 하단 '퀘스트' 메뉴에 빨간 점 표시
    function init() {
        setInterval(() => {
            if (logged() && (loadedUid !== currentUser.uid || !trusted) && !loadingPromise) ensureLoaded();
            else if (!logged() && Q) { Q = null; trusted = false; loadedUid = null; clearTimeout(saveTimer); saveTimer = null; updateDot(); }
        }, 3000);
        window.addEventListener('pagehide', () => { if (saveTimer) saveNow(); });
    }
    if (typeof window !== 'undefined') init();

    window.Quests = {
        track, renderPage, checkIn, claim, claimAllClear, claimMilestone, _fx: fx,
        _t: { get Q() { return Q; }, DAILY, WEEKLY, ATT_REWARDS, ATT_MILESTONES, ALL_CLEAR, todayKey, weekKey, ensureLoaded, claimableCount }
    };
})();
