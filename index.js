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

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "database.json");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

let database = {};

if (fs.existsSync(DB_FILE)) {
    try {
        database = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    } catch {
        database = {};
    }
}

function saveDatabase() {
    fs.writeFileSync(DB_FILE, JSON.stringify(database, null, 2));
}

function guildDB(guildId) {
    if (!database[guildId]) {
        database[guildId] = {
            users: {},
            teams: {},
            fixtures: [],
            matches: [],
            points: {},
            trophies: [],
            assists: {},
            tickets: {}
        };
    }

    const db = database[guildId];

    if (!db.users) db.users = {};
    if (!db.teams) db.teams = {};
    if (!db.fixtures) db.fixtures = [];
    if (!db.matches) db.matches = [];
    if (!db.points) db.points = {};
    if (!db.trophies) db.trophies = [];
    if (!db.assists) db.assists = {};
    if (!db.tickets) db.tickets = {};

    return db;
}

function isOwner(message) {
    return message.author.id === OWNER_ID;
}

function isAdmin(message) {
    return isOwner(message) ||
        message.member?.permissions?.has(PermissionsBitField.Flags.Administrator);
}

function hasRole(member, roleId) {
    return member?.roles?.cache?.has(roleId);
}

function isValueStaff(message) {
    return isOwner(message) || hasRole(message.member, ROLE_IDS.degerYetkilisi);
}

function isRegistrationStaff(message) {
    return isOwner(message) || hasRole(message.member, ROLE_IDS.kayitYetkilisi);
}

function isSpiker(message) {
    return isOwner(message) || hasRole(message.member, ROLE_IDS.spiker);
}

function normalize(text) {
    return text
        .toLocaleLowerCase("tr-TR")
        .replace(/ı/g, "i")
        .replace(/ğ/g, "g")
        .replace(/ü/g, "u")
        .replace(/ş/g, "s")
        .replace(/ö/g, "o")
        .replace(/ç/g, "c");
}

function getChannel(guild, id, name = null) {
    return guild.channels.cache.get(id) ||
        (name ? guild.channels.cache.find(c => normalize(c.name) === normalize(name)) : null);
}

function getRole(guild, id, name = null) {
    return guild.roles.cache.get(id) ||
        (name ? guild.roles.cache.find(r => normalize(r.name) === normalize(name)) : null);
}

function getTeamNameByRoleId(roleId) {
    return Object.entries(TEAM_ROLE_IDS)
        .find(([, id]) => id === roleId)?.[0] || null;
}

function getTeamRole(guild, teamName) {
    const roleId = TEAM_ROLE_IDS[teamName];
    if (!roleId) return null;
    return guild.roles.cache.get(roleId);
}

function getTeamFromMember(member) {
    for (const [team, roleId] of Object.entries(TEAM_ROLE_IDS)) {
        if (member.roles.cache.has(roleId)) return team;
    }
    return null;
}

function parseAmount(text) {
    if (!text) return NaN;

    return Number(
        text
            .replace(/[€₺$]/g, "")
            .replace(/m/gi, "")
            .replace(",", ".")
    );
}

function formatValue(value) {
    return `${Number(value || 0).toFixed(2).replace(/\.00$/, "")}M€`;
}

function ensureUser(db, memberOrId) {
    const id = typeof memberOrId === "string"
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
            assists: 0
        };
    }

    const user = db.users[id];

    if (typeof user.value !== "number") user.value = 0;
    if (typeof user.budget !== "number") user.budget = 0;
    if (typeof user.training !== "number") user.training = 0;
    if (typeof user.goals !== "number") user.goals = 0;
    if (typeof user.assists !== "number") user.assists = 0;

    return user;
}

function extractValueFromNickname(nickname) {
    if (!nickname) return 0;

    const match = nickname.match(/(-?\d+(?:[.,]\d+)?)\s*M€\s*$/i);

    if (!match) return 0;

    return Number(match[1].replace(",", "."));
}

function updateNicknameValue(member, newValue) {
    const current = member.nickname || member.user.username;
    const valueText = formatValue(Math.max(0, newValue));

    if (/\d+(?:[.,]\d+)?\s*M€\s*$/i.test(current)) {
        const updated = current.replace(
            /\d+(?:[.,]\d+)?\s*M€\s*$/i,
            valueText
        );

        return member.setNickname(updated).catch(() => {});
    }

    return member.setNickname(`${current} | ${valueText}`).catch(() => {});
}

async function setPlayerValue(guild, member, amount) {
    const db = guildDB(guild.id);
    const user = ensureUser(db, member);

    user.value = Math.max(0, Number(amount) || 0);

    await updateNicknameValue(member, user.value);

    saveDatabase();

    return user.value;
}

async function addPlayerValue(guild, member, amount) {
    const db = guildDB(guild.id);
    const user = ensureUser(db, member);

    const currentNicknameValue = extractValueFromNickname(
        member.nickname || member.user.username
    );

    if (
        currentNicknameValue > 0 &&
        (!user.value || user.value === 0)
    ) {
        user.value = currentNicknameValue;
    }

    user.value += Number(amount) || 0;

    await updateNicknameValue(member, user.value);

    saveDatabase();

    return user.value;
}

async function subtractPlayerValue(guild, member, amount) {
    const db = guildDB(guild.id);
    const user = ensureUser(db, member);

    const currentNicknameValue = extractValueFromNickname(
        member.nickname || member.user.username
    );

    if (
        currentNicknameValue > 0 &&
        (!user.value || user.value === 0)
    ) {
        user.value = currentNicknameValue;
    }

    user.value = Math.max(0, user.value - (Number(amount) || 0));

    await updateNicknameValue(member, user.value);

    saveDatabase();

    return user.value;
}

function getMentionedTeamRoles(message) {
    const roles = [...message.mentions.roles.values()];

    return roles
        .map(role => ({
            role,
            name: getTeamNameByRoleId(role.id)
        }))
        .filter(x => x.name);
}

function getMentionedMember(message) {
    return message.mentions.members.first();
}

function getPlayerSquad(db, team) {
    if (!db.teams[team]) {
        db.teams[team] = {
            players: [],
            budget: 0
        };
    }

    if (!Array.isArray(db.teams[team].players)) {
        db.teams[team].players = [];
    }

    return db.teams[team].players;
}

function findPlayerByMember(db, memberId) {
    return db.users[memberId] || null;
}

function getSquadWithNPCs(guild, team) {
    const db = guildDB(guild.id);
    const squad = getPlayerSquad(db, team);

    const realPlayers = squad
        .map(p => {
            const user = db.users[p.userId];

            if (!user) return null;

            return {
                userId: p.userId,
                name: p.name || user.nickname || `Oyuncu`,
                position: p.position || user.position || "OY",
                value: Number(user.value || 0),
                npc: false
            };
        })
        .filter(Boolean);

    const result = [...realPlayers];

    let npcIndex = 1;

    while (result.length < 11) {
        result.push({
            userId: null,
            name: `${team} Akademi NPC ${npcIndex++}`,
            position: "OY",
            value: 1,
            npc: true
        });
    }

    return result.slice(0, 11);
}

function randomItem(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function randomPlayer(squad) {
    return randomItem(squad);
}

const activeMatches = new Map();

function createMatchEmbed(match) {
    const status = match.finished
        ? "🏁 MAÇ SONA ERDİ"
        : "🟢 MAÇ CANLI";

    const minute = match.finished
        ? 90
        : Math.min(match.minute || 0, 90);

    return new EmbedBuilder()
        .setTitle(`⚽ ${match.team1} - ${match.team2}`)
        .setDescription(
            `**${status}**\n\n` +
            `# ${match.score1} - ${match.score2}\n\n` +
            `⏱️ **Dakika:** ${minute}'\n\n` +
            `🏠 **${match.team1}**\n` +
            `⚔️\n` +
            `🚌 **${match.team2}**`
        )
        .addFields(
            {
                name: "📊 Maç Durumu",
                value: match.finished
                    ? `🏁 Final skor: **${match.score1} - ${match.score2}**`
                    : "⚽ Maç devam ediyor..."
            },
            {
                name: "👥 Kadrolar",
                value: `${match.team1}: ${match.squad1.length} oyuncu\n${match.team2}: ${match.squad2.length} oyuncu`
            }
        )
        .setFooter({
            text: "Axera League • Maç Sistemi"
        })
        .setTimestamp();
}

async function updatePointsAfterMatch(guild, match) {
    const db = guildDB(guild.id);

    if (!db.points[match.team1]) {
        db.points[match.team1] = {
            played: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            gf: 0,
            ga: 0,
            points: 0
        };
    }

    if (!db.points[match.team2]) {
        db.points[match.team2] = {
            played: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            gf: 0,
            ga: 0,
            points: 0
        };
    }

    const a = db.points[match.team1];
    const b = db.points[match.team2];

    a.played++;
    b.played++;

    a.gf += match.score1;
    a.ga += match.score2;

    b.gf += match.score2;
    b.ga += match.score1;

    if (match.score1 > match.score2) {
        a.wins++;
        a.points += 3;
        b.losses++;
    } else if (match.score2 > match.score1) {
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

    const channel = getChannel(guild, CHANNEL_IDS.puan, "puan");

    if (!channel) return;

    const sorted = Object.entries(db.points)
        .sort(([, x], [, y]) => {
            if (y.points !== x.points) return y.points - x.points;

            const gdX = x.gf - x.ga;
            const gdY = y.gf - y.ga;

            if (gdY !== gdX) return gdY - gdX;

            return y.gf - x.gf;
        });

    const table = sorted
        .map(([team, data], index) =>
            `**${index + 1}. ${team}** — ${data.points} P | ${data.played} M | ${data.wins} G | ${data.draws} B | ${data.losses} M | ${data.gf}:${data.ga}`
        )
        .join("\n");

    await channel.send({
        embeds: [
            new EmbedBuilder()
                .setTitle("🏆 AXERA LEAGUE PUAN DURUMU")
                .setDescription(table || "Henüz maç oynanmadı.")
                .setFooter({ text: "Axera League • Puan Durumu" })
                .setTimestamp()
        ]
    });
}

async function finishMatch(guild, match) {
    if (match.finished) return;

    match.finished = true;
    match.minute = 90;

    await match.message.edit({
        embeds: [createMatchEmbed(match)]
    }).catch(() => {});

    const db = guildDB(guild.id);

    db.matches.push({
        team1: match.team1,
        team2: match.team2,
        score1: match.score1,
        score2: match.score2,
        date: Date.now()
    });

    await updatePointsAfterMatch(guild, match);

    if (match.fixtureId) {
        const fixture = db.fixtures.find(f => f.id === match.fixtureId);

        if (fixture) {
            fixture.status = "finished";
            fixture.score1 = match.score1;
            fixture.score2 = match.score2;

            if (fixture.messageId) {
                const channel = getChannel(guild, CHANNEL_IDS.fikstur, "fikstur");

                if (channel) {
                    const fixtureMessage = await channel.messages
                        .fetch(fixture.messageId)
                        .catch(() => null);

                    if (fixtureMessage) {
                        await fixtureMessage.edit({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle("📅 AXERA LEAGUE FİKSTÜR")
                                    .setDescription(
                                        `⚽ **${fixture.team1}** vs **${fixture.team2}**\n\n` +
                                        `🏁 **Maç Tamamlandı**\n` +
                                        `📊 Skor: **${match.score1} - ${match.score2}**`
                                    )
                                    .setFooter({ text: "Axera League • Fikstür" })
                                    .setTimestamp()
                            ]
                        }).catch(() => {});
                    }
                }
            }
        }
    }

    saveDatabase();

    if (match.interval) {
        clearInterval(match.interval);
    }

    activeMatches.delete(match.id);
}

async function startMatch(guild, team1, team2, fixture = null) {
    const key = `${guild.id}:${team1}:${team2}`;

    if (activeMatches.has(key)) {
        return null;
    }

    const db = guildDB(guild.id);

    const squad1 = getSquadWithNPCs(guild, team1);
    const squad2 = getSquadWithNPCs(guild, team2);

    const channel = getChannel(guild, CHANNEL_IDS.mac, "mac");

    if (!channel) {
        throw new Error("Maç kanalı bulunamadı.");
    }

    const match = {
        id: `${Date.now()}-${Math.random()}`,
        team1,
        team2,
        score1: 0,
        score2: 0,
        minute: 0,
        started: true,
        finished: false,
        squad1,
        squad2,
        fixtureId: fixture?.id || null,
        message: null,
        interval: null
    };

    const message = await channel.send({
        embeds: [createMatchEmbed(match)]
    });

    match.message = message;
    match.messageId = message.id;

    activeMatches.set(key, match);

    if (fixture) {
        fixture.status = "live";
        fixture.matchId = match.id;
        fixture.messageId = fixture.messageId || null;
    }

    saveDatabase();

    match.interval = setInterval(async () => {
        if (match.finished) {
            clearInterval(match.interval);
            return;
        }

        match.minute++;

        let eventText = null;

        if (match.minute !== 45 && Math.random() < 0.055) {
            const team1Chance = Math.max(
                0.25,
                Math.min(
                    0.75,
                    0.5 +
                    (
                        squad1.reduce((sum, p) => sum + p.value, 0) -
                        squad2.reduce((sum, p) => sum + p.value, 0)
                    ) / 100
                )
            );

            const scoringTeam1 = Math.random() < team1Chance;

            const scoringSquad = scoringTeam1 ? squad1 : squad2;
            const scoringTeam = scoringTeam1 ? team1 : team2;

            const player = randomPlayer(scoringSquad);

            if (scoringTeam1) {
                match.score1++;
            } else {
                match.score2++;
            }

            if (!player.npc && player.userId) {
                const playerData = db.users[player.userId];

                if (playerData) {
                    playerData.goals = (playerData.goals || 0) + 1;
                }
            }

            eventText =
                `⚽ **GOL!** ${scoringTeam} adına **${player.name}** skoru değiştirdi!\n` +
                `📊 **${match.score1} - ${match.score2}**`;
        }

        if (match.minute === 45) {
            eventText = "⏸️ **DEVRE ARASI** — İlk 45 dakika tamamlandı.";
        }

        if (match.minute === 90) {
            await match.message.edit({
                embeds: [createMatchEmbed(match)]
            }).catch(() => {});

            if (eventText) {
                await channel.send(eventText).catch(() => {});
            }

            await finishMatch(guild, match);
            return;
        }

        await match.message.edit({
            embeds: [createMatchEmbed(match)]
        }).catch(() => {});

        if (eventText) {
            await channel.send(eventText).catch(() => {});
        }

        saveDatabase();
    }, 3000);

    return match;
}

function parseDateTime(dateText, timeText) {
    const dateMatch = dateText?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const timeMatch = timeText?.match(/^(\d{1,2}):(\d{2})$/);

    if (!dateMatch || !timeMatch) return null;

    const year = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const day = Number(dateMatch[3]);
    const hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);

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

    return new Date(
        year,
        month - 1,
        day,
        hour,
        minute,
        0
    );
}

async function checkFixtures() {
    for (const guild of client.guilds.cache.values()) {
        const db = guildDB(guild.id);
        const now = Date.now();

        for (const fixture of db.fixtures) {
            if (
                fixture.status === "scheduled" &&
                fixture.timestamp <= now
            ) {
                const active = [...activeMatches.values()]
                    .some(m =>
                        m.team1 === fixture.team1 &&
                        m.team2 === fixture.team2 &&
                        !m.finished
                    );

                if (active) continue;

                await startMatch(
                    guild,
                    fixture.team1,
                    fixture.team2,
                    fixture
                ).catch(console.error);
            }
        }
    }
}

const registrationSessions = new Map();

function registrationButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("register_goalkeeper")
            .setLabel("🧤 Kaleci")
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId("register_member")
            .setLabel("👤 Üye")
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId("register_player")
            .setLabel("⚽ Futbolcu")
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId("register_td")
            .setLabel("📋 Teknik Direktör")
            .setStyle(ButtonStyle.Danger)
    );
}

client.on("guildMemberAdd", async member => {
    const role = getRole(
        member.guild,
        ROLE_IDS.kayitsiz,
        "kayıtsız"
    );

    if (role) {
        await member.roles.add(role).catch(() => {});
    }

    const channel = getChannel(
        member.guild,
        CHANNEL_IDS.kayit,
        "kayıt"
    );

    if (channel) {
        await channel.send(
            `👋 ${member} sunucuya katıldı!\n` +
            `📋 Kayıt için ${getRole(member.guild, ROLE_IDS.kayitYetkilisi)?.toString() || "@Kayıt Yetkilisi"} ilgilenebilir.`
        ).catch(() => {});
    }
});

client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;

    const session = registrationSessions.get(interaction.message.id);

    if (
        interaction.customId.startsWith("register_") &&
        session
    ) {
        if (
            interaction.user.id !== session.targetId
        ) {
            return interaction.reply({
                content: "❌ Bu kayıt paneli başka bir kullanıcı için.",
                ephemeral: true
            });
        }

        const db = guildDB(interaction.guild.id);
        const member = await interaction.guild.members
            .fetch(session.targetId)
            .catch(() => null);

        if (!member) {
            return interaction.reply({
                content: "❌ Kullanıcı bulunamadı.",
                ephemeral: true
            });
        }

        let roleId = null;
        let roleName = "";

        if (interaction.customId === "register_goalkeeper") {
            roleId = ROLE_IDS.kaleci;
            roleName = "Kaleci";
        }

        if (interaction.customId === "register_member") {
            roleId = ROLE_IDS.uye;
            roleName = "Üye";
        }

        if (interaction.customId === "register_player") {
            roleId = ROLE_IDS.futbolcu;
            roleName = "Futbolcu";
        }

        if (interaction.customId === "register_td") {
            roleId = ROLE_IDS.teknikDirektor;
            roleName = "Teknik Direktör";
        }

        if (!roleId) return;

        const role = getRole(interaction.guild, roleId);

        if (role) {
            await member.roles.add(role).catch(() => {});
        }

        const kayitsiz = getRole(
            interaction.guild,
            ROLE_IDS.kayitsiz
        );

        if (kayitsiz) {
            await member.roles.remove(kayitsiz).catch(() => {});
        }

        const user = ensureUser(db, member);

        user.registered = true;
        user.nickname = session.nickname;
        user.position = roleName;

        saveDatabase();

        await interaction.update({
            content:
                `✅ ${member} başarıyla kayıt edildi.\n` +
                `👤 Takma Ad: **${session.nickname}**\n` +
                `🎭 Tür: **${roleName}**`,
            components: []
        });

        registrationSessions.delete(interaction.message.id);

        const chat = getChannel(
            interaction.guild,
            CHANNEL_IDS.sohbet,
            "sohbet"
        );

        if (chat) {
            await chat.send(
                `🎉 Hoş geldin ${member}! **Axera League** ailesine katıldın.`
            ).catch(() => {});
        }

        return;
    }

    if (interaction.customId.startsWith("kap_accept_")) {
        const offerId = interaction.customId.replace("kap_accept_", "");
        const db = guildDB(interaction.guild.id);

        const offer = db.teams.__offers?.find(
            x => x.id === offerId
        );

        if (!offer) {
            return interaction.reply({
                content: "❌ Teklif bulunamadı.",
                ephemeral: true
            });
        }

        if (interaction.user.id !== offer.playerId) {
            return interaction.reply({
                content: "❌ Bu teklif sana ait değil.",
                ephemeral: true
            });
        }

        const member = await interaction.guild.members
            .fetch(offer.playerId)
            .catch(() => null);

        if (!member) return;

        const user = ensureUser(db, member);

        user.team = offer.team;
        user.salary = offer.salary;
        user.seasons = offer.seasons;

        const squad = getPlayerSquad(db, offer.team);

        if (!squad.some(p => p.userId === member.id)) {
            squad.push({
                userId: member.id,
                name: member.nickname || member.user.username,
                position: user.position || "OY"
            });
        }

        const teamRole = getTeamRole(
            interaction.guild,
            offer.team
        );

        if (teamRole) {
            await member.roles.add(teamRole).catch(() => {});
        }

        const index = db.teams.__offers.findIndex(
            x => x.id === offerId
        );

        if (index !== -1) {
            db.teams.__offers.splice(index, 1);
        }

        saveDatabase();

        await interaction.update({
            content:
                `✅ **KAP kabul edildi!**\n\n` +
                `⚽ Oyuncu: ${member}\n` +
                `🏟️ Takım: **${offer.team}**\n` +
                `💰 Maaş: **${formatValue(offer.salary)}**\n` +
                `📅 Sözleşme: **${offer.seasons} sezon**`,
            components: []
        });

        return;
    }

    if (interaction.customId.startsWith("kap_reject_")) {
        const offerId = interaction.customId.replace("kap_reject_", "");
        const db = guildDB(interaction.guild.id);

        const offer = db.teams.__offers?.find(
            x => x.id === offerId
        );

        if (!offer) {
            return interaction.reply({
                content: "❌ Teklif bulunamadı.",
                ephemeral: true
            });
        }

        if (interaction.user.id !== offer.playerId) {
            return interaction.reply({
                content: "❌ Bu teklif sana ait değil.",
                ephemeral: true
            });
        }

        const index = db.teams.__offers.findIndex(
            x => x.id === offerId
        );

        if (index !== -1) {
            db.teams.__offers.splice(index, 1);
        }

        saveDatabase();

        await interaction.update({
            content: "❌ KAP teklifi reddedildi.",
            components: []
        });
    }

    if (interaction.customId === "ticket_create") {
        const guild = interaction.guild;

        const existing = guild.channels.cache.find(
            c => c.name === `ticket-${interaction.user.id}`
        );

        if (existing) {
            return interaction.reply({
                content: `🎫 Zaten açık bir ticketın var: ${existing}`,
                ephemeral: true
            });
        }

        const channel = await guild.channels.create({
            name: `ticket-${interaction.user.id}`,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionsBitField.Flags.ViewChannel]
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

        await channel.send({
            content: `${interaction.user}`,
            embeds: [
                new EmbedBuilder()
                    .setTitle("🎫 Axera League Ticket")
                    .setDescription(
                        "Yetkililer kısa süre içerisinde ilgilenecektir."
                    )
            ],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("ticket_close")
                        .setLabel("🔒 Ticket Kapat")
                        .setStyle(ButtonStyle.Danger)
                )
            ]
        });

        await interaction.reply({
            content: `🎫 Ticket oluşturuldu: ${channel}`,
            ephemeral: true
        });
    }

    if (interaction.customId === "ticket_close") {
        if (!isAdmin({
            author: interaction.user,
            member: interaction.member
        })) {
            return interaction.reply({
                content: "❌ Yetkin yok.",
                ephemeral: true
            });
        }

        await interaction.channel.delete().catch(() => {});
    }
});

client.on("messageCreate", async message => {
    if (message.author.bot) return;
    if (!message.guild) return;
    if (!message.content.startsWith(".")) return;

    const args = message.content.slice(1).trim().split(/\s+/);
    const command = normalize(args.shift() || "");
    const db = guildDB(message.guild.id);

    ensureUser(db, message.member);

    if (command === "k" || command === "kayit") {
        if (!isRegistrationStaff(message)) {
            return message.reply("❌ Bu komutu sadece Kayıt Yetkilisi kullanabilir.");
        }

        const target = getMentionedMember(message);
        const nickname = args.join(" ");

        if (!target || !nickname) {
            return message.reply(
                "❌ Kullanım: `.k @oyuncu TakmaAdı`"
            );
        }

        const channel = getChannel(
            message.guild,
            CHANNEL_IDS.kayit,
            "kayıt"
        );

        if (!channel) {
            return message.reply("❌ Kayıt kanalı bulunamadı.");
        }

        const panel = await channel.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle("📋 AXERA LEAGUE KAYIT")
                    .setDescription(
                        `${target} için kayıt türünü seçin.\n\n` +
                        `👤 Takma Ad: **${nickname}**`
                    )
                    .setFooter({
                        text: "Sadece Kayıt Yetkilisi tarafından başlatılmış kayıtlar"
                    })
            ],
            components: [registrationButtons()]
        });

        registrationSessions.set(panel.id, {
            targetId: target.id,
            nickname
        });

        return message.reply(
            `✅ ${target} için kayıt paneli oluşturuldu: ${panel.url}`
        );
    }

    if (command === "kayitsizver") {
        if (!isRegistrationStaff(message)) {
            return message.reply("❌ Yetkin yok.");
        }

        const target = getMentionedMember(message);

        if (!target) {
            return message.reply(
                "❌ Kullanım: `.kayıtsızver @oyuncu`"
            );
        }

        const roleIds = [
            ROLE_IDS.kaleci,
            ROLE_IDS.uye,
            ROLE_IDS.futbolcu,
            ROLE_IDS.teknikDirektor
        ];

        for (const roleId of roleIds) {
            await target.roles.remove(roleId).catch(() => {});
        }

        for (const roleId of Object.values(TEAM_ROLE_IDS)) {
            await target.roles.remove(roleId).catch(() => {});
        }

        const kayitsiz = getRole(
            message.guild,
            ROLE_IDS.kayitsiz
        );

        if (kayitsiz) {
            await target.roles.add(kayitsiz).catch(() => {});
        }

        const user = ensureUser(db, target);
        user.registered = false;
        user.team = null;

        saveDatabase();

        return message.reply(
            `✅ ${target} tekrar **Kayıtsız** durumuna getirildi.`
        );
    }

    if (
        command === "dver" ||
        command === "degerver"
    ) {
        if (!isValueStaff(message)) {
            return message.reply("❌ Bu komutu sadece Değer Yetkilisi kullanabilir.");
        }

        const target = getMentionedMember(message);
        const amount = parseAmount(args.join(" "));

        if (!target || !Number.isFinite(amount) || amount <= 0) {
            return message.reply(
                "❌ Kullanım: `.dver @oyuncu 5M`"
            );
        }

        const newValue = await addPlayerValue(
            message.guild,
            target,
            amount
        );

        return message.reply(
            `✅ ${target} değerine **+${formatValue(amount)}** eklendi.\n` +
            `💰 Yeni değer: **${formatValue(newValue)}**`
        );
    }

    if (
        command === "dsil" ||
        command === "degersil"
    ) {
        if (!isValueStaff(message)) {
            return message.reply("❌ Bu komutu sadece Değer Yetkilisi kullanabilir.");
        }

        const target = getMentionedMember(message);
        const amount = parseAmount(args.join(" "));

        if (!target || !Number.isFinite(amount) || amount <= 0) {
            return message.reply(
                "❌ Kullanım: `.dsil @oyuncu 5M`"
            );
        }

        const newValue = await subtractPlayerValue(
            message.guild,
            target,
            amount
        );

        return message.reply(
            `✅ ${target} değerinden **-${formatValue(amount)}** çıkarıldı.\n` +
            `💰 Yeni değer: **${formatValue(newValue)}**`
        );
    }

    if (
        command === "ant" ||
        command === "antrenman"
    ) {
        const channel = getChannel(
            message.guild,
            CHANNEL_IDS.antrenman,
            "antrenman"
        );

        if (!channel || message.channel.id !== channel.id) {
            return message.reply(
                `❌ Bu komut sadece ${channel || "#antrenman"} kanalında kullanılabilir.`
            );
        }

        const user = ensureUser(db, message.member);

        if (user.training < 5) {
            user.training++;
        }

        if (user.training >= 5) {
            user.training = 5;

            await addPlayerValue(
                message.guild,
                message.member,
                5
            );

            return message.reply(
                `🏋️ Antrenman tamamlandı!\n` +
                `📊 Seviye: **5/5**\n` +
                `💰 Oyuncu değerine **+5M€** eklendi.`
            );
        }

        saveDatabase();

        return message.reply(
            `🏋️ Antrenman ilerlemesi: **${user.training}/5**`
        );
    }

    if (
        command === "pen" ||
        command === "penalti"
    ) {
        const channel = getChannel(
            message.guild,
            CHANNEL_IDS.penalti,
            "penaltı"
        );

        if (!channel || message.channel.id !== channel.id) {
            return message.reply(
                `❌ Bu komut sadece ${channel || "#penaltı"} kanalında kullanılabilir.`
            );
        }

        const roll = Math.random() * 100;

        if (roll < 30) {
            await addPlayerValue(
                message.guild,
                message.member,
                5
            );

            return message.reply(
                "⚽ **GOL!**\n💰 Oyuncu değerine **+5M€** eklendi."
            );
        }

        if (roll < 60) {
            return message.reply(
                "🧤 **KURTARIŞ!**\nKaleci penaltıyı kurtardı."
            );
        }

        if (roll < 85) {
            return message.reply(
                "🥅 **DİREK!**\nTop direkten döndü."
            );
        }

        return message.reply(
            "🚩 **KORNER!**\nTop savunmadan dışarı çıktı."
        );
    }

    if (
        command === "butce" ||
        command === "bütçe"
    ) {
        const user = ensureUser(db, message.member);

        return message.reply(
            `💳 ${message.member}\n` +
            `💰 Bütçen: **${formatValue(user.budget)}**`
        );
    }

    if (
        command === "butceekle" ||
        command === "bütçeekle"
    ) {
        if (!isValueStaff(message)) {
            return message.reply("❌ Yetkin yok.");
        }

        const target = getMentionedMember(message);
        const amount = parseAmount(args.join(" "));

        if (!target || !Number.isFinite(amount) || amount <= 0) {
            return message.reply(
                "❌ Kullanım: `.bütçeekle @oyuncu 10M`"
            );
        }

        const user = ensureUser(db, target);

        user.budget += amount;

        saveDatabase();

        return message.reply(
            `✅ ${target} bütçesine **+${formatValue(amount)}** eklendi.\n` +
            `💳 Yeni bütçe: **${formatValue(user.budget)}**`
        );
    }

    if (
        command === "butcesil" ||
        command === "bütçesil"
    ) {
        if (!isValueStaff(message)) {
            return message.reply("❌ Yetkin yok.");
        }

        const target = getMentionedMember(message);
        const amount = parseAmount(args.join(" "));

        if (!target || !Number.isFinite(amount) || amount <= 0) {
            return message.reply(
                "❌ Kullanım: `.bütçesil @oyuncu 10M`"
            );
        }

        const user = ensureUser(db, target);

        user.budget = Math.max(
            0,
            user.budget - amount
        );

        saveDatabase();

        return message.reply(
            `✅ ${target} bütçesinden **-${formatValue(amount)}** çıkarıldı.\n` +
            `💳 Yeni bütçe: **${formatValue(user.budget)}**`
        );
    }

    if (
        command === "gonder" ||
        command === "gönder"
    ) {
        const target = getMentionedMember(message);
        const amount = parseAmount(args.join(" "));

        if (!target || !Number.isFinite(amount) || amount <= 0) {
            return message.reply(
                "❌ Kullanım: `.gönder @oyuncu 5M`"
            );
        }

        if (target.id === message.author.id) {
            return message.reply("❌ Kendine para gönderemezsin.");
        }

        const sender = ensureUser(db, message.member);
        const receiver = ensureUser(db, target);

        if (sender.budget < amount) {
            return message.reply("❌ Yeterli bütçen yok.");
        }

        sender.budget -= amount;
        receiver.budget += amount;

        saveDatabase();

        return message.reply(
            `✅ ${target} kullanıcısına **${formatValue(amount)}** gönderildi.`
        );
    }

    if (command === "kap") {
        const target = getMentionedMember(message);
        const teamRoles = getMentionedTeamRoles(message);

        const
