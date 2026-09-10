"use strict";

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
   Node.js 22+
   Discord.js 14+
   OpenAI SDK 7+
========================================================= */

/* =========================
   ENV
========================= */

if (!process.env.TOKEN) {
  console.error("❌ TOKEN Railway değişkeni bulunamadı.");
  process.exit(1);
}

const TOKEN = process.env.TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

const AI_MODEL = "gpt-5.6-luna";

/* =========================
   CHANNEL IDS
========================= */

const CHANNELS = {
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
};

/* =========================
   ROLE IDS
========================= */

const ROLES = {
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
  ANNOUNCE_PING: "1547393331297001522",
  GIVEAWAY_PING: "1545116885589430312"
};

/* =========================
   CLIENT
========================= */

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

let openai = null;

if (OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: OPENAI_API_KEY
  });
}

/* =========================
   DATABASE
========================= */

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
  playerMatchHistory: {},
  penalties: {},
  stats: {},
  matchHistory: [],
  aiMemory: {}
};

function freshData() {
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(DEFAULT_DATA, null, 2)
      );
      return freshData();
    }

    const data = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );

    return {
      ...freshData(),
      ...data
    };
  } catch (err) {
    console.error("data.json hatası:", err);

    try {
      fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(DEFAULT_DATA, null, 2)
      );
    } catch {}

    return freshData();
  }
}

let db = loadData();

let saveTimeout = null;

function saveData() {
  if (saveTimeout) return;

  saveTimeout = setTimeout(() => {
    saveTimeout = null;

    try {
      const temp = `${DATA_FILE}.tmp`;

      fs.writeFileSync(
        temp,
        JSON.stringify(db, null, 2)
      );

      fs.renameSync(temp, DATA_FILE);
    } catch (err) {
      console.error("Veri kayıt hatası:", err);
    }
  }, 250);
}

/* =========================
   HELPERS
========================= */

function normalize(text = "") {
  return String(text)
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function isAdmin(member) {
  return !!(
    member &&
    (
      member.permissions.has(
        PermissionsBitField.Flags.Administrator
      ) ||
      member.roles.cache.has(ROLES.ADMIN)
    )
  );
}

function hasRole(member, roleId) {
  return !!member?.roles?.cache?.has(roleId);
}

function hasAnyRole(member, ids) {
  return ids.some(id => hasRole(member, id));
}

function isStaff(member) {
  return (
    isAdmin(member) ||
    hasAnyRole(member, [
      ROLES.MOD,
      ROLES.SPEAKER,
      ROLES.VALUE,
      ROLES.REGISTER
    ])
  );
}

function money(n) {
  return `${Math.max(0, Math.round(Number(n) || 0))}M€`;
}

function getUserData(id) {
  if (!db.users[id]) {
    db.users[id] = {
      value: 0,
      registered: false,
      stats: {
        goals: 0,
        assists: 0,
        matches: 0
      }
    };
  }

  return db.users[id];
}

function parseMoney(value) {
  if (!value) return null;

  let text = String(value)
    .trim()
    .replace(/€/g, "")
    .replace(/\s/g, "")
    .toUpperCase();

  if (!/^\d+(?:[.,]\d+)?M?$/.test(text)) {
    return null;
  }

  text = text.replace("M", "").replace(",", ".");

  const number = Number(text);

  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }

  return Math.floor(number);
}

function splitText(text, max = 1900) {
  const parts = [];

  while (text.length > max) {
    let cut = text.lastIndexOf("\n", max);

    if (cut < 500) cut = max;

    parts.push(text.slice(0, cut));
    text = text.slice(cut);
  }

  if (text.length) parts.push(text);

  return parts;
}

async function reply(message, payload) {
  try {
    if (typeof payload === "string" && payload.length > 2000) {
      const parts = splitText(payload);

      await message.reply(parts.shift());

      for (const part of parts) {
        await message.channel.send(part);
      }

      return;
    }

    return await message.reply(payload);
  } catch (err) {
    console.error("Reply:", err.message);
  }
}

async function send(channel, payload) {
  try {
    return await channel.send(payload);
  } catch (err) {
    console.error("Send:", err.message);
    return null;
  }
}

async function memberById(guild, id) {
  try {
    return await guild.members.fetch(id);
  } catch {
    return null;
  }
}

async function resolveMember(message, token) {
  if (!token) return null;

  const mention = token.match(/^<@!?(\d+)>$/);

  if (mention) {
    return memberById(
      message.guild,
      mention[1]
    );
  }

  if (/^\d{15,20}$/.test(token)) {
    return memberById(
      message.guild,
      token
    );
  }

  const query = normalize(token);

  const members = await message.guild.members.fetch();

  return members.find(member =>
    normalize(member.displayName) === query ||
    normalize(member.nickname || "") === query ||
    normalize(member.user.username) === query
  ) || null;
}

function ensureTeam(id, name) {
  if (!db.teams[id]) {
    db.teams[id] = {
      id,
      name,
      value: 0,
      squad: [],
      cups: [],
      formation: "4-4-2"
    };
  }

  return db.teams[id];
}

function ensureStanding(id, name) {
  if (!db.standings[id]) {
    db.standings[id] = {
      id,
      name,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0
    };
  }

  return db.standings[id];
}

function getTrailingValue(nickname) {
  const match = String(nickname || "")
    .match(/(\d+)M€\s*$/);

  return match ? Number(match[1]) : null;
}

async function changeNicknameValue(member, amount) {
  const nickname =
    member.nickname ||
    member.user.displayName ||
    member.user.username;

  const current = getTrailingValue(nickname);

  if (current === null) return false;

  const final = Math.max(
    0,
    Math.min(1000, current + amount)
  );

  const newNickname = nickname.replace(
    /(\d+)M€\s*$/,
    `${final}M€`
  );

  try {
    await member.setNickname(newNickname);
  } catch (err) {
    console.error("Nickname:", err.message);
    return false;
  }

  getUserData(member.id).value = final;
  saveData();

  return true;
}

function addValue(userId, amount) {
  const user = getUserData(userId);

  user.value = Math.max(
    0,
    Math.min(
      1000,
      Number(user.value || 0) + amount
    )
  );

  saveData();
}

async function addValueToMember(member, amount) {
  if (!member) return false;

  const changed = await changeNicknameValue(
    member,
    amount
  );

  if (!changed) {
    addValue(member.id, amount);
  }

  return true;
}

/* =========================================================
   REGISTRATION
========================================================= */

async function registrationPanel(message, target, nickname) {
  const embed = new EmbedBuilder()
    .setTitle("📋 Axera League Kayıt")
    .setDescription(
      `${target}\n\n` +
      `📝 İsim: **${nickname}**\n\n` +
      `Kayıt türünü aşağıdaki butonlardan seçin.`
    )
    .setColor(0x5865f2)
    .setTimestamp();

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`reg_player_${target.id}`)
        .setLabel("Futbolcu")
        .setEmoji("⚽")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`reg_member_${target.id}`)
        .setLabel("Üye")
        .setEmoji("👤")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(`reg_td_${target.id}`)
        .setLabel("Teknik Direktör")
        .setEmoji("🧑‍💼")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`reg_gk_${target.id}`)
        .setLabel("Kaleci")
        .setEmoji("🧤")
        .setStyle(ButtonStyle.Primary)
    );

  return send(message.channel, {
    embeds: [embed],
    components: [row]
  });
}

async function finishRegistration(interaction, type) {
  const id = interaction.customId.split("_").pop();

  const member = await memberById(
    interaction.guild,
    id
  );

  if (!member) {
    return interaction.reply({
      content: "❌ Oyuncu bulunamadı.",
      ephemeral: true
    });
  }

  let selectedRole = ROLES.PLAYER;
  let name = "Futbolcu";

  if (type === "member") {
    selectedRole = ROLES.MEMBER;
    name = "Üye";
  }

  if (type === "td") {
    selectedRole = ROLES.TD;
    name = "Teknik Direktör";
  }

  if (type === "gk") {
    selectedRole = ROLES.PLAYER;
    name = "Kaleci";
  }

  for (const roleId of [
    ROLES.UNREGISTERED,
    ROLES.PLAYER,
    ROLES.MEMBER,
    ROLES.TD
  ]) {
    try {
      await member.roles.remove(roleId);
    } catch {}
  }

  try {
    await member.roles.add(selectedRole);
  } catch {}

  const user = getUserData(member.id);

  user.registered = true;

  saveData();

  await interaction.reply({
    content:
      `✅ ${member} **${name}** olarak kayıt edildi.`,
    ephemeral: true
  });

  await send(interaction.channel, {
    embeds: [
      new EmbedBuilder()
        .setTitle("✅ Kayıt Tamamlandı")
        .setDescription(
          `${member} artık **${name}** olarak kayıtlı.\n` +
          `👮 Kayıt Yetkilisi: ${interaction.user}`
        )
        .setColor(0x57f287)
        .setTimestamp()
    ]
  });
}

/* =========================================================
   PLAYER SEARCH
========================================================= */

async function searchPlayers(message, queryText) {
  if (!queryText) {
    return reply(
      message,
      "❌ Aranacak oyuncu adını yazın."
    );
  }

  const query = normalize(queryText);

  const members = [
    ...message.guild.members.cache.values()
  ].filter(m => !m.user.bot);

  const results = members
    .map(member => {
      const names = [
        normalize(member.displayName),
        normalize(member.nickname || ""),
        normalize(member.user.username)
      ];

      let score = 999;

      for (const name of names) {
        if (name === query) score = 0;
        else if (name.startsWith(query)) score = Math.min(score, 1);
        else if (name.includes(query)) score = Math.min(score, 2);
      }

      return { member, score };
    })
    .filter(x => x.score < 999)
    .sort((a, b) => a.score - b.score);

  if (!results.length) {
    return reply(
      message,
      "❌ Bu isimde veya benzer isimde kayıtlı oyuncu bulunamadı."
    );
  }

  const lines = results.map((x, i) => {
    const m = x.member;
    const data = getUserData(m.id);

    return (
      `**${i + 1}. ${m.displayName}**\n` +
      `> Kullanıcı: ${m.user.username}\n` +
      `> Değer: ${money(data.value)}`
    );
  });

  return reply(message, {
    embeds: [
      new EmbedBuilder()
        .setTitle("🔎 Oyuncu Arama")
        .setDescription(lines.join("\n\n").slice(0, 4000))
        .setColor(0x5865f2)
    ]
  });
}

/* =========================================================
   VALUE
========================================================= */

async function valueCommand(message, args, mode) {
  if (
    !isAdmin(message.member) &&
    !hasRole(message.member, ROLES.VALUE)
  ) {
    return reply(
      message,
      "❌ Bu komutu yalnızca Değer Yetkilisi kullanabilir."
    );
  }

  if (message.channel.id !== CHANNELS.VALUE) {
    return reply(
      message,
      `❌ Bu komut yalnızca <#${CHANNELS.VALUE}> kanalında kullanılabilir.`
    );
  }

  const target = await resolveMember(
    message,
    args[0]
  );

  const amount = parseMoney(args[1]);

  if (!target) {
    return reply(
      message,
      "❌ Oyuncu bulunamadı."
    );
  }

  if (!amount) {
    return reply(
      message,
      "❌ Örnek: `.dver @Oyuncu 5M`"
    );
  }

  const nickname =
    target.nickname ||
    target.user.displayName ||
    target.user.username;

  const current = getTrailingValue(nickname);

  if (current === null) {
    return reply(
      message,
      "❌ Oyuncunun takma adının sonunda M€ değeri bulunamadı."
    );
  }

  const final =
    mode === "add"
      ? current + amount
      : current - amount;

  if (final < 0) {
    return reply(
      message,
      "❌ Değer 0M€ altına inemez."
    );
  }

  if (final > 1000) {
    return reply(
      message,
      "❌ Maksimum oyuncu değeri 1000M€ olabilir."
    );
  }

  const newNickname = nickname.replace(
    /(\d+)M€\s*$/,
    `${final}M€`
  );

  try {
    await target.setNickname(newNickname);
  } catch (err) {
    return reply(
      message,
      `❌ Takma ad değiştirilemedi: ${err.message}`
    );
  }

  getUserData(target.id).value = final;
  saveData();

  return reply(
    message,
    `✅ ${target} değerine **${mode === "add" ? "+" : "-"}${amount}M€** uygulandı.\n` +
    `💰 Yeni değer: **${final}M€**`
  );
}

/* =========================================================
   TRAINING
========================================================= */

async function training(message) {
  if (message.channel.id !== CHANNELS.TRAINING) {
    return reply(
      message,
      `❌ Bu komut yalnızca <#${CHANNELS.TRAINING}> kanalında kullanılabilir.`
    );
  }

  const id = message.author.id;

  if (!db.training[id]) {
    db.training[id] = 0;
  }

  db.training[id]++;

  if (db.training[id] >= 5) {
    db.training[id] = 0;

    const member = message.member;

    await addValueToMember(member, 3);

    return reply(
      message,
      `🏋️ **ANTRENMAN TAMAMLANDI!**\n\n` +
      `📈 İlerleme: **5/5**\n` +
      `💰 Ödül: **+3M€**\n` +
      `🔄 Sayaç: **0/5**`
    );
  }

  saveData();

  return reply(
    message,
    `🏋️ Antrenman yapıldı!\n` +
    `📈 İlerleme: **${db.training[id]}/5**`
  );
}

/* =========================================================
   PENALTY
========================================================= */

async function penalty(message) {
  if (message.channel.id !== CHANNELS.PENALTY) {
    return reply(
      message,
      `❌ Bu komut yalnızca <#${CHANNELS.PENALTY}> kanalında kullanılabilir.`
    );
  }

  const random = Math.random();

  if (random < 0.50) {
    await addValueToMember(
      message.member,
      5
    );

    return reply(
      message,
      "⚽ **GOOOL!**\n\n" +
      "🧤 Axera Kalecisi topu çıkaramadı!\n" +
      "💰 **+5M€** kazandın."
    );
  }

  if (random < 0.75) {
    return reply(
      message,
      "🥅 **DİREK!**\n\n" +
      "Top direkten döndü."
    );
  }

  return reply(
    message,
    "🧤 **KURTARIŞ!**\n\n" +
    "Axera Kalecisi penaltıyı çıkardı."
  );
}

/* =========================================================
   TWEET
========================================================= */

async function tweet(message, args) {
  if (message.channel.id !== CHANNELS.TWEET) {
    return reply(
      message,
      `❌ Bu komut yalnızca <#${CHANNELS.TWEET}> kanalında kullanılabilir.`
    );
  }

  const text = args.join(" ").trim();

  if (!text) {
    return reply(
      message,
      "❌ Tweet içeriği yazın."
    );
  }

  const now = Date.now();
  const last =
    db.tweetCooldowns[message.author.id] || 0;

  if (
    now - last <
    24 * 60 * 60 * 1000
  ) {
    return reply(
      message,
      "⏳ Tweet ödülünü 24 saatte bir alabilirsin."
    );
  }

  db.tweetCooldowns[message.author.id] = now;

  try {
    await message.delete();
  } catch {}

  await send(message.channel, {
    embeds: [
      new EmbedBuilder()
        .setAuthor({
          name:
            message.member?.displayName ||
            message.author.username,
          iconURL:
            message.author.displayAvatarURL()
        })
        .setDescription(text)
        .setFooter({
          text: "Axera League • Tweet"
        })
        .setTimestamp()
    ]
  });

  await addValueToMember(
    message.member,
    5
  );
}

/* =========================================================
   TEAM
========================================================= */

function speakerOrAdmin(member) {
  return (
    isAdmin(member) ||
    hasRole(member, ROLES.SPEAKER)
  );
}

async function teamAdd(message) {
  if (!speakerOrAdmin(message.member)) {
    return reply(message, "❌ Yetkiniz yok.");
  }

  const role = message.mentions.roles.first();

  if (!role) {
    return reply(
      message,
      "❌ Bir takım rolü etiketleyin."
    );
  }

  if (db.teams[role.id]) {
    return reply(
      message,
      "❌ Bu takım zaten mevcut."
    );
  }

  ensureTeam(role.id, role.name);
  ensureStanding(role.id, role.name);

  saveData();

  return reply(
    message,
    `✅ **${role.name}** takımı sisteme eklendi.`
  );
}

async function teamRemove(message) {
  if (!speakerOrAdmin(message.member)) {
    return reply(message, "❌ Yetkiniz yok.");
  }

  const role = message.mentions.roles.first();

  if (!role) {
    return reply(
      message,
      "❌ Bir takım rolü etiketleyin."
    );
  }

  const active = Object.values(
    db.activeMatches
  ).some(
    match =>
      match.team1 === role.id ||
      match.team2 === role.id
  );

  if (active) {
    return reply(
      message,
      "❌ Takım aktif maçtayken silinemez."
    );
  }

  delete db.teams[role.id];
  delete db.standings[role.id];
  delete db.formations[role.id];

  db.fixtures = db.fixtures.filter(
    f =>
      f.team1 !== role.id &&
      f.team2 !== role.id
  );

  saveData();

  return reply(
    message,
    `🗑️ **${role.name}** sistemden kaldırıldı.`
  );
}

async function teamValue(message, args) {
  if (!speakerOrAdmin(message.member)) {
    return reply(message, "❌ Yetkiniz yok.");
  }

  const role = message.mentions.roles.first();
  const amount = parseMoney(args[1]);

  if (!role || !amount) {
    return reply(
      message,
      "❌ Örnek: `.takımdeğer @Takım 850M`"
    );
  }

  const team = ensureTeam(
    role.id,
    role.name
  );

  team.value = Math.min(
    1000,
    amount
  );

  saveData();

  return reply(
    message,
    `💰 **${role.name}** takım değeri: **${team.value}M€**`
  );
}

/* =========================================================
   SQUAD
========================================================= */

async function squadAdd(message, args) {
  if (!speakerOrAdmin(message.member)) {
    return reply(message, "❌ Yetkiniz yok.");
  }

  const role = message.mentions.roles.first();
  const player = message.mentions.members.first();

  const positions = [
    "GK",
    "Kaleci",
    "DEF",
    "Defans",
    "MID",
    "OrtaSaha",
    "FWD",
    "Forvet"
  ];

  const position =
    args.find(x =>
      positions.includes(x)
    ) || "MID";

  if (!role || !player) {
    return reply(
      message,
      "❌ Örnek: `.kadroekle @Takım @Oyuncu MID`"
    );
  }

  const team = ensureTeam(
    role.id,
    role.name
  );

  if (
    team.squad.some(
      p => p.userId === player.id
    )
  ) {
    return reply(
      message,
      "❌ Oyuncu zaten kadroda."
    );
  }

  team.squad.push({
    userId: player.id,
    position
  });

  saveData();

  return reply(
    message,
    `✅ ${player} kadroya eklendi.\n📍 Pozisyon: **${position}**`
  );
}

async function squadRemove(message) {
  if (!speakerOrAdmin(message.member)) {
    return reply(message, "❌ Yetkiniz yok.");
  }

  const role = message.mentions.roles.first();
  const player = message.mentions.members.first();

  if (!role || !player) {
    return reply(
      message,
      "❌ Örnek: `.kadrocikar @Takım @Oyuncu`"
    );
  }

  const team = db.teams[role.id];

  if (!team) {
    return reply(
      message,
      "❌ Takım bulunamadı."
    );
  }

  const before = team.squad.length;

  team.squad = team.squad.filter(
    p => p.userId !== player.id
  );

  if (before === team.squad.length) {
    return reply(
      message,
      "❌ Oyuncu kadroda bulunamadı."
    );
  }

  saveData();

  return reply(
    message,
    `✅ ${player} kadrodan çıkarıldı.`
  );
}

async function showSquad(message) {
  const role = message.mentions.roles.first();

  if (!role) {
    return reply(
      message,
      "❌ Örnek: `.kadro @Takım`"
    );
  }

  const team = db.teams[role.id];

  if (!team) {
    return reply(
      message,
      "❌ Takım bulunamadı."
    );
  }

  const groups = {};

  for (const p of team.squad) {
    if (!groups[p.position]) {
      groups[p.position] = [];
    }

    const member =
      await memberById(
        message.guild,
        p.userId
      );

    if (member) {
      groups[p.position].push(
        `• ${member.displayName} — ${money(getUserData(member.id).value)}`
      );
    }
  }

  const text =
    Object.entries(groups)
      .map(
        ([position, players]) =>
          `**${position}**\n${players.join("\n")}`
      )
      .join("\n\n") ||
    "Kadro boş.";

  return reply(message, {
    embeds: [
      new EmbedBuilder()
        .setTitle(`📋 ${role.name} Kadrosu`)
        .setDescription(text)
        .setColor(0x5865f2)
        .setFooter({
          text:
            `Oyuncu: ${team.squad.length} • ` +
            `Takım değeri: ${money(team.value)}`
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

async function formationPanel(message) {
  if (!speakerOrAdmin(message.member)) {
    return reply(message, "❌ Yetkiniz yok.");
  }

  const role = message.mentions.roles.first();

  if (!role) {
    return reply(
      message,
      "❌ Örnek: `.formasyon @Takım`"
    );
  }

  if (!db.teams[role.id]) {
    return reply(
      message,
      "❌ Takım bulunamadı."
    );
  }

  const menu =
    new StringSelectMenuBuilder()
      .setCustomId(
        `formation_${role.id}`
      )
      .setPlaceholder(
        "Formasyon seçin"
      )
      .addOptions(
        FORMATIONS.map(f => ({
          label: f,
          value: f
        }))
      );

  return reply(message, {
    content:
      `⚽ **${role.name}** için formasyon seçin:`,
    components: [
      new ActionRowBuilder()
        .addComponents(menu)
    ]
  });
}

/* =========================================================
   STANDINGS
========================================================= */

async function standings(message) {
  const rows = Object.values(
    db.standings
  ).sort((a, b) => {
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

  if (!rows.length) {
    return reply(
      message,
      "📊 Henüz puan tablosu oluşturulmadı."
    );
  }

  const text = rows.map(
    (team, i) => {
      const gd =
        team.goalsFor -
        team.goalsAgainst;

      return (
        `**${i + 1}. ${team.name}**\n` +
        `P: ${team.points} | O: ${team.played} | ` +
        `G: ${team.wins} | B: ${team.draws} | ` +
        `M: ${team.losses} | AV: ${gd}`
      );
    }
  ).join("\n\n");

  return reply(message, {
    embeds: [
      new EmbedBuilder()
        .setTitle("🏆 AXERA LEAGUE | PUAN DURUMU")
        .setDescription(text)
        .setColor(0xf1c40f)
    ]
  });
}

async function addPoints(message, args) {
  if (!speakerOrAdmin(message.member)) {
    return reply(message, "❌ Yetkiniz yok.");
  }

  const role =
    message.mentions.roles.first();

  const amount =
    Number(args[1]);

  if (
    !role ||
    !Number.isInteger(amount) ||
    amount < 1
  ) {
    return reply(
      message,
      "❌ Örnek: `.puanekle @Takım 3`"
    );
  }

  const standing =
    ensureStanding(
      role.id,
      role.name
    );

  standing.points += amount;

  saveData();

  return reply(
    message,
    `✅ **${role.name}** takımına **${amount} puan** eklendi.`
  );
}

/* =========================================================
   CUPS / MUSEUM
========================================================= */

async function addCup(message, args) {
  if (!speakerOrAdmin(message.member)) {
    return reply(message, "❌ Yetkiniz yok.");
  }

  const role =
    message.mentions.roles.first();

  const cup =
    args.slice(1).join(" ").trim();

  if (!role || !cup) {
    return reply(
      message,
      "❌ Örnek: `.kupaekle @Takım Şampiyonlar Ligi`"
    );
  }

  const team =
    ensureTeam(
      role.id,
      role.name
    );

  if (!team.cups.includes(cup)) {
    team.cups.push(cup);
  }

  saveData();

  return reply(
    message,
    `🏆 **${cup}** kupası **${role.name}** müzesine eklendi.`
  );
}

async function removeCup(message, args) {
  if (!speakerOrAdmin(message.member)) {
    return reply(message, "❌ Yetkiniz yok.");
  }

  const role =
    message.mentions.roles.first();

  const cup =
    args.slice(1).join(" ").trim();

  if (!role || !cup) {
    return reply(
      message,
      "❌ Örnek: `.kupasil @Takım Kupa Adı`"
    );
  }

  const team =
    db.teams[role.id];

  if (!team) {
    return reply(
      message,
      "❌ Takım bulunamadı."
    );
  }

  team.cups =
    team.cups.filter(
      x => normalize(x) !== normalize(cup)
    );

  saveData();

  return reply(
    message,
    `🗑️ **${cup}** kupası kaldırıldı.`
  );
}

async function museum(message) {
  const role =
    message.mentions.roles.first();

  if (!role) {
    return reply(
      message,
      "❌ Örnek: `.müze @Takım`"
    );
  }

  const team =
    db.teams[role.id];

  if (!team) {
    return reply(
      message,
      "❌ Takım bulunamadı."
    );
  }

  return reply(message, {
    embeds: [
      new EmbedBuilder()
        .setTitle(`🏛️ ${role.name} Müzesi`)
        .setDescription(
          team.cups.length
            ? team.cups.map(
                x => `🏆 ${x}`
              ).join("\n")
            : "Henüz kupa bulunmuyor."
        )
        .setColor(0xf1c40f)
    ]
  });
}

/* =========================================================
   MATCH ENGINE
========================================================= */

function teamPlayers(guild, teamId) {
  const team = db.teams[teamId];

  if (!team) return [];

  const ids = new Set(
    team.squad.map(p => p.userId)
  );

  const role =
    guild.roles.cache.get(teamId);

  if (role) {
    for (const member of role.members.values()) {
      if (!member.user.bot) {
        ids.add(member.id);
      }
    }
  }

  return [...ids]
    .map(id => {
      const member =
        guild.members.cache.get(id);

      if (!member) return null;

      const squad =
        team.squad.find(
          p => p.userId === id
        );

      return {
        id,
        member,
        position:
          squad?.position || "MID"
      };
    })
    .filter(Boolean);
}

function pickPlayer(players) {
  if (!players.length) return null;

  return players[
    Math.floor(
      Math.random() * players.length
    )
  ];
}

function addMatchStats(
  userId,
  type
) {
  const user =
    getUserData(userId);

  if (!user.stats) {
    user.stats = {
      goals: 0,
      assists: 0,
      matches: 0
    };
  }

  if (type === "goal") {
    user.stats.goals++;
  }

  if (type === "assist") {
    user.stats.assists++;
  }

  if (type === "match") {
    user.stats.matches++;
  }

  saveData();
}

function randomCommentary(
  teamName,
  opponentName,
  players
) {
  const player =
    pickPlayer(players);

  const name =
    player?.member?.displayName ||
    "Oyuncu";

  const comments = [
    `⚡ ${name} topu kontrol etti ve ${opponentName} yarı alanına ilerliyor!`,
    `🎯 ${name} ceza sahasına doğru pasını gönderdi!`,
    `🔥 ${name} rakibini geçmeye çalışıyor!`,
    `🧤 Kaleci topu kontrol etti!`,
    `⚽ ${teamName} hızlı bir hücum geliştiriyor!`,
    `🛡️ ${opponentName} savunması müdahale etti!`,
    `💨 Hızlı bir kanat atağı gelişiyor!`,
    `🎯 Uzaklardan şut geldi!`,
    `👏 Tribünlerde büyük heyecan!`
  ];

  return comments[
    Math.floor(
      Math.random() * comments.length
    )
  ];
}

async function finishMatch(guild, match) {
  if (match.finished) return;

  match.finished = true;

  const team1 =
    db.teams[match.team1];

  const team2 =
    db.teams[match.team2];

  if (!team1 || !team2) return;

  const s1 =
    ensureStanding(
      match.team1,
      team1.name
    );

  const s2 =
    ensureStanding(
      match.team2,
      team2.name
    );

  s1.played++;
  s2.played++;

  s1.goalsFor += match.score1;
  s1.goalsAgainst += match.score2;

  s2.goalsFor += match.score2;
  s2.goalsAgainst += match.score1;

  if (match.score1 > match.score2) {
    s1.wins++;
    s1.points += 3;
    s2.losses++;
  } else if (match.score2 > match.score1) {
    s2.wins++;
    s2.points += 3;
    s1.losses++;
  } else {
    s1.draws++;
    s2.draws++;
    s1.points++;
    s2.points++;
  }

  const allPlayers = [
    ...teamPlayers(
      guild,
      match.team1
    ),
    ...teamPlayers(
      guild,
      match.team2
    )
  ];

  const rewardKey =
    `${match.team1}_${match.team2}_${match.startedAt}`;

  if (!db.matchRewards[rewardKey]) {
    db.matchRewards[rewardKey] = true;

    for (const player of allPlayers) {
      await addValueToMember(
        player.member,
        5
      );
      addMatchStats(
        player.id,
        "match"
      );
    }
  }

  saveData();

  const channel =
    guild.channels.cache.get(
      CHANNELS.MATCH
    );

  if (channel) {
    await send(channel, {
      embeds: [
        new EmbedBuilder()
          .setTitle("🏁 MAÇ BİTTİ")
          .setDescription(
            `**${team1.name} ${match.score1} - ${match.score2} ${team2.name}**`
          )
          .addFields(
            {
              name: "🎯 Gol Ödülleri",
              value:
                "Gol: +2M€\nAsist: +1M€",
              inline: true
            },
            {
              name: "👥 Katılım",
              value:
                "Katılan oyuncular: +5M€",
              inline: true
            }
          )
          .setColor(0x57f287)
          .setTimestamp()
      ]
    });
  }

  delete db.activeMatches[match.id];

  db.matchHistory.push({
    id: match.id,
    team1: match.team1,
    team2: match.team2,
    score1: match.score1,
    score2: match.score2,
    startedAt: match.startedAt,
    finishedAt: Date.now()
  });

  saveData();
}

async function startMatch(
  guild,
  team1Id,
  team2Id
) {
  const team1 =
    db.teams[team1Id];

  const team2 =
    db.teams[team2Id];

  if (!team1 || !team2) {
    throw new Error(
      "Takımlardan biri sistemde yok."
    );
  }

  const matchId =
    `${team1Id}_${team2Id}_${Date.now()}`;

  const match = {
    id: matchId,
    team1: team1Id,
    team2: team2Id,
    score1: 0,
    score2: 0,
    minute: 0,
    startedAt: Date.now(),
    finished: false,
    commentary: []
  };

  db.activeMatches[matchId] =
    match;

  saveData();

  const channel =
    guild.channels.cache.get(
      CHANNELS.MATCH
    );

  const message =
    channel
      ? await send(channel, {
          embeds: [
            new EmbedBuilder()
              .setTitle("⚽ CANLI MAÇ")
              .setDescription(
                `**${team1.name} 0 - 0 ${team2.name}**\n\n` +
                `⏱️ Dakika: **0'**\n` +
                `📢 Maç başlıyor...`
              )
              .setColor(0x3498db)
          ]
        })
      : null;

  const players1 =
    teamPlayers(
      guild,
      team1Id
    );

  const players2 =
    teamPlayers(
      guild,
      team2Id
    );

  const interval =
    setInterval(async () => {
      try {
        if (match.finished) {
          clearInterval(interval);
          return;
        }

        match.minute++;

        const advantage =
          team1.value > team2.value
            ? 0.055
            : team2.value > team1.value
              ? -0.055
              : 0;

        if (Math.random() < 0.055 + advantage) {
          const scoringTeam =
            Math.random() < 0.5
              ? 1
              : 2;

          if (
            scoringTeam === 1 &&
            players1.length
          ) {
            const scorer =
              pickPlayer(players1);

            match.score1++;

            addValue(
              scorer.id,
              2
            );

            addMatchStats(
              scorer.id,
              "goal"
            );

            const assist =
              pickPlayer(
                players1.filter(
                  p => p.id !== scorer.id
                )
              );

            if (assist) {
              addValue(
                assist.id,
                1
              );

              addMatchStats(
                assist.id,
                "assist"
              );
            }

            match.commentary.push(
              `⚽ ${match.minute}' GOL! ${scorer.member.displayName} skoru değiştirdi!`
            );
          }

          if (
            scoringTeam === 2 &&
            players2.length
          ) {
            const scorer =
              pickPlayer(players2);

            match.score2++;

            addValue(
              scorer.id,
              2
            );

            addMatchStats(
              scorer.id,
              "goal"
            );

            const assist =
              pickPlayer(
                players2.filter(
                  p => p.id !== scorer.id
                )
              );

            if (assist) {
              addValue(
                assist.id,
                1
              );

              addMatchStats(
                assist.id,
                "assist"
              );
            }

            match.commentary.push(
              `⚽ ${match.minute}' GOL! ${scorer.member.displayName} skoru değiştirdi!`
            );
          }
        } else {
          const team =
            Math.random() < 0.5
              ? team1
              : team2;

          const players =
            team.id === team1Id
              ? players1
              : players2;

          match.commentary.push(
            `${match.minute}' ${randomCommentary(
              team.name,
              team.id === team1Id
                ? team2.name
                : team1.name,
              players
            )}`
          );
        }

        if (match.commentary.length > 6) {
          match.commentary.shift();
        }

        if (message) {
          await message.edit({
            embeds: [
              new EmbedBuilder()
                .setTitle("⚽ CANLI MAÇ")
                .setDescription(
                  `**${team1.name} ${match.score1} - ${match.score2} ${team2.name}**\n\n` +
                  `⏱️ Dakika: **${match.minute}'**\n\n` +
                  match.commentary
                    .slice()
                    .reverse()
                    .join("\n")
                )
                .setColor(0x3498db)
                .setTimestamp()
            ]
          });
        }

        if (match.minute >= 90) {
          clearInterval(interval);
          await finishMatch(
            guild,
            match
          );
        }

        saveData();
      } catch (err) {
        console.error(
          "Maç motoru:",
          err
        );

        clearInterval(interval);

        try {
          await finishMatch(
            guild,
            match
          );
        } catch {}
      }
    }, 3000);

  return match;
}

/* =========================================================
   FIXTURES
========================================================= */

function parseDateTime(date, time) {
  const match =
    String(date).match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

  const timeMatch =
    String(time).match(
      /^(\d{2}):(\d{2})$/
    );

  if (!match || !timeMatch) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  const result =
    new Date(
      year,
      month,
      day,
      hour,
      minute,
      0,
      0
    );

  if (Number.isNaN(result.getTime())) {
    return null;
  }

  return result.getTime();
}

async function addFixture(message, args) {
  if (!speakerOrAdmin(message.member)) {
    return reply(message, "❌ Yetkiniz yok.");
  }

  const roles =
    [...message.mentions.roles.values()];

  if (roles.length < 2) {
    return reply(
      message,
      "❌ İki takım etiketlemelisiniz."
    );
  }

  const date =
    args.find(x =>
      /^\d{4}-\d{2}-\d{2}$/.test(x)
    );

  const time =
    args.find(x =>
      /^\d{2}:\d{2}$/.test(x)
    );

  const timestamp =
    parseDateTime(date, time);

  if (!timestamp) {
    return reply(
      message,
      "❌ Örnek: `.fiksturekle @Takım1 @Takım2 2026-09-10 20:00`"
    );
  }

  if (
    !db.teams[roles[0].id] ||
    !db.teams[roles[1].id]
  ) {
    return reply(
      message,
      "❌ Önce takımları `.takımekle` ile sisteme ekleyin."
    );
  }

  const fixture = {
    id: db.nextFixtureId++,
    team1: roles[0].id,
    team2: roles[1].id,
    timestamp,
    started: false
  };

  db.fixtures.push(fixture);

  saveData();

  return reply(
    message,
    `📅 Fikstür eklendi!\n` +
    `⚽ ${roles[0]} - ${roles[1]}\n` +
    `🕐 <t:${Math.floor(timestamp / 1000)}:F>`
  );
}

async function listFixtures(message) {
  const upcoming =
    db.fixtures
      .filter(f => !f.started)
      .sort(
        (a, b) =>
          a.timestamp - b.timestamp
      );

  if (!upcoming.length) {
    return reply(
      message,
      "📅 Bekleyen fikstür bulunmuyor."
    );
  }

  const lines = [];

  for (const f of upcoming.slice(0, 20)) {
    const t1 =
      db.teams[f.team1];

    const t2 =
      db.teams[f.team2];

    if (!t1 || !t2) continue;

    lines.push(
      `⚽ **${t1.name} - ${t2.name}**\n` +
      `🕐 <t:${Math.floor(f.timestamp / 1000)}:F>`
    );
  }

  return reply(message, {
    embeds: [
      new EmbedBuilder()
        .setTitle("📅 AXERA LEAGUE | FİKSTÜR")
        .setDescription(
          lines.join("\n\n") ||
          "Fikstür bulunmuyor."
        )
        .setColor(0x5865f2)
    ]
  });
}

async function removeFixture(message) {
  if (!speakerOrAdmin(message.member)) {
    return reply(message, "❌ Yetkiniz yok.");
  }

  const roles =
    [...message.mentions.roles.values()];

  if (roles.length < 2) {
    return reply(
      message,
      "❌ İki takım etiketleyin."
    );
  }

  const before =
    db.fixtures.length;

  db.fixtures =
    db.fixtures.filter(
      f =>
        !(
          f.team1 === roles[0].id &&
          f.team2 === roles[1].id
        )
    );

  saveData();

  return reply(
    message,
    before === db.fixtures.length
      ? "❌ Fikstür bulunamadı."
      : "✅ Fikstür kaldırıldı."
  );
}

async function fixtureScheduler() {
  const now = Date.now();

  for (const fixture of db.fixtures) {
    if (
      fixture.started ||
      fixture.timestamp > now
    ) {
      continue;
    }

    fixture.started = true;

    for (const guild of client.guilds.cache.values()) {
      if (
        guild.roles.cache.has(
          fixture.team1
        ) &&
        guild.roles.cache.has(
          fixture.team2
        )
      ) {
        try {
          await startMatch(
            guild,
            fixture.team1,
            fixture.team2
          );
        } catch (err) {
          console.error(
            "Fikstür maçı:",
            err.message
          );
        }
      }
    }
  }

  saveData();
}

/* =========================================================
   TICKET
========================================================= */

async function ticketPanel(message) {
  if (!isAdmin(message.member)) {
    return reply(
      message,
      "❌ Yalnızca Yönetici kullanabilir."
    );
  }

  const row =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId("ticket_create")
          .setLabel("Destek Talebi Oluştur")
          .setEmoji("🎫")
          .setStyle(ButtonStyle.Primary)
      );

  return reply(message, {
    embeds: [
      new EmbedBuilder()
        .setTitle("🎫 AXERA LEAGUE DESTEK")
        .setDescription(
          "Destek almak için aşağıdaki butona basın."
        )
        .setColor(0x5865f2)
    ],
    components: [row]
  });
}

async function createTicket(interaction) {
  const guild =
    interaction.guild;

  const existing =
    Object.values(db.tickets)
      .find(
        x =>
          x.guildId === guild.id &&
          x.userId === interaction.user.id &&
          !x.closed
      );

  if (existing) {
    return interaction.reply({
      content:
        `❌ Zaten açık ticketın var: <#${existing.channelId}>`,
      ephemeral: true
    });
  }

  const channel =
    await guild.channels.create({
      name:
        `ticket-${interaction.user.username}`
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "")
          .slice(0, 20),
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: guild.id,
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
          id: ROLES.MOD,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        }
      ]
    });

  db.tickets[channel.id] = {
    guildId: guild.id,
    userId: interaction.user.id,
    channelId: channel.id,
    lastMessage: Date.now(),
    closed: false
  };

  saveData();

  const row =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId("ticket_close")
          .setLabel("Bileti Kapat")
          .setEmoji("🔒")
          .setStyle(ButtonStyle.Danger)
      );

  await channel.send({
    content:
      `${interaction.user} hoş geldin! Destek ekibi kısa süre içinde yardımcı olacaktır.`,
    components: [row]
  });

  return interaction.reply({
    content:
      `✅ Ticket oluşturuldu: ${channel}`,
    ephemeral: true
  });
}

async function closeTicket(interaction) {
  const ticket =
    db.tickets[
      interaction.channel.id
    ];

  if (!ticket) {
    return interaction.reply({
      content:
        "❌ Bu kanal ticket değil.",
      ephemeral: true
    });
  }

  if (
    ticket.userId !== interaction.user.id &&
    !isStaff(interaction.member)
  ) {
    return interaction.reply({
      content:
        "❌ Bu ticketı kapatma yetkin yok.",
      ephemeral: true
    });
  }

  ticket.closed = true;

  saveData();

  await interaction.reply(
    "🔒 Ticket kapatılıyor..."
  );

  setTimeout(() => {
    interaction.channel
      .delete()
      .catch(() => {});
  }, 1500);
}

/* =========================================================
   ROLE PANEL
========================================================= */

async function rolePanel(message) {
  if (!isAdmin(message.member)) {
    return reply(message, "❌ Yetkiniz yok.");
  }

  const buttons = [
    [
      "Partner Ping",
      "partner_ping",
      "🤝",
      ROLES.PARTNER_PING
    ],
    [
      "Maç Ping",
      "match_ping",
      "⚽",
      ROLES.MATCH_PING
    ],
    [
      "Duyuru Ping",
      "announce_ping",
      "📢",
      ROLES.ANNOUNCE_PING
    ],
    [
      "Çekiliş Ping",
      "giveaway_ping",
      "🎉",
      ROLES.GIVEAWAY_PING
    ],
    [
      "Medya Ping",
      "media_ping",
      "📰",
      ROLES.MEDIA_PING
    ]
  ];

  const rows = [];

  for (
    let i = 0;
    i < buttons.length;
    i += 2
  ) {
    const row =
      new ActionRowBuilder();

    for (
      const button of buttons.slice(i, i + 2)
    ) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(
            `pingrole_${button[1]}_${button[3]}`
          )
          .setLabel(button[0])
          .setEmoji(button[2])
          .setStyle(ButtonStyle.Secondary)
      );
    }

    rows.push(row);
  }

  return reply(message, {
    embeds: [
      new EmbedBuilder()
        .setTitle("🎭 AXERA LEAGUE | ROL PANELİ")
        .setDescription(
          "İstediğiniz bildirim rolünü almak veya kaldırmak için butonlara basın."
        )
        .setColor(0x5865f2)
    ],
    components: rows
  });
}

/* =========================================================
   CONDITIONS
========================================================= */

async function conditions(message) {
  return reply(message, {
    embeds: [
      new EmbedBuilder()
        .setTitle("📋 AXERA LEAGUE | ŞARTLAR")
        .setDescription(
          "✓ **Kalıcı Tık:** Kalıcı 「✓」 kanalından tıklayınız.\n\n" +
          "🎭 **Rol Al:** Rol Al kanalından en az 2 rol alınız.\n\n" +
          "ℹ️ Bu şartlar sistemleri kullanmanız için zorunlu değildir."
        )
        .setColor(0x5865f2)
    ]
  });
}

/* =========================================================
   MODERATION
========================================================= */

async function clearMessages(message, args) {
  if (!isAdmin(message.member)) {
    return reply(message, "❌ Yetkiniz yok.");
  }

  let amount =
    Number(args[0] || 1);

  if (
    !Number.isInteger(amount) ||
    amount < 1 ||
    amount > 100
  ) {
    return reply(
      message,
      "❌ 1-100 arasında bir sayı girin."
    );
  }

  try {
    const deleted =
      await message.channel.bulkDelete(
        amount,
        true
      );

    const notice =
      await message.channel.send(
        `🗑️ **${deleted.size}** mesaj silindi.`
      );

    setTimeout(
      () => notice.delete().catch(() => {}),
      3000
    );
  } catch (err) {
    return reply(
      message,
      `❌ Mesajlar silinemedi: ${err.message}`
    );
  }
}

async function embedCommand(message, args) {
  if (!isAdmin(message.member)) {
    return reply(message, "❌ Yetkiniz yok.");
  }

  const text =
    args.join(" ");

  const parts =
    text.split("|");

  const title =
    parts.shift()?.trim() ||
    "Axera League";

  const description =
    parts.join("|").trim();

  if (!description) {
    return reply(
      message,
      "❌ Örnek: `.embed Başlık | Açıklama`"
    );
  }

  return send(message.channel, {
    embeds: [
      new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(0x5865f2)
        .setTimestamp()
    ]
  });
}

async function kick(message) {
  if (!isAdmin(message.member)) {
    return reply(message, "❌ Yetkiniz yok.");
  }

  const target =
    message.mentions.members.first();

  if (!target) {
    return reply(message, "❌ Oyuncu etiketleyin.");
  }

  if (
    target.id === message.author.id ||
    target.roles.highest.position >=
    message.member.roles.highest.position
  ) {
    return reply(
      message,
      "❌ Bu kullanıcıya işlem uygulanamaz."
    );
  }

  await target.kick().catch(() => null);

  return reply(
    message,
    `👢 ${target.user.tag} sunucudan atıldı.`
  );
}

async function ban(message) {
  if (!isAdmin(message.member)) {
    return reply(message, "❌ Yetkiniz yok.");
  }

  const target =
    message.mentions.members.first();

  if (!target) {
    return reply(message, "❌ Oyuncu etiketleyin.");
  }

  if (
    target.roles.highest.position >=
    message.member.roles.highest.position
  ) {
    return reply(
      message,
      "❌ Bu kullanıcıya işlem uygulanamaz."
    );
  }

  await target.ban().catch(() => null);

  return reply(
    message,
    `🔨 ${target.user.tag} banlandı.`
  );
}

async function mute(message) {
  if (!isAdmin(message.member)) {
    return reply(message, "❌ Yetkiniz yok.");
  }

  const target =
    message.mentions.members.first();

  if (!target) {
    return reply(message, "❌ Oyuncu etiketleyin.");
  }

  await target.timeout(
    10 * 60 * 1000,
    "Axera League mute"
  ).catch(() => null);

  return reply(
    message,
    `🔇 ${target} 10 dakika susturuldu.`
  );
}

async function unmute(message) {
  if (!isAdmin(message.member)) {
    return reply(message, "❌ Yetkiniz yok.");
  }

  const target =
    message.mentions.members.first();

  if (!target) {
    return reply(message, "❌ Oyuncu etiketleyin.");
  }

  await target.timeout(
    null
  ).catch(() => null);

  return reply(
    message,
    `🔊 ${target} susturması kaldırıldı.`
  );
}

/* =========================================================
   TARGETED DM
========================================================= */

async function directMessage(message, args) {
  if (!isAdmin(message.member)) {
    return reply(message, "❌ Yetkiniz yok.");
  }

  const target =
    message.mentions.members.first();

  if (!target) {
    return reply(
      message,
      "❌ Örnek: `.dm @Oyuncu Merhaba!`"
    );
  }

  const mention =
    `<@${target.id}>`;

  const raw =
    message.content;

  const start =
    raw.indexOf(mention);

  let text =
    start >= 0
      ? raw
          .slice(
            start + mention.length
          )
          .trim()
      : args.slice(1).join(" ");

  if (!text) {
    return reply(
      message,
      "❌ Gönderilecek mesajı yazın."
    );
  }

  try {
    await target.send(text);

    return reply(
      message,
      `✅ ${target} kullanıcısına DM gönderildi.`
    );
  } catch {
    return reply(
      message,
      "❌ Kullanıcıya DM gönderilemedi."
    );
  }
}

/* =========================================================
   HELP
========================================================= */

async function help(message) {
  const text = [
    "**📋 KAYIT**",
    "`.k @Oyuncu İsim`",
    "`.kayıtsızver @Oyuncu`",
    "`.ara isim`",
    "",
    "**💰 DEĞER**",
    "`.dver @Oyuncu 5M`",
    "`.dsil @Oyuncu 5M`",
    "",
    "**🏋️ OYUNCU**",
    "`.ant` / `.antrenman`",
    "`.pen` / `.penaltı`",
    "`.tweet mesaj`",
    "",
    "**⚽ TAKIM**",
    "`.takımekle @Takım`",
    "`.takımkaldır @Takım`",
    "`.takımdeğer @Takım 850M`",
    "`.kadroekle @Takım @Oyuncu MID`",
    "`.kadrocikar @Takım @Oyuncu`",
    "`.kadro @Takım`",
    "`.formasyon @Takım`",
    "`.puan`",
    "`.puanekle @Takım 3`",
    "",
    "**📅 FİKSTÜR**",
    "`.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`",
    "`.fikstür`",
    "`.fiksturcikar @Takım1 @Takım2`",
    "",
    "**🏆 KUPA**",
    "`.kupaekle @Takım Kupa`",
    "`.kupasil @Takım Kupa`",
    "`.müze @Takım`",
    "",
    "**🎫 DESTEK**",
    "`.ticketpanel`",
    "",
    "**🎭 ROL**",
    "`.rolpanel`",
    "`.şart`",
    "",
    "**🛡️ MODERASYON**",
    "`.sil 100`",
    "`.embed Başlık | Açıklama`",
    "`.kick @Oyuncu`",
    "`.ban @Oyuncu`",
    "`.mute @Oyuncu`",
    "`.unmute @Oyuncu`",
    "`.dm @Oyuncu Mesaj`",
    "",
    "**🤖 YAPAY ZEKA**",
    "AI kanalında normal mesaj gönder.",
    "`.ai soru`",
    "`.yapayzeka soru`",
    "",
    "**⚽ AXERA LEAGUE**"
  ].join("\n");

  return reply(message, {
    embeds: [
      new EmbedBuilder()
        .setTitle("📚 AXERA LEAGUE | YARDIM")
        .setDescription(text)
        .setColor(0x5865f2)
    ]
  });
}

/* =========================================================
   AI
========================================================= */

const aiBusy = new Set();

async function askAI(
  message,
  question
) {
  if (!openai) {
    return reply(
      message,
      "❌ AI sistemi aktif değil. Railway'de `OPENAI_API_KEY` değişkenini ekleyin."
    );
  }

  const userId =
    message.author.id;

  if (aiBusy.has(userId)) {
    return reply(
      message,
      "⏳ Önceki AI yanıtın hazırlanıyor, biraz bekle."
    );
  }

  aiBusy.add(userId);

  try {
    if (
      normalize(question)
        .includes("seni kim kurdu")
    ) {
      aiBusy.delete(userId);

      return reply(
        message,
        "Lynox9380 kurdu."
      );
    }

    if (!db.aiMemory[userId]) {
      db.aiMemory[userId] = [];
    }

    db.aiMemory[userId].push({
      role: "user",
      content: question
    });

    db.aiMemory[userId] =
      db.aiMemory[userId].slice(-8);

    const context =
      db.aiMemory[userId]
        .map(
          x =>
            `${x.role}: ${x.content}`
        )
        .join("\n");

    /*
      STREAMING:
      Yanıtı tek seferde beklemek yerine
      OpenAI'den parçalar halinde alıyoruz.
    */

    const stream =
      await openai.responses.create({
        model: AI_MODEL,

        instructions:
          "Sen Axera adında hızlı, yardımcı ve doğal konuşan bir Discord AI asistanısın. " +
          "Türkçe cevap ver. Gereksiz uzun cevaplardan kaçın. " +
          "Discord mesajlarını mümkün olduğunca kısa ve anlaşılır yaz. " +
          "Kullanıcının istediği bilgiye doğrudan cevap ver. " +
          "Sunucu yönetimi veya Discord üzerinde işlem gerekiyorsa ilgili Discord komutunu belirt; " +
          "serbest metin üzerinden yönetici işlemi gerçekleştirme. " +
          "Seni kimin kurduğunu sorarsa yalnızca 'Lynox9380 kurdu.' de.",

        input:
          `Önceki konuşma:\n${context}\n\n` +
          `Yeni soru:\n${question}`,

        stream: true,

        max_output_tokens: 700,

        store: false
      });

    let full = "";
    let lastMessage = null;
    let lastEdit = 0;

    /*
      İlk parçayı alır almaz Discord'a cevap açıyoruz.
      Sonraki parçaları kısa aralıklarla güncelliyoruz.
    */

    for await (const event of stream) {
      if (
        event.type ===
        "response.output_text.delta"
      ) {
        full += event.delta;

        const now = Date.now();

        if (
          !lastMessage ||
          now - lastEdit >= 350
        ) {
          const preview =
            full.slice(0, 1900);

          if (!lastMessage) {
            try {
              lastMessage =
                await message.reply(
                  preview || "..."
                );
              lastEdit = now;
            } catch {}
          } else {
            try {
              await lastMessage.edit(
                preview || "..."
              );
              lastEdit = now;
            } catch {}
          }
        }
      }
    }

    if (!full.trim()) {
      full =
        "Üzgünüm, bu sefer cevap oluşturamadım.";
    }

    const parts =
      splitText(full);

    if (!lastMessage) {
      await reply(
        message,
        parts[0]
      );
    } else if (
      parts[0] !== lastMessage.content
    ) {
      await lastMessage.edit(
        parts[0]
      ).catch(() => {});
    }

    for (
      let i = 1;
      i < parts.length;
      i++
    ) {
      await send(
        message.channel,
        parts[i]
      );
    }

    db.aiMemory[userId].push({
      role: "assistant",
      content: full
    });

    db.aiMemory[userId] =
      db.aiMemory[userId].slice(-8);

    saveData();
  } catch (err) {
    console.error(
      "OpenAI AI hatası:",
      err
    );

    await reply(
      message,
      "❌ AI yanıtı alınırken bir hata oluştu. API anahtarını, model adını ve Railway loglarını kontrol edin."
    );
  } finally {
    aiBusy.delete(userId);
  }
}

/* =========================================================
   REGISTRATION ON JOIN
========================================================= */

client.on(
  "guildMemberAdd",
  async member => {
    try {
      await member.roles.add(
        ROLES.UNREGISTERED
      );
    } catch {}

    const channel =
      member.guild.channels.cache.get(
        CHANNELS.REGISTER
      );

    if (!channel) return;

    await send(channel, {
      embeds: [
        new EmbedBuilder()
          .setTitle("👋 AXERA LEAGUE | HOŞ GELDİN")
          .setDescription(
            `${member} sunucuya katıldı!\n\n` +
            `Kayıt işleminiz için ${`<@&${ROLES.REGISTER}>`} ekibinden yardım alabilirsiniz.`
          )
          .setColor(0x5865f2)
          .setTimestamp()
      ]
    });
  }
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

    client.user.setPresence({
      activities: [
        {
          name: "Axera League | Futbol RP",
          type: 0
        }
      ],
      status: "online"
    });

    setInterval(
      fixtureScheduler,
      1000
    );

    setInterval(
      async () => {
        for (
          const guild
          of client.guilds.cache.values()
        ) {
          const channel =
            guild.channels.cache.get(
              CHANNELS.STATUS
            );

          if (!channel) continue;

          await send(
            channel,
            `🟢 **Axera League Bot aktif!**\n` +
            `⚽ Futbol RP sistemleri çalışıyor.`
          );
        }
      },
      30 * 60 * 1000
    );
  }
);

/* =========================================================
   INTERACTIONS
========================================================= */

client.on(
  "interactionCreate",
  async interaction => {
    try {
      if (
        interaction.isButton()
      ) {
        const id =
          interaction.customId;

        if (
          id.startsWith("reg_")
        ) {
          if (
            !isAdmin(
              interaction.member
            ) &&
            !hasRole(
              interaction.member,
              ROLES.REGISTER
            )
          ) {
            return interaction.reply({
              content:
                "❌ Kayıt yetkiniz yok.",
              ephemeral: true
            });
          }

          if (
            id.startsWith(
              "reg_player_"
            )
          ) {
            return finishRegistration(
              interaction,
              "player"
            );
          }

          if (
            id.startsWith(
              "reg_member_"
            )
          ) {
            return finishRegistration(
              interaction,
              "member"
            );
          }

          if (
            id.startsWith(
              "reg_td_"
            )
          ) {
            return finishRegistration(
              interaction,
              "td"
            );
          }

          if (
            id.startsWith(
              "reg_gk_"
            )
          ) {
            return finishRegistration(
              interaction,
              "gk"
            );
          }
        }

        if (
          id === "ticket_create"
        ) {
          return createTicket(
            interaction
          );
        }

        if (
          id === "ticket_close"
        ) {
          return closeTicket(
            interaction
          );
        }

        if (
          id.startsWith(
            "pingrole_"
          )
        ) {
          const roleId =
            id.split("_").pop();

          if (
            !interaction.guild.roles.cache.has(
              roleId
            )
          ) {
            return interaction.reply({
              content:
                "❌ Rol bulunamadı.",
              ephemeral: true
            });
          }

          const member =
            interaction.member;

          if (
            member.roles.cache.has(
              roleId
            )
          ) {
            await member.roles.remove(
              roleId
            );

            return interaction.reply({
              content:
                "➖ Bildirim rolü kaldırıldı.",
              ephemeral: true
            });
          }

          await member.roles.add(
            roleId
          );

          return interaction.reply({
            content:
              "➕ Bildirim rolü verildi.",
            ephemeral: true
          });
        }
      }

      if (
        interaction.isStringSelectMenu()
      ) {
        if (
          interaction.customId.startsWith(
            "formation_"
          )
        ) {
          if (
            !speakerOrAdmin(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Yetkiniz yok.",
              ephemeral: true
            });
          }

          const teamId =
            interaction.customId
              .split("_")[1];

          const formation =
            interaction.values[0];

          if (!db.teams[teamId]) {
            return interaction.reply({
              content:
                "❌ Takım bulunamadı.",
              ephemeral: true
            });
          }

          db.teams[
            teamId
          ].formation = formation;

          db.formations[
            teamId
          ] = formation;

          saveData();

          return interaction.update({
            content:
              `✅ Formasyon **${formation}** olarak ayarlandı.`,
            components: []
          });
        }
      }
    } catch (err) {
      console.error(
        "Interaction:",
        err
      );

      if (!interaction.replied) {
        await interaction.reply({
          content:
            "❌ İşlem sırasında hata oluştu.",
          ephemeral: true
        }).catch(() => {});
      }
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
        AI CHANNEL:
        Komut değilse otomatik AI.
      */

      if (
        message.channel.id ===
        CHANNELS.AI &&
        !message.content.startsWith(PREFIX)
      ) {
        return askAI(
          message,
          message.content
        );
      }

      if (
        !message.content.startsWith(
          PREFIX
        )
      ) {
        return;
      }

      const content =
        message.content.slice(
          PREFIX.length
        ).trim();

      if (!content) return;

      const parts =
        content.split(/\s+/);

      const command =
        normalize(
          parts.shift()
        );

      const args = parts;

      /* =========================
         KAYIT
      ========================= */

      if (command === "k") {
        if (
          message.channel.id !==
          CHANNELS.REGISTER
        ) {
          return reply(
            message,
            `❌ Bu komut yalnızca <#${CHANNELS.REGISTER}> kanalında kullanılabilir.`
          );
        }

        if (
          !isAdmin(
            message.member
          ) &&
          !hasRole(
            message.member,
            ROLES.REGISTER
          )
        ) {
          return reply(
            message,
            "❌ Kayıt Yetkilisi olmalısınız."
          );
        }

        const target =
          message.mentions.members.first();

        if (!target) {
          return reply(
            message,
            "❌ Örnek: `.k @Oyuncu İsim`"
          );
        }

        const mention =
          `<@${target.id}>`;

        let nickname =
          message.content;

        nickname =
          nickname
            .slice(
              nickname.indexOf(mention) +
              mention.length
            )
            .trim();

        if (!nickname) {
          return reply(
            message,
            "❌ Oyuncunun kayıt ismini yazın."
          );
        }

        return registrationPanel(
          message,
          target,
          nickname
        );
      }

      if (
        command ===
        "kayıtsızver" ||
        command ===
        "kayitsizver"
      ) {
        if (
          !isAdmin(
            message.member
          ) &&
          !hasRole(
            message.member,
            ROLES.REGISTER
          )
        ) {
          return reply(
            message,
            "❌ Yetkiniz yok."
          );
        }

        const target =
          message.mentions.members.first();

        if (!target) {
          return reply(
            message,
            "❌ Oyuncu etiketleyin."
          );
        }

        for (
          const roleId of [
            ROLES.PLAYER,
            ROLES.MEMBER,
            ROLES.TD
          ]
        ) {
          await target.roles.remove(
            roleId
          ).catch(() => {});
        }

        await target.roles.add(
          ROLES.UNREGISTERED
        ).catch(() => {});

        getUserData(
          target.id
        ).registered = false;

        saveData();

        return reply(
          message,
          `✅ ${target} kayıtsız yapıldı.`
        );
      }

      /* =========================
         SEARCH
      ========================= */

      if (
        command === "ara"
      ) {
        return searchPlayers(
          message,
          args.join(" ")
        );
      }

      /* =========================
         VALUE
      ========================= */

      if (
        command === "dver"
      ) {
        return valueCommand(
          message,
          args,
          "add"
        );
      }

      if (
        command === "dsil"
      ) {
        return valueCommand(
          message,
          args,
          "remove"
        );
      }

      /* =========================
         TRAINING
      ========================= */

      if (
        command === "ant" ||
        command === "antrenman"
      ) {
        return training(message);
      }

      /* =========================
         PENALTY
      ========================= */

      if (
        command === "pen" ||
        command === "penaltı" ||
        command === "penalti"
      ) {
        return penalty(message);
      }

      /* =========================
         TWEET
      ========================= */

      if (
        command === "tweet"
      ) {
        return tweet(
          message,
          args
        );
      }

      /* =========================
         TEAM
      ========================= */

      if (
        command === "takımekle" ||
        command === "takimekle"
      ) {
        return teamAdd(message);
      }

      if (
        command === "takımkaldır" ||
        command === "takimkaldir"
      ) {
        return teamRemove(message);
      }

      if (
        command === "takımdeğer" ||
        command === "takimdeger"
      ) {
        return teamValue(
          message,
          args
        );
      }

      if (
        command === "kadroekle"
      ) {
        return squadAdd(
          message,
          args
        );
      }

      if (
        command === "kadrocikar"
      ) {
        return squadRemove(
          message
        );
      }

      if (
        command === "kadro" ||
        command === "kadrom"
      ) {
        return showSquad(
          message
        );
      }

      if (
        command === "formasyon"
      ) {
        return formationPanel(
          message
        );
      }

      /* =========================
         STANDINGS
      ========================= */

      if (
        command === "puan"
      ) {
        return standings(
          message
        );
      }

      if (
        command === "puanekle"
      ) {
        return addPoints(
          message,
          args
        );
      }

      /* =========================
         FIXTURE
      ========================= */

      if (
        command === "fiksturekle"
      ) {
        return addFixture(
          message,
          args
        );
      }

      if (
        command === "fikstür" ||
        command === "fikstur"
      ) {
        return listFixtures(
          message
        );
      }

      if (
        command === "fiksturcikar"
      ) {
        return removeFixture(
          message
        );
      }

      /* =========================
         CUP
      ========================= */

      if (
        command === "kupaekle"
      ) {
        return addCup(
          message,
          args
        );
      }

      if (
        command === "kupasil"
      ) {
        return removeCup(
          message,
          args
        );
      }

      if (
        command === "müze" ||
        command === "muze"
      ) {
        return museum(
          message
        );
      }

      /* =========================
         TICKET
      ========================= */

      if (
        command === "ticketpanel"
      ) {
        return ticketPanel(
          message
        );
      }

      /* =========================
         ROLE PANEL
      ========================= */

      if (
        command === "rolpanel"
      ) {
        return rolePanel(
          message
        );
      }

      /* =========================
         CONDITIONS
      ========================= */

      if (
        command === "şart" ||
        command === "sart"
      ) {
        return conditions(
          message
        );
      }

      /* =========================
         MODERATION
      ========================= */

      if (
        command === "sil"
      ) {
        return clearMessages(
          message,
          args
        );
      }

      if (
        command === "embed"
      ) {
        return embedCommand(
          message,
          args
        );
      }

      if (
        command === "kick"
      ) {
        return kick(
          message
        );
      }

      if (
        command === "ban"
      ) {
        return ban(
          message
        );
      }

      if (
        command === "mute"
      ) {
        return mute(
          message
        );
      }

      if (
        command === "unmute"
      ) {
        return unmute(
          message
        );
      }

      /* =========================
         TARGETED DM
      ========================= */

      if (
        command === "dm"
      ) {
        return directMessage(
          message,
          args
        );
      }

      /* =========================
         AI COMMAND
      ========================= */

      if (
        command === "ai" ||
        command === "yapayzeka"
      ) {
        const question =
          args.join(" ").trim();

        if (!question) {
          return reply(
            message,
            "🤖 Örnek: `.ai Merhaba Axera`"
          );
        }

        return askAI(
          message,
          question
        );
      }

      /* =========================
         HELP
      ========================= */

      if (
        command === "yardım" ||
        command === "yardim"
      ) {
        return help(
          message
        );
      }

    } catch (err) {
      console.error(
        "messageCreate:",
        err
      );

      await reply(
        message,
        "❌ Komut çalıştırılırken beklenmeyen bir hata oluştu."
      ).catch(() => {});
    }
  }
);

/* =========================================================
   TICKET AUTO CLOSE
========================================================= */

setInterval(
  async () => {
    const now = Date.now();

    for (
      const [channelId, ticket]
      of Object.entries(db.tickets)
    ) {
      if (ticket.closed) continue;

      if (
        now - ticket.lastMessage >=
        60 * 60 * 1000
      ) {
        ticket.closed = true;

        const channel =
          client.channels.cache.get(
            channelId
          );

        if (channel) {
          await channel.delete()
            .catch(() => {});
        }
      }
    }

    saveData();
  },
  60 * 1000
);

/* =========================================================
   TICKET MESSAGE TRACKER
========================================================= */

client.on(
  "messageCreate",
  message => {
    if (!message.guild) return;

    const ticket =
      db.tickets[
        message.channel.id
      ];

    if (!ticket || ticket.closed) {
      return;
    }

    ticket.lastMessage =
      Date.now();

    saveData();
  }
);

/* =========================================================
   ERROR HANDLING
========================================================= */

process.on(
  "unhandledRejection",
  err => {
    console.error(
      "UNHANDLED REJECTION:",
      err
    );
  }
);

process.on(
  "uncaughtException",
  err => {
    console.error(
      "UNCAUGHT EXCEPTION:",
      err
    );
  }
);

/* =========================================================
   LOGIN
========================================================= */

client.login(TOKEN)
  .then(() => {
    console.log(
      "🔵 Discord giriş işlemi başlatıldı."
    );
  })
  .catch(err => {
    console.error(
      "❌ Discord giriş hatası:",
      err
    );

    process.exit(1);
  });
