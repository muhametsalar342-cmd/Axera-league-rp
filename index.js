/*
========================================================
                 AXERA LEAGUE BOT
========================================================
Prefix: .
Database: JSON
Library: discord.js v14

GÜNCEL SİSTEMLER:
- Kayıt sistemi
- Değer sistemi
- Kişisel bütçe sistemi
- Antrenman
- Penaltı
- Maç
- Fikstür
- Gol krallığı
- Asist krallığı
- Kadro
- Çekiliş
- Ticket
- DM
- Moderasyon
- Futbolcu arama
- Yardım

KALDIRILANLAR:
- OVR/POT
- Dil
- Rol paneli
- .rolver
- .rolal
- .kap
- .embed
- Sponsor
- Stadyum
- Kupa
- Müze
- Takım sistemi
- Takım bütçesi
========================================================
*/

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

/* ======================================================
   AYARLAR
====================================================== */

const TOKEN = process.env.TOKEN;

const PREFIX = ".";

const CONFIG = {
    roles: {
        yonetici: "1544449436011339806",
        kayitYetkilisi: "1544452022764568656",
        degerYetkilisi: "1544451743746891806",
        moderator: "1544450307088715917",
        teknikDirektor: "1544452323450032229",
        oyuncu: "1544452779156709516"
    },

    /*
      Kayıtsız rol ID'si:
      Sistem erişimi kayıt durumuna bağlıdır.
    */
    kayitsizRole: "1544488182027133030",

    duyuruChannel: "1544653653330108477",

    /*
      Kayıt kanalını burada belirleyebilirsin.
      Boş bırakılırsa tüm kanallarda .k kullanılabilir.
    */
    kayitChannel: process.env.KAYIT_CHANNEL_ID || "",

    /*
      Ticket kategorisi opsiyonel.
    */
    ticketCategory: process.env.TICKET_CATEGORY_ID || ""
};

/* ======================================================
   CLIENT
====================================================== */

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
        Partials.Message,
        Partials.GuildMember
    ]
});

/* ======================================================
   DATABASE
====================================================== */

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "database.json");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_DB = {
    players: {},
    budgets: {},
    matches: [],
    fixtures: [],
    goals: {},
    assists: {},
    giveaways: {},
    tickets: {},
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
                JSON.stringify(DEFAULT_DB, null, 2)
            );

            return structuredClone(DEFAULT_DB);
        }

        const raw = fs.readFileSync(DB_FILE, "utf8");

        if (!raw.trim()) {
            return structuredClone(DEFAULT_DB);
        }

        const data = JSON.parse(raw);

        return normalizeDB(data);
    } catch (error) {
        console.error("Database okunamadı:", error);

        return structuredClone(DEFAULT_DB);
    }
}

function normalizeDB(db) {
    const result = {
        ...structuredClone(DEFAULT_DB),
        ...db
    };

    result.players = db.players || {};
    result.budgets = db.budgets || {};
    result.matches = Array.isArray(db.matches) ? db.matches : [];
    result.fixtures = Array.isArray(db.fixtures) ? db.fixtures : [];
    result.goals = db.goals || {};
    result.assists = db.assists || {};
    result.giveaways = db.giveaways || {};
    result.tickets = db.tickets || {};

    result.cooldowns = {
        ...structuredClone(DEFAULT_DB.cooldowns),
        ...(db.cooldowns || {})
    };

    return result;
}

let db = loadDB();

function saveDB() {
    try {
        fs.writeFileSync(
            DB_FILE,
            JSON.stringify(db, null, 2)
        );
    } catch (error) {
        console.error("Database kaydedilemedi:", error);
    }
}

/* ======================================================
   GENEL FONKSİYONLAR
====================================================== */

function getPlayer(userId) {
    if (!db.players[userId]) {
        db.players[userId] = {
            registered: false,
            name: "",
            country: "🇧🇷",
            position: "SNT",
            value: 0,
            roleType: "",
            team: null
        };
    }

    return db.players[userId];
}

function isRegistered(userId) {
    return Boolean(
        db.players[userId] &&
        db.players[userId].registered
    );
}

function isRole(member, roleId) {
    return Boolean(
        member &&
        member.roles &&
        member.roles.cache.has(roleId)
    );
}

function isAdmin(member) {
    if (!member) return false;

    return (
        member.permissions.has(
            PermissionsBitField.Flags.Administrator
        ) ||
        isRole(member, CONFIG.roles.yonetici)
    );
}

function isModerator(member) {
    if (!member) return false;

    return (
        isAdmin(member) ||
        isRole(member, CONFIG.roles.moderator)
    );
}

function isKayitYetkilisi(member) {
    if (!member) return false;

    return (
        isAdmin(member) ||
        isRole(member, CONFIG.roles.kayitYetkilisi)
    );
}

function isDegerYetkilisi(member) {
    if (!member) return false;

    return (
        isAdmin(member) ||
        isRole(member, CONFIG.roles.degerYetkilisi)
    );
}

function formatMoney(value) {
    const number = Number(value) || 0;

    return number
        .toLocaleString("tr-TR")
        .replace(/\s/g, ".");
}

function moneyText(value) {
    return `${formatMoney(value)}€`;
}

/*
  Kullanıcı:
  .dver @oyuncu 5

  5 = 5.000.000
*/
function parseMillionAmount(input) {
    if (!input) return null;

    let text = String(input)
        .trim()
        .toLowerCase()
        .replace(/€/g, "")
        .replace(/m/g, "")
        .replace(/₺/g, "");

    /*
      5.000.000 -> 5
      5,5 -> 5.5
      5 -> 5
    */

    text = text.replace(/\./g, "");

    const number = Number(
        text.replace(",", ".")
    );

    if (!Number.isFinite(number)) {
        return null;
    }

    return Math.floor(number * 1000000);
}

function parseRealMoney(input) {
    if (!input) return null;

    let text = String(input)
        .trim()
        .toLowerCase()
        .replace(/€/g, "")
        .replace(/₺/g, "");

    if (text.endsWith("m")) {
        text = text.slice(0, -1);

        const number = Number(
            text.replace(",", ".")
        );

        if (!Number.isFinite(number)) return null;

        return Math.floor(number * 1000000);
    }

    text = text.replace(/\./g, "");

    const number = Number(
        text.replace(",", ".")
    );

    if (!Number.isFinite(number)) {
        return null;
    }

    return Math.floor(number);
}

function getMentionedMember(message) {
    return message.mentions.members.first() || null;
}

function getRemainingArgsAfterMention(message) {
    const match = message.content.match(
        /^(\S+)\s+<@!?\d+>\s*(.*)$/s
    );

    if (!match) return "";

    return match[2].trim();
}

function getAmountAfterMention(message) {
    const remaining = getRemainingArgsAfterMention(message);

    if (!remaining) return null;

    const first = remaining.split(/\s+/)[0];

    return parseMillionAmount(first);
}

function cleanName(name) {
    return String(name || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 32);
}

async function safeReply(message, content) {
    try {
        return await message.reply({
            content,
            allowedMentions: {
                repliedUser: false
            }
        });
    } catch {
        return null;
    }
}

async function safeDM(user, content) {
    try {
        await user.send({
            content
        });

        return true;
    } catch {
        return false;
    }
}

function getMemberRoleId(type) {
    switch (type) {
        case "teknik":
            return CONFIG.roles.teknikDirektor;

        case "kaleci":
            return CONFIG.roles.oyuncu;

        case "futbolcu":
            return CONFIG.roles.oyuncu;

        case "uye":
            return null;

        default:
            return null;
    }
}

function roleTypeText(type) {
    switch (type) {
        case "teknik":
            return "Teknik Direktör";

        case "uye":
            return "Üye";

        case "kaleci":
            return "Kaleci";

        case "futbolcu":
            return "Futbolcu";

        default:
            return "Bilinmiyor";
    }
}

/* ======================================================
   KAYIT SİSTEMİ
====================================================== */

async function startRegistration(message) {
    if (!message.guild) return;

    if (!isKayitYetkilisi(message.member)) {
        return safeReply(
            message,
            "❌ Bu komutu sadece **Kayıt Yetkilisi** kullanabilir."
        );
    }

    if (
        CONFIG.kayitChannel &&
        message.channel.id !== CONFIG.kayitChannel
    ) {
        return safeReply(
            message,
            "❌ Bu komut kayıt kanalında kullanılabilir."
        );
    }

    const target = getMentionedMember(message);

    if (!target) {
        return safeReply(
            message,
            "❌ Kullanım: `.k @oyuncu İsim`"
        );
    }

    const name = getRemainingArgsAfterMention(message);

    if (!name) {
        return safeReply(
            message,
            "❌ Oyuncunun ismini yazmalısın.\nÖrnek: `.k @oyuncu W.Sneijder`"
        );
    }

    const clean = cleanName(name);

    if (!clean) {
        return safeReply(
            message,
            "❌ Geçerli bir isim yazmalısın."
        );
    }

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`register_teknik_${target.id}_${message.id}`)
            .setLabel("Teknik Direktör")
            .setEmoji("🔧")
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId(`register_uye_${target.id}_${message.id}`)
            .setLabel("Üye")
            .setEmoji("👤")
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(`register_kaleci_${target.id}_${message.id}`)
            .setLabel("Kaleci")
            .setEmoji("🧤")
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId(`register_futbolcu_${target.id}_${message.id}`)
            .setLabel("Futbolcu")
            .setEmoji("⚽")
            .setStyle(ButtonStyle.Success)
    );

    const embed = new EmbedBuilder()
        .setTitle("📝 Oyuncu Kayıt")
        .setDescription(
            `**Oyuncu:** ${target}\n` +
            `**İsim:** ${clean}\n\n` +
            `Kayıt türünü aşağıdaki butonlardan seçin.`
        )
        .setFooter({
            text: "Axera League Kayıt Sistemi"
        });

    await message.reply({
        embeds: [embed],
        components: [buttons]
    });

    /*
      Geçici kayıt bilgisini mesaj üzerinde tutuyoruz.
    */
    if (!db.pendingRegistrations) {
        db.pendingRegistrations = {};
    }

    db.pendingRegistrations[message.id] = {
        targetId: target.id,
        name: clean,
        createdBy: message.author.id,
        createdAt: Date.now()
    };

    saveDB();
}

/* ======================================================
   KAYIT BUTONLARI
====================================================== */

async function completeRegistration(interaction) {
    const parts = interaction.customId.split("_");

    /*
      register
      type
      targetId
      commandMessageId
    */

    const type = parts[1];
    const targetId = parts[2];
    const commandMessageId = parts.slice(3).join("_");

    if (!isKayitYetkilisi(interaction.member)) {
        return interaction.reply({
            content: "❌ Bu butonu sadece **Kayıt Yetkilisi** kullanabilir.",
            ephemeral: true
        });
    }

    const pending =
        db.pendingRegistrations &&
        db.pendingRegistrations[commandMessageId];

    if (!pending) {
        return interaction.reply({
            content: "❌ Bu kayıt işlemi bulunamadı veya süresi doldu.",
            ephemeral: true
        });
    }

    if (pending.targetId !== targetId) {
        return interaction.reply({
            content: "❌ Kayıt bilgileri uyuşmuyor.",
            ephemeral: true
        });
    }

    const target = await interaction.guild.members
        .fetch(targetId)
        .catch(() => null);

    if (!target) {
        return interaction.reply({
            content: "❌ Oyuncu sunucuda bulunamadı.",
            ephemeral: true
        });
    }

    const botMember =
        interaction.guild.members.me;

    if (!botMember) {
        return interaction.reply({
            content: "❌ Bot üyesi bulunamadı.",
            ephemeral: true
        });
    }

    /*
      İsim değiştirme kontrolü
    */

    if (
        !botMember.permissions.has(
            PermissionsBitField.Flags.ManageNicknames
        )
    ) {
        return interaction.reply({
            content:
                "❌ Botta **Üyelerin Takma Adlarını Yönet** yetkisi yok.",
            ephemeral: true
        });
    }

    if (
        target.id !== interaction.guild.ownerId &&
        botMember.roles.highest.comparePositionTo(
            target.roles.highest
        ) <= 0
    ) {
        return interaction.reply({
            content:
                "❌ Botun rolü bu oyuncunun rolünden yüksek olmalı.",
            ephemeral: true
        });
    }

    try {
        /*
          KAYIT BİTTİĞİ ANDA İSİM DEĞİŞİR
        */
        await target.setNickname(
            pending.name,
            "Axera League kayıt işlemi"
        );
    } catch (error) {
        console.error("Nickname hatası:", error);

        return interaction.reply({
            content:
                "❌ Oyuncunun adı değiştirilemedi. Bot rolünün yeterince yukarıda olduğundan emin ol.",
            ephemeral: true
        });
    }

    const player = getPlayer(target.id);

    player.registered = true;
    player.name = pending.name;
    player.roleType = type;

    /*
      Varsayılan ülke ve pozisyon korunur.
    */

    if (!player.country) {
        player.country = "🇧🇷";
    }

    if (!player.position) {
        player.position = "SNT";
    }

    /*
      Kayıtsız rolünü kaldır
    */

    if (
        CONFIG.kayitsizRole &&
        target.roles.cache.has(CONFIG.kayitsizRole)
    ) {
        await target.roles
            .remove(
                CONFIG.kayitsizRole,
                "Kayıt tamamlandı"
            )
            .catch(() => {});
    }

    /*
      Teknik direktör / oyuncu rolleri
    */

    const roleId = getMemberRoleId(type);

    if (roleId) {
        const role =
            interaction.guild.roles.cache.get(roleId);

        if (role) {
            if (
                botMember.roles.highest.comparePositionTo(
                    role
                ) > 0
            ) {
                await target.roles
                    .add(role, "Axera League kayıt")
                    .catch(() => {});
            }
        }
    }

    /*
      Kayıt tamamlandıktan sonra bütçe yoksa 0
    */

    if (typeof db.budgets[target.id] !== "number") {
        db.budgets[target.id] = 0;
    }

    delete db.pendingRegistrations[commandMessageId];

    saveDB();

    const resultEmbed = new EmbedBuilder()
        .setTitle("✅ Kayıt Tamamlandı")
        .setDescription(
            `**Oyuncu:** ${target}\n` +
            `**İsim:** ${pending.name}\n` +
            `**Kayıt Türü:** ${roleTypeText(type)}`
        )
        .setFooter({
            text: "Axera League"
        });

    await interaction.update({
        embeds: [resultEmbed],
        components: []
    });
}

/* ======================================================
   DEĞER SİSTEMİ
====================================================== */

async function addPlayerValue(message) {
    if (!message.guild) return;

    if (!isRegistered(message.author.id)) {
        return safeReply(
            message,
            "❌ Bu sistemi kullanmak için önce kayıt olmalısın."
        );
    }

    if (!isDegerYetkilisi(message.member)) {
        return safeReply(
            message,
            "❌ Bu komutu sadece **Değer Yetkilisi** kullanabilir."
        );
    }

    const target = getMentionedMember(message);

    if (!target) {
        return safeReply(
            message,
            "❌ Kullanım: `.dver @oyuncu 5`"
        );
    }

    if (!isRegistered(target.id)) {
        return safeReply(
            message,
            "❌ Hedef oyuncunun kayıtlı olması gerekiyor."
        );
    }

    const amount = getAmountAfterMention(message);

    if (!amount || amount <= 0) {
        return safeReply(
            message,
            "❌ Geçerli bir miktar yaz.\nÖrnek: `.dver @oyuncu 5`"
        );
    }

    const player = getPlayer(target.id);

    const oldValue = Number(player.value) || 0;

    const newValue = oldValue + amount;

    player.value = newValue;

    saveDB();

    /*
      İsim + ülke + pozisyon kesinlikle değiştirilmez.
    */

    return safeReply(
        message,
        `✅ ${target} oyuncusunun değeri **${moneyText(oldValue)}** → **${moneyText(newValue)}** oldu.\n\n` +
        `Oyuncu bilgileri değiştirilmedi:\n` +
        `**${player.name} | ${player.country} | ${player.position} | ${moneyText(newValue)}**`
    );
}

async function removePlayerValue(message) {
    if (!message.guild) return;

    if (!isRegistered(message.author.id)) {
        return safeReply(
            message,
            "❌ Bu sistemi kullanmak için önce kayıt olmalısın."
        );
    }

    if (!isDegerYetkilisi(message.member)) {
        return safeReply(
            message,
            "❌ Bu komutu sadece **Değer Yetkilisi** kullanabilir."
        );
    }

    const target = getMentionedMember(message);

    if (!target) {
        return safeReply(
            message,
            "❌ Kullanım: `.dsil @oyuncu 5`"
        );
    }

    if (!isRegistered(target.id)) {
        return safeReply(
            message,
            "❌ Hedef oyuncunun kayıtlı olması gerekiyor."
        );
    }

    const amount = getAmountAfterMention(message);

    if (!amount || amount <= 0) {
        return safeReply(
            message,
            "❌ Geçerli bir miktar yaz.\nÖrnek: `.dsil @oyuncu 5`"
        );
    }

    const player = getPlayer(target.id);

    const oldValue = Number(player.value) || 0;

    const newValue = Math.max(
        0,
        oldValue - amount
    );

    player.value = newValue;

    saveDB();

    return safeReply(
        message,
        `✅ ${target} oyuncusunun değeri **${moneyText(oldValue)}** → **${moneyText(newValue)}** oldu.\n\n` +
        `Oyuncu bilgileri değiştirilmedi:\n` +
        `**${player.name} | ${player.country} | ${player.position} | ${moneyText(newValue)}**`
    );
}

/* ======================================================
   OYUNCU PROFİLİ / KADRO
====================================================== */

async function showSquad(message) {
    if (!message.guild) return;

    if (!isRegistered(message.author.id)) {
        return safeReply(
            message,
            "❌ Önce kayıt olmalısın."
        );
    }

    const members = message.guild.members.cache
        .filter(member =>
            member.user.bot === false &&
            isRegistered(member.id)
        );

    if (members.size === 0) {
        return safeReply(
            message,
            "❌ Kayıtlı oyuncu bulunamadı."
        );
    }

    const lines = [];

    let index = 1;

    for (const [, member] of members) {
        const player = getPlayer(member.id);

        lines.push(
            `**${index}.** ${player.name || member.user.username} | ` +
            `${player.country || "🌍"} | ` +
            `${player.position || "SNT"} | ` +
            `${moneyText(player.value || 0)}`
        );

        index++;

        if (lines.length >= 50) break;
    }

    const embed = new EmbedBuilder()
        .setTitle("👥 Axera League Oyuncuları")
        .setDescription(lines.join("\n"))
        .setFooter({
            text: `${members.size} kayıtlı oyuncu`
        });

    return message.reply({
        embeds: [embed]
    });
}

/* ======================================================
   BÜTÇE SİSTEMİ
====================================================== */

function getBudget(userId) {
    if (typeof db.budgets[userId] !== "number") {
        db.budgets[userId] = 0;
    }

    return db.budgets[userId];
}

async function showBudget(message) {
    if (!message.guild) return;

    if (!isRegistered(message.author.id)) {
        return safeReply(
            message,
            "❌ Önce kayıt olmalısın."
        );
    }

    const budget = getBudget(message.author.id);

    return safeReply(
        message,
        `💰 **Kişisel Bütçen:** ${moneyText(budget)}`
    );
}

async function addBudget(message) {
    if (!message.guild) return;

    if (!isRegistered(message.author.id)) {
        return safeReply(
            message,
            "❌ Önce kayıt olmalısın."
        );
    }

    if (!isDegerYetkilisi(message.member)) {
        return safeReply(
            message,
            "❌ Bu komutu sadece **Değer Yetkilisi** kullanabilir."
        );
    }

    const target = getMentionedMember(message);

    if (!target) {
        return safeReply(
            message,
            "❌ Kullanım: `.bütçeekle @oyuncu 5`"
        );
    }

    if (!isRegistered(target.id)) {
        return safeReply(
            message,
            "❌ Hedef oyuncunun kayıtlı olması gerekiyor."
        );
    }

    const amount = getAmountAfterMention(message);

    if (!amount || amount <= 0) {
        return safeReply(
            message,
            "❌ Geçerli bir miktar yaz."
        );
    }

    const oldBudget = getBudget(target.id);

    const newBudget =
        oldBudget + amount;

    db.budgets[target.id] = newBudget;

    saveDB();

    return safeReply(
        message,
        `✅ ${target} bütçesine **${moneyText(amount)}** eklendi.\n` +
        `💰 Yeni bütçe: **${moneyText(newBudget)}**`
    );
}

async function removeBudget(message) {
    if (!message.guild) return;

    if (!isRegistered(message.author.id)) {
        return safeReply(
            message,
            "❌ Önce kayıt olmalısın."
        );
    }

    if (!isDegerYetkilisi(message.member)) {
        return safeReply(
            message,
            "❌ Bu komutu sadece **Değer Yetkilisi** kullanabilir."
        );
    }

    const target = getMentionedMember(message);

    if (!target) {
        return safeReply(
            message,
            "❌ Kullanım: `.bütçesil @oyuncu 5`"
        );
    }

    if (!isRegistered(target.id)) {
        return safeReply(
            message,
            "❌ Hedef oyuncunun kayıtlı olması gerekiyor."
        );
    }

    const amount = getAmountAfterMention(message);

    if (!amount || amount <= 0) {
        return safeReply(
            message,
            "❌ Geçerli bir miktar yaz."
        );
    }

    const oldBudget = getBudget(target.id);

    const newBudget = Math.max(
        0,
        oldBudget - amount
    );

    db.budgets[target.id] = newBudget;

    saveDB();

    return safeReply(
        message,
        `✅ ${target} bütçesinden **${moneyText(amount)}** silindi.\n` +
        `💰 Yeni bütçe: **${moneyText(newBudget)}**`
    );
}

async function sendBudget(message) {
    if (!message.guild) return;

    if (!isRegistered(message.author.id)) {
        return safeReply(
            message,
            "❌ Önce kayıt olmalısın."
        );
    }

    const target = getMentionedMember(message);

    if (!target) {
        return safeReply(
            message,
            "❌ Kullanım: `.gönder @oyuncu 5`"
        );
    }

    if (target.id === message.author.id) {
        return safeReply(
            message,
            "❌ Kendine bütçe gönderemezsin."
        );
    }

    if (!isRegistered(target.id)) {
        return safeReply(
            message,
            "❌ Hedef oyuncunun kayıtlı olması gerekiyor."
        );
    }

    const amount = getAmountAfterMention(message);

    if (!amount || amount <= 0) {
        return safeReply(
            message,
            "❌ Geçerli bir miktar yaz."
        );
    }

    const senderBudget =
        getBudget(message.author.id);

    if (senderBudget < amount) {
        return safeReply(
            message,
            `❌ Yeterli bütçen yok.\nMevcut bütçen: **${moneyText(senderBudget)}**`
        );
    }

    db.budgets[message.author.id] =
        senderBudget - amount;

    db.budgets[target.id] =
        getBudget(target.id) + amount;

    saveDB();

    return safeReply(
        message,
        `✅ **${moneyText(amount)}** ${target} oyuncusuna gönderildi.\n\n` +
        `💰 Senin bütçen: **${moneyText(db.budgets[message.author.id])}**\n` +
        `💰 ${target} bütçesi: **${moneyText(db.budgets[target.id])}**`
    );
}

/* ======================================================
   ANTRENMAN
====================================================== */

const TRAINING_COOLDOWN = 60 * 60 * 1000;

async function training(message) {
    if (!message.guild) return;

    if (!isRegistered(message.author.id)) {
        return safeReply(
            message,
            "❌ Önce kayıt olmalısın."
        );
    }

    const now = Date.now();

    const last =
        db.cooldowns.training[message.author.id] || 0;

    if (now - last < TRAINING_COOLDOWN) {
        const remaining =
            TRAINING_COOLDOWN - (now - last);

        const minutes =
            Math.ceil(remaining / 60000);

        return safeReply(
            message,
            `⏳ Antrenman için **${minutes} dakika** beklemelisin.`
        );
    }

    db.cooldowns.training[message.author.id] =
        now;

    const player =
        getPlayer(message.author.id);

    const oldValue =
        Number(player.value) || 0;

    const reward = 5000000;

    player.value =
        oldValue + reward;

    saveDB();

    return safeReply(
        message,
        `🏃 **Antrenman tamamlandı!**\n\n` +
        `💰 Değer artışı: **+5.000.000€**\n` +
        `📈 Yeni değer: **${moneyText(player.value)}**\n\n` +
        `**${player.name} | ${player.country} | ${player.position} | ${moneyText(player.value)}**`
    );
}

/* ======================================================
   PENALTI
====================================================== */

const PENALTY_COOLDOWN = 30 * 60 * 1000;

async function penalty(message) {
    if (!message.guild) return;

    if (!isRegistered(message.author.id)) {
        return safeReply(
            message,
            "❌ Önce kayıt olmalısın."
        );
    }

    const now = Date.now();

    const last =
        db.cooldowns.penalty[message.author.id] || 0;

    if (now - last < PENALTY_COOLDOWN) {
        const remaining =
            PENALTY_COOLDOWN - (now - last);

        const minutes =
            Math.ceil(remaining / 60000);

        return safeReply(
            message,
            `⏳ Penaltı için **${minutes} dakika** beklemelisin.`
        );
    }

    db.cooldowns.penalty[message.author.id] =
        now;

    const scored =
        Math.random() < 0.5;

    if (!scored) {
        saveDB();

        return safeReply(
            message,
            "🥅 **Penaltı kaçtı!**\n\n💰 Değer artışı yok."
        );
    }

    const player =
        getPlayer(message.author.id);

    const oldValue =
        Number(player.value) || 0;

    const reward = 5000000;

    player.value =
        oldValue + reward;

    db.goals[message.author.id] =
        (db.goals[message.author.id] || 0) + 1;

    saveDB();

    return safeReply(
        message,
        `⚽ **GOOOL!**\n\n` +
        `💰 Değer artışı: **+5.000.000€**\n` +
        `📈 Yeni değer: **${moneyText(player.value)}**\n` +
        `⚽ Toplam gol: **${db.goals[message.author.id]}**\n\n` +
        `**${player.name} | ${player.country} | ${player.position} | ${moneyText(player.value)}**`
    );
}

/* ======================================================
   GOL KRALLIĞI
====================================================== */

async function goalKing(message) {
    if (!message.guild) return;

    if (!isRegistered(message.author.id)) {
        return safeReply(
            message,
            "❌ Önce kayıt olmalısın."
        );
    }

    const entries = Object.entries(db.goals);

    if (entries.length === 0) {
        return safeReply(
            message,
            "⚽ Henüz gol kaydı bulunmuyor."
        );
    }

    entries.sort((a, b) => b[1] - a[1]);

    const lines = [];

    let rank = 1;

    for (const [userId, goals] of entries.slice(0, 20)) {
        const player =
            getPlayer(userId);

        const member =
            await message.guild.members
                .fetch(userId)
                .catch(() => null);

        const name =
            player.name ||
            member?.displayName ||
            "Bilinmeyen";

        lines.push(
            `**${rank}.** ${name} — **${goals} gol**`
        );

        rank++;
    }

    const embed = new EmbedBuilder()
        .setTitle("⚽ Gol Krallığı")
        .setDescription(lines.join("\n"))
        .setFooter({
            text: "Axera League"
        });

    return message.reply({
        embeds: [embed]
    });
}

/* ======================================================
   ASİST KRALLIĞI
====================================================== */

async function assistKing(message) {
    if (!message.guild) return;

    if (!isRegistered(message.author.id)) {
        return safeReply(
            message,
            "❌ Önce kayıt olmalısın."
        );
    }

    const entries =
        Object.entries(db.assists);

    if (entries.length === 0) {
        return safeReply(
            message,
            "🅰️ Henüz asist kaydı bulunmuyor."
        );
    }

    entries.sort((a, b) => b[1] - a[1]);

    const lines = [];

    let rank = 1;

    for (const [userId, assists] of entries.slice(0, 20)) {
        const player =
            getPlayer(userId);

        const member =
            await message.guild.members
                .fetch(userId)
                .catch(() => null);

        const name =
            player.name ||
            member?.displayName ||
            "Bilinmeyen";

        lines.push(
            `**${rank}.** ${name} — **${assists} asist**`
        );

        rank++;
    }

    const embed = new EmbedBuilder()
        .setTitle("🅰️ Asist Krallığı")
        .setDescription(lines.join("\n"))
        .setFooter({
            text: "Axera League"
        });

    return message.reply({
        embeds: [embed]
    });
}

/* ======================================================
   MAÇ SİSTEMİ
====================================================== */

async function createMatch(message, args) {
    if (!message.guild) return;

    if (!isRegistered(message.author.id)) {
        return safeReply(
            message,
            "❌ Önce kayıt olmalısın."
        );
    }

    if (!isModerator(message.member)) {
        return safeReply(
            message,
            "❌ Bu komutu sadece yetkililer kullanabilir."
        );
    }

    if (args.length < 2) {
        return safeReply(
            message,
            "❌ Kullanım: `.maç Takım1 Takım2`"
        );
    }

    /*
      Takım sistemi kaldırıldığı için maç sistemi
      sadece fikstür/maç kaydı olarak tutulur.
    */

    const first =
        args[0];

    const second =
        args.slice(1).join(" ");

    const match = {
        id: Date.now().toString(),
        home: first,
        away: second,
        homeScore: null,
        awayScore: null,
        status: "Planlandı",
        createdBy: message.author.id,
        createdAt: Date.now()
    };

    db.matches.push(match);

    saveDB();

    return safeReply(
        message,
        `⚽ **Maç oluşturuldu!**\n\n` +
        `🏠 ${match.home}\n` +
        `🆚\n` +
        `✈️ ${match.away}\n\n` +
        `Durum: **Planlandı**`
    );
}

/* ======================================================
   FİKSTÜR
====================================================== */

async function fixture(message) {
    if (!message.guild) return;

    if (!isRegistered(message.author.id)) {
        return safeReply(
            message,
            "❌ Önce kayıt olmalısın."
        );
    }

    if (db.matches.length === 0) {
        return safeReply(
            message,
            "📅 Henüz fikstür bulunmuyor."
        );
    }

    const lines =
        db.matches
            .slice(-20)
            .reverse()
            .map((match, index) => {
                let result = "Planlandı";

                if (
                    match.homeScore !== null &&
                    match.awayScore !== null
                ) {
                    result =
                        `${match.homeScore} - ${match.awayScore}`;
                }

                return (
                    `**${index + 1}.** ` +
                    `${match.home} 🆚 ${match.away} — **${result}**`
                );
            });

    const embed = new EmbedBuilder()
        .setTitle("📅 Axera League Fikstür")
        .setDescription(lines.join("\n"))
        .setFooter({
            text: "Axera League"
        });

    return message.reply({
        embeds: [embed]
    });
}

/* ======================================================
   MAÇ SONUCU
====================================================== */

async function matchResult(message, args) {
    if (!message.guild) return;

    if (!isModerator(message.member)) {
        return safeReply(
            message,
            "❌ Bu komutu sadece yetkililer kullanabilir."
        );
    }

    if (args.length < 3) {
        return safeReply(
            message,
            "❌ Kullanım: `.maçsonuç MAÇ_ID 2 1`"
        );
    }

    const matchId =
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
        return safeReply(
            message,
            "❌ Skorlar geçerli olmalı."
        );
    }

    const match =
        db.matches.find(
            x => x.id === matchId
        );

    if (!match) {
        return safeReply(
            message,
            "❌ Maç bulunamadı."
        );
    }

    match.homeScore =
        homeScore;

    match.awayScore =
        awayScore;

    match.status =
        "Tamamlandı";

    saveDB();

    return safeReply(
        message,
        `✅ Maç sonucu kaydedildi:\n\n` +
        `**${match.home} ${homeScore} - ${awayScore} ${match.away}**`
    );
}

/* ======================================================
   ÇEKİLİŞ
====================================================== */

async function createGiveaway(message, args) {
    if (!message.guild) return;

    if (!isRegistered(message.author.id)) {
        return safeReply(
            message,
            "❌ Önce kayıt olmalısın."
        );
    }

    if (!isModerator(message.member)) {
        return safeReply(
            message,
            "❌ Bu komutu sadece yetkililer kullanabilir."
        );
    }

    if (args.length < 2) {
        return safeReply(
            message,
            "❌ Kullanım: `.çekiliş süre ödül`"
        );
    }

    const durationMinutes =
        Number(args[0]);

    if (
        !Number.isFinite(durationMinutes) ||
        durationMinutes <= 0
    ) {
        return safeReply(
            message,
            "❌ Geçerli bir süre yaz."
        );
    }

    const prize =
        args.slice(1).join(" ");

    const giveawayId =
        Date.now().toString();

    const endAt =
        Date.now() +
        durationMinutes * 60 * 1000;

    const embed = new EmbedBuilder()
        .setTitle("🎉 Çekiliş")
        .setDescription(
            `🎁 **Ödül:** ${prize}\n\n` +
            `⏱️ **Süre:** ${durationMinutes} dakika\n` +
            `👥 Katılmak için aşağıdaki butona bas.`
        )
        .setFooter({
            text: `Çekiliş ID: ${giveawayId}`
        });

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

    db.giveaways[giveawayId] = {
        messageId: giveawayMessage.id,
        channelId: message.channel.id,
        prize,
        endAt,
        participants: [],
        finished: false
    };

    saveDB();

    setTimeout(
        () => finishGiveaway(
            giveawayId
        ),
        durationMinutes * 60 * 1000
    );

    return;
}

async function finishGiveaway(id) {
    const giveaway =
        db.giveaways[id];

    if (!giveaway || giveaway.finished) {
        return;
    }

    giveaway.finished = true;

    saveDB();

    try {
        const channel =
            await client.channels
                .fetch(giveaway.channelId);

        if (!channel) return;

        const message =
            await channel.messages
                .fetch(giveaway.messageId)
                .catch(() => null);

        if (!message) return;

        const participants =
            giveaway.participants || [];

        if (participants.length === 0) {
            return message.edit({
                content: "❌ Çekilişe katılan olmadı.",
                components: []
            });
        }

        const winner =
            participants[
                Math.floor(
                    Math.random() *
                    participants.length
                )
            ];

        const embed =
            new EmbedBuilder()
                .setTitle("🎉 Çekiliş Sona Erdi")
                .setDescription(
                    `🎁 **Ödül:** ${giveaway.prize}\n\n` +
                    `🏆 **Kazanan:** <@${winner}>`
                );

        await message.edit({
            embeds: [embed],
            components: []
        });
    } catch (error) {
        console.error(
            "Çekiliş bitirme hatası:",
            error
        );
    }
}

/* ======================================================
   TICKET
====================================================== */

async function ticketPanel(message) {
    if (!message.guild) return;

    if (!isModerator(message.member)) {
        return safeReply(
            message,
            "❌ Bu komutu sadece yetkililer kullanabilir."
        );
    }

    const embed =
        new EmbedBuilder()
            .setTitle("🎫 Axera League Ticket")
            .setDescription(
                "Destek almak için aşağıdaki butona bas."
            )
            .setFooter({
                text: "Axera League"
            });

    const row =
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId("ticket_create")
                    .setLabel("Ticket Aç")
                    .setEmoji("🎫")
                    .setStyle(ButtonStyle.Primary)
            );

    return message.channel.send({
        embeds: [embed],
        components: [row]
    });
}

async function createTicket(interaction) {
    const guild =
        interaction.guild;

    if (!guild) return;

    const existing =
        Object.values(db.tickets)
            .find(
                ticket =>
                    ticket.guildId === guild.id &&
                    ticket.userId === interaction.user.id &&
                    !ticket.closed
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
                    .replace(/[^a-z0-9-]/g, "")
                    .slice(0, 20),

            type: ChannelType.GuildText,

            parent:
                CONFIG.ticketCategory || null,

            permissionOverwrites: [
                {
                    id: guild.roles.everyone.id,
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
                    id: CONFIG.roles.yonetici,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory
                    ]
                },
                {
                    id: CONFIG.roles.moderator,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory
                    ]
                }
            ]
        })
        .catch(error => {
            console.error(
                "Ticket oluşturma:",
                error
            );

            return null;
        });

    if (!channel) {
        return interaction.reply({
            content:
                "❌ Ticket oluşturulamadı.",
            ephemeral: true
        });
    }

    const ticketId =
        `${guild.id}_${interaction.user.id}_${Date.now()}`;

    db.tickets[ticketId] = {
        guildId: guild.id,
        channelId: channel.id,
        userId: interaction.user.id,
        lastMessageAt: Date.now(),
        closed: false
    };

    saveDB();

    const embed =
        new EmbedBuilder()
            .setTitle("🎫 Ticket")
            .setDescription(
                `Hoş geldin ${interaction.user}!\n\n` +
                `Yetkililer en kısa sürede yardımcı olacaktır.\n\n` +
                `⏰ **60 dakika boyunca mesaj gelmezse ticket otomatik kapanır.**`
            );

    const row =
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `ticket_close_${ticketId}`
                    )
                    .setLabel("Ticket Kapat")
                    .setEmoji("🔒")
                    .setStyle(ButtonStyle.Danger)
            );

    await channel.send({
        content: `${interaction.user}`,
        embeds: [embed],
        components: [row]
    });

    return interaction.reply({
        content:
            `✅ Ticket oluşturuldu: ${channel}`,
        ephemeral: true
    });
}

async function closeTicket(interaction) {
    const parts =
        interaction.customId.split("_");

    const ticketId =
        parts.slice(2).join("_");

    const ticket =
        db.tickets[ticketId];

    if (!ticket) {
        return interaction.reply({
            content:
                "❌ Ticket bulunamadı.",
            ephemeral: true
        });
    }

    if (
        interaction.user.id !== ticket.userId &&
        !isModerator(interaction.member)
    ) {
        return interaction.reply({
            content:
                "❌ Bu ticketı kapatma yetkin yok.",
            ephemeral: true
        });
    }

    ticket.closed = true;

    saveDB();

    await interaction.reply({
        content:
            "🔒 Ticket kapatılıyor..."
    });

    setTimeout(
        () => {
            interaction.channel
                ?.delete(
                    "Ticket kapatıldı"
                )
                .catch(() => {});
        },
        1500
    );
}

/* ======================================================
   TICKET OTOMATİK KAPATMA
====================================================== */

setInterval(
    async () => {
        const now = Date.now();

        for (const [id, ticket] of Object.entries(
            db.tickets
        )) {
            if (ticket.closed) continue;

            const inactive =
                now - ticket.lastMessageAt;

            if (
                inactive >=
                60 * 60 * 1000
            ) {
                ticket.closed = true;

                saveDB();

                const channel =
                    await client.channels
                        .fetch(ticket.channelId)
                        .catch(() => null);

                if (channel) {
                    await channel.send(
                        "⏰ 60 dakika boyunca mesaj gelmediği için ticket otomatik olarak kapatılıyor."
                    ).catch(() => {});

                    setTimeout(
                        () => {
                            channel
                                .delete(
                                    "60 dakika aktiflik olmadığı için otomatik kapatma"
                                )
                                .catch(() => {});
                        },
                        3000
                    );
                }
            }
        }
    },
    60 * 1000
);

/* ======================================================
   DM
====================================================== */

async function sendDM(message) {
    if (!message.guild) return;

    if (!isModerator(message.member)) {
        return safeReply(
            message,
            "❌ Bu komutu sadece yetkililer kullanabilir."
        );
    }

    const target =
        getMentionedMember(message);

    if (!target) {
        return safeReply(
            message,
            "❌ Kullanım: `.dm @oyuncu mesaj`"
        );
    }

    const content =
        getRemainingArgsAfterMention(message);

    if (!content) {
        return safeReply(
            message,
            "❌ Gönderilecek mesajı yaz."
        );
    }

    const sent =
        await safeDM(
            target.user,
            content
        );

    if (!sent) {
        return safeReply(
            message,
            "❌ Oyuncuya DM gönderilemedi."
        );
    }

    return safeReply(
        message,
        `✅ ${target} oyuncusuna DM gönderildi.`
    );
}

async function sendDMAll(message) {
    if (!message.guild) return;

    if (!isAdmin(message.member)) {
        return safeReply(
            message,
            "❌ Bu komutu sadece Yönetici kullanabilir."
        );
    }

    const content =
        message.content
            .slice(
                `${PREFIX}dmall`.length
            )
            .trim();

    if (!content) {
        return safeReply(
            message,
            "❌ Gönderilecek mesajı yaz."
        );
    }

    const members =
        message.guild.members.cache
            .filter(
                member =>
                    !member.user.bot &&
                    isRegistered(member.id)
            );

    let sent = 0;
    let failed = 0;

    for (const [, member] of members) {
        const success =
            await safeDM(
                member.user,
                content
            );

        if (success) {
            sent++;
        } else {
            failed++;
        }

        /*
          Discord rate limitlerini azaltmak için
          mesajlar arasında kısa bekleme.
        */
        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    1000
                )
        );
    }

    return safeReply(
        message,
        `📩 DM işlemi tamamlandı.\n\n` +
        `✅ Başarılı: **${sent}**\n` +
        `❌ Başarısız: **${failed}**`
    );
}

/* ======================================================
   MODERASYON - SİL
====================================================== */

async function deleteMessages(message, args) {
    if (!message.guild) return;

    if (!isModerator(message.member)) {
        return safeReply(
            message,
            "❌ Bu komutu sadece yetkililer kullanabilir."
        );
    }

    const amount =
        Number(args[0]);

    if (
        !Number.isInteger(amount) ||
        amount < 1 ||
        amount > 100
    ) {
        return safeReply(
            message,
            "❌ 1 ile 100 arasında bir sayı yaz."
        );
    }

    try {
        const deleted =
            await message.channel.bulkDelete(
                amount,
                true
            );

        const response =
            await message.channel.send(
                `🗑️ **${deleted.size}** mesaj silindi.`
            );

        setTimeout(
            () =>
                response.delete().catch(() => {}),
            3000
        );
    } catch {
        return safeReply(
            message,
            "❌ Mesajlar silinemedi."
        );
    }
}

/* ======================================================
   KİLİT
====================================================== */

async function lockChannel(message) {
    if (!message.guild) return;

    if (!isModerator(message.member)) {
        return safeReply(
            message,
            "❌ Bu komutu sadece yetkililer kullanabilir."
        );
    }

    const everyone =
        message.guild.roles.everyone;

    try {
        await message.channel.permissionOverwrites.edit(
            everyone,
            {
                SendMessages: false
            }
        );

        return safeReply(
            message,
            "🔒 Kanal kilitlendi."
        );
    } catch {
        return safeReply(
            message,
            "❌ Kanal kilitlenemedi."
        );
    }
}

/* ======================================================
   AÇ
====================================================== */

async function unlockChannel(message) {
    if (!message.guild) return;

    if (!isModerator(message.member)) {
        return safeReply(
            message,
            "❌ Bu komutu sadece yetkililer kullanabilir."
        );
    }

    const everyone =
        message.guild.roles.everyone;

    try {
        await message.channel.permissionOverwrites.edit(
            everyone,
            {
                SendMessages: null
            }
        );

        return safeReply(
            message,
            "🔓 Kanalın kilidi açıldı."
        );
    } catch {
        return safeReply(
            message,
            "❌ Kanalın kilidi açılamadı."
        );
    }
}

/* ======================================================
   FUTBOLCU ARAMA
====================================================== */

async function searchPlayer(message, args) {
    if (!message.guild) return;

    if (!isRegistered(message.author.id)) {
        return safeReply(
            message,
            "❌ Önce kayıt olmalısın."
        );
    }

    const search =
        args.join(" ").trim();

    if (!search) {
        return safeReply(
            message,
            "❌ Kullanım: `.ara futbolcu W.Sneijder`"
        );
    }

    const players =
        Object.entries(db.players)
            .filter(
                ([, player]) =>
                    player.registered &&
                    player.name
                        .toLowerCase()
                        .includes(
                            search.toLowerCase()
                        )
            );

    if (players.length === 0) {
        return safeReply(
            message,
            "❌ Futbolcu bulunamadı."
        );
    }

    const lines =
        players
            .slice(0, 20)
            .map(
                ([userId, player]) =>
                    `👤 **${player.name}** | ` +
                    `${player.country} | ` +
                    `${player.position} | ` +
                    `${moneyText(player.value)} | ` +
                    `<@${userId}>`
            );

    const embed =
        new EmbedBuilder()
            .setTitle("🔎 Futbolcu Arama")
            .setDescription(
                lines.join("\n")
            )
            .setFooter({
                text: "Axera League"
            });

    return message.reply({
        embeds: [embed]
    });
}

/* ======================================================
   YARDIM
====================================================== */

async function help(message) {
    const embed =
        new EmbedBuilder()
            .setTitle("📖 Axera League Komutları")
            .setDescription(
                [
                    "**📝 Kayıt**",
                    "`.k @oyuncu İsim`",
                    "",
                    "**💰 Değer**",
                    "`.dver @oyuncu 5`",
                    "`.dsil @oyuncu 5`",
                    "",
                    "**💶 Bütçe**",
                    "`.bütçe`",
                    "`.bütçeekle @oyuncu 5`",
                    "`.bütçesil @oyuncu 5`",
                    "`.gönder @oyuncu 5`",
                    "",
                    "**🏃 Oyuncu**",
                    "`.ant`",
                    "`.antrenman`",
                    "`.pen`",
                    "`.penaltı`",
                    "`.kadro`",
                    "",
                    "**⚽ Lig**",
                    "`.maç`",
                    "`.maçsonuç`",
                    "`.fisktür`",
                    "`.golkrallık`",
                    "`.asistkrallık`",
                    "",
                    "**🎉 Çekiliş**",
                    "`.çekiliş`",
                    "",
                    "**🎫 Ticket**",
                    "`.ticketpanel`",
                    "",
                    "**📩 DM**",
                    "`.dm @oyuncu mesaj`",
                    "`.dmall mesaj`",
                    "",
                    "**🛡️ Moderasyon**",
                    "`.sil miktar`",
                    "`.kilit`",
                    "`.aç`",
                    "",
                    "**🔎 Arama**",
                    "`.ara futbolcu isim`"
                ].join("\n")
            )
            .setFooter({
                text: "Axera League"
            });

    return message.reply({
        embeds: [embed]
    });
}

/* ======================================================
   OYUNCU AL - TAKIM SİSTEMİ OLMADIĞI İÇİN
   KULLANILMIYOR.
====================================================== */

/*
  .oyuncual komutu özellikle çalıştırılmamaktadır.
  Çünkü takım sistemi kaldırılmıştır.
*/

/* ======================================================
   MESAJ AKTİVİTESİ
====================================================== */

client.on(
    "messageCreate",
    async message => {
        if (message.author.bot) return;

        /*
          Ticket mesaj aktivitesi
        */

        if (
            message.guild &&
            db.tickets
        ) {
            const ticketEntry =
                Object.entries(db.tickets)
                    .find(
                        ([, ticket]) =>
                            ticket.channelId ===
                            message.channel.id &&
                            !ticket.closed
                    );

            if (ticketEntry) {
                const [, ticket] =
                    ticketEntry;

                ticket.lastMessageAt =
                    Date.now();

                saveDB();
            }
        }

        if (!message.content.startsWith(PREFIX)) {
            return;
        }

        const content =
            message.content.slice(
                PREFIX.length
            ).trim();

        if (!content) return;

        const args =
            content.split(/\s+/);

        const command =
            args.shift().toLowerCase();

        try {
            switch (command) {

                /* ======================================
                   KAYIT
                ====================================== */

                case "k":
                    await startRegistration(message);
                    break;

                /* ======================================
                   DEĞER
                ====================================== */

                case "dver":
                    await addPlayerValue(message);
                    break;

                case "dsil":
                    await removePlayerValue(message);
                    break;

                /* ======================================
                   BÜTÇE
                ====================================== */

                case "bütçe":
                case "butce":
                    await showBudget(message);
                    break;

                case "bütçeekle":
                case "butceekle":
                    await addBudget(message);
                    break;

                case "bütçesil":
                case "butcesil":
                    await removeBudget(message);
                    break;

                case "gönder":
                case "gonder":
                    await sendBudget(message);
                    break;

                /* ======================================
                   ANTRENMAN
                ====================================== */

                case "ant":
                case "antrenman":
                    await training(message);
                    break;

                /* ======================================
                   PENALTI
                ====================================== */

                case "pen":
                case "penaltı":
                case "penalti":
                    await penalty(message);
                    break;

                /* ======================================
                   KADRO
                ====================================== */

                case "kadro":
                    await showSquad(message);
                    break;

                /* ======================================
                   MAÇ
                ====================================== */

                case "maç":
                case "mac":
                    await createMatch(
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

                /* ======================================
                   FİKSTÜR
                ====================================== */

                case "fisktür":
                case "fisktur":
                    await fixture(message);
                    break;

                /* ======================================
                   KRALLIK
                ====================================== */

                case "golkrallık":
                case "golkrallik":
                    await goalKing(message);
                    break;

                case "asistkrallık":
                case "asistkrallik":
                    await assistKing(message);
                    break;

                /* ======================================
                   ÇEKİLİŞ
                ====================================== */

                case "çekiliş":
                case "cekilis":
                    await createGiveaway(
                        message,
                        args
                    );
                    break;

                /* ======================================
                   TICKET
                ====================================== */

                case "ticketpanel":
                    await ticketPanel(message);
                    break;

                /* ======================================
                   DM
                ====================================== */

                case "dm":
                    await sendDM(message);
                    break;

                case "dmall":
                    await sendDMAll(message);
                    break;

                /* ======================================
                   MODERASYON
                ====================================== */

                case "sil":
                    await deleteMessages(
                        message,
                        args
                    );
                    break;

                case "kilit":
                    await lockChannel(message);
                    break;

                case "aç":
                case "ac":
                    await unlockChannel(message);
                    break;

                /* ======================================
                   ARAMA
                ====================================== */

                case "ara": {
                    if (
                        args[0] &&
                        args[0].toLowerCase() ===
                        "futbolcu"
                    ) {
                        args.shift();

                        await searchPlayer(
                            message,
                            args
                        );
                    } else {
                        await safeReply(
                            message,
                            "❌ Kullanım: `.ara futbolcu isim`"
                        );
                    }

                    break;
                }

                /* ======================================
                   YARDIM
                ====================================== */

                case "yardım":
                case "yardim":
                    await help(message);
                    break;

                /* ======================================
                   KALDIRILAN KOMUTLAR
                ====================================== */

                case "rolpanel":
                case "rolver":
                case "rolal":
                case "kap":
                case "embed":
                case "emojikur":
                    await safeReply(
                        message,
                        "❌ Bu komut Axera League sisteminden kaldırıldı."
                    );
                    break;

                default:
                    break;
            }
        } catch (error) {
            console.error(
                `.${command} komut hatası:`,
                error
            );

            await safeReply(
                message,
                "❌ Komut çalıştırılırken bir hata oluştu."
            );
        }
    }
);

/* ======================================================
   BUTONLAR
====================================================== */

client.on(
    "interactionCreate",
    async interaction => {

        if (!interaction.isButton()) {
            return;
        }

        try {

            /* ==========================================
               KAYIT BUTONLARI
            ========================================== */

            if (
                interaction.customId.startsWith(
                    "register_"
                )
            ) {
                await completeRegistration(
                    interaction
                );

                return;
            }

            /* ==========================================
               ÇEKİLİŞ
            ========================================== */

            if (
                interaction.customId.startsWith(
                    "giveaway_join_"
                )
            ) {
                const id =
                    interaction.customId.replace(
                        "giveaway_join_",
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

                if (giveaway.finished) {
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
                            "❌ Zaten çekilişe katıldın.",
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

            /* ==========================================
               TICKET OLUŞTUR
            ========================================== */

            if (
                interaction.customId ===
                "ticket_create"
            ) {
                await createTicket(
                    interaction
                );

                return;
            }

            /* ==========================================
               TICKET KAPAT
            ========================================== */

            if (
                interaction.customId.startsWith(
                    "ticket_close_"
                )
            ) {
                await closeTicket(
                    interaction
                );

                return;
            }

        } catch (error) {
            console.error(
                "Interaction hatası:",
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

/* ======================================================
   BOT HAZIR
====================================================== */

client.once(
    "ready",
    () => {
        console.log(
            "========================================"
        );

        console.log(
            `✅ ${client.user.tag} aktif!`
        );

        console.log(
            `📡 ${client.guilds.cache.size} sunucuda aktif`
        );

        console.log(
            `⚽ Axera League sistemi hazır`
        );

        console.log(
            "========================================"
        );

        client.user.setPresence({
            activities: [
                {
                    name: "Axera League ⚽",
                    type: 0
                }
            ],
            status: "online"
        });
    }
);

/* ======================================================
   HATALAR
====================================================== */

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

/* ======================================================
   TOKEN
====================================================== */

if (!TOKEN) {
    console.error(
        "❌ TOKEN bulunamadı! Railway Variables kısmına TOKEN ekle."
    );
    process.exit(1);
}

client.login(TOKEN);
