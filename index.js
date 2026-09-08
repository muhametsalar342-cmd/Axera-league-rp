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

/* =========================================================
   AXERA LEAGUE
   FOOTBALL RP DISCORD BOT
   Discord.js v14
   Node.js 20+
========================================================= */

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
   ID AYARLARI
========================= */

const ROLES = {
  ADMIN: "1534456315366342716",
  REGISTRATION: "1534456315366342716",
  VALUE: "1534456192913375382",
  UNREGISTERED: "1534457560134844517",
  GOALKEEPER: "1534492034243498195",
  PLAYER: "1534457228986421278",
  MEMBER: "1534457460163608636",
  MANAGER: "1534456648930693120",
  MODERATOR: "1534450307088715917",
  MATCH: "1535251168169697390"
};

const CHANNELS = {
  REGISTRATION: "1534460177884123276",
  CHAT: "1534469475917758586",
  TRAINING: "1534474070798762197",
  PENALTY: "1534474327812997192",
  MATCH: "1534477626872168541",
  STANDINGS: "1534475991404253284",
  TWEET: "1534636658668998716"
};

const DATA_FILE = path.join(__dirname, "data.json");

/* =========================
   DATA
========================= */

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

let DATA = loadData();

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(DEFAULT_DATA, null, 2)
      );
      return structuredClone(DEFAULT_DATA);
    }

    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);

    return {
      ...structuredClone(DEFAULT_DATA),
      ...parsed,
      users: parsed.users || {},
      teams: parsed.teams || {},
      standings: parsed.standings || {},
      fixtures: parsed.fixtures || [],
      activeMatches: parsed.activeMatches || {},
      registrationPanels: parsed.registrationPanels || {},
      tickets: parsed.tickets || {},
      cups: parsed.cups || {},
      formations: parsed.formations || {},
      training: parsed.training || {},
      tweetCooldowns: parsed.tweetCooldowns || {},
      matchRewards: parsed.matchRewards || {},
      playerMatchHistory: parsed.playerMatchHistory || {},
      penalties: parsed.penalties || {},
      stats: parsed.stats || {},
      matchHistory: parsed.matchHistory || []
    };
  } catch (err) {
    console.error("data.json okunamadı:", err);
    return structuredClone(DEFAULT_DATA);
  }
}

function saveData() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(DATA, null, 2)
    );
  } catch (err) {
    console.error("Veri kaydetme hatası:", err);
  }
}

/* =========================
   YARDIMCI FONKSİYONLAR
========================= */

function isAdmin(member) {
  return (
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.roles.cache.has(ROLES.ADMIN)
  );
}

function hasRole(member, roleId) {
  return member.roles.cache.has(roleId);
}

function hasValuePermission(member) {
  return isAdmin(member) || hasRole(member, ROLES.VALUE);
}

function hasRegistrationPermission(member) {
  return isAdmin(member) || hasRole(member, ROLES.REGISTRATION);
}

function hasMatchPermission(member) {
  return isAdmin() ||
    hasRole(member, ROLES.MATCH);
}

function hasModerationPermission(member) {
  return isAdmin(member) ||
    hasRole(member, ROLES.MODERATOR);
}

function money(value) {
  return `${formatMoney(value)}€`;
}

function formatMoney(value) {
  value = Math.max(0, Math.floor(Number(value) || 0));

  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(
      value % 1_000_000_000 === 0 ? 0 : 2
    )}B`;
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(
      value % 1_000_000 === 0 ? 0 : 2
    )}M`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(
      value % 1_000 === 0 ? 0 : 2
    )}K`;
  }

  return `${value}`;
}

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
  }

  const number = Number(text);

  if (!Number.isFinite(number)) return NaN;

  return Math.floor(number * multiplier);
}

function cleanMention(text) {
  return text.replace(/^<@!?(\d+)>$/, "$1");
}

async function getMember(guild, input) {
  const id = cleanMention(input);
  if (!/^\d+$/.test(id)) return null;

  try {
    return await guild.members.fetch(id);
  } catch {
    return null;
  }
}

function getUserData(userId) {
  if (!DATA.users[userId]) {
    DATA.users[userId] = {
      balance: 0,
      value: 0,
      registered: false,
      roleType: null,
      nickname: null
    };
  }

  return DATA.users[userId];
}

function getTeamData(roleId, name = "Takım") {
  if (!DATA.teams[roleId]) {
    DATA.teams[roleId] = {
      id: roleId,
      name,
      value: 0,
      players: {},
      formation: "4-4-2",
      createdAt: Date.now()
    };
  }

  return DATA.teams[roleId];
}

function getStandings(roleId) {
  if (!DATA.standings[roleId]) {
    DATA.standings[roleId] = {
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0
    };
  }

  return DATA.standings[roleId];
}

function teamDifference(roleId) {
  return Number(getTeamData(roleId).value || 0);
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* =========================
   DEĞER SİSTEMİ
========================= */

/*
  ÖNEMLİ:

  .dver @Oyuncu 5M
  mevcut değer + 5M

  .dsil @Oyuncu 5M
  mevcut değer - 5M

  Maksimum: 1B€
  Minimum: 0€
*/

function extractPlayerValue(member) {
  const user = getUserData(member.id);

  let stored = Number(user.value || 0);

  const nickname = member.nickname || member.user.username;

  const match = nickname.match(
    /(\d+(?:[.,]\d+)?)\s*(B|M|K)\s*€?\s*$/i
  );

  if (match) {
    const parsed = parseMoney(
      `${match[1]}${match[2]}`
    );

    if (Number.isFinite(parsed)) {
      stored = parsed;
    }
  }

  return Math.max(0, stored);
}

function stripOldValue(name) {
  return String(name)
    .replace(
      /\s*\|\s*\d+(?:[.,]\d+)?\s*(?:B|M|K)\s*€?\s*$/i,
      ""
    )
    .replace(
      /\s+\d+(?:[.,]\d+)?\s*(?:B|M|K)\s*€?\s*$/i,
      ""
    )
    .trim();
}

async function setPlayerValue(member, newValue) {
  newValue = Math.max(
    0,
    Math.min(
      1_000_000_000,
      Math.floor(newValue)
    )
  );

  const user = getUserData(member.id);
  user.value = newValue;

  const oldName =
    member.nickname ||
    member.user.username;

  const baseName = stripOldValue(oldName);

  let finalName;

  if (baseName.includes("|")) {
    finalName = `${baseName} | ${money(newValue)}`;
  } else {
    finalName = `${baseName} | ${money(newValue)}`;
  }

  if (finalName.length > 32) {
    finalName = finalName.slice(
      0,
      32 - money(newValue).length - 3
    ).trim() +
      ` | ${money(newValue)}`;
  }

  try {
    await member.setNickname(finalName);
  } catch (err) {
    console.log(
      "Nickname değiştirilemedi:",
      err.message
    );
  }

  saveData();

  return newValue;
}

async function changePlayerValue(
  member,
  amount,
  mode
) {
  const current = extractPlayerValue(member);

  let next;

  if (mode === "add") {
    next = current + amount;
  } else {
    next = current - amount;
  }

  next = Math.max(
    0,
    Math.min(1_000_000_000, next)
  );

  await setPlayerValue(member, next);

  return {
    old: current,
    new: next
  };
}

/* =========================
   KAYIT
========================= */

function registrationButtons(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`register_player_${userId}`)
      .setLabel("⚽ Futbolcu")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`register_keeper_${userId}`)
      .setLabel("🧤 Kaleci")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`register_manager_${userId}`)
      .setLabel("🧑‍💼 Teknik Direktör")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`register_member_${userId}`)
      .setLabel("👤 Üye")
      .setStyle(ButtonStyle.Secondary)
  );
}

async function createRegistrationPanel(
  target,
  nickname,
  channel
) {
  DATA.registrationPanels[target.id] = {
    nickname,
    createdBy: channel.id,
    createdAt: Date.now()
  };

  saveData();

  const embed = new EmbedBuilder()
    .setTitle("📋 Axera League Kayıt")
    .setDescription(
      `**Oyuncu:** ${target}\n` +
      `**Takma Ad:** \`${nickname}\`\n\n` +
      `Aşağıdaki butonlardan oyuncunun türünü seçin.`
    )
    .setColor(0x2b2d31);

  return channel.send({
    embeds: [embed],
    components: [registrationButtons(target.id)]
  });
}

/* =========================
   ANTRENMAN
========================= */

const TRAINING_STEPS = [
  "Isınma yapılıyor...",
  "Kısa pas çalışması...",
  "Uzun pas çalışması...",
  "Top kontrolü...",
  "Hız çalışması...",
  "Şut çalışması...",
  "Taktik çalışması...",
  "Savunma çalışması...",
  "Kondisyon çalışması...",
  "Antrenman tamamlanıyor..."
];

async function startTraining(message) {
  const userId = message.author.id;

  if (DATA.training[userId]?.active) {
    return message.reply(
      "❌ Zaten devam eden bir antrenmanın var."
    );
  }

  DATA.training[userId] = {
    active: true,
    startedAt: Date.now(),
    step: 0
  };

  saveData();

  const msg = await message.reply(
    `🏋️ **Antrenman Başladı**\n\n${TRAINING_STEPS[0]}`
  );

  for (let i = 1; i < TRAINING_STEPS.length; i++) {
    await sleep(1500);

    DATA.training[userId].step = i;
    saveData();

    await msg.edit(
      `🏋️ **Antrenman Devam Ediyor**\n\n${TRAINING_STEPS[i]}`
    );
  }

  const member = await message.guild.members.fetch(
    userId
  );

  const result = await changePlayerValue(
    member,
    3_000_000,
    "add"
  );

  DATA.training[userId] = {
    active: false,
    completedAt: Date.now(),
    step: 10
  };

  saveData();

  await msg.edit(
    `🏆 **Antrenman Tamamlandı!**\n\n` +
    `💰 Kazanılan Değer: **+3M€**\n` +
    `📈 Yeni Değer: **${money(result.new)}**`
  );
}

/* =========================
   PENALTI
========================= */

async function penalty(message) {
  const member = message.member;

  const roll = Math.random();

  let result;

  if (roll < 0.50) {
    result = "goal";
  } else if (roll < 0.75) {
    result = "post";
  } else {
    result = "save";
  }

  if (result === "goal") {
    const change = await changePlayerValue(
      member,
      5_000_000,
      "add"
    );

    return message.reply(
      `⚽ **GOOOL!**\n\n` +
      `🧤 Kaleci: **Axera Kalecisi**\n` +
      `💰 Kazanılan: **+5M€**\n` +
      `📈 Yeni Değer: **${money(change.new)}**`
    );
  }

  if (result === "post") {
    return message.reply(
      `🥅 **DİREK!**\n\n` +
      `Top direkten döndü.`
    );
  }

  return message.reply(
    `🧤 **KURTARDI!**\n\n` +
    `Axera Kalecisi penaltıyı çıkardı.`
  );
}

/* =========================
   TWEET
========================= */

async function tweet(message, text) {
  const userId = message.author.id;
  const now = Date.now();

  const last =
    Number(DATA.tweetCooldowns[userId] || 0);

  const day = 24 * 60 * 60 * 1000;
  const rewardAvailable =
    now - last >= day;

  try {
    await message.delete();
  } catch {}

  const embed = new EmbedBuilder()
    .setAuthor({
      name:
        message.member?.displayName ||
        message.author.username,
      iconURL: message.author.displayAvatarURL()
    })
    .setDescription(text)
    .setFooter({
      text: "Axera League • Tweet"
    })
    .setTimestamp();

  await message.channel.send({
    embeds: [embed]
  });

  if (rewardAvailable) {
    const result = await changePlayerValue(
      message.member,
      5_000_000,
      "add"
    );

    DATA.tweetCooldowns[userId] = now;
    saveData();

    await message.channel.send(
      `🎉 ${message.author} günlük tweet ödülünü aldı: **+5M€**\n` +
      `📈 Yeni değer: **${money(result.new)}**`
    );
  }
}

/* =========================
   TAKIM SİSTEMİ
========================= */

function ensureTeamRole(role) {
  return role &&
    role.id !== "@everyone";
}

function registerTeam(role) {
  if (!role) return null;

  const team = getTeamData(
    role.id,
    role.name
  );

  getStandings(role.id);

  saveData();

  return team;
}

function removeTeam(roleId) {
  delete DATA.teams[roleId];
  delete DATA.standings[roleId];
  delete DATA.formations[roleId];
  delete DATA.cups[roleId];

  DATA.fixtures = DATA.fixtures.filter(
    fixture =>
      fixture.team1 !== roleId &&
      fixture.team2 !== roleId
  );

  saveData();
}

function sortedStandings() {
  return Object.entries(DATA.standings)
    .map(([id, data]) => ({
      id,
      ...data
    }))
    .sort((a, b) => {
      if (b.points !== a.points) {
        return b.points - a.points;
      }

      const gdA =
        a.goalsFor - a.goalsAgainst;

      const gdB =
        b.goalsFor - b.goalsAgainst;

      if (gdB !== gdA) {
        return gdB - gdA;
      }

      return b.goalsFor - a.goalsFor;
    });
}

/* =========================
   KADRO
========================= */

const POSITIONS = [
  "Kaleci",
  "Defans",
  "Orta Saha",
  "Kanat",
  "Forvet"
];

function addSquadPlayer(
  team,
  player,
  position
) {
  if (!team.players) {
    team.players = {};
  }

  team.players[player.id] = {
    id: player.id,
    name: player.displayName,
    position:
      POSITIONS.includes(position)
        ? position
        : "Orta Saha",
    value: extractPlayerValue(player)
  };

  saveData();
}

function removeSquadPlayer(team, playerId) {
  if (team.players?.[playerId]) {
    delete team.players[playerId];
  }

  saveData();
}

/* =========================
   FORMASYON
========================= */

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

function formationMenu(teamId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`formation_${teamId}`)
      .setPlaceholder("Formasyon seç")
      .addOptions(
        FORMATIONS.map(x => ({
          label: x,
          value: x
        }))
      )
  );
}

/* =========================
   MAÇ OYUNCULARI
========================= */

async function getTeamPlayers(
  guild,
  roleId
) {
  const result = new Map();

  const role = guild.roles.cache.get(roleId);

  if (role) {
    for (const member of role.members.values()) {
      if (!member.user.bot) {
        result.set(member.id, member);
      }
    }
  }

  const team = DATA.teams[roleId];

  if (team?.players) {
    for (const player of Object.values(
      team.players
    )) {
      try {
        const member =
          await guild.members.fetch(player.id);

        if (!member.user.bot) {
          result.set(member.id, member);
        }
      } catch {}
    }
  }

  return [...result.values()];
}

function chooseMatchPlayer(players) {
  if (!players.length) return null;

  return randomItem(players);
}

/* =========================
   MAÇ SİMÜLASYONU
========================= */

function teamStrength(roleId) {
  const team = DATA.teams[roleId];

  if (!team) return 0;

  return Math.min(
    1,
    Math.max(
      0,
      Number(team.value || 0) /
        1_000_000_000
    )
  );
}

function commentary(
  teamName,
  player,
  event
) {
  const name =
    player?.displayName ||
    player?.user?.username ||
    "Oyuncu";

  const lines = {
    pass:
      `🎯 **${name}**, ${teamName} adına başarılı bir pas yaptı.`,
    attack:
      `🔥 **${name}** rakip ceza sahasına doğru ilerliyor!`,
    shot:
      `💥 **${name}** kaleyi yokladı!`,
    save:
      `🧤 Kaleci mükemmel bir kurtarış yaptı!`,
    foul:
      `🟨 **${name}** faul yaptı.`,
    corner:
      `🚩 ${teamName} korner kullanacak.`,
    goal:
      `⚽ **GOOOL! ${name}** fileleri havalandırdı!`
  };

  return lines[event];
}

async function startMatch(
  guild,
  team1Role,
  team2Role,
  options = {}
) {
  const team1 =
    getTeamData(
      team1Role.id,
      team1Role.name
    );

  const team2 =
    getTeamData(
      team2Role.id,
      team2Role.name
    );

  const players1 =
    await getTeamPlayers(
      guild,
      team1Role.id
    );

  const players2 =
    await getTeamPlayers(
      guild,
      team2Role.id
    );

  const matchId =
    options.matchId ||
    `${team1Role.id}_${team2Role.id}_${Date.now()}`;

  if (DATA.activeMatches[matchId]) {
    return null;
  }

  const match = {
    id: matchId,
    team1: team1Role.id,
    team2: team2Role.id,
    team1Name: team1Role.name,
    team2Name: team2Role.name,
    minute: 0,
    score1: 0,
    score2: 0,
    scorers: [],
    assists: [],
    players1: players1.map(x => x.id),
    players2: players2.map(x => x.id),
    startedAt: Date.now(),
    finished: false,
    rewarded: false
  };

  DATA.activeMatches[matchId] = match;
  saveData();

  const channel =
    guild.channels.cache.get(
      CHANNELS.MATCH
    );

  if (!channel) return null;

  const embed = new EmbedBuilder()
    .setTitle("🏟️ AXERA LEAGUE • CANLI MAÇ")
    .setDescription(
      `**${team1Role.name}** 0 - 0 **${team2Role.name}**`
    )
    .addFields({
      name: "⏱️ Dakika",
      value: "0'",
      inline: true
    })
    .setFooter({
      text: "3 gerçek saniye = 1 maç dakikası"
    })
    .setTimestamp();

  const msg = await channel.send({
    embeds: [embed]
  });

  match.messageId = msg.id;

  const interval = setInterval(
    async () => {
      try {
        if (!DATA.activeMatches[matchId]) {
          clearInterval(interval);
          return;
        }

        match.minute++;

        const p1 =
          chooseMatchPlayer(players1);

        const p2 =
          chooseMatchPlayer(players2);

        const stronger1 =
          teamStrength(team1Role.id);

        const stronger2 =
          teamStrength(team2Role.id);

        const randomEvent =
          Math.random();

        let text = "";

        if (randomEvent < 0.28) {
          text =
            commentary(
              team1Role.name,
              p1,
              "pass"
            );
        } else if (randomEvent < 0.48) {
          text =
            commentary(
              team2Role.name,
              p2,
              "pass"
            );
        } else if (randomEvent < 0.62) {
          text =
            commentary(
              team1Role.name,
              p1,
              "attack"
            );
        } else if (randomEvent < 0.76) {
          text =
            commentary(
              team2Role.name,
              p2,
              "attack"
            );
        } else if (randomEvent < 0.86) {
          text =
            commentary(
              team1Role.name,
              p1,
              "shot"
            );
        } else if (randomEvent < 0.94) {
          text =
            commentary(
              team2Role.name,
              p2,
              "shot"
            );
        } else {
          text =
            commentary(
              team1Role.name,
              p1,
              "foul"
            );
        }

        /*
          Takım değer avantajı:
          küçük ihtimal farkı.
        */

        const baseGoal =
          0.026;

        const chance1 =
          baseGoal *
          (0.65 + stronger1 * 0.70);

        const chance2 =
          baseGoal *
          (0.65 + stronger2 * 0.70);

        if (
          Math.random() < chance1 &&
          players1.length
        ) {
          match.score1++;

          const scorer =
            chooseMatchPlayer(players1);

          const assister =
            chooseMatchPlayer(
              players1.filter(
                x =>
                  x.id !== scorer?.id
              )
            );

          if (scorer) {
            match.scorers.push({
              team: 1,
              player: scorer.id,
              minute: match.minute
            });
          }

          if (assister) {
            match.assists.push({
              team: 1,
              player: assister.id,
              minute: match.minute
            });
          }

          text =
            commentary(
              team1Role.name,
              scorer,
              "goal"
            );

          if (scorer) {
            await changePlayerValue(
              scorer,
              2_000_000,
              "add"
            );
          }

          if (assister) {
            await changePlayerValue(
              assister,
              1_000_000,
              "add"
            );
          }
        } else if (
          Math.random() < chance2 &&
          players2.length
        ) {
          match.score2++;

          const scorer =
            chooseMatchPlayer(players2);

          const assister =
            chooseMatchPlayer(
              players2.filter(
                x =>
                  x.id !== scorer?.id
              )
            );

          if (scorer) {
            match.scorers.push({
              team: 2,
              player: scorer.id,
              minute: match.minute
            });
          }

          if (assister) {
            match.assists.push({
              team: 2,
              player: assister.id,
              minute: match.minute
            });
          }

          text =
            commentary(
              team2Role.name,
              scorer,
              "goal"
            );

          if (scorer) {
            await changePlayerValue(
              scorer,
              2_000_000,
              "add"
            );
          }

          if (assister) {
            await changePlayerValue(
              assister,
              1_000_000,
              "add"
            );
          }
        }

        const currentEmbed =
          EmbedBuilder.from(embed)
            .setDescription(
              `**${team1Role.name}** ${match.score1} - ${match.score2} **${team2Role.name}**\n\n` +
              `${text || "⚽ Oyun devam ediyor..."}`
            )
            .spliceFields(0, 1, {
              name: "⏱️ Dakika",
              value: `${match.minute}'`,
              inline: true
            });

        await msg.edit({
          embeds: [currentEmbed]
        });

        if (match.minute >= 90) {
          clearInterval(interval);

          await finishMatch(
            guild,
            match,
            team1Role,
            team2Role,
            msg
          );
        }

        saveData();
      } catch (err) {
        console.error(
          "Maç simülasyon hatası:",
          err
        );

        clearInterval(interval);
      }
    },
    3000
  );

  return match;
}

/* =========================
   MAÇ BİTİR
========================= */

async function finishMatch(
  guild,
  match,
  team1Role,
  team2Role,
  msg
) {
  if (match.rewarded) return;

  match.finished = true;
  match.rewarded = true;

  const s1 =
    getStandings(team1Role.id);

  const s2 =
    getStandings(team2Role.id);

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
  } else if (
    match.score2 > match.score1
  ) {
    s2.wins++;
    s2.points += 3;
    s1.losses++;
  } else {
    s1.draws++;
    s2.draws++;
    s1.points++;
    s2.points++;
  }

  const players1 =
    await getTeamPlayers(
      guild,
      team1Role.id
    );

  const players2 =
    await getTeamPlayers(
      guild,
      team2Role.id
    );

  const participants = [
    ...players1,
    ...players2
  ];

  const unique =
    new Map(
      participants.map(x => [
        x.id,
        x
      ])
    );

  /*
    Her katılımcıya +5M€
    Aynı maçta iki kere verilmez.
  */

  for (const player of unique.values()) {
    const key =
      `${match.id}_${player.id}`;

    if (DATA.matchRewards[key]) {
      continue;
    }

    await changePlayerValue(
      player,
      5_000_000,
      "add"
    );

    DATA.matchRewards[key] = {
      matchId: match.id,
      playerId: player.id,
      rewardedAt: Date.now()
    };

    if (!DATA.playerMatchHistory[player.id]) {
      DATA.playerMatchHistory[player.id] = [];
    }

    DATA.playerMatchHistory[player.id].push(
      match.id
    );
  }

  DATA.matchHistory.push({
    ...match,
    finishedAt: Date.now()
  });

  delete DATA.activeMatches[match.id];

  saveData();

  const resultEmbed =
    new EmbedBuilder()
      .setTitle("🏁 MAÇ SONA ERDİ")
      .setDescription(
        `**${team1Role.name}** ${match.score1} - ${match.score2} **${team2Role.name}**`
      )
      .addFields(
        {
          name: "⚽ Goller",
          value:
            match.scorers.length
              ? match.scorers
                .map(
                  x =>
                    `${x.minute}' <@${x.player}>`
                )
                .join("\n")
              : "Gol olmadı."
        },
        {
          name: "🎁 Katılımcı Ödülü",
          value:
            "Maçta yer alan her oyuncuya **+5M€** verildi."
        }
      )
      .setTimestamp();

  await msg.edit({
    embeds: [resultEmbed]
  });
}

/* =========================
   FİKSTÜR
========================= */

function parseFixtureDate(date, time) {
  const parsed =
    new Date(
      `${date}T${time}:00`
    );

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

async function checkFixtures() {
  const now = Date.now();

  for (const fixture of DATA.fixtures) {
    if (fixture.started || fixture.cancelled) {
      continue;
    }

    if (new Date(fixture.timestamp).getTime() <= now) {
      const guild =
        client.guilds.cache.get(
          fixture.guildId
        );

      if (!guild) continue;

      const role1 =
        guild.roles.cache.get(
          fixture.team1
        );

      const role2 =
        guild.roles.cache.get(
          fixture.team2
        );

      if (!role1 || !role2) {
        fixture.cancelled = true;
        continue;
      }

      fixture.started = true;

      await startMatch(
        guild,
        role1,
        role2,
        {
          matchId:
            `fixture_${fixture.id}`
        }
      );

      saveData();
    }
  }
}

/* =========================
   TICKET
========================= */

async function createTicketPanel(channel) {
  const embed = new EmbedBuilder()
    .setTitle("🎫 Axera League Destek")
    .setDescription(
      "Destek almak için aşağıdaki butona basarak ticket oluşturabilirsiniz."
    );

  const row =
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("create_ticket")
        .setLabel("🎫 Destek Talebi Oluştur")
        .setStyle(ButtonStyle.Primary)
    );

  return channel.send({
    embeds: [embed],
    components: [row]
  });
}

async function createTicket(interaction) {
  const guild = interaction.guild;

  const existing =
    Object.values(DATA.tickets)
      .find(
        x =>
          x.guildId === guild.id &&
          x.userId === interaction.user.id &&
          !x.closed
      );

  if (existing) {
    return interaction.reply({
      content:
        `❌ Zaten açık bir ticketın var: <#${existing.channelId}>`,
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
        {
          id: ROLES.ADMIN,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        },
        {
          id: ROLES.MODERATOR,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        }
      ]
    });

  DATA.tickets[channel.id] = {
    channelId: channel.id,
    guildId: guild.id,
    userId: interaction.user.id,
    createdAt: Date.now(),
    lastMessageAt: Date.now(),
    closed: false
  };

  saveData();

  await channel.send(
    `🎫 ${interaction.user}, destek talebin oluşturuldu.\n` +
    `Yetkililer kısa süre içerisinde ilgilenecektir.`
  );

  await interaction.reply({
    content:
      `✅ Ticket oluşturuldu: ${channel}`,
    ephemeral: true
  });
}

async function checkTickets() {
  const now = Date.now();
  const timeout = 60 * 60 * 1000;

  for (const ticket of Object.values(DATA.tickets)) {
    if (ticket.closed) continue;

    if (
      now - ticket.lastMessageAt >=
      timeout
    ) {
      const channel =
        client.channels.cache.get(
          ticket.channelId
        );

      if (channel) {
        await channel.send(
          "🔒 Bu ticket 60 dakika boyunca mesaj gelmediği için kapatılıyor."
        );

        setTimeout(async () => {
          try {
            await channel.delete();
          } catch {}
        }, 3000);
      }

      ticket.closed = true;
      ticket.closedAt = now;
    }
  }

  saveData();
}

/* =========================
   CUP / MÜZE
========================= */

function getCups(teamId) {
  if (!DATA.cups[teamId]) {
    DATA.cups[teamId] = [];
  }

  return DATA.cups[teamId];
}

/* =========================
   ÜYE ARAMA
========================= */

async function searchRegisteredMembers(
  guild,
  query
) {
  const members =
    await guild.members.fetch();

  const q =
    query.toLocaleLowerCase("tr-TR");

  return members
    .filter(member => {
      if (member.user.bot) return false;

      if (
        member.roles.cache.has(
          ROLES.UNREGISTERED
        )
      ) {
        return false;
      }

      const data =
        DATA.users[member.id];

      if (
        data &&
        data.registered === false
      ) {
        return false;
      }

      const name =
        member.displayName
          .toLocaleLowerCase("tr-TR");

      const username =
        member.user.username
          .toLocaleLowerCase("tr-TR");

      return (
        name.includes(q) ||
        username.includes(q)
      );
    })
    .sort((a, b) => {
      const an =
        a.displayName
          .toLocaleLowerCase("tr-TR");

      const bn =
        b.displayName
          .toLocaleLowerCase("tr-TR");

      const as =
        an.startsWith(q);

      const bs =
        bn.startsWith(q);

      if (as && !bs) return -1;
      if (!as && bs) return 1;

      return an.localeCompare(
        bn,
        "tr"
      );
    })
    .first(10);

  return results;
}

/* =========================
   MESAJ EVENT
========================= */

client.on(
  "messageCreate",
  async message => {
    try {
      if (!message.guild) return;
      if (message.author.bot) return;

      if (DATA.tickets[message.channel.id]) {
        DATA.tickets[
          message.channel.id
        ].lastMessageAt = Date.now();

        saveData();
      }

      if (!message.content.startsWith(".")) {
        return;
      }

      const args =
        message.content
          .trim()
          .split(/\s+/);

      const command =
        args.shift()
          .slice(1)
          .toLocaleLowerCase("tr-TR");

      /* =====================
         KAYIT
      ===================== */

      if (command === "k") {
        if (
          message.channel.id !==
          CHANNELS.REGISTRATION
        ) {
          return message.reply(
            `❌ Bu komut yalnızca <#${CHANNELS.REGISTRATION}> kanalında kullanılabilir.`
          );
        }

        if (
          !hasRegistrationPermission(
            message.member
          )
        ) {
          return message.reply(
            "❌ Bu komutu yalnızca Kayıt Yetkilisi kullanabilir."
          );
        }

        const mention =
          message.mentions.members.first();

        if (!mention) {
          return message.reply(
            "❌ Kullanım: `.k @Oyuncu TakmaAdı`"
          );
        }

        const nickname =
          message.content
            .replace(
              /^\s*\.\S+\s+/,
              ""
            )
            .replace(
              new RegExp(
                `<@!?${mention.id}>`
              ),
              ""
            )
            .trim();

        if (!nickname) {
          return message.reply(
            "❌ Oyuncunun takma adını yazmalısın."
          );
        }

        return createRegistrationPanel(
          mention,
          nickname,
          message.channel
        );
      }

      /* =====================
         KAYITSIZ VER
      ===================== */

      if (
        command === "kayıtsızver" ||
        command === "kayitsizver"
      ) {
        if (
          !hasRegistrationPermission(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
          );
        }

        const member =
          message.mentions.members.first();

        if (!member) {
          return message.reply(
            "❌ Kullanım: `.kayıtsızver @Oyuncu`"
          );
        }

        await member.roles.remove([
          ROLES.PLAYER,
          ROLES.GOALKEEPER,
          ROLES.MANAGER,
          ROLES.MEMBER
        ]);

        await member.roles.add(
          ROLES.UNREGISTERED
        );

        const data =
          getUserData(member.id);

        data.registered = false;
        data.roleType = "Kayıtsız";

        saveData();

        return message.reply(
          `✅ ${member} kayıtsız durumuna alındı.`
        );
      }

      /* =====================
         DEĞER VER
      ===================== */

      if (command === "dver") {
        if (
          message.channel.id !==
          CHANNELS.TWEET
        ) {
          return message.reply(
            `❌ Bu komut yalnızca <#${CHANNELS.TWEET}> kanalında kullanılabilir.`
          );
        }

        if (
          !hasValuePermission(
            message.member
          )
        ) {
          return message.reply(
            "❌ Bu komutu yalnızca Değer Yetkilisi kullanabilir."
          );
        }

        const member =
          message.mentions.members.first();

        const amount =
          parseMoney(
            args.find(
              x => !x.startsWith("<@")
            )
          );

        if (
          !member ||
          !Number.isFinite(amount) ||
          amount <= 0
        ) {
          return message.reply(
            "❌ Kullanım: `.dver @Oyuncu 5M`"
          );
        }

        /*
          ESKİ DEĞER OKUNUR
          YENİ DEĞER = ESKİ + MİKTAR
        */

        const result =
          await changePlayerValue(
            member,
            amount,
            "add"
          );

        return message.reply(
          `✅ ${member} değerine **+${money(amount)}** eklendi.\n\n` +
          `📊 Eski Değer: **${money(result.old)}**\n` +
          `📈 Yeni Değer: **${money(result.new)}**`
        );
      }

      /* =====================
         DEĞER SİL
      ===================== */

      if (command === "dsil") {
        if (
          message.channel.id !==
          CHANNELS.TWEET
        ) {
          return message.reply(
            `❌ Bu komut yalnızca <#${CHANNELS.TWEET}> kanalında kullanılabilir.`
          );
        }

        if (
          !hasValuePermission(
            message.member
          )
        ) {
          return message.reply(
            "❌ Bu komutu yalnızca Değer Yetkilisi kullanabilir."
          );
        }

        const member =
          message.mentions.members.first();

        const amount =
          parseMoney(
            args.find(
              x => !x.startsWith("<@")
            )
          );

        if (
          !member ||
          !Number.isFinite(amount) ||
          amount <= 0
        ) {
          return message.reply(
            "❌ Kullanım: `.dsil @Oyuncu 5M`"
          );
        }

        /*
          ESKİ DEĞER OKUNUR
          YENİ DEĞER = ESKİ - MİKTAR
          0 ALTINA İNEMEZ
        */

        const result =
          await changePlayerValue(
            member,
            amount,
            "remove"
          );

        return message.reply(
          `✅ ${member} değerinden **-${money(amount)}** çıkarıldı.\n\n` +
          `📊 Eski Değer: **${money(result.old)}**\n` +
          `📉 Yeni Değer: **${money(result.new)}**`
        );
      }

      /* =====================
         ANTRENMAN
      ===================== */

      if (
        command === "ant" ||
        command === "antrenman"
      ) {
        if (
          message.channel.id !==
          CHANNELS.TRAINING
        ) {
          return message.reply(
            `❌ Bu komut yalnızca <#${CHANNELS.TRAINING}> kanalında kullanılabilir.`
          );
        }

        return startTraining(message);
      }

      /* =====================
         PENALTI
      ===================== */

      if (
        command === "pen" ||
        command === "penaltı" ||
        command === "penalti"
      ) {
        if (
          message.channel.id !==
          CHANNELS.PENALTY
        ) {
          return message.reply(
            `❌ Bu komut yalnızca <#${CHANNELS.PENALTY}> kanalında kullanılabilir.`
          );
        }

        return penalty(message);
      }

      /* =====================
         TWEET
      ===================== */

      if (command === "tweet") {
        if (
          message.channel.id !==
          CHANNELS.TWEET
        ) {
          return message.reply(
            `❌ Bu komut yalnızca <#${CHANNELS.TWEET}> kanalında kullanılabilir.`
          );
        }

        const text =
          args.join(" ").trim();

        if (!text) {
          return message.reply(
            "❌ Kullanım: `.tweet Mesaj`"
          );
        }

        return tweet(
          message,
          text
        );
      }

      /* =====================
         BÜTÇE
      ===================== */

      if (
        command === "bütçe" ||
        command === "butce"
      ) {
        const target =
          message.mentions.members.first() ||
          message.member;

        const data =
          getUserData(target.id);

        return message.reply(
          `💰 ${target} kişisel bütçesi: **${money(data.balance)}**`
        );
      }

      /* =====================
         PARA EKLE
      ===================== */

      if (command === "paraekle") {
        if (
          !hasValuePermission(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
          );
        }

        const target =
          message.mentions.members.first();

        const amount =
          parseMoney(
            args.find(
              x => !x.startsWith("<@")
            )
          );

        if (
          !target ||
          !Number.isFinite(amount) ||
          amount <= 0
        ) {
          return message.reply(
            "❌ Kullanım: `.paraekle @Oyuncu 50`"
          );
        }

        const data =
          getUserData(target.id);

        data.balance += amount;

        saveData();

        return message.reply(
          `✅ ${target} bütçesine **${money(amount)}** eklendi.\n` +
          `💰 Yeni bütçe: **${money(data.balance)}**`
        );
      }

      /* =====================
         PARA SİL
      ===================== */

      if (command === "parasil") {
        if (
          !hasValuePermission(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
          );
        }

        const target =
          message.mentions.members.first();

        const amount =
          parseMoney(
            args.find(
              x => !x.startsWith("<@")
            )
          );

        if (
          !target ||
          !Number.isFinite(amount) ||
          amount <= 0
        ) {
          return message.reply(
            "❌ Kullanım: `.parasil @Oyuncu 20`"
          );
        }

        const data =
          getUserData(target.id);

        data.balance =
          Math.max(
            0,
            data.balance - amount
          );

        saveData();

        return message.reply(
          `✅ ${target} bütçesinden **${money(amount)}** silindi.\n` +
          `💰 Yeni bütçe: **${money(data.balance)}**`
        );
      }

      /* =====================
         PARA AYARLA
      ===================== */

      if (command === "paraayarla") {
        if (
          !hasValuePermission(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
          );
        }

        const target =
          message.mentions.members.first();

        const amount =
          parseMoney(
            args.find(
              x => !x.startsWith("<@")
            )
          );

        if (
          !target ||
          !Number.isFinite(amount) ||
          amount < 0
        ) {
          return message.reply(
            "❌ Kullanım: `.paraayarla @Oyuncu 100`"
          );
        }

        const data =
          getUserData(target.id);

        data.balance = amount;

        saveData();

        return message.reply(
          `✅ ${target} bütçesi **${money(amount)}** olarak ayarlandı.`
        );
      }

      /* =====================
         GÖNDER
      ===================== */

      if (command === "gönder" || command === "gonder") {
        const target =
          message.mentions.members.first();

        const amount =
          parseMoney(
            args.find(
              x => !x.startsWith("<@")
            )
          );

        if (
          !target ||
          !Number.isFinite(amount) ||
          amount <= 0
        ) {
          return message.reply(
            "❌ Kullanım: `.gönder @Oyuncu 50`"
          );
        }

        if (
          target.id ===
          message.author.id
        ) {
          return message.reply(
            "❌ Kendine para gönderemezsin."
          );
        }

        const sender =
          getUserData(
            message.author.id
          );

        if (sender.balance < amount) {
          return message.reply(
            "❌ Yeterli bütçen yok."
          );
        }

        const receiver =
          getUserData(target.id);

        sender.balance -= amount;
        receiver.balance += amount;

        saveData();

        return message.reply(
          `✅ ${target} kişisine **${money(amount)}** gönderildi.\n` +
          `💰 Kalan bütçen: **${money(sender.balance)}**`
        );
      }

      /* =====================
         TAKIM EKLE
      ===================== */

      if (command === "takımekle" || command === "takimekle") {
        if (
          !hasMatchPermission(
            message.member
          )
        ) {
          return message.reply(
            "❌ Bu komutu yalnızca Maç Yetkilisi kullanabilir."
          );
        }

        const role =
          message.mentions.roles.first();

        if (!ensureTeamRole(role)) {
          return message.reply(
            "❌ Bir takım rolü etiketlemelisin."
          );
        }

        if (DATA.teams[role.id]) {
          return message.reply(
            "❌ Bu takım zaten sistemde kayıtlı."
          );
        }

        registerTeam(role);

        return message.reply(
          `✅ **${role.name}** takımı Axera League'e eklendi.`
        );
      }

      /* =====================
         TAKIM KALDIR
      ===================== */

      if (
        command === "takımkaldır" ||
        command === "takimkaldir"
      ) {
        if (
          !hasMatchPermission(
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
            DATA.activeMatches
          ).some(
            x =>
              x.team1 === role.id ||
              x.team2 === role.id
          );

        if (active) {
          return message.reply(
            "❌ Aktif maçı bulunan takım kaldırılamaz."
          );
        }

        removeTeam(role.id);

        return message.reply(
          `✅ **${role.name}** takımı sistemden kaldırıldı.`
        );
      }

      /* =====================
         TAKIM DEĞER
      ===================== */

      if (
        command === "takımdeğer" ||
        command === "takimdeger"
      ) {
        if (
          !hasMatchPermission(
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
          parseMoney(
            args.find(
              x => !x.startsWith("<@&")
            )
          );

        if (
          !role ||
          !Number.isFinite(amount) ||
          amount < 0
        ) {
          return message.reply(
            "❌ Kullanım: `.takımdeğer @Takım 850M`"
          );
        }

        const team =
          getTeamData(
            role.id,
            role.name
          );

        team.value =
          Math.min(
            1_000_000_000,
            amount
          );

        saveData();

        return message.reply(
          `💰 **${role.name}** takım değeri: **${money(team.value)}**`
        );
      }

      /* =====================
         PUAN EKLE
      ===================== */

      if (command === "puanekle") {
        if (
          !hasMatchPermission(
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
          Number(
            args.find(
              x => !x.startsWith("<@&")
            )
          );

        if (
          !role ||
          !Number.isFinite(amount)
        ) {
          return message.reply(
            "❌ Kullanım: `.puanekle @Takım 3`"
          );
        }

        const standing =
          getStandings(role.id);

        standing.points +=
          Math.floor(amount);

        saveData();

        return message.reply(
          `✅ **${role.name}** takımına **${Math.floor(amount)} puan** eklendi.`
        );
      }

      /* =====================
         PUAN
      ===================== */

      if (command === "puan") {
        const list =
          sortedStandings();

        if (!list.length) {
          return message.reply(
            "📊 Henüz kayıtlı takım yok."
          );
        }

        const lines =
          list.map(
            (team, index) => {
              const role =
                message.guild.roles.cache.get(
                  team.id
                );

              const name =
                role?.name ||
                "Silinmiş Takım";

              const gd =
                team.goalsFor -
                team.goalsAgainst;

              return (
                `**${index + 1}.** ${name} — ` +
                `**${team.points} P** | ` +
                `O: ${team.played} | ` +
                `AV: ${gd} | ` +
                `AG: ${team.goalsFor}`
              );
            }
          );

        const embed =
          new EmbedBuilder()
            .setTitle("🏆 AXERA LEAGUE PUAN DURUMU")
            .setDescription(
              lines.join("\n")
            );

        return message.reply({
          embeds: [embed]
        });
      }

      /* =====================
         KADRO EKLE
      ===================== */

      if (command === "kadroekle") {
        if (
          !hasMatchPermission(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
          );
        }

        const role =
          message.mentions.roles.first();

        const player =
          message.mentions.members
            .filter(
              x =>
                x.id !== role?.id
            )
            .first();

        const position =
          args.find(
            x =>
              POSITIONS.includes(x)
          ) ||
          "Orta Saha";

        if (!role || !player) {
          return message.reply(
            "❌ Kullanım: `.kadroekle @Takım @Oyuncu Pozisyon`"
          );
        }

        const team =
          getTeamData(
            role.id,
            role.name
          );

        addSquadPlayer(
          team,
          player,
          position
        );

        return message.reply(
          `✅ ${player} **${role.name}** kadrosuna **${position}** olarak eklendi.`
        );
      }

      /* =====================
         KADRO ÇIKAR
      ===================== */

      if (
        command === "kadrocikar" ||
        command === "kadroçıkar"
      ) {
        if (
          !hasMatchPermission(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
          );
        }

        const role =
          message.mentions.roles.first();

        const player =
          message.mentions.members
            .filter(
              x =>
                x.id !== role?.id
            )
            .first();

        if (!role || !player) {
          return message.reply(
            "❌ Kullanım: `.kadrocikar @Takım @Oyuncu`"
          );
        }

        const team =
          getTeamData(
            role.id,
            role.name
          );

        removeSquadPlayer(
          team,
          player.id
        );

        return message.reply(
          `✅ ${player} **${role.name}** kadrosundan çıkarıldı.`
        );
      }

      /* =====================
         KADRO GÖRÜNTÜLE
      ===================== */

      if (command === "kadro") {
        const role =
          message.mentions.roles.first();

        if (!role) {
          return message.reply(
            "❌ Kullanım: `.kadro @Takım`"
          );
        }

        const team =
          getTeamData(
            role.id,
            role.name
          );

        const groups = {};

        for (const position of POSITIONS) {
          groups[position] = [];
        }

        for (
          const player of Object.values(
            team.players || {}
          )
        ) {
          if (!groups[player.position]) {
            groups[player.position] = [];
          }

          groups[player.position].push(
            `• <@${player.id}> — ${money(player.value || 0)}`
          );
        }

        const description =
          POSITIONS.map(
            position =>
              `**${position}**\n` +
              (
                groups[position].length
                  ? groups[position].join("\n")
                  : "—"
              )
          ).join("\n\n");

        const total =
          Object.values(
            team.players || {}
          ).reduce(
            (sum, player) =>
              sum +
              Number(player.value || 0),
            0
          );

        const embed =
          new EmbedBuilder()
            .setTitle(
              `👥 ${role.name} Kadrosu`
            )
            .setDescription(
              description
            )
            .addFields({
              name: "📊 Kadro Bilgisi",
              value:
                `Oyuncu: **${Object.keys(team.players || {}).length}**\n` +
                `Toplam Oyuncu Değeri: **${money(total)}**\n` +
                `Takım Değeri: **${money(team.value)}**`
            });

        return message.reply({
          embeds: [embed]
        });
      }

      /* =====================
         FORMASYON
      ===================== */

      if (command === "formasyon") {
        if (
          !hasMatchPermission(
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

        return message.reply({
          content:
            `⚽ **${role.name}** için formasyon seç:`,
          components: [
            formationMenu(role.id)
          ]
        });
      }

      /* =====================
         MAÇ
      ===================== */

      if (
        command === "maç" ||
        command === "mac"
      ) {
        if (
          message.channel.id !==
          CHANNELS.MATCH
        ) {
          return message.reply(
            `❌ Bu komut yalnızca <#${CHANNELS.MATCH}> kanalında kullanılabilir.`
          );
        }

        if (
          !hasMatchPermission(
            message.member
          )
        ) {
          return message.reply(
            "❌ Bu komutu yalnızca Maç Yetkilisi kullanabilir."
          );
        }

        const roles =
          message.mentions.roles;

        if (roles.size < 2) {
          return message.reply(
            "❌ Kullanım: `.maç @Takım1 @Takım2`"
          );
        }

        const [team1, team2] =
          [...roles.values()].slice(
            0,
            2
          );

        const active =
          Object.values(
            DATA.activeMatches
          ).some(
            x =>
              x.team1 === team1.id ||
              x.team2 === team1.id ||
              x.team1 === team2.id ||
              x.team2 === team2.id
          );

        if (active) {
          return message.reply(
            "❌ Takımlardan biri zaten aktif bir maçta."
          );
        }

        const match =
          await startMatch(
            message.guild,
            team1,
            team2
          );

        if (!match) {
          return message.reply(
            "❌ Maç başlatılamadı."
          );
        }

        return message.reply(
          `🏟️ **${team1.name}** - **${team2.name}** maçı başladı!`
        );
      }

      /* =====================
         FİKSTÜR EKLE
      ===================== */

      if (
        command === "fiksturekle" ||
        command === "fikstürekle"
      ) {
        if (
          !hasMatchPermission(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
          );
        }

        const roles =
          message.mentions.roles;

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

        if (
          roles.size < 2 ||
          !date ||
          !time
        ) {
          return message.reply(
            "❌ Kullanım: `.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`"
          );
        }

        const [team1, team2] =
          [...roles.values()].slice(
            0,
            2
          );

        const parsed =
          parseFixtureDate(
            date,
            time
          );

        if (!parsed) {
          return message.reply(
            "❌ Tarih/saat geçersiz."
          );
        }

        const fixture = {
          id: DATA.nextFixtureId++,
          guildId: message.guild.id,
          team1: team1.id,
          team2: team2.id,
          date,
          time,
          timestamp:
            parsed.toISOString(),
          started: false,
          cancelled: false
        };

        DATA.fixtures.push(
          fixture
        );

        saveData();

        return message.reply(
          `✅ Fikstür eklendi.\n\n` +
          `🏟️ **${team1.name} - ${team2.name}**\n` +
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
          DATA.fixtures
            .filter(
              x =>
                x.guildId ===
                message.guild.id &&
                !x.cancelled
            )
            .sort(
              (a, b) =>
                new Date(a.timestamp) -
                new Date(b.timestamp)
            );

        if (!fixtures.length) {
          return message.reply(
            "📅 Kayıtlı fikstür bulunmuyor."
          );
        }

        const lines =
          fixtures.map(
            fixture => {
              const team1 =
                message.guild.roles.cache.get(
                  fixture.team1
                );

              const team2 =
                message.guild.roles.cache.get(
                  fixture.team2
                );

              const status =
                fixture.started
                  ? "🏁 Başladı"
                  : "⏳ Bekliyor";

              return (
                `**#${fixture.id}** ` +
                `${team1?.name || "?"} 🆚 ${team2?.name || "?"}\n` +
                `📅 ${fixture.date} ${fixture.time} • ${status}`
              );
            }
          );

        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle(
                "📅 AXERA LEAGUE FİKSTÜR"
              )
              .setDescription(
                lines.join("\n\n")
              )
          ]
        });
      }

      /* =====================
         FİKSTÜR ÇIKAR
      ===================== */

      if (
        command === "fiksturcikar" ||
        command === "fikstürçıkar"
      ) {
        if (
          !hasMatchPermission(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
          );
        }

        const roles =
          message.mentions.roles;

        if (roles.size < 2) {
          return message.reply(
            "❌ İki takım etiketlemelisin."
          );
        }

        const [a, b] =
          [...roles.values()].slice(
            0,
            2
          );

        const index =
          DATA.fixtures.findIndex(
            x =>
              !x.started &&
              (
                (
                  x.team1 === a.id &&
                  x.team2 === b.id
                ) ||
                (
                  x.team1 === b.id &&
                  x.team2 === a.id
                )
              )
          );

        if (index === -1) {
          return message.reply(
            "❌ Bekleyen fikstür bulunamadı."
          );
        }

        DATA.fixtures[index].cancelled =
          true;

        saveData();

        return message.reply(
          `✅ **${a.name} - ${b.name}** fikstürü kaldırıldı.`
        );
      }

      /* =====================
         KUPA EKLE
      ===================== */

      if (command === "kupaekle") {
        if (
          !hasMatchPermission(
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
          args
            .filter(
              x =>
                !x.startsWith("<@&")
            )
            .join(" ");

        if (!role || !name) {
          return message.reply(
            "❌ Kullanım: `.kupaekle @Takım KupaAdı`"
          );
        }

        const cups =
          getCups(role.id);

        cups.push({
          name,
          addedAt: Date.now()
        });

        saveData();

        return message.reply(
          `🏆 **${name}** kupası **${role.name}** müzesine eklendi.`
        );
      }

      /* =====================
         KUPA SİL
      ===================== */

      if (command === "kupasil") {
        if (
          !hasMatchPermission(
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
          args
            .filter(
              x =>
                !x.startsWith("<@&")
            )
            .join(" ");

        if (!role || !name) {
          return message.reply(
            "❌ Kullanım: `.kupasil @Takım KupaAdı`"
          );
        }

        const cups =
          getCups(role.id);

        const index =
          cups.findIndex(
            x =>
              x.name
                .toLocaleLowerCase("tr-TR") ===
              name
                .toLocaleLowerCase("tr-TR")
          );

        if (index === -1) {
          return message.reply(
            "❌ Bu kupa bulunamadı."
          );
        }

        cups.splice(index, 1);

        saveData();

        return message.reply(
          `🗑️ **${name}** kupası silindi.`
        );
      }

      /* =====================
         MÜZE
      ===================== */

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
          getCups(role.id);

        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle(
                `🏛️ ${role.name} Müzesi`
              )
              .setDescription(
                cups.length
                  ? cups
                    .map(
                      (x, i) =>
                        `🏆 **${i + 1}.** ${x.name}`
                    )
                    .join("\n")
                  : "Henüz kazanılmış kupa bulunmuyor."
              )
          ]
        });
      }

      /* =====================
         ARAMA
      ===================== */

      if (command === "ara") {
        const query =
          args.join(" ").trim();

        if (!query) {
          return message.reply(
            "❌ Kullanım: `.ara oyuncuadı`"
          );
        }

        const results =
          await searchRegisteredMembers(
            message.guild,
            query
          );

        if (!results.length) {
          return message.reply(
            "❌ Kayıtlı oyuncu bulunamadı."
          );
        }

        return message.reply(
          `🔎 **${query}** araması:\n\n` +
          results
            .map(
              x =>
                `• ${x} — \`${x.displayName}\``
            )
            .join("\n")
        );
      }

      /* =====================
         SİL
      ===================== */

      if (command === "sil") {
        if (
          !isAdmin(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yalnızca Yönetici kullanabilir."
          );
        }

        const amount =
          Math.min(
            1000,
            Math.max(
              1,
              Number(args[0])
            )
          );

        if (!Number.isFinite(amount)) {
          return message.reply(
            "❌ Kullanım: `.sil 10`"
          );
        }

        try {
          await message.channel.bulkDelete(
            amount + 1,
            true
          );
        } catch {
          return message.reply(
            "❌ Mesajlar silinemedi."
          );
        }

        return;
      }

      /* =====================
         EMBED
      ===================== */

      if (command === "embed") {
        if (
          !isAdmin(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yalnızca Yönetici kullanabilir."
          );
        }

        const content =
          args.join(" ");

        const parts =
          content.split("|");

        const title =
          parts.shift()?.trim() ||
          "Axera League";

        const description =
          parts.join("|").trim();

        await message.delete()
          .catch(() => {});

        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle(title)
              .setDescription(
                description ||
                "Axera League"
              )
          ]
        });
      }

      /* =====================
         KICK
      ===================== */

      if (command === "kick") {
        if (
          !hasModerationPermission(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
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
        );

        return message.reply(
          `👢 ${target.user.tag} sunucudan atıldı.`
        );
      }

      /* =====================
         BAN
      ===================== */

      if (command === "ban") {
        if (
          !hasModerationPermission(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
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
          reason:
            "Axera League moderasyon"
        });

        return message.reply(
          `🔨 ${target.user.tag} yasaklandı.`
        );
      }

      /* =====================
         MUTE
      ===================== */

      if (command === "mute") {
        if (
          !hasModerationPermission(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
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
            "Axera League mute"
          );
        } catch {
          return message.reply(
            "❌ Kullanıcı susturulamadı."
          );
        }

        return message.reply(
          `🔇 ${target} 10 dakika susturuldu.`
        );
      }

      /* =====================
         UNMUTE
      ===================== */

      if (command === "unmute") {
        if (
          !hasModerationPermission(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
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
        );

        return message.reply(
          `🔊 ${target} susturması kaldırıldı.`
        );
      }

      /* =====================
         DM
      ===================== */

      if (command === "dm") {
        if (
          !isAdmin(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yalnızca Yönetici kullanabilir."
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
          message.content
            .replace(
              /^\s*\.dm\s+/i,
              ""
            )
            .replace(
              new RegExp(
                `<@!?${target.id}>`
              ),
              ""
            )
            .trim();

        if (!text) {
          return message.reply(
            "❌ Gönderilecek mesajı yazmalısın."
          );
        }

        try {
          await target.send(text);
        } catch {
          return message.reply(
            "❌ Kullanıcıya DM gönderilemedi."
          );
        }

        return message.reply(
          "✅ DM gönderildi."
        );
      }

      /* =====================
         TICKET PANEL
      ===================== */

      if (command === "ticketpanel") {
        if (
          !isAdmin(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yalnızca Yönetici kullanabilir."
          );
        }

        await createTicketPanel(
          message.channel
        );

        return message.reply({
          content:
            "✅ Ticket paneli oluşturuldu.",
          ephemeral: true
        });
      }

      /* =====================
         ROL PANEL
      ===================== */

      if (command === "rolpanel") {
        if (
          !hasRegistrationPermission(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
          );
        }

        const embed =
          new EmbedBuilder()
            .setTitle(
              "🎭 Axera League Rol Paneli"
            )
            .setDescription(
              `⚽ <@&${ROLES.PLAYER}>\n` +
              `🧤 <@&${ROLES.GOALKEEPER}>\n` +
              `🧑‍💼 <@&${ROLES.MANAGER}>\n` +
              `👤 <@&${ROLES.MEMBER}>`
            );

        return message.channel.send({
          embeds: [embed]
        });
      }

      /* =====================
         YARDIM
      ===================== */

      if (
        command === "yardım" ||
        command === "yardim"
      ) {
        const embed =
          new EmbedBuilder()
            .setTitle(
              "📚 AXERA LEAGUE KOMUTLARI"
            )
            .setDescription(
              [
                "**👤 Kayıt**",
                "`.k @Oyuncu TakmaAdı`",
                "`.kayıtsızver @Oyuncu`",
                "`.ara Oyuncu`",
                "",
                "**💰 Değer**",
                "`.dver @Oyuncu 5M`",
                "`.dsil @Oyuncu 5M`",
                "",
                "**🏋️ Oyuncu**",
                "`.ant`",
                "`.antrenman`",
                "`.pen`",
                "`.penaltı`",
                "`.tweet Mesaj`",
                "",
                "**💳 Bütçe**",
                "`.bütçe`",
                "`.bütçe @Oyuncu`",
                "`.gönder @Oyuncu Miktar`",
                "`.paraekle @Oyuncu Miktar`",
                "`.parasil @Oyuncu Miktar`",
                "`.paraayarla @Oyuncu Miktar`",
                "",
                "**🏟️ Takım**",
                "`.takımekle @Takım`",
                "`.takımkaldır @Takım`",
                "`.takımdeğer @Takım 850M`",
                "`.puan`",
                "`.puanekle @Takım 3`",
                "",
                "**👥 Kadro**",
                "`.kadroekle @Takım @Oyuncu Pozisyon`",
                "`.kadrocikar @Takım @Oyuncu`",
                "`.kadro @Takım`",
                "`.formasyon @Takım`",
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
                "**🛡️ Moderasyon**",
                "`.sil Miktar`",
                "`.embed Başlık | Açıklama`",
                "`.kick @Oyuncu`",
                "`.ban @Oyuncu`",
                "`.mute @Oyuncu`",
                "`.unmute @Oyuncu`",
                "`.dm @Oyuncu Mesaj`",
                "",
                "**🎫 Ticket**",
                "`.ticketpanel`"
              ].join("\n")
            );

        return message.reply({
          embeds: [embed]
        });
      }

    } catch (err) {
      console.error(
        "messageCreate hatası:",
        err
      );

      if (!message.replied) {
        try {
          await message.reply(
            "❌ İşlem sırasında bir hata oluştu."
          );
        } catch {}
      }
    }
  }
);

/* =========================
   BUTONLAR
========================= */

client.on(
  "interactionCreate",
  async interaction => {
    try {
      if (
        interaction.isButton()
      ) {
        /* =====================
           KAYIT BUTONLARI
        ===================== */

        if (
          interaction.customId.startsWith(
            "register_"
          )
        ) {
          if (
            !hasRegistrationPermission(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Bu paneli kullanma yetkin yok.",
              ephemeral: true
            });
          }

          const parts =
            interaction.customId.split("_");

          const type = parts[1];
          const userId = parts[2];

          const target =
            await interaction.guild.members.fetch(
              userId
            ).catch(() => null);

          if (!target) {
            return interaction.reply({
              content:
                "❌ Oyuncu bulunamadı.",
              ephemeral: true
            });
          }

          const panel =
            DATA.registrationPanels[userId];

          if (!panel) {
            return interaction.reply({
              content:
                "❌ Bu kayıt panelinin bilgileri bulunamadı.",
              ephemeral: true
            });
          }

          let roleId;
          let roleName;

          if (type === "player") {
            roleId = ROLES.PLAYER;
            roleName = "Futbolcu";
          }

          if (type === "keeper") {
            roleId = ROLES.GOALKEEPER;
            roleName = "Kaleci";
          }

          if (type === "manager") {
            roleId = ROLES.MANAGER;
            roleName = "Teknik Direktör";
          }

          if (type === "member") {
            roleId = ROLES.MEMBER;
            roleName = "Üye";
          }

          if (!roleId) {
            return interaction.reply({
              content:
                "❌ Geçersiz kayıt türü.",
              ephemeral: true
            });
          }

          await target.roles.remove([
            ROLES.UNREGISTERED,
            ROLES.PLAYER,
            ROLES.GOALKEEPER,
            ROLES.MANAGER,
            ROLES.MEMBER
          ]);

          await target.roles.add(
            roleId
          );

          try {
            await target.setNickname(
              panel.nickname
            );
          } catch {}

          const user =
            getUserData(target.id);

          user.registered = true;
          user.roleType = roleName;
          user.nickname =
            panel.nickname;

          saveData();

          delete DATA.registrationPanels[
            userId
          ];

          saveData();

          await interaction.update({
            embeds: [
              new EmbedBuilder()
                .setTitle(
                  "✅ Kayıt Tamamlandı"
                )
                .setDescription(
                  `${target} **${roleName}** olarak kayıt edildi.\n\n` +
                  `🏷️ Takma Ad: **${panel.nickname}**`
                )
            ],
            components: []
          });

          const registrationChannel =
            interaction.guild.channels.cache.get(
              CHANNELS.REGISTRATION
            );

          if (
            registrationChannel &&
            registrationChannel.id !==
              interaction.channel.id
          ) {
            registrationChannel.send(
              `🎉 ${target} **${roleName}** olarak kayıt edildi!`
            ).catch(() => {});
          }

          return;
        }

        /* =====================
           TICKET
        ===================== */

        if (
          interaction.customId ===
          "create_ticket"
        ) {
          return createTicket(
            interaction
          );
        }
      }

      /* =====================
         FORMASYON SELECT
      ===================== */

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId.startsWith(
          "formation_"
        )
      ) {
        if (
          !hasMatchPermission(
            interaction.member
          )
        ) {
          return interaction.reply({
            content:
              "❌ Yetkin yok.",
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

        if (
          !FORMATIONS.includes(
            formation
          )
        ) {
          return interaction.reply({
            content:
              "❌ Geçersiz formasyon.",
            ephemeral: true
          });
        }

        DATA.formations[teamId] =
          formation;

        if (DATA.teams[teamId]) {
          DATA.teams[
            teamId
          ].formation = formation;
        }

        saveData();

        return interaction.update({
          content:
            `⚽ Formasyon **${formation}** olarak ayarlandı.`,
          components: []
        });
      }

    } catch (err) {
      console.error(
        "interactionCreate hatası:",
        err
      );

      if (
        interaction.isRepliable() &&
        !interaction.replied &&
        !interaction.deferred
      ) {
        await interaction.reply({
          content:
            "❌ İşlem sırasında hata oluştu.",
          ephemeral: true
        }).catch(() => {});
      }
    }
  }
);

/* =========================
   YENİ ÜYE
========================= */

client.on(
  "guildMemberAdd",
  async member => {
    try {
      await member.roles.add(
        ROLES.UNREGISTERED
      );

      const channel =
        member.guild.channels.cache.get(
          CHANNELS.REGISTRATION
        );

      if (channel) {
        await channel.send(
          `👋 Hoş geldin ${member}!\n` +
          `📝 Kayıt işlemin için <@&${ROLES.REGISTRATION}> yetkililerini bekleyebilirsin.`
        );
      }

      const data =
        getUserData(member.id);

      data.registered = false;
      data.roleType = "Kayıtsız";

      saveData();
    } catch (err) {
      console.error(
        "guildMemberAdd hatası:",
        err
      );
    }
  }
);

/* =========================
   PERİYODİK SİSTEMLER
========================= */

setInterval(
  async () => {
    try {
      await checkFixtures();
      await checkTickets();
    } catch (err) {
      console.error(
        "Periyodik sistem hatası:",
        err
      );
    }
  },
  1000
);

/* =========================
   READY
========================= */

client.once(
  "ready",
  () => {
    console.log(
      "===================================="
    );

    console.log(
      "⚽ AXERA LEAGUE BOT AKTİF"
    );

    console.log(
      `🤖 Bot: ${client.user.tag}`
    );

    console.log(
      `🏠 Sunucu Sayısı: ${client.guilds.cache.size}`
    );

    console.log(
      "💰 Değer Sistemi: AKTİF"
    );

    console.log(
      "🏋️ Antrenman Sistemi: AKTİF"
    );

    console.log(
      "⚽ Penaltı Sistemi: AKTİF"
    );

    console.log(
      "🏟️ Canlı Maç Sistemi: AKTİF"
    );

    console.log(
      "📅 Fikstür Sistemi: AKTİF"
    );

    console.log(
      "🎫 Ticket Sistemi: AKTİF"
    );

    console.log(
      "===================================="
    );
  }
);

/* =========================
   HATA YAKALAMA
========================= */

process.on(
  "unhandledRejection",
  err => {
    console.error(
      "Unhandled Rejection:",
      err
    );
  }
);

process.on(
  "uncaughtException",
  err => {
    console.error(
      "Uncaught Exception:",
      err
    );
  }
);

/* =========================
   TOKEN
========================= */

if (!process.env.TOKEN) {
  console.error(
    "❌ TOKEN bulunamadı!"
  );

  process.exit(1);
}

client.login(
  process.env.TOKEN
);
