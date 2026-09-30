// ===== 랭킹 페이지 UI =====

// ===== 랭크 정보 모달 (전체 등급 & 내 진행도) =====
function openRankInfoModal() {
    const existing = document.getElementById('rank-info-modal');
    if (existing) existing.remove();

    if (!userData.gameStats) initializeGameStats(userData);
    const stats = getGameStats(userData.gameStats);
    const currentPoint = stats.totalGamePoint;
    const currentTier = calculateTier(currentPoint);

    // 낮은 등급 -> 높은 등급 순서로 정렬 (아이언 ~ 챌린저)
    const orderedTiers = [...RANK_TIERS].reverse();

    // 다음 등급까지 진행률 계산
    const currentIdx = orderedTiers.findIndex(t => t.key === currentTier.key);
    const nextTier = orderedTiers[currentIdx + 1] || null;
    let progressPercent = 100;
    let pointsToNext = 0;
    if (nextTier) {
        const range = nextTier.minPoint - currentTier.minPoint;
        const progressed = currentPoint - currentTier.minPoint;
        progressPercent = range > 0 ? Math.max(0, Math.min(100, (progressed / range) * 100)) : 100;
        pointsToNext = nextTier.minPoint - currentPoint;
    }

    const modal = document.createElement('div');
    modal.id = 'rank-info-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.8);
        display: flex; align-items: center; justify-content: center;
        z-index: 10001;
        overflow-y: auto;
    `;

    // 진행률 상단 섹션
    const progressSection = `
        <div style="display:flex; align-items:center; gap:10px; padding: 14px; background: rgba(255,255,255,0.04); border-radius: 12px; margin-bottom: 16px;">
            <div style="text-align:center; flex-shrink:0;">
                ${getTierIconHTML(currentTier.key, 40)}
                <div style="font-size:10px; margin-top:4px; font-weight:bold;">${currentTier.tier}</div>
            </div>
            <div style="flex:1;">
                <div style="font-size:10px; color:var(--sub-text); margin-bottom:4px; text-align:center;">
                    ${nextTier ? `${nextTier.tier}까지 ${pointsToNext.toLocaleString()} P 남음` : '최고 등급 달성!'}
                </div>
                <div style="width:100%; height:8px; background:rgba(255,255,255,0.1); border-radius:4px; overflow:hidden;">
                    <div style="width:${progressPercent}%; height:100%; background: linear-gradient(90deg, ${currentTier.color}, ${nextTier ? nextTier.color : currentTier.color}); transition: width 0.3s;"></div>
                </div>
                <div style="font-size:12px; color:var(--accent-color); font-weight:bold; margin-top:4px; text-align:center;">${currentPoint.toLocaleString()} P</div>
            </div>
            <div style="text-align:center; flex-shrink:0; opacity:${nextTier ? 1 : 0.3};">
                ${getTierIconHTML(nextTier ? nextTier.key : currentTier.key, 40)}
                <div style="font-size:10px; margin-top:4px; font-weight:bold;">${nextTier ? nextTier.tier : '-'}</div>
            </div>
        </div>
    `;

    // 전체 등급 리스트 (가로 스크롤)
    const tierCards = orderedTiers.map(t => {
        const isCurrent = t.key === currentTier.key;
        return `
            <div style="
                flex-shrink: 0;
                width: 78px;
                text-align: center;
                padding: 10px 6px;
                border-radius: 12px;
                background: ${isCurrent ? 'rgba(255,255,255,0.08)' : 'transparent'};
                border: ${isCurrent ? `2px solid ${t.color}` : '2px solid transparent'};
                ${isCurrent ? `box-shadow: 0 0 12px ${t.color}66;` : ''}
            ">
                ${getTierIconHTML(t.key, isCurrent ? 44 : 36)}
                <div style="font-size:11px; font-weight:bold; margin-top:6px; color:${isCurrent ? t.color : 'var(--text-color)'};">${t.tier}</div>
                <div style="font-size:9px; color:var(--sub-text); margin-top:2px;">${t.minPoint.toLocaleString()}+</div>
                ${isCurrent ? '<div style="font-size:8px; color:var(--accent-color); font-weight:bold; margin-top:2px;">현재</div>' : ''}
            </div>
        `;
    }).join('');

    const content = document.createElement('div');
    content.style.cssText = `
        width: 92%;
        max-width: 420px;
        background: var(--bg-color);
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        margin: 20px auto;
        position: relative;
        padding: 16px;
    `;

    content.innerHTML = `
        <button onclick="document.getElementById('rank-info-modal').remove()" style="position: absolute; top: 10px; right: 10px; background: rgba(255,255,255,0.15); border: none; color: var(--text-color); width: 26px; height: 26px; border-radius: 50%; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; z-index: 2;">✕</button>

        <div style="font-size:15px; font-weight:bold; margin-bottom:14px;">🏅 랭크 정보</div>

        ${progressSection}

        <div style="font-size:11px; color:var(--sub-text); margin-bottom:8px; font-weight:bold;">전체 등급</div>
        <div style="display:flex; gap:8px; overflow-x:auto; padding-bottom:6px; -webkit-overflow-scrolling:touch;">
            ${tierCards}
        </div>

        <div style="font-size:10px; color:var(--sub-text); margin-top:12px; line-height:1.5;">
            💡 오목/틱택토 <b>랭킹 모드</b>에서 승리 시 +100P, 패배 시 -20P를 잃습니다.
        </div>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    // 현재 등급 카드가 보이도록 가로 스크롤 위치 조정
    setTimeout(() => {
        const scrollBox = content.querySelector('div[style*="overflow-x:auto"]');
        const currentCard = scrollBox ? scrollBox.children[currentIdx] : null;
        if (scrollBox && currentCard) {
            scrollBox.scrollLeft = currentCard.offsetLeft - scrollBox.clientWidth / 2 + currentCard.clientWidth / 2;
        }
    }, 0);
}

async function renderRankingPage() {
    const content = document.getElementById('content');
    
    // 기본 구조 생성
    content.innerHTML = `
        <div class="card" style="text-align:left;">
            <h2 style="margin-top:0; font-size:18px; display:flex; align-items:center; gap:8px;">
                <i class="fa-solid fa-trophy" style="color:var(--accent-color);"></i> 랭킹
            </h2>
            
            <!-- 사용자 현재 정보 -->
            <div class="user-rank-info" style="background:rgba(255,255,255,0.05); padding:12px; border-radius:8px; margin-bottom:16px; border-left:4px solid var(--accent-color);">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-size:12px; color:var(--sub-text); margin-bottom:4px;">내 현재 등급</div>
                        <div style="display:flex; align-items:center; gap:8px; cursor:pointer;" onclick="openRankInfoModal()">
                            <span id="my-tier-icon" style="display:inline-flex;"></span>
                            <span id="my-tier-name" style="font-size:16px; font-weight:bold;"></span>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:12px; color:var(--sub-text); margin-bottom:4px;">랭크 포인트</div>
                        <div style="font-size:18px; font-weight:bold; color:var(--accent-color);" id="my-game-point">0 P</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:12px; color:var(--sub-text); margin-bottom:4px;">전적</div>
                        <div style="font-size:14px;" id="my-record">0승 0패</div>
                    </div>
                </div>
            </div>

            <!-- 탭 네비게이션 -->
            <div style="display:flex; gap:8px; margin-bottom:16px; border-bottom:1px solid rgba(255,255,255,0.1);">
                <button id="rank-tab-game" class="rank-tab-btn active" onclick="switchRankingTab('game')" 
                    style="flex:1; padding:12px; border:none; background:none; color:var(--text-color); border-bottom:2px solid var(--accent-color); cursor:pointer; font-weight:bold;">
                    🎮 게임 랭킹
                </button>
                <button id="rank-tab-coin" class="rank-tab-btn" onclick="switchRankingTab('coin')"
                    style="flex:1; padding:12px; border:none; background:none; color:var(--sub-text); border-bottom:2px solid transparent; cursor:pointer; font-weight:bold;">
                    💰 코인 랭킹
                </button>
            </div>

            <!-- 랭킹 내용 -->
            <div id="ranking-content" style="margin-top:12px;"></div>
        </div>
    `;

    // 초기 로드
    await updateCurrentUserInfo();
    await switchRankingTab('game');
}

async function updateCurrentUserInfo() {
    if (!userData || !userData.gameStats) {
        initializeGameStats(userData);
    }

    const stats = getGameStats(userData.gameStats);
    const tier = calculateTier(stats.totalGamePoint);
    const nextInfo = getPointsToNextTier(stats.totalGamePoint);

    document.getElementById('my-tier-icon').innerHTML = getTierIconHTML(tier.key, 28);
    document.getElementById('my-tier-name').textContent = tier.tier;
    document.getElementById('my-game-point').textContent = stats.totalGamePoint + ' P';
    document.getElementById('my-record').textContent = `${stats.totalWins}승 ${stats.totalLosses}패`;
}

async function switchRankingTab(type) {
    // 탭 스타일 변경
    document.getElementById('rank-tab-game').style.borderBottomColor = type === 'game' ? 'var(--accent-color)' : 'transparent';
    document.getElementById('rank-tab-game').style.color = type === 'game' ? 'var(--text-color)' : 'var(--sub-text)';
    
    document.getElementById('rank-tab-coin').style.borderBottomColor = type === 'coin' ? 'var(--accent-color)' : 'transparent';
    document.getElementById('rank-tab-coin').style.color = type === 'coin' ? 'var(--text-color)' : 'var(--sub-text)';

    // 로딩 상태 표시
    const content = document.getElementById('ranking-content');
    content.innerHTML = '<div style="text-align:center; padding:20px; color:var(--sub-text);"><i class="fa-solid fa-spinner fa-spin"></i> 로딩 중...</div>';

    // 랭킹 데이터 조회
    try {
        const rankings = await fetchRankings(type, 50);
        renderRankingList(rankings, type);
    } catch (error) {
        console.error('랭킹 조회 오류:', error);
        content.innerHTML = '<div style="text-align:center; padding:20px; color:#ef5350;">랭킹을 불러올 수 없습니다.</div>';
    }
}

function renderRankingList(rankings, type) {
    const content = document.getElementById('ranking-content');
    
    if (!rankings || rankings.length === 0) {
        content.innerHTML = '<div style="text-align:center; padding:20px; color:var(--sub-text);">랭킹 데이터가 없습니다.</div>';
        return;
    }

    let html = '<div class="ranking-list">';

    rankings.forEach((user, index) => {
        const isCurrentUser = user.isCurrentUser;
        const bgColor = isCurrentUser ? 'rgba(255,215,0,0.1)' : index < 3 ? 'rgba(100,150,200,0.1)' : 'transparent';
        const borderColor = isCurrentUser ? 'var(--accent-color)' : index < 3 ? '#4a90e2' : 'transparent';
        
        let medalEmoji = '';
        if (index === 0) medalEmoji = '🥇';
        else if (index === 1) medalEmoji = '🥈';
        else if (index === 2) medalEmoji = '🥉';
        else medalEmoji = `${index + 1}`;

        let statDisplay = '';
        if (type === 'game') {
            statDisplay = `
                <div class="ranking-stat">
                    <div style="font-size:12px; color:var(--sub-text);">게임 포인트</div>
                    <div style="font-size:14px; font-weight:bold; color:var(--accent-color);">${user.gamePoint} P</div>
                </div>
                <div class="ranking-stat">
                    <div style="font-size:12px; color:var(--sub-text);">전적</div>
                    <div style="font-size:13px;">${user.totalWins}승 ${user.totalLosses}패</div>
                </div>
                <div class="ranking-stat">
                    <div style="font-size:12px; color:var(--sub-text);">승률</div>
                    <div style="font-size:13px;">${user.winRate}%</div>
                </div>
            `;
        } else {
            statDisplay = `
                <div class="ranking-stat">
                    <div style="font-size:12px; color:var(--sub-text);">보유 코인</div>
                    <div style="font-size:14px; font-weight:bold; color:#ffca28;">${user.coin.toLocaleString()}원</div>
                </div>
            `;
        }

        html += `
            <div class="ranking-item" style="background:${bgColor}; border-left:4px solid ${borderColor}; ${isCurrentUser ? 'border:2px solid var(--accent-color);' : ''} padding:12px; border-radius:6px; margin-bottom:8px; display:flex; align-items:center; gap:12px; cursor:pointer;" onclick="openRankingUserProfile('${user.uid}')">
                <!-- 순위 -->
                <div style="font-size:18px; font-weight:bold; min-width:40px; text-align:center;">
                    ${medalEmoji}
                </div>

                <!-- 프로필 -->
                <div style="display:flex; align-items:center; gap:8px; flex:1;">
                    <div style="width:36px; height:36px; border-radius:50%; background:rgba(100,150,200,0.3); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                        ${user.avatarUrl ? `<img src="${user.avatarUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">` : '<i class="fa-solid fa-user"></i>'}
                    </div>
                    <div>
                        <div style="font-weight:bold; font-size:13px;">${user.name} ${isCurrentUser ? '(나)' : ''}</div>
                        <div style="font-size:11px; color:var(--sub-text); display:flex; align-items:center; gap:4px;">${getTierIconHTML(user.tierKey, 14)} ${user.tier}</div>
                    </div>
                </div>

                <!-- 통계 -->
                <div style="display:flex; gap:12px; align-items:center; flex-shrink:0;">
                    ${statDisplay}
                </div>
            </div>
        `;
    });

    html += '</div>';
    content.innerHTML = html;
}

// ===== 랭킹에서 프로필 조회 =====
async function openRankingUserProfile(uid) {
    try {
        const doc = await db.collection('users').doc(uid).get();
        if (!doc.exists) {
            alert('사용자 정보를 찾을 수 없습니다.');
            return;
        }

        const data = doc.data();
        const gameStats = data.gameStats || {};
        const stats = getGameStats(gameStats);
        const tier = calculateTier(stats.totalGamePoint);

        const bannerUrl = data.bannerUrl || null;
        const avatarUrl = data.avatarUrl || null;

        // 기존 모달이 있으면 제거
        const existing = document.getElementById('ranking-profile-modal');
        if (existing) existing.remove();

        const profileModal = document.createElement('div');
        profileModal.id = 'ranking-profile-modal';
        profileModal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            overflow-y: auto;
        `;

        const content = document.createElement('div');
        content.style.cssText = `
            width: 78%;
            max-width: 280px;
            background: var(--bg-color);
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            margin: 20px auto;
            position: relative;
        `;

        content.innerHTML = `
            <!-- 닫기 버튼 (카드 우측 상단 고정) -->
            <button onclick="document.getElementById('ranking-profile-modal').remove()" style="position: absolute; top: 10px; right: 10px; background: rgba(255,255,255,0.15); border: none; color: var(--text-color); width: 26px; height: 26px; border-radius: 50%; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; z-index: 2;">✕</button>

            <!-- 아바타 영역 (상단) -->
            <div style="padding: 18px 16px 12px; text-align: center;">
                <!-- 아바타 -->
                <div style="width: 64px; height: 64px; border-radius: 50%; background: rgba(100,150,200,0.3); display: flex; align-items: center; justify-content: center; margin: 0 auto 8px; border: 3px solid var(--bg-color); overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
                    ${avatarUrl ? `<img src="${avatarUrl}" style="width: 100%; height: 100%; object-fit: cover;">` : '<i class="fa-solid fa-user" style="font-size: 32px; color: var(--sub-text);"></i>'}
                </div>

                <!-- 닉네임 -->
                <div style="font-size: 15px; font-weight: bold; margin-bottom: 2px;">${data.name || '익명의 플레이어'}</div>

                <!-- 등급 + 포인트 -->
                <div style="font-size: 11px; color: var(--sub-text); margin-bottom: 10px; display:flex; align-items:center; justify-content:center; gap:5px;">
                    ${getTierIconHTML(tier.key, 16)} ${tier.tier} · ${stats.totalGamePoint} P
                </div>
            </div>

            <!-- 정보 영역 -->
            <div style="padding: 0 14px 14px;">
                <!-- 자기소개 박스 -->
                <div style="background: rgba(255,255,255,0.05); padding: 9px; border-radius: 8px; margin-bottom: 10px; text-align: left; border-left: 3px solid var(--accent-color);">
                    <div style="font-size: 9px; color: var(--accent-color); margin-bottom: 4px; font-weight: bold;">자기소개</div>
                    <div style="font-size: 11px; word-break: break-word; white-space: pre-wrap; line-height: 1.3;">${data.aboutMe || '자기소개를 적지 않았습니다.'}</div>
                </div>

                <!-- 승률 -->
                <div style="margin-bottom: 10px; text-align: center;">
                    <div style="font-size: 9px; color: var(--sub-text); margin-bottom: 4px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">승률</div>
                    <div style="font-size: 22px; font-weight: bold; color: var(--accent-color);">${stats.winRate}%</div>
                </div>

                <!-- 전체 전적 -->
                <div style="background: rgba(255,255,255,0.05); padding: 8px; border-radius: 8px; margin-bottom: 8px; text-align: center;">
                    <div style="font-size: 9px; color: var(--sub-text); margin-bottom: 3px; font-weight: bold;">전체 전적</div>
                    <div style="font-size: 13px; font-weight: bold;">${stats.totalWins}승 ${stats.totalLosses}패</div>
                </div>

                <!-- 게임별 통계 -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <div style="background: rgba(255,255,255,0.05); padding: 8px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 9px; color: var(--sub-text); margin-bottom: 3px; font-weight: bold;">🎮 오목</div>
                        <div style="font-size: 12px; font-weight: bold;">${stats.omokWins}W</div>
                        <div style="font-size: 10px; color: var(--sub-text);">${stats.omokLosses}L</div>
                    </div>
                    <div style="background: rgba(255,255,255,0.05); padding: 8px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 9px; color: var(--sub-text); margin-bottom: 3px; font-weight: bold;">⭕ 틱택토</div>
                        <div style="font-size: 12px; font-weight: bold;">${stats.tictactoeWins}W</div>
                        <div style="font-size: 10px; color: var(--sub-text);">${stats.tictactoeLosses}L</div>
                    </div>
                </div>
            </div>
        `;

        profileModal.appendChild(content);
        document.body.appendChild(profileModal);

        // 배경 클릭 시 닫기
        profileModal.addEventListener('click', (e) => {
            if (e.target === profileModal) {
                profileModal.remove();
            }
        });

    } catch (error) {
        console.error('프로필 조회 실패:', error);
        alert('프로필을 불러올 수 없습니다.');
    }
}

// CSS 스타일 (style.css에 추가할 내용)
const rankingStyles = `
.rank-tab-btn {
    transition: all 0.3s ease;
}

.rank-tab-btn:hover {
    opacity: 0.8;
}

.ranking-list {
    max-height: 600px;
    overflow-y: auto;
    padding-right: 8px;
}

.ranking-item {
    transition: all 0.2s ease;
}

.ranking-item:hover {
    background: rgba(255,255,255,0.08) !important;
    transform: translateX(4px);
}

.ranking-stat {
    text-align: center;
    min-width: 60px;
}

.user-rank-info {
    animation: slideDown 0.3s ease;
}

@keyframes slideDown {
    from {
        opacity: 0;
        transform: translateY(-10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
`;
