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
// AXERA LEAGUE - FUTBOL RP BOTU
// ======================================================
// SİSTEMLER:
// 📋 Kayıt
// 🏋️ Antrenman
// 🥅 Penaltı
// 💰 Değer
// 🐦 Tweet
//
// NOT:
// Kayıtsız oyuncular ANTRENMAN ve PENALTI yapabilir.
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
// AYARLAR
// ======================================================

const TRAINING_MAX = 5;
const TRAINING_REWARD = 5;

const PENALTY_REWARD = 5;


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
    console.error("data.json okunurken hata:", error);

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
    console.error("data.json kaydedilirken hata:", error);
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

  return data.users[userId];
}


function isRegistered(member) {
  if (!member) return false;

  return (
    hasRole(member, ROLES.FUTBOLCU) ||
    hasRole(member, ROLES.KALECI) ||
    hasRole(member, ROLES.TEKNIK_DIREKTOR)
  );
}


// ======================================================
// M€ DEĞER OKUMA
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
      message:
        "❌ Oyuncunun takma adı bulunamadı."
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
// BOT HAZIR
// ======================================================

client.once("ready", () => {
  console.log("======================================");
  console.log("AXERA LEAGUE BOT AKTİF");
  console.log(`Bot: ${client.user.tag}`);
  console.log(`Sunucu Sayısı: ${client.guilds.cache.size}`);
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
// YENİ ÜYE KAYIT MESAJI
// ======================================================

client.on("guildMemberAdd", async (member) => {

  try {

    const channel = await member.guild.channels
      .fetch(CHANNELS.KAYIT)
      .catch(() => null);

    if (!channel) {
      console.log("Kayıt kanalı bulunamadı.");
      return;
    }

    await channel.send(
      `👋 ${member} hoşgeldin sunucumuza!\n\n` +
      `📋 <@&${ROLES.KAYIT_YETKILISI}> seninle ilgilenecektir.`
    );

  } catch (error) {
    console.error("Yeni üye mesajı hatası:", error);
  }

});


// ======================================================
// KAYIT BUTONLARI
// ======================================================

client.on("interactionCreate", async (interaction) => {

  if (!interaction.isButton()) return;

  const customId = interaction.customId;

  if (!customId.startsWith("kayit_")) return;


  // ----------------------------------------------------
  // SADECE KAYIT YETKİLİSİ
  // ----------------------------------------------------

  if (!isKayıtYetkilisi(interaction.member)) {

    return interaction.reply({
      content:
        "❌ Bu butonları yalnızca Kayıt Yetkilisi kullanabilir.",
      ephemeral: true
    });

  }


  // ----------------------------------------------------
  // BUTTON ID
  // ----------------------------------------------------

  const parts = customId.split("_");

  if (parts.length < 3) {

    return interaction.reply({
      content: "❌ Geçersiz kayıt butonu.",
      ephemeral: true
    });

  }

  const type = parts[1];
  const playerId = parts[2];


  // ----------------------------------------------------
  // OYUNCUYU BUL
  // ----------------------------------------------------

  let player;

  try {
    player = await interaction.guild.members
      .fetch(playerId);
  } catch {
    player = null;
  }


  if (!player) {

    return interaction.reply({
      content: "❌ Oyuncu artık sunucuda bulunmuyor.",
      ephemeral: true
    });

  }


  // ----------------------------------------------------
  // ROLLER
  // ----------------------------------------------------

  const registrationRoles = [
    ROLES.FUTBOLCU,
    ROLES.KALECI,
    ROLES.TEKNIK_DIREKTOR
  ];


  try {

    // Önce mevcut kayıt rollerini kaldır
    for (const roleId of registrationRoles) {

      if (player.roles.cache.has(roleId)) {
        await player.roles.remove(roleId);
      }

    }


    // Kayıtsız rolünü kaldır
    if (player.roles.cache.has(ROLES.KAYITSIZ)) {
      await player.roles.remove(ROLES.KAYITSIZ);
    }


    // Seçilen rol
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
        content: "❌ Geçersiz kayıt türü.",
        ephemeral: true
      });

    }


    await player.roles.add(selectedRole);


    // --------------------------------------------------
    // KAYIT DATA
    // --------------------------------------------------

    data.registrations[player.id] = {
      type: roleName,
      registeredBy: interaction.user.id,
      registeredAt: new Date().toISOString()
    };

    saveData();


    // --------------------------------------------------
    // BUTONLARI KAPAT
    // --------------------------------------------------

    const disabledRow = new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(`kayit_futbolcu_${player.id}`)
          .setLabel("Futbolcu")
          .setEmoji("⚽")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),

        new ButtonBuilder()
          .setCustomId(`kayit_kaleci_${player.id}`)
          .setLabel("Kaleci")
          .setEmoji("🧤")
          .setStyle(ButtonStyle.Success)
          .setDisabled(true),

        new ButtonBuilder()
          .setCustomId(`kayit_td_${player.id}`)
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


    // --------------------------------------------------
    // SOHBET MESAJI
    // --------------------------------------------------

    const sohbet = await interaction.guild.channels
      .fetch(CHANNELS.SOHBET)
      .catch(() => null);


    if (sohbet) {

      const embed = new EmbedBuilder()
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
        .setTimestamp();

      await sohbet.send({
        embeds: [embed]
      });

    }

  } catch (error) {

    console.error("Kayıt butonu hatası:", error);

    if (!interaction.replied && !interaction.deferred) {

      await interaction.reply({
        content:
          "❌ Kayıt sırasında hata oluştu. Botun rol yönetme yetkisini ve rol sırasını kontrol et.",
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

  const content = message.content.trim();

  if (!content.startsWith(".")) return;


  const args = content.split(/\s+/);

  const command = args[0].toLowerCase();


  // ====================================================
  // KAYIT
  // .k @oyuncu TakmaAdı
  // ====================================================

  if (command === ".k") {

    if (!isKayıtYetkilisi(message.member)) {

      return message.reply(
        "❌ Bu komutu yalnızca **Kayıt Yetkilisi** kullanabilir."
      );

    }


    if (message.channel.id !== CHANNELS.KAYIT) {

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


    const mentionText =
      message.mentions.users.first()?.toString();


    if (!mentionText) {

      return message.reply(
        "❌ Oyuncuyu etiketlemelisin."
      );

    }


    // Mentiondan sonraki HER ŞEY nickname
    const nickname = args.slice(2).join(" ").trim();


    if (!nickname) {

      return message.reply(
        "❌ Oyuncunun takma adını yazmalısın.\n\n" +
        "Örnek:\n" +
        "`.k @Oyuncu W.Sneijder | 🇳🇱 | SNT | 1M€`"
      );

    }


    // Discord nickname sınırı
    if (nickname.length > 32) {

      return message.reply(
        `❌ Takma ad **${nickname.length} karakter**. Discord'da maksimum 32 karakter olabilir.`
      );

    }


    try {

      // Kullanıcının takma adını tam olarak yazılan şekilde ayarla
      await target.setNickname(nickname);


      const row = new ActionRowBuilder()
        .addComponents(

          new ButtonBuilder()
            .setCustomId(`kayit_futbolcu_${target.id}`)
            .setLabel("Futbolcu")
            .setEmoji("⚽")
            .setStyle(ButtonStyle.Primary),

          new ButtonBuilder()
            .setCustomId(`kayit_kaleci_${target.id}`)
            .setLabel("Kaleci")
            .setEmoji("🧤")
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId(`kayit_td_${target.id}`)
            .setLabel("Teknik Direktör")
            .setEmoji("📋")
            .setStyle(ButtonStyle.Secondary)

        );


      const embed = new EmbedBuilder()
        .setTitle("📋 Axera League Kayıt Paneli")
        .setDescription(
          `👤 Oyuncu: ${target}\n` +
          `🏷️ Takma Ad: \`${nickname}\`\n\n` +
          `Aşağıdaki butonlardan oyuncunun görevini seçin.\n` +
          `🔒 Butonları yalnızca **Kayıt Yetkilisi** kullanabilir.`
        )
        .setFooter({
          text: "Axera League • Kayıt Sistemi"
        })
        .setTimestamp();


      await message.channel.send({
        embeds: [embed],
        components: [row]
      });


      await message.react("✅");

    } catch (error) {

      console.error("Kayıt komutu hatası:", error);

      return message.reply(
        "❌ Takma ad değiştirilemedi. Botun **Takma Adları Yönet** yetkisini ve rol sırasını kontrol et."
      );

    }

    return;
  }


  // ====================================================
  // KAYITSIZ VER
  // .kayıtsızver @oyuncu
  // .kayitsizver @oyuncu
  // ====================================================

  if (
    command === ".kayıtsızver" ||
    command === ".kayitsizver"
  ) {

    if (!isKayıtYetkilisi(message.member)) {

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

      const registrationRoles = [
        ROLES.FUTBOLCU,
        ROLES.KALECI,
        ROLES.TEKNIK_DIREKTOR
      ];


      for (const roleId of registrationRoles) {

        if (target.roles.cache.has(roleId)) {
          await target.roles.remove(roleId);
        }

      }


      if (!target.roles.cache.has(ROLES.KAYITSIZ)) {
        await target.roles.add(ROLES.KAYITSIZ);
      }


      delete data.registrations[target.id];

      saveData();


      return message.reply(
        `✅ ${target} tekrar **Kayıtsız** yapıldı.`
      );

    } catch (error) {

      console.error("Kayıtsız verme hatası:", error);

      return message.reply(
        "❌ Kayıtsız rolü verilemedi. Botun rol yönetme yetkisini ve rol sırasını kontrol et."
      );

    }

  }


  // ====================================================
  // DEĞER VER
  // .dver @oyuncu 5
  // ====================================================

  if (command === ".dver") {

    if (!isDeğerYetkilisi(message.member)) {

      return message.reply(
        "❌ Bu komutu yalnızca **Değer Yetkilisi** kullanabilir."
      );

    }


    const target =
      message.mentions.members.first();


    if (!target) {

      return message.reply(
        "❌ Kullanım: `.dver @oyuncu miktar`"
      );

    }


    const mentionIndex =
      args.findIndex(arg =>
        arg.includes(target.id)
      );


    const amountText =
      args[mentionIndex + 1];


    const amount =
      Number(amountText);


    if (!Number.isFinite(amount) || amount <= 0) {

      return message.reply(
        "❌ Geçerli bir miktar yazmalısın.\nÖrnek: `.dver @Oyuncu 5`"
      );

    }


    const result =
      await changeValue(target, amount);


    if (!result.success) {

      return message.reply(result.message);

    }


    return message.reply(
      `💰 ${target} değerine **+${amount}M€** eklendi.\n\n` +
      `📊 Eski Değer: **${result.oldValue}M€**\n` +
      `📈 Yeni Değer: **${result.newValue}M€**`
    );

  }


  // ====================================================
  // DEĞER SİL
  // .dsil @oyuncu 5
  // ====================================================

  if (command === ".dsil") {

    if (!isDeğerYetkilisi(message.member)) {

      return message.reply(
        "❌ Bu komutu yalnızca **Değer Yetkilisi** kullanabilir."
      );

    }


    const target =
      message.mentions.members.first();


    if (!target) {

      return message.reply(
        "❌ Kullanım: `.dsil @oyuncu miktar`"
      );

    }


    const mentionIndex =
      args.findIndex(arg =>
        arg.includes(target.id)
      );


    const amountText =
      args[mentionIndex + 1];


    const amount =
      Number(amountText);


    if (!Number.isFinite(amount) || amount <= 0) {

      return message.reply(
        "❌ Geçerli bir miktar yazmalısın.\nÖrnek: `.dsil @Oyuncu 5`"
      );

    }


    const result =
      await changeValue(target, -amount);


    if (!result.success) {

      return message.reply(result.message);

    }


    return message.reply(
      `💸 ${target} değerinden **${amount}M€** çıkarıldı.\n\n` +
      `📊 Eski Değer: **${result.oldValue}M€**\n` +
      `📉 Yeni Değer: **${result.newValue}M€**`
    );

  }


  // ====================================================
  // ANTRENMAN
  // .ant
  // .antrenman
  //
  // KAYIT ŞARTI YOKTUR.
  // ====================================================

  if (
    command === ".ant" ||
    command === ".antrenman"
  ) {

    if (message.channel.id !== CHANNELS.ANTRENMAN) {

      return message.reply(
        `❌ Bu komut yalnızca <#${CHANNELS.ANTRENMAN}> kanalında kullanılabilir.`
      );

    }


    // KAYIT KONTROLÜ YOK
    // Kayıtsız kullanıcı da kullanabilir.

    const userData =
      getUserData(message.author.id);


    if (!Number.isFinite(userData.training)) {
      userData.training = 0;
    }


    if (userData.training >= TRAINING_MAX) {
      userData.training = 0;
    }


    userData.training += 1;


    // --------------------------------------------------
    // 5/5 TAMAMLANDI
    // --------------------------------------------------

    if (userData.training >= TRAINING_MAX) {

      const member = message.member;


      const result =
        await changeValue(member, TRAINING_REWARD);


      if (!result.success) {

        // ÖDÜL KAYBOLMASIN
        userData.training = TRAINING_MAX - 1;

        saveData();


        return message.reply(
          `🏋️ **5/5 ANTRENMAN TAMAMLANDI!**\n\n` +
          `❌ Ancak **+${TRAINING_REWARD}M€** ödülü verilemedi.\n` +
          `📌 İlerleme **4/5** olarak korundu.`
        );

      }


      userData.training = 0;

      saveData();


      return message.reply(
        `🏋️ **ANTRENMAN TAMAMLANDI!**\n\n` +
        `📊 İlerleme: **5/5**\n` +
        `💰 Ödül: **+${TRAINING_REWARD}M€**\n` +
        `📈 Yeni Değer: **${result.newValue}M€**\n\n` +
        `🔄 Yeni antrenman serisi: **0/5**`
      );

    }


    saveData();


    return message.reply(
      `🏋️ ${message.author} antrenman yaptı!\n\n` +
      `📊 Antrenman İlerlemesi: **${userData.training}/${TRAINING_MAX}**\n` +
      `🎁 **5/5** olduğunda **+${TRAINING_REWARD}M€** kazanacaksın.`
    );

  }


  // ====================================================
  // PENALTI
  // .pen
  // .penaltı
  // .penalti
  //
  // KAYIT ŞARTI YOKTUR.
  // ====================================================

  if (
    command === ".pen" ||
    command === ".penaltı" ||
    command === ".penalti"
  ) {

    if (message.channel.id !== CHANNELS.PENALTI) {

      return message.reply(
        `❌ Bu komut yalnızca <#${CHANNELS.PENALTI}> kanalında kullanılabilir.`
      );

    }


    // KAYIT KONTROLÜ YOK
    // Kayıtsız kullanıcı da penaltı kullanabilir.


    const outcomes = [
      "goal",
      "post",
      "save"
    ];


    const outcome =
      outcomes[Math.floor(Math.random() * 3)];


    // --------------------------------------------------
    // GOL
    // --------------------------------------------------

    if (outcome === "goal") {

      const result =
        await changeValue(
          message.member,
          PENALTY_REWARD
        );


      if (!result.success) {

        return message.reply(
          `⚽ **GOOOL!**\n\n` +
          `Ancak değer ödülü verilemedi.\n` +
          `❌ ${result.message}`
        );

      }


      return message.reply(
        `⚽ **GOOOL!**\n\n` +
        `🥅 Axera Kalecisi (NPC) topu çıkaramadı!\n` +
        `💰 Ödül: **+${PENALTY_REWARD}M€**\n` +
        `📈 Yeni Değer: **${result.newValue}M€**`
      );

    }


    // --------------------------------------------------
    // DİREK
    // --------------------------------------------------

    if (outcome === "post") {

      return message.reply(
        `🥅 **DİREK!**\n\n` +
        `Top direğe çarptı ve oyun alanına geri döndü.\n` +
        `💰 Ödül: **0M€**`
      );

    }


    // --------------------------------------------------
    // KALECİ KURTARDI
    // --------------------------------------------------

    if (outcome === "save") {

      return message.reply(
        `🧤 **AXERA KALECİSİ KURTARDI!**\n\n` +
        `🧤 Axera Kalecisi (NPC) penaltıyı çıkardı.\n` +
        `💰 Ödül: **0M€**`
      );

    }

  }


  // ====================================================
  // TWEET
  // .tweet mesaj
  // ====================================================

  if (command === ".tweet") {

    const tweetText =
      args.slice(1).join(" ").trim();


    if (!tweetText) {

      return message.reply(
        "❌ Kullanım: `.tweet Tweet mesajı`"
      );

    }


    const embed = new EmbedBuilder()
      .setAuthor({
        name: message.member.displayName,
        iconURL: message.author.displayAvatarURL({
          extension: "png",
          size: 256
        })
      })
      .setDescription(tweetText)
      .setFooter({
        text: "Axera League • Tweet"
      })
      .setTimestamp();


    return message.channel.send({
      embeds: [embed]
    });

  }


  // ====================================================
  // YARDIM
  // ====================================================

  if (command === ".yardım" || command === ".yardim") {

    const embed = new EmbedBuilder()
      .setTitle("⚽ Axera League • Komutlar")
      .setDescription(
        "Axera League Futbol RP botunun komutları:"
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
        }

      )

      .setFooter({
        text: "Axera League"
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

process.on("unhandledRejection", (error) => {
  console.error("UNHANDLED REJECTION:", error);
});


process.on("uncaughtException", (error) => {
  console.error("UNCAUGHT EXCEPTION:", error);
});


client.on("error", (error) => {
  console.error("CLIENT ERROR:", error);
});


// ======================================================
// LOGIN
// ======================================================

if (!TOKEN || TOKEN === "BURAYA_BOT_TOKENINI_YAZ") {

  console.error(
    "❌ TOKEN bulunamadı! Railway Variables kısmına TOKEN ekle."
  );

} else {

  client.login(TOKEN).catch((error) => {
    console.error("❌ Discord giriş hatası:", error);
  });

}
