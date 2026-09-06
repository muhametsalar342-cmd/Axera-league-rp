// ============================================================
// AXERA LEAGUE BOT
// Discord.js v14
// Tek parça index.js
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
    ChannelType,
    Collection
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ============================================================
// AYARLAR
// ============================================================

const PREFIX = ".";

const ROLE_YONETICI = "1544449436011339806";
const ROLE_KAYIT_YETKILISI = "1544452022764568656";
const ROLE_DEGER_YETKILISI = "1544451743746891806";
const ROLE_MODERATOR = "1544450307088715917";
const ROLE_TD = "1544452323450032229";
const ROLE_OYUNCU = "1544452779156709516";
const ROLE_KAYITSIZ = "1544488182027133030";

const ANNOUNCEMENT_CHANNEL = "1544653653330108477";

const TRAINING_REWARD = 5_000_000;
const PENALTY_REWARD = 5_000_000;

// ============================================================
// CLIENT
// ============================================================

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
        Partials.User
    ]
});

// ============================================================
// VERİTABANI
// ============================================================

const dataFolder = path.join(__dirname, "data");

if (!fs.existsSync(dataFolder)) {
    fs.mkdirSync(dataFolder, { recursive: true });
}

const dbFile = path.join(dataFolder, "database.json");

const defaultDB = {
    users: {},
    matches: [],
    fixtures: [],
    giveaways: [],
    tickets: {}
};

function loadDB() {
    try {
        if (!fs.existsSync(dbFile)) {
            fs.writeFileSync(
                dbFile,
                JSON.stringify(defaultDB, null, 2)
            );
            return JSON.parse(JSON.stringify(defaultDB));
        }

        const raw = fs.readFileSync(dbFile, "utf8");

        if (!raw.trim()) {
            return JSON.parse(JSON.stringify(defaultDB));
        }

        const parsed = JSON.parse(raw);

        return {
            users: parsed.users || {},
            matches: parsed.matches || [],
            fixtures: parsed.fixtures || [],
            giveaways: parsed.giveaways || [],
            tickets: parsed.tickets || {}
        };
    } catch (error) {
        console.error("Veritabanı okunamadı:", error);

        return JSON.parse(JSON.stringify(defaultDB));
    }
}

let db = loadDB();

function saveDB() {
    try {
        fs.writeFileSync(
            dbFile,
            JSON.stringify(db, null, 2)
        );
    } catch (error) {
        console.error("Veritabanı kaydedilemedi:", error);
    }
}

// ============================================================
// YARDIMCI FONKSİYONLAR
// ============================================================

function getUser(userId) {
    if (!db.users[userId]) {
        db.users[userId] = {
            registered: false,
            name: "",
            country: "🇹🇷",
            position: "SNT",
            value: 0,
            budget: 0,
            goals: 0,
            assists: 0,
            trainings: 0,
            penalties: 0
        };

        saveDB();
    }

    return db.users[userId];
}

function formatMoney(amount) {
    amount = Number(amount) || 0;

    return amount
        .toLocaleString("tr-TR")
        .replace(/\./g, ".") + "€";
}

function parseMoney(value) {
    if (!value) return 0;

    let text = String(value)
        .toLowerCase()
        .replace(/€/g, "")
        .replace(/\s/g, "")
        .replace(/\./g, "")
        .replace(/,/g, ".");

    let multiplier = 1;

    if (text.endsWith("m")) {
        multiplier = 1_000_000;
        text = text.slice(0, -1);
    } else if (text.endsWith("k")) {
        multiplier = 1_000;
        text = text.slice(0, -1);
    }

    const number = Number(text);

    if (!Number.isFinite(number)) {
        return 0;
    }

    return Math.floor(number * multiplier);
}

function getMentionedMember(message) {
    return message.mentions.members.first() || null;
}

function hasRole(member, roleId) {
    return member.roles.cache.has(roleId);
}

function isAdmin(member) {
    return (
        member.permissions.has(PermissionsBitField.Flags.Administrator) ||
        hasRole(member, ROLE_YONETICI)
    );
}

function isModerator(member) {
    return (
        isAdmin(member) ||
        hasRole(member, ROLE_MODERATOR)
    );
}

function isValueStaff(member) {
    return (
        isAdmin(member) ||
        hasRole(member, ROLE_DEGER_YETKILISI)
    );
}

function isRegistrationStaff(member) {
    return (
        isAdmin(member) ||
        hasRole(member, ROLE_KAYIT_YETKILISI)
    );
}

function isManager(member) {
    return (
        isAdmin(member) ||
        hasRole(member, ROLE_TD)
    );
}

function cleanName(text) {
    return String(text || "")
        .replace(/\|/g, "")
        .trim();
}

// ============================================================
// NICKNAME PARSE
// ============================================================

function parsePlayerNickname(nickname) {
    const raw = String(nickname || "").trim();

    const parts = raw
        .split("|")
        .map(x => x.trim());

    let name = parts[0] || "";
    let country = "🇹🇷";
    let position = "SNT";
    let value = null;

    if (parts[1]) {
        country = parts[1];
    }

    if (parts[2]) {
        position = parts[2];
    }

    if (parts[3]) {
        const parsed = parseMoney(parts[3]);

        if (Number.isFinite(parsed)) {
            value = parsed;
        }
    }

    return {
        name,
        country,
        position,
        value
    };
}

// ============================================================
// DEĞER SİSTEMİ
// ============================================================

function updatePlayerNickname(member, userData) {
    if (!member || !member.manageable) {
        return false;
    }

    const current = parsePlayerNickname(member.nickname || member.user.username);

    const name =
        userData.name ||
        current.name ||
        member.user.username;

    const country =
        userData.country ||
        current.country ||
        "🇹🇷";

    const position =
        userData.position ||
        current.position ||
        "SNT";

    const value = Number(userData.value) || 0;

    const newNickname =
        `${name} | ${country} | ${position} | ${formatMoney(value)}`;

    return member
        .setNickname(newNickname)
        .then(() => true)
        .catch(error => {
            console.error("Nickname değiştirilemedi:", error.message);
            return false;
        });
}

async function addPlayerValue(member, amount) {
    if (!member) return false;

    const user = getUser(member.id);

    let currentValue = Number(user.value) || 0;

    // Nickname'deki mevcut değer de kontrol edilir.
    const nicknameData = parsePlayerNickname(
        member.nickname || member.user.username
    );

    if (
        nicknameData.value !== null &&
        nicknameData.value > currentValue
    ) {
        currentValue = nicknameData.value;
    }

    user.value = Math.max(
        0,
        currentValue + Number(amount)
    );

    if (!user.name) {
        user.name =
            nicknameData.name ||
            member.user.username;
    }

    if (!user.country) {
        user.country =
            nicknameData.country ||
            "🇹🇷";
    }

    if (!user.position) {
        user.position =
            nicknameData.position ||
            "SNT";
    }

    saveDB();

    await updatePlayerNickname(member, user);

    return true;
}

async function removePlayerValue(member, amount) {
    if (!member) return false;

    const user = getUser(member.id);

    let currentValue = Number(user.value) || 0;

    const nicknameData = parsePlayerNickname(
        member.nickname || member.user.username
    );

    if (
        nicknameData.value !== null &&
        nicknameData.value > currentValue
    ) {
        currentValue = nicknameData.value;
    }

    user.value = Math.max(
        0,
        currentValue - Number(amount)
    );

    if (!user.name) {
        user.name =
            nicknameData.name ||
            member.user.username;
    }

    if (!user.country) {
        user.country =
            nicknameData.country ||
            "🇹🇷";
    }

    if (!user.position) {
        user.position =
            nicknameData.position ||
            "SNT";
    }

    saveDB();

    await updatePlayerNickname(member, user);

    return true;
}

// ============================================================
// KAYIT SİSTEMİ
// ============================================================

function registrationButtons(userId, staffId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`register_td_${userId}_${staffId}`)
            .setLabel("Teknik Direktör")
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId(`register_uye_${userId}_${staffId}`)
            .setLabel("Üye")
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(`register_kaleci_${userId}_${staffId}`)
            .setLabel("Kaleci")
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId(`register_futbolcu_${userId}_${staffId}`)
            .setLabel("Futbolcu")
            .setStyle(ButtonStyle.Danger)
    );
}

// ============================================================
// MESAJ OLAYI
// ============================================================

client.on("messageCreate", async message => {
    try {
        if (message.author.bot) return;

        if (!message.guild) return;

        if (!message.content.startsWith(PREFIX)) return;

        const content = message.content.slice(PREFIX.length).trim();

        if (!content) return;

        const args = content.split(/\s+/);
        const command = args.shift().toLowerCase();

        const member =
            message.member ||
            await message.guild.members.fetch(message.author.id);

        // ====================================================
        // YARDIM
        // ====================================================

        if (
            command === "yardım" ||
            command === "yardim" ||
            command === "help"
        ) {
            const embed = new EmbedBuilder()
                .setTitle("⚽ AXERA LEAGUE")
                .setDescription(
                    "Axera League komut listesi"
                )
                .addFields(
                    {
                        name: "👤 Kayıt",
                        value:
                            "`.k @oyuncu İsim`\n" +
                            "Kayıt yetkilileri kullanabilir."
                    },
                    {
                        name: "💰 Değer",
                        value:
                            "`.dver @oyuncu 5`\n" +
                            "`.dsil @oyuncu 5`"
                    },
                    {
                        name: "💳 Bütçe",
                        value:
                            "`.bütçe`\n" +
                            "`.gönder @oyuncu 1M`"
                    },
                    {
                        name: "⚽ Gelişim",
                        value:
                            "`.ant`\n" +
                            "`.pen`"
                    },
                    {
                        name: "📊 İstatistik",
                        value:
                            "`.golkrallık`\n" +
                            "`.asistkrallık`\n" +
                            "`.kadro`"
                    },
                    {
                        name: "⚽ Maç",
                        value:
                            "`.maç Takım1 Takım2`\n" +
                            "`.maçsonuç Takım1 Takım2 2-1`\n" +
                            "`.fisktür`"
                    },
                    {
                        name: "🎫 Ticket",
                        value:
                            "`.ticketpanel`"
                    },
                    {
                        name: "🎉 Çekiliş",
                        value:
                            "`.çekiliş dakika ödül`"
                    },
                    {
                        name: "🛡️ Moderasyon",
                        value:
                            "`.sil 10`\n" +
                            "`.kilit`\n" +
                            "`.aç`"
                    },
                    {
                        name: "📩 DM",
                        value:
                            "`.dm @oyuncu mesaj`\n" +
                            "`.dmall mesaj`"
                    },
                    {
                        name: "🔎 Arama",
                        value:
                            "`.ara futbolcu`"
                    }
                )
                .setColor(0x5865F2)
                .setFooter({
                    text: "Axera League"
                });

            return message.reply({
                embeds: [embed]
            });
        }

        // ====================================================
        // KAYIT
        // ====================================================

        if (command === "k") {
            if (!isRegistrationStaff(member)) {
                return message.reply(
                    "❌ Bu komutu yalnızca **Kayıt Yetkilisi** kullanabilir."
                );
            }

            const target = getMentionedMember(message);

            if (!target) {
                return message.reply(
                    "❌ Kullanım: `.k @Oyuncu İsim`"
                );
            }

            const mentioned = message.mentions.users.first();

            let playerName = args
                .filter(x => !x.startsWith("<@"))
                .join(" ")
                .trim();

            if (!playerName) {
                return message.reply(
                    "❌ Oyuncunun ismini yazmalısın."
                );
            }

            playerName = cleanName(playerName);

            const user = getUser(target.id);

            user.name = playerName;

            if (!user.country) {
                user.country = "🇹🇷";
            }

            if (!user.position) {
                user.position = "SNT";
            }

            if (typeof user.value !== "number") {
                user.value = 0;
            }

            user.registered = true;

            saveDB();

            const embed = new EmbedBuilder()
                .setTitle("📋 Oyuncu Kaydı")
                .setDescription(
                    `**${target.user.username}** için kayıt türünü seçin.`
                )
                .addFields({
                    name: "Oyuncu",
                    value: `${target}`
                })
                .setColor(0x2B2D31);

            return message.reply({
                embeds: [embed],
                components: [
                    registrationButtons(
                        target.id,
                        member.id
                    )
                ]
            });
        }

        // ====================================================
        // DEĞER VER
        // ====================================================

        if (command === "dver") {
            if (!isValueStaff(member)) {
                return message.reply(
                    "❌ Bu komutu yalnızca **Değer Yetkilisi** kullanabilir."
                );
            }

            const target = getMentionedMember(message);

            if (!target) {
                return message.reply(
                    "❌ Kullanım: `.dver @Oyuncu 5`"
                );
            }

            const amount = parseMoney(args[0]);

            if (amount <= 0) {
                return message.reply(
                    "❌ Geçerli bir miktar gir."
                );
            }

            const user = getUser(target.id);

            const oldValue = Number(user.value) || 0;

            await addPlayerValue(target, amount);

            const newValue =
                Number(getUser(target.id).value) || 0;

            return message.reply(
                `✅ ${target} değerine **${formatMoney(amount)}** eklendi.\n` +
                `💰 Eski değer: **${formatMoney(oldValue)}**\n` +
                `💰 Yeni değer: **${formatMoney(newValue)}**`
            );
        }

        // ====================================================
        // DEĞER SİL
        // ====================================================

        if (command === "dsil") {
            if (!isValueStaff(member)) {
                return message.reply(
                    "❌ Bu komutu yalnızca **Değer Yetkilisi** kullanabilir."
                );
            }

            const target = getMentionedMember(message);

            if (!target) {
                return message.reply(
                    "❌ Kullanım: `.dsil @Oyuncu 5`"
                );
            }

            const amount = parseMoney(args[0]);

            if (amount <= 0) {
                return message.reply(
                    "❌ Geçerli bir miktar gir."
                );
            }

            const user = getUser(target.id);

            const oldValue = Number(user.value) || 0;

            await removePlayerValue(target, amount);

            const newValue =
                Number(getUser(target.id).value) || 0;

            return message.reply(
                `✅ ${target} değerinden **${formatMoney(amount)}** çıkarıldı.\n` +
                `💰 Eski değer: **${formatMoney(oldValue)}**\n` +
                `💰 Yeni değer: **${formatMoney(newValue)}**`
            );
        }

        // ====================================================
        // BÜTÇE
        // ====================================================

        if (
            command === "bütçe" ||
            command === "butce"
        ) {
            const user = getUser(message.author.id);

            return message.reply(
                `💳 ${message.author} kişisel bütçen: **${formatMoney(user.budget)}**`
            );
        }

        // ====================================================
        // BÜTÇE EKLE
        // ====================================================

        if (
            command === "bütçeekle" ||
            command === "butceekle"
        ) {
            if (!isValueStaff(member)) {
                return message.reply(
                    "❌ Bu komutu yalnızca **Değer Yetkilisi** kullanabilir."
                );
            }

            const target = getMentionedMember(message);

            if (!target) {
                return message.reply(
                    "❌ Kullanım: `.bütçeekle @Oyuncu 5M`"
                );
            }

            const amount = parseMoney(args[0]);

            if (amount <= 0) {
                return message.reply(
                    "❌ Geçerli miktar gir."
                );
            }

            const user = getUser(target.id);

            user.budget += amount;

            saveDB();

            return message.reply(
                `✅ ${target} hesabına **${formatMoney(amount)}** eklendi.\n` +
                `💳 Yeni bütçe: **${formatMoney(user.budget)}**`
            );
        }

        // ====================================================
        // BÜTÇE SİL
        // ====================================================

        if (
            command === "bütçesil" ||
            command === "butcesil"
        ) {
            if (!isValueStaff(member)) {
                return message.reply(
                    "❌ Bu komutu yalnızca **Değer Yetkilisi** kullanabilir."
                );
            }

            const target = getMentionedMember(message);

            if (!target) {
                return message.reply(
                    "❌ Kullanım: `.bütçesil @Oyuncu 5M`"
                );
            }

            const amount = parseMoney(args[0]);

            if (amount <= 0) {
                return message.reply(
                    "❌ Geçerli miktar gir."
                );
            }

            const user = getUser(target.id);

            user.budget = Math.max(
                0,
                user.budget - amount
            );

            saveDB();

            return message.reply(
                `✅ ${target} hesabından **${formatMoney(amount)}** çıkarıldı.\n` +
                `💳 Yeni bütçe: **${formatMoney(user.budget)}**`
            );
        }

        // ====================================================
        // PARA GÖNDER
        // ====================================================

        if (
            command === "gönder" ||
            command === "gonder"
        ) {
            const target = getMentionedMember(message);

            if (!target) {
                return message.reply(
                    "❌ Kullanım: `.gönder @Oyuncu 5M`"
                );
            }

            if (target.id === message.author.id) {
                return message.reply(
                    "❌ Kendine para gönderemezsin."
                );
            }

            const amount = parseMoney(args[0]);

            if (amount <= 0) {
                return message.reply(
                    "❌ Geçerli miktar gir."
                );
            }

            const sender = getUser(message.author.id);
            const receiver = getUser(target.id);

            if (sender.budget < amount) {
                return message.reply(
                    "❌ Yeterli bütçen yok."
                );
            }

            sender.budget -= amount;
            receiver.budget += amount;

            saveDB();

            return message.reply(
                `✅ **${formatMoney(amount)}** ${target} kişisine gönderildi.\n` +
                `💳 Kalan bütçen: **${formatMoney(sender.budget)}**`
            );
        }

        // ====================================================
        // ANTRENMAN
        // ====================================================

        if (
            command === "ant" ||
            command === "antrenman"
        ) {
            const user = getUser(message.author.id);

            user.trainings += 1;

            saveDB();

            await addPlayerValue(
                member,
                TRAINING_REWARD
            );

            return message.reply(
                `🏋️ Antrenman tamamlandı!\n` +
                `📈 Değerine **${formatMoney(TRAINING_REWARD)}** eklendi.\n` +
                `💰 Yeni değerin: **${formatMoney(getUser(member.id).value)}**`
            );
        }

        // ====================================================
        // PENALTI
        // ====================================================

        if (
            command === "pen" ||
            command === "penaltı" ||
            command === "penalti"
        ) {
            const user = getUser(message.author.id);

            const scored =
                Math.random() < 0.5;

            user.penalties += 1;

            if (!scored) {
                saveDB();

                return message.reply(
                    "🥅 **Penaltı kaçtı!**\n" +
                    "❌ Değer artışı kazanamadın."
                );
            }

            user.goals += 1;

            saveDB();

            await addPlayerValue(
                member,
                PENALTY_REWARD
            );

            return message.reply(
                `⚽ **GOOOL!**\n` +
                `💰 Değerine **${formatMoney(PENALTY_REWARD)}** eklendi.\n` +
                `⚽ Gol sayın: **${user.goals}**\n` +
                `💰 Yeni değerin: **${formatMoney(getUser(member.id).value)}**`
            );
        }

        // ====================================================
        // KADRO
        // ====================================================

        if (command === "kadro") {
            const players = Object.entries(db.users)
                .filter(([id, user]) => user.name);

            if (players.length === 0) {
                return message.reply(
                    "📋 Henüz kayıtlı oyuncu bulunmuyor."
                );
            }

            const list = players
                .slice(0, 50)
                .map(([id, user], index) => {
                    return (
                        `**${index + 1}.** <@${id}> — ` +
                        `${user.name} | ` +
                        `${user.country || "🇹🇷"} | ` +
                        `${user.position || "SNT"} | ` +
                        `${formatMoney(user.value)}`
                    );
                })
                .join("\n");

            const embed = new EmbedBuilder()
                .setTitle("⚽ Axera League Kadro")
                .setDescription(list)
                .setColor(0x5865F2);

            return message.reply({
                embeds: [embed]
            });
        }

        // ====================================================
        // GOL KRALLIĞI
        // ====================================================

        if (
            command === "golkrallık" ||
            command === "golkralligi" ||
            command === "golkralligi"
        ) {
            const players = Object.entries(db.users)
                .filter(([id, user]) =>
                    user.name
                )
                .sort((a, b) =>
                    (b[1].goals || 0) -
                    (a[1].goals || 0)
                )
                .slice(0, 10);

            if (players.length === 0) {
                return message.reply(
                    "⚽ Henüz gol istatistiği bulunmuyor."
                );
            }

            const text = players
                .map(([id, user], index) =>
                    `**${index + 1}.** <@${id}> — **${user.goals || 0} gol**`
                )
                .join("\n");

            const embed = new EmbedBuilder()
                .setTitle("⚽ Gol Krallığı")
                .setDescription(text)
                .setColor(0xF1C40F);

            return message.reply({
                embeds: [embed]
            });
        }

        // ====================================================
        // ASİST KRALLIĞI
        // ====================================================

        if (
            command === "asistkrallık" ||
            command === "asistkralligi"
        ) {
            const players = Object.entries(db.users)
                .filter(([id, user]) =>
                    user.name
                )
                .sort((a, b) =>
                    (b[1].assists || 0) -
                    (a[1].assists || 0)
                )
                .slice(0, 10);

            if (players.length === 0) {
                return message.reply(
                    "🎯 Henüz asist istatistiği bulunmuyor."
                );
            }

            const text = players
                .map(([id, user], index) =>
                    `**${index + 1}.** <@${id}> — **${user.assists || 0} asist**`
                )
                .join("\n");

            const embed = new EmbedBuilder()
                .setTitle("🎯 Asist Krallığı")
                .setDescription(text)
                .setColor(0x3498DB);

            return message.reply({
                embeds: [embed]
            });
        }

        // ====================================================
        // MAÇ
        // ====================================================

        if (command === "maç" || command === "mac") {
            if (args.length < 2) {
                return message.reply(
                    "❌ Kullanım: `.maç Takım1 Takım2`"
                );
            }

            const half = Math.ceil(args.length / 2);

            const team1 =
                args.slice(0, half).join(" ");

            const team2 =
                args.slice(half).join(" ");

            const match = {
                id: Date.now().toString(),
                team1,
                team2,
                score: null,
                createdAt: Date.now()
            };

            db.matches.push(match);

            saveDB();

            return message.reply(
                `⚽ **Maç oluşturuldu!**\n\n` +
                `🏠 ${team1}\n` +
                `🆚\n` +
                `✈️ ${team2}\n\n` +
                `Maç ID: \`${match.id}\``
            );
        }

        // ====================================================
        // MAÇ SONUCU
        // ====================================================

        if (
            command === "maçsonuç" ||
            command === "macsonuc"
        ) {
            if (!isManager(member)) {
                return message.reply(
                    "❌ Bu komutu yalnızca yetkili/Teknik Direktör kullanabilir."
                );
            }

            if (args.length < 3) {
                return message.reply(
                    "❌ Kullanım: `.maçsonuç Takım1 Takım2 2-1`"
                );
            }

            const score = args.pop();

            if (!/^\d+-\d+$/.test(score)) {
                return message.reply(
                    "❌ Skor `2-1` şeklinde olmalı."
                );
            }

            const half = Math.ceil(args.length / 2);

            const team1 =
                args.slice(0, half).join(" ");

            const team2 =
                args.slice(half).join(" ");

            db.matches.push({
                id: Date.now().toString(),
                team1,
                team2,
                score,
                createdAt: Date.now()
            });

            saveDB();

            return message.reply(
                `✅ Maç sonucu kaydedildi.\n` +
                `⚽ **${team1} ${score} ${team2}**`
            );
        }

        // ====================================================
        // FİKSTÜR
        // ====================================================

        if (
            command === "fisktür" ||
            command === "fisktur"
        ) {
            if (db.matches.length === 0) {
                return message.reply(
                    "📅 Henüz maç bulunmuyor."
                );
            }

            const list = db.matches
                .slice(-20)
                .reverse()
                .map((match, index) => {
                    return (
                        `**${index + 1}.** ${match.team1} ` +
                        `**${match.score || "VS"}** ` +
                        `${match.team2}`
                    );
                })
                .join("\n");

            const embed = new EmbedBuilder()
                .setTitle("📅 Axera League Fikstür")
                .setDescription(list)
                .setColor(0x5865F2);

            return message.reply({
                embeds: [embed]
            });
        }

        // ====================================================
        // ÇEKİLİŞ
        // ====================================================

        if (
            command === "çekiliş" ||
            command === "cekilis"
        ) {
            if (!isAdmin(member)) {
                return message.reply(
                    "❌ Bu komutu yalnızca Yönetici kullanabilir."
                );
            }

            const minutes = Number(args[0]);

            if (!Number.isFinite(minutes) || minutes <= 0) {
                return message.reply(
                    "❌ Kullanım: `.çekiliş 10 30M`"
                );
            }

            const prize =
                args.slice(1).join(" ") || "Ödül";

            const giveawayEmbed = new EmbedBuilder()
                .setTitle("🎉 ÇEKİLİŞ")
                .setDescription(
                    `🎁 Ödül: **${prize}**\n\n` +
                    `⏱️ Süre: **${minutes} dakika**\n\n` +
                    `Katılmak için aşağıdaki butona basın.`
                )
                .setColor(0xE91E63);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            `giveaway_join_${Date.now()}`
                        )
                        .setLabel("🎉 Katıl")
                        .setStyle(ButtonStyle.Success)
                );

            const giveawayMessage =
                await message.channel.send({
                    embeds: [giveawayEmbed],
                    components: [row]
                });

            const giveaway = {
                id: giveawayMessage.id,
                channelId: message.channel.id,
                prize,
                participants: [],
                endAt:
                    Date.now() +
                    minutes * 60 * 1000
            };

            db.giveaways.push(giveaway);

            saveDB();

            setTimeout(async () => {
                await finishGiveaway(
                    giveaway.id
                );
            }, minutes * 60 * 1000);

            return;
        }

        // ====================================================
        // TICKET PANEL
        // ====================================================

        if (command === "ticketpanel") {
            if (!isAdmin(member)) {
                return message.reply(
                    "❌ Bu komutu yalnızca Yönetici kullanabilir."
                );
            }

            const embed = new EmbedBuilder()
                .setTitle("🎫 Destek Sistemi")
                .setDescription(
                    "Destek talebi oluşturmak için aşağıdaki butona basın."
                )
                .setColor(0x5865F2);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId("ticket_create")
                        .setLabel("🎫 Ticket Oluştur")
                        .setStyle(ButtonStyle.Primary)
                );

            return message.channel.send({
                embeds: [embed],
                components: [row]
            });
        }

        // ====================================================
        // DM
        // ====================================================

        if (command === "dm") {
            if (!isAdmin(member)) {
                return message.reply(
                    "❌ Bu komutu yalnızca Yönetici kullanabilir."
                );
            }

            const target = getMentionedMember(message);

            if (!target) {
                return message.reply(
                    "❌ Kullanım: `.dm @Oyuncu Mesaj`"
                );
            }

            const text = args
                .filter(x => !x.startsWith("<@"))
                .join(" ")
                .trim();

            if (!text) {
                return message.reply(
                    "❌ Gönderilecek mesajı yaz."
                );
            }

            try {
                await target.send(text);

                return message.reply(
                    `✅ ${target} kişisine DM gönderildi.`
                );
            } catch {
                return message.reply(
                    "❌ Bu kullanıcıya DM gönderilemedi."
                );
            }
        }

        // ====================================================
        // DM ALL
        // ====================================================

        if (command === "dmall") {
            if (!isAdmin(member)) {
                return message.reply(
                    "❌ Bu komutu yalnızca Yönetici kullanabilir."
                );
            }

            const text = args.join(" ").trim();

            if (!text) {
                return message.reply(
                    "❌ Gönderilecek mesajı yaz."
                );
            }

            await message.reply(
                "📨 DM gönderimi başlatıldı."
            );

            const members =
                await message.guild.members.fetch();

            let sent = 0;
            let failed = 0;

            for (const guildMember of members.values()) {
                if (guildMember.user.bot) continue;

                try {
                    await guildMember.send(text);

                    sent++;

                    await new Promise(resolve =>
                        setTimeout(resolve, 700)
                    );
                } catch {
                    failed++;
                }
            }

            return message.channel.send(
                `📨 DM işlemi tamamlandı.\n` +
                `✅ Başarılı: **${sent}**\n` +
                `❌ Başarısız: **${failed}**`
            );
        }

        // ====================================================
        // MESAJ SİL
        // ====================================================

        if (
            command === "sil" ||
            command === "clear"
        ) {
            if (!isModerator(member)) {
                return message.reply(
                    "❌ Bu komutu kullanma yetkin yok."
                );
            }

            const amount = Number(args[0]);

            if (
                !Number.isInteger(amount) ||
                amount < 1 ||
                amount > 100
            ) {
                return message.reply(
                    "❌ 1-100 arasında sayı gir."
                );
            }

            await message.channel.bulkDelete(
                amount + 1,
                true
            );

            return message.channel.send(
                `🧹 **${amount}** mesaj silindi.`
            ).then(msg => {
                setTimeout(() => {
                    msg.delete().catch(() => {});
                }, 3000);
            });
        }

        // ====================================================
        // KİLİT
        // ====================================================

        if (
            command === "kilit" ||
            command === "lock"
        ) {
            if (!isModerator(member)) {
                return message.reply(
                    "❌ Bu komutu kullanma yetkin yok."
                );
            }

            await message.channel.permissionOverwrites.edit(
                message.guild.roles.everyone,
                {
                    SendMessages: false
                }
            );

            return message.reply(
                "🔒 Kanal kilitlendi."
            );
        }

        // ====================================================
        // AÇ
        // ====================================================

        if (
            command === "aç" ||
            command === "ac" ||
            command === "unlock"
        ) {
            if (!isModerator(member)) {
                return message.reply(
                    "❌ Bu komutu kullanma yetkin yok."
                );
            }

            await message.channel.permissionOverwrites.edit(
                message.guild.roles.everyone,
                {
                    SendMessages: null
                }
            );

            return message.reply(
                "🔓 Kanalın kilidi açıldı."
            );
        }

        // ====================================================
        // OYUNCU ARA
        // ====================================================

        if (
            command === "ara" ||
            command === "oyuncuara"
        ) {
            const search = args.join(" ")
                .toLowerCase()
                .trim();

            if (!search) {
                return message.reply(
                    "❌ Kullanım: `.ara Sneijder`"
                );
            }

            const results = Object.entries(db.users)
                .filter(([id, user]) => {
                    const name =
                        String(user.name || "")
                            .toLowerCase();

                    return name.includes(search);
                })
                .slice(0, 10);

            if (results.length === 0) {
                return message.reply(
                    "🔎 Oyuncu bulunamadı."
                );
            }

            const text = results
                .map(([id, user]) =>
                    `<@${id}> — **${user.name}** | ` +
                    `${user.country || "🇹🇷"} | ` +
                    `${user.position || "SNT"} | ` +
                    `${formatMoney(user.value)}`
                )
                .join("\n");

            const embed = new EmbedBuilder()
                .setTitle("🔎 Oyuncu Arama")
                .setDescription(text)
                .setColor(0x5865F2);

            return message.reply({
                embeds: [embed]
            });
        }

    } catch (error) {
        console.error(
            "messageCreate hatası:",
            error
        );

        try {
            await message.reply(
                "❌ İşlem sırasında bir hata oluştu."
            );
        } catch {}
    }
});

// ============================================================
// BUTTON INTERACTIONS
// ============================================================

client.on("interactionCreate", async interaction => {
    try {
        // ====================================================
        // KAYIT BUTONLARI
        // ====================================================

        if (
            interaction.isButton() &&
            interaction.customId.startsWith("register_")
        ) {
            const parts =
                interaction.customId.split("_");

            const type = parts[1];
            const userId = parts[2];
            const staffId = parts[3];

            if (
                interaction.user.id !== staffId &&
                !isAdmin(interaction.member)
            ) {
                return interaction.reply({
                    content:
                        "❌ Bu kayıt panelini yalnızca kaydı başlatan yetkili kullanabilir.",
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
                        "❌ Oyuncu bulunamadı.",
                    ephemeral: true
                });
            }

            const user = getUser(userId);

            let roleId = ROLE_OYUNCU;
            let typeName = "Üye";

            if (type === "td") {
                roleId = ROLE_TD;
                typeName = "Teknik Direktör";
            }

            if (type === "uye") {
                roleId = ROLE_OYUNCU;
                typeName = "Üye";
            }

            if (type === "kaleci") {
                roleId = ROLE_OYUNCU;
                typeName = "Kaleci";
                user.position = "KL";
            }

            if (type === "futbolcu") {
                roleId = ROLE_OYUNCU;
                typeName = "Futbolcu";

                if (!user.position) {
                    user.position = "SNT";
                }
            }

            user.registered = true;

            if (!user.country) {
                user.country = "🇹🇷";
            }

            if (!user.name) {
                user.name =
                    target.nickname ||
                    target.user.username;
            }

            if (
                typeof user.value !== "number"
            ) {
                user.value = 0;
            }

            saveDB();

            // Oyuncu rolü
            if (
                roleId &&
                !target.roles.cache.has(roleId)
            ) {
                await target.roles.add(roleId)
                    .catch(error =>
                        console.error(
                            "Rol verilemedi:",
                            error.message
                        )
                    );
            }

            // Kayıtsız rolünü kaldır
            if (
                target.roles.cache.has(ROLE_KAYITSIZ)
            ) {
                await target.roles.remove(
                    ROLE_KAYITSIZ
                ).catch(() => {});
            }

            await updatePlayerNickname(
                target,
                user
            );

            const embed = new EmbedBuilder()
                .setTitle("✅ Kayıt Tamamlandı")
                .setDescription(
                    `${target} başarıyla kayıt edildi.`
                )
                .addFields(
                    {
                        name: "Oyuncu",
                        value: user.name || "-"
                    },
                    {
                        name: "Tür",
                        value: typeName
                    },
                    {
                        name: "Değer",
                        value: formatMoney(user.value)
                    }
                )
                .setColor(0x57F287);

            return interaction.update({
                embeds: [embed],
                components: []
            });
        }

        // ====================================================
        // TICKET
        // ====================================================

        if (
            interaction.isButton() &&
            interaction.customId === "ticket_create"
        ) {
            const guild = interaction.guild;

            const existing =
                guild.channels.cache.find(
                    channel =>
                        channel.type === ChannelType.GuildText &&
                        channel.name ===
                        `ticket-${interaction.user.id}`
                );

            if (existing) {
                return interaction.reply({
                    content:
                        `❌ Zaten açık ticketın var: ${existing}`,
                    ephemeral: true
                });
            }

            const channel =
                await guild.channels.create({
                    name:
                        `ticket-${interaction.user.id}`,
                    type: ChannelType.GuildText,
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
                            id: ROLE_YONETICI,
                            allow: [
                                PermissionsBitField.Flags.ViewChannel,
                                PermissionsBitField.Flags.SendMessages,
                                PermissionsBitField.Flags.ReadMessageHistory
                            ]
                        },
                        {
                            id: ROLE_MODERATOR,
                            allow: [
                                PermissionsBitField.Flags.ViewChannel,
                                PermissionsBitField.Flags.SendMessages,
                                PermissionsBitField.Flags.ReadMessageHistory
                            ]
                        }
                    ]
                });

            db.tickets[channel.id] = {
                ownerId: interaction.user.id,
                lastMessage: Date.now()
            };

            saveDB();

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            "ticket_close"
                        )
                        .setLabel("🔒 Ticket Kapat")
                        .setStyle(ButtonStyle.Danger)
                );

            await channel.send({
                content:
                    `${interaction.user} hoş geldin! Yetkililer en kısa sürede yardımcı olacaktır.`,
                components: [row]
            });

            return interaction.reply({
                content:
                    `✅ Ticket oluşturuldu: ${channel}`,
                ephemeral: true
            });
        }

        // ====================================================
        // TICKET KAPAT
        // ====================================================

        if (
            interaction.isButton() &&
            interaction.customId === "ticket_close"
        ) {
            if (
                !isModerator(interaction.member)
            ) {
                return interaction.reply({
                    content:
                        "❌ Bu ticketı kapatma yetkin yok.",
                    ephemeral: true
                });
            }

            delete db.tickets[
                interaction.channel.id
            ];

            saveDB();

            await interaction.reply(
                "🔒 Ticket 3 saniye içinde kapatılıyor."
            );

            setTimeout(() => {
                interaction.channel.delete()
                    .catch(() => {});
            }, 3000);

            return;
        }

        // ====================================================
        // ÇEKİLİŞ KATILIM
        // ====================================================

        if (
            interaction.isButton() &&
            interaction.customId.startsWith(
                "giveaway_join_"
            )
        ) {
            const giveawayId =
                interaction.customId.replace(
                    "giveaway_join_",
                    ""
                );

            const giveaway =
                db.giveaways.find(
                    x => x.id === giveawayId
                );

            if (!giveaway) {
                return interaction.reply({
                    content:
                        "❌ Bu çekiliş bulunamadı.",
                    ephemeral: true
                });
            }

            if (
                giveaway.participants.includes(
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
                    "🎉 Çekilişe başarıyla katıldın!",
                ephemeral: true
            });
        }

    } catch (error) {
        console.error(
            "interactionCreate hatası:",
            error
        );

        if (!interaction.replied) {
            await interaction.reply({
                content:
                    "❌ İşlem sırasında hata oluştu.",
                ephemeral: true
            }).catch(() => {});
        }
    }
});

// ============================================================
// ÇEKİLİŞ BİTİR
// ============================================================

async function finishGiveaway(giveawayId) {
    const giveaway =
        db.giveaways.find(
            x => x.id === giveawayId
        );

    if (!giveaway) return;

    try {
        const channel =
            await client.channels.fetch(
                giveaway.channelId
            );

        if (!channel) return;

        const participants =
            giveaway.participants || [];

        if (participants.length === 0) {
            return channel.send(
                "🎉 Çekiliş sona erdi fakat katılan olmadı."
            );
        }

        const winner =
            participants[
                Math.floor(
                    Math.random() *
                    participants.length
                )
            ];

        await channel.send(
            `🎉 **Çekiliş sona erdi!**\n\n` +
            `🏆 Kazanan: <@${winner}>\n` +
            `🎁 Ödül: **${giveaway.prize}**`
        );

        giveaway.finished = true;

        saveDB();

    } catch (error) {
        console.error(
            "Çekiliş bitirme hatası:",
            error
        );
    }
}

// ============================================================
// TICKET OTOMATİK KAPATMA
// 60 DAKİKA MESAJ YOKSA
// ============================================================

setInterval(async () => {
    try {
        const now = Date.now();

        for (
            const [channelId, ticket]
            of Object.entries(db.tickets)
        ) {
            if (
                now - ticket.lastMessage <
                60 * 60 * 1000
            ) {
                continue;
            }

            const channel =
                await client.channels.fetch(
                    channelId
                ).catch(() => null);

            if (channel) {
                await channel.send(
                    "⏱️ 60 dakika boyunca mesaj gönderilmediği için ticket kapatılıyor."
                ).catch(() => {});

                setTimeout(() => {
                    channel.delete()
                        .catch(() => {});
                }, 3000);
            }

            delete db.tickets[channelId];

            saveDB();
        }
    } catch (error) {
        console.error(
            "Ticket kontrol hatası:",
            error
        );
    }
}, 60 * 1000);

// ============================================================
// TICKET MESAJ TAKİBİ
// ============================================================

client.on("messageCreate", message => {
    if (!message.guild) return;

    const ticket =
        db.tickets[message.channel.id];

    if (!ticket) return;

    ticket.lastMessage = Date.now();

    saveDB();
});

// ============================================================
// BOT HAZIR
// ============================================================

client.once("ready", async () => {
    console.log(
        "=========================================="
    );

    console.log(
        `✅ ${client.user.tag} aktif!`
    );

    console.log(
        `🆔 Bot ID: ${client.user.id}`
    );

    console.log(
        `🏠 Sunucu sayısı: ${client.guilds.cache.size}`
    );

    console.log(
        "⚽ AXERA LEAGUE SİSTEMLERİ AKTİF"
    );

    console.log(
        "=========================================="
    );

    // Bitmemiş çekilişleri yeniden başlat
    for (const giveaway of db.giveaways) {
        if (giveaway.finished) continue;

        const remaining =
            giveaway.endAt - Date.now();

        if (remaining <= 0) {
            finishGiveaway(giveaway.id);
        } else {
            setTimeout(() => {
                finishGiveaway(
                    giveaway.id
                );
            }, remaining);
        }
    }
});

// ============================================================
// HATA YAKALAMA
// ============================================================

client.on(
    "error",
    error => {
        console.error(
            "Discord Client Error:",
            error
        );
    }
);

client.on(
    "warn",
    warning => {
        console.warn(
            "Discord Warning:",
            warning
        );
    }
);

process.on(
    "unhandledRejection",
    error => {
        console.error(
            "Unhandled Rejection:",
            error
        );
    }
);

// ============================================================
// LOGIN
// ============================================================

if (!process.env.TOKEN) {
    console.error(
        "❌ TOKEN bulunamadı! Railway Variables kısmına TOKEN ekle."
    );

    process.exit(1);
}

client.login(process.env.TOKEN);
