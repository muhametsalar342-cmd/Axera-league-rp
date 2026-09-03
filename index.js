// ============================================================
// AXERA LEAGUE DISCORD BOT
// Discord.js v14
// ============================================================
//
// KOMUTLAR
//
// .yardım
// .k @oyuncu TakmaAdı
// .ant
// .antrenman
// .pen
// .penaltı
// .dver @oyuncu 5
// .dsil @oyuncu 5
//
// SİSTEMLER
// - Kayıt sistemi
// - Futbolcu / Kaleci / Teknik Direktör butonları
// - Yeni üye karşılama
// - Antrenman 5/5 = +5M€
// - Penaltı NPC kaleci
// - %20 gol / %40 direk / %40 kurtarış
// - Gol = +5M€
// - Değer verme
// - Değer silme
// - Yardım komutu
//
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
// TOKEN
// ============================================================

const TOKEN = process.env.TOKEN || "BURAYA_BOT_TOKENINI_YAZ";

// ============================================================
// ROLLER
// ============================================================

const ROLES = {
    FUTBOLCU: "1534457228986421278",
    KALECI: "1534492034243498195",
    KAYITSIZ: "1534457560134844517",
    TEKNIK_DIREKTOR: "1534456648930693120",
    KAYIT_YETKILISI: "1534456315366342716",
    DEGER_YETKILISI: "1534456192913375382"
};

// ============================================================
// KANALLAR
// ============================================================

const CHANNELS = {
    KAYIT: "1534460177884123276",
    SOHBET: "1534469475917758586",
    ANTRENMAN: "1534474070798762197",
    PENALTI: "1534474327812997192"
};

// ============================================================
// SİSTEM AYARLARI
// ============================================================

const TRAINING_MAX = 5;
const TRAINING_REWARD = 5;
const PENALTY_REWARD = 5;

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
    registrations: {}
};

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

function loadData() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            saveData();
            return;
        }

        const file = fs.readFileSync(
            DATA_FILE,
            "utf8"
        );

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
        console.error("data.json okunamadı:", error);

        data = {
            training: {},
            registrations: {}
        };

        saveData();
    }
}

loadData();

// ============================================================
// YARDIMCI FONKSİYONLAR
// ============================================================

function isAdmin(member) {
    if (!member) return false;

    return member.permissions.has(
        PermissionsBitField.Flags.Administrator
    );
}

function isRegistrationStaff(member) {
    if (!member) return false;

    return (
        isAdmin(member) ||
        member.roles.cache.has(
            ROLES.KAYIT_YETKILISI
        )
    );
}

function isValueStaff(member) {
    if (!member) return false;

    return (
        isAdmin(member) ||
        member.roles.cache.has(
            ROLES.DEGER_YETKILISI
        )
    );
}

// ============================================================
// PARA
// ============================================================

function formatMoney(value) {
    if (!Number.isFinite(value)) {
        value = 0;
    }

    // Tam sayı olarak gösteriyoruz.
    if (Number.isInteger(value)) {
        return `${value}M€`;
    }

    return `${value.toFixed(2)}M€`;
}

// ============================================================
// NICK'TEN DEĞER OKUMA
// ============================================================

function getPlayerValue(nickname) {
    if (!nickname) return 0;

    const match = nickname.match(
        /(\d+(?:[.,]\d+)?)M€\s*$/i
    );

    if (!match) {
        return 0;
    }

    const value = Number(
        match[1].replace(",", ".")
    );

    if (!Number.isFinite(value)) {
        return 0;
    }

    return value;
}

// ============================================================
// SADECE SON DEĞERİ DEĞİŞTİR
// ============================================================

function updateNicknameValue(
    nickname,
    newValue
) {
    const money = formatMoney(newValue);

    const valueRegex =
        /(\d+(?:[.,]\d+)?)M€\s*$/i;

    if (valueRegex.test(nickname)) {
        return nickname.replace(
            valueRegex,
            money
        );
    }

    return `${nickname} | ${money}`;
}

// ============================================================
// DEĞER DEĞİŞTİRME
// ============================================================

async function changePlayerValue(
    member,
    amount
) {
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

    const oldValue =
        getPlayerValue(oldNickname);

    let newValue =
        oldValue + amount;

    if (newValue < 0) {
        newValue = 0;
    }

    const newNickname =
        updateNicknameValue(
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
        console.error(
            "Nick değiştirilemedi:",
            error
        );

        return {
            success: false,
            reason:
                "Oyuncunun nicki değiştirilemedi. Bot rolünün yeterince yukarıda olduğundan emin ol."
        };
    }
}

// ============================================================
// ANTRENMAN VERİSİ
// ============================================================

function getTraining(userId) {
    if (
        typeof data.training[userId] !== "number"
    ) {
        data.training[userId] = 0;
    }

    return data.training[userId];
}

function setTraining(
    userId,
    value
) {
    data.training[userId] = value;
    saveData();
}

// ============================================================
// KAYITLI MI?
// ============================================================

function isRegistered(member) {
    if (!member) return false;

    return (
        member.roles.cache.has(
            ROLES.FUTBOLCU
        ) ||
        member.roles.cache.has(
            ROLES.KALECI
        ) ||
        member.roles.cache.has(
            ROLES.TEKNIK_DIREKTOR
        )
    );
}

// ============================================================
// BOT HAZIR
// ============================================================

client.once(
    "ready",
    () => {
        console.log(
            "======================================"
        );

        console.log(
            "       AXERA LEAGUE BOT AKTİF"
        );

        console.log(
            "======================================"
        );

        console.log(
            `Bot: ${client.user.tag}`
        );

        console.log(
            `Sunucu: ${client.guilds.cache.size}`
        );

        client.user.setPresence({
            activities: [
                {
                    name: "Axera League ⚽",
                    type: 3
                }
            ],
            status: "online"
        });
    }
);

// ============================================================
// YENİ ÜYE GELDİ
// ============================================================

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

            const embed =
                new EmbedBuilder()
                    .setTitle(
                        "👋 Axera League'e Hoş Geldin!"
                    )
                    .setDescription(
                        `🎉 ${member} sunucumuza katıldı!\n\n` +
                        `📝 Kayıt işlemin için lütfen bekle.\n` +
                        `🔔 Kayıt yetkilimiz seninle ilgilenecektir.\n\n` +
                        `<@&${ROLES.KAYIT_YETKILISI}>`
                    )
                    .setThumbnail(
                        member.user.displayAvatarURL({
                            extension: "png",
                            size: 256
                        })
                    )
                    .setFooter({
                        text:
                            "Axera League • Kayıt Sistemi"
                    })
                    .setTimestamp();

            await channel.send({
                content:
                    `<@&${ROLES.KAYIT_YETKILISI}>`,
                embeds: [embed],
                allowedMentions: {
                    roles: [
                        ROLES.KAYIT_YETKILISI
                    ],
                    users: [member.id]
                }
            });

        } catch (error) {
            console.error(
                "Yeni üye sisteminde hata:",
                error
            );
        }
    }
);

// ============================================================
// MESAJLAR
// ============================================================

client.on(
    "messageCreate",
    async (message) => {

        try {

            if (message.author.bot) return;
            if (!message.guild) return;

            const content =
                message.content.trim();

            // =================================================
            // YARDIM
            // =================================================

            if (
                content === ".yardım" ||
                content === ".yardim"
            ) {

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            "📚 Axera League • Yardım"
                        )
                        .setDescription(
                            "Axera League bot komutları aşağıdadır."
                        )

                        .addFields(
                            {
                                name:
                                    "📝 Kayıt",
                                value:
                                    "`.k @oyuncu TakmaAdı`\n" +
                                    "Futbolcu, Kaleci veya Teknik Direktör seçimi yapılır."
                            },

                            {
                                name:
                                    "🏋️ Antrenman",
                                value:
                                    "`.ant` veya `.antrenman`\n" +
                                    "Sadece Antrenman kanalında çalışır.\n" +
                                    "5/5 tamamlanınca **+5M€**."
                            },

                            {
                                name:
                                    "⚽ Penaltı",
                                value:
                                    "`.pen` veya `.penaltı`\n" +
                                    "Sadece Penaltı kanalında çalışır.\n" +
                                    "🟢 %20 Gol\n" +
                                    "🥅 %40 Direk\n" +
                                    "🧤 %40 NPC Kaleci kurtarışı\n" +
                                    "Gol = **+5M€**."
                            },

                            {
                                name:
                                    "💰 Değer Ver",
                                value:
                                    "`.dver @oyuncu 5`\n" +
                                    "Oyuncuya +5M€ verir.\n" +
                                    "Sadece Değer Yetkilisi."
                            },

                            {
                                name:
                                    "💸 Değer Sil",
                                value:
                                    "`.dsil @oyuncu 5`\n" +
                                    "Oyuncudan 5M€ siler.\n" +
                                    "Sadece Değer Yetkilisi."
                            }
                        )

                        .setColor(0x2b2d31)

                        .setFooter({
                            text:
                                "Axera League • Yardım Menüsü"
                        })

                        .setTimestamp();

                return message.reply({
                    embeds: [embed]
                });
            }

            // =================================================
            // ANTRENMAN
            // =================================================

            if (
                content === ".ant" ||
                content === ".antrenman"
            ) {

                if (
                    message.channel.id !==
                    CHANNELS.ANTRENMAN
                ) {
                    return message.reply({
                        content:
                            `❌ Bu komut sadece <#${CHANNELS.ANTRENMAN}> kanalında kullanılabilir.`
                    });
                }

                if (
                    !isRegistered(
                        message.member
                    )
                ) {
                    return message.reply({
                        content:
                            "❌ Önce kayıt olmalısın."
                    });
                }

                let progress =
                    getTraining(
                        message.author.id
                    );

                progress++;

                // 5/5 tamamlanmadıysa
                if (
                    progress <
                    TRAINING_MAX
                ) {

                    setTraining(
                        message.author.id,
                        progress
                    );

                    const embed =
                        new EmbedBuilder()
                            .setTitle(
                                "🏋️ Antrenman"
                            )
                            .setDescription(
                                `${message.member} antrenman yaptı!\n\n` +
                                `📊 İlerleme: **${progress}/${TRAINING_MAX}**\n` +
                                `🎯 Kalan: **${TRAINING_MAX - progress}**`
                            )
                            .setFooter({
                                text:
                                    "Axera League • Antrenman"
                            })
                            .setTimestamp();

                    return message.reply({
                        embeds: [embed]
                    });
                }

                // 5/5 TAMAMLANDI

                const result =
                    await changePlayerValue(
                        message.member,
                        TRAINING_REWARD
                    );

                if (!result.success) {

                    setTraining(
                        message.author.id,
                        4
                    );

                    return message.reply({
                        content:
                            `❌ ${result.reason}\n` +
                            `İlerlemen **4/5** olarak korundu.`
                    });
                }

                setTraining(
                    message.author.id,
                    0
                );

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            "🎉 Antrenman Tamamlandı!"
                        )
                        .setDescription(
                            `${message.member} antrenmanı tamamladı!\n\n` +
                            `🏋️ İlerleme: **5/5**\n` +
                            `💰 Ödül: **+5M€**\n` +
                            `💎 Yeni değer: **${formatMoney(result.newValue)}**\n\n` +
                            `🔄 Yeni seri: **0/5**`
                        )
                        .setFooter({
                            text:
                                "Axera League • Antrenman Sistemi"
                        })
                        .setTimestamp();

                return message.reply({
                    embeds: [embed]
                });
            }

            // =================================================
            // PENALTI
            // =================================================

            if (
                content === ".pen" ||
                content === ".penaltı" ||
                content === ".penalti"
            ) {

                if (
                    message.channel.id !==
                    CHANNELS.PENALTI
                ) {
                    return message.reply({
                        content:
                            `❌ Bu komut sadece <#${CHANNELS.PENALTI}> kanalında kullanılabilir.`
                    });
                }

                if (
                    !isRegistered(
                        message.member
                    )
                ) {
                    return message.reply({
                        content:
                            "❌ Önce kayıt olmalısın."
                    });
                }

                const shootingMessage =
                    await message.reply({
                        content:
                            `🧤 **Axera Kalecisi (NPC)** kalede!\n` +
                            `⚽ ${message.member} penaltıyı kullanıyor...`
                    });

                // Küçük bekleme
                await new Promise(
                    resolve =>
                        setTimeout(
                            resolve,
                            1200
                        )
                );

                const random =
                    Math.random() * 100;

                // %20 GOL
                if (random < 20) {

                    const result =
                        await changePlayerValue(
                            message.member,
                            PENALTY_REWARD
                        );

                    if (!result.success) {

                        return shootingMessage.edit({
                            content:
                                `🧤 **Axera Kalecisi (NPC)** kalede!\n` +
                                `⚽ ${message.member} şutunu çekti...\n\n` +
                                `⚽ **GOOOL!**\n` +
                                `💰 Ödül hesaplanırken hata oluştu: ${result.reason}`
                        });
                    }

                    return shootingMessage.edit({
                        content:
                            `🧤 **Axera Kalecisi (NPC)** kalede!\n` +
                            `⚽ ${message.member} şutunu çekti...\n\n` +
                            `🎯 **GOOOOL!** ⚽\n\n` +
                            `💰 Ödül: **+5M€**\n` +
                            `💎 Yeni değer: **${formatMoney(result.newValue)}**`
                    });
                }

                // %40 DİREK
                if (random < 60) {

                    return shootingMessage.edit({
                        content:
                            `🧤 **Axera Kalecisi (NPC)** kalede!\n` +
                            `⚽ ${message.member} şutunu çekti...\n\n` +
                            `🥅 **DİREK!**\n` +
                            `😱 Top direkten döndü!\n\n` +
                            `💰 Ödül: **0M€**`
                    });
                }

                // %40 KALECİ KURTARDI
                return shootingMessage.edit({
                    content:
                        `🧤 **Axera Kalecisi (NPC)** kalede!\n` +
                        `⚽ ${message.member} şutunu çekti...\n\n` +
                        `🧤 **KALECİ KURTARDI!**\n` +
                        `🚫 Axera Kalecisi gole izin vermedi.\n\n` +
                        `💰 Ödül: **0M€**`
                });
            }

            // =================================================
            // DVER
            // =================================================

            if (
                content.startsWith(".dver ")
            ) {

                if (
                    !isValueStaff(
                        message.member
                    )
                ) {
                    return message.reply({
                        content:
                            "❌ Bu komutu sadece **Değer Yetkilisi** kullanabilir."
                    });
                }

                const target =
                    message.mentions.members.first();

                if (!target) {
                    return message.reply({
                        content:
                            "❌ Oyuncuyu etiketlemelisin.\n" +
                            "Örnek: `.dver @oyuncu 5`"
                    });
                }

                const args =
                    content.split(/\s+/);

                const amount =
                    Number(args[2]);

                if (
                    !Number.isInteger(amount) ||
                    amount <= 0
                ) {
                    return message.reply({
                        content:
                            "❌ Sadece pozitif tam sayı yazmalısın.\n" +
                            "Örnek: `.dver @oyuncu 5`"
                    });
                }

                const result =
                    await changePlayerValue(
                        target,
                        amount
                    );

                if (!result.success) {
                    return message.reply({
                        content:
                            `❌ ${result.reason}`
                    });
                }

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            "💰 Değer Verildi"
                        )
                        .setDescription(
                            `👤 Oyuncu: ${target}\n` +
                            `📈 Eklenen: **+${amount}M€**\n` +
                            `💎 Eski değer: **${formatMoney(result.oldValue)}**\n` +
                            `💎 Yeni değer: **${formatMoney(result.newValue)}**\n\n` +
                            `🛠️ Yetkili: ${message.author}`
                        )
                        .setFooter({
                            text:
                                "Axera League • Değer Sistemi"
                        })
                        .setTimestamp();

                return message.reply({
                    embeds: [embed]
                });
            }

            // =================================================
            // DSIL
            // =================================================

            if (
                content.startsWith(".dsil ")
            ) {

                if (
                    !isValueStaff(
                        message.member
                    )
                ) {
                    return message.reply({
                        content:
                            "❌ Bu komutu sadece **Değer Yetkilisi** kullanabilir."
                    });
                }

                const target =
                    message.mentions.members.first();

                if (!target) {
                    return message.reply({
                        content:
                            "❌ Oyuncuyu etiketlemelisin.\n" +
                            "Örnek: `.dsil @oyuncu 5`"
                    });
                }

                const args =
                    content.split(/\s+/);

                const amount =
                    Number(args[2]);

                if (
                    !Number.isInteger(amount) ||
                    amount <= 0
                ) {
                    return message.reply({
                        content:
                            "❌ Sadece pozitif tam sayı yazmalısın.\n" +
                            "Örnek: `.dsil @oyuncu 5`"
                    });
                }

                const result =
                    await changePlayerValue(
                        target,
                        -amount
                    );

                if (!result.success) {
                    return message.reply({
                        content:
                            `❌ ${result.reason}`
                    });
                }

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            "💸 Değer Silindi"
                        )
                        .setDescription(
                            `👤 Oyuncu: ${target}\n` +
                            `📉 Silinen: **-${amount}M€**\n` +
                            `💎 Eski değer: **${formatMoney(result.oldValue)}**\n` +
                            `💎 Yeni değer: **${formatMoney(result.newValue)}**\n\n` +
                            `🛠️ Yetkili: ${message.author}`
                        )
                        .setFooter({
                            text:
                                "Axera League • Değer Sistemi"
                        })
                        .setTimestamp();

                return message.reply({
                    embeds: [embed]
                });
            }

            // =================================================
            // KAYIT
            // =================================================

            if (
                content.startsWith(".k ")
            ) {

                if (
                    message.channel.id !==
                    CHANNELS.KAYIT
                ) {
                    return message.reply({
                        content:
                            `❌ Bu komut sadece <#${CHANNELS.KAYIT}> kanalında kullanılabilir.`
                    });
                }

                if (
                    !isRegistrationStaff(
                        message.member
                    )
                ) {
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
                            "❌ Oyuncuyu etiketlemelisin.\n\n" +
                            "Örnek:\n" +
                            "`.k @Oyuncu W.Sneijder`"
                    });
                }

                let nickname =
                    content
                        .replace(
                            /^\.k\s+/i,
                            ""
                        )
                        .replace(
                            `<@${target.id}>`,
                            ""
                        )
                        .replace(
                            `<@!${target.id}>`,
                            ""
                        )
                        .trim();

                if (!nickname) {
                    return message.reply({
                        content:
                            "❌ Oyuncunun takma adını yazmalısın."
                    });
                }

                nickname =
                    nickname
                        .replace(
                            /\|/g,
                            ""
                        )
                        .replace(
                            /@everyone/gi,
                            ""
                        )
                        .replace(
                            /@here/gi,
                            ""
                        )
                        .trim();

                if (!nickname) {
                    return message.reply({
                        content:
                            "❌ Geçerli bir takma ad yaz."
                    });
                }

                // Discord maksimum nick uzunluğu
                if (
                    nickname.length > 26
                ) {
                    nickname =
                        nickname.substring(
                            0,
                            26
                        );
                }

                const registrationId =
                    `${target.id}_${Date.now()}`;

                data.registrations[
                    registrationId
                ] = {
                    targetId:
                        target.id,

                    nickname:
                        nickname,

                    staffId:
                        message.author.id,

                    createdAt:
                        Date.now()
                };

                saveData();

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            "📝 Axera League Kayıt"
                        )
                        .setDescription(
                            `👤 Oyuncu: ${target}\n` +
                            `🏷️ Takma Adı: **${nickname}**\n\n` +
                            `Oyuncunun görevini aşağıdaki butonlardan seç.`
                        )
                        .addFields(
                            {
                                name:
                                    "⚽ Futbolcu",
                                value:
                                    "Futbolcu rolü verilir.",
                                inline: true
                            },
                            {
                                name:
                                    "🧤 Kaleci",
                                value:
                                    "Kaleci rolü verilir.",
                                inline: true
                            },
                            {
                                name:
                                    "📋 Teknik Direktör",
                                value:
                                    "Teknik Direktör rolü verilir.",
                                inline: true
                            }
                        )
                        .setFooter({
                            text:
                                "Axera League • Kayıt Sistemi"
                        })
                        .setTimestamp();

                const row =
                    new ActionRowBuilder()
                        .addComponents(

                            new ButtonBuilder()
                                .setCustomId(
                                    `kayit_futbolcu_${registrationId}`
                                )
                                .setLabel(
                                    "Futbolcu"
                                )
                                .setEmoji(
                                    "⚽"
                                )
                                .setStyle(
                                    ButtonStyle.Primary
                                ),

                            new ButtonBuilder()
                                .setCustomId(
                                    `kayit_kaleci_${registrationId}`
                                )
                                .setLabel(
                                    "Kaleci"
                                )
                                .setEmoji(
                                    "🧤"
                                )
                                .setStyle(
                                    ButtonStyle.Success
                                ),

                            new ButtonBuilder()
                                .setCustomId(
                                    `kayit_td_${registrationId}`
                                )
                                .setLabel(
                                    "Teknik Direktör"
                                )
                                .setEmoji(
                                    "📋"
                                )
                                .setStyle(
                                    ButtonStyle.Secondary
                                )
                        );

                return message.channel.send({
                    embeds: [embed],
                    components: [row]
                });
            }

        } catch (error) {

            console.error(
                "messageCreate hatası:",
                error
            );

            try {

                if (
                    !message.replied &&
                    !message.deferred
                ) {
                    await message.reply({
                        content:
                            "❌ İşlem sırasında bir hata oluştu."
                    });
                }

            } catch {}
        }
    }
);

// ============================================================
// KAYIT BUTONLARI
// ============================================================

client.on(
    "interactionCreate",
    async (interaction) => {

        try {

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
                interaction.customId.split(
                    "_"
                );

            if (
                parts.length < 3
            ) {
                return interaction.reply({
                    content:
                        "❌ Geçersiz kayıt işlemi.",
                    ephemeral: true
                });
            }

            const type =
                parts[1];

            const registrationId =
                parts
                    .slice(2)
                    .join("_");

            const registration =
                data.registrations[
                    registrationId
                ];

            if (!registration) {
                return interaction.reply({
                    content:
                        "❌ Bu kayıt işlemi artık geçerli değil.",
                    ephemeral: true
                });
            }

            // Sadece kayıt yetkilileri buton kullanabilir.
            if (
                !isRegistrationStaff(
                    interaction.member
                )
            ) {
                return interaction.reply({
                    content:
                        "❌ Bu butonu sadece Kayıt Yetkilisi kullanabilir.",
                    ephemeral: true
                });
            }

            const guild =
                interaction.guild;

            if (!guild) {
                return interaction.reply({
                    content:
                        "❌ Sunucu bulunamadı.",
                    ephemeral: true
                });
            }

            const target =
                await guild.members
                    .fetch(
                        registration.targetId
                    )
                    .catch(
                        () => null
                    );

            if (!target) {

                delete data.registrations[
                    registrationId
                ];

                saveData();

                return interaction.reply({
                    content:
                        "❌ Oyuncu sunucuda bulunamadı.",
                    ephemeral: true
                });
            }

            let roleId;
            let roleName;

            if (
                type === "futbolcu"
            ) {
                roleId =
                    ROLES.FUTBOLCU;

                roleName =
                    "Futbolcu";
            }

            else if (
                type === "kaleci"
            ) {
                roleId =
                    ROLES.KALECI;

                roleName =
                    "Kaleci";
            }

            else if (
                type === "td"
            ) {
                roleId =
                    ROLES.TEKNIK_DIREKTOR;

                roleName =
                    "Teknik Direktör";
            }

            else {
                return interaction.reply({
                    content:
                        "❌ Geçersiz rol seçimi.",
                    ephemeral: true
                });
            }

            const role =
                guild.roles.cache.get(
                    roleId
                );

            if (!role) {
                return interaction.reply({
                    content:
                        "❌ Seçilen rol bulunamadı.",
                    ephemeral: true
                });
            }

            // =================================================
            // ESKİ ROLLERİ KALDIR
            // =================================================

            const oldRoles = [
                ROLES.FUTBOLCU,
                ROLES.KALECI,
                ROLES.TEKNIK_DIREKTOR
            ];

            for (
                const oldRoleId
                of oldRoles
            ) {

                if (
                    target.roles.cache.has(
                        oldRoleId
                    )
                ) {

                    await target.roles.remove(
                        oldRoleId,
                        "Axera League kayıt"
                    ).catch(
                        () => {}
                    );
                }
            }

            // =================================================
            // KAYITSIZ ROLÜNÜ KALDIR
            // =================================================

            if (
                target.roles.cache.has(
                    ROLES.KAYITSIZ
                )
            ) {

                await target.roles.remove(
                    ROLES.KAYITSIZ,
                    "Kayıt tamamlandı"
                ).catch(
                    () => {}
                );
            }

            // =================================================
            // SEÇİLEN ROLÜ VER
            // =================================================

            await target.roles.add(
                role,
                "Axera League kayıt sistemi"
            );

            // =================================================
            // NICK AYARLA
            // =================================================

            const oldNickname =
                target.nickname ||
                target.user.displayName ||
                target.user.username;

            const oldValue =
                getPlayerValue(
                    oldNickname
                );

            let finalNickname =
                `${registration.nickname} | ${formatMoney(oldValue)}`;

            if (
                finalNickname.length > 32
            ) {
                finalNickname =
                    finalNickname.substring(
                        0,
                        32
                    );
            }

            await target
                .setNickname(
                    finalNickname,
                    "Axera League kayıt"
                )
                .catch(
                    error =>
                        console.error(
                            "Nick ayarlanamadı:",
                            error
                        )
                );

            // =================================================
            // VERİYİ TEMİZLE
            // =================================================

            delete data.registrations[
                registrationId
            ];

            saveData();

            // =================================================
            // BUTONLARI KAPAT
            // =================================================

            const disabledRow =
                new ActionRowBuilder()
                    .addComponents(

                        new ButtonBuilder()
                            .setCustomId(
                                `tamam_${registrationId}`
                            )
                            .setLabel(
                                `✅ ${roleName} • Kayıt Tamamlandı`
                            )
                            .setStyle(
                                ButtonStyle.Success
                            )
                            .setDisabled(
                                true
                            )
                    );

            const resultEmbed =
                new EmbedBuilder()
                    .setTitle(
                        "✅ Kayıt Tamamlandı"
                    )
                    .setDescription(
                        `👤 Oyuncu: ${target}\n` +
                        `🏷️ Takma Adı: **${registration.nickname}**\n` +
                        `🎭 Rol: **${roleName}**\n` +
                        `🛠️ Kayıt Yetkilisi: ${interaction.user}\n\n` +
                        `🎉 **Axera League'e hoş geldin!**`
                    )
                    .setThumbnail(
                        target.user.displayAvatarURL({
                            extension: "png",
                            size: 256
                        })
                    )
                    .setFooter({
                        text:
                            "Axera League • Kayıt Sistemi"
                    })
                    .setTimestamp();

            await interaction.update({
                embeds: [resultEmbed],
                components: [
                    disabledRow
                ]
            });

            // =================================================
            // SOHBET KANALINA MESAJ
            // =================================================

            const chatChannel =
                guild.channels.cache.get(
                    CHANNELS.SOHBET
                );

            if (chatChannel) {

                const chatEmbed =
                    new EmbedBuilder()
                        .setTitle(
                            "🎉 Yeni Oyuncu Kaydı!"
                        )
                        .setDescription(
                            `**${target}** Axera League'e kayıt oldu!\n\n` +
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
                            text:
                                "Axera League"
                        })
                        .setTimestamp();

                await chatChannel.send({
                    embeds: [chatEmbed],
                    allowedMentions: {
                        users: [
                            target.id
                        ]
                    }
                }).catch(
                    error =>
                        console.error(
                            "Sohbet mesajı gönderilemedi:",
                            error
                        )
                );
            }

        } catch (error) {

            console.error(
                "Button hatası:",
                error
            );

            try {

                if (
                    !interaction.replied &&
                    !interaction.deferred
                ) {
                    await interaction.reply({
                        content:
                            "❌ Kayıt sırasında bir hata oluştu.",
                        ephemeral: true
                    });
                }

            } catch {}
        }
    }
);

// ============================================================
// HATA YAKALAMA
// ============================================================

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

// ============================================================
// LOGIN
// ============================================================

if (
    !TOKEN ||
    TOKEN === "BURAYA_BOT_TOKENINI_YAZ"
) {

    console.error(
        "❌ TOKEN bulunamadı!"
    );

    console.error(
        "Railway Variables kısmına TOKEN ekle."
    );

} else {

    client.login(TOKEN)
        .catch(
            error => {
                console.error(
                    "❌ Discord giriş hatası:",
                    error
                );
            }
        );
}
