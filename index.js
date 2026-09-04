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
   AXERA LEAGUE
   TEK PARÇA FİKSTÜR + MAÇ + KADRO + EKONOMİ + KAYIT BOTU
========================================================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

const TOKEN = process.env.TOKEN;
const TIME_ZONE = process.env.TIME_ZONE || "Europe/Istanbul";

/* =========================
   ROLLER
========================= */

const ROLES = {
  FUTBOLCU: "1534457228986421278",
  KALECI: "1534492034243498195",
  KAYITSIZ: "1534457560134844517",
  TD: "1534456648930693120",
  KAYIT: "1534456315366342716",
  DEGER: "1534456192913375382",
  MAC: "1535251168169697390",
};

/* =========================
   KANALLAR
========================= */

const CHANNELS = {
  KAYIT: "1534460177884123276",
  SOHBET: "1534469475917758586",
  ANTRENMAN: "1534474070798762197",
  PENALTI: "1534474327812997192",
  MAC: "1534477626872168541",
  PUAN: "1534475991404253284",
};

/* =========================
   VERİ DOSYASI
========================= */

const DATA_FILE = path.join(__dirname, "data.json");

const defaultData = {
  users: {},
  teams: {},
  standings: {},
  fixtures: [],
  activeMatches: {},
  standingsMessageId: null,
};

let data;

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      data = structuredClone(defaultData);
      saveData();
      return;
    }

    data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

    data.users ||= {};
    data.teams ||= {};
    data.standings ||= {};
    data.fixtures ||= [];
    data.activeMatches ||= {};
  } catch (err) {
    console.error("data.json okunamadı:", err);
    data = structuredClone(defaultData);
    saveData();
  }
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

loadData();

/* =========================
   GENEL YARDIMCILAR
========================= */

function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

function hasRole(member, roleId) {
  return member.roles.cache.has(roleId);
}

function canUse(member, roleId) {
  return isAdmin(member) || hasRole(member, roleId);
}

function getUserData(userId) {
  if (!data.users[userId]) {
    data.users[userId] = {
      value: 0,
      budget: 0,
      training: 0,
    };
  }

  data.users[userId].value ??= 0;
  data.users[userId].budget ??= 0;
  data.users[userId].training ??= 0;

  return data.users[userId];
}

function formatMoney(value) {
  value = Number(value) || 0;
  return `${value.toLocaleString("tr-TR")}M€`;
}

function parseMoney(input) {
  if (!input) return NaN;

  let str = String(input)
    .toUpperCase()
    .replace(/€/g, "")
    .replace(/M/g, "")
    .replace(/\s/g, "")
    .replace(",", ".");

  const number = Number(str);

  return Number.isFinite(number) ? number : NaN;
}

function getMemberFromMention(message) {
  return message.mentions.members.first() || null;
}

function getRoleFromMention(message) {
  return message.mentions.roles.first() || null;
}

function getValueFromNickname(nickname) {
  if (!nickname) return null;

  const match = nickname.match(/(\d+(?:[.,]\d+)?)M€\s*$/i);

  if (!match) return null;

  return Number(match[1].replace(",", "."));
}

function getStoredOrNicknameValue(member) {
  const user = getUserData(member.id);

  const nickValue = getValueFromNickname(member.displayName);

  if (nickValue !== null && user.value === 0) {
    user.value = nickValue;
    saveData();
  }

  return user.value;
}

async function changePlayerValue(member, amount) {
  const user = getUserData(member.id);

  const current = getStoredOrNicknameValue(member);
  const next = current + amount;

  if (next < 0) {
    return {
      ok: false,
      error: "Oyuncu değeri 0M€ altına düşemez.",
    };
  }

  const nickname = member.nickname || member.user.username;

  const match = nickname.match(/(\d+(?:[.,]\d+)?)M€\s*$/i);

  if (!match) {
    return {
      ok: false,
      error: "Oyuncunun takma adının sonunda `M€` değeri bulunamadı.",
    };
  }

  const newNickname =
    nickname.slice(0, match.index) + formatMoney(next);

  if (newNickname.length > 32) {
    return {
      ok: false,
      error: "Yeni takma ad Discord'un 32 karakter sınırını aşıyor.",
    };
  }

  try {
    await member.setNickname(newNickname);

    user.value = next;
    saveData();

    syncAllTeamValuesForPlayer(member.id);

    return {
      ok: true,
      value: next,
      nickname: newNickname,
    };
  } catch (err) {
    console.error("Nickname değiştirilemedi:", err);

    return {
      ok: false,
      error:
        "Takma ad değiştirilemedi. Botun `Takma Adları Yönet` yetkisini ve rol sırasını kontrol et.",
    };
  }
}

/* =========================
   POZİSYONLAR
========================= */

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

/* =========================
   TAKIM YARDIMCILARI
========================= */

function getTeam(teamId) {
  return data.teams[teamId] || null;
}

function ensureTeam(teamId, name) {
  if (!data.teams[teamId]) {
    data.teams[teamId] = {
      id: teamId,
      name,
      manualValue: 0,
      formation: "4-4-2",
      squad: {},
    };
  }

  return data.teams[teamId];
}

function getTeamPlayerValues(team) {
  let total = Number(team.manualValue) || 0;

  for (const player of Object.values(team.squad || {})) {
    total += Number(player.value) || 0;
  }

  return total;
}

function syncTeamValue(teamId) {
  const team = data.teams[teamId];

  if (!team) return 0;

  return getTeamPlayerValues(team);
}

function syncAllTeamValuesForPlayer(playerId) {
  for (const team of Object.values(data.teams)) {
    if (team.squad?.[playerId]) {
      const member = client.guilds.cache
        .first()
        ?.members.cache.get(playerId);

      if (member) {
        team.squad[playerId].value =
          getStoredOrNicknameValue(member);
      }
    }
  }

  saveData();
}

/* =========================
   TAKIM AKTİF MAÇ KONTROLÜ
========================= */

function isTeamPlaying(teamId) {
  return Boolean(data.activeMatches[teamId]);
}

/* =========================
   İLK 11 KONTROLÜ
========================= */

function getStartingEleven(team) {
  const formation =
    FORMATIONS[team.formation] || FORMATIONS["4-4-2"];

  const players = Object.values(team.squad || {});

  const result = {};

  for (const pos of Object.keys(formation)) {
    result[pos] = players
      .filter((p) => p.position === pos)
      .slice(0, formation[pos]);
  }

  const count = Object.values(result)
    .reduce((sum, arr) => sum + arr.length, 0);

  const needed = Object.values(formation)
    .reduce((sum, x) => sum + x, 0);

  const goalkeeper =
    result.KL && result.KL.length >= 1;

  return {
    valid: count >= needed && goalkeeper,
    count,
    needed,
    goalkeeper,
    players: result,
  };
}

/* =========================
   SAHA GÖRÜNÜMÜ
========================= */

function playerLine(player) {
  if (!player) return "—";

  return `${player.name} • ${formatMoney(player.value)}`;
}

function createPitch(team) {
  const xi = getStartingEleven(team);

  const get = (pos, index = 0) =>
    xi.players[pos]?.[index]
      ? playerLine(xi.players[pos][index])
      : "—";

  return [
    "```text",
    "                 🥅",
    `              ${get("SNT", 0)}`,
    `       ${get("SNT", 1)}          ${get("SNT", 2)}`,
    "",
    `     ${get("SLK", 0)}   ${get("MOO", 0)}   ${get("SĞK", 0)}`,
    "",
    `          ${get("MO", 0)}   ${get("MO", 1)}`,
    `              ${get("MO", 2)}`,
    "",
    ` ${get("SLB", 0)}  ${get("STP", 0)}  ${get("STP", 1)}  ${get("SĞB", 0)}`,
    "",
    `              🧤 ${get("KL", 0)}`,
    "```",
  ].join("\n");
}

/* =========================
   PUAN TABLOSU
========================= */

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
      P: 0,
    };
  }

  return data.standings[teamId];
}

function sortStandings() {
  return Object.values(data.standings).sort(
    (a, b) =>
      b.P - a.P ||
      b.AV - a.AV ||
      b.AG - a.AG
  );
}

async function updateStandingsMessage() {
  const channel = client.channels.cache.get(CHANNELS.PUAN);

  if (!channel || !channel.isTextBased()) return;

  const rows = sortStandings();

  let description = "";

  if (!rows.length) {
    description = "Henüz puan tablosuna eklenmiş takım yok.";
  } else {
    description = rows
      .map(
        (t, i) =>
          `**${i + 1}. ${t.name}**\n` +
          `O: ${t.O} • G: ${t.G} • B: ${t.B} • M: ${t.M}\n` +
          `AG: ${t.AG} • YG: ${t.YG} • AV: ${t.AV} • 🏆 ${t.P}`
      )
      .join("\n\n");
  }

  const embed = new EmbedBuilder()
    .setTitle("🏆 AXERA LEAGUE • PUAN DURUMU")
    .setDescription(description)
    .setFooter({ text: "Axera League" })
    .setTimestamp();

  try {
    if (data.standingsMessageId) {
      const old = await channel.messages
        .fetch(data.standingsMessageId)
        .catch(() => null);

      if (old) {
        await old.edit({ embeds: [embed] });
        return;
      }
    }

    const msg = await channel.send({ embeds: [embed] });

    data.standingsMessageId = msg.id;
    saveData();
  } catch (err) {
    console.error("Puan mesajı güncellenemedi:", err);
  }
}

function applyMatchResult(team1, team2, score1, score2) {
  const a = ensureStanding(team1.id, team1.name);
  const b = ensureStanding(team2.id, team2.name);

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

  saveData();
}

/* =========================
   MAÇ OLAYLARI
========================= */

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getTeamXIPlayers(team) {
  const xi = getStartingEleven(team);

  return Object.values(xi.players)
    .flat()
    .filter(Boolean);
}

function chooseScorer(team) {
  const players = getTeamXIPlayers(team)
    .filter((p) => p.position !== "KL");

  if (!players.length) return null;

  return randomItem(players);
}

function chooseAssist(team) {
  const players = getTeamXIPlayers(team)
    .filter((p) => p.position !== "KL");

  if (!players.length) return null;

  return randomItem(players);
}

function chooseGoalkeeper(team) {
  const xi = getStartingEleven(team);

  return xi.players.KL?.[0] || null;
}

/* =========================
   MAÇ BAŞLAT
========================= */

async function startMatch(teamId1, teamId2, fixture = null) {
  const team1 = data.teams[teamId1];
  const team2 = data.teams[teamId2];

  if (!team1 || !team2) return;

  if (isTeamPlaying(teamId1) || isTeamPlaying(teamId2)) {
    return;
  }

  const xi1 = getStartingEleven(team1);
  const xi2 = getStartingEleven(team2);

  if (!xi1.valid || !xi2.valid) {
    const channel = client.channels.cache.get(CHANNELS.MAC);

    if (channel?.isTextBased()) {
      let text = "❌ Maç başlatılamadı.\n\n";

      if (!xi1.valid) {
        text += `🔴 **${team1.name}** ilk 11 şartlarını karşılamıyor.\n`;
      }

      if (!xi2.valid) {
        text += `🔴 **${team2.name}** ilk 11 şartlarını karşılamıyor.\n`;
      }

      await channel.send(text);
    }

    if (fixture) {
      fixture.status = "HATALI";
      saveData();
    }

    return;
  }

  const match = {
    id:
      fixture?.id ||
      `${Date.now()}-${teamId1}-${teamId2}`,

    team1: teamId1,
    team2: teamId2,

    score1: 0,
    score2: 0,

    minute: 0,

    events: [],

    nextGoal1: 0,
    nextGoal2: 0,

    messageId: null,

    fixtureId: fixture?.id || null,
  };

  data.activeMatches[teamId1] = match.id;
  data.activeMatches[teamId2] = match.id;

  saveData();

  const channel = client.channels.cache.get(CHANNELS.MAC);

  if (!channel?.isTextBased()) {
    delete data.activeMatches[teamId1];
    delete data.activeMatches[teamId2];
    saveData();
    return;
  }

  const value1 = getTeamPlayerValues(team1);
  const value2 = getTeamPlayerValues(team2);

  const totalValue = Math.max(value1 + value2, 1);

  const advantage1 =
    0.30 +
    (value1 / totalValue) * 0.35;

  const advantage2 =
    0.30 +
    (value2 / totalValue) * 0.35;

  const interval = setInterval(async () => {
    try {
      if (!data.activeMatches[teamId1]) {
        clearInterval(interval);
        return;
      }

      match.minute++;

      const eventChance = 0.035;

      if (Math.random() < eventChance) {
        const side =
          Math.random() <
          advantage1 /
            (advantage1 + advantage2)
            ? 1
            : 2;

        const attackingTeam =
          side === 1 ? team1 : team2;

        const defendingTeam =
          side === 1 ? team2 : team1;

        const scorer =
          chooseScorer(attackingTeam);

        const goalkeeper =
          chooseGoalkeeper(defendingTeam);

        const roll = Math.random();

        if (roll < 0.63 && scorer) {
          if (side === 1) {
            match.score1++;
          } else {
            match.score2++;
          }

          const assist = chooseAssist(attackingTeam);

          const text =
            `⚽ **GOL!** ${scorer.name}, ` +
            `${formatMoney(scorer.value)} ` +
            `ile ağları buldu!` +
            (assist && assist.name !== scorer.name
              ? ` Asist: **${assist.name}**.`
              : "");

          match.events.unshift({
            minute: match.minute,
            text,
          });
        } else if (roll < 0.82) {
          match.events.unshift({
            minute: match.minute,
            text:
              `🧤 **${goalkeeper?.name || "Kaleci"}** ` +
              `harika bir kurtarış yaptı!`,
          });
        } else {
          match.events.unshift({
            minute: match.minute,
            text:
              `🥅 Top direkten döndü! ` +
              `Gol şansı kaçtı.`,
          });
        }

        match.events = match.events.slice(0, 8);
      }

      const embed = new EmbedBuilder()
        .setTitle(
          `⚽ ${team1.name} ${match.score1} - ${match.score2} ${team2.name}`
        )
        .setDescription(
          `⏱️ **${match.minute}'**\n\n` +
          (match.events.length
            ? match.events
                .map(
                  (e) =>
                    `**${e.minute}'** ${e.text}`
                )
                .join("\n")
            : "Maç başladı. İlk tehlikeli atak bekleniyor...")
        )
        .addFields(
          {
            name: team1.name,
            value:
              `💰 ${formatMoney(value1)}\n` +
              `📋 ${team1.formation}`,
            inline: true,
          },
          {
            name: team2.name,
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

      if (!match.messageId) {
        const msg = await channel.send({
          embeds: [embed],
        });

        match.messageId = msg.id;
      } else {
        const msg = await channel.messages
          .fetch(match.messageId)
          .catch(() => null);

        if (msg) {
          await msg.edit({
            embeds: [embed],
          });
        }
      }

      if (match.minute >= 90) {
        clearInterval(interval);

        applyMatchResult(
          team1,
          team2,
          match.score1,
          match.score2
        );

        const winner =
          match.score1 === match.score2
            ? "🤝 **Beraberlik!**"
            : match.score1 > match.score2
            ? `🏆 **${team1.name} kazandı!**`
            : `🏆 **${team2.name} kazandı!**`;

        const finalEmbed = new EmbedBuilder()
          .setTitle(
            `🏁 MAÇ SONA ERDİ • ${team1.name} ${match.score1}-${match.score2} ${team2.name}`
          )
          .setDescription(
            `${winner}\n\n` +
            `⏱️ **90'**\n\n` +
            (match.events.length
              ? match.events
                  .slice()
                  .reverse()
                  .map(
                    (e) =>
                      `**${e.minute}'** ${e.text}`
                  )
                  .join("\n")
              : "Bu maçta gol olmadı.")
          )
          .addFields(
            {
              name: "💰 Takım Değerleri",
              value:
                `**${team1.name}:** ${formatMoney(
                  value1
                )}\n` +
                `**${team2.name}:** ${formatMoney(
                  value2
                )}`,
            }
          )
          .setFooter({
            text: "Axera League • Maç Sonucu",
          })
          .setTimestamp();

        const finalMessage = await channel.messages
          .fetch(match.messageId)
          .catch(() => null);

        if (finalMessage) {
          await finalMessage.edit({
            embeds: [finalEmbed],
          });
        }

        delete data.activeMatches[teamId1];
        delete data.activeMatches[teamId2];

        if (fixture) {
          fixture.status = "TAMAMLANDI";
          fixture.score1 = match.score1;
          fixture.score2 = match.score2;
          fixture.finishedAt = Date.now();
        }

        saveData();

        await updateStandingsMessage();
      }
    } catch (err) {
      console.error("Maç döngüsü hatası:", err);
      clearInterval(interval);

      delete data.activeMatches[teamId1];
      delete data.activeMatches[teamId2];

      saveData();
    }
  }, 3000);
}

/* =========================
   TARİH / FİKSTÜR
========================= */

function getLocalDateTimeParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function isFixtureDue(fixture) {
  const now = getLocalDateTimeParts();

  const target = `${fixture.date} ${fixture.time}`;
  const current = `${now.date} ${now.time}`;

  return current >= target;
}

async function checkFixtures() {
  for (const fixture of data.fixtures) {
    if (fixture.status !== "BEKLIYOR") continue;

    if (!isFixtureDue(fixture)) continue;

    const team1 = data.teams[fixture.team1];
    const team2 = data.teams[fixture.team2];

    if (!team1 || !team2) {
      fixture.status = "HATA";
      saveData();
      continue;
    }

    if (
      isTeamPlaying(team1.id) ||
      isTeamPlaying(team2.id)
    ) {
      continue;
    }

    fixture.status = "BAŞLIYOR";
    fixture.startedAt = Date.now();

    saveData();

    const fixtureChannel = client.channels.cache.get(
      CHANNELS.PUAN
    );

    if (fixtureChannel?.isTextBased()) {
      await fixtureChannel.send(
        `⚽ **FİKSTÜR BAŞLIYOR!**\n` +
        `**${team1.name}** 🆚 **${team2.name}**`
      );
    }

    await startMatch(
      team1.id,
      team2.id,
      fixture
    );
  }
}

/* =========================
   HAZIR
========================= */

client.once("ready", async () => {
  console.log(`✅ ${client.user.tag} aktif!`);
  console.log(`🌍 Time Zone: ${TIME_ZONE}`);

  await updateStandingsMessage();

  setInterval(checkFixtures, 1000);
});

/* =========================
   YENİ ÜYE
========================= */

client.on("guildMemberAdd", async (member) => {
  try {
    const channel = member.guild.channels.cache.get(
      CHANNELS.KAYIT
    );

    if (!channel?.isTextBased()) return;

    await channel.send(
      `👋 ${member} hoşgeldin sunucumuza!\n` +
      `📋 <@&${ROLES.KAYIT}> seninle ilgilenecektir.`
    );
  } catch (err) {
    console.error("Hoşgeldin mesajı:", err);
  }
});

/* =========================
   MESAJ KOMUTLARI
========================= */

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (!message.content.startsWith(".")) return;

  const raw = message.content.slice(1).trim();

  if (!raw) return;

  const parts = raw.split(/\s+/);
  const command = parts.shift().toLowerCase();
  const args = parts;

  try {
    /* =====================
       YARDIM
    ===================== */

    if (
      command === "yardım" ||
      command === "yardim"
    ) {
      const embed = new EmbedBuilder()
        .setTitle("📚 AXERA LEAGUE • KOMUTLAR")
        .setDescription(
          [
            "**👤 Kayıt**",
            "`.k @Oyuncu TakmaAdı`",
            "`.kayıtsızver @Oyuncu`",
            "",
            "**⚽ Oyuncu**",
            "`.ant`",
            "`.antrenman`",
            "`.pen`",
            "`.penaltı`",
            "`.dver @Oyuncu 5`",
            "`.dsil @Oyuncu 5`",
            "`.ara Oyuncu`",
            "",
            "**💰 Kişisel Bütçe**",
            "`.bütçe`",
            "`.bütçe @Oyuncu`",
            "`.gönder @Oyuncu 50M`",
            "`.paraekle @Oyuncu 50M`",
            "`.parasil @Oyuncu 20M`",
            "`.paraayarla @Oyuncu 100M`",
            "",
            "**⚽ Takım**",
            "`.takımekle @Takım`",
            "`.takımkaldır @Takım`",
            "`.kadroekle @Takım @Oyuncu SNT`",
            "`.kadrocikar @Takım @Oyuncu`",
            "`.kadro @Takım`",
            "`.formasyon @Takım`",
            "`.takımdeğer @Takım 850`",
            "",
            "**🏆 Lig**",
            "`.maç @Takım1 @Takım2`",
            "`.puan`",
            "`.puanekle @Takım 3`",
            "",
            "**📅 Fikstür**",
            "`.fiksturekle @Takım1 @Takım2 2026-09-05 20:30`",
            "`.fikstur`",
            "`.fiksturcikar @Takım1 @Takım2`",
            "",
            "**🛠️ Yönetim**",
            "`.tweet mesaj`",
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

      await message.reply({ embeds: [embed] });
      return;
    }

    /* =====================
       KAYIT
    ===================== */

    if (command === "k") {
      if (!hasRole(message.member, ROLES.KAYIT)) {
        await message.reply("❌ Bu komutu yalnızca Kayıt Yetkilisi kullanabilir.");
        return;
      }

      if (message.channel.id !== CHANNELS.KAYIT) {
        await message.reply("❌ Bu komutu yalnızca kayıt kanalında kullanabilirsin.");
        return;
      }

      const target = getMemberFromMention(message);

      if (!target) {
        await message.reply(
          "❌ Kullanım: `.k @Oyuncu TakmaAdı`"
        );
        return;
      }

      const nickname = args
        .slice(1)
        .join(" ")
        .trim();

      if (!nickname) {
        await message.reply(
          "❌ Oyuncu için bir takma ad yazmalısın."
        );
        return;
      }

      if (nickname.length > 32) {
        await message.reply(
          "❌ Takma ad en fazla 32 karakter olabilir."
        );
        return;
      }

      try {
        await target.setNickname(nickname);

        const row =
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`register_fut_${target.id}`)
              .setLabel("Futbolcu")
              .setEmoji("⚽")
              .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
              .setCustomId(`register_kl_${target.id}`)
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
          .setTitle("📋 AXERA LEAGUE • KAYIT")
          .setDescription(
            `${target}\n\n` +
            "Oyuncunun rolünü seçmek için aşağıdaki butonlardan birine basın."
          )
          .setFooter({
            text: "Sadece Kayıt Yetkilisi seçim yapabilir.",
          });

        await message.channel.send({
          embeds: [embed],
          components: [row],
        });

        return;
      } catch {
        await message.reply(
          "❌ Takma ad değiştirilemedi. Botun rol sırasını ve yetkilerini kontrol et."
        );
        return;
      }
    }

    /* =====================
       KAYITSIZ VER
    ===================== */

    if (
      command === "kayıtsızver" ||
      command === "kayitsizver"
    ) {
      if (!hasRole(message.member, ROLES.KAYIT)) {
        await message.reply("❌ Sadece Kayıt Yetkilisi kullanabilir.");
        return;
      }

      const target = getMemberFromMention(message);

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
        `✅ ${target} artık **Kayıtsız** rolünde.`
      );

      return;
    }

    /* =====================
       ANTRENMAN
    ===================== */

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

      const user = getUserData(message.author.id);

      user.training++;

      if (user.training >= 5) {
        const member = message.member;

        const result = await changePlayerValue(
          member,
          5
        );

        if (!result.ok) {
          user.training = 4;
          saveData();

          await message.reply(
            `❌ Ödül verilemedi: ${result.error}`
          );

          return;
        }

        user.training = 0;
        saveData();

        await message.reply(
          `🏋️ **ANTRENMAN TAMAMLANDI!**\n\n` +
          `🎁 Kazanç: **+5M€**\n` +
          `💰 Yeni değer: **${formatMoney(
            result.value
          )}**`
        );

        return;
      }

      saveData();

      await message.reply(
        `🏋️ Antrenman ilerlemesi: **${user.training}/5**`
      );

      return;
    }

    /* =====================
       PENALTI
    ===================== */

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

      const result = Math.floor(
        Math.random() * 3
      );

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
          `🧤 Axera Kalecisi çaresiz kaldı!\n` +
          `🎁 Ödül: **+5M€**\n` +
          `💰 Yeni değer: **${formatMoney(
            change.value
          )}**`
        );
      } else if (result === 1) {
        await message.reply(
          `🥅 **DİREK!**\n\n` +
          `Top direkten döndü. Ödül yok.`
        );
      } else {
        await message.reply(
          `🧤 **KURTARDI!**\n\n` +
          `Axera Kalecisi penaltıyı kurtardı. Ödül yok.`
        );
      }

      return;
    }

    /* =====================
       DEĞER VER
    ===================== */

    if (command === "dver") {
      if (!hasRole(message.member, ROLES.DEGER)) {
        await message.reply(
          "❌ Sadece Değer Yetkilisi kullanabilir."
        );
        return;
      }

      const target = getMemberFromMention(message);
      const amount = Number(args[1]);

      if (!target || !Number.isFinite(amount) || amount <= 0) {
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
        await message.reply(`❌ ${result.error}`);
        return;
      }

      await message.reply(
        `✅ ${target} oyuncusuna **+${amount}M€** değer verildi.\n` +
        `💰 Yeni değer: **${formatMoney(
          result.value
        )}**`
      );

      return;
    }

    /* =====================
       DEĞER SİL
    ===================== */

    if (command === "dsil") {
      if (!hasRole(message.member, ROLES.DEGER)) {
        await message.reply(
          "❌ Sadece Değer Yetkilisi kullanabilir."
        );
        return;
      }

      const target = getMemberFromMention(message);
      const amount = Number(args[1]);

      if (!target || !Number.isFinite(amount) || amount <= 0) {
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
        await message.reply(`❌ ${result.error}`);
        return;
      }

      await message.reply(
        `✅ ${target} oyuncusundan **-${amount}M€** değer silindi.\n` +
        `💰 Yeni değer: **${formatMoney(
          result.value
        )}**`
      );

      return;
    }

    /* =====================
       BÜTÇE
    ===================== */

    if (
      command === "bütçe" ||
      command === "butce"
    ) {
      const target =
        getMemberFromMention(message) ||
        message.member;

      const user = getUserData(target.id);

      const embed = new EmbedBuilder()
        .setTitle("💰 AXERA LEAGUE • KİŞİSEL BÜTÇE")
        .setDescription(
          `${target}\n\n` +
          `💵 Bakiye: **${formatMoney(
            user.budget
          )}**`
        )
        .setFooter({
          text: "Bütçe, oyuncu değerinden bağımsızdır.",
        });

      await message.reply({
        embeds: [embed],
      });

      return;
    }

    /* =====================
       PARA GÖNDER
    ===================== */

    if (
      command === "gönder" ||
      command === "gonder"
    ) {
      const target = getMemberFromMention(message);
      const amount = parseMoney(args[1]);

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
          `💰 Bakiyen: **${formatMoney(
            sender.budget
          )}**`
        );
        return;
      }

      sender.budget -= amount;
      receiver.budget += amount;

      saveData();

      await message.reply(
        `✅ ${target} kullanıcısına **${formatMoney(
          amount
        )}** gönderildi.\n\n` +
        `💰 Yeni bakiyen: **${formatMoney(
          sender.budget
        )}**`
      );

      return;
    }

    /* =====================
       PARA EKLE
    ===================== */

    if (command === "paraekle") {
      if (!hasRole(message.member, ROLES.DEGER)) {
        await message.reply(
          "❌ Sadece Değer Yetkilisi kullanabilir."
        );
        return;
      }

      const target = getMemberFromMention(message);
      const amount = parseMoney(args[1]);

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

      const user = getUserData(target.id);

      user.budget += amount;

      saveData();

      await message.reply(
        `✅ ${target} bütçesine **${formatMoney(
          amount
        )}** eklendi.\n` +
        `💰 Yeni bütçe: **${formatMoney(
          user.budget
        )}**`
      );

      return;
    }

    /* =====================
       PARA SİL
    ===================== */

    if (command === "parasil") {
      if (!hasRole(message.member, ROLES.DEGER)) {
        await message.reply(
          "❌ Sadece Değer Yetkilisi kullanabilir."
        );
        return;
      }

      const target = getMemberFromMention(message);
      const amount = parseMoney(args[1]);

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

      const user = getUserData(target.id);

      user.budget = Math.max(
        0,
        user.budget - amount
      );

      saveData();

      await message.reply(
        `✅ ${target} bütçesinden **${formatMoney(
          amount
        )}** silindi.\n` +
        `💰 Yeni bütçe: **${formatMoney(
          user.budget
        )}**`
      );

      return;
    }

    /* =====================
       PARA AYARLA
    ===================== */

    if (command === "paraayarla") {
      if (!hasRole(message.member, ROLES.DEGER)) {
        await message.reply(
          "❌ Sadece Değer Yetkilisi kullanabilir."
        );
        return;
      }

      const target = getMemberFromMention(message);
      const amount = parseMoney(args[1]);

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

      const user = getUserData(target.id);

      user.budget = amount;

      saveData();

      await message.reply(
        `✅ ${target} bütçesi **${formatMoney(
          amount
        )}** olarak ayarlandı.`
      );

      return;
    }

    /* =====================
       ARA
    ===================== */

    if (command === "ara") {
      const query = args.join(" ")
        .trim()
        .toLowerCase();

      if (!query) {
        await message.reply(
          "❌ Kullanım: `.ara W.Sneijder`"
        );
        return;
      }

      const members =
        message.guild.members.cache.filter(
          (m) =>
            !m.user.bot &&
            (m.nickname || m.user.username)
              .toLowerCase()
              .includes(query)
        );

      const target = members.first();

      if (!target) {
        const embed = new EmbedBuilder()
          .setTitle("🔎 Oyuncu Arama")
          .setDescription(
            `⚪ **BOŞ**\n\nAranan: \`${query}\``
          );

        await message.reply({
          embeds: [embed],
        });

        return;
      }

      const value =
        getStoredOrNicknameValue(target);

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
              `${target}\n` +
              `\`${target.displayName}\``,
          },
          {
            name: "Değer",
            value: formatMoney(value),
          },
          {
            name: "Durum",
            value: "🟢 DOLU",
          }
        );

      await message.reply({
        embeds: [embed],
      });

      return;
    }

    /* =====================
       TAKIM EKLE
    ===================== */

    if (command === "takımekle") {
      if (!hasRole(message.member, ROLES.MAC)) {
        await message.reply(
          "❌ Sadece Maç Yetkilisi kullanabilir."
        );
        return;
      }

      const role = getRoleFromMention(message);

      if (!role) {
        await message.reply(
          "❌ Kullanım: `.takımekle @Takım`"
        );
        return;
      }

      if (data.teams[role.id]) {
        await message.reply(
          "❌ Bu takım zaten sistemde."
        );
        return;
      }

      ensureTeam(role.id, role.name);
      ensureStanding(role.id, role.name);

      saveData();
      await updateStandingsMessage();

      await message.reply(
        `✅ ${role} takımı Axera League'e eklendi.`
      );

      return;
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
      if (!hasRole(message.member, ROLES.MAC)) {
        await message.reply(
          "❌ Sadece Maç Yetkilisi kullanabilir."
        );
        return;
      }

      const role = getRoleFromMention(message);

      if (!role) {
        await message.reply(
          "❌ Kullanım: `.takımkaldır @Takım`"
        );
        return;
      }

      if (isTeamPlaying(role.id)) {
        await message.reply(
          "❌ Bu takım şu anda aktif bir maçta."
        );
        return;
      }

      delete data.teams[role.id];
      delete data.standings[role.id];

      data.fixtures =
        data.fixtures.filter(
          (f) =>
            f.team1 !== role.id &&
            f.team2 !== role.id
        );

      saveData();
      await updateStandingsMessage();

      await message.reply(
        `✅ ${role} takımı sistemden kaldırıldı.`
      );

      return;
    }

    /* =====================
       TAKIM DEĞERİ
    ===================== */

    if (command === "takımdeğer") {
      if (!hasRole(message.member, ROLES.MAC)) {
        await message.reply(
          "❌ Sadece Maç Yetkilisi kullanabilir."
        );
        return;
      }

      const role = getRoleFromMention(message);
      const amount = parseMoney(args[1]);

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

      const team = ensureTeam(
        role.id,
        role.name
      );

      team.manualValue = amount;

      saveData();

      await message.reply(
        `✅ ${role} temel takım değeri **${formatMoney(
          amount
        )}** olarak ayarlandı.\n` +
        `💰 Kadro dahil toplam değer: **${formatMoney(
          getTeamPlayerValues(team)
        )}**`
      );

      return;
    }

    /* =====================
       KADRO EKLE
    ===================== */

    if (command === "kadroekle") {
      if (!hasRole(message.member, ROLES.MAC)) {
        await message.reply(
          "❌ Sadece Maç Yetkilisi kullanabilir."
        );
        return;
      }

      const role = getRoleFromMention(message);
      const target = getMemberFromMention(message);

      const position =
        args[2]?.toUpperCase();

      if (
        !role ||
        !target ||
        !POSITIONS.includes(position)
      ) {
        await message.reply(
          "❌ Kullanım:\n`.kadroekle @Takım @Oyuncu SNT`"
        );
        return;
      }

      const team = ensureTeam(
        role.id,
        role.name
      );

      const value =
        getStoredOrNicknameValue(target);

      team.squad[target.id] = {
        id: target.id,
        name: target.displayName,
        position,
        value,
      };

      saveData();

      await message.reply(
        `✅ ${target} oyuncusu ${role} kadrosuna **${position}** olarak eklendi.\n` +
        `💰 Oyuncu değeri: **${formatMoney(
          value
        )}**\n` +
        `🏆 Takım toplam değeri: **${formatMoney(
          getTeamPlayerValues(team)
        )}**`
      );

      return;
    }

    /* =====================
       KADRO ÇIKAR
    ===================== */

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

      const role = getRoleFromMention(message);
      const target = getMemberFromMention(message);

      if (!role || !target) {
        await message.reply(
          "❌ Kullanım: `.kadrocikar @Takım @Oyuncu`"
        );
        return;
      }

      const team = data.teams[role.id];

      if (!team?.squad?.[target.id]) {
        await message.reply(
          "❌ Bu oyuncu takım kadrosunda değil."
        );
        return;
      }

      delete team.squad[target.id];

      saveData();

      await message.reply(
        `✅ ${target} oyuncusu ${role} kadrosundan çıkarıldı.\n` +
        `💰 Yeni takım değeri: **${formatMoney(
          getTeamPlayerValues(team)
        )}**`
      );

      return;
    }

    /* =====================
       KADRO
    ===================== */

    if (command === "kadro") {
      const role = getRoleFromMention(message);

      if (!role) {
        await message.reply(
          "❌ Kullanım: `.kadro @Takım`"
        );
        return;
      }

      const team = data.teams[role.id];

      if (!team) {
        await message.reply(
          "❌ Bu takım sistemde bulunamadı."
        );
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(
          `⚽ ${team.name} • KADRO`
        )
        .setDescription(
          `📋 Formasyon: **${team.formation}**\n\n` +
          createPitch(team)
        )
        .addFields({
          name: "💰 Takım Değeri",
          value: formatMoney(
            getTeamPlayerValues(team)
          ),
          inline: true,
        })
        .addFields({
          name: "👥 Oyuncu Sayısı",
          value: String(
            Object.keys(team.squad || {})
              .length
          ),
          inline: true,
        })
        .setFooter({
          text: "Axera League",
        });

      await message.reply({
        embeds: [embed],
      });

      return;
    }

    /* =====================
       FORMASYON
    ===================== */

    if (command === "formasyon") {
      if (!hasRole(message.member, ROLES.MAC)) {
        await message.reply(
          "❌ Sadece Maç Yetkilisi kullanabilir."
        );
        return;
      }

      const role = getRoleFromMention(message);

      if (!role) {
        await message.reply(
          "❌ Kullanım: `.formasyon @Takım`"
        );
        return;
      }

      if (!data.teams[role.id]) {
        await message.reply(
          "❌ Bu takım sistemde bulunamadı."
        );
        return;
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
              (formation) => ({
                label: formation,
                value: formation,
              })
            )
          );

      const row =
        new ActionRowBuilder().addComponents(
          menu
        );

      await message.reply({
        content:
          `⚽ **${role.name}** için formasyon seç:`,
        components: [row],
      });

      return;
    }

    /* =====================
       PUAN
    ===================== */

    if (command === "puan") {
      const rows = sortStandings();

      const description =
        rows.length
          ? rows
              .map(
                (t, i) =>
                  `**${i + 1}. ${t.name}** — ` +
                  `O:${t.O} G:${t.G} B:${t.B} M:${t.M} ` +
                  `AG:${t.AG} YG:${t.YG} AV:${t.AV} 🏆${t.P}`
              )
              .join("\n")
          : "Henüz takım yok.";

      const embed = new EmbedBuilder()
        .setTitle(
          "🏆 AXERA LEAGUE • PUAN TABLOSU"
        )
        .setDescription(description)
        .setFooter({
          text: "Puan → Averaj → Atılan Gol",
        });

      await message.reply({
        embeds: [embed],
      });

      return;
    }

    /* =====================
       PUAN EKLE
    ===================== */

    if (command === "puanekle") {
      if (!hasRole(message.member, ROLES.MAC)) {
        await message.reply(
          "❌ Sadece Maç Yetkilisi kullanabilir."
        );
        return;
      }

      const role = getRoleFromMention(message);
      const amount = Number(args[1]);

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
        ensureStanding(
          role.id,
          role.name
        );

      standing.P += amount;

      saveData();
      await updateStandingsMessage();

      await message.reply(
        `✅ ${role} takımına **${amount} puan** eklendi.`
      );

      return;
    }

    /* =====================
       MAÇ
    ===================== */

    if (command === "maç" || command === "mac") {
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

      const team1 = data.teams[roles[0].id];
      const team2 = data.teams[roles[1].id];

      if (!team1 || !team2) {
        await message.reply(
          "❌ Takımlardan biri sisteme eklenmemiş."
        );
        return;
      }

      if (
        isTeamPlaying(team1.id) ||
        isTeamPlaying(team2.id)
      ) {
        await message.reply(
          "❌ Takımlardan biri şu anda başka bir maçta."
        );
        return;
      }

      await message.reply(
        `⚽ **${team1.name}** 🆚 **${team2.name}**\n` +
        `Maç başlatılıyor...`
      );

      await startMatch(
        team1.id,
        team2.id
      );

      return;
    }

    /* =====================
       FİKSTÜR EKLE
    ===================== */

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
        raw.match(
          /<@&(\d+)>\s+<@&(\d+)>\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/
        );

      if (!match || roles.length < 2) {
        await message.reply(
          "❌ Kullanım:\n" +
          "`.fiksturekle @Takım1 @Takım2 2026-09-05 20:30`"
        );
        return;
      }

      const [, , , date, time] = match;

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !/^\d{2}:\d{2}$/.test(time)
      ) {
        await message.reply(
          "❌ Tarih veya saat formatı hatalı."
        );
        return;
      }

      const team1 = data.teams[roles[0].id];
      const team2 = data.teams[roles[1].id];

      if (!team1 || !team2) {
        await message.reply(
          "❌ Takımlardan biri sistemde yok."
        );
        return;
      }

      const fixture = {
        id: `fixture-${Date.now()}`,
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

      data.fixtures.push(fixture);

      saveData();

      await message.reply(
        `✅ Fikstür eklendi!\n\n` +
        `⚽ **${team1.name}** 🆚 **${team2.name}**\n` +
        `📅 ${date}\n` +
        `🕐 ${time}\n` +
        `🌍 ${TIME_ZONE}`
      );

      return;
    }

    /* =====================
       FİKSTÜR
    ===================== */

    if (
      command === "fikstur" ||
      command === "fikstür"
    ) {
      const pending =
        data.fixtures.filter(
          (f) =>
            f.status === "BEKLIYOR" ||
            f.status === "BAŞLIYOR"
        );

      const completed =
        data.fixtures.filter(
          (f) =>
            f.status === "TAMAMLANDI"
        );

      let description = "";

      if (pending.length) {
        description += "📅 **BEKLEYEN MAÇLAR**\n\n";

        for (const f of pending) {
          const t1 = data.teams[f.team1];
          const t2 = data.teams[f.team2];

          description +=
            `⚽ **${t1?.name || "Silinmiş"}** 🆚 **${t2?.name || "Silinmiş"}**\n` +
            `📅 ${f.date} • 🕐 ${f.time}\n\n`;
        }
      }

      if (completed.length) {
        description += "🏁 **TAMAMLANAN MAÇLAR**\n\n";

        for (const f of completed.slice(-10).reverse()) {
          const t1 = data.teams[f.team1];
          const t2 = data.teams[f.team2];

          description +=
            `⚽ **${t1?.name || "Silinmiş"}** ` +
            `${f.score1}-${f.score2} ` +
            `**${t2?.name || "Silinmiş"}**\n` +
            `📅 ${f.date} • ${f.time}\n\n`;
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
        });

      await message.reply({
        embeds: [embed],
      });

      return;
    }

    /* =====================
       FİKSTÜR ÇIKAR
    ===================== */

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
        data.fixtures.findIndex(
          (f) =>
            f.status === "BEKLIYOR" &&
            (
              f.team1 === roles[0].id &&
              f.team2 === roles[1].id
            ) ||
            (
              f.team1 === roles[1].id &&
              f.team2 === roles[0].id
            )
        );

      if (index === -1) {
        await message.reply(
          "❌ Bu iki takım arasında bekleyen fikstür bulunamadı."
        );
        return;
      }

      const removed =
        data.fixtures.splice(index, 1)[0];

      saveData();

      await message.reply(
        `✅ Fikstür kaldırıldı.\n` +
        `📅 ${removed.date} ${removed.time}`
      );

      return;
    }

    /* =====================
       TWEET
    ===================== */

    if (command === "tweet") {
      const text = args.join(" ");

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

    /* =====================
       EMBED
    ===================== */

    if (command === "embed") {
      if (!isAdmin(message.member)) {
        await message.reply(
          "❌ Sadece Yönetici kullanabilir."
        );
        return;
      }

      const content = args.join(" ");
      const [title, description] =
        content.split("|");

      if (!title || !description) {
        await message.reply(
          "❌ Kullanım: `.embed Başlık | Açıklama`"
        );
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(title.trim())
        .setDescription(
          description.trim()
        )
        .setTimestamp();

      await message.channel.send({
        embeds: [embed],
      });

      return;
    }

    /* =====================
       SİL
    ===================== */

    if (command === "sil") {
      if (!isAdmin(message.member)) {
        await message.reply(
          "❌ Sadece Yönetici kullanabilir."
        );
        return;
      }

      const amount = Number(args[0]);

      if (
        !Number.isInteger(amount) ||
        amount < 1 ||
        amount > 1000
      ) {
        await message.reply(
          "❌ 1 ile 1000 arasında bir sayı girmelisin."
        );
        return;
      }

      await message.channel.bulkDelete(
        amount,
        true
      );

      return;
    }

    /* =====================
       KICK
    ===================== */

    if (command === "kick") {
      if (!isAdmin(message.member)) {
        await message.reply(
          "❌ Sadece Yönetici kullanabilir."
        );
        return;
      }

      const target = getMemberFromMention(message);

      if (!target) {
        await message.reply(
          "❌ Kullanım: `.kick @Oyuncu`"
        );
        return;
      }

      await target.kick();

      await message.reply(
        `👢 ${target.user.tag} sunucudan atıldı.`
      );

      return;
    }

    /* =====================
       BAN
    ===================== */

    if (command === "ban") {
      if (!isAdmin(message.member)) {
        await message.reply(
          "❌ Sadece Yönetici kullanabilir."
        );
        return;
      }

      const target = getMemberFromMention(message);

      if (!target) {
        await message.reply(
          "❌ Kullanım: `.ban @Oyuncu`"
        );
        return;
      }

      await target.ban();

      await message.reply(
        `🔨 ${target.user.tag} yasaklandı.`
      );

      return;
    }

    /* =====================
       MUTE
    ===================== */

    if (command === "mute") {
      if (!isAdmin(message.member)) {
        await message.reply(
          "❌ Sadece Yönetici kullanabilir."
        );
        return;
      }

      const target = getMemberFromMention(message);

      if (!target) {
        await message.reply(
          "❌ Kullanım: `.mute @Oyuncu`"
        );
        return;
      }

      await target.timeout(
        10 * 60 * 1000,
        "Axera League mute"
      );

      await message.reply(
        `🔇 ${target} **10 dakika** susturuldu.`
      );

      return;
    }

    /* =====================
       UNMUTE
    ===================== */

    if (command === "unmute") {
      if (!isAdmin(message.member)) {
        await message.reply(
          "❌ Sadece Yönetici kullanabilir."
        );
        return;
      }

      const target = getMemberFromMention(message);

      if (!target) {
        await message.reply(
          "❌ Kullanım: `.unmute @Oyuncu`"
        );
        return;
      }

      await target.timeout(null);

      await message.reply(
        `🔊 ${target} kullanıcısının susturması kaldırıldı.`
      );

      return;
    }
  } catch (err) {
    console.error("Komut hatası:", err);

    try {
      await message.reply(
        "❌ İşlem sırasında bir hata oluştu."
      );
    } catch {}
  }
});

/* =========================
   BUTONLAR + MENÜLER
========================= */

client.on("interactionCreate", async (interaction) => {
  try {
    /* =====================
       KAYIT BUTONLARI
    ===================== */

    if (interaction.isButton()) {
      if (
        interaction.customId.startsWith(
          "register_"
        )
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

        const [, type, userId] =
          interaction.customId.split("_");

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

        saveData();

        const disabledRow =
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
              ),
          ],
          components: [disabledRow],
        });

        const chat =
          interaction.guild.channels.cache.get(
            CHANNELS.SOHBET
          );

        if (chat?.isTextBased()) {
          await chat.send(
            `🎉 ${target} **${roleName}** olarak Axera League'e kaydedildi!`
          );
        }

        return;
      }
    }

    /* =====================
       FORMASYON MENÜSÜ
    ===================== */

    if (interaction.isStringSelectMenu()) {
      if (
        interaction.customId.startsWith(
          "formation_"
        )
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

        const teamId =
          interaction.customId.replace(
            "formation_",
            ""
          );

        const formation =
          interaction.values[0];

        const team = data.teams[teamId];

        if (!team) {
          await interaction.reply({
            content:
              "❌ Takım bulunamadı.",
            ephemeral: true,
          });

          return;
        }

        team.formation = formation;

        saveData();

        await interaction.update({
          content:
            `✅ **${team.name}** formasyonu **${formation}** olarak ayarlandı.`,
          components: [],
        });

        return;
      }
    }
  } catch (err) {
    console.error("Interaction hatası:", err);

    if (!interaction.replied) {
      await interaction
        .reply({
          content:
            "❌ İşlem sırasında bir hata oluştu.",
          ephemeral: true,
        })
        .catch(() => {});
    }
  }
});

/* =========================
   HATA YAKALAMA
========================= */

process.on("unhandledRejection", (err) => {
  console.error(
    "Unhandled Rejection:",
    err
  );
});

process.on("uncaughtException", (err) => {
  console.error(
    "Uncaught Exception:",
    err
  );
});

/* =========================
   BOT GİRİŞ
========================= */

if (!TOKEN) {
  console.error(
    "❌ TOKEN bulunamadı! Railway Variables kısmına TOKEN ekle."
  );
  process.exit(1);
}

client.login(TOKEN);
