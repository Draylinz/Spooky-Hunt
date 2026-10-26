/* ================================================================
   SPOOKY HUNT — shared engine (used by player + host pages)
   You shouldn't need to edit this file.
   ================================================================ */
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();
const FV = firebase.firestore.FieldValue;

const COL = { state: "state", teams: "teams", uploads: "uploads", chat: "chat", events: "events", locations: "locations" };
const stateRef = db.collection(COL.state).doc("main");

/* ---------- helpers ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slug = s => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const fmt = s => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const store = {
  get(k) { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
  set(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} }
};

/* Item lookup for the fixed list */
const ITEMS = {};
CATEGORIES.forEach(c => c.items.forEach((it, i) => {
  const o = typeof it === "string" ? { name: it } : it, id = `${c.key}-${i}`;
  ITEMS[id] = { id, name: o.name, icon: o.icon || c.icon, hint: o.hint || "", cat: c.key, pts: o.pts ?? c.pts };
}));
const ITEM_TOTAL = Object.keys(ITEMS).length;

/* Live leaderboard rows (shared by player + host) */
function boardHTML(teams, myId, prev = {}) {
  if (!teams.length) return `<div class="small">No teams yet…</div>`;
  return `<div class="lb-head"><span>#</span><span>Team</span><span>Found</span><span>Pts</span></div>` + teams.map((t, i) => {
    const found = (t.done || []).filter(id => ITEMS[id]).length, bump = prev[t.id] !== undefined && prev[t.id] !== t.points;
    return `<div class="row lb ${t.id === myId ? "me" : ""} ${i < 3 ? "top" + (i + 1) : ""} ${bump ? "bump" : ""}">
      <span class="rk">${["🥇", "🥈", "🥉"][i] || "#" + (i + 1)}</span>
      <span class="nm">${esc(t.name)}<small>${(t.members || []).length} player${(t.members || []).length === 1 ? "" : "s"}</small></span>
      <span class="fd">${found}<small>/${ITEM_TOTAL}</small></span><span class="pt">${t.points || 0}</span></div>`;
  }).join("");
}
const CAT = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));
const EVENT_DEFS = Object.fromEntries(EVENTS.map(e => [e.id, e]));

/* ---------- hunt clock ---------- */
function elapsedSec(state) {
  if (!state?.startTime) return 0;
  return Math.floor((Date.now() - state.startTime.toDate().getTime()) / 1000);
}
function secondsLeft(state) {
  if (!state?.startTime) return state?.duration ?? HUNT.defaultMinutes * 60;
  return Math.max(0, state.duration - elapsedSec(state));
}
function phase(state) {
  const st = state?.status || "waiting";
  if (st === "running" && state.startTime && secondsLeft(state) <= 0) return "ended";
  return st;
}
function makeSchedule(durationSec) {
  const sched = {};
  EVENTS.forEach(e => {
    const [a, b] = e.window || [0.1, 0.9];
    sched[e.id] = Math.round(durationSec * (a + Math.random() * (b - a)));
  });
  return sched;
}

/* ---------- live events ---------- */
// Fires an event exactly once, no matter how many phones try at the same moment.
async function fireEvent(def) {
  const evRef = db.collection(COL.events).doc(def.id);
  const needsTeams = def.type === "points" || def.type === "steal";
  const teamIds = needsTeams ? (await db.collection(COL.teams).get()).docs.map(d => d.id) : [];

  return db.runTransaction(async tx => {
    const ev = await tx.get(evRef);
    if (ev.exists) return false;

    const snaps = await Promise.all(teamIds.map(id => tx.get(db.collection(COL.teams).doc(id))));
    const teams = snaps.filter(s => s.exists).map(s => ({ id: s.id, ref: s.ref, ...s.data() }))
      .sort((x, y) => (y.points || 0) - (x.points || 0));
    const pick = w => w === "leader" ? teams[0] : w === "last" ? teams[teams.length - 1]
      : String(w).startsWith("team:") ? teams.find(t => t.id === w.slice(5)) : null;
    let result = "";

    if (def.type === "points" && teams.length) {
      const targets = def.target === "all" ? teams : [pick(def.target)].filter(Boolean);
      targets.forEach(t => {
        const change = Math.max(def.pts, -(t.points || 0)); // never below 0
        tx.update(t.ref, { points: FV.increment(change) });
      });
      result = targets.map(t => `${t.name} ${def.pts >= 0 ? "+" : ""}${def.pts}`).join(", ");
    }
    if (def.type === "steal" && teams.length > 1) {
      const from = pick(def.from), to = pick(def.to);
      if (from && to && from.id !== to.id) {
        const amt = Math.min(def.pts, from.points || 0);
        tx.update(from.ref, { points: FV.increment(-amt) });
        tx.update(to.ref, { points: FV.increment(amt) });
        result = `${from.name} −${amt} → ${to.name} +${amt}`;
      }
    }

    const doc = {
      defId: def.id, type: def.type, title: def.title || "", text: def.text || "",
      result, firedAt: FV.serverTimestamp(), firedAtMs: Date.now()
    };
    if (def.type === "bonus") {
      Object.assign(doc, { task: def.task, pts: def.pts, firstOnly: !!def.firstOnly,
        expiresAtMs: Date.now() + (def.minutes || 5) * 60000, claimedBy: null });
    }
    tx.set(evRef, doc);
    tx.set(db.collection(COL.chat).doc(), {
      kind: "event", name: def.title || "Event",
      text: [def.text, def.task ? `Task: ${def.task} (${def.pts} pts)` : "", result].filter(Boolean).join(" · "),
      createdAt: FV.serverTimestamp()
    });
    return true;
  });
}

// Every open page runs this; whoever gets there first fires the event.
function startAutoEvents(getState, getFired) {
  const tried = new Set();
  setInterval(() => {
    const s = getState();
    if (phase(s) !== "running" || !s.schedule || !s.startTime) return;
    const el = elapsedSec(s), fired = getFired();
    Object.entries(s.schedule).forEach(([id, at]) => {
      if (el >= at && !fired.has(id) && !tried.has(id) && EVENT_DEFS[id]) {
        tried.add(id);
        setTimeout(() => fireEvent(EVENT_DEFS[id]).catch(e => { console.warn("event", e); tried.delete(id); }),
          Math.random() * 2500);
      }
    });
  }, 1000);
}

/* ---------- chat ---------- */
function sendChat(name, team, text, kind = "user") {
  text = String(text || "").trim().slice(0, 500);
  if (!text) return Promise.resolve();
  return db.collection(COL.chat).add({ kind, name: name.slice(0, 40), team: team || "", text, createdAt: FV.serverTimestamp() });
}
function listenChat(cb) {
  return db.collection(COL.chat).orderBy("createdAt").limitToLast(200)
    .onSnapshot(s => cb(s.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }))), e => console.warn("chat", e));
}
function chatHTML(m, me) {
  const t = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
  if (m.kind === "event") return `<div class="msg ev"><b>${esc(m.name)}</b><div>${esc(m.text)}</div></div>`;
  if (m.kind === "feed") return `<div class="msg feed">${esc(m.text)}</div>`;
  const mine = me && m.name === me.name && m.team === me.team;
  return `<div class="msg ${m.kind === "host" ? "host" : ""} ${mine ? "mine" : ""}">
    <div class="who">${esc(m.name)}${m.team ? ` <span>· ${esc(m.team)}</span>` : ""}<i>${t}</i></div>
    <div>${esc(m.text)}</div></div>`;
}

/* ---------- 80s synth sound engine (no audio files needed) ---------- */
const SOUND = (() => {
  let ctx, master, verbIn, delayIn;
  let muted = store.get("muted") === "1";
  function init() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume(); return ctx; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master = ctx.createGain(); master.gain.value = muted ? 0 : .85;
    master.connect(comp).connect(ctx.destination);
    // big dark reverb
    const verb = ctx.createConvolver(), len = ctx.sampleRate * 3.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    verb.buffer = ir; verbIn = ctx.createGain(); const vOut = ctx.createGain(); vOut.gain.value = .45;
    verbIn.connect(verb).connect(vOut).connect(master);
    // tape-ish echo
    const dl = ctx.createDelay(1.5), fb = ctx.createGain(), lp = ctx.createBiquadFilter(), dOut = ctx.createGain();
    dl.delayTime.value = .32; fb.gain.value = .38; lp.type = "lowpass"; lp.frequency.value = 2200; dOut.gain.value = .35;
    delayIn = ctx.createGain(); delayIn.connect(dl); dl.connect(lp).connect(fb).connect(dl); lp.connect(dOut).connect(master);
    return ctx;
  }
  const T = () => ctx.currentTime;
  function out(node, { verb = .3, delay = 0, bus } = {}) {
    node.connect(bus || master);
    if (verb) { const g = ctx.createGain(); g.gain.value = verb; node.connect(g).connect(verbIn); }
    if (delay) { const g = ctx.createGain(); g.gain.value = delay; node.connect(g).connect(delayIn); }
  }
  // one synth voice: detuned oscillators -> resonant lowpass with envelope -> amp envelope
  function synth({ f, at = 0, dur = .3, type = "sawtooth", vol = .15, detune = 9, voices = 2, cut = 2400, cutEnd, q = 4,
                   a = .005, r, glide, verb, delay, t0, bus }) {
    const t = (t0 ?? T()) + at, rel = r ?? dur * .8;
    const filt = ctx.createBiquadFilter(); filt.type = "lowpass"; filt.Q.value = q;
    filt.frequency.setValueAtTime(cut, t); if (cutEnd) filt.frequency.exponentialRampToValueAtTime(cutEnd, t + dur);
    const amp = ctx.createGain(); amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(vol, t + a);
    amp.gain.setValueAtTime(vol, t + Math.max(a, dur - rel)); amp.gain.exponentialRampToValueAtTime(.0001, t + dur);
    for (let i = 0; i < voices; i++) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
      if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
      o.detune.value = voices > 1 ? (i - (voices - 1) / 2) * detune * 2 : 0;
      o.connect(filt); o.start(t); o.stop(t + dur + .05);
    }
    filt.connect(amp); out(amp, { verb, delay, bus });
  }
  function noise({ at = 0, dur = .5, vol = .2, type = "bandpass", f = 1200, fEnd, q = 1, a = .01, verb = .3, t0, bus }) {
    const t = (t0 ?? T()) + at, len = Math.ceil(ctx.sampleRate * (dur + .1)), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const filt = ctx.createBiquadFilter(); filt.type = type; filt.Q.value = q; filt.frequency.setValueAtTime(f, t);
    if (fEnd) filt.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
    const amp = ctx.createGain(); amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(vol, t + a); amp.gain.exponentialRampToValueAtTime(.0001, t + dur);
    src.connect(filt).connect(amp); out(amp, { verb, bus }); src.start(t); src.stop(t + dur + .05);
  }
  const N = n => 440 * Math.pow(2, (n - 69) / 12);   // MIDI note -> Hz
  const play = fn => { if (muted) return; try { init(); fn(); } catch (e) { console.warn("sound", e); } };

  // ---------- generative lofi horror soundtrack (original composition) ----------
  let mBus, mPlaying = false, mTimer = null, mNext = 0, mStep = 0;
  const BPM = 74, S16 = 60 / BPM / 4;
  const PROG = [
    { root: 45, tones: [57, 60, 64, 67, 71] },   // Am9
    { root: 41, tones: [57, 60, 64, 65] },       // Fmaj7
    { root: 38, tones: [53, 57, 60, 64] },       // Dm9
    { root: 40, tones: [56, 59, 62, 64] }        // E7
  ];
  const ARP = [0, 2, 1, 3, 2, 4, 3, 1];
  function mInit() {
    if (mBus) return;
    mBus = ctx.createGain(); mBus.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3600; lp.Q.value = .5;
    const send = ctx.createGain(); send.gain.value = .3;
    mBus.connect(lp).connect(master); lp.connect(send).connect(verbIn);
  }
  function mPlayStep(s, t0) {
    const cycle = Math.floor(s / 64), bar = Math.floor(s / 16) % 4, pos = s % 16, ch = PROG[bar], bus = mBus;
    const t = t0 + (pos % 4 === 2 ? S16 * .28 : 0);              // lazy swing on the off-beats
    if (pos === 0) {
      ch.tones.forEach(n => synth({ f: N(n), t0, dur: S16 * 16 + .5, vol: .028, voices: 3, detune: 11, cut: 650, cutEnd: 1500, q: 2, a: .7, r: 1.3, bus, verb: 0 }));
      synth({ f: N(ch.root), t0, dur: S16 * 6, type: "triangle", vol: .24, voices: 1, cut: 500, a: .01, r: .4, bus, verb: 0 });
    }
    if (pos === 10) synth({ f: N(ch.root), t0: t, dur: S16 * 3, type: "triangle", vol: .17, voices: 1, cut: 500, bus, verb: 0 });
    if (cycle >= 1) {                                              // drums come in on the 2nd pass
      if (pos === 0 || pos === 10 || (pos === 7 && bar % 2)) synth({ f: 115, glide: 42, t0: t, dur: .32, type: "sine", vol: .55, voices: 1, cut: 800, a: .002, r: .3, bus, verb: 0 });
      if (pos === 4 || pos === 12) {
        noise({ t0: t, dur: .2, vol: .2, type: "bandpass", f: 1700, q: .7, a: .002, bus, verb: 0 });
        synth({ f: 200, glide: 150, t0: t, dur: .1, type: "triangle", vol: .08, voices: 1, bus, verb: 0 });
      }
      if (pos % 2 === 0) noise({ t0: t, dur: .035, vol: pos % 4 ? .03 : .05, type: "highpass", f: 7500, a: .001, bus, verb: 0 });
    }
    if (cycle >= 2 && cycle % 2 === 0 && pos % 2 === 0) {         // arpeggio on alternate passes
      const n = ch.tones[ARP[(pos / 2) % ARP.length] % ch.tones.length] + 12;
      synth({ f: N(n), t0: t, dur: S16 * 1.6, type: "triangle", vol: .05, voices: 1, cut: 2600, a: .005, r: .25, bus, verb: 0, delay: .25 });
    }
    if (cycle % 2 === 1 && bar === 3 && pos === 8)                 // little music-box answer
      [76, 74, 71].forEach((n, i) => synth({ f: N(n), t0: t + i * S16 * 2, dur: .6, type: "sine", vol: .05, voices: 1, bus, delay: .3, verb: 0 }));
  }
  function mSchedule() {
    if (mNext < ctx.currentTime - .3) mNext = ctx.currentTime + .05;   // tab was asleep: skip ahead
    while (mNext < ctx.currentTime + .3) { mPlayStep(mStep, mNext); mStep++; mNext += S16; }
  }
  function fadeTo(v, sec) {
    const t = ctx.currentTime; mBus.gain.cancelScheduledValues(t); mBus.gain.setValueAtTime(mBus.gain.value, t); mBus.gain.linearRampToValueAtTime(v, t + sec);
  }
  const music = {
    get playing() { return mPlaying; },
    start() {
      if (mPlaying) return; init(); mInit(); mPlaying = true; mStep = 0; mNext = ctx.currentTime + .1;
      fadeTo(.9, 3); mTimer = setInterval(mSchedule, 60); mSchedule();
    },
    stop(fade = 1.5) {
      if (!mPlaying) return; mPlaying = false; clearInterval(mTimer); fadeTo(0, fade);
    },
    duck(sec = 3) {
      if (!mPlaying) return; const t = ctx.currentTime;
      mBus.gain.cancelScheduledValues(t); mBus.gain.setValueAtTime(mBus.gain.value, t);
      mBus.gain.linearRampToValueAtTime(.2, t + .2); mBus.gain.setValueAtTime(.2, t + sec); mBus.gain.linearRampToValueAtTime(.9, t + sec + 1.5);
    },
    // for offline previews: schedule N steps immediately
    prerender(steps) { init(); mInit(); mBus.gain.value = .9; for (let i = 0; i < steps; i++) mPlayStep(i, .1 + i * S16); return .1 + steps * S16; }
  };

  return {
    init, N, music,
    get muted() { return muted; },
    setMuted(m) { muted = m; store.set("muted", m ? "1" : ""); if (master) master.gain.value = m ? 0 : .85; },

    // distant thunder (with a sharp crack up front)
    thunder: () => play(() => {
      noise({ dur: .25, vol: .22, type: "highpass", f: 2500, a: .002, verb: .6 });
      noise({ at: .05, dur: 3.4, vol: .5, type: "lowpass", f: 380, fEnd: 45, q: .7, a: .08, verb: .9 });
    }),

    // old-TV static burst for the intro
    // rival nearby: sonar-style double ping with echo
    proximity: () => play(() => {
      [0, .32].forEach((at, k) => {
        synth({ f: N(k ? 88 : 83), at, dur: .9, type: "sine", vol: .32, voices: 1, a: .003, r: .85, verb: .6, delay: .5 });
        synth({ f: N(k ? 100 : 95), at, dur: .4, type: "sine", vol: .06, voices: 1, a: .002, verb: .4 });
      });
      synth({ f: 90, glide: 55, at: .02, dur: .35, type: "sine", vol: .25, voices: 1, verb: .1 });
    }),

    staticBurst: () => play(() => {
      noise({ dur: .75, vol: .22, type: "bandpass", f: 3200, q: .3, a: .005, verb: .2 });
      synth({ f: 60, dur: .75, type: "square", vol: .05, voices: 1, cut: 400, verb: 0 });
    }),

    // tiny UI tick for taps/tabs
    tap: () => play(() => synth({ f: N(96), dur: .06, type: "square", vol: .3, cut: 4000, voices: 1, verb: .1 })),

    // joining a team: power-on sweep + sub thump
    join: () => play(() => {
      noise({ dur: .9, vol: .12, type: "bandpass", f: 300, fEnd: 5000, q: 2, a: .6, verb: .4 });
      synth({ f: N(33), glide: N(45), dur: 1, cut: 200, cutEnd: 3000, vol: .12, voices: 3, detune: 12, verb: .5 });
      synth({ f: 45, glide: 35, at: .85, dur: .5, type: "sine", vol: .5, voices: 1, verb: .2 });
      [69, 76, 81].forEach((n, i) => synth({ f: N(n), at: .9 + i * .07, dur: .5, type: "square", vol: .05, cut: 3000, voices: 1, delay: .4 }));
    }),

    // points scored: bright minor arpeggio with echo
    score: (big) => play(() => {
      const seq = big ? [57, 64, 69, 72, 76, 81, 84, 88] : [69, 72, 76, 81, 84];
      seq.forEach((n, i) => synth({ f: N(n), at: i * .065, dur: .35, type: "sawtooth", vol: .14, cut: 1800, cutEnd: 600, q: 8, delay: .45, verb: .3 }));
      if (big) synth({ f: N(45), dur: 1.4, cut: 400, cutEnd: 2500, vol: .12, voices: 3, detune: 14, verb: .6 });
      synth({ f: 55, glide: 40, dur: .25, type: "sine", vol: .35, voices: 1, verb: 0 });
    }),

    // upload failed / not allowed
    error: () => play(() => {
      synth({ f: N(40), dur: .35, type: "square", vol: .12, cut: 900, voices: 2, detune: 30, verb: .2 });
      synth({ f: N(39), at: .18, dur: .4, type: "square", vol: .12, cut: 700, voices: 2, detune: 30, verb: .3 });
    }),

    // chat message: two-tone blip with echo
    chat: () => play(() => {
      synth({ f: N(88), dur: .09, type: "square", vol: .16, cut: 5000, voices: 1, delay: .5, verb: .2 });
      synth({ f: N(95), at: .07, dur: .12, type: "square", vol: .16, cut: 5000, voices: 1, delay: .5, verb: .2 });
    }),

    // LIVE EVENT stinger: noise riser -> impact -> dark detuned minor chord + sub drop + metallic ring
    event: (kind = "message") => play(() => {
      noise({ dur: .55, vol: .16, type: "highpass", f: 400, fEnd: 8000, q: .7, a: .5, verb: .5 });
      const hit = .55;
      noise({ at: hit, dur: 1.2, vol: .3, type: "lowpass", f: 900, fEnd: 120, q: 1, a: .005, verb: .8 });
      synth({ f: 70, glide: 28, at: hit, dur: 1.8, type: "sine", vol: .6, voices: 1, verb: .3 });
      const chord = kind === "bonus" ? [45, 52, 57, 60, 64] : [40, 47, 52, 55, 58];   // A minor vs. E diminished-ish
      chord.forEach(n => synth({ f: N(n), at: hit, dur: 2.6, vol: .07, voices: 3, detune: 16, cut: 300, cutEnd: 2200, q: 6, a: .04, r: 1.6, verb: .7 }));
      [91, 92].forEach(n => synth({ f: N(n), at: hit, dur: 2, type: "square", vol: .025, voices: 1, cut: 6000, verb: .9, delay: .5 }));
      if (kind === "bonus") [69, 76, 81, 88].forEach((n, i) => synth({ f: N(n), at: hit + .5 + i * .1, dur: .4, vol: .07, cut: 2500, q: 6, delay: .5 }));
      if (kind === "steal" || kind === "penalty") synth({ f: N(64), glide: N(28), at: hit + .4, dur: 1.2, vol: .1, voices: 3, detune: 25, cut: 3000, cutEnd: 200, verb: .6 });
    }),

    // last 10 seconds tick (higher on the final 3)
    tick: (urgent) => play(() => {
      synth({ f: urgent ? N(88) : N(81), dur: .06, type: "square", vol: urgent ? .55 : .4, cut: 5000, voices: 1, verb: .15 });
      noise({ dur: .04, vol: .12, type: "highpass", f: 6000, verb: 0 });
    }),

    // 5-minute warning siren
    warning: () => play(() => {
      for (let i = 0; i < 3; i++) {
        synth({ f: N(76), at: i * .5, dur: .25, type: "square", vol: .15, voices: 2, detune: 8, cut: 3500, verb: .4 });
        synth({ f: N(71), at: i * .5 + .25, dur: .25, type: "square", vol: .15, voices: 2, detune: 8, cut: 3500, verb: .4 });
      }
    }),

    // hunt over: dark descending chord progression + boom
    end: () => play(() => {
      synth({ f: 60, glide: 25, dur: 2.5, type: "sine", vol: .6, voices: 1, verb: .4 });
      noise({ dur: 2, vol: .25, type: "lowpass", f: 700, fEnd: 80, verb: .9 });
      const prog = [[45, 52, 57, 60], [41, 48, 53, 57], [38, 45, 50, 53], [40, 47, 52, 56]];  // Am  F  Dm  E
      prog.forEach((ch, i) => ch.forEach(n => synth({ f: N(n), at: .4 + i * .95, dur: 1.5, vol: .065, voices: 3, detune: 14, cut: 500, cutEnd: 1800, q: 5, a: .08, r: .9, verb: .7 })));
      [76, 74, 72, 71].forEach((n, i) => synth({ f: N(n), at: .4 + i * .95, dur: .9, type: "square", vol: .04, voices: 1, cut: 2500, delay: .5, verb: .5 }));
    })
  };
})();
document.addEventListener("pointerdown", () => { try { if (!SOUND.muted) SOUND.init(); } catch {} }, { once: true });
// legacy names used by the pages
const SFX = { score: () => SOUND.score(), event: k => SOUND.event(k), chat: () => SOUND.chat(), end: () => SOUND.end() };

/* ---------- screen effects ---------- */
function flickerScreen() {
  document.body.classList.remove("flicker"); void document.body.offsetWidth;
  document.body.classList.add("flicker");
  setTimeout(() => document.body.classList.remove("flicker"), 1500);
}

// drifting ash / spores in the background
function startAsh(canvasId) {
  const c = document.getElementById(canvasId); if (!c) return;
  const g = c.getContext("2d"); let W, H, parts = [];
  const resize = () => { W = c.width = innerWidth * devicePixelRatio; H = c.height = innerHeight * devicePixelRatio; };
  resize(); addEventListener("resize", resize);
  const count = Math.min(90, Math.round(innerWidth / 14));
  const mk = (y) => ({ x: Math.random() * W, y: y ?? Math.random() * H, r: (Math.random() * 1.8 + .4) * devicePixelRatio,
    vx: (Math.random() - .5) * .25, vy: -(Math.random() * .35 + .08), a: Math.random() * .5 + .15, w: Math.random() * 6.28, red: Math.random() < .18 });
  for (let i = 0; i < count; i++) parts.push(mk());
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) parts = parts.slice(0, 20);
  (function frame() {
    g.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.w += .01; p.x += p.vx + Math.sin(p.w) * .25; p.y += p.vy * devicePixelRatio;
      if (p.y < -10) Object.assign(p, mk(H + 10));
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.28);
      g.fillStyle = p.red ? `rgba(255,60,80,${p.a})` : `rgba(220,210,220,${p.a})`;
      g.shadowColor = p.red ? "#ff1f3d" : "#fff"; g.shadowBlur = p.red ? 8 : 4; g.fill();
    }
    requestAnimationFrame(frame);
  })();
}

// Realistic procedural full moon (near-side layout), drawn once into a canvas.
function drawMoon(cv, px = 360) {
  cv.width = cv.height = px;
  const N = px * px, R = px / 2, A = new Float32Array(N), H = new Float32Array(N);
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const P = new Float32Array(256 * 256); for (let i = 0; i < P.length; i++) P[i] = rnd();
  const sm = t => t * t * (3 - 2 * t);
  const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
    const a = P[(xi & 255) + (yi & 255) * 256], b = P[((xi + 1) & 255) + (yi & 255) * 256], c = P[(xi & 255) + ((yi + 1) & 255) * 256], e = P[((xi + 1) & 255) + ((yi + 1) & 255) * 256];
    return (a * (1 - xf) + b * xf) * (1 - yf) + (c * (1 - xf) + e * xf) * yf; };
  const fbm = (x, y, o) => { let s = 0, a = .5, f = 1; for (let i = 0; i < o; i++) { s += a * vn(x * f, y * f); a *= .5; f *= 2.02; } return s; };
  // maria: overlapping soft ellipses [x, y, rx, ry, rot] laid out like the real near side (north up)
  const maria = [
    [-.36,-.44,.27,.25,0],                                           // Mare Imbrium
    [-.66,-.06,.20,.40,.15], [-.58,.26,.16,.16,0], [-.74,-.36,.10,.10,0], // Oceanus Procellarum
    [-.47,.47,.10,.09,0],                                            // Mare Humorum
    [-.16,.43,.15,.10,.2],                                           // Mare Nubium
    [-.02,-.18,.08,.06,0],                                           // Mare Vaporum
    [-.28,-.06,.15,.13,0], [-.32,.2,.11,.09,0],                      // Mare Insularum + Cognitum
    [-.05,-.70,.36,.06,0],                                           // Mare Frigoris
    [.18,-.38,.15,.14,0],                                            // Mare Serenitatis
    [.34,-.08,.19,.15,.4],                                           // Mare Tranquillitatis
    [.56,.18,.09,.15,-.25],                                          // Mare Fecunditatis
    [.32,.34,.08,.07,0],                                             // Mare Nectaris
    [.69,-.30,.10,.09,0]                                             // Mare Crisium
  ];
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
    const nx = (x + .5 - px / 2) / R, ny = (y + .5 - px / 2) / R, r2 = nx * nx + ny * ny, i = y * px + x;
    if (r2 > 1.0) { A[i] = -1; continue; }
    // domain-warped coords give the seas ragged, organic shorelines
    const wx = nx + (fbm(nx * 2 + 7, ny * 2, 4) - .5) * .14 + (fbm(nx * 8, ny * 8 + 2, 3) - .5) * .025, wy = ny + (fbm(nx * 2, ny * 2 + 9, 4) - .5) * .14 + (fbm(nx * 8 + 5, ny * 8, 3) - .5) * .025;
    let f = 0;                                                       // metaball field: seas melt into each other
    for (const [mx, my, sx, sy, rot] of maria) {
      const c = Math.cos(rot), sn = Math.sin(rot), dx = wx - mx, dy = wy - my, u = (dx * c + dy * sn) / sx, v = (-dx * sn + dy * c) / sy;
      f += Math.exp(-(u * u + v * v) * .95);
    }
    f += (fbm(nx * 5 + 2, ny * 5 + 8, 4) - .5) * .22;
    const m = sm(Math.min(1, Math.max(0, (f - .24) / .5)));
    const hl = .86 + (fbm(nx * 5 + 3, ny * 5 + 1, 5) - .5) * .2 + (fbm(nx * 18, ny * 18, 3) - .5) * .06;               // bright, mottled highlands
    const sea = .6 + (fbm(nx * 4 + 11, ny * 4 + 4, 4) - .5) * .2;             // darker basalt seas with tone variation
    A[i] = hl * (1 - m) + sea * m - .05 * m * m + (vn(nx * 70, ny * 70) - .5) * .035;
    H[i] = m;
  }
  // craters stamped in their bounding boxes: subtle bowl shading + faint bright rims (full moon = low contrast)
  const L = [.55, -.6];
  const stamp = (cx, cy, cr, k) => {
    const x0 = Math.max(0, Math.floor((cx - cr * 1.6) * R + px / 2)), x1 = Math.min(px - 1, Math.ceil((cx + cr * 1.6) * R + px / 2));
    const y0 = Math.max(0, Math.floor((cy - cr * 1.6) * R + px / 2)), y1 = Math.min(px - 1, Math.ceil((cy + cr * 1.6) * R + px / 2));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * px + x; if (A[i] < 0) continue;
      const nx = (x + .5 - px / 2) / R, ny = (y + .5 - px / 2) / R, dx = (nx - cx) / cr, dy = (ny - cy) / cr, dd = Math.hypot(dx, dy);
      if (dd < 1) A[i] += k * (-.05 * (1 - dd * dd) + .05 * (dx * L[0] + dy * L[1]) * dd);
      else if (dd < 1.5) A[i] += k * .045 * (1 - (dd - 1) / .5);
    }
  };
  for (let n = 0; n < 300; n++) { const r = .005 + Math.pow(rnd(), 4.5) * .05; stamp(rnd() * 2 - 1, rnd() * 2 - 1, r, .25 + rnd() * .35); }
  // ray craters: Tycho (south), Copernicus, Kepler, Aristarchus (brightest spot)
  const rayC = [[-.05, .62, .028, 1.0, 1.3], [-.33, -.08, .022, .18, .45], [-.52, -.02, .016, .25, .35], [-.62, -.28, .012, .45, .15]];
  for (const [cx, cy, cr, rayAmt, rayLen] of rayC) {
    const angs = Array.from({ length: 30 }, () => rnd() * Math.PI * 2), wid = angs.map(() => .05 + rnd() * .1), len = angs.map(() => (.4 + rnd() * .8) * rayLen);
    for (let i = 0, y = 0; y < px; y++) for (let x = 0; x < px; x++, i++) {
      if (A[i] < 0) continue;
      const nx = (x + .5 - px / 2) / R, ny = (y + .5 - px / 2) / R, dx = nx - cx, dy = ny - cy, dist = Math.hypot(dx, dy);
      if (dist > 1.4 * rayLen + .1) continue;
      const ang = Math.atan2(dy, dx); let ray = 0;
      for (let k = 0; k < angs.length; k++) { let da = Math.abs(ang - angs[k]); da = Math.min(da, Math.PI * 2 - da);
        if (da < wid[k] * 3) ray = Math.max(ray, Math.exp(-((da / wid[k]) ** 2)) * Math.exp(-dist / len[k])); }
      A[i] += rayAmt * (.05 * ray * (1 - H[i] * .2) + .14 * Math.exp(-((dist / (cr * 2)) ** 2)) + .04 * Math.exp(-((dist / (cr * 6)) ** 2)));
    }
  }
  const g = cv.getContext("2d"), img = g.createImageData(px, px), d = img.data;
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
    const i = y * px + x, o = i * 4; if (A[i] < 0) { d[o + 3] = 0; continue; }
    const nx = (x + .5 - px / 2) / R, ny = (y + .5 - px / 2) / R, r2 = nx * nx + ny * ny, nz = Math.sqrt(Math.max(0, 1 - r2));
    const lum = Math.max(0, Math.min(1.08, A[i] * (.9 + .1 * Math.pow(nz, .5))));   // gentle limb darkening
    d[o] = Math.min(255, lum * 252); d[o + 1] = Math.min(255, lum * 242); d[o + 2] = Math.min(255, lum * 228);
    d[o + 3] = r2 > .99 ? Math.round(255 * Math.min(1, (1 - r2) / .01)) : 255;
  }
  g.putImageData(img, 0, 0);
}

/* ---------- live location helpers ---------- */
function fmtRange(ft) {
  if (ft === 2640) return "half a mile";
  if (ft === 1320) return "a quarter mile";
  return ft >= 1000 ? `${+(ft / 5280).toFixed(2)} mi` : `${ft} ft`;
}
const playerKey = (teamId, name) => `${teamId}__${slug(name) || "player"}`.slice(0, 90);
function distMeters(a, b) {                     // haversine
  const R = 6371000, toR = Math.PI / 180, dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
