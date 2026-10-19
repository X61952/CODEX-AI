const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const { exec } = require("child_process");
const util = require("util");

const execPromise = util.promisify(exec);

// Anchored to the project root (not process.cwd()) — this is used as the
// exec() cwd for git/pnpm commands below and as a directory-traversal
// boundary (see the startsWith(ROOT) check), so it must be the real
// install directory regardless of the process's launch-time cwd.
const ROOT = process.env.CODEX_PROJECT_ROOT || path.join(__dirname, "..", "..");
const VERSION_FILE = path.join(ROOT, ".version");
const VARS_FILE = path.join(ROOT, "database/variables.json");

const SKIP = [
  "node_modules",
  "session",
  "plugins",
  ".git",
  ".env",
  "config.env",
  "database",
  "auth_info_baileys",
];

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

  // Public repository defaults. Private repositories can still provide
  // UPDATE_TOKEN through .setvar, config, or the environment.
const _HC_OWNER = "codexverified";
const _HC_REPO = "CODEX-AI";
const _HC_BRANCH = "main";

function getCfg(bot) {
  const vars = readJson(VARS_FILE);
  const repoFull =
    vars.UPDATE_REPO ||
    bot.config.UPDATE_REPO ||
    process.env.UPDATE_REPO ||
    process.env.GITHUB_REPOSITORY ||
    `${_HC_OWNER}/${_HC_REPO}`;
  const [owner, repo] = repoFull.includes("/")
    ? repoFull.split("/")
    : [
        vars.UPDATE_OWNER ||
          bot.config.UPDATE_OWNER ||
          process.env.UPDATE_OWNER ||
          _HC_OWNER,
        vars.UPDATE_NAME ||
          vars.UPDATE_REPO_NAME ||
          bot.config.UPDATE_NAME ||
          bot.config.UPDATE_REPO_NAME ||
          process.env.UPDATE_NAME ||
          process.env.UPDATE_REPO_NAME ||
          _HC_REPO,
      ];

  return {
    owner,
    repo,
    branch:
      vars.UPDATE_BRANCH ||
      bot.config.UPDATE_BRANCH ||
      process.env.UPDATE_BRANCH ||
      _HC_BRANCH,
    token:
      vars.UPDATE_TOKEN ||
      bot.config.UPDATE_TOKEN ||
      process.env.UPDATE_TOKEN ||
      process.env.GITHUB_TOKEN ||
      "",
  };
}

function assertCfg(cfg) {
  if (!cfg.owner || !cfg.repo) {
    throw new Error(
      "Update repo is not configured. Set UPDATE_REPO=owner/repo or UPDATE_OWNER and UPDATE_NAME.",
    );
  }
}

function ghHeaders(cfg, raw = false) {
  const headers = {
    "User-Agent": "CODEX-AI",
    Accept: raw
      ? "application/vnd.github.raw"
      : "application/vnd.github.v3+json",
  };
  if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;
  return headers;
}

async function reqJson(cfg, url) {
  const res = await axios.get(url, {
    timeout: 30000,
    headers: ghHeaders(cfg),
    validateStatus: () => true,
  });
  if (res.status < 200 || res.status >= 300) {
    const msg = res.data?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return res.data;
}

async function reqBuffer(cfg, url) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 45000,
    headers: ghHeaders(cfg, true),
    validateStatus: () => true,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`download failed: HTTP ${res.status}`);
  }
  return Buffer.from(res.data);
}

function isSkipped(file) {
  const norm = path.normalize(file).replace(/\\/g, "/");
  return SKIP.some((item) => {
    const skip = path.normalize(item).replace(/\\/g, "/");
    return (
      norm === skip ||
      norm.startsWith(skip + "/") ||
      norm.includes("/" + skip + "/")
    );
  });
}

async function currentSha(cfg) {
  try {
    const saved = (await fs.readFile(VERSION_FILE, "utf8")).trim();
    if (saved) return saved;
  } catch {}

  const commits = await reqJson(
    cfg,
    `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/commits?sha=${encodeURIComponent(cfg.branch)}&per_page=2`,
  );
  const sha = commits.length > 1 ? commits[1].sha : commits[0]?.sha;
  if (!sha) throw new Error("Could not detect current update version.");
  await fs.writeFile(VERSION_FILE, sha);
  return sha;
}

async function latestSha(cfg) {
  const latest = await reqJson(
    cfg,
    `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/commits/${encodeURIComponent(cfg.branch)}`,
  );
  return latest;
}

async function checkUpdates(cfg) {
  assertCfg(cfg);
  const curr = await currentSha(cfg);
  const latest = await latestSha(cfg);

  if (curr === latest.sha) {
    return {
      upToDate: true,
      curr: curr.slice(0, 8),
      latest: latest.sha.slice(0, 8),
      msg: latest.commit?.message || "",
    };
  }

  const cmp = await reqJson(
    cfg,
    `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/compare/${curr}...${latest.sha}`,
  );
  return {
    upToDate: false,
    curr: curr.slice(0, 8),
    latest: latest.sha.slice(0, 8),
    commits: (cmp.commits || []).map((c) => ({
      hash: c.sha.slice(0, 8),
      msg: c.commit?.message || "No message",
      date: c.commit?.author?.date
        ? new Date(c.commit.author.date).toLocaleDateString()
        : "",
    })),
    totalCommits: (cmp.commits || []).length,
  };
}

async function applyUpdate(cfg) {
  assertCfg(cfg);
  const curr = await currentSha(cfg);
  const latest = await latestSha(cfg);

  if (curr === latest.sha) {
    return {
      ok: true,
      upToDate: true,
      curr: curr.slice(0, 8),
      latest: latest.sha.slice(0, 8),
      msg: latest.commit?.message || "",
    };
  }

  const cmp = await reqJson(
    cfg,
    `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/compare/${curr}...${latest.sha}`,
  );
  const files = cmp.files || [];
  const commits = (cmp.commits || []).map((c) => ({
    hash: c.sha.slice(0, 8),
    msg: c.commit?.message || "No message",
  }));

  const updated = [];
  const removed = [];
  const skipped = [];
  const failed = [];

  for (const file of files) {
    const name = file.filename;
    if (isSkipped(name)) {
      skipped.push(name);
      continue;
    }

    const fullPath = path.join(ROOT, name);
    if (!fullPath.startsWith(ROOT + path.sep)) {
      failed.push(name);
      continue;
    }

    if (file.status === "removed") {
      try {
        await fs.remove(fullPath);
        removed.push(name);
      } catch {
        failed.push(name);
      }
      continue;
    }

    try {
      const url = `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${latest.sha}/${name}`;
      const content = await reqBuffer(cfg, url);
      await fs.ensureDir(path.dirname(fullPath));
      await fs.writeFile(fullPath, content);
      updated.push(name);
    } catch {
      failed.push(name);
    }
  }

  if (!failed.length) await fs.writeFile(VERSION_FILE, latest.sha);

  const dependencyChanged = [...updated, ...removed].some((f) =>
    /(^|\/)package(-lock)?\.json$/.test(f),
  );
  if (dependencyChanged && !failed.length) {
    await execPromise("npm install", {
      cwd: ROOT,
      timeout: 180000,
      maxBuffer: 1024 * 1024,
    });
  }

  const changed = [...updated, ...removed];
  const commandOnly =
    changed.length > 0 && changed.every((f) => f.startsWith("commands/"));
  const needRestart = changed.some(
    (f) =>
      f === "index.js" ||
      f === "app.js" ||
      f === "package.json" ||
      f === "package-lock.json" ||
      f.startsWith("lib/"),
  );

  return {
    ok: failed.length === 0,
    upToDate: false,
    curr: curr.slice(0, 8),
    latest: latest.sha.slice(0, 8),
    commits,
    updated,
    removed,
    skipped,
    failed,
    commandOnly,
    needRestart,
    total: files.length,
  };
}

function shortList(items, limit = 8) {
  if (!items?.length) return "none";
  const shown = items.slice(0, limit).join("\n");
  const more =
    items.length > limit ? `\n... and ${items.length - limit} more` : "";
  return shown + more;
}

module.exports = {
  // Used by lib/startupUpdate.js (first-deploy auto update / "Bot is up to date").
  _helpers: { getCfg, checkUpdates, applyUpdate, VERSION_FILE },
  name: "update",
  aliases: ["upd", "upgrade"],
  category: "owner",
    reactions: { start: '🔐' },
  description: "Update local files from GitHub API",
  ownerOnly: true,

  async execute(bot, m, args) {
    const sub = (args[0] || "").toLowerCase();
    const cfg = getCfg(bot);

    try {
      if (!sub || sub === "check") {
        await m.reply("Checking for updates...");
        const result = await checkUpdates(cfg);
        if (result.upToDate) {
          return await m.reply(`Bot is up to date.\n\nCurrent: ${result.curr}`);
        }

        const commits = result.commits
          .slice(0, 10)
          .map(
            (c, i) =>
              `${i + 1}. [${c.hash}] ${c.msg}${c.date ? ` (${c.date})` : ""}`,
          )
          .join("\n");
        const more =
          result.totalCommits > 10
            ? `\n... and ${result.totalCommits - 10} more commits`
            : "";

        return await m.reply(
          `Updates available.\n\n` +
            `Current: ${result.curr}\n` +
            `Latest: ${result.latest}\n` +
            `Total: ${result.totalCommits}\n\n` +
            `${commits}${more}\n\n` +
            `Use ${bot.prefix}update now to update.`,
        );
      }

      if (sub === "now") {
        await m.reply("Updating...");
        const result = await applyUpdate(cfg);

        if (result.upToDate) {
          return await m.reply(`Bot is up to date.\n\nCurrent: ${result.curr}`);
        }

        if (!result.ok) {
          return await m.reply(
            `Update failed.\n\n` +
              `Failed files: ${result.failed.length}\n` +
              `${shortList(result.failed)}`,
          );
        }

        const commits =
          result.commits
            .map((c, i) => `${i + 1}. [${c.hash}] ${c.msg}`)
            .join("\n") || "none";

        await m.reply(
          `Update completed.\n\n` +
            `From: ${result.curr}\n` +
            `To: ${result.latest}\n\n` +
            `Applied commits:\n${commits}\n\n` +
            `Updated: ${result.updated.length}\n` +
            `Removed: ${result.removed.length}\n` +
            `Skipped: ${result.skipped.length}`,
        );

        if (result.needRestart) {
          await m.reply("Restarting bot...");
          setTimeout(() => process.exit(0), 1000);
          return;
        }

        if (result.commandOnly && bot.reloader) {
          const reload = await bot.reloader.reload();
          return await m.reply(reload.message);
        }

        return;
      }

      return await m.reply(
        `Usage:\n` +
          `${bot.prefix}update - check updates\n` +
          `${bot.prefix}update now - apply updates\n\n` +
          `Config:\n` +
          `${bot.prefix}setvar UPDATE_REPO=owner/repo\n` +
          `${bot.prefix}setvar UPDATE_BRANCH=master\n` +
          `${bot.prefix}setvar UPDATE_TOKEN=github_token`,
      );
    } catch (e) {
      return await m.reply(`Update failed: ${e.message}`);
    }
  },
};
      
