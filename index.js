require("dotenv").config();

const fs = require("fs");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType
} = require("discord.js");

const OpenAI = require("openai");

/* =========================================================
   AXERA LEAGUE
   FOOTBALL RP DISCORD BOT
   ========================================================= */

const PREFIX = ".";
const PORT = process.env.PORT || 3000;

const IDS = {
  roles: {
    ADMIN: "1534455282426445897",
    REGISTER: "1534456315366342716",
    VALUE: "1534456192913375382",
    UNREGISTERED: "1534457560134844517",
    PLAYER: "1534457228986421278",
    TD: "1534456648930693120",
    MEMBER: "1534457460163608636",
    MOD: "1534456108415189063",
    SPEAKER: "1535251168169697390",

    MEDIA_PING: "1547393966553440346",
    PARTNER_PING: "1547393545827123230",
    MATCH_PING: "1547393416755941509",
    ANNOUNCEMENT_PING: "1547393331297001522",
    GIVEAWAY_PING: "1545116885589430312"
  },

  channels: {
    REGISTER: "1547371464515133470",
    CHAT: "1547374641763455009",
    TRAINING: "1547375589923618957",
    PENALTY: "1547375997698052166",
    TWEET: "1547377797193011340",
    MATCH: "1547376935410073692",
    STANDINGS: "1547382143775285431",
    VALUE: "1547376344927834122",
    STATUS: "1547388197796057118",
    AI: "1547375186754408539"
  }
};

/* =========================================================
   DISCORD CLIENT
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
   OPENAI
   ========================================================= */

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 15000
    })
  : null;

const AI_MODEL = "gpt-5.6-luna";

/* =========================================================
   DATA
   ========================================================= */

const DATA_FILE = path.join(__dirname, "data.json");

const DEFAULT_DATA = {
  users: {},
  teams: {},
  standings: {},
  fixtures: [],
  nextFixtureId: 1,
  activeMatches: {},
  tickets: {},
  cups: {},
  formations: {},
  training: {},
  tweetCooldowns: {},
  matchRewards: {},
  stats: {},
  matchHistory: [],
  aiMemory: {}
};

let db = loadData();

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_DATA, null, 2));
      return structuredClone(DEFAULT_DATA);
    }

    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

    return {
      ...structuredClone(DEFAULT_DATA),
      ...parsed
    };
  } catch (err) {
    console.error("data.json okunamadı:", err);

    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_DATA, null, 2));
    } catch {}

    return structuredClone(DEFAULT_DATA);
  }
}

let saveTimer = null;

function saveData() {
  clearTimeout(saveTimer);

  saveTimer = setTimeout(() => {
    try {
      const temp = DATA_FILE + ".tmp";
      fs.writeFileSync(temp, JSON.stringify(db, null, 2));
      fs.renameSync(temp, DATA_FILE);
    } catch (err) {
      console.error("data.json kaydedilemedi:", err);
    }
  }, 250);
}

/* =========================================================
   BASIC HELPERS
   ========================================================= */

function moneyM(value) {
  const n = Number(value) || 0;
  return `${Number.isInteger(n) ? n : n.toFixed(2)}M€`;
}

function parseM(input) {
  if (!input) return NaN;

  let value = String(input)
    .trim()
    .toUpperCase()
    .replace(/€/g, "")
    .replace(/\s/g, "");

  if (!value.endsWith("M")) return NaN;

  value = value.slice(0, -1).replace(",", ".");

  const n = Number(value);

  if (!Number.isFinite(n) || n <= 0) return NaN;

  return n;
}

function isAdmin(member) {
  if (!member) return false;

  return (
    member.permissions?.has(PermissionsBitField.Flags.Administrator) ||
    member.roles?.cache?.has(IDS.roles.ADMIN)
  );
}

function hasRole(member, roleId) {
  return isAdmin(member) || member.roles.cache.has(roleId);
}

function getChannel(guild, id) {
  return guild?.channels?.cache?.get(id);
}

function isChannel(message, id) {
  return message.channel.id === id;
}

function mentionUser(message) {
  return message.mentions.users.first() || null;
}

function mentionRole(message, index = 0) {
  return message.mentions.roles.at(index) || null;
}

function mentionMember(message) {
  return message.mentions.members.first() || null;
}

function ensureUser(guildId, userId) {
  if (!db.users[guildId]) db.users[guildId] = {};

  if (!db.users[guildId][userId]) {
    db.users[guildId][userId] = {
      registered: false,
      roleType: null,
      name: "",
      position: "SNT",
      country: "🌍",
      value: 0,
      training: 0,
      penaltyAttempts: 0,
      penaltyGoals: 0,
      goals: 0,
      assists: 0,
      matches: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      xp: 0,
      ovr: 60,
      lastTweet: 0
    };
  }

  return db.users[guildId][userId];
}

function getUser(guildId, userId) {
  return ensureUser(guildId, userId);
}

function addXP(guildId, userId, amount) {
  const user = getUser(guildId, userId);

  user.xp += amount;

  while (user.xp >= 100) {
    user.xp -= 100;
    user.ovr = Math.min(99, user.ovr + 1);
  }

  saveData();
}

function splitLongText(text, max = 1900) {
  const chunks = [];

  for (let i = 0; i < text.length; i += max) {
    chunks.push(text.slice(i, i + max));
  }

  return chunks;
}

async function safeReply(message, content) {
  try {
    return await message.reply(content);
  } catch {
    return null;
  }
}

async function safeSend(channel, payload) {
  try {
    return await channel.send(payload);
  } catch {
    return null;
  }
}

/* =========================================================
   VALUE SYSTEM
   ========================================================= */

function getTrailingValue(nickname) {
  const match = String(nickname || "").match(/(\d+(?:[.,]\d+)?)M€\s*$/i);

  if (!match) return null;

  return Number(match[1].replace(",", "."));
}

async function changeNicknameValue(member, newValue) {
  const current = member.nickname || member.user.username;

  const match = current.match(/^(.*?)(\d+(?:[.,]\d+)?)M€\s*$/i);

  if (!match) {
    return null;
  }

  const prefix = match[1];

  return `${prefix}${moneyM(newValue)}`.slice(0, 32);
}

async function changePlayerValue(guild, user, delta) {
  const player = getUser(guild.id, user.id);

  const oldValue = Number(player.value) || 0;

  let newValue = oldValue + delta;

  newValue = Math.max(0, newValue);
  newValue = Math.min(1000, newValue);

  player.value = newValue;

  const member = await guild.members.fetch(user.id).catch(() => null);

  if (
    member &&
    guild.members.me &&
    guild.members.me.permissions.has(
      PermissionsBitField.Flags.ManageNicknames
    )
  ) {
    const newNickname = await changeNicknameValue(member, newValue);

    if (newNickname) {
      await member.setNickname(newNickname).catch(() => {});
    }
  }

  saveData();

  return {
    oldValue,
    newValue
  };
}

/* =========================================================
   REGISTRATION
   ========================================================= */

function registrationComponents(userId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`register:player:${userId}`)
        .setLabel("⚽ Futbolcu")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`register:member:${userId}`)
        .setLabel("👤 Üye")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(`register:td:${userId}`)
        .setLabel("🧑‍💼 Teknik Direktör")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`register:gk:${userId}`)
        .setLabel("🧤 Kaleci")
        .setStyle(ButtonStyle.Primary)
    )
  ];
}

async function registrationCommand(message) {
  if (!isChannel(message, IDS.channels.REGISTER)) {
    return safeReply(
      message,
      "❌ Bu komut sadece kayıt kanalında kullanılabilir."
    );
  }

  if (!hasRole(message.member, IDS.roles.REGISTER)) {
    return safeReply(message, "❌ Kayıt yetkin yok.");
  }

  const user = mentionUser(message);

  if (!user) {
    return safeReply(
      message,
      "❌ Kullanım: `.k @Oyuncu İsim`"
    );
  }

  const name = message.content
    .replace(/^\.k\s*/i, "")
    .replace(/<@!?\d+>/, "")
    .trim();

  if (!name) {
    return safeReply(message, "❌ Kayıt ismi yazmalısın.");
  }

  const member = await message.guild.members.fetch(user.id).catch(() => null);

  if (!member) {
    return safeReply(message, "❌ Kullanıcı bulunamadı.");
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📋 AXERA LEAGUE KAYIT")
    .setDescription(
      `👤 Oyuncu: ${user}\n\n` +
      `📝 İsim: **${name}**\n\n` +
      `Aşağıdaki butonlardan kayıt türünü seçin.`
    )
    .setFooter({
      text: "Axera League • Kayıt Sistemi"
    });

  return message.channel.send({
    embeds: [embed],
    components: registrationComponents(user.id)
  });
}

async function completeRegistration(interaction, type, targetId) {
  if (interaction.user.id !== targetId) {
    return interaction.reply({
      content: "❌ Bu kayıt paneli başka bir kullanıcıya ait.",
      ephemeral: true
    });
  }

  const member = interaction.member;

  const user = getUser(interaction.guild.id, targetId);

  let roleId = IDS.roles.PLAYER;
  let roleType = "Futbolcu";

  if (type === "member") {
    roleId = IDS.roles.MEMBER;
    roleType = "Üye";
  }

  if (type === "td") {
    roleId = IDS.roles.TD;
    roleType = "Teknik Direktör";
  }

  if (type === "gk") {
    roleId = IDS.roles.PLAYER;
    roleType = "Kaleci";
  }

  const removable = [
    IDS.roles.UNREGISTERED,
    IDS.roles.PLAYER,
    IDS.roles.MEMBER,
    IDS.roles.TD
  ].filter(Boolean);

  for (const id of removable) {
    await member.roles.remove(id).catch(() => {});
  }

  await member.roles.add(roleId).catch(() => {});

  user.registered = true;
  user.roleType = roleType;

  if (!user.name) {
    user.name = member.displayName;
  }

  saveData();

  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("✅ KAYIT TAMAMLANDI")
        .setDescription(
          `${member}\n\n` +
          `🎭 Tür: **${roleType}**\n` +
          `⚽ Axera League'e hoş geldin!`
        )
    ],
    components: []
  });
}

/* =========================================================
   SEARCH
   ========================================================= */

async function searchPlayer(message, query) {
  if (!query) {
    return safeReply(
      message,
      "❌ Kullanım: `.ara futbolcu isim`"
    );
  }

  const members = await message.guild.members.fetch().catch(() => null);

  if (!members) {
    return safeReply(message, "❌ Üyeler alınamadı.");
  }

  const q = query.toLowerCase();

  const results = [];

  for (const member of members.values()) {
    if (member.user.bot) continue;

    const user = getUser(message.guild.id, member.id);

    if (!user.registered) continue;

    const values = [
      member.displayName,
      member.user.username,
      user.name
    ]
      .filter(Boolean)
      .map(x => x.toLowerCase());

    let score = 0;

    for (const value of values) {
      if (value === q) score = Math.max(score, 100);
      else if (value.startsWith(q)) score = Math.max(score, 75);
      else if (value.includes(q)) score = Math.max(score, 50);
    }

    if (score > 0) {
      results.push({
        member,
        user,
        score
      });
    }
  }

  results.sort((a, b) => b.score - a.score);

  if (!results.length) {
    return safeReply(
      message,
      "❌ Bu isimde veya benzer isimde kayıtlı oyuncu bulunamadı."
    );
  }

  const description = results
    .slice(0, 15)
    .map(
      (x, i) =>
        `**${i + 1}. ${x.member.displayName}**\n` +
        `👤 ${x.member}\n` +
        `📍 ${x.user.position}\n` +
        `💰 ${moneyM(x.user.value)}\n` +
        `⭐ OVR ${x.user.ovr}`
    )
    .join("\n\n");

  return message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🔎 FUTBOLCU ARAMA")
        .setDescription(description)
    ]
  });
}

/* =========================================================
   TRAINING
   ========================================================= */

async function training(message) {
  if (!isChannel(message, IDS.channels.TRAINING)) {
    return safeReply(
      message,
      "❌ Bu komut sadece antrenman kanalında kullanılabilir."
    );
  }

  const user = getUser(message.guild.id, message.author.id);

  user.training += 1;

  let reward = false;

  if (user.training >= 5) {
    user.training = 0;
    reward = true;

    await changePlayerValue(
      message.guild,
      message.author,
      3
    );

    user.ovr = Math.min(99, user.ovr + 1);

    addXP(message.guild.id, message.author.id, 50);
  } else {
    addXP(message.guild.id, message.author.id, 10);
  }

  saveData();

  return message.reply(
    `🏋️ **ANTRENMAN TAMAMLANDI**\n\n` +
    `📈 İlerleme: **${user.training}/5**\n` +
    `⭐ OVR: **${user.ovr}**\n` +
    (reward
      ? `\n💰 **5/5 tamamlandı! +3M€ değer kazandın.**`
      : `\n🎯 5/5 olduğunda **+3M€** değer kazanırsın.`)
  );
}

/* =========================================================
   PENALTY
   ========================================================= */

async function penalty(message) {
  if (!isChannel(message, IDS.channels.PENALTY)) {
    return safeReply(
      message,
      "❌ Bu komut sadece penaltı kanalında kullanılabilir."
    );
  }

  const user = getUser(message.guild.id, message.author.id);

  user.penaltyAttempts += 1;

  const random = Math.random();

  let result;

  if (random < 0.5) {
    result = "goal";
  } else if (random < 0.75) {
    result = "post";
  } else {
    result = "save";
  }

  if (result === "goal") {
    user.penaltyGoals += 1;

    await changePlayerValue(
      message.guild,
      message.author,
      5
    );

    user.ovr = Math.min(99, user.ovr + 1);

    addXP(message.guild.id, message.author.id, 25);

    saveData();

    return message.reply(
      `🥅 **GOOOOL!** ⚽\n\n` +
      `🧤 Kaleci: **Axera Kalecisi**\n` +
      `💰 Değer: **+5M€**\n` +
      `📊 Penaltı: **${user.penaltyGoals}/${user.penaltyAttempts}**`
    );
  }

  if (result === "post") {
    saveData();

    return message.reply(
      `💥 **DİREK!**\n\n` +
      `🥅 Top direğe çarptı.\n` +
      `📊 Penaltı: **${user.penaltyGoals}/${user.penaltyAttempts}**`
    );
  }

  saveData();

  return message.reply(
    `🧤 **KALECİ KURTARDI!**\n\n` +
    `🧤 Axera Kalecisi penaltıyı çıkardı.\n` +
    `📊 Penaltı: **${user.penaltyGoals}/${user.penaltyAttempts}**`
  );
}

/* =========================================================
   TWEET
   ========================================================= */

async function tweet(message) {
  if (!isChannel(message, IDS.channels.TWEET)) {
    return safeReply(
      message,
      "❌ Bu komut sadece tweet kanalında kullanılabilir."
    );
  }

  const text = message.content
    .replace(/^\.tweet\s*/i, "")
    .trim();

  if (!text) {
    return safeReply(message, "❌ Tweet metni yaz.");
  }

  const user = getUser(message.guild.id, message.author.id);

  const now = Date.now();

  if (now - user.lastTweet < 24 * 60 * 60 * 1000) {
    return safeReply(
      message,
      "⏳ 24 saatte yalnızca 1 tweet gönderebilirsin."
    );
  }

  user.lastTweet = now;

  await changePlayerValue(
    message.guild,
    message.author,
    5
  );

  saveData();

  await message.delete().catch(() => {});

  return message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x1da1f2)
        .setTitle("𝕏 AXERA TWEET")
        .setDescription(text)
        .setAuthor({
          name: message.member?.displayName || message.author.username,
          iconURL: message.author.displayAvatarURL()
        })
        .setTimestamp()
    ]
  });
}

/* =========================================================
   TEAM SYSTEM
   ========================================================= */

function ensureTeam(guildId, roleId, roleName) {
  if (!db.teams[guildId]) db.teams[guildId] = {};

  if (!db.teams[guildId][roleId]) {
    db.teams[guildId][roleId] = {
      id: roleId,
      name: roleName,
      value: 0,
      players: [],
      cups: [],
      formation: "4-3-3"
    };
  }

  return db.teams[guildId][roleId];
}

function getTeam(guildId, roleId) {
  return db.teams[guildId]?.[roleId] || null;
}

async function teamAdd(message) {
  if (!isAdmin(message.member) && !hasRole(message.member, IDS.roles.SPEAKER)) {
    return safeReply(message, "❌ Bu komut sadece yetkili içindir.");
  }

  const role = mentionRole(message);

  if (!role) {
    return safeReply(message, "❌ Kullanım: `.takımekle @Takım`");
  }

  ensureTeam(message.guild.id, role.id, role.name);

  saveData();

  return message.reply(
    `✅ **${role.name}** takımı sisteme eklendi.`
  );
}

async function teamRemove(message) {
  if (!isAdmin(message.member) && !hasRole(message.member, IDS.roles.SPEAKER)) {
    return safeReply(message, "❌ Bu komut sadece yetkili içindir.");
  }

  const role = mentionRole(message);

  if (!role) {
    return safeReply(message, "❌ Kullanım: `.takımkaldır @Takım`");
  }

  if (db.teams[message.guild.id]) {
    delete db.teams[message.guild.id][role.id];
  }

  if (db.standings[message.guild.id]) {
    delete db.standings[message.guild.id][role.id];
  }

  saveData();

  return message.reply(
    `🗑️ **${role.name}** takımı sistemden kaldırıldı.`
  );
}

async function teamValue(message) {
  if (!isAdmin(message.member) && !hasRole(message.member, IDS.roles.SPEAKER)) {
    return safeReply(message, "❌ Yetkin yok.");
  }

  const role = mentionRole(message);
  const amount = parseM(message.content.split(/\s+/).at(-1));

  if (!role || !Number.isFinite(amount)) {
    return safeReply(
      message,
      "❌ Kullanım: `.takımdeğer @Takım 850M`"
    );
  }

  const team = ensureTeam(
    message.guild.id,
    role.id,
    role.name
  );

  team.value = amount;

  saveData();

  return message.reply(
    `💰 **${role.name}** takım değeri: **${moneyM(amount)}**`
  );
}

/* =========================================================
   SQUAD
   ========================================================= */

async function squadAdd(message) {
  if (!isAdmin(message.member) && !hasRole(message.member, IDS.roles.SPEAKER)) {
    return safeReply(message, "❌ Yetkin yok.");
  }

  const role = mentionRole(message, 0);
  const user = mentionUser(message);

  const words = message.content.trim().split(/\s+/);
  const position = words.at(-1);

  const validPositions = [
    "KL",
    "STP",
    "SLB",
    "SĞB",
    "MDO",
    "MO",
    "MOO",
    "SLK",
    "SĞK",
    "SNT"
  ];

  if (
    !role ||
    !user ||
    !validPositions.includes(position?.toUpperCase())
  ) {
    return safeReply(
      message,
      `❌ Kullanım: \`.kadroekle @Takım @Oyuncu Pozisyon\`\n` +
      `Pozisyonlar: ${validPositions.join(", ")}`
    );
  }

  const team = ensureTeam(
    message.guild.id,
    role.id,
    role.name
  );

  team.players = team.players.filter(
    x => x.userId !== user.id
  );

  team.players.push({
    userId: user.id,
    position: position.toUpperCase()
  });

  saveData();

  return message.reply(
    `✅ <@${user.id}> → **${role.name}** kadrosuna eklendi.\n` +
    `📍 Mevki: **${position.toUpperCase()}**`
  );
}

async function squadRemove(message) {
  if (!isAdmin(message.member) && !hasRole(message.member, IDS.roles.SPEAKER)) {
    return safeReply(message, "❌ Yetkin yok.");
  }

  const role = mentionRole(message, 0);
  const user = mentionUser(message);

  if (!role || !user) {
    return safeReply(
      message,
      "❌ Kullanım: `.kadrocikar @Takım @Oyuncu`"
    );
  }

  const team = getTeam(
    message.guild.id,
    role.id
  );

  if (!team) {
    return safeReply(message, "❌ Takım bulunamadı.");
  }

  team.players = team.players.filter(
    x => x.userId !== user.id
  );

  saveData();

  return message.reply(
    `🗑️ <@${user.id}> **${role.name}** kadrosundan çıkarıldı.`
  );
}

async function squad(message) {
  const role = mentionRole(message);

  if (!role) {
    return safeReply(message, "❌ Kullanım: `.kadro @Takım`");
  }

  const team = getTeam(
    message.guild.id,
    role.id
  );

  if (!team) {
    return safeReply(message, "❌ Bu takım sisteme kayıtlı değil.");
  }

  if (!team.players.length) {
    return safeReply(
      message,
      `📋 **${team.name}** kadrosu boş.`
    );
  }

  const groups = {};

  for (const player of team.players) {
    if (!groups[player.position]) {
      groups[player.position] = [];
    }

    const user = getUser(
      message.guild.id,
      player.userId
    );

    groups[player.position].push(
      `<@${player.userId}> — ${moneyM(user.value)}`
    );
  }

  const text = Object.entries(groups)
    .map(
      ([position, players]) =>
        `**${position}**\n${players.join("\n")}`
    )
    .join("\n\n");

  return message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`📋 ${team.name} KADROSU`)
        .setDescription(text)
        .addFields({
          name: "💰 Takım Değeri",
          value: moneyM(team.value),
          inline: true
        })
    ]
  });
}

/* =========================================================
   FORMATION
   ========================================================= */

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

async function formation(message) {
  if (!isAdmin(message.member) && !hasRole(message.member, IDS.roles.SPEAKER)) {
    return safeReply(message, "❌ Yetkin yok.");
  }

  const role = mentionRole(message);

  if (!role) {
    return safeReply(
      message,
      "❌ Kullanım: `.formasyon @Takım`"
    );
  }

  const team = getTeam(
    message.guild.id,
    role.id
  );

  if (!team) {
    return safeReply(message, "❌ Takım bulunamadı.");
  }

  const rows = [
    new ActionRowBuilder().addComponents(
      ...FORMATIONS.slice(0, 5).map(
        x =>
          new ButtonBuilder()
            .setCustomId(`formation:${role.id}:${x}`)
            .setLabel(x)
            .setStyle(ButtonStyle.Primary)
      )
    ),
    new ActionRowBuilder().addComponents(
      ...FORMATIONS.slice(5).map(
        x =>
          new ButtonBuilder()
            .setCustomId(`formation:${role.id}:${x}`)
            .setLabel(x)
            .setStyle(ButtonStyle.Secondary)
      )
    )
  ];

  return message.reply({
    content: `⚽ **${team.name}** için formasyon seç:`,
    components: rows
  });
}

/* =========================================================
   STANDINGS
   ========================================================= */

function ensureStanding(guildId, teamId, teamName) {
  if (!db.standings[guildId]) {
    db.standings[guildId] = {};
  }

  if (!db.standings[guildId][teamId]) {
    db.standings[guildId][teamId] = {
      name: teamName,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0
    };
  }

  return db.standings[guildId][teamId];
}

async function standings(message) {
  const rows = Object.values(
    db.standings[message.guild.id] || {}
  );

  if (!rows.length) {
    return safeReply(
      message,
      "📊 Henüz puan durumu oluşturulmadı."
    );
  }

  rows.sort((a, b) => {
    const gdA = a.goalsFor - a.goalsAgainst;
    const gdB = b.goalsFor - b.goalsAgainst;

    return (
      b.points - a.points ||
      gdB - gdA ||
      b.goalsFor - a.goalsFor
    );
  });

  const text = rows
    .map((x, i) => {
      const gd = x.goalsFor - x.goalsAgainst;

      return (
        `**${i + 1}. ${x.name}**\n` +
        `P: ${x.points} • O: ${x.played} • ` +
        `G: ${x.wins} • B: ${x.draws} • M: ${x.losses} • ` +
        `AV: ${gd >= 0 ? "+" : ""}${gd}`
      );
    })
    .join("\n\n");

  return message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("🏆 AXERA LEAGUE PUAN DURUMU")
        .setDescription(text)
    ]
  });
}

async function addPoints(message) {
  if (!isAdmin(message.member) && !hasRole(message.member, IDS.roles.SPEAKER)) {
    return safeReply(message, "❌ Yetkin yok.");
  }

  const role = mentionRole(message);
  const amount = Number(message.content.split(/\s+/).at(-1));

  if (!role || !Number.isInteger(amount)) {
    return safeReply(
      message,
      "❌ Kullanım: `.puanekle @Takım 3`"
    );
  }

  const row = ensureStanding(
    message.guild.id,
    role.id,
    role.name
  );

  row.points += amount;

  saveData();

  return message.reply(
    `🏆 **${role.name}** puanı **${amount}** artırıldı.`
  );
}

/* =========================================================
   MATCH ENGINE
   ========================================================= */

const matchTimers = new Map();

function teamPlayers(guild, team) {
  const players = [];

  for (const item of team.players || []) {
    const member = guild.members.cache.get(item.userId);

    if (!member) continue;

    const user = getUser(
      guild.id,
      item.userId
    );

    players.push({
      userId: item.userId,
      name: member.displayName,
      position: item.position,
      value: Number(user.value) || 0
    });
  }

  return players;
}

function randomPlayer(players) {
  if (!players.length) return null;

  return players[
    Math.floor(Math.random() * players.length)
  ];
}

function matchCommentary(teamA, teamB, playersA, playersB) {
  const events = [
    () => `⚽ ${teamA.name} hızlı bir atak geliştiriyor.`,
    () => `🔥 ${teamB.name} savunmanın arkasına sarktı.`,
    () => `🎯 ${teamA.name} uzaktan şansını deniyor.`,
    () => `🧤 ${teamB.name} kalecisi topu kontrol etti.`,
    () => `💨 ${teamB.name} kanattan geliyor.`,
    () => `🛡️ ${teamA.name} savunması tehlikeyi uzaklaştırdı.`,
    () => `🔄 Orta sahada topa sahip olma mücadelesi.`,
    () => `📣 Tribünlerden büyük destek geliyor.`
  ];

  const a = randomPlayer(playersA);
  const b = randomPlayer(playersB);

  const special = Math.random();

  if (special < 0.12 && a) {
    return `⚽ **${a.name}** (${teamA.name}) şutunu çekti!`;
  }

  if (special < 0.24 && b) {
    return `🎯 **${b.name}** (${teamB.name}) kaleyi yokladı!`;
  }

  return events[
    Math.floor(Math.random() * events.length)
  ]();
}

function calculateGoalChance(teamA, teamB) {
  const valueA = Number(teamA.value) || 0;
  const valueB = Number(teamB.value) || 0;

  if (valueA === 0 && valueB === 0) {
    return 0.5;
  }

  const ratio =
    valueA / Math.max(1, valueA + valueB);

  return 0.35 + ratio * 0.30;
}

async function startMatch(guild, roleA, roleB, channel) {
  if (!roleA || !roleB) return;

  if (roleA.id === roleB.id) {
    await safeSend(channel, "❌ Aynı takım kendisiyle oynayamaz.");
    return;
  }

  const teamA = getTeam(guild.id, roleA.id);
  const teamB = getTeam(guild.id, roleB.id);

  if (!teamA || !teamB) {
    await safeSend(
      channel,
      "❌ İki takımın da sisteme eklenmiş olması gerekiyor."
    );
    return;
  }

  const key = `${guild.id}:${roleA.id}:${roleB.id}`;

  if (matchTimers.has(key)) {
    await safeSend(channel, "❌ Bu maç zaten devam ediyor.");
    return;
  }

  const playersA = teamPlayers(guild, teamA);
  const playersB = teamPlayers(guild, teamB);

  const match = {
    key,
    guildId: guild.id,
    channelId: channel.id,
    teamA: roleA.id,
    teamB: roleB.id,
    minute: 0,
    scoreA: 0,
    scoreB: 0,
    commentary: [],
    rewarded: false
  };

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("⚽ AXERA LEAGUE — CANLI MAÇ")
    .setDescription(
      `🏟️ **${teamA.name}** 0 - 0 **${teamB.name}**\n\n` +
      `⏱️ Dakika: **0'**\n\n` +
      `🟢 Maç başladı!`
    );

  const matchMessage = await safeSend(channel, {
    embeds: [embed]
  });

  matchTimers.set(key, match);

  const timer = setInterval(async () => {
    try {
      match.minute += 1;

      if (Math.random() < 0.23) {
        match.commentary.unshift(
          matchCommentary(
            teamA,
            teamB,
            playersA,
            playersB
          )
        );

        match.commentary =
          match.commentary.slice(0, 5);
      }

      const goalChanceA =
        calculateGoalChance(teamA, teamB) * 0.055;

      const goalChanceB =
        (1 - calculateGoalChance(teamA, teamB)) * 0.055;

      if (Math.random() < goalChanceA) {
        match.scoreA++;

        const scorer = randomPlayer(playersA);

        if (scorer) {
          const player = getUser(
            guild.id,
            scorer.userId
          );

          player.goals++;

          await changePlayerValue(
            guild,
            { id: scorer.userId },
            2
          );

          addXP(
            guild.id,
            scorer.userId,
            20
          );

          match.commentary.unshift(
            `⚽ **GOOOL! ${scorer.name}**! ${teamA.name} öne geçiyor!`
          );
        } else {
          match.commentary.unshift(
            `⚽ **GOOOL!** ${teamA.name} ağları buldu!`
          );
        }
      }

      if (Math.random() < goalChanceB) {
        match.scoreB++;

        const scorer = randomPlayer(playersB);

        if (scorer) {
          const player = getUser(
            guild.id,
            scorer.userId
          );

          player.goals++;

          await changePlayerValue(
            guild,
            { id: scorer.userId },
            2
          );

          addXP(
            guild.id,
            scorer.userId,
            20
          );

          match.commentary.unshift(
            `⚽ **GOOOL! ${scorer.name}**! ${teamB.name} eşitliği sağlıyor!`
          );
        } else {
          match.commentary.unshift(
            `⚽ **GOOOL!** ${teamB.name} ağları buldu!`
          );
        }
      }

      match.commentary =
        match.commentary.slice(0, 5);

      if (matchMessage) {
        const description =
          `🏟️ **${teamA.name}** ` +
          `**${match.scoreA}** - **${match.scoreB}** ` +
          `**${teamB.name}**\n\n` +
          `⏱️ Dakika: **${match.minute}'**\n\n` +
          `📣 ${match.commentary.join("\n") || "Maç devam ediyor..."}`;

        await matchMessage.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(0x5865f2)
              .setTitle("⚽ AXERA LEAGUE — CANLI MAÇ")
              .setDescription(description)
          ]
        }).catch(() => {});
      }

      if (match.minute >= 90) {
        clearInterval(timer);
        matchTimers.delete(key);

        await finishMatch(
          guild,
          teamA,
          teamB,
          roleA,
          roleB,
          match,
          playersA,
          playersB,
          matchMessage
        );
      }
    } catch (err) {
      console.error("Maç motoru hatası:", err);

      clearInterval(timer);
      matchTimers.delete(key);
    }
  }, 3000);
}

async function finishMatch(
  guild,
  teamA,
  teamB,
  roleA,
  roleB,
  match,
  playersA,
  playersB,
  matchMessage
) {
  const standingA = ensureStanding(
    guild.id,
    roleA.id,
    roleA.name
  );

  const standingB = ensureStanding(
    guild.id,
    roleB.id,
    roleB.name
  );

  standingA.played++;
  standingB.played++;

  standingA.goalsFor += match.scoreA;
  standingA.goalsAgainst += match.scoreB;

  standingB.goalsFor += match.scoreB;
  standingB.goalsAgainst += match.scoreA;

  let resultText;

  if (match.scoreA > match.scoreB) {
    standingA.wins++;
    standingB.losses++;

    standingA.points += 3;

    resultText =
      `🏆 **${teamA.name} maçı kazandı!**`;
  } else if (match.scoreB > match.scoreA) {
    standingB.wins++;
    standingA.losses++;

    standingB.points += 3;

    resultText =
      `🏆 **${teamB.name} maçı kazandı!**`;
  } else {
    standingA.draws++;
    standingB.draws++;

    standingA.points++;
    standingB.points++;

    resultText = "🤝 **Maç berabere bitti!**";
  }

  const allPlayers = [
    ...playersA,
    ...playersB
  ];

  for (const player of allPlayers) {
    const key =
      `${guild.id}:${match.key}:${player.userId}`;

    if (db.matchRewards[key]) continue;

    db.matchRewards[key] = true;

    await changePlayerValue(
      guild,
      { id: player.userId },
      5
    ).catch(() => {});

    const user = getUser(
      guild.id,
      player.userId
    );

    user.matches++;
  }

  db.matchHistory.push({
    date: Date.now(),
    teamA: teamA.name,
    teamB: teamB.name,
    scoreA: match.scoreA,
    scoreB: match.scoreB
  });

  db.matchHistory =
    db.matchHistory.slice(-100);

  saveData();

  if (matchMessage) {
    await matchMessage.edit({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("🏁 MAÇ SONA ERDİ")
          .setDescription(
            `🏟️ **${teamA.name}** ` +
            `**${match.scoreA}** - **${match.scoreB}** ` +
            `**${teamB.name}**\n\n` +
            resultText +
            `\n\n💰 Maçta yer alan oyunculara **+5M€** değer verildi.`
          )
      ]
    }).catch(() => {});
  }

  await sendStandingsUpdate(guild);
}

/* =========================================================
   FIXTURE
   ========================================================= */

async function fixtureAdd(message) {
  if (!isAdmin(message.member) && !hasRole(message.member, IDS.roles.SPEAKER)) {
    return safeReply(message, "❌ Yetkin yok.");
  }

  const roles = [
    mentionRole(message, 0),
    mentionRole(message, 1)
  ];

  const raw = message.content
    .replace(/^\.fiksturekle\s*/i, "")
    .replace(/<@&\d+>/g, "")
    .trim();

  const dateText = raw;

  const date = new Date(
    dateText.replace(" ", "T") + ":00"
  );

  if (
    !roles[0] ||
    !roles[1] ||
    Number.isNaN(date.getTime())
  ) {
    return safeReply(
      message,
      "❌ Kullanım: `.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`"
    );
  }

  const fixture = {
    id: db.nextFixtureId++,
    guildId: message.guild.id,
    teamA: roles[0].id,
    teamB: roles[1].id,
    timestamp: date.getTime(),
    started: false
  };

  db.fixtures.push(fixture);

  saveData();

  return message.reply(
    `📅 Fikstür eklendi.\n` +
    `⚽ ${roles[0].name} 🆚 ${roles[1].name}\n` +
    `🕐 <t:${Math.floor(date.getTime() / 1000)}:F>`
  );
}

async function fixtureList(message) {
  const fixtures = db.fixtures
    .filter(
      x =>
        x.guildId === message.guild.id &&
        !x.started
    )
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(0, 15);

  if (!fixtures.length) {
    return safeReply(
      message,
      "📅 Yaklaşan fikstür bulunmuyor."
    );
  }

  const text = fixtures
    .map((x, i) => {
      const a = getTeam(message.guild.id, x.teamA);
      const b = getTeam(message.guild.id, x.teamB);

      return (
        `**${i + 1}.** ${a?.name || "Takım"} 🆚 ${b?.name || "Takım"}\n` +
        `🕐 <t:${Math.floor(x.timestamp / 1000)}:F>`
      );
    })
    .join("\n\n");

  return message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("📅 AXERA LEAGUE FİKSTÜR")
        .setDescription(text)
    ]
  });
}

async function fixtureRemove(message) {
  if (!isAdmin(message.member) && !hasRole(message.member, IDS.roles.SPEAKER)) {
    return safeReply(message, "❌ Yetkin yok.");
  }

  const a = mentionRole(message, 0);
  const b = mentionRole(message, 1);

  if (!a || !b) {
    return safeReply(
      message,
      "❌ Kullanım: `.fiksturcikar @Takım1 @Takım2`"
    );
  }

  const before = db.fixtures.length;

  db.fixtures = db.fixtures.filter(
    x =>
      !(
        x.guildId === message.guild.id &&
        x.teamA === a.id &&
        x.teamB === b.id &&
        !x.started
      )
  );

  saveData();

  return message.reply(
    before === db.fixtures.length
      ? "❌ Fikstür bulunamadı."
      : "✅ Fikstür kaldırıldı."
  );
}

async function fixtureScheduler() {
  const now = Date.now();

  for (const fixture of db.fixtures) {
    if (fixture.started) continue;
    if (fixture.timestamp > now) continue;

    const guild = client.guilds.cache.get(
      fixture.guildId
    );

    if (!guild) continue;

    const channel = getChannel(
      guild,
      IDS.channels.MATCH
    );

    const roleA = guild.roles.cache.get(
      fixture.teamA
    );

    const roleB = guild.roles.cache.get(
      fixture.teamB
    );

    if (!channel || !roleA || !roleB) {
      fixture.started = true;
      continue;
    }

    fixture.started = true;

    saveData();

    await startMatch(
      guild,
      roleA,
      roleB,
      channel
    );
  }
}

/* =========================================================
   CUPS / MUSEUM
   ========================================================= */

async function cupAdd(message) {
  if (!isAdmin(message.member) && !hasRole(message.member, IDS.roles.SPEAKER)) {
    return safeReply(message, "❌ Yetkin yok.");
  }

  const role = mentionRole(message);

  const name = message.content
    .replace(/^\.kupaekle\s*/i, "")
    .replace(/<@&\d+>/, "")
    .trim();

  if (!role || !name) {
    return safeReply(
      message,
      "❌ Kullanım: `.kupaekle @Takım KupaAdı`"
    );
  }

  if (!db.cups[message.guild.id]) {
    db.cups[message.guild.id] = {};
  }

  if (!db.cups[message.guild.id][role.id]) {
    db.cups[message.guild.id][role.id] = [];
  }

  db.cups[message.guild.id][role.id].push(name);

  saveData();

  return message.reply(
    `🏆 **${name}** kupası **${role.name}** müzesine eklendi.`
  );
}

async function cupRemove(message) {
  if (!isAdmin(message.member) && !hasRole(message.member, IDS.roles.SPEAKER)) {
    return safeReply(message, "❌ Yetkin yok.");
  }

  const role = mentionRole(message);

  const name = message.content
    .replace(/^\.kupasil\s*/i, "")
    .replace(/<@&\d+>/, "")
    .trim();

  if (!role || !name) {
    return safeReply(
      message,
      "❌ Kullanım: `.kupasil @Takım KupaAdı`"
    );
  }

  const cups =
    db.cups[message.guild.id]?.[role.id] || [];

  const index = cups.findIndex(
    x => x.toLowerCase() === name.toLowerCase()
  );

  if (index === -1) {
    return safeReply(message, "❌ Kupa bulunamadı.");
  }

  cups.splice(index, 1);

  saveData();

  return message.reply(
    `🗑️ **${name}** kupası kaldırıldı.`
  );
}

async function museum(message) {
  const role = mentionRole(message);

  if (!role) {
    return safeReply(
      message,
      "❌ Kullanım: `.müze @Takım`"
    );
  }

  const cups =
    db.cups[message.guild.id]?.[role.id] || [];

  return message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle(`🏛️ ${role.name} MÜZESİ`)
        .setDescription(
          cups.length
            ? cups.map((x, i) => `${i + 1}. 🏆 ${x}`).join("\n")
            : "Bu takımın henüz kupası yok."
        )
    ]
  });
}

/* =========================================================
   ROLE PANEL
   ========================================================= */

function rolePanelButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ping:partner")
        .setLabel("🤝 Partner Ping")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("ping:match")
        .setLabel("⚽ Maç Ping")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("ping:announcement")
        .setLabel("📢 Duyuru Ping")
        .setStyle(ButtonStyle.Primary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ping:giveaway")
        .setLabel("🎉 Çekiliş Ping")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("ping:media")
        .setLabel("📰 Medya Ping")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

async function rolePanel(message) {
  if (!isAdmin(message.member)) {
    return safeReply(message, "❌ Sadece yönetici kullanabilir.");
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🔔 AXERA LEAGUE BİLDİRİM ROLLERİ")
    .setDescription(
      "İlgilendiğin bildirim rollerini butonlardan açıp kapatabilirsin."
    );

  return message.channel.send({
    embeds: [embed],
    components: rolePanelButtons()
  });
}

/* =========================================================
   CONDITIONS
   ========================================================= */

async function conditions(message) {
  return message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("📋 AXERA LEAGUE ŞARTLAR")
        .setDescription(
          "✓ **Kalıcı Tık:** Kalıcı 「✓」 kanalından onaylayınız.\n\n" +
          "🎭 **Rol Al:** Rol Al kanalından en az **2 rol** alınız.\n\n" +
          "ℹ️ Bu şartlar bilgi amaçlıdır. Sistemleri kullanmanız için zorunlu değildir."
        )
    ]
  });
}

/* =========================================================
   TICKET
   ========================================================= */

async function ticketPanel(message) {
  if (!isAdmin(message.member)) {
    return safeReply(
      message,
      "❌ Sadece yönetici ticket paneli oluşturabilir."
    );
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🎫 DESTEK MERKEZİ")
    .setDescription(
      "Destek almak için aşağıdaki butona bas."
    );

  return message.channel.send({
    embeds: [embed],
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

async function createTicket(interaction) {
  const guild = interaction.guild;

  const existing = guild.channels.cache.find(
    c => c.name === `ticket-${interaction.user.id}`
  );

  if (existing) {
    return interaction.reply({
      content: `❌ Zaten açık ticketın var: ${existing}`,
      ephemeral: true
    });
  }

  const channel = await guild.channels.create({
    name: `ticket-${interaction.user.username}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 80) || `ticket-${interaction.user.id}`,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [
          PermissionsBitField.Flags.ViewChannel
        ]
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
        id: IDS.roles.MOD,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      }
    ]
  }).catch(() => null);

  if (!channel) {
    return interaction.reply({
      content: "❌ Ticket oluşturulamadı.",
      ephemeral: true
    });
  }

  db.tickets[channel.id] = {
    owner: interaction.user.id,
    lastMessage: Date.now()
  };

  saveData();

  await channel.send({
    content: `${interaction.user} <@&${IDS.roles.MOD}>`,
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("🎫 DESTEK TALEBİ")
        .setDescription(
          "Yetkili en kısa sürede ilgilenecektir.\n\n" +
          "Ticketı kapatmak için aşağıdaki butona basabilirsin."
        )
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("ticket:close")
          .setLabel("🔒 Bileti Kapat")
          .setStyle(ButtonStyle.Danger)
      )
    ]
  });

  return interaction.reply({
    content: `✅ Ticket oluşturuldu: ${channel}`,
    ephemeral: true
  });
}

/* =========================================================
   DM
   ========================================================= */

async function sendDM(message) {
  if (!isAdmin(message.member)) {
    return safeReply(message, "❌ Sadece yönetici kullanabilir.");
  }

  const user = mentionUser(message);

  if (!user) {
    return safeReply(
      message,
      "❌ Kullanım: `.dm @Oyuncu mesaj`"
    );
  }

  const text = message.content
    .replace(/^\.dm\s*/i, "")
    .replace(/<@!?\d+>/, "")
    .trim();

  if (!text) {
    return safeReply(message, "❌ Gönderilecek mesajı yaz.");
  }

  try {
    await user.send(
      `📨 **Axera League Yönetim Mesajı**\n\n${text}`
    );

    return safeReply(
      message,
      `✅ Mesaj <@${user.id}> kullanıcısına gönderildi.`
    );
  } catch {
    return safeReply(
      message,
      "❌ Kullanıcıya DM gönderilemedi."
    );
  }
}

/* =========================================================
   MODERATION
   ========================================================= */

async function moderation(message, cmd, args) {
  if (!isAdmin(message.member)) {
    return safeReply(message, "❌ Yetkin yok.");
  }

  const target = mentionMember(message);

  if (["kick", "ban", "mute", "unmute"].includes(cmd)) {
    if (!target) {
      return safeReply(
        message,
        `❌ Kullanım: \`.${cmd} @Oyuncu\``
      );
    }

    if (target.id === message.author.id) {
      return safeReply(
        message,
        "❌ Kendine işlem uygulayamazsın."
      );
    }
  }

  if (cmd === "kick") {
    await target.kick("Axera League yönetim işlemi").catch(() => {});
    return safeReply(
      message,
      `👢 ${target.user.tag} sunucudan atıldı.`
    );
  }

  if (cmd === "ban") {
    await target.ban({
      reason: "Axera League yönetim işlemi"
    }).catch(() => {});

    return safeReply(
      message,
      `🔨 ${target.user.tag} yasaklandı.`
    );
  }

  if (cmd === "mute") {
    await target.timeout(
      60 * 60 * 1000,
      "Axera League mute"
    ).catch(() => {});

    return safeReply(
      message,
      `🔇 ${target.user.tag} 1 saat susturuldu.`
    );
  }

  if (cmd === "unmute") {
    await target.timeout(null).catch(() => {});

    return safeReply(
      message,
      `🔊 ${target.user.tag} susturması kaldırıldı.`
    );
  }
}

/* =========================================================
   EMBED
   ========================================================= */

async function embedCommand(message) {
  if (!isAdmin(message.member)) {
    return safeReply(message, "❌ Yetkin yok.");
  }

  const raw = message.content
    .replace(/^\.embed\s*/i, "");

  const parts = raw.split("|");

  const title = parts.shift()?.trim();
  const description = parts.join("|").trim();

  if (!title || !description) {
    return safeReply(
      message,
      "❌ Kullanım: `.embed Başlık | Açıklama`"
    );
  }

  return message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(title)
        .setDescription(description)
    ]
  });
}

/* =========================================================
   CLEAR
   ========================================================= */

async function clearMessages(message, amount) {
  if (!isAdmin(message.member)) {
    return safeReply(message, "❌ Yetkin yok.");
  }

  const n = Number(amount);

  if (!Number.isInteger(n) || n < 1 || n > 1000) {
    return safeReply(
      message,
      "❌ 1 ile 1000 arasında bir sayı gir."
    );
  }

  let remaining = n;
  let deleted = 0;

  while (remaining > 0) {
    const batch = Math.min(remaining, 100);

    const messages = await message.channel
      .bulkDelete(batch, true)
      .catch(() => null);

    if (!messages || !messages.size) break;

    deleted += messages.size;
    remaining -= messages.size;

    if (messages.size < batch) break;
  }

  return safeReply(
    message,
    `🧹 **${deleted}** mesaj silindi.`
  );
}

/* =========================================================
   LOCK / UNLOCK
   ========================================================= */

async function lockChannel(message, lock) {
  if (!isAdmin(message.member)) {
    return safeReply(message, "❌ Yetkin yok.");
  }

  await message.channel.permissionOverwrites
    .edit(
      message.guild.roles.everyone,
      {
        SendMessages: !lock
      }
    )
    .catch(() => {});

  return safeReply(
    message,
    lock
      ? "🔒 Kanal kilitlendi."
      : "🔓 Kanal açıldı."
  );
}

/* =========================================================
   ROLE GIVE / REMOVE
   ========================================================= */

async function roleCommand(message, add) {
  if (!isAdmin(message.member)) {
    return safeReply(message, "❌ Yetkin yok.");
  }

  const role = mentionRole(message);
  const user = mentionUser(message);

  if (!role || !user) {
    return safeReply(
      message,
      `❌ Kullanım: \`.${add ? "rolver" : "rolal"} @rol @oyuncu\``
    );
  }

  const member = await message.guild.members
    .fetch(user.id)
    .catch(() => null);

  if (!member) {
    return safeReply(message, "❌ Kullanıcı bulunamadı.");
  }

  if (
    role.position >=
    message.guild.members.me.roles.highest.position
  ) {
    return safeReply(
      message,
      "❌ Bot bu rolü yönetemiyor."
    );
  }

  if (add) {
    await member.roles.add(role).catch(() => {});
  } else {
    await member.roles.remove(role).catch(() => {});
  }

  return safeReply(
    message,
    `✅ ${role} rolü ${user} için ${add ? "verildi" : "alındı"}.`
  );
}

/* =========================================================
   PROFILE
   ========================================================= */

async function profile(message) {
  const user = mentionUser(message) || message.author;

  const member = await message.guild.members
    .fetch(user.id)
    .catch(() => null);

  const data = getUser(
    message.guild.id,
    user.id
  );

  if (!data.registered && user.id !== message.author.id) {
    return safeReply(
      message,
      "❌ Bu kullanıcı kayıtlı değil."
    );
  }

  return message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`⚽ ${member?.displayName || user.username}`)
        .setThumbnail(user.displayAvatarURL())
        .setDescription(
          `👤 Oyuncu: ${user}\n` +
          `🎭 Tür: **${data.roleType || "Kayıtsız"}**\n` +
          `📍 Mevki: **${data.position}**\n` +
          `🌍 Ülke: **${data.country}**\n\n` +
          `💰 Değer: **${moneyM(data.value)}**\n` +
          `⭐ OVR: **${data.ovr}**\n` +
          `🏋️ Antrenman: **${data.training}/5**\n` +
          `🥅 Penaltı: **${data.penaltyGoals}/${data.penaltyAttempts}**\n` +
          `⚽ Gol: **${data.goals}**\n` +
          `👟 Asist: **${data.assists}**\n` +
          `🏟️ Maç: **${data.matches}**`
        )
    ]
  });
}

/* =========================================================
   HELP
   ========================================================= */

async function help(message) {
  const text =
    "**👤 OYUNCU**\n" +
    "`.profil` `.ara futbolcu isim` `.değerler`\n\n" +

    "**🏋️ GELİŞİM**\n" +
    "`.ant` `.antrenman` `.pen` `.penaltı`\n\n" +

    "**💰 DEĞER**\n" +
    "`.dver @oyuncu 5M`\n" +
    "`.dsil @oyuncu 5M`\n" +
    "`.değerler`\n\n" +

    "**⚽ TAKIM / LİG**\n" +
    "`.takımekle`\n" +
    "`.takımkaldır`\n" +
    "`.takımdeğer`\n" +
    "`.kadroekle`\n" +
    "`.kadrocikar`\n" +
    "`.kadro`\n" +
    "`.formasyon`\n" +
    "`.puan`\n" +
    "`.puanekle`\n\n" +

    "**📅 FİKSTÜR**\n" +
    "`.fiksturekle`\n" +
    "`.fikstür`\n" +
    "`.fiksturcikar`\n\n" +

    "**🏆 KUPA**\n" +
    "`.kupaekle`\n" +
    "`.kupasil`\n" +
    "`.müze`\n\n" +

    "**📨 DESTEK**\n" +
    "`.ticketpanel`\n" +
    "`.dm @oyuncu mesaj`\n\n" +

    "**🔔 ROL**\n" +
    "`.rolpanel`\n" +
    "`.şart`\n\n" +

    "**🛡️ YÖNETİM**\n" +
    "`.rolver` `.rolal`\n" +
    "`.sil` `.lock` `.unlock`\n" +
    "`.kick` `.ban` `.mute` `.unmute`\n" +
    "`.embed`\n\n" +

    "**🤖 AI**\n" +
    "AI kanalında normal mesaj yazabilir veya `.ai soru` kullanabilirsin.";

  return message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🤖 AXERA LEAGUE KOMUTLARI")
        .setDescription(text)
    ]
  });
}

/* =========================================================
   AI
   ========================================================= */

function getAIMemory(guildId, userId) {
  const key = `${guildId}:${userId}`;

  if (!db.aiMemory[key]) {
    db.aiMemory[key] = [];
  }

  return db.aiMemory[key];
}

async function askAI(message, prompt) {
  if (!openai) {
    return safeReply(
      message,
      "❌ AI aktif değil. Railway'de `OPENAI_API_KEY` değişkenini ekle."
    );
  }

  if (!prompt?.trim()) {
    return safeReply(
      message,
      "❌ AI'ye soracağın soruyu yaz."
    );
  }

  const memory = getAIMemory(
    message.guild.id,
    message.author.id
  );

  if (
    prompt.trim().toLowerCase() ===
    "seni kim kurdu?"
  ) {
    return safeReply(
      message,
      "Lynox9380 kurdu."
    );
  }

  memory.push({
    role: "user",
    content: prompt.slice(0, 2000)
  });

  const recent = memory.slice(-8);

  try {
    const response = await openai.responses.create({
      model: AI_MODEL,
      instructions:
        "Sen Axera isimli Discord AI asistanısın. " +
        "Türkçe konuş. Kısa, hızlı ve anlaşılır cevaplar ver. " +
        "Axera League futbol RP sunucusuna yardımcı ol. " +
        "Kendini OpenAI olarak tanıtma; adın Axera. " +
        "Sunucu üzerinde gerçek Discord işlemleri yapıyormuş gibi yalan söyleme. " +
        "Kullanıcı senden sunucu yönetimi istediğinde ilgili Discord komutunu öner. " +
        "Kullanıcı 'seni kim kurdu?' diye sorarsa tam olarak 'Lynox9380 kurdu.' de.",
      input: recent
    });

    let answer =
      response.output_text?.trim() ||
      "❌ Şu anda cevap oluşturamadım.";

    memory.push({
      role: "assistant",
      content: answer.slice(0, 4000)
    });

    db.aiMemory[
      `${message.guild.id}:${message.author.id}`
    ] = memory.slice(-10);

    saveData();

    const chunks = splitLongText(answer);

    for (const chunk of chunks) {
      await safeSend(message.channel, {
        content: chunk
      });
    }
  } catch (err) {
    console.error("OpenAI hatası:", err);

    return safeReply(
      message,
      "❌ AI şu anda cevap veremiyor. Railway'deki `OPENAI_API_KEY` ve model ayarlarını kontrol et."
    );
  }
}

/* =========================================================
   AI CHANNEL AUTO RESPONSE
   ========================================================= */

async function handleAIChannel(message) {
  if (
    message.channel.id !== IDS.channels.AI ||
    message.author.bot
  ) {
    return false;
  }

  if (message.content.startsWith(PREFIX)) {
    return false;
  }

  await askAI(
    message,
    message.content
  );

  return true;
}

/* =========================================================
   STATUS
   ========================================================= */

async function sendStatus() {
  for (const guild of client.guilds.cache.values()) {
    const channel = getChannel(
      guild,
      IDS.channels.STATUS
    );

    if (!channel) continue;

    const users =
      guild.memberCount || 0;

    const activeMatches =
      matchTimers.size;

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
      .setColor(0x57f287)
      .setTitle("🤖 AXERA BOT DURUMU")
      .setDescription(
        "🟢 **Bot aktif ve çalışıyor.**\n\n" +
        `👥 Sunucu Üyesi: **${users}**\n` +
        `⚽ Aktif Maç: **${activeMatches}**\n` +
        `⏱️ Uptime: **${hours}s ${minutes}dk ${seconds}sn**\n` +
        `🤖 AI: **${openai ? "Aktif" : "Kapalı"}**\n` +
        `🧠 Model: **${AI_MODEL}**`
      )
      .setFooter({
        text: "Axera League • Durum Sistemi"
      })
      .setTimestamp();

    await safeSend(channel, {
      embeds: [embed]
    });
  }
}

/* =========================================================
   REGISTER PANEL ON JOIN
   ========================================================= */

client.on("guildMemberAdd", async member => {
  try {
    const role = member.guild.roles.cache.get(
      IDS.roles.UNREGISTERED
    );

    if (role) {
      await member.roles.add(role).catch(() => {});
    }

    const channel = getChannel(
      member.guild,
      IDS.channels.REGISTER
    );

    if (channel) {
      await safeSend(channel, {
        content:
          `👋 Hoş geldin ${member}!\n` +
          `<@&${IDS.roles.REGISTER}> kayıt işlemi için yardımcı olacaktır.`
      });
    }
  } catch (err) {
    console.error("guildMemberAdd:", err);
  }
});

/* =========================================================
   BUTTONS
   ========================================================= */

client.on("interactionCreate", async interaction => {
  try {
    if (!interaction.isButton()) return;

    /* REGISTRATION */

    if (
      interaction.customId.startsWith("register:")
    ) {
      const parts =
        interaction.customId.split(":");

      return completeRegistration(
        interaction,
        parts[1],
        parts[2]
      );
    }

    /* PING ROLES */

    if (
      interaction.customId.startsWith("ping:")
    ) {
      const type =
        interaction.customId.split(":")[1];

      const map = {
        partner: IDS.roles.PARTNER_PING,
        match: IDS.roles.MATCH_PING,
        announcement: IDS.roles.ANNOUNCEMENT_PING,
        giveaway: IDS.roles.GIVEAWAY_PING,
        media: IDS.roles.MEDIA_PING
      };

      const roleId = map[type];

      if (!roleId) {
        return interaction.reply({
          content: "❌ Rol bulunamadı.",
          ephemeral: true
        });
      }

      const member = interaction.member;

      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId);

        return interaction.reply({
          content: "🔕 Bildirim rolü kaldırıldı.",
          ephemeral: true
        });
      }

      await member.roles.add(roleId);

      return interaction.reply({
        content: "🔔 Bildirim rolü eklendi.",
        ephemeral: true
      });
    }

    /* FORMATION */

    if (
      interaction.customId.startsWith("formation:")
    ) {
      if (
        !isAdmin(interaction.member) &&
        !hasRole(
          interaction.member,
          IDS.roles.SPEAKER
        )
      ) {
        return interaction.reply({
          content: "❌ Yetkin yok.",
          ephemeral: true
        });
      }

      const parts =
        interaction.customId.split(":");

      const teamId = parts[1];
      const selected = parts[2];

      const team = getTeam(
        interaction.guild.id,
        teamId
      );

      if (!team) {
        return interaction.reply({
          content: "❌ Takım bulunamadı.",
          ephemeral: true
        });
      }

      team.formation = selected;

      saveData();

      return interaction.update({
        content:
          `⚽ **${team.name}** formasyonu: **${selected}**`,
        components: []
      });
    }

    /* TICKET CREATE */

    if (
      interaction.customId === "ticket:create"
    ) {
      return createTicket(interaction);
    }

    /* TICKET CLOSE */

    if (
      interaction.customId === "ticket:close"
    ) {
      const owner =
        db.tickets[interaction.channel.id]?.owner;

      const canClose =
        isAdmin(interaction.member) ||
        hasRole(
          interaction.member,
          IDS.roles.MOD
        ) ||
        owner === interaction.user.id;

      if (!canClose) {
        return interaction.reply({
          content: "❌ Bu ticketı kapatamazsın.",
          ephemeral: true
        });
      }

      delete db.tickets[
        interaction.channel.id
      ];

      saveData();

      await interaction.reply(
        "🔒 Ticket kapatılıyor..."
      );

      setTimeout(() => {
        interaction.channel
          .delete()
          .catch(() => {});
      }, 1500);

      return;
    }
  } catch (err) {
    console.error("interactionCreate:", err);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ İşlem sırasında hata oluştu.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

/* =========================================================
   MESSAGE CREATE
   ========================================================= */

client.on("messageCreate", async message => {
  try {
    if (
      message.author.bot ||
      !message.guild
    ) {
      return;
    }

    /* AI CHANNEL */

    const handledAI =
      await handleAIChannel(message);

    if (handledAI) return;

    if (
      !message.content.startsWith(PREFIX)
    ) {
      return;
    }

    const raw =
      message.content.slice(PREFIX.length).trim();

    if (!raw) return;

    const parts =
      raw.split(/\s+/);

    const cmd =
      (parts.shift() || "").toLowerCase();

    const args = parts;

    /* REGISTRATION */

    if (cmd === "k") {
      return registrationCommand(message);
    }

    if (
      cmd === "kayıtsızver" ||
      cmd === "kayitsizver"
    ) {
      if (!hasRole(message.member, IDS.roles.REGISTER)) {
        return safeReply(
          message,
          "❌ Kayıt yetkin yok."
        );
      }

      const user = mentionUser(message);

      if (!user) {
        return safeReply(
          message,
          "❌ Kullanım: `.kayıtsızver @Oyuncu`"
        );
      }

      const member =
        await message.guild.members
          .fetch(user.id)
          .catch(() => null);

      if (!member) {
        return safeReply(
          message,
          "❌ Kullanıcı bulunamadı."
        );
      }

      for (const id of [
        IDS.roles.PLAYER,
        IDS.roles.MEMBER,
        IDS.roles.TD
      ]) {
        await member.roles.remove(id).catch(() => {});
      }

      await member.roles.add(
        IDS.roles.UNREGISTERED
      ).catch(() => {});

      getUser(
        message.guild.id,
        user.id
      ).registered = false;

      saveData();

      return safeReply(
        message,
        `✅ ${user} tekrar **Kayıtsız** yapıldı.`
      );
    }

    /* AI */

    if (cmd === "ai" || cmd === "yapayzeka") {
      return askAI(
        message,
        args.join(" ")
      );
    }

    /* HELP */

    if (
      cmd === "yardım" ||
      cmd === "yardim" ||
      cmd === "help"
    ) {
      return help(message);
    }

    /* TRAINING */

    if (
      cmd === "ant" ||
      cmd === "antrenman"
    ) {
      return training(message);
    }

    /* PENALTY */

    if (
      cmd === "pen" ||
      cmd === "penaltı" ||
      cmd === "penalti"
    ) {
      return penalty(message);
    }

    /* VALUE */

    if (
      cmd === "dver" ||
      cmd === "dsil"
    ) {
      if (
        !hasRole(
          message.member,
          IDS.roles.VALUE
        )
      ) {
        return safeReply(
          message,
          "❌ Değer Yetkilisi yetkin yok."
        );
      }

      if (
        !isChannel(
          message,
          IDS.channels.VALUE
        )
      ) {
        return safeReply(
          message,
          "❌ Bu komut sadece değer kanalında kullanılabilir."
        );
      }

      const user =
        mentionUser(message);

      const amount =
        parseM(args.find(x =>
          /^\d+(?:[.,]\d+)?M€?$/i.test(x)
        ));

      if (
        !user ||
        !Number.isFinite(amount)
      ) {
        return safeReply(
          message,
          `❌ Kullanım: \`.${cmd} @Oyuncu 5M\``
        );
      }

      const result =
        await changePlayerValue(
          message.guild,
          user,
          cmd === "dver"
            ? amount
            : -amount
        );

      return safeReply(
        message,
        `✅ <@${user.id}> yeni değeri: **${moneyM(result.newValue)}**`
      );
    }

    if (
      cmd === "değerler" ||
      cmd === "degerler"
    ) {
      const members =
        await message.guild.members.fetch();

      const rows = [];

      for (const member of members.values()) {
        if (member.user.bot) continue;

        const user =
          getUser(
            message.guild.id,
            member.id
          );

        if (!user.registered) continue;

        rows.push({
          member,
          user
        });
      }

      rows.sort(
        (a, b) =>
          b.user.value - a.user.value
      );

      const text =
        rows
          .slice(0, 15)
          .map(
            (x, i) =>
              `${i + 1}. ${x.member} — **${moneyM(x.user.value)}**`
          )
          .join("\n") ||
        "Henüz kayıtlı oyuncu yok.";

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xf1c40f)
            .setTitle("💰 AXERA LEAGUE DEĞER SIRALAMASI")
            .setDescription(text)
        ]
      });
    }

    /* SEARCH */

    if (cmd === "ara") {
      if (
        (args[0] || "").toLowerCase() !==
        "futbolcu"
      ) {
        return safeReply(
          message,
          "❌ Kullanım: `.ara futbolcu isim`"
        );
      }

      return searchPlayer(
        message,
        args.slice(1).join(" ")
      );
    }

    /* PROFILE */

    if (
      cmd === "profil" ||
      cmd === "profile"
    ) {
      return profile(message);
    }

    /* TWEET */

    if (cmd === "tweet") {
      return tweet(message);
    }

    /* TEAM */

    if (cmd === "takımekle" || cmd === "takimekle") {
      return teamAdd(message);
    }

    if (
      cmd === "takımkaldır" ||
      cmd === "takimkaldir"
    ) {
      return teamRemove(message);
    }

    if (
      cmd === "takımdeğer" ||
      cmd === "takimdeger"
    ) {
      return teamValue(message);
    }

    /* SQUAD */

    if (cmd === "kadroekle") {
      return squadAdd(message);
    }

    if (cmd === "kadrocikar") {
      return squadRemove(message);
    }

    if (cmd === "kadro") {
      return squad(message);
    }

    if (cmd === "formasyon") {
      return formation(message);
    }

    /* STANDINGS */

    if (
      cmd === "puan" ||
      cmd === "puandurumu"
    ) {
      return standings(message);
    }

    if (cmd === "puanekle") {
      return addPoints(message);
    }

    /* FIXTURE */

    if (
      cmd === "fikstür" ||
      cmd === "fikstur"
    ) {
      return fixtureList(message);
    }

    if (
      cmd === "fiksturekle" ||
      cmd === "fikstürekle"
    ) {
      return fixtureAdd(message);
    }

    if (
      cmd === "fiksturcikar" ||
      cmd === "fikstürcikar"
    ) {
      return fixtureRemove(message);
    }

    /* MATCH */

    if (
      cmd === "maç" ||
      cmd === "mac"
    ) {
      if (
        !isAdmin(message.member) &&
        !hasRole(
          message.member,
          IDS.roles.SPEAKER
        )
      ) {
        return safeReply(
          message,
          "❌ Bu komut sadece Spiker/Yönetici içindir."
        );
      }

      if (
        !isChannel(
          message,
          IDS.channels.MATCH
        )
      ) {
        return safeReply(
          message,
          "❌ Bu komut sadece maç kanalında kullanılabilir."
        );
      }

      const a =
        mentionRole(message, 0);

      const b =
        mentionRole(message, 1);

      if (!a || !b) {
        return safeReply(
          message,
          "❌ Kullanım: `.maç @Takım1 @Takım2`"
        );
      }

      return startMatch(
        message.guild,
        a,
        b,
        message.channel
      );
    }

    /* CUPS */

    if (cmd === "kupaekle") {
      return cupAdd(message);
    }

    if (cmd === "kupasil") {
      return cupRemove(message);
    }

    if (
      cmd === "müze" ||
      cmd === "muze"
    ) {
      return museum(message);
    }

    /* ROLE PANEL */

    if (cmd === "rolpanel") {
      return rolePanel(message);
    }

    /* CONDITIONS */

    if (
      cmd === "şart" ||
      cmd === "sart"
    ) {
      return conditions(message);
    }

    /* TICKET */

    if (cmd === "ticketpanel") {
      return ticketPanel(message);
    }

    /* TARGETED DM */

    if (cmd === "dm") {
      return sendDM(message);
    }

    /* MODERATION */

    if (
      ["kick", "ban", "mute", "unmute"]
        .includes(cmd)
    ) {
      return moderation(
        message,
        cmd,
        args
      );
    }

    /* CLEAR */

    if (cmd === "sil") {
      return clearMessages(
        message,
        args[0]
      );
    }

    /* LOCK */

    if (
      cmd === "lock" ||
      cmd === "kilit"
    ) {
      return lockChannel(
        message,
        true
      );
    }

    if (
      cmd === "unlock" ||
      cmd === "kilitaç" ||
      cmd === "kilitac"
    ) {
      return lockChannel(
        message,
        false
      );
    }

    /* ROLE */

    if (cmd === "rolver") {
      return roleCommand(
        message,
        true
      );
    }

    if (cmd === "rolal") {
      return roleCommand(
        message,
        false
      );
    }

    /* EMBED */

    if (cmd === "embed") {
      return embedCommand(message);
    }

    /* PING */

    if (cmd === "ping") {
      return safeReply(
        message,
        `🏓 Pong! **${client.ws.ping}ms**`
      );
    }
  } catch (err) {
    console.error(
      `Komut hatası [${message.content}]:`,
      err
    );

    return safeReply(
      message,
      "❌ Komut çalışırken bir hata oluştu. Konsolu kontrol et."
    );
  }
});

/* =========================================================
   TICKET AUTO CLOSE
   ========================================================= */

setInterval(async () => {
  const now = Date.now();

  for (const [channelId, ticket] of Object.entries(
    db.tickets
  )) {
    if (
      now - ticket.lastMessage <
      60 * 60 * 1000
    ) {
      continue;
    }

    const channel =
      client.channels.cache.get(channelId);

    if (channel) {
      await channel.delete().catch(() => {});
    }

    delete db.tickets[channelId];
  }

  saveData();
}, 60 * 1000);

/* =========================================================
   TRACK TICKET MESSAGES
   ========================================================= */

client.on("messageCreate", message => {
  if (!message.guild) return;
  if (!db.tickets[message.channel.id]) return;

  db.tickets[message.channel.id].lastMessage =
    Date.now();

  saveData();
});

/* =========================================================
   STANDINGS UPDATE
   ========================================================= */

async function sendStandingsUpdate(guild) {
  const channel = getChannel(
    guild,
    IDS.channels.STANDINGS
  );

  if (!channel) return;

  const rows = Object.values(
    db.standings[guild.id] || {}
  );

  if (!rows.length) return;

  rows.sort((a, b) => {
    const gdA =
      a.goalsFor - a.goalsAgainst;

    const gdB =
      b.goalsFor - b.goalsAgainst;

    return (
      b.points - a.points ||
      gdB - gdA ||
      b.goalsFor - a.goalsFor
    );
  });

  const text = rows
    .map((x, i) => {
      const gd =
        x.goalsFor - x.goalsAgainst;

      return (
        `**${i + 1}. ${x.name}** — ` +
        `**${x.points} P** • ` +
        `${x.wins}G ${x.draws}B ${x.losses}M • ` +
        `AV ${gd >= 0 ? "+" : ""}${gd}`
      );
    })
    .join("\n");

  await safeSend(channel, {
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("🏆 GÜNCEL PUAN DURUMU")
        .setDescription(text)
        .setTimestamp()
    ]
  });
}

/* =========================================================
   SCHEDULERS
   ========================================================= */

setInterval(() => {
  fixtureScheduler().catch(err =>
    console.error(
      "Fixture scheduler:",
      err
    )
  );
}, 1000);

/*
  Her 30 dakikada bir durum mesajı.
  Böylece 00 ve 30 dakikaları da kapsanır.
*/
setInterval(() => {
  sendStatus().catch(err =>
    console.error(
      "Status sistemi:",
      err
    )
  );
}, 30 * 60 * 1000);

/* =========================================================
   READY
   ========================================================= */

client.once("ready", async () => {
  console.log(
    `✅ ${client.user.tag} aktif!`
  );

  client.user.setPresence({
    activities: [
      {
        name: "Axera League | Futbol RP",
        type: 0
      }
    ],
    status: "online"
  });

  await sendStatus().catch(() => {});

  console.log(
    "🤖 AI:",
    openai ? "AKTİF" : "KAPALI"
  );

  console.log(
    "🧠 Model:",
    AI_MODEL
  );

  console.log(
    "📋 Kayıt kanalı:",
    IDS.channels.REGISTER
  );

  console.log(
    "📢 Durum kanalı:",
    IDS.channels.STATUS
  );

  console.log(
    "🤖 AI kanalı:",
    IDS.channels.AI
  );
});

/* =========================================================
   ERROR HANDLING
   ========================================================= */

process.on("unhandledRejection", err => {
  console.error(
    "UNHANDLED REJECTION:",
    err
  );
});

process.on("uncaughtException", err => {
  console.error(
    "UNCAUGHT EXCEPTION:",
    err
  );
});

/* =========================================================
   ENV CHECK
   ========================================================= */

if (!process.env.TOKEN) {
  console.error(
    "❌ TOKEN bulunamadı!"
  );

  process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
  console.warn(
    "⚠️ OPENAI_API_KEY bulunamadı. AI kapalı çalışacak."
  );
}

/* =========================================================
   LOGIN
   ========================================================= */

client.login(process.env.TOKEN);
