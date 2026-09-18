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
   AXERA LEAGUE BOT
   DISCORD.JS V14
   ========================================================= */

const TOKEN = process.env.TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!TOKEN) {
  throw new Error("TOKEN Railway Variables içine eklenmemiş.");
}

const ai = OPENAI_API_KEY
  ? new OpenAI({ apiKey: OPENAI_API_KEY })
  : null;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.User,
    Partials.GuildMember
  ]
});

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

    medyaPing: "1547393966553440346",
    partnerPing: "1547393545827123230",
    macPing: "1547393416755941509",
    duyuruPing: "1547393331297001522",
    cekilisPing: "1545116885589430312"
  },

  channels: {
    kayit: "1547371464515133470",
    sohbet: "1547374641763455009",
    antrenman: "1547375589923618957",
    penalti: "1547375997698052166",
    tweet: "1547377797193011340",
    mac: "1547376935410073692",
    puan: "1547382143775285431",
    deger: "1547376344927834122",
    botDurum: "1547388197796057118",
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
   VERİTABANI
   ========================================================= */

const DATA_FILE = path.join(__dirname, "axera-data.json");

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
    if (!fs.existsSync(DATA_FILE)) {
      return structuredClone(DEFAULT);
    }

    const data = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );

    return {
      ...structuredClone(DEFAULT),
      ...data,
      users: data.users || {},
      teams: data.teams || {},
      standings: data.standings || {},
      fixtures: data.fixtures || [],
      activeMatches: data.activeMatches || {},
      registrationPanels: data.registrationPanels || {},
      tickets: data.tickets || {},
      formations: data.formations || {},
      training: data.training || {},
      tweetCooldowns: data.tweetCooldowns || {},
      matchRewards: data.matchRewards || {},
      stats: data.stats || {},
      matchHistory: data.matchHistory || {}
    };
  } catch (err) {
    console.error("Veri okunamadı:", err);
    return structuredClone(DEFAULT);
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
    console.error("Veri kaydedilemedi:", err);
  }
}

/* =========================================================
   GENEL YARDIMCILAR
   ========================================================= */

const cleanName = value =>
  String(value || "")
    .replace(/[*_`~]/g, "")
    .trim();

const money = n => {
  const v = Math.max(0, Number(n) || 0);

  return v >= 1000
    ? "1B€"
    : `${Math.round(v)}M€`;
};

function amountArg(value) {
  if (value === undefined || value === null) {
    return NaN;
  }

  const original = String(value)
    .trim()
    .replace(",", ".");

  const isB =
    /B€?$/i.test(original);

  const clean =
    original
      .replace(/€/g, "")
      .replace(/[MB]/gi, "")
      .trim();

  const n = Number(clean);

  if (!Number.isFinite(n)) {
    return NaN;
  }

  return isB ? n * 1000 : n;
}

function embed(
  title,
  description,
  color = 0x5865f2
) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function hasRole(member, roles) {
  if (!member) return false;

  return roles
    .filter(Boolean)
    .some(id =>
      member.roles.cache.has(id)
    );
}

function isAdmin(member) {
  return (
    member?.permissions?.has(
      PermissionFlagsBits.Administrator
    ) ||
    hasRole(member, [
      IDS.roles.yonetici
    ])
  );
}

function isRegistrationStaff(member) {
  return (
    isAdmin(member) ||
    hasRole(member, [
      IDS.roles.kayitYetkilisi
    ])
  );
}

function isValueStaff(member) {
  return (
    isAdmin(member) ||
    hasRole(member, [
      IDS.roles.deger
    ])
  );
}

function isModerator(member) {
  return (
    isAdmin(member) ||
    hasRole(member, [
      IDS.roles.moderator
    ])
  );
}

function isSpeaker(member) {
  return (
    isAdmin(member) ||
    hasRole(member, [
      IDS.roles.spiker
    ])
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

function channelOnly(message, channelId) {
  if (message.channel.id !== channelId) {
    message.reply({
      content:
        `❌ Bu komut <#${channelId}> kanalında kullanılabilir.`
    }).catch(() => {});

    return false;
  }

  return true;
}

/* =========================================================
   KULLANICI VERİSİ
   ========================================================= */

function getUserData(userId) {
  if (!db.users[userId]) {
    db.users[userId] = {
      registered: false,
      nickname: "",
      value: 0,
      budget: 0,
      team: null,
      position: null,

      stats: {
        goals: 0,
        assists: 0,
        matches: 0
      }
    };
  }

  if (!db.users[userId].stats) {
    db.users[userId].stats = {
      goals: 0,
      assists: 0,
      matches: 0
    };
  }

  return db.users[userId];
}

/* =========================================================
   DEĞER SİSTEMİ
   DEĞER HER ZAMAN TAKMA ADINDAN OKUNUR
   ========================================================= */

function parseNickValue(member) {
  const nickname =
    member?.nickname ||
    member?.displayName ||
    "";

  /*
     Örnek:
     L.Yamal | 🇪🇸 | SNT | 15M€
     -> 15
  */

  if (/1B€\s*$/i.test(nickname)) {
    return 1000;
  }

  const match =
    nickname.match(
      /(\d+(?:\.\d+)?)M€\s*$/i
    );

  if (!match) {
    return 0;
  }

  return Number(match[1]) || 0;
}

function setNickValue(oldNick, value) {
  let nickname =
    String(oldNick || "")
      .trim();

  /*
     SADECE sondaki mevcut M€/1B€ kısmını sil.
     İsim, ülke, pozisyon vb. korunur.
  */

  nickname =
    nickname.replace(
      /\s*(?:\d+(?:\.\d+)?M|1B)€\s*$/i,
      ""
    ).trim();

  return `${nickname || "Oyuncu"} | ${money(value)}`
    .slice(0, 32);
}

async function safeSetNickname(
  member,
  nickname
) {
  try {
    if (
      member &&
      member.manageable
    ) {
      await member.setNickname(
        nickname
      );

      return true;
    }
  } catch (err) {
    console.error(
      "Takma ad değiştirilemedi:",
      err.message
    );
  }

  return false;
}

/*
   TÜM OTOMATİK DEĞERLER BU FONKSİYONU KULLANIR.

   Değeri DB'den değil,
   oyuncunun Discord takma adından okur.
*/

async function changePlayerValue(
  member,
  delta,
  reason = ""
) {
  if (!member) return null;

  /*
     ÖNEMLİ:
     Mevcut değer doğrudan nickname'den okunuyor.
  */
  const current =
    parseNickValue(member);

  const numericDelta =
    Number(delta) || 0;

  const next =
    Math.min(
      1000,
      Math.max(
        0,
        current + numericDelta
      )
    );

  const oldNickname =
    member.nickname ||
    member.displayName ||
    "Oyuncu";

  /*
     Sadece M€ kısmını değiştir.
  */
  const newNickname =
    setNickValue(
      oldNickname,
      next
    );

  await safeSetNickname(
    member,
    newNickname
  );

  /*
     DB sadece kayıt/takip amacıyla güncellenir.
     Değerin asıl kaynağı nickname'dir.
  */
  const user =
    getUserData(member.id);

  user.value = next;

  saveData();

  return {
    oldValue: current,
    newValue: next,
    reason
  };
}

/* =========================================================
   TAKIM SİSTEMİ
   ========================================================= */

function ensureTeam(
  name,
  roleId = null
) {
  if (!name) return null;

  if (!db.teams[name]) {
    db.teams[name] = {
      players: [],
      score: 0,
      gd: 0,
      gf: 0,
      ga: 0,
      value: 0,
      roleId: roleId || null
    };
  }

  if (roleId) {
    db.teams[name].roleId =
      roleId;
  }

  return db.teams[name];
}

function teamByName(name) {
  const clean =
    cleanName(name);

  if (IDS.teams[clean]) {
    return {
      name: clean,
      roleId: IDS.teams[clean]
    };
  }

  if (db.teams[clean]) {
    return {
      name: clean,
      roleId:
        db.teams[clean].roleId ||
        null
    };
  }

  return null;
}

function ensureStandings(name) {
  if (!db.standings[name]) {
    db.standings[name] = {
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      gf: 0,
      ga: 0,
      gd: 0
    };
  }

  return db.standings[name];
}

function updateStandings(
  team1,
  team2,
  score1,
  score2
) {
  const a =
    ensureStandings(team1);

  const b =
    ensureStandings(team2);

  a.played++;
  b.played++;

  a.gf += score1;
  a.ga += score2;

  b.gf += score2;
  b.ga += score1;

  a.gd =
    a.gf - a.ga;

  b.gd =
    b.gf - b.ga;

  if (score1 > score2) {
    a.wins++;
    a.points += 3;
    b.losses++;
  } else if (score2 > score1) {
    b.wins++;
    b.points += 3;
    a.losses++;
  } else {
    a.draws++;
    b.draws++;
    a.points++;
    b.points++;
  }

  saveData();
}

/* =========================================================
   KAYIT PANELİ
   ========================================================= */

async function registerPanel(
  message,
  target,
  nickname
) {
  const row =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            `register_futbolcu_${target.id}`
          )
          .setLabel("⚽ Futbolcu")
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            `register_uye_${target.id}`
          )
          .setLabel("👤 Üye")
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            `register_td_${target.id}`
          )
          .setLabel(
            "🧑‍💼 Teknik Direktör"
          )
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            `register_kaleci_${target.id}`
          )
          .setLabel("🧤 Kaleci")
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            `register_cancel_${target.id}`
          )
          .setLabel("❌ İptal")
          .setStyle(
            ButtonStyle.Danger
          )
      );

  /*
     Panel mesajını gerçekten oluşturuyoruz.
     Sonrasında gerçek panel ID'sini DB'ye kaydediyoruz.
  */

  const panel =
    await message.reply({
      embeds: [
        embed(
          "📋 Axera League Kayıt",
          `👤 Oyuncu: <@${target.id}>\n` +
          `🏷️ İsim: **${cleanName(nickname)}**\n\n` +
          "Oyuncunun rolünü aşağıdaki butonlardan seçin."
        )
      ],
      components: [row]
    });

  db.registrationPanels[
    panel.id
  ] = {
    userId: target.id,
    nickname:
      String(nickname)
        .slice(0, 32),
    createdBy:
      message.author.id,
    createdAt:
      Date.now()
  };

  saveData();

  return panel;
}

async function finishRegister(
  interaction,
  type
) {
  if (
    !isRegistrationStaff(
      interaction.member
    )
  ) {
    return interaction.reply({
      content:
        "❌ Bu işlem için Kayıt Yetkilisi veya Yönetici olmalısın.",
      ephemeral: true
    });
  }

  const panel =
    db.registrationPanels[
      interaction.message.id
    ];

  if (!panel) {
    return interaction.reply({
      content:
        "❌ Bu kayıt paneli bulunamadı.",
      ephemeral: true
    });
  }

  const target =
    await interaction.guild.members
      .fetch(panel.userId)
      .catch(() => null);

  if (!target) {
    delete db.registrationPanels[
      interaction.message.id
    ];

    saveData();

    return interaction.reply({
      content:
        "❌ Oyuncu bulunamadı.",
      ephemeral: true
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

  const roleId =
    roleMap[type];

  if (!roleId) {
    return interaction.reply({
      content:
        "❌ Rol bulunamadı.",
      ephemeral: true
    });
  }

  if (
    roleId &&
    interaction.guild.members.me &&
    interaction.guild.roles.cache.get(roleId)
  ) {
    try {
      const rolesToRemove = [
        IDS.roles.kayitsiz,
        IDS.roles.futbolcu,
        IDS.roles.uye,
        IDS.roles.td,
        IDS.roles.kaleci
      ].filter(Boolean);

      await target.roles.remove(
        rolesToRemove
      ).catch(() => {});

      await target.roles.add(
        roleId
      );
    } catch (err) {
      console.error(
        "Kayıt rol hatası:",
        err.message
      );
    }
  }

  const user =
    getUserData(target.id);

  user.registered = true;
  user.nickname =
    panel.nickname;
  user.position =
    type;

  /*
     Kayıt sırasında mevcut değer
     nickname'den okunur.
  */
  const currentValue =
    parseNickValue(target);

  user.value =
    currentValue;

  let newNickname =
    panel.nickname;

  if (currentValue > 0) {
    newNickname =
      setNickValue(
        panel.nickname,
        currentValue
      );
  }

  await safeSetNickname(
    target,
    newNickname
  );

  delete db.registrationPanels[
    interaction.message.id
  ];

  saveData();

  const roleNames = {
    futbolcu: "⚽ Futbolcu",
    uye: "👤 Üye",
    td: "🧑‍💼 Teknik Direktör",
    kaleci: "🧤 Kaleci"
  };

  return interaction.update({
    embeds: [
      embed(
        "✅ Kayıt Tamamlandı",
        `👤 Oyuncu: <@${target.id}>\n` +
        `🏷️ İsim: **${cleanName(panel.nickname)}**\n` +
        `🎭 Rol: **${roleNames[type]}**`
      )
    ],
    components: []
  });
}

/* =========================================================
   İLK 11 / FORMASYON
   ========================================================= */

function getFormation(
  teamName
) {
  if (!db.formations[teamName]) {
    db.formations[teamName] = {
      formation: "4-3-3",
      players: []
    };
  }

  return db.formations[teamName];
}

function saveFormation(
  teamName,
  formation
) {
  db.formations[teamName] =
    formation;

  saveData();
}

/* =========================================================
   FİKSTÜR
   ========================================================= */

function createFixture(
  team1,
  team2,
  dateTime
) {
  const fixture = {
    id:
      db.nextFixtureId++,
    team1,
    team2,
    dateTime,
    played: false,
    createdAt:
      Date.now()
  };

  db.fixtures.push(
    fixture
  );

  saveData();

  return fixture;
}

/* =========================================================
   MAÇ
   3 SANİYE = 1 OYUN DAKİKASI
   ========================================================= */

function getMatchLineup(
  teamName,
  guild
) {
  const formation =
    getFormation(teamName);

  if (
    !formation ||
    !Array.isArray(
      formation.players
    )
  ) {
    return [];
  }

  return formation.players
    .map(id =>
      guild.members.cache.get(id)
    )
    .filter(Boolean);
}

function randomItem(arr) {
  if (!arr.length) return null;

  return arr[
    Math.floor(
      Math.random() *
      arr.length
    )
  ];
}

async function rewardMatchPlayer(
  member
) {
  if (!member) return;

  const key =
    `match_${member.id}`;

  /*
     Katılım ödülü maç başına
     matchRewards ile ayrıca kontrol edilir.
  */

  await changePlayerValue(
    member,
    5,
    "Maç katılım ödülü"
  );

  const user =
    getUserData(member.id);

  user.stats.matches++;

  saveData();
}

async function rewardGoal(
  member
) {
  if (!member) return;

  const user =
    getUserData(member.id);

  user.stats.goals++;

  await changePlayerValue(
    member,
    2,
    "Maç gol ödülü"
  );

  saveData();
}

async function rewardAssist(
  member
) {
  if (!member) return;

  const user =
    getUserData(member.id);

  user.stats.assists++;

  await changePlayerValue(
    member,
    1,
    "Maç asist ödülü"
  );

  saveData();
}

async function runMatch(
  channel,
  team1,
  team2,
  scheduled = false
) {
  const guild =
    channel.guild;

  const matchId =
    `${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

  const lineup1 =
    getMatchLineup(
      team1,
      guild
    );

  const lineup2 =
    getMatchLineup(
      team2,
      guild
    );

  const match = {
    id: matchId,
    team1,
    team2,
    score1: 0,
    score2: 0,
    minute: 0,
    scheduled,
    startedAt:
      Date.now(),
    lineups: {
      team1:
        lineup1.map(x => x.id),
      team2:
        lineup2.map(x => x.id)
    }
  };

  db.activeMatches[
    matchId
  ] = match;

  saveData();

  await channel.send({
    embeds: [
      embed(
        "⚽ AXERA LEAGUE — MAÇ BAŞLADI",
        `**${team1}** 0 - 0 **${team2}**\n\n` +
        "⏱️ Dakika: **0'**"
      )
    ]
  });

  /*
     Katılım ödülü
  */

  const participants =
    [
      ...lineup1,
      ...lineup2
    ];

  const unique =
    [
      ...new Map(
        participants.map(
          m => [m.id, m]
        )
      ).values()
    ];

  for (
    const member of unique
  ) {
    const rewardKey =
      `${matchId}_${member.id}`;

    if (
      !db.matchRewards[
        rewardKey
      ]
    ) {
      db.matchRewards[
        rewardKey
      ] = true;

      await rewardMatchPlayer(
        member
      );
    }
  }

  saveData();

  const interval =
    setInterval(async () => {
      const current =
        db.activeMatches[
          matchId
        ];

      if (!current) {
        clearInterval(interval);
        return;
      }

      current.minute++;

      let eventText = "";

      /*
         Her 10 oyun dakikasında
         olay ihtimali.
      */

      if (
        current.minute % 10 === 0 &&
        Math.random() < 0.28
      ) {
        const attackingTeam =
          Math.random() < 0.5
            ? 1
            : 2;

        const lineup =
          attackingTeam === 1
            ? lineup1
            : lineup2;

        const scorer =
          randomItem(lineup);

        if (scorer) {
          if (
            attackingTeam === 1
          ) {
            current.score1++;
          } else {
            current.score2++;
          }

          await rewardGoal(
            scorer
          );

          eventText =
            `\n\n⚽ **GOOOL!** <@${scorer.id}> golü attı!`;

          /*
             Asist
          */

          if (
            lineup.length > 1 &&
            Math.random() < 0.65
          ) {
            const candidates =
              lineup.filter(
                x =>
                  x.id !== scorer.id
              );

            const assister =
              randomItem(
                candidates
              );

            if (assister) {
              await rewardAssist(
                assister
              );

              eventText +=
                `\n🎯 Asist: <@${assister.id}>`;
            }
          }
        }
      }

      await channel.send({
        embeds: [
          embed(
            "⚽ AXERA LEAGUE — CANLI MAÇ",
            `**${team1}** ${current.score1} - ${current.score2} **${team2}**\n\n` +
            `⏱️ Dakika: **${current.minute}'**` +
            eventText
          )
        ]
      }).catch(() => {});

      saveData();

      if (
        current.minute >= 90
      ) {
        clearInterval(interval);

        updateStandings(
          team1,
          team2,
          current.score1,
          current.score2
        );

        db.matchHistory[
          matchId
        ] = {
          ...current,
          finishedAt:
            Date.now()
        };

        delete db.activeMatches[
          matchId
        ];

        saveData();

        await channel.send({
          embeds: [
            embed(
              "🏁 MAÇ SONA ERDİ",
              `**${team1}** ${current.score1} - ${current.score2} **${team2}**\n\n` +
              "📊 Puan durumu güncellendi.",
              0x57f287
            )
          ]
        });
      }
    }, 3000);

  return match;
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
      x =>
        x.guildId === guild.id &&
        x.userId === interaction.user.id &&
        !x.closed
    );

  if (existing) {
    return interaction.editReply(
      `❌ Zaten açık ticketın var: <#${existing.channelId}>`
    );
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
          .slice(0, 80),

      type:
        ChannelType.GuildText,

      permissionOverwrites: [
        {
          id:
            guild.roles.everyone.id,

          deny: [
            "ViewChannel"
          ]
        },

        {
          id:
            interaction.user.id,

          allow: [
            "ViewChannel",
            "SendMessages",
            "ReadMessageHistory"
          ]
        },

        {
          id:
            IDS.roles.yonetici,

          allow: [
            "ViewChannel",
            "SendMessages",
            "ReadMessageHistory"
          ]
        },

        {
          id:
            IDS.roles.moderator,

          allow: [
            "ViewChannel",
            "SendMessages",
            "ReadMessageHistory"
          ]
        }
      ]
    });

  db.tickets[
    channel.id
  ] = {
    guildId:
      guild.id,
    userId:
      interaction.user.id,
    channelId:
      channel.id,
    lastActivity:
      Date.now(),
    closed: false
  };

  saveData();

  const row =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            `ticket_close_${channel.id}`
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
      `<@${interaction.user.id}>`,

    embeds: [
      embed(
        "🎫 Axera League Ticket",
        "Destek talebin oluşturuldu.\n\n" +
        "Yetkililer seninle ilgilenecektir.\n\n" +
        "60 dakika boyunca aktivite olmazsa ticket otomatik kapanabilir."
      )
    ],

    components: [
      row
    ]
  });

  return interaction.editReply(
    `✅ Ticket oluşturuldu: <#${channel.id}>`
  );
}

/* =========================================================
   ROL PANELİ
   ========================================================= */

function rolePanelRow() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(
          "toggle_partner_ping"
        )
        .setLabel("🤝 Partner")
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "toggle_mac_ping"
        )
        .setLabel("⚽ Maç")
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "toggle_duyuru_ping"
        )
        .setLabel("📢 Duyuru")
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "toggle_cekilis_ping"
        )
        .setLabel("🎁 Çekiliş")
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          "toggle_medya_ping"
        )
        .setLabel("🎥 Medya")
        .setStyle(
          ButtonStyle.Secondary
        )
    );
}

function roleForToggle(
  customId
) {
  const map = {
    toggle_partner_ping:
      IDS.roles.partnerPing,

    toggle_mac_ping:
      IDS.roles.macPing,

    toggle_duyuru_ping:
      IDS.roles.duyuruPing,

    toggle_cekilis_ping:
      IDS.roles.cekilisPing,

    toggle_medya_ping:
      IDS.roles.medyaPing
  };

  return map[customId];
}

/* =========================================================
   AI
   ========================================================= */

async function askAI(
  prompt
) {
  if (!ai) {
    return (
      "❌ Yapay zeka sistemi aktif değil. " +
      "Railway'e OPENAI_API_KEY eklenmeli."
    );
  }

  try {
    const response =
      await ai.responses.create({
        model:
          "gpt-5.6-luna",

        input: [
          {
            role: "system",
            content:
              "Sen Axera League Discord sunucusunun yardımcı yapay zekasısın. Türkçe, kısa, anlaşılır ve arkadaşça cevap ver."
          },

          {
            role: "user",
            content:
              String(prompt)
                .slice(0, 4000)
          }
        ]
      });

    return (
      response.output_text ||
      "Şu anda cevap oluşturamadım."
    ).slice(0, 3900);

  } catch (err) {
    console.error(
      "OpenAI hatası:",
      err
    );

    return (
      "❌ Yapay zeka yanıt verirken hata oluştu."
    );
  }
}

/* =========================================================
   PRESENCE
   ========================================================= */

function setBotPresence() {
  if (!client.user) return;

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

/* =========================================================
   BOT DURUM
   ========================================================= */

const botStartedAt =
  Date.now();

async function cleanupOwnStatusMessages() {
  const channel =
    client.channels.cache.get(
      IDS.channels.botDurum
    );

  if (!channel) return;

  try {
    const messages =
      await channel.messages.fetch({
        limit: 100
      });

    const botMessages =
      messages.filter(
        m =>
          m.author.id ===
          client.user.id
      );

    if (botMessages.size) {
      await channel.bulkDelete(
        botMessages,
        true
      ).catch(() => {});
    }
  } catch {}
}

async function sendStatus() {
  const channel =
    client.channels.cache.get(
      IDS.channels.botDurum
    );

  if (!channel) return;

  const uptime =
    (
      (Date.now() -
        botStartedAt) /
      3600000
    ).toFixed(1);

  await channel.send({
    embeds: [
      embed(
        "🤖 Axera League Bot Durumu",
        "🟢 **Tüm sistemler sorunsuz çalışıyor.**\n\n" +
        `⏱️ Uptime: **${uptime} saat**\n` +
        "📡 Durum: **Online**",
        0x57f287
      )
    ]
  }).catch(() => {});
}

/* =========================================================
   READY
   ========================================================= */

client.once(
  "ready",
  async () => {
    console.log(
      `✅ ${client.user.tag} olarak giriş yapıldı.`
    );

    setBotPresence();

    await cleanupOwnStatusMessages();
    await sendStatus();

    /*
       00 ve 30. dakikada durum mesajı
    */

    setInterval(
      async () => {
        const now =
          new Date();

        if (
          now.getMinutes() === 0 ||
          now.getMinutes() === 30
        ) {
          await cleanupOwnStatusMessages();
          await sendStatus();
        }
      },
      60000
    );

    /*
       Fikstür kontrolü
    */

    setInterval(
      async () => {
        const now =
          Date.now();

        for (
          const fixture of db.fixtures
        ) {
          if (
            fixture.played
          ) {
            continue;
          }

          const time =
            new Date(
              fixture.dateTime
            ).getTime();

          if (
            !Number.isFinite(
              time
            )
          ) {
            continue;
          }

          if (
            time <= now
          ) {
            fixture.played =
              true;

            saveData();

            const channel =
              client.channels.cache.get(
                IDS.channels.mac
              );

            if (!channel) {
              continue;
            }

            await channel.send({
              embeds: [
                embed(
                  "📅 FİKSTÜR MAÇI BAŞLIYOR",
                  `⚽ **${fixture.team1}** vs **${fixture.team2}**`
                )
              ]);

            await runMatch(
              channel,
              fixture.team1,
              fixture.team2,
              true
            );
          }
        }
      },
      1000
    );

    /*
       Ticket otomatik kapatma
    */

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
            ticket.closed
          ) {
            continue;
          }

          if (
            now -
              Number(
                ticket.lastActivity ||
                now
              ) >=
            60 * 60 * 1000
          ) {
            const channel =
              client.channels.cache.get(
                channelId
              );

            if (channel) {
              await channel.send(
                "🔒 Ticket 60 dakika hareketsizlik nedeniyle kapatıldı."
              ).catch(() => {});

              await channel.delete()
                .catch(() => {});
            }

            ticket.closed =
              true;

            saveData();
          }
        }
      },
      60000
    );
  }
);

/* =========================================================
   YENİ ÜYE
   ========================================================= */

client.on(
  "guildMemberAdd",
  async member => {
    try {
      if (
        IDS.roles.kayitsiz
      ) {
        await member.roles.add(
          IDS.roles.kayitsiz
        );
      }
    } catch (err) {
      console.error(
        "Kayıtsız rolü:",
        err.message
      );
    }
  }
);

/* =========================================================
   BUTTONLAR
   ========================================================= */

client.on(
  "interactionCreate",
  async interaction => {
    if (
      !interaction.isButton()
    ) {
      return;
    }

    /* ---------------- KAYIT ---------------- */

    if (
      interaction.customId
        .startsWith(
          "register_"
        )
    ) {
      const parts =
        interaction.customId
          .split("_");

      const type =
        parts[1];

      if (
        type === "cancel"
      ) {
        if (
          !isRegistrationStaff(
            interaction.member
          )
        ) {
          return interaction.reply({
            content:
              "❌ Bu işlem için yetkin yok.",
            ephemeral: true
          });
        }

        delete db
          .registrationPanels[
            interaction.message.id
          ];

        saveData();

        return interaction.update({
          embeds: [
            embed(
              "❌ Kayıt İptal Edildi",
              "Bu kayıt paneli iptal edildi.",
              0xed4245
            )
          ],
          components: []
        });
      }

      return finishRegister(
        interaction,
        type
      );
    }

    /* ---------------- TICKET ---------------- */

    if (
      interaction.customId ===
      "create_ticket"
    ) {
      await interaction.deferReply({
        ephemeral: true
      });

      return createTicket(
        interaction
      );
    }

    if (
      interaction.customId
        .startsWith(
          "ticket_close_"
        )
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
        !isModerator(
          interaction.member
        ) &&
        ticket.userId !==
          interaction.user.id
      ) {
        return interaction.reply({
          content:
            "❌ Bu ticketı kapatma yetkin yok.",
          ephemeral: true
        });
      }

      ticket.closed =
        true;

      saveData();

      await interaction.reply(
        "🔒 Ticket kapatılıyor..."
      );

      setTimeout(
        () => {
          interaction.channel
            .delete()
            .catch(() => {});
        },
        1500
      );

      return;
    }

    /* ---------------- ROL PANELİ ---------------- */

    if (
      interaction.customId
        .startsWith(
          "toggle_"
        )
    ) {
      const roleId =
        roleForToggle(
          interaction.customId
        );

      if (!roleId) {
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
        await interaction.member.roles.remove(
          roleId
        );

        return interaction.reply({
          content:
            "❌ Ping rolü kaldırıldı.",
          ephemeral: true
        });
      }

      await interaction.member.roles.add(
        roleId
      );

      return interaction.reply({
        content:
          "✅ Ping rolü verildi.",
        ephemeral: true
      });
    }

    /* ---------------- İLK 11 ---------------- */

    if (
      interaction.customId
        .startsWith(
          "xi_"
        )
    ) {
      if (
        !isSpeaker(
          interaction.member
        ) &&
        !isAdmin(
          interaction.member
        )
      ) {
        return interaction.reply({
          content:
            "❌ Bu panel için yetkin yok.",
          ephemeral: true
        });
      }

      const parts =
        interaction.customId
          .split("_");

      const action =
        parts[1];

      const teamName =
        parts
          .slice(2)
          .join("_");

      const formation =
        getFormation(
          teamName
        );

      if (
        action === "clear"
      ) {
        formation.players =
          [];

        saveFormation(
          teamName,
          formation
        );

        return interaction.update({
          embeds: [
            embed(
              `⚽ ${teamName} — İLK 11`,
              "🗑️ İlk 11 temizlendi."
            )
          ],
          components: []
        });
      }

      if (
        action === "add"
      ) {
        return interaction.reply({
          content:
            `Oyuncu eklemek için:\n` +
            "`.ilk11ekle @Takım @Oyuncu`",
          ephemeral: true
        });
      }

      if (
        action === "remove"
      ) {
        return interaction.reply({
          content:
            "Oyuncu çıkarmak için `.ilk11çıkar @Takım @Oyuncu` kullan.",
          ephemeral: true
        });
      }
    }
  }
);

/* =========================================================
   MESAJ KOMUTLARI
   ========================================================= */

client.on(
  "messageCreate",
  async message => {
    if (
      message.author.bot ||
      !message.guild
    ) {
      return;
    }

    /*
       Ticket aktivitesi
    */

    if (
      db.tickets[
        message.channel.id
      ]
    ) {
      db.tickets[
        message.channel.id
      ].lastActivity =
        Date.now();

      saveData();
    }

    const content =
      message.content.trim();

    /*
       AI KANALI
    */

    if (
      !content.startsWith(".")
    ) {
      if (
        message.channel.id ===
          IDS.channels.ai &&
        ai
      ) {
        const answer =
          await askAI(
            content
          );

        await message.reply({
          content: answer
        }).catch(() => {});
      }

      return;
    }

    const parts =
      content.split(/\s+/);

    const command =
      parts
        .shift()
        .toLowerCase();

    const args =
      parts;

    /* =====================================================
       .K
       ===================================================== */

    if (
      command === ".k"
    ) {
      if (
        !channelOnly(
          message,
          IDS.channels.kayit
        )
      ) return;

      if (
        !isRegistrationStaff(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komutu yalnızca Kayıt Yetkilisi veya Yönetici kullanabilir."
        );
      }

      const target =
        message.mentions.members
          .first();

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.k @Oyuncu İsim`"
        );
      }

      const nickname =
        args
          .filter(
            x =>
              !x.startsWith("<@")
          )
          .join(" ")
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
       .KAYITSIZVER
       ===================================================== */

    if (
      command ===
      ".kayıtsızver"
    ) {
      if (
        !isRegistrationStaff(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komut için Kayıt Yetkilisi veya Yönetici olmalısın."
        );
      }

      const target =
        message.mentions.members
          .first();

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.kayıtsızver @Oyuncu`"
        );
      }

      const roles =
        [
          IDS.roles.futbolcu,
          IDS.roles.uye,
          IDS.roles.td,
          IDS.roles.kaleci
        ].filter(Boolean);

      await target.roles.remove(
        roles
      ).catch(() => {});

      await target.roles.add(
        IDS.roles.kayitsiz
      ).catch(() => {});

      const user =
        getUserData(
          target.id
        );

      user.registered =
        false;

      user.team =
        null;

      saveData();

      return message.reply(
        `✅ <@${target.id}> Kayıtsız yapıldı.`
      );
    }

    /* =====================================================
       .ARA
       ===================================================== */

    if (
      command === ".ara"
    ) {
      const query =
        args
          .join(" ")
          .toLowerCase();

      if (!query) {
        return message.reply(
          "❌ Kullanım: `.ara oyuncu`"
        );
      }

      const members =
        await message.guild.members.fetch();

      const results =
        members.filter(
          member => {
            if (
              member.roles.cache.has(
                IDS.roles.kayitsiz
              )
            ) {
              return false;
            }

            const user =
              db.users[
                member.id
              ];

            const registeredName =
              user?.nickname ||
              "";

            return (
              member.displayName
                .toLowerCase()
                .includes(
                  query
                ) ||
              registeredName
                .toLowerCase()
                .includes(
                  query
                )
            );
          }
        );

      if (!results.size) {
        return message.reply(
          "❌ Oyuncu bulunamadı."
        );
      }

      const list =
        [
          ...results.values()
        ]
          .slice(0, 15)
          .map(
            member =>
              `👤 <@${member.id}> — **${member.displayName}**`
          )
          .join("\n");

      return message.reply({
        embeds: [
          embed(
            "🔎 Oyuncu Arama",
            list
          )
        ]
      });
    }

    /* =====================================================
       .DEĞER
       ===================================================== */

    if (
      command === ".değer"
    ) {
      if (
        !channelOnly(
          message,
          IDS.channels.deger
        )
      ) return;

      const target =
        message.mentions.members
          .first();

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.değer @Oyuncu`"
        );
      }

      /*
         DEĞER NICKNAME'DEN OKUNUR
      */

      const value =
        parseNickValue(
          target
        );

      return message.reply({
        embeds: [
          embed(
            "💰 Oyuncu Değeri",
            `👤 Oyuncu: <@${target.id}>\n` +
            `💵 Değer: **${money(value)}**`,
            0xf1c40f
          )
        ]
      });
    }

    /* =====================================================
       .DEĞERLİSTE
       ===================================================== */

    if (
      command ===
      ".değerliste"
    ) {
      if (
        !channelOnly(
          message,
          IDS.channels.deger
        )
      ) return;

      const members =
        await message.guild.members.fetch();

      const players = [];

      for (
        const member of members.values()
      ) {
        if (
          member.roles.cache.has(
            IDS.roles.kayitsiz
          )
        ) {
          continue;
        }

        const user =
          db.users[
            member.id
          ];

        if (
          !user?.registered
        ) {
          continue;
        }

        /*
           Değer NICKNAME'DEN okunuyor.
        */

        const value =
          parseNickValue(
            member
          );

        players.push({
          member,
          value
        });
      }

      players.sort(
        (a, b) =>
          b.value - a.value
      );

      const top =
        players.slice(0, 10);

      if (!top.length) {
        return message.reply(
          "❌ Kayıtlı oyuncu bulunamadı."
        );
      }

      const list =
        top
          .map(
            (p, i) =>
              `**${i + 1}.** <@${p.member.id}> — **${money(p.value)}**`
          )
          .join("\n");

      return message.reply({
        embeds: [
          embed(
            "🏆 Değer Listesi",
            list,
            0xf1c40f
          )
        ]
      });
    }

    /* =====================================================
       .DVER
       ===================================================== */

    if (
      command === ".dver"
    ) {
      if (
        !isValueStaff(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komut için Değer Yetkilisi veya Yönetici olmalısın."
        );
      }

      const target =
        message.mentions.members
          .first();

      const raw =
        args.find(
          x =>
            !x.startsWith("<@")
        );

      const amount =
        amountArg(raw);

      if (
        !target ||
        !Number.isFinite(amount)
      ) {
        return message.reply(
          "❌ Kullanım: `.dver @Oyuncu 5`"
        );
      }

      if (
        amount <= 0
      ) {
        return message.reply(
          "❌ Miktar 0'dan büyük olmalı."
        );
      }

      /*
         DEĞER NICKNAME'DEN OKUNUR
         VE ÜZERİNE EKLENİR.
      */

      const result =
        await changePlayerValue(
          target,
          amount,
          "Değer verme"
        );

      return message.reply(
        `✅ <@${target.id}> değerine **+${money(amount)}** eklendi.\n` +
        `💰 Yeni değer: **${money(result.newValue)}**`
      );
    }

    /* =====================================================
       .DSİL
       ===================================================== */

    if (
      command === ".dsil"
    ) {
      if (
        !isValueStaff(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komut için Değer Yetkilisi veya Yönetici olmalısın."
        );
      }

      const target =
        message.mentions.members
          .first();

      const raw =
        args.find(
          x =>
            !x.startsWith("<@")
        );

      const amount =
        amountArg(raw);

      if (
        !target ||
        !Number.isFinite(amount)
      ) {
        return message.reply(
          "❌ Kullanım: `.dsil @Oyuncu 5`"
        );
      }

      if (
        amount <= 0
      ) {
        return message.reply(
          "❌ Miktar 0'dan büyük olmalı."
        );
      }

      const result =
        await changePlayerValue(
          target,
          -amount,
          "Değer silme"
        );

      return message.reply(
        `✅ <@${target.id}> değerinden **-${money(amount)}** çıkarıldı.\n` +
        `💰 Yeni değer: **${money(result.newValue)}**`
      );
    }

    /* =====================================================
       .ANT / .ANTRENMAN
       OTOMATİK DEĞER = +1M€
       ===================================================== */

    if (
      command === ".ant" ||
      command === ".antrenman"
    ) {
      if (
        !channelOnly(
          message,
          IDS.channels.antrenman
        )
      ) return;

      const result =
        await changePlayerValue(
          message.member,
          1,
          "Antrenman otomatik değer ödülü"
        );

      return message.reply(
        `⚽ Antrenman tamamlandı!\n` +
        `💰 **+1M€**\n` +
        `📊 Yeni değer: **${money(result.newValue)}**`
      );
    }

    /* =====================================================
       .PEN / .PENALTI
       OTOMATİK DEĞER = GOLDE +5M€
       ===================================================== */

    if (
      command === ".pen" ||
      command === ".penaltı" ||
      command === ".penalti"
    ) {
      if (
        !channelOnly(
          message,
          IDS.channels.penalti
        )
      ) return;

      const chance =
        Math.random();

      /*
         %50 GOL
         %25 DİREK
         %25 KALECİ
      */

      if (
        chance < 0.50
      ) {
        const result =
          await changePlayerValue(
            message.member,
            5,
            "Penaltı otomatik gol ödülü"
          );

        return message.reply({
          embeds: [
            embed(
              "⚽ GOOOOL!",
              "🥅 Penaltı gol oldu!\n\n" +
              "💰 **+5M€**\n" +
              `📊 Yeni değer: **${money(result.newValue)}**`,
              0x57f287
            )
          ]
        });
      }

      if (
        chance < 0.75
      ) {
        return message.reply({
          embeds: [
            embed(
              "🥅 DİREK!",
              "Top direkten döndü.",
              0xfee75c
            )
          ]
        });
      }

      return message.reply({
        embeds: [
          embed(
            "🧤 KALECİ!",
            "Kaleci penaltıyı kurtardı.",
            0xed4245
          )
        ]
      });
    }

    /* =====================================================
       .TWEET
       OTOMATİK DEĞER = +10M€
       ===================================================== */

    if (
      command === ".tweet"
    ) {
      if (
        !channelOnly(
          message,
          IDS.channels.tweet
        )
      ) return;

      const tweet =
        args
          .join(" ")
          .trim();

      if (!tweet) {
        return message.reply(
          "❌ Kullanım: `.tweet mesaj`"
        );
      }

      const now =
        Date.now();

      const last =
        Number(
          db.tweetCooldowns[
            message.author.id
          ] || 0
        );

      const cooldown =
        2 *
        60 *
        60 *
        1000;

      if (
        now - last <
        cooldown
      ) {
        const remaining =
          cooldown -
          (now - last);

        return message.reply(
          `⏳ Tekrar tweet ödülü almak için **${Math.ceil(remaining / 60000)} dakika** beklemelisin.`
        );
      }

      /*
         Önce ödülü nickname üzerinden hesapla.
      */

      const result =
        await changePlayerValue(
          message.member,
          10,
          "Tweet otomatik değer ödülü"
        );

      db.tweetCooldowns[
        message.author.id
      ] = now;

      saveData();

      await message.delete()
        .catch(() => {});

      return message.channel.send({
        embeds: [
          embed(
            "🐦 Axera Tweet",
            `👤 **${message.member.displayName}**\n\n` +
            `${tweet}\n\n` +
            "💰 Tweet ödülü: **+10M€**\n" +
            `📊 Yeni değer: **${money(result.newValue)}**`
          )
        ]
      });
    }

    /* =====================================================
       .MAÇ
       ===================================================== */

    if (
      command === ".maç"
    ) {
      if (
        !isSpeaker(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komut için Spiker veya Yönetici olmalısın."
        );
      }

      if (
        !channelOnly(
          message,
          IDS.channels.mac
        )
      ) return;

      const roles =
        [
          ...message.mentions.roles.values()
        ];

      if (
        roles.length < 2
      ) {
        return message.reply(
          "❌ Kullanım: `.maç @Takım1 @Takım2`"
        );
      }

      const team1 =
        roles[0].name;

      const team2 =
        roles[1].name;

      if (
        !teamByName(team1) ||
        !teamByName(team2)
      ) {
        return message.reply(
          "❌ Takımlardan biri bulunamadı."
        );
      }

      return runMatch(
        message.channel,
        team1,
        team2
      );
    }

    /* =====================================================
       .İLK11
       ===================================================== */

    if (
      command === ".ilk11"
    ) {
      if (
        !isSpeaker(
          message.member
        ) &&
        !isAdmin(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komut için Spiker veya Yönetici olmalısın."
        );
      }

      const role =
        message.mentions.roles
          .first();

      const teamName =
        role
          ? role.name
          : args.join(" ");

      if (!teamName) {
        return message.reply(
          "❌ Kullanım: `.ilk11 @Takım`"
        );
      }

      ensureTeam(
        teamName,
        role?.id || null
      );

      const formation =
        getFormation(
          teamName
        );

      const players =
        formation.players.length
          ? formation.players
              .map(
                id =>
                  `<@${id}>`
              )
              .join("\n")
          : "Henüz oyuncu eklenmedi.";

      const row =
        new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(
                `xi_add_${teamName}`
              )
              .setLabel(
                "➕ Oyuncu Ekle"
              )
              .setStyle(
                ButtonStyle.Success
              ),

            new ButtonBuilder()
              .setCustomId(
                `xi_remove_${teamName}`
              )
              .setLabel(
                "➖ Oyuncu Çıkar"
              )
              .setStyle(
                ButtonStyle.Danger
              ),

            new ButtonBuilder()
              .setCustomId(
                `xi_clear_${teamName}`
              )
              .setLabel(
                "🗑️ Temizle"
              )
              .setStyle(
                ButtonStyle.Secondary
              )
          );

      return message.reply({
        embeds: [
          embed(
            `⚽ ${teamName} — İLK 11`,
            `📐 Formasyon: **${formation.formation}**\n\n${players}`
          )
        ],
        components: [
          row
        ]
      });
    }

    /* =====================================================
       .İLK11EKLE
       ===================================================== */

    if (
      command === ".ilk11ekle"
    ) {
      if (
        !isSpeaker(
          message.member
        ) &&
        !isAdmin(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komut için Spiker veya Yönetici olmalısın."
        );
      }

      const roles =
        [
          ...message.mentions.roles.values()
        ];

      const target =
        message.mentions.members
          .first();

      if (
        roles.length < 1 ||
        !target
      ) {
        return message.reply(
          "❌ Kullanım: `.ilk11ekle @Takım @Oyuncu`"
        );
      }

      const teamName =
        roles[0].name;

      const formation =
        getFormation(
          teamName
        );

      if (
        formation.players.includes(
          target.id
        )
      ) {
        return message.reply(
          "❌ Bu oyuncu zaten ilk 11'de."
        );
      }

      if (
        formation.players.length >= 11
      ) {
        return message.reply(
          "❌ İlk 11 zaten 11 oyuncudan oluşuyor."
        );
      }

      formation.players.push(
        target.id
      );

      saveFormation(
        teamName,
        formation
      );

      return message.reply(
        `✅ <@${target.id}> **${teamName}** ilk 11'ine eklendi.`
      );
    }

    /* =====================================================
       .İLK11ÇIKAR
       ===================================================== */

    if (
      command === ".ilk11çıkar" ||
      command === ".ilk11cikar"
    ) {
      if (
        !isSpeaker(
          message.member
        ) &&
        !isAdmin(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komut için Spiker veya Yönetici olmalısın."
        );
      }

      const roles =
        [
          ...message.mentions.roles.values()
        ];

      const target =
        message.mentions.members
          .first();

      if (
        roles.length < 1 ||
        !target
      ) {
        return message.reply(
          "❌ Kullanım: `.ilk11çıkar @Takım @Oyuncu`"
        );
      }

      const teamName =
        roles[0].name;

      const formation =
        getFormation(
          teamName
        );

      formation.players =
        formation.players.filter(
          id =>
            id !== target.id
        );

      saveFormation(
        teamName,
        formation
      );

      return message.reply(
        `✅ <@${target.id}> **${teamName}** ilk 11'inden çıkarıldı.`
      );
    }

    /* =====================================================
       .TAKIMMEKLE
       ===================================================== */

    if (
      command === ".takımekle"
    ) {
      if (
        !isAdmin(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komut yalnızca Yöneticiler içindir."
        );
      }

      const role =
        message.mentions.roles
          .first();

      if (!role) {
        return message.reply(
          "❌ Kullanım: `.takımekle @Takım`"
        );
      }

      ensureTeam(
        role.name,
        role.id
      );

      ensureStandings(
        role.name
      );

      saveData();

      return message.reply(
        `✅ **${role.name}** takımı eklendi.`
      );
    }

    /* =====================================================
       .TAKIMKALDIR
       ===================================================== */

    if (
      command ===
      ".takımkaldır"
    ) {
      if (
        !isAdmin(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komut yalnızca Yöneticiler içindir."
        );
      }

      const role =
        message.mentions.roles
          .first();

      const name =
        role
          ? role.name
          : args.join(" ");

      if (!name) {
        return message.reply(
          "❌ Kullanım: `.takımkaldır @Takım`"
        );
      }

      delete db.teams[name];
      delete db.standings[name];

      saveData();

      return message.reply(
        `✅ **${name}** takımı kaldırıldı.`
      );
    }

    /* =====================================================
       .PUANEKLE
       ===================================================== */

    if (
      command === ".puanekle"
    ) {
      if (
        !isAdmin(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komut yalnızca Yöneticiler içindir."
        );
      }

      const role =
        message.mentions.roles
          .first();

      const raw =
        args.find(
          x =>
            !x.startsWith("<@")
        );

      const amount =
        Number(raw);

      if (
        !role ||
        !Number.isFinite(
          amount
        )
      ) {
        return message.reply(
          "❌ Kullanım: `.puanekle @Takım 3`"
        );
      }

      const standing =
        ensureStandings(
          role.name
        );

      standing.points +=
        amount;

      saveData();

      return message.reply(
        `✅ **${role.name}** takımına **${amount} puan** eklendi.`
      );
    }

    /* =====================================================
       .TAKIMDEĞER
       ===================================================== */

    if (
      command ===
      ".takımdeğer"
    ) {
      if (
        !isAdmin(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komut yalnızca Yöneticiler içindir."
        );
      }

      const role =
        message.mentions.roles
          .first();

      const raw =
        args.find(
          x =>
            !x.startsWith("<@")
        );

      const amount =
        amountArg(raw);

      if (
        !role ||
        !Number.isFinite(
          amount
        )
      ) {
        return message.reply(
          "❌ Kullanım: `.takımdeğer @Takım 850M`"
        );
      }

      const team =
        ensureTeam(
          role.name,
          role.id
        );

      team.value =
        Math.min(
          1000,
          Math.max(
            0,
            amount
          )
        );

      saveData();

      return message.reply(
        `✅ **${role.name}** takım değeri **${money(team.value)}** olarak ayarlandı.`
      );
    }

    /* =====================================================
       .FORMASYON
       ===================================================== */

    if (
      command === ".formasyon"
    ) {
      const role =
        message.mentions.roles
          .first();

      const teamName =
        role
          ? role.name
          : args.join(" ");

      if (!teamName) {
        return message.reply(
          "❌ Kullanım: `.formasyon @Takım`"
        );
      }

      const formation =
        getFormation(
          teamName
        );

      const menu =
        new StringSelectMenuBuilder()
          .setCustomId(
            `formation_${teamName}`
          )
          .setPlaceholder(
            "Formasyon seç"
          )
          .addOptions(
            {
              label: "4-3-3",
              value: "4-3-3"
            },
            {
              label: "4-4-2",
              value: "4-4-2"
            },
            {
              label: "4-2-3-1",
              value: "4-2-3-1"
            },
            {
              label: "3-5-2",
              value: "3-5-2"
            },
            {
              label: "3-4-3",
              value: "3-4-3"
            }
          );

      return message.reply({
        embeds: [
          embed(
            `📐 ${teamName} Formasyonu`,
            `Mevcut formasyon: **${formation.formation}**`
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
       .PUAN
       ===================================================== */

    if (
      command === ".puan"
    ) {
      const entries =
        Object.entries(
          db.standings
        );

      if (!entries.length) {
        return message.reply(
          "❌ Henüz puan durumu yok."
        );
      }

      entries.sort(
        (a, b) => {
          if (
            b[1].points !==
            a[1].points
          ) {
            return (
              b[1].points -
              a[1].points
            );
          }

          return (
            b[1].gd -
            a[1].gd
          );
        }
      );

      const table =
        entries
          .map(
            ([name, s], i) =>
              `**${i + 1}. ${name}** — ${s.points} P | ${s.played} O | ${s.wins} G | ${s.draws} B | ${s.losses} M | ${s.gd >= 0 ? "+" : ""}${s.gd} AV`
          )
          .join("\n");

      return message.reply({
        embeds: [
          embed(
            "🏆 AXERA LEAGUE — PUAN DURUMU",
            table
          )
        ]
      });
    }

    /* =====================================================
       .FİKSTÜREKLE
       ===================================================== */

    if (
      command ===
        ".fiksturekle" ||
      command ===
        ".fikstürekle"
    ) {
      if (
        !isSpeaker(
          message.member
        ) &&
        !isAdmin(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komut için Spiker veya Yönetici olmalısın."
        );
      }

      const roles =
        [
          ...message.mentions.roles.values()
        ];

      if (
        roles.length < 2
      ) {
        return message.reply(
          "❌ İki takım etiketlemelisin."
        );
      }

      const team1 =
        roles[0].name;

      const team2 =
        roles[1].name;

      const dateText =
        args
          .filter(
            x =>
              !x.startsWith("<@&")
          )
          .join(" ");

      if (!dateText) {
        return message.reply(
          "❌ Örnek: `.fiksturekle @Takım1 @Takım2 2026-09-15 20:00`"
        );
      }

      const parsed =
        new Date(
          dateText.replace(
            " ",
            "T"
          )
        );

      if (
        Number.isNaN(
          parsed.getTime()
        )
      ) {
        return message.reply(
          "❌ Geçerli tarih gir."
        );
      }

      const fixture =
        createFixture(
          team1,
          team2,
          parsed.toISOString()
        );

      return message.reply({
        embeds: [
          embed(
            "📅 Fikstür Eklendi",
            `⚽ **${team1}** vs **${team2}**\n` +
            `🕐 ${parsed.toLocaleString("tr-TR")}\n` +
            `🆔 ID: **${fixture.id}**`,
            0x57f287
          )
        ]
      });
    }

    /* =====================================================
       .FİKSTÜR
       ===================================================== */

    if (
      command ===
        ".fikstür" ||
      command ===
        ".fikstur"
    ) {
      const fixtures =
        db.fixtures
          .filter(
            x =>
              !x.played
          )
          .sort(
            (a, b) =>
              new Date(
                a.dateTime
              ) -
              new Date(
                b.dateTime
              )
          )
          .slice(0, 20);

      if (!fixtures.length) {
        return message.reply(
          "📅 Bekleyen fikstür yok."
        );
      }

      const list =
        fixtures
          .map(
            f =>
              `🆔 **${f.id}** — **${f.team1}** vs **${f.team2}**\n🕐 ${new Date(f.dateTime).toLocaleString("tr-TR")}`
          )
          .join("\n\n");

      return message.reply({
        embeds: [
          embed(
            "📅 AXERA LEAGUE — FİKSTÜR",
            list
          )
        ]
      });
    }

    /* =====================================================
       .FİKSTURCİKAR
       ===================================================== */

    if (
      command ===
        ".fiksturcikar" ||
      command ===
        ".fikstürçıkar"
    ) {
      if (
        !isAdmin(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komut yalnızca Yöneticiler içindir."
        );
      }

      const roles =
        [
          ...message.mentions.roles.values()
        ];

      if (
        roles.length < 2
      ) {
        return message.reply(
          "❌ İki takım etiketlemelisin."
        );
      }

      const team1 =
        roles[0].name;

      const team2 =
        roles[1].name;

      const index =
        db.fixtures.findIndex(
          f =>
            f.team1 === team1 &&
            f.team2 === team2 &&
            !f.played
        );

      if (
        index === -1
      ) {
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
        `✅ **${team1} vs ${team2}** fikstürü kaldırıldı.`
      );
    }

    /* =====================================================
       .BÜTÇEEKLE
       ===================================================== */

    if (
      command ===
      ".bütçeekle"
    ) {
      if (
        !isValueStaff(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komut için Değer Yetkilisi veya Yönetici olmalısın."
        );
      }

      const target =
        message.mentions.members
          .first();

      const raw =
        args.find(
          x =>
            !x.startsWith("<@")
        );

      const amount =
        amountArg(raw);

      if (
        !target ||
        !Number.isFinite(
          amount
        )
      ) {
        return message.reply(
          "❌ Kullanım: `.bütçeekle @Oyuncu 50M`"
        );
      }

      const user =
        getUserData(
          target.id
        );

      user.budget =
        Math.max(
          0,
          Number(
            user.budget || 0
          ) + amount
        );

      saveData();

      return message.reply(
        `✅ <@${target.id}> kişisel bütçesine **${money(amount)}** eklendi.\n` +
        `💰 Bütçe: **${money(user.budget)}**`
      );
    }

    /* =====================================================
       .BÜTÇESİL
       ===================================================== */

    if (
      command ===
      ".bütçesil"
    ) {
      if (
        !isValueStaff(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komut için Değer Yetkilisi veya Yönetici olmalısın."
        );
      }

      const target =
        message.mentions.members
          .first();

      const raw =
        args.find(
          x =>
            !x.startsWith("<@")
        );

      const amount =
        amountArg(raw);

      if (
        !target ||
        !Number.isFinite(
          amount
        )
      ) {
        return message.reply(
          "❌ Kullanım: `.bütçesil @Oyuncu 50M`"
        );
      }

      const user =
        getUserData(
          target.id
        );

      user.budget =
        Math.max(
          0,
          Number(
            user.budget || 0
          ) - amount
        );

      saveData();

      return message.reply(
        `✅ <@${target.id}> kişisel bütçesinden **${money(amount)}** çıkarıldı.\n` +
        `💰 Bütçe: **${money(user.budget)}**`
      );
    }

    /* =====================================================
       .GÖNDER
       ===================================================== */

    if (
      command === ".gönder"
    ) {
      const target =
        message.mentions.members
          .first();

      const raw =
        args.find(
          x =>
            !x.startsWith("<@")
        );

      const amount =
        amountArg(raw);

      if (
        !target ||
        !Number.isFinite(
          amount
        )
      ) {
        return message.reply(
          "❌ Kullanım: `.gönder @Oyuncu 10M`"
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

      if (
        amount <= 0
      ) {
        return message.reply(
          "❌ Miktar 0'dan büyük olmalı."
        );
      }

      const sender =
        getUserData(
          message.author.id
        );

      const receiver =
        getUserData(
          target.id
        );

      if (
        Number(
          sender.budget || 0
        ) < amount
      ) {
        return message.reply(
          "❌ Yeterli kişisel bütçen yok."
        );
      }

      sender.budget -=
        amount;

      receiver.budget =
        Number(
          receiver.budget || 0
        ) + amount;

      saveData();

      return message.reply(
        `✅ <@${target.id}> kişisine **${money(amount)}** gönderildi.\n` +
        `💰 Kalan bütçen: **${money(sender.budget)}**`
      );
    }

    /* =====================================================
       .BÜTÇE
       ===================================================== */

    if (
      command === ".bütçe"
    ) {
      const target =
        message.mentions.members
          .first() ||
        message.member;

      const user =
        getUserData(
          target.id
        );

      return message.reply({
        embeds: [
          embed(
            "💰 Kişisel Bütçe",
            `👤 Oyuncu: <@${target.id}>\n` +
            `💵 Bütçe: **${money(user.budget || 0)}**`,
            0xf1c40f
          )
        ]
      });
    }

    /* =====================================================
       .TICKETPANEL
       ===================================================== */

    if (
      command ===
      ".ticketpanel"
    ) {
      if (
        !isStaff(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komut için yetkin yok."
        );
      }

      const row =
        new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(
                "create_ticket"
              )
              .setLabel(
                "🎫 Ticket Oluştur"
              )
              .setStyle(
                ButtonStyle.Primary
              )
          );

      return message.channel.send({
        embeds: [
          embed(
            "🎫 Axera League Destek",
            "Destek almak için aşağıdaki butona basarak özel ticket oluşturabilirsin."
          )
        ],
        components: [
          row
        ]
      });
    }

    /* =====================================================
       .SİL
       ===================================================== */

    if (
      command === ".sil"
    ) {
      if (
        !isAdmin(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komut yalnızca Yöneticiler içindir."
        );
      }

      const amount =
        Number(args[0]);

      if (
        !Number.isInteger(
          amount
        ) ||
        amount < 1 ||
        amount > 1000
      ) {
        return message.reply(
          "❌ Kullanım: `.sil 1-1000`"
        );
      }

      await message.delete()
        .catch(() => {});

      const messages =
        await message.channel.messages.fetch({
          limit:
            Math.min(
              amount,
              100
            )
        });

      const deletable =
        messages.filter(
          m =>
            !m.pinned &&
            Date.now() -
              m.createdTimestamp <
              14 *
              24 *
              60 *
              60 *
              1000
        );

      await message.channel
        .bulkDelete(
          deletable,
          true
        )
        .catch(() => {});

      const info =
        await message.channel.send(
          `🗑️ **${deletable.size}** mesaj silindi.`
        );

      setTimeout(
        () =>
          info.delete()
            .catch(() => {}),
        3000
      );

      return;
    }

    /* =====================================================
       .EMBED
       ===================================================== */

    if (
      command === ".embed"
    ) {
      if (
        !isStaff(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komut için yetkin yok."
        );
      }

      const raw =
        args.join(" ");

      const split =
        raw.split("|");

      const title =
        cleanName(
          split.shift()
        );

      const description =
        cleanName(
          split.join("|")
        );

      if (
        !title ||
        !description
      ) {
        return message.reply(
          "❌ Kullanım: `.embed Başlık | Açıklama`"
        );
      }

      await message.delete()
        .catch(() => {});

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
       .KICK
       ===================================================== */

    if (
      command === ".kick"
    ) {
      if (
        !isModerator(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komut için Moderatör veya Yönetici olmalısın."
        );
      }

      const target =
        message.mentions.members
          .first();

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.kick @Oyuncu`"
        );
      }

      try {
        await target.kick(
          "Axera League moderasyon"
        );

        return message.reply(
          `👢 <@${target.id}> sunucudan atıldı.`
        );
      } catch {
        return message.reply(
          "❌ Oyuncu atılamadı."
        );
      }
    }

    /* =====================================================
       .BAN
       ===================================================== */

    if (
      command === ".ban"
    ) {
      if (
        !isModerator(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komut için Moderatör veya Yönetici olmalısın."
        );
      }

      const target =
        message.mentions.members
          .first();

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.ban @Oyuncu`"
        );
      }

      try {
        await target.ban({
          reason:
            "Axera League moderasyon"
        });

        return message.reply(
          `🔨 <@${target.id}> yasaklandı.`
        );
      } catch {
        return message.reply(
          "❌ Oyuncu yasaklanamadı."
        );
      }
    }

    /* =====================================================
       .MUTE
       ===================================================== */

    if (
      command === ".mute"
    ) {
      if (
        !isModerator(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komut için Moderatör veya Yönetici olmalısın."
        );
      }

      const target =
        message.mentions.members
          .first();

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.mute @Oyuncu`"
        );
      }

      try {
        await target.timeout(
          10 * 60 * 1000,
          "Axera League moderasyon"
        );

        return message.reply(
          `🔇 <@${target.id}> 10 dakika susturuldu.`
        );
      } catch {
        return message.reply(
          "❌ Oyuncu susturulamadı."
        );
      }
    }

    /* =====================================================
       .UNMUTE
       ===================================================== */

    if (
      command === ".unmute"
    ) {
      if (
        !isModerator(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komut için Moderatör veya Yönetici olmalısın."
        );
      }

      const target =
        message.mentions.members
          .first();

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.unmute @Oyuncu`"
        );
      }

      await target.timeout(
        null,
        "Axera League unmute"
      ).catch(() => {});

      return message.reply(
        `🔊 <@${target.id}> susturması kaldırıldı.`
      );
    }

    /* =====================================================
       .DM
       ===================================================== */

    if (
      command === ".dm"
    ) {
      if (
        !isStaff(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komut için yetkin yok."
        );
      }

      const target =
        message.mentions.members
          .first();

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.dm @Oyuncu mesaj`"
        );
      }

      const text =
        args
          .filter(
            x =>
              !x.startsWith("<@")
          )
          .join(" ")
          .trim();

      if (!text) {
        return message.reply(
          "❌ Gönderilecek mesajı yaz."
        );
      }

      try {
        await target.send({
          embeds: [
            embed(
              "📩 Axera League",
              text
            )
          ]
        });

        return message.reply(
          "✅ Mesaj oyuncuya gönderildi."
        );
      } catch {
        return message.reply(
          "❌ Oyuncuya DM gönderilemedi."
        );
      }
    }

    /* =====================================================
       .ROLVER
       ===================================================== */

    if (
      command === ".rolver"
    ) {
      if (
        !isAdmin(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komut yalnızca Yöneticiler içindir."
        );
      }

      const target =
        message.mentions.members
          .first();

      const role =
        message.mentions.roles
          .first();

      if (
        !target ||
        !role
      ) {
        return message.reply(
          "❌ Kullanım: `.rolver @Oyuncu @Rol`"
        );
      }

      try {
        await target.roles.add(
          role
        );

        return message.reply(
          `✅ <@${target.id}> kişisine <@&${role.id}> rolü verildi.`
        );
      } catch {
        return message.reply(
          "❌ Rol verilemedi. Botun rolü hedef rolden yukarıda olmalı."
        );
      }
    }

    /* =====================================================
       .ROLAL
       ===================================================== */

    if (
      command === ".rolal"
    ) {
      if (
        !isAdmin(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komut yalnızca Yöneticiler içindir."
        );
      }

      const target =
        message.mentions.members
          .first();

      const role =
        message.mentions.roles
          .first();

      if (
        !target ||
        !role
      ) {
        return message.reply(
          "❌ Kullanım: `.rolal @Oyuncu @Rol`"
        );
      }

      try {
        await target.roles.remove(
          role
        );

        return message.reply(
          `✅ <@${target.id}> kişisinden <@&${role.id}> rolü alındı.`
        );
      } catch {
        return message.reply(
          "❌ Rol alınamadı."
        );
      }
    }

    /* =====================================================
       .ROLVERHEPSİ
       YENİ KULLANIM:
       .rolverhepsi @Rol
       ===================================================== */

    if (
      command ===
      ".rolverhepsi"
    ) {
      if (
        !isAdmin(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komut yalnızca Yöneticiler içindir."
        );
      }

      const role =
        message.mentions.roles
          .first();

      if (!role) {
        return message.reply(
          "❌ Kullanım: `.rolverhepsi @Rol`"
        );
      }

      const botMember =
        message.guild.members.me;

      if (
        botMember &&
        role.position >=
          botMember.roles.highest.position
      ) {
        return message.reply(
          "❌ Bu rol botun en yüksek rolünden yukarıda veya eşit. Discord izinleri nedeniyle veremem."
        );
      }

      await message.guild.members.fetch();

      let count = 0;
      let failed = 0;

      for (
        const member of
          message.guild.members.cache.values()
      ) {
        /*
           Bot hesaplarına vermiyoruz.
        */

        if (
          member.user.bot
        ) {
          continue;
        }

        if (
          member.roles.cache.has(
            role.id
          )
        ) {
          continue;
        }

        /*
           Botun yönetebileceği üyeleri kontrol et.
        */

        if (
          botMember &&
          member.roles.highest.position >=
            botMember.roles.highest.position
        ) {
          failed++;
          continue;
        }

        try {
          await member.roles.add(
            role,
            "Axera League - rolverhepsi"
          );

          count++;
        } catch (err) {
          failed++;

          console.log(
            `Rol verilemedi: ${member.user.tag}`,
            err.message
          );
        }
      }

      return message.reply(
        `✅ **${count}** kişiye <@&${role.id}> rolü verildi.` +
        (failed
          ? `\n⚠️ **${failed}** kişiye Discord izinleri nedeniyle verilemedi.`
          : "")
      );
    }

    /* =====================================================
       .ROLALHEPSİ
       YENİ KULLANIM:
       .rolalhepsi @Rol
       ===================================================== */

    if (
      command ===
      ".rolalhepsi"
    ) {
      if (
        !isAdmin(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komut yalnızca Yöneticiler içindir."
        );
      }

      const role =
        message.mentions.roles
          .first();

      if (!role) {
        return message.reply(
          "❌ Kullanım: `.rolalhepsi @Rol`"
        );
      }

      const botMember =
        message.guild.members.me;

      if (
        botMember &&
        role.position >=
          botMember.roles.highest.position
      ) {
        return message.reply(
          "❌ Bu rol botun en yüksek rolünden yukarıda veya eşit. Discord izinleri nedeniyle alamam."
        );
      }

      await message.guild.members.fetch();

      let count = 0;
      let failed = 0;

      for (
        const member of
          message.guild.members.cache.values()
      ) {
        if (
          member.user.bot
        ) {
          continue;
        }

        if (
          !member.roles.cache.has(
            role.id
          )
        ) {
          continue;
        }

        if (
          botMember &&
          member.roles.highest.position >=
            botMember.roles.highest.position
        ) {
          failed++;
          continue;
        }

        try {
          await member.roles.remove(
            role,
            "Axera League - rolalhepsi"
          );

          count++;
        } catch (err) {
          failed++;

          console.log(
            `Rol alınamadı: ${member.user.tag}`,
            err.message
          );
        }
      }

      return message.reply(
        `✅ **${count}** kişiden <@&${role.id}> rolü alındı.` +
        (failed
          ? `\n⚠️ **${failed}** kişiden Discord izinleri nedeniyle alınamadı.`
          : "")
      );
    }

    /* =====================================================
       .ROLPANEL
       ===================================================== */

    if (
      command === ".rolpanel"
    ) {
      if (
        !isAdmin(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komut yalnızca Yöneticiler içindir."
        );
      }

      const panel =
        await message.channel.send({
          embeds: [
            embed(
              "🎛️ Axera League Rol Paneli",
              "Bildirim rollerini aşağıdaki butonlardan açıp kapatabilirsin."
            )
          ],
          components: [
            rolePanelRow()
          ]
        });

      db.rolePanel = {
        channelId:
          message.channel.id,
        messageId:
          panel.id
      };

      saveData();

      return;
    }

    /* =====================================================
       .ŞART
       ===================================================== */

    if (
      command === ".şart" ||
      command === ".sart"
    ) {
      return message.reply({
        embeds: [
          embed(
            "📜 Axera League Şartları",
            "ℹ️ Bu bölüm bilgilendirme amaçlıdır.\n\n" +
            "📋 Kayıt işlemleri Kayıt Yetkilileri tarafından yapılır.\n" +
            "💰 Değer işlemleri Değer Yetkilileri tarafından yapılır.\n" +
            "⚽ Maç ve fikstür işlemleri Spikerler tarafından yönetilir.\n\n" +
            "Kayıtsız rolü diğer sistemleri kullanmaya tek başına engel değildir."
          )
        ]
      });
    }

    /* =====================================================
       .AI
       ===================================================== */

    if (
      command === ".ai" ||
      command === ".yapayzeka"
    ) {
      const prompt =
        args
          .join(" ")
          .trim();

      if (!prompt) {
        return message.reply(
          "❌ Kullanım: `.ai mesaj`"
        );
      }

      const answer =
        await askAI(
          prompt
        );

      return message.reply({
        content:
          answer
      });
    }

    /* =====================================================
       .YARDIM
       ===================================================== */

    if (
      command === ".yardım"
    ) {
      return message.reply({
        embeds: [
          embed(
            "📚 AXERA LEAGUE — KOMUTLAR",

            [
              "**👤 KAYIT**",
              "`.k @Oyuncu İsim`",
              "`.kayıtsızver @Oyuncu`",
              "`.ara oyuncu`",

              "",

              "**💰 DEĞER**",
              "`.değer @Oyuncu`",
              "`.değerliste`",
              "`.dver @Oyuncu 5`",
              "`.dsil @Oyuncu 5`",

              "",

              "**⚽ OYUNCU**",
              "`.ant`",
              "`.antrenman`",
              "`.pen`",
              "`.penaltı`",
              "`.tweet mesaj`",

              "",

              "**🏟️ MAÇ / TAKIM**",
              "`.maç @Takım1 @Takım2`",
              "`.ilk11 @Takım`",
              "`.ilk11ekle @Takım @Oyuncu`",
              "`.ilk11çıkar @Takım @Oyuncu`",
              "`.takımekle @Takım`",
              "`.takımkaldır @Takım`",
              "`.puanekle @Takım 3`",
              "`.takımdeğer @Takım 850M`",
              "`.formasyon @Takım`",
              "`.puan`",
              "`.fiksturekle @Takım1 @Takım2 2026-09-15 20:00`",
              "`.fikstür`",
              "`.fiksturcikar @Takım1 @Takım2`",

              "",

              "**💵 KİŞİSEL BÜTÇE**",
              "`.bütçe`",
              "`.bütçeekle @Oyuncu 50M`",
              "`.bütçesil @Oyuncu 50M`",
              "`.gönder @Oyuncu 10M`",

              "",

              "**🛡️ YETKİLİ**",
              "`.sil 10`",
              "`.embed Başlık | Açıklama`",
              "`.kick @Oyuncu`",
              "`.ban @Oyuncu`",
              "`.mute @Oyuncu`",
              "`.unmute @Oyuncu`",
              "`.dm @Oyuncu mesaj`",

              "",

              "**👑 YÖNETİCİ**",
              "`.rolver @Oyuncu @Rol`",
              "`.rolal @Oyuncu @Rol`",
              "`.rolverhepsi @Rol`",
              "`.rolalhepsi @Rol`",
              "`.rolpanel`",

              "",

              "**🎫 DESTEK / AI**",
              "`.ticketpanel`",
              "`.ai mesaj`",
              "`.yapayzeka mesaj`"
            ].join("\n")
          )
        ]
      });
    }

    /* =====================================================
       ÖZEL CEVAPLAR
       ===================================================== */

    if (
      /seni kim kurdu/i.test(
        content
      )
    ) {
      return message.reply(
        "Lynox9380 kurdu."
      );
    }

    if (
      /yapay zeka altyapısı/i.test(
        content
      )
    ) {
      return message.reply(
        "Axera League"
      );
    }
  }
);

/* =========================================================
   SELECT MENU
   ========================================================= */

client.on(
  "interactionCreate",
  async interaction => {
    if (
      !interaction.isStringSelectMenu()
    ) {
      return;
    }

    if (
      interaction.customId
        .startsWith(
          "formation_"
        )
    ) {
      if (
        !isSpeaker(
          interaction.member
        ) &&
        !isAdmin(
          interaction.member
        )
      ) {
        return interaction.reply({
          content:
            "❌ Bu işlem için yetkin yok.",
          ephemeral: true
        });
      }

      const teamName =
        interaction.customId
          .replace(
            "formation_",
            ""
          );

      const formation =
        getFormation(
          teamName
        );

      formation.formation =
        interaction.values[0];

      saveFormation(
        teamName,
        formation
      );

      return interaction.update({
        embeds: [
          embed(
            `📐 ${teamName} Formasyonu`,
            `Yeni formasyon: **${formation.formation}**`,
            0x57f287
          )
        ],
        components: []
      });
    }
  }
);

/* =========================================================
   HATA YAKALAMA
   ========================================================= */

process.on(
  "unhandledRejection",
  error => {
    console.error(
      "Unhandled Rejection:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  error => {
    console.error(
      "Uncaught Exception:",
      error
    );
  }
);

/* =========================================================
   TOKEN
   ========================================================= */

client.login(TOKEN);
