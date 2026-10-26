/* ================================================================
   SPOOKY HUNT — SETTINGS (edit this file, not the HTML)
   ================================================================ */

// 1) Firebase project: Spooky Hunt (spooky-hunt-43fe0)
const firebaseConfig = {
  apiKey: "AIzaSyDDg8mNauujtXkulbwBuf2oN6ZE_cFx-YA",
  authDomain: "spooky-hunt-43fe0.firebaseapp.com",
  projectId: "spooky-hunt-43fe0",
  storageBucket: "spooky-hunt-43fe0.firebasestorage.app",
  messagingSenderId: "55440420970",
  appId: "1:55440420970:web:d8c2ab6b508da6e5fe1a13"
};

// 2) General settings
const HUNT = {
  title: "Halloween Scavenger Hunt",
  hashtag: "#SpookyHunt2026",
  defaultMinutes: 60,
  maxFileMB: 200,

  // Landing page (shown before the hunt starts)
  // eventStart: when the countdown counts down to (Eastern time, -04:00)
  eventStart: "2026-10-30T18:00:00-04:00",
  whenLabel: "Friday night · exact time TBA",
  tagline: "Something is waiting in the dark. Gather your crew.",
  music: true,              // play the lofi soundtrack on the landing page
  autoEvents: false,        // true = the EVENTS below fire on their own at random times. Off for now; the host can still send pop-ups and bonuses by hand.

  // Live location (players opt in during the hunt; only you see the map)
  location: true,           // ask players to share their location while hunting
  proximityFeet: 5280,      // ding both phones when players from different teams get this close (5280 ft = 1 mile; 0 = off)
  ghostTag: { steal: 3, seconds: 60, cooldownMinutes: 10 }, // when rivals are in range: first team to tap "HAUNT THEM" steals points (steal: 0 = off)
  proximityTestStartSeconds: 15, // in a short test round (5 minutes or less) alerts start after this many seconds instead
  proximityStartMinutes: 10 // proximity alerts stay quiet for the first N minutes of the hunt
};

// 3) CATEGORIES: each one shows up as a title card in the game.
//    Tap a card and it opens a grid of squares, one per item, each with its own upload.
//    Items: { name, icon, hint, pts }  (pts is optional; it falls back to the category's pts)
//    To add a new category later, copy this block, give it a new key, and list its items.
const CATEGORIES = [
  { key: "haunts", title: "The Haunt List", icon: "🎃", tagline: "Find it. Snap it. Score it.", pts: 1, items: [
    { name: "Pumpkin",                 icon: "🟠", hint: "Any pumpkin, carved or not" },
    { name: "Jack-o'-Lantern",         icon: "🎃", hint: "Carved with a face" },
    { name: "Bat",                     icon: "🦇", hint: "The flying kind, real or decor" },
    { name: "Cobwebs",                 icon: "🕸️", hint: "Draped, stretched or real" },
    { name: "Spider",                  icon: "🕷️", hint: "Eight legs, any size" },
    { name: "Ghost",                   icon: "👻", hint: "Sheet, inflatable or floating" },
    { name: "Tombstone",               icon: "🪦", hint: "Here lies your next point" },
    { name: "Skeleton",                icon: "🦴", hint: "Full set of bones" },
    { name: "Zombie",                  icon: "🧟", hint: "Undead and on display" },
    { name: "Witch",                   icon: "🧙‍♀️", hint: "Hat, cackle, the works" },
    { name: "Vampire",                 icon: "🧛", hint: "Fangs out" },
    { name: "Scarecrow",               icon: "🌾", hint: "Straw-stuffed and staring" },
    { name: "Cauldron",                icon: "🫕", hint: "Bonus if it's bubbling" },
    { name: "Potions",                 icon: "🧪", hint: "Bottles, jars, mystery liquids" },
    { name: "Mummy",                   icon: "🧻", hint: "Wrapped head to toe" },
    { name: "Eyeball",                 icon: "👁️", hint: "Watching you back" },
    { name: "Severed Hand or Fingers", icon: "✋", hint: "Reaching from somewhere" },
    { name: "Brain",                   icon: "🧠", hint: "In a jar or on display" },
    { name: "Werewolf",                icon: "🐺", hint: "Mid-howl preferred" },
    { name: "Coffin",                  icon: "⚰️", hint: "Open or closed casket" },
    { name: "Blood",                   icon: "🩸", hint: "Fake, please" },
    { name: "Candles",                 icon: "🕯️", hint: "Lit, flickering, or melted" },
    { name: "Fog Machine",             icon: "🌫️", hint: "Caught in action" },
    { name: "Spooky Lights or Projector", icon: "📽️", hint: "Light show or projected scene" },
    { name: "Chains",                  icon: "⛓️", hint: "Rattling optional" },
    { name: "Crow",                    icon: "🐦‍⬛", hint: "Or a raven, real or decor" },
    { name: "Skull",                   icon: "💀", hint: "Just the head" },
    { name: "Witch's Broom",           icon: "🧹", hint: "Parked or mid-flight" }
  ]}
];

/* 4) LIVE EVENTS
   Each one fires ONCE at a random moment inside its window.
   window: [start, end] as a fraction of the hunt (0 = start, 1 = end).
   e.g. [0.2, 0.5] = somewhere between 20% and 50% of the way through.
   You can also fire any of these by hand from the host page.

   Types:
   - "message": just a pop-up on every phone
       { type:"message", title, text }
   - "bonus":   a limited-time task appears for everyone
       { type:"bonus", title, text, task, pts, minutes, firstOnly }
       firstOnly:true = only the FIRST team to upload gets the points
   - "points":  add or remove points
       { type:"points", title, text, target:"leader"|"last"|"all", pts }   (pts can be negative)
   - "steal":   move points from one team to another
       { type:"steal", title, text, from:"leader", to:"last", pts }
*/
const EVENTS = [
  { id: "welcome", window: [0.02, 0.05], type: "message",
    title: "👻 The spirits are watching…",
    text: "Stick with your team, stay on the sidewalk, and have fun!" },

  { id: "flash-skeleton", window: [0.15, 0.35], type: "bonus",
    title: "⚡ FLASH BONUS",
    text: "First team to pull this off gets 5 points!",
    task: "Group photo with a skeleton — everyone copying its pose",
    pts: 5, minutes: 5, firstOnly: true },

  { id: "curse", window: [0.40, 0.55], type: "steal",
    title: "🧙 THE WITCH'S CURSE",
    text: "The leading team has been cursed! 3 points go to last place.",
    from: "leader", to: "last", pts: 3 },

  { id: "scream", window: [0.50, 0.70], type: "bonus",
    title: "😱 SCREAM CHALLENGE",
    text: "Every team can earn this one in the next 8 minutes!",
    task: "Video: your whole team doing your loudest scream",
    pts: 3, minutes: 8, firstOnly: false },

  { id: "underdog", window: [0.65, 0.80], type: "points",
    title: "🦇 Underdog Blessing",
    text: "The team in last place gets +4 points. Don't give up!",
    target: "last", pts: 4 },

  { id: "final-stretch", window: [0.85, 0.90], type: "message",
    title: "⏳ Final stretch!",
    text: "Not much time left — start heading back soon!" }
];
