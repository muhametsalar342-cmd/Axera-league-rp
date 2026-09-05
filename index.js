/*
===========================================================
                    AXERA LEAGUE BOT
                    DISCORD.JS V14
===========================================================

Kurulum:

npm install discord.js dotenv

.env dosyası:

TOKEN=BURAYA_BOT_TOKENIN

TOKEN KODUN İÇİNE YAZILMAZ.

===========================================================
*/

require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
    Client,
    GatewayIntentBits,
    Partials,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

/* =========================================================
   AYARLAR
========================================================= */

const PREFIX = ".";

const OWNER_ID =
    "1280275560739897409";

/* =========================================================
   KANAL ID'LERİ
========================================================= */

const CHANNELS = {
    KAYIT:
        "1534460177884123276",

    SOHBET:
        "1534469475917758586",

    MAC:
        "1534477626872168541",

    FIKSTUR:
        "1534475908566483075",

    PUAN:
        "1534475991404253284",

    BOT_DURUM:
        "1545921149018570842",

    ANTRENMAN:
        "1534474070798762197",

    PENALTI:
        "1534474327812997192"
};

/* =========================================================
   ROL ID'LERİ
========================================================= */

const ROLES = {
    KAYIT_YETKILI:
        "1534456315366342716",

    KAYITSIZ:
        "1534457560134844517",

    KALECI:
        "1534492034243498195",

    UYE:
        "1534457460163608636",

    FUTBOLCU:
        "1534457228986421278",

    TEKNIK_DIREKTOR:
        "1534456648930693120",

    DEGER_YETKILI:
        "1534456192913375382",

    SPIKER:
        "1535251168169697390"
};

/* =========================================================
   TAKIMLAR
========================================================= */

const TEAMS = {
    "Barcelona": {
        roleId:
            "1534480715779936297"
    },

    "Real Madrid": {
        roleId:
            "1534480984064528655"
    },

    "Galatasaray": {
        roleId:
            "1534481073629691995"
    },

    "Fenerbahçe": {
        roleId:
            "1534481156840620183"
    },

    "Beşiktaş": {
        roleId:
            "1534481259739348992"
    },

    "Arsenal": {
        roleId:
            "1534481678653853706"
    },

    "Chelsea": {
        roleId:
            "1534481742285770813"
    },

    "Manchester City": {
        roleId:
            "1534481568590991370"
    },

    "Paris Saint-Germain": {
        roleId:
            "1534481952982306867"
    },

    "Liverpool": {
        roleId:
            "1534481826696003594"
    },

    "Manchester United": {
        roleId:
            "1534481426463068180"
    }
};

/* =========================================================
   CLIENT
========================================================= */

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],

    partials: [
        Partials.Channel
    ]
});

/* =========================================================
   DATABASE
========================================================= */

const DATA_DIR =
    path.join(__dirname, "data");

const DB_FILE =
    path.join(
        DATA_DIR,
        "database.json"
    );

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(
        DATA_DIR,
        {
            recursive: true
        }
    );
}

let db = {
    guilds: {}
};

if (fs.existsSync(DB_FILE)) {
    try {
        db =
            JSON.parse(
                fs.readFileSync(
                    DB_FILE,
                    "utf8"
                )
            );
    } catch {
        db = {
            guilds: {}
        };
    }
}

if (!db.guilds) {
    db.guilds = {};
}

/* =========================================================
   DATABASE KAYDET
========================================================= */

let saveTimer = null;

function saveDB() {

    clearTimeout(
        saveTimer
    );

    saveTimer =
        setTimeout(() => {

            try {

                fs.writeFileSync(
                    DB_FILE,
                    JSON.stringify(
                        db,
                        null,
                        2
                    ),
                    "utf8"
                );

            } catch (error) {

                console.error(
                    "Database kayıt hatası:",
                    error
                );

            }

        }, 100);
}

/* =========================================================
   GUILD DATABASE
========================================================= */

function ensureGuild(
    guildId
) {

    if (!db.guilds[guildId]) {

        db.guilds[guildId] = {

            players: {},

            budgets: {},

            squads: {},

            points: {},

            fixtures: {},

            matches: {},

            transfers: {},

            trainings: {},

            registrations: {}

        };
    }

    const guild =
        db.guilds[guildId];

    guild.players ||=
        {};

    guild.budgets ||=
        {};

    guild.squads ||=
        {};

    guild.points ||=
        {};

    guild.fixtures ||=
        {};

    guild.matches ||=
        {};

    guild.transfers ||=
        {};

    guild.trainings ||=
        {};

    guild.registrations ||=
        {};

    return guild;
}

/* =========================================================
   NORMALIZE
========================================================= */

function normalize(
    text
) {

    return String(
        text || ""
    )
        .toLocaleLowerCase(
            "tr-TR"
        )
        .normalize("NFD")
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .trim();
}

/* =========================================================
   PARA
========================================================= */

function money(
    amount
) {

    return `${Number(
        amount || 0
    ).toLocaleString(
        "tr-TR"
    )}M€`;
}

/* =========================================================
   OWNER
========================================================= */

function isOwner(
    member
) {

    return (
        member &&
        member.id ===
        OWNER_ID
    );
}

/* =========================================================
   ADMIN
========================================================= */

function isAdmin(
    member
) {

    if (!member) {
        return false;
    }

    if (
        isOwner(member)
    ) {
        return true;
    }

    return member.permissions.has(
        "Administrator"
    );
}

/* =========================================================
   ROL BUL
========================================================= */

function resolveRole(
    guild,
    id,
    names = []
) {

    if (!guild) {
        return null;
    }

    if (id) {

        const role =
            guild.roles.cache.get(
                id
            );

        if (role) {
            return role;
        }
    }

    const wanted =
        names.map(
            normalize
        );

    return guild.roles.cache.find(
        role =>
            wanted.includes(
                normalize(
                    role.name
                )
            )
    ) || null;
}

/* =========================================================
   KANAL BUL
========================================================= */

function resolveChannel(
    guild,
    id,
    names = []
) {

    if (!guild) {
        return null;
    }

    if (id) {

        const channel =
            guild.channels.cache.get(
                id
            );

        if (channel) {
            return channel;
        }
    }

    const wanted =
        names.map(
            normalize
        );

    return guild.channels.cache.find(
        channel =>
            wanted.includes(
                normalize(
                    channel.name
                )
            )
    ) || null;
}

/* =========================================================
   SİSTEM KANALI
========================================================= */

function getSystemChannel(
    guild,
    key
) {

    const names = {

        KAYIT: [
            "kayıt",
            "kayit"
        ],

        SOHBET: [
            "sohbet",
            "chat"
        ],

        MAC: [
            "maç",
            "mac",
            "maçlar",
            "maclar"
        ],

        FIKSTUR: [
            "fikstür",
            "fikstur"
        ],

        PUAN: [
            "puan",
            "puan-durumu",
            "puan_tablosu"
        ],

        BOT_DURUM: [
            "bot-durum",
            "botdurum",
            "bot-durumu"
        ],

        ANTRENMAN: [
            "antrenman",
            "antreman"
        ],

        PENALTI: [
            "penaltı",
            "penalti"
        ]
    };

    return resolveChannel(
        guild,
        CHANNELS[key],
        names[key] || []
    );
}

/* =========================================================
   ÖZEL ROLLER
========================================================= */

function getSpecialRole(
    guild,
    key
) {

    const names = {

        KAYIT_YETKILI: [
            "Kayıt Yetkilisi",
            "Kayit Yetkilisi"
        ],

        KAYITSIZ: [
            "Kayıtsız",
            "Kayitsiz"
        ],

        KALECI: [
            "Kaleci"
        ],

        UYE: [
            "Üye",
            "Uye"
        ],

        FUTBOLCU: [
            "Futbolcu"
        ],

        TEKNIK_DIREKTOR: [
            "Teknik Direktör",
            "Teknik Direktor"
        ],

        DEGER_YETKILI: [
            "Değer Yetkilisi",
            "Deger Yetkilisi"
        ],

        SPIKER: [
            "Spiker"
        ]
    };

    return resolveRole(
        guild,
        ROLES[key],
        names[key] || []
    );
}

/* =========================================================
   TAKIM BUL
========================================================= */

function getTeam(
    name
) {

    if (!name) {
        return null;
    }

    const wanted =
        normalize(name);

    for (
        const [teamName, data]
        of Object.entries(TEAMS)
    ) {

        if (
            normalize(
                teamName
            ) === wanted
        ) {

            return {
                name:
                    teamName,
                ...data
            };
        }
    }

    return null;
}

/* =========================================================
   TAKIM ROLÜ
========================================================= */

function getTeamRole(
    guild,
    teamName
) {

    const team =
        getTeam(teamName);

    if (!team) {
        return null;
    }

    return resolveRole(
        guild,
        team.roleId,
        [teamName]
    );
}

/* =========================================================
   ÜYENİN TAKIMI
========================================================= */

function getMemberTeam(
    member
) {

    if (!member) {
        return null;
    }

    for (
        const teamName
        of Object.keys(TEAMS)
    ) {

        const role =
            getTeamRole(
                member.guild,
                teamName
            );

        if (
            role &&
            member.roles.cache.has(
                role.id
            )
        ) {

            return teamName;
        }
    }

    const guild =
        ensureGuild(
            member.guild.id
        );

    const player =
        guild.players[
            member.id
        ];

    if (
        player &&
        player.team
    ) {

        return player.team;
    }

    return null;
}

/* =========================================================
   TAKIM YÖNETİM YETKİSİ
========================================================= */

function canManageTeam(
    member,
    teamName
) {

    if (
        isOwner(member)
    ) {
        return true;
    }

    if (
        hasSpecialRole(
            member,
            "TEKNIK_DIREKTOR"
        )
    ) {
        return true;
    }

    const ownTeam =
        getMemberTeam(
            member
        );

    return (
        ownTeam &&
        normalize(
            ownTeam
        ) ===
        normalize(
            teamName
        )
    );
}

/* =========================================================
   ROL KONTROL
========================================================= */

function hasSpecialRole(
    member,
    key
) {

    if (!member) {
        return false;
    }

    if (
        isOwner(member)
    ) {
        return true;
    }

    const role =
        getSpecialRole(
            member.guild,
            key
        );

    return !!(
        role &&
        member.roles.cache.has(
            role.id
        )
    );
}

/* =========================================================
   PLAYER DATA
========================================================= */

function ensurePlayer(
    guildId,
    userId
) {

    const guild =
        ensureGuild(
            guildId
        );

    if (
        !guild.players[userId]
    ) {

        guild.players[userId] = {

            registered: false,

            name: "",

            role: "",

            value: 0,

            team: null,

            position: "",

            registeredAt: null
        };
    }

    return guild.players[userId];
}

/* =========================================================
   BÜTÇE
========================================================= */

function getBudget(
    guildId,
    userId
) {

    const guild =
        ensureGuild(
            guildId
        );

    if (
        typeof guild.budgets[
            userId
        ] !== "number"
    ) {

        guild.budgets[
            userId
        ] = 0;
    }

    return guild.budgets[
        userId
    ];
}

function setBudget(
    guildId,
    userId,
    amount
) {

    const guild =
        ensureGuild(
            guildId
        );

    guild.budgets[
        userId
    ] = Math.max(
        0,
        Number(amount) || 0
    );

    saveDB();
}

/* =========================================================
   MİKTAR
========================================================= */

function parseAmount(
    text
) {

    if (!text) {
        return null;
    }

    let value =
        String(text)
            .toLocaleLowerCase(
                "tr-TR"
            )
            .replace(
                /m€/g,
                ""
            )
            .replace(
                /m/g,
                ""
            )
            .replace(
                /€/g,
                ""
            )
            .replace(
                /\./g,
                ""
            )
            .replace(
                /,/g,
                "."
            )
            .trim();

    const number =
        Number(value);

    if (
        !Number.isFinite(
            number
        )
    ) {
        return null;
    }

    if (number <= 0) {
        return null;
    }

    return number;
}

/* =========================================================
   OYUNCU DEĞERİ GÜNCELLE
========================================================= */

async function updatePlayerValue(
    member,
    newValue
) {

    const player =
        ensurePlayer(
            member.guild.id,
            member.id
        );

    player.value =
        Math.max(
            0,
            Number(newValue) || 0
        );

    const valueText =
        money(
            player.value
        );

    let nickname =
        member.nickname ||
        member.user.username;

    /*
    SADECE M€ KISMI DEĞİŞTİRİLİR.
    */

    if (
        /\|\s*[\d.,]+\s*M€\s*$/i
            .test(nickname)
    ) {

        nickname =
            nickname.replace(
                /\|\s*[\d.,]+\s*M€\s*$/i,
                `| ${valueText}`
            );

    } else if (
        /[\d.,]+\s*M€\s*$/i
            .test(nickname)
    ) {

        nickname =
            nickname.replace(
                /[\d.,]+\s*M€\s*$/i,
                valueText
            );

    } else {

        nickname =
            `${nickname} | ${valueText}`;
    }

    if (
        nickname.length > 32
    ) {

        nickname =
            nickname.substring(
                0,
                32
            );
    }

    try {

        await member.setNickname(
            nickname
        );

    } catch {}

    saveDB();

    return player.value;
}

/* =========================================================
   DEĞER EKLE
========================================================= */

async function addPlayerValue(
    member,
    amount
) {

    const player =
        ensurePlayer(
            member.guild.id,
            member.id
        );

    const oldValue =
        Number(
            player.value
        ) || 0;

    const newValue =
        oldValue +
        Number(amount);

    await updatePlayerValue(
        member,
        newValue
    );

    return {
        oldValue,
        newValue
    };
}

/* =========================================================
   DEĞER SİL
========================================================= */

async function removePlayerValue(
    member,
    amount
) {

    const player =
        ensurePlayer(
            member.guild.id,
            member.id
        );

    const oldValue =
        Number(
            player.value
        ) || 0;

    const newValue =
        Math.max(
            0,
            oldValue -
            Number(amount)
        );

    await updatePlayerValue(
        member,
        newValue
    );

    return {
        oldValue,
        newValue
    };
}

/* =========================================================
   ÜYE BUL
========================================================= */

function findMember(
    message,
    text
) {

    if (!text) {
        return null;
    }

    const mention =
        text.match(
            /^<@!?(\d+)>$/
        );

    if (mention) {

        return (
            message.guild
                .members
                .cache
                .get(
                    mention[1]
                ) ||
            null
        );
    }

    if (
        /^\d{17,20}$/.test(
            text
        )
    ) {

        return (
            message.guild
                .members
                .cache
                .get(
                    text
                ) ||
            null
        );
    }

    const wanted =
        normalize(text);

    return (
        message.guild
            .members
            .cache
            .find(
                member =>
                    normalize(
                        member.user.username
                    ) === wanted ||
                    normalize(
                        member.displayName
                    ) === wanted
            ) ||
        null
    );
}

/* =========================================================
   KANAL KONTROL
========================================================= */

function checkChannel(
    message,
    key,
    name
) {

    const channel =
        getSystemChannel(
            message.guild,
            key
        );

    if (!channel) {

        message.reply(
            `❌ ${name} kanalı bulunamadı.`
        );

        return false;
    }

    if (
        message.channel.id !==
        channel.id
    ) {

        message.reply(
            `❌ Bu komut sadece ${channel} kanalında kullanılabilir.`
        );

        return false;
    }

    return true;
}

/* =========================================================
   KAYIT BUTONLARI
========================================================= */

function registrationButtons(
    userId
) {

    return new ActionRowBuilder()
        .addComponents(

            new ButtonBuilder()
                .setCustomId(
                    `register_${userId}_kaleci`
                )
                .setLabel(
                    "Kaleci"
                )
                .setEmoji(
                    "🧤"
                )
                .setStyle(
                    ButtonStyle.Primary
                ),

            new ButtonBuilder()
                .setCustomId(
                    `register_${userId}_uye`
                )
                .setLabel(
                    "Üye"
                )
                .setEmoji(
                    "👤"
                )
                .setStyle(
                    ButtonStyle.Secondary
                ),

            new ButtonBuilder()
                .setCustomId(
                    `register_${userId}_futbolcu`
                )
                .setLabel(
                    "Futbolcu"
                )
                .setEmoji(
                    "⚽"
                )
                .setStyle(
                    ButtonStyle.Success
                ),

            new ButtonBuilder()
                .setCustomId(
                    `register_${userId}_td`
                )
                .setLabel(
                    "Teknik Direktör"
                )
                .setEmoji(
                    "📋"
                )
                .setStyle(
                    ButtonStyle.Danger
                )
        );
}

/* =========================================================
   KAYIT İŞLEMİ
========================================================= */

async function registerMember(
    guild,
    member,
    selectedRole
) {

    const player =
        ensurePlayer(
            guild.id,
            member.id
        );

    player.registered =
        true;

    player.name =
        member.displayName;

    player.role =
        selectedRole;

    player.registeredAt =
        new Date().toISOString();

    const kayitsiz =
        getSpecialRole(
            guild,
            "KAYITSIZ"
        );

    if (
        kayitsiz &&
        member.roles.cache.has(
            kayitsiz.id
        )
    ) {

        try {
            await member.roles.remove(
                kayitsiz
            );
        } catch {}
    }

    const roleMap = {

        "Kaleci":
            "KALECI",

        "Üye":
            "UYE",

        "Futbolcu":
            "FUTBOLCU",

        "Teknik Direktör":
            "TEKNIK_DIREKTOR"
    };

    const role =
        getSpecialRole(
            guild,
            roleMap[
                selectedRole
            ]
        );

    if (role) {

        try {
            await member.roles.add(
                role
            );
        } catch {}
    }

    saveDB();

    return player;
}

/* =========================================================
   KAYITSIZ YAP
========================================================= */

async function unregisterMember(
    guild,
    member
) {

    const player =
        ensurePlayer(
            guild.id,
            member.id
        );

    player.registered =
        false;

    player.role =
        "";

    player.team =
        null;

    const removeRoles = [
        "KALECI",
        "UYE",
        "FUTBOLCU",
        "TEKNIK_DIREKTOR"
    ];

    for (
        const key
        of removeRoles
    ) {

        const role =
            getSpecialRole(
                guild,
                key
            );

        if (
            role &&
            member.roles.cache.has(
                role.id
            )
        ) {

            try {
                await member.roles.remove(
                    role
                );
            } catch {}
        }
    }

    for (
        const teamName
        of Object.keys(TEAMS)
    ) {

        const role =
            getTeamRole(
                guild,
                teamName
            );

        if (
            role &&
            member.roles.cache.has(
                role.id
            )
        ) {

            try {
                await member.roles.remove(
                    role
                );
            } catch {}
        }
    }

    const kayitsiz =
        getSpecialRole(
            guild,
            "KAYITSIZ"
        );

    if (kayitsiz) {

        try {
            await member.roles.add(
                kayitsiz
            );
        } catch {}
    }

    saveDB();
}

/* =========================================================
   HIZLI .ARA
========================================================= */

function searchPlayers(
    guildId,
    query
) {

    const guild =
        ensureGuild(
            guildId
        );

    const q =
        normalize(query);

    if (!q) {
        return [];
    }

    const results = [];

    for (
        const [
            userId,
            player
        ]
        of Object.entries(
            guild.players
        )
    ) {

        if (
            !player.registered
        ) {
            continue;
        }

        const playerName =
            normalize(
                player.name
            );

        let score = 0;

        if (
            playerName === q
        ) {
            score += 100;
        }

        if (
            playerName.startsWith(q)
        ) {
            score += 70;
        }

        if (
            playerName.includes(q)
        ) {
            score += 50;
        }

        if (
            normalize(
                player.role
            ).includes(q)
        ) {
            score += 15;
        }

        if (
            score > 0
        ) {

            results.push({
                userId,
                player,
                score
            });
        }
    }

    results.sort(
        (a, b) =>
            b.score -
            a.score
    );

    return results.slice(
        0,
        10
    );
}

/* =========================================================
   KADRO
========================================================= */

function getSquad(
    guildId,
    teamName
) {

    const guild =
        ensureGuild(
            guildId
        );

    if (
        !guild.squads[
            teamName
        ]
    ) {

        guild.squads[
            teamName
        ] = [];
    }

    return guild.squads[
        teamName
    ];
}

/* =========================================================
   KADRO DEĞERİ
========================================================= */

function getSquadValue(
    guildId,
    teamName
) {

    const guild =
        ensureGuild(
            guildId
        );

    const squad =
        getSquad(
            guildId,
            teamName
        );

    let total = 0;

    for (
        const item
        of squad
    ) {

        if (
            item.npc
        ) {

            total += 1;
            continue;
        }

        const player =
            guild.players[
                item.userId
            ];

        if (player) {

            total +=
                Number(
                    player.value
                ) || 0;
        }
    }

    return total;
}

/* =========================================================
   NPC
========================================================= */

function createNPC(
    teamName,
    number
) {

    return {

        npc: true,

        name:
            `${teamName} NPC ${number}`,

        position:
            "Oyuncu",

        value: 1
    };
}

/* =========================================================
   MAÇ KADROSU
========================================================= */

function buildMatchSquad(
    guildId,
    teamName
) {

    const guild =
        ensureGuild(
            guildId
        );

    const squad =
        getSquad(
            guildId,
            teamName
        );

    const result = [];

    for (
        const item
        of squad
    ) {

        if (
            result.length >= 11
        ) {
            break;
        }

        if (
            item.npc
        ) {

            result.push(
                item
            );

            continue;
        }

        const player =
            guild.players[
                item.userId
            ];

        if (!player) {
            continue;
        }

        result.push({

            userId:
                item.userId,

            name:
                player.name ||
                item.name ||
                "Oyuncu",

            position:
                item.position ||
                player.position ||
                "Oyuncu",

            value:
                Number(
                    player.value
                ) || 0
        });
    }

    while (
        result.length < 11
    ) {

        result.push(
            createNPC(
                teamName,
                result.length + 1
            )
        );
    }

    return result;
}

/* =========================================================
   PUAN
========================================================= */

function ensurePoints(
    guildId,
    teamName
) {

    const guild =
        ensureGuild(
            guildId
        );

    if (
        !guild.points[
            teamName
        ]
    ) {

        guild.points[
            teamName
        ] = {

            played: 0,

            wins: 0,

            draws: 0,

            losses: 0,

            gf: 0,

            ga: 0,

            points: 0
        };
    }

    return guild.points[
        teamName
    ];
}

/* =========================================================
   PUAN GÜNCELLE
========================================================= */

function updatePoints(
    guildId,
    team1,
    team2,
    score1,
    score2
) {

    const a =
        ensurePoints(
            guildId,
            team1
        );

    const b =
        ensurePoints(
            guildId,
            team2
        );

    a.played++;
    b.played++;

    a.gf += score1;
    a.ga += score2;

    b.gf += score2;
    b.ga += score1;

    if (
        score1 > score2
    ) {

        a.wins++;
        a.points += 3;

        b.losses++;

    } else if (
        score2 > score1
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

    saveDB();
}

/* =========================================================
   PUAN EMBED
========================================================= */

function standingsEmbed(
    guildId
) {

    const guild =
        ensureGuild(
            guildId
        );

    const rows =
        Object.entries(
            guild.points
        )
            .map(
                ([team, data]) => ({
                    team,
                    ...data,
                    gd:
                        data.gf -
                        data.ga
                })
            )
            .sort(
                (a, b) => {

                    if (
                        b.points !==
                        a.points
                    ) {

                        return (
                            b.points -
                            a.points
                        );
                    }

                    return (
                        b.gd -
                        a.gd
                    );
                }
            );

    let text =
        "```text\n";

    text +=
        "Sıra  Takım                 O  G  B  M  AV  P\n";

    text +=
        "------------------------------------------------\n";

    rows.forEach(
        (row, index) => {

            const name =
                row.team
                    .padEnd(
                        20
                    )
                    .slice(
                        0,
                        20
                    );

            text +=
                `${String(index + 1).padEnd(5)}` +
                `${name}` +
                `${String(row.played).padEnd(3)}` +
                `${String(row.wins).padEnd(3)}` +
                `${String(row.draws).padEnd(3)}` +
                `${String(row.losses).padEnd(3)}` +
                `${String(row.gd).padEnd(4)}` +
                `${row.points}\n`;
        }
    );

    text +=
        "```";

    if (
        rows.length === 0
    ) {

        text =
            "Henüz oynanmış maç yok.";
    }

    return new EmbedBuilder()
        .setTitle(
            "🏆 AXERA LEAGUE PUAN DURUMU"
        )
        .setDescription(
            text
        )
        .setTimestamp();
}

/* =========================================================
   PUAN KANALINA GÖNDER
========================================================= */

async function sendStandings(
    guild
) {

    const channel =
        getSystemChannel(
            guild,
            "PUAN"
        );

    if (!channel) {
        return;
    }

    try {

        await channel.send({
            embeds: [
                standingsEmbed(
                    guild.id
                )
            ]
        });

    } catch {}
}

/* =========================================================
   MAÇ OLAYI
========================================================= */

function randomMatchEvent(
    team1,
    team2,
    squad1,
    squad2
) {

    const chance =
        Math.random();

    const first =
        Math.random() <
        0.5;

    const team =
        first
            ? team1
            : team2;

    const squad =
        first
            ? squad1
            : squad2;

    const player =
        squad[
            Math.floor(
                Math.random() *
                squad.length
            )
        ];

    if (
        chance < 0.09
    ) {

        return {
            type: "goal",
            text:
                `⚽ **GOOOL!** ${team} — ${player.name}`
        };
    }

    if (
        chance < 0.15
    ) {

        return {
            type: "save",
            text:
                `🧤 ${player.name} önemli bir kurtarış yaptı!`
        };
    }

    if (
        chance < 0.20
    ) {

        return {
            type: "yellow",
            text:
                `🟨 ${player.name} sarı kart gördü.`
        };
    }

    return null;
}

/* =========================================================
   MAÇ
========================================================= */

async function runMatch(
    guild,
    team1,
    team2
) {

    const channel =
        getSystemChannel(
            guild,
            "MAC"
        );

    if (!channel) {
        return null;
    }

    const squad1 =
        buildMatchSquad(
            guild.id,
            team1
        );

    const squad2 =
        buildMatchSquad(
            guild.id,
            team2
        );

    const matchId =
        `${guild.id}_${Date.now()}`;

    const match = {

        id:
            matchId,

        guildId:
            guild.id,

        team1,

        team2,

        score1: 0,

        score2: 0,

        minute: 0,

        finished: false
    };

    const guildDB =
        ensureGuild(
            guild.id
        );

    guildDB.matches[
        matchId
    ] = match;

    saveDB();

    const startEmbed =
        new EmbedBuilder()
            .setTitle(
                "⚽ AXERA LEAGUE — MAÇ"
            )
            .setDescription(
                `🏟️ **${team1}** 0 - 0 **${team2}**\n\n` +
                `⏱️ Dakika: **0'**\n\n` +
                `👥 Her iki takımın 11 kişilik kadrosu hazır.`
            )
            .setTimestamp();

    const matchMessage =
        await channel.send({
            embeds: [
                startEmbed
            ]
        });

    return new Promise(
        resolve => {

            const timer =
                setInterval(
                    async () => {

                        match.minute++;

                        const event =
                            randomMatchEvent(
                                team1,
                                team2,
                                squad1,
                                squad2
                            );

                        if (event) {

                            if (
                                event.type ===
                                "goal"
                            ) {

                                if (
                                    Math.random() <
                                    0.5
                                ) {

                                    match.score1++;

                                } else {

                                    match.score2++;
                                }
                            }

                            try {

                                await channel.send(
                                    `**${match.minute}'** ${event.text}`
                                );

                            } catch {}
                        }

                        if (
                            match.minute ===
                            45
                        ) {

                            try {

                                await channel.send(
                                    `⏸️ **DEVRE ARASI** — ${team1} ${match.score1}-${match.score2} ${team2}`
                                );

                            } catch {}
                        }

                        if (
                            match.minute % 5 ===
                            0
                        ) {

                            try {

                                await matchMessage.edit({
                                    embeds: [

                                        new EmbedBuilder()
                                            .setTitle(
                                                "⚽ AXERA LEAGUE — CANLI MAÇ"
                                            )
                                            .setDescription(
                                                `**${team1}** ${match.score1} - ${match.score2} **${team2}**\n\n` +
                                                `⏱️ Dakika: **${match.minute}'**`
                                            )
                                            .setTimestamp()
                                    ]
                                });

                            } catch {}
                        }

                        if (
                            match.minute >=
                            90
                        ) {

                            clearInterval(
                                timer
                            );

                            match.finished =
                                true;

                            updatePoints(
                                guild.id,
                                team1,
                                team2,
                                match.score1,
                                match.score2
                            );

                            let winner;

                            if (
                                match.score1 >
                                match.score2
                            ) {

                                winner =
                                    team1;

                            } else if (
                                match.score2 >
                                match.score1
                            ) {

                                winner =
                                    team2;

                            } else {

                                winner =
                                    "Berabere";
                            }

                            const finalEmbed =
                                new EmbedBuilder()
                                    .setTitle(
                                        "🏁 AXERA LEAGUE — MAÇ BİTTİ"
                                    )
                                    .setDescription(
                                        `🏟️ **${team1}** ${match.score1} - ${match.score2} **${team2}**\n\n` +
                                        `🏆 Sonuç: **${winner}**`
                                    )
                                    .setFooter({
                                        text:
                                            "Puanlar otomatik güncellendi."
                                    })
                                    .setTimestamp();

                            try {

                                await matchMessage.edit({
                                    embeds: [
                                        finalEmbed
                                    ]
                                });

                            } catch {}

                            await sendStandings(
                                guild
                            );

                            saveDB();

                            resolve(
                                match
                            );
                        }

                    },
                    3000
                );
        }
    );
}

/* =========================================================
   FİKSTÜR
========================================================= */

async function createFixture(
    message,
    team1,
    team2,
    dateText
) {

    const channel =
        getSystemChannel(
            message.guild,
            "FIKSTUR"
        );

    if (!channel) {

        return message.reply(
            "❌ Fikstür kanalı bulunamadı."
        );
    }

    const date =
        new Date(
            dateText
        );

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return message.reply(
            "❌ Tarih hatalı.\nÖrnek: `.fiksturekle Galatasaray Fenerbahçe 2026-09-10T20:00:00`"
        );
    }

    const fixtureId =
        `${message.guild.id}_${Date.now()}`;

    const embed =
        new EmbedBuilder()
            .setTitle(
                "📅 AXERA LEAGUE — FİKSTÜR"
            )
            .setDescription(
                `🏟️ **${team1}** vs **${team2}**\n\n` +
                `📆 ${dateText}\n` +
                `🕐 Durum: **Bekliyor**`
            )
            .setTimestamp();

    const msg =
        await channel.send({
            embeds: [
                embed
            ]
        });

    const guild =
        ensureGuild(
            message.guild.id
        );

    guild.fixtures[
        fixtureId
    ] = {

        id:
            fixtureId,

        guildId:
            message.guild.id,

        team1,

        team2,

        date:
            date.toISOString(),

        dateText,

        channelId:
            channel.id,

        messageId:
            msg.id,

        status:
            "scheduled"
    };

    saveDB();

    await message.reply(
        `✅ Fikstür oluşturuldu:\n🏟️ **${team1} - ${team2}**`
    );
}

/* =========================================================
   FİKSTÜR KONTROL
========================================================= */

let fixtureLock =
    false;

async function checkFixtures() {

    if (
        fixtureLock
    ) {
        return;
    }

    fixtureLock =
        true;

    try {

        for (
            const guild
            of client.guilds.cache.values()
        ) {

            const guildDB =
                ensureGuild(
                    guild.id
                );

            for (
                const fixture
                of Object.values(
                    guildDB.fixtures
                )
            ) {

                if (
                    fixture.status !==
                    "scheduled"
                ) {
                    continue;
                }

                const target =
                    new Date(
                        fixture.date
                    ).getTime();

                if (
                    Date.now() <
                    target
                ) {
                    continue;
                }

                fixture.status =
                    "live";

                saveDB();

                const fixtureChannel =
                    guild.channels.cache.get(
                        fixture.channelId
                    ) ||
                    getSystemChannel(
                        guild,
                        "FIKSTUR"
                    );

                if (
                    fixtureChannel
                ) {

                    try {

                        const msg =
                            await fixtureChannel
                                .messages
                                .fetch(
                                    fixture.messageId
                                );

                        await msg.edit({
                            embeds: [

                                new EmbedBuilder()
                                    .setTitle(
                                        "🔴 AXERA LEAGUE — CANLI"
                                    )
                                    .setDescription(
                                        `🏟️ **${fixture.team1}** vs **${fixture.team2}**\n\n` +
                                        "⚽ Maç başladı!"
                                    )
                                    .setTimestamp()
                            ]
                        });

                    } catch {}
                }

                const result =
                    await runMatch(
                        guild,
                        fixture.team1,
                        fixture.team2
                    );

                if (!result) {
                    continue;
                }

                fixture.status =
                    "finished";

                fixture.score1 =
                    result.score1;

                fixture.score2 =
                    result.score2;

                fixture.winner =
                    result.score1 >
                    result.score2
                        ? fixture.team1
                        : result.score2 >
                          result.score1
                            ? fixture.team2
                            : "Berabere";

                fixture.finishedAt =
                    new Date()
                        .toISOString();

                saveDB();

                if (
                    fixtureChannel
                ) {

                    try {

                        const msg =
                            await fixtureChannel
                                .messages
                                .fetch(
                                    fixture.messageId
                                );

                        await msg.edit({
                            embeds: [

                                new EmbedBuilder()
                                    .setTitle(
                                        "🏁 AXERA LEAGUE — MAÇ SONUCU"
                                    )
                                    .setDescription(
                                        `🏟️ **${fixture.team1}** ${fixture.score1} - ${fixture.score2} **${fixture.team2}**\n\n` +
                                        `🏆 Sonuç: **${fixture.winner}**`
                                    )
                                    .setTimestamp()
                            ]
                        });

                    } catch {}
                }
            }
        }

    } catch (
        error
    ) {

        console.error(
            "Fikstür hatası:",
            error
        );
    }

    fixtureLock =
        false;
}

/* =========================================================
   BOT DURUM
========================================================= */

const botStartTime =
    Date.now();

function getUptime() {

    const seconds =
        Math.floor(
            (
                Date.now() -
                botStartTime
            ) / 1000
        );

    const hours =
        Math.floor(
            seconds / 3600
        );

    const minutes =
        Math.floor(
            (
                seconds % 3600
            ) / 60
        );

    return `${hours} saat ${minutes} dakika`;
}

async function sendBotStatus() {

    const now =
        new Date();

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
            getSystemChannel(
                guild,
                "BOT_DURUM"
            );

        if (!channel) {
            continue;
        }

        try {

            await channel.send({
                embeds: [

                    new EmbedBuilder()
                        .setTitle(
                            "🤖 BOT DURUMU"
                        )
                        .setDescription(
                            `🟢 Tüm sistemler sorunsuz çalışıyor.\n\n` +
                            `⏱️ Çalışma Süresi: **${getUptime()}**\n` +
                            `🕐 Son Kontrol: **${time}**`
                        )
                        .setTimestamp()
                ]
            });

        } catch {}
    }
}

/* =========================================================
   MESSAGE CREATE
========================================================= */

client.on(
    "messageCreate",
    async message => {

        try {

            if (
                message.author.bot
            ) {
                return;
            }

            if (
                !message.guild
            ) {
                return;
            }

            if (
                !message.content.startsWith(
                    PREFIX
                )
            ) {
                return;
            }

            const args =
                message.content
                    .slice(
                        PREFIX.length
                    )
                    .trim()
                    .split(
                        /\s+/
                    );

            const command =
                normalize(
                    args.shift()
                );

            if (!command) {
                return;
            }

            const guild =
                ensureGuild(
                    message.guild.id
                );

            /* =================================================
               YARDIM
            ================================================= */

            if (
                command ===
                "yardım" ||
                command ===
                "yardim"
            ) {

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            "📚 AXERA LEAGUE KOMUTLARI"
                        )
                        .setDescription(
                            [
                                "👤 **Kayıt**",
                                "`.k @oyuncu TakmaAdı`",
                                "`.kayıtsızver @oyuncu`",

                                "",
                                "🔎 **Oyuncu**",
                                "`.ara oyuncu isim`",

                                "",
                                "💰 **Değer**",
                                "`.dver @oyuncu miktar`",
                                "`.dsil @oyuncu miktar`",

                                "",
                                "💳 **Bütçe**",
                                "`.bütçe`",
                                "`.gönder @oyuncu miktar`",
                                "`.bütçeekle @oyuncu miktar`",
                                "`.bütçesil @oyuncu miktar`",

                                "",
                                "🏋️ **Antrenman**",
                                "`.ant`",
                                "`.antrenman`",

                                "",
                                "🥅 **Penaltı**",
                                "`.pen`",
                                "`.penaltı`",

                                "",
                                "💼 **Transfer**",
                                "`.kap @oyuncu @takım maaş sezon`",

                                "",
                                "👥 **Kadro**",
                                "`.kadro @takım`",
                                "`.kadroekle @takım @oyuncu pozisyon`",
                                "`.kadrosil @takım @oyuncu`",

                                "",
                                "⚽ **Maç**",
                                "`.maç @takım1 @takım2`",

                                "",
                                "📅 **Fikstür**",
                                "`.fiksturekle @takım1 @takım2 2026-09-10T20:00:00`",

                                "",
                                "🏆 **Puan**",
                                "`.puan`",

                                "",
                                "📩 **DM**",
                                "`.dm all mesaj`",
                                "`.dm @oyuncu mesaj`"
                            ].join(
                                "\n"
                            )
                        );

                return message.reply({
                    embeds: [
                        embed
                    ]
                });
            }

            /* =================================================
               KAYIT
            ================================================= */

            if (
                command === "k"
            ) {

                if (
                    !hasSpecialRole(
                        message.member,
                        "KAYIT_YETKILI"
                    )
                ) {

                    return message.reply(
                        "❌ Bu komutu sadece Kayıt Yetkilisi kullanabilir."
                    );
                }

                const target =
                    findMember(
                        message,
                        args[0]
                    );

                if (!target) {

                    return message.reply(
                        "❌ Oyuncuyu belirt."
                    );
                }

                if (
                    !args[1]
                ) {

                    return message.reply(
                        "❌ Takma adı belirt."
                    );
                }

                const nickname =
                    args
                        .slice(1)
                        .join(" ");

                ensurePlayer(
                    guild.id,
                    target.id
                ).name =
                    nickname;

                guild.registrations[
                    target.id
                ] = {
                    nickname,
                    createdBy:
                        message.author.id,
                    createdAt:
                        Date.now()
                };

                saveDB();

                const kayitChannel =
                    getSystemChannel(
                        message.guild,
                        "KAYIT"
                    );

                if (
                    kayitChannel
                ) {

                    await kayitChannel.send({
                        content:
                            `📋 ${target} için kayıt işlemi başlatıldı.\nKayıt yetkilisi: <@&${ROLES.KAYIT_YETKILI}>`,
                        components: [
                            registrationButtons(
                                target.id
                            )
                        ]
                    });
                }

                return message.reply(
                    `✅ ${target} için kayıt paneli oluşturuldu.`
                );
            }

            /* =================================================
               KAYITSIZ
            ================================================= */

            if (
                command ===
                "kayıtsızver" ||
                command ===
                "kayitsizver"
            ) {

                if (
                    !hasSpecialRole(
                        message.member,
                        "KAYIT_YETKILI"
                    )
                ) {

                    return message.reply(
                        "❌ Bu komutu sadece Kayıt Yetkilisi kullanabilir."
                    );
                }

                const target =
                    findMember(
                        message,
                        args[0]
                    );

                if (!target) {

                    return message.reply(
                        "❌ Oyuncuyu belirt."
                    );
                }

                await unregisterMember(
                    message.guild,
                    target
                );

                return message.reply(
                    `✅ ${target} tekrar **Kayıtsız** yapıldı.`
                );
            }

            /* =================================================
               ARA OYUNCU
            ================================================= */

            if (
                command ===
                "ara"
            ) {

                if (
                    normalize(
                        args[0]
                    ) !==
                    "oyuncu"
                ) {

                    return message.reply(
                        "❌ Kullanım: `.ara oyuncu isim`"
                    );
                }

                const query =
                    args
                        .slice(1)
                        .join(" ");

                if (!query) {

                    return message.reply(
                        "❌ Aramak istediğin oyuncunun adını yaz."
                    );
                }

                const results =
                    searchPlayers(
                        guild.id,
                        query
                    );

                if (
                    results.length === 0
                ) {

                    return message.reply(
                        "🔎 Oyuncu bulunamadı."
                    );
                }

                const lines = [];

                for (
                    let i = 0;
                    i < results.length;
                    i++
                ) {

                    const item =
                        results[i];

                    const member =
                        message.guild
                            .members
                            .cache
                            .get(
                                item.userId
                            );

                    const team =
                        item.player.team ||
                        "Takımsız";

                    lines.push(
                        `**${i + 1}. ${item.player.name || member?.displayName || "Oyuncu"}**\n` +
                        `👤 Rol: **${item.player.role || "Bilinmiyor"}**\n` +
                        `💰 Değer: **${money(item.player.value)}**\n` +
                        `🏟️ Takım: **${team}**`
                    );
                }

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            "🔎 OYUNCU ARAMA"
                        )
                        .setDescription(
                            lines.join(
                                "\n\n"
                            )
                        )
                        .setFooter({
                            text:
                                `${results.length} sonuç gösteriliyor.`
                        });

                return message.reply({
                    embeds: [
                        embed
                    ]
                });
            }

            /* =================================================
               DVER
            ================================================= */

            if (
                command ===
                "dver"
            ) {

                if (
                    !hasSpecialRole(
                        message.member,
                        "DEGER_YETKILI"
                    )
                ) {

                    return message.reply(
                        "❌ Bu komutu sadece Değer Yetkilisi kullanabilir."
                    );
                }

                const target =
                    findMember(
                        message,
                        args[0]
                    );

                const amount =
                    parseAmount(
                        args[1]
                    );

                if (
                    !target ||
                    amount === null
                ) {

                    return message.reply(
                        "❌ Kullanım: `.dver @oyuncu 5M`"
                    );
                }

                const result =
                    await addPlayerValue(
                        target,
                        amount
                    );

                return message.reply(
                    `✅ ${target} oyuncusuna **+${money(amount)}** değer eklendi.\n` +
                    `💰 Eski: **${money(result.oldValue)}**\n` +
                    `📈 Yeni: **${money(result.newValue)}**`
                );
            }

            /* =================================================
               DSİL
            ================================================= */

            if (
                command ===
                "dsil"
            ) {

                if (
                    !hasSpecialRole(
                        message.member,
                        "DEGER_YETKILI"
                    )
                ) {

                    return message.reply(
                        "❌ Bu komutu sadece Değer Yetkilisi kullanabilir."
                    );
                }

                const target =
                    findMember(
                        message,
                        args[0]
                    );

                const amount =
                    parseAmount(
                        args[1]
                    );

                if (
                    !target ||
                    amount === null
                ) {

                    return message.reply(
                        "❌ Kullanım: `.dsil @oyuncu 5M`"
                    );
                }

                const result =
                    await removePlayerValue(
                        target,
                        amount
                    );

                return message.reply(
                    `✅ ${target} oyuncusunun değerinden **-${money(amount)}** çıkarıldı.\n` +
                    `💰 Eski: **${money(result.oldValue)}**\n` +
                    `📉 Yeni: **${money(result.newValue)}**`
                );
            }

            /* =================================================
               ANTRENMAN
            ================================================= */

            if (
                command ===
                "ant" ||
                command ===
                "antrenman"
            ) {

                if (
                    !checkChannel(
                        message,
                        "ANTRENMAN",
                        "Antrenman"
                    )
                ) {
                    return;
                }

                const player =
                    ensurePlayer(
                        guild.id,
                        message.author.id
                    );

                if (
                    !player.registered
                ) {

                    return message.reply(
                        "❌ Önce kayıt olmalısın."
                    );
                }

                const id =
                    message.author.id;

                if (
                    !guild.trainings[id]
                ) {

                    guild.trainings[id] =
                        0;
                }

                if (
                    guild.trainings[id] >=
                    5
                ) {

                    return message.reply(
                        "🏋️ Antrenmanı zaten **5/5** tamamladın."
                    );
                }

                guild.trainings[id]++;

                const stage =
                    guild.trainings[id];

                if (
                    stage < 5
                ) {

                    saveDB();

                    return message.reply(
                        `🏋️ Antrenman tamamlandı!\n📊 İlerleme: **${stage}/5**`
                    );
                }

                const result =
                    await addPlayerValue(
                        message.member,
                        5
                    );

                saveDB();

                return message.reply(
                    `🏋️ **Antrenman 5/5 tamamlandı!**\n\n` +
                    `🎁 Oyuncu değerine **+5M€** eklendi.\n` +
                    `💰 Eski değer: **${money(result.oldValue)}**\n` +
                    `📈 Yeni değer: **${money(result.newValue)}**`
                );
            }

            /* =================================================
               PENALTI
            ================================================= */

            if (
                command ===
                "pen" ||
                command ===
                "penaltı" ||
                command ===
                "penalti"
            ) {

                if (
                    !checkChannel(
                        message,
                        "PENALTI",
                        "Penaltı"
                    )
                ) {
                    return;
                }

                const player =
                    ensurePlayer(
                        guild.id,
                        message.author.id
                    );

                if (
                    !player.registered
                ) {

                    return message.reply(
                        "❌ Önce kayıt olmalısın."
                    );
                }

                const roll =
                    Math.random() *
                    100;

                if (
                    roll < 30
                ) {

                    const result =
                        await addPlayerValue(
                            message.member,
                            5
                        );

                    return message.reply(
                        `⚽ **GOOOL!**\n\n` +
                        `🎁 Oyuncu değerine **+5M€** eklendi.\n` +
                        `💰 Eski değer: **${money(result.oldValue)}**\n` +
                        `📈 Yeni değer: **${money(result.newValue)}**`
                    );
                }

                if (
                    roll < 60
                ) {

                    return message.reply(
                        "🧤 **KALECİ!** Penaltı kurtarıldı."
                    );
                }

                if (
                    roll < 85
                ) {

                    return message.reply(
                        "🥅 **DİREK!** Top direkten döndü."
                    );
                }

                return message.reply(
                    "🚩 **KORNER!** Top savunmadan sekerek kornere çıktı."
                );
            }

            /* =================================================
               BÜTÇE
            ================================================= */

            if (
                command ===
                "bütçe" ||
                command ===
                "butce"
            ) {

                const target =
                    findMember(
                        message,
                        args[0]
                    ) ||
                    message.member;

                const amount =
                    getBudget(
                        guild.id,
                        target.id
                    );

                return message.reply(
                    `💳 ${target} bütçesi: **${money(amount)}**`
                );
            }

            /* =================================================
               BÜTÇE EKLE
            ================================================= */

            if (
                command ===
                "bütçeekle" ||
                command ===
                "butceekle"
            ) {

                if (
                    !hasSpecialRole(
                        message.member,
                        "DEGER_YETKILI"
                    )
                ) {

                    return message.reply(
                        "❌ Bu komutu sadece Değer Yetkilisi kullanabilir."
                    );
                }

                const target =
                    findMember(
                        message,
                        args[0]
                    );

                const amount =
                    parseAmount(
                        args[1]
                    );

                if (
                    !target ||
                    amount === null
                ) {

                    return message.reply(
                        "❌ Kullanım: `.bütçeekle @oyuncu 10M`"
                    );
                }

                const old =
                    getBudget(
                        guild.id,
                        target.id
                    );

                setBudget(
                    guild.id,
                    target.id,
                    old + amount
                );

                return message.reply(
                    `✅ ${target} bütçesine **+${money(amount)}** eklendi.\n` +
                    `💳 Yeni bütçe: **${money(old + amount)}**`
                );
            }

            /* =================================================
               BÜTÇE SİL
            ================================================= */

            if (
                command ===
                "bütçesil" ||
                command ===
                "butcesil"
            ) {

                if (
                    !hasSpecialRole(
                        message.member,
                        "DEGER_YETKILI"
                    )
                ) {

                    return message.reply(
                        "❌ Bu komutu sadece Değer Yetkilisi kullanabilir."
                    );
                }

                const target =
                    findMember(
                        message,
                        args[0]
                    );

                const amount =
                    parseAmount(
                        args[1]
                    );

                if (
                    !target ||
                    amount === null
                ) {

                    return message.reply(
                        "❌ Kullanım: `.bütçesil @oyuncu 10M`"
                    );
                }

                const old =
                    getBudget(
                        guild.id,
                        target.id
                    );

                const next =
                    Math.max(
                        0,
                        old - amount
                    );

                setBudget(
                    guild.id,
                    target.id,
                    next
                );

                return message.reply(
                    `✅ ${target} bütçesinden **-${money(amount)}** çıkarıldı.\n` +
                    `💳 Yeni bütçe: **${money(next)}**`
                );
            }

            /* =================================================
               PARA GÖNDER
            ================================================= */

            if (
                command ===
                "gönder" ||
                command ===
                "gonder"
            ) {

                const target =
                    findMember(
                        message,
                        args[0]
                    );

                const amount =
                    parseAmount(
                        args[1]
                    );

                if (
                    !target ||
                    amount === null
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

                const senderBalance =
                    getBudget(
                        guild.id,
                        message.author.id
                    );

                if (
                    senderBalance <
                    amount
                ) {

                    return message.reply(
                        `❌ Yetersiz bütçe.\n💳 Bütçen: **${money(senderBalance)}**`
                    );
                }

                const targetBalance =
                    getBudget(
                        guild.id,
                        target.id
                    );

                setBudget(
                    guild.id,
                    message.author.id,
                    senderBalance -
                        amount
                );

                setBudget(
                    guild.id,
                    target.id,
                    targetBalance +
                        amount
                );

                return message.reply(
                    `✅ ${target} kullanıcısına **${money(amount)}** gönderildi.`
                );
            }

            /* =================================================
               KAP
            ================================================= */

            if (
                command ===
                "kap"
            ) {

                const target =
                    findMember(
                        message,
                        args[0]
                    );

                const team =
                    getTeam(
                        args[1]
                    );

                const salary =
                    parseAmount(
                        args[2]
                    );

                const seasons =
                    Number(
                        args[3]
                    );

                if (
                    !target ||
                    !team ||
                    salary === null ||
                    !Number.isInteger(
                        seasons
                    ) ||
                    seasons < 1 ||
                    seasons > 10
                ) {

                    return message.reply(
                        "❌ Kullanım: `.kap @oyuncu @takım 5 3`\nMaksimum sözleşme: **10 sezon**"
                    );
                }

                if (
                    !canManageTeam(
                        message.member,
                        team.name
                    )
                ) {

                    return message.reply(
                        "❌ `.kap` komutunu sadece Teknik Direktör, takımlı kullanıcı veya bot sahibi kullanabilir."
                    );
                }

                const targetPlayer =
                    ensurePlayer(
                        guild.id,
                        target.id
                    );

                if (
                    !targetPlayer.registered
                ) {

                    return message.reply(
                        "❌ Oyuncu kayıtlı değil."
                    );
                }

                if (
                    !hasSpecialRole(
                        target,
                        "FUTBOLCU"
                    )
                ) {

                    return message.reply(
                        "❌ Bu kişi Futbolcu rolüne sahip değil."
                    );
                }

                if (
                    targetPlayer.team
                ) {

                    return message.reply(
                        "❌ Bu oyuncunun zaten bir takımı var."
                    );
                }

                const transferId =
                    `${guild.id}_${Date.now()}`;

                guild.transfers[
                    transferId
                ] = {

                    id:
                        transferId,

                    from:
                        message.author.id,

                    player:
                        target.id,

                    team:
                        team.name,

                    salary,

                    seasons,

                    status:
                        "pending",

                    createdAt:
                        Date.now()
                };

                saveDB();

                const total =
                    salary *
                    seasons;

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            "📄 AXERA LEAGUE — KAP"
                        )
                        .setDescription(
                            `👤 Oyuncu: ${target}\n\n` +
                            `🏟️ Takım: **${team.name}**\n` +
                            `💰 Sezon Başı Maaş: **${money(salary)}**\n` +
                            `📅 Sözleşme: **${seasons} sezon**\n` +
                            `💵 Toplam Maaş: **${money(total)}**`
                        )
                        .setFooter({
                            text:
                                "Teklifi yalnızca oyuncu kabul veya reddedebilir."
                        });

                const row =
                    new ActionRowBuilder()
                        .addComponents(

                            new ButtonBuilder()
                                .setCustomId(
                                    `kap_accept_${transferId}`
                                )
                                .setLabel(
                                    "Kabul Et"
                                )
                                .setEmoji(
                                    "✅"
                                )
                                .setStyle(
                                    ButtonStyle.Success
                                ),

                            new ButtonBuilder()
                                .setCustomId(
                                    `kap_reject_${transferId}`
                                )
                                .setLabel(
                                    "Reddet"
                                )
                                .setEmoji(
                                    "❌"
                                )
                                .setStyle(
                                    ButtonStyle.Danger
                                )
                        );

                return message.channel.send({
                    embeds: [
                        embed
                    ],
                    components: [
                        row
                    ]
                });
            }

            /* =================================================
               KADRO
            ================================================= */

            if (
                command ===
                "kadro"
            ) {

                const team =
                    getTeam(
                        args.join(" ")
                    );

                if (!team) {

                    return message.reply(
                        "❌ Geçerli bir takım belirt."
                    );
                }

                const squad =
                    getSquad(
                        guild.id,
                        team.name
                    );

                if (
                    squad.length === 0
                ) {

                    return message.reply(
                        `👥 **${team.name}** kadrosu boş.`
                    );
                }

                const lines = [];

                for (
                    let i = 0;
                    i < squad.length;
                    i++
                ) {

                    const item =
                        squad[i];

                    if (
                        item.npc
                    ) {

                        lines.push(
                            `${i + 1}. 🤖 ${item.name} — ${item.position}`
                        );

                        continue;
                    }

                    const player =
                        guild.players[
                            item.userId
                        ];

                    if (
                        player
                    ) {

                        lines.push(
                            `${i + 1}. ⚽ ${player.name || item.name} — ${item.position || player.position || "Oyuncu"} — ${money(player.value)}`
                        );
                    }
                }

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            `👥 ${team.name} KADROSU`
                        )
                        .setDescription(
                            lines.join(
                                "\n"
                            )
                        )
                        .addFields({
                            name:
                                "💰 Kadro Değeri",
                            value:
                                money(
                                    getSquadValue(
                                        guild.id,
                                        team.name
                                    )
                                )
                        });

                return message.reply({
                    embeds: [
                        embed
                    ]
                });
            }

            /* =================================================
               KADRO EKLE
            ================================================= */

            if (
                command ===
                "kadroekle"
            ) {

                const team =
                    getTeam(
                        args[0]
                    );

                const target =
                    findMember(
                        message,
                        args[1]
                    );

                const position =
                    args
                        .slice(2)
                        .join(" ") ||
                    "Oyuncu";

                if (
                    !team ||
                    !target
                ) {

                    return message.reply(
                        "❌ Kullanım: `.kadroekle Galatasaray @Oyuncu SNT`"
                    );
                }

                if (
                    !canManageTeam(
                        message.member,
                        team.name
                    )
                ) {

                    return message.reply(
                        "❌ Bu takımın kadrosunu yönetme yetkin yok."
                    );
                }

                const player =
                    ensurePlayer(
                        guild.id,
                        target.id
                    );

                if (
                    !player.registered
                ) {

                    return message.reply(
                        "❌ Oyuncu kayıtlı değil."
                    );
                }

                const squad =
                    getSquad(
                        guild.id,
                        team.name
                    );

                if (
                    squad.some(
                        x =>
                            !x.npc &&
                            x.userId ===
                            target.id
                    )
                ) {

                    return message.reply(
                        "❌ Oyuncu zaten kadroda."
                    );
                }

                if (
                    squad.length >= 11
                ) {

                    return message.reply(
                        "❌ Kadro zaten 11 kişi."
                    );
                }

                squad.push({

                    userId:
                        target.id,

                    name:
                        player.name ||
                        target.displayName,

                    position
                });

                player.team =
                    team.name;

                player.position =
                    position;

                saveDB();

                return message.reply(
                    `✅ ${target} oyuncusu **${team.name}** kadrosuna eklendi.\n📍 Pozisyon: **${position}**`
                );
            }

            /* =================================================
               KADRO SİL
            ================================================= */

            if (
                command ===
                "kadrosil"
            ) {

                const team =
                    getTeam(
                        args[0]
                    );

                const target =
                    findMember(
                        message,
                        args[1]
                    );

                if (
                    !team ||
                    !target
                ) {

                    return message.reply(
                        "❌ Kullanım: `.kadrosil Galatasaray @Oyuncu`"
                    );
                }

                if (
                    !canManageTeam(
                        message.member,
                        team.name
                    )
                ) {

                    return message.reply(
                        "❌ Bu takımın kadrosunu yönetme yetkin yok."
                    );
                }

                const squad =
                    getSquad(
                        guild.id,
                        team.name
                    );

                const index =
                    squad.findIndex(
                        x =>
                            !x.npc &&
                            x.userId ===
                            target.id
                    );

                if (
                    index === -1
                ) {

                    return message.reply(
                        "❌ Oyuncu bu kadroda değil."
                    );
                }

                squad.splice(
                    index,
                    1
                );

                const player =
                    ensurePlayer(
                        guild.id,
                        target.id
                    );

                if (
                    player.team ===
                    team.name
                ) {

                    player.team =
                        null;
                }

                saveDB();

                return message.reply(
                    `✅ ${target} **${team.name}** kadrosundan çıkarıldı.`
                );
            }

            /* =================================================
               MAÇ
            ================================================= */

            if (
                command ===
                "maç" ||
                command ===
                "mac"
            ) {

                if (
                    !isOwner(
                        message.member
                    ) &&
                    !hasSpecialRole(
                        message.member,
                        "SPIKER"
                    )
                ) {

                    return message.reply(
                        "❌ Maçı sadece Spiker veya bot sahibi başlatabilir."
                    );
                }

                const team1 =
                    getTeam(
                        args[0]
                    );

                const team2 =
                    getTeam(
                        args.slice(1).join(" ")
                    );

                if (
                    !team1 ||
                    !team2
                ) {

                    return message.reply(
                        "❌ Kullanım: `.maç Galatasaray Fenerbahçe`"
                    );
                }

                if (
                    normalize(
                        team1.name
                    ) ===
                    normalize(
                        team2.name
                    )
                ) {

                    return message.reply(
                        "❌ Aynı takım kendisiyle oynayamaz."
                    );
                }

                return runMatch(
                    message.guild,
                    team1.name,
                    team2.name
                );
            }

            /* =================================================
               PUAN
            ================================================= */

            if (
                command ===
                "puan"
            ) {

                return message.reply({
                    embeds: [
                        standingsEmbed(
                            guild.id
                        )
                    ]
                });
            }

            /* =================================================
               FİKSTÜR EKLE
            ================================================= */

            if (
                command ===
                "fiksturekle"
            ) {

                if (
                    !isOwner(
                        message.member
                    ) &&
                    !hasSpecialRole(
                        message.member,
                        "SPIKER"
                    )
                ) {

                    return message.reply(
                        "❌ Fikstürü sadece Spiker veya bot sahibi oluşturabilir."
                    );
                }

                const team1 =
                    getTeam(
                        args[0]
                    );

                const team2 =
                    getTeam(
                        args[1]
                    );

                const dateText =
                    args
                        .slice(2)
                        .join(" ");

                if (
                    !team1 ||
                    !team2 ||
                    !dateText
                ) {

                    return message.reply(
                        "❌ Kullanım: `.fiksturekle Galatasaray Fenerbahçe 2026-09-10T20:00:00`"
                    );
                }

                return createFixture(
                    message,
                    team1.name,
                    team2.name,
                    dateText
                );
            }

            /* =================================================
               DM
            ================================================= */

            if (
                command ===
                "dm"
            ) {

                if (
                    !isAdmin(
                        message.member
                    )
                ) {

                    return message.reply(
                        "❌ Bu komutu sadece bot sahibi veya Administrator kullanabilir."
                    );
                }

                if (
                    normalize(
                        args[0]
                    ) === "all"
                ) {

                    const text =
                        args
                            .slice(1)
                            .join(" ");

                    if (!text) {

                        return message.reply(
                            "❌ Gönderilecek mesajı yaz."
                        );
                    }

                    let success = 0;
                    let failed = 0;

                    await message.reply(
                        "📨 Toplu DM gönderimi başlatıldı..."
                    );

                    for (
                        const member
                        of message.guild
                            .members
                            .cache
                            .values()
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

                            await new Promise(
                                resolve =>
                                    setTimeout(
                                        resolve,
                                        500
                                    )
                            );

                        } catch {

                            failed++;
                        }
                    }

                    return message.channel.send(
                        `📨 **DM işlemi tamamlandı.**\n✅ Başarılı: **${success}**\n❌ Başarısız: **${failed}**`
                    );
                }

                const target =
                    findMember(
                        message,
                        args[0]
                    );

                const text =
                    args
                        .slice(1)
                        .join(" ");

                if (
                    !target ||
                    !text
                ) {

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
                        "❌ Kullanıcının DM'si kapalı olabilir."
                    );
                }
            }

        } catch (
            error
        ) {

            console.error(
                "MESSAGE ERROR:",
                error
            );

            try {

                await message.reply(
                    "❌ Komut çalıştırılırken bir hata oluştu."
                );

            } catch {}
        }
    }
);

/* =========================================================
   BUTTON INTERACTIONS
========================================================= */

client.on(
    "interactionCreate",
    async interaction => {

        try {

            if (
                !interaction.isButton()
            ) {
                return;
            }

            const guild =
                interaction.guild;

            if (!guild) {
                return;
            }

            /* ================================================
               KAYIT BUTONLARI
            ================================================ */

            if (
                interaction.customId.startsWith(
                    "register_"
                )
            ) {

                if (
                    !isOwner(
                        interaction.member
                    ) &&
                    !hasSpecialRole(
                        interaction.member,
                        "KAYIT_YETKILI"
                    )
                ) {

                    return interaction.reply({
                        content:
                            "❌ Bu paneli sadece Kayıt Yetkilisi kullanabilir.",
                        ephemeral:
                            true
                    });
                }

                const parts =
                    interaction.customId
                        .split("_");

                const targetId =
                    parts[1];

                const type =
                    parts[2];

                const target =
                    await guild.members
                        .fetch(
                            targetId
                        )
                        .catch(
                            () => null
                        );

                if (!target) {

                    return interaction.reply({
                        content:
                            "❌ Oyuncu bulunamadı.",
                        ephemeral:
                            true
                    });
                }

                const roleMap = {

                    kaleci:
                        "Kaleci",

                    uye:
                        "Üye",

                    futbolcu:
                        "Futbolcu",

                    td:
                        "Teknik Direktör"
                };

                const selected =
                    roleMap[type];

                if (!selected) {

                    return interaction.reply({
                        content:
                            "❌ Geçersiz rol.",
                        ephemeral:
                            true
                    });
                }

                await registerMember(
                    guild,
                    target,
                    selected
                );

                const sohbet =
                    getSystemChannel(
                        guild,
                        "SOHBET"
                    );

                if (sohbet) {

                    await sohbet.send(
                        `🎉 Hoş geldin ${target}! **${selected}** olarak kaydın tamamlandı.`
                    );
                }

                await interaction.update({
                    content:
                        `✅ ${target} kaydedildi.\n👤 Rol: **${selected}**`,
                    embeds: [],
                    components: []
                });

                return;
            }

            /* ================================================
               KAP KABUL
            ================================================ */

            if (
                interaction.customId.startsWith(
                    "kap_accept_"
                )
            ) {

                const transferId =
                    interaction.customId.replace(
                        "kap_accept_",
                        ""
                    );

                const guildDB =
                    ensureGuild(
                        guild.id
                    );

                const transfer =
                    guildDB.transfers[
                        transferId
                    ];

                if (!transfer) {

                    return interaction.reply({
                        content:
                            "❌ Transfer teklifi bulunamadı.",
                        ephemeral:
                            true
                    });
                }

                if (
                    transfer.status !==
                    "pending"
                ) {

                    return interaction.reply({
                        content:
                            "❌ Bu teklif artık aktif değil.",
                        ephemeral:
                            true
                    });
                }

                if (
                    interaction.user.id !==
                    transfer.player &&
                    !isOwner(
                        interaction.member
                    )
                ) {

                    return interaction.reply({
                        content:
                            "❌ Bu teklif sadece oyuncu tarafından kabul edilebilir.",
                        ephemeral:
                            true
                    });
                }

                const player =
                    await guild.members
                        .fetch(
                            transfer.player
                        )
                        .catch(
                            () => null
                        );

                if (!player) {

                    return interaction.reply({
                        content:
                            "❌ Oyuncu bulunamadı.",
                        ephemeral:
                            true
                    });
                }

                const playerData =
                    ensurePlayer(
                        guild.id,
                        player.id
                    );

                if (
                    playerData.team
                ) {

                    transfer.status =
                        "cancelled";

                    saveDB();

                    return interaction.reply({
                        content:
                            "❌ Oyuncunun zaten takımı bulunuyor.",
                        ephemeral:
                            true
                    });
                }

                const teamRole =
                    getTeamRole(
                        guild,
                        transfer.team
                    );

                if (teamRole) {

                    try {

                        await player.roles.add(
                            teamRole
                        );

                    } catch {}
                }

                playerData.team =
                    transfer.team;

                playerData.salary =
                    transfer.salary;

                playerData.seasons =
                    transfer.seasons;

                transfer.status =
                    "accepted";

                transfer.acceptedAt =
                    Date.now();

                saveDB();

                await interaction.update({
                    embeds: [

                        new EmbedBuilder()
                            .setTitle(
                                "✅ TRANSFER TAMAMLANDI"
                            )
                            .setDescription(
                                `👤 Oyuncu: ${player}\n` +
                                `🏟️ Takım: **${transfer.team}**\n` +
                                `💰 Maaş: **${money(transfer.salary)} / sezon**\n` +
                                `📅 Sözleşme: **${transfer.seasons} sezon**`
                            )
                            .setTimestamp()
                    ],
                    components: []
                });

                return;
            }

            /* ================================================
               KAP REDDET
            ================================================ */

            if (
                interaction.customId.startsWith(
                    "kap_reject_"
                )
            ) {

                const transferId =
                    interaction.customId.replace(
                        "kap_reject_",
                        ""
                    );

                const guildDB =
                    ensureGuild(
                        guild.id
                    );

                const transfer =
                    guildDB.transfers[
                        transferId
                    ];

                if (!transfer) {

                    return interaction.reply({
                        content:
                            "❌ Transfer teklifi bulunamadı.",
                        ephemeral:
                            true
                    });
                }

                if (
                    transfer.status !==
                    "pending"
                ) {

                    return interaction.reply({
                        content:
                            "❌ Bu teklif artık aktif değil.",
                        ephemeral:
                            true
                    });
                }

                if (
                    interaction.user.id !==
                    transfer.player &&
                    !isOwner(
                        interaction.member
                    )
                ) {

                    return interaction.reply({
                        content:
                            "❌ Bu teklif sadece oyuncu tarafından reddedilebilir.",
                        ephemeral:
                            true
                    });
                }

                transfer.status =
                    "rejected";

                transfer.rejectedAt =
                    Date.now();

                saveDB();

                return interaction.update({
                    embeds: [

                        new EmbedBuilder()
                            .setTitle(
                                "❌ TRANSFER REDDEDİLDİ"
                            )
                            .setDescription(
                                "Oyuncu transfer teklifini reddetti."
                            )
                            .setTimestamp()
                    ],
                    components: []
                });
            }

        } catch (
            error
        ) {

            console.error(
                "INTERACTION ERROR:",
                error
            );

            try {

                if (
                    interaction.replied ||
                    interaction.deferred
                ) {

                    await interaction.followUp({
                        content:
                            "❌ İşlem sırasında hata oluştu.",
                        ephemeral:
                            true
                    });

                } else {

                    await interaction.reply({
                        content:
                            "❌ İşlem sırasında hata oluştu.",
                        ephemeral:
                            true
                    });
                }

            } catch {}
        }
    }
);

/* =========================================================
   YENİ ÜYE
========================================================= */

client.on(
    "guildMemberAdd",
    async member => {

        try {

            const guild =
                ensureGuild(
                    member.guild.id
                );

            const player =
                ensurePlayer(
                    member.guild.id,
                    member.id
                );

            player.registered =
                false;

            const kayitsiz =
                getSpecialRole(
                    member.guild,
                    "KAYITSIZ"
                );

            if (kayitsiz) {

                try {

                    await member.roles.add(
                        kayitsiz
                    );

                } catch {}
            }

            const channel =
                getSystemChannel(
                    member.guild,
                    "KAYIT"
                );

            if (channel) {

                await channel.send(
                    `👋 ${member} sunucuya katıldı.\n📋 Kayıt işlemi için <@&${ROLES.KAYIT_YETKILI}> ilgilenebilir.`
                );
            }

            saveDB();

        } catch (
            error
        ) {

            console.error(
                "Yeni üye hatası:",
                error
            );
        }
    }
);

/* =========================================================
   READY
========================================================= */

client.once(
    "ready",
    async () => {

        console.log(
            `✅ ${client.user.tag} aktif!`
        );

        console.log(
            `🏟️ ${client.guilds.cache.size} sunucuda çalışıyor.`
        );

        /*
        İlk fikstür kontrolü
        */

        await checkFixtures();

        /*
        Her saniye fikstür kontrolü
        */

        setInterval(
            checkFixtures,
            1000
        );

        /*
        Durum mesajı:
        Her saat başı ve yarım saatte
        */

        let lastStatusKey =
            "";

        setInterval(
            async () => {

                const now =
                    new Date();

                const minute =
                    now.getMinutes();

                const hour =
                    now.getHours();

                if (
                    (
                        minute === 0 ||
                        minute === 30
                    )
                ) {

                    const key =
                        `${now.toDateString()}-${hour}-${minute}`;

                    if (
                        key !==
                        lastStatusKey
                    ) {

                        lastStatusKey =
                            key;

                        await sendBotStatus();
                    }
                }

            },
            1000
        );

        /*
        İlk durum
        */

        await sendBotStatus();
    }
);

/* =========================================================
   HATA YAKALAMA
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
   TOKEN KONTROL
========================================================= */

if (!TOKEN) {

    console.error(
        "❌ TOKEN bulunamadı!"
    );

    console.error(
        "Railway/hosting ortam değişkenlerine TOKEN ekle."
    );

    process.exit(1);
}

/*
===========================================================
                CLIENT.LOGIN EN SONDA
===========================================================
*/

client.login(TOKEN);
