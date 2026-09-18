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
   Node.js 22+
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
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences
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
  rolePanel: null,
  lastStatusMessageId: null
};

let db = loadData();

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return structuredClone(DEFAULT);
    }

    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

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
    console.error("Veri yüklenemedi:", err);
    return structuredClone(DEFAULT);
  }
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
  } catch (err) {
    console.error("Veri kaydedilemedi:", err);
  }
}

/* =========================================================
   YARDIMCI FONKSİYONLAR
   ========================================================= */

function cleanName(name) {
  return String(name || "")
    .replace(/[*_`~]/g, "")
    .trim();
}

function money(value) {
  const v = Math.max(0, Number(value) || 0);

  if (v >= 1000) {
    return "1B€";
  }

  return `${Math.round(v)}M€`;
}

function amountArg(value) {
  if (value === undefined || value === null) return NaN;

  const clean = String(value)
    .replace(/€/g, "")
    .replace(/M/gi, "")
    .replace(/B/gi, "")
    .replace(",", ".")
    .trim();

  const n = Number(clean);

  if (!Number.isFinite(n)) return NaN;

  if (String(value).toUpperCase().includes("B")) {
    return n * 1000;
  }

  return n;
}

function embed(title, description, color = 0x5865f2) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function hasRole(member, roleIds) {
  if (!member) return false;

  return roleIds
    .filter(Boolean)
    .some(id => member.roles.cache.has(id));
}

function isAdmin(member) {
  return (
    member?.permissions?.has(PermissionFlagsBits.Administrator) ||
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

function isRegistrationStaff(member) {
  return (
    isAdmin(member) ||
    hasRole(member, [IDS.roles.kayitYetkilisi])
  );
}

function isModerator(member) {
  return (
    isAdmin(member) ||
    hasRole(member, [IDS.roles.moderator])
  );
}

function isSpeaker(member) {
  return (
    isAdmin(member) ||
    hasRole(member, [IDS.roles.spiker])
  );
}

function channelOnly(message, channelId) {
  if (message.channel.id !== channelId) {
    message.reply({
      content: `❌ Bu komut <#${channelId}> kanalında kullanılabilir.`
    }).catch(() => {});
    return false;
  }

  return true;
}

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

  return db.users[userId];
}

function parseNickValue(member) {
  const s = member?.nickname || member?.displayName || "";

  if (/1B€\s*$/i.test(s)) {
    return 1000;
  }

  const m = s.match(/(\d+(?:\.\d+)?)M€\s*$/i);

  return m ? Number(m[1]) : 0;
}

function setNickValue(oldNick, value) {
  const base = String(oldNick || "")
    .replace(/\s*(?:\d+(?:\.\d+)?M|1B)€\s*$/i, "")
    .trim();

  return `${base || "Oyuncu"} | ${money(value)}`.slice(0, 32);
}

async function safeSetNickname(member, nickname) {
  try {
    if (member.manageable) {
      await member.setNickname(nickname);
      return true;
    }
  } catch (err) {
    console.error("Nickname değiştirilemedi:", err.message);
  }

  return false;
}

/* =========================================================
   OYUNCU DEĞER SİSTEMİ
   ========================================================= */

async function changePlayerValue(member, delta, reason = "") {
  if (!member) return null;

  const user = getUserData(member.id);

  const current = Number(user.value) || parseNickValue(member);

  const next = Math.min(
    1000,
    Math.max(0, current + Number(delta))
  );

  user.value = next;

  if (!user.stats) {
    user.stats = {
      goals: 0,
      assists: 0,
      matches: 0
    };
  }

  const currentNick =
    member.nickname ||
    member.displayName ||
    user.nickname ||
    member.user.username;

  const newNick = setNickValue(currentNick, next);

  await safeSetNickname(member, newNick);

  db.users[member.id] = user;
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

function ensureTeam(name, roleId = null) {
  if (!name) return null;

  if (!db.teams[name]) {
    db.teams[name] = {
      players: [],
      score: 0,
      gd: 0,
      gf: 0,
      ga: 0,
      roleId: roleId || null
    };
  }

  if (roleId) {
    db.teams[name].roleId = roleId;
  }

  return db.teams[name];
}

function teamByName(name) {
  const clean = cleanName(name);

  if (IDS.teams[clean]) {
    return {
      name: clean,
      roleId: IDS.teams[clean]
    };
  }

  if (db.teams[clean]) {
    return {
      name: clean,
      roleId: db.teams[clean].roleId || null
    };
  }

  return null;
}

function teamRole(name) {
  return IDS.teams[name] || db.teams[name]?.roleId || null;
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

function updateStandings(team1, team2, score1, score2) {
  const a = ensureStandings(team1);
  const b = ensureStandings(team2);

  a.played++;
  b.played++;

  a.gf += score1;
  a.ga += score2;
  b.gf += score2;
  b.ga += score1;

  a.gd = a.gf - a.ga;
  b.gd = b.gf - b.ga;

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
   KAYIT
   ========================================================= */

async function finishRegister(interaction, type) {
  if (!isRegistrationStaff(interaction.member)) {
    return interaction.reply({
      content: "❌ Bu işlem için Kayıt Yetkilisi veya Yönetici olmalısın.",
      ephemeral: true
    });
  }

  const panel = db.registrationPanels[interaction.message.id];

  if (!panel) {
    return interaction.reply({
      content: "❌ Bu kayıt paneli bulunamadı veya süresi doldu.",
      ephemeral: true
    });
  }

  const guild = interaction.guild;

  const target = await guild.members
    .fetch(panel.userId)
    .catch(() => null);

  if (!target) {
    delete db.registrationPanels[interaction.message.id];
    saveData();

    return interaction.reply({
      content: "❌ Oyuncu sunucuda bulunamadı.",
      ephemeral: true
    });
  }

  const roleMap = {
    futbolcu: IDS.roles.futbolcu,
    uye: IDS.roles.uye,
    td: IDS.roles.td,
    kaleci: IDS.roles.kaleci
  };

  const roleId = roleMap[type];

  if (!roleId) {
    return interaction.reply({
      content: "❌ Rol bulunamadı.",
      ephemeral: true
    });
  }

  try {
    const rolesToRemove = [
      IDS.roles.kayitsiz,
      IDS.roles.futbolcu,
      IDS.roles.uye,
      IDS.roles.td,
      IDS.roles.kaleci
    ].filter(Boolean);

    await target.roles.remove(rolesToRemove).catch(() => {});
    await target.roles.add(roleId);

    const user = getUserData(target.id);

    user.registered = true;
    user.nickname = panel.nickname;
    user.position = type;
    user.value = Number(user.value) || 0;

    const nickname =
      user.value > 0
        ? `${panel.nickname} | ${money(user.value)}`
        : panel.nickname;

    await safeSetNickname(target, nickname);

    delete db.registrationPanels[interaction.message.id];
    saveData();

    const roleName = {
      futbolcu: "⚽ Futbolcu",
      uye: "👤 Üye",
      td: "🧑‍💼 Teknik Direktör",
      kaleci: "🧤 Kaleci"
    }[type];

    await interaction.update({
      embeds: [
        embed(
          "✅ Kayıt Tamamlandı",
          `👤 Oyuncu: <@${target.id}>\n🏷️ İsim: **${cleanName(panel.nickname)}**\n🎭 Rol: **${roleName}**`,
          0x57f287
        )
      ],
      components: []
    });

  } catch (err) {
    console.error("Kayıt hatası:", err);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ Kayıt sırasında hata oluştu.",
        ephemeral: true
      }).catch(() => {});
    }
  }
}

async function registerPanel(message, target, nickname) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`register_futbolcu_${target.id}`)
      .setLabel("⚽ Futbolcu")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`register_uye_${target.id}`)
      .setLabel("👤 Üye")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`register_td_${target.id}`)
      .setLabel("🧑‍💼 Teknik Direktör")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`register_kaleci_${target.id}`)
      .setLabel("🧤 Kaleci")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`register_cancel_${target.id}`)
      .setLabel("❌ İptal Et")
      .setStyle(ButtonStyle.Danger)
  );

  const panel = await message.reply({
    embeds: [
      embed(
        "📋 Axera League Kayıt",
        `👤 Oyuncu: <@${target.id}>\n🏷️ İsim: **${cleanName(nickname)}**\n\nAşağıdaki butonlardan oyuncunun rolünü seçin.`,
        0x5865f2
      )
    ],
    components: [row]
  });

  db.registrationPanels[panel.id] = {
    userId: target.id,
    nickname: String(nickname).slice(0, 32),
    createdBy: message.author.id,
    createdAt: Date.now()
  };

  saveData();

  return panel;
}

/* =========================================================
   İLK 11
   ========================================================= */

function getFormation(name) {
  return db.formations[name] || {
    formation: "4-3-3",
    players: []
  };
}

function saveFormation(name, formation) {
  db.formations[name] = formation;
  saveData();
}

/* =========================================================
   FİKSTÜR
   ========================================================= */

function createFixture(team1, team2, dateTime) {
  const fixture = {
    id: db.nextFixtureId++,
    team1,
    team2,
    dateTime,
    played: false,
    createdAt: Date.now()
  };

  db.fixtures.push(fixture);
  saveData();

  return fixture;
}

/* =========================================================
   MAÇ MOTORU
   ========================================================= */

function getTeamPlayers(teamName) {
  const team = db.teams[teamName];

  if (!team || !Array.isArray(team.players)) {
    return [];
  }

  return team.players
    .map(id => client.guilds.cache.first()?.members.cache.get(id))
    .filter(Boolean);
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getMatchLineup(teamName) {
  const formation = getFormation(teamName);

  const players = Array.isArray(formation.players)
    ? formation.players
    : [];

  const members = players
    .map(id => client.guilds.cache.first()?.members.cache.get(id))
    .filter(Boolean);

  if (members.length > 0) {
    return members;
  }

  return [];
}

async function rewardMatchParticipants(match) {
  const all = [
    ...(match.lineups?.team1 || []),
    ...(match.lineups?.team2 || [])
  ];

  const unique = [...new Set(all)];

  for (const userId of unique) {
    const guild = client.guilds.cache.first();

    if (!guild) continue;

    const member = await guild.members.fetch(userId).catch(() => null);

    if (!member) continue;

    const key = `${match.id}_${userId}`;

    if (db.matchRewards[key]) continue;

    db.matchRewards[key] = true;

    await changePlayerValue(
      member,
      5,
      "Maç katılım ödülü"
    );

    const user = getUserData(userId);
    user.stats.matches++;

    saveData();
  }
}

async function rewardGoal(member) {
  if (!member) return;

  const user = getUserData(member.id);

  user.stats.goals++;

  await changePlayerValue(
    member,
    2,
    "Maç gol ödülü"
  );

  saveData();
}

async function rewardAssist(member) {
  if (!member) return;

  const user = getUserData(member.id);

  user.stats.assists++;

  await changePlayerValue(
    member,
    1,
    "Maç asist ödülü"
  );

  saveData();
}

async function runMatch(channel, team1, team2, scheduled = false) {
  const matchId =
    `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const lineup1 = getMatchLineup(team1);
  const lineup2 = getMatchLineup(team2);

  const match = {
    id: matchId,
    team1,
    team2,
    score1: 0,
    score2: 0,
    minute: 0,
    startedAt: Date.now(),
    scheduled,
    lineups: {
      team1: lineup1.map(x => x.id),
      team2: lineup2.map(x => x.id)
    }
  };

  db.activeMatches[matchId] = match;
  saveData();

  const startEmbed = embed(
    "⚽ AXERA LEAGUE — MAÇ BAŞLADI",
    `**${team1}** 0 - 0 **${team2}**\n\n⏱️ Dakika: **0'**`,
    0x5865f2
  );

  await channel.send({ embeds: [startEmbed] });

  await rewardMatchParticipants(match);

  const interval = setInterval(async () => {
    const current = db.activeMatches[matchId];

    if (!current) {
      clearInterval(interval);
      return;
    }

    current.minute++;

    let eventText = "";

    /*
      Her 10 oyun dakikasında olay kontrolü.
    */

    if (
      current.minute % 10 === 0 &&
      Math.random() < 0.28
    ) {
      const attackingTeam =
        Math.random() < 0.5 ? 1 : 2;

      const lineup =
        attackingTeam === 1
          ? lineup1
          : lineup2;

      if (lineup.length > 0) {
        const scorer = randomItem(lineup);

        if (attackingTeam === 1) {
          current.score1++;
        } else {
          current.score2++;
        }

        await rewardGoal(scorer);

        eventText =
          `\n\n⚽ **GOOOL!** <@${scorer.id}> golü attı!`;

        if (
          lineup.length > 1 &&
          Math.random() < 0.65
        ) {
          const assistCandidates =
            lineup.filter(x => x.id !== scorer.id);

          if (assistCandidates.length) {
            const assister = randomItem(assistCandidates);

            await rewardAssist(assister);

            eventText +=
              `\n🎯 Asist: <@${assister.id}>`;
          }
        }
      }
    }

    const scoreEmbed = embed(
      "⚽ AXERA LEAGUE — CANLI MAÇ",
      `**${team1}** ${current.score1} - ${current.score2} **${team2}**\n\n` +
      `⏱️ Dakika: **${current.minute}'**` +
      eventText,
      0x5865f2
    );

    await channel.send({
      embeds: [scoreEmbed]
    }).catch(() => {});

    saveData();

    if (current.minute >= 90) {
      clearInterval(interval);

      updateStandings(
        team1,
        team2,
        current.score1,
        current.score2
      );

      db.matchHistory[matchId] = {
        ...current,
        finishedAt: Date.now()
      };

      delete db.activeMatches[matchId];

      saveData();

      await channel.send({
        embeds: [
          embed(
            "🏁 MAÇ SONA ERDİ",
            `**${team1}** ${current.score1} - ${current.score2} **${team2}**\n\n` +
            `📊 Puan durumu güncellendi.`,
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

async function createTicket(message) {
  const guild = message.guild;

  const existing = Object.values(db.tickets).find(
    x =>
      x.guildId === guild.id &&
      x.userId === message.author.id &&
      !x.closed
  );

  if (existing) {
    return message.reply(
      `❌ Zaten açık bir ticketın var: <#${existing.channelId}>`
    );
  }

  const channel = await guild.channels.create({
    name: `ticket-${message.author.username}`.toLowerCase().slice(0, 90),
    type: ChannelType.GuildText,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: ["ViewChannel"]
      },
      {
        id: message.author.id,
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
    guildId: guild.id,
    userId: message.author.id,
    channelId: channel.id,
    lastActivity: Date.now(),
    closed: false
  };

  saveData();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_close_${channel.id}`)
      .setLabel("🔒 Ticket Kapat")
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({
    content: `<@${message.author.id}>`,
    embeds: [
      embed(
        "🎫 Axera League Ticket",
        "Yetkililer en kısa sürede ilgilenecektir.\n\n" +
        "60 dakika boyunca mesaj gönderilmezse ticket otomatik kapanabilir.",
        0x5865f2
      )
    ],
    components: [row]
  });

  return message.reply(`✅ Ticket oluşturuldu: <#${channel.id}>`);
}

/* =========================================================
   ROL PANELİ
   ========================================================= */

function rolePanelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("toggle_partner_ping")
      .setLabel("🤝 Partner")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("toggle_mac_ping")
      .setLabel("⚽ Maç")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("toggle_duyuru_ping")
      .setLabel("📢 Duyuru")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("toggle_cekilis_ping")
      .setLabel("🎁 Çekiliş")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("toggle_medya_ping")
      .setLabel("🎥 Medya")
      .setStyle(ButtonStyle.Secondary)
  );
}

function roleForToggle(customId) {
  const map = {
    toggle_partner_ping: IDS.roles.partnerPing,
    toggle_mac_ping: IDS.roles.macPing,
    toggle_duyuru_ping: IDS.roles.duyuruPing,
    toggle_cekilis_ping: IDS.roles.cekilisPing,
    toggle_medya_ping: IDS.roles.medyaPing
  };

  return map[customId];
}

/* =========================================================
   AI
   ========================================================= */

async function askAI(prompt) {
  if (!ai) {
    return "❌ Yapay zeka sistemi için OPENAI_API_KEY tanımlanmamış.";
  }

  try {
    const response = await ai.responses.create({
      model: "gpt-5.6-luna",
      input: [
        {
          role: "system",
          content:
            "Sen Axera League Discord sunucusunun yardımcı yapay zekasısın. " +
            "Türkçe, kısa, anlaşılır ve arkadaşça cevap ver."
        },
        {
          role: "user",
          content: String(prompt).slice(0, 4000)
        }
      ]
    });

    return (
      response.output_text ||
      "Şu anda cevap oluşturamadım."
    ).slice(0, 3900);

  } catch (err) {
    console.error("OpenAI hatası:", err);
    return "❌ Yapay zeka yanıt verirken bir hata oluştu.";
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
        name: "Axera League",
        type: 1,
        url:
          process.env.STREAM_URL ||
          "https://www.twitch.tv/axeraleague"
      }
    ],
    status: "online"
  });
}

/* =========================================================
   BOT DURUM
   ========================================================= */

let botStartedAt = Date.now();

async function sendStatus() {
  const channel = client.channels.cache.get(
    IDS.channels.botDurum
  );

  if (!channel) return;

  const hours =
    ((Date.now() - botStartedAt) / 3600000).toFixed(1);

  const message = await channel.send({
    embeds: [
      embed(
        "🤖 Axera League Bot Durumu",
        `🟢 **Tüm sistemler sorunsuz çalışıyor.**\n\n` +
        `⏱️ Uptime: **${hours} saat**\n` +
        `📡 Durum: **Online**`,
        0x57f287
      )
    ]
  }).catch(() => null);

  if (message) {
    db.lastStatusMessageId = message.id;
    saveData();
  }
}

async function cleanupOwnStatusMessages() {
  const channel = client.channels.cache.get(
    IDS.channels.botDurum
  );

  if (!channel) return;

  try {
    const messages = await channel.messages.fetch({
      limit: 100
    });

    const botMessages = messages.filter(
      m => m.author.id === client.user.id
    );

    if (botMessages.size) {
      await channel.bulkDelete(
        botMessages,
        true
      ).catch(() => {});
    }
  } catch {}
}

/* =========================================================
   READY
   ========================================================= */

client.once("ready", async () => {
  console.log(
    `✅ ${client.user.tag} olarak giriş yapıldı.`
  );

  botStartedAt = Date.now();

  setBotPresence();

  await cleanupOwnStatusMessages();
  await sendStatus();

  setInterval(async () => {
    const now = new Date();

    if (
      now.getMinutes() === 0 ||
      now.getMinutes() === 30
    ) {
      await cleanupOwnStatusMessages();
      await sendStatus();
    }
  }, 60 * 1000);

  /* Fikstür kontrolü */
  setInterval(async () => {
    const now = Date.now();

    for (const fixture of db.fixtures) {
      if (fixture.played) continue;

      const date = new Date(fixture.dateTime).getTime();

      if (!Number.isFinite(date)) continue;

      if (date <= now) {
        fixture.played = true;
        saveData();

        const channel = client.channels.cache.get(
          IDS.channels.mac
        );

        if (!channel) continue;

        await channel.send({
          embeds: [
            embed(
              "📅 FİKSTÜR MAÇI BAŞLIYOR",
              `⚽ **${fixture.team1}** vs **${fixture.team2}**`,
              0x5865f2
            )
          ]
        });

        await runMatch(
          channel,
          fixture.team1,
          fixture.team2,
          true
        );
      }
    }
  }, 1000);

  /* Ticket otomatik kapatma */
  setInterval(async () => {
    const now = Date.now();

    for (const [channelId, ticket] of Object.entries(db.tickets)) {
      if (ticket.closed) continue;

      if (
        now - Number(ticket.lastActivity || now) >=
        60 * 60 * 1000
      ) {
        const channel = client.channels.cache.get(channelId);

        if (channel) {
          await channel.send(
            "🔒 Ticket 60 dakika hareketsizlik nedeniyle kapatıldı."
          ).catch(() => {});

          await channel.delete().catch(() => {});
        }

        ticket.closed = true;
        saveData();
      }
    }
  }, 60 * 1000);
});

/* =========================================================
   ÜYE KATILINCA KAYITSIZ ROLÜ
   ========================================================= */

client.on("guildMemberAdd", async member => {
  try {
    if (IDS.roles.kayitsiz) {
      await member.roles.add(
        IDS.roles.kayitsiz
      );
    }
  } catch (err) {
    console.error("Kayıtsız rolü verilemedi:", err);
  }
});

/* =========================================================
   BUTTON INTERACTIONS
   ========================================================= */

client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;

  /* Kayıt */
  if (interaction.customId.startsWith("register_")) {
    const parts = interaction.customId.split("_");

    const type = parts[1];

    if (type === "cancel") {
      if (!isRegistrationStaff(interaction.member)) {
        return interaction.reply({
          content: "❌ Bu işlem için yetkin yok.",
          ephemeral: true
        });
      }

      delete db.registrationPanels[interaction.message.id];
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

  /* Ticket */
  if (
    interaction.customId.startsWith("ticket_close_")
  ) {
    if (
      !isModerator(interaction.member) &&
      interaction.user.id !== db.tickets[
        interaction.channel.id
      ]?.userId
    ) {
      return interaction.reply({
        content: "❌ Bu ticketı kapatma yetkin yok.",
        ephemeral: true
      });
    }

    const ticket =
      db.tickets[interaction.channel.id];

    if (ticket) {
      ticket.closed = true;
      saveData();
    }

    await interaction.reply(
      "🔒 Ticket kapatılıyor..."
    );

    setTimeout(() => {
      interaction.channel.delete().catch(() => {});
    }, 1500);

    return;
  }

  /* Rol paneli */
  if (
    interaction.customId.startsWith("toggle_")
  ) {
    const roleId =
      roleForToggle(interaction.customId);

    if (!roleId) {
      return interaction.reply({
        content: "❌ Rol bulunamadı.",
        ephemeral: true
      });
    }

    if (
      interaction.member.roles.cache.has(roleId)
    ) {
      await interaction.member.roles.remove(roleId);

      return interaction.reply({
        content: "❌ Ping rolü kaldırıldı.",
        ephemeral: true
      });
    }

    await interaction.member.roles.add(roleId);

    return interaction.reply({
      content: "✅ Ping rolü verildi.",
      ephemeral: true
    });
  }
});

/* =========================================================
   MESAJLAR
   ========================================================= */

client.on("messageCreate", async message => {
  if (message.author.bot) return;
  if (!message.guild) return;

  /* Ticket aktivitesi */
  if (db.tickets[message.channel.id]) {
    db.tickets[message.channel.id].lastActivity =
      Date.now();

    saveData();
  }

  const content = message.content.trim();

  if (!content.startsWith(".")) {
    /* AI kanalı */
    if (
      message.channel.id === IDS.channels.ai &&
      ai
    ) {
      const answer = await askAI(content);

      await message.reply({
        content: answer
      }).catch(() => {});
    }

    return;
  }

  const args = content.split(/\s+/);
  const command = args.shift().toLowerCase();

  /* =======================================================
     .K
     ======================================================= */

  if (command === ".k") {
    if (!channelOnly(message, IDS.channels.kayit)) return;

    if (!isRegistrationStaff(message.member)) {
      return message.reply(
        "❌ Bu komutu yalnızca Kayıt Yetkilisi veya Yönetici kullanabilir."
      );
    }

    const target =
      message.mentions.members.first();

    if (!target) {
      return message.reply(
        "❌ Kullanım: `.k @Oyuncu İsim`"
      );
    }

    const nickname =
      args
        .filter(x => !x.startsWith("<@"))
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

  /* =======================================================
     .KAYITSIZVER
     ======================================================= */

  if (command === ".kayıtsızver") {
    if (!isRegistrationStaff(message.member)) {
      return message.reply(
        "❌ Bu komut için Kayıt Yetkilisi veya Yönetici olmalısın."
      );
    }

    const target =
      message.mentions.members.first();

    if (!target) {
      return message.reply(
        "❌ Kullanım: `.kayıtsızver @Oyuncu`"
      );
    }

    const removeRoles = [
      IDS.roles.futbolcu,
      IDS.roles.uye,
      IDS.roles.td,
      IDS.roles.kaleci
    ].filter(Boolean);

    await target.roles.remove(
      removeRoles
    ).catch(() => {});

    await target.roles.add(
      IDS.roles.kayitsiz
    ).catch(() => {});

    const user = getUserData(target.id);

    user.registered = false;
    user.team = null;

    saveData();

    return message.reply(
      `✅ <@${target.id}> Kayıtsız yapıldı.`
    );
  }

  /* =======================================================
     .ARA
     ======================================================= */

  if (command === ".ara") {
    const query = args.join(" ").toLowerCase();

    if (!query) {
      return message.reply(
        "❌ Kullanım: `.ara oyuncu`"
      );
    }

    const members =
      await message.guild.members.fetch();

    const results = members.filter(member => {
      if (
        member.roles.cache.has(
          IDS.roles.kayitsiz
        )
      ) {
        return false;
      }

      const user =
        db.users[member.id];

      const registeredName =
        user?.nickname || "";

      return (
        member.displayName
          .toLowerCase()
          .includes(query) ||
        registeredName
          .toLowerCase()
          .includes(query)
      );
    });

    if (!results.size) {
      return message.reply(
        "❌ Oyuncu bulunamadı."
      );
    }

    const list =
      [...results.values()]
        .slice(0, 15)
        .map(
          m =>
            `👤 <@${m.id}> — **${m.displayName}**`
        )
        .join("\n");

    return message.reply({
      embeds: [
        embed(
          "🔎 Oyuncu Arama",
          list,
          0x5865f2
        )
      ]
    });
  }

  /* =======================================================
     .DEĞER
     ======================================================= */

  if (command === ".değer") {
    if (!channelOnly(message, IDS.channels.deger)) return;

    const target =
      message.mentions.members.first();

    if (!target) {
      return message.reply(
        "❌ Kullanım: `.değer @Oyuncu`"
      );
    }

    const user =
      getUserData(target.id);

    const value =
      Number(user.value) ||
      parseNickValue(target);

    return message.reply({
      embeds: [
        embed(
          "💰 Oyuncu Değeri",
          `👤 Oyuncu: <@${target.id}>\n💵 Değer: **${money(value)}**`,
          0xf1c40f
        )
      ]
    });
  }

  /* =======================================================
     .DEĞERLİSTE
     ======================================================= */

  if (command === ".değerliste") {
    if (!channelOnly(message, IDS.channels.deger)) return;

    const members =
      await message.guild.members.fetch();

    const players = [];

    for (const member of members.values()) {
      if (
        member.roles.cache.has(
          IDS.roles.kayitsiz
        )
      ) continue;

      const user =
        db.users[member.id];

      if (!user?.registered) continue;

      const value =
        Number(user.value) ||
        parseNickValue(member);

      players.push({
        member,
        value
      });
    }

    players.sort(
      (a, b) => b.value - a.value
    );

    const top10 =
      players.slice(0, 10);

    if (!top10.length) {
      return message.reply(
        "❌ Kayıtlı oyuncu bulunamadı."
      );
    }

    const list = top10
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

  /* =======================================================
     .DVER
     ======================================================= */

  if (command === ".dver") {
    if (!isValueStaff(message.member)) {
      return message.reply(
        "❌ Bu komut için Değer Yetkilisi veya Yönetici olmalısın."
      );
    }

    const target =
      message.mentions.members.first();

    const rawAmount =
      args.find(
        x => !x.startsWith("<@")
      );

    const amount =
      amountArg(rawAmount);

    if (!target || !Number.isFinite(amount)) {
      return message.reply(
        "❌ Kullanım: `.dver @Oyuncu 5`"
      );
    }

    if (amount <= 0) {
      return message.reply(
        "❌ Miktar 0'dan büyük olmalı."
      );
    }

    const result =
      await changePlayerValue(
        target,
        amount,
        "Değer yetkilisi tarafından verildi"
      );

    return message.reply(
      `✅ <@${target.id}> değerine **${money(amount)}** eklendi.\n` +
      `💰 Yeni değer: **${money(result.newValue)}**`
    );
  }

  /* =======================================================
     .DSİL
     ======================================================= */

  if (
    command === ".dsil" ||
    command === ".dsi̇l"
  ) {
    if (!isValueStaff(message.member)) {
      return message.reply(
        "❌ Bu komut için Değer Yetkilisi veya Yönetici olmalısın."
      );
    }

    const target =
      message.mentions.members.first();

    const rawAmount =
      args.find(
        x => !x.startsWith("<@")
      );

    const amount =
      amountArg(rawAmount);

    if (!target || !Number.isFinite(amount)) {
      return message.reply(
        "❌ Kullanım: `.dsil @Oyuncu 5`"
      );
    }

    if (amount <= 0) {
      return message.reply(
        "❌ Miktar 0'dan büyük olmalı."
      );
    }

    const result =
      await changePlayerValue(
        target,
        -amount,
        "Değer yetkilisi tarafından silindi"
      );

    return message.reply(
      `✅ <@${target.id}> değerinden **${money(amount)}** çıkarıldı.\n` +
      `💰 Yeni değer: **${money(result.newValue)}**`
    );
  }

  /* =======================================================
     .ANT / .ANTRENMAN
     ======================================================= */

  if (
    command === ".ant" ||
    command === ".antrenman"
  ) {
    if (!channelOnly(
      message,
      IDS.channels.antrenman
    )) return;

    const result =
      await changePlayerValue(
        message.member,
        1,
        "Antrenman ödülü"
      );

    return message.reply(
      `⚽ Antrenman tamamlandı!\n` +
      `💰 **+1M€**\n` +
      `📊 Yeni değer: **${money(result.newValue)}**`
    );
  }

  /* =======================================================
     .PEN / .PENALTI
     ======================================================= */

  if (
    command === ".pen" ||
    command === ".penaltı" ||
    command === ".penalti"
  ) {
    if (!channelOnly(
      message,
      IDS.channels.penalti
    )) return;

    const chance = Math.random();

    if (chance < 0.50) {
      const result =
        await changePlayerValue(
          message.member,
          5,
          "Penaltı gol ödülü"
        );

      return message.reply({
        embeds: [
          embed(
            "⚽ GOOOL!",
            `🥅 Penaltı gol oldu!\n\n💰 **+5M€**\n📊 Yeni değer: **${money(result.newValue)}**`,
            0x57f287
          )
        ]
      });
    }

    if (chance < 0.75) {
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

  /* =======================================================
     .TWEET
     ======================================================= */

  if (command === ".tweet") {
    if (!channelOnly(
      message,
      IDS.channels.tweet
    )) return;

    const tweetText =
      args.join(" ").trim();

    if (!tweetText) {
      return message.reply(
        "❌ Kullanım: `.tweet mesaj`"
      );
    }

    const now = Date.now();
    const last =
      Number(
        db.tweetCooldowns[message.author.id]
      ) || 0;

    const remaining =
      2 * 60 * 60 * 1000 -
      (now - last);

    if (remaining > 0) {
      const minutes =
        Math.ceil(remaining / 60000);

      return message.reply(
        `⏳ Tweet ödülünü tekrar almak için **${minutes} dakika** beklemelisin.`
      );
    }

    await message.delete().catch(() => {});

    const result =
      await changePlayerValue(
        message.member,
        10,
        "Tweet ödülü"
      );

    db.tweetCooldowns[
      message.author.id
    ] = now;

    saveData();

    return message.channel.send({
      embeds: [
        embed(
          "🐦 Axera Tweet",
          `👤 **${message.member.displayName}**\n\n${tweetText}\n\n💰 Tweet ödülü: **+10M€**\n📊 Yeni değer: **${money(result.newValue)}**`,
          0x5865f2
        )
      ]
    });
  }

  /* =======================================================
     .MAÇ
     ======================================================= */

  if (command === ".maç") {
    if (
      !isSpeaker(message.member)
    ) {
      return message.reply(
        "❌ Bu komut için Spiker veya Yönetici olmalısın."
      );
    }

    if (!channelOnly(
      message,
      IDS.channels.mac
    )) return;

    const mentions =
      [...message.mentions.roles.values()];

    let teamNames = [];

    if (mentions.length >= 2) {
      for (const role of mentions.slice(0, 2)) {
        const found =
          Object.entries(IDS.teams)
            .find(([, id]) => id === role.id);

        if (found) {
          teamNames.push(found[0]);
        }
      }
    }

    if (teamNames.length < 2) {
      const possible =
        args.filter(
          x => !x.startsWith("<@")
        );

      if (possible.length >= 2) {
        teamNames = [
          possible[0],
          possible[1]
        ];
      }
    }

    if (teamNames.length < 2) {
      return message.reply(
        "❌ Kullanım: `.maç @Takım1 @Takım2`"
      );
    }

    const team1 = teamNames[0];
    const team2 = teamNames[1];

    if (!teamByName(team1) ||
        !teamByName(team2)) {
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

  /* =======================================================
     .İLK11
     ======================================================= */

  if (
    command === ".ilk11" ||
    command === ".ilk"
  ) {
    if (
      !isSpeaker(message.member) &&
      !isAdmin(message.member)
    ) {
      return message.reply(
        "❌ Bu komut için Spiker veya Yönetici olmalısın."
      );
    }

    const role =
      message.mentions.roles.first();

    const teamName =
      role
        ? Object.entries(IDS.teams)
            .find(([, id]) => id === role.id)?.[0]
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
      getFormation(teamName);

    const row1 =
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`xi_add_${teamName}`)
          .setLabel("➕ Oyuncu Ekle")
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId(`xi_remove_${teamName}`)
          .setLabel("➖ Oyuncu Çıkar")
          .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
          .setCustomId(`xi_clear_${teamName}`)
          .setLabel("🗑️ Temizle")
          .setStyle(ButtonStyle.Secondary)
      );

    const players =
      formation.players.length
        ? formation.players
            .map(id => `<@${id}>`)
            .join("\n")
        : "Henüz oyuncu eklenmedi.";

    return message.reply({
      embeds: [
        embed(
          `⚽ ${teamName} — İLK 11`,
          `📐 Formasyon: **${formation.formation}**\n\n${players}`,
          0x5865f2
        )
      ],
      components: [row1]
    });
  }

  /* =======================================================
     .TAKIMEKLE
     ======================================================= */

  if (command === ".takımekle") {
    if (!isAdmin(message.member)) {
      return message.reply(
        "❌ Bu komut yalnızca Yöneticiler içindir."
      );
    }

    const role =
      message.mentions.roles.first();

    if (!role) {
      return message.reply(
        "❌ Kullanım: `.takımekle @TakımRolü`"
      );
    }

    const name =
      role.name;

    ensureTeam(
      name,
      role.id
    );

    ensureStandings(name);

    saveData();

    return message.reply(
      `✅ **${name}** takımı sisteme eklendi.`
    );
  }

  /* =======================================================
     .TAKIMKALDIR
     ======================================================= */

  if (command === ".takımkaldır") {
    if (!isAdmin(message.member)) {
      return message.reply(
        "❌ Bu komut yalnızca Yöneticiler içindir."
      );
    }

    const role =
      message.mentions.roles.first();

    const name =
      role
        ? role.name
        : args.join(" ");

    if (!name) {
      return message.reply(
        "❌ Kullanım: `.takımkaldır @Takım`"
      );
    }

    if (!db.teams[name]) {
      return message.reply(
        "❌ Bu takım özel takım sisteminde bulunamadı."
      );
    }

    delete db.teams[name];
    delete db.standings[name];

    saveData();

    return message.reply(
      `✅ **${name}** takımı kaldırıldı.`
    );
  }

  /* =======================================================
     .PUANEKLE
     ======================================================= */

  if (command === ".puanekle") {
    if (!isAdmin(message.member)) {
      return message.reply(
        "❌ Bu komut yalnızca Yöneticiler içindir."
      );
    }

    const role =
      message.mentions.roles.first();

    const amount =
      amountArg(
        args.find(
          x => !x.startsWith("<@")
        )
      );

    const name =
      role
        ? role.name
        : args.filter(
            x => !x.startsWith("<@")
          )[0];

    if (!name || !Number.isFinite(amount)) {
      return message.reply(
        "❌ Kullanım: `.puanekle @Takım 3`"
      );
    }

    const standing =
      ensureStandings(name);

    standing.points += amount;

    saveData();

    return message.reply(
      `✅ **${name}** takımına **${amount} puan** eklendi.`
    );
  }

  /* =======================================================
     .TAKIMDEĞER
     ======================================================= */

  if (command === ".takımdeğer") {
    if (!isAdmin(message.member)) {
      return message.reply(
        "❌ Bu komut yalnızca Yöneticiler içindir."
      );
    }

    const role =
      message.mentions.roles.first();

    const amount =
      amountArg(
        args.find(
          x => !x.startsWith("<@")
        )
      );

    const name =
      role
        ? role.name
        : args.filter(
            x => !x.startsWith("<@")
          )[0];

    if (!name || !Number.isFinite(amount)) {
      return message.reply(
        "❌ Kullanım: `.takımdeğer @Takım 850M`"
      );
    }

    const team =
      ensureTeam(name);

    team.value =
      Math.min(1000, Math.max(0, amount));

    saveData();

    return message.reply(
      `✅ **${name}** takım değeri **${money(team.value)}** olarak ayarlandı.`
    );
  }

  /* =======================================================
     .FORMASYON
     ======================================================= */

  if (command === ".formasyon") {
    const role =
      message.mentions.roles.first();

    const name =
      role
        ? role.name
        : args.join(" ");

    if (!name) {
      return message.reply(
        "❌ Kullanım: `.formasyon @Takım`"
      );
    }

    const formation =
      getFormation(name);

    const select =
      new StringSelectMenuBuilder()
        .setCustomId(`formation_${name}`)
        .setPlaceholder("Formasyon seç")
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
          `📐 ${name} Formasyon`,
          `Mevcut formasyon: **${formation.formation}**`
        )
      ],
      components: [
        new ActionRowBuilder().addComponents(select)
      ]
    });
  }

  /* =======================================================
     .PUAN
     ======================================================= */

  if (command === ".puan") {
    const entries =
      Object.entries(db.standings);

    if (!entries.length) {
      return message.reply(
        "❌ Henüz puan durumu bulunmuyor."
      );
    }

    entries.sort((a, b) => {
      if (b[1].points !== a[1].points) {
        return b[1].points - a[1].points;
      }

      return b[1].gd - a[1].gd;
    });

    const table =
      entries.map(
        ([name, s], i) =>
          `**${i + 1}. ${name}** — ${s.points} P | ${s.played} O | ${s.wins} G | ${s.draws} B | ${s.losses} M | ${s.gd >= 0 ? "+" : ""}${s.gd} AV`
      ).join("\n");

    return message.reply({
      embeds: [
        embed(
          "🏆 AXERA LEAGUE — PUAN DURUMU",
          table,
          0x5865f2
        )
      ]
    });
  }

  /* =======================================================
     .FİKSTÜREKLE
     ======================================================= */

  if (
    command === ".fiksturekle" ||
    command === ".fikstürekle"
  ) {
    if (
      !isSpeaker(message.member) &&
      !isAdmin(message.member)
    ) {
      return message.reply(
        "❌ Bu komut için Spiker veya Yönetici olmalısın."
      );
    }

    const roleMentions =
      [...message.mentions.roles.values()];

    if (roleMentions.length < 2) {
      return message.reply(
        "❌ İki takım rolünü etiketlemelisin."
      );
    }

    const team1 =
      roleMentions[0].name;

    const team2 =
      roleMentions[1].name;

    const rest =
      args.filter(
        x => !x.startsWith("<@&")
      );

    const dateText =
      rest.join(" ");

    if (!dateText) {
      return message.reply(
        "❌ Tarih yazmalısın. Örnek: `2026-09-15 20:00`"
      );
    }

    const parsed =
      new Date(
        dateText.replace(" ", "T")
      );

    if (Number.isNaN(parsed.getTime())) {
      return message.reply(
        "❌ Geçerli bir tarih gir."
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
          `⚽ **${team1}** vs **${team2}**\n🕐 ${parsed.toLocaleString("tr-TR")}\n🆔 Fikstür ID: **${fixture.id}**`,
          0x57f287
        )
      ]
    });
  }

  /* =======================================================
     .FİKSTÜR
     ======================================================= */

  if (
    command === ".fikstür" ||
    command === ".fikstur"
  ) {
    const fixtures =
      db.fixtures
        .filter(x => !x.played)
        .sort(
          (a, b) =>
            new Date(a.dateTime) -
            new Date(b.dateTime)
        )
        .slice(0, 20);

    if (!fixtures.length) {
      return message.reply(
        "📅 Bekleyen fikstür bulunmuyor."
      );
    }

    const list =
      fixtures.map(
        f =>
          `🆔 **${f.id}** — **${f.team1}** vs **${f.team2}**\n🕐 ${new Date(f.dateTime).toLocaleString("tr-TR")}`
      ).join("\n\n");

    return message.reply({
      embeds: [
        embed(
          "📅 AXERA LEAGUE — FİKSTÜR",
          list
        )
      ]
    });
  }

  /* =======================================================
     .FİKSTURCİKAR
     ======================================================= */

  if (
    command === ".fiksturcikar" ||
    command === ".fikstürçıkar"
  ) {
    if (!isAdmin(message.member)) {
      return message.reply(
        "❌ Bu komut yalnızca Yöneticiler içindir."
      );
    }

    const roleMentions =
      [...message.mentions.roles.values()];

    if (roleMentions.length < 2) {
      return message.reply(
        "❌ İki takım etiketlemelisin."
      );
    }

    const team1 =
      roleMentions[0].name;

    const team2 =
      roleMentions[1].name;

    const index =
      db.fixtures.findIndex(
        f =>
          f.team1 === team1 &&
          f.team2 === team2 &&
          !f.played
      );

    if (index === -1) {
      return message.reply(
        "❌ Bu fikstür bulunamadı."
      );
    }

    db.fixtures.splice(index, 1);
    saveData();

    return message.reply(
      `✅ **${team1} vs ${team2}** fikstürü kaldırıldı.`
    );
  }

  /* =======================================================
     .BÜTÇEEKLE
     ======================================================= */

  if (command === ".bütçeekle") {
    if (!isValueStaff(message.member)) {
      return message.reply(
        "❌ Bu komut için Değer Yetkilisi veya Yönetici olmalısın."
      );
    }

    const target =
      message.mentions.members.first();

    const raw =
      args.find(
        x => !x.startsWith("<@")
      );

    const amount =
      amountArg(raw);

    if (!target || !Number.isFinite(amount)) {
      return message.reply(
        "❌ Kullanım: `.bütçeekle @Oyuncu 50M`"
      );
    }

    const user =
      getUserData(target.id);

    user.budget =
      Math.max(
        0,
        Number(user.budget || 0) + amount
      );

    saveData();

    return message.reply(
      `✅ <@${target.id}> kişisel bütçesine **${money(amount)}** eklendi.\n💰 Bütçe: **${money(user.budget)}**`
    );
  }

  /* =======================================================
     .BÜTÇESİL
     ======================================================= */

  if (command === ".bütçesil") {
    if (!isValueStaff(message.member)) {
      return message.reply(
        "❌ Bu komut için Değer Yetkilisi veya Yönetici olmalısın."
      );
    }

    const target =
      message.mentions.members.first();

    const raw =
      args.find(
        x => !x.startsWith("<@")
      );

    const amount =
      amountArg(raw);

    if (!target || !Number.isFinite(amount)) {
      return message.reply(
        "❌ Kullanım: `.bütçesil @Oyuncu 50M`"
      );
    }

    const user =
      getUserData(target.id);

    user.budget =
      Math.max(
        0,
        Number(user.budget || 0) - amount
      );

    saveData();

    return message.reply(
      `✅ <@${target.id}> kişisel bütçesinden **${money(amount)}** çıkarıldı.\n💰 Bütçe: **${money(user.budget)}**`
    );
  }

  /* =======================================================
     .GÖNDER
     ======================================================= */

  if (command === ".gönder") {
    const target =
      message.mentions.members.first();

    const raw =
      args.find(
        x => !x.startsWith("<@")
      );

    const amount =
      amountArg(raw);

    if (!target || !Number.isFinite(amount)) {
      return message.reply(
        "❌ Kullanım: `.gönder @Oyuncu 10M`"
      );
    }

    if (target.id === message.author.id) {
      return message.reply(
        "❌ Kendine bütçe gönderemezsin."
      );
    }

    if (amount <= 0) {
      return message.reply(
        "❌ Miktar 0'dan büyük olmalı."
      );
    }

    const sender =
      getUserData(message.author.id);

    const receiver =
      getUserData(target.id);

    if (
      Number(sender.budget || 0) <
      amount
    ) {
      return message.reply(
        "❌ Yeterli kişisel bütçen yok."
      );
    }

    sender.budget -= amount;
    receiver.budget =
      Number(receiver.budget || 0) +
      amount;

    saveData();

    return message.reply(
      `✅ <@${target.id}> kişisine **${money(amount)}** gönderildi.\n` +
      `💰 Kalan bütçen: **${money(sender.budget)}**`
    );
  }

  /* =======================================================
     .BÜTÇE
     ======================================================= */

  if (command === ".bütçe") {
    const target =
      message.mentions.members.first() ||
      message.member;

    const user =
      getUserData(target.id);

    return message.reply({
      embeds: [
        embed(
          "💰 Kişisel Bütçe",
          `👤 Oyuncu: <@${target.id}>\n💵 Bütçe: **${money(user.budget || 0)}**`,
          0xf1c40f
        )
      ]
    });
  }

  /* =======================================================
     .TICKETPANEL
     ======================================================= */

  if (command === ".ticketpanel") {
    if (!isStaff(message.member)) {
      return message.reply(
        "❌ Bu komut için yetkin yok."
      );
    }

    const row =
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("create_ticket")
          .setLabel("🎫 Ticket Oluştur")
          .setStyle(ButtonStyle.Primary)
      );

    return message.channel.send({
      embeds: [
        embed(
          "🎫 Axera League Destek",
          "Destek almak için aşağıdaki butona basarak özel ticket oluşturabilirsin.",
          0x5865f2
        )
      ],
      components: [row]
    });
  }

  /* =======================================================
     .SİL
     ======================================================= */

  if (command === ".sil") {
    if (!isAdmin(message.member)) {
      return message.reply(
        "❌ Bu komut yalnızca Yöneticiler içindir."
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
        "❌ Kullanım: `.sil 1-1000`"
      );
    }

    await message.delete().catch(() => {});

    const messages =
      await message.channel.messages.fetch({
        limit: Math.min(amount, 100)
      });

    const deletable =
      messages.filter(
        m =>
          !m.pinned &&
          Date.now() - m.createdTimestamp <
            14 * 24 * 60 * 60 * 1000
      );

    await message.channel.bulkDelete(
      deletable,
      true
    ).catch(() => {});

    return message.channel.send(
      `🗑️ **${deletable.size}** mesaj silindi.`
    ).then(msg => {
      setTimeout(
        () => msg.delete().catch(() => {}),
        3000
      );
    });
  }

  /* =======================================================
     .EMBED
     ======================================================= */

  if (command === ".embed") {
    if (!isStaff(message.member)) {
      return message.reply(
        "❌ Bu komut için yetkin yok."
      );
    }

    const raw =
      args.join(" ");

    const parts =
      raw.split("|");

    const title =
      cleanName(parts.shift());

    const description =
      cleanName(parts.join("|"));

    if (!title || !description) {
      return message.reply(
        "❌ Kullanım: `.embed Başlık | Açıklama`"
      );
    }

    await message.delete().catch(() => {});

    return message.channel.send({
      embeds: [
        embed(
          title,
          description
        )
      ]
    });
  }

  /* =======================================================
     .KICK
     ======================================================= */

  if (command === ".kick") {
    if (!isModerator(message.member)) {
      return message.reply(
        "❌ Bu komut için Moderatör veya Yönetici olmalısın."
      );
    }

    const target =
      message.mentions.members.first();

    if (!target) {
      return message.reply(
        "❌ Kullanım: `.kick @Oyuncu`"
      );
    }

    await target.kick(
      "Axera League moderasyon"
    ).catch(() => null);

    return message.reply(
      `👢 <@${target.id}> sunucudan atıldı.`
    );
  }

  /* =======================================================
     .BAN
     ======================================================= */

  if (command === ".ban") {
    if (!isModerator(message.member)) {
      return message.reply(
        "❌ Bu komut için Moderatör veya Yönetici olmalısın."
      );
    }

    const target =
      message.mentions.members.first();

    if (!target) {
      return message.reply(
        "❌ Kullanım: `.ban @Oyuncu`"
      );
    }

    await target.ban({
      reason: "Axera League moderasyon"
    }).catch(() => null);

    return message.reply(
      `🔨 <@${target.id}> yasaklandı.`
    );
  }

  /* =======================================================
     .MUTE
     ======================================================= */

  if (command === ".mute") {
    if (!isModerator(message.member)) {
      return message.reply(
        "❌ Bu komut için Moderatör veya Yönetici olmalısın."
      );
    }

    const target =
      message.mentions.members.first();

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

  /* =======================================================
     .UNMUTE
     ======================================================= */

  if (command === ".unmute") {
    if (!isModerator(message.member)) {
      return message.reply(
        "❌ Bu komut için Moderatör veya Yönetici olmalısın."
      );
    }

    const target =
      message.mentions.members.first();

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

  /* =======================================================
     .DM
     ======================================================= */

  if (command === ".dm") {
    if (!isStaff(message.member)) {
      return message.reply(
        "❌ Bu komut için yetkin yok."
      );
    }

    const target =
      message.mentions.members.first();

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
            text,
            0x5865f2
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

  /* =======================================================
     .ROLVER
     ======================================================= */

  if (command === ".rolver") {
    if (!isAdmin(message.member)) {
      return message.reply(
        "❌ Bu komut yalnızca Yöneticiler içindir."
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

    await target.roles.add(role).catch(() => {});

    return message.reply(
      `✅ <@${target.id}> kişisine <@&${role.id}> rolü verildi.`
    );
  }

  /* =======================================================
     .ROLAL
     ======================================================= */

  if (command === ".rolal") {
    if (!isAdmin(message.member)) {
      return message.reply(
        "❌ Bu komut yalnızca Yöneticiler içindir."
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

    await target.roles.remove(role).catch(() => {});

    return message.reply(
      `✅ <@${target.id}> kişisinden <@&${role.id}> rolü alındı.`
    );
  }

  /* =======================================================
     .ROLVERHEPSİ
     ======================================================= */

  if (
    command === ".rolverhepsi" ||
    command === ".rolverhepsi"
  ) {
    if (!isAdmin(message.member)) {
      return message.reply(
        "❌ Bu komut yalnızca Yöneticiler içindir."
      );
    }

    const role =
      message.mentions.roles.first();

    if (!role) {
      return message.reply(
        "❌ Kullanım: `.rolverhepsi herkes @Rol`"
      );
    }

    await message.guild.members.fetch();

    let count = 0;

    for (const member of message.guild.members.cache.values()) {
      if (member.user.bot) continue;

      try {
        if (!member.roles.cache.has(role.id)) {
          await member.roles.add(role);
          count++;
        }
      } catch {}
    }

    return message.reply(
      `✅ **${count}** kişiye <@&${role.id}> rolü verildi.`
    );
  }

  /* =======================================================
     .ROLALHEPSİ
     ======================================================= */

  if (command === ".rolalhepsi") {
    if (!isAdmin(message.member)) {
      return message.reply(
        "❌ Bu komut yalnızca Yöneticiler içindir."
      );
    }

    const role =
      message.mentions.roles.first();

    if (!role) {
      return message.reply(
        "❌ Kullanım: `.rolalhepsi herkes @Rol`"
      );
    }

    await message.guild.members.fetch();

    let count = 0;

    for (const member of message.guild.members.cache.values()) {
      if (member.user.bot) continue;

      try {
        if (member.roles.cache.has(role.id)) {
          await member.roles.remove(role);
          count++;
        }
      } catch {}
    }

    return message.reply(
      `✅ **${count}** kişiden <@&${role.id}> rolü alındı.`
    );
  }

  /* =======================================================
     .ROLPANEL
     ======================================================= */

  if (command === ".rolpanel") {
    if (!isAdmin(message.member)) {
      return message.reply(
        "❌ Bu komut yalnızca Yöneticiler içindir."
      );
    }

    const panel =
      await message.channel.send({
        embeds: [
          embed(
            "🎛️ Axera League Rol Paneli",
            "Aşağıdaki butonlardan almak veya kaldırmak istediğin bildirim rollerini seçebilirsin."
          )
        ],
        components: [
          rolePanelRow()
        ]
      });

    db.rolePanel = {
      channelId: message.channel.id,
      messageId: panel.id
    };

    saveData();

    return;
  }

  /* =======================================================
     .ŞART
     ======================================================= */

  if (
    command === ".şart" ||
    command === ".sart"
  ) {
    return message.reply({
      embeds: [
        embed(
          "📜 Axera League Şartları",
          "ℹ️ Sunucudaki sistemler ve yetkiler hakkında bilgi almak için yetkililere ulaşabilirsin.\n\n" +
          "📋 Kayıt işlemleri Kayıt Yetkilileri tarafından yapılır.\n" +
          "💰 Değer işlemleri Değer Yetkilileri tarafından yapılır.\n" +
          "⚽ Maç ve fikstür işlemleri Spikerler tarafından yönetilir.\n\n" +
          "Bu kanal bilgilendirme amaçlıdır."
        )
      ]
    });
  }

  /* =======================================================
     .AI / .YAPAYZEKA
     ======================================================= */

  if (
    command === ".ai" ||
    command === ".yapayzeka"
  ) {
    if (!ai) {
      return message.reply(
        "❌ Yapay zeka sistemi aktif değil. Railway'e OPENAI_API_KEY eklenmeli."
      );
    }

    const prompt =
      args.join(" ").trim();

    if (!prompt) {
      return message.reply(
        "❌ Kullanım: `.ai sorunun`"
      );
    }

    const answer =
      await askAI(prompt);

    return message.reply({
      content: answer
    });
  }

  /* =======================================================
     .YARDIM
     ======================================================= */

  if (command === ".yardım") {
    return message.reply({
      embeds: [
        embed(
          "📚 AXERA LEAGUE — KOMUTLAR",
          [
            "**👤 Kayıt**",
            "`.k @Oyuncu İsim`",
            "`.kayıtsızver @Oyuncu`",
            "`.ara oyuncu`",
            "",
            "**💰 Değer**",
            "`.değer @Oyuncu`",
            "`.değerliste`",
            "`.dver @Oyuncu 5`",
            "`.dsil @Oyuncu 5`",
            "",
            "**⚽ Oyuncu Sistemleri**",
            "`.ant`",
            "`.antrenman`",
            "`.pen`",
            "`.penaltı`",
            "`.tweet mesaj`",
            "",
            "**🏟️ Maç / Takım**",
            "`.maç @Takım1 @Takım2`",
            "`.ilk11 @Takım`",
            "`.takımekle @Takım`",
            "`.takımkaldır @Takım`",
            "`.puanekle @Takım miktar`",
            "`.takımdeğer @Takım 850M`",
            "`.formasyon @Takım`",
            "`.puan`",
            "`.fiksturekle @Takım1 @Takım2 2026-09-15 20:00`",
            "`.fikstür`",
            "`.fiksturcikar @Takım1 @Takım2`",
            "",
            "**💵 Kişisel Bütçe**",
            "`.bütçe`",
            "`.bütçeekle @Oyuncu 50M`",
            "`.bütçesil @Oyuncu 50M`",
            "`.gönder @Oyuncu 10M`",
            "",
            "**🛡️ Yetkili**",
            "`.sil miktar`",
            "`.embed Başlık | Açıklama`",
            "`.kick @Oyuncu`",
            "`.ban @Oyuncu`",
            "`.mute @Oyuncu`",
            "`.unmute @Oyuncu`",
            "`.dm @Oyuncu mesaj`",
            "`.rolver @Oyuncu @Rol`",
            "`.rolal @Oyuncu @Rol`",
            "`.rolverhepsi herkes @Rol`",
            "`.rolalhepsi herkes @Rol`",
            "`.rolpanel`",
            "",
            "**🎫 Destek / AI**",
            "`.ticketpanel`",
            "`.ai mesaj`",
            "`.yapayzeka mesaj`"
          ].join("\n"),
          0x5865f2
        )
      ]
    });
  }

  /* =======================================================
     ÖZEL AI CEVAPLARI
     ======================================================= */

  if (
    /seni kim kurdu/i.test(content)
  ) {
    return message.reply(
      "Lynox9380 kurdu."
    );
  }

  if (
    /yapay zeka altyapısı/i.test(content)
  ) {
    return message.reply(
      "Axera League"
    );
  }
});

/* =========================================================
   SELECT MENÜ
   ========================================================= */

client.on("interactionCreate", async interaction => {
  if (!interaction.isStringSelectMenu()) return;

  if (
    interaction.customId.startsWith(
      "formation_"
    )
  ) {
    const teamName =
      interaction.customId
        .replace("formation_", "");

    if (
      !isSpeaker(interaction.member) &&
      !isAdmin(interaction.member)
    ) {
      return interaction.reply({
        content: "❌ Bu işlem için yetkin yok.",
        ephemeral: true
      });
    }

    const value =
      interaction.values[0];

    const formation =
      getFormation(teamName);

    formation.formation = value;

    saveFormation(
      teamName,
      formation
    );

    return interaction.update({
      embeds: [
        embed(
          `📐 ${teamName} Formasyonu`,
          `Yeni formasyon: **${value}**`,
          0x57f287
        )
      ],
      components: []
    });
  }
});

/* =========================================================
   TICKET BUTTON
   ========================================================= */

client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;

  if (
    interaction.customId === "create_ticket"
  ) {
    await interaction.deferReply({
      ephemeral: true
    });

    try {
      const guild =
        interaction.guild;

      const existing =
        Object.values(db.tickets).find(
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
              .replace(/[^a-z0-9-]/g, "")
              .slice(0, 80),
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
        guildId: guild.id,
        userId: interaction.user.id,
        channelId: channel.id,
        lastActivity: Date.now(),
        closed: false
      };

      saveData();

      const row =
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(
              `ticket_close_${channel.id}`
            )
            .setLabel("🔒 Ticket Kapat")
            .setStyle(ButtonStyle.Danger)
        );

      await channel.send({
        content: `<@${interaction.user.id}>`,
        embeds: [
          embed(
            "🎫 Axera League Ticket",
            "Destek talebin oluşturuldu.\n\nYetkililer seninle ilgilenecektir.",
            0x5865f2
          )
        ],
        components: [row]
      });

      return interaction.editReply(
        `✅ Ticket oluşturuldu: <#${channel.id}>`
      );

    } catch (err) {
      console.error(err);

      return interaction.editReply(
        "❌ Ticket oluşturulamadı."
      );
    }
  }
});

/* =========================================================
   İLK 11 BUTTONLARI
   ========================================================= */

client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;

  if (
    !interaction.customId.startsWith("xi_")
  ) return;

  if (
    !isSpeaker(interaction.member) &&
    !isAdmin(interaction.member)
  ) {
    return interaction.reply({
      content: "❌ Bu paneli kullanma yetkin yok.",
      ephemeral: true
    });
  }

  const parts =
    interaction.customId.split("_");

  const action =
    parts[1];

  const teamName =
    parts.slice(2).join("_");

  const formation =
    getFormation(teamName);

  if (action === "clear") {
    formation.players = [];

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

  if (action === "add") {
    return interaction.reply({
      content:
        `Oyuncu eklemek için:\n`.replace(
          "Oyuncu eklemek için:",
          `**${teamName}** takımına oyuncu eklemek için`
        ) +
        `\n\`.ilk11ekle @Oyuncu\` komutu kullanılabilir.`,
      ephemeral: true
    });
  }

  if (action === "remove") {
    return interaction.reply({
      content:
        `Oyuncu çıkarmak için \`.ilk11çıkar @Oyuncu\` kullanabilirsin.`,
      ephemeral: true
    });
  }
});

/* =========================================================
   İLK 11 EKLE / ÇIKAR
   ========================================================= */

client.on("messageCreate", async message => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const content =
    message.content.trim();

  const args =
    content.split(/\s+/);

  const command =
    args.shift()?.toLowerCase();

  if (
    command !== ".ilk11ekle" &&
    command !== ".ilk11çıkar" &&
    command !== ".ilk11cikar"
  ) {
    return;
  }

  if (
    !isSpeaker(message.member) &&
    !isAdmin(message.member)
  ) {
    return message.reply(
      "❌ Bu komut için Spiker veya Yönetici olmalısın."
    );
  }

  const teamRole =
    message.mentions.roles.first();

  const target =
    message.mentions.members.first();

  if (!teamRole || !target) {
    return message.reply(
      "❌ Kullanım: `.ilk11ekle @Takım @Oyuncu`"
    );
  }

  const teamName =
    teamRole.name;

  const formation =
    getFormation(teamName);

  if (command === ".ilk11ekle") {
    if (
      !formation.players.includes(
        target.id
      )
    ) {
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
    }
  } else {
    formation.players =
      formation.players.filter(
        id => id !== target.id
      );
  }

  saveFormation(
    teamName,
    formation
  );

  return message.reply(
    command === ".ilk11ekle"
      ? `✅ <@${target.id}> **${teamName}** ilk 11'ine eklendi.`
      : `✅ <@${target.id}> **${teamName}** ilk 11'inden çıkarıldı.`
  );
});

/* =========================================================
   HATA YAKALAMA
   ========================================================= */

process.on("unhandledRejection", err => {
  console.error(
    "Unhandled Rejection:",
    err
  );
});

process.on("uncaughtException", err => {
  console.error(
    "Uncaught Exception:",
    err
  );
});

/* =========================================================
   GİRİŞ
   ========================================================= */

client.login(TOKEN);
