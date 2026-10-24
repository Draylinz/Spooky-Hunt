# Spooky Hunt — setup

## What's in here
| File | What it is |
|---|---|
| `index.html` | Player page: join a team, upload, live scores, chat, event pop-ups, gallery |
| `host-yaa3lt9f.html` | **Your** control page. Keep this link private. |
| `config.js` | **The only file you edit:** Firebase keys, items, points, hashtag, live events |
| `engine.js`, `style.css` | Shared code and styling (no need to touch) |
| `firestore.rules`, `storage.rules` | Security rules to paste into Firebase |

## 1. Firebase: ✅ done
Project **Spooky Hunt** (`spooky-hunt-43fe0`) is on the Blaze plan with a $5 budget alert.
- Firestore: nam5 (US), with rules published.
- Storage: US-EAST1 (the no-cost location), with rules published.
- The keys are already in `config.js`.

## 2. Put it online (GitHub Pages)
1. Create a new repo, e.g. `Spooky-Hunt`. Use **Add file → Upload files** to add every file in this folder.
2. Go to **Settings → Pages → Deploy from branch → main → / (root)** and save.
3. Players: `https://draylinz.github.io/Spooky-Hunt/`
   Host: `https://draylinz.github.io/Spooky-Hunt/host-yaa3lt9f.html`

## 3. Test run
On the host page, choose **2 minutes (test)** and press Start. Join from your phone as a player.
Every scheduled event fires during the 2 minutes, so you'll see the pop-ups. Afterwards, use **Wipe Everything**.

## Live events
- Edit the `EVENTS` list in `config.js`. Each event fires once, at a random moment inside its `window`.
  For example, `[0.4, 0.55]` means somewhere between 40% and 55% of the way through the hunt.
- Event types:
  - `message`: a pop-up.
  - `bonus`: a timed task. Set `firstOnly: true` for a race between teams.
  - `points`: a bonus or penalty for the leader, the last-place team, or all teams.
  - `steal`: moves points from one team to another.
- From the host page you can also:
  - **Fire now** any event early.
  - Send a custom pop-up.
  - Launch an on-the-spot bonus task.
  - Add or remove points for a team, with a reason.
- Events fire from whichever page is open (your host page or any player's phone), and they never fire twice.

## Good to know
- Players are anonymous (no logins), so anyone with the player link can join. Share it only with your group.
- Every event, point change and completed item also appears in the group chat as a live feed.
