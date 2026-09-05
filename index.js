const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ======================================================
// AXERA LEAGUE BOT
// ======================================================

const TOKEN = process.env.TOKEN;
const PREFIX = ".";

const OWNER_ID = "1280275560739897409";

// ======================================================
// ROLLER
// ======================================================

const ROLES = {
  KAYIT_YETKILISI: "1534456315366342716",
  KAYITSIZ: "1534457560134844517",
  KALECI: "1534492034243498195",
  UYE: "1534457460163608636",
  FUTBOLCU: "1534457228986421278",
  TEKNIK_DIREKTOR: "1534456648930693120",
  DEGER_YETKILISI: "1534456192913375382",
  SPIKER: "1535251168169697390"
};

// ======================================================
// KANALLAR
// ======================================================

const CHANNELS = {
  KAYIT: "1534460177884123276",
  SOHBET: "1534469475917758586",
  MAC: "1534477626872168541",
  FIKSTUR: "1534475908566483075",
  PUAN: "1534475991404253284",
  BOT_DURUM: "1545921149018570842",

  // Bunları kendi Penaltı / Antrenman kanal ID'lerinle değiştir.
  PENALTI: process.env.PENALTI_CHANNEL_ID || "",
  ANTRENMAN: process.env.ANTRENMAN_CHANNEL_ID || ""
};

// ======================================================
// TAKIMLAR
// ======================================================

const TEAMS = {
  "Barcelona": "1534480715779936297",
  "Real Madrid": "1534480984064528655",
  "Galatasaray": "1534481073629691995",
  "Fenerbahçe": "1534481156840620183",
  "Beşiktaş": "1534481259739348992",
  "Arsenal": "1534481678653853706",
  "Chelsea": "1534481742285770813",
  "Manchester City": "1534481568590991370",
  "Paris Saint-Germain": "1534481952982306867",
  "Liverpool": "1534481826696003594",
  "Manchester United": "1534481426463068180"
};

// ======================================================
// VERİTABANI
// ======================================================

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "database.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, {
    recursive: true
  });
}

let db = {
  guilds: {},
  players: {},
  teams: {},
  fixtures: {},
  matches: {},
  transfers: {}
};

function loadDB() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(
        fs.readFileSync(DATA_FILE, "utf8")
      );

      db = {
        guilds: data.guilds || {},
        players: data.players || {},
        teams: data.teams || {},
        fixtures: data.fixtures || {},
        matches: data.matches || {},
        transfers: data.transfers || {}
      };
    }
  } catch (error) {
    console.error(
      "Veritabanı yükleme hatası:",
      error
    );
  }
}

function saveDB() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(db, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error(
      "Veritabanı kayıt hatası:",
      error
    );
  }
}

loadDB();

// ======================================================
// GUILD DATA
// ======================================================

function ensureGuild(guildId) {
  if (!db.guilds[guildId]) {
    db.guilds[guildId] = {
      points: {}
    };
  }

  if (!db.players[guildId]) {
    db.players[guildId] = {};
  }

  if (!db.teams[guildId]) {
    db.teams[guildId] = {};
  }

  if (!db.fixtures[guildId]) {
    db.fixtures[guildId] = [];
  }

  if (!db.matches[guildId]) {
    db.matches[guildId] = [];
  }

  if (!db.transfers[guildId]) {
    db.transfers[guildId] = {};
  }
}

function getPlayer(guildId, userId) {
  ensureGuild(guildId);

  if (!db.players[guildId][userId]) {
    db.players[guildId][userId] = {
      registered: false,
      nickname: "",
      position: "",
      value: 0,
      budget: 0,
      team: null,
      salary: 0,
      seasons: 0,
      training: 0
    };
  }

  return db.players[guildId][userId];
}

function getTeam(guildId, teamName) {
  ensureGuild(guildId);

  if (!db.teams[guildId][teamName]) {
    db.teams[guildId][teamName] = {
      players: [],
      value: 0
    };
  }

  return db.teams[guildId][teamName];
}

// ======================================================
// YARDIMCI FONKSİYONLAR
// ======================================================

function formatMoney(value) {
  value = Number(value) || 0;

  if (Number.isInteger(value)) {
    return `${value}M€`;
  }

  return `${Number(value.toFixed(2))}M€`;
}

function parseMoney(value) {
  if (!value) {
    return NaN;
  }

  return Number(
    String(value)
      .replace(/M€/gi, "")
      .replace(/M/gi, "")
      .replace(/€/g, "")
      .replace(",", ".")
      .trim()
  );
}

function isOwner(member) {
  return member.id === OWNER_ID;
}

function hasRole(member, roleId) {
  return member.roles.cache.has(roleId);
}

function isAdmin(member) {
  return (
    isOwner(member) ||
    member.permissions.has(
      PermissionsBitField.Flags.Administrator
    )
  );
}

function noTag(message, content) {
  return message.reply({
    content,
    allowedMentions: {
      repliedUser: false,
      users: [],
      roles: []
    }
  });
}

function normalize(text) {
  return String(text || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u");
}

function getMentionedMember(message, text) {
  if (!text) return null;

  const id = text.replace(/[<@!>]/g, "");

  return (
    message.guild.members.cache.get(id) ||
    null
  );
}

function getTeamFromToken(text) {
  if (!text) return null;

  const id = text.replace(/[<@&>]/g, "");

  for (const [team, roleId] of Object.entries(TEAMS)) {
    if (roleId === id) {
      return team;
    }
  }

  const normalized =
    normalize(text);

  for (const team of Object.keys(TEAMS)) {
    if (
      normalize(team) === normalized
    ) {
      return team;
    }
  }

  return null;
}

function getMemberTeam(member) {
  for (const [team, roleId] of Object.entries(TEAMS)) {
    if (
      member.roles.cache.has(roleId)
    ) {
      return team;
    }
  }

  return null;
}

function isRegistered(member) {
  return (
    member &&
    !member.roles.cache.has(
      ROLES.KAYITSIZ
    )
  );
}

function getTeamValue(guildId, teamName) {
  const team =
    getTeam(
      guildId,
      teamName
    );

  let total = 0;

  for (const player of team.players) {
    const p =
      getPlayer(
        guildId,
        player.userId
      );

    total += Number(p.value) || 0;
  }

  return total;
}

function syncTeamValue(
  guildId,
  teamName
) {
  const team =
    getTeam(
      guildId,
      teamName
    );

  team.value =
    getTeamValue(
      guildId,
      teamName
    );
}

function permission(
  message,
  roleId,
  roleName
) {
  if (
    isOwner(message.member) ||
    hasRole(message.member, roleId)
  ) {
    return true;
  }

  noTag(
    message,
    `❌ Bu komut için **${roleName}** yetkisi gerekiyor.`
  );

  return false;
}

function teamPermission(message) {
  if (
    isOwner(message.member) ||
    hasRole(
      message.member,
      ROLES.TEKNIK_DIREKTOR
    ) ||
    getMemberTeam(message.member)
  ) {
    return true;
  }

  noTag(
    message,
    "❌ Bu komutu yalnızca Teknik Direktör, takım rolü bulunan kişi veya bot sahibi kullanabilir."
  );

  return false;
}

// ======================================================
// NICKNAME SADECE M€ DEĞERİNİ DEĞİŞTİRİR
// ======================================================

async function updateOnlyValuePart(
  member,
  newValue
) {
  let current =
    member.nickname ||
    member.user.globalName ||
    member.user.username;

  const valueRegex =
    /(\|\s*)\d+(?:[.,]\d+)?\s*M€\s*$/i;

  if (valueRegex.test(current)) {

    current =
      current.replace(
        valueRegex,
        `$1${formatMoney(newValue)}`
      );

  } else {

    current =
      `${current} | ${formatMoney(newValue)}`;
  }

  if (current.length > 32) {

    const suffix =
      ` | ${formatMoney(newValue)}`;

    const base =
      current
        .replace(
          /\|\s*\d+(?:[.,]\d+)?\s*M€\s*$/i,
          ""
        )
        .trim();

    current =
      base.slice(
        0,
        Math.max(
          1,
          32 - suffix.length
        )
      ) + suffix;
  }

  await member
    .setNickname(current)
    .catch(() => {});
}

// ======================================================
// CLIENT
// ======================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],

  partials: [
    Partials.Channel
  ]
});

// ======================================================
// UPTIME
// ======================================================

const startedAt = Date.now();

function uptime() {
  const diff =
    Date.now() - startedAt;

  const hours =
    Math.floor(
      diff / 3600000
    );

  const minutes =
    Math.floor(
      (diff % 3600000) / 60000
    );

  return `${hours} saat ${minutes} dakika`;
}

// ======================================================
// BOT DURUM
// ======================================================

async function sendStatus() {

  const channel =
    await client.channels
      .fetch(CHANNELS.BOT_DURUM)
      .catch(() => null);

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    return;
  }

  await channel.send({
    content:
`🤖 **BOT DURUMU**

🟢 **Tüm sistemler sorunsuz çalışıyor.**

⏱️ **Çalışma Süresi:** ${uptime()}

🕐 **Son Kontrol:** ${new Date().toLocaleTimeString("tr-TR")}`,

    allowedMentions: {
      parse: []
    }
  }).catch(() => {});
}

// ======================================================
// PUAN SİSTEMİ
// ======================================================

function initializePoints(
  guildId
) {
  ensureGuild(guildId);

  for (const team of Object.keys(TEAMS)) {

    if (
      !db.guilds[guildId]
        .points[team]
    ) {

      db.guilds[guildId]
        .points[team] = {
          points: 0,
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goalsFor: 0,
          goalsAgainst: 0
        };
    }
  }
}

function updatePoints(
  guildId,
  team,
  gf,
  ga
) {

  initializePoints(guildId);

  const data =
    db.guilds[guildId]
      .points[team];

  data.played++;
  data.goalsFor += gf;
  data.goalsAgainst += ga;

  if (gf > ga) {

    data.points += 3;
    data.wins++;

  } else if (gf === ga) {

    data.points++;
    data.draws++;

  } else {

    data.losses++;
  }
}

function getStandings(
  guildId
) {

  initializePoints(guildId);

  return Object.entries(
    db.guilds[guildId].points
  )
    .map(([team, data]) => ({
      team,
      ...data,
      gd:
        data.goalsFor -
        data.goalsAgainst
    }))
    .sort((a, b) => {

      if (
        b.points !== a.points
      ) {
        return (
          b.points -
          a.points
        );
      }

      if (
        b.gd !== a.gd
      ) {
        return (
          b.gd -
          a.gd
        );
      }

      return (
        b.goalsFor -
        a.goalsFor
      );
    });
}

function standingsText(
  guildId
) {

  return getStandings(
    guildId
  )
    .map(
      (x, i) =>
`${i + 1}. **${x.team}**
🏆 ${x.points} Puan | ⚽ ${x.goalsFor}-${x.goalsAgainst} | 🟢 ${x.wins}G | 🟡 ${x.draws}B | 🔴 ${x.losses}M`
    )
    .join("\n\n");
}

// ======================================================
// KADRO
// ======================================================

function buildLineup(
  guildId,
  teamName
) {

  const team =
    getTeam(
      guildId,
      teamName
    );

  const real =
    team.players
      .slice(0, 11)
      .map(x => ({
        ...x,
        npc: false
      }));

  const lineup = [...real];

  while (
    lineup.length < 11
  ) {

    lineup.push({
      userId: null,
      name:
        `NPC ${lineup.length + 1}`,
      position: "NPC",
      value: 0,
      npc: true
    });
  }

  return lineup;
}

// ======================================================
// MAÇ
// ======================================================

async function runMatch(
  channel,
  guildId,
  team1,
  team2,
  fixture = null
) {

  let score1 = 0;
  let score2 = 0;

  const lineup1 =
    buildLineup(
      guildId,
      team1
    );

  const lineup2 =
    buildLineup(
      guildId,
      team2
    );

  await channel.send({
    content:
`🏟️ **MAÇ BAŞLADI**

🔵 **${team1}**
⚔️
🔴 **${team2}**

⏱️ **0' / 90'**

🎙️ **Spiker yayında!**`,

    allowedMentions: {
      parse: []
    }
  });

  for (
    let minute = 1;
    minute <= 90;
    minute++
  ) {

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          3000
        )
    );

    if (minute === 45) {

      await channel.send({
        content:
`⏸️ **DEVRE ARASI**

📊 **${team1} ${score1} - ${score2} ${team2}**`,

        allowedMentions: {
          parse: []
        }
      });
    }

    const chance =
      Math.random() * 100;

    // GOL
    if (chance < 4.5) {

      const teamOne =
        Math.random() < 0.5;

      const lineup =
        teamOne
          ? lineup1
          : lineup2;

      const player =
        lineup[
          Math.floor(
            Math.random() *
            lineup.length
          )
        ];

      if (teamOne) {
        score1++;
      } else {
        score2++;
      }

      await channel.send({
        content:
`🎙️ **${minute}'**

⚽ **GOOOL!**

👤 **${player.name}**

📊 **${team1} ${score1} - ${score2} ${team2}**`,

        allowedMentions: {
          parse: []
        }
      });
    }

    // KURTARIŞ
    else if (
      chance < 9
    ) {

      const lineup =
        Math.random() < 0.5
          ? lineup1
          : lineup2;

      const player =
        lineup[
          Math.floor(
            Math.random() *
            lineup.length
          )
        ];

      await channel.send({
        content:
`🎙️ **${minute}'**

🧤 **${player.name}** kaleciyi zorladı ancak gol çıkmadı.`,

        allowedMentions: {
          parse: []
        }
      });
    }

    // SARI KART
    else if (
      chance < 11
    ) {

      const lineup =
        Math.random() < 0.5
          ? lineup1
          : lineup2;

      const player =
        lineup[
          Math.floor(
            Math.random() *
            lineup.length
          )
        ];

      await channel.send({
        content:
`🎙️ **${minute}'**

🟨 **${player.name}** sarı kart gördü.`,

        allowedMentions: {
          parse: []
        }
      });
    }
  }

  // ====================================================
  // MAÇ SONU
  // ====================================================

  updatePoints(
    guildId,
    team1,
    score1,
    score2
  );

  updatePoints(
    guildId,
    team2,
    score2,
    score1
  );

  const winner =
    score1 > score2
      ? team1
      : score2 > score1
        ? team2
        : "Beraberlik";

  if (fixture) {

    fixture.status =
      "finished";

    fixture.score1 =
      score1;

    fixture.score2 =
      score2;

    fixture.winner =
      winner;
  }

  db.matches[
    guildId
  ].push({
    team1,
    team2,
    score1,
    score2,
    winner,
    date: Date.now()
  });

  saveDB();

  await channel.send({
    content:
`🏁 **MAÇ SONA ERDİ**

🏟️ **${team1} ${score1} - ${score2} ${team2}**

🏆 **Kazanan:** ${winner}`,

    allowedMentions: {
      parse: []
    }
  });

  // ====================================================
  // FİKSTÜR SONUCU
  // ====================================================

  const fixtureChannel =
    await client.channels
      .fetch(CHANNELS.FIKSTUR)
      .catch(() => null);

  if (
    fixtureChannel &&
    fixtureChannel.isTextBased()
  ) {

    await fixtureChannel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle(
            "🏁 MAÇ SONUCU"
          )
          .setDescription(
`🏟️ **${team1} ${score1} - ${score2} ${team2}**

🏆 **Kazanan:** ${winner}`
          )
      ]
    }).catch(() => {});
  }

  // ====================================================
  // PUAN SONUCU
  // ====================================================

  const pointsChannel =
    await client.channels
      .fetch(CHANNELS.PUAN)
      .catch(() => null);

  if (
    pointsChannel &&
    pointsChannel.isTextBased()
  ) {

    await pointsChannel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle(
            "🏆 GÜNCEL PUAN DURUMU"
          )
          .setDescription(
            standingsText(guildId)
          )
      ]
    }).catch(() => {});
  }
}

// ======================================================
// FİKSTÜR KONTROL
// ======================================================

async function checkFixtures() {

  for (
    const guildId
    of Object.keys(db.fixtures)
  ) {

    for (
      const fixture
      of db.fixtures[guildId]
    ) {

      if (
        fixture.status ===
          "scheduled" &&
        Date.now() >=
          fixture.timestamp
      ) {

        fixture.status =
          "live";

        saveDB();

        const channel =
          await client.channels
            .fetch(CHANNELS.MAC)
            .catch(() => null);

        if (
          channel &&
          channel.isTextBased()
        ) {

          runMatch(
            channel,
            guildId,
            fixture.team1,
            fixture.team2,
            fixture
          ).catch(console.error);
        }
      }
    }
  }
}

// ======================================================
// MESAJ KOMUTLARI
// ======================================================

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
        !message.content.startsWith(
          PREFIX
        )
      ) {
        return;
      }

      const raw =
        message.content
          .slice(PREFIX.length)
          .trim();

      const args =
        raw.split(/\s+/);

      const command =
        normalize(
          args.shift()
        );

      // ==================================================
      // YARDIM
      // ==================================================

      if (
        command === "yardim"
      ) {

        return noTag(
          message,
`📚 **AXERA LEAGUE KOMUTLARI**

👤 **Kayıt**
\`.k @oyuncu TakmaAdı\`
\`.ara oyuncu isim\`
\`.kayitsizver @oyuncu\`

🏋️ **Antrenman**
\`.ant\`
\`.antrenman\`

🥅 **Penaltı**
\`.pen\`
\`.penalti\`

💰 **Değer**
\`.dver @oyuncu miktar\`
\`.dsil @oyuncu miktar\`

💳 **Bütçe**
\`.butce\`
\`.gonder @oyuncu miktar\`
\`.butceekle @oyuncu miktar\`
\`.butcesil @oyuncu miktar\`

💼 **Transfer**
\`.kap @oyuncu @takım maaş sezon\`

👥 **Kadro**
\`.kadroekle @takım @oyuncu pozisyon\`
\`.kadrosil @takım @oyuncu\`
\`.kadro @takım\`

🏟️ **Maç**
\`.mac @takım1 @takım2\`

📅 **Fikstür**
\`.fiksturekle @takım1 @takım2 YYYY-AA-GG SS:DD\`

🏆 **Puan**
\`.puan\`

📩 **DM**
\`.dm all mesaj\`
\`.dm @oyuncu mesaj\``
        );
      }

      // ==================================================
      // KAYIT
      // ==================================================

      if (
        command === "k"
      ) {

        if (
          !permission(
            message,
            ROLES.KAYIT_YETKILISI,
            "Kayıt Yetkilisi"
          )
        ) {
          return;
        }

        const target =
          getMentionedMember(
            message,
            args[0]
          );

        const nickname =
          args
            .slice(1)
            .join(" ");

        if (!target) {
          return noTag(
            message,
            "❌ Oyuncuyu etiketlemelisin."
          );
        }

        if (!nickname) {
          return noTag(
            message,
            "❌ Takma ad yazmalısın."
          );
        }

        const p =
          getPlayer(
            message.guild.id,
            target.id
          );

        p.registered = true;
        p.nickname = nickname;

        await target
          .setNickname(nickname)
          .catch(() => {});

        const row =
          new ActionRowBuilder()
            .addComponents(

              new ButtonBuilder()
                .setCustomId(
                  `reg_${target.id}_kaleci`
                )
                .setLabel("🧤 Kaleci")
                .setStyle(
                  ButtonStyle.Primary
                ),

              new ButtonBuilder()
                .setCustomId(
                  `reg_${target.id}_uye`
                )
                .setLabel("👤 Üye")
                .setStyle(
                  ButtonStyle.Secondary
                ),

              new ButtonBuilder()
                .setCustomId(
                  `reg_${target.id}_futbolcu`
                )
                .setLabel("⚽ Futbolcu")
                .setStyle(
                  ButtonStyle.Success
                ),

              new ButtonBuilder()
                .setCustomId(
                  `reg_${target.id}_td`
                )
                .setLabel("📋 Teknik Direktör")
                .setStyle(
                  ButtonStyle.Danger
                )
            );

        saveDB();

        return message.channel.send({
          content:
`📝 **KAYIT**

👤 Oyuncu: **${nickname}**

Aşağıdan oyuncunun rolünü seç.`,

          components: [row],

          allowedMentions: {
            parse: []
          }
        });
      }

      // ==================================================
      // KAYITSIZ VER
      // ==================================================

      if (
        command === "kayitsizver"
      ) {

        if (
          !permission(
            message,
            ROLES.KAYIT_YETKILISI,
            "Kayıt Yetkilisi"
          )
        ) {
          return;
        }

        const target =
          getMentionedMember(
            message,
            args[0]
          );

        if (!target) {
          return noTag(
            message,
            "❌ Oyuncuyu etiketlemelisin."
          );
        }

        await target.roles
          .remove([
            ROLES.KALECI,
            ROLES.UYE,
            ROLES.FUTBOLCU,
            ROLES.TEKNIK_DIREKTOR
          ])
          .catch(() => {});

        await target.roles
          .add(ROLES.KAYITSIZ)
          .catch(() => {});

        const p =
          getPlayer(
            message.guild.id,
            target.id
          );

        p.registered = false;

        saveDB();

        return noTag(
          message,
          "✅ Oyuncu Kayıtsız rolüne geçirildi."
        );
      }

      // ==================================================
      // ANTRENMAN
      // SADECE ANTRENMAN KANALI
      // ==================================================

      if (
        command === "ant" ||
        command === "antrenman"
      ) {

        if (
          CHANNELS.ANTRENMAN &&
          message.channel.id !==
            CHANNELS.ANTRENMAN
        ) {

          return noTag(
            message,
            "❌ Antrenman sistemi yalnızca **Antrenman kanalında** kullanılabilir."
          );
        }

        if (
          !isRegistered(
            message.member
          )
        ) {
          return noTag(
            message,
            "❌ Önce kayıt olmalısın."
          );
        }

        const p =
          getPlayer(
            message.guild.id,
            message.author.id
          );

        if (
          p.training >= 5
        ) {
          return noTag(
            message,
            "✅ Antrenman seviyen zaten **5/5**."
          );
        }

        p.training++;

        let result =
`🏋️ **ANTRENMAN**

📈 İlerleme:
**${p.training}/5**`;

        if (
          p.training === 5
        ) {

          p.value += 5;

          result +=
`\n\n🎉 **ANTRENMAN TAMAMLANDI!**

💰 Oyuncu değerine **+5M€** eklendi.
📊 Yeni değer: **${formatMoney(p.value)}**`;

          await updateOnlyValuePart(
            message.member,
            p.value
          );
        }

        saveDB();

        return noTag(
          message,
          result
        );
      }

      // ==================================================
      // PENALTI
      // SADECE PENALTI KANALI
      // ==================================================

      if (
        command === "pen" ||
        command === "penalti"
      ) {

        if (
          CHANNELS.PENALTI &&
          message.channel.id !==
            CHANNELS.PENALTI
        ) {

          return noTag(
            message,
            "❌ Penaltı sistemi yalnızca **Penaltı kanalında** kullanılabilir."
          );
        }

        if (
          !isRegistered(
            message.member
          )
        ) {
          return noTag(
            message,
            "❌ Önce kayıt olmalısın."
          );
        }

        const p =
          getPlayer(
            message.guild.id,
            message.author.id
          );

        const chance =
          Math.random() * 100;

        let result;

        // %30 GOL
        if (
          chance < 30
        ) {

          p.value += 5;

          result =
`⚽ **GOL!**

💰 Oyuncu değerine **+5M€** eklendi.
📊 Yeni değer: **${formatMoney(p.value)}**`;

          await updateOnlyValuePart(
            message.member,
            p.value
          );
        }

        // %30 KALECİ
        else if (
          chance < 60
        ) {

          result =
`🧤 **KALECİ!**

❌ Değer değişmedi.`;
        }

        // %25 DİREK
        else if (
          chance < 85
        ) {

          result =
`🥅 **DİREK!**

❌ Değer değişmedi.`;
        }

        // %15 KORNER
        else {

          result =
`🚩 **KORNER!**

❌ Değer değişmedi.`;
        }

        saveDB();

        return noTag(
          message,
          `🥅 **PENALTI SONUCU**\n\n${result}`
        );
      }

      // ==================================================
      // DEĞER VER / SİL
      // ==================================================

      if (
        command === "dver" ||
        command === "dsil"
      ) {

        if (
          !permission(
            message,
            ROLES.DEGER_YETKILISI,
            "Değer Yetkilisi"
          )
        ) {
          return;
        }

        const target =
          getMentionedMember(
            message,
            args[0]
          );

        const amount =
          parseMoney(
            args[1]
          );

        if (
          !target ||
          !Number.isFinite(amount) ||
          amount <= 0
        ) {

          return noTag(
            message,
`❌ Kullanım:

\`.dver @oyuncu 5M\`
\`.dsil @oyuncu 5M\``
          );
        }

        const p =
          getPlayer(
            message.guild.id,
            target.id
          );

        const oldValue =
          Number(p.value) || 0;

        // ÖNCEKİ DEĞERİN ÜZERİNE EKLE
        if (
          command === "dver"
        ) {

          p.value =
            oldValue + amount;

        } else {

          p.value =
            Math.max(
              0,
              oldValue - amount
            );
        }

        // SADECE M€ KISMI DEĞİŞİR
        await updateOnlyValuePart(
          target,
          p.value
        );

        if (p.team) {
          syncTeamValue(
            message.guild.id,
            p.team
          );
        }

        saveDB();

        return noTag(
          message,
`✅ **DEĞER GÜNCELLENDİ**

👤 **${p.nickname || target.displayName}**

💰 Eski değer: **${formatMoney(oldValue)}**
${command === "dver"
  ? `➕ Eklenen: **${formatMoney(amount)}**`
  : `➖ Çıkarılan: **${formatMoney(amount)}**`}

📊 Yeni değer: **${formatMoney(p.value)}**

📝 Oyuncunun isminde yalnızca **M€ değeri** değiştirildi.`
        );
      }

      // ==================================================
      // BÜTÇE
      // ==================================================

      if (
        command === "butce"
      ) {

        const target =
          args[0]
            ? getMentionedMember(
                message,
                args[0]
              )
            : message.member;

        if (!target) {
          return noTag(
            message,
            "❌ Oyuncu bulunamadı."
          );
        }

        const p =
          getPlayer(
            message.guild.id,
            target.id
          );

        return noTag(
          message,
`💳 **BÜTÇE**

👤 **${target.displayName}**

💰 Bütçe: **${formatMoney(p.budget)}**
📊 Oyuncu Değeri: **${formatMoney(p.value)}**`
        );
      }

      // ==================================================
      // PARA GÖNDER
      // ==================================================

      if (
        command === "gonder"
      ) {

        const target =
          getMentionedMember(
            message,
            args[0]
          );

        const amount =
          parseMoney(
            args[1]
          );

        if (
          !target ||
          target.id ===
            message.author.id ||
          !Number.isFinite(amount) ||
          amount <= 0
        ) {

          return noTag(
            message,
            "❌ Kullanım: `.gönder @oyuncu miktar`"
          );
        }

        const sender =
          getPlayer(
            message.guild.id,
            message.author.id
          );

        const receiver =
          getPlayer(
            message.guild.id,
            target.id
          );

        if (
          sender.budget < amount
        ) {

          return noTag(
            message,
            "❌ Yeterli bütçen yok."
          );
        }

        sender.budget -= amount;
        receiver.budget += amount;

        saveDB();

        return noTag(
          message,
          `✅ **${formatMoney(amount)}** başarıyla gönderildi.`
        );
      }

      // ==================================================
      // BÜTÇE EKLE / SİL
      // ==================================================

      if (
        command === "butceekle" ||
        command === "butcesil"
      ) {

        if (
          !permission(
            message,
            ROLES.DEGER_YETKILISI,
            "Değer Yetkilisi"
          )
        ) {
          return;
        }

        const target =
          getMentionedMember(
            message,
            args[0]
          );

        const amount =
          parseMoney(
            args[1]
          );

        if (
          !target ||
          !Number.isFinite(amount) ||
          amount <= 0
        ) {

          return noTag(
            message,
            "❌ Geçerli oyuncu ve miktar gir."
          );
        }

        const p =
          getPlayer(
            message.guild.id,
            target.id
          );

        if (
          command === "butceekle"
        ) {

          p.budget += amount;

        } else {

          p.budget =
            Math.max(
              0,
              p.budget - amount
            );
        }

        saveDB();

        return noTag(
          message,
          `✅ Yeni bütçe: **${formatMoney(p.budget)}**`
        );
      }

      // ==================================================
      // KADRO EKLE
      // ==================================================

      if (
        command === "kadroekle"
      ) {

        if (
          !teamPermission(message)
        ) {
          return;
        }

        const team =
          getTeamFromToken(
            args[0]
          );

        const target =
          getMentionedMember(
            message,
            args[1]
          );

        const position =
          args
            .slice(2)
            .join(" ");

        if (
          !team ||
          !target ||
          !position
        ) {

          return noTag(
            message,
`❌ Kullanım:

\`.kadroekle @takım @oyuncu Pozisyon\``
          );
        }

        const p =
          getPlayer(
            message.guild.id,
            target.id
          );

        if (
          !p.registered
        ) {

          return noTag(
            message,
            "❌ Oyuncu kayıtlı değil."
          );
        }

        if (
          p.team
        ) {

          return noTag(
            message,
            "❌ Oyuncu zaten bir takımda."
          );
        }

        const teamData =
          getTeam(
            message.guild.id,
            team
          );

        if (
          teamData.players.some(
            x =>
              x.userId ===
              target.id
          )
        ) {

          return noTag(
            message,
            "❌ Oyuncu zaten kadroda."
          );
        }

        teamData.players.push({
          userId: target.id,
          name:
            p.nickname ||
            target.displayName,
          position,
          value: p.value
        });

        p.team = team;

        syncTeamValue(
          message.guild.id,
          team
        );

        saveDB();

        return noTag(
          message,
`✅ **KADROYA EKLENDİ**

👤 ${p.nickname || target.displayName}
🏟️ ${team}
📍 ${position}
💰 Takım değeri: **${formatMoney(teamData.value)}**`
        );
      }

      // ==================================================
      // KADRO SİL
      // ==================================================

      if (
        command === "kadrosil"
      ) {

        if (
          !teamPermission(message)
        ) {
          return;
        }

        const team =
          getTeamFromToken(
            args[0]
          );

        const target =
          getMentionedMember(
            message,
            args[1]
          );

        if (
          !team ||
          !target
        ) {

          return noTag(
            message,
            "❌ Kullanım: `.kadrosil @takım @oyuncu`"
          );
        }

        const teamData =
          getTeam(
            message.guild.id,
            team
          );

        const found =
          teamData.players.find(
            x =>
              x.userId ===
              target.id
          );

        if (!found) {

          return noTag(
            message,
            "❌ Oyuncu bu kadroda değil."
          );
        }

        teamData.players =
          teamData.players.filter(
            x =>
              x.userId !==
              target.id
          );

        const p =
          getPlayer(
            message.guild.id,
            target.id
          );

        p.team = null;

        syncTeamValue(
          message.guild.id,
          team
        );

        saveDB();

        return noTag(
          message,
          `✅ Oyuncu **${team}** kadrosundan çıkarıldı.`
        );
      }

      // ==================================================
      // KADRO GÖR
      // ==================================================

      if (
        command === "kadro"
      ) {

        const team =
          getTeamFromToken(
            args[0]
          );

        if (!team) {

          return noTag(
            message,
            "❌ Takım rolünü etiketlemelisin."
          );
        }

        const data =
          getTeam(
            message.guild.id,
            team
          );

        syncTeamValue(
          message.guild.id,
          team
        );

        const list =
          data.players.map(
            (x, i) =>
`${i + 1}. **${x.name}** — ${x.position} — ${formatMoney(
  getPlayer(
    message.guild.id,
    x.userId
  ).value
)}`
          );

        return noTag(
          message,
`👥 **${team} KADROSU**

${list.length
  ? list.join("\n")
  : "Henüz oyuncu yok."}

📈 **Takım Değeri:** ${formatMoney(data.value)}`
        );
      }

      // ==================================================
      // KAP
      // ==================================================

      if (
        command === "kap"
      ) {

        if (
          !teamPermission(message)
        ) {
          return;
        }

        const target =
          getMentionedMember(
            message,
            args[0]
          );

        const team =
          getTeamFromToken(
            args[1]
          );

        const salary =
          parseMoney(
            args[2]
          );

        const seasons =
          Number(args[3]);

        if (
          !target ||
          !team ||
          !Number.isFinite(salary) ||
          salary <= 0 ||
          !Number.isInteger(seasons) ||
          seasons < 1 ||
          seasons > 10
        ) {

          return noTag(
            message,
`❌ Kullanım:

\`.kap @oyuncu @takım maaş sezon\`

Örnek:

\`.kap @Oyuncu @Barcelona 5 3\`

📅 En fazla **10 sezon**.`
          );
        }

        // TAKIM ROLÜ OLAN KİŞİ SADECE KENDİ TAKIMINA
        const callerTeam =
          getMemberTeam(
            message.member
          );

        if (
          !isOwner(message.member) &&
          !hasRole(
            message.member,
            ROLES.TEKNIK_DIREKTOR
          ) &&
          callerTeam &&
          callerTeam !== team
        ) {

          return noTag(
            message,
            `❌ Sen yalnızca **${callerTeam}** için transfer teklifi oluşturabilirsin.`
          );
        }

        if (
          !target.roles.cache.has(
            ROLES.FUTBOLCU
          )
        ) {

          return noTag(
            message,
            "❌ Transfer yapılacak kişide ⚽ Futbolcu rolü bulunmalı."
          );
        }

        const p =
          getPlayer(
            message.guild.id,
            target.id
          );

        if (
          p.team ||
          getMemberTeam(target)
        ) {

          return noTag(
            message,
            "❌ Oyuncunun zaten bir takımı var."
          );
        }

        const id =
          `${target.id}_${Date.now()}`;

        db.transfers[
          message.guild.id
        ][id] = {
          targetId:
            target.id,
          teamName:
            team,
          salary,
          seasons,
          offeredBy:
            message.author.id
        };

        saveDB();

        const row =
          new ActionRowBuilder()
            .addComponents(

              new ButtonBuilder()
                .setCustomId(
                  `transfer_accept_${id}`
                )
                .setLabel(
                  "✅ Kabul Et"
                )
                .setStyle(
                  ButtonStyle.Success
                ),

              new ButtonBuilder()
                .setCustomId(
                  `transfer_reject_${id}`
                )
                .setLabel(
                  "❌ Reddet"
                )
                .setStyle(
                  ButtonStyle.Danger
                )
            );

        return message.channel.send({
          content:
`💼 **TRANSFER TEKLİFİ**

👤 Oyuncu: <@${target.id}>
🏟️ Takım: **${team}**

💰 Sezon Başı Maaşı:
**${formatMoney(salary)}**

📅 Sözleşme:
**${seasons} Sezon**

💵 Toplam Maaş:
**${formatMoney(
  salary * seasons
)}**

Oyuncu aşağıdaki butonlardan seçim yapabilir.`,

          components: [row],

          allowedMentions: {
            users: [target.id]
          }
        });
      }

      // ==================================================
      // MAÇ
      // ==================================================

      if (
        command === "mac"
      ) {

        if (
          !(
            isOwner(message.member) ||
            hasRole(
              message.member,
              ROLES.SPIKER
            )
          )
        ) {

          return noTag(
            message,
            "❌ Maçı yalnızca Spiker veya bot sahibi başlatabilir."
          );
        }

        const team1 =
          getTeamFromToken(
            args[0]
          );

        const team2 =
          getTeamFromToken(
            args[1]
          );

        if (
          !team1 ||
          !team2
        ) {

          return noTag(
            message,
            "❌ İki takım rolünü etiketlemelisin."
          );
        }

        if (
          team1 === team2
        ) {

          return noTag(
            message,
            "❌ Aynı takım kendisiyle oynayamaz."
          );
        }

        return runMatch(
          message.channel,
          message.guild.id,
          team1,
          team2
        );
      }

      // ==================================================
      // FİKSTÜR EKLE
      // ==================================================

      if (
        command === "fiksturekle"
      ) {

        if (
          !(
            isOwner(message.member) ||
            hasRole(
              message.member,
              ROLES.SPIKER
            )
          )
        ) {

          return noTag(
            message,
            "❌ Fikstür ekleme yetkin yok."
          );
        }

        const team1 =
          getTeamFromToken(
            args[0]
          );

        const team2 =
          getTeamFromToken(
            args[1]
          );

        const date =
          args[2];

        const time =
          args[3];

        if (
          !team1 ||
          !team2 ||
          !date ||
          !time
        ) {

          return noTag(
            message,
`❌ Kullanım:

\`.fiksturekle @takım1 @takım2 YYYY-AA-GG SS:DD\``
          );
        }

        const timestamp =
          new Date(
            `${date}T${time}:00`
          ).getTime();

        if (
          !Number.isFinite(timestamp)
        ) {

          return noTag(
            message,
            "❌ Tarih veya saat hatalı."
          );
        }

        const fixture = {
          id:
            `${Date.now()}_${Math.random()}`,
          team1,
          team2,
          timestamp,
          status:
            "scheduled",
          score1: null,
          score2: null,
          winner: null
        };

        db.fixtures[
          message.guild.id
        ].push(fixture);

        saveDB();

        const channel =
          await client.channels
            .fetch(CHANNELS.FIKSTUR)
            .catch(() => null);

        if (
          channel &&
          channel.isTextBased()
        ) {

          await channel.send({
            embeds: [
              new EmbedBuilder()
                .setTitle(
                  "📅 FİKSTÜR"
                )
                .setDescription(
`🏟️ **${team1}**
⚔️
**${team2}**

📅 **${date}**
🕐 **${time}**

⏳ Maç bekleniyor...`
                )
            ]
          }).catch(() => {});
        }

        return noTag(
          message,
          "✅ Fikstür başarıyla eklendi."
        );
      }

      // ==================================================
      // PUAN
      // ==================================================

      if (
        command === "puan"
      ) {

        return noTag(
          message,
`🏆 **PUAN DURUMU**

${standingsText(
  message.guild.id
)}`
        );
      }

      // ==================================================
      // DM
      // ==================================================

      if (
        command === "dm"
      ) {

        if (
          !isAdmin(
            message.member
          )
        ) {

          return noTag(
            message,
            "❌ Bu komut için Bot Sahibi veya Administrator gerekir."
          );
        }

        const target =
          args.shift();

        const text =
          args.join(" ");

        if (!text) {

          return noTag(
            message,
            "❌ Mesaj yazmalısın."
          );
        }

        // ------------------------------
        // DM ALL
        // ------------------------------

        if (
          normalize(target) ===
          "all"
        ) {

          const members =
            await message.guild.members
              .fetch()
              .catch(() => null);

          if (!members) {

            return noTag(
              message,
              "❌ Üyeler alınamadı."
            );
          }

          let success = 0;
          let failed = 0;

          for (
            const member
            of members.values()
          ) {

            if (
              member.user.bot
            ) {
              continue;
            }

            try {

              await member.send(
                text
              );

              success++;

            } catch {

              failed++;
            }

            // Discord rate-limit riskini azaltır
            await new Promise(
              resolve =>
                setTimeout(
                  resolve,
                  700
                )
            );
          }

          return noTag(
            message,
`📩 **DM ALL TAMAMLANDI**

✅ Başarılı: **${success}**
❌ Başarısız: **${failed}**`
          );
        }

        // ------------------------------
        // TEK OYUNCU
        // ------------------------------

        const member =
          getMentionedMember(
            message,
            target
          );

        if (!member) {

          return noTag(
            message,
            "❌ Kullanım: `.dm @oyuncu mesaj`"
          );
        }

        try {

          await member.send(
            text
          );

          return noTag(
            message,
            "✅ DM gönderildi."
          );

        } catch {

          return noTag(
            message,
            "❌ DM gönderilemedi."
          );
        }
      }

    } catch (error) {

      console.error(
        "Komut hatası:",
        error
      );

      return noTag(
        message,
        "❌ İşlem sırasında bir hata oluştu."
      ).catch(() => {});
    }
  }
);

// ======================================================
// YENİ ÜYE
// ======================================================

client.on(
  "guildMemberAdd",
  async member => {

    if (
      member.user.bot
    ) {
      return;
    }

    await member.roles
      .add(
        ROLES.KAYITSIZ
      )
      .catch(() => {});

    const channel =
      await client.channels
        .fetch(CHANNELS.KAYIT)
        .catch(() => null);

    if (
      channel &&
      channel.isTextBased()
    ) {

      await channel.send({
        content:
`👋 **YENİ OYUNCU**

Yeni üye sunucuya katıldı.

📋 Kayıt için
<@&${ROLES.KAYIT_YETKILISI}>
bekleniyor.`,

        allowedMentions: {
          roles: [
            ROLES.KAYIT_YETKILISI
          ]
        }
      }).catch(() => {});
    }
  }
);

// ======================================================
// BUTONLAR
// ======================================================

client.on(
  "interactionCreate",
  async interaction => {

    try {

      if (
        !interaction.isButton() ||
        !interaction.guild
      ) {
        return;
      }

      // =================================================
      // KAYIT BUTONLARI
      // =================================================

      if (
        interaction.customId
          .startsWith("reg_")
      ) {

        if (
          !(
            isOwner(
              interaction.member
            ) ||
            hasRole(
              interaction.member,
              ROLES.KAYIT_YETKILISI
            )
          )
        ) {

          return interaction.reply({
            content:
              "❌ Bu butonları yalnızca Kayıt Yetkilisi kullanabilir.",
            ephemeral: true
          });
        }

        const parts =
          interaction.customId
            .split("_");

        const userId =
          parts[1];

        const type =
          parts[2];

        const target =
          interaction.guild.members.cache.get(
            userId
          );

        if (!target) {

          return interaction.reply({
            content:
              "❌ Oyuncu bulunamadı.",
            ephemeral: true
          });
        }

        await target.roles
          .remove([
            ROLES.KALECI,
            ROLES.UYE,
            ROLES.FUTBOLCU,
            ROLES.TEKNIK_DIREKTOR,
            ROLES.KAYITSIZ
          ])
          .catch(() => {});

        const roleMap = {
          kaleci:
            ROLES.KALECI,

          uye:
            ROLES.UYE,

          futbolcu:
            ROLES.FUTBOLCU,

          td:
            ROLES.TEKNIK_DIREKTOR
        };

        await target.roles
          .add(
            roleMap[type]
          )
          .catch(() => {});

        const p =
          getPlayer(
            interaction.guild.id,
            userId
          );

        p.registered = true;

        p.position =
          type === "kaleci"
            ? "Kaleci"
            : type === "uye"
              ? "Üye"
              : type === "futbolcu"
                ? "Futbolcu"
                : "Teknik Direktör";

        saveDB();

        await interaction.update({
          content:
`✅ **KAYIT TAMAMLANDI**

👤 Oyuncu:
**${p.nickname || target.displayName}**

🎭 Rol:
**${p.position}**`,

          components: []
        });

        const chat =
          await interaction.guild.channels
            .fetch(CHANNELS.SOHBET)
            .catch(() => null);

        if (
          chat &&
          chat.isTextBased()
        ) {

          await chat.send({
            content:
`🎉 **Hoş geldin!**

${target.displayName}, kayıt işlemin tamamlandı.`,

            allowedMentions: {
              parse: []
            }
          }).catch(() => {});
        }

        return;
      }

      // =================================================
      // TRANSFER BUTONLARI
      // =================================================

      if (
        interaction.customId
          .startsWith("transfer_")
      ) {

        const parts =
          interaction.customId
            .split("_");

        const action =
          parts[1];

        const transferId =
          parts
            .slice(2)
            .join("_");

        const transfers =
          db.transfers[
            interaction.guild.id
          ] || {};

        const transfer =
          transfers[
            transferId
          ];

        if (!transfer) {

          return interaction.reply({
            content:
              "❌ Bu transfer teklifi artık geçerli değil.",
            ephemeral: true
          });
        }

        if (
          interaction.user.id !==
          transfer.targetId
        ) {

          return interaction.reply({
            content:
              "❌ Bu butonları yalnızca teklif yapılan oyuncu kullanabilir.",
            ephemeral: true
          });
        }

        const target =
          interaction.guild.members.cache.get(
            transfer.targetId
          );

        if (!target) {

          return interaction.reply({
            content:
              "❌ Oyuncu bulunamadı.",
            ephemeral: true
          });
        }

        // -----------------------------------------------
        // KABUL
        // -----------------------------------------------

        if (
          action === "accept"
        ) {

          const p =
            getPlayer(
              interaction.guild.id,
              transfer.targetId
            );

          if (
            p.team ||
            getMemberTeam(target)
          ) {

            return interaction.reply({
              content:
                "❌ Oyuncunun zaten bir takımı var.",
              ephemeral: true
            });
          }

          const teamRole =
            interaction.guild.roles.cache.get(
              TEAMS[
                transfer.teamName
              ]
            );

          if (!teamRole) {

            return interaction.reply({
              content:
                "❌ Takım rolü bu sunucuda bulunamadı.",
              ephemeral: true
            });
          }

          try {

            await target.roles.add(
              teamRole
            );

          } catch {

            return interaction.reply({
              content:
                "❌ Takım rolü verilemedi. Botun rolü yeterince yukarıda olmayabilir.",
              ephemeral: true
            });
          }

          p.team =
            transfer.teamName;

          p.salary =
            transfer.salary;

          p.seasons =
            transfer.seasons;

          delete transfers[
            transferId
          ];

          saveDB();

          return interaction.update({
            content:
`✅ **TRANSFER KABUL EDİLDİ**

👤 **${p.nickname || target.displayName}**

🏟️ **${transfer.teamName}**

💰 Sezon başı maaşı:
**${formatMoney(transfer.salary)}**

📅 Sözleşme:
**${transfer.seasons} Sezon**

💵 Toplam:
**${formatMoney(
  transfer.salary *
  transfer.seasons
)}**

🏷️ Takım rolü verildi.`,

            components: []
          });
        }

        // -----------------------------------------------
        // RED
        // -----------------------------------------------

        if (
          action === "reject"
        ) {

          delete transfers[
            transferId
          ];

          saveDB();

          return interaction.update({
            content:
`❌ **TRANSFER REDDEDİLDİ**

Oyuncu transfer teklifini reddetti.`,

            components: []
          });
        }
      }

    } catch (error) {

      console.error(
        "Interaction hatası:",
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

// ======================================================
// HAZIR
// ======================================================

client.once(
  "ready",
  async () => {

    console.log(
      "================================"
    );

    console.log(
      `🤖 Bot: ${client.user.tag}`
    );

    console.log(
      `👑 Sahip: ${OWNER_ID}`
    );

    console.log(
      `🌐 Sunucu: ${client.guilds.cache.size}`
    );

    console.log(
      "🟢 Tüm sistemler aktif."
    );

    console.log(
      "================================"
    );

    initializePoints(
      client.guilds.cache.first()?.id
    );

    await sendStatus();

    // Fikstür kontrolü
    setInterval(
      checkFixtures,
      1000
    );

    // Bot durum mesajı
    setInterval(
      sendStatus,
      30 * 60 * 1000
    );
  }
);

// ======================================================
// HATA YAKALAMA
// ======================================================

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

// ======================================================
// TOKEN
// ======================================================

if (!TOKEN) {

  console.error(
    "❌ TOKEN bulunamadı!"
  );

  console.error(
    "Railway > Variables bölümüne TOKEN ekle."
  );

  process.exit(1);
}

// ======================================================
// BOTU BAŞLAT
// ======================================================

client.login(TOKEN)
  .then(() => {
    console.log(
      "✅ Discord'a başarıyla giriş yapıldı."
    );
  })
  .catch(error => {

    console.error(
      "❌ Discord giriş hatası:",
      error
    );

    process.exit(1);
  });
