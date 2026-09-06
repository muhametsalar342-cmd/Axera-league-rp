const {
    Client,
    GatewayIntentBits,
    Partials,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    PermissionsBitField,
    ChannelType
} = require("discord.js");

const fs = require("fs");
const path = require("path");

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

/* =========================
   AXERA LEAGUE CONFIG
========================= */

const CONFIG = {
    prefix: ".",
    timezone: "Europe/Istanbul",

    roles: {
        futbolcu: "1534457228986421278",
        kaleci: "1534492034243498195",
        kayitsiz: "1534457560134844517",
        teknikDirektor: "1534456648930693120",
        kayitYetkilisi: "1534456315366342716",
        degerYetkilisi: "1534456192913375382",
        macYetkilisi: "1535251168169697390"
    },

    channels: {
        kayit: "1534460177884123276",
        sohbet: "1534469475917758586",
        antrenman: "1534474070798762197",
        penalti: "1534474327812997192",
        mac: "1534477626872168541",
        puan: "1534475991404253284"
    }
};

const DATA_FILE = path.join(__dirname, "data.json");

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
    teamValues: {},
    formations: {},
    training: {},
    assists: {}
};

let DATA = loadData();
let saveTimer = null;

/* =========================
   DATA
========================= */

function loadData() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            return structuredClone(DEFAULT_DATA);
        }

        const raw = fs.readFileSync(DATA_FILE, "utf8");
        const parsed = JSON.parse(raw);

        return {
            ...structuredClone(DEFAULT_DATA),
            ...parsed,
            users: parsed.users || {},
            teams: parsed.teams || {},
            standings: parsed.standings || {},
            fixtures: parsed.fixtures || [],
            activeMatches: parsed.activeMatches || {},
            registrationPanels: parsed.registrationPanels || {},
            tickets: parsed.tickets || {},
            cups: parsed.cups || {},
            teamValues: parsed.teamValues || {},
            formations: parsed.formations || {},
            training: parsed.training || {},
            assists: parsed.assists || {}
        };
    } catch (err) {
        console.error("data.json okunamadı:", err);

        try {
            fs.copyFileSync(
                DATA_FILE,
                `${DATA_FILE}.broken-${Date.now()}`
            );
        } catch {}

        return structuredClone(DEFAULT_DATA);
    }
}

function saveData() {
    clearTimeout(saveTimer);

    saveTimer = setTimeout(() => {
        try {
            const temp = `${DATA_FILE}.tmp`;

            fs.writeFileSync(
                temp,
                JSON.stringify(DATA, null, 2),
                "utf8"
            );

            fs.renameSync(temp, DATA_FILE);
        } catch (err) {
            console.error("Veri kaydedilemedi:", err);
        }
    }, 150);
}

/* =========================
   HELPERS
========================= */

function ensureUser(userId) {
    if (!DATA.users[userId]) {
        DATA.users[userId] = {
            budget: 0,
            value: 0
        };
    }

    if (typeof DATA.users[userId].budget !== "number") {
        DATA.users[userId].budget = Number(DATA.users[userId].budget) || 0;
    }

    if (typeof DATA.users[userId].value !== "number") {
        DATA.users[userId].value = Number(DATA.users[userId].value) || 0;
    }

    return DATA.users[userId];
}

function ensureTeam(teamId, name = "Takım") {
    if (!DATA.teams[teamId]) {
        DATA.teams[teamId] = {
            id: teamId,
            name,
            squad: [],
            formation: "4-4-2"
        };
    }

    return DATA.teams[teamId];
}

function normalizeText(text) {
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
        .replace(/[^a-z0-9]+/g, "");
}

function parseMoney(value) {
    if (typeof value === "number") return value;

    const clean = String(value || "")
        .replace(/€/g, "")
        .replace(/M/gi, "")
        .replace(",", ".")
        .trim();

    const num = Number(clean);

    return Number.isFinite(num) ? num : NaN;
}

function formatMoney(value) {
    return Number(value || 0)
        .toFixed(2)
        .replace(/\.00$/, "")
        .replace(/(\.\d)0$/, "$1");
}

function mention(member) {
    return `<@${member.id}>`;
}

function isAdmin(member) {
    return member.permissions.has(
        PermissionsBitField.Flags.Administrator
    );
}

function hasRole(member, roleId) {
    return member.roles.cache.has(roleId);
}

function isKayitYetkilisi(member) {
    return (
        isAdmin(member) ||
        hasRole(member, CONFIG.roles.kayitYetkilisi)
    );
}

function isDegerYetkilisi(member) {
    return hasRole(member, CONFIG.roles.degerYetkilisi);
}

function isMacYetkilisi(member) {
    return (
        isAdmin(member) ||
        hasRole(member, CONFIG.roles.macYetkilisi)
    );
}

function playerIsRegistered(member) {
    if (!member || member.user?.bot) return false;

    return (
        hasRole(member, CONFIG.roles.futbolcu) ||
        hasRole(member, CONFIG.roles.kaleci) ||
        hasRole(member, CONFIG.roles.teknikDirektor)
    );
}

function playerIsUnregistered(member) {
    return (
        !member ||
        hasRole(member, CONFIG.roles.kayitsiz) ||
        !playerIsRegistered(member)
    );
}

function getPlayerValue(member) {
    ensureUser(member.id);

    const nickname =
        member.nickname ||
        member.user.globalName ||
        member.user.username;

    const match = nickname.match(
        /(\d+(?:[.,]\d+)?)\s*M€\s*$/i
    );

    if (match) {
        return parseMoney(match[1]);
    }

    return Number(DATA.users[member.id].value || 0);
}

function getNicknameValue(member) {
    const nickname =
        member.nickname ||
        member.user.globalName ||
        member.user.username;

    const match = nickname.match(
        /(\d+(?:[.,]\d+)?)\s*M€\s*$/i
    );

    if (!match) return null;

    return parseMoney(match[1]);
}

/* =========================
   VALUE SYSTEM
========================= */

async function changePlayerValue(member, amount) {
    ensureUser(member.id);

    const nickname =
        member.nickname ||
        member.user.globalName ||
        member.user.username;

    const match = nickname.match(
        /^([\s\S]*?)(\d+(?:[.,]\d+)?)\s*M€\s*$/i
    );

    if (!match) {
        throw new Error(
            "Oyuncunun takma adının sonunda M€ değeri bulunamadı."
        );
    }

    const current = parseMoney(match[2]);

    if (!Number.isFinite(current)) {
        throw new Error("Mevcut oyuncu değeri okunamadı.");
    }

    const newValue = Math.max(
        0,
        current + Number(amount)
    );

    const prefix = match[1].replace(/\s+$/, "");

    const newNickname =
        `${prefix} ${formatMoney(newValue)}M€`;

    if (newNickname.length > 32) {
        throw new Error(
            "Yeni takma ad Discord'un 32 karakter sınırını aşıyor."
        );
    }

    await member.setNickname(newNickname);

    DATA.users[member.id].value = newValue;

    saveData();

    return {
        oldValue: current,
        newValue
    };
}

/* =========================
   FUZZY SEARCH
========================= */

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
            matrix[i][j] =
                b[i - 1] === a[j - 1]
                    ? matrix[i - 1][j - 1]
                    : Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
        }
    }

    return matrix[b.length][a.length];
}

function similarityScore(query, nickname) {
    const q = normalizeText(query);
    const n = normalizeText(nickname);

    if (!q || !n) return 0;

    const distance = levenshtein(q, n);
    const maxLength = Math.max(q.length, n.length);

    let score =
        maxLength === 0
            ? 0
            : (1 - distance / maxLength) * 100;

    if (n.includes(q)) score += 300;
    if (n.startsWith(q)) score += 500;

    return score;
}

function findClosestRegisteredMember(guild, query) {
    const candidates = [];

    const q = normalizeText(query);

    for (const member of guild.members.cache.values()) {
        if (member.user.bot) continue;
        if (!memberIsPlayer(member)) continue;

        const nickname =
            member.nickname ||
            member.user.globalName ||
            member.user.username;

        const score = similarityScore(query, nickname);

        candidates.push({
            member,
            nickname,
            score
        });
    }

    candidates.sort(
        (a, b) => b.score - a.score
    );

    return candidates[0] || null;
}

function memberIsPlayer(member) {
    return playerIsRegistered(member);
}

/* =========================
   FORMATIONS
========================= */

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

/* =========================
   REGISTRATION
========================= */

function registrationRolePanel(targetId, creatorId) {
    const menu = new StringSelectMenuBuilder()
        .setCustomId(`kayit_rol_${targetId}_${creatorId}`)
        .setPlaceholder("Oyuncunun rolünü seç")
        .addOptions(
            {
                label: "Futbolcu",
                value: "futbolcu",
                emoji: "⚽"
            },
            {
                label: "Kaleci",
                value: "kaleci",
                emoji: "🧤"
            },
            {
                label: "Teknik Direktör",
                value: "teknikDirektor",
                emoji: "📋"
            }
        );

    return new ActionRowBuilder().addComponents(menu);
}

async function registerMember(
    executor,
    target,
    nickname
) {
    if (!isKayitYetkilisi(executor)) {
        throw new Error(
            "Bu komutu sadece Kayıt Yetkilisi kullanabilir."
        );
    }

    if (!nickname) {
        throw new Error(
            "Kullanım: `.k @Oyuncu TakmaAdı`"
        );
    }

    if (nickname.length > 32) {
        throw new Error(
            "Takma ad 32 karakterden uzun olamaz."
        );
    }

    DATA.registrationPanels[target.id] = {
        targetId: target.id,
        creatorId: executor.id,
        nickname,
        createdAt: Date.now()
    };

    saveData();

    return registrationRolePanel(
        target.id,
        executor.id
    );
}

/* =========================
   TRAINING
========================= */

async function doTraining(member) {
    ensureUser(member.id);

    if (!DATA.training[member.id]) {
        DATA.training[member.id] = 0;
    }

    DATA.training[member.id]++;

    const progress = DATA.training[member.id];

    if (progress < 5) {
        saveData();

        return {
            finished: false,
            progress
        };
    }

    try {
        const result =
            await changePlayerValue(member, 5);

        DATA.training[member.id] = 0;

        saveData();

        return {
            finished: true,
            progress: 5,
            result
        };
    } catch (err) {
        DATA.training[member.id] = 4;
        saveData();

        throw err;
    }
}

/* =========================
   PENALTY
========================= */

async function penalty(member) {
    const random = Math.random();

    if (random < 0.50) {
        const result =
            await changePlayerValue(member, 5);

        return {
            type: "goal",
            result
        };
    }

    if (random < 0.75) {
        return {
            type: "post"
        };
    }

    return {
        type: "save"
    };
}

/* =========================
   TEAM SYSTEM
========================= */

function getTeamByMention(message) {
    const role = message.mentions.roles.first();

    if (!role) return null;

    return role;
}

function getTeamData(teamId) {
    return DATA.teams[teamId] || null;
}

function teamTotalValue(teamId, guild) {
    const team = DATA.teams[teamId];

    if (!team) return 0;

    let total =
        Number(DATA.teamValues[teamId] || 0);

    for (const player of team.squad || []) {
        const member = guild.members.cache.get(
            player.userId
        );

        if (member) {
            total += getPlayerValue(member);
        }
    }

    return total;
}

function teamSquadText(team, guild) {
    if (!team.squad?.length) {
        return "Henüz oyuncu bulunmuyor.";
    }

    const grouped = {};

    for (const player of team.squad) {
        if (!grouped[player.position]) {
            grouped[player.position] = [];
        }

        grouped[player.position].push(player);
    }

    const order = [
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

    const lines = [];

    for (const position of order) {
        if (!grouped[position]) continue;

        lines.push(`**${position}**`);

        for (const player of grouped[position]) {
            const member =
                guild.members.cache.get(
                    player.userId
                );

            if (!member) continue;

            lines.push(
                `• ${member} — ${formatMoney(
                    getPlayerValue(member)
                )}M€`
            );
        }
    }

    return lines.join("\n");
}

/* =========================
   STANDINGS
========================= */

function ensureStanding(teamId, teamName) {
    if (!DATA.standings[teamId]) {
        DATA.standings[teamId] = {
            teamId,
            name: teamName,
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

    return DATA.standings[teamId];
}

async function updateStandingsMessage(guild) {
    const channel =
        guild.channels.cache.get(
            CONFIG.channels.puan
        );

    if (!channel) return;

    const rows = Object.values(
        DATA.standings
    ).sort((a, b) =>
        b.P - a.P ||
        b.AV - a.AV ||
        b.AG - a.AG
    );

    const embed = new EmbedBuilder()
        .setTitle("🏆 AXERA LEAGUE PUAN DURUMU")
        .setDescription(
            rows.length
                ? rows.map((team, index) =>
                    `${index + 1}. **${team.name}** — ` +
                    `O:${team.O} G:${team.G} B:${team.B} M:${team.M} ` +
                    `AG:${team.AG} YG:${team.YG} ` +
                    `AV:${team.AV} P:${team.P}`
                ).join("\n")
                : "Henüz takım bulunmuyor."
        )
        .setTimestamp();

    let message = null;

    if (DATA.standingsMessageId) {
        try {
            message =
                await channel.messages.fetch(
                    DATA.standingsMessageId
                );
        } catch {}
    }

    if (message) {
        await message.edit({
            embeds: [embed]
        });
    } else {
        message = await channel.send({
            embeds: [embed]
        });

        DATA.standingsMessageId = message.id;
        saveData();
    }
}

/* =========================
   MATCH SYSTEM
========================= */

function getActiveTeamMatch(teamId) {
    return Object.values(
        DATA.activeMatches
    ).find(match =>
        match.team1 === teamId ||
        match.team2 === teamId
    );
}

function chooseScorer(team, guild) {
    const data = DATA.teams[team];

    if (!data?.squad?.length) {
        return null;
    }

    const candidates =
        data.squad
            .map(p =>
                guild.members.cache.get(
                    p.userId
                )
            )
            .filter(Boolean);

    if (!candidates.length) {
        return null;
    }

    return candidates[
        Math.floor(
            Math.random() * candidates.length
        )
    ];
}

async function startLiveMatch(
    guild,
    team1Role,
    team2Role,
    fixture = null
) {
    if (getActiveTeamMatch(team1Role.id)) {
        throw new Error(
            "İlk takım zaten maçta."
        );
    }

    if (getActiveTeamMatch(team2Role.id)) {
        throw new Error(
            "İkinci takım zaten maçta."
        );
    }

    const channel =
        guild.channels.cache.get(
            CONFIG.channels.mac
        );

    if (!channel) {
        throw new Error(
            "Maç kanalı bulunamadı."
        );
    }

    const team1 =
        DATA.teams[team1Role.id];

    const team2 =
        DATA.teams[team2Role.id];

    if (!team1 || !team2) {
        throw new Error(
            "Takımlardan biri puan sisteminde kayıtlı değil."
        );
    }

    const matchId =
        `${team1Role.id}_${team2Role.id}_${Date.now()}`;

    const match = {
        id: matchId,
        team1: team1Role.id,
        team2: team2Role.id,
        score1: 0,
        score2: 0,
        minute: 0,
        scorers1: [],
        scorers2: [],
        startedAt: Date.now(),
        fixtureId: fixture?.id || null
    };

    DATA.activeMatches[matchId] = match;
    saveData();

    const embed = new EmbedBuilder()
        .setTitle("⚽ AXERA LEAGUE — CANLI MAÇ")
        .setDescription(
            `**${team1Role.name}** 0 - 0 **${team2Role.name}**\n\n` +
            `⏱️ Maç başlıyor...\n` +
            `👥 İlk 11 zorunlu değildir.`
        )
        .setTimestamp();

    const message =
        await channel.send({
            embeds: [embed]
        });

    match.messageId = message.id;
    saveData();

    let timer = null;

    const finish = async () => {
        clearInterval(timer);

        await finishMatch(
            guild,
            matchId
        );
    };

    timer = setInterval(async () => {
        try {
            match.minute++;

            const goalChance =
                0.027;

            if (Math.random() < goalChance) {
                const firstTeam =
                    Math.random() < 0.5;

                if (firstTeam) {
                    match.score1++;

                    const scorer =
                        chooseScorer(
                            team1Role.id,
                            guild
                        );

                    if (scorer) {
                        match.scorers1.push(
                            scorer.id
                        );

                        DATA.assists[scorer.id] =
                            Number(
                                DATA.assists[scorer.id] || 0
                            );
                    }
                } else {
                    match.score2++;

                    const scorer =
                        chooseScorer(
                            team2Role.id,
                            guild
                        );

                    if (scorer) {
                        match.scorers2.push(
                            scorer.id
                        );

                        DATA.assists[scorer.id] =
                            Number(
                                DATA.assists[scorer.id] || 0
                            );
                    }
                }
            }

            const scorerText1 =
                match.scorers1.length
                    ? match.scorers1
                        .map(id => {
                            const m =
                                guild.members.cache.get(id);
                            return m
                                ? m.displayName
                                : "Oyuncu";
                        })
                        .join(", ")
                    : "—";

            const scorerText2 =
                match.scorers2.length
                    ? match.scorers2
                        .map(id => {
                            const m =
                                guild.members.cache.get(id);
                            return m
                                ? m.displayName
                                : "Oyuncu";
                        })
                        .join(", ")
                    : "—";

            const liveEmbed =
                new EmbedBuilder()
                    .setTitle(
                        "⚽ AXERA LEAGUE — CANLI MAÇ"
                    )
                    .setDescription(
                        `**${team1Role.name}** ` +
                        `**${match.score1}** - **${match.score2}** ` +
                        `**${team2Role.name}**\n\n` +
                        `⏱️ **${match.minute}'**\n\n` +
                        `⚽ ${team1Role.name}: ${scorerText1}\n` +
                        `⚽ ${team2Role.name}: ${scorerText2}`
                    )
                    .setTimestamp();

            await message.edit({
                embeds: [liveEmbed]
            });

            saveData();

            if (match.minute >= 90) {
                await finish();
            }
        } catch (err) {
            console.error(
                "Maç hatası:",
                err
            );

            clearInterval(timer);

            await finishMatch(
                guild,
                matchId,
                true
            );
        }
    }, 3000);
}

async function finishMatch(
    guild,
    matchId,
    error = false
) {
    const match =
        DATA.activeMatches[matchId];

    if (!match) return;

    const team1 =
        DATA.teams[match.team1];

    const team2 =
        DATA.teams[match.team2];

    if (!team1 || !team2) {
        delete DATA.activeMatches[matchId];
        saveData();
        return;
    }

    const standing1 =
        ensureStanding(
            match.team1,
            team1.name
        );

    const standing2 =
        ensureStanding(
            match.team2,
            team2.name
        );

    standing1.O++;
    standing2.O++;

    standing1.AG += match.score1;
    standing1.YG += match.score2;

    standing2.AG += match.score2;
    standing2.YG += match.score1;

    standing1.AV =
        standing1.AG - standing1.YG;

    standing2.AV =
        standing2.AG - standing2.YG;

    if (match.score1 > match.score2) {
        standing1.G++;
        standing1.P += 3;
        standing2.M++;
    } else if (match.score2 > match.score1) {
        standing2.G++;
        standing2.P += 3;
        standing1.M++;
    } else {
        standing1.B++;
        standing2.B++;
        standing1.P++;
        standing2.P++;
    }

    if (match.fixtureId) {
        const fixture =
            DATA.fixtures.find(
                f =>
                    f.id === match.fixtureId
            );

        if (fixture) {
            fixture.status =
                error
                    ? "HATA"
                    : "TAMAMLANDI";

            fixture.score1 =
                match.score1;

            fixture.score2 =
                match.score2;

            fixture.finishedAt =
                Date.now();
        }
    }

    delete DATA.activeMatches[matchId];

    saveData();

    const channel =
        guild.channels.cache.get(
            CONFIG.channels.mac
        );

    if (channel) {
        let result;

        if (match.score1 > match.score2) {
            result =
                `🏆 **${team1.name} kazandı!**`;
        } else if (
            match.score2 > match.score1
        ) {
            result =
                `🏆 **${team2.name} kazandı!**`;
        } else {
            result =
                "🤝 **Maç berabere bitti!**";
        }

        await channel.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle(
                        "🏁 MAÇ SONA ERDİ"
                    )
                    .setDescription(
                        `**${team1.name}** ` +
                        `**${match.score1}** - **${match.score2}** ` +
                        `**${team2.name}**\n\n` +
                        result
                    )
                    .setTimestamp()
            ]
        });
    }

    await updateStandingsMessage(
        guild
    );
}

/* =========================
   FIXTURE
========================= */

function parseFixtureTimestamp(
    date,
    time
) {
    const partsDate =
        date.split("-").map(Number);

    const partsTime =
        time.split(":").map(Number);

    if (
        partsDate.length !== 3 ||
        partsTime.length < 2
    ) {
        return NaN;
    }

    const [year, month, day] =
        partsDate;

    const [hour, minute] =
        partsTime;

    const utcGuess =
        Date.UTC(
            year,
            month - 1,
            day,
            hour,
            minute
        );

    const formatter =
        new Intl.DateTimeFormat(
            "en-US",
            {
                timeZone: CONFIG.timezone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false
            }
        );

    const parts =
        formatter.formatToParts(
            new Date(utcGuess)
        );

    const get =
        type =>
            Number(
                parts.find(
                    p => p.type === type
                )?.value
            );

    const localGuess =
        Date.UTC(
            get("year"),
            get("month") - 1,
            get("day"),
            get("hour"),
            get("minute")
        );

    const offset =
        utcGuess - localGuess;

    return utcGuess + offset;
}

async function checkFixtures(guild) {
    const now = Date.now();

    for (const fixture of DATA.fixtures) {
        if (
            fixture.status !== "BEKLIYOR"
        ) continue;

        if (
            Number(fixture.timestamp) >
            now
        ) continue;

        const team1 =
            guild.roles.cache.get(
                fixture.team1
            );

        const team2 =
            guild.roles.cache.get(
                fixture.team2
            );

        if (!team1 || !team2) {
            fixture.status = "HATA";
            continue;
        }

        if (
            getActiveTeamMatch(team1.id) ||
            getActiveTeamMatch(team2.id)
        ) {
            continue;
        }

        fixture.status =
            "BAŞLIYOR";

        fixture.startedAt =
            Date.now();

        saveData();

        try {
            await startLiveMatch(
                guild,
                team1,
                team2,
                fixture
            );
        } catch (err) {
            console.error(
                "Fikstür maçı başlatılamadı:",
                err
            );

            fixture.status =
                "HATA";

            saveData();
        }
    }
}

/* =========================
   TICKET
========================= */

async function createTicket(
    interaction
) {
    const guild =
        interaction.guild;

    const existing =
        Object.values(
            DATA.tickets
        ).find(
            t =>
                t.guildId === guild.id &&
                t.userId === interaction.user.id &&
                guild.channels.cache.has(t.channelId)
        );

    if (existing) {
        return interaction.reply({
            content:
                `Zaten açık bir destek talebin var: <#${existing.channelId}>`,
            ephemeral: true
        });
    }

    const channel =
        await guild.channels.create({
            name:
                `destek-${interaction.user.username}`
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, "")
                    .slice(0, 80),
            type:
                ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: guild.id,
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
                ...[
                    CONFIG.roles.kayitYetkilisi,
                    CONFIG.roles.degerYetkilisi,
                    CONFIG.roles.macYetkilisi
                ].map(id => ({
                    id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory
                    ]
                }))
            ]
        });

    DATA.tickets[channel.id] = {
        guildId: guild.id,
        userId: interaction.user.id,
        channelId: channel.id,
        lastMessageAt: Date.now()
    };

    saveData();

    await channel.send({
        embeds: [
            new EmbedBuilder()
                .setTitle("🎫 Destek Talebi")
                .setDescription(
                    "Yetkili ekibimiz en kısa sürede ilgilenecektir.\n\n" +
                    "⏰ 60 dakika boyunca mesaj gelmezse ticket otomatik kapanır."
                )
        ]
    });

    await interaction.reply({
        content:
            `🎫 Ticket oluşturuldu: ${channel}`,
        ephemeral: true
    });
}

/* =========================
   HELP
========================= */

function helpEmbed() {
    return new EmbedBuilder()
        .setTitle("📚 AXERA LEAGUE KOMUTLARI")
        .setDescription(
            [
                "**👤 KAYIT**",
                "`.k @Oyuncu TakmaAdı`",
                "`.kayıtsızver @Oyuncu`",
                "`.rolpanel`",

                "",
                "**💰 DEĞER**",
                "`.dver @Oyuncu 5`",
                "`.dsil @Oyuncu 5`",

                "",
                "**🏋️ ANTRENMAN**",
                "`.ant`",
                "`.antrenman`",

                "",
                "**⚽ PENALTI**",
                "`.pen`",
                "`.penaltı`",

                "",
                "**🔎 OYUNCU**",
                "`.ara Oyuncu`",

                "",
                "**💵 KİŞİSEL BÜTÇE**",
                "`.bütçe`",
                "`.bütçe @Oyuncu`",
                "`.gönder @Oyuncu 50`",
                "`.paraekle @Oyuncu 50`",
                "`.parasil @Oyuncu 20`",
                "`.paraayarla @Oyuncu 100`",

                "",
                "**🏆 TAKIM**",
                "`.takımekle @Takım`",
                "`.takımkaldır @Takım`",
                "`.puan`",
                "`.puanekle @Takım 3`",
                "`.takımdeğer @Takım 850`",
                "`.kadroekle @Takım @Oyuncu Pozisyon`",
                "`.kadrocikar @Takım @Oyuncu`",
                "`.kadro @Takım`",
                "`.formasyon @Takım`",

                "",
                "**⚽ MAÇ**",
                "`.maç @Takım1 @Takım2`",

                "",
                "**📅 FİKSTÜR**",
                "`.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`",
                "`.fikstür`",
                "`.fiksturcikar @Takım1 @Takım2`",

                "",
                "**🏅 KUPA / MÜZE**",
                "`.kupaekle @Takım KupaAdı`",
                "`.kupasil @Takım KupaAdı`",
                "`.müze @Takım`",

                "",
                "**🐦 DİĞER**",
                "`.tweet mesaj`",
                "`.dm @Oyuncu mesaj`",
                "`.ticketpanel`",

                "",
                "**🛡️ YÖNETİM**",
                "`.sil 10`",
                "`.embed Başlık | Açıklama`",
                "`.kick @Oyuncu`",
                "`.ban @Oyuncu`",
                "`.mute @Oyuncu`",
                "`.unmute @Oyuncu`"
            ].join("\n")
        );
}

/* =========================
   MESSAGE COMMANDS
========================= */

client.on(
    "messageCreate",
    async message => {
        try {
            if (message.author.bot) return;

            if (
                message.channel.id in DATA.tickets
            ) {
                DATA.tickets[
                    message.channel.id
                ].lastMessageAt =
                    Date.now();

                saveData();
            }

            if (!message.content.startsWith(CONFIG.prefix)) {
                return;
            }

            const args =
                message.content
                    .slice(CONFIG.prefix.length)
                    .trim()
                    .split(/\s+/);

            const command =
                args.shift()
                    ?.toLocaleLowerCase(
                        "tr-TR"
                    );

            if (!command) return;

            /* =====================
               HELP
            ===================== */

            if (
                command === "yardım" ||
                command === "yardim"
            ) {
                return message.reply({
                    embeds: [helpEmbed()]
                });
            }

            /* =====================
               REGISTRATION
            ===================== */

            if (command === "k") {
                if (!isKayitYetkilisi(message.member)) {
                    return message.reply(
                        "❌ Bu komutu sadece Kayıt Yetkilisi kullanabilir."
                    );
                }

                if (
                    message.channel.id !==
                    CONFIG.channels.kayit
                ) {
                    return message.reply(
                        "❌ Bu komut sadece kayıt kanalında kullanılabilir."
                    );
                }

                const target =
                    message.mentions.members.first();

                if (!target) {
                    return message.reply(
                        "❌ Kullanım: `.k @Oyuncu TakmaAdı`"
                    );
                }

                const nickname =
                    args
                        .filter(
                            arg =>
                                !arg.startsWith("<@")
                        )
                        .join(" ")
                        .trim();

                if (!nickname) {
                    return message.reply(
                        "❌ Takma adını yazmalısın."
                    );
                }

                const row =
                    await registerMember(
                        message.member,
                        target,
                        nickname
                    );

                return message.reply({
                    content:
                        `📋 ${target} için rol seçimini yap:`,
                    components: [row]
                });
            }

            if (
                command === "kayıtsızver" ||
                command === "kayitsizver"
            ) {
                if (!isKayitYetkilisi(message.member)) {
                    return message.reply(
                        "❌ Bu komutu sadece Kayıt Yetkilisi kullanabilir."
                    );
                }

                const target =
                    message.mentions.members.first();

                if (!target) {
                    return message.reply(
                        "❌ Kullanım: `.kayıtsızver @Oyuncu`"
                    );
                }

                const removeRoles = [
                    CONFIG.roles.futbolcu,
                    CONFIG.roles.kaleci,
                    CONFIG.roles.teknikDirektor
                ];

                await target.roles.remove(
                    removeRoles
                );

                await target.roles.add(
                    CONFIG.roles.kayitsiz
                );

                return message.reply(
                    `✅ ${target} artık **Kayıtsız** rolünde.`
                );
            }

            if (command === "rolpanel") {
                if (!isAdmin(message.member)) {
                    return message.reply(
                        "❌ Bu komut sadece yöneticiye açıktır."
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

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            "📋 AXERA LEAGUE KAYIT PANELİ"
                        )
                        .setDescription(
                            "Kayıt işlemi için Kayıt Yetkilisi ile iletişime geçiniz.\n\n" +
                            "Kayıt Yetkilisi `.k @Oyuncu TakmaAdı` komutunu kullanarak kayıt işlemini başlatabilir."
                        );

                await channel.send({
                    embeds: [embed]
                });

                return message.reply(
                    "✅ Rol paneli gönderildi."
                );
            }

            /* =====================
               PLAYER SEARCH
            ===================== */

            if (command === "ara") {
                const query =
                    args.join(" ").trim();

                if (!query) {
                    return message.reply(
                        "❌ Aramak istediğin oyuncuyu yaz."
                    );
                }

                const found =
                    findClosestRegisteredMember(
                        message.guild,
                        query
                    );

                if (!found) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle("🔎 Oyuncu Arama")
                                .setDescription(
                                    `⚪ **${query}** için kayıtlı oyuncu bulunamadı.`
                                )
                        ]
                    });
                }

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                "🔎 OYUNCU BULUNDU"
                            )
                            .addFields(
                                {
                                    name: "Aranan",
                                    value: query,
                                    inline: true
                                },
                                {
                                    name: "Oyuncu",
                                    value: mention(
                                        found.member
                                    ),
                                    inline: true
                                },
                                {
                                    name: "Takma Ad",
                                    value:
                                        found.nickname,
                                    inline: false
                                },
                                {
                                    name: "Değer",
                                    value:
                                        `${formatMoney(
                                            getPlayerValue(
                                                found.member
                                            )
                                        )}M€`,
                                    inline: true
                                },
                                {
                                    name: "Durum",
                                    value: "🟢 DOLU",
                                    inline: true
                                }
                            )
                    ]
                });
            }

            /* =====================
               VALUE
            ===================== */

            if (
                command === "dver" ||
                command === "dsil"
            ) {
                if (!isDegerYetkilisi(message.member)) {
                    return message.reply(
                        "❌ Bu komutu sadece Değer Yetkilisi kullanabilir."
                    );
                }

                const target =
                    message.mentions.members.first();

                const amount =
                    Number(
                        args.find(
                            arg =>
                                !arg.startsWith("<@")
                        )
                    );

                if (
                    !target ||
                    !Number.isFinite(amount) ||
                    amount <= 0
                ) {
                    return message.reply(
                        `❌ Kullanım: \`.${command} @Oyuncu 5\``
                    );
                }

                const change =
                    command === "dver"
                        ? amount
                        : -amount;

                try {
                    const result =
                        await changePlayerValue(
                            target,
                            change
                        );

                    return message.reply(
                        `✅ ${target} oyuncusunun değeri **${formatMoney(
                            result.oldValue
                        )}M€ → ${formatMoney(
                            result.newValue
                        )}M€** oldu.`
                    );
                } catch (err) {
                    return message.reply(
                        `❌ ${err.message}`
                    );
                }
            }

            /* =====================
               TRAINING
            ===================== */

            if (
                command === "ant" ||
                command === "antrenman"
            ) {
                if (
                    message.channel.id !==
                    CONFIG.channels.antrenman
                ) {
                    return message.reply(
                        "❌ Antrenman komutu sadece antrenman kanalında kullanılabilir."
                    );
                }

                if (
                    playerIsUnregistered(
                        message.member
                    )
                ) {
                    return message.reply(
                        "❌ Kayıtsız üyeler antrenman yapamaz."
                    );
                }

                try {
                    const result =
                        await doTraining(
                            message.member
                        );

                    if (!result.finished) {
                        return message.reply(
                            `🏋️ Antrenman ilerlemesi: **${result.progress}/5**`
                        );
                    }

                    return message.reply(
                        `🏆 Antrenman tamamlandı!\n` +
                        `💰 Otomatik değer artışı: **+5M€**\n` +
                        `📈 Yeni değer: **${formatMoney(
                            result.result.newValue
                        )}M€**`
                    );
                } catch (err) {
                    return message.reply(
                        `❌ ${err.message}`
                    );
                }
            }

            /* =====================
               PENALTY
            ===================== */

            if (
                command === "pen" ||
                command === "penaltı" ||
                command === "penalti"
            ) {
                if (
                    message.channel.id !==
                    CONFIG.channels.penalti
                ) {
                    return message.reply(
                        "❌ Penaltı komutu sadece penaltı kanalında kullanılabilir."
                    );
                }

                if (
                    playerIsUnregistered(
                        message.member
                    )
                ) {
                    return message.reply(
                        "❌ Kayıtsız üyeler penaltı kullanamaz."
                    );
                }

                try {
                    const result =
                        await penalty(
                            message.member
                        );

                    if (
                        result.type ===
                        "goal"
                    ) {
                        return message.reply(
                            `⚽ **GOOOL!**\n` +
                            `🧤 Axera Kalecisi geçildi!\n` +
                            `💰 Otomatik değer artışı: **+5M€**\n` +
                            `📈 Yeni değer: **${formatMoney(
                                result.result.newValue
                            )}M€**`
                        );
                    }

                    if (
                        result.type ===
                        "post"
                    ) {
                        return message.reply(
                            "🥅 Direk! Top ağlarla buluşmadı."
                        );
                    }

                    return message.reply(
                        "🧤 Axera Kalecisi kurtardı!"
                    );
                } catch (err) {
                    return message.reply(
                        `❌ ${err.message}`
                    );
                }
            }

            /* =====================
               BUDGET
            ===================== */

            if (
                command === "bütçe" ||
                command === "butce"
            ) {
                const target =
                    message.mentions.members.first() ||
                    message.member;

                if (
                    playerIsUnregistered(
                        target
                    )
                ) {
                    return message.reply(
                        "❌ Kayıtsız oyuncular bütçe sisteminde görüntülenemez."
                    );
                }

                ensureUser(target.id);

                return message.reply(
                    `💰 ${target} kişisel bütçesi: **${formatMoney(
                        DATA.users[target.id].budget
                    )}M€**`
                );
            }

            if (
                command === "gönder" ||
                command === "gonder"
            ) {
                const target =
                    message.mentions.members.first();

                const amount =
                    Number(
                        args.find(
                            arg =>
                                !arg.startsWith("<@")
                        )
                    );

                if (
                    !target ||
                    !Number.isFinite(amount) ||
                    amount <= 0
                ) {
                    return message.reply(
                        "❌ Kullanım: `.gönder @Oyuncu 50`"
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

                if (
                    playerIsUnregistered(
                        message.member
                    ) ||
                    playerIsUnregistered(target)
                ) {
                    return message.reply(
                        "❌ Kayıtsız oyuncular bütçe transferi yapamaz."
                    );
                }

                ensureUser(
                    message.author.id
                );

                ensureUser(
                    target.id
                );

                if (
                    DATA.users[
                        message.author.id
                    ].budget < amount
                ) {
                    return message.reply(
                        "❌ Yeterli bütçen yok."
                    );
                }

                DATA.users[
                    message.author.id
                ].budget -= amount;

                DATA.users[
                    target.id
                ].budget += amount;

                saveData();

                return message.reply(
                    `✅ **${formatMoney(
                        amount
                    )}M€** ${target} oyuncusuna gönderildi.`
                );
            }

            if (
                command === "paraekle" ||
                command === "parasil" ||
                command === "paraayarla"
            ) {
                if (!isDegerYetkilisi(message.member)) {
                    return message.reply(
                        "❌ Bu komutu sadece Değer Yetkilisi kullanabilir."
                    );
                }

                const target =
                    message.mentions.members.first();

                const amount =
                    Number(
                        args.find(
                            arg =>
                                !arg.startsWith("<@")
                        )
                    );

                if (
                    !target ||
                    !Number.isFinite(amount) ||
                    amount < 0
                ) {
                    return message.reply(
                        "❌ Geçerli bir miktar yaz."
                    );
                }

                ensureUser(target.id);

                if (
                    command === "paraekle"
                ) {
                    DATA.users[
                        target.id
                    ].budget += amount;
                }

                if (
                    command === "parasil"
                ) {
                    DATA.users[
                        target.id
                    ].budget =
                        Math.max(
                            0,
                            DATA.users[
                                target.id
                            ].budget - amount
                        );
                }

                if (
                    command === "paraayarla"
                ) {
                    DATA.users[
                        target.id
                    ].budget = amount;
                }

                saveData();

                return message.reply(
                    `✅ ${target} bütçesi: **${formatMoney(
                        DATA.users[target.id].budget
                    )}M€**`
                );
            }

            /* =====================
               TEAM ADD
            ===================== */

            if (
                command === "takımekle" ||
                command === "takimekle"
            ) {
                if (!isMacYetkilisi(message.member)) {
                    return message.reply(
                        "❌ Bu komutu sadece Maç Yetkilisi kullanabilir."
                    );
                }

                const role =
                    getTeamByMention(
                        message
                    );

                if (!role) {
                    return message.reply(
                        "❌ Kullanım: `.takımekle @Takım`"
                    );
                }

                if (
                    DATA.teams[role.id]
                ) {
                    return message.reply(
                        "❌ Bu takım zaten kayıtlı."
                    );
                }

                DATA.teams[role.id] = {
                    id: role.id,
                    name: role.name,
                    squad: [],
                    formation: "4-4-2"
                };

                ensureStanding(
                    role.id,
                    role.name
                );

                DATA.teamValues[
                    role.id
                ] = 0;

                saveData();

                await updateStandingsMessage(
                    message.guild
                );

                return message.reply(
                    `✅ **${role.name}** takımı lige eklendi.`
                );
            }

            /* =====================
               TEAM REMOVE
            ===================== */

            if (
                command === "takımkaldır" ||
                command === "takimkaldir" ||
                command === "takımkaldir" ||
                command === "takimkaldır"
            ) {
                if (!isMacYetkilisi(message.member)) {
                    return message.reply(
                        "❌ Bu komutu sadece Maç Yetkilisi kullanabilir."
                    );
                }

                const role =
                    getTeamByMention(
                        message
                    );

                if (!role) {
                    return message.reply(
                        "❌ Kullanım: `.takımkaldır @Takım`"
                    );
                }

                if (
                    getActiveTeamMatch(
                        role.id
                    )
                ) {
                    return message.reply(
                        "❌ Takım aktif maçtayken kaldırılamaz."
                    );
                }

                delete DATA.teams[
                    role.id
                ];

                delete DATA.standings[
                    role.id
                ];

                delete DATA.teamValues[
                    role.id
                ];

                delete DATA.formations[
                    role.id
                ];

                DATA.fixtures =
                    DATA.fixtures.filter(
                        f =>
                            f.team1 !== role.id &&
                            f.team2 !== role.id
                    );

                saveData();

                await updateStandingsMessage(
                    message.guild
                );

                return message.reply(
                    `✅ **${role.name}** takımı sistemden kaldırıldı.`
                );
            }

            /* =====================
               POINTS
            ===================== */

            if (
                command === "puan"
            ) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                "🏆 AXERA LEAGUE PUAN DURUMU"
                            )
                            .setDescription(
                                Object.values(
                                    DATA.standings
                                )
                                    .sort(
                                        (a, b) =>
                                            b.P - a.P ||
                                            b.AV - a.AV ||
                                            b.AG - a.AG
                                    )
                                    .map(
                                        (team, i) =>
                                            `**${i + 1}. ${team.name}**\n` +
                                            `O ${team.O} | G ${team.G} | B ${team.B} | M ${team.M} | ` +
                                            `AG ${team.AG} | YG ${team.YG} | AV ${team.AV} | P ${team.P}`
                                    )
                                    .join("\n\n") ||
                                "Henüz takım yok."
                            )
                    ]
                });
            }

            if (
                command === "puanekle"
            ) {
                if (!isMacYetkilisi(message.member)) {
                    return message.reply(
                        "❌ Bu komutu sadece Maç Yetkilisi kullanabilir."
                    );
                }

                const role =
                    getTeamByMention(
                        message
                    );

                const amount =
                    Number(
                        args.find(
                            arg =>
                                !arg.startsWith("<@")
                        )
                    );

                if (
                    !role ||
                    !Number.isFinite(amount)
                ) {
                    return message.reply(
                        "❌ Kullanım: `.puanekle @Takım 3`"
                    );
                }

                const standing =
                    ensureStanding(
                        role.id,
                        role.name
                    );

                standing.P += amount;

                saveData();

                await updateStandingsMessage(
                    message.guild
                );

                return message.reply(
                    `✅ ${role.name} puanı **${amount}** artırıldı.`
                );
            }

            /* =====================
               TEAM VALUE
            ===================== */

            if (
                command === "takımdeğer" ||
                command === "takimdeger"
            ) {
                if (!isMacYetkilisi(message.member)) {
                    return message.reply(
                        "❌ Bu komutu sadece Maç Yetkilisi kullanabilir."
                    );
                }

                const role =
                    getTeamByMention(
                        message
                    );

                const amount =
                    Number(
                        args.find(
                            arg =>
                                !arg.startsWith("<@")
                        )
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

                DATA.teamValues[
                    role.id
                ] = amount;

                saveData();

                return message.reply(
                    `✅ ${role.name} temel takım değeri **${formatMoney(
                        amount
                    )}M€** olarak ayarlandı.`
                );
            }

            /* =====================
               SQUAD ADD
            ===================== */

            if (
                command === "kadroekle"
            ) {
                if (!isMacYetkilisi(message.member)) {
                    return message.reply(
                        "❌ Bu komutu sadece Maç Yetkilisi kullanabilir."
                    );
                }

                const role =
                    message.mentions.roles.first();

                const target =
                    message.mentions.members.first();

                const position =
                    args[
                        args.length - 1
                    ]?.toUpperCase();

                if (
                    !role ||
                    !target ||
                    !position
                ) {
                    return message.reply(
                        "❌ Kullanım: `.kadroekle @Takım @Oyuncu Pozisyon`"
                    );
                }

                const validPositions = [
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

                if (
                    !validPositions.includes(
                        position
                    )
                ) {
                    return message.reply(
                        "❌ Geçersiz pozisyon."
                    );
                }

                if (
                    playerIsUnregistered(
                        target
                    )
                ) {
                    return message.reply(
                        "❌ Kayıtsız oyuncu kadroya eklenemez."
                    );
                }

                const team =
                    ensureTeam(
                        role.id,
                        role.name
                    );

                const existing =
                    team.squad.find(
                        p =>
                            p.userId ===
                            target.id
                    );

                if (existing) {
                    return message.reply(
                        "❌ Bu oyuncu zaten bu takımda."
                    );
                }

                const otherTeam =
                    Object.values(
                        DATA.teams
                    ).find(
                        t =>
                            t.squad?.some(
                                p =>
                                    p.userId ===
                                    target.id
                            )
                    );

                if (otherTeam) {
                    return message.reply(
                        "❌ Oyuncu başka bir takımın kadrosunda."
                    );
                }

                team.squad.push({
                    userId:
                        target.id,
                    position
                });

                saveData();

                return message.reply(
                    `✅ ${target} **${role.name}** kadrosuna **${position}** olarak eklendi.`
                );
            }

            /* =====================
               SQUAD REMOVE
            ===================== */

            if (
                command === "kadrocikar" ||
                command === "kadroçıkar" ||
                command === "kadrocıkar" ||
                command === "kadroçikar"
            ) {
                if (!isMacYetkilisi(message.member)) {
                    return message.reply(
                        "❌ Bu komutu sadece Maç Yetkilisi kullanabilir."
                    );
                }

                const role =
                    message.mentions.roles.first();

                const target =
                    message.mentions.members.first();

                if (
                    !role ||
                    !target
                ) {
                    return message.reply(
                        "❌ Kullanım: `.kadrocikar @Takım @Oyuncu`"
                    );
                }

                const team =
                    DATA.teams[role.id];

                if (!team) {
                    return message.reply(
                        "❌ Takım bulunamadı."
                    );
                }

                const before =
                    team.squad.length;

                team.squad =
                    team.squad.filter(
                        p =>
                            p.userId !==
                            target.id
                    );

                if (
                    before ===
                    team.squad.length
                ) {
                    return message.reply(
                        "❌ Oyuncu bu takımda bulunamadı."
                    );
                }

                saveData();

                return message.reply(
                    `✅ ${target} kadrodan çıkarıldı.`
                );
            }

            /* =====================
               SQUAD
            ===================== */

            if (
                command === "kadro"
            ) {
                const role =
                    getTeamByMention(
                        message
                    );

                if (!role) {
                    return message.reply(
                        "❌ Kullanım: `.kadro @Takım`"
                    );
                }

                const team =
                    DATA.teams[role.id];

                if (!team) {
                    return message.reply(
                        "❌ Takım bulunamadı."
                    );
                }

                const total =
                    teamTotalValue(
                        role.id,
                        message.guild
                    );

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            `📋 ${role.name} KADROSU`
                        )
                        .setDescription(
                            teamSquadText(
                                team,
                                message.guild
                            )
                        )
                        .addFields(
                            {
                                name: "📐 Formasyon",
                                value:
                                    team.formation ||
                                    "4-4-2",
                                inline: true
                            },
                            {
                                name: "👥 Oyuncu",
                                value:
                                    String(
                                        team.squad.length
                                    ),
                                inline: true
                            },
                            {
                                name: "💰 Toplam Değer",
                                value:
                                    `${formatMoney(
                                        total
                                    )}M€`,
                                inline: true
                            }
                        );

                return message.reply({
                    embeds: [embed]
                });
            }

            /* =====================
               FORMATION
            ===================== */

            if (
                command === "formasyon"
            ) {
                if (!isMacYetkilisi(message.member)) {
                    return message.reply(
                        "❌ Bu komutu sadece Maç Yetkilisi kullanabilir."
                    );
                }

                const role =
                    getTeamByMention(
                        message
                    );

                if (!role) {
                    return message.reply(
                        "❌ Kullanım: `.formasyon @Takım`"
                    );
                }

                if (!DATA.teams[role.id]) {
                    return message.reply(
                        "❌ Takım bulunamadı."
                    );
                }

                const menu =
                    new StringSelectMenuBuilder()
                        .setCustomId(
                            `formasyon_${role.id}`
                        )
                        .setPlaceholder(
                            "Formasyon seç"
                        )
                        .addOptions(
                            Object.keys(
                                FORMATIONS
                            ).map(
                                formation => ({
                                    label:
                                        formation,
                                    value:
                                        formation
                                })
                            )
                        );

                return message.reply({
                    content:
                        `📐 **${role.name}** için formasyon seç:`,
                    components: [
                        new ActionRowBuilder()
                            .addComponents(
                                menu
                            )
                    ]
                });
            }

            /* =====================
               MATCH
            ===================== */

            if (
                command === "maç" ||
                command === "mac"
            ) {
                if (!isMacYetkilisi(message.member)) {
                    return message.reply(
                        "❌ Bu komutu sadece Maç Yetkilisi kullanabilir."
                    );
                }

                const roles =
                    message.mentions.roles
                        .first(2);

                if (
                    roles.length < 2
                ) {
                    return message.reply(
                        "❌ Kullanım: `.maç @Takım1 @Takım2`"
                    );
                }

                try {
                    await startLiveMatch(
                        message.guild,
                        roles[0],
                        roles[1]
                    );

                    return message.reply(
                        "⚽ Canlı maç başlatıldı!"
                    );
                } catch (err) {
                    return message.reply(
                        `❌ ${err.message}`
                    );
                }
            }

            /* =====================
               FIXTURE ADD
            ===================== */

            if (
                command === "fiksturekle"
            ) {
                if (!isMacYetkilisi(message.member)) {
                    return message.reply(
                        "❌ Bu komutu sadece Maç Yetkilisi kullanabilir."
                    );
                }

                const roles =
                    message.mentions.roles
                        .first(2);

                if (
                    roles.length < 2
                ) {
                    return message.reply(
                        "❌ İki takım belirtmelisin."
                    );
                }

                const raw =
                    message.content
                        .split(/\s+/)
                        .slice(3);

                const date =
                    raw[0];

                const time =
                    raw[1];

                if (
                    !date ||
                    !time
                ) {
                    return message.reply(
                        "❌ Kullanım: `.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`"
                    );
                }

                const timestamp =
                    parseFixtureTimestamp(
                        date,
                        time
                    );

                if (
                    !Number.isFinite(
                        timestamp
                    )
                ) {
                    return message.reply(
                        "❌ Geçersiz tarih veya saat."
                    );
                }

                if (
                    timestamp <=
                    Date.now()
                ) {
                    return message.reply(
                        "❌ Geçmiş bir tarih seçemezsin."
                    );
                }

                const fixture = {
                    id:
                        DATA.nextFixtureId++,
                    team1:
                        roles[0].id,
                    team2:
                        roles[1].id,
                    date,
                    time,
                    timestamp,
                    status:
                        "BEKLIYOR",
                    score1: null,
                    score2: null,
                    startedAt: null,
                    finishedAt: null
                };

                DATA.fixtures.push(
                    fixture
                );

                saveData();

                return message.reply(
                    `📅 Fikstüre eklendi:\n` +
                    `**${roles[0].name} - ${roles[1].name}**\n` +
                    `🗓️ ${date} ${time}\n` +
                    `📌 Durum: **BEKLIYOR**`
                );
            }

            /* =====================
               FIXTURE LIST
            ===================== */

            if (
                command === "fikstür" ||
                command === "fikstur"
            ) {
                const fixtures =
                    [...DATA.fixtures]
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
                    fixtures
                        .slice(0, 25)
                        .map(
                            fixture => {
                                const t1 =
                                    message.guild.roles.cache.get(
                                        fixture.team1
                                    );

                                const t2 =
                                    message.guild.roles.cache.get(
                                        fixture.team2
                                    );

                                return (
                                    `**#${fixture.id}** ` +
                                    `${t1?.name || "Takım"} - ` +
                                    `${t2?.name || "Takım"}\n` +
                                    `🗓️ ${fixture.date} ${fixture.time} — ` +
                                    `**${fixture.status}**`
                                );
                            }
                        )
                        .join("\n\n");

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                "📅 AXERA LEAGUE FİKSTÜR"
                            )
                            .setDescription(
                                lines
                            )
                    ]
                });
            }

            /* =====================
               FIXTURE REMOVE
            ===================== */

            if (
                command === "fiksturcikar"
            ) {
                if (!isMacYetkilisi(message.member)) {
                    return message.reply(
                        "❌ Bu komutu sadece Maç Yetkilisi kullanabilir."
                    );
                }

                const roles =
                    message.mentions.roles
                        .first(2);

                if (
                    roles.length < 2
                ) {
                    return message.reply(
                        "❌ Kullanım: `.fiksturcikar @Takım1 @Takım2`"
                    );
                }

                const index =
                    DATA.fixtures.findIndex(
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
                        "❌ Bekleyen fikstür bulunamadı."
                    );
                }

                DATA.fixtures.splice(
                    index,
                    1
                );

                saveData();

                return message.reply(
                    "✅ Fikstür kaldırıldı."
                );
            }

            /* =====================
               CUP
            ===================== */

            if (
                command === "kupaekle"
            ) {
                if (!isMacYetkilisi(message.member)) {
                    return message.reply(
                        "❌ Bu komutu sadece Maç Yetkilisi kullanabilir."
                    );
                }

                const role =
                    message.mentions.roles.first();

                const cupName =
                    args
                        .filter(
                            a =>
                                !a.startsWith("<@&")
                        )
                        .join(" ")
                        .trim();

                if (
                    !role ||
                    !cupName
                ) {
                    return message.reply(
                        "❌ Kullanım: `.kupaekle @Takım KupaAdı`"
                    );
                }

                if (
                    !DATA.cups[role.id]
                ) {
                    DATA.cups[role.id] = [];
                }

                DATA.cups[
                    role.id
                ].push({
                    name: cupName,
                    date:
                        new Date().toISOString()
                });

                saveData();

                return message.reply(
                    `🏆 **${cupName}** kupası ${role.name} müzesine eklendi.`
                );
            }

            if (
                command === "kupasil"
            ) {
                if (!isMacYetkilisi(message.member)) {
                    return message.reply(
                        "❌ Bu komutu sadece Maç Yetkilisi kullanabilir."
                    );
                }

                const role =
                    message.mentions.roles.first();

                const cupName =
                    args
                        .filter(
                            a =>
                                !a.startsWith("<@&")
                        )
                        .join(" ")
                        .trim();

                if (
                    !role ||
                    !cupName
                ) {
                    return message.reply(
                        "❌ Kullanım: `.kupasil @Takım KupaAdı`"
                    );
                }

                const cups =
                    DATA.cups[role.id] || [];

                const index =
                    cups.findIndex(
                        c =>
                            normalizeText(
                                c.name
                            ) ===
                            normalizeText(
                                cupName
                            )
                    );

                if (index === -1) {
                    return message.reply(
                        "❌ Kupa bulunamadı."
                    );
                }

                cups.splice(
                    index,
                    1
                );

                saveData();

                return message.reply(
                    `✅ **${cupName}** kupası silindi.`
                );
            }

            if (
                command === "müze" ||
                command === "muze"
            ) {
                const role =
                    message.mentions.roles.first();

                if (!role) {
                    return message.reply(
                        "❌ Kullanım: `.müze @Takım`"
                    );
                }

                const cups =
                    DATA.cups[role.id] || [];

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                `🏛️ ${role.name} MÜZESİ`
                            )
                            .setDescription(
                                cups.length
                                    ? cups
                                        .map(
                                            (cup, i) =>
                                                `${i + 1}. 🏆 **${cup.name}**`
                                        )
                                        .join("\n")
                                    : "Henüz kupa bulunmuyor."
                            )
                            .setFooter({
                                text:
                                    `Toplam Kupa: ${cups.length}`
                            })
                    ]
                });
            }

            /* =====================
               TWEET
            ===================== */

            if (
                command === "tweet"
            ) {
                const content =
                    args.join(" ").trim();

                if (!content) {
                    return message.reply(
                        "❌ Tweet mesajını yaz."
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
                                    message.author.displayAvatarURL()
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

            /* =====================
               TARGETED DM
            ===================== */

            if (
                command === "dm"
            ) {
                if (!isAdmin(message.member)) {
                    return message.reply(
                        "❌ Bu komut sadece yöneticiye açıktır."
                    );
                }

                const target =
                    message.mentions.members.first();

                if (!target) {
                    return message.reply(
                        "❌ Kullanım: `.dm @Oyuncu mesaj`"
                    );
                }

                const text =
                    args
                        .filter(
                            arg =>
                                !arg.startsWith("<@")
                        )
                        .join(" ")
                        .trim();

                if (!text) {
                    return message.reply(
                        "❌ Gönderilecek mesajı yaz."
                    );
                }

                try {
                    await target.send(
                        text
                    );

                    return message.reply(
                        `✅ ${target} kişisine DM gönderildi.`
                    );
                } catch {
                    return message.reply(
                        "❌ Oyuncunun DM'leri kapalı olabilir."
                    );
                }
            }

            /* =====================
               TICKET PANEL
            ===================== */

            if (
                command === "ticketpanel"
            ) {
                if (!isAdmin(message.member)) {
                    return message.reply(
                        "❌ Bu komut sadece yöneticiye açıktır."
                    );
                }

                const button =
                    new ButtonBuilder()
                        .setCustomId(
                            "ticket_olustur"
                        )
                        .setLabel(
                            "Destek Talebi Oluştur"
                        )
                        .setEmoji("🎫")
                        .setStyle(
                            ButtonStyle.Primary
                        );

                return message.channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                "🎫 AXERA LEAGUE DESTEK"
                            )
                            .setDescription(
                                "Destek almak için aşağıdaki butona bas."
                            )
                    ],
                    components: [
                        new ActionRowBuilder()
                            .addComponents(
                                button
                            )
                    ]
                });
            }

            /* =====================
               DELETE MESSAGES
            ===================== */

            if (
                command === "sil"
            ) {
                if (!isAdmin(message.member)) {
                    return message.reply(
                        "❌ Bu komut sadece yöneticiye açıktır."
                    );
                }

                const amount =
                    Number(args[0]);

                if (
                    !Number.isInteger(
                        amount
                    ) ||
                    amount < 1 ||
                    amount > 1000
                ) {
                    return message.reply(
                        "❌ 1-1000 arasında sayı yaz."
                    );
                }

                await message.channel.bulkDelete(
                    amount,
                    true
                );

                const msg =
                    await message.channel.send(
                        `🗑️ **${amount}** mesaj silindi.`
                    );

                setTimeout(
                    () =>
                        msg.delete().catch(
                            () => {}
                        ),
                    3000
                );

                return;
            }

            /* =====================
               EMBED
            ===================== */

            if (
                command === "embed"
            ) {
                if (!isAdmin(message.member)) {
                    return message.reply(
                        "❌ Bu komut sadece yöneticiye açıktır."
                    );
                }

                const text =
                    args.join(" ");

                const parts =
                    text.split("|");

                const title =
                    parts[0]?.trim();

                const description =
                    parts
                        .slice(1)
                        .join("|")
                        .trim();

                if (
                    !title ||
                    !description
                ) {
                    return message.reply(
                        "❌ Kullanım: `.embed Başlık | Açıklama`"
                    );
                }

                return message.channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                title
                            )
                            .setDescription(
                                description
                            )
                            .setTimestamp()
                    ]
                });
            }

            /* =====================
               KICK
            ===================== */

            if (
                command === "kick"
            ) {
                if (!isAdmin(message.member)) {
                    return message.reply(
                        "❌ Bu komut sadece yöneticiye açıktır."
                    );
                }

                const target =
                    message.mentions.members.first();

                if (!target) {
                    return message.reply(
                        "❌ Oyuncu belirt."
                    );
                }

                await target.kick();

                return message.reply(
                    `👢 ${target.user.tag} sunucudan atıldı.`
                );
            }

            /* =====================
               BAN
            ===================== */

            if (
                command === "ban"
            ) {
                if (!isAdmin(message.member)) {
                    return message.reply(
                        "❌ Bu komut sadece yöneticiye açıktır."
                    );
                }

                const target =
                    message.mentions.members.first();

                if (!target) {
                    return message.reply(
                        "❌ Oyuncu belirt."
                    );
                }

                await target.ban();

                return message.reply(
                    `🔨 ${target.user.tag} yasaklandı.`
                );
            }

            /* =====================
               MUTE
            ===================== */

            if (
                command === "mute"
            ) {
                if (!isAdmin(message.member)) {
                    return message.reply(
                        "❌ Bu komut sadece yöneticiye açıktır."
                    );
                }

                const target =
                    message.mentions.members.first();

                if (!target) {
                    return message.reply(
                        "❌ Oyuncu belirt."
                    );
                }

                await target.timeout(
                    10 * 60 * 1000
                );

                return message.reply(
                    `🔇 ${target} **10 dakika** susturuldu.`
                );
            }

            /* =====================
               UNMUTE
            ===================== */

            if (
                command === "unmute"
            ) {
                if (!isAdmin(message.member)) {
                    return message.reply(
                        "❌ Bu komut sadece yöneticiye açıktır."
                    );
                }

                const target =
                    message.mentions.members.first();

                if (!target) {
                    return message.reply(
                        "❌ Oyuncu belirt."
                    );
                }

                await target.timeout(
                    null
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

            try {
                if (!message.replied) {
                    await message.reply(
                        "❌ İşlem sırasında bir hata oluştu."
                    );
                }
            } catch {}
        }
    }
);

/* =========================
   INTERACTIONS
========================= */

client.on(
    "interactionCreate",
    async interaction => {
        try {
            if (
                interaction.isButton()
            ) {
                if (
                    interaction.customId ===
                    "ticket_olustur"
                ) {
                    return createTicket(
                        interaction
                    );
                }
            }

            if (
                interaction.isStringSelectMenu()
            ) {
                const id =
                    interaction.customId;

                /* REGISTRATION ROLE */

                if (
                    id.startsWith(
                        "kayit_rol_"
                    )
                ) {
                    const parts =
                        id.split("_");

                    const targetId =
                        parts[2];

                    const creatorId =
                        parts[3];

                    if (
                        interaction.user.id !==
                        creatorId
                    ) {
                        return interaction.reply({
                            content:
                                "❌ Bu kayıt panelini sadece paneli oluşturan yetkili kullanabilir.",
                            ephemeral: true
                        });
                    }

                    const target =
                        await interaction.guild.members.fetch(
                            targetId
                        );

                    const selected =
                        interaction.values[0];

                    const removeRoles = [
                        CONFIG.roles.kayitsiz,
                        CONFIG.roles.futbolcu,
                        CONFIG.roles.kaleci,
                        CONFIG.roles.teknikDirektor
                    ];

                    await target.roles.remove(
                        removeRoles
                    );

                    let selectedRole;

                    if (
                        selected ===
                        "futbolcu"
                    ) {
                        selectedRole =
                            CONFIG.roles.futbolcu;
                    }

                    if (
                        selected ===
                        "kaleci"
                    ) {
                        selectedRole =
                            CONFIG.roles.kaleci;
                    }

                    if (
                        selected ===
                        "teknikDirektor"
                    ) {
                        selectedRole =
                            CONFIG.roles.teknikDirektor;
                    }

                    await target.roles.add(
                        selectedRole
                    );

                    const panel =
                        DATA.registrationPanels[
                            targetId
                        ];

                    if (panel?.nickname) {
                        if (
                            panel.nickname.length <=
                            32
                        ) {
                            await target.setNickname(
                                panel.nickname
                            );
                        }
                    }

                    delete DATA.registrationPanels[
                        targetId
                    ];

                    saveData();

                    return interaction.update({
                        content:
                            `✅ ${target} başarıyla kaydedildi.\n` +
                            `🎭 Rol: <@&${selectedRole}>`,
                        components: []
                    });
                }

                /* FORMATION */

                if (
                    id.startsWith(
                        "formasyon_"
                    )
                ) {
                    if (
                        !isMacYetkilisi(
                            interaction.member
                        )
                    ) {
                        return interaction.reply({
                            content:
                                "❌ Bu paneli sadece Maç Yetkilisi kullanabilir.",
                            ephemeral: true
                        });
                    }

                    const teamId =
                        id.replace(
                            "formasyon_",
                            ""
                        );

                    const formation =
                        interaction.values[0];

                    if (
                        !DATA.teams[teamId]
                    ) {
                        return interaction.reply({
                            content:
                                "❌ Takım bulunamadı.",
                            ephemeral: true
                        });
                    }

                    DATA.teams[
                        teamId
                    ].formation =
                        formation;

                    DATA.formations[
                        teamId
                    ] = formation;

                    saveData();

                    return interaction.update({
                        content:
                            `✅ Formasyon **${formation}** olarak ayarlandı.`,
                        components: []
                    });
                }
            }
        } catch (err) {
            console.error(
                "Interaction hatası:",
                err
            );

            try {
                if (
                    !interaction.replied &&
                    !interaction.deferred
                ) {
                    await interaction.reply({
                        content:
                            "❌ İşlem sırasında hata oluştu.",
                        ephemeral: true
                    });
                }
            } catch {}
        }
    }
);

/* =========================
   JOIN SYSTEM
========================= */

client.on(
    "guildMemberAdd",
    async member => {
        try {
            await member.roles.add(
                CONFIG.roles.kayitsiz
            );

            const channel =
                member.guild.channels.cache.get(
                    CONFIG.channels.kayit
                );

            if (!channel) return;

            await channel.send(
                `👋 ${member} hoşgeldin sunucumuza!\n` +
                `📋 <@&${CONFIG.roles.kayitYetkilisi}> seninle ilgilenecektir.`
            );
        } catch (err) {
            console.error(
                "Üye giriş sistemi:",
                err
            );
        }
    }
);

/* =========================
   TICKET AUTO CLOSE
========================= */

setInterval(
    async () => {
        const now =
            Date.now();

        for (
            const [channelId, ticket]
            of Object.entries(
                DATA.tickets
            )
        ) {
            if (
                now -
                ticket.lastMessageAt <
                60 * 60 * 1000
            ) {
                continue;
            }

            const channel =
                client.channels.cache.get(
                    channelId
                );

            if (channel) {
                try {
                    await channel.delete(
                        "60 dakika mesaj gelmedi"
                    );
                } catch {}
            }

            delete DATA.tickets[
                channelId
            ];
        }

        saveData();
    },
    60 * 1000
);

/* =========================
   FIXTURE CHECK
========================= */

setInterval(
    async () => {
        for (
            const guild
            of client.guilds.cache.values()
        ) {
            await checkFixtures(
                guild
            );
        }
    },
    1000
);

/* =========================
   READY
========================= */

client.once(
    "ready",
    async () => {
        console.log(
            `✅ Axera League aktif: ${client.user.tag}`
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

        for (
            const guild
            of client.guilds.cache.values()
        ) {
            try {
                await guild.members.fetch();

                await updateStandingsMessage(
                    guild
                );

                await checkFixtures(
                    guild
                );
            } catch (err) {
                console.error(
                    "Guild başlangıç işlemi:",
                    err
                );
            }
        }
    }
);

/* =========================
   ERROR HANDLERS
========================= */

process.on(
    "unhandledRejection",
    err => {
        console.error(
            "Unhandled Rejection:",
            err
        );
    }
);

process.on(
    "uncaughtException",
    err => {
        console.error(
            "Uncaught Exception:",
            err
        );
    }
);

/* =========================
   LOGIN
========================= */

if (!process.env.TOKEN) {
    console.error(
        "❌ TOKEN bulunamadı! Railway Variables kısmına TOKEN ekle."
    );

    process.exit(1);
}

client.login(
    process.env.TOKEN
);
