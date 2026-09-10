require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

/* =========================================================
   AXERA LEAGUE
   FOOTBALL RP DISCORD BOT
   ========================================================= */

/* -------------------- AYARLAR -------------------- */

const PREFIX = ".";

const IDS = {
  roles: {
    admin: "1534455282426445897",
    registration: "1534456315366342716",
    value: "1534456192913375382",
    unregistered: "1534457560134844517",
    player: "1534457228986421278",
    td: "1534456648930693120",
    member: "1534457460163608636",
    moderator: "1534456108415189063",
    commentator: "1535251168169697390"
  },

  channels: {
    registration: "1547371464515133470",
    chat: "1547374641763455009",
    training: "1547375589923618957",
    penalty: "1547375997698052166",
    tweet: "1547377797193011340",
    match: "1547376935410073692",
    standings: "1547382143775285431",
    value: "1547376344927834122",
    botStatus: "1547388197796057118",
    ai: "1547375186754408539"
  },

  pingRoles: {
    media: "1547393966553440346",
    partner: "1547393545827123230",
    match: "1547393416755941509",
    announcement: "1547393331297001522",
    giveaway: "1545116885589430312"
  }
};

const FORMATIONS = [
  "4-4-2",
  "4-3-3",
  "4-2-3-1",
  "3-5-2",
  "3-4-3",
  "4-3-1-2",
  "4-2-2-2",
  "5-3-2"
];

const COMMAND_COUNT = 45;

const AI_MODEL = "gpt-5.6-luna";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/* -------------------- CLIENT -------------------- */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

/* =========================================================
   DATA
   ========================================================= */

const DATA_FILE = path.join(__dirname, "data.json");

const defaultData = {
  users: {},
  teams: {},
  standings: {},
  fixtures: [],
  nextFixtureId: 1,
  activeMatches: {},
  registrationPanels: {},
  tickets: {},
  cups: {},
  formations: {},
  training: {},
  tweetCooldowns: {},
  matchRewards: {},
  playerMatchHistory: {},
  penalties: {},
  stats: {},
  matchHistory: [],
  aiMemory: {}
};

let data = loadData();

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
      return JSON.parse(JSON.stringify(defaultData));
    }

    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

    return {
      ...JSON.parse(JSON.stringify(defaultData)),
      ...parsed
    };
  } catch (error) {
    console.error("data.json okunamadı:", error);

    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
    } catch {}

    return JSON.parse(JSON.stringify(defaultData));
  }
}

let saveTimer = null;

function saveData() {
  clearTimeout(saveTimer);

  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error("data.json kaydetme hatası:", error);
    }
  }, 250);
}

/* =========================================================
   GENEL YARDIMCILAR
   ========================================================= */

function isAdmin(member) {
  return Boolean(
    member &&
    (
      member.permissions?.has(PermissionsBitField.Flags.Administrator) ||
      member.roles?.cache?.has(IDS.roles.admin)
    )
  );
}

function hasRole(member, roleId) {
  return Boolean(member?.roles?.cache?.has(roleId));
}

function isRegistrationStaff(member) {
  return isAdmin(member) || hasRole(member, IDS.roles.registration);
}

function isValueStaff(member) {
  return isAdmin(member) || hasRole(member, IDS.roles.value);
}

function isCommentator(member) {
  return (
    isAdmin(member) ||
    hasRole(member, IDS.roles.commentator)
  );
}

function isModerator(member) {
  return (
    isAdmin(member) ||
    hasRole(member, IDS.roles.moderator)
  );
}

function isMentioned(message) {
  return message.mentions.users.first() || null;
}

function cleanText(text) {
  return String(text || "").trim();
}

function normalize(text) {
  return String(text || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatMoney(m) {
  const n = Number(m) || 0;
  return `${n}M€`;
}

function ensureUser(userId) {
  if (!data.users[userId]) {
    data.users[userId] = {
      value: 0,
      registered: false,
      training: 0,
      goals: 0,
      assists: 0,
      matches: 0
    };
  }

  return data.users[userId];
}

function ensureTeam(roleId, name = "Takım") {
  if (!data.teams[roleId]) {
    data.teams[roleId] = {
      name,
      value: 0,
      players: [],
      cups: [],
      points: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      wins: 0,
      draws: 0,
      losses: 0
    };
  }

  return data.teams[roleId];
}

function ensureStats(userId) {
  if (!data.stats[userId]) {
    data.stats[userId] = {
      goals: 0,
      assists: 0,
      matches: 0
    };
  }

  return data.stats[userId];
}

function getValue(userId) {
  return Number(ensureUser(userId).value || 0);
}

function setValue(userId, value) {
  const user = ensureUser(userId);
  user.value = Math.max(0, Math.min(1000, Number(value) || 0));
  saveData();
}

function addValue(userId, amount) {
  setValue(userId, getValue(userId) + Number(amount || 0));
}

function removeValue(userId, amount) {
  setValue(userId, getValue(userId) - Number(amount || 0));
}

function getDisplayValue(member) {
  const user = ensureUser(member.id);

  if (user.value > 0) {
    return formatMoney(user.value);
  }

  const nick = member.displayName || member.user.username;
  const match = nick.match(/(\d+(?:\.\d+)?)M€\s*$/i);

  return match ? `${match[1]}M€` : "0M€";
}

function getTrailingValue(member) {
  const nick = member.displayName || member.user.username;

  const match = nick.match(/(\d+(?:\.\d+)?)M€\s*$/i);

  if (!match) return null;

  return Number(match[1]);
}

function parseMoney(input) {
  const raw = String(input || "")
    .trim()
    .toUpperCase()
    .replace(/€/g, "")
    .replace(/M/g, "");

  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;

  const value = Number(raw);

  if (!Number.isFinite(value) || value <= 0) return null;

  return value;
}

function getPositionFromNickname(member) {
  const nick = member.displayName || "";

  const parts = nick.split("|").map(x => x.trim());

  if (parts.length >= 3) {
    return parts[2];
  }

  return "OY";
}

function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function splitMessage(text, max = 1900) {
  const chunks = [];

  let current = "";

  for (const line of String(text).split("\n")) {
    if ((current + "\n" + line).length > max) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current += current ? "\n" + line : line;
    }
  }

  if (current) chunks.push(current);

  return chunks.length ? chunks : [" "];
}

async function safeReply(message, content, options = {}) {
  try {
    return await message.reply({
      content,
      ...options
    });
  } catch (error) {
    console.error("Reply hatası:", error);
    return null;
  }
}

async function safeSend(channel, payload) {
  try {
    if (!channel?.isTextBased?.()) return null;
    return await channel.send(payload);
  } catch (error) {
    console.error("Mesaj gönderme hatası:", error);
    return null;
  }
}

async function safeDelete(message) {
  try {
    if (message?.deletable) {
      await message.delete();
    }
  } catch {}
}

/* =========================================================
   KANAL KONTROLÜ
   ========================================================= */

function onlyChannel(message, channelId) {
  if (message.channel.id !== channelId) {
    safeReply(
      message,
      `❌ Bu komut <#${channelId}> kanalında kullanılmalıdır.`
    );
    return false;
  }

  return true;
}

/* =========================================================
   KAYIT SİSTEMİ
   ========================================================= */

async function createRegistrationPanel(channel) {
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle("📝 Axera League Kayıt")
    .setDescription(
      [
        "Sunucuya kayıt olmak için aşağıdaki seçeneklerden birini seçin.",
        "",
        "⚽ **Futbolcu**",
        "👤 **Üye**",
        "🧑‍💼 **Teknik Direktör**",
        "🧤 **Kaleci**",
        "",
        "Kayıt işlemini yalnızca **Kayıt Yetkilileri** gerçekleştirebilir."
      ].join("\n")
    )
    .setFooter({
      text: "Axera League • Kayıt Sistemi"
    })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("register_player")
      .setLabel("Futbolcu")
      .setEmoji("⚽")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("register_member")
      .setLabel("Üye")
      .setEmoji("👤")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("register_td")
      .setLabel("Teknik Direktör")
      .setEmoji("🧑‍💼")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("register_gk")
      .setLabel("Kaleci")
      .setEmoji("🧤")
      .setStyle(ButtonStyle.Primary)
  );

  return safeSend(channel, {
    embeds: [embed],
    components: [row]
  });
}

async function registerUser(targetMember, type, nickname, actor) {
  const guild = targetMember.guild;

  const rolesToRemove = [
    IDS.roles.unregistered,
    IDS.roles.player,
    IDS.roles.member,
    IDS.roles.td
  ];

  for (const roleId of rolesToRemove) {
    if (targetMember.roles.cache.has(roleId)) {
      try {
        await targetMember.roles.remove(roleId);
      } catch {}
    }
  }

  let roleId = IDS.roles.player;
  let roleName = "Futbolcu";

  if (type === "member") {
    roleId = IDS.roles.member;
    roleName = "Üye";
  }

  if (type === "td") {
    roleId = IDS.roles.td;
    roleName = "Teknik Direktör";
  }

  if (type === "gk") {
    roleId = IDS.roles.player;
    roleName = "Kaleci";
  }

  try {
    await targetMember.roles.add(roleId);
  } catch (error) {
    console.error("Kayıt rolü verilemedi:", error);
  }

  if (nickname) {
    try {
      await targetMember.setNickname(
        nickname.substring(0, 32)
      );
    } catch {}
  }

  const user = ensureUser(targetMember.id);
  user.registered = true;

  saveData();

  return roleName;
}

/* =========================================================
   .K KOMUTU
   ========================================================= */

async function handleRegisterCommand(message, args) {
  if (!onlyChannel(message, IDS.channels.registration)) return;

  if (!isRegistrationStaff(message.member)) {
    return safeReply(
      message,
      "❌ Bu paneli yalnızca **Kayıt Yetkilisi** veya **Yönetici** kullanabilir."
    );
  }

  const target = message.mentions.members.first();

  if (!target) {
    return safeReply(
      message,
      "❌ Kullanım: `.k @Oyuncu İsim`"
    );
  }

  const nickname = args
    .filter(arg => !/^<@!?\d+>$/.test(arg))
    .join(" ")
    .trim();

  if (!nickname) {
    return safeReply(
      message,
      "❌ Kayıt isminden sonra bir isim yazmalısın.\nÖrnek: `.k @Oyuncu W. Sneijder | 🇵🇹 | SNT | 1M€`"
    );
  }

  const embed = new EmbedBuilder()
    .setTitle("📝 Kayıt İşlemi")
    .setDescription(
      `${target} için kayıt türünü seçin.\n\n` +
      `**Kayıt Yetkilisi:** ${message.author}\n` +
      `**İsim:** \`${nickname}\``
    )
    .setColor(0x2b2d31)
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`regtype_player_${target.id}`)
      .setLabel("Futbolcu")
      .setEmoji("⚽")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`regtype_member_${target.id}`)
      .setLabel("Üye")
      .setEmoji("👤")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`regtype_td_${target.id}`)
      .setLabel("Teknik Direktör")
      .setEmoji("🧑‍💼")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`regtype_gk_${target.id}`)
      .setLabel("Kaleci")
      .setEmoji("🧤")
      .setStyle(ButtonStyle.Primary)
  );

  const panel = await safeSend(message.channel, {
    embeds: [embed],
    components: [row]
  });

  if (panel) {
    data.registrationPanels[panel.id] = {
      targetId: target.id,
      nickname,
      staffId: message.author.id
    };

    saveData();
  }
}

/* =========================================================
   .KAYITSIZVER
   ========================================================= */

async function handleUnregister(message, args) {
  if (!isRegistrationStaff(message.member)) {
    return safeReply(message, "❌ Bu komut için Kayıt Yetkilisi olmalısın.");
  }

  const target = message.mentions.members.first();

  if (!target) {
    return safeReply(message, "❌ Kullanım: `.kayıtsızver @Oyuncu`");
  }

  for (const roleId of [
    IDS.roles.player,
    IDS.roles.member,
    IDS.roles.td
  ]) {
    try {
      await target.roles.remove(roleId);
    } catch {}
  }

  try {
    await target.roles.add(IDS.roles.unregistered);
  } catch {}

  ensureUser(target.id).registered = false;
  saveData();

  safeReply(message, `✅ ${target} tekrar **Kayıtsız** yapıldı.`);
}

/* =========================================================
   ARA
   ========================================================= */

async function handleSearch(message, args) {
  const query = normalize(args.join(" "));

  if (!query) {
    return safeReply(message, "❌ Kullanım: `.ara isim`");
  }

  const results = [];

  for (const member of message.guild.members.cache.values()) {
    if (member.user.bot) continue;

    if (member.roles.cache.has(IDS.roles.unregistered)) continue;

    const names = [
      member.displayName,
      member.user.username
    ].map(normalize);

    let score = 0;

    if (names.some(x => x === query)) score = 100;
    else if (names.some(x => x.startsWith(query))) score = 75;
    else if (names.some(x => x.includes(query))) score = 50;

    if (score > 0) {
      results.push({ member, score });
    }
  }

  results.sort((a, b) => b.score - a.score);

  if (!results.length) {
    return safeReply(
      message,
      "❌ Bu isimde veya benzer isimde kayıtlı oyuncu bulunamadı."
    );
  }

  const lines = results.slice(0, 20).map((item, index) => {
    const member = item.member;

    const role = member.roles.cache.has(IDS.roles.td)
      ? "Teknik Direktör"
      : member.roles.cache.has(IDS.roles.player)
        ? "Futbolcu"
        : "Üye";

    return [
      `**${index + 1}. ${member.displayName}**`,
      `> ID: \`${member.id}\``,
      `> Tür: **${role}**`,
      `> Değer: **${getDisplayValue(member)}**`
    ].join("\n");
  });

  safeReply(
    message,
    `🔎 **Arama Sonuçları**\n\n${lines.join("\n\n")}`
  );
}

/* =========================================================
   DEĞER
   ========================================================= */

async function handleValueCommand(message, args, adding = true) {
  if (!onlyChannel(message, IDS.channels.value)) return;

  if (!isValueStaff(message.member)) {
    return safeReply(
      message,
      "❌ Bu komut yalnızca **Değer Yetkilisi** veya **Yönetici** tarafından kullanılabilir."
    );
  }

  const target = message.mentions.members.first();

  if (!target) {
    return safeReply(
      message,
      `❌ Kullanım: \`.${adding ? "dver" : "dsil"} @Oyuncu miktar\``
    );
  }

  const amountArg = args.find(x =>
    /^\d+(?:\.\d+)?M?€?$/i.test(x)
  );

  const amount = parseMoney(amountArg);

  if (!amount) {
    return safeReply(
      message,
      "❌ Geçerli bir M€ miktarı gir.\nÖrnek: `5M`, `5M€`"
    );
  }

  const oldValue = getValue(target.id);

  const newValue = adding
    ? oldValue + amount
    : oldValue - amount;

  if (newValue > 1000) {
    return safeReply(
      message,
      "❌ Oyuncu değeri maksimum **1000M€** olabilir."
    );
  }

  if (newValue < 0) {
    return safeReply(
      message,
      "❌ Oyuncu değeri 0M€ altına düşemez."
    );
  }

  setValue(target.id, newValue);

  const oldNick = target.displayName;

  const valueRegex = /(\d+(?:\.\d+)?)M€\s*$/i;

  let newNick;

  if (valueRegex.test(oldNick)) {
    newNick = oldNick.replace(
      valueRegex,
      `${newValue}M€`
    );
  } else {
    newNick = `${oldNick} | ${newValue}M€`;
  }

  try {
    await target.setNickname(newNick.substring(0, 32));
  } catch {}

  safeReply(
    message,
    `${adding ? "✅ Değer eklendi" : "✅ Değer silindi"}.\n` +
    `${target}\n` +
    `**Eski:** ${formatMoney(oldValue)}\n` +
    `**Yeni:** ${formatMoney(newValue)}`
  );
}

/* =========================================================
   ANTRENMAN
   ========================================================= */

async function handleTraining(message) {
  if (!onlyChannel(message, IDS.channels.training)) return;

  const user = ensureUser(message.author.id);

  user.training = Number(user.training || 0) + 1;

  if (user.training >= 5) {
    user.training = 0;
    addValue(message.author.id, 3);

    saveData();

    return safeReply(
      message,
      "🏋️ **Antrenman tamamlandı!**\n\n" +
      "📈 Antrenman: **5/5 → 0/5**\n" +
      "💰 Ödül: **+3M€**"
    );
  }

  saveData();

  safeReply(
    message,
    `🏋️ Antrenman yapıldı!\n\n` +
    `📊 İlerleme: **${user.training}/5**\n` +
    `💡 5/5 olduğunda **+3M€** kazanırsın.`
  );
}

/* =========================================================
   PENALTI
   ========================================================= */

async function handlePenalty(message) {
  if (!onlyChannel(message, IDS.channels.penalty)) return;

  const roll = Math.random();

  let result;

  if (roll < 0.50) {
    result = "goal";
  } else if (roll < 0.75) {
    result = "post";
  } else {
    result = "save";
  }

  if (result === "goal") {
    addValue(message.author.id, 5);

    ensureStats(message.author.id).goals++;

    return safeReply(
      message,
      "⚽ **GOOOL!**\n\n" +
      "🧤 Axera Kalecisi penaltıyı çıkaramadı.\n" +
      "💰 Ödül: **+5M€**"
    );
  }

  if (result === "post") {
    return safeReply(
      message,
      "🥅 **DİREK!**\n\n" +
      "Top direkten döndü."
    );
  }

  return safeReply(
    message,
    "🧤 **KURTARDI!**\n\n" +
    "Axera Kalecisi penaltıyı kurtardı."
  );
}

/* =========================================================
   TWEET
   ========================================================= */

async function handleTweet(message, args) {
  if (!onlyChannel(message, IDS.channels.tweet)) return;

  const text = args.join(" ").trim();

  if (!text) {
    return safeReply(message, "❌ Kullanım: `.tweet mesaj`");
  }

  const last = Number(data.tweetCooldowns[message.author.id] || 0);
  const now = Date.now();

  if (now - last < 24 * 60 * 60 * 1000) {
    const remaining =
      24 * 60 * 60 * 1000 - (now - last);

    const hours = Math.ceil(
      remaining / (60 * 60 * 1000)
    );

    return safeReply(
      message,
      `⏳ Tweet ödülü için yaklaşık **${hours} saat** beklemelisin.`
    );
  }

  data.tweetCooldowns[message.author.id] = now;

  addValue(message.author.id, 5);

  const embed = new EmbedBuilder()
    .setAuthor({
      name: message.member?.displayName || message.author.username,
      iconURL: message.author.displayAvatarURL()
    })
    .setDescription(text)
    .setFooter({
      text: "Axera League • Tweet"
    })
    .setTimestamp();

  await safeDelete(message);

  await safeSend(message.channel, {
    embeds: [embed]
  });

  saveData();
}

/* =========================================================
   TAKIM SİSTEMİ
   ========================================================= */

async function handleTeamAdd(message) {
  if (!isCommentator(message.member)) {
    return safeReply(message, "❌ Bu komut yalnızca Spiker/Yönetici içindir.");
  }

  const role = message.mentions.roles.first();

  if (!role) {
    return safeReply(
      message,
      "❌ Kullanım: `.takımekle @Takım`"
    );
  }

  if (data.teams[role.id]) {
    return safeReply(message, "❌ Bu takım zaten sistemde bulunuyor.");
  }

  ensureTeam(role.id, role.name);

  data.standings[role.id] = {
    name: role.name,
    points: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    wins: 0,
    draws: 0,
    losses: 0
  };

  saveData();

  safeReply(
    message,
    `✅ **${role.name}** Axera League'e eklendi.`
  );
}

async function handleTeamRemove(message) {
  if (!isCommentator(message.member)) {
    return safeReply(message, "❌ Bu komut yalnızca Spiker/Yönetici içindir.");
  }

  const role = message.mentions.roles.first();

  if (!role) {
    return safeReply(
      message,
      "❌ Kullanım: `.takımkaldır @Takım`"
    );
  }

  const active = Object.values(data.activeMatches)
    .some(match =>
      match.team1 === role.id ||
      match.team2 === role.id
    );

  if (active) {
    return safeReply(
      message,
      "❌ Bu takımın aktif maçı varken takım kaldırılamaz."
    );
  }

  delete data.teams[role.id];
  delete data.standings[role.id];
  delete data.formations[role.id];
  delete data.cups[role.id];

  data.fixtures = data.fixtures.filter(
    fixture =>
      fixture.team1 !== role.id &&
      fixture.team2 !== role.id
  );

  saveData();

  safeReply(
    message,
    `✅ **${role.name}** sistemden kaldırıldı.`
  );
}

async function handleTeamValue(message, args) {
  if (!isCommentator(message.member)) {
    return safeReply(message, "❌ Bu komut Spiker/Yönetici içindir.");
  }

  const role = message.mentions.roles.first();

  if (!role) {
    return safeReply(
      message,
      "❌ Kullanım: `.takımdeğer @Takım 850M`"
    );
  }

  const amountArg = args.find(x =>
    /^\d+(?:\.\d+)?M?€?$/i.test(x)
  );

  const amount = parseMoney(amountArg);

  if (!amount || amount > 1000) {
    return safeReply(
      message,
      "❌ Takım değeri 1-1000M€ arasında olmalıdır."
    );
  }

  const team = ensureTeam(role.id, role.name);
  team.value = amount;

  saveData();

  safeReply(
    message,
    `✅ **${role.name}** takım değeri **${formatMoney(amount)}** olarak ayarlandı.`
  );
}

/* =========================================================
   KADRO
   ========================================================= */

async function handleSquadAdd(message, args) {
  if (!isCommentator(message.member)) {
    return safeReply(message, "❌ Bu komut Spiker/Yönetici içindir.");
  }

  const teamRole = message.mentions.roles.first();
  const player = message.mentions.members.first();

  if (!teamRole || !player) {
    return safeReply(
      message,
      "❌ Kullanım: `.kadroekle @Takım @Oyuncu Pozisyon`"
    );
  }

  const position = args
    .filter(x => !/^<@&\d+>$/.test(x))
    .filter(x => !/^<@!?\d+>$/.test(x))
    .join(" ")
    .trim();

  if (!position) {
    return safeReply(
      message,
      "❌ Pozisyon belirtmelisin."
    );
  }

  const team = ensureTeam(teamRole.id, teamRole.name);

  team.players = team.players.filter(
    p => p.userId !== player.id
  );

  team.players.push({
    userId: player.id,
    position
  });

  saveData();

  safeReply(
    message,
    `✅ ${player} **${teamRole.name}** kadrosuna **${position}** olarak eklendi.`
  );
}

async function handleSquadRemove(message) {
  if (!isCommentator(message.member)) {
    return safeReply(message, "❌ Bu komut Spiker/Yönetici içindir.");
  }

  const teamRole = message.mentions.roles.first();
  const player = message.mentions.members.first();

  if (!teamRole || !player) {
    return safeReply(
      message,
      "❌ Kullanım: `.kadrocikar @Takım @Oyuncu`"
    );
  }

  const team = ensureTeam(teamRole.id, teamRole.name);

  team.players = team.players.filter(
    p => p.userId !== player.id
  );

  saveData();

  safeReply(
    message,
    `✅ ${player} **${teamRole.name}** kadrosundan çıkarıldı.`
  );
}

async function handleSquad(message) {
  const teamRole = message.mentions.roles.first();

  if (!teamRole) {
    return safeReply(
      message,
      "❌ Kullanım: `.kadro @Takım`"
    );
  }

  const team = ensureTeam(teamRole.id, teamRole.name);

  if (!team.players.length) {
    return safeReply(
      message,
      `📋 **${teamRole.name}** kadrosunda kayıtlı oyuncu bulunmuyor.`
    );
  }

  const groups = {};

  for (const player of team.players) {
    if (!groups[player.position]) {
      groups[player.position] = [];
    }

    groups[player.position].push(player);
  }

  const lines = [];

  for (const [position, players] of Object.entries(groups)) {
    lines.push(`### ${position}`);

    for (const player of players) {
      const member =
        message.guild.members.cache.get(player.userId);

      if (!member) continue;

      lines.push(
        `• ${member.displayName} — **${getDisplayValue(member)}**`
      );
    }
  }

  const total = team.players.reduce((sum, p) => {
    const member =
      message.guild.members.cache.get(p.userId);

    return sum + (member ? getValue(member.id) : 0);
  }, 0);

  safeReply(
    message,
    [
      `## ⚽ ${teamRole.name}`,
      "",
      lines.join("\n"),
      "",
      `👥 Oyuncu: **${team.players.length}**`,
      `💰 Toplam oyuncu değeri: **${formatMoney(total)}**`,
      `🏷️ Takım değeri: **${formatMoney(team.value)}**`
    ].join("\n")
  );
}

/* =========================================================
   FORMASYON
   ========================================================= */

async function handleFormation(message) {
  if (!isCommentator(message.member)) {
    return safeReply(message, "❌ Bu komut Spiker/Yönetici içindir.");
  }

  const teamRole = message.mentions.roles.first();

  if (!teamRole) {
    return safeReply(
      message,
      "❌ Kullanım: `.formasyon @Takım`"
    );
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`formation_${teamRole.id}`)
    .setPlaceholder("Formasyon seç")
    .addOptions(
      FORMATIONS.map(f => ({
        label: f,
        value: f
      }))
    );

  const row = new ActionRowBuilder().addComponents(menu);

  safeReply(message, {
    content: `⚽ **${teamRole.name}** için formasyon seç:`,
    components: [row]
  });
}

/* =========================================================
   PUAN DURUMU
   ========================================================= */

async function handleStandings(message) {
  const teams = Object.entries(data.standings);

  if (!teams.length) {
    return safeReply(
      message,
      "📊 Henüz puan durumu oluşturulmadı."
    );
  }

  teams.sort((a, b) => {
    const A = a[1];
    const B = b[1];

    const gdA = A.goalsFor - A.goalsAgainst;
    const gdB = B.goalsFor - B.goalsAgainst;

    return (
      B.points - A.points ||
      gdB - gdA ||
      B.goalsFor - A.goalsFor
    );
  });

  const lines = teams.map(([id, team], index) => {
    const gd =
      team.goalsFor - team.goalsAgainst;

    return (
      `**${index + 1}. ${team.name}** — ` +
      `**${team.points} P** | ` +
      `${team.wins}G ${team.draws}B ${team.losses}M | ` +
      `AV ${gd >= 0 ? "+" : ""}${gd}`
    );
  });

  safeReply(
    message,
    `## 🏆 Axera League Puan Durumu\n\n${lines.join("\n")}`
  );
}

async function handleAddPoints(message, args) {
  if (!isCommentator(message.member)) {
    return safeReply(message, "❌ Bu komut Spiker/Yönetici içindir.");
  }

  const role = message.mentions.roles.first();
  const amount = Number(args.find(x => /^\d+$/.test(x)));

  if (!role || !Number.isInteger(amount)) {
    return safeReply(
      message,
      "❌ Kullanım: `.puanekle @Takım miktar`"
    );
  }

  const standing = data.standings[role.id];

  if (!standing) {
    return safeReply(message, "❌ Bu takım puan sisteminde yok.");
  }

  standing.points += amount;

  saveData();

  safeReply(
    message,
    `✅ **${role.name}** takımına **${amount} puan** eklendi.`
  );
}

/* =========================================================
   KUPA / MÜZE
   ========================================================= */

async function handleCupAdd(message, args) {
  if (!isCommentator(message.member)) {
    return safeReply(message, "❌ Bu komut Spiker/Yönetici içindir.");
  }

  const role = message.mentions.roles.first();

  if (!role) {
    return safeReply(
      message,
      "❌ Kullanım: `.kupaekle @Takım Kupa Adı`"
    );
  }

  const name = args
    .filter(x => !/^<@&\d+>$/.test(x))
    .join(" ")
    .trim();

  if (!name) {
    return safeReply(message, "❌ Kupa adı yazmalısın.");
  }

  if (!data.cups[role.id]) {
    data.cups[role.id] = [];
  }

  data.cups[role.id].push(name);

  saveData();

  safeReply(
    message,
    `🏆 **${name}** kupası **${role.name}** müzesine eklendi.`
  );
}

async function handleCupRemove(message, args) {
  if (!isCommentator(message.member)) {
    return safeReply(message, "❌ Bu komut Spiker/Yönetici içindir.");
  }

  const role = message.mentions.roles.first();

  if (!role) {
    return safeReply(
      message,
      "❌ Kullanım: `.kupasil @Takım Kupa Adı`"
    );
  }

  const name = args
    .filter(x => !/^<@&\d+>$/.test(x))
    .join(" ")
    .trim();

  if (!data.cups[role.id]) {
    return safeReply(message, "❌ Bu takımın kupası bulunmuyor.");
  }

  data.cups[role.id] =
    data.cups[role.id].filter(
      cup => normalize(cup) !== normalize(name)
    );

  saveData();

  safeReply(
    message,
    `✅ **${name}** kupa listesinden silindi.`
  );
}

async function handleMuseum(message) {
  const role = message.mentions.roles.first();

  if (!role) {
    return safeReply(
      message,
      "❌ Kullanım: `.müze @Takım`"
    );
  }

  const cups = data.cups[role.id] || [];

  if (!cups.length) {
    return safeReply(
      message,
      `🏛️ **${role.name} Müzesi**\n\nHenüz kazanılmış kupa bulunmuyor.`
    );
  }

  safeReply(
    message,
    `🏛️ **${role.name} Müzesi**\n\n` +
    cups.map((cup, i) => `${i + 1}. 🏆 ${cup}`).join("\n")
  );
}

/* =========================================================
   FİKSTÜR
   ========================================================= */

function parseFixtureDate(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^\d{2}:\d{2}$/.test(time)) return null;

  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);

  const result = new Date(y, m - 1, d, h, min, 0);

  if (Number.isNaN(result.getTime())) return null;

  return result;
}

async function handleFixtureAdd(message, args) {
  if (!isCommentator(message.member)) {
    return safeReply(message, "❌ Bu komut Spiker/Yönetici içindir.");
  }

  const roles = message.mentions.roles;

  if (roles.size < 2) {
    return safeReply(
      message,
      "❌ Kullanım: `.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`"
    );
  }

  const teamRoles = [...roles.values()];

  const dateArg = args.find(x =>
    /^\d{4}-\d{2}-\d{2}$/.test(x)
  );

  const timeArg = args.find(x =>
    /^\d{2}:\d{2}$/.test(x)
  );

  const date = parseFixtureDate(
    dateArg,
    timeArg
  );

  if (!date) {
    return safeReply(
      message,
      "❌ Tarih formatı: `YYYY-MM-DD HH:MM`"
    );
  }

  const fixture = {
    id: data.nextFixtureId++,
    team1: teamRoles[0].id,
    team2: teamRoles[1].id,
    timestamp: date.getTime(),
    started: false
  };

  data.fixtures.push(fixture);

  saveData();

  safeReply(
    message,
    `✅ Fikstür eklendi:\n\n` +
    `⚽ **${teamRoles[0].name}** vs **${teamRoles[1].name}**\n` +
    `🕐 ${date.toLocaleString("tr-TR")}`
  );
}

async function handleFixtures(message) {
  const upcoming = data.fixtures
    .filter(f => !f.started)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(0, 20);

  if (!upcoming.length) {
    return safeReply(
      message,
      "📅 Bekleyen fikstür bulunmuyor."
    );
  }

  const lines = upcoming.map(f => {
    const t1 = message.guild.roles.cache.get(f.team1);
    const t2 = message.guild.roles.cache.get(f.team2);

    return (
      `**#${f.id}** ` +
      `${t1?.name || "Silinen takım"} 🆚 ${t2?.name || "Silinen takım"}\n` +
      `🕐 ${new Date(f.timestamp).toLocaleString("tr-TR")}`
    );
  });

  safeReply(
    message,
    `## 📅 Axera League Fikstür\n\n${lines.join("\n\n")}`
  );
}

async function handleFixtureRemove(message) {
  if (!isCommentator(message.member)) {
    return safeReply(message, "❌ Bu komut Spiker/Yönetici içindir.");
  }

  const roles = [...message.mentions.roles.values()];

  if (roles.length < 2) {
    return safeReply(
      message,
      "❌ Kullanım: `.fiksturcikar @Takım1 @Takım2`"
    );
  }

  const before = data.fixtures.length;

  data.fixtures = data.fixtures.filter(
    f =>
      !(
        (f.team1 === roles[0].id &&
          f.team2 === roles[1].id) ||
        (f.team1 === roles[1].id &&
          f.team2 === roles[0].id)
      )
  );

  saveData();

  safeReply(
    message,
    before === data.fixtures.length
      ? "❌ Bu iki takım arasında fikstür bulunamadı."
      : "✅ Fikstür silindi."
  );
}

/* =========================================================
   MAÇ MOTORU
   ========================================================= */

function getTeamPlayers(guild, teamRoleId) {
  const players = [];

  const role = guild.roles.cache.get(teamRoleId);

  if (!role) return players;

  for (const member of role.members.values()) {
    if (member.user.bot) continue;

    players.push({
      userId: member.id,
      member,
      position: getPositionFromNickname(member),
      value: getValue(member.id)
    });
  }

  const team = data.teams[teamRoleId];

  if (team?.players) {
    for (const stored of team.players) {
      if (
        !players.some(
          p => p.userId === stored.userId
        )
      ) {
        const member =
          guild.members.cache.get(stored.userId);

        if (member) {
          players.push({
            userId: member.id,
            member,
            position: stored.position,
            value: getValue(member.id)
          });
        }
      }
    }
  }

  return players;
}

function pickScorer(players) {
  if (!players.length) return null;

  return randomItem(players);
}

function pickAssist(players, scorer) {
  if (!players.length) return null;

  const possible = players.filter(
    p => p.userId !== scorer?.userId
  );

  return randomItem(
    possible.length ? possible : players
  );
}

function matchCommentary(team1, team2, scorer = null) {
  const t1 = team1.name;
  const t2 = team2.name;

  const generic = [
    `⚽ ${t1} topu rakip yarı alana taşıyor.`,
    `🎯 ${t2} savunması pozisyonunu koruyor.`,
    `🔥 Orta sahada sert bir mücadele var.`,
    `🏃 Hızlı bir kanat atağı gelişiyor.`,
    `🧤 Kaleci topu kontrol etti.`,
    `📣 Tribünlerden büyük destek geliyor.`,
    `🎯 Ceza sahasına tehlikeli bir orta gönderildi.`,
    `🛡️ Savunma son anda araya girdi.`,
    `⚡ Kontra atak fırsatı oluştu.`,
    `👟 Orta sahada başarılı bir paslaşma var.`,
    `🚨 Tehlikeli bir şut geldi.`,
    `🧤 Kaleci başarılı bir kurtarış yaptı.`
  ];

  if (scorer) {
    return `⚽ **GOOOL!** ${scorer.member.displayName} fileleri havalandırdı!`;
  }

  return randomItem(generic);
}

async function startMatch(guild, team1RoleId, team2RoleId) {
  const role1 = guild.roles.cache.get(team1RoleId);
  const role2 = guild.roles.cache.get(team2RoleId);

  if (!role1 || !role2) return;

  const players1 = getTeamPlayers(guild, team1RoleId);
  const players2 = getTeamPlayers(guild, team2RoleId);

  const team1 = {
    id: team1RoleId,
    name: role1.name,
    players: players1,
    goals: 0
  };

  const team2 = {
    id: team2RoleId,
    name: role2.name,
    players: players2,
    goals: 0
  };

  const channel =
    guild.channels.cache.get(IDS.channels.match);

  if (!channel) return;

  const matchId =
    `${team1RoleId}_${team2RoleId}_${Date.now()}`;

  const match = {
    id: matchId,
    team1: team1RoleId,
    team2: team2RoleId,
    minute: 0,
    team1Goals: 0,
    team2Goals: 0,
    lastCommentary: "Maç başladı!",
    finished: false,
    interval: null,
    messageId: null,
    rewarded: false
  };

  data.activeMatches[matchId] = {
    ...match,
    interval: undefined
  };

  const embed = new EmbedBuilder()
    .setTitle(`⚽ ${team1.name} 🆚 ${team2.name}`)
    .setDescription(
      `⏱️ **0'**\n\n` +
      `**${team1.name}** 0 — 0 **${team2.name}**\n\n` +
      `🎙️ ${team1.name} maça başladı.`
    )
    .setFooter({
      text: "Axera League • Canlı Maç"
    })
    .setTimestamp();

  const sent = await safeSend(channel, {
    embeds: [embed]
  });

  if (!sent) {
    delete data.activeMatches[matchId];
    return;
  }

  match.messageId = sent.id;
  data.activeMatches[matchId].messageId = sent.id;

  saveData();

  let minute = 0;

  const interval = setInterval(async () => {
    try {
      minute++;

      if (!data.activeMatches[matchId]) {
        clearInterval(interval);
        return;
      }

      const chance = Math.random();

      let scorer = null;
      let scoringTeam = null;

      if (chance < 0.055 && players1.length) {
        scorer = pickScorer(players1);
        scoringTeam = 1;
      } else if (
        chance < 0.105 &&
        players2.length
      ) {
        scorer = pickScorer(players2);
        scoringTeam = 2;
      }

      if (scoringTeam === 1) {
        team1.goals++;
        match.team1Goals++;
      }

      if (scoringTeam === 2) {
        team2.goals++;
        match.team2Goals++;
      }

      let commentary;

      if (scorer) {
        commentary = matchCommentary(
          team1,
          team2,
          scorer
        );

        const scorerStats =
          ensureStats(scorer.userId);

        scorerStats.goals++;
        addValue(scorer.userId, 2);

        const assistPlayers =
          scoringTeam === 1
            ? players1
            : players2;

        const assist = pickAssist(
          assistPlayers,
          scorer
        );

        if (
          assist &&
          assist.userId !== scorer.userId
        ) {
          ensureStats(assist.userId).assists++;
          addValue(assist.userId, 1);
        }
      } else {
        commentary = matchCommentary(
          team1,
          team2
        );
      }

      match.minute = minute;
      match.lastCommentary = commentary;

      const embed = new EmbedBuilder()
        .setTitle(
          `⚽ ${team1.name} 🆚 ${team2.name}`
        )
        .setDescription(
          `⏱️ **${minute}'**\n\n` +
          `## ${team1.goals} — ${team2.goals}\n\n` +
          `🎙️ ${commentary}`
        )
        .addFields(
          {
            name: team1.name,
            value: `👥 ${players1.length} oyuncu`,
            inline: true
          },
          {
            name: team2.name,
            value: `👥 ${players2.length} oyuncu`,
            inline: true
          }
        )
        .setFooter({
          text: "Axera League • Canlı Maç"
        })
        .setTimestamp();

      const msg = await channel.messages
        .fetch(match.messageId)
        .catch(() => null);

      if (msg) {
        await msg.edit({
          embeds: [embed]
        }).catch(() => {});
      }

      if (minute >= 90) {
        clearInterval(interval);

        await finishMatch(
          guild,
          match,
          team1,
          team2,
          players1,
          players2
        );
      }
    } catch (error) {
      console.error("Maç motoru hatası:", error);

      clearInterval(interval);

      if (data.activeMatches[matchId]) {
        delete data.activeMatches[matchId];
        saveData();
      }
    }
  }, 3000);

  data.activeMatches[matchId].interval = interval;
}

async function finishMatch(
  guild,
  match,
  team1,
  team2,
  players1,
  players2
) {
  if (match.finished) return;

  match.finished = true;

  const winner =
    match.team1Goals > match.team2Goals
      ? 1
      : match.team2Goals > match.team1Goals
        ? 2
        : 0;

  const s1 =
    data.standings[team1.id] ||
    {
      name: team1.name,
      points: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      wins: 0,
      draws: 0,
      losses: 0
    };

  const s2 =
    data.standings[team2.id] ||
    {
      name: team2.name,
      points: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      wins: 0,
      draws: 0,
      losses: 0
    };

  s1.goalsFor += match.team1Goals;
  s1.goalsAgainst += match.team2Goals;

  s2.goalsFor += match.team2Goals;
  s2.goalsAgainst += match.team1Goals;

  if (winner === 1) {
    s1.points += 3;
    s1.wins++;
    s2.losses++;
  } else if (winner === 2) {
    s2.points += 3;
    s2.wins++;
    s1.losses++;
  } else {
    s1.points++;
    s2.points++;
    s1.draws++;
    s2.draws++;
  }

  data.standings[team1.id] = s1;
  data.standings[team2.id] = s2;

  const allPlayers = [
    ...players1,
    ...players2
  ];

  for (const player of allPlayers) {
    if (!data.matchRewards[match.id]) {
      data.matchRewards[match.id] = {};
    }

    if (
      !data.matchRewards[match.id][player.userId]
    ) {
      addValue(player.userId, 5);
      ensureStats(player.userId).matches++;

      data.matchRewards[match.id][player.userId] = true;
    }
  }

  const channel =
    guild.channels.cache.get(IDS.channels.match);

  if (channel && match.messageId) {
    const msg = await channel.messages
      .fetch(match.messageId)
      .catch(() => null);

    if (msg) {
      const result =
        winner === 0
          ? "🤝 **MAÇ BERABERE!**"
          : winner === 1
            ? `🏆 **${team1.name} KAZANDI!**`
            : `🏆 **${team2.name} KAZANDI!**`;

      const embed = new EmbedBuilder()
        .setTitle(
          `🏁 ${team1.name} ${match.team1Goals} — ${match.team2Goals} ${team2.name}`
        )
        .setDescription(
          `${result}\n\n` +
          `🎁 Maça katılan oyunculara **+5M€** ödül verildi.\n` +
          `⚽ Gol: **+2M€**\n` +
          `🎯 Asist: **+1M€**`
        )
        .setFooter({
          text: "Axera League • Maç Sonucu"
        })
        .setTimestamp();

      await msg.edit({
        embeds: [embed]
      }).catch(() => {});
    }
  }

  data.matchHistory.push({
    id: match.id,
    team1: team1.id,
    team2: team2.id,
    score1: match.team1Goals,
    score2: match.team2Goals,
    timestamp: Date.now()
  });

  delete data.activeMatches[match.id];

  saveData();
}

/* =========================================================
   .MAÇ
   ========================================================= */

async function handleMatch(message) {
  if (!onlyChannel(message, IDS.channels.match)) return;

  if (!isCommentator(message.member)) {
    return safeReply(
      message,
      "❌ Bu komutu yalnızca **Spiker** veya **Yönetici** kullanabilir."
    );
  }

  const roles = [...message.mentions.roles.values()];

  if (roles.length < 2) {
    return safeReply(
      message,
      "❌ Kullanım: `.maç @Takım1 @Takım2`"
    );
  }

  const alreadyActive =
    Object.values(data.activeMatches)
      .some(
        m =>
          (
            m.team1 === roles[0].id &&
            m.team2 === roles[1].id
          ) ||
          (
            m.team1 === roles[1].id &&
            m.team2 === roles[0].id
          )
      );

  if (alreadyActive) {
    return safeReply(
      message,
      "❌ Bu takımların zaten aktif bir maçı var."
    );
  }

  await startMatch(
    message.guild,
    roles[0].id,
    roles[1].id
  );
}

/* =========================================================
   ROL PANELİ
   ========================================================= */

async function handleRolePanel(message) {
  if (!isAdmin(message.member)) {
    return safeReply(
      message,
      "❌ Bu paneli yalnızca Yönetici oluşturabilir."
    );
  }

  const embed = new EmbedBuilder()
    .setTitle("🎭 Axera League Rol Paneli")
    .setDescription(
      "İlgilendiğin bildirim rollerini aşağıdaki butonlardan açıp kapatabilirsin."
    )
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ping_partner")
      .setLabel("Partner Ping")
      .setEmoji("🤝")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("ping_match")
      .setLabel("Maç Ping")
      .setEmoji("⚽")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("ping_announcement")
      .setLabel("Duyuru Ping")
      .setEmoji("📢")
      .setStyle(ButtonStyle.Success)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ping_giveaway")
      .setLabel("Çekiliş Ping")
      .setEmoji("🎉")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("ping_media")
      .setLabel("Medya Ping")
      .setEmoji("📰")
      .setStyle(ButtonStyle.Primary)
  );

  safeSend(message.channel, {
    embeds: [embed],
    components: [row1, row2]
  });
}

/* =========================================================
   TICKET
   ========================================================= */

async function handleTicketPanel(message) {
  if (!isAdmin(message.member)) {
    return safeReply(
      message,
      "❌ Ticket panelini yalnızca Yönetici oluşturabilir."
    );
  }

  const embed = new EmbedBuilder()
    .setTitle("🎫 Axera League Destek")
    .setDescription(
      "Destek almak için aşağıdaki butona basarak özel bir ticket oluşturabilirsin."
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("create_ticket")
      .setLabel("Destek Talebi Oluştur")
      .setEmoji("🎫")
      .setStyle(ButtonStyle.Primary)
  );

  safeSend(message.channel, {
    embeds: [embed],
    components: [row]
  });
}

async function createTicket(interaction) {
  const guild = interaction.guild;

  const existing = Object.values(data.tickets)
    .find(t => t.userId === interaction.user.id && t.open);

  if (existing) {
    return interaction.reply({
      content: `❌ Zaten açık bir ticketın var: <#${existing.channelId}>`,
      ephemeral: true
    });
  }

  const channel = await guild.channels.create({
    name: `ticket-${interaction.user.username}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .substring(0, 90),
    type: ChannelType.GuildText,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      },
      {
        id: IDS.roles.moderator,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      }
    ]
  });

  data.tickets[channel.id] = {
    userId: interaction.user.id,
    channelId: channel.id,
    open: true,
    lastMessage: Date.now()
  };

  saveData();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("close_ticket")
      .setLabel("Bileti Kapat")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger)
  );

  await safeSend(channel, {
    content: `${interaction.user} hoş geldin! Destek ekibi birazdan seninle ilgilenecek.`,
    components: [row]
  });

  await interaction.reply({
    content: `✅ Ticket oluşturuldu: ${channel}`,
    ephemeral: true
  });
}

async function closeTicket(interaction) {
  const ticket = data.tickets[interaction.channel.id];

  if (!ticket) {
    return interaction.reply({
      content: "❌ Bu kanal bir ticket değil.",
      ephemeral: true
    });
  }

  if (
    interaction.user.id !== ticket.userId &&
    !isModerator(interaction.member)
  ) {
    return interaction.reply({
      content: "❌ Bu ticketı kapatma yetkin yok.",
      ephemeral: true
    });
  }

  ticket.open = false;
  saveData();

  await interaction.reply("🔒 Ticket kapatılıyor...");

  setTimeout(async () => {
    await interaction.channel.delete().catch(() => {});
  }, 2000);
}

/* =========================================================
   DM
   ========================================================= */

async function handleDM(message, args) {
  if (!isAdmin(message.member)) {
    return safeReply(message, "❌ Bu komut yalnızca Yönetici içindir.");
  }

  const target = message.mentions.users.first();

  if (!target) {
    return safeReply(
      message,
      "❌ Kullanım: `.dm @Oyuncu mesaj`"
    );
  }

  const text = args
    .filter(x => !/^<@!?\d+>$/.test(x))
    .join(" ")
    .trim();

  if (!text) {
    return safeReply(
      message,
      "❌ Gönderilecek mesajı yazmalısın."
    );
  }

  try {
    await target.send(text);

    safeReply(
      message,
      `✅ ${target} kullanıcısına DM gönderildi.`
    );
  } catch {
    safeReply(
      message,
      "❌ Kullanıcıya DM gönderilemedi."
    );
  }
}

/* =========================================================
   MODERASYON
   ========================================================= */

async function handleModeration(message, command, args) {
  if (!isAdmin(message.member)) {
    return safeReply(
      message,
      "❌ Bu komut yalnızca Yönetici içindir."
    );
  }

  if (command === "sil") {
    const amount = Number(args[0]);

    if (
      !Number.isInteger(amount) ||
      amount < 1 ||
      amount > 1000
    ) {
      return safeReply(
        message,
        "❌ 1-1000 arasında bir miktar belirt."
      );
    }

    try {
      const messages =
        await message.channel.bulkDelete(
          amount,
          true
        );

      const info = await message.channel.send(
        `🧹 **${messages.size} mesaj silindi.**`
      );

      setTimeout(
        () => info.delete().catch(() => {}),
        3000
      );
    } catch {
      safeReply(
        message,
        "❌ Mesajlar silinemedi."
      );
    }

    return;
  }

  const target =
    message.mentions.members.first();

  if (!target) {
    return safeReply(
      message,
      `❌ Kullanım: \`.${command} @Oyuncu\``
    );
  }

  if (command === "kick") {
    await target.kick().catch(() => null);
    return safeReply(message, `👢 ${target} sunucudan atıldı.`);
  }

  if (command === "ban") {
    await target.ban().catch(() => null);
    return safeReply(message, `🔨 ${target} sunucudan yasaklandı.`);
  }

  if (command === "mute") {
    await target.timeout(
      60 * 60 * 1000,
      "Axera League moderasyon"
    ).catch(() => null);

    return safeReply(
      message,
      `🔇 ${target} 1 saat susturuldu.`
    );
  }

  if (command === "unmute") {
    await target.timeout(null).catch(() => null);

    return safeReply(
      message,
      `🔊 ${target} susturması kaldırıldı.`
    );
  }
}

/* =========================================================
   EMBED
   ========================================================= */

async function handleEmbed(message, args) {
  if (!isAdmin(message.member)) {
    return safeReply(message, "❌ Bu komut Yönetici içindir.");
  }

  const raw = args.join(" ");
  const [title, description] =
    raw.split("|").map(x => x.trim());

  if (!title || !description) {
    return safeReply(
      message,
      "❌ Kullanım: `.embed Başlık | Açıklama`"
    );
  }

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();

  await safeDelete(message);

  safeSend(message.channel, {
    embeds: [embed]
  });
}

/* =========================================================
   ŞART
   ========================================================= */

async function handleConditions(message) {
  safeReply(
    message,
    [
      "## 📋 Axera League Şartları",
      "",
      "✓ **Kalıcı Tık:** Kalıcı 「✓」 kanalından tıklayınız.",
      "🎭 **Rol Al:** Rol Al kanalından en az **2 rol** alınız.",
      "",
      "ℹ️ Bu şartlar bilgilendirme amaçlıdır.",
      "ℹ️ Sistemleri kullanmak için zorunlu değildir."
    ].join("\n")
  );
}

/* =========================================================
   YARDIM
   ========================================================= */

async function handleHelp(message) {
  const embed = new EmbedBuilder()
    .setTitle("📚 Axera League Komut Listesi")
    .setDescription(
      [
        "### 👤 Kayıt",
        "`.k @Oyuncu İsim`",
        "`.kayıtsızver @Oyuncu`",
        "`.ara isim`",
        "",
        "### 💰 Değer",
        "`.dver @Oyuncu 5M`",
        "`.dsil @Oyuncu 5M`",
        "",
        "### ⚽ Futbol",
        "`.ant` / `.antrenman`",
        "`.pen` / `.penaltı`",
        "`.tweet mesaj`",
        "`.maç @Takım1 @Takım2`",
        "",
        "### 🏟️ Takım",
        "`.takımekle @Takım`",
        "`.takımkaldır @Takım`",
        "`.takımdeğer @Takım 850M`",
        "`.kadroekle @Takım @Oyuncu Pozisyon`",
        "`.kadrocikar @Takım @Oyuncu`",
        "`.kadro @Takım`",
        "`.formasyon @Takım`",
        "`.puan`",
        "`.puanekle @Takım 3`",
        "",
        "### 📅 Fikstür",
        "`.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`",
        "`.fikstür`",
        "`.fiksturcikar @Takım1 @Takım2`",
        "",
        "### 🏆 Kupa",
        "`.kupaekle @Takım Kupa`",
        "`.kupasil @Takım Kupa`",
        "`.müze @Takım`",
        "",
        "### 🎫 Destek",
        "`.ticketpanel`",
        "",
        "### 🎭 Roller",
        "`.rolpanel`",
        "",
        "### 🤖 AI",
        "`.ai soru`",
        "`.yapayzeka soru`",
        "AI kanalında normal mesaj da yazabilirsiniz.",
        "",
        "### 🛡️ Yönetim",
        "`.sil miktar`",
        "`.embed Başlık | Açıklama`",
        "`.kick @Oyuncu`",
        "`.ban @Oyuncu`",
        "`.mute @Oyuncu`",
        "`.unmute @Oyuncu`",
        "`.dm @Oyuncu mesaj`",
        "",
        "`.şart`"
      ].join("\n")
    )
    .setFooter({
      text: "Axera League • Futbol RP"
    });

  safeReply(message, {
    embeds: [embed]
  });
}

/* =========================================================
   AI
   ========================================================= */

async function askAI(userId, input) {
  if (!openai) {
    return "❌ AI sistemi aktif değil. Railway'de `OPENAI_API_KEY` değişkenini ekleyin.";
  }

  const text = String(input || "").trim();

  if (!text) {
    return "❌ Bir soru yazmalısın.";
  }

  if (
    normalize(text).includes("seni kim kurdu")
  ) {
    return "Lynox9380 kurdu.";
  }

  const key = String(userId);

  if (!data.aiMemory[key]) {
    data.aiMemory[key] = [];
  }

  const memory = data.aiMemory[key];

  memory.push({
    role: "user",
    content: text
  });

  while (memory.length > 8) {
    memory.shift();
  }

  try {
    const response = await openai.responses.create({
      model: AI_MODEL,
      input: [
        {
          role: "system",
          content:
            "Sen Axera adlı Türkçe konuşan Discord AI asistanısın. " +
            "Kısa, hızlı, doğal ve yardımcı cevaplar ver. " +
            "Sunucu yönetimi gibi işlemleri kendin yapma; Discord komutlarını kullanıcının çalıştırması gerektiğini belirt. " +
            "Kullanıcı senden seni kimin kurduğunu sorarsa tam olarak 'Lynox9380 kurdu.' de."
        },
        ...memory
      ],
      max_output_tokens: 500
    });

    const answer =
      response.output_text?.trim() ||
      "❌ AI cevap üretemedi.";

    memory.push({
      role: "assistant",
      content: answer
    });

    while (memory.length > 8) {
      memory.shift();
    }

    saveData();

    return answer;
  } catch (error) {
    console.error("OpenAI hatası:", error);

    return "❌ AI şu anda cevap veremiyor. Birkaç saniye sonra tekrar deneyin.";
  }
}

async function handleAICommand(message, args) {
  const question = args.join(" ").trim();

  if (!question) {
    return safeReply(
      message,
      "🤖 Kullanım: `.ai soru`"
    );
  }

  const thinking = await safeReply(
    message,
    "🤖 **Axera düşünüyor...**"
  );

  const answer =
    await askAI(message.author.id, question);

  if (thinking) {
    await thinking.edit({
      content: answer.substring(0, 1900)
    }).catch(() => {});
  }
}

async function handleAIChannel(message) {
  if (
    message.channel.id !== IDS.channels.ai ||
    message.author.bot
  ) {
    return;
  }

  if (message.content.startsWith(PREFIX)) {
    return;
  }

  const answer =
    await askAI(
      message.author.id,
      message.content
    );

  for (const chunk of splitMessage(answer)) {
    await safeSend(message.channel, {
      content: chunk
    });
  }
}

/* =========================================================
   DURUM MESAJI
   ========================================================= */

let lastStatusKey = null;
let statusMessageId = null;

async function updateBotStatus() {
  const channel =
    client.channels.cache.get(
      IDS.channels.botStatus
    );

  if (!channel?.isTextBased?.()) return;

  /*
   * Önce bot durum kanalındaki BOTUN eski mesajlarını
   * temizle.
   */
  try {
    const messages =
      await channel.messages.fetch({
        limit: 50
      });

    const ownMessages =
      messages.filter(
        msg =>
          msg.author.id === client.user.id
      );

    for (const msg of ownMessages.values()) {
      await msg.delete().catch(() => {});
    }
  } catch (error) {
    console.error(
      "Bot durum eski mesaj temizleme hatası:",
      error
    );
  }

  const guildCount = client.guilds.cache.size;

  const userCount =
    client.guilds.cache.reduce(
      (total, guild) =>
        total + (guild.memberCount || 0),
      0
    );

  const ping =
    client.ws.ping >= 0
      ? `${client.ws.ping}ms`
      : "Bilinmiyor";

  const uptimeSeconds =
    Math.floor(process.uptime());

  const hours =
    Math.floor(uptimeSeconds / 3600);

  const minutes =
    Math.floor(
      (uptimeSeconds % 3600) / 60
    );

  const seconds =
    uptimeSeconds % 60;

  const embed = new EmbedBuilder()
    .setTitle("🤖 Axera League • Bot Durumu")
    .setDescription(
      [
        "🟢 **Bot Durumu:** Aktif",
        `📡 **Ping:** ${ping}`,
        `🏠 **Sunucu:** ${guildCount}`,
        `👥 **Üye:** ${userCount}`,
        `⚙️ **Komut:** ${COMMAND_COUNT}+`,
        `⏱️ **Çalışma Süresi:** ${hours}s ${minutes}dk ${seconds}sn`,
        "",
        `🕐 **Son Güncelleme:** <t:${Math.floor(Date.now() / 1000)}:F>`,
        "",
        "🔄 Durum mesajı her **30 dakikada bir** yenilenir."
      ].join("\n")
    )
    .setFooter({
      text: "Axera League | Futbol RP"
    })
    .setTimestamp();

  const sent =
    await safeSend(channel, {
      embeds: [embed]
    });

  if (sent) {
    statusMessageId = sent.id;
  }
}

function startStatusScheduler() {
  setInterval(async () => {
    try {
      const now = new Date();

      const key =
        `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;

      /*
       * 00 ve 30 dakikalarında gönder.
       */
      if (
        (now.getMinutes() === 0 ||
          now.getMinutes() === 30) &&
        lastStatusKey !== key
      ) {
        lastStatusKey = key;

        await updateBotStatus();
      }
    } catch (error) {
      console.error(
        "Status scheduler hatası:",
        error
      );
    }
  }, 60 * 1000);
}

/* =========================================================
   TICKET AUTO CLOSE
   ========================================================= */

function startTicketScheduler() {
  setInterval(async () => {
    const now = Date.now();

    for (const [channelId, ticket] of Object.entries(
      data.tickets
    )) {
      if (!ticket.open) continue;

      const last =
        Number(ticket.lastMessage || 0);

      if (
        last > 0 &&
        now - last >= 60 * 60 * 1000
      ) {
        ticket.open = false;

        const channel =
          client.channels.cache.get(channelId);

        if (channel) {
          await safeSend(
            channel,
            "⏰ Bu ticketta 60 dakika boyunca mesaj gelmediği için kapatılıyor."
          );

          setTimeout(() => {
            channel.delete().catch(() => {});
          }, 3000);
        }
      }
    }

    saveData();
  }, 60 * 1000);
}

/* =========================================================
   FİKSTÜR SCHEDULER
   ========================================================= */

function startFixtureScheduler() {
  setInterval(async () => {
    const now = Date.now();

    for (const fixture of data.fixtures) {
      if (fixture.started) continue;

      if (fixture.timestamp <= now) {
        fixture.started = true;

        const guild =
          client.guilds.cache.find(
            g =>
              g.roles.cache.has(fixture.team1) &&
              g.roles.cache.has(fixture.team2)
          );

        if (!guild) continue;

        const alreadyActive =
          Object.values(data.activeMatches)
            .some(
              m =>
                (
                  m.team1 === fixture.team1 &&
                  m.team2 === fixture.team2
                ) ||
                (
                  m.team1 === fixture.team2 &&
                  m.team2 === fixture.team1
                )
            );

        if (!alreadyActive) {
          await startMatch(
            guild,
            fixture.team1,
            fixture.team2
          );
        }

        saveData();
      }
    }
  }, 1000);
}

/* =========================================================
   BUTTONS
   ========================================================= */

async function handleButton(interaction) {
  const id = interaction.customId;

  /* KAYIT PANELİ */

  if (
    id === "register_player" ||
    id === "register_member" ||
    id === "register_td" ||
    id === "register_gk"
  ) {
    if (!isRegistrationStaff(interaction.member)) {
      return interaction.reply({
        content:
          "❌ Kayıt panelini yalnızca Kayıt Yetkilisi veya Yönetici kullanabilir.",
        ephemeral: true
      });
    }

    let type = "player";

    if (id === "register_member") type = "member";
    if (id === "register_td") type = "td";
    if (id === "register_gk") type = "gk";

    const typeMap = {
      player: "Futbolcu",
      member: "Üye",
      td: "Teknik Direktör",
      gk: "Kaleci"
    };

    return interaction.reply({
      content:
        `ℹ️ Bu genel kayıt panelidir. ` +
        `Belirli bir kullanıcı için \`.k @Oyuncu İsim\` komutuyla açılan kayıt panelini kullanın.`,
      ephemeral: true
    });
  }

  /* .K İLE AÇILAN PANEL */

  if (id.startsWith("regtype_")) {
    if (!isRegistrationStaff(interaction.member)) {
      return interaction.reply({
        content:
          "❌ Bu kayıt panelini yalnızca Kayıt Yetkilisi veya Yönetici kullanabilir.",
        ephemeral: true
      });
    }

    const parts = id.split("_");

    const type = parts[1];
    const targetId = parts[2];

    const panel =
      data.registrationPanels[
        interaction.message.id
      ];

    if (
      panel &&
      panel.targetId !== targetId
    ) {
      return interaction.reply({
        content: "❌ Kayıt paneli bilgisi eşleşmiyor.",
        ephemeral: true
      });
    }

    const target =
      await interaction.guild.members
        .fetch(targetId)
        .catch(() => null);

    if (!target) {
      return interaction.reply({
        content: "❌ Kullanıcı bulunamadı.",
        ephemeral: true
      });
    }

    const nickname =
      panel?.nickname || target.displayName;

    const roleName =
      await registerUser(
        target,
        type,
        nickname,
        interaction.member
      );

    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle("✅ Kayıt Tamamlandı")
          .setDescription(
            `${target}\n\n` +
            `👤 Kayıt Türü: **${roleName}**\n` +
            `📝 İsim: **${nickname}**\n` +
            `🛡️ Kayıt Yetkilisi: ${interaction.user}`
          )
          .setTimestamp()
      ],
      components: []
    });

    delete data.registrationPanels[
      interaction.message.id
    ];

    saveData();

    return;
  }

  /* ROL PANELİ */

  const pingMap = {
    ping_partner: IDS.roles.pingRoles.partner,
    ping_match: IDS.roles.pingRoles.match,
    ping_announcement: IDS.roles.pingRoles.announcement,
    ping_giveaway: IDS.roles.pingRoles.giveaway,
    ping_media: IDS.roles.pingRoles.media
  };

  if (pingMap[id]) {
    const roleId = pingMap[id];

    if (interaction.member.roles.cache.has(roleId)) {
      await interaction.member.roles.remove(roleId);

      return interaction.reply({
        content: "❌ Bildirim rolü kaldırıldı.",
        ephemeral: true
      });
    }

    await interaction.member.roles.add(roleId);

    return interaction.reply({
      content: "✅ Bildirim rolü verildi.",
      ephemeral: true
    });
  }

  /* FORMASYON */

  if (id.startsWith("formation_")) {
    if (!isCommentator(interaction.member)) {
      return interaction.reply({
        content: "❌ Bu işlem Spiker/Yönetici içindir.",
        ephemeral: true
      });
    }

    return;
  }

  /* TICKET */

  if (id === "create_ticket") {
    return createTicket(interaction);
  }

  if (id === "close_ticket") {
    return closeTicket(interaction);
  }
}

/* =========================================================
   SELECT MENU
   ========================================================= */

async function handleSelect(interaction) {
  if (
    interaction.customId.startsWith(
      "formation_"
    )
  ) {
    if (!isCommentator(interaction.member)) {
      return interaction.reply({
        content: "❌ Bu işlem Spiker/Yönetici içindir.",
        ephemeral: true
      });
    }

    const teamRoleId =
      interaction.customId.split("_")[1];

    const formation =
      interaction.values[0];

    data.formations[teamRoleId] =
      formation;

    saveData();

    return interaction.update({
      content:
        `✅ Formasyon **${formation}** olarak ayarlandı.`,
      components: []
    });
  }
}

/* =========================================================
   MESAJ EVENT
   ========================================================= */

client.on("messageCreate", async message => {
  try {
    if (!message.guild) return;
    if (message.author.bot) return;

    /* AI KANALI */

    await handleAIChannel(message);

    /* KOMUT DEĞİLSE BİTİR */

    if (!message.content.startsWith(PREFIX)) {
      return;
    }

    const raw =
      message.content
        .slice(PREFIX.length)
        .trim();

    if (!raw) return;

    const parts =
      raw.split(/\s+/);

    const command =
      normalize(parts.shift());

    const args = parts;

    /* KAYIT */

    if (command === "k") {
      return handleRegisterCommand(
        message,
        args
      );
    }

    if (
      command === "kayitsizver" ||
      command === "kayıtsızver"
    ) {
      return handleUnregister(
        message,
        args
      );
    }

    /* ARA */

    if (command === "ara") {
      return handleSearch(
        message,
        args
      );
    }

    /* DEĞER */

    if (command === "dver") {
      return handleValueCommand(
        message,
        args,
        true
      );
    }

    if (command === "dsil") {
      return handleValueCommand(
        message,
        args,
        false
      );
    }

    /* ANTRENMAN */

    if (
      command === "ant" ||
      command === "antrenman"
    ) {
      return handleTraining(message);
    }

    /* PENALTI */

    if (
      command === "pen" ||
      command === "penalti" ||
      command === "penaltı"
    ) {
      return handlePenalty(message);
    }

    /* TWEET */

    if (command === "tweet") {
      return handleTweet(
        message,
        args
      );
    }

    /* TAKIM */

    if (command === "takımekle") {
      return handleTeamAdd(message);
    }

    if (
      command === "takımkaldır" ||
      command === "takimkaldir"
    ) {
      return handleTeamRemove(message);
    }

    if (
      command === "takımdeğer" ||
      command === "takimdeger"
    ) {
      return handleTeamValue(
        message,
        args
      );
    }

    /* KADRO */

    if (command === "kadroekle") {
      return handleSquadAdd(
        message,
        args
      );
    }

    if (
      command === "kadrocikar" ||
      command === "kadrocıkart"
    ) {
      return handleSquadRemove(
        message
      );
    }

    if (
      command === "kadro" ||
      command === "kadrom"
    ) {
      return handleSquad(message);
    }

    /* FORMASYON */

    if (command === "formasyon") {
      return handleFormation(message);
    }

    /* PUAN */

    if (
      command === "puan" ||
      command === "puandurumu"
    ) {
      return handleStandings(message);
    }

    if (command === "puanekle") {
      return handleAddPoints(
        message,
        args
      );
    }

    /* MAÇ */

    if (
      command === "maç" ||
      command === "mac"
    ) {
      return handleMatch(message);
    }

    /* FİKSTÜR */

    if (
      command === "fiksturekle"
    ) {
      return handleFixtureAdd(
        message,
        args
      );
    }

    if (
      command === "fikstür" ||
      command === "fikstur"
    ) {
      return handleFixtures(message);
    }

    if (
      command === "fiksturcikar"
    ) {
      return handleFixtureRemove(message);
    }

    /* KUPA */

    if (command === "kupaekle") {
      return handleCupAdd(
        message,
        args
      );
    }

    if (command === "kupasil") {
      return handleCupRemove(
        message,
        args
      );
    }

    if (
      command === "müze" ||
      command === "muze"
    ) {
      return handleMuseum(message);
    }

    /* TICKET */

    if (command === "ticketpanel") {
      return handleTicketPanel(message);
    }

    /* ROL PANELİ */

    if (command === "rolpanel") {
      return handleRolePanel(message);
    }

    /* DM */

    if (command === "dm") {
      return handleDM(
        message,
        args
      );
    }

    /* MODERASYON */

    if (
      [
        "sil",
        "kick",
        "ban",
        "mute",
        "unmute"
      ].includes(command)
    ) {
      return handleModeration(
        message,
        command,
        args
      );
    }

    /* EMBED */

    if (command === "embed") {
      return handleEmbed(
        message,
        args
      );
    }

    /* AI */

    if (
      command === "ai" ||
      command === "yapayzeka"
    ) {
      return handleAICommand(
        message,
        args
      );
    }

    /* ŞART */

    if (
      command === "sart" ||
      command === "şart"
    ) {
      return handleConditions(message);
    }

    /* YARDIM */

    if (
      command === "yardim" ||
      command === "yardım"
    ) {
      return handleHelp(message);
    }

    /* PING */

    if (command === "ping") {
      return safeReply(
        message,
        `🏓 Pong! **${client.ws.ping}ms**`
      );
    }

  } catch (error) {
    console.error(
      "messageCreate hatası:",
      error
    );

    safeReply(
      message,
      "❌ İşlem sırasında beklenmeyen bir hata oluştu."
    ).catch(() => {});
  }
});

/* =========================================================
   INTERACTION
   ========================================================= */

client.on(
  "interactionCreate",
  async interaction => {
    try {
      if (interaction.isButton()) {
        return handleButton(interaction);
      }

      if (interaction.isStringSelectMenu()) {
        return handleSelect(interaction);
      }
    } catch (error) {
      console.error(
        "interactionCreate hatası:",
        error
      );

      if (!interaction.replied &&
          !interaction.deferred) {
        interaction.reply({
          content:
            "❌ İşlem sırasında bir hata oluştu.",
          ephemeral: true
        }).catch(() => {});
      }
    }
  }
);

/* =========================================================
   YENİ ÜYE
   ========================================================= */

client.on(
  "guildMemberAdd",
  async member => {
    try {
      const role =
        member.guild.roles.cache.get(
          IDS.roles.unregistered
        );

      if (role) {
        await member.roles.add(role).catch(() => {});
      }

      const channel =
        member.guild.channels.cache.get(
          IDS.channels.registration
        );

      if (channel) {
        const embed = new EmbedBuilder()
          .setTitle("👋 Yeni Üye Geldi!")
          .setDescription(
            `${member}\n\n` +
            `Sunucumuza hoş geldin!\n` +
            `Kayıt işlemin için <@&${IDS.roles.registration}> ekibinden yardım alabilirsin.`
          )
          .setTimestamp();

        await safeSend(channel, {
          content: `<@&${IDS.roles.registration}>`,
          embeds: [embed]
        });
      }

      ensureUser(member.id).registered = false;
      saveData();

    } catch (error) {
      console.error(
        "guildMemberAdd hatası:",
        error
      );
    }
  }
);

/* =========================================================
   TICKET MESAJ TAKİBİ
   ========================================================= */

client.on(
  "messageCreate",
  message => {
    if (!message.guild) return;
    if (message.author.bot) return;

    const ticket =
      data.tickets[message.channel.id];

    if (ticket?.open) {
      ticket.lastMessage = Date.now();
      saveData();
    }
  }
);

/* =========================================================
   READY
   ========================================================= */

client.once("ready", async () => {
  console.log("================================");
  console.log("AXERA LEAGUE BOT AKTİF");
  console.log(`Bot: ${client.user.tag}`);
  console.log(`Sunucu: ${client.guilds.cache.size}`);
  console.log(`Ping: ${client.ws.ping}ms`);
  console.log("================================");

  try {
    client.user.setPresence({
      activities: [
        {
          name: "Axera League | Futbol RP",
          type: 0
        }
      ],
      status: "online"
    });
  } catch {}

  /*
   * Bot açıldığında mevcut durum mesajlarını temizleyip
   * ilk durum mesajını gönder.
   */
  await updateBotStatus();

  startStatusScheduler();
  startTicketScheduler();
  startFixtureScheduler();
});

/* =========================================================
   HATA YÖNETİMİ
   ========================================================= */

process.on(
  "unhandledRejection",
  error => {
    console.error(
      "UNHANDLED REJECTION:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  error => {
    console.error(
      "UNCAUGHT EXCEPTION:",
      error
    );
  }
);

/* =========================================================
   TOKEN
   ========================================================= */

if (!process.env.TOKEN) {
  console.error(
    "❌ TOKEN bulunamadı! Railway Variables kısmına TOKEN ekleyin."
  );

  process.exit(1);
}

client.login(process.env.TOKEN)
  .then(() => {
    console.log("Discord giriş işlemi başlatıldı.");
  })
  .catch(error => {
    console.error(
      "Discord login hatası:",
      error
    );

    process.exit(1);
  });
