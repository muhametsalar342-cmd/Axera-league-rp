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
const path = require("path");

/* =========================================================
   AXERA LEAGUE
   TEK PARÇA BOT
   ========================================================= */

const PREFIX = ".";

const IDS = {
  roles: {
    admin: "1534455282426445897",
    registration: "1534456315366342716",
    value: "1534456192913375382",
    unregistered: "1534457560134844517",
    player: "1534457228986421278",
    td: "1534456648930693120",
    member: "1534457460163608636",
    moderator: "1534456108415189063",
    commentator: "1535251168169697390"
  },

  channels: {
    registration: "1547371464515133470",
    chat: "1547374641763455009",
    training: "1547375589923618957",
    penalty: "1547375997698052166",
    tweet: "1547377797193011340",
    match: "1547376935410073692",
    standings: "1547382143775285431",
    value: "1547376344927834122",
    botStatus: "1547388197796057118",
    ai: "1547375186754408539"
  },

  pingRoles: {
    media: "1547393966553440346",
    partner: "1547393545827123230",
    match: "1547393416755941509",
    announcement: "1547393331297001522",
    giveaway: "1545116885589430312"
  }
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

const COMMAND_COUNT = 45;
const AI_MODEL = "gpt-5.6-luna";

/* =========================================================
   CLIENT
   ========================================================= */

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
   OPENAI
   ========================================================= */

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
  : null;

/* =========================================================
   DATA
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
  matchRewards: {},
  playerMatchHistory: {},
  penalties: {},
  stats: {},
  matchHistory: [],
  aiMemory: {}
};

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(DEFAULT_DATA, null, 2)
      );

      return structuredClone(DEFAULT_DATA);
    }

    const parsed = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );

    return {
      ...structuredClone(DEFAULT_DATA),
      ...parsed
    };
  } catch (error) {
    console.error("DATA HATASI:", error);

    try {
      fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(DEFAULT_DATA, null, 2)
      );
    } catch {}

    return structuredClone(DEFAULT_DATA);
  }
}

let data = loadData();

let saveTimer = null;

function saveData() {
  clearTimeout(saveTimer);

  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(data, null, 2)
      );
    } catch (error) {
      console.error("DATA KAYDETME HATASI:", error);
    }
  }, 200);
}

/* =========================================================
   GENEL FONKSİYONLAR
   ========================================================= */

function isAdmin(member) {
  return Boolean(
    member &&
    (
      member.permissions?.has(
        PermissionsBitField.Flags.Administrator
      ) ||
      member.roles?.cache?.has(IDS.roles.admin)
    )
  );
}

function hasRole(member, roleId) {
  return Boolean(
    member?.roles?.cache?.has(roleId)
  );
}

function isRegistrationStaff(member) {
  return (
    isAdmin(member) ||
    hasRole(member, IDS.roles.registration)
  );
}

function isValueStaff(member) {
  return (
    isAdmin(member) ||
    hasRole(member, IDS.roles.value)
  );
}

function isCommentator(member) {
  return (
    isAdmin(member) ||
    hasRole(member, IDS.roles.commentator)
  );
}

function isModerator(member) {
  return (
    isAdmin(member) ||
    hasRole(member, IDS.roles.moderator)
  );
}

function normalize(text) {
  return String(text || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatMoney(value) {
  return `${Number(value || 0)}M€`;
}

function parseMoney(input) {
  if (!input) return null;

  const value = String(input)
    .trim()
    .toUpperCase()
    .replace(/€/g, "")
    .replace(/M/g, "");

  if (!/^\d+(?:\.\d+)?$/.test(value)) {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }

  return number;
}

function ensureUser(userId) {
  if (!data.users[userId]) {
    data.users[userId] = {
      value: null,
      registered: false,
      training: 0
    };
  }

  return data.users[userId];
}

/* =========================================================
   ÖNEMLİ DEĞER SİSTEMİ
   ========================================================= */

/*
   Kullanıcının kayıtlı değeri varsa onu kullanır.
   Ancak data.json'da değer yoksa nickname'deki M€ değerini
   okuyup başlangıç değeri olarak kaydeder.

   Örnek:
   Nickname: W.Sneijder | 🇵🇹 | SNT | 50M€

   data.json değeri yoksa:
   50M€ olarak alınır.

   .dver @W.Sneijder 5M
   => 50 + 5 = 55M€

   .dsil @W.Sneijder 10M
   => 55 - 10 = 45M€
*/

function readNicknameValue(member) {
  const nickname =
    member.displayName ||
    member.user?.username ||
    "";

  const match =
    nickname.match(/(\d+(?:\.\d+)?)M€\s*$/i);

  if (!match) {
    return null;
  }

  const value = Number(match[1]);

  if (!Number.isFinite(value)) {
    return null;
  }

  return value;
}

function getValue(memberOrId, guild = null) {
  let userId;
  let member = null;

  if (typeof memberOrId === "string") {
    userId = memberOrId;

    if (guild) {
      member =
        guild.members.cache.get(userId) || null;
    }
  } else {
    member = memberOrId;
    userId = member.id;
  }

  const user = ensureUser(userId);

  /*
   * Daha önce kayıtlı bir değer varsa onu kullan.
   */
  if (
    user.value !== null &&
    user.value !== undefined &&
    Number.isFinite(Number(user.value))
  ) {
    return Number(user.value);
  }

  /*
   * data.json'da değer yoksa nickname'den al.
   */
  if (member) {
    const nicknameValue =
      readNicknameValue(member);

    if (nicknameValue !== null) {
      user.value = nicknameValue;
      saveData();

      return nicknameValue;
    }
  }

  return 0;
}

function setValue(member, value) {
  const newValue =
    Math.max(
      0,
      Math.min(
        1000,
        Number(value) || 0
      )
    );

  const user = ensureUser(member.id);

  user.value = newValue;

  saveData();

  return newValue;
}

function addValue(member, amount) {
  const oldValue =
    getValue(member, member.guild);

  return setValue(
    member,
    oldValue + Number(amount || 0)
  );
}

function removeValue(member, amount) {
  const oldValue =
    getValue(member, member.guild);

  return setValue(
    member,
    oldValue - Number(amount || 0)
  );
}

async function updateNicknameValue(
  member,
  newValue
) {
  const nickname =
    member.displayName ||
    member.user.username;

  const regex =
    /(\d+(?:\.\d+)?)M€\s*$/i;

  let newNickname;

  if (regex.test(nickname)) {
    /*
     * Sadece sondaki M€ kısmını değiştirir.
     * İsim, bayrak ve pozisyon korunur.
     */
    newNickname =
      nickname.replace(
        regex,
        `${newValue}M€`
      );
  } else {
    /*
     * Eski nickname'de değer yoksa sonuna ekler.
     */
    newNickname =
      `${nickname} | ${newValue}M€`;
  }

  newNickname =
    newNickname.substring(0, 32);

  try {
    await member.setNickname(
      newNickname
    );
  } catch (error) {
    console.error(
      "NICKNAME DEĞİŞTİRME HATASI:",
      error.message
    );
  }
}

/* =========================================================
   GÜVENLİ MESAJ
   ========================================================= */

async function safeReply(
  message,
  payload
) {
  try {
    return await message.reply(
      typeof payload === "string"
        ? { content: payload }
        : payload
    );
  } catch (error) {
    console.error(
      "REPLY HATASI:",
      error.message
    );

    return null;
  }
}

async function safeSend(
  channel,
  payload
) {
  try {
    if (!channel?.isTextBased?.()) {
      return null;
    }

    return await channel.send(payload);
  } catch (error) {
    console.error(
      "SEND HATASI:",
      error.message
    );

    return null;
  }
}

async function safeDelete(message) {
  try {
    if (message?.deletable) {
      await message.delete();
    }
  } catch {}
}

function onlyChannel(
  message,
  channelId
) {
  if (message.channel.id !== channelId) {
    safeReply(
      message,
      `❌ Bu komut <#${channelId}> kanalında kullanılmalıdır.`
    );

    return false;
  }

  return true;
}

/* =========================================================
   KAYIT
   ========================================================= */

async function handleRegister(
  message,
  args
) {
  if (
    !onlyChannel(
      message,
      IDS.channels.registration
    )
  ) return;

  if (
    !isRegistrationStaff(
      message.member
    )
  ) {
    return safeReply(
      message,
      "❌ Kayıt panelini yalnızca **Kayıt Yetkilisi** veya **Yönetici** kullanabilir."
    );
  }

  const target =
    message.mentions.members.first();

  if (!target) {
    return safeReply(
      message,
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
    return safeReply(
      message,
      "❌ Kullanıcının kayıt ismini yazmalısın."
    );
  }

  const embed =
    new EmbedBuilder()
      .setTitle("📝 Axera League Kayıt")
      .setDescription(
        `${target} için kayıt türünü seç.\n\n` +
        `📝 **İsim:** ${nickname}\n` +
        `🛡️ **Yetkili:** ${message.author}`
      )
      .setTimestamp();

  const row =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            `reg_player_${target.id}`
          )
          .setLabel("Futbolcu")
          .setEmoji("⚽")
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            `reg_member_${target.id}`
          )
          .setLabel("Üye")
          .setEmoji("👤")
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            `reg_td_${target.id}`
          )
          .setLabel("Teknik Direktör")
          .setEmoji("🧑‍💼")
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            `reg_gk_${target.id}`
          )
          .setLabel("Kaleci")
          .setEmoji("🧤")
          .setStyle(
            ButtonStyle.Primary
          )
      );

  const panel =
    await safeSend(
      message.channel,
      {
        embeds: [embed],
        components: [row]
      }
    );

  if (panel) {
    data.registrationPanels[
      panel.id
    ] = {
      targetId: target.id,
      nickname,
      staffId: message.author.id
    };

    saveData();
  }
}

async function registerMember(
  member,
  type,
  nickname
) {
  const removeRoles = [
    IDS.roles.unregistered,
    IDS.roles.player,
    IDS.roles.member,
    IDS.roles.td
  ];

  for (const roleId of removeRoles) {
    try {
      if (
        member.roles.cache.has(roleId)
      ) {
        await member.roles.remove(
          roleId
        );
      }
    } catch {}
  }

  let roleId =
    IDS.roles.player;

  if (type === "member") {
    roleId =
      IDS.roles.member;
  }

  if (type === "td") {
    roleId =
      IDS.roles.td;
  }

  if (type === "gk") {
    roleId =
      IDS.roles.player;
  }

  try {
    await member.roles.add(
      roleId
    );
  } catch {}

  try {
    await member.setNickname(
      nickname.substring(0, 32)
    );
  } catch {}

  const user =
    ensureUser(member.id);

  user.registered = true;

  /*
   * Yeni kayıt sırasında nickname'de M€ varsa
   * başlangıç değeri olarak sakla.
   */
  const nicknameValue =
    readNicknameValue(member);

  if (
    nicknameValue !== null
  ) {
    user.value =
      nicknameValue;
  }

  saveData();

  return roleId;
}

async function handleUnregister(
  message
) {
  if (
    !isRegistrationStaff(
      message.member
    )
  ) {
    return safeReply(
      message,
      "❌ Bu komut Kayıt Yetkilisi/Yönetici içindir."
    );
  }

  const target =
    message.mentions.members.first();

  if (!target) {
    return safeReply(
      message,
      "❌ Kullanım: `.kayıtsızver @Oyuncu`"
    );
  }

  for (const roleId of [
    IDS.roles.player,
    IDS.roles.member,
    IDS.roles.td
  ]) {
    try {
      await target.roles.remove(
        roleId
      );
    } catch {}
  }

  try {
    await target.roles.add(
      IDS.roles.unregistered
    );
  } catch {}

  ensureUser(
    target.id
  ).registered = false;

  saveData();

  safeReply(
    message,
    `✅ ${target} tekrar **Kayıtsız** yapıldı.`
  );
}

/* =========================================================
   ARA
   ========================================================= */

async function handleSearch(
  message,
  args
) {
  const query =
    normalize(
      args.join(" ")
    );

  if (!query) {
    return safeReply(
      message,
      "❌ Kullanım: `.ara isim`"
    );
  }

  const results = [];

  for (
    const member
    of message.guild.members.cache.values()
  ) {
    if (member.user.bot) continue;

    if (
      member.roles.cache.has(
        IDS.roles.unregistered
      )
    ) continue;

    const names = [
      normalize(member.displayName),
      normalize(member.user.username)
    ];

    let score = 0;

    if (
      names.some(
        x => x === query
      )
    ) {
      score = 100;
    } else if (
      names.some(
        x => x.startsWith(query)
      )
    ) {
      score = 75;
    } else if (
      names.some(
        x => x.includes(query)
      )
    ) {
      score = 50;
    }

    if (score > 0) {
      results.push({
        member,
        score
      });
    }
  }

  results.sort(
    (a, b) =>
      b.score - a.score
  );

  if (!results.length) {
    return safeReply(
      message,
      "❌ Bu isimde veya benzer isimde kayıtlı oyuncu bulunamadı."
    );
  }

  const lines =
    results
      .slice(0, 20)
      .map(
        (item, index) => {
          const member =
            item.member;

          const role =
            member.roles.cache.has(
              IDS.roles.td
            )
              ? "Teknik Direktör"
              : member.roles.cache.has(
                  IDS.roles.player
                )
                ? "Futbolcu"
                : "Üye";

          return (
            `**${index + 1}. ${member.displayName}**\n` +
            `> Tür: **${role}**\n` +
            `> Değer: **${formatMoney(
              getValue(
                member,
                message.guild
              )
            )}**`
          );
        }
      );

  safeReply(
    message,
    `🔎 **Arama Sonuçları**\n\n${lines.join("\n\n")}`
  );
}

/* =========================================================
   DVER / DSİL
   ========================================================= */

async function handleValue(
  message,
  args,
  adding
) {
  if (
    !onlyChannel(
      message,
      IDS.channels.value
    )
  ) return;

  if (
    !isValueStaff(
      message.member
    )
  ) {
    return safeReply(
      message,
      "❌ Bu komut yalnızca **Değer Yetkilisi** veya **Yönetici** tarafından kullanılabilir."
    );
  }

  const target =
    message.mentions.members.first();

  if (!target) {
    return safeReply(
      message,
      `❌ Kullanım: \`.${adding ? "dver" : "dsil"} @Oyuncu 5M\``
    );
  }

  const amountArg =
    args.find(
      x =>
        /^\d+(?:\.\d+)?M?€?$/i.test(x)
    );

  const amount =
    parseMoney(amountArg);

  if (!amount) {
    return safeReply(
      message,
      "❌ Sadece M€ değeri gir.\nÖrnek: `5M` veya `5M€`"
    );
  }

  /*
   * BURASI ÖNEMLİ:
   * Önce mevcut nickname/data değerini okur.
   */
  const oldValue =
    getValue(
      target,
      message.guild
    );

  /*
   * DVER:
   * Eski + verilen
   *
   * DSİL:
   * Eski - verilen
   */
  const newValue =
    adding
      ? oldValue + amount
      : oldValue - amount;

  if (newValue > 1000) {
    return safeReply(
      message,
      "❌ Oyuncu değeri maksimum **1000M€** olabilir."
    );
  }

  if (newValue < 0) {
    return safeReply(
      message,
      "❌ Oyuncu değeri 0M€ altına düşemez."
    );
  }

  /*
   * Önce data.json'a kaydet.
   */
  setValue(
    target,
    newValue
  );

  /*
   * Sonra nickname'deki SADECE
   * son M€ kısmını değiştir.
   */
  await updateNicknameValue(
    target,
    newValue
  );

  const operation =
    adding
      ? "değer eklendi"
      : "değer çıkarıldı";

  safeReply(
    message,
    [
      `✅ **${operation}**`,
      "",
      `👤 Oyuncu: ${target}`,
      `📉 Eski değer: **${formatMoney(oldValue)}**`,
      `➕ İşlem: **${adding ? "+" : "-"}${formatMoney(amount)}**`,
      `📈 Yeni değer: **${formatMoney(newValue)}**`
    ].join("\n")
  );
}

/* =========================================================
   ANTRENMAN
   ========================================================= */

async function handleTraining(
  message
) {
  if (
    !onlyChannel(
      message,
      IDS.channels.training
    )
  ) return;

  const user =
    ensureUser(
      message.author.id
    );

  user.training =
    Number(user.training || 0) + 1;

  if (user.training >= 5) {
    user.training = 0;

    addValue(
      message.member,
      3
    );

    saveData();

    return safeReply(
      message,
      "🏋️ **ANTRENMAN TAMAMLANDI!**\n\n" +
      "📊 **5/5 → 0/5**\n" +
      "💰 **+3M€** değer kazandın."
    );
  }

  saveData();

  safeReply(
    message,
    `🏋️ Antrenman yapıldı!\n\n📊 İlerleme: **${user.training}/5**\n💰 5/5 olduğunda **+3M€**`
  );
}

/* =========================================================
   PENALTI
   ========================================================= */

async function handlePenalty(
  message
) {
  if (
    !onlyChannel(
      message,
      IDS.channels.penalty
    )
  ) return;

  const random =
    Math.random();

  if (random < 0.5) {
    addValue(
      message.member,
      5
    );

    return safeReply(
      message,
      "⚽ **GOOOL!**\n\n" +
      "🧤 Axera Kalecisi topu çıkaramadı.\n" +
      "💰 **+5M€** değer kazandın."
    );
  }

  if (random < 0.75) {
    return safeReply(
      message,
      "🥅 **DİREK!**\n\nTop direkten döndü."
    );
  }

  return safeReply(
    message,
    "🧤 **KURTARIŞ!**\n\nAxera Kalecisi penaltıyı kurtardı."
  );
}

/* =========================================================
   TWEET
   ========================================================= */

async function handleTweet(
  message,
  args
) {
  if (
    !onlyChannel(
      message,
      IDS.channels.tweet
    )
  ) return;

  const text =
    args.join(" ").trim();

  if (!text) {
    return safeReply(
      message,
      "❌ Kullanım: `.tweet mesaj`"
    );
  }

  const now =
    Date.now();

  const last =
    Number(
      data.tweetCooldowns[
        message.author.id
      ] || 0
    );

  if (
    now - last <
    24 * 60 * 60 * 1000
  ) {
    return safeReply(
      message,
      "⏳ Tweet ödülünü 24 saatte bir alabilirsin."
    );
  }

  data.tweetCooldowns[
    message.author.id
  ] = now;

  addValue(
    message.member,
    5
  );

  const embed =
    new EmbedBuilder()
      .setAuthor({
        name:
          message.member.displayName,
        iconURL:
          message.author.displayAvatarURL()
      })
      .setDescription(text)
      .setFooter({
        text:
          "Axera League • Tweet"
      })
      .setTimestamp();

  await safeDelete(message);

  await safeSend(
    message.channel,
    {
      embeds: [embed]
    }
  );

  saveData();
}

/* =========================================================
   TAKIM
   ========================================================= */

function ensureTeam(
  roleId,
  name
) {
  if (!data.teams[roleId]) {
    data.teams[roleId] = {
      name,
      value: 0,
      players: [],
      points: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      wins: 0,
      draws: 0,
      losses: 0
    };
  }

  return data.teams[roleId];
}

async function handleTeamAdd(
  message
) {
  if (
    !isCommentator(
      message.member
    )
  ) {
    return safeReply(
      message,
      "❌ Bu komut Spiker/Yönetici içindir."
    );
  }

  const role =
    message.mentions.roles.first();

  if (!role) {
    return safeReply(
      message,
      "❌ Kullanım: `.takımekle @Takım`"
    );
  }

  if (data.teams[role.id]) {
    return safeReply(
      message,
      "❌ Bu takım zaten sistemde."
    );
  }

  ensureTeam(
    role.id,
    role.name
  );

  data.standings[
    role.id
  ] = {
    name: role.name,
    points: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    wins: 0,
    draws: 0,
    losses: 0
  };

  saveData();

  safeReply(
    message,
    `✅ **${role.name}** takımı eklendi.`
  );
}

async function handleTeamRemove(
  message
) {
  if (
    !isCommentator(
      message.member
    )
  ) {
    return safeReply(
      message,
      "❌ Bu komut Spiker/Yönetici içindir."
    );
  }

  const role =
    message.mentions.roles.first();

  if (!role) {
    return safeReply(
      message,
      "❌ Kullanım: `.takımkaldır @Takım`"
    );
  }

  const active =
    Object.values(
      data.activeMatches
    ).some(
      match =>
        match.team1 === role.id ||
        match.team2 === role.id
    );

  if (active) {
    return safeReply(
      message,
      "❌ Aktif maçı olan takım kaldırılamaz."
    );
  }

  delete data.teams[
    role.id
  ];

  delete data.standings[
    role.id
  ];

  delete data.formations[
    role.id
  ];

  delete data.cups[
    role.id
  ];

  data.fixtures =
    data.fixtures.filter(
      fixture =>
        fixture.team1 !== role.id &&
        fixture.team2 !== role.id
    );

  saveData();

  safeReply(
    message,
    `✅ **${role.name}** sistemden kaldırıldı.`
  );
}

async function handleTeamValue(
  message,
  args
) {
  if (
    !isCommentator(
      message.member
    )
  ) {
    return safeReply(
      message,
      "❌ Bu komut Spiker/Yönetici içindir."
    );
  }

  const role =
    message.mentions.roles.first();

  const amountArg =
    args.find(
      x =>
        /^\d+(?:\.\d+)?M?€?$/i.test(x)
    );

  const amount =
    parseMoney(amountArg);

  if (!role || !amount) {
    return safeReply(
      message,
      "❌ Kullanım: `.takımdeğer @Takım 850M`"
    );
  }

  if (amount > 1000) {
    return safeReply(
      message,
      "❌ Takım değeri maksimum 1000M€."
    );
  }

  const team =
    ensureTeam(
      role.id,
      role.name
    );

  team.value =
    amount;

  saveData();

  safeReply(
    message,
    `✅ **${role.name}** takım değeri **${formatMoney(amount)}** oldu.`
  );
}

/* =========================================================
   KADRO
   ========================================================= */

async function handleSquadAdd(
  message,
  args
) {
  if (
    !isCommentator(
      message.member
    )
  ) {
    return safeReply(
      message,
      "❌ Bu komut Spiker/Yönetici içindir."
    );
  }

  const role =
    message.mentions.roles.first();

  const player =
    message.mentions.members.first();

  if (!role || !player) {
    return safeReply(
      message,
      "❌ Kullanım: `.kadroekle @Takım @Oyuncu Pozisyon`"
    );
  }

  const position =
    args
      .filter(
        x => !/^<@&\d+>$/.test(x)
      )
      .filter(
        x => !/^<@!?\d+>$/.test(x)
      )
      .join(" ")
      .trim();

  if (!position) {
    return safeReply(
      message,
      "❌ Pozisyon yazmalısın."
    );
  }

  const team =
    ensureTeam(
      role.id,
      role.name
    );

  team.players =
    team.players.filter(
      p =>
        p.userId !== player.id
    );

  team.players.push({
    userId: player.id,
    position
  });

  saveData();

  safeReply(
    message,
    `✅ ${player} **${role.name}** kadrosuna **${position}** olarak eklendi.`
  );
}

async function handleSquadRemove(
  message
) {
  if (
    !isCommentator(
      message.member
    )
  ) {
    return safeReply(
      message,
      "❌ Bu komut Spiker/Yönetici içindir."
    );
  }

  const role =
    message.mentions.roles.first();

  const player =
    message.mentions.members.first();

  if (!role || !player) {
    return safeReply(
      message,
      "❌ Kullanım: `.kadrocikar @Takım @Oyuncu`"
    );
  }

  const team =
    ensureTeam(
      role.id,
      role.name
    );

  team.players =
    team.players.filter(
      p =>
        p.userId !== player.id
    );

  saveData();

  safeReply(
    message,
    `✅ ${player} kadrodan çıkarıldı.`
  );
}

async function handleSquad(
  message
) {
  const role =
    message.mentions.roles.first();

  if (!role) {
    return safeReply(
      message,
      "❌ Kullanım: `.kadro @Takım`"
    );
  }

  const team =
    ensureTeam(
      role.id,
      role.name
    );

  if (!team.players.length) {
    return safeReply(
      message,
      `📋 **${role.name}** kadrosu boş.`
    );
  }

  const groups = {};

  for (
    const player
    of team.players
  ) {
    if (!groups[player.position]) {
      groups[player.position] = [];
    }

    groups[player.position].push(
      player
    );
  }

  const lines = [];

  for (
    const [position, players]
    of Object.entries(groups)
  ) {
    lines.push(
      `### ${position}`
    );

    for (
      const player
      of players
    ) {
      const member =
        message.guild.members.cache.get(
          player.userId
        );

      if (!member) continue;

      lines.push(
        `• ${member.displayName} — **${formatMoney(
          getValue(
            member,
            message.guild
          )
        )}**`
      );
    }
  }

  safeReply(
    message,
    [
      `## ⚽ ${role.name}`,
      "",
      lines.join("\n"),
      "",
      `👥 Oyuncu: **${team.players.length}**`,
      `💰 Takım değeri: **${formatMoney(team.value)}**`
    ].join("\n")
  );
}

/* =========================================================
   FORMASYON
   ========================================================= */

async function handleFormation(
  message
) {
  if (
    !isCommentator(
      message.member
    )
  ) {
    return safeReply(
      message,
      "❌ Bu komut Spiker/Yönetici içindir."
    );
  }

  const role =
    message.mentions.roles.first();

  if (!role) {
    return safeReply(
      message,
      "❌ Kullanım: `.formasyon @Takım`"
    );
  }

  const menu =
    new StringSelectMenuBuilder()
      .setCustomId(
        `formation_${role.id}`
      )
      .setPlaceholder(
        "Formasyon seç"
      )
      .addOptions(
        FORMATIONS.map(
          formation => ({
            label: formation,
            value: formation
          })
        )
      );

  const row =
    new ActionRowBuilder()
      .addComponents(menu);

  safeReply(
    message,
    {
      content:
        `⚽ **${role.name}** formasyonu:`,
      components: [row]
    }
  );
}

/* =========================================================
   PUAN
   ========================================================= */

async function handleStandings(
  message
) {
  const teams =
    Object.values(
      data.standings
    );

  if (!teams.length) {
    return safeReply(
      message,
      "📊 Henüz puan durumu yok."
    );
  }

  teams.sort(
    (a, b) => {
      const gdA =
        a.goalsFor -
        a.goalsAgainst;

      const gdB =
        b.goalsFor -
        b.goalsAgainst;

      return (
        b.points - a.points ||
        gdB - gdA ||
        b.goalsFor -
          a.goalsFor
      );
    }
  );

  const lines =
    teams.map(
      (team, index) => {
        const gd =
          team.goalsFor -
          team.goalsAgainst;

        return (
          `**${index + 1}. ${team.name}** — ` +
          `**${team.points} P** | ` +
          `${team.wins}G ${team.draws}B ${team.losses}M | ` +
          `AV ${gd >= 0 ? "+" : ""}${gd}`
        );
      }
    );

  safeReply(
    message,
    `## 🏆 Axera League Puan Durumu\n\n${lines.join("\n")}`
  );
}

async function handleAddPoints(
  message,
  args
) {
  if (
    !isCommentator(
      message.member
    )
  ) {
    return safeReply(
      message,
      "❌ Bu komut Spiker/Yönetici içindir."
    );
  }

  const role =
    message.mentions.roles.first();

  const amount =
    Number(
      args.find(
        x => /^\d+$/.test(x)
      )
    );

  if (
    !role ||
    !Number.isInteger(amount)
  ) {
    return safeReply(
      message,
      "❌ Kullanım: `.puanekle @Takım 3`"
    );
  }

  if (!data.standings[role.id]) {
    return safeReply(
      message,
      "❌ Bu takım puan sisteminde yok."
    );
  }

  data.standings[
    role.id
  ].points += amount;

  saveData();

  safeReply(
    message,
    `✅ **${role.name}** takımına **${amount} puan** eklendi.`
  );
}

/* =========================================================
   KUPA
   ========================================================= */

async function handleCupAdd(
  message,
  args
) {
  if (
    !isCommentator(
      message.member
    )
  ) {
    return safeReply(
      message,
      "❌ Bu komut Spiker/Yönetici içindir."
    );
  }

  const role =
    message.mentions.roles.first();

  if (!role) {
    return safeReply(
      message,
      "❌ Kullanım: `.kupaekle @Takım Kupa Adı`"
    );
  }

  const name =
    args
      .filter(
        x => !/^<@&\d+>$/.test(x)
      )
      .join(" ")
      .trim();

  if (!name) {
    return safeReply(
      message,
      "❌ Kupa adını yaz."
    );
  }

  if (!data.cups[role.id]) {
    data.cups[role.id] = [];
  }

  data.cups[
    role.id
  ].push(name);

  saveData();

  safeReply(
    message,
    `🏆 **${name}** kupası **${role.name}** müzesine eklendi.`
  );
}

async function handleCupRemove(
  message,
  args
) {
  if (
    !isCommentator(
      message.member
    )
  ) {
    return safeReply(
      message,
      "❌ Bu komut Spiker/Yönetici içindir."
    );
  }

  const role =
    message.mentions.roles.first();

  if (!role) {
    return safeReply(
      message,
      "❌ Kullanım: `.kupasil @Takım Kupa Adı`"
    );
  }

  const name =
    args
      .filter(
        x => !/^<@&\d+>$/.test(x)
      )
      .join(" ")
      .trim();

  if (!data.cups[role.id]) {
    return safeReply(
      message,
      "❌ Kupa bulunamadı."
    );
  }

  data.cups[
    role.id
  ] =
    data.cups[
      role.id
    ].filter(
      cup =>
        normalize(cup) !==
        normalize(name)
    );

  saveData();

  safeReply(
    message,
    `✅ **${name}** kupası silindi.`
  );
}

async function handleMuseum(
  message
) {
  const role =
    message.mentions.roles.first();

  if (!role) {
    return safeReply(
      message,
      "❌ Kullanım: `.müze @Takım`"
    );
  }

  const cups =
    data.cups[role.id] || [];

  if (!cups.length) {
    return safeReply(
      message,
      `🏛️ **${role.name} Müzesi**\n\nHenüz kupa yok.`
    );
  }

  safeReply(
    message,
    `🏛️ **${role.name} Müzesi**\n\n` +
    cups
      .map(
        (cup, i) =>
          `${i + 1}. 🏆 ${cup}`
      )
      .join("\n")
  );
}

/* =========================================================
   MAÇ
   ========================================================= */

function getTeamPlayers(
  guild,
  roleId
) {
  const role =
    guild.roles.cache.get(
      roleId
    );

  if (!role) return [];

  const players = [];

  for (
    const member
    of role.members.values()
  ) {
    if (member.user.bot) continue;

    players.push({
      userId: member.id,
      member,
      position:
        getPosition(member),
      value:
        getValue(
          member,
          guild
        )
    });
  }

  const team =
    data.teams[roleId];

  if (team?.players) {
    for (
      const stored
      of team.players
    ) {
      if (
        players.some(
          p =>
            p.userId ===
            stored.userId
        )
      ) continue;

      const member =
        guild.members.cache.get(
          stored.userId
        );

      if (!member) continue;

      players.push({
        userId: member.id,
        member,
        position:
          stored.position,
        value:
          getValue(
            member,
            guild
          )
      });
    }
  }

  return players;
}

function getPosition(
  member
) {
  const parts =
    member.displayName
      .split("|")
      .map(x => x.trim());

  return parts[2] || "OY";
}

function randomItem(array) {
  if (!array.length) return null;

  return array[
    Math.floor(
      Math.random() *
      array.length
    )
  ];
}

function commentary(
  team1,
  team2,
  scorer
) {
  if (scorer) {
    return `⚽ **GOOOL!** ${scorer.member.displayName} fileleri havalandırdı!`;
  }

  return randomItem([
    `⚡ ${team1.name} hızlı hücuma çıktı.`,
    `🎯 ${team2.name} savunması araya girdi.`,
    `🧤 Kaleci topu kontrol etti.`,
    `🔥 Orta sahada sert mücadele.`,
    `🏃 Kanattan tehlikeli atak.`,
    `🎯 Ceza sahasına orta açıldı.`,
    `🛡️ Savunma başarılı şekilde uzaklaştırdı.`,
    `🚨 Tehlikeli şut!`,
    `⚽ Top orta sahada dolaşıyor.`
  ]);
}

async function startMatch(
  guild,
  team1Id,
  team2Id
) {
  const role1 =
    guild.roles.cache.get(
      team1Id
    );

  const role2 =
    guild.roles.cache.get(
      team2Id
    );

  if (!role1 || !role2) return;

  const players1 =
    getTeamPlayers(
      guild,
      team1Id
    );

  const players2 =
    getTeamPlayers(
      guild,
      team2Id
    );

  const matchId =
    `${team1Id}_${team2Id}_${Date.now()}`;

  const match = {
    id: matchId,
    team1: team1Id,
    team2: team2Id,
    minute: 0,
    team1Goals: 0,
    team2Goals: 0,
    messageId: null,
    finished: false
  };

  data.activeMatches[
    matchId
  ] = match;

  const channel =
    guild.channels.cache.get(
      IDS.channels.match
    );

  if (!channel) return;

  const embed =
    new EmbedBuilder()
      .setTitle(
        `⚽ ${role1.name} 🆚 ${role2.name}`
      )
      .setDescription(
        `⏱️ **0'**\n\n` +
        `## 0 — 0\n\n` +
        `🎙️ Maç başladı!`
      )
      .setTimestamp();

  const sent =
    await safeSend(
      channel,
      {
        embeds: [embed]
      }
    );

  if (!sent) {
    delete data.activeMatches[
      matchId
    ];

    return;
  }

  match.messageId =
    sent.id;

  saveData();

  let minute = 0;

  const interval =
    setInterval(
      async () => {
        try {
          if (
            !data.activeMatches[
              matchId
            ]
          ) {
            clearInterval(interval);
            return;
          }

          minute++;

          let scorer = null;
          let scoringTeam = 0;

          const chance =
            Math.random();

          if (
            chance < 0.055 &&
            players1.length
          ) {
            scorer =
              randomItem(
                players1
              );

            scoringTeam = 1;
          } else if (
            chance < 0.105 &&
            players2.length
          ) {
            scorer =
              randomItem(
                players2
              );

            scoringTeam = 2;
          }

          if (scoringTeam === 1) {
            match.team1Goals++;
          }

          if (scoringTeam === 2) {
            match.team2Goals++;
          }

          if (scorer) {
            addValue(
              scorer.member,
              2
            );

            ensureStats(
              scorer.userId
            ).goals++;
          }

          match.minute =
            minute;

          const embed =
            new EmbedBuilder()
              .setTitle(
                `⚽ ${role1.name} 🆚 ${role2.name}`
              )
              .setDescription(
                `⏱️ **${minute}'**\n\n` +
                `## ${match.team1Goals} — ${match.team2Goals}\n\n` +
                `🎙️ ${commentary(
                  role1,
                  role2,
                  scorer
                )}`
              )
              .setTimestamp();

          const msg =
            await channel.messages
              .fetch(
                match.messageId
              )
              .catch(
                () => null
              );

          if (msg) {
            await msg.edit({
              embeds: [embed]
            }).catch(() => {});
          }

          if (minute >= 90) {
            clearInterval(
              interval
            );

            await finishMatch(
              guild,
              match,
              players1,
              players2
            );
          }
        } catch (error) {
          console.error(
            "MAÇ HATASI:",
            error
          );

          clearInterval(
            interval
          );

          delete data.activeMatches[
            matchId
          ];

          saveData();
        }
      },
      3000
    );
}

async function finishMatch(
  guild,
  match,
  players1,
  players2
) {
  if (match.finished) return;

  match.finished = true;

  const s1 =
    data.standings[
      match.team1
    ];

  const s2 =
    data.standings[
      match.team2
    ];

  if (s1 && s2) {
    s1.goalsFor +=
      match.team1Goals;

    s1.goalsAgainst +=
      match.team2Goals;

    s2.goalsFor +=
      match.team2Goals;

    s2.goalsAgainst +=
      match.team1Goals;

    if (
      match.team1Goals >
      match.team2Goals
    ) {
      s1.points += 3;
      s1.wins++;
      s2.losses++;
    } else if (
      match.team2Goals >
      match.team1Goals
    ) {
      s2.points += 3;
      s2.wins++;
      s1.losses++;
    } else {
      s1.points++;
      s2.points++;
      s1.draws++;
      s2.draws++;
    }
  }

  const players = [
    ...players1,
    ...players2
  ];

  if (!data.matchRewards[
    match.id
  ]) {
    data.matchRewards[
      match.id
    ] = {};
  }

  for (
    const player
    of players
  ) {
    if (
      data.matchRewards[
        match.id
      ][player.userId]
    ) continue;

    addValue(
      player.member,
      5
    );

    ensureStats(
      player.userId
    ).matches++;

    data.matchRewards[
      match.id
    ][player.userId] = true;
  }

  const channel =
    guild.channels.cache.get(
      IDS.channels.match
    );

  if (
    channel &&
    match.messageId
  ) {
    const msg =
      await channel.messages
        .fetch(
          match.messageId
        )
        .catch(
          () => null
        );

    if (msg) {
      const result =
        match.team1Goals >
        match.team2Goals
          ? "🏆 Takım 1 kazandı!"
          : match.team2Goals >
              match.team1Goals
            ? "🏆 Takım 2 kazandı!"
            : "🤝 Maç berabere!";

      await msg.edit({
        embeds: [
          new EmbedBuilder()
            .setTitle(
              `🏁 ${match.team1Goals} — ${match.team2Goals}`
            )
            .setDescription(
              `${result}\n\n` +
              "💰 Katılan oyuncular: **+5M€**\n" +
              "⚽ Gol: **+2M€**"
            )
            .setTimestamp()
        ]
      }).catch(() => {});
    }
  }

  data.matchHistory.push({
    id: match.id,
    team1: match.team1,
    team2: match.team2,
    score1: match.team1Goals,
    score2: match.team2Goals,
    timestamp: Date.now()
  });

  delete data.activeMatches[
    match.id
  ];

  saveData();
}

async function handleMatch(
  message
) {
  if (
    !onlyChannel(
      message,
      IDS.channels.match
    )
  ) return;

  if (
    !isCommentator(
      message.member
    )
  ) {
    return safeReply(
      message,
      "❌ Bu komut Spiker/Yönetici içindir."
    );
  }

  const roles =
    [...message.mentions.roles.values()];

  if (roles.length < 2) {
    return safeReply(
      message,
      "❌ Kullanım: `.maç @Takım1 @Takım2`"
    );
  }

  await startMatch(
    message.guild,
    roles[0].id,
    roles[1].id
  );
}

/* =========================================================
   FİKSTÜR
   ========================================================= */

function parseFixtureDate(
  date,
  time
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      date || ""
    )
  ) return null;

  if (
    !/^\d{2}:\d{2}$/.test(
      time || ""
    )
  ) return null;

  const [
    year,
    month,
    day
  ] = date
    .split("-")
    .map(Number);

  const [
    hour,
    minute
  ] = time
    .split(":")
    .map(Number);

  const result =
    new Date(
      year,
      month - 1,
      day,
      hour,
      minute,
      0
    );

  return Number.isNaN(
    result.getTime()
  )
    ? null
    : result;
}

async function handleFixtureAdd(
  message,
  args
) {
  if (
    !isCommentator(
      message.member
    )
  ) {
    return safeReply(
      message,
      "❌ Bu komut Spiker/Yönetici içindir."
    );
  }

  const roles =
    [...message.mentions.roles.values()];

  const date =
    args.find(
      x =>
        /^\d{4}-\d{2}-\d{2}$/.test(x)
    );

  const time =
    args.find(
      x =>
        /^\d{2}:\d{2}$/.test(x)
    );

  if (
    roles.length < 2 ||
    !date ||
    !time
  ) {
    return safeReply(
      message,
      "❌ `.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`"
    );
  }

  const timestamp =
    parseFixtureDate(
      date,
      time
    );

  if (!timestamp) {
    return safeReply(
      message,
      "❌ Geçersiz tarih."
    );
  }

  data.fixtures.push({
    id:
      data.nextFixtureId++,
    team1: roles[0].id,
    team2: roles[1].id,
    timestamp:
      timestamp.getTime(),
    started: false
  });

  saveData();

  safeReply(
    message,
    `✅ Fikstür eklendi:\n⚽ **${roles[0].name}** 🆚 **${roles[1].name}**\n🕐 ${timestamp.toLocaleString("tr-TR")}`
  );
}

async function handleFixtures(
  message
) {
  const fixtures =
    data.fixtures
      .filter(
        f => !f.started
      )
      .sort(
        (a, b) =>
          a.timestamp -
          b.timestamp
      );

  if (!fixtures.length) {
    return safeReply(
      message,
      "📅 Bekleyen fikstür yok."
    );
  }

  const lines =
    fixtures
      .slice(0, 20)
      .map(
        fixture => {
          const team1 =
            message.guild.roles.cache.get(
              fixture.team1
            );

          const team2 =
            message.guild.roles.cache.get(
              fixture.team2
            );

          return (
            `**#${fixture.id}** ${team1?.name || "Takım"} 🆚 ${team2?.name || "Takım"}\n` +
            `🕐 ${new Date(
              fixture.timestamp
            ).toLocaleString("tr-TR")}`
          );
        }
      );

  safeReply(
    message,
    `## 📅 Fikstür\n\n${lines.join("\n\n")}`
  );
}

async function handleFixtureRemove(
  message
) {
  if (
    !isCommentator(
      message.member
    )
  ) {
    return safeReply(
      message,
      "❌ Bu komut Spiker/Yönetici içindir."
    );
  }

  const roles =
    [...message.mentions.roles.values()];

  if (roles.length < 2) {
    return safeReply(
      message,
      "❌ Kullanım: `.fiksturcikar @Takım1 @Takım2`"
    );
  }

  const before =
    data.fixtures.length;

  data.fixtures =
    data.fixtures.filter(
      f =>
        !(
          (
            f.team1 === roles[0].id &&
            f.team2 === roles[1].id
          ) ||
          (
            f.team1 === roles[1].id &&
            f.team2 === roles[0].id
          )
        )
    );

  saveData();

  safeReply(
    message,
    before ===
      data.fixtures.length
      ? "❌ Fikstür bulunamadı."
      : "✅ Fikstür silindi."
  );
}

/* =========================================================
   TICKET
   ========================================================= */

async function handleTicketPanel(
  message
) {
  if (!isAdmin(message.member)) {
    return safeReply(
      message,
      "❌ Ticket paneli Yönetici içindir."
    );
  }

  const embed =
    new EmbedBuilder()
      .setTitle(
        "🎫 Axera League Destek"
      )
      .setDescription(
        "Destek almak için aşağıdaki butona bas."
      )
      .setTimestamp();

  const row =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "create_ticket"
          )
          .setLabel(
            "Destek Talebi Oluştur"
          )
          .setEmoji("🎫")
          .setStyle(
            ButtonStyle.Primary
          )
      );

  safeSend(
    message.channel,
    {
      embeds: [embed],
      components: [row]
    }
  );
}

async function createTicket(
  interaction
) {
  const guild =
    interaction.guild;

  const existing =
    Object.values(
      data.tickets
    ).find(
      t =>
        t.userId ===
          interaction.user.id &&
        t.open
    );

  if (existing) {
    return interaction.reply({
      content:
        `❌ Zaten açık ticketın var: <#${existing.channelId}>`,
      ephemeral: true
    });
  }

  const channel =
    await guild.channels.create({
      name:
        `ticket-${interaction.user.username}`
          .toLowerCase()
          .replace(
            /[^a-z0-9-]/g,
            ""
          )
          .substring(0, 80),

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

  data.tickets[
    channel.id
  ] = {
    userId:
      interaction.user.id,
    channelId:
      channel.id,
    open: true,
    lastMessage:
      Date.now()
  };

  saveData();

  const row =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "close_ticket"
          )
          .setLabel(
            "Bileti Kapat"
          )
          .setEmoji("🔒")
          .setStyle(
            ButtonStyle.Danger
          )
      );

  await safeSend(
    channel,
    {
      content:
        `${interaction.user} hoş geldin!`,
      components: [row]
    }
  );

  interaction.reply({
    content:
      `✅ Ticket oluşturuldu: ${channel}`,
    ephemeral: true
  });
}

async function closeTicket(
  interaction
) {
  const ticket =
    data.tickets[
      interaction.channel.id
    ];

  if (!ticket) {
    return interaction.reply({
      content:
        "❌ Bu kanal ticket değil.",
      ephemeral: true
    });
  }

  if (
    interaction.user.id !==
      ticket.userId &&
    !isModerator(
      interaction.member
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

  setTimeout(
    () =>
      interaction.channel
        .delete()
        .catch(() => {}),
    2000
  );
}

/* =========================================================
   ROL PANELİ
   ========================================================= */

async function handleRolePanel(
  message
) {
  if (!isAdmin(message.member)) {
    return safeReply(
      message,
      "❌ Rol paneli Yönetici içindir."
    );
  }

  const embed =
    new EmbedBuilder()
      .setTitle(
        "🎭 Axera League Rol Paneli"
      )
      .setDescription(
        "İstediğin bildirim rollerini açıp kapatabilirsin."
      )
      .setTimestamp();

  const row1 =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "ping_partner"
          )
          .setLabel(
            "Partner Ping"
          )
          .setEmoji("🤝")
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            "ping_match"
          )
          .setLabel(
            "Maç Ping"
          )
          .setEmoji("⚽")
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            "ping_announcement"
          )
          .setLabel(
            "Duyuru Ping"
          )
          .setEmoji("📢")
          .setStyle(
            ButtonStyle.Success
          )
      );

  const row2 =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "ping_giveaway"
          )
          .setLabel(
            "Çekiliş Ping"
          )
          .setEmoji("🎉")
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            "ping_media"
          )
          .setLabel(
            "Medya Ping"
          )
          .setEmoji("📰")
          .setStyle(
            ButtonStyle.Primary
          )
      );

  safeSend(
    message.channel,
    {
      embeds: [embed],
      components: [
        row1,
        row2
      ]
    }
  );
}

/* =========================================================
   DM
   ========================================================= */

async function handleDM(
  message,
  args
) {
  if (!isAdmin(message.member)) {
    return safeReply(
      message,
      "❌ Bu komut Yönetici içindir."
    );
  }

  const target =
    message.mentions.users.first();

  if (!target) {
    return safeReply(
      message,
      "❌ Kullanım: `.dm @Oyuncu mesaj`"
    );
  }

  const text =
    args
      .filter(
        x => !/^<@!?\d+>$/.test(x)
      )
      .join(" ")
      .trim();

  if (!text) {
    return safeReply(
      message,
      "❌ Mesaj yazmalısın."
    );
  }

  try {
    await target.send(text);

    safeReply(
      message,
      `✅ ${target} kullanıcısına DM gönderildi.`
    );
  } catch {
    safeReply(
      message,
      "❌ Kullanıcıya DM gönderilemedi."
    );
  }
}

/* =========================================================
   MODERASYON
   ========================================================= */

async function handleModeration(
  message,
  command,
  args
) {
  if (!isAdmin(message.member)) {
    return safeReply(
      message,
      "❌ Bu komut Yönetici içindir."
    );
  }

  if (command === "sil") {
    const amount =
      Number(args[0]);

    if (
      !Number.isInteger(amount) ||
      amount < 1 ||
      amount > 1000
    ) {
      return safeReply(
        message,
        "❌ 1-1000 arası sayı gir."
      );
    }

    try {
      const deleted =
        await message.channel.bulkDelete(
          amount,
          true
        );

      const msg =
        await message.channel.send(
          `🧹 **${deleted.size} mesaj silindi.**`
        );

      setTimeout(
        () =>
          msg.delete().catch(
            () => {}
          ),
        3000
      );
    } catch {
      safeReply(
        message,
        "❌ Mesajlar silinemedi."
      );
    }

    return;
  }

  const target =
    message.mentions.members.first();

  if (!target) {
    return safeReply(
      message,
      `❌ Kullanım: \`.${command} @Oyuncu\``
    );
  }

  if (command === "kick") {
    await target.kick().catch(
      () => {}
    );

    return safeReply(
      message,
      `👢 ${target} sunucudan atıldı.`
    );
  }

  if (command === "ban") {
    await target.ban().catch(
      () => {}
    );

    return safeReply(
      message,
      `🔨 ${target} yasaklandı.`
    );
  }

  if (command === "mute") {
    await target.timeout(
      60 * 60 * 1000,
      "Axera League moderasyon"
    ).catch(
      () => {}
    );

    return safeReply(
      message,
      `🔇 ${target} 1 saat susturuldu.`
    );
  }

  if (command === "unmute") {
    await target.timeout(
      null
    ).catch(
      () => {}
    );

    return safeReply(
      message,
      `🔊 ${target} susturması kaldırıldı.`
    );
  }
}

/* =========================================================
   EMBED
   ========================================================= */

async function handleEmbed(
  message,
  args
) {
  if (!isAdmin(message.member)) {
    return safeReply(
      message,
      "❌ Bu komut Yönetici içindir."
    );
  }

  const raw =
    args.join(" ");

  const [
    title,
    description
  ] =
    raw
      .split("|")
      .map(
        x => x.trim()
      );

  if (!title || !description) {
    return safeReply(
      message,
      "❌ `.embed Başlık | Açıklama`"
    );
  }

  await safeDelete(message);

  safeSend(
    message.channel,
    {
      embeds: [
        new EmbedBuilder()
          .setTitle(title)
          .setDescription(
            description
          )
          .setTimestamp()
      ]
    }
  );
}

/* =========================================================
   ŞART
   ========================================================= */

async function handleConditions(
  message
) {
  safeReply(
    message,
    [
      "## 📋 Axera League Şartları",
      "",
      "✓ **Kalıcı Tık:** Kalıcı 「✓」 kanalından tıklayınız.",
      "🎭 **Rol Al:** Rol Al kanalından en az **2 rol** alınız.",
      "",
      "ℹ️ Bu şartlar bilgilendirme amaçlıdır.",
      "ℹ️ Sistemleri kullanmak için zorunlu değildir."
    ].join("\n")
  );
}

/* =========================================================
   YARDIM
   ========================================================= */

async function handleHelp(
  message
) {
  const embed =
    new EmbedBuilder()
      .setTitle(
        "📚 Axera League Komutları"
      )
      .setDescription(
        [
          "### 👤 Kayıt",
          "`.k @Oyuncu İsim`",
          "`.kayıtsızver @Oyuncu`",
          "`.ara isim`",
          "",
          "### 💰 Değer",
          "`.dver @Oyuncu 5M`",
          "`.dsil @Oyuncu 5M`",
          "",
          "### ⚽ Futbol",
          "`.ant`",
          "`.antrenman`",
          "`.pen`",
          "`.penaltı`",
          "`.tweet mesaj`",
          "`.maç @Takım1 @Takım2`",
          "",
          "### 🏟️ Takım",
          "`.takımekle @Takım`",
          "`.takımkaldır @Takım`",
          "`.takımdeğer @Takım 850M`",
          "`.kadroekle @Takım @Oyuncu Pozisyon`",
          "`.kadrocikar @Takım @Oyuncu`",
          "`.kadro @Takım`",
          "`.formasyon @Takım`",
          "`.puan`",
          "`.puanekle @Takım 3`",
          "",
          "### 📅 Fikstür",
          "`.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`",
          "`.fikstür`",
          "`.fiksturcikar @Takım1 @Takım2`",
          "",
          "### 🏆 Kupa",
          "`.kupaekle @Takım Kupa`",
          "`.kupasil @Takım Kupa`",
          "`.müze @Takım`",
          "",
          "### 🎫 Destek",
          "`.ticketpanel`",
          "",
          "### 🎭 Roller",
          "`.rolpanel`",
          "",
          "### 🤖 AI",
          "`.ai soru`",
          "`.yapayzeka soru`",
          "AI kanalında normal mesaj",
          "",
          "### 🛡️ Yönetim",
          "`.sil miktar`",
          "`.embed Başlık | Açıklama`",
          "`.kick @Oyuncu`",
          "`.ban @Oyuncu`",
          "`.mute @Oyuncu`",
          "`.unmute @Oyuncu`",
          "`.dm @Oyuncu mesaj`",
          "",
          "`.şart`",
          "`.ping`"
        ].join("\n")
      )
      .setFooter({
        text:
          "Axera League | Futbol RP"
      });

  safeReply(
    message,
    {
      embeds: [embed]
    }
  );
}

/* =========================================================
   AI
   ========================================================= */

async function askAI(
  userId,
  question
) {
  if (!openai) {
    return "❌ AI aktif değil. Railway Variables kısmına OPENAI_API_KEY ekleyin.";
  }

  const text =
    String(question)
      .trim();

  if (!text) {
    return "❌ Bir soru yazmalısın.";
  }

  if (
    normalize(text).includes(
      "seni kim kurdu"
    )
  ) {
    return "Lynox9380 kurdu.";
  }

  if (!data.aiMemory[userId]) {
    data.aiMemory[userId] = [];
  }

  const memory =
    data.aiMemory[userId];

  memory.push({
    role: "user",
    content: text
  });

  while (
    memory.length > 8
  ) {
    memory.shift();
  }

  try {
    const response =
      await openai.responses.create({
        model: AI_MODEL,

        input: [
          {
            role: "system",
            content:
              "Sen Axera adlı Türkçe Discord AI asistanısın. " +
              "Kısa, hızlı, doğal ve yardımcı cevaplar ver. " +
              "Kullanıcı senden seni kimin kurduğunu sorarsa tam olarak 'Lynox9380 kurdu.' de. " +
              "Discord sunucu yönetim işlemlerini kendin gerçekleştirme; ilgili komutu kullanıcının çalıştırması gerektiğini söyle."
          },

          ...memory
        ],

        max_output_tokens: 500
      });

    const answer =
      response.output_text?.trim() ||
      "❌ Cevap oluşturulamadı.";

    memory.push({
      role: "assistant",
      content: answer
    });

    while (
      memory.length > 8
    ) {
      memory.shift();
    }

    saveData();

    return answer;
  } catch (error) {
    console.error(
      "OPENAI HATASI:",
      error
    );

    return "❌ Axera AI şu anda cevap veremiyor.";
  }
}

async function handleAICommand(
  message,
  args
) {
  const question =
    args.join(" ").trim();

  if (!question) {
    return safeReply(
      message,
      "🤖 Kullanım: `.ai soru`"
    );
  }

  const loading =
    await safeReply(
      message,
      "🤖 **Axera düşünüyor...**"
    );

  const answer =
    await askAI(
      message.author.id,
      question
    );

  if (loading) {
    await loading.edit({
      content:
        answer.substring(
          0,
          1900
        )
    }).catch(
      () => {}
    );
  }
}

async function handleAIChannel(
  message
) {
  if (
    message.channel.id !==
      IDS.channels.ai ||
    message.author.bot
  ) {
    return;
  }

  if (
    message.content.startsWith(
      PREFIX
    )
  ) {
    return;
  }

  const answer =
    await askAI(
      message.author.id,
      message.content
    );

  const chunks = [];

  for (
    let i = 0;
    i < answer.length;
    i += 1900
  ) {
    chunks.push(
      answer.substring(
        i,
        i + 1900
      )
    );
  }

  for (
    const chunk of chunks
  ) {
    await safeSend(
      message.channel,
      {
        content: chunk
      }
    );
  }
}

/* =========================================================
   BOT DURUM
   ========================================================= */

let lastStatusKey = null;

async function updateBotStatus() {
  const channel =
    client.channels.cache.get(
      IDS.channels.botStatus
    );

  if (!channel?.isTextBased?.()) {
    return;
  }

  /*
   * BOT DURUM KANALINDA SADECE BOTUN
   * ÖNCEKİ MESAJLARINI SİL.
   */
  try {
    const messages =
      await channel.messages.fetch({
        limit: 100
      });

    const botMessages =
      messages.filter(
        msg =>
          msg.author.id ===
          client.user.id
      );

    for (
      const msg
      of botMessages.values()
    ) {
      await msg.delete().catch(
        () => {}
      );
    }
  } catch (error) {
    console.error(
      "DURUM MESAJI TEMİZLEME HATASI:",
      error.message
    );
  }

  const guildCount =
    client.guilds.cache.size;

  const memberCount =
    client.guilds.cache.reduce(
      (total, guild) =>
        total +
        Number(
          guild.memberCount || 0
        ),
      0
    );

  const ping =
    client.ws.ping >= 0
      ? `${client.ws.ping}ms`
      : "Bilinmiyor";

  const uptime =
    Math.floor(
      process.uptime()
    );

  const hours =
    Math.floor(
      uptime / 3600
    );

  const minutes =
    Math.floor(
      (uptime % 3600) / 60
    );

  const seconds =
    uptime % 60;

  const embed =
    new EmbedBuilder()
      .setTitle(
        "🤖 Axera League • Bot Durumu"
      )
      .setDescription(
        [
          "🟢 **Durum:** Aktif",
          `📡 **Ping:** ${ping}`,
          `🏠 **Sunucu:** ${guildCount}`,
          `👥 **Üye:** ${memberCount}`,
          `⚙️ **Komut:** ${COMMAND_COUNT}+`,
          `⏱️ **Uptime:** ${hours}s ${minutes}dk ${seconds}sn`,
          "",
          `🕐 **Güncelleme:** <t:${Math.floor(
            Date.now() / 1000
          )}:F>`,
          "",
          "🔄 Her **30 dakikada bir** yenilenir."
        ].join("\n")
      )
      .setFooter({
        text:
          "Axera League | Futbol RP"
      })
      .setTimestamp();

  await safeSend(
    channel,
    {
      embeds: [embed]
    }
  );
}

function startStatusScheduler() {
  setInterval(
    async () => {
      try {
        const now =
          new Date();

        const minute =
          now.getMinutes();

        const key =
          `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${minute}`;

        if (
          (
            minute === 0 ||
            minute === 30
          ) &&
          lastStatusKey !== key
        ) {
          lastStatusKey = key;

          await updateBotStatus();
        }
      } catch (error) {
        console.error(
          "STATUS SCHEDULER HATASI:",
          error
        );
      }
    },
    60 * 1000
  );
}

/* =========================================================
   FİKSTÜR SCHEDULER
   ========================================================= */

function startFixtureScheduler() {
  setInterval(
    async () => {
      try {
        const now =
          Date.now();

        for (
          const fixture
          of data.fixtures
        ) {
          if (
            fixture.started
          ) continue;

          if (
            fixture.timestamp <=
            now
          ) {
            fixture.started =
              true;

            const guild =
              client.guilds.cache.find(
                g =>
                  g.roles.cache.has(
                    fixture.team1
                  ) &&
                  g.roles.cache.has(
                    fixture.team2
                  )
              );

            if (!guild) {
              continue;
            }

            await startMatch(
              guild,
              fixture.team1,
              fixture.team2
            );

            saveData();
          }
        }
      } catch (error) {
        console.error(
          "FİKSTÜR SCHEDULER HATASI:",
          error
        );
      }
    },
    1000
  );
}

/* =========================================================
   TICKET SCHEDULER
   ========================================================= */

function startTicketScheduler() {
  setInterval(
    async () => {
      try {
        const now =
          Date.now();

        for (
          const [
            channelId,
            ticket
          ]
          of Object.entries(
            data.tickets
          )
        ) {
          if (!ticket.open)
            continue;

          if (
            now -
              Number(
                ticket.lastMessage ||
                  0
              ) >=
            60 * 60 * 1000
          ) {
            ticket.open =
              false;

            const channel =
              client.channels.cache.get(
                channelId
              );

            if (channel) {
              await safeSend(
                channel,
                "⏰ 60 dakika boyunca mesaj gelmediği için ticket kapatılıyor."
              );

              setTimeout(
                () =>
                  channel
                    .delete()
                    .catch(
                      () => {}
                    ),
                3000
              );
            }
          }
        }

        saveData();
      } catch (error) {
        console.error(
          "TICKET SCHEDULER HATASI:",
          error
        );
      }
    },
    60 * 1000
  );
}

/* =========================================================
   BUTTON
   ========================================================= */

async function handleButton(
  interaction
) {
  const id =
    interaction.customId;

  /* KAYIT */

  if (
    id.startsWith(
      "reg_"
    )
  ) {
    if (
      !isRegistrationStaff(
        interaction.member
      )
    ) {
      return interaction.reply({
        content:
          "❌ Bu kayıt panelini yalnızca Kayıt Yetkilisi veya Yönetici kullanabilir.",
        ephemeral: true
      });
    }

    const parts =
      id.split("_");

    const type =
      parts[1];

    const targetId =
      parts[2];

    const panel =
      data.registrationPanels[
        interaction.message.id
      ];

    const target =
      await interaction.guild.members
        .fetch(
          targetId
        )
        .catch(
          () => null
        );

    if (!target) {
      return interaction.reply({
        content:
          "❌ Kullanıcı bulunamadı.",
        ephemeral: true
      });
    }

    const nickname =
      panel?.nickname ||
      target.displayName;

    const roleId =
      await registerMember(
        target,
        type,
        nickname
      );

    const role =
      interaction.guild.roles.cache.get(
        roleId
      );

    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle(
            "✅ Kayıt Tamamlandı"
          )
          .setDescription(
            `${target}\n\n` +
            `👤 Tür: **${role?.name || "Kayıt"}**\n` +
            `📝 İsim: **${nickname}**\n` +
            `🛡️ Yetkili: ${interaction.user}`
          )
          .setTimestamp()
      ],
      components: []
    });

    delete data.registrationPanels[
      interaction.message.id
    ];

    saveData();

    return;
  }

  /* ROLLER */

  const roleMap = {
    ping_partner:
      IDS.pingRoles.partner,

    ping_match:
      IDS.pingRoles.match,

    ping_announcement:
      IDS.pingRoles.announcement,

    ping_giveaway:
      IDS.pingRoles.giveaway,

    ping_media:
      IDS.pingRoles.media
  };

  if (roleMap[id]) {
    const roleId =
      roleMap[id];

    if (
      interaction.member.roles.cache.has(
        roleId
      )
    ) {
      await interaction.member.roles.remove(
        roleId
      );

      return interaction.reply({
        content:
          "❌ Bildirim rolü kaldırıldı.",
        ephemeral: true
      });
    }

    await interaction.member.roles.add(
      roleId
    );

    return interaction.reply({
      content:
        "✅ Bildirim rolü verildi.",
      ephemeral: true
    });
  }

  /* TICKET */

  if (
    id ===
    "create_ticket"
  ) {
    return createTicket(
      interaction
    );
  }

  if (
    id ===
    "close_ticket"
  ) {
    return closeTicket(
      interaction
    );
  }
}

/* =========================================================
   SELECT
   ========================================================= */

async function handleSelect(
  interaction
) {
  if (
    interaction.customId.startsWith(
      "formation_"
    )
  ) {
    if (
      !isCommentator(
        interaction.member
      )
    ) {
      return interaction.reply({
        content:
          "❌ Bu işlem Spiker/Yönetici içindir.",
        ephemeral: true
      });
    }

    const teamId =
      interaction.customId
        .split("_")[1];

    const formation =
      interaction.values[0];

    data.formations[
      teamId
    ] = formation;

    saveData();

    return interaction.update({
      content:
        `✅ Formasyon **${formation}** olarak ayarlandı.`,
      components: []
    });
  }
}

/* =========================================================
   MESSAGE CREATE
   ========================================================= */

client.on(
  "messageCreate",
  async message => {
    try {
      if (
        !message.guild ||
        message.author.bot
      ) {
        return;
      }

      /*
       * Ticket mesaj zamanı
       */
      const ticket =
        data.tickets[
          message.channel.id
        ];

      if (
        ticket?.open
      ) {
        ticket.lastMessage =
          Date.now();

        saveData();
      }

      /*
       * AI kanalı
       */
      await handleAIChannel(
        message
      );

      /*
       * Komut değilse bitir
       */
      if (
        !message.content.startsWith(
          PREFIX
        )
      ) {
        return;
      }

      const raw =
        message.content
          .slice(
            PREFIX.length
          )
          .trim();

      if (!raw) return;

      const parts =
        raw.split(/\s+/);

      const command =
        normalize(
          parts.shift()
        );

      const args =
        parts;

      /* KAYIT */

      if (
        command === "k"
      ) {
        return handleRegister(
          message,
          args
        );
      }

      if (
        command ===
          "kayitsizver" ||
        command ===
          "kayıtsızver"
      ) {
        return handleUnregister(
          message
        );
      }

      /* ARA */

      if (
        command === "ara"
      ) {
        return handleSearch(
          message,
          args
        );
      }

      /* DEĞER */

      if (
        command === "dver"
      ) {
        return handleValue(
          message,
          args,
          true
        );
      }

      if (
        command === "dsil"
      ) {
        return handleValue(
          message,
          args,
          false
        );
      }

      /* ANTRENMAN */

      if (
        command === "ant" ||
        command ===
          "antrenman"
      ) {
        return handleTraining(
          message
        );
      }

      /* PENALTI */

      if (
        command === "pen" ||
        command ===
          "penalti" ||
        command ===
          "penaltı"
      ) {
        return handlePenalty(
          message
        );
      }

      /* TWEET */

      if (
        command === "tweet"
      ) {
        return handleTweet(
          message,
          args
        );
      }

      /* TAKIM */

      if (
        command ===
        "takımekle"
      ) {
        return handleTeamAdd(
          message
        );
      }

      if (
        command ===
          "takımkaldır" ||
        command ===
          "takimkaldir"
      ) {
        return handleTeamRemove(
          message
        );
      }

      if (
        command ===
          "takımdeğer" ||
        command ===
          "takimdeger"
      ) {
        return handleTeamValue(
          message,
          args
        );
      }

      /* KADRO */

      if (
        command ===
        "kadroekle"
      ) {
        return handleSquadAdd(
          message,
          args
        );
      }

      if (
        command ===
          "kadrocikar" ||
        command ===
          "kadrocikart"
      ) {
        return handleSquadRemove(
          message
        );
      }

      if (
        command ===
          "kadro" ||
        command ===
          "kadrom"
      ) {
        return handleSquad(
          message
        );
      }

      /* FORMASYON */

      if (
        command ===
        "formasyon"
      ) {
        return handleFormation(
          message
        );
      }

      /* PUAN */

      if (
        command ===
          "puan" ||
        command ===
          "puandurumu"
      ) {
        return handleStandings(
          message
        );
      }

      if (
        command ===
        "puanekle"
      ) {
        return handleAddPoints(
          message,
          args
        );
      }

      /* MAÇ */

      if (
        command === "maç" ||
        command === "mac"
      ) {
        return handleMatch(
          message
        );
      }

      /* FİKSTÜR */

      if (
        command ===
        "fiksturekle"
      ) {
        return handleFixtureAdd(
          message,
          args
        );
      }

      if (
        command ===
          "fikstür" ||
        command ===
          "fikstur"
      ) {
        return handleFixtures(
          message
        );
      }

      if (
        command ===
        "fiksturcikar"
      ) {
        return handleFixtureRemove(
          message
        );
      }

      /* KUPA */

      if (
        command ===
        "kupaekle"
      ) {
        return handleCupAdd(
          message,
          args
        );
      }

      if (
        command ===
        "kupasil"
      ) {
        return handleCupRemove(
          message,
          args
        );
      }

      if (
        command === "müze" ||
        command === "muze"
      ) {
        return handleMuseum(
          message
        );
      }

      /* TICKET */

      if (
        command ===
        "ticketpanel"
      ) {
        return handleTicketPanel(
          message
        );
      }

      /* ROL PANEL */

      if (
        command ===
        "rolpanel"
      ) {
        return handleRolePanel(
          message
        );
      }

      /* DM */

      if (
        command === "dm"
      ) {
        return handleDM(
          message,
          args
        );
      }

      /* MODERASYON */

      if (
        [
          "sil",
          "kick",
          "ban",
          "mute",
          "unmute"
        ].includes(command)
      ) {
        return handleModeration(
          message,
          command,
          args
        );
      }

      /* EMBED */

      if (
        command ===
        "embed"
      ) {
        return handleEmbed(
          message,
          args
        );
      }

      /* AI */

      if (
        command === "ai" ||
        command ===
          "yapayzeka"
      ) {
        return handleAICommand(
          message,
          args
        );
      }

      /* ŞART */

      if (
        command === "sart" ||
        command === "şart"
      ) {
        return handleConditions(
          message
        );
      }

      /* YARDIM */

      if (
        command ===
          "yardim" ||
        command ===
          "yardım"
      ) {
        return handleHelp(
          message
        );
      }

      /* PING */

      if (
        command ===
        "ping"
      ) {
        return safeReply(
          message,
          `🏓 Pong! **${client.ws.ping}ms**`
        );
      }
    } catch (error) {
      console.error(
        "MESSAGE CREATE HATASI:",
        error
      );

      safeReply(
        message,
        "❌ İşlem sırasında beklenmeyen bir hata oluştu."
      ).catch(() => {});
    }
  }
);

/* =========================================================
   INTERACTION
   ========================================================= */

client.on(
  "interactionCreate",
  async interaction => {
    try {
      if (
        interaction.isButton()
      ) {
        return handleButton(
          interaction
        );
      }

      if (
        interaction.isStringSelectMenu()
      ) {
        return handleSelect(
          interaction
        );
      }
    } catch (error) {
      console.error(
        "INTERACTION HATASI:",
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
        }).catch(
          () => {}
        );
      }
    }
  }
);

/* =========================================================
   YENİ ÜYE
   ========================================================= */

client.on(
  "guildMemberAdd",
  async member => {
    try {
      const role =
        member.guild.roles.cache.get(
          IDS.roles.unregistered
        );

      if (role) {
        await member.roles.add(
          role
        ).catch(
          () => {}
        );
      }

      const channel =
        member.guild.channels.cache.get(
          IDS.channels.registration
        );

      if (channel) {
        const embed =
          new EmbedBuilder()
            .setTitle(
              "👋 Yeni Üye!"
            )
            .setDescription(
              `${member}\n\n` +
              `Sunucumuza hoş geldin!\n` +
              `<@&${IDS.roles.registration}> kayıt işleminle ilgilenecektir.`
            )
            .setTimestamp();

        await safeSend(
          channel,
          {
            content:
              `<@&${IDS.roles.registration}>`,
            embeds: [embed]
          }
        );
      }

      const user =
        ensureUser(
          member.id
        );

      user.registered =
        false;

      saveData();
    } catch (error) {
      console.error(
        "YENİ ÜYE HATASI:",
        error
      );
    }
  }
);

/* =========================================================
   READY
   ========================================================= */

client.once(
  "ready",
  async () => {
    console.log(
      "================================"
    );

    console.log(
      "AXERA LEAGUE BOT AKTİF"
    );

    console.log(
      `Bot: ${client.user.tag}`
    );

    console.log(
      `Sunucu: ${client.guilds.cache.size}`
    );

    console.log(
      `Ping: ${client.ws.ping}ms`
    );

    console.log(
      "================================"
    );

    try {
      client.user.setPresence({
        activities: [
          {
            name:
              "Axera League | Futbol RP",
            type: 0
          }
        ],
        status:
          "online"
      });
    } catch {}

    /*
     * Açılışta eski durum mesajlarını temizle
     * ve yeni mesaj gönder.
     */
    await updateBotStatus();

    startStatusScheduler();
    startFixtureScheduler();
    startTicketScheduler();
  }
);

/* =========================================================
   HATA YÖNETİMİ
   ========================================================= */

process.on(
  "unhandledRejection",
  error => {
    console.error(
      "UNHANDLED REJECTION:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  error => {
    console.error(
      "UNCAUGHT EXCEPTION:",
      error
    );
  }
);

/* =========================================================
   TOKEN
   ========================================================= */

if (!process.env.TOKEN) {
  console.error(
    "❌ TOKEN bulunamadı!"
  );

  process.exit(1);
}

client.login(
  process.env.TOKEN
)
.then(() => {
  console.log(
    "Discord bağlantısı başlatıldı."
  );
})
.catch(error => {
  console.error(
    "DISCORD LOGIN HATASI:",
    error
  );

  process.exit(1);
});
