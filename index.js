require("dotenv").config();

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
    StringSelectMenuOptionBuilder
} = require("discord.js");

const fs = require("fs");
const path = require("path");

/* =========================================================
   AXERA LEAGUE FOOTBALL RP BOT
   DISCORD.JS V14
   ========================================================= */

const TOKEN = process.env.TOKEN;
const PREFIX = ".";

const DATA_FILE = path.join(process.cwd(), "data.json");
const BACKUP_DIR = path.join(process.cwd(), "backups");

const CHANNELS = {
    KAYIT: "1534460177884123276",
    SOHBET: "1534469475917758586",
    ANTRENMAN: "1534474070798762197",
    PENALTI: "1534474327812997192",
    MAC: "1534477626872168541",
    PUAN: "1534475991404253284"
};

const ROLES = {
    FUTBOLCU: "1534457228986421278",
    KALECI: "1534492034243498195",
    KAYITSIZ: "1534457560134844517",
    TEKNIK_DIREKTOR: "1534456648930693120",
    KAYIT_YETKILISI: "1534456315366342716",
    DEGER_YETKILISI: "1534456192913375382",
    MAC_YETKILISI: "1535251168169697390"
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
        KL: 1, STP: 2, SĞB: 1, SLB: 1,
        MO: 2, SĞK: 1, SLK: 1, SNT: 2
    },
    "4-3-3": {
        KL: 1, STP: 2, SĞB: 1, SLB: 1,
        MO: 3, SĞK: 1, SLK: 1, SNT: 1
    },
    "4-2-3-1": {
        KL: 1, STP: 2, SĞB: 1, SLB: 1,
        MO: 2, MOO: 1, SĞK: 1, SLK: 1, SNT: 1
    },
    "3-5-2": {
        KL: 1, STP: 3, MO: 2, MOO: 1,
        SĞK: 1, SLK: 1, SNT: 2
    },
    "3-4-3": {
        KL: 1, STP: 3, MO: 2,
        SĞK: 1, SLK: 1, SNT: 3
    },
    "4-3-1-2": {
        KL: 1, STP: 2, SĞB: 1, SLB: 1,
        MO: 3, MOO: 1, SNT: 2
    },
    "4-2-2-2": {
        KL: 1, STP: 2, SĞB: 1, SLB: 1,
        MO: 2, MOO: 2, SNT: 2
    },
    "5-3-2": {
        KL: 1, STP: 3, SĞB: 1, SLB: 1,
        MO: 3, SNT: 2
    }
};

const DEFAULT_DATA = {
    users: {},
    teams: {},
    standings: {},
    fixtures: [],
    nextFixtureId: 1,
    activeMatches: {},
    standingsMessageId: null,
    registrationPanels: {},
    cups: {},
    museum: [],
    assists: {},
    goals: {}
};

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

/* =========================================================
   DATA
   ========================================================= */

function isObject(x) {
    return x && typeof x === "object" && !Array.isArray(x);
}

function finite(x) {
    return typeof x === "number" && Number.isFinite(x);
}

function parseMoney(x) {
    if (x === undefined || x === null) return NaN;

    let s = String(x)
        .trim()
        .toLowerCase()
        .replace(/€/g, "")
        .replace(/m/g, "")
        .replace(/,/g, ".")
        .replace(/\s/g, "");

    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

function money(n) {
    return `${Number(n || 0).toLocaleString("tr-TR", {
        maximumFractionDigits: 2
    })}M€`;
}

function mentionId(x) {
    const m = String(x || "").match(/^<@!?(\d+)>$/);
    return m ? m[1] : null;
}

function clone(x) {
    return JSON.parse(JSON.stringify(x));
}

function normalizeUser(user = {}) {
    const u = { ...user };

    if (!finite(u.value)) {
        const old = [
            u.playerValue,
            u.deger,
            u.valueM
        ].find(finite);

        u.value = finite(old) ? old : 0;
    }

    if (!finite(u.budget)) {
        const fields = [
            "money",
            "balance",
            "para",
            "bakiye",
            "cash",
            "wallet",
            "balanceM",
            "budgetM",
            "personalBudget",
            "personalBalance"
        ];

        let found = false;

        for (const field of fields) {
            if (finite(u[field])) {
                u.budget = u[field];
                found = true;
                break;
            }

            if (typeof u[field] === "string") {
                const n = parseMoney(u[field]);

                if (Number.isFinite(n)) {
                    u.budget = n;
                    found = true;
                    break;
                }
            }
        }

        if (!found) u.budget = 0;
    }

    if (!finite(u.training)) u.training = 0;
    if (!isObject(u.teams)) u.teams = {};

    return u;
}

function normalizeTeam(team = {}) {
    const t = { ...team };

    if (!finite(t.manualValue)) {
        t.manualValue = finite(t.value) ? t.value : 0;
    }

    if (!isObject(t.players)) t.players = {};

    if (!FORMATIONS[t.formation]) {
        t.formation = "4-4-2";
    }

    if (!isObject(t.stats)) {
        t.stats = {};
    }

    for (const s of [
        "O", "G", "B", "M",
        "AG", "YG", "AV", "P"
    ]) {
        if (!finite(t.stats[s])) t.stats[s] = 0;
    }

    return t;
}

function normalizeData(raw) {
    const d = {
        ...clone(DEFAULT_DATA),
        ...(isObject(raw) ? raw : {})
    };

    if (!isObject(d.users)) d.users = {};
    if (!isObject(d.teams)) d.teams = {};
    if (!isObject(d.standings)) d.standings = {};
    if (!Array.isArray(d.fixtures)) d.fixtures = [];
    if (!isObject(d.activeMatches)) d.activeMatches = {};
    if (!isObject(d.registrationPanels)) {
        d.registrationPanels = {};
    }
    if (!isObject(d.cups)) d.cups = {};
    if (!Array.isArray(d.museum)) d.museum = [];
    if (!isObject(d.assists)) d.assists = {};
    if (!isObject(d.goals)) d.goals = {};

    for (const id of Object.keys(d.users)) {
        d.users[id] = normalizeUser(d.users[id]);
    }

    for (const id of Object.keys(d.teams)) {
        d.teams[id] = normalizeTeam(d.teams[id]);
    }

    if (!finite(d.nextFixtureId)) {
        d.nextFixtureId = 1;
    }

    return d;
}

function loadData() {
    if (!fs.existsSync(DATA_FILE)) {
        return clone(DEFAULT_DATA);
    }

    try {
        return normalizeData(
            JSON.parse(
                fs.readFileSync(DATA_FILE, "utf8")
            )
        );
    } catch (err) {
        console.error("data.json hatası:", err);

        try {
            fs.mkdirSync(BACKUP_DIR, {
                recursive: true
            });

            fs.copyFileSync(
                DATA_FILE,
                path.join(
                    BACKUP_DIR,
                    `corrupt-${Date.now()}.json`
                )
            );
        } catch {}

        return clone(DEFAULT_DATA);
    }
}

let data = loadData();

function saveData() {
    try {
        fs.mkdirSync(BACKUP_DIR, {
            recursive: true
        });

        if (fs.existsSync(DATA_FILE)) {
            try {
                fs.copyFileSync(
                    DATA_FILE,
                    path.join(
                        BACKUP_DIR,
                        `backup-${Date.now()}.json`
                    )
                );
            } catch {}
        }

        const tmp = `${DATA_FILE}.tmp`;

        fs.writeFileSync(
            tmp,
            JSON.stringify(data, null, 2),
            "utf8"
        );

        fs.renameSync(tmp, DATA_FILE);
    } catch (err) {
        console.error("Kayıt hatası:", err);
    }
}

/* =========================================================
   PERMISSIONS
   ========================================================= */

function hasRole(member, id) {
    return Boolean(
        member &&
        member.roles &&
        member.roles.cache.has(id)
    );
}

function isAdmin(member) {
    return Boolean(
        member &&
        member.permissions.has(
            PermissionsBitField.Flags.Administrator
        )
    );
}

function isRegistrationStaff(member) {
    return (
        isAdmin(member) ||
        hasRole(member, ROLES.KAYIT_YETKILISI)
    );
}

function isValueStaff(member) {
    return hasRole(member, ROLES.DEGER_YETKILISI);
}

function isMatchStaff(member) {
    return hasRole(member, ROLES.MAC_YETKILISI);
}

function getUser(id) {
    if (!data.users[id]) {
        data.users[id] = {
            value: 0,
            budget: 0,
            training: 0,
            teams: {}
        };
    }

    data.users[id] =
        normalizeUser(data.users[id]);

    return data.users[id];
}

/* =========================================================
   CHANNEL CHECK
   ========================================================= */

function onlyChannel(message, id) {
    if (message.channel.id !== id) {
        message.reply(
            `❌ Bu komut <#${id}> kanalında kullanılabilir.`
        );
        return false;
    }

    return true;
}

/* =========================================================
   VALUE
   ========================================================= */

function nicknameValue(nickname) {
    const match = String(nickname || "")
        .match(/(-?\d+(?:[.,]\d+)?)\s*M€?\s*$/i);

    if (!match) return null;

    return parseMoney(match[1]);
}

function getPlayerValue(member) {
    const u = data.users[member.id];

    if (u && finite(u.value)) {
        return u.value;
    }

    return nicknameValue(
        member.nickname || member.user.username
    ) || 0;
}

function makeValueNickname(member, value) {
    const old =
        member.nickname ||
        member.user.username;

    const parsed = nicknameValue(old);

    if (parsed === null) {
        return {
            ok: false,
            reason:
                "Oyuncunun isminde M€ değeri bulunamadı."
        };
    }

    const base = old
        .replace(
            /\s*(-?\d+(?:[.,]\d+)?)\s*M€?\s*$/i,
            ""
        )
        .trim();

    const nickname =
        `${base} | ${money(value)}`;

    if (nickname.length > 32) {
        return {
            ok: false,
            reason:
                "Yeni takma ad 32 karakteri geçiyor."
        };
    }

    return {
        ok: true,
        nickname
    };
}

async function changeValue(
    guild,
    member,
    amount
) {
    const user = getUser(member.id);

    const current =
        getPlayerValue(member);

    const next =
        Math.max(
            0,
            current + amount
        );

    const result =
        makeValueNickname(
            member,
            next
        );

    if (!result.ok) {
        return result;
    }

    try {
        await member.setNickname(
            result.nickname
        );
    } catch {
        return {
            ok: false,
            reason:
                "Takma ad değiştirilemedi. Botun Takma Adları Yönet yetkisini ve rol sırasını kontrol et."
        };
    }

    user.value = next;

    for (const team of Object.values(data.teams)) {
        if (team.players?.[member.id]) {
            team.players[member.id].value = next;
        }
    }

    saveData();

    return {
        ok: true,
        old: current,
        value: next
    };
}

/* =========================================================
   REGISTERED PLAYER SEARCH
   ========================================================= */

function isRegistered(member) {
    if (!member || member.user.bot) return false;

    if (
        hasRole(member, ROLES.KAYITSIZ)
    ) {
        return false;
    }

    return (
        hasRole(member, ROLES.FUTBOLCU) ||
        hasRole(member, ROLES.KALECI) ||
        hasRole(member, ROLES.TEKNIK_DIREKTOR)
    );
}

function normalizeSearch(s) {
    return String(s || "")
        .toLocaleLowerCase("tr-TR")
        .replace(/ı/g, "i")
        .replace(/ğ/g, "g")
        .replace(/ü/g, "u")
        .replace(/ş/g, "s")
        .replace(/ö/g, "o")
        .replace(/ç/g, "c")
        .trim();
}

function searchScore(query, target) {
    query = normalizeSearch(query);
    target = normalizeSearch(target);

    if (query === target) return 10000;
    if (target.startsWith(query)) return 5000;
    if (target.includes(query)) return 3000;

    let score = 0;

    for (const char of query) {
        if (target.includes(char)) score++;
    }

    return score;
}

function findPlayer(guild, query) {
    const list = [];

    for (
        const member of
        guild.members.cache.values()
    ) {
        if (!isRegistered(member)) continue;

        const nickname =
            member.nickname ||
            member.user.username;

        list.push({
            member,
            nickname,
            score:
                searchScore(
                    query,
                    nickname
                )
        });
    }

    list.sort(
        (a, b) => b.score - a.score
    );

    return list[0] || null;
}

/* =========================================================
   TEAM
   ========================================================= */

function teamValue(teamId) {
    const team = data.teams[teamId];

    if (!team) return 0;

    let total =
        Number(team.manualValue) || 0;

    for (const id of Object.keys(team.players || {})) {
        const member =
            client.guilds.cache
                .map(g => g.members.cache.get(id))
                .find(Boolean);

        if (member) {
            const value =
                getPlayerValue(member);

            team.players[id].value =
                value;

            total += value;
        } else {
            total +=
                Number(
                    team.players[id].value
                ) || 0;
        }
    }

    team.totalValue = total;

    return total;
}

function syncAllTeamValues() {
    for (const id of Object.keys(data.teams)) {
        teamValue(id);
    }
}

/* =========================================================
   STANDINGS
   ========================================================= */

function ensureStanding(id, name) {
    if (!data.standings[id]) {
        data.standings[id] = {
            teamId: id,
            name,
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

    return data.standings[id];
}

function applyResult(
    team1,
    team2,
    a,
    b
) {
    const t1 = data.teams[team1];
    const t2 = data.teams[team2];

    if (!t1 || !t2) return;

    const s1 =
        ensureStanding(team1, t1.name);

    const s2 =
        ensureStanding(team2, t2.name);

    s1.O++;
    s2.O++;

    s1.AG += a;
    s1.YG += b;

    s2.AG += b;
    s2.YG += a;

    s1.AV = s1.AG - s1.YG;
    s2.AV = s2.AG - s2.YG;

    if (a > b) {
        s1.G++;
        s2.M++;
        s1.P += 3;
    } else if (b > a) {
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

function standingsEmbed() {
    const teams =
        Object.values(data.standings)
            .sort((a, b) => {
                if (b.P !== a.P) {
                    return b.P - a.P;
                }

                if (b.AV !== a.AV) {
                    return b.AV - a.AV;
                }

                return b.AG - a.AG;
            });

    const lines =
        teams.length
            ? teams.map((t, i) =>
                [
                    `**${i + 1}. ${t.name}**`,
                    `O:${t.O} | G:${t.G} | B:${t.B} | M:${t.M}`,
                    `AG:${t.AG} | YG:${t.YG} | AV:${t.AV} | P:**${t.P}**`
                ].join("\n")
            ).join("\n\n")
            : "Henüz takım eklenmedi.";

    return new EmbedBuilder()
        .setTitle("🏆 AXERA LEAGUE PUAN DURUMU")
        .setDescription(lines)
        .setFooter({
            text: "Axera League • Puan Durumu"
        })
        .setTimestamp();
}

async function updateStandings() {
    try {
        const channel =
            await client.channels.fetch(
                CHANNELS.PUAN
            );

        if (!channel?.isTextBased()) return;

        const embed = standingsEmbed();

        if (data.standingsMessageId) {
            try {
                const msg =
                    await channel.messages.fetch(
                        data.standingsMessageId
                    );

                await msg.edit({
                    embeds: [embed]
                });

                return;
            } catch {}
        }

        const msg =
            await channel.send({
                embeds: [embed]
            });

        data.standingsMessageId =
            msg.id;

        saveData();
    } catch (err) {
        console.error(
            "Puan sistemi:",
            err
        );
    }
}

/* =========================================================
   REGISTRATION PANEL
   ========================================================= */

async function createRegistrationPanel(channel) {
    const embed =
        new EmbedBuilder()
            .setTitle(
                "📋 AXERA LEAGUE KAYIT PANELİ"
            )
            .setDescription(
                [
                    "Oyuncunun kayıt işlemini gerçekleştirmek için uygun butona basın.",
                    "",
                    "⚽ Futbolcu",
                    "🧤 Kaleci",
                    "📋 Teknik Direktör",
                    "",
                    "🔒 Panel yalnızca Kayıt Yetkilileri tarafından kullanılabilir."
                ].join("\n")
            )
            .setFooter({
                text:
                    "Axera League • Kayıt Sistemi"
            });

    const row =
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId("reg_futbolcu")
                    .setLabel("Futbolcu")
                    .setEmoji("⚽")
                    .setStyle(
                        ButtonStyle.Success
                    ),

                new ButtonBuilder()
                    .setCustomId("reg_kaleci")
                    .setLabel("Kaleci")
                    .setEmoji("🧤")
                    .setStyle(
                        ButtonStyle.Primary
                    ),

                new ButtonBuilder()
                    .setCustomId("reg_td")
                    .setLabel("Teknik Direktör")
                    .setEmoji("📋")
                    .setStyle(
                        ButtonStyle.Secondary
                    )
            );

    const msg =
        await channel.send({
            embeds: [embed],
            components: [row]
        });

    data.registrationPanels[msg.id] = {
        channelId: channel.id,
        createdAt: Date.now()
    };

    saveData();

    return msg;
}

/* =========================================================
   FORMATION
   ========================================================= */

function formationMenu(teamId) {
    return new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(
                    `formation_${teamId}`
                )
                .setPlaceholder(
                    "Formasyon seç..."
                )
                .addOptions(
                    Object.keys(FORMATIONS)
                        .map(f =>
                            new StringSelectMenuOptionBuilder()
                                .setLabel(f)
                                .setValue(f)
                                .setDescription(
                                    "Takım formasyonunu değiştir"
                                )
                        )
                )
        );
}

/* =========================================================
   SQUAD DISPLAY
   ========================================================= */

function squadEmbed(teamId) {
    const team =
        data.teams[teamId];

    if (!team) return null;

    const players =
        Object.entries(
            team.players || {}
        );

    const grouped = {};

    for (const [id, p] of players) {
        if (!grouped[p.position]) {
            grouped[p.position] = [];
        }

        grouped[p.position].push({
            id,
            ...p
        });
    }

    let text =
        `**📐 Formasyon:** ${team.formation}\n\n`;

    for (const pos of POSITIONS) {
        if (!grouped[pos]?.length) continue;

        text += `**${pos}**\n`;

        for (const p of grouped[pos]) {
            text +=
                `• <@${p.id}> — ${money(p.value)}\n`;
        }

        text += "\n";
    }

    if (!players.length) {
        text += "Kadro boş.";
    }

    return new EmbedBuilder()
        .setTitle(
            `⚽ ${team.name} — KADRO`
        )
        .setDescription(text)
        .addFields({
            name: "💎 Takım Değeri",
            value: money(teamValue(teamId)),
            inline: true
        })
        .addFields({
            name: "👥 Oyuncu",
            value: String(players.length),
            inline: true
        })
        .setFooter({
            text:
                "Axera League • Kadro Sistemi"
        });
}

/* =========================================================
   CUP SYSTEM
   ========================================================= */

function cupListForTeam(teamId) {
    const result = [];

    for (const cup of Object.values(data.cups)) {
        if (
            cup.teamId === teamId
        ) {
            result.push(cup);
        }
    }

    return result;
}

function cupEmbed(teamId) {
    const team =
        data.teams[teamId];

    if (!team) return null;

    const cups =
        cupListForTeam(teamId);

    let text =
        cups.length
            ? cups.map(
                (c, i) =>
                    `🏆 **${i + 1}. ${c.name}**\n${c.description || "Başarı"}`
            ).join("\n\n")
            : "Bu takımın henüz kupası bulunmuyor.";

    return new EmbedBuilder()
        .setTitle(
            `🏆 ${team.name} — KUPALAR`
        )
        .setDescription(text)
        .setFooter({
            text:
                "Axera League • Kupa Sistemi"
        });
}

/* =========================================================
   MUSEUM
   ========================================================= */

function museumEmbed() {
    const items =
        Array.isArray(data.museum)
            ? data.museum
            : [];

    let text =
        items.length
            ? items.map(
                (m, i) =>
                    `**${i + 1}. ${m.name}**\n${m.description || "Axera League arşivi"}`
            ).join("\n\n")
            : "🏛️ Müze henüz boş.";

    return new EmbedBuilder()
        .setTitle(
            "🏛️ AXERA LEAGUE MÜZESİ"
        )
        .setDescription(text)
        .setFooter({
            text:
                "Axera League • Tarih ve Başarı Arşivi"
        })
        .setTimestamp();
}

/* =========================================================
   FIXTURE
   ========================================================= */

function fixtureText() {
    const fixtures =
        data.fixtures
            .slice()
            .sort(
                (a, b) =>
                    new Date(
                        `${a.date}T${a.time}`
                    ) -
                    new Date(
                        `${b.date}T${b.time}`
                    )
            );

    if (!fixtures.length) {
        return "📅 Henüz fikstür bulunmuyor.";
    }

    return fixtures.map(f => {
        const status =
            f.status === "TAMAMLANDI"
                ? `✅ ${f.score1}-${f.score2}`
                : f.status === "BAŞLIYOR"
                    ? "🟡 BAŞLIYOR"
                    : f.status === "HATA"
                        ? "❌ HATA"
                        : "⏳ BEKLİYOR";

        return [
            `**${f.team1Name || f.team1}** 🆚 **${f.team2Name || f.team2}**`,
            `📅 ${f.date} ${f.time}`,
            status
        ].join("\n");
    }).join("\n\n");
}

/* =========================================================
   MATCH ENGINE
   ========================================================= */

function teamStrength(teamId) {
    const team =
        data.teams[teamId];

    if (!team) return 1;

    let value =
        Number(team.manualValue) || 0;

    for (const p of Object.values(
        team.players || {}
    )) {
        value +=
            Number(p.value) || 0;
    }

    /*
       Takım değeri çok büyümesin.
       Ortalama bir güç hesabı.
    */

    return Math.max(
        1,
        Math.sqrt(
            Math.max(value, 1)
        )
    );
}

function pickPlayer(teamId, position) {
    const team =
        data.teams[teamId];

    if (!team) return null;

    const players =
        Object.entries(
            team.players || {}
        )
            .filter(
                ([, p]) =>
                    p.position === position
            );

    if (!players.length) {
        const all =
            Object.entries(
                team.players || {}
            );

        if (!all.length) return null;

        return all[
            Math.floor(
                Math.random() * all.length
            )
        ];
    }

    return players[
        Math.floor(
            Math.random() * players.length
        )
    ];
}

function getScorer(teamId) {
    const preferred = [
        "SNT",
        "SLK",
        "SĞK",
        "MOO",
        "MO"
    ];

    for (const pos of preferred) {
        const p =
            pickPlayer(
                teamId,
                pos
            );

        if (p) {
            return {
                id: p[0],
                name:
                    p[1].name ||
                    `Oyuncu <@${p[0]}>`
            };
        }
    }

    return null;
}

function getGoalkeeper(teamId) {
    const p =
        pickPlayer(
            teamId,
            "KL"
        );

    return p
        ? p[1].name ||
            `Kaleci <@${p[0]}>`
        : "Kaleci";
}

async function startMatch(
    team1Id,
    team2Id,
    fixture = null
) {
    if (
        data.activeMatches[team1Id] ||
        data.activeMatches[team2Id]
    ) {
        return null;
    }

    const team1 =
        data.teams[team1Id];

    const team2 =
        data.teams[team2Id];

    if (!team1 || !team2) {
        return null;
    }

    const channel =
        await client.channels.fetch(
            CHANNELS.MAC
        ).catch(() => null);

    if (!channel?.isTextBased()) {
        return null;
    }

    const matchId =
        `${team1Id}_${team2Id}_${Date.now()}`;

    const match = {
        id: matchId,
        team1: team1Id,
        team2: team2Id,
        score1: 0,
        score2: 0,
        minute: 0,
        startedAt: Date.now(),
        fixtureId:
            fixture?.id || null,
        events: [],
        finished: false
    };

    data.activeMatches[team1Id] = matchId;
    data.activeMatches[team2Id] = matchId;

    saveData();

    let lastEvent = "";

    const embed = () =>
        new EmbedBuilder()
            .setTitle(
                `⚽ ${team1.name} 🆚 ${team2.name}`
            )
            .setDescription(
                [
                    `⏱️ **${match.minute}'**`,
                    "",
                    `# ${match.score1} - ${match.score2}`,
                    "",
                    lastEvent ||
                    "Hakem maçı başlattı."
                ].join("\n")
            )
            .addFields({
                name: "🏟️ Axera League",
                value:
                    "Canlı maç devam ediyor."
            })
            .setFooter({
                text:
                    "3 gerçek saniye = 1 maç dakikası"
            });

    const message =
        await channel.send({
            embeds: [embed()]
        });

    match.messageId =
        message.id;

    saveData();

    const timer =
        setInterval(async () => {

            if (match.finished) {
                clearInterval(timer);
                return;
            }

            match.minute++;

            /*
               Yaklaşık düşük gol oranı.
            */

            const strength1 =
                teamStrength(team1Id);

            const strength2 =
                teamStrength(team2Id);

            const total =
                strength1 + strength2;

            const chance1 =
                0.008 +
                0.010 *
                (strength1 / total);

            const chance2 =
                0.008 +
                0.010 *
                (strength2 / total);

            if (
                Math.random() < chance1
            ) {
                match.score1++;

                const scorer =
                    getScorer(team1Id);

                const text =
                    scorer
                        ? `⚽ **GOL!** ${team1.name} — ${scorer.name}`
                        : `⚽ **GOL!** ${team1.name}`;

                lastEvent = text;

                if (scorer) {
                    if (!data.goals[scorer.id]) {
                        data.goals[scorer.id] = 0;
                    }

                    data.goals[scorer.id]++;
                }

            } else if (
                Math.random() < chance2
            ) {
                match.score2++;

                const scorer =
                    getScorer(team2Id);

                const text =
                    scorer
                        ? `⚽ **GOL!** ${team2.name} — ${scorer.name}`
                        : `⚽ **GOL!** ${team2.name}`;

                lastEvent = text;

                if (scorer) {
                    if (!data.goals[scorer.id]) {
                        data.goals[scorer.id] = 0;
                    }

                    data.goals[scorer.id]++;
                }
            } else {
                lastEvent =
                    Math.random() < 0.2
                        ? "🟨 Orta saha mücadelesi."
                        : "⚽ Oyun devam ediyor.";
            }

            if (
                match.minute >= 90
            ) {
                match.finished = true;
                clearInterval(timer);

                finishMatch(match);

                await message.edit({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                `🏁 MAÇ SONUCU — ${team1.name} 🆚 ${team2.name}`
                            )
                            .setDescription(
                                [
                                    `# ${match.score1} - ${match.score2}`,
                                    "",
                                    match.score1 >
                                    match.score2
                                        ? `🏆 **Kazanan: ${team1.name}**`
                                        : match.score2 >
                                          match.score1
                                            ? `🏆 **Kazanan: ${team2.name}**`
                                            : "🤝 **Maç berabere bitti.**",
                                    "",
                                    match.events.length
                                        ? match.events.join("\n")
                                        : "Gol olmadı."
                                ].join("\n")
                            )
                            .setFooter({
                                text:
                                    "Axera League • Maç Sonu"
                            })
                            .setTimestamp()
                    ]
                });

                return;
            }

            try {
                await message.edit({
                    embeds: [embed()]
                });
            } catch {}

            saveData();

        }, 3000);

    return match;
}

function finishMatch(match) {
    const team1 = data.teams[match.team1];
    const team2 = data.teams[match.team2];

    if (!team1 || !team2) return;

    applyResult(
        match.team1,
        match.team2,
        match.score1,
        match.score2
    );

    for (const [teamId, id] of Object.entries(
        data.activeMatches
    )) {
        if (id === match.id) {
            delete data.activeMatches[teamId];
        }
    }

    const fixture =
        data.fixtures.find(
            f => f.id === match.fixtureId
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

    saveData();

    updateStandings();
}

/* =========================================================
   CLIENT READY
   ========================================================= */

client.once(
    "ready",
    async () => {

        console.log(
            `✅ ${client.user.tag} aktif!`
        );

        console.log(
            `📊 ${client.guilds.cache.size} sunucu`
        );

        syncAllTeamValues();
        saveData();

        await updateStandings();

        /*
           Bot yeniden başladıktan sonra
           zamanı geçmiş fikstürleri kontrol et.
        */

        for (const fixture of data.fixtures) {

            if (
                fixture.status !== "BEKLIYOR"
            ) continue;

            const target =
                new Date(
                    `${fixture.date}T${fixture.time}`
                ).getTime();

            if (
                Number.isFinite(target) &&
                target <= Date.now()
            ) {
                fixture.status =
                    "BAŞLIYOR";

                saveData();

                startMatch(
                    fixture.team1,
                    fixture.team2,
                    fixture
                );
            }
        }
    }
);

/* =========================================================
   NEW MEMBER
   ========================================================= */

client.on(
    "guildMemberAdd",
    async member => {

        if (member.user.bot) return;

        try {
            await member.roles.add(
                ROLES.KAYITSIZ
            );
        } catch {}

        const channel =
            member.guild.channels.cache.get(
                CHANNELS.KAYIT
            );

        if (
            channel?.isTextBased()
        ) {
            channel.send(
                [
                    `👋 ${member} hoşgeldin sunucumuza!`,
                    `📋 <@&${ROLES.KAYIT_YETKILISI}> seninle ilgilenecektir.`
                ].join("\n")
            );
        }
    }
);

/* =========================================================
   BUTTONS / SELECT MENUS
   ========================================================= */

client.on(
    "interactionCreate",
    async interaction => {

        if (
            interaction.isButton()
        ) {

            if (
                !interaction.customId.startsWith(
                    "reg_"
                )
            ) {
                return;
            }

            if (
                !isRegistrationStaff(
                    interaction.member
                )
            ) {
                return interaction.reply({
                    content:
                        "❌ Bu paneli yalnızca Kayıt Yetkilisi kullanabilir.",
                    ephemeral: true
                });
            }

            const roleMap = {
                reg_futbolcu:
                    ROLES.FUTBOLCU,
                reg_kaleci:
                    ROLES.KALECI,
                reg_td:
                    ROLES.TEKNIK_DIREKTOR
            };

            const roleId =
                roleMap[
                    interaction.customId
                ];

            if (!roleId) return;

            const removeRoles = [
                ROLES.KAYITSIZ,
                ROLES.FUTBOLCU,
                ROLES.KALECI,
                ROLES.TEKNIK_DIREKTOR
            ];

            for (const id of removeRoles) {
                if (
                    id !== roleId &&
                    interaction.member.roles.cache.has(id)
                ) {
                    try {
                        await interaction.member.roles.remove(id);
                    } catch {}
                }
            }

            try {
                await interaction.member.roles.add(
                    roleId
                );
            } catch {
                return interaction.reply({
                    content:
                        "❌ Rol verilemedi. Botun rol sırasını kontrol et.",
                    ephemeral: true
                });
            }

            saveData();

            await interaction.reply({
                content:
                    "✅ Kayıt işlemi tamamlandı.",
                ephemeral: true
            });

            const row =
                new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId("disabled1")
                            .setLabel("Kayıt Tamamlandı")
                            .setStyle(
                                ButtonStyle.Secondary
                            )
                            .setDisabled(true)
                    );

            try {
                await interaction.message.edit({
                    components: [row]
                });
            } catch {}

            const sohbet =
                interaction.guild.channels.cache.get(
                    CHANNELS.SOHBET
                );

            if (
                sohbet?.isTextBased()
            ) {
                sohbet.send(
                    `✅ ${interaction.member} kayıt işlemi tamamlandı.`
                );
            }

            return;
        }

        if (
            interaction.isStringSelectMenu()
        ) {

            if (
                !interaction.customId.startsWith(
                    "formation_"
                )
            ) {
                return;
            }

            if (
                !isMatchStaff(
                    interaction.member
                )
            ) {
                return interaction.reply({
                    content:
                        "❌ Bu işlemi yalnızca Maç Yetkilisi yapabilir.",
                    ephemeral: true
                });
            }

            const teamId =
                interaction.customId
                    .replace(
                        "formation_",
                        ""
                    );

            const formation =
                interaction.values[0];

            if (
                !data.teams[teamId] ||
                !FORMATIONS[formation]
            ) {
                return interaction.reply({
                    content:
                        "❌ Takım veya formasyon bulunamadı.",
                    ephemeral: true
                });
            }

            data.teams[teamId].formation =
                formation;

            saveData();

            return interaction.reply({
                content:
                    `✅ Formasyon **${formation}** olarak ayarlandı.`,
                ephemeral: true
            });
        }
    }
);

/* =========================================================
   MESSAGE COMMANDS
   ========================================================= */

client.on(
    "messageCreate",
    async message => {

        if (
            message.author.bot ||
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

        const input =
            message.content
                .slice(PREFIX.length)
                .trim();

        if (!input) return;

        const parts =
            input.split(/\s+/);

        const command =
            parts.shift()
                .toLocaleLowerCase(
                    "tr-TR"
                );

        const args = parts;

        /* =====================================================
           YARDIM
           ===================================================== */

        if (
            command === "yardım" ||
            command === "yardim"
        ) {

            const embed =
                new EmbedBuilder()
                    .setTitle(
                        "📚 AXERA LEAGUE KOMUTLARI"
                    )
                    .setDescription(
                        [
                            "### 📋 Kayıt",
                            "`.k @Oyuncu TakmaAdı`",
                            "`.kayıtsızver @Oyuncu`",
                            "`.rolpanel`",
                            "",
                            "### 🔎 Oyuncu",
                            "`.ara isim`",
                            "`.bütçe`",
                            "`.bütçe @Oyuncu`",
                            "`.gönder @Oyuncu miktar`",
                            "",
                            "### ⚽ Antrenman / Penaltı",
                            "`.ant`",
                            "`.antrenman`",
                            "`.pen`",
                            "`.penaltı`",
                            "",
                            "### 💰 Değer",
                            "`.dver @Oyuncu 5`",
                            "`.dsil @Oyuncu 5`",
                            "",
                            "### 🏟️ Takım",
                            "`.takımekle @Takım`",
                            "`.takımkaldır @Takım`",
                            "`.takımdeğer @Takım 850`",
                            "`.takımbütçe`",
                            "`.kadroekle @Takım @Oyuncu SNT`",
                            "`.kadrocikar @Takım @Oyuncu`",
                            "`.kadro @Takım`",
                            "`.formasyon @Takım`",
                            "",
                            "### 🏆 Lig / Maç",
                            "`.puan`",
                            "`.puanekle @Takım 3`",
                            "`.maç @Takım1 @Takım2`",
                            "`.fikstur`",
                            "`.fiksturekle @Takım1 @Takım2 2026-09-10 20:00`",
                            "`.fiksturcikar @Takım1 @Takım2`",
                            "",
                            "### 🏆 Kupa / Müze",
                            "`.kupaekle Kupa Adı`",
                            "`.kupaver @Takım Kupa Adı`",
                            "`.kupasil Kupa Adı`",
                            "`.kupalar @Takım`",
                            "`.müze`",
                            "`.müzeekle Kupa | Açıklama`",
                            "`.müzesil Kupa`",
                            "",
                            "### 🐦 Diğer",
                            "`.tweet mesaj`",
                            "`.dm @Oyuncu mesaj`",
                            "`.asistkral`",
                            "",
                            "### 🛡️ Yönetim",
                            "`.sil miktar`",
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

        /* =====================================================
           ROL PANELİ
           ===================================================== */

        if (
            command === "rolpanel"
        ) {

            if (
                !isRegistrationStaff(
                    message.member
                )
            ) {
                return message.reply(
                    "❌ Bu komutu yalnızca Yönetici/Kayıt Yetkilisi kullanabilir."
                );
            }

            const channel =
                message.guild.channels.cache.get(
                    CHANNELS.KAYIT
                );

            if (!channel) {
                return message.reply(
                    "❌ Kayıt kanalı bulunamadı."
                );
            }

            await createRegistrationPanel(
                channel
            );

            return message.reply(
                "✅ Kayıt paneli oluşturuldu."
            );
        }

        /* =====================================================
           KAYIT
           ===================================================== */

        if (
            command === "k" ||
            command === "kayıt" ||
            command === "kayit"
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

            if (
                !onlyChannel(
                    message,
                    CHANNELS.KAYIT
                )
            ) return;

            const targetId =
                mentionId(args[0]);

            const nickname =
                args.slice(1)
                    .join(" ")
                    .trim();

            if (
                !targetId ||
                !nickname
            ) {
                return message.reply(
                    "❌ Kullanım: `.k @Oyuncu TakmaAdı`"
                );
            }

            if (
                nickname.length > 32
            ) {
                return message.reply(
                    "❌ Takma ad 32 karakterden uzun olamaz."
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
                await target.setNickname(
                    nickname
                );
            } catch {
                return message.reply(
                    "❌ Takma ad değiştirilemedi."
                );
            }

            try {
                await target.roles.remove(
                    ROLES.KAYITSIZ
                );
            } catch {}

            const user =
                getUser(target.id);

            user.training = 0;

            saveData();

            const embed =
                new EmbedBuilder()
                    .setTitle(
                        "📋 KAYIT TAMAMLANDI"
                    )
                    .setDescription(
                        [
                            `👤 Oyuncu: ${target}`,
                            `🏷️ Takma Ad: **${nickname}**`,
                            "",
                            "Oyuncu kayıt panelinden pozisyonunu seçebilir."
                        ].join("\n")
                    );

            await message.channel.send({
                embeds: [embed]
            });

            return;
        }

        /* =====================================================
           KAYITSIZ VER
           ===================================================== */

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
                    "❌ Yetkin yok."
                );
            }

            const id =
                mentionId(args[0]);

            if (!id) {
                return message.reply(
                    "❌ Kullanım: `.kayıtsızver @Oyuncu`"
                );
            }

            const target =
                await message.guild.members
                    .fetch(id)
                    .catch(() => null);

            if (!target) {
                return message.reply(
                    "❌ Oyuncu bulunamadı."
                );
            }

            for (const role of [
                ROLES.FUTBOLCU,
                ROLES.KALECI,
                ROLES.TEKNIK_DIREKTOR
            ]) {
                try {
                    await target.roles.remove(role);
                } catch {}
            }

            try {
                await target.roles.add(
                    ROLES.KAYITSIZ
                );
            } catch {}

            saveData();

            return message.reply(
                `✅ ${target} tekrar Kayıtsız yapıldı.`
            );
        }

        /* =====================================================
           ARA
           ===================================================== */

        if (
            command === "ara"
        ) {

            const query =
                args.join(" ").trim();

            if (!query) {
                return message.reply(
                    "❌ Kullanım: `.ara oyuncu`"
                );
            }

            const found =
                findPlayer(
                    message.guild,
                    query
                );

            if (!found) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                "🔎 Oyuncu Arama"
                            )
                            .setDescription(
                                `**${query}** için kayıtlı oyuncu bulunamadı.\n\n⚪ **BOŞ**`
                            )
                    ]
                });
            }

            const value =
                getPlayerValue(
                    found.member
                );

            const embed =
                new EmbedBuilder()
                    .setTitle(
                        "🔎 OYUNCU ARAMA"
                    )
                    .addFields(
                        {
                            name: "Aranan",
                            value: query,
                            inline: true
                        },
                        {
                            name: "Oyuncu",
                            value:
                                `${found.member}`,
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
                                money(value),
                            inline: true
                        },
                        {
                            name: "Durum",
                            value:
                                "🟢 **DOLU**",
                            inline: true
                        }
                    )
                    .setTimestamp();

            return message.reply({
                embeds: [embed]
            });
        }

        /* =====================================================
           ANTRENMAN
           ===================================================== */

        if (
            command === "ant" ||
            command === "antrenman"
        ) {

            if (
                !onlyChannel(
                    message,
                    CHANNELS.ANTRENMAN
                )
            ) return;

            const user =
                getUser(
                    message.author.id
                );

            user.training++;

            if (
                user.training < 5
            ) {
                saveData();

                return message.reply(
                    `⚽ Antrenman ilerlemesi: **${user.training}/5**`
                );
            }

            const member =
                message.member;

            const result =
                await changeValue(
                    message.guild,
                    member,
                    5
                );

            if (!result.ok) {
                user.training = 4;
                saveData();

                return message.reply(
                    `❌ ${result.reason}\nİlerleme kaybolmaması için **4/5** olarak tutuldu.`
                );
            }

            user.training = 0;

            saveData();

            return message.reply(
                `🏋️ Antrenman tamamlandı!\n💰 Oyuncu değerine **+5M€** eklendi.\n📈 Yeni değer: **${money(result.value)}**`
            );
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
                !onlyChannel(
                    message,
                    CHANNELS.PENALTI
                )
            ) return;

            const outcomes = [
                {
                    title: "⚽ GOL!",
                    text:
                        "Penaltı ağlarla buluştu!",
                    reward: 5
                },
                {
                    title: "🥅 DİREK!",
                    text:
                        "Top direkten döndü.",
                    reward: 0
                },
                {
                    title: "🧤 KURTARDI!",
                    text:
                        "🧤 Axera Kalecisi penaltıyı kurtardı!",
                    reward: 0
                }
            ];

            const result =
                outcomes[
                    Math.floor(
                        Math.random() *
                        outcomes.length
                    )
                ];

            if (result.reward > 0) {

                const changed =
                    await changeValue(
                        message.guild,
                        message.member,
                        result.reward
                    );

                if (!changed.ok) {
                    return message.reply(
                        `❌ ${changed.reason}`
                    );
                }

                return message.reply(
                    `${result.title}\n${result.text}\n\n💰 **+${result.reward}M€**\n📈 Yeni değer: **${money(changed.value)}**`
                );
            }

            return message.reply(
                `${result.title}\n${result.text}\n\n💰 Değer değişmedi.`
            );
        }

        /* =====================================================
           DEĞER VER
           ===================================================== */

        if (
            command === "dver"
        ) {

            if (
                !isValueStaff(
                    message.member
                )
            ) {
                return message.reply(
                    "❌ Bu komutu yalnızca Değer Yetkilisi kullanabilir."
                );
            }

            const id =
                mentionId(args[0]);

            const amount =
                Number(args[1]);

            if (
                !id ||
                !Number.isFinite(amount) ||
                amount <= 0
            ) {
                return message.reply(
                    "❌ Kullanım: `.dver @Oyuncu 5`"
                );
            }

            const target =
                await message.guild.members
                    .fetch(id)
                    .catch(() => null);

            if (!target) {
                return message.reply(
                    "❌ Oyuncu bulunamadı."
                );
            }

            const result =
                await changeValue(
                    message.guild,
                    target,
                    amount
                );

            if (!result.ok) {
                return message.reply(
                    `❌ ${result.reason}`
                );
            }

            return message.reply(
                `✅ ${target} oyuncusuna **+${money(amount)}** değer verildi.\n📈 Yeni değer: **${money(result.value)}**`
            );
        }

        /* =====================================================
           DEĞER SİL
           ===================================================== */

        if (
            command === "dsil"
        ) {

            if (
                !isValueStaff(
                    message.member
                )
            ) {
                return message.reply(
                    "❌ Bu komutu yalnızca Değer Yetkilisi kullanabilir."
                );
            }

            const id =
                mentionId(args[0]);

            const amount =
                Number(args[1]);

            if (
                !id ||
                !Number.isFinite(amount) ||
                amount <= 0
            ) {
                return message.reply(
                    "❌ Kullanım: `.dsil @Oyuncu 5`"
                );
            }

            const target =
                await message.guild.members
                    .fetch(id)
                    .catch(() => null);

            if (!target) {
                return message.reply(
                    "❌ Oyuncu bulunamadı."
                );
            }

            const result =
                await changeValue(
                    message.guild,
                    target,
                    -amount
                );

            if (!result.ok) {
                return message.reply(
                    `❌ ${result.reason}`
                );
            }

            return message.reply(
                `✅ ${target} oyuncusundan **${money(amount)}** değer silindi.\n📉 Yeni değer: **${money(result.value)}**`
            );
        }

        /* =====================================================
           BÜTÇE
           ===================================================== */

        if (
            command === "bütçe" ||
            command === "butce"
        ) {

            const id =
                mentionId(args[0]) ||
                message.author.id;

            const member =
                await message.guild.members
                    .fetch(id)
                    .catch(() => null);

            if (!member) {
                return message.reply(
                    "❌ Oyuncu bulunamadı."
                );
            }

            const user =
                getUser(id);

            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(
                            "💳 KİŞİSEL BÜTÇE"
                        )
                        .setDescription(
                            `${member}\n\n💰 Bütçe: **${money(user.budget)}**`
                        )
                ]
            });
        }

        /* =====================================================
           PARA GÖNDER
           ===================================================== */

        if (
            command === "gönder" ||
            command === "gonder"
        ) {

            const targetId =
                mentionId(args[0]);

            const amount =
                parseMoney(args[1]);

            if (
                !targetId ||
                !Number.isFinite(amount) ||
                amount <= 0
            ) {
                return message.reply(
                    "❌ Kullanım: `.gönder @Oyuncu 50M`"
                );
            }

            if (
                targetId ===
                message.author.id
            ) {
                return message.reply(
                    "❌ Kendine para gönderemezsin."
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

            const sender =
                getUser(
                    message.author.id
                );

            const receiver =
                getUser(target.id);

            if (
                sender.budget < amount
            ) {
                return message.reply(
                    `❌ Yeterli bütçen yok.\n💰 Bütçen: **${money(sender.budget)}**`
                );
            }

            sender.budget -= amount;
            receiver.budget += amount;

            saveData();

            return message.reply(
                `✅ ${target} kişisine **${money(amount)}** gönderildi.`
            );
        }

        /* =====================================================
           PARA EKLE
           ===================================================== */

        if (
            command === "paraekle"
        ) {

            if (
                !isValueStaff(
                    message.member
                )
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            const id =
                mentionId(args[0]);

            const amount =
                parseMoney(args[1]);

            if (
                !id ||
                !Number.isFinite(amount) ||
                amount <= 0
            ) {
                return message.reply(
                    "❌ Kullanım: `.paraekle @Oyuncu 50M`"
                );
            }

            const user =
                getUser(id);

            user.budget += amount;

            saveData();

            return message.reply(
                `✅ <@${id}> bütçesine **${money(amount)}** eklendi.`
            );
        }

        /* =====================================================
           PARA SİL
           ===================================================== */

        if (
            command === "parasil"
        ) {

            if (
                !isValueStaff(
                    message.member
                )
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            const id =
                mentionId(args[0]);

            const amount =
                parseMoney(args[1]);

            if (
                !id ||
                !Number.isFinite(amount) ||
                amount <= 0
            ) {
                return message.reply(
                    "❌ Kullanım: `.parasil @Oyuncu 20M`"
                );
            }

            const user =
                getUser(id);

            user.budget =
                Math.max(
                    0,
                    user.budget - amount
                );

            saveData();

            return message.reply(
                `✅ <@${id}> bütçesinden **${money(amount)}** silindi.`
            );
        }

        /* =====================================================
           PARA AYARLA
           ===================================================== */

        if (
            command === "paraayarla"
        ) {

            if (
                !isValueStaff(
                    message.member
                )
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            const id =
                mentionId(args[0]);

            const amount =
                parseMoney(args[1]);

            if (
                !id ||
                !Number.isFinite(amount) ||
                amount < 0
            ) {
                return message.reply(
                    "❌ Kullanım: `.paraayarla @Oyuncu 100M`"
                );
            }

            const user =
                getUser(id);

            user.budget =
                amount;

            saveData();

            return message.reply(
                `✅ <@${id}> bütçesi **${money(amount)}** olarak ayarlandı.`
            );
        }

        /* =====================================================
           TAKIM EKLE
           ===================================================== */

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
                    "❌ Bu komutu yalnızca Maç Yetkilisi kullanabilir."
                );
            }

            const roleId =
                mentionId(args[0]);

            if (!roleId) {
                return message.reply(
                    "❌ Kullanım: `.takımekle @Takım`"
                );
            }

            const role =
                message.guild.roles.cache.get(
                    roleId
                );

            if (!role) {
                return message.reply(
                    "❌ Takım rolü bulunamadı."
                );
            }

            if (data.teams[roleId]) {
                return message.reply(
                    "❌ Bu takım zaten kayıtlı."
                );
            }

            data.teams[roleId] = {
                id: roleId,
                name: role.name,
                manualValue: 0,
                totalValue: 0,
                formation: "4-4-2",
                players: {},
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

            ensureStanding(
                roleId,
                role.name
            );

            saveData();
            await updateStandings();

            return message.reply(
                `✅ **${role.name}** takımı sisteme eklendi.`
            );
        }

        /* =====================================================
           TAKIM KALDIR
           ===================================================== */

        if (
            command === "takımkaldır" ||
            command === "takimkaldir" ||
            command === "takımkaldir" ||
            command === "takimkaldır"
        ) {

            if (
                !isMatchStaff(
                    message.member
                )
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            const roleId =
                mentionId(args[0]);

            if (!roleId) {
                return message.reply(
                    "❌ Kullanım: `.takımkaldır @Takım`"
                );
            }

            if (
                data.activeMatches[roleId]
            ) {
                return message.reply(
                    "❌ Bu takım aktif bir maçta."
                );
            }

            if (!data.teams[roleId]) {
                return message.reply(
                    "❌ Takım bulunamadı."
                );
            }

            delete data.teams[roleId];
            delete data.standings[roleId];

            data.fixtures =
                data.fixtures.filter(
                    f =>
                        f.team1 !== roleId &&
                        f.team2 !== roleId
                );

            for (
                const cupId of
                Object.keys(data.cups)
            ) {
                if (
                    data.cups[cupId].teamId ===
                    roleId
                ) {
                    delete data.cups[cupId];
                }
            }

            saveData();
            await updateStandings();

            return message.reply(
                "✅ Takım ve bağlı verileri kaldırıldı."
            );
        }

        /* =====================================================
           TAKIM DEĞERİ
           ===================================================== */

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
                    "❌ Yetkin yok."
                );
            }

            const id =
                mentionId(args[0]);

            const amount =
                parseMoney(args[1]);

            if (
                !id ||
                !data.teams[id] ||
                !Number.isFinite(amount) ||
                amount < 0
            ) {
                return message.reply(
                    "❌ Kullanım: `.takımdeğer @Takım 850`"
                );
            }

            data.teams[id].manualValue =
                amount;

            teamValue(id);

            saveData();

            return message.reply(
                `✅ **${data.teams[id].name}** temel takım değeri **${money(amount)}** olarak ayarlandı.\n💎 Toplam: **${money(teamValue(id))}**`
            );
        }

        /* =====================================================
           KADRO EKLE
           ===================================================== */

        if (
            command === "kadroekle"
        ) {

            if (
                !isMatchStaff(
                    message.member
                )
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            const teamId =
                mentionId(args[0]);

            const playerId =
                mentionId(args[1]);

            const position =
                String(args[2] || "")
                    .toUpperCase();

            if (
                !teamId ||
                !playerId ||
                !POSITIONS.includes(
                    position
                )
            ) {
                return message.reply(
                    `❌ Kullanım: \`.kadroekle @Takım @Oyuncu Pozisyon\`\nPozisyonlar: ${POSITIONS.join(", ")}`
                );
            }

            const team =
                data.teams[teamId];

            if (!team) {
                return message.reply(
                    "❌ Takım bulunamadı."
                );
            }

            const player =
                await message.guild.members
                    .fetch(playerId)
                    .catch(() => null);

            if (!player) {
                return message.reply(
                    "❌ Oyuncu bulunamadı."
                );
            }

            team.players[playerId] = {
                id: playerId,
                name:
                    player.nickname ||
                    player.user.username,
                position,
                value:
                    getPlayerValue(player)
            };

            teamValue(teamId);

            saveData();

            return message.reply(
                `✅ ${player} **${team.name}** kadrosuna **${position}** olarak eklendi.`
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

            if (
                !isMatchStaff(
                    message.member
                )
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            const teamId =
                mentionId(args[0]);

            const playerId =
                mentionId(args[1]);

            if (
                !teamId ||
                !playerId ||
                !data.teams[teamId]
            ) {
                return message.reply(
                    "❌ Kullanım: `.kadrocikar @Takım @Oyuncu`"
                );
            }

            const team =
                data.teams[teamId];

            if (
                !team.players[playerId]
            ) {
                return message.reply(
                    "❌ Oyuncu bu takımda değil."
                );
            }

            delete team.players[playerId];

            teamValue(teamId);
            saveData();

            return message.reply(
                "✅ Oyuncu kadrodan çıkarıldı."
            );
        }

        /* =====================================================
           KADRO
           ===================================================== */

        if (
            command === "kadro"
        ) {

            const teamId =
                mentionId(args[0]);

            if (
                !teamId ||
                !data.teams[teamId]
            ) {
                return message.reply(
                    "❌ Kullanım: `.kadro @Takım`"
                );
            }

            teamValue(teamId);

            return message.reply({
                embeds: [
                    squadEmbed(teamId)
                ]
            });
        }

        /* =====================================================
           FORMASYON
           ===================================================== */

        if (
            command === "formasyon"
        ) {

            if (
                !isMatchStaff(
                    message.member
                )
            ) {
                return message.reply(
                    "❌ Bu komutu yalnızca Maç Yetkilisi kullanabilir."
                );
            }

            const teamId =
                mentionId(args[0]);

            if (
                !teamId ||
                !data.teams[teamId]
            ) {
                return message.reply(
                    "❌ Kullanım: `.formasyon @Takım`"
                );
            }

            return message.reply({
                content:
                    `📐 **${data.teams[teamId].name}** için formasyon seç:`,
                components: [
                    formationMenu(teamId)
                ]
            });
        }

        /* =====================================================
           PUAN
           ===================================================== */

        if (
            command === "puan"
        ) {
            return message.reply({
                embeds: [
                    standingsEmbed()
                ]
            });
        }

        /* =====================================================
           PUAN EKLE
           ===================================================== */

        if (
            command === "puanekle"
        ) {

            if (
                !isMatchStaff(
                    message.member
                )
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            const id =
                mentionId(args[0]);

            const amount =
                Number(args[1]);

            if (
                !id ||
                !data.standings[id] ||
                !Number.isFinite(amount)
            ) {
                return message.reply(
                    "❌ Kullanım: `.puanekle @Takım 3`"
                );
            }

            data.standings[id].P +=
                amount;

            saveData();
            await updateStandings();

            return message.reply(
                `✅ **${data.standings[id].name}** takımına **${amount}** puan eklendi.`
            );
        }

        /* =====================================================
           MAÇ
           ===================================================== */

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
                    "❌ Bu komutu yalnızca Maç Yetkilisi kullanabilir."
                );
            }

            if (
                !onlyChannel(
                    message,
                    CHANNELS.MAC
                )
            ) return;

            const team1 =
                mentionId(args[0]);

            const team2 =
                mentionId(args[1]);

            if (
                !team1 ||
                !team2 ||
                !data.teams[team1] ||
                !data.teams[team2]
            ) {
                return message.reply(
                    "❌ Kullanım: `.maç @Takım1 @Takım2`"
                );
            }

            if (team1 === team2) {
                return message.reply(
                    "❌ Aynı takım kendisiyle oynayamaz."
                );
            }

            if (
                data.activeMatches[team1] ||
                data.activeMatches[team2]
            ) {
                return message.reply(
                    "❌ Takımlardan biri zaten aktif maçta."
                );
            }

            const match =
                await startMatch(
                    team1,
                    team2
                );

            if (!match) {
                return message.reply(
                    "❌ Maç başlatılamadı."
                );
            }

            return;
        }

        /* =====================================================
           FİKSTÜR
           ===================================================== */

        if (
            command === "fikstur" ||
            command === "fikstür"
        ) {

            const embed =
                new EmbedBuilder()
                    .setTitle(
                        "📅 AXERA LEAGUE FİKSTÜR"
                    )
                    .setDescription(
                        fixtureText()
                    )
                    .setFooter({
                        text:
                            "Axera League • Fikstür"
                    });

            return message.reply({
                embeds: [embed]
            });
        }

        /* =====================================================
           FİKSTÜR EKLE
           ===================================================== */

        if (
            command === "fiksturekle" ||
            command === "fikstürekle"
        ) {

            if (
                !isMatchStaff(
                    message.member
                )
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            const team1 =
                mentionId(args[0]);

            const team2 =
                mentionId(args[1]);

            const date =
                args[2];

            const time =
                args[3];

            if (
                !team1 ||
                !team2 ||
                !data.teams[team1] ||
                !data.teams[team2] ||
                !date ||
                !time
            ) {
                return message.reply(
                    "❌ Kullanım: `.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`"
                );
            }

            const timestamp =
                new Date(
                    `${date}T${time}`
                ).getTime();

            if (
                !Number.isFinite(timestamp)
            ) {
                return message.reply(
                    "❌ Tarih veya saat hatalı."
                );
            }

            const fixture = {
                id:
                    data.nextFixtureId++,
                team1,
                team2,
                team1Name:
                    data.teams[team1].name,
                team2Name:
                    data.teams[team2].name,
                date,
                time,
                status:
                    "BEKLIYOR",
                score1: null,
                score2: null,
                startedAt: null,
                finishedAt: null
            };

            data.fixtures.push(
                fixture
            );

            saveData();

            return message.reply(
                `✅ Fikstüre eklendi:\n**${fixture.team1Name}** 🆚 **${fixture.team2Name}**\n📅 ${date} ${time}`
            );
        }

        /* =====================================================
           FİKSTÜR ÇIKAR
           ===================================================== */

        if (
            command === "fiksturcikar" ||
            command === "fikstürcikar"
        ) {

            if (
                !isMatchStaff(
                    message.member
                )
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            const team1 =
                mentionId(args[0]);

            const team2 =
                mentionId(args[1]);

            if (!team1 || !team2) {
                return message.reply(
                    "❌ Kullanım: `.fiksturcikar @Takım1 @Takım2`"
                );
            }

            const pending =
                data.fixtures.filter(
                    f =>
                        f.team1 === team1 &&
                        f.team2 === team2 &&
                        f.status === "BEKLIYOR"
                );

            if (pending.length === 0) {
                return message.reply(
                    "❌ Bekleyen böyle bir fikstür bulunamadı."
                );
            }

            if (pending.length > 1) {
                return message.reply(
                    "❌ Birden fazla fikstür var. Tarih/saat bilgisiyle işlem yap."
                );
            }

            const id =
                pending[0].id;

            data.fixtures =
                data.fixtures.filter(
                    f => f.id !== id
                );

            saveData();

            return message.reply(
                "✅ Fikstür kaldırıldı."
            );
        }

        /* =====================================================
           KUPA EKLE
           ===================================================== */

        if (
            command === "kupaekle"
        ) {

            if (
                !isMatchStaff(
                    message.member
                )
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            const name =
                args.join(" ").trim();

            if (!name) {
                return message.reply(
                    "❌ Kullanım: `.kupaekle Kupa Adı`"
                );
            }

            const id =
                `cup_${Date.now()}`;

            data.cups[id] = {
                id,
                name,
                teamId: null,
                description:
                    "Henüz bir takıma verilmedi.",
                createdAt:
                    Date.now()
            };

            saveData();

            return message.reply(
                `✅ **${name}** kupası oluşturuldu.`
            );
        }

        /* =====================================================
           KUPA VER
           ===================================================== */

        if (
            command === "kupaver"
        ) {

            if (
                !isMatchStaff(
                    message.member
                )
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            const teamId =
                mentionId(args[0]);

            const cupName =
                args.slice(1)
                    .join(" ")
                    .trim();

            if (
                !teamId ||
                !data.teams[teamId] ||
                !cupName
            ) {
                return message.reply(
                    "❌ Kullanım: `.kupaver @Takım Kupa Adı`"
                );
            }

            const cup =
                Object.values(
                    data.cups
                ).find(
                    c =>
                        c.name
                            .toLocaleLowerCase(
                                "tr-TR"
                            ) ===
                        cupName
                            .toLocaleLowerCase(
                                "tr-TR"
                            )
                );

            if (!cup) {
                return message.reply(
                    "❌ Bu isimde kupa bulunamadı."
                );
            }

            cup.teamId =
                teamId;

            cup.description =
                `${data.teams[teamId].name} tarafından kazanıldı.`;

            cup.wonAt =
                Date.now();

            saveData();

            return message.reply(
                `🏆 **${cup.name}** kupası **${data.teams[teamId].name}** takımına verildi.`
            );
        }

        /* =====================================================
           KUPA SİL
           ===================================================== */

        if (
            command === "kupasil"
        ) {

            if (
                !isMatchStaff(
                    message.member
                )
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            const name =
                args.join(" ").trim();

            if (!name) {
                return message.reply(
                    "❌ Kullanım: `.kupasil Kupa Adı`"
                );
            }

            const entry =
                Object.entries(
                    data.cups
                ).find(
                    ([, c]) =>
                        c.name
                            .toLocaleLowerCase(
                                "tr-TR"
                            ) ===
                        name
                            .toLocaleLowerCase(
                                "tr-TR"
                            )
                );

            if (!entry) {
                return message.reply(
                    "❌ Kupa bulunamadı."
                );
            }

            delete data.cups[
                entry[0]
            ];

            saveData();

            return message.reply(
                "✅ Kupa silindi."
            );
        }

        /* =====================================================
           TAKIM KUPALARI
           ===================================================== */

        if (
            command === "kupalar"
        ) {

            const teamId =
                mentionId(args[0]);

            if (
                !teamId ||
                !data.teams[teamId]
            ) {
                return message.reply(
                    "❌ Kullanım: `.kupalar @Takım`"
                );
            }

            return message.reply({
                embeds: [
                    cupEmbed(teamId)
                ]
            });
        }

        /* =====================================================
           MÜZE
           ===================================================== */

        if (
            command === "müze" ||
            command === "muze"
        ) {

            return message.reply({
                embeds: [
                    museumEmbed()
                ]
            });
        }

        /* =====================================================
           MÜZE EKLE
           ===================================================== */

        if (
            command === "müzeekle" ||
            command === "muzeekle"
        ) {

            if (
                !isMatchStaff(
                    message.member
                )
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            const raw =
                args.join(" ");

            const split =
                raw.split("|");

            const name =
                split[0]?.trim();

            const description =
                split.slice(1)
                    .join("|")
                    .trim();

            if (!name) {
                return message.reply(
                    "❌ Kullanım: `.müzeekle Kupa | Açıklama`"
                );
            }

            data.museum.push({
                id:
                    `museum_${Date.now()}`,
                name,
                description:
                    description ||
                    "Axera League tarih arşivi.",
                createdAt:
                    Date.now()
            });

            saveData();

            return message.reply(
                `🏛️ **${name}** müzeye eklendi.`
            );
        }

        /* =====================================================
           MÜZE SİL
           ===================================================== */

        if (
            command === "müzesil" ||
            command === "muzesil"
        ) {

            if (
                !isMatchStaff(
                    message.member
                )
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            const name =
                args.join(" ").trim();

            const index =
                data.museum.findIndex(
                    x =>
                        x.name
                            .toLocaleLowerCase(
                                "tr-TR"
                            ) ===
                        name
                            .toLocaleLowerCase(
                                "tr-TR"
                            )
                );

            if (index === -1) {
                return message.reply(
                    "❌ Müze kaydı bulunamadı."
                );
            }

            data.museum.splice(
                index,
                1
            );

            saveData();

            return message.reply(
                "✅ Müze kaydı silindi."
            );
        }

        /* =====================================================
           ASİST KRALI
           ===================================================== */

        if (
            command === "asistkral" ||
            command === "asistkralı"
        ) {

            const entries =
                Object.entries(
                    data.assists
                ).sort(
                    (a, b) =>
                        b[1] - a[1]
                );

            if (!entries.length) {
                return message.reply(
                    "👟 Henüz asist kaydı bulunmuyor."
                );
            }

            const lines =
                entries
                    .slice(0, 10)
                    .map(
                        ([id, count], i) =>
                            `**${i + 1}.** <@${id}> — **${count} asist**`
                    );

            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(
                            "👟 AXERA LEAGUE ASİST KRALI"
                        )
                        .setDescription(
                            lines.join("\n")
                        )
                ]
            });
        }

        /* =====================================================
           GOL KRALI
           ===================================================== */

        if (
            command === "golkrali" ||
            command === "golkralligi"
        ) {

            const entries =
                Object.entries(
                    data.goals
                ).sort(
                    (a, b) =>
                        b[1] - a[1]
                );

            if (!entries.length) {
                return message.reply(
                    "⚽ Henüz gol kaydı bulunmuyor."
                );
            }

            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(
                            "⚽ AXERA LEAGUE GOL KRALI"
                        )
                        .setDescription(
                            entries
                                .slice(0, 10)
                                .map(
                                    ([id, count], i) =>
                                        `**${i + 1}.** <@${id}> — **${count} gol**`
                                )
                                .join("\n")
                        )
                ]
            });
        }

        /* =====================================================
           TWEET
           ===================================================== */

        if (
            command === "tweet"
        ) {

            const text =
                args.join(" ").trim();

            if (!text) {
                return message.reply(
                    "❌ Kullanım: `.tweet mesaj`"
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
                    .setDescription(text)
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
           DM TEK OYUNCU
           ===================================================== */

        if (
            command === "dm"
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

            /*
               .dm all intentionally yok.
               Sadece belirli kullanıcıya DM.
            */

            if (
                args[0]?.toLowerCase() ===
                "all"
            ) {
                return message.reply(
                    "❌ `.dm all` devre dışıdır. Tek oyuncuya göndermek için `.dm @Oyuncu mesaj` kullan."
                );
            }

            const targetId =
                mentionId(args[0]);

            const text =
                args.slice(1)
                    .join(" ")
                    .trim();

            if (
                !targetId ||
                !text
            ) {
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

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            "📩 AXERA LEAGUE"
                        )
                        .setDescription(text)
                        .setFooter({
                            text:
                                `Gönderen: ${message.guild.name}`
                        })
                        .setTimestamp();

                await target.send({
                    embeds: [embed]
                });

                return message.reply(
                    `✅ ${target} kişisine DM gönderildi.`
                );

            } catch {
                return message.reply(
                    "❌ Bu kullanıcıya DM gönderilemedi. DM'leri kapalı olabilir."
                );
            }
        }

        /* =====================================================
           SİL
           ===================================================== */

        if (
            command === "sil"
        ) {

            if (
                !isAdmin(
                    message.member
                )
            ) {
                return message.reply(
                    "❌ Yetkin yok."
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
                    "❌ 1 ile 1000 arasında bir sayı gir."
                );
            }

            await message.channel.bulkDelete(
                amount + 1,
                true
            ).catch(() => {});

            return;
        }

        /* =====================================================
           EMBED
           ===================================================== */

        if (
            command === "embed"
        ) {

            if (
                !isAdmin(
                    message.member
                )
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            const raw =
                args.join(" ");

            const split =
                raw.split("|");

            const title =
                split[0]?.trim();

            const description =
                split.slice(1)
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
                        .setTitle(title)
                        .setDescription(
                            description
                        )
                        .setTimestamp()
                ]
            });
        }

        /* =====================================================
           KICK
           ===================================================== */

        if (
            command === "kick"
        ) {

            if (
                !isAdmin(
                    message.member
                )
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            const id =
                mentionId(args[0]);

            if (!id) {
                return message.reply(
                    "❌ Kullanım: `.kick @Oyuncu`"
                );
            }

            const target =
                await message.guild.members
                    .fetch(id)
                    .catch(() => null);

            if (!target) {
                return message.reply(
                    "❌ Oyuncu bulunamadı."
                );
            }

            try {
                await target.kick();
            } catch {
                return message.reply(
                    "❌ Oyuncu atılamadı."
                );
            }

            return message.reply(
                `👢 ${target.user.tag} sunucudan atıldı.`
            );
        }

        /* =====================================================
           BAN
           ===================================================== */

        if (
            command === "ban"
        ) {

            if (
                !isAdmin(
                    message.member
                )
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            const id =
                mentionId(args[0]);

            if (!id) {
                return message.reply(
                    "❌ Kullanım: `.ban @Oyuncu`"
                );
            }

            const target =
                await message.guild.members
                    .fetch(id)
                    .catch(() => null);

            if (!target) {
                return message.reply(
                    "❌ Oyuncu bulunamadı."
                );
            }

            try {
                await target.ban({
                    reason:
                        "Axera League moderasyon işlemi"
                });
            } catch {
                return message.reply(
                    "❌ Oyuncu banlanamadı."
                );
            }

            return message.reply(
                `🔨 ${target.user.tag} banlandı.`
            );
        }

        /* =====================================================
           MUTE
           ===================================================== */

        if (
            command === "mute"
        ) {

            if (
                !isAdmin(
                    message.member
                )
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            const id =
                mentionId(args[0]);

            if (!id) {
                return message.reply(
                    "❌ Kullanım: `.mute @Oyuncu`"
                );
            }

            const target =
                await message.guild.members
                    .fetch(id)
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
            } catch {
                return message.reply(
                    "❌ Oyuncu susturulamadı."
                );
            }

            return message.reply(
                `🔇 ${target} **10 dakika** susturuldu.`
            );
        }

        /* =====================================================
           UNMUTE
           ===================================================== */

        if (
            command === "unmute"
        ) {

            if (
                !isAdmin(
                    message.member
                )
            ) {
                return message.reply(
                    "❌ Yetkin yok."
                );
            }

            const id =
                mentionId(args[0]);

            if (!id) {
                return message.reply(
                    "❌ Kullanım: `.unmute @Oyuncu`"
                );
            }

            const target =
                await message.guild.members
                    .fetch(id)
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
            } catch {
                return message.reply(
                    "❌ Susturma kaldırılamadı."
                );
            }

            return message.reply(
                `🔊 ${target} oyuncusunun susturması kaldırıldı.`
            );
        }
    }
);

/* =========================================================
   FIXTURE SCHEDULER
   ========================================================= */

setInterval(
    async () => {

        if (!client.isReady()) return;

        for (const fixture of data.fixtures) {

            if (
                fixture.status !== "BEKLIYOR"
            ) {
                continue;
            }

            const target =
                new Date(
                    `${fixture.date}T${fixture.time}`
                ).getTime();

            if (
                !Number.isFinite(target)
            ) {
                continue;
            }

            if (
                target <= Date.now()
            ) {

                if (
                    data.activeMatches[
                        fixture.team1
                    ] ||
                    data.activeMatches[
                        fixture.team2
                    ]
                ) {
                    continue;
                }

                fixture.status =
                    "BAŞLIYOR";

                fixture.startedAt =
                    Date.now();

                saveData();

                const match =
                    await startMatch(
                        fixture.team1,
                        fixture.team2,
                        fixture
                    );

                if (!match) {
                    fixture.status =
                        "HATA";

                    saveData();
                }
            }
        }
    },
    1000
);

/* =========================================================
   ERROR HANDLERS
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

/* =========================================================
   LOGIN
   ========================================================= */

if (!TOKEN) {
    console.error(
        "❌ TOKEN bulunamadı. .env dosyasına TOKEN=... ekle."
    );
    process.exit(1);
}

client.login(TOKEN);
