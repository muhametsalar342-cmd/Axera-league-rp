const {
    Client,
    GatewayIntentBits,
    Partials,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    PermissionsBitField
} = require("discord.js");

const fs = require("fs");
const path = require("path");

/* =========================================================
   AXERA LEAGUE
   Discord.js v14
   ========================================================= */

const TOKEN = process.env.TOKEN;

if (!TOKEN) {
    console.error("❌ TOKEN bulunamadı. Railway Variables kısmına TOKEN ekle.");
    process.exit(1);
}

/* =========================================================
   ROLLER
   ========================================================= */

const ROLES = {
    FUTBOLCU: "1534457228986421278",
    KALECI: "1534492034243498195",
    KAYITSIZ: "1534457560134844517",
    TEKNIK_DIREKTOR: "1534456648930693120",
    KAYIT_YETKILISI: "1534456315366342716",
    DEGER_YETKILISI: "1534456192913375382",
    MAC_YETKILISI: "1535251168169697390"
};

/* =========================================================
   KANALLAR
   ========================================================= */

const CHANNELS = {
    KAYIT: "1534460177884123276",
    SOHBET: "1534469475917758586",
    ANTRENMAN: "1534474070798762197",
    PENALTI: "1534474327812997192",
    MAC: "1534477626872168541",
    PUAN: "1534475991404253284"
};

/* =========================================================
   AYARLAR
   ========================================================= */

const TIME_ZONE = process.env.TIME_ZONE || "Europe/Istanbul";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.GuildMember
    ]
});

/* =========================================================
   DATA
   ========================================================= */

const DATA_FILE = path.join(__dirname, "data.json");

const defaultData = {
    users: {},
    teams: {},
    fixtures: [],
    standingsMessageId: null,
    activeMatches: {}
};

let data;

function loadData() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            data = JSON.parse(JSON.stringify(defaultData));
            saveData();
            return;
        }

        data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

        data.users ||= {};
        data.teams ||= {};
        data.fixtures ||= [];
        data.activeMatches ||= {};
        if (!("standingsMessageId" in data)) {
            data.standingsMessageId = null;
        }
    } catch (err) {
        console.error("data.json okunamadı:", err);
        data = JSON.parse(JSON.stringify(defaultData));
        saveData();
    }
}

function saveData() {
    try {
        fs.writeFileSync(
            DATA_FILE,
            JSON.stringify(data, null, 2),
            "utf8"
        );
    } catch (err) {
        console.error("data.json kaydedilemedi:", err);
    }
}

loadData();

/* =========================================================
   GENEL YARDIMCILAR
   ========================================================= */

function hasRole(member, roleId) {
    return !!member?.roles?.cache?.has(roleId);
}

function isAdmin(member) {
    return member.permissions.has(
        PermissionsBitField.Flags.Administrator
    );
}

function isRegistrationStaff(member) {
    return hasRole(member, ROLES.KAYIT_YETKILISI);
}

function isValueStaff(member) {
    return hasRole(member, ROLES.DEGER_YETKILISI);
}

function isMatchStaff(member) {
    return hasRole(member, ROLES.MAC_YETKILISI);
}

function getUserData(userId) {
    if (!data.users[userId]) {
        data.users[userId] = {
            training: 0,
            value: 0
        };
    }

    return data.users[userId];
}

function parseMoneyFromNickname(nickname) {
    if (!nickname) return null;

    const match = nickname.match(/(\d+(?:\.\d+)?)M€\s*$/i);

    if (!match) return null;

    return Number(match[1]);
}

function formatMoney(value) {
    const num = Number(value) || 0;

    if (Number.isInteger(num)) {
        return `${num}M€`;
    }

    return `${num.toFixed(2).replace(/\.?0+$/, "")}M€`;
}

function getPlayerValue(member) {
    if (!member) return 0;

    const parsed = parseMoneyFromNickname(
        member.nickname || member.user.username
    );

    return parsed === null ? 0 : parsed;
}

function getMemberDisplayName(member) {
    return member.nickname || member.user.username;
}

function getTeam(teamId) {
    return data.teams[teamId] || null;
}

function getTeamRole(guild, teamId) {
    return guild.roles.cache.get(teamId);
}

function getSquadPlayers(team) {
    return Array.isArray(team?.squad) ? team.squad : [];
}

function calculateTeamValue(team, guild) {
    if (!team) return 0;

    let total = Number(team.manualValue) || 0;

    for (const player of getSquadPlayers(team)) {
        const member = guild.members.cache.get(player.userId);

        if (member) {
            total += getPlayerValue(member);
        } else {
            total += Number(player.value) || 0;
        }
    }

    return total;
}

function syncTeamValue(team, guild) {
    if (!team) return;

    team.totalValue = calculateTeamValue(team, guild);

    for (const player of getSquadPlayers(team)) {
        const member = guild.members.cache.get(player.userId);

        if (member) {
            player.value = getPlayerValue(member);
        }
    }
}

function syncAllTeams(guild) {
    for (const team of Object.values(data.teams)) {
        syncTeamValue(team, guild);
    }

    saveData();
}

/* =========================================================
   POZİSYONLAR
   ========================================================= */

const POSITIONS = [
    "KL",
    "STP",
    "SĞB",
    "SLB",
    "MO",
    "MOO",
    "SĞK",
    "SLK",
    "SNT"
];

const POSITION_NAMES = {
    KL: "Kaleci",
    STP: "Stoper",
    SĞB: "Sağ Bek",
    SLB: "Sol Bek",
    MO: "Merkez Orta Saha",
    MOO: "Ofansif Orta Saha",
    SĞK: "Sağ Kanat",
    SLK: "Sol Kanat",
    SNT: "Santrafor"
};

/* =========================================================
   FORMASYONLAR
   ========================================================= */

const FORMATIONS = {
    "4-4-2": {
        KL: 1,
        STP: 2,
        SĞB: 1,
        SLB: 1,
        MO: 2,
        SĞK: 1,
        SLK: 1,
        SNT: 2
    },

    "4-3-3": {
        KL: 1,
        STP: 2,
        SĞB: 1,
        SLB: 1,
        MO: 3,
        SĞK: 1,
        SLK: 1,
        SNT: 1
    },

    "4-2-3-1": {
        KL: 1,
        STP: 2,
        SĞB: 1,
        SLB: 1,
        MO: 2,
        MOO: 1,
        SĞK: 1,
        SLK: 1,
        SNT: 1
    },

    "3-5-2": {
        KL: 1,
        STP: 3,
        MO: 2,
        MOO: 1,
        SĞK: 1,
        SLK: 1,
        SNT: 2
    },

    "3-4-3": {
        KL: 1,
        STP: 3,
        MO: 2,
        SĞK: 1,
        SLK: 1,
        SNT: 3
    },

    "4-3-1-2": {
        KL: 1,
        STP: 2,
        SĞB: 1,
        SLB: 1,
        MO: 3,
        MOO: 1,
        SNT: 2
    },

    "4-2-2-2": {
        KL: 1,
        STP: 2,
        SĞB: 1,
        SLB: 1,
        MO: 2,
        MOO: 2,
        SNT: 2
    },

    "5-3-2": {
        KL: 1,
        STP: 3,
        SĞB: 1,
        SLB: 1,
        MO: 3,
        SNT: 2
    }
};

/* =========================================================
   TARİH / SAAT
   ========================================================= */

function isValidDate(date) {
    return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function isValidTime(time) {
    return /^\d{2}:\d{2}$/.test(time);
}

function localDateTimeKey(date, time) {
    return `${date} ${time}`;
}

function currentLocalDateTimeKey() {
    const now = new Date();

    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    }).formatToParts(now);

    const obj = {};

    for (const part of parts) {
        if (part.type !== "literal") {
            obj[part.type] = part.value;
        }
    }

    let hour = obj.hour;

    if (hour === "24") {
        hour = "00";
    }

    return `${obj.year}-${obj.month}-${obj.day} ${hour}:${obj.minute}`;
}

function fixtureIsDue(fixture) {
    if (!fixture || fixture.status !== "BEKLIYOR") {
        return false;
    }

    return localDateTimeKey(
        fixture.date,
        fixture.time
    ) <= currentLocalDateTimeKey();
}

/* =========================================================
   İLK 11 KONTROLÜ
   ========================================================= */

function getStartingEleven(team, guild) {
    if (!team) {
        return {
            valid: false,
            players: [],
            reason: "Takım bulunamadı."
        };
    }

    const formation = team.formation || "4-4-2";
    const required = FORMATIONS[formation];

    if (!required) {
        return {
            valid: false,
            players: [],
            reason: "Geçersiz formasyon."
        };
    }

    const squad = getSquadPlayers(team);
    const selected = [];

    for (const position of POSITIONS) {
        const count = required[position] || 0;

        if (count <= 0) continue;

        const players = squad.filter(
            p => p.position === position
        );

        if (players.length < count) {
            return {
                valid: false,
                players: [],
                reason:
                    `${POSITION_NAMES[position] || position} için ${count} oyuncu gerekli.`
            };
        }

        for (let i = 0; i < count; i++) {
            const member = guild.members.cache.get(players[i].userId);

            if (!member) {
                return {
                    valid: false,
                    players: [],
                    reason: "Kadroda sunucuda bulunmayan oyuncu var."
                };
            }

            selected.push({
                ...players[i],
                member
            });
        }
    }

    const goalkeeperCount = selected.filter(
        p => p.position === "KL"
    ).length;

    if (goalkeeperCount !== 1) {
        return {
            valid: false,
            players: [],
            reason: "İlk 11'de tam olarak 1 KL bulunmalıdır."
        };
    }

    return {
        valid: true,
        players: selected
    };
}

/* =========================================================
   PUAN DURUMU
   ========================================================= */

function createTeamData(role) {
    return {
        id: role.id,
        name: role.name,
        manualValue: 0,
        totalValue: 0,
        formation: "4-4-2",
        squad: [],
        stats: {
            O: 0,
            G: 0,
            B: 0,
            M: 0,
            AG: 0,
            YG: 0,
            AV: 0,
            P: 0
        }
    };
}

function ensureTeamStats(team) {
    team.stats ||= {};

    team.stats.O ||= 0;
    team.stats.G ||= 0;
    team.stats.B ||= 0;
    team.stats.M ||= 0;
    team.stats.AG ||= 0;
    team.stats.YG ||= 0;
    team.stats.AV ||= 0;
    team.stats.P ||= 0;
}

function getSortedTeams(guild) {
    const teams = Object.values(data.teams);

    for (const team of teams) {
        ensureTeamStats(team);
        syncTeamValue(team, guild);
    }

    teams.sort((a, b) => {
        if (b.stats.P !== a.stats.P) {
            return b.stats.P - a.stats.P;
        }

        if (b.stats.AV !== a.stats.AV) {
            return b.stats.AV - a.stats.AV;
        }

        if (b.stats.AG !== a.stats.AG) {
            return b.stats.AG - a.stats.AG;
        }

        return a.name.localeCompare(b.name, "tr");
    });

    return teams;
}

function buildStandingsEmbed(guild) {
    const teams = getSortedTeams(guild);

    const embed = new EmbedBuilder()
        .setTitle("🏆 Axera League • Puan Durumu")
        .setDescription(
            teams.length
                ? "Güncel lig sıralaması"
                : "Henüz kayıtlı takım bulunmuyor."
        )
        .setTimestamp();

    if (teams.length) {
        const lines = teams.map((team, index) => {
            const s = team.stats;

            return [
                `**${index + 1}. ${team.name}**`,
                `O: ${s.O} • G: ${s.G} • B: ${s.B} • M: ${s.M}`,
                `AG: ${s.AG} • YG: ${s.YG} • AV: ${s.AV} • **P: ${s.P}**`
            ].join("\n");
        });

        embed.addFields({
            name: "📊 Sıralama",
            value: lines.join("\n\n").slice(0, 1024)
        });
    }

    return embed;
}

async function updateStandingsMessage(guild) {
    const channel = guild.channels.cache.get(CHANNELS.PUAN);

    if (!channel) return;

    const embed = buildStandingsEmbed(guild);

    try {
        if (data.standingsMessageId) {
            const oldMessage = await channel.messages
                .fetch(data.standingsMessageId)
                .catch(() => null);

            if (oldMessage) {
                await oldMessage.edit({
                    embeds: [embed]
                });

                return;
            }
        }

        const newMessage = await channel.send({
            embeds: [embed]
        });

        data.standingsMessageId = newMessage.id;
        saveData();
    } catch (err) {
        console.error("Puan mesajı güncellenemedi:", err);
    }
}

/* =========================================================
   TAKIM KALDIRMA
   ========================================================= */

function removeTeam(teamId) {
    if (!data.teams[teamId]) {
        return false;
    }

    delete data.teams[teamId];

    data.fixtures = data.fixtures.filter(
        fixture =>
            fixture.team1 !== teamId &&
            fixture.team2 !== teamId
    );

    saveData();

    return true;
}

/* =========================================================
   MAÇ MOTORU
   ========================================================= */

function teamStrength(team, guild) {
    if (!team) return 0;

    syncTeamValue(team, guild);

    const value = Number(team.totalValue) || 0;

    return Math.max(1, Math.log10(value + 10));
}

function randomBetween(min, max) {
    return Math.random() * (max - min) + min;
}

function getRandomPlayer(team, guild, positionFilter = null) {
    const valid = getSquadPlayers(team)
        .filter(player => {
            if (!positionFilter) return true;

            if (Array.isArray(positionFilter)) {
                return positionFilter.includes(player.position);
            }

            return player.position === positionFilter;
        })
        .map(player => {
            const member = guild.members.cache.get(player.userId);

            return {
                ...player,
                member
            };
        })
        .filter(player => player.member);

    if (!valid.length) return null;

    return valid[
        Math.floor(Math.random() * valid.length)
    ];
}

function chooseScorer(team, guild) {
    return (
        getRandomPlayer(team, guild, ["SNT", "SĞK", "SLK", "MOO", "MO"]) ||
        getRandomPlayer(team, guild)
    );
}

function generateMatchGoalChance(team1, team2, guild) {
    const s1 = teamStrength(team1, guild);
    const s2 = teamStrength(team2, guild);

    const ratio = s1 / (s1 + s2);

    let chance = 0.065;

    const advantage = ratio - 0.5;

    chance += advantage * 0.035;

    return Math.max(0.045, Math.min(0.085, chance));
}

async function sendMatchEmbed(channel, match, final = false) {
    const team1 = data.teams[match.team1];
    const team2 = data.teams[match.team2];

    if (!team1 || !team2) return;

    const role1 = channel.guild.roles.cache.get(match.team1);
    const role2 = channel.guild.roles.cache.get(match.team2);

    const minute = Math.min(match.minute, 90);

    let description =
        `### ${role1 ? role1.name : team1.name} **${match.score1} - ${match.score2}** ${role2 ? role2.name : team2.name}\n\n` +
        `⏱️ **${minute}'**`;

    if (match.events.length) {
        const recent = match.events.slice(-5);

        description += "\n\n" +
            recent
                .map(event => event.text)
                .join("\n");
    }

    if (final) {
        let resultText;

        if (match.score1 > match.score2) {
            resultText = `🏆 **${role1?.name || team1.name} kazandı!**`;
        } else if (match.score2 > match.score1) {
            resultText = `🏆 **${role2?.name || team2.name} kazandı!**`;
        } else {
            resultText = "🤝 **Maç berabere bitti!**";
        }

        description += `\n\n${resultText}`;

        if (match.scorers.length) {
            description +=
                "\n\n⚽ **Goller**\n" +
                match.scorers
                    .map(
                        s =>
                            `• ${s.teamName} — ${s.playerName} (${s.minute}')`
                    )
                    .join("\n");
        } else {
            description += "\n\n⚽ **Gol olmadı.**";
        }

        description +=
            `\n\n💰 ${team1.name}: **${formatMoney(team1.totalValue)}**` +
            `\n💰 ${team2.name}: **${formatMoney(team2.totalValue)}**`;
    }

    const embed = new EmbedBuilder()
        .setTitle(
            final
                ? "🏁 Axera League • Maç Sonucu"
                : "⚽ Axera League • Canlı Maç"
        )
        .setDescription(description)
        .setTimestamp();

    if (final) {
        embed.setFooter({
            text: "Axera League • Maç Tamamlandı"
        });
    } else {
        embed.setFooter({
            text: "3 gerçek saniye = 1 maç dakikası"
        });
    }

    if (match.messageId) {
        const message = await channel.messages
            .fetch(match.messageId)
            .catch(() => null);

        if (message) {
            await message.edit({
                embeds: [embed]
            });

            return message;
        }
    }

    const sent = await channel.send({
        embeds: [embed]
    });

    match.messageId = sent.id;

    return sent;
}

async function finishMatch(guild, match) {
    const team1 = data.teams[match.team1];
    const team2 = data.teams[match.team2];

    if (!team1 || !team2) {
        return;
    }

    ensureTeamStats(team1);
    ensureTeamStats(team2);

    team1.stats.O++;
    team2.stats.O++;

    team1.stats.AG += match.score1;
    team1.stats.YG += match.score2;

    team2.stats.AG += match.score2;
    team2.stats.YG += match.score1;

    team1.stats.AV =
        team1.stats.AG - team1.stats.YG;

    team2.stats.AV =
        team2.stats.AG - team2.stats.YG;

    if (match.score1 > match.score2) {
        team1.stats.G++;
        team2.stats.M++;

        team1.stats.P += 3;
    } else if (match.score2 > match.score1) {
        team2.stats.G++;
        team1.stats.M++;

        team2.stats.P += 3;
    } else {
        team1.stats.B++;
        team2.stats.B++;

        team1.stats.P++;
        team2.stats.P++;
    }

    match.finishedAt = new Date().toISOString();
    match.status = "TAMAMLANDI";

    delete data.activeMatches[match.team1];
    delete data.activeMatches[match.team2];

    saveData();

    const channel = guild.channels.cache.get(CHANNELS.MAC);

    if (channel) {
        await sendMatchEmbed(channel, match, true);
    }

    await updateStandingsMessage(guild);
}

async function startMatch(guild, fixture) {
    const team1 = data.teams[fixture.team1];
    const team2 = data.teams[fixture.team2];

    if (!team1 || !team2) {
        fixture.status = "HATALI";
        saveData();
        return;
    }

    if (
        data.activeMatches[team1.id] ||
        data.activeMatches[team2.id]
    ) {
        fixture.status = "HATALI";
        fixture.error =
            "Takımlardan biri başka bir maçta.";
        saveData();
        return;
    }

    const lineup1 = getStartingEleven(team1, guild);
    const lineup2 = getStartingEleven(team2, guild);

    if (!lineup1.valid || !lineup2.valid) {
        if (!lineup1.valid && !lineup2.valid) {
            fixture.status = "TAMAMLANDI";
            fixture.score1 = 0;
            fixture.score2 = 0;

            fixture.finishedAt = new Date().toISOString();

            saveData();

            return;
        }

        const winner =
            lineup1.valid
                ? team1
                : team2;

        const loser =
            lineup1.valid
                ? team2
                : team1;

        const match = {
            fixtureId: fixture.id,
            team1: team1.id,
            team2: team2.id,
            score1: lineup1.valid ? 3 : 0,
            score2: lineup2.valid ? 3 : 0,
            minute: 90,
            events: [
                {
                    text:
                        `🏁 **Hükmen sonuç:** ${winner.name}, ${loser.name} karşısında 3-0 hükmen kazandı.`,
                    minute: 0
                }
            ],
            scorers: [],
            messageId: null
        };

        fixture.score1 = match.score1;
        fixture.score2 = match.score2;
        fixture.status = "TAMAMLANDI";

        saveData();

        const channel = guild.channels.cache.get(CHANNELS.MAC);

        if (channel) {
            await sendMatchEmbed(channel, match, true);
        }

        team1.stats.O++;
        team2.stats.O++;

        team1.stats.AG += match.score1;
        team1.stats.YG += match.score2;

        team2.stats.AG += match.score2;
        team2.stats.YG += match.score1;

        team1.stats.AV =
            team1.stats.AG - team1.stats.YG;

        team2.stats.AV =
            team2.stats.AG - team2.stats.YG;

        if (match.score1 > match.score2) {
            team1.stats.G++;
            team2.stats.M++;
            team1.stats.P += 3;
        } else {
            team2.stats.G++;
            team1.stats.M++;
            team2.stats.P += 3;
        }

        saveData();

        await updateStandingsMessage(guild);

        return;
    }

    const match = {
        fixtureId: fixture.id,
        team1: team1.id,
        team2: team2.id,
        score1: 0,
        score2: 0,
        minute: 0,
        events: [
            {
                text:
                    `🟢 **Maç başladı!** ${team1.name} ile ${team2.name} sahada.`,
                minute: 0
            }
        ],
        scorers: [],
        messageId: null,
        startedAt: new Date().toISOString(),
        timer: null
    };

    fixture.status = "BAŞLIYOR";
    fixture.startedAt = match.startedAt;

    data.activeMatches[team1.id] = match.fixtureId;
    data.activeMatches[team2.id] = match.fixtureId;

    saveData();

    const channel = guild.channels.cache.get(CHANNELS.MAC);

    if (!channel) {
        fixture.status = "HATALI";
        delete data.activeMatches[team1.id];
        delete data.activeMatches[team2.id];
        saveData();
        return;
    }

    await sendMatchEmbed(channel, match);

    const goalChance1 = generateMatchGoalChance(
        team1,
        team2,
        guild
    );

    const goalChance2 = generateMatchGoalChance(
        team2,
        team1,
        guild
    );

    match.timer = setInterval(async () => {
        try {
            match.minute++;

            if (match.minute >= 90) {
                clearInterval(match.timer);

                fixture.score1 = match.score1;
                fixture.score2 = match.score2;

                await finishMatch(guild, match);

                return;
            }

            let changed = false;

            if (Math.random() < goalChance1) {
                const scorer = chooseScorer(team1, guild);

                if (scorer?.member) {
                    match.score1++;

                    const playerName =
                        getMemberDisplayName(scorer.member);

                    match.scorers.push({
                        teamName: team1.name,
                        playerName,
                        minute: match.minute
                    });

                    match.events.push({
                        text:
                            `⚽ **GOOOL!** ${team1.name} — ${playerName} fileleri havalandırdı!`,
                        minute: match.minute
                    });

                    changed = true;
                }
            }

            if (Math.random() < goalChance2) {
                const scorer = chooseScorer(team2, guild);

                if (scorer?.member) {
                    match.score2++;

                    const playerName =
                        getMemberDisplayName(scorer.member);

                    match.scorers.push({
                        teamName: team2.name,
                        playerName,
                        minute: match.minute
                    });

                    match.events.push({
                        text:
                            `⚽ **GOOOL!** ${team2.name} — ${playerName} fileleri havalandırdı!`,
                        minute: match.minute
                    });

                    changed = true;
                }
            }

            if (!changed && Math.random() < 0.13) {
                const attackingTeam =
                    Math.random() < 0.5
                        ? team1
                        : team2;

                const attacker =
                    chooseScorer(
                        attackingTeam,
                        guild
                    );

                if (attacker?.member) {
                    const name =
                        getMemberDisplayName(
                            attacker.member
                        );

                    match.events.push({
                        text:
                            `🔥 ${attackingTeam.name} — ${name} tehlikeli bir pozisyona girdi.`,
                        minute: match.minute
                    });
                }
            }

            if (
                match.events.length > 15
            ) {
                match.events =
                    match.events.slice(-15);
            }

            if (
                changed ||
                match.minute % 2 === 0
            ) {
                fixture.score1 = match.score1;
                fixture.score2 = match.score2;

                await sendMatchEmbed(
                    channel,
                    match
                );
            }
        } catch (err) {
            console.error(
                "Maç motoru hatası:",
                err
            );
        }
    }, 3000);
}

/* =========================================================
   FİKSTÜR ZAMANLAYICI
   ========================================================= */

async function checkFixtures() {
    const guilds = client.guilds.cache;

    for (const guild of guilds.values()) {
        for (const fixture of data.fixtures) {
            if (!fixtureIsDue(fixture)) continue;

            await startMatch(
                guild,
                fixture
            );
        }
    }

    saveData();
}

/* =========================================================
   READY
   ========================================================= */

client.once("ready", async () => {
    console.log(
        `✅ ${client.user.tag} olarak giriş yapıldı.`
    );

    console.log(
        `🌍 Saat dilimi: ${TIME_ZONE}`
    );

    for (const guild of client.guilds.cache.values()) {
        syncAllTeams(guild);
        await updateStandingsMessage(guild);
    }

    await checkFixtures();

    setInterval(
        checkFixtures,
        1000
    );
});

/* =========================================================
   YENİ ÜYE
   ========================================================= */

client.on("guildMemberAdd", async member => {
    try {
        const channel =
            member.guild.channels.cache.get(
                CHANNELS.KAYIT
            );

        if (!channel) return;

        const registrationRole =
            member.guild.roles.cache.get(
                ROLES.KAYIT_YETKILISI
            );

        await channel.send({
            content:
                `👋 ${member} hoşgeldin sunucumuza!\n` +
                `📋 ${registrationRole || `<@&${ROLES.KAYIT_YETKILISI}>`} seninle ilgilenecektir.`
        });
    } catch (err) {
        console.error(
            "Yeni üye mesajı hatası:",
            err
        );
    }
});

/* =========================================================
   MESAJ KOMUTLARI
   ========================================================= */

client.on("messageCreate", async message => {
    if (message.author.bot) return;
    if (!message.guild) return;

    if (!message.content.startsWith(".")) return;

    const raw = message.content.slice(1).trim();

    if (!raw) return;

    const parts = raw.split(/\s+/);
    const command = parts.shift().toLowerCase();

    const args = parts;

    /* =====================================================
       YARDIM
       ===================================================== */

    if (
        command === "yardım" ||
        command === "yardim"
    ) {
        const embed = new EmbedBuilder()
            .setTitle("📚 Axera League • Komutlar")
            .setDescription(
                [
                    "**👤 Kayıt**",
                    "`.k @Oyuncu TakmaAdı`",
                    "`.kayıtsızver @Oyuncu`",
                    "",
                    "**⚽ Oyuncu**",
                    "`.ant` / `.antrenman`",
                    "`.pen` / `.penaltı`",
                    "`.dver @Oyuncu 5`",
                    "`.dsil @Oyuncu 5`",
                    "`.ara Oyuncu`",
                    "",
                    "**🏟️ Takım**",
                    "`.takımekle @Takım`",
                    "`.takımkaldır @Takım`",
                    "`.takımdeğer @Takım 850`",
                    "`.kadroekle @Takım @Oyuncu Pozisyon`",
                    "`.kadrocikar @Takım @Oyuncu`",
                    "`.kadro @Takım`",
                    "`.formasyon @Takım`",
                    "",
                    "**🏆 Lig**",
                    "`.puan`",
                    "`.puanekle @Takım 3`",
                    "",
                    "**📅 Fikstür**",
                    "`.fikstur`",
                    "`.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`",
                    "`.fiksturcikar @Takım1 @Takım2`",
                    "",
                    "**⚽ Maç**",
                    "`.maç @Takım1 @Takım2`",
                    "",
                    "**🛡️ Yönetim**",
                    "`.kick @Oyuncu`",
                    "`.ban @Oyuncu`",
                    "`.mute @Oyuncu`",
                    "`.unmute @Oyuncu`",
                    "`.sil 100`",
                    "`.embed Başlık | Açıklama`",
                    "`.tweet Mesaj`"
                ].join("\n")
            )
            .setTimestamp();

        return message.reply({
            embeds: [embed]
        });
    }

    /* =====================================================
       KAYIT
       ===================================================== */

    if (command === "k") {
        if (!isRegistrationStaff(message.member)) {
            return message.reply(
                "❌ Bu komutu sadece **Kayıt Yetkilisi** kullanabilir."
            );
        }

        if (
            message.channel.id !==
            CHANNELS.KAYIT
        ) {
            return message.reply(
                `❌ Bu komut sadece <#${CHANNELS.KAYIT}> kanalında kullanılabilir.`
            );
        }

        const target =
            message.mentions.members.first();

        if (!target) {
            return message.reply(
                "❌ Bir oyuncu etiketle."
            );
        }

        const nickname =
            args
                .filter(
                    x =>
                        !x.startsWith("<@")
                )
                .join(" ")
                .trim();

        if (!nickname) {
            return message.reply(
                "❌ Oyuncunun takma adını yaz."
            );
        }

        if (nickname.length > 32) {
            return message.reply(
                "❌ Takma ad en fazla 32 karakter olabilir."
            );
        }

        try {
            await target.setNickname(
                nickname
            );
        } catch {
            return message.reply(
                "❌ Takma ad değiştirilemedi. Botun rolünün yeterli olduğundan ve Manage Nicknames yetkisi bulunduğundan emin ol."
            );
        }

        const row =
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `register_player_${target.id}`
                    )
                    .setLabel("Futbolcu")
                    .setEmoji("⚽")
                    .setStyle(
                        ButtonStyle.Primary
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        `register_goalkeeper_${target.id}`
                    )
                    .setLabel("Kaleci")
                    .setEmoji("🧤")
                    .setStyle(
                        ButtonStyle.Success
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        `register_manager_${target.id}`
                    )
                    .setLabel(
                        "Teknik Direktör"
                    )
                    .setEmoji("📋")
                    .setStyle(
                        ButtonStyle.Secondary
                    )
            );

        const embed = new EmbedBuilder()
            .setTitle("📋 Oyuncu Kayıt Paneli")
            .setDescription(
                `${target} için kayıt türünü seç.\n\n` +
                "⚽ Futbolcu\n" +
                "🧤 Kaleci\n" +
                "📋 Teknik Direktör"
            )
            .setTimestamp();

        return message.reply({
            embeds: [embed],
            components: [row]
        });
    }

    /* =====================================================
       KAYITSIZ VER
       ===================================================== */

    if (
        command === "kayıtsızver" ||
        command === "kayitsizver"
    ) {
        if (!isRegistrationStaff(message.member)) {
            return message.reply(
                "❌ Bu komutu sadece **Kayıt Yetkilisi** kullanabilir."
            );
        }

        const target =
            message.mentions.members.first();

        if (!target) {
            return message.reply(
                "❌ Bir oyuncu etiketle."
            );
        }

        try {
            await target.roles.remove([
                ROLES.FUTBOLCU,
                ROLES.KALECI,
                ROLES.TEKNIK_DIREKTOR
            ]);

            await target.roles.add(
                ROLES.KAYITSIZ
            );

            return message.reply(
                `✅ ${target} tekrar **Kayıtsız** olarak ayarlandı.`
            );
        } catch {
            return message.reply(
                "❌ Roller değiştirilemedi."
            );
        }
    }

    /* =====================================================
       ANTRENMAN
       ===================================================== */

    if (
        command === "ant" ||
        command === "antrenman"
    ) {
        if (
            message.channel.id !==
            CHANNELS.ANTRENMAN
        ) {
            return message.reply(
                `❌ Bu komut sadece <#${CHANNELS.ANTRENMAN}> kanalında kullanılabilir.`
            );
        }

        const user =
            getUserData(message.author.id);

        user.training =
            Number(user.training) || 0;

        user.training++;

        if (user.training < 5) {
            saveData();

            return message.reply(
                `🏋️ Antrenman tamamlandı!\n\n**İlerleme: ${user.training}/5**`
            );
        }

        const member =
            message.member;

        const currentName =
            member.nickname ||
            member.user.username;

        const currentValue =
            parseMoneyFromNickname(
                currentName
            );

        if (currentValue === null) {
            user.training = 4;
            saveData();

            return message.reply(
                "❌ Takma adında `M€` formatında değer bulunamadı. Ödül kaybolmaması için ilerleme **4/5** olarak bırakıldı."
            );
        }

        const newValue =
            currentValue + 5;

        const match =
            currentName.match(
                /^(.+?)\s*\|\s*(🇦🇱|🇦🇷|🇦🇹|🇦🇺|🇧🇪|🇧🇷|🇨🇭|🇨🇱|🇨🇴|🇩🇪|🇩🇰|🇪🇸|🇫🇷|🇬🇧|🇬🇷|🇭🇷|🇮🇹|🇳🇱|🇳🇴|🇵🇱|🇵🇹|🇷🇸|🇸🇪|🇹🇷|🇺🇦|🇺🇾|🇺🇸|🇲🇽|🇯🇵|🇰🇷)\s*\|\s*([^|]+?)\s*\|\s*\d+(?:\.\d+)?M€\s*$/);

        let newNickname;

        if (match) {
            newNickname =
                `${match[1]} | ${match[2]} | ${match[3]} | ${formatMoney(newValue)}`;
        } else {
            newNickname =
                currentName.replace(
                    /\d+(?:\.\d+)?M€\s*$/i,
                    formatMoney(newValue)
                );
        }

        if (newNickname.length > 32) {
            user.training = 4;
            saveData();

            return message.reply(
                "❌ Yeni takma ad 32 karakteri aşıyor. Ödül kaybolmaması için ilerleme **4/5** olarak bırakıldı."
            );
        }

        try {
            await member.setNickname(
                newNickname
            );

            user.value = newValue;
            user.training = 0;

            syncAllTeams(
                message.guild
            );

            saveData();

            return message.reply(
                `🏆 **Antrenman tamamlandı!**\n\n💰 Değerin **+5M€** arttı.\n💵 Yeni değer: **${formatMoney(newValue)}**\n🔄 İlerleme: **0/5**`
            );
        } catch {
            user.training = 4;
            saveData();

            return message.reply(
                "❌ Değer güncellenemedi. Ödül kaybolmaması için ilerleme **4/5** olarak bırakıldı."
            );
        }
    }

    /* =====================================================
       PENALTI
       ===================================================== */

    if (
        command === "pen" ||
        command === "penaltı" ||
        command === "penalti"
    ) {
        if (
            message.channel.id !==
            CHANNELS.PENALTI
        ) {
            return message.reply(
                `❌ Bu komut sadece <#${CHANNELS.PENALTI}> kanalında kullanılabilir.`
            );
        }

        const outcomes = [
            "goal",
            "post",
            "save"
        ];

        const result =
            outcomes[
                Math.floor(
                    Math.random() *
                    outcomes.length
                )
            ];

        if (result === "goal") {
            const member =
                message.member;

            const currentName =
                member.nickname ||
                member.user.username;

            const currentValue =
                parseMoneyFromNickname(
                    currentName
                );

            if (currentValue === null) {
                return message.reply(
                    "❌ Takma adında `M€` formatında değer bulunamadı."
                );
            }

            const newValue =
                currentValue + 5;

            const newNickname =
                currentName.replace(
                    /\d+(?:\.\d+)?M€\s*$/i,
                    formatMoney(newValue)
                );

            if (newNickname.length > 32) {
                return message.reply(
                    "❌ Yeni takma ad 32 karakteri aşıyor."
                );
            }

            try {
                await member.setNickname(
                    newNickname
                );

                const user =
                    getUserData(
                        message.author.id
                    );

                user.value = newValue;

                syncAllTeams(
                    message.guild
                );

                saveData();

                return message.reply(
                    `⚽ **GOOOL!**\n\n🎉 Penaltıyı gole çevirdin!\n💰 **+5M€**\n💵 Yeni değer: **${formatMoney(newValue)}**`
                );
            } catch {
                return message.reply(
                    "❌ Değer güncellenemedi."
                );
            }
        }

        if (result === "post") {
            return message.reply(
                "🥅 **DİREK!**\n\nTop direkten döndü. Değer değişmedi."
            );
        }

        return message.reply(
            "🧤 **Axera Kalecisi kurtardı!**\n\nDeğer değişmedi."
        );
    }

    /* =====================================================
       DEĞER VER
       ===================================================== */

    if (command === "dver") {
        if (!isValueStaff(message.member)) {
            return message.reply(
                "❌ Bu komutu sadece **Değer Yetkilisi** kullanabilir."
            );
        }

        const target =
            message.mentions.members.first();

        if (!target) {
            return message.reply(
                "❌ Bir oyuncu etiketle."
            );
        }

        const amountText =
            args
                .filter(
                    x =>
                        !x.startsWith("<@")
                )[0];

        const amount =
            Number(amountText);

        if (
            !Number.isFinite(amount) ||
            amount <= 0
        ) {
            return message.reply(
                "❌ Geçerli bir miktar gir. Örnek: `.dver @Oyuncu 5`"
            );
        }

        const nickname =
            target.nickname ||
            target.user.username;

        const currentValue =
            parseMoneyFromNickname(
                nickname
            );

        if (currentValue === null) {
            return message.reply(
                "❌ Oyuncunun takma adı `M€` ile bitmelidir."
            );
        }

        const newValue =
            currentValue + amount;

        const newNickname =
            nickname.replace(
                /\d+(?:\.\d+)?M€\s*$/i,
                formatMoney(newValue)
            );

        if (newNickname.length > 32) {
            return message.reply(
                "❌ Yeni takma ad 32 karakteri aşıyor."
            );
        }

        try {
            await target.setNickname(
                newNickname
            );

            const user =
                getUserData(
                    target.id
                );

            user.value = newValue;

            syncAllTeams(
                message.guild
            );

            saveData();

            return message.reply(
                `✅ ${target} oyuncusuna **+${formatMoney(amount)}** değer verildi.\n💰 Yeni değer: **${formatMoney(newValue)}**`
            );
        } catch {
            return message.reply(
                "❌ Takma ad değiştirilemedi. Botun Manage Nicknames yetkisini ve rol sırasını kontrol et."
            );
        }
    }

    /* =====================================================
       DEĞER SİL
       ===================================================== */

    if (command === "dsil") {
        if (!isValueStaff(message.member)) {
            return message.reply(
                "❌ Bu komutu sadece **Değer Yetkilisi** kullanabilir."
            );
        }

        const target =
            message.mentions.members.first();

        if (!target) {
            return message.reply(
                "❌ Bir oyuncu etiketle."
            );
        }

        const amountText =
            args
                .filter(
                    x =>
                        !x.startsWith("<@")
                )[0];

        const amount =
            Number(amountText);

        if (
            !Number.isFinite(amount) ||
            amount <= 0
        ) {
            return message.reply(
                "❌ Geçerli bir miktar gir."
            );
        }

        const nickname =
            target.nickname ||
            target.user.username;

        const currentValue =
            parseMoneyFromNickname(
                nickname
            );

        if (currentValue === null) {
            return message.reply(
                "❌ Oyuncunun takma adı `M€` ile bitmelidir."
            );
        }

        const newValue =
            Math.max(
                0,
                currentValue - amount
            );

        const newNickname =
            nickname.replace(
                /\d+(?:\.\d+)?M€\s*$/i,
                formatMoney(newValue)
            );

        if (newNickname.length > 32) {
            return message.reply(
                "❌ Yeni takma ad 32 karakteri aşıyor."
            );
        }

        try {
            await target.setNickname(
                newNickname
            );

            const user =
                getUserData(
                    target.id
                );

            user.value = newValue;

            syncAllTeams(
                message.guild
            );

            saveData();

            return message.reply(
                `✅ ${target} oyuncusundan **${formatMoney(amount)}** değer silindi.\n💰 Yeni değer: **${formatMoney(newValue)}**`
            );
        } catch {
            return message.reply(
                "❌ Takma ad değiştirilemedi."
            );
        }
    }

    /* =====================================================
       ARA
       ===================================================== */

    if (command === "ara") {
        const search =
            args.join(" ").trim();

        if (!search) {
            return message.reply(
                "❌ Aramak istediğin oyuncunun adını yaz."
            );
        }

        const normalized =
            search.toLocaleLowerCase(
                "tr-TR"
            );

        const candidates =
            message.guild.members.cache
                .filter(
                    member =>
                        !member.user.bot
                )
                .map(member => {
                    const nickname =
                        getMemberDisplayName(
                            member
                        );

                    const name =
                        nickname.toLocaleLowerCase(
                            "tr-TR"
                        );

                    let score = 0;

                    if (
                        name === normalized
                    ) {
                        score += 100;
                    }

                    if (
                        name.includes(
                            normalized
                        )
                    ) {
                        score += 60;
                    }

                    if (
                        name.startsWith(
                            normalized
                        )
                    ) {
                        score += 30;
                    }

                    for (
                        const word of normalized.split(/\s+/)
                    ) {
                        if (
                            word &&
                            name.includes(word)
                        ) {
                            score += 10;
                        }
                    }

                    return {
                        member,
                        nickname,
                        score
                    };
                })
                .filter(
                    x => x.score > 0
                )
                .sort(
                    (a, b) =>
                        b.score - a.score
                );

        if (!candidates.length) {
            const embed = new EmbedBuilder()
                .setTitle("🔎 Oyuncu Arama")
                .setDescription(
                    `Aranan: **${search}**\n\n⚪ **BOŞ**`
                );

            return message.reply({
                embeds: [embed]
            });
        }

        const result =
            candidates[0];

        const value =
            parseMoneyFromNickname(
                result.nickname
            );

        const embed = new EmbedBuilder()
            .setTitle("🔎 Oyuncu Arama")
            .addFields(
                {
                    name: "Aranan",
                    value: search
                },
                {
                    name: "Oyuncu",
                    value:
                        `${result.member}\n\`${result.nickname}\``
                },
                {
                    name: "Değer",
                    value:
                        value === null
                            ? "Belirsiz"
                            : formatMoney(value)
                },
                {
                    name: "Durum",
                    value: "🟢 DOLU"
                }
            )
            .setTimestamp();

        return message.reply({
            embeds: [embed]
        });
    }

    /* =====================================================
       TWEET
       ===================================================== */

    if (command === "tweet") {
        const tweet =
            args.join(" ").trim();

        if (!tweet) {
            return message.reply(
                "❌ Tweet mesajını yaz."
            );
        }

        const embed = new EmbedBuilder()
            .setAuthor({
                name:
                    getMemberDisplayName(
                        message.member
                    ),
                iconURL:
                    message.author.displayAvatarURL()
            })
            .setDescription(tweet)
            .setFooter({
                text:
                    "Axera League • Tweet"
            })
            .setTimestamp();

        return message.channel.send({
            embeds: [embed]
        });
    }

    /* =====================================================
       TAKIM EKLE
       ===================================================== */

    if (command === "takımekle") {
        if (!isMatchStaff(message.member)) {
            return message.reply(
                "❌ Bu komutu sadece **Maç Yetkilisi** kullanabilir."
            );
        }

        const role =
            message.mentions.roles.first();

        if (!role) {
            return message.reply(
                "❌ Bir takım rolü etiketle."
            );
        }

        if (data.teams[role.id]) {
            return message.reply(
                "❌ Bu takım zaten kayıtlı."
            );
        }

        data.teams[role.id] =
            createTeamData(role);

        saveData();

        await updateStandingsMessage(
            message.guild
        );

        return message.reply(
            `✅ **${role.name}** Axera League'e eklendi.`
        );
    }

    /* =====================================================
       TAKIM KALDIR
       ===================================================== */

    if (
        command === "takımkaldır" ||
        command === "takimkaldir"
    ) {
        if (!isMatchStaff(message.member)) {
            return message.reply(
                "❌ Bu komutu sadece **Maç Yetkilisi** kullanabilir."
            );
        }

        const role =
            message.mentions.roles.first();

        if (!role) {
            return message.reply(
                "❌ Bir takım rolü etiketle."
            );
        }

        if (!data.teams[role.id]) {
            return message.reply(
                "❌ Bu takım puan durumunda bulunmuyor."
            );
        }

        if (
            data.activeMatches[role.id]
        ) {
            return message.reply(
                "❌ Bu takım şu anda aktif bir maçta."
            );
        }

        const teamName =
            data.teams[role.id].name;

        removeTeam(role.id);

        await updateStandingsMessage(
            message.guild
        );

        return message.reply(
            `🗑️ **${teamName}** ligden kaldırıldı.\n\n• Puan durumundan silindi\n• Kadrosu silindi\n• Takım değeri silindi\n• Formasyonu silindi\n• Bekleyen fikstürleri silindi`
        );
    }

    /* =====================================================
       TAKIM DEĞERİ
       ===================================================== */

    if (command === "takımdeğer") {
        if (!isMatchStaff(message.member)) {
            return message.reply(
                "❌ Bu komutu sadece **Maç Yetkilisi** kullanabilir."
            );
        }

        const role =
            message.mentions.roles.first();

        const amountText =
            args
                .filter(
                    x =>
                        !x.startsWith("<@&")
                )[0];

        const amount =
            Number(amountText);

        if (!role) {
            return message.reply(
                "❌ Bir takım rolü etiketle."
            );
        }

        if (
            !Number.isFinite(amount) ||
            amount < 0
        ) {
            return message.reply(
                "❌ Geçerli bir takım değeri gir."
            );
        }

        const team =
            data.teams[role.id];

        if (!team) {
            return message.reply(
                "❌ Bu takım kayıtlı değil."
            );
        }

        team.manualValue = amount;

        syncTeamValue(
            team,
            message.guild
        );

        saveData();

        return message.reply(
            `💰 **${team.name}** takımının taban değeri **${formatMoney(amount)}** olarak ayarlandı.\n📊 Kadro ile toplam değer: **${formatMoney(team.totalValue)}**`
        );
    }

    /* =====================================================
       KADRO EKLE
       ===================================================== */

    if (command === "kadroekle") {
        if (!isMatchStaff(message.member)) {
            return message.reply(
                "❌ Bu komutu sadece **Maç Yetkilisi** kullanabilir."
            );
        }

        const teamRole =
            message.mentions.roles.first();

        const player =
            message.mentions.members.first();

        if (
            !teamRole ||
            !player
        ) {
            return message.reply(
                "❌ Kullanım: `.kadroekle @Takım @Oyuncu Pozisyon`"
            );
        }

        const position =
            args
                .filter(
                    x =>
                        !x.startsWith("<@")
                )[0]
                ?.toUpperCase();

        if (!POSITIONS.includes(position)) {
            return message.reply(
                `❌ Geçersiz pozisyon.\nGeçerli: ${POSITIONS.join(", ")}`
            );
        }

        const team =
            data.teams[teamRole.id];

        if (!team) {
            return message.reply(
                "❌ Bu takım kayıtlı değil."
            );
        }

        team.squad ||= [];

        const existing =
            team.squad.find(
                p =>
                    p.userId ===
                    player.id
            );

        if (existing) {
            return message.reply(
                "❌ Bu oyuncu zaten bu takımın kadrosunda."
            );
        }

        const playerValue =
            getPlayerValue(player);

        team.squad.push({
            userId: player.id,
            position,
            value: playerValue
        });

        syncTeamValue(
            team,
            message.guild
        );

        saveData();

        return message.reply(
            `✅ ${player} **${team.name}** kadrosuna **${position}** olarak eklendi.\n💰 Takım toplam değeri: **${formatMoney(team.totalValue)}**`
        );
    }

    /* =====================================================
       KADRO ÇIKAR
       ===================================================== */

    if (
        command === "kadrocikar" ||
        command === "kadroçıkar" ||
        command === "kadroçikar"
    ) {
        if (!isMatchStaff(message.member)) {
            return message.reply(
                "❌ Bu komutu sadece **Maç Yetkilisi** kullanabilir."
            );
        }

        const teamRole =
            message.mentions.roles.first();

        const player =
            message.mentions.members.first();

        if (
            !teamRole ||
            !player
        ) {
            return message.reply(
                "❌ Kullanım: `.kadrocikar @Takım @Oyuncu`"
            );
        }

        const team =
            data.teams[teamRole.id];

        if (!team) {
            return message.reply(
                "❌ Bu takım kayıtlı değil."
            );
        }

        const oldLength =
            team.squad.length;

        team.squad =
            team.squad.filter(
                p =>
                    p.userId !==
                    player.id
            );

        if (
            team.squad.length ===
            oldLength
        ) {
            return message.reply(
                "❌ Bu oyuncu takımın kadrosunda değil."
            );
        }

        syncTeamValue(
            team,
            message.guild
        );

        saveData();

        return message.reply(
            `✅ ${player} **${team.name}** kadrosundan çıkarıldı.\n💰 Takım toplam değeri: **${formatMoney(team.totalValue)}**`
        );
    }

    /* =====================================================
       KADRO GÖRÜNTÜLE
       ===================================================== */

    if (command === "kadro") {
        const role =
            message.mentions.roles.first();

        if (!role) {
            return message.reply(
                "❌ Bir takım rolü etiketle."
            );
        }

        const team =
            data.teams[role.id];

        if (!team) {
            return message.reply(
                "❌ Bu takım kayıtlı değil."
            );
        }

        syncTeamValue(
            team,
            message.guild
        );

        const embed = new EmbedBuilder()
            .setTitle(
                `🏟️ ${team.name} • Kadro`
            )
            .setDescription(
                `📐 Formasyon: **${team.formation}**\n` +
                `👥 Oyuncu: **${team.squad.length}**\n` +
                `💰 Takım Değeri: **${formatMoney(team.totalValue)}**`
            )
            .setTimestamp();

        for (const position of POSITIONS) {
            const players =
                team.squad.filter(
                    p =>
                        p.position ===
                        position
                );

            if (!players.length)
                continue;

            const value =
                players
                    .map(p => {
                        const member =
                            message.guild.members.cache.get(
                                p.userId
                            );

                        return member
                            ? `• ${member} — **${formatMoney(getPlayerValue(member))}**`
                            : "• Oyuncu bulunamadı";
                    })
                    .join("\n");

            embed.addFields({
                name:
                    `${position} • ${POSITION_NAMES[position]}`,
                value:
                    value.slice(0, 1024)
            });
        }

        return message.reply({
            embeds: [embed]
        });
    }

    /* =====================================================
       FORMASYON
       ===================================================== */

    if (command === "formasyon") {
        if (!isMatchStaff(message.member)) {
            return message.reply(
                "❌ Bu komutu sadece **Maç Yetkilisi** kullanabilir."
            );
        }

        const role =
            message.mentions.roles.first();

        if (!role) {
            return message.reply(
                "❌ Bir takım rolü etiketle."
            );
        }

        const team =
            data.teams[role.id];

        if (!team) {
            return message.reply(
                "❌ Bu takım kayıtlı değil."
            );
        }

        const options =
            Object.keys(FORMATIONS).map(
                formation => ({
                    label: formation,
                    value: formation,
                    description:
                        "Takım formasyonunu seç"
                })
            );

        const menu =
            new StringSelectMenuBuilder()
                .setCustomId(
                    `formation_${role.id}`
                )
                .setPlaceholder(
                    "Formasyon seç"
                )
                .addOptions(options);

        const row =
            new ActionRowBuilder().addComponents(
                menu
            );

        return message.reply({
            content:
                `📐 **${team.name}** için formasyon seç:`,
            components: [row]
        });
    }

    /* =====================================================
       PUAN
       ===================================================== */

    if (command === "puan") {
        await updateStandingsMessage(
            message.guild
        );

        return message.reply({
            embeds: [
                buildStandingsEmbed(
                    message.guild
                )
            ]
        });
    }

    /* =====================================================
       PUAN EKLE
       ===================================================== */

    if (command === "puanekle") {
        if (!isMatchStaff(message.member)) {
            return message.reply(
                "❌ Bu komutu sadece **Maç Yetkilisi** kullanabilir."
            );
        }

        const role =
            message.mentions.roles.first();

        const amountText =
            args
                .filter(
                    x =>
                        !x.startsWith("<@&")
                )[0];

        const amount =
            Number(amountText);

        if (!role) {
            return message.reply(
                "❌ Bir takım rolü etiketle."
            );
        }

        if (
            !Number.isInteger(amount)
        ) {
            return message.reply(
                "❌ Tam sayı bir puan gir."
            );
        }

        const team =
            data.teams[role.id];

        if (!team) {
            return message.reply(
                "❌ Bu takım kayıtlı değil."
            );
        }

        ensureTeamStats(team);

        team.stats.P += amount;

        if (team.stats.P < 0) {
            team.stats.P = 0;
        }

        saveData();

        await updateStandingsMessage(
            message.guild
        );

        return message.reply(
            `✅ **${team.name}** takımının puanı **${amount >= 0 ? "+" : ""}${amount}** değiştirildi.\n🏆 Yeni puan: **${team.stats.P}**`
        );
    }

    /* =====================================================
       FİKSTÜR
       ===================================================== */

    if (command === "fikstur") {
        const fixtures =
            [...data.fixtures]
                .sort((a, b) =>
                    localDateTimeKey(
                        a.date,
                        a.time
                    ).localeCompare(
                        localDateTimeKey(
                            b.date,
                            b.time
                        )
                    )
                );

        const embed = new EmbedBuilder()
            .setTitle(
                "📅 Axera League • Fikstür"
            )
            .setTimestamp();

        if (!fixtures.length) {
            embed.setDescription(
                "Henüz fikstür bulunmuyor."
            );

            return message.reply({
                embeds: [embed]
            });
        }

        const lines =
            fixtures.map(fixture => {
                const team1 =
                    data.teams[
                        fixture.team1
                    ];

                const team2 =
                    data.teams[
                        fixture.team2
                    ];

                if (!team1 || !team2) {
                    return null;
                }

                let status = "⏳ Bekliyor";

                if (
                    fixture.status ===
                    "TAMAMLANDI"
                ) {
                    status =
                        `🏁 ${fixture.score1} - ${fixture.score2}`;
                } else if (
                    fixture.status ===
                    "BAŞLIYOR"
                ) {
                    status =
                        "🟢 Başlıyor";
                } else if (
                    fixture.status ===
                    "HATALI"
                ) {
                    status =
                        "❌ Hatalı";
                }

                return (
                    `**${team1.name}** 🆚 **${team2.name}**\n` +
                    `📅 ${fixture.date} • ${fixture.time}\n` +
                    `${status}`
                );
            })
                .filter(Boolean);

        embed.setDescription(
            lines.join("\n\n").slice(0, 4000)
        );

        return message.reply({
            embeds: [embed]
        });
    }

    /* =====================================================
       FİKSTÜR EKLE
       ===================================================== */

    if (command === "fiksturekle") {
        if (!isMatchStaff(message.member)) {
            return message.reply(
                "❌ Bu komutu sadece **Maç Yetkilisi** kullanabilir."
            );
        }

        const roles =
            [...message.mentions.roles.values()];

        if (roles.length < 2) {
            return message.reply(
                "❌ İki takım rolünü de etiketle.\nÖrnek: `.fiksturekle @Takım1 @Takım2 2026-09-05 20:30`"
            );
        }

        const date =
            args.find(
                x =>
                    /^\d{4}-\d{2}-\d{2}$/.test(
                        x
                    )
            );

        const time =
            args.find(
                x =>
                    /^\d{2}:\d{2}$/.test(
                        x
                    )
            );

        if (
            !date ||
            !time ||
            !isValidDate(date) ||
            !isValidTime(time)
        ) {
            return message.reply(
                "❌ Tarih/saat formatı yanlış.\nÖrnek: `.fiksturekle @Takım1 @Takım2 2026-09-05 20:30`"
            );
        }

        const timestamp =
            localDateTimeKey(
                date,
                time
            );

        if (
            timestamp <
            currentLocalDateTimeKey()
        ) {
            return message.reply(
                "❌ Geçmiş bir tarih veya saat seçemezsin."
            );
        }

        const team1 =
            data.teams[
                roles[0].id
            ];

        const team2 =
            data.teams[
                roles[1].id
            ];

        if (!team1 || !team2) {
            return message.reply(
                "❌ İki takımın da önce `.takımekle` ile lige eklenmesi gerekiyor."
            );
        }

        if (
            roles[0].id ===
            roles[1].id
        ) {
            return message.reply(
                "❌ Bir takım kendisiyle maç yapamaz."
            );
        }

        const duplicate =
            data.fixtures.find(
                fixture =>
                    fixture.team1 ===
                        roles[0].id &&
                    fixture.team2 ===
                        roles[1].id &&
                    fixture.date ===
                        date &&
                    fixture.time ===
                        time &&
                    fixture.status ===
                        "BEKLIYOR"
            );

        const reverseDuplicate =
            data.fixtures.find(
                fixture =>
                    fixture.team1 ===
                        roles[1].id &&
                    fixture.team2 ===
                        roles[0].id &&
                    fixture.date ===
                        date &&
                    fixture.time ===
                        time &&
                    fixture.status ===
                        "BEKLIYOR"
            );

        if (
            duplicate ||
            reverseDuplicate
        ) {
            return message.reply(
                "❌ Bu maç zaten aynı tarih ve saatte fikstürde bulunuyor."
            );
        }

        const fixture = {
            id:
                `${Date.now()}_${Math.random()
                    .toString(36)
                    .slice(2, 8)}`,
            team1: roles[0].id,
            team2: roles[1].id,
            date,
            time,
            status: "BEKLIYOR",
            score1: null,
            score2: null,
            startedAt: null,
            finishedAt: null
        };

        data.fixtures.push(
            fixture
        );

        saveData();

        return message.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle(
                        "📅 Fikstür Eklendi"
                    )
                    .setDescription(
                        `⚽ **${team1.name}** 🆚 **${team2.name}**\n\n` +
                        `📅 Tarih: **${date}**\n` +
                        `⏰ Saat: **${time}**\n` +
                        `🌍 Saat dilimi: **${TIME_ZONE}**\n\n` +
                        `Maç zamanı geldiğinde otomatik olarak başlatılacaktır.`
                    )
                    .setTimestamp()
            ]
        });
    }

    /* =====================================================
       FİKSTÜR ÇIKAR
       ===================================================== */

    if (
        command === "fiksturcikar" ||
        command === "fikstürçıkar" ||
        command === "fikstürcikar" ||
        command === "fiksturçıkar"
    ) {
        if (!isMatchStaff(message.member)) {
            return message.reply(
                "❌ Bu komutu sadece **Maç Yetkilisi** kullanabilir."
            );
        }

        const roles =
            [...message.mentions.roles.values()];

        if (roles.length < 2) {
            return message.reply(
                "❌ İki takım rolünü de etiketle.\nÖrnek: `.fiksturcikar @Takım1 @Takım2`"
            );
        }

        const team1 =
            data.teams[
                roles[0].id
            ];

        const team2 =
            data.teams[
                roles[1].id
            ];

        if (!team1 || !team2) {
            return message.reply(
                "❌ Takımlardan biri kayıtlı değil."
            );
        }

        const index =
            data.fixtures.findIndex(
                fixture =>
                    fixture.status ===
                        "BEKLIYOR" &&
                    (
                        (
                            fixture.team1 ===
                                roles[0].id &&
                            fixture.team2 ===
                                roles[1].id
                        ) ||
                        (
                            fixture.team1 ===
                                roles[1].id &&
                            fixture.team2 ===
                                roles[0].id
                        )
                    )
            );

        if (index === -1) {
            return message.reply(
                `❌ **${team1.name}** ile **${team2.name}** arasında bekleyen bir fikstür bulunamadı.`
            );
        }

        const removed =
            data.fixtures[index];

        data.fixtures.splice(
            index,
            1
        );

        saveData();

        return message.reply(
            `🗑️ Fikstür kaldırıldı.\n\n⚽ **${team1.name}** 🆚 **${team2.name}**\n📅 ${removed.date} • ${removed.time}`
        );
    }

    /* =====================================================
       MAÇ
       ===================================================== */

    if (command === "maç") {
        if (!isMatchStaff(message.member)) {
            return message.reply(
                "❌ Bu komutu sadece **Maç Yetkilisi** kullanabilir."
            );
        }

        if (
            message.channel.id !==
            CHANNELS.MAC
        ) {
            return message.reply(
                `❌ Bu komut sadece <#${CHANNELS.MAC}> kanalında kullanılabilir.`
            );
        }

        const roles =
            [...message.mentions.roles.values()];

        if (roles.length < 2) {
            return message.reply(
                "❌ İki takım rolünü etiketle."
            );
        }

        const team1 =
            data.teams[
                roles[0].id
            ];

        const team2 =
            data.teams[
                roles[1].id
            ];

        if (!team1 || !team2) {
            return message.reply(
                "❌ İki takımın da lige kayıtlı olması gerekiyor."
            );
        }

        if (
            roles[0].id ===
            roles[1].id
        ) {
            return message.reply(
                "❌ Bir takım kendisiyle maç yapamaz."
            );
        }

        if (
            data.activeMatches[
                team1.id
            ] ||
            data.activeMatches[
                team2.id
            ]
        ) {
            return message.reply(
                "❌ Takımlardan biri şu anda başka bir maçta."
            );
        }

        const lineup1 =
            getStartingEleven(
                team1,
                message.guild
            );

        const lineup2 =
            getStartingEleven(
                team2,
                message.guild
            );

        if (
            !lineup1.valid ||
            !lineup2.valid
        ) {
            if (
                !lineup1.valid &&
                !lineup2.valid
            ) {
                return message.reply(
                    `❌ İki takımın da geçerli ilk 11'i yok.\n\n${team1.name}: ${lineup1.reason}\n${team2.name}: ${lineup2.reason}`
                );
            }

            const winner =
                lineup1.valid
                    ? team1
                    : team2;

            const loser =
                lineup1.valid
                    ? team2
                    : team1;

            return message.reply(
                `🏁 **Hükmen sonuç:**\n\n🏆 ${winner.name} **3-0** ${loser.name}\n\n${loser.name}: ${lineup1.valid ? lineup2.reason : lineup1.reason}`
            );
        }

        const fixture = {
            id:
                `manual_${Date.now()}`,
            team1: team1.id,
            team2: team2.id,
            date:
                currentLocalDateTimeKey()
                    .split(" ")[0],
            time:
                currentLocalDateTimeKey()
                    .split(" ")[1],
            status: "BAŞLIYOR",
            score1: 0,
            score2: 0,
            startedAt:
                new Date().toISOString()
        };

        data.fixtures.push(
            fixture
        );

        saveData();

        await startMatch(
            message.guild,
            fixture
        );

        return;
    }

    /* =====================================================
       EMBED
       ===================================================== */

    if (command === "embed") {
        if (!isAdmin(message.member)) {
            return message.reply(
                "❌ Bu komutu sadece yönetici kullanabilir."
            );
        }

        const content =
            args.join(" ");

        const split =
            content.split("|");

        const title =
            split[0]?.trim();

        const description =
            split.slice(1)
                .join("|")
                .trim();

        if (!title || !description) {
            return message.reply(
                "❌ Kullanım: `.embed Başlık | Açıklama`"
            );
        }

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setTimestamp();

        return message.channel.send({
            embeds: [embed]
        });
    }

    /* =====================================================
       SİL
       ===================================================== */

    if (command === "sil") {
        if (!isAdmin(message.member)) {
            return message.reply(
                "❌ Bu komutu sadece yönetici kullanabilir."
            );
        }

        const amount =
            Number(args[0]);

        if (
            !Number.isInteger(amount) ||
            amount < 1 ||
            amount > 1000
        ) {
            return message.reply(
                "❌ 1 ile 1000 arasında bir miktar gir."
            );
        }

        try {
            const deleted =
                await message.channel.bulkDelete(
                    amount,
                    true
                );

            const info =
                await message.channel.send(
                    `🗑️ **${deleted.size}** mesaj silindi.`
                );

            setTimeout(() => {
                info.delete().catch(() => {});
            }, 3000);
        } catch {
            return message.reply(
                "❌ Mesajlar silinemedi. Discord'un 14 günden eski mesajları toplu silme kısıtlaması vardır."
            );
        }

        return;
    }

    /* =====================================================
       KICK
       ===================================================== */

    if (command === "kick") {
        if (!isAdmin(message.member)) {
            return message.reply(
                "❌ Bu komutu sadece yönetici kullanabilir."
            );
        }

        const target =
            message.mentions.members.first();

        if (!target) {
            return message.reply(
                "❌ Bir oyuncu etiketle."
            );
        }

        if (
            !target.kickable
        ) {
            return message.reply(
                "❌ Bu oyuncuyu atamıyorum. Rol sırasını kontrol et."
            );
        }

        try {
            await target.kick();

            return message.reply(
                `👢 ${target.user.tag} sunucudan atıldı.`
            );
        } catch {
            return message.reply(
                "❌ Oyuncu atılamadı."
            );
        }
    }

    /* =====================================================
       BAN
       ===================================================== */

    if (command === "ban") {
        if (!isAdmin(message.member)) {
            return message.reply(
                "❌ Bu komutu sadece yönetici kullanabilir."
            );
        }

        const target =
            message.mentions.members.first();

        if (!target) {
            return message.reply(
                "❌ Bir oyuncu etiketle."
            );
        }

        if (
            !target.bannable
        ) {
            return message.reply(
                "❌ Bu oyuncuyu banlayamıyorum."
            );
        }

        try {
            await target.ban({
                reason:
                    `Axera League • ${message.author.tag}`
            });

            return message.reply(
                `🔨 ${target.user.tag} sunucudan banlandı.`
            );
        } catch {
            return message.reply(
                "❌ Oyuncu banlanamadı."
            );
        }
    }

    /* =====================================================
       MUTE
       ===================================================== */

    if (command === "mute") {
        if (!isAdmin(message.member)) {
            return message.reply(
                "❌ Bu komutu sadece yönetici kullanabilir."
            );
        }

        const target =
            message.mentions.members.first();

        if (!target) {
            return message.reply(
                "❌ Bir oyuncu etiketle."
            );
        }

        try {
            await target.timeout(
                10 * 60 * 1000,
                `Axera League • ${message.author.tag}`
            );

            return message.reply(
                `🔇 ${target} **10 dakika** susturuldu.`
            );
        } catch {
            return message.reply(
                "❌ Oyuncu susturulamadı."
            );
        }
    }

    /* =====================================================
       UNMUTE
       ===================================================== */

    if (command === "unmute") {
        if (!isAdmin(message.member)) {
            return message.reply(
                "❌ Bu komutu sadece yönetici kullanabilir."
            );
        }

        const target =
            message.mentions.members.first();

        if (!target) {
            return message.reply(
                "❌ Bir oyuncu etiketle."
            );
        }

        try {
            await target.timeout(
                null,
                `Axera League • ${message.author.tag}`
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
});

/* =========================================================
   BUTONLAR
   ========================================================= */

client.on(
    "interactionCreate",
    async interaction => {
        if (
            !interaction.isButton() &&
            !interaction.isStringSelectMenu()
        ) {
            return;
        }

        /* =================================================
           KAYIT BUTONLARI
           ================================================= */

        if (
            interaction.isButton() &&
            interaction.customId.startsWith(
                "register_"
            )
        ) {
            if (
                !isRegistrationStaff(
                    interaction.member
                )
            ) {
                return interaction.reply({
                    content:
                        "❌ Bu paneli sadece Kayıt Yetkilisi kullanabilir.",
                    ephemeral: true
                });
            }

            const parts =
                interaction.customId.split(
                    "_"
                );

            const type =
                parts[1];

            const userId =
                parts[2];

            if (
                interaction.user.id !==
                userId &&
                !isRegistrationStaff(
                    interaction.member
                )
            ) {
                return interaction.reply({
                    content:
                        "❌ Bu buton senin için değil.",
                    ephemeral: true
                });
            }

            const target =
                interaction.guild.members.cache.get(
                    userId
                );

            if (!target) {
                return interaction.reply({
                    content:
                        "❌ Oyuncu bulunamadı.",
                    ephemeral: true
                });
            }

            let selectedRole;

            if (
                type ===
                "player"
            ) {
                selectedRole =
                    ROLES.FUTBOLCU;
            }

            if (
                type ===
                "goalkeeper"
            ) {
                selectedRole =
                    ROLES.KALECI;
            }

            if (
                type ===
                "manager"
            ) {
                selectedRole =
                    ROLES.TEKNIK_DIREKTOR;
            }

            if (!selectedRole) {
                return interaction.reply({
                    content:
                        "❌ Geçersiz kayıt seçimi.",
                    ephemeral: true
                });
            }

            try {
                await target.roles.remove([
                    ROLES.KAYITSIZ,
                    ROLES.FUTBOLCU,
                    ROLES.KALECI,
                    ROLES.TEKNIK_DIREKTOR
                ]);

                await target.roles.add(
                    selectedRole
                );

                const user =
                    getUserData(
                        target.id
                    );

                user.registered = true;
                user.role =
                    selectedRole;

                saveData();

                const disabledRow =
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(
                                "disabled_1"
                            )
                            .setLabel(
                                type ===
                                    "player"
                                    ? "⚽ Futbolcu ✓"
                                    : "⚽ Futbolcu"
                            )
                            .setStyle(
                                ButtonStyle.Primary
                            )
                            .setDisabled(true),

                        new ButtonBuilder()
                            .setCustomId(
                                "disabled_2"
                            )
                            .setLabel(
                                type ===
                                    "goalkeeper"
                                    ? "🧤 Kaleci ✓"
                                    : "🧤 Kaleci"
                            )
                            .setStyle(
                                ButtonStyle.Success
                            )
                            .setDisabled(true),

                        new ButtonBuilder()
                            .setCustomId(
                                "disabled_3"
                            )
                            .setLabel(
                                type ===
                                    "manager"
                                    ? "📋 Teknik Direktör ✓"
                                    : "📋 Teknik Direktör"
                            )
                            .setStyle(
                                ButtonStyle.Secondary
                            )
                            .setDisabled(true)
                    );

                await interaction.update({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                "✅ Kayıt Tamamlandı"
                            )
                            .setDescription(
                                `${target} başarıyla kayıt edildi.\n\nRol: <@&${selectedRole}>`
                            )
                            .setTimestamp()
                    ],
                    components: [
                        disabledRow
                    ]
                });

                const chat =
                    interaction.guild.channels.cache.get(
                        CHANNELS.SOHBET
                    );

                if (chat) {
                    await chat.send(
                        `🎉 ${target} **Axera League'e hoşgeldin!**\n📋 Kayıt işlemin başarıyla tamamlandı.`
                    );
                }
            } catch {
                if (!interaction.replied) {
                    await interaction.reply({
                        content:
                            "❌ Kayıt sırasında hata oluştu.",
                        ephemeral: true
                    });
                }
            }

            return;
        }

        /* =================================================
           FORMASYON MENÜSÜ
           ================================================= */

        if (
            interaction.isStringSelectMenu() &&
            interaction.customId.startsWith(
                "formation_"
            )
        ) {
            if (
                !isMatchStaff(
                    interaction.member
                )
            ) {
                return interaction.reply({
                    content:
                        "❌ Bu menüyü sadece Maç Yetkilisi kullanabilir.",
                    ephemeral: true
                });
            }

            const teamId =
                interaction.customId.replace(
                    "formation_",
                    ""
                );

            const formation =
                interaction.values[0];

            const team =
                data.teams[teamId];

            if (!team) {
                return interaction.reply({
                    content:
                        "❌ Takım bulunamadı.",
                    ephemeral: true
                });
            }

            team.formation =
                formation;

            saveData();

            return interaction.update({
                content:
                    `✅ **${team.name}** formasyonu **${formation}** olarak ayarlandı.`,
                components: []
            });
        }
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
   LOGIN
   ========================================================= */

client.login(TOKEN);
