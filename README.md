# The 4th Place - Cravings Chase

Snake game for The 4th Place event (3 November 2026, BUP Campus).

## Files (upload ALL of these to the repository root)
- index.html, style.css, game.js - the game
- khaichi-data.js - the "khaichi" sound, embedded (plays when the snake eats; no audio folder needed)
- config.js - your Firebase settings for the shared leaderboard
- firestore.rules - security rules to paste into Firebase (not used by the website itself)

## 1. Set up the shared leaderboard (free, ~5 minutes)
GitHub Pages can't store scores, so a free Firebase database holds them for everyone.
1. Go to https://console.firebase.google.com > Add project (name it anything, turn Analytics off).
2. Build > Firestore Database > Create database > choose any location > Start in **production mode**.
3. Firestore > **Rules** tab > delete everything, paste the contents of `firestore.rules` > Publish.
4. Project settings (gear icon) > General > "Your apps" > click the **</>** (Web) icon > register an app (no hosting).
5. Copy `apiKey` and `projectId` from the config shown, and paste them into `config.js`.
6. Save `config.js` (edit it on GitHub with the pencil icon, or re-upload).

The API key is meant to be public; the rules keep the database safe (only name + number score, max 14-letter names, a score can only go up).

## 2. Publish on GitHub Pages
1. Create a new repository, upload every file above to the root (drag and drop works).
2. Settings > Pages > Source: Deploy from a branch > main > / (root) > Save.
3. After a minute the game is live at https://YOUR-USERNAME.github.io/REPO-NAME/

## Notes
- If config.js is not filled in, the game still works and the leaderboard shows this device only.
- Top 3 refreshes every 20 seconds and after each game. One entry per name (best score kept; names are not case sensitive).
- To reset the leaderboard, delete documents in Firestore > scores.
