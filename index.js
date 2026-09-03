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
// AXERA LEAGUE FUTBOL RP BOT
// ======================================================
// SİSTEMLER
// 1. Kayıt
// 2. Antrenman
// 3. Penaltı
// 4. Değer
// 5. Tweet
// ======================================================

// ======================================================
// TOKEN
// ======================================================

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
// ROL IDLERI
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
// KANAL IDLERI
// ======================================================

const CHANNELS = {
    KAYIT: "1534460177884123276",
    SOHBET: "1534469475917758586",
    ANTRENMAN: "1534474070798762197",
    PENALTI: "1534474327812997192"
};

// ======================================================
// DATA DOSYASI
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

        const file = fs.readFileSync(DATA_FILE, "utf8");

        if (!file.trim()) {
            saveData();
            return;
        }

        const parsed = JSON.parse(file);

        data = {
            training: parsed.training || {},
            registrations: parsed.registrations || {}
        };
    } catch (error) {
        console.error("data.json okunurken hata:", error);

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

function hasRole(member, roleId) {
    return member.roles.cache.has(roleId);
}

// SADECE KAYIT YETKİLİSİ
function isRegistrationOfficial(member) {
    return hasRole(
        member,
        ROLES.KAYIT_YETKILISI
    );
}

// SADECE DEĞER YETKİLİSİ
function isValueOfficial(member) {
    return hasRole(
        member,
        ROLES.DEGER_YETKILISI
    );
}

function getMentionedMember(message) {
    return message.mentions.members.first() || null;
}

function isRegistered(member) {
    return (
        hasRole(member, ROLES.FUTBOLCU) ||
        hasRole(member, ROLES.KALECI) ||
        hasRole(member, ROLES.TEKNIK_DIREKTOR)
    );
}

// ======================================================
// DEĞER OKUMA
// ======================================================

function getPlayerValue(nickname) {
    if (!nickname) {
        return null;
    }

    const match = nickname.match(
        /(\d+(?:[.,]\d+)?)M€\s*$/i
    );

    if (!match) {
        return null;
    }

    return Number(
        match[1].replace(",", ".")
    );
}

// ======================================================
// DEĞER DEĞİŞTİRME
// ======================================================
// SADECE SONDAKİ M€ DEĞERİ DEĞİŞİR.
// OYUNCU ADI / BAYRAK / POZİSYON KORUNUR.
// ======================================================

function createNewNickname(nickname, amount) {
    if (!nickname) {
        return null;
    }

    const match = nickname.match(
        /^(.*?)(\d+(?:[.,]\d+)?)M€\s*$/i
    );

    if (!match) {
        return null;
    }

    const baseName = match[1];

    const oldValue = Number(
        match[2].replace(",", ".")
    );

    let newValue = oldValue + amount;

    if (newValue < 0) {
        newValue = 0;
    }

    let formattedValue;

    if (Number.isInteger(newValue)) {
        formattedValue = String(newValue);
    } else {
        formattedValue =
            String(Number(newValue.toFixed(2)));
    }

    return `${baseName}${formattedValue}M€`;
}

async function changePlayerValue(member, amount) {
    const nickname =
        member.nickname ||
        member.user.username;

    const newNickname =
        createNewNickname(
            nickname,
            amount
        );

    if (!newNickname) {
        return {
            success: false,
            reason: "VALUE_NOT_FOUND"
        };
    }

    if (newNickname.length > 32) {
        return {
            success: false,
            reason: "TOO_LONG"
        };
    }

    try {
        await member.setNickname(
            newNickname
        );

        return {
            success: true,
            nickname: newNickname
        };
    } catch (error) {
        console.error(
            "Takma ad değiştirilemedi:",
            error
        );

        return {
            success: false,
            reason: "DISCORD_ERROR"
        };
    }
}

// ======================================================
// BOT HAZIR
// ======================================================

client.once("ready", () => {
    console.log("================================");
    console.log("AXERA LEAGUE BOT AKTİF");
    console.log(`Bot: ${client.user.tag}`);
    console.log(
        `Sunucu sayısı: ${client.guilds.cache.size}`
    );
    console.log("================================");

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
// YENİ OYUNCU GELİNCE
// ======================================================

client.on(
    "guildMemberAdd",
    async (member) => {
        try {
            const channel =
                member.guild.channels.cache.get(
                    CHANNELS.KAYIT
                );

            if (!channel) {
                console.log(
                    "Kayıt kanalı bulunamadı."
                );
                return;
            }

            await channel.send({
                content:
                    `👋 ${member} hoşgeldin sunucumuza!\n\n` +
                    `<@&${ROLES.KAYIT_YETKILISI}> seninle ilgilenecektir.`
            });

        } catch (error) {
            console.error(
                "Yeni oyuncu mesajı gönderilemedi:",
                error
            );
        }
    }
);

// ======================================================
// KAYIT BUTONLARI
// ======================================================

client.on(
    "interactionCreate",
    async (interaction) => {

        if (!interaction.isButton()) {
            return;
        }

        if (
            !interaction.customId.startsWith(
                "kayit_"
            )
        ) {
            return;
        }

        const parts =
            interaction.customId.split("_");

        if (parts.length !== 3) {
            return;
        }

        const type = parts[1];
        const playerId = parts[2];

        // Sadece kayıt açılan oyuncu
        if (
            interaction.user.id !== playerId
        ) {
            return interaction.reply({
                content:
                    "❌ Bu kayıt paneli senin için değil.",
                ephemeral: true
            });
        }

        const member =
            interaction.guild.members.cache.get(
                playerId
            );

        if (!member) {
            return interaction.reply({
                content:
                    "❌ Oyuncu bulunamadı.",
                ephemeral: true
            });
        }

        let roleId;
        let roleName;

        if (type === "futbolcu") {
            roleId = ROLES.FUTBOLCU;
            roleName = "⚽ Futbolcu";
        }

        if (type === "kaleci") {
            roleId = ROLES.KALECI;
            roleName = "🧤 Kaleci";
        }

        if (type === "td") {
            roleId = ROLES.TEKNIK_DIREKTOR;
            roleName = "📋 Teknik Direktör";
        }

        if (!roleId) {
            return interaction.reply({
                content:
                    "❌ Geçersiz kayıt seçimi.",
                ephemeral: true
            });
        }

        try {

            // Kayıtsız rolünü kaldır
            if (
                member.roles.cache.has(
                    ROLES.KAYITSIZ
                )
            ) {
                await member.roles.remove(
                    ROLES.KAYITSIZ
                );
            }

            // Diğer kayıt rollerini kaldır
            const registrationRoles = [
                ROLES.FUTBOLCU,
                ROLES.KALECI,
                ROLES.TEKNIK_DIREKTOR
            ];

            for (
                const id of registrationRoles
            ) {
                if (
                    id !== roleId &&
                    member.roles.cache.has(id)
                ) {
                    await member.roles.remove(id);
                }
            }

            // Seçilen rol
            await member.roles.add(
                roleId
            );

            // Butonları kapat
            const disabledRow =
                new ActionRowBuilder()
                    .addComponents(

                        new ButtonBuilder()
                            .setCustomId(
                                `kayit_futbolcu_${playerId}`
                            )
                            .setLabel("Futbolcu")
                            .setEmoji("⚽")
                            .setStyle(
                                ButtonStyle.Primary
                            )
                            .setDisabled(true),

                        new ButtonBuilder()
                            .setCustomId(
                                `kayit_kaleci_${playerId}`
                            )
                            .setLabel("Kaleci")
                            .setEmoji("🧤")
                            .setStyle(
                                ButtonStyle.Success
                            )
                            .setDisabled(true),

                        new ButtonBuilder()
                            .setCustomId(
                                `kayit_td_${playerId}`
                            )
                            .setLabel(
                                "Teknik Direktör"
                            )
                            .setEmoji("📋")
                            .setStyle(
                                ButtonStyle.Secondary
                            )
                            .setDisabled(true)
                    );

            await interaction.update({
                content:
                    `✅ ${member} başarıyla **${roleName}** olarak kaydedildi.`,
                components: [
                    disabledRow
                ]
            });

            // Sohbet kanalına bildirim
            const sohbet =
                interaction.guild.channels.cache.get(
                    CHANNELS.SOHBET
                );

            if (sohbet) {
                await sohbet.send({
                    content:
                        `🎉 ${member} kayıt işlemini tamamladı!\n` +
                        `📋 Kayıt türü: **${roleName}**`
                });
            }

            data.registrations[playerId] = {
                type: type,
                registeredBy:
                    interaction.user.id,
                registeredAt: Date.now()
            };

            saveData();

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
                        "❌ Kayıt yapılamadı. Botun rol sırasını ve Manage Roles yetkisini kontrol edin.",
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
    async (message) => {

        if (message.author.bot) {
            return;
        }

        if (!message.guild) {
            return;
        }

        const content =
            message.content.trim();

        if (!content.startsWith(".")) {
            return;
        }

        const args =
            content.split(/\s+/);

        const command =
            args[0].toLowerCase();

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
                        "⚽ Axera League Komutları"
                    )
                    .setDescription(
                        [
                            "📋 **Kayıt**",
                            "`.k @oyuncu TakmaAdı`",
                            "`.kayıtsızver @oyuncu`",
                            "",
                            "🏋️ **Antrenman**",
                            "`.ant`",
                            "`.antrenman`",
                            "",
                            "🥅 **Penaltı**",
                            "`.pen`",
                            "`.penaltı`",
                            "`.penalti`",
                            "",
                            "💰 **Değer**",
                            "`.dver @oyuncu 5`",
                            "`.dsil @oyuncu 5`",
                            "",
                            "🐦 **Tweet**",
                            "`.tweet mesaj`"
                        ].join("\n")
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

        if (command === ".k") {

            // Sadece kayıt kanalı
            if (
                message.channel.id !==
                CHANNELS.KAYIT
            ) {
                return message.reply(
                    "❌ Bu komut sadece kayıt kanalında kullanılabilir."
                );
            }

            // SADECE KAYIT YETKİLİSİ
            if (
                !isRegistrationOfficial(
                    message.member
                )
            ) {
                return message.reply(
                    "❌ Bu komutu sadece **Kayıt Yetkilisi** kullanabilir."
                );
            }

            const target =
                getMentionedMember(
                    message
                );

            if (!target) {
                return message.reply(
                    "❌ Kullanım: `.k @oyuncu TakmaAdı`"
                );
            }

            /*
             * Mentiondan sonraki her şey takma addır.
             *
             * Örnek:
             *
             * .k @Oyuncu W.Sneijder | 🇳🇱 | SNT | 1M€
             *
             * Bot bu takma adı oyuncuya uygular.
             */

            const nickname =
                args
                    .slice(2)
                    .join(" ")
                    .trim();

            if (!nickname) {
                return message.reply(
                    "❌ Oyuncunun takma adını yazmalısın.\n\n" +
                    "Örnek:\n" +
                    "`.k @oyuncu W.Sneijder | 🇳🇱 | SNT | 1M€`"
                );
            }

            // Discord nickname limiti
            if (nickname.length > 32) {
                return message.reply(
                    `❌ Bu takma ad **${nickname.length} karakter**. Discord takma adları en fazla **32 karakter** olabilir.\n` +
                    `⚠️ Bot ismi kesmeyecek veya değiştirmeyecek.`
                );
            }

            try {

                // ==================================================
                // YAZILAN TAKMA AD AYNEN UYGULANIR
                // ==================================================

                await target.setNickname(
                    nickname
                );

                // Butonlar
                const row =
                    new ActionRowBuilder()
                        .addComponents(

                            new ButtonBuilder()
                                .setCustomId(
                                    `kayit_futbolcu_${target.id}`
                                )
                                .setLabel(
                                    "Futbolcu"
                                )
                                .setEmoji("⚽")
                                .setStyle(
                                    ButtonStyle.Primary
                                ),

                            new ButtonBuilder()
                                .setCustomId(
                                    `kayit_kaleci_${target.id}`
                                )
                                .setLabel(
                                    "Kaleci"
                                )
                                .setEmoji("🧤")
                                .setStyle(
                                    ButtonStyle.Success
                                ),

                            new ButtonBuilder()
                                .setCustomId(
                                    `kayit_td_${target.id}`
                                )
                                .setLabel(
                                    "Teknik Direktör"
                                )
                                .setEmoji("📋")
                                .setStyle(
                                    ButtonStyle.Secondary
                                )
                        );

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            "📋 Axera League Kayıt"
                        )
                        .setDescription(
                            `👤 **Oyuncu:** ${target}\n` +
                            `🏷️ **Takma Ad:** \`${nickname}\`\n\n` +
                            `Aşağıdaki butonlardan oyuncunun kayıt türünü seçin.`
                        )
                        .setFooter({
                            text:
                                "Axera League Kayıt Sistemi"
                        });

                return message.reply({
                    embeds: [embed],
                    components: [row]
                });

            } catch (error) {

                console.error(
                    "Kayıt takma ad hatası:",
                    error
                );

                return message.reply(
                    "❌ Takma ad uygulanamadı. Botun **Takma Adları Yönet** yetkisini ve rol sırasını kontrol edin."
                );
            }
        }

        // ==================================================
        // KAYITSIZ VER
        // ==================================================

        if (
            command === ".kayıtsızver" ||
            command === ".kayitsizver"
        ) {

            if (
                !isRegistrationOfficial(
                    message.member
                )
            ) {
                return message.reply(
                    "❌ Bu komutu sadece **Kayıt Yetkilisi** kullanabilir."
                );
            }

            const target =
                getMentionedMember(
                    message
                );

            if (!target) {
                return message.reply(
                    "❌ Kullanım: `.kayıtsızver @oyuncu`"
                );
            }

            try {

                // Futbolcu
                if (
                    target.roles.cache.has(
                        ROLES.FUTBOLCU
                    )
                ) {
                    await target.roles.remove(
                        ROLES.FUTBOLCU
                    );
                }

                // Kaleci
                if (
                    target.roles.cache.has(
                        ROLES.KALECI
                    )
                ) {
                    await target.roles.remove(
                        ROLES.KALECI
                    );
                }

                // Teknik Direktör
                if (
                    target.roles.cache.has(
                        ROLES.TEKNIK_DIREKTOR
                    )
                ) {
                    await target.roles.remove(
                        ROLES.TEKNIK_DIREKTOR
                    );
                }

                // Sadece Kayıtsız
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

                delete data.training[
                    target.id
                ];

                saveData();

                return message.reply(
                    `✅ ${target} kayıtsız yapıldı.\n` +
                    `📋 **Kayıtsız** rolü verildi.\n` +
                    `⚽ Futbolcu, 🧤 Kaleci ve 📋 Teknik Direktör rolleri kaldırıldı.`
                );

            } catch (error) {

                console.error(
                    "Kayıtsız verme hatası:",
                    error
                );

                return message.reply(
                    "❌ İşlem başarısız. Botun rol sırasını ve Manage Roles yetkisini kontrol edin."
                );
            }
        }

        // ==================================================
        // DEĞER VER
        // ==================================================

        if (command === ".dver") {

            // Sadece değer yetkilisi
            if (
                !isValueOfficial(
                    message.member
                )
            ) {
                return message.reply(
                    "❌ Bu komutu sadece **Değer Yetkilisi** kullanabilir."
                );
            }

            const target =
                getMentionedMember(
                    message
                );

            if (!target) {
                return message.reply(
                    "❌ Kullanım: `.dver @oyuncu 5`"
                );
            }

            const amount =
                Number(args[2]);

            if (
                !Number.isFinite(amount) ||
                amount <= 0
            ) {
                return message.reply(
                    "❌ Geçerli bir miktar gir.\nÖrnek: `.dver @oyuncu 5`"
                );
            }

            const result =
                await changePlayerValue(
                    target,
                    amount
                );

            if (!result.success) {

                if (
                    result.reason ===
                    "VALUE_NOT_FOUND"
                ) {
                    return message.reply(
                        "❌ Oyuncunun takma adının sonunda `M€` değeri bulunamadı."
                    );
                }

                if (
                    result.reason ===
                    "TOO_LONG"
                ) {
                    return message.reply(
                        "❌ Yeni takma ad Discord'un 32 karakter sınırını aşıyor."
                    );
                }

                return message.reply(
                    "❌ Oyuncunun değeri değiştirilemedi."
                );
            }

            const match =
                result.nickname.match(
                    /(\d+(?:[.,]\d+)?)M€\s*$/i
                );

            const newValue =
                match
                    ? match[1]
                    : "0";

            return message.reply(
                `💰 ${target} değerine **+${amount}M€** eklendi.\n` +
                `🏷️ Yeni değer: **${newValue}M€**`
            );
        }

        // ==================================================
        // DEĞER SİL
        // ==================================================

        if (command === ".dsil") {

            if (
                !isValueOfficial(
                    message.member
                )
            ) {
                return message.reply(
                    "❌ Bu komutu sadece **Değer Yetkilisi** kullanabilir."
                );
            }

            const target =
                getMentionedMember(
                    message
                );

            if (!target) {
                return message.reply(
                    "❌ Kullanım: `.dsil @oyuncu 5`"
                );
            }

            const amount =
                Number(args[2]);

            if (
                !Number.isFinite(amount) ||
                amount <= 0
            ) {
                return message.reply(
                    "❌ Geçerli bir miktar gir.\nÖrnek: `.dsil @oyuncu 5`"
                );
            }

            const result =
                await changePlayerValue(
                    target,
                    -amount
                );

            if (!result.success) {

                if (
                    result.reason ===
                    "VALUE_NOT_FOUND"
                ) {
                    return message.reply(
                        "❌ Oyuncunun takma adının sonunda `M€` değeri bulunamadı."
                    );
                }

                if (
                    result.reason ===
                    "TOO_LONG"
                ) {
                    return message.reply(
                        "❌ Yeni takma ad Discord'un 32 karakter sınırını aşıyor."
                    );
                }

                return message.reply(
                    "❌ Oyuncunun değeri değiştirilemedi."
                );
            }

            const match =
                result.nickname.match(
                    /(\d+(?:[.,]\d+)?)M€\s*$/i
                );

            const newValue =
                match
                    ? match[1]
                    : "0";

            return message.reply(
                `💰 ${target} değerinden **-${amount}M€** silindi.\n` +
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

            if (
                message.channel.id !==
                CHANNELS.ANTRENMAN
            ) {
                return message.reply(
                    "❌ Bu komut sadece antrenman kanalında kullanılabilir."
                );
            }

            if (
                !isRegistered(
                    message.member
                )
            ) {
                return message.reply(
                    "❌ Önce kayıt olmalısın."
                );
            }

            const userId =
                message.author.id;

            if (
                !data.training[userId]
            ) {
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
                    `🎯 Kalan: **${5 - progress} antrenman**`
                );
            }

            // 5/5
            const reward =
                await changePlayerValue(
                    message.member,
                    5
                );

            // Değer verilemezse ilerlemeyi kaybetme
            if (!reward.success) {

                data.training[userId] = 4;
                saveData();

                return message.reply(
                    `🏋️ **5/5 antrenman tamamlandı!**\n\n` +
                    `⚠️ Ancak +5M€ ödülü verilemedi.\n` +
                    `İlerlemen **4/5** olarak korundu.`
                );
            }

            // Sıfırla
            data.training[userId] = 0;
            saveData();

            const match =
                reward.nickname.match(
                    /(\d+(?:[.,]\d+)?)M€\s*$/i
                );

            const newValue =
                match
                    ? match[1]
                    : "0";

            return message.reply(
                `🏆 **ANTRENMAN TAMAMLANDI!**\n\n` +
                `📊 İlerleme: **5/5**\n` +
                `💰 Ödül: **+5M€**\n` +
                `🏷️ Yeni değer: **${newValue}M€**`
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
                CHANNELS.PENALTI
            ) {
                return message.reply(
                    "❌ Bu komut sadece penaltı kanalında kullanılabilir."
                );
            }

            if (
                !isRegistered(
                    message.member
                )
            ) {
                return message.reply(
                    "❌ Önce kayıt olmalısın."
                );
            }

            /*
             * 3 EŞİT İHTİMAL
             *
             * 0 = GOL
             * 1 = DİREK
             * 2 = NPC KALECİ KURTARDI
             */

            const result =
                Math.floor(
                    Math.random() * 3
                );

            // GOL
            if (result === 0) {

                const reward =
                    await changePlayerValue(
                        message.member,
                        5
                    );

                if (!reward.success) {

                    return message.reply(
                        `⚽ **GOOOL!**\n\n` +
                        `👤 Oyuncu: ${message.member}\n` +
                        `🧤 Kaleci: **Axera Kalecisi (NPC)**\n` +
                        `⚠️ Ancak +5M€ verilemedi.`
                    );
                }

                const match =
                    reward.nickname.match(
                        /(\d+(?:[.,]\d+)?)M€\s*$/i
                    );

                const newValue =
                    match
                        ? match[1]
                        : "0";

                return message.reply(
                    `⚽ **GOOOOOL!**\n\n` +
                    `👤 Oyuncu: ${message.member}\n` +
                    `🧤 Kaleci: **Axera Kalecisi (NPC)**\n` +
                    `💰 Ödül: **+5M€**\n` +
                    `🏷️ Yeni değer: **${newValue}M€**`
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
                `🧤 Kaleci: **Axera Kalecisi (NPC)**\n` +
                `💰 Kazanç: **0M€**`
            );
        }

        // ==================================================
        // TWEET
        // ==================================================

        if (command === ".tweet") {

            const tweetText =
                args
                    .slice(1)
                    .join(" ")
                    .trim();

            if (!tweetText) {
                return message.reply(
                    "❌ Kullanım: `.tweet Tweet mesajı`"
                );
            }

            const embed =
                new EmbedBuilder()
                    .setAuthor({
                        name:
                            message.member.displayName ||
                            message.author.username,
                        iconURL:
                            message.author.displayAvatarURL({
                                dynamic: true
                            })
                    })
                    .setDescription(
                        tweetText
                    )
                    .setFooter({
                        text:
                            "Axera League • Tweet"
                    })
                    .setTimestamp();

            return message.channel.send({
                embeds: [embed]
            });
        }
    }
);

// ======================================================
// HATA YAKALAMA
// ======================================================

process.on(
    "unhandledRejection",
    (error) => {
        console.error(
            "Unhandled Rejection:",
            error
        );
    }
);

process.on(
    "uncaughtException",
    (error) => {
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
