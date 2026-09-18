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

/* =========================================================
   AXERA LEAGUE DISCORD BOT
   Discord.js v14
   ========================================================= */

const TOKEN = process.env.TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!TOKEN) {
  throw new Error("TOKEN Railway Variables içine eklenmemiş.");
}

const ai = OPENAI_API_KEY
  ? new OpenAI({ apiKey: OPENAI_API_KEY })
  : null;

/* =========================================================
   IDLER
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
   VERI
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

function cloneDefault() {
  return JSON.parse(JSON.stringify(DEFAULT));
}

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return cloneDefault();
    }

    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);

    return {
      ...cloneDefault(),
      ...parsed
    };
  } catch (err) {
    console.error("data.json okunamadı:", err);
    return cloneDefault();
  }
}

let db = loadData();

function saveData() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(db, null, 2),
      "utf8"
    );
  } catch (err) {
    console.error("data.json kaydedilemedi:", err);
  }
}

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
   YARDIMCI FONKSIYONLAR
   ========================================================= */

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function embed(title, description, color = 0x5865f2) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();
}

function normalize(text) {
  return String(text || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function hasRole(member, roleIds) {
  if (!member?.roles?.cache) return false;

  return member.roles.cache.some(role =>
    roleIds.includes(role.id)
  );
}

function isAdmin(member) {
  return Boolean(
    member?.permissions?.has(
      PermissionFlagsBits.Administrator
    ) ||
    hasRole(member, [IDS.roles.yonetici])
  );
}

function isStaff(member) {
  return (
    isAdmin(member) ||
    hasRole(member, [
      IDS.roles.kayitYetkilisi,
      IDS.roles.deger,
      IDS.roles.spiker,
      IDS.roles.moderator
    ])
  );
}

function isValueStaff(member) {
  return (
    isAdmin(member) ||
    hasRole(member, [IDS.roles.deger])
  );
}

function isMatchStaff(member) {
  return (
    isAdmin(member) ||
    hasRole(member, [IDS.roles.spiker])
  );
}

function onlyChannel(message, channelId) {
  if (message.channel.id !== channelId) {
    message.reply(
      `❌ Bu komut <#${channelId}> kanalında kullanılabilir.`
    ).catch(() => {});

    return false;
  }

  return true;
}

function money(value) {
  const v = Math.max(0, Number(value) || 0);

  if (v >= 1000) {
    return "1B€";
  }

  return `${Math.round(v)}M€`;
}

function amountArg(value) {
  if (!value) return null;

  let text = String(value)
    .trim()
    .toUpperCase()
    .replace(/€/g, "")
    .replace(",", ".");

  if (!/^\d+(?:\.\d+)?M?$/.test(text)) {
    return null;
  }

  text = text.replace(/M$/, "");

  const number = Number(text);

  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }

  return number;
}

function mentionMember(message, index = 0) {
  const mentioned = message.mentions.members.first();

  if (mentioned) {
    return mentioned;
  }

  const parts = message.content.split(/\s+/);
  const raw = parts[index];

  if (!raw) return null;

  const id = raw.replace(/[<@!>]/g, "");

  return message.guild?.members.cache.get(id) || null;
}

function mentionRole(message, index = 0) {
  const mentioned = message.mentions.roles.first();

  if (mentioned) {
    return mentioned;
  }

  const parts = message.content.split(/\s+/);
  const raw = parts[index];

  if (!raw) return null;

  const id = raw.replace(/[<@&>]/g, "");

  return message.guild?.roles.cache.get(id) || null;
}

function cleanName(value) {
  return String(value || "")
    .replace(/[*_`]/g, "")
    .trim();
}

/* =========================================================
   OYUNCU DEĞER SİSTEMİ
   Değer kaynağı Discord nickname'dir.
   Sadece son M€/B€ kısmı değiştirilir.
   ========================================================= */

function parseNickValue(member) {
  const nickname =
    member?.nickname ||
    member?.displayName ||
    "";

  if (/1B€\s*$/i.test(nickname)) {
    return 1000;
  }

  const match = nickname.match(
    /(\d+(?:\.\d+)?)M€\s*$/i
  );

  if (!match) {
    return 0;
  }

  return Number(match[1]) || 0;
}

function setNickValue(oldNickname, value) {
  let nickname = String(oldNickname || "").trim();

  nickname = nickname
    .replace(
      /\s*(?:\d+(?:\.\d+)?M|1B)€\s*$/i,
      ""
    )
    .trim();

  if (!nickname) {
    nickname = "Oyuncu";
  }

  const suffix = money(value);
  const separator = " | ";
  const maxBaseLength =
    32 - separator.length - suffix.length;

  const base =
    nickname.slice(
      0,
      Math.max(1, maxBaseLength)
    );

  return `${base}${separator}${suffix}`;
}

async function safeSetNickname(member, nickname) {
  if (!member?.manageable) {
    return false;
  }

  try {
    await member.setNickname(nickname);
    return true;
  } catch (err) {
    console.error(
      `Nickname değiştirilemedi (${member.id}):`,
      err.message
    );

    return false;
  }
}

function ensureUser(member) {
  if (!db.users[member.id]) {
    db.users[member.id] = {
      name:
        member.nickname ||
        member.displayName ||
        member.user?.username ||
        "Oyuncu",

      value: parseNickValue(member),
      budget: 0
    };
  }

  const user = db.users[member.id];

  if (!Number.isFinite(Number(user.value))) {
    user.value = parseNickValue(member);
  }

  if (!Number.isFinite(Number(user.budget))) {
    user.budget = 0;
  }

  if (!user.name) {
    user.name =
      member.nickname ||
      member.displayName ||
      member.user?.username ||
      "Oyuncu";
  }

  return user;
}

function playerName(member) {
  return (
    member?.nickname ||
    db.users[member?.id]?.name ||
    member?.displayName ||
    member?.user?.username ||
    "Oyuncu"
  );
}

async function changePlayerValue(
  member,
  delta,
  reason = ""
) {
  if (!member) return null;

  /*
   * ÖNEMLİ:
   * Değer her zaman mevcut Discord nickname'inden okunur.
   */
  const current = parseNickValue(member);

  const numericDelta = Number(delta) || 0;

  const next = Math.min(
    1000,
    Math.max(0, current + numericDelta)
  );

  const currentNickname =
    member.nickname ||
    member.displayName ||
    playerName(member);

  const newNickname = setNickValue(
    currentNickname,
    next
  );

  await safeSetNickname(
    member,
    newNickname
  );

  const user = ensureUser(member);

  user.value = next;

  if (reason) {
    user.lastValueReason = reason;
  }

  saveData();

  return {
    oldValue: current,
    newValue: next
  };
}

/* =========================================================
   TAKIM SİSTEMİ
   ========================================================= */

function ensureTeam(name, roleId = null) {
  if (!db.teams[name]) {
    db.teams[name] = {
      players: [],
      score: 0,
      gd: 0,
      gf: 0,
      ga: 0,
      roleId: roleId || IDS.teams[name] || null,
      teamValue: 0,
      ilk11: {}
    };
  }

  if (roleId) {
    db.teams[name].roleId = roleId;
  }

  if (!db.teams[name].ilk11) {
    db.teams[name].ilk11 = {};
  }

  return db.teams[name];
}

function teamRole(guild, teamName) {
  const roleId =
    IDS.teams[teamName] ||
    db.teams[teamName]?.roleId;

  if (!roleId) return null;

  return guild.roles.cache.get(roleId) || null;
}

function teamByName(value) {
  const normalized = normalize(value);

  if (!normalized) return null;

  const names = [
    ...new Set([
      ...Object.keys(IDS.teams),
      ...Object.keys(db.teams)
    ])
  ];

  const exact = names.find(
    name => normalize(name) === normalized
  );

  if (exact) return exact;

  return names.find(name => {
    const n = normalize(name);

    return (
      n.includes(normalized) ||
      normalized.includes(n)
    );
  }) || null;
}

function teamMembers(guild, name) {
  const role = teamRole(guild, name);

  if (!role) return [];

  return [...role.members.values()];
}

function teamPlayers(guild, name) {
  const team = ensureTeam(name);

  const manual = (team.players || [])
    .map(p => guild.members.cache.get(p.id))
    .filter(Boolean);

  const rolePlayers = teamMembers(
    guild,
    name
  );

  return [
    ...new Map(
      [...manual, ...rolePlayers]
        .map(member => [member.id, member])
    ).values()
  ];
}

function teamValue(guild, name) {
  return teamMembers(guild, name)
    .reduce(
      (total, member) =>
        total + parseNickValue(member),
      0
    );
}

function addStandingResult(
  teamA,
  teamB,
  scoreA,
  scoreB
) {
  const A = ensureTeam(teamA);
  const B = ensureTeam(teamB);

  A.gf += scoreA;
  A.ga += scoreB;
  A.gd = A.gf - A.ga;

  B.gf += scoreB;
  B.ga += scoreA;
  B.gd = B.gf - B.ga;

  if (scoreA > scoreB) {
    A.score += 3;
  } else if (scoreB > scoreA) {
    B.score += 3;
  } else {
    A.score += 1;
    B.score += 1;
  }

  saveData();
}

function postStandings(guild) {
  const names = [
    ...new Set([
      ...Object.keys(IDS.teams),
      ...Object.keys(db.teams)
    ])
  ];

  const sorted = names
    .map(name => ({
      name,
      data: ensureTeam(name)
    }))
    .sort((a, b) => {
      if (b.data.score !== a.data.score) {
        return b.data.score - a.data.score;
      }

      return b.data.gd - a.data.gd;
    });

  const text = sorted.length
    ? sorted.map((x, i) =>
        `**${i + 1}. ${x.name}** — ${x.data.score} P | AV: ${x.data.gd} | AG: ${x.data.gf} | YG: ${x.data.ga}`
      ).join("\n")
    : "Henüz takım bulunmuyor.";

  const channel =
    guild.channels.cache.get(
      IDS.channels.puan
    );

  if (!channel) return;

  channel.send({
    embeds: [
      embed(
        "🏆 Axera League Puan Durumu",
        text,
        0x5865f2
      )
    ]
  }).catch(() => {});
}

/* =========================================================
   İLK 11
   ========================================================= */

const FIRST11_POSITIONS = [
  ["kaleci", "🧤 Kaleci"],
  ["defans1", "🛡️ Defans"],
  ["defans2", "🛡️ Defans"],
  ["defans3", "🛡️ Defans"],
  ["defans4", "🛡️ Defans"],
  ["orta1", "⚙️ Orta Saha"],
  ["orta2", "⚙️ Orta Saha"],
  ["orta3", "⚙️ Orta Saha"],
  ["forvet1", "⚽ Forvet"],
  ["forvet2", "⚽ Forvet"],
  ["forvet3", "⚽ Forvet"]
];

function getFirst11(guild, teamName) {
  const team = ensureTeam(teamName);

  if (!team.ilk11) {
    team.ilk11 = {};
  }

  return FIRST11_POSITIONS
    .map(([key, label]) => {
      const id = team.ilk11[key];

      const member = id
        ? guild.members.cache.get(id)
        : null;

      return {
        key,
        label,
        member
      };
    });
}

function getMatchPlayers(guild, teamName) {
  const team = ensureTeam(teamName);

  const first11 = team.ilk11 || {};

  const ids = FIRST11_POSITIONS
    .map(([key]) => first11[key])
    .filter(Boolean);

  if (
    ids.length === FIRST11_POSITIONS.length
  ) {
    const players = ids
      .map(id => guild.members.cache.get(id))
      .filter(Boolean);

    if (
      players.length ===
      FIRST11_POSITIONS.length
    ) {
      return [
        ...new Map(
          players.map(p => [p.id, p])
        ).values()
      ];
    }
  }

  /*
   * İlk 11 hazır değilse maç durmaz.
   * Takım rolündeki oyuncular kullanılır.
   */
  return teamPlayers(guild, teamName);
}

/* =========================================================
   FORMASYON
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

function formationCount(formation) {
  return (
    1 +
    formation
      .split("-")
      .map(Number)
      .reduce(
        (a, b) => a + b,
        0
      )
  );
}

/* =========================================================
   KAYIT
   ========================================================= */

async function registerPanel(
  commandMessage,
  target,
  nickname
) {
  const row =
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `register_futbolcu_${target.id}`
        )
        .setLabel("⚽ Futbolcu")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(
          `register_uye_${target.id}`
        )
        .setLabel("👤 Üye")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(
          `register_td_${target.id}`
        )
        .setLabel("🧑‍💼 Teknik Direktör")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(
          `register_kaleci_${target.id}`
        )
        .setLabel("🧤 Kaleci")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(
          `register_cancel_${target.id}`
        )
        .setLabel("❌ İptal")
        .setStyle(ButtonStyle.Danger)
    );

  /*
   * Panel mesajı oluşturulduktan sonra
   * GERÇEK panel mesajının ID'si kaydedilir.
   */
  const panel = await commandMessage.reply({
    embeds: [
      embed(
        "📋 Axera League Kayıt",
        `👤 Oyuncu: <@${target.id}>\n` +
        `🏷️ İsim: **${cleanName(nickname)}**\n\n` +
        `Oyuncunun rolünü aşağıdaki butonlardan seçiniz.`
      )
    ],
    components: [row]
  });

  db.registrationPanels[panel.id] = {
    userId: target.id,
    nickname: String(nickname).slice(0, 32),
    createdBy: commandMessage.author.id,
    createdAt: Date.now()
  };

  saveData();

  return panel;
}

async function finishRegister(
  interaction,
  type
) {
  const panel =
    db.registrationPanels[
      interaction.message.id
    ];

  if (!panel) {
    return interaction.reply({
      content:
        "❌ Bu kayıt paneli artık geçerli değil.",
      ephemeral: true
    });
  }

  const member =
    await interaction.guild.members
      .fetch(panel.userId)
      .catch(() => null);

  if (!member) {
    return interaction.reply({
      content:
        "❌ Oyuncu bulunamadı.",
      ephemeral: true
    });
  }

  if (type === "cancel") {
    delete db.registrationPanels[
      interaction.message.id
    ];

    saveData();

    return interaction.update({
      embeds: [
        embed(
          "❌ Kayıt İptal Edildi",
          `<@${member.id}> için kayıt iptal edildi.`,
          0xed4245
        )
      ],
      components: []
    });
  }

  const rolesToRemove = [
    IDS.roles.kayitsiz,
    IDS.roles.futbolcu,
    IDS.roles.uye,
    IDS.roles.td,
    IDS.roles.kaleci
  ].filter(Boolean);

  await member.roles
    .remove(
      rolesToRemove.filter(id =>
        member.roles.cache.has(id)
      )
    )
    .catch(() => {});

  const roleMap = {
    futbolcu: IDS.roles.futbolcu,
    uye: IDS.roles.uye,
    td: IDS.roles.td,
    kaleci: IDS.roles.kaleci
  };

  const selectedRole = roleMap[type];

  if (!selectedRole) {
    return interaction.reply({
      content:
        "❌ Geçersiz rol.",
      ephemeral: true
    });
  }

  await member.roles
    .add(selectedRole)
    .catch(() => {});

  const user = ensureUser(member);

  user.name = panel.nickname;

  /*
   * Kayıt sırasında değer yoksa 0 olur.
   * Sonrasında değer nickname üzerinden okunur.
   */
  user.value = parseNickValue(member);

  await safeSetNickname(
    member,
    panel.nickname
  );

  delete db.registrationPanels[
    interaction.message.id
  ];

  saveData();

  const roleName = {
    futbolcu: "Futbolcu",
    uye: "Üye",
    td: "Teknik Direktör",
    kaleci: "Kaleci"
  }[type];

  return interaction.update({
    embeds: [
      embed(
        "✅ Kayıt Tamamlandı",
        `👤 Oyuncu: <@${member.id}>\n` +
        `🏷️ İsim: **${panel.nickname}**\n` +
        `🎭 Rol: **${roleName}**`,
        0x57f287
      )
    ],
    components: []
  });
}

/* =========================================================
   ANTRENMAN
   ========================================================= */

async function doTraining(message) {
  if (
    !onlyChannel(
      message,
      IDS.channels.ant
    )
  ) {
    return;
  }

  const result =
    await changePlayerValue(
      message.member,
      1,
      "Antrenman ödülü"
    );

  return message.reply(
    `🏋️ Antrenman tamamlandı!\n💰 **+1M€**\n📈 Yeni değer: **${money(result.newValue)}**`
  );
}

/* =========================================================
   PENALTI
   ========================================================= */

async function doPenalty(message) {
  if (
    !onlyChannel(
      message,
      IDS.channels.pen
    )
  ) {
    return;
  }

  const random = Math.random();

  let result;
  let reward = 0;

  if (random < 0.50) {
    result = "⚽ GOL";
    reward = 5;
  } else if (random < 0.75) {
    result = "🥅 DİREK";
  } else {
    result = "🧤 KALECİ KURTARDI";
  }

  if (reward) {
    await changePlayerValue(
      message.member,
      reward,
      "Penaltı gol ödülü"
    );
  }

  return message.reply(
    `${result}\n` +
    (reward
      ? "💰 **+5M€** kazandın!"
      : "💰 Bu atıştan değer ödülü yok.")
  );
}

/* =========================================================
   TWEET
   ========================================================= */

async function doTweet(message, text) {
  if (
    !onlyChannel(
      message,
      IDS.channels.tweet
    )
  ) {
    return;
  }

  if (!text) {
    return message.reply(
      "❌ Tweet metni yazmalısın."
    );
  }

  await message.delete().catch(() => {});

  const last =
    Number(
      db.tweetCooldowns[
        message.author.id
      ] || 0
    );

  let rewardText = "";

  if (
    Date.now() - last >=
    2 * 60 * 60 * 1000
  ) {
    db.tweetCooldowns[
      message.author.id
    ] = Date.now();

    await changePlayerValue(
      message.member,
      10,
      "Tweet ödülü"
    );

    rewardText =
      "\n\n💰 **+10M€** tweet ödülü kazandın!";
  }

  saveData();

  return message.channel.send({
    embeds: [
      embed(
        "🐦 Tweet",
        `${text}${rewardText}\n\n— **${playerName(message.member)}**`
      )
    ]
  });
}

/* =========================================================
   MAÇ SİSTEMİ
   3 GERÇEK SANİYE = 1 OYUN DAKİKASI
   ========================================================= */

function randomEvent() {
  const roll = Math.random();

  if (roll < 0.10) {
    return "goal";
  }

  if (roll < 0.18) {
    return "chance";
  }

  if (roll < 0.23) {
    return "card";
  }

  return "commentary";
}

async function runMatch(
  guild,
  teamA,
  teamB
) {
  const channel =
    guild.channels.cache.get(
      IDS.channels.mac
    );

  if (!channel) return;

  const playersA =
    getMatchPlayers(
      guild,
      teamA
    );

  const playersB =
    getMatchPlayers(
      guild,
      teamB
    );

  /*
   * Eksik kadro maçın başlamasını engellemez.
   */

  let scoreA = 0;
  let scoreB = 0;

  const matchId =
    `${Date.now()}_${teamA}_${teamB}`;

  db.activeMatches[matchId] = {
    guildId: guild.id,
    teamA,
    teamB,
    scoreA: 0,
    scoreB: 0,
    minute: 0,
    startedAt: Date.now()
  };

  saveData();

  await channel.send({
    embeds: [
      embed(
        "⚽ MAÇ BAŞLADI",
        `**${teamA}** 0 - 0 **${teamB}**\n\n` +
        `⏱️ 3 saniye = 1 maç dakikası\n` +
        `🏟️ Maç: 90 dakika`,
        0x57f287
      )
    ]
  });

  /*
   * 90 dakika x 3 saniye = 270 saniye
   */
  for (
    let minute = 1;
    minute <= 90;
    minute++
  ) {
    await sleep(3000);

    db.activeMatches[matchId].minute =
      minute;

    const event = randomEvent();

    if (event === "goal") {
      const home =
        Math.random() < 0.5;

      if (home) {
        scoreA++;
      } else {
        scoreB++;
      }

      const scoringTeam =
        home ? teamA : teamB;

      const players =
        home ? playersA : playersB;

      const scorer =
        players.length
          ? players[
              Math.floor(
                Math.random() *
                players.length
              )
            ]
          : null;

      let scorerText =
        scorer
          ? `\n⚽ Golü atan: <@${scorer.id}>`
          : "";

      if (scorer) {
        await changePlayerValue(
          scorer,
          2,
          "Maç golü"
        );
      }

      await channel.send({
        embeds: [
          embed(
            `⚽ ${minute}. DAKİKA — GOL!`,
            `**${scoringTeam}** golü buldu!` +
            scorerText +
            `\n\n📊 **${teamA} ${scoreA} - ${scoreB} ${teamB}**`,
            0x57f287
          )
        ]
      });
    } else if (
      event === "chance"
    ) {
      await channel.send(
        `🔥 **${minute}. dakika:** ${teamA} ile ${teamB} arasında tehlikeli atak!`
      );
    } else if (
      event === "card"
    ) {
      await channel.send(
        `🟨 **${minute}. dakika:** Hakem kartını çıkardı.`
      );
    } else if (
      minute % 10 === 0
    ) {
      await channel.send(
        `⏱️ **${minute}. dakika:** ${teamA} ${scoreA} - ${scoreB} ${teamB}`
      );
    }
  }

  /*
   * Maç bitişi
   */

  addStandingResult(
    teamA,
    teamB,
    scoreA,
    scoreB
  );

  const participants = [
    ...playersA,
    ...playersB
  ];

  for (const player of [
    ...new Map(
      participants.map(
        member => [member.id, member]
      )
    ).values()
  ]) {
    await changePlayerValue(
      player,
      5,
      "Maç katılım ödülü"
    );
  }

  if (!db.matchHistory[matchId]) {
    db.matchHistory[matchId] = {
      teamA,
      teamB,
      scoreA,
      scoreB,
      finishedAt: Date.now()
    };
  }

  delete db.activeMatches[matchId];

  saveData();

  await channel.send({
    embeds: [
      embed(
        "🏁 MAÇ BİTTİ",
        `**${teamA}** **${scoreA} - ${scoreB}** **${teamB}**\n\n` +
        `💰 Maça katılan oyunculara **+5M€** verildi.\n` +
        `📊 Puan durumu güncellendi.`,
        0x5865f2
      )
    ]
  });

  postStandings(guild);
}

/* =========================================================
   FİKSTÜR
   ========================================================= */

function parseFixtureDate(
  date,
  time
) {
  const timestamp =
    new Date(
      `${date}T${time}:00+03:00`
    ).getTime();

  return Number.isFinite(timestamp)
    ? timestamp
    : null;
}

async function startDueFixtures() {
  const now = Date.now();

  for (const fixture of db.fixtures) {
    if (fixture.started) continue;

    if (fixture.timestamp > now) {
      continue;
    }

    const guild =
      client.guilds.cache.get(
        fixture.guildId
      );

    if (!guild) continue;

    fixture.started = true;

    saveData();

    await runMatch(
      guild,
      fixture.a,
      fixture.b
    ).catch(console.error);
  }
}

/* =========================================================
   TICKET
   ========================================================= */

async function createTicket(
  interaction
) {
  const guild =
    interaction.guild;

  const existing =
    Object.entries(db.tickets)
      .find(
        ([, ticket]) =>
          ticket.open &&
          ticket.userId ===
            interaction.user.id
      );

  if (existing) {
    return interaction.reply({
      content:
        `❌ Zaten açık bir ticket'ın var: <#${existing[0]}>`,
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
          id: guild.roles.everyone.id,
          deny: ["ViewChannel"]
        },

        {
          id: interaction.user.id,
          allow: [
            "ViewChannel",
            "SendMessages",
            "ReadMessageHistory"
          ]
        },

        {
          id: IDS.roles.yonetici,
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
    userId: interaction.user.id,
    open: true,
    lastMessage: Date.now()
  };

  saveData();

  const row =
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_close")
        .setLabel("🔒 Ticket Kapat")
        .setStyle(ButtonStyle.Danger)
    );

  await channel.send({
    content:
      `<@${interaction.user.id}>`,
    embeds: [
      embed(
        "🎫 Axera League Ticket",
        "Yetkililer birazdan seninle ilgilenecektir.\n\n" +
        "Bu ticket 60 dakika boyunca mesaj gelmezse otomatik kapanır."
      )
    ],
    components: [row]
  });

  return interaction.reply({
    content:
      `✅ Ticket oluşturuldu: <#${channel.id}>`,
    ephemeral: true
  });
}

/* =========================================================
   AI
   ========================================================= */

async function aiReply(
  message,
  question
) {
  if (!ai) {
    return message.reply(
      "❌ AI sistemi için OPENAI_API_KEY Railway Variables'a eklenmemiş."
    );
  }

  try {
    const response =
      await ai.responses.create({
        model: "gpt-5.6-luna",

        input: [
          {
            role: "system",
            content:
              "Sen Axera League Discord sunucusunun yapay zekâ asistanısın. Türkçe, kısa, anlaşılır ve yardımcı cevap ver."
          },

          {
            role: "user",
            content: String(question)
          }
        ]
      });

    const text =
      response.output_text ||
      "❌ AI cevap oluşturamadı.";

    return message.reply(
      text.slice(0, 1900)
    );
  } catch (err) {
    console.error("AI Hatası:", err);

    return message.reply(
      "❌ AI sisteminde bir hata oluştu."
    );
  }
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
    const botMessages =
      messages.filter(
        msg =>
          msg.author.id ===
          client.user.id
      );

    for (const msg of botMessages.values()) {
      await msg.delete().catch(() => {});
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
        "🤖 Axera League Bot Durumu",
        `🟢 **Tüm sistemler sorunsuz çalışıyor.**\n\n` +
        `⏱️ Uptime: **${uptimeHours} saat**\n` +
        `🌐 Sunucu: **${client.guilds.cache.size}**`,
        0x57f287
      )
    ]
  });
}

/* =========================================================
   MESSAGE CREATE
   ========================================================= */

client.on(
  "messageCreate",
  async message => {
    if (message.author.bot) return;

    /*
     * Ticket aktivitesi
     */
    const ticket =
      db.tickets[message.channel.id];

    if (ticket?.open) {
      ticket.lastMessage = Date.now();
      saveData();
    }

    const raw =
      message.content.trim();

    if (!raw) return;

    /*
     * AI özel cevapları
     */
    const normalized =
      normalize(raw);

    if (
      normalized ===
        "seni kim kurdu" ||
      normalized ===
        "seni kim yaptı"
    ) {
      return message.reply(
        "Lynox9380 kurdu."
      );
    }

    if (
      normalized ===
      "yapay zeka altyapısı"
    ) {
      return message.reply(
        "Axera League"
      );
    }

    /*
     * AI kanalı
     */
    if (
      message.channel.id ===
      IDS.channels.ai
    ) {
      return aiReply(
        message,
        raw
      );
    }

    /*
     * Normal komut kontrolü
     */
    if (!raw.startsWith(".")) {
      return;
    }

    const withoutPrefix =
      raw.slice(1).trim();

    if (!withoutPrefix) return;

    const parts =
      withoutPrefix.split(/\s+/);

    const cmd =
      normalize(parts.shift());

    const args = parts;

    /* =====================================================
       KAYIT
       ===================================================== */

    if (cmd === "k") {
      if (
        !hasRole(
          message.member,
          [IDS.roles.kayitYetkilisi]
        ) &&
        !isAdmin(message.member)
      ) {
        return message.reply(
          "❌ Bu komutu yalnızca Kayıt Yetkilisi kullanabilir."
        );
      }

      if (
        !onlyChannel(
          message,
          IDS.channels.kayit
        )
      ) {
        return;
      }

      const target =
        message.mentions.members.first();

      if (!target) {
        return message.reply(
          "❌ Oyuncuyu etiketlemelisin."
        );
      }

      /*
       * .k @Oyuncu İsim
       */
      const nickname =
        args
          .filter(
            x =>
              !/^<@!?\d+>$/.test(x)
          )
          .join(" ")
          .trim();

      if (!nickname) {
        return message.reply(
          "❌ Oyuncunun ismini yazmalısın.\nÖrnek: `.k @Oyuncu L.Yamal`"
        );
      }

      return registerPanel(
        message,
        target,
        nickname
      );
    }

    /* =====================================================
       KAYITSIZ VER
       ===================================================== */

    if (
      cmd === "kayıtsızver" ||
      cmd === "kayitsizver"
    ) {
      if (
        !hasRole(
          message.member,
          [IDS.roles.kayitYetkilisi]
        ) &&
        !isAdmin(message.member)
      ) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const target =
        message.mentions.members.first();

      if (!target) {
        return message.reply(
          "❌ Oyuncuyu etiketle."
        );
      }

      const roles =
        [
          IDS.roles.futbolcu,
          IDS.roles.uye,
          IDS.roles.td,
          IDS.roles.kaleci
        ].filter(Boolean);

      await target.roles
        .remove(
          roles.filter(id =>
            target.roles.cache.has(id)
          )
        )
        .catch(() => {});

      await target.roles
        .add(IDS.roles.kayitsiz)
        .catch(() => {});

      return message.reply(
        `✅ <@${target.id}> **Kayıtsız** yapıldı.`
      );
    }

    /* =====================================================
       ARA
       ===================================================== */

    if (cmd === "ara") {
      const search =
        normalize(args.join(" "));

      if (!search) {
        return message.reply(
          "❌ Aramak istediğin oyuncuyu yaz."
        );
      }

      const members =
        await message.guild.members
          .fetch()
          .catch(() => null);

      if (!members) {
        return message.reply(
          "❌ Üyeler alınamadı."
        );
      }

      const results =
        [...members.values()]
          .filter(member =>
            !member.roles.cache.has(
              IDS.roles.kayitsiz
            )
          )
          .filter(member => {
            const name =
              normalize(
                playerName(member)
              );

            const username =
              normalize(
                member.user.username
              );

            return (
              name.includes(search) ||
              username.includes(search)
            );
          })
          .slice(0, 15);

      if (!results.length) {
        return message.reply(
          "❌ Oyuncu bulunamadı."
        );
      }

      return message.reply({
        embeds: [
          embed(
            "🔎 Oyuncu Arama",
            results
              .map(
                member =>
                  `👤 <@${member.id}> — **${playerName(member)}**`
              )
              .join("\n")
          )
        ]
      });
    }

    /* =====================================================
       DEĞER
       ===================================================== */

    if (cmd === "değer") {
      if (
        !onlyChannel(
          message,
          IDS.channels.deger
        )
      ) {
        return;
      }

      const target =
        message.mentions.members.first() ||
        message.member;

      const value =
        parseNickValue(target);

      return message.reply(
        `💰 **${playerName(target)}** oyuncu değeri: **${money(value)}**`
      );
    }

    /* =====================================================
       DEĞER LİSTE
       ===================================================== */

    if (
      cmd === "değerliste" ||
      cmd === "degerliste"
    ) {
      if (
        !onlyChannel(
          message,
          IDS.channels.deger
        )
      ) {
        return;
      }

      const members =
        await message.guild.members
          .fetch()
          .catch(() => null);

      if (!members) return;

      const list =
        [...members.values()]
          .filter(member =>
            !member.user.bot
          )
          .filter(member =>
            !member.roles.cache.has(
              IDS.roles.kayitsiz
            )
          )
          .map(member => ({
            member,
            value:
              parseNickValue(member)
          }))
          .sort(
            (a, b) =>
              b.value - a.value
          )
          .slice(0, 10);

      const text =
        list.length
          ? list
              .map(
                (x, i) =>
                  `**${i + 1}.** <@${x.member.id}> — **${money(x.value)}**`
              )
              .join("\n")
          : "Kayıtlı oyuncu bulunmuyor.";

      return message.reply({
        embeds: [
          embed(
            "💰 En Değerli Oyuncular",
            text
          )
        ]
      });
    }

    /* =====================================================
       DVER
       ===================================================== */

    if (
      cmd === "dver" ||
      cmd === "değerver"
    ) {
      if (
        !isValueStaff(message.member)
      ) {
        return message.reply(
          "❌ Bu komutu yalnızca Değer Yetkilisi kullanabilir."
        );
      }

      const target =
        message.mentions.members.first();

      const amount =
        amountArg(
          args.find(
            x =>
              !/^<@!?\d+>$/.test(x)
          )
        );

      if (!target || !amount) {
        return message.reply(
          "❌ Kullanım: `.dver @Oyuncu 5M`"
        );
      }

      const result =
        await changePlayerValue(
          target,
          amount,
          "Değer verme"
        );

      return message.reply(
        `✅ **${playerName(target)}** değerine **+${money(amount)}** eklendi.\n` +
        `💰 Yeni değer: **${money(result.newValue)}**`
      );
    }

    /* =====================================================
       DSİL
       ===================================================== */

    if (
      cmd === "dsil" ||
      cmd === "değersil"
    ) {
      if (
        !isValueStaff(message.member)
      ) {
        return message.reply(
          "❌ Bu komutu yalnızca Değer Yetkilisi kullanabilir."
        );
      }

      const target =
        message.mentions.members.first();

      const amount =
        amountArg(
          args.find(
            x =>
              !/^<@!?\d+>$/.test(x)
          )
        );

      if (!target || !amount) {
        return message.reply(
          "❌ Kullanım: `.dsil @Oyuncu 5M`"
        );
      }

      const result =
        await changePlayerValue(
          target,
          -amount,
          "Değer silme"
        );

      return message.reply(
        `✅ **${playerName(target)}** değerinden **-${money(amount)}** çıkarıldı.\n` +
        `💰 Yeni değer: **${money(result.newValue)}**`
      );
    }

    /* =====================================================
       ANTRENMAN
       ===================================================== */

    if (
      cmd === "ant" ||
      cmd === "antrenman"
    ) {
      return doTraining(message);
    }

    /* =====================================================
       PENALTI
       ===================================================== */

    if (
      cmd === "pen" ||
      cmd === "penaltı" ||
      cmd === "penalti"
    ) {
      return doPenalty(message);
    }

    /* =====================================================
       TWEET
       ===================================================== */

    if (cmd === "tweet") {
      return doTweet(
        message,
        args.join(" ")
      );
    }

    /* =====================================================
       TAKIM EKLE
       ===================================================== */

    if (cmd === "takımekle") {
      if (!isMatchStaff(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const role =
        message.mentions.roles.first();

      const name =
        role?.name ||
        args
          .filter(
            x =>
              !/^<@&\d+>$/.test(x)
          )
          .join(" ")
          .trim();

      if (!name) {
        return message.reply(
          "❌ Takım adı veya takım rolü belirt."
        );
      }

      const existing =
        teamByName(name);

      if (
        existing &&
        db.teams[existing]
      ) {
        return message.reply(
          `⚠️ **${existing}** zaten lige ekli.`
        );
      }

      ensureTeam(
        name,
        role?.id || IDS.teams[name]
      );

      saveData();

      return message.reply(
        `✅ **${name}** lige eklendi.`
      );
    }

    /* =====================================================
       TAKIM KALDIR
       ===================================================== */

    if (
      cmd === "takımkaldır" ||
      cmd === "takimkaldir"
    ) {
      if (!isMatchStaff(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const role =
        message.mentions.roles.first();

      const name =
        role?.name ||
        teamByName(
          args.join(" ")
        );

      if (!name) {
        return message.reply(
          "❌ Takım belirt."
        );
      }

      const actual =
        teamByName(name) || name;

      if (IDS.teams[actual]) {
        db.teams[actual] = {
          players: [],
          score: 0,
          gd: 0,
          gf: 0,
          ga: 0,
          roleId: IDS.teams[actual],
          teamValue: 0,
          ilk11: {}
        };
      } else {
        delete db.teams[actual];
      }

      saveData();

      return message.reply(
        `✅ **${actual}** ligden kaldırıldı.`
      );
    }

    /* =====================================================
       PUAN EKLE
       ===================================================== */

    if (
      cmd === "puanekle"
    ) {
      if (!isMatchStaff(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const role =
        message.mentions.roles.first();

      const teamName =
        role?.name ||
        teamByName(
          args
            .filter(
              x =>
                !/^<@&\d+>$/.test(x) &&
                !/^\d+$/.test(x)
            )
            .join(" ")
        );

      const amount =
        Number(args.at(-1));

      if (
        !teamName ||
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        return message.reply(
          "❌ Kullanım: `.puanekle @Takım 3`"
        );
      }

      ensureTeam(teamName).score +=
        amount;

      saveData();

      return message.reply(
        `✅ **${teamName}** takımına **+${amount} puan** eklendi.`
      );
    }

    /* =====================================================
       TAKIM DEĞER
       ===================================================== */

    if (
      cmd === "takımdeğer" ||
      cmd === "takimdeger"
    ) {
      if (!isMatchStaff(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const role =
        message.mentions.roles.first();

      const amount =
        amountArg(args.at(-1));

      const teamName =
        role?.name ||
        teamByName(
          args
            .filter(
              x =>
                !/^<@&\d+>$/.test(x) &&
                x !== args.at(-1)
            )
            .join(" ")
        );

      if (
        !teamName ||
        !amount
      ) {
        return message.reply(
          "❌ Kullanım: `.takımdeğer @Takım 850M`"
        );
      }

      ensureTeam(teamName).teamValue =
        Math.min(1000, amount);

      saveData();

      return message.reply(
        `✅ **${teamName}** takım değeri: **${money(amount)}**`
      );
    }

    /* =====================================================
       FORMASYON
       ===================================================== */

    if (cmd === "formasyon") {
      if (!isMatchStaff(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const role =
        message.mentions.roles.first();

      const teamName =
        role?.name ||
        teamByName(
          args.join(" ")
        );

      if (!teamName) {
        return message.reply(
          "❌ Takım belirt."
        );
      }

      const menu =
        new StringSelectMenuBuilder()
          .setCustomId(
            `formation_${normalize(teamName)}`
          )
          .setPlaceholder(
            "Formasyon seç"
          )
          .addOptions(
            FORMATIONS.map(
              formation => ({
                label: formation,
                value: formation,
                description:
                  `${formationCount(formation)} oyunculu sistem`
              })
            )
          );

      return message.reply({
        embeds: [
          embed(
            "⚽ Formasyon",
            `**${teamName}** için formasyon seç.`
          )
        ],
        components: [
          new ActionRowBuilder().addComponents(
            menu
          )
        ]
      });
    }

    /* =====================================================
       PUAN
       ===================================================== */

    if (cmd === "puan") {
      postStandings(
        message.guild
      );

      return message.reply(
        `✅ Puan durumu <#${IDS.channels.puan}> kanalına gönderildi.`
      );
    }

    /* =====================================================
       İLK 11
       ===================================================== */

    if (
      cmd === "ilk11"
    ) {
      if (!isMatchStaff(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const role =
        message.mentions.roles.first();

      const teamName =
        role?.name ||
        teamByName(
          args.join(" ")
        );

      if (!teamName) {
        return message.reply(
          "❌ Takım belirt."
        );
      }

      const players =
        getFirst11(
          message.guild,
          teamName
        );

      const text =
        players.map(
          p =>
            `${p.label}: ${
              p.member
                ? `<@${p.member.id}>`
                : "Boş"
            }`
        ).join("\n");

      return message.reply({
        embeds: [
          embed(
            `⚽ ${teamName} İlk 11`,
            text
          )
        ]
      });
    }

    /* =====================================================
       İLK 11 EKLE
       ===================================================== */

    if (
      cmd === "ilk11ekle"
    ) {
      if (!isMatchStaff(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const roles =
        [...message.mentions.roles.values()];

      const members =
        [...message.mentions.members.values()];

      if (
        roles.length < 1 ||
        members.length < 1 ||
        !args.at(-1)
      ) {
        return message.reply(
          "❌ Kullanım: `.ilk11ekle @Takım @Oyuncu pozisyon`"
        );
      }

      const teamName =
        roles[0].name;

      const player =
        members[0];

      const position =
        normalize(
          args.at(-1)
        );

      const positionMap = {
        kaleci: "kaleci",

        defans1: "defans1",
        defans2: "defans2",
        defans3: "defans3",
        defans4: "defans4",

        orta1: "orta1",
        orta2: "orta2",
        orta3: "orta3",

        forvet1: "forvet1",
        forvet2: "forvet2",
        forvet3: "forvet3"
      };

      const key =
        positionMap[position];

      if (!key) {
        return message.reply(
          "❌ Pozisyon: `kaleci`, `defans1-4`, `orta1-3`, `forvet1-3`"
        );
      }

      ensureTeam(teamName).ilk11[key] =
        player.id;

      saveData();

      return message.reply(
        `✅ <@${player.id}> **${teamName}** İlk 11'de **${key}** pozisyonuna eklendi.`
      );
    }

    /* =====================================================
       İLK 11 ÇIKAR
       ===================================================== */

    if (
      cmd === "ilk11çıkar" ||
      cmd === "ilk11cikar"
    ) {
      if (!isMatchStaff(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const role =
        message.mentions.roles.first();

      const player =
        message.mentions.members.first();

      if (!role || !player) {
        return message.reply(
          "❌ Kullanım: `.ilk11çıkar @Takım @Oyuncu`"
        );
      }

      const team =
        ensureTeam(role.name);

      for (const key of Object.keys(
        team.ilk11 || {}
      )) {
        if (
          team.ilk11[key] ===
          player.id
        ) {
          delete team.ilk11[key];
        }
      }

      saveData();

      return message.reply(
        `✅ <@${player.id}> **${role.name}** İlk 11'den çıkarıldı.`
      );
    }

    /* =====================================================
       MAÇ
       ===================================================== */

    if (cmd === "maç" || cmd === "mac") {
      if (!isMatchStaff(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      if (
        !onlyChannel(
          message,
          IDS.channels.mac
        )
      ) {
        return;
      }

      const roles =
        [...message.mentions.roles.values()];

      if (roles.length < 2) {
        return message.reply(
          "❌ İki takım rolünü etiketle.\nÖrnek: `.maç @Barcelona @Real Madrid`"
        );
      }

      const teamA =
        roles[0].name;

      const teamB =
        roles[1].name;

      if (teamA === teamB) {
        return message.reply(
          "❌ Aynı takım kendisiyle oynayamaz."
        );
      }

      return runMatch(
        message.guild,
        teamA,
        teamB
      );
    }

    /* =====================================================
       FİKSTÜR EKLE
       ===================================================== */

    if (
      cmd === "fiksturekle"
    ) {
      if (!isMatchStaff(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const roles =
        [...message.mentions.roles.values()];

      const date =
        args.find(
          x =>
            /^\d{4}-\d{2}-\d{2}$/.test(x)
        );

      const time =
        args.find(
          x =>
            /^\d{2}:\d{2}$/.test(x)
        );

      const names =
        args
          .filter(
            x =>
              !/^\d{4}-\d{2}-\d{2}$/.test(x) &&
              !/^\d{2}:\d{2}$/.test(x)
          )
          .map(x => teamByName(x))
          .filter(Boolean);

      const teamA =
        roles[0]?.name ||
        names[0];

      const teamB =
        roles[1]?.name ||
        names[1];

      if (
        !teamA ||
        !teamB ||
        !date ||
        !time
      ) {
        return message.reply(
          "❌ Kullanım: `.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`"
        );
      }

      const timestamp =
        parseFixtureDate(
          date,
          time
        );

      if (!timestamp) {
        return message.reply(
          "❌ Tarih veya saat geçersiz."
        );
      }

      db.fixtures.push({
        id: db.nextFixtureId++,
        guildId:
          message.guild.id,
        a: teamA,
        b: teamB,
        date,
        time,
        timestamp,
        started: false
      });

      saveData();

      return message.reply(
        `✅ **${teamA} - ${teamB}** fikstüre eklendi.\n📅 ${date} ${time}`
      );
    }

    /* =====================================================
       FİKSTÜR LİSTE
       ===================================================== */

    if (
      cmd === "fikstür" ||
      cmd === "fikstur"
    ) {
      const list =
        db.fixtures
          .filter(
            f =>
              f.guildId ===
                message.guild.id &&
              !f.started
          )
          .sort(
            (a, b) =>
              a.timestamp -
              b.timestamp
          )
          .slice(0, 30);

      const text =
        list.length
          ? list
              .map(
                f =>
                  `📅 **${f.date} ${f.time}** — **${f.a} - ${f.b}**`
              )
              .join("\n")
          : "Fikstür boş.";

      return message.reply({
        embeds: [
          embed(
            "📅 Axera League Fikstür",
            text
          )
        ]
      });
    }

    /* =====================================================
       FİKSTÜR ÇIKAR
       ===================================================== */

    if (
      cmd === "fiksturcikar"
    ) {
      if (!isMatchStaff(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const roles =
        [...message.mentions.roles.values()];

      const names =
        args
          .map(x => teamByName(x))
          .filter(Boolean);

      const teamA =
        roles[0]?.name ||
        names[0];

      const teamB =
        roles[1]?.name ||
        names[1];

      if (!teamA || !teamB) {
        return message.reply(
          "❌ İki takım belirt."
        );
      }

      const index =
        db.fixtures.findIndex(
          f =>
            f.guildId ===
              message.guild.id &&
            !f.started &&
            f.a === teamA &&
            f.b === teamB
        );

      if (index === -1) {
        return message.reply(
          "❌ Fikstür bulunamadı."
        );
      }

      db.fixtures.splice(
        index,
        1
      );

      saveData();

      return message.reply(
        `✅ **${teamA} - ${teamB}** fikstürden çıkarıldı.`
      );
    }

    /* =====================================================
       BÜTÇE EKLE / SİL
       ===================================================== */

    if (
      cmd === "bütçeekle" ||
      cmd === "butceekle" ||
      cmd === "bütçesil" ||
      cmd === "butcesil"
    ) {
      if (!isValueStaff(message.member)) {
        return message.reply(
          "❌ Bu komutu yalnızca Değer Yetkilisi kullanabilir."
        );
      }

      const target =
        message.mentions.members.first();

      const amount =
        amountArg(args.at(-1));

      if (!target || !amount) {
        return message.reply(
          "❌ Kullanım: `.bütçeekle @Oyuncu 5M`"
        );
      }

      const user =
        ensureUser(target);

      if (
        cmd === "bütçeekle" ||
        cmd === "butceekle"
      ) {
        user.budget += amount;
      } else {
        user.budget =
          Math.max(
            0,
            user.budget - amount
          );
      }

      saveData();

      return message.reply(
        `💳 **${playerName(target)}** kişisel bütçesi: **${money(user.budget)}**`
      );
    }

    /* =====================================================
       GÖNDER
       ===================================================== */

    if (cmd === "gönder" || cmd === "gonder") {
      const target =
        message.mentions.members.first();

      const amount =
        amountArg(args.at(-1));

      if (!target || !amount) {
        return message.reply(
          "❌ Kullanım: `.gönder @Oyuncu 5M`"
        );
      }

      if (
        target.id ===
        message.author.id
      ) {
        return message.reply(
          "❌ Kendine bütçe gönderemezsin."
        );
      }

      const sender =
        ensureUser(
          message.member
        );

      const receiver =
        ensureUser(target);

      if (
        sender.budget <
        amount
      ) {
        return message.reply(
          "❌ Yeterli kişisel bütçen yok."
        );
      }

      sender.budget -= amount;
      receiver.budget += amount;

      saveData();

      return message.reply(
        `✅ **${money(amount)}** <@${target.id}> oyuncusuna gönderildi.`
      );
    }

    /* =====================================================
       ROL VER
       SADECE YÖNETİCİ
       ===================================================== */

    if (cmd === "rolver") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Bu komutu yalnızca Yöneticiler kullanabilir."
        );
      }

      const target =
        message.mentions.members.first();

      const role =
        message.mentions.roles.first();

      if (!target || !role) {
        return message.reply(
          "❌ Kullanım: `.rolver @Oyuncu @Rol`"
        );
      }

      await target.roles
        .add(role)
        .catch(() => {});

      return message.reply(
        `✅ <@${target.id}> kullanıcısına **${role.name}** rolü verildi.`
      );
    }

    /* =====================================================
       ROL AL
       ===================================================== */

    if (cmd === "rolal") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Bu komutu yalnızca Yöneticiler kullanabilir."
        );
      }

      const target =
        message.mentions.members.first();

      const role =
        message.mentions.roles.first();

      if (!target || !role) {
        return message.reply(
          "❌ Kullanım: `.rolal @Oyuncu @Rol`"
        );
      }

      await target.roles
        .remove(role)
        .catch(() => {});

      return message.reply(
        `✅ <@${target.id}> kullanıcısından **${role.name}** rolü alındı.`
      );
    }

    /* =====================================================
       ROL VER HEPSİ
       KULLANIM:
       .rolverhepsi @roladı
       ===================================================== */

    if (cmd === "rolverhepsi") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Bu komutu yalnızca Yöneticiler kullanabilir."
        );
      }

      const role =
        message.mentions.roles.first();

      if (!role) {
        return message.reply(
          "❌ Kullanım: `.rolverhepsi @Rol`"
        );
      }

      if (
        role.position >=
        message.guild.members.me.roles.highest.position
      ) {
        return message.reply(
          "❌ Bot bu rolü veremiyor. Rol, botun en yüksek rolünün altında olmalı."
        );
      }

      await message.guild.members
        .fetch()
        .catch(() => null);

      let count = 0;

      for (
        const member
        of message.guild.members.cache.values()
      ) {
        if (member.user.bot) continue;
        if (member.roles.cache.has(role.id)) continue;

        await member.roles
          .add(role)
          .then(() => count++)
          .catch(() => {});

        await sleep(50);
      }

      return message.reply(
        `✅ **${count}** kişiye **${role.name}** rolü verildi.`
      );
    }

    /* =====================================================
       ROL AL HEPSİ
       KULLANIM:
       .rolalhepsi @roladı
       ===================================================== */

    if (cmd === "rolalhepsi") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Bu komutu yalnızca Yöneticiler kullanabilir."
        );
      }

      const role =
        message.mentions.roles.first();

      if (!role) {
        return message.reply(
          "❌ Kullanım: `.rolalhepsi @Rol`"
        );
      }

      await message.guild.members
        .fetch()
        .catch(() => null);

      let count = 0;

      for (
        const member
        of message.guild.members.cache.values()
      ) {
        if (member.user.bot) continue;
        if (!member.roles.cache.has(role.id)) continue;

        await member.roles
          .remove(role)
          .then(() => count++)
          .catch(() => {});

        await sleep(50);
      }

      return message.reply(
        `✅ **${count}** kişiden **${role.name}** rolü alındı.`
      );
    }

    /* =====================================================
       ROL PANEL
       ===================================================== */

    if (cmd === "rolpanel") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const roles = [
        [
          IDS.roles.partner,
          "🤝 Partner Ping"
        ],
        [
          IDS.roles.macPing,
          "⚽ Maç Ping"
        ],
        [
          IDS.roles.duyuru,
          "📢 Duyuru Ping"
        ],
        [
          IDS.roles.cekilis,
          "🎁 Çekiliş Ping"
        ],
        [
          IDS.roles.medya,
          "🎥 Medya Ping"
        ]
      ];

      const row =
        new ActionRowBuilder();

      for (
        const [roleId, label]
        of roles
      ) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(
              `role_toggle_${roleId}`
            )
            .setLabel(label)
            .setStyle(
              ButtonStyle.Secondary
            )
        );
      }

      return message.channel.send({
        embeds: [
          embed(
            "🎭 Axera League Rol Paneli",
            "Bildirim almak istediğin rolleri aşağıdaki butonlardan açıp kapatabilirsin."
          )
        ],
        components: [row]
      });
    }

    /* =====================================================
       ŞART
       ===================================================== */

    if (
      cmd === "şart" ||
      cmd === "sart"
    ) {
      return message.reply({
        embeds: [
          embed(
            "📌 Axera League Şartları",
            "✓ Kalıcı Tık: Kalıcı 「✓」 kanalına tıklayınız.\n" +
            "🎭 Rol Al: Rol Al kanalından rollerinizi alınız.\n\n" +
            "ℹ️ Bu bilgiler bilgilendirme amaçlıdır; sistem kullanımını zorunlu olarak engellemez."
          )
        ]
      });
    }

    /* =====================================================
       TICKET PANEL
       ===================================================== */

    if (cmd === "ticketpanel") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const row =
        new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(
                "ticket_create"
              )
              .setLabel(
                "🎫 Destek Talebi Oluştur"
              )
              .setStyle(
                ButtonStyle.Primary
              )
          );

      return message.channel.send({
        embeds: [
          embed(
            "🎫 Axera League Destek",
            "Yardıma ihtiyacın varsa aşağıdaki butona basarak özel destek talebi oluşturabilirsin."
          )
        ],
        components: [row]
      });
    }

    /* =====================================================
       SİL
       ===================================================== */

    if (cmd === "sil") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const amount =
        Math.min(
          Number(args[0]),
          1000
        );

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        return message.reply(
          "❌ Silinecek mesaj sayısını yaz."
        );
      }

      const deleted =
        await message.channel
          .bulkDelete(
            amount,
            true
          )
          .catch(() => null);

      return message.channel
        .send(
          `🧹 **${deleted?.size || 0}** mesaj silindi.`
        )
        .then(msg => {
          setTimeout(
            () =>
              msg.delete().catch(
                () => {}
              ),
            2500
          );
        });
    }

    /* =====================================================
       EMBED
       ===================================================== */

    if (cmd === "embed") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const content =
        raw
          .slice(
            raw
              .toLocaleLowerCase(
                "tr-TR"
              )
              .indexOf(".embed") +
              6
          )
          .trim();

      const [title, description] =
        content
          .split("|")
          .map(x => x.trim());

      if (!title || !description) {
        return message.reply(
          "❌ Kullanım: `.embed Başlık | Açıklama`"
        );
      }

      return message.channel.send({
        embeds: [
          embed(
            title,
            description
          )
        ]
      });
    }

    /* =====================================================
       KICK / BAN / MUTE / UNMUTE
       ===================================================== */

    if (
      [
        "kick",
        "ban",
        "mute",
        "unmute"
      ].includes(cmd)
    ) {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const target =
        message.mentions.members.first();

      if (!target) {
        return message.reply(
          "❌ Oyuncuyu etiketle."
        );
      }

      try {
        if (cmd === "kick") {
          await target.kick(
            "Axera League"
          );
        }

        if (cmd === "ban") {
          await target.ban({
            reason:
              "Axera League"
          });
        }

        if (cmd === "mute") {
          await target.timeout(
            28 *
              24 *
              60 *
              60 *
              1000,
            "Axera League"
          );
        }

        if (cmd === "unmute") {
          await target.timeout(
            null,
            "Axera League"
          );
        }

        return message.reply(
          `✅ **${cmd}** işlemi tamamlandı.`
        );
      } catch (err) {
        return message.reply(
          `❌ İşlem gerçekleştirilemedi: ${err.message}`
        );
      }
    }

    /* =====================================================
       DM
       ===================================================== */

    if (cmd === "dm") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const target =
        message.mentions.members.first();

      const text =
        args
          .filter(
            x =>
              !/^<@!?\d+>$/.test(x)
          )
          .join(" ")
          .trim();

      if (!target || !text) {
        return message.reply(
          "❌ Kullanım: `.dm @Oyuncu mesaj`"
        );
      }

      try {
        await target.send(text);

        return message.reply(
          "✅ DM gönderildi."
        );
      } catch {
        return message.reply(
          "❌ Oyuncuya DM gönderilemedi."
        );
      }
    }

    /* =====================================================
       AI KOMUTU
       ===================================================== */

    if (
      cmd === "ai" ||
      cmd === "yapayzeka"
    ) {
      const question =
        args.join(" ");

      if (!question) {
        return message.reply(
          "❌ Sorunu yaz."
        );
      }

      return aiReply(
        message,
        question
      );
    }
  }
);

/* =========================================================
   BUTTON INTERACTIONS
   ========================================================= */

client.on(
  "interactionCreate",
  async interaction => {
    if (!interaction.isButton()) {
      if (
        interaction.isStringSelectMenu()
      ) {
        /* ================================================
           FORMASYON
           ================================================ */

        if (
          interaction.customId.startsWith(
            "formation_"
          )
        ) {
          if (
            !isMatchStaff(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Yetkin yok.",
              ephemeral: true
            });
          }

          const teamKey =
            interaction.customId
              .replace(
                "formation_",
                ""
              );

          const teamName =
            teamByName(teamKey) ||
            Object.keys(
              db.teams
            ).find(
              x =>
                normalize(x) ===
                normalize(teamKey)
            );

          const formation =
            interaction.values[0];

          if (!teamName) {
            return interaction.reply({
              content:
                "❌ Takım bulunamadı.",
              ephemeral: true
            });
          }

          ensureTeam(
            teamName
          );

          db.formations[
            teamName
          ] = formation;

          saveData();

          return interaction.update({
            embeds: [
              embed(
                "✅ Formasyon Güncellendi",
                `⚽ **${teamName}**\n📐 Formasyon: **${formation}**`
              )
            ],
            components: []
          });
        }

        return;
      }

      return;
    }

    /* =====================================================
       KAYIT BUTONLARI
       ===================================================== */

    if (
      interaction.customId.startsWith(
        "register_"
      )
    ) {
      if (
        !isAdmin(
          interaction.member
        ) &&
        !hasRole(
          interaction.member,
          [IDS.roles.kayitYetkilisi]
        )
      ) {
        return interaction.reply({
          content:
            "❌ Bu paneli yalnızca Kayıt Yetkilisi kullanabilir.",
          ephemeral: true
        });
      }

      const parts =
        interaction.customId.split("_");

      const type =
        parts[1];

      return finishRegister(
        interaction,
        type
      );
    }

    /* =====================================================
       ROL PANEL BUTONLARI
       ===================================================== */

    if (
      interaction.customId.startsWith(
        "role_toggle_"
      )
    ) {
      const roleId =
        interaction.customId.replace(
          "role_toggle_",
          ""
        );

      const role =
        interaction.guild.roles.cache.get(
          roleId
        );

      if (!role) {
        return interaction.reply({
          content:
            "❌ Rol bulunamadı.",
          ephemeral: true
        });
      }

      if (
        interaction.member.roles.cache.has(
          roleId
        )
      ) {
        await interaction.member.roles
          .remove(role)
          .catch(() => {});

        return interaction.reply({
          content:
            `❌ **${role.name}** rolü kaldırıldı.`,
          ephemeral: true
        });
      }

      await interaction.member.roles
        .add(role)
        .catch(() => {});

      return interaction.reply({
        content:
          `✅ **${role.name}** rolü verildi.`,
        ephemeral: true
      });
    }

    /* =====================================================
       TICKET OLUŞTUR
       ===================================================== */

    if (
      interaction.customId ===
      "ticket_create"
    ) {
      return createTicket(
        interaction
      );
    }

    /* =====================================================
       TICKET KAPAT
       ===================================================== */

    if (
      interaction.customId ===
      "ticket_close"
    ) {
      const ticket =
        db.tickets[
          interaction.channel.id
        ];

      if (!ticket) {
        return interaction.reply({
          content:
            "❌ Ticket kaydı bulunamadı.",
          ephemeral: true
        });
      }

      if (
        interaction.user.id !==
          ticket.userId &&
        !isAdmin(
          interaction.member
        ) &&
        !hasRole(
          interaction.member,
          [IDS.roles.moderator]
        )
      ) {
        return interaction.reply({
          content:
            "❌ Bu ticketı kapatma yetkin yok.",
          ephemeral: true
        });
      }

      ticket.open = false;

      saveData();

      await interaction.reply(
        "🔒 Ticket kapatılıyor..."
      );

      setTimeout(
        () =>
          interaction.channel
            .delete()
            .catch(() => {}),
        1000
      );

      return;
    }
  }
);

/* =========================================================
   YENİ ÜYE
   ========================================================= */

client.on(
  "guildMemberAdd",
  async member => {
    if (member.user.bot) return;

    await member.roles
      .add(IDS.roles.kayitsiz)
      .catch(() => {});

    ensureUser(member);
    saveData();
  }
);

/* =========================================================
   ZAMANLAYICILAR
   ========================================================= */

setInterval(
  async () => {
    await startDueFixtures()
      .catch(console.error);

    /*
     * Ticket:
     * 60 dakika boyunca mesaj yoksa kapanır.
     */
    for (
      const [channelId, ticket]
      of Object.entries(db.tickets)
    ) {
      if (!ticket.open) continue;

      if (
        Date.now() -
          Number(
            ticket.lastMessage || 0
          ) >
        60 * 60 * 1000
      ) {
        ticket.open = false;

        saveData();

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

    /*
     * Durum mesajı:
     * 00 ve 30. dakikalar.
     */
    const now =
      new Date();

    const key =
      `${now.getFullYear()}-` +
      `${now.getMonth()}-` +
      `${now.getDate()}-` +
      `${now.getHours()}-` +
      `${now.getMinutes()}`;

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
   HATALAR
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
