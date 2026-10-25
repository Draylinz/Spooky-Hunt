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
  unlockSocialAt: 15,       // decorations needed before Social Posts unlock
  maxFileMB: 200,

  // Landing page (shown before the hunt starts)
  // eventStart: when the countdown counts down to (Eastern time, -04:00)
  eventStart: "2026-10-30T18:00:00-04:00",
  whenLabel: "Friday night · exact time TBA",
  tagline: "Something is waiting in the dark. Gather your crew.",
  music: true,              // play the lofi soundtrack on the landing page

  // Live location (players opt in during the hunt; only you see the map)
  location: true,           // ask players to share their location while hunting
  proximityFeet: 2640,      // ding both phones when players from different teams get this close (2640 ft = half a mile; 0 = off)
  proximityStartMinutes: 15 // proximity alerts stay quiet for the first N minutes of the hunt
};

// 3) The list of things to find / do
const CATEGORIES = [
  { key: "decor", title: "🎃 Decorations", pts: 1, items: [
    "A carved jack-o'-lantern that's lit up",
    "A house with only orange lights",
    "A house with purple lights",
    "A giant inflatable ghost",
    "A skeleton (any size)",
    "A 12-foot skeleton",
    "A fake graveyard with tombstones",
    "A witch (bonus if she crashed into a tree)",
    "A black cat decoration",
    "Spider webs covering bushes or a porch",
    "A giant spider",
    "A zombie or hand rising out of the ground",
    "A scarecrow",
    "A \"Keep Out\" or haunted house sign",
    "Bats on a house or tree",
    "A fog machine in action",
    "A projected spooky display on a house",
    "A light-up pumpkin (not a real one)",
    "A coffin",
    "A mummy",
    "A vampire",
    "A grim reaper",
    "A witch's cauldron",
    "Something creepy hanging from a tree",
    "Frankenstein's monster",
    "An inflatable that isn't a ghost or pumpkin",
    "Flickering or strobe lights",
    "A crow or raven",
    "Glowing eyes in a window or bush",
    "A spooky silhouette in a window",
    "A decoration that moves or talks",
    "A pumpkin stack or pumpkin patch display",
    "A \"Happy Halloween\" sign",
    "A house with a full themed display",
    "A decoration that made you laugh"
  ]},
  { key: "challenge", title: "🧟 Challenges", pts: 2, items: [
    "Do the Monster Mash in front of a decorated house",
    "Group photo — everyone doing their scariest face",
    "Do your best evil villain laugh (video)",
    "Pose exactly like the decoration next to you",
    "Say \"Happy Halloween!\" to 3 different people",
    "Name 5 classic movie monsters without help (video)",
    "Film a 10-second \"haunted house tour\" of the spookiest house",
    "Re-enact a horror movie scene (keep it PG!)",
    "Compliment a homeowner on their decorations",
    "Photo of a teammate being \"attacked\" by a decoration",
    "Do the Thriller dance for 10 seconds",
    "Tell a 30-second ghost story on camera",
    "Film a slow-motion jump scare",
    "Photo where everyone is mid-scream"
  ]},
  { key: "social", title: "📱 Social", pts: 3, locked: true, items: [
    "Post a group photo in costume",
    "Post the scariest decoration you found",
    "Post a boomerang of a jump scare",
    "Post a before & after of your team getting spookier",
    "Post a house that deserves an award (Scariest, Most Creative, Funniest)",
    "Post a pic of everyone frozen like zombies",
    "Post a slow-mo video of your team running from something",
    "Post a pic captioned \"If this were my house…\"",
    "Post your best horror-movie-poster shot",
    "Post a video of a teammate's best scream"
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
