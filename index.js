const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ======================================================
// AXERA LEAGUE FUTBOL RP BOTU
// ======================================================
// 📋 KAYIT
// 🏋️ ANTRENMAN
// 🥅 PENALTI
// 💰 DEĞER
// 🐦 TWEET
// 🔎 FUTBOLCU ARAMA
// ======================================================


// ======================================================
// TOKEN
// ======================================================

const TOKEN = process.env.TOKEN || "BURAYA_BOT_TOKENINI_YAZ";


// ======================================================
// ROLLER
// ======================================================

const ROLES = {
  FUTBOLCU: "1534457228986421278",
  KALECI: "1534492034243498195",
  KAYITSIZ: "1534457560134844517",
  TEKNIK_DIREKTOR: "1534456648930693120",

  KAYIT_YETKILISI: "1534456315366342716",
  DEGER_YETKILISI: "1534456192913375382"
};


// ======================================================
// KANALLAR
// ======================================================

const CHANNELS = {
  KAYIT: "1534460177884123276",
  SOHBET: "1534469475917758586",
  ANTRENMAN: "1534474070798762197",
  PENALTI: "1534474327812997192"
};


// ======================================================
// ANTRENMAN AYARLARI
// ======================================================

const TRAINING_MAX = 5;
const TRAINING_REWARD = 5;


// ======================================================
// PENALTI AYARLARI
// ======================================================

const PENALTY_REWARD = 5;


// ======================================================
// DISCORD CLIENT
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
// DATA.JSON
// ======================================================

const DATA_FILE = path.join(__dirname, "data.json");

let data = {
  users: {},
  registrations: {}
};


function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      saveData();
      return;
    }

    const raw = fs.readFileSync(DATA_FILE, "utf8");

    if (!raw.trim()) {
      saveData();
      return;
    }

    const parsed = JSON.parse(raw);

    data = {
      users: parsed.users || {},
      registrations: parsed.registrations || {}
    };

  } catch (error) {
    console.error("data.json okunamadı:", error);

    data = {
      users: {},
      registrations: {}
    };

    saveData();
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
// YARDIMCI FONKSİYONLAR
// ======================================================

function hasRole(member, roleId) {
  if (!member || !member.roles) return false;

  return member.roles.cache.has(roleId);
}


function isKayıtYetkilisi(member) {
  return hasRole(member, ROLES.KAYIT_YETKILISI);
}


function isDeğerYetkilisi(member) {
  return hasRole(member, ROLES.DEGER_YETKILISI);
}


function getUserData(userId) {
  if (!data.users[userId]) {
    data.users[userId] = {
      training: 0
    };
  }

  if (
    typeof data.users[userId].training !== "number" ||
    !Number.isFinite(data.users[userId].training)
  ) {
    data.users[userId].training = 0;
  }

  return data.users[userId];
}


// ======================================================
// DEĞER OKUMA
// ======================================================

function getValueFromNickname(nickname) {
  if (!nickname) return null;

  const match = nickname.match(/(\d+(?:\.\d+)?)M€$/);

  if (!match) return null;

  return Number(match[1]);
}


// ======================================================
// DEĞER DEĞİŞTİRME
// ======================================================

async function changeValue(member, amount) {

  if (!member) {
    return {
      success: false,
      message: "❌ Oyuncu bulunamadı."
    };
  }

  const nickname = member.nickname;

  if (!nickname) {
    return {
      success: false,
      message: "❌ Oyuncunun takma adı bulunamadı."
    };
  }

  const oldValue = getValueFromNickname(nickname);

  if (oldValue === null) {
    return {
      success: false,
      message:
        "❌ Oyuncunun takma adı `1M€` gibi bir değerle bitmelidir."
    };
  }

  let newValue = oldValue + amount;

  if (newValue < 0) {
    newValue = 0;
  }

  const newNickname = nickname.replace(
    /(\d+(?:\.\d+)?)M€$/,
    `${newValue}M€`
  );

  if (newNickname.length > 32) {
    return {
      success: false,
      message:
        "❌ Yeni takma ad Discord'un 32 karakter sınırını aşıyor."
    };
  }

  try {

    await member.setNickname(newNickname);

    return {
      success: true,
      oldValue,
      newValue,
      nickname: newNickname
    };

  } catch (error) {

    console.error("Değer değiştirme hatası:", error);

    return {
      success: false,
      message:
        "❌ Takma ad değiştirilemedi. Botun **Takma Adları Yönet** yetkisini ve rol sırasını kontrol et."
    };
  }
}


// ======================================================
// ARAMA SİSTEMİ
// ======================================================
// Levenshtein algoritması ile aranan isme en yakın
// sunucu takma adını bulur.
// Yalnızca EN YAKIN sonuç gösterilir.
// ======================================================

function normalizeText(text) {

  return text
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ\s]/gi, "")
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


function similarityScore(search, nickname) {

  const cleanSearch = normalizeText(search);

  const cleanNickname = normalizeText(nickname);

  if (!cleanSearch || !cleanNickname) {
    return 0;
  }

  // Tam eşleşme
  if (cleanSearch === cleanNickname) {
    return 1000;
  }

  // Başlangıç eşleşmesi
  if (cleanNickname.startsWith(cleanSearch)) {
    return 900 - Math.max(
      0,
      cleanNickname.length - cleanSearch.length
    );
  }

  // İçinde geçiyorsa
  if (cleanNickname.includes(cleanSearch)) {
    return 800 - Math.max(
      0,
      cleanNickname.length - cleanSearch.length
    );
  }

  // İsmin parçalarıyla karşılaştır
  const searchWords = cleanSearch.split(" ");
  const nickWords = cleanNickname.split(" ");

  let wordScore = 0;

  for (const word of searchWords) {

    let best = 0;

    for (const nickWord of nickWords) {

      if (
        nickWord === word
      ) {
        best = Math.max(best, 100);
      } else if (
        nickWord.startsWith(word)
      ) {
        best = Math.max(best, 80);
      } else if (
        nickWord.includes(word)
      ) {
        best = Math.max(best, 60);
      }
    }

    wordScore += best;
  }

  // Levenshtein
  const maxLength =
    Math.max(
      cleanSearch.length,
      cleanNickname.length
    );

  const distance =
    levenshtein(
      cleanSearch,
      cleanNickname
    );

  const similarity =
    maxLength === 0
      ? 0
      : 1 - distance / maxLength;

  return (
    wordScore +
    similarity * 300
  );
}


async function findClosestPlayer(guild, search) {

  await guild.members.fetch();

  const results = [];

  for (const member of guild.members.cache.values()) {

    if (member.user.bot) continue;

    if (!member.nickname) continue;

    const score =
      similarityScore(
        search,
        member.nickname
      );

    results.push({
      member,
      score
    });
  }

  results.sort((a, b) => b.score - a.score);

  if (!results.length) {
    return null;
  }

  const best = results[0];

  // Çok alakasız sonuçları boş kabul et
  const normalizedSearch =
    normalizeText(search);

  const normalizedNickname =
    normalizeText(best.member.nickname);

  const distance =
    levenshtein(
      normalizedSearch,
      normalizedNickname
    );

  const maxLength =
    Math.max(
      normalizedSearch.length,
      normalizedNickname.length
    );

  const ratio =
    maxLength === 0
      ? 0
      : 1 - distance / maxLength;

  const contains =
    normalizedNickname.includes(
      normalizedSearch
    );

  const starts =
    normalizedNickname.startsWith(
      normalizedSearch
    );

  if (
    !contains &&
    !starts &&
    ratio < 0.35 &&
    best.score < 100
  ) {
    return null;
  }

  return best.member;
}


// ======================================================
// BOT HAZIR
// ======================================================

client.once("ready", () => {

  console.log("======================================");
  console.log("⚽ AXERA LEAGUE BOT AKTİF");
  console.log(`🤖 Bot: ${client.user.tag}`);
  console.log(`🌐 Sunucu: ${client.guilds.cache.size}`);
  console.log("======================================");

  client.user.setPresence({
    activities: [
      {
        name: "Axera League ⚽",
        type: 0
      }
    ],
    status: "online"
  });

});


// ======================================================
// YENİ ÜYE
// ======================================================

client.on("guildMemberAdd", async (member) => {

  try {

    const channel =
      await member.guild.channels
        .fetch(CHANNELS.KAYIT)
        .catch(() => null);

    if (!channel) {
      console.log("❌ Kayıt kanalı bulunamadı.");
      return;
    }

    await channel.send(
      `👋 ${member} hoşgeldin sunucumuza!\n\n` +
      `📋 <@&${ROLES.KAYIT_YETKILISI}> seninle ilgilenecektir.`
    );

  } catch (error) {

    console.error(
      "Yeni üye mesajı hatası:",
      error
    );

  }

});


// ======================================================
// KAYIT BUTONLARI
// ======================================================

client.on("interactionCreate", async (interaction) => {

  if (!interaction.isButton()) return;

  if (
    !interaction.customId.startsWith("kayit_")
  ) {
    return;
  }


  // SADECE KAYIT YETKİLİSİ
  if (
    !isKayıtYetkilisi(interaction.member)
  ) {

    return interaction.reply({
      content:
        "❌ Bu butonları yalnızca **Kayıt Yetkilisi** kullanabilir.",
      ephemeral: true
    });

  }


  const parts =
    interaction.customId.split("_");

  if (parts.length < 3) {

    return interaction.reply({
      content: "❌ Geçersiz kayıt butonu.",
      ephemeral: true
    });

  }


  const type = parts[1];
  const playerId = parts[2];


  let player;

  try {

    player =
      await interaction.guild.members.fetch(
        playerId
      );

  } catch {

    player = null;

  }


  if (!player) {

    return interaction.reply({
      content:
        "❌ Oyuncu artık sunucuda bulunmuyor.",
      ephemeral: true
    });

  }


  let selectedRole;
  let roleName;
  let emoji;


  if (type === "futbolcu") {

    selectedRole = ROLES.FUTBOLCU;
    roleName = "Futbolcu";
    emoji = "⚽";

  } else if (type === "kaleci") {

    selectedRole = ROLES.KALECI;
    roleName = "Kaleci";
    emoji = "🧤";

  } else if (type === "td") {

    selectedRole = ROLES.TEKNIK_DIREKTOR;
    roleName = "Teknik Direktör";
    emoji = "📋";

  } else {

    return interaction.reply({
      content:
        "❌ Geçersiz kayıt türü.",
      ephemeral: true
    });

  }


  try {

    const registrationRoles = [
      ROLES.FUTBOLCU,
      ROLES.KALECI,
      ROLES.TEKNIK_DIREKTOR
    ];


    // Eski kayıt rollerini kaldır
    for (const roleId of registrationRoles) {

      if (
        player.roles.cache.has(roleId)
      ) {

        await player.roles.remove(roleId);

      }
    }


    // Kayıtsız rolünü kaldır
    if (
      player.roles.cache.has(ROLES.KAYITSIZ)
    ) {

      await player.roles.remove(
        ROLES.KAYITSIZ
      );

    }


    // Yeni rolü ver
    await player.roles.add(
      selectedRole
    );


    // Data
    data.registrations[player.id] = {
      type: roleName,
      registeredBy: interaction.user.id,
      registeredAt:
        new Date().toISOString()
    };

    saveData();


    // Butonları kapat
    const disabledRow =
      new ActionRowBuilder()
        .addComponents(

          new ButtonBuilder()
            .setCustomId(
              `kayit_futbolcu_${player.id}`
            )
            .setLabel("Futbolcu")
            .setEmoji("⚽")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),

          new ButtonBuilder()
            .setCustomId(
              `kayit_kaleci_${player.id}`
            )
            .setLabel("Kaleci")
            .setEmoji("🧤")
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),

          new ButtonBuilder()
            .setCustomId(
              `kayit_td_${player.id}`
            )
            .setLabel("Teknik Direktör")
            .setEmoji("📋")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)

        );


    await interaction.update({
      content:
        `✅ ${player} başarıyla **${roleName}** olarak kaydedildi.\n` +
        `👤 Kayıt Yetkilisi: ${interaction.user}`,

      components: [disabledRow]
    });


    // Sohbet kanalına bilgi
    const sohbet =
      await interaction.guild.channels
        .fetch(CHANNELS.SOHBET)
        .catch(() => null);


    if (sohbet) {

      const embed =
        new EmbedBuilder()
          .setTitle("📋 Yeni Kayıt")
          .setDescription(
            `${emoji} ${player} sunucuya **${roleName}** olarak kaydedildi.`
          )
          .addFields(
            {
              name: "👤 Oyuncu",
              value: `${player}`,
              inline: true
            },
            {
              name: "📋 Kayıt Yetkilisi",
              value: `${interaction.user}`,
              inline: true
            }
          )
          .setTimestamp()
          .setFooter({
            text: "Axera League • Kayıt Sistemi"
          });


      await sohbet.send({
        embeds: [embed]
      });

    }

  } catch (error) {

    console.error(
      "Kayıt butonu hatası:",
      error
    );


    if (
      !interaction.replied &&
      !interaction.deferred
    ) {

      await interaction.reply({
        content:
          "❌ Kayıt sırasında hata oluştu. Botun **Rolleri Yönet** yetkisini ve rol sırasını kontrol et.",
        ephemeral: true
      });

    }

  }

});


// ======================================================
// MESAJ KOMUTLARI
// ======================================================

client.on("messageCreate", async (message) => {

  if (message.author.bot) return;
  if (!message.guild) return;

  const content =
    message.content.trim();

  if (!content.startsWith(".")) return;


  const args =
    content.split(/\s+/);

  const command =
    args[0].toLocaleLowerCase("tr-TR");


  // ====================================================
  // .K
  // ====================================================

  if (command === ".k") {

    if (
      !isKayıtYetkilisi(message.member)
    ) {

      return message.reply(
        "❌ Bu komutu yalnızca **Kayıt Yetkilisi** kullanabilir."
      );

    }


    if (
      message.channel.id !== CHANNELS.KAYIT
    ) {

      return message.reply(
        `❌ Bu komut yalnızca <#${CHANNELS.KAYIT}> kanalında kullanılabilir.`
      );

    }


    const target =
      message.mentions.members.first();


    if (!target) {

      return message.reply(
        "❌ Kullanım: `.k @oyuncu TakmaAdı`"
      );

    }


    const nickname =
      args.slice(2).join(" ").trim();


    if (!nickname) {

      return message.reply(
        "❌ Takma ad yazmalısın.\n\n" +
        "Örnek:\n" +
        "`.k @Oyuncu W.Sneijder | 🇳🇱 | SNT | 1M€`"
      );

    }


    if (nickname.length > 32) {

      return message.reply(
        `❌ Takma ad **${nickname.length} karakter**. Discord maksimum 32 karaktere izin verir.`
      );

    }


    try {

      // Takma adı TAM OLARAK yazıldığı şekilde ayarla
      await target.setNickname(
        nickname
      );


      const row =
        new ActionRowBuilder()
          .addComponents(

            new ButtonBuilder()
              .setCustomId(
                `kayit_futbolcu_${target.id}`
              )
              .setLabel("Futbolcu")
              .setEmoji("⚽")
              .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
              .setCustomId(
                `kayit_kaleci_${target.id}`
              )
              .setLabel("Kaleci")
              .setEmoji("🧤")
              .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
              .setCustomId(
                `kayit_td_${target.id}`
              )
              .setLabel("Teknik Direktör")
              .setEmoji("📋")
              .setStyle(ButtonStyle.Secondary)

          );


      const embed =
        new EmbedBuilder()
          .setTitle(
            "📋 AXERA LEAGUE • KAYIT PANELİ"
          )
          .setDescription(
            `👤 **Oyuncu:** ${target}\n` +
            `🏷️ **Takma Ad:** \`${nickname}\`\n\n` +
            `Aşağıdaki seçeneklerden oyuncunun görevini seçin.\n` +
            `🔒 Bu butonları yalnızca **Kayıt Yetkilisi** kullanabilir.`
          )
          .setFooter({
            text:
              "Axera League • Kayıt Sistemi"
          })
          .setTimestamp();


      await message.channel.send({
        embeds: [embed],
        components: [row]
      });


      await message.react("✅");

    } catch (error) {

      console.error(
        "Kayıt komutu hatası:",
        error
      );

      return message.reply(
        "❌ Takma ad değiştirilemedi. Botun **Takma Adları Yönet** yetkisini ve rol sırasını kontrol et."
      );

    }

    return;
  }


  // ====================================================
  // KAYITSIZ VER
  // ====================================================

  if (
    command === ".kayıtsızver" ||
    command === ".kayitsizver"
  ) {

    if (
      !isKayıtYetkilisi(message.member)
    ) {

      return message.reply(
        "❌ Bu komutu yalnızca **Kayıt Yetkilisi** kullanabilir."
      );

    }


    const target =
      message.mentions.members.first();


    if (!target) {

      return message.reply(
        "❌ Kullanım: `.kayıtsızver @oyuncu`"
      );

    }


    try {

      const roles = [
        ROLES.FUTBOLCU,
        ROLES.KALECI,
        ROLES.TEKNIK_DIREKTOR
      ];


      for (const roleId of roles) {

        if (
          target.roles.cache.has(roleId)
        ) {

          await target.roles.remove(
            roleId
          );

        }
      }


      if (
        !target.roles.cache.has(
          ROLES.KAYITSIZ
        )
      ) {

        await target.roles.add(
          ROLES.KAYITSIZ
        );

      }


      delete data.registrations[
        target.id
      ];

      saveData();


      return message.reply(
        `✅ ${target} tekrar **Kayıtsız** yapıldı.`
      );

    } catch (error) {

      console.error(
        "Kayıtsız verme hatası:",
        error
      );

      return message.reply(
        "❌ Kayıtsız rolü verilemedi. Botun rol sırasını ve **Rolleri Yönet** yetkisini kontrol et."
      );

    }

  }


  // ====================================================
  // DEĞER VER
  // ====================================================

  if (command === ".dver") {

    if (
      !isDeğerYetkilisi(message.member)
    ) {

      return message.reply(
        "❌ Bu komutu yalnızca **Değer Yetkilisi** kullanabilir."
      );

    }


    const target =
      message.mentions.members.first();


    if (!target) {

      return message.reply(
        "❌ Kullanım: `.dver @oyuncu 5`"
      );

    }


    const mentionIndex =
      args.findIndex(arg =>
        arg.includes(target.id)
      );


    const amount =
      Number(
        args[mentionIndex + 1]
      );


    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {

      return message.reply(
        "❌ Geçerli bir miktar yaz.\nÖrnek: `.dver @Oyuncu 5`"
      );

    }


    const result =
      await changeValue(
        target,
        amount
      );


    if (!result.success) {

      return message.reply(
        result.message
      );

    }


    return message.reply(
      `💰 ${target} değerine **+${amount}M€** eklendi.\n\n` +
      `📊 Eski Değer: **${result.oldValue}M€**\n` +
      `📈 Yeni Değer: **${result.newValue}M€**`
    );

  }


  // ====================================================
  // DEĞER SİL
  // ====================================================

  if (command === ".dsil") {

    if (
      !isDeğerYetkilisi(message.member)
    ) {

      return message.reply(
        "❌ Bu komutu yalnızca **Değer Yetkilisi** kullanabilir."
      );

    }


    const target =
      message.mentions.members.first();


    if (!target) {

      return message.reply(
        "❌ Kullanım: `.dsil @oyuncu 5`"
      );

    }


    const mentionIndex =
      args.findIndex(arg =>
        arg.includes(target.id)
      );


    const amount =
      Number(
        args[mentionIndex + 1]
      );


    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {

      return message.reply(
        "❌ Geçerli bir miktar yaz.\nÖrnek: `.dsil @Oyuncu 5`"
      );

    }


    const result =
      await changeValue(
        target,
        -amount
      );


    if (!result.success) {

      return message.reply(
        result.message
      );

    }


    return message.reply(
      `💸 ${target} değerinden **${amount}M€** çıkarıldı.\n\n` +
      `📊 Eski Değer: **${result.oldValue}M€**\n` +
      `📉 Yeni Değer: **${result.newValue}M€**`
    );

  }


  // ====================================================
  // ANTRENMAN
  // ====================================================
  // KAYIT ŞARTI YOK
  // ====================================================

  if (
    command === ".ant" ||
    command === ".antrenman"
  ) {

    if (
      message.channel.id !== CHANNELS.ANTRENMAN
    ) {

      return message.reply(
        `❌ Bu komut yalnızca <#${CHANNELS.ANTRENMAN}> kanalında kullanılabilir.`
      );

    }


    // KAYIT KONTROLÜ YOK
    const userData =
      getUserData(
        message.author.id
      );


    userData.training++;


    // 5/5
    if (
      userData.training >= TRAINING_MAX
    ) {

      const result =
        await changeValue(
          message.member,
          TRAINING_REWARD
        );


      if (!result.success) {

        userData.training = 4;

        saveData();


        return message.reply(
          `🏋️ **5/5 ANTRENMAN TAMAMLANDI!**\n\n` +
          `❌ Ancak **+${TRAINING_REWARD}M€** ödülü verilemedi.\n` +
          `📌 İlerleme kaybolmaması için **4/5** olarak korundu.`
        );

      }


      userData.training = 0;

      saveData();


      return message.reply(
        `🏋️ **ANTRENMAN TAMAMLANDI!**\n\n` +
        `📊 İlerleme: **5/5**\n` +
        `💰 Ödül: **+${TRAINING_REWARD}M€**\n` +
        `📈 Yeni Değer: **${result.newValue}M€**\n\n` +
        `🔄 Yeni antrenman: **0/5**`
      );

    }


    saveData();


    return message.reply(
      `🏋️ ${message.author} antrenman yaptı!\n\n` +
      `📊 İlerleme: **${userData.training}/${TRAINING_MAX}**\n` +
      `🎁 5/5 olduğunda **+${TRAINING_REWARD}M€** kazanacaksın.`
    );

  }


  // ====================================================
  // PENALTI
  // ====================================================
  // KAYIT ŞARTI YOK
  // ====================================================

  if (
    command === ".pen" ||
    command === ".penaltı" ||
    command === ".penalti"
  ) {

    if (
      message.channel.id !== CHANNELS.PENALTI
    ) {

      return message.reply(
        `❌ Bu komut yalnızca <#${CHANNELS.PENALTI}> kanalında kullanılabilir.`
      );

    }


    // KAYIT KONTROLÜ YOK

    const result =
      Math.floor(
        Math.random() * 3
      );


    // 0 = GOL
    if (result === 0) {

      const valueResult =
        await changeValue(
          message.member,
          PENALTY_REWARD
        );


      if (!valueResult.success) {

        return message.reply(
          `⚽ **GOOOL!**\n\n` +
          `🧤 Axera Kalecisi (NPC) topu çıkaramadı!\n\n` +
          `❌ Değer ödülü verilemedi.\n` +
          `${valueResult.message}`
        );

      }


      return message.reply(
        `⚽ **GOOOL!**\n\n` +
        `🧤 Axera Kalecisi (NPC) kurtaramadı!\n` +
        `💰 Ödül: **+${PENALTY_REWARD}M€**\n` +
        `📈 Yeni Değer: **${valueResult.newValue}M€**`
      );

    }


    // 1 = DİREK
    if (result === 1) {

      return message.reply(
        `🥅 **DİREK!**\n\n` +
        `Top direğe çarptı!\n` +
        `💰 Ödül: **0M€**`
      );

    }


    // 2 = KALECİ
    return message.reply(
      `🧤 **KURTARDI!**\n\n` +
      `Axera Kalecisi (NPC) penaltıyı kurtardı!\n` +
      `💰 Ödül: **0M€**`
    );

  }


  // ====================================================
  // TWEET
  // ====================================================

  if (command === ".tweet") {

    const tweetText =
      args.slice(1).join(" ").trim();


    if (!tweetText) {

      return message.reply(
        "❌ Kullanım: `.tweet Tweet mesajı`"
      );

    }


    const embed =
      new EmbedBuilder()
        .setAuthor({
          name: message.member.displayName,
          iconURL:
            message.author.displayAvatarURL({
              extension: "png",
              size: 256
            })
        })
        .setDescription(tweetText)
        .setFooter({
          text:
            "Axera League • Tweet"
        })
        .setTimestamp();


    return message.channel.send({
      embeds: [embed]
    });

  }


  // ====================================================
  // FUTBOLCU ARAMA
  // .ara isim
  // ====================================================

  if (command === ".ara") {

    const search =
      args.slice(1).join(" ").trim();


    if (!search) {

      return message.reply(
        "❌ Kullanım: `.ara W.Sneijder`"
      );

    }


    const closest =
      await findClosestPlayer(
        message.guild,
        search
      );


    // --------------------------------------------------
    // BOŞ
    // --------------------------------------------------

    if (!closest) {

      const emptyEmbed =
        new EmbedBuilder()
          .setTitle(
            "🔎 AXERA LEAGUE • FUTBOLCU ARAMA"
          )
          .setDescription(
            `🔍 **Aranan Takma Ad**\n` +
            `\`${search}\`\n\n` +
            `⚪ **DURUM: BOŞ**\n\n` +
            `Bu isme uygun kayıtlı bir takma ad bulunamadı.`
          )
          .setFooter({
            text:
              "Axera League • Arama Sistemi"
          })
          .setTimestamp();


      return message.channel.send({
        embeds: [emptyEmbed]
      });

    }


    // --------------------------------------------------
    // DOLU
    // --------------------------------------------------

    const playerValue =
      getValueFromNickname(
        closest.nickname
      );


    let valueText =
      "Belirlenmemiş";


    if (playerValue !== null) {
      valueText =
        `${playerValue}M€`;
    }


    const filledEmbed =
      new EmbedBuilder()
        .setTitle(
          "🔎 AXERA LEAGUE • FUTBOLCU ARAMA"
        )
        .setDescription(
          `🔍 **Aranan Takma Ad**\n` +
          `\`${search}\`\n\n` +

          `👤 **En Yakın Takma Ad**\n` +
          `\`${closest.nickname}\`\n\n` +

          `🟢 **DURUM: DOLU**\n\n` +

          `👤 **Oyuncu:** ${closest}\n` +
          `💰 **Değer:** ${valueText}`
        )
        .setThumbnail(
          closest.user.displayAvatarURL({
            extension: "png",
            size: 256
          })
        )
        .setFooter({
          text:
            "Axera League • Arama Sistemi"
        })
        .setTimestamp();


    return message.channel.send({
      embeds: [filledEmbed]
    });

  }


  // ====================================================
  // YARDIM
  // ====================================================

  if (
    command === ".yardım" ||
    command === ".yardim"
  ) {

    const embed =
      new EmbedBuilder()
        .setTitle(
          "⚽ AXERA LEAGUE • KOMUTLAR"
        )
        .setDescription(
          "Axera League bot sistemleri:"
        )

        .addFields(

          {
            name: "📋 Kayıt",
            value:
              "`.k @oyuncu TakmaAdı`\n" +
              "`.kayıtsızver @oyuncu`"
          },

          {
            name: "🏋️ Antrenman",
            value:
              "`.ant`\n" +
              "`.antrenman`\n\n" +
              "5/5 → **+5M€**"
          },

          {
            name: "🥅 Penaltı",
            value:
              "`.pen`\n" +
              "`.penaltı`\n" +
              "`.penalti`\n\n" +
              "⚽ Gol → **+5M€**\n" +
              "🥅 Direk → **0M€**\n" +
              "🧤 NPC kurtarışı → **0M€**"
          },

          {
            name: "💰 Değer",
            value:
              "`.dver @oyuncu 5`\n" +
              "`.dsil @oyuncu 5`"
          },

          {
            name: "🐦 Tweet",
            value:
              "`.tweet mesaj`"
          },

          {
            name: "🔎 Arama",
            value:
              "`.ara isim`\n\n" +
              "Sunucudaki takma adlar arasından yalnızca en yakın sonucu gösterir."
          }

        )

        .setFooter({
          text:
            "Axera League"
        })

        .setTimestamp();


    return message.reply({
      embeds: [embed]
    });

  }

});


// ======================================================
// HATA YAKALAMA
// ======================================================

process.on(
  "unhandledRejection",
  (error) => {
    console.error(
      "UNHANDLED REJECTION:",
      error
    );
  }
);


process.on(
  "uncaughtException",
  (error) => {
    console.error(
      "UNCAUGHT EXCEPTION:",
      error
    );
  }
);


client.on(
  "error",
  (error) => {
    console.error(
      "CLIENT ERROR:",
      error
    );
  }
);


// ======================================================
// LOGIN
// ======================================================

if (
  !TOKEN ||
  TOKEN === "BURAYA_BOT_TOKENINI_YAZ"
) {

  console.error(
    "❌ TOKEN bulunamadı!"
  );

  console.error(
    "Railway > Variables kısmına TOKEN ekle."
  );

} else {

  client.login(TOKEN).catch(
    (error) => {
      console.error(
        "❌ Discord giriş hatası:",
        error
      );
    }
  );

}
