// ===== updates.js : 공지사항 & 업데이트 로그 =====
// 상단 바의 📢 버튼 → 공지사항 / 업데이트 로그 두 탭이 있는 창이 열립니다.
//  - 누구나 읽기 가능, 글 추가·수정·삭제는 개발자 계정만 가능 (아래 DEV_EMAIL_HASH)
//  - 데이터는 Firestore 의 updateLogs / notices 컬렉션에 저장됩니다.
//  - 진짜 권한 검사는 Firestore 규칙(firestore.rules)에서 한 번 더 합니다. (여기 검사는 버튼을 보여줄지 결정할 뿐)
//  - 처음 한 번, 개발자 계정으로 열면 나오는 [기존 기록 가져오기] 버튼으로 디스코드에 올렸던 지난 업데이트를 넣을 수 있어요.
(function () {
    'use strict';

    // ===== 설정 =====
    // 개발자 이메일을 "소문자로 바꾼 뒤 SHA-256" 한 값 (auth.js 의 특별 칭호 목록과 같은 방식 → 이메일이 코드에 그대로 안 보임)
    const DEV_EMAIL_HASH = 'db099f1b59efcd8524adeed1301b268066ba3e74fecc44eb9d1296392d9accdf';
    const COL_UPDATES = 'updateLogs';
    const COL_NOTICES = 'notices';
    const LIMIT_UPDATES = 100;
    const LIMIT_NOTICES = 50;
    const REFRESH_MS = 30 * 1000; // 이 시간 안에 다시 열면 새로 안 불러옴
    // 이 기능이 생긴 날(한국시간). 이날 이후에 올라온 글만 "새 글"로 표시 → 처음 접속한 사람에게 옛날 글이 전부 "NEW"로 뜨지 않게
    const LAUNCH_MS = new Date('2026-10-22T00:00:00+09:00').getTime();
    const KST_MS = 9 * 3600 * 1000;
    // 사이트 최초 제작 시작일 (한국시간). 상단에 '시작 후 N일' 표시용 (NEW 기준인 LAUNCH_MS 와는 별개)
    const SITE_START_MS = new Date('2026-08-23T00:00:00+09:00').getTime();
    const DAY_MS = 24 * 3600 * 1000;

    // ===== 도우미 =====
    const $ = (id) => document.getElementById(id);
    const esc = (s) => (typeof escHtml === 'function' ? escHtml(s) : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
    const nl2br = (s) => esc(s).replace(/\r?\n/g, '<br>');
    const nowMs = () => (typeof getServerNow === 'function' ? getServerNow() : Date.now());
    const logged = () => (typeof currentUser !== 'undefined' && currentUser);

    function isDev() {
        try {
            if (!logged() || !currentUser.emailVerified || !currentUser.email) return false;
            if (typeof sha256Hex !== 'function') return false;
            return sha256Hex(String(currentUser.email).trim().toLowerCase()) === DEV_EMAIL_HASH;
        } catch (e) { return false; }
    }

    // 한국시간(KST) 표시용
    const kstIso = (ms) => new Date(ms + KST_MS).toISOString(); // 'YYYY-MM-DDTHH:MM:SS.sssZ' (KST 값)
    const fmtDate = (ms) => { const d = kstIso(ms); return d.slice(0, 4) + '.' + d.slice(5, 7) + '.' + d.slice(8, 10); };
    const fmtDateTime = (ms) => fmtDate(ms) + ' ' + kstIso(ms).slice(11, 16);
    const toInputValue = (ms) => kstIso(ms).slice(0, 16);                       // <input type="datetime-local"> 용
    const fromInputValue = (v) => new Date(v + ':00+09:00').getTime();
    const verLabel = (v) => { v = String(v || '').trim(); return /^v/i.test(v) ? 'v' + v.slice(1) : 'v' + v; };

    function daysAgoText(ms) {
        const diff = Math.floor((kstDayStart(nowMs()) - kstDayStart(ms)) / DAY_MS);
        if (diff <= 0) return '오늘';
        if (diff === 1) return '어제';
        return diff + '일 전';
    }
    function kstDayStart(ms) { return Math.floor((ms + KST_MS) / DAY_MS) * DAY_MS - KST_MS; }

    // ===== 지난 업데이트 기록 (디스코드에 올렸던 내용) — 개발자의 [기존 기록 가져오기] 버튼이 Firestore 로 옮겨요 =====
    const at = (s) => new Date(s + ':00+09:00').getTime();
    const SEED_UPDATES = [
        { version: '1.0', at: at('2026-09-03T21:11'), title: '', items: [
            'UI 개편: 메뉴 카테고리를 상점으로 바꿨습니다',
            '설정 UI 추가: 원래 메뉴에 있던 기능(크레딧, 테마)을 위에 설정 카테고리를 만들어 넣었습니다.',
            '새로운 테마: 이미지 업로드 테마를 추가하여 자신의 사진을 업로드 하면 테마가 되도록 추가하였습니다.'
        ], footer: '' },
        { version: '1.1', at: at('2026-09-05T21:36'), title: '', items: [
            '사이트 배경음악을 넣었습니다. (저작권 없음, 노래 끄기/켜기 가능)'
        ], footer: '회원가입, 로그인 기능은 귀찮아서(?) 다음 업데이트때 만들도록 하겠습니다…!' },
        { version: '1.2', at: at('2026-09-06T18:17'), title: '', items: [
            "드디어 게임 카테고리의 첫번째 게임 '끝말잇기'가 업데이트 되었습니다!! 아직 사람들과 같이 하는 것은 불가하여 봇과 끝말잇기를 하는 것만 가능 하지만 추후 업데이트를 통해서 사람들과도 끝말잇기를 할 수 있게 할 예정입니다!!"
        ], footer: '다음 업데이트를 기대해주세요!!\n끝말잇기에서 없는 단어를 쳐도 가능하다는건 비밀….' },
        { version: '1.3', at: at('2026-09-13T12:59'), title: '', items: [
            '드디어 로그인 기능과 회원가입 기능을 추가 하였습니다! 이제 회원가입을 하시면 프로필 설정, d-day, 코인수와 포인트, 테마 등이 세이브 됩니다!!'
        ], footer: '다음 업데이트를 기대해주세요!\n새로운 테마를 추가할 예정인데 무슨 테마로 할지 많은 의견 부탁 드립니다!!\n아직 알파 단계이기 때문에 버그가 있을수 있습니다! 버그가 발생하면 디스코드로 버그 제보해주시길 바랍니다!' },
        { version: '1.3.1', at: at('2026-09-13T15:26'), title: '버그 패치', items: [
            '비밀번호 찾기 기능 추가: 로그인 화면에 "비밀번호를 잊으셨나요?" 링크 → 이메일 입력하면 Firebase가 재설정 링크를 메일로 보내주도록 추가 (가입한 이메일이 아니면 에러 메시지 뜸)',
            '에러 메시지 변경: too-many-requests, network-request-failed 등도 이제 한국어로 "왜 안 되는지" 설명하도록 변경',
            '중복 클릭 방지 — 로그인/가입 버튼 누르면 바로 "처리 중..."으로 바뀌고 비활성화돼서, 여러 번 연타해서 실수로 시도 초과되는 일이 줄어들도록 변경'
        ], footer: '테스트를 여러번해도 버그가 많네요..!\n앞으로 이런 버그가 없도록 더 많이 노력하겠습니다!!' },
        { version: '1.4.1', at: at('2026-09-14T20:50'), title: '', items: [
            'UI 수정: 아래 학습 카테고리에 있던 기능들을 프로필 아래로 옮겼습니다.',
            '설정 UI를 변경 하였습니다.',
            "칭호를 추가하였습니다! (현재는 '뉴비' 칭호만 있음)"
        ], footer: '다음 업데이트 부터는 여태까지 있었던 모든 테마들(라이트, 다크 제외)을 모두 상점에 넣을 예정입니다!! 다음 업데이트는 언제 될지 모르겠지만 정해진다면 추후 공지해 드리겠습니다.\n다음 업데이트를 기대해주세옷!' },
        { version: '1.5.1', at: at('2026-09-18T23:23'), title: '', items: [
            '회원가입/로그인을 할 때 이메일 인증 기능을 추가하여 이제 없는 이메일을 치면 회원가입을 못하도록 수정하였습니다.',
            '급하게 추가한 기믹이라서 예기치 못한 버그가 있을 수도 있습니다.'
        ], footer: '참고로 버그 악용을 하다 걸리면 영구정지를 당할 수도 있습니다.\n다음 업데이트를 기대해주세용!!' },
        { version: '1.6.1', at: at('2026-09-19T14:56'), title: '', items: [
            '오목 게임을 추가하였습니다!!',
            '오목에서 이기면 1000원을 받습니다.',
            '봇이랑 대결하는 기능은 추가하지 않아 상대할 사람이 없으면 플레이 할 수 없습니다.'
        ], footer: '버그가 있다면 DM 으로 제보해주세요!!\n다음 업데이트를 기대해주세요!!' },
        { version: '1.7.1', at: at('2026-09-20T23:13'), title: '', items: [
            '틱택토 게임을 추가하였습니다!!',
            '오목과 동일하게 이기면 1000원을 받습니다.',
            '오목과 동일하게 봇이랑 대결하는 기능은 추가하지 않아서 상대할 사람이 없으면 플레이 할 수 없습니다.'
        ], footer: '버그가 있으면 Twinkle.Dev DM으로 제보해주세요!!\n다음 업데이트를 기대해주세에용!\n다음 업데이트에는 진짜로 테마들을 상점에 옮길게요!!' },
        { version: '1.9.1', at: at('2026-09-25T01:05'), title: '', items: [
            '상점에 로또를 추가했습니다!!',
            '다크/화이트 테마를 제외한 모든 테마를 다 상점에 넣었습니다!!(일단 가격은 임시로 다 1000원으로 했어용)',
            '오목, 틱택토에서 방을 만들면 사이트 내에서 알림이 옵니다!!'
        ], footer: '다음 업데이트를 기대해주에욧!' },
        { version: '2.2.1', at: at('2026-09-30T21:41'), title: '', items: [
            '랭크모드를 추가했습니다! (틱택토/오목에서 방생성->랭크 모드 설정)',
            '랭킹을 추가하였습니다!',
            '랭크전에서 이기면 +100p, 지면 -70p 입니다'
        ], footer: '다음 업데이트를 기대해주세요욧!' },
        { version: '3.2.1', at: at('2026-10-12T00:56'), title: '', items: [
            '게임 플라피 버드를 출시했어요! 온라인/솔로 가 있고 순위도 있습니다!!',
            '로또 리메이크: 로또 시스템을 바꾸긴 했는데 사소한 버그가 있어요. 다음 업데이트 전까지는 로또 구매를 하지 말아주세요.. 책임 안 집니다 ㅎ',
            '아이콘 리메이크: 게임 카테고리 안에 있던 게임들의 아이콘을 일부 변경했어요 상점에 로또 아이콘도 바꿨습니당'
        ], footer: '다음 부터는 실수 안 하도록 노력할게요' },
        { version: '3.2.1.1', at: at('2026-10-14T00:34'), title: '', items: [
            '로또 버그를 수정했어요!'
        ], footer: '다음 업데이트는 퀘스트 업데이트 입니다! 기대해주세요!' }
    ];
    const SEED_NOTICES = [
        { at: at('2026-10-12T00:44'), pinned: false, title: '임시 업데이트 안내',
          body: '업데이트를 하긴 했어요 하도 해달라고 해서.\n\n근데\n\n업데이트를 안한게 더 나을 정도로 업데이트 한 내용이 버그 투성이여서 굳이 업데이트 내용을 작성하지 않아도 될거 같습니다. 그래서 클로드 토큰이 초기화 되는데로 버그 패치를 하여 제대로 된 업데이트 내용을 작성하도록 하겠습니다.\n\n-Twinkle.Dev-' }
    ];

    // ===== 상태 =====
    const state = {
        updates: [], notices: [],
        loadedAt: 0, loading: null,
        fallback: false, errorCode: '',
        tab: 'update',
        newIds: { update: {}, notice: {} },   // 창을 연 순간 "아직 안 본" 글 (NEW 표시용)
        editing: null,                         // { kind, id } 수정 중인 글 (없으면 새 글)
        open: {}                                // 펼쳐 본 업데이트 id
    };

    // ===== "읽음" 기록 (이 기기 안에만 저장) =====
    function seenKey() { return 'mwp_board_seen_v1_' + (logged() ? currentUser.uid : 'guest'); }
    function getSeen() {
        try {
            const o = JSON.parse(localStorage.getItem(seenKey()) || '{}');
            return { notice: Number(o.notice) || LAUNCH_MS, update: Number(o.update) || LAUNCH_MS };
        } catch (e) { return { notice: LAUNCH_MS, update: LAUNCH_MS }; }
    }
    function setSeen(kind, ms) {
        try {
            const cur = getSeen();
            if (ms <= cur[kind]) return;
            cur[kind] = ms;
            localStorage.setItem(seenKey(), JSON.stringify(cur));
        } catch (e) { /* 저장 불가(사생활 보호 모드 등)면 그냥 넘어감 */ }
    }
    function unreadCount(kind) {
        if (state.fallback) return 0;
        const seen = getSeen()[kind];
        return (kind === 'notice' ? state.notices : state.updates).filter((x) => x.publishedAt > seen).length;
    }
    function refreshBadge() {
        const n = unreadCount('notice'), u = unreadCount('update'), total = n + u;
        const b = $('board-bell-badge');
        if (b) { b.textContent = total > 9 ? '9+' : String(total); b.style.display = total > 0 ? 'flex' : 'none'; }
        const tn = $('board-tab-dot-notice'), tu = $('board-tab-dot-update');
        if (tn) tn.style.display = n > 0 ? 'inline-block' : 'none';
        if (tu) tu.style.display = u > 0 ? 'inline-block' : 'none';
    }

    // ===== Firestore 읽기 =====
    const tsMs = (t) => (t && typeof t.toMillis === 'function') ? t.toMillis() : (Number(t) || 0);
    function normUpdate(d) {
        const x = d.data() || {};
        return { id: d.id, version: String(x.version || ''), title: String(x.title || ''), items: Array.isArray(x.items) ? x.items.map(String) : [], footer: String(x.footer || ''), publishedAt: tsMs(x.publishedAt) || tsMs(x.createdAt) };
    }
    function normNotice(d) {
        const x = d.data() || {};
        return { id: d.id, title: String(x.title || ''), body: String(x.body || ''), pinned: !!x.pinned, resolved: !!x.resolved, publishedAt: tsMs(x.publishedAt) || tsMs(x.createdAt) };
    }
    function sortLists() {
        state.updates.sort((a, b) => b.publishedAt - a.publishedAt);
        state.notices.sort((a, b) => (b.pinned - a.pinned) || (b.publishedAt - a.publishedAt));
    }

    function load(force) {
        if (state.loading) return state.loading;
        if (!force && state.loadedAt && Date.now() - state.loadedAt < REFRESH_MS) return Promise.resolve();
        state.loading = (async () => {
            try {
                const [u, n] = await Promise.all([
                    db.collection(COL_UPDATES).orderBy('publishedAt', 'desc').limit(LIMIT_UPDATES).get(),
                    db.collection(COL_NOTICES).orderBy('publishedAt', 'desc').limit(LIMIT_NOTICES).get()
                ]);
                state.updates = u.docs.map(normUpdate);
                state.notices = n.docs.map(normNotice);
                state.fallback = false; state.errorCode = '';
                state.loadedAt = Date.now();
            } catch (e) {
                console.warn('[업데이트로그] 불러오기 실패', e);
                // 불러오기 실패(오프라인, 규칙 미적용 등) → 코드에 들어 있는 지난 기록을 읽기 전용으로 보여줌
                state.updates = SEED_UPDATES.map((s, i) => ({ id: 'local' + i, version: s.version, title: s.title, items: s.items, footer: s.footer, publishedAt: s.at }));
                state.notices = SEED_NOTICES.map((s, i) => ({ id: 'local' + i, title: s.title, body: s.body, pinned: s.pinned, publishedAt: s.at }));
                state.fallback = true; state.errorCode = (e && e.code) || 'error';
                state.loadedAt = 0;
            }
            sortLists();
        })().then(() => { state.loading = null; }, () => { state.loading = null; });
        return state.loading;
    }

    // ===== 화면 만들기 (처음 열 때 한 번) =====
    function ensureDom() {
        if ($('board-modal')) return;
        const wrap = document.createElement('div');
        wrap.innerHTML = `
        <div id="board-modal" class="modal-overlay bd-overlay" style="z-index:2500;">
            <div class="modal-box bd-box">
                <div class="bd-head">
                    <h3><i class="fa-solid fa-bullhorn" style="color:var(--accent-color);"></i> 공지 · 업데이트</h3>
                    <button type="button" class="bd-x" onclick="Board.close()" aria-label="닫기"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="bd-tabs">
                    <button type="button" id="board-tab-notice" class="bd-tab" onclick="Board.tab('notice')">공지사항 <span id="board-tab-dot-notice" class="bd-tabdot"></span></button>
                    <button type="button" id="board-tab-update" class="bd-tab" onclick="Board.tab('update')">업데이트 로그 <span id="board-tab-dot-update" class="bd-tabdot"></span></button>
                </div>
                <div id="board-body" class="bd-body"></div>
            </div>
        </div>
        <div id="board-edit-modal" class="modal-overlay" style="z-index:2600;">
            <div class="modal-box bd-edit-box" id="board-edit-box"></div>
        </div>
        <div id="board-confirm-modal" class="modal-overlay" style="z-index:2700;">
            <div class="modal-box">
                <h3 id="board-confirm-title">삭제할까요?</h3>
                <p id="board-confirm-msg"></p>
                <div class="modal-btns">
                    <button type="button" class="modal-btn btn-cancel" onclick="Board.confirmNo()">취소</button>
                    <button type="button" class="modal-btn btn-danger" id="board-confirm-yes" onclick="Board.confirmYes()">삭제</button>
                </div>
            </div>
        </div>`;
        while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
        // 바깥(어두운 부분)을 누르면 닫기
        $('board-modal').addEventListener('click', (e) => { if (e.target === $('board-modal')) close(); });
    }

    // ===== 열기 / 닫기 / 탭 =====
    async function open(startTab) {
        ensureDom();
        $('board-modal').style.display = 'flex';
        $('board-body').innerHTML = '<div class="bd-empty"><i class="fa-solid fa-spinner fa-spin"></i> 불러오는 중…</div>';
        await load(false);
        if ($('board-modal').style.display !== 'flex') return; // 불러오는 사이에 닫았으면 그만
        // 열 때 "안 본 글"을 기억해 두고(NEW 표시용), 시작 탭을 고름
        const seen = getSeen();
        state.newIds = { update: {}, notice: {} };
        if (!state.fallback) {
            state.updates.forEach((x) => { if (x.publishedAt > seen.update) state.newIds.update[x.id] = 1; });
            state.notices.forEach((x) => { if (x.publishedAt > seen.notice) state.newIds.notice[x.id] = 1; });
        }
        const hasNewNotice = Object.keys(state.newIds.notice).length > 0;
        const hasNewUpdate = Object.keys(state.newIds.update).length > 0;
        tab(startTab || (hasNewNotice && !hasNewUpdate ? 'notice' : 'update'));
    }
    function close() {
        const m = $('board-modal');
        if (m) m.style.display = 'none';
    }
    function tab(kind) {
        state.tab = kind === 'notice' ? 'notice' : 'update';
        ensureDom();
        $('board-tab-notice').classList.toggle('active', state.tab === 'notice');
        $('board-tab-update').classList.toggle('active', state.tab === 'update');
        render();
        // 이 탭의 글을 봤다고 기록 → 빨간 점 갱신 (이번에 연 화면의 NEW 표시는 그대로 유지)
        const list = state.tab === 'notice' ? state.notices : state.updates;
        if (!state.fallback && list.length) setSeen(state.tab, Math.max.apply(null, list.map((x) => x.publishedAt)));
        refreshBadge();
        const body = $('board-body'); if (body) body.scrollTop = 0;
    }

    // ===== 그리기 =====
    function devBarHTML(kind) {
        if (!isDev() || state.fallback) return '';
        const label = kind === 'notice' ? '새 공지 쓰기' : '새 업데이트 쓰기';
        const empty = (kind === 'update' && state.updates.length === 0);
        return `<div class="bd-devbar"><span class="bd-devtag"><i class="fa-solid fa-screwdriver-wrench"></i> 개발자 모드</span>
            <button type="button" class="bd-mini-btn primary" onclick="Board.edit('${kind}')"><i class="fa-solid fa-plus"></i> ${label}</button>
            ${empty ? '<button type="button" class="bd-mini-btn" onclick="Board.importSeed()"><i class="fa-solid fa-file-import"></i> 기존 기록 가져오기</button>' : ''}</div>`;
    }
    function fallbackNoteHTML() {
        if (!state.fallback) return '';
        const isDevNow = isDev();
        let msg = '인터넷 연결을 확인해 주세요. 지금은 저장해 둔 기본 기록을 보여드려요.';
        if (state.errorCode === 'permission-denied') {
            msg = isDevNow
                ? 'Firestore 규칙에 updateLogs / notices 가 아직 없어서 읽을 수 없어요. 규칙을 배포한 뒤 다시 열어주세요. (지금은 기본 기록을 보여줘요)'
                : '지금은 최신 기록을 불러오지 못해서 기본 기록을 보여드려요.';
        }
        return `<div class="bd-note"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(msg)}</div>`;
    }
    function render() {
        const body = $('board-body');
        if (!body) return;
        body.innerHTML = state.tab === 'notice' ? renderNotices() : renderUpdates();
    }

    function renderUpdates() {
        const list = state.updates;
        let html = fallbackNoteHTML() + devBarHTML('update');
        if (!list.length) {
            return html + '<div class="bd-empty">아직 등록된 업데이트가 없어요.<br><span style="font-size:12px;">곧 첫 소식이 올라와요! ✨</span></div>';
        }
        const latest = list[0];
        const days = Math.floor((kstDayStart(nowMs()) - kstDayStart(SITE_START_MS)) / DAY_MS);
        html += `<div class="bd-summary">최신 <b>${esc(verLabel(latest.version))}</b> · ${esc(fmtDate(latest.publishedAt))} · 총 ${list.length}회 업데이트<br>${esc(fmtDate(SITE_START_MS))}에 시작해서 <b>${days}일째</b> 운영 중</div>`;
        html += '<div class="bd-list-wrap">';
        list.forEach((u, i) => {
            const isNew = !!state.newIds.update[u.id];
            const isOpen = !!state.open[u.id];
            const head = u.title || u.items[0] || '내용 없음';
            const count = u.items.length;
            const items = u.items.map((t) => `<li>${nl2br(t)}</li>`).join('');
            html += `
            <div class="bd-row${isOpen ? ' open' : ''}">
                <button type="button" class="bd-row-head" onclick="Board.toggle('${esc(u.id)}')" aria-expanded="${isOpen}">
                    <span class="bd-vbadge${i === 0 ? ' latest' : ''}">${esc(verLabel(u.version))}</span>
                    <span class="bd-row-main">
                        <span class="bd-row-title">${esc(head)}</span>
                        <span class="bd-row-sub">${esc(fmtDate(u.publishedAt))}${count ? ' · 변경 ' + count + '개' : ''}${isNew ? '<b class="bd-newtxt">NEW</b>' : ''}</span>
                    </span>
                    <i class="fa-solid fa-chevron-down bd-chev"></i>
                </button>
                ${isOpen ? `<div class="bd-row-body">
                    ${items ? `<ul class="bd-list">${items}</ul>` : ''}
                    ${u.footer ? `<div class="bd-footer">${nl2br(u.footer)}</div>` : ''}
                    ${itemDevButtons('update', u.id)}
                </div>` : ''}
            </div>`;
        });
        return html + '</div>';
    }

    function renderNotices() {
        const list = state.notices;
        let html = fallbackNoteHTML() + devBarHTML('notice');
        if (!list.length) return html + '<div class="bd-empty">등록된 공지사항이 없어요.</div>';
        list.forEach((n) => {
            const isNew = !!state.newIds.notice[n.id];
            html += `
            <div class="bd-card bd-notice${n.pinned ? ' pinned' : ''}">
                <div class="bd-card-top">
                    ${n.resolved ? '<span class="bd-tag done"><i class="fa-solid fa-circle-check"></i> 해결 완료</span>' : ''}
                    ${n.pinned ? '<span class="bd-tag pin"><i class="fa-solid fa-thumbtack"></i> 고정</span>' : ''}
                    ${isNew ? '<span class="bd-tag new">NEW</span>' : ''}
                    <span class="bd-date">${esc(fmtDateTime(n.publishedAt))}</span>
                </div>
                <div class="bd-card-title">${esc(n.title)}</div>
                <div class="bd-notice-body">${nl2br(n.body)}</div>
                ${itemDevButtons('notice', n.id)}
            </div>`;
        });
        return html;
    }

    function itemDevButtons(kind, id) {
        if (!isDev() || state.fallback) return '';
        return `<div class="bd-item-actions">
            <button type="button" class="bd-mini-btn" onclick="Board.edit('${kind}','${esc(id)}')"><i class="fa-solid fa-pen"></i> 수정</button>
            <button type="button" class="bd-mini-btn danger" onclick="Board.askDelete('${kind}','${esc(id)}')"><i class="fa-solid fa-trash"></i> 삭제</button>
        </div>`;
    }

    // ===== 글쓰기 / 수정 (개발자 전용) =====
    function findItem(kind, id) { return (kind === 'notice' ? state.notices : state.updates).find((x) => x.id === id) || null; }

    function edit(kind, id) {
        if (!isDev()) return;
        ensureDom();
        kind = kind === 'notice' ? 'notice' : 'update';
        const cur = id ? findItem(kind, id) : null;
        state.editing = { kind, id: cur ? cur.id : null };
        const when = cur ? cur.publishedAt : nowMs();
        let fields;
        if (kind === 'update') {
            fields = `
            <label class="bd-lbl">버전 <span class="bd-req">*</span></label>
            <input id="bd-f-version" class="modal-input" maxlength="20" placeholder="예: 3.3.1" value="${esc(cur ? cur.version : '')}">
            <label class="bd-lbl">제목 (선택)</label>
            <input id="bd-f-title" class="modal-input" maxlength="40" placeholder="예: 버그 패치" value="${esc(cur ? cur.title : '')}">
            <label class="bd-lbl">업데이트 내용 <span class="bd-req">*</span> <span class="bd-hint">한 줄에 한 항목</span></label>
            <textarea id="bd-f-items" class="modal-input" rows="6" maxlength="4000" placeholder="퀘스트를 추가했어요!&#10;로또 버그를 고쳤어요.">${esc(cur ? cur.items.join('\n') : '')}</textarea>
            <label class="bd-lbl">마무리 말 (선택)</label>
            <textarea id="bd-f-footer" class="modal-input" rows="3" maxlength="500" placeholder="다음 업데이트를 기대해주세요!">${esc(cur ? cur.footer : '')}</textarea>`;
        } else {
            fields = `
            <label class="bd-lbl">제목 <span class="bd-req">*</span></label>
            <input id="bd-f-title" class="modal-input" maxlength="60" placeholder="공지 제목" value="${esc(cur ? cur.title : '')}">
            <label class="bd-lbl">내용 <span class="bd-req">*</span></label>
            <textarea id="bd-f-body" class="modal-input" rows="8" maxlength="3000" placeholder="공지 내용을 적어주세요">${esc(cur ? cur.body : '')}</textarea>
            <label class="bd-check"><input type="checkbox" id="bd-f-pinned" ${cur && cur.pinned ? 'checked' : ''}> 맨 위에 고정하기</label>
            <label class="bd-check"><input type="checkbox" id="bd-f-resolved" ${cur && cur.resolved ? 'checked' : ''}> 해결 완료로 표시</label>`;
        }
        $('board-edit-box').innerHTML = `
            <h3>${cur ? '수정하기' : (kind === 'update' ? '새 업데이트 쓰기' : '새 공지 쓰기')}</h3>
            <div style="text-align:left;">
                ${fields}
                <label class="bd-lbl">올린 날짜·시간 <span class="bd-hint">(한국시간)</span></label>
                <input id="bd-f-when" type="datetime-local" class="modal-input" value="${esc(toInputValue(when))}">
            </div>
            <p id="bd-edit-msg" style="min-height:14px; margin:-6px 0 10px 0; font-size:12px; color:#ef5350;"></p>
            <div class="modal-btns">
                <button type="button" class="modal-btn btn-cancel" onclick="Board.editClose()">취소</button>
                <button type="button" class="modal-btn btn-confirm" id="bd-save-btn" onclick="Board.save()">${cur ? '저장' : '올리기'}</button>
            </div>`;
        $('board-edit-modal').style.display = 'flex';
    }
    function editClose() { const m = $('board-edit-modal'); if (m) m.style.display = 'none'; state.editing = null; }

    function friendlyError(e) {
        const c = e && e.code;
        if (c === 'permission-denied') return '권한이 없어요. Firestore 규칙에 개발자 권한이 배포됐는지, 이메일 인증이 된 개발자 계정인지 확인해 주세요.';
        if (c === 'unavailable') return '인터넷 연결을 확인해 주세요.';
        return '저장에 실패했어요. 잠시 뒤 다시 시도해 주세요.';
    }

    async function save() {
        if (!isDev() || !state.editing) return;
        const { kind, id } = state.editing;
        const msg = $('bd-edit-msg'), btn = $('bd-save-btn');
        const val = (i) => ($(i) ? $(i).value : '');
        const whenRaw = val('bd-f-when');
        const whenMs = whenRaw ? fromInputValue(whenRaw) : nowMs();
        if (!isFinite(whenMs)) { msg.textContent = '날짜·시간을 확인해 주세요.'; return; }

        let data, col;
        if (kind === 'update') {
            const version = val('bd-f-version').trim();
            const items = val('bd-f-items').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
            if (!version) { msg.textContent = '버전을 입력해 주세요.'; return; }
            if (!items.length) { msg.textContent = '업데이트 내용을 한 줄 이상 적어주세요.'; return; }
            if (items.length > 30) { msg.textContent = '항목은 최대 30개까지예요.'; return; }
            data = { version: version, title: val('bd-f-title').trim(), items: items, footer: val('bd-f-footer').trim() };
            col = COL_UPDATES;
        } else {
            const title = val('bd-f-title').trim(), body = val('bd-f-body').trim();
            if (!title) { msg.textContent = '제목을 입력해 주세요.'; return; }
            if (!body) { msg.textContent = '내용을 입력해 주세요.'; return; }
            data = { title: title, body: body, pinned: !!($('bd-f-pinned') && $('bd-f-pinned').checked), resolved: !!($('bd-f-resolved') && $('bd-f-resolved').checked) };
            col = COL_NOTICES;
        }
        data.publishedAt = firebase.firestore.Timestamp.fromMillis(whenMs);
        data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        data.by = currentUser.uid;

        msg.textContent = ''; btn.disabled = true; btn.textContent = '저장 중…';
        try {
            if (id) {
                await db.collection(col).doc(id).set(data, { merge: true });
            } else {
                data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection(col).add(data);
            }
            editClose();
            await load(true);
            render(); refreshBadge();
        } catch (e) {
            console.warn('[업데이트로그] 저장 실패', e);
            msg.textContent = friendlyError(e);
            btn.disabled = false; btn.textContent = id ? '저장' : '올리기';
        }
    }

    // ===== 삭제 (개발자 전용) =====
    let pendingDelete = null;
    function askDelete(kind, id) {
        if (!isDev()) return;
        const item = findItem(kind, id);
        if (!item) return;
        pendingDelete = { kind, id };
        const name = kind === 'update' ? verLabel(item.version) + ' 업데이트' : '"' + item.title + '" 공지';
        $('board-confirm-title').textContent = '삭제할까요?';
        $('board-confirm-msg').textContent = name + '를 삭제하면 되돌릴 수 없어요.';
        $('board-confirm-yes').disabled = false; $('board-confirm-yes').textContent = '삭제';
        $('board-confirm-modal').style.display = 'flex';
    }
    function confirmNo() { pendingDelete = null; $('board-confirm-modal').style.display = 'none'; }
    async function confirmYes() {
        if (!isDev() || !pendingDelete) return;
        const { kind, id } = pendingDelete;
        const btn = $('board-confirm-yes');
        btn.disabled = true; btn.textContent = '삭제 중…';
        try {
            await db.collection(kind === 'notice' ? COL_NOTICES : COL_UPDATES).doc(id).delete();
            confirmNo();
            await load(true);
            render(); refreshBadge();
        } catch (e) {
            console.warn('[업데이트로그] 삭제 실패', e);
            $('board-confirm-msg').textContent = friendlyError(e);
            btn.disabled = false; btn.textContent = '다시 시도';
        }
    }

    // ===== 지난 기록 한 번에 넣기 (개발자 전용, 업데이트 로그가 비어 있을 때만 버튼이 보임) =====
    async function importSeed() {
        if (!isDev() || state.updates.length > 0 || state.fallback) return;
        const ok = window.confirm('디스코드에 올렸던 지난 업데이트 ' + SEED_UPDATES.length + '개를 업데이트 로그에 넣을까요?' + (state.notices.length === 0 ? '\n(임시 업데이트 안내 공지도 함께 들어가요)' : ''));
        if (!ok) return;
        try {
            const batch = db.batch();
            const ts = firebase.firestore.Timestamp.fromMillis;
            const now = firebase.firestore.FieldValue.serverTimestamp();
            SEED_UPDATES.forEach((s, i) => {
                batch.set(db.collection(COL_UPDATES).doc('seed_' + String(i + 1).padStart(2, '0')), {
                    version: s.version, title: s.title, items: s.items, footer: s.footer,
                    publishedAt: ts(s.at), createdAt: now, updatedAt: now, by: currentUser.uid
                });
            });
            if (state.notices.length === 0) {
                SEED_NOTICES.forEach((s, i) => {
                    batch.set(db.collection(COL_NOTICES).doc('seed_' + String(i + 1).padStart(2, '0')), {
                        title: s.title, body: s.body, pinned: s.pinned,
                        publishedAt: ts(s.at), createdAt: now, updatedAt: now, by: currentUser.uid
                    });
                });
            }
            await batch.commit();
            await load(true);
            render(); refreshBadge();
        } catch (e) {
            console.warn('[업데이트로그] 가져오기 실패', e);
            window.alert(friendlyError(e));
        }
    }

    // ===== 시작 (로그인 후 한 번) : 빨간 점 계산용으로 미리 불러옴 =====
    let started = false;
    function init() {
        if (started) return;
        started = true;
        ensureDom();
        load(false).then(refreshBadge);
    }
    // 로그아웃 → 다른 계정 로그인 대비: 계정이 바뀌면 빨간 점을 다시 계산
    function resetForAccountChange() { started = false; state.loadedAt = 0; refreshBadge(); }

    // auth.js 의 enterMainApp() 이 끝난 뒤 init() 이 실행되도록 감싸기 (auth.js 는 수정하지 않음)
    (function hook() {
        if (typeof window.enterMainApp !== 'function' || window.enterMainApp.__boardHooked) return;
        const orig = window.enterMainApp;
        const wrapped = function () {
            const r = orig.apply(this, arguments);
            try { if (typeof isOnlineNow !== 'function' || isOnlineNow()) init(); } catch (e) { console.warn('[업데이트로그] 시작 실패', e); }
            return r;
        };
        wrapped.__boardHooked = true;
        window.enterMainApp = wrapped;
    })();
    // 이미 메인 화면이 떠 있는 상태로 이 스크립트가 늦게 로드된 경우 대비
    (function lateStart() {
        const app = $('main-app');
        if (app && app.style.display === 'block' && logged()) { try { init(); } catch (e) { } }
    })();

    function toggle(id) {
        state.open[id] = !state.open[id];
        render();
    }

    window.Board = {
        open: open, close: close, tab: tab, toggle: toggle,
        edit: edit, editClose: editClose, save: save,
        askDelete: askDelete, confirmNo: confirmNo, confirmYes: confirmYes,
        importSeed: importSeed, reset: resetForAccountChange,
        isDev: isDev
    };
})();
