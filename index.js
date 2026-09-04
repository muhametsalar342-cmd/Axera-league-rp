const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  PermissionFlagsBits
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// =====================================================
// AYARLAR
// =====================================================

const TOKEN = process.env.TOKEN;
const PREFIX = ".";

const ROLES = {
  FUTBOLCU: "1534457228986421278",
  KALECI: "1534492034243498195",
  KAYITSIZ: "1534457560134844517",
  TEKNIK_DIREKTOR: "1534456648930693120",
  KAYIT_YETKILISI: "1534456315366342716",
  DEGER_YETKILISI: "1534456192913375382",
  MAC_YETKILISI: "1535251168169697390"
};

const CHANNELS = {
  KAYIT: "1534460177884123276",
  SOHBET: "1534469475917758586",
  ANTRENMAN: "1534474070798762197",
  PENALTI: "1534474327812997192",
  MAC: "1534477626872168541",
  PUAN: "1534475991404253284"
};

const TIME_ZONE = process.env.TIME_ZONE || "Europe/Istanbul";

const DATA_FILE = path.join(__dirname, "data.json");

// =====================================================
// VERİTABANI
// =====================================================

const defaultData = {
  users: {},
  teams: {},
  standings: {},
  fixtures: [],
  activeMatches: {},
  registrations: {},
  standingsMessageId: null
};

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
      return JSON.parse(JSON.stringify(defaultData));
    }

    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const data = JSON.parse(raw);

    return {
      ...defaultData,
      ...data,
      users: data.users || {},
      teams: data.teams || {},
      standings: data.standings || {},
      fixtures: data.fixtures || [],
      activeMatches: data.activeMatches || {},
      registrations: data.registrations || {}
    };
  } catch (err) {
    console.error("data.json okunamadı:", err);
    return JSON.parse(JSON.stringify(defaultData));
  }
}

let data = loadData();

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("data.json kaydedilemedi:", err);
  }
}

// =====================================================
// CLIENT
// =====================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.GuildMember, Partials.User]
});

// =====================================================
// GENEL FONKSİYONLAR
// =====================================================

function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

function hasRole(member, roleId) {
  return member.roles.cache.has(roleId);
}

function isValueOfficial(member) {
  return hasRole(member, ROLES.DEGER_YETKILISI);
}

function isRegistrationOfficial(member) {
  return hasRole(member, ROLES.KAYIT_YETKILISI);
}

function isMatchOfficial(member) {
  return hasRole(member, ROLES.MAC_YETKILISI);
}

function channelOnly(message, channelId) {
  if (message.channel.id !== channelId) {
    message.reply(`❌ Bu komut <#${channelId}> kanalında kullanılabilir.`);
    return false;
  }
  return true;
}

function getUserData(userId) {
  if (!data.users[userId]) {
    data.users[userId] = {
      value: 0,
      budget: 0,
      training: 0
    };
  }

  if (typeof data.users[userId].value !== "number") {
    data.users[userId].value = 0;
  }

  if (typeof data.users[userId].budget !== "number") {
    data.users[userId].budget = 0;
  }

  if (typeof data.users[userId].training !== "number") {
    data.users[userId].training = 0;
  }

  return data.users[userId];
}

function formatMoney(amount) {
  amount = Math.max(0, Math.floor(Number(amount) || 0));
  return `${amount.toLocaleString("tr-TR")}M€`;
}

function parseMoney(input) {
  if (!input) return null;

  let str = String(input)
    .trim()
    .toLowerCase()
    .replace(/€/g, "")
    .replace(/\s/g, "")
    .replace(",", ".");

  let multiplier = 1;

  if (str.endsWith("m")) {
    str = str.slice(0, -1);
    multiplier = 1;
  } else if (str.endsWith("b")) {
    str = str.slice(0, -1);
    multiplier = 1000;
  }

  const number = Number(str);

  if (!Number.isFinite(number) || number < 0) {
    return null;
  }

  return Math.floor(number * multiplier);
}

function extractMentionId(text) {
  const match = text.match(/<@!?(\d+)>/);
  return match ? match[1] : null;
}

function getMentionedMember(message, index = 0) {
  return message.mentions.members.at(index) || null;
}

function getMentionedRole(message, index = 0) {
  return message.mentions.roles.at(index) || null;
}

function cleanPlayerName(nickname) {
  if (!nickname) return "Oyuncu";

  let name = nickname.split("|")[0].trim();

  if (name.length > 16) {
    name = name.slice(0, 15) + "…";
  }

  return name;
}

function getNicknameValue(nickname) {
  if (!nickname) return null;

  const match = nickname.match(/(\d+(?:[.,]\d+)?)\s*M€$/i);

  if (!match) return null;

  return Math.floor(
    Number(match[1].replace(",", "."))
  );
}

async function setPlayerValue(member, amount) {
  if (!member || !member.manageable) {
    return {
      success: false,
      error: "Bot bu oyuncunun takma adını değiştiremiyor."
    };
  }

  const nickname = member.nickname || member.user.username;
  const match = nickname.match(/(\d+(?:[.,]\d+)?)\s*M€$/i);

  if (!match) {
    return {
      success: false,
      error: "Oyuncunun takma adı `M€` ile bitmiyor."
    };
  }

  const newNickname =
    nickname.slice(0, match.index) +
    formatMoney(amount);

  if (newNickname.length > 32) {
    return {
      success: false,
      error: "Yeni takma ad 32 karakteri geçiyor."
    };
  }

  try {
    await member.setNickname(newNickname);
    return { success: true };
  } catch (err) {
    console.error(err);
    return {
      success: false,
      error: "Takma ad değiştirilemedi."
    };
  }
}

// =====================================================
// POZİSYONLAR
// =====================================================

const POSITIONS = [
  "KL",
  "STP",
  "SĞB",
  "SLB",
  "MO",
  "MOO",
  "SĞK",
  "SLK",
  "SNT"
];

const FORMATIONS = {
  "4-4-2": [
    ["SNT", "SNT"],
    ["SĞK", "MO", "MO", "SLK"],
    ["SLB", "STP", "STP", "SĞB"],
    ["KL"]
  ],

  "4-3-3": [
    ["SĞK", "SNT", "SLK"],
    ["MO", "MO", "MO"],
    ["SLB", "STP", "STP", "SĞB"],
    ["KL"]
  ],

  "4-2-3-1": [
    ["SNT"],
    ["SLK", "MOO", "SĞK"],
    ["MO", "MO"],
    ["SLB", "STP", "STP", "SĞB"],
    ["KL"]
  ],

  "3-5-2": [
    ["SNT", "SNT"],
    ["SLK", "MO", "MOO", "MO", "SĞK"],
    ["STP", "STP", "STP"],
    ["KL"]
  ],

  "3-4-3": [
    ["SNT", "SNT", "SNT"],
    ["SLK", "MO", "MO", "SĞK"],
    ["STP", "STP", "STP"],
    ["KL"]
  ],

  "4-3-1-2": [
    ["SNT", "SNT"],
    ["MOO"],
    ["MO", "MO", "MO"],
    ["SLB", "STP", "STP", "SĞB"],
    ["KL"]
  ],

  "4-2-2-2": [
    ["SNT", "SNT"],
    ["SLK", "MOO", "MOO", "SĞK"],
    ["MO", "MO"],
    ["SLB", "STP", "STP", "SĞB"],
    ["KL"]
  ],

  "5-3-2": [
    ["SNT", "SNT"],
    ["MO", "MO", "MO"],
    ["SLB", "STP", "STP", "STP", "SĞB"],
    ["KL"]
  ]
};

// =====================================================
// TAKIM FONKSİYONLARI
// =====================================================

function ensureTeam(roleId, name = "Takım") {
  if (!data.teams[roleId]) {
    data.teams[roleId] = {
      id: roleId,
      name,
      baseValue: 0,
      formation: "4-4-2",
      squad: []
    };
  }

  if (!Array.isArray(data.teams[roleId].squad)) {
    data.teams[roleId].squad = [];
  }

  if (!data.teams[roleId].formation) {
    data.teams[roleId].formation = "4-4-2";
  }

  return data.teams[roleId];
}

function getTeam(roleId) {
  return data.teams[roleId] || null;
}

function getPlayerValueFromData(userId, member = null) {
  const user = getUserData(userId);

  if (typeof user.value === "number") {
    return user.value;
  }

  return member ? getNicknameValue(member.nickname) || 0 : 0;
}

function calculateTeamValue(team, guild) {
  let total = Number(team.baseValue) || 0;

  for (const player of team.squad || []) {
    const member = guild.members.cache.get(player.userId);
    const value = getPlayerValueFromData(player.userId, member);

    player.value = value;
    total += value;
  }

  return total;
}

function syncPlayerValueEverywhere(userId, amount) {
  const user = getUserData(userId);
  user.value = Math.max(0, amount);

  for (const team of Object.values(data.teams)) {
    for (const player of team.squad || []) {
      if (player.userId === userId) {
        player.value = user.value;
      }
    }
  }
}

function findSquadPlayer(team, userId) {
  return (team.squad || []).find(p => p.userId === userId);
}

function getPositionPlayers(team, position) {
  return (team.squad || []).filter(
    player => player.position === position
  );
}

// =====================================================
// GÖRSEL KADRO
// =====================================================

function playerSlot(player, guild, position) {
  if (!player) {
    return `⬜ ${position}`;
  }

  const member = guild.members.cache.get(player.userId);

  const name = cleanPlayerName(
    member?.nickname || player.nickname || "Oyuncu"
  );

  const value = getPlayerValueFromData(
    player.userId,
    member
  );

  const icon = position === "KL" ? "🧤" : "⚽";

  return `${icon}${name} ${formatMoney(value)}`;
}

function buildVisualLineup(team, guild) {
  const formation = team.formation || "4-4-2";
  const rows = FORMATIONS[formation] || FORMATIONS["4-4-2"];

  const used = {};

  const getNextPlayer = position => {
    if (!used[position]) used[position] = 0;

    const players = getPositionPlayers(team, position);
    const index = used[position];

    used[position]++;

    return players[index] || null;
  };

  const output = [];

  output.push(`🏟️ ${team.name}`);
  output.push(`📋 Formasyon: ${formation}`);
  output.push("");

  for (const row of rows) {
    const slots = row.map(position => {
      const player = getNextPlayer(position);
      return playerSlot(player, guild, position);
    });

    let line = slots.join("    ");

    if (line.length < 70) {
      const padding = Math.floor((70 - line.length) / 2);
      line = " ".repeat(Math.max(0, padding)) + line;
    }

    output.push(line);
    output.push("");
  }

  return output.join("\n");
}

// =====================================================
// İLK 11 KONTROLÜ
// =====================================================

function checkStartingEleven(team) {
  const formation = team.formation || "4-4-2";
  const rows = FORMATIONS[formation];

  if (!rows) {
    return {
      valid: false,
      reason: "Geçersiz formasyon."
    };
  }

  const required = {};

  for (const row of rows) {
    for (const position of row) {
      required[position] = (required[position] || 0) + 1;
    }
  }

  for (const [position, amount] of Object.entries(required)) {
    const count = getPositionPlayers(team, position).length;

    if (count < amount) {
      return {
        valid: false,
        reason: `${position} pozisyonunda ${amount} oyuncu gerekli, ${count} oyuncu var.`
      };
    }
  }

  if (getPositionPlayers(team, "KL").length < 1) {
    return {
      valid: false,
      reason: "Takımda KL bulunmuyor."
    };
  }

  return { valid: true };
}

// =====================================================
// PUAN DURUMU
// =====================================================

function ensureStanding(teamId, teamName) {
  if (!data.standings[teamId]) {
    data.standings[teamId] = {
      id: teamId,
      name: teamName,
      O: 0,
      G: 0,
      B: 0,
      M: 0,
      AG: 0,
      YG: 0,
      AV: 0,
      P: 0
    };
  }

  return data.standings[teamId];
}

function sortStandings() {
  return Object.values(data.standings).sort((a, b) => {
    if (b.P !== a.P) return b.P - a.P;
    if (b.AV !== a.AV) return b.AV - a.AV;
    return b.AG - a.AG;
  });
}

function standingsEmbed() {
  const sorted = sortStandings();

  const embed = new EmbedBuilder()
    .setTitle("🏆 AXERA LEAGUE — PUAN DURUMU")
    .setDescription(
      sorted.length
        ? "```" +
          " #  TAKIM                 O  G  B  M  AV  P\n" +
          sorted.map((team, i) => {
            const name = team.name
              .slice(0, 18)
              .padEnd(18, " ");

            return (
              `${String(i + 1).padStart(2, " ")}  ` +
              `${name} ` +
              `${String(team.O).padStart(2, " ")} ` +
              `${String(team.G).padStart(2, " ")} ` +
              `${String(team.B).padStart(2, " ")} ` +
              `${String(team.M).padStart(2, " ")} ` +
              `${String(team.AV).padStart(3, " ")} ` +
              `${String(team.P).padStart(2, " ")}`
            );
          }).join("\n") +
          "```"
        : "Henüz kayıtlı takım bulunmuyor."
    )
    .setFooter({ text: "Axera League • Puan Sistemi" })
    .setTimestamp();

  return embed;
}

async function updateStandingsMessage(guild) {
  const channel = guild.channels.cache.get(CHANNELS.PUAN);

  if (!channel) return;

  try {
    if (data.standingsMessageId) {
      const oldMessage = await channel.messages
        .fetch(data.standingsMessageId)
        .catch(() => null);

      if (oldMessage) {
        await oldMessage.edit({
          embeds: [standingsEmbed()]
        });
        return;
      }
    }

    const message = await channel.send({
      embeds: [standingsEmbed()]
    });

    data.standingsMessageId = message.id;
    saveData();
  } catch (err) {
    console.error("Puan mesajı güncellenemedi:", err);
  }
}

// =====================================================
// MAÇ SONRASI PUAN GÜNCELLEME
// =====================================================

function applyMatchResult(team1Id, team2Id, score1, score2) {
  const team1 = data.standings[team1Id];
  const team2 = data.standings[team2Id];

  if (!team1 || !team2) return;

  team1.O++;
  team2.O++;

  team1.AG += score1;
  team1.YG += score2;

  team2.AG += score2;
  team2.YG += score1;

  team1.AV = team1.AG - team1.YG;
  team2.AV = team2.AG - team2.YG;

  if (score1 > score2) {
    team1.G++;
    team1.P += 3;
    team2.M++;
  } else if (score2 > score1) {
    team2.G++;
    team2.P += 3;
    team1.M++;
  } else {
    team1.B++;
    team2.B++;
    team1.P++;
    team2.P++;
  }
}

// =====================================================
// MAÇ SİSTEMİ
// =====================================================

function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function getScoringPlayers(team, guild) {
  const candidates = (team.squad || []).filter(
    p => p.position !== "KL"
  );

  return candidates
    .map(p => {
      const member = guild.members.cache.get(p.userId);

      return {
        ...p,
        name: cleanPlayerName(
          member?.nickname || p.nickname || "Oyuncu"
        )
      };
    });
}

function getMatchTeamPower(team, guild) {
  const value = calculateTeamValue(team, guild);

  const players = team.squad || [];

  return Math.max(
    1,
    value + players.length * 10
  );
}

function goalProbability(team1, team2, guild) {
  const power1 = getMatchTeamPower(team1, guild);
  const power2 = getMatchTeamPower(team2, guild);

  const total = power1 + power2;

  return {
    team1: power1 / total,
    team2: power2 / total
  };
}

function createMatchEmbed(match) {
  const team1 = match.team1Name;
  const team2 = match.team2Name;

  const score =
    `${match.score1} - ${match.score2}`;

  const events = match.events.length
    ? match.events.slice(-6).join("\n")
    : "Maç başladı...";

  return new EmbedBuilder()
    .setTitle("⚽ AXERA LEAGUE — CANLI MAÇ")
    .setDescription(
      `**${team1}**  **${score}**  **${team2}**`
    )
    .addFields(
      {
        name: "⏱️ Dakika",
        value: `${match.minute}'`,
        inline: true
      },
      {
        name: "🔥 Son Olaylar",
        value: events,
        inline: false
      }
    )
    .setFooter({
      text: "3 gerçek saniye = 1 maç dakikası"
    })
    .setTimestamp();

  return embed;
}

async function startMatch(
  guild,
  team1Id,
  team2Id,
  fixture = null
) {
  if (data.activeMatches[team1Id] || data.activeMatches[team2Id]) {
    return false;
  }

  const team1 = getTeam(team1Id);
  const team2 = getTeam(team2Id);

  if (!team1 || !team2) {
    return false;
  }

  const check1 = checkStartingEleven(team1);
  const check2 = checkStartingEleven(team2);

  const channel = guild.channels.cache.get(CHANNELS.MAC);

  if (!channel) return false;

  if (!check1.valid || !check2.valid) {
    if (!check1.valid && !check2.valid) {
      await channel.send(
        `⚠️ **${team1.name}** ve **${team2.name}** ilk 11'i tamamlayamadığı için maç **0-0** sonuçlandı.`
      );

      ensureStanding(team1Id, team1.name);
      ensureStanding(team2Id, team2.name);

      applyMatchResult(
        team1Id,
        team2Id,
        0,
        0
      );

      saveData();
      await updateStandingsMessage(guild);

      return true;
    }

    const winner = check1.valid ? team1 : team2;
    const loser = check1.valid ? team2 : team1;

    ensureStanding(team1Id, team1.name);
    ensureStanding(team2Id, team2.name);

    const score1 = check1.valid ? 3 : 0;
    const score2 = check2.valid ? 3 : 0;

    applyMatchResult(
      team1Id,
      team2Id,
      score1,
      score2
    );

    await channel.send(
      `🏆 **HÜKMEN SONUÇ**\n\n` +
      `**${winner.name}** 3 - 0 **${loser.name}**\n\n` +
      `❌ ${loser.name}: ${!check1.valid && loser.id === team1Id ? check1.reason : check2.reason}`
    );

    saveData();
    await updateStandingsMessage(guild);

    return true;
  }

  const match = {
    id: `${team1Id}_${team2Id}_${Date.now()}`,
    team1Id,
    team2Id,
    team1Name: team1.name,
    team2Name: team2.name,
    score1: 0,
    score2: 0,
    minute: 0,
    events: [],
    finished: false,
    fixtureId: fixture?.id || null,
    messageId: null
  };

  data.activeMatches[team1Id] = match.id;
  data.activeMatches[team2Id] = match.id;

  const message = await channel.send({
    embeds: [createMatchEmbed(match)]
  });

  match.messageId = message.id;

  data.activeMatches[team1Id] = match;
  data.activeMatches[team2Id] = match;

  saveData();

  const probability = goalProbability(
    team1,
    team2,
    guild
  );

  const interval = setInterval(async () => {
    if (match.finished) {
      clearInterval(interval);
      return;
    }

    match.minute++;

    // Her gerçek 3 saniyede bir oyun dakikası.
    // Yaklaşık 2-3 gol/match hedeflenir.
    const baseGoalChance = 0.025;

    const roll = Math.random();

    let goalTeam = null;

    if (roll < baseGoalChance * probability.team1 * 2) {
      goalTeam = 1;
    } else if (
      roll <
      baseGoalChance * probability.team1 * 2 +
      baseGoalChance * probability.team2 * 2
    ) {
      goalTeam = 2;
    }

    if (goalTeam) {
      if (goalTeam === 1) {
        const scorers = getScoringPlayers(team1, guild);

        if (scorers.length) {
          const scorer = randomChoice(scorers);

          match.score1++;

          match.events.push(
            `⚽ ${match.minute}' — **${scorer.name}** (${team1.name}) gol!`
          );
        }
      } else {
        const scorers = getScoringPlayers(team2, guild);

        if (scorers.length) {
          const scorer = randomChoice(scorers);

          match.score2++;

          match.events.push(
            `⚽ ${match.minute}' — **${scorer.name}** (${team2.name}) gol!`
          );
        }
      }
    } else if (Math.random() < 0.10) {
      const attackingTeam =
        Math.random() < 0.5 ? team1 : team2;

      const players = getScoringPlayers(
        attackingTeam,
        guild
      );

      if (players.length) {
        const player = randomChoice(players);

        match.events.push(
          `🎯 ${match.minute}' — ${player.name} tehlikeli bir şut çekti.`
        );
      }
    }

    if (match.events.length > 20) {
      match.events.shift();
    }

    try {
      await message.edit({
        embeds: [createMatchEmbed(match)]
      });
    } catch (err) {
      console.error("Maç mesajı güncellenemedi:", err);
    }

    if (match.minute >= 90) {
      clearInterval(interval);

      match.finished = true;

      ensureStanding(team1Id, team1.name);
      ensureStanding(team2Id, team2.name);

      applyMatchResult(
        team1Id,
        team2Id,
        match.score1,
        match.score2
      );

      delete data.activeMatches[team1Id];
      delete data.activeMatches[team2Id];

      if (fixture) {
        const storedFixture =
          data.fixtures.find(f => f.id === fixture.id);

        if (storedFixture) {
          storedFixture.status = "TAMAMLANDI";
          storedFixture.score1 = match.score1;
          storedFixture.score2 = match.score2;
          storedFixture.finishedAt = Date.now();
        }
      }

      saveData();

      const winner =
        match.score1 > match.score2
          ? team1.name
          : match.score2 > match.score1
          ? team2.name
          : "Beraberlik";

      const finalEmbed = new EmbedBuilder()
        .setTitle("🏁 AXERA LEAGUE — MAÇ SONUCU")
        .setDescription(
          `**${team1.name}**  **${match.score1} - ${match.score2}**  **${team2.name}**`
        )
        .addFields(
          {
            name: "🏆 Sonuç",
            value: winner,
            inline: false
          },
          {
            name: "⚽ Gol Olayları",
            value:
              match.events
                .filter(e => e.includes("⚽"))
                .join("\n") ||
              "Gol olmadı.",
            inline: false
          },
          {
            name: "💰 Takım Değerleri",
            value:
              `${team1.name}: ${formatMoney(calculateTeamValue(team1, guild))}\n` +
              `${team2.name}: ${formatMoney(calculateTeamValue(team2, guild))}`,
            inline: false
          }
        )
        .setFooter({
          text: "Axera League • Maç Sistemi"
        })
        .setTimestamp();

      try {
        await message.edit({
          embeds: [finalEmbed]
        });
      } catch {}

      await updateStandingsMessage(guild);
      saveData();
    }

    saveData();
  }, 3000);

  return true;
}

// =====================================================
// FİKSTÜR TARİH SAAT
// =====================================================

function getLocalDateParts() {
  const formatter = new Intl.DateTimeFormat(
    "tr-TR",
    {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }
  );

  const parts = formatter.formatToParts(new Date());

  const result = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      result[part.type] = part.value;
    }
  }

  return result;
}

function currentDateTimeKey() {
  const p = getLocalDateParts();

  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

function fixtureDateKey(fixture) {
  return `${fixture.date} ${fixture.time}`;
}

function parseFixtureDateTime(args) {
  const text = args.join(" ");

  const match = text.match(
    /(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})/
  );

  if (!match) return null;

  let hour = Number(match[2]);

  if (
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23
  ) {
    return null;
  }

  return {
    date: match[1],
    time:
      String(hour).padStart(2, "0") +
      ":" +
      match[3]
  };
}

// =====================================================
// FİKSTÜR SCHEDULER
// =====================================================

async function checkFixtures() {
  const guilds = client.guilds.cache;

  const nowKey = currentDateTimeKey();

  for (const guild of guilds.values()) {
    for (const fixture of data.fixtures) {
      if (fixture.status !== "BEKLIYOR") {
        continue;
      }

      if (fixtureDateKey(fixture) <= nowKey) {
        const team1 = getTeam(fixture.team1);
        const team2 = getTeam(fixture.team2);

        if (!team1 || !team2) {
          fixture.status = "HATA";
          continue;
        }

        if (
          data.activeMatches[fixture.team1] ||
          data.activeMatches[fixture.team2]
        ) {
          continue;
        }

        fixture.status = "BAŞLIYOR";
        fixture.startedAt = Date.now();

        saveData();

        await startMatch(
          guild,
          fixture.team1,
          fixture.team2,
          fixture
        );
      }
    }
  }

  saveData();
}

// =====================================================
// READY
// =====================================================

client.once("ready", async () => {
  console.log(`✅ ${client.user.tag} aktif!`);
  console.log(`🌍 Saat dilimi: ${TIME_ZONE}`);

  for (const guild of client.guilds.cache.values()) {
    await updateStandingsMessage(guild);
  }

  setInterval(checkFixtures, 1000);
});

// =====================================================
// YENİ ÜYE
// =====================================================

client.on("guildMemberAdd", async member => {
  const channel =
    member.guild.channels.cache.get(CHANNELS.KAYIT);

  if (!channel) return;

  const registrationRole =
    member.guild.roles.cache.get(
      ROLES.KAYIT_YETKILISI
    );

  await channel.send(
    `👋 ${member} hoşgeldin sunucumuza!\n` +
    `📋 ${registrationRole ? registrationRole : `<@&${ROLES.KAYIT_YETKILISI}>`} seninle ilgilenecektir.`
  );

  getUserData(member.id);
  saveData();
});

// =====================================================
// MESAJ KOMUTLARI
// =====================================================

client.on("messageCreate", async message => {
  if (message.author.bot) return;

  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content
    .slice(PREFIX.length)
    .trim()
    .split(/\s+/);

  const command = args.shift()?.toLowerCase();

  if (!command) return;

  // ===================================================
  // YARDIM
  // ===================================================

  if (
    command === "yardım" ||
    command === "yardim"
  ) {
    const embed = new EmbedBuilder()
      .setTitle("📚 AXERA LEAGUE — KOMUTLAR")
      .setDescription(
        [
          "**👤 Kayıt**",
          "`.k @Oyuncu TakmaAdı`",
          "`.kayıtsızver @Oyuncu`",
          "",
          "**💰 Kişisel Bütçe**",
          "`.bütçe`",
          "`.bütçe @Oyuncu`",
          "`.gönder @Oyuncu 50M`",
          "`.paraekle @Oyuncu 50M`",
          "`.parasil @Oyuncu 50M`",
          "`.paraayarla @Oyuncu 100M`",
          "",
          "**📈 Oyuncu Değeri**",
          "`.dver @Oyuncu 5`",
          "`.dsil @Oyuncu 5`",
          "",
          "**🏋️ Antrenman**",
          "`.ant` / `.antrenman`",
          "",
          "**⚽ Penaltı**",
          "`.pen` / `.penaltı`",
          "",
          "**🔎 Oyuncu Arama**",
          "`.ara W.Sneijder`",
          "",
          "**🏟️ Takım**",
          "`.takımekle @Takım`",
          "`.takımkaldır @Takım`",
          "`.takımdeğer @Takım 850`",
          "",
          "**👥 Kadro**",
          "`.kadroekle @Takım @Oyuncu Pozisyon`",
          "`.kadrocikar @Takım @Oyuncu`",
          "`.kadro @Takım`",
          "`.formasyon @Takım`",
          "",
          "**🏆 Lig**",
          "`.puan`",
          "`.puanekle @Takım 3`",
          "",
          "**⚽ Maç / Fikstür**",
          "`.maç @Takım1 @Takım2`",
          "`.fikstur`",
          "`.fiksturekle @Takım1 @Takım2 2026-09-05 20:30`",
          "`.fiksturcikar @Takım1 @Takım2`",
          "",
          "**🛠️ Yönetim**",
          "`.embed Başlık | Açıklama`",
          "`.sil 50`",
          "`.kick @Oyuncu`",
          "`.ban @Oyuncu`",
          "`.mute @Oyuncu`",
          "`.unmute @Oyuncu`",
          "",
          "**🐦 Tweet**",
          "`.tweet mesaj`"
        ].join("\n")
      )
      .setFooter({
        text: "Axera League"
      });

    return message.reply({
      embeds: [embed]
    });
  }

  // ===================================================
  // KAYIT
  // ===================================================

  if (command === "k") {
    if (!isRegistrationOfficial(message.member)) {
      return message.reply(
        "❌ Bu komutu sadece **Kayıt Yetkilisi** kullanabilir."
      );
    }

    if (!channelOnly(message, CHANNELS.KAYIT)) return;

    const target = getMentionedMember(message);

    if (!target) {
      return message.reply(
        "❌ Kullanım: `.k @Oyuncu TakmaAdı`"
      );
    }

    const nickname = args
      .filter(x => !x.includes(target.id))
      .join(" ")
      .trim();

    if (!nickname) {
      return message.reply(
        "❌ Oyuncu için takma ad yazmalısın."
      );
    }

    if (nickname.length > 32) {
      return message.reply(
        "❌ Takma ad 32 karakterden uzun olamaz."
      );
    }

    try {
      await target.setNickname(nickname);
    } catch {}

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`register_futbolcu_${target.id}`)
        .setLabel("Futbolcu")
        .setEmoji("⚽")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`register_kaleci_${target.id}`)
        .setLabel("Kaleci")
        .setEmoji("🧤")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`register_td_${target.id}`)
        .setLabel("Teknik Direktör")
        .setEmoji("📋")
        .setStyle(ButtonStyle.Secondary)
    );

    const embed = new EmbedBuilder()
      .setTitle("📋 AXERA LEAGUE — KAYIT")
      .setDescription(
        `${target} için kayıt türünü seçin.`
      )
      .addFields({
        name: "👤 Oyuncu",
        value: target.toString()
      });

    return message.channel.send({
      embeds: [embed],
      components: [row]
    });
  }

  // ===================================================
  // KAYITSIZ VER
  // ===================================================

  if (
    command === "kayıtsızver" ||
    command === "kayitsizver"
  ) {
    if (!isRegistrationOfficial(message.member)) {
      return message.reply(
        "❌ Bu komutu sadece **Kayıt Yetkilisi** kullanabilir."
      );
    }

    const target = getMentionedMember(message);

    if (!target) {
      return message.reply(
        "❌ Kullanım: `.kayıtsızver @Oyuncu`"
      );
    }

    for (const roleId of [
      ROLES.FUTBOLCU,
      ROLES.KALECI,
      ROLES.TEKNIK_DIREKTOR
    ]) {
      await target.roles.remove(roleId).catch(() => {});
    }

    await target.roles.add(
      ROLES.KAYITSIZ
    ).catch(() => {});

    data.registrations[target.id] = {
      type: "KAYITSIZ",
      registeredBy: message.author.id,
      registeredAt: Date.now()
    };

    saveData();

    return message.reply(
      `✅ ${target} tekrar **Kayıtsız** yapıldı.`
    );
  }

  // ===================================================
  // BÜTÇE GÖRÜNTÜLE
  // ===================================================

  if (
    command === "bütçe" ||
    command === "butce"
  ) {
    const target =
      getMentionedMember(message) ||
      message.member;

    const user = getUserData(target.id);

    const embed = new EmbedBuilder()
      .setTitle("💰 KİŞİSEL BÜTÇE")
      .setDescription(
        `${target}\n\n💳 **Bakiye:** ${formatMoney(user.budget)}`
      )
      .setFooter({
        text: "Axera League • Kişisel Ekonomi"
      })
      .setTimestamp();

    return message.reply({
      embeds: [embed]
    });
  }

  // ===================================================
  // PARA GÖNDER
  // ===================================================

  if (
    command === "gönder" ||
    command === "gonder"
  ) {
    const target = getMentionedMember(message);

    const amount = parseMoney(args[0]);

    if (!target || amount === null || amount <= 0) {
      return message.reply(
        "❌ Kullanım: `.gönder @Oyuncu 50M`"
      );
    }

    if (target.id === message.author.id) {
      return message.reply(
        "❌ Kendine para gönderemezsin."
      );
    }

    const sender = getUserData(
      message.author.id
    );

    const receiver = getUserData(
      target.id
    );

    if (sender.budget < amount) {
      return message.reply(
        `❌ Yeterli paran yok.\n💰 Bakiyen: **${formatMoney(sender.budget)}**`
      );
    }

    sender.budget -= amount;
    receiver.budget += amount;

    saveData();

    return message.reply(
      `✅ ${target} adlı oyuncuya **${formatMoney(amount)}** gönderildi.\n\n` +
      `💰 Yeni bakiyen: **${formatMoney(sender.budget)}**`
    );
  }

  // ===================================================
  // PARA EKLE
  // ===================================================

  if (
    command === "paraekle" ||
    command === "paraekle"
  ) {
    if (!isValueOfficial(message.member)) {
      return message.reply(
        "❌ Bu komutu sadece **Değer Yetkilisi** kullanabilir."
      );
    }

    const target = getMentionedMember(message);
    const amount = parseMoney(args[0]);

    if (!target || amount === null || amount <= 0) {
      return message.reply(
        "❌ Kullanım: `.paraekle @Oyuncu 50M`"
      );
    }

    const user = getUserData(target.id);

    user.budget += amount;

    saveData();

    return message.reply(
      `✅ ${target} adlı oyuncuya **${formatMoney(amount)}** eklendi.\n` +
      `💰 Yeni bütçe: **${formatMoney(user.budget)}**`
    );
  }

  // ===================================================
  // PARA SİL
  // ===================================================

  if (
    command === "parasil" ||
    command === "parasil"
  ) {
    if (!isValueOfficial(message.member)) {
      return message.reply(
        "❌ Bu komutu sadece **Değer Yetkilisi** kullanabilir."
      );
    }

    const target = getMentionedMember(message);
    const amount = parseMoney(args[0]);

    if (!target || amount === null || amount <= 0) {
      return message.reply(
        "❌ Kullanım: `.parasil @Oyuncu 50M`"
      );
    }

    const user = getUserData(target.id);

    user.budget = Math.max(
      0,
      user.budget - amount
    );

    saveData();

    return message.reply(
      `✅ ${target} adlı oyuncudan **${formatMoney(amount)}** silindi.\n` +
      `💰 Yeni bütçe: **${formatMoney(user.budget)}**`
    );
  }

  // ===================================================
  // PARA AYARLA
  // ===================================================

  if (
    command === "paraayarla" ||
    command === "paraayar"
  ) {
    if (!isValueOfficial(message.member)) {
      return message.reply(
        "❌ Bu komutu sadece **Değer Yetkilisi** kullanabilir."
      );
    }

    const target = getMentionedMember(message);
    const amount = parseMoney(args[0]);

    if (!target || amount === null) {
      return message.reply(
        "❌ Kullanım: `.paraayarla @Oyuncu 100M`"
      );
    }

    const user = getUserData(target.id);

    user.budget = amount;

    saveData();

    return message.reply(
      `✅ ${target} bütçesi **${formatMoney(amount)}** olarak ayarlandı.`
    );
  }

  // ===================================================
  // OYUNCU DEĞERİ VER
  // ===================================================

  if (
    command === "dver"
  ) {
    if (!isValueOfficial(message.member)) {
      return message.reply(
        "❌ Bu komutu sadece **Değer Yetkilisi** kullanabilir."
      );
    }

    const target = getMentionedMember(message);
    const amount = Number(args[0]);

    if (
      !target ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return message.reply(
        "❌ Kullanım: `.dver @Oyuncu 5`"
      );
    }

    const nickname =
      target.nickname ||
      target.user.username;

    const current =
      getNicknameValue(nickname);

    if (current === null) {
      return message.reply(
        "❌ Oyuncunun takma adının sonunda `M€` bulunamadı."
      );
    }

    const newValue =
      current + Math.floor(amount);

    const result =
      await setPlayerValue(
        target,
        newValue
      );

    if (!result.success) {
      return message.reply(
        `❌ ${result.error}`
      );
    }

    syncPlayerValueEverywhere(
      target.id,
      newValue
    );

    saveData();

    return message.reply(
      `✅ ${target} değerine **+${Math.floor(amount)}M€** eklendi.\n` +
      `💎 Yeni değer: **${formatMoney(newValue)}**`
    );
  }

  // ===================================================
  // OYUNCU DEĞERİ SİL
  // ===================================================

  if (
    command === "dsil"
  ) {
    if (!isValueOfficial(message.member)) {
      return message.reply(
        "❌ Bu komutu sadece **Değer Yetkilisi** kullanabilir."
      );
    }

    const target = getMentionedMember(message);
    const amount = Number(args[0]);

    if (
      !target ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return message.reply(
        "❌ Kullanım: `.dsil @Oyuncu 5`"
      );
    }

    const nickname =
      target.nickname ||
      target.user.username;

    const current =
      getNicknameValue(nickname);

    if (current === null) {
      return message.reply(
        "❌ Oyuncunun takma adının sonunda `M€` bulunamadı."
      );
    }

    const newValue = Math.max(
      0,
      current - Math.floor(amount)
    );

    const result =
      await setPlayerValue(
        target,
        newValue
      );

    if (!result.success) {
      return message.reply(
        `❌ ${result.error}`
      );
    }

    syncPlayerValueEverywhere(
      target.id,
      newValue
    );

    saveData();

    return message.reply(
      `✅ ${target} değerinden **-${Math.floor(amount)}M€** silindi.\n` +
      `💎 Yeni değer: **${formatMoney(newValue)}**`
    );
  }

  // ===================================================
  // ANTRENMAN
  // ===================================================

  if (
    command === "ant" ||
    command === "antrenman"
  ) {
    if (
      !channelOnly(
        message,
        CHANNELS.ANTRENMAN
      )
    ) return;

    const user = getUserData(
      message.author.id
    );

    user.training++;

    if (user.training >= 5) {
      const target = message.member;

      const nickname =
        target.nickname ||
        target.user.username;

      const current =
        getNicknameValue(nickname);

      if (current === null) {
        user.training = 4;

        saveData();

        return message.reply(
          "❌ Değer sistemin hazır değil. Takma adının sonunda `M€` bulunmalı. İlerleme kaybolmadı: **4/5**."
        );
      }

      const newValue =
        current + 5;

      const result =
        await setPlayerValue(
          target,
          newValue
        );

      if (!result.success) {
        user.training = 4;

        saveData();

        return message.reply(
          `❌ Ödül verilemedi: ${result.error}\n` +
          `📊 İlerleme kaybolmadı: **4/5**`
        );
      }

      syncPlayerValueEverywhere(
        message.author.id,
        newValue
      );

      user.training = 0;

      saveData();

      return message.reply(
        `🏋️ **ANTRENMAN TAMAMLANDI!**\n\n` +
        `🎉 **+5M€** oyuncu değeri kazandın.\n` +
        `💎 Yeni değer: **${formatMoney(newValue)}**\n` +
        `📊 İlerleme: **0/5**`
      );
    }

    saveData();

    return message.reply(
      `🏋️ Antrenman yapıldı!\n` +
      `📊 İlerleme: **${user.training}/5**\n` +
      `🎯 5/5 olduğunda **+5M€** oyuncu değeri kazanırsın.`
    );
  }

  // ===================================================
  // PENALTI
  // ===================================================

  if (
    command === "pen" ||
    command === "penaltı" ||
    command === "penalti"
  ) {
    if (
      !channelOnly(
        message,
        CHANNELS.PENALTI
      )
    ) return;

    const result =
      Math.floor(Math.random() * 3);

    if (result === 0) {
      const target = message.member;

      const nickname =
        target.nickname ||
        target.user.username;

      const current =
        getNicknameValue(nickname);

      if (current === null) {
        return message.reply(
          "❌ Takma adının sonunda `M€` bulunmalı."
        );
      }

      const newValue =
        current + 5;

      const update =
        await setPlayerValue(
          target,
          newValue
        );

      if (!update.success) {
        return message.reply(
          `❌ ${update.error}`
        );
      }

      syncPlayerValueEverywhere(
        message.author.id,
        newValue
      );

      saveData();

      return message.reply(
        `⚽ **GOOOL!**\n\n` +
        `🧤 Axera Kalecisi topu çıkaramadı!\n` +
        `💎 Oyuncu değerine **+5M€** eklendi.\n` +
        `💰 Yeni değer: **${formatMoney(newValue)}**`
      );
    }

    if (result === 1) {
      return message.reply(
        `🥅 **DİREK!**\n\n` +
        `Top direkten döndü.\n` +
        `💰 Ödül: **0M€**`
      );
    }

    return message.reply(
      `🧤 **KURTARDI!**\n\n` +
      `Axera Kalecisi penaltıyı kurtardı!\n` +
      `💰 Ödül: **0M€**`
    );
  }

  // ===================================================
  // OYUNCU ARA
  // ===================================================

  if (command === "ara") {
    const query = args.join(" ").toLowerCase().trim();

    if (!query) {
      return message.reply(
        "❌ Kullanım: `.ara W.Sneijder`"
      );
    }

    const members =
      message.guild.members.cache.filter(
        member =>
          !member.user.bot &&
          (
            member.nickname ||
            member.user.username
          )
      );

    let best = null;
    let bestScore = -1;

    for (const member of members.values()) {
      const nickname =
        member.nickname ||
        member.user.username;

      const lower =
        nickname.toLowerCase();

      let score = 0;

      if (lower === query) {
        score = 100;
      } else if (lower.includes(query)) {
        score = 80;
      } else {
        const queryWords =
          query.split(/\s+/);

        for (const word of queryWords) {
          if (lower.includes(word)) {
            score += 15;
          }
        }
      }

      if (score > bestScore) {
        bestScore = score;
        best = member;
      }
    }

    if (!best || bestScore <= 0) {
      return message.reply(
        "⚪ Aradığın oyuncu bulunamadı."
      );
    }

    const nickname =
      best.nickname ||
      best.user.username;

    const value =
      getNicknameValue(nickname);

    const embed = new EmbedBuilder()
      .setTitle("🔎 OYUNCU ARAMA")
      .addFields(
        {
          name: "Aranan",
          value: query,
          inline: true
        },
        {
          name: "Oyuncu",
          value: `${best}`,
          inline: true
        },
        {
          name: "Takma Ad",
          value: nickname,
          inline: false
        },
        {
          name: "Değer",
          value:
            value !== null
              ? formatMoney(value)
              : "Belirlenmemiş",
          inline: true
        },
        {
          name: "Durum",
          value: "🟢 DOLU",
          inline: true
        }
      )
      .setThumbnail(
        best.displayAvatarURL()
      )
      .setFooter({
        text: "Axera League • Oyuncu Arama"
      });

    return message.reply({
      embeds: [embed]
    });
  }

  // ===================================================
  // TAKIM EKLE
  // ===================================================

  if (command === "takımekle") {
    if (!isMatchOfficial(message.member)) {
      return message.reply(
        "❌ Bu komutu sadece **Maç Yetkilisi** kullanabilir."
      );
    }

    const role = getMentionedRole(message);

    if (!role) {
      return message.reply(
        "❌ Kullanım: `.takımekle @Takım`"
      );
    }

    if (data.teams[role.id]) {
      return message.reply(
        "❌ Bu takım zaten sistemde kayıtlı."
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

    await updateStandingsMessage(
      message.guild
    );

    return message.reply(
      `✅ **${role.name}** takımı lige eklendi.`
    );
  }

  // ===================================================
  // TAKIM KALDIR
  // ===================================================

  if (
    command === "takımkaldır" ||
    command === "takimkaldir" ||
    command === "takımkaldir" ||
    command === "takimkaldır"
  ) {
    if (!isMatchOfficial(message.member)) {
      return message.reply(
        "❌ Bu komutu sadece **Maç Yetkilisi** kullanabilir."
      );
    }

    const role = getMentionedRole(message);

    if (!role) {
      return message.reply(
        "❌ Kullanım: `.takımkaldır @Takım`"
      );
    }

    if (
      data.activeMatches[role.id]
    ) {
      return message.reply(
        "❌ Bu takım şu anda aktif bir maçta."
      );
    }

    if (!data.teams[role.id]) {
      return message.reply(
        "❌ Bu takım sistemde bulunmuyor."
      );
    }

    delete data.teams[role.id];
    delete data.standings[role.id];

    data.fixtures =
      data.fixtures.filter(
        fixture =>
          fixture.team1 !== role.id &&
          fixture.team2 !== role.id
      );

    saveData();

    await updateStandingsMessage(
      message.guild
    );

    return message.reply(
      `✅ **${role.name}** takımı sistemden kaldırıldı.`
    );
  }

  // ===================================================
  // TAKIM DEĞERİ
  // ===================================================

  if (command === "takımdeğer") {
    if (!isMatchOfficial(message.member)) {
      return message.reply(
        "❌ Bu komutu sadece **Maç Yetkilisi** kullanabilir."
      );
    }

    const role = getMentionedRole(message);
    const amount = parseMoney(args[0]);

    if (!role || amount === null) {
      return message.reply(
        "❌ Kullanım: `.takımdeğer @Takım 850`"
      );
    }

    const team = getTeam(role.id);

    if (!team) {
      return message.reply(
        "❌ Önce takımı `.takımekle` ile eklemelisin."
      );
    }

    team.baseValue = amount;

    saveData();

    return message.reply(
      `✅ **${team.name}** temel takım değeri **${formatMoney(amount)}** olarak ayarlandı.\n` +
      `💎 Toplam kadro değeri: **${formatMoney(calculateTeamValue(team, message.guild))}**`
    );
  }

  // ===================================================
  // KADRO EKLE
  // ===================================================

  if (command === "kadroekle") {
    if (!isMatchOfficial(message.member)) {
      return message.reply(
        "❌ Bu komutu sadece **Maç Yetkilisi** kullanabilir."
      );
    }

    const role = getMentionedRole(message);
    const target = getMentionedMember(
      message,
      0
    );

    // Mention sırası rol + kullanıcı olduğundan
    // mentions.members ve mentions.roles ayrı çalışır.

    const position =
      args[args.length - 1]?.toUpperCase();

    if (!role || !target || !POSITIONS.includes(position)) {
      return message.reply(
        "❌ Kullanım:\n`.kadroekle @Takım @Oyuncu Pozisyon`\n\n" +
        `Pozisyonlar: ${POSITIONS.join(", ")}`
      );
    }

    const team = getTeam(role.id);

    if (!team) {
      return message.reply(
        "❌ Takım sistemde kayıtlı değil."
      );
    }

    if (
      findSquadPlayer(
        team,
        target.id
      )
    ) {
      return message.reply(
        "❌ Bu oyuncu zaten kadroda."
      );
    }

    const nickname =
      target.nickname ||
      target.user.username;

    const value =
      getNicknameValue(nickname);

    if (value === null) {
      return message.reply(
        "❌ Oyuncunun değerini okuyamadım. Takma adının sonunda `M€` olmalı."
      );
    }

    team.squad.push({
      userId: target.id,
      nickname,
      position,
      value
    });

    saveData();

    return message.reply(
      `✅ ${target} **${team.name}** kadrosuna eklendi.\n` +
      `📍 Pozisyon: **${position}**\n` +
      `💎 Değer: **${formatMoney(value)}**\n` +
      `💰 Toplam takım değeri: **${formatMoney(calculateTeamValue(team, message.guild))}**`
    );
  }

  // ===================================================
  // KADRODAN ÇIKAR
  // ===================================================

  if (
    command === "kadrocikar" ||
    command === "kadroçıkar" ||
    command === "kadroçikar"
  ) {
    if (!isMatchOfficial(message.member)) {
      return message.reply(
        "❌ Bu komutu sadece **Maç Yetkilisi** kullanabilir."
      );
    }

    const role = getMentionedRole(message);
    const target = getMentionedMember(
      message,
      0
    );

    if (!role || !target) {
      return message.reply(
        "❌ Kullanım: `.kadrocikar @Takım @Oyuncu`"
      );
    }

    const team = getTeam(role.id);

    if (!team) {
      return message.reply(
        "❌ Takım sistemde bulunmuyor."
      );
    }

    const index =
      team.squad.findIndex(
        p => p.userId === target.id
      );

    if (index === -1) {
      return message.reply(
        "❌ Bu oyuncu takımın kadrosunda değil."
      );
    }

    team.squad.splice(index, 1);

    saveData();

    return message.reply(
      `✅ ${target} **${team.name}** kadrosundan çıkarıldı.\n` +
      `💰 Yeni toplam takım değeri: **${formatMoney(calculateTeamValue(team, message.guild))}**`
    );
  }

  // ===================================================
  // GÖRSEL KADRO
  // ===================================================

  if (command === "kadro") {
    const role = getMentionedRole(message);

    if (!role) {
      return message.reply(
        "❌ Kullanım: `.kadro @Takım`"
      );
    }

    const team = getTeam(role.id);

    if (!team) {
      return message.reply(
        "❌ Bu takım sistemde bulunmuyor."
      );
    }

    const visual =
      buildVisualLineup(
        team,
        message.guild
      );

    const totalValue =
      calculateTeamValue(
        team,
        message.guild
      );

    const embed = new EmbedBuilder()
      .setTitle(
        `🏟️ AXERA LEAGUE — ${team.name}`
      )
      .setDescription(
        "```text\n" +
        visual +
        "\n```"
      )
      .addFields(
        {
          name: "📋 Formasyon",
          value: team.formation || "4-4-2",
          inline: true
        },
        {
          name: "👥 Oyuncu",
          value: `${team.squad.length}`,
          inline: true
        },
        {
          name: "💎 Toplam Takım Değeri",
          value: formatMoney(totalValue),
          inline: true
        }
      )
      .setFooter({
        text: "Axera League • Görsel Kadro"
      });

    return message.reply({
      embeds: [embed]
    });
  }

  // ===================================================
  // FORMASYON
  // ===================================================

  if (command === "formasyon") {
    if (!isMatchOfficial(message.member)) {
      return message.reply(
        "❌ Bu komutu sadece **Maç Yetkilisi** kullanabilir."
      );
    }

    const role = getMentionedRole(message);

    if (!role) {
      return message.reply(
        "❌ Kullanım: `.formasyon @Takım`"
      );
    }

    const team = getTeam(role.id);

    if (!team) {
      return message.reply(
        "❌ Takım sistemde bulunmuyor."
      );
    }

    const menu =
      new StringSelectMenuBuilder()
        .setCustomId(
          `formation_${role.id}`
        )
        .setPlaceholder(
          "Formasyon seç..."
        )
        .addOptions(
          Object.keys(FORMATIONS).map(
            formation => ({
              label: formation,
              value: formation,
              emoji: "⚽"
            })
          )
        );

    const row =
      new ActionRowBuilder()
        .addComponents(menu);

    return message.reply({
      content:
        `📋 **${team.name}** için formasyon seç:`,
      components: [row]
    });
  }

  // ===================================================
  // PUAN
  // ===================================================

  if (command === "puan") {
    return message.reply({
      embeds: [standingsEmbed()]
    });
  }

  // ===================================================
  // PUAN EKLE
  // ===================================================

  if (command === "puanekle") {
    if (!isMatchOfficial(message.member)) {
      return message.reply(
        "❌ Bu komutu sadece **Maç Yetkilisi** kullanabilir."
      );
    }

    const role = getMentionedRole(message);
    const amount = Number(args[0]);

    if (
      !role ||
      !Number.isInteger(amount)
    ) {
      return message.reply(
        "❌ Kullanım: `.puanekle @Takım 3`"
      );
    }

    const team = getTeam(role.id);

    if (!team) {
      return message.reply(
        "❌ Takım bulunamadı."
      );
    }

    const standing =
      ensureStanding(
        role.id,
        team.name
      );

    standing.P += amount;

    if (standing.P < 0) {
      standing.P = 0;
    }

    saveData();

    await updateStandingsMessage(
      message.guild
    );

    return message.reply(
      `✅ **${team.name}** puanı güncellendi.\n🏆 Yeni puan: **${standing.P}**`
    );
  }

  // ===================================================
  // MAÇ
  // ===================================================

  if (command === "maç" || command === "mac") {
    if (!isMatchOfficial(message.member)) {
      return message.reply(
        "❌ Bu komutu sadece **Maç Yetkilisi** kullanabilir."
      );
    }

    const role1 =
      message.mentions.roles.at(0);

    const role2 =
      message.mentions.roles.at(1);

    if (!role1 || !role2) {
      return message.reply(
        "❌ Kullanım: `.maç @Takım1 @Takım2`"
      );
    }

    if (role1.id === role2.id) {
      return message.reply(
        "❌ Aynı takım kendisiyle maç yapamaz."
      );
    }

    if (
      data.activeMatches[role1.id] ||
      data.activeMatches[role2.id]
    ) {
      return message.reply(
        "❌ Takımlardan biri zaten aktif maçta."
      );
    }

    const team1 = getTeam(role1.id);
    const team2 = getTeam(role2.id);

    if (!team1 || !team2) {
      return message.reply(
        "❌ İki takımın da sistemde kayıtlı olması gerekiyor."
      );
    }

    await startMatch(
      message.guild,
      role1.id,
      role2.id
    );

    return message.reply(
      `⚽ **${team1.name} - ${team2.name}** maçı başlatıldı!`
    );
  }

  // ===================================================
  // FİKSTÜR GÖRÜNTÜLE
  // ===================================================

  if (
    command === "fikstur" ||
    command === "fikstür"
  ) {
    const fixtures =
      data.fixtures
        .filter(f => f.status !== "TAMAMLANDI")
        .sort(
          (a, b) =>
            fixtureDateKey(a).localeCompare(
              fixtureDateKey(b)
            )
        );

    if (!fixtures.length) {
      return message.reply(
        "📅 Henüz bekleyen fikstür bulunmuyor."
      );
    }

    const description =
      fixtures
        .slice(0, 25)
        .map((fixture, index) => {
          const team1 =
            getTeam(fixture.team1)?.name ||
            "Bilinmeyen";

          const team2 =
            getTeam(fixture.team2)?.name ||
            "Bilinmeyen";

          return (
            `**${index + 1}.** ${team1} 🆚 ${team2}\n` +
            `📅 ${fixture.date} • ${fixture.time}\n` +
            `📌 Durum: **${fixture.status}**`
          );
        })
        .join("\n\n");

    const embed = new EmbedBuilder()
      .setTitle("📅 AXERA LEAGUE — FİKSTÜR")
      .setDescription(description)
      .setFooter({
        text: `Saat dilimi: ${TIME_ZONE}`
      });

    return message.reply({
      embeds: [embed]
    });
  }

  // ===================================================
  // FİKSTÜR EKLE
  // ===================================================

  if (
    command === "fiksturekle" ||
    command === "fikstür ekle"
  ) {
    if (!isMatchOfficial(message.member)) {
      return message.reply(
        "❌ Bu komutu sadece **Maç Yetkilisi** kullanabilir."
      );
    }

    const role1 =
      message.mentions.roles.at(0);

    const role2 =
      message.mentions.roles.at(1);

    if (!role1 || !role2) {
      return message.reply(
        "❌ Kullanım:\n`.fiksturekle @Takım1 @Takım2 2026-09-05 20:30`"
      );
    }

    const dateTime =
      parseFixtureDateTime(args);

    if (!dateTime) {
      return message.reply(
        "❌ Tarih/saat formatı hatalı.\nÖrnek: `2026-09-05 20:30`"
      );
    }

    const team1 = getTeam(role1.id);
    const team2 = getTeam(role2.id);

    if (!team1 || !team2) {
      return message.reply(
        "❌ İki takımın da sistemde kayıtlı olması gerekiyor."
      );
    }

    if (role1.id === role2.id) {
      return message.reply(
        "❌ Aynı takıma karşı fikstür oluşturamazsın."
      );
    }

    const exists =
      data.fixtures.some(
        f =>
          f.status === "BEKLIYOR" &&
          (
            (
              f.team1 === role1.id &&
              f.team2 === role2.id
            ) ||
            (
              f.team1 === role2.id &&
              f.team2 === role1.id
            )
          ) &&
          f.date === dateTime.date &&
          f.time === dateTime.time
      );

    if (exists) {
      return message.reply(
        "❌ Aynı tarih ve saatte bu maç zaten fikstürde."
      );
    }

    const fixture = {
      id:
        `fixture_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      team1: role1.id,
      team2: role2.id,
      date: dateTime.date,
      time: dateTime.time,
      status: "BEKLIYOR",
      score1: 0,
      score2: 0,
      startedAt: null,
      finishedAt: null
    };

    data.fixtures.push(fixture);

    saveData();

    return message.reply(
      `✅ Fikstür oluşturuldu!\n\n` +
      `⚽ **${team1.name} 🆚 ${team2.name}**\n` +
      `📅 **${dateTime.date}**\n` +
      `🕐 **${dateTime.time}**\n` +
      `🌍 Saat dilimi: **${TIME_ZONE}**`
    );
  }

  // ===================================================
  // FİKSTÜR ÇIKAR
  // ===================================================

  if (
    command === "fiksturcikar" ||
    command === "fikstürcikar" ||
    command === "fikstürçıkar" ||
    command === "fiksturçıkar"
  ) {
    if (!isMatchOfficial(message.member)) {
      return message.reply(
        "❌ Bu komutu sadece **Maç Yetkilisi** kullanabilir."
      );
    }

    const role1 =
      message.mentions.roles.at(0);

    const role2 =
      message.mentions.roles.at(1);

    if (!role1 || !role2) {
      return message.reply(
        "❌ Kullanım: `.fiksturcikar @Takım1 @Takım2`"
      );
    }

    const pending =
      data.fixtures.filter(
        fixture =>
          fixture.status === "BEKLIYOR" &&
          (
            (
              fixture.team1 === role1.id &&
              fixture.team2 === role2.id
            ) ||
            (
              fixture.team1 === role2.id &&
              fixture.team2 === role1.id
            )
          )
      );

    if (!pending.length) {
      return message.reply(
        "❌ Bu iki takım arasında bekleyen fikstür bulunamadı."
      );
    }

    const removed = pending[pending.length - 1];

    data.fixtures =
      data.fixtures.filter(
        fixture =>
          fixture.id !== removed.id
      );

    saveData();

    return message.reply(
      `✅ Fikstür silindi.\n` +
      `⚽ <@&${removed.team1}> 🆚 <@&${removed.team2}>\n` +
      `📅 ${removed.date} ${removed.time}`
    );
  }

  // ===================================================
  // TWEET
  // ===================================================

  if (command === "tweet") {
    const text = args.join(" ");

    if (!text) {
      return message.reply(
        "❌ Kullanım: `.tweet Mesajınız`"
      );
    }

    const embed = new EmbedBuilder()
      .setAuthor({
        name:
          message.member.displayName ||
          message.author.username,
        iconURL:
          message.author.displayAvatarURL()
      })
      .setDescription(text)
      .setFooter({
        text: "Axera League • Tweet"
      })
      .setTimestamp();

    return message.channel.send({
      embeds: [embed]
    });
  }

  // ===================================================
  // EMBED
  // ===================================================

  if (command === "embed") {
    if (!isAdmin(message.member)) {
      return message.reply(
        "❌ Bu komutu sadece yöneticiler kullanabilir."
      );
    }

    const content = args.join(" ");
    const parts = content.split("|");

    const title =
      parts[0]?.trim() || "Axera League";

    const description =
      parts.slice(1).join("|").trim() ||
      " ";

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setFooter({
        text: "Axera League"
      })
      .setTimestamp();

    return message.channel.send({
      embeds: [embed]
    });
  }

  // ===================================================
  // SİL
  // ===================================================

  if (command === "sil") {
    if (!isAdmin(message.member)) {
      return message.reply(
        "❌ Bu komutu sadece yöneticiler kullanabilir."
      );
    }

    const amount = Number(args[0]);

    if (
      !Number.isInteger(amount) ||
      amount < 1 ||
      amount > 1000
    ) {
      return message.reply(
        "❌ 1 ile 1000 arasında bir miktar belirt."
      );
    }

    try {
      const deleted =
        await message.channel.bulkDelete(
          amount,
          true
        );

      const response =
        await message.channel.send(
          `🗑️ **${deleted.size}** mesaj silindi.`
        );

      setTimeout(
        () => response.delete().catch(() => {}),
        3000
      );
    } catch (err) {
      return message.reply(
        "❌ Mesajlar silinemedi."
      );
    }

    return;
  }

  // ===================================================
  // KICK
  // ===================================================

  if (command === "kick") {
    if (!isAdmin(message.member)) {
      return message.reply(
        "❌ Bu komutu sadece yöneticiler kullanabilir."
      );
    }

    const target = getMentionedMember(message);

    if (!target) {
      return message.reply(
        "❌ Kullanım: `.kick @Oyuncu`"
      );
    }

    try {
      await target.kick();

      return message.reply(
        `👢 ${target.user.tag} sunucudan atıldı.`
      );
    } catch {
      return message.reply(
        "❌ Oyuncu atılamadı."
      );
    }
  }

  // ===================================================
  // BAN
  // ===================================================

  if (command === "ban") {
    if (!isAdmin(message.member)) {
      return message.reply(
        "❌ Bu komutu sadece yöneticiler kullanabilir."
      );
    }

    const target = getMentionedMember(message);

    if (!target) {
      return message.reply(
        "❌ Kullanım: `.ban @Oyuncu`"
      );
    }

    try {
      await target.ban({
        reason: "Axera League yönetimi"
      });

      return message.reply(
        `🔨 ${target.user.tag} banlandı.`
      );
    } catch {
      return message.reply(
        "❌ Oyuncu banlanamadı."
      );
    }
  }

  // ===================================================
  // MUTE
  // ===================================================

  if (command === "mute") {
    if (!isAdmin(message.member)) {
      return message.reply(
        "❌ Bu komutu sadece yöneticiler kullanabilir."
      );
    }

    const target = getMentionedMember(message);

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

      return message.reply(
        `🔇 ${target} **10 dakika** susturuldu.`
      );
    } catch {
      return message.reply(
        "❌ Oyuncu susturulamadı."
      );
    }
  }

  // ===================================================
  // UNMUTE
  // ===================================================

  if (command === "unmute") {
    if (!isAdmin(message.member)) {
      return message.reply(
        "❌ Bu komutu sadece yöneticiler kullanabilir."
      );
    }

    const target = getMentionedMember(message);

    if (!target) {
      return message.reply(
        "❌ Kullanım: `.unmute @Oyuncu`"
      );
    }

    try {
      await target.timeout(
        null,
        "Axera League unmute"
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
});

// =====================================================
// BUTONLAR
// =====================================================

client.on("interactionCreate", async interaction => {
  if (interaction.isButton()) {
    const id = interaction.customId;

    if (!id.startsWith("register_")) {
      return;
    }

    if (
      !isRegistrationOfficial(
        interaction.member
      )
    ) {
      return interaction.reply({
        content:
          "❌ Bu paneli sadece **Kayıt Yetkilisi** kullanabilir.",
        ephemeral: true
      });
    }

    const parts = id.split("_");

    const type = parts[1];
    const targetId = parts[2];

    const guild =
      interaction.guild;

    const target =
      await guild.members.fetch(
        targetId
      ).catch(() => null);

    if (!target) {
      return interaction.reply({
        content:
          "❌ Oyuncu bulunamadı.",
        ephemeral: true
      });
    }

    let roleId;
    let roleName;

    if (type === "futbolcu") {
      roleId = ROLES.FUTBOLCU;
      roleName = "Futbolcu";
    } else if (type === "kaleci") {
      roleId = ROLES.KALECI;
      roleName = "Kaleci";
    } else if (type === "td") {
      roleId =
        ROLES.TEKNIK_DIREKTOR;
      roleName = "Teknik Direktör";
    } else {
      return;
    }

    for (const role of [
      ROLES.KAYITSIZ,
      ROLES.FUTBOLCU,
      ROLES.KALECI,
      ROLES.TEKNIK_DIREKTOR
    ]) {
      await target.roles
        .remove(role)
        .catch(() => {});
    }

    await target.roles
      .add(roleId)
      .catch(() => {});

    data.registrations[target.id] = {
      type: roleName,
      registeredBy:
        interaction.user.id,
      registeredAt: Date.now()
    };

    saveData();

    const disabledRow =
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("disabled_futbolcu")
          .setLabel("Futbolcu")
          .setEmoji("⚽")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),

        new ButtonBuilder()
          .setCustomId("disabled_kaleci")
          .setLabel("Kaleci")
          .setEmoji("🧤")
          .setStyle(ButtonStyle.Success)
          .setDisabled(true),

        new ButtonBuilder()
          .setCustomId("disabled_td")
          .setLabel("Teknik Direktör")
          .setEmoji("📋")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      );

    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle("✅ KAYIT TAMAMLANDI")
          .setDescription(
            `${target} başarıyla **${roleName}** olarak kayıt edildi.`
          )
          .setFooter({
            text: "Axera League"
          })
      ],
      components: [disabledRow]
    });

    const chat =
      guild.channels.cache.get(
        CHANNELS.SOHBET
      );

    if (chat) {
      await chat.send(
        `🎉 ${target} aramıza katıldı!\n` +
        `👤 Kayıt türü: **${roleName}**\n` +
        `📋 Kayıt yetkilisi: ${interaction.user}`
      );
    }

    return;
  }

  // ===================================================
  // FORMASYON MENÜSÜ
  // ===================================================

  if (interaction.isStringSelectMenu()) {
    if (
      !interaction.customId.startsWith(
        "formation_"
      )
    ) {
      return;
    }

    if (
      !isMatchOfficial(
        interaction.member
      )
    ) {
      return interaction.reply({
        content:
          "❌ Bu menüyü sadece **Maç Yetkilisi** kullanabilir.",
        ephemeral: true
      });
    }

    const teamId =
      interaction.customId.split("_")[1];

    const formation =
      interaction.values[0];

    const team =
      getTeam(teamId);

    if (!team) {
      return interaction.reply({
        content:
          "❌ Takım bulunamadı.",
        ephemeral: true
      });
    }

    team.formation = formation;

    saveData();

    return interaction.update({
      content:
        `✅ **${team.name}** formasyonu **${formation}** olarak ayarlandı.`,
      components: []
    });
  }
});

// =====================================================
// HATA YAKALAMA
// =====================================================

process.on("unhandledRejection", error => {
  console.error(
    "Unhandled Rejection:",
    error
  );
});

process.on("uncaughtException", error => {
  console.error(
    "Uncaught Exception:",
    error
  );
});

// =====================================================
// TOKEN
// =====================================================

if (!TOKEN) {
  console.error(
    "❌ TOKEN bulunamadı! Railway Variables kısmına TOKEN ekle."
  );
  process.exit(1);
}

client.login(TOKEN);
