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

// =====================================================
// AYARLAR
// =====================================================

const TOKEN = process.env.TOKEN;
const PREFIX = ".";

const OWNER_ID = "1280275560739897409";

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

const CHANNELS = {
  KAYIT: "1534460177884123276",
  SOHBET: "1534469475917758586",
  MAC: "1534477626872168541",
  FIKSTUR: "1534475908566483075",
  PUAN: "1534475991404253284",
  BOT_DURUM: "1545921149018570842"
};

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

// =====================================================
// VERİTABANI
// =====================================================

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "database.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
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
  } catch (err) {
    console.error("Veritabanı okunamadı:", err);
  }
}

function saveDB() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(db, null, 2),
      "utf8"
    );
  } catch (err) {
    console.error("Veritabanı kaydedilemedi:", err);
  }
}

loadDB();

// =====================================================
// VERİ YAPILARI
// =====================================================

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

// =====================================================
// YARDIMCI
// =====================================================

function money(number) {
  number = Number(number) || 0;
  return `${Math.max(0, number).toFixed(0)}M€`;
}

function parseMoney(value) {
  if (!value) return NaN;

  return Number(
    String(value)
      .replace(/M/gi, "")
      .replace(/€/g, "")
      .replace(/,/g, ".")
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

function noTagReply(message, content) {
  return message.reply({
    content,
    allowedMentions: {
      repliedUser: false,
      users: [],
      roles: []
    }
  });
}

function getMentionedMember(message, text) {
  if (!text) return null;

  const id = text.replace(/[<@!>]/g, "");

  return message.guild.members.cache.get(id) || null;
}

function getTeamFromMention(text) {
  if (!text) return null;

  const id = text.replace(/[<@&>]/g, "");

  for (const [name, roleId] of Object.entries(TEAMS)) {
    if (roleId === id) {
      return name;
    }
  }

  return null;
}

function getMemberTeam(member) {
  for (const [teamName, roleId] of Object.entries(TEAMS)) {
    if (member.roles.cache.has(roleId)) {
      return teamName;
    }
  }

  return null;
}

function registered(member) {
  return (
    member &&
    !member.roles.cache.has(ROLES.KAYITSIZ)
  );
}

function teamValue(guildId, teamName) {
  const team = getTeam(guildId, teamName);

  return team.players.reduce(
    (total, player) =>
      total + (Number(player.value) || 0),
    0
  );
}

function syncTeamValue(guildId, teamName) {
  const team = getTeam(guildId, teamName);

  team.value = teamValue(
    guildId,
    teamName
  );
}

function permission(message, roleId, roleName) {
  if (
    isOwner(message.member) ||
    hasRole(message.member, roleId)
  ) {
    return true;
  }

  noTagReply(
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

  noTagReply(
    message,
    "❌ Bu komutu yalnızca Teknik Direktör, takım rolüne sahip kişi veya bot sahibi kullanabilir."
  );

  return false;
}

// =====================================================
// CLIENT
// =====================================================

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

// =====================================================
// BOT ÇALIŞMA SÜRESİ
// =====================================================

const startedAt = Date.now();

function uptimeText() {
  const diff = Date.now() - startedAt;

  const hours = Math.floor(
    diff / 3600000
  );

  const minutes = Math.floor(
    (diff % 3600000) / 60000
  );

  return `${hours} saat ${minutes} dakika`;
}

// =====================================================
// BOT DURUM
// =====================================================

async function sendBotStatus() {
  const channel =
    await client.channels
      .fetch(CHANNELS.BOT_DURUM)
      .catch(() => null);

  if (!channel || !channel.isTextBased()) {
    return;
  }

  await channel.send({
    content:
`🤖 **BOT DURUMU**

🟢 **Tüm sistemler sorunsuz çalışıyor.**

⏱️ **Çalışma Süresi:** ${uptimeText()}

🕐 **Son Kontrol:** ${new Date().toLocaleTimeString("tr-TR")}`,
    allowedMentions: {
      parse: []
    }
  }).catch(() => {});
}

// =====================================================
// PUAN SİSTEMİ
// =====================================================

function initializePoints(guildId) {
  ensureGuild(guildId);

  for (const team of Object.keys(TEAMS)) {
    if (!db.guilds[guildId].points[team]) {
      db.guilds[guildId].points[team] = {
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
  teamName,
  goalsFor,
  goalsAgainst
) {
  initializePoints(guildId);

  const data =
    db.guilds[guildId].points[teamName];

  data.played++;

  data.goalsFor += goalsFor;
  data.goalsAgainst += goalsAgainst;

  if (goalsFor > goalsAgainst) {
    data.points += 3;
    data.wins++;
  }

  else if (goalsFor === goalsAgainst) {
    data.points += 1;
    data.draws++;
  }

  else {
    data.losses++;
  }
}

function getStandings(guildId) {
  initializePoints(guildId);

  return Object.entries(
    db.guilds[guildId].points
  )
    .map(([team, data]) => ({
      team,
      ...data,
      average:
        data.goalsFor -
        data.goalsAgainst
    }))
    .sort((a, b) => {
      if (b.points !== a.points) {
        return b.points - a.points;
      }

      return b.average - a.average;
    });
}

function standingsText(guildId) {
  const standings =
    getStandings(guildId);

  return standings
    .map(
      (team, index) =>
`${index + 1}. **${team.team}**
🏆 ${team.points} Puan | ⚽ ${team.goalsFor}-${team.goalsAgainst} | 🟢 ${team.wins}G | 🟡 ${team.draws}B | 🔴 ${team.losses}M`
    )
    .join("\n\n");
}

// =====================================================
// KADRO
// =====================================================

function buildLineup(guildId, teamName) {
  const team =
    getTeam(guildId, teamName);

  const realPlayers =
    team.players.slice(0, 11);

  const lineup = [...realPlayers];

  while (lineup.length < 11) {
    lineup.push({
      userId: null,
      name: `NPC ${lineup.length + 1}`,
      position: "NPC",
      value: 0,
      npc: true
    });
  }

  return lineup;
}

// =====================================================
// MAÇ SİSTEMİ
// =====================================================

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
    buildLineup(guildId, team1);

  const lineup2 =
    buildLineup(guildId, team2);

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

  for (let minute = 1; minute <= 90; minute++) {

    await new Promise(
      resolve => setTimeout(resolve, 3000)
    );

    const random =
      Math.random() * 100;

    if (random < 5) {

      const teamOne =
        Math.random() < 0.5;

      const lineup =
        teamOne ? lineup1 : lineup2;

      const player =
        lineup[
          Math.floor(
            Math.random() * lineup.length
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

⚽ **GOOOOOL!**

👤 **${player.name}**
topu ağlarla buluşturuyor!

📊 **${team1} ${score1} - ${score2} ${team2}**`,
        allowedMentions: {
          parse: []
        }
      });
    }

    else if (random < 9) {

      const teamOne =
        Math.random() < 0.5;

      const lineup =
        teamOne ? lineup1 : lineup2;

      const player =
        lineup[
          Math.floor(
            Math.random() * lineup.length
          )
        ];

      await channel.send({
        content:
`🎙️ **${minute}'**

🧤 **${player.name}** kaleyi yokladı fakat kaleci gole izin vermedi!`,
        allowedMentions: {
          parse: []
        }
      });
    }

    else if (random < 11) {

      const teamOne =
        Math.random() < 0.5;

      const lineup =
        teamOne ? lineup1 : lineup2;

      const player =
        lineup[
          Math.floor(
            Math.random() * lineup.length
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

  // PUANLAR
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

  // FİKSTÜRÜ GÜNCELLE
  if (fixture) {
    fixture.status = "finished";
    fixture.score1 = score1;
    fixture.score2 = score2;

    fixture.winner =
      score1 > score2
        ? team1
        : score2 > score1
          ? team2
          : "Beraberlik";
  }

  db.matches[guildId].push({
    team1,
    team2,
    score1,
    score2,
    date: Date.now()
  });

  saveDB();

  const winner =
    score1 > score2
      ? team1
      : score2 > score1
        ? team2
        : "Beraberlik";

  await channel.send({
    content:
`🏁 **MAÇ SONA ERDİ**

🏟️ **${team1} ${score1} - ${score2} ${team2}**

🏆 **Kazanan:** ${winner}

📊 Puanlar otomatik güncellendi.`,
    allowedMentions: {
      parse: []
    }
  });

  // FİKSTÜR KANALI
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
          .setTitle("🏁 MAÇ SONUCU")
          .setDescription(
`🏟️ **${team1} ${score1} - ${score2} ${team2}**

🏆 **Kazanan:** ${winner}`
          )
      ],

      allowedMentions: {
        parse: []
      }
    });
  }

  // PUAN KANALI
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
          .setTitle("🏆 GÜNCEL PUAN DURUMU")
          .setDescription(
            standingsText(guildId)
          )
      ],

      allowedMentions: {
        parse: []
      }
    });
  }
}

// =====================================================
// FİKSTÜR OTOMATİK BAŞLATMA
// =====================================================

async function checkFixtures() {

  for (const guildId of Object.keys(db.fixtures)) {

    const fixtures =
      db.fixtures[guildId];

    for (const fixture of fixtures) {

      if (
        fixture.status === "scheduled" &&
        Date.now() >= fixture.timestamp
      ) {

        fixture.status = "live";

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

// =====================================================
// KAYIT SİSTEMİ
// =====================================================

async function registerPlayer(
  message,
  target,
  nickname
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

  if (!target) {
    return noTagReply(
      message,
      "❌ Oyuncuyu etiketlemelisin."
    );
  }

  if (!nickname) {
    return noTagReply(
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

  if (!p.value) {
    p.value = 0;
  }

  if (!p.budget) {
    p.budget = 0;
  }

  await target
    .setNickname(nickname)
    .catch(() => {});

  await target.roles
    .remove([
      ROLES.KAYITSIZ
    ])
    .catch(() => {});

  const row =
    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(
            `register_${target.id}_kaleci`
          )
          .setLabel("🧤 Kaleci")
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId(
            `register_${target.id}_uye`
          )
          .setLabel("👤 Üye")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId(
            `register_${target.id}_futbolcu`
          )
          .setLabel("⚽ Futbolcu")
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId(
            `register_${target.id}_td`
          )
          .setLabel("📋 Teknik Direktör")
          .setStyle(ButtonStyle.Danger)
      );

  await noTagReply(
    message,
    `📝 **${nickname}** için kayıt oluşturuldu. Rolü aşağıdaki butonlardan seç.`
  );

  await message.channel.send({
    content:
      `👤 Kayıt yapılacak oyuncu: **${nickname}**\n\n📋 Rolü Kayıt Yetkilisi seçmelidir.`,

    components: [row],

    allowedMentions: {
      parse: []
    }
  });

  saveDB();
}

// =====================================================
// MESAJ SİSTEMLERİ
// =====================================================

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
        !message.content.startsWith(PREFIX)
      ) {
        return;
      }

      const content =
        message.content
          .slice(PREFIX.length)
          .trim();

      const args =
        content.split(/\s+/);

      const command =
        args.shift().toLowerCase();

      // =================================================
      // YARDIM
      // =================================================

      if (
        command === "yardım" ||
        command === "yardim"
      ) {

        return noTagReply(
          message,
`📚 **BOT KOMUTLARI**

⚽ \`.ant\`
⚽ \`.antrenman\`

🥅 \`.pen\`
🥅 \`.penaltı\`

👤 \`.k @oyuncu TakmaAdı\`
🔎 \`.ara oyuncu isim\`
🚫 \`.kayıtsızver @oyuncu\`

💰 \`.dver @oyuncu miktar\`
💰 \`.dsil @oyuncu miktar\`

💳 \`.bütçe\`
💸 \`.gönder @oyuncu miktar\`
➕ \`.bütçeekle @oyuncu miktar\`
➖ \`.bütçesil @oyuncu miktar\`

💼 \`.kap @oyuncu @takım maaş sezon\`

👥 \`.kadroekle @takım @oyuncu pozisyon\`
🗑️ \`.kadrosil @takım @oyuncu\`
📋 \`.kadro @takım\`

🏟️ \`.maç @takım1 @takım2\`

📅 \`.fiksturekle @takım1 @takım2 YYYY-AA-GG SS:DD\`

🏆 \`.puan\`

📩 \`.dm all mesaj\`
📩 \`.dm @oyuncu mesaj\``
        );
      }

      // =================================================
      // KAYIT
      // =================================================

      if (command === "k") {

        const target =
          getMentionedMember(
            message,
            args[0]
          );

        const nickname =
          args.slice(1).join(" ");

        return registerPlayer(
          message,
          target,
          nickname
        );
      }

      // =================================================
      // KAYITSIZ
      // =================================================

      if (
        command === "kayıtsızver" ||
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
          return noTagReply(
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

        return noTagReply(
          message,
          "✅ Oyuncu Kayıtsız rolüne geçirildi. Kayıt verileri silinmedi."
        );
      }

      // =================================================
      // OYUNCU ARAMA
      // =================================================

      if (
        command === "ara" &&
        args[0]?.toLowerCase() === "oyuncu"
      ) {

        const query =
          args.slice(1)
            .join(" ")
            .toLowerCase();

        if (!query) {
          return noTagReply(
            message,
            "❌ Arama ismi yazmalısın."
          );
        }

        const results = [];

        const players =
          db.players[
            message.guild.id
          ] || {};

        for (
          const [userId, p]
          of Object.entries(players)
        ) {

          if (!p.registered) {
            continue;
          }

          const member =
            message.guild.members.cache.get(
              userId
            );

          if (!member) {
            continue;
          }

          if (
            member.roles.cache.has(
              ROLES.KAYITSIZ
            )
          ) {
            continue;
          }

          const search =
            `${p.nickname} ${member.user.username} ${member.displayName}`
              .toLowerCase();

          if (
            search.includes(query)
          ) {

            results.push(
              `• **${p.nickname || member.displayName}** — ${money(p.value)}`
            );
          }
        }

        if (!results.length) {
          return noTagReply(
            message,
            "❌ Oyuncu bulunamadı."
          );
        }

        return noTagReply(
          message,
          `🔎 **Oyuncu Arama Sonuçları**\n\n${results.slice(0, 20).join("\n")}`
        );
      }

      // =================================================
      // ANTRENMAN
      // =================================================

      if (
        command === "ant" ||
        command === "antrenman"
      ) {

        if (
          !registered(message.member)
        ) {
          return noTagReply(
            message,
            "❌ Önce kayıt olmalısın."
          );
        }

        const p =
          getPlayer(
            message.guild.id,
            message.author.id
          );

        if (p.training >= 5) {
          return noTagReply(
            message,
            "✅ Antrenmanı zaten 5/5 tamamladın."
          );
        }

        p.training++;

        let response =
          `🏋️ **ANTRENMAN**\n\n📈 İlerleme: **${p.training}/5**`;

        if (p.training === 5) {

          p.value += 5;

          response +=
`\n\n🎉 **ANTRENMAN TAMAMLANDI!**

💰 Oyuncu değerine **+5M€** eklendi.
📊 Yeni değer: **${money(p.value)}**`;
        }

        saveDB();

        return noTagReply(
          message,
          response
        );
      }

      // =================================================
      // PENALTI
      // =================================================

      if (
        command === "pen" ||
        command === "penaltı" ||
        command === "penalti"
      ) {

        if (
          !registered(message.member)
        ) {
          return noTagReply(
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

        if (chance < 30) {

          p.value += 5;

          result =
`⚽ **GOL!**

🎉 Oyuncu değerine **+5M€** eklendi.
📊 Yeni değer: **${money(p.value)}**`;
        }

        else if (chance < 60) {

          result =
`🧤 **KALECİ!**

❌ Değer değişmedi.`;
        }

        else if (chance < 85) {

          result =
`🥅 **DİREK!**

❌ Değer değişmedi.`;
        }

        else {

          result =
`🚩 **KORNER!**

❌ Değer değişmedi.`;
        }

        saveDB();

        return noTagReply(
          message,
          `🥅 **PENALTI SONUCU**\n\n${result}`
        );
      }

      // =================================================
      // DEĞER
      // =================================================

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
          parseMoney(args[1]);

        if (
          !target ||
          !Number.isFinite(amount) ||
          amount < 0
        ) {
          return noTagReply(
            message,
            "❌ Kullanım: `.dver @oyuncu miktar`"
          );
        }

        const p =
          getPlayer(
            message.guild.id,
            target.id
          );

        if (command === "dver") {
          p.value += amount;
        }

        else {
          p.value =
            Math.max(
              0,
              p.value - amount
            );
        }

        // KADRO DEĞERİNİ DE GÜNCELLE
        if (p.team) {
          const team =
            getTeam(
              message.guild.id,
              p.team
            );

          const player =
            team.players.find(
              x =>
                x.userId === target.id
            );

          if (player) {
            player.value = p.value;
            syncTeamValue(
              message.guild.id,
              p.team
            );
          }
        }

        saveDB();

        return noTagReply(
          message,
          `✅ Oyuncunun yeni değeri: **${money(p.value)}**`
        );
      }

      // =================================================
      // BÜTÇE
      // =================================================

      if (
        command === "bütçe" ||
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
          return noTagReply(
            message,
            "❌ Oyuncu bulunamadı."
          );
        }

        const p =
          getPlayer(
            message.guild.id,
            target.id
          );

        return noTagReply(
          message,
`💳 **KİŞİSEL BÜTÇE**

👤 ${target.displayName}

💰 Bütçe: **${money(p.budget)}**
📈 Oyuncu Değeri: **${money(p.value)}**`
        );
      }

      // =================================================
      // PARA GÖNDER
      // =================================================

      if (
        command === "gönder" ||
        command === "gonder"
      ) {

        const target =
          getMentionedMember(
            message,
            args[0]
          );

        const amount =
          parseMoney(args[1]);

        if (
          !target ||
          target.id === message.author.id ||
          !Number.isFinite(amount) ||
          amount <= 0
        ) {
          return noTagReply(
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
          return noTagReply(
            message,
            "❌ Yeterli bütçen yok."
          );
        }

        sender.budget -= amount;
        receiver.budget += amount;

        saveDB();

        return noTagReply(
          message,
          `✅ **${money(amount)}** başarıyla gönderildi.`
        );
      }

      // =================================================
      // BÜTÇE EKLE / SİL
      // =================================================

      if (
        command === "bütçeekle" ||
        command === "butceekle" ||
        command === "bütçesil" ||
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
          parseMoney(args[1]);

        if (
          !target ||
          !Number.isFinite(amount) ||
          amount < 0
        ) {
          return noTagReply(
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
          command === "bütçesil" ||
          command === "butcesil"
        ) {

          p.budget =
            Math.max(
              0,
              p.budget - amount
            );
        }

        else {

          p.budget += amount;
        }

        saveDB();

        return noTagReply(
          message,
          `✅ Güncel bütçe: **${money(p.budget)}**`
        );
      }

      // =================================================
      // KADRO EKLE
      // =================================================

      if (
        command === "kadroekle"
      ) {

        if (
          !teamPermission(message)
        ) {
          return;
        }

        const teamName =
          getTeamFromMention(
            args[0]
          );

        const target =
          getMentionedMember(
            message,
            args[1]
          );

        const position =
          args.slice(2).join(" ");

        if (
          !teamName ||
          !target ||
          !position
        ) {
          return noTagReply(
            message,
            "❌ Kullanım: `.kadroekle @takım @oyuncu Pozisyon`"
          );
        }

        const p =
          getPlayer(
            message.guild.id,
            target.id
          );

        if (!p.registered) {
          return noTagReply(
            message,
            "❌ Oyuncu kayıtlı değil."
          );
        }

        if (p.team) {
          return noTagReply(
            message,
            "❌ Oyuncu zaten bir takımda."
          );
        }

        const team =
          getTeam(
            message.guild.id,
            teamName
          );

        if (
          team.players.some(
            x =>
              x.userId === target.id
          )
        ) {
          return noTagReply(
            message,
            "❌ Oyuncu zaten kadroda."
          );
        }

        team.players.push({
          userId: target.id,
          name:
            p.nickname ||
            target.displayName,
          position,
          value: p.value
        });

        p.team = teamName;

        syncTeamValue(
          message.guild.id,
          teamName
        );

        saveDB();

        return noTagReply(
          message,
`✅ Oyuncu kadroya eklendi.

👤 **${p.nickname || target.displayName}**
🏟️ **${teamName}**
📍 Pozisyon: **${position}**
💰 Takım Değeri: **${money(team.value)}**`
        );
      }

      // =================================================
      // KADRO SİL
      // =================================================

      if (
        command === "kadrosil"
      ) {

        if (
          !teamPermission(message)
        ) {
          return;
        }

        const teamName =
          getTeamFromMention(
            args[0]
          );

        const target =
          getMentionedMember(
            message,
            args[1]
          );

        if (
          !teamName ||
          !target
        ) {
          return noTagReply(
            message,
            "❌ Kullanım: `.kadrosil @takım @oyuncu`"
          );
        }

        const team =
          getTeam(
            message.guild.id,
            teamName
          );

        const exists =
          team.players.find(
            x =>
              x.userId === target.id
          );

        if (!exists) {
          return noTagReply(
            message,
            "❌ Oyuncu bu takımda değil."
          );
        }

        team.players =
          team.players.filter(
            x =>
              x.userId !== target.id
          );

        const p =
          getPlayer(
            message.guild.id,
            target.id
          );

        p.team = null;
        p.salary = 0;
        p.seasons = 0;

        syncTeamValue(
          message.guild.id,
          teamName
        );

        saveDB();

        return noTagReply(
          message,
          `✅ Oyuncu **${teamName}** kadrosundan çıkarıldı.`
        );
      }

      // =================================================
      // KADRO GÖRÜNTÜLE
      // =================================================

      if (
        command === "kadro"
      ) {

        const teamName =
          getTeamFromMention(
            args[0]
          );

        if (!teamName) {
          return noTagReply(
            message,
            "❌ Takım rolünü etiketlemelisin."
          );
        }

        const team =
          getTeam(
            message.guild.id,
            teamName
          );

        const list =
          team.players.map(
            (player, index) =>
`${index + 1}. **${player.name}** — ${player.position} — ${money(player.value)}`
          );

        return noTagReply(
          message,
`👥 **${teamName} KADROSU**

${list.length ? list.join("\n") : "Henüz oyuncu bulunmuyor."}

📈 **Takım Değeri:** ${money(team.value)}`
        );
      }

      // =================================================
      // TRANSFER / KAP
      // =================================================

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

        const teamName =
          getTeamFromMention(
            args[1]
          );

        const salary =
          parseMoney(args[2]);

        const seasons =
          Number(args[3]);

        if (
          !target ||
          !teamName ||
          !Number.isFinite(salary) ||
          salary <= 0 ||
          !Number.isInteger(seasons) ||
          seasons < 1 ||
          seasons > 10
        ) {
          return noTagReply(
            message,
`❌ Kullanım:

\`.kap @oyuncu @takım maaş sezon\`

Örnek:
\`.kap @Oyuncu @Barcelona 5 3\`

📅 En fazla **10 sezon** olabilir.`
          );
        }

        if (
          !target.roles.cache.has(
            ROLES.FUTBOLCU
          )
        ) {
          return noTagReply(
            message,
            "❌ Transfer yapılacak oyuncuda ⚽ Futbolcu rolü bulunmalı."
          );
        }

        const existingTeam =
          getMemberTeam(target);

        const p =
          getPlayer(
            message.guild.id,
            target.id
          );

        if (
          p.team ||
          existingTeam
        ) {
          return noTagReply(
            message,
            "❌ Bu oyuncunun zaten bir takımı var."
          );
        }

        const transferId =
          `${message.guild.id}_${target.id}_${Date.now()}`;

        db.transfers[
          message.guild.id
        ][transferId] = {
          targetId: target.id,
          teamName,
          salary,
          seasons,
          offeredBy: message.author.id
        };

        saveDB();

        const row =
          new ActionRowBuilder()
            .addComponents(

              new ButtonBuilder()
                .setCustomId(
                  `transfer_accept_${transferId}`
                )
                .setLabel("✅ Kabul Et")
                .setStyle(
                  ButtonStyle.Success
                ),

              new ButtonBuilder()
                .setCustomId(
                  `transfer_reject_${transferId}`
                )
                .setLabel("❌ Reddet")
                .setStyle(
                  ButtonStyle.Danger
                )
            );

        return message.channel.send({
          content:
`💼 **TRANSFER TEKLİFİ**

👤 Oyuncu: <@${target.id}>
🏟️ Takım: **${teamName}**

💰 Sezon Başı Maaşı:
**${money(salary)}**

📅 Sözleşme:
**${seasons} Sezon**

💵 Toplam Maaş:
**${money(salary * seasons)}**

Aşağıdaki butonlardan seçim yapabilirsin.`,

          components: [row],

          allowedMentions: {
            users: [target.id]
          }
        });
      }

      // =================================================
      // MAÇ
      // =================================================

      if (
        command === "maç" ||
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
          return noTagReply(
            message,
            "❌ Bu komutu yalnızca Spiker veya bot sahibi kullanabilir."
          );
        }

        const team1 =
          getTeamFromMention(
            args[0]
          );

        const team2 =
          getTeamFromMention(
            args[1]
          );

        if (
          !team1 ||
          !team2
        ) {
          return noTagReply(
            message,
            "❌ İki takım rolünü etiketlemelisin."
          );
        }

        if (
          team1 === team2
        ) {
          return noTagReply(
            message,
            "❌ Aynı takımla maç yapılamaz."
          );
        }

        return runMatch(
          message.channel,
          message.guild.id,
          team1,
          team2
        );
      }

      // =================================================
      // FİKSTÜR
      // =================================================

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
          return noTagReply(
            message,
            "❌ Fikstür ekleme yetkin yok."
          );
        }

        const team1 =
          getTeamFromMention(
            args[0]
          );

        const team2 =
          getTeamFromMention(
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
          return noTagReply(
            message,
            "❌ Kullanım: `.fiksturekle @takım1 @takım2 YYYY-AA-GG SS:DD`"
          );
        }

        if (
          team1 === team2
        ) {
          return noTagReply(
            message,
            "❌ Aynı takım fikstüre eklenemez."
          );
        }

        const timestamp =
          new Date(
            `${date}T${time}:00`
          ).getTime();

        if (
          !Number.isFinite(timestamp)
        ) {
          return noTagReply(
            message,
            "❌ Tarih veya saat hatalı."
          );
        }

        const fixture = {
          team1,
          team2,
          timestamp,
          status: "scheduled",
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
                .setTitle("📅 FİKSTÜR")
                .setDescription(
`🏟️ **${team1}**
⚔️
**${team2}**

📅 **${date}**
🕐 **${time}**

⏳ Maç bekleniyor...`
                )
            ],

            allowedMentions: {
              parse: []
            }
          });
        }

        return noTagReply(
          message,
          "✅ Fikstür başarıyla eklendi."
        );
      }

      // =================================================
      // PUAN
      // =================================================

      if (
        command === "puan"
      ) {

        return noTagReply(
          message,
`🏆 **PUAN DURUMU**

${standingsText(
  message.guild.id
)}`
        );
      }

      // =================================================
      // DM
      // =================================================

      if (
        command === "dm"
      ) {

        if (
          !isAdmin(message.member)
        ) {
          return noTagReply(
            message,
            "❌ DM komutu için bot sahibi veya Administrator yetkisi gerekiyor."
          );
        }

        const target =
          args.shift();

        const text =
          args.join(" ");

        if (!text) {
          return noTagReply(
            message,
            "❌ Gönderilecek mesajı yazmalısın."
          );
        }

        // DM ALL
        if (
          target?.toLowerCase() === "all"
        ) {

          let success = 0;
          let failed = 0;

          const members =
            await message.guild.members
              .fetch()
              .catch(() => null);

          if (!members) {
            return noTagReply(
              message,
              "❌ Üyeler alınamadı."
            );
          }

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
          }

          return noTagReply(
            message,
`📩 **DM ALL TAMAMLANDI**

✅ Başarılı: **${success}**
❌ Başarısız: **${failed}**`
          );
        }

        // TEK OYUNCU
        const member =
          getMentionedMember(
            message,
            target
          );

        if (!member) {
          return noTagReply(
            message,
            "❌ Kullanım: `.dm @oyuncu mesaj`"
          );
        }

        try {

          await member.send(
            text
          );

          return noTagReply(
            message,
            "✅ DM başarıyla gönderildi."
          );

        } catch {

          return noTagReply(
            message,
            "❌ Oyuncuya DM gönderilemedi."
          );
        }
      }

    } catch (error) {

      console.error(
        "Komut hatası:",
        error
      );

      return noTagReply(
        message,
        "❌ İşlem sırasında bir hata oluştu."
      ).catch(() => {});
    }
  }
);

// =====================================================
// YENİ ÜYE
// =====================================================

client.on(
  "guildMemberAdd",
  async member => {

    if (member.user.bot) {
      return;
    }

    await member.roles
      .add(ROLES.KAYITSIZ)
      .catch(() => {});

    const channel =
      await member.guild.channels
        .fetch(CHANNELS.KAYIT)
        .catch(() => null);

    if (
      channel &&
      channel.isTextBased()
    ) {

      await channel.send({
        content:
`👋 **Yeni Oyuncu**

<@${member.id}> sunucuya katıldı.

📋 Kayıt işlemi için
<@&${ROLES.KAYIT_YETKILISI}>
bekleniyor.`,

        allowedMentions: {
          users: [member.id],
          roles: [ROLES.KAYIT_YETKILISI]
        }
      }).catch(() => {});
    }
  }
);

// =====================================================
// BUTONLAR
// =====================================================

client.on(
  "interactionCreate",
  async interaction => {

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
      interaction.customId.startsWith(
        "register_"
      )
    ) {

      if (
        !(
          isOwner(interaction.member) ||
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
        interaction.customId.split("_");

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
          ROLES.TEKNIK_DIREKTOR
        ])
        .catch(() => {});

      const roleMap = {
        kaleci: ROLES.KALECI,
        uye: ROLES.UYE,
        futbolcu: ROLES.FUTBOLCU,
        td: ROLES.TEKNIK_DIREKTOR
      };

      await target.roles
        .add(roleMap[type])
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

👤 Oyuncu: **${p.nickname || target.displayName}**
🎭 Rol: **${p.position}**`,

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
      interaction.customId.startsWith(
        "transfer_"
      )
    ) {

      const parts =
        interaction.customId.split("_");

      const action =
        parts[1];

      const transferId =
        parts.slice(2).join("_");

      const transfers =
        db.transfers[
          interaction.guild.id
        ] || {};

      const transfer =
        transfers[transferId];

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

      // KABUL
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
              "❌ Zaten bir takımın bulunuyor.",
            ephemeral: true
          });
        }

        const roleId =
          TEAMS[
            transfer.teamName
          ];

        await target.roles
          .add(roleId)
          .catch(() => {});

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

        await interaction.update({
          content:
`✅ **TRANSFER KABUL EDİLDİ**

👤 Oyuncu: **${p.nickname || target.displayName}**

🏟️ Takım: **${transfer.teamName}**

💰 Sezon Başı Maaşı:
**${money(transfer.salary)}**

📅 Sözleşme:
**${transfer.seasons} Sezon**

🏷️ Takım rolü otomatik verildi.`,

          components: []
        });

        return;
      }

      // RED
      if (
        action === "reject"
      ) {

        delete transfers[
          transferId
        ];

        saveDB();

        await interaction.update({
          content:
`❌ **TRANSFER REDDEDİLDİ**

👤 Oyuncu teklifi reddetti.
🏟️ Oyuncu takımsız kaldı.`,

          components: []
        });

        return;
      }
    }
  }
);

// =====================================================
// HAZIR
// =====================================================

client.once(
  "ready",
  async () => {

    console.log(
      `✅ ${client.user.tag} aktif!`
    );

    console.log(
      `👑 Bot sahibi: ${OWNER_ID}`
    );

    await sendBotStatus();

    // Her 30 dakika
    setInterval(
      sendBotStatus,
      30 * 60 * 1000
    );

    // Fikstür kontrolü
    setInterval(
      checkFixtures,
      1000
    );
  }
);

// =====================================================
// TOKEN KONTROLÜ
// =====================================================

if (!TOKEN) {

  console.error(
    "❌ TOKEN bulunamadı!"
  );

  console.error(
    "Railway/hosting ortamına TOKEN değişkenini ekle."
  );

  process.exit(1);
}

// =====================================================
// BOTU BAŞLAT
// =====================================================

client.login(TOKEN)
  .then(() => {
    console.log(
      "✅ Discord'a başarıyla bağlanıldı."
    );
  })
  .catch(error => {

    console.error(
      "❌ Discord giriş hatası:",
      error
    );

    process.exit(1);
  });
