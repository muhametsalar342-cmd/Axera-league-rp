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
  ChannelType
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ============================================================
// AXERA LEAGUE FOOTBALL RP BOT
// ============================================================

const PREFIX = ".";

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

// ============================================================
// ROLLER
// ============================================================

const ROLES = {
  YONETICI: "1534455282426445897",
  KAYIT_YETKILISI: "1534456315366342716",
  DEGER_YETKILISI: "1534456192913375382",
  KAYITSIZ: "1534457560134844517",
  OYUNCU: "1534457228986421278",
  TEKNIK_DIREKTOR: "1534456648930693120",
  UYE: "1534457460163608636",
  MODERATOR: "1534456108415189063",
  SPIKER: "1535251168169697390"
};

// ============================================================
// PING ROLLERİ
// ============================================================

const PING_ROLES = {
  MEDYA: "1547393966553440346",
  PARTNER: "1547393545827123230",
  MAC: "1547393416755941509",
  DUYURU: "1547393331297001522",
  CEKILIS: "1545116885589430312"
};

// ============================================================
// KANALLAR
// ============================================================

const CHANNELS = {
  KAYIT: "1547371376355053599",
  SOHBET: "1547374641763455009",
  ANTRENMAN: "1547375589923618957",
  PENALTI: "1547375997698052166",
  MAC: "1547376935410073692",
  TWEET: "1547377797193011340",
  DEGER: "1547376344927834122",
  PUAN: "1547382143775285431",
  BOT_DURUM: "1547388197796057118"
};

// ============================================================
// VERİ DOSYASI
// ============================================================

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
      fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_DATA, null, 2));
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

let data = loadData();

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Veri kaydedilemedi:", err);
  }
}

// ============================================================
// YARDIMCI FONKSİYONLAR
// ============================================================

function isAdmin(member) {
  return (
    member?.permissions?.has(PermissionFlagsBits.Administrator) ||
    member?.roles?.cache?.has(ROLES.YONETICI)
  );
}

function hasRole(member, roleId) {
  return member?.roles?.cache?.has(roleId);
}

function hasStaff(member) {
  return (
    isAdmin(member) ||
    hasRole(member, ROLES.SPIKER)
  );
}

function hasValuePermission(member) {
  return isAdmin(member) || hasRole(member, ROLES.DEGER_YETKILISI);
}

function hasRegistrationPermission(member) {
  return isAdmin(member) || hasRole(member, ROLES.KAYIT_YETKILISI);
}

function hasModeratorPermission(member) {
  return (
    isAdmin(member) ||
    hasRole(member, ROLES.MODERATOR)
  );
}

function hasMatchPermission(member) {
  return (
    isAdmin(member) ||
    hasRole(member, ROLES.SPIKER)
  );
}

function channelIs(message, id) {
  return message.channel.id === id;
}

function mentionId(text) {
  const match = text.match(/^<@!?(\d+)>/);
  return match ? match[1] : null;
}

function getMentionedMember(message) {
  return message.mentions.members.first() || null;
}

function cleanMentionFromContent(content) {
  return content
    .replace(/^<@!?\d+>\s*/, "")
    .trim();
}

function formatMoney(millions) {
  const value = Number(millions) || 0;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}M€`;
}

function normalizeText(text) {
  return String(text || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .trim();
}

// ============================================================
// PARA / DEĞER SİSTEMİ
// ============================================================

function parseMoney(input) {
  if (!input) return null;

  const raw = String(input)
    .trim()
    .replace(/\s+/g, "")
    .toLocaleUpperCase("tr-TR");

  // B / K yasak
  if (raw.includes("B") || raw.includes("K")) {
    return null;
  }

  const clean = raw.replace(/M€/g, "").replace(/M/g, "");

  if (!/^\d+(?:[.,]\d+)?$/.test(clean)) {
    return null;
  }

  const amount = Number(clean.replace(",", "."));

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return amount;
}

function extractPlayerValue(member) {
  const nick = member.nickname || member.user.username || "";

  // Sadece sonundaki M€ aranır.
  const match = nick.match(/(\d+(?:[.,]\d+)?)M€\s*$/i);

  if (!match) return null;

  const value = Number(match[1].replace(",", "."));

  if (!Number.isFinite(value)) return null;

  return value;
}

function ensureUser(userId) {
  if (!data.users[userId]) {
    data.users[userId] = {
      value: 0,
      registered: false,
      roleType: null,
      training: 0
    };
  }

  return data.users[userId];
}

async function changePlayerValue(member, amount) {
  if (!member) return false;

  const current = extractPlayerValue(member);

  if (current === null) {
    return false;
  }

  const next = Math.max(0, Math.min(1000, current + amount));

  // İsmin geri kalanına dokunulmuyor.
  const nick = member.nickname || member.user.username;

  const match = nick.match(/(\d+(?:[.,]\d+)?)M€\s*$/i);

  if (!match) return false;

  const replacement = `${next}M€`;

  const newNick =
    nick.slice(0, match.index) + replacement;

  try {
    await member.setNickname(newNick);
  } catch (err) {
    console.log("Nickname değiştirilemedi:", err.message);
  }

  const user = ensureUser(member.id);
  user.value = next;

  saveData();

  return true;
}

// ============================================================
// İSTATİSTİK
// ============================================================

function ensureStats(userId) {
  if (!data.stats[userId]) {
    data.stats[userId] = {
      goals: 0,
      assists: 0,
      matches: 0
    };
  }

  return data.stats[userId];
}

// ============================================================
// KAYIT SİSTEMİ
// ============================================================

function registrationButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("register_player")
      .setLabel("⚽ Futbolcu")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("register_member")
      .setLabel("👤 Üye")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("register_td")
      .setLabel("🧑‍💼 Teknik Direktör")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("register_gk")
      .setLabel("🧤 Kaleci")
      .setStyle(ButtonStyle.Primary)
  );
}

async function registerMember(member, roleType, nickname) {
  const guild = member.guild;

  const allRegistrationRoles = [
    ROLES.KAYITSIZ,
    ROLES.OYUNCU,
    ROLES.TEKNIK_DIREKTOR,
    ROLES.UYE
  ];

  for (const roleId of allRegistrationRoles) {
    if (guild.roles.cache.has(roleId)) {
      await member.roles.remove(roleId).catch(() => {});
    }
  }

  let selectedRole = null;

  if (roleType === "player") {
    selectedRole = ROLES.OYUNCU;
  }

  if (roleType === "member") {
    selectedRole = ROLES.UYE;
  }

  if (roleType === "td") {
    selectedRole = ROLES.TEKNIK_DIREKTOR;
  }

  if (roleType === "gk") {
    selectedRole = ROLES.OYUNCU;
  }

  if (selectedRole) {
    await member.roles.add(selectedRole).catch(() => {});
  }

  const user = ensureUser(member.id);
  user.registered = true;
  user.roleType = roleType;

  if (nickname) {
    await member.setNickname(nickname).catch(() => {});
  }

  saveData();
}

async function makeRegistrationPanel(message, target, nickname) {
  const embed = new EmbedBuilder()
    .setTitle("📋 Axera League Kayıt")
    .setDescription(
      `👤 **Oyuncu:** ${target}\n` +
      `📝 **İsim:** ${nickname || "Belirtilmedi"}\n\n` +
      `Aşağıdaki butonlardan kayıt türünü seçin.`
    )
    .setFooter({
      text: "Axera League • Kayıt Sistemi"
    });

  const sent = await message.channel.send({
    embeds: [embed],
    components: [registrationButtons()]
  });

  data.registrationPanels[sent.id] = {
    targetId: target.id,
    nickname,
    createdBy: message.author.id
  };

  saveData();
}

// ============================================================
// .ARA SİSTEMİ
// ============================================================

function similarity(a, b) {
  a = normalizeText(a);
  b = normalizeText(b);

  if (!a || !b) return 0;

  if (a === b) return 100;

  if (a.startsWith(b)) return 90;

  if (b.startsWith(a)) return 85;

  if (a.includes(b)) return 75;

  if (b.includes(a)) return 70;

  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;

  if (!shorter) return 0;

  let same = 0;

  for (const char of shorter) {
    if (longer.includes(char)) {
      same++;
    }
  }

  return Math.round((same / longer.length) * 60);
}

async function searchRegisteredMembers(guild, query) {
  const q = normalizeText(query);

  if (!q) return [];

  await guild.members.fetch();

  const results = [];

  for (const member of guild.members.cache.values()) {
    if (member.user.bot) continue;

    // Sadece kayıtlılar
    if (member.roles.cache.has(ROLES.KAYITSIZ)) continue;

    const registered = data.users[member.id]?.registered;

    if (!registered) continue;

    const nickname = member.nickname || "";
    const displayName = member.displayName || "";
    const username = member.user.username || "";

    const scores = [
      similarity(nickname, q),
      similarity(displayName, q),
      similarity(username, q)
    ];

    const score = Math.max(...scores);

    if (
      normalizeText(nickname) === q ||
      normalizeText(displayName) === q ||
      normalizeText(username) === q
    ) {
      results.push({
        member,
        score: 100,
        exact: true
      });
      continue;
    }

    if (
      normalizeText(nickname).includes(q) ||
      normalizeText(displayName).includes(q) ||
      normalizeText(username).includes(q)
    ) {
      results.push({
        member,
        score,
        exact: false
      });
      continue;
    }

    if (score >= 35) {
      results.push({
        member,
        score,
        exact: false
      });
    }
  }

  return results.sort((a, b) => {
    if (b.exact !== a.exact) {
      return Number(b.exact) - Number(a.exact);
    }

    return b.score - a.score;
  });
}

// ============================================================
// TAKIM SİSTEMİ
// ============================================================

function ensureTeam(teamId) {
  if (!data.teams[teamId]) {
    data.teams[teamId] = {
      name: "",
      players: [],
      value: 0,
      active: true
    };
  }

  return data.teams[teamId];
}

function ensureStanding(teamId, name) {
  if (!data.standings[teamId]) {
    data.standings[teamId] = {
      name,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      gf: 0,
      ga: 0,
      points: 0
    };
  }

  return data.standings[teamId];
}

function getTeamMembers(guild, teamId) {
  const role = guild.roles.cache.get(teamId);

  if (!role) return [];

  return role.members.filter(m => !m.user.bot);
}

function getTeamPlayers(guild, team) {
  const result = new Map();

  if (!team) return [];

  const roleMembers = getTeamMembers(guild, team.roleId);

  for (const member of roleMembers) {
    result.set(member.id, member);
  }

  for (const player of team.players || []) {
    const member = guild.members.cache.get(player.id);

    if (member && !member.user.bot) {
      result.set(member.id, member);
    }
  }

  return [...result.values()];
}

// ============================================================
// FORMASYON
// ============================================================

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
        FORMATIONS.map(f => ({
          label: f,
          value: f,
          description: `${f} formasyonunu seç`
        }))
      )
  );
}

// ============================================================
// MAÇ SİSTEMİ
// ============================================================

function randomItem(arr) {
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function getPlayerName(member) {
  return member?.displayName || member?.user?.username || "Oyuncu";
}

function teamStrength(guild, team) {
  const players = getTeamPlayers(guild, team);

  let total = Number(team.value || 0);

  for (const player of players) {
    const value = extractPlayerValue(player);

    if (value !== null) {
      total += value;
    }
  }

  return Math.max(1, total);
}

function randomCommentary(teamName, opponentName, players) {
  const player = randomItem(players);

  const name = player
    ? getPlayerName(player)
    : "Oyuncu";

  const comments = [
    `${name} topu kontrol ediyor ve rakip yarı sahaya ilerliyor.`,
    `${name} pasını verdi, ${teamName} oyunu kanada taşıyor.`,
    `${name} ceza sahasına doğru hareketleniyor.`,
    `${teamName} savunması rakibin atağını karşılıyor.`,
    `${teamName} topa sahip ve oyunun temposunu belirliyor.`,
    `${opponentName} baskıyı artırıyor.`,
    `${name} uzaklardan şansını deniyor.`,
    `${teamName} hızlı bir kontra atağa çıkıyor.`,
    `${name} kritik bir pas arıyor.`,
    `Kaleci topu kontrol etti ve oyunu başlattı.`
  ];

  return randomItem(comments);
}

async function startMatch(guild, team1, team2, source = "manual") {
  const id = `${team1.roleId}_${team2.roleId}_${Date.now()}`;

  const players1 = getTeamPlayers(guild, team1);
  const players2 = getTeamPlayers(guild, team2);

  const strength1 = teamStrength(guild, team1);
  const strength2 = teamStrength(guild, team2);

  data.activeMatches[id] = {
    id,
    team1: team1.roleId,
    team2: team2.roleId,
    team1Name: team1.name,
    team2Name: team2.name,
    score1: 0,
    score2: 0,
    minute: 0,
    source,
    players1: players1.map(x => x.id),
    players2: players2.map(x => x.id),
    events: [],
    finished: false
  };

  saveData();

  const channel = guild.channels.cache.get(CHANNELS.MAC);

  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle("⚽ AXERA LEAGUE — CANLI MAÇ")
    .setDescription(
      `**${team1.name}**  0 - 0  **${team2.name}**\n\n` +
      `⏱️ Dakika: **0'**\n\n` +
      `🏟️ Maç başlıyor...`
    )
    .setFooter({
      text: "Axera League • Canlı Maç Sistemi"
    });

  const msg = await channel.send({
    embeds: [embed]
  });

  data.activeMatches[id].messageId = msg.id;
  saveData();

  const interval = setInterval(async () => {
    const match = data.activeMatches[id];

    if (!match || match.finished) {
      clearInterval(interval);
      return;
    }

    try {
      match.minute += 1;

      const eventChance = Math.random();

      let commentary = randomCommentary(
        team1.name,
        team2.name,
        players1.length ? players1 : players2
      );

      // Küçük değer avantajı
      const total = strength1 + strength2;
      let chance1 = 0.5;

      if (total > 0) {
        chance1 = 0.5 + ((strength1 - strength2) / total) * 0.12;
      }

      if (eventChance < 0.045) {
        const team1Scores = Math.random() < chance1;

        if (team1Scores) {
          match.score1++;

          const scorer = randomItem(players1);

          if (scorer) {
            const stats = ensureStats(scorer.id);
            stats.goals++;

            await changePlayerValue(scorer, 2);

            commentary =
              `⚽ GOOOOL! ${getPlayerName(scorer)} topu ağlara gönderdi!`;
          } else {
            commentary =
              `⚽ GOOOOL! ${team1.name} öne geçiyor!`;
          }
        } else {
          match.score2++;

          const scorer = randomItem(players2);

          if (scorer) {
            const stats = ensureStats(scorer.id);
            stats.goals++;

            await changePlayerValue(scorer, 2);

            commentary =
              `⚽ GOOOOL! ${getPlayerName(scorer)} topu ağlara gönderdi!`;
          } else {
            commentary =
              `⚽ GOOOOL! ${team2.name} öne geçiyor!`;
          }
        }
      }

      if (eventChance >= 0.045 && eventChance < 0.09) {
        commentary = `🧤 Kaleci harika bir kurtarış yaptı!`;
      }

      if (eventChance >= 0.09 && eventChance < 0.13) {
        commentary = `🟨 Hakem faul düdüğünü çaldı.`;
      }

      match.events.push({
        minute: match.minute,
        text: commentary
      });

      if (match.events.length > 8) {
        match.events.shift();
      }

      const recent = match.events
        .slice(-5)
        .reverse()
        .map(e => `**${e.minute}'** ${e.text}`)
        .join("\n");

      const liveEmbed = new EmbedBuilder()
        .setTitle("⚽ AXERA LEAGUE — CANLI MAÇ")
        .setDescription(
          `**${team1.name}**  **${match.score1}** - **${match.score2}**  **${team2.name}**\n\n` +
          `⏱️ **${match.minute}'**\n\n` +
          `### 📣 Maç Akışı\n${recent || "Maç devam ediyor..."}`
        )
        .setFooter({
          text: "3 gerçek saniye = 1 maç dakikası"
        });

      await msg.edit({
        embeds: [liveEmbed]
      });

      if (match.minute >= 90) {
        clearInterval(interval);
        await finishMatch(guild, id);
      }

      saveData();
    } catch (err) {
      console.error("Maç hatası:", err);
      clearInterval(interval);

      if (data.activeMatches[id]) {
        data.activeMatches[id].finished = true;
        saveData();
      }
    }
  }, 3000);
}

async function finishMatch(guild, matchId) {
  const match = data.activeMatches[matchId];

  if (!match || match.finished) return;

  match.finished = true;

  const team1 = data.teams[match.team1];
  const team2 = data.teams[match.team2];

  if (!team1 || !team2) {
    delete data.activeMatches[matchId];
    saveData();
    return;
  }

  const s1 = ensureStanding(match.team1, team1.name);
  const s2 = ensureStanding(match.team2, team2.name);

  s1.played++;
  s2.played++;

  s1.gf += match.score1;
  s1.ga += match.score2;

  s2.gf += match.score2;
  s2.ga += match.score1;

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

  const players = [
    ...(match.players1 || []),
    ...(match.players2 || [])
  ];

  for (const playerId of players) {
    const member = guild.members.cache.get(playerId);

    if (!member) continue;

    const rewardKey = `${matchId}_${playerId}`;

    if (data.matchRewards[rewardKey]) continue;

    data.matchRewards[rewardKey] = true;

    const stats = ensureStats(playerId);
    stats.matches++;

    await changePlayerValue(member, 5);
  }

  const resultEmbed = new EmbedBuilder()
    .setTitle("🏁 AXERA LEAGUE — MAÇ SONU")
    .setDescription(
      `**${team1.name}**  **${match.score1}** - **${match.score2}**  **${team2.name}**`
    )
    .addFields(
      {
        name: "🏆 Sonuç",
        value:
          match.score1 > match.score2
            ? `Kazanan: **${team1.name}**`
            : match.score2 > match.score1
              ? `Kazanan: **${team2.name}**`
              : "Maç **berabere** bitti."
      },
      {
        name: "💶 Oyuncu Ödülü",
        value: "Maça katılan her oyuncuya **+5M€**"
      }
    );

  const channel = guild.channels.cache.get(CHANNELS.MAC);

  if (channel) {
    await channel.send({
      embeds: [resultEmbed]
    });
  }

  data.matchHistory.push({
    id: matchId,
    team1: team1.name,
    team2: team2.name,
    score1: match.score1,
    score2: match.score2,
    date: Date.now()
  });

  delete data.activeMatches[matchId];

  saveData();
}

// ============================================================
// FİKSTÜR
// ============================================================

function parseDateTime(date, time) {
  const value = new Date(`${date}T${time}:00`);
  if (Number.isNaN(value.getTime())) return null;
  return value;
}

async function startFixtureIfDue(guild, fixture) {
  if (fixture.played) return;

  if (Date.now() < fixture.timestamp) return;

  const team1 = data.teams[fixture.team1];
  const team2 = data.teams[fixture.team2];

  if (!team1 || !team2) {
    fixture.played = true;
    saveData();
    return;
  }

  fixture.played = true;

  await startMatch(guild, team1, team2, "fixture");

  saveData();
}

// ============================================================
// ANTRENMAN
// ============================================================

async function useTraining(member) {
  const id = member.id;

  if (!data.training[id]) {
    data.training[id] = 0;
  }

  data.training[id]++;

  const count = data.training[id];

  if (count >= 5) {
    data.training[id] = 0;

    const rewarded = await changePlayerValue(member, 3);

    saveData();

    return {
      completed: true,
      rewarded
    };
  }

  saveData();

  return {
    completed: false,
    count
  };
}

// ============================================================
// PENALTI
// ============================================================

async function takePenalty(member) {
  const result = Math.random();

  if (result < 0.50) {
    const rewarded = await changePlayerValue(member, 5);

    return {
      type: "goal",
      rewarded
    };
  }

  if (result < 0.75) {
    return {
      type: "post",
      rewarded: false
    };
  }

  return {
    type: "save",
    rewarded: false
  };
}

// ============================================================
// TWEET
// ============================================================

function canTweet(memberId) {
  const last = data.tweetCooldowns[memberId] || 0;
  return Date.now() - last >= 24 * 60 * 60 * 1000;
}

// ============================================================
// TICKET
// ============================================================

function ticketButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_close")
      .setLabel("🔒 Bileti Kapat")
      .setStyle(ButtonStyle.Danger)
  );
}

// ============================================================
// ROL PANELİ
// ============================================================

function rolePanelRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ping_partner")
        .setLabel("🤝 Partner Ping")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("ping_match")
        .setLabel("⚽ Maç Ping")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("ping_announcement")
        .setLabel("📢 Duyuru Ping")
        .setStyle(ButtonStyle.Secondary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ping_giveaway")
        .setLabel("🎉 Çekiliş Ping")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("ping_media")
        .setLabel("📰 Medya Ping")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

// ============================================================
// DURUM MESAJI
// ============================================================

async function updateBotStatus(guild) {
  try {
    const channel = guild.channels.cache.get(CHANNELS.BOT_DURUM);

    if (!channel) return;

    await guild.members.fetch();

    const memberCount = guild.memberCount;

    const registeredCount = guild.members.cache.filter(member => {
      if (member.user.bot) return false;
      if (member.roles.cache.has(ROLES.KAYITSIZ)) return false;
      return data.users[member.id]?.registered === true;
    }).size;

    const teamCount = Object.keys(data.teams).filter(
      id => data.teams[id]?.active !== false
    ).length;

    const activeMatches = Object.keys(data.activeMatches).length;

    const embed = new EmbedBuilder()
      .setTitle("🤖 AXERA LEAGUE BOT")
      .setDescription(
        "⚽ **Axera League | Futbol RP**\n\n" +
        "🟢 **Durum:** Aktif ve çalışıyor\n\n" +
        `👥 **Sunucu Üyesi:** ${memberCount}\n` +
        `📋 **Kayıtlı Üye:** ${registeredCount}\n` +
        `⚽ **Aktif Takım:** ${teamCount}\n` +
        `🏟️ **Aktif Maç:** ${activeMatches}\n\n` +
        "🔧 **Tüm sistemler aktif olarak hizmet vermektedir.**"
      )
      .setFooter({
        text: "Axera League • Sistem Durumu"
      })
      .setTimestamp();

    const messages = await channel.messages.fetch({ limit: 10 });

    const old = messages.find(
      m =>
        m.author.id === client.user.id &&
        m.embeds.length &&
        m.embeds[0].title === "🤖 AXERA LEAGUE BOT"
    );

    if (old) {
      await old.edit({
        embeds: [embed]
      });
    } else {
      await channel.send({
        embeds: [embed]
      });
    }
  } catch (err) {
    console.error("Bot durum hatası:", err.message);
  }
}

// ============================================================
// READY
// ============================================================

client.once("ready", async () => {
  console.log(`✅ ${client.user.tag} aktif!`);

  client.user.setPresence({
    activities: [
      {
        name: "Axera League | Futbol RP",
        type: 0
      }
    ],
    status: "online"
  });

  for (const guild of client.guilds.cache.values()) {
    await updateBotStatus(guild);
  }

  setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      await updateBotStatus(guild);
    }
  }, 60_000);

  setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      for (const fixture of data.fixtures) {
        await startFixtureIfDue(guild, fixture);
      }
    }
  }, 1000);
});

// ============================================================
// ÜYE KATILDI
// ============================================================

client.on("guildMemberAdd", async member => {
  try {
    if (member.user.bot) return;

    if (member.guild.roles.cache.has(ROLES.KAYITSIZ)) {
      await member.roles.add(ROLES.KAYITSIZ).catch(() => {});
    }

    const channel = member.guild.channels.cache.get(CHANNELS.KAYIT);

    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle("👋 Axera League'e Hoş Geldin!")
      .setDescription(
        `${member} sunucuya katıldı.\n\n` +
        `📋 Kayıt işlemin için <@&${ROLES.KAYIT_YETKILISI}> ekibinin ilgilenmesini bekle.`
      )
      .setFooter({
        text: "Axera League • Kayıt Sistemi"
      });

    await channel.send({
      content: `<@&${ROLES.KAYIT_YETKILISI}>`,
      embeds: [embed]
    });

    await updateBotStatus(member.guild);
  } catch (err) {
    console.error("Üye giriş hatası:", err);
  }
});

// ============================================================
// BUTONLAR
// ============================================================

client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;

  try {
    // --------------------------------------------------------
    // KAYIT BUTONLARI
    // --------------------------------------------------------

    if (
      [
        "register_player",
        "register_member",
        "register_td",
        "register_gk"
      ].includes(interaction.customId)
    ) {
      const panel = data.registrationPanels[interaction.message.id];

      if (!panel) {
        return interaction.reply({
          content: "❌ Bu kayıt panelinin süresi dolmuş.",
          ephemeral: true
        });
      }

      if (!hasRegistrationPermission(interaction.member)) {
        return interaction.reply({
          content: "❌ Bu butonları yalnızca Kayıt Yetkilisi kullanabilir.",
          ephemeral: true
        });
      }

      const target = interaction.guild.members.cache.get(panel.targetId);

      if (!target) {
        return interaction.reply({
          content: "❌ Oyuncu bulunamadı.",
          ephemeral: true
        });
      }

      let roleType = "player";

      if (interaction.customId === "register_member") {
        roleType = "member";
      }

      if (interaction.customId === "register_td") {
        roleType = "td";
      }

      if (interaction.customId === "register_gk") {
        roleType = "gk";
      }

      await registerMember(
        target,
        roleType,
        panel.nickname
      );

      const typeNames = {
        player: "⚽ Futbolcu",
        member: "👤 Üye",
        td: "🧑‍💼 Teknik Direktör",
        gk: "🧤 Kaleci"
      };

      await interaction.reply({
        content:
          `✅ ${target} başarıyla kayıt edildi.\n` +
          `Rol: **${typeNames[roleType]}**`,
        ephemeral: true
      });

      await interaction.message.edit({
        components: []
      });

      delete data.registrationPanels[interaction.message.id];
      saveData();

      await updateBotStatus(interaction.guild);

      return;
    }

    // --------------------------------------------------------
    // ROL PANELİ
    // --------------------------------------------------------

    const pingMap = {
      ping_partner: PING_ROLES.PARTNER,
      ping_match: PING_ROLES.MAC,
      ping_announcement: PING_ROLES.DUYURU,
      ping_giveaway: PING_ROLES.CEKILIS,
      ping_media: PING_ROLES.MEDYA
    };

    if (pingMap[interaction.customId]) {
      const roleId = pingMap[interaction.customId];
      const role = interaction.guild.roles.cache.get(roleId);

      if (!role) {
        return interaction.reply({
          content: "❌ Bu rol sunucuda bulunamadı.",
          ephemeral: true
        });
      }

      if (interaction.member.roles.cache.has(roleId)) {
        await interaction.member.roles.remove(roleId);

        return interaction.reply({
          content: `❌ ${role} rolü kaldırıldı.`,
          ephemeral: true
        });
      }

      await interaction.member.roles.add(roleId);

      return interaction.reply({
        content: `✅ ${role} rolü verildi.`,
        ephemeral: true
      });
    }

    // --------------------------------------------------------
    // TICKET KAPAT
    // --------------------------------------------------------

    if (interaction.customId === "ticket_close") {
      const channel = interaction.channel;

      if (!channel.name.startsWith("ticket-")) {
        return interaction.reply({
          content: "❌ Bu kanal bir ticket değil.",
          ephemeral: true
        });
      }

      if (!hasModeratorPermission(interaction.member)) {
        const ticket = Object.values(data.tickets).find(
          t => t.channelId === channel.id
        );

        if (!ticket || ticket.userId !== interaction.user.id) {
          return interaction.reply({
            content: "❌ Bu ticketı kapatamazsın.",
            ephemeral: true
          });
        }
      }

      await interaction.reply("🔒 Ticket kapatılıyor...");

      delete data.tickets[channel.id];
      saveData();

      setTimeout(() => {
        channel.delete().catch(() => {});
      }, 1500);

      return;
    }
  } catch (err) {
    console.error("Interaction hatası:", err);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ İşlem sırasında bir hata oluştu.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

// ============================================================
// MESAJ KOMUTLARI
// ============================================================

client.on("messageCreate", async message => {
  if (!message.guild) return;
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = normalizeText(args.shift());

  try {

    // ========================================================
    // YARDIM
    // ========================================================

    if (command === "yardim") {
      const embed = new EmbedBuilder()
        .setTitle("📚 AXERA LEAGUE — KOMUTLAR")
        .setDescription(
          "⚽ **Futbol RP Sistemleri**\n\n" +

          "**👤 Kayıt**\n" +
          "`.k @Oyuncu İsim`\n" +
          "`.kayitsizver @Oyuncu`\n" +
          "`.ara isim`\n\n" +

          "**💶 Değer**\n" +
          "`.dver @Oyuncu miktar`\n" +
          "`.dsil @Oyuncu miktar`\n" +
          "`.degerler`\n\n" +

          "**🏋️ Oyuncu**\n" +
          "`.ant`\n" +
          "`.antrenman`\n" +
          "`.pen`\n" +
          "`.penalti`\n" +
          "`.tweet mesaj`\n\n" +

          "**⚽ Takım**\n" +
          "`.takimekle @Takım`\n" +
          "`.takimkaldir @Takım`\n" +
          "`.takimdeger @Takım miktar`\n" +
          "`.puanekle @Takım miktar`\n" +
          "`.kadroekle @Takım @Oyuncu Pozisyon`\n" +
          "`.kadrocikar @Takım @Oyuncu`\n" +
          "`.kadro @Takım`\n" +
          "`.formasyon @Takım`\n" +
          "`.puan`\n\n" +

          "**🏟️ Maç**\n" +
          "`.mac @Takım1 @Takım2`\n" +
          "`.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`\n" +
          "`.fikstur`\n" +
          "`.fiksturcikar @Takım1 @Takım2`\n\n" +

          "**🏆 Kupa / Müze**\n" +
          "`.kupaekle @Takım Kupa`\n" +
          "`.kupasil @Takım Kupa`\n" +
          "`.muze @Takım`\n\n" +

          "**🎫 Ticket**\n" +
          "`.ticketpanel`\n\n" +

          "**🎭 Roller**\n" +
          "`.rolpanel`\n" +
          "`.sart`\n\n" +

          "**🛡️ Moderasyon**\n" +
          "`.sil miktar`\n" +
          "`.kick @Oyuncu`\n" +
          "`.ban @Oyuncu`\n" +
          "`.mute @Oyuncu`\n" +
          "`.unmute @Oyuncu`\n" +
          "`.embed Başlık | Açıklama`\n\n" +

          "**📩 Diğer**\n" +
          "`.dm @Oyuncu mesaj`\n" +
          "`.ping`"
        )
        .setFooter({
          text: "Axera League • Futbol RP"
        });

      await message.reply({
        embeds: [embed]
      });

      return;
    }

    // ========================================================
    // PING
    // ========================================================

    if (command === "ping") {
      const msg = await message.reply("🏓 Hesaplanıyor...");

      await msg.edit(
        `🏓 **Pong!** ${client.ws.ping}ms`
      );

      return;
    }

    // ========================================================
    // ŞARTLAR
    // ========================================================

    if (command === "sart") {
      const embed = new EmbedBuilder()
        .setTitle("📋 AXERA LEAGUE — ŞARTLAR")
        .setDescription(
          "✓ **Kalıcı Tık:** Kalıcı 「✓」 kanalına tıklayınız.\n\n" +
          "🎭 **Rol Al:** Rol Al kanalından en az **2 rol** alınız.\n\n" +
          "ℹ️ Bu şartlar **zorunlu değildir**. Şartları tamamlamasanız bile Axera League'in tüm sistemlerinden yararlanmaya devam edebilirsiniz."
        )
        .setFooter({
          text: "Axera League • Bilgilendirme"
        });

      await message.reply({
        embeds: [embed]
      });

      return;
    }

    // ========================================================
    // ROL PANEL
    // ========================================================

    if (command === "rolpanel") {
      if (!isAdmin(message.member)) {
        return message.reply("❌ Bu komutu yalnızca Yönetici kullanabilir.");
      }

      const embed = new EmbedBuilder()
        .setTitle("🎭 AXERA LEAGUE — ROL PANELİ")
        .setDescription(
          "Aşağıdaki butonlardan almak istediğiniz bildirim rollerini seçebilirsiniz.\n\n" +
          "🤝 **Partner Ping** — Partner bildirimleri\n" +
          "⚽ **Maç Ping** — Maç bildirimleri\n" +
          "📢 **Duyuru Ping** — Önemli duyurular\n" +
          "🎉 **Çekiliş Ping** — Çekiliş bildirimleri\n" +
          "📰 **Medya Ping** — Medya bildirimleri\n\n" +
          "Butona tekrar basarsanız ilgili rol kaldırılır."
        )
        .setFooter({
          text: "Axera League • Rol Sistemi"
        });

      await message.channel.send({
        embeds: [embed],
        components: rolePanelRows()
      });

      return;
    }

    // ========================================================
    // KAYIT
    // ========================================================

    if (command === "k") {
      if (!channelIs(message, CHANNELS.KAYIT)) {
        return message.reply(
          `❌ Bu komut <#${CHANNELS.KAYIT}> kanalında kullanılabilir.`
        );
      }

      if (!hasRegistrationPermission(message.member)) {
        return message.reply(
          "❌ Bu komutu yalnızca Kayıt Yetkilisi kullanabilir."
        );
      }

      const target = getMentionedMember(message);

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.k @Oyuncu İsim`"
        );
      }

      const nickname = cleanMentionFromContent(
        message.content.slice(PREFIX.length + command.length)
      );

      await makeRegistrationPanel(
        message,
        target,
        nickname
      );

      return;
    }

    // ========================================================
    // KAYITSIZ VER
    // ========================================================

    if (command === "kayitsizver") {
      if (!hasRegistrationPermission(message.member)) {
        return message.reply(
          "❌ Bu komutu yalnızca Kayıt Yetkilisi kullanabilir."
        );
      }

      const target = getMentionedMember(message);

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.kayitsizver @Oyuncu`"
        );
      }

      for (const roleId of [
        ROLES.OYUNCU,
        ROLES.TEKNIK_DIREKTOR,
        ROLES.UYE
      ]) {
        await target.roles.remove(roleId).catch(() => {});
      }

      await target.roles.add(ROLES.KAYITSIZ).catch(() => {});

      const user = ensureUser(target.id);
      user.registered = false;
      user.roleType = null;

      saveData();

      await message.reply(
        `✅ ${target} tekrar **Kayıtsız** olarak ayarlandı.`
      );

      await updateBotStatus(message.guild);

      return;
    }

    // ========================================================
    // ARA
    // ========================================================

    if (command === "ara") {
      const query = args.join(" ").trim();

      if (!query) {
        return message.reply(
          "❌ Kullanım: `.ara isim`"
        );
      }

      const results = await searchRegisteredMembers(
        message.guild,
        query
      );

      if (!results.length) {
        return message.reply(
          "❌ Bu isimde veya benzer isimde kayıtlı oyuncu bulunamadı."
        );
      }

      const shown = results.slice(0, 10);

      const description = shown
        .map((result, index) => {
          const member = result.member;
          const value = extractPlayerValue(member);

          let role = "Kayıtlı";

          if (member.roles.cache.has(ROLES.TEKNIK_DIREKTOR)) {
            role = "Teknik Direktör";
          } else if (member.roles.cache.has(ROLES.UYE)) {
            role = "Üye";
          } else if (member.roles.cache.has(ROLES.OYUNCU)) {
            role = "Futbolcu";
          }

          return (
            `**${index + 1}. ${member.displayName}**\n` +
            `👤 Kullanıcı: ${member.user.username}\n` +
            `🎭 Rol: ${role}\n` +
            `💶 Değer: ${value !== null ? formatMoney(value) : "Belirtilmemiş"}\n` +
            `🔎 Eşleşme: **%${result.score}**`
          );
        })
        .join("\n\n");

      const embed = new EmbedBuilder()
        .setTitle(`🔎 Oyuncu Arama — ${query}`)
        .setDescription(description)
        .setFooter({
          text: "En yakın eşleşme ilk sırada gösterilir."
        });

      await message.reply({
        embeds: [embed]
      });

      return;
    }

    // ========================================================
    // DEĞER VER
    // ========================================================

    if (command === "dver") {
      if (!channelIs(message, CHANNELS.DEGER)) {
        return message.reply(
          `❌ Bu komut <#${CHANNELS.DEGER}> kanalında kullanılabilir.`
        );
      }

      if (!hasValuePermission(message.member)) {
        return message.reply(
          "❌ Bu komutu yalnızca Değer Yetkilisi kullanabilir."
        );
      }

      const target = getMentionedMember(message);
      const amount = parseMoney(args[1]);

      if (!target || amount === null) {
        return message.reply(
          "❌ Kullanım: `.dver @Oyuncu 5M€`"
        );
      }

      const current = extractPlayerValue(target);

      if (current === null) {
        return message.reply(
          "❌ Oyuncunun takma adının sonunda M€ değer bulunamadı."
        );
      }

      if (current + amount > 1000) {
        return message.reply(
          "❌ Oyuncu değeri en fazla **1000M€** olabilir."
        );
      }

      const ok = await changePlayerValue(
        target,
        amount
      );

      if (!ok) {
        return message.reply(
          "❌ Değer değiştirilemedi."
        );
      }

      await message.reply(
        `✅ ${target} değerine **+${formatMoney(amount)}** eklendi.\n` +
        `💶 Yeni değer: **${formatMoney(current + amount)}**`
      );

      return;
    }

    // ========================================================
    // DEĞER SİL
    // ========================================================

    if (command === "dsil") {
      if (!channelIs(message, CHANNELS.DEGER)) {
        return message.reply(
          `❌ Bu komut <#${CHANNELS.DEGER}> kanalında kullanılabilir.`
        );
      }

      if (!hasValuePermission(message.member)) {
        return message.reply(
          "❌ Bu komutu yalnızca Değer Yetkilisi kullanabilir."
        );
      }

      const target = getMentionedMember(message);
      const amount = parseMoney(args[1]);

      if (!target || amount === null) {
        return message.reply(
          "❌ Kullanım: `.dsil @Oyuncu 5M€`"
        );
      }

      const current = extractPlayerValue(target);

      if (current === null) {
        return message.reply(
          "❌ Oyuncunun takma adının sonunda M€ değer bulunamadı."
        );
      }

      const ok = await changePlayerValue(
        target,
        -amount
      );

      if (!ok) {
        return message.reply(
          "❌ Değer değiştirilemedi."
        );
      }

      await message.reply(
        `✅ ${target} değerinden **-${formatMoney(amount)}** çıkarıldı.\n` +
        `💶 Yeni değer: **${formatMoney(Math.max(0, current - amount))}**`
      );

      return;
    }

    // ========================================================
    // DEĞERLER
    // ========================================================

    if (command === "degerler") {
      if (!channelIs(message, CHANNELS.DEGER)) {
        return message.reply(
          `❌ Bu komut <#${CHANNELS.DEGER}> kanalında kullanılabilir.`
        );
      }

      await message.guild.members.fetch();

      const players = message.guild.members.cache
        .filter(m => !m.user.bot)
        .map(m => ({
          member: m,
          value: extractPlayerValue(m)
        }))
        .filter(x => x.value !== null)
        .sort((a, b) => b.value - a.value)
        .slice(0, 20);

      const text = players.length
        ? players.map(
            (x, i) =>
              `**${i + 1}.** ${x.member.displayName} — **${formatMoney(x.value)}**`
          ).join("\n")
        : "Henüz değerli oyuncu bulunmuyor.";

      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("💶 AXERA LEAGUE — OYUNCU DEĞERLERİ")
            .setDescription(text)
        ]
      });

      return;
    }

    // ========================================================
    // ANTRENMAN
    // ========================================================

    if (command === "ant" || command === "antrenman") {
      if (!channelIs(message, CHANNELS.ANTRENMAN)) {
        return message.reply(
          `❌ Bu komut <#${CHANNELS.ANTRENMAN}> kanalında kullanılabilir.`
        );
      }

      const result = await useTraining(message.member);

      if (result.completed) {
        await message.reply(
          `🏋️ **Antrenman 5/5 tamamlandı!**\n` +
          `💶 Ödül: **+3M€**\n` +
          `🔄 Yeni antrenman: **0/5**`
        );
      } else {
        await message.reply(
          `🏋️ Antrenman yapıldı!\n` +
          `📊 İlerleme: **${result.count}/5**`
        );
      }

      return;
    }

    // ========================================================
    // PENALTI
    // ========================================================

    if (
      command === "pen" ||
      command === "penalti"
    ) {
      if (!channelIs(message, CHANNELS.PENALTI)) {
        return message.reply(
          `❌ Bu komut <#${CHANNELS.PENALTI}> kanalında kullanılabilir.`
        );
      }

      const result = await takePenalty(message.member);

      if (result.type === "goal") {
        await message.reply(
          `⚽ **GOOOL!**\n` +
          `🧤 Axera Kalecisi geçildi!\n` +
          `💶 Ödül: **+5M€**`
        );
      } else if (result.type === "post") {
        await message.reply(
          `🥅 **DİREK!**\n` +
          `Top direkten döndü.`
        );
      } else {
        await message.reply(
          `🧤 **KURTARIŞ!**\n` +
          `Axera Kalecisi penaltıyı kurtardı.`
        );
      }

      return;
    }

    // ========================================================
    // TWEET
    // ========================================================

    if (command === "tweet") {
      if (!channelIs(message, CHANNELS.TWEET)) {
        return message.reply(
          `❌ Bu komut <#${CHANNELS.TWEET}> kanalında kullanılabilir.`
        );
      }

      const text = args.join(" ").trim();

      if (!text) {
        return message.reply(
          "❌ Kullanım: `.tweet mesaj`"
        );
      }

      const allowed = canTweet(message.author.id);

      const embed = new EmbedBuilder()
        .setAuthor({
          name: message.member.displayName,
          iconURL: message.author.displayAvatarURL()
        })
        .setDescription(text)
        .setFooter({
          text: "Axera League Tweet"
        })
        .setTimestamp();

      await message.delete().catch(() => {});

      await message.channel.send({
        embeds: [embed]
      });

      if (allowed) {
        const rewarded = await changePlayerValue(
          message.member,
          5
        );

        data.tweetCooldowns[message.author.id] = Date.now();
        saveData();

        if (rewarded) {
          await message.channel.send(
            `💶 ${message.member} tweet ödülü: **+5M€**`
          );
        }
      }

      return;
    }

    // ========================================================
    // TAKIM EKLE
    // ========================================================

    if (command === "takimekle") {
      if (!hasMatchPermission(message.member)) {
        return message.reply(
          "❌ Bu komutu yalnızca Spiker/Yönetici kullanabilir."
        );
      }

      const role = message.mentions.roles.first();

      if (!role) {
        return message.reply(
          "❌ Kullanım: `.takimekle @Takım`"
        );
      }

      if (data.teams[role.id]) {
        return message.reply(
          "❌ Bu takım zaten sistemde kayıtlı."
        );
      }

      data.teams[role.id] = {
        roleId: role.id,
        name: role.name,
        players: [],
        value: 0,
        active: true
      };

      ensureStanding(role.id, role.name);

      saveData();

      await message.reply(
        `✅ **${role.name}** takımı Axera League'e eklendi.`
      );

      return;
    }

    // ========================================================
    // TAKIM KALDIR
    // ========================================================

    if (command === "takimkaldir") {
      if (!hasMatchPermission(message.member)) {
        return message.reply(
          "❌ Bu komutu yalnızca Spiker/Yönetici kullanabilir."
        );
      }

      const role = message.mentions.roles.first();

      if (!role) {
        return message.reply(
          "❌ Kullanım: `.takimkaldir @Takım`"
        );
      }

      const activeMatch = Object.values(data.activeMatches)
        .find(
          m =>
            m.team1 === role.id ||
            m.team2 === role.id
        );

      if (activeMatch) {
        return message.reply(
          "❌ Aktif maçı bulunan takım kaldırılamaz."
        );
      }

      delete data.teams[role.id];
      delete data.standings[role.id];
      delete data.formations[role.id];

      for (const fixture of data.fixtures) {
        if (
          fixture.team1 === role.id ||
          fixture.team2 === role.id
        ) {
          fixture.cancelled = true;
        }
      }

      saveData();

      await message.reply(
        `✅ **${role.name}** takımı sistemden kaldırıldı.`
      );

      return;
    }

    // ========================================================
    // TAKIM DEĞERİ
    // ========================================================

    if (command === "takimdeger") {
      if (!hasMatchPermission(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const role = message.mentions.roles.first();
      const amount = parseMoney(args[1]);

      if (!role || amount === null) {
        return message.reply(
          "❌ Kullanım: `.takimdeger @Takım 850M`"
        );
      }

      if (!data.teams[role.id]) {
        return message.reply(
          "❌ Bu takım sistemde kayıtlı değil."
        );
      }

      data.teams[role.id].value = amount;

      saveData();

      await message.reply(
        `✅ **${role.name}** takım değeri **${formatMoney(amount)}** olarak ayarlandı.`
      );

      return;
    }

    // ========================================================
    // PUAN EKLE
    // ========================================================

    if (command === "puanekle") {
      if (!hasMatchPermission(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const role = message.mentions.roles.first();
      const amount = Number(args[1]);

      if (!role || !Number.isInteger(amount)) {
        return message.reply(
          "❌ Kullanım: `.puanekle @Takım 3`"
        );
      }

      const standing = ensureStanding(
        role.id,
        role.name
      );

      standing.points += amount;

      saveData();

      await message.reply(
        `✅ **${role.name}** puanına **${amount}** eklendi.`
      );

      return;
    }

    // ========================================================
    // KADRO EKLE
    // ========================================================

    if (command === "kadroekle") {
      if (!hasMatchPermission(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const role = message.mentions.roles.first();
      const target = message.mentions.members.at(1);
      const position = args[2] || "Oyuncu";

      if (!role || !target) {
        return message.reply(
          "❌ Kullanım: `.kadroekle @Takım @Oyuncu Pozisyon`"
        );
      }

      if (!data.teams[role.id]) {
        return message.reply(
          "❌ Takım sistemde kayıtlı değil."
        );
      }

      const team = data.teams[role.id];

      if (!team.players.some(p => p.id === target.id)) {
        team.players.push({
          id: target.id,
          position
        });
      }

      saveData();

      await message.reply(
        `✅ ${target} **${role.name}** kadrosuna **${position}** olarak eklendi.`
      );

      return;
    }

    // ========================================================
    // KADRO ÇIKAR
    // ========================================================

    if (command === "kadrocikar") {
      if (!hasMatchPermission(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const role = message.mentions.roles.first();
      const target = message.mentions.members.at(1);

      if (!role || !target) {
        return message.reply(
          "❌ Kullanım: `.kadrocikar @Takım @Oyuncu`"
        );
      }

      const team = data.teams[role.id];

      if (!team) {
        return message.reply(
          "❌ Takım bulunamadı."
        );
      }

      team.players = team.players.filter(
        p => p.id !== target.id
      );

      saveData();

      await message.reply(
        `✅ ${target} **${role.name}** kadrosundan çıkarıldı.`
      );

      return;
    }

    // ========================================================
    // KADRO
    // ========================================================

    if (command === "kadro") {
      const role = message.mentions.roles.first();

      if (!role) {
        return message.reply(
          "❌ Kullanım: `.kadro @Takım`"
        );
      }

      const team = data.teams[role.id];

      if (!team) {
        return message.reply(
          "❌ Takım bulunamadı."
        );
      }

      const players = team.players || [];

      const groups = {};

      for (const player of players) {
        const position = player.position || "Oyuncu";

        if (!groups[position]) {
          groups[position] = [];
        }

        const member = message.guild.members.cache.get(
          player.id
        );

        if (member) {
          const value = extractPlayerValue(member);

          groups[position].push(
            `${member.displayName} — ${value !== null ? formatMoney(value) : "Değer yok"}`
          );
        }
      }

      const description =
        Object.entries(groups)
          .map(
            ([position, names]) =>
              `### ${position}\n${names.join("\n")}`
          )
          .join("\n\n") ||
        "Kadro boş.";

      const total = players.reduce((sum, p) => {
        const member = message.guild.members.cache.get(p.id);
        return sum + (extractPlayerValue(member) || 0);
      }, 0);

      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`⚽ ${role.name} — KADRO`)
            .setDescription(description)
            .addFields({
              name: "📊 Takım Bilgisi",
              value:
                `👥 Oyuncu: **${players.length}**\n` +
                `💶 Toplam Oyuncu Değeri: **${formatMoney(total)}**`
            })
        ]
      });

      return;
    }

    // ========================================================
    // FORMASYON
    // ========================================================

    if (command === "formasyon") {
      if (!hasMatchPermission(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const role = message.mentions.roles.first();

      if (!role || !data.teams[role.id]) {
        return message.reply(
          "❌ Kullanım: `.formasyon @Takım`"
        );
      }

      await message.reply({
        content: `⚽ **${role.name}** için formasyon seç:`,
        components: [
          formationMenu(role.id)
        ]
      });

      return;
    }

    // ========================================================
    // PUAN DURUMU
    // ========================================================

    if (command === "puan") {
      const standings = Object.entries(data.standings)
        .map(([id, s]) => ({
          id,
          ...s,
          av: s.gf - s.ga
        }))
        .sort((a, b) => {
          if (b.points !== a.points) {
            return b.points - a.points;
          }

          if (b.av !== a.av) {
            return b.av - a.av;
          }

          return b.gf - a.gf;
        });

      const text = standings.length
        ? standings.map(
            (s, i) =>
              `**${i + 1}. ${s.name}** — ` +
              `**${s.points} P** | ` +
              `${s.played} O | ` +
              `${s.wins} G | ` +
              `${s.draws} B | ` +
              `${s.losses} M | ` +
              `AV: ${s.av} | AG: ${s.gf}`
          ).join("\n")
        : "Henüz takım bulunmuyor.";

      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🏆 AXERA LEAGUE — PUAN DURUMU")
            .setDescription(text)
        ]
      });

      return;
    }

    // ========================================================
    // MAÇ
    // ========================================================

    if (command === "mac") {
      if (!channelIs(message, CHANNELS.MAC)) {
        return message.reply(
          `❌ Bu komut <#${CHANNELS.MAC}> kanalında kullanılabilir.`
        );
      }

      if (!hasMatchPermission(message.member)) {
        return message.reply(
          "❌ Bu komutu yalnızca Spiker/Yönetici kullanabilir."
        );
      }

      const roles = [...message.mentions.roles.values()];

      if (roles.length < 2) {
        return message.reply(
          "❌ Kullanım: `.maç @Takım1 @Takım2`"
        );
      }

      const role1 = roles[0];
      const role2 = roles[1];

      const team1 = data.teams[role1.id];
      const team2 = data.teams[role2.id];

      if (!team1 || !team2) {
        return message.reply(
          "❌ İki takımın da sistemde kayıtlı olması gerekiyor."
        );
      }

      await message.reply(
        `⚽ **${team1.name} - ${team2.name}** maçı başlatılıyor...`
      );

      await startMatch(
        message.guild,
        team1,
        team2
      );

      return;
    }

    // ========================================================
    // FİKSTÜR EKLE
    // ========================================================

    if (command === "fiksturekle") {
      if (!hasMatchPermission(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const roles = [...message.mentions.roles.values()];

      if (roles.length < 2) {
        return message.reply(
          "❌ İki takım etiketlemelisin."
        );
      }

      const dateIndex = 2;

      const date = args[dateIndex];
      const time = args[dateIndex + 1];

      const timestamp = parseDateTime(
        date,
        time
      );

      if (!timestamp) {
        return message.reply(
          "❌ Kullanım: `.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`"
        );
      }

      const team1 = data.teams[roles[0].id];
      const team2 = data.teams[roles[1].id];

      if (!team1 || !team2) {
        return message.reply(
          "❌ Takımlar kayıtlı değil."
        );
      }

      const fixture = {
        id: data.nextFixtureId++,
        team1: roles[0].id,
        team2: roles[1].id,
        date,
        time,
        timestamp: timestamp.getTime(),
        played: false,
        cancelled: false
      };

      data.fixtures.push(fixture);

      saveData();

      await message.reply(
        `✅ Fikstür eklendi:\n` +
        `⚽ **${team1.name} - ${team2.name}**\n` +
        `📅 ${date} ${time}`
      );

      return;
    }

    // ========================================================
    // FİKSTÜR
    // ========================================================

    if (
      command === "fikstur" ||
      command === "fiksturler"
    ) {
      const fixtures = data.fixtures
        .filter(f => !f.cancelled)
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(0, 20);

      if (!fixtures.length) {
        return message.reply(
          "📅 Henüz fikstür bulunmuyor."
        );
      }

      const text = fixtures.map(f => {
        const t1 = data.teams[f.team1]?.name || "Bilinmeyen";
        const t2 = data.teams[f.team2]?.name || "Bilinmeyen";

        const status = f.played
          ? "✅ Oynandı"
          : f.timestamp <= Date.now()
            ? "🟢 Başlıyor"
            : "⏳ Bekliyor";

        return (
          `**${t1} - ${t2}**\n` +
          `📅 ${f.date} ${f.time} — ${status}`
        );
      }).join("\n\n");

      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("📅 AXERA LEAGUE — FİKSTÜR")
            .setDescription(text)
        ]
      });

      return;
    }

    // ========================================================
    // FİKSTÜR ÇIKAR
    // ========================================================

    if (command === "fiksturcikar") {
      if (!hasMatchPermission(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const roles = [...message.mentions.roles.values()];

      if (roles.length < 2) {
        return message.reply(
          "❌ İki takım belirtmelisin."
        );
      }

      const fixture = data.fixtures.find(
        f =>
          !f.played &&
          !f.cancelled &&
          (
            f.team1 === roles[0].id &&
            f.team2 === roles[1].id
          )
      );

      if (!fixture) {
        return message.reply(
          "❌ Bu takımlar arasında bekleyen fikstür bulunamadı."
        );
      }

      fixture.cancelled = true;

      saveData();

      await message.reply(
        "✅ Fikstür kaldırıldı."
      );

      return;
    }

    // ========================================================
    // KUPA EKLE
    // ========================================================

    if (command === "kupaekle") {
      if (!hasMatchPermission(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const role = message.mentions.roles.first();

      if (!role) {
        return message.reply(
          "❌ Kullanım: `.kupaekle @Takım Kupa Adı`"
        );
      }

      const name = args.slice(1).join(" ");

      if (!name) {
        return message.reply(
          "❌ Kupa adı yazmalısın."
        );
      }

      if (!data.cups[role.id]) {
        data.cups[role.id] = [];
      }

      data.cups[role.id].push(name);

      saveData();

      await message.reply(
        `🏆 **${name}** kupası **${role.name}** müzesine eklendi.`
      );

      return;
    }

    // ========================================================
    // KUPA SİL
    // ========================================================

    if (command === "kupasil") {
      if (!hasMatchPermission(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const role = message.mentions.roles.first();

      if (!role) {
        return message.reply(
          "❌ Kullanım: `.kupasil @Takım Kupa Adı`"
        );
      }

      const name = args.slice(1).join(" ");

      if (!data.cups[role.id]) {
        return message.reply(
          "❌ Bu takımın kupası yok."
        );
      }

      const index = data.cups[role.id].findIndex(
        x => normalizeText(x) === normalizeText(name)
      );

      if (index === -1) {
        return message.reply(
          "❌ Kupa bulunamadı."
        );
      }

      data.cups[role.id].splice(index, 1);

      saveData();

      await message.reply(
        `🗑️ **${name}** kupası silindi.`
      );

      return;
    }

    // ========================================================
    // MÜZE
    // ========================================================

    if (command === "muze") {
      const role = message.mentions.roles.first();

      if (!role) {
        return message.reply(
          "❌ Kullanım: `.müze @Takım`"
        );
      }

      const cups = data.cups[role.id] || [];

      const text = cups.length
        ? cups.map(
            (cup, i) => `🏆 **${i + 1}.** ${cup}`
          ).join("\n")
        : "🏆 Henüz kupa bulunmuyor.";

      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`🏛️ ${role.name} — MÜZE`)
            .setDescription(text)
        ]
      });

      return;
    }

    // ========================================================
    // TICKET PANEL
    // ========================================================

    if (command === "ticketpanel") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Bu komutu yalnızca Yönetici kullanabilir."
        );
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("ticket_create")
          .setLabel("🎫 Destek Talebi Oluştur")
          .setStyle(ButtonStyle.Primary)
      );

      const embed = new EmbedBuilder()
        .setTitle("🎫 AXERA LEAGUE — DESTEK")
        .setDescription(
          "Destek almak için aşağıdaki butona tıklayarak özel bir ticket oluşturabilirsiniz.\n\n" +
          `🛡️ Destek Yetkilisi: <@&${ROLES.MODERATOR}>`
        );

      await message.channel.send({
        embeds: [embed],
        components: [row]
      });

      return;
    }

    // ========================================================
    // MODERASYON — SİL
    // ========================================================

    if (command === "sil") {
      if (!isAdmin(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const amount = Number(args[0]);

      if (
        !Number.isInteger(amount) ||
        amount < 1 ||
        amount > 1000
      ) {
        return message.reply(
          "❌ 1 ile 1000 arasında bir sayı yaz."
        );
      }

      await message.delete().catch(() => {});

      const messages = await message.channel.bulkDelete(
        amount,
        true
      );

      const reply = await message.channel.send(
        `🗑️ **${messages.size}** mesaj silindi.`
      );

      setTimeout(() => {
        reply.delete().catch(() => {});
      }, 3000);

      return;
    }

    // ========================================================
    // EMBED
    // ========================================================

    if (command === "embed") {
      if (!isAdmin(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const raw = args.join(" ");
      const [title, description] = raw.split("|");

      if (!title || !description) {
        return message.reply(
          "❌ Kullanım: `.embed Başlık | Açıklama`"
        );
      }

      await message.delete().catch(() => {});

      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(title.trim())
            .setDescription(description.trim())
        ]
      });

      return;
    }

    // ========================================================
    // KICK
    // ========================================================

    if (command === "kick") {
      if (!hasModeratorPermission(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const target = getMentionedMember(message);

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.kick @Oyuncu`"
        );
      }

      await target.kick().catch(() => {});

      await message.reply(
        `👢 ${target.user.tag} sunucudan atıldı.`
      );

      return;
    }

    // ========================================================
    // BAN
    // ========================================================

    if (command === "ban") {
      if (!hasModeratorPermission(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const target = getMentionedMember(message);

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.ban @Oyuncu`"
        );
      }

      await target.ban().catch(() => {});

      await message.reply(
        `🔨 ${target.user.tag} yasaklandı.`
      );

      return;
    }

    // ========================================================
    // MUTE
    // ========================================================

    if (command === "mute") {
      if (!hasModeratorPermission(message.member)) {
        return message.reply("❌ Yetkin yok.");
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

        await message.reply(
          `🔇 ${target} **10 dakika** susturuldu.`
        );
      } catch {
        await message.reply(
          "❌ Oyuncu susturulamadı."
        );
      }

      return;
    }

    // ========================================================
    // UNMUTE
    // ========================================================

    if (command === "unmute") {
      if (!hasModeratorPermission(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const target = getMentionedMember(message);

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.unmute @Oyuncu`"
        );
      }

      await target.timeout(null).catch(() => {});

      await message.reply(
        `🔊 ${target} susturması kaldırıldı.`
      );

      return;
    }

    // ========================================================
    // DM
    // ========================================================

    if (command === "dm") {
      if (!isAdmin(message.member)) {
        return message.reply("❌ Bu komutu yalnızca Yönetici kullanabilir.");
      }

      const target = getMentionedMember(message);

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.dm @Oyuncu mesaj`"
        );
      }

      const text = message.content
        .replace(/^\.dm\s+<@!?\d+>\s*/i, "")
        .trim();

      if (!text) {
        return message.reply(
          "❌ Gönderilecek mesajı yazmalısın."
        );
      }

      try {
        await target.send(text);

        await message.reply(
          `✅ Mesaj ${target} kişisine gönderildi.`
        );
      } catch {
        await message.reply(
          "❌ Kullanıcının DM'leri kapalı olabilir."
        );
      }

      return;
    }

    // ========================================================
    // BİLİNMEYEN KOMUT
    // ========================================================

    // Bilinmeyen komutlarda spam yapmıyoruz.

  } catch (err) {
    console.error(
      `Komut hatası (${command}):`,
      err
    );

    if (!message.deleted) {
      await message.reply(
        "❌ Komut çalıştırılırken bir hata oluştu."
      ).catch(() => {});
    }
  }
});

// ============================================================
// TICKET BUTONU
// ============================================================

client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;

  if (interaction.customId !== "ticket_create") return;

  try {
    const guild = interaction.guild;

    const existing = Object.values(data.tickets)
      .find(t => t.userId === interaction.user.id);

    if (existing) {
      return interaction.reply({
        content: `❌ Zaten açık bir ticketın var: <#${existing.channelId}>`,
        ephemeral: true
      });
    }

    const channel = await guild.channels.create({
      name: `ticket-${interaction.user.username}`.toLowerCase().slice(0, 90),
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: ["ViewChannel"]
        },
        {
          id: interaction.user.id,
          allow: [
            "ViewChannel",
            "SendMessages",
            "ReadMessageHistory"
          ]
        },
        {
          id: ROLES.MODERATOR,
          allow: [
            "ViewChannel",
            "SendMessages",
            "ReadMessageHistory"
          ]
        }
      ]
    });

    data.tickets[channel.id] = {
      channelId: channel.id,
      userId: interaction.user.id,
      createdAt: Date.now(),
      lastMessageAt: Date.now()
    };

    saveData();

    await channel.send({
      content: `${interaction.user} <@&${ROLES.MODERATOR}>`,
      embeds: [
        new EmbedBuilder()
          .setTitle("🎫 Destek Talebi")
          .setDescription(
            "Destek talebin oluşturuldu.\n\n" +
            "Bir Moderatör seninle ilgilenecektir.\n" +
            "Ticket içerisinde **60 dakika boyunca mesaj gönderilmezse otomatik kapanır.**"
          )
      ],
      components: [ticketButtons()]
    });

    await interaction.reply({
      content: `✅ Ticket oluşturuldu: ${channel}`,
      ephemeral: true
    });

  } catch (err) {
    console.error("Ticket oluşturma hatası:", err);

    if (!interaction.replied) {
      await interaction.reply({
        content: "❌ Ticket oluşturulamadı.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

// ============================================================
// FORMASYON BUTONU
// ============================================================

client.on("interactionCreate", async interaction => {
  if (!interaction.isStringSelectMenu()) return;

  if (!interaction.customId.startsWith("formation_")) return;

  if (!hasMatchPermission(interaction.member)) {
    return interaction.reply({
      content: "❌ Bu menüyü yalnızca Spiker/Yönetici kullanabilir.",
      ephemeral: true
    });
  }

  const teamId = interaction.customId.replace(
    "formation_",
    ""
  );

  const formation = interaction.values[0];

  data.formations[teamId] = formation;

  saveData();

  await interaction.reply({
    content: `✅ Formasyon **${formation}** olarak ayarlandı.`,
    ephemeral: true
  });
});

// ============================================================
// TICKET AKTİVİTESİ
// ============================================================

client.on("messageCreate", message => {
  if (!message.guild) return;
  if (message.author.bot) return;

  const ticket = data.tickets[message.channel.id];

  if (!ticket) return;

  ticket.lastMessageAt = Date.now();
  saveData();
});

// ============================================================
// OTOMATİK TICKET KAPATMA
// ============================================================

setInterval(async () => {
  const now = Date.now();
  const timeout = 60 * 60 * 1000;

  for (const [channelId, ticket] of Object.entries(data.tickets)) {
    if (
      now - (ticket.lastMessageAt || ticket.createdAt) <
      timeout
    ) {
      continue;
    }

    for (const guild of client.guilds.cache.values()) {
      const channel = guild.channels.cache.get(channelId);

      if (!channel) continue;

      await channel.send(
        "⏱️ 60 dakika boyunca mesaj gönderilmediği için ticket otomatik olarak kapatılıyor."
      ).catch(() => {});

      setTimeout(() => {
        channel.delete().catch(() => {});
      }, 2000);
    }

    delete data.tickets[channelId];
  }

  saveData();
}, 60_000);

// ============================================================
// TOKEN KONTROL
// ============================================================

if (!process.env.TOKEN) {
  console.error(
    "❌ TOKEN bulunamadı! Railway Variables kısmına TOKEN ekleyin."
  );
  process.exit(1);
}

client.login(process.env.TOKEN);
