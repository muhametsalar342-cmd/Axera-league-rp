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
   FOOTBALL RP DISCORD BOT
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

  matchMinuteSeconds: 3,
  matchMinutes: 90,

  tweetCooldown: 24 * 60 * 60 * 1000,

  ticketTimeout: 60 * 60 * 1000
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
  matchRewards: {},
  playerMatchHistory: {},
  penalties: {},
  stats: {},
  matchHistory: []
};

function createDefaultData() {
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const fresh = createDefaultData();
      fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(fresh, null, 2)
      );
      return fresh;
    }

    const parsed = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );

    return {
      ...createDefaultData(),
      ...parsed
    };
  } catch (error) {
    console.error("data.json yükleme hatası:", error);

    const fresh = createDefaultData();

    try {
      fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(fresh, null, 2)
      );
    } catch {}

    return fresh;
  }
}

let data = loadData();

function saveData() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(data, null, 2)
    );
  } catch (error) {
    console.error("data.json kayıt hatası:", error);
  }
}

/* =========================================================
   YETKİ
   ========================================================= */

function isAdmin(member) {
  return !!member?.roles?.cache?.has(
    CONFIG.roles.admin
  );
}

function isValueStaff(member) {
  return (
    isAdmin(member) ||
    member?.roles?.cache?.has(CONFIG.roles.value)
  );
}

function isMatchStaff(member) {
  return (
    isAdmin(member) ||
    member?.roles?.cache?.has(CONFIG.roles.match)
  );
}

function isModerator(member) {
  return (
    isAdmin(member) ||
    member?.roles?.cache?.has(CONFIG.roles.moderator)
  );
}

/* =========================================================
   KULLANICI
   ========================================================= */

function ensureUser(userId) {
  if (!data.users[userId]) {
    data.users[userId] = {
      value: 0,
      budget: 0,
      position: null,
      registered: false
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
      draws: 0,
      losses: 0
    };
  }

  return data.stats[userId];
}

/* =========================================================
   PARA FORMATLAMA
   ========================================================= */

function formatMoney(value) {
  value = Math.max(0, Number(value) || 0);

  if (value >= 1_000_000_000) {
    return `${Number(
      (value / 1_000_000_000).toFixed(2)
    )}B€`;
  }

  if (value >= 1_000_000) {
    return `${Number(
      (value / 1_000_000).toFixed(2)
    )}M€`;
  }

  if (value >= 1_000) {
    return `${Number(
      (value / 1_000).toFixed(2)
    )}K€`;
  }

  return `${Math.floor(value)}€`;
}

/*
 * GENEL PARA PARSER
 * Bütçe sistemleri için kullanılabilir.
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
    multiplier = 1_000_000;
  }

  const number = Number(text);

  if (!Number.isFinite(number)) {
    return NaN;
  }

  return Math.floor(number * multiplier);
}

/*
 * SADECE DEĞER KOMUTLARI İÇİN
 *
 * Kabul:
 * 5
 * 5M
 * 5M€
 *
 * Kabul edilmez:
 * 5B
 * 5B€
 * 500K
 * 500K€
 */
function parseValueCommand(input) {
  if (!input) return NaN;

  let text = String(input)
    .trim()
    .toUpperCase()
    .replace(/\s/g, "");

  if (text.endsWith("€")) {
    text = text.slice(0, -1);
  }

  if (text.endsWith("B") || text.endsWith("K")) {
    return NaN;
  }

  if (text.endsWith("M")) {
    text = text.slice(0, -1);
  }

  if (!/^\d+(?:[.,]\d+)?$/.test(text)) {
    return NaN;
  }

  const number = Number(
    text.replace(",", ".")
  );

  if (!Number.isFinite(number)) {
    return NaN;
  }

  return Math.floor(number * 1_000_000);
}

/* =========================================================
   DEĞER SİSTEMİ
   ========================================================= */

/*
 * Oyuncunun nickname'inin sonundaki mevcut M€ değerini bulur.
 *
 * Örnek:
 * L.Yamal | 🇪🇸 | SNT | 425M€
 *
 * sadece:
 * 425M€
 *
 * alınır.
 */
function extractPlayerValue(member) {
  const user = ensureUser(member.id);

  const nickname =
    member.nickname ||
    member.user.globalName ||
    member.user.username;

  const match = nickname.match(
    /(\d+(?:[.,]\d+)?)M€\s*$/i
  );

  if (match) {
    const value = Number(
      match[1].replace(",", ".")
    ) * 1_000_000;

    user.value = Math.floor(value);

    return user.value;
  }

  return Number(user.value) || 0;
}

/*
 * Sadece son M€ değerini kaldırır.
 * İsimdeki hiçbir başka bölüm değişmez.
 */
function removeOnlyValue(nickname) {
  return String(nickname || "")
    .replace(
      /\s*\d+(?:[.,]\d+)?M€\s*$/i,
      ""
    )
    .trim();
}

/*
 * Oyuncunun nickname'ini değiştiren tek fonksiyon.
 *
 * SADECE:
 * 425M€
 * kısmını
 * 430M€
 * yapar.
 */
async function applyPlayerValue(member, newValue) {
  newValue = Math.max(
    0,
    Math.min(
      CONFIG.maxValue,
      Math.floor(Number(newValue) || 0)
    )
  );

  const user = ensureUser(member.id);

  user.value = newValue;

  const currentNickname =
    member.nickname ||
    member.user.globalName ||
    member.user.username;

  const oldValueMatch =
    currentNickname.match(
      /(\d+(?:[.,]\d+)?)M€\s*$/i
    );

  let newNickname;

  if (oldValueMatch) {
    /*
     * Mevcut nickname'deki SADECE değeri değiştir.
     */
    newNickname =
      currentNickname.replace(
        /\d+(?:[.,]\d+)?M€\s*$/i,
        `${formatMoney(newValue)}`
      );
  } else {
    /*
     * Nickname'de henüz değer yoksa
     * mevcut isme değer eklenir.
     */
    newNickname =
      `${currentNickname} | ${formatMoney(newValue)}`;
  }

  try {
    if (member.manageable) {
      await member.setNickname(
        newNickname.slice(0, 32)
      );
    }
  } catch (error) {
    console.log(
      "Nickname değiştirilemedi:",
      error.message
    );
  }

  saveData();

  return newValue;
}

async function addPlayerValue(member, amount) {
  const current = extractPlayerValue(member);

  return applyPlayerValue(
    member,
    current + amount
  );
}

async function subtractPlayerValue(member, amount) {
  const current = extractPlayerValue(member);

  return applyPlayerValue(
    member,
    Math.max(0, current - amount)
  );
}

/* =========================================================
   MENTION
   ========================================================= */

function getMentionedMember(message, text) {
  const match = String(text || "")
    .match(/^<@!?(\d+)>/);

  if (!match) return null;

  return (
    message.guild.members.cache.get(match[1]) ||
    null
  );
}

function removeMention(text) {
  return String(text || "")
    .replace(/^<@!?\d+>\s*/, "")
    .trim();
}

function getRoleFromMention(guild, text) {
  const match = String(text || "")
    .match(/^<@&(\d+)>$/);

  if (!match) return null;

  return guild.roles.cache.get(match[1]) || null;
}

function findTeamRole(guild, input) {
  if (!input) return null;

  const mentioned =
    getRoleFromMention(guild, input);

  if (mentioned) return mentioned;

  const id = String(input).replace(/[^\d]/g, "");

  if (id.length >= 15) {
    return guild.roles.cache.get(id) || null;
  }

  const search = String(input).toLowerCase();

  return guild.roles.cache.find(
    role =>
      role.name.toLowerCase() === search &&
      data.teams[role.id]
  ) || null;
}

/* =========================================================
   POZİSYON
   ========================================================= */

function normalizePosition(position) {
  const p = String(position || "")
    .toUpperCase()
    .trim();

  if (
    ["GK", "K", "KALECI", "KALECİ"].includes(p)
  ) {
    return "GK";
  }

  if (
    ["DEF", "DEFANS", "STP", "BEK"].includes(p)
  ) {
    return "DEF";
  }

  if (
    ["MID", "OS", "ORTA", "ORTASAHA", "ORTA-SAHA"].includes(p)
  ) {
    return "MID";
  }

  if (
    ["FWD", "ST", "FORVET", "SF"].includes(p)
  ) {
    return "FWD";
  }

  return null;
}

function positionText(position) {
  const names = {
    GK: "🧤 Kaleci",
    DEF: "🛡️ Defans",
    MID: "🎯 Orta Saha",
    FWD: "⚡ Forvet"
  };

  return names[position] || "👤 Belirtilmemiş";
}

/* =========================================================
   TAKIM
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

function getTeam(role) {
  if (!role) return null;

  return data.teams[role.id] || null;
}

function getTeamPlayers(guild, team) {
  if (!team) return [];

  const players = new Map();

  for (const player of team.players || []) {
    const member =
      guild.members.cache.get(player.userId);

    if (!member || member.user.bot) continue;

    players.set(member.id, {
      member,
      userId: member.id,
      position:
        normalizePosition(player.position) ||
        "MID",
      value: extractPlayerValue(member)
    });
  }

  const teamRole =
    guild.roles.cache.get(team.id);

  if (teamRole) {
    for (const member of teamRole.members.values()) {
      if (member.user.bot) continue;

      if (!players.has(member.id)) {
        players.set(member.id, {
          member,
          userId: member.id,
          position: "MID",
          value: extractPlayerValue(member)
        });
      }
    }
  }

  return [...players.values()];
}

function calculateTeamValue(team, guild) {
  return getTeamPlayers(
    guild,
    team
  ).reduce(
    (total, player) =>
      total + Number(player.value || 0),
    0
  );
}

/* =========================================================
   PUAN
   ========================================================= */

function sortedStandings() {
  return Object.values(
    data.standings
  ).sort((a, b) => {
    if (b.points !== a.points) {
      return b.points - a.points;
    }

    if (b.gd !== a.gd) {
      return b.gd - a.gd;
    }

    return b.gf - a.gf;
  });
}

function updateStanding(
  teamId,
  result,
  gf,
  ga
) {
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

  const table =
    data.standings[teamId];

  table.played++;
  table.gf += gf;
  table.ga += ga;
  table.gd =
    table.gf - table.ga;

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
   KAYIT
   ========================================================= */

async function registerMember(
  member,
  type,
  nickname
) {
  const rolesToRemove = [
    CONFIG.roles.player,
    CONFIG.roles.goalkeeper,
    CONFIG.roles.technicalDirector,
    CONFIG.roles.member,
    CONFIG.roles.unregistered
  ];

  for (const roleId of rolesToRemove) {
    if (
      member.roles.cache.has(roleId)
    ) {
      await member.roles
        .remove(roleId)
        .catch(() => {});
    }
  }

  const roleMap = {
    player: CONFIG.roles.player,
    goalkeeper: CONFIG.roles.goalkeeper,
    technicalDirector:
      CONFIG.roles.technicalDirector,
    member: CONFIG.roles.member
  };

  const roleId = roleMap[type];

  if (!roleId) return false;

  await member.roles
    .add(roleId)
    .catch(() => {});

  if (nickname) {
    try {
      await member.setNickname(
        `${nickname} | 0M€`.slice(0, 32)
      );
    } catch {}
  }

  const user =
    ensureUser(member.id);

  user.registered = true;

  if (type === "goalkeeper") {
    user.position = "GK";
  }

  saveData();

  return true;
}

function registrationButtons(targetId) {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(
          `register_player_${targetId}`
        )
        .setLabel("Futbolcu")
        .setEmoji("⚽")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(
          `register_goalkeeper_${targetId}`
        )
        .setLabel("Kaleci")
        .setEmoji("🧤")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(
          `register_td_${targetId}`
        )
        .setLabel("Teknik Direktör")
        .setEmoji("🧑‍💼")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(
          `register_member_${targetId}`
        )
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
  "Pas çalışması yapılıyor.",
  "Top kontrolü çalışılıyor.",
  "Kısa pas çalışması tamamlandı.",
  "Şut çalışması başladı.",
  "Hız çalışması yapılıyor.",
  "Taktik çalışma yapılıyor.",
  "Pozisyon çalışması tamamlandı.",
  "Kondisyon çalışması yapılıyor.",
  "Antrenman tamamlandı."
];

async function startTraining(message) {
  const userId =
    message.author.id;

  if (
    data.training[userId]?.active
  ) {
    return message.reply(
      "⚽ Zaten devam eden bir antrenmanın var."
    );
  }

  data.training[userId] = {
    active: true,
    step: 0,
    startedAt: Date.now()
  };

  saveData();

  const embed =
    new EmbedBuilder()
      .setTitle(
        "⚽ Axera League | Antrenman"
      )
      .setDescription(
        `**${message.member.displayName}** antrenmana başladı.\n\n` +
        `İlerleme: **0/${trainingSteps.length}**`
      );

  const msg =
    await message.channel.send({
      embeds: [embed]
    });

  for (
    let i = 0;
    i < trainingSteps.length;
    i++
  ) {
    await new Promise(
      resolve => setTimeout(resolve, 1000)
    );

    data.training[userId].step =
      i + 1;

    const progress =
      "🟩".repeat(i + 1) +
      "⬜".repeat(
        trainingSteps.length - i - 1
      );

    await msg.edit({
      embeds: [
        new EmbedBuilder()
          .setTitle(
            "⚽ Axera League | Antrenman"
          )
          .setDescription(
            `**${message.member.displayName}**\n\n` +
            `${trainingSteps[i]}\n\n` +
            `${progress}\n` +
            `**${i + 1}/${trainingSteps.length}**`
          )
      ]
    }).catch(() => {});
  }

  await addPlayerValue(
    message.member,
    CONFIG.trainingReward
  );

  data.training[userId].active =
    false;

  data.training[userId].completedAt =
    Date.now();

  saveData();

  return message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle(
          "✅ Antrenman Tamamlandı"
        )
        .setDescription(
          `${message.member} antrenmanı tamamladı.\n\n` +
          `💰 Kazanç: **+${formatMoney(CONFIG.trainingReward)}**`
        )
    ]
  });
}

/* =========================================================
   PENALTI
   ========================================================= */

async function penalty(message) {
  const random =
    Math.random();

  let result;
  let reward = 0;

  if (random < 0.50) {
    result =
      "⚽ GOOOOL! Penaltı ağlarla buluştu!";
    reward =
      CONFIG.penaltyReward;
  } else if (random < 0.75) {
    result =
      "🥅 Direk! Top direkten döndü.";
  } else {
    result =
      "🧤 Axera Kalecisi kurtardı!";
  }

  if (reward > 0) {
    await addPlayerValue(
      message.member,
      reward
    );

    ensureStats(
      message.author.id
    ).goals++;

    saveData();
  }

  const embed =
    new EmbedBuilder()
      .setTitle(
        "⚽ Axera League | Penaltı"
      )
      .setDescription(
        `**${message.member.displayName}** penaltıyı kullandı.\n\n` +
        `🧤 Kaleci: **Axera Kalecisi**\n\n` +
        result
      );

  if (reward > 0) {
    embed.addFields({
      name: "💰 Kazanç",
      value:
        `+${formatMoney(reward)}`
    });
  }

  return message.channel.send({
    embeds: [embed]
  });
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
  "5-3-2"
];

function formationMenu(teamId) {
  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(
          `formation_${teamId}`
        )
        .setPlaceholder(
          "Formasyon seç"
        )
        .addOptions(
          formations.map(
            formation => ({
              label: formation,
              value: formation,
              description:
                `${formation} formasyonu`
            })
          )
        )
    );
}

/* =========================================================
   CANLI MAÇ
   ========================================================= */

const matchCommentary = [
  "Orta sahada top kapma mücadelesi.",
  "Top kanada açıldı.",
  "Oyuncu rakip savunmanın arkasına sarktı.",
  "Kısa paslarla oyun kuruluyor.",
  "Savunma hattı pozisyonunu koruyor.",
  "Kanattan tehlikeli bir orta geliyor.",
  "Orta saha oyunu yönlendiriyor.",
  "Savunma ileri çıktı.",
  "Hücum oyuncusu ceza sahasına girdi."
];

const matchFouls = [
  "Hakem faul düdüğünü çaldı.",
  "Orta sahada sert müdahale oldu.",
  "Hakem oyunu durdurdu."
];

function randomItem(array) {
  return array[
    Math.floor(
      Math.random() * array.length
    )
  ];
}

function randomPlayer(players) {
  if (!players.length) {
    return null;
  }

  return players[
    Math.floor(
      Math.random() * players.length
    )
  ];
}

function createMatchId() {
  return (
    `match_${Date.now()}_` +
    Math.random()
      .toString(36)
      .slice(2, 9)
  );
}

async function startLiveMatch(
  channel,
  team1,
  team2,
  fixtureId = null
) {
  const guild =
    channel.guild;

  const players1 =
    getTeamPlayers(
      guild,
      team1
    );

  const players2 =
    getTeamPlayers(
      guild,
      team2
    );

  const matchId =
    createMatchId();

  const match = {
    id: matchId,
    fixtureId,
    team1Id: team1.id,
    team2Id: team2.id,
    minute: 0,
    score1: 0,
    score2: 0,
    events: [],
    players1:
      players1.map(
        p => p.userId
      ),
    players2:
      players2.map(
        p => p.userId
      ),
    rewarded: [],
    finished: false,
    startedAt: Date.now()
  };

  data.activeMatches[matchId] =
    match;

  saveData();

  const liveEmbed =
    new EmbedBuilder()
      .setTitle(
        "🏟️ AXERA LEAGUE | CANLI MAÇ"
      )
      .setDescription(
        `**${team1.name}** 0 - 0 **${team2.name}**\n\n` +
        `⏱️ **0'**\n\n` +
        "Maç başlamak üzere..."
      )
      .setFooter({
        text:
          "3 gerçek saniye = 1 oyun dakikası"
      });

  const msg =
    await channel.send({
      embeds: [liveEmbed]
    });

  const interval =
    setInterval(async () => {
      try {
        const current =
          data.activeMatches[matchId];

        if (
          !current ||
          current.finished
        ) {
          clearInterval(interval);
          return;
        }

        current.minute++;

        let event =
          randomItem(
            matchCommentary
          );

        if (Math.random() < 0.08) {
          event =
            randomItem(matchFouls);
        }

        const value1 =
          calculateTeamValue(
            team1,
            guild
          );

        const value2 =
          calculateTeamValue(
            team2,
            guild
          );

        const total =
          Math.max(
            value1 + value2,
            1
          );

        const advantage =
          (value1 - value2) /
          total;

        let team1Chance =
          0.5 +
          advantage * 0.20;

        team1Chance =
          Math.max(
            0.35,
            Math.min(
              0.65,
              team1Chance
            )
          );

        /*
         * Gol ihtimali.
         */
        if (
          Math.random() < 0.045
        ) {
          const team1Goal =
            Math.random() <
            team1Chance;

          if (team1Goal) {
            current.score1++;

            const scorer =
              randomPlayer(
                players1
              );

            const possibleAssists =
              players1.filter(
                p =>
                  p.userId !==
                  scorer?.userId
              );

            const assist =
              randomPlayer(
                possibleAssists
              );

            if (scorer) {
              await addPlayerValue(
                scorer.member,
                CONFIG.matchGoalReward
              );

              ensureStats(
                scorer.userId
              ).goals++;

              event =
                `⚽ **GOOOL!** ${scorer.member.displayName} topu ağlara gönderdi!`;
            }

            if (assist) {
              await addPlayerValue(
                assist.member,
                CONFIG.matchAssistReward
              );

              ensureStats(
                assist.userId
              ).assists++;

              event +=
                `\n🎯 Asist: **${assist.member.displayName}**`;
            }
          } else {
            current.score2++;

            const scorer =
              randomPlayer(
                players2
              );

            const possibleAssists =
              players2.filter(
                p =>
                  p.userId !==
                  scorer?.userId
              );

            const assist =
              randomPlayer(
                possibleAssists
              );

            if (scorer) {
              await addPlayerValue(
                scorer.member,
                CONFIG.matchGoalReward
              );

              ensureStats(
                scorer.userId
              ).goals++;

              event =
                `⚽ **GOOOL!** ${scorer.member.displayName} topu ağlara gönderdi!`;
            }

            if (assist) {
              await addPlayerValue(
                assist.member,
                CONFIG.matchAssistReward
              );

              ensureStats(
                assist.userId
              ).assists++;

              event +=
                `\n🎯 Asist: **${assist.member.displayName}**`;
            }
          }
        }

        current.events.unshift(
          `**${current.minute}'** ${event}`
        );

        current.events =
          current.events.slice(
            0,
            8
          );

        await msg.edit({
          embeds: [
            new EmbedBuilder()
              .setTitle(
                "🏟️ AXERA LEAGUE | CANLI MAÇ"
              )
              .setDescription(
                `**${team1.name}** ${current.score1} - ` +
                `${current.score2} **${team2.name}**\n\n` +
                `⏱️ **${current.minute}'**\n\n` +
                "**Son Olaylar**\n" +
                current.events.join("\n")
              )
              .setFooter({
                text:
                  "3 gerçek saniye = 1 oyun dakikası"
              })
          ]
        }).catch(() => {});

        saveData();

        if (
          current.minute >=
          CONFIG.matchMinutes
        ) {
          clearInterval(interval);

          await finishMatch(
            channel,
            matchId,
            msg
          );
        }
      } catch (error) {
        console.error(
          "Canlı maç hatası:",
          error
        );

        clearInterval(interval);
      }
    }, CONFIG.matchMinuteSeconds * 1000);

  return matchId;
}

/* =========================================================
   MAÇ BİTİŞ
   ========================================================= */

async function finishMatch(
  channel,
  matchId,
  msg
) {
  const match =
    data.activeMatches[matchId];

  if (
    !match ||
    match.finished
  ) {
    return;
  }

  match.finished = true;

  const guild =
    channel.guild;

  const team1 =
    data.teams[match.team1Id];

  const team2 =
    data.teams[match.team2Id];

  if (!team1 || !team2) {
    delete data.activeMatches[matchId];
    saveData();
    return;
  }

  /*
   * Rol + manuel kadro birleşik.
   * Aynı oyuncu iki kez ödüllendirilmez.
   */
  const participantIds =
    [
      ...new Set([
        ...(match.players1 || []),
        ...(match.players2 || [])
      ])
    ];

  for (
    const userId of participantIds
  ) {
    if (
      match.rewarded.includes(
        userId
      )
    ) {
      continue;
    }

    const member =
      guild.members.cache.get(
        userId
      );

    if (
      !member ||
      member.user.bot
    ) {
      continue;
    }

    await addPlayerValue(
      member,
      CONFIG.matchParticipationReward
    );

    match.rewarded.push(
      userId
    );

    ensureStats(
      userId
    ).matches++;
  }

  let result1 = "D";
  let result2 = "D";

  if (
    match.score1 >
    match.score2
  ) {
    result1 = "W";
    result2 = "L";
  } else if (
    match.score1 <
    match.score2
  ) {
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

  let winnerText =
    "🤝 Maç berabere bitti!";

  if (
    match.score1 >
    match.score2
  ) {
    winnerText =
      `🏆 **${team1.name}** kazandı!`;
  } else if (
    match.score2 >
    match.score1
  ) {
    winnerText =
      `🏆 **${team2.name}** kazandı!`;
  }

  await msg.edit({
    embeds: [
      new EmbedBuilder()
        .setTitle(
          "🏁 AXERA LEAGUE | MAÇ SONU"
        )
        .setDescription(
          `**${team1.name}** ${match.score1} - ` +
          `${match.score2} **${team2.name}**\n\n` +
          winnerText
        )
        .addFields({
          name:
            "💰 Katılım Ödülü",
          value:
            `Maça katılanlara **+${formatMoney(CONFIG.matchParticipationReward)}** değer verildi.`
        })
    ]
  }).catch(() => {});

  data.matchHistory.push({
    id: matchId,
    team1Id: team1.id,
    team2Id: team2.id,
    score1: match.score1,
    score2: match.score2,
    date: Date.now()
  });

  if (match.fixtureId) {
    const fixture =
      data.fixtures.find(
        f =>
          f.id ===
          match.fixtureId
      );

    if (fixture) {
      fixture.status =
        "completed";

      fixture.matchId =
        matchId;
    }
  }

  delete data.activeMatches[
    matchId
  ];

  saveData();
}

/* =========================================================
   FİKSTÜR
   ========================================================= */

function parseDateTime(
  date,
  time
) {
  const parsed =
    new Date(
      `${date}T${time}:00`
    );

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return null;
  }

  return parsed.getTime();
}

async function checkFixtures() {
  const now =
    Date.now();

  for (
    const fixture of data.fixtures
  ) {
    if (
      fixture.status !==
      "scheduled"
    ) {
      continue;
    }

    if (
      fixture.timestamp >
      now
    ) {
      continue;
    }

    const team1 =
      data.teams[
        fixture.team1Id
      ];

    const team2 =
      data.teams[
        fixture.team2Id
      ];

    if (
      !team1 ||
      !team2
    ) {
      fixture.status =
        "cancelled";

      continue;
    }

    const channel =
      client.channels.cache.get(
        CONFIG.channels.match
      );

    if (!channel) {
      continue;
    }

    fixture.status =
      "live";

    await startLiveMatch(
      channel,
      team1,
      team2,
      fixture.id
    );
  }

  saveData();
}

setInterval(
  () => {
    checkFixtures()
      .catch(console.error);
  },
  1000
);

/* =========================================================
   TWEET
   ========================================================= */

async function createTweet(
  message,
  text
) {
  if (
    message.channel.id !==
    CONFIG.channels.tweet
  ) {
    return message.reply(
      `🐦 Tweet komutu yalnızca <#${CONFIG.channels.tweet}> kanalında kullanılabilir.`
    );
  }

  if (!text) {
    return message.reply(
      "❌ Tweet mesajı boş olamaz."
    );
  }

  const now =
    Date.now();

  const lastTweet =
    Number(
      data.tweetCooldowns[
        message.author.id
      ] || 0
    );

  let rewardText = "";

  if (
    now - lastTweet >=
    CONFIG.tweetCooldown
  ) {
    await addPlayerValue(
      message.member,
      CONFIG.tweetReward
    );

    data.tweetCooldowns[
      message.author.id
    ] = now;

    rewardText =
      `\n\n💰 Tweet ödülü: **+${formatMoney(CONFIG.tweetReward)}**`;
  } else {
    rewardText =
      "\n\n⏳ Bu 24 saatlik dönemde ödül zaten alındı.";
  }

  const embed =
    new EmbedBuilder()
      .setAuthor({
        name:
          message.member.displayName,
        iconURL:
          message.member.displayAvatarURL()
      })
      .setDescription(
        text + rewardText
      )
      .setFooter({
        text:
          "Axera League • Tweet"
      })
      .setTimestamp();

  await message.delete()
    .catch(() => {});

  await message.channel.send({
    embeds: [embed]
  });

  saveData();
}

/* =========================================================
   BÜTÇE
   ========================================================= */

async function showBudget(
  message,
  target
) {
  const member =
    target || message.member;

  const user =
    ensureUser(member.id);

  return message.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle(
          "💰 Axera League | Bütçe"
        )
        .setDescription(
          `👤 ${member}\n\n` +
          `💵 Bütçe: **${formatMoney(user.budget)}**`
        )
    ]
  });
}

async function transferBudget(
  message,
  target,
  amount
) {
  if (!target) {
    return message.reply(
      "❌ Oyuncu belirtmelisin."
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

  const value =
    parseMoney(amount);

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return message.reply(
      "❌ Geçerli bir miktar gir."
    );
  }

  const sender =
    ensureUser(
      message.author.id
    );

  const receiver =
    ensureUser(target.id);

  if (
    sender.budget <
    value
  ) {
    return message.reply(
      `❌ Yeterli bütçen yok.\nMevcut: **${formatMoney(sender.budget)}**`
    );
  }

  sender.budget -= value;
  receiver.budget += value;

  saveData();

  return message.reply(
    `✅ **${formatMoney(value)}** ${target} kullanıcısına gönderildi.`
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
    .setTitle(
      "📚 AXERA LEAGUE | KOMUTLAR"
    )
    .setDescription(
      "**👤 Kayıt**\n" +
      "`.k @Oyuncu TakmaAdı`\n" +
      "`.kayıtsızver @Oyuncu`\n\n" +

      "**💰 Değer**\n" +
      "`.dver @Oyuncu 5`\n" +
      "`.dver @Oyuncu 5M€`\n" +
      "`.dsil @Oyuncu 5`\n" +
      "`.dsil @Oyuncu 5M€`\n\n" +

      "**⚽ Oyuncu**\n" +
      "`.ant`\n" +
      "`.antrenman`\n" +
      "`.pen`\n" +
      "`.penaltı`\n" +
      "`.ara Oyuncu`\n\n" +

      "**🏟️ Maç**\n" +
      "`.maç @Takım1 @Takım2`\n" +
      "`.puan`\n" +
      "`.puanekle @Takım 3`\n" +
      "`.takımdeğer @Takım 850M`\n\n" +

      "**👥 Kadro**\n" +
      "`.kadroekle @Takım @Oyuncu GK`\n" +
      "`.kadrocikar @Takım @Oyuncu`\n" +
      "`.kadro @Takım`\n" +
      "`.formasyon @Takım`\n\n" +

      "**📅 Fikstür**\n" +
      "`.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`\n" +
      "`.fikstür`\n" +
      "`.fikstürcikar @Takım1 @Takım2`\n\n" +

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

      "**🎫 Ticket**\n" +
      "`.ticketpanel`\n\n" +

      "ℹ️ Değer komutlarında yalnızca **M€** kullanılır."
    );
}

/* =========================================================
   MESSAGE CREATE
   ========================================================= */

client.on(
  "messageCreate",
  async message => {
    try {
      if (
        !message.guild ||
        message.author.bot
      ) {
        return;
      }

      /*
       * Ticket son mesaj zamanı
       */
      if (
        data.tickets[
          message.channel.id
        ]
      ) {
        data.tickets[
          message.channel.id
        ].lastMessageAt =
          Date.now();

        saveData();
      }

      const content =
        message.content.trim();

      if (
        !content.startsWith(
          PREFIX
        )
      ) {
        return;
      }

      const split =
        content
          .slice(PREFIX.length)
          .trim()
          .split(/\s+/);

      const command =
        split.shift()
          ?.toLowerCase();

      const args = split;

      if (!command) return;

      /* =====================================================
         YARDIM
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
          message.channel.id !==
          CONFIG.channels.registration
        ) {
          return message.reply(
            `❌ Yalnızca <#${CONFIG.channels.registration}> kanalında kullanılabilir.`
          );
        }

        if (
          !isAdmin(
            message.member
          )
        ) {
          return message.reply(
            "❌ Kayıt yetkin yok."
          );
        }

        const raw =
          message.content
            .slice(
              PREFIX.length +
              command.length
            )
            .trim();

        const target =
          getMentionedMember(
            message,
            raw
          );

        if (!target) {
          return message.reply(
            "❌ Kullanım: `.k @Oyuncu TakmaAdı`"
          );
        }

        const nickname =
          removeMention(raw);

        if (!nickname) {
          return message.reply(
            "❌ Takma ad belirtmelisin."
          );
        }

        data.registrationPanels[
          target.id
        ] = {
          targetId:
            target.id,
          nickname,
          createdBy:
            message.author.id,
          createdAt:
            Date.now()
        };

        saveData();

        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle(
                "📝 Axera League | Kayıt"
              )
              .setDescription(
                `👤 Oyuncu: ${target}\n` +
                `🏷️ Takma Ad: **${nickname}**\n\n` +
                "Kayıt türünü aşağıdaki butonlardan seç."
              )
          ],
          components: [
            registrationButtons(
              target.id
            )
          ]
        });
      }

      /* =====================================================
         KAYITSIZ VER
         ===================================================== */

      if (
        command ===
          "kayıtsızver" ||
        command ===
          "kayitsizver"
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
            message,
            args.join(" ")
          );

        if (!target) {
          return message.reply(
            "❌ Kullanım: `.kayıtsızver @Oyuncu`"
          );
        }

        for (
          const roleId of [
            CONFIG.roles.player,
            CONFIG.roles.goalkeeper,
            CONFIG.roles.technicalDirector,
            CONFIG.roles.member
          ]
        ) {
          await target.roles
            .remove(roleId)
            .catch(() => {});
        }

        await target.roles
          .add(
            CONFIG.roles.unregistered
          )
          .catch(() => {});

        ensureUser(
          target.id
        ).registered = false;

        saveData();

        return message.reply(
          `✅ ${target} kayıt dışı yapıldı.`
        );
      }

      /* =====================================================
         ARA
         ===================================================== */

      if (command === "ara") {
        const query =
          args.join(" ")
            .toLowerCase()
            .trim();

        if (!query) {
          return message.reply(
            "❌ Arama kelimesi yaz."
          );
        }

        const results =
          message.guild.members.cache
            .filter(member => {
              if (
                member.user.bot
              ) {
                return false;
              }

              if (
                member.roles.cache.has(
                  CONFIG.roles.unregistered
                )
              ) {
                return false;
              }

              const name =
                (
                  member.nickname ||
                  member.displayName ||
                  member.user.username
                ).toLowerCase();

              return name.includes(
                query
              );
            })
            .first(15);

        if (
          !results.length
        ) {
          return message.reply(
            "🔎 Kayıtlı oyuncu bulunamadı."
          );
        }

        const text =
          results
            .map(member => {
              return (
                `• ${member} — **${formatMoney(
                  extractPlayerValue(member)
                )}**`
              );
            })
            .join("\n");

        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle(
                "🔎 Oyuncu Arama"
              )
              .setDescription(
                text
              )
          ]
        });
      }

      /* =====================================================
         DVER
         SADECE M€
         ===================================================== */

      if (command === "dver") {
        if (
          !isValueStaff(
            message.member
          )
        ) {
          return message.reply(
            "❌ Değer yetkin yok."
          );
        }

        if (
          message.channel.id !==
          CONFIG.channels.tweet
        ) {
          return message.reply(
            `❌ Değer komutları yalnızca <#${CONFIG.channels.tweet}> kanalında kullanılabilir.`
          );
        }

        const raw =
          message.content
            .slice(
              PREFIX.length +
              command.length
            )
            .trim();

        const target =
          getMentionedMember(
            message,
            raw
          );

        if (!target) {
          return message.reply(
            "❌ Kullanım: `.dver @Oyuncu 5M€`"
          );
        }

        const amountText =
          removeMention(raw);

        const amount =
          parseValueCommand(
            amountText
          );

        if (
          !Number.isFinite(
            amount
          ) ||
          amount <= 0
        ) {
          return message.reply(
            "❌ Yalnızca M€ değeri girilebilir.\nÖrnek: `.dver @Oyuncu 5M€`"
          );
        }

        const before =
          extractPlayerValue(
            target
          );

        const after =
          await addPlayerValue(
            target,
            amount
          );

        return message.reply(
          `✅ ${target} değerine **+${formatMoney(amount)}** eklendi.\n\n` +
          `Önce: **${formatMoney(before)}**\n` +
          `Sonra: **${formatMoney(after)}**`
        );
      }

      /* =====================================================
         DSIL
         SADECE M€
         ===================================================== */

      if (command === "dsil") {
        if (
          !isValueStaff(
            message.member
          )
        ) {
          return message.reply(
            "❌ Değer yetkin yok."
          );
        }

        if (
          message.channel.id !==
          CONFIG.channels.tweet
        ) {
          return message.reply(
            `❌ Değer komutları yalnızca <#${CONFIG.channels.tweet}> kanalında kullanılabilir.`
          );
        }

        const raw =
          message.content
            .slice(
              PREFIX.length +
              command.length
            )
            .trim();

        const target =
          getMentionedMember(
            message,
            raw
          );

        if (!target) {
          return message.reply(
            "❌ Kullanım: `.dsil @Oyuncu 5M€`"
          );
        }

        const amountText =
          removeMention(raw);

        const amount =
          parseValueCommand(
            amountText
          );

        if (
          !Number.isFinite(
            amount
          ) ||
          amount <= 0
        ) {
          return message.reply(
            "❌ Yalnızca M€ değeri girilebilir.\nÖrnek: `.dsil @Oyuncu 5M€`"
          );
        }

        const before =
          extractPlayerValue(
            target
          );

        const after =
          await subtractPlayerValue(
            target,
            amount
          );

        return message.reply(
          `✅ ${target} değerinden **-${formatMoney(amount)}** çıkarıldı.\n\n` +
          `Önce: **${formatMoney(before)}**\n` +
          `Sonra: **${formatMoney(after)}**`
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
            `❌ Yalnızca <#${CONFIG.channels.training}> kanalında kullanılabilir.`
          );
        }

        return startTraining(
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
        if (
          message.channel.id !==
          CONFIG.channels.penalty
        ) {
          return message.reply(
            `❌ Yalnızca <#${CONFIG.channels.penalty}> kanalında kullanılabilir.`
          );
        }

        return penalty(
          message
        );
      }

      /* =====================================================
         TWEET
         ===================================================== */

      if (command === "tweet") {
        const tweet =
          message.content
            .slice(
              PREFIX.length +
              command.length
            )
            .trim();

        return createTweet(
          message,
          tweet
        );
      }

      /* =====================================================
         BÜTÇE
         ===================================================== */

      if (
        command === "bütçe" ||
        command === "butce"
      ) {
        const raw =
          message.content
            .slice(
              PREFIX.length +
              command.length
            )
            .trim();

        if (!raw) {
          return showBudget(
            message
          );
        }

        const target =
          getMentionedMember(
            message,
            raw
          );

        if (!target) {
          return message.reply(
            "❌ Kullanım: `.bütçe @Oyuncu`"
          );
        }

        return showBudget(
          message,
          target
        );
      }

      /* =====================================================
         GÖNDER
         ===================================================== */

      if (
        command === "gönder" ||
        command === "gonder"
      ) {
        const raw =
          message.content
            .slice(
              PREFIX.length +
              command.length
            )
            .trim();

        const target =
          getMentionedMember(
            message,
            raw
          );

        if (!target) {
          return message.reply(
            "❌ Kullanım: `.gönder @Oyuncu 50`"
          );
        }

        const amount =
          removeMention(raw);

        return transferBudget(
          message,
          target,
          amount
        );
      }

      /* =====================================================
         PARA EKLE
         ===================================================== */

      if (
        command === "paraekle"
      ) {
        if (
          !isValueStaff(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
          );
        }

        const raw =
          message.content
            .slice(
              PREFIX.length +
              command.length
            )
            .trim();

        const target =
          getMentionedMember(
            message,
            raw
          );

        if (!target) {
          return message.reply(
            "❌ Kullanım: `.paraekle @Oyuncu 50`"
          );
        }

        const amount =
          parseMoney(
            removeMention(raw)
          );

        if (
          !Number.isFinite(
            amount
          ) ||
          amount <= 0
        ) {
          return message.reply(
            "❌ Geçersiz miktar."
          );
        }

        const user =
          ensureUser(
            target.id
          );

        user.budget += amount;

        saveData();

        return message.reply(
          `✅ ${target} bütçesine **+${formatMoney(amount)}** eklendi.`
        );
      }

      /* =====================================================
         PARA SİL
         ===================================================== */

      if (
        command === "parasil"
      ) {
        if (
          !isValueStaff(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
          );
        }

        const raw =
          message.content
            .slice(
              PREFIX.length +
              command.length
            )
            .trim();

        const target =
          getMentionedMember(
            message,
            raw
          );

        if (!target) {
          return message.reply(
            "❌ Kullanım: `.parasil @Oyuncu 20`"
          );
        }

        const amount =
          parseMoney(
            removeMention(raw)
          );

        if (
          !Number.isFinite(
            amount
          ) ||
          amount <= 0
        ) {
          return message.reply(
            "❌ Geçersiz miktar."
          );
        }

        const user =
          ensureUser(
            target.id
          );

        user.budget =
          Math.max(
            0,
            user.budget -
              amount
          );

        saveData();

        return message.reply(
          `✅ ${target} bütçesinden **${formatMoney(amount)}** silindi.`
        );
      }

      /* =====================================================
         PARA AYARLA
         ===================================================== */

      if (
        command ===
        "paraayarla"
      ) {
        if (
          !isValueStaff(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
          );
        }

        const raw =
          message.content
            .slice(
              PREFIX.length +
              command.length
            )
            .trim();

        const target =
          getMentionedMember(
            message,
            raw
          );

        if (!target) {
          return message.reply(
            "❌ Kullanım: `.paraayarla @Oyuncu 100`"
          );
        }

        const amount =
          parseMoney(
            removeMention(raw)
          );

        if (
          !Number.isFinite(
            amount
          ) ||
          amount < 0
        ) {
          return message.reply(
            "❌ Geçersiz miktar."
          );
        }

        ensureUser(
          target.id
        ).budget =
          amount;

        saveData();

        return message.reply(
          `✅ ${target} bütçesi **${formatMoney(amount)}** olarak ayarlandı.`
        );
      }

      /* =====================================================
         TAKIM EKLE
         ===================================================== */

      if (
        command ===
          "takımekle" ||
        command ===
          "takimekle"
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
          findTeamRole(
            message.guild,
            args[0]
          );

        if (!role) {
          return message.reply(
            "❌ Takım rolü bulunamadı."
          );
        }

        if (
          data.teams[role.id]
        ) {
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
          findTeamRole(
            message.guild,
            args[0]
          );

        if (!role) {
          return message.reply(
            "❌ Takım bulunamadı."
          );
        }

        const active =
          Object.values(
            data.activeMatches
          ).some(
            match =>
              match.team1Id ===
                role.id ||
              match.team2Id ===
                role.id
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

        delete data.cups[
          role.id
        ];

        delete data.formations[
          role.id
        ];

        data.fixtures =
          data.fixtures.filter(
            fixture =>
              fixture.team1Id !==
                role.id &&
              fixture.team2Id !==
                role.id
          );

        saveData();

        return message.reply(
          `🗑️ **${role.name}** kaldırıldı.`
        );
      }

      /* =====================================================
         PUAN
         ===================================================== */

      if (command === "puan") {
        const standings =
          sortedStandings();

        if (
          !standings.length
        ) {
          return message.reply(
            "📊 Henüz takım yok."
          );
        }

        const text =
          standings
            .map(
              (team, index) => {
                const role =
                  message.guild.roles.cache.get(
                    team.teamId
                  );

                return (
                  `**${index + 1}.** ` +
                  `${role?.name || "Silinmiş Takım"} — ` +
                  `**${team.points} P** | ` +
                  `AV: **${team.gd}** | ` +
                  `AG: **${team.gf}**`
                );
              }
            )
            .join("\n");

        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle(
                "🏆 Axera League | Puan Durumu"
              )
              .setDescription(
                text
              )
          ]
        });
      }

      /* =====================================================
         PUAN EKLE
         ===================================================== */

      if (
        command ===
        "puanekle"
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
          findTeamRole(
            message.guild,
            args[0]
          );

        const amount =
          Number(args[1]);

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

        ensureTeam(role);

        data.standings[
          role.id
        ].points += amount;

        saveData();

        return message.reply(
          `✅ **${role.name}** takımına **${amount} puan** eklendi.`
        );
      }

      /* =====================================================
         TAKIM DEĞERİ
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
          findTeamRole(
            message.guild,
            args[0]
          );

        const amount =
          parseMoney(
            args[1]
          );

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
          ensureTeam(role);

        team.budget =
          amount;

        saveData();

        return message.reply(
          `✅ **${role.name}** takım değeri **${formatMoney(amount)}** olarak ayarlandı.`
        );
      }

      /* =====================================================
         KADRO EKLE
         ===================================================== */

      if (
        command ===
        "kadroekle"
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
          findTeamRole(
            message.guild,
            args[0]
          );

        const target =
          getMentionedMember(
            message,
            args[1]
          );

        const position =
          normalizePosition(
            args[2]
          );

        if (
          !role ||
          !target ||
          !position
        ) {
          return message.reply(
            "❌ Kullanım: `.kadroekle @Takım @Oyuncu GK`"
          );
        }

        const team =
          ensureTeam(role);

        const existing =
          team.players.find(
            p =>
              p.userId ===
              target.id
          );

        if (existing) {
          existing.position =
            position;

          existing.value =
            extractPlayerValue(
              target
            );
        } else {
          team.players.push({
            userId:
              target.id,
            position,
            value:
              extractPlayerValue(
                target
              )
          });
        }

        saveData();

        return message.reply(
          `✅ ${target}, **${role.name}** kadrosuna ${positionText(position)} olarak eklendi.`
        );
      }

      /* =====================================================
         KADRO ÇIKAR
         ===================================================== */

      if (
        command ===
        "kadrocikar"
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
          findTeamRole(
            message.guild,
            args[0]
          );

        const target =
          getMentionedMember(
            message,
            args[1]
          );

        if (
          !role ||
          !target
        ) {
          return message.reply(
            "❌ Kullanım: `.kadrocikar @Takım @Oyuncu`"
          );
        }

        const team =
          getTeam(role);

        if (!team) {
          return message.reply(
            "❌ Takım kayıtlı değil."
          );
        }

        const before =
          team.players.length;

        team.players =
          team.players.filter(
            p =>
              p.userId !==
              target.id
          );

        saveData();

        if (
          before ===
          team.players.length
        ) {
          return message.reply(
            "❌ Oyuncu manuel kadroda bulunamadı."
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
        const role =
          findTeamRole(
            message.guild,
            args[0]
          );

        if (!role) {
          return message.reply(
            "❌ Kullanım: `.kadro @Takım`"
          );
        }

        const team =
          getTeam(role);

        if (!team) {
          return message.reply(
            "❌ Takım kayıtlı değil."
          );
        }

        const players =
          getTeamPlayers(
            message.guild,
            team
          );

        const groups = {
          GK: [],
          DEF: [],
          MID: [],
          FWD: []
        };

        for (
          const player of players
        ) {
          const position =
            normalizePosition(
              player.position
            ) || "MID";

          groups[
            position
          ].push(player);
        }

        const fields = [];

        for (
          const position of [
            "GK",
            "DEF",
            "MID",
            "FWD"
          ]
        ) {
          const list =
            groups[position];

          fields.push({
            name:
              positionText(
                position
              ),
            value:
              list.length
                ? list
                    .map(
                      player =>
                        `• ${player.member} — **${formatMoney(player.value)}**`
                    )
                    .join("\n")
                : "—"
          });
        }

        const total =
          players.reduce(
            (sum, player) =>
              sum +
              player.value,
            0
          );

        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle(
                `📋 ${team.name} | Kadro`
              )
              .addFields(
                fields
              )
              .addFields({
                name:
                  "📊 Toplam",
                value:
                  `👥 Oyuncu: **${players.length}**\n` +
                  `💰 Değer: **${formatMoney(total)}**`
              })
          ]
        });
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
          findTeamRole(
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
            formationMenu(
              role.id
            )
          ]
        });
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

        const role1 =
          findTeamRole(
            message.guild,
            args[0]
          );

        const role2 =
          findTeamRole(
            message.guild,
            args[1]
          );

        const date =
          args[2];

        const time =
          args[3];

        if (
          !role1 ||
          !role2 ||
          !date ||
          !time
        ) {
          return message.reply(
            "❌ Kullanım: `.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`"
          );
        }

        const timestamp =
          parseDateTime(
            date,
            time
          );

        if (!timestamp) {
          return message.reply(
            "❌ Tarih veya saat hatalı."
          );
        }

        ensureTeam(role1);
        ensureTeam(role2);

        const fixture = {
          id:
            data.nextFixtureId++,
          team1Id:
            role1.id,
          team2Id:
            role2.id,
          timestamp,
          date,
          time,
          status:
            "scheduled"
        };

        data.fixtures.push(
          fixture
        );

        saveData();

        return message.reply(
          `📅 Fikstür eklendi:\n**${role1.name}** 🆚 **${role2.name}**\n🕐 ${date} ${time}`
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
          data.fixtures
            .filter(
              f =>
                f.status !==
                "cancelled"
            )
            .sort(
              (a, b) =>
                a.timestamp -
                b.timestamp
            )
            .slice(
              0,
              20
            );

        if (
          !fixtures.length
        ) {
          return message.reply(
            "📅 Fikstür bulunmuyor."
          );
        }

        const text =
          fixtures
            .map(f => {
              const team1 =
                data.teams[
                  f.team1Id
                ]?.name ||
                "Silinmiş Takım";

              const team2 =
                data.teams[
                  f.team2Id
                ]?.name ||
                "Silinmiş Takım";

              const status =
                f.status ===
                "live"
                  ? "🔴 Canlı"
                  : f.status ===
                    "completed"
                    ? "✅ Tamamlandı"
                    : "⏳ Planlandı";

              return (
                `**#${f.id}** ${team1} 🆚 ${team2}\n` +
                `🕐 ${f.date} ${f.time} — ${status}`
              );
            })
            .join("\n\n");

        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle(
                "📅 Axera League | Fikstür"
              )
              .setDescription(
                text
              )
          ]
        });
      }

      /* =====================================================
         FİKSTÜR ÇIKAR
         ===================================================== */

      if (
        command ===
          "fiksturcikar" ||
        command ===
          "fikstürcikar"
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

        const role1 =
          findTeamRole(
            message.guild,
            args[0]
          );

        const role2 =
          findTeamRole(
            message.guild,
            args[1]
          );

        if (
          !role1 ||
          !role2
        ) {
          return message.reply(
            "❌ İki takım belirtmelisin."
          );
        }

        const before =
          data.fixtures.length;

        data.fixtures =
          data.fixtures.filter(
            fixture =>
              !(
                fixture.team1Id ===
                  role1.id &&
                fixture.team2Id ===
                  role2.id &&
                fixture.status ===
                  "scheduled"
              )
          );

        saveData();

        if (
          before ===
          data.fixtures.length
        ) {
          return message.reply(
            "❌ Planlanmış fikstür bulunamadı."
          );
        }

        return message.reply(
          `🗑️ **${role1.name} - ${role2.name}** fikstürü kaldırıldı.`
        );
      }

      /* =====================================================
         TAKIM BÜTÇESİ
         ===================================================== */

      if (
        command ===
          "takımbütçe" ||
        command ===
          "takimbutce"
      ) {
        const role =
          findTeamRole(
            message.guild,
            args[0]
          );

        if (!role) {
          return message.reply(
            "❌ Kullanım: `.takımbütçe @Takım`"
          );
        }

        const team =
          getTeam(role);

        if (!team) {
          return message.reply(
            "❌ Takım kayıtlı değil."
          );
        }

        return message.reply(
          `💰 **${team.name}** takım bütçesi: **${formatMoney(team.budget)}**`
        );
      }

      /* =====================================================
         KUPA EKLE
         ===================================================== */

      if (
        command ===
        "kupaekle"
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
          findTeamRole(
            message.guild,
            args[0]
          );

        const cupName =
          args
            .slice(1)
            .join(" ");

        if (
          !role ||
          !cupName
        ) {
          return message.reply(
            "❌ Kullanım: `.kupaekle @Takım KupaAdı`"
          );
        }

        const cups =
          getCups(
            role.id
          );

        cups.push({
          name:
            cupName,
          date:
            Date.now()
        });

        saveData();

        return message.reply(
          `🏆 **${cupName}**, **${role.name}** müzesine eklendi.`
        );
      }

      /* =====================================================
         KUPA SİL
         ===================================================== */

      if (
        command ===
        "kupasil"
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
          findTeamRole(
            message.guild,
            args[0]
          );

        const cupName =
          args
            .slice(1)
            .join(" ");

        if (
          !role ||
          !cupName
        ) {
          return message.reply(
            "❌ Kullanım: `.kupasil @Takım KupaAdı`"
          );
        }

        const cups =
          getCups(
            role.id
          );

        const before =
          cups.length;

        data.cups[
          role.id
        ] =
          cups.filter(
            cup =>
              cup.name.toLowerCase() !==
              cupName.toLowerCase()
          );

        saveData();

        if (
          before ===
          data.cups[
            role.id
          ].length
        ) {
          return message.reply(
            "❌ Kupa bulunamadı."
          );
        }

        return message.reply(
          `🗑️ **${cupName}** kupası silindi.`
        );
      }

      /* =====================================================
         MÜZE
         ===================================================== */

      if (
        command === "müze" ||
        command === "muze"
      ) {
        const role =
          findTeamRole(
            message.guild,
            args[0]
          );

        if (!role) {
          return message.reply(
            "❌ Kullanım: `.müze @Takım`"
          );
        }

        const cups =
          getCups(
            role.id
          );

        const text =
          cups.length
            ? cups
                .map(
                  (cup, index) =>
                    `🏆 **${index + 1}.** ${cup.name}`
                )
                .join("\n")
            : "Henüz kupa bulunmuyor.";

        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle(
                `🏛️ ${role.name} | Müze`
              )
              .setDescription(
                text
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

        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle(
                "🎫 Axera League | Destek"
              )
              .setDescription(
                "Destek almak için aşağıdaki butona bas."
              )
          ],
          components: [
            new ActionRowBuilder()
              .addComponents(
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
              )
          ]
        });
      }

      /* =====================================================
         SİL
         ===================================================== */

      if (command === "sil") {
        if (
          !isAdmin(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
          );
        }

        let amount =
          Number(args[0]);

        if (
          !Number.isInteger(
            amount
          )
        ) {
          return message.reply(
            "❌ Kullanım: `.sil 10`"
          );
        }

        amount =
          Math.max(
            1,
            Math.min(
              1000,
              amount
            )
          );

        const deleted =
          await message.channel
            .bulkDelete(
              amount + 1,
              true
            )
            .catch(
              () => null
            );

        if (!deleted) {
          return message.reply(
            "❌ Mesajlar silinemedi."
          );
        }

        const info =
          await message.channel.send(
            `🗑️ **${Math.max(
              0,
              deleted.size - 1
            )}** mesaj silindi.`
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
         EMBED
         ===================================================== */

      if (command === "embed") {
        if (
          !isAdmin(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
          );
        }

        const raw =
          message.content
            .slice(
              PREFIX.length +
              command.length
            )
            .trim();

        const parts =
          raw.split("|");

        const title =
          parts
            .shift()
            ?.trim();

        const description =
          parts
            .join("|")
            .trim();

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
            new EmbedBuilder()
              .setTitle(
                title
              )
              .setDescription(
                description
              )
              .setTimestamp()
          ]
        });
      }

      /* =====================================================
         KICK
         ===================================================== */

      if (command === "kick") {
        if (
          !isModerator(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
          );
        }

        const target =
          getMentionedMember(
            message,
            args.join(" ")
          );

        if (!target) {
          return message.reply(
            "❌ Kullanım: `.kick @Oyuncu`"
          );
        }

        if (
          !target.kickable
        ) {
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
        if (
          !isModerator(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
          );
        }

        const target =
          getMentionedMember(
            message,
            args.join(" ")
          );

        if (!target) {
          return message.reply(
            "❌ Kullanım: `.ban @Oyuncu`"
          );
        }

        if (
          !target.bannable
        ) {
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
        if (
          !isModerator(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
          );
        }

        const target =
          getMentionedMember(
            message,
            args.join(" ")
          );

        if (!target) {
          return message.reply(
            "❌ Kullanım: `.mute @Oyuncu`"
          );
        }

        await target.timeout(
          10 * 60 * 1000,
          `Axera League - ${message.author.tag}`
        ).catch(() => {});

        return message.reply(
          `🔇 ${target} 10 dakika susturuldu.`
        );
      }

      /* =====================================================
         UNMUTE
         ===================================================== */

      if (
        command ===
        "unmute"
      ) {
        if (
          !isModerator(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
          );
        }

        const target =
          getMentionedMember(
            message,
            args.join(" ")
          );

        if (!target) {
          return message.reply(
            "❌ Kullanım: `.unmute @Oyuncu`"
          );
        }

        await target.timeout(
          null,
          `Axera League - ${message.author.tag}`
        ).catch(() => {});

        return message.reply(
          `🔊 ${target} susturması kaldırıldı.`
        );
      }

      /* =====================================================
         DM
         ===================================================== */

      if (command === "dm") {
        if (
          !isAdmin(
            message.member
          )
        ) {
          return message.reply(
            "❌ Yetkin yok."
          );
        }

        const raw =
          message.content
            .slice(
              PREFIX.length +
              command.length
            )
            .trim();

        const target =
          getMentionedMember(
            message,
            raw
          );

        if (!target) {
          return message.reply(
            "❌ Kullanım: `.dm @Oyuncu mesaj`"
          );
        }

        const text =
          removeMention(raw);

        if (!text) {
          return message.reply(
            "❌ Mesaj yazmalısın."
          );
        }

        try {
          await target.send({
            embeds: [
              new EmbedBuilder()
                .setTitle(
                  "📩 Axera League"
                )
                .setDescription(
                  text
                )
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
        if (
          !isMatchStaff(
            message.member
          )
        ) {
          return message.reply(
            "❌ Maç yetkin yok."
          );
        }

        if (
          message.channel.id !==
          CONFIG.channels.match
        ) {
          return message.reply(
            `❌ Yalnızca <#${CONFIG.channels.match}> kanalında kullanılabilir.`
          );
        }

        const role1 =
          findTeamRole(
            message.guild,
            args[0]
          );

        const role2 =
          findTeamRole(
            message.guild,
            args[1]
          );

        if (
          !role1 ||
          !role2
        ) {
          return message.reply(
            "❌ İki takım belirtmelisin."
          );
        }

        if (
          role1.id ===
          role2.id
        ) {
          return message.reply(
            "❌ Aynı takım kendisiyle oynayamaz."
          );
        }

        const team1 =
          getTeam(role1);

        const team2 =
          getTeam(role2);

        if (
          !team1 ||
          !team2
        ) {
          return message.reply(
            "❌ İki takım da kayıtlı olmalı."
          );
        }

        const alreadyPlaying =
          Object.values(
            data.activeMatches
          ).some(
            match =>
              match.team1Id ===
                team1.id ||
              match.team2Id ===
                team1.id ||
              match.team1Id ===
                team2.id ||
              match.team2Id ===
                team2.id
          );

        if (
          alreadyPlaying
        ) {
          return message.reply(
            "❌ Takımlardan biri zaten maçta."
          );
        }

        await startLiveMatch(
          message.channel,
          team1,
          team2
        );

        return;
      }
    } catch (error) {
      console.error(
        "messageCreate hatası:",
        error
      );

      try {
        await message.reply(
          "❌ İşlem sırasında bir hata oluştu."
        );
      } catch {}
    }
  }
);

/* =========================================================
   INTERACTION
   ========================================================= */

client.on(
  "interactionCreate",
  async interaction => {
    try {
      /* =====================================================
         KAYIT BUTONLARI
         ===================================================== */

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "register_"
        )
      ) {
        if (
          !isAdmin(
            interaction.member
          )
        ) {
          return interaction.reply({
            content:
              "❌ Yetkin yok.",
            ephemeral: true
          });
        }

        const parts =
          interaction.customId
            .split("_");

        const type =
          parts[1];

        const targetId =
          parts
            .slice(2)
            .join("_");

        const panel =
          data.registrationPanels[
            targetId
          ];

        if (!panel) {
          return interaction.reply({
            content:
              "❌ Kayıt paneli bulunamadı.",
            ephemeral: true
          });
        }

        const target =
          interaction.guild.members.cache.get(
            targetId
          );

        if (!target) {
          return interaction.reply({
            content:
              "❌ Oyuncu bulunamadı.",
            ephemeral: true
          });
        }

        const mapped =
          type === "td"
            ? "technicalDirector"
            : type;

        const success =
          await registerMember(
            target,
            mapped,
            panel.nickname
          );

        if (!success) {
          return interaction.reply({
            content:
              "❌ Kayıt yapılamadı.",
            ephemeral: true
          });
        }

        delete data
          .registrationPanels[
            targetId
          ];

        saveData();

        const names = {
          player:
            "⚽ Futbolcu",
          goalkeeper:
            "🧤 Kaleci",
          td:
            "🧑‍💼 Teknik Direktör",
          member:
            "👤 Üye"
        };

        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle(
                "✅ Kayıt Tamamlandı"
              )
              .setDescription(
                `${target} başarıyla kaydedildi.\n\n` +
                `🏷️ Tür: **${names[type]}**`
              )
          ],
          components: []
        });
      }

      /* =====================================================
         FORMASYON
         ===================================================== */

      if (
        interaction.isStringSelectMenu() &&
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

        const teamId =
          interaction.customId.replace(
            "formation_",
            ""
          );

        const formation =
          interaction.values[0];

        if (
          !data.teams[
            teamId
          ]
        ) {
          return interaction.reply({
            content:
              "❌ Takım bulunamadı.",
            ephemeral: true
          });
        }

        data.formations[
          teamId
        ] = formation;

        data.teams[
          teamId
        ].formation =
          formation;

        saveData();

        return interaction.update({
          content:
            `✅ **${data.teams[teamId].name}** formasyonu **${formation}** oldu.`,
          components: []
        });
      }

      /* =====================================================
         TICKET
         ===================================================== */

      if (
        interaction.isButton() &&
        interaction.customId ===
          "create_ticket"
      ) {
        const guild =
          interaction.guild;

        const existing =
          Object.entries(
            data.tickets
          ).find(
            ([channelId, ticket]) =>
              ticket.userId ===
                interaction.user.id &&
              guild.channels.cache.has(
                channelId
              )
          );

        if (existing) {
          return interaction.reply({
            content:
              `❌ Zaten açık ticketın var: <#${existing[0]}>`,
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
                .slice(0, 80),

            type: 0,

            permissionOverwrites: [
              {
                id:
                  guild.id,
                deny: [
                  PermissionsBitField.Flags.ViewChannel
                ]
              },
              {
                id:
                  interaction.user.id,
                allow: [
                  PermissionsBitField.Flags.ViewChannel,
                  PermissionsBitField.Flags.SendMessages,
                  PermissionsBitField.Flags.ReadMessageHistory
                ]
              },
              ...[
                CONFIG.roles.admin,
                CONFIG.roles.moderator
              ].map(
                roleId => ({
                  id: roleId,
                  allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory
                  ]
                })
              )
            ]
          });

        data.tickets[
          channel.id
        ] = {
          userId:
            interaction.user.id,
          createdAt:
            Date.now(),
          lastMessageAt:
            Date.now()
        };

        saveData();

        await channel.send({
          content:
            `${interaction.user}`,
          embeds: [
            new EmbedBuilder()
              .setTitle(
                "🎫 Destek Talebi"
              )
              .setDescription(
                "Destek talebiniz oluşturuldu.\n\n" +
                "Yetkililer sizinle ilgilenecektir.\n\n" +
                "⚠️ 60 dakika boyunca mesaj gönderilmezse ticket kapanabilir."
              )
          ]
        });

        return interaction.reply({
          content:
            `✅ Ticket oluşturuldu: ${channel}`,
          ephemeral: true
        });
      }
    } catch (error) {
      console.error(
        "interactionCreate hatası:",
        error
      );

      if (
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

/* =========================================================
   SUNUCUYA GİRİŞ
   ========================================================= */

client.on(
  "guildMemberAdd",
  async member => {
    try {
      if (
        member.user.bot
      ) {
        return;
      }

      await member.roles
        .add(
          CONFIG.roles.unregistered
        )
        .catch(() => {});

      ensureUser(
        member.id
      );

      saveData();

      const channel =
        member.guild.channels.cache.get(
          CONFIG.channels.registration
        );

      if (!channel) {
        return;
      }

      await channel.send({
        content:
          `${member} sunucuya hoş geldin! <@&${CONFIG.roles.admin}>`,
        embeds: [
          new EmbedBuilder()
            .setTitle(
              "👋 Axera League'e Hoş Geldin"
            )
            .setDescription(
              `${member}, hoş geldin!\n\n` +
              "Kayıt işlemin için kayıt yetkililerini bekleyebilirsin."
            )
        ]
      });
    } catch (error) {
      console.error(
        "guildMemberAdd:",
        error
      );
    }
  }
);

/* =========================================================
   TICKET OTOMATİK KAPATMA
   ========================================================= */

setInterval(
  async () => {
    const now =
      Date.now();

    for (
      const [
        channelId,
        ticket
      ] of Object.entries(
        data.tickets
      )
    ) {
      const lastActivity =
        Number(
          ticket.lastMessageAt ||
          ticket.createdAt
        );

      if (
        now - lastActivity <
        CONFIG.ticketTimeout
      ) {
        continue;
      }

      const channel =
        client.channels.cache.get(
          channelId
        );

      if (channel) {
        await channel.delete(
          "60 dakika boyunca mesaj gönderilmedi."
        ).catch(() => {});
      }

      delete data.tickets[
        channelId
      ];

      saveData();
    }
  },
  60 * 1000
);

/* =========================================================
   ROL PANELİ
   ========================================================= */

client.on(
  "messageCreate",
  async message => {
    try {
      if (
        message.author.bot ||
        !message.guild
      ) {
        return;
      }

      if (
        !message.content
          .toLowerCase()
          .startsWith(
            ".rolpanel"
          )
      ) {
        return;
      }

      if (
        !isAdmin(
          message.member
        )
      ) {
        return;
      }

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(
              "🏷️ Axera League | Roller"
            )
            .setDescription(
              `🛡️ Yönetici: <@&${CONFIG.roles.admin}>\n` +
              `💰 Değer Yetkilisi: <@&${CONFIG.roles.value}>\n` +
              `⚽ Futbolcu: <@&${CONFIG.roles.player}>\n` +
              `🧤 Kaleci: <@&${CONFIG.roles.goalkeeper}>\n` +
              `🧑‍💼 Teknik Direktör: <@&${CONFIG.roles.technicalDirector}>\n` +
              `👤 Üye: <@&${CONFIG.roles.member}>\n` +
              `🛡️ Moderatör: <@&${CONFIG.roles.moderator}>\n` +
              `🏟️ Maç Yetkilisi: <@&${CONFIG.roles.match}>`
            )
        ]
      });
    } catch {}
  }
);

/* =========================================================
   HATALAR
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
   READY
   ========================================================= */

client.once(
  "ready",
  () => {
    console.log(
      "======================================"
    );

    console.log(
      "       AXERA LEAGUE BOT ONLINE"
    );

    console.log(
      "======================================"
    );

    console.log(
      `Bot: ${client.user.tag}`
    );

    console.log(
      `Sunucu: ${client.guilds.cache.size}`
    );

    console.log(
      `Tweet Kanalı: ${CONFIG.channels.tweet}`
    );

    console.log(
      "======================================"
    );

    client.user.setPresence({
      activities: [
        {
          name:
            "Axera League ⚽",
          type: 3
        }
      ],
      status:
        "online"
    });
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
);
