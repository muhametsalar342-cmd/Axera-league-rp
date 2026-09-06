const {
    Client,
    GatewayIntentBits,
    Partials,
    PermissionsBitField,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType
} = require("discord.js");

const fs = require("fs");
const path = require("path");

/* =====================================================
   AXERA LEAGUE
   Prefix: .
===================================================== */

const TOKEN = process.env.TOKEN;
const PREFIX = ".";

const ROLES = {
    YONETICI: "1544449436011339806",
    KAYIT_YETKILISI: "1544452022764568656",
    DEGER_YETKILISI: "1544451743746891806",
    MODERATOR: "1544450307088715917",
    TEKNIK_DIREKTOR: "1544452323450032229",
    OYUNCU: "1544452779156709516",
    KAYITSIZ: "1544488182027133030"
};

/* =====================================================
   CLIENT
===================================================== */

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [
        Partials.Channel,
        Partials.Message
    ]
});

/* =====================================================
   DATABASE
===================================================== */

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "database.json");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {
        recursive: true
    });
}

const defaultDB = {
    players: {},
    budgets: {},
    goals: {},
    assists: {},
    matches: [],
    fixtures: [],
    giveaways: {},
    tickets: {},
    pendingRegistrations: {},
    cooldowns: {
        training: {},
        penalty: {}
    }
};

function loadDB() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            fs.writeFileSync(
                DB_FILE,
                JSON.stringify(defaultDB, null, 2)
            );

            return JSON.parse(
                JSON.stringify(defaultDB)
            );
        }

        const data = JSON.parse(
            fs.readFileSync(DB_FILE, "utf8")
        );

        return {
            ...JSON.parse(
                JSON.stringify(defaultDB)
            ),
            ...data,
            players: data.players || {},
            budgets: data.budgets || {},
            goals: data.goals || {},
            assists: data.assists || {},
            matches: data.matches || [],
            fixtures: data.fixtures || [],
            giveaways: data.giveaways || {},
            tickets: data.tickets || {},
            pendingRegistrations:
                data.pendingRegistrations || {},
            cooldowns: {
                training:
                    data.cooldowns?.training || {},
                penalty:
                    data.cooldowns?.penalty || {}
            }
        };
    } catch (error) {
        console.error(
            "Database okunamadı:",
            error
        );

        return JSON.parse(
            JSON.stringify(defaultDB)
        );
    }
}

let db = loadDB();

function saveDB() {
    try {
        fs.writeFileSync(
            DB_FILE,
            JSON.stringify(db, null, 2)
        );
    } catch (error) {
        console.error(
            "Database kaydedilemedi:",
            error
        );
    }
}

/* =====================================================
   GENEL FONKSİYONLAR
===================================================== */

function getPlayer(userId) {
    if (!db.players[userId]) {
        db.players[userId] = {
            registered: false,
            name: "",
            country: "🇧🇷",
            position: "SNT",
            value: 0,
            roleType: ""
        };
    }

    return db.players[userId];
}

function getBudget(userId) {
    if (
        typeof db.budgets[userId] !==
        "number"
    ) {
        db.budgets[userId] = 0;
    }

    return db.budgets[userId];
}

function formatMoney(number) {
    return Number(number || 0)
        .toLocaleString("tr-TR")
        .replace(/\s/g, ".");
}

function money(number) {
    return `${formatMoney(number)}€`;
}

/*
    .dver @oyuncu 5
    5 = 5.000.000€

    .dver @oyuncu 1.5
    1.5 = 1.500.000€
*/

function parseMillion(value) {
    if (!value) return null;

    let text = String(value)
        .trim()
        .toLowerCase()
        .replace(/€/g, "")
        .replace(/m/g, "");

    if (
        text.includes(",") &&
        text.includes(".")
    ) {
        text = text.replace(/\./g, "");
    }

    const number = Number(
        text.replace(",", ".")
    );

    if (!Number.isFinite(number)) {
        return null;
    }

    return Math.floor(
        number * 1000000
    );
}

function getMention(message) {
    return message.mentions.members.first();
}

function getTextAfterMention(message) {
    const match =
        message.content.match(
            /^\.?\S+\s+<@!?\d+>\s*(.*)$/s
        );

    return match
        ? match[1].trim()
        : "";
}

function getAmountAfterMention(message) {
    const text =
        getTextAfterMention(message);

    if (!text) return null;

    const first =
        text.split(/\s+/)[0];

    return parseMillion(first);
}

function cleanName(name) {
    return String(name || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 32);
}

function isAdmin(member) {
    return Boolean(
        member &&
        (
            member.permissions.has(
                PermissionsBitField.Flags.Administrator
            ) ||
            member.roles.cache.has(
                ROLES.YONETICI
            )
        )
    );
}

function isModerator(member) {
    return Boolean(
        member &&
        (
            isAdmin(member) ||
            member.roles.cache.has(
                ROLES.MODERATOR
            )
        )
    );
}

function isKayitYetkilisi(member) {
    return Boolean(
        member &&
        (
            isAdmin(member) ||
            member.roles.cache.has(
                ROLES.KAYIT_YETKILISI
            )
        )
    );
}

function isDegerYetkilisi(member) {
    return Boolean(
        member &&
        (
            isAdmin(member) ||
            member.roles.cache.has(
                ROLES.DEGER_YETKILISI
            )
        )
    );
}

async function reply(message, text) {
    return message.reply({
        content: text,
        allowedMentions: {
            repliedUser: false
        }
    }).catch(() => null);
}

/* =====================================================
   KAYIT
===================================================== */

async function registerCommand(message) {
    if (!message.guild) return;

    if (!isKayitYetkilisi(message.member)) {
        return reply(
            message,
            "❌ Bu komutu sadece **Kayıt Yetkilisi** kullanabilir."
        );
    }

    const target =
        getMention(message);

    if (!target) {
        return reply(
            message,
            "❌ Kullanım: `.k @oyuncu İsim`"
        );
    }

    const name =
        cleanName(
            getTextAfterMention(message)
        );

    if (!name) {
        return reply(
            message,
            "❌ Oyuncunun ismini yazmalısın."
        );
    }

    db.pendingRegistrations[message.id] = {
        targetId: target.id,
        name,
        createdBy: message.author.id,
        createdAt: Date.now()
    };

    saveDB();

    const row =
        new ActionRowBuilder()
            .addComponents(

                new ButtonBuilder()
                    .setCustomId(
                        `kayit_teknik_${target.id}_${message.id}`
                    )
                    .setLabel(
                        "Teknik Direktör"
                    )
                    .setEmoji("🔧")
                    .setStyle(
                        ButtonStyle.Primary
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        `kayit_uye_${target.id}_${message.id}`
                    )
                    .setLabel("Üye")
                    .setEmoji("👤")
                    .setStyle(
                        ButtonStyle.Secondary
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        `kayit_kaleci_${target.id}_${message.id}`
                    )
                    .setLabel("Kaleci")
                    .setEmoji("🧤")
                    .setStyle(
                        ButtonStyle.Success
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        `kayit_futbolcu_${target.id}_${message.id}`
                    )
                    .setLabel("Futbolcu")
                    .setEmoji("⚽")
                    .setStyle(
                        ButtonStyle.Success
                    )
            );

    const embed =
        new EmbedBuilder()
            .setTitle(
                "📝 Axera League Kayıt"
            )
            .setDescription(
                `**Oyuncu:** ${target}\n` +
                `**İsim:** ${name}\n\n` +
                `Kayıt türünü seçin.`
            );

    return message.reply({
        embeds: [embed],
        components: [row]
    });
}

/* =====================================================
   KAYIT BUTONLARI
===================================================== */

async function registerButton(interaction) {
    if (!isKayitYetkilisi(interaction.member)) {
        return interaction.reply({
            content:
                "❌ Bu işlemi sadece **Kayıt Yetkilisi** yapabilir.",
            ephemeral: true
        });
    }

    const parts =
        interaction.customId.split("_");

    const type = parts[1];
    const targetId = parts[2];
    const commandMessageId =
        parts.slice(3).join("_");

    const pending =
        db.pendingRegistrations[
            commandMessageId
        ];

    if (!pending) {
        return interaction.reply({
            content:
                "❌ Kayıt işlemi bulunamadı.",
            ephemeral: true
        });
    }

    const target =
        await interaction.guild.members
            .fetch(targetId)
            .catch(() => null);

    if (!target) {
        return interaction.reply({
            content:
                "❌ Oyuncu bulunamadı.",
            ephemeral: true
        });
    }

    const botMember =
        interaction.guild.members.me;

    if (
        !botMember.permissions.has(
            PermissionsBitField.Flags.ManageNicknames
        )
    ) {
        return interaction.reply({
            content:
                "❌ Botta **Takma Adları Yönet** yetkisi yok.",
            ephemeral: true
        });
    }

    if (
        target.id !==
        interaction.guild.ownerId &&
        botMember.roles.highest.comparePositionTo(
            target.roles.highest
        ) <= 0
    ) {
        return interaction.reply({
            content:
                "❌ Botun rolü oyuncunun rolünden yüksek olmalı.",
            ephemeral: true
        });
    }

    /*
        Kayıt bittiği anda isim değişir.
    */

    await target.setNickname(
        pending.name,
        "Axera League kayıt"
    ).catch(() => null);

    const player =
        getPlayer(target.id);

    player.registered = true;
    player.name = pending.name;
    player.roleType = type;

    /*
        Ülke ve pozisyon korunur.
    */

    if (!player.country) {
        player.country = "🇧🇷";
    }

    if (!player.position) {
        player.position = "SNT";
    }

    /*
        Kayıtsız rolünü kaldır.
    */

    if (
        target.roles.cache.has(
            ROLES.KAYITSIZ
        )
    ) {
        await target.roles
            .remove(
                ROLES.KAYITSIZ,
                "Kayıt tamamlandı"
            )
            .catch(() => {});
    }

    /*
        Seçilen role göre rol ver.
    */

    let roleId = null;

    if (type === "teknik") {
        roleId = ROLES.TEKNIK_DIREKTOR;
    }

    if (
        type === "kaleci" ||
        type === "futbolcu"
    ) {
        roleId = ROLES.OYUNCU;
    }

    if (roleId) {
        const role =
            interaction.guild.roles.cache.get(
                roleId
            );

        if (
            role &&
            botMember.roles.highest.comparePositionTo(
                role
            ) > 0
        ) {
            await target.roles
                .add(
                    role,
                    "Axera League kayıt"
                )
                .catch(() => {});
        }
    }

    if (
        typeof db.budgets[target.id] !==
        "number"
    ) {
        db.budgets[target.id] = 0;
    }

    delete db.pendingRegistrations[
        commandMessageId
    ];

    saveDB();

    const typeText = {
        teknik: "Teknik Direktör",
        uye: "Üye",
        kaleci: "Kaleci",
        futbolcu: "Futbolcu"
    }[type] || "Üye";

    const embed =
        new EmbedBuilder()
            .setTitle(
                "✅ Kayıt Tamamlandı"
            )
            .setDescription(
                `👤 **Oyuncu:** ${target}\n` +
                `📝 **İsim:** ${pending.name}\n` +
                `🎭 **Tür:** ${typeText}`
            );

    return interaction.update({
        embeds: [embed],
        components: []
    });
}

/* =====================================================
   DEĞER VER
===================================================== */

async function valueGive(message) {
    if (!isDegerYetkilisi(message.member)) {
        return reply(
            message,
            "❌ Bu komutu sadece **Değer Yetkilisi** kullanabilir."
        );
    }

    const target =
        getMention(message);

    if (!target) {
        return reply(
            message,
            "❌ Kullanım: `.dver @oyuncu 5`"
        );
    }

    const amount =
        getAmountAfterMention(message);

    if (!amount || amount <= 0) {
        return reply(
            message,
            "❌ Geçerli bir miktar yaz.\nÖrnek: `.dver @oyuncu 5`"
        );
    }

    const player =
        getPlayer(target.id);

    const oldValue =
        Number(player.value) || 0;

    player.value =
        oldValue + amount;

    saveDB();

    /*
       İsim / ülke / pozisyon değiştirilmez.
    */

    return reply(
        message,
        `✅ ${target} oyuncusuna **${money(amount)}** değer eklendi.\n\n` +
        `📈 Yeni değer:\n` +
        `**${player.name || target.displayName} | ${player.country} | ${player.position} | ${money(player.value)}**`
    );
}

/* =====================================================
   DEĞER SİL
===================================================== */

async function valueRemove(message) {
    if (!isDegerYetkilisi(message.member)) {
        return reply(
            message,
            "❌ Bu komutu sadece **Değer Yetkilisi** kullanabilir."
        );
    }

    const target =
        getMention(message);

    if (!target) {
        return reply(
            message,
            "❌ Kullanım: `.dsil @oyuncu 5`"
        );
    }

    const amount =
        getAmountAfterMention(message);

    if (!amount || amount <= 0) {
        return reply(
            message,
            "❌ Geçerli bir miktar yaz."
        );
    }

    const player =
        getPlayer(target.id);

    const oldValue =
        Number(player.value) || 0;

    player.value =
        Math.max(
            0,
            oldValue - amount
        );

    saveDB();

    return reply(
        message,
        `✅ ${target} oyuncusundan **${money(amount)}** değer silindi.\n\n` +
        `📉 Yeni değer:\n` +
        `**${player.name || target.displayName} | ${player.country} | ${player.position} | ${money(player.value)}**`
    );
}

/* =====================================================
   BÜTÇE
===================================================== */

async function budget(message) {
    const amount =
        getBudget(message.author.id);

    return reply(
        message,
        `💰 **Kişisel Bütçen:** ${money(amount)}`
    );
}

/* =====================================================
   BÜTÇE EKLE
===================================================== */

async function budgetAdd(message) {
    if (!isDegerYetkilisi(message.member)) {
        return reply(
            message,
            "❌ Bu komutu sadece **Değer Yetkilisi** kullanabilir."
        );
    }

    const target =
        getMention(message);

    if (!target) {
        return reply(
            message,
            "❌ Kullanım: `.bütçeekle @oyuncu 5`"
        );
    }

    const amount =
        getAmountAfterMention(message);

    if (!amount || amount <= 0) {
        return reply(
            message,
            "❌ Geçerli bir miktar yaz."
        );
    }

    const old =
        getBudget(target.id);

    db.budgets[target.id] =
        old + amount;

    saveDB();

    return reply(
        message,
        `✅ ${target} oyuncusunun bütçesine **${money(amount)}** eklendi.\n` +
        `💰 Yeni bütçe: **${money(db.budgets[target.id])}**`
    );
}

/* =====================================================
   BÜTÇE SİL
===================================================== */

async function budgetRemove(message) {
    if (!isDegerYetkilisi(message.member)) {
        return reply(
            message,
            "❌ Bu komutu sadece **Değer Yetkilisi** kullanabilir."
        );
    }

    const target =
        getMention(message);

    if (!target) {
        return reply(
            message,
            "❌ Kullanım: `.bütçesil @oyuncu 5`"
        );
    }

    const amount =
        getAmountAfterMention(message);

    if (!amount || amount <= 0) {
        return reply(
            message,
            "❌ Geçerli bir miktar yaz."
        );
    }

    const old =
        getBudget(target.id);

    db.budgets[target.id] =
        Math.max(
            0,
            old - amount
        );

    saveDB();

    return reply(
        message,
        `✅ ${target} oyuncusunun bütçesinden **${money(amount)}** silindi.\n` +
        `💰 Yeni bütçe: **${money(db.budgets[target.id])}**`
    );
}

/* =====================================================
   BÜTÇE GÖNDER
===================================================== */

async function budgetSend(message) {
    const target =
        getMention(message);

    if (!target) {
        return reply(
            message,
            "❌ Kullanım: `.gönder @oyuncu 5`"
        );
    }

    if (
        target.id ===
        message.author.id
    ) {
        return reply(
            message,
            "❌ Kendine para gönderemezsin."
        );
    }

    const amount =
        getAmountAfterMention(message);

    if (!amount || amount <= 0) {
        return reply(
            message,
            "❌ Geçerli bir miktar yaz."
        );
    }

    const sender =
        getBudget(message.author.id);

    if (sender < amount) {
        return reply(
            message,
            `❌ Yeterli bütçen yok.\nBütçen: **${money(sender)}**`
        );
    }

    db.budgets[message.author.id] =
        sender - amount;

    db.budgets[target.id] =
        getBudget(target.id) + amount;

    saveDB();

    return reply(
        message,
        `✅ ${target} oyuncusuna **${money(amount)}** gönderildi.\n\n` +
        `💰 Senin bütçen: **${money(db.budgets[message.author.id])}**`
    );
}

/* =====================================================
   ANTRENMAN
===================================================== */

const TRAINING_COOLDOWN =
    60 * 60 * 1000;

async function training(message) {
    const now =
        Date.now();

    const last =
        db.cooldowns.training[
            message.author.id
        ] || 0;

    if (
        now - last <
        TRAINING_COOLDOWN
    ) {
        const remaining =
            Math.ceil(
                (
                    TRAINING_COOLDOWN -
                    (now - last)
                ) / 60000
            );

        return reply(
            message,
            `⏳ Antrenman için **${remaining} dakika** beklemelisin.`
        );
    }

    db.cooldowns.training[
        message.author.id
    ] = now;

    const player =
        getPlayer(message.author.id);

    player.value =
        (Number(player.value) || 0) +
        5000000;

    saveDB();

    return reply(
        message,
        `🏃 **Antrenman tamamlandı!**\n\n` +
        `💰 Değer ödülü: **+5.000.000€**\n` +
        `📈 Yeni değer: **${money(player.value)}**`
    );
}

/* =====================================================
   PENALTI
===================================================== */

const PENALTY_COOLDOWN =
    30 * 60 * 1000;

async function penalty(message) {
    const now =
        Date.now();

    const last =
        db.cooldowns.penalty[
            message.author.id
        ] || 0;

    if (
        now - last <
        PENALTY_COOLDOWN
    ) {
        const remaining =
            Math.ceil(
                (
                    PENALTY_COOLDOWN -
                    (now - last)
                ) / 60000
            );

        return reply(
            message,
            `⏳ Penaltı için **${remaining} dakika** beklemelisin.`
        );
    }

    db.cooldowns.penalty[
        message.author.id
    ] = now;

    const goal =
        Math.random() < 0.5;

    if (!goal) {
        saveDB();

        return reply(
            message,
            "🥅 **Penaltı kaçtı!**\n\nDeğer ödülü yok."
        );
    }

    const player =
        getPlayer(message.author.id);

    player.value =
        (Number(player.value) || 0) +
        5000000;

    db.goals[message.author.id] =
        (db.goals[message.author.id] || 0) +
        1;

    saveDB();

    return reply(
        message,
        `⚽ **GOOOL!**\n\n` +
        `💰 Değer ödülü: **+5.000.000€**\n` +
        `📈 Yeni değer: **${money(player.value)}**\n` +
        `⚽ Gol sayın: **${db.goals[message.author.id]}**`
    );
}

/* =====================================================
   KADRO
===================================================== */

async function squad(message) {
    const entries =
        Object.entries(db.players)
            .filter(
                ([, player]) =>
                    player.registered
            );

    if (!entries.length) {
        return reply(
            message,
            "❌ Henüz kayıtlı oyuncu yok."
        );
    }

    const lines = [];

    let i = 1;

    for (
        const [userId, player]
        of entries.slice(0, 50)
    ) {
        lines.push(
            `**${i}.** ${player.name || "İsimsiz"} | ` +
            `${player.country || "🌍"} | ` +
            `${player.position || "SNT"} | ` +
            `${money(player.value)}`
        );

        i++;
    }

    const embed =
        new EmbedBuilder()
            .setTitle(
                "👥 Axera League Kadro"
            )
            .setDescription(
                lines.join("\n")
            );

    return message.reply({
        embeds: [embed]
    });
}

/* =====================================================
   GOL KRALLIĞI
===================================================== */

async function goalKing(message) {
    const entries =
        Object.entries(db.goals)
            .sort(
                (a, b) =>
                    b[1] - a[1]
            );

    if (!entries.length) {
        return reply(
            message,
            "⚽ Henüz gol kaydı yok."
        );
    }

    const lines = [];

    let rank = 1;

    for (
        const [userId, goals]
        of entries.slice(0, 20)
    ) {
        const player =
            getPlayer(userId);

        lines.push(
            `**${rank}.** ${player.name || `<@${userId}>`} — **${goals} gol**`
        );

        rank++;
    }

    const embed =
        new EmbedBuilder()
            .setTitle(
                "⚽ Gol Krallığı"
            )
            .setDescription(
                lines.join("\n")
            );

    return message.reply({
        embeds: [embed]
    });
}

/* =====================================================
   ASİST KRALLIĞI
===================================================== */

async function assistKing(message) {
    const entries =
        Object.entries(db.assists)
            .sort(
                (a, b) =>
                    b[1] - a[1]
            );

    if (!entries.length) {
        return reply(
            message,
            "🅰️ Henüz asist kaydı yok."
        );
    }

    const lines = [];

    let rank = 1;

    for (
        const [userId, assists]
        of entries.slice(0, 20)
    ) {
        const player =
            getPlayer(userId);

        lines.push(
            `**${rank}.** ${player.name || `<@${userId}>`} — **${assists} asist**`
        );

        rank++;
    }

    const embed =
        new EmbedBuilder()
            .setTitle(
                "🅰️ Asist Krallığı"
            )
            .setDescription(
                lines.join("\n")
            );

    return message.reply({
        embeds: [embed]
    });
}

/* =====================================================
   MAÇ
===================================================== */

async function match(message, args) {
    if (!isModerator(message.member)) {
        return reply(
            message,
            "❌ Bu komutu sadece yetkililer kullanabilir."
        );
    }

    if (args.length < 2) {
        return reply(
            message,
            "❌ Kullanım: `.maç Takım1 Takım2`"
        );
    }

    const home =
        args[0];

    const away =
        args.slice(1).join(" ");

    const id =
        Date.now().toString();

    db.matches.push({
        id,
        home,
        away,
        homeScore: null,
        awayScore: null,
        status: "Planlandı",
        createdAt: Date.now()
    });

    saveDB();

    return reply(
        message,
        `⚽ **Maç oluşturuldu!**\n\n` +
        `🏠 ${home}\n` +
        `🆚\n` +
        `✈️ ${away}\n\n` +
        `🆔 Maç ID: **${id}**`
    );
}

/* =====================================================
   MAÇ SONUÇ
===================================================== */

async function matchResult(message, args) {
    if (!isModerator(message.member)) {
        return reply(
            message,
            "❌ Bu komutu sadece yetkililer kullanabilir."
        );
    }

    if (args.length < 3) {
        return reply(
            message,
            "❌ Kullanım: `.maçsonuç MAÇ_ID 2 1`"
        );
    }

    const id =
        args[0];

    const homeScore =
        Number(args[1]);

    const awayScore =
        Number(args[2]);

    if (
        !Number.isInteger(homeScore) ||
        !Number.isInteger(awayScore) ||
        homeScore < 0 ||
        awayScore < 0
    ) {
        return reply(
            message,
            "❌ Geçerli skor gir."
        );
    }

    const found =
        db.matches.find(
            x => x.id === id
        );

    if (!found) {
        return reply(
            message,
            "❌ Maç bulunamadı."
        );
    }

    found.homeScore =
        homeScore;

    found.awayScore =
        awayScore;

    found.status =
        "Tamamlandı";

    saveDB();

    return reply(
        message,
        `✅ Sonuç kaydedildi:\n\n` +
        `**${found.home} ${homeScore} - ${awayScore} ${found.away}**`
    );
}

/* =====================================================
   FİKSTÜR
===================================================== */

async function fixture(message) {
    if (!db.matches.length) {
        return reply(
            message,
            "📅 Henüz fikstür yok."
        );
    }

    const lines =
        db.matches
            .slice(-30)
            .map((m, index) => {
                const score =
                    m.homeScore !== null
                        ? `${m.homeScore} - ${m.awayScore}`
                        : "Planlandı";

                return (
                    `**${index + 1}.** ` +
                    `${m.home} 🆚 ${m.away} — **${score}**`
                );
            });

    const embed =
        new EmbedBuilder()
            .setTitle(
                "📅 Axera League Fikstür"
            )
            .setDescription(
                lines.join("\n")
            );

    return message.reply({
        embeds: [embed]
    });
}

/* =====================================================
   ÇEKİLİŞ
===================================================== */

async function giveaway(message, args) {
    if (!isModerator(message.member)) {
        return reply(
            message,
            "❌ Bu komutu sadece yetkililer kullanabilir."
        );
    }

    if (args.length < 2) {
        return reply(
            message,
            "❌ Kullanım: `.çekiliş süre ödül`"
        );
    }

    const minutes =
        Number(args[0]);

    if (
        !Number.isFinite(minutes) ||
        minutes <= 0
    ) {
        return reply(
            message,
            "❌ Geçerli süre yaz."
        );
    }

    const prize =
        args.slice(1).join(" ");

    const id =
        Date.now().toString();

    const end =
        Date.now() +
        minutes * 60 * 1000;

    const embed =
        new EmbedBuilder()
            .setTitle(
                "🎉 Axera League Çekiliş"
            )
            .setDescription(
                `🎁 **Ödül:** ${prize}\n\n` +
                `⏰ **Süre:** ${minutes} dakika\n\n` +
                `Katılmak için **Katıl** butonuna bas.`
            );

    const row =
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `cekilis_${id}`
                    )
                    .setLabel("Katıl")
                    .setEmoji("🎉")
                    .setStyle(
                        ButtonStyle.Success
                    )
            );

    const sent =
        await message.channel.send({
            embeds: [embed],
            components: [row]
        });

    db.giveaways[id] = {
        messageId: sent.id,
        channelId:
            message.channel.id,
        prize,
        end,
        participants: [],
        finished: false
    };

    saveDB();

    setTimeout(
        () => finishGiveaway(id),
        minutes * 60 * 1000
    );
}

async function finishGiveaway(id) {
    const giveaway =
        db.giveaways[id];

    if (
        !giveaway ||
        giveaway.finished
    ) {
        return;
    }

    giveaway.finished = true;

    saveDB();

    const channel =
        await client.channels
            .fetch(
                giveaway.channelId
            )
            .catch(() => null);

    if (!channel) return;

    const msg =
        await channel.messages
            .fetch(
                giveaway.messageId
            )
            .catch(() => null);

    if (!msg) return;

    if (
        !giveaway.participants.length
    ) {
        return msg.edit({
            content:
                "❌ Çekilişe katılan olmadı.",
            components: []
        });
    }

    const winner =
        giveaway.participants[
            Math.floor(
                Math.random() *
                giveaway.participants.length
            )
        ];

    const embed =
        new EmbedBuilder()
            .setTitle(
                "🎉 Çekiliş Sona Erdi"
            )
            .setDescription(
                `🎁 **Ödül:** ${giveaway.prize}\n\n` +
                `🏆 **Kazanan:** <@${winner}>`
            );

    await msg.edit({
        embeds: [embed],
        components: []
    });
}

/* =====================================================
   TICKET PANEL
===================================================== */

async function ticketPanel(message) {
    if (!isModerator(message.member)) {
        return reply(
            message,
            "❌ Bu komutu sadece yetkililer kullanabilir."
        );
    }

    const embed =
        new EmbedBuilder()
            .setTitle(
                "🎫 Axera League Ticket"
            )
            .setDescription(
                "Destek almak için aşağıdaki butona bas."
            );

    const row =
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        "ticket_ac"
                    )
                    .setLabel(
                        "Ticket Aç"
                    )
                    .setEmoji("🎫")
                    .setStyle(
                        ButtonStyle.Primary
                    )
            );

    return message.channel.send({
        embeds: [embed],
        components: [row]
    });
}

/* =====================================================
   TICKET OLUŞTUR
===================================================== */

async function createTicket(interaction) {
    const guild =
        interaction.guild;

    const exists =
        Object.values(db.tickets)
            .find(
                x =>
                    x.guildId === guild.id &&
                    x.userId ===
                        interaction.user.id &&
                    !x.closed
            );

    if (exists) {
        return interaction.reply({
            content:
                `❌ Zaten açık ticketın var: <#${exists.channelId}>`,
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
                    .slice(0, 25),

            type:
                ChannelType.GuildText,

            permissionOverwrites: [
                {
                    id:
                        guild.roles.everyone.id,
                    deny: [
                        PermissionsBitField.Flags
                            .ViewChannel
                    ]
                },
                {
                    id:
                        interaction.user.id,
                    allow: [
                        PermissionsBitField.Flags
                            .ViewChannel,
                        PermissionsBitField.Flags
                            .SendMessages,
                        PermissionsBitField.Flags
                            .ReadMessageHistory
                    ]
                },
                {
                    id:
                        ROLES.YONETICI,
                    allow: [
                        PermissionsBitField.Flags
                            .ViewChannel,
                        PermissionsBitField.Flags
                            .SendMessages,
                        PermissionsBitField.Flags
                            .ReadMessageHistory
                    ]
                },
                {
                    id:
                        ROLES.MODERATOR,
                    allow: [
                        PermissionsBitField.Flags
                            .ViewChannel,
                        PermissionsBitField.Flags
                            .SendMessages,
                        PermissionsBitField.Flags
                            .ReadMessageHistory
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

    const id =
        `${guild.id}_${interaction.user.id}_${Date.now()}`;

    db.tickets[id] = {
        guildId: guild.id,
        channelId: channel.id,
        userId:
            interaction.user.id,
        lastMessageAt:
            Date.now(),
        closed: false
    };

    saveDB();

    const embed =
        new EmbedBuilder()
            .setTitle(
                "🎫 Ticket Açıldı"
            )
            .setDescription(
                `Hoş geldin ${interaction.user}!\n\n` +
                `Yetkililer seninle ilgilenecektir.\n\n` +
                `⏰ 60 dakika mesaj olmazsa otomatik kapanır.`
            );

    const row =
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `ticket_kapat_${id}`
                    )
                    .setLabel(
                        "Ticket Kapat"
                    )
                    .setEmoji("🔒")
                    .setStyle(
                        ButtonStyle.Danger
                    )
            );

    await channel.send({
        content:
            `${interaction.user}`,
        embeds: [embed],
        components: [row]
    });

    return interaction.reply({
        content:
            `✅ Ticket oluşturuldu: ${channel}`,
        ephemeral: true
    });
}

/* =====================================================
   TICKET KAPAT
===================================================== */

async function closeTicket(interaction) {
    const id =
        interaction.customId
            .replace(
                "ticket_kapat_",
                ""
            );

    const ticket =
        db.tickets[id];

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
        !isModerator(
            interaction.member
        )
    ) {
        return interaction.reply({
            content:
                "❌ Bu ticketı kapatamazsın.",
            ephemeral: true
        });
    }

    ticket.closed = true;

    saveDB();

    await interaction.reply(
        "🔒 Ticket kapatılıyor..."
    );

    setTimeout(() => {
        interaction.channel
            ?.delete()
            .catch(() => {});
    }, 1500);
}

/* =====================================================
   TICKET 60 DK KONTROL
===================================================== */

setInterval(
    async () => {
        const now =
            Date.now();

        for (
            const [id, ticket]
            of Object.entries(db.tickets)
        ) {
            if (ticket.closed) {
                continue;
            }

            if (
                now -
                    ticket.lastMessageAt >=
                60 * 60 * 1000
            ) {
                ticket.closed = true;

                saveDB();

                const channel =
                    await client.channels
                        .fetch(
                            ticket.channelId
                        )
                        .catch(
                            () => null
                        );

                if (!channel) continue;

                await channel.send(
                    "⏰ 60 dakika boyunca mesaj gelmediği için ticket otomatik kapatılıyor."
                ).catch(() => {});

                setTimeout(
                    () => {
                        channel
                            .delete()
                            .catch(
                                () => {}
                            );
                    },
                    3000
                );
            }
        }
    },
    60 * 1000
);

/* =====================================================
   DM
===================================================== */

async function dm(message) {
    if (!isModerator(message.member)) {
        return reply(
            message,
            "❌ Bu komutu sadece yetkililer kullanabilir."
        );
    }

    const target =
        getMention(message);

    if (!target) {
        return reply(
            message,
            "❌ Kullanım: `.dm @oyuncu mesaj`"
        );
    }

    const text =
        getTextAfterMention(message);

    if (!text) {
        return reply(
            message,
            "❌ Mesaj yazmalısın."
        );
    }

    try {
        await target.send(text);

        return reply(
            message,
            `✅ ${target} oyuncusuna DM gönderildi.`
        );
    } catch {
        return reply(
            message,
            "❌ Oyuncuya DM gönderilemedi."
        );
    }
}

/* =====================================================
   DM ALL
===================================================== */

async function dmAll(message) {
    if (!isAdmin(message.member)) {
        return reply(
            message,
            "❌ Bu komutu sadece Yönetici kullanabilir."
        );
    }

    const text =
        message.content
            .slice(
                `${PREFIX}dmall`.length
            )
            .trim();

    if (!text) {
        return reply(
            message,
            "❌ Gönderilecek mesajı yaz."
        );
    }

    const members =
        message.guild.members.cache
            .filter(
                member =>
                    !member.user.bot
            );

    let success = 0;
    let failed = 0;

    for (
        const [, member]
        of members
    ) {
        try {
            await member.send(
                text
            );

            success++;
        } catch {
            failed++;
        }

        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    1000
                )
        );
    }

    return reply(
        message,
        `📩 DM işlemi tamamlandı.\n\n` +
        `✅ Başarılı: **${success}**\n` +
        `❌ Başarısız: **${failed}**`
    );
}

/* =====================================================
   MESAJ SİL
===================================================== */

async function clearMessages(
    message,
    args
) {
    if (!isModerator(message.member)) {
        return reply(
            message,
            "❌ Yetkin yok."
        );
    }

    const amount =
        Number(args[0]);

    if (
        !Number.isInteger(amount) ||
        amount < 1 ||
        amount > 100
    ) {
        return reply(
            message,
            "❌ 1-100 arasında sayı yaz."
        );
    }

    const deleted =
        await message.channel
            .bulkDelete(
                amount,
                true
            )
            .catch(() => null);

    if (!deleted) {
        return reply(
            message,
            "❌ Mesajlar silinemedi."
        );
    }

    const msg =
        await message.channel.send(
            `🗑️ **${deleted.size}** mesaj silindi.`
        );

    setTimeout(
        () =>
            msg.delete()
                .catch(() => {}),
        3000
    );
}

/* =====================================================
   KİLİT
===================================================== */

async function lock(message) {
    if (!isModerator(message.member)) {
        return reply(
            message,
            "❌ Yetkin yok."
        );
    }

    await message.channel
        .permissionOverwrites
        .edit(
            message.guild.roles.everyone,
            {
                SendMessages: false
            }
        )
        .catch(() => null);

    return reply(
        message,
        "🔒 Kanal kilitlendi."
    );
}

/* =====================================================
   AÇ
===================================================== */

async function unlock(message) {
    if (!isModerator(message.member)) {
        return reply(
            message,
            "❌ Yetkin yok."
        );
    }

    await message.channel
        .permissionOverwrites
        .edit(
            message.guild.roles.everyone,
            {
                SendMessages: null
            }
        )
        .catch(() => null);

    return reply(
        message,
        "🔓 Kanalın kilidi açıldı."
    );
}

/* =====================================================
   FUTBOLCU ARA
===================================================== */

async function searchPlayer(
    message,
    args
) {
    const search =
        args.join(" ")
            .trim()
            .toLowerCase();

    if (!search) {
        return reply(
            message,
            "❌ Kullanım: `.ara futbolcu isim`"
        );
    }

    const found =
        Object.entries(db.players)
            .filter(
                ([, player]) =>
                    player.name &&
                    player.name
                        .toLowerCase()
                        .includes(search)
            );

    if (!found.length) {
        return reply(
            message,
            "❌ Futbolcu bulunamadı."
        );
    }

    const lines =
        found.slice(0, 20)
            .map(
                ([id, player]) =>
                    `👤 **${player.name}** | ` +
                    `${player.country} | ` +
                    `${player.position} | ` +
                    `${money(player.value)} | ` +
                    `<@${id}>`
            );

    const embed =
        new EmbedBuilder()
            .setTitle(
                "🔎 Futbolcu Arama"
            )
            .setDescription(
                lines.join("\n")
            );

    return message.reply({
        embeds: [embed]
    });
}

/* =====================================================
   YARDIM
===================================================== */

async function help(message) {
    const embed =
        new EmbedBuilder()
            .setTitle(
                "📖 Axera League Komutları"
            )
            .setDescription(
                [
                    "**📝 Kayıt**",
                    "`.k @oyuncu İsim`",
                    "",
                    "**💰 Değer**",
                    "`.dver @oyuncu 5`",
                    "`.dsil @oyuncu 5`",
                    "",
                    "**💶 Kişisel Bütçe**",
                    "`.bütçe`",
                    "`.bütçeekle @oyuncu 5`",
                    "`.bütçesil @oyuncu 5`",
                    "`.gönder @oyuncu 5`",
                    "",
                    "**🏃 Antrenman**",
                    "`.ant`",
                    "`.antrenman`",
                    "",
                    "**🥅 Penaltı**",
                    "`.pen`",
                    "`.penaltı`",
                    "",
                    "**⚽ Maç**",
                    "`.maç Takım1 Takım2`",
                    "`.maçsonuç MAÇ_ID 2 1`",
                    "`.fisktür`",
                    "",
                    "**🏆 Krallık**",
                    "`.golkrallık`",
                    "`.asistkrallık`",
                    "",
                    "**👥 Kadro**",
                    "`.kadro`",
                    "",
                    "**🎉 Çekiliş**",
                    "`.çekiliş süre ödül`",
                    "",
                    "**🎫 Ticket**",
                    "`.ticketpanel`",
                    "",
                    "**📩 DM**",
                    "`.dm @oyuncu mesaj`",
                    "`.dmall mesaj`",
                    "",
                    "**🛡️ Moderasyon**",
                    "`.sil 10`",
                    "`.kilit`",
                    "`.aç`",
                    "",
                    "**🔎 Arama**",
                    "`.ara futbolcu isim`"
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

/* =====================================================
   MESAJ EVENT
===================================================== */

client.on(
    "messageCreate",
    async message => {

        if (message.author.bot) {
            return;
        }

        /*
          Ticket aktivitesi
        */

        const ticket =
            Object.values(
                db.tickets
            ).find(
                x =>
                    x.channelId ===
                        message.channel.id &&
                    !x.closed
            );

        if (ticket) {
            ticket.lastMessageAt =
                Date.now();

            saveDB();
        }

        if (
            !message.content.startsWith(
                PREFIX
            )
        ) {
            return;
        }

        const content =
            message.content
                .slice(PREFIX.length)
                .trim();

        if (!content) return;

        const args =
            content.split(/\s+/);

        const command =
            args.shift()
                .toLowerCase();

        try {

            switch (command) {

                /* =============================
                   KAYIT
                ============================= */

                case "k":
                    await registerCommand(
                        message
                    );
                    break;

                /* =============================
                   DEĞER
                ============================= */

                case "dver":
                    await valueGive(
                        message
                    );
                    break;

                case "dsil":
                    await valueRemove(
                        message
                    );
                    break;

                /* =============================
                   BÜTÇE
                ============================= */

                case "bütçe":
                case "butce":
                    await budget(
                        message
                    );
                    break;

                case "bütçeekle":
                case "butceekle":
                    await budgetAdd(
                        message
                    );
                    break;

                case "bütçesil":
                case "butcesil":
                    await budgetRemove(
                        message
                    );
                    break;

                case "gönder":
                case "gonder":
                    await budgetSend(
                        message
                    );
                    break;

                /* =============================
                   ANTRENMAN
                ============================= */

                case "ant":
                case "antrenman":
                    await training(
                        message
                    );
                    break;

                /* =============================
                   PENALTI
                ============================= */

                case "pen":
                case "penaltı":
                case "penalti":
                    await penalty(
                        message
                    );
                    break;

                /* =============================
                   KADRO
                ============================= */

                case "kadro":
                    await squad(
                        message
                    );
                    break;

                /* =============================
                   MAÇ
                ============================= */

                case "maç":
                case "mac":
                    await match(
                        message,
                        args
                    );
                    break;

                case "maçsonuç":
                case "macsonuc":
                    await matchResult(
                        message,
                        args
                    );
                    break;

                /* =============================
                   FİKSTÜR
                ============================= */

                case "fisktür":
                case "fisktur":
                    await fixture(
                        message
                    );
                    break;

                /* =============================
                   KRALLIK
                ============================= */

                case "golkrallık":
                case "golkrallik":
                    await goalKing(
                        message
                    );
                    break;

                case "asistkrallık":
                case "asistkrallik":
                    await assistKing(
                        message
                    );
                    break;

                /* =============================
                   ÇEKİLİŞ
                ============================= */

                case "çekiliş":
                case "cekilis":
                    await giveaway(
                        message,
                        args
                    );
                    break;

                /* =============================
                   TICKET
                ============================= */

                case "ticketpanel":
                    await ticketPanel(
                        message
                    );
                    break;

                /* =============================
                   DM
                ============================= */

                case "dm":
                    await dm(
                        message
                    );
                    break;

                case "dmall":
                    await dmAll(
                        message
                    );
                    break;

                /* =============================
                   MODERASYON
                ============================= */

                case "sil":
                    await clearMessages(
                        message,
                        args
                    );
                    break;

                case "kilit":
                    await lock(
                        message
                    );
                    break;

                case "aç":
                case "ac":
                    await unlock(
                        message
                    );
                    break;

                /* =============================
                   ARAMA
                ============================= */

                case "ara":

                    if (
                        args[0]
                            ?.toLowerCase() ===
                        "futbolcu"
                    ) {
                        args.shift();

                        await searchPlayer(
                            message,
                            args
                        );
                    } else {
                        await reply(
                            message,
                            "❌ Kullanım: `.ara futbolcu isim`"
                        );
                    }

                    break;

                /* =============================
                   YARDIM
                ============================= */

                case "yardım":
                case "yardim":
                    await help(
                        message
                    );
                    break;

                default:
                    break;
            }

        } catch (error) {

            console.error(
                `.${command} hatası:`,
                error
            );

            await reply(
                message,
                "❌ Komut çalıştırılırken bir hata oluştu."
            );
        }
    }
);

/* =====================================================
   BUTON EVENT
===================================================== */

client.on(
    "interactionCreate",
    async interaction => {

        if (!interaction.isButton()) {
            return;
        }

        try {

            /* =============================
               KAYIT
            ============================= */

            if (
                interaction.customId
                    .startsWith(
                        "kayit_"
                    )
            ) {
                await registerButton(
                    interaction
                );

                return;
            }

            /* =============================
               ÇEKİLİŞ
            ============================= */

            if (
                interaction.customId
                    .startsWith(
                        "cekilis_"
                    )
            ) {

                const id =
                    interaction.customId
                        .replace(
                            "cekilis_",
                            ""
                        );

                const giveaway =
                    db.giveaways[id];

                if (!giveaway) {
                    return interaction.reply({
                        content:
                            "❌ Çekiliş bulunamadı.",
                        ephemeral: true
                    });
                }

                if (
                    giveaway.finished
                ) {
                    return interaction.reply({
                        content:
                            "❌ Bu çekiliş sona erdi.",
                        ephemeral: true
                    });
                }

                if (
                    giveaway.participants
                        .includes(
                            interaction.user.id
                        )
                ) {
                    return interaction.reply({
                        content:
                            "❌ Zaten katıldın.",
                        ephemeral: true
                    });
                }

                giveaway.participants.push(
                    interaction.user.id
                );

                saveDB();

                return interaction.reply({
                    content:
                        "✅ Çekilişe katıldın!",
                    ephemeral: true
                });
            }

            /* =============================
               TICKET AÇ
            ============================= */

            if (
                interaction.customId ===
                "ticket_ac"
            ) {
                await createTicket(
                    interaction
                );

                return;
            }

            /* =============================
               TICKET KAPAT
            ============================= */

            if (
                interaction.customId
                    .startsWith(
                        "ticket_kapat_"
                    )
            ) {
                await closeTicket(
                    interaction
                );

                return;
            }

        } catch (error) {

            console.error(
                "Buton hatası:",
                error
            );

            if (
                !interaction.replied &&
                !interaction.deferred
            ) {
                await interaction.reply({
                    content:
                        "❌ İşlem sırasında hata oluştu.",
                    ephemeral: true
                }).catch(() => {});
            }
        }
    }
);

/* =====================================================
   READY
===================================================== */

client.once(
    "ready",
    () => {

        console.log(
            "===================================="
        );

        console.log(
            `✅ ${client.user.tag} aktif!`
        );

        console.log(
            "⚽ AXERA LEAGUE"
        );

        console.log(
            `📡 ${client.guilds.cache.size} sunucu`
        );

        console.log(
            "===================================="
        );

        client.user.setPresence({
            activities: [
                {
                    name:
                        "Axera League ⚽",
                    type: 0
                }
            ],
            status: "online"
        });
    }
);

/* =====================================================
   HATA YÖNETİMİ
===================================================== */

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

/* =====================================================
   LOGIN
===================================================== */

if (!TOKEN) {
    console.error(
        "❌ TOKEN bulunamadı!"
    );

    process.exit(1);
}

client.login(TOKEN);
