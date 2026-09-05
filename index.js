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

/* ============================================================
   AYARLAR
============================================================ */

const OWNER_ID = "1280275560739897409";

const ROLE_IDS = {
    KAYIT_YETKILISI: "1534456315366342716",
    KAYITSIZ: "1534457560134844517",
    KALECI: "1534492034243498195",
    UYE: "1534457460163608636",
    FUTBOLCU: "1534457228986421278",
    TEKNIK_DIREKTOR: "1534456648930693120",
    DEGER_YETKILISI: "1534456192913375382",
    SPIKER: "1535251168169697390"
};

const CHANNEL_IDS = {
    KAYIT: "1534460177884123276",
    SOHBET: "1534469475917758586",
    MAC: "1534477626872168541",
    FIKSTUR: "1534475908566483075",
    PUAN: "1534475991404253284",
    BOT_DURUM: "1545921149018570842",
    ANTRENMAN: "1534474070798762197",
    PENALTI: "1534474327812997192"
};

const TEAM_IDS = {
    "Barcelona": "1534480715779936297",
    "Real Madrid": "1534480984064528655",
    "Galatasaray": "1534481073629691995",
    "Fenerbahçe": "1534481156840620183",
    "Beşiktaş": "1534481259739348992",
    "Arsenal": "1534481678653853706",
    "Chelsea": "1534481742285770813",
    "Manchester City": "1534481568590991370",
    "Paris Saint-Germain": "1534481952982306867",
    "Liverpool": "1534481826696003594",
    "Manchester United": "1534481426463068180"
};

const TEAM_NAMES = Object.keys(TEAM_IDS);

const PREFIX = ".";

const TRAINING_CHANNEL_ID = CHANNEL_IDS.ANTRENMAN;
const PENALTY_CHANNEL_ID = CHANNEL_IDS.PENALTI;
const MATCH_CHANNEL_ID = CHANNEL_IDS.MAC;
const FIXTURE_CHANNEL_ID = CHANNEL_IDS.FIKSTUR;
const POINTS_CHANNEL_ID = CHANNEL_IDS.PUAN;

const MATCH_MINUTE_MS = 3000;
const MATCH_LENGTH = 90;

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

/* ============================================================
   DATABASE
============================================================ */

const DATA_DIR = path.join(__dirname, "data");
const DATABASE_FILE = path.join(DATA_DIR, "database.json");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function createDatabase() {
    return {
        guilds: {},
        botStartedAt: Date.now()
    };
}

let db;

try {
    if (fs.existsSync(DATABASE_FILE)) {
        db = JSON.parse(fs.readFileSync(DATABASE_FILE, "utf8"));
    } else {
        db = createDatabase();
    }
} catch (error) {
    console.error("Database okunamadı:", error);
    db = createDatabase();
}

db.guilds ||= {};
db.botStartedAt ||= Date.now();

let saveTimeout = null;

function saveDatabase() {
    clearTimeout(saveTimeout);

    saveTimeout = setTimeout(() => {
        try {
            fs.writeFileSync(
                DATABASE_FILE,
                JSON.stringify(db, null, 2),
                "utf8"
            );
        } catch (error) {
            console.error("Database kayıt hatası:", error);
        }
    }, 300);
}

function forceSave() {
    try {
        fs.writeFileSync(
            DATABASE_FILE,
            JSON.stringify(db, null, 2),
            "utf8"
        );
    } catch (error) {
        console.error("Database kayıt hatası:", error);
    }
}

/* ============================================================
   DATABASE YAPILARI
============================================================ */

function getGuildData(guildId) {
    if (!db.guilds[guildId]) {
        db.guilds[guildId] = {
            players: {},
            teams: {},
            points: {},
            fixtures: {},
            matches: [],
            transfers: {},
            registrations: {},
            giveaways: {},
            tickets: {},
            trophies: {},
            settings: {}
        };
    }

    const guild = db.guilds[guildId];

    guild.players ||= {};
    guild.teams ||= {};
    guild.points ||= {};
    guild.fixtures ||= {};
    guild.matches ||= [];
    guild.transfers ||= {};
    guild.registrations ||= {};
    guild.giveaways ||= {};
    guild.tickets ||= {};
    guild.trophies ||= {};
    guild.settings ||= {};

    return guild;
}

function getPlayerData(guildId, userId) {
    const guild = getGuildData(guildId);

    if (!guild.players[userId]) {
        guild.players[userId] = {
            value: 0,
            budget: 0,
            registered: false,
            nickname: "",
            position: null,
            team: null,
            salary: 0,
            seasons: 0,
            trainingStage: 0,
            goals: 0,
            assists: 0,
            matches: 0
        };
    }

    return guild.players[userId];
}

function getTeamData(guildId, team) {
    const guild = getGuildData(guildId);

    if (!guild.teams[team]) {
        guild.teams[team] = {
            squad: [],
            budget: 0
        };
    }

    return guild.teams[team];
}

function getPointsData(guildId, team) {
    const guild = getGuildData(guildId);

    if (!guild.points[team]) {
        guild.points[team] = {
            played: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            gf: 0,
            ga: 0,
            points: 0
        };
    }

    return guild.points[team];
}

function initializeTeams(guildId) {
    for (const team of TEAM_NAMES) {
        getTeamData(guildId, team);
        getPointsData(guildId, team);
    }

    saveDatabase();
}

/* ============================================================
   YARDIMCI FONKSİYONLAR
============================================================ */

function normalize(text) {
    return String(text || "")
        .toLocaleLowerCase("tr-TR")
        .replace(/ı/g, "i")
        .replace(/ğ/g, "g")
        .replace(/ü/g, "u")
        .replace(/ş/g, "s")
        .replace(/ö/g, "o")
        .replace(/ç/g, "c")
        .trim();
}

function parseMoney(value) {
    if (!value) return NaN;

    let text = String(value)
        .toLowerCase()
        .replace(/€/g, "")
        .replace(/m/g, "")
        .replace(",", ".")
        .trim();

    const number = Number(text);

    return Number.isFinite(number) ? number : NaN;
}

function formatMoney(value) {
    value = Number(value) || 0;

    if (Number.isInteger(value)) {
        return `${value}M€`;
    }

    return `${value.toFixed(2)}M€`;
}

function random(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
    return !!member?.roles?.cache?.has(roleId);
}

function isRegistrationStaff(member) {
    return isOwner(member) ||
        hasRole(member, ROLE_IDS.KAYIT_YETKILISI);
}

function isValueStaff(member) {
    return isOwner(member) ||
        hasRole(member, ROLE_IDS.DEGER_YETKILISI);
}

function isSpiker(member) {
    return isOwner(member) ||
        hasRole(member, ROLE_IDS.SPIKER);
}

function isTechnicalDirector(member) {
    return isOwner(member) ||
        hasRole(member, ROLE_IDS.TEKNIK_DIREKTOR);
}

/* ============================================================
   ROL BULMA
============================================================ */

function findRole(guild, id, names = []) {
    if (!guild) return null;

    if (id) {
        const role = guild.roles.cache.get(id);
        if (role) return role;
    }

    const wanted = names.map(normalize);

    return guild.roles.cache.find(role =>
        wanted.includes(normalize(role.name))
    ) || null;
}

function getRegistrationRole(guild) {
    return findRole(
        guild,
        ROLE_IDS.KAYIT_YETKILISI,
        ["Kayıt Yetkilisi", "Kayit Yetkilisi"]
    );
}

function getUnregisteredRole(guild) {
    return findRole(
        guild,
        ROLE_IDS.KAYITSIZ,
        ["Kayıtsız", "Kayitsiz"]
    );
}

function getGoalkeeperRole(guild) {
    return findRole(
        guild,
        ROLE_IDS.KALECI,
        ["Kaleci"]
    );
}

function getMemberRole(guild) {
    return findRole(
        guild,
        ROLE_IDS.UYE,
        ["Üye", "Uye"]
    );
}

function getFootballerRole(guild) {
    return findRole(
        guild,
        ROLE_IDS.FUTBOLCU,
        ["Futbolcu", "Oyuncu"]
    );
}

function getTechnicalDirectorRole(guild) {
    return findRole(
        guild,
        ROLE_IDS.TEKNIK_DIREKTOR,
        ["Teknik Direktör", "Teknik Direktor"]
    );
}

function getValueRole(guild) {
    return findRole(
        guild,
        ROLE_IDS.DEGER_YETKILISI,
        ["Değer Yetkilisi", "Deger Yetkilisi"]
    );
}

function getSpikerRole(guild) {
    return findRole(
        guild,
        ROLE_IDS.SPIKER,
        ["Spiker"]
    );
}

function getTeamRole(guild, team) {
    if (!guild || !team) return null;

    const official = getTeamName(team);

    if (!official) return null;

    const id = TEAM_IDS[official];

    if (id) {
        const role = guild.roles.cache.get(id);
        if (role) return role;
    }

    return guild.roles.cache.find(role =>
        normalize(role.name) === normalize(official)
    ) || null;
}

/* ============================================================
   KANAL BULMA
============================================================ */

function findChannel(guild, id, names = []) {
    if (!guild) return null;

    if (id) {
        const channel = guild.channels.cache.get(id);

        if (channel) {
            return channel;
        }
    }

    const wanted = names.map(normalize);

    return guild.channels.cache.find(channel =>
        wanted.includes(normalize(channel.name))
    ) || null;
}

function getChannel(guild, key) {
    const names = {
        KAYIT: ["kayıt", "kayit"],
        SOHBET: ["sohbet", "chat"],
        MAC: ["maç", "mac", "maçlar", "maclar"],
        FIKSTUR: ["fikstür", "fikstur"],
        PUAN: ["puan", "puan-durumu"],
        BOT_DURUM: ["bot-durum", "bot durum", "botdurum"],
        ANTRENMAN: ["antrenman", "training"],
        PENALTI: ["penaltı", "penalti"]
    };

    return findChannel(
        guild,
        CHANNEL_IDS[key],
        names[key] || []
    );
}

function requireChannel(message, key, label) {
    const channel = getChannel(message.guild, key);

    if (!channel) {
        message.reply(`❌ **${label}** kanalı bulunamadı.`);
        return false;
    }

    if (message.channel.id !== channel.id) {
        message.reply(
            `❌ Bu komut yalnızca ${channel} kanalında kullanılabilir.`
        );
        return false;
    }

    return true;
}

/* ============================================================
   TAKIM SİSTEMİ
============================================================ */

function getTeamName(input) {
    if (!input) return null;

    const n = normalize(input);

    for (const team of TEAM_NAMES) {
        if (normalize(team) === n) {
            return team;
        }
    }

    if (n === "psg") {
        return "Paris Saint-Germain";
    }

    return null;
}

function getMemberTeam(member) {
    if (!member) return null;

    for (const team of TEAM_NAMES) {
        const role = getTeamRole(member.guild, team);

        if (role && member.roles.cache.has(role.id)) {
            return team;
        }
    }

    const data = getPlayerData(member.guild.id, member.id);

    if (data.team && TEAM_NAMES.includes(data.team)) {
        return data.team;
    }

    return null;
}

function findTeamInMessage(message, args) {
    const role = message.mentions.roles.first();

    if (role) {
        for (const team of TEAM_NAMES) {
            const teamRole = getTeamRole(message.guild, team);

            if (teamRole?.id === role.id) {
                return team;
            }
        }
    }

    const joined = args.join(" ");

    const sorted = [...TEAM_NAMES]
        .sort((a, b) => b.length - a.length);

    for (const team of sorted) {
        if (
            normalize(joined).includes(
                normalize(team)
            )
        ) {
            return team;
        }
    }

    return null;
}

/* ============================================================
   ÜYE BULMA
============================================================ */

async function getMentionedMember(message, index = 0) {
    const mentioned = [...message.mentions.members.values()];

    if (mentioned[index]) {
        return mentioned[index];
    }

    const args = message.content.trim().split(/\s+/);

    const possible = args[index + 1];

    if (!possible) {
        return null;
    }

    const id = possible.replace(/[<@!>]/g, "");

    if (!/^\d{17,20}$/.test(id)) {
        return null;
    }

    try {
        return await message.guild.members.fetch(id);
    } catch {
        return null;
    }
}

function extractMentionId(text) {
    if (!text) return null;

    const match = String(text).match(/^<@!?(\d+)>$/);

    if (match) {
        return match[1];
    }

    if (/^\d{17,20}$/.test(text)) {
        return text;
    }

    return null;
}

/* ============================================================
   NICKNAME / DEĞER
============================================================ */

function readNicknameValue(member) {
    const name = member?.nickname || member?.user?.username || "";

    const match = name.match(
        /(\d+(?:[.,]\d+)?)\s*M€\s*$/i
    );

    if (!match) {
        return 0;
    }

    return parseFloat(
        match[1].replace(",", ".")
    );
}

async function updateNicknameValue(member, value) {
    if (!member) return;

    const oldName =
        member.nickname ||
        member.user.username;

    const formatted = formatMoney(value);

    let newName = oldName;

    if (
        /\d+(?:[.,]\d+)?\s*M€\s*$/i.test(oldName)
    ) {
        newName = oldName.replace(
            /\d+(?:[.,]\d+)?\s*M€\s*$/i,
            formatted
        );
    } else {
        newName = `${oldName} | ${formatted}`;
    }

    if (newName.length > 32) {
        newName = newName.slice(
            0,
            32 - formatted.length
        ).trim() + ` | ${formatted}`;
    }

    if (newName === oldName) return;

    try {
        if (member.manageable) {
            await member.setNickname(newName);
        }
    } catch (error) {
        console.log(
            `Nickname değiştirilemedi: ${member.user.tag}`
        );
    }
}

async function changePlayerValue(
    guild,
    member,
    amount
) {
    const data = getPlayerData(
        guild.id,
        member.id
    );

    let current = Number(data.value);

    if (!Number.isFinite(current)) {
        current = readNicknameValue(member);
    }

    const next = Math.max(
        0,
        current + amount
    );

    data.value = next;

    if (!data.nickname) {
        data.nickname =
            member.nickname ||
            member.user.username;
    }

    await updateNicknameValue(
        member,
        next
    );

    saveDatabase();

    return {
        old: current,
        new: next
    };
}

/* ============================================================
   PUAN TABLOSU
============================================================ */

function calculateTable(guildId) {
    const rows = [];

    for (const team of TEAM_NAMES) {
        const p = getPointsData(
            guildId,
            team
        );

        rows.push({
            team,
            ...p,
            gd: p.gf - p.ga
        });
    }

    rows.sort((a, b) => {
        if (b.points !== a.points) {
            return b.points - a.points;
        }

        if (b.gd !== a.gd) {
            return b.gd - a.gd;
        }

        if (b.gf !== a.gf) {
            return b.gf - a.gf;
        }

        return a.team.localeCompare(
            b.team,
            "tr"
        );
    });

    return rows;
}

function createPointsEmbed(guildId) {
    const table = calculateTable(guildId);

    const lines = table.map((row, index) => {
        return (
            `**${index + 1}. ${row.team}**\n` +
            `   ${row.played} maç | ` +
            `${row.wins}G ${row.draws}B ${row.losses}M | ` +
            `AV: ${row.gd} | **${row.points} P**`
        );
    });

    return new EmbedBuilder()
        .setTitle("🏆 AXERA LEAGUE PUAN DURUMU")
        .setDescription(
            lines.join("\n\n")
        )
        .setFooter({
            text: "Galibiyet: 3 Puan • Beraberlik: 1 Puan"
        })
        .setTimestamp();
}

async function sendPointsTable(guild) {
    const channel = getChannel(
        guild,
        "PUAN"
    );

    if (!channel || !channel.isTextBased()) {
        return;
    }

    try {
        await channel.send({
            embeds: [
                createPointsEmbed(
                    guild.id
                )
            ]
        });
    } catch {}
}

/* ============================================================
   KAYIT SİSTEMİ
============================================================ */

function registrationButtons(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`register_${userId}_KALECI`)
            .setLabel("Kaleci")
            .setEmoji("🧤")
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId(`register_${userId}_UYE`)
            .setLabel("Üye")
            .setEmoji("👤")
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(`register_${userId}_FUTBOLCU`)
            .setLabel("Futbolcu")
            .setEmoji("⚽")
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId(`register_${userId}_TD`)
            .setLabel("Teknik Direktör")
            .setEmoji("📋")
            .setStyle(ButtonStyle.Danger)
    );
}

async function handleRegistrationCommand(message, args) {
    if (!isRegistrationStaff(message.member)) {
        return message.reply(
            "❌ Bu komutu yalnızca **Kayıt Yetkilisi** kullanabilir."
        );
    }

    const member = await getMentionedMember(
        message,
        0
    );

    if (!member) {
        return message.reply(
            "❌ Kullanıcı belirtmelisin.\n" +
            "Örnek: `.k @Oyuncu TakmaAdı`"
        );
    }

    if (member.user.bot) {
        return message.reply(
            "❌ Botlar kayıt edilemez."
        );
    }

    const argsWithoutMention = args.filter(
        arg => !extractMentionId(arg)
    );

    const nickname =
        argsWithoutMention.join(" ").trim();

    const data = getPlayerData(
        message.guild.id,
        member.id
    );

    data.nickname =
        nickname ||
        member.nickname ||
        member.user.username;

    data.registered = false;

    db.guilds[
        message.guild.id
    ].registrations[member.id] = {
        nickname: data.nickname,
        createdAt: Date.now(),
        staffId: message.author.id
    };

    saveDatabase();

    const embed = new EmbedBuilder()
        .setTitle("📝 OYUNCU KAYIT PANELİ")
        .setDescription(
            `**Oyuncu:** ${member}\n` +
            `**Takma Ad:** ${data.nickname}\n\n` +
            `Oyuncunun görevini aşağıdaki butonlardan seç.`
        )
        .setFooter({
            text: "Axera League Kayıt Sistemi"
        })
        .setTimestamp();

    await message.channel.send({
        embeds: [embed],
        components: [
            registrationButtons(member.id)
        ]
    });

    await message.reply(
        `✅ ${member} için kayıt paneli oluşturuldu.`
    );
}

async function completeRegistration(
    interaction,
    type
) {
    if (!isRegistrationStaff(
        interaction.member
    )) {
        return interaction.reply({
            content:
                "❌ Bu paneli yalnızca Kayıt Yetkilisi kullanabilir.",
            ephemeral: true
        });
    }

    const parts =
        interaction.customId.split("_");

    const userId = parts[1];

    const member =
        await interaction.guild.members
            .fetch(userId)
            .catch(() => null);

    if (!member) {
        return interaction.reply({
            content:
                "❌ Oyuncu sunucuda bulunamadı.",
            ephemeral: true
        });
    }

    const data = getPlayerData(
        interaction.guild.id,
        member.id
    );

    const rolesToRemove = [
        getUnregisteredRole(interaction.guild),
        getGoalkeeperRole(interaction.guild),
        getMemberRole(interaction.guild),
        getFootballerRole(interaction.guild),
        getTechnicalDirectorRole(interaction.guild)
    ].filter(Boolean);

    for (const role of rolesToRemove) {
        if (
            member.roles.cache.has(role.id)
        ) {
            await member.roles.remove(
                role
            ).catch(() => {});
        }
    }

    let role = null;
    let roleName = "";

    if (type === "KALECI") {
        role = getGoalkeeperRole(
            interaction.guild
        );
        roleName = "Kaleci";
        data.position = "KL";
    }

    if (type === "UYE") {
        role = getMemberRole(
            interaction.guild
        );
        roleName = "Üye";
        data.position = "Üye";
    }

    if (type === "FUTBOLCU") {
        role = getFootballerRole(
            interaction.guild
        );
        roleName = "Futbolcu";
        data.position = "Oyuncu";
    }

    if (type === "TD") {
        role = getTechnicalDirectorRole(
            interaction.guild
        );
        roleName = "Teknik Direktör";
        data.position = "TD";
    }

    if (role) {
        await member.roles.add(
            role
        ).catch(() => {});
    }

    data.registered = true;

    if (!data.nickname) {
        data.nickname =
            member.nickname ||
            member.user.username;
    }

    saveDatabase();

    const welcome =
        getChannel(
            interaction.guild,
            "SOHBET"
        );

    const registerRole =
        getRegistrationRole(
            interaction.guild
        );

    const welcomeText =
        `🎉 **KAYIT TAMAMLANDI!**\n\n` +
        `👤 Oyuncu: ${member}\n` +
        `📋 Tür: **${roleName}**\n` +
        `⚽ Hoş geldin, **${data.nickname}**!`;

    await interaction.update({
        embeds: [
            new EmbedBuilder()
                .setTitle("✅ KAYIT TAMAMLANDI")
                .setDescription(
                    welcomeText
                )
                .setTimestamp()
        ],
        components: []
    });

    if (welcome) {
        await welcome.send({
            content:
                `${registerRole || ""}\n` +
                welcomeText
        }).catch(() => {});
    }
}

/* ============================================================
   KAYITSIZ VER
============================================================ */

async function unregisterPlayer(
    message,
    args
) {
    if (!isRegistrationStaff(
        message.member
    )) {
        return message.reply(
            "❌ Bu komutu yalnızca Kayıt Yetkilisi kullanabilir."
        );
    }

    const member =
        await getMentionedMember(
            message,
            0
        );

    if (!member) {
        return message.reply(
            "❌ Kullanıcı belirtmelisin."
        );
    }

    const roles = [
        getGoalkeeperRole(message.guild),
        getMemberRole(message.guild),
        getFootballerRole(message.guild),
        getTechnicalDirectorRole(message.guild)
    ].filter(Boolean);

    for (const role of roles) {
        await member.roles.remove(
            role
        ).catch(() => {});
    }

    const currentTeam =
        getMemberTeam(member);

    if (currentTeam) {
        const teamRole =
            getTeamRole(
                message.guild,
                currentTeam
            );

        if (teamRole) {
            await member.roles.remove(
                teamRole
            ).catch(() => {});
        }
    }

    const data = getPlayerData(
        message.guild.id,
        member.id
    );

    data.registered = false;
    data.team = null;
    data.position = null;
    data.salary = 0;
    data.seasons = 0;

    const unregistered =
        getUnregisteredRole(
            message.guild
        );

    if (unregistered) {
        await member.roles.add(
            unregistered
        ).catch(() => {});
    }

    saveDatabase();

    return message.reply(
        `✅ ${member} tekrar **Kayıtsız** yapıldı.`
    );
}

/* ============================================================
   ARA SİSTEMİ
============================================================ */

function searchPlayers(
    guild,
    query
) {
    const guildData =
        getGuildData(guild.id);

    const q = normalize(query);

    const results = [];

    for (
        const [userId, data]
        of Object.entries(guildData.players)
    ) {
        if (!data.registered) {
            continue;
        }

        const member =
            guild.members.cache.get(
                userId
            );

        if (!member) {
            continue;
        }

        if (member.user.bot) {
            continue;
        }

        const names = [
            member.user.username,
            member.displayName,
            data.nickname
        ].map(normalize);

        let score = 0;

        for (const name of names) {
            if (name === q) {
                score = Math.max(
                    score,
                    100
                );
            } else if (
                name.startsWith(q)
            ) {
                score = Math.max(
                    score,
                    80
                );
            } else if (
                name.includes(q)
            ) {
                score = Math.max(
                    score,
                    50
                );
            }
        }

        if (score > 0) {
            results.push({
                member,
                data,
                score
            });
        }
    }

    results.sort(
        (a, b) =>
            b.score - a.score ||
            a.member.displayName
                .localeCompare(
                    b.member.displayName,
                    "tr"
                )
    );

    return results.slice(0, 15);
}

async function playerSearch(
    message,
    args
) {
    const query =
        args.join(" ").trim();

    if (!query) {
        return message.reply(
            "❌ Aramak istediğin oyuncunun adını yaz.\n" +
            "Örnek: `.ara oyuncu sneijder`"
        );
    }

    const results =
        searchPlayers(
            message.guild,
            query
        );

    if (!results.length) {
        return message.reply(
            "🔎 Oyuncu bulunamadı."
        );
    }

    const description =
        results.map((item, index) => {
            const team =
                item.data.team ||
                "Takımsız";

            return (
                `**${index + 1}.** ${item.member}\n` +
                `> 👤 ${item.data.nickname || item.member.displayName}\n` +
                `> 💰 ${formatMoney(item.data.value)}\n` +
                `> 🏟️ ${team}`
            );
        }).join("\n\n");

    const embed =
        new EmbedBuilder()
            .setTitle("🔎 OYUNCU ARAMA")
            .setDescription(
                description
            )
            .setFooter({
                text:
                    `${results.length} sonuç gösteriliyor`
            });

    return message.reply({
        embeds: [embed]
    });
}

/* ============================================================
   DEĞER SİSTEMİ
============================================================ */

async function giveValue(
    message,
    args
) {
    if (!isValueStaff(
        message.member
    )) {
        return message.reply(
            "❌ Bu komutu yalnızca **Değer Yetkilisi** kullanabilir."
        );
    }

    const member =
        await getMentionedMember(
            message,
            0
        );

    if (!member) {
        return message.reply(
            "❌ Oyuncu belirtmelisin."
        );
    }

    const rawAmount =
        args.find(arg =>
            !extractMentionId(arg)
        );

    const amount =
        parseMoney(rawAmount);

    if (
        !Number.isFinite(amount) ||
        amount <= 0
    ) {
        return message.reply(
            "❌ Geçerli bir miktar yaz.\n" +
            "Örnek: `.dver @Oyuncu 5`"
        );
    }

    const result =
        await changePlayerValue(
            message.guild,
            member,
            amount
        );

    return message.reply(
        `✅ ${member} oyuncusuna **+${formatMoney(amount)}** değer eklendi.\n` +
        `💰 Eski değer: **${formatMoney(result.old)}**\n` +
        `💰 Yeni değer: **${formatMoney(result.new)}**`
    );
}

async function removeValue(
    message,
    args
) {
    if (!isValueStaff(
        message.member
    )) {
        return message.reply(
            "❌ Bu komutu yalnızca **Değer Yetkilisi** kullanabilir."
        );
    }

    const member =
        await getMentionedMember(
            message,
            0
        );

    if (!member) {
        return message.reply(
            "❌ Oyuncu belirtmelisin."
        );
    }

    const rawAmount =
        args.find(arg =>
            !extractMentionId(arg)
        );

    const amount =
        parseMoney(rawAmount);

    if (
        !Number.isFinite(amount) ||
        amount <= 0
    ) {
        return message.reply(
            "❌ Geçerli bir miktar yaz."
        );
    }

    const result =
        await changePlayerValue(
            message.guild,
            member,
            -amount
        );

    return message.reply(
        `✅ ${member} oyuncusundan **${formatMoney(amount)}** değer düşüldü.\n` +
        `💰 Eski değer: **${formatMoney(result.old)}**\n` +
        `💰 Yeni değer: **${formatMoney(result.new)}**`
    );
}

/* ============================================================
   BÜTÇE SİSTEMİ
============================================================ */

async function showBudget(
    message,
    args
) {
    let member = message.member;

    if (message.mentions.members.first()) {
        member =
            message.mentions.members.first();
    }

    const data =
        getPlayerData(
            message.guild.id,
            member.id
        );

    return message.reply(
        `💳 **BÜTÇE**\n` +
        `👤 ${member}\n` +
        `💰 Bakiye: **${formatMoney(data.budget)}**`
    );
}

async function addBudget(
    message,
    args
) {
    if (!isValueStaff(
        message.member
    )) {
        return message.reply(
            "❌ Yalnızca Değer Yetkilisi kullanabilir."
        );
    }

    const member =
        await getMentionedMember(
            message,
            0
        );

    if (!member) {
        return message.reply(
            "❌ Kullanıcı belirtmelisin."
        );
    }

    const amount =
        parseMoney(
            args.find(
                x => !extractMentionId(x)
            )
        );

    if (
        !Number.isFinite(amount) ||
        amount <= 0
    ) {
        return message.reply(
            "❌ Geçerli miktar yaz."
        );
    }

    const data =
        getPlayerData(
            message.guild.id,
            member.id
        );

    data.budget += amount;

    saveDatabase();

    return message.reply(
        `✅ ${member} bütçesine **+${formatMoney(amount)}** eklendi.\n` +
        `💳 Yeni bütçe: **${formatMoney(data.budget)}**`
    );
}

async function removeBudget(
    message,
    args
) {
    if (!isValueStaff(
        message.member
    )) {
        return message.reply(
            "❌ Yalnızca Değer Yetkilisi kullanabilir."
        );
    }

    const member =
        await getMentionedMember(
            message,
            0
        );

    if (!member) {
        return message.reply(
            "❌ Kullanıcı belirtmelisin."
        );
    }

    const amount =
        parseMoney(
            args.find(
                x => !extractMentionId(x)
            )
        );

    if (
        !Number.isFinite(amount) ||
        amount <= 0
    ) {
        return message.reply(
            "❌ Geçerli miktar yaz."
        );
    }

    const data =
        getPlayerData(
            message.guild.id,
            member.id
        );

    data.budget =
        Math.max(
            0,
            data.budget - amount
        );

    saveDatabase();

    return message.reply(
        `✅ ${member} bütçesinden **${formatMoney(amount)}** düşüldü.\n` +
        `💳 Yeni bütçe: **${formatMoney(data.budget)}**`
    );
}

async function sendBudget(
    message,
    args
) {
    const receiver =
        await getMentionedMember(
            message,
            0
        );

    if (!receiver) {
        return message.reply(
            "❌ Para göndereceğin kişiyi etiketle."
        );
    }

    if (
        receiver.id === message.author.id
    ) {
        return message.reply(
            "❌ Kendine para gönderemezsin."
        );
    }

    const amount =
        parseMoney(
            args.find(
                x => !extractMentionId(x)
            )
        );

    if (
        !Number.isFinite(amount) ||
        amount <= 0
    ) {
        return message.reply(
            "❌ Geçerli miktar yaz."
        );
    }

    const senderData =
        getPlayerData(
            message.guild.id,
            message.author.id
        );

    const receiverData =
        getPlayerData(
            message.guild.id,
            receiver.id
        );

    if (
        senderData.budget < amount
    ) {
        return message.reply(
            `❌ Yeterli bütçen yok.\n` +
            `💳 Bütçen: **${formatMoney(senderData.budget)}**`
        );
    }

    senderData.budget -= amount;
    receiverData.budget += amount;

    saveDatabase();

    return message.reply(
        `✅ ${receiver} kullanıcısına **${formatMoney(amount)}** gönderildi.\n` +
        `💳 Yeni bütçen: **${formatMoney(senderData.budget)}**`
    );
}

/* ============================================================
   KAP TRANSFER SİSTEMİ
============================================================ */

function kapButtons(offerId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(
                `kap_accept_${offerId}`
            )
            .setLabel("Kabul Et")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId(
                `kap_reject_${offerId}`
            )
            .setLabel("Reddet")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Danger)
    );
}

async function makeTransferOffer(
    message,
    args
) {
    if (
        !isOwner(message.member) &&
        !isTechnicalDirector(message.member) &&
        !getMemberTeam(message.member)
    ) {
        return message.reply(
            "❌ KAP teklifi için Teknik Direktör, takım yetkisi veya Bot Sahibi olmalısın."
        );
    }

    const player =
        await getMentionedMember(
            message,
            0
        );

    if (!player) {
        return message.reply(
            "❌ Oyuncuyu etiketle."
        );
    }

    const team =
        findTeamInMessage(
            message,
            args
        );

    if (!team) {
        return message.reply(
            "❌ Takım bulunamadı."
        );
    }

    const numeric = args
        .filter(x => !extractMentionId(x))
        .filter(x => !getTeamName(x));

    const salary =
        parseMoney(
            numeric[numeric.length - 2]
        );

    const seasons =
        Number(
            numeric[numeric.length - 1]
        );

    if (
        !Number.isFinite(salary) ||
        salary <= 0
    ) {
        return message.reply(
            "❌ Maaş miktarı geçersiz."
        );
    }

    if (
        !Number.isInteger(seasons) ||
        seasons < 1 ||
        seasons > 10
    ) {
        return message.reply(
            "❌ Sözleşme süresi **1-10 sezon** arasında olmalı."
        );
    }

    const footballerRole =
        getFootballerRole(
            message.guild
        );

    if (
        footballerRole &&
        !player.roles.cache.has(
            footballerRole.id
        )
    ) {
        return message.reply(
            "❌ Bu kullanıcıda **Futbolcu** rolü yok."
        );
    }

    const playerData =
        getPlayerData(
            message.guild.id,
            player.id
        );

    if (playerData.team) {
        return message.reply(
            `❌ Bu oyuncu zaten **${playerData.team}** takımında.`
        );
    }

    const issuerTeam =
        getMemberTeam(
            message.member
        );

    if (
        !isOwner(message.member) &&
        issuerTeam &&
        issuerTeam !== team
    ) {
        return message.reply(
            `❌ Sen yalnızca **${issuerTeam}** için KAP teklifi oluşturabilirsin.`
        );
    }

    const offerId =
        `${Date.now()}_${random(1000, 9999)}`;

    const guild =
        getGuildData(
            message.guild.id
        );

    guild.transfers[offerId] = {
        id: offerId,
        playerId: player.id,
        team,
        salary,
        seasons,
        totalSalary:
            salary * seasons,
        offeredBy:
            message.author.id,
        status: "pending",
        createdAt: Date.now(),
        messageId: null
    };

    const embed =
        new EmbedBuilder()
            .setTitle("📋 KAP TRANSFER TEKLİFİ")
            .setDescription(
                `👤 **Oyuncu:** ${player}\n` +
                `🏟️ **Takım:** ${team}\n\n` +
                `💰 **Sezon Başı Maaş:** ${formatMoney(salary)}\n` +
                `📅 **Sözleşme:** ${seasons} sezon\n` +
                `💵 **Toplam Maaş:** ${formatMoney(salary * seasons)}\n\n` +
                `Oyuncu aşağıdaki butonlardan karar verebilir.`
            )
            .setFooter({
                text:
                    `Teklif Sahibi: ${message.author.tag}`
            })
            .setTimestamp();

    const sent =
        await message.channel.send({
            embeds: [embed],
            components: [
                kapButtons(offerId)
            ]
        });

    guild.transfers[
        offerId
    ].messageId = sent.id;

    saveDatabase();

    return message.reply(
        `✅ KAP teklifi ${player} oyuncusuna gönderildi.`
    );
}

async function handleKapButton(
    interaction
) {
    const parts =
        interaction.customId.split("_");

    const action = parts[1];
    const offerId = parts[2];

    const guildData =
        getGuildData(
            interaction.guild.id
        );

    const offer =
        guildData.transfers[
            offerId
        ];

    if (!offer) {
        return interaction.reply({
            content:
                "❌ Bu teklif artık bulunamadı.",
            ephemeral: true
        });
    }

    if (
        interaction.user.id !==
        offer.playerId
    ) {
        return interaction.reply({
            content:
                "❌ Bu teklif sana ait değil.",
            ephemeral: true
        });
    }

    if (offer.status !== "pending") {
        return interaction.reply({
            content:
                "❌ Bu teklif zaten sonuçlandırılmış.",
            ephemeral: true
        });
    }

    if (action === "reject") {
        offer.status = "rejected";

        saveDatabase();

        const embed =
            EmbedBuilder.from(
                interaction.message.embeds[0]
            )
                .setColor(0xff0000)
                .setFooter({
                    text: "❌ Transfer teklifi reddedildi."
                });

        await interaction.update({
            embeds: [embed],
            components: []
        });

        return;
    }

    const member =
        await interaction.guild.members
            .fetch(offer.playerId)
            .catch(() => null);

    if (!member) {
        return interaction.reply({
            content:
                "❌ Oyuncu bulunamadı.",
            ephemeral: true
        });
    }

    const playerData =
        getPlayerData(
            interaction.guild.id,
            member.id
        );

    if (playerData.team) {
        return interaction.reply({
            content:
                "❌ Artık takımsız değilsin.",
            ephemeral: true
        });
    }

    const teamRole =
        getTeamRole(
            interaction.guild,
            offer.team
        );

    if (!teamRole) {
        return interaction.reply({
            content:
                "❌ Takım rolü bulunamadı.",
            ephemeral: true
        });
    }

    playerData.team =
        offer.team;

    playerData.salary =
        offer.salary;

    playerData.seasons =
        offer.seasons;

    playerData.registered = true;

    await member.roles.add(
        teamRole
    ).catch(() => {});

    offer.status = "accepted";

    saveDatabase();

    const embed =
        EmbedBuilder.from(
            interaction.message.embeds[0]
        )
            .setColor(0x00ff00)
            .setFooter({
                text:
                    `✅ ${offer.team} transferi kabul edildi.`
            });

    await interaction.update({
        embeds: [embed],
        components: []
    });
}

/* ============================================================
   KADRO SİSTEMİ
============================================================ */

function canManageTeam(
    member,
    team
) {
    if (isOwner(member)) {
        return true;
    }

    if (isSpiker(member)) {
        return true;
    }

    if (isTechnicalDirector(member)) {
        return true;
    }

    const memberTeam =
        getMemberTeam(member);

    if (
        memberTeam &&
        memberTeam === team
    ) {
        return true;
    }

    return false;
}

function getSquad(
    guildId,
    team
) {
    return getTeamData(
        guildId,
        team
    ).squad;
}

function getSquadValue(
    guild,
    team
) {
    const squad =
        getSquad(
            guild.id,
            team
        );

    let total = 0;

    for (const item of squad) {
        const data =
            getPlayerData(
                guild.id,
                item.userId
            );

        total +=
            Number(data.value) || 0;
    }

    return total;
}

async function addSquadPlayer(
    message,
    args
) {
    const team =
        findTeamInMessage(
            message,
            args
        );

    if (!team) {
        return message.reply(
            "❌ Takım bulunamadı."
        );
    }

    if (
        !canManageTeam(
            message.member,
            team
        )
    ) {
        return message.reply(
            "❌ Bu takımın kadrosunu yönetme yetkin yok."
        );
    }

    const player =
        await getMentionedMember(
            message,
            0
        );

    if (!player) {
        return message.reply(
            "❌ Oyuncuyu etiketle."
        );
    }

    const data =
        getPlayerData(
            message.guild.id,
            player.id
        );

    if (
        data.team &&
        data.team !== team
    ) {
        return message.reply(
            `❌ Oyuncu **${data.team}** takımında.`
        );
    }

    const positions =
        [
            "GK",
            "KL",
            "DEF",
            "DS",
            "OS",
            "OOS",
            "SNT",
            "FOR",
            "MOO",
            "ST"
        ];

    const position =
        args.find(arg =>
            positions.includes(
                arg.toUpperCase()
            )
        )?.toUpperCase() ||
        "OS";

    const squad =
        getSquad(
            message.guild.id,
            team
        );

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
        position
    });

    data.team = team;

    saveDatabase();

    return message.reply(
        `✅ ${player} **${team}** kadrosuna eklendi.\n` +
        `📌 Pozisyon: **${position}**\n` +
        `💰 Değer: **${formatMoney(data.value)}**`
    );
}

async function removeSquadPlayer(
    message,
    args
) {
    const team =
        findTeamInMessage(
            message,
            args
        );

    if (!team) {
        return message.reply(
            "❌ Takım bulunamadı."
        );
    }

    if (
        !canManageTeam(
            message.member,
            team
        )
    ) {
        return message.reply(
            "❌ Bu takımın kadrosunu yönetemezsin."
        );
    }

    const player =
        await getMentionedMember(
            message,
            0
        );

    if (!player) {
        return message.reply(
            "❌ Oyuncuyu etiketle."
        );
    }

    const squad =
        getSquad(
            message.guild.id,
            team
        );

    const index =
        squad.findIndex(
            x =>
                x.userId ===
                player.id
        );

    if (index === -1) {
        return message.reply(
            "❌ Oyuncu bu kadroda değil."
        );
    }

    squad.splice(
        index,
        1
    );

    saveDatabase();

    return message.reply(
        `✅ ${player} **${team}** kadrosundan çıkarıldı.`
    );
}

async function showSquad(
    message,
    args
) {
    const team =
        findTeamInMessage(
            message,
            args
        ) || getMemberTeam(
            message.member
        );

    if (!team) {
        return message.reply(
            "❌ Takım belirtmelisin."
        );
    }

    const squad =
        getSquad(
            message.guild.id,
            team
        );

    const lines = [];

    for (
        let i = 0;
        i < squad.length;
        i++
    ) {
        const item =
            squad[i];

        const member =
            message.guild.members.cache
                .get(item.userId);

        const data =
            getPlayerData(
                message.guild.id,
                item.userId
            );

        lines.push(
            `**${i + 1}.** ${member || `<@${item.userId}>`} — **${item.position}** — ${formatMoney(data.value)}`
        );
    }

    const total =
        getSquadValue(
            message.guild,
            team
        );

    const embed =
        new EmbedBuilder()
            .setTitle(
                `👥 ${team} KADROSU`
            )
            .setDescription(
                lines.length
                    ? lines.join("\n")
                    : "Kadrodaki gerçek oyuncu bulunmuyor."
            )
            .addFields({
                name: "💰 Kadro Değeri",
                value: formatMoney(total)
            })
            .setFooter({
                text:
                    `${squad.length}/11 gerçek oyuncu`
            });

    return message.reply({
        embeds: [embed]
    });
}

/* ============================================================
   ANTRENMAN
============================================================ */

async function training(
    message
) {
    if (
        message.channel.id !==
        TRAINING_CHANNEL_ID
    ) {
        return message.reply(
            `❌ Antrenman yalnızca <#${TRAINING_CHANNEL_ID}> kanalında yapılabilir.`
        );
    }

    const data =
        getPlayerData(
            message.guild.id,
            message.author.id
        );

    if (!data.registered) {
        return message.reply(
            "❌ Önce kayıt olmalısın."
        );
    }

    if (
        data.trainingStage >= 5
    ) {
        return message.reply(
            "🏋️ Antrenmanı zaten **5/5** tamamladın.\n" +
            "💰 Ödül değere eklenmiştir."
        );
    }

    data.trainingStage++;

    if (
        data.trainingStage < 5
    ) {
        saveDatabase();

        return message.reply(
            `🏋️ **ANTRENMAN**\n\n` +
            `📈 İlerleme: **${data.trainingStage}/5**\n` +
            `💡 Tamamlamak için devam et.`
        );
    }

    const member =
        message.member;

    const result =
        await changePlayerValue(
            message.guild,
            member,
            5
        );

    saveDatabase();

    return message.reply(
        `🏋️ **ANTRENMAN TAMAMLANDI!**\n\n` +
        `📈 İlerleme: **5/5**\n` +
        `💰 Oyuncu değerine **+5M€** eklendi.\n` +
        `💵 Yeni değer: **${formatMoney(result.new)}**`
    );
}

/* ============================================================
   PENALTI
============================================================ */

async function penalty(
    message
) {
    if (
        message.channel.id !==
        PENALTY_CHANNEL_ID
    ) {
        return message.reply(
            `❌ Penaltı yalnızca <#${PENALTY_CHANNEL_ID}> kanalında oynanabilir.`
        );
    }

    const data =
        getPlayerData(
            message.guild.id,
            message.author.id
        );

    if (!data.registered) {
        return message.reply(
            "❌ Önce kayıt olmalısın."
        );
    }

    const roll =
        Math.random() * 100;

    let result;
    let reward = 0;

    if (roll < 30) {
        result = "⚽ GOL";
        reward = 5;
    } else if (roll < 60) {
        result = "🧤 KALECİ KURTARDI";
    } else if (roll < 85) {
        result = "🥅 DİREK";
    } else {
        result = "🚩 KORNER";
    }

    if (reward > 0) {
        const change =
            await changePlayerValue(
                message.guild,
                message.member,
                reward
            );

        return message.reply(
            `🥅 **PENALTI**\n\n` +
            `${result}\n\n` +
            `💰 **+5M€ değer kazandın!**\n` +
            `📊 Yeni değer: **${formatMoney(change.new)}**`
        );
    }

    return message.reply(
        `🥅 **PENALTI**\n\n${result}\n\n` +
        `💰 Değer değişmedi.`
    );
}

/* ============================================================
   NPC
============================================================ */

function buildNPC(team, index) {
    const names = [
        "Alex NPC",
        "Mert NPC",
        "Kerem NPC",
        "Emir NPC",
        "Arda NPC",
        "Can NPC",
        "Deniz NPC",
        "Efe NPC",
        "Kaan NPC",
        "Bora NPC",
        "Alp NPC"
    ];

    return {
        userId: null,
        name:
            `${team} ${names[index % names.length]}`,
        position:
            index === 0
                ? "GK"
                : index < 4
                    ? "DEF"
                    : index < 8
                        ? "OS"
                        : "SNT",
        npc: true,
        strength: 0.8
    };
}

function buildLineup(
    guild,
    team
) {
    const squad =
        getSquad(
            guild.id,
            team
        ).slice(0, 11);

    const lineup = [];

    for (const item of squad) {
        const member =
            guild.members.cache
                .get(item.userId);

        if (!member) {
            continue;
        }

        const data =
            getPlayerData(
                guild.id,
                item.userId
            );

        lineup.push({
            userId: item.userId,
            name:
                data.nickname ||
                member.displayName,
            position:
                item.position,
            value:
                Number(data.value) || 0,
            npc: false,
            strength:
                1 +
                Math.min(
                    1,
                    (Number(data.value) || 0) / 100
                )
        });
    }

    let npcIndex = 0;

    while (lineup.length < 11) {
        lineup.push(
            buildNPC(
                team,
                npcIndex++
            )
        );
    }

    return lineup.slice(0, 11);
}

function teamStrength(
    lineup
) {
    return lineup.reduce(
        (total, player) =>
            total +
            (player.strength || 1),
        0
    );
}

function randomPlayer(
    lineup,
    positions = null
) {
    let pool = lineup;

    if (positions) {
        const filtered =
            lineup.filter(
                x =>
                    positions.includes(
                        x.position
                    )
            );

        if (filtered.length) {
            pool = filtered;
        }
    }

    return pool[
        random(
            0,
            pool.length - 1
        )
    ];
}

/* ============================================================
   MAÇ SİSTEMİ
============================================================ */

const activeMatches = new Map();

async function startMatch(
    guild,
    team1,
    team2,
    fixture = null
) {
    const channel =
        findChannel(
            guild,
            MATCH_CHANNEL_ID,
            ["maç", "mac"]
        );

    if (
        !channel ||
        !channel.isTextBased()
    ) {
        console.log(
            `${guild.name}: maç kanalı bulunamadı.`
        );
        return null;
    }

    const matchId =
        `${guild.id}_${Date.now()}`;

    if (activeMatches.has(matchId)) {
        return null;
    }

    const lineup1 =
        buildLineup(
            guild,
            team1
        );

    const lineup2 =
        buildLineup(
            guild,
            team2
        );

    const state = {
        id: matchId,
        guildId: guild.id,
        team1,
        team2,
        lineup1,
        lineup2,
        score1: 0,
        score2: 0,
        minute: 0,
        startedAt: Date.now(),
        fixtureId:
            fixture?.id || null,
        finished: false
    };

    activeMatches.set(
        matchId,
        state
    );

    const embed =
        new EmbedBuilder()
            .setTitle("⚽ AXERA LEAGUE MAÇI")
            .setDescription(
                `🏟️ **${team1}** 0 - 0 **${team2}**\n\n` +
                `⏱️ Maç başlıyor...\n\n` +
                `🎙️ Spiker: Maç başladı!`
            )
            .setTimestamp();

    const matchMessage =
        await channel.send({
            embeds: [embed]
        });

    state.messageId =
        matchMessage.id;

    await sleep(1000);

    for (
        let minute = 1;
        minute <= MATCH_LENGTH;
        minute++
    ) {
        if (
            state.finished
        ) break;

        await sleep(
            MATCH_MINUTE_MS
        );

        state.minute = minute;

        if (minute === 45) {
            await channel.send(
                `⏸️ **DEVRE ARASI**\n` +
                `**${team1}** ${state.score1} - ${state.score2} **${team2}**`
            ).catch(() => {});
        }

        if (Math.random() < 0.035) {
            const power1 =
                teamStrength(lineup1);

            const power2 =
                teamStrength(lineup2);

            const chance =
                power1 /
                (power1 + power2);

            const team1Scores =
                Math.random() < chance;

            const scoringTeam =
                team1Scores
                    ? team1
                    : team2;

            const scoringLineup =
                team1Scores
                    ? lineup1
                    : lineup2;

            const scorer =
                randomPlayer(
                    scoringLineup,
                    ["SNT", "FOR", "OOS", "OS"]
                );

            if (team1Scores) {
                state.score1++;
            } else {
                state.score2++;
            }

            if (
                scorer.userId
            ) {
                const data =
                    getPlayerData(
                        guild.id,
                        scorer.userId
                    );

                data.goals++;
                data.matches++;
            }

            await channel.send(
                `⚽ **GOL!** ${minute}'\n` +
                `**${scoringTeam}**\n` +
                `👤 Gol: **${scorer.name}**\n\n` +
                `📊 **${team1} ${state.score1} - ${state.score2} ${team2}**`
            ).catch(() => {});
        } else if (
            Math.random() < 0.04
        ) {
            const defending =
                Math.random() < 0.5
                    ? lineup1
                    : lineup2;

            const keeper =
                randomPlayer(
                    defending,
                    ["GK", "KL"]
                );

            await channel.send(
                `🧤 **${minute}' KURTARIŞ!**\n` +
                `Kaleci: **${keeper.name}**`
            ).catch(() => {});
        } else if (
            Math.random() < 0.025
        ) {
            const lineup =
                Math.random() < 0.5
                    ? lineup1
                    : lineup2;

            const player =
                randomPlayer(
                    lineup
                );

            await channel.send(
                `🟨 **${minute}' SARI KART**\n` +
                `👤 **${player.name}**`
            ).catch(() => {});
        }

        if (
            minute === 90
        ) {
            await finishMatch(
                guild,
                state,
                channel
            );
        }
    }

    return state;
}

async function finishMatch(
    guild,
    state,
    channel
) {
    if (state.finished) {
        return;
    }

    state.finished = true;

    const guildData =
        getGuildData(
            guild.id
        );

    const p1 =
        getPointsData(
            guild.id,
            state.team1
        );

    const p2 =
        getPointsData(
            guild.id,
            state.team2
        );

    p1.played++;
    p2.played++;

    p1.gf += state.score1;
    p1.ga += state.score2;

    p2.gf += state.score2;
    p2.ga += state.score1;

    let resultText;

    if (
        state.score1 >
        state.score2
    ) {
        p1.wins++;
        p2.losses++;
        p1.points += 3;

        resultText =
            `🏆 **${state.team1} kazandı!**`;
    } else if (
        state.score2 >
        state.score1
    ) {
        p2.wins++;
        p1.losses++;
        p2.points += 3;

        resultText =
            `🏆 **${state.team2} kazandı!**`;
    } else {
        p1.draws++;
        p2.draws++;
        p1.points++;
        p2.points++;

        resultText =
            "🤝 **Maç berabere bitti!**";
    }

    guildData.matches.push({
        id: state.id,
        team1: state.team1,
        team2: state.team2,
        score1: state.score1,
        score2: state.score2,
        date: Date.now()
    });

    if (
        guildData.matches.length > 500
    ) {
        guildData.matches =
            guildData.matches.slice(-500);
    }

    const resultEmbed =
        new EmbedBuilder()
            .setTitle("🏁 MAÇ SONA ERDİ")
            .setDescription(
                `⚽ **${state.team1}** ${state.score1} - ${state.score2} **${state.team2}**\n\n` +
                resultText
            )
            .setTimestamp();

    await channel.send({
        embeds: [resultEmbed]
    }).catch(() => {});

    if (
        state.fixtureId &&
        guildData.fixtures[state.fixtureId]
    ) {
        const fixture =
            guildData.fixtures[
                state.fixtureId
            ];

        fixture.status =
            "finished";

        fixture.score1 =
            state.score1;

        fixture.score2 =
            state.score2;

        fixture.finishedAt =
            Date.now();

        await updateFixtureMessage(
            guild,
            fixture
        );
    }

    saveDatabase();

    await sendPointsTable(
        guild
    );

    activeMatches.delete(
        state.id
    );
}

/* ============================================================
   MANUEL MAÇ
============================================================ */

async function manualMatch(
    message,
    args
) {
    if (!isSpiker(
        message.member
    )) {
        return message.reply(
            "❌ Maç başlatmak için **Spiker** yetkisi gerekir."
        );
    }

    if (
        message.channel.id !==
        MATCH_CHANNEL_ID
    ) {
        return message.reply(
            `❌ Maç komutu yalnızca <#${MATCH_CHANNEL_ID}> kanalında kullanılabilir.`
        );
    }

    const team1 =
        findTeamInMessage(
            message,
            args
        );

    const teamTokens =
        args.join(" ");

    const teamsFound =
        TEAM_NAMES.filter(
            team =>
                normalize(
                    teamTokens
                ).includes(
                    normalize(team)
                )
        );

    const uniqueTeams =
        [...new Set(teamsFound)];

    if (
        uniqueTeams.length < 2
    ) {
        return message.reply(
            "❌ İki farklı takım belirtmelisin.\n" +
            "Örnek: `.maç Galatasaray Fenerbahçe`"
        );
    }

    const first =
        uniqueTeams[0];

    const second =
        uniqueTeams.find(
            x => x !== first
        );

    if (!second) {
        return message.reply(
            "❌ İki farklı takım gerekli."
        );
    }

    await message.reply(
        `⚽ Maç başlatılıyor: **${first}** 🆚 **${second}**`
    );

    startMatch(
        message.guild,
        first,
        second
    );
}

/* ============================================================
   FİKSTÜR
============================================================ */

function parseFixtureDate(
    date,
    time
) {
    if (!date || !time) {
        return NaN;
    }

    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date)
    ) {
        return NaN;
    }

    if (
        !/^\d{2}:\d{2}$/.test(time)
    ) {
        return NaN;
    }

    const [year, month, day] =
        date.split("-").map(Number);

    const [hour, minute] =
        time.split(":").map(Number);

    const value =
        new Date(
            year,
            month - 1,
            day,
            hour,
            minute,
            0,
            0
        );

    return value.getTime();
}

function fixtureEmbed(
    fixture
) {
    let status = "🕐 BEKLENİYOR";

    if (
        fixture.status === "live"
    ) {
        status = "🔴 CANLI";
    }

    if (
        fixture.status === "finished"
    ) {
        status =
            `🏁 SONUÇ: ${fixture.score1} - ${fixture.score2}`;
    }

    const date =
        new Date(
            fixture.timestamp
        );

    return new EmbedBuilder()
        .setTitle("📅 AXERA LEAGUE FİKSTÜR")
        .setDescription(
            `🏟️ **${fixture.team1}** 🆚 **${fixture.team2}**\n\n` +
            `📅 ${date.toLocaleDateString("tr-TR")}\n` +
            `🕐 ${date.toLocaleTimeString("tr-TR", {
                hour: "2-digit",
                minute: "2-digit"
            })}\n\n` +
            `${status}`
        )
        .setFooter({
            text:
                "Axera League Fikstür Sistemi"
        })
        .setTimestamp();
}

async function updateFixtureMessage(
    guild,
    fixture
) {
    const channel =
        getChannel(
            guild,
            "FIKSTUR"
        );

    if (
        !channel ||
        !fixture.messageId
    ) {
        return;
    }

    try {
        const message =
            await channel.messages.fetch(
                fixture.messageId
            );

        await message.edit({
            embeds: [
                fixtureEmbed(
                    fixture
                )
            ]
        });
    } catch {}
}

async function addFixture(
    message,
    args
) {
    if (!isSpiker(
        message.member
    )) {
        return message.reply(
            "❌ Fikstür eklemek için **Spiker** yetkisi gerekir."
        );
    }

    const teamMatches =
        TEAM_NAMES.filter(
            team =>
                normalize(
                    args.join(" ")
                ).includes(
                    normalize(team)
                )
        );

    const teams =
        [...new Set(teamMatches)];

    if (teams.length < 2) {
        return message.reply(
            "❌ İki takım yazmalısın."
        );
    }

    const date =
        args.find(
            x =>
                /^\d{4}-\d{2}-\d{2}$/.test(x)
        );

    const time =
        args.find(
            x =>
                /^\d{2}:\d{2}$/.test(x)
        );

    const timestamp =
        parseFixtureDate(
            date,
            time
        );

    if (!Number.isFinite(timestamp)) {
        return message.reply(
            "❌ Tarih formatı hatalı.\n" +
            "Örnek: `.fiksturekle Galatasaray Fenerbahçe 2026-09-10 20:30`"
        );
    }

    if (
        timestamp <= Date.now()
    ) {
        return message.reply(
            "❌ Geçmiş bir tarih giremezsin."
        );
    }

    const guildData =
        getGuildData(
            message.guild.id
        );

    const id =
        `${Date.now()}_${random(1000,9999)}`;

    const fixture = {
        id,
        team1: teams[0],
        team2: teams[1],
        timestamp,
        status: "pending",
        score1: null,
        score2: null,
        messageId: null
    };

    guildData.fixtures[id] =
        fixture;

    const channel =
        getChannel(
            message.guild,
            "FIKSTUR"
        );

    if (!channel) {
        return message.reply(
            "❌ Fikstür kanalı bulunamadı."
        );
    }

    const sent =
        await channel.send({
            embeds: [
                fixtureEmbed(
                    fixture
                )
            ]
        });

    fixture.messageId =
        sent.id;

    saveDatabase();

    return message.reply(
        `✅ Fikstür oluşturuldu.\n` +
        `⚽ **${teams[0]}** 🆚 **${teams[1]}**\n` +
        `📅 ${date} ${time}`
    );
}

/* ============================================================
   FİKSTÜR LİSTELE
============================================================ */

async function listFixtures(
    message
) {
    const guildData =
        getGuildData(
            message.guild.id
        );

    const fixtures =
        Object.values(
            guildData.fixtures
        )
            .sort(
                (a, b) =>
                    a.timestamp -
                    b.timestamp
            );

    if (!fixtures.length) {
        return message.reply(
            "📅 Henüz fikstür bulunmuyor."
        );
    }

    const lines =
        fixtures.slice(0, 25).map(
            (fixture, index) => {
                const date =
                    new Date(
                        fixture.timestamp
                    );

                let result =
                    "🕐 Bekliyor";

                if (
                    fixture.status ===
                    "finished"
                ) {
                    result =
                        `🏁 ${fixture.score1} - ${fixture.score2}`;
                }

                if (
                    fixture.status ===
                    "live"
                ) {
                    result =
                        "🔴 CANLI";
                }

                return (
                    `**${index + 1}.** ${fixture.team1} 🆚 ${fixture.team2}\n` +
                    `> ${date.toLocaleDateString("tr-TR")} ${date.toLocaleTimeString("tr-TR", {
                        hour: "2-digit",
                        minute: "2-digit"
                    })} — ${result}`
                );
            }
        );

    return message.reply({
        embeds: [
            new EmbedBuilder()
                .setTitle(
                    "📅 AXERA LEAGUE FİKSTÜR"
                )
                .setDescription(
                    lines.join("\n\n")
                )
        ]
    });
}

/* ============================================================
   FİKSTÜR OTOMATİĞİ
============================================================ */

let fixtureSchedulerRunning = false;

async function fixtureScheduler() {
    if (fixtureSchedulerRunning) {
        return;
    }

    fixtureSchedulerRunning = true;

    try {
        for (
            const guild
            of client.guilds.cache.values()
        ) {
            const guildData =
                getGuildData(
                    guild.id
                );

            for (
                const fixture
                of Object.values(
                    guildData.fixtures
                )
            ) {
                if (
                    fixture.status !==
                    "pending"
                ) {
                    continue;
                }

                if (
                    fixture.timestamp >
                    Date.now()
                ) {
                    continue;
                }

                fixture.status =
                    "live";

                saveDatabase();

                await updateFixtureMessage(
                    guild,
                    fixture
                );

                startMatch(
                    guild,
                    fixture.team1,
                    fixture.team2,
                    fixture
                ).catch(
                    console.error
                );
            }
        }
    } finally {
        fixtureSchedulerRunning = false;
    }
}

/* ============================================================
   DM SİSTEMİ
============================================================ */

async function dmCommand(
    message,
    args
) {
    if (!isAdmin(
        message.member
    )) {
        return message.reply(
            "❌ Bu komutu yalnızca Bot Sahibi veya Administrator kullanabilir."
        );
    }

    const target =
        message.mentions.members.first();

    if (target) {
        const mention =
            message.mentions.users.first();

        const content =
            args
                .filter(
                    x =>
                        !extractMentionId(x)
                )
                .join(" ")
                .trim();

        if (!content) {
            return message.reply(
                "❌ DM mesajını yaz."
            );
        }

        try {
            await target.send(
                content
            );

            return message.reply(
                `✅ ${target} kullanıcısına DM gönderildi.`
            );
        } catch {
            return message.reply(
                "❌ Kullanıcıya DM gönderilemedi."
            );
        }
    }

    const text =
        args.join(" ").trim();

    if (!text) {
        return message.reply(
            "❌ Mesaj yazmalısın."
        );
    }

    if (
        normalize(args[0]) !== "all"
    ) {
        return message.reply(
            "❌ Kullanım:\n" +
            "`.dm @Oyuncu mesaj`\n" +
            "`.dm all mesaj`"
        );
    }

    const content =
        args.slice(1).join(" ");

    if (!content) {
        return message.reply(
            "❌ DM mesajını yaz."
        );
    }

    await message.reply(
        "📩 Toplu DM gönderimi başlatıldı."
    );

    let success = 0;
    let failed = 0;

    for (
        const member
        of message.guild.members.cache.values()
    ) {
        if (member.user.bot) {
            continue;
        }

        try {
            await member.send(
                content
            );

            success++;
        } catch {
            failed++;
        }

        await sleep(400);
    }

    await message.channel.send(
        `📩 **DM SİSTEMİ TAMAMLANDI**\n` +
        `✅ Başarılı: **${success}**\n` +
        `❌ Başarısız: **${failed}**`
    );
}

/* ============================================================
   MODERASYON
============================================================ */

async function deleteMessages(
    message,
    args
) {
    if (!isAdmin(
        message.member
    )) {
        return message.reply(
            "❌ Administrator yetkisi gerekli."
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
            "❌ 1-100 arasında miktar yaz."
        );
    }

    const deleted =
        await message.channel.bulkDelete(
            amount + 1,
            true
        ).catch(() => null);

    if (!deleted) {
        return message.reply(
            "❌ Mesajlar silinemedi."
        );
    }

    const info =
        await message.channel.send(
            `🗑️ **${deleted.size - 1}** mesaj silindi.`
        );

    setTimeout(
        () =>
            info.delete().catch(() => {}),
        3000
    );
}

async function lockChannel(
    message
) {
    if (!isAdmin(
        message.member
    )) {
        return message.reply(
            "❌ Administrator yetkisi gerekli."
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

async function unlockChannel(
    message
) {
    if (!isAdmin(
        message.member
    )) {
        return message.reply(
            "❌ Administrator yetkisi gerekli."
        );
    }

    await message.channel.permissionOverwrites.edit(
        message.guild.roles.everyone,
        {
            SendMessages: true
        }
    );

    return message.reply(
        "🔓 Kanal açıldı."
    );
}

async function giveRole(
    message
) {
    if (!isAdmin(
        message.member
    )) {
        return message.reply(
            "❌ Administrator yetkisi gerekli."
        );
    }

    const member =
        await getMentionedMember(
            message,
            0
        );

    const roleMention =
        message.mentions.roles.first();

    if (!member || !roleMention) {
        return message.reply(
            "❌ Kullanım: `.rolver @Oyuncu @Rol`"
        );
    }

    await member.roles.add(
        roleMention
    ).catch(() => {});

    return message.reply(
        `✅ ${roleMention} rolü ${member} kullanıcısına verildi.`
    );
}

/* ============================================================
   EMBED
============================================================ */

async function createCustomEmbed(
    message,
    args
) {
    if (!isAdmin(
        message.member
    )) {
        return message.reply(
            "❌ Administrator yetkisi gerekli."
        );
    }

    const text =
        args.join(" ");

    if (!text) {
        return message.reply(
            "❌ Kullanım: `.embed Başlık | Açıklama`"
        );
    }

    const [title, description] =
        text.split("|");

    const embed =
        new EmbedBuilder()
            .setTitle(
                title?.trim() ||
                "Axera League"
            )
            .setDescription(
                description?.trim() ||
                ""
            )
            .setTimestamp();

    await message.channel.send({
        embeds: [embed]
    });

    return message.delete()
        .catch(() => {});
}

/* ============================================================
   TWEET
============================================================ */

async function tweetCommand(
    message,
    args
) {
    if (!isAdmin(
        message.member
    )) {
        return message.reply(
            "❌ Administrator yetkisi gerekli."
        );
    }

    const text =
        args.join(" ").trim();

    if (!text) {
        return message.reply(
            "❌ Tweet metni yaz."
        );
    }

    const embed =
        new EmbedBuilder()
            .setAuthor({
                name:
                    message.member.displayName
            })
            .setDescription(
                text
            )
            .setFooter({
                text:
                    "Axera League • Haber Merkezi"
            })
            .setTimestamp();

    await message.channel.send({
        embeds: [embed]
    });
}

/* ============================================================
   ÇEKİLİŞ
============================================================ */

function giveawayButton(id) {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `giveaway_join_${id}`
                )
                .setLabel("Katıl")
                .setEmoji("🎉")
                .setStyle(
                    ButtonStyle.Success
                )
        );
}

async function giveawayCommand(
    message,
    args
) {
    if (!isAdmin(
        message.member
    )) {
        return message.reply(
            "❌ Administrator yetkisi gerekli."
        );
    }

    const minutes =
        Number(args[0]);

    const prize =
        args.slice(1).join(" ");

    if (
        !Number.isFinite(minutes) ||
        minutes <= 0 ||
        !prize
    ) {
        return message.reply(
            "❌ Kullanım: `.çekiliş 10 10M€`"
        );
    }

    const guildData =
        getGuildData(
            message.guild.id
        );

    const id =
        `${Date.now()}_${random(1000,9999)}`;

    guildData.giveaways[id] = {
        id,
        prize,
        endsAt:
            Date.now() +
            minutes * 60 * 1000,
        participants: [],
        messageId: null,
        ended: false
    };

    const embed =
        new EmbedBuilder()
            .setTitle("🎉 ÇEKİLİŞ")
            .setDescription(
                `🎁 Ödül: **${prize}**\n\n` +
                `⏱️ Süre: **${minutes} dakika**\n\n` +
                `Katılmak için butona bas!`
            )
            .setTimestamp();

    const sent =
        await message.channel.send({
            embeds: [embed],
            components: [
                giveawayButton(id)
            ]
        });

    guildData.giveaways[id]
        .messageId = sent.id;

    saveDatabase();

    setTimeout(
        () =>
            finishGiveaway(
                message.guild,
                id
            ).catch(console.error),
        minutes * 60 * 1000
    );

    return message.reply(
        "✅ Çekiliş başlatıldı."
    );
}

async function finishGiveaway(
    guild,
    id
) {
    const guildData =
        getGuildData(
            guild.id
        );

    const giveaway =
        guildData.giveaways[id];

    if (
        !giveaway ||
        giveaway.ended
    ) {
        return;
    }

    giveaway.ended = true;

    const channel =
        guild.channels.cache.find(
            ch =>
                ch.isTextBased() &&
                ch.messages
        );

    let winner = null;

    if (
        giveaway.participants.length
    ) {
        const winnerId =
            giveaway.participants[
                random(
                    0,
                    giveaway.participants.length - 1
                )
            ];

        winner =
            guild.members.cache.get(
                winnerId
            );
    }

    if (giveaway.messageId) {
        for (
            const ch
            of guild.channels.cache.values()
        ) {
            if (!ch.isTextBased()) continue;

            try {
                const msg =
                    await ch.messages.fetch(
                        giveaway.messageId
                    );

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            "🏁 ÇEKİLİŞ SONA ERDİ"
                        )
                        .setDescription(
                            `🎁 Ödül: **${giveaway.prize}**\n\n` +
                            (
                                winner
                                    ? `🏆 Kazanan: ${winner}`
                                    : "❌ Katılımcı bulunamadı."
                            )
                        )
                        .setTimestamp();

                await msg.edit({
                    embeds: [embed],
                    components: []
                });

                if (winner) {
                    await ch.send(
                        `🎉 Tebrikler ${winner}! **${giveaway.prize}** kazandın!`
                    );
                }

                break;
            } catch {}
        }
    }

    saveDatabase();
}

/* ============================================================
   ÇEKİLİŞ BUTONU
============================================================ */

async function handleGiveawayButton(
    interaction
) {
    const parts =
        interaction.customId.split("_");

    const id = parts[2];

    const giveaway =
        getGuildData(
            interaction.guild.id
        ).giveaways[id];

    if (
        !giveaway ||
        giveaway.ended
    ) {
        return interaction.reply({
            content:
                "❌ Bu çekiliş sona ermiş.",
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
                "⚠️ Zaten çekilişe katıldın.",
            ephemeral: true
        });
    }

    giveaway.participants.push(
        interaction.user.id
    );

    saveDatabase();

    return interaction.reply({
        content:
            "🎉 Çekilişe katıldın!",
        ephemeral: true
    });
}

/* ============================================================
   TICKET
============================================================ */

function ticketButton() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(
                    "ticket_create"
                )
                .setLabel("Ticket Aç")
                .setEmoji("🎫")
                .setStyle(
                    ButtonStyle.Primary
                )
        );
}

async function ticketPanel(
    message
) {
    if (!isAdmin(
        message.member
    )) {
        return message.reply(
            "❌ Administrator yetkisi gerekli."
        );
    }

    const embed =
        new EmbedBuilder()
            .setTitle(
                "🎫 AXERA LEAGUE DESTEK"
            )
            .setDescription(
                "Destek almak için aşağıdaki butona basarak ticket oluşturabilirsin."
            );

    await message.channel.send({
        embeds: [embed],
        components: [
            ticketButton()
        ]
    });
}

async function createTicket(
    interaction
) {
    const guild =
        interaction.guild;

    const existing =
        guild.channels.cache.find(
            ch =>
                ch.name ===
                `ticket-${normalize(
                    interaction.user.username
                )}`
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
                `ticket-${normalize(
                    interaction.user.username
                )}`.slice(0, 90),
            type:
                ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id:
                        guild.roles.everyone.id,
                    deny: [
                        PermissionsBitField.Flags.ViewChannel
                    ]
                },
                {
                    id:
                        interaction.user.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory
                    ]
                }
            ]
        }).catch(() => null);

    if (!channel) {
        return interaction.reply({
            content:
                "❌ Ticket oluşturulamadı.",
            ephemeral: true
        });
    }

    const staffRole =
        getRegistrationRole(
            guild
        );

    if (staffRole) {
        await channel.permissionOverwrites.edit(
            staffRole,
            {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true
            }
        ).catch(() => {});
    }

    const closeRow =
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        "ticket_close"
                    )
                    .setLabel("Ticket Kapat")
                    .setEmoji("🔒")
                    .setStyle(
                        ButtonStyle.Danger
                    )
            );

    await channel.send({
        content:
            `${interaction.user}`,
        embeds: [
            new EmbedBuilder()
                .setTitle(
                    "🎫 DESTEK TICKETI"
                )
                .setDescription(
                    "Yetkili en kısa sürede ilgilenecektir.\n\n" +
                    "60 dakika boyunca mesaj gönderilmezse ticket otomatik kapatılabilir."
                )
        ],
        components: [closeRow]
    });

    return interaction.reply({
        content:
            `✅ Ticket oluşturuldu: ${channel}`,
        ephemeral: true
    });
}

async function closeTicket(
    interaction
) {
    if (
        !interaction.channel.name.startsWith(
            "ticket-"
        )
    ) {
        return interaction.reply({
            content:
                "❌ Bu kanal bir ticket değil.",
            ephemeral: true
        });
    }

    await interaction.reply(
        "🔒 Ticket kapatılıyor..."
    );

    setTimeout(
        () =>
            interaction.channel
                .delete()
                .catch(() => {}),
        1500
    );
}

/* ============================================================
   KUPA SİSTEMİ
============================================================ */

async function addTrophy(
    message,
    args
) {
    if (!isAdmin(
        message.member
    )) {
        return message.reply(
            "❌ Administrator yetkisi gerekli."
        );
    }

    const team =
        findTeamInMessage(
            message,
            args
        );

    const trophy =
        args
            .filter(
                x =>
                    normalize(x) !==
                    normalize(team)
            )
            .join(" ")
            .trim();

    if (!team || !trophy) {
        return message.reply(
            "❌ Kullanım: `.kupaekle Galatasaray Süper Lig`"
        );
    }

    const guildData =
        getGuildData(
            message.guild.id
        );

    guildData.trophies[team] ||=
        [];

    guildData.trophies[team]
        .push({
            name: trophy,
            date: Date.now()
        });

    saveDatabase();

    return message.reply(
        `🏆 **${team}** takımına **${trophy}** kupası eklendi.`
    );
}

async function removeTrophy(
    message,
    args
) {
    if (!isAdmin(
        message.member
    )) {
        return message.reply(
            "❌ Administrator yetkisi gerekli."
        );
    }

    const team =
        findTeamInMessage(
            message,
            args
        );

    if (!team) {
        return message.reply(
            "❌ Takım bulunamadı."
        );
    }

    const guildData =
        getGuildData(
            message.guild.id
        );

    const list =
        guildData.trophies[team] ||
        [];

    if (!list.length) {
        return message.reply(
            "❌ Bu takımda kupa yok."
        );
    }

    const removed =
        list.pop();

    saveDatabase();

    return message.reply(
        `🗑️ **${removed.name}** kupası silindi.`
    );
}

async function showTrophies(
    message,
    args
) {
    const team =
        findTeamInMessage(
            message,
            args
        );

    if (!team) {
        return message.reply(
            "❌ Takım belirtmelisin."
        );
    }

    const list =
        getGuildData(
            message.guild.id
        ).trophies[team] || [];

    const description =
        list.length
            ? list.map(
                (x, i) =>
                    `🏆 **${i + 1}.** ${x.name}`
            ).join("\n")
            : "Henüz kupa yok.";

    return message.reply({
        embeds: [
            new EmbedBuilder()
                .setTitle(
                    `🏆 ${team} KUPALARI`
                )
                .setDescription(
                    description
                )
        ]
    });
}

/* ============================================================
   ASİST KRALI
============================================================ */

async function assistCommand(
    message,
    args
) {
    if (
        !isSpiker(message.member) &&
        !isAdmin(message.member)
    ) {
        return message.reply(
            "❌ Spiker veya Administrator yetkisi gerekli."
        );
    }

    const member =
        await getMentionedMember(
            message,
            0
        );

    if (!member) {
        return message.reply(
            "❌ Oyuncuyu etiketle."
        );
    }

    const data =
        getPlayerData(
            message.guild.id,
            member.id
        );

    data.assists++;

    saveDatabase();

    return message.reply(
        `🎯 ${member} oyuncusuna **+1 asist** yazıldı.\n` +
        `Toplam asist: **${data.assists}**`
    );
}

async function assistKing(
    message
) {
    const players =
        Object.entries(
            getGuildData(
                message.guild.id
            ).players
        )
            .map(
                ([id, data]) => ({
                    id,
                    assists:
                        Number(
                            data.assists
                        ) || 0,
                    nickname:
                        data.nickname ||
                        id
                })
            )
            .filter(
                x =>
                    x.assists > 0
            )
            .sort(
                (a, b) =>
                    b.assists -
                    a.assists
            )
            .slice(0, 10);

    if (!players.length) {
        return message.reply(
            "🎯 Henüz asist bulunmuyor."
        );
    }

    const lines =
        players.map(
            (p, i) =>
                `**${i + 1}.** <@${p.id}> — **${p.assists} asist**`
        );

    return message.reply({
        embeds: [
            new EmbedBuilder()
                .setTitle(
                    "🎯 ASİST KRALLIĞI"
                )
                .setDescription(
                    lines.join("\n")
                )
        ]
    });
}

/* ============================================================
   DİL
============================================================ */

async function languageCommand(
    message,
    args
) {
    const language =
        args.join(" ").trim();

    if (!language) {
        return message.reply(
            "🌐 Mevcut dil: **Türkçe**"
        );
    }

    const guildData =
        getGuildData(
            message.guild.id
        );

    guildData.settings.language =
        language;

    saveDatabase();

    return message.reply(
        `🌐 Sunucu dili **${language}** olarak ayarlandı.`
    );
}

/* ============================================================
   BOT DURUMU
============================================================ */

let lastStatusSlot = "";

function uptimeText() {
    const seconds =
        Math.floor(
            (Date.now() -
                db.botStartedAt) /
            1000
        );

    const hours =
        Math.floor(
            seconds / 3600
        );

    const minutes =
        Math.floor(
            (seconds % 3600) / 60
        );

    return `${hours} saat ${minutes} dakika`;
}

async function sendBotStatus() {
    const now = new Date();

    const slot =
        `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;

    if (
        now.getMinutes() !== 0 &&
        now.getMinutes() !== 30
    ) {
        return;
    }

    if (
        now.getSeconds() !== 0
    ) {
        return;
    }

    if (
        lastStatusSlot === slot
    ) {
        return;
    }

    lastStatusSlot = slot;

    for (
        const guild
        of client.guilds.cache.values()
    ) {
        const channel =
            getChannel(
                guild,
                "BOT_DURUM"
            );

        if (
            !channel ||
            !channel.isTextBased()
        ) {
            continue;
        }

        const text =
            `🤖 **BOT DURUMU**\n` +
            `🟢 Tüm sistemler sorunsuz çalışıyor.\n` +
            `⏱️ Çalışma Süresi: ${uptimeText()}\n` +
            `🕐 Son Kontrol: ${now.toLocaleTimeString("tr-TR", {
                hour: "2-digit",
                minute: "2-digit"
            })}`;

        await channel.send(
            text
        ).catch(() => {});
    }
}

/* ============================================================
   YARDIM
============================================================ */

async function helpCommand(
    message
) {
    const embed =
        new EmbedBuilder()
            .setTitle(
                "📚 AXERA LEAGUE KOMUTLARI"
            )
            .setDescription(
                [
                    "**👤 KAYIT**",
                    "`.k @oyuncu TakmaAdı`",
                    "`.kayıtsızver @oyuncu`",
                    "`.ara oyuncu isim`",
                    "",
                    "**💰 DEĞER / BÜTÇE**",
                    "`.dver @oyuncu miktar`",
                    "`.dsil @oyuncu miktar`",
                    "`.bütçe`",
                    "`.bütçeekle @oyuncu miktar`",
                    "`.bütçesil @oyuncu miktar`",
                    "`.gönder @oyuncu miktar`",
                    "",
                    "**⚽ FUTBOL**",
                    "`.ant` / `.antrenman`",
                    "`.pen` / `.penaltı`",
                    "`.kadro @takım`",
                    "`.kadroekle @takım @oyuncu Pozisyon`",
                    "`.kadrosil @takım @oyuncu`",
                    "`.maç @takım1 @takım2`",
                    "",
                    "**📋 TRANSFER**",
                    "`.kap @oyuncu @takım maaş sezon`",
                    "",
                    "**📅 LİG**",
                    "`.fiksturekle @takım1 @takım2 YYYY-MM-DD HH:MM`",
                    "`.fisktür`",
                    "`.puan`",
                    "",
                    "**🎯 İSTATİSTİK**",
                    "`.asist @oyuncu`",
                    "`.asistkral`",
                    "",
                    "**🛡️ YÖNETİM**",
                    "`.sil miktar`",
                    "`.kilit`",
                    "`.aç`",
                    "`.rolver @oyuncu @rol`",
                    "`.embed Başlık | Açıklama`",
                    "`.tweet mesaj`",
                    "",
                    "**🎫 DİĞER**",
                    "`.ticketpanel`",
                    "`.çekiliş dakika ödül`",
                    "`.kupaekle @takım kupa`",
                    "`.kupasil @takım`",
                    "`.kupalar @takım`",
                    "`.dm @oyuncu mesaj`",
                    "`.dm all mesaj`",
                    "`.dil Türkçe`"
                ].join("\n")
            )
            .setFooter({
                text:
                    "Axera League • Prefix: ."
            });

    return message.reply({
        embeds: [embed]
    });
}

/* ============================================================
   PUAN KOMUTU
============================================================ */

async function pointsCommand(
    message
) {
    return message.reply({
        embeds: [
            createPointsEmbed(
                message.guild.id
            )
        ]
    });
}

/* ============================================================
   HAZIRLIK
============================================================ */

client.once(
    "ready",
    async () => {
        console.log(
            `✅ ${client.user.tag} olarak giriş yapıldı.`
        );

        console.log(
            `🏟️ ${client.guilds.cache.size} sunucuda aktif.`
        );

        client.user.setPresence({
            activities: [
                {
                    name:
                        "Axera League ⚽",
                    type: 3
                }
            ],
            status: "online"
        });

        for (
            const guild
            of client.guilds.cache.values()
        ) {
            initializeTeams(
                guild.id
            );
        }

        console.log(
            "✅ Database hazır."
        );
    }
);

/* ============================================================
   SUNUCUYA YENİ ÜYE
============================================================ */

client.on(
    "guildMemberAdd",
    async member => {
        if (member.user.bot) {
            return;
        }

        const data =
            getPlayerData(
                member.guild.id,
                member.id
            );

        data.registered = false;

        const role =
            getUnregisteredRole(
                member.guild
            );

        if (role) {
            await member.roles.add(
                role
            ).catch(() => {});
        }

        saveDatabase();

        const channel =
            getChannel(
                member.guild,
                "KAYIT"
            );

        const staff =
            getRegistrationRole(
                member.guild
            );

        if (channel) {
            await channel.send({
                content:
                    `${staff || ""} ${member}`,
                embeds: [
                    new EmbedBuilder()
                        .setTitle(
                            "👤 YENİ ÜYE"
                        )
                        .setDescription(
                            `${member} sunucuya katıldı.\n\n` +
                            `📝 Kayıt için yetkilinin işlem yapması gerekiyor.`
                        )
                        .setTimestamp()
                ]
            }).catch(() => {});
        }
    }
);

/* ============================================================
   BUTONLAR
============================================================ */

client.on(
    "interactionCreate",
    async interaction => {
        if (
            !interaction.isButton()
        ) {
            return;
        }

        try {
            if (
                interaction.customId
                    .startsWith(
                        "register_"
                    )
            ) {
                const type =
                    interaction.customId
                        .split("_")[2];

                return completeRegistration(
                    interaction,
                    type
                );
            }

            if (
                interaction.customId
                    .startsWith(
                        "kap_"
                    )
            ) {
                return handleKapButton(
                    interaction
                );
            }

            if (
                interaction.customId
                    .startsWith(
                        "giveaway_join_"
                    )
            ) {
                return handleGiveawayButton(
                    interaction
                );
            }

            if (
                interaction.customId ===
                "ticket_create"
            ) {
                return createTicket(
                    interaction
                );
            }

            if (
                interaction.customId ===
                "ticket_close"
            ) {
                return closeTicket(
                    interaction
                );
            }
        } catch (error) {
            console.error(
                "Interaction hatası:",
                error
            );

            if (
                interaction.replied ||
                interaction.deferred
            ) {
                await interaction.followUp({
                    content:
                        "❌ İşlem sırasında hata oluştu.",
                    ephemeral: true
                }).catch(() => {});
            } else {
                await interaction.reply({
                    content:
                        "❌ İşlem sırasında hata oluştu.",
                    ephemeral: true
                }).catch(() => {});
            }
        }
    }
);

/* ============================================================
   MESAJ KOMUT SİSTEMİ
============================================================ */

client.on(
    "messageCreate",
    async message => {
        if (message.author.bot) {
            return;
        }

        if (!message.guild) {
            return;
        }

        if (
            !message.content.startsWith(
                PREFIX
            )
        ) {
            return;
        }

        const content =
            message.content.slice(
                PREFIX.length
            ).trim();

        if (!content) {
            return;
        }

        const parts =
            content.split(/\s+/);

        const command =
            normalize(
                parts.shift()
            );

        const args =
            parts;

        try {
            /* ==================================================
               KAYIT
            ================================================== */

            if (
                command === "k"
            ) {
                return handleRegistrationCommand(
                    message,
                    args
                );
            }

            if (
                command === "kayitsizver" ||
                command === "kayıtsızver"
            ) {
                return unregisterPlayer(
                    message,
                    args
                );
            }

            if (
                command === "ara"
            ) {
                if (
                    normalize(args[0]) ===
                    "oyuncu"
                ) {
                    return playerSearch(
                        message,
                        args.slice(1)
                    );
                }

                return playerSearch(
                    message,
                    args
                );
            }

            /* ==================================================
               DEĞER
            ================================================== */

            if (
                command === "dver"
            ) {
                return giveValue(
                    message,
                    args
                );
            }

            if (
                command === "dsil"
            ) {
                return removeValue(
                    message,
                    args
                );
            }

            /* ==================================================
               BÜTÇE
            ================================================== */

            if (
                command === "butce" ||
                command === "bütçe"
            ) {
                return showBudget(
                    message,
                    args
                );
            }

            if (
                command === "butceekle" ||
                command === "bütçeekle"
            ) {
                return addBudget(
                    message,
                    args
                );
            }

            if (
                command === "butcesil" ||
                command === "bütçesil"
            ) {
                return removeBudget(
                    message,
                    args
                );
            }

            if (
                command === "gonder" ||
                command === "gönder"
            ) {
                return sendBudget(
                    message,
                    args
                );
            }

            /* ==================================================
               FUTBOL
            ================================================== */

            if (
                command === "ant" ||
                command === "antrenman"
            ) {
                return training(
                    message
                );
            }

            if (
                command === "pen" ||
                command === "penalti" ||
                command === "penaltı"
            ) {
                return penalty(
                    message
                );
            }

            /* ==================================================
               KADRO
            ================================================== */

            if (
                command === "kadroekle"
            ) {
                return addSquadPlayer(
                    message,
                    args
                );
            }

            if (
                command === "kadrosil"
            ) {
                return removeSquadPlayer(
                    message,
                    args
                );
            }

            if (
                command === "kadro"
            ) {
                return showSquad(
                    message,
                    args
                );
            }

            /* ==================================================
               MAÇ
            ================================================== */

            if (
                command === "mac" ||
                command === "maç"
            ) {
                return manualMatch(
                    message,
                    args
                );
            }

            /* ==================================================
               KAP
            ================================================== */

            if (
                command === "kap"
            ) {
                return makeTransferOffer(
                    message,
                    args
                );
            }

            /* ==================================================
               FİKSTÜR
            ================================================== */

            if (
                command === "fiksturekle"
            ) {
                return addFixture(
                    message,
                    args
                );
            }

            if (
                command === "fikstur" ||
                command === "fikstür" ||
                command === "fisktur" ||
                command === "fisktür"
            ) {
                return listFixtures(
                    message
                );
            }

            /* ==================================================
               PUAN
            ================================================== */

            if (
                command === "puan"
            ) {
                return pointsCommand(
                    message
                );
            }

            /* ==================================================
               DM
            ================================================== */

            if (
                command === "dm"
            ) {
                return dmCommand(
                    message,
                    args
                );
            }

            /* ==================================================
               MODERASYON
            ================================================== */

            if (
                command === "sil"
            ) {
                return deleteMessages(
                    message,
                    args
                );
            }

            if (
                command === "kilit"
            ) {
                return lockChannel(
                    message
                );
            }

            if (
                command === "ac" ||
                command === "aç"
            ) {
                return unlockChannel(
                    message
                );
            }

            if (
                command === "rolver"
            ) {
                return giveRole(
                    message
                );
            }

            if (
                command === "embed"
            ) {
                return createCustomEmbed(
                    message,
                    args
                );
            }

            /* ==================================================
               TWEET
            ================================================== */

            if (
                command === "tweet"
            ) {
                return tweetCommand(
                    message,
                    args
                );
            }

            /* ==================================================
               ÇEKİLİŞ
            ================================================== */

            if (
                command === "cekilis" ||
                command === "çekiliş"
            ) {
                return giveawayCommand(
                    message,
                    args
                );
            }

            /* ==================================================
               TICKET
            ================================================== */

            if (
                command === "ticketpanel"
            ) {
                return ticketPanel(
                    message
                );
            }

            /* ==================================================
               KUPA
            ================================================== */

            if (
                command === "kupaekle"
            ) {
                return addTrophy(
                    message,
                    args
                );
            }

            if (
                command === "kupasil"
            ) {
                return removeTrophy(
                    message,
                    args
                );
            }

            if (
                command === "kupalar" ||
                command === "kupa"
            ) {
                return showTrophies(
                    message,
                    args
                );
            }

            /* ==================================================
               ASİST
            ================================================== */

            if (
                command === "asist"
            ) {
                return assistCommand(
                    message,
                    args
                );
            }

            if (
                command === "asistkral"
            ) {
                return assistKing(
                    message
                );
            }

            /* ==================================================
               DİL
            ================================================== */

            if (
                command === "dil"
            ) {
                return languageCommand(
                    message,
                    args
                );
            }

            /* ==================================================
               YARDIM
            ================================================== */

            if (
                command === "yardim" ||
                command === "yardım" ||
                command === "help"
            ) {
                return helpCommand(
                    message
                );
            }

        } catch (error) {
            console.error(
                `Komut hatası [${command}]:`,
                error
            );

            await message.reply(
                "❌ Komut çalıştırılırken bir hata oluştu."
            ).catch(() => {});
        }
    }
);

/* ============================================================
   OTOMATİK SİSTEMLER
============================================================ */

setInterval(
    () => {
        fixtureScheduler()
            .catch(console.error);
    },
    1000
);

setInterval(
    () => {
        sendBotStatus()
            .catch(console.error);
    },
    1000
);

/* ============================================================
   HATALAR
============================================================ */

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

process.on(
    "SIGINT",
    () => {
        forceSave();
        process.exit(0);
    }
);

process.on(
    "SIGTERM",
    () => {
        forceSave();
        process.exit(0);
    }
);

/* ============================================================
   LOGIN - EN SONDA
============================================================ */

if (!TOKEN) {
    console.error(
        "❌ TOKEN bulunamadı! Hosting ortam değişkenlerine TOKEN ekle."
    );
    process.exit(1);
}

client.login(process.env.TOKEN);
