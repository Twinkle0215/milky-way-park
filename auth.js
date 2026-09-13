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

let currentUser = null;
let authReady = false;

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
        ddays: [{ id: 1, title: "🎄 크리스마스", date: "2026-12-25" }]
    };
}

// 로그인 상태는 계속 감지만 하고, 화면 전환은 각 함수에서 직접 처리
auth.onAuthStateChanged((user) => {
    currentUser = user;
    authReady = true;
});

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
        const cred = await auth.createUserWithEmailAndPassword(email, password);
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
        customDDays = defaultData.ddays;

        closeAuthModal();
        enterMainApp();
    } catch (err) {
        errorBox.textContent = translateAuthError(err.code);
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
        const cred = await auth.signInWithEmailAndPassword(email, password);
        await loadUserDataFromFirestore(cred.user.uid);
        closeAuthModal();
        enterMainApp();
    } catch (err) {
        errorBox.textContent = translateAuthError(err.code);
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
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential': return '이메일 또는 비밀번호가 올바르지 않습니다.';
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
    const mode = document.getElementById('auth-submit-btn').getAttribute('data-mode');
    if (mode === 'signup') signUp(); else logIn();
}

// ===== 인트로 화면 이후 진입 지점 (script.js의 startApp에서 호출됨) =====
function proceedAfterIntro() {
    if (!authReady) {
        setTimeout(proceedAfterIntro, 150);
        return;
    }
    if (currentUser) {
        loadUserDataFromFirestore(currentUser.uid).then(enterMainApp);
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
