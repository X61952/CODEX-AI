<div align="center">

# ◈ CODEX AI

### **The intelligent security and productivity layer for WhatsApp.**

<img src="https://readme-typing-svg.demolab.com?font=Space+Mono&size=22&pause=1200&color=00FFF0&center=true&vCenter=true&width=900&height=70&repeat=true&lines=SECURE+YOUR+COMMUNITIES.;AUTOMATE+THE+ORDINARY.;BUILD+WITH+INTELLIGENCE.;YOUR+GROUPS%2C+PROTECTED+BY+DESIGN." alt="CODEX AI animated tagline" />

<img src="https://i.imgur.com/dBaSKWF.gif" height="16" width="88%" alt="divider" />

<img src="./assets/rolling-circle.svg" width="90" alt="CODEX AI rolling circle" />

[![Version](https://img.shields.io/badge/version-3.0.0-00FFF0?style=for-the-badge&labelColor=07111F)](https://github.com/CEO-CODEX/CODEX-AI)
[![Developer CODEX](https://img.shields.io/badge/Developer-CODEX-B88CFF?style=for-the-badge&logo=telegram&labelColor=07111F)](https://t.me/codexverified)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-7CFFB2?style=for-the-badge&logo=node.js&logoColor=white&labelColor=07111F)](https://nodejs.org/)
[![Powered by codexverified/baileys](https://img.shields.io/badge/powered%20by-codexverified%2Fbaileys-25D366?style=for-the-badge&logo=whatsapp&logoColor=white&labelColor=07111F)](https://github.com/WhiskeySockets/Baileys)
[![License](https://img.shields.io/badge/license-open%20source-B88CFF?style=for-the-badge&labelColor=07111F)](LICENSE)

</div>

---

## A more intelligent way to run your groups

**CODEX AI** is a multifunctional WhatsApp automation platform built for safer communities, faster workflows, and more capable users. It combines proactive group protection, intelligent automation, developer utilities, and an always-available AI assistant in one extensible system.

Whether you manage a busy community, build digital products, or simply want a smarter everyday assistant, CODEX AI helps you reduce noise, respond faster, and keep your conversations more secure.

> **One platform. Three priorities:** protect your conversations, accelerate your work, and make everyday tasks simpler.

> **Project notice:** CODEX AI was built by **Codex** and is developed and maintained under the **CODEXVERIFIED** organization.

---

## At a glance

Use this quick map to jump directly to any part of the project:

1. [A more intelligent way to run your groups](#a-more-intelligent-way-to-run-your-groups)
2. [Core capabilities](#core-capabilities)
   - [Intelligent group protection](#-intelligent-group-protection)
   - [Smart automation](#-smart-automation)
   - [AI assistant for everyday tasks](#-ai-assistant-for-everyday-tasks)
   - [Developer workspace](#-developer-workspace)
   - [Community operations](#-community-operations)
3. [Why CODEX AI?](#why-codex-ai)
4. [Technology](#technology)
5. [Requirements](#requirements)
6. [Deploy CODEX AI](#deploy-codex-ai)
   - [Deploy on Render](#deploy-on-render)
   - [Deploy on a VPS](#deploy-on-a-vps)
   - [Deploy on Heroku](#deploy-on-heroku)
   - [Deploy on a hosting panel](#deploy-on-a-hosting-panel)
   - [Deploy on Termux](#deploy-on-termux)
7. [Connect your WhatsApp account](#connect-your-whatsapp-account)
8. [Optional developer integrations](#optional-developer-integrations)
9. [Community and support](#community-and-support)
10. [Project disclaimer](#project-disclaimer)

---

## Core capabilities

### 🛡️ Intelligent group protection

CODEX AI is designed to help protect group chats from common digital threats. It can help identify suspicious links, phishing attempts, automated billing messages, spam patterns, and other unwanted activity before they overwhelm your community.

Use configurable moderation tools to reduce message noise, enforce group rules, and give administrators greater visibility over what enters the conversation. Protection behaviour can be adapted to the needs of each group.

### ⚡ Smart automation

Automate routine actions without turning your community into a complicated control panel. CODEX AI can help with welcome messages, group information, moderation responses, reminders, utilities, and other repeatable workflows.

Its plugin-driven architecture makes it possible to extend the bot with new commands and integrations as your needs evolve.

### 🧠 AI assistant for everyday tasks

The built-in AI assistant helps users with daily basics and practical requests. Ask for explanations, summaries, ideas, translations, writing assistance, planning help, or quick answers directly inside WhatsApp.

CODEX AI is built to make useful intelligence available where conversations already happen—without requiring users to switch between multiple tools for every small task.

### 🧰 Developer workspace

CODEX AI also provides a growing collection of tools for developers and technical teams. Use it to support coding workflows, generate or refine ideas, inspect technical information, work with repositories, and automate repetitive project tasks.

The platform is designed for experimentation and extension, so developers can build their own commands, services, and productivity modules on top of the core system.

### 📡 Community operations

Give group owners and administrators a clearer way to manage their spaces. Configure permissions, moderation behaviour, automated notices, administrative utilities, and community-specific commands from a single platform.

The result is a more organised, responsive, and dependable group experience.

---

## Why CODEX AI?

| Capability | What it provides |
|---|---|
| **Security-first automation** | Tools designed to reduce phishing, spam, suspicious links, and automated bill-message noise. |
| **Practical intelligence** | An AI assistant for everyday questions, writing, summaries, planning, and explanations. |
| **Developer-friendly design** | An extensible command and plugin system for technical workflows and custom features. |
| **Community control** | Flexible group-management utilities for owners, moderators, and administrators. |
| **Always available** | Deploy on your preferred host and keep your assistant available around the clock. |
| **Built to evolve** | A modular foundation that can grow with new tools, integrations, and use cases. |

---

## Technology

CODEX AI runs on **Node.js** and a hardened Baileys fork, with a modular command engine and plugin-oriented architecture. It operates through a WhatsApp account and can be hosted on a VPS, hosting panel, cloud service, or compatible mobile environment.

> CODEX AI is a self-hosted automation project. Review your hosting provider's terms, WhatsApp's policies, and the permissions granted to every integration before deploying it in a production community.

---

## Requirements

- **Node.js** version 20 or higher
- **npm** and **pnpm**
- **FFmpeg**, bundled through `ffmpeg-static`
- A WhatsApp account for the self-hosted bot
- A VPS or hosting panel for reliable 24/7 availability
- The project-specific `@codexverified/baileys` dependency

---

## Deploy CODEX AI

### Deploy on Render

1. Fork this repository to your GitHub account.
2. In [Render](https://render.com), create a **New → Web Service** and connect your fork.
3. Use the following commands:

   ```text
   Build Command: pnpm install
   Start Command: npm start
   ```

4. Deploy once so Render provides a live service URL.
5. Generate a session ID from the [pairing site](https://codex-ai.site/session) and add it as a private `SESSION_ID` environment variable in Render (avoid committing it in `config.json`), then redeploy. Set the health check path to `/live`.

Render's free tier may sleep after inactivity. For consistent 24/7 availability, use a suitable paid instance or another host that supports persistent services.

### Deploy on a VPS

```bash
# Install prerequisites
sudo apt update && sudo apt install -y nodejs npm git
sudo npm install -g pnpm

# Clone the repository
git clone https://github.com/codexverified/CODEX-AI.git codex-ai
cd codex-ai

# Install the locked dependency graph
pnpm install

# Configure your bot
nano config.json

# Keep your WhatsApp session ID out of git: export it privately instead of
# writing it into config.json (the bot reads SESSION_ID first).
export SESSION_ID="<your-session-id>"   # or put it in your server's private environment

# Run persistently with PM2 (single instance named "codex-ai-v3", see ecosystem.config.cjs)
sudo npm install -g pm2
npm run pm2:start        # start
npm run pm2:logs         # view logs (Ctrl+C to leave)
npm run pm2:restart      # restart
npm run pm2:stop         # stop
pm2 save                 # remember the process list
pm2 startup              # prints ONE command — copy and run it so PM2 starts at boot
```

> Run **one** instance only. Never start the bot a second time (another PM2 name,
> a second copy, `node index.js` in a terminal) against the same `session/` folder —
> it corrupts the WhatsApp login. On Render, Heroku or a hosting panel the host
> already supervises the process, so do **not** use PM2 there.

Health endpoints (port `PORT`, default 3000): `/live` returns 200 while the process
is up; `/ready` returns 200 only while WhatsApp is actually connected (503 otherwise).

### Deploy on Heroku

Heroku requires a paid dyno for persistent operation.

```bash
heroku login
heroku create your-codex-ai-app
git push heroku main
heroku ps:scale web=1
```

Set `sessionId` and the required configuration values before deploying. Heroku's filesystem can reset after a dyno restart, so use a deployment-safe configuration strategy for production environments.

### Deploy on a hosting panel

1. Create a Node.js server using Node 20 or later.
2. Upload the project with SFTP or use the panel's Git integration.
3. Set the startup command to `node index.js`.
4. Run `pnpm install` from the console.
5. Configure `sessionId`, owner details, and the bot settings in `config.json`.
6. Start the service and monitor its logs.

### Deploy on Termux

```bash
# Update Termux
pkg update -y && pkg upgrade -y

# Install prerequisites
pkg install -y nodejs-lts git
npm install -g pnpm

# Clone and install
git clone https://github.com/CEO-CODEX/CODEX-AI.git codex-ai
cd codex-ai
pnpm install

# Configure and start
nano config.json
node index.js
```

For longer sessions on Android, use `termux-wake-lock`, disable battery optimisation for Termux, and run the service inside `tmux` when appropriate.

---

## Connect your WhatsApp account

1. Open the [CODEX AI session generator](https://codex-ai.site/session).
2. Choose your preferred connection method:
   - **Pairing link:** enter your WhatsApp number and complete the pairing steps.
   - **QR code:** open WhatsApp on your phone, go to **Linked devices**, choose **Link a device**, and scan the QR code shown by the session generator.
3. Copy the generated session ID.
4. Paste it into the `sessionId` field in `config.json`.
5. Start CODEX AI. The service will restore the session on boot.

Keep session credentials private. Never publish them in a repository, issue, screenshot, or public chat.

---

## Optional developer integrations

The following environment variables enable repository-related commands when configured:

| Variable | Purpose |
|---|---|
| `GITHUB_TOKEN` | GitHub personal access token for authorised repository operations. |
| `GITHUB_USERNAME` | GitHub username used for repository lookups. |

Store secrets in your host's environment or a protected configuration file. Never commit credentials to source control.

---

## Project disclaimer

CODEX AI was built by **Codex** and is officially developed under the **CODEXVERIFIED** organization. The project may include community contributions, third-party libraries, and optional integrations that are maintained independently.

CODEX AI is provided as an extensible open-source automation project. Its security and moderation tools are designed to help identify and reduce phishing, spam, suspicious links, and automated messages, but no automated system can guarantee that every malicious or unwanted message will be detected. Always review permissions, protect session credentials, follow WhatsApp's policies, and configure the project responsibly for your community.

---

## Community and support

<div align="center">

[![Main WhatsApp Channel](https://img.shields.io/badge/WhatsApp%20Channel-Follow-25D366?style=for-the-badge&logo=whatsapp)](https://whatsapp.com/channel/0029Vb78BHmL2AU7fsANSH2y)
[![Backup WhatsApp Channel](https://img.shields.io/badge/Backup%20Channel-Follow-25D366?style=for-the-badge&logo=whatsapp)](https://whatsapp.com/channel/0029Vb6sMEy96H4VI2w3I50F)
[![Support Group](https://img.shields.io/badge/Support%20Group-Join-25D366?style=for-the-badge&logo=whatsapp)](https://chat.whatsapp.com/D4h54lfB8neBvOzXMW19Tm?s=cl&p=a&mlu=4&ilr=4)
[![Telegram Channel](https://img.shields.io/badge/Telegram%20Channel-Join-26A5E4?style=for-the-badge&logo=telegram)](https://t.me/CODEX_AIV3)
[![Telegram Group](https://img.shields.io/badge/Telegram%20Group-Join-26A5E4?style=for-the-badge&logo=telegram)](https://t.me/CODEXV3)
[![Developer](https://img.shields.io/badge/Developer-Contact-B88CFF?style=for-the-badge&logo=telegram)](https://t.me/codexverified)
[![Website](https://img.shields.io/badge/Website-Visit-00FFF0?style=for-the-badge&logo=vercel&logoColor=black)](https://codex-ai-site)
[![Pairing Site](https://img.shields.io/badge/Get%20Session%20ID-Pair%20Now-FF7A59?style=for-the-badge&logo=whatsapp)](https://codex-ai.site/session)

</div>

---

<div align="center">

### **Protect the conversation. Accelerate the work. Empower every user.**

<sub>CODEX AI — intelligent automation for modern WhatsApp communities.</sub>

<br>

<sub>Thanks for visiting my repository.</sub>

<img src="https://i.imgur.com/dBaSKWF.gif" height="16" width="88%" alt="animated coloured footer line" />

<br><br>

<img src="https://capsule-render.vercel.app/api?type=waving&color=00FFF0&height=100&section=footer" alt="CODEX AI footer" />

</div>
