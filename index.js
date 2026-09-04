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
} = require("discord.js");

const fs = require("fs");
const path = require("path");

/* =========================================================
   AXERA LEAGUE - FULL DISCORD BOT
   Discord.js v14
========================================================= */

const TOKEN = process.env.TOKEN;
const TIME_ZONE = process.env.TIME_ZONE || "Europe/Istanbul";

if (!TOKEN) {
  console.error("TOKEN bulunamadı.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.GuildMember, Partials.User],
});

/* =========================================================
   IDLER
========================================================= */

const ROLES = {
  FUTBOLCU: "1534457228986421278",
  KALECI: "1534492034243498195",
  KAYITSIZ: "1534457560134844517",
  TD: "1534456648930693120",
  KAYIT: "1534456315366342716",
  DEGER: "1534456192913375382",
  MAC: "1535251168169697390",
};

const CHANNELS = {
  KAYIT: "1534460177884123276",
  SOHBET: "1534469475917758586",
  ANTRENMAN: "1534474070798762197",
  PENALTI: "1534474327812997192",
  MAC: "1534477626872168541",
  PUAN: "1534475991404253284",
};

/* =========================================================
   VERİTABANI
========================================================= */

const DATA_FILE = path.join(__dirname, "data.json");

const EMPTY_DATA = {
  users: {},
  teams: {},
  standings: {},
  fixtures: [],
  standingsMessageId: null,
};

let db;

function loadDB() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      db = JSON.parse(JSON.stringify(EMPTY_DATA));
      saveDB();
      return;
    }

    db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

    db.users = db.users || {};
    db.teams = db.teams || {};
    db.standings = db.standings || {};
    db.fixtures = Array.isArray(db.fixtures) ? db.fixtures : [];
    db.standingsMessageId = db.standingsMessageId || null;

    for (const user of Object.values(db.users)) {
      user.value = Number(user.value) || 0;
      user.budget = Number(user.budget) || 0;
      user.training = Number(user.training) || 0;
    }

    for (const team of Object.values(db.teams)) {
      team.manualValue = Number(team.manualValue) || 0;
      team.formation = team.formation || "4-4-2";
      team.squad = team.squad || {};
    }
  } catch (error) {
    console.error("data.json bozuk, sıfırlanıyor:", error);
    db = JSON.parse(JSON.stringify(EMPTY_DATA));
    saveDB();
  }
}

function saveDB() {
  try {
    const temp = DATA_FILE + ".tmp";
    fs.writeFileSync(temp, JSON.stringify(db, null, 2), "utf8");
    fs.renameSync(temp, DATA_FILE);
  } catch (error) {
    console.error("Veri kaydetme hatası:", error);
  }
}

loadDB();

/* =========================================================
   GENEL FONKSİYONLAR
========================================================= */

function isAdmin(member) {
  return !!member &&
    member.permissions &&
    member.permissions.has(PermissionFlagsBits.Administrator);
}

function hasRole(member, roleId) {
  return !!member && member.roles.cache.has(roleId);
}

function hasPermissionRole(member, roleId) {
  return isAdmin(member) || hasRole(member, roleId);
}

function getUserData(userId) {
  if (!db.users[userId]) {
    db.users[userId] = {
      value: 0,
      budget: 0,
      training: 0,
    };
  }

  db.users[userId].value = Number(db.users[userId].value) || 0;
  db.users[userId].budget = Number(db.users[userId].budget) || 0;
  db.users[userId].training = Number(db.users[userId].training) || 0;

  return db.users[userId];
}

function formatMoney(value) {
  const n = Number(value) || 0;

  if (Number.isInteger(n)) {
    return `${n.toLocaleString("tr-TR")}M€`;
  }

  return `${n.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}M€`;
}

function parseMoney(value) {
  if (value === undefined || value === null) return NaN;

  let text = String(value)
    .trim()
    .toUpperCase()
    .replace(/€/g, "")
    .replace(/\s/g, "");

  if (text.endsWith("M")) {
    text = text.slice(0, -1);
  }

  text = text.replace(",", ".");

  const result = Number(text);

  return Number.isFinite(result) ? result : NaN;
}

function getMentionedMember(message) {
  return message.mentions.members.first() || null;
}

function getMentionedRole(message) {
  return message.mentions.roles.first() || null;
}

function getNicknameValue(member) {
  const nickname = member.nickname || member.user.username;

  const match = nickname.match(/(\d+(?:[.,]\d+)?)M€\s*$/i);

  if (!match) return null;

  return Number(match[1].replace(",", "."));
}

function getPlayerValue(member) {
  const user = getUserData(member.id);

  const nicknameValue = getNicknameValue(member);

  if (nicknameValue !== null && user.value === 0) {
    user.value = nicknameValue;
    saveDB();
  }

  return user.value;
}

async function changePlayerValue(member, amount) {
  if (!member || !member.manageable) {
    return {
      ok: false,
      error: "Bot bu oyuncunun takma adını değiştiremiyor.",
    };
  }

  const current = getPlayerValue(member);
  const next = current + Number(amount);

  if (!Number.isFinite(next)) {
    return {
      ok: false,
      error: "Geçersiz değer.",
    };
  }

  if (next < 0) {
    return {
      ok: false,
      error: "Oyuncu değeri 0M€ altına düşemez.",
    };
  }

  const oldNick = member.nickname || member.user.username;

  const match = oldNick.match(/(\d+(?:[.,]\d+)?)M€\s*$/i);

  if (!match) {
    return {
      ok: false,
      error: "Oyuncu takma adının sonunda M€ değeri bulunamadı.",
    };
  }

  const newNick =
    oldNick.substring(0, match.index) +
    formatMoney(next);

  if (newNick.length > 32) {
    return {
      ok: false,
      error: "Yeni takma ad 32 karakter sınırını aşıyor.",
    };
  }

  try {
    await member.setNickname(newNick);

    const user = getUserData(member.id);
    user.value = next;

    syncPlayerInTeams(member);

    saveDB();

    return {
      ok: true,
      value: next,
      nickname: newNick,
    };
  } catch (error) {
    console.error("Değer değiştirme:", error);

    return {
      ok: false,
      error:
        "Takma ad değiştirilemedi. Botun Takma Adları Yönet yetkisini ve rol sırasını kontrol et.",
    };
  }
}

/* =========================================================
   POZİSYONLAR
========================================================= */

const POSITIONS = [
  "KL",
  "STP",
  "SĞB",
  "SLB",
  "MO",
  "MOO",
  "SĞK",
  "SLK",
  "SNT",
];

/* =========================================================
   FORMASYONLAR
========================================================= */

const FORMATIONS = {
  "4-4-2": {
    KL: 1,
    STP: 2,
    SĞB: 1,
    SLB: 1,
    MO: 2,
    SĞK: 1,
    SLK: 1,
    SNT: 2,
  },

  "4-3-3": {
    KL: 1,
    STP: 2,
    SĞB: 1,
    SLB: 1,
    MO: 3,
    SĞK: 1,
    SLK: 1,
    SNT: 1,
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
    SNT: 1,
  },

  "3-5-2": {
    KL: 1,
    STP: 3,
    MO: 2,
    MOO: 1,
    SĞK: 1,
    SLK: 1,
    SNT: 2,
  },

  "3-4-3": {
    KL: 1,
    STP: 3,
    MO: 2,
    SĞK: 1,
    SLK: 1,
    SNT: 3,
  },

  "4-3-1-2": {
    KL: 1,
    STP: 2,
    SĞB: 1,
    SLB: 1,
    MO: 3,
    MOO: 1,
    SNT: 2,
  },

  "4-2-2-2": {
    KL: 1,
    STP: 2,
    SĞB: 1,
    SLB: 1,
    MO: 2,
    MOO: 2,
    SNT: 2,
  },

  "5-3-2": {
    KL: 1,
    STP: 3,
    SĞB: 1,
    SLB: 1,
    MO: 3,
    SNT: 2,
  },
};

/* =========================================================
   TAKIM SİSTEMİ
========================================================= */

function getTeam(teamId) {
  return db.teams[teamId] || null;
}

function createTeam(teamId, name) {
  if (!db.teams[teamId]) {
    db.teams[teamId] = {
      id: teamId,
      name,
      manualValue: 0,
      formation: "4-4-2",
      squad: {},
    };
  }

  return db.teams[teamId];
}

function createStanding(teamId, name) {
  if (!db.standings[teamId]) {
    db.standings[teamId] = {
      id: teamId,
      name,
      O: 0,
      G: 0,
      B: 0,
      M: 0,
      AG: 0,
      YG: 0,
      AV: 0,
      P: 0,
    };
  }

  db.standings[teamId].name = name;

  return db.standings[teamId];
}

function getTeamValue(team) {
  if (!team) return 0;

  let total = Number(team.manualValue) || 0;

  for (const player of Object.values(team.squad || {})) {
    total += Number(player.value) || 0;
  }

  return total;
}

function syncPlayerInTeams(member) {
  for (const team of Object.values(db.teams)) {
    if (team.squad && team.squad[member.id]) {
      team.squad[member.id].name = member.displayName;
      team.squad[member.id].value = getPlayerValue(member);
    }
  }
}

/* =========================================================
   AKTİF MAÇ
========================================================= */

const activeMatches = new Map();

function teamHasActiveMatch(teamId) {
  return activeMatches.has(teamId);
}

/* =========================================================
   İLK 11
========================================================= */

function getStartingEleven(team) {
  const formation = FORMATIONS[team.formation] || FORMATIONS["4-4-2"];

  const squad = Object.values(team.squad || {});

  const selected = {};

  for (const [position, count] of Object.entries(formation)) {
    selected[position] = squad
      .filter((player) => player.position === position)
      .slice(0, count);
  }

  const total = Object.values(selected)
    .reduce((sum, list) => sum + list.length, 0);

  const required = Object.values(formation)
    .reduce((sum, count) => sum + count, 0);

  const goalkeeper =
    selected.KL &&
    selected.KL.length >= 1;

  return {
    valid: total === required && goalkeeper,
    total,
    required,
    goalkeeper,
    players: selected,
  };
}

/* =========================================================
   SAHA
========================================================= */

function shortPlayer(player) {
  if (!player) return "—";

  return `${player.name}\n${formatMoney(player.value)}`;
}

function getPositionPlayers(xi, position) {
  return xi.players[position] || [];
}

function makePitch(team) {
  const xi = getStartingEleven(team);

  const line = (position, separator = "     ") => {
    const players = getPositionPlayers(xi, position);

    if (!players.length) return "—";

    return players
      .map((p) => shortPlayer(p))
      .join(separator);
  };

  let rows = [];

  rows.push("```");
  rows.push("                    🥅");
  rows.push("");
  rows.push(`              ${line("SNT")}`);
  rows.push("");

  if (team.formation === "4-4-2") {
    rows.push(`       ${line("SLK")}       ${line("SĞK")}`);
    rows.push("");
    rows.push(`          ${line("MO")}`);
  }

  if (team.formation === "4-3-3") {
    rows.push(` ${line("SLK")}        ${line("SNT")}        ${line("SĞK")}`);
    rows.push("");
    rows.push(`        ${line("MO")}`);
  }

  if (team.formation === "4-2-3-1") {
    rows.push(` ${line("SLK")}     ${line("MOO")}     ${line("SĞK")}`);
    rows.push("");
    rows.push(`          ${line("MO")}`);
  }

  if (team.formation === "3-5-2") {
    rows.push(` ${line("SLK")}   ${line("MOO")}   ${line("SĞK")}`);
    rows.push("");
    rows.push(`       ${line("MO")}`);
  }

  if (team.formation === "3-4-3") {
    rows.push(` ${line("SLK")}       ${line("SĞK")}`);
    rows.push("");
    rows.push(`       ${line("MO")}`);
  }

  if (team.formation === "4-3-1-2") {
    rows.push(`           ${line("MOO")}`);
    rows.push("");
    rows.push(`       ${line("MO")}`);
  }

  if (team.formation === "4-2-2-2") {
    rows.push(`      ${line("SLK")}     ${line("SĞK")}`);
    rows.push("");
    rows.push(`       ${line("MO")}`);
  }

  if (team.formation === "5-3-2") {
    rows.push(`       ${line("MO")}`);
  }

  rows.push("");
  rows.push(
    ` ${line("SLB")}   ${line("STP")}   ${line("SĞB")}`
  );
  rows.push("");
  rows.push(`              🧤 ${line("KL")}`);
  rows.push("```");

  return rows.join("\n");
}

/* =========================================================
   PUAN TABLOSU
========================================================= */

function sortedStandings() {
  return Object.values(db.standings).sort((a, b) => {
    return (
      b.P - a.P ||
      b.AV - a.AV ||
      b.AG - a.AG ||
      a.name.localeCompare(b.name, "tr")
    );
  });
}

function applyMatchResult(team1, team2, score1, score2) {
  const a = createStanding(team1.id, team1.name);
  const b = createStanding(team2.id, team2.name);

  a.O++;
  b.O++;

  a.AG += score1;
  a.YG += score2;

  b.AG += score2;
  b.YG += score1;

  a.AV = a.AG - a.YG;
  b.AV = b.AG - b.YG;

  if (score1 > score2) {
    a.G++;
    b.M++;
    a.P += 3;
  } else if (score2 > score1) {
    b.G++;
    a.M++;
    b.P += 3;
  } else {
    a.B++;
    b.B++;
    a.P++;
    b.P++;
  }

  saveDB();
}

function standingsText() {
  const list = sortedStandings();

  if (!list.length) {
    return "Henüz puan tablosuna takım eklenmedi.";
  }

  return list.map((team, index) => {
    return (
      `**${index + 1}. ${team.name}**\n` +
      `O ${team.O} • G ${team.G} • B ${team.B} • M ${team.M} • ` +
      `AG ${team.AG} • YG ${team.YG} • AV ${team.AV} • 🏆 ${team.P}`
    );
  }).join("\n\n");
}

async function updateStandingsMessage() {
  const channel = client.channels.cache.get(CHANNELS.PUAN);

  if (!channel || !channel.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setTitle("🏆 AXERA LEAGUE • PUAN DURUMU")
    .setDescription(standingsText())
    .setFooter({
      text: "Puan > Averaj > Atılan Gol",
    })
    .setTimestamp();

  try {
    if (db.standingsMessageId) {
      const old = await channel.messages
        .fetch(db.standingsMessageId)
        .catch(() => null);

      if (old) {
        await old.edit({
          embeds: [embed],
        });
        return;
      }
    }

    const message = await channel.send({
      embeds: [embed],
    });

    db.standingsMessageId = message.id;
    saveDB();
  } catch (error) {
    console.error("Puan mesajı:", error);
  }
}

/* =========================================================
   MAÇ OLAYLARI
========================================================= */

function random(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getXIPlayers(team) {
  const xi = getStartingEleven(team);

  return Object.values(xi.players)
    .flat()
    .filter(Boolean);
}

function getScorer(team) {
  const players = getXIPlayers(team)
    .filter((p) => p.position !== "KL");

  return players.length ? random(players) : null;
}

function getGoalkeeper(team) {
  const xi = getStartingEleven(team);

  return xi.players.KL?.[0] || null;
}

function getAssist(team, scorer) {
  const players = getXIPlayers(team)
    .filter(
      (p) =>
        p.position !== "KL" &&
        p.id !== scorer?.id
    );

  return players.length ? random(players) : null;
}

/* =========================================================
   MAÇ BAŞLAT
========================================================= */

async function startMatch(teamId1, teamId2, fixture = null) {
  const team1 = db.teams[teamId1];
  const team2 = db.teams[teamId2];

  if (!team1 || !team2) return false;

  if (
    teamHasActiveMatch(teamId1) ||
    teamHasActiveMatch(teamId2)
  ) {
    return false;
  }

  const xi1 = getStartingEleven(team1);
  const xi2 = getStartingEleven(team2);

  const channel = client.channels.cache.get(CHANNELS.MAC);

  if (!channel || !channel.isTextBased()) {
    return false;
  }

  if (!xi1.valid || !xi2.valid) {
    let text = "❌ **MAÇ BAŞLATILAMADI**\n\n";

    if (!xi1.valid) {
      text +=
        `🔴 **${team1.name}** ilk 11 şartlarını karşılamıyor.\n`;
    }

    if (!xi2.valid) {
      text +=
        `🔴 **${team2.name}** ilk 11 şartlarını karşılamıyor.\n`;
    }

    await channel.send(text);

    if (fixture) {
      fixture.status = "HATALI";
      saveDB();
    }

    return false;
  }

  const match = {
    id: fixture?.id || `match-${Date.now()}`,
    team1: teamId1,
    team2: teamId2,
    score1: 0,
    score2: 0,
    minute: 0,
    events: [],
    message: null,
    fixture,
    finished: false,
  };

  activeMatches.set(teamId1, match);
  activeMatches.set(teamId2, match);

  if (fixture) {
    fixture.status = "BAŞLIYOR";
    fixture.startedAt = Date.now();
    saveDB();
  }

  const value1 = getTeamValue(team1);
  const value2 = getTeamValue(team2);

  const totalValue = Math.max(value1 + value2, 1);

  const strength1 =
    0.5 + (value1 / totalValue) * 0.18;

  const strength2 =
    0.5 + (value2 / totalValue) * 0.18;

  const timer = setInterval(async () => {
    if (match.finished) {
      clearInterval(timer);
      return;
    }

    try {
      match.minute++;

      const eventChance = 0.038;

      if (Math.random() < eventChance) {
        const side =
          Math.random() <
          strength1 / (strength1 + strength2)
            ? 1
            : 2;

        const attack =
          side === 1 ? team1 : team2;

        const defense =
          side === 1 ? team2 : team1;

        const scorer = getScorer(attack);
        const goalkeeper = getGoalkeeper(defense);

        const outcome = Math.random();

        if (outcome < 0.60 && scorer) {
          if (side === 1) {
            match.score1++;
          } else {
            match.score2++;
          }

          const assist = getAssist(attack, scorer);

          let event =
            `⚽ **GOL!** ${scorer.name} ağları buldu!`;

          if (assist) {
            event += ` Asist: **${assist.name}**.`;
          }

          match.events.unshift({
            minute: match.minute,
            text: event,
          });
        } else if (outcome < 0.82) {
          match.events.unshift({
            minute: match.minute,
            text:
              `🧤 **${goalkeeper?.name || "Kaleci"}** ` +
              `müthiş bir kurtarış yaptı!`,
          });
        } else {
          match.events.unshift({
            minute: match.minute,
            text:
              "🥅 Top direkten döndü!",
          });
        }

        match.events = match.events.slice(0, 10);
      }

      const embed = new EmbedBuilder()
        .setTitle(
          `⚽ ${team1.name} ${match.score1} - ${match.score2} ${team2.name}`
        )
        .setDescription(
          `⏱️ **${match.minute}'**\n\n` +
          (
            match.events.length
              ? match.events
                  .map(
                    (event) =>
                      `**${event.minute}'** ${event.text}`
                  )
                  .join("\n")
              : "Maç başladı. İlk pozisyon bekleniyor..."
          )
        )
        .addFields(
          {
            name: `🔵 ${team1.name}`,
            value:
              `💰 ${formatMoney(value1)}\n` +
              `📋 ${team1.formation}`,
            inline: true,
          },
          {
            name: `🔴 ${team2.name}`,
            value:
              `💰 ${formatMoney(value2)}\n` +
              `📋 ${team2.formation}`,
            inline: true,
          }
        )
        .setFooter({
          text: "3 saniye = 1 maç dakikası • Axera League",
        })
        .setTimestamp();

      if (!match.message) {
        match.message = await channel.send({
          embeds: [embed],
        });
      } else {
        await match.message.edit({
          embeds: [embed],
        }).catch(() => {});
      }

      if (match.minute >= 90) {
        clearInterval(timer);

        match.finished = true;

        applyMatchResult(
          team1,
          team2,
          match.score1,
          match.score2
        );

        let resultText;

        if (match.score1 > match.score2) {
          resultText =
            `🏆 **${team1.name} kazandı!**`;
        } else if (match.score2 > match.score1) {
          resultText =
            `🏆 **${team2.name} kazandı!**`;
        } else {
          resultText = "🤝 **Maç berabere bitti!**";
        }

        const finalEmbed = new EmbedBuilder()
          .setTitle(
            `🏁 ${team1.name} ${match.score1} - ${match.score2} ${team2.name}`
          )
          .setDescription(
            `${resultText}\n\n` +
            (
              match.events.length
                ? match.events
                    .slice()
                    .reverse()
                    .map(
                      (event) =>
                        `**${event.minute}'** ${event.text}`
                    )
                    .join("\n")
                : "Maç golsüz tamamlandı."
            )
          )
          .addFields(
            {
              name: "💰 Takım Değerleri",
              value:
                `**${team1.name}:** ${formatMoney(value1)}\n` +
                `**${team2.name}:** ${formatMoney(value2)}`,
            },
            {
              name: "📊 Sonuç",
              value:
                `**${team1.name}** ${match.score1} - ${match.score2} **${team2.name}**`,
            }
          )
          .setFooter({
            text: "Axera League • Maç Sonucu",
          })
          .setTimestamp();

        if (match.message) {
          await match.message.edit({
            embeds: [finalEmbed],
          }).catch(() => {});
        }

        activeMatches.delete(teamId1);
        activeMatches.delete(teamId2);

        if (fixture) {
          fixture.status = "TAMAMLANDI";
          fixture.score1 = match.score1;
          fixture.score2 = match.score2;
          fixture.finishedAt = Date.now();
          saveDB();
        }

        await updateStandingsMessage();
      }
    } catch (error) {
      console.error("Maç döngüsü:", error);

      clearInterval(timer);

      match.finished = true;

      activeMatches.delete(teamId1);
      activeMatches.delete(teamId2);

      if (fixture) {
        fixture.status = "HATA";
      }

      saveDB();
    }
  }, 3000);

  return true;
}

/* =========================================================
   TARİH
========================================================= */

function getLocalParts() {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());

  const result = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      result[part.type] = part.value;
    }
  }

  return {
    date:
      `${result.year}-${result.month}-${result.day}`,
    time:
      `${result.hour}:${result.minute}`,
  };
}

function fixtureDue(fixture) {
  const now = getLocalParts();

  const current =
    `${now.date} ${now.time}`;

  const target =
    `${fixture.date} ${fixture.time}`;

  return current >= target;
}

/* =========================================================
   FİKSTÜR KONTROL
========================================================= */

async function checkFixtures() {
  for (const fixture of db.fixtures) {
    if (fixture.status !== "BEKLIYOR") continue;

    if (!fixtureDue(fixture)) continue;

    const team1 = db.teams[fixture.team1];
    const team2 = db.teams[fixture.team2];

    if (!team1 || !team2) {
      fixture.status = "HATA";
      saveDB();
      continue;
    }

    if (
      teamHasActiveMatch(team1.id) ||
      teamHasActiveMatch(team2.id)
    ) {
      continue;
    }

    const started =
      await startMatch(
        team1.id,
        team2.id,
        fixture
      );

    if (!started) {
      fixture.status = "HATALI";
      saveDB();
    }
  }
}

/* =========================================================
   READY
========================================================= */

client.once("ready", async () => {
  console.log("=================================");
  console.log("AXERA LEAGUE BOT AKTİF");
  console.log(`Bot: ${client.user.tag}`);
  console.log(`Saat dilimi: ${TIME_ZONE}`);
  console.log("=================================");

  await updateStandingsMessage();

  setInterval(() => {
    checkFixtures().catch((error) => {
      console.error("Fikstür kontrol:", error);
    });
  }, 1000);
});

/* =========================================================
   YENİ ÜYE
========================================================= */

client.on("guildMemberAdd", async (member) => {
  try {
    const channel =
      member.guild.channels.cache.get(CHANNELS.KAYIT);

    if (!channel || !channel.isTextBased()) return;

    await channel.send(
      `👋 ${member} hoşgeldin sunucumuza!\n` +
      `📋 <@&${ROLES.KAYIT}> seninle ilgilenecektir.`
    );
  } catch (error) {
    console.error("Yeni üye:", error);
  }
});

/* =========================================================
   MESAJ KOMUTLARI
========================================================= */

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;
  if (!message.content.startsWith(".")) return;

  const content =
    message.content.substring(1).trim();

  if (!content) return;

  const parts = content.split(/\s+/);
  const command = parts.shift().toLowerCase();
  const args = parts;

  try {
    /* =====================================================
       YARDIM
    ===================================================== */

    if (
      command === "yardım" ||
      command === "yardim"
    ) {
      const embed = new EmbedBuilder()
        .setTitle("📚 AXERA LEAGUE • KOMUTLAR")
        .setDescription(
          [
            "**👤 KAYIT**",
            "`.k @Oyuncu TakmaAdı`",
            "`.kayıtsızver @Oyuncu`",
            "",
            "**⚽ OYUNCU**",
            "`.ant` / `.antrenman`",
            "`.pen` / `.penaltı`",
            "`.dver @Oyuncu 5`",
            "`.dsil @Oyuncu 5`",
            "`.ara Oyuncu`",
            "",
            "**💰 KİŞİSEL BÜTÇE**",
            "`.bütçe`",
            "`.bütçe @Oyuncu`",
            "`.gönder @Oyuncu 50M`",
            "`.paraekle @Oyuncu 50M`",
            "`.parasil @Oyuncu 20M`",
            "`.paraayarla @Oyuncu 100M`",
            "",
            "**🏟️ TAKIM**",
            "`.takımekle @Takım`",
            "`.takımkaldır @Takım`",
            "`.takımdeğer @Takım 850`",
            "`.kadroekle @Takım @Oyuncu SNT`",
            "`.kadrocikar @Takım @Oyuncu`",
            "`.kadro @Takım`",
            "`.formasyon @Takım`",
            "",
            "**🏆 LİG**",
            "`.maç @Takım1 @Takım2`",
            "`.puan`",
            "`.puanekle @Takım 3`",
            "",
            "**📅 FİKSTÜR**",
            "`.fiksturekle @Takım1 @Takım2 2026-09-05 20:30`",
            "`.fikstur`",
            "`.fiksturcikar @Takım1 @Takım2`",
            "",
            "**🛠️ YÖNETİM**",
            "`.tweet Mesaj`",
            "`.embed Başlık | Açıklama`",
            "`.sil 10`",
            "`.kick @Oyuncu`",
            "`.ban @Oyuncu`",
            "`.mute @Oyuncu`",
            "`.unmute @Oyuncu`",
          ].join("\n")
        )
        .setFooter({
          text: "Axera League",
        });

      await message.reply({
        embeds: [embed],
      });

      return;
    }

    /* =====================================================
       KAYIT
    ===================================================== */

    if (command === "k") {
      if (!hasRole(message.member, ROLES.KAYIT)) {
        await message.reply(
          "❌ Bu komutu yalnızca Kayıt Yetkilisi kullanabilir."
        );
        return;
      }

      if (message.channel.id !== CHANNELS.KAYIT) {
        await message.reply(
          "❌ Bu komut yalnızca kayıt kanalında kullanılabilir."
        );
        return;
      }

      const target =
        getMentionedMember(message);

      if (!target) {
        await message.reply(
          "❌ Kullanım: `.k @Oyuncu TakmaAdı`"
        );
        return;
      }

      const nickname =
        args.slice(1).join(" ").trim();

      if (!nickname) {
        await message.reply(
          "❌ Bir takma ad yazmalısın."
        );
        return;
      }

      if (nickname.length > 32) {
        await message.reply(
          "❌ Takma ad 32 karakterden uzun olamaz."
        );
        return;
      }

      try {
        await target.setNickname(nickname);

        const row =
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(
                `register_fut_${target.id}`
              )
              .setLabel("Futbolcu")
              .setEmoji("⚽")
              .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
              .setCustomId(
                `register_kl_${target.id}`
              )
              .setLabel("Kaleci")
              .setEmoji("🧤")
              .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
              .setCustomId(
                `register_td_${target.id}`
              )
              .setLabel("Teknik Direktör")
              .setEmoji("📋")
              .setStyle(ButtonStyle.Secondary)
          );

        const embed = new EmbedBuilder()
          .setTitle("📋 AXERA LEAGUE • KAYIT")
          .setDescription(
            `${target}\n\n` +
            "Oyuncunun rolünü seçmek için aşağıdaki butonlardan birine bas."
          )
          .setFooter({
            text: "Sadece Kayıt Yetkilisi seçim yapabilir.",
          });

        await message.channel.send({
          embeds: [embed],
          components: [row],
        });
      } catch (error) {
        await message.reply(
          "❌ Oyuncunun takma adı değiştirilemedi."
        );
      }

      return;
    }

    /* =====================================================
       KAYITSIZ VER
    ===================================================== */

    if (
      command === "kayıtsızver" ||
      command === "kayitsizver"
    ) {
      if (!hasRole(message.member, ROLES.KAYIT)) {
        await message.reply(
          "❌ Sadece Kayıt Yetkilisi kullanabilir."
        );
        return;
      }

      const target =
        getMentionedMember(message);

      if (!target) {
        await message.reply(
          "❌ Kullanım: `.kayıtsızver @Oyuncu`"
        );
        return;
      }

      await target.roles.remove([
        ROLES.FUTBOLCU,
        ROLES.KALECI,
        ROLES.TD,
      ]);

      await target.roles.add(ROLES.KAYITSIZ);

      await message.reply(
        `✅ ${target} kullanıcısına **Kayıtsız** rolü verildi.`
      );

      return;
    }

    /* =====================================================
       ANTRENMAN
    ===================================================== */

    if (
      command === "ant" ||
      command === "antrenman"
    ) {
      if (message.channel.id !== CHANNELS.ANTRENMAN) {
        await message.reply(
          "❌ Bu komut yalnızca antrenman kanalında kullanılabilir."
        );
        return;
      }

      const user =
        getUserData(message.author.id);

      user.training++;

      if (user.training >= 5) {
        const result =
          await changePlayerValue(
            message.member,
            5
          );

        if (!result.ok) {
          user.training = 4;
          saveDB();

          await message.reply(
            `❌ Ödül verilemedi: ${result.error}`
          );

          return;
        }

        user.training = 0;
        saveDB();

        await message.reply(
          `🏋️ **ANTRENMAN TAMAMLANDI!**\n\n` +
          `🎁 Ödül: **+5M€**\n` +
          `💰 Yeni değer: **${formatMoney(result.value)}**`
        );

        return;
      }

      saveDB();

      await message.reply(
        `🏋️ Antrenman ilerlemesi: **${user.training}/5**`
      );

      return;
    }

    /* =====================================================
       PENALTI
    ===================================================== */

    if (
      command === "pen" ||
      command === "penaltı" ||
      command === "penalti"
    ) {
      if (message.channel.id !== CHANNELS.PENALTI) {
        await message.reply(
          "❌ Bu komut yalnızca penaltı kanalında kullanılabilir."
        );
        return;
      }

      const result =
        Math.floor(Math.random() * 3);

      if (result === 0) {
        const change =
          await changePlayerValue(
            message.member,
            5
          );

        if (!change.ok) {
          await message.reply(
            `❌ Gol oldu fakat değer eklenemedi: ${change.error}`
          );
          return;
        }

        await message.reply(
          `⚽ **GOOOOL!**\n\n` +
          `🧤 Axera Kalecisi mağlup oldu!\n` +
          `🎁 Ödül: **+5M€**\n` +
          `💰 Yeni değer: **${formatMoney(change.value)}**`
        );
      } else if (result === 1) {
        await message.reply(
          `🥅 **DİREK!**\n\n` +
          `Top direkten döndü.`
        );
      } else {
        await message.reply(
          `🧤 **KURTARDI!**\n\n` +
          `Axera Kalecisi penaltıyı kurtardı.`
        );
      }

      return;
    }

    /* =====================================================
       DEĞER VER
    ===================================================== */

    if (command === "dver") {
      if (!hasRole(message.member, ROLES.DEGER)) {
        await message.reply(
          "❌ Sadece Değer Yetkilisi kullanabilir."
        );
        return;
      }

      const target =
        getMentionedMember(message);

      const amount =
        Number(args[1]);

      if (
        !target ||
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        await message.reply(
          "❌ Kullanım: `.dver @Oyuncu 5`"
        );
        return;
      }

      const result =
        await changePlayerValue(
          target,
          amount
        );

      if (!result.ok) {
        await message.reply(
          `❌ ${result.error}`
        );
        return;
      }

      await message.reply(
        `✅ ${target} oyuncusuna **+${amount}M€** değer verildi.\n` +
        `💰 Yeni değer: **${formatMoney(result.value)}**`
      );

      return;
    }

    /* =====================================================
       DEĞER SİL
    ===================================================== */

    if (command === "dsil") {
      if (!hasRole(message.member, ROLES.DEGER)) {
        await message.reply(
          "❌ Sadece Değer Yetkilisi kullanabilir."
        );
        return;
      }

      const target =
        getMentionedMember(message);

      const amount =
        Number(args[1]);

      if (
        !target ||
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        await message.reply(
          "❌ Kullanım: `.dsil @Oyuncu 5`"
        );
        return;
      }

      const result =
        await changePlayerValue(
          target,
          -amount
        );

      if (!result.ok) {
        await message.reply(
          `❌ ${result.error}`
        );
        return;
      }

      await message.reply(
        `✅ ${target} oyuncusundan **-${amount}M€** değer silindi.\n` +
        `💰 Yeni değer: **${formatMoney(result.value)}**`
      );

      return;
    }

    /* =====================================================
       BÜTÇE
    ===================================================== */

    if (
      command === "bütçe" ||
      command === "butce"
    ) {
      const target =
        getMentionedMember(message) ||
        message.member;

      const user =
        getUserData(target.id);

      const embed = new EmbedBuilder()
        .setTitle("💰 AXERA LEAGUE • KİŞİSEL BÜTÇE")
        .setDescription(
          `${target}\n\n` +
          `💵 Bakiye: **${formatMoney(user.budget)}**`
        )
        .setFooter({
          text: "Oyuncu değeri ve bütçe birbirinden bağımsızdır.",
        });

      await message.reply({
        embeds: [embed],
      });

      return;
    }

    /* =====================================================
       PARA GÖNDER
    ===================================================== */

    if (
      command === "gönder" ||
      command === "gonder"
    ) {
      const target =
        getMentionedMember(message);

      const amount =
        parseMoney(args[1]);

      if (
        !target ||
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        await message.reply(
          "❌ Kullanım: `.gönder @Oyuncu 50M`"
        );
        return;
      }

      if (target.id === message.author.id) {
        await message.reply(
          "❌ Kendine para gönderemezsin."
        );
        return;
      }

      const sender =
        getUserData(message.author.id);

      const receiver =
        getUserData(target.id);

      if (sender.budget < amount) {
        await message.reply(
          `❌ Yetersiz bakiye.\n` +
          `💰 Bakiyen: **${formatMoney(sender.budget)}**`
        );
        return;
      }

      sender.budget -= amount;
      receiver.budget += amount;

      saveDB();

      await message.reply(
        `✅ ${target} kullanıcısına **${formatMoney(amount)}** gönderildi.\n` +
        `💰 Yeni bakiyen: **${formatMoney(sender.budget)}**`
      );

      return;
    }

    /* =====================================================
       PARA EKLE
    ===================================================== */

    if (command === "paraekle") {
      if (!hasRole(message.member, ROLES.DEGER)) {
        await message.reply(
          "❌ Sadece Değer Yetkilisi kullanabilir."
        );
        return;
      }

      const target =
        getMentionedMember(message);

      const amount =
        parseMoney(args[1]);

      if (
        !target ||
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        await message.reply(
          "❌ Kullanım: `.paraekle @Oyuncu 50M`"
        );
        return;
      }

      const user =
        getUserData(target.id);

      user.budget += amount;

      saveDB();

      await message.reply(
        `✅ ${target} bütçesine **${formatMoney(amount)}** eklendi.\n` +
        `💰 Yeni bütçe: **${formatMoney(user.budget)}**`
      );

      return;
    }

    /* =====================================================
       PARA SİL
    ===================================================== */

    if (command === "parasil") {
      if (!hasRole(message.member, ROLES.DEGER)) {
        await message.reply(
          "❌ Sadece Değer Yetkilisi kullanabilir."
        );
        return;
      }

      const target =
        getMentionedMember(message);

      const amount =
        parseMoney(args[1]);

      if (
        !target ||
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        await message.reply(
          "❌ Kullanım: `.parasil @Oyuncu 20M`"
        );
        return;
      }

      const user =
        getUserData(target.id);

      user.budget =
        Math.max(0, user.budget - amount);

      saveDB();

      await message.reply(
        `✅ ${target} bütçesinden **${formatMoney(amount)}** silindi.\n` +
        `💰 Yeni bütçe: **${formatMoney(user.budget)}**`
      );

      return;
    }

    /* =====================================================
       PARA AYARLA
    ===================================================== */

    if (command === "paraayarla") {
      if (!hasRole(message.member, ROLES.DEGER)) {
        await message.reply(
          "❌ Sadece Değer Yetkilisi kullanabilir."
        );
        return;
      }

      const target =
        getMentionedMember(message);

      const amount =
        parseMoney(args[1]);

      if (
        !target ||
        !Number.isFinite(amount) ||
        amount < 0
      ) {
        await message.reply(
          "❌ Kullanım: `.paraayarla @Oyuncu 100M`"
        );
        return;
      }

      const user =
        getUserData(target.id);

      user.budget = amount;

      saveDB();

      await message.reply(
        `✅ ${target} bütçesi **${formatMoney(amount)}** olarak ayarlandı.`
      );

      return;
    }

    /* =====================================================
       ARA
    ===================================================== */

    if (command === "ara") {
      const query =
        args.join(" ").trim().toLowerCase();

      if (!query) {
        await message.reply(
          "❌ Kullanım: `.ara W.Sneijder`"
        );
        return;
      }

      let best = null;
      let bestScore = -1;

      for (const member of message.guild.members.cache.values()) {
        if (member.user.bot) continue;

        const name =
          (member.nickname || member.user.username)
            .toLowerCase();

        let score = 0;

        if (name === query) score = 100;
        else if (name.startsWith(query)) score = 80;
        else if (name.includes(query)) score = 60;
        else {
          const queryChars =
            query.split("");

          const matched =
            queryChars.filter((char) =>
              name.includes(char)
            ).length;

          score =
            (matched / Math.max(query.length, 1)) * 40;
        }

        if (score > bestScore) {
          bestScore = score;
          best = member;
        }
      }

      if (!best || bestScore < 20) {
        const embed = new EmbedBuilder()
          .setTitle("🔎 OYUNCU ARAMA")
          .setDescription(
            `⚪ **BOŞ**\n\nAranan: \`${query}\``
          );

        await message.reply({
          embeds: [embed],
        });

        return;
      }

      const value =
        getPlayerValue(best);

      const embed = new EmbedBuilder()
        .setTitle("🔎 AXERA LEAGUE • OYUNCU ARAMA")
        .addFields(
          {
            name: "Aranan",
            value: `\`${query}\``,
          },
          {
            name: "Oyuncu",
            value:
              `${best}\n\`${best.displayName}\``,
          },
          {
            name: "Değer",
            value: formatMoney(value),
          },
          {
            name: "Durum",
            value: "🟢 DOLU",
          }
        )
        .setThumbnail(
          best.displayAvatarURL({
            extension: "png",
            size: 128,
          })
        )
        .setFooter({
          text: "Axera League",
        });

      await message.reply({
        embeds: [embed],
      });

      return;
    }

    /* =====================================================
       TAKIM EKLE
    ===================================================== */

    if (command === "takımekle") {
      if (!hasRole(message.member, ROLES.MAC)) {
        await message.reply(
          "❌ Sadece Maç Yetkilisi kullanabilir."
        );
        return;
      }

      const role =
        getMentionedRole(message);

      if (!role) {
        await message.reply(
          "❌ Kullanım: `.takımekle @Takım`"
        );
        return;
      }

      if (db.teams[role.id]) {
        await message.reply(
          "❌ Bu takım zaten sistemde."
        );
        return;
      }

      createTeam(
        role.id,
        role.name
      );

      createStanding(
        role.id,
        role.name
      );

      saveDB();
      await updateStandingsMessage();

      await message.reply(
        `✅ ${role} takımı Axera League'e eklendi.`
      );

      return;
    }

    /* =====================================================
       TAKIM KALDIR
    ===================================================== */

    if (
      command === "takımkaldır" ||
      command === "takimkaldir" ||
      command === "takımkaldir" ||
      command === "takimkaldır"
    ) {
      if (!hasRole(message.member, ROLES.MAC)) {
        await message.reply(
          "❌ Sadece Maç Yetkilisi kullanabilir."
        );
        return;
      }

      const role =
        getMentionedRole(message);

      if (!role) {
        await message.reply(
          "❌ Kullanım: `.takımkaldır @Takım`"
        );
        return;
      }

      if (teamHasActiveMatch(role.id)) {
        await message.reply(
          "❌ Bu takım şu anda aktif maçta."
        );
        return;
      }

      delete db.teams[role.id];
      delete db.standings[role.id];

      db.fixtures =
        db.fixtures.filter(
          (fixture) =>
            fixture.team1 !== role.id &&
            fixture.team2 !== role.id
        );

      saveDB();
      await updateStandingsMessage();

      await message.reply(
        `✅ ${role} sistemden kaldırıldı.`
      );

      return;
    }

    /* =====================================================
       TAKIM DEĞERİ
    ===================================================== */

    if (command === "takımdeğer") {
      if (!hasRole(message.member, ROLES.MAC)) {
        await message.reply(
          "❌ Sadece Maç Yetkilisi kullanabilir."
        );
        return;
      }

      const role =
        getMentionedRole(message);

      const amount =
        parseMoney(args[1]);

      if (
        !role ||
        !Number.isFinite(amount) ||
        amount < 0
      ) {
        await message.reply(
          "❌ Kullanım: `.takımdeğer @Takım 850`"
        );
        return;
      }

      const team =
        createTeam(
          role.id,
          role.name
        );

      team.manualValue = amount;

      createStanding(
        role.id,
        role.name
      );

      saveDB();

      await message.reply(
        `✅ ${role} temel takım değeri **${formatMoney(amount)}** olarak ayarlandı.\n` +
        `💰 Kadro dahil toplam: **${formatMoney(getTeamValue(team))}**`
      );

      return;
    }

    /* =====================================================
       KADRO EKLE
    ===================================================== */

    if (command === "kadroekle") {
      if (!hasRole(message.member, ROLES.MAC)) {
        await message.reply(
          "❌ Sadece Maç Yetkilisi kullanabilir."
        );
        return;
      }

      const role =
        getMentionedRole(message);

      const target =
        getMentionedMember(message);

      const position =
        String(args[2] || "").toUpperCase();

      if (
        !role ||
        !target ||
        !POSITIONS.includes(position)
      ) {
        await message.reply(
          "❌ Kullanım: `.kadroekle @Takım @Oyuncu SNT`"
        );
        return;
      }

      const team =
        createTeam(
          role.id,
          role.name
        );

      const value =
        getPlayerValue(target);

      team.squad[target.id] = {
        id: target.id,
        name: target.displayName,
        position,
        value,
      };

      createStanding(
        role.id,
        role.name
      );

      saveDB();

      await message.reply(
        `✅ ${target} oyuncusu ${role} kadrosuna **${position}** olarak eklendi.\n` +
        `💰 Oyuncu: **${formatMoney(value)}**\n` +
        `🏆 Takım: **${formatMoney(getTeamValue(team))}**`
      );

      return;
    }

    /* =====================================================
       KADRO ÇIKAR
    ===================================================== */

    if (
      command === "kadrocikar" ||
      command === "kadroçıkar" ||
      command === "kadroçikar"
    ) {
      if (!hasRole(message.member, ROLES.MAC)) {
        await message.reply(
          "❌ Sadece Maç Yetkilisi kullanabilir."
        );
        return;
      }

      const role =
        getMentionedRole(message);

      const target =
        getMentionedMember(message);

      if (!role || !target) {
        await message.reply(
          "❌ Kullanım: `.kadrocikar @Takım @Oyuncu`"
        );
        return;
      }

      const team =
        db.teams[role.id];

      if (!team) {
        await message.reply(
          "❌ Takım sistemde bulunamadı."
        );
        return;
      }

      if (!team.squad[target.id]) {
        await message.reply(
          "❌ Bu oyuncu takım kadrosunda değil."
        );
        return;
      }

      delete team.squad[target.id];

      saveDB();

      await message.reply(
        `✅ ${target} oyuncusu ${role} kadrosundan çıkarıldı.\n` +
        `💰 Yeni takım değeri: **${formatMoney(getTeamValue(team))}**`
      );

      return;
    }

    /* =====================================================
       KADRO GÖSTER
    ===================================================== */

    if (command === "kadro") {
      const role =
        getMentionedRole(message);

      if (!role) {
        await message.reply(
          "❌ Kullanım: `.kadro @Takım`"
        );
        return;
      }

      const team =
        db.teams[role.id];

      if (!team) {
        await message.reply(
          "❌ Bu takım sistemde bulunamadı."
        );
        return;
      }

      const xi =
        getStartingEleven(team);

      const embed = new EmbedBuilder()
        .setTitle(
          `⚽ ${team.name} • ${team.formation}`
        )
        .setDescription(
          makePitch(team)
        )
        .addFields(
          {
            name: "💰 Takım Değeri",
            value: formatMoney(
              getTeamValue(team)
            ),
            inline: true,
          },
          {
            name: "👥 Kadro",
            value:
              `${Object.keys(team.squad || {}).length} oyuncu`,
            inline: true,
          },
          {
            name: "📋 İlk 11",
            value:
              `${xi.total}/${xi.required}`,
            inline: true,
          }
        )
        .setFooter({
          text: "Axera League • Kadro",
        });

      await message.reply({
        embeds: [embed],
      });

      return;
    }

    /* =====================================================
       FORMASYON
    ===================================================== */

    if (command === "formasyon") {
      if (!hasRole(message.member, ROLES.MAC)) {
        await message.reply(
          "❌ Sadece Maç Yetkilisi kullanabilir."
        );
        return;
      }

      const role =
        getMentionedRole(message);

      if (!role) {
        await message.reply(
          "❌ Kullanım: `.formasyon @Takım`"
        );
        return;
      }

      if (!db.teams[role.id]) {
        await message.reply(
          "❌ Bu takım sistemde bulunamadı."
        );
        return;
      }

      const menu =
        new StringSelectMenuBuilder()
          .setCustomId(
            `formation_${role.id}_${message.author.id}`
          )
          .setPlaceholder(
            "Formasyon seç..."
          )
          .addOptions(
            Object.keys(FORMATIONS).map(
              (formation) => ({
                label: formation,
                value: formation,
                description:
                  `${formation} dizilişi`,
              })
            )
          );

      const row =
        new ActionRowBuilder()
          .addComponents(menu);

      await message.reply({
        content:
          `⚽ **${role.name}** için formasyon seç:`,
        components: [row],
      });

      return;
    }

    /* =====================================================
       PUAN
    ===================================================== */

    if (command === "puan") {
      const embed = new EmbedBuilder()
        .setTitle(
          "🏆 AXERA LEAGUE • PUAN TABLOSU"
        )
        .setDescription(
          standingsText()
        )
        .setFooter({
          text: "Puan > Averaj > Atılan Gol",
        })
        .setTimestamp();

      await message.reply({
        embeds: [embed],
      });

      return;
    }

    /* =====================================================
       PUAN EKLE
    ===================================================== */

    if (command === "puanekle") {
      if (!hasRole(message.member, ROLES.MAC)) {
        await message.reply(
          "❌ Sadece Maç Yetkilisi kullanabilir."
        );
        return;
      }

      const role =
        getMentionedRole(message);

      const amount =
        Number(args[1]);

      if (
        !role ||
        !Number.isInteger(amount) ||
        amount <= 0
      ) {
        await message.reply(
          "❌ Kullanım: `.puanekle @Takım 3`"
        );
        return;
      }

      const standing =
        createStanding(
          role.id,
          role.name
        );

      standing.P += amount;

      saveDB();
      await updateStandingsMessage();

      await message.reply(
        `✅ ${role} takımına **${amount} puan** eklendi.`
      );

      return;
    }

    /* =====================================================
       MAÇ
    ===================================================== */

    if (
      command === "maç" ||
      command === "mac"
    ) {
      if (!hasRole(message.member, ROLES.MAC)) {
        await message.reply(
          "❌ Sadece Maç Yetkilisi kullanabilir."
        );
        return;
      }

      const roles =
        [...message.mentions.roles.values()];

      if (roles.length < 2) {
        await message.reply(
          "❌ Kullanım: `.maç @Takım1 @Takım2`"
        );
        return;
      }

      const team1 =
        db.teams[roles[0].id];

      const team2 =
        db.teams[roles[1].id];

      if (!team1 || !team2) {
        await message.reply(
          "❌ Takımlardan biri sistemde yok."
        );
        return;
      }

      if (
        teamHasActiveMatch(team1.id) ||
        teamHasActiveMatch(team2.id)
      ) {
        await message.reply(
          "❌ Takımlardan biri zaten maçta."
        );
        return;
      }

      const xi1 =
        getStartingEleven(team1);

      const xi2 =
        getStartingEleven(team2);

      if (!xi1.valid || !xi2.valid) {
        let text =
          "❌ **MAÇ BAŞLATILAMADI**\n\n";

        if (!xi1.valid) {
          text +=
            `🔴 ${team1.name}: ${xi1.total}/${xi1.required} ilk 11.\n`;
        }

        if (!xi2.valid) {
          text +=
            `🔴 ${team2.name}: ${xi2.total}/${xi2.required} ilk 11.\n`;
        }

        await message.reply(text);
        return;
      }

      await message.reply(
        `⚽ **${team1.name}** 🆚 **${team2.name}**\n` +
        `⏱️ Maç başlatılıyor...`
      );

      await startMatch(
        team1.id,
        team2.id
      );

      return;
    }

    /* =====================================================
       FİKSTÜR EKLE
    ===================================================== */

    if (command === "fiksturekle") {
      if (!hasRole(message.member, ROLES.MAC)) {
        await message.reply(
          "❌ Sadece Maç Yetkilisi kullanabilir."
        );
        return;
      }

      const roles =
        [...message.mentions.roles.values()];

      const match =
        content.match(
          /<@&(\d+)>\s+<@&(\d+)>\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/
        );

      if (!match || roles.length < 2) {
        await message.reply(
          "❌ Kullanım:\n`.fiksturekle @Takım1 @Takım2 2026-09-05 20:30`"
        );
        return;
      }

      const date = match[3];
      const time = match[4];

      const dateObj =
        new Date(`${date}T${time}:00`);

      if (
        Number.isNaN(dateObj.getTime()) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !/^\d{2}:\d{2}$/.test(time)
      ) {
        await message.reply(
          "❌ Geçersiz tarih veya saat."
        );
        return;
      }

      const team1 =
        db.teams[roles[0].id];

      const team2 =
        db.teams[roles[1].id];

      if (!team1 || !team2) {
        await message.reply(
          "❌ Takımlardan biri sistemde bulunamadı."
        );
        return;
      }

      if (team1.id === team2.id) {
        await message.reply(
          "❌ Bir takım kendisiyle maç yapamaz."
        );
        return;
      }

      const duplicate =
        db.fixtures.find(
          (fixture) =>
            fixture.status === "BEKLIYOR" &&
            fixture.team1 === team1.id &&
            fixture.team2 === team2.id &&
            fixture.date === date &&
            fixture.time === time
        );

      if (duplicate) {
        await message.reply(
          "❌ Bu fikstür zaten mevcut."
        );
        return;
      }

      const fixture = {
        id: `fixture-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,

        team1: team1.id,
        team2: team2.id,

        date,
        time,

        status: "BEKLIYOR",

        score1: null,
        score2: null,

        startedAt: null,
        finishedAt: null,
      };

      db.fixtures.push(fixture);

      saveDB();

      await message.reply(
        `✅ **FİKSTÜR EKLENDİ**\n\n` +
        `⚽ **${team1.name}** 🆚 **${team2.name}**\n` +
        `📅 ${date}\n` +
        `🕐 ${time}\n` +
        `🌍 ${TIME_ZONE}`
      );

      return;
    }

    /* =====================================================
       FİKSTÜR
    ===================================================== */

    if (
      command === "fikstur" ||
      command === "fikstür"
    ) {
      const pending =
        db.fixtures.filter(
          (fixture) =>
            fixture.status === "BEKLIYOR" ||
            fixture.status === "BAŞLIYOR"
        );

      const completed =
        db.fixtures.filter(
          (fixture) =>
            fixture.status === "TAMAMLANDI"
        );

      let description = "";

      if (pending.length) {
        description +=
          "📅 **BEKLEYEN MAÇLAR**\n\n";

        for (const fixture of pending) {
          const team1 =
            db.teams[fixture.team1];

          const team2 =
            db.teams[fixture.team2];

          description +=
            `⚽ **${team1?.name || "Silinmiş"}** 🆚 **${team2?.name || "Silinmiş"}**\n` +
            `📅 ${fixture.date} • 🕐 ${fixture.time}\n` +
            `📌 ${fixture.status}\n\n`;
        }
      }

      if (completed.length) {
        description +=
          "🏁 **TAMAMLANAN MAÇLAR**\n\n";

        for (
          const fixture of completed
            .slice()
            .reverse()
            .slice(0, 15)
        ) {
          const team1 =
            db.teams[fixture.team1];

          const team2 =
            db.teams[fixture.team2];

          description +=
            `⚽ **${team1?.name || "Silinmiş"}** ` +
            `${fixture.score1}-${fixture.score2} ` +
            `**${team2?.name || "Silinmiş"}**\n` +
            `📅 ${fixture.date} • ${fixture.time}\n\n`;
        }
      }

      if (!description) {
        description =
          "📭 Henüz fikstür bulunmuyor.";
      }

      const embed = new EmbedBuilder()
        .setTitle(
          "📅 AXERA LEAGUE • FİKSTÜR"
        )
        .setDescription(description)
        .setFooter({
          text: `Saat dilimi: ${TIME_ZONE}`,
        })
        .setTimestamp();

      await message.reply({
        embeds: [embed],
      });

      return;
    }

    /* =====================================================
       FİKSTÜR ÇIKAR
    ===================================================== */

    if (
      command === "fiksturcikar" ||
      command === "fikstürcikar" ||
      command === "fikstürçıkar" ||
      command === "fiksturçıkar"
    ) {
      if (!hasRole(message.member, ROLES.MAC)) {
        await message.reply(
          "❌ Sadece Maç Yetkilisi kullanabilir."
        );
        return;
      }

      const roles =
        [...message.mentions.roles.values()];

      if (roles.length < 2) {
        await message.reply(
          "❌ Kullanım: `.fiksturcikar @Takım1 @Takım2`"
        );
        return;
      }

      const index =
        db.fixtures.findIndex(
          (fixture) =>
            fixture.status === "BEKLIYOR" &&
            (
              (
                fixture.team1 === roles[0].id &&
                fixture.team2 === roles[1].id
              ) ||
              (
                fixture.team1 === roles[1].id &&
                fixture.team2 === roles[0].id
              )
            )
        );

      if (index === -1) {
        await message.reply(
          "❌ Bu iki takım arasında bekleyen fikstür bulunamadı."
        );
        return;
      }

      const removed =
        db.fixtures.splice(index, 1)[0];

      saveDB();

      await message.reply(
        `✅ Fikstür kaldırıldı.\n` +
        `📅 ${removed.date} ${removed.time}`
      );

      return;
    }

    /* =====================================================
       TWEET
    ===================================================== */

    if (command === "tweet") {
      const text =
        args.join(" ").trim();

      if (!text) {
        await message.reply(
          "❌ Kullanım: `.tweet Mesaj`"
        );
        return;
      }

      const embed = new EmbedBuilder()
        .setAuthor({
          name:
            message.member.displayName ||
            message.author.username,
          iconURL:
            message.author.displayAvatarURL(),
        })
        .setDescription(text)
        .setFooter({
          text: "Axera League • Tweet",
        })
        .setTimestamp();

      await message.channel.send({
        embeds: [embed],
      });

      return;
    }

    /* =====================================================
       EMBED
    ===================================================== */

    if (command === "embed") {
      if (!isAdmin(message.member)) {
        await message.reply(
          "❌ Sadece Yönetici kullanabilir."
        );
        return;
      }

      const full =
        args.join(" ");

      const split =
        full.split("|");

      const title =
        split.shift()?.trim();

      const description =
        split.join("|").trim();

      if (!title || !description) {
        await message.reply(
          "❌ Kullanım: `.embed Başlık | Açıklama`"
        );
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();

      await message.channel.send({
        embeds: [embed],
      });

      return;
    }

    /* =====================================================
       SİL
    ===================================================== */

    if (command === "sil") {
      if (!isAdmin(message.member)) {
        await message.reply(
          "❌ Sadece Yönetici kullanabilir."
        );
        return;
      }

      const amount =
        Number(args[0]);

      if (
        !Number.isInteger(amount) ||
        amount < 1 ||
        amount > 1000
      ) {
        await message.reply(
          "❌ 1 ile 1000 arasında bir sayı gir."
        );
        return;
      }

      let remaining = amount;

      try {
        while (remaining > 0) {
          const batch =
            Math.min(remaining, 100);

          const deleted =
            await message.channel.bulkDelete(
              batch,
              true
            );

          if (!deleted.size) break;

          remaining -= deleted.size;

          if (deleted.size < batch) break;
        }
      } catch (error) {
        console.error("Sil komutu:", error);
      }

      return;
    }

    /* =====================================================
       KICK
    ===================================================== */

    if (command === "kick") {
      if (!isAdmin(message.member)) {
        await message.reply(
          "❌ Sadece Yönetici kullanabilir."
        );
        return;
      }

      const target =
        getMentionedMember(message);

      if (!target) {
        await message.reply(
          "❌ Kullanım: `.kick @Oyuncu`"
        );
        return;
      }

      if (!target.kickable) {
        await message.reply(
          "❌ Bu kullanıcıyı atamıyorum."
        );
        return;
      }

      await target.kick();

      await message.reply(
        `👢 **${target.user.tag}** sunucudan atıldı.`
      );

      return;
    }

    /* =====================================================
       BAN
    ===================================================== */

    if (command === "ban") {
      if (!isAdmin(message.member)) {
        await message.reply(
          "❌ Sadece Yönetici kullanabilir."
        );
        return;
      }

      const target =
        getMentionedMember(message);

      if (!target) {
        await message.reply(
          "❌ Kullanım: `.ban @Oyuncu`"
        );
        return;
      }

      if (!target.bannable) {
        await message.reply(
          "❌ Bu kullanıcıyı yasaklayamıyorum."
        );
        return;
      }

      await target.ban({
        reason: `Axera League - ${message.author.tag}`,
      });

      await message.reply(
        `🔨 **${target.user.tag}** yasaklandı.`
      );

      return;
    }

    /* =====================================================
       MUTE
    ===================================================== */

    if (command === "mute") {
      if (!isAdmin(message.member)) {
        await message.reply(
          "❌ Sadece Yönetici kullanabilir."
        );
        return;
      }

      const target =
        getMentionedMember(message);

      if (!target) {
        await message.reply(
          "❌ Kullanım: `.mute @Oyuncu`"
        );
        return;
      }

      if (!target.moderatable) {
        await message.reply(
          "❌ Bu kullanıcı susturulamıyor."
        );
        return;
      }

      await target.timeout(
        10 * 60 * 1000,
        `Axera League mute - ${message.author.tag}`
      );

      await message.reply(
        `🔇 ${target} **10 dakika** susturuldu.`
      );

      return;
    }

    /* =====================================================
       UNMUTE
    ===================================================== */

    if (command === "unmute") {
      if (!isAdmin(message.member)) {
        await message.reply(
          "❌ Sadece Yönetici kullanabilir."
        );
        return;
      }

      const target =
        getMentionedMember(message);

      if (!target) {
        await message.reply(
          "❌ Kullanım: `.unmute @Oyuncu`"
        );
        return;
      }

      if (!target.moderatable) {
        await message.reply(
          "❌ Bu kullanıcı üzerinde işlem yapılamıyor."
        );
        return;
      }

      await target.timeout(null);

      await message.reply(
        `🔊 ${target} kullanıcısının susturması kaldırıldı.`
      );

      return;
    }
  } catch (error) {
    console.error(
      `Komut hatası [.${command}]:`,
      error
    );

    try {
      if (!message.replied && !message.deferred) {
        await message.reply(
          "❌ Komut çalıştırılırken bir hata oluştu."
        );
      }
    } catch {}
  }
});

/* =========================================================
   ETKİLEŞİMLER
========================================================= */

client.on("interactionCreate", async (interaction) => {
  try {
    /* =====================================================
       KAYIT BUTONLARI
    ===================================================== */

    if (
      interaction.isButton() &&
      interaction.customId.startsWith("register_")
    ) {
      if (
        !hasRole(
          interaction.member,
          ROLES.KAYIT
        )
      ) {
        await interaction.reply({
          content:
            "❌ Bu butonu yalnızca Kayıt Yetkilisi kullanabilir.",
          ephemeral: true,
        });

        return;
      }

      const parts =
        interaction.customId.split("_");

      const type = parts[1];
      const userId = parts[2];

      const target =
        await interaction.guild.members
          .fetch(userId)
          .catch(() => null);

      if (!target) {
        await interaction.reply({
          content:
            "❌ Oyuncu bulunamadı.",
          ephemeral: true,
        });

        return;
      }

      await target.roles.remove([
        ROLES.KAYITSIZ,
        ROLES.FUTBOLCU,
        ROLES.KALECI,
        ROLES.TD,
      ]);

      let roleId;
      let roleName;

      if (type === "fut") {
        roleId = ROLES.FUTBOLCU;
        roleName = "Futbolcu";
      } else if (type === "kl") {
        roleId = ROLES.KALECI;
        roleName = "Kaleci";
      } else {
        roleId = ROLES.TD;
        roleName = "Teknik Direktör";
      }

      await target.roles.add(roleId);

      getUserData(target.id);
      saveDB();

      const rows =
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(
              `done_fut_${target.id}`
            )
            .setLabel("Futbolcu")
            .setEmoji("⚽")
            .setStyle(
              type === "fut"
                ? ButtonStyle.Success
                : ButtonStyle.Secondary
            )
            .setDisabled(true),

          new ButtonBuilder()
            .setCustomId(
              `done_kl_${target.id}`
            )
            .setLabel("Kaleci")
            .setEmoji("🧤")
            .setStyle(
              type === "kl"
                ? ButtonStyle.Success
                : ButtonStyle.Secondary
            )
            .setDisabled(true),

          new ButtonBuilder()
            .setCustomId(
              `done_td_${target.id}`
            )
            .setLabel("Teknik Direktör")
            .setEmoji("📋")
            .setStyle(
              type === "td"
                ? ButtonStyle.Success
                : ButtonStyle.Secondary
            )
            .setDisabled(true)
        );

      await interaction.update({
        embeds: [
          new EmbedBuilder()
            .setTitle(
              "✅ KAYIT TAMAMLANDI"
            )
            .setDescription(
              `${target} başarıyla **${roleName}** olarak kaydedildi.`
            )
            .setTimestamp(),
        ],
        components: [rows],
      });

      const chat =
        interaction.guild.channels.cache.get(
          CHANNELS.SOHBET
        );

      if (chat && chat.isTextBased()) {
        await chat.send(
          `🎉 ${target} **${roleName}** olarak Axera League'e kaydedildi!`
        );
      }

      return;
    }

    /* =====================================================
       FORMASYON
    ===================================================== */

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId.startsWith("formation_")
    ) {
      if (
        !hasRole(
          interaction.member,
          ROLES.MAC
        )
      ) {
        await interaction.reply({
          content:
            "❌ Bu menüyü yalnızca Maç Yetkilisi kullanabilir.",
          ephemeral: true,
        });

        return;
      }

      const parts =
        interaction.customId.split("_");

      const teamId = parts[1];
      const ownerId = parts[2];

      if (
        ownerId &&
        ownerId !== interaction.user.id
      ) {
        await interaction.reply({
          content:
            "❌ Bu formasyon menüsü başka bir yetkiliye ait.",
          ephemeral: true,
        });

        return;
      }

      const formation =
        interaction.values[0];

      if (!FORMATIONS[formation]) {
        await interaction.reply({
          content:
            "❌ Geçersiz formasyon.",
          ephemeral: true,
        });

        return;
      }

      const team =
        db.teams[teamId];

      if (!team) {
        await interaction.reply({
          content:
            "❌ Takım bulunamadı.",
          ephemeral: true,
        });

        return;
      }

      team.formation = formation;

      saveDB();

      await interaction.update({
        content:
          `✅ **${team.name}** formasyonu **${formation}** olarak ayarlandı.`,
        components: [],
      });

      return;
    }
  } catch (error) {
    console.error("Interaction hatası:", error);

    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content:
            "❌ İşlem sırasında bir hata oluştu.",
          ephemeral: true,
        });
      }
    } catch {}
  }
});

/* =========================================================
   HATA YAKALAMA
========================================================= */

process.on("unhandledRejection", (error) => {
  console.error("UNHANDLED REJECTION:", error);
});

process.on("uncaughtException", (error) => {
  console.error("UNCAUGHT EXCEPTION:", error);
});

/* =========================================================
   LOGIN
========================================================= */

client.login(TOKEN).catch((error) => {
  console.error("Discord giriş hatası:", error);
  process.exit(1);
});
