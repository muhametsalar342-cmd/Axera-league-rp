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

const fs = require("fs");
const path = require("path");

/* =========================================================
   AXERA LEAGUE
   Discord.js v14
========================================================= */

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

/* =========================================================
   ROLLER
========================================================= */

const ROLES = {
  ADMIN: "1544449436011339806",
  REGISTER: "1544452022764568656",
  VALUE: "1544451743746891806",
  MATCH: "1535251168169697390",

  FUTBOLCU: "1534457228986421278",
  KALECI: "1534492034243498195",
  KAYITSIZ: "1534457560134844517",
  TD: "1534456648930693120"
};

/* =========================================================
   KANALLAR
========================================================= */

const CHANNELS = {
  REGISTRATION: "1534460177884123276",
  CHAT: "1534469475917758586",
  TRAINING: "1534474070798762197",
  PENALTY: "1534474327812997192",
  MATCH: "1534477626872168541",
  POINTS: "1534475991404253284",
  TWEET: "1534636658668998716"
};

/* =========================================================
   SINIRLAR
========================================================= */

const MAX_VALUE = 1_000_000_000;
const TRAINING_LIMIT = 10;
const MATCH_DURATION = 270000;
const MATCH_TICK = 3000;
const GAME_MINUTE_PER_TICK = 1;
const FIELD_LENGTH = 100;

/* =========================================================
   VERİ
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
  assists: {},
  matchRewards: {},
  matchPlayers: {}
};

let DATA = loadData();

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(DEFAULT_DATA, null, 2)
      );

      return JSON.parse(
        JSON.stringify(DEFAULT_DATA)
      );
    }

    const parsed = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );

    return {
      ...JSON.parse(JSON.stringify(DEFAULT_DATA)),
      ...parsed
    };
  } catch (error) {
    console.error("data.json hatası:", error);

    try {
      if (fs.existsSync(DATA_FILE)) {
        fs.renameSync(
          DATA_FILE,
          `${DATA_FILE}.broken-${Date.now()}`
        );
      }
    } catch {}

    return JSON.parse(
      JSON.stringify(DEFAULT_DATA)
    );
  }
}

let saveTimer;

function saveData() {
  clearTimeout(saveTimer);

  saveTimer = setTimeout(() => {
    try {
      const temp = `${DATA_FILE}.tmp`;

      fs.writeFileSync(
        temp,
        JSON.stringify(DATA, null, 2)
      );

      fs.renameSync(temp, DATA_FILE);
    } catch (error) {
      console.error("Veri kaydetme hatası:", error);
    }
  }, 250);
}

/* =========================================================
   YARDIMCILAR
========================================================= */

function getUser(guildId, userId) {
  DATA.users[guildId] ??= {};

  DATA.users[guildId][userId] ??= {
    value: 0,
    budget: 0,
    goals: 0,
    assists: 0,
    matches: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    training: 0,
    penaltyGoals: 0
  };

  return DATA.users[guildId][userId];
}

function getTeam(guildId, roleId) {
  DATA.teams[guildId] ??= {};

  DATA.teams[guildId][roleId] ??= {
    id: roleId,
    name: "",
    value: 0,
    players: []
  };

  return DATA.teams[guildId][roleId];
}

function isAdmin(member) {
  return Boolean(
    member &&
    (
      member.permissions.has(
        PermissionsBitField.Flags.Administrator
      ) ||
      member.roles.cache.has(ROLES.ADMIN)
    )
  );
}

function hasRole(member, roleId) {
  return Boolean(
    member &&
    (
      isAdmin(member) ||
      member.roles.cache.has(roleId)
    )
  );
}

/*
  Kayıtsız oyuncular komutları kullanabilir.
  Bu nedenle isRegistered() artık komutları engellemek için
  kullanılmıyor.
*/

function isRegistered(member) {
  if (!member) return false;

  return (
    member.roles.cache.has(ROLES.FUTBOLCU) ||
    member.roles.cache.has(ROLES.KALECI) ||
    member.roles.cache.has(ROLES.TD)
  );
}

function parseAmount(input) {
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
  }

  const n = Number(text);

  return Number.isFinite(n)
    ? n * multiplier
    : NaN;
}

function formatMoney(value) {
  value = Number(value) || 0;

  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000)
      .toFixed(2)
      .replace(/\.00$/, "")}B€`;
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000)
      .toFixed(2)
      .replace(/\.00$/, "")}M€`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000)
      .toFixed(2)
      .replace(/\.00$/, "")}K€`;
  }

  return `${Math.round(value).toLocaleString("tr-TR")}€`;
}

function clampValue(value) {
  return Math.max(
    0,
    Math.min(MAX_VALUE, Number(value) || 0)
  );
}

function randomItem(array) {
  if (!array.length) return null;

  return array[
    Math.floor(Math.random() * array.length)
  ];
}

function mention(id) {
  return `<@${id}>`;
}

function isMatchChannel(message) {
  return message.channel.id === CHANNELS.MATCH;
}

function canManageMatches(member) {
  return hasRole(member, ROLES.MATCH);
}

async function safeDelete(message) {
  try {
    if (message.deletable) {
      await message.delete();
    }
  } catch {}
}

/* =========================================================
   OYUNCU DEĞERİ
========================================================= */

async function updateNickname(member, value) {
  if (!member || !member.manageable) return;

  const oldNickname =
    member.nickname || member.user.username;

  let nickname = oldNickname;

  /*
    Sondaki mevcut M€ değerini bul.
    Örn:
    L.Yamal | 🇪🇸 | SNT | 15M€
  */

  const match = oldNickname.match(
    /^(.*?)(?:\s*\|\s*)?(\d+(?:[.,]\d+)?)\s*M€\s*$/i
  );

  if (match) {
    const prefix = match[1]
      .trim()
      .replace(/\|\s*$/, "")
      .trim();

    nickname =
      `${prefix} | ${formatMoney(value)}`;
  } else {
    nickname =
      `${oldNickname} | ${formatMoney(value)}`;
  }

  nickname = nickname.slice(0, 32);

  await member.setNickname(nickname).catch(() => {});
}

async function changePlayerValue(
  guild,
  userId,
  amount
) {
  const user = getUser(guild.id, userId);

  const oldValue = Number(user.value || 0);

  const newValue = clampValue(
    oldValue + Number(amount || 0)
  );

  user.value = newValue;

  const member = await guild.members
    .fetch(userId)
    .catch(() => null);

  if (member) {
    await updateNickname(
      member,
      newValue
    );
  }

  saveData();

  return {
    oldValue,
    newValue
  };
}

/* =========================================================
   KAYIT PANELİ
========================================================= */

function createRegistrationPanel(
  targetId,
  nickname,
  creatorId
) {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("📋 AXERA LEAGUE KAYIT PANELİ")
        .setDescription(
          `👤 **Üye:** <@${targetId}>\n` +
          `🏷️ **Takma Ad:** ${nickname}\n\n` +
          "Aşağıdaki butonlardan kayıt türünü seçin."
        )
        .setFooter({
          text: "Axera League • Kayıt Sistemi"
        })
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(
            `register:futbolcu:${targetId}:${creatorId}`
          )
          .setLabel("⚽ Futbolcu")
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId(
            `register:kaleci:${targetId}:${creatorId}`
          )
          .setLabel("🧤 Kaleci")
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId(
            `register:td:${targetId}:${creatorId}`
          )
          .setLabel("🧑‍💼 Teknik Direktör")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId(
            `register:uye:${targetId}:${creatorId}`
          )
          .setLabel("👤 Üye")
          .setStyle(ButtonStyle.Success)
      )
    ]
  };
}

/* =========================================================
   INTERACTION
========================================================= */

client.on(
  "interactionCreate",
  async interaction => {
    try {
      if (
        !interaction.isButton() &&
        !interaction.isStringSelectMenu()
      ) {
        return;
      }

      /* ===================================================
         KAYIT BUTONLARI
      =================================================== */

      if (
        interaction.customId.startsWith(
          "register:"
        )
      ) {
        const parts =
          interaction.customId.split(":");

        const type = parts[1];
        const targetId = parts[2];
        const creatorId = parts[3];

        if (
          !hasRole(
            interaction.member,
            ROLES.REGISTER
          )
        ) {
          return interaction.reply({
            content:
              "❌ Bu paneli yalnızca Kayıt Yetkilisi kullanabilir.",
            ephemeral: true
          });
        }

        if (
          interaction.user.id !== creatorId &&
          !isAdmin(interaction.member)
        ) {
          return interaction.reply({
            content:
              "❌ Bu kayıt panelini yalnızca paneli oluşturan yetkili kullanabilir.",
            ephemeral: true
          });
        }

        const member =
          await interaction.guild.members
            .fetch(targetId)
            .catch(() => null);

        if (!member) {
          return interaction.reply({
            content:
              "❌ Üye bulunamadı.",
            ephemeral: true
          });
        }

        const panel =
          DATA.registrationPanels[
            targetId
          ];

        const nickname =
          panel?.nickname ||
          member.displayName;

        for (const roleId of [
          ROLES.KAYITSIZ,
          ROLES.FUTBOLCU,
          ROLES.KALECI,
          ROLES.TD
        ]) {
          await member.roles
            .remove(roleId)
            .catch(() => {});
        }

        const roleMap = {
          futbolcu: ROLES.FUTBOLCU,
          kaleci: ROLES.KALECI,
          td: ROLES.TD
        };

        if (
          type !== "uye" &&
          roleMap[type]
        ) {
          await member.roles
            .add(roleMap[type])
            .catch(() => {});
        }

        if (
          type !== "uye" &&
          nickname
        ) {
          await member.setNickname(
            nickname.slice(0, 32)
          ).catch(() => {});
        }

        getUser(
          interaction.guild.id,
          member.id
        );

        delete DATA.registrationPanels[
          targetId
        ];

        saveData();

        const names = {
          futbolcu: "⚽ Futbolcu",
          kaleci: "🧤 Kaleci",
          td: "🧑‍💼 Teknik Direktör",
          uye: "👤 Üye"
        };

        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0x57f287)
              .setTitle(
                "✅ KAYIT TAMAMLANDI"
              )
              .setDescription(
                `👤 Üye: ${member}\n` +
                `🎫 Tür: **${names[type]}**\n` +
                `🏷️ Takma Ad: **${nickname}**\n` +
                `👮 Yetkili: ${interaction.user}`
              )
          ],
          components: []
        });
      }

      /* ===================================================
         TICKET OLUŞTUR
      =================================================== */

      if (
        interaction.customId ===
        "ticket:create"
      ) {
        const guild =
          interaction.guild;

        const existing =
          guild.channels.cache.find(
            channel =>
              channel.type ===
                ChannelType.GuildText &&
              channel.topic ===
                `ticket:${interaction.user.id}`
          );

        if (existing) {
          return interaction.reply({
            content:
              `❌ Zaten açık ticketın var: ${existing}`,
            ephemeral: true
          });
        }

        const safeName =
          interaction.user.username
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "")
            .slice(0, 60) ||
          "uye";

        const channel =
          await guild.channels.create({
            name: `ticket-${safeName}`,
            type: ChannelType.GuildText,
            topic:
              `ticket:${interaction.user.id}`,
            permissionOverwrites: [
              {
                id:
                  guild.roles.everyone.id,
                deny: [
                  PermissionsBitField.Flags
                    .ViewChannel
                ]
              },
              {
                id:
                  interaction.user.id,
                allow: [
                  PermissionsBitField.Flags
                    .ViewChannel,
                  PermissionsBitField.Flags
                    .SendMessages
                ]
              },
              ...[
                ROLES.ADMIN,
                ROLES.REGISTER,
                ROLES.VALUE,
                ROLES.MATCH
              ].map(roleId => ({
                id: roleId,
                allow: [
                  PermissionsBitField.Flags
                    .ViewChannel,
                  PermissionsBitField.Flags
                    .SendMessages
                ]
              }))
            ]
          }).catch(() => null);

        if (!channel) {
          return interaction.reply({
            content:
              "❌ Ticket oluşturulamadı.",
            ephemeral: true
          });
        }

        DATA.tickets[channel.id] = {
          owner:
            interaction.user.id,
          lastMessage: Date.now()
        };

        saveData();

        await channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0x5865f2)
              .setTitle(
                "🎫 AXERA LEAGUE DESTEK"
              )
              .setDescription(
                `${interaction.user} destek talebin oluşturuldu.\n\n` +
                "Yetkililer en kısa sürede ilgilenecektir.\n" +
                "60 dakika mesaj gelmezse ticket otomatik kapanır."
              )
          ],
          components: [
            new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId(
                    "ticket:close"
                  )
                  .setLabel(
                    "🔒 Ticket Kapat"
                  )
                  .setStyle(
                    ButtonStyle.Danger
                  )
              )
          ]
        });

        return interaction.reply({
          content:
            `✅ Ticket oluşturuldu: ${channel}`,
          ephemeral: true
        });
      }

      /* ===================================================
         TICKET KAPAT
      =================================================== */

      if (
        interaction.customId ===
        "ticket:close"
      ) {
        if (
          !isAdmin(interaction.member)
        ) {
          return interaction.reply({
            content:
              "❌ Ticket kapatma yetkin yok.",
            ephemeral: true
          });
        }

        delete DATA.tickets[
          interaction.channel.id
        ];

        saveData();

        await interaction.reply(
          "🔒 Ticket kapatılıyor..."
        );

        setTimeout(() => {
          interaction.channel
            .delete()
            .catch(() => {});
        }, 1000);

        return;
      }

      /* ===================================================
         FORMASYON
      =================================================== */

      if (
        interaction.customId.startsWith(
          "formation:"
        )
      ) {
        if (
          !canManageMatches(
            interaction.member
          )
        ) {
          return interaction.reply({
            content:
              "❌ Maç Yetkilisi değilsin.",
            ephemeral: true
          });
        }

        const teamId =
          interaction.customId.split(":")[1];

        const formation =
          interaction.values[0];

        DATA.formations[
          interaction.guild.id
        ] ??= {};

        DATA.formations[
          interaction.guild.id
        ][teamId] = formation;

        saveData();

        return interaction.reply({
          content:
            `✅ Formasyon **${formation}** olarak ayarlandı.`,
          ephemeral: true
        });
      }
    } catch (error) {
      console.error(
        "interactionCreate:",
        error
      );

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {
        await interaction.reply({
          content:
            "❌ İşlem sırasında bir hata oluştu.",
          ephemeral: true
        }).catch(() => {});
      }
    }
  }
);

/* =========================================================
   ÜYE GİRİŞİ
========================================================= */

client.on(
  "guildMemberAdd",
  async member => {
    try {
      await member.roles
        .add(ROLES.KAYITSIZ)
        .catch(() => {});

      const channel =
        member.guild.channels.cache.get(
          CHANNELS.REGISTRATION
        );

      if (channel) {
        await channel.send(
          `👋 ${member} hoşgeldin sunucumuza!\n` +
          `📋 <@&${ROLES.REGISTER}> seninle ilgilenecektir.`
        );
      }
    } catch (error) {
      console.error(
        "guildMemberAdd:",
        error
      );
    }
  }
);

/* =========================================================
   CANLI MAÇ OYUNCULARI
========================================================= */

function getRolePlayers(
  guild,
  roleId
) {
  const role =
    guild.roles.cache.get(roleId);

  if (!role) return [];

  return role.members
    .filter(member =>
      !member.user.bot
    )
    .map(member => {
      const user =
        getUser(
          guild.id,
          member.id
        );

      return {
        id: member.id,
        name: member.displayName,
        value: Number(
          user.value || 0
        )
      };
    });
}

function choosePlayer(players) {
  if (!players.length) {
    return null;
  }

  /*
    Değeri yüksek oyuncunun olaylara
    dahil olma ihtimali daha yüksek.
  */

  const total =
    players.reduce(
      (sum, player) =>
        sum +
        Math.max(
          1,
          player.value
        ),
      0
    );

  let random =
    Math.random() * total;

  for (const player of players) {
    random -= Math.max(
      1,
      player.value
    );

    if (random <= 0) {
      return player;
    }
  }

  return players[
    players.length - 1
  ];
}

function chooseAssist(
  players,
  scorerId
) {
  const available =
    players.filter(
      p => p.id !== scorerId
    );

  if (!available.length) {
    return null;
  }

  return choosePlayer(
    available
  );
}

/* =========================================================
   MAÇ ANLATIMLARI
========================================================= */

const MATCH_COMMENTARY = [
  "🎙️ Top orta sahada dolaşıyor.",
  "⚽ Oyuncular oyunu kurmaya çalışıyor.",
  "🛡️ Savunma araya girdi.",
  "⚡ Kanattan hızlı bir atak gelişiyor.",
  "🎯 Forvet ceza sahasına yaklaşıyor.",
  "🧤 Kaleci pozisyonunu aldı.",
  "🔄 Orta saha oyunun temposunu yükseltiyor.",
  "💨 Kanatta rakibini geçen oyuncu ileri çıktı.",
  "🧠 Takım pas trafiğini hızlandırıyor.",
  "🔥 Mücadele iyice kızıştı.",
  "📣 Tribünler hareketlendi!",
  "👀 Rakip savunma dikkatli.",
  "⚔️ İki takım orta sahada top için mücadele ediyor.",
  "🏃 Hızlı bir kontra atak başladı.",
  "🎯 Ceza sahasına doğru tehlikeli bir pas.",
  "🧤 Kaleci topu kontrol etti."
];

const DEFENSIVE_EVENTS = [
  "🛡️ Savunma son anda müdahale etti!",
  "🧤 Kaleci tehlikeyi uzaklaştırdı!",
  "🚫 Savunma oyuncusu atağı kesti!",
  "⚠️ Rakip atak tehlikeli olmadan durduruldu!"
];

function matchEmbed(match) {
  const minute = Math.min(
    90,
    match.minute
  );

  const events =
    match.events.length
      ? match.events
          .slice(-10)
          .reverse()
          .join("\n")
      : "⏳ Maç başladı...";

  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(
      `🔴 CANLI MAÇ • ${minute}'`
    )
    .setDescription(
      `🏟️ **Axera Arena**\n` +
      `📏 Saha uzunluğu: **${FIELD_LENGTH} metre**\n\n` +
      `# ${match.teamA.name} ${match.scoreA} - ${match.scoreB} ${match.teamB.name}\n\n` +
      `🎙️ **CANLI ANLATIM**\n${events}`
    )
    .addFields(
      {
        name: "💰 Takım Değerleri",
        value:
          `${match.teamA.name}: **${formatMoney(
            match.teamA.value
          )}**\n` +
          `${match.teamB.name}: **${formatMoney(
            match.teamB.value
          )}**`,
        inline: true
      },
      {
        name: "👥 Oyuncular",
        value:
          `⚽ ${match.teamA.players.length}\n` +
          `⚽ ${match.teamB.players.length}`,
        inline: true
      },
      {
        name: "📊 Olay",
        value:
          `${match.events.length}`,
        inline: true
      }
    )
    .setFooter({
      text:
        "Axera League • Canlı Maç Sistemi"
    })
    .setTimestamp();
}

/* =========================================================
   MAÇ BAŞLAT
========================================================= */

async function startMatch(
  guild,
  channel,
  roleA,
  roleB
) {
  DATA.activeMatches[guild.id] ??= {};

  if (
    DATA.activeMatches[
      guild.id
    ][roleA.id]
  ) {
    return channel.send(
      `❌ ${roleA} zaten canlı maçta.`
    );
  }

  if (
    DATA.activeMatches[
      guild.id
    ][roleB.id]
  ) {
    return channel.send(
      `❌ ${roleB} zaten canlı maçta.`
    );
  }

  const teamA = {
    id: roleA.id,
    name: roleA.name,
    value: Number(
      getTeam(
        guild.id,
        roleA.id
      ).value || 0
    ),
    players:
      getRolePlayers(
        guild,
        roleA.id
      )
  };

  const teamB = {
    id: roleB.id,
    name: roleB.name,
    value: Number(
      getTeam(
        guild.id,
        roleB.id
      ).value || 0
    ),
    players:
      getRolePlayers(
        guild,
        roleB.id
      )
  };

  const match = {
    id:
      `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`,

    guildId: guild.id,
    channelId: channel.id,

    teamA,
    teamB,

    scoreA: 0,
    scoreB: 0,

    minute: 0,
    events: [
      "⏱️ Hakem düdüğü çaldı!",
      "⚽ Maç başladı, top orta noktada."
    ],

    messageId: null
  };

  DATA.activeMatches[
    guild.id
  ][roleA.id] = match.id;

  DATA.activeMatches[
    guild.id
  ][roleB.id] = match.id;

  DATA._matches ??= {};
  DATA._matches[match.id] =
    match;

  /*
    Maçta oynayan oyuncuların listesi
  */

  DATA.matchPlayers[
    match.id
  ] = [
    ...teamA.players.map(
      p => p.id
    ),
    ...teamB.players.map(
      p => p.id
    )
  ];

  saveData();

  const message =
    await channel.send({
      content:
        `🔴 **CANLI MAÇ BAŞLADI!**\n\n` +
        `${roleA} 🆚 ${roleB}`,
      embeds: [
        matchEmbed(match)
      ]
    });

  match.messageId =
    message.id;

  const interval =
    setInterval(async () => {
      try {
        match.minute +=
          GAME_MINUTE_PER_TICK;

        /*
          Her dakikada oyunculu olay
        */

        const attackTeam =
          Math.random() < 0.5
            ? "A"
            : "B";

        const attacking =
          attackTeam === "A"
            ? teamA
            : teamB;

        const defending =
          attackTeam === "A"
            ? teamB
            : teamA;

        /*
          Takım değeri üstünlüğü
        */

        const totalValue =
          Math.max(
            1,
            teamA.value +
              teamB.value
          );

        const strengthA =
          teamA.value /
          totalValue;

        const strengthB =
          teamB.value /
          totalValue;

        let goalChanceA =
          0.027 *
          (0.65 +
            strengthA *
              0.7);

        let goalChanceB =
          0.027 *
          (0.65 +
            strengthB *
              0.7);

        /*
          Oyuncu yoksa gol ihtimali düşürülür,
          ancak maç tamamen durmaz.
        */

        if (
          teamA.players.length === 0
        ) {
          goalChanceA *= 0.65;
        }

        if (
          teamB.players.length === 0
        ) {
          goalChanceB *= 0.65;
        }

        let goal = null;

        if (
          Math.random() <
          goalChanceA
        ) {
          goal = "A";
        } else if (
          Math.random() <
          goalChanceB
        ) {
          goal = "B";
        }

        /*
          Gol
        */

        if (goal) {
          const team =
            goal === "A"
              ? teamA
              : teamB;

          const scorer =
            choosePlayer(
              team.players
            );

          const assister =
            scorer
              ? chooseAssist(
                  team.players,
                  scorer.id
                )
              : null;

          if (goal === "A") {
            match.scoreA++;
          } else {
            match.scoreB++;
          }

          if (scorer) {
            const user =
              getUser(
                guild.id,
                scorer.id
              );

            user.goals++;

            const result =
              await changePlayerValue(
                guild,
                scorer.id,
                2_000_000
              );

            match.events.push(
              `⚽ **GOOOL!** ${mention(
                scorer.id
              )} topu ağlara gönderdi! **+2M€**`
            );

            match.events.push(
              `📈 ${mention(
                scorer.id
              )} yeni değeri: **${formatMoney(
                result.newValue
              )}**`
            );
          } else {
            match.events.push(
              `⚽ **GOOOL!** ${team.name} skoru değiştirdi!`
            );
          }

          if (assister) {
            const assistUser =
              getUser(
                guild.id,
                assister.id
              );

            assistUser.assists++;

            const result =
              await changePlayerValue(
                guild,
                assister.id,
                1_000_000
              );

            match.events.push(
              `👟 ${mention(
                assister.id
              )} asist yaptı! **+1M€**`
            );

            match.events.push(
              `📈 Asist yapan oyuncunun yeni değeri: **${formatMoney(
                result.newValue
              )}**`
            );
          }

          match.events.push(
            `📣 Skor şimdi: **${teamA.name} ${match.scoreA}-${match.scoreB} ${teamB.name}**`
          );
        } else {
          /*
            Oyuncu bazlı normal olay
          */

          if (
            attacking.players.length &&
            Math.random() <
              0.72
          ) {
            const player =
              choosePlayer(
                attacking.players
              );

            const event =
              randomItem([
                `🏃 ${mention(
                  player.id
                )} kanattan ilerliyor.`,
                `🎯 ${mention(
                  player.id
                )} kaleye doğru şut pozisyonu arıyor.`,
                `⚡ ${mention(
                  player.id
                )} rakibini geçiyor!`,
                `👟 ${mention(
                  player.id
                )} takım arkadaşına pas verdi.`,
                `🔥 ${mention(
                  player.id
                )} hücumda etkili.`,
                `🧠 ${mention(
                  player.id
                )} oyunu yönlendiriyor.`
              ]);

            match.events.push(
              event
            );
          } else if (
            defending.players.length
          ) {
            const player =
              choosePlayer(
                defending.players
              );

            match.events.push(
              `🛡️ ${mention(
                player.id
              )} savunmada önemli müdahale yaptı!`
            );
          } else {
            match.events.push(
              randomItem(
                MATCH_COMMENTARY
              )
            );
          }
        }

        /*
          Özel savunma olayı
        */

        if (
          Math.random() <
          0.12
        ) {
          match.events.push(
            randomItem(
              DEFENSIVE_EVENTS
            )
          );
        }

        const live =
          await channel.messages
            .fetch(
              match.messageId
            )
            .catch(() => null);

        if (live) {
          await live.edit({
            embeds: [
              matchEmbed(match)
            ]
          });
        }

        if (
          match.minute >= 90
        ) {
          clearInterval(
            interval
          );

          await finishMatch(
            guild,
            channel,
            match
          );
        }
      } catch (error) {
        console.error(
          "Maç sistemi:",
          error
        );

        clearInterval(
          interval
        );
      }
    }, MATCH_TICK);

  return match;
}

/* =========================================================
   MAÇ BİTİR
========================================================= */

async function finishMatch(
  guild,
  channel,
  match
) {
  let result;

  if (
    match.scoreA >
    match.scoreB
  ) {
    result = "A";
  } else if (
    match.scoreB >
    match.scoreA
  ) {
    result = "B";
  } else {
    result = "DRAW";
  }

  match.events.push(
    "⏱️ **90'** Hakem son düdüğü çaldı!"
  );

  match.events.push(
    `🏁 Maç sona erdi: **${match.teamA.name} ${match.scoreA}-${match.scoreB} ${match.teamB.name}**`
  );

  /*
    Maçta bulunan HER OYUNCU +5M€
  */

  const matchPlayers =
    DATA.matchPlayers[
      match.id
    ] || [];

  for (
    const playerId of matchPlayers
  ) {
    const user =
      getUser(
        guild.id,
        playerId
      );

    user.matches++;

    await changePlayerValue(
      guild,
      playerId,
      5_000_000
    );
  }

  /*
    Oyuncu galibiyet istatistikleri
  */

  if (result === "A") {
    for (
      const player of
      match.teamA.players
    ) {
      getUser(
        guild.id,
        player.id
      ).wins++;
    }

    for (
      const player of
      match.teamB.players
    ) {
      getUser(
        guild.id,
        player.id
      ).losses++;
    }
  } else if (
    result === "B"
  ) {
    for (
      const player of
      match.teamB.players
    ) {
      getUser(
        guild.id,
        player.id
      ).wins++;
    }

    for (
      const player of
      match.teamA.players
    ) {
      getUser(
        guild.id,
        player.id
      ).losses++;
    }
  } else {
    for (
      const player of [
        ...match.teamA.players,
        ...match.teamB.players
      ]
    ) {
      getUser(
        guild.id,
        player.id
      ).draws++;
    }
  }

  /* =======================================================
     PUAN TABLOSU
  ======================================================= */

  DATA.standings[
    guild.id
  ] ??= {};

  function standing(role) {
    DATA.standings[
      guild.id
    ][role.id] ??= {
      name: role.name,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      goalsFor: 0,
      goalsAgainst: 0
    };

    return DATA.standings[
      guild.id
    ][role.id];
  }

  const a =
    standing(
      guild.roles.cache.get(
        match.teamA.id
      )
    );

  const b =
    standing(
      guild.roles.cache.get(
        match.teamB.id
      )
    );

  a.played++;
  b.played++;

  a.goalsFor +=
    match.scoreA;

  a.goalsAgainst +=
    match.scoreB;

  b.goalsFor +=
    match.scoreB;

  b.goalsAgainst +=
    match.scoreA;

  if (result === "A") {
    a.wins++;
    a.points += 3;
    b.losses++;
  } else if (
    result === "B"
  ) {
    b.wins++;
    b.points += 3;
    a.losses++;
  } else {
    a.draws++;
    b.draws++;
    a.points++;
    b.points++;
  }

  delete DATA.activeMatches[
    guild.id
  ][match.teamA.id];

  delete DATA.activeMatches[
    guild.id
  ][match.teamB.id];

  delete DATA._matches[
    match.id
  ];

  saveData();

  const finalEmbed =
    new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(
        "🏁 MAÇ TAMAMLANDI"
      )
      .setDescription(
        `🏟️ **Axera Arena**\n` +
        `📏 Saha: **${FIELD_LENGTH} metre**\n\n` +
        `# ${match.teamA.name} ${match.scoreA}-${match.scoreB} ${match.teamB.name}\n\n` +
        `🎙️ **MAÇ ANLATIMI**\n` +
        match.events
          .slice(-15)
          .reverse()
          .join("\n")
      )
      .addFields({
        name:
          "💰 Maç Ödülleri",
        value:
          "👥 Maçta oynayan her oyuncu: **+5M€**\n" +
          "⚽ Gol atan oyuncu: **+2M€**\n" +
          "👟 Asist yapan oyuncu: **+1M€**"
      })
      .setFooter({
        text:
          "Axera League • Maç Sonucu"
      })
      .setTimestamp();

  const liveMessage =
    await channel.messages
      .fetch(match.messageId)
      .catch(() => null);

  if (liveMessage) {
    await liveMessage.edit({
      content:
        "🏁 **MAÇ TAMAMLANDI**",
      embeds: [
        finalEmbed
      ]
    });
  }

  await channel.send(
    `🏁 **MAÇ BİTTİ!**\n\n` +
    `⚽ ${match.teamA.name} **${match.scoreA}-${match.scoreB}** ${match.teamB.name}\n\n` +
    `💰 Maçta yer alan oyuncuların tamamına **+5M€ değer** verildi.`
  );

  delete DATA.matchPlayers[
    match.id
  ];

  saveData();
}

/* =========================================================
   MESAJ SİSTEMİ
========================================================= */

client.on(
  "messageCreate",
  async message => {
    try {
      if (!message.guild) return;
      if (message.author.bot) return;

      /*
        Ticket aktivitesi
      */

      if (
        DATA.tickets[
          message.channel.id
        ]
      ) {
        DATA.tickets[
          message.channel.id
        ].lastMessage =
          Date.now();

        saveData();
      }

      if (
        !message.content.startsWith(
          PREFIX
        )
      ) {
        return;
      }

      const content =
        message.content
          .slice(PREFIX.length)
          .trim();

      if (!content) return;

      const parts =
        content.split(/\s+/);

      const command =
        parts.shift()
          .toLowerCase();

      const args = parts;

      /* ===================================================
         KAYIT
      =================================================== */

      if (command === "k") {
        if (
          message.channel.id !==
          CHANNELS.REGISTRATION
        ) {
          return message.reply(
            "❌ `.k` sadece kayıt kanalında kullanılabilir."
          );
        }

        if (
          !hasRole(
            message.member,
            ROLES.REGISTER
          )
        ) {
          return message.reply(
            "❌ Bu komutu yalnızca Kayıt Yetkilisi kullanabilir."
          );
        }

        const target =
          message.mentions.members
            .first();

        const nickname =
          args
            .filter(
              x =>
                !x.startsWith("<@")
            )
            .join(" ")
            .trim();

        if (
          !target ||
          !nickname
        ) {
          return message.reply(
            "❌ Kullanım: `.k @Oyuncu TakmaAdı`"
          );
        }

        DATA.registrationPanels[
          target.id
        ] = {
          nickname:
            nickname.slice(0, 32),
          createdBy:
            message.author.id,
          createdAt:
            Date.now()
        };

        saveData();

        return message.channel.send(
          createRegistrationPanel(
            target.id,
            nickname,
            message.author.id
          )
        );
      }

      /* ===================================================
         KAYITSIZ VER
      =================================================== */

      if (
        command === "kayıtsızver" ||
        command === "kayitsizver"
      ) {
        if (
          !hasRole(
            message.member,
            ROLES.REGISTER
          )
        ) {
          return message.reply(
            "❌ Kayıt Yetkilisi değilsin."
          );
        }

        const target =
          message.mentions.members
            .first();

        if (!target) {
          return message.reply(
            "❌ Kullanım: `.kayıtsızver @Oyuncu`"
          );
        }

        for (
          const roleId of [
            ROLES.FUTBOLCU,
            ROLES.KALECI,
            ROLES.TD
          ]
        ) {
          await target.roles
            .remove(roleId)
            .catch(() => {});
        }

        await target.roles
          .add(ROLES.KAYITSIZ)
          .catch(() => {});

        return message.reply(
          `✅ ${target} kayıtsız durumuna getirildi.`
        );
      }

      /* ===================================================
         ROL PANELİ
      =================================================== */

      if (
        command === "rolpanel"
      ) {
        if (
          !isAdmin(message.member)
        ) {
          return message.reply(
            "❌ Bu komutu sadece yönetici kullanabilir."
          );
        }

        const channel =
          message.guild.channels.cache.get(
            CHANNELS.REGISTRATION
          );

        if (!channel) {
          return message.reply(
            "❌ Kayıt kanalı bulunamadı."
          );
        }

        await channel.send(
          createRegistrationPanel(
            message.author.id,
            "Kayıt paneli",
            message.author.id
          )
        );

        return message.reply(
          "✅ Kayıt paneli gönderildi."
        );
      }

      /* ===================================================
         TWEET
      =================================================== */

      if (
        command === "tweet"
      ) {
        if (
          message.channel.id !==
          CHANNELS.TWEET
        ) {
          return message.reply(
            `❌ Tweet komutu sadece <#${CHANNELS.TWEET}> kanalında kullanılabilir.`
          );
        }

        const text =
          args.join(" ").trim();

        if (!text) {
          return message.reply(
            "❌ Kullanım: `.tweet Mesajın`"
          );
        }

        /*
          Komut mesajını tamamen siliyoruz.
        */

        await safeDelete(message);

        const now =
          Date.now();

        const last =
          Number(
            DATA.tweetCooldowns[
              message.author.id
            ] || 0
          );

        const DAY =
          24 * 60 * 60 * 1000;

        const rewardAvailable =
          now - last >= DAY;

        const embed =
          new EmbedBuilder()
            .setColor(0x1da1f2)
            .setAuthor({
              name:
                message.member
                  ?.displayName ||
                message.author.username,
              iconURL:
                message.author
                  .displayAvatarURL()
            })
            .setDescription(
              text
            )
            .setFooter({
              text:
                "Axera League • Tweet"
            })
            .setTimestamp();

        await message.channel.send({
          embeds: [embed]
        });

        /*
          İlk tweet / son ödülden 24 saat sonra
          +5M€.
          24 saat dolmadan tweet atılabilir,
          ancak değer ödülü verilmez.
        */

        if (
          rewardAvailable
        ) {
          const result =
            await changePlayerValue(
              message.guild,
              message.author.id,
              5_000_000
            );

          DATA.tweetCooldowns[
            message.author.id
          ] = now;

          saveData();

          await message.channel.send(
            `💰 ${message.author} tweet ödülü kazandı: **+5M€**\n` +
            `📈 Yeni değer: **${formatMoney(
              result.newValue
            )}**`
          );
        }

        return;
      }

      /* ===================================================
         DEĞER VER / SİL
      =================================================== */

      if (
        command === "dver" ||
        command === "dsil"
      ) {
        if (
          !hasRole(
            message.member,
            ROLES.VALUE
          )
        ) {
          return message.reply(
            "❌ Değer Yetkilisi değilsin."
          );
        }

        const target =
          message.mentions.users
            .first();

        const amount =
          parseAmount(
            args.find(
              x =>
                !x.startsWith("<@")
            )
          );

        if (
          !target ||
          !Number.isFinite(amount) ||
          amount <= 0
        ) {
          return message.reply(
            `❌ Kullanım: \`.${command} @Oyuncu 5M\``
          );
        }

        const result =
          await changePlayerValue(
            message.guild,
            target.id,
            command === "dver"
              ? amount
              : -amount
          );

        return message.reply(
          `✅ ${target} yeni değeri: **${formatMoney(
            result.newValue
          )}**`
        );
      }

      /* ===================================================
         ANTRENMAN
      =================================================== */

      if (
        command === "ant" ||
        command === "antrenman"
      ) {
        if (
          message.channel.id !==
          CHANNELS.TRAINING
        ) {
          return message.reply(
            "❌ Antrenman komutu sadece antrenman kanalında kullanılabilir."
          );
        }

        DATA.training[
          message.guild.id
        ] ??= {};

        const current =
          Number(
            DATA.training[
              message.guild.id
            ][
              message.author.id
            ] || 0
          );

        const progress =
          current + 1;

        if (
          progress >=
          TRAINING_LIMIT
        ) {
          DATA.training[
            message.guild.id
          ][
            message.author.id
          ] = 0;

          const result =
            await changePlayerValue(
              message.guild,
              message.author.id,
              3_000_000
            );

          const user =
            getUser(
              message.guild.id,
              message.author.id
            );

          user.training++;

          saveData();

          return message.reply(
            `🏋️ **ANTRENMAN TAMAMLANDI!**\n\n` +
            `📈 İlerleme: **10/10**\n` +
            `💰 Ödül: **+3M€**\n` +
            `📊 Yeni değer: **${formatMoney(
              result.newValue
            )}**`
          );
        }

        DATA.training[
          message.guild.id
        ][
          message.author.id
        ] = progress;

        saveData();

        return message.reply(
          `🏋️ Antrenman yapıldı!\n` +
          `📈 İlerleme: **${progress}/10**`
        );
      }

      /* ===================================================
         PENALTI
      =================================================== */

      if (
        command === "pen" ||
        command === "penaltı" ||
        command === "penalti"
      ) {
        if (
          message.channel.id !==
          CHANNELS.PENALTY
        ) {
          return message.reply(
            "❌ Penaltı komutu sadece penaltı kanalında kullanılabilir."
          );
        }

        const random =
          Math.random();

        if (
          random < 0.50
        ) {
          const result =
            await changePlayerValue(
              message.guild,
              message.author.id,
              5_000_000
            );

          const user =
            getUser(
              message.guild.id,
              message.author.id
            );

          user.penaltyGoals++;

          saveData();

          return message.reply(
            `🥅 **GOOOL!** ⚽\n` +
            `🧤 Axera Kalecisi topa uzandı fakat yetişemedi!\n\n` +
            `💰 **+5M€ değer**\n` +
            `📈 Yeni değer: **${formatMoney(
              result.newValue
            )}**`
          );
        }

        if (
          random < 0.75
        ) {
          return message.reply(
            `💥 **DİREK!**\n` +
            `Top direkten döndü!`
          );
        }

        return message.reply(
          `🧤 **KURTARDI!**\n` +
          `Axera Kalecisi penaltıyı çıkardı!`
        );
      }

      /* ===================================================
         MAÇ
      =================================================== */

      if (
        command === "maç" ||
        command === "mac"
      ) {
        if (
          !isMatchChannel(message)
        ) {
          return message.reply(
            "❌ `.mac` sadece maç kanalında kullanılabilir."
          );
        }

        if (
          !canManageMatches(
            message.member
          )
        ) {
          return message.reply(
            "❌ Maç Yetkilisi değilsin."
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
            "❌ Kullanım: `.mac @Takım1 @Takım2`"
          );
        }

        const teamA =
          roles[0];

        const teamB =
          roles[1];

        if (
          teamA.id ===
          teamB.id
        ) {
          return message.reply(
            "❌ Aynı takım kendiyle oynayamaz."
          );
        }

        return startMatch(
          message.guild,
          message.channel,
          teamA,
          teamB
        );
      }

      /* ===================================================
         TAKIM EKLE
      =================================================== */

      if (
        command ===
          "takımekle" ||
        command ===
          "takimekle"
      ) {
        if (
          !canManageMatches(
            message.member
          )
        ) {
          return message.reply(
            "❌ Maç Yetkilisi değilsin."
          );
        }

        const role =
          message.mentions.roles
            .first();

        if (!role) {
          return message.reply(
            "❌ Kullanım: `.takımekle @Takım`"
          );
        }

        const team =
          getTeam(
            message.guild.id,
            role.id
          );

        team.name =
          role.name;

        DATA.standings[
          message.guild.id
        ] ??= {};

        DATA.standings[
          message.guild.id
        ][role.id] ??= {
          name: role.name,
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          points: 0,
          goalsFor: 0,
          goalsAgainst: 0
        };

        saveData();

        return message.reply(
          `✅ **${role.name}** lige eklendi.`
        );
      }

      /* ===================================================
         TAKIM DEĞERİ
      =================================================== */

      if (
        command ===
          "takımdeğer" ||
        command ===
          "takimdeger"
      ) {
        if (
          !canManageMatches(
            message.member
          )
        ) {
          return message.reply(
            "❌ Maç Yetkilisi değilsin."
          );
        }

        const role =
          message.mentions.roles
            .first();

        const amount =
          parseAmount(
            args.find(
              x =>
                !x.startsWith("<@")
            )
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
          getTeam(
            message.guild.id,
            role.id
          );

        team.name =
          role.name;

        team.value =
          Math.min(
            MAX_VALUE,
            amount
          );

        saveData();

        return message.reply(
          `💰 **${role.name}** takım değeri: **${formatMoney(
            team.value
          )}**`
        );
      }

      /* ===================================================
         KADRO EKLE
      =================================================== */

      if (
        command ===
          "kadroekle"
      ) {
        if (
          !canManageMatches(
            message.member
          )
        ) {
          return message.reply(
            "❌ Maç Yetkilisi değilsin."
          );
        }

        const role =
          message.mentions.roles
            .first();

        const player =
          message.mentions.members
            .first();

        if (
          !role ||
          !player
        ) {
          return message.reply(
            "❌ Kullanım: `.kadroekle @Takım @Oyuncu`"
          );
        }

        const team =
          getTeam(
            message.guild.id,
            role.id
          );

        team.name =
          role.name;

        if (
          !team.players.includes(
            player.id
          )
        ) {
          team.players.push(
            player.id
          );
        }

        saveData();

        return message.reply(
          `✅ ${player} **${role.name}** kadrosuna eklendi.`
        );
      }

      /* ===================================================
         KADRO ÇIKAR
      =================================================== */

      if (
        command ===
          "kadrocikar" ||
        command ===
          "kadrocıkar"
      ) {
        if (
          !canManageMatches(
            message.member
          )
        ) {
          return message.reply(
            "❌ Maç Yetkilisi değilsin."
          );
        }

        const role =
          message.mentions.roles
            .first();

        const player =
          message.mentions.members
            .first();

        if (
          !role ||
          !player
        ) {
          return message.reply(
            "❌ Kullanım: `.kadrocikar @Takım @Oyuncu`"
          );
        }

        const team =
          getTeam(
            message.guild.id,
            role.id
          );

        team.players =
          team.players.filter(
            id =>
              id !== player.id
          );

        saveData();

        return message.reply(
          `✅ ${player} **${role.name}** kadrosundan çıkarıldı.`
        );
      }

      /* ===================================================
         KADRO
      =================================================== */

      if (
        command === "kadro"
      ) {
        const role =
          message.mentions.roles
            .first();

        if (!role) {
          return message.reply(
            "❌ Kullanım: `.kadro @Takım`"
          );
        }

        const team =
          getTeam(
            message.guild.id,
            role.id
          );

        const players =
          role.members.filter(
            m => !m.user.bot
          );

        if (
          !players.size
        ) {
          return message.reply(
            "📭 Takımda oyuncu bulunamadı."
          );
        }

        const lines = [];

        let total = 0;

        for (
          const member of
          players.values()
        ) {
          const user =
            getUser(
              message.guild.id,
              member.id
            );

          total +=
            user.value;

          lines.push(
            `⚽ ${member} — **${formatMoney(
              user.value
            )}**`
          );
        }

        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(
                0x5865f2
              )
              .setTitle(
                `⚽ ${role.name} KADROSU`
              )
              .setDescription(
                lines.join("\n")
              )
              .addFields({
                name:
                  "💰 Toplam Oyuncu Değeri",
                value:
                  formatMoney(total)
              })
          ]
        });
      }

      /* ===================================================
         FORMASYON
      =================================================== */

      if (
        command ===
          "formasyon"
      ) {
        if (
          !canManageMatches(
            message.member
          )
        ) {
          return message.reply(
            "❌ Maç Yetkilisi değilsin."
          );
        }

        const role =
          message.mentions.roles
            .first();

        if (!role) {
          return message.reply(
            "❌ Kullanım: `.formasyon @Takım`"
          );
        }

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

        const menu =
          new StringSelectMenuBuilder()
            .setCustomId(
              `formation:${role.id}`
            )
            .setPlaceholder(
              "Formasyon seç"
            )
            .addOptions(
              formations.map(
                formation => ({
                  label:
                    formation,
                  value:
                    formation,
                  description:
                    `${formation} formasyonu`
                })
              )
            );

        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(
                0x5865f2
              )
              .setTitle(
                `📋 ${role.name} FORMASYON`
              )
              .setDescription(
                "Aşağıdan formasyon seç."
              )
          ],
          components: [
            new ActionRowBuilder()
              .addComponents(
                menu
              )
          ]
        });
      }

      /* ===================================================
         PUAN
      =================================================== */

      if (
        command === "puan"
      ) {
        const standings =
          Object.values(
            DATA.standings[
              message.guild.id
            ] || {}
          );

        if (
          !standings.length
        ) {
          return message.reply(
            "📭 Henüz puan tablosu bulunmuyor."
          );
        }

        standings.sort(
          (a, b) => {
            const avA =
              a.goalsFor -
              a.goalsAgainst;

            const avB =
              b.goalsFor -
              b.goalsAgainst;

            return (
              b.points -
                a.points ||
              avB - avA ||
              b.goalsFor -
                a.goalsFor
            );
          }
        );

        const text =
          standings
            .map(
              (team, index) =>
                `**${index + 1}. ${team.name}**\n` +
                `P: **${team.points}** • ` +
                `O: **${team.played}** • ` +
                `G: **${team.wins}** • ` +
                `B: **${team.draws}** • ` +
                `M: **${team.losses}** • ` +
                `AV: **${team.goalsFor -
                  team.goalsAgainst}**`
            )
            .join("\n\n");

        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(
                0xf1c40f
              )
              .setTitle(
                "🏆 AXERA LEAGUE PUAN DURUMU"
              )
              .setDescription(
                text
              )
          ]
        });
      }

      /* ===================================================
         BÜTÇE
      =================================================== */

      if (
        command ===
          "bütçe" ||
        command ===
          "butce"
      ) {
        const target =
          message.mentions.users
            .first() ||
          message.author;

        const user =
          getUser(
            message.guild.id,
            target.id
          );

        return message.reply(
          `💵 ${target} kişisel bütçesi: **${formatMoney(
            user.budget
          )}**`
        );
      }

      /* ===================================================
         PARA EKLE
      =================================================== */

      if (
        command ===
          "paraekle"
      ) {
        if (
          !hasRole(
            message.member,
            ROLES.VALUE
          )
        ) {
          return message.reply(
            "❌ Değer Yetkilisi değilsin."
          );
        }

        const target =
          message.mentions.users
            .first();

        const amount =
          parseAmount(
            args.find(
              x =>
                !x.startsWith("<@")
            )
          );

        if (
          !target ||
          !Number.isFinite(
            amount
          ) ||
          amount <= 0
        ) {
          return message.reply(
            "❌ Kullanım: `.paraekle @Oyuncu 50M`"
          );
        }

        const user =
          getUser(
            message.guild.id,
            target.id
          );

        user.budget +=
          amount;

        saveData();

        return message.reply(
          `✅ ${target} bütçesine **${formatMoney(
            amount
          )}** eklendi.`
        );
      }

      /* ===================================================
         PARA SİL
      =================================================== */

      if (
        command ===
          "parasil"
      ) {
        if (
          !hasRole(
            message.member,
            ROLES.VALUE
          )
        ) {
          return message.reply(
            "❌ Değer Yetkilisi değilsin."
          );
        }

        const target =
          message.mentions.users
            .first();

        const amount =
          parseAmount(
            args.find(
              x =>
                !x.startsWith("<@")
            )
          );

        if (
          !target ||
          !Number.isFinite(
            amount
          ) ||
          amount <= 0
        ) {
          return message.reply(
            "❌ Kullanım: `.parasil @Oyuncu 20M`"
          );
        }

        const user =
          getUser(
            message.guild.id,
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
          `✅ ${target} bütçesinden **${formatMoney(
            amount
          )}** silindi.`
        );
      }

      /* ===================================================
         PARA AYARLA
      =================================================== */

      if (
        command ===
          "paraayarla"
      ) {
        if (
          !hasRole(
            message.member,
            ROLES.VALUE
          )
        ) {
          return message.reply(
            "❌ Değer Yetkilisi değilsin."
          );
        }

        const target =
          message.mentions.users
            .first();

        const amount =
          parseAmount(
            args.find(
              x =>
                !x.startsWith("<@")
            )
          );

        if (
          !target ||
          !Number.isFinite(
            amount
          ) ||
          amount < 0
        ) {
          return message.reply(
            "❌ Kullanım: `.paraayarla @Oyuncu 100M`"
          );
        }

        getUser(
          message.guild.id,
          target.id
        ).budget =
          amount;

        saveData();

        return message.reply(
          `✅ ${target} bütçesi **${formatMoney(
            amount
          )}** olarak ayarlandı.`
        );
      }

      /* ===================================================
         PARA GÖNDER
      =================================================== */

      if (
        command ===
          "gönder" ||
        command ===
          "gonder"
      ) {
        const target =
          message.mentions.users
            .first();

        const amount =
          parseAmount(
            args.find(
              x =>
                !x.startsWith("<@")
            )
          );

        if (
          !target ||
          !Number.isFinite(
            amount
          ) ||
          amount <= 0
        ) {
          return message.reply(
            "❌ Kullanım: `.gönder @Oyuncu 50M`"
          );
        }

        if (
          target.id ===
          message.author.id
        ) {
          return message.reply(
            "❌ Kendine para gönderemezsin."
          );
        }

        const sender =
          getUser(
            message.guild.id,
            message.author.id
          );

        const receiver =
          getUser(
            message.guild.id,
            target.id
          );

        if (
          sender.budget <
          amount
        ) {
          return message.reply(
            "❌ Yeterli bütçen yok."
          );
        }

        sender.budget -=
          amount;

        receiver.budget +=
          amount;

        saveData();

        return message.reply(
          `✅ ${target} kullanıcısına **${formatMoney(
            amount
          )}** gönderildi.`
        );
      }

      /* ===================================================
         PROFİL
      =================================================== */

      if (
        command ===
          "profil"
      ) {
        const target =
          message.mentions.users
            .first() ||
          message.author;

        const user =
          getUser(
            message.guild.id,
            target.id
          );

        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(
                0x5865f2
              )
              .setTitle(
                `⚽ ${target.username}`
              )
              .setThumbnail(
                target.displayAvatarURL()
              )
              .setDescription(
                `👤 Oyuncu: ${target}\n\n` +
                `💰 Değer: **${formatMoney(
                  user.value
                )}**\n` +
                `💵 Bütçe: **${formatMoney(
                  user.budget
                )}**\n` +
                `⚽ Gol: **${user.goals}**\n` +
                `👟 Asist: **${user.assists}**\n` +
                `🏟️ Maç: **${user.matches}**\n` +
                `🏆 Galibiyet: **${user.wins}**\n` +
                `🤝 Beraberlik: **${user.draws}**\n` +
                `❌ Mağlubiyet: **${user.losses}**\n` +
                `🏋️ Antrenman: **${user.training}**\n` +
                `🥅 Penaltı Golü: **${user.penaltyGoals}**`
              )
          ]
        });
      }

      /* ===================================================
         ARA
      =================================================== */

      if (
        command === "ara"
      ) {
        const query =
          args.join(" ")
            .trim()
            .toLowerCase();

        if (!query) {
          return message.reply(
            "❌ Kullanım: `.ara OyuncuAdı`"
          );
        }

        const members =
          await message.guild.members
            .fetch()
            .catch(() =>
              message.guild.members.cache
            );

        const results =
          members
            .filter(
              member =>
                !member.user.bot &&
                isRegistered(member)
            )
            .map(member => ({
              member,
              name:
                member.displayName
                  .toLowerCase()
            }))
            .filter(x =>
              x.name.includes(
                query
              )
            )
            .sort(
              (a, b) => {
                const aStart =
                  a.name.startsWith(
                    query
                  )
                    ? 0
                    : 1;

                const bStart =
                  b.name.startsWith(
                    query
                  )
                    ? 0
                    : 1;

                return (
                  aStart -
                  bStart
                );
              }
            )
            .slice(0, 10);

        if (
          !results.length
        ) {
          return message.reply(
            "❌ Kayıtlı oyuncu bulunamadı."
          );
        }

        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(
                0x5865f2
              )
              .setTitle(
                "🔎 OYUNCU ARAMA"
              )
              .setDescription(
                results
                  .map(
                    x =>
                      `⚽ ${x.member} — **${formatMoney(
                        getUser(
                          message.guild.id,
                          x.member.id
                        ).value
                      )}**`
                  )
                  .join("\n")
              )
          ]
        });
      }

      /* ===================================================
         KUPA EKLE
      =================================================== */

      if (
        command ===
          "kupaekle"
      ) {
        if (
          !canManageMatches(
            message.member
          )
        ) {
          return message.reply(
            "❌ Maç Yetkilisi değilsin."
          );
        }

        const role =
          message.mentions.roles
            .first();

        const cupName =
          args
            .filter(
              x =>
                !x.startsWith("<@")
            )
            .join(" ")
            .trim();

        if (
          !role ||
          !cupName
        ) {
          return message.reply(
            "❌ Kullanım: `.kupaekle @Takım KupaAdı`"
          );
        }

        DATA.cups[
          message.guild.id
        ] ??= {};

        DATA.cups[
          message.guild.id
        ][role.id] ??= [];

        DATA.cups[
          message.guild.id
        ][role.id].push({
          name: cupName,
          date:
            new Date().toISOString()
        });

        saveData();

        return message.reply(
          `🏆 **${cupName}** kupası **${role.name}** müzesine eklendi.`
        );
      }

      /* ===================================================
         KUPA SİL
      =================================================== */

      if (
        command ===
          "kupasil"
      ) {
        if (
          !canManageMatches(
            message.member
          )
        ) {
          return message.reply(
            "❌ Maç Yetkilisi değilsin."
          );
        }

        const role =
          message.mentions.roles
            .first();

        const cupName =
          args
            .filter(
              x =>
                !x.startsWith("<@")
            )
            .join(" ")
            .trim();

        if (
          !role ||
          !cupName
        ) {
          return message.reply(
            "❌ Kullanım: `.kupasil @Takım KupaAdı`"
          );
        }

        const cups =
          DATA.cups[
            message.guild.id
          ]?.[role.id] || [];

        const index =
          cups.findIndex(
            cup =>
              cup.name
                .toLowerCase() ===
              cupName
                .toLowerCase()
          );

        if (
          index === -1
        ) {
          return message.reply(
            "❌ Bu kupa bulunamadı."
          );
        }

        cups.splice(
          index,
          1
        );

        saveData();

        return message.reply(
          `🗑️ **${cupName}** kupası silindi.`
        );
      }

      /* ===================================================
         MÜZE
      =================================================== */

      if (
        command ===
          "müze" ||
        command ===
          "muze"
      ) {
        const role =
          message.mentions.roles
            .first();

        if (!role) {
          return message.reply(
            "❌ Kullanım: `.müze @Takım`"
          );
        }

        const cups =
          DATA.cups[
            message.guild.id
          ]?.[role.id] || [];

        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(
                0xf1c40f
              )
              .setTitle(
                `🏛️ ${role.name} MÜZESİ`
              )
              .setDescription(
                cups.length
                  ? cups
                      .map(
                        (cup, i) =>
                          `🏆 **${i + 1}.** ${cup.name}`
                      )
                      .join("\n")
                  : "📭 Henüz kupa bulunmuyor."
              )
              .setFooter({
                text:
                  `Toplam kupa: ${cups.length}`
              })
          ]
        });
      }

      /* ===================================================
         TICKET PANEL
      =================================================== */

      if (
        command ===
          "ticketpanel"
      ) {
        if (
          !isAdmin(message.member)
        ) {
          return message.reply(
            "❌ Yönetici değilsin."
          );
        }

        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(
                0x5865f2
              )
              .setTitle(
                "🎫 AXERA LEAGUE DESTEK"
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
                    "ticket:create"
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

      /* ===================================================
         SİL
      =================================================== */

      if (
        command === "sil"
      ) {
        if (
          !isAdmin(message.member)
        ) {
          return message.reply(
            "❌ Yönetici değilsin."
          );
        }

        const amount =
          parseInt(
            args[0],
            10
          );

        if (
          !Number.isInteger(
            amount
          ) ||
          amount < 1 ||
          amount > 1000
        ) {
          return message.reply(
            "❌ 1-1000 arasında bir sayı gir."
          );
        }

        await message.channel.bulkDelete(
          amount,
          true
        );

        return;
      }

      /* ===================================================
         EMBED
      =================================================== */

      if (
        command === "embed"
      ) {
        if (
          !isAdmin(message.member)
        ) {
          return message.reply(
            "❌ Yönetici değilsin."
          );
        }

        const raw =
          args.join(" ");

        const split =
          raw.split("|");

        const title =
          split[0]?.trim() ||
          "Axera League";

        const description =
          split
            .slice(1)
            .join("|")
            .trim() ||
          "Axera League";

        await safeDelete(
          message
        );

        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(
                0x5865f2
              )
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

      /* ===================================================
         KICK
      =================================================== */

      if (
        command === "kick"
      ) {
        if (
          !isAdmin(message.member)
        ) {
          return message.reply(
            "❌ Yönetici değilsin."
          );
        }

        const target =
          message.mentions.members
            .first();

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

        await target.kick();

        return message.reply(
          `👢 ${target.user.tag} sunucudan atıldı.`
        );
      }

      /* ===================================================
         BAN
      =================================================== */

      if (
        command === "ban"
      ) {
        if (
          !isAdmin(message.member)
        ) {
          return message.reply(
            "❌ Yönetici değilsin."
          );
        }

        const target =
          message.mentions.members
            .first();

        if (!target) {
          return message.reply(
            "❌ Kullanım: `.ban @Oyuncu`"
          );
        }

        if (
          !target.bannable
        ) {
          return message.reply(
            "❌ Bu üyeyi banlayamıyorum."
          );
        }

        await target.ban();

        return message.reply(
          `🔨 ${target.user.tag} banlandı.`
        );
      }

      /* ===================================================
         MUTE
      =================================================== */

      if (
        command === "mute"
      ) {
        if (
          !isAdmin(message.member)
        ) {
          return message.reply(
            "❌ Yönetici değilsin."
          );
        }

        const target =
          message.mentions.members
            .first();

        if (!target) {
          return message.reply(
            "❌ Kullanım: `.mute @Oyuncu`"
          );
        }

        await target.timeout(
          10 * 60 * 1000,
          "Axera League mute"
        ).catch(() => {});

        return message.reply(
          `🔇 ${target} 10 dakika susturuldu.`
        );
      }

      /* ===================================================
         UNMUTE
      =================================================== */

      if (
        command === "unmute"
      ) {
        if (
          !isAdmin(message.member)
        ) {
          return message.reply(
            "❌ Yönetici değilsin."
          );
        }

        const target =
          message.mentions.members
            .first();

        if (!target) {
          return message.reply(
            "❌ Kullanım: `.unmute @Oyuncu`"
          );
        }

        await target.timeout(
          null,
          "Axera League unmute"
        ).catch(() => {});

        return message.reply(
          `🔊 ${target} susturması kaldırıldı.`
        );
      }

      /* ===================================================
         DM
      =================================================== */

      if (
        command === "dm"
      ) {
        if (
          !isAdmin(message.member)
        ) {
          return message.reply(
            "❌ Yönetici değilsin."
          );
        }

        const target =
          message.mentions.members
            .first();

        const text =
          args
            .filter(
              x =>
                !x.startsWith("<@")
            )
            .join(" ")
            .trim();

        if (
          !target ||
          !text
        ) {
          return message.reply(
            "❌ Kullanım: `.dm @Oyuncu Mesaj`"
          );
        }

        try {
          await target.send(
            `📩 **Axera League**\n\n${text}`
          );
        } catch {
          return message.reply(
            "❌ Bu oyuncuya DM gönderilemedi."
          );
        }

        return message.reply(
          `✅ ${target} kullanıcısına DM gönderildi.`
        );
      }

      /* ===================================================
         YARDIM
      =================================================== */

      if (
        command ===
          "yardım" ||
        command ===
          "yardim"
      ) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(
                0x5865f2
              )
              .setTitle(
                "📚 AXERA LEAGUE KOMUTLARI"
              )
              .setDescription(
                [
                  "**👤 KAYIT**",
                  "`.k @Oyuncu TakmaAdı`",
                  "`.kayıtsızver @Oyuncu`",
                  "`.rolpanel`",
                  "",
                  "**⚽ OYUNCU**",
                  "`.profil`",
                  "`.ara Oyuncu`",
                  "`.ant`",
                  "`.pen`",
                  "`.tweet mesaj`",
                  "",
                  "**💰 DEĞER / BÜTÇE**",
                  "`.dver @Oyuncu 5M`",
                  "`.dsil @Oyuncu 5M`",
                  "`.bütçe`",
                  "`.gönder @Oyuncu 50M`",
                  "`.paraekle @Oyuncu 50M`",
                  "`.parasil @Oyuncu 20M`",
                  "`.paraayarla @Oyuncu 100M`",
                  "",
                  "**⚽ TAKIM / MAÇ**",
                  "`.takımekle @Takım`",
                  "`.takımdeğer @Takım 850M`",
                  "`.kadroekle @Takım @Oyuncu`",
                  "`.kadrocikar @Takım @Oyuncu`",
                  "`.kadro @Takım`",
                  "`.formasyon @Takım`",
                  "`.mac @Takım1 @Takım2`",
                  "`.puan`",
                  "",
                  "**🏆 MÜZE**",
                  "`.kupaekle @Takım Kupa`",
                  "`.kupasil @Takım Kupa`",
                  "`.müze @Takım`",
                  "",
                  "**🎫 DESTEK**",
                  "`.ticketpanel`",
                  "",
                  "**🛡️ YÖNETİM**",
                  "`.sil 10`",
                  "`.embed Başlık | Açıklama`",
                  "`.kick @Oyuncu`",
                  "`.ban @Oyuncu`",
                  "`.mute @Oyuncu`",
                  "`.unmute @Oyuncu`",
                  "`.dm @Oyuncu Mesaj`"
                ].join("\n")
              )
              .setFooter({
                text:
                  "Axera League • Bot Sistemi"
              })
          ]
        });
      }
    } catch (error) {
      console.error(
        "messageCreate:",
        error
      );

      if (
        !message.replied &&
        !message.deleted
      ) {
        await message.reply(
          "❌ Komut çalıştırılırken beklenmeyen bir hata oluştu."
        ).catch(() => {});
      }
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
        DATA.tickets
      )
    ) {
      if (
        now -
          Number(
            ticket.lastMessage ||
              0
          ) >=
        60 * 60 * 1000
      ) {
        const channel =
          client.channels.cache.get(
            channelId
          );

        if (channel) {
          await channel.delete()
            .catch(() => {});
        }

        delete DATA.tickets[
          channelId
        ];

        saveData();
      }
    }
  },
  60 * 1000
);

/* =========================================================
   BOT HAZIR
========================================================= */

client.once(
  "ready",
  async () => {
    console.log(
      `✅ ${client.user.tag} aktif!`
    );

    console.log(
      "⚽ Axera League sistemleri yüklendi."
    );

    console.log(
      `🏟️ Saha: ${FIELD_LENGTH} metre`
    );

    console.log(
      `💰 Maksimum oyuncu değeri: ${formatMoney(
        MAX_VALUE
      )}`
    );

    console.log(
      "🎙️ Canlı maç anlatımı aktif."
    );

    console.log(
      "⚽ Gol ödülü: +2M€"
    );

    console.log(
      "👟 Asist ödülü: +1M€"
    );

    console.log(
      "👥 Maç oyuncusu ödülü: +5M€"
    );

    try {
      for (
        const guild of client.guilds.cache.values()
      ) {
        await guild.members
          .fetch()
          .catch(() => {});
      }
    } catch {}
  }
);

/* =========================================================
   HATA YAKALAMA
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
   TOKEN
========================================================= */

if (
  !process.env.TOKEN
) {
  console.error(
    "❌ TOKEN bulunamadı! Railway Variables kısmına TOKEN ekle."
  );

  process.exit(1);
}

client.login(
  process.env.TOKEN
);
