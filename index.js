// ============================================================
// AXERA LEAGUE - FUTBOL RP DISCORD BOT
// Discord.js v14
// ============================================================

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
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelType
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ============================================================
// TOKEN
// ============================================================

const TOKEN = process.env.TOKEN || "BURAYA_BOT_TOKENINI_YAZ";

// ============================================================
// CLIENT
// ============================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration
    ],
    partials: [
        Partials.Channel,
        Partials.GuildMember,
        Partials.User,
        Partials.Message
    ]
});

// ============================================================
// CONFIG
// ============================================================

const CONFIG = {

    roles: {

        FUTBOLCU: "1534457228986421278",
        KALECI: "1534492034243498195",
        KAYITSIZ: "1534457560134844517",
        TEKNIK_DIREKTOR: "1534456648930693120",
        KAYIT_YETKILISI: "1534456315366342716",
        DEGER_YETKILISI: "1534456192913375382",

        // Geniş sistemler için
        YONETICI: null,
        MAC_YETKILISI: null,
        CEKILIS_YETKILISI: null,
        KICK_YETKILISI: null,
        MUTE_YETKILISI: null,
        MUTE_KALDIRMA_YETKILISI: null,
        KANAL_ACMA_YETKILISI: null,
        KANAL_KILITLEME_YETKILISI: null,
        DM_YETKILISI: null,
        MEDYA_YETKILISI: null
    },

    channels: {

        KAYIT: "1534460177884123276",
        SOHBET: "1534469475917758586",
        ANTRENMAN: "1534474070798762197",
        PENALTI: "1534474327812997192",

        // İsteğe bağlı kanallar
        MAC: null,
        TRANSFER: null,
        KAP: null,
        DUYURU: null,
        CEKILIS: null
    },

    economy: {
        TRAINING_REWARD: 5,
        PENALTY_GOAL_REWARD: 5,
        STARTING_VALUE: 0
    },

    match: {
        duration: 5 * 60 * 1000,
        narrationDelay: 1000
    }
};

// ============================================================
// DATABASE
// ============================================================

const DATA_FILE = path.join(__dirname, "data.json");

let data = {
    training: {},
    teams: {},
    matches: {},
    transfers: {},
    giveaways: {},
    muted: {},
    registration: {},
    squads: {},
    sponsors: {},
    channels: {},
    stats: {}
};

function loadData() {

    try {

        if (!fs.existsSync(DATA_FILE)) {
            saveData();
            return;
        }

        const raw = fs.readFileSync(DATA_FILE, "utf8");

        if (raw.trim()) {
            data = {
                ...data,
                ...JSON.parse(raw)
            };
        }

    } catch (error) {

        console.error("data.json okunamadı:", error);

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

// ============================================================
// YARDIMCI FONKSİYONLAR
// ============================================================

function isAdmin(member) {

    return member.permissions.has(
        PermissionsBitField.Flags.Administrator
    );
}

function hasRole(member, roleId) {

    if (!roleId) return false;

    return member.roles.cache.has(roleId);
}

function canUse(member, roleId) {

    return isAdmin(member) || hasRole(member, roleId);
}

function getChannel(guild, id) {

    if (!id) return null;

    return guild.channels.cache.get(id) || null;
}

function getRole(guild, id) {

    if (!id) return null;

    return guild.roles.cache.get(id) || null;
}

function formatMoney(value) {

    const number = Number(value) || 0;

    return `${number}M€`;
}

function getMemberFromMention(message, argument) {

    if (!argument) return null;

    const match = argument.match(/^<@!?(\d+)>$/);

    if (!match) return null;

    return message.guild.members.cache.get(match[1]) || null;
}

function extractMentionId(text) {

    const match = text?.match(/^<@!?(\d+)>$/);

    return match ? match[1] : null;
}

function parseAmount(value) {

    if (!value) return null;

    const clean = String(value)
        .replace(",", ".")
        .trim();

    if (!/^\d+(?:\.\d+)?$/.test(clean)) {
        return null;
    }

    const number = Number(clean);

    if (!Number.isFinite(number) || number < 0) {
        return null;
    }

    return number;
}

// ============================================================
// DEĞER SİSTEMİ
// ============================================================

function parsePlayerValue(nickname) {

    if (!nickname) return 0;

    const match = nickname.match(/(\d+(?:[.,]\d+)?)M€\s*$/i);

    if (!match) return 0;

    return Number(
        match[1].replace(",", ".")
    );
}

function changePlayerValue(member, amount) {

    const nickname = member.nickname || member.user.username;

    const match = nickname.match(/^(.*?)(?:\s*\|\s*)?(\d+(?:[.,]\d+)?)M€\s*$/i);

    let base;
    let current;

    if (match) {

        base = match[1].trim();
        current = Number(
            match[2].replace(",", ".")
        );

    } else {

        base = nickname.trim();
        current = 0;

    }

    const newValue = Math.max(
        0,
        current + amount
    );

    // Discord nickname limiti 32 karakterdir.
    // Değer kesinlikle korunur.
    const suffix = ` | ${formatMoney(newValue)}`;

    let finalBase = base;

    if ((finalBase + suffix).length > 32) {

        finalBase = finalBase.substring(
            0,
            Math.max(1, 32 - suffix.length)
        ).trim();

    }

    const newNickname =
        `${finalBase}${suffix}`.substring(0, 32);

    return {
        oldValue: current,
        newValue,
        nickname: newNickname
    };
}

async function addValue(member, amount) {

    const result = changePlayerValue(
        member,
        amount
    );

    await member.setNickname(
        result.nickname,
        "Axera League değer sistemi"
    );

    return result;
}

async function removeValue(member, amount) {

    return addValue(member, -Math.abs(amount));
}

// ============================================================
// KAYIT SİSTEMİ
// ============================================================

client.on("guildMemberAdd", async member => {

    try {

        const channel = getChannel(
            member.guild,
            CONFIG.channels.KAYIT
        );

        if (!channel) return;

        const registrationRole =
            getRole(
                member.guild,
                CONFIG.roles.KAYIT_YETKILISI
            );

        const embed = new EmbedBuilder()
            .setTitle("👋 Yeni Oyuncu")
            .setDescription(
                `**${member}** sunucuya katıldı.\n\n` +
                `Oyuncunun kaydını gerçekleştirmek için ` +
                `kayıt panelini kullanabilirsiniz.`
            )
            .setColor(0x2b2d31)
            .setTimestamp();

        await channel.send({
            content: registrationRole
                ? `${registrationRole}`
                : "📋 Kayıt Yetkilileri",
            embeds: [embed]
        });

    } catch (error) {

        console.error("Üye giriş sistemi:", error);

    }
});

// ============================================================
// KAYIT PANELİ
// ============================================================

function createRegistrationButtons(userId) {

    return new ActionRowBuilder()
        .addComponents(

            new ButtonBuilder()
                .setCustomId(`register_player_${userId}`)
                .setLabel("Futbolcu")
                .setEmoji("⚽")
                .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
                .setCustomId(`register_keeper_${userId}`)
                .setLabel("Kaleci")
                .setEmoji("🧤")
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId(`register_manager_${userId}`)
                .setLabel("Teknik Direktör")
                .setEmoji("🧠")
                .setStyle(ButtonStyle.Secondary)
        );
}

// ============================================================
// BUTONLAR
// ============================================================

client.on("interactionCreate", async interaction => {

    if (!interaction.isButton()) return;

    const id = interaction.customId;

    if (
        !id.startsWith("register_player_") &&
        !id.startsWith("register_keeper_") &&
        !id.startsWith("register_manager_")
    ) return;

    const targetId = id.split("_").pop();

    if (interaction.user.id !== targetId) {

        return interaction.reply({
            content: "❌ Bu kayıt paneli başka bir oyuncuya ait.",
            ephemeral: true
        });
    }

    const member = interaction.guild.members.cache.get(
        targetId
    );

    if (!member) {

        return interaction.reply({
            content: "❌ Oyuncu bulunamadı.",
            ephemeral: true
        });
    }

    let selectedRoleId;
    let roleName;

    if (id.startsWith("register_player_")) {

        selectedRoleId = CONFIG.roles.FUTBOLCU;
        roleName = "Futbolcu ⚽";

    } else if (id.startsWith("register_keeper_")) {

        selectedRoleId = CONFIG.roles.KALECI;
        roleName = "Kaleci 🧤";

    } else {

        selectedRoleId = CONFIG.roles.TEKNIK_DIREKTOR;
        roleName = "Teknik Direktör 🧠";
    }

    try {

        const kayitsizRole =
            getRole(
                interaction.guild,
                CONFIG.roles.KAYITSIZ
            );

        const selectedRole =
            getRole(
                interaction.guild,
                selectedRoleId
            );

        if (kayitsizRole) {

            await member.roles.remove(
                kayitsizRole,
                "Kayıt tamamlandı"
            );
        }

        if (selectedRole) {

            await member.roles.add(
                selectedRole,
                "Kayıt tamamlandı"
            );
        }

        data.registration[member.id] = {
            registered: true,
            role: selectedRoleId,
            registeredAt: Date.now()
        };

        saveData();

        await interaction.update({
            content:
                `✅ ${member} başarıyla kayıt oldu!\n\n` +
                `Seçilen rol: **${roleName}**`,
            components: []
        });

        const chat =
            getChannel(
                interaction.guild,
                CONFIG.channels.SOHBET
            );

        if (chat) {

            await chat.send(
                `🎉 ${member} kayıt işlemini tamamladı!\n` +
                `Rol: **${roleName}**`
            );
        }

    } catch (error) {

        console.error(error);

        if (!interaction.replied) {

            await interaction.reply({
                content:
                    "❌ Rol verilirken bir hata oluştu. Botun rol hiyerarşisini kontrol edin.",
                ephemeral: true
            });

        }
    }
});

// ============================================================
// MESAJ SİSTEMLERİ
// ============================================================

client.on("messageCreate", async message => {

    if (message.author.bot) return;

    if (!message.guild) return;

    const content = message.content.trim();

    if (!content.startsWith(".")) return;

    const args = content.split(/\s+/);

    const command = args[0].toLowerCase();

    // ========================================================
    // YARDIM
    // ========================================================

    if (
        command === ".yardım" ||
        command === ".yardim"
    ) {

        const embed = new EmbedBuilder()
            .setTitle("📚 Axera League Komutları")
            .setDescription("Kullanabileceğin sistemler:")
            .addFields(

                {
                    name: "📋 Kayıt",
                    value:
                        "`.k @oyuncu TakmaAdı`\n" +
                        "`.kayıtsızver @oyuncu TakmaAdı`"
                },

                {
                    name: "💰 Değer",
                    value:
                        "`.dver @oyuncu 5`\n" +
                        "`.dsil @oyuncu 5`"
                },

                {
                    name: "🏋️ Antrenman",
                    value:
                        "`.ant`\n" +
                        "`.antrenman`"
                },

                {
                    name: "🥅 Penaltı",
                    value:
                        "`.pen`\n" +
                        "`.penaltı`\n" +
                        "`.penalti`"
                },

                {
                    name: "⚽ Takım / Maç",
                    value:
                        "`.takımoluştur`\n" +
                        "`.kadro`\n" +
                        "`.maç`"
                },

                {
                    name: "🔄 Transfer",
                    value:
                        "`.transfer`\n" +
                        "`.kap`"
                },

                {
                    name: "🛡️ Moderasyon",
                    value:
                        "`.kick`\n" +
                        "`.mute`\n" +
                        "`.unmute`\n" +
                        "`.sil`"
                },

                {
                    name: "🎉 Çekiliş",
                    value:
                        "`.çekiliş`"
                },

                {
                    name: "📢 Yönetim",
                    value:
                        "`.embed`\n" +
                        "`.dm all`\n" +
                        "`.tweet`\n" +
                        "`.rolpanel`"
                }

            )
            .setColor(0x2b2d31)
            .setFooter({
                text: "Axera League"
            });

        return message.reply({
            embeds: [embed]
        });
    }

    // ========================================================
    // KAYIT
    // ========================================================

    if (command === ".k") {

        if (
            message.channel.id !==
            CONFIG.channels.KAYIT
        ) {

            return message.reply(
                "❌ Bu komut yalnızca kayıt kanalında kullanılabilir."
            );
        }

        if (
            !canUse(
                message.member,
                CONFIG.roles.KAYIT_YETKILISI
            )
        ) {

            return message.reply(
                "❌ Bu komutu yalnızca Kayıt Yetkilisi kullanabilir."
            );
        }

        const target =
            getMemberFromMention(
                message,
                args[1]
            );

        if (!target) {

            return message.reply(
                "❌ Kullanım: `.k @oyuncu TakmaAdı`"
            );
        }

        // Mention sonrası bütün yazı alınır.
        // BOT BURADA TAKMA ADI DEĞİŞTİRMEZ.
        const nickname =
            content
                .replace(/^\.k\s+/i, "")
                .replace(/^<@!?\d+>\s*/i, "")
                .trim();

        if (!nickname) {

            return message.reply(
                "❌ Oyuncunun takma adını yazmalısın."
            );
        }

        data.registration[target.id] = {
            registered: false,
            pending: true,
            nickname,
            createdBy: message.author.id,
            createdAt: Date.now()
        };

        saveData();

        const embed = new EmbedBuilder()
            .setTitle("📋 Oyuncu Kayıt Paneli")
            .setDescription(
                `${target}\n\n` +
                `Kayıt türünü seçmek için aşağıdaki butonlardan birine bas.`
            )
            .addFields({
                name: "🏷️ Takma Ad",
                value: `\`${nickname}\``
            })
            .setColor(0x2b2d31)
            .setTimestamp();

        return message.reply({
            embeds: [embed],
            components: [
                createRegistrationButtons(
                    target.id
                )
            ]
        });
    }

    // ========================================================
    // KAYITSIZ VER
    // ========================================================

    if (
        command === ".kayıtsızver" ||
        command === ".kayitsizver"
    ) {

        if (
            !canUse(
                message.member,
                CONFIG.roles.KAYIT_YETKILISI
            )
        ) {

            return message.reply(
                "❌ Bu komutu yalnızca Kayıt Yetkilisi kullanabilir."
            );
        }

        const target =
            getMemberFromMention(
                message,
                args[1]
            );

        if (!target) {

            return message.reply(
                "❌ Kullanım: `.kayıtsızver @oyuncu TakmaAdı`"
            );
        }

        const nickname =
            content
                .replace(/^\.kayıtsızver\s+/i, "")
                .replace(/^\.kayitsizver\s+/i, "")
                .replace(/^<@!?\d+>\s*/i, "")
                .trim();

        if (!nickname) {

            return message.reply(
                "❌ Oyuncunun yeni takma adını yazmalısın."
            );
        }

        try {

            const rolesToRemove = [
                CONFIG.roles.FUTBOLCU,
                CONFIG.roles.KALECI,
                CONFIG.roles.TEKNIK_DIREKTOR
            ];

            for (const roleId of rolesToRemove) {

                const role =
                    getRole(
                        message.guild,
                        roleId
                    );

                if (
                    role &&
                    target.roles.cache.has(role.id)
                ) {

                    await target.roles.remove(
                        role,
                        "Oyuncu kayıtsız yapıldı"
                    );
                }
            }

            const kayitsiz =
                getRole(
                    message.guild,
                    CONFIG.roles.KAYITSIZ
                );

            if (kayitsiz) {

                await target.roles.add(
                    kayitsiz,
                    "Oyuncu kayıtsız yapıldı"
                );
            }

            // Burada da yazılan takma ad AYNI şekilde uygulanır.
            await target.setNickname(
                nickname,
                "Kayıtsız oyuncu"
            );

            data.registration[target.id] = {
                registered: false,
                pending: false,
                nickname,
                updatedBy: message.author.id,
                updatedAt: Date.now()
            };

            saveData();

            return message.reply(
                `✅ ${target} kayıtsız yapıldı.\n` +
                `🏷️ Takma ad: \`${nickname}\``
            );

        } catch (error) {

            console.error(error);

            return message.reply(
                "❌ İşlem başarısız. Botun rol/takma ad yetkisini kontrol edin."
            );
        }
    }

    // ========================================================
    // DEĞER VER
    // ========================================================

    if (command === ".dver") {

        if (
            !canUse(
                message.member,
                CONFIG.roles.DEGER_YETKILISI
            )
        ) {

            return message.reply(
                "❌ Bu komutu yalnızca Değer Yetkilisi kullanabilir."
            );
        }

        const target =
            getMemberFromMention(
                message,
                args[1]
            );

        const amount =
            parseAmount(args[2]);

        if (!target || amount === null) {

            return message.reply(
                "❌ Kullanım: `.dver @oyuncu 5`"
            );
        }

        try {

            const result =
                await addValue(
                    target,
                    amount
                );

            return message.reply(
                `💰 ${target} oyuncusuna **${formatMoney(amount)}** değer eklendi.\n` +
                `📊 Yeni değer: **${formatMoney(result.newValue)}**`
            );

        } catch (error) {

            console.error(error);

            return message.reply(
                "❌ Değer verilemedi. Botun takma ad değiştirme yetkisini kontrol edin."
            );
        }
    }

    // ========================================================
    // DEĞER SİL
    // ========================================================

    if (command === ".dsil") {

        if (
            !canUse(
                message.member,
                CONFIG.roles.DEGER_YETKILISI
            )
        ) {

            return message.reply(
                "❌ Bu komutu yalnızca Değer Yetkilisi kullanabilir."
            );
        }

        const target =
            getMemberFromMention(
                message,
                args[1]
            );

        const amount =
            parseAmount(args[2]);

        if (!target || amount === null) {

            return message.reply(
                "❌ Kullanım: `.dsil @oyuncu 5`"
            );
        }

        try {

            const result =
                await removeValue(
                    target,
                    amount
                );

            return message.reply(
                `💸 ${target} oyuncusundan **${formatMoney(amount)}** değer silindi.\n` +
                `📊 Yeni değer: **${formatMoney(result.newValue)}**`
            );

        } catch (error) {

            console.error(error);

            return message.reply(
                "❌ Değer silinemedi."
            );
        }
    }

    // ========================================================
    // ANTRENMAN
    // ========================================================

    if (
        command === ".ant" ||
        command === ".antrenman"
    ) {

        if (
            message.channel.id !==
            CONFIG.channels.ANTRENMAN
        ) {

            return message.reply(
                "❌ Bu komut yalnızca antrenman kanalında kullanılabilir."
            );
        }

        if (
            !message.member.roles.cache.has(
                CONFIG.roles.FUTBOLCU
            ) &&
            !message.member.roles.cache.has(
                CONFIG.roles.KALECI
            ) &&
            !message.member.roles.cache.has(
                CONFIG.roles.TEKNIK_DIREKTOR
            )
        ) {

            return message.reply(
                "❌ Önce kayıt olmalısın."
            );
        }

        const id = message.author.id;

        if (!data.training[id]) {
            data.training[id] = 0;
        }

        data.training[id]++;

        const progress =
            data.training[id];

        if (progress < 5) {

            saveData();

            return message.reply(
                `🏋️ Antrenman tamamlandı!\n\n` +
                `📈 İlerleme: **${progress}/5**`
            );
        }

        // 5/5
        try {

            const result =
                await addValue(
                    message.member,
                    CONFIG.economy.TRAINING_REWARD
                );

            data.training[id] = 0;

            data.stats[id] =
                data.stats[id] || {};

            data.stats[id].training =
                (data.stats[id].training || 0) + 1;

            saveData();

            return message.reply(
                `🏆 **ANTRENMAN TAMAMLANDI!**\n\n` +
                `📈 **5/5**\n` +
                `💰 Ödül: **+${CONFIG.economy.TRAINING_REWARD}M€**\n` +
                `📊 Yeni değer: **${formatMoney(result.newValue)}**`
            );

        } catch (error) {

            console.error(error);

            // Ödül kaybolmasın.
            data.training[id] = 4;
            saveData();

            return message.reply(
                "❌ Değer eklenemedi. İlerleme **4/5** olarak korundu."
            );
        }
    }

    // ========================================================
    // PENALTI
    // ========================================================

    if (
        command === ".pen" ||
        command === ".penaltı" ||
        command === ".penalti"
    ) {

        if (
            message.channel.id !==
            CONFIG.channels.PENALTI
        ) {

            return message.reply(
                "❌ Bu komut yalnızca penaltı kanalında kullanılabilir."
            );
        }

        if (
            !message.member.roles.cache.has(
                CONFIG.roles.FUTBOLCU
            ) &&
            !message.member.roles.cache.has(
                CONFIG.roles.KALECI
            ) &&
            !message.member.roles.cache.has(
                CONFIG.roles.TEKNIK_DIREKTOR
            )
        ) {

            return message.reply(
                "❌ Önce kayıt olmalısın."
            );
        }

        // 3 sonuç eşit ihtimal
        const result =
            Math.floor(Math.random() * 3);

        if (result === 0) {

            try {

                const reward =
                    await addValue(
                        message.member,
                        CONFIG.economy.PENALTY_GOAL_REWARD
                    );

                return message.reply(
                    `⚽ **GOOOL!**\n\n` +
                    `🧍 Oyuncu: ${message.member}\n` +
                    `🥅 Kaleci: **Axera Kalecisi (NPC)**\n\n` +
                    `💰 Ödül: **+${CONFIG.economy.PENALTY_GOAL_REWARD}M€**\n` +
                    `📊 Yeni değer: **${formatMoney(reward.newValue)}**`
                );

            } catch (error) {

                console.error(error);

                return message.reply(
                    "⚽ Gol! Ancak değer eklenirken hata oluştu."
                );
            }

        } else if (result === 1) {

            return message.reply(
                `🥅 **DİREK!**\n\n` +
                `🧍 Oyuncu: ${message.member}\n` +
                `🧤 Kaleci: **Axera Kalecisi (NPC)**\n\n` +
                `💰 Ödül: **0M€**`
            );

        } else {

            return message.reply(
                `🧤 **KURTARDI!**\n\n` +
                `🧍 Oyuncu: ${message.member}\n` +
                `🧤 Kaleci: **Axera Kalecisi (NPC)**\n\n` +
                `💰 Ödül: **0M€**`
            );
        }
    }

    // ========================================================
    // TAKIM OLUŞTUR
    // ========================================================

    if (
        command === ".takımoluştur" ||
        command === ".takimolustur"
    ) {

        if (
            data.teams[message.author.id]
        ) {

            return message.reply(
                "❌ Zaten bir takımın var."
            );
        }

        const teamName =
            args.slice(1).join(" ").trim();

        if (!teamName) {

            return message.reply(
                "❌ Kullanım: `.takımoluştur Takım Adı`"
            );
        }

        if (teamName.length > 100) {

            return message.reply(
                "❌ Takım adı çok uzun."
            );
        }

        const existing =
            Object.values(data.teams)
                .find(team =>
                    team.name.toLowerCase() ===
                    teamName.toLowerCase()
                );

        if (existing) {

            return message.reply(
                "❌ Bu takım zaten mevcut."
            );
        }

        data.teams[message.author.id] = {
            owner: message.author.id,
            name: teamName,
            budget: 0,
            createdAt: Date.now(),
            squad: []
        };

        data.squads[message.author.id] = [];

        saveData();

        try {

            const tdRole =
                getRole(
                    message.guild,
                    CONFIG.roles.TEKNIK_DIREKTOR
                );

            if (tdRole) {

                await message.member.roles.add(
                    tdRole,
                    "Takım oluşturuldu"
                );
            }

            const teamRole =
                await message.guild.roles.create({
                    name: teamName,
                    reason: "Axera League takım rolü"
                });

            await message.member.roles.add(
                teamRole,
                "Takım kurucusu"
            );

            return message.reply(
                `🏆 **${teamName}** başarıyla oluşturuldu!\n\n` +
                `👤 Teknik Direktör: ${message.member}\n` +
                `💰 Takım bütçesi: **0M€**`
            );

        } catch (error) {

            console.error(error);

            return message.reply(
                `🏆 **${teamName}** oluşturuldu fakat rol verilemedi.`
            );
        }
    }

    // ========================================================
    // KADRO
    // ========================================================

    if (command === ".kadro") {

        const target =
            message.mentions.members.first() ||
            message.member;

        let teamOwner = target.id;

        if (!data.teams[teamOwner]) {

            const team =
                Object.values(data.teams)
                    .find(t =>
                        t.owner === target.id
                    );

            if (!team) {

                return message.reply(
                    "❌ Bu oyuncunun bir takımı bulunmuyor."
                );
            }

            teamOwner = team.owner;
        }

        const team =
            data.teams[teamOwner];

        const squad =
            data.squads[teamOwner] || [];

        const list =
            squad.length
                ? squad.map(
                    (id, i) =>
                        `${i + 1}. <@${id}>`
                ).join("\n")
                : "Henüz kadro oluşturulmadı.";

        const embed = new EmbedBuilder()
            .setTitle(`⚽ ${team.name} - Kadro`)
            .setDescription(list)
            .setColor(0x2b2d31);

        return message.reply({
            embeds: [embed]
        });
    }

    // ========================================================
    // KADROYA OYUNCU EKLE
    // ========================================================

    if (
        command === ".kadroyacek" ||
        command === ".kadroekle"
    ) {

        const team =
            data.teams[message.author.id];

        if (!team) {

            return message.reply(
                "❌ Bir takımın bulunmuyor."
            );
        }

        if (!hasRole(
            message.member,
            CONFIG.roles.TEKNIK_DIREKTOR
        ) && !isAdmin(message.member)) {

            return message.reply(
                "❌ Bu işlemi yalnızca Teknik Direktör yapabilir."
            );
        }

        const target =
            message.mentions.members.first();

        if (!target) {

            return message.reply(
                "❌ Bir oyuncu etiketle."
            );
        }

        data.squads[message.author.id] =
            data.squads[message.author.id] || [];

        if (
            data.squads[message.author.id]
                .includes(target.id)
        ) {

            return message.reply(
                "❌ Bu oyuncu zaten kadroda."
            );
        }

        data.squads[message.author.id]
            .push(target.id);

        saveData();

        return message.reply(
            `✅ ${target} kadroya eklendi.`
        );
    }

    // ========================================================
    // KADRODAN ÇIKAR
    // ========================================================

    if (
        command === ".kadrodançıkar" ||
        command === ".kadrodan",
        command === ".kadrodançıkar"
    ) {

        const team =
            data.teams[message.author.id];

        if (!team) {

            return message.reply(
                "❌ Bir takımın bulunmuyor."
            );
        }

        const target =
            message.mentions.members.first();

        if (!target) {

            return message.reply(
                "❌ Oyuncuyu etiketle."
            );
        }

        data.squads[message.author.id] =
            (data.squads[message.author.id] || [])
                .filter(id => id !== target.id);

        saveData();

        return message.reply(
            `✅ ${target} kadrodan çıkarıldı.`
        );
    }

    // ========================================================
    // MAÇ
    // ========================================================

    if (command === ".maç") {

        if (
            !canUse(
                message.member,
                CONFIG.roles.MAC_YETKILISI
            ) &&
            !isAdmin(message.member)
        ) {

            return message.reply(
                "❌ Bu komutu yalnızca Maç Yetkilisi kullanabilir."
            );
        }

        const teams =
            [...message.mentions.users.values()];

        if (teams.length < 2) {

            return message.reply(
                "❌ Kullanım: `.maç @takım1 @takım2`"
            );
        }

        const team1 =
            teams[0];

        const team2 =
            teams[1];

        const matchId =
            `${Date.now()}_${team1.id}_${team2.id}`;

        data.matches[matchId] = {
            team1: team1.id,
            team2: team2.id,
            score1: 0,
            score2: 0,
            startedAt: Date.now(),
            active: true
        };

        saveData();

        const embed =
            new EmbedBuilder()
                .setTitle("⚽ MAÇ BAŞLADI")
                .setDescription(
                    `🏟️ ${team1} **0 - 0** ${team2}\n\n` +
                    `⏱️ Maç süresi: **5 dakika**\n` +
                    `🎙️ Canlı anlatım başlıyor...`
                )
                .setColor(0x2b2d31);

        await message.channel.send({
            embeds: [embed]
        });

        const events = [
            "⚡ Hızlı hücum!",
            "🎯 Tehlikeli şut!",
            "🧤 Kaleci kurtardı!",
            "🔥 Ceza sahasında büyük tehlike!",
            "⚽ GOOOL!",
            "🛡️ Savunma araya girdi!",
            "🎯 Top direğin yanından dışarı çıktı!",
            "⚡ Kontra atak!"
        ];

        let elapsed = 0;

        const interval =
            setInterval(async () => {

                elapsed += 1000;

                if (
                    elapsed >=
                    CONFIG.match.duration
                ) {

                    clearInterval(interval);

                    data.matches[matchId].active =
                        false;

                    saveData();

                    await message.channel.send(
                        `🏁 **MAÇ SONA ERDİ!**\n\n` +
                        `${team1} **${data.matches[matchId].score1} - ` +
                        `${data.matches[matchId].score2}** ${team2}`
                    );

                    return;
                }

                const event =
                    events[
                        Math.floor(
                            Math.random() *
                            events.length
                        )
                    ];

                if (
                    event === "⚽ GOOOL!"
                ) {

                    if (
                        Math.random() < 0.5
                    ) {

                        data.matches[matchId].score1++;

                        await message.channel.send(
                            `⚽ **GOOOL!** ${team1} skoru buldu!`
                        );

                    } else {

                        data.matches[matchId].score2++;

                        await message.channel.send(
                            `⚽ **GOOOL!** ${team2} skoru buldu!`
                        );
                    }

                } else {

                    await message.channel.send(
                        `🎙️ ${event}`
                    );
                }

                saveData();

            }, CONFIG.match.narrationDelay);

        return;
    }

    // ========================================================
    // TRANSFER
    // ========================================================

    if (command === ".transfer") {

        const target =
            message.mentions.members.first();

        const amount =
            parseAmount(args[2]);

        if (!target || amount === null) {

            return message.reply(
                "❌ Kullanım: `.transfer @oyuncu 10`"
            );
        }

        return message.reply(
            `🔄 Transfer teklifi hazırlandı.\n\n` +
            `👤 Oyuncu: ${target}\n` +
            `💰 Teklif: **${amount}M€**\n\n` +
            `KAP üzerinden resmi teklif oluşturabilirsiniz.`
        );
    }

    // ========================================================
    // KAP
    // ========================================================

    if (command === ".kap") {

        const target =
            message.mentions.members.first();

        if (!target) {

            return message.reply(
                "❌ Kullanım: `.kap @oyuncu`"
            );
        }

        const amount =
            parseAmount(args[2]);

        if (amount === null) {

            return message.reply(
                "❌ Transfer bedelini sayı olarak yaz."
            );
        }

        const embed =
            new EmbedBuilder()
                .setTitle("📄 KAP - Transfer Bildirimi")
                .setDescription(
                    `📢 Resmi transfer teklifi`
                )
                .addFields(

                    {
                        name: "👤 Oyuncu",
                        value: `${target}`,
                        inline: true
                    },

                    {
                        name: "💰 Bedel",
                        value: `${amount}M€`,
                        inline: true
                    },

                    {
                        name: "🏢 Bildiren",
                        value: `${message.member}`,
                        inline: true
                    }

                )
                .setColor(0x2b2d31)
                .setTimestamp();

        return message.channel.send({
            embeds: [embed]
        });
    }

    // ========================================================
    // KICK
    // ========================================================

    if (command === ".kick") {

        if (
            !canUse(
                message.member,
                CONFIG.roles.KICK_YETKILISI
            )
        ) {

            return message.reply(
                "❌ Kick yetkin yok."
            );
        }

        const target =
            message.mentions.members.first();

        if (!target) {

            return message.reply(
                "❌ Oyuncuyu etiketle."
            );
        }

        if (
            !target.kickable
        ) {

            return message.reply(
                "❌ Bu oyuncuyu atamıyorum."
            );
        }

        const reason =
            args.slice(2).join(" ") ||
            "Sebep belirtilmedi.";

        await target.kick(reason);

        return message.reply(
            `👢 ${target.user.tag} sunucudan atıldı.\n` +
            `Sebep: ${reason}`
        );
    }

    // ========================================================
    // MUTE
    // ========================================================

    if (command === ".mute") {

        if (
            !canUse(
                message.member,
                CONFIG.roles.MUTE_YETKILISI
            )
        ) {

            return message.reply(
                "❌ Mute yetkin yok."
            );
        }

        const target =
            message.mentions.members.first();

        if (!target) {

            return message.reply(
                "❌ Oyuncuyu etiketle."
            );
        }

        let muteRole =
            message.guild.roles.cache.find(
                role =>
                    role.name.toLowerCase() ===
                    "muted"
            );

        if (!muteRole) {

            muteRole =
                await message.guild.roles.create({
                    name: "Muted",
                    reason: "Axera League mute sistemi"
                });
        }

        await target.roles.add(
            muteRole,
            "Mute sistemi"
        );

        data.muted[target.id] = true;

        saveData();

        return message.reply(
            `🔇 ${target} susturuldu.`
        );
    }

    // ========================================================
    // UNMUTE
    // ========================================================

    if (
        command === ".unmute" ||
        command === ".mutekaldır" ||
        command === ".mutekaldir"
    ) {

        if (
            !canUse(
                message.member,
                CONFIG.roles.MUTE_KALDIRMA_YETKILISI
            )
        ) {

            return message.reply(
                "❌ Mute kaldırma yetkin yok."
            );
        }

        const target =
            message.mentions.members.first();

        if (!target) {

            return message.reply(
                "❌ Oyuncuyu etiketle."
            );
        }

        const muteRole =
            message.guild.roles.cache.find(
                role =>
                    role.name.toLowerCase() ===
                    "muted"
            );

        if (muteRole) {

            await target.roles.remove(
                muteRole,
                "Mute kaldırıldı"
            );
        }

        delete data.muted[target.id];

        saveData();

        return message.reply(
            `🔊 ${target} oyuncusunun mute işlemi kaldırıldı.`
        );
    }

    // ========================================================
    // SİL
    // ========================================================

    if (command === ".sil") {

        if (!isAdmin(message.member)) {

            return message.reply(
                "❌ Bu komutu yalnızca Yönetici kullanabilir."
            );
        }

        const amount =
            Number(args[1]);

        if (
            !Number.isInteger(amount) ||
            amount < 1 ||
            amount > 1000
        ) {

            return message.reply(
                "❌ 1 ile 1000 arasında bir sayı yaz."
            );
        }

        try {

            await message.channel.bulkDelete(
                amount + 1,
                true
            );

            const msg =
                await message.channel.send(
                    `🗑️ **${amount}** mesaj silindi.`
                );

            setTimeout(
                () => msg.delete().catch(() => {}),
                3000
            );

        } catch (error) {

            console.error(error);

            return message.reply(
                "❌ Mesajlar silinemedi."
            );
        }

        return;
    }

    // ========================================================
    // EMBED
    // ========================================================

    if (command === ".embed") {

        if (!isAdmin(message.member)) {

            return message.reply(
                "❌ Bu komutu yalnızca Yönetici kullanabilir."
            );
        }

        const text =
            args.slice(1).join(" ");

        if (!text) {

            return message.reply(
                "❌ Kullanım: `.embed mesaj`"
            );
        }

        const embed =
            new EmbedBuilder()
                .setDescription(text)
                .setColor(0x2b2d31)
                .setTimestamp();

        return message.channel.send({
            embeds: [embed]
        });
    }

    // ========================================================
    // DM ALL
    // ========================================================

    if (
        command === ".dm" &&
        args[1]?.toLowerCase() === "all"
    ) {

        if (
            !canUse(
                message.member,
                CONFIG.roles.DM_YETKILISI
            )
        ) {

            return message.reply(
                "❌ DM yetkin yok."
            );
        }

        const text =
            args.slice(2).join(" ");

        if (!text) {

            return message.reply(
                "❌ Gönderilecek mesajı yaz."
            );
        }

        await message.reply(
            "📨 DM gönderimi başlatıldı."
        );

        let sent = 0;
        let failed = 0;

        for (
            const member
            of message.guild.members.cache.values()
        ) {

            if (member.user.bot) continue;

            try {

                await member.send(text);

                sent++;

            } catch {

                failed++;
            }
        }

        return message.channel.send(
            `📨 DM sistemi tamamlandı.\n` +
            `✅ Başarılı: **${sent}**\n` +
            `❌ Başarısız: **${failed}**`
        );
    }

    // ========================================================
    // TWEET
    // ========================================================

    if (command === ".tweet") {

        if (
            !canUse(
                message.member,
                CONFIG.roles.MEDYA_YETKILISI
            )
        ) {

            return message.reply(
                "❌ Medya yetkin yok."
            );
        }

        const text =
            args.slice(1).join(" ");

        if (!text) {

            return message.reply(
                "❌ Tweet mesajını yaz."
            );
        }

        const embed =
            new EmbedBuilder()
                .setAuthor({
                    name: message.member.displayName,
                    iconURL:
                        message.member.displayAvatarURL()
                })
                .setDescription(text)
                .setFooter({
                    text: "Axera League • X"
                })
                .setTimestamp()
                .setColor(0x2b2d31);

        return message.channel.send({
            embeds: [embed]
        });
    }

    // ========================================================
    // ROL PANELİ
    // ========================================================

    if (
        command === ".rolpanel" ||
        command === ".rolpaneli"
    ) {

        if (!isAdmin(message.member)) {

            return message.reply(
                "❌ Yalnızca Yönetici kullanabilir."
            );
        }

        const embed =
            new EmbedBuilder()
                .setTitle("🎭 Rol Paneli")
                .setDescription(
                    "Aşağıdaki butonlardan rolünü seçebilirsin."
                )
                .setColor(0x2b2d31);

        const row =
            new ActionRowBuilder()
                .addComponents(

                    new ButtonBuilder()
                        .setCustomId("self_role_player")
                        .setLabel("Futbolcu")
                        .setEmoji("⚽")
                        .setStyle(ButtonStyle.Success),

                    new ButtonBuilder()
                        .setCustomId("self_role_keeper")
                        .setLabel("Kaleci")
                        .setEmoji("🧤")
                        .setStyle(ButtonStyle.Primary),

                    new ButtonBuilder()
                        .setCustomId("self_role_manager")
                        .setLabel("Teknik Direktör")
                        .setEmoji("🧠")
                        .setStyle(ButtonStyle.Secondary)
                );

        return message.channel.send({
            embeds: [embed],
            components: [row]
        });
    }

    // ========================================================
    // ÇEKİLİŞ
    // ========================================================

    if (
        command === ".çekiliş" ||
        command === ".cekilis"
    ) {

        if (
            !canUse(
                message.member,
                CONFIG.roles.CEKILIS_YETKILISI
            )
        ) {

            return message.reply(
                "❌ Çekiliş yetkin yok."
            );
        }

        const prize =
            args[1];

        const timeValue =
            Number(args[2]);

        const timeUnit =
            args[3]?.toLowerCase();

        if (
            !prize ||
            !Number.isFinite(timeValue) ||
            !timeUnit
        ) {

            return message.reply(
                "❌ Örnek: `.çekiliş 5M€ 5 saat`"
            );
        }

        let duration;

        if (
            timeUnit.startsWith("saniye")
        ) {

            duration =
                timeValue * 1000;

        } else if (
            timeUnit.startsWith("dakika")
        ) {

            duration =
                timeValue * 60 * 1000;

        } else if (
            timeUnit.startsWith("saat")
        ) {

            duration =
                timeValue * 60 * 60 * 1000;

        } else {

            return message.reply(
                "❌ Zaman birimi saniye, dakika veya saat olmalı."
            );
        }

        if (duration <= 0) {

            return message.reply(
                "❌ Geçerli bir süre gir."
            );
        }

        const giveawayId =
            `${message.id}_${Date.now()}`;

        data.giveaways[giveawayId] = {
            channelId: message.channel.id,
            messageId: null,
            prize,
            creator: message.author.id,
            participants: [],
            endsAt: Date.now() + duration,
            active: true
        };

        const embed =
            new EmbedBuilder()
                .setTitle("🎉 ÇEKİLİŞ")
                .setDescription(
                    `🎁 Ödül: **${prize}**\n\n` +
                    `👤 Başlatan: ${message.member}\n` +
                    `⏰ Süre: **${timeValue} ${timeUnit}**\n\n` +
                    `Katılmak için 🎉 butonuna bas!`
                )
                .setColor(0x2b2d31)
                .setTimestamp(
                    Date.now() + duration
                );

        const row =
            new ActionRowBuilder()
                .addComponents(

                    new ButtonBuilder()
                        .setCustomId(
                            `giveaway_join_${giveawayId}`
                        )
                        .setLabel("Katıl")
                        .setEmoji("🎉")
                        .setStyle(ButtonStyle.Success)
                );

        const giveawayMessage =
            await message.channel.send({
                embeds: [embed],
                components: [row]
            });

        data.giveaways[giveawayId].messageId =
            giveawayMessage.id;

        saveData();

        setTimeout(
            async () => {

                const giveaway =
                    data.giveaways[giveawayId];

                if (!giveaway || !giveaway.active) {
                    return;
                }

                giveaway.active = false;

                saveData();

                const participants =
                    giveaway.participants;

                if (!participants.length) {

                    return giveawayMessage.edit({
                        content:
                            "❌ Çekilişe katılan olmadı.",
                        components: []
                    });
                }

                const winnerId =
                    participants[
                        Math.floor(
                            Math.random() *
                            participants.length
                        )
                    ];

                await giveawayMessage.edit({
                    content:
                        `🎉 Tebrikler <@${winnerId}>!\n` +
                        `🎁 Ödül: **${giveaway.prize}**`,
                    components: []
                });

            },
            duration
        );

        return;
    }

    // ========================================================
    // KANAL KİLİT
    // ========================================================

    if (
        command === ".kilitle" ||
        command === ".kanalkilitle"
    ) {

        if (
            !canUse(
                message.member,
                CONFIG.roles.KANAL_KILITLEME_YETKILISI
            )
        ) {

            return message.reply(
                "❌ Kanal kilitleme yetkin yok."
            );
        }

        try {

            await message.channel.permissionOverwrites.edit(
                message.guild.roles.everyone,
                {
                    SendMessages: false
                }
            );

            return message.reply(
                "🔒 Kanal kilitlendi."
            );

        } catch (error) {

            console.error(error);

            return message.reply(
                "❌ Kanal kilitlenemedi."
            );
        }
    }

    // ========================================================
    // KANAL AÇ
    // ========================================================

    if (
        command === ".aç" ||
        command === ".ac" ||
        command === ".kanalac"
    ) {

        if (
            !canUse(
                message.member,
                CONFIG.roles.KANAL_ACMA_YETKILISI
            )
        ) {

            return message.reply(
                "❌ Kanal açma yetkin yok."
            );
        }

        try {

            await message.channel.permissionOverwrites.edit(
                message.guild.roles.everyone,
                {
                    SendMessages: true
                }
            );

            return message.reply(
                "🔓 Kanal açıldı."
            );

        } catch (error) {

            console.error(error);

            return message.reply(
                "❌ Kanal açılamadı."
            );
        }
    }

});

// ============================================================
// ÇEKİLİŞ BUTONU
// ============================================================

client.on("interactionCreate", async interaction => {

    if (!interaction.isButton()) return;

    const id = interaction.customId;

    // --------------------------------------------------------
    // SELF ROLE
    // --------------------------------------------------------

    if (
        id === "self_role_player" ||
        id === "self_role_keeper" ||
        id === "self_role_manager"
    ) {

        let roleId;

        if (id === "self_role_player") {

            roleId = CONFIG.roles.FUTBOLCU;

        } else if (id === "self_role_keeper") {

            roleId = CONFIG.roles.KALECI;

        } else {

            roleId = CONFIG.roles.TEKNIK_DIREKTOR;
        }

        const role =
            getRole(
                interaction.guild,
                roleId
            );

        if (!role) {

            return interaction.reply({
                content:
                    "❌ Rol bulunamadı.",
                ephemeral: true
            });
        }

        try {

            await interaction.member.roles.add(
                role,
                "Rol paneli"
            );

            return interaction.reply({
                content:
                    `✅ ${role} rolü verildi.`,
                ephemeral: true
            });

        } catch {

            return interaction.reply({
                content:
                    "❌ Rol verilemedi.",
                ephemeral: true
            });
        }
    }

    // --------------------------------------------------------
    // GIVEAWAY
    // --------------------------------------------------------

    if (
        id.startsWith("giveaway_join_")
    ) {

        const giveawayId =
            id.replace(
                "giveaway_join_",
                ""
            );

        const giveaway =
            data.giveaways[giveawayId];

        if (!giveaway) {

            return interaction.reply({
                content:
                    "❌ Çekiliş bulunamadı.",
                ephemeral: true
            });
        }

        if (!giveaway.active) {

            return interaction.reply({
                content:
                    "❌ Bu çekiliş sona erdi.",
                ephemeral: true
            });
        }

        if (
            !giveaway.participants.includes(
                interaction.user.id
            )
        ) {

            giveaway.participants.push(
                interaction.user.id
            );

            saveData();

            return interaction.reply({
                content:
                    "🎉 Çekilişe katıldın!",
                ephemeral: true
            });

        } else {

            return interaction.reply({
                content:
                    "ℹ️ Zaten çekilişe katıldın.",
                ephemeral: true
            });
        }
    }

});

// ============================================================
// HAZIR
// ============================================================

client.once("ready", () => {

    console.log("======================================");
    console.log("AXERA LEAGUE BOT AKTİF");
    console.log(`Bot: ${client.user.tag}`);
    console.log(`Sunucu: ${client.guilds.cache.size}`);
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

// ============================================================
// HATALAR
// ============================================================

process.on("unhandledRejection", error => {
    console.error(
        "Unhandled Rejection:",
        error
    );
});

process.on("uncaughtException", error => {
    console.error(
        "Uncaught Exception:",
        error
    );
});

// ============================================================
// LOGIN
// ============================================================

client.login(TOKEN);
