// Axera League — Tek Parça index.js

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
  ChannelType
} = require("discord.js");

const OpenAI = require("openai");
const fs = require("fs");

const TOKEN = process.env.TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

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
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

const openai = OPENAI_API_KEY
  ? new OpenAI({ apiKey: OPENAI_API_KEY })
  : null;

const IDS = {
  roles: {
    yonetici: "1534455282426445897",
    kayitYetkilisi: "1534456315366342716",
    deger: "1534456192913375382",
    kayitsiz: "1534457560134844517",
    futbolcu: "1534457228986421278",
    teknikDirektor: "1534456648930693120",
    uye: "1534457460163608636",
    moderator: "1534456108415189063",
    spiker: "1535251168169697390",
    medyaPing: "1547393966553440346",
    partnerPing: "1547393545827123230",
    macPing: "1547393416755941509",
    duyuruPing: "1547393331297001522",
    cekilisPing: "1545116885589430312"
  },

  channels: {
    kayit: "1547371464515133470",
    sohbet: "1547374641763455009",
    antrenman: "1547375589923618957",
    penalti: "1547375997698052166",
    tweet: "1547377797193011340",
    mac: "1547376935410073692",
    puan: "1547382143775285431",
    deger: "1547376344927834122",
    botDurum: "1547388197796057118",
    ai: "1547375186754408539"
  },

  teams: {
    Barcelona: "1534480715779936297",
    "Real Madrid": "1534480984064528655",
    Galatasaray: "1534481073629691995",
    Fenerbahçe: "1534481156840620183",
    Beşiktaş: "1534481259739348992",
    "Manchester United": "1534481426463068180"
  }
};

const TEAM_NAMES = Object.keys(IDS.teams);

const POSITIONS = [
  "GK",
  "LB",
  "CB1",
  "CB2",
  "RB",
  "CM1",
  "CM2",
  "LW",
  "CAM",
  "RW",
  "ST"
];

const POSITION_LABELS = {
  GK: "🧤 Kaleci",
  LB: "⬅️ Sol Bek",
  CB1: "🛡️ Stoper 1",
  CB2: "🛡️ Stoper 2",
  RB: "➡️ Sağ Bek",
  CM1: "⚙️ Orta Saha 1",
  CM2: "⚙️ Orta Saha 2",
  LW: "⚡ Sol Kanat",
  CAM: "🎯 Ofansif Orta Saha",
  RW: "⚡ Sağ Kanat",
  ST: "⚽ Santrfor"
};

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

const DATA_FILE = "./data.json";

function defaultFirstXI() {
  return {
    formation: "4-2-3-1",
    GK: null,
    LB: null,
    CB1: null,
    CB2: null,
    RB: null,
    CM1: null,
    CM2: null,
    LW: null,
    CAM: null,
    RW: null,
    ST: null
  };
}

function defaultData() {
  return {
    users: {},
    teams: {},
    standings: {},
    fixtures: [],
    nextFixtureId: 1,
    activeMatches: {},
    registrationPanels: {},
    tickets: {},
    formations: {},
    training: {},
    tweetCooldowns: {},
    matchRewards: {},
    stats: {},
    matchHistory: {},
    rolePanel: null
  };
}

let db = defaultData();

if (fs.existsSync(DATA_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    db = {
      ...defaultData(),
      ...saved
    };
  } catch (e) {
    console.error("data.json okunamadı.");
  }
}

function save() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error("Veri kaydedilemedi:", e.message);
  }
}

function ensureUser(id) {
  if (!db.users[id]) {
    db.users[id] = {
      name: "",
      value: 0,
      budget: 0,
      registered: false
    };
  }

  return db.users[id];
}

function ensureTeam(name) {
  if (!db.teams[name]) {
    db.teams[name] = {
      value: 0,
      players: {},
      ilk11: defaultFirstXI()
    };
  }

  if (!db.teams[name].ilk11) {
    db.teams[name].ilk11 = defaultFirstXI();
  }

  if (!db.teams[name].players) {
    db.teams[name].players = {};
  }

  return db.teams[name];
}

for (const team of TEAM_NAMES) {
  ensureTeam(team);

  if (!db.standings[team]) {
    db.standings[team] = {
      points: 0,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      gf: 0,
      ga: 0
    };
  }
}

save();

function isAdmin(member) {
  return (
    member &&
    (
      member.permissions.has(PermissionsBitField.Flags.Administrator) ||
      member.roles.cache.has(IDS.roles.yonetici)
    )
  );
}

function hasRole(member, roleId) {
  return Boolean(member?.roles?.cache?.has(roleId));
}

function canRegister(member) {
  return (
    isAdmin(member) ||
    hasRole(member, IDS.roles.kayitYetkilisi)
  );
}

function canValue(member) {
  return (
    isAdmin(member) ||
    hasRole(member, IDS.roles.deger)
  );
}

function canSpeak(member) {
  return (
    isAdmin(member) ||
    hasRole(member, IDS.roles.spiker)
  );
}

function canSquad(member) {
  return (
    isAdmin(member) ||
    hasRole(member, IDS.roles.spiker) ||
    hasRole(member, IDS.roles.teknikDirektor)
  );
}

function normalize(text) {
  return String(text || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .trim();
}

function getUserTeams(member) {
  return TEAM_NAMES.filter(
    team => member.roles.cache.has(IDS.teams[team])
  );
}

function getPlayerName(member) {
  const user = db.users[member.id];

  return (
    user?.name ||
    member.nickname ||
    member.displayName ||
    member.user?.username ||
    "İsimsiz"
  ).trim();
}

function parseAmount(input) {
  if (!input) return null;

  let value = String(input)
    .trim()
    .toUpperCase()
    .replace(",", ".");

  if (!/^\d+(?:\.\d+)?(?:M€|M)?$/.test(value)) {
    return null;
  }

  value = value
    .replace("M€", "")
    .replace("M", "");

  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return null;
  }

  return number;
}

function formatValue(value) {
  const number =
    Math.round((Number(value) || 0) * 100) / 100;

  return `${Number.isInteger(number) ? number : number.toFixed(2)}M€`;
}

function replaceValue(nickname, value) {
  const text = String(nickname || "").trim();

  if (/\d+(?:\.\d+)?M€\s*$/.test(text)) {
    return text.replace(
      /\d+(?:\.\d+)?M€\s*$/,
      formatValue(value)
    );
  }

  return `${text} | ${formatValue(value)}`;
}

async function changePlayerValue(member, amount) {
  if (!member) return;

  const user = ensureUser(member.id);

  let current = Number(user.value) || 0;

  if (current === 0) {
    const match = String(member.displayName || "").match(
      /(\d+(?:\.\d+)?)M€\s*$/
    );

    if (match) {
      current = Number(match[1]);
    }
  }

  const newValue = Math.max(
    0,
    Math.min(
      1000,
      current + Number(amount)
    )
  );

  user.value = newValue;

  const newNickname = replaceValue(
    member.nickname || member.displayName,
    newValue
  );

  if (member.manageable) {
    await member.setNickname(
      newNickname.slice(0, 32)
    ).catch(() => {});
  }

  save();
}

async function getMentionedMember(message) {
  const mentioned = message.mentions.members.first();

  if (mentioned) {
    return mentioned;
  }

  const token = message.content
    .split(/\s+/)
    .find(x => /^<@!?\d+>$/.test(x));

  if (!token) return null;

  const id = token.replace(/[<@!>]/g, "");

  return message.guild.members
    .fetch(id)
    .catch(() => null);
}

function getTeamPlayers(guild, teamName) {
  const role = guild.roles.cache.get(
    IDS.teams[teamName]
  );

  if (!role) return [];

  return [...role.members.values()]
    .filter(member => !member.user.bot)
    .sort((a, b) =>
      getPlayerName(a).localeCompare(
        getPlayerName(b),
        "tr"
      )
    );
}

function createRegistrationPanel(
  target,
  nickname
) {
  const id = `${target.id}_${Date.now()}`;

  db.registrationPanels[id] = {
    userId: target.id,
    nickname
  };

  save();

  const embed = new EmbedBuilder()
    .setTitle("📋 Axera League Kayıt")
    .setDescription(
      `👤 Oyuncu: <@${target.id}>\n` +
      `📝 İsim: **${nickname}**\n\n` +
      `Kayıt türünü seçin.`
    );

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`register:${id}:futbolcu`)
        .setLabel("⚽ Futbolcu")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`register:${id}:uye`)
        .setLabel("👤 Üye")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(`register:${id}:td`)
        .setLabel("🧑‍💼 Teknik Direktör")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`register:${id}:kaleci`)
        .setLabel("🧤 Kaleci")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`register:${id}:cancel`)
        .setLabel("❌ İptal Et")
        .setStyle(ButtonStyle.Danger)
    );

  return {
    embeds: [embed],
    components: [row]
  };
}

function firstXIEmbed(teamName) {
  const team = ensureTeam(teamName);
  const i11 = team.ilk11;

  return new EmbedBuilder()
    .setTitle(`⚽ ${teamName} • İlk 11`)
    .setDescription(
      `**Formasyon:** ${i11.formation}\n\n` +
      POSITIONS
        .map(
          pos =>
            `${POSITION_LABELS[pos]}: ${
              i11[pos]
                ? `<@${i11[pos]}>`
                : "—"
            }`
        )
        .join("\n")
    )
    .setFooter({
      text: "Axera League • İlk 11 Sistemi"
    });
}

function positionButtons(panelId) {
  const rows = [];

  for (let i = 0; i < POSITIONS.length; i += 5) {
    const row = new ActionRowBuilder();

    POSITIONS.slice(i, i + 5).forEach(pos => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(
            `i11pos:${panelId}:${pos}`
          )
          .setLabel(pos)
          .setStyle(ButtonStyle.Primary)
      );
    });

    rows.push(row);
  }

  return rows;
}

function firstXIActions(panelId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`i11save:${panelId}`)
        .setLabel("💾 Kaydet")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`i11clear:${panelId}`)
        .setLabel("🗑️ Temizle")
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId(`i11close:${panelId}`)
        .setLabel("❌ Kapat")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function formationMenu(panelId) {
  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`i11form:${panelId}`)
        .setPlaceholder("⚽ Formasyon seç")
        .addOptions(
          FORMATIONS.map(f => ({
            label: f,
            value: f,
            description: `Formasyon: ${f}`
          }))
        )
    );
}

function playerSelect(
  panelId,
  position,
  players,
  page
) {
  const pageSize = 25;
  const totalPages =
    Math.max(1, Math.ceil(players.length / pageSize));

  page = Math.max(
    0,
    Math.min(page, totalPages - 1)
  );

  const currentPlayers = players.slice(
    page * pageSize,
    page * pageSize + pageSize
  );

  const menu = new StringSelectMenuBuilder()
    .setCustomId(
      `i11player:${panelId}:${position}:${page}`
    )
    .setPlaceholder(
      `${POSITION_LABELS[position]} oyuncusu seç`
    );

  if (currentPlayers.length) {
    menu.addOptions(
      currentPlayers.map(member => ({
        label: getPlayerName(member).slice(0, 100),
        value: member.id,
        description:
          member.user.username.slice(0, 100)
      }))
    );
  } else {
    menu.addOptions({
      label: "Oyuncu bulunamadı",
      value: "none"
    });
  }

  const rows = [
    new ActionRowBuilder().addComponents(menu)
  ];

  if (totalPages > 1) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(
            `i11page:${panelId}:${position}:${page - 1}`
          )
          .setLabel("⬅️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),

        new ButtonBuilder()
          .setCustomId(
            `i11noop:${panelId}`
          )
          .setLabel(`Sayfa ${page + 1}/${totalPages}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),

        new ButtonBuilder()
          .setCustomId(
            `i11page:${panelId}:${position}:${page + 1}`
          )
          .setLabel("➡️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === totalPages - 1)
      )
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`i11back:${panelId}`)
        .setLabel("↩️ Geri")
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return rows;
}

function canManageFirstXI(member, teamName) {
  if (isAdmin(member)) return true;

  if (hasRole(member, IDS.roles.spiker)) {
    return true;
  }

  if (
    hasRole(member, IDS.roles.teknikDirektor) &&
    getUserTeams(member).includes(teamName)
  ) {
    return true;
  }

  return false;
}

function standingsEmbed() {
  const standings = TEAM_NAMES.map(team => {
    const s =
      db.standings[team] || {
        points: 0,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        gf: 0,
        ga: 0
      };

    return {
      team,
      ...s,
      gd: s.gf - s.ga
    };
  });

  standings.sort(
    (a, b) =>
      b.points - a.points ||
      b.gd - a.gd ||
      b.gf - a.gf
  );

  return new EmbedBuilder()
    .setTitle("🏆 Axera League • Puan Durumu")
    .setDescription(
      standings
        .map(
          (s, index) =>
            `**${index + 1}. ${s.team}** — ` +
            `${s.points} P | ` +
            `${s.played} O | ` +
            `${s.wins} G | ` +
            `${s.draws} B | ` +
            `${s.losses} M | ` +
            `${s.gf}-${s.ga}`
        )
        .join("\n")
    );
}

async function postStandings(guild) {
  const channel =
    guild.channels.cache.get(IDS.channels.puan);

  if (!channel) return;

  await channel.send({
    embeds: [standingsEmbed()]
  }).catch(() => {});
}

function getMatchPlayers(guild, teamName) {
  const team = ensureTeam(teamName);

  const firstXIIds = POSITIONS
    .map(pos => team.ilk11[pos])
    .filter(Boolean);

  const firstXI = firstXIIds
    .map(id => guild.members.cache.get(id))
    .filter(Boolean);

  if (firstXI.length >= 7) {
    return firstXI.slice(0, 11);
  }

  return getTeamPlayers(
    guild,
    teamName
  ).slice(0, 11);
}

async function rewardMatch(
  guild,
  matchId,
  teams
) {
  if (db.matchRewards[matchId]) {
    return;
  }

  db.matchRewards[matchId] = true;

  const ids = new Set();

  for (const team of teams) {
    getMatchPlayers(
      guild,
      team
    ).forEach(member => {
      ids.add(member.id);
    });
  }

  for (const id of ids) {
    const member =
      await guild.members.fetch(id).catch(() => null);

    if (member) {
      await changePlayerValue(member, 5);
    }
  }

  save();
}

async function startMatch(
  guild,
  team1,
  team2,
  fixtureId = null
) {
  const channel =
    guild.channels.cache.get(IDS.channels.mac);

  if (!channel) return;

  const matchId =
    `${Date.now()}_${team1}_${team2}`
      .replace(/\s/g, "_");

  const players1 =
    getMatchPlayers(guild, team1);

  const players2 =
    getMatchPlayers(guild, team2);

  const match = {
    id: matchId,
    fixtureId,
    team1,
    team2,
    score1: 0,
    score2: 0,
    minute: 0,
    startedAt: Date.now(),
    messageId: null,
    finished: false
  };

  db.activeMatches[matchId] = match;
  save();

  const embed = new EmbedBuilder()
    .setTitle(`⚽ ${team1} vs ${team2}`)
    .setDescription(
      `**0 - 0**\n\n` +
      `⏱️ Maç başladı!\n` +
      `3 saniye = 1 maç dakikası`
    )
    .addFields(
      {
        name: team1,
        value: `${players1.length} oyuncu`,
        inline: true
      },
      {
        name: team2,
        value: `${players2.length} oyuncu`,
        inline: true
      }
    )
    .setFooter({
      text: "Axera League • Canlı Maç"
    });

  const msg =
    await channel.send({
      embeds: [embed]
    });

  match.messageId = msg.id;
  save();

  const events = [
    "Orta sahada paslaşmalar devam ediyor.",
    "Kanattan tehlikeli bir atak gelişiyor.",
    "Savunma araya girdi.",
    "Kaleci topu kontrol etti.",
    "Hızlı bir kontra atak.",
    "Hakem faul düdüğünü çaldı.",
    "Tehlikeli bir şut geliyor.",
    "Top savunmadan sekti."
  ];

  const interval = setInterval(
    async () => {
      if (!db.activeMatches[matchId]) {
        clearInterval(interval);
        return;
      }

      match.minute++;

      if (match.minute >= 90) {
        clearInterval(interval);

        match.finished = true;

        const s1 =
          match.score1 > match.score2
            ? 3
            : match.score1 === match.score2
              ? 1
              : 0;

        const s2 =
          match.score2 > match.score1
            ? 3
            : match.score1 === match.score2
              ? 1
              : 0;

        if (!db.standings[team1]) {
          db.standings[team1] = {
            points: 0,
            played: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            gf: 0,
            ga: 0
          };
        }

        if (!db.standings[team2]) {
          db.standings[team2] = {
            points: 0,
            played: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            gf: 0,
            ga: 0
          };
        }

        const a = db.standings[team1];
        const b = db.standings[team2];

        a.played++;
        a.gf += match.score1;
        a.ga += match.score2;

        b.played++;
        b.gf += match.score2;
        b.ga += match.score1;

        if (s1 === 3) a.wins++;
        else if (s1 === 1) a.draws++;
        else a.losses++;

        if (s2 === 3) b.wins++;
        else if (s2 === 1) b.draws++;
        else b.losses++;

        a.points += s1;
        b.points += s2;

        await rewardMatch(
          guild,
          matchId,
          [team1, team2]
        );

        const finalEmbed =
          new EmbedBuilder()
            .setTitle(
              `🏁 ${team1} vs ${team2} • Maç Bitti`
            )
            .setDescription(
              `# **${match.score1} - ${match.score2}**\n\n` +
              `🏆 Maç tamamlandı.\n` +
              `💰 Katılan oyunculara **+5M€** verildi.`
            );

        await msg.edit({
          embeds: [finalEmbed]
        }).catch(() => {});

        delete db.activeMatches[matchId];

        save();

        await postStandings(guild);

        return;
      }

      let event =
        events[Math.floor(
          Math.random() * events.length
        )];

      if (Math.random() < 0.15) {
        const side =
          Math.random() < 0.5 ? 1 : 2;

        const players =
          side === 1
            ? players1
            : players2;

        if (players.length) {
          const scorer =
            players[
              Math.floor(
                Math.random() * players.length
              )
            ];

          if (side === 1) {
            match.score1++;
          } else {
            match.score2++;
          }

          event =
            `⚽ **GOL!** ${
              side === 1 ? team1 : team2
            } — **${getPlayerName(scorer)}** gol attı!`;

          await changePlayerValue(
            scorer,
            2
          );

          const assists =
            players.filter(
              p => p.id !== scorer.id
            );

          if (
            assists.length &&
            Math.random() < 0.75
          ) {
            const assist =
              assists[
                Math.floor(
                  Math.random() * assists.length
                )
              ];

            await changePlayerValue(
              assist,
              1
            );

            event +=
              `\n🅰️ Asist: **${getPlayerName(assist)}**`;
          }
        }
      }

      const live =
        new EmbedBuilder()
          .setTitle(
            `⚽ ${team1} vs ${team2}`
          )
          .setDescription(
            `# **${match.score1} - ${match.score2}**\n\n` +
            `⏱️ **${match.minute}'**\n` +
            `${event}`
          )
          .setFooter({
            text: "Axera League • Canlı"
          });

      await msg.edit({
        embeds: [live]
      }).catch(() => {});

      save();
    },
    3000
  );
}

function parseDateTime(date, time) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^\d{2}:\d{2}$/.test(time)
  ) {
    return null;
  }

  const [year, month, day] =
    date.split("-").map(Number);

  const [hour, minute] =
    time.split(":").map(Number);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const d = new Date(
    year,
    month - 1,
    day,
    hour,
    minute,
    0
  );

  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day ||
    d.getHours() !== hour ||
    d.getMinutes() !== minute
  ) {
    return null;
  }

  return d.getTime();
}

async function checkFixtures() {
  const guild =
    client.guilds.cache.first();

  if (!guild) return;

  const now = Date.now();

  for (const fixture of db.fixtures) {
    if (fixture.started || fixture.finished) {
      continue;
    }

    if (fixture.timestamp > now) {
      continue;
    }

    fixture.started = true;

    save();

    startMatch(
      guild,
      fixture.team1,
      fixture.team2,
      fixture.id
    ).catch(console.error);
  }
}

async function aiReply(message, text) {
  const q = normalize(text);

  if (q.includes("seni kim kurdu")) {
    return message.reply(
      "Lynox9380 kurdu."
    );
  }

  if (
    q.includes("yapayzeka altyap") ||
    q.includes("yapay zeka altyap")
  ) {
    return message.reply(
      "Axera League"
    );
  }

  if (!openai) {
    return message.reply(
      "⚠️ AI sistemi için OPENAI_API_KEY eksik."
    );
  }

  try {
    const response =
      await openai.responses.create({
        model: "gpt-5.6-luna",
        instructions:
          "Sen Axera League adlı Türkçe Discord futbol RP sunucusunun hızlı yapay zeka asistanısın. " +
          "Kısa ve doğal cevaplar ver. Bilmediğin Axera League bilgilerini uydurma. " +
          "Discord sunucusunda işlem yapmak yerine ilgili komutu kullanmasını söyle.",
        input: text,
        max_output_tokens: 180
      });

    const answer =
      response.output_text?.trim();

    return message.reply(
      answer || "Şu anda cevap veremiyorum."
    );
  } catch (error) {
    console.error(
      "OpenAI:",
      error.message
    );

    return message.reply(
      "⚠️ AI şu anda kullanılamıyor."
    );
  }
}

let lastStatusKey = "";

async function statusMessage() {
  const now = new Date();

  if (
    now.getMinutes() !== 0 &&
    now.getMinutes() !== 30
  ) {
    return;
  }

  const key =
    `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;

  if (lastStatusKey === key) {
    return;
  }

  lastStatusKey = key;

  const channel =
    client.channels.cache.get(
      IDS.channels.botDurum
    );

  if (!channel) return;

  const messages =
    await channel.messages.fetch({
      limit: 100
    }).catch(() => null);

  if (messages) {
    for (const msg of messages.values()) {
      if (
        msg.author.id === client.user.id
      ) {
        await msg.delete().catch(() => {});
      }
    }
  }

  const users =
    client.guilds.cache.reduce(
      (total, guild) =>
        total + guild.memberCount,
      0
    );

  const uptime =
    (process.uptime() / 3600).toFixed(2);

  await channel.send(
    `🟢 **Axera League Bot Durumu**\n\n` +
    `Tüm sistemler sorunsuz çalışıyor.\n\n` +
    `📡 Ping: **${client.ws.ping}ms**\n` +
    `🏠 Sunucu: **${client.guilds.cache.size}**\n` +
    `👥 Kullanıcı: **${users}**\n` +
    `⏱️ Uptime: **${uptime} saat**\n` +
    `🕐 ${now.toLocaleString("tr-TR")}`
  ).catch(() => {});
}

client.once("ready", () => {
  console.log(
    `Axera League aktif: ${client.user.tag}`
  );

  client.user.setPresence({
    activities: [
      {
        name: "Axera League",
        type: 1,
        url: "https://www.twitch.tv/axeraleague"
      }
    ],
    status: "online"
  });

  setInterval(statusMessage, 15000);
  setInterval(checkFixtures, 1000);

  statusMessage().catch(() => {});
});

client.on(
  "guildMemberAdd",
  async member => {
    const role =
      member.guild.roles.cache.get(
        IDS.roles.kayitsiz
      );

    if (role) {
      await member.roles
        .add(role)
        .catch(() => {});
    }

    const channel =
      member.guild.channels.cache.get(
        IDS.channels.kayit
      );

    if (channel) {
      await channel.send(
        `👋 Hoş geldin <@${member.id}>!\n` +
        `Kayıt için <@&${IDS.roles.kayitYetkilisi}> yetkilisine ulaşabilirsin.`
      ).catch(() => {});
    }
  }
);

client.on(
  "messageCreate",
  async message => {
    if (
      message.author.bot ||
      !message.guild
    ) {
      return;
    }

    if (
      db.tickets[message.channel.id]
    ) {
      db.tickets[
        message.channel.id
      ].lastMessage = Date.now();

      save();
    }

    const content =
      message.content.trim();

    if (!content) return;

    if (
      message.channel.id === IDS.channels.ai &&
      !content.startsWith(".")
    ) {
      return aiReply(
        message,
        content
      );
    }

    if (!content.startsWith(".")) {
      return;
    }

    const parts =
      content.split(/\s+/);

    const command =
      parts[0].toLocaleLowerCase(
        "tr-TR"
      );

    const args =
      parts.slice(1);

    // KAYIT
    if (command === ".k") {
      if (
        message.channel.id !==
        IDS.channels.kayit
      ) {
        return message.reply(
          "❌ Bu komut sadece kayıt kanalında kullanılabilir."
        );
      }

      if (!canRegister(message.member)) {
        return message.reply(
          "❌ Kayıt yetkin yok."
        );
      }

      const target =
        await getMentionedMember(message);

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.k @Oyuncu İsim`"
        );
      }

      const nickname =
        args
          .filter(
            x => !/^<@!?\d+>$/.test(x)
          )
          .join(" ")
          .trim();

      if (!nickname) {
        return message.reply(
          "❌ İsim yazmalısın."
        );
      }

      return message.channel.send(
        createRegistrationPanel(
          target,
          nickname.slice(0, 32)
        )
      );
    }

    // KAYITSIZ
    if (
      command === ".kayıtsızver" ||
      command === ".kayitsizver"
    ) {
      if (!canRegister(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const target =
        await getMentionedMember(message);

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.kayıtsızver @Oyuncu`"
        );
      }

      for (
        const roleId of [
          IDS.roles.futbolcu,
          IDS.roles.uye,
          IDS.roles.teknikDirektor
        ]
      ) {
        await target.roles
          .remove(roleId)
          .catch(() => {});
      }

      await target.roles
        .add(IDS.roles.kayitsiz)
        .catch(() => {});

      const user =
        ensureUser(target.id);

      user.registered = false;

      save();

      return message.reply(
        `✅ ${target} Kayıtsız yapıldı.`
      );
    }

    // ARA
    if (command === ".ara") {
      const query =
        args.join(" ").trim();

      if (!query) {
        return message.reply(
          "❌ Kullanım: `.ara oyuncu`"
        );
      }

      const q =
        normalize(query);

      const results =
        message.guild.members.cache
          .filter(
            member =>
              !member.user.bot &&
              !member.roles.cache.has(
                IDS.roles.kayitsiz
              )
          )
          .map(member => ({
            member,
            name: getPlayerName(member),
            normalized: normalize(
              getPlayerName(member)
            )
          }))
          .filter(
            x =>
              x.normalized === q ||
              x.normalized.includes(q) ||
              q.includes(x.normalized)
          )
          .sort((a, b) => {
            const ae =
              a.normalized === q ? 0 : 1;
            const be =
              b.normalized === q ? 0 : 1;

            return (
              ae - be ||
              a.name.localeCompare(
                b.name,
                "tr"
              )
            );
          })
          .slice(0, 10);

      if (!results.length) {
        return message.reply(
          `🔎 **${query}** bulunamadı.`
        );
      }

      return message.reply(
        `🔎 **${query}** sonuçları:\n\n` +
        results
          .map(
            (x, i) =>
              `${i + 1}. **${x.name}** — <@${x.member.id}>`
          )
          .join("\n")
      );
    }

    // DEĞER
    if (
      command === ".dver" ||
      command === ".dsil"
    ) {
      if (
        message.channel.id !==
        IDS.channels.deger
      ) {
        return message.reply(
          "❌ Bu komut sadece değer kanalında kullanılabilir."
        );
      }

      if (!canValue(message.member)) {
        return message.reply(
          "❌ Değer yetkin yok."
        );
      }

      const target =
        await getMentionedMember(message);

      const amountToken =
        args.find(
          x => !/^<@!?\d+>$/.test(x)
        );

      const amount =
        parseAmount(amountToken);

      if (!target || amount === null) {
        return message.reply(
          `❌ Kullanım: \`${command} @Oyuncu 5M\``
        );
      }

      await changePlayerValue(
        target,
        command === ".dver"
          ? amount
          : -amount
      );

      const user =
        ensureUser(target.id);

      return message.reply(
        `✅ **${getPlayerName(target)}** yeni değeri: **${formatValue(user.value)}**`
      );
    }

    // ANTRENMAN
    if (
      command === ".ant" ||
      command === ".antrenman"
    ) {
      if (
        message.channel.id !==
        IDS.channels.antrenman
      ) {
        return message.reply(
          "❌ Antrenman komutu sadece antrenman kanalında kullanılabilir."
        );
      }

      const id =
        message.author.id;

      db.training[id] =
        (db.training[id] || 0) + 1;

      if (db.training[id] >= 5) {
        db.training[id] = 0;

        await changePlayerValue(
          message.member,
          3
        );

        save();

        return message.reply(
          "🏋️ **5/5 antrenman tamamlandı!**\n💰 Otomatik **+3M€** kazandın."
        );
      }

      save();

      return message.reply(
        `🏋️ Antrenman: **${db.training[id]}/5**`
      );
    }

    // PENALTI
    if (
      command === ".pen" ||
      command === ".penaltı" ||
      command === ".penalti"
    ) {
      if (
        message.channel.id !==
        IDS.channels.penalti
      ) {
        return message.reply(
          "❌ Penaltı komutu sadece penaltı kanalında kullanılabilir."
        );
      }

      const random =
        Math.random();

      if (random < 0.5) {
        await changePlayerValue(
          message.member,
          5
        );

        return message.reply(
          "⚽ **GOL!**\n💰 Otomatik **+5M€** kazandın."
        );
      }

      if (random < 0.75) {
        return message.reply(
          "🥅 **DİREK!**"
        );
      }

      return message.reply(
        Math.random() < 0.5
          ? "🧤 **KALECİ!**"
          : "🟨 **KORNER!**"
      );
    }

    // BÜTÇE
    if (
      command === ".bütçeekle" ||
      command === ".butceekle" ||
      command === ".bütçesil" ||
      command === ".butcesil"
    ) {
      if (!canValue(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const target =
        await getMentionedMember(message);

      const token =
        args.find(
          x => !/^<@!?\d+>$/.test(x)
        );

      const amount =
        parseAmount(token);

      if (!target || amount === null) {
        return message.reply(
          "❌ Kullanım: `.bütçeekle @Oyuncu 50M`"
        );
      }

      const user =
        ensureUser(target.id);

      if (
        command.includes("sil")
      ) {
        user.budget =
          Math.max(
            0,
            (user.budget || 0) - amount
          );
      } else {
        user.budget =
          (user.budget || 0) + amount;
      }

      save();

      return message.reply(
        `💳 **${getPlayerName(target)}** kişisel bütçesi: **${formatValue(user.budget)}**`
      );
    }

    // GÖNDER
    if (
      command === ".gönder" ||
      command === ".gonder"
    ) {
      const target =
        await getMentionedMember(message);

      const token =
        args.find(
          x => !/^<@!?\d+>$/.test(x)
        );

      const amount =
        parseAmount(token);

      if (!target || amount === null) {
        return message.reply(
          "❌ Kullanım: `.gönder @Oyuncu 10M`"
        );
      }

      if (
        target.id === message.author.id
      ) {
        return message.reply(
          "❌ Kendine gönderemezsin."
        );
      }

      const sender =
        ensureUser(
          message.author.id
        );

      const receiver =
        ensureUser(target.id);

      if (
        (sender.budget || 0) <
        amount
      ) {
        return message.reply(
          "❌ Yeterli bütçen yok."
        );
      }

      sender.budget -= amount;
      receiver.budget =
        (receiver.budget || 0) +
        amount;

      save();

      return message.reply(
        `💸 **${formatValue(amount)}** <@${target.id}> kullanıcısına gönderildi.`
      );
    }

    // KADRO EKLE
    if (
      command === ".kadroekle"
    ) {
      if (!canSquad(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const target =
        await getMentionedMember(message);

      const team =
        TEAM_NAMES.find(
          t => content.includes(t)
        );

      if (!team || !target) {
        return message.reply(
          "❌ Kullanım: `.kadroekle Barcelona @Oyuncu Pozisyon`"
        );
      }

      const position =
        args[args.length - 1] ||
        "Oyuncu";

      ensureTeam(team);

      db.teams[team].players[
        target.id
      ] = {
        position
      };

      save();

      return message.reply(
        `✅ ${target} **${team}** kadrosuna eklendi.`
      );
    }

    // KADRO ÇIKAR
    if (
      command === ".kadrocikar" ||
      command === ".kadrosil"
    ) {
      if (!canSquad(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const target =
        await getMentionedMember(message);

      const team =
        TEAM_NAMES.find(
          t => content.includes(t)
        );

      if (!team || !target) {
        return message.reply(
          "❌ Kullanım: `.kadrocikar Barcelona @Oyuncu`"
        );
      }

      ensureTeam(team);

      delete db.teams[team].players[
        target.id
      ];

      save();

      return message.reply(
        `🗑️ ${target} **${team}** kadrosundan çıkarıldı.`
      );
    }

    // KADRO
    if (command === ".kadro") {
      const team =
        args.join(" ").trim();

      if (!TEAM_NAMES.includes(team)) {
        return message.reply(
          `❌ Takım seç. ${TEAM_NAMES.join(", ")}`
        );
      }

      const players =
        getTeamPlayers(
          message.guild,
          team
        );

      if (!players.length) {
        return message.reply(
          `📋 **${team}** takımında oyuncu bulunmuyor.`
        );
      }

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(
              `📋 ${team} Kadrosu`
            )
            .setDescription(
              players
                .map(
                  (member, i) =>
                    `${i + 1}. **${getPlayerName(member)}** — <@${member.id}>`
                )
                .join("\n")
            )
        ]
      });
    }

    // İLK 11
    if (command === ".ilk11") {
      let team =
        args.join(" ").trim();

      if (
        !TEAM_NAMES.includes(team) &&
        hasRole(
          message.member,
          IDS.roles.teknikDirektor
        )
      ) {
        const teams =
          getUserTeams(
            message.member
          );

        if (teams.length === 1) {
          team = teams[0];
        }

        if (teams.length > 1) {
          const menu =
            new StringSelectMenuBuilder()
              .setCustomId(
                `i11team:${message.author.id}`
              )
              .setPlaceholder(
                "Takımını seç"
              )
              .addOptions(
                teams.map(teamName => ({
                  label: teamName,
                  value: teamName
                }))
              );

          return message.reply({
            content:
              "🧑‍💼 Birden fazla takımın var. Takım seç:",
            components: [
              new ActionRowBuilder()
                .addComponents(menu)
            ]
          });
        }
      }

      if (
        !TEAM_NAMES.includes(team)
      ) {
        return message.reply(
          `❌ Kullanım: \`.ilk11 Barcelona\`\n\nTakımlar: ${TEAM_NAMES.join(", ")}`
        );
      }

      if (
        !canManageFirstXI(
          message.member,
          team
        )
      ) {
        return message.reply(
          "❌ Bu takımın İlk 11'ini yönetemezsin."
        );
      }

      ensureTeam(team);

      const panelId =
        `${message.author.id}_${Date.now()}`;

      db.teams[team].ilk11PanelId =
        panelId;

      save();

      return message.reply({
        embeds: [
          firstXIEmbed(team)
        ],
        components: [
          ...positionButtons(panelId),
          formationMenu(panelId),
          ...firstXIActions(panelId)
        ]
      });
    }

    // MAÇ
    if (
      command === ".maç" ||
      command === ".mac"
    ) {
      if (
        message.channel.id !==
        IDS.channels.mac
      ) {
        return message.reply(
          "❌ Maç komutu sadece maç kanalında kullanılabilir."
        );
      }

      if (!canSpeak(message.member)) {
        return message.reply(
          "❌ Sadece Spiker/Yönetici kullanabilir."
        );
      }

      const teams =
        TEAM_NAMES.filter(
          team =>
            content.includes(team)
        );

      if (
        teams.length < 2 ||
        teams[0] === teams[1]
      ) {
        return message.reply(
          "❌ Kullanım: `.maç Barcelona Real Madrid`"
        );
      }

      return startMatch(
        message.guild,
        teams[0],
        teams[1]
      );
    }

    // FİKSTÜR EKLE
    if (
      command === ".fiksturekle"
    ) {
      if (!canSpeak(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const teams =
        TEAM_NAMES.filter(
          team =>
            content.includes(team)
        );

      const dateMatch =
        content.match(
          /(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/
        );

      if (
        teams.length < 2 ||
        !dateMatch
      ) {
        return message.reply(
          "❌ Kullanım: `.fiksturekle Barcelona Real Madrid 2026-09-10 20:00`"
        );
      }

      const timestamp =
        parseDateTime(
          dateMatch[1],
          dateMatch[2]
        );

      if (!timestamp) {
        return message.reply(
          "❌ Geçersiz tarih."
        );
      }

      const fixture = {
        id: db.nextFixtureId++,
        team1: teams[0],
        team2: teams[1],
        timestamp,
        started: false,
        finished: false
      };

      db.fixtures.push(
        fixture
      );

      save();

      return message.reply(
        `📅 **${teams[0]} vs ${teams[1]}** fikstüre eklendi.\n` +
        `<t:${Math.floor(timestamp / 1000)}:F>`
      );
    }

    // FİKSTÜR LİSTE
    if (
      command === ".fikstür" ||
      command === ".fikstur"
    ) {
      const fixtures =
        db.fixtures
          .filter(
            f => !f.finished
          )
          .sort(
            (a, b) =>
              a.timestamp -
              b.timestamp
          )
          .slice(0, 20);

      if (!fixtures.length) {
        return message.reply(
          "📅 Aktif fikstür yok."
        );
      }

      return message.reply(
        fixtures
          .map(
            f =>
              `**#${f.id}** ${f.team1} vs ${f.team2} — <t:${Math.floor(f.timestamp / 1000)}:F>`
          )
          .join("\n")
      );
    }

    // FİKSTÜR ÇIKAR
    if (
      command === ".fiksturcikar"
    ) {
      if (!canSpeak(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const teams =
        TEAM_NAMES.filter(
          team =>
            content.includes(team)
        );

      if (teams.length < 2) {
        return message.reply(
          "❌ İki takım belirt."
        );
      }

      const index =
        db.fixtures.findIndex(
          f =>
            !f.started &&
            (
              (
                f.team1 === teams[0] &&
                f.team2 === teams[1]
              ) ||
              (
                f.team1 === teams[1] &&
                f.team2 === teams[0]
              )
            )
        );

      if (index === -1) {
        return message.reply(
          "❌ Böyle bir fikstür bulunamadı."
        );
      }

      db.fixtures.splice(
        index,
        1
      );

      save();

      return message.reply(
        "🗑️ Fikstür kaldırıldı."
      );
    }

    // PUAN
    if (command === ".puan") {
      return message.reply({
        embeds: [
          standingsEmbed()
        ]
      });
    }

    // TAKIM DEĞER
    if (
      command === ".takımdeğer" ||
      command === ".takimdeger"
    ) {
      if (!canValue(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const amount =
        parseAmount(
          args[args.length - 1]
        );

      const team =
        args.slice(0, -1).join(" ");

      if (
        !TEAM_NAMES.includes(team) ||
        amount === null
      ) {
        return message.reply(
          "❌ Kullanım: `.takımdeğer Barcelona 850M`"
        );
      }

      ensureTeam(team).value =
        amount;

      save();

      return message.reply(
        `💰 **${team}** takım değeri **${formatValue(amount)}** oldu.`
      );
    }

    // TAKIM PUAN EKLE
    if (command === ".puanekle") {
      if (!canSquad(message.member)) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const amount =
        Number(
          args[args.length - 1]
        );

      const team =
        args.slice(0, -1).join(" ");

      if (
        !TEAM_NAMES.includes(team) ||
        !Number.isFinite(amount)
      ) {
        return message.reply(
          "❌ Kullanım: `.puanekle Barcelona 3`"
        );
      }

      db.standings[team].points +=
        amount;

      save();

      return message.reply(
        `🏆 **${team}** puanına **${amount}** eklendi.`
      );
    }

    // TWEET
    if (command === ".tweet") {
      if (
        message.channel.id !==
        IDS.channels.tweet
      ) {
        return message.reply(
          "❌ Tweet komutu sadece tweet kanalında kullanılabilir."
        );
      }

      const text =
        args.join(" ").trim();

      if (!text) {
        return message.reply(
          "❌ Tweet yaz."
        );
      }

      const last =
        db.tweetCooldowns[
          message.author.id
        ] || 0;

      const reward =
        Date.now() - last >=
        24 * 60 * 60 * 1000;

      await message.delete()
        .catch(() => {});

      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setAuthor({
              name: getPlayerName(
                message.member
              ),
              iconURL:
                message.author.displayAvatarURL()
            })
            .setDescription(text)
            .setFooter({
              text: "Axera League • Tweet"
            })
        ]
      });

      if (reward) {
        db.tweetCooldowns[
          message.author.id
        ] = Date.now();

        await changePlayerValue(
          message.member,
          5
        );

        save();
      }

      return;
    }

    // TICKET PANEL
    if (
      command === ".ticketpanel"
    ) {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Sadece Yönetici kullanabilir."
        );
      }

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(
              "🎫 Axera League Destek"
            )
            .setDescription(
              "Destek almak için butona bas."
            )
        ],
        components: [
          new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(
                  "ticketcreate"
                )
                .setLabel(
                  "🎫 Destek Talebi Oluştur"
                )
                .setStyle(
                  ButtonStyle.Primary
                )
            )
        ]
      });
    }

    // ROL PANEL
    if (command === ".rolpanel") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Sadece Yönetici kullanabilir."
        );
      }

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(
              "🎭 Axera League Rol Paneli"
            )
            .setDescription(
              "Bildirim rollerini butonlardan alıp çıkarabilirsin."
            )
        ],
        components: [
          new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(
                  "role:partner"
                )
                .setLabel(
                  "Partner Ping"
                )
                .setStyle(
                  ButtonStyle.Secondary
                ),

              new ButtonBuilder()
                .setCustomId(
                  "role:mac"
                )
                .setLabel(
                  "Maç Ping"
                )
                .setStyle(
                  ButtonStyle.Secondary
                ),

              new ButtonBuilder()
                .setCustomId(
                  "role:duyuru"
                )
                .setLabel(
                  "Duyuru Ping"
                )
                .setStyle(
                  ButtonStyle.Secondary
                ),

              new ButtonBuilder()
                .setCustomId(
                  "role:cekilis"
                )
                .setLabel(
                  "Çekiliş Ping"
                )
                .setStyle(
                  ButtonStyle.Secondary
                ),

              new ButtonBuilder()
                .setCustomId(
                  "role:medya"
                )
                .setLabel(
                  "Medya Ping"
                )
                .setStyle(
                  ButtonStyle.Secondary
                )
            )
        ]
      });
    }

    // ŞARTLAR
    if (
      command === ".sart" ||
      command === ".şart"
    ) {
      return message.reply(
        "📜 **Axera League Şartları**\n\n" +
        "✓ Kalıcı Tık: Kalıcı 「✓」 kanalına tıklayınız.\n" +
        "🎭 Rol Al: Rol Al kanalından en az 2 rol alınız.\n\n" +
        "Bu işlemler zorunlu değildir."
      );
    }

    // SİL
    if (command === ".sil") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Sadece Yönetici kullanabilir."
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
          "❌ 1-1000 arasında sayı yaz."
        );
      }

      await message.delete()
        .catch(() => {});

      const deleted =
        await message.channel
          .bulkDelete(
            amount,
            true
          )
          .catch(() => null);

      if (deleted) {
        const msg =
          await message.channel.send(
            `🧹 **${deleted.size}** mesaj silindi.`
          );

        setTimeout(
          () =>
            msg.delete()
              .catch(() => {}),
          3000
        );
      }

      return;
    }

    // EMBED
    if (command === ".embed") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Sadece Yönetici kullanabilir."
        );
      }

      const raw =
        args.join(" ");

      const [title, description] =
        raw
          .split("|")
          .map(
            x => x?.trim()
          );

      if (!title || !description) {
        return message.reply(
          "❌ Kullanım: `.embed Başlık | Açıklama`"
        );
      }

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(title)
            .setDescription(
              description
            )
        ]
      });
    }

    // KICK / BAN / MUTE
    if (
      [
        ".kick",
        ".ban",
        ".mute",
        ".unmute"
      ].includes(command)
    ) {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Sadece Yönetici kullanabilir."
        );
      }

      const target =
        await getMentionedMember(message);

      if (!target) {
        return message.reply(
          `❌ Kullanım: \`${command} @Oyuncu\``
        );
      }

      if (command === ".kick") {
        await target.kick()
          .catch(() => {});

        return message.reply(
          `👢 ${target.user.tag} atıldı.`
        );
      }

      if (command === ".ban") {
        await target.ban()
          .catch(() => {});

        return message.reply(
          `🔨 ${target.user.tag} banlandı.`
        );
      }

      if (command === ".mute") {
        await target.timeout(
          10 * 60 * 1000
        ).catch(() => {});

        return message.reply(
          `🔇 ${target.user.tag} 10 dakika susturuldu.`
        );
      }

      await target.timeout(
        null
      ).catch(() => {});

      return message.reply(
        `🔊 ${target.user.tag} susturması kaldırıldı.`
      );
    }

    // DM
    if (command === ".dm") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Sadece Yönetici kullanabilir."
        );
      }

      const target =
        await getMentionedMember(message);

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.dm @Oyuncu mesaj`"
        );
      }

      const mentionIndex =
        args.findIndex(
          x => /^<@!?\d+>$/.test(x)
        );

      const text =
        args
          .slice(
            mentionIndex + 1
          )
          .join(" ")
          .trim();

      if (!text) {
        return message.reply(
          "❌ Mesaj yaz."
        );
      }

      const sent =
        await target.send(text)
          .then(() => true)
          .catch(() => false);

      return message.reply(
        sent
          ? "✅ DM gönderildi."
          : "❌ DM gönderilemedi."
      );
    }

    // AI
    if (
      command === ".ai" ||
      command === ".yapayzeka"
    ) {
      const text =
        args.join(" ").trim();

      if (!text) {
        return message.reply(
          "❌ Bir soru yaz."
        );
      }

      return aiReply(
        message,
        text
      );
    }
  }
);

client.on(
  "interactionCreate",
  async interaction => {
    try {
      // KAYIT BUTONLARI
      if (interaction.isButton()) {
        const id =
          interaction.customId;

        if (
          id.startsWith(
            "register:"
          )
        ) {
          const [
            ,
            panelId,
            type
          ] = id.split(":");

          const panel =
            db.registrationPanels[
              panelId
            ];

          if (!panel) {
            return interaction.reply({
              content:
                "❌ Kayıt paneli geçersiz.",
              ephemeral: true
            });
          }

          if (
            !canRegister(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Kayıt yetkin yok.",
              ephemeral: true
            });
          }

          const target =
            await interaction.guild.members
              .fetch(panel.userId)
              .catch(() => null);

          if (!target) {
            return interaction.reply({
              content:
                "❌ Oyuncu bulunamadı.",
              ephemeral: true
            });
          }

          // İPTAL
          if (type === "cancel") {
            delete db.registrationPanels[
              panelId
            ];

            save();

            return interaction.update({
              embeds: [
                new EmbedBuilder()
                  .setTitle(
                    "❌ Kayıt İptal Edildi"
                  )
                  .setDescription(
                    `<@${target.id}> kayıt işlemi iptal edildi.`
                  )
              ],
              components: []
            });
          }

          // KALECİ
          // Kullanıcının verdiği güncel ID listesinde
          // Kaleci rol ID'si bulunmadığından yanlış ID
          // kullanılmaması için panel güvenli şekilde uyarır.
          if (type === "kaleci") {
            return interaction.reply({
              content:
                "🧤 Kaleci rolünün ID'si tanımlı olmadığı için bu seçenek şu anda etkin değil.",
              ephemeral: true
            });
          }

          const roleMap = {
            futbolcu:
              IDS.roles.futbolcu,
            uye:
              IDS.roles.uye,
            td:
              IDS.roles.teknikDirektor
          };

          const roleId =
            roleMap[type];

          if (!roleId) {
            return interaction.reply({
              content:
                "❌ Geçersiz kayıt seçimi.",
              ephemeral: true
            });
          }

          const registrationRoles = [
            IDS.roles.kayitsiz,
            IDS.roles.futbolcu,
            IDS.roles.uye,
            IDS.roles.teknikDirektor
          ];

          for (
            const role of registrationRoles
          ) {
            await target.roles
              .remove(role)
              .catch(() => {});
          }

          await target.roles
            .add(roleId)
            .catch(() => {});

          const user =
            ensureUser(
              target.id
            );

          user.name =
            panel.nickname;

          user.registered =
            true;

          if (target.manageable) {
            await target
              .setNickname(
                panel.nickname.slice(0, 32)
              )
              .catch(() => {});
          }

          delete db.registrationPanels[
            panelId
          ];

          save();

          return interaction.update({
            embeds: [
              new EmbedBuilder()
                .setTitle(
                  "✅ Kayıt Tamamlandı"
                )
                .setDescription(
                  `<@${target.id}> başarıyla kayıt edildi.\n\n` +
                  `📝 **İsim:** ${panel.nickname}\n` +
                  `🎭 **Rol:** <@&${roleId}>`
                )
            ],
            components: []
          });
        }

        // İLK 11 POZİSYON
        if (
          id.startsWith(
            "i11pos:"
          )
        ) {
          const [
            ,
            panelId,
            position
          ] = id.split(":");

          const team =
            TEAM_NAMES.find(
              name =>
                db.teams[name]
                  ?.ilk11PanelId ===
                panelId
            );

          if (!team) {
            return interaction.reply({
              content:
                "❌ İlk 11 paneli bulunamadı.",
              ephemeral: true
            });
          }

          if (
            !canManageFirstXI(
              interaction.member,
              team
            )
          ) {
            return interaction.reply({
              content:
                "❌ Bu takımın İlk 11'ini yönetemezsin.",
              ephemeral: true
            });
          }

          const players =
            getTeamPlayers(
              interaction.guild,
              team
            );

          return interaction.update({
            embeds: [
              firstXIEmbed(team)
            ],
            components:
              playerSelect(
                panelId,
                position,
                players,
                0
              )
          });
        }

        // İLK 11 SAYFALAMA
        if (
          id.startsWith(
            "i11page:"
          )
        ) {
          const [
            ,
            panelId,
            position,
            pageText
          ] = id.split(":");

          const page =
            Number(pageText) || 0;

          const team =
            TEAM_NAMES.find(
              name =>
                db.teams[name]
                  ?.ilk11PanelId ===
                panelId
            );

          if (!team) {
            return interaction.reply({
              content:
                "❌ Panel bulunamadı.",
              ephemeral: true
            });
          }

          const players =
            getTeamPlayers(
              interaction.guild,
              team
            );

          return interaction.update({
            embeds: [
              firstXIEmbed(team)
            ],
            components:
              playerSelect(
                panelId,
                position,
                players,
                page
              )
          });
        }

        // GERİ
        if (
          id.startsWith(
            "i11back:"
          )
        ) {
          const panelId =
            id.split(":")[1];

          const team =
            TEAM_NAMES.find(
              name =>
                db.teams[name]
                  ?.ilk11PanelId ===
                panelId
            );

          if (!team) {
            return interaction.reply({
              content:
                "❌ Panel bulunamadı.",
              ephemeral: true
            });
          }

          return interaction.update({
            embeds: [
              firstXIEmbed(team)
            ],
            components: [
              ...positionButtons(
                panelId
              ),
              formationMenu(
                panelId
              ),
              ...firstXIActions(
                panelId
              )
            ]
          });
        }

        // İLK 11 KAYDET
        if (
          id.startsWith(
            "i11save:"
          )
        ) {
          const panelId =
            id.split(":")[1];

          const team =
            TEAM_NAMES.find(
              name =>
                db.teams[name]
                  ?.ilk11PanelId ===
                panelId
            );

          if (!team) {
            return interaction.reply({
              content:
                "❌ Panel bulunamadı.",
              ephemeral: true
            });
          }

          if (
            !canManageFirstXI(
              interaction.member,
              team
            )
          ) {
            return interaction.reply({
              content:
                "❌ Yetkin yok.",
              ephemeral: true
            });
          }

          save();

          return interaction.reply({
            content:
              `💾 **${team}** İlk 11'i kaydedildi.`,
            ephemeral: true
          });
        }

        // İLK 11 TEMİZLE
        if (
          id.startsWith(
            "i11clear:"
          )
        ) {
          const panelId =
            id.split(":")[1];

          const team =
            TEAM_NAMES.find(
              name =>
                db.teams[name]
                  ?.ilk11PanelId ===
                panelId
            );

          if (!team) {
            return interaction.reply({
              content:
                "❌ Panel bulunamadı.",
              ephemeral: true
            });
          }

          if (
            !canManageFirstXI(
              interaction.member,
              team
            )
          ) {
            return interaction.reply({
              content:
                "❌ Yetkin yok.",
              ephemeral: true
            });
          }

          db.teams[team].ilk11 =
            defaultFirstXI();

          save();

          return interaction.update({
            embeds: [
              firstXIEmbed(team)
            ],
            components: [
              ...positionButtons(
                panelId
              ),
              formationMenu(
                panelId
              ),
              ...firstXIActions(
                panelId
              )
            ]
          });
        }

        // İLK 11 KAPAT
        if (
          id.startsWith(
            "i11close:"
          )
        ) {
          return interaction.update({
            embeds: [
              new EmbedBuilder()
                .setTitle(
                  "⚽ Axera League • İlk 11"
                )
                .setDescription(
                  "Panel kapatıldı."
                )
            ],
            components: []
          });
        }

        // TICKET OLUŞTUR
        if (
          id === "ticketcreate"
        ) {
          const guild =
            interaction.guild;

          const channel =
            await guild.channels.create({
              name:
                `destek-${interaction.user.username}`
                  .toLowerCase()
                  .replace(
                    /[^a-z0-9-]/g,
                    ""
                  )
                  .slice(0, 70),

              type:
                ChannelType.GuildText,

              permissionOverwrites: [
                {
                  id:
                    guild.roles.everyone.id,
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
                {
                  id:
                    IDS.roles.moderator,
                  allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory
                  ]
                }
              ]
            });

          db.tickets[channel.id] = {
            creator:
              interaction.user.id,
            lastMessage:
              Date.now()
          };

          save();

          await channel.send({
            content:
              `<@${interaction.user.id}>`,
            embeds: [
              new EmbedBuilder()
                .setTitle(
                  "🎫 Destek Talebi"
                )
                .setDescription(
                  "Sorununuzu buraya yazabilirsiniz."
                )
            ],
            components: [
              new ActionRowBuilder()
                .addComponents(
                  new ButtonBuilder()
                    .setCustomId(
                      `ticketclose:${channel.id}`
                    )
                    .setLabel(
                      "🔒 Bileti Kapat"
                    )
                    .setStyle(
                      ButtonStyle.Danger
                    )
                )
            ]
          });

          return interaction.reply({
            content:
              `✅ Destek kanalın oluşturuldu: ${channel}`,
            ephemeral: true
          });
        }

        // TICKET KAPAT
        if (
          id.startsWith(
            "ticketclose:"
          )
        ) {
          const channelId =
            id.split(":")[1];

          const ticket =
            db.tickets[channelId];

          if (!ticket) {
            return interaction.reply({
              content:
                "❌ Ticket bulunamadı.",
              ephemeral: true
            });
          }

          if (
            interaction.user.id !==
              ticket.creator &&
            !isAdmin(
              interaction.member
            ) &&
            !hasRole(
              interaction.member,
              IDS.roles.moderator
            )
          ) {
            return interaction.reply({
              content:
                "❌ Bu ticketı kapatamazsın.",
              ephemeral: true
            });
          }

          delete db.tickets[
            channelId
          ];

          save();

          await interaction.reply(
            "🔒 Ticket kapatılıyor..."
          );

          setTimeout(
            () =>
              interaction.channel
                .delete()
                .catch(() => {}),
            1500
          );

          return;
        }

        // ROLLER
        if (
          id.startsWith("role:")
        ) {
          const key =
            id.split(":")[1];

          const roles = {
            partner:
              IDS.roles.partnerPing,
            mac:
              IDS.roles.macPing,
            duyuru:
              IDS.roles.duyuruPing,
            cekilis:
              IDS.roles.cekilisPing,
            medya:
              IDS.roles.medyaPing
          };

          const roleId =
            roles[key];

          if (!roleId) {
            return interaction.reply({
              content:
                "❌ Rol bulunamadı.",
              ephemeral: true
            });
          }

          if (
            interaction.member.roles.cache.has(
              roleId
            )
          ) {
            await interaction.member.roles
              .remove(roleId)
              .catch(() => {});

            return interaction.reply({
              content:
                "✅ Rol kaldırıldı.",
              ephemeral: true
            });
          }

          await interaction.member.roles
            .add(roleId)
            .catch(() => {});

          return interaction.reply({
            content:
              "✅ Rol verildi.",
            ephemeral: true
          });
        }
      }

      // SELECT MENÜLER
      if (
        interaction.isStringSelectMenu()
      ) {
        const id =
          interaction.customId;

        // İLK 11 TAKIM SEÇ
        if (
          id.startsWith(
            "i11team:"
          )
        ) {
          const team =
            interaction.values[0];

          if (
            !canManageFirstXI(
              interaction.member,
              team
            )
          ) {
            return interaction.reply({
              content:
                "❌ Bu takımı yönetemezsin.",
              ephemeral: true
            });
          }

          ensureTeam(team);

          const panelId =
            `${interaction.user.id}_${Date.now()}`;

          db.teams[team]
            .ilk11PanelId =
            panelId;

          save();

          return interaction.update({
            content: "",
            embeds: [
              firstXIEmbed(team)
            ],
            components: [
              ...positionButtons(
                panelId
              ),
              formationMenu(
                panelId
              ),
              ...firstXIActions(
                panelId
              )
            ]
          });
        }

        // İLK 11 OYUNCU SEÇ
        if (
          id.startsWith(
            "i11player:"
          )
        ) {
          const [
            ,
            panelId,
            position
          ] = id.split(":");

          const playerId =
            interaction.values[0];

          const team =
            TEAM_NAMES.find(
              name =>
                db.teams[name]
                  ?.ilk11PanelId ===
                panelId
            );

          if (!team) {
            return interaction.reply({
              content:
                "❌ Panel bulunamadı.",
              ephemeral: true
            });
          }

          if (
            playerId === "none"
          ) {
            return interaction.reply({
              content:
                "❌ Oyuncu bulunamadı.",
              ephemeral: true
            });
          }

          if (
            !canManageFirstXI(
              interaction.member,
              team
            )
          ) {
            return interaction.reply({
              content:
                "❌ Yetkin yok.",
              ephemeral: true
            });
          }

          if (
            !getTeamPlayers(
              interaction.guild,
              team
            ).some(
              member =>
                member.id ===
                playerId
            )
          ) {
            return interaction.reply({
              content:
                "❌ Bu oyuncu takım rolünde değil.",
              ephemeral: true
            });
          }

          for (
            const pos of POSITIONS
          ) {
            if (
              db.teams[team].ilk11[pos] ===
              playerId
            ) {
              db.teams[team].ilk11[pos] =
                null;
            }
          }

          db.teams[team].ilk11[position] =
            playerId;

          save();

          return interaction.update({
            embeds: [
              firstXIEmbed(team)
            ],
            components: [
              ...positionButtons(
                panelId
              ),
              formationMenu(
                panelId
              ),
              ...firstXIActions(
                panelId
              )
            ]
          });
        }

        // FORMASYON
        if (
          id.startsWith(
            "i11form:"
          )
        ) {
          const panelId =
            id.split(":")[1];

          const formation =
            interaction.values[0];

          const team =
            TEAM_NAMES.find(
              name =>
                db.teams[name]
                  ?.ilk11PanelId ===
                panelId
            );

          if (!team) {
            return interaction.reply({
              content:
                "❌ Panel bulunamadı.",
              ephemeral: true
            });
          }

          if (
            !canManageFirstXI(
              interaction.member,
              team
            )
          ) {
            return interaction.reply({
              content:
                "❌ Yetkin yok.",
              ephemeral: true
            });
          }

          db.teams[team]
            .ilk11.formation =
            formation;

          db.formations[team] =
            formation;

          save();

          return interaction.update({
            embeds: [
              firstXIEmbed(team)
            ],
            components: [
              ...positionButtons(
                panelId
              ),
              formationMenu(
                panelId
              ),
              ...firstXIActions(
                panelId
              )
            ]
          });
        }
      }
    } catch (error) {
      console.error(
        "Interaction:",
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

// 60 dakika işlem olmayan ticketları kapat
setInterval(
  async () => {
    const now =
      Date.now();

    for (
      const [channelId, ticket]
      of Object.entries(db.tickets)
    ) {
      if (
        now - ticket.lastMessage <
        60 * 60 * 1000
      ) {
        continue;
      }

      const channel =
        client.channels.cache.get(
          channelId
        );

      if (channel) {
        await channel.delete()
          .catch(() => {});
      }

      delete db.tickets[
        channelId
      ];
    }

    save();
  },
  60 * 1000
);

process.on(
  "SIGINT",
  () => {
    save();
    client.destroy();
    process.exit(0);
  }
);

process.on(
  "SIGTERM",
  () => {
    save();
    client.destroy();
    process.exit(0);
  }
);

client.login(TOKEN);
