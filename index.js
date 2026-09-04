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
  StringSelectMenuOptionBuilder
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const TOKEN = process.env.TOKEN;
const PREFIX = ".";
const TIME_ZONE = process.env.TIME_ZONE || "Europe/Istanbul";

/* =========================
   AXERA LEAGUE ID'LERİ
========================= */

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

/* =========================
   FORMASYONLAR
========================= */

const FORMATIONS = {
  "4-4-2": {
    KL: 1,
    STP: 2,
    SĞB: 1,
    SLB: 1,
    MO: 2,
    SĞK: 1,
    SLK: 1,
    SNT: 2
  },
  "4-3-3": {
    KL: 1,
    STP: 2,
    SĞB: 1,
    SLB: 1,
    MO: 3,
    SĞK: 1,
    SLK: 1,
    SNT: 1
  },
  "4-2-3-1": {
    KL: 1,
    STP: 2,
    SĞB: 1,
    SLB: 1,
    MO: 2,
    MOO: 1,
    SĞK: 1,
    SLK: 1,
    SNT: 1
  },
  "3-5-2": {
    KL: 1,
    STP: 3,
    MO: 2,
    MOO: 1,
    SĞK: 1,
    SLK: 1,
    SNT: 2
  },
  "3-4-3": {
    KL: 1,
    STP: 3,
    MO: 2,
    SĞK: 1,
    SLK: 1,
    SNT: 3
  },
  "4-3-1-2": {
    KL: 1,
    STP: 2,
    SĞB: 1,
    SLB: 1,
    MO: 3,
    MOO: 1,
    SNT: 2
  },
  "4-2-2-2": {
    KL: 1,
    STP: 2,
    SĞB: 1,
    SLB: 1,
    MO: 2,
    MOO: 2,
    SNT: 2
  },
  "5-3-2": {
    KL: 1,
    STP: 3,
    SĞB: 1,
    SLB: 1,
    MO: 3,
    SNT: 2
  }
};

const POSITION_LIST = [
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

/* =========================
   CLIENT
========================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration
  ],
  partials: [
    Partials.Channel,
    Partials.GuildMember,
    Partials.User,
    Partials.Message
  ]
});

/* =========================
   DATA
========================= */

const DATA_FILE = path.join(process.cwd(), "data.json");
const TEMP_DATA_FILE = path.join(process.cwd(), "data.tmp.json");

const DEFAULT_DATA = {
  users: {},
  teams: {},
  standings: {},
  fixtures: [],
  nextFixtureId: 1,
  activeMatches: {},
  standingsMessageId: null,
  registrationPanels: {}
};

let data = loadData();

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const fresh = JSON.parse(JSON.stringify(DEFAULT_DATA));
      saveData(fresh);
      return fresh;
    }

    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const oldData = JSON.parse(raw);

    const merged = {
      ...JSON.parse(JSON.stringify(DEFAULT_DATA)),
      ...oldData
    };

    if (!merged.users || typeof merged.users !== "object") {
      merged.users = {};
    }

    if (!merged.teams || typeof merged.teams !== "object") {
      merged.teams = {};
    }

    if (!merged.standings || typeof merged.standings !== "object") {
      merged.standings = {};
    }

    if (!Array.isArray(merged.fixtures)) {
      merged.fixtures = [];
    }

    if (!merged.registrationPanels || typeof merged.registrationPanels !== "object") {
      merged.registrationPanels = {};
    }

    if (!merged.activeMatches || typeof merged.activeMatches !== "object") {
      merged.activeMatches = {};
    }

    if (!Number.isInteger(merged.nextFixtureId)) {
      merged.nextFixtureId = 1;
    }

    for (const [id, user] of Object.entries(merged.users)) {
      if (!user || typeof user !== "object") {
        merged.users[id] = {
          value: 0,
          budget: 0,
          training: 0
        };
        continue;
      }

      if (typeof user.value !== "number") user.value = 0;
      if (typeof user.budget !== "number") user.budget = 0;
      if (typeof user.training !== "number") user.training = 0;
    }

    for (const [id, team] of Object.entries(merged.teams)) {
      if (!team || typeof team !== "object") {
        merged.teams[id] = {
          name: "Takım",
          formation: "4-4-2",
          manualValue: 0,
          squad: []
        };
        continue;
      }

      if (!team.name) team.name = "Takım";
      if (!FORMATIONS[team.formation]) team.formation = "4-4-2";
      if (typeof team.manualValue !== "number") team.manualValue = 0;
      if (!Array.isArray(team.squad)) team.squad = [];
    }

    return merged;
  } catch (err) {
    console.error("data.json okunamadı:", err);

    try {
      if (fs.existsSync(DATA_FILE)) {
        const backup = DATA_FILE.replace(
          ".json",
          `.backup-${Date.now()}.json`
        );
        fs.copyFileSync(DATA_FILE, backup);
      }
    } catch {}

    const fresh = JSON.parse(JSON.stringify(DEFAULT_DATA));
    saveData(fresh);
    return fresh;
  }
}

function saveData(target = data) {
  try {
    fs.writeFileSync(
      TEMP_DATA_FILE,
      JSON.stringify(target, null, 2),
      "utf8"
    );

    fs.renameSync(TEMP_DATA_FILE, DATA_FILE);
  } catch (err) {
    console.error("data.json kaydedilemedi:", err);

    try {
      fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(target, null, 2),
        "utf8"
      );
    } catch (secondErr) {
      console.error("data.json ikinci kayıt hatası:", secondErr);
    }
  }
}

/* =========================
   YARDIMCI FONKSİYONLAR
========================= */

function normalize(text = "") {
  return String(text)
    .toLocaleLowerCase("tr-TR")
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .trim();
}

function formatMoney(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return "0M€";

  return `${new Intl.NumberFormat("tr-TR").format(
    Math.max(0, Math.round(number))
  )}M€`;
}

function parseMoney(input) {
  if (input === undefined || input === null) return null;

  let text = String(input)
    .trim()
    .toUpperCase()
    .replace(/€/g, "")
    .replace(/\s/g, "");

  if (!text) return null;

  if (text.endsWith("M")) {
    text = text.slice(0, -1);
  }

  if (!text) return null;

  if (text.includes(",") && text.includes(".")) {
    const lastComma = text.lastIndexOf(",");
    const lastDot = text.lastIndexOf(".");

    if (lastComma > lastDot) {
      text = text.replace(/\./g, "").replace(",", ".");
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (text.includes(",")) {
    const parts = text.split(",");

    if (parts[1] && parts[1].length <= 2) {
      text = text.replace(",", ".");
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (text.includes(".")) {
    const parts = text.split(".");

    if (parts.length === 2 && parts[1].length !== 3) {
      // Ondalık sayı
    } else {
      text = text.replace(/\./g, "");
    }
  }

  const amount = Number(text);

  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return amount;
}

function getUserData(userId) {
  if (!data.users[userId] || typeof data.users[userId] !== "object") {
    data.users[userId] = {
      value: 0,
      budget: 0,
      training: 0
    };
  }

  const user = data.users[userId];

  if (typeof user.value !== "number") user.value = 0;
  if (typeof user.budget !== "number") user.budget = 0;
  if (typeof user.training !== "number") user.training = 0;

  return user;
}

function getTeamData(role) {
  const id = typeof role === "string" ? role : role.id;

  if (!data.teams[id]) {
    data.teams[id] = {
      name:
        typeof role === "string"
          ? "Takım"
          : role.name || "Takım",
      formation: "4-4-2",
      manualValue: 0,
      squad: []
    };
  }

  const team = data.teams[id];

  if (!team.name) {
    team.name =
      typeof role === "string"
        ? "Takım"
        : role.name || "Takım";
  }

  if (!FORMATIONS[team.formation]) {
    team.formation = "4-4-2";
  }

  if (typeof team.manualValue !== "number") {
    team.manualValue = 0;
  }

  if (!Array.isArray(team.squad)) {
    team.squad = [];
  }

  return team;
}

function hasRole(member, roleId) {
  return Boolean(member?.roles?.cache?.has(roleId));
}

function isAdmin(member) {
  return Boolean(
    member?.permissions?.has(
      PermissionsBitField.Flags.Administrator
    )
  );
}

function canUseRole(member, roleId) {
  return isAdmin(member) || hasRole(member, roleId);
}

function requireChannel(message, channelId) {
  if (message.channel.id !== channelId) {
    message.reply(
      `❌ Bu komut <#${channelId}> kanalında kullanılmalıdır.`
    );
    return false;
  }

  return true;
}

function getMentionedMember(message, index = 0) {
  return message.mentions.members.at(index) || null;
}

function getMentionedRole(message, index = 0) {
  return message.mentions.roles.at(index) || null;
}

function getMemberNickname(member) {
  return member?.nickname || member?.user?.username || "Oyuncu";
}

function parseNicknameValue(nickname) {
  if (!nickname) return null;

  const match = nickname.match(
    /^(.*?)([\d.,]+)M€$/i
  );

  if (!match) return null;

  let numberText = match[2];

  if (numberText.includes(",") && numberText.includes(".")) {
    const lastComma = numberText.lastIndexOf(",");
    const lastDot = numberText.lastIndexOf(".");

    if (lastComma > lastDot) {
      numberText = numberText
        .replace(/\./g, "")
        .replace(",", ".");
    } else {
      numberText = numberText.replace(/,/g, "");
    }
  } else if (numberText.includes(",")) {
    numberText = numberText.replace(",", ".");
  } else if (numberText.includes(".")) {
    const parts = numberText.split(".");

    if (
      parts.length > 2 ||
      (parts.length === 2 && parts[1].length === 3)
    ) {
      numberText = numberText.replace(/\./g, "");
    }
  }

  const value = Number(numberText);

  if (!Number.isFinite(value)) return null;

  return {
    prefix: match[1].trimEnd(),
    value
  };
}

async function updatePlayerNicknameValue(member, newValue) {
  if (!member) {
    return {
      ok: false,
      error: "Oyuncu bulunamadı."
    };
  }

  const currentNickname =
    member.nickname || member.user.username;

  const parsed = parseNicknameValue(currentNickname);

  if (!parsed) {
    return {
      ok: false,
      error:
        "Oyuncunun takma adı `... | 1M€` biçiminde olmalıdır."
    };
  }

  const newNickname =
    `${parsed.prefix} | ${formatMoney(newValue)}`;

  if (newNickname.length > 32) {
    return {
      ok: false,
      error:
        "Yeni takma ad Discord'un 32 karakter sınırını aşıyor."
    };
  }

  if (!member.manageable) {
    return {
      ok: false,
      error:
        "Bot bu oyuncunun takma adını değiştiremiyor. Bot rolünü oyuncu rollerinin üzerine taşı."
    };
  }

  try {
    await member.setNickname(
      newNickname,
      "Axera League oyuncu değeri güncellemesi"
    );

    getUserData(member.id).value = newValue;

    syncPlayerInTeams(member.id);
    saveData();

    return {
      ok: true,
      nickname: newNickname,
      value: newValue
    };
  } catch (err) {
    console.error("Nickname güncelleme:", err);

    return {
      ok: false,
      error:
        "Takma ad değiştirilemedi. Botun `Takma Adları Yönet` yetkisini ve rol sırasını kontrol et."
    };
  }
}

function syncPlayerInTeams(userId) {
  const user = getUserData(userId);

  for (const team of Object.values(data.teams)) {
    if (!Array.isArray(team.squad)) continue;

    for (const player of team.squad) {
      if (player.userId === userId) {
        player.value = user.value;
      }
    }
  }
}

function getTeamTotal(team) {
  if (!team) return 0;

  let total = Number(team.manualValue) || 0;

  for (const player of team.squad || []) {
    const user = getUserData(player.userId);
    player.value = user.value;
    total += user.value;
  }

  return total;
}

function getTeamRoleById(guild, id) {
  return guild.roles.cache.get(id) || null;
}

function standingsEntry(role) {
  const id = role.id;

  if (!data.standings[id]) {
    data.standings[id] = {
      teamId: id,
      name: role.name,
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

  const standing = data.standings[id];

  if (!standing.teamId) standing.teamId = id;
  if (!standing.name) standing.name = role.name;

  for (const key of ["O", "G", "B", "M", "AG", "YG", "AV", "P"]) {
    if (typeof standing[key] !== "number") {
      standing[key] = 0;
    }
  }

  return standing;
}

function updateStanding(role, result) {
  const s = standingsEntry(role);

  s.O++;

  if (result === "win") {
    s.G++;
    s.P += 3;
  } else if (result === "draw") {
    s.B++;
    s.P += 1;
  } else {
    s.M++;
  }
}

function addGoalsToStanding(role, scored, conceded) {
  const s = standingsEntry(role);

  s.AG += scored;
  s.YG += conceded;
  s.AV = s.AG - s.YG;
}

function sortedStandings(guild) {
  const rows = Object.values(data.standings)
    .map((s) => {
      const role = guild.roles.cache.get(s.teamId);

      return {
        ...s,
        name: role?.name || s.name || "Silinmiş Takım"
      };
    })
    .filter((s) => guild.roles.cache.has(s.teamId));

  rows.sort((a, b) => {
    if (b.P !== a.P) return b.P - a.P;
    if (b.AV !== a.AV) return b.AV - a.AV;
    return b.AG - a.AG;
  });

  return rows;
}

/* =========================
   PUAN DURUMU
========================= */

function createStandingsEmbed(guild) {
  const rows = sortedStandings(guild);

  const embed = new EmbedBuilder()
    .setTitle("🏆 AXERA LEAGUE • PUAN DURUMU")
    .setDescription(
      rows.length
        ? "Güncel lig sıralaması"
        : "Henüz kayıtlı takım bulunmuyor."
    )
    .setTimestamp();

  if (rows.length) {
    const text = rows
      .map((s, i) => {
        const av =
          s.AV > 0
            ? `+${s.AV}`
            : `${s.AV}`;

        return [
          `**${i + 1}. <@&${s.teamId}>**`,
          `O: ${s.O} • G: ${s.G} • B: ${s.B} • M: ${s.M}`,
          `AG: ${s.AG} • YG: ${s.YG} • AV: ${av} • **P: ${s.P}**`
        ].join("\n");
      })
      .join("\n\n");

    embed.addFields({
      name: "📊 Sıralama",
      value: text.slice(0, 1024)
    });
  }

  return embed;
}

async function updateStandingsMessage(guild) {
  try {
    const channel = guild.channels.cache.get(CHANNELS.PUAN);

    if (!channel || !channel.isTextBased()) return;

    const embed = createStandingsEmbed(guild);

    let msg = null;

    if (data.standingsMessageId) {
      try {
        msg = await channel.messages.fetch(
          data.standingsMessageId
        );
      } catch {}
    }

    if (msg) {
      await msg.edit({
        embeds: [embed]
      });
    } else {
      msg = await channel.send({
        embeds: [embed]
      });

      data.standingsMessageId = msg.id;
      saveData();
    }
  } catch (err) {
    console.error("Puan mesajı:", err);
  }
}

/* =========================
   FİKSTÜR
========================= */

function getLocalDateTimeKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });

  const parts = formatter.formatToParts(date);

  const get = (type) =>
    parts.find((p) => p.type === type)?.value;

  return `${get("year")}-${get("month")}-${get("day")} ${get(
    "hour"
  )}:${get("minute")}`;
}

function validateDateTime(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if (!/^\d{2}:\d{2}$/.test(time)) return false;

  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  if (month < 1 || month > 12) return false;
  if (hour < 0 || hour > 23) return false;
  if (minute < 0 || minute > 59) return false;

  const test = new Date(
    Date.UTC(year, month - 1, day)
  );

  return (
    test.getUTCFullYear() === year &&
    test.getUTCMonth() === month - 1 &&
    test.getUTCDate() === day
  );
}

function pendingFixtureForTeams(team1, team2) {
  return data.fixtures.filter(
    (f) =>
      f.status === "BEKLIYOR" &&
      ((f.team1 === team1 && f.team2 === team2) ||
        (f.team1 === team2 && f.team2 === team1))
  );
}

function createFixtureEmbed(guild) {
  const fixtures = [...data.fixtures].sort((a, b) => {
    const ak = `${a.date} ${a.time}`;
    const bk = `${b.date} ${b.time}`;

    return ak.localeCompare(bk);
  });

  const embed = new EmbedBuilder()
    .setTitle("📅 AXERA LEAGUE • FİKSTÜR")
    .setTimestamp();

  if (!fixtures.length) {
    embed.setDescription("Henüz fikstür bulunmuyor.");
    return embed;
  }

  const lines = fixtures
    .slice(0, 20)
    .map((f, index) => {
      const t1 = guild.roles.cache.get(f.team1);
      const t2 = guild.roles.cache.get(f.team2);

      const team1 = t1
        ? `<@&${t1.id}>`
        : "Silinmiş Takım";

      const team2 = t2
        ? `<@&${t2.id}>`
        : "Silinmiş Takım";

      let status = f.status || "BEKLIYOR";

      if (
        status === "TAMAMLANDI" &&
        typeof f.score1 === "number"
      ) {
        status = `**${f.score1} - ${f.score2}**`;
      }

      return `${index + 1}. ${team1} **vs** ${team2}\n📅 ${f.date} ${f.time} • ${status}`;
    })
    .join("\n\n");

  embed.setDescription(lines.slice(0, 4096));

  return embed;
}

/* =========================
   MAÇ SİSTEMİ
========================= */

const activeMatchTimers = new Map();

function chooseRandom(array) {
  if (!array.length) return null;
  return array[Math.floor(Math.random() * array.length)];
}

function getSquadPlayers(team) {
  return (team.squad || [])
    .map((entry) => ({
      ...entry,
      value: getUserData(entry.userId).value
    }));
}

function chooseScorer(team) {
  const squad = getSquadPlayers(team);

  const preferred = squad.filter((p) =>
    ["SNT", "SĞK", "SLK", "MOO", "MO"].includes(p.position)
  );

  return chooseRandom(
    preferred.length ? preferred : squad
  );
}

function chooseDefender(team) {
  const squad = getSquadPlayers(team);

  const preferred = squad.filter((p) =>
    ["KL", "STP", "SĞB", "SLB"].includes(p.position)
  );

  return chooseRandom(
    preferred.length ? preferred : squad
  );
}

function playerDisplay(guild, player) {
  if (!player) return "Oyuncu";

  const member = guild.members.cache.get(player.userId);

  if (member) {
    return member.displayName;
  }

  return player.name || "Oyuncu";
}

function teamStrength(team) {
  const value = Math.max(0, getTeamTotal(team));

  return Math.max(0.65, Math.min(1.35, 1 + Math.log10(value + 1) / 20));
}

function goalProbability(teamA, teamB) {
  const a = getTeamTotal(teamA);
  const b = getTeamTotal(teamB);

  const total = a + b;

  if (total <= 0) return 0.0135;

  const share = a / total;

  return 0.0135 * (0.78 + share * 0.44);
}

function getMatchLineup(team) {
  const squad = getSquadPlayers(team);

  if (!squad.length) {
    return [];
  }

  const formation =
    FORMATIONS[team.formation] || FORMATIONS["4-4-2"];

  const used = new Set();
  const lineup = [];

  for (const [position, count] of Object.entries(formation)) {
    const candidates = squad.filter(
      (p) =>
        p.position === position &&
        !used.has(p.userId)
    );

    for (const player of candidates.slice(0, count)) {
      used.add(player.userId);
      lineup.push(player);
    }
  }

  // İLK 11 ZORUNLULUĞU YOK.
  // Eksik kadro varsa mevcut oyuncularla devam edilir.
  if (!lineup.length) {
    return squad.slice(0, 11);
  }

  return lineup;
}

function getGoalkeeper(team) {
  const squad = getSquadPlayers(team);

  return (
    squad.find((p) => p.position === "KL") ||
    null
  );
}

function matchEvent(guild, match, scoringTeamIndex) {
  const team =
    scoringTeamIndex === 1
      ? match.team1Data
      : match.team2Data;

  const opponent =
    scoringTeamIndex === 1
      ? match.team2Data
      : match.team1Data;

  const scorer = chooseScorer(team);

  const goalkeeper = getGoalkeeper(opponent);
  const defender = chooseDefender(opponent);

  const scorerName = playerDisplay(guild, scorer);
  const keeperName = playerDisplay(guild, goalkeeper);
  const defenderName = playerDisplay(guild, defender);

  const roll = Math.random();

  if (roll < 0.72) {
    return {
      type: "goal",
      team: scoringTeamIndex,
      text: `⚽ **GOL!** ${scorerName} ağları buldu!`
    };
  }

  if (roll < 0.88 && goalkeeper) {
    return {
      type: "save",
      team: scoringTeamIndex,
      text: `🧤 ${keeperName} tehlikeli şutu kurtardı.`
    };
  }

  if (defender) {
    return {
      type: "block",
      team: scoringTeamIndex,
      text: `🛡️ ${defenderName} son anda müdahale etti.`
    };
  }

  return {
    type: "chance",
    team: scoringTeamIndex,
    text: `🔥 ${scorerName} gole yaklaştı.`
  };
}

function createLiveMatchEmbed(guild, match) {
  const team1Role = guild.roles.cache.get(match.team1);
  const team2Role = guild.roles.cache.get(match.team2);

  const team1Name = team1Role
    ? team1Role.name
    : "Takım 1";

  const team2Name = team2Role
    ? team2Role.name
    : "Takım 2";

  return new EmbedBuilder()
    .setTitle("⚽ AXERA LEAGUE • CANLI MAÇ")
    .setDescription(
      `**${team1Name}**  ${match.score1} - ${match.score2}  **${team2Name}**`
    )
    .addFields(
      {
        name: "⏱️ Maç Dakikası",
        value: `**${match.minute}'**`,
        inline: true
      },
      {
        name: "💰 Takım Değerleri",
        value:
          `${formatMoney(getTeamTotal(match.team1Data))}\n` +
          `${formatMoney(getTeamTotal(match.team2Data))}`,
        inline: true
      },
      {
        name: "📋 Son Olay",
        value: match.lastEvent || "Maç başladı.",
        inline: false
      }
    )
    .setFooter({
      text: "3 gerçek saniye = 1 maç dakikası • 90 dakika"
    })
    .setTimestamp();
}

async function sendOrEditMatchMessage(guild, match) {
  try {
    const channel = guild.channels.cache.get(CHANNELS.MAC);

    if (!channel || !channel.isTextBased()) return;

    const embed = createLiveMatchEmbed(guild, match);

    if (!match.messageId) {
      const msg = await channel.send({
        embeds: [embed]
      });

      match.messageId = msg.id;
      return;
    }

    try {
      const msg = await channel.messages.fetch(
        match.messageId
      );

      await msg.edit({
        embeds: [embed]
      });
    } catch {
      const msg = await channel.send({
        embeds: [embed]
      });

      match.messageId = msg.id;
    }
  } catch (err) {
    console.error("Maç mesajı:", err);
  }
}

async function finishMatch(guild, match, forcedScore = null) {
  if (match.finished) return;

  match.finished = true;

  const timer = activeMatchTimers.get(match.id);

  if (timer) {
    clearInterval(timer);
    activeMatchTimers.delete(match.id);
  }

  delete data.activeMatches[match.team1];
  delete data.activeMatches[match.team2];

  let score1 = match.score1;
  let score2 = match.score2;

  if (forcedScore) {
    score1 = forcedScore[0];
    score2 = forcedScore[1];
  }

  match.score1 = score1;
  match.score2 = score2;
  match.minute = 90;
  match.lastEvent = "🏁 Maç sona erdi.";

  if (score1 > score2) {
    updateStanding(
      guild.roles.cache.get(match.team1),
      "win"
    );

    updateStanding(
      guild.roles.cache.get(match.team2),
      "loss"
    );
  } else if (score2 > score1) {
    updateStanding(
      guild.roles.cache.get(match.team2),
      "win"
    );

    updateStanding(
      guild.roles.cache.get(match.team1),
      "loss"
    );
  } else {
    updateStanding(
      guild.roles.cache.get(match.team1),
      "draw"
    );

    updateStanding(
      guild.roles.cache.get(match.team2),
      "draw"
    );
  }

  addGoalsToStanding(
    guild.roles.cache.get(match.team1),
    score1,
    score2
  );

  addGoalsToStanding(
    guild.roles.cache.get(match.team2),
    score2,
    score1
  );

  match.finishedAt = new Date().toISOString();

  if (match.fixtureId) {
    const fixture = data.fixtures.find(
      (f) => f.id === match.fixtureId
    );

    if (fixture) {
      fixture.status = "TAMAMLANDI";
      fixture.score1 = score1;
      fixture.score2 = score2;
      fixture.finishedAt = match.finishedAt;
    }
  }

  saveData();

  await sendOrEditMatchMessage(guild, match);

  try {
    const channel = guild.channels.cache.get(CHANNELS.MAC);

    if (channel?.isTextBased()) {
      const team1Role = guild.roles.cache.get(match.team1);
      const team2Role = guild.roles.cache.get(match.team2);

      let resultText = "🤝 **MAÇ BERABERE!**";

      if (score1 > score2) {
        resultText = `🏆 **${team1Role?.name || "Takım 1"} KAZANDI!**`;
      } else if (score2 > score1) {
        resultText = `🏆 **${team2Role?.name || "Takım 2"} KAZANDI!**`;
      }

      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("🏁 MAÇ SONUCU")
            .setDescription(
              `**${team1Role?.name || "Takım 1"}** ` +
                `**${score1} - ${score2}** ` +
                `**${team2Role?.name || "Takım 2"}**\n\n` +
                resultText
            )
            .addFields(
              {
                name: "💰 Takım 1 Değeri",
                value: formatMoney(
                  getTeamTotal(match.team1Data)
                ),
                inline: true
              },
              {
                name: "💰 Takım 2 Değeri",
                value: formatMoney(
                  getTeamTotal(match.team2Data)
                ),
                inline: true
              }
            )
            .setTimestamp()
        ]
      });
    }
  } catch (err) {
    console.error("Maç sonu mesajı:", err);
  }

  await updateStandingsMessage(guild);
}

async function startMatch(
  guild,
  team1Role,
  team2Role,
  fixtureId = null
) {
  if (!team1Role || !team2Role) {
    return {
      ok: false,
      error: "İki takım da bulunamadı."
    };
  }

  if (team1Role.id === team2Role.id) {
    return {
      ok: false,
      error: "Bir takım kendisiyle maç yapamaz."
    };
  }

  if (
    data.activeMatches[team1Role.id] ||
    data.activeMatches[team2Role.id]
  ) {
    return {
      ok: false,
      error:
        "Takımlardan biri şu anda başka bir maçta."
    };
  }

  const team1Data = getTeamData(team1Role);
  const team2Data = getTeamData(team2Role);

  syncAllSquads();

  const matchId =
    `match_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

  const match = {
    id: matchId,
    team1: team1Role.id,
    team2: team2Role.id,
    team1Data,
    team2Data,
    score1: 0,
    score2: 0,
    minute: 0,
    lastEvent: "🟢 Maç başladı.",
    messageId: null,
    fixtureId,
    startedAt: new Date().toISOString(),
    finished: false
  };

  data.activeMatches[team1Role.id] = matchId;
  data.activeMatches[team2Role.id] = matchId;

  saveData();

  await sendOrEditMatchMessage(guild, match);

  let elapsedMinutes = 0;

  const timer = setInterval(async () => {
    try {
      if (match.finished) return;

      elapsedMinutes++;
      match.minute = elapsedMinutes;

      let event = null;

      const probability1 = goalProbability(
        match.team1Data,
        match.team2Data
      );

      const probability2 = goalProbability(
        match.team2Data,
        match.team1Data
      );

      const roll = Math.random();

      if (roll < probability1) {
        event = matchEvent(guild, match, 1);

        if (event.type === "goal") {
          match.score1++;
        }
      } else if (
        roll <
        probability1 + probability2
      ) {
        event = matchEvent(guild, match, 2);

        if (event.type === "goal") {
          match.score2++;
        }
      } else if (Math.random() < 0.08) {
        const randomTeam =
          Math.random() < 0.5 ? 1 : 2;

        event = matchEvent(
          guild,
          match,
          randomTeam
        );
      }

      if (event) {
        match.lastEvent = event.text;
      } else if (elapsedMinutes % 5 === 0) {
        match.lastEvent = "⚽ Mücadele devam ediyor...";
      }

      await sendOrEditMatchMessage(guild, match);

      if (elapsedMinutes >= 90) {
        await finishMatch(guild, match);
      }
    } catch (err) {
      console.error("Canlı maç döngüsü:", err);
    }
  }, 3000);

  activeMatchTimers.set(matchId, timer);

  return {
    ok: true,
    match
  };
}

function syncAllSquads() {
  for (const team of Object.values(data.teams)) {
    for (const player of team.squad || []) {
      player.value = getUserData(player.userId).value;
    }
  }

  saveData();
}

/* =========================
   KADRO GÖRÜNÜMÜ
========================= */

const PITCH_LAYOUTS = {
  "4-4-2": [
    ["SNT", "SNT"],
    ["SĞK", "MO", "MO", "SLK"],
    ["SĞB", "STP", "STP", "SLB"],
    ["KL"]
  ],
  "4-3-3": [
    ["SNT", "SNT", "SNT"],
    ["SĞK", "MO", "SLK"],
    ["SĞB", "STP", "STP", "SLB"],
    ["KL"]
  ],
  "4-2-3-1": [
    ["SNT"],
    ["SĞK", "MOO", "SLK"],
    ["MO", "MO"],
    ["SĞB", "STP", "STP", "SLB"],
    ["KL"]
  ],
  "3-5-2": [
    ["SNT", "SNT"],
    ["SĞK", "MO", "MOO", "MO", "SLK"],
    ["STP", "STP", "STP"],
    ["KL"]
  ],
  "3-4-3": [
    ["SNT", "SNT", "SNT"],
    ["SĞK", "MO", "MO", "SLK"],
    ["STP", "STP", "STP"],
    ["KL"]
  ],
  "4-3-1-2": [
    ["SNT", "SNT"],
    ["MOO"],
    ["SĞK", "MO", "SLK"],
    ["SĞB", "STP", "STP", "SLB"],
    ["KL"]
  ],
  "4-2-2-2": [
    ["SNT", "SNT"],
    ["MOO", "MOO"],
    ["MO", "MO"],
    ["SĞB", "STP", "STP", "SLB"],
    ["KL"]
  ],
  "5-3-2": [
    ["SNT", "SNT"],
    ["MO", "MO", "MO"],
    ["SĞB", "STP", "STP", "STP", "SLB"],
    ["KL"]
  ]
};

function renderPitch(team) {
  const byPosition = {};

  for (const pos of POSITION_LIST) {
    byPosition[pos] = [];
  }

  for (const player of team.squad || []) {
    if (!byPosition[player.position]) {
      byPosition[player.position] = [];
    }

    byPosition[player.position].push(player);
  }

  const usedIndex = {};

  for (const pos of POSITION_LIST) {
    usedIndex[pos] = 0;
  }

  const rows =
    PITCH_LAYOUTS[team.formation] ||
    PITCH_LAYOUTS["4-4-2"];

  const lines = [];

  lines.push("```text");
  lines.push("              ⚽ SAHA");
  lines.push("");

  for (const row of rows) {
    const cells = row.map((position) => {
      const list = byPosition[position] || [];
      const index = usedIndex[position] || 0;
      const player = list[index];

      usedIndex[position] = index + 1;

      if (!player) {
        return `[ ${position} • BOŞ ]`;
      }

      return `[ ${position} • ${player.value}M€ ]`;
    });

    lines.push(cells.join("     "));
    lines.push("");
  }

  lines.push("```");

  return lines.join("\n");
}

/* =========================
   KAYIT
========================= */

function registrationRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`register:${userId}:${ROLES.FUTBOLCU}`)
      .setLabel("Futbolcu")
      .setEmoji("⚽")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`register:${userId}:${ROLES.KALECI}`)
      .setLabel("Kaleci")
      .setEmoji("🧤")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(
        `register:${userId}:${ROLES.TEKNIK_DIREKTOR}`
      )
      .setLabel("Teknik Direktör")
      .setEmoji("📋")
      .setStyle(ButtonStyle.Secondary)
  );
}

/* =========================
   KOMUTLAR
========================= */

client.on("messageCreate", async (message) => {
  try {
    if (!message.guild) return;
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const parts = message.content.trim().split(/\s+/);
    const rawCommand = parts.shift() || "";
    const command = normalize(
      rawCommand.slice(PREFIX.length)
    );

    const args = parts;

    /* =====================
       YARDIM
    ===================== */

    if (
      command === "yardım" ||
      command === "yardim" ||
      command === "help"
    ) {
      const embed = new EmbedBuilder()
        .setTitle("📚 AXERA LEAGUE • KOMUTLAR")
        .addFields(
          {
            name: "👤 Kayıt",
            value:
              "`.k @Oyuncu İsim`\n" +
              "`.kayıtsızver @Oyuncu`"
          },
          {
            name: "⚽ Oyuncu",
            value:
              "`.ant` / `.antrenman`\n" +
              "`.pen` / `.penaltı`\n" +
              "`.dver @Oyuncu 5`\n" +
              "`.dsil @Oyuncu 5`\n" +
              "`.ara Oyuncu`"
          },
          {
            name: "💰 Kişisel Bütçe",
            value:
              "`.bütçe`\n" +
              "`.bütçe @Oyuncu`\n" +
              "`.gönder @Oyuncu 50M`\n" +
              "`.paraekle @Oyuncu 50M`\n" +
              "`.parasil @Oyuncu 20M`\n" +
              "`.paraayarla @Oyuncu 100M`"
          },
          {
            name: "🏟️ Takım",
            value:
              "`.takımekle @Takım`\n" +
              "`.takımkaldır @Takım`\n" +
              "`.takımdeğer @Takım 850`\n" +
              "`.kadroekle @Takım @Oyuncu SNT`\n" +
              "`.kadrocikar @Takım @Oyuncu`\n" +
              "`.kadro @Takım`\n" +
              "`.formasyon @Takım`"
          },
          {
            name: "🏆 Lig / Maç",
            value:
              "`.maç @Takım1 @Takım2`\n" +
              "`.puan`\n" +
              "`.puanekle @Takım 3`\n" +
              "`.fikstur`\n" +
              "`.fiksturekle @Takım1 @Takım2 2026-09-05 20:30`\n" +
              "`.fiksturcikar @Takım1 @Takım2`"
          },
          {
            name: "🛡️ Yönetim",
            value:
              "`.sil 100`\n" +
              "`.kick @Oyuncu`\n" +
              "`.ban @Oyuncu`\n" +
              "`.mute @Oyuncu`\n" +
              "`.unmute @Oyuncu`\n" +
              "`.embed Başlık | Açıklama`"
          },
          {
            name: "📰 Diğer",
            value: "`.tweet Mesaj`"
          }
        )
        .setFooter({
          text: "Axera League • Tüm veriler data.json'da korunur."
        });

      return message.reply({
        embeds: [embed]
      });
    }

    /* =====================
       KAYIT
    ===================== */

    if (command === "k") {
      if (!hasRole(message.member, ROLES.KAYIT_YETKILISI)) {
        return message.reply(
          "❌ Bu komutu sadece Kayıt Yetkilisi kullanabilir."
        );
      }

      if (!requireChannel(message, CHANNELS.KAYIT)) {
        return;
      }

      const target = getMentionedMember(message);

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.k @Oyuncu TakmaAdı`"
        );
      }

      let nickname = args
        .filter((x) => !x.includes(target.id))
        .join(" ")
        .trim();

      if (!nickname) {
        nickname = target.user.username;
      }

      if (!/M€$/i.test(nickname)) {
        nickname += " | 0M€";
      }

      if (nickname.length > 32) {
        return message.reply(
          "❌ Takma ad 32 karakterden uzun olamaz."
        );
      }

      if (!target.manageable) {
        return message.reply(
          "❌ Bu oyuncunun takma adını değiştiremiyorum."
        );
      }

      try {
        await target.setNickname(
          nickname,
          "Axera League kayıt"
        );
      } catch {
        return message.reply(
          "❌ Takma ad değiştirilemedi. Bot rol sırasını kontrol et."
        );
      }

      const userData = getUserData(target.id);
      const parsed = parseNicknameValue(nickname);

      if (parsed) {
        userData.value = parsed.value;
      }

      userData.training = 0;

      saveData();

      const embed = new EmbedBuilder()
        .setTitle("📋 AXERA LEAGUE • KAYIT")
        .setDescription(
          `**${target}** için kayıt türünü seçin.`
        )
        .addFields({
          name: "👤 Oyuncu",
          value: target.toString()
        })
        .setTimestamp();

      const panel = await message.channel.send({
        embeds: [embed],
        components: [registrationRow(target.id)]
      });

      data.registrationPanels[panel.id] = {
        userId: target.id
      };

      saveData();

      return;
    }

    if (
      command === "kayıtsızver" ||
      command === "kayitsizver"
    ) {
      if (!hasRole(message.member, ROLES.KAYIT_YETKILISI)) {
        return message.reply(
          "❌ Bu komutu sadece Kayıt Yetkilisi kullanabilir."
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
        await target.roles.remove(
          roleId,
          "Kayıtsız yapıldı"
        ).catch(() => {});
      }

      await target.roles.add(
        ROLES.KAYITSIZ,
        "Kayıtsız yapıldı"
      ).catch(() => {});

      return message.reply(
        `✅ ${target} **Kayıtsız** rolüne alındı.`
      );
    }

    /* =====================
       ANTRENMAN
    ===================== */

    if (
      command === "ant" ||
      command === "antrenman"
    ) {
      if (!requireChannel(message, CHANNELS.ANTRENMAN)) {
        return;
      }

      const user = getUserData(message.author.id);

      user.training++;

      if (user.training < 5) {
        saveData();

        return message.reply(
          `🏋️ Antrenman tamamlandı!\n\n**İlerleme:** ${user.training}/5`
        );
      }

      user.training = 0;

      const member = message.member;
      const current = parseNicknameValue(
        member.nickname || member.user.username
      );

      if (!current) {
        user.training = 4;
        saveData();

        return message.reply(
          "❌ Oyuncu değerinin bulunduğu `M€` biçimli takma ad bulunamadı. İlerleme kaybolmadı: **4/5**."
        );
      }

      const result = await updatePlayerNicknameValue(
        member,
        current.value + 5
      );

      if (!result.ok) {
        user.training = 4;
        saveData();

        return message.reply(
          `❌ Ödül verilemedi: ${result.error}\nİlerleme korunuyor: **4/5**`
        );
      }

      saveData();

      return message.reply(
        `🏋️ **ANTRENMAN TAMAMLANDI!**\n\n` +
          `🎁 Kazanç: **+5M€**\n` +
          `💰 Yeni değer: **${formatMoney(result.value)}**\n` +
          `🔄 İlerleme: **0/5**`
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
      if (!requireChannel(message, CHANNELS.PENALTI)) {
        return;
      }

      const result = Math.floor(Math.random() * 3);

      if (result === 0) {
        const current = parseNicknameValue(
          message.member.nickname ||
            message.member.user.username
        );

        if (!current) {
          return message.reply(
            "❌ Oyuncu değerinin bulunduğu `M€` biçimli takma ad bulunamadı."
          );
        }

        const updated =
          await updatePlayerNicknameValue(
            message.member,
            current.value + 5
          );

        if (!updated.ok) {
          return message.reply(
            `❌ Gol oldu ancak değer güncellenemedi: ${updated.error}`
          );
        }

        return message.reply(
          `⚽ **GOOOL!**\n\n` +
            `🧤 Rakip: **Axera Kalecisi**\n` +
            `🎁 Kazanç: **+5M€**\n` +
            `💰 Yeni değer: **${formatMoney(updated.value)}**`
        );
      }

      if (result === 1) {
        return message.reply(
          `🥅 **DİREK!**\n\n` +
            `🧤 Rakip: **Axera Kalecisi**\n` +
            `💰 Kazanç: **0M€**`
        );
      }

      return message.reply(
        `🧤 **KURTARDI!**\n\n` +
          `🧤 Rakip: **Axera Kalecisi**\n` +
          `💰 Kazanç: **0M€**`
      );
    }

    /* =====================
       DEĞER
    ===================== */

    if (command === "dver") {
      if (!hasRole(message.member, ROLES.DEGER_YETKILISI)) {
        return message.reply(
          "❌ Bu komutu sadece Değer Yetkilisi kullanabilir."
        );
      }

      const target = getMentionedMember(message);
      const amount = Number(
        String(args[1] || "").replace(",", ".")
      );

      if (!target || !Number.isFinite(amount) || amount <= 0) {
        return message.reply(
          "❌ Kullanım: `.dver @Oyuncu 5`"
        );
      }

      const current = parseNicknameValue(
        target.nickname || target.user.username
      );

      if (!current) {
        return message.reply(
          "❌ Oyuncunun takma adı `... | 1M€` biçiminde olmalıdır."
        );
      }

      const updated =
        await updatePlayerNicknameValue(
          target,
          current.value + amount
        );

      if (!updated.ok) {
        return message.reply(`❌ ${updated.error}`);
      }

      return message.reply(
        `✅ ${target} oyuncusuna **+${formatMoney(amount)}** değer verildi.\n` +
          `💰 Yeni değer: **${formatMoney(updated.value)}**`
      );
    }

    if (command === "dsil") {
      if (!hasRole(message.member, ROLES.DEGER_YETKILISI)) {
        return message.reply(
          "❌ Bu komutu sadece Değer Yetkilisi kullanabilir."
        );
      }

      const target = getMentionedMember(message);
      const amount = Number(
        String(args[1] || "").replace(",", ".")
      );

      if (!target || !Number.isFinite(amount) || amount <= 0) {
        return message.reply(
          "❌ Kullanım: `.dsil @Oyuncu 5`"
        );
      }

      const current = parseNicknameValue(
        target.nickname || target.user.username
      );

      if (!current) {
        return message.reply(
          "❌ Oyuncunun takma adı `... | 1M€` biçiminde olmalıdır."
        );
      }

      const newValue = Math.max(
        0,
        current.value - amount
      );

      const updated =
        await updatePlayerNicknameValue(
          target,
          newValue
        );

      if (!updated.ok) {
        return message.reply(`❌ ${updated.error}`);
      }

      return message.reply(
        `✅ ${target} oyuncusunun değeri **-${formatMoney(amount)}** değiştirildi.\n` +
          `💰 Yeni değer: **${formatMoney(updated.value)}**`
      );
    }

    /* =====================
       ARA
    ===================== */

    if (command === "ara") {
      const query = args.join(" ").trim();

      if (!query) {
        return message.reply(
          "❌ Kullanım: `.ara W.Sneijder`"
        );
      }

      const members = [...message.guild.members.cache.values()]
        .filter((m) => !m.user.bot);

      const q = normalize(query);

      function distance(a, b) {
        const matrix = Array.from(
          { length: b.length + 1 },
          () => []
        );

        for (let i = 0; i <= b.length; i++) {
          matrix[i][0] = i;
        }

        for (let j = 0; j <= a.length; j++) {
          matrix[0][j] = j;
        }

        for (let i = 1; i <= b.length; i++) {
          for (let j = 1; j <= a.length; j++) {
            matrix[i][j] =
              b[i - 1] === a[j - 1]
                ? matrix[i - 1][j - 1]
                : Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + 1
                  );
          }
        }

        return matrix[b.length][a.length];
      }

      let best = null;
      let bestScore = Infinity;

      for (const member of members) {
        const nickname = normalize(
          member.displayName
        );

        const username = normalize(
          member.user.username
        );

        let score;

        if (
          nickname === q ||
          username === q
        ) {
          score = -10000;
        } else if (
          nickname.includes(q) ||
          username.includes(q)
        ) {
          score = -5000 + Math.min(
            nickname.length,
            username.length
          );
        } else {
          score = Math.min(
            distance(q, nickname),
            distance(q, username)
          );
        }

        if (score < bestScore) {
          bestScore = score;
          best = member;
        }
      }

      if (!best) {
        return message.reply(
          "⚪ **BOŞ**\nAradığınız oyuncu bulunamadı."
        );
      }

      const parsed = parseNicknameValue(
        best.nickname || best.user.username
      );

      const embed = new EmbedBuilder()
        .setTitle("🔎 AXERA LEAGUE • OYUNCU ARAMA")
        .addFields(
          {
            name: "Aranan",
            value: query,
            inline: true
          },
          {
            name: "Oyuncu",
            value: best.toString(),
            inline: true
          },
          {
            name: "Takma Ad",
            value: best.displayName,
            inline: false
          },
          {
            name: "Değer",
            value: parsed
              ? formatMoney(parsed.value)
              : "Belirlenmemiş",
            inline: true
          },
          {
            name: "Durum",
            value: "🟢 DOLU",
            inline: true
          }
        )
        .setThumbnail(best.displayAvatarURL())
        .setTimestamp();

      return message.reply({
        embeds: [embed]
      });
    }

    /* =====================
       BÜTÇE
    ===================== */

    if (
      command === "bütçe" ||
      command === "butce"
    ) {
      const target =
        getMentionedMember(message) ||
        message.member;

      const budget = getUserData(target.id).budget;

      return message.reply(
        `💰 **${target.displayName}** kişisel bütçesi: **${formatMoney(
          budget
        )}**`
      );
    }

    if (
      command === "gönder" ||
      command === "gonder"
    ) {
      const target = getMentionedMember(message);
      const amount = parseMoney(args[1]);

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

      const sender = getUserData(message.author.id);
      const receiver = getUserData(target.id);

      if (sender.budget < amount) {
        return message.reply(
          `❌ Yetersiz bütçe.\nMevcut: **${formatMoney(
            sender.budget
          )}**`
        );
      }

      sender.budget -= amount;
      receiver.budget += amount;

      saveData();

      return message.reply(
        `💸 ${target} kişisine **${formatMoney(
          amount
        )}** gönderildi.\n\n` +
          `💰 Yeni bütçen: **${formatMoney(
            sender.budget
          )}**`
      );
    }

    if (command === "paraekle") {
      if (!hasRole(message.member, ROLES.DEGER_YETKILISI)) {
        return message.reply(
          "❌ Bu komutu sadece Değer Yetkilisi kullanabilir."
        );
      }

      const target = getMentionedMember(message);
      const amount = parseMoney(args[1]);

      if (!target || amount === null || amount <= 0) {
        return message.reply(
          "❌ Kullanım: `.paraekle @Oyuncu 50M`"
        );
      }

      const user = getUserData(target.id);

      user.budget += amount;

      saveData();

      return message.reply(
        `✅ ${target} bütçesine **+${formatMoney(
          amount
        )}** eklendi.\n` +
          `💰 Yeni bütçe: **${formatMoney(user.budget)}**`
      );
    }

    if (command === "parasil") {
      if (!hasRole(message.member, ROLES.DEGER_YETKILISI)) {
        return message.reply(
          "❌ Bu komutu sadece Değer Yetkilisi kullanabilir."
        );
      }

      const target = getMentionedMember(message);
      const amount = parseMoney(args[1]);

      if (!target || amount === null || amount <= 0) {
        return message.reply(
          "❌ Kullanım: `.parasil @Oyuncu 20M`"
        );
      }

      const user = getUserData(target.id);

      user.budget = Math.max(
        0,
        user.budget - amount
      );

      saveData();

      return message.reply(
        `✅ ${target} bütçesinden **${formatMoney(
          amount
        )}** çıkarıldı.\n` +
          `💰 Yeni bütçe: **${formatMoney(user.budget)}**`
      );
    }

    if (command === "paraayarla") {
      if (!hasRole(message.member, ROLES.DEGER_YETKILISI)) {
        return message.reply(
          "❌ Bu komutu sadece Değer Yetkilisi kullanabilir."
        );
      }

      const target = getMentionedMember(message);
      const amount = parseMoney(args[1]);

      if (!target || amount === null || amount < 0) {
        return message.reply(
          "❌ Kullanım: `.paraayarla @Oyuncu 100M`"
        );
      }

      const user = getUserData(target.id);

      user.budget = amount;

      saveData();

      return message.reply(
        `✅ ${target} bütçesi **${formatMoney(
          amount
        )}** olarak ayarlandı.`
      );
    }

    /* =====================
       TAKIM EKLE
    ===================== */

    if (command === "takımekle") {
      if (!hasRole(message.member, ROLES.MAC_YETKILISI)) {
        return message.reply(
          "❌ Bu komutu sadece Maç Yetkilisi kullanabilir."
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
          "❌ Bu takım zaten sistemde."
        );
      }

      data.teams[role.id] = {
        name: role.name,
        formation: "4-4-2",
        manualValue: 0,
        squad: []
      };

      data.standings[role.id] = {
        teamId: role.id,
        name: role.name,
        O: 0,
        G: 0,
        B: 0,
        M: 0,
        AG: 0,
        YG: 0,
        AV: 0,
        P: 0
      };

      saveData();
      await updateStandingsMessage(message.guild);

      return message.reply(
        `✅ ${role} lige eklendi.`
      );
    }

    /* =====================
       TAKIM KALDIR
    ===================== */

    if (
      command === "takımkaldır" ||
      command === "takimkaldir" ||
      command === "takımkaldir" ||
      command === "takimkaldır"
    ) {
      if (!hasRole(message.member, ROLES.MAC_YETKILISI)) {
        return message.reply(
          "❌ Bu komutu sadece Maç Yetkilisi kullanabilir."
        );
      }

      const role = getMentionedRole(message);

      if (!role) {
        return message.reply(
          "❌ Kullanım: `.takımkaldır @Takım`"
        );
      }

      if (data.activeMatches[role.id]) {
        return message.reply(
          "❌ Bu takım şu anda maçta olduğu için kaldırılamaz."
        );
      }

      delete data.teams[role.id];
      delete data.standings[role.id];

      data.fixtures = data.fixtures.filter(
        (f) =>
          f.team1 !== role.id &&
          f.team2 !== role.id
      );

      saveData();
      await updateStandingsMessage(message.guild);

      return message.reply(
        `✅ ${role} sistemden kaldırıldı.`
      );
    }

    /* =====================
       TAKIM DEĞERİ
    ===================== */

    if (command === "takımdeğer") {
      if (!hasRole(message.member, ROLES.MAC_YETKILISI)) {
        return message.reply(
          "❌ Bu komutu sadece Maç Yetkilisi kullanabilir."
        );
      }

      const role = getMentionedRole(message);
      const amount = parseMoney(args[1]);

      if (!role || amount === null) {
        return message.reply(
          "❌ Kullanım: `.takımdeğer @Takım 850`"
        );
      }

      const team = getTeamData(role);

      team.manualValue = amount;

      saveData();

      return message.reply(
        `✅ ${role} takımının temel değeri **${formatMoney(
          amount
        )}** olarak ayarlandı.\n` +
          `💰 Toplam takım değeri: **${formatMoney(
            getTeamTotal(team)
          )}**`
      );
    }

    /* =====================
       KADRO EKLE
    ===================== */

    if (command === "kadroekle") {
      if (!hasRole(message.member, ROLES.MAC_YETKILISI)) {
        return message.reply(
          "❌ Bu komutu sadece Maç Yetkilisi kullanabilir."
        );
      }

      const teamRole = getMentionedRole(message);
      const player = getMentionedMember(message);

      const positionRaw = args[2] || "";
      const position = positionRaw.toUpperCase();

      if (
        !teamRole ||
        !player ||
        !POSITION_LIST.includes(position)
      ) {
        return message.reply(
          "❌ Kullanım: `.kadroekle @Takım @Oyuncu SNT`\n" +
            `Pozisyonlar: ${POSITION_LIST.join(", ")}`
        );
      }

      const team = getTeamData(teamRole);

      if (
        team.squad.some(
          (p) => p.userId === player.id
        )
      ) {
        return message.reply(
          "❌ Bu oyuncu zaten takım kadrosunda."
        );
      }

      const parsed = parseNicknameValue(
        player.nickname || player.user.username
      );

      if (!parsed) {
        return message.reply(
          "❌ Oyuncunun takma adında `M€` değeri bulunamadı."
        );
      }

      team.squad.push({
        userId: player.id,
        position,
        value: parsed.value
      });

      getUserData(player.id).value = parsed.value;

      saveData();

      return message.reply(
        `✅ ${player} kadroya eklendi.\n` +
          `📍 Pozisyon: **${position}**\n` +
          `💰 Oyuncu değeri: **${formatMoney(
            parsed.value
          )}**\n` +
          `🏟️ Takım toplamı: **${formatMoney(
            getTeamTotal(team)
          )}**`
      );
    }

    /* =====================
       KADRO ÇIKAR
    ===================== */

    if (
      command === "kadrocikar" ||
      command === "kadroçıkar" ||
      command === "kadroçikar"
    ) {
      if (!hasRole(message.member, ROLES.MAC_YETKILISI)) {
        return message.reply(
          "❌ Bu komutu sadece Maç Yetkilisi kullanabilir."
        );
      }

      const teamRole = getMentionedRole(message);
      const player = getMentionedMember(message);

      if (!teamRole || !player) {
        return message.reply(
          "❌ Kullanım: `.kadrocikar @Takım @Oyuncu`"
        );
      }

      const team = getTeamData(teamRole);

      const before = team.squad.length;

      team.squad = team.squad.filter(
        (p) => p.userId !== player.id
      );

      if (before === team.squad.length) {
        return message.reply(
          "❌ Bu oyuncu takım kadrosunda bulunmuyor."
        );
      }

      saveData();

      return message.reply(
        `✅ ${player} kadrodan çıkarıldı.\n` +
          `💰 Yeni takım değeri: **${formatMoney(
            getTeamTotal(team)
          )}**`
      );
    }

    /* =====================
       KADRO GÖRÜNTÜLE
    ===================== */

    if (command === "kadro") {
      const role = getMentionedRole(message);

      if (!role) {
        return message.reply(
          "❌ Kullanım: `.kadro @Takım`"
        );
      }

      const team = getTeamData(role);

      syncAllSquads();

      const embed = new EmbedBuilder()
        .setTitle(`🏟️ ${role.name} • KADRO`)
        .setDescription(
          `${renderPitch(team)}`
        )
        .addFields(
          {
            name: "📐 Formasyon",
            value: team.formation,
            inline: true
          },
          {
            name: "👥 Oyuncu",
            value: `${team.squad.length}`,
            inline: true
          },
          {
            name: "💰 Toplam Değer",
            value: formatMoney(
              getTeamTotal(team)
            ),
            inline: true
          }
        )
        .setTimestamp();

      return message.reply({
        embeds: [embed]
      });
    }

    /* =====================
       FORMASYON
    ===================== */

    if (command === "formasyon") {
      if (!hasRole(message.member, ROLES.MAC_YETKILISI)) {
        return message.reply(
          "❌ Bu komutu sadece Maç Yetkilisi kullanabilir."
        );
      }

      const role = getMentionedRole(message);

      if (!role) {
        return message.reply(
          "❌ Kullanım: `.formasyon @Takım`"
        );
      }

      if (!data.teams[role.id]) {
        return message.reply(
          "❌ Bu takım sistemde kayıtlı değil."
        );
      }

      const menu = new StringSelectMenuBuilder()
        .setCustomId(`formation:${role.id}`)
        .setPlaceholder("Formasyon seç...")
        .addOptions(
          Object.keys(FORMATIONS).map(
            (formation) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(formation)
                .setValue(formation)
                .setDescription(
                  `${formation} formasyonu`
                )
          )
        );

      return message.reply({
        content: `📐 **${role.name}** için formasyon seç:`,
        components: [
          new ActionRowBuilder().addComponents(menu)
        ]
      });
    }

    /* =====================
       MAÇ
    ===================== */

    if (command === "maç" || command === "mac") {
      if (!hasRole(message.member, ROLES.MAC_YETKILISI)) {
        return message.reply(
          "❌ Bu komutu sadece Maç Yetkilisi kullanabilir."
        );
      }

      if (!requireChannel(message, CHANNELS.MAC)) {
        return;
      }

      const team1 = getMentionedRole(message, 0);
      const team2 = getMentionedRole(message, 1);

      if (!team1 || !team2) {
        return message.reply(
          "❌ Kullanım: `.maç @Takım1 @Takım2`"
        );
      }

      if (
        !data.teams[team1.id] ||
        !data.teams[team2.id]
      ) {
        return message.reply(
          "❌ İki takımın da sistemde kayıtlı olması gerekiyor."
        );
      }

      const result = await startMatch(
        message.guild,
        team1,
        team2
      );

      if (!result.ok) {
        return message.reply(
          `❌ ${result.error}`
        );
      }

      return;
    }

    /* =====================
       PUAN
    ===================== */

    if (command === "puan") {
      return message.reply({
        embeds: [
          createStandingsEmbed(message.guild)
        ]
      });
    }

    /* =====================
       PUAN EKLE
    ===================== */

    if (command === "puanekle") {
      if (!hasRole(message.member, ROLES.MAC_YETKILISI)) {
        return message.reply(
          "❌ Bu komutu sadece Maç Yetkilisi kullanabilir."
        );
      }

      const role = getMentionedRole(message);
      const amount = Number(args[1]);

      if (
        !role ||
        !Number.isInteger(amount) ||
        amount <= 0
      ) {
        return message.reply(
          "❌ Kullanım: `.puanekle @Takım 3`"
        );
      }

      const s = standingsEntry(role);

      s.P += amount;

      saveData();
      await updateStandingsMessage(message.guild);

      return message.reply(
        `✅ ${role} takımına **${amount} puan** eklendi.\n` +
          `🏆 Yeni puan: **${s.P}**`
      );
    }

    /* =====================
       FİKSTÜR EKLE
    ===================== */

    if (command === "fiksturekle") {
      if (!hasRole(message.member, ROLES.MAC_YETKILISI)) {
        return message.reply(
          "❌ Bu komutu sadece Maç Yetkilisi kullanabilir."
        );
      }

      const team1 = getMentionedRole(message, 0);
      const team2 = getMentionedRole(message, 1);

      const dateMatch =
        message.content.match(
          /(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/
        );

      if (!team1 || !team2 || !dateMatch) {
        return message.reply(
          "❌ Kullanım:\n`.fiksturekle @Takım1 @Takım2 2026-09-05 20:30`"
        );
      }

      if (
        !data.teams[team1.id] ||
        !data.teams[team2.id]
      ) {
        return message.reply(
          "❌ İki takım da sistemde kayıtlı olmalı."
        );
      }

      const date = dateMatch[1];
      const time = dateMatch[2];

      if (!validateDateTime(date, time)) {
        return message.reply(
          "❌ Geçersiz tarih veya saat."
        );
      }

      const duplicate = data.fixtures.find(
        (f) =>
          f.status === "BEKLIYOR" &&
          f.team1 === team1.id &&
          f.team2 === team2.id &&
          f.date === date &&
          f.time === time
      );

      if (duplicate) {
        return message.reply(
          "❌ Aynı fikstür zaten mevcut."
        );
      }

      const fixture = {
        id: data.nextFixtureId++,
        team1: team1.id,
        team2: team2.id,
        date,
        time,
        status: "BEKLIYOR",
        score1: null,
        score2: null,
        startedAt: null,
        finishedAt: null
      };

      data.fixtures.push(fixture);

      saveData();

      return message.reply(
        `✅ Fikstür eklendi.\n\n` +
          `${team1} **vs** ${team2}\n` +
          `📅 ${date} ${time}\n` +
          `🌍 Saat dilimi: ${TIME_ZONE}`
      );
    }

    /* =====================
       FİKSTÜR GÖRÜNTÜLE
    ===================== */

    if (command === "fikstur") {
      return message.reply({
        embeds: [
          createFixtureEmbed(message.guild)
        ]
      });
    }

    /* =====================
       FİKSTÜR ÇIKAR
    ===================== */

    if (
      command === "fiksturcikar" ||
      command === "fikstürçıkar" ||
      command === "fikstürcikar" ||
      command === "fiksturçıkar"
    ) {
      if (!hasRole(message.member, ROLES.MAC_YETKILISI)) {
        return message.reply(
          "❌ Bu komutu sadece Maç Yetkilisi kullanabilir."
        );
      }

      const team1 = getMentionedRole(message, 0);
      const team2 = getMentionedRole(message, 1);

      if (!team1 || !team2) {
        return message.reply(
          "❌ Kullanım: `.fiksturcikar @Takım1 @Takım2`"
        );
      }

      const dateMatch =
        message.content.match(
          /(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/
        );

      let candidates = pendingFixtureForTeams(
        team1.id,
        team2.id
      );

      if (dateMatch) {
        candidates = candidates.filter(
          (f) =>
            f.date === dateMatch[1] &&
            f.time === dateMatch[2]
        );
      }

      if (!candidates.length) {
        return message.reply(
          "❌ Silinecek bekleyen fikstür bulunamadı."
        );
      }

      if (
        candidates.length > 1 &&
        !dateMatch
      ) {
        return message.reply(
          "❌ Bu iki takım arasında birden fazla fikstür var. Tarih ve saat de belirt."
        );
      }

      const fixture = candidates[0];

      data.fixtures = data.fixtures.filter(
        (f) => f.id !== fixture.id
      );

      saveData();

      return message.reply(
        `✅ Fikstür kaldırıldı:\n` +
          `${team1} **vs** ${team2}\n` +
          `📅 ${fixture.date} ${fixture.time}`
      );
    }

    /* =====================
       TWEET
    ===================== */

    if (command === "tweet") {
      const text = args.join(" ").trim();

      if (!text) {
        return message.reply(
          "❌ Kullanım: `.tweet Mesaj`"
        );
      }

      const embed = new EmbedBuilder()
        .setAuthor({
          name: message.member.displayName,
          iconURL: message.author.displayAvatarURL()
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

    /* =====================
       EMBED
    ===================== */

    if (command === "embed") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Bu komutu sadece Yönetici kullanabilir."
        );
      }

      const raw = args.join(" ");
      const split = raw.indexOf("|");

      if (split === -1) {
        return message.reply(
          "❌ Kullanım: `.embed Başlık | Açıklama`"
        );
      }

      const title = raw.slice(0, split).trim();
      const description = raw
        .slice(split + 1)
        .trim();

      if (!title || !description) {
        return message.reply(
          "❌ Başlık ve açıklama boş olamaz."
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

    /* =====================
       SİL
    ===================== */

    if (command === "sil") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Bu komutu sadece Yönetici kullanabilir."
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

      let deleted = 0;

      while (deleted < amount) {
        const remaining = amount - deleted;

        const messages =
          await message.channel.messages.fetch({
            limit: Math.min(100, remaining)
          });

        if (!messages.size) break;

        const bulk = messages.filter(
          (m) =>
            Date.now() - m.createdTimestamp <
            14 * 24 * 60 * 60 * 1000
        );

        if (!bulk.size) break;

        const result =
          await message.channel.bulkDelete(
            bulk,
            true
          ).catch(() => null);

        if (!result || !result.size) break;

        deleted += result.size;

        if (result.size < bulk.size) break;
      }

      return message.channel.send(
        `🗑️ **${deleted}** mesaj silindi.`
      );
    }

    /* =====================
       KICK
    ===================== */

    if (command === "kick") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Bu komutu sadece Yönetici kullanabilir."
        );
      }

      const target = getMentionedMember(message);

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.kick @Oyuncu`"
        );
      }

      if (!target.kickable) {
        return message.reply(
          "❌ Bu oyuncuyu atamıyorum."
        );
      }

      await target.kick(
        `Axera League - ${message.author.tag}`
      );

      return message.reply(
        `👢 ${target.user.tag} sunucudan atıldı.`
      );
    }

    /* =====================
       BAN
    ===================== */

    if (command === "ban") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Bu komutu sadece Yönetici kullanabilir."
        );
      }

      const target = getMentionedMember(message);

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.ban @Oyuncu`"
        );
      }

      if (!target.bannable) {
        return message.reply(
          "❌ Bu oyuncuyu yasaklayamıyorum."
        );
      }

      await target.ban({
        reason: `Axera League - ${message.author.tag}`
      });

      return message.reply(
        `🔨 ${target.user.tag} sunucudan yasaklandı.`
      );
    }

    /* =====================
       MUTE
    ===================== */

    if (command === "mute") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Bu komutu sadece Yönetici kullanabilir."
        );
      }

      const target = getMentionedMember(message);

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.mute @Oyuncu`"
        );
      }

      await target.timeout(
        10 * 60 * 1000,
        `Axera League - ${message.author.tag}`
      );

      return message.reply(
        `🔇 ${target} **10 dakika** susturuldu.`
      );
    }

    /* =====================
       UNMUTE
    ===================== */

    if (command === "unmute") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Bu komutu sadece Yönetici kullanabilir."
        );
      }

      const target = getMentionedMember(message);

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.unmute @Oyuncu`"
        );
      }

      await target.timeout(
        null,
        `Axera League - ${message.author.tag}`
      );

      return message.reply(
        `🔊 ${target} susturması kaldırıldı.`
      );
    }
  } catch (err) {
    console.error("messageCreate hatası:", err);

    try {
      await message.reply(
        "❌ İşlem sırasında bir hata oluştu."
      );
    } catch {}
  }
});

/* =========================
   BUTON / MENÜ
========================= */

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isButton()) {
      if (
        interaction.customId.startsWith(
          "register:"
        )
      ) {
        const [, userId, roleId] =
          interaction.customId.split(":");

        if (
          !hasRole(
            interaction.member,
            ROLES.KAYIT_YETKILISI
          )
        ) {
          return interaction.reply({
            content:
              "❌ Bu butonu sadece Kayıt Yetkilisi kullanabilir.",
            ephemeral: true
          });
        }

        if (interaction.user.id !== userId) {
          return interaction.reply({
            content:
              "❌ Bu kayıt paneli başka bir oyuncuya ait.",
            ephemeral: true
          });
        }

        const member =
          interaction.guild.members.cache.get(
            userId
          );

        if (!member) {
          return interaction.reply({
            content:
              "❌ Oyuncu artık sunucuda bulunmuyor.",
            ephemeral: true
          });
        }

        const validRoles = [
          ROLES.FUTBOLCU,
          ROLES.KALECI,
          ROLES.TEKNIK_DIREKTOR
        ];

        if (!validRoles.includes(roleId)) {
          return interaction.reply({
            content:
              "❌ Geçersiz kayıt seçimi.",
            ephemeral: true
          });
        }

        for (const role of validRoles) {
          await member.roles.remove(
            role,
            "Kayıt rolü değiştirildi"
          ).catch(() => {});
        }

        await member.roles.remove(
          ROLES.KAYITSIZ,
          "Kayıt tamamlandı"
        ).catch(() => {});

        await member.roles.add(
          roleId,
          "Axera League kayıt"
        );

        getUserData(member.id).registrationRole =
          roleId;

        saveData();

        const labels = {
          [ROLES.FUTBOLCU]: "⚽ Futbolcu",
          [ROLES.KALECI]: "🧤 Kaleci",
          [ROLES.TEKNIK_DIREKTOR]:
            "📋 Teknik Direktör"
        };

        const disabledRow =
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(
                `disabled:${userId}:1`
              )
              .setLabel("Futbolcu")
              .setEmoji("⚽")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(true),

            new ButtonBuilder()
              .setCustomId(
                `disabled:${userId}:2`
              )
              .setLabel("Kaleci")
              .setEmoji("🧤")
              .setStyle(ButtonStyle.Success)
              .setDisabled(true),

            new ButtonBuilder()
              .setCustomId(
                `disabled:${userId}:3`
              )
              .setLabel("Teknik Direktör")
              .setEmoji("📋")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          );

        await interaction.update({
          content: `✅ ${member} kaydı tamamlandı: **${labels[roleId]}**`,
          components: [disabledRow]
        });

        const chat =
          interaction.guild.channels.cache.get(
            CHANNELS.SOHBET
          );

        if (chat?.isTextBased()) {
          await chat.send(
            `🎉 ${member} **${labels[roleId]}** olarak Axera League'e kaydedildi!`
          );
        }

        return;
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (
        interaction.customId.startsWith(
          "formation:"
        )
      ) {
        const teamId =
          interaction.customId.split(":")[1];

        if (
          !hasRole(
            interaction.member,
            ROLES.MAC_YETKILISI
          )
        ) {
          return interaction.reply({
            content:
              "❌ Bu menüyü sadece Maç Yetkilisi kullanabilir.",
            ephemeral: true
          });
        }

        const formation =
          interaction.values[0];

        if (!FORMATIONS[formation]) {
          return interaction.reply({
            content:
              "❌ Geçersiz formasyon.",
            ephemeral: true
          });
        }

        const role =
          interaction.guild.roles.cache.get(
            teamId
          );

        if (!role) {
          return interaction.reply({
            content:
              "❌ Takım bulunamadı.",
            ephemeral: true
          });
        }

        const team = getTeamData(role);

        team.formation = formation;

        saveData();

        return interaction.update({
          content:
            `✅ **${role.name}** formasyonu **${formation}** olarak ayarlandı.`,
          components: []
        });
      }
    }
  } catch (err) {
    console.error("interactionCreate hatası:", err);

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content:
            "❌ İşlem sırasında bir hata oluştu.",
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content:
            "❌ İşlem sırasında bir hata oluştu.",
          ephemeral: true
        });
      }
    } catch {}
  }
});

/* =========================
   YENİ ÜYE
========================= */

client.on("guildMemberAdd", async (member) => {
  try {
    const channel =
      member.guild.channels.cache.get(
        CHANNELS.KAYIT
      );

    if (!channel?.isTextBased()) return;

    await channel.send(
      `👋 ${member} **hoşgeldin sunucumuza!**\n` +
        `📋 <@&${ROLES.KAYIT_YETKILISI}> seninle ilgilenecektir.`
    );

    getUserData(member.id);
    saveData();
  } catch (err) {
    console.error("guildMemberAdd:", err);
  }
});

/* =========================
   FİKSTÜR OTOMATİĞİ
========================= */

let fixtureSchedulerRunning = false;

async function checkFixtures() {
  if (fixtureSchedulerRunning) return;

  fixtureSchedulerRunning = true;

  try {
    const guilds = client.guilds.cache;

    const nowKey = getLocalDateTimeKey(
      new Date()
    );

    for (const guild of guilds.values()) {
      const pending = data.fixtures.filter(
        (f) =>
          f.status === "BEKLIYOR" &&
          `${f.date} ${f.time}` <= nowKey
      );

      for (const fixture of pending) {
        const team1 =
          guild.roles.cache.get(fixture.team1);

        const team2 =
          guild.roles.cache.get(fixture.team2);

        if (!team1 || !team2) {
          fixture.status = "HATA";
          saveData();
          continue;
        }

        if (
          data.activeMatches[team1.id] ||
          data.activeMatches[team2.id]
        ) {
          continue;
        }

        fixture.status = "BAŞLIYOR";
        fixture.startedAt =
          new Date().toISOString();

        saveData();

        const result = await startMatch(
          guild,
          team1,
          team2,
          fixture.id
        );

        if (!result.ok) {
          fixture.status = "HATA";
          saveData();
        }
      }
    }
  } catch (err) {
    console.error("Fikstür kontrolü:", err);
  } finally {
    fixtureSchedulerRunning = false;
  }
}

/* =========================
   HATA YÖNETİMİ
========================= */

process.on(
  "unhandledRejection",
  (reason) => {
    console.error(
      "UNHANDLED REJECTION:",
      reason
    );
  }
);

process.on(
  "uncaughtException",
  (error) => {
    console.error(
      "UNCAUGHT EXCEPTION:",
      error
    );
  }
);

/* =========================
   READY
========================= */

client.once("ready", async () => {
  console.log(
    `✅ Axera League bot aktif: ${client.user.tag}`
  );

  console.log(
    `🌍 Zaman dilimi: ${TIME_ZONE}`
  );

  console.log(
    `💾 data.json yüklendi. Kullanıcı: ${
      Object.keys(data.users).length
    } | Takım: ${
      Object.keys(data.teams).length
    } | Fikstür: ${
      data.fixtures.length
    }`
  );

  for (const guild of client.guilds.cache.values()) {
    await updateStandingsMessage(guild);
  }

  setInterval(
    checkFixtures,
    1000
  );
});

/* =========================
   LOGIN
========================= */

if (!TOKEN) {
  console.error(
    "❌ TOKEN bulunamadı! Railway Variables kısmına TOKEN ekle."
  );
} else {
  client.login(TOKEN).catch((err) => {
    console.error(
      "❌ Discord giriş hatası:",
      err
    );
  });
}
