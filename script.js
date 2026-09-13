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

// 로그인 후 auth.js의 loadUserDataFromFirestore()가 아래 값을 실제 계정 데이터로 채웁니다.
let userData = { 
    name: "oo님", rank: "??", coin: 500, point: 0, 
    avatarUrl: null, bannerUrl: null, currentTheme: 'dark', customThemeBgUrl: null,
    aboutMe: "자기소개를 적어보세요!"
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
        };
        reader.readAsDataURL(file);
    }
}

function openSettingsModal() {
    const emailDisplay = document.getElementById('account-email-display');
    if (emailDisplay) emailDisplay.textContent = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.email : '-';
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
            </div>`;
    } else if (page === 'study') {
        content.innerHTML = `
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
                
                <div class="study-notes-section">
                    <div class="study-notes-header">
                        
                    
                </div>
            `;
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
