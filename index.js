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
    ai: "1547375186754408539",
    ant: "1547375589923618957",
    pen: "1547375997698052166",
    tweet: "1547377797193011340",
    mac: "1547376935410073692",
    puan: "1547382143775285431",
    deger: "1547376344927834122",
    durum: "1547388197796057118"
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
  matchHistory: {},
  rolePanel: null
};

function loadData() {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

    return {
      ...JSON.parse(JSON.stringify(DEFAULT)),
      ...data,
      users: data.users || {},
      teams: data.teams || {},
      fixtures: data.fixtures || [],
      registrationPanels: data.registrationPanels || {},
      tickets: data.tickets || {},
      training: data.training || {},
      tweetCooldowns: data.tweetCooldowns || {},
      matchHistory: data.matchHistory || {}
    };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT));
  }
}

let db = loadData();

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

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

const prefix = ".";

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

function embed(title, description, color = 0x5865f2) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();
}

function hasRole(member, ids) {
  if (!member?.roles?.cache) return false;

  return member.roles.cache.some(role =>
    ids.includes(role.id)
  );
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

function money(value) {
  const n = Math.max(0, Number(value) || 0);

  if (n >= 1000) return "1B€";

  return `${Math.round(n)}M€`;
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

  return match ? Number(match[1]) : 0;
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
  const maxBase =
    32 - separator.length - suffix.length;

  nickname = nickname.slice(
    0,
    Math.max(1, maxBase)
  );

  return `${nickname}${separator}${suffix}`;
}

function playerName(member) {
  const savedName = db.users[member.id]?.name;

  return (
    savedName ||
    member.nickname ||
    member.displayName ||
    member.user?.username ||
    "Oyuncu"
  );
}

function ensureUser(member) {
  if (!member) return null;

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

  if (!Number.isFinite(Number(user.budget))) {
    user.budget = 0;
  }

  return user;
}

async function changePlayerValue(
  member,
  delta,
  reason = ""
) {
  if (!member) return null;

  ensureUser(member);

  /*
   * DEĞERİN TEK KAYNAĞI DISCORD TAKMA ADIDIR.
   * DB'deki eski değer kullanılmaz.
   */
  const current = parseNickValue(member);

  const next = Math.min(
    1000,
    Math.max(0, current + Number(delta))
  );

  const oldNickname =
    member.nickname ||
    member.displayName ||
    playerName(member);

  const newNickname =
    setNickValue(oldNickname, next);

  if (member.manageable) {
    await member
      .setNickname(newNickname)
      .catch(() => {});
  }

  db.users[member.id] = {
    ...(db.users[member.id] || {}),
    name:
      db.users[member.id]?.name ||
      playerName(member),
    value: next,
    budget:
      Number(db.users[member.id]?.budget) || 0
  };

  saveData();

  return {
    oldValue: current,
    newValue: next,
    reason
  };
}

function mentionUser(message) {
  return message.mentions.members.first();
}

function teamRole(guild, teamName) {
  const roleId =
    IDS.teams[teamName] ||
    db.teams[teamName]?.roleId;

  if (!roleId) return null;

  return guild.roles.cache.get(roleId) || null;
}

function teamByName(text) {
  const query = normalize(text);

  if (!query) return null;

  const names = [
    ...new Set([
      ...Object.keys(IDS.teams),
      ...Object.keys(db.teams)
    ])
  ];

  const exact = names.find(
    name => normalize(name) === query
  );

  if (exact) return exact;

  return names.find(
    name =>
      normalize(name).includes(query) ||
      query.includes(normalize(name))
  );
}

function ensureTeam(name, roleId = null) {
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

  if (roleId) {
    db.teams[name].roleId = roleId;
  }

  if (!db.teams[name].ilk11) {
    db.teams[name].ilk11 = {};
  }

  return db.teams[name];
}

function teamMembers(guild, teamName) {
  const role = teamRole(guild, teamName);

  if (!role) return [];

  return [...role.members.values()];
}

function teamPlayers(guild, teamName) {
  const team = ensureTeam(teamName);

  const manual = (team.players || [])
    .map(player =>
      guild.members.cache.get(player.id)
    )
    .filter(Boolean);

  const rolePlayers =
    teamMembers(guild, teamName);

  return [
    ...new Map(
      [...manual, ...rolePlayers].map(
        member => [member.id, member]
      )
    ).values()
  ];
}

function getUserTeams(guild, member) {
  const names = [
    ...new Set([
      ...Object.keys(IDS.teams),
      ...Object.keys(db.teams)
    ])
  ];

  return names.filter(name => {
    const role = teamRole(guild, name);

    return (
      role &&
      member?.roles?.cache?.has(role.id)
    );
  });
}

const FIRST11_POSITIONS = [
  ["kaleci", "🧤 Kaleci"],
  ["sagbek", "➡️ Sağ Bek"],
  ["stoper1", "🛡️ Stoper"],
  ["stoper2", "🛡️ Stoper"],
  ["solbek", "⬅️ Sol Bek"],
  ["ortasaha1", "⚙️ Orta Saha"],
  ["ortasaha2", "⚙️ Orta Saha"],
  ["ortasaha3", "⚙️ Orta Saha"],
  ["forvet1", "⚽ Forvet"],
  ["forvet2", "⚽ Forvet"],
  ["kanat", "🔥 Kanat"]
];

function getFirst11(guild, teamName) {
  const team = ensureTeam(teamName);
  const ids = FIRST11_POSITIONS
    .map(([key]) => team.ilk11[key])
    .filter(Boolean);

  return ids
    .map(id => guild.members.cache.get(id))
    .filter(Boolean);
}

function getMatchPlayers(guild, teamName) {
  const first11 = getFirst11(
    guild,
    teamName
  );

  if (first11.length >= 2) {
    return first11;
  }

  return teamPlayers(guild, teamName);
}

function addStandingResult(
  teamA,
  teamB,
  scoreA,
  scoreB
) {
  const a = ensureTeam(teamA);
  const b = ensureTeam(teamB);

  a.gf += scoreA;
  a.ga += scoreB;
  a.gd = a.gf - a.ga;

  b.gf += scoreB;
  b.ga += scoreA;
  b.gd = b.gf - b.ga;

  if (scoreA > scoreB) {
    a.score += 3;
  } else if (scoreB > scoreA) {
    b.score += 3;
  } else {
    a.score += 1;
    b.score += 1;
  }

  saveData();
}

async function registerPanel(
  message,
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

  const cleanNickname =
    String(nickname)
      .replace(/[*_`]/g, "")
      .slice(0, 32);

  const panel = await message.reply({
    embeds: [
      embed(
        "📋 Axera League Kayıt",
        `👤 Oyuncu: <@${target.id}>\n` +
        `🏷️ İsim: **${cleanNickname}**\n\n` +
        `Aşağıdaki butonlardan oyuncunun rolünü seçin.`
      )
    ],
    components: [row]
  });

  db.registrationPanels[panel.id] = {
    userId: target.id,
    nickname: cleanNickname,
    createdBy: message.author.id
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

  if (
    !isAdmin(interaction.member) &&
    !hasRole(interaction.member, [
      IDS.roles.kayitYetkilisi
    ])
  ) {
    return interaction.reply({
      content:
        "❌ Bu kayıt işlemi için yetkin yok.",
      ephemeral: true
    });
  }

  const member =
    await interaction.guild.members
      .fetch(panel.userId)
      .catch(() => null);

  if (!member) {
    return interaction.reply({
      content: "❌ Oyuncu bulunamadı.",
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
          "Kayıt paneli iptal edildi.",
          0xed4245
        )
      ],
      components: []
    });
  }

  const removableRoles = [
    IDS.roles.kayitsiz,
    IDS.roles.futbolcu,
    IDS.roles.uye,
    IDS.roles.td
  ];

  if (IDS.roles.kaleci) {
    removableRoles.push(
      IDS.roles.kaleci
    );
  }

  await member.roles
    .remove(
      removableRoles.filter(id =>
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

  const roleId = roleMap[type];

  if (roleId) {
    await member.roles
      .add(roleId)
      .catch(() => {});
  }

  ensureUser(member);

  db.users[member.id].name =
    panel.nickname;

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
    type === "futbolcu"
      ? "Futbolcu"
      : type === "uye"
      ? "Üye"
      : type === "td"
      ? "Teknik Direktör"
      : "Kaleci";

  return interaction.update({
    embeds: [
      embed(
        "✅ Kayıt Tamamlandı",
        `👤 <@${member.id}>\n` +
        `🏷️ **${panel.nickname}**\n` +
        `🎭 Rol: **${roleName}**`,
        0x57f287
      )
    ],
    components: []
  });
}

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
      "Antrenman"
    );

  return message.reply(
    `🏋️ Antrenman tamamlandı!\n` +
    `💰 **+1M€**\n` +
    `📈 Yeni değer: **${money(
      result.newValue
    )}**`
  );
}

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

  if (random < 0.5) {
    return message.reply(
      "🎯 Penaltı: **⚽ GOL!**"
    );
  }

  if (random < 0.75) {
    return message.reply(
      "🎯 Penaltı: **🥅 DİREK!**"
    );
  }

  if (random < 0.875) {
    return message.reply(
      "🎯 Penaltı: **🧤 KALECİ!**"
    );
  }

  return message.reply(
    "🎯 Penaltı: **🟦 KORNER!**"
  );
}

async function runMatch(
  message,
  teamA,
  teamB
) {
  const guild = message.guild;

  const key =
    `${guild.id}_${Date.now()}_${teamA}_${teamB}`;

  let scoreA = 0;
  let scoreB = 0;
  let minute = 0;

  const events = [];

  const playersA =
    getMatchPlayers(guild, teamA);

  const playersB =
    getMatchPlayers(guild, teamB);

  db.activeMatches[key] = {
    guildId: guild.id,
    teamA,
    teamB,
    scoreA: 0,
    scoreB: 0,
    startedAt: Date.now()
  };

  saveData();

  const matchMessage =
    await message.channel.send({
      embeds: [
        embed(
          "⚽ Axera League Maçı",
          `**${teamA} 0 - 0 ${teamB}**\n` +
          `⏱️ 0'\n\n` +
          `🏁 Maç başladı!`
        )
      ]
    });

  const interval =
    setInterval(async () => {
      minute++;

      let commentary =
        "⚽ Paslaşmalar devam ediyor.";

      const chance =
        Math.random();

      if (chance < 0.07) {
        const attackingTeam =
          Math.random() < 0.5
            ? teamA
            : teamB;

        const players =
          attackingTeam === teamA
            ? playersA
            : playersB;

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

          /*
           * GOLDE ARTIK HİÇBİR DEĞER ÖDÜLÜ YOK.
           * Oyuncunun M€ değeri değiştirilmez.
           */

          commentary =
            `⚽ **GOL!** ${attackingTeam}` +
            `${
              player
                ? ` — ${playerName(player)}`
                : ""
            }!`;
        } else {
          commentary =
            `🔥 ${attackingTeam} tehlikeli bir atak geliştirdi.`;
        }
      } else if (chance < 0.16) {
        commentary =
          "🧤 Kaleci kritik bir kurtarış yaptı!";
      } else if (chance < 0.22) {
        commentary =
          "⚡ Hızlı bir hücum gelişiyor...";
      } else if (chance < 0.27) {
        commentary =
          "🟨 Hakem faul düdüğünü çaldı.";
      }

      events.push(
        `${minute}' ${commentary}`
      );

      db.activeMatches[key].scoreA =
        scoreA;

      db.activeMatches[key].scoreB =
        scoreB;

      saveData();

      await matchMessage
        .edit({
          embeds: [
            embed(
              "⚽ Axera League Maçı",
              `**${teamA} ${scoreA} - ${scoreB} ${teamB}**\n` +
              `⏱️ ${minute}'\n\n` +
              events.slice(-4).join("\n")
            )
          ]
        })
        .catch(() => {});

      if (minute >= 90) {
        clearInterval(interval);

        const participants = [
          ...new Map(
            [
              ...playersA,
              ...playersB
            ].map(member => [
              member.id,
              member
            ])
          ).values()
        ];

        /*
         * Maç katılım ödülü devam eder.
         * Gol için ayrıca hiçbir değer verilmez.
         */

        for (const player of participants) {
          await changePlayerValue(
            player,
            5,
            "Maç katılımı"
          );
        }

        addStandingResult(
          teamA,
          teamB,
          scoreA,
          scoreB
        );

        db.matchHistory[key] = {
          guildId: guild.id,
          teamA,
          teamB,
          scoreA,
          scoreB,
          date: Date.now()
        };

        delete db.activeMatches[key];

        saveData();

        await matchMessage
          .edit({
            embeds: [
              embed(
                "🏁 Maç Sona Erdi",
                `**${teamA} ${scoreA} - ${scoreB} ${teamB}**\n\n` +
                `💰 Maça katılan oyunculara **+5M€** verildi.\n` +
                `⚽ Gol için ekstra değer verilmedi.`,
                0x57f287
              )
            ]
          })
          .catch(() => {});

        await postStandings(
          guild
        );
      }
    }, 3000);
}

async function postStandings(guild) {
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

  const rows = names
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

  const text =
    rows.length
      ? rows
          .map(
            ([name, team], index) =>
              `${index + 1}. **${name}** — ` +
              `${team.score} P | ` +
              `AV ${team.gd} | ` +
              `AG ${team.gf}`
          )
          .join("\n")
      : "Puan durumu boş.";

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

async function startDueFixtures() {
  for (const fixture of db.fixtures) {
    if (fixture.started) continue;

    if (Date.now() >= fixture.timestamp) {
      fixture.started = true;

      saveData();

      const guild =
        client.guilds.cache.get(
          fixture.guildId
        );

      const channel =
        guild?.channels.cache.get(
          IDS.channels.mac
        );

      if (!guild || !channel) continue;

      await runMatch(
        {
          guild,
          channel,
          member: null,
          author: {
            id: "fixture"
          }
        },
        fixture.teamA,
        fixture.teamB
      );
    }
  }
}

async function aiReply(message) {
  const question =
    message.content.trim();

  if (/seni kim kurdu/i.test(question)) {
    return message.reply(
      "Lynox9380 kurdu."
    );
  }

  if (
    /yapay ?zeka altyap(ı|i)|ai altyap/i.test(
      question
    )
  ) {
    return message.reply(
      "Axera League"
    );
  }

  if (!ai) {
    return message.reply(
      "❌ OPENAI_API_KEY ayarlanmamış."
    );
  }

  try {
    const response =
      await ai.responses.create({
        model: "gpt-5.6-luna",

        instructions:
          "Sen Axera League yapay zekâ asistanısın. Türkçe, kısa ve faydalı cevap ver.",

        input: question,

        max_output_tokens: 300
      });

    return message.reply(
      (
        response.output_text ||
        "Şu anda cevap oluşturamadım."
      ).slice(0, 1900)
    );
  } catch (error) {
    console.error("AI:", error);

    return message.reply(
      "❌ Yapay zekâ şu anda cevap veremiyor."
    );
  }
}

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
    for (const message of messages.values()) {
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
      embed(
        "🟢 Axera League Bot Durumu",
        `**Tüm sistemler sorunsuz çalışıyor.**\n\n` +
        `📡 Ping: **${client.ws.ping}ms**\n` +
        `🏠 Sunucu: **${client.guilds.cache.size}**\n` +
        `👥 Kullanıcı: **${totalMembers}**\n` +
        `🕐 ${new Date().toLocaleString(
          "tr-TR"
        )}`,
        0x57f287
      )
    ]
  });
}

const COMMANDS = new Set([
  "k",
  "kayıtsızver",
  "ara",
  "değer",
  "deger",
  "değerliste",
  "degerliste",
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
  "formasyon",
  "ilk11",
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
  "rolver",
  "rolal",
  "rolverhepsi",
  "rolalhepsi",
  "şart",
  "sart",
  "ticketpanel",
  "yardım",
  "yardim",
  "ai",
  "yapayzeka"
]);

let commandCount = 0;
let lastStatusKey = "";

client.on(
  "guildMemberAdd",
  async member => {
    await member.roles
      .add(IDS.roles.kayitsiz)
      .catch(() => {});

    const channel =
      member.guild.channels.cache.get(
        IDS.channels.kayit
      );

    if (channel) {
      await channel
        .send(
          `👋 Hoş geldin <@${member.id}>!\n` +
          `Kayıt için <@&${IDS.roles.kayitYetkilisi}> ekibine ulaşabilirsin.`
        )
        .catch(() => {});
    }
  }
);

client.on(
  "interactionCreate",
  async interaction => {
    if (interaction.isButton()) {
      const parts =
        interaction.customId.split("_");

      if (parts[0] === "register") {
        const type = parts[1];

        if (
          !isAdmin(interaction.member) &&
          !hasRole(interaction.member, [
            IDS.roles.kayitYetkilisi
          ])
        ) {
          return interaction.reply({
            content:
              "❌ Bu işlem için yetkin yok.",
            ephemeral: true
          });
        }

        return finishRegister(
          interaction,
          type
        );
      }

      if (
        interaction.customId ===
        "ticket_create"
      ) {
        const guild =
          interaction.guild;

        const existing =
          Object.values(db.tickets).find(
            ticket =>
              ticket.guildId === guild.id &&
              ticket.userId ===
                interaction.user.id &&
              ticket.open
          );

        if (existing) {
          return interaction.reply({
            content:
              `❌ Zaten açık biletin var: <#${existing.channelId}>`,
            ephemeral: true
          });
        }

        const channel =
          await guild.channels.create({
            name:
              `ticket-${interaction.user.username}`
                .slice(0, 90),

            type: ChannelType.GuildText,

            permissionOverwrites: [
              {
                id:
                  guild.roles.everyone.id,
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
          })
          .catch(() => null);

        if (!channel) {
          return interaction.reply({
            content:
              "❌ Bilet oluşturulamadı.",
            ephemeral: true
          });
        }

        db.tickets[channel.id] = {
          guildId: guild.id,
          userId: interaction.user.id,
          channelId: channel.id,
          open: true,
          lastMessage: Date.now()
        };

        saveData();

        const closeRow =
          new ActionRowBuilder().addComponents(
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
            embed(
              "🎫 Destek Talebi",
              "Sorununuzu buraya yazabilirsiniz."
            )
          ],

          components: [closeRow]
        });

        return interaction.reply({
          content:
            `✅ Bilet oluşturuldu: ${channel}`,
          ephemeral: true
        });
      }

      if (
        interaction.customId ===
        "ticket_close"
      ) {
        const ticket =
          db.tickets[
            interaction.channel.id
          ];

        if (
          !ticket ||
          !ticket.open
        ) {
          return interaction.reply({
            content:
              "❌ Bu bilet zaten kapalı.",
            ephemeral: true
          });
        }

        if (
          interaction.user.id !==
            ticket.userId &&
          !hasRole(interaction.member, [
            IDS.roles.moderator
          ]) &&
          !isAdmin(interaction.member)
        ) {
          return interaction.reply({
            content:
              "❌ Bu bileti kapatma yetkin yok.",
            ephemeral: true
          });
        }

        ticket.open = false;

        saveData();

        await interaction.reply(
          "🔒 Bilet kapatılıyor..."
        );

        await sleep(1500);

        return interaction.channel
          .delete()
          .catch(() => {});
      }

      if (
        interaction.customId.startsWith(
          "role_"
        )
      ) {
        const roleId =
          interaction.customId.replace(
            "role_",
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
            role.id
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

      if (
        interaction.customId.startsWith(
          "first11_"
        )
      ) {
        if (
          !isAdmin(interaction.member) &&
          !hasRole(interaction.member, [
            IDS.roles.spiker,
            IDS.roles.td
          ])
        ) {
          return interaction.reply({
            content:
              "❌ İlk 11 panelini kullanma yetkin yok.",
            ephemeral: true
          });
        }

        return interaction.reply({
          content:
            "ℹ️ İlk 11 oyuncularını değiştirmek için `.ilk11 @Takım` panelini yeniden açabilirsin.",
          ephemeral: true
        });
      }
    }

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId ===
        "formation_select"
    ) {
      if (
        !isAdmin(interaction.member) &&
        !hasRole(interaction.member, [
          IDS.roles.spiker
        ])
      ) {
        return interaction.reply({
          content:
            "❌ Yetkin yok.",
          ephemeral: true
        });
      }

      const [team, formation] =
        interaction.values[0].split("||");

      ensureTeam(team).formation =
        formation;

      saveData();

      return interaction.update({
        content:
          `⚽ **${team}** formasyonu: **${formation}**`,
        components: []
      });
    }
  }
);

client.on(
  "messageCreate",
  async message => {
    if (message.author.bot) return;

    const ticket =
      db.tickets[message.channel.id];

    if (ticket?.open) {
      ticket.lastMessage = Date.now();
      saveData();
    }

    /*
     * AI kanalında normal mesajlar.
     */
    if (
      message.channel.id ===
        IDS.channels.ai &&
      !message.content.startsWith(prefix)
    ) {
      return aiReply(message);
    }

    if (!message.content.startsWith(prefix)) {
      return;
    }

    const raw =
      message.content
        .trim()
        .slice(1);

    const parts =
      raw.split(/\s+/);

    const cmd =
      normalize(parts.shift());

    const args = parts;

    if (COMMANDS.has(cmd)) {
      commandCount++;
    }

    /*
     * ÖZEL AI CEVAPLARI
     */
    if (
      /seni kim kurdu/i.test(
        raw
      )
    ) {
      return message.reply(
        "Lynox9380 kurdu."
      );
    }

    if (
      /yapay ?zeka altyap(ı|i)|ai altyap/i.test(
        raw
      )
    ) {
      return message.reply(
        "Axera League"
      );
    }

    /*
     * YARDIM
     */
    if (
      cmd === "yardım" ||
      cmd === "yardim"
    ) {
      return message.reply({
        embeds: [
          embed(
            "📚 AXERA LEAGUE — KOMUTLAR",
            `**👤 KAYIT & OYUNCU**

` +
            `• \`.k @oyuncu isim\`
` +
            `• \`.kayıtsızver @oyuncu\`
` +
            `• \`.ara oyuncu\`
` +
            `• \`.değer @oyuncu\`
` +
            `• \`.değerliste\`

` +
            `**💰 DEĞER**

` +
            `• \`.dver @oyuncu 5M\` → Değere ekler
` +
            `• \`.dsil @oyuncu 5M\` → Değerden çıkarır
` +
            `• Değer Discord takma adındaki M€ kısmından okunur
` +
            `• Maksimum değer: 1B€

` +
            `**🏋️ OYUN SİSTEMLERİ**

` +
            `• \`.ant\` → +1M€
` +
            `• \`.pen\` → Penaltı
` +
            `• \`.tweet mesaj\` → Tweet ve +10M€ ödül

` +
            `**⚽ MAÇ**

` +
            `• \`.maç @Takım1 @Takım2\`
` +
            `• \`.ilk11 @Takım\`
` +
            `• \`.formasyon @Takım\`
` +
            `• \`.puan\`

` +
            `⚽ Gol atılınca ekstra değer verilmez.
` +
            `💰 Maç katılım ödülü +5M€'dur.

` +
            `**📅 FİKSTÜR**

` +
            `• \`.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM\`
` +
            `• \`.fikstür\`
` +
            `• \`.fiksturcikar @Takım1 @Takım2\`

` +
            `**🏆 TAKIM**

` +
            `• \`.takımekle @Takım\`
` +
            `• \`.takımkaldır @Takım\`
` +
            `• \`.puanekle @Takım 3\`
` +
            `• \`.takımdeğer @Takım 850M\`

` +
            `**💳 KİŞİSEL BÜTÇE**

` +
            `• \`.bütçeekle @oyuncu 50M\`
` +
            `• \`.bütçesil @oyuncu 50M\`
` +
            `• \`.gönder @oyuncu 50M\`

` +
            `**🛡️ YÖNETİCİ**

` +
            `• \`.rolver @Oyuncu @Rol\`
` +
            `• \`.rolal @Oyuncu @Rol\`
` +
            `• \`.rolverhepsi @Rol\`
` +
            `• \`.rolalhepsi @Rol\`
` +
            `• \`.sil\`
` +
            `• \`.embed\`
` +
            `• \`.kick\`
` +
            `• \`.ban\`
` +
            `• \`.mute\`
` +
            `• \`.unmute\`
` +
            `• \`.dm\`

` +
            `**🎫 DİĞER**

` +
            `• \`.ticketpanel\`
` +
            `• \`.rolpanel\`
` +
            `• \`.şart\`
` +
            `• \`.ai\` / \`.yapayzeka\`

` +
            `ℹ️ Kayıtsız üyeler oyun sistemlerini kullanabilir.`,
            0x5865f2
          )
        ]
      });
    }

    /*
     * ROL YÖNETİMİ
     */
    if (
      [
        "rolver",
        "rolal",
        "rolverhepsi",
        "rolalhepsi"
      ].includes(cmd)
    ) {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Bu komutu sadece Yöneticiler kullanabilir."
        );
      }

      const role =
        message.mentions.roles.first();

      if (!role) {
        return message.reply(
          `❌ Rol belirt.\nÖrnek: \`.${cmd} @Rol\``
        );
      }

      if (
        cmd === "rolverhepsi" ||
        cmd === "rolalhepsi"
      ) {
        await message.guild.members
          .fetch()
          .catch(() => {});

        let count = 0;

        if (
          cmd === "rolverhepsi" &&
          role.position >=
            message.guild.members.me.roles.highest.position
        ) {
          return message.reply(
            "❌ Botun rolü bu rolden yukarıda olmalı."
          );
        }

        for (
          const member
          of message.guild.members.cache.values()
        ) {
          if (member.user.bot) continue;

          try {
            if (cmd === "rolverhepsi") {
              if (
                !member.roles.cache.has(
                  role.id
                )
              ) {
                await member.roles.add(role);
              }
            } else {
              if (
                member.roles.cache.has(
                  role.id
                )
              ) {
                await member.roles.remove(
                  role
                );
              }
            }

            count++;
          } catch {}
        }

        return message.reply(
          `✅ **${count}** üyede işlem tamamlandı: **${role.name}**`
        );
      }

      const target =
        message.mentions.members
          .filter(
            member =>
              member.id !==
              message.author.id
          )
          .first() ||
        message.mentions.members.first();

      if (!target) {
        return message.reply(
          "❌ Oyuncu belirt."
        );
      }

      try {
        if (cmd === "rolver") {
          await target.roles.add(role);
        } else {
          await target.roles.remove(role);
        }
      } catch {
        return message.reply(
          "❌ Rol işlemi yapılamadı. Botun rolü verilen rolden yukarıda olmalı."
        );
      }

      return message.reply(
        `✅ <@${target.id}> oyuncusuna **${role.name}** rolü ${
          cmd === "rolver"
            ? "verildi"
            : "alındı"
        }.`
      );
    }

    /*
     * KAYIT
     */
    if (cmd === "k") {
      if (
        !onlyChannel(
          message,
          IDS.channels.kayit
        )
      ) {
        return;
      }

      if (
        !isAdmin(message.member) &&
        !hasRole(message.member, [
          IDS.roles.kayitYetkilisi
        ])
      ) {
        return;
      }

      const target =
        mentionUser(message);

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.k @oyuncu isim`"
        );
      }

      const nickname =
        raw
          .replace(
            /^k\s+<@!?\d+>\s*/i,
            ""
          )
          .trim();

      if (!nickname) {
        return message.reply(
          "❌ İsim yazmalısın."
        );
      }

      return registerPanel(
        message,
        target,
        nickname
      );
    }

    /*
     * KAYITSIZ
     */
    if (cmd === "kayıtsızver") {
      if (
        !onlyChannel(
          message,
          IDS.channels.kayit
        )
      ) {
        return;
      }

      if (
        !isAdmin(message.member) &&
        !hasRole(message.member, [
          IDS.roles.kayitYetkilisi
        ])
      ) {
        return;
      }

      const target =
        mentionUser(message);

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
        ].filter(Boolean))
        .catch(() => {});

      await target.roles
        .add(IDS.roles.kayitsiz)
        .catch(() => {});

      return message.reply(
        `✅ <@${target.id}> Kayıtsız yapıldı.`
      );
    }

    /*
     * ARA
     */
    if (cmd === "ara") {
      const query =
        normalize(args.join(" "));

      if (!query) {
        return message.reply(
          "❌ Kullanım: `.ara oyuncu adı`"
        );
      }

      await message.guild.members
        .fetch()
        .catch(() => {});

      const members = [
        ...message.guild.members.cache.values()
      ].filter(
        member =>
          !member.user.bot &&
          !member.roles.cache.has(
            IDS.roles.kayitsiz
          )
      );

      const found = members
        .map(member => {
          const nickname =
            member.nickname ||
            member.displayName ||
            "";

          const savedName =
            db.users[member.id]?.name ||
            "";

          const username =
            member.user.username ||
            "";

          return {
            member,
            nickname,
            savedName,
            username
          };
        })
        .filter(data => {
          const values = [
            data.nickname,
            data.savedName,
            data.username
          ].map(normalize);

          return values.some(
            value =>
              value === query ||
              value.includes(query)
          );
        })
        .slice(0, 10);

      if (!found.length) {
        return message.reply(
          "❌ Oyuncu bulunamadı."
        );
      }

      return message.reply({
        embeds: [
          embed(
            "🔎 Oyuncu Arama",
            found
              .map((data, index) => {
                const value =
                  parseNickValue(
                    data.member
                  );

                return (
                  `${index + 1}. ` +
                  `**${data.nickname || data.username}** ` +
                  `— <@${data.member.id}> ` +
                  `— **${money(value)}**`
                );
              })
              .join("\n")
          )
        ]
      });
    }

    /*
     * DEĞER
     */
    if (
      cmd === "değer" ||
      cmd === "deger"
    ) {
      const target =
        mentionUser(message);

      if (
        !target ||
        target.user.bot ||
        target.roles.cache.has(
          IDS.roles.kayitsiz
        )
      ) {
        return message.reply(
          "❌ Kayıtlı bir oyuncu belirt."
        );
      }

      const value =
        parseNickValue(target);

      return message.reply({
        embeds: [
          embed(
            "💰 Oyuncu Değeri",
            `👤 **${playerName(
              target
            )}**\n` +
            `💶 Değer: **${money(
              value
            )}**`,
            0xfee75c
          )
        ]
      });
    }

    /*
     * DEĞER LİSTESİ
     */
    if (
      cmd === "değerliste" ||
      cmd === "degerliste"
    ) {
      await message.guild.members
        .fetch()
        .catch(() => {});

      const list =
        [...message.guild.members.cache.values()]
          .filter(
            member =>
              !member.user.bot &&
              !member.roles.cache.has(
                IDS.roles.kayitsiz
              )
          )
          .map(member => [
            member,
            parseNickValue(member)
          ])
          .sort(
            (a, b) => b[1] - a[1]
          )
          .slice(0, 10);

      if (!list.length) {
        return message.reply(
          "❌ Kayıtlı oyuncu bulunamadı."
        );
      }

      return message.reply({
        embeds: [
          embed(
            "🏆 AXERA LEAGUE — DEĞER LİSTESİ",
            list
              .map(
                ([member, value], index) =>
                  `${index + 1}. **${playerName(
                    member
                  )}** — **${money(value)}**`
              )
              .join("\n"),
            0xfee75c
          )
        ]
      });
    }

    /*
     * DVER / DSİL
     */
    if (
      cmd === "dver" ||
      cmd === "dsil"
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
        !isAdmin(message.member) &&
        !hasRole(message.member, [
          IDS.roles.deger
        ])
      ) {
        return;
      }

      const target =
        mentionUser(message);

      const amountToken =
        args.find(token =>
          /^[0-9]+(?:[.,][0-9]+)?M?€?$/i.test(
            token
          )
        );

      const amount =
        amountArg(amountToken);

      if (!target || !amount) {
        return message.reply(
          `❌ Kullanım: \`.${cmd} @Oyuncu 5M\``
        );
      }

      const oldValue =
        parseNickValue(target);

      const result =
        await changePlayerValue(
          target,
          cmd === "dver"
            ? amount
            : -amount,
          cmd
        );

      return message.reply(
        cmd === "dver"
          ? `✅ **${playerName(
              target
            )}** değerine **+${amount}M€** eklendi.\n` +
            `💰 **${money(
              oldValue
            )} → ${money(
              result.newValue
            )}**`
          : `✅ **${playerName(
              target
            )}** değerinden **-${amount}M€** çıkarıldı.\n` +
            `💰 **${money(
              oldValue
            )} → ${money(
              result.newValue
            )}**`
      );
    }

    /*
     * ANTRENMAN
     */
    if (
      cmd === "ant" ||
      cmd === "antrenman"
    ) {
      return doTraining(message);
    }

    /*
     * PENALTI
     */
    if (
      cmd === "pen" ||
      cmd === "penaltı" ||
      cmd === "penalti"
    ) {
      return doPenalty(message);
    }

    /*
     * İLK 11
     */
    if (cmd === "ilk11") {
      if (
        !isAdmin(message.member) &&
        !hasRole(message.member, [
          IDS.roles.spiker,
          IDS.roles.td
        ])
      ) {
        return message.reply(
          "❌ İlk 11 için yetkin yok."
        );
      }

      const role =
        message.mentions.roles.first();

      let team =
        role?.name ||
        teamByName(
          args
            .join(" ")
            .replace(
              /<@&\d+>/g,
              ""
            )
            .trim()
        );

      const ownTeams =
        getUserTeams(
          message.guild,
          message.member
        );

      if (
        !isAdmin(message.member) &&
        !hasRole(message.member, [
          IDS.roles.spiker
        ])
      ) {
        if (!ownTeams.length) {
          return message.reply(
            "❌ Teknik Direktör olarak bir takım rolün yok."
          );
        }

        if (
          team &&
          !ownTeams.includes(team)
        ) {
          return message.reply(
            "❌ Sadece kendi takımının İlk 11'ini düzenleyebilirsin."
          );
        }

        if (!team) {
          if (ownTeams.length === 1) {
            team = ownTeams[0];
          } else {
            return message.reply(
              `❌ Birden fazla takımın var: ${ownTeams
                .map(
                  name => `**${name}**`
                )
                .join(", ")}`
            );
          }
        }
      }

      if (!team) {
        return message.reply(
          "❌ Takım belirt: `.ilk11 @Takım`"
        );
      }

      ensureTeam(team);

      const menu =
        new StringSelectMenuBuilder()
          .setCustomId(
            `first11_select_${team}`
          )
          .setPlaceholder(
            "İlk 11 pozisyonu seç"
          )
          .addOptions(
            FIRST11_POSITIONS.map(
              ([key, label]) => ({
                label:
                  label.replace(
                    /^[^\s]+\s/,
                    ""
                  ),
                value: key,
                description:
                  label
              })
            )
          );

      return message.reply({
        embeds: [
          embed(
            `⚽ ${team} — İlk 11`,
            `İlk 11 oyuncularını düzenlemek için pozisyon seç.\n\n` +
            FIRST11_POSITIONS.map(
              ([key, label]) =>
                `${label}: ${
                  ensureTeam(team).ilk11[
                    key
                  ]
                    ? `<@${ensureTeam(
                        team
                      ).ilk11[key]}>`
                    : "Boş"
                }`
            ).join("\n")
          )
        ],
        components: [
          new ActionRowBuilder().addComponents(
            menu
          )
        ]
      });
    }

    /*
     * MAÇ
     */
    if (
      cmd === "maç" ||
      cmd === "mac"
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
        !isAdmin(message.member) &&
        !hasRole(message.member, [
          IDS.roles.spiker
        ])
      ) {
        return;
      }

      const roles =
        [...message.mentions.roles.values()]
          .slice(0, 2);

      let teamA =
        roles[0]?.name;

      let teamB =
        roles[1]?.name;

      if (!teamA || !teamB) {
        const teams =
          args
            .map(teamByName)
            .filter(Boolean);

        teamA =
          teamA || teams[0];

        teamB =
          teamB || teams[1];
      }

      if (
        !teamA ||
        !teamB ||
        teamA === teamB
      ) {
        return message.reply(
          "❌ Kullanım: `.maç @Takım1 @Takım2`"
        );
      }

      return runMatch(
        message,
        teamA,
        teamB
      );
    }

    /*
     * TAKIM
     */
    if (
      [
        "takımekle",
        "takımkaldır",
        "puanekle",
        "takımdeğer"
      ].includes(cmd)
    ) {
      if (
        !isAdmin(message.member) &&
        !hasRole(message.member, [
          IDS.roles.spiker
        ])
      ) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const role =
        message.mentions.roles.first();

      let teamName =
        role?.name ||
        teamByName(
          args
            .filter(
              token =>
                !/^<@&\d+>$/.test(
                  token
                )
            )
            .join(" ")
        );

      if (!teamName) {
        return message.reply(
          "❌ Takım belirt veya takım rolünü etiketle."
        );
      }

      if (cmd === "takımekle") {
        const existing =
          teamByName(teamName);

        if (
          existing &&
          db.teams[existing]
        ) {
          return message.reply(
            `⚠️ **${existing}** zaten lige ekli.`
          );
        }

        ensureTeam(
          teamName,
          role?.id ||
            IDS.teams[teamName] ||
            null
        );

        saveData();

        return message.reply(
          `✅ **${teamName}** lige eklendi.`
        );
      }

      const actual =
        teamByName(teamName) ||
        teamName;

      if (
        cmd === "takımkaldır"
      ) {
        if (
          !db.teams[actual] &&
          !IDS.teams[actual]
        ) {
          return message.reply(
            "❌ Bu takım ligde kayıtlı değil."
          );
        }

        if (IDS.teams[actual]) {
          db.teams[actual] = {
            players: [],
            score: 0,
            gd: 0,
            gf: 0,
            ga: 0,
            roleId:
              IDS.teams[actual],
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

      if (cmd === "puanekle") {
        const amount =
          Number(args.at(-1));

        if (
          !Number.isFinite(
            amount
          ) ||
          amount <= 0
        ) {
          return message.reply(
            "❌ Puan miktarı belirt."
          );
        }

        ensureTeam(
          actual
        ).score += amount;

        saveData();

        return message.reply(
          `✅ **${actual}** takımına **+${amount} puan** eklendi.`
        );
      }

      if (
        cmd === "takımdeğer"
      ) {
        const value =
          amountArg(args.at(-1));

        if (!value) {
          return message.reply(
            "❌ Değer belirt. Örnek: `.takımdeğer @Takım 850M`"
          );
        }

        ensureTeam(
          actual
        ).teamValue = value;

        saveData();

        return message.reply(
          `✅ **${actual}** takım değeri: **${money(
            value
          )}**`
        );
      }
    }

    /*
     * FORMASYON
     */
    if (cmd === "formasyon") {
      if (
        !isAdmin(message.member) &&
        !hasRole(message.member, [
          IDS.roles.spiker
        ])
      ) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const team =
        teamByName(
          args.join(" ")
        ) ||
        message.mentions.roles.first()
          ?.name;

      if (!team) {
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
                  `${team}||${formation}`
              })
            )
          );

      return message.reply({
        content:
          `⚽ **${team}** için formasyon seç:`,
        components: [
          new ActionRowBuilder().addComponents(
            menu
          )
        ]
      });
    }

    /*
     * PUAN
     */
    if (cmd === "puan") {
      return postStandings(
        message.guild
      );
    }

    /*
     * FİKSTÜR EKLE
     */
    if (cmd === "fiksturekle") {
      if (
        !isAdmin(message.member) &&
        !hasRole(message.member, [
          IDS.roles.spiker
        ])
      ) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const roles =
        [...message.mentions.roles.values()];

      let teamA =
        roles[0]?.name;

      let teamB =
        roles[1]?.name;

      const teamArgs =
        args
          .map(teamByName)
          .filter(Boolean);

      teamA =
        teamA || teamArgs[0];

      teamB =
        teamB || teamArgs[1];

      const date =
        args.find(value =>
          /^\d{4}-\d{2}-\d{2}$/.test(
            value
          )
        );

      const time =
        args.find(value =>
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
          "❌ Kullanım: `.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`"
        );
      }

      const timestamp =
        new Date(
          `${date}T${time}:00+03:00`
        ).getTime();

      if (
        !Number.isFinite(timestamp)
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

    /*
     * FİKSTÜR
     */
    if (
      cmd === "fikstür" ||
      cmd === "fikstur"
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

      return message.reply({
        embeds: [
          embed(
            "📅 Axera League Fikstür",
            fixtures.length
              ? fixtures
                  .map(
                    fixture =>
                      `• **${fixture.teamA} - ${fixture.teamB}** — ${fixture.date} ${fixture.time}`
                  )
                  .join("\n")
              : "Fikstür boş."
          )
        ]
      });
    }

    /*
     * FİKSTÜR ÇIKAR
     */
    if (
      cmd === "fiksturcikar"
    ) {
      if (
        !isAdmin(message.member) &&
        !hasRole(message.member, [
          IDS.roles.spiker
        ])
      ) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const teams =
        args
          .map(teamByName)
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

      if (index < 0) {
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

    /*
     * BÜTÇE
     */
    if (
      cmd === "bütçeekle" ||
      cmd === "bütçesil"
    ) {
      if (
        !isAdmin(message.member) &&
        !hasRole(message.member, [
          IDS.roles.deger
        ])
      ) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const target =
        mentionUser(message);

      const amount =
        amountArg(args[1]);

      if (!target || !amount) {
        return message.reply(
          `❌ Kullanım: \`.${cmd} @oyuncu 5M\``
        );
      }

      const user =
        ensureUser(target);

      user.budget =
        Math.max(
          0,
          Number(user.budget) +
            (
              cmd ===
              "bütçeekle"
                ? amount
                : -amount
            )
        );

      saveData();

      return message.reply(
        `💳 **${playerName(
          target
        )}** kişisel bütçesi: **${money(
          user.budget
        )}**`
      );
    }

    /*
     * GÖNDER
     */
    if (cmd === "gönder") {
      const target =
        mentionUser(message);

      const amount =
        amountArg(args[1]);

      if (!target || !amount) {
        return message.reply(
          "❌ Kullanım: `.gönder @oyuncu 5M`"
        );
      }

      if (
        target.id ===
        message.author.id
      ) {
        return message.reply(
          "❌ Kendine gönderemezsin."
        );
      }

      const sender =
        ensureUser(
          message.member
        );

      const receiver =
        ensureUser(target);

      if (
        Number(sender.budget) <
        amount
      ) {
        return message.reply(
          "❌ Yeterli bütçen yok."
        );
      }

      sender.budget -= amount;
      receiver.budget += amount;

      saveData();

      return message.reply(
        `✅ **${money(
          amount
        )}** <@${target.id}> oyuncusuna gönderildi.`
      );
    }

    /*
     * MESAJ SİL
     */
    if (cmd === "sil") {
      if (
        !isAdmin(message.member)
      ) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const amount =
        Math.min(
          1000,
          Number(args[0] || 0)
        );

      if (!amount) {
        return message.reply(
          "❌ Miktar belirt."
        );
      }

      const deleted =
        await message.channel
          .bulkDelete(
            amount,
            true
          )
          .catch(() => null);

      const info =
        await message.channel.send(
          `🧹 **${
            deleted?.size || 0
          }** mesaj silindi.`
        );

      setTimeout(
        () =>
          info
            .delete()
            .catch(() => {}),
        2500
      );

      return;
    }

    /*
     * EMBED
     */
    if (cmd === "embed") {
      if (
        !isAdmin(message.member)
      ) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const content =
        raw
          .slice(cmd.length)
          .trim();

      const [title, description] =
        content
          .split("|")
          .map(value =>
            value?.trim()
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

    /*
     * MODERASYON
     */
    if (
      [
        "kick",
        "ban",
        "mute",
        "unmute"
      ].includes(cmd)
    ) {
      if (
        !isAdmin(message.member)
      ) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const target =
        mentionUser(message);

      if (!target) {
        return message.reply(
          "❌ Oyuncu belirt."
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
      } catch {
        return message.reply(
          "❌ İşlem gerçekleştirilemedi."
        );
      }

      return message.reply(
        `✅ **${cmd}** işlemi tamamlandı.`
      );
    }

    /*
     * DM
     */
    if (cmd === "dm") {
      if (
        !isAdmin(message.member)
      ) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const target =
        mentionUser(message);

      const text =
        args
          .slice(1)
          .join(" ");

      if (!target || !text) {
        return message.reply(
          "❌ Kullanım: `.dm @oyuncu mesaj`"
        );
      }

      try {
        await target.send(text);
      } catch {
        return message.reply(
          "❌ DM gönderilemedi."
        );
      }

      return message.reply(
        "✅ DM gönderildi."
      );
    }

    /*
     * TWEET
     */
    if (cmd === "tweet") {
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
        Number(
          db.tweetCooldowns[
            message.author.id
          ]
        ) || 0;

      let reward = "";

      if (
        Date.now() - last >=
        7200000
      ) {
        db.tweetCooldowns[
          message.author.id
        ] = Date.now();

        await changePlayerValue(
          message.member,
          10,
          "Tweet"
        );

        reward =
          "\n💰 **+10M€** ödül kazandın!";
      }

      saveData();

      return message.channel.send({
        embeds: [
          embed(
            "🐦 Tweet",
            `${text}${reward}\n\n— **${playerName(
              message.member
            )}**`
          )
        ]
      });
    }

    /*
     * ROL PANELİ
     */
    if (cmd === "rolpanel") {
      if (
        !isAdmin(message.member)
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

      for (const [id, label] of roles) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(
              `role_${id}`
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
            "🎭 Rol Paneli",
            "Bildirim rollerini butonlardan açıp kapatabilirsin."
          )
        ],
        components: [row]
      });
    }

    /*
     * ŞART
     */
    if (
      cmd === "şart" ||
      cmd === "sart"
    ) {
      return message.reply({
        embeds: [
          embed(
            "📌 Axera League Şartları",
            `✓ Kalıcı Tık: Kalıcı 「✓」 kanalına tıklayınız.\n` +
            `🎭 Rol Al: Rol Al kanalından en az 2 rol alınız.\n\n` +
            `ℹ️ Bu şartlar zorunlu değildir.`
          )
        ]
      });
    }

    /*
     * TICKET PANEL
     */
    if (cmd === "ticketpanel") {
      if (
        !isAdmin(message.member)
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
            "Yardıma ihtiyacın varsa aşağıdaki butona bas."
          )
        ],
        components: [row]
      });
    }

    /*
     * AI KOMUTU
     */
    if (
      cmd === "ai" ||
      cmd === "yapayzeka"
    ) {
      const question =
        args.join(" ");

      if (!question) {
        return message.reply(
          "❌ Soru yaz."
        );
      }

      return aiReply({
        ...message,
        content: question,
        reply:
          message.reply.bind(
            message
          )
      });
    }
  }
);

setInterval(
  async () => {
    await startDueFixtures()
      .catch(console.error);

    for (
      const [
        channelId,
        ticket
      ] of Object.entries(db.tickets)
    ) {
      if (
        ticket.open &&
        Date.now() -
          ticket.lastMessage >
          3600000
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

    const now = new Date();

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

process.on(
  "unhandledRejection",
  error =>
    console.error(
      "UNHANDLED:",
      error
    )
);

process.on(
  "uncaughtException",
  error =>
    console.error(
      "UNCAUGHT:",
      error
    )
);

client.login(TOKEN);
