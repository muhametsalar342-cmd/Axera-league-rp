require("dotenv").config();

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

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

/* =========================================================
   AXERA LEAGUE
   Tek dosya Discord.js v14 botu
   ========================================================= */

const PREFIX = ".";

const TOKEN = process.env.TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";

if (!TOKEN) {
  console.error("❌ TOKEN bulunamadı. Railway Variables kısmına TOKEN ekle.");
  process.exit(1);
}

const openai = OPENAI_API_KEY
  ? new OpenAI({ apiKey: OPENAI_API_KEY })
  : null;

/* =========================================================
   CLIENT
   ========================================================= */

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
   AXERA IDS
   ========================================================= */

const IDS = {
  roles: {
    admin: "1534455282426445897",
    register: "1534456315366342716",
    unregistered: "1534457560134844517",
    goalkeeper: "1534492034243498195",
    member: "1534457460163608636",
    player: "1534457228986421278",
    td: "1534456648930693120",
    value: "1534456192913375382",
    moderator: "1534456108415189063",
    announcer: "1535251168169697390",

    mediaPing: "1547393966553440346",
    partnerPing: "1547393545827123230",
    matchPing: "1547393416755941509",
    announcementPing: "1547393331297001522",
    giveawayPing: "1545116885589430312"
  },

  channels: {
    register: "1547371464515133470",
    chat: "1547374641763455009",
    training: "1547375589923618957",
    penalty: "1547375997698052166",
    tweet: "1547377797193011340",
    match: "1547376935410073692",
    standings: "1547382143775285431",
    value: "1547376344927834122",
    status: "1547388197796057118",
    ai: "1547375186754408539"
  },

  teams: {
    Barcelona: "1534480715779936297",
    "Real Madrid": "1534480984064528655",
    Galatasaray: "1534481073629691995",
    Fenerbahçe: "1534481156840620183",
    Beşiktaş: "1534481259739348992",
    "Manchester United": "1534481426463068180"
  }
};

/* =========================================================
   DATABASE
   ========================================================= */

const DATA_FILE = path.join(__dirname, "data.json");

const DEFAULT_DATA = {
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
  stats: {},
  matchHistory: {},
  aiCooldowns: {},
  lastStatusKey: null,
  commandCount: 0
};

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(DEFAULT_DATA, null, 2)
    );
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }

  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

    return {
      ...JSON.parse(JSON.stringify(DEFAULT_DATA)),
      ...data,
      users: data.users || {},
      teams: data.teams || {},
      standings: data.standings || {},
      fixtures: data.fixtures || [],
      registrationPanels: data.registrationPanels || {},
      tickets: data.tickets || {},
      cups: data.cups || {},
      formations: data.formations || {},
      training: data.training || {},
      tweetCooldowns: data.tweetCooldowns || {},
      matchRewards: data.matchRewards || {},
      stats: data.stats || {},
      matchHistory: data.matchHistory || {},
      aiCooldowns: data.aiCooldowns || {}
    };
  } catch (err) {
    console.error("data.json okunamadı:", err);
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
}

let db = loadData();

function saveData() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(db, null, 2)
    );
  } catch (err) {
    console.error("data.json kaydedilemedi:", err);
  }
}

/* =========================================================
   HELPERS
   ========================================================= */

function embed(title, description, color = 0x5865f2) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

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
  return isAdmin(member) ||
    Boolean(member?.roles?.cache?.has(roleId));
}

function isRegisterStaff(member) {
  return hasRole(member, IDS.roles.register);
}

function isValueStaff(member) {
  return hasRole(member, IDS.roles.value);
}

function isSpeaker(member) {
  return hasRole(member, IDS.roles.announcer);
}

function isModerator(member) {
  return hasRole(member, IDS.roles.moderator);
}

function channelOnly(message, channelId) {
  return message.channel.id === channelId;
}

function ensureUser(userId) {
  if (!db.users[userId]) {
    db.users[userId] = {
      registered: false,
      name: "",
      country: "🌍",
      position: "SNT",
      value: 0,
      budget: 0,
      goals: 0,
      assists: 0,
      training: 0,
      penaltyAttempts: 0,
      penaltyGoals: 0,
      matches: 0,
      wins: 0,
      draws: 0,
      losses: 0
    };
  }

  return db.users[userId];
}

function ensureTeam(roleId, roleName) {
  if (!db.teams[roleId]) {
    db.teams[roleId] = {
      id: roleId,
      name: roleName,
      value: 0,
      points: 0,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      squad: {},
      active: true
    };
  }

  return db.teams[roleId];
}

function parseAmount(input) {
  if (!input) return NaN;

  let value = String(input)
    .trim()
    .toUpperCase()
    .replace(/€/g, "")
    .replace(/\s/g, "")
    .replace(",", ".");

  let multiplier = 1;

  if (value.endsWith("M")) {
    multiplier = 1;
    value = value.slice(0, -1);
  } else {
    return NaN;
  }

  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return NaN;
  }

  return number;
}

function formatValue(m) {
  const n = Math.max(0, Number(m) || 0);
  return `${Number.isInteger(n) ? n : n.toFixed(2)}M€`;
}

function parseNicknameValue(nickname) {
  if (!nickname) return null;

  const match = String(nickname).match(/([0-9]+(?:[.,][0-9]+)?)M€\s*$/i);

  if (!match) return null;

  const value = Number(match[1].replace(",", "."));

  return Number.isFinite(value) ? value : null;
}

function replaceNicknameValue(nickname, value) {
  const formatted = formatValue(value);

  if (/([0-9]+(?:[.,][0-9]+)?)M€\s*$/i.test(nickname)) {
    return nickname.replace(
      /([0-9]+(?:[.,][0-9]+)?)M€\s*$/i,
      formatted
    );
  }

  return `${nickname} | ${formatted}`;
}

function cleanNickname(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 32);
}

async function fetchMember(guild, userId) {
  return guild.members.fetch(userId).catch(() => null);
}

async function setPlayerNickname(member, nickname) {
  if (!member) return false;

  if (
    !member.guild.members.me ||
    !member.guild.members.me.permissions.has(
      PermissionsBitField.Flags.ManageNicknames
    )
  ) {
    return false;
  }

  if (
    member.roles.highest.position >=
    member.guild.members.me.roles.highest.position
  ) {
    return false;
  }

  await member.setNickname(
    cleanNickname(nickname),
    "Axera League"
  ).catch(() => {});

  return true;
}

/* =========================================================
   VALUE SYSTEM
   ========================================================= */

async function changePlayerValue(member, delta, reason = "Axera League") {
  const user = ensureUser(member.id);

  let current = Number(user.value) || 0;

  if (current <= 0) {
    const nicknameValue = parseNicknameValue(
      member.nickname || member.user.username
    );

    if (nicknameValue !== null) {
      current = nicknameValue;
    }
  }

  let newValue = current + Number(delta);

  newValue = Math.max(0, Math.min(1000, newValue));

  user.value = newValue;

  db.users[member.id] = user;

  const oldNickname =
    member.nickname ||
    member.user.username;

  const newNickname =
    replaceNicknameValue(
      oldNickname,
      newValue
    );

  await setPlayerNickname(
    member,
    newNickname
  );

  saveData();

  return {
    oldValue: current,
    newValue
  };
}

/* =========================================================
   REGISTRATION
   ========================================================= */

function registrationButtons(panelId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`register:player:${panelId}`)
        .setLabel("⚽ Futbolcu")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`register:member:${panelId}`)
        .setLabel("👤 Üye")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(`register:td:${panelId}`)
        .setLabel("🧑‍💼 Teknik Direktör")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`register:keeper:${panelId}`)
        .setLabel("🧤 Kaleci")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`register:cancel:${panelId}`)
        .setLabel("❌ İptal Et")
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

async function registerPlayer(member, type, nickname) {
  const user = ensureUser(member.id);

  const removableRoles = [
    IDS.roles.unregistered,
    IDS.roles.player,
    IDS.roles.member,
    IDS.roles.td,
    IDS.roles.goalkeeper
  ];

  for (const roleId of removableRoles) {
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId).catch(() => {});
    }
  }

  let selectedRole = IDS.roles.player;
  let roleName = "Futbolcu";

  if (type === "member") {
    selectedRole = IDS.roles.member;
    roleName = "Üye";
  }

  if (type === "td") {
    selectedRole = IDS.roles.td;
    roleName = "Teknik Direktör";
  }

  if (type === "keeper") {
    selectedRole = IDS.roles.goalkeeper;
    roleName = "Kaleci";
  }

  await member.roles.add(selectedRole).catch(() => {});

  user.registered = true;
  user.name = nickname;
  db.users[member.id] = user;

  await setPlayerNickname(
    member,
    nickname
  );

  saveData();

  return roleName;
}

/* =========================================================
   SEARCH
   ========================================================= */

function normalizeName(text) {
  return String(text || "")
    .trim()
    .toLocaleLowerCase("tr-TR");
}

async function searchPlayer(guild, query) {
  const normalized = normalizeName(query);

  if (!normalized) return [];

  const results = [];

  for (const [userId, data] of Object.entries(db.users)) {
    if (!data.registered) continue;

    const member = guild.members.cache.get(userId);

    if (!member) continue;

    if (member.roles.cache.has(IDS.roles.unregistered)) {
      continue;
    }

    const name = normalizeName(
      data.name ||
      member.nickname ||
      member.user.username
    );

    /*
      TAM EŞLEŞME:
      .ara oyuncu
      sadece adı oyuncu olan kişiyi bulur.
    */
    if (name === normalized) {
      results.push({
        userId,
        member,
        data
      });
    }
  }

  return results;
}

/* =========================================================
   TRAINING
   ========================================================= */

async function runTraining(message) {
  if (!channelOnly(message, IDS.channels.training)) {
    return message.reply(
      "❌ `.ant` sadece antrenman kanalında kullanılabilir."
    );
  }

  const user = ensureUser(message.author.id);

  user.training = Number(user.training) || 0;
  user.training++;

  let reward = 0;

  if (user.training >= 5) {
    user.training = 0;
    reward = 5;

    const member = await fetchMember(
      message.guild,
      message.author.id
    );

    if (member) {
      await changePlayerValue(
        member,
        5,
        "5/5 Antrenman"
      );
    }
  }

  db.users[message.author.id] = user;
  saveData();

  if (reward) {
    return message.reply(
      `🏋️ **ANTRENMAN TAMAMLANDI!**\n\n` +
      `📈 İlerleme: **5/5**\n` +
      `💰 Otomatik ödül: **+5M€**\n` +
      `🔄 Yeni antrenman serisi başladı.`
    );
  }

  return message.reply(
    `🏋️ **Antrenman tamamlandı!**\n` +
    `📈 İlerleme: **${user.training}/5**`
  );
}

/* =========================================================
   PENALTY
   ========================================================= */

async function runPenalty(message) {
  if (!channelOnly(message, IDS.channels.penalty)) {
    return message.reply(
      "❌ `.pen` sadece penaltı kanalında kullanılabilir."
    );
  }

  const user = ensureUser(message.author.id);

  user.penaltyAttempts =
    Number(user.penaltyAttempts) + 1;

  const random = Math.random();

  let result;

  if (random < 0.50) {
    result = "goal";
  } else if (random < 0.75) {
    result = "post";
  } else {
    result = "keeper";
  }

  let reward = 0;

  const member = await fetchMember(
    message.guild,
    message.author.id
  );

  if (result === "goal") {
    user.penaltyGoals =
      Number(user.penaltyGoals) + 1;

    reward = 5;

    if (member) {
      await changePlayerValue(
        member,
        5,
        "Penaltı golü"
      );
    }
  }

  db.users[message.author.id] = user;
  saveData();

  if (result === "goal") {
    return message.reply(
      `🥅 **GOOOOL!** ⚽\n\n` +
      `🧤 Kaleci: **Axera Kalecisi**\n` +
      `💰 Ödül: **+5M€**\n` +
      `📊 Penaltı: **${user.penaltyGoals}/${user.penaltyAttempts}**`
    );
  }

  if (result === "post") {
    return message.reply(
      `🥅 **DİREK!** 😱\n\n` +
      `🧤 Axera Kalecisi topu izledi!\n` +
      `📊 Penaltı: **${user.penaltyGoals}/${user.penaltyAttempts}**`
    );
  }

  return message.reply(
    `🧤 **KALECİ KURTARDI!**\n\n` +
    `📊 Penaltı: **${user.penaltyGoals}/${user.penaltyAttempts}**`
  );
}

/* =========================================================
   PERSONAL BUDGET
   ========================================================= */

async function budgetAdd(message) {
  if (!isValueStaff(message.member)) {
    return message.reply("❌ Bu komutu sadece Değer Yetkilisi kullanabilir.");
  }

  const target = message.mentions.users.first();
  const amount = parseAmount(message.content.split(/\s+/)[2]);

  if (!target || !Number.isFinite(amount)) {
    return message.reply(
      "❌ Kullanım: `.bütçeekle @oyuncu 5M`"
    );
  }

  const user = ensureUser(target.id);

  user.budget =
    Number(user.budget) + amount;

  saveData();

  return message.reply(
    `💰 <@${target.id}> kişisine **${formatValue(amount)}** bütçe eklendi.\n` +
    `💳 Yeni kişisel bütçe: **${formatValue(user.budget)}**`
  );
}

async function budgetRemove(message) {
  if (!isValueStaff(message.member)) {
    return message.reply("❌ Bu komutu sadece Değer Yetkilisi kullanabilir.");
  }

  const target = message.mentions.users.first();
  const amount = parseAmount(message.content.split(/\s+/)[2]);

  if (!target || !Number.isFinite(amount)) {
    return message.reply(
      "❌ Kullanım: `.bütçesil @oyuncu 5M`"
    );
  }

  const user = ensureUser(target.id);

  user.budget =
    Math.max(0, Number(user.budget) - amount);

  saveData();

  return message.reply(
    `💰 <@${target.id}> kişisinden **${formatValue(amount)}** bütçe silindi.\n` +
    `💳 Yeni kişisel bütçe: **${formatValue(user.budget)}**`
  );
}

async function budgetTransfer(message) {
  const target = message.mentions.users.first();
  const amount = parseAmount(message.content.split(/\s+/)[2]);

  if (!target || !Number.isFinite(amount)) {
    return message.reply(
      "❌ Kullanım: `.gönder @oyuncu 5M`"
    );
  }

  if (target.id === message.author.id) {
    return message.reply(
      "❌ Kendine bütçe gönderemezsin."
    );
  }

  const sender = ensureUser(message.author.id);
  const receiver = ensureUser(target.id);

  if (Number(sender.budget) < amount) {
    return message.reply(
      `❌ Yeterli bütçen yok.\n` +
      `💳 Mevcut bütçe: **${formatValue(sender.budget)}**`
    );
  }

  sender.budget -= amount;
  receiver.budget += amount;

  saveData();

  return message.reply(
    `💸 **Bütçe transferi tamamlandı!**\n\n` +
    `👤 Gönderen: <@${message.author.id}>\n` +
    `👤 Alıcı: <@${target.id}>\n` +
    `💰 Miktar: **${formatValue(amount)}**`
  );
}

/* =========================================================
   VALUE COMMANDS
   ========================================================= */

async function valueCommand(message, command) {
  if (!isValueStaff(message.member)) {
    return message.reply(
      "❌ Bu komutu sadece Değer Yetkilisi kullanabilir."
    );
  }

  if (!channelOnly(message, IDS.channels.value)) {
    return message.reply(
      "❌ Bu komut sadece değer kanalında kullanılabilir."
    );
  }

  const target = message.mentions.users.first();

  const tokens =
    message.content.trim().split(/\s+/);

  const amount =
    parseAmount(tokens[tokens.length - 1]);

  if (!target || !Number.isFinite(amount)) {
    return message.reply(
      `❌ Kullanım: \`.${command} @oyuncu 5M\``
    );
  }

  const member =
    await fetchMember(message.guild, target.id);

  if (!member) {
    return message.reply(
      "❌ Oyuncu bulunamadı."
    );
  }

  const delta =
    command === "dver"
      ? amount
      : -amount;

  const result =
    await changePlayerValue(
      member,
      delta,
      command
    );

  return message.reply(
    `✅ <@${target.id}> yeni değeri: **${formatValue(result.newValue)}**`
  );
}

/* =========================================================
   REGISTRATION PANEL
   ========================================================= */

async function createRegistrationPanel(
  message,
  target,
  nickname
) {
  const panel = await message.channel.send({
    embeds: [
      embed(
        "📋 AXERA LEAGUE KAYIT",
        `👤 Oyuncu: ${target}\n` +
        `🏷️ İsim: **${nickname}**\n\n` +
        `Aşağıdaki butonlardan uygun rolü seçin.\n\n` +
        `⚽ Futbolcu\n` +
        `👤 Üye\n` +
        `🧑‍💼 Teknik Direktör\n` +
        `🧤 Kaleci\n\n` +
        `İşlemi iptal etmek için **❌ İptal Et** butonuna basın.`
      )
    ],
    components: []
  });

  db.registrationPanels[panel.id] = {
    userId: target.id,
    nickname
  };

  await panel.edit({
    components: registrationButtons(panel.id)
  });

  saveData();

  return panel;
}

/* =========================================================
   SEARCH COMMAND
   ========================================================= */

async function searchCommand(message) {
  const text =
    message.content
      .slice(PREFIX.length)
      .trim();

  const parts =
    text.split(/\s+/);

  const sub =
    normalizeName(parts[1] || "");

  if (!sub) {
    return message.reply(
      "❌ Kullanım: `.ara oyuncu`"
    );
  }

  if (sub !== "oyuncu") {
    return message.reply(
      "❌ Kullanım: `.ara oyuncu isim`"
    );
  }

  const query =
    parts.slice(2).join(" ").trim();

  if (!query) {
    return message.reply(
      "🔎 Aramak istediğin oyuncu adını yaz.\n" +
      "Örnek: `.ara oyuncu takmadı`"
    );
  }

  const results =
    await searchPlayer(
      message.guild,
      query
    );

  if (!results.length) {
    return message.reply({
      embeds: [
        embed(
          "🔎 OYUNCU BULUNAMADI",
          `**${query}** adıyla kayıtlı oyuncu bulunamadı.`,
          0xed4245
        )
      ]
    });
  }

  const description =
    results.map(item =>
      `👤 **${item.data.name}**\n` +
      `Discord: ${item.member}\n` +
      `💰 Değer: **${formatValue(item.data.value)}**`
    ).join("\n\n");

  return message.reply({
    embeds: [
      embed(
        "🔎 OYUNCU ARAMA",
        description
      )
    ]
  });
}

/* =========================================================
   PROFIL
   ========================================================= */

async function profileCommand(message) {
  const target =
    message.mentions.users.first() ||
    message.author;

  const user =
    ensureUser(target.id);

  if (!user.registered) {
    return message.reply(
      "❌ Bu oyuncu kayıtlı değil."
    );
  }

  return message.reply({
    embeds: [
      embed(
        `⚽ ${user.name}`,
        `👤 Oyuncu: <@${target.id}>\n` +
        `🌍 Ülke: ${user.country}\n` +
        `📍 Mevki: **${user.position}**\n` +
        `💰 Değer: **${formatValue(user.value)}**\n` +
        `💳 Kişisel bütçe: **${formatValue(user.budget)}**\n\n` +
        `⚽ Goller: **${user.goals}**\n` +
        `👟 Asistler: **${user.assists}**\n` +
        `🏋️ Antrenman: **${user.training}/5**\n` +
        `🥅 Penaltı: **${user.penaltyGoals}/${user.penaltyAttempts}**\n\n` +
        `🏟️ Maç: **${user.matches}**\n` +
        `✅ Galibiyet: **${user.wins}**\n` +
        `➖ Beraberlik: **${user.draws}**\n` +
        `❌ Mağlubiyet: **${user.losses}**`
      )
    ]
  });
}

/* =========================================================
   TEAM SYSTEM
   ========================================================= */

function getTeamByMention(message, index = 0) {
  const role =
    message.mentions.roles.at(index);

  if (!role) return null;

  const teamName =
    Object.entries(IDS.teams)
      .find(([, id]) => id === role.id)?.[0];

  if (!teamName) return null;

  return {
    id: role.id,
    name: teamName
  };
}

function ensureAllTeams() {
  for (const [name, id] of Object.entries(IDS.teams)) {
    ensureTeam(id, name);
  }

  saveData();
}

function teamSquad(teamId) {
  const team =
    db.teams[teamId];

  if (!team) return [];

  return Object.entries(team.squad || {});
}

async function squadAdd(message) {
  if (!isSpeaker(message.member)) {
    return message.reply("❌ Kadro yetkin yok.");
  }

  const team =
    getTeamByMention(message, 0);

  const player =
    message.mentions.users.at(1);

  const position =
    message.content
      .split(/\s+/)
      .slice(3)
      .join(" ")
      .trim();

  if (!team || !player || !position) {
    return message.reply(
      "❌ Kullanım: `.kadroekle @Takım @Oyuncu Pozisyon`"
    );
  }

  const data =
    ensureTeam(team.id, team.name);

  data.squad[player.id] = {
    position
  };

  saveData();

  return message.reply(
    `✅ <@${player.id}> oyuncusu **${team.name}** kadrosuna eklendi.\n` +
    `📍 Pozisyon: **${position}**`
  );
}

async function squadRemove(message) {
  if (!isSpeaker(message.member)) {
    return message.reply("❌ Kadro yetkin yok.");
  }

  const team =
    getTeamByMention(message, 0);

  const player =
    message.mentions.users.at(1);

  if (!team || !player) {
    return message.reply(
      "❌ Kullanım: `.kadrocikar @Takım @Oyuncu`"
    );
  }

  const data =
    ensureTeam(team.id, team.name);

  delete data.squad[player.id];

  saveData();

  return message.reply(
    `✅ <@${player.id}> **${team.name}** kadrosundan çıkarıldı.`
  );
}

async function squadList(message) {
  const team =
    getTeamByMention(message, 0);

  if (!team) {
    return message.reply(
      "❌ Kullanım: `.kadro @Takım`"
    );
  }

  const data =
    ensureTeam(team.id, team.name);

  const entries =
    Object.entries(data.squad || {});

  if (!entries.length) {
    return message.reply(
      `📋 **${team.name}** kadrosu boş.`
    );
  }

  const text =
    entries.map(([id, info], index) =>
      `${index + 1}. <@${id}> — **${info.position}**`
    ).join("\n");

  return message.reply({
    embeds: [
      embed(
        `📋 ${team.name} KADROSU`,
        text
      )
    ]
  });
}

async function formationCommand(message) {
  if (!isSpeaker(message.member)) {
    return message.reply("❌ Formasyon yetkin yok.");
  }

  const team =
    getTeamByMention(message, 0);

  if (!team) {
    return message.reply(
      "❌ Kullanım: `.formasyon @Takım`"
    );
  }

  const menu =
    new StringSelectMenuBuilder()
      .setCustomId(`formation:${team.id}`)
      .setPlaceholder("Formasyon seç")
      .addOptions(
        "4-4-2",
        "4-3-3",
        "4-2-3-1",
        "3-5-2",
        "3-4-3",
        "4-3-1-2",
        "4-2-2-2",
        "5-3-2"
      .map(value => ({
        label: value,
        value
      })));

  return message.channel.send({
    embeds: [
      embed(
        "⚽ FORMASYON",
        `Takım: **${team.name}**\n\nFormasyon seçiniz.`
      )
    ],
    components: [
      new ActionRowBuilder().addComponents(menu)
    ]
  });
}

/* =========================================================
   STANDINGS
   ========================================================= */

function sortStandings() {
  return Object.values(db.teams)
    .filter(team => team.active !== false)
    .sort((a, b) => {
      if (b.points !== a.points)
        return b.points - a.points;

      const gdA =
        a.goalsFor - a.goalsAgainst;

      const gdB =
        b.goalsFor - b.goalsAgainst;

      if (gdB !== gdA)
        return gdB - gdA;

      return b.goalsFor - a.goalsFor;
    });
}

async function standingsCommand(message) {
  ensureAllTeams();

  const rows =
    sortStandings();

  const text =
    rows.map((team, i) => {
      const gd =
        team.goalsFor -
        team.goalsAgainst;

      return (
        `**${i + 1}. ${team.name}**\n` +
        `🏟️ ${team.played} maç • ` +
        `🏆 ${team.points} puan • ` +
        `⚽ ${team.goalsFor}-${team.goalsAgainst} • ` +
        `📊 AV ${gd}`
      );
    }).join("\n\n");

  const channel =
    message.guild.channels.cache.get(
      IDS.channels.standings
    );

  if (channel) {
    await channel.send({
      embeds: [
        embed(
          "🏆 AXERA LEAGUE PUAN DURUMU",
          text
        )
      ]
    });
  }

  return message.reply(
    "✅ Puan durumu güncellendi."
  );
}

/* =========================================================
   MATCH ENGINE
   ========================================================= */

function getTeamPlayers(team) {
  const players =
    Object.keys(team.squad || {});

  return players;
}

function randomPlayer(team) {
  const players =
    getTeamPlayers(team);

  if (!players.length) {
    return null;
  }

  return players[
    Math.floor(
      Math.random() * players.length
    )
  ];
}

async function rewardMatchPlayer(
  guild,
  userId,
  amount
) {
  const member =
    await fetchMember(
      guild,
      userId
    );

  if (!member) return;

  await changePlayerValue(
    member,
    amount,
    "Maç ödülü"
  );
}

async function startMatch(
  guild,
  teamAId,
  teamBId,
  fixtureId = null
) {
  const teamA =
    db.teams[teamAId];

  const teamB =
    db.teams[teamBId];

  if (!teamA || !teamB) {
    return null;
  }

  const channel =
    guild.channels.cache.get(
      IDS.channels.match
    );

  if (!channel) return null;

  const matchId =
    `${Date.now()}_${teamAId}_${teamBId}`;

  const match = {
    id: matchId,
    fixtureId,
    teamA: teamAId,
    teamB: teamBId,
    scoreA: 0,
    scoreB: 0,
    minute: 0,
    startedAt: Date.now(),
    participants: {
      [teamAId]: new Set(getTeamPlayers(teamA)),
      [teamBId]: new Set(getTeamPlayers(teamB))
    },
    scorerIds: [],
    assistIds: [],
    finished: false
  };

  db.activeMatches[matchId] = {
    id: matchId,
    fixtureId,
    teamA: teamAId,
    teamB: teamBId,
    scoreA: 0,
    scoreB: 0,
    minute: 0,
    startedAt: Date.now(),
    scorerIds: [],
    assistIds: []
  };

  saveData();

  const matchMessage =
    await channel.send({
      embeds: [
        embed(
          "⚽ AXERA LEAGUE — MAÇ BAŞLADI",
          `${teamA.name} **0 - 0** ${teamB.name}\n\n` +
          `⏱️ Dakika: **0/90**\n` +
          `🏟️ Saha: **100 metre**`
        )
      ]
    });

  const interval =
    setInterval(async () => {
      const active =
        db.activeMatches[matchId];

      if (!active) {
        clearInterval(interval);
        return;
      }

      active.minute += 1;

      const chance =
        Math.random();

      let commentary =
        "🔄 Orta saha mücadelesi devam ediyor.";

      if (chance < 0.08) {
        const attackingTeam =
          Math.random() < 0.5
            ? teamA
            : teamB;

        const scoringTeamIsA =
          attackingTeam.id === teamA.id;

        if (Math.random() < 0.35) {
          if (scoringTeamIsA)
            active.scoreA++;
          else
            active.scoreB++;

          const scorer =
            randomPlayer(attackingTeam);

          if (scorer) {
            active.scorerIds.push(scorer);

            const scorerMember =
              await fetchMember(
                guild,
                scorer
              );

            if (scorerMember) {
              const user =
                ensureUser(scorer);

              user.goals =
                Number(user.goals) + 1;

              saveData();

              await changePlayerValue(
                scorerMember,
                2,
                "Maç golü"
              );
            }
          }

          commentary =
            `⚽ **GOOOL!** ${attackingTeam.name} öne geçti!`;
        } else {
          commentary =
            `🥅 ${attackingTeam.name} tehlikeli bir şut çekti!`;
        }
      } else if (chance < 0.20) {
        commentary =
          "🧤 Kaleci kritik bir kurtarış yaptı!";
      } else if (chance < 0.32) {
        commentary =
          "⚡ Hızlı bir kontra atak gelişiyor!";
      } else if (chance < 0.43) {
        commentary =
          "🎯 Ceza sahasına tehlikeli orta gönderildi!";
      } else if (chance < 0.52) {
        commentary =
          "🟨 Sert müdahale sonrası hakem faul verdi.";
      }

      await matchMessage.edit({
        embeds: [
          embed(
            "⚽ AXERA LEAGUE — CANLI MAÇ",
            `${teamA.name} **${active.scoreA} - ${active.scoreB}** ${teamB.name}\n\n` +
            `⏱️ Dakika: **${active.minute}/90**\n\n` +
            `${commentary}`
          )
        ]
      }).catch(() => {});

      if (active.minute >= 90) {
        clearInterval(interval);

        await finishMatch(
          guild,
          matchId,
          matchMessage
        );
      }
    }, 3000);

  return matchId;
}

async function finishMatch(
  guild,
  matchId,
  matchMessage
) {
  const match =
    db.activeMatches[matchId];

  if (!match) return;

  const teamA =
    db.teams[match.teamA];

  const teamB =
    db.teams[match.teamB];

  const scoreA =
    Number(match.scoreA);

  const scoreB =
    Number(match.scoreB);

  teamA.played++;
  teamB.played++;

  teamA.goalsFor += scoreA;
  teamA.goalsAgainst += scoreB;

  teamB.goalsFor += scoreB;
  teamB.goalsAgainst += scoreA;

  if (scoreA > scoreB) {
    teamA.wins++;
    teamB.losses++;
    teamA.points += 3;
  } else if (scoreB > scoreA) {
    teamB.wins++;
    teamA.losses++;
    teamB.points += 3;
  } else {
    teamA.draws++;
    teamB.draws++;
    teamA.points++;
    teamB.points++;
  }

  const rewardKey =
    `${matchId}:participants`;

  if (!db.matchRewards[rewardKey]) {
    db.matchRewards[rewardKey] = true;

    const participants = [
      ...Object.keys(teamA.squad || {}),
      ...Object.keys(teamB.squad || {})
    ];

    const unique =
      [...new Set(participants)];

    for (const userId of unique) {
      await rewardMatchPlayer(
        guild,
        userId,
        5
      );

      const user =
        ensureUser(userId);

      user.matches++;

      if (scoreA === scoreB)
        user.draws++;
      else {
        const isA =
          teamA.squad[userId];

        if (
          (isA && scoreA > scoreB) ||
          (!isA && scoreB > scoreA)
        ) {
          user.wins++;
        } else {
          user.losses++;
        }
      }
    }
  }

  db.matchHistory[matchId] = {
    teamA: match.teamA,
    teamB: match.teamB,
    scoreA,
    scoreB,
    date: Date.now()
  };

  delete db.activeMatches[matchId];

  saveData();

  await matchMessage.edit({
    embeds: [
      embed(
        "🏁 MAÇ SONA ERDİ",
        `${teamA.name} **${scoreA} - ${scoreB}** ${teamB.name}\n\n` +
        `💰 Katılan oyunculara **+5M€** verildi.\n` +
        `📊 Puan durumu güncellendi.`,
        0x57f287
      )
    ]
  }).catch(() => {});

  await publishStandings(guild);
}

async function publishStandings(guild) {
  const channel =
    guild.channels.cache.get(
      IDS.channels.standings
    );

  if (!channel) return;

  const rows =
    sortStandings();

  const text =
    rows.map((team, i) =>
      `**${i + 1}. ${team.name}** — ` +
      `🏆 ${team.points} puan | ` +
      `⚽ ${team.goalsFor}:${team.goalsAgainst}`
    ).join("\n");

  await channel.send({
    embeds: [
      embed(
        "🏆 GÜNCEL PUAN DURUMU",
        text
      )
    ]
  }).catch(() => {});
}

/* =========================================================
   FIXTURE
   ========================================================= */

function parseFixtureDate(dateText, timeText) {
  const match =
    String(dateText).match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

  const time =
    String(timeText).match(
      /^(\d{2}):(\d{2})$/
    );

  if (!match || !time) {
    return null;
  }

  const year =
    Number(match[1]);

  const month =
    Number(match[2]);

  const day =
    Number(match[3]);

  const hour =
    Number(time[1]);

  const minute =
    Number(time[2]);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return new Date(
    year,
    month - 1,
    day,
    hour,
    minute,
    0
  ).getTime();
}

async function addFixture(message) {
  if (!isSpeaker(message.member)) {
    return message.reply(
      "❌ Fikstür yetkin yok."
    );
  }

  const teamA =
    getTeamByMention(message, 0);

  const teamB =
    getTeamByMention(message, 1);

  const tokens =
    message.content.split(/\s+/);

  const date =
    tokens[tokens.length - 2];

  const time =
    tokens[tokens.length - 1];

  const timestamp =
    parseFixtureDate(date, time);

  if (
    !teamA ||
    !teamB ||
    !timestamp
  ) {
    return message.reply(
      "❌ Kullanım: `.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`"
    );
  }

  const fixture = {
    id: db.nextFixtureId++,
    teamA: teamA.id,
    teamB: teamB.id,
    timestamp,
    started: false
  };

  db.fixtures.push(fixture);

  saveData();

  return message.reply(
    `📅 Fikstüre eklendi!\n\n` +
    `⚽ ${teamA.name} 🆚 ${teamB.name}\n` +
    `🕐 ${new Date(timestamp).toLocaleString("tr-TR")}`
  );
}

async function listFixtures(message) {
  const list =
    db.fixtures
      .filter(x => !x.started)
      .sort((a, b) =>
        a.timestamp - b.timestamp
      );

  if (!list.length) {
    return message.reply(
      "📅 Bekleyen fikstür bulunmuyor."
    );
  }

  const text =
    list.map(fixture => {
      const a =
        db.teams[fixture.teamA];

      const b =
        db.teams[fixture.teamB];

      return (
        `🆔 **${fixture.id}**\n` +
        `⚽ ${a?.name || "Takım"} 🆚 ${b?.name || "Takım"}\n` +
        `🕐 ${new Date(fixture.timestamp).toLocaleString("tr-TR")}`
      );
    }).join("\n\n");

  return message.reply({
    embeds: [
      embed(
        "📅 AXERA LEAGUE FİKSTÜRÜ",
        text
      )
    ]
  });
}

async function removeFixture(message) {
  if (!isSpeaker(message.member)) {
    return message.reply(
      "❌ Fikstür yetkin yok."
    );
  }

  const teamA =
    getTeamByMention(message, 0);

  const teamB =
    getTeamByMention(message, 1);

  if (!teamA || !teamB) {
    return message.reply(
      "❌ Kullanım: `.fiksturcikar @Takım1 @Takım2`"
    );
  }

  const before =
    db.fixtures.length;

  db.fixtures =
    db.fixtures.filter(f =>
      !(
        f.teamA === teamA.id &&
        f.teamB === teamB.id
      )
    );

  saveData();

  return message.reply(
    before === db.fixtures.length
      ? "❌ Bu maç fikstürde bulunamadı."
      : "✅ Fikstür maçı kaldırıldı."
  );
}

/* =========================================================
   CUP / MUSEUM
   ========================================================= */

async function cupAdd(message) {
  if (!isSpeaker(message.member)) {
    return message.reply("❌ Kupa yetkin yok.");
  }

  const team =
    getTeamByMention(message, 0);

  const cupName =
    message.content
      .split(/\s+/)
      .slice(2)
      .join(" ")
      .trim();

  if (!team || !cupName) {
    return message.reply(
      "❌ Kullanım: `.kupaekle @Takım Kupa Adı`"
    );
  }

  if (!db.cups[team.id]) {
    db.cups[team.id] = [];
  }

  db.cups[team.id].push(cupName);

  saveData();

  return message.reply(
    `🏆 **${team.name}** müzesine **${cupName}** eklendi.`
  );
}

async function cupRemove(message) {
  if (!isSpeaker(message.member)) {
    return message.reply("❌ Kupa yetkin yok.");
  }

  const team =
    getTeamByMention(message, 0);

  const cupName =
    message.content
      .split(/\s+/)
      .slice(2)
      .join(" ")
      .trim();

  if (!team || !cupName) {
    return message.reply(
      "❌ Kullanım: `.kupasil @Takım Kupa Adı`"
    );
  }

  const list =
    db.cups[team.id] || [];

  db.cups[team.id] =
    list.filter(x =>
      normalizeName(x) !==
      normalizeName(cupName)
    );

  saveData();

  return message.reply(
    `🗑️ **${cupName}** kupası kaldırıldı.`
  );
}

async function museumCommand(message) {
  const team =
    getTeamByMention(message, 0);

  if (!team) {
    return message.reply(
      "❌ Kullanım: `.müze @Takım`"
    );
  }

  const cups =
    db.cups[team.id] || [];

  return message.reply({
    embeds: [
      embed(
        `🏛️ ${team.name} MÜZESİ`,
        cups.length
          ? cups.map((x, i) =>
              `🏆 ${i + 1}. ${x}`
            ).join("\n")
          : "Müze şu anda boş."
      )
    ]
  });
}

/* =========================================================
   GOAL / ASSIST RANKING
   ========================================================= */

function topPlayers(field) {
  return Object.entries(db.users)
    .filter(([, user]) =>
      user.registered
    )
    .sort((a, b) =>
      Number(b[1][field] || 0) -
      Number(a[1][field] || 0)
    )
    .slice(0, 10);
}

async function goalsRanking(message) {
  const rows =
    topPlayers("goals");

  if (!rows.length) {
    return message.reply(
      "📭 Henüz gol istatistiği yok."
    );
  }

  const text =
    rows.map(([id, user], i) =>
      `**${i + 1}.** <@${id}> — ⚽ **${user.goals}**`
    ).join("\n");

  return message.reply({
    embeds: [
      embed(
        "👑 GOL KRALLIĞI",
        text
      )
    ]
  });
}

async function assistsRanking(message) {
  const rows =
    topPlayers("assists");

  if (!rows.length) {
    return message.reply(
      "📭 Henüz asist istatistiği yok."
    );
  }

  const text =
    rows.map(([id, user], i) =>
      `**${i + 1}.** <@${id}> — 👟 **${user.assists}**`
    ).join("\n");

  return message.reply({
    embeds: [
      embed(
        "👟 ASİST KRALLIĞI",
        text
      )
    ]
  });
}

/* =========================================================
   TWEET
   ========================================================= */

async function tweetCommand(message) {
  if (!channelOnly(message, IDS.channels.tweet)) {
    return message.reply(
      "❌ `.tweet` sadece tweet kanalında kullanılabilir."
    );
  }

  const content =
    message.content
      .slice(PREFIX.length)
      .trim()
      .split(/\s+/)
      .slice(1)
      .join(" ")
      .trim();

  if (!content) {
    return message.reply(
      "❌ Tweet metni yaz."
    );
  }

  const now =
    Date.now();

  const last =
    db.tweetCooldowns[message.author.id] || 0;

  if (now - last < 24 * 60 * 60 * 1000) {
    const hours =
      Math.ceil(
        (24 * 60 * 60 * 1000 -
          (now - last)) /
        (60 * 60 * 1000)
      );

    return message.reply(
      `⏳ Yeni tweet için **${hours} saat** beklemelisin.`
    );
  }

  db.tweetCooldowns[message.author.id] =
    now;

  saveData();

  await message.delete().catch(() => {});

  const member =
    await fetchMember(
      message.guild,
      message.author.id
    );

  if (member) {
    await changePlayerValue(
      member,
      5,
      "Tweet ödülü"
    );
  }

  return message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x1da1f2)
        .setAuthor({
          name:
            member?.displayName ||
            message.author.username,
          iconURL:
            message.author.displayAvatarURL()
        })
        .setDescription(content)
        .setFooter({
          text: "Axera League Tweet"
        })
        .setTimestamp()
    ]
  });
}

/* =========================================================
   ROLE PANEL
   ========================================================= */

async function rolePanel(message) {
  if (!isAdmin(message.member)) {
    return message.reply(
      "❌ Bu paneli sadece yönetici oluşturabilir."
    );
  }

  const buttons = [
    [
      IDS.roles.partnerPing,
      "🤝 Partner Ping",
      ButtonStyle.Primary
    ],
    [
      IDS.roles.matchPing,
      "⚽ Maç Ping",
      ButtonStyle.Primary
    ],
    [
      IDS.roles.announcementPing,
      "📢 Duyuru Ping",
      ButtonStyle.Primary
    ],
    [
      IDS.roles.giveawayPing,
      "🎁 Çekiliş Ping",
      ButtonStyle.Primary
    ],
    [
      IDS.roles.mediaPing,
      "🎥 Medya Ping",
      ButtonStyle.Primary
    ]
  ];

  const rows = [];

  let row =
    new ActionRowBuilder();

  for (let i = 0; i < buttons.length; i++) {
    const [roleId, label, style] =
      buttons[i];

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`pingrole:${roleId}`)
        .setLabel(label)
        .setStyle(style)
    );

    if (
      row.components.length === 5 ||
      i === buttons.length - 1
    ) {
      rows.push(row);
      row =
        new ActionRowBuilder();
    }
  }

  return message.channel.send({
    embeds: [
      embed(
        "🔔 BİLDİRİM ROLLERİ",
        "İstediğin bildirim rollerini aşağıdaki butonlardan açıp kapatabilirsin."
      )
    ],
    components: rows
  });
}

/* =========================================================
   TICKET
   ========================================================= */

async function ticketPanel(message) {
  if (!isAdmin(message.member)) {
    return message.reply(
      "❌ Ticket panelini sadece yönetici oluşturabilir."
    );
  }

  return message.channel.send({
    embeds: [
      embed(
        "🎫 DESTEK MERKEZİ",
        "Destek almak için aşağıdaki butona basarak özel destek kanalı oluşturabilirsin."
      )
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("ticket:create")
          .setLabel("🎫 Destek Talebi Oluştur")
          .setStyle(ButtonStyle.Primary)
      )
    ]
  });
}

/* =========================================================
   CONDITIONS
   ========================================================= */

async function conditionsCommand(message) {
  return message.reply({
    embeds: [
      embed(
        "📜 AXERA LEAGUE ŞARTLARI",
        "✓ Kalıcı Tık: Kalıcı 「✓」 kanalına tıklayınız.\n\n" +
        "🎭 Rol Al: Rol Al kanalından en az 2 rol alınız.\n\n" +
        "ℹ️ Bu şartlar sistemlerin kullanılmasını zorunlu olarak engellemez."
      )
    ]
  });
}

/* =========================================================
   STATUS
   ========================================================= */

async function statusMessage() {
  if (!client.user) return;

  const now =
    new Date();

  const minute =
    now.getMinutes();

  if (
    minute !== 0 &&
    minute !== 30
  ) {
    return;
  }

  const key =
    `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${minute}`;

  if (db.lastStatusKey === key) {
    return;
  }

  db.lastStatusKey = key;
  saveData();

  for (const guild of client.guilds.cache.values()) {
    const channel =
      guild.channels.cache.get(
        IDS.channels.status
      );

    if (!channel) continue;

    const messages =
      await channel.messages
        .fetch({ limit: 100 })
        .catch(() => null);

    if (messages) {
      for (const msg of messages.values()) {
        if (
          msg.author.id ===
          client.user.id
        ) {
          await msg.delete().catch(() => {});
        }
      }
    }

    const uptimeHours =
      (
        process.uptime() /
        3600
      ).toFixed(2);

    await channel.send({
      embeds: [
        embed(
          "🤖 AXERA BOT DURUM",
          `🟢 **Tüm sistemler sorunsuz çalışıyor.**\n\n` +
          `⏱️ Uptime: **${uptimeHours} saat**\n` +
          `📡 Ping: **${client.ws.ping}ms**\n` +
          `🌐 Sunucu: **${client.guilds.cache.size}**\n` +
          `⚙️ Komut sayısı: **${db.commandCount}**\n` +
          `🕐 ${now.toLocaleString("tr-TR")}`,
          0x57f287
        )
      ]
    }).catch(() => {});
  }
}

/* =========================================================
   AI
   ========================================================= */

const AI_INSTRUCTIONS = `
Sen Axera isimli Discord sunucu asistanısın.
Sunucunun adı Axera League.

Kısa, hızlı, Türkçe ve doğal cevaplar ver.
Gereksiz uzun cevaplar verme.

Kullanıcı "yapay zeka altyapısı", "yapayzeka altyapısı",
"AI altyapın ne", "hangi altyapıyı kullanıyorsun"
gibi Axera'nın yapay zeka altyapısını sorarsa:
"Axera League" de.

Kullanıcı "seni kim kurdu", "kim yaptı", "kurucun kim"
gibi sorarsa tam olarak:
"Lynox9380 kurdu."
de.

Discord sunucusunda yönetici işlemleri, rol verme,
banlama, kanal silme gibi işlemleri kendin gerçekleştirme.
Bunlar yalnızca botun açık Discord komutlarıyla yapılabilir.

Kullanıcıya kısa ve yardımcı cevaplar ver.
`;

async function askAI(message) {
  if (!openai) {
    return message.reply(
      "❌ Yapay zekâ şu anda yapılandırılmamış. Railway Variables kısmına OPENAI_API_KEY eklenmeli."
    );
  }

  const content =
    message.content
      .trim()
      .replace(/^\.?(ai|yapayzeka)\s*/i, "")
      .trim();

  if (!content) {
    return message.reply(
      "🤖 Ben **Axera**. Sana nasıl yardımcı olabilirim?"
    );
  }

  const normalized =
    normalizeName(content);

  if (
    normalized.includes("yapayzeka altyapısı") ||
    normalized.includes("yapay zeka altyapısı") ||
    normalized.includes("ai altyapın")
  ) {
    return message.reply(
      "🤖 **Axera League**."
    );
  }

  if (
    normalized.includes("seni kim kurdu") ||
    normalized.includes("kim kurdu")
  ) {
    return message.reply(
      "Lynox9380 kurdu."
    );
  }

  const key =
    `${message.guild.id}:${message.author.id}`;

  const now =
    Date.now();

  const last =
    db.aiCooldowns[key] || 0;

  /*
    Çok kısa bir koruma:
    aynı kullanıcının aynı anda API'ye
    çok fazla istek göndermesini engeller.
  */
  if (now - last < 700) {
    return;
  }

  db.aiCooldowns[key] = now;

  try {
    const response =
      await openai.responses.create({
        model: OPENAI_MODEL,
        instructions: AI_INSTRUCTIONS,
        input: content,
        max_output_tokens: 350
      });

    const answer =
      String(
        response.output_text || ""
      ).trim();

    if (!answer) {
      return message.reply(
        "🤖 Şu anda cevap oluşturamadım."
      );
    }

    return message.reply(
      answer.slice(0, 1900)
    );
  } catch (error) {
    console.error("OPENAI ERROR:", error);

    return message.reply(
      "❌ Yapay zekâya bağlanırken bir hata oluştu."
    );
  }
}

/* =========================================================
   BUTTONS
   ========================================================= */

client.on(
  "interactionCreate",
  async interaction => {
    try {
      /* ---------- REGISTRATION ---------- */

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "register:"
        )
      ) {
        const parts =
          interaction.customId.split(":");

        const type =
          parts[1];

        const panelId =
          parts[2];

        const pending =
          db.registrationPanels[panelId];

        if (!pending) {
          return interaction.reply({
            content:
              "❌ Bu kayıt paneli artık geçerli değil.",
            ephemeral: true
          });
        }

        if (
          !isRegisterStaff(
            interaction.member
          )
        ) {
          return interaction.reply({
            content:
              "❌ Bu paneli sadece Kayıt Yetkilisi kullanabilir.",
            ephemeral: true
          });
        }

        if (type === "cancel") {
          delete db.registrationPanels[panelId];
          saveData();

          await interaction.update({
            embeds: [
              embed(
                "❌ KAYIT İPTAL EDİLDİ",
                `👤 <@${pending.userId}>\n\nKayıt işlemi iptal edildi.`,
                0xed4245
              )
            ],
            components: []
          });

          return;
        }

        const member =
          await fetchMember(
            interaction.guild,
            pending.userId
          );

        if (!member) {
          return interaction.reply({
            content:
              "❌ Oyuncu sunucuda bulunamadı.",
            ephemeral: true
          });
        }

        const roleName =
          await registerPlayer(
            member,
            type,
            pending.nickname
          );

        delete db.registrationPanels[panelId];
        saveData();

        await interaction.update({
          embeds: [
            embed(
              "✅ KAYIT TAMAMLANDI",
              `👤 Oyuncu: ${member}\n` +
              `🏷️ İsim: **${pending.nickname}**\n` +
              `🎭 Rol: **${roleName}**`,
              0x57f287
            )
          ],
          components: []
        });

        return;
      }

      /* ---------- ROLE PANEL ---------- */

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "pingrole:"
        )
      ) {
        const roleId =
          interaction.customId.split(":")[1];

        const member =
          interaction.member;

        if (
          member.roles.cache.has(roleId)
        ) {
          await member.roles.remove(
            roleId
          );

          return interaction.reply({
            content:
              "🔕 Bildirim rolü kaldırıldı.",
            ephemeral: true
          });
        }

        await member.roles.add(
          roleId
        );

        return interaction.reply({
          content:
            "🔔 Bildirim rolü eklendi.",
          ephemeral: true
        });
      }

      /* ---------- TICKET CREATE ---------- */

      if (
        interaction.isButton() &&
        interaction.customId ===
          "ticket:create"
      ) {
        const guild =
          interaction.guild;

        const existing =
          guild.channels.cache.find(
            channel =>
              channel.name ===
              `ticket-${interaction.user.id}`
          );

        if (existing) {
          return interaction.reply({
            content:
              `❌ Zaten açık ticketın var: ${existing}`,
            ephemeral: true
          });
        }

        const ticket =
          await guild.channels.create({
            name:
              `ticket-${interaction.user.username}`
                .toLowerCase()
                .replace(/[^a-z0-9-]/g, "")
                .slice(0, 80) ||
              `ticket-${interaction.user.id}`,
            type:
              ChannelType.GuildText,
            permissionOverwrites: [
              {
                id:
                  guild.roles.everyone.id,
                deny: [
                  PermissionsBitField.Flags.ViewChannel
                ]
              },
              {
                id:
                  interaction.user.id,
                allow: [
                  PermissionsBitField.Flags.ViewChannel,
                  PermissionsBitField.Flags.SendMessages,
                  PermissionsBitField.Flags.ReadMessageHistory
                ]
              },
              {
                id:
                  IDS.roles.moderator,
                allow: [
                  PermissionsBitField.Flags.ViewChannel,
                  PermissionsBitField.Flags.SendMessages,
                  PermissionsBitField.Flags.ReadMessageHistory
                ]
              }
            ]
          })
          .catch(() => null);

        if (!ticket) {
          return interaction.reply({
            content:
              "❌ Ticket oluşturulamadı.",
            ephemeral: true
          });
        }

        db.tickets[ticket.id] = {
          creatorId:
            interaction.user.id,
          lastMessage:
            Date.now()
        };

        saveData();

        await ticket.send({
          embeds: [
            embed(
              "🎫 DESTEK TALEBİ",
              `👤 Talep sahibi: ${interaction.user}\n\n` +
              `Yetkili en kısa sürede ilgilenecektir.\n` +
              `Ticket 60 dakika boyunca mesaj gelmezse otomatik kapanabilir.`
            )
          ],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(
                  "ticket:close"
                )
                .setLabel(
                  "🔒 Bileti Kapat"
                )
                .setStyle(
                  ButtonStyle.Danger
                )
            )
          ]
        });

        return interaction.reply({
          content:
            `✅ Ticket oluşturuldu: ${ticket}`,
          ephemeral: true
        });
      }

      /* ---------- TICKET CLOSE ---------- */

      if (
        interaction.isButton() &&
        interaction.customId ===
          "ticket:close"
      ) {
        if (
          !isModerator(
            interaction.member
          )
        ) {
          return interaction.reply({
            content:
              "❌ Sadece Moderatör/Yönetici ticket kapatabilir.",
            ephemeral: true
          });
        }

        delete db.tickets[
          interaction.channel.id
        ];

        saveData();

        await interaction.reply(
          "🔒 Bilet kapatılıyor..."
        );

        setTimeout(() => {
          interaction.channel
            .delete()
            .catch(() => {});
        }, 1200);

        return;
      }

      /* ---------- FORMATION ---------- */

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId.startsWith(
          "formation:"
        )
      ) {
        if (
          !isSpeaker(
            interaction.member
          )
        ) {
          return interaction.reply({
            content:
              "❌ Formasyon yetkin yok.",
            ephemeral: true
          });
        }

        const teamId =
          interaction.customId.split(":")[1];

        const value =
          interaction.values[0];

        db.formations[teamId] =
          value;

        saveData();

        return interaction.update({
          embeds: [
            embed(
              "✅ FORMASYON AYARLANDI",
              `⚽ Takım: <@&${teamId}>\n` +
              `📋 Formasyon: **${value}**`
            )
          ],
          components: []
        });
      }
    } catch (error) {
      console.error(
        "INTERACTION ERROR:",
        error
      );

      if (!interaction.replied) {
        await interaction.reply({
          content:
            "❌ İşlem sırasında bir hata oluştu.",
          ephemeral: true
        }).catch(() => {});
      }
    }
  }
);

/* =========================================================
   NEW MEMBER
   ========================================================= */

client.on(
  "guildMemberAdd",
  async member => {
    const unregistered =
      member.guild.roles.cache.get(
        IDS.roles.unregistered
      );

    if (unregistered) {
      await member.roles.add(
        unregistered
      ).catch(() => {});
    }

    const channel =
      member.guild.channels.cache.get(
        IDS.channels.register
      );

    if (channel) {
      await channel.send(
        `👋 Hoş geldin ${member}!\n\n` +
        `Kayıt işlemin için **Kayıt Yetkilisi** ile iletişime geçebilirsin.\n` +
        `<@&${IDS.roles.register}>`
      ).catch(() => {});
    }
  }
);

/* =========================================================
   MESSAGE CREATE
   ========================================================= */

client.on(
  "messageCreate",
  async message => {
    try {
      if (
        message.author.bot ||
        !message.guild
      ) {
        return;
      }

      /*
        AI KANALI:
        Normal mesajlar otomatik olarak AI'ya gider.
      */
      if (
        message.channel.id ===
        IDS.channels.ai &&
        !message.content.startsWith(PREFIX)
      ) {
        return askAI(message);
      }

      if (
        !message.content.startsWith(PREFIX)
      ) {
        /*
          Ticket aktivitesi
        */
        if (
          db.tickets[message.channel.id]
        ) {
          db.tickets[
            message.channel.id
          ].lastMessage =
            Date.now();

          saveData();
        }

        return;
      }

      db.commandCount++;

      const raw =
        message.content
          .slice(PREFIX.length)
          .trim();

      const args =
        raw.split(/\s+/);

      const cmd =
        (args.shift() || "")
          .toLocaleLowerCase("tr-TR");

      /* =====================================================
         REGISTRATION
         ===================================================== */

      if (
        cmd === "k"
      ) {
        if (
          !channelOnly(
            message,
            IDS.channels.register
          )
        ) {
          return message.reply(
            "❌ `.k` sadece kayıt kanalında kullanılabilir."
          );
        }

        if (
          !isRegisterStaff(
            message.member
          )
        ) {
          return message.reply(
            "❌ Bu komutu sadece Kayıt Yetkilisi kullanabilir."
          );
        }

        const target =
          message.mentions.users.first();

        const nickname =
          args
            .filter(
              x =>
                !x.startsWith("<@")
            )
            .join(" ")
            .trim();

        if (
          !target ||
          !nickname
        ) {
          return message.reply(
            "❌ Kullanım: `.k @oyuncu takmadı`"
          );
        }

        return createRegistrationPanel(
          message,
          target,
          nickname
        );
      }

      if (
        cmd === "kayıtsızver" ||
        cmd === "kayitsizver"
      ) {
        if (
          !isRegisterStaff(
            message.member
          )
        ) {
          return message.reply(
            "❌ Bu komutu sadece Kayıt Yetkilisi kullanabilir."
          );
        }

        const target =
          message.mentions.members.first();

        if (!target) {
          return message.reply(
            "❌ Kullanım: `.kayıtsızver @oyuncu`"
          );
        }

        const roles = [
          IDS.roles.player,
          IDS.roles.member,
          IDS.roles.td,
          IDS.roles.goalkeeper
        ];

        for (const roleId of roles) {
          await target.roles
            .remove(roleId)
            .catch(() => {});
        }

        await target.roles
          .add(IDS.roles.unregistered)
          .catch(() => {});

        const user =
          ensureUser(target.id);

        user.registered = false;

        saveData();

        return message.reply(
          `✅ ${target} **Kayıtsız** yapıldı.`
        );
      }

      /* =====================================================
         SEARCH
         ===================================================== */

      if (
        cmd === "ara"
      ) {
        return searchCommand(message);
      }

      /* =====================================================
         AI
         ===================================================== */

      if (
        cmd === "ai" ||
        cmd === "yapayzeka" ||
        cmd === "yapay"
      ) {
        if (
          message.channel.id !==
          IDS.channels.ai
        ) {
          return message.reply(
            `❌ Yapay zekâ komutları sadece <#${IDS.channels.ai}> kanalında kullanılabilir.`
          );
        }

        return askAI(message);
      }

      /* =====================================================
         TRAINING
         ===================================================== */

      if (
        cmd === "ant" ||
        cmd === "antrenman"
      ) {
        return runTraining(message);
      }

      /* =====================================================
         PENALTY
         ===================================================== */

      if (
        cmd === "pen" ||
        cmd === "penaltı" ||
        cmd === "penalti"
      ) {
        return runPenalty(message);
      }

      /* =====================================================
         VALUE
         ===================================================== */

      if (
        cmd === "dver" ||
        cmd === "dsil"
      ) {
        return valueCommand(
          message,
          cmd
        );
      }

      /* =====================================================
         BUDGET
         ===================================================== */

      if (
        cmd === "bütçeekle" ||
        cmd === "butceekle"
      ) {
        return budgetAdd(message);
      }

      if (
        cmd === "bütçesil" ||
        cmd === "butcesil"
      ) {
        return budgetRemove(message);
      }

      if (
        cmd === "gönder" ||
        cmd === "gonder"
      ) {
        return budgetTransfer(message);
      }

      if (
        cmd === "bütçe" ||
        cmd === "butce"
      ) {
        const target =
          message.mentions.users.first() ||
          message.author;

        const user =
          ensureUser(target.id);

        return message.reply(
          `💳 <@${target.id}> kişisel bütçesi: **${formatValue(user.budget)}**`
        );
      }

      /* =====================================================
         PROFILE
         ===================================================== */

      if (
        cmd === "profil" ||
        cmd === "profile"
      ) {
        return profileCommand(
          message
        );
      }

      /* =====================================================
         TEAM
         ===================================================== */

      if (
        cmd === "takımekle" ||
        cmd === "takimekle"
      ) {
        if (
          !isSpeaker(
            message.member
          )
        ) {
          return message.reply(
            "❌ Takım yetkin yok."
          );
        }

        const team =
          getTeamByMention(
            message,
            0
          );

        if (!team) {
          return message.reply(
            "❌ Kullanım: `.takımekle @Takım`"
          );
        }

        const data =
          ensureTeam(
            team.id,
            team.name
          );

        data.active = true;

        saveData();

        return message.reply(
          `✅ **${team.name}** lige eklendi.`
        );
      }

      if (
        cmd === "takımkaldır" ||
        cmd === "takimkaldir"
      ) {
        if (
          !isSpeaker(
            message.member
          )
        ) {
          return message.reply(
            "❌ Takım yetkin yok."
          );
        }

        const team =
          getTeamByMention(
            message,
            0
          );

        if (!team) {
          return message.reply(
            "❌ Kullanım: `.takımkaldır @Takım`"
          );
        }

        const data =
          ensureTeam(
            team.id,
            team.name
          );

        data.active = false;

        saveData();

        return message.reply(
          `✅ **${team.name}** ligden kaldırıldı.`
        );
      }

      if (
        cmd === "takımdeğer" ||
        cmd === "takimdeger"
      ) {
        if (
          !isValueStaff(
            message.member
          )
        ) {
          return message.reply(
            "❌ Değer yetkin yok."
          );
        }

        const team =
          getTeamByMention(
            message,
            0
          );

        const amount =
          parseAmount(
            args[1]
          );

        if (
          !team ||
          !Number.isFinite(amount)
        ) {
          return message.reply(
            "❌ Kullanım: `.takımdeğer @Takım 850M`"
          );
        }

        const data =
          ensureTeam(
            team.id,
            team.name
          );

        data.value =
          Math.min(
            1000,
            amount
          );

        saveData();

        return message.reply(
          `💰 **${team.name}** takım değeri: **${formatValue(data.value)}**`
        );
      }

      if (
        cmd === "puanekle"
      ) {
        if (
          !isSpeaker(
            message.member
          )
        ) {
          return message.reply(
            "❌ Puan yetkin yok."
          );
        }

        const team =
          getTeamByMention(
            message,
            0
          );

        const amount =
          Number(args[1]);

        if (
          !team ||
          !Number.isInteger(amount)
        ) {
          return message.reply(
            "❌ Kullanım: `.puanekle @Takım 3`"
          );
        }

        const data =
          ensureTeam(
            team.id,
            team.name
          );

        data.points += amount;

        saveData();

        return message.reply(
          `🏆 **${team.name}** puanı: **${data.points}**`
        );
      }

      /* =====================================================
         SQUAD
         ===================================================== */

      if (
        cmd === "kadroekle"
      ) {
        return squadAdd(message);
      }

      if (
        cmd === "kadrocikar" ||
        cmd === "kadrosil"
      ) {
        return squadRemove(message);
      }

      if (
        cmd === "kadro"
      ) {
        return squadList(message);
      }

      if (
        cmd === "formasyon"
      ) {
        return formationCommand(
          message
        );
      }

      /* =====================================================
         MATCH
         ===================================================== */

      if (
        cmd === "maç" ||
        cmd === "mac"
      ) {
        if (
          !isSpeaker(
            message.member
          )
        ) {
          return message.reply(
            "❌ Maç yetkin yok."
          );
        }

        if (
          !channelOnly(
            message,
            IDS.channels.match
          )
        ) {
          return message.reply(
            "❌ `.maç` sadece maç kanalında kullanılabilir."
          );
        }

        const teamA =
          getTeamByMention(
            message,
            0
          );

        const teamB =
          getTeamByMention(
            message,
            1
          );

        if (
          !teamA ||
          !teamB
        ) {
          return message.reply(
            "❌ Kullanım: `.maç @Takım1 @Takım2`"
          );
        }

        return startMatch(
          message.guild,
          teamA.id,
          teamB.id
        );
      }

      /* =====================================================
         FIXTURE
         ===================================================== */

      if (
        cmd === "fiksturekle" ||
        cmd === "fikstürekle"
      ) {
        return addFixture(
          message
        );
      }

      if (
        cmd === "fikstür" ||
        cmd === "fikstur"
      ) {
        return listFixtures(
          message
        );
      }

      if (
        cmd === "fiksturcikar" ||
        cmd === "fikstürçıkar"
      ) {
        return removeFixture(
          message
        );
      }

      /* =====================================================
         STANDINGS
         ===================================================== */

      if (
        cmd === "puan"
      ) {
        return standingsCommand(
          message
        );
      }

      /* =====================================================
         CUP / MUSEUM
         ===================================================== */

      if (
        cmd === "kupaekle"
      ) {
        return cupAdd(message);
      }

      if (
        cmd === "kupasil"
      ) {
        return cupRemove(message);
      }

      if (
        cmd === "müze" ||
        cmd === "muze"
      ) {
        return museumCommand(
          message
        );
      }

      /* =====================================================
         RANKINGS
         ===================================================== */

      if (
        cmd === "golkrallık" ||
        cmd === "golkrallik"
      ) {
        return goalsRanking(
          message
        );
      }

      if (
        cmd === "asistkrallık" ||
        cmd === "asistkrallik"
      ) {
        return assistsRanking(
          message
        );
      }

      /* =====================================================
         TWEET
         ===================================================== */

      if (
        cmd === "tweet"
      ) {
        return tweetCommand(
          message
        );
      }

      /* =====================================================
         ROLE PANEL
         ===================================================== */

      if (
        cmd === "rolpanel"
      ) {
        return rolePanel(
          message
        );
      }

      /* =====================================================
         TICKET
         ===================================================== */

      if (
        cmd === "ticketpanel"
      ) {
        return ticketPanel(
          message
        );
      }

      /* =====================================================
         CONDITIONS
         ===================================================== */

      if (
        cmd === "sart" ||
        cmd === "şart"
      ) {
        return conditionsCommand(
          message
        );
      }

      /* =====================================================
         MODERATION
         ===================================================== */

      if (
        cmd === "sil"
      ) {
        if (
          !isAdmin(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
          );
        }

        const amount =
          Number(args[0]);

        if (
          !Number.isInteger(amount) ||
          amount < 1 ||
          amount > 1000
        ) {
          return message.reply(
            "❌ 1-1000 arasında miktar gir."
          );
        }

        const deleted =
          await message.channel.bulkDelete(
            Math.min(amount + 1, 100),
            true
          ).catch(() => null);

        if (!deleted) {
          return message.reply(
            "❌ Mesajlar silinemedi."
          );
        }

        const response =
          await message.channel.send(
            `🧹 **${Math.max(0, deleted.size - 1)}** mesaj silindi.`
          );

        setTimeout(() => {
          response.delete().catch(() => {});
        }, 3000);

        return;
      }

      if (
        cmd === "kick"
      ) {
        if (
          !isAdmin(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
          );
        }

        const target =
          message.mentions.members.first();

        if (!target) {
          return message.reply(
            "❌ Bir oyuncu etiketle."
          );
        }

        await target.kick(
          "Axera League"
        ).catch(() => {});

        return message.reply(
          `👢 ${target.user.tag} sunucudan atıldı.`
        );
      }

      if (
        cmd === "ban"
      ) {
        if (
          !isAdmin(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
          );
        }

        const target =
          message.mentions.members.first();

        if (!target) {
          return message.reply(
            "❌ Bir oyuncu etiketle."
          );
        }

        await target.ban({
          reason: "Axera League"
        }).catch(() => {});

        return message.reply(
          `🔨 ${target.user.tag} yasaklandı.`
        );
      }

      if (
        cmd === "mute"
      ) {
        if (
          !isAdmin(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
          );
        }

        const target =
          message.mentions.members.first();

        if (!target) {
          return message.reply(
            "❌ Bir oyuncu etiketle."
          );
        }

        const role =
          message.guild.roles.cache.find(
            r =>
              normalizeName(r.name) ===
              "mute"
          );

        if (!role) {
          return message.reply(
            "❌ Sunucuda `Mute` rolü bulunamadı."
          );
        }

        await target.roles.add(
          role
        ).catch(() => {});

        return message.reply(
          `🔇 ${target} susturuldu.`
        );
      }

      if (
        cmd === "unmute"
      ) {
        if (
          !isAdmin(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
          );
        }

        const target =
          message.mentions.members.first();

        if (!target) {
          return message.reply(
            "❌ Bir oyuncu etiketle."
          );
        }

        const role =
          message.guild.roles.cache.find(
            r =>
              normalizeName(r.name) ===
              "mute"
          );

        if (role) {
          await target.roles.remove(
            role
          ).catch(() => {});
        }

        return message.reply(
          `🔊 ${target} susturması kaldırıldı.`
        );
      }

      /* =====================================================
         TARGETED DM
         ===================================================== */

      if (
        cmd === "dm"
      ) {
        if (
          !isAdmin(
            message.member
          )
        ) {
          return message.reply(
            "❌ Bu komutu sadece yönetici kullanabilir."
          );
        }

        const target =
          message.mentions.users.first();

        if (!target) {
          return message.reply(
            "❌ Kullanım: `.dm @oyuncu mesaj`"
          );
        }

        const content =
          message.content
            .replace(
              /^\.dm\s+/i,
              ""
            )
            .replace(
              /<@!?\d+>/,
              ""
            )
            .trim();

        if (!content) {
          return message.reply(
            "❌ Gönderilecek mesajı yaz."
          );
        }

        await target.send(
          content
        ).catch(() => null);

        return message.reply(
          `✅ ${target} kişisine DM gönderildi.`
        );
      }

      /* =====================================================
         HELP
         ===================================================== */

      if (
        cmd === "yardım" ||
        cmd === "yardim" ||
        cmd === "help"
      ) {
        return message.reply({
          embeds: [
            embed(
              "🤖 AXERA LEAGUE KOMUTLARI",
              "**👤 Kayıt**\n" +
              "`.k @oyuncu isim`\n" +
              "`.kayıtsızver @oyuncu`\n" +
              "`.ara oyuncu isim`\n" +
              "`.profil`\n\n" +

              "**💰 Değer**\n" +
              "`.dver @oyuncu 5M`\n" +
              "`.dsil @oyuncu 5M`\n" +
              "`.bütçeekle @oyuncu 5M`\n" +
              "`.bütçesil @oyuncu 5M`\n" +
              "`.gönder @oyuncu 5M`\n" +
              "`.bütçe`\n\n" +

              "**🏋️ Oyuncu**\n" +
              "`.ant`\n" +
              "`.pen`\n" +
              "`.tweet mesaj`\n" +
              "`.golkrallık`\n" +
              "`.asistkrallık`\n\n" +

              "**⚽ Takım / Maç**\n" +
              "`.takımekle @Takım`\n" +
              "`.takımkaldır @Takım`\n" +
              "`.takımdeğer @Takım 850M`\n" +
              "`.puanekle @Takım 3`\n" +
              "`.kadroekle @Takım @Oyuncu Pozisyon`\n" +
              "`.kadrocikar @Takım @Oyuncu`\n" +
              "`.kadro @Takım`\n" +
              "`.formasyon @Takım`\n" +
              "`.maç @Takım1 @Takım2`\n" +
              "`.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`\n" +
              "`.fikstür`\n" +
              "`.fiksturcikar @Takım1 @Takım2`\n" +
              "`.puan`\n\n" +

              "**🏆 Kupa / Müze**\n" +
              "`.kupaekle @Takım Kupa`\n" +
              "`.kupasil @Takım Kupa`\n" +
              "`.müze @Takım`\n\n" +

              "**🎫 Sunucu**\n" +
              "`.ticketpanel`\n" +
              "`.rolpanel`\n" +
              "`.sart`\n\n" +

              "**🤖 Yapay Zekâ**\n" +
              "AI kanalında normal mesaj yazabilir veya `.ai mesaj` kullanabilirsin."
            )
          ]
        });
      }

    } catch (error) {
      console.error(
        "COMMAND ERROR:",
        error
      );

      await message.reply(
        "❌ İşlem sırasında bir hata oluştu."
      ).catch(() => {});
    }
  }
);

/* =========================================================
   TICKET AUTO CLOSE
   ========================================================= */

setInterval(
  async () => {
    const now =
      Date.now();

    for (
      const [
        channelId,
        ticket
      ] of Object.entries(
        db.tickets
      )
    ) {
      if (
        now -
          Number(ticket.lastMessage || 0)
        <
        60 * 60 * 1000
      ) {
        continue;
      }

      const channel =
        client.channels.cache.get(
          channelId
        );

      if (channel) {
        await channel.delete()
          .catch(() => {});
      }

      delete db.tickets[channelId];
    }

    saveData();
  },
  60 * 1000
);

/* =========================================================
   FIXTURE SCHEDULER
   ========================================================= */

setInterval(
  async () => {
    const now =
      Date.now();

    for (
      const fixture of db.fixtures
    ) {
      if (
        fixture.started
      ) {
        continue;
      }

      if (
        fixture.timestamp >
        now
      ) {
        continue;
      }

      const guild =
        client.guilds.cache.first();

      if (!guild) continue;

      fixture.started = true;

      saveData();

      await startMatch(
        guild,
        fixture.teamA,
        fixture.teamB,
        fixture.id
      );
    }
  },
  1000
);

/* =========================================================
   STATUS TIMER
   ========================================================= */

setInterval(
  () => {
    statusMessage().catch(
      console.error
    );
  },
  30 * 1000
);

/* =========================================================
   READY
   ========================================================= */

client.once(
  "ready",
  async () => {
    console.log(
      `✅ ${client.user.tag} aktif!`
    );

    ensureAllTeams();

    client.user.setPresence({
      activities: [
        {
          name:
            "Axera League | .yardım",
          type: 3
        }
      ],
      status: "online"
    });

    console.log(
      `🤖 AI modeli: ${OPENAI_MODEL}`
    );

    console.log(
      "⚽ Axera League sistemleri hazır."
    );
  }
);

/* =========================================================
   ERROR HANDLING
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
   LOGIN
   ========================================================= */

client.login(TOKEN);
