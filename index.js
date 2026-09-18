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

const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

const TOKEN = process.env.TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!TOKEN) throw new Error("TOKEN Railway Variables içine eklenmemiş.");

const ai = OPENAI_API_KEY
  ? new OpenAI({ apiKey: OPENAI_API_KEY })
  : null;

const IDS = {
  roles: {
    yonetici: "1534455282426445897",
    kayitYetkilisi: "1534456315366342716",
    deger: "1534456192913375382",
    kayitsiz: "1534457560134844517",
    futbolcu: "1534457228986421278",
    td: "1534456648930693120",
    uye: "1534457460163608636",
    kaleci: process.env.KALECI_ROLE_ID || null,
    moderator: "1534456108415189063",
    spiker: "1535251168169697390",

    medya: "1547393966553440346",
    partner: "1547393545827123230",
    macPing: "1547393416755941509",
    duyuru: "1547393331297001522",
    cekilis: "1545116885589430312"
  },

  channels: {
    kayit: "1547371464515133470",
    sohbet: "1547374641763455009",
    ant: "1547375589923618957",
    pen: "1547375997698052166",
    tweet: "1547377797193011340",
    mac: "1547376935410073692",
    puan: "1547382143775285431",
    deger: "1547376344927834122",
    durum: "1547388196057118",
    ai: "1547375186754408539"
  },

  teams: {
    "Barcelona": "1534480715779936297",
    "Real Madrid": "1534480984064528655",
    "Galatasaray": "1534481073629691995",
    "Fenerbahçe": "1534481156840620183",
    "Beşiktaş": "1534481259739348992",
    "Manchester United": "1534481426463068180"
  }
};

const DATA_FILE = path.join(__dirname, "data.json");

const DEFAULT = {
  users: {},
  teams: {},
  fixtures: [],
  nextFixtureId: 1,
  activeMatches: {},
  registrationPanels: {},
  tickets: {},
  training: {},
  tweetCooldowns: {},
  formations: {},
  matchHistory: {},
  stats: {},
  rolePanel: null
};

function loadData() {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return {
      ...JSON.parse(JSON.stringify(DEFAULT)),
      ...data
    };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT));
  }
}

let db = loadData();

function saveData() {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(db, null, 2),
    "utf8"
  );
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

/* =========================
   GENEL
========================= */

const money = value => {
  const n = Math.max(0, Number(value) || 0);
  return n >= 1000 ? "1B€" : `${Math.round(n)}M€`;
};

function makeEmbed(title, description, color = 0x5865f2) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();
}

function normalize(text) {
  return String(text || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function hasRole(member, roleIds) {
  return member?.roles?.cache?.some(role =>
    roleIds.includes(role.id)
  );
}

function isAdmin(member) {
  return !!(
    member?.permissions?.has(
      PermissionFlagsBits.Administrator
    ) ||
    hasRole(member, [IDS.roles.yonetici])
  );
}

function isStaff(member) {
  return (
    isAdmin(member) ||
    hasRole(member, [
      IDS.roles.kayitYetkilisi,
      IDS.roles.deger,
      IDS.roles.spiker,
      IDS.roles.moderator
    ])
  );
}

function onlyChannel(message, channelId) {
  if (message.channel.id !== channelId) {
    message.reply(
      `❌ Bu komut <#${channelId}> kanalında kullanılabilir.`
    ).catch(() => {});
    return false;
  }

  return true;
}

function amountArg(value) {
  if (!value) return null;

  const text = String(value)
    .replace(",", ".")
    .replace(/€/g, "")
    .trim()
    .toUpperCase();

  if (!/^\d+(?:\.\d+)?M?$/.test(text)) {
    return null;
  }

  const n = Number(text.replace(/M$/, ""));

  return Number.isFinite(n) && n > 0
    ? n
    : null;
}

function getMentionedMember(message) {
  return message.mentions.members.first();
}

function playerName(member) {
  return (
    db.users[member.id]?.name ||
    member.nickname ||
    member.displayName ||
    member.user?.username ||
    "Oyuncu"
  );
}

/* =========================
   DEĞER SİSTEMİ
========================= */

function parseNickValue(member) {
  const nickname =
    member?.nickname ||
    member?.displayName ||
    "";

  if (/1B€\s*$/i.test(nickname)) {
    return 1000;
  }

  const match = nickname.match(
    /(\d+(?:\.\d+)?)M€\s*$/i
  );

  return match
    ? Number(match[1])
    : 0;
}

function setNickValue(oldNickname, value) {
  let nickname = String(oldNickname || "")
    .trim();

  nickname = nickname
    .replace(
      /\s*(?:\d+(?:\.\d+)?M|1B)€\s*$/i,
      ""
    )
    .trim();

  const suffix = money(value);
  const separator = nickname ? " | " : "";

  const maxBaseLength =
    32 -
    separator.length -
    suffix.length;

  const base = nickname.slice(
    0,
    Math.max(0, maxBaseLength)
  );

  return `${base}${separator}${suffix}`;
}

async function safeSetNickname(member, nickname) {
  if (!member?.manageable) return;

  await member
    .setNickname(nickname)
    .catch(() => {});
}

function ensureUser(member) {
  if (!db.users[member.id]) {
    db.users[member.id] = {
      name: playerName(member),
      value: parseNickValue(member),
      budget: 0
    };
  }

  const user = db.users[member.id];

  if (!Number.isFinite(Number(user.value))) {
    user.value = parseNickValue(member);
  }

  if (!Number.isFinite(Number(user.budget))) {
    user.budget = 0;
  }

  if (!user.name) {
    user.name = playerName(member);
  }

  return user;
}

async function sendValueNotification(
  guild,
  member,
  reason,
  oldValue,
  newValue
) {
  if (oldValue === newValue) return;

  const channel =
    guild?.channels?.cache?.get(
      IDS.channels.deger
    );

  if (!channel) return;

  await channel.send({
    embeds: [
      makeEmbed(
        "💰 Değer Bildirimi",
        [
          `👤 Oyuncu: <@${member.id}>`,
          `📌 İşlem: **${reason}**`,
          `📉 Eski değer: **${money(oldValue)}**`,
          `📈 Yeni değer: **${money(newValue)}**`
        ].join("\n"),
        0xf1c40f
      )
    ]
  }).catch(() => {});
}

async function changePlayerValue(
  member,
  delta,
  reason = "Değer değişikliği"
) {
  if (!member) return null;

  const current =
    parseNickValue(member);

  const next = Math.min(
    1000,
    Math.max(
      0,
      current + Number(delta)
    )
  );

  const oldNickname =
    member.nickname ||
    member.displayName ||
    playerName(member);

  const newNickname =
    setNickValue(
      oldNickname,
      next
    );

  await safeSetNickname(
    member,
    newNickname
  );

  const user = ensureUser(member);

  user.value = next;

  saveData();

  await sendValueNotification(
    member.guild,
    member,
    reason,
    current,
    next
  );

  return {
    oldValue: current,
    newValue: next
  };
}

/* =========================
   KAYIT
========================= */

async function registerPanel(
  message,
  target,
  nickname
) {
  const panel =
    await message.reply({
      embeds: [
        makeEmbed(
          "📋 Axera League Kayıt",
          `👤 Oyuncu: <@${target.id}>\n🏷️ İsim: **${String(
            nickname
          ).replace(/[*_`]/g, "")}**\n\nOyuncunun rolünü seçiniz.`
        )
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(
              `register_futbolcu_${target.id}`
            )
            .setLabel("⚽ Futbolcu")
            .setStyle(ButtonStyle.Primary),

          new ButtonBuilder()
            .setCustomId(
              `register_uye_${target.id}`
            )
            .setLabel("👤 Üye")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId(
              `register_td_${target.id}`
            )
            .setLabel("🧑‍💼 Teknik Direktör")
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId(
              `register_kaleci_${target.id}`
            )
            .setLabel("🧤 Kaleci")
            .setStyle(ButtonStyle.Primary),

          new ButtonBuilder()
            .setCustomId(
              `register_cancel_${target.id}`
            )
            .setLabel("❌ İptal")
            .setStyle(ButtonStyle.Danger)
        )
      ]
    });

  db.registrationPanels[panel.id] = {
    userId: target.id,
    nickname: String(nickname).slice(0, 32),
    createdBy: message.author.id
  };

  saveData();
}

async function finishRegister(
  interaction,
  type
) {
  const panel =
    db.registrationPanels[
      interaction.message.id
    ];

  if (!panel) {
    return interaction.reply({
      content:
        "❌ Bu kayıt paneli artık geçerli değil.",
      ephemeral: true
    });
  }

  if (
    !isAdmin(interaction.member) &&
    !hasRole(interaction.member, [
      IDS.roles.kayitYetkilisi
    ])
  ) {
    return interaction.reply({
      content:
        "❌ Kayıt yetkilisi değilsin.",
      ephemeral: true
    });
  }

  if (type === "cancel") {
    delete db.registrationPanels[
      interaction.message.id
    ];

    saveData();

    return interaction.update({
      embeds: [
        makeEmbed(
          "❌ Kayıt İptal Edildi",
          "Kayıt paneli iptal edildi.",
          0xed4245
        )
      ],
      components: []
    });
  }

  const roleMap = {
    futbolcu: IDS.roles.futbolcu,
    uye: IDS.roles.uye,
    td: IDS.roles.td,
    kaleci: IDS.roles.kaleci
  };

  const roleId = roleMap[type];

  if (!roleId) {
    return interaction.reply({
      content: "❌ Rol bulunamadı.",
      ephemeral: true
    });
  }

  const member =
    await interaction.guild.members
      .fetch(panel.userId)
      .catch(() => null);

  if (!member) {
    return interaction.reply({
      content:
        "❌ Oyuncu bulunamadı.",
      ephemeral: true
    });
  }

  const removableRoles = [
    IDS.roles.kayitsiz,
    IDS.roles.futbolcu,
    IDS.roles.uye,
    IDS.roles.td
  ].filter(Boolean);

  if (IDS.roles.kaleci) {
    removableRoles.push(
      IDS.roles.kaleci
    );
  }

  await member.roles
    .remove(removableRoles)
    .catch(() => {});

  await member.roles
    .add(roleId)
    .catch(() => {});

  const user = ensureUser(member);

  user.name = panel.nickname;

  await safeSetNickname(
    member,
    panel.nickname
  );

  delete db.registrationPanels[
    interaction.message.id
  ];

  saveData();

  const roleName = {
    futbolcu: "Futbolcu",
    uye: "Üye",
    td: "Teknik Direktör",
    kaleci: "Kaleci"
  }[type];

  return interaction.update({
    embeds: [
      makeEmbed(
        "✅ Kayıt Tamamlandı",
        `👤 <@${member.id}>\n🏷️ İsim: **${panel.nickname}**\n🎭 Rol: **${roleName}**`,
        0x57f287
      )
    ],
    components: []
  });
}

/* =========================
   ANTRENMAN
========================= */

async function doTraining(message) {
  if (!onlyChannel(
    message,
    IDS.channels.ant
  )) return;

  const last =
    db.training[message.author.id] || 0;

  const now = Date.now();

  if (
    now - last <
    30 * 60 * 1000
  ) {
    const remaining =
      Math.ceil(
        (
          30 * 60 * 1000 -
          (now - last)
        ) / 60000
      );

    return message.reply(
      `⏳ Antrenmanı tekrar kullanmak için **${remaining} dakika** beklemelisin.`
    );
  }

  const result =
    await changePlayerValue(
      message.member,
      2,
      "Antrenman +2M€"
    );

  db.training[
    message.author.id
  ] = now;

  saveData();

  return message.reply(
    `🏋️ Antrenman tamamlandı!\n💰 **+2M€**\n📈 Yeni değer: **${money(
      result.newValue
    )}**`
  );
}

/* =========================
   PENALTI
========================= */

async function doPenalty(message) {
  if (!onlyChannel(
    message,
    IDS.channels.pen
  )) return;

  const random =
    Math.random();

  let result;

  if (random < 0.50) {
    result = "⚽ GOL";
  } else if (random < 0.75) {
    result = "🥅 DİREK";
  } else if (random < 0.875) {
    result = "🧤 KALECİ";
  } else {
    result = "🟦 KORNER";
  }

  if (result === "⚽ GOL") {
    const value =
      await changePlayerValue(
        message.member,
        5,
        "Penaltı golü +5M€"
      );

    return message.reply(
      `🎯 Penaltı sonucu: **⚽ GOL!**\n💰 **+5M€**\n📈 Yeni değer: **${money(
        value.newValue
      )}**`
    );
  }

  return message.reply(
    `🎯 Penaltı sonucu: **${result}**`
  );
}

/* =========================
   OYUNCU ARAMA / DEĞER
========================= */

async function searchPlayers(
  message,
  query
) {
  await message.guild.members
    .fetch()
    .catch(() => {});

  const q = normalize(query);

  const members =
    [...message.guild.members.cache.values()]
      .filter(
        m =>
          !m.user.bot &&
          !m.roles.cache.has(
            IDS.roles.kayitsiz
          )
      );

  return members
    .filter(m =>
      normalize(
        playerName(m)
      ).includes(q)
    )
    .slice(0, 10);
}

/* =========================
   TAKIM
========================= */

function teamByName(text) {
  const q = normalize(text);

  const names = [
    ...new Set([
      ...Object.keys(IDS.teams),
      ...Object.keys(db.teams)
    ])
  ];

  return (
    names.find(
      name =>
        normalize(name) === q
    ) ||
    names.find(
      name =>
        normalize(name).includes(q) ||
        q.includes(normalize(name))
    )
  );
}

function ensureTeam(
  name,
  roleId = null
) {
  if (!db.teams[name]) {
    db.teams[name] = {
      players: [],
      score: 0,
      gd: 0,
      gf: 0,
      ga: 0,
      roleId:
        roleId ||
        IDS.teams[name] ||
        null,
      teamValue: 0,
      formation: "4-3-3",
      ilk11: {}
    };
  }

  if (roleId) {
    db.teams[name].roleId =
      roleId;
  }

  return db.teams[name];
}

function teamRole(
  guild,
  name
) {
  const roleId =
    IDS.teams[name] ||
    db.teams[name]?.roleId;

  return roleId
    ? guild.roles.cache.get(roleId)
    : null;
}

function teamMembers(
  guild,
  name
) {
  const role =
    teamRole(guild, name);

  return role
    ? [...role.members.values()]
    : [];
}

function getUserTeams(
  guild,
  member
) {
  return [
    ...new Set([
      ...Object.keys(IDS.teams),
      ...Object.keys(db.teams)
    ])
  ].filter(name => {
    const role =
      teamRole(guild, name);

    return (
      role &&
      member.roles.cache.has(
        role.id
      )
    );
  });
}

function teamPlayers(
  guild,
  name
) {
  const team =
    ensureTeam(name);

  const manual =
    (team.players || [])
      .map(p =>
        guild.members.cache.get(
          p.id
        )
      )
      .filter(Boolean);

  return [
    ...new Map(
      [
        ...manual,
        ...teamMembers(
          guild,
          name
        )
      ].map(m => [
        m.id,
        m
      ])
    ).values()
  ];
}

/* =========================
   İLK 11
========================= */

const FIRST11 = [
  ["kaleci", "🧤 Kaleci"],
  ["sagbek", "SĞB"],
  ["stoper1", "STP 1"],
  ["stoper2", "STP 2"],
  ["solbek", "SLB"],
  ["ortasaha1", "OS 1"],
  ["ortasaha2", "OS 2"],
  ["ortasaha3", "OS 3"],
  ["kanat1", "KN 1"],
  ["kanat2", "KN 2"],
  ["forvet", "FV"]
];

async function sendFirst11Panel(
  target,
  teamName
) {
  const team =
    ensureTeam(teamName);

  const players =
    teamPlayers(
      target.guild,
      teamName
    );

  const description =
    FIRST11.map(
      ([key, label]) =>
        `${label}: ${
          team.ilk11?.[key]
            ? `<@${team.ilk11[key]}>`
            : "—"
        }`
    ).join("\n");

  const playerMenu =
    new StringSelectMenuBuilder()
      .setCustomId(
        `first11_player_${encodeURIComponent(teamName)}`
      )
      .setPlaceholder(
        "Oyuncu seç"
      );

  if (!players.length) {
    playerMenu.addOptions({
      label: "Takımda oyuncu yok",
      value: "none"
    });
  } else {
    players
      .slice(0, 25)
      .forEach(player => {
        playerMenu.addOptions({
          label: playerName(player).slice(
            0,
            100
          ),
          value: player.id
        });
      });
  }

  const positionMenu =
    new StringSelectMenuBuilder()
      .setCustomId(
        `first11_position_${encodeURIComponent(teamName)}`
      )
      .setPlaceholder(
        "Pozisyon seç"
      )
      .addOptions(
        FIRST11.map(
          ([key, label]) => ({
            label,
            value: key
          })
        )
      );

  const removeButtons =
    FIRST11.slice(0, 5).map(
      ([key, label]) =>
        new ButtonBuilder()
          .setCustomId(
            `first11_remove_${key}_${encodeURIComponent(teamName)}`
          )
          .setLabel(
            `❌ ${label}`
          )
          .setStyle(
            ButtonStyle.Secondary
          )
    );

  const clearButton =
    new ButtonBuilder()
      .setCustomId(
        `first11_clear_${encodeURIComponent(teamName)}`
      )
      .setLabel("🗑️ Temizle")
      .setStyle(
        ButtonStyle.Danger
      );

  return target.reply({
    embeds: [
      makeEmbed(
        `⚽ ${teamName} — İlk 11`,
        description
      )
    ],
    components: [
      new ActionRowBuilder()
        .addComponents(
          playerMenu
        ),

      new ActionRowBuilder()
        .addComponents(
          positionMenu
        ),

      new ActionRowBuilder()
        .addComponents(
          ...removeButtons,
          clearButton
        )
    ]
  });
}

/* =========================
   MAÇ
========================= */

function getMatchPlayers(
  guild,
  teamName
) {
  const team =
    ensureTeam(teamName);

  const ids =
    Object.values(
      team.ilk11 || {}
    ).filter(Boolean);

  const selected =
    ids
      .map(id =>
        guild.members.cache.get(id)
      )
      .filter(Boolean);

  return selected.length
    ? selected
    : teamPlayers(
        guild,
        teamName
      );
}

async function runMatch(
  message,
  teamA,
  teamB
) {
  const guild =
    message.guild;

  const matchId =
    `${guild.id}_${Date.now()}`;

  let scoreA = 0;
  let scoreB = 0;
  let minute = 0;

  const events = [];

  db.activeMatches[matchId] = {
    teamA,
    teamB,
    scoreA: 0,
    scoreB: 0,
    startedAt: Date.now()
  };

  saveData();

  const matchMessage =
    await message.channel.send({
      embeds: [
        makeEmbed(
          "⚽ Axera League Maçı",
          `**${teamA} 0 - 0 ${teamB}**\n⏱️ 0'\n\nMaç başladı!`
        )
      ]
    });

  const interval =
    setInterval(async () => {
      minute++;

      const event =
        Math.random();

      let commentary = "";

      if (event < 0.08) {
        const attackingTeam =
          Math.random() < 0.5
            ? teamA
            : teamB;

        const players =
          getMatchPlayers(
            guild,
            attackingTeam
          );

        const scorer =
          players.length
            ? players[
                Math.floor(
                  Math.random() *
                    players.length
                )
              ]
            : null;

        if (Math.random() < 0.30) {
          if (attackingTeam === teamA) {
            scoreA++;
          } else {
            scoreB++;
          }

          commentary =
            `⚽ **GOL!** ${attackingTeam}${
              scorer
                ? ` — ${playerName(scorer)}`
                : ""
            }!`;

          /*
             Maç gollerinde otomatik değer
             değişikliği YOK.
          */
        } else {
          commentary =
            `🔥 ${attackingTeam} tehlikeli bir atak geliştirdi.`;
        }
      } else if (event < 0.16) {
        commentary =
          "🧤 Kaleci kritik bir kurtarış yaptı.";
      } else if (event < 0.22) {
        commentary =
          "⚡ Hızlı bir hücum gelişiyor.";
      } else if (event < 0.27) {
        commentary =
          "🟨 Hakem faul düdüğünü çaldı.";
      } else {
        commentary =
          "⚽ Paslaşmalar devam ediyor.";
      }

      events.push(
        `${minute}' ${commentary}`
      );

      db.activeMatches[
        matchId
      ].scoreA = scoreA;

      db.activeMatches[
        matchId
      ].scoreB = scoreB;

      saveData();

      await matchMessage.edit({
        embeds: [
          makeEmbed(
            "⚽ Axera League Maçı",
            `**${teamA} ${scoreA} - ${scoreB} ${teamB}**\n⏱️ ${minute}'\n\n${events.slice(-4).join("\n")}`
          )
        ]
      }).catch(() => {});

      if (minute >= 90) {
        clearInterval(interval);

        const A =
          ensureTeam(teamA);

        const B =
          ensureTeam(teamB);

        A.gf += scoreA;
        A.ga += scoreB;
        A.gd =
          A.gf - A.ga;

        B.gf += scoreB;
        B.ga += scoreA;
        B.gd =
          B.gf - B.ga;

        if (scoreA > scoreB) {
          A.score += 3;
        } else if (
          scoreB > scoreA
        ) {
          B.score += 3;
        } else {
          A.score++;
          B.score++;
        }

        db.matchHistory[
          matchId
        ] = {
          teamA,
          teamB,
          scoreA,
          scoreB,
          date: Date.now()
        };

        delete db.activeMatches[
          matchId
        ];

        saveData();

        await matchMessage.edit({
          embeds: [
            makeEmbed(
              "🏁 Maç Sona Erdi",
              `**${teamA} ${scoreA} - ${scoreB} ${teamB}**`,
              0x57f287
            )
          ]
        }).catch(() => {});

        await postStandings(
          guild
        );
      }
    }, 3000);
  }

/* =========================
   PUAN
========================= */

async function postStandings(
  guild
) {
  const channel =
    guild.channels.cache.get(
      IDS.channels.puan
    );

  if (!channel) return;

  const teams =
    [
      ...new Set([
        ...Object.keys(
          IDS.teams
        ),
        ...Object.keys(
          db.teams
        )
      ])
    ]
      .map(name => [
        name,
        ensureTeam(name)
      ])
      .sort(
        (a, b) =>
          b[1].score -
            a[1].score ||
          b[1].gd -
            a[1].gd ||
          b[1].gf -
            a[1].gf
      );

  const text =
    teams.length
      ? teams
          .map(
            ([name, team], index) =>
              `${index + 1}. **${name}** — ${team.score} P | AV ${team.gd} | AG ${team.gf}`
          )
          .join("\n")
      : "Puan durumu boş.";

  return channel.send({
    embeds: [
      makeEmbed(
        "🏆 Axera League Puan Durumu",
        text,
        0xf1c40f
      )
    ]
  });
}

/* =========================
   FİKSTÜR
========================= */

async function startDueFixtures() {
  for (const fixture of db.fixtures) {
    if (fixture.started) continue;

    if (
      Date.now() >=
      fixture.timestamp
    ) {
      fixture.started = true;
      saveData();

      const guild =
        client.guilds.cache.get(
          fixture.guildId
        );

      const channel =
        guild?.channels.cache.get(
          IDS.channels.mac
        );

      if (guild && channel) {
        await runMatch(
          {
            guild,
            channel
          },
          fixture.teamA,
          fixture.teamB
        );
      }
    }
  }
}

/* =========================
   BÜTÇE
========================= */

function ensureBudget(
  member
) {
  return ensureUser(member);
}

/* =========================
   TICKET
========================= */

async function createTicket(
  interaction
) {
  const guild =
    interaction.guild;

  const existing =
    Object.values(
      db.tickets
    ).find(
      ticket =>
        ticket.guildId === guild.id &&
        ticket.userId ===
          interaction.user.id &&
        ticket.open
    );

  if (existing) {
    return interaction.reply({
      content:
        `❌ Zaten açık bir ticketın var: <#${existing.channelId}>`,
      ephemeral: true
    });
  }

  const channel =
    await guild.channels.create({
      name:
        `ticket-${interaction.user.username}`
          .slice(0, 90),

      type:
        ChannelType.GuildText,

      permissionOverwrites: [
        {
          id:
            guild.roles.everyone.id,

          deny: [
            PermissionFlagsBits.ViewChannel
          ]
        },

        {
          id:
            interaction.user.id,

          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        },

        {
          id:
            IDS.roles.moderator,

          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        }
      ]
    })
    .catch(() => null);

  if (!channel) {
    return interaction.reply({
      content:
        "❌ Ticket oluşturulamadı.",
      ephemeral: true
    });
  }

  db.tickets[channel.id] = {
    guildId: guild.id,
    userId: interaction.user.id,
    channelId: channel.id,
    open: true,
    lastActivity: Date.now()
  };

  saveData();

  await channel.send({
    content:
      `<@${interaction.user.id}> <@&${IDS.roles.moderator}>`,

    embeds: [
      makeEmbed(
        "🎫 Destek Talebi",
        "Sorununu buraya yazabilirsin."
      )
    ],

    components: [
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(
              "ticket_close"
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
      `✅ Ticket oluşturuldu: ${channel}`,
    ephemeral: true
  });
}

/* =========================
   AI
========================= */

async function aiReply(
  message,
  customContent = null
) {
  const content =
    customContent ||
    message.content;

  if (
    /seni kim kurdu/i.test(
      content
    )
  ) {
    return message.reply(
      "Lynox9380 kurdu."
    );
  }

  if (
    /yapay ?zeka altyap(ı|i)|ai altyap/i.test(
      content
    )
  ) {
    return message.reply(
      "Axera League"
    );
  }

  if (!ai) {
    return message.reply(
      "❌ OPENAI_API_KEY ayarlanmamış."
    );
  }

  try {
    const response =
      await ai.responses.create({
        model:
          "gpt-5.6-luna",

        instructions:
          "Sen Axera League yapay zekâ asistanısın. Türkçe, kısa ve faydalı cevap ver.",

        input: content,

        max_output_tokens: 300
      });

    return message.reply(
      (
        response.output_text ||
        "Şu anda cevap oluşturamadım."
      ).slice(0, 1900)
    );
  } catch (error) {
    console.error(
      "AI ERROR:",
      error
    );

    return message.reply(
      "❌ Yapay zekâ şu anda cevap veremiyor."
    );
  }
}

/* =========================
   ETKİLEŞİMLER
========================= */

client.on(
  "interactionCreate",
  async interaction => {
    try {
      if (
        interaction.isButton()
      ) {
        const parts =
          interaction.customId.split("_");

        if (
          parts[0] ===
          "register"
        ) {
          return finishRegister(
            interaction,
            parts[1]
          );
        }

        if (
          interaction.customId ===
          "ticket_create"
        ) {
          return createTicket(
            interaction
          );
        }

        if (
          interaction.customId ===
          "ticket_close"
        ) {
          const ticket =
            db.tickets[
              interaction.channel.id
            ];

          if (!ticket) {
            return interaction.reply({
              content:
                "❌ Ticket bulunamadı.",
              ephemeral: true
            });
          }

          if (
            interaction.user.id !==
              ticket.userId &&
            !isAdmin(
              interaction.member
            ) &&
            !hasRole(
              interaction.member,
              [IDS.roles.moderator]
            )
          ) {
            return interaction.reply({
              content:
                "❌ Bu ticketı kapatma yetkin yok.",
              ephemeral: true
            });
          }

          ticket.open = false;
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

        if (
          interaction.customId
            .startsWith("role_")
        ) {
          const roleId =
            interaction.customId.slice(
              5
            );

          const role =
            interaction.guild.roles.cache.get(
              roleId
            );

          if (!role) {
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
                `➖ ${role.name} kaldırıldı.`,
              ephemeral: true
            });
          }

          await interaction.member.roles
            .add(roleId)
            .catch(() => {});

          return interaction.reply({
            content:
              `➕ ${role.name} verildi.`,
            ephemeral: true
          });
        }

        if (
          interaction.customId
            .startsWith(
              "first11_remove_"
            )
        ) {
          const data =
            interaction.customId
              .replace(
                "first11_remove_",
                ""
              );

          const first =
            data.indexOf("_");

          const position =
            data.slice(
              0,
              first
            );

          const teamName =
            decodeURIComponent(
              data.slice(
                first + 1
              )
            );

          const team =
            ensureTeam(teamName);

          delete team.ilk11[
            position
          ];

          saveData();

          return interaction.reply({
            content:
              `✅ **${position}** pozisyonu temizlendi.`,
            ephemeral: true
          });
        }

        if (
          interaction.customId
            .startsWith(
              "first11_clear_"
            )
        ) {
          const teamName =
            decodeURIComponent(
              interaction.customId
                .replace(
                  "first11_clear_",
                  ""
                )
            );

          ensureTeam(
            teamName
          ).ilk11 = {};

          saveData();

          return interaction.reply({
            content:
              `🗑️ **${teamName}** İlk 11 temizlendi.`,
            ephemeral: true
          });
        }
      }

      if (
        interaction.isStringSelectMenu()
      ) {
        if (
          interaction.customId
            .startsWith(
              "first11_player_"
            )
        ) {
          const teamName =
            decodeURIComponent(
              interaction.customId
                .replace(
                  "first11_player_",
                  ""
                )
            );

          const playerId =
            interaction.values[0];

          if (
            playerId ===
            "none"
          ) {
            return interaction.reply({
              content:
                "❌ Takımda oyuncu yok.",
              ephemeral: true
            });
          }

          const team =
            ensureTeam(
              teamName
            );

          interaction.client
            ._first11Temp ??= {};

          interaction.client
            ._first11Temp[
              interaction.user.id
            ] = {
              teamName,
              playerId
            };

          return interaction.reply({
            content:
              "✅ Oyuncu seçildi. Şimdi pozisyon menüsünden pozisyonu seç.",
            ephemeral: true
          });
        }

        if (
          interaction.customId
            .startsWith(
              "first11_position_"
            )
        ) {
          const teamName =
            decodeURIComponent(
              interaction.customId
                .replace(
                  "first11_position_",
                  ""
                )
            );

          const temp =
            interaction.client
              ._first11Temp?.[
              interaction.user.id
            ];

          if (
            !temp ||
            temp.teamName !==
              teamName
          ) {
            return interaction.reply({
              content:
                "❌ Önce oyuncu seç.",
              ephemeral: true
            });
          }

          const position =
            interaction.values[0];

          ensureTeam(
            teamName
          ).ilk11[position] =
            temp.playerId;

          delete interaction.client
            ._first11Temp[
              interaction.user.id
            ];

          saveData();

          return interaction.reply({
            content:
              `✅ Oyuncu İlk 11'e eklendi: **${position}**`,
            ephemeral: true
          });
        }

        if (
          interaction.customId ===
          "formation_select"
        ) {
          const [
            teamName,
            formation
          ] =
            interaction.values[0]
              .split("||");

          ensureTeam(
            teamName
          ).formation =
            formation;

          saveData();

          return interaction.update({
            content:
              `✅ **${teamName}** formasyonu: **${formation}**`,
            components: []
          });
        }
      }
    } catch (error) {
      console.error(
        "INTERACTION ERROR:",
        error
      );

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {
        interaction.reply({
          content:
            "❌ İşlem sırasında hata oluştu.",
          ephemeral: true
        }).catch(() => {});
      }
    }
  }
);

/* =========================
   ÜYE GİRİŞİ
========================= */

client.on(
  "guildMemberAdd",
  async member => {
    await member.roles
      .add(IDS.roles.kayitsiz)
      .catch(() => {});

    const channel =
      member.guild.channels.cache.get(
        IDS.channels.kayit
      );

    if (channel) {
      channel.send(
        `👋 Hoş geldin <@${member.id}>! Kayıt için <@&${IDS.roles.kayitYetkilisi}> ekibine ulaşabilirsin.`
      ).catch(() => {});
    }
  }
);

/* =========================
   MESAJ KOMUTLARI
========================= */

client.on(
  "messageCreate",
  async message => {
    if (message.author.bot)
      return;

    const ticket =
      db.tickets[
        message.channel.id
      ];

    if (
      ticket?.open
    ) {
      ticket.lastActivity =
        Date.now();

      saveData();
    }

    if (
      message.channel.id ===
        IDS.channels.ai &&
      !message.content.startsWith(".")
    ) {
      return aiReply(
        message
      );
    }

    if (
      !message.content.startsWith(".")
    ) {
      return;
    }

    const raw =
      message.content
        .trim()
        .slice(1);

    const parts =
      raw.split(/\s+/);

    const cmd =
      normalize(
        parts.shift()
      );

    const args =
      parts;

    /* YARDIM */

    if (
      cmd === "yardım" ||
      cmd === "yardim"
    ) {
      return message.reply({
        embeds: [
          makeEmbed(
            "📚 Axera League Komutları",
            `**👤 Kayıt**
.k @Oyuncu İsim
.kayıtsızver @Oyuncu
.ara Oyuncu

**💰 Değer**
.değer @Oyuncu
.değerliste
.dver @Oyuncu 5M
.dsil @Oyuncu 5M

**🏋️ Sistem**
.ant / .antrenman
.pen / .penaltı
.tweet Mesaj

**⚽ Maç**
.maç @Takım1 @Takım2
.ilk11 @Takım
.formasyon @Takım
.puan

**🏆 Takım**
.takımekle @Takım
.takımkaldır @Takım
.puanekle @Takım 3
.takımdeğer @Takım 850M

**📅 Fikstür**
.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM
.fikstür
.fiksturcikar @Takım1 @Takım2

**💳 Kişisel Bütçe**
.bütçeekle @Oyuncu 50M
.bütçesil @Oyuncu 50M
.gönder @Oyuncu 50M

**🛡️ Yönetim**
.rolver @Oyuncu @Rol
.rolal @Oyuncu @Rol
.rolverhepsi @Rol
.rolalhepsi @Rol
.sil 10
.embed Başlık | Açıklama
.kick @Oyuncu
.ban @Oyuncu
.mute @Oyuncu
.unmute @Oyuncu
.dm @Oyuncu Mesaj

**🎫 Ticket**
.ticketpanel

**🎭 Bildirim**
.rolpanel

**🤖 AI**
.ai soru
.yapayzeka soru

.şart`
          )
        ]
      });
    }

    /* ROL YÖNETİMİ */

    if (
      [
        "rolver",
        "rolal",
        "rolverhepsi",
        "rolalhepsi"
      ].includes(cmd)
    ) {
      if (
        !isAdmin(
          message.member
        )
      ) {
        return message.reply(
          "❌ Bu komutları sadece Yöneticiler kullanabilir."
        );
      }

      const role =
        message.mentions.roles.first();

      if (!role) {
        return message.reply(
          `❌ Kullanım: .${cmd} @Rol`
        );
      }

      if (
        cmd ===
          "rolverhepsi" ||
        cmd ===
          "rolalhepsi"
      ) {
        await message.guild.members
          .fetch()
          .catch(() => {});

        let count = 0;

        for (
          const member of
            message.guild.members.cache.values()
        ) {
          if (
            member.user.bot
          )
            continue;

          try {
            if (
              cmd ===
              "rolverhepsi"
            ) {
              await member.roles.add(
                role
              );
            } else {
              await member.roles.remove(
                role
              );
            }

            count++;
          } catch {}
        }

        return message.reply(
          `✅ **${count}** üyede işlem tamamlandı.`
        );
      }

      const target =
        message.mentions.members.first();

      if (!target) {
        return message.reply(
          `❌ Kullanım: .${cmd} @Oyuncu @Rol`
        );
      }

      try {
        if (
          cmd ===
          "rolver"
        ) {
          await target.roles.add(
            role
          );
        } else {
          await target.roles.remove(
            role
          );
        }
      } catch {
        return message.reply(
          "❌ Rol işlemi yapılamadı."
        );
      }

      return message.reply(
        `✅ <@${target.id}> → **${role.name}** işlemi tamamlandı.`
      );
    }

    /* KAYIT */

    if (cmd === "k") {
      if (
        !onlyChannel(
          message,
          IDS.channels.kayit
        )
      )
        return;

      if (
        !isAdmin(
          message.member
        ) &&
        !hasRole(
          message.member,
          [IDS.roles.kayitYetkilisi]
        )
      ) {
        return message.reply(
          "❌ Kayıt yetkilisi değilsin."
        );
      }

      const target =
        getMentionedMember(
          message
        );

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.k @Oyuncu İsim`"
        );
      }

      const nickname =
        message.content
          .replace(
            /^\.k\s+<@!?\d+>\s*/i,
            ""
          )
          .trim();

      if (!nickname) {
        return message.reply(
          "❌ Oyuncu ismi yazmalısın."
        );
      }

      return registerPanel(
        message,
        target,
        nickname
      );
    }

    /* KAYITSIZ */

    if (
      cmd ===
      "kayıtsızver"
    ) {
      if (
        !onlyChannel(
          message,
          IDS.channels.kayit
        )
      )
        return;

      if (
        !isAdmin(
          message.member
        ) &&
        !hasRole(
          message.member,
          [IDS.roles.kayitYetkilisi]
        )
      ) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const target =
        getMentionedMember(
          message
        );

      if (!target) {
        return message.reply(
          "❌ Oyuncu belirt."
        );
      }

      const roles = [
        IDS.roles.futbolcu,
        IDS.roles.uye,
        IDS.roles.td,
        IDS.roles.kaleci
      ].filter(Boolean);

      await target.roles
        .remove(roles)
        .catch(() => {});

      await target.roles
        .add(
          IDS.roles.kayitsiz
        )
        .catch(() => {});

      return message.reply(
        `✅ <@${target.id}> Kayıtsız yapıldı.`
      );
    }

    /* ARA */

    if (cmd === "ara") {
      const query =
        args.join(" ");

      if (!query) {
        return message.reply(
          "❌ Oyuncu adı yaz."
        );
      }

      const players =
        await searchPlayers(
          message,
          query
        );

      return message.reply({
        embeds: [
          makeEmbed(
            "🔎 Oyuncu Arama",
            players.length
              ? players
                  .map(
                    (m, i) =>
                      `${i + 1}. **${playerName(
                        m
                      )}** — <@${m.id}>`
                  )
                  .join("\n")
              : "❌ Oyuncu bulunamadı."
          )
        ]
      });
    }

    /* DEĞER */

    if (
      cmd ===
        "değer" ||
      cmd ===
        "deger"
    ) {
      const target =
        getMentionedMember(
          message
        );

      if (
        !target ||
        target.roles.cache.has(
          IDS.roles.kayitsiz
        )
      ) {
        return message.reply(
          "❌ Kayıtlı oyuncu belirt."
        );
      }

      return message.reply({
        embeds: [
          makeEmbed(
            "💰 Oyuncu Değeri",
            `👤 **${playerName(
              target
            )}**\n💶 Değer: **${money(
              parseNickValue(
                target
              )
            )}**`,
            0xf1c40f
          )
        ]
      });
    }

    /* DEĞER LİSTESİ */

    if (
      cmd ===
        "değerliste" ||
      cmd ===
        "degerliste"
    ) {
      await message.guild.members
        .fetch()
        .catch(() => {});

      const players =
        [...message.guild.members.cache.values()]
          .filter(
            m =>
              !m.user.bot &&
              !m.roles.cache.has(
                IDS.roles.kayitsiz
              )
          )
          .map(m => [
            m,
            parseNickValue(m)
          ])
          .sort(
            (a, b) =>
              b[1] - a[1]
          )
          .slice(0, 10);

      return message.reply({
        embeds: [
          makeEmbed(
            "🏆 AXERA LEAGUE — DEĞER LİSTESİ",
            players.length
              ? players
                  .map(
                    (x, i) =>
                      `${i + 1}. **${playerName(
                        x[0]
                      )}** — **${money(
                        x[1]
                      )}**`
                  )
                  .join("\n")
              : "❌ Kayıtlı oyuncu yok.",
            0xf1c40f
          )
        ]
      });
    }

    /* DVER / DSİL */

    if (
      cmd === "dver" ||
      cmd === "dsil"
    ) {
      if (
        !onlyChannel(
          message,
          IDS.channels.deger
        )
      )
        return;

      if (
        !isAdmin(
          message.member
        ) &&
        !hasRole(
          message.member,
          [IDS.roles.deger]
        )
      ) {
        return message.reply(
          "❌ Değer yetkilisi değilsin."
        );
      }

      const target =
        getMentionedMember(
          message
        );

      const amountText =
        args.find(
          x =>
            /^\d+(?:\.\d+)?M?€?$/i.test(
              x
            )
        );

      const amount =
        amountArg(
          amountText
        );

      if (
        !target ||
        !amount
      ) {
        return message.reply(
          `❌ Kullanım: .${cmd} @Oyuncu 5M`
        );
      }

      const result =
        await changePlayerValue(
          target,
          cmd === "dver"
            ? amount
            : -amount,
          cmd === "dver"
            ? "Manuel değer ekleme"
            : "Manuel değer çıkarma"
        );

      return message.reply(
        `✅ **${playerName(
          target
        )}**: **${money(
          result.oldValue
        )} → ${money(
          result.newValue
        )}**`
      );
    }

    /* ANTRENMAN */

    if (
      cmd === "ant" ||
      cmd ===
        "antrenman"
    ) {
      return doTraining(
        message
      );
    }

    /* PENALTI */

    if (
      cmd === "pen" ||
      cmd ===
        "penaltı" ||
      cmd ===
        "penalti"
    ) {
      return doPenalty(
        message
      );
    }

    /* İLK 11 */

    if (
      cmd ===
      "ilk11"
    ) {
      if (
        !isAdmin(
          message.member
        ) &&
        !hasRole(
          message.member,
          [
            IDS.roles.spiker,
            IDS.roles.td
          ]
        )
      ) {
        return message.reply(
          "❌ İlk 11 yetkin yok."
        );
      }

      let team =
        message.mentions.roles.first()
          ?.name ||
        teamByName(
          args.join(" ")
        );

      const ownTeams =
        getUserTeams(
          message.guild,
          message.member
        );

      if (
        !isAdmin(
          message.member
        ) &&
        !hasRole(
          message.member,
          [IDS.roles.spiker]
        )
      ) {
        if (
          team &&
          !ownTeams.includes(
            team
          )
        ) {
          return message.reply(
            "❌ Sadece kendi takımının İlk 11'ini düzenleyebilirsin."
          );
        }

        if (!team) {
          if (
            ownTeams.length === 1
          ) {
            team =
              ownTeams[0];
          } else {
            return message.reply(
              "❌ Takım belirt: `.ilk11 @Takım`"
            );
          }
        }
      }

      if (!team) {
        return message.reply(
          "❌ Takım belirt."
        );
      }

      return sendFirst11Panel(
        message,
        team
      );
    }

    /* MAÇ */

    if (
      cmd === "maç" ||
      cmd === "mac"
    ) {
      if (
        !onlyChannel(
          message,
          IDS.channels.mac
        )
      )
        return;

      if (
        !isAdmin(
          message.member
        ) &&
        !hasRole(
          message.member,
          [IDS.roles.spiker]
        )
      ) {
        return message.reply(
          "❌ Spiker yetkin yok."
        );
      }

      const roles =
        [...message.mentions.roles.values()];

      let teamA =
        roles[0]?.name;

      let teamB =
        roles[1]?.name;

      if (
        !teamA ||
        !teamB
      ) {
        const teams =
          args
            .map(
              teamByName
            )
            .filter(Boolean);

        teamA =
          teamA ||
          teams[0];

        teamB =
          teamB ||
          teams[1];
      }

      if (
        !teamA ||
        !teamB ||
        teamA === teamB
      ) {
        return message.reply(
          "❌ Kullanım: `.maç @Takım1 @Takım2`"
        );
      }

      return runMatch(
        message,
        teamA,
        teamB
      );
    }

    /* TAKIM */

    if (
      [
        "takımekle",
        "takımkaldır",
        "puanekle",
        "takımdeğer"
      ].includes(cmd)
    ) {
      if (
        !isAdmin(
          message.member
        ) &&
        !hasRole(
          message.member,
          [IDS.roles.spiker]
        )
      ) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const role =
        message.mentions.roles.first();

      const name =
        role?.name ||
        teamByName(
          args
            .filter(
              x =>
                !/^<@&\d+>$/.test(
                  x
                )
            )
            .join(" ")
        );

      if (!name) {
        return message.reply(
          "❌ Takım belirt."
        );
      }

      if (
        cmd ===
        "takımekle"
      ) {
        ensureTeam(
          name,
          role?.id
        );

        saveData();

        return message.reply(
          `✅ **${name}** lige eklendi.`
        );
      }

      const actual =
        teamByName(name) ||
        name;

      if (
        cmd ===
        "takımkaldır"
      ) {
        if (
          IDS.teams[
            actual
          ]
        ) {
          db.teams[
            actual
          ] = {
            players: [],
            score: 0,
            gd: 0,
            gf: 0,
            ga: 0,
            roleId:
              IDS.teams[
                actual
              ],
            teamValue: 0,
            formation:
              "4-3-3",
            ilk11: {}
          };
        } else {
          delete db.teams[
            actual
          ];
        }

        saveData();

        return message.reply(
          `✅ **${actual}** ligden kaldırıldı.`
        );
      }

      if (
        cmd ===
        "puanekle"
      ) {
        const amount =
          Number(
            args.at(-1)
          );

        if (
          !Number.isFinite(
            amount
          ) ||
          amount <= 0
        ) {
          return message.reply(
            "❌ Puan miktarı belirt."
          );
        }

        ensureTeam(
          actual
        ).score +=
          amount;

        saveData();

        return message.reply(
          `✅ **${actual}** takımına **+${amount} puan** eklendi.`
        );
      }

      if (
        cmd ===
        "takımdeğer"
      ) {
        const value =
          amountArg(
            args.at(-1)
          );

        if (!value) {
          return message.reply(
            "❌ Takım değeri belirt."
          );
        }

        ensureTeam(
          actual
        ).teamValue =
          value;

        saveData();

        return message.reply(
          `✅ **${actual}** takım değeri: **${money(value)}**`
        );
      }
    }

    /* FORMASYON */

    if (
      cmd ===
      "formasyon"
    ) {
      if (
        !isAdmin(
          message.member
        ) &&
        !hasRole(
          message.member,
          [IDS.roles.spiker]
        )
      ) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const team =
        message.mentions.roles.first()
          ?.name ||
        teamByName(
          args.join(" ")
        );

      if (!team) {
        return message.reply(
          "❌ Takım belirt."
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
            "formation_select"
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
                  `${team}||${formation}`
              })
            )
          );

      return message.reply({
        components: [
          new ActionRowBuilder()
            .addComponents(
              menu
            )
        ]
      });
    }

    /* PUAN */

    if (
      cmd === "puan"
    ) {
      return postStandings(
        message.guild
      );
    }

    /* FİKSTÜR EKLE */

    if (
      cmd ===
      "fiksturekle"
    ) {
      if (
        !isAdmin(
          message.member
        ) &&
        !hasRole(
          message.member,
          [IDS.roles.spiker]
        )
      ) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const roles =
        [...message.mentions.roles.values()];

      let teamA =
        roles[0]?.name;

      let teamB =
        roles[1]?.name;

      const names =
        Object.keys(
          IDS.teams
        ).sort(
          (a, b) =>
            b.length -
            a.length
        );

      let remaining =
        args
          .filter(
            x =>
              !/^\d{4}-\d{2}-\d{2}$/.test(
                x
              ) &&
              !/^\d{2}:\d{2}$/.test(
                x
              )
          )
          .join(" ");

      if (
        !teamA ||
        !teamB
      ) {
        for (
          const name of
            names
        ) {
          if (
            normalize(
              remaining
            ).startsWith(
              normalize(name)
            )
          ) {
            teamA =
              teamA ||
              name;

            remaining =
              remaining
                .slice(
                  name.length
                )
                .trim();

            break;
          }
        }

        for (
          const name of
            names
        ) {
          if (
            normalize(
              remaining
            ).startsWith(
              normalize(name)
            )
          ) {
            teamB =
              teamB ||
              name;

            break;
          }
        }
      }

      const date =
        args.find(
          x =>
            /^\d{4}-\d{2}-\d{2}$/.test(
              x
            )
        );

      const time =
        args.find(
          x =>
            /^\d{2}:\d{2}$/.test(
              x
            )
        );

      if (
        !teamA ||
        !teamB ||
        !date ||
        !time
      ) {
        return message.reply(
          "❌ Kullanım: `.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`"
        );
      }

      const timestamp =
        new Date(
          `${date}T${time}:00+03:00`
        ).getTime();

      if (
        !Number.isFinite(
          timestamp
        )
      ) {
        return message.reply(
          "❌ Tarih geçersiz."
        );
      }

      db.fixtures.push({
        id:
          db.nextFixtureId++,
        guildId:
          message.guild.id,
        teamA,
        teamB,
        date,
        time,
        timestamp,
        started: false
      });

      saveData();

      return message.reply(
        `✅ **${teamA} - ${teamB}** fikstüre eklendi.\n📅 ${date} ${time}`
      );
    }

    /* FİKSTÜR */

    if (
      cmd ===
        "fikstür" ||
      cmd ===
        "fikstur"
    ) {
      const fixtures =
        db.fixtures.filter(
          fixture =>
            fixture.guildId ===
              message.guild.id &&
            !fixture.started
        );

      return message.reply({
        embeds: [
          makeEmbed(
            "📅 Axera League Fikstür",
            fixtures.length
              ? fixtures
                  .slice(0, 20)
                  .map(
                    fixture =>
                      `• **${fixture.teamA} - ${fixture.teamB}** — ${fixture.date} ${fixture.time}`
                  )
                  .join("\n")
              : "Fikstür boş."
          )
        ]
      });
    }

    /* FİKSTÜR ÇIKAR */

    if (
      cmd ===
      "fiksturcikar"
    ) {
      if (
        !isAdmin(
          message.member
        ) &&
        !hasRole(
          message.member,
          [IDS.roles.spiker]
        )
      ) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const roles =
        [...message.mentions.roles.values()];

      let teamA =
        roles[0]?.name;

      let teamB =
        roles[1]?.name;

      const teams =
        args
          .map(
            teamByName
          )
          .filter(Boolean);

      teamA =
        teamA ||
        teams[0];

      teamB =
        teamB ||
        teams[1];

      if (
        !teamA ||
        !teamB
      ) {
        return message.reply(
          "❌ İki takım belirt."
        );
      }

      const index =
        db.fixtures.findIndex(
          fixture =>
            fixture.guildId ===
              message.guild.id &&
            !fixture.started &&
            fixture.teamA ===
              teamA &&
            fixture.teamB ===
              teamB
        );

      if (index === -1) {
        return message.reply(
          "❌ Fikstür bulunamadı."
        );
      }

      db.fixtures.splice(
        index,
        1
      );

      saveData();

      return message.reply(
        "✅ Fikstür silindi."
      );
    }

    /* BÜTÇE */

    if (
      cmd ===
        "bütçeekle" ||
      cmd ===
        "bütçesil"
    ) {
      if (
        !isAdmin(
          message.member
        ) &&
        !hasRole(
          message.member,
          [IDS.roles.deger]
        )
      ) {
        return message.reply(
          "❌ Değer yetkilisi değilsin."
        );
      }

      const target =
        getMentionedMember(
          message
        );

      const amount =
        amountArg(
          args.find(
            x =>
              /^\d+(?:\.\d+)?M?€?$/i.test(
                x
              )
          )
        );

      if (
        !target ||
        !amount
      ) {
        return message.reply(
          "❌ Kullanım: `.bütçeekle @Oyuncu 50M`"
        );
      }

      const user =
        ensureBudget(
          target
        );

      user.budget =
        Math.max(
          0,
          user.budget +
            (
              cmd ===
              "bütçeekle"
                ? amount
                : -amount
            )
        );

      saveData();

      return message.reply(
        `💳 **${playerName(
          target
        )}** kişisel bütçesi: **${money(
          user.budget
        )}**`
      );
    }

    /* GÖNDER */

    if (
      cmd ===
      "gönder"
    ) {
      const target =
        getMentionedMember(
          message
        );

      const amount =
        amountArg(
          args.find(
            x =>
              /^\d+(?:\.\d+)?M?€?$/i.test(
                x
              )
          )
        );

      if (
        !target ||
        !amount
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
          "❌ Kendine bütçe gönderemezsin."
        );
      }

      const sender =
        ensureBudget(
          message.member
        );

      const receiver =
        ensureBudget(
          target
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
        `✅ **${money(
          amount
        )}** <@${target.id}> oyuncusuna gönderildi.`
      );
    }

    /* SİL */

    if (
      cmd === "sil"
    ) {
      if (
        !isAdmin(
          message.member
        )
      ) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const amount =
        Math.min(
          Math.max(
            Number(
              args[0]
            ) || 0,
            1
          ),
          1000
        );

      const deleted =
        await message.channel
          .bulkDelete(
            amount,
            true
          )
          .catch(
            () => null
          );

      return message.channel
        .send(
          `🧹 **${deleted?.size || 0}** mesaj silindi.`
        )
        .then(
          msg =>
            setTimeout(
              () =>
                msg
                  .delete()
                  .catch(
                    () => {}
                  ),
              2500
            )
        );
    }

    /* EMBED */

    if (
      cmd === "embed"
    ) {
      if (
        !isAdmin(
          message.member
        )
      ) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const [title, description] =
        raw
          .slice(
            cmd.length
          )
          .trim()
          .split("|")
          .map(
            x =>
              x?.trim()
          );

      if (
        !title ||
        !description
      ) {
        return message.reply(
          "❌ Kullanım: `.embed Başlık | Açıklama`"
        );
      }

      return message.channel.send({
        embeds: [
          makeEmbed(
            title,
            description
          )
        ]
      });
    }

    /* KICK BAN MUTE */

    if (
      [
        "kick",
        "ban",
        "mute",
        "unmute"
      ].includes(cmd)
    ) {
      if (
        !isAdmin(
          message.member
        )
      ) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const target =
        getMentionedMember(
          message
        );

      if (!target) {
        return message.reply(
          "❌ Oyuncu belirt."
        );
      }

      try {
        if (
          cmd === "kick"
        ) {
          await target.kick(
            "Axera League"
          );
        }

        if (
          cmd === "ban"
        ) {
          await target.ban({
            reason:
              "Axera League"
          });
        }

        if (
          cmd === "mute"
        ) {
          await target.timeout(
            28 *
              24 *
              60 *
              60 *
              1000,
            "Axera League"
          );
        }

        if (
          cmd ===
          "unmute"
        ) {
          await target.timeout(
            null,
            "Axera League"
          );
        }
      } catch {
        return message.reply(
          "❌ İşlem yapılamadı."
        );
      }

      return message.reply(
        `✅ **${cmd}** işlemi tamamlandı.`
      );
    }

    /* DM */

    if (
      cmd === "dm"
    ) {
      if (
        !isAdmin(
          message.member
        )
      ) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const target =
        getMentionedMember(
          message
        );

      const text =
        args
          .filter(
            x =>
              !/^<@!?\d+>$/.test(
                x
              )
          )
          .join(" ");

      if (
        !target ||
        !text
      ) {
        return message.reply(
          "❌ Kullanım: `.dm @Oyuncu mesaj`"
        );
      }

      const sent =
        await target.send(
          text
        ).then(
          () => true
        )
        .catch(
          () => false
        );

      return message.reply(
        sent
          ? "✅ DM gönderildi."
          : "❌ DM gönderilemedi."
      );
    }

    /* TWEET */

    if (
      cmd === "tweet"
    ) {
      if (
        !onlyChannel(
          message,
          IDS.channels.tweet
        )
      )
        return;

      const text =
        args.join(" ");

      if (!text) {
        return message.reply(
          "❌ Tweet metni yaz."
        );
      }

      await message.delete()
        .catch(() => {});

      const last =
        db.tweetCooldowns[
          message.author.id
        ] || 0;

      let reward = "";

      if (
        Date.now() - last >=
        2 * 60 * 60 * 1000
      ) {
        db.tweetCooldowns[
          message.author.id
        ] = Date.now();

        await changePlayerValue(
          message.member,
          10,
          "Tweet ödülü +10M€"
        );

        reward =
          "\n💰 **+10M€** ödül kazandın!";
      }

      saveData();

      return message.channel.send({
        embeds: [
          makeEmbed(
            "🐦 Tweet",
            `${text}${reward}\n\n— **${playerName(
              message.member
            )}**`
          )
        ]
      });
    }

    /* ROL PANEL */

    if (
      cmd ===
      "rolpanel"
    ) {
      if (
        !isAdmin(
          message.member
        )
      ) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      const roles = [
        [
          IDS.roles.partner,
          "🤝 Partner Ping"
        ],
        [
          IDS.roles.macPing,
          "⚽ Maç Ping"
        ],
        [
          IDS.roles.duyuru,
          "📢 Duyuru Ping"
        ],
        [
          IDS.roles.cekilis,
          "🎁 Çekiliş Ping"
        ],
        [
          IDS.roles.medya,
          "🎥 Medya Ping"
        ]
      ];

      return message.channel.send({
        embeds: [
          makeEmbed(
            "🎭 Bildirim Rol Paneli",
            "İstediğin bildirim rolünü butonlardan açıp kapatabilirsin."
          )
        ],

        components: [
          new ActionRowBuilder()
            .addComponents(
              roles.map(
                ([id, label]) =>
                  new ButtonBuilder()
                    .setCustomId(
                      `role_${id}`
                    )
                    .setLabel(
                      label
                    )
                    .setStyle(
                      ButtonStyle.Secondary
                    )
              )
            )
        ]
      });
    }

    /* ŞART */

    if (
      cmd ===
        "şart" ||
      cmd ===
        "sart"
    ) {
      return message.reply({
        embeds: [
          makeEmbed(
            "📌 Axera League Şartları",
            "ℹ️ Sunucu şartları bilgilendirme amaçlıdır."
          )
        ]
      });
    }

    /* TICKET PANEL */

    if (
      cmd ===
      "ticketpanel"
    ) {
      if (
        !isAdmin(
          message.member
        )
      ) {
        return message.reply(
          "❌ Yetkin yok."
        );
      }

      return message.channel.send({
        embeds: [
          makeEmbed(
            "🎫 Axera League Destek",
            "Yardıma ihtiyacın varsa aşağıdaki butona bas."
          )
        ],

        components: [
          new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(
                  "ticket_create"
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

    /* AI */

    if (
      cmd === "ai" ||
      cmd ===
        "yapayzeka"
    ) {
      const question =
        args.join(" ");

      if (!question) {
        return message.reply(
          "❌ Soru yaz."
        );
      }

      return aiReply(
        message,
        question
      );
    }
  }
);

/* =========================
   OTOMATİK SİSTEMLER
========================= */

let lastStatusKey = "";

setInterval(
  async () => {
    await startDueFixtures()
      .catch(console.error);

    for (
      const [
        channelId,
        ticket
      ] of Object.entries(
        db.tickets
      )
    ) {
      if (
        ticket.open &&
        Date.now() -
          ticket.lastActivity >
          60 * 60 * 1000
      ) {
        ticket.open = false;
        saveData();

        const channel =
          client.channels.cache.get(
            channelId
          );

        if (channel) {
          await channel
            .delete()
            .catch(() => {});
        }
      }
    }

    const date =
      new Date();

    const key =
      `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`;

    if (
      (
        date.getMinutes() === 0 ||
        date.getMinutes() === 30
      ) &&
      key !==
        lastStatusKey
    ) {
      lastStatusKey =
        key;

      const channel =
        client.channels.cache.get(
          IDS.channels.durum
        );

      if (channel) {
        const messages =
          await channel.messages
            .fetch({
              limit: 100
            })
            .catch(
              () => null
            );

        if (messages) {
          for (
            const msg of
              messages.values()
          ) {
            if (
              msg.author.id ===
              client.user.id
            ) {
              await msg.delete()
                .catch(
                  () => {}
                );
            }
          }
        }

        const total =
          client.guilds.cache.reduce(
            (sum, guild) =>
              sum +
              guild.memberCount,
            0
          );

        await channel.send({
          embeds: [
            makeEmbed(
              "🟢 Axera League Bot Durumu",
              `**Tüm sistemler sorunsuz çalışıyor.**\n\n📡 Ping: **${client.ws.ping}ms**\n🏠 Sunucu: **${client.guilds.cache.size}**\n👥 Kullanıcı: **${total}**\n🕐 ${new Date().toLocaleString("tr-TR")}`,
              0x57f287
            )
          ]
        }).catch(() => {});
      }
    }
  },
  1000
);

/* =========================
   BOT
========================= */

client.once(
  "ready",
  () => {
    console.log(
      `Axera League aktif: ${client.user.tag}`
    );

    client.user.setPresence({
      activities: [
        {
          name:
            "Axera League",
          type: 1,
          url:
            process.env.STREAM_URL ||
            "https://www.twitch.tv/axeraleague"
        }
      ],
      status: "online"
    });
  }
);

process.on(
  "unhandledRejection",
  error =>
    console.error(
      "UNHANDLED:",
      error
    )
);

process.on(
  "uncaughtException",
  error =>
    console.error(
      "UNCAUGHT:",
      error
    )
);

client.login(TOKEN);
