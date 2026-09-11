require("dotenv").config();

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

const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

const TOKEN = process.env.TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!TOKEN) {
  throw new Error("TOKEN Railway Variables içine eklenmemiş.");
}

const ai = OPENAI_API_KEY
  ? new OpenAI({ apiKey: OPENAI_API_KEY })
  : null;

/* =========================================================
   AXERA LEAGUE IDLER
========================================================= */

const IDS = {
  roles: {
    yonetici: "1534455282426445897",
    kayitYetkilisi: "1534456315366342716",
    deger: "1534456192913375382",
    kayitsiz: "1534457560134844517",
    futbolcu: "1534457228986421278",
    td: "1534456648930693120",
    uye: "1534457460163608636",
    kaleci: process.env.KALECI_ROLE_ID || null,
    moderator: "1534456108415189063",
    spiker: "1535251168169697390",

    medya: "1547393966553440346",
    partner: "1547393545827123230",
    macPing: "1547393416755941509",
    duyuru: "1547393331297001522",
    cekilis: "1545116885589430312"
  },

  channels: {
    kayit: "1547371464515133470",
    sohbet: "1547374641763455009",
    ant: "1547375589923618957",
    pen: "1547375997698052166",
    tweet: "1547377797193011340",
    mac: "1547376935410073692",
    puan: "1547382143775285431",
    deger: "1547376344927834122",
    durum: "1547388197796057118",
    ai: "1547375186754408539"
  },

  teams: {
    Barcelona: "1534480715779936297",
    "Real Madrid": "1534480984064528655",
    Galatasaray: "1534481073629691995",
    "Fenerbahçe": "1534481156840620183",
    Beşiktaş: "1534481259739348992",
    "Manchester United": "1534481426463068180"
  }
};

/* =========================================================
   VERİTABANI
========================================================= */

const DATA_FILE = path.join(__dirname, "data.json");

const DEFAULT = {
  users: {},
  teams: {},
  standings: {},
  fixtures: [],
  nextFixtureId: 1,
  activeMatches: {},
  registrationPanels: {},
  tickets: {},
  formations: {},
  training: {},
  tweetCooldowns: {},
  matchRewards: {},
  stats: {},
  matchHistory: {},
  rolePanel: null
};

function loadData() {
  try {
    const x = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );

    return Object.assign({}, DEFAULT, x);
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT));
  }
}

let db = loadData();

function saveData() {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(db, null, 2)
  );
}

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
   YARDIMCI FONKSİYONLAR
========================================================= */

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

function money(n) {
  return `${Math.max(0, Math.round(Number(n) || 0))}M€`;
}

function embed(title, description, color) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color || 0x2b2d31)
    .setTimestamp();
}

function hasRole(member, roleId) {
  if (!member || !roleId) return false;
  return member.roles.cache.has(roleId);
}

function isAdmin(member) {
  return Boolean(
    member &&
    (
      member.permissions.has(PermissionFlagsBits.Administrator) ||
      hasRole(member, IDS.roles.yonetici)
    )
  );
}

function isValueStaff(member) {
  return Boolean(
    member &&
    (
      isAdmin(member) ||
      hasRole(member, IDS.roles.deger)
    )
  );
}

function isSpiker(member) {
  return Boolean(
    member &&
    (
      isAdmin(member) ||
      hasRole(member, IDS.roles.spiker)
    )
  );
}

function isModerator(member) {
  return Boolean(
    member &&
    (
      isAdmin(member) ||
      hasRole(member, IDS.roles.moderator)
    )
  );
}

function isRegistrationStaff(member) {
  return Boolean(
    member &&
    (
      isAdmin(member) ||
      hasRole(member, IDS.roles.kayitYetkilisi)
    )
  );
}

function safeReply(message, content) {
  return message.reply({
    content,
    allowedMentions: {
      repliedUser: false
    }
  });
}

function normalize(text) {
  return String(text || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .trim();
}

function parseAmount(raw) {
  const s = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/€/g, "");

  if (!/^\d+(?:\.\d+)?M?$/.test(s)) {
    return null;
  }

  const n = Number(
    s.replace(/M$/, "")
  );

  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }

  return n;
}

function getUser(member) {
  if (!db.users[member.id]) {
    db.users[member.id] = {
      name: member.nickname || member.displayName || member.user.username,
      value: 0,
      budget: 0,
      team: null
    };
  }

  return db.users[member.id];
}

function getPlayerName(member) {
  const user = db.users[member.id];

  return (
    user?.name ||
    member.nickname ||
    member.displayName ||
    member.user.username
  );
}

function getPlayerValue(member) {
  const user = getUser(member);

  let value = Number(user.value) || 0;

  if (value <= 0) {
    const nickname =
      member.nickname ||
      member.displayName ||
      "";

    const match = nickname.match(/(\d+(?:\.\d+)?)M€\s*$/i);

    if (match) {
      value = Number(match[1]) || 0;
    }
  }

  return Math.max(0, value);
}

/* =========================================================
   DEĞER SİSTEMİ
========================================================= */

async function changePlayerValue(member, delta, reason = "") {
  const user = getUser(member);

  const oldValue = getPlayerValue(member);

  let newValue = oldValue + Number(delta || 0);

  if (!Number.isFinite(newValue)) {
    newValue = oldValue;
  }

  newValue = Math.max(0, Math.min(1000, newValue));

  user.value = newValue;

  let nickname =
    member.nickname ||
    member.displayName ||
    member.user.username;

  if (/(\d+(?:\.\d+)?)M€\s*$/i.test(nickname)) {
    nickname = nickname.replace(
      /(\d+(?:\.\d+)?)M€\s*$/i,
      `${newValue}M€`
    );
  } else {
    nickname = `${nickname} | ${newValue}M€`;
  }

  if (nickname.length > 32) {
    nickname = nickname.slice(0, 32);
  }

  await member
    .setNickname(nickname)
    .catch(() => {});

  user.lastValueReason = reason;
  user.lastValueChange = Date.now();

  saveData();

  return {
    oldValue,
    newValue
  };
}

/* =========================================================
   TAKIM FONKSİYONLARI
========================================================= */

function getTeamNameByRole(member) {
  for (const [teamName, roleId] of Object.entries(IDS.teams)) {
    if (member.roles.cache.has(roleId)) {
      return teamName;
    }
  }

  return null;
}

function getUserTeams(guild, member) {
  return Object.entries(IDS.teams)
    .filter(([name, roleId]) =>
      member.roles.cache.has(roleId)
    )
    .map(([name]) => name);
}

function getTeamPlayers(guild, teamName) {
  const roleId = IDS.teams[teamName];

  if (!roleId) return [];

  const role = guild.roles.cache.get(roleId);

  if (!role) return [];

  return [...role.members.values()];
}

function getTeamData(teamName) {
  if (!db.teams[teamName]) {
    db.teams[teamName] = {
      value: 0,
      players: {},
      ilk11: {
        formation: "4-2-3-1",
        GK: null,
        LB: null,
        CB1: null,
        CB2: null,
        RB: null,
        CM1: null,
        CM2: null,
        LW: null,
        CAM: null,
        RW: null,
        ST: null
      }
    };
  }

  return db.teams[teamName];
}

/* =========================================================
   İLK 11
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

const POSITION_NAMES = {
  GK: "🧤 Kaleci",
  LB: "◀️ Sol Bek",
  CB1: "🛡️ Stoper 1",
  CB2: "🛡️ Stoper 2",
  RB: "▶️ Sağ Bek",
  CM1: "⚙️ Orta Saha 1",
  CM2: "⚙️ Orta Saha 2",
  LW: "⬅️ Sol Kanat",
  CAM: "🎯 10 Numara",
  RW: "➡️ Sağ Kanat",
  ST: "⚽ Forvet"
};

async function openFirst11(message, teamName) {
  const players = getTeamPlayers(
    message.guild,
    teamName
  );

  if (!players.length) {
    return safeReply(
      message,
      `❌ **${teamName}** takımında takım rolüne sahip oyuncu bulunamadı.`
    );
  }

  const data = getTeamData(teamName);

  const buttons = Object.keys(POSITION_NAMES)
    .map(pos =>
      new ButtonBuilder()
        .setCustomId(`ilk11pos_${teamName}_${pos}`)
        .setLabel(POSITION_NAMES[pos].replace(/[^\p{L}\p{N} ]/gu, "").trim())
        .setStyle(ButtonStyle.Secondary)
    );

  const rows = [];

  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(
      new ActionRowBuilder()
        .addComponents(buttons.slice(i, i + 5))
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ilk11clear_${teamName}`)
        .setLabel("İlk 11'i Temizle")
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId(`ilk11save_${teamName}`)
        .setLabel("Kaydet")
        .setStyle(ButtonStyle.Success)
    )
  );

  return message.reply({
    embeds: [
      embed(
        `⚽ ${teamName} İlk 11`,
        `Formasyon: **${data.ilk11.formation}**\n\n` +
        Object.entries(POSITION_NAMES)
          .map(([pos, name]) => {
            const id = data.ilk11[pos];

            return `${name}: ${
              id
                ? `<@${id}>`
                : "Boş"
            }`;
          })
          .join("\n"),
        0x3498db
      )
    ],
    components: rows
  });
}

/* =========================================================
   KAYIT SİSTEMİ
========================================================= */

async function createRegistrationPanel(
  message,
  target,
  nickname
) {
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`register_player`)
        .setLabel("⚽ Futbolcu")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`register_member`)
        .setLabel("👤 Üye")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(`register_td`)
        .setLabel("🧑‍💼 Teknik Direktör")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`register_gk`)
        .setLabel("🧤 Kaleci")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`register_cancel`)
        .setLabel("❌ İptal Et")
        .setStyle(ButtonStyle.Danger)
    );

  const sent = await message.reply({
    embeds: [
      embed(
        "📋 Axera League Kayıt",
        `👤 Oyuncu: ${target}\n\n` +
        `📝 İsim: **${nickname}**\n\n` +
        `Aşağıdaki butonlardan oyuncunun rolünü seçin.`,
        0x3498db
      )
    ],
    components: [row]
  });

  db.registrationPanels[sent.id] = {
    userId: target.id,
    nickname
  };

  saveData();

  return sent;
}

async function completeRegistration(
  interaction,
  type
) {
  const panel =
    db.registrationPanels[interaction.message.id];

  if (!panel) {
    return interaction.reply({
      content: "❌ Bu kayıt panelinin süresi dolmuş.",
      ephemeral: true
    });
  }

  const target =
    interaction.guild.members.cache.get(panel.userId);

  if (!target) {
    return interaction.reply({
      content: "❌ Oyuncu bulunamadı.",
      ephemeral: true
    });
  }

  let roleId = null;

  if (type === "player") {
    roleId = IDS.roles.futbolcu;
  }

  if (type === "member") {
    roleId = IDS.roles.uye;
  }

  if (type === "td") {
    roleId = IDS.roles.td;
  }

  if (type === "gk") {
    roleId = IDS.roles.kaleci;
  }

  if (!roleId) {
    return interaction.reply({
      content:
        "❌ Bu rol için `KALECI_ROLE_ID` ayarlanmamış olabilir.",
      ephemeral: true
    });
  }

  const removeRoles = [
    IDS.roles.kayitsiz,
    IDS.roles.futbolcu,
    IDS.roles.uye,
    IDS.roles.td,
    IDS.roles.kaleci
  ].filter(Boolean);

  await target.roles.remove(removeRoles).catch(() => {});
  await target.roles.add(roleId).catch(() => {});

  let newNickname = panel.nickname;

  if (newNickname.length > 32) {
    newNickname = newNickname.slice(0, 32);
  }

  await target
    .setNickname(newNickname)
    .catch(() => {});

  const user = getUser(target);

  user.name = panel.nickname;

  delete db.registrationPanels[interaction.message.id];

  saveData();

  await interaction.update({
    embeds: [
      embed(
        "✅ Kayıt Tamamlandı",
        `${target} başarıyla kayıt edildi.\n\n` +
        `👤 İsim: **${panel.nickname}**`,
        0x2ecc71
      )
    ],
    components: []
  });
}

/* =========================================================
   ANTRENMAN
========================================================= */

async function trainingCommand(message) {
  if (
    message.channel.id !== IDS.channels.ant
  ) {
    return safeReply(
      message,
      "❌ Bu komut sadece antrenman kanalında kullanılabilir."
    );
  }

  const user = getUser(message.member);

  if (!db.training[message.author.id]) {
    db.training[message.author.id] = 0;
  }

  db.training[message.author.id]++;

  const count = db.training[message.author.id];

  if (count >= 5) {
    db.training[message.author.id] = 0;

    const result = await changePlayerValue(
      message.member,
      5,
      "Antrenman ödülü"
    );

    saveData();

    return safeReply(
      message,
      `🏋️ **Antrenman 5/5 tamamlandı!**\n\n` +
      `💰 Otomatik ödül: **+5M€**\n` +
      `📈 Değer: **${result.oldValue}M€ → ${result.newValue}M€**`
    );
  }

  user.training = count;

  saveData();

  return safeReply(
    message,
    `🏋️ Antrenman tamamlandı: **${count}/5**\n` +
    `Bir sonraki antrenmanda ilerleme devam eder.`
  );
}

/* =========================================================
   PENALTI
========================================================= */

async function penaltyCommand(message) {
  if (
    message.channel.id !== IDS.channels.pen
  ) {
    return safeReply(
      message,
      "❌ Bu komut sadece penaltı kanalında kullanılabilir."
    );
  }

  const random = Math.random();

  let result;

  if (random < 0.50) {
    result = "⚽ GOL!";
  } else if (random < 0.75) {
    result = "🥅 DİREK!";
  } else {
    result = "🧤 KALECİ KURTARDI!";
  }

  if (result.startsWith("⚽")) {
    const value = await changePlayerValue(
      message.member,
      5,
      "Penaltı gol ödülü"
    );

    return safeReply(
      message,
      `🧤 **Axera Kalecisi**\n\n` +
      `${result}\n\n` +
      `💰 Ödül: **+5M€**\n` +
      `📈 Değer: **${value.oldValue}M€ → ${value.newValue}M€**`
    );
  }

  return safeReply(
    message,
    `🧤 **Axera Kalecisi**\n\n${result}`
  );
}

/* =========================================================
   OYUNCU ARAMA
========================================================= */

async function searchPlayer(message, query) {
  if (!query) {
    return safeReply(
      message,
      "❌ Kullanım: `.ara oyuncuadı`"
    );
  }

  const members =
    await message.guild.members.fetch();

  const players = [
    ...members.values()
  ].filter(member => {
    if (member.user.bot) return false;

    if (
      hasRole(
        member,
        IDS.roles.kayitsiz
      )
    ) {
      return false;
    }

    return true;
  });

  const q = normalize(query);

  const exact = players.filter(member =>
    normalize(getPlayerName(member)) === q
  );

  const close = players.filter(member =>
    normalize(getPlayerName(member)).includes(q)
  );

  const results =
    exact.length
      ? exact
      : close;

  if (!results.length) {
    return safeReply(
      message,
      "❌ Oyuncu bulunamadı."
    );
  }

  const text = results
    .slice(0, 15)
    .map(member => {
      const user = getUser(member);

      return (
        `👤 **${getPlayerName(member)}**\n` +
        `💰 Değer: **${money(getPlayerValue(member))}**\n` +
        `💳 Bütçe: **${money(user.budget)}**\n` +
        `🆔 ${member.id}`
      );
    })
    .join("\n\n");

  return message.reply({
    embeds: [
      embed(
        "🔎 Oyuncu Arama",
        text,
        0x3498db
      )
    ]
  });
}

/* =========================================================
   KİŞİSEL BÜTÇE
========================================================= */

function getBudget(member) {
  return Number(
    getUser(member).budget
  ) || 0;
}

async function addBudget(target, amount) {
  const user = getUser(target);

  user.budget =
    Math.max(0, getBudget(target) + amount);

  saveData();

  return user.budget;
}

/* =========================================================
   TAKIM KADROSU
========================================================= */

async function squadAdd(
  message,
  teamName,
  player,
  position
) {
  const team = getTeamData(teamName);

  team.players[player.id] = {
    id: player.id,
    name: getPlayerName(player),
    position: position || "Oyuncu"
  };

  saveData();

  return safeReply(
    message,
    `✅ ${player} **${teamName}** kadrosuna eklendi.\n` +
    `📍 Pozisyon: **${position || "Oyuncu"}**`
  );
}

async function showSquad(message, teamName) {
  const team = getTeamData(teamName);

  const players =
    Object.values(team.players);

  if (!players.length) {
    return safeReply(
      message,
      `❌ **${teamName}** kadrosu boş.`
    );
  }

  const text = players
    .map(
      p =>
        `⚽ <@${p.id}> — **${p.position}**`
    )
    .join("\n");

  return message.reply({
    embeds: [
      embed(
        `📋 ${teamName} Kadrosu`,
        text,
        0x3498db
      )
    ]
  });
}

/* =========================================================
   FORMASYON
========================================================= */

async function formationPanel(message, teamName) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`formation_${teamName}`)
    .setPlaceholder("Formasyon seç")
    .addOptions(
      FORMATIONS.map(f => ({
        label: f,
        value: f
      }))
    );

  return message.reply({
    embeds: [
      embed(
        "📐 Formasyon",
        `Takım: **${teamName}**\n\nFormasyon seçiniz.`,
        0x9b59b6
      )
    ],
    components: [
      new ActionRowBuilder()
        .addComponents(menu)
    ]
  });
}

/* =========================================================
   PUAN SİSTEMİ
========================================================= */

function getStanding(teamName) {
  if (!db.standings[teamName]) {
    db.standings[teamName] = {
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0
    };
  }

  return db.standings[teamName];
}

function updateStanding(
  team1,
  team2,
  score1,
  score2
) {
  const a = getStanding(team1);
  const b = getStanding(team2);

  a.played++;
  b.played++;

  a.goalsFor += score1;
  a.goalsAgainst += score2;

  b.goalsFor += score2;
  b.goalsAgainst += score1;

  if (score1 > score2) {
    a.wins++;
    b.losses++;
    a.points += 3;
  } else if (score2 > score1) {
    b.wins++;
    a.losses++;
    b.points += 3;
  } else {
    a.draws++;
    b.draws++;
    a.points++;
    b.points++;
  }

  saveData();
}

async function showStandings(message) {
  const teams =
    Object.keys(IDS.teams);

  const sorted = teams
    .map(name => ({
      name,
      ...getStanding(name)
    }))
    .sort((a, b) => {
      const gdA =
        a.goalsFor -
        a.goalsAgainst;

      const gdB =
        b.goalsFor -
        b.goalsAgainst;

      return (
        b.points - a.points ||
        gdB - gdA ||
        b.goalsFor - a.goalsFor
      );
    });

  const text = sorted
    .map((x, i) => {
      const gd =
        x.goalsFor -
        x.goalsAgainst;

      return (
        `**${i + 1}. ${x.name}**\n` +
        `Puan: **${x.points}** | ` +
        `O: ${x.played} | ` +
        `G: ${x.wins} | ` +
        `B: ${x.draws} | ` +
        `M: ${x.losses} | ` +
        `AV: ${gd}`
      );
    })
    .join("\n\n");

  return message.reply({
    embeds: [
      embed(
        "🏆 Axera League Puan Durumu",
        text,
        0xf1c40f
      )
    ]
  });
}

/* =========================================================
   MAÇ SİSTEMİ
========================================================= */

function getMatchPlayers(guild, teamName) {
  const team = getTeamData(teamName);

  const first11 =
    Object.values(team.ilk11 || {})
      .filter(x => x && x !== team.ilk11.formation);

  const result = [];

  for (const id of first11) {
    const member =
      guild.members.cache.get(id);

    if (
      member &&
      !result.some(x => x.id === member.id)
    ) {
      result.push(member);
    }
  }

  if (result.length >= 11) {
    return result.slice(0, 11);
  }

  const rolePlayers =
    getTeamPlayers(guild, teamName);

  for (const member of rolePlayers) {
    if (
      !result.some(x => x.id === member.id)
    ) {
      result.push(member);
    }
  }

  return result.slice(0, 11);
}

function randomPlayer(players) {
  if (!players.length) {
    return null;
  }

  return players[
    Math.floor(Math.random() * players.length)
  ];
}

async function startMatch(
  guild,
  team1,
  team2
) {
  const channel =
    guild.channels.cache.get(
      IDS.channels.mac
    );

  if (!channel) return;

  const key =
    `${team1}_${team2}_${Date.now()}`;

  const players1 =
    getMatchPlayers(guild, team1);

  const players2 =
    getMatchPlayers(guild, team2);

  const match = {
    id: key,
    team1,
    team2,
    score1: 0,
    score2: 0,
    minute: 0,
    players1: players1.map(x => x.id),
    players2: players2.map(x => x.id),
    scorers: [],
    assists: [],
    startedAt: Date.now()
  };

  db.activeMatches[key] = match;
  saveData();

  const msg = await channel.send({
    embeds: [
      embed(
        `⚽ ${team1} vs ${team2}`,
        `⏱️ Dakika: **0'**\n\n` +
        `🔵 **${team1}: 0**\n` +
        `🔴 **${team2}: 0**`,
        0x3498db
      )
    ]
  });

  let minute = 0;

  const interval =
    setInterval(async () => {
      try {
        minute++;

        match.minute = minute;

        const p1 =
          players1.length
            ? randomPlayer(players1)
            : null;

        const p2 =
          players2.length
            ? randomPlayer(players2)
            : null;

        let commentary =
          "Orta saha mücadelesi devam ediyor.";

        if (Math.random() < 0.25) {
          const attackingTeam =
            Math.random() < 0.5
              ? team1
              : team2;

          const attacker =
            attackingTeam === team1
              ? p1
              : p2;

          if (attacker) {
            commentary =
              `⚡ **${getPlayerName(attacker)}** hücuma çıktı!`;
          }
        }

        if (Math.random() < 0.08) {
          const attackingTeam =
            Math.random() < 0.5
              ? team1
              : team2;

          const scorer =
            attackingTeam === team1
              ? p1
              : p2;

          if (scorer) {
            if (attackingTeam === team1) {
              match.score1++;
            } else {
              match.score2++;
            }

            match.scorers.push({
              playerId: scorer.id,
              team: attackingTeam,
              minute
            });

            await changePlayerValue(
              scorer,
              2,
              "Maç golü"
            );

            commentary =
              `⚽ **GOL!** ${getPlayerName(scorer)} fileleri havalandırdı!`;
          }
        }

        await msg.edit({
          embeds: [
            embed(
              `⚽ ${team1} vs ${team2}`,
              `⏱️ Dakika: **${minute}'**\n\n` +
              `🔵 **${team1}: ${match.score1}**\n` +
              `🔴 **${team2}: ${match.score2}**\n\n` +
              `🎙️ ${commentary}`,
              0x3498db
            )
          ]
        });

        if (minute >= 90) {
          clearInterval(interval);

          await finishMatch(
            guild,
            match,
            players1,
            players2,
            msg
          );
        }
      } catch (err) {
        console.error("Maç hatası:", err);
        clearInterval(interval);
      }
    }, 3000);
}

async function finishMatch(
  guild,
  match,
  players1,
  players2,
  msg
) {
  updateStanding(
    match.team1,
    match.team2,
    match.score1,
    match.score2
  );

  const allPlayers = [
    ...players1,
    ...players2
  ];

  const rewarded = new Set();

  for (const player of allPlayers) {
    if (rewarded.has(player.id)) continue;

    rewarded.add(player.id);

    await changePlayerValue(
      player,
      5,
      "Maç katılım ödülü"
    );
  }

  delete db.activeMatches[match.id];

  db.matchHistory[match.id] = {
    team1: match.team1,
    team2: match.team2,
    score1: match.score1,
    score2: match.score2,
    finishedAt: Date.now()
  };

  saveData();

  await msg.edit({
    embeds: [
      embed(
        `🏁 MAÇ BİTTİ`,
        `🔵 **${match.team1}: ${match.score1}**\n` +
        `🔴 **${match.team2}: ${match.score2}**\n\n` +
        `🎁 Maça katılan oyunculara **+5M€** verildi.\n\n` +
        `🏆 Puan durumu güncellendi.`,
        0x2ecc71
      )
    ]
  });

  const standingsChannel =
    guild.channels.cache.get(
      IDS.channels.puan
    );

  if (standingsChannel) {
    await standingsChannel.send({
      embeds: [
        embed(
          "🏆 Puan Durumu Güncellendi",
          `**${match.team1} ${match.score1} - ${match.score2} ${match.team2}**\n\n` +
          `\`.puan\` komutu ile güncel sıralamayı görebilirsiniz.`,
          0xf1c40f
        )
      ]
    });
  }
}

/* =========================================================
   FİKSTÜR
========================================================= */

function parseFixtureDate(dateText, timeText) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);

  const time =
    /^(\d{2}):(\d{2})$/.exec(timeText);

  if (!match || !time) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(time[1]);
  const minute = Number(time[2]);

  const date =
    new Date(
      year,
      month - 1,
      day,
      hour,
      minute,
      0
    );

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date.getTime();
}

async function startDueFixtures() {
  for (const fixture of db.fixtures) {
    if (
      !fixture.played &&
      !fixture.started &&
      Date.now() >= fixture.timestamp
    ) {
      fixture.started = true;
      saveData();

      const guild =
        client.guilds.cache.get(
          fixture.guildId
        );

      if (guild) {
        await startMatch(
          guild,
          fixture.team1,
          fixture.team2
        );
      }
    }
  }
}

/* =========================================================
   TWEET
========================================================= */

async function tweetCommand(message, text) {
  if (
    message.channel.id !==
    IDS.channels.tweet
  ) {
    return safeReply(
      message,
      "❌ Bu komut sadece tweet kanalında kullanılabilir."
    );
  }

  if (!text) {
    return safeReply(
      message,
      "❌ Kullanım: `.tweet mesaj`"
    );
  }

  const last =
    db.tweetCooldowns[message.author.id] || 0;

  if (
    Date.now() - last <
    24 * 60 * 60 * 1000
  ) {
    return safeReply(
      message,
      "⏳ 24 saat içinde yalnızca 1 kez tweet ödülü alabilirsin."
    );
  }

  db.tweetCooldowns[message.author.id] =
    Date.now();

  saveData();

  await message.delete().catch(() => {});

  const value =
    await changePlayerValue(
      message.member,
      5,
      "Tweet ödülü"
    );

  return message.channel.send({
    embeds: [
      embed(
        "🐦 AXERA TWEET",
        `**${text}**\n\n` +
        `👤 ${message.member}\n` +
        `💰 Tweet ödülü: **+5M€**\n` +
        `📈 Değer: **${value.oldValue}M€ → ${value.newValue}M€**`,
        0x1da1f2
      )
    ]
  });
}

/* =========================================================
   ROL PANELİ
========================================================= */

async function createRolePanel(message) {
  const row1 =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId("role_partner")
          .setLabel("Partner Ping")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("role_mac")
          .setLabel("Maç Ping")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("role_duyuru")
          .setLabel("Duyuru Ping")
          .setStyle(ButtonStyle.Secondary)
      );

  const row2 =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId("role_cekilis")
          .setLabel("Çekiliş Ping")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("role_medya")
          .setLabel("Medya Ping")
          .setStyle(ButtonStyle.Secondary)
      );

  return message.channel.send({
    embeds: [
      embed(
        "🔔 Axera League Bildirim Rolleri",
        "İstediğin bildirim rollerini aşağıdaki butonlardan açıp kapatabilirsin.",
        0x5865f2
      )
    ],
    components: [row1, row2]
  });
}

/* =========================================================
   TICKET
========================================================= */

async function createTicketPanel(message) {
  const row =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId("ticket_create")
          .setLabel("🎫 Destek Talebi Oluştur")
          .setStyle(ButtonStyle.Primary)
      );

  return message.channel.send({
    embeds: [
      embed(
        "🎫 Axera League Destek",
        "Destek almak için aşağıdaki butona basabilirsiniz.",
        0x3498db
      )
    ],
    components: [row]
  });
}

async function createTicket(interaction) {
  const guild =
    interaction.guild;

  const existing =
    Object.entries(db.tickets)
      .find(
        ([, ticket]) =>
          ticket.open &&
          ticket.userId === interaction.user.id
      );

  if (existing) {
    return interaction.reply({
      content:
        `❌ Zaten açık bir ticketın var: <#${existing[0]}>`,
      ephemeral: true
    });
  }

  const channel =
    await guild.channels.create({
      name: `ticket-${interaction.user.username}`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .slice(0, 80),

      type: ChannelType.GuildText,

      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [
            PermissionFlagsBits.ViewChannel
          ]
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        },
        {
          id: IDS.roles.moderator,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        }
      ]
    });

  db.tickets[channel.id] = {
    userId: interaction.user.id,
    open: true,
    lastMessage: Date.now()
  };

  saveData();

  const row =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId("ticket_close")
          .setLabel("🔒 Bileti Kapat")
          .setStyle(ButtonStyle.Danger)
      );

  await channel.send({
    content: `${interaction.user}`,
    embeds: [
      embed(
        "🎫 Destek Talebi",
        "Yetkililer kısa süre içerisinde ilgilenecektir.",
        0x3498db
      )
    ],
    components: [row]
  });

  return interaction.reply({
    content:
      `✅ Ticket oluşturuldu: ${channel}`,
    ephemeral: true
  });
}

/* =========================================================
   DURUM MESAJI
========================================================= */

let lastStatusKey = "";

async function statusPost() {
  const channel =
    client.channels.cache.get(
      IDS.channels.durum
    );

  if (!channel) return;

  const messages =
    await channel.messages
      .fetch({ limit: 100 })
      .catch(() => null);

  if (messages) {
    for (const msg of messages.values()) {
      if (
        client.user &&
        msg.author.id === client.user.id
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

  const totalUsers =
    client.guilds.cache.reduce(
      (sum, guild) =>
        sum + (guild.memberCount || 0),
      0
    );

  await channel.send({
    embeds: [
      embed(
        "🟢 Axera League Bot Durumu",
        `**Tüm sistemler sorunsuz çalışıyor.**\n\n` +
        `🟢 Durum: **Online**\n` +
        `📡 Ping: **${client.ws.ping}ms**\n` +
        `🏠 Sunucu: **${client.guilds.cache.size}**\n` +
        `👥 Kullanıcı: **${totalUsers}**\n` +
        `⏱️ Uptime: **${uptimeHours} saat**\n` +
        `🕐 ${new Date().toLocaleString("tr-TR")}`,
        0x2ecc71
      )
    ]
  });
}

/* =========================================================
   YAPAY ZEKA
========================================================= */

async function aiReply(message, text) {
  if (!ai) {
    return safeReply(
      message,
      "❌ Yapay zeka şu anda aktif değil. `OPENAI_API_KEY` eksik."
    );
  }

  const lower =
    normalize(text);

  if (
    lower.includes("seni kim kurdu") ||
    lower.includes("kim kurdu")
  ) {
    return safeReply(
      message,
      "Lynox9380 kurdu."
    );
  }

  if (
    lower.includes("yapayzeka altyapisi") ||
    lower.includes("yapay zeka altyapisi")
  ) {
    return safeReply(
      message,
      "Axera League"
    );
  }

  try {
    const response =
      await ai.responses.create({
        model: "gpt-5.6-luna",

        instructions:
          "Sen Axera adlı Türkçe konuşan Discord yapay zekâ asistanısın. " +
          "Kısa, hızlı, doğal ve yardımcı cevaplar ver. " +
          "Sunucu yönetimi gibi işlemleri kendin gerçekleştirme; " +
          "bunlar Discord komutlarıyla yapılır.",

        input: text,

        max_output_tokens: 300
      });

    const output =
      response.output_text?.trim();

    if (!output) {
      return safeReply(
        message,
        "❌ Şu anda cevap oluşturamadım."
      );
    }

    return safeReply(
      message,
      output.slice(0, 1900)
    );
  } catch (err) {
    console.error("AI ERROR:", err);

    return safeReply(
      message,
      "❌ Yapay zeka yanıt verirken bir hata oluştu."
    );
  }
}

/* =========================================================
   KOMUTLAR
========================================================= */

client.on(
  "messageCreate",
  async message => {
    try {
      if (message.author.bot) return;

      /* AI KANALI */
      if (
        message.channel.id === IDS.channels.ai &&
        !message.content.startsWith(".")
      ) {
        return aiReply(
          message,
          message.content
        );
      }

      /* TICKET MESAJ TAKİBİ */
      const ticket =
        db.tickets[message.channel.id];

      if (ticket && ticket.open) {
        ticket.lastMessage = Date.now();
        saveData();
      }

      if (!message.content.startsWith(".")) {
        return;
      }

      const raw =
        message.content
          .slice(1)
          .trim();

      if (!raw) return;

      const parts =
        raw.split(/\s+/);

      const command =
        normalize(parts.shift());

      const args = parts;

      /* =====================================================
         YARDIM
      ===================================================== */

      if (
        command === "yardim" ||
        command === "help"
      ) {
        return message.reply({
          embeds: [
            embed(
              "⚽ AXERA LEAGUE KOMUTLARI",
              [
                "**👤 Kayıt**",
                "`.k @Oyuncu İsim`",
                "`.kayıtsızver @Oyuncu`",
                "`.ara Oyuncu`",
                "",
                "**💰 Değer**",
                "`.dver @Oyuncu 5M`",
                "`.dsil @Oyuncu 5M`",
                "",
                "**🏋️ Sistemler**",
                "`.ant`",
                "`.pen`",
                "`.tweet mesaj`",
                "",
                "**⚽ Takım**",
                "`.takımekle @Takım`",
                "`.takımkaldır @Takım`",
                "`.kadroekle @Takım @Oyuncu Pozisyon`",
                "`.kadrocikar @Takım @Oyuncu`",
                "`.kadro @Takım`",
                "`.ilk11 @Takım`",
                "`.formasyon @Takım`",
                "",
                "**🏆 Lig**",
                "`.maç @Takım1 @Takım2`",
                "`.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`",
                "`.fikstür`",
                "`.fiksturcikar @Takım1 @Takım2`",
                "`.puan`",
                "",
                "**💳 Bütçe**",
                "`.bütçeekle @Oyuncu 50M`",
                "`.bütçesil @Oyuncu 50M`",
                "`.gönder @Oyuncu 10M`",
                "",
                "**🎫 Yönetim**",
                "`.ticketpanel`",
                "`.rolpanel`",
                "`.sil 10`",
                "`.embed Başlık | Açıklama`",
                "`.kick @Oyuncu`",
                "`.ban @Oyuncu`",
                "`.mute @Oyuncu`",
                "`.unmute @Oyuncu`",
                "`.dm @Oyuncu mesaj`",
                "",
                "**🤖 AI**",
                "AI kanalında normal mesaj yazabilirsiniz.",
                "`.ai soru`"
              ].join("\n"),
              0x5865f2
            )
          ]
        });
      }

      /* =====================================================
         AI KOMUTU
      ===================================================== */

      if (
        command === "ai" ||
        command === "yapayzeka" ||
        command === "yapayzekâ"
      ) {
        return aiReply(
          message,
          args.join(" ")
        );
      }

      /* =====================================================
         KAYIT
      ===================================================== */

      if (command === "k") {
        if (!isRegistrationStaff(message.member)) {
          return safeReply(
            message,
            "❌ Kayıt Yetkilisi yetkin yok."
          );
        }

        if (
          message.channel.id !==
          IDS.channels.kayit
        ) {
          return safeReply(
            message,
            "❌ Bu komut sadece kayıt kanalında kullanılabilir."
          );
        }

        const target =
          message.mentions.members.first();

        const nickname =
          args
            .filter(
              x =>
                !x.startsWith("<@")
            )
            .join(" ")
            .trim();

        if (!target || !nickname) {
          return safeReply(
            message,
            "❌ Kullanım: `.k @Oyuncu İsim`"
          );
        }

        return createRegistrationPanel(
          message,
          target,
          nickname
        );
      }

      if (
        command === "kayıtsızver" ||
        command === "kayitsizver"
      ) {
        if (!isRegistrationStaff(message.member)) {
          return safeReply(
            message,
            "❌ Kayıt Yetkilisi yetkin yok."
          );
        }

        const target =
          message.mentions.members.first();

        if (!target) {
          return safeReply(
            message,
            "❌ Kullanım: `.kayıtsızver @Oyuncu`"
          );
        }

        const rolesToRemove = [
          IDS.roles.futbolcu,
          IDS.roles.uye,
          IDS.roles.td,
          IDS.roles.kaleci
        ].filter(Boolean);

        await target.roles
          .remove(rolesToRemove)
          .catch(() => {});

        await target.roles
          .add(IDS.roles.kayitsiz)
          .catch(() => {});

        return safeReply(
          message,
          `✅ ${target} artık **Kayıtsız**.`
        );
      }

      /* =====================================================
         DEĞER
      ===================================================== */

      if (
        command === "dver" ||
        command === "dsil"
      ) {
        if (!isValueStaff(message.member)) {
          return safeReply(
            message,
            "❌ Değer Yetkilisi yetkin yok."
          );
        }

        if (
          message.channel.id !==
          IDS.channels.deger
        ) {
          return safeReply(
            message,
            "❌ Bu komut sadece değer kanalında kullanılabilir."
          );
        }

        const target =
          message.mentions.members.first();

        if (!target) {
          return safeReply(
            message,
            `Kullanım: \`.${command} @Oyuncu 5M\``
          );
        }

        const amountText =
          args.find(x =>
            /^[0-9]+(?:\.[0-9]+)?M?€?$/i.test(x)
          );

        const amount =
          parseAmount(amountText);

        if (!amount) {
          return safeReply(
            message,
            "❌ Geçerli bir değer gir. Örnek: `5`, `5M` veya `5M€`"
          );
        }

        const delta =
          command === "dver"
            ? amount
            : -amount;

        const result =
          await changePlayerValue(
            target,
            delta,
            command === "dver"
              ? "Değer ekleme"
              : "Değer çıkarma"
          );

        return safeReply(
          message,
          command === "dver"
            ? `✅ ${target} değerine **+${amount}M€** eklendi.\n💰 **${result.oldValue}M€ → ${result.newValue}M€**`
            : `✅ ${target} değerinden **-${amount}M€** çıkarıldı.\n💰 **${result.oldValue}M€ → ${result.newValue}M€**`
        );
      }

      /* =====================================================
         ANTRENMAN
      ===================================================== */

      if (
        command === "ant" ||
        command === "antrenman"
      ) {
        return trainingCommand(
          message
        );
      }

      /* =====================================================
         PENALTI
      ===================================================== */

      if (
        command === "pen" ||
        command === "penaltı" ||
        command === "penalti"
      ) {
        return penaltyCommand(
          message
        );
      }

      /* =====================================================
         ARA
      ===================================================== */

      if (command === "ara") {
        return searchPlayer(
          message,
          args.join(" ")
        );
      }

      /* =====================================================
         BÜTÇE EKLE
      ===================================================== */

      if (
        command === "bütçeekle" ||
        command === "butceekle"
      ) {
        if (!isValueStaff(message.member)) {
          return safeReply(
            message,
            "❌ Bu komutu sadece Değer Yetkilisi kullanabilir."
          );
        }

        const target =
          message.mentions.members.first();

        const amountText =
          args.find(x =>
            /^[0-9]+(?:\.[0-9]+)?M?€?$/i.test(x)
          );

        const amount =
          parseAmount(amountText);

        if (!target || !amount) {
          return safeReply(
            message,
            "❌ Kullanım: `.bütçeekle @Oyuncu 50M`"
          );
        }

        const newBudget =
          await addBudget(
            target,
            amount
          );

        return safeReply(
          message,
          `✅ ${target} bütçesine **+${amount}M€** eklendi.\n` +
          `💳 Yeni bütçe: **${newBudget}M€**`
        );
      }

      /* =====================================================
         BÜTÇE SİL
      ===================================================== */

      if (
        command === "bütçesil" ||
        command === "butcesil"
      ) {
        if (!isValueStaff(message.member)) {
          return safeReply(
            message,
            "❌ Bu komutu sadece Değer Yetkilisi kullanabilir."
          );
        }

        const target =
          message.mentions.members.first();

        const amountText =
          args.find(x =>
            /^[0-9]+(?:\.[0-9]+)?M?€?$/i.test(x)
          );

        const amount =
          parseAmount(amountText);

        if (!target || !amount) {
          return safeReply(
            message,
            "❌ Kullanım: `.bütçesil @Oyuncu 50M`"
          );
        }

        const old =
          getBudget(target);

        const newBudget =
          Math.max(
            0,
            old - amount
          );

        getUser(target).budget =
          newBudget;

        saveData();

        return safeReply(
          message,
          `✅ ${target} bütçesinden **${amount}M€** çıkarıldı.\n` +
          `💳 **${old}M€ → ${newBudget}M€**`
        );
      }

      /* =====================================================
         GÖNDER
      ===================================================== */

      if (
        command === "gönder" ||
        command === "gonder"
      ) {
        const target =
          message.mentions.members.first();

        const amountText =
          args.find(x =>
            /^[0-9]+(?:\.[0-9]+)?M?€?$/i.test(x)
          );

        const amount =
          parseAmount(amountText);

        if (!target || !amount) {
          return safeReply(
            message,
            "❌ Kullanım: `.gönder @Oyuncu 10M`"
          );
        }

        if (
          target.id ===
          message.author.id
        ) {
          return safeReply(
            message,
            "❌ Kendine bütçe gönderemezsin."
          );
        }

        const sender =
          getBudget(message.member);

        if (sender < amount) {
          return safeReply(
            message,
            `❌ Yeterli bütçen yok. Bütçen: **${sender}M€**`
          );
        }

        getUser(message.member).budget =
          sender - amount;

        getUser(target).budget =
          getBudget(target) + amount;

        saveData();

        return safeReply(
          message,
          `✅ **${amount}M€** başarıyla ${target} kişisine gönderildi.\n` +
          `💳 Kalan bütçen: **${sender - amount}M€**`
        );
      }

      /* =====================================================
         TAKIM EKLE
      ===================================================== */

      if (
        command === "takımekle" ||
        command === "takimekle"
      ) {
        if (!isAdmin(message.member)) {
          return safeReply(
            message,
            "❌ Yönetici yetkin yok."
          );
        }

        const role =
          message.mentions.roles.first();

        if (!role) {
          return safeReply(
            message,
            "❌ Takım rolünü etiketle."
          );
        }

        const teamName =
          Object.entries(IDS.teams)
            .find(
              ([, id]) =>
                id === role.id
            )?.[0] ||
            role.name;

        getTeamData(teamName);

        saveData();

        return safeReply(
          message,
          `✅ **${teamName}** takımı sisteme eklendi.`
        );
      }

      /* =====================================================
         TAKIM KALDIR
      ===================================================== */

      if (
        command === "takımkaldır" ||
        command === "takimkaldir"
      ) {
        if (!isAdmin(message.member)) {
          return safeReply(
            message,
            "❌ Yönetici yetkin yok."
          );
        }

        const role =
          message.mentions.roles.first();

        if (!role) {
          return safeReply(
            message,
            "❌ Takım rolünü etiketle."
          );
        }

        const teamName =
          Object.entries(IDS.teams)
            .find(
              ([, id]) =>
                id === role.id
            )?.[0];

        if (!teamName) {
          return safeReply(
            message,
            "❌ Bu takım Axera League takım listesinde bulunmuyor."
          );
        }

        delete db.teams[teamName];

        saveData();

        return safeReply(
          message,
          `✅ **${teamName}** takım verileri kaldırıldı.`
        );
      }

      /* =====================================================
         TAKIM DEĞER
      ===================================================== */

      if (
        command === "takımdeğer" ||
        command === "takimdeger"
      ) {
        if (!isValueStaff(message.member)) {
          return safeReply(
            message,
            "❌ Değer Yetkilisi yetkin yok."
          );
        }

        const role =
          message.mentions.roles.first();

        const amountText =
          args.find(x =>
            /^[0-9]+(?:\.[0-9]+)?M?€?$/i.test(x)
          );

        const amount =
          parseAmount(amountText);

        if (!role || !amount) {
          return safeReply(
            message,
            "❌ Kullanım: `.takımdeğer @Takım 850M`"
          );
        }

        const teamName =
          Object.entries(IDS.teams)
            .find(
              ([, id]) =>
                id === role.id
            )?.[0];

        if (!teamName) {
          return safeReply(
            message,
            "❌ Takım bulunamadı."
          );
        }

        getTeamData(teamName).value =
          Math.min(1000, amount);

        saveData();

        return safeReply(
          message,
          `✅ **${teamName}** takım değeri **${amount}M€** olarak ayarlandı.`
        );
      }

      /* =====================================================
         KADRO EKLE
      ===================================================== */

      if (
        command === "kadroekle"
      ) {
        if (!isSpiker(message.member)) {
          return safeReply(
            message,
            "❌ Spiker yetkin yok."
          );
        }

        const roles =
          message.mentions.roles;

        const teamRole =
          roles.first();

        const player =
          message.mentions.members.first();

        const position =
          args
            .filter(
              x =>
                !x.startsWith("<@") &&
                !x.startsWith("<@&")
            )
            .join(" ");

        if (!teamRole || !player) {
          return safeReply(
            message,
            "❌ Kullanım: `.kadroekle @Takım @Oyuncu Pozisyon`"
          );
        }

        const teamName =
          Object.entries(IDS.teams)
            .find(
              ([, id]) =>
                id === teamRole.id
            )?.[0];

        if (!teamName) {
          return safeReply(
            message,
            "❌ Takım bulunamadı."
          );
        }

        return squadAdd(
          message,
          teamName,
          player,
          position
        );
      }

      /* =====================================================
         KADRO ÇIKAR
      ===================================================== */

      if (
        command === "kadrocikar" ||
        command === "kadrosil"
      ) {
        if (!isSpiker(message.member)) {
          return safeReply(
            message,
            "❌ Spiker yetkin yok."
          );
        }

        const teamRole =
          message.mentions.roles.first();

        const player =
          message.mentions.members.first();

        if (!teamRole || !player) {
          return safeReply(
            message,
            "❌ Kullanım: `.kadrocikar @Takım @Oyuncu`"
          );
        }

        const teamName =
          Object.entries(IDS.teams)
            .find(
              ([, id]) =>
                id === teamRole.id
            )?.[0];

        if (!teamName) {
          return safeReply(
            message,
            "❌ Takım bulunamadı."
          );
        }

        const team =
          getTeamData(teamName);

        delete team.players[player.id];

        saveData();

        return safeReply(
          message,
          `✅ ${player} **${teamName}** kadrosundan çıkarıldı.`
        );
      }

      /* =====================================================
         KADRO
      ===================================================== */

      if (command === "kadro") {
        const role =
          message.mentions.roles.first();

        if (!role) {
          return safeReply(
            message,
            "❌ Kullanım: `.kadro @Takım`"
          );
        }

        const teamName =
          Object.entries(IDS.teams)
            .find(
              ([, id]) =>
                id === role.id
            )?.[0];

        if (!teamName) {
          return safeReply(
            message,
            "❌ Takım bulunamadı."
          );
        }

        return showSquad(
          message,
          teamName
        );
      }

      /* =====================================================
         İLK 11
      ===================================================== */

      if (command === "ilk11") {
        const role =
          message.mentions.roles.first();

        const userTeams =
          getUserTeams(
            message.guild,
            message.member
          );

        if (!isAdmin(message.member) &&
            !isSpiker(message.member) &&
            !hasRole(
              message.member,
              IDS.roles.td
            )) {
          return safeReply(
            message,
            "❌ İlk 11 kullanma yetkin yok."
          );
        }

        let teamName = null;

        if (role) {
          teamName =
            Object.entries(IDS.teams)
              .find(
                ([, id]) =>
                  id === role.id
              )?.[0];
        }

        if (
          hasRole(
            message.member,
            IDS.roles.td
          ) &&
          !isAdmin(message.member) &&
          !isSpiker(message.member)
        ) {
          if (!userTeams.length) {
            return safeReply(
              message,
              "❌ Bir takım rolün bulunmuyor."
            );
          }

          if (!teamName) {
            if (userTeams.length === 1) {
              teamName = userTeams[0];
            } else {
              const menu =
                new StringSelectMenuBuilder()
                  .setCustomId("ilk11_team_select")
                  .setPlaceholder("Takım seç")
                  .addOptions(
                    userTeams.map(x => ({
                      label: x,
                      value: x
                    }))
                  );

              return message.reply({
                embeds: [
                  embed(
                    "⚽ İlk 11",
                    "Birden fazla takım rolün var. Takım seç.",
                    0x3498db
                  )
                ],
                components: [
                  new ActionRowBuilder()
                    .addComponents(menu)
                ]
              });
            }
          }

          if (!userTeams.includes(teamName)) {
            return safeReply(
              message,
              "❌ Teknik Direktör olarak sadece kendi takımını yönetebilirsin."
            );
          }
        }

        if (!teamName) {
          return safeReply(
            message,
            "❌ Kullanım: `.ilk11 @Takım`"
          );
        }

        return openFirst11(
          message,
          teamName
        );
      }

      /* =====================================================
         FORMASYON
      ===================================================== */

      if (
        command === "formasyon"
      ) {
        const role =
          message.mentions.roles.first();

        if (!role) {
          return safeReply(
            message,
            "❌ Kullanım: `.formasyon @Takım`"
          );
        }

        const teamName =
          Object.entries(IDS.teams)
            .find(
              ([, id]) =>
                id === role.id
            )?.[0];

        if (!teamName) {
          return safeReply(
            message,
            "❌ Takım bulunamadı."
          );
        }

        if (
          !isAdmin(message.member) &&
          !isSpiker(message.member)
        ) {
          const teams =
            getUserTeams(
              message.guild,
              message.member
            );

          if (
            !hasRole(
              message.member,
              IDS.roles.td
            ) ||
            !teams.includes(teamName)
          ) {
            return safeReply(
              message,
              "❌ Bu takımın formasyonunu değiştiremezsin."
            );
          }
        }

        return formationPanel(
          message,
          teamName
        );
      }

      /* =====================================================
         MAÇ
      ===================================================== */

      if (
        command === "maç" ||
        command === "mac"
      ) {
        if (!isSpiker(message.member)) {
          return safeReply(
            message,
            "❌ Spiker yetkin yok."
          );
        }

        if (
          message.channel.id !==
          IDS.channels.mac
        ) {
          return safeReply(
            message,
            "❌ Maç komutu sadece maç kanalında kullanılabilir."
          );
        }

        const roles =
          message.mentions.roles;

        if (roles.size < 2) {
          return safeReply(
            message,
            "❌ Kullanım: `.maç @Takım1 @Takım2`"
          );
        }

        const roleArray =
          [...roles.values()];

        const team1 =
          Object.entries(IDS.teams)
            .find(
              ([, id]) =>
                id === roleArray[0].id
            )?.[0];

        const team2 =
          Object.entries(IDS.teams)
            .find(
              ([, id]) =>
                id === roleArray[1].id
            )?.[0];

        if (!team1 || !team2) {
          return safeReply(
            message,
            "❌ Geçerli iki takım seç."
          );
        }

        return startMatch(
          message.guild,
          team1,
          team2
        );
      }

      /* =====================================================
         FİKSTÜR EKLE
      ===================================================== */

      if (
        command === "fiksturekle"
      ) {
        if (!isSpiker(message.member)) {
          return safeReply(
            message,
            "❌ Spiker yetkin yok."
          );
        }

        const roles =
          [...message.mentions.roles.values()];

        const date =
          args.find(x =>
            /^\d{4}-\d{2}-\d{2}$/.test(x)
          );

        const time =
          args.find(x =>
            /^\d{2}:\d{2}$/.test(x)
          );

        if (
          roles.length < 2 ||
          !date ||
          !time
        ) {
          return safeReply(
            message,
            "❌ Kullanım: `.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`"
          );
        }

        const team1 =
          Object.entries(IDS.teams)
            .find(
              ([, id]) =>
                id === roles[0].id
            )?.[0];

        const team2 =
          Object.entries(IDS.teams)
            .find(
              ([, id]) =>
                id === roles[1].id
            )?.[0];

        const timestamp =
          parseFixtureDate(
            date,
            time
          );

        if (
          !team1 ||
          !team2 ||
          !timestamp
        ) {
          return safeReply(
            message,
            "❌ Takım veya tarih/saat geçersiz."
          );
        }

        const fixture = {
          id: db.nextFixtureId++,
          guildId: message.guild.id,
          team1,
          team2,
          date,
          time,
          timestamp,
          started: false,
          played: false
        };

        db.fixtures.push(
          fixture
        );

        saveData();

        return safeReply(
          message,
          `✅ Fikstür eklendi.\n\n` +
          `⚽ **${team1} vs ${team2}**\n` +
          `📅 **${date} ${time}**`
        );
      }

      /* =====================================================
         FİKSTÜR LİSTE
      ===================================================== */

      if (
        command === "fikstür" ||
        command === "fikstur"
      ) {
        const fixtures =
          db.fixtures
            .filter(x => !x.played)
            .sort(
              (a, b) =>
                a.timestamp -
                b.timestamp
            )
            .slice(0, 20);

        if (!fixtures.length) {
          return safeReply(
            message,
            "📅 Aktif fikstür bulunmuyor."
          );
        }

        const text =
          fixtures
            .map(
              x =>
                `**#${x.id}** — ⚽ ${x.team1} vs ${x.team2}\n` +
                `📅 ${x.date} ${x.time}`
            )
            .join("\n\n");

        return message.reply({
          embeds: [
            embed(
              "📅 Axera League Fikstür",
              text,
              0x3498db
            )
          ]
        });
      }

      /* =====================================================
         FİKSTÜR ÇIKAR
      ===================================================== */

      if (
        command === "fiksturcikar"
      ) {
        if (!isSpiker(message.member)) {
          return safeReply(
            message,
            "❌ Spiker yetkin yok."
          );
        }

        const roles =
          [...message.mentions.roles.values()];

        if (roles.length < 2) {
          return safeReply(
            message,
            "❌ İki takım etiketle."
          );
        }

        const team1 =
          Object.entries(IDS.teams)
            .find(
              ([, id]) =>
                id === roles[0].id
            )?.[0];

        const team2 =
          Object.entries(IDS.teams)
            .find(
              ([, id]) =>
                id === roles[1].id
            )?.[0];

        const index =
          db.fixtures.findIndex(
            x =>
              !x.played &&
              (
                (
                  x.team1 === team1 &&
                  x.team2 === team2
                ) ||
                (
                  x.team1 === team2 &&
                  x.team2 === team1
                )
              )
          );

        if (index === -1) {
          return safeReply(
            message,
            "❌ Böyle bir aktif fikstür bulunamadı."
          );
        }

        db.fixtures.splice(
          index,
          1
        );

        saveData();

        return safeReply(
          message,
          "✅ Fikstür kaldırıldı."
        );
      }

      /* =====================================================
         PUAN
      ===================================================== */

      if (command === "puan") {
        return showStandings(
          message
        );
      }

      /* =====================================================
         PUAN EKLE
      ===================================================== */

      if (
        command === "puanekle"
      ) {
        if (!isAdmin(message.member)) {
          return safeReply(
            message,
            "❌ Yönetici yetkin yok."
          );
        }

        const role =
          message.mentions.roles.first();

        const amountText =
          args.find(x =>
            /^\d+$/.test(x)
          );

        const amount =
          Number(amountText);

        if (!role || !Number.isFinite(amount)) {
          return safeReply(
            message,
            "❌ Kullanım: `.puanekle @Takım 3`"
          );
        }

        const teamName =
          Object.entries(IDS.teams)
            .find(
              ([, id]) =>
                id === role.id
            )?.[0];

        if (!teamName) {
          return safeReply(
            message,
            "❌ Takım bulunamadı."
          );
        }

        getStanding(teamName)
          .points += amount;

        saveData();

        return safeReply(
          message,
          `✅ **${teamName}** takımına **${amount} puan** eklendi.`
        );
      }

      /* =====================================================
         DM
      ===================================================== */

      if (command === "dm") {
        if (!isAdmin(message.member)) {
          return safeReply(
            message,
            "❌ Yönetici yetkin yok."
          );
        }

        const target =
          message.mentions.members.first();

        const text =
          args
            .filter(
              x =>
                !x.startsWith("<@")
            )
            .join(" ")
            .trim();

        if (!target || !text) {
          return safeReply(
            message,
            "❌ Kullanım: `.dm @Oyuncu mesaj`"
          );
        }

        try {
          await target.send(text);

          return safeReply(
            message,
            `✅ Mesaj ${target} kişisine gönderildi.`
          );
        } catch {
          return safeReply(
            message,
            "❌ Oyuncuya DM gönderilemedi."
          );
        }
      }

      /* =====================================================
         SİL
      ===================================================== */

      if (command === "sil") {
        if (!isAdmin(message.member)) {
          return safeReply(
            message,
            "❌ Yönetici yetkin yok."
          );
        }

        const amount =
          Number(args[0]);

        if (
          !Number.isInteger(amount) ||
          amount < 1 ||
          amount > 1000
        ) {
          return safeReply(
            message,
            "❌ 1-1000 arasında bir sayı gir."
          );
        }

        await message.channel.bulkDelete(
          amount,
          true
        );

        return;
      }

      /* =====================================================
         EMBED
      ===================================================== */

      if (command === "embed") {
        if (!isAdmin(message.member)) {
          return safeReply(
            message,
            "❌ Yönetici yetkin yok."
          );
        }

        const [title, ...description] =
          args.join(" ").split("|");

        if (!title || !description.length) {
          return safeReply(
            message,
            "❌ Kullanım: `.embed Başlık | Açıklama`"
          );
        }

        return message.channel.send({
          embeds: [
            embed(
              title.trim(),
              description.join("|").trim(),
              0x5865f2
            )
          ]
        });
      }

      /* =====================================================
         KICK
      ===================================================== */

      if (command === "kick") {
        if (!isAdmin(message.member)) {
          return safeReply(
            message,
            "❌ Yönetici yetkin yok."
          );
        }

        const target =
          message.mentions.members.first();

        if (!target) {
          return safeReply(
            message,
            "❌ Oyuncu etiketle."
          );
        }

        await target.kick().catch(() => {});

        return safeReply(
          message,
          `✅ ${target.user.username} sunucudan atıldı.`
        );
      }

      /* =====================================================
         BAN
      ===================================================== */

      if (command === "ban") {
        if (!isAdmin(message.member)) {
          return safeReply(
            message,
            "❌ Yönetici yetkin yok."
          );
        }

        const target =
          message.mentions.members.first();

        if (!target) {
          return safeReply(
            message,
            "❌ Oyuncu etiketle."
          );
        }

        await target.ban().catch(() => {});

        return safeReply(
          message,
          `✅ ${target.user.username} banlandı.`
        );
      }

      /* =====================================================
         MUTE
      ===================================================== */

      if (command === "mute") {
        if (!isModerator(message.member)) {
          return safeReply(
            message,
            "❌ Moderatör yetkin yok."
          );
        }

        const target =
          message.mentions.members.first();

        if (!target) {
          return safeReply(
            message,
            "❌ Oyuncu etiketle."
          );
        }

        await target.timeout(
          10 * 60 * 1000,
          "Axera League mute"
        ).catch(() => {});

        return safeReply(
          message,
          `🔇 ${target} 10 dakika susturuldu.`
        );
      }

      /* =====================================================
         UNMUTE
      ===================================================== */

      if (command === "unmute") {
        if (!isModerator(message.member)) {
          return safeReply(
            message,
            "❌ Moderatör yetkin yok."
          );
        }

        const target =
          message.mentions.members.first();

        if (!target) {
          return safeReply(
            message,
            "❌ Oyuncu etiketle."
          );
        }

        await target
          .timeout(null)
          .catch(() => {});

        return safeReply(
          message,
          `🔊 ${target} susturması kaldırıldı.`
        );
      }

      /* =====================================================
         TWEET
      ===================================================== */

      if (command === "tweet") {
        return tweetCommand(
          message,
          args.join(" ")
        );
      }

      /* =====================================================
         ROL PANEL
      ===================================================== */

      if (command === "rolpanel") {
        if (!isAdmin(message.member)) {
          return safeReply(
            message,
            "❌ Yönetici yetkin yok."
          );
        }

        return createRolePanel(
          message
        );
      }

      /* =====================================================
         TICKET PANEL
      ===================================================== */

      if (command === "ticketpanel") {
        if (!isModerator(message.member)) {
          return safeReply(
            message,
            "❌ Moderatör yetkin yok."
          );
        }

        return createTicketPanel(
          message
        );
      }

      /* =====================================================
         ŞART
      ===================================================== */

      if (
        command === "şart" ||
        command === "sart"
      ) {
        return message.reply({
          embeds: [
            embed(
              "📜 Axera League Şartları",
              `✓ **Kalıcı Tık:** Kalıcı 「✓」 kanalına tıklayınız.\n\n` +
              `🎭 **Rol Al:** Rol Al kanalından en az 2 rol alınız.\n\n` +
              `ℹ️ Bu şartlar sistemleri kullanmanız için zorunlu değildir.`,
              0x5865f2
            )
          ]
        });
      }

    } catch (error) {
      console.error(
        "MESSAGE ERROR:",
        error
      );

      if (!message.replied) {
        await safeReply(
          message,
          "❌ Komut çalıştırılırken bir hata oluştu."
        ).catch(() => {});
      }
    }
  }
);

/* =========================================================
   BUTONLAR
========================================================= */

client.on(
  "interactionCreate",
  async interaction => {
    try {
      if (
        interaction.isButton()
      ) {

        /* KAYIT */
        if (
          interaction.customId ===
          "register_player"
        ) {
          if (!isRegistrationStaff(interaction.member)) {
            return interaction.reply({
              content:
                "❌ Bu paneli sadece Kayıt Yetkilisi kullanabilir.",
              ephemeral: true
            });
          }

          return completeRegistration(
            interaction,
            "player"
          );
        }

        if (
          interaction.customId ===
          "register_member"
        ) {
          if (!isRegistrationStaff(interaction.member)) {
            return interaction.reply({
              content:
                "❌ Bu paneli sadece Kayıt Yetkilisi kullanabilir.",
              ephemeral: true
            });
          }

          return completeRegistration(
            interaction,
            "member"
          );
        }

        if (
          interaction.customId ===
          "register_td"
        ) {
          if (!isRegistrationStaff(interaction.member)) {
            return interaction.reply({
              content:
                "❌ Bu paneli sadece Kayıt Yetkilisi kullanabilir.",
              ephemeral: true
            });
          }

          return completeRegistration(
            interaction,
            "td"
          );
        }

        if (
          interaction.customId ===
          "register_gk"
        ) {
          if (!isRegistrationStaff(interaction.member)) {
            return interaction.reply({
              content:
                "❌ Bu paneli sadece Kayıt Yetkilisi kullanabilir.",
              ephemeral: true
            });
          }

          return completeRegistration(
            interaction,
            "gk"
          );
        }

        if (
          interaction.customId ===
          "register_cancel"
        ) {
          if (!isRegistrationStaff(interaction.member)) {
            return interaction.reply({
              content:
                "❌ Bu paneli sadece Kayıt Yetkilisi kullanabilir.",
              ephemeral: true
            });
          }

          delete db.registrationPanels[
            interaction.message.id
          ];

          saveData();

          return interaction.update({
            embeds: [
              embed(
                "❌ Kayıt İptal Edildi",
                "Bu kayıt paneli iptal edildi.",
                0xe74c3c
              )
            ],
            components: []
          });
        }

        /* İLK 11 */
        if (
          interaction.customId.startsWith(
            "ilk11pos_"
          )
        ) {
          const parts =
            interaction.customId.split("_");

          const teamName =
            parts[1];

          const position =
            parts[2];

          const players =
            getTeamPlayers(
              interaction.guild,
              teamName
            );

          if (!players.length) {
            return interaction.reply({
              content:
                "❌ Takımda oyuncu bulunamadı.",
              ephemeral: true
            });
          }

          const options =
            players
              .slice(0, 25)
              .map(player => ({
                label:
                  getPlayerName(player)
                    .slice(0, 100),
                value:
                  player.id
              }));

          const menu =
            new StringSelectMenuBuilder()
              .setCustomId(
                `ilk11player_${teamName}_${position}`
              )
              .setPlaceholder(
                `${POSITION_NAMES[position]} oyuncusu seç`
              )
              .addOptions(options);

          return interaction.reply({
            embeds: [
              embed(
                POSITION_NAMES[position],
                `**${teamName}** için oyuncu seç.`,
                0x3498db
              )
            ],
            components: [
              new ActionRowBuilder()
                .addComponents(menu)
            ],
            ephemeral: true
          });
        }

        if (
          interaction.customId.startsWith(
            "ilk11clear_"
          )
        ) {
          const teamName =
            interaction.customId.replace(
              "ilk11clear_",
              ""
            );

          const team =
            getTeamData(teamName);

          for (const pos of Object.keys(
            POSITION_NAMES
          )) {
            team.ilk11[pos] = null;
          }

          saveData();

          return interaction.update({
            embeds: [
              embed(
                `⚽ ${teamName} İlk 11`,
                "İlk 11 temizlendi.",
                0xe74c3c
              )
            ],
            components: []
          });
        }

        if (
          interaction.customId.startsWith(
            "ilk11save_"
          )
        ) {
          return interaction.reply({
            content:
              "✅ İlk 11 kaydedildi.",
            ephemeral: true
          });
        }

        /* ROLLER */
        const roleButtons = {
          role_partner: IDS.roles.partner,
          role_mac: IDS.roles.macPing,
          role_duyuru: IDS.roles.duyuru,
          role_cekilis: IDS.roles.cekilis,
          role_medya: IDS.roles.medya
        };

        if (
          roleButtons[
            interaction.customId
          ]
        ) {
          const roleId =
            roleButtons[
              interaction.customId
            ];

          const member =
            interaction.member;

          if (
            member.roles.cache.has(
              roleId
            )
          ) {
            await member.roles
              .remove(roleId);

            return interaction.reply({
              content:
                "🔕 Bildirim rolü kaldırıldı.",
              ephemeral: true
            });
          }

          await member.roles
            .add(roleId);

          return interaction.reply({
            content:
              "🔔 Bildirim rolü verildi.",
            ephemeral: true
          });
        }

        /* TICKET */
        if (
          interaction.customId ===
          "ticket_create"
        ) {
          return createTicket(
            interaction
          );
        }

        if (
          interaction.customId ===
          "ticket_close"
        ) {
          if (!isModerator(interaction.member)) {
            return interaction.reply({
              content:
                "❌ Bu ticketı kapatmak için yetkin yok.",
              ephemeral: true
            });
          }

          const ticket =
            db.tickets[
              interaction.channel.id
            ];

          if (ticket) {
            ticket.open = false;
            saveData();
          }

          await interaction.reply(
            "🔒 Ticket kapatılıyor..."
          );

          await sleep(1000);

          return interaction.channel
            .delete()
            .catch(() => {});
        }
      }

      /* =====================================================
         SELECT MENÜLER
      ===================================================== */

      if (
        interaction.isStringSelectMenu()
      ) {
        /* FORMASYON */
        if (
          interaction.customId.startsWith(
            "formation_"
          )
        ) {
          const teamName =
            interaction.customId.replace(
              "formation_",
              ""
            );

          const formation =
            interaction.values[0];

          getTeamData(teamName)
            .ilk11.formation =
            formation;

          db.formations[teamName] =
            formation;

          saveData();

          return interaction.update({
            embeds: [
              embed(
                "📐 Formasyon Güncellendi",
                `⚽ **${teamName}**\n\n` +
                `Yeni formasyon: **${formation}**`,
                0x9b59b6
              )
            ],
            components: []
          });
        }

        /* İLK 11 TAKIM SEÇ */
        if (
          interaction.customId ===
          "ilk11_team_select"
        ) {
          const teamName =
            interaction.values[0];

          await interaction.deferUpdate();

          const players =
            getTeamPlayers(
              interaction.guild,
              teamName
            );

          const buttons =
            Object.keys(
              POSITION_NAMES
            ).map(pos =>
              new ButtonBuilder()
                .setCustomId(
                  `ilk11pos_${teamName}_${pos}`
                )
                .setLabel(
                  POSITION_NAMES[pos]
                    .replace(
                      /[^\p{L}\p{N} ]/gu,
                      ""
                    )
                    .trim()
                )
                .setStyle(
                  ButtonStyle.Secondary
                )
            );

          const rows = [];

          for (
            let i = 0;
            i < buttons.length;
            i += 5
          ) {
            rows.push(
              new ActionRowBuilder()
                .addComponents(
                  buttons.slice(
                    i,
                    i + 5
                  )
                )
            );
          }

          return interaction.editReply({
            embeds: [
              embed(
                `⚽ ${teamName} İlk 11`,
                `Takımda **${players.length}** oyuncu bulundu.\n\nPozisyon seç.`,
                0x3498db
              )
            ],
            components: rows
          });
        }

        /* İLK 11 OYUNCU */
        if (
          interaction.customId.startsWith(
            "ilk11player_"
          )
        ) {
          const parts =
            interaction.customId.split("_");

          const teamName =
            parts[1];

          const position =
            parts[2];

          const playerId =
            interaction.values[0];

          const team =
            getTeamData(teamName);

          team.ilk11[position] =
            playerId;

          saveData();

          return interaction.update({
            embeds: [
              embed(
                "✅ Oyuncu Yerleştirildi",
                `${POSITION_NAMES[position]} → <@${playerId}>`,
                0x2ecc71
              )
            ],
            components: []
          });
        }
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
   YENİ ÜYE
========================================================= */

client.on(
  "guildMemberAdd",
  async member => {
    try {
      await member.roles
        .add(IDS.roles.kayitsiz)
        .catch(() => {});

      const channel =
        member.guild.channels.cache.get(
          IDS.channels.kayit
        );

      if (channel) {
        await channel.send({
          content:
            `${member} sunucuya katıldı! <@&${IDS.roles.kayitYetkilisi}>`,
          embeds: [
            embed(
              "👋 Hoş Geldin!",
              `${member} Axera League'e hoş geldin!\n\n` +
              `Kayıt işlemin için Kayıt Yetkilileri yardımcı olacaktır.`,
              0x3498db
            )
          ]
        });
      }
    } catch (error) {
      console.error(
        "GUILD MEMBER ADD ERROR:",
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
    if (message.author.bot) return;

    const ticket =
      db.tickets[
        message.channel.id
      ];

    if (
      ticket &&
      ticket.open
    ) {
      ticket.lastMessage =
        Date.now();

      saveData();
    }
  }
);

/* =========================================================
   ZAMANLAYICI
========================================================= */

setInterval(
  async () => {
    try {
      await startDueFixtures();

      for (
        const [channelId, ticket]
        of Object.entries(db.tickets)
      ) {
        if (
          ticket.open &&
          Date.now() -
            ticket.lastMessage >
            60 * 60 * 1000
        ) {
          ticket.open = false;

          const channel =
            client.channels.cache.get(
              channelId
            );

          if (channel) {
            await channel
              .delete()
              .catch(() => {});
          }
        }
      }

      const now =
        new Date();

      const key =
        `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;

      if (
        (
          now.getMinutes() === 0 ||
          now.getMinutes() === 30
        ) &&
        key !== lastStatusKey
      ) {
        lastStatusKey = key;

        await statusPost()
          .catch(console.error);
      }
    } catch (error) {
      console.error(
        "TIMER ERROR:",
        error
      );
    }
  },
  1000
);

/* =========================================================
   READY
========================================================= */

client.once(
  "ready",
  () => {
    console.log(
      `Axera League aktif: ${client.user.tag}`
    );

    client.user.setPresence({
      activities: [
        {
          name: "Axera League",
          type: 1,
          url:
            process.env.STREAM_URL ||
            "https://www.twitch.tv/axeraleague"
        }
      ],
      status: "online"
    });

    console.log(
      `Sunucu sayısı: ${client.guilds.cache.size}`
    );
  }
);

/* =========================================================
   HATA YAKALAMA
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
   BOTU BAŞLAT
========================================================= */

client.login(TOKEN);
