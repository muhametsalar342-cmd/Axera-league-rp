// ============================================================
// AXERA LEAGUE BOT
// Sistemler:
// .k @oyuncu TakmaAdı
// .ant / .antrenman
// .pen / .penaltı
// .dver @oyuncu sayı
// .dsil @oyuncu sayı
//
// Discord.js v14
// ============================================================

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

// ============================================================
// AYARLAR
// ============================================================

const TOKEN = process.env.TOKEN || "BURAYA_BOT_TOKENINI_YAZ";

// Roller
const ROLES = {
    FUTBOLCU: "1534457228986421278",
    KALECI: "1534492034243498195",
    KAYITSIZ: "1534457560134844517",
    TEKNIK_DIREKTOR: "1534456648930693120",
    KAYIT_YETKILISI: "1534456315366342716",
    DEGER_YETKILISI: "1534456192913375382"
};

// Kanallar
const CHANNELS = {
    KAYIT: "1534460177884123276",
    SOHBET: "1534469475917758586",
    ANTRENMAN: "1534474070798762197",
    PENALTI: "1534474327812997192"
};

// Ekonomi
const ANTRENMAN_GEREKEN = 5;
const ANTRENMAN_ODULU = 5;
const PENALTI_ODULU = 5;

// ============================================================
// CLIENT
// ============================================================

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

// ============================================================
// VERİ DOSYASI
// ============================================================

const DATA_FILE = path.join(__dirname, "data.json");

let data = {
    training: {},
    registration: {}
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
            registration: parsed.registration || {}
        };
    } catch (error) {
        console.error("data.json okunurken hata:", error);

        data = {
            training: {},
            registration: {}
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
        console.error("Veri kaydedilemedi:", error);
    }
}

loadData();

// ============================================================
// YARDIMCI FONKSİYONLAR
// ============================================================

function isRegistrationStaff(member) {
    if (!member) return false;

    return (
        member.permissions.has(PermissionsBitField.Flags.Administrator) ||
        member.roles.cache.has(ROLES.KAYIT_YETKILISI)
    );
}

function isValueStaff(member) {
    if (!member) return false;

    return (
        member.permissions.has(PermissionsBitField.Flags.Administrator) ||
        member.roles.cache.has(ROLES.DEGER_YETKILISI)
    );
}

function formatMoney(number) {
    return `${number}M€`;
}

function getMoneyFromNickname(nickname) {
    if (!nickname) return 0;

    // Nickin en sonunda bulunan:
    // 1M€
    // 10M€
    // 100M€
    // 1.5M€
    // gibi değerleri yakalar.
    const match = nickname.match(/(\d+(?:[.,]\d+)?)M€\s*$/i);

    if (!match) return 0;

    const value = Number(match[1].replace(",", "."));

    if (Number.isNaN(value)) {
        return 0;
    }

    return value;
}

function setMoneyInNickname(nickname, newValue) {
    const money = formatMoney(newValue);

    if (/\d+(?:[.,]\d+)?M€\s*$/i.test(nickname)) {
        return nickname.replace(
            /\d+(?:[.,]\d+)?M€\s*$/i,
            money
        );
    }

    return `${nickname} | ${money}`;
}

async function changePlayerValue(member, amount) {
    if (!member) {
        return {
            success: false,
            reason: "Oyuncu bulunamadı."
        };
    }

    const oldNickname =
        member.nickname ||
        member.user.displayName ||
        member.user.username;

    const oldValue = getMoneyFromNickname(oldNickname);

    let newValue = oldValue + amount;

    // Değer 0'ın altına inemez.
    if (newValue < 0) {
        newValue = 0;
    }

    const newNickname = setMoneyInNickname(
        oldNickname,
        newValue
    );

    try {
        if (newNickname !== oldNickname) {
            await member.setNickname(
                newNickname,
                "Axera League değer sistemi"
            );
        }

        return {
            success: true,
            oldValue,
            newValue,
            oldNickname,
            newNickname
        };
    } catch (error) {
        console.error("Nick değiştirilemedi:", error);

        return {
            success: false,
            reason:
                "Oyuncunun takma adı değiştirilemedi. Botun rolü yeterince yukarıda olmayabilir."
        };
    }
}

function getTraining(userId) {
    if (!data.training[userId]) {
        data.training[userId] = 0;
    }

    return data.training[userId];
}

function setTraining(userId, value) {
    data.training[userId] = value;
    saveData();
}

function cleanName(name) {
    return name
        .replace(/\|/g, "")
        .replace(/@everyone/g, "")
        .replace(/@here/g, "")
        .trim();
}

// ============================================================
// BOT HAZIR
// ============================================================

client.once("ready", () => {
    console.log("==========================================");
    console.log("       AXERA LEAGUE BOT AKTİF");
    console.log("==========================================");
    console.log(`Bot: ${client.user.tag}`);
    console.log(`Sunucu sayısı: ${client.guilds.cache.size}`);

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

// ============================================================
// YENİ ÜYE GİRİŞİ
// ============================================================

client.on("guildMemberAdd", async (member) => {
    try {
        const channel = member.guild.channels.cache.get(
            CHANNELS.KAYIT
        );

        if (!channel) {
            console.log("Kayıt kanalı bulunamadı.");
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle("👋 Axera League'e Hoş Geldin!")
            .setDescription(
                `**${member}** sunucumuza yeni katıldı!\n\n` +
                `📝 Kayıt işlemi için lütfen bekleyin.\n` +
                `🔔 Kayıt yetkilimiz sizinle ilgilenecektir.\n\n` +
                `<@&${ROLES.KAYIT_YETKILISI}>`
            )
            .setThumbnail(member.user.displayAvatarURL({
                extension: "png",
                size: 256
            }))
            .setFooter({
                text: "Axera League • Kayıt Sistemi"
            })
            .setTimestamp();

        await channel.send({
            content: `<@&${ROLES.KAYIT_YETKILISI}>`,
            embeds: [embed],
            allowedMentions: {
                roles: [ROLES.KAYIT_YETKILISI],
                users: [member.id]
            }
        });

    } catch (error) {
        console.error("Yeni üye mesajında hata:", error);
    }
});

// ============================================================
// MESAJ SİSTEMLERİ
// ============================================================

client.on("messageCreate", async (message) => {
    try {
        if (message.author.bot) return;
        if (!message.guild) return;

        const content = message.content.trim();

        // ====================================================
        // .ANT / .ANTRENMAN
        // ====================================================

        if (
            content === ".ant" ||
            content === ".antrenman"
        ) {
            if (message.channel.id !== CHANNELS.ANTRENMAN) {
                return message.reply({
                    content:
                        "❌ Bu komut sadece <#" +
                        CHANNELS.ANTRENMAN +
                        "> kanalında kullanılabilir."
                });
            }

            const member = message.member;

            // Sadece kayıtlı oyuncular kullanabilsin.
            const registered =
                member.roles.cache.has(ROLES.FUTBOLCU) ||
                member.roles.cache.has(ROLES.KALECI) ||
                member.roles.cache.has(ROLES.TEKNIK_DIREKTOR);

            if (!registered) {
                return message.reply({
                    content:
                        "❌ Önce kayıt olman gerekiyor."
                });
            }

            let progress = getTraining(member.id);

            progress++;

            if (progress < ANTRENMAN_GEREKEN) {
                setTraining(member.id, progress);

                const embed = new EmbedBuilder()
                    .setTitle("🏋️ Antrenman")
                    .setDescription(
                        `**${member}** antrenman yaptı!\n\n` +
                        `📊 İlerleme: **${progress}/${ANTRENMAN_GEREKEN}**\n` +
                        `🎁 Tamamlamak için **${ANTRENMAN_GEREKEN - progress}** antrenman kaldı.`
                    )
                    .setFooter({
                        text: "Axera League • Antrenman Sistemi"
                    })
                    .setTimestamp();

                return message.reply({
                    embeds: [embed]
                });
            }

            // 5/5 TAMAMLANDI
            setTraining(member.id, 0);

            const result = await changePlayerValue(
                member,
                ANTRENMAN_ODULU
            );

            if (!result.success) {
                // Değer verilemediyse ilerlemeyi tekrar 4/5'e çek.
                setTraining(
                    member.id,
                    ANTRENMAN_GEREKEN - 1
                );

                return message.reply({
                    content: `❌ ${result.reason}\n\n` +
                        `İlerlemen **4/5** olarak korundu.`
                });
            }

            const embed = new EmbedBuilder()
                .setTitle("🎉 Antrenman Tamamlandı!")
                .setDescription(
                    `**${member}** antrenmanı tamamladı!\n\n` +
                    `🏋️ İlerleme: **5/5**\n` +
                    `💰 Kazanç: **+${ANTRENMAN_ODULU}M€**\n` +
                    `💎 Yeni değer: **${formatMoney(result.newValue)}**\n\n` +
                    `🔄 Yeni antrenman serisi başladı: **0/5**`
                )
                .setFooter({
                    text: "Axera League • Antrenman Sistemi"
                })
                .setTimestamp();

            return message.reply({
                embeds: [embed]
            });
        }

        // ====================================================
        // .PEN / .PENALTI
        // ====================================================

        if (
            content === ".pen" ||
            content === ".penaltı" ||
            content === ".penalti"
        ) {
            if (message.channel.id !== CHANNELS.PENALTI) {
                return message.reply({
                    content:
                        "❌ Bu komut sadece <#" +
                        CHANNELS.PENALTI +
                        "> kanalında kullanılabilir."
                });
            }

            const member = message.member;

            const registered =
                member.roles.cache.has(ROLES.FUTBOLCU) ||
                member.roles.cache.has(ROLES.KALECI) ||
                member.roles.cache.has(ROLES.TEKNIK_DIREKTOR);

            if (!registered) {
                return message.reply({
                    content:
                        "❌ Önce kayıt olman gerekiyor."
                });
            }

            const result = await changePlayerValue(
                member,
                PENALTI_ODULU
            );

            if (!result.success) {
                return message.reply({
                    content: `❌ ${result.reason}`
                });
            }

            const embed = new EmbedBuilder()
                .setTitle("⚽ GOOOOL!")
                .setDescription(
                    `**${member}** penaltıyı kullandı!\n\n` +
                    `🥅 Kaleci: **Yok**\n` +
                    `⚽ Sonuç: **GOL!**\n` +
                    `💰 Kazanç: **+${PENALTI_ODULU}M€**\n` +
                    `💎 Yeni değer: **${formatMoney(result.newValue)}**`
                )
                .setFooter({
                    text: "Axera League • Penaltı Sistemi"
                })
                .setTimestamp();

            return message.reply({
                embeds: [embed]
            });
        }

        // ====================================================
        // .DVER
        // ====================================================

        if (content.startsWith(".dver ")) {
            if (!isValueStaff(message.member)) {
                return message.reply({
                    content:
                        "❌ Bu komutu sadece **Değer Yetkilisi** kullanabilir."
                });
            }

            const args = content.split(/\s+/);

            if (args.length < 3) {
                return message.reply({
                    content:
                        "❌ Kullanım: `.dver @oyuncu 5`"
                });
            }

            const target =
                message.mentions.members.first();

            if (!target) {
                return message.reply({
                    content:
                        "❌ Bir oyuncu etiketlemelisin."
                });
            }

            const amount = Number(args[2]);

            if (
                !Number.isFinite(amount) ||
                !Number.isInteger(amount) ||
                amount <= 0
            ) {
                return message.reply({
                    content:
                        "❌ Değer miktarı pozitif bir sayı olmalıdır.\nÖrnek: `.dver @oyuncu 5`"
                });
            }

            const result = await changePlayerValue(
                target,
                amount
            );

            if (!result.success) {
                return message.reply({
                    content: `❌ ${result.reason}`
                });
            }

            const embed = new EmbedBuilder()
                .setTitle("💰 Değer Güncellendi")
                .setDescription(
                    `👤 Oyuncu: ${target}\n` +
                    `📈 Eklenen: **+${amount}M€**\n` +
                    `💎 Eski değer: **${formatMoney(result.oldValue)}**\n` +
                    `💎 Yeni değer: **${formatMoney(result.newValue)}**\n\n` +
                    `🛠️ İşlem yapan: ${message.author}`
                )
                .setFooter({
                    text: "Axera League • Değer Sistemi"
                })
                .setTimestamp();

            return message.reply({
                embeds: [embed]
            });
        }

        // ====================================================
        // .DSIL
        // ====================================================

        if (content.startsWith(".dsil ")) {
            if (!isValueStaff(message.member)) {
                return message.reply({
                    content:
                        "❌ Bu komutu sadece **Değer Yetkilisi** kullanabilir."
                });
            }

            const args = content.split(/\s+/);

            if (args.length < 3) {
                return message.reply({
                    content:
                        "❌ Kullanım: `.dsil @oyuncu 5`"
                });
            }

            const target =
                message.mentions.members.first();

            if (!target) {
                return message.reply({
                    content:
                        "❌ Bir oyuncu etiketlemelisin."
                });
            }

            const amount = Number(args[2]);

            if (
                !Number.isFinite(amount) ||
                !Number.isInteger(amount) ||
                amount <= 0
            ) {
                return message.reply({
                    content:
                        "❌ Değer miktarı pozitif bir sayı olmalıdır.\nÖrnek: `.dsil @oyuncu 5`"
                });
            }

            const result = await changePlayerValue(
                target,
                -amount
            );

            if (!result.success) {
                return message.reply({
                    content: `❌ ${result.reason}`
                });
            }

            const embed = new EmbedBuilder()
                .setTitle("💸 Değer Azaltıldı")
                .setDescription(
                    `👤 Oyuncu: ${target}\n` +
                    `📉 Silinen: **-${amount}M€**\n` +
                    `💎 Eski değer: **${formatMoney(result.oldValue)}**\n` +
                    `💎 Yeni değer: **${formatMoney(result.newValue)}**\n\n` +
                    `🛠️ İşlem yapan: ${message.author}`
                )
                .setFooter({
                    text: "Axera League • Değer Sistemi"
                })
                .setTimestamp();

            return message.reply({
                embeds: [embed]
            });
        }

        // ====================================================
        // .K KAYIT
        // ====================================================

        if (content.startsWith(".k ")) {
            if (message.channel.id !== CHANNELS.KAYIT) {
                return message.reply({
                    content:
                        "❌ Bu komut sadece <#" +
                        CHANNELS.KAYIT +
                        "> kanalında kullanılabilir."
                });
            }

            if (!isRegistrationStaff(message.member)) {
                return message.reply({
                    content:
                        "❌ Bu komutu sadece **Kayıt Yetkilisi** kullanabilir."
                });
            }

            const target =
                message.mentions.members.first();

            if (!target) {
                return message.reply({
                    content:
                        "❌ Bir oyuncu etiketlemelisin.\n\n" +
                        "Örnek: `.k @Oyuncu W.Sneijder`"
                });
            }

            // Mention sonrasındaki yazıyı alıyoruz.
            let nickname = content
                .replace(/^\.k\s+/i, "")
                .replace(`<@${target.id}>`, "")
                .replace(`<@!${target.id}>`, "")
                .trim();

            if (!nickname) {
                return message.reply({
                    content:
                        "❌ Takma adını da yazmalısın.\n\n" +
                        "Örnek: `.k @Oyuncu W.Sneijder`"
                });
            }

            nickname = cleanName(nickname);

            if (!nickname) {
                return message.reply({
                    content:
                        "❌ Geçerli bir takma adı yazmalısın."
                });
            }

            // Discord nick limiti
            if (nickname.length > 28) {
                nickname = nickname.substring(0, 28);
            }

            // Önceki kayıt butonlarının ID'si:
            const registrationId =
                `${target.id}_${Date.now()}`;

            if (!data.registration) {
                data.registration = {};
            }

            data.registration[registrationId] = {
                targetId: target.id,
                staffId: message.author.id,
                nickname: nickname,
                createdAt: Date.now()
            };

            saveData();

            const embed = new EmbedBuilder()
                .setTitle("📝 Axera League Kayıt")
                .setDescription(
                    `👤 Oyuncu: ${target}\n` +
                    `🏷️ Takma Adı: **${nickname}**\n\n` +
                    `Oyuncunun görevini seçmek için aşağıdaki butonlardan birine basın.`
                )
                .addFields(
                    {
                        name: "🔵 Futbolcu",
                        value: "Futbolcu rolünü verir.",
                        inline: true
                    },
                    {
                        name: "🟢 Kaleci",
                        value: "Kaleci rolünü verir.",
                        inline: true
                    },
                    {
                        name: "🟠 Teknik Direktör",
                        value: "Teknik Direktör rolünü verir.",
                        inline: true
                    }
                )
                .setFooter({
                    text: "Axera League • Kayıt Sistemi"
                })
                .setTimestamp();

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            `kayit_futbolcu_${registrationId}`
                        )
                        .setLabel("Futbolcu")
                        .setEmoji("⚽")
                        .setStyle(ButtonStyle.Primary),

                    new ButtonBuilder()
                        .setCustomId(
                            `kayit_kaleci_${registrationId}`
                        )
                        .setLabel("Kaleci")
                        .setEmoji("🧤")
                        .setStyle(ButtonStyle.Success),

                    new ButtonBuilder()
                        .setCustomId(
                            `kayit_td_${registrationId}`
                        )
                        .setLabel("Teknik Direktör")
                        .setEmoji("📋")
                        .setStyle(ButtonStyle.Secondary)
                );

            return message.channel.send({
                embeds: [embed],
                components: [row]
            });
        }

    } catch (error) {
        console.error("messageCreate hatası:", error);

        try {
            if (!message.replied && !message.deferred) {
                await message.reply({
                    content:
                        "❌ İşlem sırasında beklenmeyen bir hata oluştu."
                });
            }
        } catch {}
    }
});

// ============================================================
// KAYIT BUTONLARI
// ============================================================

client.on("interactionCreate", async (interaction) => {
    try {
        if (!interaction.isButton()) return;

        const customId = interaction.customId;

        if (!customId.startsWith("kayit_")) {
            return;
        }

        const parts = customId.split("_");

        if (parts.length < 3) {
            return interaction.reply({
                content:
                    "❌ Geçersiz kayıt işlemi.",
                ephemeral: true
            });
        }

        const type = parts[1];
        const registrationId =
            parts.slice(2).join("_");

        const registration =
            data.registration[registrationId];

        if (!registration) {
            return interaction.reply({
                content:
                    "❌ Bu kayıt işleminin süresi dolmuş veya kayıt zaten tamamlanmış.",
                ephemeral: true
            });
        }

        // Sadece kayıt işlemini başlatan yetkili
        // veya kayıt yetkilisi/administrator kullanabilir.
        const clicker = interaction.member;

        if (!isRegistrationStaff(clicker)) {
            return interaction.reply({
                content:
                    "❌ Bu butonu sadece Kayıt Yetkilisi kullanabilir.",
                ephemeral: true
            });
        }

        const guild = interaction.guild;

        if (!guild) {
            return interaction.reply({
                content:
                    "❌ Sunucu bulunamadı.",
                ephemeral: true
            });
        }

        const target =
            await guild.members.fetch(
                registration.targetId
            ).catch(() => null);

        if (!target) {
            delete data.registration[registrationId];
            saveData();

            return interaction.reply({
                content:
                    "❌ Oyuncu artık sunucuda bulunmuyor.",
                ephemeral: true
            });
        }

        let roleId;
        let roleName;

        if (type === "futbolcu") {
            roleId = ROLES.FUTBOLCU;
            roleName = "Futbolcu";
        }

        if (type === "kaleci") {
            roleId = ROLES.KALECI;
            roleName = "Kaleci";
        }

        if (type === "td") {
            roleId = ROLES.TEKNIK_DIREKTOR;
            roleName = "Teknik Direktör";
        }

        if (!roleId) {
            return interaction.reply({
                content:
                    "❌ Geçersiz rol seçimi.",
                ephemeral: true
            });
        }

        const role = guild.roles.cache.get(roleId);

        if (!role) {
            return interaction.reply({
                content:
                    "❌ Seçilen rol bulunamadı. Rol ID'sini kontrol et.",
                ephemeral: true
            });
        }

        // Önce eski görev rollerini kaldır.
        const oldRoles = [
            ROLES.FUTBOLCU,
            ROLES.KALECI,
            ROLES.TEKNIK_DIREKTOR
        ];

        for (const oldRoleId of oldRoles) {
            if (target.roles.cache.has(oldRoleId)) {
                await target.roles.remove(
                    oldRoleId,
                    "Axera League kayıt sistemi"
                ).catch(() => {});
            }
        }

        // Kayıtsız rolünü kaldır.
        if (target.roles.cache.has(ROLES.KAYITSIZ)) {
            await target.roles.remove(
                ROLES.KAYITSIZ,
                "Oyuncu kaydı tamamlandı"
            ).catch(() => {});
        }

        // Seçilen rolü ver.
        await target.roles.add(
            role,
            "Axera League kayıt sistemi"
        );

        // Kayıt sırasında sadece takma adı ayarla.
        // Eğer nickte değer varsa korunur.
        const oldNickname =
            target.nickname ||
            target.user.displayName ||
            target.user.username;

        const existingValue =
            getMoneyFromNickname(oldNickname);

        let finalNickname =
            `${registration.nickname} | ${formatMoney(existingValue)}`;

        if (finalNickname.length > 32) {
            finalNickname =
                finalNickname.substring(0, 32);
        }

        await target.setNickname(
            finalNickname,
            "Axera League oyuncu kaydı"
        ).catch(() => {});

        // Kayıt verisini sil.
        delete data.registration[registrationId];
        saveData();

        // Butonları kapat.
        const disabledRow =
            new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            `kayit_tamamlandi_${registrationId}`
                        )
                        .setLabel(`${roleName} • Kayıt Tamamlandı`)
                        .setEmoji("✅")
                        .setStyle(ButtonStyle.Success)
                        .setDisabled(true)
                );

        const resultEmbed =
            new EmbedBuilder()
                .setTitle("✅ Kayıt Tamamlandı")
                .setDescription(
                    `👤 Oyuncu: ${target}\n` +
                    `🏷️ Takma Adı: **${registration.nickname}**\n` +
                    `🎭 Seçilen rol: **${roleName}**\n` +
                    `🛠️ Kayıt yetkilisi: ${interaction.user}`
                )
                .setFooter({
                    text: "Axera League • Kayıt Sistemi"
                })
                .setTimestamp();

        await interaction.update({
            embeds: [resultEmbed],
            components: [disabledRow]
        });

        // ====================================================
        // SOHBET KANALINA KAYIT MESAJI
        // ====================================================

        const chatChannel =
            guild.channels.cache.get(
                CHANNELS.SOHBET
            );

        if (chatChannel) {
            const chatEmbed =
                new EmbedBuilder()
                    .setTitle("🎉 Yeni Oyuncu Kaydı!")
                    .setDescription(
                        `Axera League ailesine yeni bir oyuncu katıldı!\n\n` +
                        `👤 Oyuncu: ${target}\n` +
                        `🏷️ Takma Adı: **${registration.nickname}**\n` +
                        `🎭 Rolü: **${roleName}**\n` +
                        `📝 Kayıt Yetkilisi: ${interaction.user}\n\n` +
                        `🏆 **Axera League'e hoş geldin!**`
                    )
                    .setThumbnail(
                        target.user.displayAvatarURL({
                            extension: "png",
                            size: 256
                        })
                    )
                    .setFooter({
                        text: "Axera League • Kayıt Sistemi"
                    })
                    .setTimestamp();

            await chatChannel.send({
                embeds: [chatEmbed],
                allowedMentions: {
                    users: [target.id]
                }
            }).catch((error) => {
                console.error(
                    "Sohbet kayıt mesajı gönderilemedi:",
                    error
                );
            });
        }

    } catch (error) {
        console.error(
            "interactionCreate hatası:",
            error
        );

        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content:
                        "❌ Kayıt işlemi sırasında bir hata oluştu.",
                    ephemeral: true
                });
            }
        } catch {}
    }
});

// ============================================================
// HATA YAKALAMA
// ============================================================

process.on("unhandledRejection", (error) => {
    console.error(
        "Yakalanmamış Promise hatası:",
        error
    );
});

process.on("uncaughtException", (error) => {
    console.error(
        "Yakalanmamış sistem hatası:",
        error
    );
});

// ============================================================
// LOGIN
// ============================================================

client.login(TOKEN);
