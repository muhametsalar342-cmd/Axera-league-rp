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
  PermissionsBitField,
  ChannelType
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

/* =========================================================
   AXERA LEAGUE
   TEK PARÇA DISCORD BOTU
   Discord.js v14
   Node.js 22+
   ========================================================= */

const TOKEN = process.env.TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/* =========================
   IDLER
   ========================= */

const ROLE = {
  ADMIN: "1534455282426445897",
  REGISTER: "1534456315366342716",
  VALUE: "1534456192913375382",
  UNREGISTERED: "1534457560134844517",
  PLAYER: "1534457228986421278",
  TD: "1534456648930693120",
  MEMBER: "1534457460163608636",
  MOD: "1534456108415189063",
  COMMENTATOR: "1535251168169697390",

  MEDIA_PING: "1547393966553440346",
  PARTNER_PING: "1547393545827123230",
  MATCH_PING: "1547393416755941509",
  ANNOUNCE_PING: "1547393331297001522",
  GIVEAWAY_PING: "1545116885589430312"
};

const CHANNEL = {
  REGISTER: "1547371376355053599",
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

const openai = OPENAI_API_KEY
  ? new OpenAI({ apiKey: OPENAI_API_KEY })
  : null;

const AI_MODEL = "gpt-5.6-luna";

const aiMemory = new Map();

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
  matchHistory: []
};

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(DEFAULT_DATA, null, 2)
      );
      return structuredClone(DEFAULT_DATA);
    }

    const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

    return {
      ...structuredClone(DEFAULT_DATA),
      ...raw
    };
  } catch (err) {
    console.error("DATA LOAD ERROR:", err);

    try {
      fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(DEFAULT_DATA, null, 2)
      );
    } catch {}

    return structuredClone(DEFAULT_DATA);
  }
}

let data = loadData();

function saveData() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(data, null, 2)
    );
  } catch (err) {
    console.error("DATA SAVE ERROR:", err);
  }
}

/* =========================
   HELPERS
   ========================= */

function isAdmin(member) {
  return !!member &&
    (
      member.roles.cache.has(ROLE.ADMIN) ||
      member.permissions.has(PermissionsBitField.Flags.Administrator)
    );
}

function hasRole(member, roleId) {
  return !!member && member.roles.cache.has(roleId);
}

function isValueStaff(member) {
  return isAdmin(member) || hasRole(member, ROLE.VALUE);
}

function isCommentator(member) {
  return (
    isAdmin(member) ||
    hasRole(member, ROLE.COMMENTATOR)
  );
}

function isModerator(member) {
  return (
    isAdmin(member) ||
    hasRole(member, ROLE.MOD)
  );
}

function memberIsRegistered(member) {
  if (!member) return false;

  return (
    !member.roles.cache.has(ROLE.UNREGISTERED) &&
    (
      member.roles.cache.has(ROLE.PLAYER) ||
      member.roles.cache.has(ROLE.TD) ||
      member.roles.cache.has(ROLE.MEMBER)
    )
  );
}

function cleanMention(str) {
  return String(str || "")
    .replace(/^<@!?(\d+)>\s*/, "")
    .trim();
}

function getUser(userId) {
  if (!data.users[userId]) {
    data.users[userId] = {
      value: 0,
      role: null,
      training: 0,
      stats: {
        goals: 0,
        assists: 0,
        matches: 0
      }
    };
  }

  if (!data.users[userId].stats) {
    data.users[userId].stats = {
      goals: 0,
      assists: 0,
      matches: 0
    };
  }

  return data.users[userId];
}

function parseMAmount(text) {
  if (!text) return null;

  const value = String(text)
    .trim()
    .toUpperCase()
    .replace(/€/g, "")
    .replace(/M/g, "");

  if (!/^\d+(\.\d+)?$/.test(value)) {
    return null;
  }

  const num = Number(value);

  if (!Number.isFinite(num) || num <= 0) {
    return null;
  }

  return num;
}

function getValue(userId) {
  return Number(getUser(userId).value || 0);
}

function setValue(userId, amount) {
  const user = getUser(userId);

  user.value = Math.max(
    0,
    Math.min(1000, Number(amount))
  );

  return user.value;
}

function addValue(userId, amount) {
  return setValue(
    userId,
    getValue(userId) + Number(amount)
  );
}

function getNicknameValue(nickname) {
  if (!nickname) return null;

  const match = nickname.match(/(\d+(?:\.\d+)?)M€\s*$/i);

  if (!match) return null;

  return {
    amount: Number(match[1]),
    index: match.index,
    full: match[0]
  };
}

async function syncNicknameValue(member) {
  if (!member || member.user.bot) return;

  const user = getUser(member.id);
  const nick = member.nickname || member.user.username;

  const parsed = getNicknameValue(nick);

  if (!parsed) return;

  const amount = Math.max(
    0,
    Math.min(1000, Number(user.value))
  );

  const newNick =
    nick.slice(0, parsed.index) +
    `${amount}M€`;

  if (newNick !== nick) {
    try {
      await member.setNickname(newNick);
    } catch {}
  }
}

function formatValue(value) {
  return `${Number(value || 0).toLocaleString("tr-TR")}M€`;
}

function teamFromRole(guild, roleId) {
  return guild.roles.cache.get(roleId) || null;
}

function getTeamPlayers(guild, teamRoleId) {
  return guild.members.cache.filter(
    m =>
      !m.user.bot &&
      m.roles.cache.has(teamRoleId)
  );
}

function ensureStandings(teamId) {
  if (!data.standings[teamId]) {
    data.standings[teamId] = {
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0
    };
  }

  return data.standings[teamId];
}

function ensureTeam(teamId, name) {
  if (!data.teams[teamId]) {
    data.teams[teamId] = {
      id: teamId,
      name,
      value: 0,
      squad: {},
      formation: "4-3-3"
    };
  }

  if (!data.teams[teamId].squad) {
    data.teams[teamId].squad = {};
  }

  ensureStandings(teamId);

  return data.teams[teamId];
}

function positionLabel(position) {
  const map = {
    GK: "🧤 Kaleci",
    DEF: "🛡️ Defans",
    MID: "🎯 Orta Saha",
    ATT: "⚡ Forvet"
  };

  return map[position] || position || "Belirsiz";
}

function splitArgs(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

async function sendError(message, text) {
  return message.reply({
    content: `❌ ${text}`
  });
}

async function sendSuccess(message, text) {
  return message.reply({
    content: `✅ ${text}`
  });
}

function channelOnly(message, channelId) {
  return message.channel.id === channelId;
}

/* =========================
   REGISTRATION
   ========================= */

async function registrationPanel(message, target, nickname) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`register_player_${target.id}`)
      .setLabel("Futbolcu")
      .setEmoji("⚽")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`register_member_${target.id}`)
      .setLabel("Üye")
      .setEmoji("👤")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`register_td_${target.id}`)
      .setLabel("Teknik Direktör")
      .setEmoji("🧑‍💼")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`register_gk_${target.id}`)
      .setLabel("Kaleci")
      .setEmoji("🧤")
      .setStyle(ButtonStyle.Primary)
  );

  const embed = new EmbedBuilder()
    .setTitle("📋 Axera League Kayıt")
    .setDescription(
      `**Oyuncu:** ${target}\n` +
      `**İsim:** ${nickname}\n\n` +
      `Aşağıdaki butonlardan kayıt türünü seçin.`
    )
    .setFooter({
      text: "Axera League"
    })
    .setTimestamp();

  const msg = await message.channel.send({
    embeds: [embed],
    components: [row]
  });

  data.registrationPanels[msg.id] = {
    targetId: target.id,
    nickname
  };

  saveData();
}

/* =========================
   TICKET
   ========================= */

async function createTicket(interaction) {
  const guild = interaction.guild;
  const user = interaction.user;

  const existing = Object.values(data.tickets).find(
    t =>
      t.guildId === guild.id &&
      t.userId === user.id &&
      t.open
  );

  if (existing) {
    return interaction.reply({
      content: `❌ Zaten açık bir destek talebin var: <#${existing.channelId}>`,
      ephemeral: true
    });
  }

  const channel = await guild.channels.create({
    name: `ticket-${user.username}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 80),
    type: ChannelType.GuildText,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      {
        id: user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      },
      {
        id: ROLE.MOD,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      }
    ]
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_close")
      .setLabel("Bileti Kapat")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({
    content: `${user} <@&${ROLE.MOD}>`,
    embeds: [
      new EmbedBuilder()
        .setTitle("🎫 Destek Talebi")
        .setDescription(
          "Yetkililer en kısa sürede ilgilenecektir.\n\n" +
          "Bileti kapatmak için aşağıdaki butonu kullanabilirsiniz."
        )
        .setTimestamp()
    ],
    components: [row]
  });

  data.tickets[channel.id] = {
    guildId: guild.id,
    userId: user.id,
    channelId: channel.id,
    open: true,
    lastMessage: Date.now()
  };

  saveData();

  await interaction.reply({
    content: `✅ Destek talebin oluşturuldu: ${channel}`,
    ephemeral: true
  });
}

async function ticketPanel(message) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_create")
      .setLabel("Destek Talebi Oluştur")
      .setEmoji("🎫")
      .setStyle(ButtonStyle.Primary)
  );

  await message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("🎫 Axera League Destek")
        .setDescription(
          "Destek almak için aşağıdaki butona basabilirsiniz."
        )
        .setTimestamp()
    ],
    components: [row]
  });
}

/* =========================
   ROLE PANEL
   ========================= */

async function rolePanel(message) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pingrole_${ROLE.PARTNER_PING}`)
      .setLabel("Partner Ping")
      .setEmoji("🤝")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`pingrole_${ROLE.MATCH_PING}`)
      .setLabel("Maç Ping")
      .setEmoji("⚽")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`pingrole_${ROLE.ANNOUNCE_PING}`)
      .setLabel("Duyuru Ping")
      .setEmoji("📢")
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pingrole_${ROLE.GIVEAWAY_PING}`)
      .setLabel("Çekiliş Ping")
      .setEmoji("🎉")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`pingrole_${ROLE.MEDIA_PING}`)
      .setLabel("Medya Ping")
      .setEmoji("📰")
      .setStyle(ButtonStyle.Secondary)
  );

  await message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("🔔 Bildirim Rolleri")
        .setDescription(
          "İstediğin bildirim rollerini butonlardan alıp kaldırabilirsin."
        )
        .setTimestamp()
    ],
    components: [row1, row2]
  });
}

/* =========================
   AI
   ========================= */

function aiKey(message) {
  return `${message.guild?.id || "dm"}:${message.author.id}`;
}

async function askAxera(message, prompt) {
  if (!openai) {
    return message.reply(
      "❌ AI sistemi hazır değil. Railway'de `OPENAI_API_KEY` değişkenini ekle."
    );
  }

  const key = aiKey(message);

  let history = aiMemory.get(key) || [];

  history.push({
    role: "user",
    content: String(prompt).slice(0, 4000)
  });

  if (history.length > 10) {
    history = history.slice(-10);
  }

  const creatorRule =
    /seni kim kurdu|kim kurdu|kuruc(?:un|u)/i.test(prompt)
      ? "Kullanıcı sana seni kimin kurduğunu sorarsa kesinlikle: Lynox9380 kurdu. de."
      : "";

  try {
    const response = await openai.responses.create({
      model: AI_MODEL,
      instructions:
        "Sen Axera adlı Discord futbol RP botunun yapay zekasısın. " +
        "Türkçe, kısa ve yardımcı cevaplar ver. " +
        "Sunucunun adı Axera League. " +
        creatorRule +
        " Discord sunucusunda ban, kick, rol silme, kanal silme gibi yönetici işlemlerini " +
        "serbest metinle kendin gerçekleştirme; kullanıcıya ilgili komutu söyle. " +
        "Kullanıcı senden tehlikeli, yasa dışı veya yaşa uygun olmayan şeyler isterse yardımcı olma.",
      input: history
    });

    const answer =
      response.output_text?.trim() ||
      "Üzgünüm, şu anda cevap oluşturamadım.";

    history.push({
      role: "assistant",
      content: answer
    });

    if (history.length > 10) {
      history = history.slice(-10);
    }

    aiMemory.set(key, history);

    const chunks = [];

    for (let i = 0; i < answer.length; i += 1900) {
      chunks.push(answer.slice(i, i + 1900));
    }

    for (const chunk of chunks) {
      await message.reply(chunk);
    }
  } catch (err) {
    console.error("OPENAI ERROR:", err);

    const apiMessage =
      err?.error?.message ||
      err?.message ||
      "Bilinmeyen AI hatası";

    await message.reply(
      `❌ Axera AI şu anda cevap veremedi.\n\`${apiMessage.slice(0, 500)}\``
    );
  }
}

/* =========================
   MATCH ENGINE
   ========================= */

const matchIntervals = new Map();

function choosePlayer(guild, roleId) {
  const players = [...getTeamPlayers(guild, roleId).values()];

  if (!players.length) return null;

  return players[Math.floor(Math.random() * players.length)];
}

function teamStrength(guild, roleId) {
  const team = data.teams[roleId];

  if (team && team.value > 0) {
    return Number(team.value);
  }

  const players = getTeamPlayers(guild, roleId);

  let total = 0;

  for (const member of players.values()) {
    total += getValue(member.id);
  }

  return total;
}

function addMatchStat(userId, type) {
  const user = getUser(userId);

  if (!user.stats) {
    user.stats = {
      goals: 0,
      assists: 0,
      matches: 0
    };
  }

  user.stats[type] =
    Number(user.stats[type] || 0) + 1;
}

function ensureReward(matchId, userId) {
  if (!data.matchRewards[matchId]) {
    data.matchRewards[matchId] = {};
  }

  if (data.matchRewards[matchId][userId]) {
    return false;
  }

  data.matchRewards[matchId][userId] = true;
  return true;
}

async function finishMatch(guild, matchId) {
  const match = data.activeMatches[matchId];

  if (!match) return;

  if (matchIntervals.has(matchId)) {
    clearInterval(matchIntervals.get(matchId));
    matchIntervals.delete(matchId);
  }

  const s1 = ensureStandings(match.team1);
  const s2 = ensureStandings(match.team2);

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

  const participants = new Set([
    ...getTeamPlayers(guild, match.team1).map(m => m.id),
    ...getTeamPlayers(guild, match.team2).map(m => m.id)
  ]);

  for (const userId of participants) {
    if (ensureReward(matchId, userId)) {
      addValue(userId, 5);

      const member = await guild.members
        .fetch(userId)
        .catch(() => null);

      if (member) {
        await syncNicknameValue(member);
      }

      addMatchStat(userId, "matches");
    }
  }

  const channel =
    guild.channels.cache.get(CHANNEL.MATCH);

  if (channel) {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("🏁 MAÇ SONA ERDİ")
          .setDescription(
            `**${match.team1Name} ${match.score1} - ${match.score2} ${match.team2Name}**`
          )
          .addFields(
            {
              name: "⏱️ Süre",
              value: "90 dakika",
              inline: true
            },
            {
              name: "💰 Katılım ödülü",
              value: "+5M€",
              inline: true
            }
          )
          .setTimestamp()
      ]
    });
  }

  data.matchHistory.push({
    ...match,
    finishedAt: Date.now()
  });

  delete data.activeMatches[matchId];

  saveData();
}

async function startMatch(guild, team1, team2) {
  if (!team1 || !team2) return null;

  const matchId =
    `${team1.id}-${team2.id}-${Date.now()}`;

  const match = {
    id: matchId,
    team1: team1.id,
    team2: team2.id,
    team1Name: team1.name,
    team2Name: team2.name,
    score1: 0,
    score2: 0,
    minute: 0,
    events: [],
    startedAt: Date.now()
  };

  data.activeMatches[matchId] = match;
  saveData();

  const channel =
    guild.channels.cache.get(CHANNEL.MATCH);

  if (!channel) return matchId;

  const embed = new EmbedBuilder()
    .setTitle("⚽ CANLI MAÇ")
    .setDescription(
      `**${team1.name} 0 - 0 ${team2.name}**`
    )
    .addFields({
      name: "⏱️ Dakika",
      value: "0'",
      inline: true
    })
    .setFooter({
      text: "Axera League"
    })
    .setTimestamp();

  const msg = await channel.send({
    embeds: [embed]
  });

  const interval = setInterval(async () => {
    try {
      const current =
        data.activeMatches[matchId];

      if (!current) {
        clearInterval(interval);
        matchIntervals.delete(matchId);
        return;
      }

      current.minute++;

      if (current.minute >= 90) {
        await finishMatch(guild, matchId);
        return;
      }

      const strength1 =
        Math.max(1, teamStrength(guild, team1.id));

      const strength2 =
        Math.max(1, teamStrength(guild, team2.id));

      const total = strength1 + strength2;

      const eventChance = 0.28;

      if (Math.random() < eventChance) {
        const first =
          Math.random() < strength1 / total;

        const attackingTeam =
          first ? team1 : team2;

        const defendingTeam =
          first ? team2 : team1;

        const attacker =
          choosePlayer(guild, attackingTeam.id);

        const defender =
          choosePlayer(guild, defendingTeam.id);

        const roll = Math.random();

        if (roll < 0.16 && attacker) {
          if (first) current.score1++;
          else current.score2++;

          addValue(attacker.id, 2);
          addMatchStat(attacker.id, "goals");

          await syncNicknameValue(attacker);

          let assistText = "";

          const assist =
            choosePlayer(guild, attackingTeam.id);

          if (
            assist &&
            assist.id !== attacker.id &&
            Math.random() < 0.7
          ) {
            addValue(assist.id, 1);
            addMatchStat(assist.id, "assists");
            await syncNicknameValue(assist);

            assistText =
              ` ${assist.displayName} asist yaptı.`;
          }

          current.events.push(
            `${current.minute}' ⚽ ${attacker.displayName} gol attı!${assistText}`
          );
        } else if (roll < 0.38) {
          current.events.push(
            `${current.minute}' 🧤 ${defendingTeam.name} savunması atağı durdurdu.`
          );
        } else if (roll < 0.55) {
          current.events.push(
            `${current.minute}' 🎯 ${attackingTeam.name} şut çekti, top auta çıktı.`
          );
        } else if (roll < 0.7) {
          current.events.push(
            `${current.minute}' 🧤 ${defendingTeam.name} kalecisi kurtardı.`
          );
        } else {
          current.events.push(
            `${current.minute}' 🔥 ${attackingTeam.name} tehlikeli bir atak geliştirdi.`
          );
        }

        if (current.events.length > 5) {
          current.events.shift();
        }
      }

      const updated = new EmbedBuilder()
        .setTitle("⚽ CANLI MAÇ")
        .setDescription(
          `**${team1.name} ${current.score1} - ${current.score2} ${team2.name}**`
        )
        .addFields(
          {
            name: "⏱️ Dakika",
            value: `${current.minute}'`,
            inline: true
          },
          {
            name: "📋 Son Olaylar",
            value:
              current.events.length
                ? current.events.slice(-5).join("\n")
                : "Maç devam ediyor...",
            inline: false
          }
        )
        .setFooter({
          text: "Axera League • Canlı Maç"
        })
        .setTimestamp();

      await msg.edit({
        embeds: [updated]
      });

      saveData();
    } catch (err) {
      console.error("MATCH ERROR:", err);

      clearInterval(interval);
      matchIntervals.delete(matchId);

      delete data.activeMatches[matchId];
      saveData();
    }
  }, 3000);

  matchIntervals.set(matchId, interval);

  return matchId;
}

/* =========================
   STANDINGS
   ========================= */

async function sendStandings(message) {
  const rows = [];

  for (const [id, table] of Object.entries(data.standings)) {
    const role = message.guild.roles.cache.get(id);

    if (!role) continue;

    rows.push({
      id,
      name: role.name,
      ...table,
      gd: table.goalsFor - table.goalsAgainst
    });
  }

  rows.sort((a, b) =>
    b.points - a.points ||
    b.gd - a.gd ||
    b.goalsFor - a.goalsFor
  );

  if (!rows.length) {
    return sendError(
      message,
      "Henüz puan durumu bulunmuyor."
    );
  }

  const text = rows.map((r, i) =>
    `**${i + 1}. ${r.name}** — ${r.points} P | ${r.played} O | ${r.wins} G | ${r.draws} B | ${r.losses} M | ${r.goalsFor}-${r.goalsAgainst}`
  ).join("\n");

  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("🏆 Axera League Puan Durumu")
        .setDescription(text)
        .setTimestamp()
    ]
  });
}

/* =========================
   COMMAND HELP
   ========================= */

async function sendHelp(message) {
  const text = [
    "**👤 Kayıt**",
    "`.k @Oyuncu İsim`",
    "`.kayıtsızver @Oyuncu`",
    "`.ara Oyuncu`",
    "",
    "**💶 Değer**",
    "`.dver @Oyuncu 5M`",
    "`.dsil @Oyuncu 5M`",
    "`.değerler`",
    "",
    "**🏃 Oyuncu**",
    "`.ant` / `.antrenman`",
    "`.pen` / `.penaltı`",
    "`.tweet Mesaj`",
    "",
    "**⚽ Takım**",
    "`.takımekle @Takım`",
    "`.takımkaldır @Takım`",
    "`.takımdeğer @Takım 850M`",
    "`.kadroekle @Takım @Oyuncu Pozisyon`",
    "`.kadrocikar @Takım @Oyuncu`",
    "`.kadro @Takım`",
    "`.formasyon @Takım`",
    "`.puan`",
    "",
    "**📅 Fikstür**",
    "`.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`",
    "`.fikstür`",
    "`.fiksturcikar @Takım1 @Takım2`",
    "",
    "**⚽ Maç**",
    "`.maç @Takım1 @Takım2`",
    "",
    "**🏆 Kupa / Müze**",
    "`.kupaekle @Takım Kupa`",
    "`.kupasil @Takım Kupa`",
    "`.müze @Takım`",
    "",
    "**🎫 Destek**",
    "`.ticketpanel`",
    "",
    "**🔔 Roller**",
    "`.rolpanel`",
    "`.şart`",
    "",
    "**🤖 AI**",
    "`.ai soru`",
    "`.yapayzeka soru`",
    "",
    "**🛡️ Moderasyon**",
    "`.sil 10`",
    "`.embed Başlık | Açıklama`",
    "`.kick @Oyuncu`",
    "`.ban @Oyuncu`",
    "`.mute @Oyuncu`",
    "`.unmute @Oyuncu`",
    "`.dm @Oyuncu mesaj`"
  ].join("\n");

  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("📚 Axera League Komutları")
        .setDescription(text)
        .setFooter({
          text: "Axera League"
        })
    ]
  });
}

/* =========================
   MESSAGE CREATE
   ========================= */

client.on("messageCreate", async message => {
  if (!message.guild) return;
  if (message.author.bot) return;

  try {
    if (data.tickets[message.channel.id]) {
      data.tickets[message.channel.id].lastMessage =
        Date.now();

      saveData();
    }

    /* AI CHANNEL */
    if (
      message.channel.id === CHANNEL.AI &&
      !message.content.startsWith(".")
    ) {
      await askAxera(message, message.content);
      return;
    }

    if (!message.content.startsWith(".")) {
      return;
    }

    const raw = message.content.slice(1).trim();

    if (!raw) return;

    const parts = splitArgs(raw);
    const command = parts.shift().toLowerCase();

    /* HELP */

    if (
      command === "yardım" ||
      command === "yardim" ||
      command === "help"
    ) {
      return sendHelp(message);
    }

    /* AI COMMAND */

    if (
      command === "ai" ||
      command === "yapayzeka"
    ) {
      const prompt = raw
        .replace(/^(ai|yapayzeka)\s*/i, "")
        .trim();

      if (!prompt) {
        return sendError(
          message,
          "Örnek: `.ai Axera League nedir?`"
        );
      }

      return askAxera(message, prompt);
    }

    /* PING */

    if (command === "ping") {
      return message.reply(
        `🏓 Pong! ${client.ws.ping}ms`
      );
    }

    /* CONDITIONS */

    if (
      command === "şart" ||
      command === "sart"
    ) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("📋 Sunucu Şartları")
            .setDescription(
              "✓ Kalıcı Tık: Kalıcı 「✓」 kanalına tıklayınız.\n" +
              "🎭 Rol Al: Rol Al kanalından en az 2 rol alınız.\n\n" +
              "Bu şartlar sistem kullanımını zorunlu olarak kısıtlamaz."
            )
        ]
      });
    }

    /* REGISTRATION */

    if (command === "k") {
      if (
        !channelOnly(message, CHANNEL.REGISTER)
      ) {
        return sendError(
          message,
          "Bu komut yalnızca kayıt kanalında kullanılabilir."
        );
      }

      if (
        !isAdmin(message.member) &&
        !hasRole(message.member, ROLE.REGISTER)
      ) {
        return sendError(
          message,
          "Bu komutu kullanma yetkin yok."
        );
      }

      const target = message.mentions.members.first();

      if (!target) {
        return sendError(
          message,
          "Kullanım: `.k @Oyuncu İsim`"
        );
      }

      const nickname = cleanMention(
        message.content.replace(/^\.k\s+/i, "")
      );

      if (!nickname) {
        return sendError(
          message,
          "Kayıt isminden sonra isim yazmalısın."
        );
      }

      return registrationPanel(
        message,
        target,
        nickname
      );
    }

    if (
      command === "kayıtsızver" ||
      command === "kayitsizver"
    ) {
      if (
        !isAdmin(message.member) &&
        !hasRole(message.member, ROLE.REGISTER)
      ) {
        return sendError(
          message,
          "Bu komutu kullanma yetkin yok."
        );
      }

      const target =
        message.mentions.members.first();

      if (!target) {
        return sendError(
          message,
          "Kullanım: `.kayıtsızver @Oyuncu`"
        );
      }

      for (const roleId of [
        ROLE.PLAYER,
        ROLE.TD,
        ROLE.MEMBER
      ]) {
        await target.roles.remove(roleId).catch(() => {});
      }

      await target.roles.add(
        ROLE.UNREGISTERED
      ).catch(() => {});

      return sendSuccess(
        message,
        `${target} kayıtsız rolüne alındı.`
      );
    }

    /* SEARCH */

    if (command === "ara") {
      if (!memberIsRegistered(message.member)) {
        return sendError(
          message,
          "Bu komutu yalnızca kayıtlı üyeler kullanabilir."
        );
      }

      const query =
        parts.join(" ").toLowerCase().trim();

      if (!query) {
        return sendError(
          message,
          "Kullanım: `.ara Oyuncu`"
        );
      }

      const results = [];

      for (const member of message.guild.members.cache.values()) {
        if (member.user.bot) continue;
        if (!memberIsRegistered(member)) continue;

        const fields = [
          member.displayName,
          member.nickname || "",
          member.user.username
        ].map(x => x.toLowerCase());

        let score = 0;

        if (fields.includes(query)) score = 100;
        else if (fields.some(x => x.startsWith(query))) score = 80;
        else if (fields.some(x => x.includes(query))) score = 60;

        if (score > 0) {
          results.push({
            member,
            score
          });
        }
      }

      results.sort((a, b) => b.score - a.score);

      if (!results.length) {
        return sendError(
          message,
          "Bu isimde veya benzer isimde kayıtlı oyuncu bulunamadı."
        );
      }

      const text = results
        .slice(0, 15)
        .map((r, i) =>
          `**${i + 1}. ${r.member.displayName}** — ${formatValue(getValue(r.member.id))}`
        )
        .join("\n");

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🔎 Oyuncu Arama")
            .setDescription(text)
        ]
      });
    }

    /* VALUE */

    if (
      command === "dver" ||
      command === "dsil"
    ) {
      if (!isValueStaff(message.member)) {
        return sendError(
          message,
          "Bu komutu yalnızca Değer Yetkilisi kullanabilir."
        );
      }

      if (
        !channelOnly(message, CHANNEL.VALUE)
      ) {
        return sendError(
          message,
          "Bu komut yalnızca değer kanalında kullanılabilir."
        );
      }

      const target =
        message.mentions.members.first();

      const amount =
        parseMAmount(parts[parts.length - 1]);

      if (!target || !amount) {
        return sendError(
          message,
          `Kullanım: \`.${command} @Oyuncu 5M\``
        );
      }

      const oldValue = getValue(target.id);

      let newValue;

      if (command === "dver") {
        newValue = Math.min(
          1000,
          oldValue + amount
        );
      } else {
        newValue = Math.max(
          0,
          oldValue - amount
        );
      }

      setValue(target.id, newValue);

      await syncNicknameValue(target);

      saveData();

      return sendSuccess(
        message,
        `${target} değeri **${formatValue(oldValue)} → ${formatValue(newValue)}** oldu.`
      );
    }

    if (
      command === "değerler" ||
      command === "degerler"
    ) {
      const rows = [];

      for (const member of message.guild.members.cache.values()) {
        if (member.user.bot) continue;
        if (!memberIsRegistered(member)) continue;

        rows.push({
          name: member.displayName,
          value: getValue(member.id)
        });
      }

      rows.sort((a, b) => b.value - a.value);

      const text =
        rows.slice(0, 30).map(
          (x, i) =>
            `**${i + 1}. ${x.name}** — ${formatValue(x.value)}`
        ).join("\n") ||
        "Henüz oyuncu yok.";

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("💶 Axera League Değerler")
            .setDescription(text)
        ]
      });
    }

    /* TRAINING */

    if (
      command === "ant" ||
      command === "antrenman"
    ) {
      if (
        !channelOnly(
          message,
          CHANNEL.TRAINING
        )
      ) {
        return sendError(
          message,
          "Antrenman komutu yalnızca antrenman kanalında kullanılabilir."
        );
      }

      const user = getUser(message.author.id);

      user.training =
        Number(user.training || 0) + 1;

      if (user.training >= 5) {
        user.training = 0;

        addValue(message.author.id, 3);

        await syncNicknameValue(
          message.member
        );

        saveData();

        return message.reply(
          "🏋️ **Antrenman tamamlandı!**\n" +
          "📈 Antrenman: **0/5**\n" +
          "💶 Ödül: **+3M€**"
        );
      }

      saveData();

      return message.reply(
        `🏋️ Antrenman yapıldı!\n📈 İlerleme: **${user.training}/5**`
      );
    }

    /* PENALTY */

    if (
      command === "pen" ||
      command === "penaltı" ||
      command === "penalti"
    ) {
      if (
        !channelOnly(
          message,
          CHANNEL.PENALTY
        )
      ) {
        return sendError(
          message,
          "Penaltı komutu yalnızca penaltı kanalında kullanılabilir."
        );
      }

      const roll = Math.random();

      if (roll < 0.5) {
        addValue(message.author.id, 5);

        await syncNicknameValue(
          message.member
        );

        saveData();

        return message.reply(
          "⚽ **GOOOL!**\n" +
          "🧤 Axera Kalecisi topu çıkaramadı!\n" +
          "💶 Ödül: **+5M€**"
        );
      }

      if (roll < 0.75) {
        return message.reply(
          "⚽ **DİREK!**\n" +
          "Top direkten döndü."
        );
      }

      return message.reply(
        "🧤 **KURTARDI!**\n" +
        "Axera Kalecisi penaltıyı çıkardı."
      );
    }

    /* TWEET */

    if (command === "tweet") {
      if (
        !channelOnly(
          message,
          CHANNEL.TWEET
        )
      ) {
        return sendError(
          message,
          "Tweet komutu yalnızca tweet kanalında kullanılabilir."
        );
      }

      const text = raw
        .replace(/^tweet\s*/i, "")
        .trim();

      if (!text) {
        return sendError(
          message,
          "Tweet metni yazmalısın."
        );
      }

      const last =
        Number(data.tweetCooldowns[message.author.id] || 0);

      if (
        Date.now() - last <
        24 * 60 * 60 * 1000
      ) {
        return sendError(
          message,
          "24 saat içinde zaten tweet ödülü aldın."
        );
      }

      data.tweetCooldowns[message.author.id] =
        Date.now();

      addValue(message.author.id, 5);

      await syncNicknameValue(
        message.member
      );

      await message.delete().catch(() => {});

      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setAuthor({
              name: message.member.displayName,
              iconURL:
                message.author.displayAvatarURL()
            })
            .setDescription(text)
            .setFooter({
              text: "Axera League Tweet"
            })
            .setTimestamp()
        ]
      });

      saveData();
      return;
    }

    /* TEAM ADD */

    if (command === "takımekle") {
      if (!isCommentator(message.member)) {
        return sendError(
          message,
          "Bu komutu yalnızca Spiker veya Yönetici kullanabilir."
        );
      }

      const role =
        message.mentions.roles.first();

      if (!role) {
        return sendError(
          message,
          "Kullanım: `.takımekle @Takım`"
        );
      }

      ensureTeam(
        role.id,
        role.name
      );

      saveData();

      return sendSuccess(
        message,
        `${role} takımı sisteme eklendi.`
      );
    }

    /* TEAM REMOVE */

    if (
      command === "takımkaldır" ||
      command === "takimkaldir"
    ) {
      if (!isCommentator(message.member)) {
        return sendError(
          message,
          "Bu komutu kullanma yetkin yok."
        );
      }

      const role =
        message.mentions.roles.first();

      if (!role) {
        return sendError(
          message,
          "Takım rolünü etiketle."
        );
      }

      const active =
        Object.values(data.activeMatches)
          .some(
            m =>
              m.team1 === role.id ||
              m.team2 === role.id
          );

      if (active) {
        return sendError(
          message,
          "Aktif maç varken takım kaldırılamaz."
        );
      }

      delete data.teams[role.id];
      delete data.standings[role.id];
      delete data.formations[role.id];

      for (const key of Object.keys(data.cups)) {
        if (key === role.id) {
          delete data.cups[key];
        }
      }

      saveData();

      return sendSuccess(
        message,
        `${role} takım sistemi kaldırıldı.`
      );
    }

    /* TEAM VALUE */

    if (
      command === "takımdeğer" ||
      command === "takimdeger"
    ) {
      if (!isCommentator(message.member)) {
        return sendError(
          message,
          "Bu komutu kullanma yetkin yok."
        );
      }

      const role =
        message.mentions.roles.first();

      const amount =
        parseMAmount(parts[parts.length - 1]);

      if (!role || !amount) {
        return sendError(
          message,
          "Kullanım: `.takımdeğer @Takım 850M`"
        );
      }

      const team =
        ensureTeam(role.id, role.name);

      team.value =
        Math.min(10000, amount);

      saveData();

      return sendSuccess(
        message,
        `${role} takım değeri **${formatValue(team.value)}** oldu.`
      );
    }

    /* SQUAD ADD */

    if (
      command === "kadroekle"
    ) {
      if (!isCommentator(message.member)) {
        return sendError(
          message,
          "Bu komutu kullanma yetkin yok."
        );
      }

      const roles =
        message.mentions.roles;

      const members =
        message.mentions.members;

      const team =
        roles.first();

      const player =
        members.first();

      const position =
        parts[parts.length - 1]?.toUpperCase();

      if (
        !team ||
        !player ||
        !["GK", "DEF", "MID", "ATT"].includes(position)
      ) {
        return sendError(
          message,
          "Kullanım: `.kadroekle @Takım @Oyuncu GK/DEF/MID/ATT`"
        );
      }

      const t =
        ensureTeam(
          team.id,
          team.name
        );

      t.squad[player.id] = {
        position
      };

      saveData();

      return sendSuccess(
        message,
        `${player} ${team} kadrosuna ${positionLabel(position)} olarak eklendi.`
      );
    }

    /* SQUAD REMOVE */

    if (
      command === "kadrocikar" ||
      command === "kadroçıkar"
    ) {
      if (!isCommentator(message.member)) {
        return sendError(
          message,
          "Bu komutu kullanma yetkin yok."
        );
      }

      const team =
        message.mentions.roles.first();

      const player =
        message.mentions.members.first();

      if (!team || !player) {
        return sendError(
          message,
          "Kullanım: `.kadrocikar @Takım @Oyuncu`"
        );
      }

      const t =
        ensureTeam(
          team.id,
          team.name
        );

      delete t.squad[player.id];

      saveData();

      return sendSuccess(
        message,
        `${player} kadrodan çıkarıldı.`
      );
    }

    /* SQUAD */

    if (command === "kadro") {
      const team =
        message.mentions.roles.first();

      if (!team) {
        return sendError(
          message,
          "Kullanım: `.kadro @Takım`"
        );
      }

      const t =
        data.teams[team.id];

      if (!t) {
        return sendError(
          message,
          "Bu takım sisteme kayıtlı değil."
        );
      }

      const groups = {
        GK: [],
        DEF: [],
        MID: [],
        ATT: []
      };

      for (const [userId, info] of Object.entries(
        t.squad || {}
      )) {
        const member =
          await message.guild.members
            .fetch(userId)
            .catch(() => null);

        if (!member) continue;

        if (!groups[info.position]) {
          groups[info.position] = [];
        }

        groups[info.position].push(
          `${member.displayName} — ${formatValue(getValue(userId))}`
        );
      }

      const text = [
        `**🧤 Kaleci**\n${groups.GK.join("\n") || "Yok"}`,
        `**🛡️ Defans**\n${groups.DEF.join("\n") || "Yok"}`,
        `**🎯 Orta Saha**\n${groups.MID.join("\n") || "Yok"}`,
        `**⚡ Forvet**\n${groups.ATT.join("\n") || "Yok"}`
      ].join("\n\n");

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`👥 ${team.name} Kadrosu`)
            .setDescription(text)
            .addFields({
              name: "💶 Takım Değeri",
              value: formatValue(t.value),
              inline: true
            })
        ]
      });
    }

    /* FORMATION */

    if (command === "formasyon") {
      if (!isCommentator(message.member)) {
        return sendError(
          message,
          "Bu komutu yalnızca Spiker veya Yönetici kullanabilir."
        );
      }

      const team =
        message.mentions.roles.first();

      if (!team) {
        return sendError(
          message,
          "Takımı etiketle."
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
          .setCustomId(`formation_${team.id}`)
          .setPlaceholder("Formasyon seç")
          .addOptions(
            formations.map(x => ({
              label: x,
              value: x
            }))
          );

      return message.reply({
        components: [
          new ActionRowBuilder().addComponents(menu)
        ]
      });
    }

    /* POINT ADD */

    if (command === "puanekle") {
      if (!isCommentator(message.member)) {
        return sendError(
          message,
          "Bu komutu kullanma yetkin yok."
        );
      }

      const team =
        message.mentions.roles.first();

      const amount =
        Number(parts[parts.length - 1]);

      if (!team || !Number.isInteger(amount)) {
        return sendError(
          message,
          "Kullanım: `.puanekle @Takım 3`"
        );
      }

      const table =
        ensureStandings(team.id);

      table.points += amount;

      saveData();

      return sendSuccess(
        message,
        `${team} puanına ${amount} eklendi.`
      );
    }

    /* STANDINGS */

    if (
      command === "puan" ||
      command === "puanlar"
    ) {
      return sendStandings(message);
    }

    /* MATCH */

    if (
      command === "maç" ||
      command === "mac"
    ) {
      if (
        !channelOnly(
          message,
          CHANNEL.MATCH
        )
      ) {
        return sendError(
          message,
          "Maç komutu yalnızca maç kanalında kullanılabilir."
        );
      }

      if (!isCommentator(message.member)) {
        return sendError(
          message,
          "Bu komutu yalnızca Spiker veya Yönetici kullanabilir."
        );
      }

      const roles =
        message.mentions.roles;

      if (roles.size < 2) {
        return sendError(
          message,
          "İki takım etiketlemelisin."
        );
      }

      const [team1, team2] =
        [...roles.values()].slice(0, 2);

      ensureTeam(team1.id, team1.name);
      ensureTeam(team2.id, team2.name);

      return startMatch(
        message.guild,
        team1,
        team2
      );
    }

    /* FIXTURE ADD */

    if (
      command === "fiksturekle" ||
      command === "fikstür ekle"
    ) {
      if (!isCommentator(message.member)) {
        return sendError(
          message,
          "Bu komutu kullanma yetkin yok."
        );
      }

      const roles =
        message.mentions.roles;

      if (roles.size < 2) {
        return sendError(
          message,
          "İki takım etiketle."
        );
      }

      const dateText =
        parts.slice(-2).join(" ");

      const timestamp =
        Date.parse(dateText);

      if (Number.isNaN(timestamp)) {
        return sendError(
          message,
          "Tarih örneği: `2026-09-15 20:00`"
        );
      }

      const [team1, team2] =
        [...roles.values()].slice(0, 2);

      const fixture = {
        id: data.nextFixtureId++,
        team1: team1.id,
        team2: team2.id,
        time: timestamp
      };

      data.fixtures.push(fixture);

      ensureTeam(team1.id, team1.name);
      ensureTeam(team2.id, team2.name);

      saveData();

      return sendSuccess(
        message,
        `${team1} - ${team2} fikstüre eklendi.`
      );
    }

    /* FIXTURE LIST */

    if (
      command === "fikstür" ||
      command === "fikstur"
    ) {
      const upcoming =
        data.fixtures
          .filter(x => x.time > Date.now())
          .sort((a, b) => a.time - b.time)
          .slice(0, 20);

      if (!upcoming.length) {
        return sendError(
          message,
          "Yaklaşan fikstür bulunmuyor."
        );
      }

      const text =
        upcoming.map(x => {
          const a =
            message.guild.roles.cache.get(x.team1);

          const b =
            message.guild.roles.cache.get(x.team2);

          return `**${a?.name || "Silinen Takım"} - ${b?.name || "Silinen Takım"}** — <t:${Math.floor(x.time / 1000)}:F>`;
        }).join("\n");

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("📅 Fikstür")
            .setDescription(text)
        ]
      });
    }

    /* FIXTURE REMOVE */

    if (
      command === "fiksturcikar" ||
      command === "fikstürçıkar"
    ) {
      if (!isCommentator(message.member)) {
        return sendError(
          message,
          "Bu komutu kullanma yetkin yok."
        );
      }

      const roles =
        [...message.mentions.roles.values()];

      if (roles.length < 2) {
        return sendError(
          message,
          "İki takım etiketle."
        );
      }

      const [a, b] = roles;

      const before =
        data.fixtures.length;

      data.fixtures =
        data.fixtures.filter(
          x =>
            !(
              (x.team1 === a.id && x.team2 === b.id) ||
              (x.team1 === b.id && x.team2 === a.id)
            )
        );

      saveData();

      return sendSuccess(
        message,
        before === data.fixtures.length
          ? "Bu maç bulunamadı."
          : "Fikstür silindi."
      );
    }

    /* CUPS */

    if (
      command === "kupaekle" ||
      command === "kupasil"
    ) {
      if (!isCommentator(message.member)) {
        return sendError(
          message,
          "Bu komutu kullanma yetkin yok."
        );
      }

      const team =
        message.mentions.roles.first();

      const cup =
        cleanMention(
          raw
            .replace(
              new RegExp(
                `^${command}\\s*`,
                "i"
              ),
              ""
            )
        );

      if (!team || !cup) {
        return sendError(
          message,
          `Kullanım: \`.${command} @Takım Kupa Adı\``
        );
      }

      if (!data.cups[team.id]) {
        data.cups[team.id] = [];
      }

      if (command === "kupaekle") {
        data.cups[team.id].push(cup);
      } else {
        data.cups[team.id] =
          data.cups[team.id].filter(
            x =>
              x.toLowerCase() !==
              cup.toLowerCase()
          );
      }

      saveData();

      return sendSuccess(
        message,
        "Kupa sistemi güncellendi."
      );
    }

    /* MUSEUM */

    if (
      command === "müze" ||
      command === "muze"
    ) {
      const team =
        message.mentions.roles.first();

      if (!team) {
        return sendError(
          message,
          "Kullanım: `.müze @Takım`"
        );
      }

      const cups =
        data.cups[team.id] || [];

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`🏛️ ${team.name} Müzesi`)
            .setDescription(
              cups.length
                ? cups.map(x => `🏆 ${x}`).join("\n")
                : "Henüz kupa bulunmuyor."
            )
        ]
      });
    }

    /* TICKET PANEL */

    if (command === "ticketpanel") {
      if (!isAdmin(message.member)) {
        return sendError(
          message,
          "Bu komutu yalnızca Yönetici kullanabilir."
        );
      }

      return ticketPanel(message);
    }

    /* ROLE PANEL */

    if (command === "rolpanel") {
      if (!isAdmin(message.member)) {
        return sendError(
          message,
          "Bu komutu yalnızca Yönetici kullanabilir."
        );
      }

      return rolePanel(message);
    }

    /* DELETE MESSAGES */

    if (command === "sil") {
      if (!isAdmin(message.member)) {
        return sendError(
          message,
          "Bu komutu yalnızca Yönetici kullanabilir."
        );
      }

      const amount =
        Number(parts[0]);

      if (
        !Number.isInteger(amount) ||
        amount < 1 ||
        amount > 1000
      ) {
        return sendError(
          message,
          "1 ile 1000 arasında sayı gir."
        );
      }

      await message.channel.bulkDelete(
        amount,
        true
      ).catch(() => {});

      return;
    }

    /* EMBED */

    if (command === "embed") {
      if (!isAdmin(message.member)) {
        return sendError(
          message,
          "Bu komutu yalnızca Yönetici kullanabilir."
        );
      }

      const content =
        raw.replace(/^embed\s*/i, "");

      const [title, description] =
        content.split("|").map(x => x.trim());

      if (!title || !description) {
        return sendError(
          message,
          "Kullanım: `.embed Başlık | Açıklama`"
        );
      }

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setTimestamp()
        ]
      });
    }

    /* KICK */

    if (command === "kick") {
      if (!isModerator(message.member)) {
        return sendError(
          message,
          "Bu komutu kullanma yetkin yok."
        );
      }

      const target =
        message.mentions.members.first();

      if (!target) {
        return sendError(
          message,
          "Oyuncuyu etiketle."
        );
      }

      await target.kick().catch(() => {});

      return sendSuccess(
        message,
        `${target.user.tag} sunucudan atıldı.`
      );
    }

    /* BAN */

    if (command === "ban") {
      if (!isAdmin(message.member)) {
        return sendError(
          message,
          "Bu komutu yalnızca Yönetici kullanabilir."
        );
      }

      const target =
        message.mentions.members.first();

      if (!target) {
        return sendError(
          message,
          "Oyuncuyu etiketle."
        );
      }

      await target.ban({
        reason: "Axera League moderasyon"
      }).catch(() => {});

      return sendSuccess(
        message,
        `${target.user.tag} yasaklandı.`
      );
    }

    /* MUTE */

    if (command === "mute") {
      if (!isModerator(message.member)) {
        return sendError(
          message,
          "Bu komutu kullanma yetkin yok."
        );
      }

      const target =
        message.mentions.members.first();

      if (!target) {
        return sendError(
          message,
          "Oyuncuyu etiketle."
        );
      }

      await target.timeout(
        10 * 60 * 1000,
        "Axera League moderasyon"
      ).catch(() => {});

      return sendSuccess(
        message,
        `${target.user.tag} 10 dakika susturuldu.`
      );
    }

    /* UNMUTE */

    if (command === "unmute") {
      if (!isModerator(message.member)) {
        return sendError(
          message,
          "Bu komutu kullanma yetkin yok."
        );
      }

      const target =
        message.mentions.members.first();

      if (!target) {
        return sendError(
          message,
          "Oyuncuyu etiketle."
        );
      }

      await target.timeout(
        null,
        "Axera League moderasyon"
      ).catch(() => {});

      return sendSuccess(
        message,
        `${target.user.tag} susturması kaldırıldı.`
      );
    }

    /* TARGETED DM */

    if (command === "dm") {
      if (!isAdmin(message.member)) {
        return sendError(
          message,
          "Bu komutu yalnızca Yönetici kullanabilir."
        );
      }

      const target =
        message.mentions.members.first();

      if (!target) {
        return sendError(
          message,
          "Kullanım: `.dm @Oyuncu mesaj`"
        );
      }

      const text =
        cleanMention(
          raw.replace(
            /^dm\s*/i,
            ""
          )
        ).replace(
          target.toString(),
          ""
        ).trim();

      if (!text) {
        return sendError(
          message,
          "Gönderilecek mesajı yaz."
        );
      }

      await target.send(text).catch(() => {
        throw new Error(
          "Kullanıcının DM'leri kapalı olabilir."
        );
      });

      return sendSuccess(
        message,
        "DM gönderildi."
      );
    }

  } catch (err) {
    console.error("MESSAGE ERROR:", err);

    try {
      await message.reply(
        "❌ Komut çalışırken bir hata oluştu. Railway loglarını kontrol et."
      );
    } catch {}
  }
});

/* =========================
   BUTTONS
   ========================= */

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isButton()) {

      /* REGISTRATION */

      if (
        interaction.customId.startsWith(
          "register_"
        )
      ) {
        if (
          !isAdmin(interaction.member) &&
          !hasRole(
            interaction.member,
            ROLE.REGISTER
          )
        ) {
          return interaction.reply({
            content: "❌ Bu kayıt panelini kullanamazsın.",
            ephemeral: true
          });
        }

        const parts =
          interaction.customId.split("_");

        const type = parts[1];
        const targetId = parts[2];

        const target =
          await interaction.guild.members
            .fetch(targetId)
            .catch(() => null);

        if (!target) {
          return interaction.reply({
            content: "❌ Oyuncu bulunamadı.",
            ephemeral: true
          });
        }

        const panel =
          data.registrationPanels[
            interaction.message.id
          ];

        const nickname =
          panel?.nickname ||
          target.displayName;

        for (const roleId of [
          ROLE.UNREGISTERED,
          ROLE.PLAYER,
          ROLE.TD,
          ROLE.MEMBER
        ]) {
          await target.roles
            .remove(roleId)
            .catch(() => {});
        }

        let selectedRole = ROLE.PLAYER;

        if (type === "td") {
          selectedRole = ROLE.TD;
        }

        if (type === "member") {
          selectedRole = ROLE.MEMBER;
        }

        if (type === "gk") {
          selectedRole = ROLE.PLAYER;
        }

        await target.roles
          .add(selectedRole)
          .catch(() => {});

        const user =
          getUser(target.id);

        user.role = type;

        await target
          .setNickname(nickname)
          .catch(() => {});

        saveData();

        await interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle("✅ Kayıt Tamamlandı")
              .setDescription(
                `${target} başarıyla **${type === "td"
                  ? "Teknik Direktör"
                  : type === "member"
                    ? "Üye"
                    : type === "gk"
                      ? "Kaleci"
                      : "Futbolcu"}** olarak kayıt edildi.`
              )
              .setTimestamp()
          ],
          components: []
        });

        return;
      }

      /* PING ROLES */

      if (
        interaction.customId.startsWith(
          "pingrole_"
        )
      ) {
        const roleId =
          interaction.customId.split("_")[1];

        const role =
          interaction.guild.roles.cache.get(roleId);

        if (!role) {
          return interaction.reply({
            content: "❌ Rol bulunamadı.",
            ephemeral: true
          });
        }

        const member =
          interaction.member;

        if (member.roles.cache.has(roleId)) {
          await member.roles.remove(roleId);

          return interaction.reply({
            content: `🔕 ${role.name} kaldırıldı.`,
            ephemeral: true
          });
        }

        await member.roles.add(roleId);

        return interaction.reply({
          content: `🔔 ${role.name} verildi.`,
          ephemeral: true
        });
      }

      /* TICKET CREATE */

      if (
        interaction.customId ===
        "ticket_create"
      ) {
        return createTicket(interaction);
      }

      /* TICKET CLOSE */

      if (
        interaction.customId ===
        "ticket_close"
      ) {
        const ticket =
          data.tickets[
            interaction.channel.id
          ];

        if (!ticket) {
          return interaction.reply({
            content: "❌ Ticket kaydı bulunamadı.",
            ephemeral: true
          });
        }

        if (
          interaction.user.id !==
            ticket.userId &&
          !isModerator(interaction.member)
        ) {
          return interaction.reply({
            content: "❌ Bu bileti kapatamazsın.",
            ephemeral: true
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
        }, 1500);

        return;
      }
    }

    /* FORMATION */

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId.startsWith(
        "formation_"
      )
    ) {
      if (
        !isCommentator(interaction.member)
      ) {
        return interaction.reply({
          content: "❌ Yetkin yok.",
          ephemeral: true
        });
      }

      const teamId =
        interaction.customId.split("_")[1];

      const formation =
        interaction.values[0];

      data.formations[teamId] =
        formation;

      if (data.teams[teamId]) {
        data.teams[teamId].formation =
          formation;
      }

      saveData();

      return interaction.update({
        content:
          `✅ Formasyon **${formation}** olarak ayarlandı.`,
        components: []
      });
    }

  } catch (err) {
    console.error("INTERACTION ERROR:", err);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ İşlem sırasında hata oluştu.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

/* =========================
   MEMBER JOIN
   ========================= */

client.on("guildMemberAdd", async member => {
  if (member.user.bot) return;

  await member.roles
    .add(ROLE.UNREGISTERED)
    .catch(() => {});

  const channel =
    member.guild.channels.cache.get(
      CHANNEL.REGISTER
    );

  if (!channel) return;

  await channel.send({
    content: `<@&${ROLE.REGISTER}>`,
    embeds: [
      new EmbedBuilder()
        .setTitle("👋 Yeni Oyuncu Geldi")
        .setDescription(
          `${member} sunucuya katıldı.\n\n` +
          `Kayıt yetkililerinin kayıt işlemini tamamlaması gerekiyor.`
        )
        .setTimestamp()
    ]
  }).catch(() => {});
});

/* =========================
   READY
   ========================= */

client.once("ready", async () => {
  console.log("================================");
  console.log("AXERA LEAGUE BOT AKTİF");
  console.log(`Bot: ${client.user.tag}`);
  console.log(`AI Model: ${AI_MODEL}`);
  console.log("================================");

  client.user.setPresence({
    activities: [
      {
        name: "Axera League | Futbol RP",
        type: 3
      }
    ],
    status: "online"
  });

  for (const guild of client.guilds.cache.values()) {
    await guild.members.fetch().catch(() => {});

    for (const member of guild.members.cache.values()) {
      if (!member.user.bot) {
        getUser(member.id);
      }
    }
  }

  saveData();
});

/* =========================
   FIXTURE SCHEDULER
   ========================= */

setInterval(async () => {
  try {
    const now = Date.now();

    const due =
      data.fixtures.filter(
        x => x.time <= now
      );

    if (!due.length) return;

    for (const fixture of due) {
      for (const guild of client.guilds.cache.values()) {
        const team1 =
          guild.roles.cache.get(
            fixture.team1
          );

        const team2 =
          guild.roles.cache.get(
            fixture.team2
          );

        if (
          team1 &&
          team2
        ) {
          await startMatch(
            guild,
            team1,
            team2
          );
        }
      }
    }

    data.fixtures =
      data.fixtures.filter(
        x => x.time > now
      );

    saveData();

  } catch (err) {
    console.error(
      "FIXTURE SCHEDULER ERROR:",
      err
    );
  }
}, 1000);

/* =========================
   TICKET AUTO CLOSE
   ========================= */

setInterval(async () => {
  try {
    const limit =
      60 * 60 * 1000;

    for (const ticket of Object.values(
      data.tickets
    )) {
      if (!ticket.open) continue;

      if (
        Date.now() -
          Number(ticket.lastMessage || 0) <
        limit
      ) {
        continue;
      }

      const channel =
        client.channels.cache.get(
          ticket.channelId
        );

      ticket.open = false;

      if (channel) {
        await channel.send(
          "🔒 60 dakika boyunca mesaj gelmediği için bu ticket otomatik kapatılıyor."
        ).catch(() => {});

        setTimeout(() => {
          channel.delete().catch(() => {});
        }, 2000);
      }
    }

    saveData();
  } catch (err) {
    console.error(
      "TICKET AUTO CLOSE ERROR:",
      err
    );
  }
}, 60 * 1000);

/* =========================
   GLOBAL ERROR HANDLING
   ========================= */

process.on("unhandledRejection", err => {
  console.error(
    "UNHANDLED REJECTION:",
    err
  );
});

process.on("uncaughtException", err => {
  console.error(
    "UNCAUGHT EXCEPTION:",
    err
  );
});

/* =========================
   ENV CHECK
   ========================= */

if (!TOKEN) {
  console.error(
    "❌ TOKEN bulunamadı! Railway Variables içine TOKEN ekle."
  );
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.warn(
    "⚠️ OPENAI_API_KEY bulunamadı. Discord botu çalışır fakat AI sistemi çalışmaz."
  );
}

/* =========================
   LOGIN
   ========================= */

client.login(TOKEN);
