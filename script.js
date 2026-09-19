// ===== 배경음악(BGM) 관련 =====
const BGM_VIDEO_ID = 'BccJP9c4RpM';
let ytPlayer = null;
let ytReady = false;
let isBgmMuted = false;

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
    } else {
        setTimeout(playBGM, 300);
    }
}

function toggleMute() {
    if (!ytPlayer) return;
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
            if (star.alpha > 1 || star.alpha < 0.2) star.speed = -star.speed;
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
    const target = new Date(targetDate); target.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
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
    
    userData.avatarUrl = canvas.toDataURL('image/png');
    closeCropModal();
    loadPage('profile');
    if (typeof saveUserDataToFirestore === 'function') saveUserDataToFirestore();
}

function onBannerSelected(e) {
    const file = e.target.files[0];
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
    
    userData.bannerUrl = canvas.toDataURL('image/png');
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

function setTheme(themeName) {
    userData.currentTheme = themeName; 
    document.body.className = '';
    document.body.style.background = '';
    document.body.style.backgroundImage = '';

    if (themeName === 'custom-image') {
        document.body.classList.add('theme-custom-image');
        if (userData.customThemeBgUrl) {
            document.body.style.backgroundImage = `url('${userData.customThemeBgUrl}')`;
        }
    } else if (themeName !== 'dark') {
        document.body.classList.add('theme-' + themeName);
    } else {
        document.body.style.background = '#030308';
    }
    if (typeof saveUserDataToFirestore === 'function') saveUserDataToFirestore();
}

function setCustomImageTheme(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(ev) {
            userData.customThemeBgUrl = ev.target.result;
            setTheme('custom-image');
            setPickerActive('theme-picker-track', 'custom-image');
        };
        reader.readAsDataURL(file);
    }
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
        const swatchStyle = t.swatch
            ? `background:${t.swatch};`
            : `background:linear-gradient(135deg,#667eea,#764ba2); display:flex; align-items:center; justify-content:center; font-size:26px;`;
        html += `
            <div class="picker-item ${isActive ? 'active' : ''}" data-id="${t.id}" onclick="onThemePick('${t.id}')">
                <div class="picker-swatch" style="${swatchStyle}">${t.swatch ? '' : '📷'}</div>
                <div class="picker-label">${t.emoji} ${t.name}</div>
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
    if (id === 'custom-image') {
        document.getElementById('theme-image-input').click();
        return;
    }
    setPickerActive('theme-picker-track', id);
    setTheme(id);
}

function onThemeSettled(id) {
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

function loadPage(page, btn) {
    // 게임 페이지를 벗어나거나 다시 로드할 때 타이머 중지
    stopWordTimer();

    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    updateTopMoney();

    const content = document.getElementById('content');
    if (page === 'profile') {
        const bannerStyle = userData.bannerUrl ? `background-image: url('${userData.bannerUrl}'); background-size: cover; background-position: center;` : '';
        const avatarHTML = userData.avatarUrl ? `<img src="${userData.avatarUrl}" class="avatar">` : `<div class="avatar"><i class="fa-solid fa-user"></i></div>`;
        content.innerHTML = `
            <div class="card profile-card">
                <div class="banner-container" style="${bannerStyle}">
                    <button class="edit-banner-btn" onclick="document.getElementById('banner-input').click()"><i class="fa-solid fa-pen"></i></button>
                </div>
                <div class="profile-body">
                    <div class="avatar-wrapper">${avatarHTML}<button class="edit-avatar-btn" onclick="document.getElementById('avatar-input').click()"><i class="fa-solid fa-pen"></i></button></div>
                    <div class="user-info">
                        <div class="user-info-header">
                            <h2>${userData.name}</h2>
                            <button class="edit-name-btn" onclick="openModal()"><i class="fa-solid fa-pen"></i></button>
                        </div>
                        <span class="badge"><i class="fa-solid fa-trophy" style="font-size:10px; margin-right:4px;"></i>${userData.rank}</span>
                        ${renderEquippedTitleBadge()}
                    </div>
                    <div class="about-me-box">
                        <div class="about-me-header">
                            <span class="about-me-title">자기소개</span>
                            <button class="edit-name-btn" onclick="openAboutModal()"><i class="fa-solid fa-pen"></i></button>
                        </div>
                        <div class="about-me-content">${userData.aboutMe}</div>
                    </div>
                </div>
            </div>
            <div class="card">
                <h3 style="margin-top:0; font-size:16px;"><i class="fa-solid fa-wallet" style="color:var(--accent-color);"></i> 내 자산 & 스탯</h3>
                <div class="stats-grid">
                    <div class="stat-item"><div class="stat-title">보유 코인</div><div class="stat-value" style="color:#ffca28;">${userData.coin.toLocaleString()}원</div></div>
                    <div class="stat-item"><div class="stat-title">랭크 포인트</div><div class="stat-value" style="color:#42a5f5;">${userData.point} P</div></div>
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
    } else if (page === 'quest') {
        content.innerHTML = `<div class="card preparing-box"><i class="fa-solid fa-scroll"></i><h2>퀘스트 시스템 업데이트 예정</h2><p>일일 퀘스트, 도전 과제 및 보상 기능이 추가될 예정입니다.</p></div>`;
    } else if (page === 'game') {
        content.innerHTML = `
            <div class="card" style="text-align:left;">
                <h2 style="margin-top:0; font-size:18px;"><i class="fa-solid fa-gamepad" style="color:var(--accent-color);"></i> 은하수 게임 센터</h2>
                <p style="font-size:13px; color:var(--sub-text); margin-bottom:15px;">원하는 게임을 선택해 플레이하고 보상을 획득하세요!</p>
                
                <div class="game-grid">
                    <div class="game-card" onclick="startWordChainGame()">
                        <div class="game-icon">🗣️</div>
                        <div>
                            <div class="game-title">끝말잇기</div>
                            <div class="game-desc">30초 제한! 국어사전 봇과 대결!</div>
                        </div>
                        <button class="game-play-btn">플레이</button>
                    </div>
                    <div class="game-card" style="opacity: 0.6; cursor: default;">
                        <div class="game-icon">📈</div>
                        <div>
                            <div class="game-title">은하수 주식</div>
                            <div class="game-desc">코인 투자 시뮬레이션</div>
                        </div>
                        <button class="game-play-btn" style="background:#555;">준비중</button>
                    </div>
                    <div class="game-card" style="opacity: 0.6; cursor: default;">
                        <div class="game-icon">🎣</div>
                        <div>
                            <div class="game-title">낚시왕</div>
                            <div class="game-desc">물고기 잡아보세요!</div>
                        </div>
                        <button class="game-play-btn" style="background:#555;">준비중</button>
                    </div>
                    <div class="game-card" style="opacity: 0.6; cursor: default;">
                        <div class="game-icon">⚔️</div>
                        <div>
                            <div class="game-title">무기 강화</div>
                            <div class="game-desc">극한의 확률 강화!</div>
                        </div>
                        <button class="game-play-btn" style="background:#555;">준비중</button>
                    </div>
                </div>
            </div>`;
    } else if (page === 'rank') {
        content.innerHTML = `<div class="card preparing-box"><i class="fa-solid fa-trophy"></i><h2>랭킹 시스템 업데이트 예정</h2><p>준비 중입니다.</p></div>`;
    } else if (page === 'shop') {
        content.innerHTML = `
            <div class="card" style="text-align:left;">
                <h2 style="margin-top:0; font-size:18px;"><i class="fa-solid fa-store" style="color:var(--accent-color);"></i> 은하수 상점</h2>
                <div class="empty-shop-box">
                    <div class="empty-icon">🎁</div>
                    <h3 style="margin-bottom:8px; font-size:16px;">지금은 판매 중인 상품이 없습니다</h3>
                    <p style="font-size:13px; color:var(--sub-text); line-height:1.5;">
                        곧 멋진 아이템과 테마가 추가될 예정입니다.<br>다음 업데이트를 기대해 주세요!
                    </p>
                </div>
            </div>`;
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
        document.getElementById('dday-date-input').value = new Date().toISOString().split('T')[0];
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
                    <span class="dday-title">${d.title}</span>
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
function closeModal() { document.getElementById('modal').style.display = 'none'; }
function saveName() {
    const input = document.getElementById('name-input').value.trim();
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
    const input = document.getElementById('about-input').value.trim();
    userData.aboutMe = input || "자기소개를 적어보세요!";
    closeAboutModal();
    loadPage('profile');
    if (typeof saveUserDataToFirestore === 'function') saveUserDataToFirestore();
}
// ===== 끝말잇기 게임 로직 =====
const SAM_API_KEY = "uY3XW7tS-CtKY-KcQz-VDFG-0BHo4UJD";
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

const fatalEndChars = ['륨', '늄', '슘', '튬', '녘'];
const fatalWords = [
    "헬륨", "나트륨", "칼륨", "바륨", "리튬", "프로메튬",
    "우라늄", "알루미늄", "티타늄",
    "마그네슘", "칼슘", "세슘",
    "초저녁", "새벽녘", "해질녘", "저물녘", "아침녘", "황혼녘"
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

async function fetchWithCorsFallback(targetUrl) {
    try {
        const res = await fetchWithTimeout(targetUrl, 700);
        if (res.ok) return await res.json();
    } catch (e) { }

    try {
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
        const res2 = await fetchWithTimeout(proxyUrl, 1200);
        if (res2.ok) return await res2.json();
    } catch (e) { }

    return null;
}

function applyDueum(char) {
    const code = char.charCodeAt(0) - 0xAC00;
    if (code < 0 || code > 11172) return char;

    const initial = Math.floor(code / 588);
    const medial = Math.floor((code % 588) / 28);
    const final = code % 28;

    if (initial === 2 && [2, 3, 4, 12, 17, 18, 20].includes(medial)) {
        return String.fromCharCode(0xAC00 + (11 * 588) + (medial * 28) + final);
    }
    if (initial === 5) {
        if ([2, 3, 4, 12, 17, 18, 20].includes(medial)) {
            return String.fromCharCode(0xAC00 + (11 * 588) + (medial * 28) + final);
        } else {
            return String.fromCharCode(0xAC00 + (2 * 588) + (medial * 28) + final);
        }
    }
    return char;
}

function startWordChainGame() {
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
function startWordTimer() {
    stopWordTimer(); // 기존 타이머 클리어
    timeLeft = 30;
    const timerBar = document.getElementById('word-timer-bar');
    
    wordTimer = setInterval(() => {
        if (!isGameActive) {
            stopWordTimer();
            return;
        }

        timeLeft -= 0.1;
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

async function submitWord() {
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
        startWordTimer(); // 타이머 재개
        return;
    }

    if (firstChar !== lastChar && firstChar !== altLastChar) {
        addBubble(`⚠️ <b>'${lastChar}'</b>${lastChar !== altLastChar ? `(또는 '<b>${altLastChar}</b>')` : ''}(으)로 시작하는 단어여야 합니다!`, "system");
        startWordTimer(); // 타이머 재개
        return;
    }

    if (wordHistory.includes(userWord)) {
        addBubble(`⚠️ <b>"${userWord}"</b>은(는) 이미 사용된 단어입니다!`, "system");
        startWordTimer(); // 타이머 재개
        return;
    }

    addBubble(userWord, "user");
    wordHistory.push(userWord);
    currentWord = userWord;

    botTurnCount++;
    updateTopMoney();

    addBubble("🤔 AI가 단어를 찾는 중...", "system");
    const loadingBubble = document.getElementById('word-chat').lastChild;

    const nextChar = getLastChar(userWord);
    const altNextChar = applyDueum(nextChar);

    const forceFinish = botTurnCount >= 10;
    const result = await findBotWord(nextChar, altNextChar, forceFinish);

    if (loadingBubble && loadingBubble.parentNode) {
        loadingBubble.parentNode.removeChild(loadingBubble);
    }

    if (result && result.finisher) {
        currentWord = result.word;
        wordHistory.push(result.word);
        addBubble(`<b>"${result.word}"</b>! 후후, 슬슬 승부를 볼 시간이네요 😏`, "bot");
        addBubble(`🏁 <b>한방단어</b>로 마무리! 이 글자로 이어갈 단어를 찾기 정말 어려우실 거예요.<br><b>승부 결과: 봇 승리!</b>`, "system");
        isGameActive = false;
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
        if (typeof saveUserDataToFirestore === 'function') saveUserDataToFirestore();
    }
}

async function findBotWord(targetChar, altChar, forceFinish = false) {
    if (forceFinish) {
        const fatalCandidates = koreanDictionary.filter(w =>
            (w.startsWith(targetChar) || w.startsWith(altChar)) &&
            w.length >= 2 &&
            !wordHistory.includes(w) &&
            isFatalWord(w)
        );
        if (fatalCandidates.length > 0) {
            const pick = fatalCandidates[Math.floor(Math.random() * fatalCandidates.length)];
            return { word: pick, finisher: true };
        }
    }

    try {
        const searchUrl = `https://opendict.korean.go.kr/api/search?key=${SAM_API_KEY}&req_type=json&q=${encodeURIComponent(targetChar)}&sort=dict&part=word&advanced=y&method=start`;
        const data = await fetchWithCorsFallback(searchUrl);
        if (data && data.channel && data.channel.item) {
            const items = Array.isArray(data.channel.item) ? data.channel.item : [data.channel.item];
            for (let item of items) {
                const cleanWord = item.word.replace(/[^가-힣]/g, '');
                if (cleanWord.length >= 2 && !wordHistory.includes(cleanWord)) {
                    if (!forceFinish && isFatalWord(cleanWord)) continue;
                    return { word: cleanWord, finisher: false };
                }
            }
        }
    } catch (err) {
        console.log("API 및 프록시 접근에 실패하여 내장 백업 사전을 사용합니다.");
    }

    const candidates = koreanDictionary.filter(w => 
        (w.startsWith(targetChar) || w.startsWith(altChar)) && 
        w.length >= 2 && 
        !wordHistory.includes(w) &&
        (forceFinish || !isFatalWord(w))
    );

    if (candidates.length > 0) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        return { word: pick, finisher: isFatalWord(pick) };
    }

    return null;
}
// ===== 오목 (온라인 대전) =====
// - 기존 파일(script.js / auth.js / style.css)은 수정하지 않고, 이 파일만 추가해서 동작합니다.
// - 방(room) 데이터는 Firestore 'omokRooms' 컬렉션에 저장되고, onSnapshot으로 실시간 동기화됩니다.
// - 규칙: 15x15, 방장이 흑(선공), 가로/세로/대각선 5목 이상이면 승리 (금수 없음), 한 수당 60초 제한
// - 필요한 전역: db, currentUser (auth.js) / userData, loadPage (script.js)

(function () {
    'use strict';

    const SIZE = 15;
    const TURN_LIMIT_MS = 60000;            // 한 수당 제한 시간
    const TIMEOUT_GRACE_MS = 3000;          // 시간 초과 판정 전 여유
    const WAIT_ROOM_TTL_MS = 30 * 60 * 1000; // 이 시간이 지난 대기방은 목록에서 숨김
    const LS_KEY = 'omokLastRoomId';
    const COLLECTION = 'omokRooms';
    const WIN_REWARD = 1000;                // 승리 보상 (코인만 지급, 랭크 포인트 X)
    const REWARD_MIN_MOVES = 10;            // 기권/시간초과 승리는 이 수 이상 둔 판에서만 보상 (0이면 항상 지급)

    // ----- 상태 -----
    let lobbyUnsub = null;
    let roomUnsub = null;
    let tickTimer = null;
    let roomId = null;
    let room = null;
    let myColor = 0;          // 1 = 흑(방장), 2 = 백(참가자)
    let previewIdx = null;    // 터치로 고른 착수 예정 위치
    let lastMovesLen = -1;
    let busy = false;
    let lastClaimAt = 0;
    let rewardInFlight = false;

    let canvas = null, cctx = null, boardPx = 0, cell = 0, pad = 0;

    // ----- 유틸 -----
    const $ = (id) => document.getElementById(id);
    const roomRef = (id) => db.collection(COLLECTION).doc(id);
    const nowTs = () => firebase.firestore.FieldValue.serverTimestamp();

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
    }
    function lsGet() { try { return localStorage.getItem(LS_KEY); } catch (e) { return null; } }
    function lsSet(v) { try { localStorage.setItem(LS_KEY, v); } catch (e) { } }
    function lsClear() { try { localStorage.removeItem(LS_KEY); } catch (e) { } }

    function requireLogin() {
        if (typeof currentUser === 'undefined' || !currentUser) {
            alert('로그인이 필요해요.');
            return false;
        }
        return true;
    }

    // ----- 오목 규칙 -----
    function boardFromMoves(moves) {
        const b = new Array(SIZE * SIZE).fill(0);
        moves.forEach((m, i) => { b[m] = (i % 2 === 0) ? 1 : 2; });
        return b;
    }

    // idx에 둔 돌 기준으로 5목 이상이면 그 줄의 돌 위치 배열을, 아니면 null 반환
    function checkWin(board, idx) {
        const color = board[idx];
        if (!color) return null;
        const r = Math.floor(idx / SIZE), c = idx % SIZE;
        const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
        for (const [dr, dc] of dirs) {
            const line = [idx];
            for (const sgn of [1, -1]) {
                let rr = r + dr * sgn, cc = c + dc * sgn;
                while (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && board[rr * SIZE + cc] === color) {
                    line.push(rr * SIZE + cc);
                    rr += dr * sgn; cc += dc * sgn;
                }
            }
            if (line.length >= 5) return line;
        }
        return null;
    }

    // =====================================================
    // 로비 (방 목록)
    // =====================================================
    function detachLobby() {
        if (lobbyUnsub) { lobbyUnsub(); lobbyUnsub = null; }
    }

    function detachRoom() {
        if (roomUnsub) { roomUnsub(); roomUnsub = null; }
        if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
        roomId = null; room = null; myColor = 0;
        previewIdx = null; lastMovesLen = -1; busy = false; rewardInFlight = false;
        canvas = null; cctx = null;
    }

    function openLobby() {
        if (!requireLogin()) return;
        detachLobby();
        detachRoom();

        $('content').innerHTML = `
            <div class="card word-game-container">
                <div class="word-game-header">
                    <button class="word-back-btn" onclick="loadPage('game')"><i class="fa-solid fa-arrow-left"></i> 나가기</button>
                    <span style="font-weight:bold; font-size:14px;"><i class="fa-solid fa-chess-board" style="color:var(--accent-color);"></i> 오목 대전</span>
                </div>
                <div id="omok-resume-box"></div>
                <button class="game-play-btn" onclick="Omok.create()">방 만들기</button>
                <div class="about-me-title" style="margin-top:4px;">열려있는 방</div>
                <div class="dday-list" id="omok-room-list" style="margin-top:0;">
                    <div class="word-bubble system">방 목록을 불러오는 중...</div>
                </div>
            </div>`;

        loadResumeBox();

        lobbyUnsub = db.collection(COLLECTION)
            .where('status', '==', 'waiting')
            .limit(30)
            .onSnapshot((snap) => {
                const list = $('omok-room-list');
                if (!list) return;
                const now = Date.now();
                const rooms = [];
                snap.forEach((doc) => {
                    const d = doc.data({ serverTimestamps: 'estimate' });
                    const created = d.createdAt ? d.createdAt.toMillis() : now;
                    if (now - created > WAIT_ROOM_TTL_MS) return;
                    rooms.push({ id: doc.id, d, created });
                });
                rooms.sort((a, b) => b.created - a.created);

                if (!rooms.length) {
                    list.innerHTML = `<div class="word-bubble system">열려있는 방이 없어요. 방을 만들어 상대를 기다려보세요!</div>`;
                    return;
                }
                const myUid = currentUser ? currentUser.uid : null;
                list.innerHTML = rooms.map(({ id, d }) => `
                    <div class="dday-item">
                        <div class="dday-info"><span class="dday-title">${esc(d.hostName)}님의 방${d.hostUid === myUid ? ' (내 방)' : ''}</span></div>
                        <div class="dday-actions"><button class="add-dday-btn" onclick="Omok.join('${id}')">입장</button></div>
                    </div>`).join('');
            }, (err) => {
                console.error('오목 방 목록 오류:', err);
                const list = $('omok-room-list');
                if (list) list.innerHTML = `<div class="word-bubble system">방 목록을 불러오지 못했어요. Firestore 보안 규칙(omokRooms)을 확인해주세요.</div>`;
            });
    }

    // 새로고침/이탈 후 돌아왔을 때 진행 중이던 게임 이어하기
    async function loadResumeBox() {
        const id = lsGet();
        if (!id) return;
        try {
            const snap = await roomRef(id).get();
            const box = $('omok-resume-box');
            if (!box) return;
            if (!snap.exists) { lsClear(); return; }
            const d = snap.data();
            const uid = currentUser.uid;
            if ((d.hostUid !== uid && d.guestUid !== uid) || d.status === 'finished') { lsClear(); return; }
            box.innerHTML = `
                <div class="dday-item">
                    <div class="dday-info"><span class="dday-title">진행 중인 게임이 있어요</span></div>
                    <div class="dday-actions"><button class="add-dday-btn" onclick="Omok.resume('${id}')">이어하기</button></div>
                </div>`;
        } catch (e) { /* 무시 */ }
    }

    // =====================================================
    // 방 만들기 / 입장
    // =====================================================
    async function createRoom() {
        if (!requireLogin()) return;
        try {
            const ref = db.collection(COLLECTION).doc();
            await ref.set({
                status: 'waiting',
                hostUid: currentUser.uid,
                hostName: userData.name,
                guestUid: null,
                guestName: null,
                moves: [],
                winner: null,
                endReason: null,
                createdAt: nowTs(),
                lastMoveAt: nowTs()
            });
            enterRoom(ref.id);
        } catch (e) {
            console.error(e);
            alert('방을 만들지 못했어요. (Firestore 보안 규칙/네트워크를 확인해주세요)');
        }
    }

    async function joinRoom(id) {
        if (!requireLogin()) return;
        const uid = currentUser.uid;
        try {
            await db.runTransaction(async (tx) => {
                const snap = await tx.get(roomRef(id));
                if (!snap.exists) throw new Error('gone');
                const d = snap.data();
                if (d.hostUid === uid || d.guestUid === uid) return; // 이미 내 방
                if (d.status !== 'waiting' || d.guestUid) throw new Error('full');
                tx.update(roomRef(id), {
                    guestUid: uid,
                    guestName: userData.name,
                    status: 'playing',
                    lastMoveAt: nowTs()
                });
            });
            enterRoom(id);
        } catch (e) {
            if (e.message === 'gone') alert('방이 이미 사라졌어요.');
            else if (e.message === 'full') alert('이미 다른 유저가 입장한 방이에요.');
            else { console.error(e); alert('입장하지 못했어요. 잠시 후 다시 시도해주세요.'); }
        }
    }

    // =====================================================
    // 게임 화면
    // =====================================================
    function enterRoom(id) {
        detachLobby();
        detachRoom();
        roomId = id;
        lsSet(id);
        renderRoomShell();

        roomUnsub = roomRef(id).onSnapshot((snap) => {
            if (roomId !== id) return;
            if (!snap.exists) {
                const wasFinished = room && room.status === 'finished';
                detachRoom(); lsClear();
                if (!wasFinished) alert('방이 닫혔어요.');
                openLobby();
                return;
            }
            room = snap.data({ serverTimestamps: 'estimate' });
            const uid = currentUser.uid;
            myColor = room.hostUid === uid ? 1 : (room.guestUid === uid ? 2 : 0);
            if (!myColor) { detachRoom(); openLobby(); return; }

            if (room.moves.length !== lastMovesLen) {
                previewIdx = null;
                lastMovesLen = room.moves.length;
            }
            if (room.status === 'finished') {
                lsClear();
                if (room.winner === uid && !room.rewarded) claimWinReward();
            }
            renderAll();
        }, (err) => {
            console.error('오목 방 오류:', err);
            const denied = err && err.code === 'permission-denied';
            detachRoom();
            alert(denied ? 'Firestore 보안 규칙에서 omokRooms 접근이 허용되지 않았어요.' : '연결에 문제가 생겼어요.');
            openLobby();
        });

        tickTimer = setInterval(tick, 250);
    }

    function renderRoomShell() {
        $('content').innerHTML = `
            <div class="card word-game-container omok-container">
                <div class="word-game-header">
                    <button class="word-back-btn" onclick="Omok.leave()"><i class="fa-solid fa-arrow-left"></i> 나가기</button>
                    <span style="font-weight:bold; font-size:14px;"><i class="fa-solid fa-chess-board" style="color:var(--accent-color);"></i> 오목 대전</span>
                </div>
                <div class="word-timer-bar-container"><div id="omok-timer-bar" class="word-timer-bar"></div></div>
                <div class="stats-grid" id="omok-players" style="margin-top:0;"></div>
                <div class="omok-board-wrap"><canvas id="omok-canvas"></canvas></div>
                <div class="word-bubble system" id="omok-status"></div>
                <div class="modal-btns" id="omok-actions"></div>
            </div>`;
        setupCanvas();
    }

    function renderAll() {
        renderPlayers();
        renderStatus();
        renderActions();
        drawBoard();
        tick();
    }

    function renderPlayers() {
        const box = $('omok-players');
        if (!box || !room) return;
        const turn = (room.status === 'playing') ? (room.moves.length % 2 === 0 ? 1 : 2) : 0;
        const slot = (color, name, label) => `
            <div class="stat-item omok-player ${turn === color ? 'turn' : ''}">
                <div class="stat-title"><span class="omok-stone ${color === 1 ? 'black' : 'white'}"></span>${label}${myColor === color ? ' · 나' : ''}</div>
                <div class="stat-value" style="font-size:14px; word-break:break-all;">${name ? esc(name) : '대기 중...'}</div>
            </div>`;
        box.innerHTML = slot(1, room.hostName, '흑 (선공)') + slot(2, room.guestName, '백');
    }

    function renderStatus() {
        const box = $('omok-status');
        if (!box || !room) return;
        const oppName = myColor === 1 ? room.guestName : room.hostName;
        let html = '';

        if (room.status === 'waiting') {
            html = '⏳ 상대를 기다리는 중이에요... 다른 유저가 방 목록에서 입장하면 바로 시작돼요!';
        } else if (room.status === 'playing') {
            const turn = room.moves.length % 2 === 0 ? 1 : 2;
            html = (turn === myColor)
                ? `🟢 <b>내 차례</b>예요! (${myColor === 1 ? '흑' : '백'}) 60초 안에 두세요.`
                : `⌛ <b>${esc(oppName)}</b>님의 차례예요...`;
        } else {
            const winnerName = room.winner === room.hostUid ? room.hostName : room.guestName;
            const loserName = room.winner === room.hostUid ? room.guestName : room.hostName;
            if (room.endReason === 'draw' || !room.winner) {
                html = '🤝 판이 가득 찼어요. <b>무승부!</b>';
            } else {
                const iWon = room.winner === currentUser.uid;
                const why = room.endReason === 'resign' ? `${esc(loserName)}님이 기권했어요.`
                    : room.endReason === 'timeout' ? `${esc(loserName)}님이 시간 초과했어요.`
                        : `${esc(winnerName)}님이 오목을 완성했어요!`;
                const rewardText = (iWon && room.rewarded) ? ` (+${WIN_REWARD.toLocaleString()}원)` : '';
                html = `${why}<br><b>${iWon ? '🎉 승리하셨습니다!' + rewardText : '😢 패배했어요...'}</b>`;
            }
        }
        box.innerHTML = html;
    }

    function renderActions() {
        const box = $('omok-actions');
        if (!box || !room) return;
        if (room.status === 'playing') {
            const myTurn = (room.moves.length % 2 === 0 ? 1 : 2) === myColor;
            const canPlace = myTurn && previewIdx !== null;
            box.innerHTML = `
                <button class="modal-btn btn-confirm" onclick="Omok.confirmPlace()" ${canPlace ? '' : 'disabled'}>착수</button>
                <button class="modal-btn btn-danger" onclick="Omok.resign()">기권</button>`;
        } else if (room.status === 'finished') {
            box.innerHTML = `<button class="modal-btn btn-confirm" onclick="Omok.leave()">로비로 돌아가기</button>`;
        } else {
            box.innerHTML = `<button class="modal-btn btn-cancel" onclick="Omok.leave()">방 닫기</button>`;
        }
    }

    // ----- 타이머 (한 수당 60초) -----
    function tick() {
        const bar = $('omok-timer-bar');
        if (!bar) return;
        if (!room || room.status !== 'playing') {
            bar.style.width = '100%';
            bar.style.backgroundColor = 'var(--accent-color)';
            return;
        }
        const start = room.lastMoveAt ? room.lastMoveAt.toMillis() : Date.now();
        const left = TURN_LIMIT_MS - (Date.now() - start);
        const percent = Math.max(0, Math.min(1, left / TURN_LIMIT_MS)) * 100;
        bar.style.width = `${percent}%`;
        bar.style.backgroundColor = left <= 10000 ? '#ef5350' : 'var(--accent-color)';
        if (left <= -TIMEOUT_GRACE_MS) claimTimeout();
    }

    // 승리 보상: 방 문서의 rewarded 플래그를 트랜잭션으로 한 번만 true로 바꾼 사람만 코인을 받음
    async function claimWinReward() {
        if (rewardInFlight || !roomId) return;
        rewardInFlight = true;
        const ref = roomRef(roomId);
        const uid = currentUser.uid;
        try {
            const paid = await db.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                if (!snap.exists) return false;
                const d = snap.data();
                if (d.status !== 'finished' || d.winner !== uid || d.rewarded) return false;
                if (d.endReason !== 'five' && d.moves.length < REWARD_MIN_MOVES) return false;
                tx.update(ref, { rewarded: true });
                return true;
            });
            if (paid) {
                userData.coin += WIN_REWARD;
                if (typeof updateTopMoney === 'function') updateTopMoney();
                if (typeof saveUserDataToFirestore === 'function') saveUserDataToFirestore();
            }
        } catch (e) {
            rewardInFlight = false;
            console.warn('승리 보상 처리 실패:', e);
        }
    }

    // 두 유저 중 누구의 화면에서든 시간 초과를 확정할 수 있음 (트랜잭션이라 중복 처리되지 않음)
    async function claimTimeout() {
        const now = Date.now();
        if (now - lastClaimAt < 5000 || !roomId) return;
        lastClaimAt = now;
        try {
            await db.runTransaction(async (tx) => {
                const snap = await tx.get(roomRef(roomId));
                if (!snap.exists) return;
                const d = snap.data();
                if (d.status !== 'playing') return;
                const t = d.lastMoveAt ? d.lastMoveAt.toMillis() : 0;
                if (!t || Date.now() - t < TURN_LIMIT_MS) return;
                const loserColor = d.moves.length % 2 === 0 ? 1 : 2;
                const winner = loserColor === 1 ? d.guestUid : d.hostUid;
                tx.update(roomRef(roomId), { status: 'finished', winner, endReason: 'timeout' });
            });
        } catch (e) { console.warn('시간 초과 처리 실패:', e); }
    }

    // ----- 착수 / 기권 / 나가기 -----
    async function placeStone(idx) {
        if (busy || !room || room.status !== 'playing' || !roomId) return;
        if ((room.moves.length % 2 === 0 ? 1 : 2) !== myColor) return;
        if (room.moves.includes(idx)) return;

        busy = true;
        const uid = currentUser.uid;
        const ref = roomRef(roomId);
        try {
            await db.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                if (!snap.exists) throw new Error('gone');
                const d = snap.data();
                if (d.status !== 'playing') throw new Error('ended');
                const color = d.moves.length % 2 === 0 ? 1 : 2;
                const turnUid = color === 1 ? d.hostUid : d.guestUid;
                if (turnUid !== uid) throw new Error('not-your-turn');
                if (d.moves.includes(idx)) throw new Error('occupied');

                const moves = d.moves.concat(idx);
                const upd = { moves, lastMoveAt: nowTs() };
                if (checkWin(boardFromMoves(moves), idx)) {
                    upd.status = 'finished'; upd.winner = uid; upd.endReason = 'five';
                } else if (moves.length >= SIZE * SIZE) {
                    upd.status = 'finished'; upd.winner = null; upd.endReason = 'draw';
                }
                tx.update(ref, upd);
            });
            previewIdx = null;
        } catch (e) {
            console.warn('착수 실패:', e.message);
        } finally {
            busy = false;
            if (room) { renderActions(); drawBoard(); }
        }
    }

    function confirmPlace() {
        if (previewIdx !== null) placeStone(previewIdx);
    }

    async function resign() {
        if (!room || room.status !== 'playing' || !roomId) return;
        if (!confirm('기권하시겠어요?')) return;
        const uid = currentUser.uid;
        const ref = roomRef(roomId);
        try {
            await db.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                if (!snap.exists) return;
                const d = snap.data();
                if (d.status !== 'playing') return;
                const winner = d.hostUid === uid ? d.guestUid : d.hostUid;
                tx.update(ref, { status: 'finished', winner, endReason: 'resign' });
            });
        } catch (e) {
            console.error(e);
            alert('기권 처리에 실패했어요. 다시 시도해주세요.');
        }
    }

    async function leave() {
        if (room && room.status === 'playing') {
            if (!confirm('게임이 진행 중이에요. 나가도 로비에서 이어할 수 있지만, 내 차례에 60초가 지나면 패배해요. 나갈까요?')) return;
        }
        const r = room, id = roomId, uid = currentUser.uid;
        detachRoom();
        if (r && r.status === 'waiting' && r.hostUid === uid) {
            lsClear();
            try { await roomRef(id).delete(); } catch (e) { /* 무시 */ }
        }
        openLobby();
    }

    // 다른 탭(하단 메뉴 등)으로 이동할 때: 대기 중인 내 방은 닫고, 진행 중 게임은 그대로 둠(이어하기 가능)
    function teardown() {
        detachLobby();
        if (roomUnsub) {
            const r = room, id = roomId;
            const uid = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : null;
            detachRoom();
            if (r && r.status === 'waiting' && r.hostUid === uid) {
                lsClear();
                roomRef(id).delete().catch(() => { });
            }
        }
    }

    // =====================================================
    // 보드 그리기 / 입력
    // =====================================================
    function setupCanvas() {
        canvas = $('omok-canvas');
        if (!canvas) return;
        const wrap = canvas.parentElement;
        const w = wrap.clientWidth || 320;
        const dpr = window.devicePixelRatio || 1;
        boardPx = Math.min(w, 480);
        cell = boardPx / SIZE;
        pad = cell / 2;
        canvas.style.width = boardPx + 'px';
        canvas.style.height = boardPx + 'px';
        canvas.width = Math.round(boardPx * dpr);
        canvas.height = Math.round(boardPx * dpr);
        cctx = canvas.getContext('2d');
        cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        canvas.addEventListener('pointerup', onCanvasPointer);
        drawBoard();
    }

    window.addEventListener('resize', () => {
        if (canvas && document.body.contains(canvas)) { setupCanvas(); }
    });

    function pt(i) { return pad + i * cell; }

    function drawStone(x, y, color, alpha) {
        const r = cell * 0.44;
        cctx.save();
        cctx.globalAlpha = alpha;
        const g = cctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
        if (color === 1) { g.addColorStop(0, '#666'); g.addColorStop(1, '#000'); }
        else { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#cfcfcf'); }
        cctx.shadowColor = 'rgba(0,0,0,0.35)';
        cctx.shadowBlur = 3;
        cctx.shadowOffsetY = 1;
        cctx.beginPath();
        cctx.arc(x, y, r, 0, Math.PI * 2);
        cctx.fillStyle = g;
        cctx.fill();
        cctx.restore();
    }

    function drawBoard() {
        if (!cctx) return;
        const W = boardPx;
        cctx.clearRect(0, 0, W, W);
        cctx.fillStyle = '#dcb35c';
        cctx.fillRect(0, 0, W, W);

        cctx.strokeStyle = 'rgba(60, 40, 10, 0.85)';
        cctx.lineWidth = 1;
        for (let i = 0; i < SIZE; i++) {
            cctx.beginPath(); cctx.moveTo(pad, pt(i)); cctx.lineTo(W - pad, pt(i)); cctx.stroke();
            cctx.beginPath(); cctx.moveTo(pt(i), pad); cctx.lineTo(pt(i), W - pad); cctx.stroke();
        }
        cctx.fillStyle = 'rgba(60, 40, 10, 0.9)';
        [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]].forEach(([r, c]) => {
            cctx.beginPath(); cctx.arc(pt(c), pt(r), cell * 0.12, 0, Math.PI * 2); cctx.fill();
        });

        if (!room) return;
        const moves = room.moves || [];

        moves.forEach((m, i) => {
            drawStone(pt(m % SIZE), pt(Math.floor(m / SIZE)), i % 2 === 0 ? 1 : 2, 1);
        });

        if (moves.length) {
            const last = moves[moves.length - 1];
            cctx.fillStyle = '#ef5350';
            cctx.beginPath();
            cctx.arc(pt(last % SIZE), pt(Math.floor(last / SIZE)), cell * 0.12, 0, Math.PI * 2);
            cctx.fill();

            if (room.status === 'finished' && room.endReason === 'five') {
                const line = checkWin(boardFromMoves(moves), last);
                if (line) {
                    cctx.strokeStyle = '#ef5350';
                    cctx.lineWidth = 2;
                    line.forEach((m) => {
                        cctx.beginPath();
                        cctx.arc(pt(m % SIZE), pt(Math.floor(m / SIZE)), cell * 0.48, 0, Math.PI * 2);
                        cctx.stroke();
                    });
                }
            }
        }

        if (previewIdx !== null && room.status === 'playing') {
            const x = pt(previewIdx % SIZE), y = pt(Math.floor(previewIdx / SIZE));
            drawStone(x, y, myColor, 0.55);
            cctx.strokeStyle = '#ef5350';
            cctx.lineWidth = 1.5;
            cctx.beginPath();
            cctx.arc(x, y, cell * 0.48, 0, Math.PI * 2);
            cctx.stroke();
        }
    }

    function onCanvasPointer(e) {
        if (!room || room.status !== 'playing' || busy) return;
        if ((room.moves.length % 2 === 0 ? 1 : 2) !== myColor) return;

        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (boardPx / rect.width);
        const y = (e.clientY - rect.top) * (boardPx / rect.height);
        const col = Math.round((x - pad) / cell);
        const row = Math.round((y - pad) / cell);
        if (col < 0 || col >= SIZE || row < 0 || row >= SIZE) return;
        const idx = row * SIZE + col;
        if (room.moves.includes(idx)) return;

        if (e.pointerType === 'mouse') {
            placeStone(idx);            // PC: 클릭하면 바로 착수
        } else if (previewIdx === idx) {
            placeStone(idx);            // 모바일: 같은 자리를 한 번 더 누르면 착수
        } else {
            previewIdx = idx;           // 모바일: 처음 누르면 미리보기
            renderActions();
            drawBoard();
        }
    }

    // =====================================================
    // 게임 센터에 오목 카드 추가 + 화면 이동 시 정리
    // (script.js를 수정하지 않기 위해 loadPage를 감싸서 처리)
    // =====================================================
    function injectGameCard() {
        const grid = document.querySelector('#content .game-grid');
        if (!grid || grid.querySelector('[data-omok-card]')) return;
        const first = grid.querySelector('.game-card');
        const html = `
            <div class="game-card" data-omok-card="1" onclick="Omok.open()">
                <div class="game-icon">⚫⚪</div>
                <div>
                    <div class="game-title">오목</div>
                    <div class="game-desc">다른 유저와 실시간 온라인 대전!</div>
                </div>
                <button class="game-play-btn">플레이</button>
            </div>`;
        if (first) first.insertAdjacentHTML('afterend', html);
        else grid.insertAdjacentHTML('afterbegin', html);
    }

    const originalLoadPage = window.loadPage;
    window.loadPage = function (page, btn) {
        teardown();
        const result = originalLoadPage.apply(this, arguments);
        if (page === 'game') injectGameCard();
        return result;
    };

    window.Omok = {
        open: openLobby,
        create: createRoom,
        join: joinRoom,
        resume: enterRoom,
        leave: leave,
        resign: resign,
        confirmPlace: confirmPlace,
        teardown: teardown
    };
})();
