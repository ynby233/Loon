/**
 * Auto-Policy
 * 根据当前网络自动切换策略组，主要用于搭配软路由等使用。
 * 由于运行模式的全局直连下，去广告，网易云等分流也会失效，使用此脚本完全解决了此类问题。

 * (不推荐！)手动配置项为config, 请看注释
 */

let config = {
  global_direct: "𝐃𝐢𝐫𝐞𝐜𝐭",
  global_proxy: "𝐏𝐫𝐨𝐱𝐲",
  silence: false, // 是否静默运行，默认false
  cellular: "RULE", // 蜂窝数据下的模式，RULE代表规则模式，PROXY代表全局代理，DIRECT代表全局直连
  wifi: "RULE", // wifi下默认的模式
  all_direct: ["eduroam", "iSwufe", "HFUT-WiFi", "iHeBut", "iHebut"], // 指定全局直连的wifi名字
  all_proxy: [], // 指定全局代理的wifi名字
  whitelist: ["𝐒𝐞𝐥𝐞𝐜𝐭", "𝐈𝐏𝐋𝐂/𝐈𝐄𝐏𝐋", "𝐀𝐝 𝐁𝐥𝐨𝐜𝐤", "𝐒𝐲𝐬𝐭𝐞𝐦 𝐔𝐩𝐝𝐚𝐭𝐞", "🇭🇰𝐇𝐊 𝐅𝐚𝐥𝐥𝐛𝐚𝐜𝐤", "𝐆𝐥𝐨𝐛𝐚𝐥 𝐌𝐚𝐢𝐥 𝐅𝐚𝐥𝐥𝐛𝐚𝐜𝐤", "🇭🇰𝐇𝐊 𝐏𝐂𝐂", "🇹🇼𝐓𝐖 𝐏𝐂𝐂", "🇰🇷𝐊𝐑 𝐏𝐂𝐂", "🇯🇵𝐉𝐏 𝐏𝐂𝐂", "🇸🇬𝐒𝐆 𝐏𝐂𝐂", "🇺🇸𝐔𝐒 𝐏𝐂𝐂", "𝐃𝐢𝐫𝐞𝐜𝐭", "𝐑𝐞𝐣𝐞𝐜𝐭"],
};

const isLoon = typeof $loon !== "undefined";
const isSurge = typeof $httpClient !== "undefined" && !isLoon;

// load user prefs from box
const boxConfig = $persistentStore.read("surge_auto_policy");
if (boxConfig) {
  config = JSON.parse(boxConfig);
  config.silence = JSON.parse(config.silence);
  config.all_direct = listify(config.all_direct);
  config.all_proxy = listify(config.all_proxy);
  config.whitelist = listify(config.whitelist);
}

// get current decisions
let groups, ssid;
if (isSurge) {
  groups = Object.keys($surge.selectGroupDetails().groups);
  ssid = $network.wifi.ssid;
} else if (isLoon) {
  const conf = JSON.parse($config.getConfig());
  groups = conf.all_policy_groups;
  ssid = conf.ssid;
}

manager()
  .catch((err) => {
    notify.post("𝐒𝐒𝐈𝐃 自动策略", `❌ 出现错误`, err);
    console.log("ERROR: " + err);
  })
  .finally(() => {
    $done();
  });

async function manager() {
  // get current outbound mode
  const previousMode =
    $persistentStore.read("surge_auto_policy_mode") || "RULE";

  console.log(`Previous outbound mode: ${previousMode}`);

  // no network connection
  if (isSurge) {
    const v4_ip = $network.v4.primaryAddress;
    if (!config.silence && !v4_ip) {
      notify.post("𝐒𝐒𝐈𝐃 自动策略", "❌ 当前无网络", "");
      return;
    }
  }

  const targetMode = ssid ? getSSIDMode(ssid) : config.cellular;

  console.log(`Switch from mode ${previousMode} to ${targetMode}`);

  if (previousMode === "RULE" && targetMode !== "RULE") {
    // save decisions before executing switch
    saveDecisions();
    // execute policy switch
    for (let group of groups) {
      if (config.whitelist.indexOf(group) !== -1) continue;
      const decision =
        targetMode === "PROXY" ? config.global_proxy : config.global_direct;
      if (isSurge) {
        $surge.setSelectGroupPolicy(group, decision);
      } else if (isLoon) {
        $config.setSelectPolicy(group, decision);
      }
      console.log(`Switch Policy: ${group} ==> ${decision}`);
    }
  }
  if (previousMode !== "RULE" && targetMode === "RULE") {
    // load decisions
    restoreDecisions();
  }

  $persistentStore.write(targetMode, "surge_auto_policy_mode");
  if (!config.silence) {
    notify(
      "𝐒𝐒𝐈𝐃 自动策略",
      `当前网络：${ssid ? ssid : "蜂窝数据"}`,
      `${isSurge ? "Surge" : "Loon"}已切换至${lookupOutbound(targetMode)}`
    );
  }
}

function saveDecisions() {
  // get current policy groups
  let decisions;
  if (isSurge) {
    decisions = $surge.selectGroupDetails().decisions;
  } else if (isLoon) {
    const conf = JSON.parse($config.getConfig());
    decisions = conf.policy_select;
  }
  for (let d of Object.keys(decisions)) {
    if (groups.indexOf(d) === -1) delete decisions[d];
  }
  $persistentStore.write(
    JSON.stringify(decisions),
    "surge_auto_policy_decisions"
  );
}

function restoreDecisions() {
  const decisions = JSON.parse(
    $persistentStore.read("surge_auto_policy_decisions")
  );
  for (let group of groups) {
    if (isSurge) {
      $surge.setSelectGroupPolicy(group, decisions[group]);
    } else if (isLoon) {
      $config.setSelectPolicy(group, decisions[group]);
    }
    console.log(`Restore Policy: ${group} ==> ${decisions[group]}`);
  }
}

function getSSIDMode(ssid) {
  const map = {};
  config.all_direct.map((id) => (map[id] = "DIRECT"));
  config.all_proxy.map((id) => (map[id] = "PROXY"));

  const matched = map[ssid];
  return matched ? matched : config.wifi;
}

function lookupOutbound(mode) {
  return {
    RULE: "𝐑𝐔𝐋𝐄 规则模式",
    PROXY: "𝐏𝐑𝐎𝐗𝐘 全局代理模式",
    DIRECT: "𝐃𝐈𝐑𝐄𝐂𝐓 全局直连模式",
  }[mode];
}

function listify(str, sperator = ",") {
  return str.split(sperator).map((i) => i.trim());
}

function notify(title, subtitle, content) {
  const TIMESTAMP_KEY = "auto_policy_notified_time";
  const THROTTLE_TIME = 1 * 1000;
  const lastNotifiedTime = $persistentStore.read(TIMESTAMP_KEY);
  if (
    !lastNotifiedTime ||
    new Date().getTime() - lastNotifiedTime > THROTTLE_TIME
  ) {
    $persistentStore.write(new Date().getTime().toString(), TIMESTAMP_KEY);
    $notification.post(title, subtitle, content);
  }
}
