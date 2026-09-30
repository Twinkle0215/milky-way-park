// ===== 랭킹 시스템 (오목 + 틱택토 통합) =====
// 요구사항:
// 1. 오목과 틱택토의 랭킹을 통합 (같은 랭킹 포인트 사용)
// 2. 10단계 등급 시스템 (아이언~챌린저)
// 3. 랭킹 페이지에 코인 랭킹과 게임 통합 랭킹 카테고리

// ===== 등급 정의 (10단계 시스템) =====
const RANK_TIERS = [
    { tier: '챌린저', key: 'challenger', minPoint: 4500, emoji: '👑', color: '#FF6B9D' },         // 가장 높은 등급
    { tier: '그랜드마스터', key: 'grandmaster', minPoint: 4000, emoji: '🌟', color: '#FF4757' },
    { tier: '마스터', key: 'master', minPoint: 3500, emoji: '⚡', color: '#B24BF3' },
    { tier: '다이아몬드', key: 'diamond', minPoint: 3000, emoji: '💎', color: '#4FC3F7' },
    { tier: '에메랄드', key: 'emerald', minPoint: 2500, emoji: '💚', color: '#2ECC71' },
    { tier: '플래티넘', key: 'platinum', minPoint: 2000, emoji: '⭐', color: '#3EC6C0' },
    { tier: '골드', key: 'gold', minPoint: 1500, emoji: '🏆', color: '#FFC94A' },
    { tier: '실버', key: 'silver', minPoint: 1000, emoji: '🥈', color: '#B8C4CE' },
    { tier: '브론즈', key: 'bronze', minPoint: 500, emoji: '🥉', color: '#C97C42' },
    { tier: '아이언', key: 'iron', minPoint: 0, emoji: '⚙️', color: '#8A8D91' }            // 가장 낮은 등급
];

const GAME_REWARDS = {
    WIN: 100,      // 게임 승리시 포인트
    LOSS: -70,     // 게임 패배시 포인트 (차감)
    TIMEOUT_WIN: 50  // 상대 시간초과 승리시 포인트
};

const COIN_REWARDS = {
    WIN: 1000,     // 게임 승리시 코인
    LOSS: 500      // 게임 패배시 코인 차감
};

// ===== 사용자 게임 통계 초기화 =====
function initializeGameStats(userData) {
    if (!userData.gameStats) {
        userData.gameStats = {
            omokWins: 0,
            omokLosses: 0,
            tictactoeWins: 0,
            tictactoeLosses: 0,
            totalGamePoint: 0,
            totalCoin: 0,
            lastGameDate: null
        };
    }
    return userData.gameStats;
}

// ===== 등급 계산 =====
function calculateTier(gamePoint) {
    for (let i = 0; i < RANK_TIERS.length; i++) {
        if (gamePoint >= RANK_TIERS[i].minPoint) {
            return RANK_TIERS[i];
        }
    }
    return RANK_TIERS[RANK_TIERS.length - 1]; // 아이언 (최하위)
}

// ===== 전승률 계산 =====
function calculateWinRate(wins, losses) {
    const total = wins + losses;
    if (total === 0) return 0;
    return ((wins / total) * 100).toFixed(1);
}

// ===== 전체 통계 =====
function getGameStats(gameStats) {
    const totalWins = (gameStats.omokWins || 0) + (gameStats.tictactoeWins || 0);
    const totalLosses = (gameStats.omokLosses || 0) + (gameStats.tictactoeLosses || 0);
    const winRate = calculateWinRate(totalWins, totalLosses);
    
    return {
        totalWins,
        totalLosses,
        winRate,
        omokWins: gameStats.omokWins || 0,
        omokLosses: gameStats.omokLosses || 0,
        tictactoeWins: gameStats.tictactoeWins || 0,
        tictactoeLosses: gameStats.tictactoeLosses || 0,
        totalGamePoint: gameStats.totalGamePoint || 0
    };
}

// ===== 게임 결과 기록 =====
async function recordGameResult(gameType, isWin, opponent = null) {
    if (!currentUser || !userData) {
        console.error('사용자 정보 없음');
        return;
    }

    try {
        initializeGameStats(userData);

        const ref = db.collection('users').doc(currentUser.uid);
        const updates = {};

        // 게임 통계 업데이트
        if (gameType === 'omok') {
            if (isWin) {
                userData.gameStats.omokWins = (userData.gameStats.omokWins || 0) + 1;
                userData.gameStats.totalGamePoint = (userData.gameStats.totalGamePoint || 0) + GAME_REWARDS.WIN;
                userData.coin = (userData.coin || 0) + COIN_REWARDS.WIN;
                updates['gameStats.omokWins'] = firebase.firestore.FieldValue.increment(1);
            } else {
                userData.gameStats.omokLosses = (userData.gameStats.omokLosses || 0) + 1;
                userData.gameStats.totalGamePoint = (userData.gameStats.totalGamePoint || 0) + GAME_REWARDS.LOSS;
                userData.coin = (userData.coin || 0) - COIN_REWARDS.LOSS;
                updates['gameStats.omokLosses'] = firebase.firestore.FieldValue.increment(1);
            }
        } else if (gameType === 'tictactoe') {
            if (isWin) {
                userData.gameStats.tictactoeWins = (userData.gameStats.tictactoeWins || 0) + 1;
                userData.gameStats.totalGamePoint = (userData.gameStats.totalGamePoint || 0) + GAME_REWARDS.WIN;
                userData.coin = (userData.coin || 0) + COIN_REWARDS.WIN;
                updates['gameStats.tictactoeWins'] = firebase.firestore.FieldValue.increment(1);
            } else {
                userData.gameStats.tictactoeLosses = (userData.gameStats.tictactoeLosses || 0) + 1;
                userData.gameStats.totalGamePoint = (userData.gameStats.totalGamePoint || 0) + GAME_REWARDS.LOSS;
                userData.coin = (userData.coin || 0) - COIN_REWARDS.LOSS;
                updates['gameStats.tictactoeLosses'] = firebase.firestore.FieldValue.increment(1);
            }
        }

        // 포인트와 코인 업데이트
        if (userData.gameStats.totalGamePoint < 0) userData.gameStats.totalGamePoint = 0;
        updates['gameStats.totalGamePoint'] = userData.gameStats.totalGamePoint;
        updates['gameStats.totalCoin'] = userData.coin;
        updates['gameStats.lastGameDate'] = firebase.firestore.FieldValue.serverTimestamp();
        updates['coin'] = userData.coin;

        // Firestore 업데이트
        await ref.update(updates);

        // 로컬 업데이트
        updateTopMoney();

        console.log(`게임 결과 기록됨: ${gameType} - ${isWin ? '승리' : '패배'}`);
        return true;

    } catch (error) {
        console.error('게임 결과 기록 실패:', error);
        return false;
    }
}

// ===== 랭킹 데이터 조회 =====
async function fetchRankings(type = 'game', limit = 10) {
    try {
        let query = db.collection('users');

        if (type === 'coin') {
            // 코인 랭킹: 코인 높은 순서로
            query = query.orderBy('coin', 'desc');
        } else if (type === 'game') {
            // 게임 랭킹: 게임 포인트 높은 순서로
            query = query.orderBy('gameStats.totalGamePoint', 'desc');
        }

        const snapshot = await query.limit(limit).get();
        const rankings = [];

        snapshot.forEach((doc, index) => {
            const data = doc.data();
            const gameStats = data.gameStats || {};
            const stats = getGameStats(gameStats);
            const tier = calculateTier(stats.totalGamePoint);

            rankings.push({
                uid: doc.id,
                rank: index + 1,
                name: data.name || '익명의 플레이어',
                avatarUrl: data.avatarUrl || null,
                coin: data.coin || 0,
                gamePoint: stats.totalGamePoint || 0,
                tier: tier.tier,
                tierEmoji: tier.emoji,
                tierKey: tier.key,
                tierColor: tier.color,
                totalWins: stats.totalWins,
                totalLosses: stats.totalLosses,
                winRate: stats.winRate,
                isCurrentUser: doc.id === (currentUser?.uid || null)
            });
        });

        return rankings;
    } catch (error) {
        console.error('랭킹 데이터 조회 실패:', error);
        return [];
    }
}

// ===== 사용자 현재 등급 조회 =====
function getUserCurrentTier(gamePoint = userData?.gameStats?.totalGamePoint || 0) {
    return calculateTier(gamePoint);
}

// ===== 다음 등급까지의 포인트 =====
function getPointsToNextTier(currentPoint) {
    for (let i = 0; i < RANK_TIERS.length; i++) {
        if (currentPoint < RANK_TIERS[i].minPoint) {
            return {
                nextTier: i === 0 ? null : RANK_TIERS[i - 1],
                pointsNeeded: RANK_TIERS[i].minPoint - currentPoint,
                currentTier: i === RANK_TIERS.length - 1 ? RANK_TIERS[i] : RANK_TIERS[i + 1]
            };
        }
    }
    return {
        nextTier: RANK_TIERS[0],
        pointsNeeded: 0,
        currentTier: RANK_TIERS[0]
    };
}

// ===============================================
// ===== 등급 SVG 뱃지 아이콘 시스템 =====
// ===============================================
// 이모지 대신 실제 게임 랭크 엠블럼 느낌의 SVG 뱃지를 사용합니다.
// <symbol>을 한 번만 <defs>에 등록해두고, 화면 어디서든
// <svg class="tier-icon"><use href="#tier-icon-KEY"></use></svg> 로 재사용합니다.

// 이스포츠 스타일 방패 실루엣 (어깨가 각진 형태)
const TIER_ICON_SHIELD = 'M32 2 L48 7 L58 15 V31 C58 47 48 58 32 63 C16 58 6 47 6 31 V15 L16 7 Z';
// 방패 위에 올라가는 대각선 광택(하이라이트)
const TIER_ICON_SHEEN = 'M14 13 L27 9 L20 33 L10 30 Z';

// 공용 <defs> (글로우 필터 등, 심볼 밖에서 한 번만 정의)
const TIER_ICON_SHARED_DEFS = `
    <filter id="tier-glow-soft" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="1.6" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="tier-glow-strong" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="2.6" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>`;

const TIER_ICON_SYMBOLS = {
    // 아이언: 무광 다크 그레이, 각진 방패 + 리벳 포인트 1개
    iron: `
        <symbol id="tier-icon-iron" viewBox="0 0 64 64">
            <defs>
                <linearGradient id="grad-iron" x1="0" y1="0" x2="0.3" y2="1">
                    <stop offset="0%" stop-color="#C4C8CD"/>
                    <stop offset="45%" stop-color="#84888D"/>
                    <stop offset="100%" stop-color="#494C50"/>
                </linearGradient>
            </defs>
            <path d="${TIER_ICON_SHIELD}" fill="url(#grad-iron)" stroke="#33353A" stroke-width="1.6"/>
            <path d="${TIER_ICON_SHEEN}" fill="#FFFFFF" opacity="0.18"/>
            <path d="M32 2 L48 7 L58 15 V31 C58 47 48 58 32 63" fill="none" stroke="#EEF0F2" stroke-width="1" opacity="0.35"/>
            <path d="M22 36 L32 43 L42 36" fill="none" stroke="#2C2E31" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>
        </symbol>`,

    // 브론즈: 청동 메탈릭 + 셰브론 1개 + 하단 젬 포인트
    bronze: `
        <symbol id="tier-icon-bronze" viewBox="0 0 64 64">
            <defs>
                <linearGradient id="grad-bronze" x1="0" y1="0" x2="0.3" y2="1">
                    <stop offset="0%" stop-color="#F0B27A"/>
                    <stop offset="45%" stop-color="#C97D3E"/>
                    <stop offset="100%" stop-color="#7C4419"/>
                </linearGradient>
            </defs>
            <path d="${TIER_ICON_SHIELD}" fill="url(#grad-bronze)" stroke="#5C3010" stroke-width="1.6"/>
            <path d="${TIER_ICON_SHEEN}" fill="#FFFFFF" opacity="0.22"/>
            <path d="M32 2 L48 7 L58 15 V31 C58 47 48 58 32 63" fill="none" stroke="#FFE3C2" stroke-width="1" opacity="0.4"/>
            <path d="M21 32 L32 41 L43 32" fill="none" stroke="#FFE1BD" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="32" cy="49" r="2.6" fill="#FFE1BD" stroke="#7C4419" stroke-width="0.8"/>
        </symbol>`,

    // 실버: 은색 메탈릭 + 셰브론 2개
    silver: `
        <symbol id="tier-icon-silver" viewBox="0 0 64 64">
            <defs>
                <linearGradient id="grad-silver" x1="0" y1="0" x2="0.3" y2="1">
                    <stop offset="0%" stop-color="#FFFFFF"/>
                    <stop offset="45%" stop-color="#C7CFD6"/>
                    <stop offset="100%" stop-color="#828B93"/>
                </linearGradient>
            </defs>
            <path d="${TIER_ICON_SHIELD}" fill="url(#grad-silver)" stroke="#5B636B" stroke-width="1.6"/>
            <path d="${TIER_ICON_SHEEN}" fill="#FFFFFF" opacity="0.35"/>
            <path d="M32 2 L48 7 L58 15 V31 C58 47 48 58 32 63" fill="none" stroke="#FFFFFF" stroke-width="1" opacity="0.5"/>
            <path d="M20 27 L32 36 L44 27" fill="none" stroke="#FFFFFF" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M20 38 L32 47 L44 38" fill="none" stroke="#FFFFFF" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>
        </symbol>`,

    // 골드: 방패 대신 라우렐 훈장(메달) 스타일 - 썬버스트 + 링 + 별 + 리본
    gold: `
        <symbol id="tier-icon-gold" viewBox="0 0 64 64">
            <defs>
                <linearGradient id="grad-gold" x1="0" y1="0" x2="0.3" y2="1">
                    <stop offset="0%" stop-color="#FFF6D6"/>
                    <stop offset="45%" stop-color="#FBC948"/>
                    <stop offset="100%" stop-color="#B87A0F"/>
                </linearGradient>
                <linearGradient id="grad-gold-ribbon" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#E24B57"/>
                    <stop offset="100%" stop-color="#96222D"/>
                </linearGradient>
                <radialGradient id="grad-gold-glow" cx="50%" cy="42%" r="60%">
                    <stop offset="0%" stop-color="#FFE9A8" stop-opacity="0.55"/>
                    <stop offset="100%" stop-color="#FFE9A8" stop-opacity="0"/>
                </radialGradient>
            </defs>
            <circle cx="32" cy="28" r="30" fill="url(#grad-gold-glow)"/>
            <path d="M28 41 L35 41 L38 61 L31.5 56 L25 61 Z" fill="url(#grad-gold-ribbon)" stroke="#6E1119" stroke-width="1"/>
            <g opacity="0.9">
                <path d="M32 2 L34.5 11 L29.5 11 Z" fill="#FFE9A8" transform="rotate(0 32 27)"/>
                <path d="M32 2 L34.5 11 L29.5 11 Z" fill="#FFE9A8" transform="rotate(45 32 27)"/>
                <path d="M32 2 L34.5 11 L29.5 11 Z" fill="#FFE9A8" transform="rotate(90 32 27)"/>
                <path d="M32 2 L34.5 11 L29.5 11 Z" fill="#FFE9A8" transform="rotate(135 32 27)"/>
                <path d="M32 2 L34.5 11 L29.5 11 Z" fill="#FFE9A8" transform="rotate(180 32 27)"/>
                <path d="M32 2 L34.5 11 L29.5 11 Z" fill="#FFE9A8" transform="rotate(225 32 27)"/>
                <path d="M32 2 L34.5 11 L29.5 11 Z" fill="#FFE9A8" transform="rotate(270 32 27)"/>
                <path d="M32 2 L34.5 11 L29.5 11 Z" fill="#FFE9A8" transform="rotate(315 32 27)"/>
            </g>
            <circle cx="32" cy="27" r="20" fill="url(#grad-gold)" stroke="#8A5B0A" stroke-width="2" filter="url(#tier-glow-soft)"/>
            <circle cx="32" cy="27" r="15.5" fill="none" stroke="#FFF6DC" stroke-width="1.2" opacity="0.7"/>
            <path d="M32 16 L35.6 24.4 L45 24.8 L37.6 30.6 L40.3 39.6 L32 34.4 L23.7 39.6 L26.4 30.6 L19 24.8 L28.4 24.4 Z" fill="#FFFBEA" stroke="#8A5B0A" stroke-width="1"/>
        </symbol>`,

    // 플래티넘: 방패 없이 얼음 크리스탈 클러스터 (3개 결정)
    platinum: `
        <symbol id="tier-icon-platinum" viewBox="0 0 64 64">
            <defs>
                <linearGradient id="grad-platinum" x1="0.1" y1="0" x2="0.3" y2="1">
                    <stop offset="0%" stop-color="#F1FFFD"/>
                    <stop offset="40%" stop-color="#77E7DC"/>
                    <stop offset="100%" stop-color="#0F8C7F"/>
                </linearGradient>
                <linearGradient id="grad-platinum-side" x1="0" y1="0" x2="0.3" y2="1">
                    <stop offset="0%" stop-color="#CFFFF8"/>
                    <stop offset="100%" stop-color="#1B9E90"/>
                </linearGradient>
                <radialGradient id="grad-platinum-glow" cx="50%" cy="45%" r="60%">
                    <stop offset="0%" stop-color="#9DFFF0" stop-opacity="0.5"/>
                    <stop offset="100%" stop-color="#9DFFF0" stop-opacity="0"/>
                </radialGradient>
            </defs>
            <circle cx="32" cy="32" r="30" fill="url(#grad-platinum-glow)"/>
            <path d="M14 30 L20 22 L23 46 L17 58 L10 48 Z" fill="url(#grad-platinum-side)" stroke="#0B5D53" stroke-width="1.4"/>
            <path d="M50 30 L44 22 L41 46 L47 58 L54 48 Z" fill="url(#grad-platinum-side)" stroke="#0B5D53" stroke-width="1.4"/>
            <path d="M32 4 L41 16 L38 48 L32 60 L26 48 L23 16 Z" fill="url(#grad-platinum)" stroke="#0B5D53" stroke-width="2" filter="url(#tier-glow-soft)"/>
            <path d="M32 4 L32 60 M23 16 L41 16 M26 48 L38 48" stroke="#0B5D53" stroke-width="0.8" opacity="0.55"/>
            <path d="M27 8 L36 8 L32 4 Z" fill="#FFFFFF" opacity="0.7"/>
            <circle cx="46" cy="14" r="1.8" fill="#FFFFFF" opacity="0.9"/>
        </symbol>`,

    // 에메랄드: 방패 없이 에메랄드 컷 보석이 중심 (팔각 스텝컷)
    emerald: `
        <symbol id="tier-icon-emerald" viewBox="0 0 64 64">
            <defs>
                <linearGradient id="grad-emerald" x1="0.1" y1="0" x2="0.3" y2="1">
                    <stop offset="0%" stop-color="#E8FFF3"/>
                    <stop offset="35%" stop-color="#39E28C"/>
                    <stop offset="100%" stop-color="#04702F"/>
                </linearGradient>
                <radialGradient id="grad-emerald-glow" cx="50%" cy="42%" r="58%">
                    <stop offset="0%" stop-color="#7CFFC1" stop-opacity="0.4"/>
                    <stop offset="100%" stop-color="#7CFFC1" stop-opacity="0"/>
                </radialGradient>
            </defs>
            <circle cx="32" cy="32" r="31" fill="url(#grad-emerald-glow)"/>
            <path d="M21 5 L43 5 L59 20 L59 38 L43 59 L21 59 L5 38 L5 20 Z" fill="url(#grad-emerald)" stroke="#04471E" stroke-width="2" filter="url(#tier-glow-soft)"/>
            <path d="M21 5 L43 5 M5 20 L59 20 M5 38 L59 38 M21 59 L43 59" stroke="#04471E" stroke-width="1" opacity="0.5"/>
            <path d="M15 20 L49 20 L49 38 L15 38 Z" fill="none" stroke="#EFFFF4" stroke-width="1" opacity="0.55"/>
            <path d="M11 14 L20 8" stroke="#F4FFF8" stroke-width="2.2" stroke-linecap="round" opacity="0.85"/>
        </symbol>`,

    // 다이아몬드: 방패 없이 브릴리언트 컷 다이아몬드가 중심 + 스파클
    diamond: `
        <symbol id="tier-icon-diamond" viewBox="0 0 64 64">
            <defs>
                <linearGradient id="grad-diamond" x1="0" y1="0" x2="0.2" y2="1">
                    <stop offset="0%" stop-color="#FFFFFF"/>
                    <stop offset="45%" stop-color="#9FE0FF"/>
                    <stop offset="100%" stop-color="#1E7FCC"/>
                </linearGradient>
                <radialGradient id="grad-diamond-glow" cx="50%" cy="40%" r="62%">
                    <stop offset="0%" stop-color="#CFF3FF" stop-opacity="0.65"/>
                    <stop offset="100%" stop-color="#CFF3FF" stop-opacity="0"/>
                </radialGradient>
            </defs>
            <circle cx="32" cy="32" r="30" fill="url(#grad-diamond-glow)"/>
            <path d="M17 10 L47 10 L59 24 L32 60 L5 24 Z" fill="url(#grad-diamond)" stroke="#0F5486" stroke-width="2" filter="url(#tier-glow-soft)"/>
            <path d="M17 10 L32 24 L47 10 M5 24 L59 24 M32 24 L32 60 M17 10 L5 24 M47 10 L59 24" stroke="#0F5486" stroke-width="0.9" opacity="0.5"/>
            <path d="M20 13 L44 13 L32 24 Z" fill="#FFFFFF" opacity="0.6"/>
            <path d="M50 8 L52 13 L57 15 L52 17 L50 22 L48 17 L43 15 L48 13 Z" fill="#FFFFFF"/>
            <circle cx="14" cy="42" r="1.8" fill="#FFFFFF" opacity="0.9"/>
        </symbol>`,

    // 마스터: 방패 없이 날개 달린 자수정 보석 + 후광
    master: `
        <symbol id="tier-icon-master" viewBox="0 0 64 64">
            <defs>
                <linearGradient id="grad-master" x1="0.1" y1="0" x2="0.3" y2="1">
                    <stop offset="0%" stop-color="#F4E3FF"/>
                    <stop offset="40%" stop-color="#B961F5"/>
                    <stop offset="100%" stop-color="#4F0C89"/>
                </linearGradient>
                <radialGradient id="grad-master-glow" cx="50%" cy="45%" r="65%">
                    <stop offset="0%" stop-color="#DCAEFF" stop-opacity="0.65"/>
                    <stop offset="100%" stop-color="#DCAEFF" stop-opacity="0"/>
                </radialGradient>
            </defs>
            <circle cx="32" cy="32" r="31" fill="url(#grad-master-glow)"/>
            <path d="M2 26 C11 16 22 17 29 26 C29 32 27 37 24 40 C21 34 13 30 2 34 C7 30 9 26 8 22 C6 25 4 26 2 26 Z" fill="#E6C4FF" opacity="0.95"/>
            <path d="M62 26 C53 16 42 17 35 26 C35 32 37 37 40 40 C43 34 51 30 62 34 C57 30 55 26 56 22 C58 25 60 26 62 26 Z" fill="#E6C4FF" opacity="0.95"/>
            <path d="M32 8 L44 18 L40 42 L32 52 L24 42 L20 18 Z" fill="url(#grad-master)" stroke="#380764" stroke-width="2" filter="url(#tier-glow-strong)"/>
            <path d="M32 8 L32 52 M20 18 L44 18 M24 42 L40 42" stroke="#380764" stroke-width="0.8" opacity="0.55"/>
            <path d="M25 14 L39 14 L32 8 Z" fill="#FFFFFF" opacity="0.65"/>
            <path d="M32 56 L35 61 L29 61 Z" fill="#D9AEFF"/>
            <circle cx="10" cy="14" r="1.6" fill="#FFFFFF" opacity="0.8"/>
            <circle cx="54" cy="14" r="1.6" fill="#FFFFFF" opacity="0.8"/>
        </symbol>`,

    // 그랜드마스터: 방패 없이 이글거리는 화염 루비 + 강한 글로우
    grandmaster: `
        <symbol id="tier-icon-grandmaster" viewBox="0 0 64 64">
            <defs>
                <linearGradient id="grad-gm" x1="0.1" y1="0" x2="0.3" y2="1">
                    <stop offset="0%" stop-color="#FFE1B0"/>
                    <stop offset="45%" stop-color="#FF5B3C"/>
                    <stop offset="100%" stop-color="#8E0F0F"/>
                </linearGradient>
                <linearGradient id="grad-gm-flame-core" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#FFF6C8"/>
                    <stop offset="100%" stop-color="#FF8A3C"/>
                </linearGradient>
                <radialGradient id="grad-gm-glow" cx="50%" cy="40%" r="68%">
                    <stop offset="0%" stop-color="#FFB08A" stop-opacity="0.7"/>
                    <stop offset="100%" stop-color="#FFB08A" stop-opacity="0"/>
                </radialGradient>
            </defs>
            <circle cx="32" cy="32" r="32" fill="url(#grad-gm-glow)"/>
            <circle cx="14" cy="16" r="1.6" fill="#FFC98A" opacity="0.9"/>
            <circle cx="50" cy="12" r="1.3" fill="#FFC98A" opacity="0.8"/>
            <circle cx="54" cy="26" r="1.1" fill="#FFC98A" opacity="0.7"/>
            <path d="M32 2 C40 12 45 20 41 28 C46 25 49 19 47 13 C55 21 56 34 47 44 C50 36 48 30 44 27 C43 36 36 42 27 41 C17 40 11 32 14 23 C17 28 20 30 23 30 C17 22 18 12 26 6 C23 14 27 19 31 20 C27 12 27 7 32 2 Z" fill="url(#grad-gm)" stroke="#6E0D0D" stroke-width="1.6" filter="url(#tier-glow-strong)"/>
            <path d="M32 16 C36 22 38 27 35 32 C39 30 41 26 40 22 C45 28 45 36 39 41 C41 36 40 32 37 30 C36 35 31 38 26 37 C21 36 18 32 20 27 C22 30 24 31 26 31 C22 26 23 20 28 17 C26 21 28 24 30 25 C27 20 28 18 32 16 Z" fill="url(#grad-gm-flame-core)" opacity="0.95"/>
        </symbol>`,

    // 챌린저: 방패 없이 왕관 + 방사형 후광 + 보석, 가장 화려한 최고 등급
    challenger: `
        <symbol id="tier-icon-challenger" viewBox="0 0 64 64">
            <defs>
                <linearGradient id="grad-challenger" x1="0.1" y1="0" x2="0.3" y2="1">
                    <stop offset="0%" stop-color="#FFF6D9"/>
                    <stop offset="45%" stop-color="#FFC94F"/>
                    <stop offset="75%" stop-color="#FF8FC4"/>
                    <stop offset="100%" stop-color="#D6428E"/>
                </linearGradient>
                <radialGradient id="grad-challenger-glow" cx="50%" cy="42%" r="72%">
                    <stop offset="0%" stop-color="#FFF3CE" stop-opacity="1"/>
                    <stop offset="55%" stop-color="#FFD9EE" stop-opacity="0.55"/>
                    <stop offset="100%" stop-color="#FFD9EE" stop-opacity="0"/>
                </radialGradient>
            </defs>
            <circle cx="32" cy="30" r="32" fill="url(#grad-challenger-glow)"/>
            <g stroke="#FFE9AE" stroke-width="1.4" stroke-linecap="round" opacity="0.9">
                <path d="M32 0 L32 8"/>
                <path d="M6 6 L11 13"/>
                <path d="M58 6 L53 13"/>
                <path d="M2 24 L10 25"/>
                <path d="M62 24 L54 25"/>
            </g>
            <path d="M10 26 L17 40 L32 29 L47 40 L54 26 L50 48 L14 48 Z" fill="url(#grad-challenger)" stroke="#9C2C63" stroke-width="2" stroke-linejoin="round" filter="url(#tier-glow-strong)"/>
            <path d="M14 48 L50 48 L48 54 L16 54 Z" fill="#E9539A" stroke="#9C2C63" stroke-width="1.5"/>
            <circle cx="10" cy="22" r="3.2" fill="#FFFBEF" stroke="#7A1E4E" stroke-width="1"/>
            <circle cx="32" cy="16" r="3.6" fill="#FFFBEF" stroke="#7A1E4E" stroke-width="1"/>
            <circle cx="54" cy="22" r="3.2" fill="#FFFBEF" stroke="#7A1E4E" stroke-width="1"/>
            <path d="M27 34 L32 30 L37 34 L37 40 L32 44 L27 40 Z" fill="#FFFBEF" opacity="0.85"/>
            <path d="M16 30 L20 26" stroke="#FFFBEF" stroke-width="1.4" stroke-linecap="round" opacity="0.7"/>
        </symbol>`
};

// 페이지에 한 번만 SVG 심볼 정의를 삽입 (중복 삽입 방지)
function injectTierIconDefs() {
    if (document.getElementById('tier-icon-defs-root')) return;
    const wrapper = document.createElement('div');
    wrapper.id = 'tier-icon-defs-root';
    wrapper.style.cssText = 'position:absolute; width:0; height:0; overflow:hidden;';
    wrapper.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg"><defs>${TIER_ICON_SHARED_DEFS}${Object.values(TIER_ICON_SYMBOLS).join('')}</defs></svg>`;
    document.body.appendChild(wrapper);
}

// 등급 뱃지 HTML 반환 (이모지 대체용)
// size: 픽셀 크기, tierKey: RANK_TIERS의 key 값 (예: 'iron', 'challenger')
function getTierIconHTML(tierKey, size = 24) {
    injectTierIconDefs();
    const key = tierKey || 'iron';
    return `<svg class="tier-icon" width="${size}" height="${size}" viewBox="0 0 64 64" style="vertical-align:middle; filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4));"><use href="#tier-icon-${key}"></use></svg>`;
}
