const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  PermissionsBitField
} = require("discord.js");

const fs = require("fs");
const path = require("path");

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
   AXERA LEAGUE
   TEK PARÇA FOOTBALL RP BOT
   ========================================================= */

const PREFIX = ".";

const CONFIG = {
  roles: {
    admin: "1534456315366342716",
    value: "1534456192913375382",
    unregistered: "1534457560134844517",
    goalkeeper: "1534492034243498195",
    player: "1534457228986421278",
    member: "1534457460163608636",
    technicalDirector: "1534456648930693120",
    moderator: "1534450307088715917",
    match: "1535251168169697390"
  },

  channels: {
    registration: "1534460177884123276",
    chat: "1534469475917758586",
    training: "1534474070798762197",
    penalty: "1534474327812997192",
    match: "1534477626872168541",
    standings: "1534475991404253284",
    tweet: "1534477422806700203"
  },

  trainingReward: 3_000_000,
  penaltyReward: 5_000_000,
  matchGoalReward: 2_000_000,
  matchAssistReward: 1_000_000,
  matchParticipationReward: 5_000_000,
  tweetReward: 5_000_000,

  maxValue: 1_000_000_000,
  maxMessagesDelete: 1000,

  matchSecondPerGameMinute: 3,
  matchDurationMinutes: 90,

  ticketTimeout: 60 * 60 * 1000,
  tweetCooldown: 24 * 60 * 60 * 1000
};

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

function cloneDefaultData() {
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const data = cloneDefaultData();
      saveData(data);
      return data;
    }

    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);

    return {
      ...cloneDefaultData(),
      ...parsed
    };
  } catch (err) {
    console.error("data.json okunamadı:", err);

    const data = cloneDefaultData();
    saveData(data);

    return data;
  }
}

let data = loadData();

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("data.json kaydedilemedi:", err);
  }
}

/* =========================================================
   GENEL YARDIMCI FONKSİYONLAR
   ========================================================= */

function isAdmin(member) {
  return !!member?.roles?.cache?.has(CONFIG.roles.admin);
}

function isValueStaff(member) {
  return isAdmin(member) || member?.roles?.cache?.has(CONFIG.roles.value);
}

function isMatchStaff(member) {
  return isAdmin(member) || member?.roles?.cache?.has(CONFIG.roles.match);
}

function isModerator(member) {
  return (
    isAdmin(member) ||
    member?.roles?.cache?.has(CONFIG.roles.moderator)
  );
}

function isRegistrationStaff(member) {
  return isAdmin(member);
}

function hasAnyRole(member, roleIds) {
  return roleIds.some(id => member.roles.cache.has(id));
}

function registered(member) {
  if (!member) return false;

  return !member.user.bot &&
    !member.roles.cache.has(CONFIG.roles.unregistered);
}

function ensureUser(userId) {
  if (!data.users[userId]) {
    data.users[userId] = {
      value: 0,
      budget: 0,
      position: null,
      registered: false,
      lastTweet: 0
    };
  }

  return data.users[userId];
}

function ensureStats(userId) {
  if (!data.stats[userId]) {
    data.stats[userId] = {
      goals: 0,
      assists: 0,
      matches: 0,
      wins: 0,
      losses: 0,
      draws: 0
    };
  }

  return data.stats[userId];
}

/*
 * Para ayrıştırma:
 *
 * .dver @Oyuncu 5
 * = 5M€
 *
 * .dver @Oyuncu 5M
 * = 5M€
 *
 * .dver @Oyuncu 1.5B
 * = 1.5B€
 *
 * .dver @Oyuncu 500K
 * = 500K€
 */
function parseMoney(input) {
  if (!input) return NaN;

  let text = String(input)
    .toUpperCase()
    .replace(/€/g, "")
    .replace(/\s/g, "")
    .replace(",", ".");

  let multiplier = 1;

  if (text.endsWith("B")) {
    multiplier = 1_000_000_000;
    text = text.slice(0, -1);
  } else if (text.endsWith("M")) {
    multiplier = 1_000_000;
    text = text.slice(0, -1);
  } else if (text.endsWith("K")) {
    multiplier = 1_000;
    text = text.slice(0, -1);
  } else {
    // Birim yoksa M€ kabul edilir.
    multiplier = 1_000_000;
  }

  const number = Number(text);

  if (!Number.isFinite(number)) return NaN;

  return Math.floor(number * multiplier);
}

function formatMoney(amount) {
  amount = Number(amount) || 0;

  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";

  if (abs >= 1_000_000_000) {
    return `${sign}${trimNumber(abs / 1_000_000_000)}B€`;
  }

  if (abs >= 1_000_000) {
    return `${sign}${trimNumber(abs / 1_000_000)}M€`;
  }

  if (abs >= 1_000) {
    return `${sign}${trimNumber(abs / 1_000)}K€`;
  }

  return `${sign}${Math.floor(abs)}€`;
}

function trimNumber(num) {
  return Number(num.toFixed(2)).toString();
}

function mentionUser(id) {
  return `<@${id}>`;
}

function getMemberFromMention(message, text) {
  const match = text.match(/^<@!?(\d+)>/);

  if (!match) return null;

  return message.guild.members.cache.get(match[1]) || null;
}

function removeFirstMention(text) {
  return text.replace(/^<@!?\d+>\s*/, "").trim();
}

function cleanText(text) {
  return String(text || "").trim();
}

/* =========================================================
   OYUNCU DEĞERİ
   ========================================================= */

function extractPlayerValue(member) {
  const user = ensureUser(member.id);

  if (Number(user.value) > 0) {
    return Number(user.value);
  }

  const nick = member.nickname || member.user.username;

  const match = nick.match(
    /(?:^|\s)(\d+(?:[.,]\d+)?)\s*(B|M|K)€?\s*$/i
  );

  if (!match) return 0;

  const value = parseMoney(match[1] + match[2]);

  user.value = Number.isFinite(value) ? value : 0;

  return user.value;
}

function removeOldValueFromNickname(nickname) {
  return String(nickname || "")
    .replace(/\s*\d+(?:[.,]\d+)?\s*(?:B|M|K)€?\s*$/i, "")
    .trim();
}

async function setPlayerValue(member, value) {
  value = Math.max(
    0,
    Math.min(CONFIG.maxValue, Math.floor(Number(value) || 0))
  );

  const user = ensureUser(member.id);

  user.value = value;

  const currentNick =
    member.nickname ||
    member.user.globalName ||
    member.user.username;

  const baseName = removeOldValueFromNickname(currentNick);

  const newNick =
    `${baseName} | ${formatMoney(value)}`.trim();

  try {
    if (member.manageable) {
      await member.setNickname(newNick.slice(0, 32));
    }
  } catch (err) {
    console.log("Takma ad değiştirilemedi:", err.message);
  }

  saveData();

  return value;
}

async function addPlayerValue(member, amount) {
  const current = extractPlayerValue(member);
  return setPlayerValue(member, current + amount);
}

async function removePlayerValue(member, amount) {
  const current = extractPlayerValue(member);
  return setPlayerValue(member, Math.max(0, current - amount));
}

/* =========================================================
   POZİSYON
   ========================================================= */

function positionName(position) {
  const map = {
    GK: "🧤 Kaleci",
    DEF: "🛡️ Defans",
    MID: "🎯 Orta Saha",
    FWD: "⚡ Forvet"
  };

  return map[position] || "👤 Belirtilmemiş";
}

function normalizePosition(position) {
  const p = String(position || "")
    .toUpperCase()
    .trim();

  if (
    ["GK", "KALECI", "KALECİ", "KAL"].includes(p)
  ) {
    return "GK";
  }

  if (
    ["DEF", "DEFANS", "STP", "BEK"].includes(p)
  ) {
    return "DEF";
  }

  if (
    ["MID", "ORTA", "ORTASAHA", "ORTA SAHA", "OS"].includes(p)
  ) {
    return "MID";
  }

  if (
    ["FWD", "FORVET", "ST", "SF"].includes(p)
  ) {
    return "FWD";
  }

  return null;
}

/* =========================================================
   TAKIM SİSTEMİ
   ========================================================= */

function ensureTeam(role) {
  if (!data.teams[role.id]) {
    data.teams[role.id] = {
      id: role.id,
      name: role.name,
      budget: 0,
      players: [],
      formation: "4-4-2",
      active: true
    };
  }

  if (!data.standings[role.id]) {
    data.standings[role.id] = {
      teamId: role.id,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      points: 0
    };
  }

  return data.teams[role.id];
}

function getTeamByRole(role) {
  if (!role) return null;
  return data.teams[role.id] || null;
}

function calculateTeamValue(team) {
  if (!team || !Array.isArray(team.players)) return 0;

  return team.players.reduce((total, player) => {
    return total + Number(player.value || 0);
  }, 0);
}

function getTeamPlayers(guild, team) {
  if (!team) return [];

  const map = new Map();

  for (const player of team.players || []) {
    if (!player.userId) continue;

    const member = guild.members.cache.get(player.userId);

    if (!member || member.user.bot) continue;

    map.set(member.id, {
      member,
      userId: member.id,
      position: player.position || "MID",
      value: extractPlayerValue(member)
    });
  }

  const teamRole = guild.roles.cache.get(team.id);

  if (teamRole) {
    for (const member of teamRole.members.values()) {
      if (member.user.bot) continue;

      if (!map.has(member.id)) {
        map.set(member.id, {
          member,
          userId: member.id,
          position: "MID",
          value: extractPlayerValue(member)
        });
      }
    }
  }

  return [...map.values()];
}

function findTeamFromInput(guild, input) {
  const match = String(input || "").match(/^<@&(\d+)>$/);

  if (match) {
    return guild.roles.cache.get(match[1]) || null;
  }

  const id = String(input || "").replace(/[^\d]/g, "");

  if (id.length >= 15) {
    return guild.roles.cache.get(id) || null;
  }

  const text = String(input || "").toLowerCase();

  return guild.roles.cache.find(
    role =>
      role.name.toLowerCase() === text &&
      data.teams[role.id]
  ) || null;
}

/* =========================================================
   PUAN SİSTEMİ
   ========================================================= */

function sortStandings() {
  return Object.values(data.standings).sort((a, b) => {
    if (b.points !== a.points) {
      return b.points - a.points;
    }

    if (b.gd !== a.gd) {
      return b.gd - a.gd;
    }

    if (b.gf !== a.gf) {
      return b.gf - a.gf;
    }

    return 0;
  });
}

function updateStanding(teamId, result, gf, ga) {
  if (!data.standings[teamId]) {
    data.standings[teamId] = {
      teamId,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      points: 0
    };
  }

  const table = data.standings[teamId];

  table.played++;
  table.gf += gf;
  table.ga += ga;
  table.gd = table.gf - table.ga;

  if (result === "W") {
    table.wins++;
    table.points += 3;
  } else if (result === "D") {
    table.draws++;
    table.points += 1;
  } else {
    table.losses++;
  }
}

/* =========================================================
   KAYIT SİSTEMİ
   ========================================================= */

async function registerMember(member, type, nickname) {
  const roleIds = [
    CONFIG.roles.player,
    CONFIG.roles.goalkeeper,
    CONFIG.roles.technicalDirector,
    CONFIG.roles.member,
    CONFIG.roles.unregistered
  ];

  for (const roleId of roleIds) {
    if (member.roles.cache.has(roleId)) {
      try {
        await member.roles.remove(roleId);
      } catch {}
    }
  }

  const roleMap = {
    player: CONFIG.roles.player,
    goalkeeper: CONFIG.roles.goalkeeper,
    technicalDirector: CONFIG.roles.technicalDirector,
    member: CONFIG.roles.member
  };

  const roleId = roleMap[type];

  if (!roleId) return false;

  try {
    await member.roles.add(roleId);
  } catch (err) {
    console.error("Kayıt rolü verilemedi:", err.message);
  }

  if (nickname) {
    try {
      await member.setNickname(
        `${nickname} | 0€`.slice(0, 32)
      );
    } catch {}
  }

  const user = ensureUser(member.id);
  user.registered = true;
  user.position =
    type === "goalkeeper" ? "GK" :
    type === "player" ? "FWD" :
    null;

  saveData();

  return true;
}

/* =========================================================
   KAYIT BUTONLARI
   ========================================================= */

function registrationButtons(targetId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`register_player_${targetId}`)
      .setLabel("Futbolcu")
      .setEmoji("⚽")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`register_goalkeeper_${targetId}`)
      .setLabel("Kaleci")
      .setEmoji("🧤")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`register_td_${targetId}`)
      .setLabel("Teknik Direktör")
      .setEmoji("🧑‍💼")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`register_member_${targetId}`)
      .setLabel("Üye")
      .setEmoji("👤")
      .setStyle(ButtonStyle.Secondary)
  );
}

/* =========================================================
   ANTRENMAN
   ========================================================= */

const trainingSteps = [
  "Isınma tamamlandı.",
  "Pas çalışması başladı.",
  "Top kontrolü geliştiriliyor.",
  "Kısa pas çalışması tamamlandı.",
  "Şut çalışması başladı.",
  "Hız çalışması yapılıyor.",
  "Taktik çalışma yapılıyor.",
  "Pozisyon çalışması tamamlandı.",
  "Son kondisyon çalışması yapılıyor.",
  "Antrenman tamamlandı."
];

async function startTraining(message) {
  const userId = message.author.id;

  if (data.training[userId]?.active) {
    return message.reply("⚽ Zaten devam eden bir antrenmanın var.");
  }

  data.training[userId] = {
    active: true,
    step: 0,
    startedAt: Date.now()
  };

  saveData();

  const embed = new EmbedBuilder()
    .setTitle("⚽ Axera League | Antrenman")
    .setDescription(
      `**${message.member.displayName}** antrenmana başladı.\n\n` +
      `İlerleme: **0/${trainingSteps.length}**`
    );

  const msg = await message.channel.send({
    embeds: [embed]
  });

  for (let i = 0; i < trainingSteps.length; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));

    data.training[userId].step = i + 1;

    const progress = "🟩".repeat(i + 1) +
      "⬜".repeat(trainingSteps.length - i - 1);

    const updated = new EmbedBuilder()
      .setTitle("⚽ Axera League | Antrenman")
      .setDescription(
        `**${message.member.displayName}**\n\n` +
        `${trainingSteps[i]}\n\n` +
        `${progress}\n` +
        `**${i + 1}/${trainingSteps.length}**`
      );

    await msg.edit({
      embeds: [updated]
    }).catch(() => {});
  }

  await addPlayerValue(
    message.member,
    CONFIG.trainingReward
  );

  data.training[userId].active = false;
  data.training[userId].completedAt = Date.now();

  saveData();

  const finishEmbed = new EmbedBuilder()
    .setTitle("✅ Antrenman Tamamlandı")
    .setDescription(
      `**${message.member}** antrenmanı başarıyla tamamladı.\n\n` +
      `💰 Kazanılan değer: **+${formatMoney(CONFIG.trainingReward)}**`
    )
    .setTimestamp();

  await message.channel.send({
    embeds: [finishEmbed]
  });
}

/* =========================================================
   PENALTI
   ========================================================= */

async function penalty(message) {
  const roll = Math.random();

  let result;
  let reward = 0;

  if (roll < 0.50) {
    result = "⚽ GOOOOL! Penaltı ağlarla buluştu!";
    reward = CONFIG.penaltyReward;
  } else if (roll < 0.75) {
    result = "🥅 Direk! Top direkten döndü.";
  } else {
    result = "🧤 Axera Kalecisi kurtardı!";
  }

  const embed = new EmbedBuilder()
    .setTitle("⚽ Axera League | Penaltı")
    .setDescription(
      `**${message.member.displayName}** penaltıyı kullandı.\n\n` +
      `🧤 Kaleci: **Axera Kalecisi**\n\n` +
      result
    )
    .setTimestamp();

  if (reward > 0) {
    await addPlayerValue(message.member, reward);

    ensureStats(message.author.id).goals++;
    saveData();

    embed.addFields({
      name: "💰 Kazanç",
      value: `+${formatMoney(reward)}`
    });
  }

  await message.channel.send({
    embeds: [embed]
  });
}

/* =========================================================
   MAÇ SİSTEMİ
   ========================================================= */

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

const commentary = [
  "Orta sahada top kapma mücadelesi yaşanıyor.",
  "Top kanada açıldı.",
  "Hücum oyuncusu rakip savunmanın arkasına sarkıyor.",
  "Kısa paslarla oyun kuruluyor.",
  "Rakip savunma pozisyonunu koruyor.",
  "Kanattan tehlikeli bir orta geliyor.",
  "Orta saha oyuncusu oyunu yönlendiriyor.",
  "Savunma hattı ileri çıkıyor.",
  "Top kaleye doğru gönderildi."
];

const fouls = [
  "Hakem faul düdüğünü çaldı.",
  "Orta sahada sert bir müdahale oldu.",
  "Oyuncu yerde kaldı, hakem oyunu durdurdu."
];

function chooseRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function chooseWeightedPlayer(players) {
  if (!players.length) return null;

  return players[
    Math.floor(Math.random() * players.length)
  ];
}

function teamStrength(team, players) {
  const value = calculateTeamValue(team);

  const count = Math.max(players.length, 1);

  return value / count;
}

function getMatchPlayers(guild, team) {
  return getTeamPlayers(guild, team);
}

function createMatchId() {
  return `match_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

async function startLiveMatch(
  channel,
  team1,
  team2,
  fixtureId = null
) {
  const matchId = createMatchId();

  const players1 = getMatchPlayers(channel.guild, team1);
  const players2 = getMatchPlayers(channel.guild, team2);

  const match = {
    id: matchId,
    fixtureId,
    team1Id: team1.id,
    team2Id: team2.id,
    minute: 0,
    score1: 0,
    score2: 0,
    events: [],
    players1: players1.map(p => p.userId),
    players2: players2.map(p => p.userId),
    rewarded: [],
    startedAt: Date.now(),
    finished: false
  };

  data.activeMatches[matchId] = match;
  saveData();

  const embed = new EmbedBuilder()
    .setTitle("🏟️ AXERA LEAGUE | CANLI MAÇ")
    .setDescription(
      `**${team1.name}** 0 - 0 **${team2.name}**\n\n` +
      `⏱️ **0'**\n\n` +
      `Maç başlamak üzere...`
    )
    .setTimestamp();

  const msg = await channel.send({
    embeds: [embed]
  });

  let interval;

  const stopMatch = async () => {
    if (interval) clearInterval(interval);

    try {
      await finishMatch(channel, matchId, msg);
    } catch (err) {
      console.error("Maç bitirme hatası:", err);
    }
  };

  interval = setInterval(async () => {
    try {
      const current = data.activeMatches[matchId];

      if (!current || current.finished) {
        clearInterval(interval);
        return;
      }

      current.minute++;

      const eventChance = Math.random();

      let eventText = chooseRandom(commentary);

      if (eventChance < 0.08) {
        eventText = chooseRandom(fouls);
      }

      /*
       * Takım değeri avantajı:
       * Daha yüksek değere sahip takım küçük bir avantaj alır.
       */
      const strength1 = teamStrength(team1, players1);
      const strength2 = teamStrength(team2, players2);

      const totalStrength =
        Math.max(strength1 + strength2, 1);

      let goalProbability = 0.045;

      const advantage =
        (strength1 - strength2) / totalStrength;

      let team1Attack =
        0.5 + advantage * 0.20;

      team1Attack = Math.max(
        0.35,
        Math.min(0.65, team1Attack)
      );

      if (Math.random() < goalProbability) {
        const team1Scores = Math.random() < team1Attack;

        if (team1Scores) {
          current.score1++;

          const scorer =
            chooseWeightedPlayer(players1);

          const assist =
            chooseWeightedPlayer(
              players1.filter(
                p => p.userId !== scorer?.userId
              )
            );

          if (scorer) {
            await addPlayerValue(
              scorer.member,
              CONFIG.matchGoalReward
            );

            const stats = ensureStats(scorer.userId);
            stats.goals++;

            eventText =
              `⚽ **GOOOL!** ${scorer.member.displayName} ` +
              `topu ağlara gönderdi!`;
          }

          if (assist) {
            await addPlayerValue(
              assist.member,
              CONFIG.matchAssistReward
            );

            const stats = ensureStats(assist.userId);
            stats.assists++;

            eventText +=
              `\n🎯 Asist: **${assist.member.displayName}**`;
          }
        } else {
          current.score2++;

          const scorer =
            chooseWeightedPlayer(players2);

          const assist =
            chooseWeightedPlayer(
              players2.filter(
                p => p.userId !== scorer?.userId
              )
            );

          if (scorer) {
            await addPlayerValue(
              scorer.member,
              CONFIG.matchGoalReward
            );

            const stats = ensureStats(scorer.userId);
            stats.goals++;

            eventText =
              `⚽ **GOOOL!** ${scorer.member.displayName} ` +
              `topu ağlara gönderdi!`;
          }

          if (assist) {
            await addPlayerValue(
              assist.member,
              CONFIG.matchAssistReward
            );

            const stats = ensureStats(assist.userId);
            stats.assists++;

            eventText +=
              `\n🎯 Asist: **${assist.member.displayName}**`;
          }
        }
      }

      current.events.unshift(
        `**${current.minute}'** ${eventText}`
      );

      if (current.events.length > 8) {
        current.events = current.events.slice(0, 8);
      }

      const liveEmbed = new EmbedBuilder()
        .setTitle("🏟️ AXERA LEAGUE | CANLI MAÇ")
        .setDescription(
          `**${team1.name}** ${current.score1} - ` +
          `${current.score2} **${team2.name}**\n\n` +
          `⏱️ **${current.minute}'**\n\n` +
          `**Son Olaylar**\n` +
          current.events.join("\n")
        )
        .setFooter({
          text: "3 gerçek saniye = 1 oyun dakikası"
        });

      await msg.edit({
        embeds: [liveEmbed]
      }).catch(() => {});

      saveData();

      if (current.minute >= CONFIG.matchDurationMinutes) {
        await stopMatch();
      }
    } catch (err) {
      console.error("Canlı maç hatası:", err);
      clearInterval(interval);
    }
  }, CONFIG.matchSecondPerGameMinute * 1000);

  return matchId;
}

async function finishMatch(channel, matchId, msg) {
  const match = data.activeMatches[matchId];

  if (!match || match.finished) return;

  match.finished = true;

  const guild = channel.guild;

  const team1 = data.teams[match.team1Id];
  const team2 = data.teams[match.team2Id];

  if (!team1 || !team2) {
    delete data.activeMatches[matchId];
    saveData();
    return;
  }

  /*
   * Katılım ödülü:
   * Rol üyeleri + kadroya manuel eklenen oyuncular.
   */
  const participantIds = [
    ...new Set([
      ...(match.players1 || []),
      ...(match.players2 || [])
    ])
  ];

  for (const userId of participantIds) {
    const member = guild.members.cache.get(userId);

    if (!member || member.user.bot) continue;

    if (!match.rewarded.includes(userId)) {
      await addPlayerValue(
        member,
        CONFIG.matchParticipationReward
      );

      match.rewarded.push(userId);

      ensureStats(userId).matches++;
    }
  }

  let result1 = "D";
  let result2 = "D";

  if (match.score1 > match.score2) {
    result1 = "W";
    result2 = "L";
  } else if (match.score1 < match.score2) {
    result1 = "L";
    result2 = "W";
  }

  updateStanding(
    team1.id,
    result1,
    match.score1,
    match.score2
  );

  updateStanding(
    team2.id,
    result2,
    match.score2,
    match.score1
  );

  const resultText =
    match.score1 > match.score2
      ? `🏆 **${team1.name}** kazandı!`
      : match.score2 > match.score1
        ? `🏆 **${team2.name}** kazandı!`
        : "🤝 Maç berabere bitti!";

  const finishEmbed = new EmbedBuilder()
    .setTitle("🏁 AXERA LEAGUE | MAÇ SONU")
    .setDescription(
      `**${team1.name}** ${match.score1} - ` +
      `${match.score2} **${team2.name}**\n\n` +
      resultText
    )
    .addFields({
      name: "💰 Katılım Ödülü",
      value:
        `Maçta yer alan oyunculara ` +
        `**+${formatMoney(CONFIG.matchParticipationReward)}** değer verildi.`
    })
    .setTimestamp();

  await msg.edit({
    embeds: [finishEmbed]
  }).catch(() => {});

  data.matchHistory.push({
    id: matchId,
    team1: team1.id,
    team2: team2.id,
    score1: match.score1,
    score2: match.score2,
    date: Date.now()
  });

  if (match.fixtureId) {
    const fixture = data.fixtures.find(
      f => f.id === match.fixtureId
    );

    if (fixture) {
      fixture.status = "completed";
      fixture.matchId = matchId;
    }
  }

  delete data.activeMatches[matchId];

  saveData();
}

/* =========================================================
   FİKSTÜR
   ========================================================= */

function parseDateTime(date, time) {
  const parsed = new Date(`${date}T${time}:00`);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.getTime();
}

async function checkFixtures(client) {
  const now = Date.now();

  for (const fixture of data.fixtures) {
    if (fixture.status !== "scheduled") continue;

    if (fixture.timestamp > now) continue;

    if (!data.teams[fixture.team1Id]) {
      fixture.status = "cancelled";
      continue;
    }

    if (!data.teams[fixture.team2Id]) {
      fixture.status = "cancelled";
      continue;
    }

    fixture.status = "live";

    const channel =
      client.channels.cache.get(CONFIG.channels.match);

    if (!channel) continue;

    const team1 = data.teams[fixture.team1Id];
    const team2 = data.teams[fixture.team2Id];

    await startLiveMatch(
      channel,
      team1,
      team2,
      fixture.id
    );
  }

  saveData();
}

setInterval(() => {
  checkFixtures(client).catch(console.error);
}, 1000);

/* =========================================================
   TWEET
   ========================================================= */

async function sendTweet(message, text) {
  if (message.channel.id !== CONFIG.channels.tweet) {
    return message.reply(
      `🐦 Tweet komutu yalnızca <#${CONFIG.channels.tweet}> kanalında kullanılabilir.`
    );
  }

  text = cleanText(text);

  if (!text) {
    return message.reply(
      "❌ Tweet içeriği boş olamaz."
    );
  }

  const user = ensureUser(message.author.id);

  const now = Date.now();
  const lastTweet = Number(
    data.tweetCooldowns[message.author.id] || 0
  );

  let rewardText = "";

  if (now - lastTweet >= CONFIG.tweetCooldown) {
    await addPlayerValue(
      message.member,
      CONFIG.tweetReward
    );

    data.tweetCooldowns[message.author.id] = now;

    rewardText =
      `\n\n💰 Tweet ödülü: **+${formatMoney(CONFIG.tweetReward)}**`;
  } else {
    const remaining =
      CONFIG.tweetCooldown - (now - lastTweet);

    const hours = Math.floor(
      remaining / (60 * 60 * 1000)
    );

    rewardText =
      `\n\n⏳ 24 saatlik ödül süresi devam ediyor. ` +
      `Yaklaşık **${hours} saat** sonra tekrar ödül alabilirsin.`;
  }

  const tweetEmbed = new EmbedBuilder()
    .setAuthor({
      name:
        message.member.displayName ||
        message.author.username,
      iconURL: message.author.displayAvatarURL()
    })
    .setDescription(text + rewardText)
    .setFooter({
      text: "Axera League • Tweet"
    })
    .setTimestamp();

  try {
    await message.delete();
  } catch {}

  await message.channel.send({
    embeds: [tweetEmbed]
  });

  saveData();
}

/* =========================================================
   BÜTÇE
   ========================================================= */

function parseBudgetAmount(input) {
  const amount = parseMoney(input);

  return Number.isFinite(amount)
    ? amount
    : NaN;
}

async function showBudget(message, target = null) {
  const member = target || message.member;

  const user = ensureUser(member.id);

  const embed = new EmbedBuilder()
    .setTitle("💰 Axera League | Kişisel Bütçe")
    .setDescription(
      `👤 Oyuncu: **${member.displayName}**\n\n` +
      `💵 Bütçe: **${formatMoney(user.budget)}**`
    );

  await message.reply({
    embeds: [embed]
  });
}

async function transferBudget(message, target, amount) {
  if (!target) {
    return message.reply(
      "❌ Bir oyuncu etiketlemelisin."
    );
  }

  if (target.id === message.author.id) {
    return message.reply(
      "❌ Kendine bütçe gönderemezsin."
    );
  }

  const money = parseBudgetAmount(amount);

  if (!Number.isFinite(money) || money <= 0) {
    return message.reply(
      "❌ Geçerli bir miktar gir."
    );
  }

  const sender = ensureUser(message.author.id);
  const receiver = ensureUser(target.id);

  if (sender.budget < money) {
    return message.reply(
      `❌ Yeterli bütçen yok.\n` +
      `Mevcut: **${formatMoney(sender.budget)}**`
    );
  }

  sender.budget -= money;
  receiver.budget += money;

  saveData();

  await message.reply(
    `✅ **${formatMoney(money)}** bütçe ` +
    `${target} kullanıcısına gönderildi.`
  );
}

/* =========================================================
   TAKIM BÜTÇESİ
   ========================================================= */

async function showTeamBudget(message, role) {
  if (!role) {
    return message.reply(
      "❌ Takım rolü bulunamadı."
    );
  }

  const team = getTeamByRole(role);

  if (!team) {
    return message.reply(
      "❌ Bu takım Axera League'e kayıtlı değil."
    );
  }

  await message.reply(
    `💰 **${team.name}** takım bütçesi: ` +
    `**${formatMoney(team.budget)}**`
  );
}

/* =========================================================
   KADRO
   ========================================================= */

async function showSquad(message, role) {
  const team = getTeamByRole(role);

  if (!team) {
    return message.reply(
      "❌ Bu takım kayıtlı değil."
    );
  }

  const players = getTeamPlayers(
    message.guild,
    team
  );

  const groups = {
    GK: [],
    DEF: [],
    MID: [],
    FWD: []
  };

  for (const player of players) {
    const pos = normalizePosition(player.position) || "MID";

    if (!groups[pos]) groups[pos] = [];

    groups[pos].push(player);
  }

  const fields = [];

  for (const pos of ["GK", "DEF", "MID", "FWD"]) {
    const list = groups[pos];

    fields.push({
      name: positionName(pos),
      value: list.length
        ? list
          .map(
            p =>
              `• ${p.member} — **${formatMoney(p.value)}**`
          )
          .join("\n")
        : "—"
    });
  }

  const totalValue = players.reduce(
    (sum, p) => sum + p.value,
    0
  );

  const embed = new EmbedBuilder()
    .setTitle(`📋 ${team.name} | Kadro`)
    .addFields(fields)
    .addFields({
      name: "📊 Kadro Bilgisi",
      value:
        `👥 Oyuncu: **${players.length}**\n` +
        `💰 Toplam değer: **${formatMoney(totalValue)}**`
    });

  await message.reply({
    embeds: [embed]
  });
}

/* =========================================================
   FORMASYON
   ========================================================= */

function formationMenu(teamId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`formation_${teamId}`)
      .setPlaceholder("Formasyon seç")
      .addOptions(
        formations.map(f => ({
          label: f,
          value: f,
          description: `${f} formasyonunu kullan`
        }))
      )
  );
}

/* =========================================================
   KUPA / MÜZE
   ========================================================= */

function getCups(teamId) {
  if (!data.cups[teamId]) {
    data.cups[teamId] = [];
  }

  return data.cups[teamId];
}

/* =========================================================
   YARDIM
   ========================================================= */

function helpEmbed() {
  return new EmbedBuilder()
    .setTitle("📚 AXERA LEAGUE | KOMUTLAR")
    .setDescription(
      "**👤 Kayıt**\n" +
      "`.k @Oyuncu TakmaAdı`\n" +
      "`.kayıtsızver @Oyuncu`\n\n" +

      "**💰 Değer**\n" +
      "`.dver @Oyuncu 5`\n" +
      "`.dsil @Oyuncu 5`\n\n" +

      "**⚽ Oyuncu**\n" +
      "`.ant` / `.antrenman`\n" +
      "`.pen` / `.penaltı`\n" +
      "`.ara isim`\n\n" +

      "**🏟️ Maç**\n" +
      "`.maç @Takım1 @Takım2`\n" +
      "`.puan`\n" +
      "`.puanekle @Takım 3`\n" +
      "`.takımdeğer @Takım 850M`\n\n" +

      "**👥 Kadro**\n" +
      "`.kadroekle @Takım @Oyuncu Pozisyon`\n" +
      "`.kadrocikar @Takım @Oyuncu`\n" +
      "`.kadro @Takım`\n" +
      "`.formasyon @Takım`\n\n" +

      "**📅 Fikstür**\n" +
      "`.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`\n" +
      "`.fikstür`\n" +
      "`.fikstürçıkar @Takım1 @Takım2`\n\n" +

      "**💵 Bütçe**\n" +
      "`.bütçe`\n" +
      "`.bütçe @Oyuncu`\n" +
      "`.gönder @Oyuncu 50`\n" +
      "`.paraekle @Oyuncu 50`\n" +
      "`.parasil @Oyuncu 20`\n" +
      "`.paraayarla @Oyuncu 100`\n\n" +

      "**🐦 Tweet**\n" +
      "`.tweet mesaj`\n\n" +

      "**🏆 Kupa / Müze**\n" +
      "`.kupaekle @Takım Kupa`\n" +
      "`.kupasil @Takım Kupa`\n" +
      "`.müze @Takım`\n\n" +

      "**🛠️ Yönetim**\n" +
      "`.takımekle @Takım`\n" +
      "`.takımkaldır @Takım`\n" +
      "`.sil miktar`\n" +
      "`.embed Başlık | Açıklama`\n" +
      "`.kick @Oyuncu`\n" +
      "`.ban @Oyuncu`\n" +
      "`.mute @Oyuncu`\n" +
      "`.unmute @Oyuncu`\n" +
      "`.dm @Oyuncu mesaj`\n\n" +

      "**🎫 Destek**\n" +
      "`.ticketpanel`\n\n" +

      "💡 **Not:** Birimsiz değerlerde `5` = **5M€** kabul edilir."
    );
}

/* =========================================================
   MESAJ EVENT
   ========================================================= */

client.on("messageCreate", async message => {
  try {
    if (!message.guild) return;
    if (message.author.bot) return;

    const content = message.content.trim();

    /*
     * Ticket otomatik kapanma sistemi için
     * ticket kanalında son mesaj zamanını güncelle.
     */
    const ticketData = data.tickets[message.channel.id];

    if (ticketData) {
      ticketData.lastMessageAt = Date.now();
      saveData();
    }

    if (!content.startsWith(PREFIX)) return;

    const args = content
      .slice(PREFIX.length)
      .trim()
      .split(/\s+/);

    const command = args.shift()?.toLowerCase();

    if (!command) return;

    /* =====================================================
       YARDIM
       ===================================================== */

    if (
      command === "yardım" ||
      command === "yardim"
    ) {
      return message.reply({
        embeds: [helpEmbed()]
      });
    }

    /* =====================================================
       KAYIT
       ===================================================== */

    if (command === "k") {
      if (
        message.channel.id !==
        CONFIG.channels.registration
      ) {
        return message.reply(
          `❌ Bu komut yalnızca <#${CONFIG.channels.registration}> kanalında kullanılabilir.`
        );
      }

      if (!isRegistrationStaff(message.member)) {
        return message.reply(
          "❌ Bu komutu yalnızca kayıt yetkilileri kullanabilir."
        );
      }

      const target = getMemberFromMention(
        message,
        message.content
          .slice(PREFIX.length + command.length)
          .trim()
      );

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.k @Oyuncu TakmaAdı`"
        );
      }

      const rest = removeFirstMention(
        message.content
          .slice(PREFIX.length + command.length)
          .trim()
      );

      if (!rest) {
        return message.reply(
          "❌ Takma ad belirtmelisin."
        );
      }

      data.registrationPanels[target.id] = {
        targetId: target.id,
        nickname: rest,
        createdBy: message.author.id,
        createdAt: Date.now()
      };

      saveData();

      const embed = new EmbedBuilder()
        .setTitle("📝 Axera League | Oyuncu Kaydı")
        .setDescription(
          `Kayıt yapılacak kişi: ${target}\n\n` +
          `Takma Ad: **${rest}**\n\n` +
          "Aşağıdaki butonlardan kayıt türünü seçin."
        );

      return message.reply({
        embeds: [embed],
        components: [registrationButtons(target.id)]
      });
    }

    if (command === "kayıtsızver" || command === "kayitsizver") {
      if (!isRegistrationStaff(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const target = getMemberFromMention(
        message,
        message.content
          .slice(PREFIX.length + command.length)
          .trim()
      );

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.kayıtsızver @Oyuncu`"
        );
      }

      for (const roleId of [
        CONFIG.roles.player,
        CONFIG.roles.goalkeeper,
        CONFIG.roles.technicalDirector,
        CONFIG.roles.member
      ]) {
        if (target.roles.cache.has(roleId)) {
          await target.roles.remove(roleId).catch(() => {});
        }
      }

      await target.roles
        .add(CONFIG.roles.unregistered)
        .catch(() => {});

      ensureUser(target.id).registered = false;

      saveData();

      return message.reply(
        `✅ ${target} kayıt dışı yapıldı.`
      );
    }

    /* =====================================================
       ARA
       ===================================================== */

    if (command === "ara") {
      const query = args.join(" ").toLowerCase();

      if (!query) {
        return message.reply(
          "❌ Aramak istediğin oyuncunun adını yaz."
        );
      }

      const results = message.guild.members.cache
        .filter(member => {
          if (member.user.bot) return false;
          if (!registered(member)) return false;

          const name = (
            member.nickname ||
            member.displayName ||
            member.user.username
          ).toLowerCase();

          return name.includes(query);
        })
        .first(15);

      if (!results.length) {
        return message.reply(
          "🔎 Kayıtlı oyuncu bulunamadı."
        );
      }

      const text = results
        .map(member => {
          const value = extractPlayerValue(member);

          return (
            `• ${member} — ` +
            `**${formatMoney(value)}**`
          );
        })
        .join("\n");

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🔎 Axera League | Oyuncu Arama")
            .setDescription(text)
        ]
      });
    }

    /* =====================================================
       DEĞER VER
       ===================================================== */

    if (command === "dver") {
      if (!isValueStaff(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      if (
        message.channel.id !== CONFIG.channels.tweet
      ) {
        return message.reply(
          `❌ Bu komut yalnızca <#${CONFIG.channels.tweet}> kanalında kullanılabilir.`
        );
      }

      const raw = message.content
        .slice(PREFIX.length + command.length)
        .trim();

      const target = getMemberFromMention(
        message,
        raw
      );

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.dver @Oyuncu 5`"
        );
      }

      const amountText = removeFirstMention(raw);
      const amount = parseMoney(amountText);

      if (!Number.isFinite(amount) || amount <= 0) {
        return message.reply(
          "❌ Geçerli bir değer gir.\n" +
          "Örnek: `.dver @Oyuncu 5` = **+5M€**"
        );
      }

      const before = extractPlayerValue(target);
      const after = await addPlayerValue(
        target,
        amount
      );

      return message.reply(
        `✅ ${target} değerine **+${formatMoney(amount)}** eklendi.\n\n` +
        `📊 Önce: **${formatMoney(before)}**\n` +
        `📊 Sonra: **${formatMoney(after)}**`
      );
    }

    /* =====================================================
       DEĞER SİL
       ===================================================== */

    if (command === "dsil") {
      if (!isValueStaff(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      if (
        message.channel.id !== CONFIG.channels.tweet
      ) {
        return message.reply(
          `❌ Bu komut yalnızca <#${CONFIG.channels.tweet}> kanalında kullanılabilir.`
        );
      }

      const raw = message.content
        .slice(PREFIX.length + command.length)
        .trim();

      const target = getMemberFromMention(
        message,
        raw
      );

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.dsil @Oyuncu 5`"
        );
      }

      const amountText = removeFirstMention(raw);
      const amount = parseMoney(amountText);

      if (!Number.isFinite(amount) || amount <= 0) {
        return message.reply(
          "❌ Geçerli bir değer gir.\n" +
          "Örnek: `.dsil @Oyuncu 5` = **-5M€**"
        );
      }

      const before = extractPlayerValue(target);
      const after = await removePlayerValue(
        target,
        amount
      );

      return message.reply(
        `✅ ${target} değerinden **-${formatMoney(amount)}** çıkarıldı.\n\n` +
        `📊 Önce: **${formatMoney(before)}**\n` +
        `📊 Sonra: **${formatMoney(after)}**`
      );
    }

    /* =====================================================
       ANTRENMAN
       ===================================================== */

    if (
      command === "ant" ||
      command === "antrenman"
    ) {
      if (
        message.channel.id !==
        CONFIG.channels.training
      ) {
        return message.reply(
          `❌ Antrenman yalnızca <#${CONFIG.channels.training}> kanalında kullanılabilir.`
        );
      }

      return startTraining(message);
    }

    /* =====================================================
       PENALTI
       ===================================================== */

    if (
      command === "pen" ||
      command === "penaltı" ||
      command === "penalti"
    ) {
      if (
        message.channel.id !==
        CONFIG.channels.penalty
      ) {
        return message.reply(
          `❌ Penaltı yalnızca <#${CONFIG.channels.penalty}> kanalında kullanılabilir.`
        );
      }

      return penalty(message);
    }

    /* =====================================================
       TWEET
       ===================================================== */

    if (command === "tweet") {
      return sendTweet(
        message,
        message.content
          .slice(PREFIX.length + command.length)
          .trim()
      );
    }

    /* =====================================================
       BÜTÇE
       ===================================================== */

    if (
      command === "bütçe" ||
      command === "butce"
    ) {
      const raw = message.content
        .slice(PREFIX.length + command.length)
        .trim();

      if (!raw) {
        return showBudget(message);
      }

      const target = getMemberFromMention(
        message,
        raw
      );

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.bütçe @Oyuncu`"
        );
      }

      return showBudget(message, target);
    }

    if (command === "gönder" || command === "gonder") {
      const raw = message.content
        .slice(PREFIX.length + command.length)
        .trim();

      const target = getMemberFromMention(
        message,
        raw
      );

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.gönder @Oyuncu 50`"
        );
      }

      const amountText = removeFirstMention(raw);

      return transferBudget(
        message,
        target,
        amountText
      );
    }

    /* =====================================================
       PARA EKLE
       ===================================================== */

    if (command === "paraekle") {
      if (!isValueStaff(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const raw = message.content
        .slice(PREFIX.length + command.length)
        .trim();

      const target = getMemberFromMention(
        message,
        raw
      );

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.paraekle @Oyuncu 50`"
        );
      }

      const amount = parseMoney(
        removeFirstMention(raw)
      );

      if (!Number.isFinite(amount) || amount <= 0) {
        return message.reply("❌ Geçersiz miktar.");
      }

      const user = ensureUser(target.id);
      user.budget += amount;

      saveData();

      return message.reply(
        `✅ ${target} bütçesine **+${formatMoney(amount)}** eklendi.\n` +
        `💰 Yeni bütçe: **${formatMoney(user.budget)}**`
      );
    }

    /* =====================================================
       PARA SİL
       ===================================================== */

    if (command === "parasil") {
      if (!isValueStaff(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const raw = message.content
        .slice(PREFIX.length + command.length)
        .trim();

      const target = getMemberFromMention(
        message,
        raw
      );

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.parasil @Oyuncu 20`"
        );
      }

      const amount = parseMoney(
        removeFirstMention(raw)
      );

      if (!Number.isFinite(amount) || amount <= 0) {
        return message.reply("❌ Geçersiz miktar.");
      }

      const user = ensureUser(target.id);

      user.budget = Math.max(
        0,
        user.budget - amount
      );

      saveData();

      return message.reply(
        `✅ ${target} bütçesinden **${formatMoney(amount)}** silindi.\n` +
        `💰 Yeni bütçe: **${formatMoney(user.budget)}**`
      );
    }

    /* =====================================================
       PARA AYARLA
       ===================================================== */

    if (command === "paraayarla") {
      if (!isValueStaff(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const raw = message.content
        .slice(PREFIX.length + command.length)
        .trim();

      const target = getMemberFromMention(
        message,
        raw
      );

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.paraayarla @Oyuncu 100`"
        );
      }

      const amount = parseMoney(
        removeFirstMention(raw)
      );

      if (!Number.isFinite(amount) || amount < 0) {
        return message.reply("❌ Geçersiz miktar.");
      }

      const user = ensureUser(target.id);

      user.budget = amount;

      saveData();

      return message.reply(
        `✅ ${target} bütçesi **${formatMoney(amount)}** olarak ayarlandı.`
      );
    }

    /* =====================================================
       TAKIM EKLE
       ===================================================== */

    if (command === "takımekle" || command === "takimekle") {
      if (!isMatchStaff(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const role = findTeamFromInput(
        message.guild,
        args[0]
      );

      if (!role) {
        return message.reply(
          "❌ Geçerli bir takım rolü belirt."
        );
      }

      if (data.teams[role.id]) {
        return message.reply(
          "❌ Bu takım zaten kayıtlı."
        );
      }

      ensureTeam(role);

      saveData();

      return message.reply(
        `✅ **${role.name}** Axera League'e eklendi.`
      );
    }

    /* =====================================================
       TAKIM KALDIR
       ===================================================== */

    if (
      command === "takımkaldır" ||
      command === "takimkaldir"
    ) {
      if (!isMatchStaff(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const role = findTeamFromInput(
        message.guild,
        args[0]
      );

      if (!role) {
        return message.reply(
          "❌ Takım bulunamadı."
        );
      }

      const active = Object.values(
        data.activeMatches
      ).some(
        m =>
          m.team1Id === role.id ||
          m.team2Id === role.id
      );

      if (active) {
        return message.reply(
          "❌ Aktif maçı olan takım kaldırılamaz."
        );
      }

      delete data.teams[role.id];
      delete data.standings[role.id];
      delete data.cups[role.id];
      delete data.formations[role.id];

      data.fixtures = data.fixtures.filter(
        fixture =>
          fixture.team1Id !== role.id &&
          fixture.team2Id !== role.id
      );

      saveData();

      return message.reply(
        `🗑️ **${role.name}** Axera League'den kaldırıldı.`
      );
    }

    /* =====================================================
       PUAN
       ===================================================== */

    if (command === "puan") {
      const sorted = sortStandings();

      if (!sorted.length) {
        return message.reply(
          "📊 Henüz kayıtlı takım bulunmuyor."
        );
      }

      const lines = sorted.map((team, index) => {
        const role = message.guild.roles.cache.get(
          team.teamId
        );

        return (
          `**${index + 1}.** ${role ? role.name : "Silinmiş Takım"} ` +
          `— **${team.points} P** | ` +
          `AV: **${team.gd}** | AG: **${team.gf}**`
        );
      });

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🏆 Axera League | Puan Durumu")
            .setDescription(lines.join("\n"))
        ]
      });
    }

    /* =====================================================
       PUAN EKLE
       ===================================================== */

    if (command === "puanekle") {
      if (!isMatchStaff(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const role = findTeamFromInput(
        message.guild,
        args[0]
      );

      const amount = Number(args[1]);

      if (!role || !Number.isInteger(amount)) {
        return message.reply(
          "❌ Kullanım: `.puanekle @Takım 3`"
        );
      }

      ensureTeam(role);

      data.standings[role.id].points += amount;

      saveData();

      return message.reply(
        `✅ **${role.name}** takımına **${amount} puan** eklendi.`
      );
    }

    /* =====================================================
       TAKIM DEĞERİ
       ===================================================== */

    if (command === "takımdeğer" || command === "takimdeger") {
      if (!isMatchStaff(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const role = findTeamFromInput(
        message.guild,
        args[0]
      );

      const amount = parseMoney(args[1]);

      if (!role || !Number.isFinite(amount)) {
        return message.reply(
          "❌ Kullanım: `.takımdeğer @Takım 850M`"
        );
      }

      const team = ensureTeam(role);

      team.budget = amount;

      saveData();

      return message.reply(
        `✅ **${role.name}** takım bütçesi/değeri **${formatMoney(amount)}** olarak ayarlandı.`
      );
    }

    /* =====================================================
       KADRO EKLE
       ===================================================== */

    if (command === "kadroekle") {
      if (!isMatchStaff(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const role = findTeamFromInput(
        message.guild,
        args[0]
      );

      if (!role) {
        return message.reply(
          "❌ Takım bulunamadı."
        );
      }

      const playerMention = args[1];

      if (!playerMention) {
        return message.reply(
          "❌ Oyuncu belirtmelisin."
        );
      }

      const target = getMemberFromMention(
        message,
        playerMention
      );

      if (!target) {
        return message.reply(
          "❌ Oyuncu bulunamadı."
        );
      }

      const position =
        normalizePosition(args[2]);

      if (!position) {
        return message.reply(
          "❌ Pozisyon belirt.\n" +
          "`GK`, `DEF`, `MID`, `FWD`"
        );
      }

      const team = ensureTeam(role);

      const existing = team.players.find(
        p => p.userId === target.id
      );

      if (existing) {
        existing.position = position;
        existing.value = extractPlayerValue(target);
      } else {
        team.players.push({
          userId: target.id,
          position,
          value: extractPlayerValue(target)
        });
      }

      saveData();

      return message.reply(
        `✅ ${target}, **${role.name}** kadrosuna ` +
        `**${positionName(position)}** olarak eklendi.`
      );
    }

    /* =====================================================
       KADRO ÇIKAR
       ===================================================== */

    if (command === "kadrocikar") {
      if (!isMatchStaff(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const role = findTeamFromInput(
        message.guild,
        args[0]
      );

      const target = getMemberFromMention(
        message,
        args[1] || ""
      );

      if (!role || !target) {
        return message.reply(
          "❌ Kullanım: `.kadrocikar @Takım @Oyuncu`"
        );
      }

      const team = getTeamByRole(role);

      if (!team) {
        return message.reply(
          "❌ Takım kayıtlı değil."
        );
      }

      const before = team.players.length;

      team.players = team.players.filter(
        p => p.userId !== target.id
      );

      saveData();

      if (before === team.players.length) {
        return message.reply(
          "❌ Oyuncu bu takımın manuel kadrosunda bulunamadı."
        );
      }

      return message.reply(
        `✅ ${target}, **${role.name}** kadrosundan çıkarıldı.`
      );
    }

    /* =====================================================
       KADRO
       ===================================================== */

    if (command === "kadro") {
      const role = findTeamFromInput(
        message.guild,
        args[0]
      );

      if (!role) {
        return message.reply(
          "❌ Kullanım: `.kadro @Takım`"
        );
      }

      return showSquad(message, role);
    }

    /* =====================================================
       FORMASYON
       ===================================================== */

    if (command === "formasyon") {
      if (!isMatchStaff(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const role = findTeamFromInput(
        message.guild,
        args[0]
      );

      if (!role) {
        return message.reply(
          "❌ Takım bulunamadı."
        );
      }

      return message.reply({
        content:
          `⚽ **${role.name}** için formasyon seç:`,
        components: [
          formationMenu(role.id)
        ]
      });
    }

    /* =====================================================
       FİKSTÜR EKLE
       ===================================================== */

    if (
      command === "fiksturekle" ||
      command === "fikstür ekle"
    ) {
      if (!isMatchStaff(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const role1 = findTeamFromInput(
        message.guild,
        args[0]
      );

      const role2 = findTeamFromInput(
        message.guild,
        args[1]
      );

      if (!role1 || !role2) {
        return message.reply(
          "❌ İki geçerli takım belirtmelisin."
        );
      }

      const date = args[2];
      const time = args[3];

      if (!date || !time) {
        return message.reply(
          "❌ Kullanım:\n" +
          "`.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`"
        );
      }

      const timestamp = parseDateTime(
        date,
        time
      );

      if (!timestamp) {
        return message.reply(
          "❌ Geçersiz tarih/saat."
        );
      }

      const fixture = {
        id: data.nextFixtureId++,
        team1Id: role1.id,
        team2Id: role2.id,
        timestamp,
        date,
        time,
        status: "scheduled"
      };

      data.fixtures.push(fixture);

      ensureTeam(role1);
      ensureTeam(role2);

      saveData();

      return message.reply(
        `📅 Fikstür eklendi:\n\n` +
        `**${role1.name}** 🆚 **${role2.name}**\n` +
        `🕐 ${date} ${time}`
      );
    }

    /* =====================================================
       FİKSTÜR LİSTELE
       ===================================================== */

    if (
      command === "fikstür" ||
      command === "fikstur"
    ) {
      const fixtures = data.fixtures
        .filter(f => f.status !== "cancelled")
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(0, 20);

      if (!fixtures.length) {
        return message.reply(
          "📅 Fikstür bulunmuyor."
        );
      }

      const lines = fixtures.map(f => {
        const team1 =
          data.teams[f.team1Id]?.name ||
          "Silinmiş Takım";

        const team2 =
          data.teams[f.team2Id]?.name ||
          "Silinmiş Takım";

        let status = "⏳ Planlandı";

        if (f.status === "live") {
          status = "🔴 Canlı";
        }

        if (f.status === "completed") {
          status = "✅ Tamamlandı";
        }

        return (
          `**#${f.id}** ${team1} 🆚 ${team2}\n` +
          `🕐 ${f.date} ${f.time} — ${status}`
        );
      });

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("📅 Axera League | Fikstür")
            .setDescription(lines.join("\n\n"))
        ]
      });
    }

    /* =====================================================
       FİKSTÜR ÇIKAR
       ===================================================== */

    if (
      command === "fiksturcikar" ||
      command === "fikstürçıkar" ||
      command === "fiksturçıkar"
    ) {
      if (!isMatchStaff(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const role1 = findTeamFromInput(
        message.guild,
        args[0]
      );

      const role2 = findTeamFromInput(
        message.guild,
        args[1]
      );

      if (!role1 || !role2) {
        return message.reply(
          "❌ İki takım belirt."
        );
      }

      const before = data.fixtures.length;

      data.fixtures = data.fixtures.filter(
        f =>
          !(
            f.team1Id === role1.id &&
            f.team2Id === role2.id &&
            f.status === "scheduled"
          )
      );

      saveData();

      if (before === data.fixtures.length) {
        return message.reply(
          "❌ Bu iki takım arasında planlanmış fikstür bulunamadı."
        );
      }

      return message.reply(
        `🗑️ **${role1.name} - ${role2.name}** fikstürü kaldırıldı.`
      );
    }

    /* =====================================================
       TAKIM BÜTÇE
       ===================================================== */

    if (
      command === "takımbütçe" ||
      command === "takimbutce"
    ) {
      const role = findTeamFromInput(
        message.guild,
        args[0]
      );

      if (!role) {
        return message.reply(
          "❌ Kullanım: `.takımbütçe @Takım`"
        );
      }

      return showTeamBudget(
        message,
        role
      );
    }

    /* =====================================================
       KUPA EKLE
       ===================================================== */

    if (command === "kupaekle") {
      if (!isMatchStaff(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const role = findTeamFromInput(
        message.guild,
        args[0]
      );

      const cupName = args.slice(1).join(" ");

      if (!role || !cupName) {
        return message.reply(
          "❌ Kullanım: `.kupaekle @Takım KupaAdı`"
        );
      }

      const cups = getCups(role.id);

      cups.push({
        name: cupName,
        date: Date.now()
      });

      saveData();

      return message.reply(
        `🏆 **${cupName}**, **${role.name}** müzesine eklendi.`
      );
    }

    /* =====================================================
       KUPA SİL
       ===================================================== */

    if (command === "kupasil") {
      if (!isMatchStaff(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const role = findTeamFromInput(
        message.guild,
        args[0]
      );

      const cupName = args.slice(1).join(" ");

      if (!role || !cupName) {
        return message.reply(
          "❌ Kullanım: `.kupasil @Takım KupaAdı`"
        );
      }

      const cups = getCups(role.id);

      const before = cups.length;

      data.cups[role.id] = cups.filter(
        cup =>
          cup.name.toLowerCase() !==
          cupName.toLowerCase()
      );

      saveData();

      if (before === data.cups[role.id].length) {
        return message.reply(
          "❌ Bu kupa bulunamadı."
        );
      }

      return message.reply(
        `🗑️ **${cupName}**, **${role.name}** müzesinden silindi.`
      );
    }

    /* =====================================================
       MÜZE
       ===================================================== */

    if (
      command === "müze" ||
      command === "muze"
    ) {
      const role = findTeamFromInput(
        message.guild,
        args[0]
      );

      if (!role) {
        return message.reply(
          "❌ Kullanım: `.müze @Takım`"
        );
      }

      const cups = getCups(role.id);

      const description = cups.length
        ? cups
          .map(
            (cup, i) =>
              `🏆 **${i + 1}.** ${cup.name}`
          )
          .join("\n")
        : "Henüz kazanılmış kupa bulunmuyor.";

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`🏛️ ${role.name} | Müze`)
            .setDescription(description)
        ]
      });
    }

    /* =====================================================
       TICKET PANEL
       ===================================================== */

    if (command === "ticketpanel") {
      if (!isAdmin(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId("create_ticket")
            .setLabel("Destek Talebi Oluştur")
            .setEmoji("🎫")
            .setStyle(ButtonStyle.Primary)
        );

      const embed = new EmbedBuilder()
        .setTitle("🎫 Axera League | Destek")
        .setDescription(
          "Destek almak için aşağıdaki butona basarak özel ticket oluşturabilirsin."
        );

      return message.channel.send({
        embeds: [embed],
        components: [row]
      });
    }

    /* =====================================================
       SİL
       ===================================================== */

    if (command === "sil") {
      if (!isAdmin(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      let amount = Number(args[0]);

      if (!Number.isInteger(amount)) {
        return message.reply(
          "❌ Kullanım: `.sil 10`"
        );
      }

      amount = Math.max(
        1,
        Math.min(CONFIG.maxMessagesDelete, amount)
      );

      const deleted = await message.channel.bulkDelete(
        amount + 1,
        true
      ).catch(() => null);

      if (!deleted) {
        return message.reply(
          "❌ Mesajlar silinemedi."
        );
      }

      const info = await message.channel.send(
        `🗑️ **${deleted.size - 1}** mesaj silindi.`
      );

      setTimeout(() => {
        info.delete().catch(() => {});
      }, 3000);

      return;
    }

    /* =====================================================
       EMBED
       ===================================================== */

    if (command === "embed") {
      if (!isAdmin(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const raw = message.content
        .slice(PREFIX.length + command.length)
        .trim();

      const parts = raw.split("|");

      const title = parts.shift()?.trim();
      const description = parts.join("|").trim();

      if (!title || !description) {
        return message.reply(
          "❌ Kullanım: `.embed Başlık | Açıklama`"
        );
      }

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();

      return message.channel.send({
        embeds: [embed]
      });
    }

    /* =====================================================
       KICK
       ===================================================== */

    if (command === "kick") {
      if (!isModerator(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const target = getMemberFromMention(
        message,
        args.join(" ")
      );

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.kick @Oyuncu`"
        );
      }

      if (!target.kickable) {
        return message.reply(
          "❌ Bu üyeyi atamıyorum."
        );
      }

      await target.kick(
        `Axera League - ${message.author.tag}`
      );

      return message.reply(
        `👢 ${target.user.tag} sunucudan atıldı.`
      );
    }

    /* =====================================================
       BAN
       ===================================================== */

    if (command === "ban") {
      if (!isModerator(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const target = getMemberFromMention(
        message,
        args.join(" ")
      );

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.ban @Oyuncu`"
        );
      }

      if (!target.bannable) {
        return message.reply(
          "❌ Bu üyeyi yasaklayamıyorum."
        );
      }

      await target.ban({
        reason:
          `Axera League - ${message.author.tag}`
      });

      return message.reply(
        `🔨 ${target.user.tag} yasaklandı.`
      );
    }

    /* =====================================================
       MUTE
       ===================================================== */

    if (command === "mute") {
      if (!isModerator(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const target = getMemberFromMention(
        message,
        args.join(" ")
      );

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.mute @Oyuncu`"
        );
      }

      try {
        await target.timeout(
          10 * 60 * 1000,
          `Axera League - ${message.author.tag}`
        );

        return message.reply(
          `🔇 ${target} 10 dakika susturuldu.`
        );
      } catch {
        return message.reply(
          "❌ Üye susturulamadı."
        );
      }
    }

    /* =====================================================
       UNMUTE
       ===================================================== */

    if (command === "unmute") {
      if (!isModerator(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const target = getMemberFromMention(
        message,
        args.join(" ")
      );

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.unmute @Oyuncu`"
        );
      }

      try {
        await target.timeout(
          null,
          `Axera League - ${message.author.tag}`
        );

        return message.reply(
          `🔊 ${target} susturması kaldırıldı.`
        );
      } catch {
        return message.reply(
          "❌ Susturma kaldırılamadı."
        );
      }
    }

    /* =====================================================
       DM
       ===================================================== */

    if (command === "dm") {
      if (!isAdmin(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const raw = message.content
        .slice(PREFIX.length + command.length)
        .trim();

      const target = getMemberFromMention(
        message,
        raw
      );

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.dm @Oyuncu mesaj`"
        );
      }

      const text = removeFirstMention(raw);

      if (!text) {
        return message.reply(
          "❌ Gönderilecek mesajı yaz."
        );
      }

      try {
        await target.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("📩 Axera League")
              .setDescription(text)
              .setTimestamp()
          ]
        });

        return message.reply(
          `✅ Mesaj ${target} kullanıcısına gönderildi.`
        );
      } catch {
        return message.reply(
          "❌ Kullanıcıya DM gönderilemedi."
        );
      }
    }

    /* =====================================================
       MAÇ
       ===================================================== */

    if (
      command === "maç" ||
      command === "mac"
    ) {
      if (!isMatchStaff(message.member)) {
        return message.reply("❌ Maç yetkin yok.");
      }

      if (
        message.channel.id !== CONFIG.channels.match
      ) {
        return message.reply(
          `❌ Maç komutu yalnızca <#${CONFIG.channels.match}> kanalında kullanılabilir.`
        );
      }

      const role1 = findTeamFromInput(
        message.guild,
        args[0]
      );

      const role2 = findTeamFromInput(
        message.guild,
        args[1]
      );

      if (!role1 || !role2) {
        return message.reply(
          "❌ Kullanım: `.maç @Takım1 @Takım2`"
        );
      }

      if (role1.id === role2.id) {
        return message.reply(
          "❌ Aynı takım kendisiyle oynayamaz."
        );
      }

      const team1 = getTeamByRole(role1);
      const team2 = getTeamByRole(role2);

      if (!team1 || !team2) {
        return message.reply(
          "❌ İki takımın da Axera League'e kayıtlı olması gerekiyor."
        );
      }

      const alreadyPlaying = Object.values(
        data.activeMatches
      ).some(
        m =>
          m.team1Id === team1.id ||
          m.team2Id === team1.id ||
          m.team1Id === team2.id ||
          m.team2Id === team2.id
      );

      if (alreadyPlaying) {
        return message.reply(
          "❌ Takımlardan biri zaten aktif bir maçta."
        );
      }

      await startLiveMatch(
        message.channel,
        team1,
        team2
      );

      return;
    }
  } catch (err) {
    console.error("messageCreate hatası:", err);

    try {
      await message.reply(
        "❌ İşlem sırasında beklenmeyen bir hata oluştu."
      );
    } catch {}
  }
});

/* =========================================================
   BUTONLAR
   ========================================================= */

client.on("interactionCreate", async interaction => {
  try {
    if (
      interaction.isButton() &&
      interaction.customId.startsWith("register_")
    ) {
      if (!isRegistrationStaff(interaction.member)) {
        return interaction.reply({
          content: "❌ Bu butonları yalnızca kayıt yetkilileri kullanabilir.",
          ephemeral: true
        });
      }

      const parts =
        interaction.customId.split("_");

      const type = parts[1];
      const targetId = parts.slice(2).join("_");

      const panel =
        data.registrationPanels[targetId];

      if (!panel) {
        return interaction.reply({
          content: "❌ Bu kayıt paneli artık geçerli değil.",
          ephemeral: true
        });
      }

      const target =
        interaction.guild.members.cache.get(
          targetId
        );

      if (!target) {
        return interaction.reply({
          content: "❌ Oyuncu bulunamadı.",
          ephemeral: true
        });
      }

      const success =
        await registerMember(
          target,
          type === "td"
            ? "technicalDirector"
            : type,
          panel.nickname
        );

      if (!success) {
        return interaction.reply({
          content: "❌ Kayıt yapılamadı.",
          ephemeral: true
        });
      }

      delete data.registrationPanels[targetId];
      saveData();

      const typeNames = {
        player: "⚽ Futbolcu",
        goalkeeper: "🧤 Kaleci",
        td: "🧑‍💼 Teknik Direktör",
        member: "👤 Üye"
      };

      return interaction.update({
        embeds: [
          new EmbedBuilder()
            .setTitle("✅ Kayıt Tamamlandı")
            .setDescription(
              `${target} başarıyla kaydedildi.\n\n` +
              `👤 Takma Ad: **${panel.nickname}**\n` +
              `🏷️ Tür: **${typeNames[type]}**`
            )
        ],
        components: []
      });
    }

    /* =====================================================
       FORMASYON BUTONU
       ===================================================== */

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId.startsWith("formation_")
    ) {
      if (!isMatchStaff(interaction.member)) {
        return interaction.reply({
          content: "❌ Yetkin yok.",
          ephemeral: true
        });
      }

      const teamId =
        interaction.customId.replace(
          "formation_",
          ""
        );

      const formation =
        interaction.values[0];

      if (!data.teams[teamId]) {
        return interaction.reply({
          content: "❌ Takım bulunamadı.",
          ephemeral: true
        });
      }

      data.formations[teamId] = formation;
      data.teams[teamId].formation = formation;

      saveData();

      return interaction.update({
        content:
          `✅ **${data.teams[teamId].name}** formasyonu **${formation}** olarak ayarlandı.`,
        components: []
      });
    }

    /* =====================================================
       TICKET OLUŞTUR
       ===================================================== */

    if (
      interaction.isButton() &&
      interaction.customId === "create_ticket"
    ) {
      const guild = interaction.guild;

      const existing =
        Object.entries(data.tickets).find(
          ([channelId, ticket]) =>
            ticket.userId === interaction.user.id &&
            guild.channels.cache.has(channelId)
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
          name:
            `ticket-${interaction.user.username}`
              .toLowerCase()
              .replace(/[^a-z0-9-]/g, "")
              .slice(0, 80),

          type: 0,

          permissionOverwrites: [
            {
              id: guild.id,
              deny: [
                PermissionsBitField.Flags.ViewChannel
              ]
            },
            {
              id: interaction.user.id,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory
              ]
            },

            ...[
              CONFIG.roles.admin,
              CONFIG.roles.moderator
            ].map(roleId => ({
              id: roleId,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory
              ]
            }))
          ]
        });

      data.tickets[channel.id] = {
        userId: interaction.user.id,
        createdAt: Date.now(),
        lastMessageAt: Date.now()
      };

      saveData();

      await channel.send({
        content: `${interaction.user}`,
        embeds: [
          new EmbedBuilder()
            .setTitle("🎫 Destek Talebi")
            .setDescription(
              "Destek talebiniz oluşturuldu.\n\n" +
              "Yetkililer en kısa sürede sizinle ilgilenecektir.\n\n" +
              "⚠️ 60 dakika boyunca mesaj gönderilmezse ticket otomatik kapanabilir."
            )
        ]
      });

      return interaction.reply({
        content:
          `✅ Ticket oluşturuldu: ${channel}`,
        ephemeral: true
      });
    }
  } catch (err) {
    console.error("interactionCreate hatası:", err);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content:
          "❌ İşlem sırasında hata oluştu.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

/* =========================================================
   ÜYE SUNUCUYA GİRDİĞİNDE
   ========================================================= */

client.on("guildMemberAdd", async member => {
  try {
    if (member.user.bot) return;

    await member.roles
      .add(CONFIG.roles.unregistered)
      .catch(() => {});

    ensureUser(member.id);

    saveData();

    const channel =
      member.guild.channels.cache.get(
        CONFIG.channels.registration
      );

    if (!channel) return;

    await channel.send({
      content:
        `${member} sunucuya hoş geldin! <@&${CONFIG.roles.admin}>`,
      embeds: [
        new EmbedBuilder()
          .setTitle("👋 Axera League'e Hoş Geldin")
          .setDescription(
            `${member}, hoş geldin!\n\n` +
            "Kayıt işlemin için kayıt yetkililerinin ilgilenmesini bekleyebilirsin."
          )
      ]
    });
  } catch (err) {
    console.error("guildMemberAdd:", err);
  }
});

/* =========================================================
   TICKET OTOMATİK KAPATMA
   ========================================================= */

setInterval(async () => {
  const now = Date.now();

  for (const [channelId, ticket] of Object.entries(
    data.tickets
  )) {
    if (
      now - Number(ticket.lastMessageAt || ticket.createdAt) <
      CONFIG.ticketTimeout
    ) {
      continue;
    }

    const channel =
      client.channels.cache.get(channelId);

    if (channel) {
      await channel.delete(
        "60 dakika boyunca mesaj gönderilmedi."
      ).catch(() => {});
    }

    delete data.tickets[channelId];
    saveData();
  }
}, 60 * 1000);

/* =========================================================
   ROL PANELİ
   ========================================================= */

client.on("messageCreate", async message => {
  if (
    message.author.bot ||
    !message.guild ||
    !message.content.startsWith(".rolpanel")
  ) {
    return;
  }

  if (!isAdmin(message.member)) return;

  const embed = new EmbedBuilder()
    .setTitle("🏷️ Axera League | Roller")
    .setDescription(
      `🛡️ Yönetici: <@&${CONFIG.roles.admin}>\n` +
      `💰 Değer Yetkilisi: <@&${CONFIG.roles.value}>\n` +
      `⚽ Futbolcu: <@&${CONFIG.roles.player}>\n` +
      `🧤 Kaleci: <@&${CONFIG.roles.goalkeeper}>\n` +
      `🧑‍💼 Teknik Direktör: <@&${CONFIG.roles.technicalDirector}>\n` +
      `👤 Üye: <@&${CONFIG.roles.member}>\n` +
      `🛡️ Moderatör: <@&${CONFIG.roles.moderator}>\n` +
      `🏟️ Maç Yetkilisi: <@&${CONFIG.roles.match}>`
    );

  await message.channel.send({
    embeds: [embed]
  });
});

/* =========================================================
   HATA YAKALAMA
   ========================================================= */

process.on("unhandledRejection", error => {
  console.error("Unhandled Promise Rejection:", error);
});

process.on("uncaughtException", error => {
  console.error("Uncaught Exception:", error);
});

/* =========================================================
   READY
   ========================================================= */

client.once("ready", () => {
  console.log("======================================");
  console.log("       AXERA LEAGUE BOT ONLINE");
  console.log("======================================");
  console.log(`Bot: ${client.user.tag}`);
  console.log(`Sunucu sayısı: ${client.guilds.cache.size}`);
  console.log(`Tweet Kanalı: ${CONFIG.channels.tweet}`);
  console.log("======================================");

  client.user.setPresence({
    activities: [
      {
        name: "Axera League ⚽",
        type: 3
      }
    ],
    status: "online"
  });
});

/* =========================================================
   TOKEN
   ========================================================= */

if (!process.env.TOKEN) {
  console.error(
    "❌ TOKEN bulunamadı! Railway Variables kısmına TOKEN ekle."
  );
  process.exit(1);
}

client.login(process.env.TOKEN);
