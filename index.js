const {
    Client,
    GatewayIntentBits,
    Partials,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder
} = require("discord.js");

const fs = require("fs");
const path = require("path");

/* =========================================================
   AXERA LEAGUE BOT
   ========================================================= */

const TOKEN =
    process.env.TOKEN ||
    "BURAYA_BOT_TOKENINI_YAZ";

/* =========================================================
   ROLLER
   ========================================================= */

const ROLE = {
    FUTBOLCU: "1534457228986421278",
    KALECI: "1534492034243498195",
    KAYITSIZ: "1534457560134844517",
    TEKNIK_DIREKTOR: "1534456648930693120",

    KAYIT_YETKILI: "1534456315366342716",
    DEGER_YETKILI: "1534456192913375382",
    MAC_YETKILI: "1535251168169697390"
};

/* =========================================================
   KANALLAR
   ========================================================= */

const CHANNEL = {
    KAYIT: "1534460177884123276",
    SOHBET: "1534469475917758586",
    ANTRENMAN: "1534474070798762197",
    PENALTI: "1534474327812997192",
    MAC: "1534477626872168541",
    PUAN: "1534475991404253284"
};

/* =========================================================
   MAÇ AYARLARI
   3 GERÇEK SANİYE = 1 MAÇ DAKİKASI
   ========================================================= */

const REAL_SECONDS_PER_GAME_MINUTE = 3;
const MATCH_TICK = 3000;
const MATCH_DURATION = 90 * MATCH_TICK;

const TIME_ZONE = "Europe/Istanbul";

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
        Partials.User
    ]
});

/* =========================================================
   DATA
   ========================================================= */

const DATA_FILE = path.join(__dirname, "data.json");

const DEFAULT_DATA = {
    users: {},
    registrations: {},
    teams: {},
    fixtures: [],
    standings: {},
    activeMatches: {}
};

function loadData() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            fs.writeFileSync(
                DATA_FILE,
                JSON.stringify(DEFAULT_DATA, null, 2)
            );

            return JSON.parse(
                JSON.stringify(DEFAULT_DATA)
            );
        }

        const parsed = JSON.parse(
            fs.readFileSync(DATA_FILE, "utf8")
        );

        parsed.users ||= {};
        parsed.registrations ||= {};
        parsed.teams ||= {};
        parsed.fixtures ||= [];
        parsed.standings ||= {};
        parsed.activeMatches ||= {};

        return parsed;
    } catch (error) {
        console.error(
            "data.json hatası:",
            error
        );

        return JSON.parse(
            JSON.stringify(DEFAULT_DATA)
        );
    }
}

let data = loadData();

function saveData() {
    try {
        fs.writeFileSync(
            DATA_FILE,
            JSON.stringify(data, null, 2)
        );
    } catch (error) {
        console.error(
            "data.json kaydedilemedi:",
            error
        );
    }
}

/* =========================================================
   GENEL
   ========================================================= */

function ensureUser(id) {
    if (!data.users[id]) {
        data.users[id] = {
            value: 0,
            training: 0
        };
    }

    data.users[id].value =
        Number(data.users[id].value) || 0;

    data.users[id].training =
        Number(data.users[id].training) || 0;

    return data.users[id];
}

function hasRole(member, roleId) {
    return Boolean(
        member?.roles?.cache?.has(roleId)
    );
}

function parseAmount(value) {
    if (
        value === undefined ||
        value === null
    ) {
        return null;
    }

    const n = Number(
        String(value)
            .replace(",", ".")
            .replace(/[^0-9.-]/g, "")
    );

    return Number.isFinite(n)
        ? n
        : null;
}

function money(value) {
    const n = Number(value) || 0;

    return Number.isInteger(n)
        ? `${n}M€`
        : `${Number(n.toFixed(2))}M€`;
}

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

/* =========================================================
   OYUNCU DEĞERİ
   ========================================================= */

function getNicknameValue(nickname) {
    if (!nickname) return null;

    const match =
        String(nickname).match(
            /([0-9]+(?:\.[0-9]+)?)M€$/i
        );

    return match
        ? Number(match[1])
        : null;
}

function replaceNicknameValue(
    nickname,
    newValue
) {
    if (
        !/([0-9]+(?:\.[0-9]+)?)M€$/i.test(
            nickname
        )
    ) {
        return null;
    }

    return nickname.replace(
        /([0-9]+(?:\.[0-9]+)?)M€$/i,
        money(newValue)
    );
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

function normalizePosition(position) {
    if (!position) return null;

    const p =
        String(position)
            .trim()
            .toLocaleUpperCase("tr-TR");

    const aliases = {
        GK: "KL",
        KALECI: "KL",
        KALECİ: "KL",

        CB: "STP",
        STOPER: "STP",

        RB: "SĞB",
        SAGBEK: "SĞB",
        SAĞBEK: "SĞB",

        LB: "SLB",
        SOLBEK: "SLB",

        CM: "MO",
        DM: "MO",
        ORTASAHA: "MO",
        "ORTA SAHA": "MO",

        CAM: "MOO",
        "OFANSIF ORTA": "MOO",
        OFANSIFORTA: "MOO",

        RW: "SĞK",
        SAGKANAT: "SĞK",
        SAĞKANAT: "SĞK",

        LW: "SLK",
        SOLKANAT: "SLK",

        ST: "SNT",
        FORVET: "SNT"
    };

    return POSITIONS.includes(p)
        ? p
        : aliases[p] || null;
}

/* =========================================================
   FORMASYONLAR
   ========================================================= */

const FORMATIONS = [
    "4-3-3",
    "4-2-3-1",
    "4-4-2",
    "3-5-2",
    "3-4-3",
    "5-3-2",
    "5-4-1"
];

/* =========================================================
   TAKIM
   ========================================================= */

function ensureTeam(role) {
    if (!role) return null;

    if (!data.teams[role.id]) {
        data.teams[role.id] = {
            id: role.id,
            name: role.name,
            formation: "4-3-3",
            players: {},
            value: 0
        };
    }

    const team = data.teams[role.id];

    team.name = role.name;
    team.players ||= {};
    team.formation ||= "4-3-3";

    return team;
}

function getMentionedTeam(message) {
    const role =
        message.mentions.roles.first();

    if (!role) return null;

    return ensureTeam(role);
}

/* =========================================================
   TAKIM DEĞERİ SENKRONİZASYONU
   ========================================================= */

function syncTeamValue(
    guild,
    team
) {
    if (!team) return 0;

    let total = 0;

    for (
        const playerId of Object.keys(
            team.players || {}
        )
    ) {
        const member =
            guild.members.cache.get(
                playerId
            );

        if (!member) continue;

        const nickname =
            member.nickname ||
            member.user.globalName ||
            member.user.username;

        const value =
            getNicknameValue(nickname);

        if (value !== null) {
            total += value;
        }
    }

    team.value =
        Number(total.toFixed(2));

    return team.value;
}

function syncAllTeams(guild) {
    for (
        const team of Object.values(
            data.teams
        )
    ) {
        syncTeamValue(guild, team);
    }

    saveData();
}

/* =========================================================
   KADRO
   ========================================================= */

function getTeamPlayers(
    guild,
    team
) {
    const players = [];

    for (
        const [id, info] of Object.entries(
            team.players || {}
        )
    ) {
        const member =
            guild.members.cache.get(id);

        if (!member) continue;

        const nickname =
            member.nickname ||
            member.user.globalName ||
            member.user.username;

        players.push({
            id,
            member,
            name: nickname,
            position: info.position,
            value:
                getNicknameValue(
                    nickname
                ) ?? 0
        });
    }

    return players;
}

function groupedPlayers(
    guild,
    team
) {
    const grouped = {};

    for (const p of POSITIONS) {
        grouped[p] = [];
    }

    for (
        const player of getTeamPlayers(
            guild,
            team
        )
    ) {
        if (!grouped[player.position]) {
            grouped[player.position] = [];
        }

        grouped[player.position].push(
            player
        );
    }

    return grouped;
}

/* =========================================================
   İLK 11
   ========================================================= */

function getStartingXI(
    guild,
    team
) {
    const players =
        getTeamPlayers(
            guild,
            team
        );

    const grouped =
        groupedPlayers(
            guild,
            team
        );

    const formation =
        team.formation || "4-3-3";

    const requirements = {
        "4-3-3": {
            def: 4,
            mid: 3,
            wing: 2,
            st: 1
        },

        "4-2-3-1": {
            def: 4,
            mid: 3,
            wing: 2,
            st: 1
        },

        "4-4-2": {
            def: 4,
            mid: 2,
            wing: 2,
            st: 2
        },

        "3-5-2": {
            def: 3,
            mid: 3,
            wing: 2,
            st: 2
        },

        "3-4-3": {
            def: 3,
            mid: 2,
            wing: 2,
            st: 3
        },

        "5-3-2": {
            def: 5,
            mid: 3,
            wing: 0,
            st: 2
        },

        "5-4-1": {
            def: 5,
            mid: 2,
            wing: 2,
            st: 1
        }
    };

    const req =
        requirements[formation] ||
        requirements["4-3-3"];

    const selected = [];
    const used = new Set();

    const take = (
        positionList,
        amount
    ) => {
        let count = 0;

        for (
            const position of positionList
        ) {
            for (
                const player of
                grouped[position] || []
            ) {
                if (count >= amount) {
                    break;
                }

                if (used.has(player.id)) {
                    continue;
                }

                used.add(player.id);
                selected.push(player);
                count++;
            }
        }

        return count;
    };

    if (!grouped.KL?.length) {
        return {
            valid: false,
            players,
            reason:
                "KL pozisyonunda kaleci yok."
        };
    }

    take(["KL"], 1);

    const defCount =
        take(
            ["STP", "SLB", "SĞB"],
            req.def
        );

    if (defCount < req.def) {
        return {
            valid: false,
            players: selected,
            reason:
                `İlk 11 için ${req.def} savunma oyuncusu gerekiyor.`
        };
    }

    const midCount =
        take(
            ["MO", "MOO"],
            req.mid
        );

    if (midCount < req.mid) {
        return {
            valid: false,
            players: selected,
            reason:
                "Orta saha yetersiz."
        };
    }

    const wingCount =
        take(
            ["SLK", "SĞK"],
            req.wing
        );

    if (wingCount < req.wing) {
        return {
            valid: false,
            players: selected,
            reason:
                "Kanat oyuncusu yetersiz."
        };
    }

    const strikerCount =
        take(
            ["SNT"],
            req.st
        );

    if (strikerCount < req.st) {
        return {
            valid: false,
            players: selected,
            reason:
                "Forvet oyuncusu yetersiz."
        };
    }

    return {
        valid:
            selected.length === 11,
        players: selected,
        reason:
            selected.length === 11
                ? null
                : "İlk 11 tamamlanamadı."
    };
}

/* =========================================================
   PUAN DURUMU
   ========================================================= */

function ensureStanding(
    teamId,
    teamName
) {
    if (!data.standings[teamId]) {
        data.standings[teamId] = {
            id: teamId,
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

    return data.standings[teamId];
}

function sortStandings() {
    return Object.values(
        data.standings
    ).sort((a, b) => {
        if (b.P !== a.P) {
            return b.P - a.P;
        }

        if (b.AV !== a.AV) {
            return b.AV - a.AV;
        }

        if (b.AG !== a.AG) {
            return b.AG - a.AG;
        }

        return a.name.localeCompare(
            b.name,
            "tr"
        );
    });
}

function standingsEmbed() {
    const standings =
        sortStandings();

    const embed = new EmbedBuilder()
        .setTitle(
            "📊 AXERA LEAGUE • PUAN DURUMU"
        )
        .setDescription(
            standings.length
                ? "Lig sıralaması"
                : "Puan durumunda takım bulunmuyor."
        )
        .setTimestamp()
        .setFooter({
            text:
                "Axera League • Puan Durumu"
        });

    if (!standings.length) {
        return embed;
    }

    let text = "";

    standings.forEach(
        (team, index) => {
            let medal;

            if (index === 0) {
                medal = "🥇";
            } else if (index === 1) {
                medal = "🥈";
            } else if (index === 2) {
                medal = "🥉";
            } else {
                medal =
                    `**${index + 1}.**`;
            }

            text +=
                `${medal} **${team.name}** — **${team.P} P**\n` +
                `> O: ${team.O} • G: ${team.G} • B: ${team.B} • M: ${team.M}\n` +
                `> AG: ${team.AG} • YG: ${team.YG} • AV: ${team.AV >= 0 ? "+" : ""}${team.AV}\n\n`;
        }
    );

    embed.addFields({
        name: "🏆 Sıralama",
        value:
            text.slice(0, 1024)
    });

    return embed;
}

async function sendStandings(
    guild
) {
    const channel =
        guild.channels.cache.get(
            CHANNEL.PUAN
        );

    if (
        !channel ||
        !channel.isTextBased()
    ) {
        return;
    }

    await channel.send({
        embeds: [
            standingsEmbed()
        ]
    }).catch(() => {});
}

function applyResult(
    home,
    away,
    homeGoals,
    awayGoals
) {
    const h =
        ensureStanding(
            home.id,
            home.name
        );

    const a =
        ensureStanding(
            away.id,
            away.name
        );

    h.O++;
    a.O++;

    h.AG += homeGoals;
    h.YG += awayGoals;

    a.AG += awayGoals;
    a.YG += homeGoals;

    h.AV = h.AG - h.YG;
    a.AV = a.AG - a.YG;

    if (homeGoals > awayGoals) {
        h.G++;
        h.P += 3;
        a.M++;
    } else if (
        awayGoals > homeGoals
    ) {
        a.G++;
        a.P += 3;
        h.M++;
    } else {
        h.B++;
        a.B++;
        h.P++;
        a.P++;
    }

    saveData();
}

/* =========================================================
   KADRO EMBED
   ========================================================= */

function squadEmbed(
    guild,
    team
) {
    syncTeamValue(
        guild,
        team
    );

    const grouped =
        groupedPlayers(
            guild,
            team
        );

    const all =
        getTeamPlayers(
            guild,
            team
        );

    const embed = new EmbedBuilder()
        .setTitle(
            `🏟️ ${team.name} • KADRO`
        )
        .setDescription(
            `📐 **Formasyon:** \`${team.formation}\`\n` +
            `💰 **Takım Değeri:** \`${money(team.value)}\`\n` +
            `👥 **Oyuncu Sayısı:** \`${all.length}\``
        )
        .setTimestamp()
        .setFooter({
            text:
                "Axera League • Kadro"
        });

    const addField = (
        title,
        positions
    ) => {
        const lines = [];

        for (
            const position of positions
        ) {
            for (
                const player of
                grouped[position] || []
            ) {
                lines.push(
                    `\`${position}\` ${player.member} — \`${money(player.value)}\``
                );
            }
        }

        embed.addFields({
            name: title,
            value:
                lines.length
                    ? lines.join("\n").slice(
                        0,
                        1024
                    )
                    : "—"
        });
    };

    addField(
        "🧤 KALECİ",
        ["KL"]
    );

    addField(
        "🛡️ DEFANS",
        ["SLB", "STP", "SĞB"]
    );

    addField(
        "⚙️ ORTA SAHA",
        ["MO", "MOO"]
    );

    addField(
        "⚡ HÜCUM",
        ["SLK", "SNT", "SĞK"]
    );

    return embed;
}

/* =========================================================
   FORMASYON MENÜSÜ
   ========================================================= */

function formationRow(
    teamId
) {
    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                `formation:${teamId}`
            )
            .setPlaceholder(
                "📐 Formasyon seç"
            )
            .addOptions(
                FORMATIONS.map(
                    formation => ({
                        label: formation,
                        value: formation,
                        description:
                            `${formation} formasyonunu seç`
                    })
                )
            );

    return new ActionRowBuilder()
        .addComponents(menu);
}

/* =========================================================
   OYUNCU ARAMA
   ========================================================= */

function findClosest(
    guild,
    query
) {
    let best = null;
    let bestScore = 0;

    for (
        const member of
        guild.members.cache.values()
    ) {
        if (member.user.bot) {
            continue;
        }

        const nickname =
            member.nickname ||
            member.user.globalName ||
            member.user.username;

        const a = normalize(query);
        const b = normalize(nickname);

        let score = 0;

        if (a === b) {
            score = 1;
        } else if (
            b.includes(a) ||
            a.includes(b)
        ) {
            score = 0.85;
        } else {
            const distance =
                levenshtein(a, b);

            score =
                1 -
                distance /
                Math.max(
                    a.length,
                    b.length,
                    1
                );
        }

        if (score > bestScore) {
            bestScore = score;
            best = member;
        }
    }

    if (bestScore < 0.45) {
        return null;
    }

    return best;
}

function levenshtein(
    a,
    b
) {
    const matrix = [];

    for (
        let i = 0;
        i <= b.length;
        i++
    ) {
        matrix[i] = [i];
    }

    for (
        let j = 0;
        j <= a.length;
        j++
    ) {
        matrix[0][j] = j;
    }

    for (
        let i = 1;
        i <= b.length;
        i++
    ) {
        for (
            let j = 1;
            j <= a.length;
            j++
        ) {
            matrix[i][j] =
                b[i - 1] ===
                a[j - 1]
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

/* =========================================================
   MAÇ OLAYLARI
   ========================================================= */

function random(array) {
    if (!array?.length) {
        return null;
    }

    return array[
        Math.floor(
            Math.random() *
            array.length
        )
    ];
}

function attacker(players) {
    return random(
        players.filter(
            p =>
                [
                    "SNT",
                    "SLK",
                    "SĞK",
                    "MOO"
                ].includes(p.position)
        )
    ) || random(players);
}

function midfielder(players) {
    return random(
        players.filter(
            p =>
                [
                    "MO",
                    "MOO"
                ].includes(p.position)
        )
    ) || random(players);
}

function defender(players) {
    return random(
        players.filter(
            p =>
                [
                    "STP",
                    "SLB",
                    "SĞB"
                ].includes(p.position)
        )
    ) || random(players);
}

function goalkeeper(players) {
    return random(
        players.filter(
            p => p.position === "KL"
        )
    );
}

/* =========================================================
   TAKIM GÜCÜ
   ========================================================= */

function teamStrength(
    guild,
    team
) {
    syncTeamValue(
        guild,
        team
    );

    /*
      Takım değeri sadece küçük
      avantaj sağlar.
    */

    const value =
        Number(team.value) || 0;

    return (
        1 +
        Math.min(
            0.08,
            Math.log10(
                value + 10
            ) / 120
        )
    );
}

/* =========================================================
   MAÇ OLAYI
   ========================================================= */

function matchEvent(
    match
) {
    const home =
        match.home.players;

    const away =
        match.away.players;

    const homeAttack =
        attacker(home);

    const awayAttack =
        attacker(away);

    const homeMid =
        midfielder(home);

    const awayMid =
        midfielder(away);

    const homeDef =
        defender(home);

    const awayDef =
        defender(away);

    const homeGK =
        goalkeeper(home);

    const awayGK =
        goalkeeper(away);

    const r = Math.random();

    /*
      GOL ORANI DÜŞÜK.
    */

    const attackingHome =
        Math.random() < 0.5;

    const team =
        attackingHome
            ? match.home
            : match.away;

    const opponent =
        attackingHome
            ? match.away
            : match.home;

    const shooter =
        attackingHome
            ? homeAttack
            : awayAttack;

    const gk =
        attackingHome
            ? awayGK
            : homeGK;

    const attackStrength =
        team.strength;

    const defenceStrength =
        opponent.strength;

    /*
      Yaklaşık düşük gol ihtimali.
    */

    const goalChance =
        0.045 *
        attackStrength /
        Math.max(
            0.9,
            defenceStrength
        );

    if (
        shooter &&
        gk &&
        Math.random() <
        goalChance
    ) {
        if (attackingHome) {
            match.home.goals++;
            match.home.scorers.push(
                shooter.name
            );
        } else {
            match.away.goals++;
            match.away.scorers.push(
                shooter.name
            );
        }

        return (
            `⚽ **GOOOL!** ${shooter.name} ` +
            `şutunu çekti ve top ağlarla buluştu! ` +
            `🧤 **${gk.name}** gole engel olamadı.`
        );
    }

    if (r < 0.25) {
        if (
            shooter &&
            gk
        ) {
            return (
                `🎯 **${shooter.name}** şutunu çekti! ` +
                `🧤 **${gk.name}** kurtardı!`
            );
        }
    }

    if (r < 0.40) {
        if (
            shooter &&
            gk
        ) {
            return (
                `🥅 **${shooter.name}** kaleyi yokladı! ` +
                `Top direkten döndü.`
            );
        }
    }

    if (r < 0.55) {
        if (
            homeAttack &&
            awayDef
        ) {
            return (
                `⚡ **${homeAttack.name}** atağa çıktı. ` +
                `🛡️ **${awayDef.name}** müdahale etti.`
            );
        }

        if (
            awayAttack &&
            homeDef
        ) {
            return (
                `⚡ **${awayAttack.name}** savunma arkasına sarktı. ` +
                `🛡️ **${homeDef.name}** topu uzaklaştırdı.`
            );
        }
    }

    if (r < 0.68) {
        const player =
            random([
                homeMid,
                awayMid
            ].filter(Boolean));

        if (player) {
            return (
                `🎯 **${player.name}** orta sahada topu kazandı ` +
                `ve takımını ileri taşıdı.`
            );
        }
    }

    if (r < 0.77) {
        const player =
            random([
                homeDef,
                awayDef
            ].filter(Boolean));

        if (player) {
            return (
                `🛡️ **${player.name}** kritik bir müdahaleyle ` +
                `rakip atağı kesti.`
            );
        }
    }

    if (r < 0.86) {
        const player =
            random([
                homeMid,
                awayMid,
                homeDef,
                awayDef
            ].filter(Boolean));

        if (player) {
            return (
                `🟨 **${player.name}** faul yaptı. ` +
                `Hakem oyunu durdurdu.`
            );
        }
    }

    if (r < 0.93) {
        const teamName =
            Math.random() < 0.5
                ? match.home.name
                : match.away.name;

        return (
            `🏳️ **${teamName}** korner kazandı. ` +
            `Orta açıldı ancak savunma uzaklaştırdı.`
        );
    }

    return (
        `⚽ Oyun orta sahada devam ediyor. ` +
        `İki takım da yeni bir atak hazırlıyor.`
    );
}

/* =========================================================
   CANLI MAÇ EMBED
   ========================================================= */

function liveMatchEmbed(
    match
) {
    const minute =
        Math.min(
            90,
            Math.max(
                1,
                Math.ceil(
                    match.elapsedSeconds /
                    REAL_SECONDS_PER_GAME_MINUTE
                )
            )
        );

    const embed =
        new EmbedBuilder()
            .setTitle(
                match.finished
                    ? "🏁 AXERA LEAGUE • MAÇ SONUCU"
                    : "⚽ AXERA LEAGUE • CANLI MAÇ"
            )
            .setDescription(
                `🔴 **${match.home.name}** ` +
                `\`${match.home.goals}\` — ` +
                `\`${match.away.goals}\` ` +
                `**${match.away.name}** 🔵`
            )
            .addFields(
                {
                    name: "⏱️ Dakika",
                    value:
                        `**${minute}'**`,
                    inline: true
                },
                {
                    name: "📐 Formasyon",
                    value:
                        `${match.home.name}: \`${match.home.formation}\`\n` +
                        `${match.away.name}: \`${match.away.formation}\``,
                    inline: true
                },
                {
                    name: "🎙️ Maç Anlatımı",
                    value:
                        match.lastEvent ||
                        "Maç başladı."
                }
            )
            .setTimestamp()
            .setFooter({
                text:
                    "Axera League • Canlı Maç"
            });

    return embed;
}

/* =========================================================
   MAÇ BAŞLAT
   ========================================================= */

async function startMatch(
    guild,
    homeRole,
    awayRole,
    fixture = null
) {
    if (
        !homeRole ||
        !awayRole
    ) {
        return false;
    }

    if (
        homeRole.id ===
        awayRole.id
    ) {
        return false;
    }

    /*
      Takım başka aktif maçta mı?
    */

    for (
        const active of
        Object.values(
            data.activeMatches
        )
    ) {
        if (
            active.homeId === homeRole.id ||
            active.awayId === homeRole.id ||
            active.homeId === awayRole.id ||
            active.awayId === awayRole.id
        ) {
            return false;
        }
    }

    const homeTeam =
        ensureTeam(homeRole);

    const awayTeam =
        ensureTeam(awayRole);

    syncTeamValue(
        guild,
        homeTeam
    );

    syncTeamValue(
        guild,
        awayTeam
    );

    /*
      İlk 11
    */

    const homeXI =
        getStartingXI(
            guild,
            homeTeam
        );

    const awayXI =
        getStartingXI(
            guild,
            awayTeam
        );

    const channel =
        guild.channels.cache.get(
            CHANNEL.MAC
        );

    if (
        !channel ||
        !channel.isTextBased()
    ) {
        return false;
    }

    /*
      İKİ TAKIM DA EKSİK
      = MAÇ İPTAL
    */

    if (
        !homeXI.valid &&
        !awayXI.valid
    ) {
        const embed =
            new EmbedBuilder()
                .setTitle(
                    "🚫 MAÇ İPTAL"
                )
                .setDescription(
                    `🔴 **${homeRole.name}**\n` +
                    `❌ ${homeXI.reason}\n\n` +
                    `🔵 **${awayRole.name}**\n` +
                    `❌ ${awayXI.reason}\n\n` +
                    `📌 İki takım da ilk 11'ini tamamlayamadığı için maç oynanmadı.`
                )
                .setTimestamp();

        await channel.send({
            embeds: [embed]
        }).catch(() => {});

        if (fixture) {
            fixture.status = "IPTAL";
            fixture.result =
                "İki takım da eksik";
            fixture.completedAt =
                new Date().toISOString();
        }

        saveData();

        return false;
    }

    /*
      SADECE BİR TAKIM EKSİK
      = 3-0 HÜKMEN
    */

    if (
        !homeXI.valid ||
        !awayXI.valid
    ) {
        const homeWins =
            homeXI.valid;

        const homeGoals =
            homeWins ? 3 : 0;

        const awayGoals =
            homeWins ? 0 : 3;

        const winner =
            homeWins
                ? homeRole.name
                : awayRole.name;

        const loser =
            homeWins
                ? awayRole.name
                : homeRole.name;

        applyResult(
            {
                id: homeRole.id,
                name: homeRole.name
            },
            {
                id: awayRole.id,
                name: awayRole.name
            },
            homeGoals,
            awayGoals
        );

        const embed =
            new EmbedBuilder()
                .setTitle(
                    "🏁 HÜKMEN MAÇ SONUCU"
                )
                .setDescription(
                    `🔴 **${homeRole.name}** \`${homeGoals}\` — \`${awayGoals}\` **${awayRole.name}** 🔵`
                )
                .addFields({
                    name: "📋 Karar",
                    value:
                        `🏆 **${winner}** hükmen kazandı.\n` +
                        `❌ **${loser}** ilk 11'ini tamamlamadı.`
                })
                .setTimestamp();

        await channel.send({
            embeds: [embed]
        }).catch(() => {});

        if (fixture) {
            fixture.status =
                "TAMAMLANDI";

            fixture.homeGoals =
                homeGoals;

            fixture.awayGoals =
                awayGoals;

            fixture.result =
                `${homeGoals}-${awayGoals}`;

            fixture.completedAt =
                new Date().toISOString();
        }

        saveData();

        await sendStandings(
            guild
        );

        return false;
    }

    const matchId =
        `${homeRole.id}-${awayRole.id}-${Date.now()}`;

    const match = {
        id: matchId,
        fixtureId:
            fixture?.id || null,

        home: {
            id: homeRole.id,
            name: homeRole.name,
            formation:
                homeTeam.formation,
            players:
                homeXI.players,
            goals: 0,
            scorers: [],
            strength:
                teamStrength(
                    guild,
                    homeTeam
                )
        },

        away: {
            id: awayRole.id,
            name: awayRole.name,
            formation:
                awayTeam.formation,
            players:
                awayXI.players,
            goals: 0,
            scorers: [],
            strength:
                teamStrength(
                    guild,
                    awayTeam
                )
        },

        elapsedSeconds: 0,
        lastEvent:
            "🟢 Maç başladı!",
        finished: false,
        messageId: null,
        startedAt:
            new Date().toISOString()
    };

    const message =
        await channel.send({
            embeds: [
                liveMatchEmbed(
                    match
                )
            ]
        }).catch(() => null);

    if (!message) {
        return false;
    }

    match.messageId =
        message.id;

    data.activeMatches[
        matchId
    ] = {
        homeId: homeRole.id,
        awayId: awayRole.id,
        startedAt:
            match.startedAt
    };

    if (fixture) {
        fixture.status =
            "CANLI";

        fixture.startedAt =
            new Date().toISOString();
    }

    saveData();

    /*
      CANLI MAÇ
    */

    const timer =
        setInterval(
            async () => {
                try {
                    if (
                        match.finished
                    ) {
                        clearInterval(
                            timer
                        );
                        return;
                    }

                    match.elapsedSeconds +=
                        REAL_SECONDS_PER_GAME_MINUTE;

                    match.lastEvent =
                        matchEvent(
                            match
                        );

                    await message.edit({
                        embeds: [
                            liveMatchEmbed(
                                match
                            )
                        ]
                    }).catch(
                        () => {}
                    );

                    if (
                        match.elapsedSeconds >=
                        MATCH_DURATION
                    ) {
                        clearInterval(
                            timer
                        );

                        await finishMatch(
                            guild,
                            channel,
                            message,
                            match,
                            fixture
                        );
                    }
                } catch (error) {
                    console.error(
                        "Maç döngüsü:",
                        error
                    );

                    clearInterval(
                        timer
                    );
                }
            },
            MATCH_TICK
        );

    return true;
}

/* =========================================================
   MAÇ BİTİR
   ========================================================= */

async function finishMatch(
    guild,
    channel,
    message,
    match,
    fixture
) {
    match.finished = true;

    const homeGoals =
        match.home.goals;

    const awayGoals =
        match.away.goals;

    applyResult(
        {
            id: match.home.id,
            name: match.home.name
        },
        {
            id: match.away.id,
            name: match.away.name
        },
        homeGoals,
        awayGoals
    );

    let result;

    if (
        homeGoals >
        awayGoals
    ) {
        result =
            `🏆 **${match.home.name} kazandı!**`;
    } else if (
        awayGoals >
        homeGoals
    ) {
        result =
            `🏆 **${match.away.name} kazandı!**`;
    } else {
        result =
            "🤝 **Maç berabere bitti!**";
    }

    match.lastEvent =
        result;

    if (fixture) {
        fixture.status =
            "TAMAMLANDI";

        fixture.homeGoals =
            homeGoals;

        fixture.awayGoals =
            awayGoals;

        fixture.result =
            `${homeGoals}-${awayGoals}`;

        fixture.completedAt =
            new Date().toISOString();
    }

    delete data.activeMatches[
        match.id
    ];

    saveData();

    await message.edit({
        embeds: [
            liveMatchEmbed(
                match
            )
        ]
    }).catch(() => {});

    const finishEmbed =
        new EmbedBuilder()
            .setTitle(
                "🏁 MAÇ TAMAMLANDI"
            )
            .setDescription(
                `🔴 **${match.home.name}** ` +
                `\`${homeGoals}\` — \`${awayGoals}\` ` +
                `**${match.away.name}** 🔵`
            )
            .addFields(
                {
                    name: "🏆 Sonuç",
                    value: result
                },
                {
                    name: "⚽ Golcüler",
                    value:
                        `🔴 ${match.home.scorers.length
                            ? match.home.scorers.join(", ")
                            : "Gol yok"}\n` +
                        `🔵 ${match.away.scorers.length
                            ? match.away.scorers.join(", ")
                            : "Gol yok"}`
                }
            )
            .setTimestamp()
            .setFooter({
                text:
                    "Axera League • Maç Sonucu"
            });

    await channel.send({
        embeds: [finishEmbed]
    }).catch(() => {});

    /*
      MAÇ BİTTİĞİNDE PUAN KANALINA
      OTOMATİK EMBED
    */

    await sendStandings(
        guild
    );
}

/* =========================================================
   TARİH / SAAT
   ========================================================= */

function dateParts() {
    const parts =
        new Intl.DateTimeFormat(
            "tr-TR",
            {
                timeZone: TIME_ZONE,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false
            }
        ).formatToParts(
            new Date()
        );

    const result = {};

    for (const p of parts) {
        result[p.type] =
            p.value;
    }

    return result;
}

function currentDate() {
    const p =
        dateParts();

    return (
        `${p.day}.${p.month}.${p.year}`
    );
}

function currentTime() {
    const p =
        dateParts();

    return (
        `${p.hour}:${p.minute}`
    );
}

function validDate(value) {
    const match =
        String(value || "").match(
            /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/
        );

    if (!match) {
        return null;
    }

    const d =
        Number(match[1]);

    const m =
        Number(match[2]);

    const y =
        Number(match[3]);

    if (
        d < 1 ||
        d > 31 ||
        m < 1 ||
        m > 12
    ) {
        return null;
    }

    return (
        `${String(d).padStart(2, "0")}.` +
        `${String(m).padStart(2, "0")}.` +
        `${y}`
    );
}

function validTime(value) {
    const match =
        String(value || "").match(
            /^(\d{1,2}):(\d{2})$/
        );

    if (!match) {
        return null;
    }

    const h =
        Number(match[1]);

    const m =
        Number(match[2]);

    if (
        h < 0 ||
        h > 23 ||
        m < 0 ||
        m > 59
    ) {
        return null;
    }

    return (
        `${String(h).padStart(2, "0")}:` +
        `${String(m).padStart(2, "0")}`
    );
}

/* =========================================================
   FİKSTÜR
   ========================================================= */

function fixtureEmbed() {
    const fixtures =
        [...data.fixtures].sort(
            (a, b) =>
                `${a.date} ${a.time}`.localeCompare(
                    `${b.date} ${b.time}`
                )
        );

    const embed =
        new EmbedBuilder()
            .setTitle(
                "📅 AXERA LEAGUE • FİKSTÜR"
            )
            .setTimestamp()
            .setFooter({
                text:
                    "Axera League • Fikstür"
            });

    if (!fixtures.length) {
        embed.setDescription(
            "Henüz fikstür bulunmuyor."
        );

        return embed;
    }

    for (
        const fixture of
        fixtures.slice(0, 20)
    ) {
        const status =
            fixture.status ===
            "TAMAMLANDI"
                ? "✅"
                : fixture.status ===
                    "CANLI"
                    ? "🔴"
                    : fixture.status ===
                        "IPTAL"
                        ? "❌"
                        : "🟡";

        let score = "";

        if (
            fixture.status ===
            "TAMAMLANDI"
        ) {
            score =
                `\n🏁 Skor: **${fixture.homeGoals}-${fixture.awayGoals}**`;
        }

        embed.addFields({
            name:
                `${status} ${fixture.homeName} 🆚 ${fixture.awayName}`,
            value:
                `📅 ${fixture.date} • 🕐 ${fixture.time}\n` +
                `Durum: **${fixture.status || "BEKLİYOR"}**` +
                score
        });
    }

    return embed;
}

/* =========================================================
   OTOMATİK FİKSTÜR KONTROLÜ
   ========================================================= */

let fixtureCheckBusy = false;

async function checkFixtures() {
    if (fixtureCheckBusy) {
        return;
    }

    fixtureCheckBusy = true;

    try {
        const today =
            currentDate();

        const now =
            currentTime();

        for (
            const fixture of
            data.fixtures
        ) {
            if (
                fixture.status ===
                "TAMAMLANDI" ||
                fixture.status ===
                "CANLI" ||
                fixture.status ===
                "IPTAL"
            ) {
                continue;
            }

            if (
                fixture.date !== today ||
                fixture.time !== now
            ) {
                continue;
            }

            if (
                fixture.startedDate ===
                today
            ) {
                continue;
            }

            const guild =
                client.guilds.cache.get(
                    fixture.guildId
                );

            if (!guild) {
                continue;
            }

            const homeRole =
                guild.roles.cache.get(
                    fixture.homeId
                );

            const awayRole =
                guild.roles.cache.get(
                    fixture.awayId
                );

            if (
                !homeRole ||
                !awayRole
            ) {
                fixture.status =
                    "IPTAL";

                fixture.result =
                    "Takım rolü bulunamadı.";

                saveData();

                continue;
            }

            fixture.startedDate =
                today;

            saveData();

            /*
              ÖNEMLİ:
              FİKSTÜR KANALINDA BAŞLATILMAZ.
              DOĞRUDAN MAÇ KANALINA GİDER.
            */

            await startMatch(
                guild,
                homeRole,
                awayRole,
                fixture
            );
        }
    } catch (error) {
        console.error(
            "Fikstür kontrol:",
            error
        );
    } finally {
        fixtureCheckBusy = false;
    }
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
                    `reg:futbolcu:${userId}`
                )
                .setLabel(
                    "Futbolcu"
                )
                .setEmoji("⚽")
                .setStyle(
                    ButtonStyle.Primary
                ),

            new ButtonBuilder()
                .setCustomId(
                    `reg:kaleci:${userId}`
                )
                .setLabel(
                    "Kaleci"
                )
                .setEmoji("🧤")
                .setStyle(
                    ButtonStyle.Success
                ),

            new ButtonBuilder()
                .setCustomId(
                    `reg:td:${userId}`
                )
                .setLabel(
                    "Teknik Direktör"
                )
                .setEmoji("📋")
                .setStyle(
                    ButtonStyle.Secondary
                )
        );
}

/* =========================================================
   ÜYE GİRİŞ
   ========================================================= */

client.on(
    "guildMemberAdd",
    async member => {
        const channel =
            member.guild.channels.cache.get(
                CHANNEL.KAYIT
            );

        if (
            !channel ||
            !channel.isTextBased()
        ) {
            return;
        }

        await channel.send(
            `👋 ${member} hoşgeldin sunucumuza!\n` +
            `📋 <@&${ROLE.KAYIT_YETKILI}> seninle ilgilenecektir.`
        ).catch(() => {});
    }
);

/* =========================================================
   INTERACTIONS
   ========================================================= */

client.on(
    "interactionCreate",
    async interaction => {
        try {
            /*
              FORMASYON SELECT
            */

            if (
                interaction.isStringSelectMenu() &&
                interaction.customId.startsWith(
                    "formation:"
                )
            ) {
                if (
                    !hasRole(
                        interaction.member,
                        ROLE.MAC_YETKILI
                    )
                ) {
                    return interaction.reply({
                        content:
                            "❌ Bu menüyü sadece Maç Yetkilisi kullanabilir.",
                        ephemeral: true
                    });
                }

                const teamId =
                    interaction.customId.split(
                        ":"
                    )[1];

                const team =
                    data.teams[teamId];

                if (!team) {
                    return interaction.reply({
                        content:
                            "❌ Takım bulunamadı.",
                        ephemeral: true
                    });
                }

                const formation =
                    interaction.values[0];

                team.formation =
                    formation;

                saveData();

                return interaction.update({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                "📐 FORMASYON GÜNCELLENDİ"
                            )
                            .setDescription(
                                `🏟️ **${team.name}**\n\n` +
                                `📐 Yeni Formasyon: **${formation}**`
                            )
                            .setTimestamp()
                    ],
                    components: [
                        formationRow(
                            team.id
                        )
                    ]
                });
            }

            /*
              KAYIT BUTONLARI
            */

            if (
                interaction.isButton() &&
                interaction.customId.startsWith(
                    "reg:"
                )
            ) {
                if (
                    !hasRole(
                        interaction.member,
                        ROLE.KAYIT_YETKILI
                    )
                ) {
                    return interaction.reply({
                        content:
                            "❌ Sadece Kayıt Yetkilisi kullanabilir.",
                        ephemeral: true
                    });
                }

                const [
                    ,
                    type,
                    userId
                ] =
                    interaction.customId.split(
                        ":"
                    );

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

                const rolesToRemove = [
                    ROLE.FUTBOLCU,
                    ROLE.KALECI,
                    ROLE.TEKNIK_DIREKTOR,
                    ROLE.KAYITSIZ
                ];

                await target.roles.remove(
                    rolesToRemove
                ).catch(() => {});

                let roleId;
                let roleName;

                if (
                    type ===
                    "futbolcu"
                ) {
                    roleId =
                        ROLE.FUTBOLCU;
                    roleName =
                        "⚽ Futbolcu";
                } else if (
                    type ===
                    "kaleci"
                ) {
                    roleId =
                        ROLE.KALECI;
                    roleName =
                        "🧤 Kaleci";
                } else {
                    roleId =
                        ROLE.TEKNIK_DIREKTOR;
                    roleName =
                        "📋 Teknik Direktör";
                }

                await target.roles.add(
                    roleId
                ).catch(() => {});

                data.registrations[
                    target.id
                ] = {
                    type,
                    roleId,
                    registeredBy:
                        interaction.user.id,
                    registeredAt:
                        new Date().toISOString()
                };

                saveData();

                const disabledRow =
                    new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(
                                    "disabled1"
                                )
                                .setLabel(
                                    "Kayıt Tamamlandı"
                                )
                                .setDisabled(true)
                                .setStyle(
                                    ButtonStyle.Secondary
                                )
                        );

                await interaction.update({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                "✅ KAYIT TAMAMLANDI"
                            )
                            .setDescription(
                                `${target} başarıyla kayıt edildi.\n\n` +
                                `📋 Tür: **${roleName}**`
                            )
                            .setTimestamp()
                    ],
                    components: [
                        disabledRow
                    ]
                });

                const chat =
                    interaction.guild.channels.cache.get(
                        CHANNEL.SOHBET
                    );

                if (
                    chat &&
                    chat.isTextBased()
                ) {
                    await chat.send(
                        `🎉 ${target} kayıt işlemini tamamladı! ${roleName}`
                    ).catch(() => {});
                }

                return;
            }
        } catch (error) {
            console.error(
                "Interaction hatası:",
                error
            );

            if (
                interaction.isRepliable() &&
                !interaction.replied
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

            if (!args.length) {
                return;
            }

            const command =
                args.shift()
                    .toLocaleLowerCase(
                        "tr-TR"
                    );

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
                            "⚽ AXERA LEAGUE • KOMUTLAR"
                        )
                        .addFields(
                            {
                                name:
                                    "📋 Kayıt",
                                value:
                                    "`.k @oyuncu TakmaAd`\n`.kayıtsızver @oyuncu`"
                            },
                            {
                                name:
                                    "💰 Değer",
                                value:
                                    "`.dver @oyuncu miktar`\n`.dsil @oyuncu miktar`"
                            },
                            {
                                name:
                                    "🏋️ Antrenman",
                                value:
                                    "`.ant` / `.antrenman`"
                            },
                            {
                                name:
                                    "🥅 Penaltı",
                                value:
                                    "`.pen` / `.penaltı`"
                            },
                            {
                                name:
                                    "🔎 Oyuncu",
                                value:
                                    "`.ara isim`"
                            },
                            {
                                name:
                                    "🏟️ Takım",
                                value:
                                    "`.takımekle @takım`\n`.takımdeğer @takım`\n`.kadroekle @takım @oyuncu pozisyon`\n`.kadroçıkar @takım @oyuncu`\n`.kadro @takım`"
                            },
                            {
                                name:
                                    "📐 Formasyon",
                                value:
                                    "`.formasyon @takım`"
                            },
                            {
                                name:
                                    "📅 Fikstür",
                                value:
                                    "`.fiksturekle @takım1 @takım2 GG.AA.YYYY SS:DD`\n`.fikstur`"
                            },
                            {
                                name:
                                    "📊 Puan",
                                value:
                                    "`.puan`\n`.puanekle @takım miktar`"
                            },
                            {
                                name:
                                    "⚽ Maç",
                                value:
                                    "`.maç @takım1 @takım2`"
                            },
                            {
                                name:
                                    "🐦 Tweet",
                                value:
                                    "`.tweet mesaj`"
                            }
                        )
                        .setTimestamp()
                        .setFooter({
                            text:
                                "Axera League"
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
                    !hasRole(
                        message.member,
                        ROLE.KAYIT_YETKILI
                    )
                ) {
                    return message.reply(
                        "❌ Bu komutu sadece **Kayıt Yetkilisi** kullanabilir."
                    );
                }

                if (
                    message.channel.id !==
                    CHANNEL.KAYIT
                ) {
                    return message.reply(
                        "❌ Bu komut sadece kayıt kanalında kullanılabilir."
                    );
                }

                const target =
                    message.mentions.members.first();

                if (!target) {
                    return message.reply(
                        "❌ Kullanım: `.k @Oyuncu TakmaAd`"
                    );
                }

                const nickname =
                    args.join(" ").trim();

                if (!nickname) {
                    return message.reply(
                        "❌ Oyuncunun takma adını yazmalısın."
                    );
                }

                if (
                    nickname.length > 32
                ) {
                    return message.reply(
                        "❌ Discord takma adı en fazla 32 karakter olabilir."
                    );
                }

                await target.setNickname(
                    nickname
                ).catch(() => {});

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            "📋 AXERA LEAGUE • KAYIT"
                        )
                        .setDescription(
                            `${target}\n\n` +
                            `Lütfen kayıt türünü seçin.\n\n` +
                            `⚽ Futbolcu\n` +
                            `🧤 Kaleci\n` +
                            `📋 Teknik Direktör`
                        )
                        .setTimestamp();

                return message.reply({
                    embeds: [embed],
                    components: [
                        registrationButtons(
                            target.id
                        )
                    ]
                });
            }

            if (
                command ===
                    "kayıtsızver" ||
                command ===
                    "kayitsizver"
            ) {
                if (
                    !hasRole(
                        message.member,
                        ROLE.KAYIT_YETKILI
                    )
                ) {
                    return message.reply(
                        "❌ Sadece Kayıt Yetkilisi."
                    );
                }

                const target =
                    message.mentions.members.first();

                if (!target) {
                    return message.reply(
                        "❌ Oyuncu etiketle."
                    );
                }

                await target.roles.remove([
                    ROLE.FUTBOLCU,
                    ROLE.KALECI,
                    ROLE.TEKNIK_DIREKTOR
                ]).catch(() => {});

                await target.roles.add(
                    ROLE.KAYITSIZ
                ).catch(() => {});

                delete data.registrations[
                    target.id
                ];

                saveData();

                return message.reply(
                    `✅ ${target} tekrar **Kayıtsız** yapıldı.`
                );
            }

            /* =================================================
               DEĞER VER
            ================================================= */

            if (
                command === "dver" ||
                command === "dsil"
            ) {
                if (
                    !hasRole(
                        message.member,
                        ROLE.DEGER_YETKILI
                    )
                ) {
                    return message.reply(
                        "❌ Bu komutu sadece **Değer Yetkilisi** kullanabilir."
                    );
                }

                const target =
                    message.mentions.members.first();

                if (!target) {
                    return message.reply(
                        `❌ Kullanım: .${command} @Oyuncu miktar`
                    );
                }

                const amount =
                    parseAmount(
                        args.find(
                            x =>
                                !x.startsWith(
                                    "<@"
                                )
                        )
                    );

                if (
                    amount === null ||
                    amount <= 0
                ) {
                    return message.reply(
                        "❌ Geçerli bir miktar yaz."
                    );
                }

                const nickname =
                    target.nickname ||
                    target.user.globalName ||
                    target.user.username;

                const oldValue =
                    getNicknameValue(
                        nickname
                    );

                if (oldValue === null) {
                    return message.reply(
                        "❌ Oyuncunun takma adının sonunda `M€` değeri bulunmalı."
                    );
                }

                let newValue;

                if (
                    command === "dver"
                ) {
                    newValue =
                        oldValue + amount;
                } else {
                    newValue =
                        Math.max(
                            0,
                            oldValue - amount
                        );
                }

                const newNickname =
                    replaceNicknameValue(
                        nickname,
                        newValue
                    );

                if (
                    !newNickname ||
                    newNickname.length >
                    32
                ) {
                    return message.reply(
                        "❌ Yeni takma ad 32 karakteri geçiyor."
                    );
                }

                try {
                    await target.setNickname(
                        newNickname
                    );
                } catch {
                    return message.reply(
                        "❌ Takma ad değiştirilemedi. Botun rolü oyuncunun rolünün üzerinde ve Manage Nicknames yetkisi olmalı."
                    );
                }

                ensureUser(
                    target.id
                ).value =
                    newValue;

                syncAllTeams(
                    message.guild
                );

                saveData();

                return message.reply(
                    `✅ ${target} değeri **${money(oldValue)} → ${money(newValue)}** olarak güncellendi.`
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
                    message.channel.id !==
                    CHANNEL.ANTRENMAN
                ) {
                    return message.reply(
                        "❌ Bu komut sadece antrenman kanalında kullanılabilir."
                    );
                }

                const user =
                    ensureUser(
                        message.author.id
                    );

                user.training++;

                if (
                    user.training >= 5
                ) {
                    const old =
                        user.value;

                    user.value += 5;
                    user.training = 0;

                    /*
                      Değeri takma ada da uygula.
                    */

                    const member =
                        message.member;

                    const nickname =
                        member.nickname ||
                        member.user.globalName ||
                        member.user.username;

                    const nicknameValue =
                        getNicknameValue(
                            nickname
                        );

                    if (
                        nicknameValue !== null
                    ) {
                        const newNick =
                            replaceNicknameValue(
                                nickname,
                                nicknameValue + 5
                            );

                        if (
                            newNick &&
                            newNick.length <= 32
                        ) {
                            await member
                                .setNickname(
                                    newNick
                                )
                                .catch(
                                    () => {}
                                );
                        }
                    }

                    syncAllTeams(
                        message.guild
                    );

                    saveData();

                    return message.reply(
                        `🏋️ **Antrenman tamamlandı!**\n\n` +
                        `📈 İlerleme: **5/5**\n` +
                        `💰 Kazanç: **+5M€**\n` +
                        `💵 Eski değer: **${money(old)}**`
                    );
                }

                saveData();

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
                if (
                    message.channel.id !==
                    CHANNEL.PENALTI
                ) {
                    return message.reply(
                        "❌ Bu komut sadece penaltı kanalında kullanılabilir."
                    );
                }

                const member =
                    message.member;

                const nickname =
                    member.nickname ||
                    member.user.globalName ||
                    member.user.username;

                const current =
                    getNicknameValue(
                        nickname
                    );

                if (current === null) {
                    return message.reply(
                        "❌ Takma adının sonunda `M€` değeri bulunmalı."
                    );
                }

                const result =
                    Math.floor(
                        Math.random() * 3
                    );

                if (
                    result === 0
                ) {
                    const newValue =
                        current + 5;

                    const newNickname =
                        replaceNicknameValue(
                            nickname,
                            newValue
                        );

                    if (
                        newNickname &&
                        newNickname.length <= 32
                    ) {
                        await member
                            .setNickname(
                                newNickname
                            )
                            .catch(
                                () => {}
                            );
                    }

                    ensureUser(
                        member.id
                    ).value =
                        newValue;

                    syncAllTeams(
                        message.guild
                    );

                    saveData();

                    return message.reply(
                        `⚽ **GOOOL!**\n🧤 Axera Kalecisi topu çıkaramadı.\n💰 **+5M€**`
                    );
                }

                if (
                    result === 1
                ) {
                    return message.reply(
                        `🥅 **DİREK!**\n🧤 Axera Kalecisi sadece izledi.`
                    );
                }

                return message.reply(
                    `🧤 **KURTARDI!**\nAxera Kalecisi penaltıyı çıkardı.`
                );
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
                        "❌ Tweet mesajını yaz."
                    );
                }

                const embed =
                    new EmbedBuilder()
                        .setAuthor({
                            name:
                                message.member.displayName,
                            iconURL:
                                message.author.displayAvatarURL()
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
                const query =
                    args.join(" ");

                if (!query) {
                    return message.reply(
                        "❌ Aramak istediğin oyuncuyu yaz."
                    );
                }

                const member =
                    findClosest(
                        message.guild,
                        query
                    );

                if (!member) {
                    const embed =
                        new EmbedBuilder()
                            .setTitle(
                                "🔎 OYUNCU ARAMA"
                            )
                            .setDescription(
                                `⚪ **BOŞ**\n\n\`${query}\` için uygun oyuncu bulunamadı.`
                            );

                    return message.reply({
                        embeds: [embed]
                    });
                }

                const nickname =
                    member.nickname ||
                    member.user.globalName ||
                    member.user.username;

                const value =
                    getNicknameValue(
                        nickname
                    );

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            "🔎 OYUNCU ARAMA"
                        )
                        .addFields(
                            {
                                name:
                                    "Aranan",
                                value:
                                    `\`${query}\``
                            },
                            {
                                name:
                                    "Oyuncu",
                                value:
                                    `${member}`
                            },
                            {
                                name:
                                    "Takma Ad",
                                value:
                                    `\`${nickname}\``
                            },
                            {
                                name:
                                    "Değer",
                                value:
                                    value !== null
                                        ? `\`${money(value)}\``
                                        : "Değer bulunamadı"
                            },
                            {
                                name:
                                    "Durum",
                                value:
                                    "🟢 DOLU"
                            }
                        )
                        .setTimestamp();

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
                    !hasRole(
                        message.member,
                        ROLE.MAC_YETKILI
                    )
                ) {
                    return message.reply(
                        "❌ Sadece Maç Yetkilisi."
                    );
                }

                const role =
                    message.mentions.roles.first();

                if (!role) {
                    return message.reply(
                        "❌ Kullanım: `.takımekle @Takım`"
                    );
                }

                const team =
                    ensureTeam(role);

                const exists =
                    Boolean(
                        data.standings[
                            role.id
                        ]
                    );

                if (exists) {
                    return message.reply(
                        `⚠️ **${role.name}** zaten puan durumunda bulunuyor.`
                    );
                }

                ensureStanding(
                    role.id,
                    role.name
                );

                saveData();

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                "✅ TAKIM EKLENDİ"
                            )
                            .setDescription(
                                `🏟️ **${team.name}** puan durumuna eklendi.\n\n` +
                                `O: 0 • G: 0 • B: 0 • M: 0\n` +
                                `AG: 0 • YG: 0 • AV: 0\n` +
                                `🏆 Puan: **0**`
                            )
                            .setTimestamp()
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
                    !hasRole(
                        message.member,
                        ROLE.MAC_YETKILI
                    )
                ) {
                    return message.reply(
                        "❌ Sadece Maç Yetkilisi."
                    );
                }

                const role =
                    message.mentions.roles.first();

                const amount =
                    parseAmount(
                        args.find(
                            x =>
                                !x.startsWith(
                                    "<@"
                                )
                        )
                    );

                if (
                    !role ||
                    amount === null ||
                    amount <= 0
                ) {
                    return message.reply(
                        "❌ Kullanım: `.puanekle @Takım miktar`"
                    );
                }

                const standing =
                    ensureStanding(
                        role.id,
                        role.name
                    );

                standing.P +=
                    amount;

                saveData();

                return message.reply(
                    `✅ **${role.name}** takımına **+${amount} P** eklendi. Yeni puan: **${standing.P} P**`
                );
            }

            /* =================================================
               PUAN
            ================================================= */

            if (
                command === "puan"
            ) {
                return message.reply({
                    embeds: [
                        standingsEmbed()
                    ]
                });
            }

            /* =================================================
               TAKIM DEĞERİ
            ================================================= */

            if (
                command === "takımdeğer" ||
                command === "takimdeger"
            ) {
                if (
                    !hasRole(
                        message.member,
                        ROLE.MAC_YETKILI
                    )
                ) {
                    return message.reply(
                        "❌ Sadece Maç Yetkilisi."
                    );
                }

                const team =
                    getMentionedTeam(
                        message
                    );

                if (!team) {
                    return message.reply(
                        "❌ Kullanım: `.takımdeğer @Takım`"
                    );
                }

                syncTeamValue(
                    message.guild,
                    team
                );

                saveData();

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                "💰 TAKIM DEĞERİ"
                            )
                            .setDescription(
                                `🏟️ **${team.name}**\n\n` +
                                `💰 Güncel Takım Değeri: **${money(team.value)}**\n\n` +
                                `📌 Değer kadrodaki oyuncuların güncel değerlerinin toplamıdır.`
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
                if (
                    !hasRole(
                        message.member,
                        ROLE.MAC_YETKILI
                    )
                ) {
                    return message.reply(
                        "❌ Sadece Maç Yetkilisi."
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

                const team =
                    ensureTeam(
                        teamRole
                    );

                const positionToken =
                    args.find(
                        x =>
                            normalizePosition(
                                x
                            )
                    );

                const position =
                    normalizePosition(
                        positionToken
                    );

                if (!position) {
                    return message.reply(
                        `❌ Geçersiz pozisyon.\n\n${POSITIONS.join(" • ")}`
                    );
                }

                if (
                    team.players[
                        player.id
                    ]
                ) {
                    return message.reply(
                        "❌ Bu oyuncu zaten takımda."
                    );
                }

                const nickname =
                    player.nickname ||
                    player.user.globalName ||
                    player.user.username;

                const value =
                    getNicknameValue(
                        nickname
                    );

                if (value === null) {
                    return message.reply(
                        "❌ Oyuncunun takma adının sonunda `M€` değeri bulunmalı."
                    );
                }

                team.players[
                    player.id
                ] = {
                    position,
                    addedAt:
                        new Date().toISOString()
                };

                /*
                  TAKIM DEĞERİ OTOMATİK
                  SENKRONİZE
                */

                syncTeamValue(
                    message.guild,
                    team
                );

                saveData();

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                "✅ OYUNCU KADROYA EKLENDİ"
                            )
                            .setDescription(
                                `${player}\n\n` +
                                `🏟️ Takım: **${team.name}**\n` +
                                `📍 Pozisyon: **${position}**\n` +
                                `💰 Oyuncu Değeri: **${money(value)}**\n` +
                                `💵 Yeni Takım Değeri: **${money(team.value)}**`
                            )
                            .setTimestamp()
                    ]
                });
            }

            /* =================================================
               KADRO ÇIKAR
            ================================================= */

            if (
                command ===
                    "kadroçıkar" ||
                command ===
                    "kadrocikar"
            ) {
                if (
                    !hasRole(
                        message.member,
                        ROLE.MAC_YETKILI
                    )
                ) {
                    return message.reply(
                        "❌ Sadece Maç Yetkilisi."
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
                        "❌ Kullanım: `.kadroçıkar @Takım @Oyuncu`"
                    );
                }

                const team =
                    ensureTeam(
                        teamRole
                    );

                if (
                    !team.players[
                        player.id
                    ]
                ) {
                    return message.reply(
                        "❌ Bu oyuncu takım kadrosunda değil."
                    );
                }

                delete team.players[
                    player.id
                ];

                syncTeamValue(
                    message.guild,
                    team
                );

                saveData();

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                "✅ OYUNCU KADRODAN ÇIKARILDI"
                            )
                            .setDescription(
                                `${player}\n\n` +
                                `🏟️ Takım: **${team.name}**\n` +
                                `💰 Yeni Takım Değeri: **${money(team.value)}**`
                            )
                            .setTimestamp()
                    ]
                });
            }

            /* =================================================
               KADRO
            ================================================= */

            if (
                command === "kadro"
            ) {
                const team =
                    getMentionedTeam(
                        message
                    );

                if (!team) {
                    return message.reply(
                        "❌ Kullanım: `.kadro @Takım`"
                    );
                }

                syncTeamValue(
                    message.guild,
                    team
                );

                saveData();

                return message.reply({
                    embeds: [
                        squadEmbed(
                            message.guild,
                            team
                        )
                    ]
                });
            }

            /* =================================================
               FORMASYON
            ================================================= */

            if (
                command === "formasyon"
            ) {
                if (
                    !hasRole(
                        message.member,
                        ROLE.MAC_YETKILI
                    )
                ) {
                    return message.reply(
                        "❌ Formasyonu sadece Maç Yetkilisi değiştirebilir."
                    );
                }

                const team =
                    getMentionedTeam(
                        message
                    );

                if (!team) {
                    return message.reply(
                        "❌ Kullanım: `.formasyon @Takım`"
                    );
                }

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            "📐 AXERA LEAGUE • FORMASYON"
                        )
                        .setDescription(
                            `🏟️ Takım: **${team.name}**\n` +
                            `📐 Mevcut Formasyon: **${team.formation}**\n\n` +
                            `Aşağıdaki menüden yeni formasyonu seç.`
                        )
                        .setTimestamp();

                return message.reply({
                    embeds: [embed],
                    components: [
                        formationRow(
                            team.id
                        )
                    ]
                });
            }

            /* =================================================
               FİKSTÜR EKLE
            ================================================= */

            if (
                command === "fiksturekle"
            ) {
                if (
                    !hasRole(
                        message.member,
                        ROLE.MAC_YETKILI
                    )
                ) {
                    return message.reply(
                        "❌ Sadece Maç Yetkilisi."
                    );
                }

                const roles =
                    message.mentions.roles;

                if (
                    roles.size < 2
                ) {
                    return message.reply(
                        "❌ İki takım etiketle."
                    );
                }

                const homeRole =
                    roles.at(0);

                const awayRole =
                    roles.at(1);

                const date =
                    validDate(
                        args[0]
                    );

                const time =
                    validTime(
                        args[1]
                    );

                if (
                    !date ||
                    !time
                ) {
                    return message.reply(
                        "❌ Kullanım:\n`.fiksturekle @Takım1 @Takım2 GG.AA.YYYY SS:DD`"
                    );
                }

                const fixture = {
                    id:
                        `fixture-${Date.now()}`,

                    guildId:
                        message.guild.id,

                    homeId:
                        homeRole.id,

                    awayId:
                        awayRole.id,

                    homeName:
                        homeRole.name,

                    awayName:
                        awayRole.name,

                    date,
                    time,

                    status:
                        "BEKLİYOR",

                    homeGoals:
                        null,

                    awayGoals:
                        null,

                    startedDate:
                        null
                };

                data.fixtures.push(
                    fixture
                );

                ensureTeam(
                    homeRole
                );

                ensureTeam(
                    awayRole
                );

                ensureStanding(
                    homeRole.id,
                    homeRole.name
                );

                ensureStanding(
                    awayRole.id,
                    awayRole.name
                );

                saveData();

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                "📅 FİKSTÜR OLUŞTURULDU"
                            )
                            .setDescription(
                                `🔴 **${homeRole.name}** 🆚 **${awayRole.name}**\n\n` +
                                `📅 Tarih: **${date}**\n` +
                                `🕐 Saat: **${time}**\n` +
                                `🟡 Durum: **BEKLİYOR**\n\n` +
                                `🤖 Zamanı geldiğinde maç otomatik olarak **Maç kanalında** başlayacaktır.`
                            )
                            .setTimestamp()
                    ]
                });
            }

            /* =================================================
               FİKSTÜR
            ================================================= */

            if (
                command === "fikstur" ||
                command === "fikstür"
            ) {
                return message.reply({
                    embeds: [
                        fixtureEmbed()
                    ]
                });
            }

            /* =================================================
               MANUEL MAÇ
            ================================================= */

            if (
                command === "maç" ||
                command === "mac"
            ) {
                if (
                    !hasRole(
                        message.member,
                        ROLE.MAC_YETKILI
                    )
                ) {
                    return message.reply(
                        "❌ Sadece Maç Yetkilisi."
                    );
                }

                const roles =
                    message.mentions.roles;

                if (
                    roles.size < 2
                ) {
                    return message.reply(
                        "❌ İki takım etiketle."
                    );
                }

                const home =
                    roles.at(0);

                const away =
                    roles.at(1);

                await startMatch(
                    message.guild,
                    home,
                    away,
                    null
                );

                return;
            }

            /* =================================================
               SİL
            ================================================= */

            if (
                command === "sil"
            ) {
                if (
                    !message.member.permissions.has(
                        "ManageMessages"
                    )
                ) {
                    return message.reply(
                        "❌ Mesaj yönetme yetkin yok."
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
                        "❌ 1 ile 1000 arasında bir miktar gir."
                    );
                }

                const deleted =
                    await message.channel.bulkDelete(
                        amount,
                        true
                    ).catch(
                        () => null
                    );

                if (!deleted) {
                    return;
                }

                const response =
                    await message.channel.send(
                        `🗑️ **${deleted.size}** mesaj silindi.`
                    );

                setTimeout(
                    () =>
                        response
                            .delete()
                            .catch(
                                () => {}
                            ),
                    3000
                );

                return;
            }

            /* =================================================
               BİLİNMEYEN
            ================================================= */

            return;

        } catch (error) {
            console.error(
                "messageCreate hatası:",
                error
            );

            if (
                !message.replied
            ) {
                await message.reply(
                    "❌ Komut çalıştırılırken bir hata oluştu."
                ).catch(() => {});
            }
        }
    }
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

        /*
          Eski takımların değerlerini
          bot açılışında senkronize et.
        */

        for (
            const guild of
            client.guilds.cache.values()
        ) {
            try {
                syncAllTeams(
                    guild
                );
            } catch {}
        }

        /*
          Fikstürleri her saniye kontrol et.
          Saat geldiğinde MAÇ KANALINDA başlatır.
        */

        setInterval(
            checkFixtures,
            1000
        );
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
