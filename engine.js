/* ================================================================
   SPOOKY HUNT — shared engine (used by player + host pages)
   You shouldn't need to edit this file.
   ================================================================ */
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();
const FV = firebase.firestore.FieldValue;

const COL = { state: "state", teams: "teams", uploads: "uploads", chat: "chat", events: "events" };
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
CATEGORIES.forEach(c => c.items.forEach((name, i) => {
  const id = `${c.key}-${i}`; ITEMS[id] = { id, name, cat: c.key, pts: c.pts };
}));
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

/* ---------- sound (no audio files needed) ---------- */
let _actx;
function audioCtx() {
  if (!_actx) _actx = new (window.AudioContext || window.webkitAudioContext)();
  if (_actx.state === "suspended") _actx.resume();
  return _actx;
}
document.addEventListener("pointerdown", () => { try { audioCtx(); } catch {} }, { once: true });
function tone(f, start, dur, type = "sine", vol = .15, glide) {
  const a = audioCtx(), o = a.createOscillator(), g = a.createGain(), t = a.currentTime + start;
  o.type = type; o.frequency.setValueAtTime(f, t); if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .02); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + .05);
}
const SFX = {
  score() { try { [523, 659, 784, 1046].forEach((f, i) => tone(f, i * .08, .35, "triangle")); } catch {} },
  event() { try { tone(110, 0, 1.2, "sawtooth", .08, 55); [880, 660, 880, 660].forEach((f, i) => tone(f, .1 + i * .15, .2, "square", .06)); } catch {} },
  chat() { try { tone(988, 0, .12, "sine", .08); } catch {} },
  end() { try { tone(220, 0, 1.6, "sawtooth", .08, 110); [440, 415, 392, 370, 349].forEach((f, i) => tone(f, .3 + i * .28, .5, "triangle", .12)); } catch {} }
};
