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

/* =========================
   AXERA LEAGUE IDLER
========================= */

const IDS = {
  roles: {
    yonetici: "1534455282426445897",
    kayitYetkilisi: "1534456315366342716",
    deger: "1534456192913375382",
    kayitsiz: "1534457560134844517",
    futbolcu: "1534457228986421278",
    td: "1534456648930693120",
    uye: "1534457460163608636",
    kaleci: "1534492034243498195",
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

/* =========================
   VERİTABANI
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
    const data = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );

    return {
      ...JSON.parse(JSON.stringify(DEFAULT_DATA)),
      ...data
    };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
}

let db = loadData();

function saveData() {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(db, null, 2)
  );
}

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
   YARDIMCI FONKSİYONLAR
========================= */

const money = value =>
  `${Math.max(0, Math.round(Number(value) || 0))}M€`;

function makeEmbed(title, description, color = 0x5865F2) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();
}

function hasRole(member, roleIds) {
  if (!member?.roles?.cache) return false;

  return member.roles.cache.some(role =>
    roleIds.includes(role.id)
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

function onlyChannel(message, channelId) {
  if (message.channel.id !== channelId) {
    message.reply(
      `❌ Bu komut <#${channelId}> kanalında kullanılabilir.`
    ).catch(() => {});

    return false;
  }

  return true;
}

function normalize(text) {
  return String(text || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function parseAmount(value) {
  if (!value) return null;

  const text = String(value)
    .replace(",", ".")
    .trim()
    .toUpperCase()
    .replace(/€/g, "");

  if (!/^\d+(?:\.\d+)?M?$/.test(text)) {
    return null;
  }

  const number = Number(
    text.replace(/M$/, "")
  );

  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }

  return number;
}

function getMentionedMember(message) {
  return (
    message.mentions.members.first() ||
    null
  );
}

function getPlayerName(member) {
  if (!member) return "Oyuncu";

  return (
    db.users[member.id]?.name ||
    member.nickname ||
    member.displayName ||
    member.user?.username ||
    "Oyuncu"
  );
}

function parseNicknameValue(member) {
  if (!member) return 0;

  const nick =
    member.nickname ||
    member.displayName ||
    "";

  const match = nick.match(
    /(\d+(?:\.\d+)?)M€\s*$/i
  );

  return match ? Number(match[1]) : 0;
}

function replaceNicknameValue(oldNickname, value) {
  let base = String(oldNickname || "")
    .replace(
      /\s*\d+(?:\.\d+)?M€\s*$/i,
      ""
    )
    .trim();

  if (!base) {
    base = "Oyuncu";
  }

  return `${base} | ${money(value)}`.slice(0, 32);
}

/* =========================
   KULLANICI
========================= */

function ensureUser(member) {
  if (!member) return null;

  if (!db.users[member.id]) {
    db.users[member.id] = {
      name: getPlayerName(member),
      value: parseNicknameValue(member),
      budget: 0
    };
  }

  if (!db.users[member.id].name) {
    db.users[member.id].name =
      getPlayerName(member);
  }

  if (
    !Number.isFinite(
      Number(db.users[member.id].value)
    )
  ) {
    db.users[member.id].value =
      parseNicknameValue(member);
  }

  if (
    !Number.isFinite(
      Number(db.users[member.id].budget)
    )
  ) {
    db.users[member.id].budget = 0;
  }

  return db.users[member.id];
}

/* =========================
   DEĞER SİSTEMİ
========================= */

async function changePlayerValue(
  member,
  amount,
  reason = ""
) {
  if (!member) return 0;

  const user = ensureUser(member);

  let current = Number(user.value);

  if (
    !Number.isFinite(current) ||
    current <= 0
  ) {
    current = parseNicknameValue(member);
  }

  const newValue = Math.min(
    1000,
    Math.max(
      0,
      current + Number(amount)
    )
  );

  user.value = newValue;

  try {
    const currentNickname =
      member.nickname ||
      member.displayName ||
      getPlayerName(member);

    const newNickname =
      replaceNicknameValue(
        currentNickname,
        newValue
      );

    if (member.manageable) {
      await member.setNickname(
        newNickname
      ).catch(() => {});
    }
  } catch {}

  saveData();

  return newValue;
}

/* =========================
   TAKIMLAR
========================= */

function getTeamName(text) {
  if (!text) return null;

  const query = normalize(text);

  const exact =
    Object.keys(IDS.teams).find(
      name => normalize(name) === query
    );

  if (exact) return exact;

  return Object.keys(IDS.teams).find(
    name =>
      normalize(name).includes(query) ||
      query.includes(normalize(name))
  );
}

function getTeamRole(guild, teamName) {
  const id = IDS.teams[teamName];

  if (!id) return null;

  return guild.roles.cache.get(id);
}

function getTeamMembers(guild, teamName) {
  const role =
    getTeamRole(guild, teamName);

  if (!role) return [];

  return [...role.members.values()];
}

function ensureTeam(teamName) {
  if (!db.teams[teamName]) {
    db.teams[teamName] = {
      players: [],
      score: 0,
      gd: 0,
      gf: 0,
      ga: 0
    };
  }

  return db.teams[teamName];
}

function getTeamPlayers(guild, teamName) {
  const team =
    ensureTeam(teamName);

  const manual =
    team.players
      .map(player =>
        guild.members.cache.get(
          player.id
        )
      )
      .filter(Boolean);

  const rolePlayers =
    getTeamMembers(
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

/* =========================
   PUAN
========================= */

function addMatchResult(
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
    A.score++;
    B.score++;
  }

  saveData();
}

async function postStandings(guild) {
  const channel =
    guild.channels.cache.get(
      IDS.channels.puan
    );

  if (!channel) return;

  const rows =
    Object.keys(IDS.teams)
      .map(name => [
        name,
        ensureTeam(name)
      ])
      .sort(
        (a, b) =>
          b[1].score - a[1].score ||
          b[1].gd - a[1].gd ||
          b[1].gf - a[1].gf
      );

  const text = rows
    .map(
      ([name, team], index) =>
        `${index + 1}. **${name}** — ${team.score} P | AV ${team.gd} | AG ${team.gf}`
    )
    .join("\n");

  await channel.send({
    embeds: [
      makeEmbed(
        "🏆 Axera League Puan Durumu",
        text || "Henüz maç oynanmadı.",
        0xFEE75C
      )
    ]
  }).catch(() => {});
}

/* =========================
   KAYIT PANELİ
========================= */

async function createRegistrationPanel(
  message,
  target,
  nickname
) {
  const panelId = message.id;

  db.registrationPanels[panelId] = {
    userId: target.id,
    nickname: String(nickname).slice(0, 32)
  };

  saveData();

  const row =
    new ActionRowBuilder().addComponents(

      new ButtonBuilder()
        .setCustomId(
          `register_futbolcu_${panelId}`
        )
        .setLabel("⚽ Futbolcu")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(
          `register_uye_${panelId}`
        )
        .setLabel("👤 Üye")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(
          `register_td_${panelId}`
        )
        .setLabel("🧑‍💼 Teknik Direktör")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(
          `register_kaleci_${panelId}`
        )
        .setLabel("🧤 Kaleci")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(
          `register_cancel_${panelId}`
        )
        .setLabel("❌ İptal Et")
        .setStyle(ButtonStyle.Danger)
    );

  await message.reply({
    embeds: [
      makeEmbed(
        "📋 Axera League Kayıt",
        `👤 Oyuncu: <@${target.id}>\n` +
        `🏷️ İsim: **${String(nickname)
          .replace(/[*_`]/g, "")}**\n\n` +
        `Aşağıdan oyuncu rolünü seçiniz.`
      )
    ],
    components: [row]
  });
}

async function completeRegistration(
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

  const registrationRoles = [
    IDS.roles.kayitsiz,
    IDS.roles.futbolcu,
    IDS.roles.uye,
    IDS.roles.td,
    IDS.roles.kaleci
  ];

  await member.roles
    .remove(
      registrationRoles.filter(
        id =>
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

  await member.roles
    .add(roleMap[type])
    .catch(() => {});

  const user = ensureUser(member);

  user.name = panel.nickname;

  if (
    !Number.isFinite(
      Number(user.value)
    )
  ) {
    user.value = 0;
  }

  saveData();

  if (member.manageable) {
    await member
      .setNickname(panel.nickname)
      .catch(() => {});
  }

  delete db.registrationPanels[
    interaction.message.id
  ];

  saveData();

  const roleName =
    type === "td"
      ? "Teknik Direktör"
      : type === "uye"
      ? "Üye"
      : type === "kaleci"
      ? "Kaleci"
      : "Futbolcu";

  await interaction.update({
    embeds: [
      makeEmbed(
        "✅ Kayıt Tamamlandı",
        `👤 <@${member.id}>\n` +
        `🏷️ İsim: **${panel.nickname}**\n` +
        `🎭 Rol: **${roleName}**`,
        0x57F287
      )
    ],
    components: []
  });
}

/* =========================
   ANTRENMAN
========================= */

async function trainingCommand(message) {
  if (
    !onlyChannel(
      message,
      IDS.channels.ant
    )
  ) {
    return;
  }

  ensureUser(message.member);

  const current =
    db.training[message.author.id] || 0;

  const next = current + 1;

  if (next >= 5) {
    db.training[message.author.id] = 0;

    saveData();

    const value =
      await changePlayerValue(
        message.member,
        3,
        "5/5 antrenman ödülü"
      );

    return message.reply(
      `🏋️ **5/5 Antrenman Tamamlandı!**\n\n` +
      `💰 Ödül: **+3M€**\n` +
      `📈 Yeni değer: **${money(value)}**`
    );
  }

  db.training[message.author.id] =
    next;

  saveData();

  return message.reply(
    `🏋️ Antrenman: **${next}/5**`
  );
}

/* =========================
   PENALTI
========================= */

async function penaltyCommand(message) {
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

  if (random < 0.50) {
    result = "⚽ GOL";
  } else if (random < 0.75) {
    result = "🥅 DİREK";
  } else {
    result = "🧤 KALECİ";
  }

  if (result === "⚽ GOL") {
    const value =
      await changePlayerValue(
        message.member,
        5,
        "Penaltı gol ödülü"
      );

    return message.reply(
      `🎯 **Penaltı Sonucu**\n\n` +
      `${result}\n\n` +
      `💰 Ödül: **+5M€**\n` +
      `📈 Yeni değer: **${money(value)}**`
    );
  }

  return message.reply(
    `🎯 **Penaltı Sonucu:** ${result}`
  );
}

/* =========================
   MAÇ SİSTEMİ
========================= */

async function startMatch(
  message,
  teamA,
  teamB
) {
  const matchId =
    `${Date.now()}_${teamA}_${teamB}`;

  let scoreA = 0;
  let scoreB = 0;
  let minute = 0;

  const events = [];

  const playersA =
    getTeamPlayers(
      message.guild,
      teamA
    );

  const playersB =
    getTeamPlayers(
      message.guild,
      teamB
    );

  db.activeMatches[matchId] = {
    teamA,
    teamB,
    startedAt: Date.now(),
    scoreA: 0,
    scoreB: 0
  };

  saveData();

  const matchMessage =
    await message.channel.send({
      embeds: [
        makeEmbed(
          "⚽ Axera League Maçı",
          `**${teamA} 0 - 0 ${teamB}**\n\n` +
          `⏱️ **0'**\n\n` +
          `🔔 Maç başladı!`
        )
      ]
    });

  const interval =
    setInterval(async () => {

      minute++;

      const chance =
        Math.random();

      let eventText = "";

      if (chance < 0.07) {

        const attackingTeam =
          Math.random() < 0.5
            ? teamA
            : teamB;

        const players =
          getTeamPlayers(
            message.guild,
            attackingTeam
          );

        const player =
          players.length
            ? players[
                Math.floor(
                  Math.random() *
                  players.length
                )
              ]
            : null;

        if (Math.random() < 0.28) {

          if (attackingTeam === teamA) {
            scoreA++;
          } else {
            scoreB++;
          }

          eventText =
            `⚽ **GOL!** ${attackingTeam}` +
            (
              player
                ? ` — **${getPlayerName(player)}**`
                : ""
            );

          if (player) {
            await changePlayerValue(
              player,
              2,
              "Maç golü"
            );
          }

        } else {

          eventText =
            `🔥 **${attackingTeam}** tehlikeli bir atak geliştirdi.`;
        }

      } else if (chance < 0.16) {

        eventText =
          "🧤 Kaleci kritik bir kurtarış yaptı.";

      } else if (chance < 0.22) {

        eventText =
          "⚡ Hızlı bir hücum gelişiyor.";

      } else if (chance < 0.27) {

        eventText =
          "🟨 Hakem faul düdüğünü çaldı.";

      } else {

        eventText =
          "⚽ Orta saha mücadelesi devam ediyor.";
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

      saveData();

      await matchMessage
        .edit({
          embeds: [
            makeEmbed(
              "⚽ Axera League Maçı",
              `**${teamA} ${scoreA} - ${scoreB} ${teamB}**\n\n` +
              `⏱️ **${minute}'**\n\n` +
              events
                .slice(-4)
                .join("\n")
            )
          ]
        })
        .catch(() => {});

      if (minute >= 90) {

        clearInterval(interval);

        const participants =
          [
            ...playersA,
            ...playersB
          ];

        const uniquePlayers =
          [
            ...new Map(
              participants.map(
                member => [
                  member.id,
                  member
                ]
              )
            ).values()
          ];

        for (const player of uniquePlayers) {
          await changePlayerValue(
            player,
            5,
            "Maç katılım ödülü"
          );
        }

        addMatchResult(
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
          date: Date.now()
        };

        delete db.activeMatches[
          matchId
        ];

        saveData();

        await matchMessage
          .edit({
            embeds: [
              makeEmbed(
                "🏁 Maç Sona Erdi",
                `**${teamA} ${scoreA} - ${scoreB} ${teamB}**\n\n` +
                `💰 Katılan oyunculara **+5M€** verildi.\n` +
                `🏆 Puan durumu güncellendi.`,
                0x57F287
              )
            ]
          })
          .catch(() => {});

        await postStandings(
          message.guild
        );
      }

    }, 3000);
}

/* =========================
   FİKSTÜR
========================= */

async function startDueFixtures() {
  for (const fixture of db.fixtures) {

    if (fixture.started) {
      continue;
    }

    if (
      Date.now() >=
      fixture.timestamp
    ) {

      fixture.started = true;

      saveData();

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

      await startMatch(
        {
          guild,
          channel,
          author: {
            id: "FIXTURE"
          }
        },
        fixture.teamA,
        fixture.teamB
      );
    }
  }
}

/* =========================
   AI AXERA
========================= */

async function aiReply(message) {

  if (!ai) {
    return message.reply(
      "❌ `OPENAI_API_KEY` Railway Variables bölümünde bulunamadı."
    );
  }

  const question =
    message.content.trim();

  if (
    /seni kim kurdu/i.test(
      question
    )
  ) {
    return message.reply(
      "Lynox9380 kurdu."
    );
  }

  if (
    /yapay ?zeka altyap/i.test(
      question
    ) ||
    /ai altyap/i.test(
      question
    )
  ) {
    return message.reply(
      "Axera League"
    );
  }

  try {

    const response =
      await ai.responses.create({
        model: "gpt-5.6-luna",

        instructions:
          "Sen Axera League yapay zekâ asistanısın. " +
          "Türkçe konuş. Hızlı, kısa ve anlaşılır cevaplar ver. " +
          "Sunucu yöneticisi adına işlem yaptığını iddia etme.",

        input: question,

        max_output_tokens: 300
      });

    const answer =
      response.output_text ||
      "Şu anda cevap oluşturamadım.";

    return message.reply(
      answer.slice(0, 1900)
    );

  } catch (error) {

    console.error(
      "AI Hatası:",
      error
    );

    return message.reply(
      "❌ Axera AI şu anda cevap veremiyor."
    );
  }
}

/* =========================
   BOT DURUMU
========================= */

let lastStatusKey = "";

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
      const message of
      messages.values()
    ) {

      if (
        message.author.id ===
        client.user.id
      ) {
        await message
          .delete()
          .catch(() => {});
      }
    }
  }

  const totalMembers =
    client.guilds.cache.reduce(
      (total, guild) =>
        total + guild.memberCount,
      0
    );

  await channel.send({
    embeds: [
      makeEmbed(
        "🟢 Axera League Bot Durumu",
        `**Tüm sistemler sorunsuz çalışıyor.**\n\n` +
        `📡 Ping: **${client.ws.ping}ms**\n` +
        `🏠 Sunucu: **${client.guilds.cache.size}**\n` +
        `👥 Kullanıcı: **${totalMembers}**\n` +
        `⚙️ Komut sayısı: **${COMMAND_COUNT}**\n` +
        `🕐 ${new Date().toLocaleString("tr-TR")}`,
        0x57F287
      )
    ]
  }).catch(() => {});
}

/* =========================
   KOMUT LİSTESİ
========================= */

let COMMAND_COUNT = 0;

const prefix = ".";

const commands = new Set([
  "k",
  "kayıtsızver",
  "ara",

  "dver",
  "dsil",

  "ant",
  "antrenman",
  "pen",
  "penaltı",
  "penalti",

  "maç",
  "mac",

  "takımekle",
  "takımkaldır",
  "puanekle",
  "takımdeğer",

  "kadroekle",
  "kadrocikar",
  "kadrosil",
  "kadro",
  "formasyon",

  "puan",

  "fiksturekle",
  "fikstür",
  "fikstur",
  "fiksturcikar",

  "bütçeekle",
  "bütçesil",
  "gönder",

  "sil",
  "embed",
  "kick",
  "ban",
  "mute",
  "unmute",
  "dm",

  "tweet",
  "rolpanel",
  "şart",
  "sart",

  "ticketpanel",

  "ai",
  "yapayzeka",

  "yardım",
  "yardim"
]);

/* =========================
   YENİ ÜYE
========================= */

client.on(
  "guildMemberAdd",
  async member => {

    await member.roles
      .add(
        IDS.roles.kayitsiz
      )
      .catch(() => {});

    const channel =
      member.guild.channels.cache.get(
        IDS.channels.kayit
      );

    if (channel) {

      await channel
        .send(
          `👋 Hoş geldin <@${member.id}>!\n` +
          `📋 Kayıt için <@&${IDS.roles.kayitYetkilisi}> ekibine ulaşabilirsin.`
        )
        .catch(() => {});
    }
  }
);

/* =========================
   BUTONLAR
========================= */

client.on(
  "interactionCreate",
  async interaction => {

    if (
      interaction.isButton()
    ) {

      const parts =
        interaction.customId.split("_");

      const type = parts[1];
      const panelId =
        parts.slice(2).join("_");

      /* KAYIT */

      if (
        interaction.customId
          .startsWith("register_")
      ) {

        if (type === "cancel") {

          const panel =
            db.registrationPanels[
              panelId
            ];

          if (
            !isAdmin(
              interaction.member
            ) &&
            interaction.user.id !==
              panel?.userId
          ) {
            return interaction.reply({
              content:
                "❌ Bu paneli iptal etme yetkin yok.",
              ephemeral: true
            });
          }

          delete db.registrationPanels[
            panelId
          ];

          saveData();

          return interaction.update({
            embeds: [
              makeEmbed(
                "❌ Kayıt İptal Edildi",
                "Bu kayıt paneli iptal edildi.",
                0xED4245
              )
            ],
            components: []
          });
        }

        return completeRegistration(
          interaction,
          type
        );
      }

      /* TICKET */

      if (
        interaction.customId ===
        "ticket_create"
      ) {

        const guild =
          interaction.guild;

        const existing =
          Object.values(
            db.tickets
          ).find(
            ticket =>
              ticket.guildId === guild.id &&
              ticket.userId ===
                interaction.user.id &&
              ticket.open
          );

        if (existing) {
          return interaction.reply({
            content:
              `❌ Zaten açık bir biletin var: <#${existing.channelId}>`,
            ephemeral: true
          });
        }

        const channel =
          await guild.channels.create({
            name:
              `ticket-${interaction.user.username}`
                .slice(0, 90),

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
          guildId: guild.id,
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
                  "🔒 Bileti Kapat"
                )
                .setStyle(
                  ButtonStyle.Danger
                )
            );

        await channel.send({
          content:
            `<@${interaction.user.id}> <@&${IDS.roles.moderator}>`,

          embeds: [
            makeEmbed(
              "🎫 Destek Talebi",
              "Sorununuzu buraya yazabilirsiniz."
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

      if (
        interaction.customId ===
        "ticket_close"
      ) {

        if (
          !isStaff(
            interaction.member
          )
        ) {
          return interaction.reply({
            content:
              "❌ Bu bileti kapatma yetkin yok.",
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

        return setTimeout(
          () =>
            interaction.channel
              .delete()
              .catch(() => {}),
          1500
        );
      }

      /* ROL PANELİ */

      if (
        interaction.customId
          .startsWith("role_")
      ) {

        const roleId =
          interaction.customId
            .slice(5);

        const allowedRoles = [
          IDS.roles.partner,
          IDS.roles.macPing,
          IDS.roles.duyuru,
          IDS.roles.cekilis,
          IDS.roles.medya
        ];

        if (
          !allowedRoles.includes(
            roleId
          )
        ) {
          return;
        }

        const role =
          interaction.guild.roles.cache.get(
            roleId
          );

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
          content:
            has
              ? `❌ ${role?.name || "Rol"} kaldırıldı.`
              : `✅ ${role?.name || "Rol"} verildi.`,
          ephemeral: true
        });
      }
    }

    /* FORMASYON */

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId ===
        "formation_select"
    ) {

      if (
        !isStaff(
          interaction.member
        )
      ) {
        return interaction.reply({
          content:
            "❌ Yetkin yok.",
          ephemeral: true
        });
      }

      const [
        team,
        formation
      ] =
        interaction.values[0]
          .split("||");

      db.formations[team] =
        formation;

      saveData();

      return interaction.update({
        content:
          `✅ **${team}** formasyonu **${formation}** olarak ayarlandı.`,
        components: []
      });
    }
  }
);

/* =========================
   MESAJ KOMUTLARI
========================= */

client.on(
  "messageCreate",
  async message => {

    if (message.author.bot) {
      return;
    }

    /* TICKET AKTİFLİĞİ */

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

    /* AI KANALI */

    if (
      message.channel.id ===
      IDS.channels.ai &&
      !message.content.startsWith(
        prefix
      )
    ) {
      return aiReply(message);
    }

    /* KOMUT DEĞİLSE */

    if (
      !message.content.startsWith(
        prefix
      )
    ) {
      return;
    }

    const raw =
      message.content
        .trim()
        .slice(1);

    const parts =
      raw.split(/\s+/);

    const command =
      normalize(parts.shift());

    const args = parts;

    if (
      commands.has(command)
    ) {
      COMMAND_COUNT++;
    }

    /* =====================
       YARDIM
    ===================== */

    if (
      command === "yardım" ||
      command === "yardim"
    ) {

      return message.reply({
        embeds: [
          makeEmbed(
            "📚 Axera League Komutları",

            `**👤 Kayıt**
.k @oyuncu isim
.kayıtsızver @oyuncu
.ara oyuncu

**💰 Değer**
.dver @oyuncu 5M
.dsil @oyuncu 5M

**🏋️ Sistem**
.ant
.pen

**⚽ Maç**
.maç @Takım1 @Takım2
.kadroekle
.kadrocikar
.kadro
.formasyon

**🏆 Lig**
.puan
.fiksturekle
.fikstür
.fiksturcikar

**💳 Kişisel Bütçe**
.bütçeekle
.bütçesil
.gönder

**🎫 Destek**
.ticketpanel

**🛡️ Moderasyon**
.sil
.embed
.kick
.ban
.mute
.unmute
.dm

**📢 Diğer**
.tweet
.rolpanel
.şart
.ai

ℹ️ Kayıtsız üyeler normal sistemleri kullanabilir.`
          )
        ]
      });
    }

    /* =====================
       KAYIT
    ===================== */

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
          "❌ Kayıt yetkin yok."
        );
      }

      const target =
        getMentionedMember(
          message
        );

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.k @oyuncu isim`"
        );
      }

      const nickname =
        message.content
          .trim()
          .replace(
            /^\.k\s+<@!?\d+>\s*/i,
            ""
          )
          .trim();

      if (!nickname) {
        return message.reply(
          "❌ İsim yazmalısın.\nÖrnek: `.k @oyuncu takmadı`"
        );
      }

      const panelMessage =
        await message.channel.send(
          "⏳ Kayıt paneli hazırlanıyor..."
        );

      return createRegistrationPanel(
        panelMessage,
        target,
        nickname
      );
    }

    /* =====================
       KAYITSIZ VER
    ===================== */

    if (
      command ===
      "kayıtsızver"
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
        getMentionedMember(
          message
        );

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.kayıtsızver @oyuncu`"
        );
      }

      await target.roles
        .remove([
          IDS.roles.futbolcu,
          IDS.roles.uye,
          IDS.roles.td,
          IDS.roles.kaleci
        ])
        .catch(() => {});

      await target.roles
        .add(
          IDS.roles.kayitsiz
        )
        .catch(() => {});

      return message.reply(
        `✅ <@${target.id}> Kayıtsız yapıldı.`
      );
    }

    /* =====================
       OYUNCU ARA
    ===================== */

    if (
      command === "ara"
    ) {

      const query =
        normalize(
          args.join(" ")
        );

      if (!query) {
        return message.reply(
          "❌ Kullanım: `.ara oyuncu adı`"
        );
      }

      await message.guild.members
        .fetch()
        .catch(() => {});

      const members =
        [
          ...message.guild.members.cache.values()
        ].filter(
          member =>
            !member.user.bot &&
            !member.roles.cache.has(
              IDS.roles.kayitsiz
            )
        );

      const exact =
        members.filter(
          member =>
            normalize(
              getPlayerName(member)
            ) === query
        );

      const results =
        (
          exact.length
            ? exact
            : members.filter(
                member =>
                  normalize(
                    getPlayerName(member)
                  ).includes(query)
              )
        ).slice(0, 10);

      if (!results.length) {
        return message.reply(
          "❌ Oyuncu bulunamadı."
        );
      }

      const text =
        results
          .map(
            (member, index) =>
              `${index + 1}. **${getPlayerName(member)}** — <@${member.id}> — ${money(
                ensureUser(member).value
              )}`
          )
          .join("\n");

      return message.reply({
        embeds: [
          makeEmbed(
            "🔎 Oyuncu Arama",
            text
          )
        ]
      });
    }

    /* =====================
       DEĞER
    ===================== */

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
        !isAdmin(
          message.member
        ) &&
        !hasRole(
          message.member,
          [IDS.roles.deger]
        )
      ) {
        return message.reply(
          "❌ Değer yetkin yok."
        );
      }

      const target =
        getMentionedMember(
          message
        );

      const amount =
        parseAmount(
          args[1]
        );

      if (!target || !amount) {
        return message.reply(
          "❌ Kullanım: `.dver @oyuncu 5M`"
        );
      }

      const value =
        await changePlayerValue(
          target,
          command === "dver"
            ? amount
            : -amount,
          command
        );

      return message.reply(
        `✅ **${getPlayerName(target)}** yeni değeri: **${money(value)}**`
      );
    }

    /* =====================
       ANTRENMAN
    ===================== */

    if (
      command === "ant" ||
      command === "antrenman"
    ) {
      return trainingCommand(
        message
      );
    }

    /* =====================
       PENALTI
    ===================== */

    if (
      command === "pen" ||
      command === "penaltı" ||
      command === "penalti"
    ) {
      return penaltyCommand(
        message
      );
    }

    /* =====================
       MAÇ
    ===================== */

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
        !isAdmin(
          message.member
        ) &&
        !hasRole(
          message.member,
          [IDS.roles.spiker]
        )
      ) {
        return message.reply(
          "❌ Maç komutu için Spiker yetkisi gerekir."
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

      const textTeams =
        args
          .map(
            argument =>
              getTeamName(argument)
          )
          .filter(Boolean);

      teamA =
        teamA ||
        textTeams[0];

      teamB =
        teamB ||
        textTeams[1];

      if (
        !teamA ||
        !teamB ||
        teamA === teamB
      ) {
        return message.reply(
          "❌ Kullanım: `.maç @Takım1 @Takım2`"
        );
      }

      return startMatch(
        message,
        teamA,
        teamB
      );
    }

    /* =====================
       TAKIM
    ===================== */

    if (
      command === "takımekle" ||
      command === "takımkaldır" ||
      command === "puanekle" ||
      command === "takımdeğer"
    ) {

      if (
        !isAdmin(
          message.member
        ) &&
        !hasRole(
          message.member,
          [IDS.roles.spiker]
        )
      ) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const mentionedRole =
        [
          ...message.mentions.roles.values()
        ][0];

      const teamName =
        mentionedRole?.name ||
        getTeamName(
          args
            .join(" ")
            .replace(
              /<@&\d+>/g,
              ""
            )
            .trim()
        );

      if (!teamName) {
        return message.reply(
          "❌ Takım bulunamadı."
        );
      }

      if (
        command ===
        "takımekle"
      ) {
        ensureTeam(
          teamName
        );

        saveData();

        return message.reply(
          `✅ **${teamName}** lige eklendi.`
        );
      }

      if (
        command ===
        "takımkaldır"
      ) {
        delete db.teams[
          teamName
        ];

        saveData();

        return message.reply(
          `✅ **${teamName}** ligden kaldırıldı.`
        );
      }

      if (
        command ===
        "puanekle"
      ) {

        const amount =
          Number(
            args.at(-1)
          );

        if (
          !Number.isFinite(
            amount
          )
        ) {
          return message.reply(
            "❌ Puan miktarı belirt."
          );
        }

        ensureTeam(
          teamName
        ).score += amount;

        saveData();

        return message.reply(
          `✅ **${teamName}** takımına **${amount}** puan eklendi.`
        );
      }

      if (
        command ===
        "takımdeğer"
      ) {

        const amount =
          parseAmount(
            args.at(-1)
          );

        if (!amount) {
          return message.reply(
            "❌ Değer belirt."
          );
        }

        ensureTeam(
          teamName
        ).teamValue =
          amount;

        saveData();

        return message.reply(
          `✅ **${teamName}** takım değeri: **${money(amount)}**`
        );
      }
    }

    /* =====================
       KADRO
    ===================== */

    if (
      command ===
        "kadroekle" ||
      command ===
        "kadrocikar" ||
      command ===
        "kadrosil" ||
      command ===
        "kadro"
    ) {

      if (
        !isAdmin(
          message.member
        ) &&
        !hasRole(
          message.member,
          [IDS.roles.spiker]
        )
      ) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const mentionedRole =
        [
          ...message.mentions.roles.values()
        ][0];

      const teamName =
        mentionedRole?.name ||
        getTeamName(
          args[0]
        );

      const target =
        getMentionedMember(
          message
        );

      if (
        command === "kadro"
      ) {

        if (!teamName) {
          return message.reply(
            "❌ Takım belirt."
          );
        }

        const team =
          ensureTeam(
            teamName
          );

        const list =
          team.players.length
            ? team.players
                .map(
                  player =>
                    `• <@${player.id}> — ${player.position || "Oyuncu"}`
                )
                .join("\n")
            : "Manuel kadro boş.\nTakım rolündeki oyuncular maçlarda otomatik kullanılabilir.";

        return message.reply({
          embeds: [
            makeEmbed(
              `📋 ${teamName} Kadrosu`,
              list
            )
          ]
        });
      }

      if (
        !teamName ||
        !target
      ) {
        return message.reply(
          "❌ Kullanım: `.kadroekle @Takım @Oyuncu Pozisyon`"
        );
      }

      const team =
        ensureTeam(
          teamName
        );

      if (
        command ===
        "kadroekle"
      ) {

        team.players =
          team.players.filter(
            player =>
              player.id !==
              target.id
          );

        team.players.push({
          id: target.id,
          position:
            args.at(-1) ||
            "Oyuncu"
        });

        saveData();

        return message.reply(
          `✅ <@${target.id}> **${teamName}** kadrosuna eklendi.`
        );
      }

      team.players =
        team.players.filter(
          player =>
            player.id !==
            target.id
        );

      saveData();

      return message.reply(
        `✅ <@${target.id}> **${teamName}** kadrosundan çıkarıldı.`
      );
    }

    /* =====================
       FORMASYON
    ===================== */

    if (
      command ===
      "formasyon"
    ) {

      if (
        !isAdmin(
          message.member
        ) &&
        !hasRole(
          message.member,
          [IDS.roles.spiker]
        )
      ) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const teamName =
        getTeamName(
          args.join(" ")
        ) ||
        [
          ...message.mentions.roles.values()
        ][0]?.name;

      if (!teamName) {
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
            "formation_select"
          )
          .setPlaceholder(
            "Formasyon seç"
          )
          .addOptions(
            formations.map(
              formation => ({
                label: formation,
                value:
                  `${teamName}||${formation}`,
                description:
                  `${formation} sistemi`
              })
            )
          );

      return message.reply({
        content:
          `⚽ **${teamName}** için formasyon seç:`,
        components: [
          new ActionRowBuilder()
            .addComponents(menu)
        ]
      });
    }

    /* =====================
       PUAN
    ===================== */

    if (
      command === "puan"
    ) {
      return postStandings(
        message.guild
      );
    }

    /* =====================
       FİKSTÜR EKLE
    ===================== */

    if (
      command ===
      "fiksturekle"
    ) {

      if (
        !isAdmin(
          message.member
        ) &&
        !hasRole(
          message.member,
          [IDS.roles.spiker]
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

      const found =
        args
          .map(
            value =>
              getTeamName(value)
          )
          .filter(Boolean);

      teamA =
        teamA ||
        found[0];

      teamB =
        teamB ||
        found[1];

      const date =
        args.find(
          value =>
            /^\d{4}-\d{2}-\d{2}$/.test(
              value
            )
        );

      const time =
        args.find(
          value =>
            /^\d{2}:\d{2}$/.test(
              value
            )
        );

      if (
        !teamA ||
        !teamB ||
        !date ||
        !time
      ) {
        return message.reply(
          "❌ Kullanım:\n`.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`"
        );
      }

      const timestamp =
        new Date(
          `${date}T${time}:00+03:00`
        ).getTime();

      if (
        !Number.isFinite(
          timestamp
        )
      ) {
        return message.reply(
          "❌ Tarih geçersiz."
        );
      }

      db.fixtures.push({
        id:
          db.nextFixtureId++,

        guildId:
          message.guild.id,

        teamA,
        teamB,

        date,
        time,

        timestamp,

        started: false
      });

      saveData();

      return message.reply(
        `✅ **${teamA} - ${teamB}** fikstüre eklendi.\n` +
        `📅 ${date} ${time}`
      );
    }

    /* =====================
       FİKSTÜR LİSTE
    ===================== */

    if (
      command === "fikstür" ||
      command === "fikstur"
    ) {

      const fixtures =
        db.fixtures
          .filter(
            fixture =>
              fixture.guildId ===
                message.guild.id &&
              !fixture.started
          )
          .slice(0, 20);

      const text =
        fixtures.length
          ? fixtures
              .map(
                fixture =>
                  `• **${fixture.teamA} - ${fixture.teamB}** — ${fixture.date} ${fixture.time}`
              )
              .join("\n")
          : "Fikstür boş.";

      return message.reply({
        embeds: [
          makeEmbed(
            "📅 Axera League Fikstür",
            text
          )
        ]
      });
    }

    /* =====================
       FİKSTÜR SİL
    ===================== */

    if (
      command ===
      "fiksturcikar"
    ) {

      if (
        !isAdmin(
          message.member
        ) &&
        !hasRole(
          message.member,
          [IDS.roles.spiker]
        )
      ) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const teams =
        args
          .map(
            value =>
              getTeamName(value)
          )
          .filter(Boolean);

      if (teams.length < 2) {
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
            fixture.teamA ===
              teams[0] &&
            fixture.teamB ===
              teams[1]
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
        "✅ Fikstür silindi."
      );
    }

    /* =====================
       BÜTÇE
    ===================== */

    if (
      command ===
        "bütçeekle" ||
      command ===
        "bütçesil"
    ) {

      if (
        !isAdmin(
          message.member
        ) &&
        !hasRole(
          message.member,
          [IDS.roles.deger]
        )
      ) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const target =
        getMentionedMember(
          message
        );

      const amount =
        parseAmount(
          args[1]
        );

      if (
        !target ||
        !amount
      ) {
        return message.reply(
          "❌ Kullanım: `.bütçeekle @oyuncu 5M`"
        );
      }

      const user =
        ensureUser(
          target
        );

      if (
        command ===
        "bütçeekle"
      ) {
        user.budget +=
          amount;
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
        `💳 **${getPlayerName(target)}** kişisel bütçesi: **${money(user.budget)}**`
      );
    }

    /* =====================
       PARA GÖNDER
    ===================== */

    if (
      command === "gönder"
    ) {

      const target =
        getMentionedMember(
          message
        );

      const amount =
        parseAmount(
          args[1]
        );

      if (
        !target ||
        !amount
      ) {
        return message.reply(
          "❌ Kullanım: `.gönder @oyuncu 5M`"
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

    /* =====================
       MESAJ SİL
    ===================== */

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
          Number(args[0] || 0),
          1000
        );

      if (
        !Number.isInteger(
          amount
        ) ||
        amount <= 0
      ) {
        return message.reply(
          "❌ Silinecek mesaj sayısını belirt."
        );
      }

      const deleted =
        await message.channel
          .bulkDelete(
            amount,
            true
          )
          .catch(() => null);

      const response =
        await message.channel.send(
          `🧹 **${deleted?.size || 0}** mesaj silindi.`
        );

      setTimeout(
        () =>
          response
            .delete()
            .catch(() => {}),
        2500
      );

      return;
    }

    /* =====================
       EMBED
    ===================== */

    if (
      command === "embed"
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
            command.length
          )
          .trim();

      const split =
        content.split("|");

      const title =
        split[0]?.trim();

      const description =
        split
          .slice(1)
          .join("|")
          .trim();

      if (
        !title ||
        !description
      ) {
        return message.reply(
          "❌ Kullanım:\n`.embed Başlık | Açıklama`"
        );
      }

      return message.channel.send({
        embeds: [
          makeEmbed(
            title,
            description
          )
        ]
      });
    }

    /* =====================
       MODERASYON
    ===================== */

    if (
      command === "kick" ||
      command === "ban" ||
      command === "mute" ||
      command === "unmute"
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
        getMentionedMember(
          message
        );

      if (!target) {
        return message.reply(
          "❌ Oyuncu belirt."
        );
      }

      if (
        command === "kick"
      ) {
        await target
          .kick(
            "Axera League"
          )
          .catch(() => {});
      }

      if (
        command === "ban"
      ) {
        await target
          .ban({
            reason:
              "Axera League"
          })
          .catch(() => {});
      }

      if (
        command === "mute"
      ) {
        await target
          .timeout(
            28 *
              24 *
              60 *
              60 *
              1000,
            "Axera League"
          )
          .catch(() => {});
      }

      if (
        command ===
        "unmute"
      ) {
        await target
          .timeout(
            null,
            "Axera League"
          )
          .catch(() => {});
      }

      return message.reply(
        `✅ **${command}** işlemi uygulandı.`
      );
    }

    /* =====================
       DM
    ===================== */

    if (
      command === "dm"
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
        getMentionedMember(
          message
        );

      const text =
        args
          .slice(1)
          .join(" ");

      if (
        !target ||
        !text
      ) {
        return message.reply(
          "❌ Kullanım: `.dm @oyuncu mesaj`"
        );
      }

      const sent =
        await target.user
          .send(text)
          .then(() => true)
          .catch(() => false);

      return message.reply(
        sent
          ? "✅ DM gönderildi."
          : "❌ Oyuncuya DM gönderilemedi."
      );
    }

    /* =====================
       TWEET
    ===================== */

    if (
      command === "tweet"
    ) {

      if (
        !onlyChannel(
          message,
          IDS.channels.tweet
        )
      ) {
        return;
      }

      const text =
        args.join(" ");

      if (!text) {
        return message.reply(
          "❌ Tweet metni yaz."
        );
      }

      await message
        .delete()
        .catch(() => {});

      const last =
        db.tweetCooldowns[
          message.author.id
        ] || 0;

      let rewardText = "";

      if (
        Date.now() -
          last >=
        24 *
          60 *
          60 *
          1000
      ) {

        db.tweetCooldowns[
          message.author.id
        ] = Date.now();

        await changePlayerValue(
          message.member,
          5,
          "Tweet ödülü"
        );

        rewardText =
          "\n💰 **+5M€** tweet ödülü!";
      }

      saveData();

      return message.channel.send({
        embeds: [
          makeEmbed(
            "🐦 Tweet",
            `${text}${rewardText}\n\n— **${getPlayerName(
              message.member
            )}**`
          )
        ]
      });
    }

    /* =====================
       ROL PANEL
    ===================== */

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

      const roleButtons = [
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
        of roleButtons
      ) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(
              `role_${roleId}`
            )
            .setLabel(label)
            .setStyle(
              ButtonStyle.Secondary
            )
        );
      }

      return message.channel.send({
        embeds: [
          makeEmbed(
            "🎭 Rol Paneli",
            "İstediğin bildirim rollerini butonlardan açıp kapatabilirsin."
          )
        ],
        components: [row]
      });
    }

    /* =====================
       ŞARTLAR
    ===================== */

    if (
      command === "şart" ||
      command === "sart"
    ) {

      return message.reply({
        embeds: [
          makeEmbed(
            "📌 Axera League Şartları",

            `✓ Kalıcı Tık: Kalıcı 「✓」 kanalına tıklayınız.\n` +
            `🎭 Rol Al: Rol Al kanalından en az 2 rol alınız.\n\n` +
            `ℹ️ Bu şartlar zorunlu değildir.`
          )
        ]
      });
    }

    /* =====================
       TICKET PANEL
    ===================== */

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
          makeEmbed(
            "🎫 Axera League Destek",
            "Yardıma ihtiyacın varsa aşağıdaki butona bas."
          )
        ],
        components: [row]
      });
    }

    /* =====================
       AI KOMUTU
    ===================== */

    if (
      command === "ai" ||
      command === "yapayzeka"
    ) {

      const question =
        args.join(" ");

      if (!question) {
        return message.reply(
          "❌ Soru yaz."
        );
      }

      const fakeMessage = {
        ...message,
        content: question,
        reply:
          message.reply.bind(message)
      };

      return aiReply(
        fakeMessage
      );
    }
  }
);

/* =========================
   FİKSTÜR + TICKET + DURUM
========================= */

setInterval(
  async () => {

    await startDueFixtures()
      .catch(console.error);

    for (
      const [
        channelId,
        ticket
      ]
      of Object.entries(
        db.tickets
      )
    ) {

      if (
        ticket.open &&
        Date.now() -
          ticket.lastMessage >
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

    const now =
      new Date();

    const key =
      `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;

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

      lastStatusKey =
        key;

      await statusPost()
        .catch(console.error);
    }

  },
  1000
);

/* =========================
   BOT READY
========================= */

client.once(
  "ready",
  () => {

    console.log(
      `Axera League aktif: ${client.user.tag}`
    );

    client.user.setPresence({
      activities: [
        {
          name:
            "Axera League ⚽",
          type: 0
        }
      ],

      status: "online"
    });

    console.log(
      `Sunucu sayısı: ${client.guilds.cache.size}`
    );
  }
);

/* =========================
   HATA YÖNETİMİ
========================= */

process.on(
  "unhandledRejection",
  error => {
    console.error(
      "UNHANDLED:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  error => {
    console.error(
      "UNCAUGHT:",
      error
    );
  }
);

/* =========================
   BOTU BAŞLAT
========================= */

client.login(TOKEN);
