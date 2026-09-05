const {
    Client,
    GatewayIntentBits,
    Partials,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField,
    ChannelType
} = require("discord.js");

const fs = require("fs");
const path = require("path");

/* =========================================================
   AXERA LEAGUE
   Discord.js v14 - Tek Dosya Bot
   ========================================================= */

process.env.TZ = process.env.TZ || "UTC";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel]
});

/* =========================================================
   AYARLAR
   ========================================================= */

const PREFIX = ".";
const OWNER_ID = "1280275560739897409";

const ROLE_IDS = {
    kayitYetkilisi: "1534456315366342716",
    kayitsiz: "1534457560134844517",
    kaleci: "1534492034243498195",
    uye: "1534457460163608636",
    futbolcu: "1534457228986421278",
    teknikDirektor: "1534456648930693120",
    degerYetkilisi: "1534456192913375382",
    spiker: "1535251168169697390"
};

const CHANNEL_IDS = {
    kayit: "1534460177884123276",
    sohbet: "1534469475917758586",
    mac: "1534477626872168541",
    fikstur: "1534475908566483075",
    puan: "1534475991404253284",
    botDurum: "1545921149018570842",
    antrenman: "1534474070798762197",
    penalti: "1534474327812997192"
};

const TEAM_ROLE_IDS = {
    Barcelona: "1534480715779936297",
    "Real Madrid": "1534480984064528655",
    Galatasaray: "1534481073629691995",
    Fenerbahçe: "1534481156840620183",
    Beşiktaş: "1534481259739348992",
    Arsenal: "1534481678653853706",
    Chelsea: "1534481742285770813",
    "Manchester City": "1534481568590991370",
    "Paris Saint-Germain": "1534481952982306867",
    Liverpool: "1534481826696003594",
    "Manchester United": "1534481426463068180"
};

const TEAMS = Object.keys(TEAM_ROLE_IDS);

/* =========================================================
   DATABASE
   ========================================================= */

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "database.json");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db = {
    guilds: {}
};

function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const raw = fs.readFileSync(DB_FILE, "utf8");
            db = JSON.parse(raw);

            if (!db || typeof db !== "object") {
                db = { guilds: {} };
            }

            if (!db.guilds) {
                db.guilds = {};
            }
        }
    } catch (error) {
        console.error("DATABASE OKUMA HATASI:", error);
        db = { guilds: {} };
    }
}

function saveDatabase() {
    try {
        fs.writeFileSync(
            DB_FILE,
            JSON.stringify(db, null, 2),
            "utf8"
        );
    } catch (error) {
        console.error("DATABASE KAYDETME HATASI:", error);
    }
}

loadDatabase();

/* =========================================================
   DATABASE YARDIMCILARI
   ========================================================= */

function createTeamData() {
    const teams = {};

    for (const team of TEAMS) {
        teams[team] = {
            budget: 0,
            squad: []
        };
    }

    return teams;
}

function createPointsData() {
    const points = {};

    for (const team of TEAMS) {
        points[team] = {
            played: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            gf: 0,
            ga: 0,
            points: 0
        };
    }

    return points;
}

function getGuildDB(guildId) {
    if (!db.guilds[guildId]) {
        db.guilds[guildId] = {
            users: {},
            teams: createTeamData(),
            points: createPointsData(),
            fixtures: [],
            matches: [],
            pendingOffers: {},
            tickets: {},
            giveaways: {},
            settings: {}
        };

        saveDatabase();
    }

    const g = db.guilds[guildId];

    if (!g.users) g.users = {};
    if (!g.teams) g.teams = createTeamData();
    if (!g.points) g.points = createPointsData();
    if (!g.fixtures) g.fixtures = [];
    if (!g.matches) g.matches = [];
    if (!g.pendingOffers) g.pendingOffers = {};
    if (!g.tickets) g.tickets = {};
    if (!g.giveaways) g.giveaways = {};
    if (!g.settings) g.settings = {};

    for (const team of TEAMS) {
        if (!g.teams[team]) {
            g.teams[team] = {
                budget: 0,
                squad: []
            };
        }

        if (!g.points[team]) {
            g.points[team] = {
                played: 0,
                wins: 0,
                draws: 0,
                losses: 0,
                gf: 0,
                ga: 0,
                points: 0
            };
        }
    }

    return g;
}

function getUserDB(guildId, userId) {
    const g = getGuildDB(guildId);

    if (!g.users[userId]) {
        g.users[userId] = {
            registered: false,
            nickname: "",
            position: "",
            value: 0,
            budget: 0,
            team: null,
            salary: 0,
            seasons: 0,
            trainingStage: 0
        };
    }

    return g.users[userId];
}

/* =========================================================
   GENEL FONKSİYONLAR
   ========================================================= */

function normalize(text) {
    return String(text || "")
        .toLocaleLowerCase("tr-TR")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ı/g, "i")
        .replace(/ğ/g, "g")
        .replace(/ü/g, "u")
        .replace(/ş/g, "s")
        .replace(/ö/g, "o")
        .replace(/ç/g, "c")
        .trim();
}

function isOwner(member) {
    return member?.id === OWNER_ID;
}

function isAdmin(member) {
    return (
        isOwner(member) ||
        member?.permissions?.has(
            PermissionsBitField.Flags.Administrator
        )
    );
}

function hasRole(member, roleId) {
    return Boolean(member?.roles?.cache?.has(roleId));
}

function parseAmount(value) {
    if (!value) return null;

    let text = String(value)
        .toLowerCase()
        .replace(/€/g, "")
        .replace(/m/g, "")
        .replace(",", ".")
        .trim();

    const number = Number(text);

    if (!Number.isFinite(number) || number < 0) {
        return null;
    }

    return number;
}

function money(value) {
    const n = Number(value || 0);

    if (Number.isInteger(n)) {
        return `${n}M€`;
    }

    return `${n.toFixed(2)}M€`;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanMention(text) {
    return String(text || "")
        .replace(/[<@!>]/g, "")
        .trim();
}

async function getMember(guild, text) {
    if (!text) return null;

    const mention = text.match(/^<@!?(\d+)>$/);

    if (mention) {
        try {
            return await guild.members.fetch(mention[1]);
        } catch {
            return null;
        }
    }

    if (/^\d{15,25}$/.test(text)) {
        try {
            return await guild.members.fetch(text);
        } catch {
            return null;
        }
    }

    return null;
}

/* =========================================================
   ROLE / CHANNEL BULMA
   ========================================================= */

function findRole(guild, roleId, names = []) {
    if (roleId) {
        const role = guild.roles.cache.get(roleId);
        if (role) return role;
    }

    const wanted = names.map(normalize);

    return guild.roles.cache.find(role =>
        wanted.includes(normalize(role.name))
    ) || null;
}

function findChannel(guild, channelId, names = []) {
    if (channelId) {
        const channel = guild.channels.cache.get(channelId);

        if (channel) {
            return channel;
        }
    }

    const wanted = names.map(normalize);

    return guild.channels.cache.find(channel =>
        wanted.includes(normalize(channel.name))
    ) || null;
}

function getRoleByKey(guild, key) {
    const names = {
        kayitYetkilisi: ["kayıt yetkilisi", "kayit yetkilisi"],
        kayitsiz: ["kayıtsız", "kayitsiz"],
        kaleci: ["kaleci"],
        uye: ["üye", "uye"],
        futbolcu: ["futbolcu", "oyuncu"],
        teknikDirektor: [
            "teknik direktör",
            "teknik direktor"
        ],
        degerYetkilisi: [
            "değer yetkilisi",
            "deger yetkilisi"
        ],
        spiker: ["spiker"]
    };

    return findRole(
        guild,
        ROLE_IDS[key],
        names[key] || []
    );
}

function getTeamRole(guild, team) {
    const id = TEAM_ROLE_IDS[team];

    return findRole(
        guild,
        id,
        [team]
    );
}

function getChannelByKey(guild, key) {
    const names = {
        kayit: ["kayıt", "kayit"],
        sohbet: ["sohbet"],
        mac: ["maç", "mac"],
        fikstur: ["fikstür", "fikstur"],
        puan: ["puan"],
        botDurum: ["bot-durum", "bot durum"],
        antrenman: ["antrenman"],
        penalti: ["penaltı", "penalti"]
    };

    return findChannel(
        guild,
        CHANNEL_IDS[key],
        names[key] || []
    );
}

function requireChannel(message, key, label) {
    const channel = getChannelByKey(message.guild, key);

    if (!channel) {
        message.reply(
            `❌ ${label} kanalı bulunamadı. Kanal ID'sini veya kanal adını kontrol et.`
        );
        return false;
    }

    if (message.channel.id !== channel.id) {
        message.reply(
            `❌ Bu komut sadece ${channel} kanalında kullanılabilir.`
        );
        return false;
    }

    return true;
}

/* =========================================================
   NICKNAME / DEĞER
   ========================================================= */

function parseNicknameValue(nickname) {
    if (!nickname) return 0;

    const match = String(nickname).match(
        /(\d+(?:[.,]\d+)?)\s*M€\s*$/i
    );

    if (!match) return 0;

    return Number(match[1].replace(",", "."));
}

async function updateNicknameValue(member, value) {
    if (!member?.manageable) {
        return false;
    }

    const current = member.nickname || member.user.username;
    const formatted = money(value);

    let next;

    if (/(\d+(?:[.,]\d+)?)\s*M€\s*$/i.test(current)) {
        next = current.replace(
            /(\d+(?:[.,]\d+)?)\s*M€\s*$/i,
            formatted
        );
    } else {
        next = `${current} | ${formatted}`;
    }

    if (next.length > 32) {
        return false;
    }

    try {
        await member.setNickname(next);
        return true;
    } catch {
        return false;
    }
}

async function changePlayerValue(guild, member, delta) {
    const user = getUserDB(guild.id, member.id);

    let current = Number(user.value || 0);

    if (!current) {
        current = parseNicknameValue(
            member.nickname || member.user.username
        );
    }

    const next = Math.max(
        0,
        current + Number(delta)
    );

    user.value = next;

    await updateNicknameValue(
        member,
        next
    );

    saveDatabase();

    return {
        oldValue: current,
        newValue: next
    };
}

/* =========================================================
   TAKIM BULMA
   ========================================================= */

function findTeam(text) {
    if (!text) return null;

    const clean = normalize(
        text.replace(/[<@&>]/g, "")
    );

    for (const team of TEAMS) {
        if (normalize(team) === clean) {
            return team;
        }
    }

    return null;
}

function findTeamFromRoleMention(guild, text) {
    const match = String(text || "")
        .match(/^<@&(\d+)>$/);

    if (!match) return null;

    const role = guild.roles.cache.get(match[1]);

    if (!role) return null;

    return TEAMS.find(
        team =>
            TEAM_ROLE_IDS[team] === role.id ||
            normalize(team) === normalize(role.name)
    ) || null;
}

/* =========================================================
   KAYIT SİSTEMİ
   ========================================================= */

const registrationSessions = new Map();

async function startRegistration(message, args) {
    if (
        !isOwner(message.member) &&
        !hasRole(
            message.member,
            ROLE_IDS.kayitYetkilisi
        )
    ) {
        return message.reply(
            "❌ Bu komutu sadece Kayıt Yetkilisi kullanabilir."
        );
    }

    if (!requireChannel(
        message,
        "kayit",
        "kayıt"
    )) return;

    const target = await getMember(
        message.guild,
        args[0]
    );

    if (!target) {
        return message.reply(
            "❌ Bir oyuncu etiketlemelisin.\nÖrnek: `.k @Oyuncu TakmaAdı`"
        );
    }

    const nickname = args
        .slice(1)
        .join(" ")
        .trim();

    const sessionId =
        `${message.guild.id}:${target.id}`;

    registrationSessions.set(
        sessionId,
        {
            targetId: target.id,
            nickname
        }
    );

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`register:kaleci:${target.id}`)
                .setLabel("Kaleci")
                .setEmoji("🧤")
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId(`register:uye:${target.id}`)
                .setLabel("Üye")
                .setEmoji("👤")
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId(`register:futbolcu:${target.id}`)
                .setLabel("Futbolcu")
                .setEmoji("⚽")
                .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
                .setCustomId(`register:td:${target.id}`)
                .setLabel("Teknik Direktör")
                .setEmoji("📋")
                .setStyle(ButtonStyle.Danger)
        );

    await message.reply({
        content:
            `👤 ${target} için kayıt türünü seçin.\n` +
            `📝 Takma ad: ${nickname || "Belirtilmedi"}`,
        components: [row]
    });
}

/* =========================================================
   KAYITSIZ VER
   ========================================================= */

async function giveUnregistered(message, args) {
    if (
        !isOwner(message.member) &&
        !hasRole(
            message.member,
            ROLE_IDS.kayitYetkilisi
        )
    ) {
        return message.reply(
            "❌ Bu komutu sadece Kayıt Yetkilisi kullanabilir."
        );
    }

    const target = await getMember(
        message.guild,
        args[0]
    );

    if (!target) {
        return message.reply(
            "❌ Kullanıcı belirtmelisin."
        );
    }

    const removable = [
        getRoleByKey(message.guild, "kaleci"),
        getRoleByKey(message.guild, "uye"),
        getRoleByKey(message.guild, "futbolcu"),
        getRoleByKey(message.guild, "teknikDirektor")
    ].filter(Boolean);

    for (const role of removable) {
        if (target.roles.cache.has(role.id)) {
            try {
                await target.roles.remove(role);
            } catch {}
        }
    }

    const user = getUserDB(
        message.guild.id,
        target.id
    );

    if (user.team) {
        const team = user.team;

        if (
            message.guild &&
            getGuildDB(message.guild.id).teams[team]
        ) {
            getGuildDB(message.guild.id)
                .teams[team]
                .squad = getGuildDB(message.guild.id)
                .teams[team]
                .squad.filter(
                    x => x.userId !== target.id
                );
        }
    }

    user.registered = false;
    user.team = null;
    user.salary = 0;
    user.seasons = 0;

    const kayitsizRole =
        getRoleByKey(
            message.guild,
            "kayitsiz"
        );

    if (kayitsizRole) {
        try {
            await target.roles.add(kayitsizRole);
        } catch {}
    }

    saveDatabase();

    await message.reply(
        `✅ ${target} tekrar Kayıtsız durumuna getirildi.`
    );
}

/* =========================================================
   OYUNCU ARAMA
   ========================================================= */

function searchPlayers(guild, query) {
    const g = getGuildDB(guild.id);
    const q = normalize(query);

    const results = [];

    for (const [userId, data] of Object.entries(g.users)) {
        if (!data.registered) continue;

        const member = guild.members.cache.get(userId);

        if (!member) continue;

        if (
            hasRole(
                member,
                ROLE_IDS.kayitsiz
            )
        ) continue;

        const username = normalize(
            member.user.username
        );

        const nickname = normalize(
            data.nickname || member.displayName
        );

        let score = 0;

        if (nickname === q) score += 100;
        if (username === q) score += 90;
        if (nickname.startsWith(q)) score += 70;
        if (username.startsWith(q)) score += 60;
        if (nickname.includes(q)) score += 40;
        if (username.includes(q)) score += 30;

        if (score > 0) {
            results.push({
                member,
                data,
                score
            });
        }
    }

    results.sort(
        (a, b) => b.score - a.score
    );

    return results.slice(0, 10);
}

async function searchPlayerCommand(message, args) {
    const query = args.join(" ").trim();

    if (!query) {
        return message.reply(
            "❌ Aramak istediğin oyuncu adını yaz.\nÖrnek: `.ara oyuncu Sneijder`"
        );
    }

    const results = searchPlayers(
        message.guild,
        query
    );

    if (!results.length) {
        return message.reply(
            "❌ Oyuncu bulunamadı."
        );
    }

    const embed = new EmbedBuilder()
        .setTitle("🔎 Oyuncu Arama")
        .setDescription(
            results.map((x, i) => {
                const team =
                    x.data.team || "Takımsız";

                const position =
                    x.data.position || "Belirtilmedi";

                return (
                    `**${i + 1}. ${x.member.displayName}**\n` +
                    `> Kullanıcı: ${x.member}\n` +
                    `> Pozisyon: ${position}\n` +
                    `> Takım: ${team}\n` +
                    `> Değer: ${money(x.data.value)}\n`
                );
            }).join("\n")
        )
        .setTimestamp();

    await message.reply({
        embeds: [embed]
    });
}

/* =========================================================
   ANTRENMAN
   ========================================================= */

async function trainingCommand(message) {
    if (!requireChannel(
        message,
        "antrenman",
        "antrenman"
    )) return;

    const member = message.member;

    const playerRole =
        getRoleByKey(
            message.guild,
            "futbolcu"
        );

    if (
        playerRole &&
        !member.roles.cache.has(playerRole.id)
    ) {
        return message.reply(
            "❌ Antrenmana sadece Futbolcular katılabilir."
        );
    }

    const user = getUserDB(
        message.guild.id,
        member.id
    );

    if (user.trainingStage >= 5) {
        return message.reply(
            "🏋️ Antrenmanı zaten 5/5 tamamladın."
        );
    }

    user.trainingStage++;

    if (user.trainingStage >= 5) {
        user.trainingStage = 5;

        const result =
            await changePlayerValue(
                message.guild,
                member,
                5
            );

        saveDatabase();

        return message.reply(
            `🏋️ **ANTRENMAN TAMAMLANDI!**\n\n` +
            `📊 Seviye: **5/5**\n` +
            `💰 Oyuncu değerin: **${money(result.newValue)}**\n` +
            `📈 Kazanç: **+5M€**`
        );
    }

    saveDatabase();

    await message.reply(
        `🏋️ Antrenman devam ediyor!\n\n` +
        `📊 İlerleme: **${user.trainingStage}/5**\n` +
        `💡 5/5 tamamlandığında oyuncu değerine **+5M€** eklenir.`
    );
}

/* =========================================================
   PENALTI
   ========================================================= */

async function penaltyCommand(message) {
    if (!requireChannel(
        message,
        "penalti",
        "penaltı"
    )) return;

    const member = message.member;

    const playerRole =
        getRoleByKey(
            message.guild,
            "futbolcu"
        );

    if (
        playerRole &&
        !member.roles.cache.has(playerRole.id)
    ) {
        return message.reply(
            "❌ Penaltıyı sadece Futbolcular kullanabilir."
        );
    }

    const random = Math.random() * 100;

    let result;
    let reward = 0;

    if (random < 30) {
        result = "⚽ GOL!";
        reward = 5;
    } else if (random < 60) {
        result = "🧤 KALECİ!";
    } else if (random < 85) {
        result = "🥅 DİREK!";
    } else {
        result = "🚩 KORNER!";
    }

    let text =
        `🥅 **PENALTI SONUCU**\n\n` +
        `${result}`;

    if (reward > 0) {
        const change =
            await changePlayerValue(
                message.guild,
                member,
                reward
            );

        text +=
            `\n\n📈 Oyuncu değeri: **+${reward}M€**` +
            `\n💰 Yeni değer: **${money(change.newValue)}**`;
    } else {
        text += "\n\n📊 Oyuncu değerinde değişiklik olmadı.";
    }

    saveDatabase();

    await message.reply(text);
}

/* =========================================================
   DEĞER KOMUTLARI
   ========================================================= */

async function valueCommand(message, args, mode) {
    if (
        !isOwner(message.member) &&
        !hasRole(
            message.member,
            ROLE_IDS.degerYetkilisi
        )
    ) {
        return message.reply(
            "❌ Bu komutu sadece Değer Yetkilisi kullanabilir."
        );
    }

    const target =
        await getMember(
            message.guild,
            args[0]
        );

    const amount =
        parseAmount(args[1]);

    if (!target || amount === null) {
        return message.reply(
            `❌ Kullanım: \`.${mode === "add" ? "dver" : "dsil"} @Oyuncu miktar\``
        );
    }

    const result =
        await changePlayerValue(
            message.guild,
            target,
            mode === "add"
                ? amount
                : -amount
        );

    await message.reply(
        mode === "add"
            ? `✅ ${target} oyuncusuna **+${money(amount)}** değer eklendi.\n💰 Yeni değer: **${money(result.newValue)}**`
            : `✅ ${target} oyuncusundan **${money(amount)}** değer silindi.\n💰 Yeni değer: **${money(result.newValue)}**`
    );
}

/* =========================================================
   BÜTÇE
   ========================================================= */

async function budgetCommand(message) {
    const target =
        argsMemberFromMessage(
            message,
            message.content
                .split(/\s+/)
                .slice(1)
                .join(" ")
        );

    let member = message.member;

    if (target) {
        member = target;
    }

    const user =
        getUserDB(
            message.guild.id,
            member.id
        );

    const embed =
        new EmbedBuilder()
            .setTitle("💳 Oyuncu Bütçesi")
            .setDescription(
                `${member}\n\n` +
                `💰 Bütçe: **${money(user.budget)}**\n` +
                `⚽ Takım: **${user.team || "Takımsız"}**`
            )
            .setTimestamp();

    await message.reply({
        embeds: [embed]
    });
}

function argsMemberFromMessage(message, text) {
    const match = String(text || "")
        .match(/<@!?(\d+)>/);

    if (!match) return null;

    return message.guild.members.cache.get(
        match[1]
    ) || null;
}

async function budgetManage(message, args, mode) {
    if (
        !isOwner(message.member) &&
        !hasRole(
            message.member,
            ROLE_IDS.degerYetkilisi
        )
    ) {
        return message.reply(
            "❌ Bu komutu sadece Değer Yetkilisi kullanabilir."
        );
    }

    const target =
        await getMember(
            message.guild,
            args[0]
        );

    const amount =
        parseAmount(args[1]);

    if (!target || amount === null) {
        return message.reply(
            "❌ Kullanım: `.bütçeekle @Oyuncu miktar`"
        );
    }

    const user =
        getUserDB(
            message.guild.id,
            target.id
        );

    if (mode === "add") {
        user.budget += amount;
    } else {
        user.budget =
            Math.max(
                0,
                user.budget - amount
            );
    }

    saveDatabase();

    await message.reply(
        `✅ ${target} bütçesi güncellendi.\n💰 Yeni bütçe: **${money(user.budget)}**`
    );
}

/* =========================================================
   PARA GÖNDERME
   ========================================================= */

async function sendBudget(message, args) {
    const target =
        await getMember(
            message.guild,
            args[0]
        );

    const amount =
        parseAmount(args[1]);

    if (!target || amount === null || amount <= 0) {
        return message.reply(
            "❌ Kullanım: `.gönder @Oyuncu miktar`"
        );
    }

    if (target.id === message.author.id) {
        return message.reply(
            "❌ Kendine para gönderemezsin."
        );
    }

    const sender =
        getUserDB(
            message.guild.id,
            message.author.id
        );

    const receiver =
        getUserDB(
            message.guild.id,
            target.id
        );

    if (sender.budget < amount) {
        return message.reply(
            `❌ Yetersiz bütçe.\n💰 Mevcut: **${money(sender.budget)}**`
        );
    }

    sender.budget -= amount;
    receiver.budget += amount;

    saveDatabase();

    await message.reply(
        `✅ **${money(amount)}** gönderildi.\n\n` +
        `👤 Gönderen: ${message.author}\n` +
        `👤 Alan: ${target}\n` +
        `💰 Yeni bütçen: **${money(sender.budget)}**`
    );
}

/* =========================================================
   TAKIM BÜTÇESİ
   ========================================================= */

async function teamBudgetCommand(message, args) {
    let team = null;

    if (args.length) {
        team =
            findTeam(args.join(" ")) ||
            findTeamFromRoleMention(
                message.guild,
                args[0]
            );
    }

    if (!team) {
        const user =
            getUserDB(
                message.guild.id,
                message.author.id
            );

        team = user.team;
    }

    if (!team) {
        return message.reply(
            "❌ Takım belirtmelisin.\nÖrnek: `.takımbütçe Galatasaray`"
        );
    }

    const g =
        getGuildDB(
            message.guild.id
        );

    await message.reply(
        `💼 **${team} Takım Bütçesi**\n\n💰 Bütçe: **${money(g.teams[team].budget)}**`
    );
}

async function teamBudgetSend(message, args) {
    if (
        !isOwner(message.member) &&
        !hasRole(
            message.member,
            ROLE_IDS.degerYetkilisi
        )
    ) {
        return message.reply(
            "❌ Bu komutu sadece Değer Yetkilisi kullanabilir."
        );
    }

    const team =
        findTeam(args[0]) ||
        findTeamFromRoleMention(
            message.guild,
            args[0]
        );

    const amount =
        parseAmount(args[1]);

    if (!team || amount === null) {
        return message.reply(
            "❌ Kullanım: `.takımbütçegönder Galatasaray 10`"
        );
    }

    const g =
        getGuildDB(
            message.guild.id
        );

    g.teams[team].budget += amount;

    saveDatabase();

    await message.reply(
        `✅ **${team}** takım bütçesine **${money(amount)}** eklendi.\n💰 Yeni bütçe: **${money(g.teams[team].budget)}**`
    );
}

/* =========================================================
   KAP TRANSFER
   ========================================================= */

function getTeamOfMember(guild, member) {
    for (const team of TEAMS) {
        const role =
            getTeamRole(guild, team);

        if (
            role &&
            member.roles.cache.has(role.id)
        ) {
            return team;
        }
    }

    const user =
        getUserDB(
            guild.id,
            member.id
        );

    return user.team || null;
}

function canManageTeam(member, team, guild) {
    if (isOwner(member)) return true;

    if (
        hasRole(
            member,
            ROLE_IDS.teknikDirektor
        )
    ) return true;

    const memberTeam =
        getTeamOfMember(
            guild,
            member
        );

    return memberTeam === team;
}

async function kapCommand(message, args) {
    if (args.length < 4) {
        return message.reply(
            "❌ Kullanım:\n`.kap @Oyuncu @Takım Maaş Sezon`"
        );
    }

    const player =
        await getMember(
            message.guild,
            args[0]
        );

    if (!player) {
        return message.reply(
            "❌ Oyuncu bulunamadı."
        );
    }

    let team =
        findTeamFromRoleMention(
            message.guild,
            args[1]
        );

    if (!team) {
        team = findTeam(args[1]);

        if (!team) {
            team = findTeam(
                args.slice(1, -2).join(" ")
            );
        }
    }

    const salary =
        parseAmount(
            args[args.length - 2]
        );

    const seasons =
        Number(
            args[args.length - 1]
        );

    if (!team || salary === null || !Number.isInteger(seasons)) {
        return message.reply(
            "❌ Takım, maaş veya sezon bilgisi hatalı."
        );
    }

    if (seasons < 1 || seasons > 10) {
        return message.reply(
            "❌ Sözleşme 1-10 sezon arasında olabilir."
        );
    }

    if (
        !canManageTeam(
            message.member,
            team,
            message.guild
        )
    ) {
        return message.reply(
            "❌ Bu takım için KAP teklifi oluşturamazsın."
        );
    }

    const playerRole =
        getRoleByKey(
            message.guild,
            "futbolcu"
        );

    if (
        playerRole &&
        !player.roles.cache.has(playerRole.id)
    ) {
        return message.reply(
            "❌ Teklif sadece Futbolcu rolündeki oyunculara yapılabilir."
        );
    }

    const playerData =
        getUserDB(
            message.guild.id,
            player.id
        );

    if (playerData.team) {
        return message.reply(
            `❌ Oyuncu zaten **${playerData.team}** takımında.`
        );
    }

    const total =
        salary * seasons;

    const offerId =
        `${message.guild.id}-${player.id}-${Date.now()}`;

    const g =
        getGuildDB(
            message.guild.id
        );

    g.pendingOffers[offerId] = {
        playerId: player.id,
        team,
        salary,
        seasons,
        total,
        from: message.author.id,
        createdAt: Date.now()
    };

    const embed =
        new EmbedBuilder()
            .setTitle("📋 KAP SÖZLEŞME TEKLİFİ")
            .setDescription(
                `👤 Oyuncu: ${player}\n` +
                `🏟️ Takım: **${team}**\n\n` +
                `💰 Sezon Başı Maaş: **${money(salary)}**\n` +
                `📅 Sözleşme: **${seasons} sezon**\n` +
                `💵 Toplam Maaş: **${money(total)}**`
            )
            .setTimestamp();

    const row =
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`kap:accept:${offerId}`)
                    .setLabel("Kabul Et")
                    .setEmoji("✅")
                    .setStyle(ButtonStyle.Success),

                new ButtonBuilder()
                    .setCustomId(`kap:reject:${offerId}`)
                    .setLabel("Reddet")
                    .setEmoji("❌")
                    .setStyle(ButtonStyle.Danger)
            );

    await message.channel.send({
        content: `${player}`,
        embeds: [embed],
        components: [row]
    });

    saveDatabase();
}

/* =========================================================
   KADRO
   ========================================================= */

async function squadAdd(message, args) {
    if (
        !isOwner(message.member) &&
        !hasRole(
            message.member,
            ROLE_IDS.spiker
        ) &&
        !hasRole(
            message.member,
            ROLE_IDS.teknikDirektor
        )
    ) {
        const team =
            findTeam(args[0]) ||
            findTeamFromRoleMention(
                message.guild,
                args[0]
            );

        const ownTeam =
            getTeamOfMember(
                message.guild,
                message.member
            );

        if (!team || team !== ownTeam) {
            return message.reply(
                "❌ Kadro yönetme yetkin yok."
            );
        }
    }

    if (args.length < 3) {
        return message.reply(
            "❌ Kullanım: `.kadroekle @Takım @Oyuncu Pozisyon`"
        );
    }

    let team =
        findTeamFromRoleMention(
            message.guild,
            args[0]
        );

    if (!team) {
        team = findTeam(
            args.slice(0, -2).join(" ")
        );
    }

    let playerIndex = 1;

    if (!team) {
        return message.reply(
            "❌ Takım bulunamadı."
        );
    }

    const teamWords =
        team.split(" ").length;

    playerIndex = teamWords;

    const player =
        await getMember(
            message.guild,
            args[playerIndex]
        );

    const position =
        args.slice(playerIndex + 1).join(" ");

    if (!player || !position) {
        return message.reply(
            "❌ Oyuncu veya pozisyon eksik."
        );
    }

    const g =
        getGuildDB(
            message.guild.id
        );

    const squad =
        g.teams[team].squad;

    if (
        squad.some(
            x => x.userId === player.id
        )
    ) {
        return message.reply(
            "❌ Oyuncu zaten kadroda."
        );
    }

    squad.push({
        userId: player.id,
        position,
        addedAt: Date.now()
    });

    saveDatabase();

    await message.reply(
        `✅ ${player} **${team}** kadrosuna eklendi.\n📍 Pozisyon: **${position}**`
    );
}

async function squadRemove(message, args) {
    const team =
        findTeam(args[0]) ||
        findTeamFromRoleMention(
            message.guild,
            args[0]
        );

    const player =
        await getMember(
            message.guild,
            args[1]
        );

    if (!team || !player) {
        return message.reply(
            "❌ Kullanım: `.kadrosil Galatasaray @Oyuncu`"
        );
    }

    if (
        !isOwner(message.member) &&
        !hasRole(
            message.member,
            ROLE_IDS.spiker
        ) &&
        !hasRole(
            message.member,
            ROLE_IDS.teknikDirektor
        )
    ) {
        const own =
            getTeamOfMember(
                message.guild,
                message.member
            );

        if (own !== team) {
            return message.reply(
                "❌ Bu takımın kadrosunu yönetemezsin."
            );
        }
    }

    const g =
        getGuildDB(
            message.guild.id
        );

    const before =
        g.teams[team].squad.length;

    g.teams[team].squad =
        g.teams[team].squad.filter(
            x => x.userId !== player.id
        );

    if (
        g.teams[team].squad.length === before
    ) {
        return message.reply(
            "❌ Oyuncu kadroda bulunamadı."
        );
    }

    saveDatabase();

    await message.reply(
        `✅ ${player} **${team}** kadrosundan çıkarıldı.`
    );
}

function getSquadPlayers(guild, team) {
    const g =
        getGuildDB(
            guild.id
        );

    const squad =
        g.teams[team].squad;

    const real = [];

    for (const entry of squad) {
        const member =
            guild.members.cache.get(
                entry.userId
            );

        if (!member) continue;

        const user =
            getUserDB(
                guild.id,
                entry.userId
            );

        real.push({
            userId: entry.userId,
            name: member.displayName,
            position: entry.position,
            value: Number(user.value || 0),
            npc: false
        });
    }

    while (real.length < 11) {
        real.push({
            userId: `npc-${real.length + 1}`,
            name: `NPC-${real.length + 1}`,
            position: "Yedek",
            value: 0.5,
            npc: true
        });
    }

    return real.slice(0, 11);
}

async function squadCommand(message, args) {
    const team =
        findTeam(
            args.join(" ")
        ) ||
        findTeamFromRoleMention(
            message.guild,
            args[0]
        );

    if (!team) {
        return message.reply(
            "❌ Takım belirtmelisin."
        );
    }

    const players =
        getSquadPlayers(
            message.guild,
            team
        );

    const g =
        getGuildDB(
            message.guild.id
        );

    const totalValue =
        g.teams[team].squad.reduce(
            (sum, entry) => {
                const u =
                    getUserDB(
                        message.guild.id,
                        entry.userId
                    );

                return sum + Number(u.value || 0);
            },
            0
        );

    const lines =
        players.map(
            (p, i) =>
                `${i + 1}. **${p.name}** — ${p.position}${p.npc ? " 🤖" : ""}`
        );

    const embed =
        new EmbedBuilder()
            .setTitle(`👥 ${team} Kadrosu`)
            .setDescription(
                lines.join("\n")
            )
            .addFields({
                name: "💰 Gerçek Oyuncu Kadro Değeri",
                value: money(totalValue),
                inline: true
            })
            .addFields({
                name: "👥 Oyuncu Sayısı",
                value: String(
                    g.teams[team].squad.length
                ),
                inline: true
            })
            .setTimestamp();

    await message.reply({
        embeds: [embed]
    });
}

/* =========================================================
   MAÇ SİSTEMİ
   ========================================================= */

const activeMatches = new Map();

function randomPlayer(players) {
    if (!players.length) return null;

    return players[
        Math.floor(
            Math.random() * players.length
        )
    ];
}

function createMatchEvent(team, players) {
    const roll = Math.random() * 100;
    const player = randomPlayer(players);

    if (!player) return null;

    if (roll < 5) {
        return {
            type: "goal",
            team,
            player
        };
    }

    if (roll < 8) {
        return {
            type: "save",
            team,
            player
        };
    }

    if (roll < 11) {
        return {
            type: "yellow",
            team,
            player
        };
    }

    return null;
}

async function startMatch(
    guild,
    team1,
    team2,
    options = {}
) {
    if (team1 === team2) {
        return {
            ok: false,
            message: "Takımlar aynı olamaz."
        };
    }

    if (!TEAMS.includes(team1) || !TEAMS.includes(team2)) {
        return {
            ok: false,
            message: "Takım bulunamadı."
        };
    }

    const key =
        `${guild.id}:${team1}:${team2}`;

    if (activeMatches.has(key)) {
        return {
            ok: false,
            message: "Bu maç zaten oynanıyor."
        };
    }

    const channel =
        getChannelByKey(
            guild,
            "mac"
        );

    if (!channel || !channel.isTextBased()) {
        return {
            ok: false,
            message: "Maç kanalı bulunamadı."
        };
    }

    activeMatches.set(key, true);

    const players1 =
        getSquadPlayers(
            guild,
            team1
        );

    const players2 =
        getSquadPlayers(
            guild,
            team2
        );

    let score1 = 0;
    let score2 = 0;

    const matchData = {
        team1,
        team2,
        score1: 0,
        score2: 0,
        startedAt: Date.now(),
        fixtureId: options.fixtureId || null
    };

    const g =
        getGuildDB(guild.id);

    g.matches.push(matchData);

    const matchEmbed =
        new EmbedBuilder()
            .setTitle("⚽ MAÇ BAŞLADI")
            .setDescription(
                `🏟️ **${team1}** vs **${team2}**\n\n` +
                `⏱️ 0' — Maç başladı!`
            )
            .setTimestamp();

    const matchMessage =
        await channel.send({
            embeds: [matchEmbed]
        });

    for (let minute = 1; minute <= 90; minute++) {
        await sleep(3000);

        const team =
            Math.random() < 0.5
                ? team1
                : team2;

        const players =
            team === team1
                ? players1
                : players2;

        const event =
            createMatchEvent(
                team,
                players
            );

        if (!event) continue;

        let text = "";

        if (event.type === "goal") {
            if (team === team1) {
                score1++;
            } else {
                score2++;
            }

            text =
                `⚽ **${minute}' GOL!**\n` +
                `🏟️ ${team}\n` +
                `👤 ${event.player.name}\n\n` +
                `📊 ${team1} **${score1}** - **${score2}** ${team2}`;
        }

        if (event.type === "save") {
            text =
                `🧤 **${minute}' KALECİ KURTARDI!**\n` +
                `🏟️ ${team}\n` +
                `👤 ${event.player.name}`;
        }

        if (event.type === "yellow") {
            text =
                `🟨 **${minute}' SARI KART!**\n` +
                `🏟️ ${team}\n` +
                `👤 ${event.player.name}`;
        }

        await channel.send(text);
    }

    const result =
        score1 > score2
            ? `${team1} kazandı!`
            : score2 > score1
                ? `${team2} kazandı!`
                : "Maç berabere bitti!";

    await channel.send(
        `🏁 **MAÇ BİTTİ!**\n\n` +
        `🏟️ ${team1} **${score1}** - **${score2}** ${team2}\n\n` +
        `🏆 ${result}`
    );

    await finishMatch(
        guild,
        team1,
        team2,
        score1,
        score2,
        options.fixtureId
    );

    matchData.score1 = score1;
    matchData.score2 = score2;
    matchData.finishedAt = Date.now();

    activeMatches.delete(key);

    saveDatabase();

    return {
        ok: true,
        score1,
        score2
    };
}

/* =========================================================
   PUAN
   ========================================================= */

function updatePoints(
    guild,
    team1,
    team2,
    score1,
    score2
) {
    const g =
        getGuildDB(
            guild.id
        );

    const a =
        g.points[team1];

    const b =
        g.points[team2];

    a.played++;
    b.played++;

    a.gf += score1;
    a.ga += score2;

    b.gf += score2;
    b.ga += score1;

    if (score1 > score2) {
        a.wins++;
        b.losses++;

        a.points += 3;
    } else if (score2 > score1) {
        b.wins++;
        a.losses++;

        b.points += 3;
    } else {
        a.draws++;
        b.draws++;

        a.points++;
        b.points++;
    }
}

function createStandingsEmbed(guild) {
    const g =
        getGuildDB(
            guild.id
        );

    const table =
        TEAMS.map(team => {
            const p =
                g.points[team];

            return {
                team,
                ...p,
                gd: p.gf - p.ga
            };
        }).sort(
            (a, b) =>
                b.points - a.points ||
                b.gd - a.gd ||
                b.gf - a.gf
        );

    const lines =
        table.map(
            (x, i) =>
                `**${i + 1}. ${x.team}** — ` +
                `${x.played} maç | ` +
                `${x.wins}G ${x.draws}B ${x.losses}M | ` +
                `${x.gf}:${x.ga} | ` +
                `AV ${x.gd} | ` +
                `🏆 ${x.points}`
        );

    return new EmbedBuilder()
        .setTitle("📊 AXERA LEAGUE PUAN DURUMU")
        .setDescription(
            lines.join("\n")
        )
        .setTimestamp();
}

async function sendStandings(guild) {
    const channel =
        getChannelByKey(
            guild,
            "puan"
        );

    if (!channel || !channel.isTextBased()) {
        return;
    }

    await channel.send({
        embeds: [
            createStandingsEmbed(guild)
        ]
    });
}

async function finishMatch(
    guild,
    team1,
    team2,
    score1,
    score2,
    fixtureId = null
) {
    updatePoints(
        guild,
        team1,
        team2,
        score1,
        score2
    );

    const g =
        getGuildDB(
            guild.id
        );

    if (fixtureId) {
        const fixture =
            g.fixtures.find(
                x => x.id === fixtureId
            );

        if (fixture) {
            fixture.status = "finished";
            fixture.score1 = score1;
            fixture.score2 = score2;
            fixture.finishedAt = Date.now();

            if (fixture.messageId) {
                try {
                    const channel =
                        getChannelByKey(
                            guild,
                            "fikstur"
                        );

                    if (channel) {
                        const msg =
                            await channel.messages.fetch(
                                fixture.messageId
                            );

                        const result =
                            score1 > score2
                                ? team1
                                : score2 > score1
                                    ? team2
                                    : "Berabere";

                        const embed =
                            new EmbedBuilder()
                                .setTitle("📅 FİKSTÜR SONUCU")
                                .setDescription(
                                    `🏟️ **${team1}** ${score1} - ${score2} **${team2}**\n\n` +
                                    `🏆 Sonuç: **${result}**`
                                )
                                .setTimestamp();

                        await msg.edit({
                            embeds: [embed]
                        });
                    }
                } catch {}
            }
        }
    }

    saveDatabase();

    await sendStandings(guild);
}

/* =========================================================
   MAÇ KOMUTU
   ========================================================= */

async function matchCommand(message, args) {
    if (
        !isOwner(message.member) &&
        !hasRole(
            message.member,
            ROLE_IDS.spiker
        )
    ) {
        return message.reply(
            "❌ Maç başlatmak için Spiker yetkisi gerekir."
        );
    }

    if (!requireChannel(
        message,
        "mac",
        "maç"
    )) return;

    const team1 =
        findTeam(args[0]);

    const team2 =
        findTeam(
            args.slice(1).join(" ")
        ) ||
        findTeam(args[1]);

    if (!team1 || !team2) {
        return message.reply(
            "❌ Kullanım: `.maç Galatasaray Fenerbahçe`"
        );
    }

    const result =
        await startMatch(
            message.guild,
            team1,
            team2
        );

    if (!result.ok) {
        return message.reply(
            `❌ ${result.message}`
        );
    }
}

/* =========================================================
   FİKSTÜR
   ========================================================= */

function parseDateTime(args) {
    if (args.length < 2) {
        return null;
    }

    const date = args[0];
    const time = args[1];

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return null;
    }

    if (!/^\d{2}:\d{2}$/.test(time)) {
        return null;
    }

    const [y, m, d] =
        date.split("-").map(Number);

    const [hour, minute] =
        time.split(":").map(Number);

    const result =
        new Date(
            y,
            m - 1,
            d,
            hour,
            minute,
            0
        );

    if (
        result.getFullYear() !== y ||
        result.getMonth() !== m - 1 ||
        result.getDate() !== d
    ) {
        return null;
    }

    return result.getTime();
}

async function fixtureAdd(message, args) {
    if (
        !isOwner(message.member) &&
        !hasRole(
            message.member,
            ROLE_IDS.spiker
        )
    ) {
        return message.reply(
            "❌ Fikstür eklemek için Spiker yetkisi gerekir."
        );
    }

    if (args.length < 4) {
        return message.reply(
            "❌ Kullanım:\n`.fiksturekle Galatasaray Fenerbahçe 2026-09-10 20:00`"
        );
    }

    let team1 =
        findTeam(args[0]);

    let secondStart = 1;

    if (!team1) {
        team1 =
            findTeam(
                args.slice(0, 2).join(" ")
            );

        secondStart = 2;
    }

    let team2 =
        findTeam(args[secondStart]);

    if (!team2) {
        team2 =
            findTeam(
                args.slice(
                    secondStart,
                    -2
                ).join(" ")
            );
    }

    if (!team1 || !team2) {
        return message.reply(
            "❌ Takımlar bulunamadı."
        );
    }

    const dateArgs =
        args.slice(-2);

    const timestamp =
        parseDateTime(
            dateArgs
        );

    if (!timestamp) {
        return message.reply(
            "❌ Tarih formatı hatalı.\nÖrnek: `2026-09-10 20:00`"
        );
    }

    const g =
        getGuildDB(
            message.guild.id
        );

    const id =
        `${message.guild.id}-fixture-${Date.now()}`;

    const fixture = {
        id,
        team1,
        team2,
        timestamp,
        status: "scheduled",
        messageId: null,
        createdAt: Date.now()
    };

    g.fixtures.push(fixture);

    const channel =
        getChannelByKey(
            message.guild,
            "fikstur"
        );

    if (!channel) {
        return message.reply(
            "❌ Fikstür kanalı bulunamadı."
        );
    }

    const embed =
        new EmbedBuilder()
            .setTitle("📅 YENİ FİKSTÜR")
            .setDescription(
                `🏟️ **${team1}** vs **${team2}**\n\n` +
                `🗓️ ${new Date(timestamp).toLocaleString("tr-TR")}\n` +
                `🟡 Durum: **Bekliyor**`
            )
            .setTimestamp();

    const sent =
        await channel.send({
            embeds: [embed]
        });

    fixture.messageId =
        sent.id;

    saveDatabase();

    await message.reply(
        `✅ Fikstür eklendi.\n📅 **${team1} vs ${team2}**`
    );
}

async function checkFixtures() {
    const now = Date.now();

    for (const guild of client.guilds.cache.values()) {
        const g =
            getGuildDB(
                guild.id
            );

        for (const fixture of g.fixtures) {
            if (
                fixture.status !== "scheduled" ||
                fixture.timestamp > now
            ) {
                continue;
            }

            fixture.status = "live";
            saveDatabase();

            const channel =
                getChannelByKey(
                    guild,
                    "fikstur"
                );

            if (channel && fixture.messageId) {
                try {
                    const msg =
                        await channel.messages.fetch(
                            fixture.messageId
                        );

                    await msg.edit({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle("🔴 MAÇ BAŞLIYOR")
                                .setDescription(
                                    `🏟️ **${fixture.team1}** vs **${fixture.team2}**\n\n` +
                                    `🔴 Durum: **CANLI**`
                                )
                                .setTimestamp()
                        ]
                    });
                } catch {}
            }

            startMatch(
                guild,
                fixture.team1,
                fixture.team2,
                {
                    fixtureId: fixture.id
                }
            ).catch(error => {
                console.error(
                    "FİKSTÜR MAÇ HATASI:",
                    error
                );

                fixture.status = "scheduled";
                saveDatabase();
            });
        }
    }
}

/* =========================================================
   PUAN KOMUTU
   ========================================================= */

async function pointsCommand(message) {
    await message.reply({
        embeds: [
            createStandingsEmbed(
                message.guild
            )
        ]
    });
}

/* =========================================================
   DM SİSTEMİ
   ========================================================= */

async function dmCommand(message, args) {
    if (!isAdmin(message.member)) {
        return message.reply(
            "❌ Bu komutu sadece Yönetici kullanabilir."
        );
    }

    if (!args.length) {
        return message.reply(
            "❌ Kullanım:\n`.dm all mesaj`\n`.dm @Oyuncu mesaj`"
        );
    }

    if (
        args[0].toLowerCase() === "all"
    ) {
        const text =
            args.slice(1).join(" ");

        if (!text) {
            return message.reply(
                "❌ Mesaj yazmalısın."
            );
        }

        await message.reply(
            "📨 DM gönderimi başlatıldı."
        );

        let success = 0;
        let failed = 0;

        for (const member of message.guild.members.cache.values()) {
            if (member.user.bot) continue;

            try {
                await member.send(text);
                success++;
            } catch {
                failed++;
            }

            await sleep(400);
        }

        return message.channel.send(
            `📨 **DM Sonucu**\n\n` +
            `✅ Başarılı: **${success}**\n` +
            `❌ Başarısız: **${failed}**`
        );
    }

    const target =
        await getMember(
            message.guild,
            args[0]
        );

    if (!target) {
        return message.reply(
            "❌ Kullanıcı bulunamadı."
        );
    }

    const text =
        args.slice(1).join(" ");

    if (!text) {
        return message.reply(
            "❌ Mesaj yazmalısın."
        );
    }

    try {
        await target.send(text);

        await message.reply(
            `✅ ${target} kullanıcısına DM gönderildi.`
        );
    } catch {
        await message.reply(
            "❌ Kullanıcıya DM gönderilemedi."
        );
    }
}

/* =========================================================
   YARDIM
   ========================================================= */

async function helpCommand(message) {
    const embed =
        new EmbedBuilder()
            .setTitle("📚 AXERA LEAGUE KOMUTLARI")
            .setDescription(
                [
                    "**👤 KAYIT**",
                    "`.k @oyuncu TakmaAdı`",
                    "`.kayıtsızver @oyuncu`",
                    "`.ara oyuncu isim`",
                    "",
                    "**🏋️ OYUNCU**",
                    "`.ant`",
                    "`.antrenman`",
                    "`.pen`",
                    "`.penaltı`",
                    "`.bütçe`",
                    "`.gönder @oyuncu miktar`",
                    "",
                    "**💰 DEĞER**",
                    "`.dver @oyuncu miktar`",
                    "`.dsil @oyuncu miktar`",
                    "`.bütçeekle @oyuncu miktar`",
                    "`.bütçesil @oyuncu miktar`",
                    "",
                    "**🏟️ TRANSFER**",
                    "`.kap @oyuncu @takım maaş sezon`",
                    "",
                    "**👥 KADRO**",
                    "`.kadro @takım`",
                    "`.kadroekle @takım @oyuncu pozisyon`",
                    "`.kadrosil @takım @oyuncu`",
                    "",
                    "**⚽ MAÇ**",
                    "`.maç @takım1 @takım2`",
                    "`.fiksturekle @takım1 @takım2 YYYY-MM-DD HH:MM`",
                    "`.fisktür`",
                    "`.puan`",
                    "",
                    "**💼 TAKIM**",
                    "`.takımbütçe @takım`",
                    "`.takımbütçegönder @takım miktar`",
                    "",
                    "**📨 YÖNETİM**",
                    "`.dm all mesaj`",
                    "`.dm @oyuncu mesaj`"
                ].join("\n")
            )
            .setTimestamp();

    await message.reply({
        embeds: [embed]
    });
}

/* =========================================================
   MODERASYON
   ========================================================= */

async function clearCommand(message, args) {
    if (!isAdmin(message.member)) {
        return message.reply(
            "❌ Yönetici yetkisi gerekli."
        );
    }

    const amount =
        Number(args[0]);

    if (
        !Number.isInteger(amount) ||
        amount < 1 ||
        amount > 100
    ) {
        return message.reply(
            "❌ 1-100 arasında bir sayı yaz."
        );
    }

    try {
        const deleted =
            await message.channel.bulkDelete(
                amount,
                true
            );

        await message.channel.send(
            `🧹 **${deleted.size}** mesaj silindi.`
        );
    } catch {
        await message.reply(
            "❌ Mesajlar silinemedi."
        );
    }
}

async function lockCommand(message, unlock = false) {
    if (!isAdmin(message.member)) {
        return message.reply(
            "❌ Yönetici yetkisi gerekli."
        );
    }

    try {
        await message.channel.permissionOverwrites.edit(
            message.guild.roles.everyone,
            {
                SendMessages: unlock
                    ? null
                    : false
            }
        );

        await message.reply(
            unlock
                ? "🔓 Kanal açıldı."
                : "🔒 Kanal kilitlendi."
        );
    } catch {
        await message.reply(
            "❌ Kanal izinleri değiştirilemedi."
        );
    }
}

/* =========================================================
   EMBED
   ========================================================= */

async function embedCommand(message, args) {
    if (!isAdmin(message.member)) {
        return message.reply(
            "❌ Yönetici yetkisi gerekli."
        );
    }

    const content =
        args.join(" ");

    if (!content) {
        return message.reply(
            "❌ Kullanım: `.embed Başlık | Açıklama`"
        );
    }

    const [title, description] =
        content.split("|");

    const embed =
        new EmbedBuilder()
            .setTitle(
                (title || "Axera League").trim()
            )
            .setDescription(
                (description || "").trim()
            )
            .setTimestamp();

    await message.channel.send({
        embeds: [embed]
    });
}

/* =========================================================
   ROL VER
   ========================================================= */

async function roleGiveCommand(message, args) {
    if (!isAdmin(message.member)) {
        return message.reply(
            "❌ Yönetici yetkisi gerekli."
        );
    }

    const member =
        await getMember(
            message.guild,
            args[0]
        );

    if (!member) {
        return message.reply(
            "❌ Kullanıcı bulunamadı."
        );
    }

    const roleMention =
        args[1]?.match(
            /^<@&(\d+)>$/
        );

    let role = null;

    if (roleMention) {
        role =
            message.guild.roles.cache.get(
                roleMention[1]
            );
    }

    if (!role) {
        const roleName =
            args.slice(1).join(" ");

        role =
            message.guild.roles.cache.find(
                r =>
                    normalize(r.name) ===
                    normalize(roleName)
            );
    }

    if (!role) {
        return message.reply(
            "❌ Rol bulunamadı."
        );
    }

    try {
        await member.roles.add(role);

        await message.reply(
            `✅ ${member} kullanıcısına ${role} verildi.`
        );
    } catch {
        await message.reply(
            "❌ Rol verilemedi."
        );
    }
}

/* =========================================================
   TWEET
   ========================================================= */

async function tweetCommand(message, args) {
    const text =
        args.join(" ");

    if (!text) {
        return message.reply(
            "❌ Tweet metni yazmalısın."
        );
    }

    const embed =
        new EmbedBuilder()
            .setAuthor({
                name: message.member.displayName,
                iconURL: message.author.displayAvatarURL()
            })
            .setDescription(
                `> ${text}`
            )
            .setFooter({
                text: "Axera League"
            })
            .setTimestamp();

    await message.channel.send({
        embeds: [embed]
    });
}

/* =========================================================
   TICKET
   ========================================================= */

async function ticketPanel(message) {
    if (!isAdmin(message.member)) {
        return message.reply(
            "❌ Yönetici yetkisi gerekli."
        );
    }

    const row =
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId("ticket:create")
                    .setLabel("Destek Talebi Aç")
                    .setEmoji("🎫")
                    .setStyle(ButtonStyle.Primary)
            );

    const embed =
        new EmbedBuilder()
            .setTitle("🎫 DESTEK SİSTEMİ")
            .setDescription(
                "Destek almak için aşağıdaki butona bas."
            )
            .setTimestamp();

    await message.channel.send({
        embeds: [embed],
        components: [row]
    });
}

async function createTicket(interaction) {
    const guild =
        interaction.guild;

    const existing =
        guild.channels.cache.find(
            c =>
                c.name ===
                `ticket-${normalize(interaction.user.username)}`
        );

    if (existing) {
        return interaction.reply({
            content:
                `❌ Zaten açık bir ticketın var: ${existing}`,
            ephemeral: true
        });
    }

    try {
        const channel =
            await guild.channels.create({
                name:
                    `ticket-${normalize(interaction.user.username)}`.slice(0, 90),
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
                    }
                ]
            });

        const closeRow =
            new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId("ticket:close")
                        .setLabel("Ticket Kapat")
                        .setEmoji("🔒")
                        .setStyle(ButtonStyle.Danger)
                );

        await channel.send({
            content:
                `${interaction.user}`,
            embeds: [
                new EmbedBuilder()
                    .setTitle("🎫 Ticket")
                    .setDescription(
                        "Yetkili ekibimiz kısa süre içerisinde ilgilenecektir."
                    )
                    .setTimestamp()
            ],
            components: [closeRow]
        });

        await interaction.reply({
            content:
                `✅ Ticket oluşturuldu: ${channel}`,
            ephemeral: true
        });
    } catch {
        await interaction.reply({
            content:
                "❌ Ticket oluşturulamadı.",
            ephemeral: true
        });
    }
}

/* =========================================================
   ROL PANEL
   ========================================================= */

async function rolePanel(message) {
    if (
        !isOwner(message.member) &&
        !isAdmin(message.member)
    ) {
        return message.reply(
            "❌ Yönetici yetkisi gerekli."
        );
    }

    const embed =
        new EmbedBuilder()
            .setTitle("👤 AXERA LEAGUE KAYIT PANELİ")
            .setDescription(
                "Kayıt yetkilileri `.k` komutu ile oyuncuyu kayıt paneline ekleyebilir."
            )
            .setTimestamp();

    await message.channel.send({
        embeds: [embed]
    });
}

/* =========================================================
   KUPA SİSTEMİ
   ========================================================= */

async function kupaEkle(message, args) {
    if (!isAdmin(message.member)) {
        return message.reply(
            "❌ Yönetici yetkisi gerekli."
        );
    }

    const team =
        findTeam(
            args.slice(0, -1).join(" ")
        ) ||
        findTeam(args[0]);

    const kupa =
        args[args.length - 1];

    if (!team || !kupa) {
        return message.reply(
            "❌ Kullanım: `.kupaekle Galatasaray Süper Kupa`"
        );
    }

    const g =
        getGuildDB(
            message.guild.id
        );

    if (!g.settings.trophies) {
        g.settings.trophies = {};
    }

    if (!g.settings.trophies[team]) {
        g.settings.trophies[team] = [];
    }

    g.settings.trophies[team].push(
        kupa
    );

    saveDatabase();

    await message.reply(
        `🏆 **${team}** takımına **${kupa}** kupası eklendi.`
    );
}

async function kupaSil(message, args) {
    if (!isAdmin(message.member)) {
        return message.reply(
            "❌ Yönetici yetkisi gerekli."
        );
    }

    const team =
        findTeam(args[0]) ||
        findTeam(args.slice(0, -1).join(" "));

    const kupa =
        args[args.length - 1];

    const g =
        getGuildDB(
            message.guild.id
        );

    if (
        !team ||
        !g.settings.trophies?.[team]
    ) {
        return message.reply(
            "❌ Kupa bulunamadı."
        );
    }

    const index =
        g.settings.trophies[team]
            .findIndex(
                x =>
                    normalize(x) ===
                    normalize(kupa)
            );

    if (index === -1) {
        return message.reply(
            "❌ Bu kupa bulunamadı."
        );
    }

    g.settings.trophies[team]
        .splice(index, 1);

    saveDatabase();

    await message.reply(
        `🗑️ **${team}** takımının **${kupa}** kupası silindi.`
    );
}

/* =========================================================
   ASİST KRALI
   ========================================================= */

async function assistKing(message) {
    const g =
        getGuildDB(
            message.guild.id
        );

    const assists =
        {};

    for (const user of Object.values(g.users)) {
        if (user.assists) {
            assists[user.userId] =
                user.assists;
        }
    }

    const sorted =
        Object.entries(assists)
            .sort(
                (a, b) => b[1] - a[1]
            )
            .slice(0, 10);

    if (!sorted.length) {
        return message.reply(
            "📊 Henüz asist kaydı yok."
        );
    }

    const lines = [];

    for (let i = 0; i < sorted.length; i++) {
        const [id, count] =
            sorted[i];

        const member =
            message.guild.members.cache.get(id);

        lines.push(
            `**${i + 1}.** ${member || `<@${id}>`} — **${count} asist**`
        );
    }

    await message.reply(
        `👑 **ASİST KRALI**\n\n${lines.join("\n")}`
    );
}

/* =========================================================
   BUTONLAR
   ========================================================= */

client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;

    try {
        if (
            interaction.customId.startsWith(
                "register:"
            )
        ) {
            if (
                !isOwner(interaction.member) &&
                !hasRole(
                    interaction.member,
                    ROLE_IDS.kayitYetkilisi
                )
            ) {
                return interaction.reply({
                    content:
                        "❌ Bu paneli sadece Kayıt Yetkilisi kullanabilir.",
                    ephemeral: true
                });
            }

            const parts =
                interaction.customId.split(":");

            const type =
                parts[1];

            const targetId =
                parts[2];

            const sessionId =
                `${interaction.guild.id}:${targetId}`;

            const session =
                registrationSessions.get(
                    sessionId
                );

            if (!session) {
                return interaction.reply({
                    content:
                        "❌ Kayıt oturumu bulunamadı.",
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

            const roleKey =
                type === "td"
                    ? "teknikDirektor"
                    : type;

            const role =
                getRoleByKey(
                    interaction.guild,
                    roleKey
                );

            const kayitsiz =
                getRoleByKey(
                    interaction.guild,
                    "kayitsiz"
                );

            const rolesToRemove = [
                "kaleci",
                "uye",
                "futbolcu",
                "teknikDirektor"
            ]
                .map(
                    key =>
                        getRoleByKey(
                            interaction.guild,
                            key
                        )
                )
                .filter(Boolean);

            for (
                const oldRole
                of rolesToRemove
            ) {
                if (
                    target.roles.cache.has(
                        oldRole.id
                    )
                ) {
                    await target.roles
                        .remove(oldRole)
                        .catch(() => {});
                }
            }

            if (kayitsiz) {
                await target.roles
                    .remove(kayitsiz)
                    .catch(() => {});
            }

            if (role) {
                await target.roles
                    .add(role)
                    .catch(() => {});
            }

            const user =
                getUserDB(
                    interaction.guild.id,
                    target.id
                );

            user.registered = true;
            user.position = type;
            user.nickname =
                session.nickname ||
                target.displayName;

            if (!user.value) {
                user.value =
                    parseNicknameValue(
                        target.displayName
                    );
            }

            if (
                session.nickname &&
                target.manageable
            ) {
                await target
                    .setNickname(
                        session.nickname
                    )
                    .catch(() => {});
            }

            saveDatabase();

            registrationSessions.delete(
                sessionId
            );

            await interaction.update({
                content:
                    `✅ ${target} başarıyla kayıt edildi.\n` +
                    `📋 Tür: **${type === "td" ? "Teknik Direktör" : type}**`,
                components: []
            });

            const chat =
                getChannelByKey(
                    interaction.guild,
                    "sohbet"
                );

            if (chat) {
                await chat.send(
                    `🎉 Hoş geldin ${target}! Kayıt işlemin tamamlandı.`
                );
            }

            return;
        }

        if (
            interaction.customId.startsWith(
                "kap:"
            )
        ) {
            const parts =
                interaction.customId.split(":");

            const action =
                parts[1];

            const offerId =
                parts.slice(2).join(":");

            const g =
                getGuildDB(
                    interaction.guild.id
                );

            const offer =
                g.pendingOffers[offerId];

            if (!offer) {
                return interaction.reply({
                    content:
                        "❌ Bu KAP teklifi artık geçerli değil.",
                    ephemeral: true
                });
            }

            if (
                interaction.user.id !==
                offer.playerId
            ) {
                return interaction.reply({
                    content:
                        "❌ Bu teklif sadece oyuncu tarafından yanıtlanabilir.",
                    ephemeral: true
                });
            }

            if (action === "reject") {
                delete g.pendingOffers[
                    offerId
                ];

                saveDatabase();

                return interaction.update({
                    content:
                        `❌ ${interaction.user} teklifi reddetti.`,
                    embeds: [],
                    components: []
                });
            }

            const user =
                getUserDB(
                    interaction.guild.id,
                    interaction.user.id
                );

            if (user.team) {
                return interaction.reply({
                    content:
                        "❌ Artık takımlısın.",
                    ephemeral: true
                });
            }

            user.team =
                offer.team;

            user.salary =
                offer.salary;

            user.seasons =
                offer.seasons;

            const teamRole =
                getTeamRole(
                    interaction.guild,
                    offer.team
                );

            if (teamRole) {
                await interaction.member.roles
                    .add(teamRole)
                    .catch(() => {});
            }

            delete g.pendingOffers[
                offerId
            ];

            saveDatabase();

            await interaction.update({
                content:
                    `✅ ${interaction.user} **${offer.team}** takımının teklifini kabul etti!\n\n` +
                    `💰 Maaş: **${money(offer.salary)} / sezon**\n` +
                    `📅 Sözleşme: **${offer.seasons} sezon**`,
                embeds: [],
                components: []
            });

            return;
        }

        if (
            interaction.customId ===
            "ticket:create"
        ) {
            return createTicket(
                interaction
            );
        }

        if (
            interaction.customId ===
            "ticket:close"
        ) {
            if (
                !interaction.member.permissions.has(
                    PermissionsBitField.Flags.ManageChannels
                ) &&
                !isOwner(interaction.member)
            ) {
                return interaction.reply({
                    content:
                        "❌ Ticket kapatma yetkin yok.",
                    ephemeral: true
                });
            }

            await interaction.reply(
                "🔒 Ticket 3 saniye içinde kapatılıyor."
            );

            await sleep(3000);

            await interaction.channel
                .delete()
                .catch(() => {});
        }
    } catch (error) {
        console.error(
            "BUTON HATASI:",
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

/* =========================================================
   MESAJ KOMUTLARI
   ========================================================= */

client.on("messageCreate", async message => {
    if (!message.guild) return;
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const parts =
        message.content
            .trim()
            .split(/\s+/);

    const command =
        parts.shift()
            .slice(PREFIX.length)
            .toLocaleLowerCase("tr-TR");

    const args =
        parts;

    try {
        switch (command) {

            /* KAYIT */
            case "k":
                await startRegistration(
                    message,
                    args
                );
                break;

            case "kayıtsızver":
            case "kayitsizver":
                await giveUnregistered(
                    message,
                    args
                );
                break;

            case "ara":
                if (
                    normalize(args[0]) ===
                    "oyuncu"
                ) {
                    await searchPlayerCommand(
                        message,
                        args.slice(1)
                    );
                }
                break;

            /* ANTRENMAN */
            case "ant":
            case "antrenman":
                await trainingCommand(
                    message
                );
                break;

            /* PENALTI */
            case "pen":
            case "penaltı":
            case "penalti":
                await penaltyCommand(
                    message
                );
                break;

            /* DEĞER */
            case "dver":
                await valueCommand(
                    message,
                    args,
                    "add"
                );
                break;

            case "dsil":
                await valueCommand(
                    message,
                    args,
                    "remove"
                );
                break;

            /* BÜTÇE */
            case "bütçe":
            case "butce":
                await budgetCommand(
                    message
                );
                break;

            case "bütçeekle":
            case "butceekle":
                await budgetManage(
                    message,
                    args,
                    "add"
                );
                break;

            case "bütçesil":
            case "butcesil":
                await budgetManage(
                    message,
                    args,
                    "remove"
                );
                break;

            case "gönder":
            case "gonder":
                await sendBudget(
                    message,
                    args
                );
                break;

            /* TAKIM BÜTÇESİ */
            case "takımbütçe":
            case "takimbutce":
                await teamBudgetCommand(
                    message,
                    args
                );
                break;

            case "takımbütçegönder":
            case "takimbutcegonder":
                await teamBudgetSend(
                    message,
                    args
                );
                break;

            /* TRANSFER */
            case "kap":
                await kapCommand(
                    message,
                    args
                );
                break;

            /* KADRO */
            case "kadroekle":
                await squadAdd(
                    message,
                    args
                );
                break;

            case "kadrosil":
                await squadRemove(
                    message,
                    args
                );
                break;

            case "kadro":
                await squadCommand(
                    message,
                    args
                );
                break;

            /* MAÇ */
            case "maç":
            case "mac":
                await matchCommand(
                    message,
                    args
                );
                break;

            /* FİKSTÜR */
            case "fiksturekle":
                await fixtureAdd(
                    message,
                    args
                );
                break;

            case "fisktür":
            case "fikstur":
                await message.reply({
                    embeds: [
                        createFixtureEmbed(
                            message.guild
                        )
                    ]
                });
                break;

            /* PUAN */
            case "puan":
                await pointsCommand(
                    message
                );
                break;

            /* DM */
            case "dm":
                await dmCommand(
                    message,
                    args
                );
                break;

            /* YARDIM */
            case "yardım":
            case "yardim":
                await helpCommand(
                    message
                );
                break;

            /* MODERASYON */
            case "sil":
                await clearCommand(
                    message,
                    args
                );
                break;

            case "kilit":
                await lockCommand(
                    message,
                    false
                );
                break;

            case "aç":
            case "ac":
                await lockCommand(
                    message,
                    true
                );
                break;

            /* EMBED */
            case "embed":
                await embedCommand(
                    message,
                    args
                );
                break;

            /* ROL */
            case "rolver":
                await roleGiveCommand(
                    message,
                    args
                );
                break;

            /* TWEET */
            case "tweet":
                await tweetCommand(
                    message,
                    args
                );
                break;

            /* TICKET */
            case "ticketpanel":
                await ticketPanel(
                    message
                );
                break;

            /* ROL PANEL */
            case "rolpanel":
                await rolePanel(
                    message
                );
                break;

            /* KUPA */
            case "kupaekle":
                await kupaEkle(
                    message,
                    args
                );
                break;

            case "kupasil":
                await kupaSil(
                    message,
                    args
                );
                break;

            /* ASİST */
            case "asistkral":
                await assistKing(
                    message
                );
                break;

            default:
                break;
        }
    } catch (error) {
        console.error(
            `KOMUT HATASI [.${command}]:`,
            error
        );

        await message.reply(
            "❌ Komut çalıştırılırken bir hata oluştu. Konsol/log bölümünü kontrol et."
        ).catch(() => {});
    }
});

/* =========================================================
   FİKSTÜR GÖRÜNTÜLEME
   ========================================================= */

function createFixtureEmbed(guild) {
    const g =
        getGuildDB(
            guild.id
        );

    const fixtures =
        g.fixtures
            .slice()
            .sort(
                (a, b) =>
                    a.timestamp - b.timestamp
            )
            .slice(0, 20);

    if (!fixtures.length) {
        return new EmbedBuilder()
            .setTitle("📅 FİKSTÜR")
            .setDescription(
                "Henüz fikstür bulunmuyor."
            )
            .setTimestamp();
    }

    const lines =
        fixtures.map(fixture => {
            let status =
                "🟡 Bekliyor";

            let score = "";

            if (fixture.status === "live") {
                status = "🔴 CANLI";
            }

            if (fixture.status === "finished") {
                status = "🏁 Bitti";
                score =
                    ` — **${fixture.score1}-${fixture.score2}**`;
            }

            return (
                `**${fixture.team1}** vs **${fixture.team2}**${score}\n` +
                `🗓️ ${new Date(fixture.timestamp).toLocaleString("tr-TR")} • ${status}`
            );
        });

    return new EmbedBuilder()
        .setTitle("📅 AXERA LEAGUE FİKSTÜRÜ")
        .setDescription(
            lines.join("\n\n")
        )
        .setTimestamp();
}

/* =========================================================
   BOT DURUMU
   ========================================================= */

function getUptimeText() {
    const totalSeconds =
        Math.floor(
            process.uptime()
        );

    const hours =
        Math.floor(
            totalSeconds / 3600
        );

    const minutes =
        Math.floor(
            (totalSeconds % 3600) / 60
        );

    const seconds =
        totalSeconds % 60;

    return `${hours} saat ${minutes} dakika ${seconds} saniye`;
}

async function sendBotStatus() {
    const time =
        new Date().toLocaleTimeString(
            "tr-TR",
            {
                hour: "2-digit",
                minute: "2-digit"
            }
        );

    for (
        const guild
        of client.guilds.cache.values()
    ) {
        const channel =
            getChannelByKey(
                guild,
                "botDurum"
            );

        if (!channel || !channel.isTextBased()) {
            continue;
        }

        const embed =
            new EmbedBuilder()
                .setTitle("🤖 BOT DURUMU")
                .setDescription(
                    `🟢 Tüm sistemler sorunsuz çalışıyor.\n\n` +
                    `⏱️ Çalışma Süresi: **${getUptimeText()}**\n` +
                    `🕐 Son Kontrol: **${time}**`
                )
                .setTimestamp();

        await channel.send({
            embeds: [embed]
        }).catch(() => {});
    }
}

function statusScheduler() {
    const now =
        new Date();

    const secondsUntilNext30 =
        (
            (30 - (now.getMinutes() % 30)) * 60
        ) -
        now.getSeconds();

    const delay =
        Math.max(
            1000,
            secondsUntilNext30 * 1000
        );

    setTimeout(
        async () => {
            await sendBotStatus();
            statusScheduler();
        },
        delay
    );
}

/* =========================================================
   FİKSTÜR SCHEDULER
   ========================================================= */

let fixtureInterval = null;

function startFixtureScheduler() {
    if (fixtureInterval) {
        clearInterval(
            fixtureInterval
        );
    }

    fixtureInterval =
        setInterval(
            () => {
                checkFixtures()
                    .catch(error =>
                        console.error(
                            "FİKSTÜR SCHEDULER:",
                            error
                        )
                    );
            },
            1000
        );
}

/* =========================================================
   READY
   ========================================================= */

client.once("ready", async () => {
    console.log(
        "======================================"
    );

    console.log(
        `🤖 Bot: ${client.user.tag}`
    );

    console.log(
        `🆔 ID: ${client.user.id}`
    );

    console.log(
        `🏠 Sunucu Sayısı: ${client.guilds.cache.size}`
    );

    console.log(
        "🟢 AXERA LEAGUE BOT AKTİF!"
    );

    console.log(
        "======================================"
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

    startFixtureScheduler();
    statusScheduler();

    setTimeout(
        () => {
            sendBotStatus()
                .catch(() => {});
        },
        5000
    );
});

/* =========================================================
   HATA YAKALAMA
   ========================================================= */

process.on(
    "unhandledRejection",
    error => {
        console.error(
            "UNHANDLED REJECTION:",
            error
        );
    }
);

process.on(
    "uncaughtException",
    error => {
        console.error(
            "UNCAUGHT EXCEPTION:",
            error
        );
    }
);

process.on(
    "SIGINT",
    () => {
        saveDatabase();

        if (fixtureInterval) {
            clearInterval(
                fixtureInterval
            );
        }

        client.destroy();

        process.exit(0);
    }
);

process.on(
    "SIGTERM",
    () => {
        saveDatabase();

        if (fixtureInterval) {
            clearInterval(
                fixtureInterval
            );
        }

        client.destroy();

        process.exit(0);
    }
);

/* =========================================================
   TOKEN
   ========================================================= */

if (!process.env.TOKEN) {
    console.error(
        "❌ TOKEN bulunamadı! Hosting ortam değişkenlerine TOKEN ekle."
    );
    process.exit(1);
}

client.login(process.env.TOKEN);
