require("dotenv").config();

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
  ChannelType,
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

/* =========================================================
   CLIENT
========================================================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

/* =========================================================
   IDLER
========================================================= */

const ROLE = {
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
  GIVEAWAY_PING: "1545116885589430312",
};

const CHANNEL = {
  REGISTER: "1547371376355053599",
  CHAT: "1547374641763455009",
  TRAINING: "1547375589923618957",
  PENALTY: "1547375997698052166",
  MATCH: "1547376935410073692",
  TWEET: "1547377797193011340",
  VALUE: "1547376344927834122",
  STANDINGS: "1547382143775285431",
  STATUS: "1547388197796057118",
  AI: "1547375186754408539",
};

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
  registrationPanels: {},
  tickets: {},
  cups: {},
  formations: {},
  training: {},
  tweetCooldowns: {},
  stats: {},
  matchHistory: {},
};

let data;

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      data = JSON.parse(
        fs.readFileSync(DATA_FILE, "utf8")
      );
    } else {
      data = JSON.parse(
        JSON.stringify(DEFAULT_DATA)
      );
      saveData();
    }

    for (const key of Object.keys(DEFAULT_DATA)) {
      if (data[key] === undefined) {
        data[key] = DEFAULT_DATA[key];
      }
    }
  } catch (err) {
    console.error("DATA HATASI:", err);
    data = JSON.parse(
      JSON.stringify(DEFAULT_DATA)
    );
  }
}

function saveData() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(data, null, 2)
    );
  } catch (err) {
    console.error("DATA KAYDETME HATASI:", err);
  }
}

loadData();

/* =========================================================
   OPENAI
========================================================= */

let openai = null;

if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

/* =========================================================
   YARDIMCI
========================================================= */

function isAdmin(member) {
  if (!member) return false;

  return (
    member.permissions?.has(
      PermissionsBitField.Flags.Administrator
    ) ||
    member.roles?.cache.has(ROLE.ADMIN)
  );
}

function hasRole(member, roleId) {
  return !!member?.roles?.cache.has(roleId);
}

function isValueStaff(member) {
  return (
    isAdmin(member) ||
    hasRole(member, ROLE.VALUE)
  );
}

function isSpeaker(member) {
  return (
    isAdmin(member) ||
    hasRole(member, ROLE.SPEAKER)
  );
}

function isModerator(member) {
  return (
    isAdmin(member) ||
    hasRole(member, ROLE.MOD)
  );
}

function norm(text) {
  return String(text || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function money(n) {
  return `${Number(n).toLocaleString("tr-TR")}M€`;
}

function ensureUser(id) {
  if (!data.users[id]) {
    data.users[id] = {
      value: 0,
      training: 0,
      registered: false,
      roleType: null,
    };
  }

  return data.users[id];
}

function ensureStats(id) {
  if (!data.stats[id]) {
    data.stats[id] = {
      goals: 0,
      assists: 0,
      matches: 0,
    };
  }

  return data.stats[id];
}

/* =========================================================
   PARA PARSE
========================================================= */

function parseMoney(value) {
  if (!value) return null;

  const x = String(value)
    .trim()
    .replace(",", ".");

  if (
    !/^\d+(?:\.\d+)?(?:m€?|M€?)?$/.test(x)
  ) {
    return null;
  }

  const n = Number(
    x.replace(/m€/gi, "")
      .replace(/m/gi, "")
  );

  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }

  return n;
}

/* =========================================================
   OYUNCU DEĞERİ
========================================================= */

function getValue(member) {
  const nickname =
    member.nickname ||
    member.user.username;

  const match =
    nickname.match(
      /(\d+(?:[.,]\d+)?)M€$/i
    );

  if (!match) return null;

  return Number(
    match[1].replace(",", ".")
  );
}

async function changeValue(member, amount) {
  const current = getValue(member);

  if (current === null) {
    return {
      ok: false,
      message:
        "❌ Oyuncu isminde son bölümde `M€` değeri bulunamadı.",
    };
  }

  const next = current + amount;

  if (next < 0) {
    return {
      ok: false,
      message:
        "❌ Oyuncu değeri 0M€ altına inemez.",
    };
  }

  if (next > 1000) {
    return {
      ok: false,
      message:
        "❌ Oyuncu değeri en fazla 1000M€ olabilir.",
    };
  }

  const nickname =
    member.nickname ||
    member.user.username;

  const newNickname =
    nickname.replace(
      /(\d+(?:[.,]\d+)?)M€$/i,
      `${String(next).replace(".", ",")}M€`
    );

  try {
    await member.setNickname(
      newNickname.slice(0, 32)
    );
  } catch {
    return {
      ok: false,
      message:
        "❌ Takma ad değiştirilemedi. Botun takma ad değiştirme yetkisini kontrol et.",
    };
  }

  ensureUser(member.id).value = next;

  saveData();

  return {
    ok: true,
    old: current,
    new: next,
  };
}

/* =========================================================
   KAYIT
========================================================= */

async function clearRegistrationRoles(member) {
  for (const role of [
    ROLE.UNREGISTERED,
    ROLE.PLAYER,
    ROLE.TD,
    ROLE.MEMBER,
  ]) {
    if (member.roles.cache.has(role)) {
      await member.roles.remove(role).catch(() => {});
    }
  }
}

async function registerPlayer(
  member,
  type,
  nickname
) {
  await clearRegistrationRoles(member);

  let role = ROLE.PLAYER;

  if (type === "Üye") {
    role = ROLE.MEMBER;
  }

  if (type === "Teknik Direktör") {
    role = ROLE.TD;
  }

  if (type === "Kaleci") {
    role = ROLE.PLAYER;
  }

  await member.roles.add(role);

  if (nickname) {
    await member
      .setNickname(nickname.slice(0, 32))
      .catch(() => {});
  }

  const user = ensureUser(member.id);

  user.registered = true;
  user.roleType = type;

  saveData();
}

/* =========================================================
   .ARA
========================================================= */

function registeredMembers(guild) {
  return guild.members.cache.filter(
    (m) => {
      if (m.user.bot) return false;

      if (
        m.roles.cache.has(
          ROLE.UNREGISTERED
        )
      ) {
        return false;
      }

      return (
        m.roles.cache.has(ROLE.PLAYER) ||
        m.roles.cache.has(ROLE.TD) ||
        m.roles.cache.has(ROLE.MEMBER)
      );
    }
  );
}

function searchPlayers(guild, query) {
  const q = norm(query);
  const result = [];

  for (const member of registeredMembers(
    guild
  ).values()) {
    const nickname = norm(
      member.nickname || ""
    );

    const display = norm(
      member.displayName || ""
    );

    const username = norm(
      member.user.username || ""
    );

    let score = 0;

    if (nickname === q) score = 1000;
    else if (display === q) score = 950;
    else if (username === q) score = 900;
    else if (nickname.startsWith(q))
      score = 800;
    else if (display.startsWith(q))
      score = 750;
    else if (username.startsWith(q))
      score = 700;
    else if (nickname.includes(q))
      score = 600;
    else if (display.includes(q))
      score = 550;
    else if (username.includes(q))
      score = 500;

    if (score > 0) {
      result.push({
        member,
        score,
      });
    }
  }

  return result.sort(
    (a, b) => b.score - a.score
  );
}

/* =========================================================
   TAKIM
========================================================= */

function ensureTeam(id, name) {
  if (!data.teams[id]) {
    data.teams[id] = {
      name,
      value: 0,
      players: {},
      formation: "4-4-2",
      owner: null,
    };
  }

  return data.teams[id];
}

function ensureStanding(id, name) {
  if (!data.standings[id]) {
    data.standings[id] = {
      name,
      played: 0,
      win: 0,
      draw: 0,
      loss: 0,
      gf: 0,
      ga: 0,
      points: 0,
    };
  }

  return data.standings[id];
}

function teamMembers(guild, roleId) {
  return guild.members.cache.filter(
    (m) =>
      !m.user.bot &&
      m.roles.cache.has(roleId)
  );
}

function teamPlayers(guild, roleId) {
  const team = data.teams[roleId];

  if (!team) return [];

  const map = new Map();

  for (const m of teamMembers(
    guild,
    roleId
  ).values()) {
    map.set(m.id, m);
  }

  for (const id of Object.keys(
    team.players || {}
  )) {
    const m =
      guild.members.cache.get(id);

    if (m && !m.user.bot) {
      map.set(id, m);
    }
  }

  return [...map.values()];
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
  "5-3-2",
];

/* =========================================================
   MAÇ
========================================================= */

const COMMENTARY = [
  "Orta sahada topa sahip olan taraf oyunu kuruyor.",
  "Kanattan hızlı bir atak gelişiyor.",
  "Savunma araya girerek tehlikeyi uzaklaştırıyor.",
  "Kaleci kritik bir kurtarış yapıyor.",
  "Top ceza sahasına gönderiliyor.",
  "Şut geliyor ancak top auta çıkıyor.",
  "Oyuncu rakibinden sıyrılıyor.",
  "Savunma çizgisi öne çıkıyor.",
  "Hızlı bir kontra atak başlıyor.",
  "Hakem faul düdüğünü çalıyor.",
];

function random(array) {
  return array[
    Math.floor(
      Math.random() * array.length
    )
  ];
}

function teamStrength(guild, roleId) {
  const team = data.teams[roleId];

  if (!team) return 1;

  let strength =
    Number(team.value) || 0;

  for (const member of teamPlayers(
    guild,
    roleId
  )) {
    const value = getValue(member);

    if (value) {
      strength += value;
    }
  }

  return Math.max(strength, 1);
}

function randomPlayer(guild, roleId) {
  const players = teamPlayers(
    guild,
    roleId
  );

  if (!players.length) return null;

  return random(players);
}

function addStandingResult(
  roleId,
  gf,
  ga
) {
  const s = data.standings[roleId];

  if (!s) return;

  s.played++;
  s.gf += gf;
  s.ga += ga;

  if (gf > ga) {
    s.win++;
    s.points += 3;
  } else if (gf === ga) {
    s.draw++;
    s.points += 1;
  } else {
    s.loss++;
  }
}

async function startMatch(
  guild,
  team1Id,
  team2Id,
  channel
) {
  if (!channel) return;

  if (data.activeMatches[guild.id]) {
    await channel.send(
      "❌ Bu sunucuda zaten aktif maç var."
    );
    return;
  }

  const role1 =
    guild.roles.cache.get(team1Id);

  const role2 =
    guild.roles.cache.get(team2Id);

  if (!role1 || !role2) {
    await channel.send(
      "❌ Takım rollerinden biri bulunamadı."
    );
    return;
  }

  const players1 =
    teamPlayers(guild, team1Id);

  const players2 =
    teamPlayers(guild, team2Id);

  if (!players1.length || !players2.length) {
    await channel.send(
      "❌ İki takımda da en az bir oyuncu bulunmalı."
    );
    return;
  }

  const id =
    `${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 7)}`;

  const match = {
    id,
    team1: team1Id,
    team2: team2Id,
    score1: 0,
    score2: 0,
    minute: 0,
    events: [],
    players: [
      ...new Set([
        ...players1.map((x) => x.id),
        ...players2.map((x) => x.id),
      ]),
    ],
    scorers: [],
    assists: [],
  };

  data.activeMatches[guild.id] =
    match;

  saveData();

  const message =
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle(
            "⚽ AXERA LEAGUE | CANLI MAÇ"
          )
          .setDescription(
            `**${role1.name}** 0 - 0 **${role2.name}**\n\n` +
              `⏱️ 0'\n📏 Saha: 100 metre\n\n` +
              "Maç başladı!"
          )
          .setTimestamp(),
      ],
    });

  const timer = setInterval(
    async () => {
      try {
        const current =
          data.activeMatches[
            guild.id
          ];

        if (
          !current ||
          current.id !== id
        ) {
          clearInterval(timer);
          return;
        }

        current.minute++;

        const strength1 =
          teamStrength(
            guild,
            team1Id
          );

        const strength2 =
          teamStrength(
            guild,
            team2Id
          );

        const total =
          strength1 + strength2;

        const chance1 =
          0.032 *
          (0.7 +
            (strength1 / total) * 0.8);

        const chance2 =
          0.032 *
          (0.7 +
            (strength2 / total) * 0.8);

        let event =
          random(COMMENTARY);

        if (
          Math.random() < chance1
        ) {
          const scorer =
            randomPlayer(
              guild,
              team1Id
            );

          if (scorer) {
            current.score1++;

            current.scorers.push(
              scorer.id
            );

            ensureStats(
              scorer.id
            ).goals++;

            await changeValue(
              scorer,
              2
            ).catch(() => {});

            event =
              `⚽ **GOOOL!** ${scorer.displayName} golü attı!`;

            const assistCandidates =
              players1.filter(
                (p) =>
                  p.id !== scorer.id
              );

            if (
              assistCandidates.length &&
              Math.random() < 0.8
            ) {
              const assist =
                random(
                  assistCandidates
                );

              current.assists.push(
                assist.id
              );

              ensureStats(
                assist.id
              ).assists++;

              await changeValue(
                assist,
                1
              ).catch(() => {});

              event +=
                ` 🎯 Asist: ${assist.displayName}.`;
            }
          }
        } else if (
          Math.random() < chance2
        ) {
          const scorer =
            randomPlayer(
              guild,
              team2Id
            );

          if (scorer) {
            current.score2++;

            current.scorers.push(
              scorer.id
            );

            ensureStats(
              scorer.id
            ).goals++;

            await changeValue(
              scorer,
              2
            ).catch(() => {});

            event =
              `⚽ **GOOOL!** ${scorer.displayName} golü attı!`;

            const assistCandidates =
              players2.filter(
                (p) =>
                  p.id !== scorer.id
              );

            if (
              assistCandidates.length &&
              Math.random() < 0.8
            ) {
              const assist =
                random(
                  assistCandidates
                );

              current.assists.push(
                assist.id
              );

              ensureStats(
                assist.id
              ).assists++;

              await changeValue(
                assist,
                1
              ).catch(() => {});

              event +=
                ` 🎯 Asist: ${assist.displayName}.`;
            }
          }
        }

        current.events.push(
          `**${current.minute}'** ${event}`
        );

        if (
          current.events.length > 7
        ) {
          current.events.shift();
        }

        await message.edit({
          embeds: [
            new EmbedBuilder()
              .setTitle(
                "⚽ AXERA LEAGUE | CANLI MAÇ"
              )
              .setDescription(
                `**${role1.name}** **${current.score1}** - **${current.score2}** **${role2.name}**\n\n` +
                  `⏱️ ${current.minute}'\n📏 Saha: 100 metre\n\n` +
                  current.events.join(
                    "\n"
                  )
              )
              .setTimestamp(),
          ],
        });

        if (
          current.minute >= 90
        ) {
          clearInterval(timer);

          addStandingResult(
            team1Id,
            current.score1,
            current.score2
          );

          addStandingResult(
            team2Id,
            current.score2,
            current.score1
          );

          const rewarded =
            new Set();

          for (const playerId of current.players) {
            if (
              rewarded.has(playerId)
            )
              continue;

            rewarded.add(playerId);

            const member =
              guild.members.cache.get(
                playerId
              );

            if (!member) continue;

            await changeValue(
              member,
              5
            ).catch(() => {});

            ensureStats(
              playerId
            ).matches++;
          }

          data.matchHistory[id] = {
            ...current,
            finishedAt: Date.now(),
          };

          delete data.activeMatches[
            guild.id
          ];

          saveData();

          await message.edit({
            embeds: [
              new EmbedBuilder()
                .setTitle(
                  "🏁 AXERA LEAGUE | MAÇ BİTTİ"
                )
                .setDescription(
                  `**${role1.name}** **${current.score1}** - **${current.score2}** **${role2.name}**\n\n` +
                    "🏁 Maç tamamlandı.\n" +
                    "💰 Katılan oyuncular: +5M€\n" +
                    "⚽ Gol: +2M€\n" +
                    "🎯 Asist: +1M€"
                )
                .setTimestamp(),
            ],
          });
        }
      } catch (err) {
        console.error(
          "MAÇ TIMER HATASI:",
          err
        );

        clearInterval(timer);

        delete data.activeMatches[
          guild.id
        ];

        saveData();
      }
    },
    3000
  );
}

/* =========================================================
   AI
========================================================= */

const AI_INSTRUCTIONS = `
Senin adın Axera.

Sen Axera League Discord sunucusunun yapay zekâ asistanısın.

Türkçe konuş.
Doğal ve anlaşılır cevaplar ver.
Kullanıcılarla normal sohbet et.

"Seni kim kurdu?" diye sorulursa:
"Beni Lynox9380 kurdu." de.

Kendini Axera olarak tanıt.

Discord'da gerçekten yapılmayan bir işlemi yapılmış gibi söyleme.

Kullanıcı bir Discord işlemi isterse, bot kodunda o işlem için özel sistem yoksa yapılmış gibi davranma.

Tehlikeli veya yaşa uygun olmayan istekleri güvenli şekilde reddet.
`;

const aiConversations = new Map();

async function askAI(message, question) {
  if (!openai) {
    return message.reply(
      "❌ Axera AI şu anda hazır değil. Railway'de `OPENAI_API_KEY` değişkenini kontrol edin."
    );
  }

  try {
    const previous =
      aiConversations.get(
        message.author.id
      );

    const request = {
      model: "gpt-5.5",
      instructions:
        AI_INSTRUCTIONS,
      input: question,
    };

    if (previous) {
      request.previous_response_id =
        previous;
    }

    const response =
      await openai.responses.create(
        request
      );

    const answer =
      response.output_text?.trim();

    if (!answer) {
      return message.reply(
        "❌ Axera cevap oluşturamadı."
      );
    }

    aiConversations.set(
      message.author.id,
      response.id
    );

    for (
      let i = 0;
      i < answer.length;
      i += 1900
    ) {
      await message.reply(
        answer.slice(i, i + 1900)
      );
    }
  } catch (err) {
    console.error(
      "OPENAI HATASI:",
      err
    );

    await message.reply(
      "❌ Axera AI şu anda cevap veremiyor. OpenAI API anahtarını ve hesabını kontrol edin."
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

  const user =
    interaction.user;

  const existing =
    Object.values(data.tickets)
      .find(
        (t) =>
          t.guildId === guild.id &&
          t.userId === user.id &&
          t.open
      );

  if (existing) {
    return interaction.reply({
      content:
        `❌ Zaten açık ticketın var: <#${existing.channelId}>`,
      ephemeral: true,
    });
  }

  const channel =
    await guild.channels.create({
      name:
        `ticket-${user.username}`
          .toLowerCase()
          .replace(/[^a-z0-9-_]/g, "")
          .slice(0, 70) ||
        "ticket",
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [
            PermissionsBitField.Flags
              .ViewChannel,
          ],
        },
        {
          id: user.id,
          allow: [
            PermissionsBitField.Flags
              .ViewChannel,
            PermissionsBitField.Flags
              .SendMessages,
            PermissionsBitField.Flags
              .ReadMessageHistory,
          ],
        },
        {
          id: ROLE.MOD,
          allow: [
            PermissionsBitField.Flags
              .ViewChannel,
            PermissionsBitField.Flags
              .SendMessages,
            PermissionsBitField.Flags
              .ReadMessageHistory,
          ],
        },
      ],
    });

  data.tickets[channel.id] = {
    guildId: guild.id,
    userId: user.id,
    channelId: channel.id,
    open: true,
    lastMessage: Date.now(),
  };

  saveData();

  const row =
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "ticket_close"
        )
        .setLabel(
          "Bileti Kapat"
        )
        .setEmoji("🔒")
        .setStyle(
          ButtonStyle.Danger
        )
    );

  await channel.send({
    content: `${user} <@&${ROLE.MOD}>`,
    embeds: [
      new EmbedBuilder()
        .setTitle(
          "🎫 Axera League Destek"
        )
        .setDescription(
          "Yetkili ekibimiz yardımcı olacaktır.\n\n" +
            "Ticketı kapatmak için butona basabilirsiniz."
        ),
    ],
    components: [row],
  });

  return interaction.reply({
    content:
      `✅ Ticket oluşturuldu: <#${channel.id}>`,
    ephemeral: true,
  });
}

/* =========================================================
   READY
========================================================= */

client.once("ready", () => {
  console.log(
    `✅ Axera aktif: ${client.user.tag}`
  );

  client.user.setPresence({
    activities: [
      {
        name:
          "Axera League | Futbol RP",
        type: 0,
      },
    ],
    status: "online",
  });

  setInterval(() => {
    for (const guild of client.guilds.cache.values()) {
      for (const fixture of data.fixtures) {
        if (fixture.started) continue;

        if (
          Date.now() >=
          fixture.timestamp
        ) {
          fixture.started = true;

          const channel =
            guild.channels.cache.get(
              CHANNEL.MATCH
            );

          startMatch(
            guild,
            fixture.team1,
            fixture.team2,
            channel
          ).catch(console.error);
        }
      }
    }

    saveData();
  }, 1000);

  setInterval(() => {
    for (const [
      channelId,
      ticket,
    ] of Object.entries(
      data.tickets
    )) {
      if (!ticket.open) continue;

      if (
        Date.now() -
          ticket.lastMessage >=
        60 * 60 * 1000
      ) {
        const channel =
          client.channels.cache.get(
            channelId
          );

        if (channel) {
          channel
            .delete()
            .catch(() => {});
        }

        ticket.open = false;
      }
    }

    saveData();
  }, 60000);

  const status =
    client.channels.cache.get(
      CHANNEL.STATUS
    );

  if (status) {
    status.send(
      "🟢 **Axera League Bot aktif!**\n🤖 Axera AI hazır."
    ).catch(() => {});
  }
});

/* =========================================================
   ÜYE GİRİŞ
========================================================= */

client.on(
  "guildMemberAdd",
  async (member) => {
    await member.roles
      .add(ROLE.UNREGISTERED)
      .catch(() => {});

    const channel =
      member.guild.channels.cache.get(
        CHANNEL.REGISTER
      );

    if (channel) {
      channel
        .send(
          `👋 Hoş geldin ${member}!\n<@&${ROLE.REGISTER}> yeni üyeyi kayıt edebilirsiniz.`
        )
        .catch(() => {});
    }
  }
);

/* =========================================================
   INTERACTIONS
========================================================= */

client.on(
  "interactionCreate",
  async (interaction) => {
    try {
      /* TICKET OLUŞTUR */
      if (
        interaction.isButton() &&
        interaction.customId ===
          "ticket_create"
      ) {
        return createTicket(
          interaction
        );
      }

      /* TICKET KAPAT */
      if (
        interaction.isButton() &&
        interaction.customId ===
          "ticket_close"
      ) {
        const ticket =
          data.tickets[
            interaction.channel.id
          ];

        if (!ticket) {
          return interaction.reply({
            content:
              "❌ Ticket bilgisi bulunamadı.",
            ephemeral: true,
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
              "❌ Bu ticketı kapatamazsın.",
            ephemeral: true,
          });
        }

        ticket.open = false;

        saveData();

        await interaction.reply(
          "🔒 Ticket kapatılıyor..."
        );

        setTimeout(() => {
          interaction.channel
            .delete()
            .catch(() => {});
        }, 1200);

        return;
      }

      /* KAYIT BUTONLARI */
      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "register:"
        )
      ) {
        if (
          !isAdmin(
            interaction.member
          ) &&
          !hasRole(
            interaction.member,
            ROLE.REGISTER
          )
        ) {
          return interaction.reply({
            content:
              "❌ Yalnızca Kayıt Yetkilisi veya Yönetici kullanabilir.",
            ephemeral: true,
          });
        }

        const parts =
          interaction.customId.split(
            ":"
          );

        const userId = parts[1];
        const type = parts
          .slice(2)
          .join(":");

        const member =
          interaction.guild.members.cache.get(
            userId
          );

        const panel =
          data.registrationPanels[
            interaction.message.id
          ];

        if (!member || !panel) {
          return interaction.reply({
            content:
              "❌ Kayıt bilgisi bulunamadı.",
            ephemeral: true,
          });
        }

        await registerPlayer(
          member,
          type,
          panel.nickname
        );

        delete data
          .registrationPanels[
          interaction.message.id
        ];

        saveData();

        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle(
                "✅ Kayıt Tamamlandı"
              )
              .setDescription(
                `${member}\n\n` +
                  `👤 Tür: **${type}**\n` +
                  `📝 İsim: **${panel.nickname}**`
              ),
          ],
          components: [],
        });
      }

      /* PING ROLLER */
      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "ping:"
        )
      ) {
        const roleId =
          interaction.customId.split(
            ":"
          )[1];

        const role =
          interaction.guild.roles.cache.get(
            roleId
          );

        if (!role) {
          return interaction.reply({
            content:
              "❌ Rol bulunamadı.",
            ephemeral: true,
          });
        }

        if (
          interaction.member.roles.cache.has(
            roleId
          )
        ) {
          await interaction.member.roles
            .remove(roleId);

          return interaction.reply({
            content:
              `❌ ${role.name} kaldırıldı.`,
            ephemeral: true,
          });
        }

        await interaction.member.roles.add(
          roleId
        );

        return interaction.reply({
          content:
            `✅ ${role.name} verildi.`,
          ephemeral: true,
        });
      }

      /* FORMASYON */
      if (
        interaction.isStringSelectMenu() &&
        interaction.customId ===
          "formation_select"
      ) {
        if (
          !isSpeaker(
            interaction.member
          )
        ) {
          return interaction.reply({
            content:
              "❌ Yetkin yok.",
            ephemeral: true,
          });
        }

        const teamId =
          interaction.message.embeds[0]
            ?.footer?.text
            ?.replace(
              "TEAM:",
              ""
            );

        if (
          !teamId ||
          !data.teams[teamId]
        ) {
          return interaction.reply({
            content:
              "❌ Takım bulunamadı.",
            ephemeral: true,
          });
        }

        data.teams[
          teamId
        ].formation =
          interaction.values[0];

        saveData();

        return interaction.reply({
          content:
            `✅ Formasyon **${interaction.values[0]}** oldu.`,
          ephemeral: true,
        });
      }
    } catch (err) {
      console.error(
        "INTERACTION HATASI:",
        err
      );

      if (!interaction.replied) {
        interaction
          .reply({
            content:
              "❌ İşlem sırasında hata oluştu.",
            ephemeral: true,
          })
          .catch(() => {});
      }
    }
  }
);

/* =========================================================
   MESSAGE CREATE
========================================================= */

client.on(
  "messageCreate",
  async (message) => {
    try {
      if (!message.guild) return;
      if (message.author.bot) return;

      /* TICKET SON MESAJ */
      const ticket =
        data.tickets[
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

      /* =========================================
         AI KANALI
      ========================================= */

      if (
        message.channel.id ===
        CHANNEL.AI
      ) {
        const content =
          message.content.trim();

        if (
          content &&
          !content.startsWith(".")
        ) {
          await message.channel.sendTyping();

          await askAI(
            message,
            content
          );

          return;
        }
      }

      /* =========================================
         KOMUT PARSE
      ========================================= */

      const raw =
        message.content.trim();

      if (!raw.startsWith(".")) {
        return;
      }

      const parts =
        raw.split(/\s+/);

      const command =
        norm(parts.shift()).slice(1);

      const text =
        parts.join(" ");

      /* =========================================
         AI KOMUT
      ========================================= */

      if (
        command === "ai" ||
        command === "yapayzeka"
      ) {
        if (
          message.channel.id !==
          CHANNEL.AI
        ) {
          return message.reply(
            `❌ AI komutlarını yalnızca <#${CHANNEL.AI}> kanalında kullanabilirsin.`
          );
        }

        if (!text) {
          return message.reply(
            "🤖 Ben **Axera**. Bana bir soru sor."
          );
        }

        await message.channel.sendTyping();

        return askAI(
          message,
          text
        );
      }

      /* =========================================
         KAYIT
      ========================================= */

      if (command === "k") {
        if (
          message.channel.id !==
          CHANNEL.REGISTER
        ) {
          return message.reply(
            "❌ Bu komut yalnızca kayıt kanalında kullanılabilir."
          );
        }

        if (
          !isAdmin(
            message.member
          ) &&
          !hasRole(
            message.member,
            ROLE.REGISTER
          )
        ) {
          return message.reply(
            "❌ Kayıt Yetkilisi olmalısın."
          );
        }

        const member =
          message.mentions.members.first();

        if (!member) {
          return message.reply(
            "❌ Kullanım: `.k @Oyuncu İsim`"
          );
        }

        const nickname =
          raw
            .replace(
              new RegExp(
                `<@!?${member.id}>`
              ),
              ""
            )
            .replace(
              /^\.k\s*/i,
              ""
            )
            .trim();

        if (!nickname) {
          return message.reply(
            "❌ Oyuncu adını yaz."
          );
        }

        const row =
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(
                `register:${member.id}:Futbolcu`
              )
              .setLabel(
                "Futbolcu"
              )
              .setEmoji("⚽")
              .setStyle(
                ButtonStyle.Primary
              ),

            new ButtonBuilder()
              .setCustomId(
                `register:${member.id}:Üye`
              )
              .setLabel("Üye")
              .setEmoji("👤")
              .setStyle(
                ButtonStyle.Secondary
              ),

            new ButtonBuilder()
              .setCustomId(
                `register:${member.id}:Teknik Direktör`
              )
              .setLabel(
                "Teknik Direktör"
              )
              .setEmoji("🧑‍💼")
              .setStyle(
                ButtonStyle.Success
              ),

            new ButtonBuilder()
              .setCustomId(
                `register:${member.id}:Kaleci`
              )
              .setLabel("Kaleci")
              .setEmoji("🧤")
              .setStyle(
                ButtonStyle.Danger
              )
          );

        const sent =
          await message.channel.send({
            embeds: [
              new EmbedBuilder()
                .setTitle(
                  "📋 Axera League Kayıt"
                )
                .setDescription(
                  `${member}\n\n` +
                    `📝 İsim: **${nickname}**\n\n` +
                    "Kayıt türünü seç:"
                ),
            ],
            components: [row],
          });

        data.registrationPanels[
          sent.id
        ] = {
          nickname,
          userId: member.id,
        };

        saveData();

        return;
      }

      /* =========================================
         KAYITSIZ VER
      ========================================= */

      if (
        command === "kayıtsızver" ||
        command === "kayitsizver"
      ) {
        if (
          !isAdmin(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yalnızca Yönetici kullanabilir."
          );
        }

        const member =
          message.mentions.members.first();

        if (!member) {
          return message.reply(
            "❌ Kullanım: `.kayıtsızver @Oyuncu`"
          );
        }

        await clearRegistrationRoles(
          member
        );

        await member.roles.add(
          ROLE.UNREGISTERED
        );

        ensureUser(
          member.id
        ).registered = false;

        saveData();

        return message.reply(
          `✅ ${member} Kayıtsız yapıldı.`
        );
      }

      /* =========================================
         ARA
      ========================================= */

      if (command === "ara") {
        if (!text) {
          return message.reply(
            "❌ Kullanım: `.ara isim`"
          );
        }

        const results =
          searchPlayers(
            message.guild,
            text
          );

        if (!results.length) {
          return message.reply(
            "❌ Bu isimde veya benzer isimde kayıtlı oyuncu bulunamadı."
          );
        }

        const lines =
          results
            .slice(0, 10)
            .map(
              ({ member }) => {
                const value =
                  getValue(member);

                const stats =
                  ensureStats(
                    member.id
                  );

                return (
                  `👤 **${member.displayName}** ${member}\n` +
                  `💰 Değer: ${
                    value !== null
                      ? money(value)
                      : "Belirsiz"
                  }\n` +
                  `⚽ ${stats.goals} Gol | 🎯 ${stats.assists} Asist | 🏟️ ${stats.matches} Maç`
                );
              }
            );

        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle(
                "🔎 Oyuncu Arama"
              )
              .setDescription(
                lines.join(
                  "\n\n"
                )
              ),
          ],
        });
      }

      /* =========================================
         DVER / DSIL
      ========================================= */

      if (
        command === "dver" ||
        command === "dsil"
      ) {
        if (
          message.channel.id !==
          CHANNEL.VALUE
        ) {
          return message.reply(
            "❌ Bu komut yalnızca değer kanalında kullanılabilir."
          );
        }

        if (
          !isValueStaff(
            message.member
          )
        ) {
          return message.reply(
            "❌ Değer Yetkilisi veya Yönetici olmalısın."
          );
        }

        const member =
          message.mentions.members.first();

        const amount =
          parseMoney(
            parts[1]
          );

        if (
          !member ||
          amount === null
        ) {
          return message.reply(
            `❌ Kullanım: \`.${command} @Oyuncu 5M\``
          );
        }

        const result =
          await changeValue(
            member,
            command === "dver"
              ? amount
              : -amount
          );

        if (!result.ok) {
          return message.reply(
            result.message
          );
        }

        return message.reply(
          `✅ ${member} değeri **${money(
            result.old
          )} → ${money(
            result.new
          )}** oldu.`
        );
      }

      /* =========================================
         ANTRENMAN
      ========================================= */

      if (
        command === "ant" ||
        command === "antrenman"
      ) {
        if (
          message.channel.id !==
          CHANNEL.TRAINING
        ) {
          return message.reply(
            "❌ Antrenman kanalında kullan."
          );
        }

        const user =
          ensureUser(
            message.author.id
          );

        user.training =
          Number(user.training) + 1;

        if (
          user.training >= 5
        ) {
          user.training = 0;

          const result =
            await changeValue(
              message.member,
              3
            );

          saveData();

          if (!result.ok) {
            return message.reply(
              `🏋️ 5/5 tamamlandı!\n❌ Ödül verilemedi: ${result.message}`
            );
          }

          return message.reply(
            "🏋️ **5/5 tamamlandı!**\n💰 **+3M€** kazandın.\n🔄 İlerleme **0/5**."
          );
        }

        saveData();

        return message.reply(
          `🏋️ Antrenman tamamlandı!\n📊 **${user.training}/5**`
        );
      }

      /* =========================================
         PENALTI
      ========================================= */

      if (
        command === "pen" ||
        command === "penaltı" ||
        command === "penalti"
      ) {
        if (
          message.channel.id !==
          CHANNEL.PENALTY
        ) {
          return message.reply(
            "❌ Penaltı kanalında kullan."
          );
        }

        const chance =
          Math.random();

        if (chance < 0.5) {
          const result =
            await changeValue(
              message.member,
              5
            );

          return message.reply(
            result.ok
              ? "⚽ **GOOOL!** 🧤 Axera Kalecisi çıkaramadı!\n💰 **+5M€**"
              : `⚽ GOOOL!\n❌ ${result.message}`
          );
        }

        if (chance < 0.75) {
          return message.reply(
            "🥅 **DİREK!** Top direkten döndü!"
          );
        }

        return message.reply(
          "🧤 **KURTARDI!** Axera Kalecisi penaltıyı çıkardı!"
        );
      }

      /* =========================================
         TWEET
      ========================================= */

      if (command === "tweet") {
        if (
          message.channel.id !==
          CHANNEL.TWEET
        ) {
          return message.reply(
            "❌ Tweet kanalında kullan."
          );
        }

        if (!text) {
          return message.reply(
            "❌ Kullanım: `.tweet mesaj`"
          );
        }

        const now =
          Date.now();

        const last =
          data.tweetCooldowns[
            message.author.id
          ] || 0;

        const canReward =
          now - last >=
          86400000;

        await message.delete()
          .catch(() => {});

        await message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle(
                "𝕏 Axera Tweet"
              )
              .setDescription(
                text
              )
              .setFooter({
                text:
                  message.member
                    .displayName,
              })
              .setTimestamp(),
          ],
        });

        if (canReward) {
          const result =
            await changeValue(
              message.member,
              5
            );

          if (result.ok) {
            data.tweetCooldowns[
              message.author.id
            ] = now;

            saveData();

            await message.channel.send(
              `🎁 ${message.author} **+5M€** tweet ödülü kazandı.`
            );
          }
        }

        return;
      }

      /* =========================================
         TAKIM EKLE
      ========================================= */

      if (
        command === "takımekle" ||
        command === "takimekle"
      ) {
        if (
          !isSpeaker(
            message.member
          )
        ) {
          return message.reply(
            "❌ Spiker veya Yönetici olmalısın."
          );
        }

        const role =
          message.mentions.roles.first();

        if (!role) {
          return message.reply(
            "❌ Kullanım: `.takımekle @Takım`"
          );
        }

        ensureTeam(
          role.id,
          role.name
        );

        ensureStanding(
          role.id,
          role.name
        );

        saveData();

        return message.reply(
          `✅ **${role.name}** sisteme eklendi.`
        );
      }

      /* =========================================
         TAKIM KALDIR
      ========================================= */

      if (
        command === "takımkaldır" ||
        command === "takimkaldir"
      ) {
        if (
          !isSpeaker(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
          );
        }

        const role =
          message.mentions.roles.first();

        if (!role) {
          return message.reply(
            "❌ Kullanım: `.takımkaldır @Takım`"
          );
        }

        const active =
          Object.values(
            data.activeMatches
          ).some(
            (m) =>
              m.team1 === role.id ||
              m.team2 === role.id
          );

        if (active) {
          return message.reply(
            "❌ Aktif maçı olan takım kaldırılamaz."
          );
        }

        delete data.teams[
          role.id
        ];

        delete data.standings[
          role.id
        ];

        delete data.formations[
          role.id
        ];

        data.fixtures =
          data.fixtures.filter(
            (f) =>
              f.team1 !== role.id &&
              f.team2 !== role.id
          );

        saveData();

        return message.reply(
          `✅ **${role.name}** takım sistemi kaldırıldı.`
        );
      }

      /* =========================================
         TAKIM DEĞER
      ========================================= */

      if (
        command === "takımdeğer" ||
        command === "takimdeger"
      ) {
        if (
          !isSpeaker(
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
          parseMoney(parts[1]);

        if (
          !role ||
          amount === null
        ) {
          return message.reply(
            "❌ Kullanım: `.takımdeğer @Takım 850M`"
          );
        }

        ensureTeam(
          role.id,
          role.name
        ).value = amount;

        saveData();

        return message.reply(
          `✅ **${role.name}** takım değeri **${money(
            amount
          )}** oldu.`
        );
      }

      /* =========================================
         PUAN
      ========================================= */

      if (
        command === "puan"
      ) {
        const list =
          Object.values(
            data.standings
          ).sort(
            (a, b) =>
              b.points -
                a.points ||
              (b.gf - b.ga) -
                (a.gf - a.ga) ||
              b.gf - a.gf
          );

        if (!list.length) {
          return message.reply(
            "❌ Puan durumu boş."
          );
        }

        return message.reply(
          `🏆 **AXERA LEAGUE | PUAN DURUMU**\n\n` +
            list
              .map(
                (x, i) =>
                  `**${i + 1}. ${x.name}** — ${x.points} P | ${x.played} O | ${x.gf}-${x.ga}`
              )
              .join("\n")
        );
      }

      /* =========================================
         PUAN EKLE
      ========================================= */

      if (
        command === "puanekle"
      ) {
        if (
          !isSpeaker(
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
          Number(parts[1]);

        if (
          !role ||
          !Number.isInteger(
            amount
          )
        ) {
          return message.reply(
            "❌ Kullanım: `.puanekle @Takım 3`"
          );
        }

        ensureStanding(
          role.id,
          role.name
        ).points += amount;

        saveData();

        return message.reply(
          `✅ **${role.name}** +${amount} puan.`
        );
      }

      /* =========================================
         KADRO EKLE
      ========================================= */

      if (
        command === "kadroekle"
      ) {
        if (
          !isSpeaker(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
          );
        }

        const roles =
          [...message.mentions.roles.values()];

        const members =
          [...message.mentions.members.values()];

        const position =
          parts[
            parts.length - 1
          ] || "Oyuncu";

        if (
          !roles[0] ||
          !members[0]
        ) {
          return message.reply(
            "❌ Kullanım: `.kadroekle @Takım @Oyuncu Pozisyon`"
          );
        }

        const team =
          ensureTeam(
            roles[0].id,
            roles[0].name
          );

        team.players[
          members[0].id
        ] = position;

        saveData();

        return message.reply(
          `✅ ${members[0]} **${roles[0].name}** kadrosuna eklendi.`
        );
      }

      /* =========================================
         KADRO ÇIKAR
      ========================================= */

      if (
        command === "kadrocikar"
      ) {
        if (
          !isSpeaker(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
          );
        }

        const role =
          message.mentions.roles.first();

        const member =
          message.mentions.members.first();

        if (
          !role ||
          !member
        ) {
          return message.reply(
            "❌ Kullanım: `.kadrocikar @Takım @Oyuncu`"
          );
        }

        if (
          data.teams[role.id]
        ) {
          delete data.teams[
            role.id
          ].players[
            member.id
          ];
        }

        saveData();

        return message.reply(
          `✅ ${member} kadrodan çıkarıldı.`
        );
      }

      /* =========================================
         KADRO
      ========================================= */

      if (
        command === "kadro"
      ) {
        const role =
          message.mentions.roles.first();

        if (!role) {
          return message.reply(
            "❌ Kullanım: `.kadro @Takım`"
          );
        }

        const team =
          data.teams[role.id];

        if (!team) {
          return message.reply(
            "❌ Takım bulunamadı."
          );
        }

        const groups = {};

        for (
          const [
            playerId,
            position,
          ] of Object.entries(
            team.players || {}
          )
        ) {
          const member =
            message.guild.members.cache.get(
              playerId
            );

          if (!member) continue;

          if (!groups[position]) {
            groups[position] = [];
          }

          const value =
            getValue(member);

          groups[position].push(
            `• **${member.displayName}** — ${
              value !== null
                ? money(value)
                : "Değer yok"
            }`
          );
        }

        const result =
          Object.entries(
            groups
          )
            .map(
              ([position, players]) =>
                `**${position}**\n${players.join(
                  "\n"
                )}`
            )
            .join("\n\n");

        return message.reply(
          `📋 **${role.name} | KADRO**\n\n${
            result ||
            "Kadro boş."
          }`
        );
      }

      /* =========================================
         FORMASYON
      ========================================= */

      if (
        command === "formasyon"
      ) {
        if (
          !isSpeaker(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
          );
        }

        const role =
          message.mentions.roles.first();

        if (!role) {
          return message.reply(
            "❌ Kullanım: `.formasyon @Takım`"
          );
        }

        ensureTeam(
          role.id,
          role.name
        );

        const menu =
          new StringSelectMenuBuilder()
            .setCustomId(
              "formation_select"
            )
            .setPlaceholder(
              "Formasyon seç..."
            )
            .addOptions(
              FORMATIONS.map(
                (x) => ({
                  label: x,
                  value: x,
                })
              )
            );

        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle(
                `⚽ ${role.name} | Formasyon`
              )
              .setDescription(
                "Formasyon seç:"
              )
              .setFooter({
                text:
                  `TEAM:${role.id}`,
              }),
          ],
          components: [
            new ActionRowBuilder().addComponents(
              menu
            ),
          ],
        });
      }

      /* =========================================
         MAÇ
      ========================================= */

      if (
        command === "maç" ||
        command === "mac"
      ) {
        if (
          message.channel.id !==
          CHANNEL.MATCH
        ) {
          return message.reply(
            "❌ Maç kanalında kullan."
          );
        }

        if (
          !isSpeaker(
            message.member
          )
        ) {
          return message.reply(
            "❌ Spiker veya Yönetici olmalısın."
          );
        }

        const roles =
          [...message.mentions.roles.values()];

        if (
          roles.length < 2
        ) {
          return message.reply(
            "❌ Kullanım: `.maç @Takım1 @Takım2`"
          );
        }

        return startMatch(
          message.guild,
          roles[0].id,
          roles[1].id,
          message.channel
        );
      }

      /* =========================================
         FİKSTÜR EKLE
      ========================================= */

      if (
        command === "fiksturekle" ||
        command === "fikstürekle"
      ) {
        if (
          !isSpeaker(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
          );
        }

        const roles =
          [...message.mentions.roles.values()];

        if (
          roles.length < 2
        ) {
          return message.reply(
            "❌ İki takım etiketle."
          );
        }

        const clean =
          raw
            .replace(
              new RegExp(
                `<@&${roles[0].id}>`
              ),
              ""
            )
            .replace(
              new RegExp(
                `<@&${roles[1].id}>`
              ),
              ""
            )
            .replace(
              /^\.fikst(u|ü)rekle\s*/i,
              ""
            )
            .trim();

        const timestamp =
          new Date(
            clean.replace(
              " ",
              "T"
            )
          ).getTime();

        if (
          !Number.isFinite(
            timestamp
          )
        ) {
          return message.reply(
            "❌ Tarih: `YYYY-MM-DD HH:MM`"
          );
        }

        data.fixtures.push({
          id:
            data.nextFixtureId++,
          team1: roles[0].id,
          team2: roles[1].id,
          timestamp,
          started: false,
        });

        saveData();

        return message.reply(
          `✅ **${roles[0].name} vs ${roles[1].name}** fikstüre eklendi.`
        );
      }

      /* =========================================
         FİKSTÜR
      ========================================= */

      if (
        command === "fikstur" ||
        command === "fikstür"
      ) {
        const list =
          data.fixtures.filter(
            (f) =>
              !f.started
          );

        if (!list.length) {
          return message.reply(
            "📅 Yaklaşan fikstür yok."
          );
        }

        return message.reply(
          `📅 **AXERA LEAGUE | FİKSTÜR**\n\n` +
            list
              .slice(0, 20)
              .map(
                (f) => {
                  const t1 =
                    message.guild.roles.cache.get(
                      f.team1
                    );

                  const t2 =
                    message.guild.roles.cache.get(
                      f.team2
                    );

                  return (
                    `⚽ **${t1?.name || "?"}** vs **${t2?.name || "?"}** — <t:${Math.floor(
                      f.timestamp /
                        1000
                    )}:F>`
                  );
                }
              )
              .join("\n")
        );
      }

      /* =========================================
         FİKSTÜR ÇIKAR
      ========================================= */

      if (
        command === "fiksturcikar" ||
        command === "fikstürçıkar"
      ) {
        if (
          !isSpeaker(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
          );
        }

        const roles =
          [...message.mentions.roles.values()];

        if (
          roles.length < 2
        ) {
          return message.reply(
            "❌ İki takım etiketle."
          );
        }

        const old =
          data.fixtures.length;

        data.fixtures =
          data.fixtures.filter(
            (f) =>
              !(
                f.team1 ===
                  roles[0].id &&
                f.team2 ===
                  roles[1].id
              )
          );

        saveData();

        return message.reply(
          old ===
            data.fixtures.length
            ? "❌ Fikstür bulunamadı."
            : "✅ Fikstür kaldırıldı."
        );
      }

      /* =========================================
         KUPALAR
      ========================================= */

      if (
        command === "kupaekle" ||
        command === "kupasil"
      ) {
        if (
          !isSpeaker(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
          );
        }

        const role =
          message.mentions.roles.first();

        const cup =
          text
            .replace(
              `<@&${role?.id}>`,
              ""
            )
            .trim();

        if (
          !role ||
          !cup
        ) {
          return message.reply(
            `❌ Kullanım: \`.${command} @Takım Kupa Adı\``
          );
        }

        if (
          !data.cups[role.id]
        ) {
          data.cups[role.id] =
            [];
        }

        if (
          command === "kupaekle"
        ) {
          data.cups[
            role.id
          ].push(cup);

          saveData();

          return message.reply(
            `🏆 **${cup}** eklendi.`
          );
        }

        data.cups[
          role.id
        ] =
          data.cups[
            role.id
          ].filter(
            (x) =>
              norm(x) !==
              norm(cup)
          );

        saveData();

        return message.reply(
          `🗑️ **${cup}** kaldırıldı.`
        );
      }

      if (
        command === "müze" ||
        command === "muze"
      ) {
        const role =
          message.mentions.roles.first();

        if (!role) {
          return message.reply(
            "❌ Kullanım: `.müze @Takım`"
          );
        }

        const cups =
          data.cups[
            role.id
          ] || [];

        return message.reply(
          `🏛️ **${role.name} | MÜZE**\n\n${
            cups.length
              ? cups
                  .map(
                    (x) =>
                      `🏆 ${x}`
                  )
                  .join("\n")
              : "Henüz kupa yok."
          }`
        );
      }

      /* =========================================
         ROL PANEL
      ========================================= */

      if (
        command === "rolpanel"
      ) {
        if (
          !isAdmin(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yalnızca Yönetici."
          );
        }

        const buttons = [
          [
            "ping:1537393545827123230",
            "🤝 Partner Ping",
          ],
          [
            "ping:1547393416755941509",
            "⚽ Maç Ping",
          ],
          [
            "ping:1547393331297001522",
            "📢 Duyuru Ping",
          ],
          [
            "ping:1545116885589430312",
            "🎉 Çekiliş Ping",
          ],
          [
            "ping:1547393966553440346",
            "📰 Medya Ping",
          ],
        ];

        const rows = [];

        for (
          let i = 0;
          i < buttons.length;
          i += 3
        ) {
          const row =
            new ActionRowBuilder();

          for (
            const [id, label] of
            buttons.slice(
              i,
              i + 3
            )
          ) {
            row.addComponents(
              new ButtonBuilder()
                .setCustomId(id)
                .setLabel(
                  label.slice(2)
                )
                .setEmoji(
                  label.slice(0, 2)
                )
                .setStyle(
                  ButtonStyle.Secondary
                )
            );
          }

          rows.push(row);
        }

        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle(
                "🔔 Axera League | Rol Paneli"
              )
              .setDescription(
                "İstediğin bildirim rolünü butondan alabilir veya kaldırabilirsin."
              ),
          ],
          components: rows,
        });
      }

      /* =========================================
         ŞART
      ========================================= */

      if (
        command === "sart" ||
        command === "şart"
      ) {
        return message.reply(
          "📋 **AXERA LEAGUE | ŞARTLAR**\n\n" +
            "✓ **Kalıcı Tık:** Kalıcı 「✓」 kanalına tıklayınız.\n" +
            "🎭 **Rol Al:** Rol Al kanalından en az **2 rol** alınız.\n\n" +
            "ℹ️ Bu şartlar zorunlu değildir. Yapmadan da tüm Axera League sistemlerini kullanabilirsiniz."
        );
      }

      /* =========================================
         TICKET PANEL
      ========================================= */

      if (
        command === "ticketpanel"
      ) {
        if (
          !isAdmin(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yalnızca Yönetici."
          );
        }

        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle(
                "🎫 Axera League Destek"
              )
              .setDescription(
                "Destek talebi oluşturmak için aşağıdaki butona bas."
              ),
          ],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(
                  "ticket_create"
                )
                .setLabel(
                  "Destek Talebi Oluştur"
                )
                .setEmoji("🎫")
                .setStyle(
                  ButtonStyle.Primary
                )
            ),
          ],
        });
      }

      /* =========================================
         MODERASYON
      ========================================= */

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
          Number(parts[0]);

        if (
          !Number.isInteger(
            amount
          ) ||
          amount < 1 ||
          amount > 1000
        ) {
          return message.reply(
            "❌ 1-1000 arasında sayı gir."
          );
        }

        await message.channel.bulkDelete(
          amount + 1,
          true
        );

        return;
      }

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

        const split =
          text.split("|");

        if (
          split.length < 2
        ) {
          return message.reply(
            "❌ Kullanım: `.embed Başlık | Açıklama`"
          );
        }

        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle(
                split[0].trim()
              )
              .setDescription(
                split
                  .slice(1)
                  .join("|")
                  .trim()
              )
              .setTimestamp(),
          ],
        });
      }

      /* =========================================
         KICK / BAN / MUTE
      ========================================= */

      if (
        [
          "kick",
          "ban",
          "mute",
          "unmute",
        ].includes(command)
      ) {
        if (
          !isModerator(
            message.member
          )
        ) {
          return message.reply(
            "❌ Moderasyon yetkin yok."
          );
        }

        const target =
          message.mentions.members.first();

        if (!target) {
          return message.reply(
            `❌ Kullanım: \`.${command} @Oyuncu\``
          );
        }

        if (
          command === "kick"
        ) {
          await target
            .kick()
            .catch(() => {});

          return message.reply(
            `👢 ${target.user.tag} atıldı.`
          );
        }

        if (
          command === "ban"
        ) {
          await target
            .ban()
            .catch(() => {});

          return message.reply(
            `🔨 ${target.user.tag} yasaklandı.`
          );
        }

        let muteRole =
          message.guild.roles.cache.find(
            (r) =>
              norm(r.name) ===
              "muted"
          );

        if (
          !muteRole
        ) {
          if (
            command === "mute"
          ) {
            return message.reply(
              "❌ `Muted` rolü bulunamadı."
            );
          }

          return message.reply(
            "❌ `Muted` rolü bulunamadı."
          );
        }

        if (
          command === "mute"
        ) {
          await target.roles.add(
            muteRole
          );

          return message.reply(
            `🔇 ${target} susturuldu.`
          );
        }

        await target.roles.remove(
          muteRole
        );

        return message.reply(
          `🔊 ${target} susturması kaldırıldı.`
        );
      }

      /* =========================================
         DM
      ========================================= */

      if (
        command === "dm"
      ) {
        if (
          !isAdmin(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yalnızca Yönetici."
          );
        }

        const target =
          message.mentions.members.first();

        if (
          !target ||
          !text
        ) {
          return message.reply(
            "❌ Kullanım: `.dm @Oyuncu mesaj`"
          );
        }

        const dm =
          raw
            .replace(
              new RegExp(
                `<@!?${target.id}>`
              ),
              ""
            )
            .replace(
              /^\.dm\s*/i,
              ""
            )
            .trim();

        try {
          await target.send(dm);

          return message.reply(
            "✅ DM gönderildi."
          );
        } catch {
          return message.reply(
            "❌ DM gönderilemedi."
          );
        }
      }

      /* =========================================
         GOL KRALI
      ========================================= */

      if (
        command === "golkrali"
      ) {
        const list =
          Object.entries(
            data.stats
          )
            .sort(
              (a, b) =>
                (b[1].goals || 0) -
                (a[1].goals || 0)
            )
            .slice(0, 10);

        return message.reply(
          `⚽ **GOL KRALI**\n\n` +
            (list.length
              ? list
                  .map(
                    ([id, s], i) => {
                      const m =
                        message.guild.members.cache.get(
                          id
                        );

                      return `${
                        i + 1
                      }. ${
                        m?.displayName ||
                        id
                      } — ${
                        s.goals || 0
                      } gol`;
                    }
                  )
                  .join("\n")
              : "Henüz veri yok.")
        );
      }

      /* =========================================
         ASİST KRALI
      ========================================= */

      if (
        command === "asistkral"
      ) {
        const list =
          Object.entries(
            data.stats
          )
            .sort(
              (a, b) =>
                (b[1].assists || 0) -
                (a[1].assists || 0)
            )
            .slice(0, 10);

        return message.reply(
          `🎯 **ASİST KRALI**\n\n` +
            (list.length
              ? list
                  .map(
                    ([id, s], i) => {
                      const m =
                        message.guild.members.cache.get(
                          id
                        );

                      return `${
                        i + 1
                      }. ${
                        m?.displayName ||
                        id
                      } — ${
                        s.assists ||
                        0
                      } asist`;
                    }
                  )
                  .join("\n")
              : "Henüz veri yok.")
        );
      }

      /* =========================================
         ROL VER
      ========================================= */

      if (
        command === "rolver"
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

        const role =
          message.mentions.roles.first();

        const member =
          message.mentions.members.first();

        if (
          !role ||
          !member
        ) {
          return message.reply(
            "❌ Kullanım: `.rolver @Rol @Oyuncu`"
          );
        }

        await member.roles.add(
          role
        );

        return message.reply(
          `✅ ${role} → ${member}`
        );
      }

      /* =========================================
         YARDIM
      ========================================= */

      if (
        command === "yardim" ||
        command === "yardım"
      ) {
        const embed =
          new EmbedBuilder()
            .setTitle(
              "🤖 AXERA LEAGUE | YARDIM"
            )
            .setDescription(
              [
                "**👤 Kayıt**",
                "`.k @Oyuncu İsim`",
                "`.kayıtsızver @Oyuncu`",
                "`.ara isim`",
                "",
                "**💰 Değer**",
                "`.dver @Oyuncu 5M`",
                "`.dsil @Oyuncu 5M`",
                "",
                "**🏋️ Oyuncu**",
                "`.ant`",
                "`.pen`",
                "`.tweet mesaj`",
                "",
                "**⚽ Takım**",
                "`.takımekle @Takım`",
                "`.takımkaldır @Takım`",
                "`.takımdeğer @Takım 850M`",
                "`.kadro @Takım`",
                "`.kadroekle @Takım @Oyuncu Pozisyon`",
                "`.kadrocikar @Takım @Oyuncu`",
                "`.formasyon @Takım`",
                "`.puan`",
                "`.puanekle @Takım 3`",
                "",
                "**🏟️ Maç**",
                "`.maç @Takım1 @Takım2`",
                "`.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`",
                "`.fikstür`",
                "`.fiksturcikar @Takım1 @Takım2`",
                "",
                "**🏆 Kupa**",
                "`.kupaekle @Takım Kupa`",
                "`.kupasil @Takım Kupa`",
                "`.müze @Takım`",
                "",
                "**🎫 Ticket**",
                "`.ticketpanel`",
                "",
                "**🔔 Roller**",
                "`.rolpanel`",
                "`.sart`",
                "",
                "**🤖 AXERA AI**",
                "`.ai soru`",
                "`.yapayzeka soru`",
                "AI kanalında komutsuz sohbet",
                "",
                "**🛡️ Moderasyon**",
                "`.sil miktar`",
                "`.embed Başlık | Açıklama`",
                "`.kick @Oyuncu`",
                "`.ban @Oyuncu`",
                "`.mute @Oyuncu`",
                "`.unmute @Oyuncu`",
                "`.dm @Oyuncu mesaj`",
              ].join("\n")
            );

        return message.reply({
          embeds: [embed],
        });
      }
    } catch (err) {
      console.error(
        "MESSAGE HATASI:",
        err
      );

      message.reply(
        "❌ Komut çalışırken bir hata oluştu."
      ).catch(() => {});
    }
  }
);

/* =========================================================
   TOKEN
========================================================= */

if (!process.env.TOKEN) {
  console.error(
    "❌ TOKEN bulunamadı!"
  );
  process.exit(1);
}

client.login(
  process.env.TOKEN
).catch((err) => {
  console.error(
    "❌ DISCORD LOGIN HATASI:",
    err
  );
  process.exit(1);
});
