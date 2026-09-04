const {
    Client,
    GatewayIntentBits,
    Partials,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    PermissionFlagsBits
} = require("discord.js");

const fs = require("fs");
const path = require("path");

/* =========================================================
   AXERA LEAGUE
   DISCORD.JS v14
   ========================================================= */

const TOKEN = process.env.TOKEN;

if (!TOKEN) {
    console.error("❌ TOKEN bulunamadı. Railway Variables kısmına TOKEN ekle.");
    process.exit(1);
}

/* =========================================================
   AYARLAR
   ========================================================= */

const TIME_ZONE = process.env.TIME_ZONE || "Europe/Istanbul";

const ROLES = {
    FUTBOLCU: "1534457228986421278",
    KALECI: "1534492034243498195",
    KAYITSIZ: "1534457560134844517",
    TEKNIK_DIREKTOR: "1534456648930693120",
    KAYIT_YETKILISI: "1534456315366342716",
    DEGER_YETKILISI: "1534456192913375382",
    MAC_YETKILISI: "1535251168169697390"
};

const CHANNELS = {
    KAYIT: "1534460177884123276",
    SOHBET: "1534469475917758586",
    ANTRENMAN: "1534474070798762197",
    PENALTI: "1534474327812997192",
    MAC: "1534477626872168541",
    PUAN: "1534475991404253284"
};

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
   DATA
   ========================================================= */

const DATA_FILE = path.join(__dirname, "data.json");

const DEFAULT_DATA = {
    users: {},
    registrations: {},
    teams: {},
    fixtures: [],
    activeMatches: {},
    standingsMessageId: null
};

function loadData() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            fs.writeFileSync(
                DATA_FILE,
                JSON.stringify(DEFAULT_DATA, null, 2)
            );
            return JSON.parse(JSON.stringify(DEFAULT_DATA));
        }

        const raw = fs.readFileSync(DATA_FILE, "utf8");
        const data = JSON.parse(raw);

        return {
            ...DEFAULT_DATA,
            ...data,
            users: data.users || {},
            registrations: data.registrations || {},
            teams: data.teams || {},
            fixtures: data.fixtures || [],
            activeMatches: data.activeMatches || {}
        };
    } catch (err) {
        console.error("data.json okunamadı:", err);

        return JSON.parse(JSON.stringify(DEFAULT_DATA));
    }
}

let data = loadData();

function saveData() {
    try {
        fs.writeFileSync(
            DATA_FILE,
            JSON.stringify(data, null, 2)
        );
    } catch (err) {
        console.error("data.json kaydedilemedi:", err);
    }
}

/* =========================================================
   CLIENT
   ========================================================= */

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [
        Partials.Channel,
        Partials.GuildMember,
        Partials.User,
        Partials.Message
    ]
});

/* =========================================================
   GENEL YARDIMCILAR
   ========================================================= */

function isAdmin(member) {
    return member.permissions.has(
        PermissionFlagsBits.Administrator
    );
}

function hasRole(member, roleId) {
    return member.roles.cache.has(roleId);
}

function isRegistrationStaff(member) {
    return hasRole(member, ROLES.KAYIT_YETKILISI) || isAdmin(member);
}

function isValueStaff(member) {
    return hasRole(member, ROLES.DEGER_YETKILISI);
}

function isMatchStaff(member) {
    return hasRole(member, ROLES.MAC_YETKILISI) || isAdmin(member);
}

function channelOnly(message, channelId) {
    return message.channel.id === channelId;
}

function ensureUser(userId) {
    if (!data.users[userId]) {
        data.users[userId] = {
            value: 0,
            training: 0
        };
    }

    if (
        typeof data.users[userId].value !== "number"
    ) {
        data.users[userId].value = 0;
    }

    if (
        typeof data.users[userId].training !== "number"
    ) {
        data.users[userId].training = 0;
    }

    return data.users[userId];
}

function getUserValue(userId) {
    return ensureUser(userId).value;
}

function setUserValue(userId, value) {
    const user = ensureUser(userId);

    user.value = Math.max(
        0,
        Math.round(Number(value) || 0)
    );

    saveData();
}

function addUserValue(userId, amount) {
    const current = getUserValue(userId);

    setUserValue(
        userId,
        current + Number(amount)
    );
}

function formatValue(value) {
    return `${Math.max(0, Math.round(Number(value) || 0))}M€`;
}

function parseValueFromNickname(nickname) {
    if (!nickname) return null;

    const match = nickname.match(/(\d+(?:[.,]\d+)?)M€\s*$/i);

    if (!match) return null;

    return Number(
        match[1]
            .replace(/\./g, "")
            .replace(",", ".")
    );
}

function getNicknameBase(nickname) {
    return nickname.replace(
        /\s*\d+(?:[.,]\d+)?M€\s*$/i,
        ""
    ).trim();
}

async function updatePlayerNickname(member, newValue) {
    if (!member.manageable) {
        throw new Error(
            "Bot bu kullanıcının takma adını değiştiremiyor. Bot rolünü oyuncunun rolünün üzerine taşı."
        );
    }

    const nickname = member.nickname || member.user.username;

    const current = parseValueFromNickname(nickname);

    if (current === null) {
        throw new Error(
            "Oyuncunun takma adı M€ ile bitmiyor."
        );
    }

    const base = getNicknameBase(nickname);

    const newNickname =
        `${base} | ${formatValue(newValue)}`;

    if (newNickname.length > 32) {
        throw new Error(
            `Yeni takma ad 32 karakteri geçiyor. (${newNickname.length}/32)`
        );
    }

    await member.setNickname(newNickname);

    return newNickname;
}

function cleanMention(text) {
    return text
        .replace(/[<@!>]/g, "")
        .trim();
}

function getMentionedMember(message, index = 0) {
    return message.mentions.members.at(index) || null;
}

function getMentionedRole(message, index = 0) {
    return message.mentions.roles.at(index) || null;
}

function normalizeText(text) {
    return String(text || "")
        .toLocaleLowerCase("tr-TR")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ğ/g, "g")
        .replace(/ü/g, "u")
        .replace(/ş/g, "s")
        .replace(/ı/g, "i")
        .replace(/ö/g, "o")
        .replace(/ç/g, "c")
        .replace(/[^a-z0-9]/g, "");
}

/* =========================================================
   LEVENSHTEIN / OYUNCU ARAMA
   ========================================================= */

function levenshtein(a, b) {
    a = normalizeText(a);
    b = normalizeText(b);

    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] =
                    matrix[i - 1][j - 1];
            } else {
                matrix[i][j] =
                    Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
            }
        }
    }

    return matrix[b.length][a.length];
}

function similarity(a, b) {
    const aa = normalizeText(a);
    const bb = normalizeText(b);

    if (!aa || !bb) return 0;

    if (aa === bb) return 1;

    if (
        aa.includes(bb) ||
        bb.includes(aa)
    ) {
        return 0.85;
    }

    const distance = levenshtein(aa, bb);

    return 1 -
        distance /
        Math.max(aa.length, bb.length);
}

function findClosestMember(guild, search) {
    let best = null;
    let bestScore = 0;

    for (const member of guild.members.cache.values()) {
        if (member.user.bot) continue;

        const nickname =
            member.nickname ||
            member.user.username;

        const score =
            similarity(search, nickname);

        if (score > bestScore) {
            bestScore = score;
            best = member;
        }
    }

    if (!best || bestScore < 0.45) {
        return null;
    }

    return {
        member: best,
        score: bestScore
    };
}

/* =========================================================
   TEAM SİSTEMİ
   ========================================================= */

function getTeamByRoleId(roleId) {
    if (!roleId) return null;

    if (!data.teams[roleId]) {
        return null;
    }

    return data.teams[roleId];
}

function createTeamData(role) {
    return {
        roleId: role.id,
        name: role.name,

        manualValue: 0,

        formation: null,

        squad: [],

        standing: {
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

function ensureTeam(role) {
    if (!data.teams[role.id]) {
        data.teams[role.id] =
            createTeamData(role);
    }

    const team = data.teams[role.id];

    team.name = role.name;

    if (!Array.isArray(team.squad)) {
        team.squad = [];
    }

    if (!team.standing) {
        team.standing = {
            O: 0,
            G: 0,
            B: 0,
            M: 0,
            AG: 0,
            YG: 0,
            AV: 0,
            P: 0
        };
    }

    if (typeof team.manualValue !== "number") {
        team.manualValue = 0;
    }

    return team;
}

function getPlayerCurrentValue(guild, userId) {
    const member = guild.members.cache.get(userId);

    if (member) {
        const nickname =
            member.nickname ||
            member.user.username;

        const parsed =
            parseValueFromNickname(nickname);

        if (parsed !== null) {
            return parsed;
        }
    }

    return getUserValue(userId);
}

function syncTeamValue(guild, team) {
    let squadValue = 0;

    for (const player of team.squad) {
        const current =
            getPlayerCurrentValue(
                guild,
                player.userId
            );

        player.value = current;
        squadValue += current;
    }

    team.value =
        Number(team.manualValue || 0) +
        squadValue;

    return team.value;
}

function syncAllTeams(guild) {
    for (const team of Object.values(data.teams)) {
        syncTeamValue(guild, team);
    }

    saveData();
}

function findPlayerInTeam(team, userId) {
    return team.squad.find(
        player =>
            player.userId === userId
    );
}

/* =========================================================
   FORMASYON
   ========================================================= */

function formationTotal(formation) {
    return Object.values(
        FORMATIONS[formation] || {}
    ).reduce(
        (sum, n) => sum + n,
        0
    );
}

function getStartingEleven(guild, team) {
    if (!team.formation) {
        return {
            ready: false,
            reason: "Takımın formasyonu ayarlanmamış."
        };
    }

    const required =
        FORMATIONS[team.formation];

    if (!required) {
        return {
            ready: false,
            reason: "Geçersiz formasyon."
        };
    }

    const selected = [];

    for (const [position, amount] of Object.entries(required)) {
        const players =
            team.squad.filter(
                p => p.position === position
            );

        if (players.length < amount) {
            return {
                ready: false,
                reason:
                    `${position} pozisyonunda ${amount} oyuncu gerekiyor, ${players.length} oyuncu var.`
            };
        }

        selected.push(
            ...players.slice(0, amount)
        );
    }

    if (selected.length !== 11) {
        return {
            ready: false,
            reason: "İlk 11 tam olarak 11 oyuncu değil."
        };
    }

    return {
        ready: true,
        players: selected
    };
}

function randomFrom(array) {
    if (!array.length) return null;

    return array[
        Math.floor(
            Math.random() * array.length
        )
    ];
}

/* =========================================================
   PUAN DURUMU
   ========================================================= */

function getSortedStandings() {
    return Object.values(data.teams).sort(
        (a, b) => {
            const ap = a.standing.P;
            const bp = b.standing.P;

            if (bp !== ap) {
                return bp - ap;
            }

            const aa = a.standing.AG - a.standing.YG;
            const ba = b.standing.AG - b.standing.YG;

            if (ba !== aa) {
                return ba - aa;
            }

            return (
                b.standing.AG -
                a.standing.AG
            );
        }
    );
}

function standingsText() {
    const teams =
        getSortedStandings();

    if (!teams.length) {
        return "Henüz puan durumuna eklenmiş takım yok.";
    }

    return teams
        .map((team, index) => {
            const s = team.standing;

            const av =
                s.AG - s.YG;

            s.AV = av;

            return [
                `**${index + 1}. ${team.name}**`,
                `O:${s.O} G:${s.G} B:${s.B} M:${s.M}`,
                `AG:${s.AG} YG:${s.YG} AV:${av}`,
                `**${s.P} P**`
            ].join(" • ");
        })
        .join("\n\n");
}

function createStandingsEmbed() {
    return new EmbedBuilder()
        .setTitle("🏆 AXERA LEAGUE • PUAN DURUMU")
        .setDescription(
            standingsText()
        )
        .setFooter({
            text: "Axera League • Resmî Puan Durumu"
        })
        .setTimestamp();
}

async function updateStandingsChannel(guild) {
    const channel =
        guild.channels.cache.get(
            CHANNELS.PUAN
        );

    if (!channel) return;

    const embed =
        createStandingsEmbed();

    try {
        if (data.standingsMessageId) {
            const oldMessage =
                await channel.messages
                    .fetch(data.standingsMessageId)
                    .catch(() => null);

            if (oldMessage) {
                await oldMessage.edit({
                    embeds: [embed]
                });

                return;
            }
        }

        const message =
            await channel.send({
                embeds: [embed]
            });

        data.standingsMessageId =
            message.id;

        saveData();
    } catch (err) {
        console.error(
            "Puan mesajı güncellenemedi:",
            err
        );
    }
}

/* =========================================================
   FİKSTÜR
   ========================================================= */

function createFixture(team1, team2, date, time) {
    return {
        id:
            `${Date.now()}_${Math.random()
                .toString(36)
                .slice(2, 8)}`,

        team1: team1.id,
        team2: team2.id,

        date,
        time,

        status: "BEKLIYOR",

        score1: null,
        score2: null,

        startedAt: null,
        finishedAt: null
    };
}

function localDateTimeKey(date, time) {
    const match =
        String(date).match(
            /^(\d{4})-(\d{2})-(\d{2})$/
        );

    const timeMatch =
        String(time).match(
            /^(\d{2}):(\d{2})$/
        );

    if (!match || !timeMatch) {
        return null;
    }

    const y = Number(match[1]);
    const mo = Number(match[2]);
    const d = Number(match[3]);
    const h = Number(timeMatch[1]);
    const mi = Number(timeMatch[2]);

    if (
        mo < 1 ||
        mo > 12 ||
        d < 1 ||
        d > 31 ||
        h < 0 ||
        h > 23 ||
        mi < 0 ||
        mi > 59
    ) {
        return null;
    }

    return Date.UTC(
        y,
        mo - 1,
        d,
        h,
        mi
    );
}

function getCurrentLocalKey() {
    const formatter =
        new Intl.DateTimeFormat(
            "en-CA",
            {
                timeZone: TIME_ZONE,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23"
            }
        );

    const parts =
        formatter.formatToParts(
            new Date()
        );

    const get = type =>
        parts.find(
            p => p.type === type
        )?.value;

    return Date.UTC(
        Number(get("year")),
        Number(get("month")) - 1,
        Number(get("day")),
        Number(get("hour")),
        Number(get("minute"))
    );
}

function fixtureDisplayDate(fixture) {
    return `${fixture.date} ${fixture.time}`;
}

function getFixtureTeam(fixture, side) {
    const roleId =
        side === 1
            ? fixture.team1
            : fixture.team2;

    return data.teams[roleId];
}

/* =========================================================
   MAÇ MOTORU
   ========================================================= */

function teamStrength(guild, team) {
    syncTeamValue(guild, team);

    const starting =
        getStartingEleven(
            guild,
            team
        );

    if (!starting.ready) {
        return 0;
    }

    const playerValue =
        starting.players.reduce(
            (sum, p) =>
                sum +
                getPlayerCurrentValue(
                    guild,
                    p.userId
                ),
            0
        );

    /*
      Takım değerinin etkisi bilerek düşük tutuluyor.
      Güçlü takım avantajlı olur ama otomatik kazanmaz.
    */

    return Math.max(
        1,
        Math.sqrt(
            playerValue + 1
        ) + 5
    );
}

function getGoalkeeper(players) {
    return players.find(
        p => p.position === "KL"
    );
}

function playerName(guild, player) {
    const member =
        guild.members.cache.get(
            player.userId
        );

    if (!member) {
        return player.username ||
            "Bilinmeyen Oyuncu";
    }

    return (
        member.nickname ||
        member.user.username
    );
}

function createMatchEmbed(match) {
    const team1 =
        data.teams[match.team1];

    const team2 =
        data.teams[match.team2];

    const status =
        match.finished
            ? "🏁 MAÇ BİTTİ"
            : "🔴 CANLI";

    const events =
        match.events
            .slice(-8)
            .reverse();

    const eventText =
        events.length
            ? events.join("\n")
            : "Henüz önemli bir pozisyon yaşanmadı.";

    return new EmbedBuilder()
        .setTitle(
            `${status} • ${team1.name} ${match.score1} - ${match.score2} ${team2.name}`
        )
        .setDescription(
            `⏱️ **${Math.min(
                90,
                match.minute
            )}'**\n\n${eventText}`
        )
        .addFields(
            {
                name: team1.name,
                value:
                    `⚽ ${match.score1}\n💰 ${formatValue(syncTeamValue(client.guilds.cache.first(), team1))}`,
                inline: true
            },
            {
                name: team2.name,
                value:
                    `⚽ ${match.score2}\n💰 ${formatValue(syncTeamValue(client.guilds.cache.first(), team2))}`,
                inline: true
            }
        )
        .setFooter({
            text:
                "Axera League • 3 gerçek saniye = 1 maç dakikası"
        })
        .setTimestamp();
}

function generateMatchEvent(guild, match) {
    const team1 =
        data.teams[match.team1];

    const team2 =
        data.teams[match.team2];

    const s1 =
        getStartingEleven(
            guild,
            team1
        ).players;

    const s2 =
        getStartingEleven(
            guild,
            team2
        ).players;

    const strength1 =
        teamStrength(guild, team1);

    const strength2 =
        teamStrength(guild, team2);

    const total =
        strength1 + strength2;

    let attackTeam;

    /*
      Takım değerinin etkisi küçük.
    */

    const chance1 =
        total > 0
            ? strength1 / total
            : 0.5;

    attackTeam =
        Math.random() < chance1
            ? 1
            : 2;

    const attackPlayers =
        attackTeam === 1
            ? s1
            : s2;

    const defendPlayers =
        attackTeam === 1
            ? s2
            : s1;

    const attackTeamData =
        attackTeam === 1
            ? team1
            : team2;

    const defendTeamData =
        attackTeam === 1
            ? team2
            : team1;

    const attackers =
        attackPlayers.filter(
            p =>
                p.position !== "KL"
        );

    const attacker =
        randomFrom(attackers);

    const goalkeeper =
        getGoalkeeper(
            defendPlayers
        );

    if (!attacker || !goalkeeper) {
        return null;
    }

    /*
      Her dakika gol oluşma ihtimali düşüktür.
    */

    const opportunity =
        Math.random() < 0.12;

    if (!opportunity) {
        if (Math.random() < 0.08) {
            return `⏱️ ${match.minute}' • ${attackTeamData.name} hücuma çıktı.`;
        }

        return null;
    }

    /*
      Kalite + rastgelelik.
      Güç farkı küçük avantaj sağlar.
    */

    const attackStrength =
        attackTeam === 1
            ? strength1
            : strength2;

    const defendStrength =
        attackTeam === 1
            ? strength2
            : strength1;

    let goalChance =
        0.24 +
        (attackStrength - defendStrength) /
            Math.max(
                100,
                total * 20
            );

    goalChance =
        Math.max(
            0.12,
            Math.min(
                0.34,
                goalChance
            )
        );

    if (Math.random() < goalChance) {
        if (attackTeam === 1) {
            match.score1++;
        } else {
            match.score2++;
        }

        const text =
            `⚽ **GOL!** ${match.minute}' • ${playerName(guild, attacker)} (${attackTeamData.name}) ağları buldu!`;

        match.goalScorers.push({
            minute: match.minute,
            player:
                playerName(
                    guild,
                    attacker
                ),
            team:
                attackTeamData.name
        });

        return text;
    }

    const roll =
        Math.random();

    if (roll < 0.45) {
        return (
            `🎯 ${match.minute}' • ${playerName(guild, attacker)} şutunu çekti! ` +
            `🧤 ${playerName(guild, goalkeeper)} kurtardı.`
        );
    }

    if (roll < 0.70) {
        return (
            `🥅 ${match.minute}' • ${playerName(guild, attacker)} vurdu! ` +
            `Top direkten döndü.`
        );
    }

    if (roll < 0.85) {
        return (
            `🚩 ${match.minute}' • ${attackTeamData.name} korner kazandı.`
        );
    }

    return (
        `🟨 ${match.minute}' • ${playerName(guild, attacker)} faul yaptı.`
    );
}

function applyMatchStandings(match) {
    const team1 =
        data.teams[match.team1];

    const team2 =
        data.teams[match.team2];

    if (!team1 || !team2) {
        return;
    }

    const s1 = team1.standing;
    const s2 = team2.standing;

    s1.O++;
    s2.O++;

    s1.AG += match.score1;
    s1.YG += match.score2;

    s2.AG += match.score2;
    s2.YG += match.score1;

    s1.AV =
        s1.AG - s1.YG;

    s2.AV =
        s2.AG - s2.YG;

    if (match.score1 > match.score2) {
        s1.G++;
        s2.M++;

        s1.P += 3;
    } else if (
        match.score1 < match.score2
    ) {
        s2.G++;
        s1.M++;

        s2.P += 3;
    } else {
        s1.B++;
        s2.B++;

        s1.P++;
        s2.P++;
    }

    saveData();
}

async function finishMatch(guild, match) {
    if (match.finished) return;

    match.finished = true;

    const team1 =
        data.teams[match.team1];

    const team2 =
        data.teams[match.team2];

    applyMatchStandings(match);

    match.minute = 90;

    const channel =
        guild.channels.cache.get(
            CHANNELS.MAC
        );

    const winner =
        match.score1 > match.score2
            ? team1.name
            : match.score2 > match.score1
                ? team2.name
                : "BERABERE";

    const scorers =
        match.goalScorers.length
            ? match.goalScorers
                .map(
                    g =>
                        `⚽ ${g.minute}' ${g.player} — ${g.team}`
                )
                .join("\n")
            : "Gol olmadı.";

    const embed =
        new EmbedBuilder()
            .setTitle(
                `🏁 MAÇ SONU • ${team1.name} ${match.score1} - ${match.score2} ${team2.name}`
            )
            .setDescription(
                `🏆 **Sonuç:** ${winner}\n\n` +
                `**Gol Krallığı / Gol Atanlar**\n${scorers}`
            )
            .addFields(
                {
                    name: team1.name,
                    value:
                        `⚽ ${match.score1}`,
                    inline: true
                },
                {
                    name: team2.name,
                    value:
                        `⚽ ${match.score2}`,
                    inline: true
                }
            )
            .setFooter({
                text:
                    "Axera League • Maç Sonucu"
            })
            .setTimestamp();

    if (channel) {
        await channel.send({
            embeds: [embed]
        }).catch(() => {});
    }

    if (match.fixtureId) {
        const fixture =
            data.fixtures.find(
                f =>
                    f.id ===
                    match.fixtureId
            );

        if (fixture) {
            fixture.status =
                "TAMAMLANDI";

            fixture.score1 =
                match.score1;

            fixture.score2 =
                match.score2;

            fixture.finishedAt =
                Date.now();
        }
    }

    delete data.activeMatches[
        match.team1
    ];

    delete data.activeMatches[
        match.team2
    ];

    saveData();

    await updateStandingsChannel(
        guild
    );
}

async function startMatch(
    guild,
    team1,
    team2,
    fixtureId = null
) {
    if (
        data.activeMatches[team1.roleId] ||
        data.activeMatches[team2.roleId]
    ) {
        return {
            ok: false,
            reason:
                "Takımlardan biri zaten maç yapıyor."
        };
    }

    const eleven1 =
        getStartingEleven(
            guild,
            team1
        );

    const eleven2 =
        getStartingEleven(
            guild,
            team2
        );

    /*
      İlk 11 hazır değilse:
      hazır olmayan takım hükmen kaybeder.
    */

    if (
        !eleven1.ready ||
        !eleven2.ready
    ) {
        let score1 = 0;
        let score2 = 0;

        if (
            !eleven1.ready &&
            !eleven2.ready
        ) {
            score1 = 0;
            score2 = 0;
        } else if (!eleven1.ready) {
            score1 = 0;
            score2 = 3;
        } else {
            score1 = 3;
            score2 = 0;
        }

        const fakeMatch = {
            team1: team1.roleId,
            team2: team2.roleId,
            score1,
            score2,
            fixtureId,
            goalScorers: [],
            events: [],
            minute: 90,
            finished: false
        };

        applyMatchStandings(
            fakeMatch
        );

        const channel =
            guild.channels.cache.get(
                CHANNELS.MAC
            );

        if (channel) {
            const reason =
                !eleven1.ready &&
                !eleven2.ready
                    ? "İki takımın da ilk 11'i hazır değildi."
                    : !eleven1.ready
                        ? `${team1.name} ilk 11'ini tamamlamadığı için hükmen mağlup oldu.`
                        : `${team2.name} ilk 11'ini tamamlamadığı için hükmen mağlup oldu.`;

            await channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(
                            `🏁 HÜKMEN SONUÇ • ${team1.name} ${score1} - ${score2} ${team2.name}`
                        )
                        .setDescription(
                            `📋 ${reason}`
                        )
                        .setFooter({
                            text:
                                "Axera League • Hükmen Sonuç"
                        })
                        .setTimestamp()
                ]
            }).catch(() => {});
        }

        if (fixtureId) {
            const fixture =
                data.fixtures.find(
                    f =>
                        f.id ===
                        fixtureId
                );

            if (fixture) {
                fixture.status =
                    "TAMAMLANDI";

                fixture.score1 =
                    score1;

                fixture.score2 =
                    score2;

                fixture.finishedAt =
                    Date.now();
            }
        }

        saveData();

        await updateStandingsChannel(
            guild
        );

        return {
            ok: true,
            forfeit: true
        };
    }

    const match = {
        id:
            `${Date.now()}_${Math.random()
                .toString(36)
                .slice(2, 8)}`,

        team1: team1.roleId,
        team2: team2.roleId,

        fixtureId,

        score1: 0,
        score2: 0,

        minute: 0,

        events: [],

        goalScorers: [],

        finished: false,

        messageId: null,

        interval: null
    };

    data.activeMatches[
        team1.roleId
    ] = match.id;

    data.activeMatches[
        team2.roleId
    ] = match.id;

    saveData();

    const channel =
        guild.channels.cache.get(
            CHANNELS.MAC
        );

    if (!channel) {
        delete data.activeMatches[
            team1.roleId
        ];

        delete data.activeMatches[
            team2.roleId
        ];

        saveData();

        return {
            ok: false,
            reason:
                "Maç kanalı bulunamadı."
        };
    }

    const firstEmbed =
        new EmbedBuilder()
            .setTitle(
                `🔴 CANLI MAÇ • ${team1.name} 0 - 0 ${team2.name}`
            )
            .setDescription(
                "⏱️ **0'**\n\nMaç başladı!"
            )
            .setFooter({
                text:
                    "Axera League • 3 gerçek saniye = 1 maç dakikası"
            })
            .setTimestamp();

    const liveMessage =
        await channel.send({
            embeds: [firstEmbed]
        });

    match.messageId =
        liveMessage.id;

    match.interval =
        setInterval(
            async () => {
                if (match.finished) {
                    clearInterval(
                        match.interval
                    );
                    return;
                }

                match.minute++;

                const event =
                    generateMatchEvent(
                        guild,
                        match
                    );

                if (event) {
                    match.events.push(
                        event
                    );

                    if (
                        match.events.length >
                        30
                    ) {
                        match.events.shift();
                    }
                }

                if (
                    match.minute >= 90
                ) {
                    clearInterval(
                        match.interval
                    );

                    await finishMatch(
                        guild,
                        match
                    );

                    return;
                }

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            `🔴 CANLI • ${team1.name} ${match.score1} - ${match.score2} ${team2.name}`
                        )
                        .setDescription(
                            `⏱️ **${match.minute}'**\n\n` +
                            (
                                match.events.length
                                    ? match.events
                                        .slice(-8)
                                        .reverse()
                                        .join("\n")
                                    : "Henüz önemli bir pozisyon yaşanmadı."
                            )
                        )
                        .addFields(
                            {
                                name:
                                    team1.name,
                                value:
                                    `⚽ ${match.score1}`,
                                inline: true
                            },
                            {
                                name:
                                    team2.name,
                                value:
                                    `⚽ ${match.score2}`,
                                inline: true
                            }
                        )
                        .setFooter({
                            text:
                                "Axera League • Canlı Maç"
                        })
                        .setTimestamp();

                await liveMessage.edit({
                    embeds: [embed]
                }).catch(() => {});

                saveData();
            },
            3000
        );

    return {
        ok: true,
        match
    };
}

/* =========================================================
   FİKSTÜR OTOMATİK BAŞLATMA
   ========================================================= */

async function checkFixtures() {
    const guilds =
        client.guilds.cache;

    const now =
        getCurrentLocalKey();

    for (const guild of guilds.values()) {
        for (const fixture of data.fixtures) {
            if (
                fixture.status !==
                "BEKLIYOR"
            ) {
                continue;
            }

            const start =
                localDateTimeKey(
                    fixture.date,
                    fixture.time
                );

            if (start === null) {
                continue;
            }

            if (now < start) {
                continue;
            }

            const team1 =
                data.teams[
                    fixture.team1
                ];

            const team2 =
                data.teams[
                    fixture.team2
                ];

            if (!team1 || !team2) {
                fixture.status =
                    "HATALI";

                saveData();
                continue;
            }

            /*
              Tekrar tekrar başlamaması için
              önce BAŞLIYOR olarak işaretliyoruz.
            */

            fixture.status =
                "BAŞLIYOR";

            fixture.startedAt =
                Date.now();

            saveData();

            const fixtureChannel =
                guild.channels.cache.get(
                    CHANNELS.KAYIT
                );

            const matchChannel =
                guild.channels.cache.get(
                    CHANNELS.MAC
                );

            if (fixtureChannel) {
                await fixtureChannel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                "⚽ AXERA LEAGUE • MAÇ ZAMANI"
                            )
                            .setDescription(
                                `🔴 ${team1.name} **vs** ${team2.name}\n\n` +
                                `⏰ ${fixtureDisplayDate(fixture)}\n\n` +
                                `Maç birazdan **Maç** kanalında başlayacak.`
                            )
                            .setTimestamp()
                    ]
                }).catch(() => {});
            }

            if (matchChannel) {
                await matchChannel.send({
                    content:
                        `@everyone 🔴 **MAÇ BAŞLIYOR!**\n${team1.name} vs ${team2.name}`
                }).catch(() => {});
            }

            const result =
                await startMatch(
                    guild,
                    team1,
                    team2,
                    fixture.id
                );

            if (!result.ok) {
                fixture.status =
                    "HATA";

                saveData();
            }
        }
    }
}

/* =========================================================
   HOŞ GELDİN
   ========================================================= */

client.on(
    "guildMemberAdd",
    async member => {
        const channel =
            member.guild.channels.cache.get(
                CHANNELS.KAYIT
            );

        if (!channel) return;

        const role =
            member.guild.roles.cache.get(
                ROLES.KAYIT_YETKILISI
            );

        await channel.send({
            content:
                `👋 ${member} hoşgeldin sunucumuza!\n` +
                `📋 ${role ? role : "@Kayıt Yetkilisi"} seninle ilgilenecektir.`
        }).catch(() => {});
    }
);

/* =========================================================
   MESAJ KOMUTLARI
   ========================================================= */

client.on(
    "messageCreate",
    async message => {
        try {
            if (
                message.author.bot ||
                !message.guild
            ) {
                return;
            }

            if (
                !message.content.startsWith(".")
            ) {
                return;
            }

            const args =
                message.content
                    .slice(1)
                    .trim()
                    .split(/\s+/);

            const command =
                args.shift()
                    ?.toLocaleLowerCase(
                        "tr-TR"
                    );

            if (!command) return;

            /* =================================================
               YARDIM
               ================================================= */

            if (
                command === "yardım" ||
                command === "yardim"
            ) {
                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            "📚 AXERA LEAGUE • KOMUTLAR"
                        )
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
                                "`.takımdeğer @Takım 850`",
                                "`.kadroekle @Takım @Oyuncu SNT`",
                                "`.kadrocikar @Takım @Oyuncu`",
                                "`.kadro @Takım`",
                                "`.formasyon @Takım`",
                                "",
                                "**🏆 Puan**",
                                "`.puan`",
                                "`.puanekle @Takım 3`",
                                "",
                                "**⚽ Maç**",
                                "`.maç @Takım1 @Takım2`",
                                "",
                                "**📅 Fikstür**",
                                "`.fiksturekle @Takım1 @Takım2 2026-09-05 20:30`",
                                "`.fikstur`",
                                "",
                                "**🛠️ Yönetim**",
                                "`.sil 10`",
                                "`.embed Başlık | Açıklama`",
                                "`.kick @Oyuncu`",
                                "`.ban @Oyuncu`",
                                "`.mute @Oyuncu`",
                                "`.unmute @Oyuncu`"
                            ].join("\n")
                        )
                        .setFooter({
                            text:
                                "Axera League • Yardım"
                        });

                return message.reply({
                    embeds: [embed]
                });
            }

            /* =================================================
               KAYIT
               ================================================= */

            if (
                command === "k"
            ) {
                if (
                    !isRegistrationStaff(
                        message.member
                    )
                ) {
                    return message.reply(
                        "❌ Bu komutu yalnızca **Kayıt Yetkilisi** kullanabilir."
                    );
                }

                if (
                    !channelOnly(
                        message,
                        CHANNELS.KAYIT
                    )
                ) {
                    return message.reply(
                        `❌ Bu komut <#${CHANNELS.KAYIT}> kanalında kullanılmalı.`
                    );
                }

                const target =
                    getMentionedMember(
                        message
                    );

                if (!target) {
                    return message.reply(
                        "❌ Kullanım: `.k @Oyuncu TakmaAdı`"
                    );
                }

                const nickname =
                    message.content
                        .replace(
                            /^\.k\s*<@!?\d+>\s*/i,
                            ""
                        )
                        .trim();

                if (!nickname) {
                    return message.reply(
                        "❌ Oyuncunun takma adını yazmalısın."
                    );
                }

                if (nickname.length > 32) {
                    return message.reply(
                        "❌ Discord takma adları en fazla 32 karakter olabilir."
                    );
                }

                try {
                    await target.setNickname(
                        nickname
                    );
                } catch (err) {
                    return message.reply(
                        "❌ Takma ad değiştirilemedi. Botun **Takma Adları Yönet** yetkisini ve rol sırasını kontrol et."
                    );
                }

                ensureUser(target.id);

                data.registrations[
                    target.id
                ] = {
                    nickname,
                    registeredBy:
                        message.author.id,
                    role: null,
                    createdAt:
                        Date.now()
                };

                saveData();

                const row =
                    new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(
                                    `register_futbolcu_${target.id}`
                                )
                                .setLabel(
                                    "⚽ Futbolcu"
                                )
                                .setStyle(
                                    ButtonStyle.Primary
                                ),

                            new ButtonBuilder()
                                .setCustomId(
                                    `register_kaleci_${target.id}`
                                )
                                .setLabel(
                                    "🧤 Kaleci"
                                )
                                .setStyle(
                                    ButtonStyle.Success
                                ),

                            new ButtonBuilder()
                                .setCustomId(
                                    `register_td_${target.id}`
                                )
                                .setLabel(
                                    "📋 Teknik Direktör"
                                )
                                .setStyle(
                                    ButtonStyle.Secondary
                                )
                        );

                return message.reply({
                    content:
                        `📋 ${target} için kayıt paneli oluşturuldu.\n\n` +
                        `**Kayıt yetkilisi uygun rolü seçsin.**`,
                    components: [row]
                });
            }

            /* =================================================
               KAYITSIZ VER
               ================================================= */

            if (
                command === "kayıtsızver" ||
                command === "kayitsizver"
            ) {
                if (
                    !isRegistrationStaff(
                        message.member
                    )
                ) {
                    return message.reply(
                        "❌ Bu komutu yalnızca Kayıt Yetkilisi kullanabilir."
                    );
                }

                const target =
                    getMentionedMember(
                        message
                    );

                if (!target) {
                    return message.reply(
                        "❌ Kullanım: `.kayıtsızver @Oyuncu`"
                    );
                }

                for (
                    const roleId of [
                        ROLES.FUTBOLCU,
                        ROLES.KALECI,
                        ROLES.TEKNIK_DIREKTOR
                    ]
                ) {
                    if (
                        target.roles.cache.has(
                            roleId
                        )
                    ) {
                        await target.roles.remove(
                            roleId
                        ).catch(() => {});
                    }
                }

                const kayitsiz =
                    message.guild.roles.cache.get(
                        ROLES.KAYITSIZ
                    );

                if (kayitsiz) {
                    await target.roles.add(
                        kayitsiz
                    ).catch(() => {});
                }

                return message.reply(
                    `✅ ${target} tekrar **Kayıtsız** yapıldı.`
                );
            }

            /* =================================================
               ANTRENMAN
               ================================================= */

            if (
                command === "ant" ||
                command === "antrenman"
            ) {
                if (
                    !channelOnly(
                        message,
                        CHANNELS.ANTRENMAN
                    )
                ) {
                    return message.reply(
                        `❌ Bu komut <#${CHANNELS.ANTRENMAN}> kanalında kullanılmalı.`
                    );
                }

                const user =
                    ensureUser(
                        message.author.id
                    );

                user.training++;

                if (
                    user.training < 5
                ) {
                    saveData();

                    return message.reply(
                        `🏋️ Antrenman tamamlandı!\n\n📊 İlerleme: **${user.training}/5**`
                    );
                }

                const member =
                    message.member;

                const currentNickname =
                    member.nickname ||
                    member.user.username;

                const currentValue =
                    parseValueFromNickname(
                        currentNickname
                    );

                if (
                    currentValue === null
                ) {
                    user.training = 4;
                    saveData();

                    return message.reply(
                        "❌ Takma adında M€ değeri bulunmadığı için ödül verilemedi. Değer düzeltildikten sonra tekrar antrenman yap."
                    );
                }

                const newValue =
                    currentValue + 5;

                try {
                    await updatePlayerNickname(
                        member,
                        newValue
                    );
                } catch (err) {
                    user.training = 4;
                    saveData();

                    return message.reply(
                        `❌ Ödül verilemedi: ${err.message}`
                    );
                }

                user.value =
                    newValue;

                user.training = 0;

                saveData();

                syncAllTeams(
                    message.guild
                );

                return message.reply(
                    `🏆 **ANTRENMAN TAMAMLANDI!**\n\n` +
                    `📊 İlerleme: **5/5**\n` +
                    `💰 Ödül: **+5M€**\n` +
                    `💵 Yeni değer: **${formatValue(newValue)}**`
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
                if (
                    !channelOnly(
                        message,
                        CHANNELS.PENALTI
                    )
                ) {
                    return message.reply(
                        `❌ Bu komut <#${CHANNELS.PENALTI}> kanalında kullanılmalı.`
                    );
                }

                const result =
                    Math.floor(
                        Math.random() * 3
                    );

                if (result === 0) {
                    const member =
                        message.member;

                    const currentNickname =
                        member.nickname ||
                        member.user.username;

                    const currentValue =
                        parseValueFromNickname(
                            currentNickname
                        );

                    if (
                        currentValue === null
                    ) {
                        return message.reply(
                            "❌ Takma adında M€ değeri bulunmuyor."
                        );
                    }

                    const newValue =
                        currentValue + 5;

                    try {
                        await updatePlayerNickname(
                            member,
                            newValue
                        );
                    } catch (err) {
                        return message.reply(
                            `❌ Değer artırılamadı: ${err.message}`
                        );
                    }

                    setUserValue(
                        member.id,
                        newValue
                    );

                    syncAllTeams(
                        message.guild
                    );

                    return message.reply(
                        `⚽ **GOL!**\n\n` +
                        `🧤 Axera Kalecisi mağlup oldu.\n` +
                        `💰 **+5M€**\n` +
                        `💵 Yeni değer: **${formatValue(newValue)}**`
                    );
                }

                if (result === 1) {
                    return message.reply(
                        `🥅 **DİREK!**\n\nTop direkten döndü.\n💰 Ödül: **0M€**`
                    );
                }

                return message.reply(
                    `🧤 **KURTARDI!**\n\nAxera Kalecisi penaltıyı kurtardı.\n💰 Ödül: **0M€**`
                );
            }

            /* =================================================
               DEĞER VER
               ================================================= */

            if (
                command === "dver"
            ) {
                if (
                    !isValueStaff(
                        message.member
                    )
                ) {
                    return message.reply(
                        "❌ Bu komutu yalnızca **Değer Yetkilisi** kullanabilir."
                    );
                }

                const target =
                    getMentionedMember(
                        message
                    );

                const amount =
                    Number(
                        args[
                            target
                                ? 1
                                : 0
                        ]
                    );

                if (
                    !target ||
                    !Number.isFinite(amount) ||
                    amount <= 0 ||
                    !Number.isInteger(amount)
                ) {
                    return message.reply(
                        "❌ Kullanım: `.dver @Oyuncu 5`"
                    );
                }

                const nickname =
                    target.nickname ||
                    target.user.username;

                const current =
                    parseValueFromNickname(
                        nickname
                    );

                if (current === null) {
                    return message.reply(
                        "❌ Oyuncunun takma adı M€ ile bitmiyor."
                    );
                }

                const newValue =
                    current + amount;

                try {
                    const newNickname =
                        await updatePlayerNickname(
                            target,
                            newValue
                        );

                    setUserValue(
                        target.id,
                        newValue
                    );

                    syncAllTeams(
                        message.guild
                    );

                    return message.reply(
                        `✅ ${target} değerine **+${amount}M€** eklendi.\n\n` +
                        `💰 Yeni değer: **${formatValue(newValue)}**\n` +
                        `🏷️ ${newNickname}`
                    );
                } catch (err) {
                    return message.reply(
                        `❌ ${err.message}`
                    );
                }
            }

            /* =================================================
               DEĞER SİL
               ================================================= */

            if (
                command === "dsil"
            ) {
                if (
                    !isValueStaff(
                        message.member
                    )
                ) {
                    return message.reply(
                        "❌ Bu komutu yalnızca **Değer Yetkilisi** kullanabilir."
                    );
                }

                const target =
                    getMentionedMember(
                        message
                    );

                const amount =
                    Number(
                        args[
                            target
                                ? 1
                                : 0
                        ]
                    );

                if (
                    !target ||
                    !Number.isFinite(amount) ||
                    amount <= 0 ||
                    !Number.isInteger(amount)
                ) {
                    return message.reply(
                        "❌ Kullanım: `.dsil @Oyuncu 5`"
                    );
                }

                const nickname =
                    target.nickname ||
                    target.user.username;

                const current =
                    parseValueFromNickname(
                        nickname
                    );

                if (current === null) {
                    return message.reply(
                        "❌ Oyuncunun takma adı M€ ile bitmiyor."
                    );
                }

                const newValue =
                    Math.max(
                        0,
                        current - amount
                    );

                try {
                    const newNickname =
                        await updatePlayerNickname(
                            target,
                            newValue
                        );

                    setUserValue(
                        target.id,
                        newValue
                    );

                    syncAllTeams(
                        message.guild
                    );

                    return message.reply(
                        `✅ ${target} değerinden **${amount}M€** çıkarıldı.\n\n` +
                        `💰 Yeni değer: **${formatValue(newValue)}**\n` +
                        `🏷️ ${newNickname}`
                    );
                } catch (err) {
                    return message.reply(
                        `❌ ${err.message}`
                    );
                }
            }

            /* =================================================
               TWEET
               ================================================= */

            if (
                command === "tweet"
            ) {
                const text =
                    args.join(" ");

                if (!text) {
                    return message.reply(
                        "❌ Kullanım: `.tweet Mesaj`"
                    );
                }

                const embed =
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
                            text
                        )
                        .setFooter({
                            text:
                                "Axera League • Tweet"
                        })
                        .setTimestamp();

                return message.channel.send({
                    embeds: [embed]
                });
            }

            /* =================================================
               ARA
               ================================================= */

            if (
                command === "ara"
            ) {
                const search =
                    args.join(" ");

                if (!search) {
                    return message.reply(
                        "❌ Kullanım: `.ara W.Sneijder`"
                    );
                }

                const result =
                    findClosestMember(
                        message.guild,
                        search
                    );

                if (!result) {
                    const embed =
                        new EmbedBuilder()
                            .setTitle(
                                "🔎 Oyuncu Arama"
                            )
                            .setDescription(
                                `⚪ **BOŞ**\n\n\`${search}\` için uygun oyuncu bulunamadı.`
                            );

                    return message.reply({
                        embeds: [embed]
                    });
                }

                const member =
                    result.member;

                const nickname =
                    member.nickname ||
                    member.user.username;

                const value =
                    parseValueFromNickname(
                        nickname
                    );

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            "🔎 Oyuncu Arama"
                        )
                        .addFields(
                            {
                                name:
                                    "Aranan",
                                value:
                                    `\`${search}\``,
                                inline: true
                            },
                            {
                                name:
                                    "Oyuncu",
                                value:
                                    `${member}`,
                                inline: true
                            },
                            {
                                name:
                                    "Takma Ad",
                                value:
                                    `\`${nickname}\``,
                                inline: false
                            },
                            {
                                name:
                                    "Değer",
                                value:
                                    value !== null
                                        ? formatValue(
                                            value
                                        )
                                        : "Belirlenemedi",
                                inline: true
                            },
                            {
                                name:
                                    "Durum",
                                value:
                                    "🟢 **DOLU**",
                                inline: true
                            }
                        )
                        .setThumbnail(
                            member.displayAvatarURL()
                        );

                return message.reply({
                    embeds: [embed]
                });
            }

            /* =================================================
               TAKIM EKLE
               ================================================= */

            if (
                command === "takımekle" ||
                command === "takimekle"
            ) {
                if (
                    !isMatchStaff(
                        message.member
                    )
                ) {
                    return message.reply(
                        "❌ Bu komutu yalnızca **Maç Yetkilisi** kullanabilir."
                    );
                }

                const role =
                    getMentionedRole(
                        message
                    );

                if (!role) {
                    return message.reply(
                        "❌ Kullanım: `.takımekle @Takım`"
                    );
                }

                if (
                    data.teams[role.id]
                ) {
                    return message.reply(
                        "❌ Bu takım zaten puan durumunda."
                    );
                }

                ensureTeam(role);

                saveData();

                await updateStandingsChannel(
                    message.guild
                );

                return message.reply(
                    `✅ ${role} puan durumuna eklendi.`
                );
            }

            /* =================================================
               TAKIM DEĞERİ
               ================================================= */

            if (
                command === "takımdeğer" ||
                command === "takimdeger"
            ) {
                if (
                    !isMatchStaff(
                        message.member
                    )
                ) {
                    return message.reply(
                        "❌ Bu komutu yalnızca **Maç Yetkilisi** kullanabilir."
                    );
                }

                const role =
                    getMentionedRole(
                        message
                    );

                const amount =
                    Number(
                        args[
                            role ? 1 : 0
                        ]
                    );

                if (
                    !role ||
                    !Number.isFinite(amount) ||
                    amount < 0
                ) {
                    return message.reply(
                        "❌ Kullanım: `.takımdeğer @Takım 850`"
                    );
                }

                const team =
                    ensureTeam(role);

                team.manualValue =
                    amount;

                syncTeamValue(
                    message.guild,
                    team
                );

                saveData();

                return message.reply(
                    `✅ ${role} takımının temel değeri **${formatValue(amount)}** olarak ayarlandı.\n\n` +
                    `🏟️ Güncel takım değeri: **${formatValue(team.value)}**`
                );
            }

            /* =================================================
               KADRO EKLE
               ================================================= */

            if (
                command === "kadroekle"
            ) {
                if (
                    !isMatchStaff(
                        message.member
                    )
                ) {
                    return message.reply(
                        "❌ Bu komutu yalnızca **Maç Yetkilisi** kullanabilir."
                    );
                }

                const teamRole =
                    getMentionedRole(
                        message,
                        0
                    );

                const player =
                    getMentionedMember(
                        message,
                        0
                    );

                /*
                  Discord mentions aynı koleksiyonlarda
                  farklı sırada olabilir. Takım role,
                  oyuncu member olarak ayrıca aranıyor.
                */

                const mentionedRole =
                    message.mentions.roles.first();

                const mentionedMember =
                    message.mentions.members.first();

                if (
                    !mentionedRole ||
                    !mentionedMember
                ) {
                    return message.reply(
                        "❌ Kullanım: `.kadroekle @Takım @Oyuncu SNT`"
                    );
                }

                const position =
                    args
                        .filter(
                            x =>
                                !x.startsWith("<@") &&
                                !x.startsWith("<@&")
                        )
                        .at(-1)
                        ?.toUpperCase();

                if (
                    !POSITIONS.includes(
                        position
                    )
                ) {
                    return message.reply(
                        `❌ Geçersiz pozisyon.\n\nPozisyonlar: ${POSITIONS.join(", ")}`
                    );
                }

                const team =
                    ensureTeam(
                        mentionedRole
                    );

                if (
                    findPlayerInTeam(
                        team,
                        mentionedMember.id
                    )
                ) {
                    return message.reply(
                        "❌ Bu oyuncu zaten bu takımda."
                    );
                }

                /*
                  Aynı oyuncunun başka takımda olup
                  olmadığını kontrol et.
                */

                for (
                    const otherTeam of Object.values(
                        data.teams
                    )
                ) {
                    if (
                        otherTeam.roleId ===
                        team.roleId
                    ) {
                        continue;
                    }

                    if (
                        findPlayerInTeam(
                            otherTeam,
                            mentionedMember.id
                        )
                    ) {
                        return message.reply(
                            `❌ Bu oyuncu zaten **${otherTeam.name}** kadrosunda.`
                        );
                    }
                }

                const currentValue =
                    getPlayerCurrentValue(
                        message.guild,
                        mentionedMember.id
                    );

                team.squad.push({
                    userId:
                        mentionedMember.id,

                    username:
                        mentionedMember.user
                            .username,

                    position,

                    value:
                        currentValue,

                    addedAt:
                        Date.now()
                });

                syncTeamValue(
                    message.guild,
                    team
                );

                saveData();

                return message.reply(
                    `✅ ${mentionedMember} **${team.name}** kadrosuna eklendi.\n\n` +
                    `📍 Pozisyon: **${position}**\n` +
                    `💰 Oyuncu değeri: **${formatValue(currentValue)}**\n` +
                    `🏟️ Güncel takım değeri: **${formatValue(team.value)}**`
                );
            }

            /* =================================================
               KADRO ÇIKAR
               ================================================= */

            if (
                command === "kadrocikar" ||
                command === "kadroçıkar" ||
                command === "kadroçikar"
            ) {
                if (
                    !isMatchStaff(
                        message.member
                    )
                ) {
                    return message.reply(
                        "❌ Bu komutu yalnızca **Maç Yetkilisi** kullanabilir."
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
                    data.teams[
                        teamRole.id
                    ];

                if (!team) {
                    return message.reply(
                        "❌ Bu takım sistemde bulunmuyor."
                    );
                }

                const index =
                    team.squad.findIndex(
                        p =>
                            p.userId ===
                            player.id
                    );

                if (index === -1) {
                    return message.reply(
                        "❌ Bu oyuncu takımda bulunmuyor."
                    );
                }

                team.squad.splice(
                    index,
                    1
                );

                syncTeamValue(
                    message.guild,
                    team
                );

                saveData();

                return message.reply(
                    `✅ ${player} **${team.name}** kadrosundan çıkarıldı.\n\n` +
                    `🏟️ Güncel takım değeri: **${formatValue(team.value)}**`
                );
            }

            /* =================================================
               KADRO
               ================================================= */

            if (
                command === "kadro"
            ) {
                const teamRole =
                    message.mentions.roles.first();

                if (!teamRole) {
                    return message.reply(
                        "❌ Kullanım: `.kadro @Takım`"
                    );
                }

                const team =
                    data.teams[
                        teamRole.id
                    ];

                if (!team) {
                    return message.reply(
                        "❌ Bu takım sistemde bulunmuyor."
                    );
                }

                syncTeamValue(
                    message.guild,
                    team
                );

                const lines = [];

                for (
                    const position of POSITIONS
                ) {
                    const players =
                        team.squad.filter(
                            p =>
                                p.position ===
                                position
                        );

                    if (!players.length) {
                        continue;
                    }

                    lines.push(
                        `**${position}**`
                    );

                    for (
                        const player of players
                    ) {
                        lines.push(
                            `> ${playerName(
                                message.guild,
                                player
                            )} • ${formatValue(
                                getPlayerCurrentValue(
                                    message.guild,
                                    player.userId
                                )
                            )}`
                        );
                    }

                    lines.push("");
                }

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            `🏟️ ${team.name} • KADRO`
                        )
                        .setDescription(
                            lines.length
                                ? lines.join("\n")
                                : "Kadro boş."
                        )
                        .addFields(
                            {
                                name:
                                    "📐 Formasyon",
                                value:
                                    team.formation ||
                                    "Ayarlanmadı",
                                inline: true
                            },
                            {
                                name:
                                    "👥 Oyuncu",
                                value:
                                    `${team.squad.length}`,
                                inline: true
                            },
                            {
                                name:
                                    "💰 Takım Değeri",
                                value:
                                    formatValue(
                                        team.value || 0
                                    ),
                                inline: true
                            }
                        )
                        .setFooter({
                            text:
                                "Axera League • Kadro"
                        })
                        .setTimestamp();

                return message.reply({
                    embeds: [embed]
                });
            }

            /* =================================================
               FORMASYON
               ================================================= */

            if (
                command === "formasyon"
            ) {
                if (
                    !isMatchStaff(
                        message.member
                    )
                ) {
                    return message.reply(
                        "❌ Bu komutu yalnızca **Maç Yetkilisi** kullanabilir."
                    );
                }

                const teamRole =
                    message.mentions.roles.first();

                if (!teamRole) {
                    return message.reply(
                        "❌ Kullanım: `.formasyon @Takım`"
                    );
                }

                if (
                    !data.teams[
                        teamRole.id
                    ]
                ) {
                    return message.reply(
                        "❌ Önce `.takımekle @Takım` kullan."
                    );
                }

                const options =
                    Object.keys(
                        FORMATIONS
                    ).map(
                        formation => ({
                            label:
                                formation,
                            value:
                                formation,
                            description:
                                `${formationTotal(
                                    formation
                                )} oyunculu ilk 11`
                        })
                    );

                const menu =
                    new StringSelectMenuBuilder()
                        .setCustomId(
                            `formation_${teamRole.id}`
                        )
                        .setPlaceholder(
                            "Formasyon seç..."
                        )
                        .addOptions(
                            options
                        );

                const row =
                    new ActionRowBuilder()
                        .addComponents(
                            menu
                        );

                return message.reply({
                    content:
                        `⚙️ **${teamRole.name}** için formasyon seç:`,
                    components: [row]
                });
            }

            /* =================================================
               PUAN
               ================================================= */

            if (
                command === "puan"
            ) {
                syncAllTeams(
                    message.guild
                );

                return message.reply({
                    embeds: [
                        createStandingsEmbed()
                    ]
                });
            }

            /* =================================================
               PUAN EKLE
               ================================================= */

            if (
                command === "puanekle"
            ) {
                if (
                    !isMatchStaff(
                        message.member
                    )
                ) {
                    return message.reply(
                        "❌ Bu komutu yalnızca **Maç Yetkilisi** kullanabilir."
                    );
                }

                const role =
                    message.mentions.roles.first();

                const amount =
                    Number(
                        args[
                            role ? 1 : 0
                        ]
                    );

                if (
                    !role ||
                    !Number.isInteger(
                        amount
                    )
                ) {
                    return message.reply(
                        "❌ Kullanım: `.puanekle @Takım 3`"
                    );
                }

                const team =
                    data.teams[
                        role.id
                    ];

                if (!team) {
                    return message.reply(
                        "❌ Bu takım puan durumunda bulunmuyor."
                    );
                }

                team.standing.P +=
                    amount;

                team.standing.P =
                    Math.max(
                        0,
                        team.standing.P
                    );

                saveData();

                await updateStandingsChannel(
                    message.guild
                );

                return message.reply(
                    `✅ ${role} puanına **${amount}** eklendi.\n🏆 Yeni puan: **${team.standing.P}**`
                );
            }

            /* =================================================
               MAÇ
               ================================================= */

            if (
                command === "maç" ||
                command === "mac"
            ) {
                if (
                    !isMatchStaff(
                        message.member
                    )
                ) {
                    return message.reply(
                        "❌ Bu komutu yalnızca **Maç Yetkilisi** kullanabilir."
                    );
                }

                const roles =
                    [...message.mentions.roles.values()];

                if (
                    roles.length < 2
                ) {
                    return message.reply(
                        "❌ Kullanım: `.maç @Takım1 @Takım2`"
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

                if (
                    !team1 ||
                    !team2
                ) {
                    return message.reply(
                        "❌ Takımlardan biri puan durumunda bulunmuyor."
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
                        `❌ ${result.reason}`
                    );
                }

                if (
                    !result.forfeit
                ) {
                    return message.reply(
                        `🔴 **MAÇ BAŞLADI!**\n${team1.name} vs ${team2.name}\n\n📺 Maç <#${CHANNELS.MAC}> kanalında canlı oynanıyor.`
                    );
                }

                return;
            }

            /* =================================================
               FİKSTÜREKLE
               ================================================= */

            if (
                command === "fiksturekle"
            ) {
                if (
                    !isMatchStaff(
                        message.member
                    )
                ) {
                    return message.reply(
                        "❌ Bu komutu yalnızca **Maç Yetkilisi** kullanabilir."
                    );
                }

                const roles =
                    [...message.mentions.roles.values()];

                if (
                    roles.length < 2
                ) {
                    return message.reply(
                        "❌ Kullanım:\n`.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`"
                    );
                }

                /*
                  Mentionlardan sonraki tarih ve saat
                  args içinde bulunur.
                */

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
                    !time
                ) {
                    return message.reply(
                        "❌ Tarih/saat hatalı.\n\nDoğru kullanım:\n`.fiksturekle @Takım1 @Takım2 2026-09-05 20:30`"
                    );
                }

                const timestamp =
                    localDateTimeKey(
                        date,
                        time
                    );

                if (
                    timestamp === null
                ) {
                    return message.reply(
                        "❌ Geçersiz tarih veya saat."
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

                if (
                    !team1 ||
                    !team2
                ) {
                    return message.reply(
                        "❌ Önce iki takımı da `.takımekle @Takım` ile puan durumuna eklemelisin."
                    );
                }

                if (
                    team1.roleId ===
                    team2.roleId
                ) {
                    return message.reply(
                        "❌ Bir takım kendisiyle maç yapamaz."
                    );
                }

                /*
                  Aynı iki takım için aynı saatte
                  ikinci fikstür oluşturulmasını engelle.
                */

                const duplicate =
                    data.fixtures.find(
                        f =>
                            f.status !==
                                "TAMAMLANDI" &&
                            f.team1 ===
                                team1.roleId &&
                            f.team2 ===
                                team2.roleId &&
                            f.date ===
                                date &&
                            f.time ===
                                time
                    );

                const reverseDuplicate =
                    data.fixtures.find(
                        f =>
                            f.status !==
                                "TAMAMLANDI" &&
                            f.team1 ===
                                team2.roleId &&
                            f.team2 ===
                                team1.roleId &&
                            f.date ===
                                date &&
                            f.time ===
                                time
                    );

                if (
                    duplicate ||
                    reverseDuplicate
                ) {
                    return message.reply(
                        "❌ Bu maç zaten aynı tarih ve saatte fikstüre eklenmiş."
                    );
                }

                const fixture =
                    createFixture(
                        team1,
                        team2,
                        date,
                        time
                    );

                data.fixtures.push(
                    fixture
                );

                saveData();

                /*
                  Buradaki mesaj fikstüre ekleme
                  işleminin gerçekten tamamlandığını
                  gösterir.
                */

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            "📅 FİKSTÜRE MAÇ EKLENDİ"
                        )
                        .setDescription(
                            `🏟️ **${team1.name}** vs **${team2.name}**\n\n` +
                            `📅 **${date}**\n` +
                            `⏰ **${time}**\n` +
                            `🌍 Saat dilimi: **${TIME_ZONE}**\n\n` +
                            `🔴 Maç zamanı geldiğinde otomatik olarak <#${CHANNELS.MAC}> kanalında başlayacak.`
                        )
                        .setFooter({
                            text:
                                `Axera League • Fikstür ID: ${fixture.id}`
                        })
                        .setTimestamp();

                return message.reply({
                    embeds: [embed]
                });
            }

            /* =================================================
               FİKSTÜR
               ================================================= */

            if (
                command === "fikstur" ||
                command === "fikstür"
            ) {
                const fixtures =
                    [...data.fixtures]
                        .sort(
                            (a, b) =>
                                (
                                    localDateTimeKey(
                                        a.date,
                                        a.time
                                    ) || 0
                                ) -
                                (
                                    localDateTimeKey(
                                        b.date,
                                        b.time
                                    ) || 0
                                )
                        );

                if (
                    !fixtures.length
                ) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle(
                                    "📅 AXERA LEAGUE • FİKSTÜR"
                                )
                                .setDescription(
                                    "Henüz fikstür bulunmuyor."
                                )
                        ]
                    });
                }

                const lines =
                    fixtures.map(
                        fixture => {
                            const team1 =
                                data.teams[
                                    fixture.team1
                                ];

                            const team2 =
                                data.teams[
                                    fixture.team2
                                ];

                            if (
                                !team1 ||
                                !team2
                            ) {
                                return null;
                            }

                            let result =
                                "⏳ BEKLİYOR";

                            if (
                                fixture.status ===
                                "TAMAMLANDI"
                            ) {
                                result =
                                    `🏁 ${fixture.score1} - ${fixture.score2}`;
                            } else if (
                                fixture.status ===
                                "BAŞLIYOR"
                            ) {
                                result =
                                    "🔴 BAŞLIYOR";
                            }

                            return (
                                `**${team1.name}** 🆚 **${team2.name}**\n` +
                                `📅 ${fixture.date} • ⏰ ${fixture.time}\n` +
                                `${result}`
                            );
                        }
                    )
                    .filter(Boolean);

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            "📅 AXERA LEAGUE • FİKSTÜR"
                        )
                        .setDescription(
                            lines.join("\n\n")
                        )
                        .setFooter({
                            text:
                                `Saat dilimi: ${TIME_ZONE}`
                        })
                        .setTimestamp();

                return message.reply({
                    embeds: [embed]
                });
            }

            /* =================================================
               SİL
               ================================================= */

            if (
                command === "sil"
            ) {
                if (
                    !isAdmin(
                        message.member
                    )
                ) {
                    return message.reply(
                        "❌ Bu komutu yalnızca Yönetici kullanabilir."
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
                        "❌ Silinecek mesaj sayısı **1-1000** arasında olmalı."
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
                        () =>
                            reply.delete()
                                .catch(() => {}),
                        3000
                    );
                } catch (err) {
                    return message.reply(
                        "❌ Mesajlar silinemedi. Botun Mesajları Yönet yetkisini kontrol et."
                    );
                }

                return;
            }

            /* =================================================
               EMBED
               ================================================= */

            if (
                command === "embed"
            ) {
                if (
                    !isAdmin(
                        message.member
                    )
                ) {
                    return message.reply(
                        "❌ Bu komutu yalnızca Yönetici kullanabilir."
                    );
                }

                const raw =
                    args.join(" ");

                const parts =
                    raw.split("|");

                const title =
                    parts.shift()?.trim();

                const description =
                    parts.join("|").trim();

                if (
                    !title ||
                    !description
                ) {
                    return message.reply(
                        "❌ Kullanım: `.embed Başlık | Açıklama`"
                    );
                }

                const embed =
                    new EmbedBuilder()
                        .setTitle(title)
                        .setDescription(
                            description
                        )
                        .setTimestamp();

                return message.channel.send({
                    embeds: [embed]
                });
            }

            /* =================================================
               KICK
               ================================================= */

            if (
                command === "kick"
            ) {
                if (
                    !isAdmin(
                        message.member
                    )
                ) {
                    return message.reply(
                        "❌ Bu komutu yalnızca Yönetici kullanabilir."
                    );
                }

                const target =
                    getMentionedMember(
                        message
                    );

                if (!target) {
                    return message.reply(
                        "❌ Kullanım: `.kick @Oyuncu`"
                    );
                }

                if (
                    !target.kickable
                ) {
                    return message.reply(
                        "❌ Bu kullanıcıyı kickleyemiyorum."
                    );
                }

                await target.kick();

                return message.reply(
                    `👢 ${target.user.tag} sunucudan atıldı.`
                );
            }

            /* =================================================
               BAN
               ================================================= */

            if (
                command === "ban"
            ) {
                if (
                    !isAdmin(
                        message.member
                    )
                ) {
                    return message.reply(
                        "❌ Bu komutu yalnızca Yönetici kullanabilir."
                    );
                }

                const target =
                    getMentionedMember(
                        message
                    );

                if (!target) {
                    return message.reply(
                        "❌ Kullanım: `.ban @Oyuncu`"
                    );
                }

                if (
                    !target.bannable
                ) {
                    return message.reply(
                        "❌ Bu kullanıcıyı banlayamıyorum."
                    );
                }

                await target.ban();

                return message.reply(
                    `🔨 ${target.user.tag} sunucudan banlandı.`
                );
            }

            /* =================================================
               MUTE
               ================================================= */

            if (
                command === "mute"
            ) {
                if (
                    !isAdmin(
                        message.member
                    )
                ) {
                    return message.reply(
                        "❌ Bu komutu yalnızca Yönetici kullanabilir."
                    );
                }

                const target =
                    getMentionedMember(
                        message
                    );

                if (!target) {
                    return message.reply(
                        "❌ Kullanım: `.mute @Oyuncu`"
                    );
                }

                if (
                    !target.moderatable
                ) {
                    return message.reply(
                        "❌ Bu kullanıcıyı susturamıyorum."
                    );
                }

                await target.timeout(
                    10 * 60 * 1000,
                    "Axera League mute"
                );

                return message.reply(
                    `🔇 ${target} **10 dakika** susturuldu.`
                );
            }

            /* =================================================
               UNMUTE
               ================================================= */

            if (
                command === "unmute"
            ) {
                if (
                    !isAdmin(
                        message.member
                    )
                ) {
                    return message.reply(
                        "❌ Bu komutu yalnızca Yönetici kullanabilir."
                    );
                }

                const target =
                    getMentionedMember(
                        message
                    );

                if (!target) {
                    return message.reply(
                        "❌ Kullanım: `.unmute @Oyuncu`"
                    );
                }

                if (
                    !target.moderatable
                ) {
                    return message.reply(
                        "❌ Bu kullanıcıyı yönetemiyorum."
                    );
                }

                await target.timeout(
                    null,
                    "Axera League unmute"
                );

                return message.reply(
                    `🔊 ${target} susturması kaldırıldı.`
                );
            }
        } catch (err) {
            console.error(
                "Komut hatası:",
                err
            );

            if (!message.replied) {
                await message.reply(
                    "❌ Komut çalıştırılırken bir hata oluştu."
                ).catch(() => {});
            }
        }
    }
);

/* =========================================================
   BUTONLAR
   ========================================================= */

client.on(
    "interactionCreate",
    async interaction => {
        try {
            /* ================================================
               KAYIT BUTONLARI
               ================================================ */

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
                            "❌ Bu butonları yalnızca **Kayıt Yetkilisi** kullanabilir.",
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

                const member =
                    interaction.guild.members.cache.get(
                        userId
                    );

                if (!member) {
                    return interaction.reply({
                        content:
                            "❌ Oyuncu sunucuda bulunamadı.",
                        ephemeral: true
                    });
                }

                const roleMap = {
                    futbolcu:
                        ROLES.FUTBOLCU,

                    kaleci:
                        ROLES.KALECI,

                    td:
                        ROLES.TEKNIK_DIREKTOR
                };

                const selectedRole =
                    roleMap[type];

                if (!selectedRole) {
                    return interaction.reply({
                        content:
                            "❌ Geçersiz kayıt seçeneği.",
                        ephemeral: true
                    });
                }

                /*
                  Eski kayıt rollerini kaldır.
                */

                for (
                    const roleId of [
                        ROLES.KAYITSIZ,
                        ROLES.FUTBOLCU,
                        ROLES.KALECI,
                        ROLES.TEKNIK_DIREKTOR
                    ]
                ) {
                    if (
                        member.roles.cache.has(
                            roleId
                        )
                    ) {
                        await member.roles.remove(
                            roleId
                        ).catch(() => {});
                    }
                }

                await member.roles.add(
                    selectedRole
                );

                const registration =
                    data.registrations[
                        member.id
                    ] || {};

                registration.role =
                    selectedRole;

                registration.registeredBy =
                    interaction.user.id;

                registration.completedAt =
                    Date.now();

                data.registrations[
                    member.id
                ] = registration;

                saveData();

                const newButtons =
                    new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(
                                    "disabled_1"
                                )
                                .setLabel(
                                    "⚽ Futbolcu"
                                )
                                .setStyle(
                                    ButtonStyle.Primary
                                )
                                .setDisabled(
                                    true
                                ),

                            new ButtonBuilder()
                                .setCustomId(
                                    "disabled_2"
                                )
                                .setLabel(
                                    "🧤 Kaleci"
                                )
                                .setStyle(
                                    ButtonStyle.Success
                                )
                                .setDisabled(
                                    true
                                ),

                            new ButtonBuilder()
                                .setCustomId(
                                    "disabled_3"
                                )
                                .setLabel(
                                    "📋 Teknik Direktör"
                                )
                                .setStyle(
                                    ButtonStyle.Secondary
                                )
                                .setDisabled(
                                    true
                                )
                        );

                await interaction.update({
                    content:
                        `✅ ${member} kaydı tamamlandı.\n\n` +
                        `👤 Kayıt: **${interaction.user}**`,
                    components: [
                        newButtons
                    ]
                });

                const chat =
                    interaction.guild.channels.cache.get(
                        CHANNELS.SOHBET
                    );

                if (chat) {
                    const role =
                        interaction.guild.roles.cache.get(
                            selectedRole
                        );

                    await chat.send({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle(
                                    "🎉 KAYIT TAMAMLANDI"
                                )
                                .setDescription(
                                    `${member} başarıyla kayıt oldu!\n\n` +
                                    `📋 Rol: ${role || "Belirlenemedi"}`
                                )
                                .setFooter({
                                    text:
                                        "Axera League"
                                })
                                .setTimestamp()
                        ]
                    }).catch(() => {});
                }

                return;
            }

            /* ================================================
               FORMASYON MENÜSÜ
               ================================================ */

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
                            "❌ Bu menüyü yalnızca Maç Yetkilisi kullanabilir.",
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
                    data.teams[
                        teamId
                    ];

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
        } catch (err) {
            console.error(
                "Interaction hatası:",
                err
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

/* =========================================================
   OTOMATİK FİKSTÜR KONTROLÜ
   ========================================================= */

setInterval(
    () => {
        checkFixtures().catch(
            err =>
                console.error(
                    "Fikstür kontrol hatası:",
                    err
                )
        );
    },
    1000
);

/* =========================================================
   BOT HAZIR
   ========================================================= */

client.once(
    "ready",
    async () => {
        console.log(
            `✅ ${client.user.tag} aktif!`
        );

        console.log(
            `🌍 Saat dilimi: ${TIME_ZONE}`
        );

        console.log(
            `📅 Fikstür sistemi aktif.`
        );

        console.log(
            `⚽ Maç sistemi aktif.`
        );

        console.log(
            `🏆 Puan sistemi aktif.`
        );

        for (
            const guild of client.guilds.cache.values()
        ) {
            try {
                await guild.members.fetch();

                syncAllTeams(
                    guild
                );

                await updateStandingsChannel(
                    guild
                );
            } catch (err) {
                console.error(
                    `Guild başlangıç işlemi hatası (${guild.id}):`,
                    err
                );
            }
        }

        /*
          Bot yeniden başladığında geçmişte zamanı gelmiş
          fikstürleri de kontrol eder.
        */

        await checkFixtures();
    }
);

/* =========================================================
   HATALAR
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
