require("dotenv").config();

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
  ChannelType
} = require("discord.js");

/* =========================================================
   AXERA LEAGUE
   TEK PARÇA DISCORD BOT
   ========================================================= */

const TOKEN = process.env.TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!TOKEN) {
  console.error("❌ TOKEN Railway Variables içinde bulunamadı.");
  process.exit(1);
}

/* =========================
   IDLER
========================= */

const IDS = {
  roles: {
    admin: "1534455282426445897",
    register: "1534456315366342716",
    value: "1534456192913375382",
    unregistered: "1534457560134844517",
    player: "1534457228986421278",
    td: "1534456648930693120",
    member: "1534457460163608636",
    moderator: "1534456108415189063",
    commentator: "1535251168169697390",

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
  }
};

const PREFIX = ".";
const MAX_VALUE = 1000;
const AI_MODEL = "gpt-5.6-luna";

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

/* =========================
   OPENAI
========================= */

const openai = OPENAI_API_KEY
  ? new OpenAI({ apiKey: OPENAI_API_KEY })
  : null;

/* =========================
   DATA
========================= */

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
  matchHistory: {}
};

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(DEFAULT_DATA, null, 2)
      );
      return structuredClone(DEFAULT_DATA);
    }

    const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

    return {
      ...structuredClone(DEFAULT_DATA),
      ...raw,
      users: raw.users || {},
      teams: raw.teams || {},
      standings: raw.standings || {},
      fixtures: raw.fixtures || [],
      activeMatches: raw.activeMatches || {},
      tickets: raw.tickets || {},
      cups: raw.cups || {},
      formations: raw.formations || {},
      training: raw.training || {},
      tweetCooldowns: raw.tweetCooldowns || {},
      matchRewards: raw.matchRewards || {},
      stats: raw.stats || {},
      matchHistory: raw.matchHistory || {}
    };
  } catch (err) {
    console.error("data.json okunamadı:", err);

    return structuredClone(DEFAULT_DATA);
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
    console.error("data.json kayıt hatası:", err);
  }
}

/* =========================
   GENEL YARDIMCILAR
========================= */

function isAdmin(member) {
  return (
    member?.permissions?.has(PermissionFlagsBits.Administrator) ||
    member?.roles?.cache?.has(IDS.roles.admin)
  );
}

function hasRole(member, roleId) {
  return member?.roles?.cache?.has(roleId);
}

function hasAnyRole(member, roles) {
  return roles.some((r) => hasRole(member, r));
}

function commandPermission(member, roleIds = []) {
  return isAdmin(member) || hasAnyRole(member, roleIds);
}

function getMemberValue(member) {
  const id = member.id;

  if (
    db.users[id] &&
    Number.isFinite(Number(db.users[id].value))
  ) {
    return Number(db.users[id].value);
  }

  const parsed = parseNicknameValue(member.displayName);

  if (parsed !== null) return parsed;

  return 0;
}

function ensureUser(id) {
  if (!db.users[id]) {
    db.users[id] = {
      value: 0,
      registered: false,
      roleType: null
    };
  }

  return db.users[id];
}

/*
  Sadece nickname'in SONUNDA bulunan:
  123M€
  kısmını okur.
*/
function parseNicknameValue(nickname) {
  const match = String(nickname).match(/(\d+(?:[.,]\d+)?)M€\s*$/i);

  if (!match) return null;

  return Number(match[1].replace(",", "."));
}

/*
  Nickname'in sonundaki M€ değerini değiştirir.
  İsim / bayrak / pozisyon / ayraç korunur.
*/
function replaceNicknameValue(nickname, newValue) {
  const value = Math.max(
    0,
    Math.min(MAX_VALUE, Number(newValue) || 0)
  );

  const formatted = `${Number.isInteger(value) ? value : value.toFixed(1)}M€`;

  if (/(\d+(?:[.,]\d+)?)M€\s*$/i.test(nickname)) {
    return nickname.replace(
      /(\d+(?:[.,]\d+)?)M€\s*$/i,
      formatted
    );
  }

  return `${nickname} | ${formatted}`;
}

/*
  ANA DEĞER FONKSİYONU.

  Bütün sistemler burayı kullanır:
  - dver
  - dsil
  - antrenman
  - penaltı
  - tweet
  - maç
*/
async function changePlayerValue(member, amount, reason = "") {
  if (!member) {
    return {
      success: false,
      reason: "Oyuncu bulunamadı."
    };
  }

  amount = Number(amount);

  if (!Number.isFinite(amount)) {
    return {
      success: false,
      reason: "Geçersiz miktar."
    };
  }

  const oldNickname = member.nickname || member.user.username;

  let current = getMemberValue(member);

  /*
    ÖNEMLİ:
    Eğer data.json'da değer 0 ise nickname'deki değer
    önce okunuyor.
  */
  const nicknameValue = parseNicknameValue(oldNickname);

  if (
    nicknameValue !== null &&
    (!db.users[member.id] ||
      Number(db.users[member.id].value || 0) <= 0)
  ) {
    current = nicknameValue;
  }

  let newValue = current + amount;

  if (newValue > MAX_VALUE) {
    newValue = MAX_VALUE;
  }

  if (newValue < 0) {
    newValue = 0;
  }

  ensureUser(member.id).value = newValue;

  try {
    await member.setNickname(
      replaceNicknameValue(oldNickname, newValue),
      reason
    );
  } catch (err) {
    console.error(
      `Nickname değiştirilemedi (${member.user.tag}):`,
      err.message
    );
  }

  saveData();

  return {
    success: true,
    oldValue: current,
    newValue,
    changed: newValue - current
  };
}

function parseAmount(text) {
  if (!text) return null;

  const clean = String(text)
    .trim()
    .replace(/€/g, "")
    .replace(/m/gi, "");

  if (!/^\d+(?:[.,]\d+)?$/.test(clean)) {
    return null;
  }

  const value = Number(clean.replace(",", "."));

  if (!Number.isFinite(value)) return null;

  return value;
}

function isCommandMessage(message) {
  return message.content.startsWith(PREFIX);
}

function getCommand(message) {
  return message.content
    .slice(PREFIX.length)
    .trim()
    .split(/\s+/)[0]
    .toLowerCase();
}

function getArgs(message) {
  return message.content
    .slice(PREFIX.length)
    .trim()
    .split(/\s+/)
    .slice(1);
}

function mentionMember(message) {
  return message.mentions.members.first();
}

function channelOnly(message, channelId) {
  if (message.channel.id !== channelId) {
    message.reply(
      `❌ Bu komut sadece <#${channelId}> kanalında kullanılabilir.`
    );
    return false;
  }

  return true;
}

function embed(title, description) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function splitMessage(text, max = 1900) {
  const result = [];

  while (text.length > max) {
    let cut = text.lastIndexOf("\n", max);

    if (cut < 500) cut = max;

    result.push(text.slice(0, cut));
    text = text.slice(cut);
  }

  if (text.length) result.push(text);

  return result;
}

/* =========================
   KAYIT
========================= */

function registrationButtons(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`register_player_${userId}`)
      .setLabel("Futbolcu")
      .setEmoji("⚽")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`register_member_${userId}`)
      .setLabel("Üye")
      .setEmoji("👤")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`register_td_${userId}`)
      .setLabel("Teknik Direktör")
      .setEmoji("🧑‍💼")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`register_keeper_${userId}`)
      .setLabel("Kaleci")
      .setEmoji("🧤")
      .setStyle(ButtonStyle.Primary)
  );
}

async function registerUser(member, type, nickname) {
  const removeRoles = [
    IDS.roles.unregistered,
    IDS.roles.player,
    IDS.roles.member,
    IDS.roles.td
  ];

  for (const role of removeRoles) {
    if (member.roles.cache.has(role)) {
      await member.roles.remove(role).catch(() => {});
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
    selectedRole = IDS.roles.player;
    roleName = "Kaleci";
  }

  await member.roles.add(selectedRole).catch(() => {});

  if (nickname && nickname.trim()) {
    await member.setNickname(
      nickname.trim(),
      "Axera League kayıt"
    ).catch(() => {});
  }

  ensureUser(member.id).registered = true;
  ensureUser(member.id).roleType = type;

  saveData();

  return roleName;
}

async function createRegistrationPanel(channel, user) {
  const target = user;

  const panel = await channel.send({
    embeds: [
      embed(
        "📋 Axera League Kayıt",
        `👤 Oyuncu: ${target}\n\nAşağıdaki butonlardan uygun rolü seçin.`
      )
    ],
    components: [registrationButtons(target.id)]
  });

  db.registrationPanels[panel.id] = target.id;
  saveData();

  return panel;
}

/* =========================
   ARAMA
========================= */

function searchMembers(guild, query) {
  const members = guild.members.cache
    .filter((m) => {
      if (m.user.bot) return false;

      const data = db.users[m.id];

      return data?.registered === true;
    })
    .map((m) => {
      const fields = [
        m.displayName,
        m.user.username,
        m.nickname || ""
      ].map((x) => x.toLowerCase());

      const q = query.toLowerCase();

      let score = 0;

      if (fields.includes(q)) score = 0;
      else if (fields.some((x) => x.startsWith(q))) score = 1;
      else if (fields.some((x) => x.includes(q))) score = 2;
      else return null;

      return { member: m, score };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score);

  return members.map((x) => x.member);
}

/* =========================
   ANTRENMAN
========================= */

async function trainingCommand(message) {
  if (!channelOnly(message, IDS.channels.training)) return;

  const id = message.author.id;

  if (!db.training[id]) {
    db.training[id] = {
      count: 0
    };
  }

  db.training[id].count++;

  if (db.training[id].count >= 5) {
    db.training[id].count = 0;

    const result = await changePlayerValue(
      message.member,
      3,
      "Antrenman ödülü"
    );

    saveData();

    if (!result.success) {
      return message.reply("❌ Antrenman ödülü verilemedi.");
    }

    return message.reply(
      `🏋️ **Antrenman tamamlandı!**\n\n` +
      `🎁 Ödül: **+3M€**\n` +
      `💰 Yeni değer: **${result.newValue}M€**\n` +
      `🔄 Antrenman: **0/5**`
    );
  }

  saveData();

  return message.reply(
    `🏋️ Antrenman yapıldı!\n\n` +
    `📊 İlerleme: **${db.training[id].count}/5**\n` +
    `🎁 5/5 tamamlayınca **+3M€** kazanırsın.`
  );
}

/* =========================
   PENALTI
========================= */

async function penaltyCommand(message) {
  if (!channelOnly(message, IDS.channels.penalty)) return;

  const random = Math.random();

  if (random < 0.50) {
    const result = await changePlayerValue(
      message.member,
      5,
      "Penaltı gol ödülü"
    );

    if (!result.success) {
      return message.reply("❌ Gol ödülü verilemedi.");
    }

    return message.reply(
      `⚽ **GOOOL!**\n\n` +
      `🧤 Axera Kalecisi penaltıyı çıkaramadı.\n` +
      `🎁 Ödül: **+5M€**\n` +
      `💰 Yeni değer: **${result.newValue}M€**`
    );
  }

  if (random < 0.75) {
    return message.reply(
      `🥅 **DİREK!**\n\nTop direkten döndü.\n` +
      `💰 Bu penaltıdan değer kazanamadın.`
    );
  }

  return message.reply(
    `🧤 **KURTARDI!**\n\nAxera Kalecisi penaltıyı çıkardı.`
  );
}

/* =========================
   DEĞER
========================= */

async function valueAddCommand(message, remove = false) {
  if (!channelOnly(message, IDS.channels.value)) return;

  if (
    !commandPermission(message.member, [IDS.roles.value])
  ) {
    return message.reply("❌ Bu komutu sadece Değer Yetkilisi kullanabilir.");
  }

  const target = mentionMember(message);

  if (!target) {
    return message.reply(
      `❌ Kullanım: \`.${remove ? "dsil" : "dver"} @Oyuncu 5M\``
    );
  }

  const args = getArgs(message);
  const amount = parseAmount(args[1]);

  if (amount === null || amount <= 0) {
    return message.reply("❌ Geçerli bir M€ miktarı gir.");
  }

  const current = getMemberValue(target);

  if (remove && amount > current) {
    return message.reply(
      `❌ Oyuncunun mevcut değeri **${current}M€**.`
    );
  }

  const result = await changePlayerValue(
    target,
    remove ? -amount : amount,
    remove ? "Değer silme" : "Değer ekleme"
  );

  if (!result.success) {
    return message.reply("❌ İşlem gerçekleştirilemedi.");
  }

  return message.reply(
    `${remove ? "➖" : "➕"} ${target} değer güncellemesi:\n\n` +
    `📉 Eski: **${result.oldValue}M€**\n` +
    `📈 Yeni: **${result.newValue}M€**`
  );
}

/* =========================
   TWEET
========================= */

async function tweetCommand(message) {
  if (!channelOnly(message, IDS.channels.tweet)) return;

  const text = message.content
    .slice(PREFIX.length)
    .trim()
    .replace(/^tweet\s+/i, "")
    .trim();

  if (!text) {
    return message.reply("❌ Tweet mesajını yaz.");
  }

  const last = Number(db.tweetCooldowns[message.author.id] || 0);
  const now = Date.now();

  if (now - last < 24 * 60 * 60 * 1000) {
    const remaining =
      24 * 60 * 60 * 1000 - (now - last);

    const hours = Math.ceil(remaining / 3600000);

    return message.reply(
      `⏳ Tweet ödülünü tekrar almak için yaklaşık **${hours} saat** beklemelisin.`
    );
  }

  await message.delete().catch(() => {});

  const result = await changePlayerValue(
    message.member,
    5,
    "Tweet ödülü"
  );

  db.tweetCooldowns[message.author.id] = now;
  saveData();

  await message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("🐦 AXERA TWEET")
        .setDescription(
          `**${message.member.displayName}**\n\n${text}`
        )
        .setFooter({
          text: "Axera League"
        })
        .setTimestamp()
    ]
  });

  if (result.success) {
    await message.channel.send(
      `🎁 Tweet ödülü: **+5M€** | Yeni değer: **${result.newValue}M€**`
    );
  }
}

/* =========================
   TAKIM
========================= */

function ensureTeam(role) {
  if (!db.teams[role.id]) {
    db.teams[role.id] = {
      id: role.id,
      name: role.name,
      value: 0,
      squad: {},
      cups: [],
      form: "4-4-2"
    };
  }

  return db.teams[role.id];
}

async function teamAdd(message) {
  if (!commandPermission(
    message.member,
    [IDS.roles.commentator]
  )) {
    return message.reply("❌ Bu komutu sadece Spiker/Yönetici kullanabilir.");
  }

  const role = message.mentions.roles.first();

  if (!role) {
    return message.reply("❌ Bir takım rolü etiketle.");
  }

  ensureTeam(role);

  if (!db.standings[role.id]) {
    db.standings[role.id] = {
      name: role.name,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      goalsFor: 0,
      goalsAgainst: 0
    };
  }

  saveData();

  message.reply(
    `✅ **${role.name}** Axera League takım sistemine eklendi.`
  );
}

async function teamRemove(message) {
  if (!commandPermission(
    message.member,
    [IDS.roles.commentator]
  )) {
    return message.reply("❌ Yetkin yok.");
  }

  const role = message.mentions.roles.first();

  if (!role) {
    return message.reply("❌ Bir takım rolü etiketle.");
  }

  const active = Object.values(db.activeMatches)
    .some(
      (m) =>
        m.team1 === role.id ||
        m.team2 === role.id
    );

  if (active) {
    return message.reply(
      "❌ Bu takım şu anda maçta."
    );
  }

  delete db.teams[role.id];
  delete db.standings[role.id];
  delete db.formations[role.id];

  saveData();

  message.reply(
    `🗑️ **${role.name}** takım sisteminden kaldırıldı.`
  );
}

async function teamValueCommand(message) {
  if (!commandPermission(
    message.member,
    [IDS.roles.commentator]
  )) {
    return message.reply("❌ Yetkin yok.");
  }

  const role = message.mentions.roles.first();
  const args = getArgs(message);
  const amount = parseAmount(args[1]);

  if (!role || amount === null) {
    return message.reply(
      "❌ Kullanım: `.takımdeğer @Takım 850M`"
    );
  }

  ensureTeam(role).value = amount;

  saveData();

  message.reply(
    `💰 **${role.name}** takım değeri: **${amount}M€**`
  );
}

async function pointsAddCommand(message) {
  if (!commandPermission(
    message.member,
    [IDS.roles.commentator]
  )) {
    return message.reply("❌ Yetkin yok.");
  }

  const role = message.mentions.roles.first();
  const args = getArgs(message);
  const amount = Number(args[1]);

  if (!role || !Number.isInteger(amount)) {
    return message.reply(
      "❌ Kullanım: `.puanekle @Takım 3`"
    );
  }

  if (!db.standings[role.id]) {
    db.standings[role.id] = {
      name: role.name,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      goalsFor: 0,
      goalsAgainst: 0
    };
  }

  db.standings[role.id].points += amount;

  saveData();

  message.reply(
    `🏆 **${role.name}** puanına **${amount}** eklendi.`
  );
}

/* =========================
   KADRO
========================= */

async function squadAdd(message) {
  if (!commandPermission(
    message.member,
    [IDS.roles.commentator]
  )) {
    return message.reply("❌ Yetkin yok.");
  }

  const role = message.mentions.roles.first();
  const player = message.mentions.members.at(1);
  const args = getArgs(message);

  if (!role || !player || !args[2]) {
    return message.reply(
      "❌ Kullanım: `.kadroekle @Takım @Oyuncu Pozisyon`"
    );
  }

  const team = ensureTeam(role);

  team.squad[player.id] = {
    position: args.slice(2).join(" ")
  };

  saveData();

  message.reply(
    `✅ ${player} **${role.name}** kadrosuna eklendi.\n` +
    `📌 Pozisyon: **${args.slice(2).join(" ")}**`
  );
}

async function squadRemove(message) {
  if (!commandPermission(
    message.member,
    [IDS.roles.commentator]
  )) {
    return message.reply("❌ Yetkin yok.");
  }

  const role = message.mentions.roles.first();
  const player = message.mentions.members.at(1);

  if (!role || !player) {
    return message.reply(
      "❌ Kullanım: `.kadrocikar @Takım @Oyuncu`"
    );
  }

  if (db.teams[role.id]) {
    delete db.teams[role.id].squad[player.id];
  }

  saveData();

  message.reply(
    `🗑️ ${player} **${role.name}** kadrosundan çıkarıldı.`
  );
}

async function squadShow(message) {
  const role = message.mentions.roles.first();

  if (!role) {
    return message.reply(
      "❌ Kullanım: `.kadro @Takım`"
    );
  }

  const team = db.teams[role.id];

  if (!team) {
    return message.reply(
      "❌ Bu takım kayıtlı değil."
    );
  }

  const players = Object.entries(team.squad);

  if (!players.length) {
    return message.reply(
      `📋 **${role.name}** kadrosunda kayıtlı oyuncu yok.`
    );
  }

  const lines = [];

  for (const [id, info] of players) {
    const member = await message.guild.members
      .fetch(id)
      .catch(() => null);

    if (!member) continue;

    lines.push(
      `• ${member.displayName} — **${info.position}** — **${getMemberValue(member)}M€**`
    );
  }

  const total = lines.reduce((sum, line) => {
    const m = line.match(/(\d+(?:\.\d+)?)M€/);
    return sum + (m ? Number(m[1]) : 0);
  }, 0);

  message.reply({
    embeds: [
      embed(
        `👥 ${role.name} Kadrosu`,
        `${lines.join("\n")}\n\n` +
        `👤 Oyuncu: **${lines.length}**\n` +
        `💰 Toplam değer: **${total}M€**`
      )
    ]
  });
}

/* =========================
   FORMASYON
========================= */

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

async function formationCommand(message) {
  if (!commandPermission(
    message.member,
    [IDS.roles.commentator]
  )) {
    return message.reply("❌ Yetkin yok.");
  }

  const role = message.mentions.roles.first();

  if (!role) {
    return message.reply("❌ Bir takım rolü etiketle.");
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`formation_${role.id}`)
    .setPlaceholder("Formasyon seç")
    .addOptions(
      FORMATIONS.map((f) => ({
        label: f,
        value: f
      }))
    );

  message.reply({
    content: `⚽ **${role.name}** için formasyon seç:`,
    components: [
      new ActionRowBuilder().addComponents(menu)
    ]
  });
}

/* =========================
   PUAN DURUMU
========================= */

async function standingsCommand(message) {
  const entries = Object.entries(db.standings)
    .sort(([, a], [, b]) => {
      if (b.points !== a.points) {
        return b.points - a.points;
      }

      const gdA =
        (a.goalsFor || 0) -
        (a.goalsAgainst || 0);

      const gdB =
        (b.goalsFor || 0) -
        (b.goalsAgainst || 0);

      if (gdB !== gdA) return gdB - gdA;

      return (b.goalsFor || 0) -
        (a.goalsFor || 0);
    });

  if (!entries.length) {
    return message.reply(
      "📊 Henüz puan durumu oluşturulmadı."
    );
  }

  const lines = entries.map(
    ([id, t], index) =>
      `**${index + 1}.** ${t.name} — ` +
      `**${t.points} P** | ` +
      `${t.played} O | ` +
      `${t.wins} G | ${t.draws} B | ${t.losses} M`
  );

  message.reply({
    embeds: [
      embed(
        "🏆 AXERA LEAGUE PUAN DURUMU",
        lines.join("\n")
      )
    ]
  });
}

/* =========================
   MAÇ
========================= */

const commentary = [
  "orta sahada top kontrolü sağlandı.",
  "kanattan hızlı bir atak gelişiyor.",
  "savunma araya girdi.",
  "uzaktan şut geldi.",
  "kaleci topu kontrol etti.",
  "hücum oyuncusu ceza sahasına girdi.",
  "orta açıldı, savunma uzaklaştırdı.",
  "pas trafiği hızlandı.",
  "rakip yarı sahada baskı başladı.",
  "kontra atak fırsatı oluştu."
];

function getTeamMembers(guild, roleId) {
  return guild.members.cache
    .filter(
      (m) =>
        !m.user.bot &&
        m.roles.cache.has(roleId)
    )
    .map((m) => m);
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function startMatch(
  guild,
  team1Id,
  team2Id,
  sourceChannel
) {
  if (team1Id === team2Id) return;

  const role1 = guild.roles.cache.get(team1Id);
  const role2 = guild.roles.cache.get(team2Id);

  if (!role1 || !role2) return;

  const key = `${team1Id}_${team2Id}_${Date.now()}`;

  const match = {
    key,
    team1: team1Id,
    team2: team2Id,
    score1: 0,
    score2: 0,
    minute: 0,
    interval: null,
    message: null,
    scoredPlayers: [],
    rewarded: false
  };

  db.activeMatches[key] = {
    team1: team1Id,
    team2: team2Id
  };

  saveData();

  const initialEmbed = new EmbedBuilder()
    .setTitle("⚽ AXERA LIVE MAÇ")
    .setDescription(
      `**${role1.name}** 0 - 0 **${role2.name}**\n\n` +
      `⏱️ Dakika: **0'**\n\n` +
      `🏟️ Maç başladı!`
    )
    .setTimestamp();

  match.message = await sourceChannel.send({
    embeds: [initialEmbed]
  });

  let lastComment = "Maç başladı.";

  match.interval = setInterval(async () => {
    try {
      match.minute++;

      if (match.minute > 90) {
        clearInterval(match.interval);
        await finishMatch(
          guild,
          match,
          role1,
          role2
        );
        return;
      }

      if (Math.random() < 0.14) {
        const team1Value =
          db.teams[team1Id]?.value || 0;

        const team2Value =
          db.teams[team2Id]?.value || 0;

        let chance = 0.5;

        if (team1Value > team2Value) {
          chance += 0.08;
        } else if (team2Value > team1Value) {
          chance -= 0.08;
        }

        const scoringTeam =
          Math.random() < chance
            ? 1
            : 2;

        const players =
          getTeamMembers(
            guild,
            scoringTeam === 1
              ? team1Id
              : team2Id
          );

        if (Math.random() < 0.32) {
          if (scoringTeam === 1) {
            match.score1++;
          } else {
            match.score2++;
          }

          const scorer =
            players.length
              ? randomItem(players)
              : null;

          if (scorer) {
            match.scoredPlayers.push({
              id: scorer.id,
              type: "goal"
            });

            const reward = await changePlayerValue(
              scorer,
              2,
              "Maç gol ödülü"
            );

            lastComment =
              `⚽ **GOOOL!** ${scorer.displayName} ` +
              `skoru değiştirdi! ` +
              `(+${reward.changed}M€)`;
          } else {
            lastComment =
              `⚽ **GOOOL!** ${scoringTeam === 1 ? role1.name : role2.name} golü buldu!`;
          }
        } else {
          lastComment =
            `📝 ${randomItem(commentary)}`;
        }
      } else {
        lastComment =
          `📝 ${randomItem(commentary)}`;
      }

      const liveEmbed = new EmbedBuilder()
        .setTitle("⚽ AXERA LIVE MAÇ")
        .setDescription(
          `**${role1.name}** ${match.score1} - ${match.score2} **${role2.name}**\n\n` +
          `⏱️ Dakika: **${match.minute}'**\n\n` +
          `📣 ${lastComment}`
        )
        .setFooter({
          text: "Axera League • Canlı Maç"
        })
        .setTimestamp();

      await match.message.edit({
        embeds: [liveEmbed]
      });
    } catch (err) {
      console.error("Maç interval hatası:", err);

      clearInterval(match.interval);

      await finishMatch(
        guild,
        match,
        role1,
        role2
      ).catch(() => {});
    }
  }, 3000);

  return match;
}

async function finishMatch(
  guild,
  match,
  role1,
  role2
) {
  if (match.rewarded) return;

  match.rewarded = true;

  if (match.interval) {
    clearInterval(match.interval);
  }

  const final1 = match.score1;
  const final2 = match.score2;

  const team1 = db.standings[role1.id];
  const team2 = db.standings[role2.id];

  if (team1) {
    team1.played++;
    team1.goalsFor += final1;
    team1.goalsAgainst += final2;

    if (final1 > final2) {
      team1.wins++;
      team1.points += 3;
    } else if (final1 === final2) {
      team1.draws++;
      team1.points++;
    } else {
      team1.losses++;
    }
  }

  if (team2) {
    team2.played++;
    team2.goalsFor += final2;
    team2.goalsAgainst += final1;

    if (final2 > final1) {
      team2.wins++;
      team2.points += 3;
    } else if (final1 === final2) {
      team2.draws++;
      team2.points++;
    } else {
      team2.losses++;
    }
  }

  /*
    Maça katılan bütün takım üyelerine +5M€
  */
  const participants = new Map();

  for (const member of getTeamMembers(
    guild,
    role1.id
  )) {
    participants.set(member.id, member);
  }

  for (const member of getTeamMembers(
    guild,
    role2.id
  )) {
    participants.set(member.id, member);
  }

  for (const member of participants.values()) {
    const rewardKey =
      `${match.key}_${member.id}`;

    if (db.matchRewards[rewardKey]) continue;

    const result = await changePlayerValue(
      member,
      5,
      "Maç katılım ödülü"
    );

    db.matchRewards[rewardKey] = {
      value: result.changed,
      timestamp: Date.now()
    };
  }

  const finalEmbed = new EmbedBuilder()
    .setTitle("🏁 MAÇ SONA ERDİ")
    .setDescription(
      `**${role1.name}** ${final1} - ${final2} **${role2.name}**\n\n` +
      `🏆 Puanlar güncellendi.\n` +
      `🎁 Katılan oyunculara **+5M€** verildi.`
    )
    .setTimestamp();

  if (match.message) {
    await match.message.edit({
      embeds: [finalEmbed]
    }).catch(() => {});
  }

  delete db.activeMatches[match.key];

  db.matchHistory[match.key] = {
    team1: role1.id,
    team2: role2.id,
    score1: final1,
    score2: final2,
    finishedAt: Date.now()
  };

  saveData();
}

async function manualMatchCommand(message) {
  if (!channelOnly(message, IDS.channels.match)) return;

  if (!commandPermission(
    message.member,
    [IDS.roles.commentator]
  )) {
    return message.reply(
      "❌ Bu komutu sadece Spiker/Yönetici kullanabilir."
    );
  }

  const roles = [...message.mentions.roles.values()];

  if (roles.length < 2) {
    return message.reply(
      "❌ `.maç @Takım1 @Takım2` şeklinde kullan."
    );
  }

  if (
    Object.values(db.activeMatches).some(
      (m) =>
        m.team1 === roles[0].id ||
        m.team2 === roles[0].id ||
        m.team1 === roles[1].id ||
        m.team2 === roles[1].id
    )
  ) {
    return message.reply(
      "❌ Takımlardan biri zaten maçta."
    );
  }

  await startMatch(
    message.guild,
    roles[0].id,
    roles[1].id,
    message.channel
  );

  message.reply(
    `⚽ **${roles[0].name} - ${roles[1].name}** maçı başlatıldı.`
  );
}

/* =========================
   FİKSTÜR
========================= */

function parseFixtureDate(text) {
  const match = String(text).match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/
  );

  if (!match) return null;

  const [
    ,
    year,
    month,
    day,
    hour,
    minute
  ] = match;

  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0,
    0
  );

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

async function fixtureAdd(message) {
  if (!commandPermission(
    message.member,
    [IDS.roles.commentator]
  )) {
    return message.reply("❌ Yetkin yok.");
  }

  const roles = [...message.mentions.roles.values()];
  const args = getArgs(message);

  if (
    roles.length < 2 ||
    !args[2] ||
    !args[3]
  ) {
    return message.reply(
      "❌ Kullanım: `.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`"
    );
  }

  const date = parseFixtureDate(
    `${args[2]} ${args[3]}`
  );

  if (!date) {
    return message.reply(
      "❌ Tarih formatı yanlış."
    );
  }

  const fixture = {
    id: db.nextFixtureId++,
    team1: roles[0].id,
    team2: roles[1].id,
    timestamp: date.getTime(),
    started: false
  };

  db.fixtures.push(fixture);

  saveData();

  message.reply(
    `📅 Fikstür eklendi:\n\n` +
    `⚽ ${roles[0].name} - ${roles[1].name}\n` +
    `🕐 ${date.toLocaleString("tr-TR")}`
  );
}

async function fixtureList(message) {
  const upcoming = db.fixtures
    .filter((f) => !f.started)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (!upcoming.length) {
    return message.reply(
      "📅 Bekleyen fikstür bulunmuyor."
    );
  }

  const lines = [];

  for (const f of upcoming) {
    const t1 = message.guild.roles.cache.get(f.team1);
    const t2 = message.guild.roles.cache.get(f.team2);

    if (!t1 || !t2) continue;

    lines.push(
      `⚽ **${t1.name} - ${t2.name}**\n` +
      `🕐 <t:${Math.floor(f.timestamp / 1000)}:F>`
    );
  }

  message.reply({
    embeds: [
      embed(
        "📅 AXERA LEAGUE FİKSTÜR",
        lines.join("\n\n")
      )
    ]
  });
}

async function fixtureRemove(message) {
  if (!commandPermission(
    message.member,
    [IDS.roles.commentator]
  )) {
    return message.reply("❌ Yetkin yok.");
  }

  const roles = [...message.mentions.roles.values()];

  if (roles.length < 2) {
    return message.reply(
      "❌ İki takım etiketle."
    );
  }

  const before = db.fixtures.length;

  db.fixtures = db.fixtures.filter(
    (f) =>
      !(
        f.team1 === roles[0].id &&
        f.team2 === roles[1].id
      )
  );

  saveData();

  message.reply(
    before === db.fixtures.length
      ? "❌ Böyle bir fikstür bulunamadı."
      : "✅ Fikstür silindi."
  );
}

async function fixtureScheduler() {
  for (const fixture of db.fixtures) {
    if (fixture.started) continue;

    if (fixture.timestamp > Date.now()) continue;

    const guild = client.guilds.cache.first();

    if (!guild) continue;

    const channel =
      guild.channels.cache.get(
        IDS.channels.match
      );

    if (!channel) continue;

    fixture.started = true;

    saveData();

    await startMatch(
      guild,
      fixture.team1,
      fixture.team2,
      channel
    ).catch((err) => {
      console.error("Fikstür maçı:", err);
    });
  }

  saveData();
}

/* =========================
   KUPA / MÜZE
========================= */

async function cupAdd(message) {
  if (!commandPermission(
    message.member,
    [IDS.roles.commentator]
  )) {
    return message.reply("❌ Yetkin yok.");
  }

  const role = message.mentions.roles.first();

  if (!role) {
    return message.reply("❌ Takım etiketle.");
  }

  const args = getArgs(message);
  const name = args.slice(1).join(" ");

  if (!name) {
    return message.reply("❌ Kupa adını yaz.");
  }

  if (!db.cups[role.id]) {
    db.cups[role.id] = [];
  }

  db.cups[role.id].push(name);

  saveData();

  message.reply(
    `🏆 **${name}** kupası **${role.name}** müzesine eklendi.`
  );
}

async function cupRemove(message) {
  if (!commandPermission(
    message.member,
    [IDS.roles.commentator]
  )) {
    return message.reply("❌ Yetkin yok.");
  }

  const role = message.mentions.roles.first();

  if (!role) {
    return message.reply("❌ Takım etiketle.");
  }

  const args = getArgs(message);
  const name = args.slice(1).join(" ");

  if (!db.cups[role.id]) {
    return message.reply("❌ Kupa bulunamadı.");
  }

  db.cups[role.id] =
    db.cups[role.id].filter(
      (x) =>
        x.toLowerCase() !==
        name.toLowerCase()
    );

  saveData();

  message.reply(
    `🗑️ **${name}** kupası silindi.`
  );
}

async function museumCommand(message) {
  const role = message.mentions.roles.first();

  if (!role) {
    return message.reply(
      "❌ Kullanım: `.müze @Takım`"
    );
  }

  const cups = db.cups[role.id] || [];

  message.reply({
    embeds: [
      embed(
        `🏛️ ${role.name} Müzesi`,
        cups.length
          ? cups.map((x, i) =>
              `**${i + 1}.** 🏆 ${x}`
            ).join("\n")
          : "Henüz kazanılmış kupa yok."
      )
    ]
  });
}

/* =========================
   ROL PANELİ
========================= */

function rolePanelComponents() {
  return new ActionRowBuilder().addComponents(
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
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("ping_giveaway")
      .setLabel("Çekiliş Ping")
      .setEmoji("🎉")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId("ping_media")
      .setLabel("Medya Ping")
      .setEmoji("📰")
      .setStyle(ButtonStyle.Secondary)
  );
}

async function rolePanelCommand(message) {
  if (!isAdmin(message.member)) {
    return message.reply("❌ Sadece yönetici kullanabilir.");
  }

  await message.channel.send({
    embeds: [
      embed(
        "🔔 Axera League Bildirim Rolleri",
        "İstediğin bildirim rollerini butonlardan açıp kapatabilirsin."
      )
    ],
    components: [rolePanelComponents()]
  });

  message.reply({
    content: "✅ Rol paneli oluşturuldu.",
    ephemeral: true
  }).catch(() => {});
}

/* =========================
   TICKET
========================= */

async function ticketPanelCommand(message) {
  if (!isAdmin(message.member)) {
    return message.reply("❌ Sadece yönetici kullanabilir.");
  }

  const button = new ButtonBuilder()
    .setCustomId("create_ticket")
    .setLabel("Destek Talebi Oluştur")
    .setEmoji("🎫")
    .setStyle(ButtonStyle.Primary);

  await message.channel.send({
    embeds: [
      embed(
        "🎫 Axera League Destek",
        "Destek almak için aşağıdaki butona bas."
      )
    ],
    components: [
      new ActionRowBuilder().addComponents(button)
    ]
  });

  message.reply("✅ Ticket paneli oluşturuldu.");
}

async function createTicket(interaction) {
  const guild = interaction.guild;
  const user = interaction.user;

  const existing = guild.channels.cache.find(
    (c) =>
      c.name === `ticket-${user.id}` &&
      c.type === ChannelType.GuildText
  );

  if (existing) {
    return interaction.reply({
      content: `❌ Zaten açık ticketın var: ${existing}`,
      ephemeral: true
    });
  }

  const channel =
    await guild.channels.create({
      name: `ticket-${user.id}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: ["ViewChannel"]
        },
        {
          id: user.id,
          allow: [
            "ViewChannel",
            "SendMessages",
            "ReadMessageHistory"
          ]
        },
        {
          id: IDS.roles.moderator,
          allow: [
            "ViewChannel",
            "SendMessages",
            "ReadMessageHistory"
          ]
        }
      ]
    });

  db.tickets[channel.id] = {
    owner: user.id,
    lastMessage: Date.now()
  };

  saveData();

  const closeButton =
    new ButtonBuilder()
      .setCustomId("close_ticket")
      .setLabel("Bileti Kapat")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger);

  await channel.send({
    content: `${user}`,
    embeds: [
      embed(
        "🎫 Destek Talebi",
        "Yetkili ekibimiz en kısa sürede ilgilenecektir.\n\n" +
        "60 dakika boyunca mesaj gelmezse ticket otomatik kapanır."
      )
    ],
    components: [
      new ActionRowBuilder()
        .addComponents(closeButton)
    ]
  });

  await interaction.reply({
    content: `✅ Ticket oluşturuldu: ${channel}`,
    ephemeral: true
  });
}

/* =========================
   ŞART
========================= */

function conditionsCommand(message) {
  message.reply({
    embeds: [
      embed(
        "📌 Axera League Şartlar",
        "✓ **Kalıcı Tık:** Kalıcı 「✓」 kanalına tıklayınız.\n\n" +
        "🎭 **Rol Al:** Rol Al kanalından en az **2 rol** alınız.\n\n" +
        "ℹ️ Bu şartlar bilgilendirme amaçlıdır; bot sistemlerini kullanmak için zorunlu değildir."
      )
    ]
  });
}

/* =========================
   MODERASYON
========================= */

async function moderationCommand(message, command) {
  if (!isAdmin(message.member)) {
    return message.reply("❌ Yönetici yetkin yok.");
  }

  if (command === "sil") {
    const args = getArgs(message);
    const amount = Number(args[0]);

    if (
      !Number.isInteger(amount) ||
      amount < 1 ||
      amount > 1000
    ) {
      return message.reply(
        "❌ 1-1000 arasında miktar gir."
      );
    }

    await message.channel.bulkDelete(
      amount + 1,
      true
    ).catch(() => {});

    return;
  }

  const target = mentionMember(message);

  if (!target) {
    return message.reply(
      "❌ Bir kullanıcı etiketle."
    );
  }

  if (command === "kick") {
    await target.kick("Axera League moderasyon")
      .catch(() => {});

    return message.reply(
      `👢 ${target.user.tag} sunucudan atıldı.`
    );
  }

  if (command === "ban") {
    await target.ban({
      reason: "Axera League moderasyon"
    }).catch(() => {});

    return message.reply(
      `🔨 ${target.user.tag} yasaklandı.`
    );
  }

  if (command === "mute") {
    await target.timeout(
      10 * 60 * 1000,
      "Axera League moderasyon"
    ).catch(() => {});

    return message.reply(
      `🔇 ${target.user.tag} 10 dakika susturuldu.`
    );
  }

  if (command === "unmute") {
    await target.timeout(null)
      .catch(() => {});

    return message.reply(
      `🔊 ${target.user.tag} susturması kaldırıldı.`
    );
  }
}

/* =========================
   EMBED
========================= */

async function embedCommand(message) {
  if (!isAdmin(message.member)) {
    return message.reply("❌ Yönetici yetkin yok.");
  }

  const text = message.content
    .slice(PREFIX.length)
    .replace(/^embed\s+/i, "");

  const parts = text.split("|");

  const title =
    parts[0]?.trim() || "Axera League";

  const description =
    parts.slice(1).join("|").trim() ||
    "Axera League";

  await message.channel.send({
    embeds: [
      embed(title, description)
    ]
  });

  await message.delete().catch(() => {});
}

/* =========================
   DM
========================= */

async function dmCommand(message) {
  if (!isAdmin(message.member)) {
    return message.reply("❌ Yönetici yetkin yok.");
  }

  const target = mentionMember(message);

  if (!target) {
    return message.reply(
      "❌ Kullanım: `.dm @Oyuncu mesaj`"
    );
  }

  const raw = message.content
    .slice(PREFIX.length)
    .replace(/^dm\s+/i, "");

  const mention = `<@${target.id}>`;
  const mentionNick = `<@!${target.id}>`;

  let text = raw
    .replace(mention, "")
    .replace(mentionNick, "")
    .trim();

  if (!text) {
    return message.reply("❌ Gönderilecek mesajı yaz.");
  }

  try {
    await target.send(text);

    message.reply(
      `✅ ${target.user.tag} kullanıcısına DM gönderildi.`
    );
  } catch {
    message.reply(
      "❌ Kullanıcının DM'leri kapalı olabilir."
    );
  }
}

/* =========================
   AI
========================= */

const aiMemory = new Map();

async function askAI(userId, question) {
  if (!openai) {
    return "❌ AI sistemi için OPENAI_API_KEY ayarlanmamış.";
  }

  if (
    question
      .toLowerCase()
      .includes("seni kim kurdu")
  ) {
    return "Lynox9380 kurdu.";
  }

  let history = aiMemory.get(userId) || [];

  history.push({
    role: "user",
    content: question
  });

  if (history.length > 10) {
    history = history.slice(-10);
  }

  aiMemory.set(userId, history);

  try {
    const response =
      await openai.responses.create({
        model: AI_MODEL,
        instructions:
          "Sen Axera adlı Discord AI asistanısın. " +
          "Türkçe cevap ver. Kısa, hızlı ve anlaşılır ol. " +
          "Discord sunucusunun güvenliğini tehlikeye atacak " +
          "yıkıcı yönetici işlemlerini kendin gerçekleştirme. " +
          "Kullanıcı senden sunucu komutu isterse ilgili komutu anlat.",
        input: history,
        max_output_tokens: 500
      });

    const answer =
      response.output_text?.trim() ||
      "❌ AI cevap oluşturamadı.";

    history.push({
      role: "assistant",
      content: answer
    });

    if (history.length > 10) {
      history = history.slice(-10);
    }

    aiMemory.set(userId, history);

    return answer;
  } catch (err) {
    console.error("OpenAI hatası:", err);

    return "❌ AI şu anda cevap veremiyor.";
  }
}

async function aiCommand(message) {
  const question = message.content
    .slice(PREFIX.length)
    .replace(/^(ai|yapayzeka)\s*/i, "")
    .trim();

  if (!question) {
    return message.reply(
      "❌ Sorunu yaz. Örnek: `.ai Axera League nedir?`"
    );
  }

  const answer =
    await askAI(
      message.author.id,
      question
    );

  for (const part of splitMessage(answer)) {
    await message.channel.send(part);
  }
}

/* =========================
   YARDIM
========================= */

function helpCommand(message) {
  const text = `
**🤖 AXERA LEAGUE BOT**

**📋 Kayıt**
\`.k @Oyuncu İsim\`
\`.kayıtsızver @Oyuncu\`
\`.ara isim\`

**💰 Değer**
\`.dver @Oyuncu 5M\`
\`.dsil @Oyuncu 5M\`

**🏋️ Oyuncu**
\`.antrenman\`
\`.ant\`
\`.penaltı\`
\`.pen\`
\`.tweet mesaj\`

**⚽ Takım**
\`.takımekle @Takım\`
\`.takımkaldır @Takım\`
\`.takımdeğer @Takım 850M\`
\`.puanekle @Takım 3\`
\`.kadroekle @Takım @Oyuncu Pozisyon\`
\`.kadrocikar @Takım @Oyuncu\`
\`.kadro @Takım\`
\`.formasyon @Takım\`
\`.puan\`

**📅 Fikstür**
\`.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM\`
\`.fikstür\`
\`.fiksturcikar @Takım1 @Takım2\`

**🏆 Müze**
\`.kupaekle @Takım Kupa Adı\`
\`.kupasil @Takım Kupa Adı\`
\`.müze @Takım\`

**🎫 Ticket**
\`.ticketpanel\`

**🔔 Roller**
\`.rolpanel\`

**🤖 AI**
AI kanalında direkt mesaj yazabilirsin.
\`.ai soru\`
\`.yapayzeka soru\`

**🛡️ Moderasyon**
\`.sil 10\`
\`.embed Başlık | Açıklama\`
\`.kick @Oyuncu\`
\`.ban @Oyuncu\`
\`.mute @Oyuncu\`
\`.unmute @Oyuncu\`
\`.dm @Oyuncu mesaj\`

**📌 Diğer**
\`.şart\`
\`.yardım\`
`;

  message.reply({
    embeds: [
      embed(
        "🤖 Axera League Yardım",
        text
      )
    ]
  });
}

/* =========================
   KAYITSIZ VER
========================= */

async function unregisteredCommand(message) {
  if (
    !commandPermission(
      message.member,
      [IDS.roles.register]
    )
  ) {
    return message.reply(
      "❌ Sadece Kayıt Yetkilisi/Yönetici kullanabilir."
    );
  }

  const target = mentionMember(message);

  if (!target) {
    return message.reply(
      "❌ Bir kullanıcı etiketle."
    );
  }

  for (const role of [
    IDS.roles.player,
    IDS.roles.member,
    IDS.roles.td
  ]) {
    await target.roles.remove(role)
      .catch(() => {});
  }

  await target.roles.add(
    IDS.roles.unregistered
  ).catch(() => {});

  ensureUser(target.id).registered = false;

  saveData();

  message.reply(
    `✅ ${target} tekrar **Kayıtsız** yapıldı.`
  );
}

/* =========================
   STATUS
========================= */

let lastStatusKey = null;

async function postBotStatus() {
  try {
    const channel =
      await client.channels.fetch(
        IDS.channels.status
      ).catch(() => null);

    if (!channel || !channel.isTextBased()) return;

    const now = new Date();

    const key =
      `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;

    if (lastStatusKey === key) return;

    /*
      SADECE BOTUN KENDİ MESAJLARI SİLİNİR.
      Başka kullanıcıların mesajlarına dokunulmaz.
    */
    const messages =
      await channel.messages.fetch({
        limit: 100
      }).catch(() => null);

    if (messages) {
      const ownMessages =
        messages.filter(
          (m) =>
            m.author.id === client.user.id
        );

      for (const msg of ownMessages.values()) {
        await msg.delete().catch(() => {});
      }
    }

    const guildCount = client.guilds.cache.size;

    let userCount = 0;

    for (const guild of client.guilds.cache.values()) {
      userCount += guild.memberCount || 0;
    }

    const ping =
      Math.max(
        0,
        Math.round(
          client.ws.ping
        )
      );

    const commandCount = 40;

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("🟢 AXERA BOT DURUM")
          .setDescription(
            "Axera League botu aktif ve çalışıyor."
          )
          .addFields(
            {
              name: "🟢 Durum",
              value: "Aktif",
              inline: true
            },
            {
              name: "📡 Ping",
              value: `${ping}ms`,
              inline: true
            },
            {
              name: "🌐 Sunucu",
              value: `${guildCount}`,
              inline: true
            },
            {
              name: "👥 Kullanıcı",
              value: `${userCount}`,
              inline: true
            },
            {
              name: "⚙️ Sistem",
              value: `${commandCount}+`,
              inline: true
            }
          )
          .setFooter({
            text: "Axera League • Otomatik durum sistemi"
          })
          .setTimestamp()
      ]
    });

    lastStatusKey = key;
  } catch (err) {
    console.error("Status hatası:", err);
  }
}

/* =========================
   MESAJ SİSTEMİ
========================= */

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;

    /*
      AI KANALI:
      Komut değilse otomatik AI.
    */
    if (
      message.channel.id === IDS.channels.ai &&
      !isCommandMessage(message)
    ) {
      const answer =
        await askAI(
          message.author.id,
          message.content
        );

      for (const part of splitMessage(answer)) {
        await message.channel.send(part);
      }

      return;
    }

    if (!isCommandMessage(message)) {
      /*
        Ticket aktivitesini güncelle.
      */
      if (db.tickets[message.channel.id]) {
        db.tickets[message.channel.id].lastMessage =
          Date.now();

        saveData();
      }

      return;
    }

    const command = getCommand(message);

    switch (command) {
      /* Kayıt */
      case "k":
        if (
          !channelOnly(
            message,
            IDS.channels.register
          )
        ) return;

        if (
          !commandPermission(
            message.member,
            [IDS.roles.register]
          )
        ) {
          return message.reply(
            "❌ Sadece Kayıt Yetkilisi/Yönetici kullanabilir."
          );
        }

        {
          const target = mentionMember(message);
          const args = getArgs(message);

          if (!target || args.length < 2) {
            return message.reply(
              "❌ Kullanım: `.k @Oyuncu İsim`"
            );
          }

          const nickname =
            args
              .slice(1)
              .join(" ");

          await createRegistrationPanel(
            message.channel,
            target
          );

          message.reply(
            `✅ ${target} için kayıt paneli oluşturuldu.`
          );
        }
        break;

      case "kayıtsızver":
      case "kayitsizver":
        await unregisteredCommand(message);
        break;

      /* Arama */
      case "ara":
        {
          const query =
            getArgs(message).join(" ");

          if (!query) {
            return message.reply(
              "❌ Aramak istediğin ismi yaz."
            );
          }

          const results =
            searchMembers(
              message.guild,
              query
            );

          if (!results.length) {
            return message.reply(
              "❌ Bu isimde veya benzer isimde kayıtlı oyuncu bulunamadı."
            );
          }

          const lines =
            results.slice(0, 20).map(
              (m, i) =>
                `**${i + 1}.** ${m} — ` +
                `**${getMemberValue(m)}M€**`
            );

          message.reply({
            embeds: [
              embed(
                "🔎 Oyuncu Arama",
                lines.join("\n")
              )
            ]
          });
        }
        break;

      /* Değer */
      case "dver":
        await valueAddCommand(
          message,
          false
        );
        break;

      case "dsil":
        await valueAddCommand(
          message,
          true
        );
        break;

      /* Oyuncu */
      case "ant":
      case "antrenman":
        await trainingCommand(message);
        break;

      case "pen":
      case "penaltı":
      case "penalti":
        await penaltyCommand(message);
        break;

      case "tweet":
        await tweetCommand(message);
        break;

      /* Takım */
      case "takımekle":
      case "takimekle":
        await teamAdd(message);
        break;

      case "takımkaldır":
      case "takimkaldir":
        await teamRemove(message);
        break;

      case "takımdeğer":
      case "takimdeger":
        await teamValueCommand(message);
        break;

      case "puanekle":
        await pointsAddCommand(message);
        break;

      case "kadroekle":
        await squadAdd(message);
        break;

      case "kadrocikar":
        await squadRemove(message);
        break;

      case "kadro":
        await squadShow(message);
        break;

      case "formasyon":
        await formationCommand(message);
        break;

      case "puan":
        await standingsCommand(message);
        break;

      /* Maç */
      case "maç":
      case "mac":
        await manualMatchCommand(message);
        break;

      /* Fikstür */
      case "fiksturekle":
        await fixtureAdd(message);
        break;

      case "fikstür":
      case "fikstur":
        await fixtureList(message);
        break;

      case "fiksturcikar":
        await fixtureRemove(message);
        break;

      /* Kupa */
      case "kupaekle":
        await cupAdd(message);
        break;

      case "kupasil":
        await cupRemove(message);
        break;

      case "müze":
      case "muze":
        await museumCommand(message);
        break;

      /* Ticket */
      case "ticketpanel":
        await ticketPanelCommand(message);
        break;

      /* Roller */
      case "rolpanel":
        await rolePanelCommand(message);
        break;

      /* Şart */
      case "sart":
      case "şart":
        conditionsCommand(message);
        break;

      /* Moderasyon */
      case "sil":
      case "kick":
      case "ban":
      case "mute":
      case "unmute":
        await moderationCommand(
          message,
          command
        );
        break;

      case "embed":
        await embedCommand(message);
        break;

      /* DM */
      case "dm":
        await dmCommand(message);
        break;

      /* AI */
      case "ai":
      case "yapayzeka":
        await aiCommand(message);
        break;

      /* Yardım */
      case "yardım":
      case "yardim":
        helpCommand(message);
        break;
    }
  } catch (err) {
    console.error(
      "messageCreate hatası:",
      err
    );

    message.reply(
      "❌ İşlem sırasında beklenmeyen bir hata oluştu."
    ).catch(() => {});
  }
});

/* =========================
   BUTONLAR
========================= */

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isButton()) {
      const id = interaction.customId;

      /* Kayıt */
      if (
        id.startsWith("register_")
      ) {
        if (
          !commandPermission(
            interaction.member,
            [IDS.roles.register]
          )
        ) {
          return interaction.reply({
            content:
              "❌ Bu paneli sadece Kayıt Yetkilisi/Yönetici kullanabilir.",
            ephemeral: true
          });
        }

        const parts = id.split("_");

        const type =
          parts[1];

        const userId =
          parts.slice(2).join("_");

        const member =
          await interaction.guild.members
            .fetch(userId)
            .catch(() => null);

        if (!member) {
          return interaction.reply({
            content:
              "❌ Kullanıcı bulunamadı.",
            ephemeral: true
          });
        }

        let roleType = "player";

        if (type === "member") {
          roleType = "member";
        }

        if (type === "td") {
          roleType = "td";
        }

        if (type === "keeper") {
          roleType = "keeper";
        }

        const roleName =
          await registerUser(
            member,
            roleType,
            member.displayName
          );

        await interaction.reply({
          content:
            `✅ ${member} **${roleName}** olarak kaydedildi.`,
          ephemeral: true
        });

        return;
      }

      /* Ping rolleri */
      const pingRoles = {
        ping_partner: IDS.roles.partnerPing,
        ping_match: IDS.roles.matchPing,
        ping_announcement:
          IDS.roles.announcementPing,
        ping_giveaway:
          IDS.roles.giveawayPing,
        ping_media:
          IDS.roles.mediaPing
      };

      if (pingRoles[id]) {
        const roleId = pingRoles[id];

        const has =
          interaction.member.roles.cache.has(
            roleId
          );

        if (has) {
          await interaction.member.roles
            .remove(roleId)
            .catch(() => {});
        } else {
          await interaction.member.roles
            .add(roleId)
            .catch(() => {});
        }

        return interaction.reply({
          content: has
            ? "🔕 Bildirim rolü kaldırıldı."
            : "🔔 Bildirim rolü verildi.",
          ephemeral: true
        });
      }

      /* Ticket */
      if (id === "create_ticket") {
        await createTicket(interaction);
        return;
      }

      if (id === "close_ticket") {
        if (
          !interaction.channel ||
          !db.tickets[interaction.channel.id]
        ) {
          return interaction.reply({
            content: "❌ Bu bir ticket değil.",
            ephemeral: true
          });
        }

        const ticket =
          db.tickets[
            interaction.channel.id
          ];

        if (
          interaction.user.id !== ticket.owner &&
          !isAdmin(interaction.member) &&
          !hasRole(
            interaction.member,
            IDS.roles.moderator
          )
        ) {
          return interaction.reply({
            content:
              "❌ Bu ticketı kapatma yetkin yok.",
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
          interaction.channel.delete()
            .catch(() => {});
        }, 1500);

        return;
      }
    }

    /* Formasyon */
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId.startsWith("formation_")
    ) {
      if (
        !commandPermission(
          interaction.member,
          [IDS.roles.commentator]
        )
      ) {
        return interaction.reply({
          content: "❌ Yetkin yok.",
          ephemeral: true
        });
      }

      const teamId =
        interaction.customId.replace(
          "formation_",
          ""
        );

      const formation =
        interaction.values[0];

      if (!db.teams[teamId]) {
        return interaction.reply({
          content:
            "❌ Takım bulunamadı.",
          ephemeral: true
        });
      }

      db.teams[teamId].form =
        formation;

      db.formations[teamId] =
        formation;

      saveData();

      return interaction.reply({
        content:
          `✅ Formasyon **${formation}** olarak ayarlandı.`,
        ephemeral: true
      });
    }
  } catch (err) {
    console.error(
      "interactionCreate hatası:",
      err
    );

    if (!interaction.replied) {
      interaction.reply({
        content:
          "❌ İşlem sırasında hata oluştu.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

/* =========================
   SUNUCUYA GİRİŞ
========================= */

client.on(
  "guildMemberAdd",
  async (member) => {
    try {
      await member.roles.add(
        IDS.roles.unregistered
      ).catch(() => {});

      const channel =
        member.guild.channels.cache.get(
          IDS.channels.register
        );

      if (!channel) return;

      await channel.send(
        `👋 Hoş geldin ${member}!\n` +
        `<@&${IDS.roles.register}> kayıt işlemi için seni bekliyor.`
      );
    } catch (err) {
      console.error(
        "guildMemberAdd:",
        err
      );
    }
  }
);

/* =========================
   TICKET AUTO CLOSE
========================= */

setInterval(async () => {
  try {
    const now = Date.now();

    for (const [channelId, ticket] of Object.entries(
      db.tickets
    )) {
      if (
        now - Number(ticket.lastMessage || 0) <
        60 * 60 * 1000
      ) {
        continue;
      }

      const channel =
        client.channels.cache.get(channelId);

      delete db.tickets[channelId];

      if (channel) {
        await channel.send(
          "⏰ 60 dakika boyunca mesaj gelmediği için ticket otomatik kapatılıyor."
        ).catch(() => {});

        setTimeout(() => {
          channel.delete()
            .catch(() => {});
        }, 3000);
      }
    }

    saveData();
  } catch (err) {
    console.error(
      "Ticket scheduler:",
      err
    );
  }
}, 60 * 1000);

/* =========================
   FİKSTÜR SCHEDULER
========================= */

setInterval(() => {
  fixtureScheduler()
    .catch((err) =>
      console.error(
        "Fixture scheduler:",
        err
      )
    );
}, 1000);

/* =========================
   STATUS SCHEDULER
   00 VE 30 DAKİKA
========================= */

setInterval(() => {
  const now = new Date();

  if (
    now.getMinutes() === 0 ||
    now.getMinutes() === 30
  ) {
    postBotStatus()
      .catch((err) =>
        console.error(
          "Status scheduler:",
          err
        )
      );
  }
}, 20 * 1000);

/* =========================
   READY
========================= */

client.once("ready", async () => {
  console.log(
    `🟢 Axera League aktif: ${client.user.tag}`
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

  /*
    Bot açıldığında durum mesajı gönderir.
    Sonrasında 00/30 dakikalarında yenilenir.
  */
  await postBotStatus();
});

/* =========================
   HATA YÖNETİMİ
========================= */

process.on(
  "unhandledRejection",
  (reason) => {
    console.error(
      "UNHANDLED REJECTION:",
      reason
    );
  }
);

process.on(
  "uncaughtException",
  (err) => {
    console.error(
      "UNCAUGHT EXCEPTION:",
      err
    );
  }
);

/* =========================
   LOGIN
========================= */

client.login(TOKEN);
