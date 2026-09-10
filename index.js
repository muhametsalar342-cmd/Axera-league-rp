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
   AYARLAR
========================================================= */

const IDS = {
  roles: {
    ADMIN: "1534455282426445897",
    REGISTER: "1534456315366342716",
    VALUE: "1534456192913375382",
    UNREGISTERED: "1534457560134844517",
    PLAYER: "1534457228986421278",
    TD: "1534456648930693120",
    MEMBER: "1534457460163608636",
    MOD: "1534456108415189063",
    SPEAKER: "1535251168169697390",
  },

  channels: {
    REGISTER: "1547371376355053599",
    CHAT: "1547374641763455009",
    TRAINING: "1547375589923618957",
    PENALTY: "1547375997698052166",
    MATCH: "1547376935410073692",
    TWEET: "1547377797193011340",
    VALUE: "1547376344927834122",
    STANDINGS: "1547382143775285431",
    BOT_STATUS: "1547388197796057118",
    AI: "1547375186754408539",
  },

  pingRoles: {
    MEDIA: "1547393966553440346",
    PARTNER: "1547393545827123230",
    MATCH: "1547393416755941509",
    ANNOUNCEMENT: "1547393331297001522",
    GIVEAWAY: "1545116885589430312",
  },
};

const AI_MODEL = "gpt-5.5";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/* =========================================================
   DATA
========================================================= */

const DATA_FILE = path.join(__dirname, "data.json");

const defaultData = {
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
  playerMatchHistory: {},
  penalties: {},
  stats: {},
  matchHistory: {},
  aiResponses: {},
};

let data;

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
    }

    data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

    for (const key of Object.keys(defaultData)) {
      if (data[key] === undefined) data[key] = defaultData[key];
    }
  } catch (err) {
    console.error("data.json okunamadı:", err);
    data = JSON.parse(JSON.stringify(defaultData));
  }
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("data.json kaydedilemedi:", err);
  }
}

loadData();

/* =========================================================
   YARDIMCI FONKSİYONLAR
========================================================= */

function isAdmin(member) {
  return (
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.roles.cache.has(IDS.roles.ADMIN)
  );
}

function hasRole(member, roleId) {
  return member.roles.cache.has(roleId);
}

function isValueStaff(member) {
  return isAdmin(member) || hasRole(member, IDS.roles.VALUE);
}

function isSpeaker(member) {
  return (
    isAdmin(member) ||
    hasRole(member, IDS.roles.SPEAKER)
  );
}

function isModerator(member) {
  return (
    isAdmin(member) ||
    hasRole(member, IDS.roles.MOD)
  );
}

function money(amount) {
  return `${Number(amount || 0).toLocaleString("tr-TR")}M€`;
}

function normalize(text) {
  return String(text || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function ensureUser(id) {
  if (!data.users[id]) {
    data.users[id] = {
      value: 0,
      training: 0,
      roleType: null,
      registered: false,
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

function parseMoney(input) {
  const text = String(input || "")
    .trim()
    .replace(",", ".");

  if (!/^\d+(?:\.\d+)?(?:m€?|M€?)?$/.test(text)) {
    return null;
  }

  const value = Number(
    text
      .replace(/m€/gi, "")
      .replace(/m/gi, "")
  );

  if (!Number.isFinite(value) || value <= 0) return null;

  return value;
}

/* =========================================================
   OYUNCU DEĞERİ
========================================================= */

function extractPlayerValue(member) {
  const nick = member.nickname || member.user.username;

  const match = nick.match(/(\d+(?:[.,]\d+)?)M€$/i);

  if (!match) return null;

  return Number(match[1].replace(",", "."));
}

async function changePlayerValue(member, amount) {
  const current = extractPlayerValue(member);

  if (current === null) {
    return {
      ok: false,
      message:
        "❌ Oyuncunun takma adının sonunda geçerli bir `M€` değeri bulunamadı.",
    };
  }

  const next = current + amount;

  if (next < 0) {
    return {
      ok: false,
      message: "❌ Oyuncu değeri 0M€ altına düşemez.",
    };
  }

  if (next > 1000) {
    return {
      ok: false,
      message: "❌ Oyuncu değeri en fazla 1000M€ olabilir.",
    };
  }

  const nick = member.nickname || member.user.username;

  const newNick = nick.replace(
    /(\d+(?:[.,]\d+)?)M€$/i,
    `${String(next).replace(".", ",")}M€`
  );

  try {
    await member.setNickname(newNick);
  } catch (err) {
    return {
      ok: false,
      message:
        "❌ Değer hesaplandı fakat Discord takma adı değiştirilemedi. Botun Manage Nicknames yetkisini kontrol et.",
    };
  }

  ensureUser(member.id).value = next;
  saveData();

  return {
    ok: true,
    oldValue: current,
    newValue: next,
  };
}

/* =========================================================
   KAYIT
========================================================= */

async function removeRegistrationRoles(member) {
  const roles = [
    IDS.roles.UNREGISTERED,
    IDS.roles.PLAYER,
    IDS.roles.TD,
    IDS.roles.MEMBER,
  ];

  for (const roleId of roles) {
    if (member.roles.cache.has(roleId)) {
      try {
        await member.roles.remove(roleId);
      } catch {}
    }
  }
}

async function registerMember(member, type, nickname) {
  await removeRegistrationRoles(member);

  let roleId = IDS.roles.PLAYER;

  if (type === "Futbolcu") roleId = IDS.roles.PLAYER;
  if (type === "Üye") roleId = IDS.roles.MEMBER;
  if (type === "Teknik Direktör") roleId = IDS.roles.TD;

  // Kaleci için ayrı rol ID verilmediği için Oyuncu rolü kullanılır.
  if (type === "Kaleci") roleId = IDS.roles.PLAYER;

  await member.roles.add(roleId);

  if (nickname) {
    try {
      await member.setNickname(nickname.slice(0, 32));
    } catch {}
  }

  const user = ensureUser(member.id);
  user.registered = true;
  user.roleType = type;

  saveData();
}

/* =========================================================
   .ARA
========================================================= */

function getRegisteredMembers(guild) {
  return guild.members.cache.filter((member) => {
    if (member.user.bot) return false;
    if (member.roles.cache.has(IDS.roles.UNREGISTERED)) return false;

    return (
      member.roles.cache.has(IDS.roles.PLAYER) ||
      member.roles.cache.has(IDS.roles.TD) ||
      member.roles.cache.has(IDS.roles.MEMBER)
    );
  });
}

function searchMembers(guild, query) {
  const q = normalize(query);

  const results = [];

  for (const member of getRegisteredMembers(guild).values()) {
    const nickname = normalize(member.nickname || "");
    const display = normalize(member.displayName || "");
    const username = normalize(member.user.username || "");

    let score = 0;

    if (nickname === q) score = 1000;
    else if (display === q) score = 950;
    else if (username === q) score = 900;
    else if (nickname.startsWith(q)) score = 800;
    else if (display.startsWith(q)) score = 750;
    else if (username.startsWith(q)) score = 700;
    else if (nickname.includes(q)) score = 600;
    else if (display.includes(q)) score = 550;
    else if (username.includes(q)) score = 500;
    else {
      const words = q.split(/\s+/).filter(Boolean);

      for (const word of words) {
        if (nickname.includes(word)) score += 80;
        if (display.includes(word)) score += 70;
        if (username.includes(word)) score += 60;
      }
    }

    if (score > 0) {
      results.push({ member, score });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

/* =========================================================
   TAKIM
========================================================= */

function ensureTeam(roleId, name) {
  if (!data.teams[roleId]) {
    data.teams[roleId] = {
      name,
      value: 0,
      players: {},
      formation: "4-4-2",
      owner: null,
    };
  }

  return data.teams[roleId];
}

function ensureStandings(roleId, name) {
  if (!data.standings[roleId]) {
    data.standings[roleId] = {
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

  return data.standings[roleId];
}

function getTeamMembers(guild, roleId) {
  return guild.members.cache.filter(
    (m) => !m.user.bot && m.roles.cache.has(roleId)
  );
}

function getTeamPlayers(guild, teamId) {
  const team = data.teams[teamId];

  if (!team) return [];

  const result = new Map();

  const roleMembers = getTeamMembers(guild, teamId);

  for (const member of roleMembers.values()) {
    result.set(member.id, member);
  }

  for (const playerId of Object.keys(team.players || {})) {
    const member = guild.members.cache.get(playerId);

    if (member && !member.user.bot) {
      result.set(playerId, member);
    }
  }

  return [...result.values()];
}

/* =========================================================
   FORMASYON
========================================================= */

const formations = [
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

const matchCommentaries = [
  "Orta sahada topa sahip olan taraf hücuma çıkıyor.",
  "Kanattan hızlı bir atak gelişiyor.",
  "Savunma araya girerek tehlikeyi uzaklaştırıyor.",
  "Kaleci kritik bir kurtarış yapıyor.",
  "Top ceza sahasına gönderiliyor.",
  "Şut geliyor ancak top auta çıkıyor.",
  "Orta saha oyuncusu rakibinden sıyrılıyor.",
  "Savunma çizgisi öne çıkıyor.",
  "Hücum oyuncusu kaleciyle karşı karşıya kalıyor.",
  "Top direkten dönüyor!",
  "Hakem faul düdüğünü çalıyor.",
  "Hızlı bir kontra atak başlıyor.",
];

function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function getTeamStrength(guild, teamId) {
  const team = data.teams[teamId];

  if (!team) return 1;

  const players = getTeamPlayers(guild, teamId);

  let total = Number(team.value || 0);

  for (const player of players) {
    const value = extractPlayerValue(player);
    if (value) total += value;
  }

  return Math.max(total, 1);
}

function pickScorer(guild, teamId) {
  const players = getTeamPlayers(guild, teamId);

  if (!players.length) return null;

  return randomItem(players);
}

function updateStanding(teamId, gf, ga) {
  const team = data.standings[teamId];

  if (!team) return;

  team.played++;
  team.gf += gf;
  team.ga += ga;

  if (gf > ga) {
    team.win++;
    team.points += 3;
  } else if (gf === ga) {
    team.draw++;
    team.points += 1;
  } else {
    team.loss++;
  }
}

async function startMatch(guild, team1Id, team2Id, channel) {
  if (data.activeMatches[guild.id]) {
    await channel.send("❌ Bu sunucuda zaten aktif bir maç var.");
    return;
  }

  const team1Role = guild.roles.cache.get(team1Id);
  const team2Role = guild.roles.cache.get(team2Id);

  if (!team1Role || !team2Role) {
    await channel.send("❌ Takım rollerinden biri bulunamadı.");
    return;
  }

  const players1 = getTeamPlayers(guild, team1Id);
  const players2 = getTeamPlayers(guild, team2Id);

  if (!players1.length || !players2.length) {
    await channel.send(
      "❌ Maç için iki takımda da en az bir oyuncu bulunmalı."
    );
    return;
  }

  const matchId = `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;

  const strength1 = getTeamStrength(guild, team1Id);
  const strength2 = getTeamStrength(guild, team2Id);

  const active = {
    id: matchId,
    team1: team1Id,
    team2: team2Id,
    score1: 0,
    score2: 0,
    minute: 0,
    events: [],
    scorers: [],
    assists: [],
    players: [
      ...new Set([
        ...players1.map((x) => x.id),
        ...players2.map((x) => x.id),
      ]),
    ],
    startedAt: Date.now(),
  };

  data.activeMatches[guild.id] = active;
  saveData();

  const embed = new EmbedBuilder()
    .setTitle("⚽ AXERA LEAGUE | CANLI MAÇ")
    .setDescription(
      `**${team1Role.name}** 0 - 0 **${team2Role.name}**\n\n` +
        `⏱️ Dakika: **0'**\n` +
        `📏 Saha: **100 metre**\n\n` +
        `Maç başladı!`
    )
    .setTimestamp();

  const message = await channel.send({ embeds: [embed] });

  const interval = setInterval(async () => {
    try {
      const match = data.activeMatches[guild.id];

      if (!match || match.id !== matchId) {
        clearInterval(interval);
        return;
      }

      match.minute++;

      const baseChance = 0.035;

      const total = strength1 + strength2;
      const advantage1 = strength1 / total;
      const advantage2 = strength2 / total;

      const chance1 =
        baseChance * (0.7 + advantage1 * 0.8);

      const chance2 =
        baseChance * (0.7 + advantage2 * 0.8);

      let eventText = randomItem(matchCommentaries);

      if (Math.random() < chance1) {
        const scorer = pickScorer(guild, team1Id);

        if (scorer) {
          match.score1++;

          const assistCandidates = players1.filter(
            (p) => p.id !== scorer.id
          );

          const assist =
            assistCandidates.length > 0
              ? randomItem(assistCandidates)
              : null;

          match.scorers.push({
            player: scorer.id,
            team: team1Id,
            minute: match.minute,
          });

          if (assist) {
            match.assists.push({
              player: assist.id,
              team: team1Id,
              minute: match.minute,
            });
          }

          eventText =
            `⚽ **GOOOL!** ${scorer.displayName} golü attı! ` +
            (assist
              ? `Asist: ${assist.displayName}.`
              : "");
        }
      } else if (Math.random() < chance2) {
        const scorer = pickScorer(guild, team2Id);

        if (scorer) {
          match.score2++;

          const assistCandidates = players2.filter(
            (p) => p.id !== scorer.id
          );

          const assist =
            assistCandidates.length > 0
              ? randomItem(assistCandidates)
              : null;

          match.scorers.push({
            player: scorer.id,
            team: team2Id,
            minute: match.minute,
          });

          if (assist) {
            match.assists.push({
              player: assist.id,
              team: team2Id,
              minute: match.minute,
            });
          }

          eventText =
            `⚽ **GOOOL!** ${scorer.displayName} golü attı! ` +
            (assist
              ? `Asist: ${assist.displayName}.`
              : "");
        }
      }

      match.events.push(
        `**${match.minute}'** ${eventText}`
      );

      if (match.events.length > 8) {
        match.events.shift();
      }

      const liveEmbed = new EmbedBuilder()
        .setTitle("⚽ AXERA LEAGUE | CANLI MAÇ")
        .setDescription(
          `**${team1Role.name}** **${match.score1}** - **${match.score2}** **${team2Role.name}**\n\n` +
            `⏱️ Dakika: **${match.minute}'**\n` +
            `📏 Saha: **100 metre**\n\n` +
            match.events.join("\n")
        )
        .setTimestamp();

      await message.edit({ embeds: [liveEmbed] });

      if (match.minute >= 90) {
        clearInterval(interval);

        updateStanding(
          team1Id,
          match.score1,
          match.score2
        );

        updateStanding(
          team2Id,
          match.score2,
          match.score1
        );

        const rewarded = new Set();

        for (const playerId of match.players) {
          if (rewarded.has(playerId)) continue;

          rewarded.add(playerId);

          const member = guild.members.cache.get(playerId);

          if (!member) continue;

          const rewardResult = await changePlayerValue(
            member,
            5
          );

          if (!rewardResult.ok) {
            console.log(
              `Maç ödülü verilemedi: ${member.user.tag}`
            );
          }

          ensureStats(playerId).matches++;
        }

        for (const scorer of match.scorers) {
          const member = guild.members.cache.get(
            scorer.player
          );

          if (!member) continue;

          await changePlayerValue(member, 2);

          ensureStats(scorer.player).goals++;
        }

        for (const assist of match.assists) {
          const member = guild.members.cache.get(
            assist.player
          );

          if (!member) continue;

          await changePlayerValue(member, 1);

          ensureStats(assist.player).assists++;
        }

        const finalEmbed = new EmbedBuilder()
          .setTitle("🏁 AXERA LEAGUE | MAÇ BİTTİ")
          .setDescription(
            `**${team1Role.name}** **${match.score1}** - **${match.score2}** **${team2Role.name}**\n\n` +
              `🏆 Maç tamamlandı.\n` +
              `💰 Katılan oyunculara +5M€ verildi.\n` +
              `⚽ Gol atanlara +2M€ verildi.\n` +
              `🎯 Asist yapanlara +1M€ verildi.`
          )
          .setTimestamp();

        await message.edit({
          embeds: [finalEmbed],
        });

        data.matchHistory[matchId] = {
          ...match,
          finishedAt: Date.now(),
        };

        delete data.activeMatches[guild.id];
        saveData();
      }
    } catch (err) {
      console.error("Maç hatası:", err);
      clearInterval(interval);
      delete data.activeMatches[guild.id];
      saveData();
    }
  }, 3000);
}

/* =========================================================
   AI
========================================================= */

const aiMemory = new Map();

const AI_SYSTEM = `
Senin adın Axera.

Sen Axera League Discord sunucusunun yapay zekâ asistanısın.
Türkçe konuş.
Kullanıcıyla doğal, arkadaşça ve anlaşılır şekilde konuş.
Sorulara mümkün olduğunca kısa ama yeterli cevap ver.

Seni kimin kurduğu sorulursa:
"Beni Lynox9380 kurdu." de.

Axera League hakkında sorulursa mevcut sunucu sistemleri hakkında yardımcı ol.

Discord üzerinde gerçekten yapamayacağın bir işlemi yapmış gibi davranma.
Yönetici olduğunu veya Discord üzerinde sınırsız yetkin olduğunu iddia etme.
Bir işlem gerçekten bot kodu tarafından yapılmadıysa yapılmış gibi söyleme.

Kullanıcı tehlikeli, yasadışı veya yaşa uygun olmayan bir şey isterse bunu güvenli şekilde reddet.
`;

async function askAxera(message, text) {
  if (!openai) {
    await message.reply(
      "❌ AI sistemi hazır değil. Railway'de `OPENAI_API_KEY` değişkenini kontrol edin."
    );
    return;
  }

  const userId = message.author.id;

  let previousResponseId = aiMemory.get(userId) || null;

  try {
    const request = {
      model: AI_MODEL,
      instructions: AI_SYSTEM,
      input: text,
    };

    if (previousResponseId) {
      request.previous_response_id = previousResponseId;
    }

    const response = await openai.responses.create(
      request
    );

    const answer =
      response.output_text?.trim() ||
      "Üzgünüm, şu anda cevap oluşturamadım.";

    aiMemory.set(userId, response.id);

    const chunks = [];

    for (let i = 0; i < answer.length; i += 1900) {
      chunks.push(answer.slice(i, i + 1900));
    }

    for (const chunk of chunks) {
      await message.reply(chunk);
    }
  } catch (err) {
    console.error("OpenAI hatası:", err);

    await message.reply(
      "❌ Axera şu anda cevap veremiyor. OpenAI API anahtarını ve Railway değişkenlerini kontrol edin."
    );
  }
}

/* =========================================================
   TICKET
========================================================= */

async function createTicket(message) {
  const guild = message.guild;

  const existing = Object.values(data.tickets).find(
    (x) =>
      x.guildId === guild.id &&
      x.userId === message.author.id &&
      x.open
  );

  if (existing) {
    return message.reply(
      `❌ Zaten açık bir ticketın var: <#${existing.channelId}>`
    );
  }

  const channel = await guild.channels.create({
    name: `ticket-${message.author.username}`.slice(0, 90),
    type: ChannelType.GuildText,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id: message.author.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
        ],
      },
      {
        id: IDS.roles.MOD,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
        ],
      },
    ],
  });

  data.tickets[channel.id] = {
    guildId: guild.id,
    userId: message.author.id,
    channelId: channel.id,
    open: true,
    lastMessage: Date.now(),
  };

  saveData();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_close")
      .setLabel("Bileti Kapat")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({
    content: `<@${message.author.id}> <@&${IDS.roles.MOD}>`,
    embeds: [
      new EmbedBuilder()
        .setTitle("🎫 Destek Talebi")
        .setDescription(
          "Yetkili ekibimiz en kısa sürede yardımcı olacaktır.\n\n" +
            "Ticketı kapatmak için aşağıdaki butonu kullanabilirsiniz."
        ),
    ],
    components: [row],
  });

  await message.reply(
    `✅ Ticket oluşturuldu: <#${channel.id}>`
  );
}

/* =========================================================
   READY
========================================================= */

client.once("ready", async () => {
  console.log(`Axera aktif: ${client.user.tag}`);

  client.user.setPresence({
    activities: [
      {
        name: "Axera League | Futbol RP",
        type: 0,
      },
    ],
    status: "online",
  });

  setInterval(() => {
    for (const guild of client.guilds.cache.values()) {
      for (const fixture of data.fixtures) {
        if (fixture.started) continue;

        if (Date.now() >= fixture.timestamp) {
          fixture.started = true;

          startMatch(
            guild,
            fixture.team1,
            fixture.team2,
            guild.channels.cache.get(IDS.channels.MATCH)
          ).catch(console.error);
        }
      }
    }

    saveData();
  }, 1000);

  setInterval(() => {
    for (const [channelId, ticket] of Object.entries(
      data.tickets
    )) {
      if (!ticket.open) continue;

      if (
        Date.now() - ticket.lastMessage >
        60 * 60 * 1000
      ) {
        const channel = client.channels.cache.get(channelId);

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

  const statusChannel = client.channels.cache.get(
    IDS.channels.BOT_STATUS
  );

  if (statusChannel) {
    statusChannel
      .send(
        "🟢 **Axera League Bot aktif!**\n🤖 Axera AI hazır.\n⚽ Futbol RP sistemleri aktif."
      )
      .catch(() => {});
  }
});

/* =========================================================
   MEMBER JOIN
========================================================= */

client.on("guildMemberAdd", async (member) => {
  try {
    await member.roles.add(IDS.roles.UNREGISTERED);

    const channel = member.guild.channels.cache.get(
      IDS.channels.REGISTER
    );

    if (!channel) return;

    await channel.send(
      `👋 Hoş geldin ${member}!\n<@&${IDS.roles.REGISTER}> yeni üyeyi kayıt edebilirsiniz.`
    );
  } catch (err) {
    console.error("Üye giriş hatası:", err);
  }
});

/* =========================================================
   BUTTONS
========================================================= */

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isButton()) {
      /* KAYIT */
      if (
        interaction.customId.startsWith(
          "register_"
        )
      ) {
        if (
          !isAdmin(interaction.member) &&
          !hasRole(
            interaction.member,
            IDS.roles.REGISTER
          )
        ) {
          return interaction.reply({
            content:
              "❌ Bu işlemi yalnızca Kayıt Yetkilisi veya Yönetici yapabilir.",
            ephemeral: true,
          });
        }

        const [, userId, type] =
          interaction.customId.split(":");

        const member =
          interaction.guild.members.cache.get(userId);

        if (!member) {
          return interaction.reply({
            content: "❌ Oyuncu bulunamadı.",
            ephemeral: true,
          });
        }

        const panel =
          data.registrationPanels[
            interaction.message.id
          ];

        if (!panel) {
          return interaction.reply({
            content:
              "❌ Kayıt panelinin bilgileri bulunamadı.",
            ephemeral: true,
          });
        }

        await registerMember(
          member,
          type,
          panel.nickname
        );

        return interaction.update({
          content: `✅ ${member} başarıyla **${type}** olarak kaydedildi.`,
          embeds: [],
          components: [],
        });
      }

      /* ROL PANEL */
      if (
        interaction.customId.startsWith(
          "ping_"
        )
      ) {
        const roleId =
          interaction.customId.split("_")[1];

        const role =
          interaction.guild.roles.cache.get(roleId);

        if (!role) {
          return interaction.reply({
            content: "❌ Rol bulunamadı.",
            ephemeral: true,
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
            content: `❌ ${role.name} rolü kaldırıldı.`,
            ephemeral: true,
          });
        }

        await interaction.member.roles.add(roleId);

        return interaction.reply({
          content: `✅ ${role.name} rolü verildi.`,
          ephemeral: true,
        });
      }

      /* TICKET */
      if (
        interaction.customId ===
        "ticket_close"
      ) {
        if (
          !isModerator(interaction.member) &&
          interaction.channel
        ) {
          const ticket =
            data.tickets[
              interaction.channel.id
            ];

          if (
            !ticket ||
            ticket.userId !==
              interaction.user.id
          ) {
            return interaction.reply({
              content:
                "❌ Bu ticketı kapatamazsın.",
              ephemeral: true,
            });
          }
        }

        const ticket =
          data.tickets[
            interaction.channel.id
          ];

        if (ticket) {
          ticket.open = false;
          saveData();
        }

        await interaction.reply(
          "🔒 Ticket kapatılıyor..."
        );

        setTimeout(() => {
          interaction.channel
            ?.delete()
            .catch(() => {});
        }, 1500);

        return;
      }
    }

    /* KAYIT SELECT */
    if (interaction.isStringSelectMenu()) {
      if (
        interaction.customId ===
        "formation_select"
      ) {
        if (!isSpeaker(interaction.member)) {
          return interaction.reply({
            content:
              "❌ Bu işlemi yalnızca Spiker/Yönetici yapabilir.",
            ephemeral: true,
          });
        }

        const teamId =
          interaction.message.embeds[0]
            ?.footer?.text?.replace(
              "TEAM:",
              ""
            );

        if (!teamId || !data.teams[teamId]) {
          return interaction.reply({
            content: "❌ Takım bulunamadı.",
            ephemeral: true,
          });
        }

        data.teams[teamId].formation =
          interaction.values[0];

        saveData();

        return interaction.reply({
          content: `✅ Formasyon **${interaction.values[0]}** olarak ayarlandı.`,
          ephemeral: true,
        });
      }
    }
  } catch (err) {
    console.error("Interaction hatası:", err);
  }
});

/* =========================================================
   MESAJLAR
========================================================= */

client.on("messageCreate", async (message) => {
  try {
    if (!message.guild) return;
    if (message.author.bot) return;

    /* ==============================================
       AI KANALI
    ============================================== */

    if (
      message.channel.id ===
      IDS.channels.AI
    ) {
      const content = message.content.trim();

      if (
        content &&
        !content.startsWith(".")
      ) {
        await askAxera(message, content);
        return;
      }
    }

    const args = message.content.trim().split(/\s+/);
    const command = normalize(args.shift());

    if (!command.startsWith(".")) return;

    const cmd = command.slice(1);
    const text = args.join(" ");

    /* ==============================================
       AI KOMUTU
    ============================================== */

    if (
      cmd === "ai" ||
      cmd === "yapayzeka"
    ) {
      if (
        message.channel.id !==
        IDS.channels.AI
      ) {
        return message.reply(
          "❌ AI komutlarını yalnızca <#" +
            IDS.channels.AI +
            "> kanalında kullanabilirsin."
        );
      }

      if (!text) {
        return message.reply(
          "🤖 Ben **Axera**. Bana bir soru yaz.\nÖrnek: `.ai Axera League nedir?`"
        );
      }

      await askAxera(message, text);
      return;
    }

    /* ==============================================
       KAYIT
    ============================================== */

    if (cmd === "k") {
      if (
        message.channel.id !==
        IDS.channels.REGISTER
      ) {
        return message.reply(
          "❌ Bu komut yalnızca kayıt kanalında kullanılabilir."
        );
      }

      if (
        !isAdmin(message.member) &&
        !hasRole(
          message.member,
          IDS.roles.REGISTER
        )
      ) {
        return message.reply(
          "❌ Bu komutu yalnızca Kayıt Yetkilisi kullanabilir."
        );
      }

      const mentioned =
        message.mentions.members.first();

      if (!mentioned) {
        return message.reply(
          "❌ Kullanım: `.k @Oyuncu İsim`"
        );
      }

      const nickname =
        message.content
          .replace(
            new RegExp(
              `<@!?${mentioned.id}>`
            ),
            ""
          )
          .replace(/^\.k\s*/i, "")
          .trim();

      if (!nickname) {
        return message.reply(
          "❌ Oyuncunun adını yazmalısın."
        );
      }

      const row =
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(
              `register:${mentioned.id}:Futbolcu`
            )
            .setLabel("Futbolcu")
            .setEmoji("⚽")
            .setStyle(ButtonStyle.Primary),

          new ButtonBuilder()
            .setCustomId(
              `register:${mentioned.id}:Üye`
            )
            .setLabel("Üye")
            .setEmoji("👤")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId(
              `register:${mentioned.id}:Teknik Direktör`
            )
            .setLabel("Teknik Direktör")
            .setEmoji("🧑‍💼")
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId(
              `register:${mentioned.id}:Kaleci`
            )
            .setLabel("Kaleci")
            .setEmoji("🧤")
            .setStyle(ButtonStyle.Danger)
        );

      const embed = new EmbedBuilder()
        .setTitle("📋 Axera League Kayıt")
        .setDescription(
          `${mentioned}\n\n` +
            `👤 İsim: **${nickname}**\n\n` +
            `Aşağıdan kayıt türünü seçin.`
        );

      const sent = await message.channel.send({
        embeds: [embed],
        components: [row],
      });

      data.registrationPanels[sent.id] = {
        nickname,
        userId: mentioned.id,
      };

      saveData();
      return;
    }

    if (
      cmd === "kayitsizver" ||
      cmd === "kayıtsızver"
    ) {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Bu komutu yalnızca Yönetici kullanabilir."
        );
      }

      const member =
        message.mentions.members.first();

      if (!member) {
        return message.reply(
          "❌ Kullanım: `.kayıtsızver @Oyuncu`"
        );
      }

      await removeRegistrationRoles(member);

      await member.roles.add(
        IDS.roles.UNREGISTERED
      );

      ensureUser(member.id).registered =
        false;

      saveData();

      return message.reply(
        `✅ ${member} tekrar **Kayıtsız** yapıldı.`
      );
    }

    /* ==============================================
       ARA
    ============================================== */

    if (cmd === "ara") {
      if (!text) {
        return message.reply(
          "❌ Kullanım: `.ara isim`"
        );
      }

      const results = searchMembers(
        message.guild,
        text
      );

      if (!results.length) {
        return message.reply(
          "❌ Bu isimde veya benzer isimde kayıtlı oyuncu bulunamadı."
        );
      }

      const embed =
        new EmbedBuilder()
          .setTitle("🔎 Axera League | Oyuncu Arama")
          .setDescription(
            results
              .slice(0, 10)
              .map(
                ({ member }) => {
                  const value =
                    extractPlayerValue(
                      member
                    );

                  const stats =
                    ensureStats(member.id);

                  return (
                    `👤 ${member}\n` +
                    `**${member.displayName}**\n` +
                    `💰 Değer: ${
                      value !== null
                        ? money(value)
                        : "Belirsiz"
                    }\n` +
                    `⚽ Gol: ${stats.goals} | 🎯 Asist: ${stats.assists} | 🏟️ Maç: ${stats.matches}`
                  );
                }
              )
              .join("\n\n")
          );

      return message.reply({
        embeds: [embed],
      });
    }

    /* ==============================================
       DEĞER
    ============================================== */

    if (
      cmd === "dver" ||
      cmd === "dsil"
    ) {
      if (
        message.channel.id !==
        IDS.channels.VALUE
      ) {
        return message.reply(
          "❌ Bu komut yalnızca değer kanalında kullanılabilir."
        );
      }

      if (!isValueStaff(message.member)) {
        return message.reply(
          "❌ Bu komutu yalnızca Değer Yetkilisi veya Yönetici kullanabilir."
        );
      }

      const member =
        message.mentions.members.first();

      if (!member || !args[1]) {
        return message.reply(
          `❌ Kullanım: \`.${cmd} @Oyuncu 5M\``
        );
      }

      const amount =
        parseMoney(args[1]);

      if (amount === null) {
        return message.reply(
          "❌ Geçerli değer gir. Örnek: `5`, `5M` veya `5M€`"
        );
      }

      const change =
        cmd === "dver"
          ? amount
          : -amount;

      const result =
        await changePlayerValue(
          member,
          change
        );

      if (!result.ok) {
        return message.reply(
          result.message
        );
      }

      return message.reply(
        `✅ ${member} değeri **${money(
          result.oldValue
        )} → ${money(
          result.newValue
        )}** olarak güncellendi.`
      );
    }

    /* ==============================================
       ANTRENMAN
    ============================================== */

    if (
      cmd === "ant" ||
      cmd === "antrenman"
    ) {
      if (
        message.channel.id !==
        IDS.channels.TRAINING
      ) {
        return message.reply(
          "❌ Antrenman komutu yalnızca antrenman kanalında kullanılabilir."
        );
      }

      const user =
        ensureUser(message.author.id);

      user.training =
        Number(user.training || 0) + 1;

      if (user.training >= 5) {
        user.training = 0;

        const result =
          await changePlayerValue(
            message.member,
            3
          );

        saveData();

        if (!result.ok) {
          return message.reply(
            `🏋️ **5/5 tamamlandı!**\n❌ +3M€ verilemedi: ${result.message}`
          );
        }

        return message.reply(
          `🏋️ **5/5 antrenman tamamlandı!**\n💰 Oyuncu değerine **+3M€** eklendi.\n🔄 Antrenman **0/5** olarak sıfırlandı.`
        );
      }

      saveData();

      return message.reply(
        `🏋️ Antrenman tamamlandı!\n📊 İlerleme: **${user.training}/5**`
      );
    }

    /* ==============================================
       PENALTI
    ============================================== */

    if (
      cmd === "pen" ||
      cmd === "penalti" ||
      cmd === "penaltı"
    ) {
      if (
        message.channel.id !==
        IDS.channels.PENALTY
      ) {
        return message.reply(
          "❌ Penaltı komutu yalnızca penaltı kanalında kullanılabilir."
        );
      }

      const random =
        Math.random();

      if (random < 0.5) {
        const result =
          await changePlayerValue(
            message.member,
            5
          );

        if (!result.ok) {
          return message.reply(
            `⚽ GOOOL!\n❌ +5M€ verilemedi: ${result.message}`
          );
        }

        return message.reply(
          "⚽ **GOOOL!** 🧤 Axera Kalecisi topu çıkaramadı!\n💰 **+5M€**"
        );
      }

      if (random < 0.75) {
        return message.reply(
          "🥅 **DİREK!** Top direkten döndü!"
        );
      }

      return message.reply(
        "🧤 **KURTARDI!** Axera Kalecisi penaltıyı çıkardı!"
      );
    }

    /* ==============================================
       TWEET
    ============================================== */

    if (cmd === "tweet") {
      if (
        message.channel.id !==
        IDS.channels.TWEET
      ) {
        return message.reply(
          "❌ Tweet komutu yalnızca tweet kanalında kullanılabilir."
        );
      }

      if (!text) {
        return message.reply(
          "❌ Kullanım: `.tweet mesaj`"
        );
      }

      const last =
        data.tweetCooldowns[
          message.author.id
        ] || 0;

      const now = Date.now();

      const canReward =
        now - last >=
        24 * 60 * 60 * 1000;

      const embed =
        new EmbedBuilder()
          .setTitle("𝕏 Axera Tweet")
          .setDescription(text)
          .setFooter({
            text: message.member.displayName,
          })
          .setTimestamp();

      await message.delete().catch(() => {});

      await message.channel.send({
        embeds: [embed],
      });

      if (canReward) {
        const result =
          await changePlayerValue(
            message.member,
            5
          );

        if (result.ok) {
          data.tweetCooldowns[
            message.author.id
          ] = now;

          saveData();

          await message.channel.send(
            `🎁 ${message.author} tweet ödülü: **+5M€**`
          );
        }
      }

      return;
    }

    /* ==============================================
       TAKIM EKLE
    ============================================== */

    if (cmd === "takımekle" || cmd === "takimekle") {
      if (!isSpeaker(message.member)) {
        return message.reply(
          "❌ Yalnızca Spiker veya Yönetici kullanabilir."
        );
      }

      const role =
        message.mentions.roles.first();

      if (!role) {
        return message.reply(
          "❌ Kullanım: `.takımekle @Takım`"
        );
      }

      ensureTeam(role.id, role.name);
      ensureStandings(role.id, role.name);

      saveData();

      return message.reply(
        `✅ **${role.name}** takımı sisteme eklendi.`
      );
    }

    /* ==============================================
       TAKIM KALDIR
    ============================================== */

    if (
      cmd === "takımkaldır" ||
      cmd === "takimkaldir"
    ) {
      if (!isSpeaker(message.member)) {
        return message.reply(
          "❌ Yalnızca Spiker veya Yönetici kullanabilir."
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
          (match) =>
            match.team1 === role.id ||
            match.team2 === role.id
        );

      if (active) {
        return message.reply(
          "❌ Bu takımın aktif maçı var."
        );
      }

      delete data.teams[role.id];
      delete data.standings[role.id];
      delete data.formations[role.id];

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

    /* ==============================================
       PUAN
    ============================================== */

    if (
      cmd === "puan" ||
      cmd === "puandurumu"
    ) {
      const standings =
        Object.values(
          data.standings
        ).sort((a, b) => {
          const gdA = a.gf - a.ga;
          const gdB = b.gf - b.ga;

          return (
            b.points - a.points ||
            gdB - gdA ||
            b.gf - a.gf
          );
        });

      if (!standings.length) {
        return message.reply(
          "❌ Henüz puan durumu bulunmuyor."
        );
      }

      const lines =
        standings.map(
          (team, i) =>
            `**${i + 1}. ${team.name}** — ${team.points} P | ${team.played} O | ${team.gf}-${team.ga}`
        );

      return message.reply(
        `🏆 **AXERA LEAGUE | PUAN DURUMU**\n\n${lines.join(
          "\n"
        )}`
      );
    }

    /* ==============================================
       PUAN EKLE
    ============================================== */

    if (cmd === "puanekle") {
      if (!isSpeaker(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const role =
        message.mentions.roles.first();

      const amount =
        Number(args[1]);

      if (
        !role ||
        !Number.isInteger(amount)
      ) {
        return message.reply(
          "❌ Kullanım: `.puanekle @Takım 3`"
        );
      }

      const team =
        ensureStandings(
          role.id,
          role.name
        );

      team.points += amount;

      saveData();

      return message.reply(
        `✅ ${role.name} puanı **${amount}** artırıldı.`
      );
    }

    /* ==============================================
       TAKIM DEĞERİ
    ============================================== */

    if (
      cmd === "takımdeğer" ||
      cmd === "takimdeger"
    ) {
      if (!isSpeaker(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const role =
        message.mentions.roles.first();

      const value =
        parseMoney(args[1]);

      if (!role || value === null) {
        return message.reply(
          "❌ Kullanım: `.takımdeğer @Takım 850M`"
        );
      }

      ensureTeam(
        role.id,
        role.name
      ).value = value;

      saveData();

      return message.reply(
        `✅ ${role.name} takım değeri **${money(
          value
        )}** olarak ayarlandı.`
      );
    }

    /* ==============================================
       KADRO EKLE
    ============================================== */

    if (cmd === "kadroekle") {
      if (!isSpeaker(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const role =
        message.mentions.roles.first();

      const member =
        message.mentions.members.at(1);

      const position =
        args.find(
          (x) =>
            !x.startsWith("<@") &&
            !x.startsWith("<@&")
        );

      if (!role || !member) {
        return message.reply(
          "❌ Kullanım: `.kadroekle @Takım @Oyuncu Pozisyon`"
        );
      }

      const team =
        ensureTeam(
          role.id,
          role.name
        );

      team.players[member.id] =
        position || "Oyuncu";

      saveData();

      return message.reply(
        `✅ ${member} **${role.name}** kadrosuna eklendi.`
      );
    }

    /* ==============================================
       KADRO ÇIKAR
    ============================================== */

    if (
      cmd === "kadrocikar" ||
      cmd === "kadroçıkar"
    ) {
      if (!isSpeaker(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const role =
        message.mentions.roles.first();

      const member =
        message.mentions.members.at(1);

      if (!role || !member) {
        return message.reply(
          "❌ Kullanım: `.kadrocikar @Takım @Oyuncu`"
        );
      }

      const team =
        data.teams[role.id];

      if (!team) {
        return message.reply(
          "❌ Takım bulunamadı."
        );
      }

      delete team.players[member.id];

      saveData();

      return message.reply(
        `✅ ${member} kadrodan çıkarıldı.`
      );
    }

    /* ==============================================
       KADRO
    ============================================== */

    if (cmd === "kadro") {
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

      const grouped = {};

      for (const [
        playerId,
        position,
      ] of Object.entries(
        team.players
      )) {
        const member =
          message.guild.members.cache.get(
            playerId
          );

        if (!member) continue;

        if (!grouped[position]) {
          grouped[position] = [];
        }

        const value =
          extractPlayerValue(member);

        grouped[position].push(
          `• ${member.displayName} — ${
            value !== null
              ? money(value)
              : "Değer yok"
          }`
        );
      }

      const content =
        Object.entries(grouped)
          .map(
            ([position, players]) =>
              `**${position}**\n${players.join(
                "\n"
              )}`
          )
          .join("\n\n") ||
        "Kadro boş.";

      return message.reply(
        `📋 **${role.name} | KADRO**\n\n${content}`
      );
    }

    /* ==============================================
       FORMASYON
    ============================================== */

    if (cmd === "formasyon") {
      if (!isSpeaker(message.member)) {
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

      if (!data.teams[role.id]) {
        return message.reply(
          "❌ Takım bulunamadı."
        );
      }

      const menu =
        new StringSelectMenuBuilder()
          .setCustomId(
            "formation_select"
          )
          .setPlaceholder(
            "Formasyon seç..."
          )
          .addOptions(
            formations.map((formation) => ({
              label: formation,
              value: formation,
            }))
          );

      const row =
        new ActionRowBuilder().addComponents(
          menu
        );

      const embed =
        new EmbedBuilder()
          .setTitle(
            `⚽ ${role.name} | Formasyon`
          )
          .setDescription(
            "Takımınız için bir formasyon seçin."
          )
          .setFooter({
            text: `TEAM:${role.id}`,
          });

      return message.reply({
        embeds: [embed],
        components: [row],
      });
    }

    /* ==============================================
       MAÇ
    ============================================== */

    if (
      cmd === "maç" ||
      cmd === "mac"
    ) {
      if (
        message.channel.id !==
        IDS.channels.MATCH
      ) {
        return message.reply(
          "❌ Maç komutu yalnızca maç kanalında kullanılabilir."
        );
      }

      if (!isSpeaker(message.member)) {
        return message.reply(
          "❌ Bu komutu yalnızca Spiker veya Yönetici kullanabilir."
        );
      }

      const roles =
        [...message.mentions.roles.values()];

      if (roles.length < 2) {
        return message.reply(
          "❌ Kullanım: `.maç @Takım1 @Takım2`"
        );
      }

      await startMatch(
        message.guild,
        roles[0].id,
        roles[1].id,
        message.channel
      );

      return;
    }

    /* ==============================================
       FİKSTÜR EKLE
    ============================================== */

    if (
      cmd === "fiksturekle" ||
      cmd === "fikstürekle"
    ) {
      if (!isSpeaker(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const roles =
        [...message.mentions.roles.values()];

      const dateText =
        message.content
          .replace(
            new RegExp(
              `<@&${roles[0]?.id || "0"}>`
            ),
            ""
          )
          .replace(
            new RegExp(
              `<@&${roles[1]?.id || "0"}>`
            ),
            ""
          )
          .replace(
            /^\.fikst(u|ü)rekle\s*/i,
            ""
          )
          .trim();

      if (roles.length < 2) {
        return message.reply(
          "❌ İki takım etiketlemelisin."
        );
      }

      const timestamp =
        new Date(
          dateText.replace(" ", "T")
        ).getTime();

      if (
        !Number.isFinite(timestamp)
      ) {
        return message.reply(
          "❌ Tarih formatı: `YYYY-MM-DD HH:MM`"
        );
      }

      data.fixtures.push({
        id: data.nextFixtureId++,
        team1: roles[0].id,
        team2: roles[1].id,
        timestamp,
        started: false,
      });

      saveData();

      return message.reply(
        `✅ Fikstür oluşturuldu: **${roles[0].name} vs ${roles[1].name}**`
      );
    }

    /* ==============================================
       FİKSTÜR
    ============================================== */

    if (
      cmd === "fikstur" ||
      cmd === "fikstür"
    ) {
      if (!data.fixtures.length) {
        return message.reply(
          "📅 Henüz fikstür bulunmuyor."
        );
      }

      const lines =
        data.fixtures
          .filter(
            (f) => !f.started
          )
          .slice(0, 20)
          .map((f) => {
            const t1 =
              message.guild.roles.cache.get(
                f.team1
              );

            const t2 =
              message.guild.roles.cache.get(
                f.team2
              );

            return `⚽ **${t1?.name || "?"}** vs **${
              t2?.name || "?"
            }** — <t:${Math.floor(
              f.timestamp / 1000
            )}:F>`;
          });

      return message.reply(
        `📅 **AXERA LEAGUE | FİKSTÜR**\n\n${
          lines.join("\n") ||
          "Yaklaşan maç yok."
        }`
      );
    }

    /* ==============================================
       FİKSTÜR ÇIKAR
    ============================================== */

    if (
      cmd === "fiksturcikar" ||
      cmd === "fikstürçıkar"
    ) {
      if (!isSpeaker(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const roles =
        [...message.mentions.roles.values()];

      if (roles.length < 2) {
        return message.reply(
          "❌ İki takım etiketlemelisin."
        );
      }

      const before =
        data.fixtures.length;

      data.fixtures =
        data.fixtures.filter(
          (f) =>
            !(
              f.team1 === roles[0].id &&
              f.team2 === roles[1].id
            )
        );

      saveData();

      return message.reply(
        before === data.fixtures.length
          ? "❌ Böyle bir fikstür bulunamadı."
          : "✅ Fikstür kaldırıldı."
      );
    }

    /* ==============================================
       KUPA
    ============================================== */

    if (
      cmd === "kupaekle" ||
      cmd === "kupasil"
    ) {
      if (!isSpeaker(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const role =
        message.mentions.roles.first();

      const cupName =
        args
          .filter(
            (x) =>
              !x.startsWith("<@&")
          )
          .join(" ");

      if (!role || !cupName) {
        return message.reply(
          `❌ Kullanım: \`.${cmd} @Takım Kupa Adı\``
        );
      }

      if (!data.cups[role.id]) {
        data.cups[role.id] = [];
      }

      if (cmd === "kupaekle") {
        data.cups[role.id].push(
          cupName
        );

        saveData();

        return message.reply(
          `🏆 ${role.name} takımına **${cupName}** eklendi.`
        );
      }

      data.cups[role.id] =
        data.cups[role.id].filter(
          (x) =>
            normalize(x) !==
            normalize(cupName)
        );

      saveData();

      return message.reply(
        `🗑️ **${cupName}** kupası kaldırıldı.`
      );
    }

    if (
      cmd === "muze" ||
      cmd === "müze"
    ) {
      const role =
        message.mentions.roles.first();

      if (!role) {
        return message.reply(
          "❌ Kullanım: `.müze @Takım`"
        );
      }

      const cups =
        data.cups[role.id] || [];

      return message.reply(
        `🏛️ **${role.name} | MÜZE**\n\n${
          cups.length
            ? cups
                .map(
                  (cup) =>
                    `🏆 ${cup}`
                )
                .join("\n")
            : "Henüz kupa yok."
        }`
      );
    }

    /* ==============================================
       ROL PANELİ
    ============================================== */

    if (cmd === "rolpanel") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Bu paneli yalnızca Yönetici oluşturabilir."
        );
      }

      const row1 =
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(
              `ping_${IDS.pingRoles.PARTNER}`
            )
            .setLabel("Partner Ping")
            .setEmoji("🤝")
            .setStyle(
              ButtonStyle.Secondary
            ),

          new ButtonBuilder()
            .setCustomId(
              `ping_${IDS.pingRoles.MATCH}`
            )
            .setLabel("Maç Ping")
            .setEmoji("⚽")
            .setStyle(
              ButtonStyle.Secondary
            ),

          new ButtonBuilder()
            .setCustomId(
              `ping_${IDS.pingRoles.ANNOUNCEMENT}`
            )
            .setLabel("Duyuru Ping")
            .setEmoji("📢")
            .setStyle(
              ButtonStyle.Secondary
            )
        );

      const row2 =
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(
              `ping_${IDS.pingRoles.GIVEAWAY}`
            )
            .setLabel("Çekiliş Ping")
            .setEmoji("🎉")
            .setStyle(
              ButtonStyle.Secondary
            ),

          new ButtonBuilder()
            .setCustomId(
              `ping_${IDS.pingRoles.MEDIA}`
            )
            .setLabel("Medya Ping")
            .setEmoji("📰")
            .setStyle(
              ButtonStyle.Secondary
            )
        );

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(
              "🔔 Axera League | Rol Paneli"
            )
            .setDescription(
              "İstediğin bildirim rollerini aşağıdaki butonlardan alabilir veya kaldırabilirsin."
            ),
        ],
        components: [
          row1,
          row2,
        ],
      });
    }

    /* ==============================================
       ŞART
    ============================================== */

    if (
      cmd === "sart" ||
      cmd === "şart"
    ) {
      return message.reply(
        "📋 **AXERA LEAGUE | ŞARTLAR**\n\n" +
          "✓ **Kalıcı Tık:** Kalıcı 「✓」 kanalına tıklayınız.\n" +
          "🎭 **Rol Al:** Rol Al kanalından en az **2 rol** alınız.\n\n" +
          "ℹ️ Bu şartlar **zorunlu değildir**. Şartları yapmadan da Axera League sistemlerini kullanabilirsiniz."
      );
    }

    /* ==============================================
       TICKET PANEL
    ============================================== */

    if (cmd === "ticketpanel") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const row =
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(
              "create_ticket"
            )
            .setLabel(
              "Destek Talebi Oluştur"
            )
            .setEmoji("🎫")
            .setStyle(
              ButtonStyle.Primary
            )
        );

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(
              "🎫 Axera League Destek"
            )
            .setDescription(
              "Destek almak için aşağıdaki butona tıklayın."
            ),
        ],
        components: [row],
      });
    }

    /* ==============================================
       MODERASYON
    ============================================== */

    if (cmd === "sil") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
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
          "❌ 1-1000 arasında bir sayı gir."
        );
      }

      await message.channel.bulkDelete(
        amount + 1,
        true
      );

      return;
    }

    if (cmd === "embed") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const [title, ...description] =
        text.split("|");

      if (!title || !description.length) {
        return message.reply(
          "❌ Kullanım: `.embed Başlık | Açıklama`"
        );
      }

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(title.trim())
            .setDescription(
              description.join("|").trim()
            )
            .setTimestamp(),
        ],
      });
    }

    if (
      ["kick", "ban", "mute", "unmute"].includes(
        cmd
      )
    ) {
      if (!isModerator(message.member)) {
        return message.reply(
          "❌ Moderasyon yetkin yok."
        );
      }

      const target =
        message.mentions.members.first();

      if (!target) {
        return message.reply(
          `❌ Kullanım: \`.${cmd} @Oyuncu\``
        );
      }

      if (cmd === "kick") {
        await target.kick().catch(() => {});
        return message.reply(
          `👢 ${target.user.tag} sunucudan atıldı.`
        );
      }

      if (cmd === "ban") {
        await target.ban().catch(() => {});
        return message.reply(
          `🔨 ${target.user.tag} yasaklandı.`
        );
      }

      if (cmd === "mute") {
        const role =
          message.guild.roles.cache.find(
            (r) =>
              normalize(r.name) ===
              "muted"
          );

        if (!role) {
          return message.reply(
            "❌ `Muted` rolü bulunamadı."
          );
        }

        await target.roles.add(role);

        return message.reply(
          `🔇 ${target} susturuldu.`
        );
      }

      if (cmd === "unmute") {
        const role =
          message.guild.roles.cache.find(
            (r) =>
              normalize(r.name) ===
              "muted"
          );

        if (role) {
          await target.roles.remove(
            role
          );
        }

        return message.reply(
          `🔊 ${target} susturması kaldırıldı.`
        );
      }
    }

    /* ==============================================
       DM
    ============================================== */

    if (cmd === "dm") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Bu komutu yalnızca Yönetici kullanabilir."
        );
      }

      const target =
        message.mentions.members.first();

      if (!target || !text) {
        return message.reply(
          "❌ Kullanım: `.dm @Oyuncu mesaj`"
        );
      }

      const dmText =
        message.content
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
        await target.send(dmText);

        return message.reply(
          "✅ Mesaj başarıyla gönderildi."
        );
      } catch {
        return message.reply(
          "❌ Kullanıcıya DM gönderilemedi."
        );
      }
    }

    /* ==============================================
       TAKIM İSTATİSTİKLERİ
    ============================================== */

    if (cmd === "golkrali") {
      const players =
        Object.entries(data.stats)
          .map(([id, stats]) => ({
            id,
            goals: stats.goals || 0,
          }))
          .sort(
            (a, b) =>
              b.goals - a.goals
          )
          .slice(0, 10);

      const lines =
        players.map(
          (p, i) => {
            const member =
              message.guild.members.cache.get(
                p.id
              );

            return `${i + 1}. ${
              member
                ? member.displayName
                : p.id
            } — ⚽ ${p.goals}`;
          }
        );

      return message.reply(
        `⚽ **AXERA LEAGUE | GOL KRALI**\n\n${
          lines.join("\n") ||
          "Henüz veri yok."
        }`
      );
    }

    if (cmd === "asistkral") {
      const players =
        Object.entries(data.stats)
          .map(([id, stats]) => ({
            id,
            assists: stats.assists || 0,
          }))
          .sort(
            (a, b) =>
              b.assists - a.assists
          )
          .slice(0, 10);

      const lines =
        players.map(
          (p, i) => {
            const member =
              message.guild.members.cache.get(
                p.id
              );

            return `${i + 1}. ${
              member
                ? member.displayName
                : p.id
            } — 🎯 ${p.assists}`;
          }
        );

      return message.reply(
        `🎯 **AXERA LEAGUE | ASİST KRALI**\n\n${
          lines.join("\n") ||
          "Henüz veri yok."
        }`
      );
    }

    /* ==============================================
       ROL VER
    ============================================== */

    if (cmd === "rolver") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const role =
        message.mentions.roles.first();

      const member =
        message.mentions.members.at(1);

      if (!role || !member) {
        return message.reply(
          "❌ Kullanım: `.rolver @Rol @Oyuncu`"
        );
      }

      await member.roles.add(role);

      return message.reply(
        `✅ ${role} rolü ${member} kullanıcısına verildi.`
      );
    }

    /* ==============================================
       YARDIM
    ============================================== */

    if (
      cmd === "yardim" ||
      cmd === "yardım"
    ) {
      const embed =
        new EmbedBuilder()
          .setTitle(
            "🤖 AXERA LEAGUE | KOMUTLAR"
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
              "`.ant` / `.antrenman`",
              "`.pen` / `.penaltı`",
              "`.tweet mesaj`",
              "",
              "**⚽ Takım**",
              "`.takımekle @Takım`",
              "`.takımkaldır @Takım`",
              "`.takımdeğer @Takım 850M`",
              "`.puan`",
              "`.puanekle @Takım 3`",
              "`.kadro @Takım`",
              "`.kadroekle @Takım @Oyuncu Pozisyon`",
              "`.kadrocikar @Takım @Oyuncu`",
              "`.formasyon @Takım`",
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
              "**📊 İstatistik**",
              "`.golkrali`",
              "`.asistkral`",
              "",
              "**🎫 Destek**",
              "`.ticketpanel`",
              "",
              "**🔔 Roller**",
              "`.rolpanel`",
              "`.sart`",
              "",
              "**🤖 AI**",
              "`.ai soru`",
              "`.yapayzeka soru`",
              "AI kanalında komutsuz konuşma",
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
    console.error("Mesaj komutu hatası:", err);

    if (!message.deleted) {
      await message
        .reply(
          "❌ İşlem sırasında bir hata oluştu."
        )
        .catch(() => {});
    }
  }
});

/* =========================================================
   TICKET BUTONU — ayrı güvenli handler
========================================================= */

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  if (
    interaction.customId ===
    "create_ticket"
  ) {
    await createTicket(
      interaction.message
    ).catch(async (err) => {
      console.error(
        "Ticket oluşturma hatası:",
        err
      );

      if (!interaction.replied) {
        await interaction.reply({
          content:
            "❌ Ticket oluşturulurken hata oluştu.",
          ephemeral: true,
        });
      }
    });
  }
});

/* =========================================================
   TICKET MESAJ TAKİBİ
========================================================= */

client.on("messageCreate", (message) => {
  if (!message.guild) return;

  const ticket =
    data.tickets[message.channel.id];

  if (!ticket || !ticket.open) return;

  ticket.lastMessage = Date.now();
  saveData();
});

/* =========================================================
   LOGIN
========================================================= */

if (!process.env.TOKEN) {
  console.error(
    "❌ TOKEN Railway Variables içinde bulunamadı."
  );
  process.exit(1);
}

client.login(process.env.TOKEN);
