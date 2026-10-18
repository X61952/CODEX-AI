# Deploying CODEX AI V3 from scratch

Rules for EVERY host: run exactly **one** copy of the bot, use **Node 22+**, keep
`session/` (WhatsApp login) and `database/` on storage that survives restarts,
and never commit your session ID — set it as the private `SESSION_ID` variable.
Check it's healthy: `/live` = process is up, `/ready` = WhatsApp is connected.

## 1) Linux VPS (recommended — PM2 supervises it)
```bash
sudo apt update && sudo apt install -y git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
sudo npm install -g pnpm pm2
git clone <your-repo-url> codex-ai && cd codex-ai
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium
nano config.json                      # set owner number, prefix, etc.
export SESSION_ID="<your-session-id>" # or add it to the server's private environment
npm run pm2:start
pm2 save && pm2 startup               # run the ONE command it prints, so it starts on reboot
npm run pm2:logs
```
Restart `npm run pm2:restart` · Stop `npm run pm2:stop`.
Do not also run `node index.js` by hand.

## 2) Render (paid instance + disk)
Free plans sleep and have no disk, so a free Render service cannot stay up.
Create a **Blueprint** from this repo (it reads `render.yaml`), then in the dashboard
set `SESSION_ID`. Do **not** use PM2 on Render. Render restarts the service itself.
The Blueprint build installs Playwright's Chromium browser and its Linux
system dependencies for the `.screenshot` and `.screenrecord` commands.

## 3) Pterodactyl / bot panel
Use a Node.js **22** egg. Startup command: `npm start`. Upload the project, install
dependencies with `pnpm install`, set `SESSION_ID` in the panel's variables, then
Start. On startup, the bot checks for Playwright Chromium and downloads it if
missing; the first boot may take several minutes and needs outbound network access.
The panel restarts the service; do **not** use PM2. Keep one server per session.
If Chromium reports missing Linux shared libraries, ask the host to add Playwright's
system dependencies to the Node.js egg/container image.

On Windows development machines, install the browser with
`pnpm exec playwright install chromium`.

## 4) Heroku / Docker / others
Heroku's filesystem resets at least daily, so the login and database would be wiped:
not recommended. For Docker, mount volumes for `/app/session` and `/app/database`,
use a Node 22 image, set `SESSION_ID`, and run a single container with a restart policy.
(These two are guidance only; no files are provided or tested.)
