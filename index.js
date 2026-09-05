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
    ChannelType,
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ============================================================
// AXERA LEAGUE
// Discord.js v14
// ============================================================

const PREFIX = ".";

const CONFIG = {
    TOKEN: process.env.TOKEN,

    roles: {
        futbolcu: "1534457228986421278",
        kaleci: "1534492034243498195",
        kayitsiz: "1534457560134844517",
        teknikDirektor: "1534456648930693120",
        kayitYetkilisi: "1534456315366342716",
        degerYetkilisi: "1534456192913375382",
        macYetkilisi: "1535251168169697390",
    },

    channels: {
        kayit: "1534460177884123276",
        sohbet: "1534469475917758586",
        antrenman: "1534474070798762197",
        penalti: "1534474327812997192",
        mac: "1534477626872168541",
        puan: "1534475991404253284",
    },

    timezone: "Europe/Istanbul",

    trainingReward: 5,
    penaltyReward: 5,

    formations: {
        "4-4-2": ["KL", "STP", "STP", "SĞB", "SLB", "MO", "MO", "SĞK", "SLK", "SNT", "SNT"],
        "4-3-3": ["KL", "STP", "STP", "SĞB", "SLB", "MO", "MO", "MO", "SĞK", "SLK", "SNT"],
        "4-2-3-1": ["KL", "STP", "STP", "SĞB", "SLB", "MO", "MO", "MOO", "SĞK", "SLK", "SNT"],
        "3-5-2": ["KL", "STP", "STP", "STP", "MO", "MO", "MOO", "SĞK", "SLK", "SNT", "SNT"],
        "3-4-3": ["KL", "STP", "STP", "STP", "MO", "MO", "SĞK", "SLK", "SNT", "SNT", "SNT"],
        "4-3-1-2": ["KL", "STP", "STP", "SĞB", "SLB", "MO", "MO", "MO", "MOO", "SNT", "SNT"],
        "4-2-2-2": ["KL", "STP", "STP", "SĞB", "SLB", "MO", "MO", "MOO", "MOO", "SNT", "SNT"],
        "5-3-2": ["KL", "STP", "STP", "STP", "SĞB", "SLB", "MO", "MO", "MO", "SNT", "SNT"],
    },
};

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(__dirname, "data.json");
const BACKUP_DIR = path.join(__dirname, "backups");

const DEFAULT_DATA = {
    users: {},
    teams: {},
    standings: {},
    fixtures: [],
    nextFixtureId: 1,
    activeMatches: {},
    standingsMessageId: null,
    registrationPanels: {},
    tickets: {},
    cups: {},
    training: {},
    formations: {},
};

function cloneDefault() {
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function ensureDirectories() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function loadData() {
    ensureDirectories();

    if (!fs.existsSync(DATA_FILE)) {
        const fresh = cloneDefault();
        fs.writeFileSync(DATA_FILE, JSON.stringify(fresh, null, 2), "utf8");
        return fresh;
    }

    try {
        const raw = fs.readFileSync(DATA_FILE, "utf8");
        const parsed = JSON.parse(raw);

        return {
            ...cloneDefault(),
            ...parsed,
            users: parsed.users || {},
            teams: parsed.teams || {},
            standings: parsed.standings || {},
            fixtures: Array.isArray(parsed.fixtures) ? parsed.fixtures : [],
            activeMatches: parsed.activeMatches || {},
            registrationPanels: parsed.registrationPanels || {},
            tickets: parsed.tickets || {},
            cups: parsed.cups || {},
            training: parsed.training || {},
            formations: parsed.formations || {},
        };
    } catch {
        const broken = `${DATA_FILE}.broken-${Date.now()}`;
        try {
            fs.copyFileSync(DATA_FILE, broken);
        } catch {}

        const fresh = cloneDefault();
        fs.writeFileSync(DATA_FILE, JSON.stringify(fresh, null, 2), "utf8");
        return fresh;
    }
}

let data = loadData();

let saveTimer = null;

function saveData() {
    clearTimeout(saveTimer);

    saveTimer = setTimeout(() => {
        try {
            ensureDirectories();

            const tempFile = `${DATA_FILE}.tmp`;
            const backupFile = path.join(
                BACKUP_DIR,
                `data-${Date.now()}.json`
            );

            if (fs.existsSync(DATA_FILE)) {
                try {
                    fs.copyFileSync(DATA_FILE, backupFile);
                } catch {}
            }

            fs.writeFileSync(
                tempFile,
                JSON.stringify(data, null, 2),
                "utf8"
            );

            fs.renameSync(tempFile, DATA_FILE);
        } catch (error) {
            console.error("DATA SAVE ERROR:", error);
        }
    }, 250);
}

// ============================================================
// CLIENT
// ============================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [
        Partials.Channel,
    ],
});

// ============================================================
// HELPERS
// ============================================================

function normalizeText(text = "") {
    return String(text)
        .toLocaleLowerCase("tr-TR")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ı/g, "i")
        .replace(/ğ/g, "g")
        .replace(/ü/g, "u")
        .replace(/ş/g, "s")
        .replace(/ö/g, "o")
        .replace(/ç/g, "c")
        .replace(/[^a-z0-9\s]/gi, "")
        .replace(/\s+/g, " ")
        .trim();
}

function mentionToId(text) {
    if (!text) return null;
    const match = String(text).match(/^<@!?(\d+)>$/);
    return match ? match[1] : null;
}

function numeric(value) {
    return typeof value === "number" &&
        Number.isFinite(value);
}

function parseMoney(value) {
    if (value === undefined || value === null) return NaN;

    let text = String(value)
        .trim()
        .toLocaleLowerCase("tr-TR")
        .replace(/€/g, "")
        .replace(/\s/g, "");

    let multiplier = 1;

    if (text.endsWith("m")) {
        multiplier = 1_000_000;
        text = text.slice(0, -1);
    }

    if (text.endsWith("k")) {
        multiplier = 1_000;
        text = text.slice(0, -1);
    }

    text = text.replace(/\./g, "").replace(",", ".");

    const number = Number(text);

    if (!Number.isFinite(number)) return NaN;

    return number * multiplier;
}

function formatMoney(value) {
    const amount = Number(value) || 0;
    const millions = amount / 1_000_000;

    if (Number.isInteger(millions)) {
        return `${millions}M€`;
    }

    return `${Number(millions.toFixed(2))}M€`;
}

function parseMillionNumber(value) {
    const number = Number(String(value).replace(",", "."));
    return Number.isFinite(number) ? number : NaN;
}

function isAdmin(member) {
    return Boolean(
        member?.permissions?.has(
            PermissionsBitField.Flags.Administrator
        )
    );
}

function hasRole(member, roleId) {
    return Boolean(member?.roles?.cache?.has(roleId));
}

function isKayitYetkilisi(member) {
    return isAdmin(member) ||
        hasRole(member, CONFIG.roles.kayitYetkilisi);
}

function isDegerYetkilisi(member) {
    return hasRole(member, CONFIG.roles.degerYetkilisi) ||
        isAdmin(member);
}

function isMacYetkilisi(member) {
    return hasRole(member, CONFIG.roles.macYetkilisi) ||
        isAdmin(member);
}

function isRegistered(member) {
    if (!member || member.user?.bot) return false;

    if (hasRole(member, CONFIG.roles.kayitsiz)) {
        return false;
    }

    return (
        hasRole(member, CONFIG.roles.futbolcu) ||
        hasRole(member, CONFIG.roles.kaleci) ||
        hasRole(member, CONFIG.roles.teknikDirektor)
    );
}

function isUnregistered(member) {
    return (
        !member ||
        hasRole(member, CONFIG.roles.kayitsiz) ||
        !isRegistered(member)
    );
}

function getUser(userId) {
    if (!data.users[userId]) {
        data.users[userId] = {
            budget: 0,
            value: 0,
            training: 0,
        };
    }

    const user = data.users[userId];

    if (!numeric(user.budget)) {
        const possible = [
            "money",
            "balance",
            "para",
            "bakiye",
            "cash",
            "wallet",
            "balanceM",
            "budgetM",
            "personalBudget",
            "personalBalance",
        ];

        let found = 0;

        for (const field of possible) {
            if (numeric(user[field])) {
                found = user[field];
                break;
            }

            if (
                typeof user[field] === "string" &&
                Number.isFinite(parseMoney(user[field]))
            ) {
                found = parseMoney(user[field]);
                break;
            }
        }

        user.budget = found;
    }

    if (!numeric(user.value)) {
        user.value = 0;
    }

    if (!numeric(user.training)) {
        user.training = 0;
    }

    return user;
}

function getMemberValue(member) {
    const user = getUser(member.id);

    if (numeric(user.value) && user.value > 0) {
        return user.value;
    }

    const nickname = member.nickname || "";

    const match = nickname.match(/(\d+(?:[.,]\d+)?)\s*M€\s*$/i);

    if (!match) return 0;

    const millions = Number(match[1].replace(",", "."));

    return Number.isFinite(millions)
        ? millions * 1_000_000
        : 0;
}

function extractValueFromNickname(nickname) {
    const match = String(nickname || "")
        .match(/(\d+(?:[.,]\d+)?)\s*M€\s*$/i);

    if (!match) return null;

    const millions = Number(match[1].replace(",", "."));

    if (!Number.isFinite(millions)) return null;

    return millions * 1_000_000;
}

function replaceOnlyValue(nickname, newValue) {
    const clean = String(nickname || "").trim();

    const match = clean.match(/(\d+(?:[.,]\d+)?)\s*M€\s*$/i);

    if (!match) return null;

    const before = clean.slice(0, match.index).replace(/\s+$/, "");

    return `${before} | ${formatMoney(Math.max(0, newValue))}`;
}

async function changePlayerValue(member, amount) {
    if (!member) {
        return {
            ok: false,
            message: "❌ Oyuncu bulunamadı.",
        };
    }

    const nickname = member.nickname || member.user.username;

    const oldValue = extractValueFromNickname(nickname);

    if (oldValue === null) {
        return {
            ok: false,
            message:
                "❌ Oyuncunun takma adının sonunda geçerli bir `M€` değeri bulunamadı.",
        };
    }

    const newValue = Math.max(
        0,
        oldValue + amount
    );

    const newNickname = replaceOnlyValue(
        nickname,
        newValue
    );

    if (!newNickname) {
        return {
            ok: false,
            message: "❌ Değer güncellenemedi.",
        };
    }

    if (newNickname.length > 32) {
        return {
            ok: false,
            message:
                "❌ Yeni takma ad Discord'un 32 karakter sınırını aşıyor.",
        };
    }

    try {
        await member.setNickname(newNickname);

        const user = getUser(member.id);
        user.value = newValue;

        saveData();

        return {
            ok: true,
            oldValue,
            newValue,
            nickname: newNickname,
        };
    } catch (error) {
        console.error("VALUE ERROR:", error);

        return {
            ok: false,
            message:
                "❌ Takma ad değiştirilemedi. Botun Takma Adları Yönet yetkisini ve rol sırasını kontrol et.",
        };
    }
}

function similarityScore(a, b) {
    const x = normalizeText(a);
    const y = normalizeText(b);

    if (!x || !y) return 0;

    if (x === y) return 1;

    if (y.includes(x)) {
        return 0.92 - ((y.length - x.length) / 1000);
    }

    if (x.includes(y)) {
        return 0.9 - ((x.length - y.length) / 1000);
    }

    const rows = x.length + 1;
    const cols = y.length + 1;

    const matrix = Array.from(
        { length: rows },
        () => Array(cols).fill(0)
    );

    for (let i = 0; i < rows; i++) matrix[i][0] = i;
    for (let j = 0; j < cols; j++) matrix[0][j] = j;

    for (let i = 1; i < rows; i++) {
        for (let j = 1; j < cols; j++) {
            const cost = x[i - 1] === y[j - 1] ? 0 : 1;

            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }

    const distance = matrix[rows - 1][cols - 1];
    const maxLength = Math.max(x.length, y.length);

    return 1 - distance / maxLength;
}

function findClosestRegisteredMember(guild, query) {
    const normalizedQuery = normalizeText(query);

    if (!normalizedQuery) return null;

    const candidates = [];

    for (const member of guild.members.cache.values()) {
        if (member.user.bot) continue;
        if (!isRegistered(member)) continue;
        if (isUnregistered(member)) continue;

        const nickname = member.nickname || member.user.username;

        const nicknameScore = similarityScore(
            normalizedQuery,
            nickname
        );

        const usernameScore = similarityScore(
            normalizedQuery,
            member.user.username
        );

        const best = Math.max(
            nicknameScore,
            usernameScore
        );

        candidates.push({
            member,
            nickname,
            score: best,
        });
    }

    candidates.sort((a, b) => b.score - a.score);

    const result = candidates[0];

    if (!result) return null;

    if (
        result.score < 0.35 &&
        !normalizeText(result.nickname).includes(normalizedQuery)
    ) {
        return null;
    }

    return result;
}

function teamKey(roleId) {
    return String(roleId);
}

function getTeam(roleId) {
    const key = teamKey(roleId);

    if (!data.teams[key]) {
        data.teams[key] = {
            id: key,
            value: 0,
            squad: [],
            formation: "4-4-2",
        };
    }

    return data.teams[key];
}

function getStandings(roleId) {
    const key = teamKey(roleId);

    if (!data.standings[key]) {
        data.standings[key] = {
            O: 0,
            G: 0,
            B: 0,
            M: 0,
            AG: 0,
            YG: 0,
            AV: 0,
            P: 0,
        };
    }

    return data.standings[key];
}

function teamExists(roleId) {
    return Boolean(
        data.teams[teamKey(roleId)] &&
        data.standings[teamKey(roleId)]
    );
}

function getTeamName(guild, roleId) {
    const role = guild.roles.cache.get(roleId);
    return role ? role.name : `Takım ${roleId}`;
}

function getTeamTotalValue(guild, roleId) {
    const team = getTeam(roleId);

    let total = Number(team.value) || 0;

    for (const playerId of team.squad || []) {
        const member = guild.members.cache.get(playerId);

        if (!member || !isRegistered(member)) continue;

        total += getMemberValue(member);
    }

    return total;
}

function getRoleMention(roleId) {
    return `<@&${roleId}>`;
}

function getMemberMention(userId) {
    return `<@${userId}>`;
}

function randomInt(min, max) {
    return Math.floor(
        Math.random() * (max - min + 1)
    ) + min;
}

function pick(array) {
    return array[
        Math.floor(Math.random() * array.length)
    ];
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function channelIs(message, channelId) {
    return message.channel.id === channelId;
}

function requireChannel(message, channelId, name) {
    if (!channelIs(message, channelId)) {
        message.reply(
            `❌ Bu komut yalnızca <#${channelId}> kanalında kullanılabilir.`
        );
        return false;
    }

    return true;
}

function mentionMembersFromArgs(message, args) {
    const ids = [];

    for (const arg of args) {
        const id = mentionToId(arg);
        if (id) ids.push(id);
    }

    return ids;
}

function cleanArgsWithoutMentions(args) {
    return args.filter(arg => !mentionToId(arg));
}

function getTeamMentions(message, args) {
    return mentionMembersFromArgs(message, args);
}

function teamHasActiveMatch(teamId) {
    return Object.values(data.activeMatches)
        .some(match =>
            match &&
            !match.finished &&
            (
                String(match.team1) === String(teamId) ||
                String(match.team2) === String(teamId)
            )
        );
}

// ============================================================
// EMBEDS
// ============================================================

function errorEmbed(text) {
    return new EmbedBuilder()
        .setColor(0xE74C3C)
        .setDescription(text)
        .setTimestamp();
}

function successEmbed(title, text) {
    return new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle(title)
        .setDescription(text)
        .setTimestamp();
}

// ============================================================
// REGISTRATION
// ============================================================

async function registerPlayer(
    guild,
    target,
    nickname,
    type,
    executor
) {
    if (!isKayitYetkilisi(executor)) {
        return {
            ok: false,
            message: "❌ Bu işlemi yalnızca Kayıt Yetkilisi yapabilir.",
        };
    }

    if (!target || target.user.bot) {
        return {
            ok: false,
            message: "❌ Geçerli bir oyuncu seçmelisin.",
        };
    }

    if (!nickname || nickname.trim().length < 1) {
        return {
            ok: false,
            message: "❌ Takma ad belirtilmedi.",
        };
    }

    const newNickname = nickname.trim();

    if (newNickname.length > 32) {
        return {
            ok: false,
            message: "❌ Takma ad 32 karakterden uzun olamaz.",
        };
    }

    let selectedRoleId;

    if (type === "futbolcu") {
        selectedRoleId = CONFIG.roles.futbolcu;
    }

    if (type === "kaleci") {
        selectedRoleId = CONFIG.roles.kaleci;
    }

    if (type === "td") {
        selectedRoleId = CONFIG.roles.teknikDirektor;
    }

    if (!selectedRoleId) {
        return {
            ok: false,
            message: "❌ Geçersiz kayıt türü.",
        };
    }

    try {
        const removeRoles = [
            CONFIG.roles.kayitsiz,
            CONFIG.roles.futbolcu,
            CONFIG.roles.kaleci,
            CONFIG.roles.teknikDirektor,
        ].filter(Boolean);

        await target.roles.remove(removeRoles);

        await target.roles.add(selectedRoleId);

        await target.setNickname(newNickname);

        const user = getUser(target.id);

        if (!numeric(user.value)) {
            const parsed = extractValueFromNickname(newNickname);
            user.value = parsed === null ? 0 : parsed;
        }

        user.training = 0;
        user.registered = true;
        user.registrationType = type;

        saveData();

        return {
            ok: true,
            nickname: newNickname,
            roleId: selectedRoleId,
        };
    } catch (error) {
        console.error("REGISTRATION ERROR:", error);

        return {
            ok: false,
            message:
                "❌ Kayıt yapılamadı. Botun rol sırasını, Takma Adları Yönet ve Rolleri Yönet yetkilerini kontrol et.",
        };
    }
}

// ============================================================
// REGISTRATION PANEL
// ============================================================

function registrationPanel() {
    const embed = new EmbedBuilder()
        .setTitle("📋 Axera League Kayıt Paneli")
        .setDescription(
            [
                "Kayıt işlemini gerçekleştirmek için aşağıdaki seçeneklerden birini seç.",
                "",
                "⚽ **Futbolcu**",
                "🧤 **Kaleci**",
                "📋 **Teknik Direktör**",
                "",
                "🔒 Bu paneli yalnızca **Kayıt Yetkilisi** kullanabilir.",
            ].join("\n")
        )
        .setFooter({
            text: "Axera League • Kayıt Sistemi",
        })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("register_futbolcu")
            .setLabel("Futbolcu")
            .setEmoji("⚽")
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId("register_kaleci")
            .setLabel("Kaleci")
            .setEmoji("🧤")
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId("register_td")
            .setLabel("Teknik Direktör")
            .setEmoji("📋")
            .setStyle(ButtonStyle.Secondary)
    );

    return {
        embeds: [embed],
        components: [row],
    };
}

// ============================================================
// TRAINING
// ============================================================

async function trainingCommand(message) {
    if (!requireChannel(
        message,
        CONFIG.channels.antrenman,
        "Antrenman"
    )) return;

    if (!isRegistered(message.member)) {
        return message.reply(
            "❌ Kayıtlı oyuncular bu komutu kullanabilir."
        );
    }

    const user = getUser(message.author.id);

    user.training = Number(user.training) || 0;

    if (user.training >= 5) {
        user.training = 0;
    }

    user.training++;

    if (user.training < 5) {
        saveData();

        const progress = "🟩".repeat(user.training) +
            "⬜".repeat(5 - user.training);

        return message.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x3498DB)
                    .setTitle("⚽ Antrenman")
                    .setDescription(
                        [
                            `${message.author} antrenmanını yaptı.`,
                            "",
                            `📊 İlerleme: **${user.training}/5**`,
                            progress,
                            "",
                            "🏆 5/5 olduğunda otomatik olarak **+5M€ değer** kazanırsın.",
                        ].join("\n")
                    )
                    .setTimestamp(),
            ],
        });
    }

    const result = await changePlayerValue(
        message.member,
        CONFIG.trainingReward * 1_000_000
    );

    if (!result.ok) {
        user.training = 4;
        saveData();

        return message.reply(
            result.message +
            "\n\n⚠️ Ödül kaybolmadı. Antrenman ilerlemen **4/5** olarak korundu."
        );
    }

    user.training = 0;
    saveData();

    return message.reply({
        embeds: [
            successEmbed(
                "🏆 Antrenman Tamamlandı!",
                [
                    `${message.author} antrenmanı tamamladı.`,
                    "",
                    `💰 Değer: **${formatMoney(result.oldValue)} → ${formatMoney(result.newValue)}**`,
                    `🎁 Ödül: **+${CONFIG.trainingReward}M€**`,
                    "",
                    "📊 Antrenman ilerlemesi sıfırlandı.",
                ].join("\n")
            ),
        ],
    });
}

// ============================================================
// PENALTY
// ============================================================

async function penaltyCommand(message) {
    if (!requireChannel(
        message,
        CONFIG.channels.penalti,
        "Penaltı"
    )) return;

    if (!isRegistered(message.member)) {
        return message.reply(
            "❌ Kayıtlı oyuncular bu komutu kullanabilir."
        );
    }

    const roll = Math.random();

    let result;

    // Gol oranı yükseltildi.
    if (roll < 0.50) {
        result = "goal";
    } else if (roll < 0.75) {
        result = "post";
    } else {
        result = "save";
    }

    if (result === "goal") {
        const reward = await changePlayerValue(
            message.member,
            CONFIG.penaltyReward * 1_000_000
        );

        if (!reward.ok) {
            return message.reply(
                reward.message
            );
        }

        return message.reply({
            embeds: [
                successEmbed(
                    "⚽ PENALTI — GOOOOL!",
                    [
                        `🎯 ${message.author} penaltıyı gole çevirdi!`,
                        "",
                        "🥅 Sonuç: **GOL**",
                        `💰 Otomatik değer ödülü: **+${CONFIG.penaltyReward}M€**`,
                        `📈 Yeni değer: **${formatMoney(reward.newValue)}**`,
                    ].join("\n")
                ),
            ],
        });
    }

    if (result === "post") {
        return message.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xF1C40F)
                    .setTitle("🥅 PENALTI")
                    .setDescription(
                        `${message.author} vurdu...\n\n💥 **DİREK!**\n\n💰 Değer ödülü verilmedi.`
                    )
                    .setTimestamp(),
            ],
        });
    }

    return message.reply({
        embeds: [
            new EmbedBuilder()
                .setColor(0x95A5A6)
                .setTitle("🧤 PENALTI")
                .setDescription(
                    `${message.author} vurdu...\n\n🧤 **Axera Kalecisi kurtardı!**\n\n💰 Değer ödülü verilmedi.`
                )
                .setTimestamp(),
        ],
    });
}

// ============================================================
// SEARCH
// ============================================================

async function searchCommand(message, args) {
    const query = args.join(" ").trim();

    if (!query) {
        return message.reply(
            "❌ Kullanım: `.ara oyuncu`"
        );
    }

    await message.guild.members.fetch();

    const result = findClosestRegisteredMember(
        message.guild,
        query
    );

    if (!result) {
        return message.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x95A5A6)
                    .setTitle("🔎 Oyuncu Arama")
                    .setDescription(
                        `**${query}** için kayıtlı oyuncu bulunamadı.\n\n⚪ **DURUM:** BOŞ`
                    )
                    .setTimestamp(),
            ],
        });
    }

    const member = result.member;

    // Güvenlik filtresi tekrar uygulanır.
    if (
        member.user.bot ||
        isUnregistered(member)
    ) {
        return message.reply(
            "⚪ Bu isimle kayıtlı oyuncu bulunamadı."
        );
    }

    const value = getMemberValue(member);

    const embed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle("🔎 Oyuncu Arama")
        .addFields(
            {
                name: "🔍 Aranan",
                value: query,
                inline: true,
            },
            {
                name: "👤 Oyuncu",
                value: `${member}`,
                inline: true,
            },
            {
                name: "🏷️ Takma Ad",
                value: member.nickname || member.user.username,
                inline: false,
            },
            {
                name: "💰 Değer",
                value: formatMoney(value),
                inline: true,
            },
            {
                name: "🟢 Durum",
                value: "Kayıtlı",
                inline: true,
            }
        )
        .setThumbnail(member.displayAvatarURL())
        .setTimestamp();

    return message.reply({
        embeds: [embed],
    });
}

// ============================================================
// VALUE COMMANDS
// ============================================================

async function valueCommand(message, args, remove = false) {
    if (!isDegerYetkilisi(message.member)) {
        return message.reply(
            "❌ Bu komutu yalnızca Değer Yetkilisi kullanabilir."
        );
    }

    const targetId = mentionToId(args[0]);

    if (!targetId) {
        return message.reply(
            `❌ Kullanım: \`.${remove ? "dsil" : "dver"} @Oyuncu miktar\``
        );
    }

    const amount = parseMillionNumber(args[1]);

    if (!Number.isFinite(amount) || amount <= 0) {
        return message.reply(
            "❌ Miktar sayı olmalıdır. Örnek: `.dver @Oyuncu 5`"
        );
    }

    const target = await message.guild.members
        .fetch(targetId)
        .catch(() => null);

    if (!target) {
        return message.reply(
            "❌ Oyuncu bulunamadı."
        );
    }

    const amountMoney = amount * 1_000_000;

    const result = await changePlayerValue(
        target,
        remove ? -amountMoney : amountMoney
    );

    if (!result.ok) {
        return message.reply(
            result.message
        );
    }

    return message.reply({
        embeds: [
            successEmbed(
                remove ? "💸 Değer Silindi" : "💰 Değer Verildi",
                [
                    `👤 Oyuncu: ${target}`,
                    "",
                    `📉 Eski değer: **${formatMoney(result.oldValue)}**`,
                    `💵 Değişim: **${remove ? "-" : "+"}${amount}M€**`,
                    `📈 Yeni değer: **${formatMoney(result.newValue)}**`,
                    "",
                    "🔒 Oyuncunun diğer bilgileri ve rolleri değiştirilmedi.",
                ].join("\n")
            ),
        ],
    });
}

// ============================================================
// BUDGET
// ============================================================

async function budgetCommand(message, args) {
    const targetId = mentionToId(args[0]);

    if (!targetId) {
        const user = getUser(message.author.id);

        return message.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xF1C40F)
                    .setTitle("💰 Bütçen")
                    .setDescription(
                        `👤 ${message.author}\n\n💵 **${formatMoney(user.budget)}**`
                    )
                    .setTimestamp(),
            ],
        });
    }

    const target = await message.guild.members
        .fetch(targetId)
        .catch(() => null);

    if (!target) {
        return message.reply(
            "❌ Oyuncu bulunamadı."
        );
    }

    const user = getUser(target.id);

    return message.reply({
        embeds: [
            new EmbedBuilder()
                .setColor(0xF1C40F)
                .setTitle("💰 Oyuncu Bütçesi")
                .setDescription(
                    `${target}\n\n💵 **${formatMoney(user.budget)}**`
                )
                .setTimestamp(),
        ],
    });
}

async function sendMoneyCommand(message, args) {
    const targetId = mentionToId(args[0]);
    const amount = parseMoney(args[1]);

    if (!targetId || !Number.isFinite(amount) || amount <= 0) {
        return message.reply(
            "❌ Kullanım: `.gönder @Oyuncu 50M`"
        );
    }

    if (targetId === message.author.id) {
        return message.reply(
            "❌ Kendine para gönderemezsin."
        );
    }

    const target = await message.guild.members
        .fetch(targetId)
        .catch(() => null);

    if (!target || target.user.bot) {
        return message.reply(
            "❌ Geçerli bir oyuncu bulunamadı."
        );
    }

    const sender = getUser(message.author.id);
    const receiver = getUser(target.id);

    if (sender.budget < amount) {
        return message.reply(
            `❌ Yetersiz bütçe.\n💰 Mevcut bütçen: **${formatMoney(sender.budget)}**`
        );
    }

    sender.budget -= amount;
    receiver.budget += amount;

    saveData();

    return message.reply({
        embeds: [
            successEmbed(
                "💸 Para Gönderildi",
                [
                    `👤 Alıcı: ${target}`,
                    `💰 Miktar: **${formatMoney(amount)}**`,
                    `📊 Kalan bütçen: **${formatMoney(sender.budget)}**`,
                ].join("\n")
            ),
        ],
    });
}

async function staffMoneyCommand(
    message,
    args,
    mode
) {
    if (!isDegerYetkilisi(message.member)) {
        return message.reply(
            "❌ Bu komutu yalnızca Değer Yetkilisi kullanabilir."
        );
    }

    const targetId = mentionToId(args[0]);

    if (!targetId) {
        return message.reply(
            "❌ Oyuncuyu etiketlemelisin."
        );
    }

    const amount = parseMoney(args[1]);

    if (!Number.isFinite(amount) || amount < 0) {
        return message.reply(
            "❌ Geçerli bir miktar yazmalısın."
        );
    }

    const target = await message.guild.members
        .fetch(targetId)
        .catch(() => null);

    if (!target) {
        return message.reply(
            "❌ Oyuncu bulunamadı."
        );
    }

    const user = getUser(target.id);

    if (mode === "add") {
        user.budget += amount;
    }

    if (mode === "remove") {
        user.budget = Math.max(
            0,
            user.budget - amount
        );
    }

    if (mode === "set") {
        user.budget = amount;
    }

    saveData();

    return message.reply({
        embeds: [
            successEmbed(
                "💰 Bütçe Güncellendi",
                [
                    `👤 Oyuncu: ${target}`,
                    `💵 Yeni bütçe: **${formatMoney(user.budget)}**`,
                ].join("\n")
            ),
        ],
    });
}

// ============================================================
// TEAM
// ============================================================

async function addTeamCommand(message, args) {
    if (!isMacYetkilisi(message.member)) {
        return message.reply(
            "❌ Bu komutu yalnızca Maç Yetkilisi kullanabilir."
        );
    }

    const roleId = mentionToId(args[0]);

    if (!roleId) {
        return message.reply(
            "❌ Takım rolünü etiketlemelisin."
        );
    }

    const role = message.guild.roles.cache.get(roleId);

    if (!role) {
        return message.reply(
            "❌ Takım rolü bulunamadı."
        );
    }

    if (teamExists(roleId)) {
        return message.reply(
            "❌ Bu takım zaten sisteme kayıtlı."
        );
    }

    data.teams[roleId] = {
        id: roleId,
        value: 0,
        squad: [],
        formation: "4-4-2",
    };

    data.standings[roleId] = {
        O: 0,
        G: 0,
        B: 0,
        M: 0,
        AG: 0,
        YG: 0,
        AV: 0,
        P: 0,
    };

    saveData();

    await updateStandingsMessage(message.guild);

    return message.reply({
        embeds: [
            successEmbed(
                "⚽ Takım Eklendi",
                `${role} takımı Axera League sistemine eklendi.`
            ),
        ],
    });
}

async function removeTeamCommand(message, args) {
    if (!isMacYetkilisi(message.member)) {
        return message.reply(
            "❌ Bu komutu yalnızca Maç Yetkilisi kullanabilir."
        );
    }

    const roleId = mentionToId(args[0]);

    if (!roleId) {
        return message.reply(
            "❌ Takım rolünü etiketlemelisin."
        );
    }

    if (!teamExists(roleId)) {
        return message.reply(
            "❌ Bu takım sistemde bulunmuyor."
        );
    }

    if (teamHasActiveMatch(roleId)) {
        return message.reply(
            "❌ Takım aktif bir maçta olduğu için kaldırılamaz."
        );
    }

    delete data.teams[roleId];
    delete data.standings[roleId];
    delete data.formations[roleId];

    for (const fixture of data.fixtures) {
        if (
            String(fixture.team1) === String(roleId) ||
            String(fixture.team2) === String(roleId)
        ) {
            if (
                fixture.status === "BEKLIYOR"
            ) {
                fixture.status = "HATALI";
            }
        }
    }

    saveData();

    await updateStandingsMessage(message.guild);

    return message.reply(
        "✅ Takım sistemden kaldırıldı."
    );
}

async function teamValueCommand(message, args) {
    if (!isMacYetkilisi(message.member)) {
        return message.reply(
            "❌ Bu komutu yalnızca Maç Yetkilisi kullanabilir."
        );
    }

    const roleId = mentionToId(args[0]);
    const amount = parseMillionNumber(args[1]);

    if (!roleId || !Number.isFinite(amount) || amount < 0) {
        return message.reply(
            "❌ Kullanım: `.takımdeğer @Takım 850`"
        );
    }

    if (!teamExists(roleId)) {
        return message.reply(
            "❌ Takım sistemde bulunmuyor."
        );
    }

    const team = getTeam(roleId);

    team.value = amount * 1_000_000;

    saveData();

    return message.reply(
        `✅ ${getRoleMention(roleId)} takımının temel değeri **${amount}M€** olarak ayarlandı.\n💰 Toplam güncel değer: **${formatMoney(getTeamTotalValue(message.guild, roleId))}**`
    );
}

// ============================================================
// SQUAD
// ============================================================

const VALID_POSITIONS = [
    "KL",
    "STP",
    "SĞB",
    "SLB",
    "MO",
    "MOO",
    "SĞK",
    "SLK",
    "SNT",
];

async function addSquadCommand(message, args) {
    if (!isMacYetkilisi(message.member)) {
        return message.reply(
            "❌ Bu komutu yalnızca Maç Yetkilisi kullanabilir."
        );
    }

    const teamId = mentionToId(args[0]);
    const playerId = mentionToId(args[1]);
    const position = String(args[2] || "")
        .toLocaleUpperCase("tr-TR");

    if (
        !teamId ||
        !playerId ||
        !VALID_POSITIONS.includes(position)
    ) {
        return message.reply(
            "❌ Kullanım: `.kadroekle @Takım @Oyuncu Pozisyon`\n\nPozisyonlar: " +
            VALID_POSITIONS.join(", ")
        );
    }

    if (!teamExists(teamId)) {
        return message.reply(
            "❌ Takım sistemde bulunmuyor."
        );
    }

    const player = await message.guild.members
        .fetch(playerId)
        .catch(() => null);

    if (!player || !isRegistered(player)) {
        return message.reply(
            "❌ Bu oyuncu kayıtlı değil."
        );
    }

    const team = getTeam(teamId);

    const existing = team.squad.find(
        x => String(x) === String(playerId)
    );

    if (existing) {
        return message.reply(
            "❌ Bu oyuncu zaten bu kadroda."
        );
    }

    team.squad.push(playerId);

    if (!data.playerPositions) {
        data.playerPositions = {};
    }

    if (!data.playerPositions[teamId]) {
        data.playerPositions[teamId] = {};
    }

    data.playerPositions[teamId][playerId] = position;

    saveData();

    return message.reply({
        embeds: [
            successEmbed(
                "📋 Kadroya Oyuncu Eklendi",
                [
                    `🏟️ Takım: ${getRoleMention(teamId)}`,
                    `👤 Oyuncu: ${player}`,
                    `📍 Pozisyon: **${position}**`,
                    `💰 Değer: **${formatMoney(getMemberValue(player))}**`,
                ].join("\n")
            ),
        ],
    });
}

async function removeSquadCommand(message, args) {
    if (!isMacYetkilisi(message.member)) {
        return message.reply(
            "❌ Bu komutu yalnızca Maç Yetkilisi kullanabilir."
        );
    }

    const teamId = mentionToId(args[0]);
    const playerId = mentionToId(args[1]);

    if (!teamId || !playerId) {
        return message.reply(
            "❌ Kullanım: `.kadrocikar @Takım @Oyuncu`"
        );
    }

    if (!teamExists(teamId)) {
        return message.reply(
            "❌ Takım bulunamadı."
        );
    }

    const team = getTeam(teamId);

    team.squad = team.squad.filter(
        id => String(id) !== String(playerId)
    );

    if (data.playerPositions?.[teamId]) {
        delete data.playerPositions[teamId][playerId];
    }

    saveData();

    return message.reply(
        "✅ Oyuncu kadrodan çıkarıldı."
    );
}

function getPlayerPosition(teamId, playerId) {
    return data.playerPositions?.[teamId]?.[playerId] || "MO";
}

function formatSquadLine(
    position,
    player,
    value
) {
    return `${position.padEnd(3)} │ ${player} │ ${formatMoney(value)}`;
}

async function squadCommand(message, args) {
    const teamId = mentionToId(args[0]);

    if (!teamId) {
        return message.reply(
            "❌ Kullanım: `.kadro @Takım`"
        );
    }

    if (!teamExists(teamId)) {
        return message.reply(
            "❌ Takım sistemde bulunmuyor."
        );
    }

    const team = getTeam(teamId);
    const formation =
        team.formation || "4-4-2";

    const groups = {
        KL: [],
        DEF: [],
        MID: [],
        ATT: [],
    };

    let total = Number(team.value) || 0;

    for (const playerId of team.squad || []) {
        const player = await message.guild.members
            .fetch(playerId)
            .catch(() => null);

        if (!player) continue;

        const position = getPlayerPosition(
            teamId,
            playerId
        );

        const value = getMemberValue(player);

        total += value;

        const line =
            `**${position}** • ${player} • **${formatMoney(value)}**`;

        if (position === "KL") {
            groups.KL.push(line);
        } else if (
            ["STP", "SĞB", "SLB"].includes(position)
        ) {
            groups.DEF.push(line);
        } else if (
            ["MO", "MOO", "SĞK", "SLK"].includes(position)
        ) {
            groups.MID.push(line);
        } else {
            groups.ATT.push(line);
        }
    }

    const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle(`⚽ ${getTeamName(message.guild, teamId)}`)
        .setDescription(
            [
                `📋 **Formasyon:** ${formation}`,
                "",
                "```",
                "━━━━━━━━━━━━━━━━━━━━━━━━",
                "             KALE",
                "━━━━━━━━━━━━━━━━━━━━━━━━",
                "```",
                groups.KL.length
                    ? groups.KL.join("\n")
                    : "— Boş —",
                "",
                "```",
                "━━━━━━━━━━━━━━━━━━━━━━━━",
                "           SAVUNMA",
                "━━━━━━━━━━━━━━━━━━━━━━━━",
                "```",
                groups.DEF.length
                    ? groups.DEF.join("\n")
                    : "— Boş —",
                "",
                "```",
                "━━━━━━━━━━━━━━━━━━━━━━━━",
                "          ORTA SAHA",
                "━━━━━━━━━━━━━━━━━━━━━━━━",
                "```",
                groups.MID.length
                    ? groups.MID.join("\n")
                    : "— Boş —",
                "",
                "```",
                "━━━━━━━━━━━━━━━━━━━━━━━━",
                "           HÜCUM",
                "━━━━━━━━━━━━━━━━━━━━━━━━",
                "```",
                groups.ATT.length
                    ? groups.ATT.join("\n")
                    : "— Boş —",
            ].join("\n")
        )
        .addFields(
            {
                name: "👥 Oyuncu",
                value: String(team.squad.length),
                inline: true,
            },
            {
                name: "💰 Toplam Değer",
                value: formatMoney(total),
                inline: true,
            }
        )
        .setFooter({
            text: "Axera League • Kadro Sistemi",
        })
        .setTimestamp();

    return message.reply({
        embeds: [embed],
    });
}

// ============================================================
// FORMATION
// ============================================================

async function formationCommand(message, args) {
    if (!isMacYetkilisi(message.member)) {
        return message.reply(
            "❌ Bu komutu yalnızca Maç Yetkilisi kullanabilir."
        );
    }

    const teamId = mentionToId(args[0]);

    if (!teamId) {
        return message.reply(
            "❌ Kullanım: `.formasyon @Takım`"
        );
    }

    if (!teamExists(teamId)) {
        return message.reply(
            "❌ Takım sistemde bulunmuyor."
        );
    }

    const menu = new StringSelectMenuBuilder()
        .setCustomId(`formation_${teamId}`)
        .setPlaceholder("Formasyon seç")
        .addOptions(
            Object.keys(CONFIG.formations).map(
                formation => ({
                    label: formation,
                    value: formation,
                    description: `${formation} formasyonunu kullan`,
                })
            )
        );

    return message.reply({
        content: `⚽ ${getRoleMention(teamId)} için formasyon seç:`,
        components: [
            new ActionRowBuilder().addComponents(menu),
        ],
    });
}

// ============================================================
// STANDINGS
// ============================================================

function standingsSort(a, b) {
    if (b.P !== a.P) return b.P - a.P;
    if (b.AV !== a.AV) return b.AV - a.AV;
    if (b.AG !== a.AG) return b.AG - a.AG;
    return a.YG - b.YG;
}

function standingsText(guild) {
    const rows = Object.entries(data.standings)
        .map(([roleId, stats]) => ({
            roleId,
            ...stats,
        }))
        .sort(standingsSort);

    if (!rows.length) {
        return "Henüz sisteme kayıtlı takım bulunmuyor.";
    }

    let text =
        "```text\n" +
        "Sıra Takım                     O   G   B   M   AV   P\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";

    rows.forEach((row, index) => {
        const name = getTeamName(
            guild,
            row.roleId
        ).slice(0, 24);

        text +=
            `${String(index + 1).padEnd(5)}` +
            `${name.padEnd(25)}` +
            `${String(row.O).padEnd(4)}` +
            `${String(row.G).padEnd(4)}` +
            `${String(row.B).padEnd(4)}` +
            `${String(row.M).padEnd(4)}` +
            `${String(row.AV).padEnd(5)}` +
            `${row.P}\n`;
    });

    text += "```";

    return text;
}

async function updateStandingsMessage(guild) {
    const channel = guild.channels.cache.get(
        CONFIG.channels.puan
    );

    if (!channel) return;

    const embed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle("🏆 AXERA LEAGUE PUAN DURUMU")
        .setDescription(
            standingsText(guild)
        )
        .setFooter({
            text: "Axera League • Puan Tablosu",
        })
        .setTimestamp();

    if (data.standingsMessageId) {
        const old = await channel.messages
            .fetch(data.standingsMessageId)
            .catch(() => null);

        if (old) {
            await old.edit({
                embeds: [embed],
            }).catch(() => {});

            return;
        }
    }

    const sent = await channel.send({
        embeds: [embed],
    });

    data.standingsMessageId = sent.id;
    saveData();
}

// ============================================================
// MATCH
// ============================================================

function getSquadPlayers(guild, teamId) {
    const team = getTeam(teamId);

    return (team.squad || [])
        .map(id =>
            guild.members.cache.get(id)
        )
        .filter(member =>
            member &&
            isRegistered(member)
        );
}

function chooseScorer(guild, teamId) {
    const players = getSquadPlayers(
        guild,
        teamId
    );

    if (!players.length) {
        return null;
    }

    return players[
        randomInt(0, players.length - 1)
    ];
}

function matchStrength(guild, teamId) {
    const team = getTeam(teamId);

    const base = Number(team.value) || 0;

    const players = getSquadPlayers(
        guild,
        teamId
    );

    const playerValue = players.reduce(
        (sum, member) =>
            sum + getMemberValue(member),
        0
    );

    return Math.max(
        1,
        (base + playerValue) / 1_000_000
    );
}

function calculateGoals(guild, team1, team2) {
    const strength1 = matchStrength(
        guild,
        team1
    );

    const strength2 = matchStrength(
        guild,
        team2
    );

    const total =
        strength1 + strength2;

    const ratio1 =
        strength1 / total;

    const ratio2 =
        strength2 / total;

    let goals1 = 0;
    let goals2 = 0;

    const goalAttempts =
        randomInt(2, 5);

    for (let i = 0; i < goalAttempts; i++) {
        const side = Math.random() <
            ratio1
            ? 1
            : 2;

        if (side === 1) {
            if (Math.random() < 0.40) {
                goals1++;
            }
        } else {
            if (Math.random() < 0.40) {
                goals2++;
            }
        }
    }

    return {
        goals1: Math.min(goals1, 6),
        goals2: Math.min(goals2, 6),
    };
}

function updateStatsAfterMatch(
    team1,
    team2,
    score1,
    score2
) {
    const s1 = getStandings(team1);
    const s2 = getStandings(team2);

    s1.O++;
    s2.O++;

    s1.AG += score1;
    s1.YG += score2;

    s2.AG += score2;
    s2.YG += score1;

    s1.AV = s1.AG - s1.YG;
    s2.AV = s2.AG - s2.YG;

    if (score1 > score2) {
        s1.G++;
        s2.M++;

        s1.P += 3;
    } else if (score2 > score1) {
        s2.G++;
        s1.M++;

        s2.P += 3;
    } else {
        s1.B++;
        s2.B++;

        s1.P++;
        s2.P++;
    }
}

async function sendMatchEmbed(
    channel,
    match,
    guild,
    minute,
    events
) {
    const team1Name =
        getTeamName(guild, match.team1);

    const team2Name =
        getTeamName(guild, match.team2);

    const eventText =
        events.length
            ? events.slice(-6).join("\n")
            : "Maç başladı.";

    const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle("⚽ AXERA LEAGUE — CANLI MAÇ")
        .setDescription(
            [
                `### ${team1Name} **${match.score1} - ${match.score2}** ${team2Name}`,
                "",
                `⏱️ Dakika: **${minute}'**`,
                "",
                "📢 **Maç Olayları**",
                eventText,
            ].join("\n")
        )
        .setFooter({
            text: "Axera League • Canlı Maç",
        })
        .setTimestamp();

    if (match.messageId) {
        const msg = await channel.messages
            .fetch(match.messageId)
            .catch(() => null);

        if (msg) {
            await msg.edit({
                embeds: [embed],
            }).catch(() => {});
            return;
        }
    }

    const sent = await channel.send({
        embeds: [embed],
    });

    match.messageId = sent.id;
}

async function startMatch(
    guild,
    team1,
    team2,
    fixture = null
) {
    const channel = guild.channels.cache.get(
        CONFIG.channels.mac
    );

    if (!channel) {
        throw new Error("Maç kanalı bulunamadı.");
    }

    if (teamHasActiveMatch(team1)) {
        throw new Error("Takım 1 zaten aktif maçta.");
    }

    if (teamHasActiveMatch(team2)) {
        throw new Error("Takım 2 zaten aktif maçta.");
    }

    const matchId =
        `match_${Date.now()}_${randomInt(1000, 9999)}`;

    const match = {
        id: matchId,
        team1,
        team2,
        score1: 0,
        score2: 0,
        minute: 0,
        startedAt: Date.now(),
        finished: false,
        fixtureId: fixture?.id || null,
        events: [],
        messageId: null,
    };

    data.activeMatches[matchId] = match;

    if (fixture) {
        fixture.status = "BAŞLIYOR";
        fixture.startedAt = Date.now();
    }

    saveData();

    await sendMatchEmbed(
        channel,
        match,
        guild,
        0,
        ["🟢 Maç başladı."]
    );

    const calculated =
        calculateGoals(
            guild,
            team1,
            team2
        );

    const goalMinutes = [];

    for (let i = 0; i < calculated.goals1; i++) {
        goalMinutes.push({
            team: 1,
            minute: randomInt(5, 89),
        });
    }

    for (let i = 0; i < calculated.goals2; i++) {
        goalMinutes.push({
            team: 2,
            minute: randomInt(5, 89),
        });
    }

    goalMinutes.sort(
        (a, b) => a.minute - b.minute
    );

    let goalIndex = 0;

    for (
        let minute = 1;
        minute <= 90;
        minute++
    ) {
        await sleep(3000);

        match.minute = minute;

        while (
            goalIndex < goalMinutes.length &&
            goalMinutes[goalIndex].minute <= minute
        ) {
            const goal =
                goalMinutes[goalIndex];

            const scoringTeam =
                goal.team === 1
                    ? team1
                    : team2;

            const scorer =
                chooseScorer(
                    guild,
                    scoringTeam
                );

            if (goal.team === 1) {
                match.score1++;
            } else {
                match.score2++;
            }

            const scorerName = scorer
                ? scorer.toString()
                : "Oyuncu";

            match.events.push(
                `⚽ **${minute}'** — ${scorerName} gol attı!`
            );

            goalIndex++;
        }

        await sendMatchEmbed(
            channel,
            match,
            guild,
            minute,
            match.events
        );
    }

    match.finished = true;
    match.finishedAt = Date.now();

    updateStatsAfterMatch(
        team1,
        team2,
        match.score1,
        match.score2
    );

    if (fixture) {
        fixture.status = "TAMAMLANDI";
        fixture.score1 = match.score1;
        fixture.score2 = match.score2;
        fixture.finishedAt = Date.now();
    }

    delete data.activeMatches[matchId];

    saveData();

    const winner =
        match.score1 > match.score2
            ? getTeamName(guild, team1)
            : match.score2 > match.score1
                ? getTeamName(guild, team2)
                : "Beraberlik";

    const finalEmbed = new EmbedBuilder()
        .setColor(0xF1C40F)
        .setTitle("🏁 MAÇ TAMAMLANDI")
        .setDescription(
            [
                `### ${getTeamName(guild, team1)} **${match.score1} - ${match.score2}** ${getTeamName(guild, team2)}`,
                "",
                `🏆 **Sonuç:** ${winner}`,
                "",
                match.events.length
                    ? `⚽ **Goller**\n${match.events.join("\n")}`
                    : "⚽ Gol olmadı.",
            ].join("\n")
        )
        .setTimestamp();

    await channel.send({
        embeds: [finalEmbed],
    });

    await updateStandingsMessage(guild);
}

async function matchCommand(message, args) {
    if (!isMacYetkilisi(message.member)) {
        return message.reply(
            "❌ Bu komutu yalnızca Maç Yetkilisi kullanabilir."
        );
    }

    if (!requireChannel(
        message,
        CONFIG.channels.mac,
        "Maç"
    )) return;

    const team1 = mentionToId(args[0]);
    const team2 = mentionToId(args[1]);

    if (!team1 || !team2) {
        return message.reply(
            "❌ Kullanım: `.maç @Takım1 @Takım2`"
        );
    }

    if (team1 === team2) {
        return message.reply(
            "❌ Aynı takım kendisiyle maç yapamaz."
        );
    }

    if (
        !teamExists(team1) ||
        !teamExists(team2)
    ) {
        return message.reply(
            "❌ Takımlardan biri sistemde bulunmuyor."
        );
    }

    if (teamHasActiveMatch(team1)) {
        return message.reply(
            "❌ Takım 1 zaten aktif bir maçta."
        );
    }

    if (teamHasActiveMatch(team2)) {
        return message.reply(
            "❌ Takım 2 zaten aktif bir maçta."
        );
    }

    await message.reply(
        "🟢 Maç başlatılıyor..."
    );

    try {
        await startMatch(
            message.guild,
            team1,
            team2
        );
    } catch (error) {
        console.error(error);

        await message.channel.send(
            `❌ Maç başlatılamadı: ${error.message}`
        );
    }
}

// ============================================================
// FIXTURE
// ============================================================

function parseFixtureDate(dateText, timeText) {
    if (!dateText || !timeText) return null;

    let date;

    if (/^\d{2}\.\d{2}\.\d{4}$/.test(dateText)) {
        const [
            day,
            month,
            year,
        ] = dateText.split(".").map(Number);

        date = new Date(
            `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${timeText}:00+03:00`
        );
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
        date = new Date(
            `${dateText}T${timeText}:00+03:00`
        );
    } else {
        return null;
    }

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date;
}

async function addFixtureCommand(message, args) {
    if (!isMacYetkilisi(message.member)) {
        return message.reply(
            "❌ Bu komutu yalnızca Maç Yetkilisi kullanabilir."
        );
    }

    const team1 = mentionToId(args[0]);
    const team2 = mentionToId(args[1]);

    const dateText = args[2];
    const timeText = args[3];

    if (
        !team1 ||
        !team2 ||
        !dateText ||
        !timeText
    ) {
        return message.reply(
            "❌ Kullanım: `.fiksturekle @Takım1 @Takım2 05.09.2026 20:00`"
        );
    }

    if (
        !teamExists(team1) ||
        !teamExists(team2)
    ) {
        return message.reply(
            "❌ Takımlardan biri sistemde bulunmuyor."
        );
    }

    if (team1 === team2) {
        return message.reply(
            "❌ Aynı takım kendisiyle fikstür oynayamaz."
        );
    }

    const date = parseFixtureDate(
        dateText,
        timeText
    );

    if (!date) {
        return message.reply(
            "❌ Tarih/saat formatı hatalı."
        );
    }

    if (date.getTime() <= Date.now()) {
        return message.reply(
            "❌ Geçmiş bir tarih girilemez."
        );
    }

    const duplicate = data.fixtures.find(
        fixture =>
            fixture.status === "BEKLIYOR" &&
            String(fixture.team1) === String(team1) &&
            String(fixture.team2) === String(team2) &&
            fixture.date === dateText &&
            fixture.time === timeText
    );

    if (duplicate) {
        return message.reply(
            "❌ Bu fikstür zaten kayıtlı."
        );
    }

    const fixture = {
        id: data.nextFixtureId++,
        team1,
        team2,
        date: dateText,
        time: timeText,
        timestamp: date.getTime(),
        status: "BEKLIYOR",
        score1: null,
        score2: null,
        startedAt: null,
        finishedAt: null,
    };

    data.fixtures.push(fixture);

    saveData();

    return message.reply({
        embeds: [
            successEmbed(
                "📅 Fikstür Eklendi",
                [
                    `🏠 ${getRoleMention(team1)}`,
                    `🆚`,
                    `✈️ ${getRoleMention(team2)}`,
                    "",
                    `📅 **${dateText} ${timeText}**`,
                    `🆔 Fikstür: **#${fixture.id}**`,
                    "",
                    "⏰ Saati geldiğinde maç otomatik başlayacaktır.",
                ].join("\n")
            ),
        ],
    });
}

async function fixtureListCommand(message) {
    const fixtures = data.fixtures
        .filter(f => f.status !== "HATALI")
        .sort((a, b) =>
            (a.timestamp || 0) -
            (b.timestamp || 0)
        );

    if (!fixtures.length) {
        return message.reply(
            "📅 Kayıtlı fikstür bulunmuyor."
        );
    }

    const lines = fixtures
        .slice(0, 30)
        .map(fixture => {
            const result =
                fixture.status === "TAMAMLANDI"
                    ? `**${fixture.score1} - ${fixture.score2}**`
                    : "VS";

            return [
                `**#${fixture.id}**`,
                `${getRoleMention(fixture.team1)} ${result} ${getRoleMention(fixture.team2)}`,
                `📅 ${fixture.date} ${fixture.time}`,
                `📌 ${fixture.status}`,
            ].join(" ");
        });

    return message.reply({
        embeds: [
            new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle("📅 AXERA LEAGUE FİKSTÜR")
                .setDescription(lines.join("\n\n"))
                .setTimestamp(),
        ],
    });
}

async function removeFixtureCommand(message, args) {
    if (!isMacYetkilisi(message.member)) {
        return message.reply(
            "❌ Bu komutu yalnızca Maç Yetkilisi kullanabilir."
        );
    }

    const team1 = mentionToId(args[0]);
    const team2 = mentionToId(args[1]);

    if (!team1 || !team2) {
        return message.reply(
            "❌ Kullanım: `.fiksturcikar @Takım1 @Takım2 [tarih] [saat]`"
        );
    }

    const candidates = data.fixtures.filter(
        fixture =>
            fixture.status === "BEKLIYOR" &&
            (
                (
                    String(fixture.team1) === String(team1) &&
                    String(fixture.team2) === String(team2)
                ) ||
                (
                    String(fixture.team1) === String(team2) &&
                    String(fixture.team2) === String(team1)
                )
            )
    );

    if (!candidates.length) {
        return message.reply(
            "❌ Bekleyen fikstür bulunamadı."
        );
    }

    if (
        candidates.length > 1 &&
        (!args[2] || !args[3])
    ) {
        return message.reply(
            "❌ Bu takımların birden fazla fikstürü var. Tarih ve saat de belirt."
        );
    }

    let target = candidates[0];

    if (candidates.length > 1) {
        target =
            candidates.find(
                f =>
                    f.date === args[2] &&
                    f.time === args[3]
            ) || null;

        if (!target) {
            return message.reply(
                "❌ Belirtilen tarih ve saatte fikstür bulunamadı."
            );
        }
    }

    target.status = "HATALI";

    saveData();

    return message.reply(
        `✅ **#${target.id}** numaralı fikstür kaldırıldı.`
    );
}

async function processFixtures() {
    for (const guild of client.guilds.cache.values()) {
        const now = Date.now();

        const pending = data.fixtures.filter(
            fixture =>
                fixture.status === "BEKLIYOR" &&
                Number.isFinite(fixture.timestamp) &&
                fixture.timestamp <= now
        );

        for (const fixture of pending) {
            if (
                teamHasActiveMatch(fixture.team1) ||
                teamHasActiveMatch(fixture.team2)
            ) {
                continue;
            }

            fixture.status = "BAŞLIYOR";
            saveData();

            try {
                await startMatch(
                    guild,
                    fixture.team1,
                    fixture.team2,
                    fixture
                );
            } catch (error) {
                console.error(
                    "FIXTURE START ERROR:",
                    error
                );

                fixture.status = "HATA";
                saveData();
            }
        }
    }
}

// ============================================================
// CUP / MUSEUM
// ============================================================

function getCups(teamId) {
    if (!data.cups[teamId]) {
        data.cups[teamId] = [];
    }

    return data.cups[teamId];
}

async function addCupCommand(message, args) {
    if (!isMacYetkilisi(message.member)) {
        return message.reply(
            "❌ Bu komutu yalnızca Maç Yetkilisi kullanabilir."
        );
    }

    const teamId = mentionToId(args[0]);
    const cupName = args.slice(1).join(" ").trim();

    if (!teamId || !cupName) {
        return message.reply(
            "❌ Kullanım: `.kupaekle @Takım Kupa Adı`"
        );
    }

    if (!teamExists(teamId)) {
        return message.reply(
            "❌ Takım sistemde bulunmuyor."
        );
    }

    const cups = getCups(teamId);

    cups.push({
        id: Date.now(),
        name: cupName,
        date: new Date().toISOString(),
    });

    saveData();

    return message.reply(
        `🏆 ${getRoleMention(teamId)} müzesine **${cupName}** eklendi.`
    );
}

async function removeCupCommand(message, args) {
    if (!isMacYetkilisi(message.member)) {
        return message.reply(
            "❌ Bu komutu yalnızca Maç Yetkilisi kullanabilir."
        );
    }

    const teamId = mentionToId(args[0]);
    const cupName = args.slice(1).join(" ").trim();

    if (!teamId || !cupName) {
        return message.reply(
            "❌ Kullanım: `.kupasil @Takım Kupa Adı`"
        );
    }

    const cups = getCups(teamId);

    const index = cups.findIndex(
        cup =>
            normalizeText(cup.name) ===
            normalizeText(cupName)
    );

    if (index === -1) {
        return message.reply(
            "❌ Bu kupa takımın müzesinde bulunamadı."
        );
    }

    const removed = cups.splice(
        index,
        1
    )[0];

    saveData();

    return message.reply(
        `🗑️ **${removed.name}** müzeden kaldırıldı.`
    );
}

async function museumCommand(message, args) {
    const teamId = mentionToId(args[0]);

    if (!teamId) {
        return message.reply(
            "❌ Kullanım: `.müze @Takım`"
        );
    }

    if (!teamExists(teamId)) {
        return message.reply(
            "❌ Takım sistemde bulunmuyor."
        );
    }

    const cups = getCups(teamId);

    const cupText = cups.length
        ? cups.map(
            (cup, index) =>
                `🏆 **${index + 1}.** ${cup.name}`
        ).join("\n")
        : "🏆 Henüz kazanılmış kupa bulunmuyor.";

    const embed = new EmbedBuilder()
        .setColor(0xF1C40F)
        .setTitle(`🏛️ ${getTeamName(message.guild, teamId)} Müzesi`)
        .setDescription(
            [
                "### 🏆 Kupa Koleksiyonu",
                "",
                cupText,
                "",
                `📊 **Toplam Kupa:** ${cups.length}`,
            ].join("\n")
        )
        .setFooter({
            text: "Axera League • Müze Sistemi",
        })
        .setTimestamp();

    return message.reply({
        embeds: [embed],
    });
}

// ============================================================
// ASSIST KING
// ============================================================

async function assistKingCommand(message) {
    const players = [];

    for (const [userId, user] of Object.entries(data.users)) {
        const assists = Number(user.assists) || 0;

        if (assists <= 0) continue;

        const member = await message.guild.members
            .fetch(userId)
            .catch(() => null);

        if (!member || !isRegistered(member)) continue;

        players.push({
            member,
            assists,
        });
    }

    players.sort(
        (a, b) => b.assists - a.assists
    );

    if (!players.length) {
        return message.reply(
            "🏅 Henüz asist kaydı bulunmuyor."
        );
    }

    const text = players
        .slice(0, 10)
        .map(
            (p, i) =>
                `**${i + 1}.** ${p.member} — **${p.assists} asist**`
        )
        .join("\n");

    return message.reply({
        embeds: [
            new EmbedBuilder()
                .setColor(0xF1C40F)
                .setTitle("👟 ASİST KRALI")
                .setDescription(text)
                .setTimestamp(),
        ],
    });
}

// ============================================================
// TWEET
// ============================================================

async function tweetCommand(message, args) {
    const text = args.join(" ").trim();

    if (!text) {
        return message.reply(
            "❌ Kullanım: `.tweet mesaj`"
        );
    }

    const embed = new EmbedBuilder()
        .setColor(0x1DA1F2)
        .setAuthor({
            name:
                message.member.displayName ||
                message.author.username,
            iconURL:
                message.author.displayAvatarURL(),
        })
        .setDescription(text)
        .setFooter({
            text: "Axera League • Tweet",
        })
        .setTimestamp();

    return message.channel.send({
        embeds: [embed],
    });
}

// ============================================================
// MODERATION
// ============================================================

async function clearCommand(message, args) {
    if (!isAdmin(message.member)) {
        return message.reply(
            "❌ Bu komutu yalnızca Yönetici kullanabilir."
        );
    }

    const amount = Number(args[0]);

    if (
        !Number.isInteger(amount) ||
        amount < 1 ||
        amount > 1000
    ) {
        return message.reply(
            "❌ `.sil` miktarı 1 ile 1000 arasında olmalıdır."
        );
    }

    try {
        const deleted =
            await message.channel.bulkDelete(
                amount,
                true
            );

        const reply =
            await message.channel.send(
                `🗑️ **${deleted.size}** mesaj silindi.`
            );

        setTimeout(
            () => reply.delete().catch(() => {}),
            5000
        );
    } catch {
        return message.reply(
            "❌ Mesajlar silinemedi."
        );
    }
}

async function embedCommand(message, args) {
    if (!isAdmin(message.member)) {
        return message.reply(
            "❌ Bu komutu yalnızca Yönetici kullanabilir."
        );
    }

    const raw = args.join(" ");

    const parts = raw
        .split("|")
        .map(x => x.trim());

    const title = parts[0] || "Axera League";
    const description =
        parts.slice(1).join(" | ") ||
        " ";

    const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();

    await message.channel.send({
        embeds: [embed],
    });

    await message.delete().catch(() => {});
}

async function kickCommand(message, args) {
    if (!isAdmin(message.member)) {
        return message.reply(
            "❌ Bu komutu yalnızca Yönetici kullanabilir."
        );
    }

    const targetId = mentionToId(args[0]);

    if (!targetId) {
        return message.reply(
            "❌ Oyuncuyu etiketlemelisin."
        );
    }

    const target =
        await message.guild.members
            .fetch(targetId)
            .catch(() => null);

    if (!target) {
        return message.reply(
            "❌ Oyuncu bulunamadı."
        );
    }

    await target.kick().catch(() => null);

    return message.reply(
        `👢 ${target.user.tag} sunucudan atıldı.`
    );
}

async function banCommand(message, args) {
    if (!isAdmin(message.member)) {
        return message.reply(
            "❌ Bu komutu yalnızca Yönetici kullanabilir."
        );
    }

    const targetId = mentionToId(args[0]);

    if (!targetId) {
        return message.reply(
            "❌ Oyuncuyu etiketlemelisin."
        );
    }

    const target =
        await message.guild.members
            .fetch(targetId)
            .catch(() => null);

    if (!target) {
        return message.reply(
            "❌ Oyuncu bulunamadı."
        );
    }

    await target.ban().catch(() => null);

    return message.reply(
        `🔨 ${target.user.tag} sunucudan yasaklandı.`
    );
}

async function muteCommand(message, args) {
    if (!isAdmin(message.member)) {
        return message.reply(
            "❌ Bu komutu yalnızca Yönetici kullanabilir."
        );
    }

    const targetId = mentionToId(args[0]);

    if (!targetId) {
        return message.reply(
            "❌ Oyuncuyu etiketlemelisin."
        );
    }

    const target =
        await message.guild.members
            .fetch(targetId)
            .catch(() => null);

    if (!target) {
        return message.reply(
            "❌ Oyuncu bulunamadı."
        );
    }

    try {
        await target.timeout(
            10 * 60 * 1000,
            "Axera League mute"
        );

        return message.reply(
            `🔇 ${target} 10 dakika susturuldu.`
        );
    } catch {
        return message.reply(
            "❌ Oyuncu susturulamadı."
        );
    }
}

async function unmuteCommand(message, args) {
    if (!isAdmin(message.member)) {
        return message.reply(
            "❌ Bu komutu yalnızca Yönetici kullanabilir."
        );
    }

    const targetId = mentionToId(args[0]);

    if (!targetId) {
        return message.reply(
            "❌ Oyuncuyu etiketlemelisin."
        );
    }

    const target =
        await message.guild.members
            .fetch(targetId)
            .catch(() => null);

    if (!target) {
        return message.reply(
            "❌ Oyuncu bulunamadı."
        );
    }

    try {
        await target.timeout(
            null,
            "Axera League unmute"
        );

        return message.reply(
            `🔊 ${target} susturması kaldırıldı.`
        );
    } catch {
        return message.reply(
            "❌ Susturma kaldırılamadı."
        );
    }
}

// ============================================================
// TARGETED DM
// ============================================================

async function dmCommand(message, args) {
    if (!isAdmin(message.member)) {
        return message.reply(
            "❌ Bu komutu yalnızca Yönetici kullanabilir."
        );
    }

    const targetId = mentionToId(args[0]);
    const text = args.slice(1).join(" ").trim();

    if (!targetId || !text) {
        return message.reply(
            "❌ Kullanım: `.dm @Oyuncu mesaj`"
        );
    }

    const target =
        await message.guild.members
            .fetch(targetId)
            .catch(() => null);

    if (!target) {
        return message.reply(
            "❌ Oyuncu bulunamadı."
        );
    }

    try {
        const embed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle("📩 Axera League")
            .setDescription(text)
            .setFooter({
                text: `Gönderen: ${message.guild.name}`,
            })
            .setTimestamp();

        await target.send({
            embeds: [embed],
        });

        return message.reply(
            `✅ ${target} kişisine DM gönderildi.`
        );
    } catch {
        return message.reply(
            "❌ Bu oyuncuya DM gönderilemedi."
        );
    }
}

// ============================================================
// CHANNEL LOCK
// ============================================================

async function lockCommand(message) {
    if (!isAdmin(message.member)) {
        return message.reply(
            "❌ Bu komutu yalnızca Yönetici kullanabilir."
        );
    }

    await message.channel.permissionOverwrites.edit(
        message.guild.roles.everyone,
        {
            SendMessages: false,
        }
    );

    return message.reply(
        "🔒 Kanal kilitlendi."
    );
}

async function unlockCommand(message) {
    if (!isAdmin(message.member)) {
        return message.reply(
            "❌ Bu komutu yalnızca Yönetici kullanabilir."
        );
    }

    await message.channel.permissionOverwrites.edit(
        message.guild.roles.everyone,
        {
            SendMessages: null,
        }
    );

    return message.reply(
        "🔓 Kanal açıldı."
    );
}

// ============================================================
// TICKET
// ============================================================

function ticketPanel() {
    const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle("🎫 Axera League Destek")
        .setDescription(
            [
                "Destek almak için aşağıdaki butona bas.",
                "",
                "🎫 **Ticket Aç**",
                "",
                "Ticket kanalını yalnızca sen ve yetkililer görebilir.",
            ].join("\n")
        )
        .setFooter({
            text: "Axera League • Ticket Sistemi",
        })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("create_ticket")
            .setLabel("Ticket Aç")
            .setEmoji("🎫")
            .setStyle(ButtonStyle.Primary)
    );

    return {
        embeds: [embed],
        components: [row],
    };
}

async function createTicket(interaction) {
    const guild = interaction.guild;
    const userId = interaction.user.id;

    const existing = Object.values(data.tickets)
        .find(
            ticket =>
                ticket.guildId === guild.id &&
                ticket.userId === userId &&
                ticket.open === true
        );

    if (existing) {
        return interaction.reply({
            content:
                `❌ Zaten açık bir ticketın var: <#${existing.channelId}>`,
            ephemeral: true,
        });
    }

    const channel = await guild.channels.create({
        name:
            `ticket-${interaction.user.username}`
                .toLowerCase()
                .replace(/[^a-z0-9-]/g, "")
                .slice(0, 20) ||
            `ticket-${userId.slice(-4)}`,

        type: ChannelType.GuildText,

        permissionOverwrites: [
            {
                id: guild.roles.everyone.id,
                deny: [
                    PermissionsBitField.Flags.ViewChannel,
                ],
            },
            {
                id: userId,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory,
                ],
            },
            {
                id: CONFIG.roles.kayitYetkilisi,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory,
                ],
            },
            {
                id: CONFIG.roles.macYetkilisi,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory,
                ],
            },
        ],
    });

    const ticketId =
        `ticket_${Date.now()}_${userId}`;

    data.tickets[ticketId] = {
        id: ticketId,
        guildId: guild.id,
        channelId: channel.id,
        userId,
        open: true,
        lastMessageAt: Date.now(),
        createdAt: Date.now(),
    };

    saveData();

    const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle("🎫 Ticket")
        .setDescription(
            [
                `👤 Oluşturan: <@${userId}>`,
                "",
                "Sorununuzu bu kanalda yazabilirsiniz.",
                "",
                "🔒 Ticketı kapatmak için aşağıdaki butonu kullanın.",
            ].join("\n")
        )
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`close_ticket_${ticketId}`)
            .setLabel("Ticket Kapat")
            .setEmoji("🔒")
            .setStyle(ButtonStyle.Danger)
    );

    await channel.send({
        content: `<@${userId}>`,
        embeds: [embed],
        components: [row],
    });

    return interaction.reply({
        content: `✅ Ticket oluşturuldu: ${channel}`,
        ephemeral: true,
    });
}

async function closeTicket(interaction, ticketId) {
    const ticket = data.tickets[ticketId];

    if (!ticket || !ticket.open) {
        return interaction.reply({
            content: "❌ Ticket zaten kapalı.",
            ephemeral: true,
        });
    }

    const allowed =
        interaction.user.id === ticket.userId ||
        isAdmin(interaction.member) ||
        isKayitYetkilisi(interaction.member) ||
        isMacYetkilisi(interaction.member);

    if (!allowed) {
        return interaction.reply({
            content:
                "❌ Bu ticketı kapatmaya yetkin yok.",
            ephemeral: true,
        });
    }

    ticket.open = false;
    ticket.closedAt = Date.now();

    saveData();

    await interaction.reply(
        "🔒 Ticket kapatılıyor..."
    );

    setTimeout(
        () => {
            interaction.channel.delete()
                .catch(() => {});
        },
        3000
    );
}

async function processTickets() {
    const now = Date.now();

    for (const ticket of Object.values(data.tickets)) {
        if (!ticket.open) continue;

        const last =
            Number(ticket.lastMessageAt) ||
            Number(ticket.createdAt) ||
            now;

        if (
            now - last <
            60 * 60 * 1000
        ) {
            continue;
        }

        const channel =
            client.channels.cache.get(
                ticket.channelId
            );

        if (channel) {
            await channel.send(
                "⏰ 60 dakika boyunca mesaj gönderilmediği için ticket otomatik kapatıldı."
            ).catch(() => {});

            await sleep(2000);

            await channel.delete()
                .catch(() => {});
        }

        ticket.open = false;
        ticket.closedAt = now;
    }

    saveData();
}

// ============================================================
// ROLE PANEL
// ============================================================

async function rolePanelCommand(message) {
    if (!isKayitYetkilisi(message.member)) {
        return message.reply(
            "❌ Bu paneli yalnızca Kayıt Yetkilisi kullanabilir."
        );
    }

    const channel =
        message.guild.channels.cache.get(
            CONFIG.channels.kayit
        );

    if (!channel) {
        return message.reply(
            "❌ Kayıt kanalı bulunamadı."
        );
    }

    const sent = await channel.send(
        registrationPanel()
    );

    data.registrationPanels[message.guild.id] =
        sent.id;

    saveData();

    return message.reply(
        "✅ Kayıt paneli gönderildi."
    );
}

// ============================================================
// UNREGISTERED
// ============================================================

async function setUnregisteredCommand(
    message,
    args
) {
    if (!isKayitYetkilisi(message.member)) {
        return message.reply(
            "❌ Bu komutu yalnızca Kayıt Yetkilisi kullanabilir."
        );
    }

    const targetId = mentionToId(args[0]);

    if (!targetId) {
        return message.reply(
            "❌ Oyuncuyu etiketlemelisin."
        );
    }

    const target =
        await message.guild.members
            .fetch(targetId)
            .catch(() => null);

    if (!target) {
        return message.reply(
            "❌ Oyuncu bulunamadı."
        );
    }

    try {
        await target.roles.remove([
            CONFIG.roles.futbolcu,
            CONFIG.roles.kaleci,
            CONFIG.roles.teknikDirektor,
        ]);

        await target.roles.add(
            CONFIG.roles.kayitsiz
        );

        const user = getUser(target.id);

        user.registered = false;
        user.training = 0;

        saveData();

        return message.reply(
            `⚪ ${target} kayıtsız olarak ayarlandı.`
        );
    } catch {
        return message.reply(
            "❌ Kayıtsız rolü verilemedi."
        );
    }
}

// ============================================================
// HELP
// ============================================================

async function helpCommand(message) {
    const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle("📚 AXERA LEAGUE KOMUTLARI")
        .setDescription(
            [
                "### 📋 Kayıt",
                "`.k @Oyuncu TakmaAd`",
                "`.kayıtsızver @Oyuncu`",
                "`.rolpanel`",
                "`.ara Oyuncu`",
                "",
                "### ⚽ Oyuncu",
                "`.antrenman` / `.ant`",
                "`.pen` / `.penaltı`",
                "`.bütçe`",
                "`.bütçe @Oyuncu`",
                "`.gönder @Oyuncu 50M`",
                "",
                "### 💰 Değer",
                "`.dver @Oyuncu 5`",
                "`.dsil @Oyuncu 5`",
                "`.paraekle @Oyuncu 50M`",
                "`.parasil @Oyuncu 50M`",
                "`.paraayarla @Oyuncu 50M`",
                "",
                "### ⚽ Takım",
                "`.takımekle @Takım`",
                "`.takımkaldır @Takım`",
                "`.takımdeğer @Takım 850`",
                "`.kadroekle @Takım @Oyuncu SNT`",
                "`.kadrocikar @Takım @Oyuncu`",
                "`.kadro @Takım`",
                "`.formasyon @Takım`",
                "`.puan`",
                "",
                "### 🏟️ Maç / Fikstür",
                "`.maç @Takım1 @Takım2`",
                "`.fiksturekle @Takım1 @Takım2 05.09.2026 20:00`",
                "`.fikstur`",
                "`.fiksturcikar @Takım1 @Takım2`",
                "",
                "### 🏆 Kupa / Müze",
                "`.kupaekle @Takım Kupa Adı`",
                "`.kupasil @Takım Kupa Adı`",
                "`.müze @Takım`",
                "`.asistkral`",
                "",
                "### 🎫 Ticket",
                "`.ticketpanel`",
                "",
                "### 🛡️ Yönetim",
                "`.sil 50`",
                "`.embed Başlık | Açıklama`",
                "`.kick @Oyuncu`",
                "`.ban @Oyuncu`",
                "`.mute @Oyuncu`",
                "`.unmute @Oyuncu`",
                "`.lock`",
                "`.unlock`",
                "`.dm @Oyuncu mesaj`",
                "",
                "### 📰 Diğer",
                "`.tweet mesaj`",
            ].join("\n")
        )
        .setFooter({
            text: "Axera League",
        })
        .setTimestamp();

    return message.reply({
        embeds: [embed],
    });
}

// ============================================================
// TICKET PANEL COMMAND
// ============================================================

async function ticketPanelCommand(message) {
    if (!isAdmin(message.member)) {
        return message.reply(
            "❌ Bu komutu yalnızca Yönetici kullanabilir."
        );
    }

    await message.channel.send(
        ticketPanel()
    );

    return message.reply({
        content: "✅ Ticket paneli gönderildi.",
    });
}

// ============================================================
// JOIN
// ============================================================

client.on("guildMemberAdd", async member => {
    try {
        if (member.user.bot) return;

        await member.roles.add(
            CONFIG.roles.kayitsiz
        ).catch(() => {});

        const channel =
            member.guild.channels.cache.get(
                CONFIG.channels.kayit
            );

        if (!channel) return;

        const roleMention =
            `<@&${CONFIG.roles.kayitYetkilisi}>`;

        await channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x3498DB)
                    .setTitle("👋 Hoş Geldin!")
                    .setDescription(
                        [
                            `${member} **Axera League** sunucusuna hoş geldin!`,
                            "",
                            `📋 ${roleMention} seninle ilgilenecektir.`,
                        ].join("\n")
                    )
                    .setThumbnail(
                        member.displayAvatarURL()
                    )
                    .setTimestamp(),
            ],
        });
    } catch (error) {
        console.error(
            "GUILD MEMBER ADD ERROR:",
            error
        );
    }
});

// ============================================================
// MESSAGE TRACKING
// ============================================================

client.on("messageCreate", async message => {
    try {
        if (!message.guild) return;
        if (message.author.bot) return;

        for (const ticket of Object.values(data.tickets)) {
            if (
                ticket.open &&
                ticket.channelId === message.channel.id
            ) {
                ticket.lastMessageAt =
                    Date.now();

                saveData();
                break;
            }
        }

        if (!message.content.startsWith(PREFIX)) {
            return;
        }

        const body =
            message.content.slice(
                PREFIX.length
            ).trim();

        if (!body) return;

        const parts =
            body.split(/\s+/);

        const command =
            parts.shift()
                .toLocaleLowerCase("tr-TR");

        const args = parts;

        switch (command) {
            // -----------------------------
            // KAYIT
            // -----------------------------

            case "k": {
                if (!isKayitYetkilisi(message.member)) {
                    return message.reply(
                        "❌ Bu komutu yalnızca Kayıt Yetkilisi kullanabilir."
                    );
                }

                if (!requireChannel(
                    message,
                    CONFIG.channels.kayit,
                    "Kayıt"
                )) return;

                const targetId =
                    mentionToId(args[0]);

                const nickname =
                    args.slice(1)
                        .join(" ")
                        .trim();

                if (!targetId || !nickname) {
                    return message.reply(
                        "❌ Kullanım: `.k @Oyuncu TakmaAd`"
                    );
                }

                const target =
                    await message.guild.members
                        .fetch(targetId)
                        .catch(() => null);

                if (!target) {
                    return message.reply(
                        "❌ Oyuncu bulunamadı."
                    );
                }

                // .k komutu temel kayıt işlemini yapar.
                // Rol seçimi için kayıt paneli kullanılır.
                const result =
                    await registerPlayer(
                        message.guild,
                        target,
                        nickname,
                        "futbolcu",
                        message.member
                    );

                if (!result.ok) {
                    return message.reply(
                        result.message
                    );
                }

                return message.reply({
                    embeds: [
                        successEmbed(
                            "📋 Kayıt Tamamlandı",
                            [
                                `👤 Oyuncu: ${target}`,
                                `🏷️ Takma Ad: **${result.nickname}**`,
                                "",
                                "⚽ Kayıt türü: **Futbolcu**",
                                "",
                                "Oyuncunun rolünü değiştirmek için Kayıt Paneli kullanılabilir.",
                            ].join("\n")
                        ),
                    ],
                });
            }

            case "kayıtsızver":
            case "kayitsizver":
                return setUnregisteredCommand(
                    message,
                    args
                );

            case "rolpanel":
                return rolePanelCommand(
                    message
                );

            // -----------------------------
            // ARA
            // -----------------------------

            case "ara":
                return searchCommand(
                    message,
                    args
                );

            // -----------------------------
            // ANTRENMAN
            // -----------------------------

            case "ant":
            case "antrenman":
                return trainingCommand(
                    message
                );

            // -----------------------------
            // PENALTI
            // -----------------------------

            case "pen":
            case "penaltı":
            case "penalti":
                return penaltyCommand(
                    message
                );

            // -----------------------------
            // DEĞER
            // -----------------------------

            case "dver":
                return valueCommand(
                    message,
                    args,
                    false
                );

            case "dsil":
                return valueCommand(
                    message,
                    args,
                    true
                );

            // -----------------------------
            // BÜTÇE
            // -----------------------------

            case "bütçe":
            case "butce":
                return budgetCommand(
                    message,
                    args
                );

            case "gönder":
            case "gonder":
                return sendMoneyCommand(
                    message,
                    args
                );

            case "paraekle":
                return staffMoneyCommand(
                    message,
                    args,
                    "add"
                );

            case "parasil":
                return staffMoneyCommand(
                    message,
                    args,
                    "remove"
                );

            case "paraayarla":
                return staffMoneyCommand(
                    message,
                    args,
                    "set"
                );

            // -----------------------------
            // TAKIM
            // -----------------------------

            case "takımekle":
            case "takimekle":
                return addTeamCommand(
                    message,
                    args
                );

            case "takımkaldır":
            case "takimkaldir":
            case "takımkaldir":
            case "takimkaldır":
                return removeTeamCommand(
                    message,
                    args
                );

            case "takımdeğer":
            case "takimdeger":
            case "takımdeger":
            case "takimdeğer":
                return teamValueCommand(
                    message,
                    args
                );

            // -----------------------------
            // KADRO
            // -----------------------------

            case "kadroekle":
                return addSquadCommand(
                    message,
                    args
                );

            case "kadrocikar":
            case "kadroçıkar":
            case "kadroçikar":
            case "kadroçıkar":
                return removeSquadCommand(
                    message,
                    args
                );

            case "kadro":
                return squadCommand(
                    message,
                    args
                );

            case "formasyon":
                return formationCommand(
                    message,
                    args
                );

            // -----------------------------
            // MAÇ
            // -----------------------------

            case "maç":
            case "mac":
                return matchCommand(
                    message,
                    args
                );

            // -----------------------------
            // FİKSTÜR
            // -----------------------------

            case "fiksturekle":
            case "fikstür ekle":
                return addFixtureCommand(
                    message,
                    args
                );

            case "fikstur":
            case "fikstür":
                return fixtureListCommand(
                    message
                );

            case "fiksturcikar":
            case "fikstürcikar":
            case "fiksturçıkar":
            case "fikstürçıkar":
                return removeFixtureCommand(
                    message,
                    args
                );

            // -----------------------------
            // PUAN
            // -----------------------------

            case "puan":
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x2ECC71)
                            .setTitle(
                                "🏆 AXERA LEAGUE PUAN DURUMU"
                            )
                            .setDescription(
                                standingsText(
                                    message.guild
                                )
                            )
                            .setTimestamp(),
                    ],
                });

            case "puanekle": {
                if (!isMacYetkilisi(message.member)) {
                    return message.reply(
                        "❌ Bu komutu yalnızca Maç Yetkilisi kullanabilir."
                    );
                }

                const teamId =
                    mentionToId(args[0]);

                const amount =
                    Number(args[1]);

                if (
                    !teamId ||
                    !Number.isInteger(amount)
                ) {
                    return message.reply(
                        "❌ Kullanım: `.puanekle @Takım miktar`"
                    );
                }

                if (!teamExists(teamId)) {
                    return message.reply(
                        "❌ Takım bulunamadı."
                    );
                }

                getStandings(teamId).P += amount;

                saveData();

                await updateStandingsMessage(
                    message.guild
                );

                return message.reply(
                    `✅ ${getRoleMention(teamId)} takımına **${amount} puan** eklendi.`
                );
            }

            // -----------------------------
            // KUPA / MÜZE
            // -----------------------------

            case "kupaekle":
                return addCupCommand(
                    message,
                    args
                );

            case "kupasil":
                return removeCupCommand(
                    message,
                    args
                );

            case "müze":
            case "muze":
                return museumCommand(
                    message,
                    args
                );

            case "asistkral":
                return assistKingCommand(
                    message
                );

            // -----------------------------
            // TWEET
            // -----------------------------

            case "tweet":
                return tweetCommand(
                    message,
                    args
                );

            // -----------------------------
            // MODERATION
            // -----------------------------

            case "sil":
                return clearCommand(
                    message,
                    args
                );

            case "embed":
                return embedCommand(
                    message,
                    args
                );

            case "kick":
                return kickCommand(
                    message,
                    args
                );

            case "ban":
                return banCommand(
                    message,
                    args
                );

            case "mute":
                return muteCommand(
                    message,
                    args
                );

            case "unmute":
                return unmuteCommand(
                    message,
                    args
                );

            case "lock":
                return lockCommand(
                    message
                );

            case "unlock":
                return unlockCommand(
                    message
                );

            // -----------------------------
            // DM
            // -----------------------------

            case "dm":
                return dmCommand(
                    message,
                    args
                );

            // -----------------------------
            // TICKET
            // -----------------------------

            case "ticketpanel":
                return ticketPanelCommand(
                    message
                );

            // -----------------------------
            // HELP
            // -----------------------------

            case "yardım":
            case "yardim":
                return helpCommand(
                    message
                );

            default:
                return;
        }
    } catch (error) {
        console.error(
            "MESSAGE COMMAND ERROR:",
            error
        );

        if (!message.replied && !message.deferred) {
            await message.reply(
                "❌ Komut çalıştırılırken beklenmeyen bir hata oluştu."
            ).catch(() => {});
        }
    }
});

// ============================================================
// INTERACTIONS
// ============================================================

client.on("interactionCreate", async interaction => {
    try {
        if (interaction.isButton()) {
            // -----------------------------
            // REGISTRATION
            // -----------------------------

            if (
                [
                    "register_futbolcu",
                    "register_kaleci",
                    "register_td",
                ].includes(
                    interaction.customId
                )
            ) {
                if (
                    !isKayitYetkilisi(
                        interaction.member
                    )
                ) {
                    return interaction.reply({
                        content:
                            "❌ Bu paneli yalnızca Kayıt Yetkilisi kullanabilir.",
                        ephemeral: true,
                    });
                }

                const type =
                    interaction.customId ===
                    "register_futbolcu"
                        ? "futbolcu"
                        : interaction.customId ===
                            "register_kaleci"
                            ? "kaleci"
                            : "td";

                return interaction.reply({
                    content:
                        `✅ **${type === "futbolcu"
                            ? "Futbolcu"
                            : type === "kaleci"
                                ? "Kaleci"
                                : "Teknik Direktör"}** seçildi.\n\nOyuncuyu kayıt etmek için:\n\`.k @Oyuncu TakmaAd\``,
                    ephemeral: true,
                });
            }

            // -----------------------------
            // TICKET CREATE
            // -----------------------------

            if (
                interaction.customId ===
                "create_ticket"
            ) {
                return createTicket(
                    interaction
                );
            }

            // -----------------------------
            // TICKET CLOSE
            // -----------------------------

            if (
                interaction.customId.startsWith(
                    "close_ticket_"
                )
            ) {
                const ticketId =
                    interaction.customId
                        .replace(
                            "close_ticket_",
                            ""
                        );

                return closeTicket(
                    interaction,
                    ticketId
                );
            }
        }

        // -----------------------------
        // FORMATION SELECT
        // -----------------------------

        if (interaction.isStringSelectMenu()) {
            if (
                interaction.customId.startsWith(
                    "formation_"
                )
            ) {
                if (
                    !isMacYetkilisi(
                        interaction.member
                    )
                ) {
                    return interaction.reply({
                        content:
                            "❌ Bu menüyü yalnızca Maç Yetkilisi kullanabilir.",
                        ephemeral: true,
                    });
                }

                const teamId =
                    interaction.customId.replace(
                        "formation_",
                        ""
                    );

                const formation =
                    interaction.values[0];

                if (!teamExists(teamId)) {
                    return interaction.reply({
                        content:
                            "❌ Takım bulunamadı.",
                        ephemeral: true,
                    });
                }

                data.teams[teamId].formation =
                    formation;

                data.formations[teamId] =
                    formation;

                saveData();

                return interaction.update({
                    content:
                        `✅ ${getRoleMention(teamId)} formasyonu **${formation}** olarak ayarlandı.`,
                    components: [],
                });
            }
        }
    } catch (error) {
        console.error(
            "INTERACTION ERROR:",
            error
        );

        if (
            !interaction.replied &&
            !interaction.deferred
        ) {
            await interaction.reply({
                content:
                    "❌ İşlem sırasında bir hata oluştu.",
                ephemeral: true,
            }).catch(() => {});
        }
    }
});

// ============================================================
// READY
// ============================================================

client.once("ready", async () => {
    console.log(
        `✅ Axera League aktif: ${client.user.tag}`
    );

    console.log(
        `📊 ${client.guilds.cache.size} sunucu`
    );

    for (const guild of client.guilds.cache.values()) {
        try {
            await guild.members.fetch();

            await updateStandingsMessage(
                guild
            );
        } catch (error) {
            console.error(
                "READY GUILD ERROR:",
                error
            );
        }
    }

    setInterval(
        async () => {
            try {
                await processFixtures();
            } catch (error) {
                console.error(
                    "FIXTURE LOOP ERROR:",
                    error
                );
            }
        },
        1000
    );

    setInterval(
        async () => {
            try {
                await processTickets();
            } catch (error) {
                console.error(
                    "TICKET LOOP ERROR:",
                    error
                );
            }
        },
        60 * 1000
    );
});

// ============================================================
// ERROR HANDLING
// ============================================================

process.on("unhandledRejection", error => {
    console.error(
        "UNHANDLED REJECTION:",
        error
    );
});

process.on("uncaughtException", error => {
    console.error(
        "UNCAUGHT EXCEPTION:",
        error
    );
});

process.on("SIGINT", () => {
    try {
        saveData();
    } catch {}

    process.exit(0);
});

process.on("SIGTERM", () => {
    try {
        saveData();
    } catch {}

    process.exit(0);
});

// ============================================================
// LOGIN
// ============================================================

if (!CONFIG.TOKEN) {
    console.error(
        "❌ TOKEN bulunamadı. Railway Variables bölümüne TOKEN ekle."
    );
    process.exit(1);
}

client.login(CONFIG.TOKEN);
