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
   VERİTABANI
   ========================================================= */

const DATA_FILE = path.join(__dirname, "data.json");

const DEFAULT = {
  users: {},
  teams: {},
  fixtures: [],
  nextFixtureId: 1,
  activeMatches: {},
  registrationPanels: {},
  tickets: {},
  formations: {},
  tweetCooldowns: {},
  matchHistory: {},
  rolePanel: null
};

function defaultData() {
  return JSON.parse(JSON.stringify(DEFAULT));
}

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return defaultData();
    }

    const data = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );

    return {
      ...defaultData(),
      ...data
    };
  } catch (error) {
    console.error("data.json okunamadı:", error);
    return defaultData();
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
  } catch (error) {
    console.error("data.json kaydedilemedi:", error);
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
   GENEL YARDIMCILAR
   ========================================================= */

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

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
  return Boolean(
    member?.roles?.cache?.some(role =>
      roleIds.filter(Boolean).includes(role.id)
    )
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

function isValueStaff(member) {
  return Boolean(
    isAdmin(member) ||
    hasRole(member, [IDS.roles.deger])
  );
}

function isMatchStaff(member) {
  return Boolean(
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

  return v >= 1000
    ? "1B€"
    : `${Math.round(v)}M€`;
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

  if (
    !Number.isFinite(number) ||
    number <= 0
  ) {
    return null;
  }

  return number;
}

function mentionMember(message) {
  return message.mentions.members.first() || null;
}

function playerName(member) {
  return (
    member?.nickname ||
    member?.displayName ||
    member?.user?.username ||
    "Oyuncu"
  );
}

/* =========================================================
   OYUNCU DEĞER SİSTEMİ
   Değer nickname'den okunur.
   ========================================================= */

function parseNickValue(member) {
  const nickname =
    member?.nickname ||
    member?.displayName ||
    "";

  if (/1B€\s*$/i.test(nickname)) {
    return 1000;
  }

  const match =
    nickname.match(
      /(\d+(?:\.\d+)?)M€\s*$/i
    );

  return match
    ? Number(match[1]) || 0
    : 0;
}

function setNickValue(oldNickname, value) {
  let base =
    String(oldNickname || "")
      .trim()
      .replace(
        /\s*(?:\d+(?:\.\d+)?M|1B)€\s*$/i,
        ""
      )
      .trim();

  if (!base) {
    base = "Oyuncu";
  }

  const suffix = money(value);
  const separator = " | ";

  const maxBase =
    32 -
    separator.length -
    suffix.length;

  base = base.slice(
    0,
    Math.max(1, maxBase)
  );

  return `${base}${separator}${suffix}`;
}

async function safeSetNickname(
  member,
  nickname
) {
  if (!member?.manageable) {
    return false;
  }

  try {
    await member.setNickname(nickname);
    return true;
  } catch (error) {
    console.error(
      "Nickname değiştirilemedi:",
      error.message
    );

    return false;
  }
}

function ensureUser(member) {
  if (!db.users[member.id]) {
    db.users[member.id] = {
      name: playerName(member),
      value: parseNickValue(member),
      budget: 0
    };
  }

  const user = db.users[member.id];

  if (!Number.isFinite(Number(user.budget))) {
    user.budget = 0;
  }

  /*
   * Nickname değerini ana kaynak olarak kullan.
   */
  user.value = parseNickValue(member);

  return user;
}

async function changePlayerValue(
  member,
  delta,
  reason = ""
) {
  if (!member) return null;

  /*
   * Her değişiklikten önce değer nickname'den okunur.
   */
  const current = parseNickValue(member);

  const next = Math.min(
    1000,
    Math.max(
      0,
      current + Number(delta || 0)
    )
  );

  const oldNickname =
    member.nickname ||
    member.displayName ||
    "Oyuncu";

  const newNickname =
    setNickValue(
      oldNickname,
      next
    );

  await safeSetNickname(
    member,
    newNickname
  );

  const user =
    ensureUser(member);

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

function ensureTeam(
  name,
  roleId = null
) {
  if (!db.teams[name]) {
    db.teams[name] = {
      players: [],
      score: 0,
      gd: 0,
      gf: 0,
      ga: 0,
      roleId:
        roleId ||
        IDS.teams[name] ||
        null,
      teamValue: 0,
      ilk11: {}
    };
  }

  const team = db.teams[name];

  if (!team.ilk11) {
    team.ilk11 = {};
  }

  if (!team.players) {
    team.players = [];
  }

  if (!Number.isFinite(Number(team.score))) {
    team.score = 0;
  }

  if (!Number.isFinite(Number(team.gd))) {
    team.gd = 0;
  }

  if (!Number.isFinite(Number(team.gf))) {
    team.gf = 0;
  }

  if (!Number.isFinite(Number(team.ga))) {
    team.ga = 0;
  }

  if (roleId) {
    team.roleId = roleId;
  }

  return team;
}

function teamRole(
  guild,
  teamName
) {
  const roleId =
    IDS.teams[teamName] ||
    db.teams[teamName]?.roleId;

  if (!roleId) return null;

  return guild.roles.cache.get(
    roleId
  ) || null;
}

function teamByName(value) {
  const search = normalize(value);

  if (!search) return null;

  const names = [
    ...new Set([
      ...Object.keys(IDS.teams),
      ...Object.keys(db.teams)
    ])
  ];

  const exact = names.find(
    name =>
      normalize(name) === search
  );

  if (exact) return exact;

  return names.find(name => {
    const normalized =
      normalize(name);

    return (
      normalized.includes(search) ||
      search.includes(normalized)
    );
  }) || null;
}

function teamMembers(
  guild,
  teamName
) {
  const role =
    teamRole(guild, teamName);

  if (!role) return [];

  return [
    ...role.members.values()
  ].filter(
    member => !member.user.bot
  );
}

function teamPlayers(
  guild,
  teamName
) {
  const team =
    ensureTeam(teamName);

  const manual =
    team.players
      .map(p =>
        guild.members.cache.get(
          p.id
        )
      )
      .filter(Boolean);

  const rolePlayers =
    teamMembers(
      guild,
      teamName
    );

  return [
    ...new Map(
      [...manual, ...rolePlayers]
        .map(member => [
          member.id,
          member
        ])
    ).values()
  ];
}

/* =========================================================
   PUAN
   ========================================================= */

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

async function postStandings(
  guild
) {
  const channel =
    guild.channels.cache.get(
      IDS.channels.puan
    );

  if (!channel) return;

  const names = [
    ...new Set([
      ...Object.keys(IDS.teams),
      ...Object.keys(db.teams)
    ])
  ];

  const sorted =
    names
      .map(name => [
        name,
        ensureTeam(name)
      ])
      .sort((a, b) => {
        if (
          b[1].score !==
          a[1].score
        ) {
          return (
            b[1].score -
            a[1].score
          );
        }

        if (
          b[1].gd !==
          a[1].gd
        ) {
          return (
            b[1].gd -
            a[1].gd
          );
        }

        return (
          b[1].gf -
          a[1].gf
        );
      });

  const text =
    sorted.length
      ? sorted
          .map(
            ([name, data], index) =>
              `**${index + 1}. ${name}** — ${data.score} P | AV: ${data.gd} | AG: ${data.gf} | YG: ${data.ga}`
          )
          .join("\n")
      : "Henüz takım bulunmuyor.";

  await channel.send({
    embeds: [
      embed(
        "🏆 Axera League Puan Durumu",
        text,
        0xfee75c
      )
    ]
  });
}

/* =========================================================
   İLK 11
   ========================================================= */

const FIRST11_POSITIONS = [
  ["kaleci", "🧤 Kaleci"],
  ["defans1", "🛡️ Defans 1"],
  ["defans2", "🛡️ Defans 2"],
  ["defans3", "🛡️ Defans 3"],
  ["defans4", "🛡️ Defans 4"],
  ["orta1", "⚙️ Orta Saha 1"],
  ["orta2", "⚙️ Orta Saha 2"],
  ["orta3", "⚙️ Orta Saha 3"],
  ["forvet1", "⚽ Forvet 1"],
  ["forvet2", "⚽ Forvet 2"],
  ["forvet3", "⚽ Forvet 3"]
];

function first11Text(
  guild,
  teamName
) {
  const team =
    ensureTeam(teamName);

  const ilk11 =
    team.ilk11 || {};

  return FIRST11_POSITIONS
    .map(([key, label]) => {
      const id =
        ilk11[key];

      const member =
        id
          ? guild.members.cache.get(id)
          : null;

      return `${label}: ${
        member
          ? `<@${member.id}>`
          : "Boş"
      }`;
    })
    .join("\n");
}

function getMatchPlayers(
  guild,
  teamName
) {
  const team =
    ensureTeam(teamName);

  const ilk11 =
    team.ilk11 || {};

  const ids =
    FIRST11_POSITIONS
      .map(
        ([key]) =>
          ilk11[key]
      )
      .filter(Boolean);

  if (
    ids.length ===
    FIRST11_POSITIONS.length
  ) {
    const players =
      ids
        .map(id =>
          guild.members.cache.get(
            id
          )
        )
        .filter(Boolean);

    if (
      players.length ===
      FIRST11_POSITIONS.length
    ) {
      return players;
    }
  }

  /*
   * İlk 11 tamamlanmamışsa maç durmaz.
   */
  return teamPlayers(
    guild,
    teamName
  );
}

async function sendFirst11Panel(
  message,
  teamName
) {
  const guild =
    message.guild;

  const playerOptions =
    teamPlayers(
      guild,
      teamName
    )
      .slice(0, 25)
      .map(member => ({
        label:
          playerName(member)
            .slice(0, 100),
        value: member.id
      }));

  const positionOptions =
    FIRST11_POSITIONS.map(
      ([key, label]) => ({
        label:
          label.slice(0, 100),
        value: key
      })
    );

  const posMenu =
    new StringSelectMenuBuilder()
      .setCustomId(
        `ilk11pos_${encodeURIComponent(teamName)}`
      )
      .setPlaceholder(
        "Mevki seç"
      )
      .addOptions(
        positionOptions
      );

  const playerMenu =
    new StringSelectMenuBuilder()
      .setCustomId(
        `ilk11player_${encodeURIComponent(teamName)}`
      )
      .setPlaceholder(
        "Oyuncu seç"
      )
      .addOptions(
        playerOptions.length
          ? playerOptions
          : [{
              label:
                "Oyuncu bulunamadı",
              value:
                "none"
            }]
      );

  const row3 =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            `ilk11_add_${encodeURIComponent(teamName)}`
          )
          .setLabel(
            "➕ Ekle / Değiştir"
          )
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            `ilk11_remove_${encodeURIComponent(teamName)}`
          )
          .setLabel(
            "➖ Mevkiden Çıkar"
          )
          .setStyle(
            ButtonStyle.Danger
          ),

        new ButtonBuilder()
          .setCustomId(
            `ilk11_clear_${encodeURIComponent(teamName)}`
          )
          .setLabel(
            "🗑️ İlk 11'i Temizle"
          )
          .setStyle(
            ButtonStyle.Secondary
          )
      );

  return message.reply({
    embeds: [
      embed(
        `⚽ ${teamName} — İlk 11`,
        `${first11Text(
          guild,
          teamName
        )}\n\n` +
        `Önce mevkiyi ve oyuncuyu seç, ardından işlem butonuna bas.`
      )
    ],
    components: [
      new ActionRowBuilder()
        .addComponents(
          posMenu
        ),
      new ActionRowBuilder()
        .addComponents(
          playerMenu
        ),
      row3
    ]
  });
}

function canManageFirst11(
  member,
  team
) {
  if (
    isAdmin(member) ||
    hasRole(
      member,
      [IDS.roles.spiker]
    )
  ) {
    return true;
  }

  return (
    hasRole(
      member,
      [IDS.roles.td]
    ) &&
    getUserTeams(
      member.guild,
      member
    ).includes(team)
  );
}

function getUserTeams(
  guild,
  member
) {
  const names = [
    ...new Set([
      ...Object.keys(IDS.teams),
      ...Object.keys(db.teams)
    ])
  ];

  return names.filter(name => {
    const role =
      teamRole(
        guild,
        name
      );

    return Boolean(
      role &&
      member.roles.cache.has(
        role.id
      )
    );
  });
}

/* =========================================================
   KAYIT
   ========================================================= */

async function registerPanel(
  message,
  target,
  nickname
) {
  const panel =
    await message.reply({
      embeds: [
        embed(
          "📋 Axera League Kayıt",
          `👤 Oyuncu: <@${target.id}>\n` +
          `🏷️ İsim: **${String(nickname)
            .replace(/[*_`]/g, "")
            .slice(0, 32)}**\n\n` +
          `Oyuncunun rolünü seçiniz.`
        )
      ],
      components: [
        new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(
                "register_futbolcu"
              )
              .setLabel(
                "⚽ Futbolcu"
              )
              .setStyle(
                ButtonStyle.Primary
              ),

            new ButtonBuilder()
              .setCustomId(
                "register_uye"
              )
              .setLabel(
                "👤 Üye"
              )
              .setStyle(
                ButtonStyle.Secondary
              ),

            new ButtonBuilder()
              .setCustomId(
                "register_td"
              )
              .setLabel(
                "🧑‍💼 Teknik Direktör"
              )
              .setStyle(
                ButtonStyle.Success
              ),

            new ButtonBuilder()
              .setCustomId(
                "register_kaleci"
              )
              .setLabel(
                "🧤 Kaleci"
              )
              .setStyle(
                ButtonStyle.Primary
              ),

            new ButtonBuilder()
              .setCustomId(
                "register_cancel"
              )
              .setLabel(
                "❌ İptal"
              )
              .setStyle(
                ButtonStyle.Danger
              )
          )
      ]
    });

  db.registrationPanels[
    panel.id
  ] = {
    userId: target.id,
    nickname:
      String(nickname).slice(
        0,
        32
      ),
    createdBy:
      message.author.id,
    createdAt:
      Date.now()
  };

  saveData();
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

  const roleMap = {
    futbolcu:
      IDS.roles.futbolcu,
    uye:
      IDS.roles.uye,
    td:
      IDS.roles.td,
    kaleci:
      IDS.roles.kaleci
  };

  const selectedRole =
    roleMap[type];

  if (!selectedRole) {
    return interaction.reply({
      content:
        "❌ Geçersiz rol.",
      ephemeral: true
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
      rolesToRemove.filter(
        id =>
          member.roles.cache.has(id)
      )
    )
    .catch(() => {});

  await member.roles
    .add(selectedRole)
    .catch(() => {});

  const user =
    ensureUser(member);

  user.name =
    panel.nickname;

  await safeSetNickname(
    member,
    panel.nickname
  );

  /*
   * Kayıt sonrası nickname'deki değer
   * ana değer olarak kullanılır.
   */
  user.value =
    parseNickValue(member);

  delete db.registrationPanels[
    interaction.message.id
  ];

  saveData();

  const roleName = {
    futbolcu:
      "Futbolcu",
    uye:
      "Üye",
    td:
      "Teknik Direktör",
    kaleci:
      "Kaleci"
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

async function doTraining(
  message
) {
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
    `🏋️ Antrenman tamamlandı!\n` +
    `💰 Ödül: **+1M€**\n` +
    `📈 Yeni değer: **${money(
      result.newValue
    )}**`
  );
}

/* =========================================================
   PENALTI
   ========================================================= */

async function doPenalty(
  message
) {
  if (
    !onlyChannel(
      message,
      IDS.channels.pen
    )
  ) {
    return;
  }

  const random =
    Math.random();

  let result;

  if (random < 0.50) {
    result = "⚽ GOL";
  } else if (random < 0.75) {
    result = "🥅 DİREK";
  } else {
    result = "🧤 KALECİ";
  }

  if (result === "⚽ GOL") {
    const reward =
      await changePlayerValue(
        message.member,
        5,
        "Penaltı gol ödülü"
      );

    return message.reply(
      `🎯 Sonuç: **${result}**\n` +
      `💰 Ödül: **+5M€**\n` +
      `📈 Yeni değer: **${money(
        reward.newValue
      )}**`
    );
  }

  return message.reply(
    `🎯 Sonuç: **${result}**`
  );
}

/* =========================================================
   MAÇ
   3 SANİYE = 1 MAÇ DAKİKASI
   ========================================================= */

async function runMatch(
  guild,
  channel,
  teamA,
  teamB
) {
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

  let scoreA = 0;
  let scoreB = 0;
  let minute = 0;

  const matchId =
    `${Date.now()}_${teamA}_${teamB}`;

  db.activeMatches[
    matchId
  ] = {
    guildId:
      guild.id,
    teamA,
    teamB,
    scoreA: 0,
    scoreB: 0,
    minute: 0,
    startedAt:
      Date.now()
  };

  saveData();

  const matchMessage =
    await channel.send({
      embeds: [
        embed(
          "⚽ AXERA LEAGUE MAÇI",
          `**${teamA} 0 - 0 ${teamB}**\n\n` +
          `⏱️ 3 saniye = 1 dakika\n` +
          `🏟️ Maç başladı!`,
          0x5865f2
        )
      ]
    });

  const events = [];

  const interval =
    setInterval(
      async () => {
        minute++;

        let eventText =
          "⚽ Mücadele devam ediyor.";

        const roll =
          Math.random();

        if (roll < 0.08) {
          const home =
            Math.random() <
            0.5;

          const scoringTeam =
            home
              ? teamA
              : teamB;

          const players =
            home
              ? playersA
              : playersB;

          if (Math.random() < 0.30) {
            if (home) {
              scoreA++;
            } else {
              scoreB++;
            }

            const scorer =
              players.length
                ? players[
                    Math.floor(
                      Math.random() *
                        players.length
                    )
                  ]
                : null;

            eventText =
              `⚽ **GOL!** ${scoringTeam}` +
              (
                scorer
                  ? ` — ${playerName(
                      scorer
                    )}`
                  : ""
              );

            if (scorer) {
              await changePlayerValue(
                scorer,
                2,
                "Maç golü"
              );
            }
          } else {
            eventText =
              `🔥 ${scoringTeam} tehlikeli atak geliştirdi.`;
          }
        } else if (
          roll < 0.16
        ) {
          eventText =
            "🧤 Kaleci kritik kurtarış yaptı!";
        } else if (
          roll < 0.22
        ) {
          eventText =
            "🟨 Hakem faul düdüğünü çaldı.";
        }

        events.push(
          `${minute}' ${eventText}`
        );

        db.activeMatches[
          matchId
        ].scoreA = scoreA;

        db.activeMatches[
          matchId
        ].scoreB = scoreB;

        db.activeMatches[
          matchId
        ].minute = minute;

        saveData();

        await matchMessage
          .edit({
            embeds: [
              embed(
                "⚽ AXERA LEAGUE MAÇI",
                `**${teamA} ${scoreA} - ${scoreB} ${teamB}**\n\n` +
                `⏱️ ${minute}'\n\n` +
                events
                  .slice(-5)
                  .join("\n"),
                0x5865f2
              )
            ]
          })
          .catch(() => {});

        if (minute >= 90) {
          clearInterval(
            interval
          );

          const participants =
            [
              ...new Map(
                [
                  ...playersA,
                  ...playersB
                ].map(
                  member => [
                    member.id,
                    member
                  ]
                )
              ).values()
            ];

          for (
            const player
            of participants
          ) {
            await changePlayerValue(
              player,
              5,
              "Maç katılım ödülü"
            );
          }

          addStandingResult(
            teamA,
            teamB,
            scoreA,
            scoreB
          );

          db.matchHistory[
            matchId
          ] = {
            teamA,
            teamB,
            scoreA,
            scoreB,
            finishedAt:
              Date.now()
          };

          delete db.activeMatches[
            matchId
          ];

          saveData();

          await matchMessage
            .edit({
              embeds: [
                embed(
                  "🏁 MAÇ BİTTİ",
                  `**${teamA} ${scoreA} - ${scoreB} ${teamB}**\n\n` +
                  `💰 Katılan oyunculara **+5M€** verildi.\n` +
                  `📊 Puan durumu güncellendi.`,
                  0x57f287
                )
              ]
            })
            .catch(() => {});

          await postStandings(
            guild
          );
        }
      },
      3000
    );
}

/* =========================================================
   FİKSTÜR
   ========================================================= */

function fixtureTimestamp(
  date,
  time
) {
  const value =
    new Date(
      `${date}T${time}:00+03:00`
    ).getTime();

  return Number.isFinite(value)
    ? value
    : null;
}

async function startDueFixtures() {
  for (
    const fixture
    of db.fixtures
  ) {
    if (fixture.started) {
      continue;
    }

    if (
      Date.now() <
      fixture.timestamp
    ) {
      continue;
    }

    const guild =
      client.guilds.cache.get(
        fixture.guildId
      );

    if (!guild) continue;

    const channel =
      guild.channels.cache.get(
        IDS.channels.mac
      );

    if (!channel) continue;

    fixture.started = true;

    saveData();

    await runMatch(
      guild,
      channel,
      fixture.a,
      fixture.b
    ).catch(console.error);
  }
}

/* =========================================================
   TWEET
   ========================================================= */

async function doTweet(
  message,
  text
) {
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

  await message.delete()
    .catch(() => {});

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
        `${text}\n\n` +
        `— **${playerName(
          message.member
        )}**` +
        rewardText
      )
    ]
  });
}

/* =========================================================
   AI
   ========================================================= */

async function aiAnswer(
  message,
  question
) {
  if (!ai) {
    return message.reply(
      "❌ OPENAI_API_KEY Railway Variables kısmına eklenmemiş."
    );
  }

  try {
    const response =
      await ai.responses.create({
        model:
          "gpt-5.6-luna",

        instructions:
          "Sen Axera League Discord sunucusunun Türkçe yapay zekâ asistanısın. Kısa, anlaşılır ve yardımcı cevaplar ver.",

        input:
          String(question),

        max_output_tokens:
          400
      });

    const answer =
      response.output_text ||
      "❌ Cevap oluşturulamadı.";

    return message.reply(
      answer.slice(0, 1900)
    );
  } catch (error) {
    console.error(
      "AI hatası:",
      error
    );

    return message.reply(
      "❌ Yapay zekâ şu anda cevap veremiyor."
    );
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
    Object.values(
      db.tickets
    ).find(
      ticket =>
        ticket.guildId ===
          guild.id &&
        ticket.userId ===
          interaction.user.id &&
        ticket.open
    );

  if (existing) {
    return interaction.reply({
      content:
        `❌ Zaten açık ticket'ın var: <#${existing.channelId}>`,
      ephemeral: true
    });
  }

  const channel =
    await guild.channels.create({
      name:
        `ticket-${interaction.user.username}`
          .toLowerCase()
          .replace(
            /[^a-z0-9-]/g,
            ""
          )
          .slice(0, 25),

      type:
        ChannelType.GuildText,

      permissionOverwrites: [
        {
          id:
            guild.roles.everyone.id,
          deny: [
            PermissionFlagsBits.ViewChannel
          ]
        },

        {
          id:
            interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        },

        {
          id:
            IDS.roles.moderator,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        },

        {
          id:
            IDS.roles.yonetici,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        }
      ]
    })
    .catch(() => null);

  if (!channel) {
    return interaction.reply({
      content:
        "❌ Ticket oluşturulamadı.",
      ephemeral: true
    });
  }

  db.tickets[
    channel.id
  ] = {
    guildId:
      guild.id,
    userId:
      interaction.user.id,
    channelId:
      channel.id,
    open: true,
    lastMessage:
      Date.now()
  };

  saveData();

  const row =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "ticket_close"
          )
          .setLabel(
            "🔒 Ticket Kapat"
          )
          .setStyle(
            ButtonStyle.Danger
          )
      );

  await channel.send({
    content:
      `<@${interaction.user.id}> <@&${IDS.roles.moderator}>`,
    embeds: [
      embed(
        "🎫 Axera League Ticket",
        "Destek talebini buraya yazabilirsin.\n\n" +
        "60 dakika boyunca mesaj gelmezse ticket otomatik kapanır."
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
   DURUM
   ========================================================= */

async function statusPost() {
  const channel =
    client.channels.cache.get(
      IDS.channels.durum
    );

  if (!channel) return;

  const messages =
    await channel.messages
      .fetch({
        limit: 100
      })
      .catch(() => null);

  if (messages) {
    for (
      const message
      of messages.values()
    ) {
      if (
        message.author.id ===
        client.user.id
      ) {
        await message.delete()
          .catch(() => {});
      }
    }
  }

  const uptime =
    (
      process.uptime() /
      3600
    ).toFixed(2);

  await channel.send({
    embeds: [
      embed(
        "🟢 Axera League Bot Durumu",
        `**Tüm sistemler sorunsuz çalışıyor.**\n\n` +
        `📡 Ping: **${client.ws.ping}ms**\n` +
        `🏠 Sunucu: **${client.guilds.cache.size}**\n` +
        `⏱️ Uptime: **${uptime} saat**`,
        0x57f287
      )
    ]
  });
}

/* =========================================================
   YARDIM KOMUTU
   ========================================================= */

function helpEmbed() {
  return embed(
    "📚 AXERA LEAGUE — KOMUT MERKEZİ",

    `**👤 KAYIT & OYUNCU**

\`.k @Oyuncu İsim\`
→ Oyuncu kayıt paneli açar.

\`.kayıtsızver @Oyuncu\`
→ Oyuncuyu Kayıtsız yapar.

\`.ara Oyuncu\`
→ Kayıtlı oyuncu arar.

\`.değer @Oyuncu\`
→ Oyuncunun mevcut değerini gösterir.

\`.değerliste\`
→ En yüksek değerli 10 oyuncuyu gösterir.


**💰 DEĞER SİSTEMİ**

\`.dver @Oyuncu 5M\`
→ Mevcut değere 5M€ ekler.

\`.dsil @Oyuncu 5M\`
→ Mevcut değerden 5M€ çıkarır.

→ Maksimum oyuncu değeri: **1B€**

→ Değer Discord takma adından okunur.


**🏋️ ANTRENMAN & PENALTI**

\`.ant\`
→ Antrenman yapar ve **+1M€** verir.

\`.antrenman\`
→ Antrenman sistemi.

\`.pen\`
→ Penaltı kullanır.

\`.penaltı\`
→ Penaltı sistemi.

→ GOL sonucu: **+5M€**


**⚽ TAKIM & MAÇ**

\`.takımekle @Takım\`
→ Takımı lige ekler.

\`.takımkaldır @Takım\`
→ Takımı ligden kaldırır.

\`.ilk11 @Takım\`
→ İlk 11 panelini açar.

\`.maç @Takım1 @Takım2\`
→ Maç başlatır.

\`.formasyon @Takım\`
→ Formasyon seçer.

\`.puan\`
→ Puan durumunu günceller.

\`.puanekle @Takım 3\`
→ Takıma puan ekler.

\`.takımdeğer @Takım 850M\`
→ Takım değerini ayarlar.


**📅 FİKSTÜR**

\`.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM\`
→ Fikstür ekler.

\`.fikstür\`
→ Fikstürleri gösterir.

\`.fiksturcikar @Takım1 @Takım2\`
→ Fikstür siler.


**💳 KİŞİSEL BÜTÇE**

\`.bütçeekle @Oyuncu 50M\`
→ Kişisel bütçeye para ekler.

\`.bütçesil @Oyuncu 50M\`
→ Kişisel bütçeden para çıkarır.

\`.gönder @Oyuncu 50M\`
→ Kendi bütçenden oyuncuya gönderir.


**🎫 DESTEK**

\`.ticketpanel\`
→ Ticket paneli oluşturur.

→ Ticket 60 dakika hareketsizlikte kapanır.


**🎭 ROL SİSTEMİ**

\`.rolpanel\`
→ Bildirim rol paneli.

\`.rolver @Oyuncu @Rol\`
→ Rol verir.

\`.rolal @Oyuncu @Rol\`
→ Rol alır.

\`.rolverhepsi @Rol\`
→ Herkese rol verir.

\`.rolalhepsi @Rol\`
→ Herkesten rol alır.


**🛡️ YÖNETİCİ**

\`.sil 10\`
→ Mesaj siler.

\`.embed Başlık | Açıklama\`
→ Embed gönderir.

\`.kick @Oyuncu\`
→ Oyuncuyu atar.

\`.ban @Oyuncu\`
→ Oyuncuyu yasaklar.

\`.mute @Oyuncu\`
→ Oyuncuyu susturur.

\`.unmute @Oyuncu\`
→ Susturmayı kaldırır.

\`.dm @Oyuncu Mesaj\`
→ Oyuncuya özel DM gönderir.


**🐦 DİĞER**

\`.tweet Mesaj\`
→ Tweet sistemi.

\`.şart\`
→ Sunucu şartlarını gösterir.

\`.ai Soru\`
→ Yapay zekâya soru sorar.

\`.yapayzeka Soru\`
→ Yapay zekâ sistemi.


**ℹ️ BİLGİ**

Kayıtsız üyeler normal sistemleri kullanabilir.
Kayıt/kayıtsız rolü oyun sistemlerini kilitlemez.

Yönetim ve yetki komutları yalnızca yetkili rollere açıktır.`,

    0x5865f2
  );
}

/* =========================================================
   MESSAGE CREATE
   ========================================================= */

const PREFIX = ".";

let commandCount = 0;
let lastStatusKey = "";

client.on(
  "messageCreate",
  async message => {
    if (message.author.bot) {
      return;
    }

    /*
     * Ticket aktivitesi
     */
    if (
      db.tickets[
        message.channel.id
      ]?.open
    ) {
      db.tickets[
        message.channel.id
      ].lastMessage =
        Date.now();

      saveData();
    }

    const content =
      message.content.trim();

    if (!content) return;

    /*
     * AI kanalı
     */
    if (
      message.channel.id ===
        IDS.channels.ai &&
      !content.startsWith(PREFIX)
    ) {
      return aiAnswer(
        message,
        content
      );
    }

    /*
     * Özel AI cevapları
     */
    const normalized =
      normalize(content);

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

    if (
      !content.startsWith(
        PREFIX
      )
    ) {
      return;
    }

    const raw =
      content.slice(1).trim();

    const parts =
      raw.split(/\s+/);

    const command =
      normalize(
        parts.shift()
      );

    const args = parts;

    commandCount++;

    /* =====================================================
       .yardım
       ===================================================== */

    if (
      command === "yardım" ||
      command === "yardim"
    ) {
      return message.reply({
        embeds: [
          helpEmbed()
        ]
      });
    }

    /* =====================================================
       KAYIT
       ===================================================== */

    if (command === "k") {
      if (
        !onlyChannel(
          message,
          IDS.channels.kayit
        )
      ) {
        return;
      }

      if (
        !isAdmin(
          message.member
        ) &&
        !hasRole(
          message.member,
          [IDS.roles.kayitYetkilisi]
        )
      ) {
        return message.reply(
          "❌ Bu komutu yalnızca Kayıt Yetkilisi kullanabilir."
        );
      }

      const target =
        mentionMember(message);

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.k @Oyuncu İsim`"
        );
      }

      const nickname =
        content
          .replace(
            /^\.k\s+<@!?\d+>\s*/i,
            ""
          )
          .trim();

      if (!nickname) {
        return message.reply(
          "❌ Oyuncunun ismini yazmalısın."
        );
      }

      return registerPanel(
        message,
        target,
        nickname
      );
    }

    /* =====================================================
       KAYITSIZ
       ===================================================== */

    if (
      command ===
        "kayıtsızver" ||
      command ===
        "kayitsizver"
    ) {
      if (
        !onlyChannel(
          message,
          IDS.channels.kayit
        )
      ) {
        return;
      }

      if (
        !isAdmin(
          message.member
        ) &&
        !hasRole(
          message.member,
          [IDS.roles.kayitYetkilisi]
        )
      ) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const target =
        mentionMember(message);

      if (!target) {
        return message.reply(
          "❌ Oyuncuyu etiketle."
        );
      }

      const roles = [
        IDS.roles.futbolcu,
        IDS.roles.uye,
        IDS.roles.td,
        IDS.roles.kaleci
      ].filter(Boolean);

      await target.roles
        .remove(roles)
        .catch(() => {});

      await target.roles
        .add(
          IDS.roles.kayitsiz
        )
        .catch(() => {});

      return message.reply(
        `✅ <@${target.id}> **Kayıtsız** yapıldı.`
      );
    }

    /* =====================================================
       ARA
       ===================================================== */

    if (command === "ara") {
      const search =
        normalize(
          args.join(" ")
        );

      if (!search) {
        return message.reply(
          "❌ Kullanım: `.ara oyuncu adı`"
        );
      }

      await message.guild.members
        .fetch()
        .catch(() => {});

      const members =
        [
          ...message.guild.members
            .cache.values()
        ]
          .filter(
            member =>
              !member.user.bot
          )
          .filter(
            member =>
              !member.roles.cache.has(
                IDS.roles.kayitsiz
              )
          );

      const results =
        members
          .filter(member => {
            const name =
              normalize(
                playerName(member)
              );

            return (
              name.includes(search)
            );
          })
          .slice(0, 10);

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
                (member, index) =>
                  `**${index + 1}.** <@${member.id}> — **${playerName(member)}** — ${money(parseNickValue(member))}`
              )
              .join("\n")
          )
        ]
      });
    }

    /* =====================================================
       DEĞER
       ===================================================== */

    if (
      command === "değer" ||
      command === "deger"
    ) {
      const target =
        mentionMember(message) ||
        message.member;

      if (
        target.roles.cache.has(
          IDS.roles.kayitsiz
        )
      ) {
        return message.reply(
          "❌ Kayıtlı bir oyuncu belirt."
        );
      }

      return message.reply({
        embeds: [
          embed(
            "💰 Oyuncu Değeri",
            `👤 **${playerName(target)}**\n` +
            `💶 Değer: **${money(
              parseNickValue(
                target
              )
            )}**`,
            0xfee75c
          )
        ]
      });
    }

    /* =====================================================
       DEĞER LİSTE
       ===================================================== */

    if (
      command ===
        "değerliste" ||
      command ===
        "degerliste"
    ) {
      await message.guild.members
        .fetch()
        .catch(() => {});

      const list =
        [
          ...message.guild.members
            .cache.values()
        ]
          .filter(
            member =>
              !member.user.bot
          )
          .filter(
            member =>
              !member.roles.cache.has(
                IDS.roles.kayitsiz
              )
          )
          .map(member => ({
            member,
            value:
              parseNickValue(
                member
              )
          }))
          .sort(
            (a, b) =>
              b.value -
              a.value
          )
          .slice(0, 10);

      return message.reply({
        embeds: [
          embed(
            "🏆 AXERA LEAGUE — DEĞER LİSTESİ",
            list.length
              ? list
                  .map(
                    (item, index) =>
                      `**${index + 1}.** <@${item.member.id}> — **${money(item.value)}**`
                  )
                  .join("\n")
              : "Kayıtlı oyuncu bulunamadı.",
            0xfee75c
          )
        ]
      });
    }

    /* =====================================================
       DVER / DSİL
       ===================================================== */

    if (
      command === "dver" ||
      command === "dsil"
    ) {
      if (
        !onlyChannel(
          message,
          IDS.channels.deger
        )
      ) {
        return;
      }

      if (
        !isValueStaff(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komutu yalnızca Değer Yetkilisi kullanabilir."
        );
      }

      const target =
        mentionMember(message);

      const amount =
        amountArg(
          args.find(
            value =>
              /^\d+(?:\.\d+)?M?€?$/i.test(
                value
              )
          )
        );

      if (!target || !amount) {
        return message.reply(
          `❌ Kullanım: \`.${command} @Oyuncu 5M\``
        );
      }

      const result =
        await changePlayerValue(
          target,
          command === "dver"
            ? amount
            : -amount,
          command === "dver"
            ? "Değer verme"
            : "Değer silme"
        );

      return message.reply(
        command === "dver"
          ? `✅ **${playerName(target)}** değerine **+${money(amount)}** eklendi.\n💰 Yeni değer: **${money(result.newValue)}**`
          : `✅ **${playerName(target)}** değerinden **-${money(amount)}** çıkarıldı.\n💰 Yeni değer: **${money(result.newValue)}**`
      );
    }

    /* =====================================================
       ANTRENMAN
       ===================================================== */

    if (
      command === "ant" ||
      command === "antrenman"
    ) {
      return doTraining(
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
      return doPenalty(
        message
      );
    }

    /* =====================================================
       TWEET
       ===================================================== */

    if (command === "tweet") {
      return doTweet(
        message,
        args.join(" ")
      );
    }

    /* =====================================================
       TAKIM EKLE
       ===================================================== */

    if (command === "takımekle") {
      if (
        !isMatchStaff(
          message.member
        )
      ) {
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

      ensureTeam(
        name,
        role?.id ||
          IDS.teams[name] ||
          null
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
      command ===
        "takımkaldır" ||
      command ===
        "takimkaldir"
    ) {
      if (
        !isMatchStaff(
          message.member
        )
      ) {
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

      if (IDS.teams[name]) {
        db.teams[name] = {
          players: [],
          score: 0,
          gd: 0,
          gf: 0,
          ga: 0,
          roleId:
            IDS.teams[name],
          teamValue: 0,
          ilk11: {}
        };
      } else {
        delete db.teams[name];
      }

      saveData();

      return message.reply(
        `✅ **${name}** ligden kaldırıldı.`
      );
    }

    /* =====================================================
       PUAN EKLE
       ===================================================== */

    if (
      command === "puanekle"
    ) {
      if (
        !isMatchStaff(
          message.member
        )
      ) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const role =
        message.mentions.roles.first();

      const name =
        role?.name ||
        teamByName(
          args
            .filter(
              x =>
                !x.startsWith(
                  "<@&"
                )
            )
            .slice(0, -1)
            .join(" ")
        );

      const amount =
        Number(args.at(-1));

      if (
        !name ||
        !Number.isFinite(
          amount
        ) ||
        amount <= 0
      ) {
        return message.reply(
          "❌ Kullanım: `.puanekle @Takım 3`"
        );
      }

      ensureTeam(
        name
      ).score += amount;

      saveData();

      return message.reply(
        `✅ **${name}** takımına **+${amount} puan** eklendi.`
      );
    }

    /* =====================================================
       TAKIM DEĞER
       ===================================================== */

    if (
      command ===
        "takımdeğer" ||
      command ===
        "takimdeger"
    ) {
      if (
        !isMatchStaff(
          message.member
        )
      ) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const role =
        message.mentions.roles.first();

      const amount =
        amountArg(
          args.at(-1)
        );

      const name =
        role?.name ||
        teamByName(
          args
            .slice(0, -1)
            .join(" ")
        );

      if (!name || !amount) {
        return message.reply(
          "❌ Kullanım: `.takımdeğer @Takım 850M`"
        );
      }

      ensureTeam(
        name
      ).teamValue =
        Math.min(
          1000,
          amount
        );

      saveData();

      return message.reply(
        `✅ **${name}** takım değeri: **${money(amount)}**`
      );
    }

    /* =====================================================
       FORMASYON
       ===================================================== */

    if (
      command ===
        "formasyon"
    ) {
      if (
        !isMatchStaff(
          message.member
        )
      ) {
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

      const formations = [
        "4-4-2",
        "4-3-3",
        "4-2-3-1",
        "3-5-2",
        "3-4-3",
        "4-3-1-2",
        "4-2-2-2",
        "5-3-2"
      ];

      const menu =
        new StringSelectMenuBuilder()
          .setCustomId(
            `formation_${encodeURIComponent(name)}`
          )
          .setPlaceholder(
            "Formasyon seç"
          )
          .addOptions(
            formations.map(
              formation => ({
                label:
                  formation,
                value:
                  formation
              })
            )
          );

      return message.reply({
        embeds: [
          embed(
            "⚽ Formasyon",
            `**${name}** için formasyon seç.`
          )
        ],
        components: [
          new ActionRowBuilder()
            .addComponents(
              menu
            )
        ]
      });
    }

    /* =====================================================
       İLK 11
       ===================================================== */

    if (
      command ===
        "ilk11"
    ) {
      const role =
        message.mentions.roles.first();

      let team =
        role?.name ||
        teamByName(
          args.join(" ")
        );

      if (
        !isAdmin(
          message.member
        ) &&
        !hasRole(
          message.member,
          [IDS.roles.spiker]
        )
      ) {
        const ownTeams =
          getUserTeams(
            message.guild,
            message.member
          );

        if (!ownTeams.length) {
          return message.reply(
            "❌ Teknik Direktör olarak bir takım rolün bulunmuyor."
          );
        }

        if (
          team &&
          !ownTeams.includes(
            team
          )
        ) {
          return message.reply(
            "❌ Sadece kendi takımının İlk 11'ini yönetebilirsin."
          );
        }

        if (!team) {
          if (
            ownTeams.length ===
            1
          ) {
            team =
              ownTeams[0];
          } else {
            return message.reply(
              `❌ Takım belirt: ${ownTeams
                .map(
                  x => `**${x}**`
                )
                .join(", ")}`
            );
          }
        }
      }

      if (!team) {
        return message.reply(
          "❌ Kullanım: `.ilk11 @Takım`"
        );
      }

      return sendFirst11Panel(
        message,
        team
      );
    }

    /* =====================================================
       MAÇ
       ===================================================== */

    if (
      command === "maç" ||
      command === "mac"
    ) {
      if (
        !onlyChannel(
          message,
          IDS.channels.mac
        )
      ) {
        return;
      }

      if (
        !isMatchStaff(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komutu yalnızca Spiker veya Yönetici kullanabilir."
        );
      }

      const roles =
        [
          ...message.mentions.roles.values()
        ];

      let teamA =
        roles[0]?.name;

      let teamB =
        roles[1]?.name;

      if (!teamA || !teamB) {
        const teams =
          args
            .map(
              x =>
                teamByName(x)
            )
            .filter(Boolean);

        teamA =
          teamA ||
          teams[0];

        teamB =
          teamB ||
          teams[1];
      }

      if (
        !teamA ||
        !teamB
      ) {
        return message.reply(
          "❌ Kullanım: `.maç @Takım1 @Takım2`"
        );
      }

      if (
        teamA ===
        teamB
      ) {
        return message.reply(
          "❌ Aynı takım kendisiyle oynayamaz."
        );
      }

      return runMatch(
        message.guild,
        message.channel,
        teamA,
        teamB
      );
    }

    /* =====================================================
       PUAN
       ===================================================== */

    if (command === "puan") {
      await postStandings(
        message.guild
      );

      return message.reply(
        `✅ Puan durumu <#${IDS.channels.puan}> kanalına gönderildi.`
      );
    }

    /* =====================================================
       FİKSTÜR EKLE
       ===================================================== */

    if (
      command ===
        "fiksturekle"
    ) {
      if (
        !isMatchStaff(
          message.member
        )
      ) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const roles =
        [
          ...message.mentions.roles.values()
        ];

      let teamA =
        roles[0]?.name;

      let teamB =
        roles[1]?.name;

      const date =
        args.find(
          x =>
            /^\d{4}-\d{2}-\d{2}$/.test(
              x
            )
        );

      const time =
        args.find(
          x =>
            /^\d{2}:\d{2}$/.test(
              x
            )
        );

      const possibleTeams =
        args
          .filter(
            x =>
              !/^\d{4}-\d{2}-\d{2}$/.test(
                x
              ) &&
              !/^\d{2}:\d{2}$/.test(
                x
              )
          )
          .map(
            x =>
              teamByName(x)
          )
          .filter(Boolean);

      teamA =
        teamA ||
        possibleTeams[0];

      teamB =
        teamB ||
        possibleTeams[1];

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
        fixtureTimestamp(
          date,
          time
        );

      if (!timestamp) {
        return message.reply(
          "❌ Tarih veya saat geçersiz."
        );
      }

      db.fixtures.push({
        id:
          db.nextFixtureId++,
        guildId:
          message.guild.id,
        a:
          teamA,
        b:
          teamB,
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
       FİKSTÜR
       ===================================================== */

    if (
      command ===
        "fikstür" ||
      command ===
        "fikstur"
    ) {
      const fixtures =
        db.fixtures
          .filter(
            fixture =>
              fixture.guildId ===
                message.guild.id &&
              !fixture.started
          )
          .sort(
            (a, b) =>
              a.timestamp -
              b.timestamp
          )
          .slice(0, 30);

      return message.reply({
        embeds: [
          embed(
            "📅 Axera League Fikstür",
            fixtures.length
              ? fixtures
                  .map(
                    fixture =>
                      `📅 **${fixture.date} ${fixture.time}** — **${fixture.a} - ${fixture.b}**`
                  )
                  .join("\n")
              : "Fikstür boş."
          )
        ]
      });
    }

    /* =====================================================
       FİKSTÜR ÇIKAR
       ===================================================== */

    if (
      command ===
        "fiksturcikar"
    ) {
      if (
        !isMatchStaff(
          message.member
        )
      ) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const roles =
        [
          ...message.mentions.roles.values()
        ];

      let teamA =
        roles[0]?.name;

      let teamB =
        roles[1]?.name;

      const teams =
        args
          .map(
            x =>
              teamByName(x)
          )
          .filter(Boolean);

      teamA =
        teamA ||
        teams[0];

      teamB =
        teamB ||
        teams[1];

      if (
        !teamA ||
        !teamB
      ) {
        return message.reply(
          "❌ İki takım belirt."
        );
      }

      const index =
        db.fixtures.findIndex(
          fixture =>
            fixture.guildId ===
              message.guild.id &&
            !fixture.started &&
            fixture.a ===
              teamA &&
            fixture.b ===
              teamB
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
       BÜTÇE
       ===================================================== */

    if (
      command ===
        "bütçeekle" ||
      command ===
        "butceekle" ||
      command ===
        "bütçesil" ||
      command ===
        "butcesil"
    ) {
      if (
        !isValueStaff(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komutu yalnızca Değer Yetkilisi kullanabilir."
        );
      }

      const target =
        mentionMember(message);

      const amount =
        amountArg(
          args.find(
            x =>
              /^\d+(?:\.\d+)?M?€?$/i.test(
                x
              )
          )
        );

      if (!target || !amount) {
        return message.reply(
          "❌ Kullanım: `.bütçeekle @Oyuncu 50M`"
        );
      }

      const user =
        ensureUser(target);

      if (
        command ===
          "bütçeekle" ||
        command ===
          "butceekle"
      ) {
        user.budget += amount;
      } else {
        user.budget =
          Math.max(
            0,
            user.budget -
              amount
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

    if (
      command ===
        "gönder" ||
      command ===
        "gonder"
    ) {
      const target =
        mentionMember(message);

      const amount =
        amountArg(
          args.find(
            x =>
              /^\d+(?:\.\d+)?M?€?$/i.test(
                x
              )
          )
        );

      if (!target || !amount) {
        return message.reply(
          "❌ Kullanım: `.gönder @Oyuncu 50M`"
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
        ensureUser(
          target
        );

      if (
        sender.budget <
        amount
      ) {
        return message.reply(
          "❌ Yeterli kişisel bütçen yok."
        );
      }

      sender.budget -=
        amount;

      receiver.budget +=
        amount;

      saveData();

      return message.reply(
        `✅ **${money(amount)}** <@${target.id}> oyuncusuna gönderildi.`
      );
    }

    /* =====================================================
       ROL VER
       SADECE YÖNETİCİ
       ===================================================== */

    if (
      command === "rolver" ||
      command === "rolal"
    ) {
      if (
        !isAdmin(
          message.member
        )
      ) {
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
          `❌ Kullanım: \`.${command} @Oyuncu @Rol\``
        );
      }

      try {
        if (
          command ===
          "rolver"
        ) {
          await target.roles.add(
            role
          );
        } else {
          await target.roles.remove(
            role
          );
        }
      } catch {
        return message.reply(
          "❌ Rol işlemi yapılamadı. Botun rolü hedef rolden yukarıda olmalı."
        );
      }

      return message.reply(
        command ===
          "rolver"
          ? `✅ <@${target.id}> kullanıcısına **${role.name}** rolü verildi.`
          : `✅ <@${target.id}> kullanıcısından **${role.name}** rolü alındı.`
      );
    }

    /* =====================================================
       ROL VER HEPSİ
       .rolverhepsi @Rol
       ===================================================== */

    if (
      command ===
        "rolverhepsi" ||
      command ===
        "rolalhepsi"
    ) {
      if (
        !isAdmin(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komutu yalnızca Yöneticiler kullanabilir."
        );
      }

      const role =
        message.mentions.roles.first();

      if (!role) {
        return message.reply(
          `❌ Kullanım: \`.${command} @Rol\``
        );
      }

      if (
        command ===
          "rolverhepsi" &&
        role.position >=
          message.guild.members.me
            .roles.highest.position
      ) {
        return message.reply(
          "❌ Bot bu rolü veremiyor. Rol, botun en yüksek rolünün altında olmalı."
        );
      }

      await message.guild.members
        .fetch()
        .catch(() => {});

      let count = 0;

      for (
        const member
        of message.guild.members
          .cache.values()
      ) {
        if (
          member.user.bot
        ) {
          continue;
        }

        try {
          if (
            command ===
              "rolverhepsi"
          ) {
            if (
              member.roles.cache.has(
                role.id
              )
            ) {
              continue;
            }

            await member.roles.add(
              role
            );
          } else {
            if (
              !member.roles.cache.has(
                role.id
              )
            ) {
              continue;
            }

            await member.roles.remove(
              role
            );
          }

          count++;

          await sleep(50);
        } catch {}
      }

      return message.reply(
        command ===
          "rolverhepsi"
          ? `✅ **${count}** kişiye **${role.name}** rolü verildi.`
          : `✅ **${count}** kişiden **${role.name}** rolü alındı.`
      );
    }

    /* =====================================================
       ROL PANEL
       ===================================================== */

    if (
      command ===
        "rolpanel"
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
            .setLabel(
              label
            )
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
      command ===
        "şart" ||
      command ===
        "sart"
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

    if (
      command ===
        "ticketpanel"
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

    if (
      command === "sil"
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
        Math.min(
          Number(args[0]),
          1000
        );

      if (
        !Number.isFinite(
          amount
        ) ||
        amount <= 0
      ) {
        return message.reply(
          "❌ 1 ile 1000 arasında mesaj sayısı yaz."
        );
      }

      const deleted =
        await message.channel
          .bulkDelete(
            amount,
            true
          )
          .catch(
            () => null
          );

      const result =
        await message.channel.send(
          `🧹 **${deleted?.size || 0}** mesaj silindi.`
        );

      setTimeout(
        () =>
          result
            .delete()
            .catch(
              () => {}
            ),
        2500
      );

      return;
    }

    /* =====================================================
       EMBED
       ===================================================== */

    if (
      command ===
        "embed"
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

      const content =
        raw
          .slice(
            raw
              .toLocaleLowerCase(
                "tr-TR"
              )
              .indexOf(
                "embed"
              ) + 5
          )
          .trim();

      const [title, description] =
        content
          .split("|")
          .map(
            x =>
              x.trim()
          );

      if (
        !title ||
        !description
      ) {
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
      ].includes(
        command
      )
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
        mentionMember(
          message
        );

      if (!target) {
        return message.reply(
          "❌ Oyuncuyu etiketle."
        );
      }

      try {
        if (
          command ===
          "kick"
        ) {
          await target.kick(
            "Axera League"
          );
        }

        if (
          command ===
          "ban"
        ) {
          await target.ban({
            reason:
              "Axera League"
          });
        }

        if (
          command ===
          "mute"
        ) {
          await target.timeout(
            28 *
              24 *
              60 *
              60 *
              1000,
            "Axera League"
          );
        }

        if (
          command ===
          "unmute"
        ) {
          await target.timeout(
            null,
            "Axera League"
          );
        }

        return message.reply(
          `✅ **${command}** işlemi tamamlandı.`
        );
      } catch (
        error
      ) {
        return message.reply(
          `❌ İşlem yapılamadı: ${error.message}`
        );
      }
    }

    /* =====================================================
       DM
       ===================================================== */

    if (
      command ===
        "dm"
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
        mentionMember(
          message
        );

      const text =
        args
          .filter(
            x =>
              !/^<@!?\d+>$/.test(
                x
              )
          )
          .join(" ")
          .trim();

      if (
        !target ||
        !text
      ) {
        return message.reply(
          "❌ Kullanım: `.dm @Oyuncu mesaj`"
        );
      }

      try {
        await target.send(
          text
        );

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
       AI
       ===================================================== */

    if (
      command === "ai" ||
      command ===
        "yapayzeka"
    ) {
      const question =
        args.join(" ");

      if (!question) {
        return message.reply(
          "❌ Sorunu yaz."
        );
      }

      return aiAnswer(
        message,
        question
      );
    }
  }
);

/* =========================================================
   BUTTONS / MENÜLER
   ========================================================= */

client.on(
  "interactionCreate",
  async interaction => {

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

        const team =
          decodeURIComponent(
            interaction.customId.replace(
              "formation_",
              ""
            )
          );

        const formation =
          interaction.values[0];

        ensureTeam(team);

        db.formations[
          team
        ] = formation;

        saveData();

        return interaction.update({
          embeds: [
            embed(
              "✅ Formasyon Güncellendi",
              `⚽ Takım: **${team}**\n📐 Formasyon: **${formation}**`,
              0x57f287
            )
          ],
          components: []
        });
      }

      /* İLK 11 MEVKİ */

      if (
        interaction.customId.startsWith(
          "ilk11pos_"
        )
      ) {
        const team =
          decodeURIComponent(
            interaction.customId.replace(
              "ilk11pos_",
              ""
            )
          );

        if (
          !canManageFirst11(
            interaction.member,
            team
          )
        ) {
          return interaction.reply({
            content:
              "❌ Bu takımın İlk 11'ini yönetemezsin.",
            ephemeral: true
          });
        }

        interaction.client
          .first11Selections ??=
          new Map();

        const old =
          interaction.client
            .first11Selections
            .get(
              interaction.user.id
            ) || {};

        old.team = team;
        old.position =
          interaction.values[0];

        interaction.client
          .first11Selections
          .set(
            interaction.user.id,
            old
          );

        return interaction.reply({
          content:
            `✅ Mevki seçildi: **${interaction.values[0]}**`,
          ephemeral: true
        });
      }

      /* İLK 11 OYUNCU */

      if (
        interaction.customId.startsWith(
          "ilk11player_"
        )
      ) {
        const team =
          decodeURIComponent(
            interaction.customId.replace(
              "ilk11player_",
              ""
            )
          );

        if (
          !canManageFirst11(
            interaction.member,
            team
          )
        ) {
          return interaction.reply({
            content:
              "❌ Bu takımın İlk 11'ini yönetemezsin.",
            ephemeral: true
          });
        }

        interaction.client
          .first11Selections ??=
          new Map();

        const old =
          interaction.client
            .first11Selections
            .get(
              interaction.user.id
            ) || {};

        old.team = team;
        old.player =
          interaction.values[0];

        interaction.client
          .first11Selections
          .set(
            interaction.user.id,
            old
          );

        return interaction.reply({
          content:
            `✅ Oyuncu seçildi: <@${interaction.values[0]}>`,
          ephemeral: true
        });
      }

      return;
    }

    if (
      !interaction.isButton()
    ) {
      return;
    }

    /* =====================================================
       KAYIT
       ===================================================== */

    if (
      interaction.customId.startsWith(
        "register_"
      )
    ) {
      const type =
        interaction.customId.replace(
          "register_",
          ""
        );

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

      return finishRegister(
        interaction,
        type
      );
    }

    /* =====================================================
       ROL PANEL
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
       İLK 11 EKLE
       ===================================================== */

    if (
      interaction.customId.startsWith(
        "ilk11_add_"
      )
    ) {
      const team =
        decodeURIComponent(
          interaction.customId.replace(
            "ilk11_add_",
            ""
          )
        );

      if (
        !canManageFirst11(
          interaction.member,
          team
        )
      ) {
        return interaction.reply({
          content:
            "❌ Bu takımın İlk 11'ini yönetemezsin.",
          ephemeral: true
        });
      }

      const selection =
        interaction.client
          .first11Selections
          ?.get(
            interaction.user.id
          );

      if (
        !selection ||
        selection.team !== team ||
        !selection.position ||
        !selection.player
      ) {
        return interaction.reply({
          content:
            "❌ Önce mevki ve oyuncu seçmelisin.",
          ephemeral: true
        });
      }

      if (
        selection.player ===
        "none"
      ) {
        return interaction.reply({
          content:
            "❌ Geçerli oyuncu seçilmedi.",
          ephemeral: true
        });
      }

      ensureTeam(
        team
      ).ilk11[
        selection.position
      ] =
        selection.player;

      saveData();

      return interaction.reply({
        content:
          `✅ <@${selection.player}> **${team}** İlk 11'de **${selection.position}** mevkiine yerleştirildi.`,
        ephemeral: true
      });
    }

    /* =====================================================
       İLK 11 ÇIKAR
       ===================================================== */

    if (
      interaction.customId.startsWith(
        "ilk11_remove_"
      )
    ) {
      const team =
        decodeURIComponent(
          interaction.customId.replace(
            "ilk11_remove_",
            ""
          )
        );

      if (
        !canManageFirst11(
          interaction.member,
          team
        )
      ) {
        return interaction.reply({
          content:
            "❌ Yetkin yok.",
          ephemeral: true
        });
      }

      const selection =
        interaction.client
          .first11Selections
          ?.get(
            interaction.user.id
          );

      if (
        !selection?.position
      ) {
        return interaction.reply({
          content:
            "❌ Önce mevki seçmelisin.",
          ephemeral: true
        });
      }

      delete ensureTeam(
        team
      ).ilk11[
        selection.position
      ];

      saveData();

      return interaction.reply({
        content:
          `✅ **${selection.position}** mevkii boşaltıldı.`,
        ephemeral: true
      });
    }

    /* =====================================================
       İLK 11 TEMİZLE
       ===================================================== */

    if (
      interaction.customId.startsWith(
        "ilk11_clear_"
      )
    ) {
      const team =
        decodeURIComponent(
          interaction.customId.replace(
            "ilk11_clear_",
            ""
          )
        );

      if (
        !canManageFirst11(
          interaction.member,
          team
        )
      ) {
        return interaction.reply({
          content:
            "❌ Yetkin yok.",
          ephemeral: true
        });
      }

      ensureTeam(
        team
      ).ilk11 = {};

      saveData();

      return interaction.reply({
        content:
          `🗑️ **${team}** İlk 11 temizlendi.`,
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
        ticket.userId !==
          interaction.user.id &&
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
    if (
      member.user.bot
    ) {
      return;
    }

    await member.roles
      .add(
        IDS.roles.kayitsiz
      )
      .catch(() => {});

    ensureUser(member);

    saveData();
  }
);

/* =========================================================
   ZAMANLAYICI
   ========================================================= */

setInterval(
  async () => {

    /* Fikstür */
    await startDueFixtures()
      .catch(console.error);

    /* Ticket otomatik kapanma */
    for (
      const [channelId, ticket]
      of Object.entries(
        db.tickets
      )
    ) {
      if (!ticket.open) {
        continue;
      }

      if (
        Date.now() -
          Number(
            ticket.lastMessage ||
              0
          ) >=
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

    /* Durum */
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
        now.getMinutes() ===
          0 ||
        now.getMinutes() ===
          30
      ) &&
      key !==
        lastStatusKey
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
      `✅ Axera League aktif: ${client.user.tag}`
    );

    console.log(
      `🌐 Sunucu sayısı: ${client.guilds.cache.size}`
    );

    client.user.setPresence({
      activities: [
        {
          name:
            "Axera League",
          type: 1,
          url:
            process.env.STREAM_URL ||
            "https://www.twitch.tv/axeraleague"
        }
      ],
      status:
        "online"
    });
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
   LOGIN
   ========================================================= */

client.login(
  process.env.TOKEN
);
