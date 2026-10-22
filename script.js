// ===== 배경음악(BGM) 관련 =====
const BGM_VIDEO_ID = 'BccJP9c4RpM';
let ytPlayer = null;
let ytReady = false;
let isBgmMuted = false;

// 유튜브 BGM 라이브러리는 "시작하기"를 누를 때, 그리고 인터넷이 있을 때만 불러온다
// → 첫 화면이 훨씬 빨리 뜨고, 오프라인에서도 에러가 나지 않는다
let ytApiRequested = false;
function loadYouTubeApi() {
    if (ytApiRequested || !navigator.onLine) return;
    ytApiRequested = true;
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => { ytApiRequested = false; };
    document.head.appendChild(s);
}

function onYouTubeIframeAPIReady() {
    ytPlayer = new YT.Player('yt-player', {
        height: '0',
        width: '0',
        videoId: BGM_VIDEO_ID,
        playerVars: {
            autoplay: 0,
            controls: 0,
            loop: 1,
            playlist: BGM_VIDEO_ID,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            playsinline: 1
        },
        events: {
            'onReady': function() {
                ytReady = true;
                updateMuteIcon();
            },
            'onStateChange': function(event) {
                if (event.data === YT.PlayerState.ENDED) {
                    ytPlayer.playVideo();
                }
            },
            'onError': function(event) {
                console.error('YouTube 재생 오류 코드:', event.data);
            }
        }
    });
}

let bgmRetry = 0;
function playBGM() {
    if (ytReady && ytPlayer && typeof ytPlayer.playVideo === 'function') {
        ytPlayer.mute();
        isBgmMuted = true;
        updateMuteIcon();
        ytPlayer.playVideo();
        setTimeout(() => {
            ytPlayer.unMute();
            ytPlayer.setVolume(100);
            isBgmMuted = false;
            updateMuteIcon();
        }, 400);
    } else if (ytApiRequested && navigator.onLine && bgmRetry++ < 50) { // 최대 약 15초만 재시도 (YouTube API 차단 환경 대비)
        setTimeout(playBGM, 300);
    }
}

function toggleMute() {
    if (!ytPlayer || !ytReady) return;
    if (isBgmMuted) {
        ytPlayer.unMute();
        ytPlayer.setVolume(100);
        isBgmMuted = false;
    } else {
        ytPlayer.mute();
        isBgmMuted = true;
    }
    updateMuteIcon();
}

function updateMuteIcon() {
    const icon = document.getElementById('mute-btn-icon');
    if (!icon) return;
    icon.className = isBgmMuted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
}
// ===== 배경 캔버스 애니메이션 (테마별 배경 연출) =====
const canvas = document.getElementById('space-canvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const stars = [];
for (let i = 0; i < 150; i++) {
    stars.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        radius: Math.random() * 1.2 + 0.3,
        alpha: Math.random(),
        speed: Math.random() * 0.02 + 0.005
    });
}

const snowflakes = [];
for (let i = 0; i < 180; i++) {
    snowflakes.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        radius: Math.random() * 3 + 1.2,
        speedY: Math.random() * 1.5 + 0.7,
        speedX: Math.random() * 0.8 - 0.4,
        opacity: Math.random() * 0.7 + 0.3
    });
}

const leaves = [];
const leafColors = ['#d97706', '#dc2626', '#b45309', '#f59e0b', '#9a3412'];
for (let i = 0; i < 45; i++) {
    leaves.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        size: Math.random() * 8 + 6,
        speedY: Math.random() * 1.2 + 0.8,
        speedX: Math.random() * 1.5 - 0.75,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.04,
        color: leafColors[Math.floor(Math.random() * leafColors.length)],
        opacity: Math.random() * 0.5 + 0.5
    });
}

function drawLeaf(ctx, x, y, size, angle, color, opacity) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.globalAlpha = opacity;
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.quadraticCurveTo(size * 0.8, -size * 0.3, size * 0.6, size * 0.4);
    ctx.quadraticCurveTo(0, size * 0.6, -size * 0.6, size * 0.4);
    ctx.quadraticCurveTo(-size * 0.8, -size * 0.3, 0, -size);
    ctx.fill();
    ctx.restore();
}

let waveTime = 0;

function drawTopDownWaveLayer(ctx, options) {
    const { reachY, amplitude, frequency, speed, color, foamColor } = options;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let x = 0; x <= canvas.width; x += 5) {
        const y = reachY + Math.sin(x * frequency + waveTime * speed) * amplitude + Math.cos(x * frequency * 0.6 - waveTime * speed * 0.9) * (amplitude * 0.5);
        ctx.lineTo(x, y);
    }
    ctx.lineTo(canvas.width, 0);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    if (foamColor) {
        ctx.beginPath();
        for (let x = 0; x <= canvas.width; x += 5) {
            const y = reachY + Math.sin(x * frequency + waveTime * speed) * amplitude + Math.cos(x * frequency * 0.6 - waveTime * speed * 0.9) * (amplitude * 0.5);
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = foamColor;
        ctx.lineWidth = 3;
        ctx.stroke();
    }
    ctx.restore();
}

function drawShell(ctx, x, y, size, angle, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, size, Math.PI, 0);
    ctx.lineTo(size * 0.3, size * 0.4);
    ctx.lineTo(-size * 0.3, size * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) {
        ctx.moveTo(0, size * 0.4);
        ctx.lineTo((i / 2) * (size * 0.8), -size * 0.8);
    }
    ctx.stroke();
    ctx.restore();
}

function drawSandCastle(ctx, x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#eab308';
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(-45, -20, 90, 40);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(-25, -45, 50, 25);
    ctx.fill();
    ctx.stroke();
    for (let i = -25; i < 25; i += 12.5) {
        ctx.fillRect(i, -53, 7, 8);
        ctx.strokeRect(i, -53, 7, 8);
    }
    ctx.beginPath();
    ctx.rect(-50, -35, 20, 15);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(-50, -41, 6, 6); ctx.strokeRect(-50, -41, 6, 6);
    ctx.fillRect(-36, -41, 6, 6); ctx.strokeRect(-36, -41, 6, 6);
    ctx.beginPath();
    ctx.rect(30, -35, 20, 15);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(30, -41, 6, 6); ctx.strokeRect(30, -41, 6, 6);
    ctx.fillRect(44, -41, 6, 6); ctx.strokeRect(44, -41, 6, 6);
    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.arc(0, 20, 10, Math.PI, 0);
    ctx.rect(-10, 10, 20, 10);
    ctx.fill();
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -53);
    ctx.lineTo(0, -75);
    ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(0, -75);
    ctx.lineTo(15, -68);
    ctx.lineTo(0, -61);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

class ShootingStar {
    constructor(isInitial = false) { this.reset(isInitial); }
    reset(isInitial = false) {
        this.x = Math.random() * (canvas.width * 1.2) - (canvas.width * 0.2);
        this.y = Math.random() * -200;
        this.length = Math.random() * 100 + 140; 
        this.speed = Math.random() * 2 + 2; 
        this.size = Math.random() * 1.2 + 0.8; 
        if (isInitial) {
            this.waitTime = 0;
            this.active = true;
        } else {
            this.waitTime = new Date().getTime() + Math.random() * 2500 + 500;
            this.active = false;
        }
    }
    update() {
        if (!this.active) {
            if (new Date().getTime() > this.waitTime) this.active = true;
            return;
        }
        this.x -= this.speed * 1.2;
        this.y += this.speed;
        if (this.x < -300 || this.y > canvas.height + 300) this.reset(false);
    }
    draw() {
        if (!this.active) return;
        const angle = Math.atan2(this.speed, -this.speed * 1.2);
        const tailX = this.x - Math.cos(angle) * this.length;
        const tailY = this.y - Math.sin(angle) * this.length;
        const grad = ctx.createLinearGradient(this.x, this.y, tailX, tailY);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        grad.addColorStop(1, 'rgba(147, 197, 253, 0)');
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(tailX, tailY);
        ctx.strokeStyle = grad;
        ctx.lineWidth = this.size;
        ctx.stroke();
        ctx.restore();
    }
}
const meteors = Array.from({ length: 4 }, () => new ShootingStar(true));

function animate() {
    if (document.body.classList.contains('theme-snow')) {
        ctx.fillStyle = '#0b1120';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        snowflakes.forEach(flake => {
            flake.y += flake.speedY;
            flake.x += flake.speedX + Math.sin(flake.y * 0.02) * 0.3;
            if (flake.y > canvas.height - 35) { flake.y = -10; flake.x = Math.random() * canvas.width; }
            ctx.beginPath();
            ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${flake.opacity})`;
            ctx.fill();
        });
    } else if (document.body.classList.contains('theme-autumn')) {
        ctx.fillStyle = '#1c0d02';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        leaves.forEach(leaf => {
            leaf.y += leaf.speedY;
            leaf.x += leaf.speedX + Math.sin(leaf.y * 0.015);
            leaf.angle += leaf.spin;
            if (leaf.y > canvas.height + 20) { leaf.y = -20; leaf.x = Math.random() * canvas.width; }
            drawLeaf(ctx, leaf.x, leaf.y, leaf.size, leaf.angle, leaf.color, leaf.opacity);
        });
    } else if (document.body.classList.contains('theme-summer')) {
        ctx.fillStyle = '#fef3c7';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const castleX = canvas.width > 600 ? canvas.width - 120 : canvas.width - 80;
        const castleY = canvas.height - 110;
        const castleScale = canvas.width > 600 ? 0.9 : 0.7;
        drawSandCastle(ctx, castleX, castleY, castleScale);

        drawShell(ctx, canvas.width * 0.15, canvas.height - 120, 14, -0.3, '#fbcfe8');
        drawShell(ctx, canvas.width * 0.22, canvas.height - 80, 10, 0.4, '#fed7aa');
        drawShell(ctx, canvas.width * 0.65, canvas.height - 100, 12, -0.6, '#ffffff');
        drawShell(ctx, canvas.width * 0.45, canvas.height - 140, 9, 0.2, '#fbcfe8');

        waveTime += 0.025;
        const baseReach = canvas.height * 0.35;
        const waveShift = Math.sin(waveTime * 0.6) * (canvas.height * 0.08);

        drawTopDownWaveLayer(ctx, { reachY: baseReach + waveShift * 0.4, amplitude: 18, frequency: 0.008, speed: 0.8, color: '#0284c7' });
        drawTopDownWaveLayer(ctx, { reachY: baseReach + 50 + waveShift * 0.7, amplitude: 22, frequency: 0.01, speed: 1.1, color: '#38bdf8', foamColor: 'rgba(255, 255, 255, 0.5)' });
        drawTopDownWaveLayer(ctx, { reachY: baseReach + 100 + waveShift, amplitude: 25, frequency: 0.012, speed: 1.4, color: 'rgba(186, 230, 253, 0.85)', foamColor: '#ffffff' });

    } else if (document.body.classList.contains('theme-custom-image')) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = '#030308';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        stars.forEach(star => {
            star.alpha += star.speed;
            if (star.alpha >= 1) { star.alpha = 1; star.speed = -Math.abs(star.speed); }
            else if (star.alpha <= 0.2) { star.alpha = 0.2; star.speed = Math.abs(star.speed); }
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
            ctx.fill();
        });
        meteors.forEach(meteor => { meteor.update(); meteor.draw(); });
    }
    requestAnimationFrame(animate);
}

animate();
// ===== 앱 핵심 로직: 시작 화면, 유저데이터, 테마, 프로필, 모달, D-Day, 페이지 전환 =====

function startApp() {
    document.getElementById('intro-screen').classList.add('fade-out');
    setTimeout(() => {
        // auth.js의 로그인 상태 확인 후 로그인 모달 또는 메인 화면으로 분기
        proceedAfterIntro();
    }, 800);
    loadYouTubeApi();
    playBGM();
}

// ===== 칭호 시스템 =====
// 새 칭호를 추가하려면 여기에 항목만 추가하면 됩니다. (id: {name, icon, badgeStyle})
const TITLE_CATALOG = {
    newbie:  { name: '뉴비',   icon: 'fa-seedling', badgeStyle: 'background:rgba(76,175,80,0.15); color:#4CAF50; border:1px solid rgba(76,175,80,0.3);' },
    creator: { name: '제작자', icon: 'fa-crown',    badgeStyle: 'background:linear-gradient(135deg,#a855f7,#ec4899); color:#fff; border:none;' },
    eternal_test_subject: { name: '영원한 실험체', icon: 'fa-flask',              badgeStyle: 'background:linear-gradient(135deg,#38bdf8,#0284c7); color:#fff; border:none;' },
    alpha_tester:          { name: '알파 테스터',   icon: 'fa-screwdriver-wrench', badgeStyle: 'background:linear-gradient(135deg,#ef4444,#b91c1c); color:#fff; border:none;' }
};

// 로그인 후 auth.js의 loadUserDataFromFirestore()가 아래 값을 실제 계정 데이터로 채웁니다.
let userData = { 
    name: "oo님", rank: "??", coin: 500, point: 0, 
    avatarUrl: null, bannerUrl: null, currentTheme: 'dark', customThemeBgUrl: null,
    aboutMe: "자기소개를 적어보세요!",
    titles: ['newbie'], equippedTitle: 'newbie'
};

let customDDays = [{ id: 1, title: "🎄 크리스마스", date: "2026-12-25" }];
let editingDDayId = null, deletingDDayId = null;

function updateTopMoney() {
    const coinDisplay = document.getElementById('top-coin-display');
    if (coinDisplay) coinDisplay.textContent = `${userData.coin.toLocaleString()}원`;
}

function calculateDDay(targetDate) {
    const today = new Date(); today.setHours(0, 0, 0, 0); 
    const p = String(targetDate).split('-').map(Number); // 'YYYY-MM-DD'를 기기 시간대 기준으로 해석 (UTC 해석으로 하루 밀리는 문제 방지)
    const target = new Date(p[0], (p[1] || 1) - 1, p[2] || 1);
    const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "D-Day";
    return diffDays > 0 ? `D-${diffDays}` : `D+${Math.abs(diffDays)}`;
}

let imgScale = 1, imgPosX = 0, imgPosY = 0, isDragging = false, startX = 0, startY = 0, rawImgObj = new Image();
let bannerImgScale = 1, bannerImgPosX = 0, bannerImgPosY = 0, isBannerDragging = false, bannerStartX = 0, bannerStartY = 0, rawBannerImgObj = new Image();

function updateCropTransform() {
    const img = document.getElementById('crop-img');
    const slider = document.getElementById('zoom-range');
    if (img && slider) {
        imgScale = parseFloat(slider.value);
        img.style.transform = `translate(-50%, -50%) translate(${imgPosX}px, ${imgPosY}px) scale(${imgScale})`;
    }
}

function updateBannerCropTransform() {
    const img = document.getElementById('banner-crop-img');
    const slider = document.getElementById('banner-zoom-range');
    if (img && slider) {
        bannerImgScale = parseFloat(slider.value);
        img.style.transform = `translate(-50%, -50%) translate(${bannerImgPosX}px, ${bannerImgPosY}px) scale(${bannerImgScale})`;
    }
}

function onAvatarSelected(e) {
    const file = e.target.files[0];
    e.target.value = ''; // 같은 파일을 다시 골라도 동작
    if (file) {
        const reader = new FileReader();
        reader.onload = function(ev) {
            const cropImg = document.getElementById('crop-img');
            const modal = document.getElementById('crop-modal');
            modal.style.display = 'flex'; // 먼저 보여줘야 컨테이너 실제 크기를 잴 수 있음

            cropImg.onload = function() {
                const container = document.getElementById('crop-area');
                const rect = container.getBoundingClientRect();
                // containScale: 사진 전체가 원 안에 다 들어오는 배율 (슬라이더 최소값)
                const containScale = Math.min(rect.width / cropImg.naturalWidth, rect.height / cropImg.naturalHeight);
                // coverScale: 원을 빈틈없이 꽉 채우는 배율 (기본 시작값)
                const coverScale = Math.max(rect.width / cropImg.naturalWidth, rect.height / cropImg.naturalHeight);

                imgScale = coverScale;
                imgPosX = 0; imgPosY = 0;

                const slider = document.getElementById('zoom-range');
                slider.min = containScale.toFixed(3);
                slider.max = (coverScale * 3).toFixed(3);
                slider.step = 0.01;
                slider.value = coverScale.toFixed(3);

                updateCropTransform();
            };
            cropImg.src = ev.target.result;
            rawImgObj.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    }
}

function closeCropModal() {
    document.getElementById('crop-modal').style.display = 'none';
}

// ===== 이미지 압축 도우미 (Firestore 문서 1MB 한도 보호) =====
// canvas -> 작은 data URL. WebP 우선, 미지원 브라우저(구형 Safari 등)는 JPEG로 대체
function canvasToSmallDataURL(canvas, quality) {
    const q = quality || 0.82;
    const webp = canvas.toDataURL('image/webp', q);
    if (webp.indexOf('data:image/webp') === 0) return webp;
    const flat = document.createElement('canvas'); // JPEG는 투명도가 없으므로 배경색으로 채움
    flat.width = canvas.width; flat.height = canvas.height;
    const fctx = flat.getContext('2d');
    fctx.fillStyle = '#1c1c24';
    fctx.fillRect(0, 0, flat.width, flat.height);
    fctx.drawImage(canvas, 0, 0);
    return flat.toDataURL('image/jpeg', q);
}

// 파일 -> 긴 변 maxSide 이하로 줄이고, 60만 자 이하가 될 때까지 화질/크기를 낮춘 data URL
function compressImageFile(file, maxSide, quality, maxLen) {
    const LIMIT = maxLen || 600000;
    return new Promise((resolve, reject) => {
        const objUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            try {
                let w = img.naturalWidth, h = img.naturalHeight;
                const scale = Math.min(1, maxSide / Math.max(w, h));
                w = Math.max(1, Math.round(w * scale));
                h = Math.max(1, Math.round(h * scale));
                let q = quality || 0.8;
                const canvas = document.createElement('canvas');
                const draw = () => {
                    canvas.width = w; canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    return canvasToSmallDataURL(canvas, q);
                };
                let url = draw();
                for (let i = 0; i < 8 && url.length > LIMIT; i++) {
                    if (q > 0.5) q -= 0.1;
                    else { w = Math.max(1, Math.round(w * 0.8)); h = Math.max(1, Math.round(h * 0.8)); }
                    url = draw();
                }
                if (url.length > LIMIT * 1.3) reject(new Error('too large'));
                else resolve(url);
            } catch (err) { reject(err); }
            finally { URL.revokeObjectURL(objUrl); }
        };
        img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error('load failed')); };
        img.src = objUrl;
    });
}

function saveCroppedAvatar() {
    const outputSize = 300;
    const img = document.getElementById('crop-img');
    const container = document.getElementById('crop-area');
    const containerRect = container.getBoundingClientRect();
    // 미리보기 화면(컨테이너)과 실제 저장 캔버스 크기가 다르므로 배율을 맞춰줌
    const ratio = outputSize / containerRect.width;

    const canvas = document.createElement('canvas');
    canvas.width = outputSize; canvas.height = outputSize;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, outputSize, outputSize);
    ctx.save();
    // 미리보기에서 보이던 위치(imgPosX/Y)와 배율(imgScale)을 그대로 ratio만큼 확대해서 적용
    ctx.translate(outputSize / 2 + imgPosX * ratio, outputSize / 2 + imgPosY * ratio);
    ctx.scale(imgScale * ratio, imgScale * ratio);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.restore();
    
    userData.avatarUrl = canvasToSmallDataURL(canvas, 0.85);
    closeCropModal();
    loadPage('profile');
    if (typeof saveUserDataToFirestore === 'function') saveUserDataToFirestore();
}

function onBannerSelected(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) {
        const reader = new FileReader();
        reader.onload = function(ev) {
            const cropImg = document.getElementById('banner-crop-img');
            const modal = document.getElementById('banner-crop-modal');
            modal.style.display = 'flex'; // 먼저 보여줘야 컨테이너 실제 크기를 잴 수 있음

            cropImg.onload = function() {
                const container = document.getElementById('banner-crop-area');
                const rect = container.getBoundingClientRect();
                const containScale = Math.min(rect.width / cropImg.naturalWidth, rect.height / cropImg.naturalHeight);
                const coverScale = Math.max(rect.width / cropImg.naturalWidth, rect.height / cropImg.naturalHeight);

                bannerImgScale = coverScale;
                bannerImgPosX = 0; bannerImgPosY = 0;

                const slider = document.getElementById('banner-zoom-range');
                slider.min = containScale.toFixed(3);
                slider.max = (coverScale * 3).toFixed(3);
                slider.step = 0.01;
                slider.value = coverScale.toFixed(3);

                updateBannerCropTransform();
            };
            cropImg.src = ev.target.result;
            rawBannerImgObj.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    }
}

function closeBannerCropModal() {
    document.getElementById('banner-crop-modal').style.display = 'none';
}

function saveCroppedBanner() {
    const img = document.getElementById('banner-crop-img');
    const container = document.getElementById('banner-crop-area');
    const containerRect = container.getBoundingClientRect();
    // 출력 해상도를 미리보기 컨테이너와 "같은 비율"로 만들어서 좌우/상하가 밀리지 않게 함
    const upscale = 3; // 화질을 위해 미리보기보다 3배 크게 저장
    const outputWidth = Math.round(containerRect.width * upscale);
    const outputHeight = Math.round(containerRect.height * upscale);
    const ratio = upscale; // outputWidth/containerRect.width 와 동일

    const canvas = document.createElement('canvas');
    canvas.width = outputWidth; canvas.height = outputHeight;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, outputWidth, outputHeight);
    ctx.save();
    ctx.translate(outputWidth / 2 + bannerImgPosX * ratio, outputHeight / 2 + bannerImgPosY * ratio);
    ctx.scale(bannerImgScale * ratio, bannerImgScale * ratio);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.restore();
    
    userData.bannerUrl = canvasToSmallDataURL(canvas, 0.82);
    closeBannerCropModal();
    loadPage('profile');
    if (typeof saveUserDataToFirestore === 'function') saveUserDataToFirestore();
}

function initCropEvents() {
    const cropArea = document.getElementById('crop-area');
    const startDrag = (e) => {
        isDragging = true;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        startX = clientX - imgPosX; startY = clientY - imgPosY;
    };
    const doDrag = (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        imgPosX = clientX - startX; imgPosY = clientY - startY;
        updateCropTransform();
    };
    const stopDrag = () => { isDragging = false; };
    if (cropArea) {
        cropArea.addEventListener('mousedown', startDrag);
        cropArea.addEventListener('touchstart', startDrag, { passive: false });
    }
    window.addEventListener('mousemove', doDrag);
    window.addEventListener('mouseup', stopDrag);
    window.addEventListener('touchmove', doDrag, { passive: false });
    window.addEventListener('touchend', stopDrag);

    const bannerCropArea = document.getElementById('banner-crop-area');
    const startBannerDrag = (e) => {
        isBannerDragging = true;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        bannerStartX = clientX - bannerImgPosX; bannerStartY = clientY - bannerImgPosY;
    };
    const doBannerDrag = (e) => {
        if (!isBannerDragging) return;
        e.preventDefault();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        bannerImgPosX = clientX - bannerStartX; bannerImgPosY = clientY - bannerStartY;
        updateBannerCropTransform();
    };
    const stopBannerDrag = () => { isBannerDragging = false; };
    if (bannerCropArea) {
        bannerCropArea.addEventListener('mousedown', startBannerDrag);
        bannerCropArea.addEventListener('touchstart', startBannerDrag, { passive: false });
    }
    window.addEventListener('mousemove', doBannerDrag);
    window.addEventListener('mouseup', stopBannerDrag);
    window.addEventListener('touchmove', doBannerDrag, { passive: false });
    window.addEventListener('touchend', stopBannerDrag);
}

initCropEvents();

// ===== 상점: 테마 구매 =====
function renderThemeShop() {
    const grid = document.getElementById('theme-shop-grid');
    if (!grid) return;
    const sellable = THEME_LIST.filter(t => t.id !== 'dark' && t.id !== 'light');
    grid.innerHTML = sellable.map(t => {
        const owned = isThemeOwned(t.id);
        return `
            <div class="game-card" style="${owned ? 'opacity:0.6;' : ''}">
                <div class="game-icon">${t.emoji}</div>
                <div>
                    <div class="game-title">${t.name}</div>
                    <div class="game-desc">${owned ? '보유중' : THEME_PRICE.toLocaleString() + '원'}</div>
                </div>
                <button class="game-play-btn" ${owned ? 'style="background:#555;" disabled' : `onclick="buyTheme('${t.id}')"`}>${owned ? '보유중' : '구매하기'}</button>
            </div>`;
    }).join('');
}

async function buyTheme(id) {
    if (isThemeOwned(id)) return;
    if (!requireOnline('테마 구매')) return;
    const theme = THEME_LIST.find(t => t.id === id);
    if (!confirm(`${theme ? theme.emoji + ' ' + theme.name : id} 테마를 ${THEME_PRICE.toLocaleString()}원에 구매할까요?`)) return;

    // 아직 서버에 안 보낸 코인 증감분을 먼저 저장해서, 서버 기준 잔액 검사가 로컬과 어긋나지 않게 함
    await saveUserDataToFirestore();

    // 코인 차감 + 소유 목록 추가를 Firestore 트랜잭션으로 원자적으로 처리.
    // (기존에는 로컬 값을 통째로 덮어써서, 그 사이 다른 저장이 끼어들면 방금 산 테마가 사라지는 버그가 있었음)
    const ref = db.collection('users').doc(currentUser.uid);
    let result = 'ok';
    try {
        await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const data = snap.data() || {};
            const serverCoin = data.coin ?? 0;
            const serverOwned = (data.ownedThemes && data.ownedThemes.length) ? data.ownedThemes : ['dark', 'light'];
            if (serverOwned.includes(id)) { result = 'already'; return; }
            if (serverCoin < THEME_PRICE) { result = 'poor'; return; }
            tx.update(ref, {
                coin: serverCoin - THEME_PRICE,
                ownedThemes: firebase.firestore.FieldValue.arrayUnion(id)
            });
        });
    } catch (e) {
        console.error('테마 구매 실패:', e);
        alert('구매 중 오류가 발생했어요. 다시 시도해주세요.');
        return;
    }

    if (result === 'poor') {
        alert(`코인이 부족해요! (필요: ${THEME_PRICE.toLocaleString()}원)`);
        return;
    }

    // 서버 기준으로 로컬 상태 동기화
    if (!userData.ownedThemes) userData.ownedThemes = ['dark', 'light'];
    if (!userData.ownedThemes.includes(id)) userData.ownedThemes.push(id);
    if (result === 'ok') applyServerCoinDelta(-THEME_PRICE); // 서버가 이미 차감했으므로 동기화 기준도 함께 이동
    updateTopMoney();
    renderThemeShop();
    if (result === 'ok') alert('✅ 구매 완료! 설정 → 테마 선택에서 장착할 수 있어요.');
}

// 테마 목록 (여기에 항목 추가하면 캐러셀에도 자동으로 반영됨)
const THEME_LIST = [
    { id: 'dark', name: '다크', emoji: '⚫', swatch: '#030308' },
    { id: 'light', name: '라이트', emoji: '⚪', swatch: '#ffffff' },
    { id: 'aurora', name: '오로라', emoji: '🌌', swatch: '#004d40' },
    { id: 'sunset', name: '노을', emoji: '🌅', swatch: '#ff5e36' },
    { id: 'neon', name: '네온', emoji: '👾', swatch: '#ff007f' },
    { id: 'lavender', name: '라벤더', emoji: '🪻', swatch: '#c084fc' },
    { id: 'deepspace', name: '딥 스페이스', emoji: '🚀', swatch: '#1e1b4b' },
    { id: 'summer', name: '여름', emoji: '🏖️', swatch: '#38bdf8' },
    { id: 'autumn', name: '가을', emoji: '🍁', swatch: '#d97706' },
    { id: 'snow', name: '겨울', emoji: '❄️', swatch: '#38bdf8' },
    { id: 'custom-image', name: '커스텀 이미지', emoji: '🖼️', swatch: null }
];

const THEME_PRICE = 1000; // 다크/라이트 제외 모든 테마 가격

function isThemeOwned(id) {
    if (id === 'dark' || id === 'light') return true; // 기본 무료 테마
    return !!(userData.ownedThemes && userData.ownedThemes.includes(id));
}

function setTheme(themeName) {
    userData.currentTheme = themeName; 
    document.body.className = '';
    document.body.style.background = '';
    document.body.style.backgroundImage = '';

    if (themeName === 'custom-image') {
        document.body.classList.add('theme-custom-image');
        if (userData.customThemeBgUrl) {
            const _bg = safeImgUrl(userData.customThemeBgUrl);
            if (_bg) document.body.style.backgroundImage = `url('${_bg}')`;
        }
    } else if (themeName !== 'dark') {
        document.body.classList.add('theme-' + themeName);
    } else {
        document.body.style.background = '#030308';
    }
    
    // localStorage에 저장 (페이지 재로드 시 빠르게 복원하기 위함)
    try {
        localStorage.setItem('currentTheme', themeName);
        localStorage.setItem('themeOwnerUid', (typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : '');
        if (themeName === 'custom-image' && userData.customThemeBgUrl) {
            localStorage.setItem('customThemeBgUrl', userData.customThemeBgUrl);
        } else {
            // 커스텀 이미지가 아니면 저장된 이미지 제거
            localStorage.removeItem('customThemeBgUrl');
        }
    } catch (e) {
        console.warn('localStorage 저장 실패:', e);
    }
    
    if (typeof saveUserDataToFirestore === 'function') saveUserDataToFirestore();
}

function setCustomImageTheme(e) {
    const file = e.target.files[0];
    if (!file) return;
    // 원본 그대로 저장하면 Firestore 1MB 한도를 넘어 프로필 저장이 통째로 실패하므로 줄여서 저장
    compressImageFile(file, 1280, 0.8, 350000).then(url => {
        userData.customThemeBgUrl = url;
        setTheme('custom-image');
        setPickerActive('theme-picker-track', 'custom-image');
    }).catch(() => {
        alert('이미지를 불러오지 못했어요. JPG / PNG / WebP 파일을 사용해주세요.');
    });
    e.target.value = ''; // 같은 파일을 다시 골라도 동작하도록
}

function renderEquippedTitleBadge() {
    const owned = userData.titles && userData.titles.length ? userData.titles : ['newbie'];
    const equippedId = owned.includes(userData.equippedTitle) ? userData.equippedTitle : 'newbie';
    const t = TITLE_CATALOG[equippedId] || TITLE_CATALOG.newbie;
    return `<span class="badge" style="${t.badgeStyle} margin-left:6px;"><i class="fa-solid ${t.icon}" style="font-size:10px; margin-right:4px;"></i>${t.name}</span>`;
}

// ===== 드래그(스와이프) 캐러셀 공통 로직 =====

// 트랙 안에서 현재 활성(active) 항목을 지정하고 그 항목이 가운데 오도록 스크롤
function setPickerActive(trackId, id, smooth = true) {
    const track = document.getElementById(trackId);
    if (!track) return;
    Array.from(track.children).forEach(c => c.classList.toggle('active', c.getAttribute('data-id') === id));
    const el = track.querySelector(`[data-id="${id}"]`);
    if (el) el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: smooth ? 'smooth' : 'instant' });
}

// 스크롤(드래그)이 멈추면 가운데에 가장 가까운 항목을 찾아 onSettle로 알려줌
function attachPickerScrollHandler(trackId, onSettle) {
    const track = document.getElementById(trackId);
    if (!track || track.dataset.scrollBound) return;
    track.dataset.scrollBound = '1';
    let scrollTimer = null;
    track.addEventListener('scroll', () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
            const trackRect = track.getBoundingClientRect();
            const centerX = trackRect.left + trackRect.width / 2;
            let closest = null, closestDist = Infinity;
            Array.from(track.children).forEach(child => {
                const r = child.getBoundingClientRect();
                const dist = Math.abs((r.left + r.width / 2) - centerX);
                if (dist < closestDist) { closestDist = dist; closest = child; }
            });
            if (closest) {
                Array.from(track.children).forEach(c => c.classList.remove('active'));
                closest.classList.add('active');
                onSettle(closest.getAttribute('data-id'));
            }
        }, 120);
    });
}

// ===== 테마 선택 캐러셀 =====
function openThemePicker() {
    const track = document.getElementById('theme-picker-track');
    let html = '';
    THEME_LIST.forEach(t => {
        const isActive = userData.currentTheme === t.id;
        const owned = isThemeOwned(t.id);
        const swatchStyle = t.swatch
            ? `background:${t.swatch};`
            : `background:linear-gradient(135deg,#667eea,#764ba2); display:flex; align-items:center; justify-content:center; font-size:26px;`;
        html += `
            <div class="picker-item ${isActive ? 'active' : ''}" data-id="${t.id}" onclick="onThemePick('${t.id}')" style="${owned ? '' : 'opacity:0.5;'}">
                <div class="picker-swatch" style="${swatchStyle} position:relative;">
                    ${t.swatch ? '' : '📷'}
                    ${owned ? '' : '<div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.35); border-radius:inherit; font-size:20px;">🔒</div>'}
                </div>
                <div class="picker-label">${t.emoji} ${t.name}${owned ? '' : ` <span style="font-size:10px; color:var(--sub-text);">(${THEME_PRICE.toLocaleString()}원)</span>`}</div>
            </div>`;
    });
    track.innerHTML = html;
    attachPickerScrollHandler('theme-picker-track', onThemeSettled);
    requestAnimationFrame(() => setPickerActive('theme-picker-track', userData.currentTheme, false));
    document.getElementById('theme-picker-modal').style.display = 'flex';
}

function closeThemePicker() {
    document.getElementById('theme-picker-modal').style.display = 'none';
    const label = document.getElementById('current-theme-label');
    if (label) {
        const t = THEME_LIST.find(t => t.id === userData.currentTheme);
        label.textContent = t ? t.name : userData.currentTheme;
    }
}

function onThemePick(id) {
    if (!isThemeOwned(id)) {
        setPickerActive('theme-picker-track', userData.currentTheme); // 원래 위치로 되돌림
        alert(`🔒 아직 보유하지 않은 테마예요.\n상점에서 ${THEME_PRICE.toLocaleString()}원에 구매할 수 있어요!`);
        return;
    }
    if (id === 'custom-image') {
        document.getElementById('theme-image-input').click();
        return;
    }
    setPickerActive('theme-picker-track', id);
    setTheme(id);
}

function onThemeSettled(id) {
    if (!isThemeOwned(id)) return; // 잠긴 테마는 스크롤로 스쳐도 자동 장착되지 않음
    if (id === 'custom-image') return; // 드래그로만 스쳐 지나간 경우엔 자동 적용하지 않음 (탭해야 업로드 시작)
    setTheme(id);
}

// ===== 칭호 선택 캐러셀 =====
function openTitlePicker() {
    const track = document.getElementById('title-picker-track');
    const owned = userData.titles && userData.titles.length ? userData.titles : ['newbie'];
    let html = '';
    owned.forEach(id => {
        const t = TITLE_CATALOG[id];
        if (!t) return;
        const isActive = userData.equippedTitle === id;
        html += `
            <div class="picker-item ${isActive ? 'active' : ''}" data-id="${id}" onclick="onTitlePick('${id}')">
                <div class="picker-swatch" style="${t.badgeStyle} display:flex; align-items:center; justify-content:center; font-size:26px;">
                    <i class="fa-solid ${t.icon}"></i>
                </div>
                <div class="picker-label">${t.name}</div>
            </div>`;
    });
    track.innerHTML = html;
    attachPickerScrollHandler('title-picker-track', onTitleSettled);
    requestAnimationFrame(() => setPickerActive('title-picker-track', userData.equippedTitle, false));
    document.getElementById('title-picker-modal').style.display = 'flex';
}

function closeTitlePicker() {
    document.getElementById('title-picker-modal').style.display = 'none';
    const label = document.getElementById('current-title-label');
    if (label) {
        const t = TITLE_CATALOG[userData.equippedTitle];
        label.textContent = t ? t.name : '뉴비';
    }
}

function onTitlePick(id) {
    setPickerActive('title-picker-track', id);
    selectTitle(id);
}

function onTitleSettled(id) {
    selectTitle(id);
}

function selectTitle(id) {
    const owned = userData.titles && userData.titles.length ? userData.titles : ['newbie'];
    if (!owned.includes(id)) return;
    userData.equippedTitle = id;
    if (document.getElementById('content').innerHTML.includes('about-me-box')) loadPage('profile');
    if (typeof saveUserDataToFirestore === 'function') saveUserDataToFirestore();
}

function openSettingsModal() {
    const emailDisplay = document.getElementById('account-email-display');
    if (emailDisplay) emailDisplay.textContent = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.email : '-';

    const themeLabel = document.getElementById('current-theme-label');
    if (themeLabel) {
        const t = THEME_LIST.find(t => t.id === userData.currentTheme);
        themeLabel.textContent = t ? t.name : userData.currentTheme;
    }
    const titleLabel = document.getElementById('current-title-label');
    if (titleLabel) {
        const t = TITLE_CATALOG[userData.equippedTitle];
        titleLabel.textContent = t ? t.name : '뉴비';
    }

    document.getElementById('settings-modal').style.display = 'flex';
}
function closeSettingsModal() { document.getElementById('settings-modal').style.display = 'none'; }
function openCreditModal() { document.getElementById('credit-modal').style.display = 'flex'; }
function closeCreditModal() { document.getElementById('credit-modal').style.display = 'none'; }

// 게임 센터 카드 클릭 도우미: 해당 게임 스크립트가 로드되지 않았어도 카드는 보이고, 원인을 알려준다
function openGameSafe(globalName, label) {
    const g = window[globalName];
    if (g && typeof g.open === 'function') { g.open(); return; }
    alert(label + ' 게임 파일을 불러오지 못했어요.\n페이지를 새로고침(캐시 삭제)해도 계속되면 관리자에게 알려주세요.');
}

function loadPage(page, btn) {
    // 게임 페이지를 벗어나거나 다시 로드할 때 끝말잇기 세션 종료(타이머/봇 응답 포함)
    stopWordGame();

    const _navs = Array.from(document.querySelectorAll('.nav-btn'));
    _navs.forEach(b => b.classList.remove('active'));
    if (!btn) btn = _navs.find(b => (b.getAttribute('onclick') || '').indexOf("'" + page + "'") !== -1); // 버튼 없이 호출돼도 메뉴 강조 유지
    if (btn) btn.classList.add('active');
    updateTopMoney();

    const content = document.getElementById('content');
    if (page === 'profile') {
        const _banner = safeImgUrl(userData.bannerUrl);
        const bannerStyle = _banner ? `background-image: url('${_banner}'); background-size: cover; background-position: center;` : '';
        const _avatar = safeImgUrl(userData.avatarUrl);
        const avatarHTML = _avatar ? `<img src="${_avatar}" class="avatar">` : `<div class="avatar"><i class="fa-solid fa-user"></i></div>`;
        content.innerHTML = `
            <div class="card profile-card">
                <div class="banner-container" style="${bannerStyle}">
                    <button class="edit-banner-btn" onclick="document.getElementById('banner-input').click()"><i class="fa-solid fa-pen"></i></button>
                </div>
                <div class="profile-body">
                    <div class="avatar-wrapper">${avatarHTML}<button class="edit-avatar-btn" onclick="document.getElementById('avatar-input').click()"><i class="fa-solid fa-pen"></i></button></div>
                    <div class="user-info">
                        <div class="user-info-header">
                            <h2>${escHtml(userData.name)}</h2>
                            <button class="edit-name-btn" onclick="openModal()"><i class="fa-solid fa-pen"></i></button>
                        </div>
                        <div style="display: flex; justify-content: center; align-items: center; gap: 6px; margin-top: 8px; flex-wrap: wrap;">
                            <span class="badge"><i class="fa-solid fa-coins" style="font-size:10px; margin-right:3px;"></i><span id="coin-rank-display">로딩중</span></span>
                            <span class="badge" id="tier-badge-display" onclick="openRankInfoModal()" style="cursor:pointer;">⚙️ 로딩중</span>
                            <span id="equipped-title-badge"></span>
                        </div>
                    </div>
                    <div class="about-me-box">
                        <div class="about-me-header">
                            <span class="about-me-title">자기소개</span>
                            <button class="edit-name-btn" onclick="openAboutModal()"><i class="fa-solid fa-pen"></i></button>
                        </div>
                        <div class="about-me-content">${escHtml(userData.aboutMe)}</div>
                    </div>
                </div>
            </div>
            <div class="card">
                <h3 style="margin-top:0; font-size:16px;"><i class="fa-solid fa-wallet" style="color:var(--accent-color);"></i> 내 자산 & 스탯</h3>
                <div class="stats-grid">
                    <div class="stat-item"><div class="stat-title">보유 코인</div><div class="stat-value" style="color:#ffca28;">${userData.coin.toLocaleString()}원</div></div>
                    <div class="stat-item"><div class="stat-title">랭크 포인트</div><div class="stat-value" style="color:#42a5f5;">${(userData.gameStats && userData.gameStats.totalGamePoint) || 0} P</div></div>
                </div>
            </div>
            <div class="card" style="text-align:left;">
                <div class="card-header-flex">
                    <h3 style="margin:0; font-size:16px;"><i class="fa-solid fa-calendar-check" style="color:var(--accent-color);"></i> D-Day</h3>
                    <button class="add-dday-btn" onclick="openDDayModal()">+ 기념일 추가</button>
                </div>
                <div class="dday-list" id="dday-list-container"></div>
            </div>
            <div class="card" style="text-align:left;">
                <h3 style="margin-top:0; font-size:16px;"><i class="fa-solid fa-table" style="color:var(--accent-color);"></i> 주간 시간표</h3>
                <div class="timetable-container">
                    <table class="timetable">
                        <thead><tr><th>교시</th><th>월(24)</th><th>화(25)</th><th>수(26)</th><th>목(27)</th><th>금(28)</th></tr></thead>
                        <tbody>
                            <tr><td class="time-col">1</td><td><div class="subject">영어</div><div class="teacher">하*연</div></td><td><div class="subject">체육</div><div class="teacher">권*관</div></td><td><div class="subject">기가</div><div class="teacher">박*정</div></td><td><div class="subject">국어</div><div class="teacher">박*정</div></td><td><div class="subject">과학</div><div class="teacher">양*빈</div></td></tr>
                            <tr><td class="time-col">2</td><td><div class="subject">체육</div><div class="teacher">권*관</div></td><td><div class="subject">국어</div><div class="teacher">박*정</div></td><td><div class="subject">사회</div><div class="teacher">김*화</div></td><td><div class="subject">미술</div><div class="teacher">이*정</div></td><td><div class="subject">정보A</div><div class="teacher">오*철</div></td></tr>
                            <tr><td class="time-col">3</td><td><div class="subject">수학</div><div class="teacher">김*경</div></td><td><div class="subject">영어</div><div class="teacher">박*연</div></td><td><div class="subject">체육</div><div class="teacher">권*관</div></td><td><div class="subject">진로</div><div class="teacher">류*선</div></td><td><div class="subject">국어</div><div class="teacher">박*정</div></td></tr>
                            <tr><td class="time-col">4</td><td><div class="subject">과학</div><div class="teacher">양*빈</div></td><td><div class="subject">수학</div><div class="teacher">김*경</div></td><td><div class="subject">수학</div><div class="teacher">김*경</div></td><td><div class="subject">사회</div><div class="teacher">김*화</div></td><td><div class="subject">기가</div><div class="teacher">박*정</div></td></tr>
                            <tr><td class="time-col">5</td><td><div class="subject">클럽</div><div class="teacher">홍*미</div></td><td><div class="subject">미술</div><div class="teacher">이*정</div></td><td><div class="subject">국어</div><div class="teacher">박*정</div></td><td><div class="subject">영어</div><div class="teacher">박*연</div></td><td><div class="subject">정보B</div><div class="teacher">김*일</div></td></tr>
                            <tr><td class="time-col">6</td><td><div class="subject">도덕</div><div class="teacher">박*인</div></td><td><div class="subject">사회</div><div class="teacher">김*화</div></td><td><div class="subject">자율</div><div class="teacher">자*</div></td><td><div class="subject">수학</div><div class="teacher">김*경</div></td><td><div class="subject">영어</div><div class="teacher">박*연</div></td></tr>
                            <tr><td class="time-col">7</td><td>-</td><td><div class="subject">도덕</div><div class="teacher">박*인</div></td><td>-</td><td><div class="subject">과학</div><div class="teacher">양*빈</div></td><td>-</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>`;
        renderDDays();
        loadUserCoinRankAndTier();
    } else if (page === 'quest') {
        if (window.Quests) window.Quests.renderPage(content);
        else content.innerHTML = `<div class="card preparing-box"><i class="fa-solid fa-scroll"></i><h2>퀘스트를 불러오지 못했어요</h2><p>페이지를 새로고침해주세요.</p></div>`;
    } else if (page === 'game') {
        content.innerHTML = `
            <div class="card" style="text-align:left;">
                <h2 style="margin-top:0; font-size:18px;"><i class="fa-solid fa-gamepad" style="color:var(--accent-color);"></i> 은하수 게임 센터</h2>
                <p style="font-size:13px; color:var(--sub-text); margin-bottom:15px;">원하는 게임을 선택해 플레이하고 보상을 획득하세요!</p>
                
                <div class="game-grid">
                    <div class="game-card" onclick="startWordChainGame()">
                        <div class="game-icon-badge" style="--ib1:#6366f1; --ib2:#8b5cf6;"><i class="fa-solid fa-comment-dots"></i></div>
                        <div>
                            <div class="game-title">끝말잇기</div>
                            <div class="game-desc">30초 제한! 국어사전 봇과 대결!</div>
                        </div>
                        <button class="game-play-btn">플레이</button>
                    </div>
                    <div class="game-card" data-omok-card="1" onclick="openGameSafe('Omok', '오목')">
                        <div class="game-icon">⚫⚪</div>
                        <div>
                            <div class="game-title">오목</div>
                            <div class="game-desc">다른 유저와 실시간 온라인 대전!</div>
                        </div>
                        <button class="game-play-btn">플레이</button>
                    </div>
                    <div class="game-card" data-ttt-card="1" onclick="openGameSafe('Ttt', '틱택토')">
                        <div class="game-icon">❌⭕</div>
                        <div>
                            <div class="game-title">틱택토</div>
                            <div class="game-desc">다른 유저와 실시간 온라인 대전!</div>
                        </div>
                        <button class="game-play-btn">플레이</button>
                    </div>
                    <div class="game-card" onclick="FlappyUI.open()">
                        <div class="game-icon-badge" style="--ib1:#38bdf8; --ib2:#0284c7;"><i class="fa-solid fa-dove"></i></div>
                        <div>
                            <div class="game-title">플라피 버드</div>
                            <div class="game-desc">가시 기둥 하나 통과할 때마다 10코인!</div>
                        </div>
                        <button class="game-play-btn">플레이</button>
                    </div>
                    <div class="game-card" onclick="TetrisUI.open()">
                        <div class="game-icon-badge" style="--ib1:#a855f7; --ib2:#6d28d9;"><i class="fa-solid fa-cubes"></i></div>
                        <div>
                            <div class="game-title">테트리스</div>
                            <div class="game-desc">솔로 · 온라인 대결 · 랭크!</div>
                        </div>
                        <button class="game-play-btn">플레이</button>
                    </div>
                    <div class="game-card" style="opacity: 0.6; cursor: default;">
                        <div class="game-icon-badge" style="--ib1:#22c55e; --ib2:#15803d;"><i class="fa-solid fa-chart-line"></i></div>
                        <div>
                            <div class="game-title">은하수 주식</div>
                            <div class="game-desc">코인 투자 시뮬레이션</div>
                        </div>
                        <button class="game-play-btn" style="background:#555;">준비중</button>
                    </div>
                    <div class="game-card" style="opacity: 0.6; cursor: default;">
                        <div class="game-icon-badge" style="--ib1:#14b8a6; --ib2:#0f766e;"><i class="fa-solid fa-fish"></i></div>
                        <div>
                            <div class="game-title">낚시왕</div>
                            <div class="game-desc">물고기 잡아보세요!</div>
                        </div>
                        <button class="game-play-btn" style="background:#555;">준비중</button>
                    </div>
                    <div class="game-card" style="opacity: 0.6; cursor: default;">
                        <div class="game-icon-badge" style="--ib1:#f43f5e; --ib2:#be123c;"><i class="fa-solid fa-hammer"></i></div>
                        <div>
                            <div class="game-title">무기 강화</div>
                            <div class="game-desc">극한의 확률 강화!</div>
                        </div>
                        <button class="game-play-btn" style="background:#555;">준비중</button>
                    </div>
                </div>
            </div>`;
    } else if (page === 'rank') {
        renderRankingPage();
    } else if (page === 'shop') {
        content.innerHTML = `
            <div class="card" style="text-align:left;">
                <h2 style="margin-top:0; font-size:18px;"><i class="fa-solid fa-store" style="color:var(--accent-color);"></i> 은하수 상점</h2>
                <div class="game-grid">
                    <div class="game-card" onclick="LottoUI.open()">
                        <div class="game-icon-badge" style="--ib1:#fbbf24; --ib2:#d97706;"><i class="fa-solid fa-ticket"></i></div>
                        <div>
                            <div class="game-title">은하수 로또</div>
                            <div class="game-desc">1,000원 · 매주 토요일 추첨</div>
                        </div>
                        <button class="game-play-btn">구매하기</button>
                    </div>
                </div>
            </div>
            <div class="card" style="text-align:left; margin-top:14px;">
                <h2 style="margin-top:0; font-size:18px;"><i class="fa-solid fa-palette" style="color:var(--accent-color);"></i> 테마</h2>
                <p style="font-size:12px; color:var(--sub-text); margin-top:-6px;">구매한 테마는 설정 → 테마 선택에서 장착할 수 있어요.</p>
                <div class="game-grid" id="theme-shop-grid"></div>
            </div>`;
        renderThemeShop();
    }
}

// D-Day 및 모달 관리 함수
function openDDayModal(id = null) {
    editingDDayId = id;
    if (id) {
        const found = customDDays.find(d => d.id === id);
        if (found) {
            document.getElementById('dday-modal-title').textContent = "기념일 수정";
            document.getElementById('dday-title-input').value = found.title;
            document.getElementById('dday-date-input').value = found.date;
        }
    } else {
        document.getElementById('dday-modal-title').textContent = "기념일 추가";
        document.getElementById('dday-title-input').value = "";
        document.getElementById('dday-date-input').value = (() => { const n = new Date(); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); })();
    }
    document.getElementById('dday-modal').style.display = 'flex';
}

function closeDDayModal() {
    document.getElementById('dday-modal').style.display = 'none';
    editingDDayId = null;
}

function saveCustomDDay() {
    const title = document.getElementById('dday-title-input').value.trim();
    const date = document.getElementById('dday-date-input').value;
    if (!title || !date) {
        alert("기념일 이름과 날짜를 모두 입력해주세요!");
        return;
    }

    if (editingDDayId) {
        const item = customDDays.find(d => d.id === editingDDayId);
        if (item) { item.title = title; item.date = date; }
    } else {
        if (customDDays.length >= 30) { alert('기념일은 최대 30개까지 만들 수 있어요.'); return; } // 서버 규칙(30개)과 맞춤: 넘기면 모든 저장이 거부됨
        const newId = customDDays.length > 0 ? Math.max(...customDDays.map(d => d.id)) + 1 : 1;
        customDDays.push({ id: newId, title, date });
    }

    closeDDayModal();
    renderDDays();
    if (typeof saveUserDataToFirestore === 'function') saveUserDataToFirestore();
}

function renderDDays() {
    const container = document.getElementById('dday-list-container');
    if (!container) return;

    let html = '';
    customDDays.forEach(d => {
        const tag = calculateDDay(d.date);
        html += `
            <div class="dday-item">
                <div class="dday-info">
                    <span class="dday-title">${escHtml(d.title)}</span>
                </div>
                <div class="dday-actions">
                    <span class="dday-tag">${tag}</span>
                    <button class="dday-btn" onclick="openDDayModal(${d.id})"><i class="fa-solid fa-pen"></i></button>
                    <button class="dday-btn delete-btn" onclick="openDeleteModal(${d.id})"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

async function loadUserCoinRankAndTier() {
    // (1) 이 기기에 있는 정보만으로 그릴 수 있는 부분: 등급 / 칭호 (인터넷이 없어도 바로 표시)
    try {
        if (typeof calculateTier === 'function' && userData.gameStats) {
            const gameStats = userData.gameStats || {};
            const stats = (typeof getGameStats === 'function') ? getGameStats(gameStats) : { totalGamePoint: 0 };
            const tier = calculateTier(stats.totalGamePoint);

            const tierBadge = document.getElementById('tier-badge-display');
            if (tierBadge) {
                const iconHTML = (typeof getTierIconHTML === 'function') ? getTierIconHTML(tier.key, 14) : tier.emoji;
                tierBadge.innerHTML = `${iconHTML} ${tier.tier}`;
                tierBadge.className = 'badge';
                tierBadge.style.display = 'inline-flex';
                tierBadge.style.alignItems = 'center';
                tierBadge.style.gap = '4px';
            }
        }
        const titleBadge = document.getElementById('equipped-title-badge');
        if (titleBadge) titleBadge.innerHTML = renderEquippedTitleBadge();
    } catch (error) {
        console.error('등급/칭호 표시 실패:', error);
    }

    // (2) 코인 순위: 서버에서 가져와야 하므로 인터넷이 있을 때만
    const coinRankDisplay = document.getElementById('coin-rank-display');
    if (!navigator.onLine) {
        if (coinRankDisplay) coinRankDisplay.textContent = '오프라인';
        return;
    }
    try {
        // 프로필을 다시 그릴 때마다 유저 50명 문서(이미지 포함)를 내려받지 않도록 60초 캐시
        if (window._coinRankCache && window._coinRankCache.uid === currentUser.uid && Date.now() - window._coinRankCache.t < 60000) {
            if (coinRankDisplay) coinRankDisplay.textContent = window._coinRankCache.text;
            return;
        }
        const snapshot = await db.collection('users').orderBy('coin', 'desc').limit(50).get();
        // Firestore forEach 콜백은 index를 주지 않으므로 docs 배열에서 위치를 찾는다
        const coinIdx = snapshot.docs.findIndex(d => d.id === currentUser.uid);
        const coinRank = coinIdx >= 0 ? coinIdx + 1 : 0;
        const _rankText = coinRank > 0 ? `#${coinRank}` : '50위 밖';
        window._coinRankCache = { uid: currentUser.uid, t: Date.now(), text: _rankText };
        if (coinRankDisplay) coinRankDisplay.textContent = _rankText;
    } catch (error) {
        console.error('코인 랭킹 로드 실패:', error);
        if (coinRankDisplay) coinRankDisplay.textContent = navigator.onLine ? '로드실패' : '오프라인';
    }
}

function openDeleteModal(id) {
    deletingDDayId = id;
    document.getElementById('delete-modal').style.display = 'flex';
}

function closeDeleteModal() {
    document.getElementById('delete-modal').style.display = 'none';
    deletingDDayId = null;
}

function confirmDeleteDDay() {
    if (deletingDDayId !== null) {
        customDDays = customDDays.filter(d => d.id !== deletingDDayId);
        closeDeleteModal();
        renderDDays();
        if (typeof saveUserDataToFirestore === 'function') saveUserDataToFirestore();
    }
}

function openModal() { document.getElementById('modal').style.display = 'flex'; }

function openLegalNoticeModal() {
    const modal = document.createElement('div');
    modal.id = 'legal-notice-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10001;
        overflow-y: auto;
    `;

    modal.innerHTML = `
        <div style="background: var(--bg-color); border-radius: 16px; max-width: 500px; width: 90%; margin: 20px auto; padding: 24px; position: relative;">
            <button onclick="document.getElementById('legal-notice-modal').remove()" style="position: absolute; top: 12px; right: 12px; background: none; border: none; color: var(--text-color); font-size: 24px; cursor: pointer; padding: 0; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">×</button>
            
            <h2 style="margin-top: 0; font-size: 16px; font-weight: bold; margin-bottom: 16px;">법적 고지</h2>
            
            <div style="font-size: 12px; line-height: 1.6; color: var(--text-color); max-height: 70vh; overflow-y: auto;">
                <p><strong>면책 조항 (Terms of Disclaimer)</strong></p>
                
                <p>본 웹사이트("은하수 속 놀이터(Milky Way Park)")의 모든 서비스, 기능, 콘텐츠 이용에 따른 결과에 대해 사용자가 전적인 책임을 집니다.</p>
                
                <p><strong>사용자 책임</strong><br>
                • 본 사이트 이용 중 발생한 모든 손해, 손실, 피해에 대해 사용자가 책임집니다.<br>
                • 게임 결과, 포인트 변동, 코인 거래 등 모든 결과에 대해 사용자가 책임집니다.<br>
                • 계정 보안, 비밀번호 관리 등의 책임은 사용자에게 있습니다.<br>
                • 부정행위, 규칙 위반으로 인한 모든 결과에 대해 사용자가 책임집니다.</p>
                
                <p><strong>면책사항</strong><br>
                • 본 사이트는 명시되지 않은 어떠한 보증도 제공하지 않습니다.<br>
                • 서비스 중단, 오류, 버그로 인한 손해에 대해 책임지지 않습니다.<br>
                • 데이터 손실, 계정 해킹 등의 사고에 대해 책임지지 않습니다.</p>
                
                <p><strong>약관 동의</strong><br>
                본 사이트를 이용함으로써, 사용자는 위의 모든 조항에 동의하는 것으로 간주됩니다.</p>
            </div>

            <button onclick="document.getElementById('legal-notice-modal').remove()" style="width: 100%; padding: 12px; margin-top: 16px; background: var(--accent-color); border: none; border-radius: 8px; color: white; font-weight: bold; cursor: pointer; font-size: 14px;">확인</button>
        </div>
    `;

    document.body.appendChild(modal);
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}
function closeModal() { document.getElementById('modal').style.display = 'none'; }
function saveName() {
    const input = document.getElementById('name-input').value.trim();
    if (input.length > 30 || /[<>]/.test(input)) {
        alert('닉네임은 30자 이하로, < > 문자 없이 입력해주세요.');
        return;
    }
    if(input) {
        userData.name = input;
        closeModal();
        loadPage('profile');
        if (typeof saveUserDataToFirestore === 'function') saveUserDataToFirestore();
    }
}

function openAboutModal() {
    document.getElementById('about-input').value = userData.aboutMe === "자기소개를 적어보세요!" ? "" : userData.aboutMe;
    document.getElementById('about-modal').style.display = 'flex';
}
function closeAboutModal() { document.getElementById('about-modal').style.display = 'none'; }
function saveAbout() {
    const input = document.getElementById('about-input').value.trim().slice(0, 500);
    userData.aboutMe = input || "자기소개를 적어보세요!";
    closeAboutModal();
    loadPage('profile');
    if (typeof saveUserDataToFirestore === 'function') saveUserDataToFirestore();
}
// ===== 끝말잇기 게임 로직 =====
const SAM_API_KEY = "";   // 보안상 코드에 키를 넣지 않음 (사전 API는 현재 꺼져 있음. 쓰려면 서버에서 호출해야 안전)
let wordHistory = [];
let currentWord = "";
let isGameActive = false;
let botTurnCount = 0;

// 30초 제한 타이머 관련 변수
let wordTimer = null;
let timeLeft = 30;

const koreanDictionary = [
    "파도", "파티", "파란색", "파인애플", "파리", "파출소", "파스", "파괴", "파면", "파수꾼", "파장",
    "나무", "무지개", "개구리", "리듬", "음악", "악기", "기차", "차량", "양말", "말풍선",
    "선풍기", "기구", "구름", "름바", "바다", "다리", "리본", "본사", "사자", "자전거",
    "거북이", "이발소", "소나무", "무도회", "회오리", "리포터", "터널", "널뛰기", "기상청",
    "청소년", "연필", "필통", "통장", "장미", "미술", "술래", "래프팅", "팀워크", "크레파스",
    "스케이트", "트럭", "럭비", "비행기", "기름", "음료수", "수박", "박수", "수영장", "장난감",
    "감자", "자동차", "차이점", "점심", "심리학", "학교", "교실", "실내화", "화분", "분수",
    "수건", "건물", "물고기", "기린", "인형", "형제", "제비", "비누", "누나", "나비",
    "비타민", "민들레", "레몬", "몬스터", "터미널", "널판지", "지구", "구두", "두부", "부채",
    "채소", "소풍", "풍선", "선물", "물병", "병아리", "리모컨", "컨테이너", "너구리", "리더십",
    "십자가", "가방", "방울", "울타리", "리그", "그림", "림프절", "절벽", "벽지", "지도",
    "도서관", "관광", "광고", "고구마", "마늘", "늘봄", "봄바람", "람보르기니", "니트", "트리",
    "리허설", "설날", "날씨", "씨앗", "앗차", "차례", "예약", "약속", "속옷", "옷장",
    "장갑", "갑자기", "기술", "술집", "집게", "게임", "임금", "금붕어", "어항", "항구",
    "구슬", "슬픔", "슬리퍼", "니모", "모래", "래퍼", "퍼즐", "즐거움", "움직임",
    "임팩트", "트림", "림보", "보물", "물감", "감기", "기억", "억지", "지갑", "갑옷",
    "옷걸이", "이불", "불꽃", "꽃병", "병원", "원숭이", "이야기", "기타", "타조", "조개",
    "개나리", "리코더", "더위", "위성", "성공", "공책", "책상", "상자", "자물쇠", "쇠고기",
    "기와", "와이파이", "이슬", "슬리퍼", "퍼레이드", "드론", "론리플래닛", "닛산", "산책",
    "책가방", "방패", "패션", "션샤인", "인사", "사슴", "슴베", "베개", "개미", "미로",
    "로봇", "봇짐", "짐승", "승부", "부엌칼", "칼국수", "수제비", "비둘기",
    "기와집", "집중", "중력", "역할극", "극장", "장난꾸러기", "기침", "침대", "대나무",
    "무궁화", "화가", "가수", "수학", "학생", "생일", "일기장", "장난기", "기념일",
    "일요일", "일벌레", "레이저", "저금통", "통역", "역사책", "책벌레", "레고", "고래",
    "래시가드", "드라마", "마술사", "사탕", "탕수육", "육아", "아기", "기저귀", "귀걸이",
    "이유식", "식탁", "탁구", "구경", "경찰서", "서랍", "랍스터", "터치스크린", "린스",
    "스티커", "커피", "피자", "자석", "석유", "유치원", "원피스", "스카프", "프라이팬",
    "팬케이크", "크리스마스", "스노우볼", "볼펜", "펜치", "치약", "약국", "국수", "수도꼭지",
    "지퍼", "퍼포먼스", "스마트폰", "폰트", "트램펄린", "린넨", "넨네", "네트워크", "크림",
    "림스키", "키보드", "드레스", "스웨터", "터틀넥", "넥타이", "이어폰", "폰케이스", "스팸",
    "팸플릿", "릿지", "지질학", "학원", "원장", "장난감가게", "게이머", "머그컵", "컵라면",
    "면접관", "관람차", "차창", "창문", "문화재", "재봉틀", "틀니", "니은", "은메달",
    "달팽이", "이빨", "빨래", "래핑지", "지렁이", "이끼", "끼니", "니트웨어", "어패류",
    "류마티스", "스티치", "치즈", "즈음", "음식점", "점토", "토마토", "토끼", "끼리끼리",
    "리모델링", "링거", "거미줄", "줄넘기", "기타리스트", "트로피", "피아노", "노트북",
    "북극곰", "곰인형", "형광펜", "펜션", "션트", "트랙터", "터전", "전화기", "기와지붕",
    "붕어빵", "빵집", "집주인", "인테리어", "어부", "부화", "화장품", "품질", "질문",
    "문제집", "집배원", "원목가구", "구독자", "자막", "막대사탕", "탕비실", "실습생",
    "생선구이", "이불장", "장식품", "품평회", "회전목마", "마카롱", "롱코트", "트로트",
    "트램", "램프", "프린터", "터미네이터", "터빈", "빈대떡", "떡볶이", "이불보", "보관함",
    "함박눈", "눈사람", "람다", "다람쥐", "쥐포", "포도주", "주스", "스낵"
];

const fatalEndChars = ['륨', '늄', '슘', '튬', '듐', '븀', '뮴', '녘', '즘'];
const fatalWords = [
    // -륨 / -늄 / -슘 / -튬 / -듐 / -븀 / -뮴 (원소 이름)
    "헬륨", "나트륨", "칼륨", "바륨", "갈륨", "탈륨", "큐륨", "이트륨", "베릴륨", "탄탈륨", "툴륨", "사마륨",
    "우라늄", "알루미늄", "티타늄", "게르마늄", "셀레늄", "폴로늄", "플루토늄", "지르코늄", "하프늄",
    "마그네슘", "칼슘", "세슘", "프랑슘", "아메리슘",
    "리튬", "스트론튬", "테크네튬",
    "라듐", "팔라듐", "이리듐", "루비듐", "로듐", "스칸듐", "네오디뮴",
    "카드뮴", "오스뮴", "이터븀", "에르븀", "니오븀",
    // -녘
    "초저녁", "새벽녘", "해질녘", "저물녘", "아침녘", "황혼녘", "동틀녘", "해뜰녘",
    // -즘
    "알고리즘", "메커니즘", "나르시시즘", "휴머니즘", "사디즘", "마조히즘", "내셔널리즘", "아마추어리즘"
];
koreanDictionary.push(...fatalWords);

function isFatalWord(word) {
    const last = getLastChar(word);
    return fatalEndChars.includes(last);
}

function fetchWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

let lastApiError = "";
let apiWarned = false;
// true로 바꾸면: 사전 확인이 안 될 때 내장 사전에 없는 단어는 전부 거절
const STRICT_WHEN_API_DOWN = false;

// 사전 API 사용 여부: 키/접속 문제가 있으면 false (대기 없이 words.txt만 사용)
const USE_API = false;

async function fetchWithCorsFallback(targetUrl) {
    if (!USE_API) return null;
    const attempts = [
        [targetUrl, 800],
        [`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`, 1500],
        [`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`, 1500]
    ];
    for (const [url, ms] of attempts) {
        try {
            const res = await fetchWithTimeout(url, ms);
            if (res.ok) {
                const text = await res.text();
                try {
                    const json = JSON.parse(text);
                    if (json && json.error) {   // 키 오류 등 API가 돌려준 에러
                        lastApiError = `${json.error.error_code || ''} ${json.error.message || ''}`.trim();
                        console.error("[끝말잇기] 사전 API 에러:", json.error);
                        return null;
                    }
                    lastApiError = "";
                    return json;
                } catch (e) {
                    lastApiError = "응답이 JSON이 아님(프록시/키 문제 가능)";
                    console.warn("[끝말잇기] JSON 아님:", text.slice(0, 120));
                }
            }
        } catch (e) { }
    }
    console.warn("[끝말잇기] 사전 API 접속 실패 (직접/프록시 모두)");
    return null;
}

function applyDueum(char) {
    const code = char.charCodeAt(0) - 0xAC00;
    if (code < 0 || code >= 11172) return char;

    const initial = Math.floor(code / 588);
    const medial = Math.floor((code % 588) / 28);
    const final = code % 28;

    // ㅑ ㅒ ㅕ ㅖ ㅛ ㅠ ㅣ
    const isY = [2, 3, 6, 7, 12, 17, 20].includes(medial);

    if (initial === 2 && isY) {            // ㄴ → ㅇ (녀→여, 뉴→유, 니→이)
        return String.fromCharCode(0xAC00 + (11 * 588) + (medial * 28) + final);
    }
    if (initial === 5) {                   // ㄹ
        const newInitial = isY ? 11 : 2;   // 량→양, 리→이 / 라→나, 로→노
        return String.fromCharCode(0xAC00 + (newInitial * 588) + (medial * 28) + final);
    }
    return char;
}

// 이어질 수 있는 시작 글자 전부 (원래 글자 + 두음법칙 + 역두음)
function candidateStarts(char) {
    const set = new Set([char, applyDueum(char)]);
    const code = char.charCodeAt(0) - 0xAC00;
    if (code >= 0 && code < 11172) {
        const initial = Math.floor(code / 588);
        const medial = Math.floor((code % 588) / 28);
        const final = code % 28;
        const isY = [2, 3, 6, 7, 12, 17, 20].includes(medial);
        const make = ini => String.fromCharCode(0xAC00 + ini * 588 + medial * 28 + final);
        if (initial === 11 && isY) { set.add(make(2)); set.add(make(5)); }   // 여 → 녀, 려
        else if (initial === 2 && !isY) { set.add(make(5)); }               // 나 → 라
    }
    return [...set];
}

function startWordChainGame() {
    loadWordList();
    wordSession++;
    wordBusy = false;
    isGameActive = true;
    wordHistory = [];
    botTurnCount = 0;
    
    let safeDict = koreanDictionary.filter(w => !isFatalWord(w));
    const randomStartIndex = Math.floor(Math.random() * safeDict.length);
    currentWord = safeDict[randomStartIndex];
    wordHistory.push(currentWord);

    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="card word-game-container">
            <div class="word-game-header">
                <button class="word-back-btn" onclick="loadPage('game')"><i class="fa-solid fa-arrow-left"></i> 나가기</button>
                <span style="font-weight:bold; font-size:14px;"><i class="fa-solid fa-comments" style="color:var(--accent-color);"></i> 끝말잇기 대결</span>
            </div>
      
            <!-- 30초 타이머 바 추가 -->
            <div class="word-timer-bar-container">
                <div id="word-timer-bar" class="word-timer-bar"></div>
            </div>

            <div class="word-chat-box" id="word-chat">
                <div class="word-bubble system">🤖 표준국어대사전 AI와의 끝말잇기 게임이 시작되었습니다! (30초 안에 답하지 못하면 패배합니다!)</div>
                <div class="word-bubble bot">첫 단어는 <b>"${currentWord}"</b> 입니다! <b>'${getLastChar(currentWord)}'</b>(으)로 시작하는 단어를 30초 안에 입력해주세요!</div>
            </div>

            <div class="word-input-area">
                <input type="text" id="word-input" class="word-input" placeholder="30초 안에 단어를 입력하세요..." onkeypress="handleWordKeyPress(event)">
                <button class="word-submit-btn" onclick="submitWord()">전송</button>
            </div>
        </div>
    `;

    startWordTimer();
}

// 타이머 시작 함수
function startWordTimer(resume) {
    stopWordTimer(); // 기존 타이머 클리어
    if (!resume || !(timeLeft > 0)) timeLeft = 30; // 잘못된 입력 후엔 남은 시간부터 이어감 (무한 시간 연장 방지)
    const timerBar = document.getElementById('word-timer-bar');
    const timerStartedAt = Date.now() - (30 - timeLeft) * 1000;
    
    wordTimer = setInterval(() => {
        if (!isGameActive) {
            stopWordTimer();
            return;
        }

        timeLeft = 30 - (Date.now() - timerStartedAt) / 1000; // 탭이 백그라운드여도 정확
        if (timerBar) {
            const percent = (timeLeft / 30) * 100;
            timerBar.style.width = `${percent}%`;
            if (timeLeft <= 10) {
                timerBar.style.backgroundColor = '#ef5350'; // 10초 이하일 때 빨간색으로 변경
            } else {
                timerBar.style.backgroundColor = 'var(--accent-color)';
            }
        }

        if (timeLeft <= 0) {
            stopWordTimer();
            handleTimeOut();
        }
    }, 100);
}

// 끝말잇기 세션: 나가기/재시작 시 진행 중이던 봇 응답이 뒤늦게 반영되지 않도록 번호표를 둔다
let wordSession = 0;
let wordBusy = false;
function stopWordGame() {
    isGameActive = false;
    wordSession++;
    wordBusy = false;
    stopWordTimer();
}

// 타이머 중지 함수
function stopWordTimer() {
    if (wordTimer) {
        clearInterval(wordTimer);
        wordTimer = null;
    }
}

// 시간 초과 처리 (패배)
function handleTimeOut() {
    if (!isGameActive) return;
    isGameActive = false;
    // 한 번도 두지 않고 방치만 한 판은 퀘스트로 인정하지 않음
    if (botTurnCount > 0) { if (window.Quests) window.Quests.track('play'); if (window.Quests) window.Quests.track('wordchainPlay'); }
    addBubble("⏰ <b>시간 초과!</b> 30초 안에 단어를 입력하지 못했습니다.<br><b>승부 결과: 시간 초과로 패배하셨습니다! 😢</b>", "system");
    const inputEl = document.getElementById('word-input');
    if (inputEl) inputEl.disabled = true;
}

function getLastChar(word) {
    return word.charAt(word.length - 1);
}

function handleWordKeyPress(e) {
    if (e.key === 'Enter') submitWord();
}

function addBubble(text, sender) {
    const chatBox = document.getElementById('word-chat');
    if (!chatBox) return;
    const bubble = document.createElement('div');
    bubble.className = `word-bubble ${sender}`;
    bubble.innerHTML = text;
    chatBox.appendChild(bubble);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// ===== 내장 단어 목록 (words.txt) : API 없이 검증 + 봇이 사용 =====
let wordSet = null, wordsByStart = null, startCount = null, wordListPromise = null;

function loadWordList() {
    if (wordListPromise) return wordListPromise;
    wordListPromise = fetch('words.txt')
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(text => {
            const set = new Set(), byStart = new Map(), count = new Map();
            for (const line of text.split('\n')) {
                const w = line.trim();
                if (w.length < 2 || !/^[가-힣]+$/.test(w) || set.has(w)) continue;
                set.add(w);
                if (!byStart.has(w[0])) byStart.set(w[0], []);
                byStart.get(w[0]).push(w);
            }
            for (const [c, arr] of byStart) count.set(c, arr.length);
            wordSet = set; wordsByStart = byStart; startCount = count;
            console.log(`[끝말잇기] 단어 ${set.size}개 로드 완료`);
        })
        .catch(e => { wordListPromise = null; console.warn('[끝말잇기] words.txt 로드 실패 (다음에 다시 시도)', e); });
    return wordListPromise;
}

// 사전 없이도 명백히 가짜인 단어 거르기 (디디디디, ㅋㅋㅋ, ㅁㄴㅇㄹ 등)
function looksFake(word, apiDown) {
    if (/[ㄱ-ㅎㅏ-ㅣ]/.test(word)) return true;          // 자음/모음만 있는 글자
    if (/[^가-힣]/.test(word)) return true;               // 한글 외 문자
    if (/(.)\1{2,}/.test(word)) return true;              // 같은 글자 3번 이상 연속
    if (apiDown && word.length >= 2 && new Set(word).size === 1) return true; // 붕붕 같은 같은 글자 반복
    return false;
}

// 단어가 사전에 있는지 확인: true(있음) / false(없음) / null(확인 실패)
async function checkWordExists(word) {
    await loadWordList();
    if (koreanDictionary.includes(word) || wordHistory.includes(word)) return true;
    if (looksFake(word, false)) return false;
    if (wordSet && wordSet.has(word)) return true;    // 목록에 있으면 바로 통과 (목록에 없으면 API로 한 번 더 확인)
    const url = `https://opendict.korean.go.kr/api/search?key=${SAM_API_KEY}&req_type=json&q=${encodeURIComponent(word)}&part=word&method=exact&num=100`;
    const data = await fetchWithCorsFallback(url);
    if (!data || !data.channel) {                      // API 접근 실패 → 가짜 패턴만 거름
        console.warn("[끝말잇기] 사전 확인 불가:", word);
        if (!apiWarned && !wordSet) {
            apiWarned = true;
            addBubble(`⚠️ 사전 서버에 연결하지 못해 단어 검증이 제한돼요.${lastApiError ? `<br><small>원인: ${lastApiError}</small>` : ''}`, "system");
        }
        if (STRICT_WHEN_API_DOWN) return false;
        return looksFake(word, true) ? false : null;
    }
    if (looksFake(word, false)) return false;
    let items = data.channel.item || [];
    if (!Array.isArray(items)) items = [items];
    return items.some(it =>
        it.word && it.word.replace(/[^가-힣]/g, '') === word &&
        (!it.pos || it.pos.includes('명사'))          // 끝말잇기는 명사만 인정
    );
}

async function submitWord() {
    if (!isGameActive || wordBusy) return; // 봇이 생각하는 중/검사 중에는 중복 제출 금지
    wordBusy = true;
    const mySession = wordSession;
    try {
        await submitWordInner(mySession);
    } finally {
        if (mySession === wordSession) wordBusy = false;
    }
}

async function submitWordInner(mySession) {
    if (!isGameActive) return;

    const inputEl = document.getElementById('word-input');
    const userWord = inputEl.value.trim();
    if (!userWord) return;
    
    // 답변 제출 즉시 타이머 일시정지 및 입력값 초기화
    stopWordTimer();
    inputEl.value = '';

    const lastChar = getLastChar(currentWord);
    const altLastChar = applyDueum(lastChar);
    const firstChar = userWord.charAt(0);

    if (userWord.length < 2) {
        addBubble("⚠️ 두 글자 이상의 단어만 입력 가능합니다!", "system");
        startWordTimer(true); // 타이머 재개(남은 시간 유지)
        return;
    }

    const allowedStarts = candidateStarts(lastChar);
    if (!allowedStarts.includes(firstChar)) {
        addBubble(`⚠️ <b>'${allowedStarts.join("' / '")}'</b>(으)로 시작하는 단어여야 합니다!`, "system");
        startWordTimer(true); // 타이머 재개(남은 시간 유지)
        return;
    }

    if (wordHistory.includes(userWord)) {
        addBubble(`⚠️ <b>"${escHtml(userWord)}"</b>은(는) 이미 사용된 단어입니다!`, "system");
        startWordTimer(true); // 타이머 재개(남은 시간 유지)
        return;
    }

    // 한방단어(받을 단어가 거의 없는 끝글자)는 유저도 사용 금지 - 이걸로 봇을 즉시 이기는 편법 차단
    if (isFatalWord(userWord)) {
        addBubble(`⚠️ <b>\"${escHtml(userWord)}\"</b>은(는) 한방단어라 사용할 수 없어요! 다른 단어를 입력해주세요.`, "system");
        startWordTimer(true);
        return;
    }

    // 사전 검사 (API 접근이 안 될 때는 억울하게 막지 않도록 통과)
    const exists = await checkWordExists(userWord);
    if (mySession !== wordSession || !isGameActive) return; // 검사 중 페이지를 나갔다면 중단
    if (exists === false) {
        addBubble(`⚠️ <b>"${escHtml(userWord)}"</b>은(는) 사전에 없는 단어예요! 다른 단어를 입력해주세요.`, "system");
        startWordTimer(true);
        return;
    }

    addBubble(escHtml(userWord), "user");
    wordHistory.push(userWord);
    currentWord = userWord;

    botTurnCount++;
    updateTopMoney();

    addBubble("🤔 AI가 단어를 찾는 중...", "system");
    const loadingBubble = document.getElementById('word-chat').lastChild;

    const nextChar = getLastChar(userWord);
    const altNextChar = applyDueum(nextChar);

    // 봇이 "고민"하는 시간 (후반으로 갈수록 더 오래)
    const thinkMs = 1500 + Math.random() * 2000 + (botTurnCount >= FINISHER_AFTER_TURN ? 1000 : 0);
    setTimeout(() => { if (loadingBubble && loadingBubble.parentNode) loadingBubble.innerHTML = "🤔 후보 단어를 훑어보는 중..."; }, thinkMs * 0.4);
    setTimeout(() => { if (loadingBubble && loadingBubble.parentNode) loadingBubble.innerHTML = "🧠 어떤 글자로 끝낼지 고민하는 중..."; }, thinkMs * 0.75);
    const [result] = await Promise.all([
        findBotWord(nextChar, altNextChar),
        new Promise(r => setTimeout(r, thinkMs))
    ]);
    if (mySession !== wordSession || !isGameActive) return; // 봇이 고민하는 동안 나갔다면 결과 무시

    if (loadingBubble && loadingBubble.parentNode) {
        loadingBubble.parentNode.removeChild(loadingBubble);
    }

    if (result && result.finisher) {
        currentWord = result.word;
        wordHistory.push(result.word);
        addBubble(`<b>"${result.word}"</b>! 후후, 슬슬 승부를 볼 시간이네요 😏`, "bot");
        addBubble(`🏁 <b>한방단어</b>로 마무리! 이 글자로 이어갈 단어를 찾기 정말 어려우실 거예요.<br><b>승부 결과: 봇 승리!</b>`, "system");
        isGameActive = false;
        if (window.Quests) window.Quests.track('play'); if (window.Quests) window.Quests.track('wordchainPlay');
        const inputEl2 = document.getElementById('word-input');
        if (inputEl2) inputEl2.disabled = true;
    } else if (result) {
        currentWord = result.word;
        wordHistory.push(result.word);
        addBubble(`<b>"${result.word}"</b>! (대응 횟수: ${botTurnCount}회) 다음은 <b>'${getLastChar(result.word)}'</b> 차례입니다. 30초 안에 입력하세요!`, "bot");
        startWordTimer(); // AI 턴이 끝나고 유저 턴으로 넘어갈 때 타이머 재시작
    } else {
        addBubble(`🎉 제가 질게요! <b>'${nextChar}'</b>(으)로 시작하는 단어를 찾지 못했습니다.<br><b>축하합니다! 승리하셨습니다! (+500원 보너스)</b>`, "bot");
        userData.coin += 500;
        updateTopMoney();
        isGameActive = false;
        if (window.Quests) window.Quests.track('play'); if (window.Quests) window.Quests.track('win'); if (window.Quests) window.Quests.track('wordchainPlay');
        if (typeof saveUserDataToFirestore === 'function') saveUserDataToFirestore();
    }
}

// 사전 API에서 해당 글자로 시작하는 단어를 최대 100개 가져오기
async function fetchDictWords(char) {
    try {
        const url = `https://opendict.korean.go.kr/api/search?key=${SAM_API_KEY}&req_type=json&q=${encodeURIComponent(char)}&sort=dict&part=word&advanced=y&method=start&num=100`;
        const data = await fetchWithCorsFallback(url);
        if (data && data.channel && data.channel.item) {
            const items = Array.isArray(data.channel.item) ? data.channel.item : [data.channel.item];
            return items.map(it => it.word.replace(/[^가-힣]/g, ''));
        }
    } catch (err) { }
    return [];
}

// 단어 끝 글자가 상대에게 얼마나 어려운지 (낮을수록 봇에게 유리)
function endDifficulty(word) {
    const last = getLastChar(word);
    if (fatalEndChars.includes(last)) return -1;   // 한방단어: 최우선
    const alt = applyDueum(last);
    if (startCount) {                              // 큰 단어 목록: 이어갈 단어 수로 평가
        return candidateStarts(last).reduce((n, c) => n + (startCount.get(c) || 0), 0);
    }
    return koreanDictionary.filter(w =>
        (w.startsWith(last) || w.startsWith(alt)) && !wordHistory.includes(w)
    ).length;                                      // 이어갈 단어가 적을수록 좋음
}

// 봇이 한방단어/강공을 쓰기 시작하는 턴 (클수록 게임이 길어짐)
const FINISHER_AFTER_TURN = 8;

async function findBotWord(targetChar, altChar) {
    const starts = candidateStarts(targetChar);

    await loadWordList();
    const local = koreanDictionary.filter(w => starts.some(c => w.startsWith(c)));
    const listed = wordsByStart ? starts.flatMap(c => wordsByStart.get(c) || []) : [];
    const okWord = w => w.length >= 2 && !wordHistory.includes(w) && starts.some(c => w.startsWith(c));

    let pool = [...new Set([...local, ...listed])].filter(okWord);
    if (pool.length === 0) {                       // 포기하기 전에 사전 API까지 뒤져본다
        const remote = (await Promise.all(starts.map(fetchDictWords))).flat();
        pool = [...new Set(remote)].filter(okWord);
    }
    if (pool.length === 0) return null;

    // 난이도 곡선: 초반엔 평범하게, 후반으로 갈수록 점점 공격적으로
    const turn = botTurnCount;
    let cands = pool;
    if (turn < FINISHER_AFTER_TURN) {                       // 초반엔 한방단어 금지
        const safe = pool.filter(w => !isFatalWord(w));
        if (safe.length > 0) cands = safe;
    }
    const scored = cands
        .map(w => ({ w, score: endDifficulty(w) + Math.random() * 0.5 }))
        .sort((x, y) => x.score - y.score);

    let ratio;                                              // 상위 몇 %에서 고를지 (1 = 완전 랜덤)
    if (turn < 4) ratio = 1;
    else if (turn < FINISHER_AFTER_TURN) ratio = 0.5;
    else ratio = 0.02;
    const k = Math.max(1, Math.ceil(scored.length * ratio));
    const best = scored[Math.floor(Math.random() * k)].w;

    return { word: best, finisher: isFatalWord(best) };
}
