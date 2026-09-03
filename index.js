const {
    Client,
    GatewayIntentBits,
    Partials,
    PermissionsBitField,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ======================================================
// AXERA LEAGUE - FUTBOL RP BOT
// SİSTEMLER:
// 1. Kayıt
// 2. Antrenman
// 3. Penaltı
// 4. Değer
// 5. Tweet
// ======================================================

// TOKEN
const TOKEN = process.env.TOKEN || "BURAYA_BOT_TOKENINI_YAZ";

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
// VERİ DOSYASI
// ======================================================

const DATA_FILE = path.join(__dirname, "data.json");

let data = {
    training: {},
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
            training: parsed.training || {},
            registrations: parsed.registrations || {}
        };
    } catch (error) {
        console.error("data.json okunamadı:", error);

        data = {
            training: {},
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

function isAdmin(member) {
    return member.permissions.has(
        PermissionsBitField.Flags.Administrator
    );
}

function hasRole(member, roleId) {
    return member.roles.cache.has(roleId);
}

function canUseRegistration(member) {
    return (
        isAdmin(member) ||
        hasRole(member, ROLES.KAYIT_YETKILISI)
    );
}

function canUseValue(member) {
    return (
        isAdmin(member) ||
        hasRole(member, ROLES.DEGER_YETKILISI)
    );
}

function isRegistered(member) {
    return (
        hasRole(member, ROLES.FUTBOLCU) ||
        hasRole(member, ROLES.KALECI) ||
        hasRole(member, ROLES.TEKNIK_DIREKTOR)
    );
}

function getMentionedMember(message) {
    return message.mentions.members.first() || null;
}

function getNumber(text) {
    if (!text) return null;

    const cleaned = text
        .replace(",", ".")
        .trim();

    const number = Number(cleaned);

    if (!Number.isFinite(number)) {
        return null;
    }

    return number;
}

// ======================================================
// DEĞER SİSTEMİ
// ======================================================

function getNicknameValue(nickname) {
    if (!nickname) {
        return null;
    }

    const match = nickname.match(/(\d+(?:[.,]\d+)?)M€\s*$/i);

    if (!match) {
        return null;
    }

    return Number(match[1].replace(",", "."));
}

function changeNicknameValue(nickname, amount) {
    const match = nickname.match(/^(.*?)(\d+(?:[.,]\d+)?)M€\s*$/i);

    if (!match) {
        return null;
    }

    const base = match[1].trimEnd();

    const oldValue = Number(
        match[2].replace(",", ".")
    );

    const newValue = Math.max(
        0,
        oldValue + amount
    );

    // Gereksiz küsuratları kaldır
    const formattedValue =
        Number.isInteger(newValue)
            ? String(newValue)
            : String(Number(newValue.toFixed(2)));

    return `${base}${formattedValue}M€`;
}

async function changePlayerValue(member, amount) {
    const currentNickname =
        member.nickname || member.user.username;

    const newNickname =
        changeNicknameValue(currentNickname, amount);

    if (!newNickname) {
        return {
            success: false,
            reason: "NOVALUE"
        };
    }

    // Discord nickname sınırı
    if (newNickname.length > 32) {
        return {
            success: false,
            reason: "TOOLONG"
        };
    }

    try {
        await member.setNickname(newNickname);

        return {
            success: true,
            nickname: newNickname
        };
    } catch (error) {
        console.error("Nickname değiştirilemedi:", error);

        return {
            success: false,
            reason: "DISCORD"
        };
    }
}

// ======================================================
// BOT HAZIR
// ======================================================

client.once("ready", () => {
    console.log("========================================");
    console.log("AXERA LEAGUE BOT AKTİF");
    console.log(`Bot: ${client.user.tag}`);
    console.log(`Sunucu sayısı: ${client.guilds.cache.size}`);
    console.log("========================================");

    client.user.setPresence({
        activities: [
            {
                name: "Axera League ⚽",
                type: 3
            }
        ],
        status: "online"
    });
});

// ======================================================
// YENİ ÜYE KARŞILAMA
// ======================================================

client.on("guildMemberAdd", async (member) => {
    try {
        const channel =
            member.guild.channels.cache.get(CHANNELS.KAYIT);

        if (!channel) return;

        await channel.send({
            content:
                `👋 Hoş geldin ${member}!\n\n` +
                `📋 Kayıt işlemin için <@&${ROLES.KAYIT_YETKILISI}> seninle ilgilenecektir.`
        });
    } catch (error) {
        console.error("Hoş geldin mesajı gönderilemedi:", error);
    }
});

// ======================================================
// BUTONLAR
// ======================================================

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    if (!interaction.customId.startsWith("kayit_")) {
        return;
    }

    const parts = interaction.customId.split("_");

    if (parts.length !== 3) {
        return;
    }

    const type = parts[1];
    const userId = parts[2];

    if (interaction.user.id !== userId) {
        return interaction.reply({
            content: "❌ Bu kayıt paneli senin için oluşturulmadı.",
            ephemeral: true
        });
    }

    const member =
        interaction.guild.members.cache.get(userId);

    if (!member) {
        return interaction.reply({
            content: "❌ Oyuncu bulunamadı.",
            ephemeral: true
        });
    }

    let selectedRole = null;
    let roleName = "";

    if (type === "futbolcu") {
        selectedRole = ROLES.FUTBOLCU;
        roleName = "⚽ Futbolcu";
    }

    if (type === "kaleci") {
        selectedRole = ROLES.KALECI;
        roleName = "🧤 Kaleci";
    }

    if (type === "td") {
        selectedRole = ROLES.TEKNIK_DIREKTOR;
        roleName = "📋 Teknik Direktör";
    }

    if (!selectedRole) {
        return interaction.reply({
            content: "❌ Geçersiz kayıt seçimi.",
            ephemeral: true
        });
    }

    try {
        // Kayıtsız rolünü kaldır
        if (member.roles.cache.has(ROLES.KAYITSIZ)) {
            await member.roles.remove(ROLES.KAYITSIZ);
        }

        // Diğer kayıt rollerini kaldır
        const removableRoles = [
            ROLES.FUTBOLCU,
            ROLES.KALECI,
            ROLES.TEKNIK_DIREKTOR
        ];

        for (const roleId of removableRoles) {
            if (
                roleId !== selectedRole &&
                member.roles.cache.has(roleId)
            ) {
                await member.roles.remove(roleId);
            }
        }

        // Seçilen rolü ver
        await member.roles.add(selectedRole);

        // Butonları kapat
        const disabledRow =
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`kayit_futbolcu_${userId}`)
                    .setLabel("Futbolcu")
                    .setEmoji("⚽")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),

                new ButtonBuilder()
                    .setCustomId(`kayit_kaleci_${userId}`)
                    .setLabel("Kaleci")
                    .setEmoji("🧤")
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(true),

                new ButtonBuilder()
                    .setCustomId(`kayit_td_${userId}`)
                    .setLabel("Teknik Direktör")
                    .setEmoji("📋")
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true)
            );

        await interaction.update({
            content:
                `✅ ${member} başarıyla **${roleName}** olarak kaydedildi.`,
            components: [disabledRow]
        });

        // Sohbet kanalına gönder
        const sohbet =
            interaction.guild.channels.cache.get(
                CHANNELS.SOHBET
            );

        if (sohbet) {
            await sohbet.send({
                content:
                    `🎉 ${member} kayıt işlemini tamamladı!\n` +
                    `👤 Rol: **${roleName}**`
            });
        }

        // Kayıt bilgisini kaydet
        data.registrations[userId] = {
            type: type,
            registeredBy: interaction.user.id,
            registeredAt: Date.now()
        };

        saveData();

    } catch (error) {
        console.error("Kayıt butonu hatası:", error);

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content:
                    "❌ Kayıt sırasında bir hata oluştu. Botun rol sırasını ve yetkilerini kontrol edin.",
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

    // ==================================================
    // YARDIM
    // ==================================================

    if (command === ".yardım" || command === ".yardim") {
        const embed = new EmbedBuilder()
            .setTitle("⚽ Axera League Komutları")
            .setDescription(
                [
                    "**📋 Kayıt**",
                    "`.k @oyuncu TakmaAdı`",
                    "`.kayıtsızver @oyuncu`",
                    "",
                    "**🏋️ Antrenman**",
                    "`.ant` / `.antrenman`",
                    "",
                    "**🥅 Penaltı**",
                    "`.pen` / `.penaltı` / `.penalti`",
                    "",
                    "**💰 Değer**",
                    "`.dver @oyuncu miktar`",
                    "`.dsil @oyuncu miktar`",
                    "",
                    "**🐦 Tweet**",
                    "`.tweet mesaj`"
                ].join("\n")
            )
            .setFooter({
                text: "Axera League"
            });

        return message.reply({
            embeds: [embed]
        });
    }

    // ==================================================
    // KAYIT
    // ==================================================

    if (command === ".k") {
        if (message.channel.id !== CHANNELS.KAYIT) {
            return message.reply(
                "❌ Bu komut sadece **kayıt kanalında** kullanılabilir."
            );
        }

        if (!canUseRegistration(message.member)) {
            return message.reply(
                "❌ Bu komutu sadece **Kayıt Yetkilisi** veya **Yönetici** kullanabilir."
            );
        }

        const target = getMentionedMember(message);

        if (!target) {
            return message.reply(
                "❌ Kullanım: `.k @oyuncu TakmaAdı`"
            );
        }

        // Mention dışındaki kısmı al
        const mention = message.mentions.users.first();

        let nickname = args
            .slice(2)
            .join(" ")
            .trim();

        if (!nickname) {
            nickname =
                target.nickname ||
                target.user.username;
        }

        /*
         * ÖNEMLİ:
         * Bot burada oyuncunun takma adını DEĞİŞTİRMEZ.
         *
         * Kayıt yetkilisinin yazdığı:
         * W.Sneijder | 🇳🇱 | SNT | 1M€
         *
         * olduğu gibi bırakılır.
         */

        const row =
            new ActionRowBuilder().addComponents(
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

        const embed = new EmbedBuilder()
            .setTitle("📋 Axera League Kayıt")
            .setDescription(
                `👤 **Oyuncu:** ${target}\n` +
                `🏷️ **Takma Ad:** \`${nickname}\`\n\n` +
                `Oyuncunun hangi role kaydedileceğini aşağıdaki butonlardan seçin.`
            )
            .setFooter({
                text: "Axera League Kayıt Sistemi"
            });

        return message.reply({
            embeds: [embed],
            components: [row]
        });
    }

    // ==================================================
    // KAYITSIZ VER
    // ==================================================

    if (
        command === ".kayıtsızver" ||
        command === ".kayitsizver"
    ) {
        if (!canUseRegistration(message.member)) {
            return message.reply(
                "❌ Bu komutu sadece **Kayıt Yetkilisi** veya **Yönetici** kullanabilir."
            );
        }

        const target = getMentionedMember(message);

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
            delete data.training[target.id];

            saveData();

            return message.reply(
                `✅ ${target} kayıtsız duruma getirildi.\n` +
                `📋 **Kayıtsız** rolü verildi.`
            );

        } catch (error) {
            console.error("Kayıtsız verme hatası:", error);

            return message.reply(
                "❌ Rol işlemi başarısız oldu. Botun rol sırasını ve yetkilerini kontrol edin."
            );
        }
    }

    // ==================================================
    // DEĞER VER
    // ==================================================

    if (command === ".dver") {
        if (!canUseValue(message.member)) {
            return message.reply(
                "❌ Bu komutu sadece **Değer Yetkilisi** veya **Yönetici** kullanabilir."
            );
        }

        const target = getMentionedMember(message);

        if (!target) {
            return message.reply(
                "❌ Kullanım: `.dver @oyuncu 5`"
            );
        }

        const amount = getNumber(args[2]);

        if (amount === null || amount <= 0) {
            return message.reply(
                "❌ Geçerli bir miktar girin. Örnek: `.dver @oyuncu 5`"
            );
        }

        const result =
            await changePlayerValue(
                target,
                amount
            );

        if (!result.success) {
            if (result.reason === "NOVALUE") {
                return message.reply(
                    "❌ Oyuncunun takma adında `M€` değer bölümü bulunamadı."
                );
            }

            if (result.reason === "TOOLONG") {
                return message.reply(
                    "❌ Yeni takma ad Discord'un 32 karakter sınırını aşıyor."
                );
            }

            return message.reply(
                "❌ Oyuncunun takma adı değiştirilemedi."
            );
        }

        return message.reply(
            `💰 ${target} oyuncusunun değeri **+${amount}M€** artırıldı.\n` +
            `🏷️ Yeni değer: **${result.nickname.match(/(\d+(?:[.,]\d+)?)M€\s*$/i)[1]}M€**`
        );
    }

    // ==================================================
    // DEĞER SİL
    // ==================================================

    if (command === ".dsil") {
        if (!canUseValue(message.member)) {
            return message.reply(
                "❌ Bu komutu sadece **Değer Yetkilisi** veya **Yönetici** kullanabilir."
            );
        }

        const target = getMentionedMember(message);

        if (!target) {
            return message.reply(
                "❌ Kullanım: `.dsil @oyuncu 5`"
            );
        }

        const amount = getNumber(args[2]);

        if (amount === null || amount <= 0) {
            return message.reply(
                "❌ Geçerli bir miktar girin. Örnek: `.dsil @oyuncu 5`"
            );
        }

        const result =
            await changePlayerValue(
                target,
                -amount
            );

        if (!result.success) {
            if (result.reason === "NOVALUE") {
                return message.reply(
                    "❌ Oyuncunun takma adında `M€` değer bölümü bulunamadı."
                );
            }

            if (result.reason === "TOOLONG") {
                return message.reply(
                    "❌ Yeni takma ad Discord'un 32 karakter sınırını aşıyor."
                );
            }

            return message.reply(
                "❌ Oyuncunun takma adı değiştirilemedi."
            );
        }

        const newValueMatch =
            result.nickname.match(
                /(\d+(?:[.,]\d+)?)M€\s*$/i
            );

        const newValue =
            newValueMatch
                ? newValueMatch[1]
                : "0";

        return message.reply(
            `💰 ${target} oyuncusunun değeri **-${amount}M€** azaltıldı.\n` +
            `🏷️ Yeni değer: **${newValue}M€**`
        );
    }

    // ==================================================
    // ANTRENMAN
    // ==================================================

    if (
        command === ".ant" ||
        command === ".antrenman"
    ) {
        if (message.channel.id !== CHANNELS.ANTRENMAN) {
            return message.reply(
                "❌ Bu komut sadece **antrenman kanalında** kullanılabilir."
            );
        }

        if (!isRegistered(message.member)) {
            return message.reply(
                "❌ Önce kayıt olmalısın."
            );
        }

        const userId = message.author.id;

        if (!data.training[userId]) {
            data.training[userId] = 0;
        }

        data.training[userId]++;

        const progress =
            data.training[userId];

        // 1/5 - 4/5
        if (progress < 5) {
            saveData();

            return message.reply(
                `🏋️ **Antrenman tamamlandı!**\n\n` +
                `📊 İlerleme: **${progress}/5**\n` +
                `🎯 Ödüle kalan: **${5 - progress} antrenman**`
            );
        }

        // 5/5
        const result =
            await changePlayerValue(
                message.member,
                5
            );

        if (!result.success) {
            // Ödül kaybolmasın
            data.training[userId] = 4;
            saveData();

            return message.reply(
                `🏋️ Antrenman ilerlemesi **5/5** oldu fakat değer verilemedi.\n` +
                `⚠️ Takma adında geçerli bir **M€** değeri olduğundan ve botun takma ad değiştirme yetkisi bulunduğundan emin olun.\n\n` +
                `📊 İlerleme **4/5** olarak korundu.`
            );
        }

        data.training[userId] = 0;
        saveData();

        return message.reply(
            `🏆 **ANTRENMAN TAMAMLANDI!**\n\n` +
            `📊 İlerleme: **5/5**\n` +
            `💰 Ödül: **+5M€**\n` +
            `🏷️ Yeni değer: **${result.nickname.match(/(\d+(?:[.,]\d+)?)M€\s*$/i)[1]}M€**`
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
        if (message.channel.id !== CHANNELS.PENALTI) {
            return message.reply(
                "❌ Bu komut sadece **penaltı kanalında** kullanılabilir."
            );
        }

        if (!isRegistered(message.member)) {
            return message.reply(
                "❌ Önce kayıt olmalısın."
            );
        }

        /*
         * 3 eşit ihtimal:
         *
         * 0 = GOL
         * 1 = DİREK
         * 2 = NPC KALECİ KURTARDI
         */

        const result =
            Math.floor(Math.random() * 3);

        // GOL
        if (result === 0) {
            const valueResult =
                await changePlayerValue(
                    message.member,
                    5
                );

            if (!valueResult.success) {
                return message.reply(
                    `⚽ **GOL!**\n\n` +
                    `🥅 Kaleci: **🧤 Axera Kalecisi (NPC)**\n` +
                    `💰 Ödül verilemedi çünkü oyuncunun takma adında geçerli bir M€ değeri bulunamadı.`
                );
            }

            const newValue =
                valueResult.nickname.match(
                    /(\d+(?:[.,]\d+)?)M€\s*$/i
                );

            return message.reply(
                `⚽ **GOOOOL!**\n\n` +
                `👤 Oyuncu: ${message.member}\n` +
                `🥅 Kaleci: **🧤 Axera Kalecisi (NPC)**\n` +
                `💰 Ödül: **+5M€**\n` +
                `🏷️ Yeni değer: **${newValue ? newValue[1] : "0"}M€**`
            );
        }

        // DİREK
        if (result === 1) {
            return message.reply(
                `🥅 **DİREK!**\n\n` +
                `👤 Oyuncu: ${message.member}\n` +
                `🧤 Kaleci: **Axera Kalecisi (NPC)**\n` +
                `💰 Kazanç: **0M€**`
            );
        }

        // NPC KURTARDI
        return message.reply(
            `🧤 **KURTARDI!**\n\n` +
            `👤 Oyuncu: ${message.member}\n` +
            `🥅 Kaleci: **Axera Kalecisi (NPC)**\n` +
            `💰 Kazanç: **0M€**`
        );
    }

    // ==================================================
    // TWEET
    // ==================================================

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
                name:
                    message.member.displayName ||
                    message.author.username,
                iconURL:
                    message.author.displayAvatarURL({
                        dynamic: true
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
});

// ======================================================
// HATALAR
// ======================================================

process.on("unhandledRejection", (error) => {
    console.error(
        "Yakalanmamış Promise Hatası:",
        error
    );
});

process.on("uncaughtException", (error) => {
    console.error(
        "Yakalanmamış Exception:",
        error
    );
});

// ======================================================
// LOGIN
// ======================================================

client.login(TOKEN);
