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
