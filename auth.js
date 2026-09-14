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

// ===== 특정 계정 전용 칭호 자동 지급 =====
// 아래 맵에 "이메일: [칭호id, ...]" 형태로 추가하면, 그 이메일로 로그인할 때
// 해당 칭호들이 자동으로 소유 목록에 추가됩니다. (장착 여부는 유저가 설정에서 직접 선택)
// 칭호 id는 script.js의 TITLE_CATALOG에 정의된 것만 사용 가능합니다.
const SPECIAL_TITLE_GRANTS = {
    "pyhoo0215@example.com": ['creator', 'eternal_test_subject', 'alpha_tester'],                                  // 본인(개발자) 이메일로 교체하세요
    "umy35824@gmail.com": ['eternal_test_subject', 'alpha_tester']   // 동생 이메일로 교체하세요
};

let currentUser = null;
let authReady = false;

// 로그인한 계정에 특별 지급 칭호가 있으면 소유 목록에 추가
function syncSpecialTitles() {
    if (!userData.titles) userData.titles = ['newbie'];
    if (!currentUser) return;
    const grants = SPECIAL_TITLE_GRANTS[currentUser.email];
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
        equippedTitle: 'newbie'
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
    if (!document.getElementById('auth-agree-checkbox').checked) {
        errorBox.textContent = '개인정보 수집·이용 및 해외 이전에 동의해주세요.';
        return;
    }

    try {
        setAuthSubmitting(true);
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        currentUser = cred.user;
        const defaultData = buildDefaultUserData(nickname);
        await db.collection('users').doc(cred.user.uid).set(defaultData);

        userData.name = defaultData.name;
        userData.rank = defaultData.rank;
        userData.coin = defaultData.coin;
        userData.point = defaultData.point;
        userData.avatarUrl = defaultData.avatarUrl;
        userData.bannerUrl = defaultData.bannerUrl;
        userData.currentTheme = defaultData.currentTheme;
        userData.customThemeBgUrl = defaultData.customThemeBgUrl;
        userData.aboutMe = defaultData.aboutMe;
        userData.titles = defaultData.titles.slice();
        userData.equippedTitle = defaultData.equippedTitle;
        customDDays = defaultData.ddays;
        syncSpecialTitles();
        if (SPECIAL_TITLE_GRANTS[currentUser.email]) await saveUserDataToFirestore();

        closeAuthModal();
        enterMainApp();
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
    await auth.signOut();
    currentUser = null;
    document.getElementById('main-app').style.display = 'none';
    document.body.style.overflow = 'hidden';
    openAuthModal('login');
}

function switchAccount() {
    closeSettingsModal();
    logOut();
}

// ===== Firestore 데이터 불러오기 / 저장하기 =====
async function loadUserDataFromFirestore(uid) {
    const docSnap = await db.collection('users').doc(uid).get();
    if (docSnap.exists) {
        const data = docSnap.data();
        userData.name = data.name || "oo님";
        userData.rank = data.rank || "??";
        userData.coin = data.coin ?? 500;
        userData.point = data.point ?? 0;
        userData.avatarUrl = data.avatarUrl || null;
        userData.bannerUrl = data.bannerUrl || null;
        userData.currentTheme = data.currentTheme || 'dark';
        userData.customThemeBgUrl = data.customThemeBgUrl || null;
        userData.aboutMe = data.aboutMe || "자기소개를 적어보세요!";
        userData.titles = (data.titles && data.titles.length) ? data.titles : ['newbie'];
        userData.equippedTitle = data.equippedTitle || 'newbie';
        customDDays = data.ddays || [{ id: 1, title: "🎄 크리스마스", date: "2026-12-25" }];
    }
}

// 프로필/설정이 바뀔 때마다 이 함수를 호출해서 Firestore에 저장합니다.
async function saveUserDataToFirestore() {
    if (!currentUser) return;
    try {
        await db.collection('users').doc(currentUser.uid).set({
            name: userData.name,
            rank: userData.rank,
            coin: userData.coin,
            point: userData.point,
            avatarUrl: userData.avatarUrl,
            bannerUrl: userData.bannerUrl,
            currentTheme: userData.currentTheme,
            customThemeBgUrl: userData.customThemeBgUrl,
            aboutMe: userData.aboutMe,
            titles: userData.titles,
            equippedTitle: userData.equippedTitle,
            ddays: customDDays
        }, { merge: true });
    } catch (err) {
        console.error('Firestore 저장 실패:', err);
    }
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
        case 'auth/network-request-failed': return '네트워크 연결을 확인해주세요.';
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
    document.getElementById('auth-password-toggle-icon').className = 'fa-solid fa-eye';
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
        icon.className = 'fa-solid fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fa-solid fa-eye';
    }
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
        loadUserDataFromFirestore(currentUser.uid).then(() => {
            syncSpecialTitles();
            enterMainApp();
        });
    } else {
        document.body.style.overflow = 'hidden';
        openAuthModal('login');
    }
}

function enterMainApp() {
    document.body.style.overflow = 'auto';
    document.getElementById('main-app').style.display = 'block';
    setTheme(userData.currentTheme || 'dark');
    loadPage('profile', document.querySelector('.nav-btn.active'));
}
