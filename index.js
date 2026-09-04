const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ======================================================
// AXERA LEAGUE • FUTBOL RP BOT
// Discord.js v14
// ======================================================

const TOKEN = process.env.TOKEN || "BURAYA_BOT_TOKENINI_YAZ";

// ======================================================
// ROLLER
// ======================================================

const FUTBOLCU_ROLE_ID = "1534457228986421278";
const KALECI_ROLE_ID = "1534492034243498195";
const KAYITSIZ_ROLE_ID = "1534457560134844517";
const TEKNIK_DIREKTOR_ROLE_ID = "1534456648930693120";

const KAYIT_YETKILI_ROLE_ID = "1534456315366342716";
const DEGER_YETKILI_ROLE_ID = "1534456192913375382";

// GÜNCEL MAÇ YETKİLİSİ
const MAC_YETKILI_ROLE_ID = "1535251168169697390";

// ======================================================
// KANALLAR
// ======================================================

const KAYIT_CHANNEL_ID = "1534460177884123276";
const SOHBET_CHANNEL_ID = "1534469475917758586";
const ANTRENMAN_CHANNEL_ID = "1534474070798762197";
const PENALTI_CHANNEL_ID = "1534474327812997192";

// ======================================================
// DATA
// ======================================================

const DATA_FILE = path.join(__dirname, "data.json");

let data = {
  users: {},
  registrations: {},
  teams: {},
  fixtures: []
};

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      saveData();
      return;
    }

    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);

    data = {
      users: parsed.users || {},
      registrations: parsed.registrations || {},
      teams: parsed.teams || {},
      fixtures: parsed.fixtures || []
    };
  } catch (error) {
    console.error("data.json yüklenemedi:", error);

    data = {
      users: {},
      registrations: {},
      teams: {},
      fixtures: []
    };
  }
}

function saveData() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(data, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("data.json kaydedilemedi:", error);
  }
}

loadData();

// ======================================================
// CLIENT
// ======================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],

  partials: [
    Partials.Channel,
    Partials.GuildMember,
    Partials.User,
    Partials.Message
  ]
});

// ======================================================
// YETKİLER
// ======================================================

function hasRole(member, roleId) {
  return member?.roles?.cache?.has(roleId);
}

function isKayitYetkilisi(member) {
  return hasRole(member, KAYIT_YETKILI_ROLE_ID);
}

function isDegerYetkilisi(member) {
  return hasRole(member, DEGER_YETKILI_ROLE_ID);
}

function isMacYetkilisi(member) {
  return hasRole(member, MAC_YETKILI_ROLE_ID);
}

// ======================================================
// KULLANICI DATA
// ======================================================

function getUserData(userId) {
  if (!data.users[userId]) {
    data.users[userId] = {
      value: 0,
      training: 0
    };
  }

  return data.users[userId];
}

// ======================================================
// OYUNCU DEĞERİ
// ======================================================

function getValueFromNickname(nickname) {
  if (!nickname) return null;

  const match = nickname.match(/(\d+(?:\.\d+)?)M€$/i);

  if (!match) return null;

  const value = Number(match[1]);

  if (!Number.isFinite(value)) return null;

  return value;
}

async function changeValue(member, amount) {
  const nickname =
    member.nickname || member.user.username;

  const currentValue =
    getValueFromNickname(nickname);

  if (currentValue === null) {
    return {
      success: false,
      reason:
        "Takma adın sonunda geçerli bir M€ değeri bulunamadı."
    };
  }

  let newValue = currentValue + amount;

  if (newValue < 0) {
    newValue = 0;
  }

  const newNickname =
    nickname.replace(
      /(\d+(?:\.\d+)?)M€$/i,
      `${newValue}M€`
    );

  if (newNickname.length > 32) {
    return {
      success: false,
      reason:
        "Yeni takma ad Discord'un 32 karakter sınırını aşıyor."
    };
  }

  try {
    await member.setNickname(newNickname);

    const userData =
      getUserData(member.id);

    userData.value = newValue;

    saveData();

    return {
      success: true,
      oldValue: currentValue,
      newValue
    };
  } catch (error) {
    console.error("Değer değiştirilemedi:", error);

    return {
      success: false,
      reason:
        "Takma ad değiştirilemedi. Botun Takma Adları Yönet yetkisini ve rol sırasını kontrol et."
    };
  }
}

// ======================================================
// ARAMA
// ======================================================

function normalizeText(text) {
  return String(text)
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] =
          matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function similarityScore(a, b) {
  a = normalizeText(a);
  b = normalizeText(b);

  if (!a || !b) return 0;

  if (a === b) return 1;

  if (b.includes(a)) return 0.95;

  const distance =
    levenshtein(a, b);

  const maxLength =
    Math.max(a.length, b.length);

  if (maxLength === 0) return 1;

  return 1 - distance / maxLength;
}

function findClosestPlayer(guild, search) {
  const normalizedSearch =
    normalizeText(search);

  if (!normalizedSearch) return null;

  let best = null;
  let bestScore = 0;

  for (const member of guild.members.cache.values()) {
    if (member.user.bot) continue;

    const nickname = member.nickname;

    if (!nickname) continue;

    const score =
      similarityScore(
        normalizedSearch,
        nickname
      );

    if (score > bestScore) {
      bestScore = score;

      best = {
        member,
        nickname,
        score
      };
    }
  }

  if (!best || bestScore < 0.45) {
    return null;
  }

  return best;
}

// ======================================================
// TAKIM SİSTEMİ
// ======================================================

function getTeam(teamRole) {
  if (!teamRole) return null;

  if (!data.teams[teamRole.id]) {
    data.teams[teamRole.id] = {
      id: teamRole.id,
      name: teamRole.name,
      value: 0,
      players: []
    };
  }

  return data.teams[teamRole.id];
}

function getTeamValue(teamRole) {
  const team =
    getTeam(teamRole);

  return Number(team?.value) || 0;
}

function getTeamPlayers(teamRole) {
  const team =
    getTeam(teamRole);

  if (!Array.isArray(team.players)) {
    team.players = [];
  }

  return team.players;
}

// ======================================================
// POZİSYONLAR
// ======================================================

const VALID_POSITIONS = [
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

function normalizePosition(position) {
  return String(position || "")
    .toLocaleUpperCase("tr-TR")
    .trim();
}

function positionEmoji(position) {
  switch (position) {
    case "KL":
      return "🧤";

    case "STP":
      return "🛡️";

    case "SĞB":
    case "SLB":
      return "↔️";

    case "MO":
      return "⚙️";

    case "MOO":
      return "🎯";

    case "SĞK":
    case "SLK":
      return "🪽";

    case "SNT":
      return "⚡";

    default:
      return "👤";
  }
}

function getPlayerName(guild, playerId) {
  const member =
    guild.members.cache.get(playerId);

  if (!member) {
    return "Oyuncu";
  }

  return (
    member.nickname ||
    member.user.username
  );
}

function getPlayersByPosition(
  guild,
  teamRole,
  position
) {
  return getTeamPlayers(teamRole)
    .filter(
      player =>
        normalizePosition(player.position) ===
        normalizePosition(position)
    );
}

function randomPlayer(
  guild,
  teamRole,
  positions = []
) {
  let players =
    getTeamPlayers(teamRole);

  if (positions.length > 0) {
    players =
      players.filter(player =>
        positions.includes(
          normalizePosition(
            player.position
          )
        )
      );
  }

  if (!players.length) {
    return null;
  }

  return players[
    Math.floor(
      Math.random() * players.length
    )
  ];
}

// ======================================================
// TAKIM GÜCÜ
// ======================================================

function getTeamStrength(teamRole) {
  const value =
    Math.max(
      0,
      getTeamValue(teamRole)
    );

  // Takım değerinin etkisi kontrollü tutulur.
  const valueBonus =
    Math.min(
      1.15,
      1 + Math.log10(value + 10) / 50
    );

  const squadSize =
    Math.min(
      getTeamPlayers(teamRole).length,
      11
    );

  const squadBonus =
    squadSize / 100;

  return valueBonus + squadBonus;
}

function chooseTeam(
  team1,
  team2
) {
  const strength1 =
    getTeamStrength(team1);

  const strength2 =
    getTeamStrength(team2);

  const total =
    strength1 + strength2;

  return Math.random() * total <
    strength1
    ? team1
    : team2;
}

// ======================================================
// CANLI MAÇ
// ======================================================

const activeMatches = new Map();

function createMatchEmbed(match) {
  return new EmbedBuilder()
    .setTitle(
      "🏟️ AXERA LEAGUE • CANLI MAÇ"
    )
    .setDescription(
      `## ${match.team1.name} ${match.score1} — ${match.score2} ${match.team2.name}`
    )
    .addFields(
      {
        name: "⏱️ Dakika",
        value:
          `**${match.minute}'**`,
        inline: true
      },
      {
        name: "📡 Durum",
        value:
          match.finished
            ? "🏁 SONA ERDİ"
            : "🔴 CANLI",
        inline: true
      },
      {
        name: "💰 Takım Değeri",
        value:
          `🟦 ${match.team1.name}: **${getTeamValue(match.team1)}M€**\n` +
          `🟥 ${match.team2.name}: **${getTeamValue(match.team2)}M€**`,
        inline: false
      },
      {
        name: "📢 Son Olay",
        value:
          match.lastEvent ||
          "Maç başlamak üzere...",
        inline: false
      }
    )
    .setFooter({
      text:
        "Axera League • Canlı Maç"
    })
    .setTimestamp();
}

// ======================================================
// MAÇ OLAYI
// ======================================================

function generateMatchEvent(
  guild,
  match
) {
  const attackingTeam =
    chooseTeam(
      match.team1,
      match.team2
    );

  const defendingTeam =
    attackingTeam.id ===
    match.team1.id
      ? match.team2
      : match.team1;

  const attacker =
    randomPlayer(
      guild,
      attackingTeam,
      [
        "SNT",
        "SĞK",
        "SLK",
        "MOO",
        "MO"
      ]
    );

  const defender =
    randomPlayer(
      guild,
      defendingTeam,
      [
        "STP",
        "SĞB",
        "SLB",
        "MO"
      ]
    );

  const goalkeeper =
    randomPlayer(
      guild,
      defendingTeam,
      ["KL"]
    );

  const attackerName =
    attacker
      ? getPlayerName(
          guild,
          attacker.id
        )
      : "Hücum oyuncusu";

  const defenderName =
    defender
      ? getPlayerName(
          guild,
          defender.id
        )
      : "Savunma oyuncusu";

  const goalkeeperName =
    goalkeeper
      ? getPlayerName(
          guild,
          goalkeeper.id
        )
      : "Kaleci";

  const attackName =
    attackingTeam.name;

  const attackStrength =
    getTeamStrength(
      attackingTeam
    );

  const defendStrength =
    getTeamStrength(
      defendingTeam
    );

  let goalChance = 0.10;

  if (
    attackStrength >
    defendStrength
  ) {
    goalChance += 0.025;
  }

  if (
    attacker &&
    normalizePosition(
      attacker.position
    ) === "SNT"
  ) {
    goalChance += 0.02;
  }

  const roll =
    Math.random();

  // GOL
  if (roll < goalChance) {
    if (
      attackingTeam.id ===
      match.team1.id
    ) {
      match.score1++;
    } else {
      match.score2++;
    }

    match.goals.push({
      minute: match.minute,
      teamId: attackingTeam.id,
      playerId:
        attacker?.id || null
    });

    return (
      `⚽ **GOOOL!**\n` +
      `🔥 **${attackerName}** harika vurdu ve top ağlarda!\n` +
      `🏟️ **${attackName}** golü buldu!\n` +
      `📊 **${match.score1} - ${match.score2}**`
    );
  }

  // KURTARIŞ
  if (roll < 0.28) {
    return (
      `🎯 **${attackerName}** sert bir şut gönderdi!\n` +
      `🧤 **${goalkeeperName}** müthiş kurtardı!`
    );
  }

  // DIŞARI
  if (roll < 0.43) {
    return (
      `🎯 **${attackerName}** kaleyi gördü ve vurdu!\n` +
      `❌ Top az farkla dışarı çıktı.`
    );
  }

  // SAVUNMA
  if (roll < 0.57) {
    return (
      `⚡ **${attackerName}** savunmanın arkasına sarktı!\n` +
      `🛡️ **${defenderName}** son anda müdahale etti!`
    );
  }

  // KORNER
  if (roll < 0.69) {
    return (
      `🚩 **${attackerName}** ceza sahasına girdi!\n` +
      `🛡️ Savunmadan seken top kornere çıktı.\n` +
      `🚩 **${attackName}** korner kullanacak.`
    );
  }

  // ORTA
  if (roll < 0.79) {
    return (
      `🪽 **${attackerName}** kanattan hızlandı!\n` +
      `🎯 Ceza sahasına tehlikeli bir orta gönderdi.\n` +
      `🧤 **${goalkeeperName}** topu kontrol etti.`
    );
  }

  // KART
  if (roll < 0.88) {
    if (defender) {
      return (
        `🟨 **${defenderName}** sert müdahalesi sonrası sarı kart gördü!`
      );
    }

    return (
      `🟨 Hakem oyunu durdurdu ve faul kararı verdi.`
    );
  }

  // NORMAL
  return (
    `⚡ **${attackerName}** orta sahadan topu taşıdı!\n` +
    `🏃 Rakip savunmayı geçmeye çalıştı fakat atak sonuçsuz kaldı.`
  );
}

// ======================================================
// MAÇI BAŞLAT
// ======================================================

async function startMatch(
  message,
  team1,
  team2
) {
  if (
    team1.id === team2.id
  ) {
    return message.reply(
      "❌ Bir takım kendisiyle maç yapamaz."
    );
  }

  if (
    activeMatches.has(team1.id)
  ) {
    return message.reply(
      `❌ **${team1.name}** zaten canlı bir maçta.`
    );
  }

  if (
    activeMatches.has(team2.id)
  ) {
    return message.reply(
      `❌ **${team2.name}** zaten canlı bir maçta.`
    );
  }

  const players1 =
    getTeamPlayers(team1);

  const players2 =
    getTeamPlayers(team2);

  if (!players1.length) {
    return message.reply(
      `❌ **${team1.name}** kadrosu boş.`
    );
  }

  if (!players2.length) {
    return message.reply(
      `❌ **${team2.name}** kadrosu boş.`
    );
  }

  const goalkeeper1 =
    randomPlayer(
      message.guild,
      team1,
      ["KL"]
    );

  const goalkeeper2 =
    randomPlayer(
      message.guild,
      team2,
      ["KL"]
    );

  if (!goalkeeper1) {
    return message.reply(
      `❌ **${team1.name}** kadrosunda **KL** bulunmuyor.`
    );
  }

  if (!goalkeeper2) {
    return message.reply(
      `❌ **${team2.name}** kadrosunda **KL** bulunmuyor.`
    );
  }

  const match = {
    team1,
    team2,
    score1: 0,
    score2: 0,
    minute: 0,
    lastEvent:
      "🏟️ Hakem düdüğünü çalıyor...",
    finished: false,
    goals: [],
    events: [],
    interval: null
  };

  activeMatches.set(
    team1.id,
    match
  );

  activeMatches.set(
    team2.id,
    match
  );

  const matchMessage =
    await message.channel.send({
      embeds: [
        createMatchEmbed(match)
      ]
    });

  match.interval =
    setInterval(
      async () => {
        try {
          match.minute++;

          if (
            match.minute <= 90
          ) {
            const event =
              generateMatchEvent(
                message.guild,
                match
              );

            match.lastEvent =
              event;

            match.events.push({
              minute:
                match.minute,
              text: event
            });

            await matchMessage.edit({
              embeds: [
                createMatchEmbed(match)
              ]
            });
          }

          if (
            match.minute >= 90
          ) {
            clearInterval(
              match.interval
            );

            match.finished = true;

            match.lastEvent =
              "🏁 Hakem son düdüğü çaldı!";

            await matchMessage.edit({
              embeds: [
                createMatchEmbed(match)
              ]
            });

            await finishMatch(
              message,
              match
            );

            activeMatches.delete(
              team1.id
            );

            activeMatches.delete(
              team2.id
            );
          }
        } catch (error) {
          console.error(
            "Canlı maç hatası:",
            error
          );

          clearInterval(
            match.interval
          );

          activeMatches.delete(
            team1.id
          );

          activeMatches.delete(
            team2.id
          );
        }
      },
      1000
    );
}

// ======================================================
// MAÇ SONU
// ======================================================

async function finishMatch(
  message,
  match
) {
  let result;

  if (
    match.score1 >
    match.score2
  ) {
    result =
      `🏆 **Kazanan:** ${match.team1.name}`;
  } else if (
    match.score2 >
    match.score1
  ) {
    result =
      `🏆 **Kazanan:** ${match.team2.name}`;
  } else {
    result =
      "🤝 **Maç berabere bitti!**";
  }

  const goals =
    match.goals.length
      ? match.goals
          .map(goal => {
            const player =
              goal.playerId
                ? getPlayerName(
                    message.guild,
                    goal.playerId
                  )
                : "Oyuncu";

            const teamName =
              goal.teamId ===
              match.team1.id
                ? match.team1.name
                : match.team2.name;

            return (
              `⚽ **${goal.minute}'** — ${player} (${teamName})`
            );
          })
          .join("\n")
      : "Gol olmadı.";

  const embed =
    new EmbedBuilder()
      .setTitle(
        "🏁 AXERA LEAGUE • MAÇ SONUCU"
      )
      .setDescription(
        `## ${match.team1.name} ${match.score1} — ${match.score2} ${match.team2.name}`
      )
      .addFields(
        {
          name: "🏆 Sonuç",
          value: result,
          inline: false
        },
        {
          name: "⚽ Goller",
          value: goals,
          inline: false
        },
        {
          name: "💰 Takım Değerleri",
          value:
            `🟦 ${match.team1.name}: **${getTeamValue(match.team1)}M€**\n` +
            `🟥 ${match.team2.name}: **${getTeamValue(match.team2)}M€**`,
          inline: false
        }
      )
      .setFooter({
        text:
          "Axera League • Maç Sonu"
      })
      .setTimestamp();

  await message.channel.send({
    embeds: [embed]
  });

  // Fikstürü otomatik tamamla.
  for (
    const fixture of data.fixtures
  ) {
    const sameTeams =
      fixture.team1Id ===
        match.team1.id &&
      fixture.team2Id ===
        match.team2.id;

    const reverseTeams =
      fixture.team1Id ===
        match.team2.id &&
      fixture.team2Id ===
        match.team1.id;

    if (
      (sameTeams ||
        reverseTeams) &&
      fixture.status ===
        "BEKLIYOR"
    ) {
      fixture.status =
        "TAMAMLANDI";

      if (sameTeams) {
        fixture.score1 =
          match.score1;
        fixture.score2 =
          match.score2;
      } else {
        fixture.score1 =
          match.score2;
        fixture.score2 =
          match.score1;
      }
    }
  }

  saveData();
}

// ======================================================
// READY
// ======================================================

client.once("ready", () => {
  console.log(
    `✅ ${client.user.tag} aktif!`
  );

  client.user.setPresence({
    activities: [
      {
        name:
          "Axera League ⚽",
        type: 0
      }
    ],
    status: "online"
  });
});

// ======================================================
// KAYIT KARŞILAMA
// ======================================================

client.on(
  "guildMemberAdd",
  async member => {
    try {
      const channel =
        member.guild.channels.cache.get(
          KAYIT_CHANNEL_ID
        );

      if (!channel) return;

      await channel.send(
        `👋 ${member} hoşgeldin sunucumuza!\n` +
        `📋 <@&${KAYIT_YETKILI_ROLE_ID}> seninle ilgilenecektir.`
      );
    } catch (error) {
      console.error(
        "Karşılama hatası:",
        error
      );
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
        !interaction.isButton()
      ) {
        return;
      }

      if (
        !interaction.customId.startsWith(
          "kayit_"
        )
      ) {
        return;
      }

      if (
        !isKayitYetkilisi(
          interaction.member
        )
      ) {
        return interaction.reply({
          content:
            "❌ Bu butonları yalnızca **Kayıt Yetkilisi** kullanabilir.",
          ephemeral: true
        });
      }

      const parts =
        interaction.customId.split(
          "_"
        );

      const type =
        parts[1];

      const targetId =
        parts[2];

      const target =
        await interaction.guild.members
          .fetch(targetId)
          .catch(() => null);

      if (!target) {
        return interaction.reply({
          content:
            "❌ Oyuncu bulunamadı.",
          ephemeral: true
        });
      }

      let roleId = null;
      let roleName = "";

      if (
        type === "futbolcu"
      ) {
        roleId =
          FUTBOLCU_ROLE_ID;
        roleName =
          "Futbolcu";
      }

      if (
        type === "kaleci"
      ) {
        roleId =
          KALECI_ROLE_ID;
        roleName =
          "Kaleci";
      }

      if (
        type === "td"
      ) {
        roleId =
          TEKNIK_DIREKTOR_ROLE_ID;
        roleName =
          "Teknik Direktör";
      }

      if (!roleId) {
        return interaction.reply({
          content:
            "❌ Geçersiz kayıt türü.",
          ephemeral: true
        });
      }

      await target.roles.remove([
        KAYITSIZ_ROLE_ID,
        FUTBOLCU_ROLE_ID,
        KALECI_ROLE_ID,
        TEKNIK_DIREKTOR_ROLE_ID
      ]);

      await target.roles.add(
        roleId
      );

      data.registrations[
        target.id
      ] = {
        ...(data.registrations[
          target.id
        ] || {}),
        status:
          "TAMAMLANDI",
        type: roleName,
        registeredBy:
          interaction.user.id,
        date: Date.now()
      };

      saveData();

      await interaction.update({
        content:
          `✅ **Kayıt Tamamlandı**\n\n` +
          `👤 Oyuncu: ${target}\n` +
          `📋 Tür: **${roleName}**\n` +
          `👮 Yetkili: ${interaction.user}`,
        components: []
      });

      const sohbet =
        interaction.guild.channels.cache.get(
          SOHBET_CHANNEL_ID
        );

      if (sohbet) {
        await sohbet.send(
          `🎉 ${target} **${roleName}** olarak kayıt edildi!\n` +
          `📋 Kayıt Yetkilisi: ${interaction.user}`
        );
      }
    } catch (error) {
      console.error(
        "Buton hatası:",
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
        });
      }
    }
  }
);

// ======================================================
// MESAJ KOMUTLARI
// ======================================================

client.on(
  "messageCreate",
  async message => {
    try {
      if (message.author.bot) return;
      if (!message.guild) return;

      const content =
        message.content.trim();

      if (
        !content.startsWith(".")
      ) {
        return;
      }

      const args =
        content.split(/\s+/);

      const command =
        args
          .shift()
          .toLocaleLowerCase(
            "tr-TR"
          );

      // ==================================================
      // YARDIM
      // ==================================================

      if (
        command === ".yardım" ||
        command === ".yardim"
      ) {
        const embed =
          new EmbedBuilder()
            .setTitle(
              "📚 AXERA LEAGUE • YARDIM"
            )
            .setDescription(
              "Kullanabileceğin komutlar:"
            )
            .addFields(
              {
                name: "📋 Kayıt",
                value:
                  "`.k @Oyuncu TakmaAdı`\n" +
                  "`.kayıtsızver @Oyuncu`"
              },
              {
                name: "🏋️ Antrenman",
                value:
                  "`.ant`\n`.antrenman`"
              },
              {
                name: "🥅 Penaltı",
                value:
                  "`.pen`\n`.penaltı`"
              },
              {
                name: "💰 Değer",
                value:
                  "`.dver @Oyuncu 5`\n" +
                  "`.dsil @Oyuncu 5`"
              },
              {
                name: "🐦 Tweet",
                value:
                  "`.tweet mesaj`"
              },
              {
                name: "🔎 Arama",
                value:
                  "`.ara Oyuncu`"
              },
              {
                name: "🏟️ Maç Yetkilisi",
                value:
                  "`.takımdeğer @Takım 850`\n" +
                  "`.kadroekle @Takım @Oyuncu SNT`\n" +
                  "`.kadrocikar @Takım @Oyuncu`\n" +
                  "`.maç @Takım1 @Takım2`\n" +
                  "`.fiksturekle @Takım1 @Takım2 20:00`"
              },
              {
                name: "📋 Kadro / Fikstür",
                value:
                  "`.kadro @Takım`\n" +
                  "`.fikstur`"
              }
            )
            .setFooter({
              text:
                "Axera League"
            });

        return message.reply({
          embeds: [embed]
        });
      }

      // ==================================================
      // KAYIT
      // ==================================================

      if (
        command === ".k"
      ) {
        if (
          !isKayitYetkilisi(
            message.member
          )
        ) {
          return message.reply(
            "❌ Bu komutu yalnızca **Kayıt Yetkilisi** kullanabilir."
          );
        }

        if (
          message.channel.id !==
          KAYIT_CHANNEL_ID
        ) {
          return message.reply(
            "❌ Bu komut yalnızca kayıt kanalında kullanılabilir."
          );
        }

        const target =
          message.mentions.members.first();

        if (!target) {
          return message.reply(
            "❌ Kullanım: `.k @Oyuncu TakmaAdı`"
          );
        }

        const nickname =
          args
            .slice(1)
            .join(" ")
            .trim();

        if (!nickname) {
          return message.reply(
            "❌ Takma ad yazmalısın."
          );
        }

        if (
          nickname.length > 32
        ) {
          return message.reply(
            "❌ Takma ad 32 karakterden uzun olamaz."
          );
        }

        try {
          await target.setNickname(
            nickname
          );
        } catch {
          return message.reply(
            "❌ Takma ad değiştirilemedi. Botun rol sırasını kontrol et."
          );
        }

        data.registrations[
          target.id
        ] = {
          registeredBy:
            message.author.id,
          nickname,
          status:
            "PANEL_BEKLIYOR",
          date: Date.now()
        };

        saveData();

        return message.channel.send(
          `📋 **KAYIT PANELİ**\n\n` +
          `👤 Oyuncu: ${target}\n` +
          `🏷️ Takma Ad: \`${nickname}\`\n\n` +
          `Aşağıdaki kayıt seçeneklerinden birini **Kayıt Yetkilisi** seçmelidir.`
        );
      }

      // ==================================================
      // KAYITSIZ VER
      // ==================================================

      if (
        command === ".kayıtsızver" ||
        command === ".kayitsizver"
      ) {
        if (
          !isKayitYetkilisi(
            message.member
          )
        ) {
          return message.reply(
            "❌ Bu komutu yalnızca **Kayıt Yetkilisi** kullanabilir."
          );
        }

        const target =
          message.mentions.members.first();

        if (!target) {
          return message.reply(
            "❌ Kullanım: `.kayıtsızver @Oyuncu`"
          );
        }

        try {
          await target.roles.remove([
            FUTBOLCU_ROLE_ID,
            KALECI_ROLE_ID,
            TEKNIK_DIREKTOR_ROLE_ID
          ]);

          await target.roles.add(
            KAYITSIZ_ROLE_ID
          );

          if (
            data.registrations[
              target.id
            ]
          ) {
            data.registrations[
              target.id
            ].status =
              "KAYITSIZ";
          }

          saveData();

          return message.reply(
            `✅ ${target} tekrar **Kayıtsız** yapıldı.`
          );
        } catch {
          return message.reply(
            "❌ Roller değiştirilemedi."
          );
        }
      }

      // ==================================================
      // DEĞER VER
      // ==================================================

      if (
        command === ".dver"
      ) {
        if (
          !isDegerYetkilisi(
            message.member
          )
        ) {
          return message.reply(
            "❌ Bu komutu yalnızca **Değer Yetkilisi** kullanabilir."
          );
        }

        const target =
          message.mentions.members.first();

        if (!target) {
          return message.reply(
            "❌ Kullanım: `.dver @Oyuncu 5`"
          );
        }

        const targetIndex =
          args.findIndex(
            arg =>
              arg.includes(
                target.id
              )
          );

        const amount =
          Number(
            args[
              targetIndex + 1
            ]
          );

        if (
          !Number.isFinite(amount) ||
          amount <= 0
        ) {
          return message.reply(
            "❌ Miktar geçersiz."
          );
        }

        const result =
          await changeValue(
            target,
            amount
          );

        if (!result.success) {
          return message.reply(
            `❌ ${result.reason}`
          );
        }

        return message.reply(
          `✅ ${target} değer aldı.\n` +
          `💰 **${result.oldValue}M€ → ${result.newValue}M€**`
        );
      }

      // ==================================================
      // DEĞER SİL
      // ==================================================

      if (
        command === ".dsil"
      ) {
        if (
          !isDegerYetkilisi(
            message.member
          )
        ) {
          return message.reply(
            "❌ Bu komutu yalnızca **Değer Yetkilisi** kullanabilir."
          );
        }

        const target =
          message.mentions.members.first();

        if (!target) {
          return message.reply(
            "❌ Kullanım: `.dsil @Oyuncu 5`"
          );
        }

        const targetIndex =
          args.findIndex(
            arg =>
              arg.includes(
                target.id
              )
          );

        const amount =
          Number(
            args[
              targetIndex + 1
            ]
          );

        if (
          !Number.isFinite(amount) ||
          amount <= 0
        ) {
          return message.reply(
            "❌ Miktar geçersiz."
          );
        }

        const result =
          await changeValue(
            target,
            -amount
          );

        if (!result.success) {
          return message.reply(
            `❌ ${result.reason}`
          );
        }

        return message.reply(
          `✅ ${target} değer kaybetti.\n` +
          `💰 **${result.oldValue}M€ → ${result.newValue}M€**`
        );
      }

      // ==================================================
      // ANTRENMAN
      // ==================================================

      if (
        command === ".ant" ||
        command === ".antrenman"
      ) {
        if (
          message.channel.id !==
          ANTRENMAN_CHANNEL_ID
        ) {
          return message.reply(
            "❌ Bu komut yalnızca antrenman kanalında kullanılabilir."
          );
        }

        const userData =
          getUserData(
            message.author.id
          );

        userData.training++;

        if (
          userData.training >= 5
        ) {
          const result =
            await changeValue(
              message.member,
              5
            );

          if (!result.success) {
            userData.training =
              4;

            saveData();

            return message.reply(
              `🏋️ **Antrenman:** 4/5\n\n` +
              `❌ Ödül verilemedi.\n` +
              `${result.reason}`
            );
          }

          userData.training =
            0;

          saveData();

          return message.reply(
            `🏋️ **ANTRENMAN TAMAMLANDI!**\n\n` +
            `📊 **5/5**\n` +
            `💰 **+5M€**\n` +
            `💵 Yeni değer: **${result.newValue}M€**`
          );
        }

        saveData();

        return message.reply(
          `🏋️ Antrenman tamamlandı!\n\n` +
          `📊 İlerleme: **${userData.training}/5**\n` +
          `🎁 5/5 → **+5M€**`
        );
      }

      // ==================================================
      // PENALTI
      // ==================================================

      if (
        command === ".pen" ||
        command === ".penaltı" ||
        command === ".penalti"
      ) {
        if (
          message.channel.id !==
          PENALTI_CHANNEL_ID
        ) {
          return message.reply(
            "❌ Bu komut yalnızca penaltı kanalında kullanılabilir."
          );
        }

        const outcomes = [
          "goal",
          "post",
          "save"
        ];

        const outcome =
          outcomes[
            Math.floor(
              Math.random() *
                outcomes.length
            )
          ];

        if (
          outcome === "goal"
        ) {
          const result =
            await changeValue(
              message.member,
              5
            );

          if (!result.success) {
            return message.reply(
              `⚽ **GOOOL!**\n❌ ${result.reason}`
            );
          }

          return message.reply(
            `⚽ **GOOOL!**\n\n` +
            `🧤 Axera Kalecisi penaltıyı çıkaramadı!\n\n` +
            `💰 **+5M€**\n` +
            `💵 Yeni değer: **${result.newValue}M€**`
          );
        }

        if (
          outcome === "post"
        ) {
          return message.reply(
            `🥅 **DİREK!**\n\n` +
            `Şut direkten döndü.\n` +
            `💰 Ödül: **0M€**`
          );
        }

        return message.reply(
          `🧤 **KURTARIŞ!**\n\n` +
          `Axera Kalecisi penaltıyı kurtardı!\n` +
          `💰 Ödül: **0M€**`
        );
      }

      // ==================================================
      // TWEET
      // ==================================================

      if (
        command === ".tweet"
      ) {
        const text =
          args.join(" ").trim();

        if (!text) {
          return message.reply(
            "❌ Kullanım: `.tweet mesaj`"
          );
        }

        const embed =
          new EmbedBuilder()
            .setAuthor({
              name:
                message.member.displayName,
              iconURL:
                message.author.displayAvatarURL({
                  extension:
                    "png",
                  size: 128
                })
            })
            .setDescription(text)
            .setFooter({
              text:
                "Axera League • Tweet"
            })
            .setTimestamp();

        return message.channel.send({
          embeds: [embed]
        });
      }

      // ==================================================
      // ARA
      // ==================================================

      if (
        command === ".ara"
      ) {
        const search =
          args.join(" ").trim();

        if (!search) {
          return message.reply(
            "❌ Kullanım: `.ara W.Sneijder`"
          );
        }

        const result =
          findClosestPlayer(
            message.guild,
            search
          );

        if (!result) {
          const embed =
            new EmbedBuilder()
              .setTitle(
                "🔎 Axera League • Oyuncu Arama"
              )
              .addFields({
                name:
                  "🔍 Aranan",
                value:
                  `\`${search}\``
              }, {
                name:
                  "⚪ Durum",
                value:
                  "**BOŞ**\nUygun oyuncu bulunamadı."
              })
              .setFooter({
                text:
                  "Axera League • Hızlı Arama"
              });

          return message.reply({
            embeds: [embed]
          });
        }

        const value =
          getValueFromNickname(
            result.nickname
          );

        const embed =
          new EmbedBuilder()
            .setTitle(
              "🔎 Axera League • Oyuncu Arama"
            )
            .addFields(
              {
                name:
                  "🔍 Aranan",
                value:
                  `\`${search}\``
              },
              {
                name:
                  "👤 Oyuncu",
                value:
                  `${result.member}`
              },
              {
                name:
                  "🏷️ Takma Ad",
                value:
                  `\`${result.nickname}\``
              },
              {
                name:
                  "💰 Değer",
                value:
                  value !== null
                    ? `**${value}M€**`
                    : "Belirlenemedi"
              },
              {
                name:
                  "🟢 Durum",
                value:
                  "**DOLU**"
              }
            )
            .setThumbnail(
              result.member.user.displayAvatarURL({
                extension:
                  "png",
                size: 128
              })
            )
            .setFooter({
              text:
                "Axera League • Hızlı Arama"
            })
            .setTimestamp();

        return message.reply({
          embeds: [embed]
        });
      }

      // ==================================================
      // TAKIM DEĞERİ
      // ==================================================

      if (
        command === ".takımdeğer"
      ) {
        if (
          !isMacYetkilisi(
            message.member
          )
        ) {
          return message.reply(
            "❌ Bu komutu yalnızca **Maç Yetkilisi** kullanabilir."
          );
        }

        const teamRole =
          message.mentions.roles.first();

        if (!teamRole) {
          return message.reply(
            "❌ Kullanım: `.takımdeğer @Takım 850`"
          );
        }

        const roleIndex =
          args.findIndex(
            arg =>
              arg.includes(
                teamRole.id
              )
          );

        const value =
          Number(
            args[
              roleIndex + 1
            ]
          );

        if (
          !Number.isFinite(value) ||
          value < 0
        ) {
          return message.reply(
            "❌ Geçerli bir değer gir."
          );
        }

        const team =
          getTeam(teamRole);

        team.value =
          value;

        saveData();

        return message.reply(
          `✅ **${teamRole.name}** takım değeri **${value}M€** oldu.`
        );
      }

      // ==================================================
      // KADRO EKLE
      // ==================================================

      if (
        command === ".kadroekle"
      ) {
        if (
          !isMacYetkilisi(
            message.member
          )
        ) {
          return message.reply(
            "❌ Bu komutu yalnızca **Maç Yetkilisi** kullanabilir."
          );
        }

        const teamRole =
          message.mentions.roles.first();

        const player =
          message.mentions.members.first();

        if (
          !teamRole ||
          !player
        ) {
          return message.reply(
            "❌ Kullanım: `.kadroekle @Takım @Oyuncu Pozisyon`"
          );
        }

        const roleIndex =
          args.findIndex(
            arg =>
              arg.includes(
                teamRole.id
              )
          );

        const playerIndex =
          args.findIndex(
            arg =>
              arg.includes(
                player.id
              )
          );

        const position =
          normalizePosition(
            args[
              Math.max(
                roleIndex,
                playerIndex
              ) + 1
            ]
          );

        if (
          !VALID_POSITIONS.includes(
            position
          )
        ) {
          return message.reply(
            `❌ Geçersiz pozisyon.\n\n` +
            `Kullanılabilir:\n` +
            `${VALID_POSITIONS.join(
              " • "
            )}`
          );
        }

        const team =
          getTeam(teamRole);

        const existing =
          team.players.find(
            p =>
              p.id ===
              player.id
          );

        if (existing) {
          existing.position =
            position;

          saveData();

          return message.reply(
            `🔄 **${player.displayName}** oyuncusunun pozisyonu **${position}** olarak güncellendi.`
          );
        }

        team.players.push({
          id: player.id,
          position
        });

        saveData();

        return message.reply(
          `✅ **${player.displayName}** → **${teamRole.name}** kadrosuna eklendi.\n` +
          `${positionEmoji(position)} Pozisyon: **${position}**`
        );
      }

      // ==================================================
      // KADRO ÇIKAR
      // ==================================================

      if (
        command === ".kadrocikar"
      ) {
        if (
          !isMacYetkilisi(
            message.member
          )
        ) {
          return message.reply(
            "❌ Bu komutu yalnızca **Maç Yetkilisi** kullanabilir."
          );
        }

        const teamRole =
          message.mentions.roles.first();

        const player =
          message.mentions.members.first();

        if (
          !teamRole ||
          !player
        ) {
          return message.reply(
            "❌ Kullanım: `.kadrocikar @Takım @Oyuncu`"
          );
        }

        const team =
          getTeam(teamRole);

        const before =
          team.players.length;

        team.players =
          team.players.filter(
            p =>
              p.id !==
              player.id
          );

        if (
          team.players.length ===
          before
        ) {
          return message.reply(
            "❌ Oyuncu bu takımın kadrosunda değil."
          );
        }

        saveData();

        return message.reply(
          `✅ **${player.displayName}** oyuncusu **${teamRole.name}** kadrosundan çıkarıldı.`
        );
      }

      // ==================================================
      // KADRO GÖRÜNTÜLE
      // ==================================================

      if (
        command === ".kadro"
      ) {
        const teamRole =
          message.mentions.roles.first();

        if (!teamRole) {
          return message.reply(
            "❌ Kullanım: `.kadro @Takım`"
          );
        }

        const team =
          getTeam(teamRole);

        const positions = [
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

        const fields = [];

        for (
          const position of positions
        ) {
          const players =
            getPlayersByPosition(
              message.guild,
              teamRole,
              position
            );

          const text =
            players.length
              ? players
                  .map(
                    p =>
                      `• ${getPlayerName(
                        message.guild,
                        p.id
                      )}`
                  )
                  .join("\n")
              : "—";

          fields.push({
            name:
              `${positionEmoji(position)} ${position}`,
            value:
              text,
            inline: true
          });
        }

        const embed =
          new EmbedBuilder()
            .setTitle(
              `🏟️ ${teamRole.name} • KADRO`
            )
            .setDescription(
              `💰 **Takım Değeri:** ${getTeamValue(teamRole)}M€\n` +
              `👥 **Oyuncu:** ${team.players.length}`
            )
            .addFields(fields)
            .setFooter({
              text:
                "Axera League • Kadro"
            })
            .setTimestamp();

        return message.reply({
          embeds: [embed]
        });
      }

      // ==================================================
      // MAÇ
      // ==================================================

      if (
        command === ".maç"
      ) {
        if (
          !isMacYetkilisi(
            message.member
          )
        ) {
          return message.reply(
            "❌ Bu komutu yalnızca **Maç Yetkilisi** kullanabilir."
          );
        }

        const roles =
          [
            ...message.mentions.roles.values()
          ];

        if (
          roles.length < 2
        ) {
          return message.reply(
            "❌ Kullanım: `.maç @Takım1 @Takım2`"
          );
        }

        return startMatch(
          message,
          roles[0],
          roles[1]
        );
      }

      // ==================================================
      // FİKSTÜR EKLE
      // ==================================================

      if (
        command === ".fiksturekle"
      ) {
        if (
          !isMacYetkilisi(
            message.member
          )
        ) {
          return message.reply(
            "❌ Bu komutu yalnızca **Maç Yetkilisi** kullanabilir."
          );
        }

        const roles =
          [
            ...message.mentions.roles.values()
          ];

        if (
          roles.length < 2
        ) {
          return message.reply(
            "❌ Kullanım: `.fiksturekle @Takım1 @Takım2 20:00`"
          );
        }

        const role1Index =
          args.findIndex(
            arg =>
              arg.includes(
                roles[0].id
              )
          );

        const role2Index =
          args.findIndex(
            arg =>
              arg.includes(
                roles[1].id
              )
          );

        const time =
          args
            .filter(
              (_, index) =>
                index !==
                  role1Index &&
                index !==
                  role2Index
            )
            .join(" ")
            .trim();

        if (!time) {
          return message.reply(
            "❌ Saat yazmalısın. Örnek: `.fiksturekle @Takım1 @Takım2 20:00`"
          );
        }

        const fixture = {
          id:
            Date.now().toString(),
          team1Id:
            roles[0].id,
          team2Id:
            roles[1].id,
          team1Name:
            roles[0].name,
          team2Name:
            roles[1].name,
          time,
          status:
            "BEKLIYOR",
          score1: null,
          score2: null
        };

        data.fixtures.push(
          fixture
        );

        saveData();

        return message.reply(
          `✅ **Fikstür eklendi!**\n\n` +
          `🏟️ **${roles[0].name} vs ${roles[1].name}**\n` +
          `⏰ **${time}**`
        );
      }

      // ==================================================
      // FİKSTÜR
      // ==================================================

      if (
        command === ".fikstur" ||
        command === ".fikstür"
      ) {
        if (
          data.fixtures.length ===
          0
        ) {
          const embed =
            new EmbedBuilder()
              .setTitle(
                "📅 AXERA LEAGUE • FİKSTÜR"
              )
              .setDescription(
                "Henüz fikstür oluşturulmamış."
              )
              .setFooter({
                text:
                  "Axera League • Fikstür"
              });

          return message.reply({
            embeds: [embed]
          });
        }

        const lines =
          data.fixtures.map(
            (fixture, index) => {
              const status =
                fixture.status ===
                "TAMAMLANDI"
                  ? `🟢 **${fixture.score1} - ${fixture.score2}**`
                  : "🟡 **Bekliyor**";

              return (
                `**${index + 1}. Maç**\n` +
                `🏟️ ${fixture.team1Name} **vs** ${fixture.team2Name}\n` +
                `⏰ ${fixture.time}\n` +
                `📊 ${status}`
              );
            }
          );

        const embed =
          new EmbedBuilder()
            .setTitle(
              "📅 AXERA LEAGUE • FİKSTÜR"
            )
            .setDescription(
              lines.join("\n\n")
            )
            .setFooter({
              text:
                "Axera League • Fikstür"
            })
            .setTimestamp();

        return message.reply({
          embeds: [embed]
        });
      }
    } catch (error) {
      console.error(
        "Komut hatası:",
        error
      );

      try {
        await message.reply(
          "❌ İşlem sırasında beklenmeyen bir hata oluştu."
        );
      } catch {}
    }
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
// LOGIN
// ======================================================

client.login(TOKEN);
