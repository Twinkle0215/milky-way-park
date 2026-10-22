// ===== Firebase 설정 =====
// 아래 값은 본인의 Firebase 프로젝트 값으로 반드시 교체해야 합니다.
// 발급 방법: https://console.firebase.google.com 접속 → 프로젝트 생성
// → 좌측 톱니바퀴(프로젝트 설정) → 아래로 스크롤 → "내 앱" → 웹 앱 추가(</> 아이콘)
// → 나오는 firebaseConfig 값을 그대로 복사해서 아래에 붙여넣기
// + Authentication 메뉴에서 "이메일/비밀번호" 로그인 방법을 반드시 사용 설정 해야 함
// + Firestore Database 메뉴에서 데이터베이스를 만들어야 함 (테스트 모드로 시작 가능)
const firebaseConfig = {
  apiKey: "AIzaSyAoGs-_9xYIzeYMZsznHxWUvYZ0h-6NN7U",
  authDomain: "milky-way-park-928eb.firebaseapp.com",
  projectId: "milky-way-park-928eb",
  storageBucket: "milky-way-park-928eb.firebasestorage.app",
  messagingSenderId: "614506290189",
  appId: "1:614506290189:web:d445ac775c14ebd7720944",
  measurementId: "G-ZHH489DC9K"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
// 내 정보/랭킹 문서를 기기에 저장해 두어서, 인터넷이 없어도 마지막으로 본 내 정보가 열리게 함
// (반드시 다른 Firestore 호출보다 먼저 실행되어야 함)
try {
    db.enablePersistence({ synchronizeTabs: true }).catch((e) => console.warn('오프라인 저장소를 쓸 수 없어요:', e && e.code));
} catch (e) { console.warn('오프라인 저장소 설정 실패:', e); }

// ===== 기기 ID 생성/저장 =====
function getDeviceId() {
    const key = 'milkyway_device_id';
    let deviceId = localStorage.getItem(key);
    if (!deviceId) {
        deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem(key, deviceId);
    }
    return deviceId;
}

// ===== 특정 계정 전용 칭호 자동 지급 =====
// 이메일을 코드에 그대로 두지 않기 위한 SHA-256 (외부 라이브러리 없이 동기 방식)
function sha256Hex(str) {
    const bytes = new TextEncoder().encode(String(str));
    const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const l = bytes.length, bitLen = l * 8;
    const padded = new Uint8Array(((l + 9 + 63) >> 6) << 6);
    padded.set(bytes); padded[l] = 0x80;
    const dv = new DataView(padded.buffer);
    dv.setUint32(padded.length - 8, Math.floor(bitLen / 4294967296));
    dv.setUint32(padded.length - 4, bitLen >>> 0);
    const w = new Uint32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let off = 0; off < padded.length; off += 64) {
        for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
        for (let i = 16; i < 64; i++) {
            const s0 = rotr(w[i-15], 7) ^ rotr(w[i-15], 18) ^ (w[i-15] >>> 3);
            const s1 = rotr(w[i-2], 17) ^ rotr(w[i-2], 19) ^ (w[i-2] >>> 10);
            w[i] = (w[i-16] + s0 + w[i-7] + s1) >>> 0;
        }
        let [a, b, c, d, e, f, g, h] = H;
        for (let i = 0; i < 64; i++) {
            const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            const ch = (e & f) ^ (~e & g);
            const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
            const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + maj) >>> 0;
            h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
        }
        H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
        H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    return H.map(x => x.toString(16).padStart(8, '0')).join('');
}

// 특별 칭호 지급 목록. 이메일이 코드에 그대로 보이지 않도록 "이메일을 소문자로 바꾼 뒤 SHA-256 으로 변환한 값"을 키로 사용합니다.
// (진짜 지급 권한은 Firestore 규칙(firestore.rules)의 extraTitles 에서 한 번 더 검사합니다)
// 새로 추가하려면: 이메일의 SHA-256 값을 구해서 아래에 "해시값": [칭호id, ...] 로 추가하세요.
const SPECIAL_TITLE_GRANTS = {
    "b61e55515981a6d3669ea6f7fc626fd08203ad0a64848446ae883ea4bac4eecd": ['creator', 'eternal_test_subject', 'alpha_tester'], // pyhoo0215@example.com → 본인(개발자) 실제 이메일 해시로 교체하세요
    "c7e9b15d5ab038924230e156da1ca1434150529488b71b81cab0f28df5dd3aab": ['eternal_test_subject', 'alpha_tester'],
    "ed7e7f311ac88afbe922957fc6075050f7a0e4bb72fc84b1e1ead051f84a6312": ['alpha_tester']
};
function specialGrantsFor(email) {
    return SPECIAL_TITLE_GRANTS[sha256Hex(String(email || '').trim().toLowerCase())];
}

let currentUser = null;
let authReady = false;

// 로그인한 계정에 특별 지급 칭호가 있으면 소유 목록에 추가
function syncSpecialTitles() {
    if (!userData.titles) userData.titles = ['newbie'];
    if (!currentUser) return;
    const grants = specialGrantsFor(currentUser.email);
    if (!grants) return;
    grants.forEach(id => {
        if (!userData.titles.includes(id)) userData.titles.push(id);
    });
}

// 기본(신규 가입자) 유저 데이터 틀
function buildDefaultUserData(nickname) {
    return {
        name: nickname,
        rank: "??",
        coin: 500,
        point: 0,
        avatarUrl: null,
        bannerUrl: null,
        currentTheme: 'dark',
        customThemeBgUrl: null,
        aboutMe: "자기소개를 적어보세요!",
        ddays: [{ id: 1, title: "🎄 크리스마스", date: "2026-12-25" }],
        titles: ['newbie'],
        equippedTitle: 'newbie',
        ownedThemes: ['dark', 'light'],
        gameStats: {
            omokWins: 0,
            omokLosses: 0,
            tictactoeWins: 0,
            tictactoeLosses: 0,
            totalGamePoint: 0,
            totalCoin: 0,
            lastGameDate: null
        }
    };
}

// 로그인 상태는 계속 감지만 하고, 화면 전환은 각 함수에서 직접 처리
auth.onAuthStateChanged((user) => {
    currentUser = user;
    authReady = true;
});

let isAuthSubmitting = false;

function setAuthSubmitting(submitting) {
    isAuthSubmitting = submitting;
    const btn = document.getElementById('auth-submit-btn');
    btn.disabled = submitting;
    btn.style.opacity = submitting ? '0.6' : '1';
    if (submitting) {
        btn.dataset.originalText = btn.textContent;
        btn.textContent = '처리 중...';
    } else if (btn.dataset.originalText) {
        btn.textContent = btn.dataset.originalText;
    }
}

// ===== 회원가입 =====
async function signUp() {
    const email = document.getElementById('auth-email-input').value.trim();
    const password = document.getElementById('auth-password-input').value;
    const nickname = document.getElementById('auth-nickname-input').value.trim();
    const errorBox = document.getElementById('auth-error-msg');
    errorBox.textContent = '';

    if (!email || !password || !nickname) {
        errorBox.textContent = '이메일, 닉네임, 비밀번호를 모두 입력해주세요.';
        return;
    }
    if (password.length < 6) {
        errorBox.textContent = '비밀번호는 6자 이상이어야 합니다.';
        return;
    }
    if (nickname.length > 30 || /[<>]/.test(nickname)) {
        errorBox.textContent = '닉네임은 30자 이하로, < > 문자 없이 입력해주세요.';
        return;
    }
    if (!document.getElementById('auth-agree-checkbox').checked) {
        errorBox.textContent = '개인정보 수집·이용 및 해외 이전에 동의해주세요.';
        return;
    }

    try {
        setAuthSubmitting(true);
        
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        currentUser = cred.user;

        // 기기당 1계정: deviceLocks/{deviceId} 문서는 '처음 만들 때만' 성공(규칙이 update/delete를 막음)
        try {
            await db.collection('deviceLocks').doc(getDeviceId()).set({
                uid: cred.user.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (lockErr) {
            try { await cred.user.delete(); } catch (_) {}
            currentUser = null;
            errorBox.textContent = '이 기기에서는 이미 계정이 있습니다. 다른 기기에서 가입해주세요.';
            return;
        }
        const defaultData = buildDefaultUserData(nickname);
        await db.collection('users').doc(cred.user.uid).set(defaultData);

        userData.name = defaultData.name;
        userData.rank = defaultData.rank;
        userData.coin = defaultData.coin;
        _coinSynced = defaultData.coin;
        _userDataLoaded = true;
        _imgSynced = { avatarUrl: null, bannerUrl: null, customThemeBgUrl: null };
        _epoch++;
        userData.point = defaultData.point;
        userData.avatarUrl = defaultData.avatarUrl;
        userData.bannerUrl = defaultData.bannerUrl;
        userData.currentTheme = defaultData.currentTheme;
        userData.customThemeBgUrl = defaultData.customThemeBgUrl;
        userData.aboutMe = defaultData.aboutMe;
        userData.titles = defaultData.titles.slice();
        userData.equippedTitle = defaultData.equippedTitle;
        userData.ownedThemes = defaultData.ownedThemes.slice();
        customDDays = defaultData.ddays;
        syncSpecialTitles();

        await cred.user.sendEmailVerification();

        closeAuthModal();
        openVerifyModal(email);
    } catch (err) {
        errorBox.textContent = translateAuthError(err.code);
    } finally {
        setAuthSubmitting(false);
    }
}

// ===== 로그인 =====
async function logIn() {
    const email = document.getElementById('auth-email-input').value.trim();
    const password = document.getElementById('auth-password-input').value;
    const errorBox = document.getElementById('auth-error-msg');
    errorBox.textContent = '';

    if (!email || !password) {
        errorBox.textContent = '이메일과 비밀번호를 입력해주세요.';
        return;
    }

    try {
        setAuthSubmitting(true);
        const cred = await auth.signInWithEmailAndPassword(email, password);
        currentUser = cred.user;

        if (!cred.user.emailVerified) {
            closeAuthModal();
            openVerifyModal(email);
            return;
        }

        await loadUserDataFromFirestore(cred.user.uid);
        syncSpecialTitles();
        closeAuthModal();
        enterMainApp();
    } catch (err) {
        errorBox.textContent = translateAuthError(err.code);
    } finally {
        setAuthSubmitting(false);
    }
}

// ===== 로그아웃 / 계정 전환 =====
async function logOut() {
    if (typeof stopRoomNotifier === 'function') stopRoomNotifier();
    if (_saveRunning) { try { await _saveRunning; } catch (_) {} } // 보내지 못한 변경분 먼저 저장
    await auth.signOut();
    currentUser = null;
    resetUserDataToDefaults();
    document.getElementById('main-app').style.display = 'none';
    document.body.style.overflow = 'hidden';
    openAuthModal('login');
}

function switchAccount() {
    closeSettingsModal();
    logOut();
}

// ===== Firestore 데이터 불러오기 / 저장하기 =====
async function loadUserDataFromFirestore(uid, _retried) {
    const docSnap = await db.collection('users').doc(uid).get();
    if (!docSnap.exists && !_retried) {
        // 가입 도중 끊겨서 내 정보 문서가 없는 계정 → 기본 문서를 만들어 복구 (안 그러면 영원히 저장이 막힘)
        const nick = (currentUser && currentUser.email ? currentUser.email.split('@')[0] : '새 유저').slice(0, 30).replace(/[<>]/g, '');
        await db.collection('users').doc(uid).set(buildDefaultUserData(nick || '새 유저'));
        return loadUserDataFromFirestore(uid, true);
    }
    if (docSnap.exists) {
        const data = docSnap.data();
        userData.name = data.name || "oo님";
        userData.rank = data.rank || "??";
        userData.coin = data.coin ?? 500;
        _coinSynced = userData.coin;   // 서버에 있는 값 = 동기화 기준
        userData.coin += readPendingCoin(uid); // 오프라인에서 번 코인(아직 서버에 못 보낸 것)을 이어서 반영 → 다음 저장 때 전송됨
        _epoch++;
        const _themeOwnerOk = localStorage.getItem('themeOwnerUid') === uid; // 같은 기기의 다른 계정 테마가 새지 않도록
        userData.point = data.point ?? 0;
        userData.avatarUrl = data.avatarUrl || null;
        userData.bannerUrl = data.bannerUrl || null;
        userData.currentTheme = data.currentTheme || (_themeOwnerOk ? localStorage.getItem('currentTheme') : null) || 'dark';
        userData.customThemeBgUrl = data.customThemeBgUrl || (_themeOwnerOk ? localStorage.getItem('customThemeBgUrl') : null) || null;
        // 서버에 실제로 저장돼 있는 이미지 값을 기록 (이후 바뀐 것만 전송)
        _imgSynced = { avatarUrl: data.avatarUrl || null, bannerUrl: data.bannerUrl || null, customThemeBgUrl: data.customThemeBgUrl || null };
        userData.aboutMe = data.aboutMe || "자기소개를 적어보세요!";
        userData.titles = (data.titles && data.titles.length) ? data.titles : ['newbie'];
        userData.equippedTitle = data.equippedTitle || 'newbie';
        userData.ownedThemes = (data.ownedThemes && data.ownedThemes.length) ? data.ownedThemes : ['dark', 'light'];
        userData.gameStats = data.gameStats || {
            omokWins: 0,
            omokLosses: 0,
            tictactoeWins: 0,
            tictactoeLosses: 0,
            totalGamePoint: 0,
            totalCoin: 0,
            lastGameDate: null
        };
        customDDays = data.ddays || [{ id: 1, title: "🎄 크리스마스", date: "2026-12-25" }];
    }
    _userDataLoaded = true; // 여기까지 오면 불러오기 성공 (실패하면 위에서 오류가 나서 여기에 못 옴)
}

// 프로필/설정이 바뀔 때마다 이 함수를 호출해서 Firestore에 저장합니다.
// ===== 인터넷 상태 도우미 =====
function isOnlineNow() { return (typeof isOnline === 'function') ? isOnline() : navigator.onLine !== false; }

// 연결이 불안정해서 요청이 끝없이 대기하는 것을 막기 위한 시간 제한
function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), ms);
        promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
    });
}

// ===== 서버 시간 (폰/PC 날짜를 바꿔서 출석·퀘스트를 속이는 꼼수 방지) =====
// 로그인할 때 서버에 "지금 몇 시야?"를 한 번 물어서, 내 기기 시계와의 차이를 기억해 둔다.
// 오프라인이면 확인할 수 없으므로 serverTimeOk=false → 출석/퀘스트 보상은 온라인에서만 받을 수 있게 잠근다.
let serverOffsetMs = 0;
let serverTimeOk = false;
let _serverTimeReady = null;
function getServerNow() { return Date.now() + serverOffsetMs; }
function syncServerTime() {
    if (!currentUser) return Promise.resolve();
    if (!isOnlineNow()) { serverTimeOk = false; return Promise.resolve(); } // 오프라인이면 묻지 않음 (요청이 쌓여 멈추는 것 방지)
    const uid = currentUser.uid;
    _serverTimeReady = (async () => {
        try {
            const ref = db.collection('serverTime').doc(uid);
            const t0 = Date.now();
            await withTimeout(ref.set({ t: firebase.firestore.FieldValue.serverTimestamp() }), 8000);
            const snap = await withTimeout(ref.get({ source: 'server' }), 8000);
            const t1 = Date.now();
            serverOffsetMs = snap.data().t.toMillis() - Math.round((t0 + t1) / 2);
            serverTimeOk = true;
        } catch (e) {
            console.warn('서버 시간 확인 실패(기기 시간 사용, 보상 잠금):', e);
            serverOffsetMs = 0;
            serverTimeOk = false;
        }
    })();
    return _serverTimeReady;
}
// 서버 시간 확인이 끝날 때까지 최대 4초만 기다림 (실패해도 앱이 멈추지 않게)
function waitServerTime() {
    return Promise.race([_serverTimeReady || Promise.resolve(), new Promise(r => setTimeout(r, 4000))]);
}

// ===== 오프라인에서 번 코인 기억해 두기 =====
// 인터넷이 없을 때 얻은 코인(= 아직 서버에 못 보낸 증감분)을 이 기기에 적어 두었다가, 다음에 온라인이 되면 전송한다.
function pendingCoinKey(uid) { return 'pendingCoin:' + uid; }
function stashPendingCoin(uid, delta) {
    try {
        if (delta) localStorage.setItem(pendingCoinKey(uid), String(delta));
        else localStorage.removeItem(pendingCoinKey(uid));
    } catch (e) { }
}
function readPendingCoin(uid) {
    try { return Number(localStorage.getItem(pendingCoinKey(uid))) || 0; } catch (e) { return 0; }
}

// ===== 저장 상태 (코인 증감 동기화 + 이미지 변경분 전송) =====
// _coinSynced: "서버에 반영된 것으로 아는" 로컬 코인 값. (userData.coin - _coinSynced) = 아직 서버에 안 보낸 증감분
let _coinSynced = 500;
let _imgSynced = {};          // 서버에 마지막으로 저장된 이미지 값 (바뀐 이미지만 전송하기 위함)
let _epoch = 0;               // 계정이 바뀔 때마다 증가 (이전 계정의 늦은 응답이 새 계정 상태를 건드리지 않게)
let _userDataLoaded = false;  // 내 정보를 서버/기기 저장소에서 "성공적으로" 불러왔는지. false 면 저장을 막는다(기본값으로 덮어쓰기 방지)
let _lastSaveErrorAt = 0;
let _saveRunning = null;
let _saveAgain = false;

// 서버가 이미 반영한 코인 증감(테마/BGM 구매 트랜잭션 등)을 로컬에 맞춰줌
function applyServerCoinDelta(d) {
    userData.coin += d;
    _coinSynced += d;
}

// 로그아웃/계정 전환 시 이전 계정 데이터가 남지 않도록 초기화
function resetUserDataToDefaults() {
    const d = buildDefaultUserData('oo님');
    Object.assign(userData, {
        name: d.name, rank: d.rank, coin: d.coin, point: d.point,
        avatarUrl: null, bannerUrl: null, currentTheme: 'dark', customThemeBgUrl: null,
        aboutMe: d.aboutMe, titles: d.titles.slice(), equippedTitle: d.equippedTitle,
        ownedThemes: d.ownedThemes.slice(), gameStats: Object.assign({}, d.gameStats)
    });
    customDDays = d.ddays;
    _coinSynced = d.coin;
    _imgSynced = {};
    _userDataLoaded = false;
    serverOffsetMs = 0;
    serverTimeOk = false;
    _epoch++;
}

// 저장은 한 번에 하나씩만 실행. 실행 중에 또 요청되면 끝난 뒤 한 번 더 실행(합치기)
function saveUserDataToFirestore() {
    if (_saveRunning) { _saveAgain = true; return _saveRunning; }
    _saveRunning = (async () => {
        let ok = true;
        try {
            do {
                _saveAgain = false;
                ok = await _doSave();
            } while (_saveAgain && ok);
        } finally {
            _saveRunning = null;
        }
        return ok;
    })();
    return _saveRunning;
}

async function _doSave() {
    if (!currentUser || !_userDataLoaded) return false; // 불러오기 전에 저장하면 기본값이 진짜 데이터를 덮어쓸 수 있음
    const uid = currentUser.uid;
    const epoch = _epoch;
    const ref = db.collection('users').doc(uid);

    const payload = {
        name: userData.name,
        rank: userData.rank,
        point: userData.point,
        currentTheme: userData.currentTheme,
        aboutMe: userData.aboutMe,
        titles: userData.titles,
        equippedTitle: userData.equippedTitle,
        ownedThemes: userData.ownedThemes,
        ddays: customDDays
    };
    // 이미지는 바뀐 것만 전송 (매 저장마다 최대 1MB씩 올리던 낭비 제거)
    const sentImgs = {};
    ['avatarUrl', 'bannerUrl', 'customThemeBgUrl'].forEach(k => {
        const cur = userData[k] == null ? null : userData[k];
        if (_imgSynced[k] !== cur) { payload[k] = cur; sentImgs[k] = cur; }
    });

    const sentLocal = userData.coin;
    const delta = sentLocal - _coinSynced;

    // ---- 오프라인: 일반 정보는 기기에 예약 저장(인터넷이 돌아오면 자동 전송), 코인 증감은 따로 기억 ----
    if (!isOnlineNow()) {
        try { ref.set(payload, { merge: true }).catch(() => { }); } catch (e) { }
        Object.assign(_imgSynced, sentImgs);   // 예약됐으니 다시 보내지 않음
        stashPendingCoin(uid, delta);          // 코인은 아직 서버에 못 보냈으니 기준값(_coinSynced)을 그대로 둠
        return true;
    }

    // 코인은 "절대값 덮어쓰기" 대신 "증감분"만 서버 값에 더한다 (다른 탭/기기와 충돌해도 코인이 사라지지 않음)
    _coinSynced = sentLocal; // 낙관적으로 먼저 반영 (겹치는 저장에서 이중 계산 방지)

    try {
        if (delta === 0) {
            // 연결이 불안정하면 쓰기가 끝없이 대기할 수 있어서, 8초가 지나면 "예약됨"으로 보고 넘어감 (연결되면 자동 전송)
            try { await withTimeout(ref.set(payload, { merge: true }), 8000); }
            catch (e) { if (!e || e.message !== 'timeout') throw e; }
        } else {
            const next = await db.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                const cur = snap.exists ? (snap.data().coin ?? 0) : 0;
                const nextCoin = Math.max(0, cur + delta); // 서버 값이 0 밑으로 내려가지 않게
                tx.set(ref, Object.assign({}, payload, { coin: nextCoin }), { merge: true });
                return nextCoin;
            });
            if (epoch === _epoch) {
                // 서버에 다른 기기의 변경분이 있었다면 그만큼 로컬에도 반영
                const foreign = next - sentLocal;
                if (foreign !== 0) {
                    userData.coin += foreign;
                    _coinSynced += foreign;
                    if (typeof updateTopMoney === 'function') updateTopMoney();
                }
            }
        }
        if (epoch === _epoch) {
            Object.assign(_imgSynced, sentImgs);
            stashPendingCoin(uid, userData.coin - _coinSynced); // 보낸 만큼 기억에서 지움 (그 사이 또 번 코인은 남김)
        }
        return true;
    } catch (err) {
        console.error('Firestore 저장 실패:', err);
        if (epoch === _epoch) {
            _coinSynced -= delta; // 보내지 못했으니 다음 저장에서 다시 보냄
            stashPendingCoin(uid, userData.coin - _coinSynced);
        }
        // 인터넷 문제로 인한 실패는 조용히 넘기고(자동 재시도), 그 외 실패만 사용자에게 알림 (20초에 한 번)
        const netErr = !isOnlineNow() || (err && ['unavailable', 'deadline-exceeded', 'failed-precondition'].indexOf(err.code) !== -1) ||
            /offline|network|timeout/i.test(String(err && err.message));
        const now = Date.now();
        if (!netErr && now - _lastSaveErrorAt > 20000) {
            _lastSaveErrorAt = now;
            alert('저장에 실패했어요. 이미지를 바꿨다면 더 작은 이미지로 다시 시도해주세요.');
        }
        return false;
    }
}

// 인터넷이 다시 연결되면 (offline.js 가 호출) 쌓여 있던 변경분을 보내고 온라인 기능을 다시 켠다
function onBackOnline() {
    if (!currentUser) return;
    if (!_userDataLoaded) { // 오프라인 때문에 내 정보를 못 불러왔던 경우 → 자동 재시도
        if (document.getElementById('load-failure-overlay')) retryAfterIntro();
        return;
    }
    syncServerTime();
    saveUserDataToFirestore();
    if (typeof startRoomNotifier === 'function') startRoomNotifier();
    if (typeof ensureLottoDrawn === 'function') ensureLottoDrawn();
}

// 내 정보를 못 불러왔을 때 보여주는 안내 화면 (멈춘 화면 대신)
function showLoadFailure() {
    if (document.getElementById('load-failure-overlay')) return;
    const offline = !isOnlineNow();
    const el = document.createElement('div');
    el.id = 'load-failure-overlay';
    el.style.cssText = 'position:fixed; inset:0; z-index:99995; display:flex; align-items:center; justify-content:center; padding:24px; background:rgba(5,5,20,0.96); color:#fff; text-align:center;';
    el.innerHTML = '<div style="max-width:340px;">' +
        '<div style="font-size:44px; margin-bottom:10px;">' + (offline ? '📴' : '⚠️') + '</div>' +
        '<div style="font-size:17px; font-weight:700; margin-bottom:10px;">' + (offline ? '인터넷이 연결되어 있지 않아요' : '내 정보를 불러오지 못했어요') + '</div>' +
        '<div style="font-size:13px; line-height:1.7; opacity:0.85; margin-bottom:18px;">' +
        (offline ? '이 기기에는 아직 저장된 내 정보가 없어요.<br>한 번은 인터넷에 연결해서 접속해야<br>그다음부터 오프라인에서도 사용할 수 있어요.'
                 : '잠시 후 다시 시도해주세요.') + '</div>' +
        '<button id="load-failure-retry" style="padding:11px 26px; border-radius:12px; border:none; font-size:15px; font-weight:700; background:#4CAF50; color:#fff;">다시 시도</button></div>';
    document.body.appendChild(el);
    document.getElementById('load-failure-retry').addEventListener('click', retryAfterIntro);
}
function retryAfterIntro() {
    const el = document.getElementById('load-failure-overlay');
    if (el) el.remove();
    proceedAfterIntro();
}

function translateAuthError(code) {
    switch (code) {
        case 'auth/email-already-in-use': return '이미 가입된 이메일입니다.';
        case 'auth/invalid-email': return '올바른 이메일 형식이 아닙니다.';
        case 'auth/weak-password': return '비밀번호가 너무 약합니다. (6자 이상)';
        case 'auth/user-not-found': return '가입되지 않은 이메일입니다.';
        case 'auth/wrong-password':
        case 'auth/invalid-credential': return '이메일 또는 비밀번호가 올바르지 않습니다.';
        case 'auth/too-many-requests': return '시도가 너무 많아 잠시 제한되었어요. 5~10분 후 다시 시도해주세요.';
        case 'auth/network-request-failed':
        case 'unavailable':
        case 'failed-precondition': return '인터넷 연결이 필요해요. (처음 로그인할 때는 온라인이어야 하고, 한 번 로그인한 기기는 이후 오프라인에서도 열려요)';
        case 'auth/user-disabled': return '이용이 제한된 계정입니다.';
        case 'auth/missing-email': return '이메일을 입력해주세요.';
        default: return '오류가 발생했습니다. 다시 시도해주세요. (' + code + ')';
    }
}

// ===== 로그인/회원가입 모달 제어 =====
function openAuthModal(mode = 'login') {
    document.getElementById('auth-error-msg').textContent = '';
    document.getElementById('auth-email-input').value = '';
    document.getElementById('auth-password-input').value = '';
    document.getElementById('auth-password-input').type = 'password';
    document.getElementById('auth-password-toggle-icon').className = 'fa-solid fa-eye-slash';
    document.getElementById('auth-nickname-input').value = '';
    setAuthMode(mode);
    document.getElementById('auth-modal').style.display = 'flex';
}

function closeAuthModal() {
    document.getElementById('auth-modal').style.display = 'none';
}

function setAuthMode(mode) {
    const isSignup = mode === 'signup';
    document.getElementById('auth-modal-title').textContent = isSignup ? '회원가입' : '로그인';
    document.getElementById('auth-nickname-input').style.display = isSignup ? 'block' : 'none';
    document.getElementById('auth-submit-btn').textContent = isSignup ? '가입하기' : '로그인';
    document.getElementById('auth-submit-btn').setAttribute('data-mode', mode);
    document.getElementById('auth-switch-text').textContent = isSignup ? '이미 계정이 있으신가요?' : '계정이 없으신가요?';
    document.getElementById('auth-switch-btn').textContent = isSignup ? '로그인하기' : '회원가입하기';
    document.getElementById('auth-forgot-row').style.display = isSignup ? 'none' : 'block';

    const agreeRow = document.getElementById('auth-agree-row');
    agreeRow.style.display = isSignup ? 'flex' : 'none';
    document.getElementById('auth-agree-checkbox').checked = false;

    const deviceNoticeRow = document.getElementById('auth-device-notice-row');
    if (deviceNoticeRow) deviceNoticeRow.style.display = isSignup ? 'block' : 'none';
}

function openPrivacyModal() {
    document.getElementById('privacy-modal').style.display = 'flex';
}
function closePrivacyModal() {
    document.getElementById('privacy-modal').style.display = 'none';
}

function toggleAuthMode() {
    const current = document.getElementById('auth-submit-btn').getAttribute('data-mode');
    setAuthMode(current === 'signup' ? 'login' : 'signup');
    document.getElementById('auth-error-msg').textContent = '';
}

function togglePasswordVisibility() {
    const input = document.getElementById('auth-password-input');
    const icon = document.getElementById('auth-password-toggle-icon');
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fa-solid fa-eye';
    } else {
        input.type = 'password';
        icon.className = 'fa-solid fa-eye-slash';
    }
}

// ===== 이메일 인증 대기 모달 =====
function openVerifyModal(email) {
    document.getElementById('verify-email-text').textContent = email;
    document.getElementById('verify-msg').textContent = '';
    document.getElementById('verify-modal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeVerifyModal() {
    document.getElementById('verify-modal').style.display = 'none';
}

// 인증 메일 재전송 (과도한 요청 방지를 위해 15초 쿨다운)
async function resendVerificationEmail() {
    const msgBox = document.getElementById('verify-msg');
    const btn = document.getElementById('verify-resend-btn');
    if (!currentUser) return;

    btn.disabled = true;
    btn.style.opacity = '0.6';
    try {
        await currentUser.sendEmailVerification();
        msgBox.style.color = '#4CAF50';
        msgBox.textContent = '인증 메일을 다시 보냈어요.';
    } catch (err) {
        msgBox.style.color = '#ef5350';
        msgBox.textContent = translateAuthError(err.code);
    } finally {
        setTimeout(() => {
            btn.disabled = false;
            btn.style.opacity = '1';
        }, 15000);
    }
}

// "인증 확인했어요" 버튼: 최신 인증 상태를 다시 불러와서 확인
async function checkVerificationStatus() {
    const msgBox = document.getElementById('verify-msg');
    if (!currentUser) return;

    try {
        await currentUser.reload();
        await currentUser.getIdToken(true); // email_verified 클레임 갱신
        currentUser = auth.currentUser;
        if (currentUser.emailVerified) {
            closeVerifyModal();
            await loadUserDataFromFirestore(currentUser.uid);
            syncSpecialTitles();
            enterMainApp();
        } else {
            msgBox.style.color = '#ef5350';
            msgBox.textContent = '아직 인증이 확인되지 않았어요. 메일의 링크를 먼저 눌러주세요.';
        }
    } catch (err) {
        msgBox.style.color = '#ef5350';
        msgBox.textContent = '확인 중 오류가 발생했어요. 다시 시도해주세요.';
    }
}

// 인증 대기 화면에서 다른 계정으로 로그인하고 싶을 때
async function cancelVerification() {
    await auth.signOut();
    currentUser = null;
    resetUserDataToDefaults();
    closeVerifyModal();
    openAuthModal('login');
}

function submitAuthForm() {
    if (isAuthSubmitting) return;
    const mode = document.getElementById('auth-submit-btn').getAttribute('data-mode');
    if (mode === 'signup') signUp(); else logIn();
}

function openResetModal() {
    document.getElementById('reset-email-input').value = document.getElementById('auth-email-input').value.trim();
    document.getElementById('reset-msg').textContent = '';
    document.getElementById('reset-modal').style.display = 'flex';
}

function closeResetModal() {
    document.getElementById('reset-modal').style.display = 'none';
}

async function sendPasswordReset() {
    const email = document.getElementById('reset-email-input').value.trim();
    const msgBox = document.getElementById('reset-msg');
    const btn = document.getElementById('reset-submit-btn');

    if (!email) {
        msgBox.style.color = '#ef5350';
        msgBox.textContent = '이메일을 입력해주세요.';
        return;
    }

    btn.disabled = true;
    btn.style.opacity = '0.6';
    const originalText = btn.textContent;
    btn.textContent = '전송 중...';

    try {
        await auth.sendPasswordResetEmail(email);
        msgBox.style.color = '#4CAF50';
        msgBox.textContent = '재설정 메일을 보냈어요. 메일함(스팸함 포함)을 확인해주세요.';
    } catch (err) {
        msgBox.style.color = '#ef5350';
        msgBox.textContent = translateAuthError(err.code);
    } finally {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.textContent = originalText;
    }
}

// ===== 인트로 화면 이후 진입 지점 (script.js의 startApp에서 호출됨) =====
function proceedAfterIntro() {
    if (!authReady) {
        setTimeout(proceedAfterIntro, 150);
        return;
    }
    if (currentUser) {
        if (!currentUser.emailVerified) {
            openVerifyModal(currentUser.email);
            return;
        }
        loadUserDataFromFirestore(currentUser.uid).then(() => {
            syncSpecialTitles();
            enterMainApp();
        }).catch((err) => {
            console.error('내 정보 불러오기 실패:', err);
            showLoadFailure();   // 오프라인 + 저장된 정보 없음 등 → 멈춘 화면 대신 안내
        });
    } else {
        document.body.style.overflow = 'hidden';
        openAuthModal('login');
    }
}

function enterMainApp() {
    syncServerTime(); // 서버 시간 기준 맞추기 (출석/퀘스트용)
    document.body.style.overflow = 'auto';
    document.getElementById('main-app').style.display = 'block';
    
    // 계정(서버) 데이터 기준으로 테마 적용. 소유하지 않은 테마는 기본 테마로 되돌림
    let startTheme = userData.currentTheme || 'dark';
    if (typeof isThemeOwned === 'function' && !isThemeOwned(startTheme)) startTheme = 'dark';
    setTheme(startTheme);
    
    loadPage('profile', document.querySelector('.nav-btn.active'));
    if (isOnlineNow()) { // 온라인일 때만 (오프라인이면 인터넷이 돌아올 때 onBackOnline 이 시작함)
        if (typeof startRoomNotifier === 'function') startRoomNotifier();
        if (typeof ensureLottoDrawn === 'function') ensureLottoDrawn();
    }
        }
