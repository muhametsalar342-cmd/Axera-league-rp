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

const PREFIX = ".";

/* =========================================================
   AXERA LEAGUE ROL IDLERİ
========================================================= */

const ROLES = {
  YONETICI: "1534455282426445897",
  KAYIT_YETKILI: "1534456315366342716",
  DEGER_YETKILI: "1534456192913375382",
  KAYITSIZ: "1534457560134844517",
  OYUNCU: "1534457228986421278",
  TD: "1534456648930693120",
  UYE: "1534457460163608636",
  MODERATOR: "1534456108415189063",
  SPIKER: "1535251168169697390"
};

/* =========================================================
   AXERA LEAGUE KANAL IDLERİ
========================================================= */

const CHANNELS = {
  KAYIT: "1547371376355053599",
  SOHBET: "1547374641763455009",
  ANTRENMAN: "1547375589923618957",
  PENALTI: "1547375997698052166",
  TWEET: "1547377797193011340",
  MAC: "1547376935410073692",
  PUAN: "1547382143775285431",
  DEGER: "1547376344927834122",
  BOT_DURUM: "1547388197796057118"
};

const DATA_FILE = path.join(__dirname, "data.json");

/* =========================================================
   DATA
========================================================= */

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
      fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(DEFAULT_DATA, null, 2)
      );
      return structuredClone(DEFAULT_DATA);
    }

    const saved = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );

    return {
      ...structuredClone(DEFAULT_DATA),
      ...saved
    };
  } catch (error) {
    console.error("data.json okunamadı:", error);
    return structuredClone(DEFAULT_DATA);
  }
}

let data = loadData();

function saveData() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(data, null, 2)
    );
  } catch (error) {
    console.error("Veri kaydedilemedi:", error);
  }
}

/* =========================================================
   GENEL YARDIMCILAR
========================================================= */

function isAdmin(member) {
  return (
    member.permissions.has(
      PermissionsBitField.Flags.Administrator
    ) ||
    member.roles.cache.has(ROLES.YONETICI)
  );
}

function hasRole(member, roleId) {
  return member.roles.cache.has(roleId);
}

function hasValuePermission(member) {
  return (
    isAdmin(member) ||
    hasRole(member, ROLES.DEGER_YETKILI)
  );
}

function hasMatchPermission(member) {
  return (
    isAdmin(member) ||
    hasRole(member, ROLES.SPIKER)
  );
}

function hasRegistrationPermission(member) {
  return (
    isAdmin(member) ||
    hasRole(member, ROLES.KAYIT_YETKILI)
  );
}

function hasModeratorPermission(member) {
  return (
    isAdmin(member) ||
    hasRole(member, ROLES.MODERATOR)
  );
}

/*
  ÖNEMLİ:
  Kayıtsız rolü hiçbir genel sistemi engellemez.
  Kayıtsız kullanıcılar da:
  .ant
  .pen
  .tweet
  .maç
  .kadro
  .puan
  vb. sistemleri kullanabilir.
*/

function ensureUser(userId) {
  if (!data.users[userId]) {
    data.users[userId] = {
      value: 0,
      training: 0,
      lastTweetReward: 0,
      stats: {
        goals: 0,
        assists: 0,
        matches: 0
      }
    };
  }

  if (!data.users[userId].stats) {
    data.users[userId].stats = {
      goals: 0,
      assists: 0,
      matches: 0
    };
  }

  return data.users[userId];
}

function getMentionedMember(message) {
  return message.mentions.members.first();
}

function cleanText(text) {
  return String(text || "").trim();
}

function parseNumber(text) {
  if (!text) return null;

  const value = Number(
    String(text)
      .replace(",", ".")
      .replace(/[^\d.-]/g, "")
  );

  if (!Number.isFinite(value)) return null;

  return value;
}

/* =========================================================
   SADECE M€ DEĞER SİSTEMİ
========================================================= */

function parseMillions(input) {
  if (!input) return null;

  const text = String(input)
    .trim()
    .toUpperCase();

  /*
    Sadece:
    5
    5M
    5M€
    5.5M
    5,5M€

    B ve K KESİNLİKLE kabul edilmez.
  */

  if (
    !/^\d+(?:[.,]\d+)?(?:M€|M)?$/i.test(text)
  ) {
    return null;
  }

  const numberPart = text
    .replace(/M€/i, "")
    .replace(/M/i, "")
    .trim();

  const value = Number(
    numberPart.replace(",", ".")
  );

  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  return value;
}

function formatMillions(value) {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return Number(value.toFixed(2)).toString();
}

/*
  SADECE nickname'in sonundaki M€ okunur.
  İsmin geri kalanına dokunulmaz.
*/

function extractNicknameValue(nickname) {
  if (!nickname) return null;

  const match = String(nickname).match(
    /(\d+(?:[.,]\d+)?)\s*M€\s*$/i
  );

  if (!match) return null;

  return Number(
    match[1].replace(",", ".")
  );
}

/*
  SADECE SONDAKİ M€ BÖLÜMÜ DEĞİŞTİRİLİR.
*/

function replaceNicknameValue(nickname, newValue) {
  const regex =
    /(\d+(?:[.,]\d+)?)\s*M€\s*$/i;

  if (!regex.test(nickname)) {
    return null;
  }

  return nickname.replace(
    regex,
    `${formatMillions(newValue)}M€`
  );
}

async function changePlayerValue(member, amount) {
  const oldValue = extractNicknameValue(
    member.displayName
  );

  if (oldValue === null) {
    return {
      ok: false,
      message:
        "❌ Oyuncunun isminde sonda geçerli bir **M€** değeri bulunamadı."
    };
  }

  const newValue = oldValue + amount;

  if (newValue < 0) {
    return {
      ok: false,
      message:
        "❌ Oyuncu değeri 0M€ altına düşemez."
    };
  }

  const newNickname =
    replaceNicknameValue(
      member.displayName,
      newValue
    );

  if (!newNickname) {
    return {
      ok: false,
      message:
        "❌ M€ değeri değiştirilemedi."
    };
  }

  try {
    await member.setNickname(newNickname);
  } catch (error) {
    console.error(error);

    return {
      ok: false,
      message:
        "❌ Takma ad değiştirilemedi. Botun **Takma Adları Yönet** yetkisini kontrol edin."
    };
  }

  const user = ensureUser(member.id);

  user.value = newValue;

  saveData();

  return {
    ok: true,
    oldValue,
    newValue
  };
}

/* =========================================================
   KAYIT SİSTEMİ
========================================================= */

function registrationButtons(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`register_futbolcu_${userId}`)
      .setLabel("Futbolcu")
      .setEmoji("⚽")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`register_uye_${userId}`)
      .setLabel("Üye")
      .setEmoji("👤")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`register_td_${userId}`)
      .setLabel("Teknik Direktör")
      .setEmoji("🧑‍💼")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`register_kaleci_${userId}`)
      .setLabel("Kaleci")
      .setEmoji("🧤")
      .setStyle(ButtonStyle.Danger)
  );
}

async function handleRegistrationCommand(message, args) {
  if (
    message.channel.id !== CHANNELS.KAYIT
  ) {
    return message.reply(
      `❌ Bu komut sadece <#${CHANNELS.KAYIT}> kanalında kullanılabilir.`
    );
  }

  if (!hasRegistrationPermission(message.member)) {
    return message.reply(
      "❌ Bu komutu yalnızca Kayıt Yetkilisi veya Yönetici kullanabilir."
    );
  }

  const target = getMentionedMember(message);

  if (!target) {
    return message.reply(
      "❌ Kullanım: `.k @Oyuncu TakmaAdı`"
    );
  }

  /*
    Mentiondan sonra yazılan HER ŞEY takma ad olur.
  */

  const mentionText =
    message.mentions.users.first();

  let nickname = message.content
    .replace(
      message.content
        .slice(0, message.content.indexOf("<@"))
        .trim(),
      ""
    );

  if (mentionText) {
    nickname = nickname.replace(
      new RegExp(
        `<@!?${mentionText.id}>`
      ),
      ""
    );
  }

  nickname = nickname.trim();

  if (!nickname) {
    return message.reply(
      "❌ Oyuncunun kullanacağı takma adı da yazmalısın.\nÖrnek: `.k @Oyuncu L.Yamal | 🇪🇸 | SNT | 15M€`"
    );
  }

  if (nickname.length > 32) {
    return message.reply(
      "❌ Discord kullanıcı adı en fazla 32 karakter olabilir."
    );
  }

  ensureUser(target.id);

  data.registrationPanels[target.id] = {
    nickname,
    createdBy: message.author.id,
    createdAt: Date.now()
  };

  saveData();

  const embed = new EmbedBuilder()
    .setTitle("📝 Oyuncu Kayıt")
    .setDescription(
      `**Oyuncu:** ${target}\n` +
      `**Yeni Ad:** \`${nickname}\`\n\n` +
      "Oyuncunun türünü aşağıdaki butonlardan seçin."
    )
    .setColor(0x2b2d31);

  return message.channel.send({
    embeds: [embed],
    components: [
      registrationButtons(target.id)
    ]
  });
}

async function completeRegistration(
  interaction,
  type
) {
  const userId =
    interaction.customId.split("_").pop();

  if (
    !hasRegistrationPermission(
      interaction.member
    )
  ) {
    return interaction.reply({
      content:
        "❌ Bu kayıt panelini yalnızca Kayıt Yetkilisi veya Yönetici kullanabilir.",
      ephemeral: true
    });
  }

  const target =
    await interaction.guild.members
      .fetch(userId)
      .catch(() => null);

  if (!target) {
    return interaction.reply({
      content:
        "❌ Oyuncu sunucuda bulunamadı.",
      ephemeral: true
    });
  }

  const panel =
    data.registrationPanels[userId];

  if (!panel) {
    return interaction.reply({
      content:
        "❌ Bu kayıt panelinin süresi/verisi bulunamadı.",
      ephemeral: true
    });
  }

  const roleMap = {
    futbolcu: ROLES.OYUNCU,
    uye: ROLES.UYE,
    td: ROLES.TD,
    kaleci: ROLES.OYUNCU
  };

  const roleId = roleMap[type];

  try {
    const removableRoles = [
      ROLES.KAYITSIZ,
      ROLES.OYUNCU,
      ROLES.TD,
      ROLES.UYE
    ];

    for (const roleIdToRemove of removableRoles) {
      if (
        target.roles.cache.has(
          roleIdToRemove
        )
      ) {
        await target.roles.remove(
          roleIdToRemove
        );
      }
    }

    await target.roles.add(roleId);

    /*
      Kaleci ayrıca Oyuncu rolü de alır.
    */

    if (type === "kaleci") {
      await target.roles.add(ROLES.OYUNCU);
    }

    await target.setNickname(
      panel.nickname
    );

    ensureUser(target.id);

    delete data.registrationPanels[userId];

    saveData();

    const names = {
      futbolcu: "⚽ Futbolcu",
      uye: "👤 Üye",
      td: "🧑‍💼 Teknik Direktör",
      kaleci: "🧤 Kaleci"
    };

    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle("✅ Kayıt Tamamlandı")
          .setDescription(
            `${target} başarıyla kayıt edildi.\n\n` +
            `**Tür:** ${names[type]}\n` +
            `**Takma Ad:** \`${panel.nickname}\``
          )
          .setColor(0x57f287)
      ],
      components: []
    });
  } catch (error) {
    console.error(error);

    return interaction.reply({
      content:
        "❌ Kayıt sırasında hata oluştu. Botun rol ve takma ad yetkilerini kontrol edin.",
      ephemeral: true
    });
  }
}

async function handleKayitsizVer(
  message,
  args
) {
  if (!hasRegistrationPermission(message.member)) {
    return message.reply(
      "❌ Bu komutu yalnızca Kayıt Yetkilisi veya Yönetici kullanabilir."
    );
  }

  const target = getMentionedMember(message);

  if (!target) {
    return message.reply(
      "❌ Kullanım: `.kayıtsızver @Oyuncu`"
    );
  }

  for (const roleId of [
    ROLES.OYUNCU,
    ROLES.TD,
    ROLES.UYE
  ]) {
    if (target.roles.cache.has(roleId)) {
      await target.roles.remove(roleId)
        .catch(() => {});
    }
  }

  if (!target.roles.cache.has(ROLES.KAYITSIZ)) {
    await target.roles.add(
      ROLES.KAYITSIZ
    ).catch(() => {});
  }

  return message.reply(
    `✅ ${target} artık **Kayıtsız** olarak işaretlendi.`
  );
}

/* =========================================================
   OYUNCU ARAMA
========================================================= */

async function handleAra(message, args) {
  const query = args.join(" ").toLowerCase().trim();

  if (!query) {
    return message.reply(
      "❌ Kullanım: `.ara OyuncuAdı`"
    );
  }

  await message.guild.members.fetch();

  const results = message.guild.members.cache
    .filter(member => {
      if (member.user.bot) return false;

      if (
        member.roles.cache.has(
          ROLES.KAYITSIZ
        )
      ) {
        return false;
      }

      return (
        member.displayName
          .toLowerCase()
          .includes(query) ||
        member.user.username
          .toLowerCase()
          .includes(query)
      );
    })
    .first(10);

  if (!results.size) {
    return message.reply(
      "❌ Kayıtlı oyuncu bulunamadı."
    );
  }

  const description = results
    .map(
      (member, index) =>
        `**${index + 1}.** ${member} — \`${member.displayName}\``
    )
    .join("\n");

  return message.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("🔎 Oyuncu Arama")
        .setDescription(description)
        .setColor(0x5865f2)
    ]
  });
}

/* =========================================================
   ANTRENMAN
========================================================= */

async function handleTraining(message) {
  const user = ensureUser(message.author.id);

  if (!data.training[message.author.id]) {
    data.training[message.author.id] = 0;
  }

  let current =
    data.training[message.author.id];

  if (current >= 5) {
    current = 0;
  }

  current++;

  if (current < 5) {
    data.training[message.author.id] = current;

    saveData();

    return message.reply(
      `🏋️ Antrenman ilerlemen: **${current}/5**\nBir sonraki antrenman için tekrar \`.ant\` yaz.`
    );
  }

  /*
    5/5 tamamlandı
  */

  data.training[message.author.id] = 0;

  const result =
    await changePlayerValue(
      message.member,
      3
    );

  if (!result.ok) {
    saveData();

    return message.reply(
      `🏋️ Antrenman: **5/5 tamamlandı!**\n\n` +
      `⚠️ +3M€ verilemedi:\n${result.message}`
    );
  }

  saveData();

  return message.reply(
    `🏋️ **Antrenman tamamlandı!**\n` +
    `İlerleme: **5/5** → tekrar **0/5**\n` +
    `💰 Ödül: **+3M€**\n` +
    `📈 Yeni değer: **${formatMillions(result.newValue)}M€**`
  );
}

/* =========================================================
   PENALTI
========================================================= */

async function handlePenalty(message) {
  const random = Math.random();

  let result;

  if (random < 0.50) {
    result = "goal";
  } else if (random < 0.75) {
    result = "post";
  } else {
    result = "save";
  }

  if (result === "goal") {
    const change =
      await changePlayerValue(
        message.member,
        5
      );

    if (!change.ok) {
      return message.reply(
        `⚽ **GOOOL!**\n\n⚠️ Ödül verilemedi:\n${change.message}`
      );
    }

    return message.reply(
      `⚽ **GOOOL!**\n\n` +
      `🧤 Axera Kalecisi mağlup oldu!\n` +
      `💰 Ödül: **+5M€**\n` +
      `📈 Yeni değer: **${formatMillions(change.newValue)}M€**`
    );
  }

  if (result === "post") {
    return message.reply(
      "🥅 **DİREK!**\nTop direkten döndü."
    );
  }

  return message.reply(
    "🧤 **KURTARDI!**\nAxera Kalecisi penaltıyı çıkardı."
  );
}

/* =========================================================
   TWEET
========================================================= */

async function handleTweet(message, args) {
  if (
    message.channel.id !== CHANNELS.TWEET
  ) {
    return message.reply(
      `❌ Bu komut sadece <#${CHANNELS.TWEET}> kanalında kullanılabilir.`
    );
  }

  const text = args.join(" ").trim();

  if (!text) {
    return message.reply(
      "❌ Kullanım: `.tweet Mesaj`"
    );
  }

  if (text.length > 4000) {
    return message.reply(
      "❌ Tweet en fazla 4000 karakter olabilir."
    );
  }

  const now = Date.now();
  const last =
    data.tweetCooldowns[
      message.author.id
    ] || 0;

  const cooldown =
    24 * 60 * 60 * 1000;

  let rewardText =
    "⏳ 24 saatlik ödül süresi dolmadığı için bu tweet değer ödülü vermedi.";

  let rewardGiven = false;

  if (now - last >= cooldown) {
    const result =
      await changePlayerValue(
        message.member,
        5
      );

    if (result.ok) {
      data.tweetCooldowns[
        message.author.id
      ] = now;

      rewardText =
        "💰 24 saatlik tweet ödülü: **+5M€**";
      rewardGiven = true;
    } else {
      rewardText =
        `⚠️ Tweet ödülü verilemedi: ${result.message}`;
    }
  }

  const embed = new EmbedBuilder()
    .setAuthor({
      name: message.member.displayName,
      iconURL:
        message.author.displayAvatarURL()
    })
    .setDescription(text)
    .setFooter({
      text: "Axera League • Tweet"
    })
    .setTimestamp();

  await message.delete().catch(() => {});

  const sent =
    await message.channel.send({
      embeds: [embed]
    });

  /*
    Ödül bilgisini tweetin içine yazmak yerine
    sadece kullanıcıya kısa DM/cevap gönderilmez.
    Tweet görünümü temiz kalır.
  */

  if (rewardGiven) {
    await message.author.send(
      `🐦 Tweetin paylaşıldı.\n${rewardText}`
    ).catch(() => {});
  }

  saveData();

  return sent;
}

/* =========================================================
   TAKIM SİSTEMİ
========================================================= */

function ensureTeam(teamRole) {
  if (!data.teams[teamRole.id]) {
    data.teams[teamRole.id] = {
      roleId: teamRole.id,
      name: teamRole.name,
      value: 0,
      players: [],
      active: true
    };
  }

  if (!Array.isArray(data.teams[teamRole.id].players)) {
    data.teams[teamRole.id].players = [];
  }

  if (!data.standings[teamRole.id]) {
    data.standings[teamRole.id] = {
      points: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0
    };
  }

  return data.teams[teamRole.id];
}

async function handleTeamAdd(
  message
) {
  if (!hasMatchPermission(message.member)) {
    return message.reply(
      "❌ Bu komutu yalnızca Spiker veya Yönetici kullanabilir."
    );
  }

  const role =
    message.mentions.roles.first();

  if (!role) {
    return message.reply(
      "❌ Kullanım: `.takımekle @Takım`"
    );
  }

  if (role.id === ROLES.KAYITSIZ) {
    return message.reply(
      "❌ Kayıtsız rolü takım olamaz."
    );
  }

  ensureTeam(role);

  saveData();

  return message.reply(
    `✅ **${role.name}** takımı sisteme eklendi.`
  );
}

async function handleTeamRemove(
  message
) {
  if (!hasMatchPermission(message.member)) {
    return message.reply(
      "❌ Bu komutu yalnızca Spiker veya Yönetici kullanabilir."
    );
  }

  const role =
    message.mentions.roles.first();

  if (!role) {
    return message.reply(
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
    return message.reply(
      "❌ Bu takımın devam eden maçı var. Maç bitmeden takım kaldırılamaz."
    );
  }

  delete data.teams[role.id];
  delete data.standings[role.id];
  delete data.formations[role.id];
  delete data.cups[role.id];

  data.fixtures =
    data.fixtures.filter(
      fixture =>
        fixture.team1 !== role.id &&
        fixture.team2 !== role.id
    );

  saveData();

  return message.reply(
    `✅ **${role.name}** takım sistemi verilerden kaldırıldı. Discord rolü silinmedi.`
  );
}

async function handleTeamPoints(
  message,
  args
) {
  if (!hasMatchPermission(message.member)) {
    return message.reply(
      "❌ Bu komut sadece Spiker veya Yönetici tarafından kullanılabilir."
    );
  }

  const role =
    message.mentions.roles.first();

  const amountText =
    args[1] || args[0];

  if (!role || amountText === undefined) {
    return message.reply(
      "❌ Kullanım: `.puanekle @Takım 3`"
    );
  }

  const amount = parseNumber(amountText);

  if (
    amount === null ||
    !Number.isInteger(amount)
  ) {
    return message.reply(
      "❌ Puan miktarı tam sayı olmalıdır."
    );
  }

  ensureTeam(role);

  data.standings[role.id].points += amount;

  saveData();

  return message.reply(
    `✅ **${role.name}** takımına **${amount} puan** eklendi.`
  );
}

async function handleTeamValue(
  message,
  args
) {
  if (!hasMatchPermission(message.member)) {
    return message.reply(
      "❌ Bu komutu sadece Spiker veya Yönetici kullanabilir."
    );
  }

  const role =
    message.mentions.roles.first();

  if (!role) {
    return message.reply(
      "❌ Kullanım: `.takımdeğer @Takım 850M`"
    );
  }

  const raw =
    args[1] || args[0];

  const value =
    parseMillions(raw);

  if (value === null) {
    return message.reply(
      "❌ Takım değeri M€ şeklinde olmalıdır. Örnek: `850M`"
    );
  }

  const team = ensureTeam(role);

  team.value = value;

  saveData();

  return message.reply(
    `✅ **${role.name}** takım değeri **${formatMillions(value)}M€** olarak ayarlandı.`
  );
}

/* =========================================================
   KADRO
========================================================= */

async function handleSquadAdd(
  message,
  args
) {
  if (!hasMatchPermission(message.member)) {
    return message.reply(
      "❌ Bu komutu yalnızca Spiker veya Yönetici kullanabilir."
    );
  }

  const roles =
    [...message.mentions.roles.values()];

  const members =
    [...message.mentions.members.values()];

  const teamRole = roles[0];
  const player = members[0];

  if (!teamRole || !player) {
    return message.reply(
      "❌ Kullanım: `.kadroekle @Takım @Oyuncu Pozisyon`"
    );
  }

  const position =
    args[args.length - 1];

  if (!position) {
    return message.reply(
      "❌ Oyuncunun pozisyonunu yazmalısın."
    );
  }

  const team =
    ensureTeam(teamRole);

  team.players =
    team.players.filter(
      p => p.id !== player.id
    );

  team.players.push({
    id: player.id,
    position:
      position.toUpperCase()
  });

  saveData();

  return message.reply(
    `✅ ${player} **${teamRole.name}** kadrosuna **${position.toUpperCase()}** pozisyonuyla eklendi.`
  );
}

async function handleSquadRemove(
  message
) {
  if (!hasMatchPermission(message.member)) {
    return message.reply(
      "❌ Bu komutu yalnızca Spiker veya Yönetici kullanabilir."
    );
  }

  const roles =
    [...message.mentions.roles.values()];

  const members =
    [...message.mentions.members.values()];

  const teamRole = roles[0];
  const player = members[0];

  if (!teamRole || !player) {
    return message.reply(
      "❌ Kullanım: `.kadrocikar @Takım @Oyuncu`"
    );
  }

  const team =
    ensureTeam(teamRole);

  team.players =
    team.players.filter(
      p => p.id !== player.id
    );

  saveData();

  return message.reply(
    `✅ ${player} **${teamRole.name}** kadrosundan çıkarıldı.`
  );
}

async function handleSquad(
  message
) {
  const teamRole =
    message.mentions.roles.first();

  if (!teamRole) {
    return message.reply(
      "❌ Kullanım: `.kadro @Takım`"
    );
  }

  const team =
    ensureTeam(teamRole);

  const manual =
    Array.isArray(team.players)
      ? team.players
      : [];

  const roleMembers =
    getTeamMembers(
      message.guild,
      teamRole.id
    );

  const players = new Map();

  for (const member of roleMembers) {
    players.set(member.id, {
      member,
      position: "OYUNCU"
    });
  }

  for (const player of manual) {
    const member =
      await message.guild.members
        .fetch(player.id)
        .catch(() => null);

    if (!member) continue;

    players.set(player.id, {
      member,
      position:
        player.position || "OYUNCU"
    });
  }

  const groups = {};

  for (const player of players.values()) {
    const pos =
      player.position.toUpperCase();

    if (!groups[pos]) {
      groups[pos] = [];
    }

    groups[pos].push(player.member);
  }

  let totalValue = 0;

  const lines = [];

  for (const [position, members] of Object.entries(groups)) {
    lines.push(`### ${position}`);

    for (const member of members) {
      const value =
        extractNicknameValue(
          member.displayName
        );

      if (value !== null) {
        totalValue += value;
      }

      lines.push(
        `• ${member} — \`${member.displayName}\``
      );
    }

    lines.push("");
  }

  if (!lines.length) {
    lines.push("Kadrosunda oyuncu bulunmuyor.");
  }

  const embed = new EmbedBuilder()
    .setTitle(`👕 ${teamRole.name} Kadrosu`)
    .setDescription(lines.join("\n"))
    .addFields({
      name: "📊 Takım Bilgisi",
      value:
        `Oyuncu: **${players.size}**\n` +
        `Kadro Değeri: **${formatMillions(totalValue)}M€**\n` +
        `Takım Değeri: **${formatMillions(team.value || 0)}M€**`
    })
    .setColor(0x5865f2);

  return message.reply({
    embeds: [embed]
  });
}

/* =========================================================
   FORMASYON
========================================================= */

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

async function handleFormation(
  message
) {
  if (!hasMatchPermission(message.member)) {
    return message.reply(
      "❌ Bu komutu yalnızca Spiker veya Yönetici kullanabilir."
    );
  }

  const teamRole =
    message.mentions.roles.first();

  if (!teamRole) {
    return message.reply(
      "❌ Kullanım: `.formasyon @Takım`"
    );
  }

  ensureTeam(teamRole);

  const menu =
    new StringSelectMenuBuilder()
      .setCustomId(
        `formation_${teamRole.id}`
      )
      .setPlaceholder(
        "Bir formasyon seç..."
      )
      .addOptions(
        FORMATIONS.map(format => ({
          label: format,
          value: format,
          description:
            `${format} formasyonunu seç`
        }))
      );

  return message.reply({
    content:
      `📐 **${teamRole.name}** için formasyon seç:`,
    components: [
      new ActionRowBuilder().addComponents(
        menu
      )
    ]
  });
}

/* =========================================================
   PUAN DURUMU
========================================================= */

async function handleStandings(message) {
  await message.guild.roles.fetch();

  const entries = [];

  for (
    const [teamId, standing]
    of Object.entries(data.standings)
  ) {
    const role =
      message.guild.roles.cache.get(teamId);

    if (!role) continue;

    const gd =
      (standing.goalsFor || 0) -
      (standing.goalsAgainst || 0);

    entries.push({
      role,
      ...standing,
      gd
    });
  }

  entries.sort((a, b) => {
    if (b.points !== a.points) {
      return b.points - a.points;
    }

    if (b.gd !== a.gd) {
      return b.gd - a.gd;
    }

    return (
      (b.goalsFor || 0) -
      (a.goalsFor || 0)
    );
  });

  if (!entries.length) {
    return message.reply(
      "🏆 Henüz puan durumunda takım yok."
    );
  }

  const lines = entries.map(
    (team, index) =>
      `**${index + 1}.** ${team.role}\n` +
      `   **${team.points || 0} P** | ` +
      `AV: **${team.gd}** | ` +
      `AG: **${team.goalsFor || 0}** | ` +
      `OM: **${team.goalsAgainst || 0}**`
  );

  return message.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("🏆 Axera League Puan Durumu")
        .setDescription(lines.join("\n\n"))
        .setColor(0xf1c40f)
        .setTimestamp()
    ]
  });
}

/* =========================================================
   KUPA / MÜZE
========================================================= */

async function handleCupAdd(
  message
) {
  if (!hasMatchPermission(message.member)) {
    return message.reply(
      "❌ Bu komutu yalnızca Spiker veya Yönetici kullanabilir."
    );
  }

  const teamRole =
    message.mentions.roles.first();

  if (!teamRole) {
    return message.reply(
      "❌ Kullanım: `.kupaekle @Takım KupaAdı`"
    );
  }

  const index =
    message.content.indexOf(
      teamRole.id
    );

  let cupName =
    message.content
      .slice(index + teamRole.id.length)
      .trim();

  cupName =
    cupName.replace(/<@&\d+>/, "")
      .trim();

  if (!cupName) {
    return message.reply(
      "❌ Kupa adını yazmalısın."
    );
  }

  if (!data.cups[teamRole.id]) {
    data.cups[teamRole.id] = [];
  }

  data.cups[teamRole.id].push({
    name: cupName,
    date: Date.now()
  });

  saveData();

  return message.reply(
    `🏆 **${cupName}** kupası **${teamRole.name}** müzesine eklendi.`
  );
}

async function handleCupRemove(
  message
) {
  if (!hasMatchPermission(message.member)) {
    return message.reply(
      "❌ Bu komutu yalnızca Spiker veya Yönetici kullanabilir."
    );
  }

  const teamRole =
    message.mentions.roles.first();

  if (!teamRole) {
    return message.reply(
      "❌ Kullanım: `.kupasil @Takım KupaAdı`"
    );
  }

  const index =
    message.content.indexOf(
      teamRole.id
    );

  let cupName =
    message.content
      .slice(index + teamRole.id.length)
      .trim();

  cupName =
    cupName.replace(/<@&\d+>/, "")
      .trim();

  if (!data.cups[teamRole.id]) {
    return message.reply(
      "❌ Bu takımın kupa kaydı yok."
    );
  }

  const before =
    data.cups[teamRole.id].length;

  data.cups[teamRole.id] =
    data.cups[teamRole.id].filter(
      cup =>
        cup.name.toLowerCase() !==
        cupName.toLowerCase()
    );

  if (
    data.cups[teamRole.id].length === before
  ) {
    return message.reply(
      "❌ Bu isimde kupa bulunamadı."
    );
  }

  saveData();

  return message.reply(
    `🗑️ **${cupName}** kupası **${teamRole.name}** müzesinden kaldırıldı.`
  );
}

async function handleMuseum(message) {
  const teamRole =
    message.mentions.roles.first();

  if (!teamRole) {
    return message.reply(
      "❌ Kullanım: `.müze @Takım`"
    );
  }

  const cups =
    data.cups[teamRole.id] || [];

  const description =
    cups.length
      ? cups
          .map(
            (cup, index) =>
              `🏆 **${index + 1}.** ${cup.name}`
          )
          .join("\n")
      : "Henüz kazanılmış kupa bulunmuyor.";

  return message.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle(
          `🏛️ ${teamRole.name} Müze`
        )
        .setDescription(description)
        .setColor(0xf1c40f)
    ]
  });
}

/* =========================================================
   FİKSTÜR
========================================================= */

function parseFixtureDate(
  dateText,
  timeText
) {
  if (!dateText || !timeText) return null;

  const date =
    new Date(
      `${dateText}T${timeText}:00`
    );

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.getTime();
}

async function handleFixtureAdd(
  message,
  args
) {
  if (!hasMatchPermission(message.member)) {
    return message.reply(
      "❌ Bu komutu yalnızca Spiker veya Yönetici kullanabilir."
    );
  }

  const roles =
    [...message.mentions.roles.values()];

  if (roles.length < 2) {
    return message.reply(
      "❌ Kullanım: `.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`"
    );
  }

  const dateText =
    args[2];

  const timeText =
    args[3];

  const timestamp =
    parseFixtureDate(
      dateText,
      timeText
    );

  if (!timestamp) {
    return message.reply(
      "❌ Tarih formatı yanlış.\nÖrnek: `2026-09-10 20:30`"
    );
  }

  const id =
    data.nextFixtureId++;

  data.fixtures.push({
    id,
    team1: roles[0].id,
    team2: roles[1].id,
    timestamp,
    started: false,
    completed: false
  });

  ensureTeam(roles[0]);
  ensureTeam(roles[1]);

  saveData();

  return message.reply(
    `📅 Fikstür eklendi:\n${roles[0]} 🆚 ${roles[1]}\n🕐 <t:${Math.floor(timestamp / 1000)}:F>`
  );
}

async function handleFixtures(
  message
) {
  const upcoming =
    data.fixtures
      .filter(
        fixture =>
          !fixture.completed
      )
      .sort(
        (a, b) =>
          a.timestamp - b.timestamp
      )
      .slice(0, 20);

  if (!upcoming.length) {
    return message.reply(
      "📅 Kayıtlı fikstür bulunmuyor."
    );
  }

  const lines = [];

  for (const fixture of upcoming) {
    const team1 =
      message.guild.roles.cache.get(
        fixture.team1
      );

    const team2 =
      message.guild.roles.cache.get(
        fixture.team2
      );

    if (!team1 || !team2) continue;

    lines.push(
      `**#${fixture.id}** ${team1} 🆚 ${team2}\n` +
      `🕐 <t:${Math.floor(
        fixture.timestamp / 1000
      )}:F>`
    );
  }

  return message.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("📅 Axera League Fikstür")
        .setDescription(
          lines.join("\n\n")
        )
        .setColor(0x5865f2)
    ]
  });
}

async function handleFixtureRemove(
  message
) {
  if (!hasMatchPermission(message.member)) {
    return message.reply(
      "❌ Bu komutu yalnızca Spiker veya Yönetici kullanabilir."
    );
  }

  const roles =
    [...message.mentions.roles.values()];

  if (roles.length < 2) {
    return message.reply(
      "❌ Kullanım: `.fiksturcikar @Takım1 @Takım2`"
    );
  }

  const before =
    data.fixtures.length;

  data.fixtures =
    data.fixtures.filter(
      fixture =>
        !(
          fixture.team1 === roles[0].id &&
          fixture.team2 === roles[1].id
        ) &&
        !(
          fixture.team1 === roles[1].id &&
          fixture.team2 === roles[0].id
        )
    );

  if (
    data.fixtures.length === before
  ) {
    return message.reply(
      "❌ Bu iki takım arasında fikstür bulunamadı."
    );
  }

  saveData();

  return message.reply(
    "✅ Fikstür kaldırıldı."
  );
}

/* =========================================================
   CANLI MAÇ SİSTEMİ
========================================================= */

const COMMENTARIES = [
  "orta sahada paslaşmalar devam ediyor.",
  "kanattan hızlı bir atak gelişiyor.",
  "savunma araya girdi ve topu uzaklaştırdı.",
  "uzaktan bir şut geldi!",
  "kaleci topu kontrol etti.",
  "oyuncu rakibinin yanından sıyrılmaya çalışıyor.",
  "ceza sahasına doğru etkili bir orta açıldı.",
  "hakem faul düdüğünü çaldı.",
  "orta sahada top kapma mücadelesi yaşanıyor.",
  "hızlı bir kontra atak başladı.",
  "savunma çizgisi dikkatli.",
  "top yeniden hücum bölgesine taşındı."
];

function randomItem(array) {
  return array[
    Math.floor(
      Math.random() * array.length
    )
  ];
}

function getMatchPlayers(
  guild,
  teamId
) {
  const team =
    data.teams[teamId];

  const map = new Map();

  if (team) {
    for (
      const player
      of team.players || []
    ) {
      const member =
        guild.members.cache.get(
          player.id
        );

      if (member && !member.user.bot) {
        map.set(player.id, {
          member,
          position:
            player.position || "OYUNCU"
        });
      }
    }
  }

  const role =
    guild.roles.cache.get(teamId);

  if (role) {
    for (
      const member
      of role.members.values()
    ) {
      if (member.user.bot) continue;

      if (!map.has(member.id)) {
        map.set(member.id, {
          member,
          position: "OYUNCU"
        });
      }
    }
  }

  return [...map.values()];
}

function choosePlayer(players) {
  if (!players.length) return null;
  return randomItem(players);
}

async function startMatch(
  guild,
  team1Id,
  team2Id,
  channel
) {
  const team1 =
    guild.roles.cache.get(team1Id);

  const team2 =
    guild.roles.cache.get(team2Id);

  if (!team1 || !team2) {
    return null;
  }

  const players1 =
    getMatchPlayers(
      guild,
      team1Id
    );

  const players2 =
    getMatchPlayers(
      guild,
      team2Id
    );

  const matchId =
    `${Date.now()}_${team1Id}_${team2Id}`;

  const match = {
    id: matchId,
    team1: team1Id,
    team2: team2Id,
    minute: 0,
    score1: 0,
    score2: 0,
    players1: players1.map(p => p.member.id),
    players2: players2.map(p => p.member.id),
    goals: [],
    assists: [],
    finished: false,
    channelId: channel.id,
    startedAt: Date.now()
  };

  data.activeMatches[matchId] =
    match;

  saveData();

  const embed =
    new EmbedBuilder()
      .setTitle(
        `⚽ ${team1.name} 🆚 ${team2.name}`
      )
      .setDescription(
        `**0'** Maç başladı!\n\n` +
        `### ${team1.name} 0 - 0 ${team2.name}`
      )
      .addFields({
        name: "⏱️ Süre",
        value: "0 / 90 dakika",
        inline: true
      })
      .setColor(0x2b2d31)
      .setTimestamp();

  const msg =
    await channel.send({
      embeds: [embed]
    });

  const interval =
    setInterval(async () => {
      try {
        const current =
          data.activeMatches[matchId];

        if (!current) {
          clearInterval(interval);
          return;
        }

        current.minute++;

        /*
          Yaklaşık olarak dakikada bir olay.
        */

        const event =
          generateMatchEvent(
            guild,
            current
          );

        const eventText =
          event?.text ||
          randomItem(COMMENTARIES);

        if (event?.goal) {
          if (event.team === 1) {
            current.score1++;
          } else {
            current.score2++;
          }

          current.goals.push({
            playerId:
              event.player.id,
            team:
              event.team,
            minute:
              current.minute
          });

          if (event.assist) {
            current.assists.push({
              playerId:
                event.assist.id,
              minute:
                current.minute
            });
          }
        }

        const updated =
          new EmbedBuilder()
            .setTitle(
              `⚽ ${team1.name} ${current.score1} - ${current.score2} ${team2.name}`
            )
            .setDescription(
              `**${current.minute}'** ${eventText}\n\n` +
              `### ${team1.name} ${current.score1} - ${current.score2} ${team2.name}`
            )
            .addFields({
              name: "⏱️ Süre",
              value:
                `${current.minute} / 90 dakika`,
              inline: true
            })
            .setColor(0x2b2d31);

        await msg.edit({
          embeds: [updated]
        });

        if (current.minute >= 90) {
          clearInterval(interval);

          await finishMatch(
            guild,
            current,
            msg,
            team1,
            team2
          );
        }

        saveData();
      } catch (error) {
        console.error(
          "Maç döngüsü hatası:",
          error
        );

        clearInterval(interval);

        delete data.activeMatches[
          matchId
        ];

        saveData();
      }
    }, 3000);

  return match;
}

function generateMatchEvent(
  guild,
  match
) {
  const p1 =
    getMatchPlayers(
      guild,
      match.team1
    );

  const p2 =
    getMatchPlayers(
      guild,
      match.team2
    );

  const all =
    Math.random() < 0.5
      ? p1
      : p2;

  if (!all.length) {
    return {
      text:
        randomItem(COMMENTARIES)
    };
  }

  const selected =
    choosePlayer(all);

  /*
    Takım değeri küçük avantaj sağlar.
  */

  const team1 =
    data.teams[match.team1];

  const team2 =
    data.teams[match.team2];

  const value1 =
    team1?.value || 0;

  const value2 =
    team2?.value || 0;

  let goalChance = 0.035;

  if (value1 > value2) {
    goalChance = 0.04;
  } else if (value2 > value1) {
    goalChance = 0.04;
  }

  const roll =
    Math.random();

  if (roll < goalChance) {
    const team =
      p1.includes(selected)
        ? 1
        : 2;

    const opponentPlayers =
      team === 1 ? p2 : p1;

    const assist =
      Math.random() < 0.65 &&
      opponentPlayers.length === 0
        ? null
        : (
            team === 1
              ? choosePlayer(p1)
              : choosePlayer(p2)
          );

    const scorer =
      selected;

    let text =
      `⚽ **GOOOL!** ${scorer.member.displayName} topu ağlara gönderdi!`;

    if (
      assist &&
      assist.member.id !== scorer.member.id
    ) {
      text +=
        ` 🎯 Asist: ${assist.member.displayName}`;
    }

    return {
      goal: true,
      team,
      player: scorer.member,
      assist:
        assist &&
        assist.member.id !== scorer.member.id
          ? assist.member
          : null,
      text
    };
  }

  const eventRoll =
    Math.random();

  if (eventRoll < 0.15) {
    return {
      text:
        `🎯 ${selected.member.displayName} kaleyi yokladı! Kaleci topu kurtardı.`
    };
  }

  if (eventRoll < 0.25) {
    return {
      text:
        `🟨 ${selected.member.displayName} faul yaptı. Hakem oyunu durdurdu.`
    };
  }

  return {
    text:
      `${selected.member.displayName} ${randomItem(COMMENTARIES)}`
  };
}

async function finishMatch(
  guild,
  match,
  message,
  team1,
  team2
) {
  if (match.finished) {
    return;
  }

  match.finished = true;

  const winner =
    match.score1 > match.score2
      ? 1
      : match.score2 > match.score1
      ? 2
      : 0;

  const s1 =
    data.standings[team1.id] ||
    (data.standings[team1.id] = {
      points: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0
    });

  const s2 =
    data.standings[team2.id] ||
    (data.standings[team2.id] = {
      points: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0
    });

  s1.goalsFor += match.score1;
  s1.goalsAgainst += match.score2;

  s2.goalsFor += match.score2;
  s2.goalsAgainst += match.score1;

  if (winner === 1) {
    s1.points += 3;
    s1.wins++;
    s2.losses++;
  } else if (winner === 2) {
    s2.points += 3;
    s2.wins++;
    s1.losses++;
  } else {
    s1.points++;
    s2.points++;
    s1.draws++;
    s2.draws++;
  }

  const rewarded =
    new Set();

  /*
    Katılan oyuncular:
    hem rol üyeleri hem manuel kadro.
  */

  const participants = [
    ...getMatchPlayers(
      guild,
      team1.id
    ),
    ...getMatchPlayers(
      guild,
      team2.id
    )
  ];

  for (const player of participants) {
    if (
      rewarded.has(
        player.member.id
      )
    ) {
      continue;
    }

    rewarded.add(
      player.member.id
    );

    const result =
      await changePlayerValue(
        player.member,
        5
      );

    const user =
      ensureUser(
        player.member.id
      );

    user.stats.matches++;
  }

  /*
    Gol ödülleri
  */

  for (const goal of match.goals) {
    const player =
      await guild.members
        .fetch(goal.playerId)
        .catch(() => null);

    if (!player) continue;

    const user =
      ensureUser(player.id);

    user.stats.goals++;

    /*
      Gol +2M€
    */

    await changePlayerValue(
      player,
      2
    );
  }

  /*
    Asist ödülleri
  */

  for (const assist of match.assists) {
    const player =
      await guild.members
        .fetch(assist.playerId)
        .catch(() => null);

    if (!player) continue;

    const user =
      ensureUser(player.id);

    user.stats.assists++;

    /*
      Asist +1M€
    */

    await changePlayerValue(
      player,
      1
    );
  }

  const finalEmbed =
    new EmbedBuilder()
      .setTitle("🏁 MAÇ SONA ERDİ")
      .setDescription(
        `## ${team1.name} ${match.score1} - ${match.score2} ${team2.name}\n\n` +
        (
          winner === 0
            ? "🤝 **Maç berabere bitti.**"
            : winner === 1
            ? `🏆 **Kazanan: ${team1.name}**`
            : `🏆 **Kazanan: ${team2.name}**`
        )
      )
      .addFields(
        {
          name: "⚽ Goller",
          value:
            match.goals.length
              ? match.goals
                  .map(
                    goal =>
                      `• ${guild.members.cache.get(
                        goal.playerId
                      )?.displayName || "Oyuncu"} — ${goal.minute}'`
                  )
                  .join("\n")
              : "Gol yok."
        },
        {
          name: "🎯 Asistler",
          value:
            match.assists.length
              ? match.assists
                  .map(
                    assist =>
                      `• ${guild.members.cache.get(
                        assist.playerId
                      )?.displayName || "Oyuncu"} — ${assist.minute}'`
                  )
                  .join("\n")
              : "Asist yok."
        }
      )
      .setColor(
        winner === 0
          ? 0xf1c40f
          : 0x57f287
      )
      .setTimestamp();

  await message.edit({
    embeds: [finalEmbed]
  });

  data.matchHistory.push({
    ...match,
    finishedAt: Date.now()
  });

  delete data.activeMatches[
    match.id
  ];

  saveData();
}

async function handleStartMatch(
  message
) {
  if (!hasMatchPermission(message.member)) {
    return message.reply(
      "❌ Bu komutu yalnızca Spiker veya Yönetici kullanabilir."
    );
  }

  if (
    message.channel.id !== CHANNELS.MAC
  ) {
    return message.reply(
      `❌ Maç komutu sadece <#${CHANNELS.MAC}> kanalında kullanılabilir.`
    );
  }

  const roles =
    [...message.mentions.roles.values()];

  if (roles.length < 2) {
    return message.reply(
      "❌ Kullanım: `.maç @Takım1 @Takım2`"
    );
  }

  if (
    roles[0].id ===
    roles[1].id
  ) {
    return message.reply(
      "❌ Bir takım kendisiyle maç yapamaz."
    );
  }

  ensureTeam(roles[0]);
  ensureTeam(roles[1]);

  const existing =
    Object.values(
      data.activeMatches
    ).find(
      match =>
        match.team1 === roles[0].id ||
        match.team2 === roles[0].id ||
        match.team1 === roles[1].id ||
        match.team2 === roles[1].id
    );

  if (existing) {
    return message.reply(
      "❌ Bu takımlardan biri zaten aktif bir maçta."
    );
  }

  await startMatch(
    message.guild,
    roles[0].id,
    roles[1].id,
    message.channel
  );
}

/* =========================================================
   MAÇ İSTATİSTİKLERİ
========================================================= */

async function handleGoalKing(message) {
  const members =
    await message.guild.members.fetch();

  const list = [];

  for (const [id, user] of Object.entries(data.users)) {
    const member =
      members.get(id);

    if (!member || member.user.bot) continue;

    const goals =
      user.stats?.goals || 0;

    if (goals > 0) {
      list.push({
        member,
        goals
      });
    }
  }

  list.sort(
    (a, b) =>
      b.goals - a.goals
  );

  const text =
    list.length
      ? list
          .slice(0, 20)
          .map(
            (x, i) =>
              `**${i + 1}.** ${x.member} — ⚽ **${x.goals}**`
          )
          .join("\n")
      : "Henüz gol atan oyuncu yok.";

  return message.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("⚽ Gol Krallığı")
        .setDescription(text)
        .setColor(0xf1c40f)
    ]
  });
}

async function handleAssistKing(
  message
) {
  const members =
    await message.guild.members.fetch();

  const list = [];

  for (const [id, user] of Object.entries(data.users)) {
    const member =
      members.get(id);

    if (!member || member.user.bot) continue;

    const assists =
      user.stats?.assists || 0;

    if (assists > 0) {
      list.push({
        member,
        assists
      });
    }
  }

  list.sort(
    (a, b) =>
      b.assists - a.assists
  );

  const text =
    list.length
      ? list
          .slice(0, 20)
          .map(
            (x, i) =>
              `**${i + 1}.** ${x.member} — 🎯 **${x.assists}**`
          )
          .join("\n")
      : "Henüz asist yapan oyuncu yok.";

  return message.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("🎯 Asist Krallığı")
        .setDescription(text)
        .setColor(0x5865f2)
    ]
  });
}

/* =========================================================
   TICKET
========================================================= */

async function handleTicketPanel(
  message
) {
  if (!hasModeratorPermission(message.member)) {
    return message.reply(
      "❌ Bu komutu yalnızca Moderatör veya Yönetici kullanabilir."
    );
  }

  const button =
    new ButtonBuilder()
      .setCustomId("ticket_create")
      .setLabel("Destek Talebi Oluştur")
      .setEmoji("🎫")
      .setStyle(ButtonStyle.Primary);

  return message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("🎫 Axera League Destek")
        .setDescription(
          "Destek almak için aşağıdaki butona basarak özel bir ticket oluşturabilirsiniz."
        )
        .setColor(0x5865f2)
    ],
    components: [
      new ActionRowBuilder().addComponents(
        button
      )
    ]
  });
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
      ticket =>
        ticket.userId ===
        interaction.user.id &&
        ticket.open
    );

  if (existing) {
    const channel =
      guild.channels.cache.get(
        existing.channelId
      );

    if (channel) {
      return interaction.reply({
        content:
          `❌ Zaten açık bir ticketın var: ${channel}`,
        ephemeral: true
      });
    }
  }

  const channel =
    await guild.channels.create({
      name:
        `ticket-${interaction.user.username}`
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "")
          .slice(0, 80),
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [
            PermissionsBitField.Flags.ViewChannel
          ]
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        },
        {
          id: ROLES.MODERATOR,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        },
        {
          id: ROLES.YONETICI,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        }
      ]
    });

  data.tickets[channel.id] = {
    channelId: channel.id,
    userId: interaction.user.id,
    open: true,
    lastMessage: Date.now(),
    createdAt: Date.now()
  };

  saveData();

  const closeButton =
    new ButtonBuilder()
      .setCustomId("ticket_close")
      .setLabel("Ticket Kapat")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger);

  await channel.send({
    content:
      `${interaction.user} <@&${ROLES.MODERATOR}>`,
    embeds: [
      new EmbedBuilder()
        .setTitle("🎫 Destek Talebi")
        .setDescription(
          "Yetkililer en kısa sürede sizinle ilgilenecektir.\n\n" +
          "Ticketı kapatmak için **🔒 Ticket Kapat** butonunu kullanabilirsiniz."
        )
        .setColor(0x5865f2)
    ],
    components: [
      new ActionRowBuilder().addComponents(
        closeButton
      )
    ]
  });

  return interaction.reply({
    content:
      `✅ Ticket oluşturuldu: ${channel}`,
    ephemeral: true
  });
}

async function closeTicket(
  interaction
) {
  const channel =
    interaction.channel;

  const ticket =
    data.tickets[channel.id];

  if (!ticket) {
    return interaction.reply({
      content:
        "❌ Bu kanal bir ticket değil.",
      ephemeral: true
    });
  }

  const isOwner =
    ticket.userId ===
    interaction.user.id;

  if (
    !isOwner &&
    !hasModeratorPermission(
      interaction.member
    )
  ) {
    return interaction.reply({
      content:
        "❌ Bu ticketı kapatma yetkin yok.",
      ephemeral: true
    });
  }

  await interaction.reply(
    "🔒 Ticket 3 saniye içinde kapatılıyor..."
  );

  ticket.open = false;

  saveData();

  setTimeout(() => {
    channel.delete(
      "Axera League ticket kapatma"
    ).catch(() => {});
  }, 3000);
}

/* =========================================================
   MODERASYON
========================================================= */

async function handleClear(
  message,
  args
) {
  if (!isAdmin(message.member)) {
    return message.reply(
      "❌ Bu komutu yalnızca Yönetici kullanabilir."
    );
  }

  let amount =
    parseInt(args[0], 10);

  if (
    !Number.isInteger(amount) ||
    amount < 1
  ) {
    return message.reply(
      "❌ Kullanım: `.sil 20`"
    );
  }

  if (amount > 100) {
    amount = 100;
  }

  const deleted =
    await message.channel.bulkDelete(
      amount,
      true
    ).catch(() => null);

  if (!deleted) {
    return message.reply(
      "❌ Mesajlar silinemedi."
    );
  }

  const reply =
    await message.channel.send(
      `🗑️ **${deleted.size}** mesaj silindi.`
    );

  setTimeout(
    () =>
      reply.delete().catch(() => {}),
    3000
  );
}

async function handleKick(
  message
) {
  if (!hasModeratorPermission(message.member)) {
    return message.reply(
      "❌ Yetkin yok."
    );
  }

  const target =
    getMentionedMember(message);

  if (!target) {
    return message.reply(
      "❌ Kullanım: `.kick @Oyuncu`"
    );
  }

  if (
    target.id ===
    message.author.id
  ) {
    return message.reply(
      "❌ Kendini atamazsın."
    );
  }

  await target.kick(
    "Axera League moderasyon"
  );

  return message.reply(
    `👢 ${target.user.tag} sunucudan atıldı.`
  );
}

async function handleBan(
  message
) {
  if (!hasModeratorPermission(message.member)) {
    return message.reply(
      "❌ Yetkin yok."
    );
  }

  const target =
    getMentionedMember(message);

  if (!target) {
    return message.reply(
      "❌ Kullanım: `.ban @Oyuncu`"
    );
  }

  if (
    target.id ===
    message.author.id
  ) {
    return message.reply(
      "❌ Kendini banlayamazsın."
    );
  }

  await target.ban({
    reason:
      "Axera League moderasyon"
  });

  return message.reply(
    `🔨 ${target.user.tag} banlandı.`
  );
}

async function handleMute(
  message
) {
  if (!hasModeratorPermission(message.member)) {
    return message.reply(
      "❌ Yetkin yok."
    );
  }

  const target =
    getMentionedMember(message);

  if (!target) {
    return message.reply(
      "❌ Kullanım: `.mute @Oyuncu`"
    );
  }

  await target.timeout(
    10 * 60 * 1000,
    "Axera League moderasyon"
  );

  return message.reply(
    `🔇 ${target.user.tag} 10 dakika susturuldu.`
  );
}

async function handleUnmute(
  message
) {
  if (!hasModeratorPermission(message.member)) {
    return message.reply(
      "❌ Yetkin yok."
    );
  }

  const target =
    getMentionedMember(message);

  if (!target) {
    return message.reply(
      "❌ Kullanım: `.unmute @Oyuncu`"
    );
  }

  await target.timeout(
    null,
    "Axera League mute kaldırma"
  );

  return message.reply(
    `🔊 ${target.user.tag} susturması kaldırıldı.`
  );
}

/* =========================================================
   EMBED
========================================================= */

async function handleEmbed(
  message
) {
  if (!isAdmin(message.member)) {
    return message.reply(
      "❌ Bu komutu yalnızca Yönetici kullanabilir."
    );
  }

  const content =
    message.content
      .slice(
        PREFIX.length + 5
      )
      .trim();

  const parts =
    content.split("|");

  const title =
    parts.shift()?.trim();

  const description =
    parts.join("|").trim();

  if (!title || !description) {
    return message.reply(
      "❌ Kullanım: `.embed Başlık | Açıklama`"
    );
  }

  await message.delete()
    .catch(() => {});

  return message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(0x5865f2)
        .setTimestamp()
    ]
  });
}

/* =========================================================
   DM
========================================================= */

async function handleDM(
  message,
  args
) {
  if (!isAdmin(message.member)) {
    return message.reply(
      "❌ Bu komutu yalnızca Yönetici kullanabilir."
    );
  }

  const target =
    getMentionedMember(message);

  if (!target) {
    return message.reply(
      "❌ Kullanım: `.dm @Oyuncu Mesaj`"
    );
  }

  const mention =
    message.mentions.users.first();

  const text =
    message.content
      .replace(
        new RegExp(
          `<@!?${mention.id}>`
        ),
        ""
      )
      .replace(
        /^\s*/,
        ""
      )
      .trim();

  if (!text) {
    return message.reply(
      "❌ Gönderilecek mesajı yazmalısın."
    );
  }

  try {
    await target.send(text);

    return message.reply(
      `✅ ${target} kişisine DM gönderildi.`
    );
  } catch {
    return message.reply(
      "❌ Oyuncuya DM gönderilemedi."
    );
  }
}

/* =========================================================
   YARDIM
========================================================= */

async function handleHelp(message) {
  const embed =
    new EmbedBuilder()
      .setTitle("📚 Axera League Komutları")
      .setColor(0x5865f2)
      .addFields(
        {
          name: "👤 Kayıt",
          value:
            "`.k @Oyuncu TakmaAdı`\n" +
            "`.kayıtsızver @Oyuncu`\n" +
            "`.ara OyuncuAdı`"
        },
        {
          name: "💰 Değer",
          value:
            "`.dver @Oyuncu 5M€`\n" +
            "`.dsil @Oyuncu 5M€`"
        },
        {
          name: "🏋️ Antrenman",
          value:
            "`.ant`\n`.antrenman`"
        },
        {
          name: "⚽ Penaltı",
          value:
            "`.pen`\n`.penaltı`\n`.penalti`"
        },
        {
          name: "🐦 Tweet",
          value:
            "`.tweet Mesaj`"
        },
        {
          name: "🏟️ Maç",
          value:
            "`.maç @Takım1 @Takım2`"
        },
        {
          name: "👕 Takım / Kadro",
          value:
            "`.takımekle @Takım`\n" +
            "`.takımkaldır @Takım`\n" +
            "`.takımdeğer @Takım 850M`\n" +
            "`.puanekle @Takım 3`\n" +
            "`.kadroekle @Takım @Oyuncu Pozisyon`\n" +
            "`.kadrocikar @Takım @Oyuncu`\n" +
            "`.kadro @Takım`\n" +
            "`.formasyon @Takım`"
        },
        {
          name: "🏆 Lig / Fikstür",
          value:
            "`.puan`\n" +
            "`.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`\n" +
            "`.fikstür`\n" +
            "`.fiksturcikar @Takım1 @Takım2`"
        },
        {
          name: "🏆 Kupa / Müze",
          value:
            "`.kupaekle @Takım KupaAdı`\n" +
            "`.kupasil @Takım KupaAdı`\n" +
            "`.müze @Takım`"
        },
        {
          name: "📊 İstatistik",
          value:
            "`.golkrali`\n" +
            "`.asistkral`"
        },
        {
          name: "🎫 Ticket",
          value:
            "`.ticketpanel`"
        },
        {
          name: "🛡️ Moderasyon",
          value:
            "`.sil miktar`\n" +
            "`.kick @Oyuncu`\n" +
            "`.ban @Oyuncu`\n" +
            "`.mute @Oyuncu`\n" +
            "`.unmute @Oyuncu`\n" +
            "`.embed Başlık | Açıklama`"
        },
        {
          name: "📩 Yönetici",
          value:
            "`.dm @Oyuncu Mesaj`"
        }
      )
      .setFooter({
        text:
          "Kayıtsız üyeler de genel sistemleri kullanabilir."
      });

  return message.reply({
    embeds: [embed]
  });
}

/* =========================================================
   BOT DURUMU
========================================================= */

async function updateStatusChannel(guild) {
  const channel =
    guild.channels.cache.get(
      CHANNELS.BOT_DURUM
    );

  if (!channel) return;

  const activeMatches =
    Object.keys(
      data.activeMatches
    ).length;

  const teams =
    Object.keys(
      data.teams
    ).length;

  const message =
    `🤖 **Axera League Bot Durumu**\n\n` +
    `🟢 Bot: **Aktif**\n` +
    `🏟️ Takım: **${teams}**\n` +
    `⚽ Aktif Maç: **${activeMatches}**\n` +
    `🕐 Son güncelleme: <t:${Math.floor(Date.now() / 1000)}:R>`;

  const messages =
    await channel.messages
      .fetch({ limit: 10 })
      .catch(() => null);

  if (!messages) return;

  const botMessage =
    messages.find(
      msg =>
        msg.author.id ===
        client.user.id
    );

  if (botMessage) {
    await botMessage.edit(
      message
    ).catch(() => {});
  } else {
    await channel.send(
      message
    ).catch(() => {});
  }
}

/* =========================================================
   ÜYE GİRİŞİ
========================================================= */

client.on(
  "guildMemberAdd",
  async member => {
    try {
      if (member.user.bot) return;

      ensureUser(member.id);

      /*
        Yeni üyeye Kayıtsız rolü.
      */

      await member.roles.add(
        ROLES.KAYITSIZ
      ).catch(() => {});

      const channel =
        member.guild.channels.cache.get(
          CHANNELS.KAYIT
        );

      if (!channel) return;

      const embed =
        new EmbedBuilder()
          .setTitle("👋 Yeni Oyuncu Geldi!")
          .setDescription(
            `${member} sunucuya katıldı.\n\n` +
            `Kayıt işlemi için <@&${ROLES.KAYIT_YETKILI}> ilgilenebilir.`
          )
          .setColor(0x5865f2)
          .setThumbnail(
            member.user.displayAvatarURL()
          )
          .setTimestamp();

      await channel.send({
        content:
          `<@&${ROLES.KAYIT_YETKILI}>`,
        embeds: [embed]
      });
    } catch (error) {
      console.error(
        "guildMemberAdd hatası:",
        error
      );
    }
  }
);

/* =========================================================
   MESAJ SİSTEMİ
========================================================= */

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

      /*
        Ticket aktivite takibi.
      */

      const ticket =
        data.tickets[
          message.channel.id
        ];

      if (
        ticket &&
        ticket.open
      ) {
        ticket.lastMessage =
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

      const raw =
        message.content
          .slice(PREFIX.length)
          .trim();

      if (!raw) return;

      const parts =
        raw.split(/\s+/);

      const command =
        parts.shift()
          .toLowerCase();

      const args = parts;

      /* =========================================
         KAYIT
      ========================================= */

      if (command === "k") {
        return handleRegistrationCommand(
          message,
          args
        );
      }

      if (
        command === "kayıtsızver" ||
        command === "kayitsizver"
      ) {
        return handleKayitsizVer(
          message,
          args
        );
      }

      if (
        command === "ara"
      ) {
        return handleAra(
          message,
          args
        );
      }

      /* =========================================
         DEĞER
      ========================================= */

      if (
        command === "dver" ||
        command === "dsil"
      ) {
        if (
          message.channel.id !==
          CHANNELS.DEGER
        ) {
          return message.reply(
            `❌ Bu komut sadece <#${CHANNELS.DEGER}> kanalında kullanılabilir.`
          );
        }

        if (
          !hasValuePermission(
            message.member
          )
        ) {
          return message.reply(
            "❌ Bu komutu yalnızca Değer Yetkilisi veya Yönetici kullanabilir."
          );
        }

        const target =
          getMentionedMember(
            message
          );

        if (!target) {
          return message.reply(
            `❌ Kullanım: \`.${command} @Oyuncu 5M€\``
          );
        }

        const amount =
          parseMillions(
            args[1] ||
            args[0]
          );

        if (amount === null) {
          return message.reply(
            "❌ Sadece **M€** formatı kullanılabilir. Örnek: `5M€` veya `5`.\n`B` ve `K` kabul edilmez."
          );
        }

        const change =
          command === "dver"
            ? amount
            : -amount;

        const result =
          await changePlayerValue(
            target,
            change
          );

        if (!result.ok) {
          return message.reply(
            result.message
          );
        }

        return message.reply(
          `✅ ${target} değeri **${formatMillions(result.oldValue)}M€ → ${formatMillions(result.newValue)}M€** olarak değiştirildi.`
        );
      }

      /* =========================================
         ANTRENMAN
      ========================================= */

      if (
        command === "ant" ||
        command === "antrenman"
      ) {
        if (
          message.channel.id !==
          CHANNELS.ANTRENMAN
        ) {
          return message.reply(
            `❌ Bu komut sadece <#${CHANNELS.ANTRENMAN}> kanalında kullanılabilir.`
          );
        }

        return handleTraining(
          message
        );
      }

      /* =========================================
         PENALTI
      ========================================= */

      if (
        command === "pen" ||
        command === "penaltı" ||
        command === "penalti"
      ) {
        if (
          message.channel.id !==
          CHANNELS.PENALTI
        ) {
          return message.reply(
            `❌ Bu komut sadece <#${CHANNELS.PENALTI}> kanalında kullanılabilir.`
          );
        }

        return handlePenalty(
          message
        );
      }

      /* =========================================
         TWEET
      ========================================= */

      if (
        command === "tweet"
      ) {
        return handleTweet(
          message,
          args
        );
      }

      /* =========================================
         TAKIM
      ========================================= */

      if (
        command === "takımekle" ||
        command === "takimekle"
      ) {
        return handleTeamAdd(
          message
        );
      }

      if (
        command === "takımkaldır" ||
        command === "takimkaldir"
      ) {
        return handleTeamRemove(
          message
        );
      }

      if (
        command === "puanekle"
      ) {
        return handleTeamPoints(
          message,
          args
        );
      }

      if (
        command === "takımdeğer" ||
        command === "takimdeger"
      ) {
        return handleTeamValue(
          message,
          args
        );
      }

      /* =========================================
         KADRO
      ========================================= */

      if (
        command === "kadroekle"
      ) {
        return handleSquadAdd(
          message,
          args
        );
      }

      if (
        command === "kadrocikar"
      ) {
        return handleSquadRemove(
          message
        );
      }

      if (
        command === "kadro"
      ) {
        return handleSquad(
          message
        );
      }

      /* =========================================
         FORMASYON
      ========================================= */

      if (
        command === "formasyon"
      ) {
        return handleFormation(
          message
        );
      }

      /* =========================================
         PUAN
      ========================================= */

      if (
        command === "puan"
      ) {
        return handleStandings(
          message
        );
      }

      /* =========================================
         FİKSTÜR
      ========================================= */

      if (
        command === "fiksturekle"
      ) {
        return handleFixtureAdd(
          message,
          args
        );
      }

      if (
        command === "fikstür" ||
        command === "fikstur"
      ) {
        return handleFixtures(
          message
        );
      }

      if (
        command === "fiksturcikar"
      ) {
        return handleFixtureRemove(
          message
        );
      }

      /* =========================================
         MAÇ
      ========================================= */

      if (
        command === "maç" ||
        command === "mac"
      ) {
        return handleStartMatch(
          message
        );
      }

      /* =========================================
         İSTATİSTİK
      ========================================= */

      if (
        command === "golkrali"
      ) {
        return handleGoalKing(
          message
        );
      }

      if (
        command === "asistkral"
      ) {
        return handleAssistKing(
          message
        );
      }

      /* =========================================
         KUPA
      ========================================= */

      if (
        command === "kupaekle"
      ) {
        return handleCupAdd(
          message
        );
      }

      if (
        command === "kupasil"
      ) {
        return handleCupRemove(
          message
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

      /* =========================================
         TICKET
      ========================================= */

      if (
        command === "ticketpanel"
      ) {
        return handleTicketPanel(
          message
        );
      }

      /* =========================================
         MODERASYON
      ========================================= */

      if (
        command === "sil"
      ) {
        return handleClear(
          message,
          args
        );
      }

      if (
        command === "kick"
      ) {
        return handleKick(
          message
        );
      }

      if (
        command === "ban"
      ) {
        return handleBan(
          message
        );
      }

      if (
        command === "mute"
      ) {
        return handleMute(
          message
        );
      }

      if (
        command === "unmute"
      ) {
        return handleUnmute(
          message
        );
      }

      if (
        command === "embed"
      ) {
        return handleEmbed(
          message
        );
      }

      /* =========================================
         DM
      ========================================= */

      if (
        command === "dm"
      ) {
        return handleDM(
          message,
          args
        );
      }

      /* =========================================
         YARDIM
      ========================================= */

      if (
        command === "yardım" ||
        command === "yardim"
      ) {
        return handleHelp(
          message
        );
      }
    } catch (error) {
      console.error(
        "messageCreate hatası:",
        error
      );
    }
  }
);

/* =========================================================
   BUTONLAR / SELECT MENU
========================================================= */

client.on(
  "interactionCreate",
  async interaction => {
    try {
      if (
        interaction.isButton()
      ) {
        if (
          interaction.customId.startsWith(
            "register_"
          )
        ) {
          const type =
            interaction.customId
              .split("_")[1];

          return completeRegistration(
            interaction,
            type
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
          return closeTicket(
            interaction
          );
        }
      }

      if (
        interaction.isStringSelectMenu()
      ) {
        if (
          interaction.customId.startsWith(
            "formation_"
          )
        ) {
          if (
            !hasMatchPermission(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Bu seçimi yalnızca Spiker veya Yönetici yapabilir.",
              ephemeral: true
            });
          }

          const teamId =
            interaction.customId
              .replace(
                "formation_",
                ""
              );

          const formation =
            interaction.values[0];

          if (
            !FORMATIONS.includes(
              formation
            )
          ) {
            return interaction.reply({
              content:
                "❌ Geçersiz formasyon.",
              ephemeral: true
            });
          }

          data.formations[teamId] =
            formation;

          saveData();

          const role =
            interaction.guild.roles.cache.get(
              teamId
            );

          return interaction.update({
            content:
              `📐 **${role?.name || "Takım"}** formasyonu **${formation}** olarak ayarlandı.`,
            components: []
          });
        }
      }
    } catch (error) {
      console.error(
        "interactionCreate hatası:",
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
   TICKET OTOMATİK KAPATMA
   60 DAKİKA MESAJ YOKSA
========================================================= */

setInterval(
  async () => {
    try {
      const now =
        Date.now();

      const timeout =
        60 * 60 * 1000;

      for (
        const [channelId, ticket]
        of Object.entries(
          data.tickets
        )
      ) {
        if (!ticket.open) continue;

        if (
          now - ticket.lastMessage <
          timeout
        ) {
          continue;
        }

        const channel =
          client.channels.cache.get(
            channelId
          );

        if (channel) {
          await channel.delete(
            "60 dakika aktivite yok"
          ).catch(() => {});
        }

        ticket.open = false;
      }

      saveData();
    } catch (error) {
      console.error(
        "Ticket otomatik kapatma hatası:",
        error
      );
    }
  },
  60 * 1000
);

/* =========================================================
   FİKSTÜR ZAMANLAYICI
========================================================= */

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
          fixture.started ||
          fixture.completed
        ) {
          continue;
        }

        if (
          fixture.timestamp > now
        ) {
          continue;
        }

        const guild =
          client.guilds.cache.first();

        if (!guild) continue;

        const channel =
          guild.channels.cache.get(
            CHANNELS.MAC
          );

        if (!channel) continue;

        fixture.started = true;

        saveData();

        await startMatch(
          guild,
          fixture.team1,
          fixture.team2,
          channel
        );

        /*
          Maç tamamlanınca fikstürü completed
          yapmak için kısa takip döngüsü.
        */

        const tracker =
          setInterval(() => {
            const active =
              Object.values(
                data.activeMatches
              ).some(
                match =>
                  match.team1 ===
                    fixture.team1 &&
                  match.team2 ===
                    fixture.team2
              );

            if (!active) {
              fixture.completed =
                true;

              clearInterval(
                tracker
              );

              saveData();
            }
          }, 5000);
      }
    } catch (error) {
      console.error(
        "Fikstür zamanlayıcı hatası:",
        error
      );
    }
  },
  1000
);

/* =========================================================
   BOT DURUMU
========================================================= */

setInterval(
  async () => {
    for (
      const guild of client.guilds.cache.values()
    ) {
      await updateStatusChannel(
        guild
      );
    }
  },
  30 * 60 * 1000
);

/* =========================================================
   READY
========================================================= */

client.once(
  "ready",
  async () => {
    console.log(
      `✅ Axera League aktif: ${client.user.tag}`
    );

    client.user.setPresence({
      activities: [
        {
          name:
            "Axera League | Futbol RP",
          type: 0
        }
      ],
      status: "online"
    });

    for (
      const guild
      of client.guilds.cache.values()
    ) {
      await updateStatusChannel(
        guild
      );
    }
  }
);

/* =========================================================
   TOKEN
========================================================= */

if (!process.env.TOKEN) {
  console.error(
    "❌ TOKEN bulunamadı! Railway Variables kısmına TOKEN ekleyin."
  );

  process.exit(1);
}

client.login(
  process.env.TOKEN
);
