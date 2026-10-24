// ===== game-bgm.js =====
// 테트리스 / 플라피 버드용 배경음악 엔진.
// 음원 파일 없이 Web Audio API로 직접 연주(칩튠 합성)하므로 저작권·용량 걱정이 없다.
// 곡은 이 파일에서 새로 작곡한 오리지널 루프.
//
// 사용법 (게임 코드에서):
//   GameBGM.prime();            // 게임 열 때(클릭 직후) - 모바일 오디오 잠금 해제
//   GameBGM.play('tetris');     // 재생 중이면 아무 일도 안 함 (매 프레임 호출해도 안전)
//   GameBGM.pause();            // 일시정지 (재개는 play 다시 호출)
//   GameBGM.stop();             // 페이드아웃 후 정지 + 사이트 BGM 복귀
//   GameBGM.setSpeed(1.2);      // 템포 배율
//   GameBGM.bindButton(el);     // 🔊/🔇 토글 버튼 연결
//   GameBGM.sfx('lock');        // 효과음: lock(테트리스 블록 착지 '찰칵') / rotate(블록 회전) / clear(줄 지우기, 2번째 값=1~4줄) / catch(물고기 팡파레, 2번째 값=등급 0~6) /
//                               //        splash / bite / whoosh / miss   (🔊가 꺼져 있으면 재생 안 함)
(function () {
    const PREF_KEY = 'gameBgmOn';
    const MASTER_VOL = 0.5;
    const LOOKAHEAD = 0.18;      // 이만큼 앞서서 음을 예약
    const TICK_MS = 30;

    // ===== 음 이름 → 주파수 =====
    const SEMI = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
    function freq(name) {
        const m = /^([A-G][#b]?)(\d)$/.exec(name);
        if (!m) return null;
        const midi = SEMI[m[1]] + (parseInt(m[2], 10) + 1) * 12;
        return 440 * Math.pow(2, (midi - 69) / 12);
    }

    // "A4:2 C5 -:2" → 8분음표(unit) 단위 이벤트 배열. 토큰 = 음[:길이], '-' = 쉼표
    function parseSeq(str) {
        const notes = [];
        let t = 0;
        str.trim().split(/\s+/).forEach((tok) => {
            const p = tok.split(':');
            const len = p[1] ? parseInt(p[1], 10) : 1;
            notes.push({ f: p[0] === '-' ? null : freq(p[0]), start: t, len: len });
            t += len;
        });
        return { notes: notes, total: t };
    }

    const bars = (list) => list.join(' ');

    // ===== 곡 정의 (8마디 루프, 1마디 = 8분음표 8개) =====
    const SONGS = {
        // 테트리스: 경쾌하고 살짝 긴장감 있는 A단조 (Am - F - C - G - Am - F - Dm - E)
        tetris: {
            bpm: 144,
            wave: 'square',
            melody: bars([
                'A4:2 C5 E5:2 D5 C5 B4',
                'A4:2 C5 F5:2 E5 C5 A4',
                'G4:2 C5 E5:2 G5 E5 C5',
                'B4:2 D5 G5:2 F#5 E5 D5',
                'E5:2 E5 A5:2 G5 E5 C5',
                'F5:2 F5 A5:2 G5 F5 C5',
                'D5:2 F5 A5:2 G5 F5 E5',
                'E5:3 G#4 B4:2 C5 B4'
            ]),
            bass: bars([
                'A2 A3 A2 A3 A2 A3 A2 A3',
                'F2 F3 F2 F3 F2 F3 F2 F3',
                'C3 C4 C3 C4 C3 C4 C3 C4',
                'G2 G3 G2 G3 G2 G3 G2 G3',
                'A2 A3 A2 A3 A2 A3 A2 A3',
                'F2 F3 F2 F3 F2 F3 F2 F3',
                'D3 D4 D3 D4 D3 D4 D3 D4',
                'E2 E3 E2 E3 E2 E3 E2 E3'
            ]),
            drums: [
                'K h S h K h S h', 'K h S h K h S h', 'K h S h K h S h', 'K h S h K h S h',
                'K h S h K h S h', 'K h S h K h S h', 'K h S h K h S h', 'K h S h K S S S'
            ].join(' '),
            vol: { lead: 0.17, harm: 0.09, bass: 0.30, kick: 0.55, snare: 0.20, hat: 0.07 }
        },
        // 플라피 버드: 통통 튀는 밝은 C장조 (C - G - Am - F, 두 번 반복)
        flappy: {
            bpm: 126,
            wave: 'square',
            melody: bars([
                'E5 G5 E5 G5 C6:2 G5:2',
                'D5 G5 D5 G5 B5:2 G5:2',
                'C5 E5 C5 E5 A5:2 E5:2',
                'A4 C5 A4 C5 F5:2 C5:2',
                'G5 E5 G5 E5 C6 B5 A5 G5',
                'F5 D5 F5 D5 G5 A5 B5 D6',
                'E5 C5 E5 A5 G5 E5 C5 E5',
                'F5 A5 C6 A5 G5:2 -:2'
            ]),
            bass: bars([
                'C3:2 G3:2 C3:2 G3:2',
                'G2:2 D3:2 G2:2 D3:2',
                'A2:2 E3:2 A2:2 E3:2',
                'F2:2 C3:2 F2:2 C3:2',
                'C3:2 G3:2 C3:2 G3:2',
                'G2:2 D3:2 G2:2 D3:2',
                'A2:2 E3:2 A2:2 E3:2',
                'F2:2 C3:2 G2:2 D3:2'
            ]),
            drums: [
                'K h S h K h S h', 'K h S h K h S h', 'K h S h K h S h', 'K h S h K h S h',
                'K h S h K h S h', 'K h S h K h S h', 'K h S h K h S h', 'K h S h K h S S'
            ].join(' '),
            vol: { lead: 0.15, harm: 0.08, bass: 0.30, kick: 0.45, snare: 0.15, hat: 0.05 }
        },
        // 낚시왕: 잔잔하고 여유로운 C장조 (C - G - Am - G - Am - F - G - C), 부드러운 삼각파 + 아주 약한 리듬
        fishing: {
            bpm: 92,
            wave: 'triangle',
            melody: bars([
                'E5:2 G5 E5 D5:2 C5:2',
                'D5:2 F5 D5 C5:2 -:2',
                'E5:2 G5 A5 G5:2 E5:2',
                'D5:3 E5 D5:2 -:2',
                'A4:2 C5 E5 A5:2 G5:2',
                'F5:2 A5 G5 F5:2 E5:2',
                'D5:2 E5 F5 E5:2 D5:2',
                'C5:4 -:4'
            ]),
            bass: bars([
                'C3:4 G3:4',
                'G2:4 D3:4',
                'A2:4 E3:4',
                'G2:4 D3:4',
                'A2:4 E3:4',
                'F2:4 C3:4',
                'G2:4 D3:4',
                'C3:4 G2:4'
            ]),
            drums: [
                'K - h - - - h -', 'K - h - - - h -', 'K - h - - - h -', 'K - h - - - h -',
                'K - h - - - h -', 'K - h - - - h -', 'K - h - - - h -', 'K - h - - - h h'
            ].join(' '),
            vol: { lead: 0.26, harm: 0.08, bass: 0.22, kick: 0.22, snare: 0.05, hat: 0.03 }
        }
    };

    // 곡을 "unit 번호 → 이벤트" 표로 미리 변환
    function compile(def) {
        const mel = parseSeq(def.melody);
        const bas = parseSeq(def.bass);
        const drm = def.drums.trim().split(/\s+/);
        const total = mel.total;
        const events = [];
        for (let i = 0; i < total; i++) events.push({ lead: null, bass: null, drum: null });
        mel.notes.forEach((n) => { if (n.f) events[n.start].lead = n; });
        bas.notes.forEach((n) => { if (n.f) events[n.start].bass = n; });
        drm.forEach((d, i) => { if (i < total && d !== '-') events[i].drum = d; });
        return { def: def, events: events, total: total, melTotal: mel.total, basTotal: bas.total, drumTotal: drm.length };
    }
    const COMPILED = {};
    Object.keys(SONGS).forEach((k) => { COMPILED[k] = compile(SONGS[k]); });

    // ===== 합성(악기) =====
    function makeNoise(ctx) {
        const len = Math.floor(ctx.sampleRate * 0.25);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        let seed = 12345;
        for (let i = 0; i < len; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; d[i] = (seed / 4294967296) * 2 - 1; }
        return buf;
    }

    function tone(ctx, dest, type, f, t, dur, gain, decayTo) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(gain, t + 0.006);
        g.gain.setTargetAtTime(gain * (decayTo || 0.6), t + 0.02, 0.12);
        g.gain.setTargetAtTime(0.0001, t + dur, 0.025);
        o.connect(g); g.connect(dest);
        o.start(t);
        o.stop(t + dur + 0.2);
    }

    function kick(ctx, dest, t, gain) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(130, t);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
        g.gain.setValueAtTime(gain, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        o.connect(g); g.connect(dest);
        o.start(t); o.stop(t + 0.18);
    }

    function noiseHit(ctx, dest, noiseBuf, t, dur, gain, hpFreq) {
        const s = ctx.createBufferSource();
        s.buffer = noiseBuf;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = hpFreq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(gain, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        s.connect(hp); hp.connect(g); g.connect(dest);
        s.start(t); s.stop(t + dur + 0.02);
    }

    // 한 unit(8분음표)에 해당하는 모든 소리를 예약. loopNo가 홀수면 화음 한 겹 추가(변화)
    function scheduleUnit(ctx, bus, noiseBuf, comp, idx, t, unitSec, loopNo) {
        const ev = comp.events[idx];
        const v = comp.def.vol;
        if (ev.lead) {
            const dur = Math.max(0.05, ev.lead.len * unitSec * 0.92);
            tone(ctx, bus.lead, comp.def.wave, ev.lead.f, t, dur, v.lead, 0.65);
            if (loopNo % 2 === 1) tone(ctx, bus.lead, 'triangle', ev.lead.f / 2, t, dur, v.harm, 0.8);
        }
        if (ev.bass) {
            const dur = Math.max(0.05, ev.bass.len * unitSec * 0.9);
            tone(ctx, bus.bass, 'triangle', ev.bass.f, t, dur, v.bass, 0.75);
        }
        if (ev.drum === 'K') kick(ctx, bus.drum, t, v.kick);
        else if (ev.drum === 'S') noiseHit(ctx, bus.drum, noiseBuf, t, 0.13, v.snare, 1600);
        else if (ev.drum === 'h') noiseHit(ctx, bus.drum, noiseBuf, t, 0.04, v.hat, 7000);
    }

    // 소리 경로: 악기 → (리드만 로우패스) → master
    function makeBus(ctx, dest) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 3600;
        lp.connect(dest);
        return { lead: lp, bass: dest, drum: dest };
    }

    // ===== 재생 상태 =====
    const st = {
        ctx: null, master: null, bus: null, noise: null,
        state: 'idle',            // idle | playing | paused | stopping
        song: null, comp: null,
        timer: null, stopTimer: null,
        nextTime: 0, idx: 0, loop: 0, speed: 1,
        enabled: true,
        autoPaused: false,
        ducked: null,
        unlockBound: false
    };

    try { st.enabled = localStorage.getItem(PREF_KEY) !== '0'; } catch (e) { }

    function getCtx() {
        if (st.ctx) return st.ctx;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try {
            st.ctx = new AC();
            st.master = st.ctx.createGain();
            st.master.gain.value = 0;
            st.master.connect(st.ctx.destination);
            st.sfxBus = st.ctx.createGain();            // 효과음 전용 경로 (BGM 볼륨/페이드와 상관없이 재생)
            st.sfxBus.gain.value = 0.8;
            st.sfxBus.connect(st.ctx.destination);
            st.bus = makeBus(st.ctx, st.master);
            st.noise = makeNoise(st.ctx);
        } catch (e) { st.ctx = null; }
        return st.ctx;
    }

    // 모바일(특히 iOS)은 "터치 이벤트 안에서" resume 해야 소리가 난다 → 클릭 직후 prime() 호출 + 이후 터치에서도 재시도
    function unlock() {
        const ctx = getCtx();
        if (!ctx) return;
        if (ctx.state === 'suspended' && st.state !== 'paused') { try { ctx.resume(); } catch (e) { } }
        try { // iOS용 무음 1샘플
            const b = ctx.createBuffer(1, 1, 22050);
            const s = ctx.createBufferSource();
            s.buffer = b; s.connect(ctx.destination); s.start(0);
        } catch (e) { }
        if (ctx.state === 'running') unbindUnlock();
    }
    function bindUnlock() {
        if (st.unlockBound) return;
        st.unlockBound = true;
        ['pointerdown', 'touchend', 'click', 'keydown'].forEach((ev) => document.addEventListener(ev, unlock, true));
    }
    function unbindUnlock() {
        if (!st.unlockBound) return;
        st.unlockBound = false;
        ['pointerdown', 'touchend', 'click', 'keydown'].forEach((ev) => document.removeEventListener(ev, unlock, true));
    }

    // ===== 사이트 기본 BGM(유튜브/커스텀)과 겹치지 않게 잠시 멈춤 =====
    function duckSite() {
        if (st.ducked) return;
        const d = { yt: false, audio: false, cyt: false };
        st.ducked = d;
        try {
            const muted = (typeof isBgmMuted !== 'undefined') && isBgmMuted;
            if (typeof ytPlayer !== 'undefined' && ytPlayer && typeof ytReady !== 'undefined' && ytReady &&
                typeof ytPlayer.getPlayerState === 'function' && ytPlayer.getPlayerState() === 1 && !muted) {
                ytPlayer.pauseVideo(); d.yt = true;
            }
        } catch (e) { }
        try {
            const c = window.CustomBGM && window.CustomBGM.st;
            if (c && c.active) {
                if (c.audio && !c.audio.paused) { c.audio.pause(); d.audio = true; }
                if (c.yt && typeof c.yt.getPlayerState === 'function' && c.yt.getPlayerState() === 1) { c.yt.pauseVideo(); d.cyt = true; }
            }
        } catch (e) { }
    }
    function restoreSite() {
        const d = st.ducked;
        st.ducked = null;
        if (!d) return;
        try { if (d.yt && typeof ytPlayer !== 'undefined' && ytPlayer) ytPlayer.playVideo(); } catch (e) { }
        try {
            const c = window.CustomBGM && window.CustomBGM.st;
            if (c && c.active) {
                if (d.audio && c.audio) c.audio.play().catch(() => { });
                if (d.cyt && c.yt) c.yt.playVideo();
            }
        } catch (e) { }
    }

    // ===== 스케줄러 =====
    function unitSec() { return 60 / (st.comp.def.bpm * st.speed) / 2; }

    function tick() {
        if (st.state !== 'playing' || !st.ctx) return;
        const ctx = st.ctx;
        while (st.nextTime < ctx.currentTime + LOOKAHEAD) {
            scheduleUnit(ctx, st.bus, st.noise, st.comp, st.idx, st.nextTime, unitSec(), st.loop);
            st.nextTime += unitSec();
            st.idx++;
            if (st.idx >= st.comp.total) { st.idx = 0; st.loop++; }
        }
    }

    function finishStop() {
        clearInterval(st.timer); st.timer = null;
        clearTimeout(st.stopTimer); st.stopTimer = null;
        st.state = 'idle';
        st.song = null; st.comp = null;
        st.autoPaused = false;
        restoreSite();
    }

    // ===== 효과음 =====
    function thump(ctx, dest, t, f0, f1, dur, gain, type) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type || 'triangle';
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f1, t + dur);
        g.gain.setValueAtTime(gain, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g); g.connect(dest);
        o.start(t); o.stop(t + dur + 0.03);
    }
    function swish(ctx, dest, noiseBuf, t, dur, gain, f0, f1) {   // 휙~ (필터가 훑고 지나가는 잡음)
        const s = ctx.createBufferSource();
        s.buffer = noiseBuf;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.Q.value = 1.2;
        bp.frequency.setValueAtTime(f0, t);
        bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(gain, t + dur * 0.4);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        s.connect(bp); bp.connect(g); g.connect(dest);
        s.start(t); s.stop(t + dur + 0.02);
    }
    // 맑은 종소리(유리 같은 소리): 사인파 + 2배음, 빨리 사라짐
    function bell(ctx, dest, t, name, dur, gain) {
        const f = freq(name);
        if (!f) return;
        tone(ctx, dest, 'sine', f, t, dur, gain, 0.25);
        tone(ctx, dest, 'sine', f * 2, t, dur * 0.6, gain * 0.35, 0.2);
    }
    // [음이름, 시작(초), 길이(초), 상대 볼륨] 목록을 연주
    function fan(ctx, dest, t, list, wave, gain) {
        list.forEach((n) => { const f = freq(n[0]); if (f) tone(ctx, dest, wave, f, t + n[1], n[2], gain * (n[3] || 1), 0.7); });
    }
    function sparkle(ctx, dest, t, count, span, gain) {
        for (let i = 0; i < count; i++) tone(ctx, dest, 'sine', 1400 + Math.random() * 2600, t + (i / count) * span, 0.14, gain, 0.3);
    }

    function playSfx(name, arg) {
        if (!st.enabled) return;
        const ctx = getCtx();
        if (!ctx || !st.sfxBus) return;
        if (ctx.state === 'suspended' && st.state !== 'paused') { try { ctx.resume(); } catch (e) { } }
        const d = st.sfxBus, t = ctx.currentTime + 0.01;
        try {
            if (name === 'lock') {                       // 찰칵! (카메라 셔터처럼: '찰' + '칵' 두 번 딸깍)
                noiseHit(ctx, d, st.noise, t, 0.035, 0.5, 3500);
                thump(ctx, d, t, 2400, 1200, 0.03, 0.14, 'square');
                noiseHit(ctx, d, st.noise, t + 0.055, 0.05, 0.55, 1800);
                thump(ctx, d, t + 0.055, 950, 380, 0.045, 0.22, 'square');
            } else if (name === 'rotate') {              // 휙! 블록 방향 바꿀 때 (짧은 상승음, 크게)
                thump(ctx, d, t, 600, 1300, 0.06, 0.34, 'square');
                thump(ctx, d, t, 300, 650, 0.06, 0.22, 'triangle');
                noiseHit(ctx, d, st.noise, t, 0.03, 0.28, 6000);
            } else if (name === 'clear') {               // 줄 지우기: 경쾌하고 시원하게! (1~4줄 갈수록 화려해짐)
                const n = Math.max(1, Math.min(4, Math.floor(Number(arg) || 1)));
                if (n === 1) {                           // 싱글: 산뜻한 두 음 + 시원한 바람
                    swish(ctx, d, st.noise, t, 0.22, 0.3, 1200, 5200);
                    bell(ctx, d, t, 'C6', 0.35, 0.16); bell(ctx, d, t + 0.08, 'E6', 0.45, 0.16);
                } else if (n === 2) {                    // 더블: 세 음 상승
                    swish(ctx, d, st.noise, t, 0.28, 0.34, 900, 5600);
                    bell(ctx, d, t, 'C6', 0.4, 0.17); bell(ctx, d, t + 0.075, 'E6', 0.4, 0.17); bell(ctx, d, t + 0.15, 'G6', 0.55, 0.17);
                } else if (n === 3) {                    // 트리플: 네 음 + 반짝임
                    swish(ctx, d, st.noise, t, 0.34, 0.38, 700, 6200);
                    ['C6', 'E6', 'G6', 'C7'].forEach((nm, i) => bell(ctx, d, t + i * 0.07, nm, 0.5 + i * 0.05, 0.18));
                    fan(ctx, d, t + 0.21, [['E6', 0, 0.35, 0.6], ['G6', 0, 0.35, 0.5]], 'square', 0.1);
                    sparkle(ctx, d, t + 0.25, 6, 0.4, 0.05);
                } else {                                 // 테트리스(4줄): 시원한 상승 바람 + 큰 아르페지오 + 긴 화음
                    swish(ctx, d, st.noise, t, 0.5, 0.46, 400, 7000);
                    thump(ctx, d, t, 130, 45, 0.3, 0.45, 'sine');
                    ['C5', 'E5', 'G5', 'C6', 'E6', 'G6'].forEach((nm, i) => bell(ctx, d, t + i * 0.06, nm, 0.55, 0.19));
                    fan(ctx, d, t + 0.36, [['C6', 0, 0.9], ['E6', 0, 0.9, 0.8], ['G6', 0, 0.9, 0.7], ['C7', 0, 0.9, 0.5]], 'square', 0.13);
                    tone(ctx, d, 'triangle', freq('C3'), t + 0.36, 0.8, 0.3, 0.6);
                    sparkle(ctx, d, t + 0.3, 14, 0.9, 0.06);
                }
            } else if (name === 'whoosh') {              // 낚싯대 휘두르는 소리
                swish(ctx, d, st.noise, t, 0.28, 0.4, 500, 3000);
            } else if (name === 'splash') {              // 찌가 풍덩
                noiseHit(ctx, d, st.noise, t, 0.22, 0.32, 900);
                thump(ctx, d, t, 520, 190, 0.14, 0.22, 'sine');
            } else if (name === 'bite') {                // 입질! 띠링
                fan(ctx, d, t, [['E6', 0, 0.07], ['A6', 0.09, 0.14]], 'square', 0.12);
            } else if (name === 'miss') {                // 놓쳤을 때
                fan(ctx, d, t, [['A4', 0, 0.12], ['E4', 0.12, 0.28]], 'triangle', 0.28);
            } else if (name === 'catch') {               // 물고기 낚음: 빠라밤~ (등급이 높을수록 화려해짐)
                const tier = Math.max(0, Math.min(6, Math.floor(Number(arg) || 0)));
                if (tier === 0) {                        // 잡동사니: 뿌우...
                    fan(ctx, d, t, [['E4', 0, 0.18], ['C4', 0.17, 0.4]], 'triangle', 0.3);
                } else if (tier <= 2) {                  // 빠-라-밤!
                    fan(ctx, d, t, [['G4', 0, 0.09], ['C5', 0.1, 0.09], ['E5', 0.2, 0.55], ['G5', 0.2, 0.55, 0.6]], 'square', 0.15);
                    tone(ctx, d, 'triangle', freq('C3'), t + 0.2, 0.5, 0.28, 0.6);
                } else if (tier === 3) {                 // 희귀
                    fan(ctx, d, t, [['C5', 0, 0.08], ['E5', 0.09, 0.08], ['G5', 0.18, 0.08], ['C6', 0.27, 0.65], ['E6', 0.27, 0.65, 0.55], ['G5', 0.27, 0.65, 0.6]], 'square', 0.15);
                    tone(ctx, d, 'triangle', freq('C3'), t + 0.27, 0.6, 0.3, 0.6);
                    sparkle(ctx, d, t + 0.3, 4, 0.4, 0.05);
                } else if (tier === 4) {                 // 영웅
                    fan(ctx, d, t, [['G4', 0, 0.08], ['C5', 0.09, 0.08], ['E5', 0.18, 0.08], ['G5', 0.27, 0.08], ['C6', 0.36, 0.85], ['E6', 0.36, 0.85, 0.6], ['G6', 0.36, 0.85, 0.5], ['G5', 0.36, 0.85, 0.6]], 'square', 0.15);
                    tone(ctx, d, 'triangle', freq('C3'), t + 0.36, 0.8, 0.34, 0.6);
                    sparkle(ctx, d, t + 0.4, 7, 0.6, 0.06);
                } else if (tier === 5) {                 // 전설
                    fan(ctx, d, t, [['C5', 0, 0.07], ['E5', 0.08, 0.07], ['G5', 0.16, 0.07], ['C6', 0.24, 0.07], ['E6', 0.32, 0.07], ['G6', 0.4, 1.1], ['C6', 0.4, 1.1, 0.8], ['E6', 0.4, 1.1, 0.7], ['G5', 0.4, 1.1, 0.7]], 'square', 0.15);
                    tone(ctx, d, 'triangle', freq('C3'), t + 0.4, 1.0, 0.36, 0.6);
                    thump(ctx, d, t + 0.4, 120, 45, 0.25, 0.5, 'sine');
                    sparkle(ctx, d, t + 0.4, 12, 0.9, 0.06);
                } else {                                 // 신화: 가장 화려한 팡파레
                    fan(ctx, d, t, [['C5', 0, 0.07], ['E5', 0.07, 0.07], ['G5', 0.14, 0.07], ['C6', 0.21, 0.07], ['E6', 0.28, 0.07], ['G6', 0.35, 0.07], ['C7', 0.42, 0.07],
                        ['C6', 0.55, 1.6], ['E6', 0.55, 1.6, 0.8], ['G6', 0.55, 1.6, 0.7], ['C7', 0.55, 1.6, 0.5], ['G5', 0.55, 1.6, 0.7]], 'square', 0.15);
                    fan(ctx, d, t + 0.55, [['C4', 0, 1.5, 1], ['G4', 0, 1.5, 0.8]], 'triangle', 0.3);
                    thump(ctx, d, t + 0.55, 150, 40, 0.45, 0.6, 'sine');
                    sparkle(ctx, d, t + 0.45, 18, 1.5, 0.07);
                }
            }
        } catch (e) { }
    }

    // ===== 공개 API =====
    const API = {
        prime() { bindUnlock(); unlock(); },

        play(name) {
            if (!st.enabled) return;
            if (!COMPILED[name]) return;
            if (st.state === 'playing' && st.song === name) return;
            const ctx = getCtx();
            if (!ctx) return;

            if (st.state === 'paused' && st.song === name) {   // 일시정지 → 재개
                try { ctx.resume(); } catch (e) { }
                st.state = 'playing';
                st.autoPaused = false;
                st.timer = setInterval(tick, TICK_MS);
                return;
            }
            if (st.state !== 'idle') {                          // 다른 곡/정지 중 → 정리하고 새로 시작
                clearInterval(st.timer); st.timer = null;
                clearTimeout(st.stopTimer); st.stopTimer = null;
                st.master.gain.cancelScheduledValues(ctx.currentTime);
            }
            bindUnlock();
            if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { } }

            st.song = name;
            st.comp = COMPILED[name];
            st.idx = 0; st.loop = 0;
            st.nextTime = ctx.currentTime + 0.06;
            st.state = 'playing';
            st.autoPaused = false;
            st.master.gain.cancelScheduledValues(ctx.currentTime);
            st.master.gain.setValueAtTime(0, ctx.currentTime);
            st.master.gain.linearRampToValueAtTime(MASTER_VOL, ctx.currentTime + 0.25);
            duckSite();
            clearInterval(st.timer);
            st.timer = setInterval(tick, TICK_MS);
            tick();
        },

        pause() {
            if (st.state !== 'playing') return;
            clearInterval(st.timer); st.timer = null;
            st.state = 'paused';
            try { st.ctx.suspend(); } catch (e) { }
        },

        stop(fadeSec) {
            if (st.state === 'idle' || st.state === 'stopping') return;
            const ctx = st.ctx;
            const fade = (fadeSec === undefined) ? 0.35 : fadeSec;
            clearInterval(st.timer); st.timer = null;
            if (!ctx) { finishStop(); return; }
            if (st.state === 'paused') { try { ctx.resume(); } catch (e) { } }
            st.state = 'stopping';
            const now = ctx.currentTime;
            st.master.gain.cancelScheduledValues(now);
            st.master.gain.setValueAtTime(st.master.gain.value, now);
            st.master.gain.linearRampToValueAtTime(0, now + Math.max(0.02, fade));
            st.stopTimer = setTimeout(finishStop, Math.max(30, fade * 1000 + 60));
        },

        setSpeed(x) {
            const v = Number(x);
            if (!isFinite(v)) return;
            st.speed = Math.max(0.8, Math.min(1.6, v));
        },

        sfx: playSfx,

        isEnabled() { return st.enabled; },

        toggle() {
            st.enabled = !st.enabled;
            try { localStorage.setItem(PREF_KEY, st.enabled ? '1' : '0'); } catch (e) { }
            if (!st.enabled) API.stop(0.15);
            return st.enabled;
        },

        // 🔊/🔇 버튼 연결 (게임 상단바용)
        bindButton(el) {
            if (!el) return;
            const paint = () => { el.textContent = st.enabled ? '🔊' : '🔇'; el.setAttribute('aria-label', st.enabled ? '배경음악 끄기' : '배경음악 켜기'); };
            paint();
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                API.toggle();
                paint();
                if (st.enabled) API.prime();   // 클릭 안에서 오디오 잠금 해제 (재생은 게임 루프가 이어서 시작)
                el.blur();
            });
        }
    };

    // 탭이 숨겨지면 자동 일시정지, 돌아오면 이어서 재생
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            if (st.state === 'playing') { API.pause(); st.autoPaused = true; }
        } else if (st.autoPaused && st.state === 'paused' && st.song) {
            const name = st.song;
            st.autoPaused = false;
            API.play(name);
        }
    });

    // 테스트/검증용: 지정한 컨텍스트에 곡을 통째로 예약 (OfflineAudioContext 렌더링에 사용)
    function renderTo(ctx, name, loops, speed) {
        const comp = COMPILED[name];
        const master = ctx.createGain();
        master.gain.value = MASTER_VOL;
        master.connect(ctx.destination);
        const bus = makeBus(ctx, master);
        const noise = makeNoise(ctx);
        const u = 60 / (comp.def.bpm * (speed || 1)) / 2;
        let t = 0.05;
        for (let l = 0; l < loops; l++) {
            for (let i = 0; i < comp.total; i++) { scheduleUnit(ctx, bus, noise, comp, i, t, u, l); t += u; }
        }
        return t;
    }

    window.GameBGM = API;
    window.GameBGM._test = { COMPILED: COMPILED, renderTo: renderTo, st: st, tick: tick, freq: freq, parseSeq: parseSeq };
})();
