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
   FOOTBALL RP DISCORD BOT
   ========================================================= */

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

const OWNER_ID = "1280275560739897409";

const ROLE_IDS = {
    kayitYetkilisi: "1534456315366342716",
    degerYetkilisi: "1534456192913375382",
    kayitsiz: "1534457560134844517",

    kaleci: "1534492034243498195",
    uye: "1534457460163608636",
    futbolcu: "1534457228986421278",
    teknikDirektor: "1534456648930693120",

    spiker: "1535251168169697390"
};

const TEAM_ROLE_IDS = {
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

const CHANNEL_IDS = {
    kayit: "1534460177884123276",
    sohbet: "1534469475917758586",
    antrenman: "1534474070798762197",
    penalti: "1534474327812997192",
    fikstur: "1534475908566483075",
    puan: "1534475991404253284",
    mac: "1534477626872168541",
    durum: "1545921149018570842"
};

/* =========================================================
   VERİTABANI
   ========================================================= */

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "database.json");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

let database = {};

function loadDatabase() {
    if (!fs.existsSync(DB_FILE)) {
        database = {};
        saveDatabase();
        return;
    }

    try {
        const raw = fs.readFileSync(DB_FILE, "utf8");
        database = JSON.parse(raw || "{}");
    } catch (error) {
        console.error("Database okunamadı:", error);
        database = {};
        saveDatabase();
    }
}

function saveDatabase() {
    try {
        fs.writeFileSync(
            DB_FILE,
            JSON.stringify(database, null, 2),
            "utf8"
        );
    } catch (error) {
        console.error("Database kaydedilemedi:", error);
    }
}

loadDatabase();

function createGuildDatabase() {
    return {
        users: {},
        teams: {},
        fixtures: [],
        matches: [],
        points: {},
        trophies: [],
        tickets: {},
        offers: {},
        stats: {
            totalMatches: 0,
            totalGoals: 0
        }
    };
}

function guildDB(guildId) {
    if (!database[guildId]) {
        database[guildId] = createGuildDatabase();
    }

    const db = database[guildId];

    if (!db.users) db.users = {};
    if (!db.teams) db.teams = {};
    if (!db.fixtures) db.fixtures = [];
    if (!db.matches) db.matches = [];
    if (!db.points) db.points = {};
    if (!db.trophies) db.trophies = [];
    if (!db.tickets) db.tickets = {};
    if (!db.offers) db.offers = {};
    if (!db.stats) {
        db.stats = {
            totalMatches: 0,
            totalGoals: 0
        };
    }

    return db;
}

/* =========================================================
   GENEL FONKSİYONLAR
   ========================================================= */

function normalize(text = "") {
    return String(text)
        .toLocaleLowerCase("tr-TR")
        .replace(/ı/g, "i")
        .replace(/ğ/g, "g")
        .replace(/ü/g, "u")
        .replace(/ş/g, "s")
        .replace(/ö/g, "o")
        .replace(/ç/g, "c")
        .trim();
}

function isOwner(message) {
    return message.author?.id === OWNER_ID ||
        message.user?.id === OWNER_ID;
}

function hasRole(member, roleId) {
    return Boolean(
        member &&
        member.roles &&
        member.roles.cache &&
        member.roles.cache.has(roleId)
    );
}

function isAdmin(message) {
    if (isOwner(message)) return true;

    return Boolean(
        message.member &&
        message.member.permissions &&
        message.member.permissions.has(
            PermissionsBitField.Flags.Administrator
        )
    );
}

function isValueStaff(message) {
    return (
        isOwner(message) ||
        hasRole(message.member, ROLE_IDS.degerYetkilisi)
    );
}

function isRegistrationStaff(message) {
    return (
        isOwner(message) ||
        hasRole(message.member, ROLE_IDS.kayitYetkilisi)
    );
}

function isSpiker(message) {
    return (
        isOwner(message) ||
        hasRole(message.member, ROLE_IDS.spiker)
    );
}

function getChannel(guild, id, fallbackName = null) {
    if (!guild) return null;

    let channel = guild.channels.cache.get(id);

    if (channel) return channel;

    if (fallbackName) {
        channel = guild.channels.cache.find(
            c => normalize(c.name) === normalize(fallbackName)
        );
    }

    return channel || null;
}

function getRole(guild, id, fallbackName = null) {
    if (!guild) return null;

    let role = guild.roles.cache.get(id);

    if (role) return role;

    if (fallbackName) {
        role = guild.roles.cache.find(
            r => normalize(r.name) === normalize(fallbackName)
        );
    }

    return role || null;
}

/* =========================================================
   PARA / DEĞER
   ========================================================= */

function parseAmount(text) {
    if (!text) return NaN;

    let value = String(text)
        .replace(/[€₺$]/gi, "")
        .replace(/m/gi, "")
        .replace(/\s/g, "")
        .replace(",", ".");

    return Number(value);
}

function formatValue(value) {
    let number = Number(value || 0);

    if (!Number.isFinite(number)) {
        number = 0;
    }

    let text = number.toFixed(2);

    text = text
        .replace(/\.00$/, "")
        .replace(/(\.\d)0$/, "$1");

    return `${text}M€`;
}

function extractValueFromNickname(nickname = "") {
    const match = nickname.match(
        /(-?\d+(?:[.,]\d+)?)\s*M€\s*$/i
    );

    if (!match) return 0;

    return Number(
        match[1].replace(",", ".")
    ) || 0;
}

function ensureUser(db, memberOrId) {
    const id =
        typeof memberOrId === "string"
            ? memberOrId
            : memberOrId.id;

    if (!db.users[id]) {
        db.users[id] = {
            userId: id,
            nickname: "",
            value: 0,
            budget: 0,
            team: null,
            salary: 0,
            seasons: 0,
            position: null,
            registered: false,
            training: 0,
            goals: 0,
            assists: 0,
            saves: 0,
            yellowCards: 0
        };
    }

    const user = db.users[id];

    if (typeof user.value !== "number") user.value = 0;
    if (typeof user.budget !== "number") user.budget = 0;
    if (typeof user.training !== "number") user.training = 0;
    if (typeof user.goals !== "number") user.goals = 0;
    if (typeof user.assists !== "number") user.assists = 0;
    if (typeof user.saves !== "number") user.saves = 0;
    if (typeof user.yellowCards !== "number") {
        user.yellowCards = 0;
    }

    return user;
}

async function setNicknameValue(member, value) {
    if (!member) return;

    const current =
        member.nickname ||
        member.user.username;

    const newValue = formatValue(
        Math.max(0, Number(value) || 0)
    );

    let newNickname;

    if (
        /\d+(?:[.,]\d+)?\s*M€\s*$/i.test(current)
    ) {
        newNickname = current.replace(
            /\d+(?:[.,]\d+)?\s*M€\s*$/i,
            newValue
        );
    } else {
        newNickname = `${current} | ${newValue}`;
    }

    if (newNickname.length > 32) {
        return;
    }

    await member
        .setNickname(newNickname)
        .catch(() => {});
}

async function syncUserValueFromNickname(db, member) {
    const user = ensureUser(db, member);

    const nicknameValue =
        extractValueFromNickname(
            member.nickname ||
            member.user.username
        );

    if (
        nicknameValue > 0 &&
        user.value === 0
    ) {
        user.value = nicknameValue;
        saveDatabase();
    }

    return user.value;
}

async function addPlayerValue(
    guild,
    member,
    amount
) {
    const db = guildDB(guild.id);
    const user = ensureUser(db, member);

    await syncUserValueFromNickname(
        db,
        member
    );

    const numericAmount =
        Number(amount);

    if (
        !Number.isFinite(numericAmount) ||
        numericAmount <= 0
    ) {
        return user.value;
    }

    user.value += numericAmount;

    await setNicknameValue(
        member,
        user.value
    );

    saveDatabase();

    return user.value;
}

async function subtractPlayerValue(
    guild,
    member,
    amount
) {
    const db = guildDB(guild.id);
    const user = ensureUser(db, member);

    await syncUserValueFromNickname(
        db,
        member
    );

    const numericAmount =
        Number(amount);

    if (
        !Number.isFinite(numericAmount) ||
        numericAmount <= 0
    ) {
        return user.value;
    }

    user.value = Math.max(
        0,
        user.value - numericAmount
    );

    await setNicknameValue(
        member,
        user.value
    );

    saveDatabase();

    return user.value;
}

/* =========================================================
   TAKIM SİSTEMİ
   ========================================================= */

function getTeamNameByRoleId(roleId) {
    return Object.entries(
        TEAM_ROLE_IDS
    ).find(([, id]) => id === roleId)?.[0] || null;
}

function getTeamRole(guild, teamName) {
    const roleId =
        TEAM_ROLE_IDS[teamName];

    if (!roleId) return null;

    return guild.roles.cache.get(roleId) || null;
}

function getTeamFromMember(member) {
    if (!member) return null;

    for (
        const [team, roleId]
        of Object.entries(TEAM_ROLE_IDS)
    ) {
        if (
            member.roles.cache.has(roleId)
        ) {
            return team;
        }
    }

    return null;
}

function getMentionedTeamRoles(message) {
    return [
        ...message.mentions.roles.values()
    ]
        .map(role => ({
            role,
            name: getTeamNameByRoleId(role.id)
        }))
        .filter(x => x.name);
}

function getTeamFromMentionIndex(
    message,
    index = 0
) {
    const teams =
        getMentionedTeamRoles(message);

    return teams[index]?.name || null;
}

function ensureTeam(db, team) {
    if (!db.teams[team]) {
        db.teams[team] = {
            budget: 0,
            players: []
        };
    }

    if (
        !Array.isArray(
            db.teams[team].players
        )
    ) {
        db.teams[team].players = [];
    }

    if (
        typeof db.teams[team].budget !== "number"
    ) {
        db.teams[team].budget = 0;
    }

    return db.teams[team];
}

function getTeamSquad(db, team) {
    return ensureTeam(db, team).players;
}

/* =========================================================
   MENTION TEMİZLEME
   ========================================================= */

function cleanCommandArguments(
    message
) {
    let args =
        message.content
            .slice(1)
            .trim()
            .split(/\s+/);

    args.shift();

    args = args.filter(arg => {
        if (/^<@!?\d+>$/.test(arg)) {
            return false;
        }

        if (/^<@&\d+>$/.test(arg)) {
            return false;
        }

        return true;
    });

    return args;
}

function getMentionedMembers(message) {
    return [
        ...message.mentions.members.values()
    ];
}

/* =========================================================
   KADRO
   ========================================================= */

function getRealSquad(
    guild,
    team
) {
    const db = guildDB(guild.id);
    const squad = getTeamSquad(db, team);

    return squad
        .map(entry => {
            const user =
                db.users[entry.userId];

            if (!user) return null;

            return {
                userId: entry.userId,
                name:
                    entry.name ||
                    user.nickname ||
                    "Oyuncu",
                position:
                    entry.position ||
                    user.position ||
                    "OY",
                value:
                    Number(user.value || 0),
                npc: false
            };
        })
        .filter(Boolean);
}

function getMatchSquad(
    guild,
    team
) {
    const realPlayers =
        getRealSquad(guild, team);

    const result = [
        ...realPlayers
    ];

    let npcIndex = 1;

    while (result.length < 11) {
        result.push({
            userId: null,
            name:
                `${team} Akademi NPC ${npcIndex}`,
            position: "OY",
            value: 1,
            npc: true
        });

        npcIndex++;
    }

    return result.slice(0, 11);
}

function calculateSquadValue(
    guild,
    team
) {
    return getRealSquad(
        guild,
        team
    ).reduce(
        (sum, player) =>
            sum + Number(player.value || 0),
        0
    );
}

/* =========================================================
   PUAN SİSTEMİ
   ========================================================= */

function ensurePoints(db, team) {
    if (!db.points[team]) {
        db.points[team] = {
            played: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            gf: 0,
            ga: 0,
            points: 0
        };
    }

    return db.points[team];
}

function getSortedPoints(db) {
    return Object.entries(
        db.points
    ).sort(([, a], [, b]) => {
        if (b.points !== a.points) {
            return b.points - a.points;
        }

        const gdA =
            a.gf - a.ga;

        const gdB =
            b.gf - b.ga;

        if (gdB !== gdA) {
            return gdB - gdA;
        }

        return b.gf - a.gf;
    });
}

async function sendPointsTable(
    guild
) {
    const db =
        guildDB(guild.id);

    const channel =
        getChannel(
            guild,
            CHANNEL_IDS.puan,
            "puan"
        );

    if (!channel) return;

    const entries =
        getSortedPoints(db);

    const description =
        entries.length
            ? entries.map(
                ([team, data], index) =>
                    `**${index + 1}. ${team}**\n` +
                    `🏟️ ${data.played} M | ` +
                    `🟢 ${data.wins} G | ` +
                    `🟡 ${data.draws} B | ` +
                    `🔴 ${data.losses} M | ` +
                    `⚽ ${data.gf}:${data.ga} | ` +
                    `🏆 **${data.points} P**`
            ).join("\n\n")
            : "Henüz maç oynanmadı.";

    await channel.send({
        embeds: [
            new EmbedBuilder()
                .setTitle(
                    "🏆 AXERA LEAGUE PUAN DURUMU"
                )
                .setDescription(
                    description
                )
                .setFooter({
                    text:
                        "Axera League • Puan Durumu"
                })
                .setTimestamp()
        ]
    }).catch(() => {});
}

async function updatePointsAfterMatch(
    guild,
    match
) {
    const db =
        guildDB(guild.id);

    const a =
        ensurePoints(
            db,
            match.team1
        );

    const b =
        ensurePoints(
            db,
            match.team2
        );

    a.played++;
    b.played++;

    a.gf += match.score1;
    a.ga += match.score2;

    b.gf += match.score2;
    b.ga += match.score1;

    if (
        match.score1 >
        match.score2
    ) {
        a.wins++;
        a.points += 3;
        b.losses++;
    } else if (
        match.score2 >
        match.score1
    ) {
        b.wins++;
        b.points += 3;
        a.losses++;
    } else {
        a.draws++;
        b.draws++;

        a.points++;
        b.points++;
    }

    saveDatabase();

    await sendPointsTable(
        guild
    );
}

/* =========================================================
   MAÇ SİSTEMİ
   ========================================================= */

const activeMatches =
    new Map();

function matchKey(
    guildId,
    team1,
    team2
) {
    return [
        guildId,
        ...[
            team1,
            team2
        ].sort()
    ].join(":");
}

function createMatchEmbed(
    match
) {
    const finished =
        match.finished;

    const minute =
        finished
            ? 90
            : Math.min(
                match.minute,
                90
            );

    return new EmbedBuilder()
        .setTitle(
            `⚽ ${match.team1} - ${match.team2}`
        )
        .setDescription(
            finished
                ? "🏁 **MAÇ SONA ERDİ**"
                : "🟢 **MAÇ CANLI**"
        )
        .addFields(
            {
                name:
                    "📊 SKOR",
                value:
                    `# **${match.score1} - ${match.score2}**`,
                inline: false
            },
            {
                name:
                    `🏠 ${match.team1}`,
                value:
                    `Değer: **${formatValue(
                        calculateSquadValue(
                            match.guild,
                            match.team1
                        )
                    )}**`,
                inline: true
            },
            {
                name:
                    `🚌 ${match.team2}`,
                value:
                    `Değer: **${formatValue(
                        calculateSquadValue(
                            match.guild,
                            match.team2
                        )
                    )}**`,
                inline: true
            },
            {
                name:
                    "⏱️ Dakika",
                value:
                    `**${minute}'**`,
                inline: false
            }
        )
        .setFooter({
            text:
                "Axera League • Canlı Maç"
        })
        .setTimestamp();
}

function randomItem(
    array
) {
    if (!array.length) {
        return null;
    }

    return array[
        Math.floor(
            Math.random() *
            array.length
        )
    ];
}

function chooseScoringTeam(
    match
) {
    const value1 =
        Math.max(
            1,
            calculateSquadValue(
                match.guild,
                match.team1
            )
        );

    const value2 =
        Math.max(
            1,
            calculateSquadValue(
                match.guild,
                match.team2
            )
        );

    const chance1 =
        value1 /
        (value1 + value2);

    return Math.random() <
        chance1
        ? 1
        : 2;
}

async function sendMatchEvent(
    channel,
    text
) {
    if (!channel) return;

    await channel.send({
        content: text
    }).catch(() => {});
}

async function finishMatch(
    guild,
    match
) {
    if (match.finished) {
        return;
    }

    match.finished = true;
    match.minute = 90;

    if (match.interval) {
        clearInterval(
            match.interval
        );
    }

    await match.message
        ?.edit({
            embeds: [
                createMatchEmbed(
                    match
                )
            ]
        })
        .catch(() => {});

    const db =
        guildDB(guild.id);

    db.matches.push({
        id: match.id,
        team1: match.team1,
        team2: match.team2,
        score1: match.score1,
        score2: match.score2,
        date: Date.now()
    });

    db.stats.totalMatches++;

    activeMatches.delete(
        matchKey(
            guild.id,
            match.team1,
            match.team2
        )
    );

    if (match.fixtureId) {
        const fixture =
            db.fixtures.find(
                f =>
                    f.id ===
                    match.fixtureId
            );

        if (fixture) {
            fixture.status =
                "finished";

            fixture.score1 =
                match.score1;

            fixture.score2 =
                match.score2;

            const channel =
                getChannel(
                    guild,
                    CHANNEL_IDS.fikstur,
                    "fikstur"
                );

            if (
                channel &&
                fixture.messageId
            ) {
                const msg =
                    await channel.messages
                        .fetch(
                            fixture.messageId
                        )
                        .catch(
                            () => null
                        );

                if (msg) {
                    await msg.edit({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle(
                                    "📅 AXERA LEAGUE FİKSTÜR"
                                )
                                .setDescription(
                                    `⚽ **${fixture.team1}** vs **${fixture.team2}**\n\n` +
                                    `🏁 **Maç Tamamlandı**\n` +
                                    `📊 Sonuç: **${match.score1} - ${match.score2}**`
                                )
                                .setFooter({
                                    text:
                                        "Axera League • Fikstür"
                                })
                                .setTimestamp()
                        ]
                    }).catch(
                        () => {}
                    );
                }
            }
        }
    }

    saveDatabase();

    await updatePointsAfterMatch(
        guild,
        match
    );

    await sendMatchEvent(
        match.channel,
        `🏁 **MAÇ SONA ERDİ!**\n⚽ ${match.team1} **${match.score1} - ${match.score2}** ${match.team2}`
    );
}

async function startMatch(
    guild,
    team1,
    team2,
    fixture = null
) {
    const key =
        matchKey(
            guild.id,
            team1,
            team2
        );

    if (
        activeMatches.has(key)
    ) {
        return null;
    }

    const channel =
        getChannel(
            guild,
            CHANNEL_IDS.mac,
            "mac"
        );

    if (!channel) {
        throw new Error(
            "Maç kanalı bulunamadı."
        );
    }

    const match = {
        id:
            `${Date.now()}-${Math.random()}`,
        guild,
        team1,
        team2,
        score1: 0,
        score2: 0,
        minute: 0,
        finished: false,
        fixtureId:
            fixture?.id || null,
        squad1:
            getMatchSquad(
                guild,
                team1
            ),
        squad2:
            getMatchSquad(
                guild,
                team2
            ),
        message: null,
        channel,
        interval: null
    };

    const message =
        await channel.send({
            embeds: [
                createMatchEmbed(
                    match
                )
            ]
        });

    match.message =
        message;

    activeMatches.set(
        key,
        match
    );

    if (fixture) {
        fixture.status =
            "live";

        fixture.matchId =
            match.id;
    }

    saveDatabase();

    match.interval =
        setInterval(
            async () => {
                if (
                    match.finished
                ) {
                    clearInterval(
                        match.interval
                    );
                    return;
                }

                match.minute++;

                let event = null;

                /*
                 * GOL OLASILIĞI
                 * Dakika başına yaklaşık %5.5
                 */
                if (
                    match.minute !== 45 &&
                    Math.random() < 0.055
                ) {
                    const teamNumber =
                        chooseScoringTeam(
                            match
                        );

                    const scoringTeam =
                        teamNumber === 1
                            ? match.team1
                            : match.team2;

                    const squad =
                        teamNumber === 1
                            ? match.squad1
                            : match.squad2;

                    const player =
                        randomItem(
                            squad
                        );

                    if (
                        teamNumber === 1
                    ) {
                        match.score1++;
                    } else {
                        match.score2++;
                    }

                    const db =
                        guildDB(
                            guild.id
                        );

                    db.stats.totalGoals++;

                    if (
                        player &&
                        !player.npc &&
                        player.userId
                    ) {
                        const user =
                            ensureUser(
                                db,
                                player.userId
                            );

                        user.goals =
                            (user.goals || 0) + 1;

                        /*
                         * Rastgele asist
                         */
                        if (
                            Math.random() <
                            0.65
                        ) {
                            user.assists =
                                (user.assists || 0) + 1;
                        }
                    }

                    event =
                        `⚽ **${match.minute}' GOL!**\n` +
                        `🎯 **${scoringTeam}**\n` +
                        `👤 ${player?.name || "Oyuncu"}\n` +
                        `📊 **${match.score1} - ${match.score2}**`;
                }

                /*
                 * SARI KART
                 */
                if (
                    !event &&
                    Math.random() <
                    0.025
                ) {
                    const side =
                        Math.random() < 0.5
                            ? match.squad1
                            : match.squad2;

                    const player =
                        randomItem(
                            side
                        );

                    if (
                        player &&
                        !player.npc &&
                        player.userId
                    ) {
                        const db =
                            guildDB(
                                guild.id
                            );

                        const user =
                            ensureUser(
                                db,
                                player.userId
                            );

                        user.yellowCards =
                            (user.yellowCards || 0) + 1;
                    }

                    event =
                        `🟨 **${match.minute}' SARI KART!**\n` +
                        `👤 ${player?.name || "Oyuncu"} sarı kart gördü.`;
                }

                /*
                 * DEVRE ARASI
                 */
                if (
                    match.minute === 45
                ) {
                    event =
                        `⏸️ **DEVRE ARASI**\n` +
                        `📊 ${match.team1} **${match.score1} - ${match.score2}** ${match.team2}`;
                }

                await match.message
                    ?.edit({
                        embeds: [
                            createMatchEmbed(
                                match
                            )
                        ]
                    })
                    .catch(
                        () => {}
                    );

                if (event) {
                    await sendMatchEvent(
                        channel,
                        event
                    );
                }

                saveDatabase();

                if (
                    match.minute >= 90
                ) {
                    await finishMatch(
                        guild,
                        match
                    );
                }
            },
            3000
        );

    return match;
}

/* =========================================================
   FİKSTÜR
   ========================================================= */

function parseDateTime(
    dateText,
    timeText
) {
    if (
        !dateText ||
        !timeText
    ) {
        return null;
    }

    const dateMatch =
        dateText.match(
            /^(\d{4})-(\d{2})-(\d{2})$/
        );

    const timeMatch =
        timeText.match(
            /^(\d{1,2}):(\d{2})$/
        );

    if (
        !dateMatch ||
        !timeMatch
    ) {
        return null;
    }

    const year =
        Number(dateMatch[1]);

    const month =
        Number(dateMatch[2]);

    const day =
        Number(dateMatch[3]);

    const hour =
        Number(timeMatch[1]);

    const minute =
        Number(timeMatch[2]);

    if (
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > 31 ||
        hour < 0 ||
        hour > 23 ||
        minute < 0 ||
        minute > 59
    ) {
        return null;
    }

    const date =
        new Date(
            year,
            month - 1,
            day,
            hour,
            minute,
            0
        );

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }

    return date;
}

async function checkFixtures() {
    for (
        const guild
        of client.guilds.cache.values()
    ) {
        const db =
            guildDB(guild.id);

        const now =
            Date.now();

        for (
            const fixture
            of db.fixtures
        ) {
            if (
                fixture.status !==
                "scheduled"
            ) {
                continue;
            }

            if (
                fixture.timestamp >
                now
            ) {
                continue;
            }

            const key =
                matchKey(
                    guild.id,
                    fixture.team1,
                    fixture.team2
                );

            if (
                activeMatches.has(key)
            ) {
                continue;
            }

            await startMatch(
                guild,
                fixture.team1,
                fixture.team2,
                fixture
            ).catch(
                console.error
            );
        }
    }
}

/* =========================================================
   KAYIT SİSTEMİ
   ========================================================= */

const registrationSessions =
    new Map();

function registrationButtons() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(
                    "register_goalkeeper"
                )
                .setLabel(
                    "🧤 Kaleci"
                )
                .setStyle(
                    ButtonStyle.Primary
                ),

            new ButtonBuilder()
                .setCustomId(
                    "register_member"
                )
                .setLabel(
                    "👤 Üye"
                )
                .setStyle(
                    ButtonStyle.Secondary
                ),

            new ButtonBuilder()
                .setCustomId(
                    "register_player"
                )
                .setLabel(
                    "⚽ Futbolcu"
                )
                .setStyle(
                    ButtonStyle.Success
                ),

            new ButtonBuilder()
                .setCustomId(
                    "register_td"
                )
                .setLabel(
                    "📋 Teknik Direktör"
                )
                .setStyle(
                    ButtonStyle.Danger
                )
        );
}

client.on(
    "guildMemberAdd",
    async member => {
        const role =
            getRole(
                member.guild,
                ROLE_IDS.kayitsiz,
                "kayıtsız"
            );

        if (role) {
            await member.roles
                .add(role)
                .catch(() => {});
        }

        const channel =
            getChannel(
                member.guild,
                CHANNEL_IDS.kayit,
                "kayıt"
            );

        if (!channel) return;

        const kayitRole =
            getRole(
                member.guild,
                ROLE_IDS.kayitYetkilisi
            );

        await channel.send(
            `👋 ${member} sunucuya katıldı!\n` +
            `📋 Kayıt için ${kayitRole || "Kayıt Yetkilisi"} ilgilenebilir.`
        ).catch(() => {});
    }
);

/* =========================================================
   BUTONLAR
   ========================================================= */

client.on(
    "interactionCreate",
    async interaction => {
        if (
            !interaction.isButton()
        ) {
            return;
        }

        /* =====================
           KAYIT BUTONLARI
           ===================== */

        if (
            interaction.customId
                .startsWith(
                    "register_"
                )
        ) {
            const session =
                registrationSessions.get(
                    interaction.message.id
                );

            if (!session) {
                return interaction.reply({
                    content:
                        "❌ Bu kayıt panelinin süresi dolmuş.",
                    ephemeral: true
                });
            }

            if (
                interaction.user.id !==
                session.createdBy
            ) {
                return interaction.reply({
                    content:
                        "❌ Bu paneli yalnızca kayıt yetkilisi kullanabilir.",
                    ephemeral: true
                });
            }

            const member =
                await interaction.guild.members
                    .fetch(
                        session.targetId
                    )
                    .catch(
                        () => null
                    );

            if (!member) {
                return interaction.reply({
                    content:
                        "❌ Oyuncu bulunamadı.",
                    ephemeral: true
                });
            }

            let roleId = null;
            let roleName = "";

            switch (
                interaction.customId
            ) {
                case "register_goalkeeper":
                    roleId =
                        ROLE_IDS.kaleci;
                    roleName =
                        "Kaleci";
                    break;

                case "register_member":
                    roleId =
                        ROLE_IDS.uye;
                    roleName =
                        "Üye";
                    break;

                case "register_player":
                    roleId =
                        ROLE_IDS.futbolcu;
                    roleName =
                        "Futbolcu";
                    break;

                case "register_td":
                    roleId =
                        ROLE_IDS.teknikDirektor;
                    roleName =
                        "Teknik Direktör";
                    break;
            }

            if (!roleId) {
                return;
            }

            const db =
                guildDB(
                    interaction.guild.id
                );

            const role =
                getRole(
                    interaction.guild,
                    roleId
                );

            if (role) {
                await member.roles
                    .add(role)
                    .catch(() => {});
            }

            const allRegistrationRoles = [
                ROLE_IDS.kaleci,
                ROLE_IDS.uye,
                ROLE_IDS.futbolcu,
                ROLE_IDS.teknikDirektor
            ];

            for (
                const id
                of allRegistrationRoles
            ) {
                if (id !== roleId) {
                    await member.roles
                        .remove(id)
                        .catch(
                            () => {}
                        );
                }
            }

            const kayitsiz =
                getRole(
                    interaction.guild,
                    ROLE_IDS.kayitsiz
                );

            if (kayitsiz) {
                await member.roles
                    .remove(
                        kayitsiz
                    )
                    .catch(
                        () => {}
                    );
            }

            const user =
                ensureUser(
                    db,
                    member
                );

            user.nickname =
                session.nickname;

            user.position =
                roleName;

            user.registered =
                true;

            saveDatabase();

            await interaction.update({
                content:
                    `✅ ${member} başarıyla kayıt edildi!\n\n` +
                    `👤 Takma Ad: **${session.nickname}**\n` +
                    `🎭 Tür: **${roleName}**`,
                components: []
            });

            registrationSessions.delete(
                interaction.message.id
            );

            const sohbet =
                getChannel(
                    interaction.guild,
                    CHANNEL_IDS.sohbet,
                    "sohbet"
                );

            if (sohbet) {
                await sohbet.send(
                    `🎉 Hoş geldin ${member}! **Axera League** ailesine katıldın.`
                ).catch(
                    () => {}
                );
            }

            return;
        }

        /* =====================
           KAP KABUL
           ===================== */

        if (
            interaction.customId
                .startsWith(
                    "kap_accept_"
                )
        ) {
            const id =
                interaction.customId
                    .replace(
                        "kap_accept_",
                        ""
                    );

            const db =
                guildDB(
                    interaction.guild.id
                );

            const offer =
                db.offers[id];

            if (!offer) {
                return interaction.reply({
                    content:
                        "❌ Teklif bulunamadı.",
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

            const player =
                await interaction.guild.members
                    .fetch(
                        offer.playerId
                    )
                    .catch(
                        () => null
                    );

            if (!player) {
                return interaction.reply({
                    content:
                        "❌ Oyuncu bulunamadı.",
                    ephemeral: true
                });
            }

            const user =
                ensureUser(
                    db,
                    player
                );

            if (user.team) {
                return interaction.reply({
                    content:
                        `❌ Zaten **${user.team}** takımındasın.`,
                    ephemeral: true
                });
            }

            user.team =
                offer.team;

            user.salary =
                offer.salary;

            user.seasons =
                offer.seasons;

            const squad =
                getTeamSquad(
                    db,
                    offer.team
                );

            if (
                !squad.some(
                    p =>
                        p.userId ===
                        player.id
                )
            ) {
                squad.push({
                    userId:
                        player.id,
                    name:
                        player.nickname ||
                        player.user.username,
                    position:
                        user.position ||
                        "OY"
                });
            }

            const teamRole =
                getTeamRole(
                    interaction.guild,
                    offer.team
                );

            if (teamRole) {
                await player.roles
                    .add(teamRole)
                    .catch(() => {});
            }

            delete db.offers[id];

            saveDatabase();

            await interaction.update({
                content:
                    `✅ **KAP KABUL EDİLDİ**\n\n` +
                    `👤 Oyuncu: ${player}\n` +
                    `🏟️ Takım: **${offer.team}**\n` +
                    `💰 Maaş: **${formatValue(offer.salary)}**\n` +
                    `📅 Sözleşme: **${offer.seasons} sezon**\n` +
                    `💰 Toplam: **${formatValue(
                        offer.salary *
                        offer.seasons
                    )}**`,
                components: []
            });

            return;
        }

        /* =====================
           KAP RED
           ===================== */

        if (
            interaction.customId
                .startsWith(
                    "kap_reject_"
                )
        ) {
            const id =
                interaction.customId
                    .replace(
                        "kap_reject_",
                        ""
                    );

            const db =
                guildDB(
                    interaction.guild.id
                );

            const offer =
                db.offers[id];

            if (!offer) {
                return interaction.reply({
                    content:
                        "❌ Teklif bulunamadı.",
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

            delete db.offers[id];

            saveDatabase();

            await interaction.update({
                content:
                    "❌ KAP teklifi reddedildi.",
                components: []
            });

            return;
        }

        /* =====================
           TICKET OLUŞTUR
           ===================== */

        if (
            interaction.customId ===
            "ticket_create"
        ) {
            const guild =
                interaction.guild;

            const existing =
                guild.channels.cache.find(
                    c =>
                        c.name ===
                        `ticket-${interaction.user.id}`
                );

            if (existing) {
                return interaction.reply({
                    content:
                        `🎫 Zaten açık ticketın var: ${existing}`,
                    ephemeral: true
                });
            }

            const channel =
                await guild.channels.create({
                    name:
                        `ticket-${interaction.user.id}`,
                    type:
                        ChannelType.GuildText,
                    permissionOverwrites: [
                        {
                            id:
                                guild.id,
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
                });

            await channel.send({
                content:
                    `${interaction.user}`,
                embeds: [
                    new EmbedBuilder()
                        .setTitle(
                            "🎫 AXERA LEAGUE TICKET"
                        )
                        .setDescription(
                            "Yetkililer kısa süre içerisinde ilgilenecektir."
                        )
                ],
                components: [
                    new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(
                                    "ticket_close"
                                )
                                .setLabel(
                                    "🔒 Ticket Kapat"
                                )
                                .setStyle(
                                    ButtonStyle.Danger
                                )
                        )
                ]
            });

            await interaction.reply({
                content:
                    `🎫 Ticket oluşturuldu: ${channel}`,
                ephemeral: true
            });

            return;
        }

        /* =====================
           TICKET KAPAT
           ===================== */

        if (
            interaction.customId ===
            "ticket_close"
        ) {
            if (
                !isAdmin({
                    author:
                        interaction.user,
                    member:
                        interaction.member
                })
            ) {
                return interaction.reply({
                    content:
                        "❌ Yetkin yok.",
                    ephemeral: true
                });
            }

            await interaction.channel
                .delete()
                .catch(() => {});

            return;
        }
    }
);

/* =========================================================
   MESAJ SİSTEMİ
   ========================================================= */

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
            !message.content.startsWith(".")
        ) {
            return;
        }

        const db =
            guildDB(
                message.guild.id
            );

        ensureUser(
            db,
            message.member
        );

        const raw =
            message.content
                .slice(1)
                .trim();

        const split =
            raw.split(/\s+/);

        const command =
            normalize(
                split.shift() || ""
            );

        const args =
            split;

        /* =================================================
           YARDIM
           ================================================= */

        if (
            command === "yardim" ||
            command === "yardım"
        ) {
            return message.reply({
                embeds: [
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
                                "**💰 DEĞER**",
                                "`.dver @oyuncu 5M`",
                                "`.dsil @oyuncu 5M`",
                                "",
                                "**💳 BÜTÇE**",
                                "`.bütçe`",
                                "`.gönder @oyuncu 5M`",
                                "`.bütçeekle @oyuncu 5M`",
                                "`.bütçesil @oyuncu 5M`",
                                "",
                                "**⚽ FUTBOL**",
                                "`.ant`",
                                "`.pen`",
                                "`.kap @oyuncu @takım 5M 3`",
                                "`.kadroekle @takım @oyuncu ST`",
                                "`.kadrosil @takım @oyuncu`",
                                "`.kadro @takım`",
                                "`.maç @takım1 @takım2`",
                                "",
                                "**📅 LİG**",
                                "`.fiksturekle @takım1 @takım2 2026-09-10 20:00`",
                                "`.puan`",
                                "",
                                "**🏟️ TAKIM**",
                                "`.takımbütçe @takım`",
                                "`.takımbütçegönder @takım 10M`",
                                "",
                                "**🛠️ YÖNETİM**",
                                "`.embed Başlık | Açıklama`",
                                "`.rolver @üye @rol`",
                                "`.kilit`",
                                "`.aç`",
                                "`.sil 10`",
                                "`.dm @oyuncu mesaj`",
                                "`.dm all mesaj`",
                                "`.ticketpanel`",
                                "`.rolpanel`",
                                "`.kupaekle Kupa`",
                                "`.kupasil Kupa`",
                                "`.asistkral`",
                                "`.tweet mesaj`"
                            ].join("\n")
                        )
                        .setFooter({
                            text:
                                "Axera League • Yardım"
                        })
                ]
            });
        }

        /* =================================================
           KAYIT
           ================================================= */

        if (
            command === "k" ||
            command === "kayit" ||
            command === "kayıt"
        ) {
            if (
                !isRegistrationStaff(
                    message
                )
            ) {
                return message.reply(
                    "❌ Bu komutu sadece Kayıt Yetkilisi kullanabilir."
                );
            }

            const target =
                message.mentions.members.first();

            const cleanedArgs =
                cleanCommandArguments(
                    message
                );

            const nickname =
                cleanedArgs.join(" ");

            if (
                !target ||
                !nickname
            ) {
                return message.reply(
                    "❌ Kullanım: `.k @oyuncu TakmaAdı`"
                );
            }

            const channel =
                getChannel(
                    message.guild,
                    CHANNEL_IDS.kayit,
                    "kayıt"
                );

            if (!channel) {
                return message.reply(
                    "❌ Kayıt kanalı bulunamadı."
                );
            }

            const panel =
                await channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                "📋 AXERA LEAGUE KAYIT"
                            )
                            .setDescription(
                                `${target} için kayıt türünü seçin.\n\n` +
                                `👤 Takma Ad: **${nickname}**\n\n` +
                                `🧤 Kaleci\n` +
                                `👤 Üye\n` +
                                `⚽ Futbolcu\n` +
                                `📋 Teknik Direktör`
                            )
                            .setFooter({
                                text:
                                    "Axera League • Kayıt"
                            })
                    ],
                    components: [
                        registrationButtons()
                    ]
                });

            registrationSessions.set(
                panel.id,
                {
                    targetId:
                        target.id,
                    nickname,
                    createdBy:
                        message.author.id,
                    createdAt:
                        Date.now()
                }
            );

            return message.reply(
                `✅ ${target} için kayıt paneli oluşturuldu: ${panel.url}`
            );
        }

        /* =================================================
           KAYITSIZ VER
           ================================================= */

        if (
            command === "kayitsizver" ||
            command === "kayıtsızver"
        ) {
            if (
                !isRegistrationStaff(
                    message
                )
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            const target =
                message.mentions.members.first();

            if (!target) {
                return message.reply(
                    "❌ Kullanım: `.kayıtsızver @oyuncu`"
                );
            }

            for (
                const roleId
                of [
                    ROLE_IDS.kaleci,
                    ROLE_IDS.uye,
                    ROLE_IDS.futbolcu,
                    ROLE_IDS.teknikDirektor
                ]
            ) {
                await target.roles
                    .remove(roleId)
                    .catch(() => {});
            }

            for (
                const roleId
                of Object.values(
                    TEAM_ROLE_IDS
                )
            ) {
                await target.roles
                    .remove(roleId)
                    .catch(() => {});
            }

            const kayitsiz =
                getRole(
                    message.guild,
                    ROLE_IDS.kayitsiz
                );

            if (kayitsiz) {
                await target.roles
                    .add(kayitsiz)
                    .catch(() => {});
            }

            const user =
                ensureUser(
                    db,
                    target
                );

            user.registered =
                false;

            user.team =
                null;

            saveDatabase();

            return message.reply(
                `✅ ${target} tekrar **Kayıtsız** durumuna getirildi.`
            );
        }

        /* =================================================
           DEĞER VER
           ================================================= */

        if (
            command === "dver" ||
            command === "degerver" ||
            command === "değerver"
        ) {
            if (
                !isValueStaff(
                    message
                )
            ) {
                return message.reply(
                    "❌ Bu komutu sadece Değer Yetkilisi kullanabilir."
                );
            }

            const target =
                message.mentions.members.first();

            const cleaned =
                cleanCommandArguments(
                    message
                );

            const amount =
                parseAmount(
                    cleaned[0]
                );

            if (
                !target ||
                !Number.isFinite(amount) ||
                amount <= 0
            ) {
                return message.reply(
                    "❌ Kullanım: `.dver @oyuncu 5M`"
                );
            }

            const oldValue =
                await syncUserValueFromNickname(
                    db,
                    target
                );

            const newValue =
                await addPlayerValue(
                    message.guild,
                    target,
                    amount
                );

            return message.reply(
                `✅ ${target} değerine **+${formatValue(amount)}** eklendi.\n` +
                `📊 Eski değer: **${formatValue(oldValue)}**\n` +
                `💰 Yeni değer: **${formatValue(newValue)}**`
            );
        }

        /* =================================================
           DEĞER SİL
           ================================================= */

        if (
            command === "dsil" ||
            command === "degersil" ||
            command === "değersil"
        ) {
            if (
                !isValueStaff(
                    message
                )
            ) {
                return message.reply(
                    "❌ Bu komutu sadece Değer Yetkilisi kullanabilir."
                );
            }

            const target =
                message.mentions.members.first();

            const cleaned =
                cleanCommandArguments(
                    message
                );

            const amount =
                parseAmount(
                    cleaned[0]
                );

            if (
                !target ||
                !Number.isFinite(amount) ||
                amount <= 0
            ) {
                return message.reply(
                    "❌ Kullanım: `.dsil @oyuncu 5M`"
                );
            }

            const oldValue =
                await syncUserValueFromNickname(
                    db,
                    target
                );

            const newValue =
                await subtractPlayerValue(
                    message.guild,
                    target,
                    amount
                );

            return message.reply(
                `✅ ${target} değerinden **-${formatValue(amount)}** çıkarıldı.\n` +
                `📊 Eski değer: **${formatValue(oldValue)}**\n` +
                `💰 Yeni değer: **${formatValue(newValue)}**`
            );
        }

        /* =================================================
           ANTRENMAN
           ================================================= */

        if (
            command === "ant" ||
            command === "antrenman"
        ) {
            const channel =
                getChannel(
                    message.guild,
                    CHANNEL_IDS.antrenman,
                    "antrenman"
                );

            if (
                !channel ||
                message.channel.id !==
                channel.id
            ) {
                return message.reply(
                    `❌ Bu komut sadece ${channel || "#antrenman"} kanalında kullanılabilir.`
                );
            }

            const user =
                ensureUser(
                    db,
                    message.member
                );

            if (
                user.training >= 5
            ) {
                return message.reply(
                    "🏋️ Antrenman seviyen zaten **5/5**.\n" +
                    "💰 +5M€ ödülü daha önce verildi."
                );
            }

            user.training++;

            if (
                user.training === 5
            ) {
                await addPlayerValue(
                    message.guild,
                    message.member,
                    5
                );

                saveDatabase();

                return message.reply(
                    "🏋️ **ANTRENMAN TAMAMLANDI!**\n\n" +
                    "📊 Seviye: **5/5**\n" +
                    "💰 Oyuncu değerine **+5M€** eklendi."
                );
            }

            saveDatabase();

            return message.reply(
                `🏋️ Antrenman ilerlemesi: **${user.training}/5**`
            );
        }

        /* =================================================
           PENALTI
           ================================================= */

        if (
            command === "pen" ||
            command === "penaltı" ||
            command === "penalti"
        ) {
            const channel =
                getChannel(
                    message.guild,
                    CHANNEL_IDS.penalti,
                    "penaltı"
                );

            if (
                !channel ||
                message.channel.id !==
                channel.id
            ) {
                return message.reply(
                    `❌ Bu komut sadece ${channel || "#penaltı"} kanalında kullanılabilir.`
                );
            }

            const roll =
                Math.random() * 100;

            if (roll < 30) {
                const newValue =
                    await addPlayerValue(
                        message.guild,
                        message.member,
                        5
                    );

                return message.reply(
                    "⚽ **GOL!**\n" +
                    "🎉 Penaltı başarılı!\n" +
                    "💰 Oyuncu değerine **+5M€** eklendi.\n" +
                    `📊 Yeni değer: **${formatValue(newValue)}**`
                );
            }

            if (roll < 60) {
                return message.reply(
                    "🧤 **KURTARIŞ!**\n" +
                    "Kaleci penaltıyı kurtardı."
                );
            }

            if (roll < 85) {
                return message.reply(
                    "🥅 **DİREK!**\n" +
                    "Top direkten döndü."
                );
            }

            return message.reply(
                "🚩 **KORNER!**\n" +
                "Top savunmadan dışarı çıktı."
            );
        }

        /* =================================================
           BÜTÇE
           ================================================= */

        if (
            command === "butce" ||
            command === "bütçe"
        ) {
            const user =
                ensureUser(
                    db,
                    message.member
                );

            return message.reply(
                `💳 ${message.member}\n` +
                `💰 Bütçen: **${formatValue(user.budget)}**`
            );
        }

        /* =================================================
           BÜTÇE EKLE
           ================================================= */

        if (
            command === "butceekle" ||
            command === "bütçeekle"
        ) {
            if (
                !isValueStaff(
                    message
                )
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            const target =
                message.mentions.members.first();

            const cleaned =
                cleanCommandArguments(
                    message
                );

            const amount =
                parseAmount(
                    cleaned[0]
                );

            if (
                !target ||
                !Number.isFinite(amount) ||
                amount <= 0
            ) {
                return message.reply(
                    "❌ Kullanım: `.bütçeekle @oyuncu 10M`"
                );
            }

            const user =
                ensureUser(
                    db,
                    target
                );

            user.budget +=
                amount;

            saveDatabase();

            return message.reply(
                `✅ ${target} bütçesine **+${formatValue(amount)}** eklendi.\n` +
                `💳 Yeni bütçe: **${formatValue(user.budget)}**`
            );
        }

        /* =================================================
           BÜTÇE SİL
           ================================================= */

        if (
            command === "butcesil" ||
            command === "bütçesil"
        ) {
            if (
                !isValueStaff(
                    message
                )
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            const target =
                message.mentions.members.first();

            const cleaned =
                cleanCommandArguments(
                    message
                );

            const amount =
                parseAmount(
                    cleaned[0]
                );

            if (
                !target ||
                !Number.isFinite(amount) ||
                amount <= 0
            ) {
                return message.reply(
                    "❌ Kullanım: `.bütçesil @oyuncu 10M`"
                );
            }

            const user =
                ensureUser(
                    db,
                    target
                );

            user.budget =
                Math.max(
                    0,
                    user.budget - amount
                );

            saveDatabase();

            return message.reply(
                `✅ ${target} bütçesinden **-${formatValue(amount)}** çıkarıldı.\n` +
                `💳 Yeni bütçe: **${formatValue(user.budget)}**`
            );
        }

        /* =================================================
           PARA GÖNDER
           ================================================= */

        if (
            command === "gonder" ||
            command === "gönder"
        ) {
            const target =
                message.mentions.members.first();

            const cleaned =
                cleanCommandArguments(
                    message
                );

            const amount =
                parseAmount(
                    cleaned[0]
                );

            if (
                !target ||
                !Number.isFinite(amount) ||
                amount <= 0
            ) {
                return message.reply(
                    "❌ Kullanım: `.gönder @oyuncu 5M`"
                );
            }

            if (
                target.id ===
                message.author.id
            ) {
                return message.reply(
                    "❌ Kendine para gönderemezsin."
                );
            }

            const sender =
                ensureUser(
                    db,
                    message.member
                );

            const receiver =
                ensureUser(
                    db,
                    target
                );

            if (
                sender.budget <
                amount
            ) {
                return message.reply(
                    "❌ Yeterli bütçen yok."
                );
            }

            sender.budget -=
                amount;

            receiver.budget +=
                amount;

            saveDatabase();

            return message.reply(
                `✅ ${target} kullanıcısına **${formatValue(amount)}** gönderildi.`
            );
        }

        /* =================================================
           KAP
           ================================================= */

        if (
            command === "kap"
        ) {
            const target =
                message.mentions.members.first();

            const teams =
                getMentionedTeamRoles(
                    message
                );

            const cleaned =
                cleanCommandArguments(
                    message
                );

            const salary =
                parseAmount(
                    cleaned[0]
                );

            const seasons =
                Number(
                    cleaned[1]
                );

            if (
                !target ||
                teams.length < 1
            ) {
                return message.reply(
                    "❌ Kullanım: `.kap @oyuncu @takım 5M 3`"
                );
            }

            const team =
                teams[0].name;

            const memberTeam =
                getTeamFromMember(
                    message.member
                );

            const authorized =
                isOwner(message) ||
                (
                    hasRole(
                        message.member,
                        ROLE_IDS.teknikDirektor
                    ) &&
                    (
                        memberTeam === null ||
                        memberTeam === team
                    )
                ) ||
                memberTeam === team;

            if (!authorized) {
                return message.reply(
                    "❌ Bu takım için KAP açma yetkin yok."
                );
            }

            if (
                !Number.isFinite(
                    salary
                ) ||
                salary <= 0
            ) {
                return message.reply(
                    "❌ Geçerli bir maaş gir."
                );
            }

            if (
                !Number.isInteger(
                    seasons
                ) ||
                seasons < 1 ||
                seasons > 10
            ) {
                return message.reply(
                    "❌ Sezon sayısı **1-10** arasında olmalıdır."
                );
            }

            const player =
                ensureUser(
                    db,
                    target
                );

            if (
                player.team
            ) {
                return message.reply(
                    `❌ Bu oyuncunun zaten takımı var: **${player.team}**`
                );
            }

            if (
                !target.roles.cache.has(
                    ROLE_IDS.futbolcu
                )
            ) {
                return message.reply(
                    "❌ Oyuncuda **Futbolcu** rolü bulunmuyor."
                );
            }

            const id =
                `${Date.now()}-${Math.random()
                    .toString(36)
                    .slice(2)}`;

            db.offers[id] = {
                id,
                playerId:
                    target.id,
                team,
                salary,
                seasons,
                createdBy:
                    message.author.id,
                createdAt:
                    Date.now()
            };

            saveDatabase();

            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(
                            "📄 KAP TEKLİFİ"
                        )
                        .setDescription(
                            `${target} oyuncusuna **${team}** tarafından KAP teklifi gönderildi.`
                        )
                        .addFields(
                            {
                                name:
                                    "💰 Sezonluk Maaş",
                                value:
                                    formatValue(
                                        salary
                                    ),
                                inline: true
                            },
                            {
                                name:
                                    "📅 Sözleşme",
                                value:
                                    `${seasons} sezon`,
                                inline: true
                            },
                            {
                                name:
                                    "💰 Toplam",
                                value:
                                    formatValue(
                                        salary *
                                        seasons
                                    ),
                                inline: true
                            }
                        )
                        .setFooter({
                            text:
                                "Oyuncu teklifi kabul veya reddedebilir."
                        })
                ],
                components: [
                    new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(
                                    `kap_accept_${id}`
                                )
                                .setLabel(
                                    "✅ Kabul Et"
                                )
                                .setStyle(
                                    ButtonStyle.Success
                                ),

                            new ButtonBuilder()
                                .setCustomId(
                                    `kap_reject_${id}`
                                )
                                .setLabel(
                                    "❌ Reddet"
                                )
                                .setStyle(
                                    ButtonStyle.Danger
                                )
                        )
                ]
            });
        }

        /* =================================================
           KADRO EKLE
           ================================================= */

        if (
            command === "kadroekle"
        ) {
            const target =
                message.mentions.members.first();

            const teams =
                getMentionedTeamRoles(
                    message
                );

            const cleaned =
                cleanCommandArguments(
                    message
                );

            const position =
                cleaned.join(" ");

            if (
                !target ||
                teams.length < 1 ||
                !position
            ) {
                return message.reply(
                    "❌ Kullanım: `.kadroekle @takım @oyuncu ST`"
                );
            }

            const team =
                teams[0].name;

            const memberTeam =
                getTeamFromMember(
                    message.member
                );

            const authorized =
                isOwner(message) ||
                isSpiker(message) ||
                hasRole(
                    message.member,
                    ROLE_IDS.teknikDirektor
                ) ||
                memberTeam === team;

            if (!authorized) {
                return message.reply(
                    "❌ Bu kadroyu düzenleme yetkin yok."
                );
            }

            const squad =
                getTeamSquad(
                    db,
                    team
                );

            if (
                squad.some(
                    p =>
                        p.userId ===
                        target.id
                )
            ) {
                return message.reply(
                    "❌ Oyuncu zaten kadroda."
                );
            }

            squad.push({
                userId:
                    target.id,
                name:
                    target.nickname ||
                    target.user.username,
                position
            });

            const user =
                ensureUser(
                    db,
                    target
                );

            user.position =
                position;

            saveDatabase();

            return message.reply(
                `✅ ${target} **${team}** kadrosuna eklendi.\n` +
                `📍 Pozisyon: **${position}**`
            );
        }

        /* =================================================
           KADRO SİL
           ================================================= */

        if (
            command === "kadrosil"
        ) {
            const target =
                message.mentions.members.first();

            const teams =
                getMentionedTeamRoles(
                    message
                );

            if (
                !target ||
                teams.length < 1
            ) {
                return message.reply(
                    "❌ Kullanım: `.kadrosil @takım @oyuncu`"
                );
            }

            const team =
                teams[0].name;

            const memberTeam =
                getTeamFromMember(
                    message.member
                );

            const authorized =
                isOwner(message) ||
                isSpiker(message) ||
                hasRole(
                    message.member,
                    ROLE_IDS.teknikDirektor
                ) ||
                memberTeam === team;

            if (!authorized) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            const squad =
                getTeamSquad(
                    db,
                    team
                );

            const index =
                squad.findIndex(
                    p =>
                        p.userId ===
                        target.id
                );

            if (index === -1) {
                return message.reply(
                    "❌ Oyuncu kadroda bulunamadı."
                );
            }

            squad.splice(
                index,
                1
            );

            saveDatabase();

            return message.reply(
                `✅ ${target} **${team}** kadrosundan çıkarıldı.`
            );
        }

        /* =================================================
           KADRO GÖSTER
           ================================================= */

        if (
            command === "kadro"
        ) {
            const teams =
                getMentionedTeamRoles(
                    message
                );

            if (
                teams.length < 1
            ) {
                return message.reply(
                    "❌ Kullanım: `.kadro @takım`"
                );
            }

            const team =
                teams[0].name;

            const squad =
                getMatchSquad(
                    message.guild,
                    team
                );

            const totalValue =
                squad.reduce(
                    (sum, player) =>
                        sum +
                        Number(
                            player.value || 0
                        ),
                    0
                );

            const list =
                squad.map(
                    (player, index) =>
                        `**${index + 1}.** ${player.name} — **${player.position}** — ${formatValue(player.value)}${player.npc ? " 🤖" : ""}`
                ).join("\n");

            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(
                            `👥 ${team} KADROSU`
                        )
                        .setDescription(
                            list
                        )
                        .addFields({
                            name:
                                "💰 Toplam Kadro Değeri",
                            value:
                                formatValue(
                                    totalValue
                                )
                        })
                        .setFooter({
                            text:
                                "🤖 = Akademi NPC"
                        })
                ]
            });
        }

        /* =================================================
           MAÇ
           ================================================= */

        if (
            command === "maç" ||
            command === "mac"
        ) {
            if (
                !isSpiker(message)
            ) {
                return message.reply(
                    "❌ Bu komutu sadece Spiker veya Yönetici kullanabilir."
                );
            }

            const teams =
                getMentionedTeamRoles(
                    message
                );

            if (
                teams.length < 2
            ) {
                return message.reply(
                    "❌ Kullanım: `.maç @takım1 @takım2`"
                );
            }

            const team1 =
                teams[0].name;

            const team2 =
                teams[1].name;

            if (
                team1 === team2
            ) {
                return message.reply(
                    "❌ Aynı takım kendisiyle maç yapamaz."
                );
            }

            const key =
                matchKey(
                    message.guild.id,
                    team1,
                    team2
                );

            if (
                activeMatches.has(key)
            ) {
                return message.reply(
                    "❌ Bu iki takım arasında zaten canlı maç var."
                );
            }

            try {
                await startMatch(
                    message.guild,
                    team1,
                    team2
                );

                return message.reply(
                    `⚽ **${team1} - ${team2}** maçı başlatıldı!\n` +
                    `⏱️ 90 dakika / gerçek zamanda yaklaşık 4 dakika 30 saniye.`
                );
            } catch (error) {
                console.error(
                    "Maç hatası:",
                    error
                );

                return message.reply(
                    "❌ Maç başlatılırken hata oluştu."
                );
            }
        }

        /* =================================================
           FİKSTÜR EKLE
           ================================================= */

        if (
            command === "fiksturekle" ||
            command === "fikstür"
        ) {
            if (
                !isAdmin(message) &&
                !isSpiker(message)
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            const teams =
                getMentionedTeamRoles(
                    message
                );

            const cleaned =
                cleanCommandArguments(
                    message
                );

            const dateText =
                cleaned.find(
                    x =>
                        /^\d{4}-\d{2}-\d{2}$/
                            .test(x)
                );

            const timeText =
                cleaned.find(
                    x =>
                        /^\d{1,2}:\d{2}$/
                            .test(x)
                );

            if (
                teams.length < 2
            ) {
                return message.reply(
                    "❌ Kullanım: `.fiksturekle @takım1 @takım2 YYYY-MM-DD HH:MM`"
                );
            }

            const date =
                parseDateTime(
                    dateText,
                    timeText
                );

            if (!date) {
                return message.reply(
                    "❌ Tarih formatı: `YYYY-MM-DD HH:MM`"
                );
            }

            const team1 =
                teams[0].name;

            const team2 =
                teams[1].name;

            if (
                team1 === team2
            ) {
                return message.reply(
                    "❌ Aynı takım kendisiyle oynayamaz."
                );
            }

            const fixture = {
                id:
                    `${Date.now()}-${Math.random()
                        .toString(36)
                        .slice(2)}`,
                team1,
                team2,
                timestamp:
                    date.getTime(),
                status:
                    "scheduled",
                score1:
                    null,
                score2:
                    null,
                messageId:
                    null
            };

            db.fixtures.push(
                fixture
            );

            const channel =
                getChannel(
                    message.guild,
                    CHANNEL_IDS.fikstur,
                    "fikstur"
                );

            if (!channel) {
                return message.reply(
                    "❌ Fikstür kanalı bulunamadı."
                );
            }

            const fixtureMessage =
                await channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                "📅 AXERA LEAGUE FİKSTÜR"
                            )
                            .setDescription(
                                `⚽ **${team1}** vs **${team2}**\n\n` +
                                `📅 Tarih: <t:${Math.floor(date.getTime() / 1000)}:F>\n` +
                                `⏰ Saat: <t:${Math.floor(date.getTime() / 1000)}:t>\n\n` +
                                `⏳ Durum: **PLANLANDI**`
                            )
                            .setFooter({
                                text:
                                    "Axera League • Fikstür"
                            })
                            .setTimestamp()
                    ]
                });

            fixture.messageId =
                fixtureMessage.id;

            saveDatabase();

            return message.reply(
                `✅ Fikstür eklendi!\n` +
                `⚽ **${team1} - ${team2}**\n` +
                `📅 **${dateText} ${timeText}**`
            );
        }

        /* =================================================
           PUAN
           ================================================= */

        if (
            command === "puan" ||
            command === "puanlama"
        ) {
            const entries =
                getSortedPoints(db);

            const table =
                entries.length
                    ? entries.map(
                        ([team, data], index) =>
                            `**${index + 1}. ${team}** — ` +
                            `🏆 ${data.points} P | ` +
                            `🏟️ ${data.played} M | ` +
                            `🟢 ${data.wins} G | ` +
                            `🟡 ${data.draws} B | ` +
                            `🔴 ${data.losses} M | ` +
                            `⚽ ${data.gf}:${data.ga}`
                    ).join("\n")
                    : "Henüz maç oynanmadı.";

            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(
                            "🏆 AXERA LEAGUE PUAN DURUMU"
                        )
                        .setDescription(
                            table
                        )
                        .setFooter({
                            text:
                                "Galibiyet 3 • Beraberlik 1"
                        })
                ]
            });
        }

        /* =================================================
           OYUNCU ARA
           ================================================= */

        if (
            command === "ara" &&
            normalize(
                args[0] || ""
            ) === "oyuncu"
        ) {
            const query =
                args.slice(1)
                    .join(" ")
                    .trim();

            if (!query) {
                return message.reply(
                    "❌ Kullanım: `.ara oyuncu Sneijder`"
                );
            }

            const results = [];

            for (
                const [id, user]
                of Object.entries(
                    db.users
                )
            ) {
                const member =
                    await message.guild.members
                        .fetch(id)
                        .catch(
                            () => null
                        );

                if (!member) continue;

                if (
                    member.roles.cache.has(
                        ROLE_IDS.kayitsiz
                    )
                ) {
                    continue;
                }

                const searchText = [
                    user.nickname,
                    member.nickname,
                    member.user.username
                ]
                    .filter(Boolean)
                    .join(" ");

                if (
                    normalize(
                        searchText
                    ).includes(
                        normalize(query)
                    )
                ) {
                    results.push({
                        member,
                        user
                    });
                }

                if (
                    results.length >= 20
                ) {
                    break;
                }
            }

            if (!results.length) {
                return message.reply(
                    "❌ Oyuncu bulunamadı."
                );
            }

            const description =
                results.map(
                    (result, index) =>
                        `**${index + 1}.** ${result.member}\n` +
                        `💰 ${formatValue(result.user.value)} | ` +
                        `🏟️ ${result.user.team || "Takımsız"}`
                ).join("\n\n");

            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(
                            "🔎 OYUNCU ARAMA"
                        )
                        .setDescription(
                            description
                        )
                ]
            });
        }

        /* =================================================
           TAKIM BÜTÇESİ
           ================================================= */

        if (
            command === "takimbutce" ||
            command === "takımbütçe"
        ) {
            const teams =
                getMentionedTeamRoles(
                    message
                );

            if (
                teams.length < 1
            ) {
                return message.reply(
                    "❌ Kullanım: `.takımbütçe @takım`"
                );
            }

            const team =
                teams[0].name;

            const teamData =
                ensureTeam(
                    db,
                    team
                );

            return message.reply(
                `💼 **${team}**\n` +
                `💰 Takım bütçesi: **${formatValue(teamData.budget)}**`
            );
        }

        /* =================================================
           TAKIM BÜTÇESİNE PARA AKTAR
           ================================================= */

        if (
            command ===
                "takimbutcegonder" ||
            command ===
                "takımbütçegönder"
        ) {
            const teams =
                getMentionedTeamRoles(
                    message
                );

            const cleaned =
                cleanCommandArguments(
                    message
                );

            const amount =
                parseAmount(
                    cleaned[0]
                );

            if (
                teams.length < 1 ||
                !Number.isFinite(
                    amount
                ) ||
                amount <= 0
            ) {
                return message.reply(
                    "❌ Kullanım: `.takımbütçegönder @takım 10M`"
                );
            }

            const team =
                teams[0].name;

            const memberTeam =
                getTeamFromMember(
                    message.member
                );

            if (
                !isOwner(message) &&
                memberTeam !== team
            ) {
                return message.reply(
                    "❌ Sadece kendi takımına bütçe gönderebilirsin."
                );
            }

            const user =
                ensureUser(
                    db,
                    message.member
                );

            if (
                user.budget <
                amount
            ) {
                return message.reply(
                    "❌ Kişisel bütçen yetersiz."
                );
            }

            const teamData =
                ensureTeam(
                    db,
                    team
                );

            user.budget -=
                amount;

            teamData.budget +=
                amount;

            saveDatabase();

            return message.reply(
                `✅ **${team}** takımına **${formatValue(amount)}** aktarıldı.\n` +
                `💼 Yeni takım bütçesi: **${formatValue(teamData.budget)}**`
            );
        }

        /* =================================================
           DM
           ================================================= */

        if (
            command === "dm"
        ) {
            if (
                !isAdmin(message)
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            const target =
                message.mentions.members.first();

            if (target) {
                const cleaned =
                    cleanCommandArguments(
                        message
                    );

                const text =
                    cleaned.join(" ");

                if (!text) {
                    return message.reply(
                        "❌ Kullanım: `.dm @oyuncu mesaj`"
                    );
                }

                try {
                    await target.send(
                        text
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

            if (
                normalize(
                    args[0] || ""
                ) === "all"
            ) {
                const text =
                    args.slice(1)
                        .join(" ");

                if (!text) {
                    return message.reply(
                        "❌ Kullanım: `.dm all mesaj`"
                    );
                }

                let success = 0;
                let failed = 0;

                const members =
                    await message.guild.members
                        .fetch();

                for (
                    const member
                    of members.values()
                ) {
                    if (
                        member.user.bot
                    ) {
                        continue;
                    }

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
                                400
                            )
                    );
                }

                return message.reply(
                    `📩 DM işlemi tamamlandı.\n` +
                    `✅ Başarılı: **${success}**\n` +
                    `❌ Başarısız: **${failed}**`
                );
            }

            return message.reply(
                "❌ Kullanım: `.dm @oyuncu mesaj` veya `.dm all mesaj`"
            );
        }

        /* =================================================
           EMBED
           ================================================= */

        if (
            command === "embed"
        ) {
            if (
                !isAdmin(message)
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            const content =
                args.join(" ");

            const parts =
                content.split("|");

            const title =
                parts.shift()
                    ?.trim() ||
                "Axera League";

            const description =
                parts.join("|")
                    .trim() ||
                " ";

            return message.channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(
                            title
                        )
                        .setDescription(
                            description
                        )
                        .setFooter({
                            text:
                                "Axera League"
                        })
                        .setTimestamp()
                ]
            });
        }

        /* =================================================
           ROL VER
           ================================================= */

        if (
            command === "rolver"
        ) {
            if (
                !isAdmin(message)
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            const target =
                message.mentions.members.first();

            const roles =
                [
                    ...message.mentions.roles.values()
                ];

            if (
                !target ||
                !roles.length
            ) {
                return message.reply(
                    "❌ Kullanım: `.rolver @üye @rol`"
                );
            }

            await target.roles
                .add(
                    roles[0]
                )
                .catch(() => {});

            return message.reply(
                `✅ ${target} kullanıcısına ${roles[0]} rolü verildi.`
            );
        }

        /* =================================================
           KİLİT
           ================================================= */

        if (
            command === "kilit"
        ) {
            if (
                !isAdmin(message)
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            await message.channel
                .permissionOverwrites.edit(
                    message.guild.roles.everyone,
                    {
                        SendMessages:
                            false
                    }
                );

            return message.reply(
                "🔒 Kanal kilitlendi."
            );
        }

        /* =================================================
           AÇ
           ================================================= */

        if (
            command === "ac" ||
            command === "aç"
        ) {
            if (
                !isAdmin(message)
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            await message.channel
                .permissionOverwrites.edit(
                    message.guild.roles.everyone,
                    {
                        SendMessages:
                            true
                    }
                );

            return message.reply(
                "🔓 Kanal açıldı."
            );
        }

        /* =================================================
           MESAJ SİL
           ================================================= */

        if (
            command === "sil"
        ) {
            if (
                !isAdmin(message)
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            const amount =
                Number(
                    args[0]
                );

            if (
                !Number.isInteger(
                    amount
                ) ||
                amount < 1 ||
                amount > 100
            ) {
                return message.reply(
                    "❌ 1-100 arasında bir sayı gir."
                );
            }

            await message.channel
                .bulkDelete(
                    amount + 1,
                    true
                )
                .catch(() => {});

            return;
        }

        /* =================================================
           TICKET PANEL
           ================================================= */

        if (
            command ===
                "ticketpanel"
        ) {
            if (
                !isAdmin(message)
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            return message.channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(
                            "🎫 AXERA LEAGUE DESTEK"
                        )
                        .setDescription(
                            "Destek almak için aşağıdaki butona bas."
                        )
                        .setFooter({
                            text:
                                "Axera League • Destek"
                        })
                ],
                components: [
                    new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(
                                    "ticket_create"
                                )
                                .setLabel(
                                    "🎫 Ticket Aç"
                                )
                                .setStyle(
                                    ButtonStyle.Primary
                                )
                        )
                ]
            });
        }

        /* =================================================
           ROL PANEL
           ================================================= */

        if (
            command ===
                "rolpanel"
        ) {
            if (
                !isAdmin(message)
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            return message.channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(
                            "🎭 AXERA LEAGUE ROL PANELİ"
                        )
                        .setDescription(
                            "Rol işlemleri için yetkililerle iletişime geçebilirsiniz."
                        )
                ]
            });
        }

        /* =================================================
           KUPA EKLE
           ================================================= */

        if (
            command ===
                "kupaekle"
        ) {
            if (
                !isAdmin(message)
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            const name =
                args.join(" ");

            if (!name) {
                return message.reply(
                    "❌ Kupa adı gir."
                );
            }

            db.trophies.push({
                id:
                    `${Date.now()}-${Math.random()}`,
                name,
                date:
                    Date.now()
            });

            saveDatabase();

            return message.reply(
                `🏆 **${name}** kupası eklendi.`
            );
        }

        /* =================================================
           KUPA SİL
           ================================================= */

        if (
            command ===
                "kupasil"
        ) {
            if (
                !isAdmin(message)
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            const name =
                args.join(" ");

            if (!name) {
                return message.reply(
                    "❌ Kupa adı gir."
                );
            }

            const index =
                db.trophies.findIndex(
                    trophy =>
                        normalize(
                            trophy.name
                        ) ===
                        normalize(
                            name
                        )
                );

            if (
                index === -1
            ) {
                return message.reply(
                    "❌ Kupa bulunamadı."
                );
            }

            const removed =
                db.trophies.splice(
                    index,
                    1
                )[0];

            saveDatabase();

            return message.reply(
                `🗑️ **${removed.name}** kupası silindi.`
            );
        }

        /* =================================================
           ASİST KRALLIĞI
           ================================================= */

        if (
            command ===
                "asistkral"
        ) {
            const players =
                Object.entries(
                    db.users
                )
                    .sort(
                        ([, a], [, b]) =>
                            (b.assists || 0) -
                            (a.assists || 0)
                    )
                    .slice(
                        0,
                        10
                    );

            const lines = [];

            for (
                let i = 0;
                i < players.length;
                i++
            ) {
                const [
                    id,
                    user
                ] =
                    players[i];

                const member =
                    await message.guild.members
                        .fetch(id)
                        .catch(
                            () => null
                        );

                lines.push(
                    `**${i + 1}.** ${member || user.nickname || "Oyuncu"} — **${user.assists || 0} asist**`
                );
            }

            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(
                            "🎯 ASİST KRALLIĞI"
                        )
                        .setDescription(
                            lines.join(
                                "\n"
                            ) ||
                            "Henüz asist yok."
                        )
                ]
            });
        }

        /* =================================================
           TWEET
           ================================================= */

        if (
            command ===
                "tweet"
        ) {
            const content =
                args.join(" ");

            if (!content) {
                return message.reply(
                    "❌ Tweet içeriği gir."
                );
            }

            return message.channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setAuthor({
                            name:
                                message.member
                                    .displayName,
                            iconURL:
                                message.author
                                    .displayAvatarURL()
                        })
                        .setDescription(
                            content
                        )
                        .setFooter({
                            text:
                                "Axera League • Tweet"
                        })
                        .setTimestamp()
                ]
            });
        }
    }
);

/* =========================================================
   OTOMATİK DURUM
   ========================================================= */

let lastStatusKey = "";

async function sendStatus() {
    const now =
        new Date();

    const minute =
        now.getMinutes();

    if (
        minute !== 0 &&
        minute !== 30
    ) {
        return;
    }

    const key =
        `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${minute}`;

    if (
        key ===
        lastStatusKey
    ) {
        return;
    }

    lastStatusKey =
        key;

    const uptime =
        Math.floor(
            process.uptime()
        );

    const hours =
        Math.floor(
            uptime / 3600
        );

    const minutes =
        Math.floor(
            (uptime % 3600) /
            60
        );

    const time =
        now.toLocaleTimeString(
            "tr-TR",
            {
                hour:
                    "2-digit",
                minute:
                    "2-digit"
            }
        );

    for (
        const guild
        of client.guilds.cache.values()
    ) {
        const channel =
            getChannel(
                guild,
                CHANNEL_IDS.durum,
                "durum"
            );

        if (!channel) {
            continue;
        }

        await channel.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle(
                        "🤖 BOT DURUMU"
                    )
                    .setDescription(
                        "🟢 **Tüm sistemler sorunsuz çalışıyor.**"
                    )
                    .addFields(
                        {
                            name:
                                "⏱️ Çalışma Süresi",
                            value:
                                `${hours} saat ${minutes} dakika`,
                            inline:
                                true
                        },
                        {
                            name:
                                "🕐 Son Kontrol",
                            value:
                                time,
                            inline:
                                true
                        }
                    )
                    .setFooter({
                        text:
                            "Axera League"
                    })
                    .setTimestamp()
            ]
        }).catch(() => {});
    }
}

/* =========================================================
   KAYIT PANELİ TEMİZLEME
   ========================================================= */

setInterval(
    () => {
        const now =
            Date.now();

        for (
            const [
                messageId,
                session
            ]
            of registrationSessions
        ) {
            if (
                now -
                session.createdAt >
                30 * 60 * 1000
            ) {
                registrationSessions.delete(
                    messageId
                );
            }
        }
    },
    5 * 60 * 1000
);

/* =========================================================
   BOT READY
   ========================================================= */

client.once(
    "ready",
    async () => {
        console.log(
            "======================================"
        );

        console.log(
            `✅ Bot aktif: ${client.user.tag}`
        );

        console.log(
            "🏆 Axera League sistemleri aktif."
        );

        console.log(
            `🌐 Sunucu sayısı: ${client.guilds.cache.size}`
        );

        console.log(
            "======================================"
        );

        client.user.setPresence({
            activities: [
                {
                    name:
                        "Axera League ⚽",
                    type:
                        0
                }
            ],
            status:
                "online"
        });

        await checkFixtures();

        /*
         * Fikstür kontrolü
         */
        setInterval(
            checkFixtures,
            1000
        );

        /*
         * Durum kontrolü
         */
        setInterval(
            sendStatus,
            15000
        );
    }
);

/* =========================================================
   HATA YÖNETİMİ
   ========================================================= */

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

/* =========================================================
   TOKEN
   ========================================================= */

if (!process.env.TOKEN) {
    console.error(
        "❌ TOKEN environment variable bulunamadı!"
    );
    process.exit(1);
}

client.login(
    process.env.TOKEN
);
